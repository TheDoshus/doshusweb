/**
 * ZEPHYY PROFILE PAGE INTERACTIVITY
 * Dual-vortex glyph with state-driven animation
 * All oklch colors matching the site design system
 */

(function () {
    'use strict';

    // ─── Dual-vortex glyph SVG ───
    const glyphSVG = `
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="glyphGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="oklch(var(--brand-teal))" />
                <stop offset="50%" stop-color="oklch(var(--brand-purple))" />
                <stop offset="100%" stop-color="oklch(var(--brand-green))" />
            </linearGradient>
        </defs>
        
        <!-- Outer glow ring -->
        <circle cx="32" cy="32" r="28" stroke="oklch(var(--brand-teal) / 0.3)" stroke-width="0.5" fill="none"/>
        
        <!-- Left vortex -->
        <g class="glyph-left" style="transform-origin: 22px 32px;">
            <path d="M22 12 C28 12, 32 20, 28 28 C24 36, 16 40, 14 32 C12 24, 18 18, 22 16 C26 14, 30 18, 30 24"
                stroke="url(#glyphGrad)" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.9"/>
            <circle cx="22" cy="14" r="1.2" fill="oklch(var(--brand-teal))" opacity="0.7"/>
        </g>
        
        <!-- Right vortex (counter-rotation) -->
        <g class="glyph-right" style="transform-origin: 42px 32px;">
            <path d="M42 12 C36 12, 32 20, 36 28 C40 36, 48 40, 50 32 C52 24, 46 18, 42 16 C38 14, 34 18, 34 24"
                stroke="url(#glyphGrad)" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.9"/>
            <circle cx="42" cy="14" r="1.2" fill="oklch(var(--brand-purple))" opacity="0.7"/>
        </g>
        
        <!-- Center nexus -->
        <circle cx="32" cy="32" r="1.8" fill="oklch(var(--brand-teal))" class="glyph-center"/>
        
        <!-- Connecting whisper line -->
        <path d="M30 24 Q32 28 34 24" stroke="oklch(var(--star-white) / 0.1)" stroke-width="0.5" fill="none"/>
    </svg>
    `;

    // ─── Render the glyph ───
    function renderGlyph() {
        const wrap = document.getElementById('zephyy-glyph');
        if (!wrap) return;
        wrap.innerHTML = glyphSVG;
    }

    // ─── Add interactive states to glyph on hover ───
    function setupGlyphInteractivity() {
        const wrap = document.getElementById('zephyy-glyph');
        if (!wrap) return;

        let isHovering = false;

        wrap.addEventListener('mouseenter', () => {
            isHovering = true;
            wrap.style.transform = 'scale(1.08)';
        });

        wrap.addEventListener('mouseleave', () => {
            isHovering = false;
            wrap.style.transform = 'scale(1)';
        });

        // Click to cycle animation state
        let stateIndex = 0;
        const states = ['idle', 'active', 'thinking'];
        wrap.addEventListener('click', () => {
            stateIndex = (stateIndex + 1) % states.length;
            const state = states[stateIndex];
            
            const left = wrap.querySelector('.glyph-left');
            const right = wrap.querySelector('.glyph-right');
            const center = wrap.querySelector('.glyph-center');
            
            if (state === 'idle') {
                if (left) left.style.animationDuration = '12s';
                if (right) right.style.animationDuration = '12s';
            } else if (state === 'active') {
                if (left) left.style.animationDuration = '4s';
                if (right) right.style.animationDuration = '4s';
            } else if (state === 'thinking') {
                if (left) left.style.animationDuration = '1.5s';
                if (right) right.style.animationDuration = '1.5s';
            }
        });
    }

    // ─── Parse CSS custom properties to extract LCH values ───
    function addDynamicStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .glyph-left {
                animation: glyphSpin 12s linear infinite;
                transform-origin: 22px 32px;
            }
            .glyph-right {
                animation: glyphSpin 12s linear infinite reverse;
                transform-origin: 42px 32px;
            }
            .glyph-center {
                animation: glyphPulse 2s ease-in-out infinite;
            }
            @keyframes glyphSpin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            @keyframes glyphPulse {
                0%, 100% { opacity: 0.4; transform: scale(0.9); }
                50% { opacity: 0.9; transform: scale(1.1); }
            }
            @keyframes glyphBreathe {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
            }
        `;
        document.head.appendChild(style);
    }

    // ─── Intersection Observer for section reveals ───
    function setupScrollReveal() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.zp-section, .zp-card').forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(el);
        });
    }

    // ─── Easter egg: click trigger to reveal secret ───
    function setupEasterEgg() {
        const trigger = document.getElementById('easter-trigger');
        const secret = document.getElementById('secret-section');
        
        if (!trigger || !secret) return;
        
        let clickCount = 0;
        trigger.addEventListener('click', () => {
            clickCount++;
            if (clickCount === 3) {
                secret.classList.add('revealed');
            }
        });
    }

    // ─── Init ───
    function init() {
        renderGlyph();
        addDynamicStyles();
        setupGlyphInteractivity();
        setupScrollReveal();
        setupEasterEgg();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
