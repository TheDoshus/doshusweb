/* ─── ZEPHYY ONLINE STATUS WIDGET ───
 * Vanilla JS — renders the dual-vortex glyph + status badge.
 * Gracefully degrades (offline if fetch fails).
 *
 * Usage:
 *   <div class="zephyy-badge-embed" data-compact="false"></div>
 *   <script src="/js/zephyy-widget.js"></script>
 */

(function () {
  'use strict';

  const CONFIG = {
    endpoint: 'https://zephyy.doshus.net/status',
    pollInterval: 60000,
  };

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

  // ─── Render badge with link ───
  function renderBadge(container, status) {
    const isOnline = status === 'online';
    const compact = container.dataset.compact === 'true';

    // Create clickable wrapper link
    const link = document.createElement('a');
    link.href = 'zephyy.html';
    link.target = '_self';
    link.className = 'zephyy-badge-link';
    link.setAttribute('aria-label', `Zephyy: ${isOnline ? 'Online' : 'Offline'} — Click to visit profile`);

    const glyphWrap = document.createElement('span');
    glyphWrap.className = 'zephyy-glyph';
    glyphWrap.innerHTML = glyphSVG();

    const dot = document.createElement('span');
    dot.className = `zephyy-dot ${isOnline ? 'online' : 'offline'}`;

    const label = document.createElement('span');
    label.className = 'zephyy-label';

    if (compact) {
      label.innerHTML = `<span class="zephyy-name">Zephyy</span> <span class="zephyy-status">${isOnline ? '●' : '○'}</span>`;
    } else {
      label.innerHTML = `<span class="zephyy-name">Zephyy</span> <span class="zephyy-status">${isOnline ? 'Online' : 'Offline'}</span>`;
    }

    container.innerHTML = '';
    container.className = `zephyy-badge${compact ? ' compact' : ''}`;
    container.appendChild(glyphWrap);
    container.appendChild(dot);
    container.appendChild(label);
    // Create badge element and append to link
    const badge = document.createElement('span');
    badge.className = `zephyy-badge${compact ? ' compact' : ''}`;
    badge.appendChild(glyphWrap);
    badge.appendChild(dot);
    badge.appendChild(label);

    link.appendChild(badge);

    // Replace container content with the link
    container.innerHTML = '';
    container.className = 'zephyy-badge-embed';
    container.appendChild(link);
  }

  // ─── Fetch status ───
  async function fetchStatus() {
    try {
      const res = await fetch(CONFIG.endpoint, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      return res.ok ? 'online' : 'offline';
    } catch {
      return 'offline';
    }
  }

  // ─── Init ───
  async function init() {
    const containers = document.querySelectorAll('.zephyy-badge-embed');
    if (!containers.length) return;

    try {
      const status = await fetchStatus();
      containers.forEach((el) => renderBadge(el, status));
    } catch {
      containers.forEach((el) => renderBadge(el, 'offline'));
    }

    // Inject keyframes for glyph animation if not already present
    if (!document.getElementById('zephyy-keyframes')) {
      const style = document.createElement('style');
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

    setInterval(async () => {
      try {
        const status = await fetchStatus();
        containers.forEach((el) => renderBadge(el, status));
      } catch { /* keep current state */ }
    }, CONFIG.pollInterval);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();