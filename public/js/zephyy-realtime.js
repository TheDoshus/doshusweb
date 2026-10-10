/**
 * Zephyy Realtime — Firebase native listeners replacing all fetch/poll.
 *
 * Listens to RTDB via onValue/onChildAdded (persistent WebSocket under the hood).
 * Updates DOM directly — no polling, no setInterval data fetches.
 *
 * Covers: status, daily thought, service health, chat orb, and embed widget. Every page that
 * shows Zephyy's status listens for the events this file sends instead of reading Firebase
 * itself: 'zephyy-status' {online, data} (also kept in window.__zpLatestStatus),
 * 'zephyy-online-change' {online} and 'zephyy-connection' {connected}.
 *
 * STALENESS-BASED OFFLINE:
 *   Status includes lastHeartbeat (ISO timestamp, updated by systemd pinger every 60s).
 *   If lastHeartbeat > 120s old, status shows offline — no server-side "offline" write needed.
 *   STALE_SEC is the one threshold every surface uses.
 */

(function () {
  'use strict';

  const RTDB_URL = 'https://doshusweb-default-rtdb.firebaseio.com';
  const STALE_SEC = 120; // seconds before heartbeat considered stale
  const HEARTBEAT_MS = STALE_SEC * 1000;
  const FALLBACK_POLL_MS = 300000; // without the SDK, status is re-fetched every 5 min
  const DAILY_FALLBACK = 'Quiet orbit. Keeping the signal clean.';
  const PRIVATE_DAILY_PATTERN = /\b(?:doshus|armand|austin|school|class|course|canvas|assignment|exam|shift|amazon|message|texted|health|medication|doctor|finance|bank|schedule|relationship|partner|girlfriend|boyfriend|family|address|location|phoenix)\b/i;

  let db = null;

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

  // One status reading, from the live listener or the fallback fetch: the orb's status line,
  // the model badge and service dots, then the events every other surface listens for
  function publish(data) {
    data = data || {};
    const lastHb = data.lastHeartbeat ? new Date(data.lastHeartbeat).getTime() : 0;
    const isOnline = (Date.now() - lastHb) < HEARTBEAT_MS;

    const dot = document.getElementById('zp-status-dot');
    const text = document.getElementById('zp-status-text');
    const msgs = isOnline ? onlineMsgs : offlineMsgs;
    if (text) text.textContent = msgs[Math.floor(Math.random() * msgs.length)];
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
    window.dispatchEvent(new CustomEvent('zephyy-online-change', { detail: { online: isOnline } }));
  }

  // ──────────────────────────────────────────────
  // INIT
  // ──────────────────────────────────────────────

  async function init() {
    if (typeof firebase === 'undefined') {
      console.warn('[zephyy-rt] Firebase SDK not loaded — falling back to fetch');
      initFallbacks();
      return;
    }
    try {
      const response = await fetch('/__/firebase/init.json');
      if (!response.ok) throw new Error('Firebase configuration unavailable');
      firebase.initializeApp(await response.json());
      db = firebase.database();

      db.ref('.info/connected').on('value', function (snap) {
        window.dispatchEvent(new CustomEvent('zephyy-connection', { detail: { connected: snap.val() === true } }));
      });
      db.ref('zephyy/status').on('value', function (snap) { publish(snap.val()); });
      if (document.getElementById('zephyy-daily')) db.ref('zephyy/daily').on('value', function (snap) { renderDaily(snap.val()); });
      try {
        if (!firebase.auth) {
          await new Promise(function (resolve, reject) {
            const script = document.createElement('script');
            script.src = 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth-compat.js';
            // Pinned like the app and database SDKs the pages load (same version, same check)
            script.integrity = 'sha384-qPmeVjQDHzUDQlO1KgrSi2azIff7RQim//zsE3kkA2HKGuZhlhpap6Cab0xfKSXi';
            script.crossOrigin = 'anonymous';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }
        const credential = await firebase.auth().signInAnonymously();
        if (window.__zpChatInit) window.__zpChatInit(db, credential.user.uid);
      } catch (error) {
        window.dispatchEvent(new CustomEvent('zephyy-chat-error', {
          detail: {message: 'Private chat could not connect. Please refresh or try again later.'}
        }));
      }

      // Signal widget that Firebase is ready
      window.dispatchEvent(new CustomEvent('zephyy-rt-ready', { detail: { db } }));
    } catch (e) {
      console.warn('[zephyy-rt] Firebase init failed:', e.message);
      initFallbacks();
    }
  }

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
      get msgsRef() { return messages; },
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
  // FALLBACKS (when Firebase SDK unavailable)
  // ──────────────────────────────────────────────

  function initFallbacks() {
    // Direct fetch fallback — render status/daily even without Firebase SDK
    console.warn('[zephyy-rt] No Firebase SDK — using direct fetch fallback');
    const read = function (path) {
      return fetch(RTDB_URL + '/zephyy/' + path + '.json').then(function (r) { return r.json(); });
    };
    const status = function () { read('status').then(publish).catch(function () {}); };
    status();
    setInterval(status, FALLBACK_POLL_MS);
    if (document.getElementById('zephyy-daily')) read('daily').then(renderDaily).catch(function () { renderDaily(null); });
  }

  // ──────────────────────────────────────────────
  // ENTRY
  // ──────────────────────────────────────────────

  // After the page's own scripts (the Firebase SDK and chat.js load ahead of this point)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 200); });
  } else {
    setTimeout(init, 200);
  }

  // Register chat orb setup — called by init() after db is ready
  window.__zpChatInit = setupChatOrb;
})();
