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

    // Scroll-aware hide logic
    let lastScrollY = window.scrollY;
    let scrollTimeout;

    window.addEventListener('scroll', function() {
        const currentScrollY = window.scrollY;
        
        // Hide on scroll down (if scrolled past top 100px)
        // Note: We don't hide it on mobile if it's collapsed at the top.
        // If it's expanded at the bottom, we DO hide it.
        const isMobileTop = window.innerWidth <= 768 && !wrapper.classList.contains('expanded');
        
        if (!isMobileTop) {
            if (currentScrollY > lastScrollY && currentScrollY > 100) {
                wrapper.classList.add('orb-hidden');
            } else {
                wrapper.classList.remove('orb-hidden');
            }
        }
        
        lastScrollY = currentScrollY;

        // Restore after scrolling stops
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            wrapper.classList.remove('orb-hidden');
        }, 150);
    });

    // Sticky-footer harmony (Desktop/Tablet bottom positioning)
    if (stickyFooter) {
        // Initial check
        updateFooterHarmony();

        // Listen for main.js toggling .footer-hidden
        const observer = new MutationObserver(updateFooterHarmony);
        observer.observe(stickyFooter, { attributes: true, attributeFilter: ['class'] });

        function updateFooterHarmony() {
            // Only adjust if the orb is at the bottom (Desktop, or Mobile Expanded)
            const isBottom = window.innerWidth > 768 || wrapper.classList.contains('expanded');
            if (!isBottom) {
                wrapper.style.transform = '';
                return;
            }

            if (!stickyFooter.classList.contains('footer-hidden')) {
                // Shift UP by the footer's height (approx 60px)
                wrapper.style.transform = 'translateY(-60px)';
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
