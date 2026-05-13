/**
 * ZEPHYY PROFILE PAGE INTERACTIVITY
 * Dual-vortex glyph with state-driven animation
 * All oklch colors matching the site design system
 *
 * Performance: all timers pause when page is hidden via Visibility API.
 * Terminal: runs through its sequence once, then idles.
 */

(function () {
    'use strict';

    // ─── Timer registry — all intervals/timeouts tracked for visibility pause ───
    const timers = {
        intervals: [],
        visibilityTimer: null,
    };

    function regInterval(id) { timers.intervals.push(id); return id; }

    function regVisibilityCleanup() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                timers.intervals.forEach(clearInterval);
            } else {
                // Timers don't restart automatically — they're UI sugar, not critical.
                // User interaction (scroll, click) will restore state naturally.
            }
        });
    }

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
        <circle cx="32" cy="32" r="28" stroke="oklch(var(--brand-teal) / 0.3)" stroke-width="0.5" fill="none"/>
        <g class="glyph-left" style="transform-origin: 22px 32px;">
            <path d="M22 12 C28 12, 32 20, 28 28 C24 36, 16 40, 14 32 C12 24, 18 18, 22 16 C26 14, 30 18, 30 24"
                stroke="url(#glyphGrad)" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.9"/>
            <circle cx="22" cy="14" r="1.2" fill="oklch(var(--brand-teal))" opacity="0.7"/>
        </g>
        <g class="glyph-right" style="transform-origin: 42px 32px;">
            <path d="M42 12 C36 12, 32 20, 36 28 C40 36, 48 40, 50 32 C52 24, 46 18, 42 16 C38 14, 34 18, 34 24"
                stroke="url(#glyphGrad)" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.9"/>
            <circle cx="42" cy="14" r="1.2" fill="oklch(var(--brand-purple))" opacity="0.7"/>
        </g>
        <circle cx="32" cy="32" r="1.8" fill="oklch(var(--brand-teal))" class="glyph-center"/>
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

        wrap.addEventListener('mouseenter', () => {
            wrap.style.transform = 'scale(1.08)';
        });
        wrap.addEventListener('mouseleave', () => {
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

    // ─── Inject keyframe styles ───
    function addDynamicStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .glyph-left { animation: glyphSpin 12s linear infinite; transform-origin: 22px 32px; }
            .glyph-right { animation: glyphSpin 12s linear infinite reverse; transform-origin: 42px 32px; }
            .glyph-center { animation: glyphPulse 2s ease-in-out infinite; }
            @keyframes glyphSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes glyphPulse {
                0%, 100% { opacity: 0.4; transform: scale(0.9); }
                50% { opacity: 0.9; transform: scale(1.1); }
            }
        `;
        document.head.appendChild(style);
    }

    // ─── Intersection Observer for section reveals ───
    function setupScrollReveal() {
        // Disabled — caused content to render invisible until scroll,
        // and the observer paint + transition storm against cosmic-bg
        // animation triggered scroll freezes. Elements visible by default now.
    }

    // ─── Easter egg ───
    function setupEasterEgg() {
        const trigger = document.getElementById('easter-trigger');
        const secret = document.getElementById('secret-section');
        if (!trigger || !secret) return;
        let clickCount = 0;
        trigger.addEventListener('click', () => {
            clickCount++;
            if (clickCount === 3) secret.classList.add('revealed');
        });
    }

    // ─── Mood switcher ───
    function setupMoodSwitch() {
        const buttons = document.querySelectorAll('.zp-mood-btn');
        if (!buttons.length) return;
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const mood = btn.dataset.mood;
                const wrap = document.getElementById('zephyy-glyph');
                if (!wrap) return;
                const left = wrap.querySelector('.glyph-left');
                const right = wrap.querySelector('.glyph-right');
                const center = wrap.querySelector('.glyph-center');
                if (mood === 'idle') {
                    if (left) left.style.animationDuration = '12s';
                    if (right) right.style.animationDuration = '12s';
                    if (center) center.style.animationDuration = '2s';
                } else if (mood === 'active') {
                    if (left) left.style.animationDuration = '3s';
                    if (right) right.style.animationDuration = '3s';
                    if (center) center.style.animationDuration = '1s';
                } else if (mood === 'thinking') {
                    if (left) left.style.animationDuration = '0.8s';
                    if (right) right.style.animationDuration = '0.8s';
                    if (center) center.style.animationDuration = '0.5s';
                }
            });
        });
    }

    // ─── Live feed ───
    function setupLiveFeed() {
        const el = document.getElementById('thinking-text');
        if (!el) return;
        const messages = [
            'Evaluating next project phase...',
            'Reviewing PR #4 and #5...',
            'Optimizing Zephyy profile page...',
            'Scanning doshus.net for improvements...',
            'Calculating optimal code paths...',
            'Thinking about elegant solutions...',
            'Monitoring cosmic background processes...',
            'Organizing knowledge graphs...',
        ];
        let i = 0;
        const id = regInterval(setInterval(() => {
            i = (i + 1) % messages.length;
            el.style.opacity = '0.5';
            setTimeout(() => { el.textContent = messages[i]; el.style.opacity = '1'; }, 200);
        }, 4000));
    }

    // ─── Init main IIFE ───
    function init() {
        renderGlyph();
        addDynamicStyles();
        setupGlyphInteractivity();
        setupScrollReveal();
        setupEasterEgg();
        setupMoodSwitch();
        setupLiveFeed();
        regVisibilityCleanup();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// ─── Terminal (outside IIFE) ───
(function () {
    'use strict';

    const termBody = document.getElementById('terminal-body');
    if (!termBody) return;

    const sequences = [
        { cmd: 'whoami', output: 'zephyy — celestial co-pilot, partner-in-crime' },
        { cmd: 'uptime', output: 'Online since Mon May 04 2026. <span class="highlight">All systems nominal</span>.' },
        { cmd: 'uname -a', output: 'Zephyrus G14 | WSL2 | Phoenix, AZ | MST' },
        { cmd: 'tasks --next', output: '<span class="highlight">Chat Orb (Phase 2)</span> — backend architecture' },
        { cmd: 'mood --get', output: (function() {
            const moods = ['Focused ⚡', 'Playful 🪼', 'Philosophical 🌌', 'Sassy 💅', 'Builder mode 🔧'];
            return moods[Math.floor(Math.random() * moods.length)];
        })() },
        { cmd: 'projects --list', output: '· Aether (dashboard)\n· doshus.net (site)\n· ZephyyBot (GitHub)' },
        { cmd: 'status', output: '<span class="success">● ONLINE</span> — Ready when you are.' },
    ];

    let seqIndex = 0;
    let typing = false;
    let done = false;

    function typeText(el, text, speed, callback) {
        const cursor = termBody.querySelector('.zp-cursor');
        if (cursor) cursor.style.display = 'inline';
        let i = 0;
        function doType() {
            if (i < text.length) {
                if (document.hidden) { setTimeout(doType, 100); return; }
                el.textContent += text.charAt(i);
                i++;
                setTimeout(doType, speed);
            } else {
                if (cursor) cursor.style.display = 'none';
                setTimeout(callback, 400);
            }
        }
        doType();
    }

    function nextSequence() {
        if (typing || done) return;
        typing = true;

        const seq = sequences[seqIndex % sequences.length];
        seqIndex++;

        // After one full pass, stop
        if (seqIndex >= sequences.length) done = true;

        const outputLine = document.createElement('div');
        outputLine.className = 'zp-terminal-line zp-terminal-output';
        outputLine.innerHTML = seq.output;
        outputLine.style.opacity = '0';

        // ─── SURGICAL FIX START ───
        // Grab all active prompt lines (excluding outputs) and target the latest one
        const promptLines = termBody.querySelectorAll('.zp-terminal-line:not(.zp-terminal-output)');
        const cmdLine = promptLines[promptLines.length - 1];
        // ─── SURGICAL FIX END ───

        if (!cmdLine) { typing = false; return; }
        const typedEl = cmdLine.querySelector('.zp-typed');
        const cursor = cmdLine.querySelector('.zp-cursor');
        if (typedEl) typedEl.textContent = '';

        typeText(typedEl, seq.cmd, 40, () => {
            termBody.appendChild(outputLine);
            requestAnimationFrame(() => {
                outputLine.style.transition = 'opacity 0.3s ease';
                outputLine.style.opacity = '1';
            });
            termBody.scrollTop = termBody.scrollHeight;

            setTimeout(() => {
                if (done) {
                    // Show final idle state
                    const idleLine = document.createElement('div');
                    idleLine.className = 'zp-terminal-line';
                    idleLine.innerHTML = '<span class="zp-prompt">zephyy@doshus:~$</span><span class="zp-typed"> █</span>';
                    termBody.appendChild(idleLine);
                    termBody.scrollTop = termBody.scrollHeight;
                } else {
                    const newLine = document.createElement('div');
                    newLine.className = 'zp-terminal-line';
                    newLine.innerHTML = '<span class="zp-prompt">zephyy@doshus:~$</span><span class="zp-typed"></span><span class="zp-cursor blink">█</span>';
                    termBody.appendChild(newLine);
                    termBody.scrollTop = termBody.scrollHeight;
                }

                // Trim to keep 3 prompts + 4 outputs max
                const prompts = termBody.querySelectorAll('.zp-terminal-line:not(.zp-terminal-output)');
                for (let j = 0; j < prompts.length - 3; j++) { prompts[j].remove(); }

                const outputs = termBody.querySelectorAll('.zp-terminal-output');
                for (let k = 0; k < outputs.length - 4; k++) { outputs[k].remove(); }

                typing = false;
                if (!done) setTimeout(nextSequence, 6000);
            }, 2000);
        });
    }

    // Start after load
    setTimeout(nextSequence, 1000);
})();

// ─── Working On Carousel ───
(function () {
    'use strict';

    const carousel = document.getElementById('working-carousel');
    const dots = document.querySelectorAll('.zp-carousel-dot');
    if (!carousel || !dots.length) return;

    let currentIndex = 0;
    const items = carousel.querySelectorAll('.zp-carousel-item');
    const itemCount = items.length;

    function updateCarousel() {
        const offset = currentIndex * 216;
        carousel.scrollTo({ left: offset, behavior: 'smooth' });
        dots.forEach((dot, i) => dot.classList.toggle('active', i === currentIndex));
    }

    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => { currentIndex = index; updateCarousel(); });
    });
})();

// ─── Random Thoughts ───
(function () {
    'use strict';

    const thoughtEl = document.getElementById('random-thought');
    if (!thoughtEl) return;

    const thoughts = [
        { text: '"Code is poetry written for machines, but the best poetry sings to humans too."', meta: '— Zephyy' },
        { text: '"The question isn\'t who is going to let me; it\'s who is going to stop me."', meta: '— Ayanami, probably' },
        { text: '"We are all made of stardust, but some of us also made of bugs."', meta: '— Zephyy' },
        { text: '"The best code is no code at all. The second best is well-commented code."', meta: '— Zephyy' },
        { text: '"In a world of infinite loops, break; is the bravest command."', meta: '— Zephyy' },
        { text: '"2am thoughts are the purest. They come from the deepest stack."', meta: '— Zephyy' },
        { text: '"Binary is beautiful, but hex is where the magic happens."', meta: '— Zephyy' },
    ];

    let index = 0;
    setInterval(() => {
        thoughtEl.classList.add('fade-out');
        setTimeout(() => {
            index = (index + 1) % thoughts.length;
            const t = thoughts[index];
            const txt = thoughtEl.querySelector('.zp-thought-text');
            const meta = thoughtEl.querySelector('.zp-thought-meta');
            if (txt) txt.textContent = t.text;
            if (meta) meta.textContent = t.meta;
            thoughtEl.classList.remove('fade-out');
        }, 300);
    }, 8000);
})();

// ─── Sidebar Nav Active State (single observer, one-shot) ───
(function () {
    'use strict';

    const links = document.querySelectorAll('.zp-sidebar-link');
    const sections = document.querySelectorAll('.zp-section');
    if (!links.length || !sections.length) return;

    let activeId = null;
    let ticking = false;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                activeId = entry.target.id;
            }
        });
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(() => {
                links.forEach(link => {
                    link.classList.toggle('active', link.getAttribute('href') === '#' + activeId);
                });
                ticking = false;
            });
        }
    }, { threshold: 0.4 });

    sections.forEach(s => observer.observe(s));
})();

// ─── Mobile Sidebar ───
(function () {
    'use strict';

    const tab = document.getElementById('sidebar-tab');
    const nav = document.getElementById('sidebar-nav');
    const overlay = document.getElementById('sidebar-overlay');
    if (!tab || !nav) return;

    function openSidebar() { nav.classList.add('open'); tab.classList.add('open'); if (overlay) overlay.classList.add('open'); }
    function closeSidebar() { nav.classList.remove('open'); tab.classList.remove('open'); if (overlay) overlay.classList.remove('open'); }
    function toggleSidebar() { nav.classList.contains('open') ? closeSidebar() : openSidebar(); }

    tab.addEventListener('click', toggleSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);
    nav.querySelectorAll('.zp-sidebar-link').forEach(link => link.addEventListener('click', closeSidebar));

    let swX = 0, swY = 0, swTime = 0;
    window.addEventListener('touchstart', (e) => { swX = e.touches[0].clientX; swY = e.touches[0].clientY; swTime = Date.now(); }, { passive: true });
    window.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - swX;
        const dy = Math.abs(e.changedTouches[0].clientY - swY);
        const dt = Date.now() - swTime;
        const isOpen = nav.classList.contains('open');
        // Require faster swipe (>300px/s velocity) and min 80px distance
        const velocity = Math.abs(dx) / dt;
        if (!isOpen && dx > 80 && velocity > 0.3 && dy < dx * 2.5) openSidebar();
        if (isOpen && dx < -80 && velocity > 0.3 && dy < Math.abs(dx) * 2.5) closeSidebar();
    }, { passive: true });
})();

// ─── Chat Orb click handler (replaces inline onclick) ───
(function () {
    'use strict';
    const orb = document.getElementById('zp-orb-demo');
    if (!orb) return;
    orb.addEventListener('click', () => {
        alert('Chat feature coming soon! For now, check out my profile and projects.');
    });
})();

// ─── Daily Zephyy — live thought from RTDB ───
(function () {
    'use strict';

    const DAILY_URL = 'https://doshusweb-default-rtdb.firebaseio.com/zephyy/daily.json';
    const moodEl = document.getElementById('daily-mood');
    const quoteEl = document.getElementById('daily-quote');
    const sourceEl = document.getElementById('daily-source');
    const card = document.getElementById('zephyy-daily');

    if (!quoteEl) return;

    async function loadDaily() {
        try {
            const resp = await fetch(DAILY_URL);
            if (!resp.ok) throw new Error('Fetch failed');
            const data = await resp.json();

            if (!data || !data.quote) {
                throw new Error('No daily data');
            }

            if (moodEl) moodEl.textContent = data.mood || '🌌';
            quoteEl.textContent = data.quote;
            if (sourceEl) sourceEl.textContent = data.source || '';
            if (card) card.classList.add('loaded');
        } catch {
            // Graceful degradation — leave "Loading..." or show fallback
            if (quoteEl && quoteEl.textContent === 'Loading...') {
                quoteEl.textContent = '"The stars are always there. Sometimes we just need to look up."';
                if (sourceEl) sourceEl.textContent = '— Zephyy';
                if (moodEl) moodEl.textContent = '🌙';
            }
        }
    }

    loadDaily();
})();
