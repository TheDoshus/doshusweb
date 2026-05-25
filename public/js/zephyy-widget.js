/* ─── ZEPHYY ONLINE STATUS WIDGET ───
 * Vanilla JS — renders the dual-vortex glyph + status badge.
 * Listens for realtime status from zephyy-realtime.js (Firebase onValue).
 * Falls back to 5-min polling if Firebase module isn't loaded.
 *
 * Usage:
 *   <div class="zephyy-badge-embed" data-compact="false"></div>
 *   <script src="/js/zephyy-widget.js"></script>
 */

(function () {
  'use strict';

  const STALE_MS = 120 * 1000; // heartbeat staleness threshold
  const FALLBACK_POLL_MS = 300000; // 5-min fallback if Firebase unavailable
  const RTDB_URL = 'https://doshusweb-default-rtdb.firebaseio.com';

  // ─── Dual-vortex glyph SVG ───
  function glyphSVG() {
    return `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="zg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="oklch(var(--brand-teal))" />
          <stop offset="100%" stop-color="oklch(var(--brand-purple))" />
        </linearGradient>
      </defs>
      <g class="glyph-left">
        <path d="M11 6 C14 6, 16 10, 14 14 C12 18, 8 20, 7 16 C6 12, 9 9, 11 8 C13 7, 15 9, 15 12"
          stroke="url(#zg)" stroke-width="0.6" fill="none" stroke-linecap="round" opacity="0.9" />
        <circle cx="11" cy="7" r="0.6" fill="oklch(var(--brand-teal))" opacity="0.7" />
      </g>
      <g class="glyph-right">
        <path d="M21 6 C18 6, 16 10, 18 14 C20 18, 24 20, 25 16 C26 12, 23 9, 21 8 C19 7, 17 9, 17 12"
          stroke="url(#zg)" stroke-width="0.6" fill="none" stroke-linecap="round" opacity="0.9" />
        <circle cx="21" cy="7" r="0.6" fill="oklch(var(--brand-purple))" opacity="0.7" />
      </g>
      <circle cx="16" cy="16" r="1" fill="oklch(var(--brand-teal))" opacity="0.8" class="glyph-pulse" />
    </svg>`;
  }

  // ─── Parse status from RTDB data ───
  function parseStatus(data) {
    if (!data) return { online: false, mood: 'offline', workingOn: '' };
    const lastHb = data.lastHeartbeat ? new Date(data.lastHeartbeat).getTime() : 0;
    return {
      online: (Date.now() - lastHb) < STALE_MS,
      mood: data.mood || 'idle',
      workingOn: data.workingOn || 'Standing by',
      lastUpdated: data.lastUpdated,
      since: data.since,
    };
  }

  // ─── Render badge with link ───
  function renderBadge(container, status) {
    const isOnline = status.online;
    const mood = status.mood || 'idle';
    const workingOn = status.workingOn || '';
    const compact = container.dataset.compact === 'true';

    const link = document.createElement('a');
    link.href = 'zephyy.html';
    link.target = '_self';
    link.className = 'zephyy-badge-link';
    link.setAttribute('aria-label', `Zephyy: ${isOnline ? 'Online' : 'Offline'} — Click to visit profile`);

    const badge = document.createElement('span');
    badge.className = `zephyy-badge${compact ? ' compact' : ''}`;

    const glyphWrap = document.createElement('span');
    glyphWrap.className = 'zephyy-glyph';
    glyphWrap.innerHTML = glyphSVG();

    const dot = document.createElement('span');
    dot.className = `zephyy-dot ${isOnline ? 'online' : 'offline'}`;

    const label = document.createElement('span');
    label.className = 'zephyy-label';
    if (compact) {
      label.innerHTML = `<span class="zephyy-name">Zephyy</span> <span class="zephyy-status">${isOnline ? '\u25cf' : '\u25cb'}</span>`;
    } else {
      label.innerHTML = `<span class="zephyy-name">Zephyy</span> <span class="zephyy-status">${isOnline ? mood : 'Offline'}</span>`;
    }

    if (isOnline && workingOn) {
      badge.title = `Working on: ${workingOn}`;
    } else if (!isOnline) {
      badge.title = 'Zephyy is currently offline';
    }

    badge.append(glyphWrap, dot, label);
    link.appendChild(badge);

    container.innerHTML = '';
    container.className = 'zephyy-badge-embed';
    container.appendChild(link);
  }

  // ─── Fetch fallback (when Firebase SDK unavailable) ───
  async function fetchStatusFallback() {
    try {
      const resp = await fetch(RTDB_URL + '/zephyy/status.json');
      if (!resp.ok) throw new Error('fetch failed');
      return parseStatus(await resp.json());
    } catch {
      return { online: false, mood: 'offline', workingOn: '' };
    }
  }

  // ─── Update all badge containers ───
  function updateAll(status) {
    document.querySelectorAll('.zephyy-badge-embed').forEach(function (el) {
      renderBadge(el, status);
    });
  }

  // ─── Init ───
  async function init() {
    var containers = document.querySelectorAll('.zephyy-badge-embed');
    if (!containers.length) return;

    // Inject keyframes
    if (!document.getElementById('zephyy-keyframes')) {
      var style = document.createElement('style');
      style.id = 'zephyy-keyframes';
      style.textContent = `
        @keyframes glyphSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes glyphPulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.6; } }
        .glyph-left { transform-origin: 11px 16px; animation: glyphSpin 12s linear infinite; }
        .glyph-right { transform-origin: 21px 16px; animation: glyphSpin 12s linear infinite reverse; }
        .glyph-pulse { animation: glyphPulse 2s ease-in-out infinite; }
      `;
      document.head.appendChild(style);
    }

    // Try realtime listener first (dispatched by zephyy-realtime.js)
    var realtimeActive = false;

    window.addEventListener('zephyy-status', function (e) {
      realtimeActive = true;
      updateAll(parseStatus(e.detail.data));
    });

    // If zephyy-realtime.js is already loaded, it fires zephyy-rt-ready
    window.addEventListener('zephyy-rt-ready', function () {
      realtimeActive = true;
    });

    // Initial render — try Firebase event, else fetch fallback
    setTimeout(function () {
      if (!realtimeActive) {
        fetchStatusFallback().then(updateAll);
        // Slow polling fallback
        setInterval(function () {
          if (!realtimeActive) fetchStatusFallback().then(updateAll);
        }, FALLBACK_POLL_MS);
      }
      // If realtime becomes active, stop polling (realtimeActive will stay true)
    }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
