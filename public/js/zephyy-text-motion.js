/* ─── ZEPHYY TEXT MOTION
 * Accessible, one-shot word reveals for selected profile headings and
 * subpage titles. Reduced-motion users keep the untouched source text.
 */
(function () {
    'use strict';

    const motionPreference = window.matchMedia('(prefers-reduced-motion: no-preference)');
    if (!motionPreference.matches || !('IntersectionObserver' in window)) return;

    const targets = document.querySelectorAll('[data-zp-text-motion], .zp-sub-title');
    if (!targets.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('zp-text-motion--visible');
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.35 });

    targets.forEach((target) => {
        const originalText = target.textContent.trim();
        if (!originalText) return;

        const words = document.createElement('span');
        words.className = 'zp-motion-words';
        words.setAttribute('aria-hidden', 'true');

        originalText.split(/\s+/).forEach((word, index) => {
            if (index > 0) words.appendChild(document.createTextNode(' '));
            const span = document.createElement('span');
            span.className = 'zp-motion-word';
            span.style.setProperty('--zp-word-index', index);
            span.textContent = word;
            words.appendChild(span);
        });

        target.setAttribute('aria-label', originalText);
        target.replaceChildren(words);
        target.classList.add('zp-text-motion');
        observer.observe(target);
    });
})();
