/* ─── ZEPHYY ONLINE STATUS WIDGET ───
 * Vanilla JS — renders her whorl glyph + status badge from the 'zephyy-status' event
 * zephyy-live.js sends, so the page must load it too, and zephyy-orb.js (the whorl).
 *
 * Usage:
 *   <div class="zephyy-badge-embed"></div>   (add inline-hero for the home hero's variant)
 *   <script src="/js/zephyy-widget.js"></script>
 */

(function () {
  'use strict';

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
    link.href = '/zephyy'; // absolute, so it holds from a page in any folder
    link.target = '_self';
    link.className = 'zephyy-badge-link';
    link.setAttribute('aria-label', `Zephyy: ${isOnline ? 'Online' : 'Offline'} — Click to visit profile`);

    const badge = document.createElement('span');
    badge.className = 'zephyy-badge';
    if (heroVariant) badge.classList.add('inline-hero');

    const glyphWrap = document.createElement('span');
    glyphWrap.className = 'zephyy-glyph';
    glyphWrap.innerHTML = window.zephyyWhorl?.() || ''; // her whorl, from zephyy-orb.js (a stale cached copy lacks it)

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
