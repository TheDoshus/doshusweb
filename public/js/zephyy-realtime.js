/**
 * Zephyy Realtime — her status and daily thought, live, and the chat's Firebase connection.
 *
 * Her status streams straight from the database's REST endpoint (Server-Sent Events): live,
 * with no SDK; the daily thought is one read. The Firebase SDK (~340 KB of script) loads only
 * for the chat, through window.__zpConnect() when it's needed, or at once for a visitor with a
 * conversation going, so her replies still light the orb.
 *
 * Every page that shows Zephyy's status listens for the events this file sends instead of
 * reading Firebase itself: 'zephyy-status' {online, data} (also kept in
 * window.__zpLatestStatus) and 'zephyy-connection' {connected}.
 *
 * STALENESS-BASED OFFLINE:
 *   Status includes lastHeartbeat (ISO timestamp, updated by systemd pinger every 60s).
 *   If lastHeartbeat > 120s old, status shows offline — no server-side "offline" write needed,
 *   and a pinger that falls silent turns the page offline too. STALE_SEC is the one threshold
 *   every surface uses.
 */

(function () {
  'use strict';

  const RTDB_URL = 'https://doshusweb-default-rtdb.firebaseio.com';
  const STALE_SEC = 120; // seconds before heartbeat considered stale
  const HEARTBEAT_MS = STALE_SEC * 1000;
  const DAILY_FALLBACK = 'Quiet orbit. Keeping the signal clean.';
  const PRIVATE_DAILY_PATTERN = /\b(?:doshus|armand|austin|school|class|course|canvas|assignment|exam|shift|amazon|message|texted|health|medication|doctor|finance|bank|schedule|relationship|partner|girlfriend|boyfriend|family|address|location|phoenix)\b/i;
  // The chat's SDK, pinned like every other script here: one version, checked against these hashes
  const SDK = 'https://www.gstatic.com/firebasejs/11.0.0/firebase-';
  const SDK_HASH = {
    app: 'sha384-WCNi5HrUqYpPiERhOGB000a3XlerI8Hq52+uTGtzyl/ZFU/LmuVx+lqA1cYJnEkq',
    database: 'sha384-hb6zQWOUCteeQSkZPIVwI6sr/1arrQrsb0xv1fevRvO58hDu2d617rC8afnX3jCv',
    auth: 'sha384-qPmeVjQDHzUDQlO1KgrSi2azIff7RQim//zsE3kkA2HKGuZhlhpap6Cab0xfKSXi',
  };

  function isPublicDaily(data) {
    const publicText = data ? [data.mood, data.quote].join(' ') : '';
    return Boolean(
      data &&
      data.publicSafe === true &&
      typeof data.quote === 'string' &&
      data.quote.trim() &&
      !Object.prototype.hasOwnProperty.call(data, 'source') &&
      !PRIVATE_DAILY_PATTERN.test(publicText)
    );
  }

  // The daily thought card (profile only): a public-safe quote, or the quiet fallback line
  function renderDaily(data) {
    const card = document.getElementById('zephyy-daily');
    if (!card) return;
    const moodEl = document.getElementById('daily-mood');
    const quoteEl = document.getElementById('daily-quote');
    const sourceEl = document.getElementById('daily-source');
    const show = isPublicDaily(data);
    if (moodEl) moodEl.textContent = show ? data.mood || '🌌' : '🌙';
    if (quoteEl) quoteEl.textContent = show ? data.quote : DAILY_FALLBACK;
    if (sourceEl) {
      const date = show && data.updated ? new Date(data.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      sourceEl.textContent = date ? '· ' + date : '';
    }
    card.classList.add('loaded');
  }

  const onlineMsgs = [
    'Online — Ready when you are.',
    'Awake and watching the stars.',
    'In the flow. Reach out.',
    'Present. 🌌',
    'Systems nominal. Co-pilot standing by.',
    'Floating in orbit. Say hi.',
    'Online — All sectors clear.',
  ];
  const offlineMsgs = [
    'Offline — The stars are quiet.',
    'Away for now. Leave a thought.',
    'Dreaming in stardust.',
    'Not here at the moment.',
    'Powering down...',
    'Offline. Catch you later.',
    'The dashboard sleeps. 🔮',
  ];
  const SERVICES = { gateway: 'svc-dot-gateway', orb: 'svc-dot-orb', ws: 'svc-dot-ws', embed: 'svc-dot-embed', aether: 'svc-dot-aether' };

  // One status reading, from the stream or a direct read: the orb's status line (a new one only
  // when she comes or goes), the model badge and service dots, then the event every surface hears
  const fresh = function (data) { return Date.now() - (data.lastHeartbeat ? new Date(data.lastHeartbeat).getTime() : 0) < HEARTBEAT_MS; };
  function publish(data) {
    data = data || {};
    const isOnline = data.online !== false && fresh(data); // a fresh beat, unless the rig said it's going offline
    const before = window.__zpLatestStatus;

    const dot = document.getElementById('zp-status-dot');
    const text = document.getElementById('zp-status-text');
    const msgs = isOnline ? onlineMsgs : offlineMsgs;
    if (text && (!before || before.online !== isOnline)) text.textContent = msgs[Math.floor(Math.random() * msgs.length)];
    if (dot) dot.className = 'zp-dot ' + (isOnline ? 'online' : 'offline');

    const model = window.__zpLastReplyModel || data.chatModel;
    const badge = document.getElementById('zp-model-badge');
    if (badge && model) {
      badge.textContent = model;
      badge.className = 'zp-model-badge';
      if (/fallback|openrouter/i.test(data.chatModel || '')) badge.classList.add('fallback');
    }

    if (data.services) {
      Object.keys(SERVICES).forEach(function (key) {
        const serviceDot = document.getElementById(SERVICES[key]);
        if (serviceDot) serviceDot.className = 'zp-service-dot ' + (data.services[key] === 'active' ? 'online' : 'offline');
      });
    }

    // Cached so scripts or HTMX fragments arriving later can hydrate
    window.__zpLatestStatus = { online: isOnline, data: data };
    window.dispatchEvent(new CustomEvent('zephyy-status', { detail: window.__zpLatestStatus }));
  }

  // ──────────────────────────────────────────────
  // INIT
  // ──────────────────────────────────────────────

  const read = function (path) { return fetch(RTDB_URL + '/zephyy/' + path + '.json').then(function (r) { return r.json(); }); };

  // One database path, live: Firebase sends its whole value first (a 'put' at /), then each
  // change as a 'put' (replace) or 'patch' (merge) at a sub-path, null meaning gone. The stream
  // closes while the tab is hidden (a browser allows each host only a few open connections) and
  // reopens, whole value first, when it's back. After an HTTP error, which the browser won't
  // retry on its own, a fresh stream follows a little later
  function stream(path, render, on) {
    let value = null;
    let source = null;
    const prune = function (node) {
      if (node && typeof node === 'object') Object.keys(node).forEach(function (k) { if (node[k] === null) delete node[k]; else prune(node[k]); });
      return node;
    };
    const apply = function (merge) {
      return function (event) {
        const change = JSON.parse(event.data);
        const keys = change.path.split('/').filter(Boolean);
        const set = function (node, i) {
          if (i === keys.length) return merge ? Object.assign({}, node, change.data) : change.data;
          return Object.assign({}, node, { [keys[i]]: set(node && node[keys[i]], i + 1) });
        };
        value = prune(set(value, 0));
        on.heard();
        render(value);
      };
    };
    const closed = function () { return source.readyState === 2 && !document.hidden; };
    const open = function () {
      source = new EventSource(RTDB_URL + '/zephyy/' + path + '.json');
      source.addEventListener('put', apply(false));
      source.addEventListener('patch', apply(true));
      source.addEventListener('keep-alive', on.heard);
      source.onopen = on.open;
      source.onerror = function () {
        on.error();
        if (closed()) setTimeout(function () { if (closed()) open(); }, 10000);
      };
    };
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) source.close();
      else if (source.readyState === 2) open();
    });
    open();
  }

  function init() {
    let heard = 0; // when the status stream last brought anything, keep-alives included
    const connected = function (on) { window.dispatchEvent(new CustomEvent('zephyy-connection', { detail: { connected: on } })); };
    stream('status', publish, {
      open: function () { connected(true); },
      error: function () {
        connected(false);
        if (!window.__zpLatestStatus) publish(null); // never reached: show her offline rather than nothing
      },
      heard: function () { heard = Date.now(); },
    });
    // A quiet stream (a proxy can hold one back) gets a direct read instead; a live one bringing no
    // news means her pinger fell silent, so the last reading turns her offline once it's stale
    setInterval(function () {
      const last = window.__zpLatestStatus;
      if (document.hidden) return;
      if (Date.now() - heard > HEARTBEAT_MS * 0.75) read('status').then(publish).catch(function () {});
      else if (last && last.online && !fresh(last.data)) publish(last.data);
    }, HEARTBEAT_MS / 4);
    // The daily thought changes once a day: one read is enough
    if (document.getElementById('zephyy-daily')) read('daily').then(renderDaily).catch(function () { renderDaily(null); });
    // A conversation going (zephyy-chat.js keeps it): connect now, so her replies light the orb
    if (window.zephyyHasConvo?.()) window.__zpConnect().catch(function () {});
  }

  // One SDK script, loaded once however often the chat retries
  function load(name) {
    if (typeof firebase !== 'undefined' && (name === 'app' || firebase[name])) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      const script = Object.assign(document.createElement('script'), { src: SDK + name + '-compat.js', integrity: SDK_HASH[name], crossOrigin: 'anonymous' });
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // The chat's connection: the SDK, an anonymous sign-in and the visitor's private session, made
  // the first time anything asks. Resolves with window.__zpRealtime; after a failure the next ask
  // tries again (the chat tells the visitor where they're looking)
  let connecting = null;
  window.__zpConnect = function () {
    connecting = connecting || load('app')
      .then(function () { return Promise.all([load('database'), load('auth'), fetch('/__/firebase/init.json')]); })
      .then(function (loaded) {
        if (!loaded[2].ok) throw new Error('Firebase configuration unavailable');
        return loaded[2].json();
      })
      .then(function (config) {
        if (!firebase.apps.length) firebase.initializeApp(config);
        return firebase.auth().signInAnonymously();
      })
      .then(function (credential) {
        setupChatOrb(firebase.database(), credential.user.uid);
        return window.__zpRealtime;
      })
      .catch(function (error) { connecting = null; throw error; });
    return connecting;
  };

  // ──────────────────────────────────────────────
  // CHAT ORB (replaces pollAndDetect + checkControl)
  // ──────────────────────────────────────────────

  function setupChatOrb(db, owner) {
    const root = 'zephyy/chat/ownedSessions/';
    const storageKey = 'zephyy-owned-session-' + owner;
    let id = localStorage.getItem(storageKey) || crypto.randomUUID();
    let messages = null;
    let control = null;
    let messageQuery = null;
    let ready = Promise.resolve();
    let ended = false;
    let generation = 0;
    const stamp = firebase.database.ServerValue.TIMESTAMP;
    function problem() {
      window.dispatchEvent(new CustomEvent('zephyy-chat-error', {
        detail: {message: 'Private chat could not connect. Please refresh.'}
      }));
    }
    function bind(next) {
      if (messageQuery) messageQuery.off();
      if (control) control.off();
      const current = ++generation;
      id = next;
      localStorage.setItem(storageKey, id);
      messages = db.ref(root + id + '/messages');
      control = db.ref(root + id + '/control');
      const ownMessages = messages;
      const ownControl = control;
      ended = false;
      ready = db.ref(root + id).once('value').then(function (snap) {
        if (!snap.exists()) return db.ref(root + next).set({owner: owner,
          updatedAt: stamp, meta: {page: String(window.location.pathname).slice(0, 64)}});
        if (snap.val().owner !== owner) throw new Error('Owner mismatch');
        return db.ref(root + next + '/meta/page').set(String(window.location.pathname).slice(0, 64));
      }).then(function () {
        if (current !== generation) return;
        ownControl.on('value', function (snap) {
          if (current !== generation) return;
          const value = snap.val() || {};
          if (value.state === 'ended') {
            ended = true;
            window.dispatchEvent(new CustomEvent('zephyy-session-ended', {detail: value}));
          } else {
            window.dispatchEvent(new CustomEvent('zephyy-ctrl', {detail: value}));
          }
        }, problem);
        const seen = new Set();
        messageQuery = ownMessages.orderByChild('timestamp').limitToLast(50);
        messageQuery.on('value', function (snap) {
          if (current !== generation) return;
          const data = snap.val() || {};
          for (const key of seen) if (!Object.prototype.hasOwnProperty.call(data, key)) seen.delete(key);
          Object.keys(data).sort(function (a, b) {
            return (data[a].timestamp - data[b].timestamp) || a.localeCompare(b);
          }).forEach(function (key) {
            if (seen.has(key)) return;
            seen.add(key);
            const message = data[key];
            if (message && message.role === 'assistant' && message.content) {
              if (message.model) window.__zpLastReplyModel = message.model;
              window.dispatchEvent(new CustomEvent('zephyy-msg', {
                detail: Object.assign({key: key}, message)
              }));
            }
          });
        }, problem);
      });
      ready.catch(problem);
    }
    window.__zpRealtime = {
      get sessionId() { return id; },
      get controlRef() { return control; },
      get sessionEnded() { return ended; },
      set sessionEnded(value) { ended = value; },
      loadHistory: function (limit) {
        const current = generation;
        return ready.then(function () {
          if (current !== generation) throw new Error('Session changed');
          return messages.orderByChild('timestamp').limitToLast(limit || 50).once('value');
        });
      },
      sendMessage: function (text) {
        if (!text.trim() || text.length > 2000) return Promise.reject(new Error('Message must be 1–2000 characters'));
        const target = id;
        return ready.then(function () {
          if (target !== id || ended) throw new Error('Session changed');
          const key = messages.push().key;
          const updates = {updatedAt: stamp};
          updates['messages/' + key] = {role: 'user', content: text, timestamp: stamp};
          return db.ref(root + target).update(updates);
        });
      },
      resetSession: function () { bind(crypto.randomUUID()); return id; }
    };
    bind(id);
  }

  // ──────────────────────────────────────────────
  // ENTRY
  // ──────────────────────────────────────────────

  // After the page's own scripts (chat.js loads after this file and listens for its events)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
