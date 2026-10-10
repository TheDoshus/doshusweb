/* ─── ZEPHYY ONLINE STATUS WIDGET ───
 * Vanilla JS — renders the dual-vortex glyph + status badge from the 'zephyy-status' event
 * zephyy-realtime.js sends (live, or from its fetch fallback), so the page must load it too.
 *
 * Usage:
 *   <div class="zephyy-badge-embed"></div>   (add inline-hero for the home hero's variant)
 *   <script src="/js/zephyy-widget.js"></script>
 */

(function () {
  'use strict';

  // ─── Atmospheric whorl glyph SVG ───
  function glyphSVG() {
    return `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="zg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stop-color="oklch(var(--brand-teal))" />
          <stop offset="60%"  stop-color="oklch(var(--brand-purple))" />
          <stop offset="100%" stop-color="oklch(var(--brand-green))" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="29" stroke="oklch(var(--brand-teal) / 0.1)" stroke-width="0.5" fill="none"/>
      <g class="glyph-outer">
        <path d="M 32 9 A 23 23 0 1 1 12 44"
          stroke="url(#zg)" stroke-width="0.9" stroke-linecap="round" opacity="0.4"/>
        <circle cx="32" cy="9" r="1.0" fill="oklch(var(--brand-teal))" opacity="0.6"/>
      </g>
      <g class="glyph-mid">
        <path d="M 45 40 A 15 15 0 1 1 32 17"
          stroke="url(#zg)" stroke-width="1.0" stroke-linecap="round" opacity="0.65"/>
        <circle cx="45" cy="40" r="0.8" fill="oklch(var(--brand-purple))" opacity="0.7"/>
      </g>
      <g class="glyph-inner">
        <path d="M 25 36 A 8 8 0 1 1 39 36"
          stroke="url(#zg)" stroke-width="1.1" stroke-linecap="round" opacity="0.9"/>
        <circle cx="25" cy="36" r="0.7" fill="oklch(var(--brand-teal))" opacity="0.8"/>
      </g>
      <circle cx="32" cy="32" r="1.8" fill="oklch(var(--brand-teal))" opacity="0.8" class="glyph-pulse"/>
    </svg>`;
  }

  function buildLabel(isOnline, mood) {
    const label = document.createElement('span');
    label.className = 'zephyy-label';

    const name = document.createElement('span');
    name.className = 'zephyy-name';
    name.textContent = 'Zephyy';

    const status = document.createElement('span');
    status.className = 'zephyy-status';
    status.textContent = isOnline ? mood : 'Offline';

    label.append(name, document.createTextNode(' '), status);
    return label;
  }

  // ─── Render badge with link ───
  function renderBadge(container, { online: isOnline, data }) {
    const mood = data.mood || 'idle';
    const workingOn = data.workingOn || 'Standing by';
    const heroVariant = container.classList.contains('inline-hero');

    const link = document.createElement('a');
    link.href = '/zephyy'; // absolute: the badge also sits on pages in subfolders (/lab)
    link.target = '_self';
    link.className = 'zephyy-badge-link';
    link.setAttribute('aria-label', `Zephyy: ${isOnline ? 'Online' : 'Offline'} — Click to visit profile`);

    const badge = document.createElement('span');
    badge.className = 'zephyy-badge';
    if (heroVariant) badge.classList.add('inline-hero');

    const glyphWrap = document.createElement('span');
    glyphWrap.className = 'zephyy-glyph';
    glyphWrap.innerHTML = glyphSVG();

    const dot = document.createElement('span');
    dot.className = `zephyy-dot ${isOnline ? 'online' : 'offline'}`;

    const label = buildLabel(isOnline, mood);

    if (isOnline && workingOn) {
      badge.title = `Working on: ${workingOn}`;
    } else if (!isOnline) {
      badge.title = 'Zephyy is currently offline';
    }

    badge.append(glyphWrap, dot, label);
    link.appendChild(badge);

    container.replaceChildren();
    container.appendChild(link);
  }

  function render(status) {
    document.querySelectorAll('.zephyy-badge-embed').forEach(function (el) { renderBadge(el, status); });
  }

  function init() {
    if (!document.querySelector('.zephyy-badge-embed')) return;
    window.addEventListener('zephyy-status', function (e) { render(e.detail); });
    if (window.__zpLatestStatus) render(window.__zpLatestStatus);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
