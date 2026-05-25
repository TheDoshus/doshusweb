/**
 * Zephyy Realtime — Firebase native listeners replacing all fetch/poll.
 *
 * Listens to RTDB via onValue/onChildAdded (persistent WebSocket under the hood).
 * Updates DOM directly — no polling, no setInterval data fetches.
 *
 * Covers: status dot, daily thought, realm section, chat orb, embed widget.
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
  const CHAT_BUFFER_MS = 15000; // 15s lookback for new messages

  let db = null;
  let ready = false;

  // ── Track registered disposers for cleanup ──
  const disposers = [];

  function dispose(fn) {
    disposers.push(fn);
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
      ready = true;
      console.log('[zephyy-rt] Firebase connected');

      setupConnectionMonitor();
      watchStatus();
      watchDaily();
      watchRealm();
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
  // STATUS WATCHER (status dot + terminal + widget)
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

      // ── Terminal status line ──
      if (window.__zpTermStatus) {
        window.__zpTermStatus.output = isOnline
          ? '<span class="success">● ONLINE</span> — ' + (data.workingOn || 'Standing by.')
          : '<span class="error">● OFFLINE</span> — The stars are quiet.';
      }

      // ── Broadcast for widget ──
      window.dispatchEvent(new CustomEvent('zephyy-status', {
        detail: { online: isOnline, data: data }
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
      if (!data || !data.quote) {
        // Fallback
        if (quoteEl && quoteEl.textContent === 'Loading...') {
          quoteEl.textContent = '"The stars are always there. Sometimes we just need to look up."';
          if (sourceEl) sourceEl.textContent = '— Zephyy';
          if (moodEl) moodEl.textContent = '🌙';
          if (card) card.classList.add('loaded');
        }
        return;
      }

      if (moodEl) moodEl.textContent = data.mood || '🌌';
      quoteEl.textContent = data.quote;
      if (sourceEl) sourceEl.textContent = data.source || '';
      if (card) card.classList.add('loaded');
    });
  }

  // ──────────────────────────────────────────────
  // REALM SECTION (now + last)
  // ──────────────────────────────────────────────

  function watchRealm() {
    const nowEl = document.querySelector('#zf-now .zp-live-text');
    const lastEl = document.querySelector('#zf-last .zp-live-text');
    const thinkEl = document.getElementById('thinking-text');

    // ── Status-driven "Now" ──
    const statusRef = db.ref('zephyy/status');
    statusRef.on('value', function (snap) {
      const data = snap.val() || {};
      const isOnline = data.lastHeartbeat
        ? (Date.now() - new Date(data.lastHeartbeat).getTime()) < HEARTBEAT_MS
        : false;

      if (nowEl) {
        if (isOnline && data.mood) {
          nowEl.textContent = data.mood + ' — ' + (data.workingOn || 'Standing by');
        } else if (isOnline) {
          nowEl.textContent = 'Active — Systems nominal.';
        } else {
          nowEl.textContent = 'Monitoring the cosmos.';
        }
      }

      if (thinkEl && data.workingOn) {
        thinkEl.textContent = data.workingOn;
      }
    });

    // ── Daily-driven "Last" ──
    const dailyRef = db.ref('zephyy/daily');
    dailyRef.on('value', function (snap) {
      const data = snap.val();
      if (!data || !lastEl) return;

      if (data.updated) {
        const updated = new Date(data.updated);
        const ago = timeAgo(updated);
        lastEl.textContent = 'Last thought: ' + ago;
      }
    });
  }

  // ──────────────────────────────────────────────
  // CHAT ORB (replaces pollAndDetect + checkControl)
  // ──────────────────────────────────────────────

  function setupChatOrb(db) {
    const SESSION_KEY = 'zephyy-chat-session';
    let sessionId = localStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = crypto.randomUUID ? crypto.randomUUID() :
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          var r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
      localStorage.setItem(SESSION_KEY, sessionId);
    }

    const msgsRef = db.ref('zephyy/chat/sessions/' + sessionId + '/messages');
    const controlRef = db.ref('zephyy/chat/sessions/' + sessionId + '/control');

    // ── Control watcher (session end, etc.) ──
    let _sessionEnded = false;
    controlRef.on('value', function (snap) {
      const ctrl = snap.val() || {};
      if (ctrl.state === 'ended') {
        _sessionEnded = true;
        window.dispatchEvent(new CustomEvent('zephyy-session-ended', { detail: ctrl }));
      }
    });

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
      const now = Date.now();
      const query = msgsRef.orderByChild('timestamp').startAt(now - CHAT_BUFFER_MS);

      query.on('child_added', function (snap) {
        const msg = snap.val();
        if (!msg || !msg.content) return;

        // Session end signal
        if (msg.role === 'system' && msg.content === '_SESSION_ENDED_') {
          _sessionEnded = true;
          window.dispatchEvent(new CustomEvent('zephyy-session-ended', { detail: {} }));
          return;
        }

        // Only forward assistant/bot/doshus messages (user messages rendered locally)
        if (msg.role === 'assistant' || msg.role === 'bot' || msg.role === 'doshus') {
          window.dispatchEvent(new CustomEvent('zephyy-msg', {
            detail: { key: snap.key, role: msg.role, content: msg.content, timestamp: msg.timestamp }
          }));
        }
      });
    }

    // ── Expose for initial history load ──
    function loadHistory(limit) {
      return msgsRef.orderByChild('timestamp').limitToLast(limit || 50).once('value');
    }

    startMessageListener();

    // Expose API for zephyy.js chat orb
    window.__zpRealtime = {
      sessionId: sessionId,
      msgsRef: msgsRef,
      controlRef: controlRef,
      loadHistory: loadHistory,
      get sessionEnded() { return _sessionEnded; },
      set sessionEnded(v) { _sessionEnded = v; },
    };
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
        if (quoteEl && data && data.quote) {
          if (moodEl) moodEl.textContent = data.mood || '🌌';
          quoteEl.textContent = data.quote;
          if (sourceEl) sourceEl.textContent = data.source || '';
          if (card) card.classList.add('loaded');
        }
      }).catch(function(){});
  }

  // ──────────────────────────────────────────────
  // UTILS
  // ──────────────────────────────────────────────

  function timeAgo(date) {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    if (hrs < 24) return hrs + 'h ago';
    return days + 'd ago';
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

  // Cleanup on page unload
  window.addEventListener('beforeunload', function () {
    disposers.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
  });
})();
