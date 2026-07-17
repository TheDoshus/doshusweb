(function() {
    'use strict';

    const wrapper = document.getElementById('sitewide-orb-wrapper');
    const orb = document.getElementById('zp-orb-demo');
    const stickyFooter = document.getElementById('sticky-footer');

    if (!wrapper || !orb) return;

    // zephyy-chat.js injects the whorl glyph as a loose child of the orb;
    // move it inside the core so it renders as her avatar, like the profile.
    const core = orb.querySelector('.sitewide-orb-core');
    const glyph = orb.querySelector('.zp-orb-glyph');
    if (core && glyph) core.appendChild(glyph);

    // An in-progress conversation follows the visitor page to page: skip the
    // shy collapsed/dim idle states and present the full orb immediately.
    // ('auto' suppresses the arrival animation — it only plays on a real tap.)
    try {
        const hasConvo = localStorage.getItem('zephyy-chat-session') &&
            (JSON.parse(localStorage.getItem('zp-chat-cache') || '[]')).length > 0;
        if (hasConvo) wrapper.classList.add('expanded', 'auto', 'has-session');
    } catch (e) { /* storage blocked — stay in idle state */ }

    // Sticky-footer harmony & scroll-aware hide — both driven by the one
    // scroll signal main.js already computes (the .footer-hidden toggle).
    function updateFooterHarmony() {
        if (!stickyFooter) return;

        // Scroll-hide: sync orb visibility with footer visibility
        wrapper.classList.toggle('orb-hidden', stickyFooter.classList.contains('footer-hidden'));

        // Harmony positioning: only offset when the orb sits at the bottom
        // (desktop always, mobile only once expanded)
        const isBottom = window.innerWidth > 768 || wrapper.classList.contains('expanded');
        if (!isBottom) {
            wrapper.style.transform = '';
            return;
        }

        if (!stickyFooter.classList.contains('footer-hidden')) {
            const footerHeight = stickyFooter.getBoundingClientRect().height;
            wrapper.style.transform = `translateY(-${footerHeight}px)`;
        } else {
            wrapper.style.transform = 'translateY(0)';
        }
    }

    // Mobile tap-to-expand logic using capture phase to intercept zephyy-chat.js
    // (gallery-dock is always full-size — its first tap should open the chat)
    wrapper.addEventListener('click', function(e) {
        if (window.innerWidth <= 768 && !wrapper.classList.contains('expanded') &&
            !wrapper.classList.contains('gallery-dock')) {
            e.preventDefault();
            e.stopPropagation();
            if (navigator.vibrate) { try { navigator.vibrate(8); } catch (err) {} }
            wrapper.classList.remove('auto'); // real tap — let the arrival play
            wrapper.classList.add('expanded');
            updateFooterHarmony(); // apply the footer offset before paint, not after

            // Allow clicking outside to collapse
            const outsideClick = function(evt) {
                if (!wrapper.contains(evt.target)) {
                    wrapper.classList.remove('expanded', 'auto');
                    updateFooterHarmony();
                    document.removeEventListener('click', outsideClick);
                }
            };
            setTimeout(() => document.addEventListener('click', outsideClick), 10);
        }
    }, true);

    if (stickyFooter) {
        updateFooterHarmony();
        const observer = new MutationObserver(updateFooterHarmony);
        observer.observe(stickyFooter, { attributes: true, attributeFilter: ['class'] });
        window.addEventListener('resize', updateFooterHarmony);
    }
})();
