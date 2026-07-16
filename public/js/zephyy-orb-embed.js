(function() {
    'use strict';
    
    const wrapper = document.getElementById('sitewide-orb-wrapper');
    const orb = document.getElementById('zp-orb-demo');
    const stickyFooter = document.getElementById('sticky-footer');
    
    if (!wrapper || !orb) return;

    // Mobile tap-to-expand logic using capture phase to intercept zephyy-chat.js
    wrapper.addEventListener('click', function(e) {
        if (window.innerWidth <= 768 && !wrapper.classList.contains('expanded')) {
            e.preventDefault();
            e.stopPropagation();
            wrapper.classList.add('expanded');
            
            // Allow clicking outside to collapse
            const outsideClick = function(evt) {
                if (!wrapper.contains(evt.target)) {
                    wrapper.classList.remove('expanded');
                    document.removeEventListener('click', outsideClick);
                }
            };
            setTimeout(() => document.addEventListener('click', outsideClick), 10);
        }
    }, true);

    // Sticky-footer harmony & scroll-aware hide
    if (stickyFooter) {
        // Initial check
        updateFooterHarmony();

        // Listen for main.js toggling .footer-hidden
        const observer = new MutationObserver(updateFooterHarmony);
        observer.observe(stickyFooter, { attributes: true, attributeFilter: ['class'] });

        function updateFooterHarmony() {
            // Scroll-hide: sync orb visibility with footer visibility
            if (stickyFooter.classList.contains('footer-hidden')) {
                wrapper.classList.add('orb-hidden');
            } else {
                wrapper.classList.remove('orb-hidden');
            }

            // Harmony positioning: only adjust if orb is at bottom
            const isBottom = window.innerWidth > 768 || wrapper.classList.contains('expanded');
            if (!isBottom) {
                wrapper.style.transform = '';
                return;
            }

            if (!stickyFooter.classList.contains('footer-hidden')) {
                // Shift UP by the footer's actual height
                const footerHeight = stickyFooter.getBoundingClientRect().height;
                wrapper.style.transform = `translateY(-${footerHeight}px)`;
            } else {
                // Footer is hidden, drop back down
                wrapper.style.transform = 'translateY(0)';
            }
        }
        
        // Ensure harmony runs when window resizes or mobile expands
        window.addEventListener('resize', updateFooterHarmony);
        wrapper.addEventListener('click', () => setTimeout(updateFooterHarmony, 10));
    }
})();
