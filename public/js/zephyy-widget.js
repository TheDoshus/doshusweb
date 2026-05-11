/* ─── ZEPHYY ONLINE STATUS WIDGET ───
 * Vanilla JS — fetches agent status from a lightweight endpoint
 * and renders the badge. Gracefully degrades (offline if fetch fails).
 *
 * Usage:
 *   <div class="zephyy-badge-embed" data-compact="false"></div>
 *   <script src="/js/zephyy-widget.js"></script>
 */

(function () {
  'use strict';

  const CONFIG = {
    // The status endpoint — returns { online: bool, lastSeen?: string }
    // For now, we use a simple heuristic: check if the service responds
    endpoint: 'https://zephyy.doshus.net/status', // future-proof; fallback below
    pollInterval: 60000, // 1 minute
  };

  // ─── Render a badge into a container ───
  function renderBadge(container, status) {
    const isOnline = status === 'online';
    const compact = container.dataset.compact === 'true';

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
    container.appendChild(dot);
    container.appendChild(label);
  }

  // ─── Fetch status with fallback ───
  async function fetchStatus() {
    try {
      // Attempt the real endpoint with a short timeout
      const res = await fetch(CONFIG.endpoint, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      return res.ok ? 'online' : 'offline';
    } catch {
      // Endpoint down — assume offline
      return 'offline';
    }
  }

  // ─── Check via simpler fallback: git-based or just static ───
  // For now, we default to 'online' if we got here at all (the JS loaded,
  // which means the site is running). In the future, this will check
  // a proper heartbeat endpoint.
  function getPragmaticStatus() {
    return 'online';
  }

  // ─── Initialize all badge embeds ───
  async function init() {
    const containers = document.querySelectorAll('.zephyy-badge-embed');
    if (!containers.length) return;

    try {
      const status = await fetchStatus();
      containers.forEach((el) => renderBadge(el, status));
    } catch {
      containers.forEach((el) => renderBadge(el, 'offline'));
    }

    // Poll
    setInterval(async () => {
      try {
        const status = await fetchStatus();
        containers.forEach((el) => renderBadge(el, status));
      } catch {
        // silently keep current state
      }
    }, CONFIG.pollInterval);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
