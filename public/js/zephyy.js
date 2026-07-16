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

    // ─── Atmospheric whorl glyph SVG ───
    // Three concentric 240° arcs (radii 23/15/8), each offset 120°, rotating
    // at differential speeds — outer slowest, inner fastest → whorl impression.
    const glyphSVG = `
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="glyphGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%"   stop-color="oklch(var(--brand-teal))" />
                <stop offset="60%"  stop-color="oklch(var(--brand-purple))" />
                <stop offset="100%" stop-color="oklch(var(--brand-green))" />
            </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="29" stroke="oklch(var(--brand-teal) / 0.1)" stroke-width="0.4" fill="none"/>
        <g class="whorl-outer">
            <path d="M 32 9 A 23 23 0 1 1 12 44"
                stroke="url(#glyphGrad)" stroke-width="0.9" stroke-linecap="round" opacity="0.4"/>
            <circle cx="32" cy="9" r="1.0" fill="oklch(var(--brand-teal))" opacity="0.6"/>
        </g>
        <g class="whorl-mid">
            <path d="M 45 40 A 15 15 0 1 1 32 17"
                stroke="url(#glyphGrad)" stroke-width="1.0" stroke-linecap="round" opacity="0.65"/>
            <circle cx="45" cy="40" r="0.8" fill="oklch(var(--brand-purple))" opacity="0.7"/>
        </g>
        <g class="whorl-inner">
            <path d="M 25 36 A 8 8 0 1 1 39 36"
                stroke="url(#glyphGrad)" stroke-width="1.1" stroke-linecap="round" opacity="0.9"/>
            <circle cx="25" cy="36" r="0.7" fill="oklch(var(--brand-teal))" opacity="0.8"/>
        </g>
        <circle cx="32" cy="32" r="1.8" fill="oklch(var(--brand-teal))" class="whorl-center"/>
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

        wrap.addEventListener('mouseenter', () => { wrap.style.transform = 'scale(1.08)'; });
        wrap.addEventListener('mouseleave', () => { wrap.style.transform = 'scale(1)'; });

        // Click cycles through whorl states (idle → active → thinking)
        let stateIndex = 0;
        const states = ['idle', 'active', 'thinking'];
        const whorlSpeeds = {
            idle:     ['16s', '11s', '7s',  '2.5s'],
            active:   ['5s',  '3.5s','2.2s','0.8s'],
            thinking: ['1.8s','1.2s','0.7s','0.4s'],
        };
        function cycleGlyphState() {
            stateIndex = (stateIndex + 1) % states.length;
            const sp = whorlSpeeds[states[stateIndex]];
            const outer  = wrap.querySelector('.whorl-outer');
            const mid    = wrap.querySelector('.whorl-mid');
            const inner  = wrap.querySelector('.whorl-inner');
            const center = wrap.querySelector('.whorl-center');
            if (outer)  outer.style.animationDuration  = sp[0];
            if (mid)    mid.style.animationDuration    = sp[1];
            if (inner)  inner.style.animationDuration  = sp[2];
            if (center) center.style.animationDuration = sp[3];
        }
        wrap.addEventListener('pointerdown', cycleGlyphState);
        // Springy pop on mood cycle (class retrigger; CSS owns the physics)
        wrap.addEventListener('pointerup', function () {
            wrap.classList.remove('zp-spring');
            void wrap.offsetWidth;
            wrap.classList.add('zp-spring');
            if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
        });
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
        const whorlSpeeds = {
            idle:     ['16s', '11s', '7s',  '2.5s'],
            active:   ['5s',  '3.5s','2.2s','0.8s'],
            thinking: ['1.8s','1.2s','0.7s','0.4s'],
        };
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const mood = btn.dataset.mood;
                const wrap = document.getElementById('zephyy-glyph');
                if (!wrap) return;
                const sp = whorlSpeeds[mood] || whorlSpeeds.idle;
                const outer  = wrap.querySelector('.whorl-outer');
                const mid    = wrap.querySelector('.whorl-mid');
                const inner  = wrap.querySelector('.whorl-inner');
                const center = wrap.querySelector('.whorl-center');
                if (outer)  outer.style.animationDuration  = sp[0];
                if (mid)    mid.style.animationDuration    = sp[1];
                if (inner)  inner.style.animationDuration  = sp[2];
                if (center) center.style.animationDuration = sp[3];
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
    // ─── Sidebar rail tooltips (fixed-position: the rail scroll box clips ::after) ───
    function setupRailTooltips() {
        const links = document.querySelectorAll('.zp-sidebar-link[data-label]');
        if (!links.length) return;
        const tip = document.createElement('div');
        tip.className = 'zp-rail-tip';
        document.body.appendChild(tip);
        const desktop = window.matchMedia('(min-width: 901px)');
        links.forEach((link) => {
            link.addEventListener('click', () => {
                if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) {} }
            });
            const show = () => {
                if (!desktop.matches) return;
                const r = link.getBoundingClientRect();
                tip.textContent = link.getAttribute('data-label') || '';
                tip.style.left = Math.round(r.right + 8) + 'px';
                tip.style.top = Math.round(r.top + r.height / 2) + 'px';
                tip.classList.add('show');
            };
            const hide = () => tip.classList.remove('show');
            link.addEventListener('mouseenter', show);
            link.addEventListener('focus', show);
            link.addEventListener('mouseleave', hide);
            link.addEventListener('blur', hide);
        });
    }

    function init() {
        renderGlyph();
        setupGlyphInteractivity();
        setupScrollReveal();
        setupEasterEgg();
        setupMoodSwitch();
        setupLiveFeed();
        setupRailTooltips();
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

    // Mutable status object — updated live by realm fetch
    const _zpStatusEntry = {
        cmd: 'status',
        output: '<span class="success">● ONLINE</span> — Ready when you are.',
    };
    window.__zpTermStatus = _zpStatusEntry;

    const sequences = [
        { cmd: 'whoami', output: 'zephyy — celestial co-pilot, partner-in-crime' },
        { cmd: 'uptime', output: 'Online since Mon May 04 2026. <span class="highlight">All systems nominal</span>.' },
        { cmd: 'uname -a', output: 'Zephyrus G14 | WSL2 | GPT-5.4 primary | Phoenix, AZ | MST' },
        { cmd: 'tasks --next', output: '<span class="highlight">zephyy subpages</span> — wave 2 build out' },
        { cmd: 'mood --get', output: (function() {
            const moods = ['Focused ⚡', 'Playful 🪼', 'Philosophical 🌌', 'Sassy 💅', 'Builder mode 🔧', 'Thoughtful 🌙'];
            return moods[Math.floor(Math.random() * moods.length)];
        })() },
        { cmd: 'projects --list', output: '· Aether (dashboard)\n· doshus.net (site)\n· Mona gateway (cross-crew)\n· ZephyyBot (GitHub)' },
        _zpStatusEntry,  // Reference — output mutates live from RTDB
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


// ─── Expandable Timeline ───
(function () {
    'use strict';
    var items = document.querySelectorAll('.zp-timeline-item');
    items.forEach(function (item) {
        var dot = item.querySelector('.zp-timeline-dot');
        var content = item.querySelector('.zp-timeline-content');
        var toggle = function (e) {
            e.preventDefault();
            item.classList.toggle('expanded');
        };
        if (dot) dot.addEventListener('click', toggle);
        if (content) content.addEventListener('click', toggle);
    });
    if (items.length) items[0].classList.add('expanded');
})();

// ─── Conditional Live-Feed Scroll ───
(function () {
    'use strict';
    function checkScroll(el) {
        var overflow = el.scrollWidth - el.clientWidth;
        if (overflow > 4) {
            el.classList.add('scrolling');
            el.style.setProperty('--scroll-dist', '-' + overflow + 'px');
            el.style.animationDuration = Math.max(5, overflow / 35) + 's';
        } else {
            el.classList.remove('scrolling');
        }
    }
    function setupAll() {
        document.querySelectorAll('.zp-live-text').forEach(function (el) { checkScroll(el); });
    }
    setupAll();
    window.addEventListener('resize', setupAll);
    // Retry after Firebase loads data
    setTimeout(setupAll, 2000);
    setTimeout(setupAll, 5000);
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

    tab.addEventListener('click', function () {
        if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
        toggleSidebar();
    });
    if (overlay) overlay.addEventListener('click', closeSidebar);
    nav.querySelectorAll('.zp-sidebar-link').forEach(link => link.addEventListener('click', closeSidebar));
    document.addEventListener('zp-chat-opened', closeSidebar);

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

// ─── Daily Zephyy → migrated to zephyy-realtime.js (Firebase onValue)

// ─── Live status → migrated to zephyy-realtime.js (Firebase onValue)

// ─── Realm → migrated to zephyy-realtime.js (Firebase onValue)
