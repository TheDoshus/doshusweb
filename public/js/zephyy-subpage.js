/* ─── ZEPHYY SUBPAGES — Shared JS
 * Star field init + active nav link highlighting.
 */
(function () {
    'use strict';

    // Mark active subpage link in nav
    const path = window.location.pathname;
    document.querySelectorAll('.zp-sub-links a').forEach(a => {
        if (a.getAttribute('href') === path || path.startsWith(a.getAttribute('href') + '/')) {
            a.style.color = 'oklch(var(--brand-teal))';
            a.style.fontWeight = '600';
        }
    });
})();
