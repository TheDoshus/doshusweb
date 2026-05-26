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
        function cycleGlyphState() {
            stateIndex = (stateIndex + 1) % states.length;
            const state = states[stateIndex];
            const left = wrap.querySelector('.glyph-left');
            const right = wrap.querySelector('.glyph-right');
            const center = wrap.querySelector('.glyph-center');
            if (state === 'idle') {
                if (left) left.style.animationDuration = '12s';
                if (right) right.style.animationDuration = '12s';
                if (center) center.style.animationDuration = '2s';
            } else if (state === 'active') {
                if (left) left.style.animationDuration = '4s';
                if (right) right.style.animationDuration = '4s';
                if (center) center.style.animationDuration = '0.8s';
            } else if (state === 'thinking') {
                if (left) left.style.animationDuration = '1.5s';
                if (right) right.style.animationDuration = '1.5s';
                if (center) center.style.animationDuration = '3s';
            }
        }
        wrap.addEventListener('pointerdown', cycleGlyphState);
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

    // Mutable status object — updated live by realm fetch
    const _zpStatusEntry = {
        cmd: 'status',
        output: '<span class="success">● ONLINE</span> — Ready when you are.',
    };
    window.__zpTermStatus = _zpStatusEntry;

    const sequences = [
        { cmd: 'whoami', output: 'zephyy — celestial co-pilot, partner-in-crime' },
        { cmd: 'uptime', output: 'Online since Mon May 04 2026. <span class="highlight">All systems nominal</span>.' },
        { cmd: 'uname -a', output: 'Zephyrus G14 | WSL2 | Phoenix, AZ | MST' },
        { cmd: 'tasks --next', output: '<span class="highlight">Chat Orb (Phase 2)</span> — backend architecture' },
        { cmd: 'mood --get', output: (function() {
            const moods = ['Focused ⚡', 'Playful 🪼', 'Philosophical 🌌', 'Sassy 💅', 'Builder mode 🔧', 'Thoughtful 🌙'];
            return moods[Math.floor(Math.random() * moods.length)];
        })() },
        { cmd: 'projects --list', output: '· Aether (dashboard)\n· doshus.net (site)\n· ZephyyBot (GitHub)' },
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

// ─── Working On Carousel ───
(function () {
    'use strict';

    const carousel = document.getElementById('working-carousel');
    const dots = document.querySelectorAll('.zp-carousel-dot');
    if (!carousel || !dots.length) return;

    var items = carousel.querySelectorAll('.zp-carousel-item');
    var itemCount = items.length;
    var currentIndex = 0;
    var autoScrollTimer = null;
    var userInteracting = false;
    var interactionTimeout = null;
    var scrollRaf = null;
    var AUTO_INTERVAL = 5000; // 5s per slide
    var RESUME_DELAY = 8000;  // resume auto-advance after 8s idle

    function setActiveDot(i) {
        dots.forEach(function (d, di) { d.classList.toggle('active', di === i); });
    }

    // The browser does the scrolling natively (touch/momentum/trackpad + CSS snap).
    // We only nudge scrollLeft for dot clicks and auto-advance — never hijack the gesture.
    function scrollToIndex(index) {
        currentIndex = Math.max(0, Math.min(index, itemCount - 1));
        var offset = items[currentIndex].offsetLeft - carousel.offsetLeft;
        carousel.scrollTo({ left: offset, behavior: 'smooth' });
        setActiveDot(currentIndex);
    }

    function startAutoScroll() {
        stopAutoScroll();
        autoScrollTimer = setInterval(function () {
            if (!userInteracting && document.visibilityState !== 'hidden') {
                scrollToIndex((currentIndex + 1) % itemCount);
            }
        }, AUTO_INTERVAL);
    }

    function stopAutoScroll() {
        if (autoScrollTimer) { clearInterval(autoScrollTimer); autoScrollTimer = null; }
    }

    // Any manual interaction pauses auto-advance so we never fight the user mid-scroll.
    function pauseAuto() {
        userInteracting = true;
        if (interactionTimeout) clearTimeout(interactionTimeout);
        interactionTimeout = setTimeout(function () { userInteracting = false; }, RESUME_DELAY);
    }

    // Dot clicks jump to a slide.
    dots.forEach(function (dot, index) {
        dot.addEventListener('click', function () {
            pauseAuto();
            scrollToIndex(index);
        });
    });

    // Native scroll (touch swipe, momentum, trackpad) drives the active dot and
    // counts as interaction. rAF-throttled so it stays cheap.
    carousel.addEventListener('scroll', function () {
        pauseAuto();
        if (scrollRaf) return;
        scrollRaf = requestAnimationFrame(function () {
            scrollRaf = null;
            var center = carousel.scrollLeft + carousel.clientWidth / 2;
            var closest = 0, closestDist = Infinity;
            items.forEach(function (item, i) {
                var itemCenter = item.offsetLeft - carousel.offsetLeft + item.offsetWidth / 2;
                var dist = Math.abs(itemCenter - center);
                if (dist < closestDist) { closestDist = dist; closest = i; }
            });
            if (closest !== currentIndex) { currentIndex = closest; setActiveDot(closest); }
        });
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) stopAutoScroll(); else startAutoScroll();
    });

    startAutoScroll();
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

// ─── Daily Zephyy → migrated to zephyy-realtime.js (Firebase onValue)

// ─── Live status → migrated to zephyy-realtime.js (Firebase onValue)

// ─── Realm → migrated to zephyy-realtime.js (Firebase onValue)

// ─── Chat Orb ───
(function () {
    'use strict';

    /* ================================================
     * 1. CONSTANTS, STATE, & DOM REFS
     * ================================================ */

    const orb = document.getElementById('zp-orb-demo');
    const panel = document.getElementById('zp-chat-panel');
    const closeBtn = document.getElementById('zp-chat-close');
    const messagesEl = document.getElementById('zp-chat-messages');
    const inputEl = document.getElementById('zp-chat-input');
    const sendBtn = document.getElementById('zp-chat-send');
    const backdrop = document.getElementById('zp-chat-backdrop');
    const tooltip = orb ? orb.querySelector('.zp-orb-tooltip') : null;

    if (!orb || !panel) return;

    /* Detect touch device — hide tooltip, open panel on tap directly */
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice && tooltip) {
        tooltip.style.display = 'none';
    }

    /* Session — uses zephyy-realtime.js (Firebase native listeners, no polling) */
    let isOpen = false;
    let quickReplied = false;
    let sessionEnded = false;
    let sessionId = window.__zpRealtime ? window.__zpRealtime.sessionId : null;
    const savedName = localStorage.getItem('zp-visitor-name');

    /* ── Listen for online/offline status changes from Firebase listener ── */
    function handleOnlineChange(e) {
        var online = e.detail.online;
        var offlineBanner = document.getElementById('zp-offline-banner');
        if (!online) {
            if (!offlineBanner) {
                offlineBanner = document.createElement('div');
                offlineBanner.className = 'zp-chat-msg zp-chat-msg-bot';
                offlineBanner.id = 'zp-offline-banner';
                offlineBanner.textContent = '💤 Zephyy is offline right now — likely the laptop is asleep or restarting. Check back soon!';
                messagesEl.insertBefore(offlineBanner, messagesEl.firstChild);
            }
            if (inputEl) { inputEl.disabled = true; inputEl.placeholder = 'Zephyy is offline...'; }
            if (sendBtn) sendBtn.disabled = true;
        } else {
            if (offlineBanner) offlineBanner.remove();
            if (inputEl) { inputEl.disabled = false; inputEl.placeholder = 'Type a message...'; }
            if (sendBtn) sendBtn.disabled = false;
        }
    }
    window.addEventListener('zephyy-online-change', handleOnlineChange);

    /* checkOnlineStatus → replaced by zephyy-online-change event listener */

    /* ================================================
     * 2. DOM HELPERS
     * ================================================ */

    function scrollToBottom() {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function togglePanel() {
        isOpen = !isOpen;
        panel.classList.toggle('open', isOpen);
        var bd = document.getElementById('zp-chat-backdrop');
        if (bd) bd.classList.toggle('open', isOpen);
        if (isOpen) {
            orb.classList.remove('unread');
            /* checkOnlineStatus handled by Firebase realtime listener */
            /* Ensure name prompt shows even if loadMessages hasn't fired yet */
            setTimeout(function() { showNamePrompt(); }, 600);
        }
    }

    function renderContent(text) {
        // Linkify BEFORE escaping — otherwise & in URLs gets corrupted to &amp;
        var placeholders = [];
        var imgPlaceholders = [];
        var i = 0;
        // 0. Markdown images: ![alt](url) → placeholder (must go before links)
        text = text.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, function(m, alt, url) {
            var ph = '\x00IMG' + (i++) + '\x00';
            imgPlaceholders.push({ ph: ph, alt: alt, url: url });
            return ph;
        });
        // 1. Markdown links: [text](url) → placeholder
        text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function(m, label, url) {
            var ph = '\x00LINK' + (i++) + '\x00';
            placeholders.push({ ph: ph, label: label, url: url });
            return ph;
        });
        // 2. Bare URLs → placeholder
        text = text.replace(/(https?:\/\/[^\s<>]+)/g, function(m, url) {
            // Don't double-link URLs that were already inside markdown links
            if (url.charAt(url.length - 1) !== m.charAt(m.length - 1)) return m;
            var ph = '\x00LINK' + (i++) + '\x00';
            placeholders.push({ ph: ph, label: url, url: url });
            return ph;
        });
        // 3. HTML-escape remaining text
        text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        // 4. Restore images from placeholders
        imgPlaceholders.forEach(function(p) {
            text = text.replace(p.ph, '<img src="' + p.url + '" alt="' + p.alt + '" style="max-width:100%;border-radius:8px;margin:8px 0" loading="lazy">');
        });
        // 5. Restore links from placeholders (no re-escaping, URLs are raw)
        placeholders.forEach(function(p) {
            text = text.replace(p.ph, '<a href="' + p.url + '" target="_blank" rel="noopener">' + p.label + '</a>');
        });
        // 5. Bold: **text**
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // 6. Newlines to <br>
        text = text.replace(/\n/g, '<br>');
        return text;
    }

    function addMessage(role, content, timestamp) {
        // Dedup: skip if last message with same role has same content
        var prev = messagesEl.querySelector('.zp-chat-msg-' + role + ':last-of-type[data-content]');
        if (prev && prev.dataset.content === content) return;
        var div = document.createElement('div');
        div.className = 'zp-chat-msg zp-chat-msg-' + role;
        div.dataset.content = content;
        div.innerHTML = renderContent(content);
        if (timestamp) {
            var time = document.createElement('div');
            time.className = 'zp-chat-msg-time';
            time.textContent = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            div.appendChild(time);
        }
        messagesEl.appendChild(div);
        scrollToBottom();
    }

    function removeWelcome() {
        var w = document.getElementById('zp-welcome-msg');
        if (w) w.remove();
    }

    function setWelcomeText(text) {
        var w = document.getElementById('zp-welcome-msg');
        if (w) w.textContent = text;
    }

    /* Thinking indicator */
    function addThinkingBubble() {
        var el = document.getElementById('zp-chat-thinking');
        if (el) el.remove();
        var div = document.createElement('div');
        div.className = 'zp-chat-msg zp-chat-msg-bot zp-chat-thinking';
        div.id = 'zp-chat-thinking';
        div.innerHTML = '<span class="zp-thinking-dots"><span>⚡</span><span class="zp-thinking-text">thinking</span><span class="zp-dot">.</span><span class="zp-dot">.</span><span class="zp-dot">.</span></span>';
        messagesEl.appendChild(div);
        scrollToBottom();
    }

    function removeThinkingBubble() {
        var el = document.getElementById('zp-chat-thinking');
        if (el) el.remove();
    }

    /* Remove quick-reply buttons from DOM only */
    function removeQuickReplies() {
        var r = document.getElementById('zp-quick-reply-row');
        var nr = document.getElementById('zp-name-input-row');
        if (r) r.remove();
        if (nr) nr.remove();
    }

    /* ================================================
     * 3. QUICK-REPLY NAME PROMPT
     * ================================================ */

    function showNamePrompt() {
        if (quickReplied || savedName) return;
        var row = document.getElementById('zp-quick-reply-row');
        if (row) return; // already shown
        /* Don't show buttons if conversation already has user messages */
        var existingMsgs = messagesEl.querySelectorAll('.zp-chat-msg-user');
        if (existingMsgs.length > 0) return;

        row = document.createElement('div');
        row.id = 'zp-quick-reply-row';
        row.className = 'zp-chat-msg zp-chat-msg-bot';
        row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px;background:none;border:none;';

        /* "I have a name!" button */
        var nameBtn = document.createElement('button');
        nameBtn.className = 'zp-qr-btn';
        nameBtn.textContent = 'I have a name!';
        nameBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            showNameInput();
        });

        /* "Just Zephyy" button */
        var skipBtn = document.createElement('button');
        skipBtn.className = 'zp-qr-btn';
        skipBtn.textContent = 'Nah, just chat';
        skipBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            removeQuickReplies();
            sendText("I'm good without a name");
        });

        row.appendChild(nameBtn);
        row.appendChild(skipBtn);
        messagesEl.appendChild(row);
        scrollToBottom();
    }

    function showNameInput() {
        removeQuickReplies();
        var row = document.createElement('div');
        row.id = 'zp-name-input-row';
        row.className = 'zp-chat-msg zp-chat-msg-bot';
        row.style.cssText = 'display:flex;gap:6px;padding:6px 10px;background:none;border:none;align-items:center;';

        var input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Your name...';
        input.maxLength = 30;
        input.style.cssText = 'flex:1;padding:8px 12px;border-radius:8px;border:1px solid oklch(var(--brand-teal) / 0.3);background:oklch(15% 0.03 260 / 0.8);color:var(--text-main);font-size:0.85rem;outline:none;';
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitName(input.value.trim());
            }
        });

        var okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.className = 'zp-qr-btn';
        okBtn.style.cssText = 'padding:8px 16px;border-radius:8px;border:1px solid oklch(var(--brand-teal) / 0.4);background:oklch(var(--brand-teal) / 0.15);cursor:pointer;font-size:0.85rem;transition:all 0.15s;';
        okBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            submitName(input.value.trim());
        });

        row.appendChild(input);
        row.appendChild(okBtn);
        messagesEl.appendChild(row);
        scrollToBottom();
        input.focus();
    }

    function submitName(name) {
        var nr = document.getElementById('zp-name-input-row');
        if (nr) nr.remove();
        removeWelcome();
        removeQuickReplies();
        if (name && name.length > 0) {
            var raw = name.toLowerCase();
            if (raw === 'doshus') {
                addMessage('bot', 'Nice try \uD83D\uDE0F I know Doshus — and you\'re not him. What should I actually call you?', Date.now());
                quickReplied = false;
                var row = document.getElementById('zp-name-input-row');
                if (row) row.remove();
                setTimeout(showNamePrompt, 500);
                return;
            }
            /* Clear anonymous flags — user provided a real name */
            localStorage.removeItem('zp-no-name');
            var caps = name[0].toUpperCase() + name.slice(1).toLowerCase();
            var greetings = ["Yeah it's ", "You can call me ", "I go by "];
            var greet = greetings[Math.floor(Math.random() * greetings.length)];
            var userMsg = greet + caps + '!';
            quickReplied = true;
            addMessage('user', userMsg, Date.now());
            addThinkingBubble();
            var timeoutId = setTimeout(function() {
                var tb = document.getElementById('zp-chat-thinking');
                if (tb) tb.querySelector('.zp-thinking-text').textContent = 'hmm, no response yet';
            }, 15000);
            if (window.__zpRealtime) {
                window.__zpRealtime.msgsRef.push({
                    role: 'user', content: userMsg, timestamp: Date.now()
                }).catch(function() {});
            }
        } else {
            sendText("I don't have a name");
        }
    }

    function sendText(text) {
        if (!text) return;
        quickReplied = true; // prevent re-showing buttons
        /* Clear stale name if user chooses to stay anonymous */
        if (text.includes("without a name") || text.includes("don't have a name")) {
            localStorage.removeItem('zp-visitor-name');
            localStorage.setItem('zp-no-name', '1');
            removeWelcome();
        }
        inputEl.value = text;
        sendBtn.click();
    }

    /* ================================================
     * 4. FIREBASE OPERATIONS
     * ================================================ */

    function loadMessages() {
        /* Firebase realtime: load history via zephyy-realtime.js */
        if (!window.__zpRealtime) { showNamePrompt(); return; }
        window.__zpRealtime.loadHistory(50).then(function(snap) {
            if (!snap.exists()) { showNamePrompt(); return; }
            var data = snap.val();
            var keys = Object.keys(data);
            if (keys.length === 0) { showNamePrompt(); return; }

            while (messagesEl.firstChild) {
                messagesEl.removeChild(messagesEl.firstChild);
            }

            keys.forEach(function(key) {
                var msg = data[key];
                addMessage(msg.role, msg.content, msg.timestamp);
            });

            if (sessionEnded) {
                setSessionEnded();
            } else {
                removeWelcome();
                removeQuickReplies();
            }
            showNamePrompt();
        }).catch(function() { /* silent */ });
    }

    function sendMessage() {
        if (sendBtn.disabled || sessionEnded) return;
        var text = inputEl.value.trim();
        if (!text) return;

        sendBtn.disabled = true;
        inputEl.value = '';
        touchActivity();

        removeWelcome();
        removeQuickReplies();

        addMessage('user', text, Date.now());
        addThinkingBubble();

        var userTs = Date.now();
        console.log('[zephyy-debug] sendMessage: pushing to RTDB at ' + userTs);
        if (window.__zpRealtime) {
            window.__zpRealtime.msgsRef.push({
                role: 'user', content: text, timestamp: userTs
            }).catch(function() {
                removeThinkingBubble();
                addMessage('assistant', '⚠️ Message didn\'t send. Try refreshing the page or check back later.', Date.now());
                sendBtn.disabled = false;
            });
        }

        /* Start a 15s timeout for slow responses */
        var slowTimeout = setTimeout(function() {
            var tb = document.getElementById('zp-chat-thinking');
            if (tb) {
                tb.querySelector('.zp-thinking-text').textContent = 'still thinking...';
                var statusNote = document.createElement('div');
                statusNote.className = 'zp-chat-msg zp-chat-msg-bot zp-chat-status-note';
                statusNote.textContent = '💭 Taking a bit — Zephyy runs on free models from a personal laptop. If this persists, she might be offline.';
                statusNote.id = 'zp-slow-note';
                messagesEl.appendChild(statusNote);
                scrollToBottom();
            }
        }, 20000);
        window.__zpSlowTimeout = slowTimeout;

        sendBtn.disabled = false;
        inputEl.focus();
    }

    /* ================================================
     * 5. REALTIME MESSAGE HANDLER (replaces pollAndDetect)
     * ================================================ */

    /* ── Listen for new messages from Firebase realtime listener ── */
    window.addEventListener('zephyy-msg', function(e) {
        var msg = e.detail;
        var panelOpen = panel.classList.contains('open');
        if (!panelOpen) {
            orb.classList.add('unread');
            return;
        }
        removeThinkingBubble();
        if (window.__zpSlowTimeout) { clearTimeout(window.__zpSlowTimeout); window.__zpSlowTimeout = null; }
        var sn = document.getElementById('zp-slow-note'); if (sn) sn.remove();
        addMessage(msg.role, msg.content, msg.timestamp);
    });

    /* ── Listen for session end from Firebase control watcher ── */
    window.addEventListener('zephyy-session-ended', function() {
        setSessionEnded();
    });

    /* ── Polling fallback: check for new messages every 3s (belt-and-suspenders) ── */
    var _lastMsgKey = null;
    setInterval(function() {
        if (sessionEnded || !window.__zpRealtime) return;
        window.__zpRealtime.msgsRef.limitToLast(1).once('value', function(snap) {
            if (!snap.exists()) return;
            var data = snap.val();
            var keys = Object.keys(data);
            if (!keys.length) return;
            var key = keys[0];
            var msg = data[key];
            if (key === _lastMsgKey) return; // already seen
            _lastMsgKey = key;
            if (!msg || !msg.content) return;
            if (msg.role === 'assistant' || msg.role === 'bot') {
                window.dispatchEvent(new CustomEvent('zephyy-msg', {
                    detail: { key: key, role: msg.role, content: msg.content, timestamp: msg.timestamp }
                }));
            }
        }).catch(function() {});
    }, 1500);

    /* ================================================
     * 6. INIT
     * ================================================ */

    /* Restore saved name on load — only if the panel hasn't been opened yet.
       If user already said "no name", skip the welcome text entirely */
    if (savedName && !localStorage.getItem('zp-no-name')) {
        setWelcomeText('Hey ' + savedName + '! ⚡');
    } else if (savedName) {
        /* User previously said no name — clear stale name */
        localStorage.removeItem('zp-visitor-name');
        removeWelcome();
    }

    /* Open panel → reload messages */
    var panelObserver = new MutationObserver(function() {
        if (panel.classList.contains('open')) {
            /* Firebase realtime handles dedup — just reload history */
            loadMessages();
        } else {
            /* Panel closed — clear unread dot */
            orb.classList.remove('unread');
        }
    });
    panelObserver.observe(panel, { attributes: true, attributeFilter: ['class'] });

    /* ── Session ended helper ── */
    function setSessionEnded() {
        sessionEnded = true;
        if (inputEl) { inputEl.placeholder = 'Session ended — press Enter to start fresh'; }
        if (sendBtn) sendBtn.disabled = true;
        /* Fade old messages so user knows this is a past session */
        messagesEl.querySelectorAll('.zp-chat-msg').forEach(function(m) { m.style.opacity = '0.5'; });
        if (!document.getElementById('zp-chat-ended-banner')) {
            var banner = document.createElement('div');
            banner.className = 'zp-chat-ended';
            banner.id = 'zp-chat-ended-banner';
            banner.innerHTML = '<span>💤 Session ended</span><span style="font-size:11px;opacity:0.7">Messages above are from a previous conversation. Type to start fresh.</span>';
            messagesEl.appendChild(banner);
            scrollToBottom();
        }
    }

    /* Allow restarting by typing after session ended */
    inputEl.addEventListener('keydown', function(e) {
        if (sessionEnded && e.key === 'Enter') {
            e.preventDefault();
            /* In-place restart — keep panel open */
            localStorage.removeItem('zephyy-chat-session');
            localStorage.removeItem('zp-visitor-name');
            localStorage.removeItem('zp-no-name');
            sessionEnded = false;
            /* seenKeys removed — Firebase handles dedup /

            messagesEl.querySelectorAll('.zp-chat-msg, .zp-chat-ended').forEach(function(el) { el.remove(); });
            /* Clear and re-ask name */
            visitorName = null;
            nameAsked = false;
            if (sendBtn) sendBtn.disabled = false;
            if (inputEl) { inputEl.placeholder = 'Message Zephyy...'; inputEl.value = ''; }
            /* Generate new session */
            sessionId = 'chat-' + Math.random().toString(36).substring(2, 8);
            localStorage.setItem('zephyy-chat-session', sessionId);
            setTimeout(function() { showNamePrompt(); }, 400);
        }
    });

    /* checkControl → replaced by zephyy-session-ended event from Firebase */

    /* ── Idle timeout (30 min) ── */
    var lastActivity = Date.now();
    function touchActivity() { lastActivity = Date.now(); }

    /* ── Events ── */
    orb.addEventListener('click', togglePanel);
    if (closeBtn) closeBtn.addEventListener('click', togglePanel);
    if (backdrop) backdrop.addEventListener('click', togglePanel);
    var refreshBtn = document.getElementById("zp-chat-refresh");
    if (refreshBtn) refreshBtn.addEventListener("click", function() {
        localStorage.removeItem('zephyy-chat-session');
        localStorage.removeItem('zp-visitor-name');
        localStorage.removeItem('zp-no-name');
        location.reload();
    });
    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    inputEl.addEventListener('input', touchActivity);
    messagesEl.addEventListener('scroll', touchActivity);
    messagesEl.addEventListener('touchmove', touchActivity);

    /* ── Idle timeout (30 min, only when panel open) ── */
    setInterval(function() {
        if (panel.classList.contains('open') && !sessionEnded && Date.now() - lastActivity > 30 * 60 * 1000) {
            setSessionEnded();
            if (window.__zpRealtime && window.__zpRealtime.controlRef) {
                window.__zpRealtime.controlRef.update({
                    state: 'ended', reason: 'idle_timeout', timestamp: Date.now()
                }).catch(function(){});
            }
        }
    }, 30000);

    /* ── Keepalive: bump session timestamp every 5 min while page is open ── */
    setInterval(function() {
        if (sessionEnded || !window.__zpRealtime) return;
        window.__zpRealtime.msgsRef.limitToLast(1).once('value').then(function(snap) {
            if (!snap.exists()) return;
            var data = snap.val();
            var keys = Object.keys(data);
            if (!keys.length) return;
            var lastKey = keys[0];
            var lastMsg = data[lastKey];
            if (lastMsg && lastMsg.role === 'assistant') {
                snap.ref.child(lastKey).child('timestamp').set(Date.now()).catch(function(){});
            }
        }).catch(function(){});
    }, 300000);
})();