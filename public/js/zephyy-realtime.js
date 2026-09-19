/**
 * Zephyy Realtime — Firebase native listeners replacing all fetch/poll.
 *
 * Listens to RTDB via onValue/onChildAdded (persistent WebSocket under the hood).
 * Updates DOM directly — no polling, no setInterval data fetches.
 *
 * Covers: status, daily thought, service health, chat orb, and embed widget.
 *
 * STALENESS-BASED OFFLINE:
 *   Status includes lastHeartbeat (ISO timestamp, updated by systemd pinger every 60s).
 *   If lastHeartbeat > 120s old, status shows offline — no server-side "offline" write needed.
 */

(function () {
  'use strict';

  const RTDB_URL = 'https://doshusweb-default-rtdb.firebaseio.com';
  const STALE_SEC = 120; // seconds before heartbeat considered stale
  const HEARTBEAT_MS = STALE_SEC * 1000;
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

  function renderDailyFallback(moodEl, quoteEl, sourceEl, card) {
    if (moodEl) moodEl.textContent = '🌙';
    if (quoteEl) quoteEl.textContent = DAILY_FALLBACK;
    if (sourceEl) sourceEl.textContent = '';
    if (card) card.classList.add('loaded');
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

      setupConnectionMonitor();
      watchStatus();
      watchDaily();
      try {
        if (!firebase.auth) {
          await new Promise(function (resolve, reject) {
            const script = document.createElement('script');
            script.src = 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth-compat.js';
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
  // CONNECTION MONITOR
  // ──────────────────────────────────────────────

  function setupConnectionMonitor() {
    const connRef = db.ref('.info/connected');
    connRef.on('value', function (snap) {
      const connected = snap.val() === true;
      const dot = document.getElementById('zp-conn-dot');
      if (dot) {
        dot.className = connected ? 'zp-conn-dot live' : 'zp-conn-dot dead';
        dot.title = connected ? 'Firebase connected' : 'Firebase disconnected';
      }
    });
  }

  // ──────────────────────────────────────────────
  // STATUS WATCHER (status, services, and widget)
  // ──────────────────────────────────────────────

  function watchStatus() {
    const statusRef = db.ref('zephyy/status');

    // ── Random status messages ──
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

    statusRef.on('value', function (snap) {
      const data = snap.val() || {};
      const dot = document.getElementById('zp-status-dot');
      const text = document.getElementById('zp-status-text');

      // ── Staleness check: lastHeartbeat > STALE_SEC = offline ──
      const lastHb = data.lastHeartbeat ? new Date(data.lastHeartbeat).getTime() : 0;
      const isOnline = (Date.now() - lastHb) < HEARTBEAT_MS;

      const msgs = isOnline ? onlineMsgs : offlineMsgs;
      const msg = msgs[Math.floor(Math.random() * msgs.length)];

      if (text) { text.textContent = msg; }
      if (dot) {
        dot.className = 'zp-dot';
        dot.classList.add(isOnline ? 'online' : 'offline');
      }

      // ── Broadcast for profile + widget ──
      // Cache the latest value so scripts or HTMX fragments arriving later can hydrate.
      window.__zpLatestStatus = { online: isOnline, data: data };
      window.dispatchEvent(new CustomEvent('zephyy-status', {
        detail: window.__zpLatestStatus
      }));

      // ── Model badge ──
      var badge = document.getElementById('zp-model-badge');
      if (badge && (window.__zpLastReplyModel || data.chatModel)) {
        badge.textContent = window.__zpLastReplyModel || data.chatModel;
        badge.className = 'zp-model-badge';
        if (data.chatModel.toLowerCase().includes('fallback') ||
            data.chatModel.toLowerCase().includes('openrouter')) {
          badge.classList.add('fallback');
        }
      }

      // Service health dots
      if (data.services) {
        var map = { gateway: 'svc-dot-gateway', orb: 'svc-dot-orb', ws: 'svc-dot-ws', embed: 'svc-dot-embed', aether: 'svc-dot-aether' };
        Object.keys(map).forEach(function (key) {
          var dot = document.getElementById(map[key]);
          if (dot) dot.className = 'zp-service-dot ' + (data.services[key] === 'active' ? 'online' : 'offline');
        });
      }
    });
  }

  // ──────────────────────────────────────────────
  // DAILY THOUGHT WATCHER
  // ──────────────────────────────────────────────

  function watchDaily() {
    const dailyRef = db.ref('zephyy/daily');
    const moodEl = document.getElementById('daily-mood');
    const quoteEl = document.getElementById('daily-quote');
    const sourceEl = document.getElementById('daily-source');
    const card = document.getElementById('zephyy-daily');

    dailyRef.on('value', function (snap) {
      const data = snap.val();
      if (!isPublicDaily(data)) {
        renderDailyFallback(moodEl, quoteEl, sourceEl, card);
        return;
      }

      if (moodEl) moodEl.textContent = data.mood || '🌌';
      if (quoteEl) quoteEl.textContent = data.quote;
      if (sourceEl) {
        const date = data.updated ? new Date(data.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        sourceEl.textContent = date ? '· ' + date : '';
      }
      if (card) card.classList.add('loaded');
    });
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
    db.ref('zephyy/status').on('value', function (snap) {
      const data = snap.val() || {};
      window.dispatchEvent(new CustomEvent('zephyy-online-change', {detail: {
        online: Boolean(data.lastHeartbeat && Date.now() - Date.parse(data.lastHeartbeat) < HEARTBEAT_MS)
      }}));
    });
    bind(id);
  }

  // ──────────────────────────────────────────────
  // FALLBACKS (when Firebase SDK unavailable)
  // ──────────────────────────────────────────────

  function initFallbacks() {
    // Direct fetch fallback — render status/daily even without Firebase SDK
    console.warn('[zephyy-rt] No Firebase SDK — using direct fetch fallback');

    // Status
    fetch(RTDB_URL + '/zephyy/status.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var dot = document.getElementById('zp-status-dot');
        var text = document.getElementById('zp-status-text');
        if (text && data) {
          var lastHb = data.lastHeartbeat ? new Date(data.lastHeartbeat).getTime() : 0;
          var online = (Date.now() - lastHb) < HEARTBEAT_MS;
          text.textContent = online ? 'Online — Ready when you are.' : 'Offline — The stars are quiet.';
          if (dot) { dot.className = 'zp-dot ' + (online ? 'online' : 'offline'); }
        }
      }).catch(function(){});

    // Daily thought
    fetch(RTDB_URL + '/zephyy/daily.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var quoteEl = document.getElementById('daily-quote');
        var sourceEl = document.getElementById('daily-source');
        var moodEl = document.getElementById('daily-mood');
        var card = document.getElementById('zephyy-daily');
        if (quoteEl && isPublicDaily(data)) {
          if (moodEl) moodEl.textContent = data.mood || '🌌';
          quoteEl.textContent = data.quote;
          if (sourceEl) {
            var date = data.updated ? new Date(data.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
            sourceEl.textContent = date ? '· ' + date : '';
          }
          if (card) card.classList.add('loaded');
        } else {
          renderDailyFallback(moodEl, quoteEl, sourceEl, card);
        }
      }).catch(function(){});

    // Service health indicators (from RTDB status)
    fetch(RTDB_URL + '/zephyy/status.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data || !data.services) return;
        var svcs = data.services;
        var map = { gateway: 'svc-dot-gateway', orb: 'svc-dot-orb', ws: 'svc-dot-ws', embed: 'svc-dot-embed', aether: 'svc-dot-aether' };
        Object.keys(map).forEach(function(key) {
          var dot = document.getElementById(map[key]);
          if (dot) {
            dot.className = 'zp-service-dot ' + (svcs[key] === 'active' ? 'online' : 'offline');
          }
        });
      }).catch(function(){});
  }

  // ──────────────────────────────────────────────
  // ENTRY
  // ──────────────────────────────────────────────

  var initAttempts = 0;
  var MAX_ATTEMPTS = 15;

  function tryInit() {
    initAttempts++;
    if (typeof firebase === 'undefined') {
      if (initAttempts < MAX_ATTEMPTS) {
        console.log('[zephyy-rt] Firebase SDK not loaded yet, retrying (' + initAttempts + '/' + MAX_ATTEMPTS + ')');
        setTimeout(tryInit, 400);
      } else {
        console.warn('[zephyy-rt] Firebase SDK failed to load after ' + MAX_ATTEMPTS + ' attempts — falling back');
        initFallbacks();
      }
      return;
    }
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(tryInit, 200);
    });
  } else {
    setTimeout(tryInit, 200);
  }

  // Register chat orb setup — called by init() after db is ready
  window.__zpChatInit = setupChatOrb;
})();
