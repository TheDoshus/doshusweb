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

  function init() {
    if (typeof firebase === 'undefined') {
      console.warn('[zephyy-rt] Firebase SDK not loaded — falling back to fetch');
      initFallbacks();
      return;
    }
    try {
      firebase.initializeApp({
        databaseURL: RTDB_URL,
        projectId: 'doshusweb'
      });
      db = firebase.database();
      console.log('[zephyy-rt] Firebase connected');

      setupConnectionMonitor();
      watchStatus();
      watchDaily();
      if (window.__zpChatInit) window.__zpChatInit(db);

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
      if (badge && data.chatModel) {
        badge.textContent = data.chatModel;
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

  function setupChatOrb(db) {
    const SESSION_KEY = 'zephyy-chat-session';

    function newSessionId() {
      // Unguessable UUID — the session ID doubles as the read capability
      // under the RTDB rules, so entropy matters.
      return crypto.randomUUID ? crypto.randomUUID() :
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          var r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    let sessionId = localStorage.getItem(SESSION_KEY) || newSessionId();
    let msgsRef = null;
    let controlRef = null;
    let _sessionEnded = false;

    // ── Control watcher (session end, etc.) ──
    function attachControlWatcher() {
      controlRef.on('value', function (snap) {
        const ctrl = snap.val() || {};
        if (ctrl.state === 'ended') {
          _sessionEnded = true;
          window.dispatchEvent(new CustomEvent('zephyy-session-ended', { detail: ctrl }));
          return;
        }
        // Forward full control state (typing, lastSeen, …) — widget features
        // no-op gracefully until the orb starts writing these fields.
        window.dispatchEvent(new CustomEvent('zephyy-ctrl', { detail: ctrl }));
      });
    }

    // ── Session (re)bind — the single owner of session lifecycle.
    //    Detaches old listeners, swaps refs, reattaches. Restart flows call
    //    resetSession() below instead of doing localStorage surgery. ──
    function bindSession(id) {
      if (msgsRef) msgsRef.off();
      if (controlRef) controlRef.off();
      sessionId = id;
      localStorage.setItem(SESSION_KEY, id);
      msgsRef = db.ref('zephyy/chat/sessions/' + id + '/messages');
      controlRef = db.ref('zephyy/chat/sessions/' + id + '/control');
      _sessionEnded = false;
      attachControlWatcher();
      startMessageListener();
      // Tell the orb which page the visitor is on (fail-silent; rules cap 64 chars)
      try {
        db.ref('zephyy/chat/sessions/' + id + '/meta/page')
          .set(String(window.location.pathname).slice(0, 64))
          .catch(function () {});
      } catch (e) { /* no-op */ }
      // Link a previously claimed visitor identity to the new session.
      try {
        const visitorId = localStorage.getItem('zp-visitor-id');
        if (visitorId) {
          db.ref('zephyy/chat/sessions/' + id + '/meta/visitor')
            .set(visitorId)
            .catch(function () {});
        }
      } catch (e) { /* no-op */ }
      if (window.__zpRealtime) {
        window.__zpRealtime.sessionId = sessionId;
        window.__zpRealtime.msgsRef = msgsRef;
        window.__zpRealtime.controlRef = controlRef;
      }
    }

    // ── Status watcher (online/offline for chat input) ──
    const statusRef = db.ref('zephyy/status');
    statusRef.on('value', function (snap) {
      const data = snap.val() || {};
      const isOnline = data.lastHeartbeat
        ? (Date.now() - new Date(data.lastHeartbeat).getTime()) < HEARTBEAT_MS
        : false;
      window.dispatchEvent(new CustomEvent('zephyy-online-change', {
        detail: { online: isOnline }
      }));
    });

    // ── Message watcher (replaces polling) ──
    function startMessageListener() {
      var lastKey = null;

      // Use on('value') instead of child_added — more reliable for deeply nested paths
      msgsRef.on('value', function (snap) {
        if (!snap.exists()) return;
        var data = snap.val();
        var keys = Object.keys(data).sort();
        if (!keys.length) return;

        // Only process the last message if it's new
        var newestKey = keys[keys.length - 1];
        if (newestKey === lastKey) return; // already processed
        lastKey = newestKey;

        var msg = data[newestKey];
        if (!msg || !msg.content) return;

        // Only forward assistant/bot/doshus messages
        if (msg.role === 'assistant' || msg.role === 'bot' || msg.role === 'doshus') {
          window.dispatchEvent(new CustomEvent('zephyy-msg', {
            detail: { key: newestKey, role: msg.role, content: msg.content, timestamp: msg.timestamp }
          }));
        }
      });
    }

    // ── Expose for initial history load ──
    function loadHistory(limit) {
      return msgsRef.limitToLast(limit || 50).once('value');
    }

    // Expose API for zephyy.js chat orb (sessionId/refs kept live by bindSession)
    window.__zpRealtime = {
      sessionId: null,
      msgsRef: null,
      controlRef: null,
      loadHistory: loadHistory,
      resetSession: function () {
        bindSession(newSessionId());
        return sessionId;
      },
      get sessionEnded() { return _sessionEnded; },
      set sessionEnded(v) { _sessionEnded = v; },
    };

    bindSession(sessionId);
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
