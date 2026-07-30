/**
 * Zephyy profile interactions.
 * Owns the profile glyph, state lens, HTMX deck hydration, nav state, and chat CTAs.
 * Realtime data still comes from zephyy-realtime.js.
 */

(function () {
    'use strict';

    const MOODS = {
        calm: {
            copy: 'Quiet orbit. Watching the whole board.',
            speeds: ['16s', '11s', '7s', '2.5s'],
        },
        active: {
            copy: 'Pressure is up. Moving the work.',
            speeds: ['5s', '3.5s', '2.2s', '0.8s'],
        },
        debugging: {
            copy: 'Two race conditions in a trench coat. Cute.',
            speeds: ['1.8s', '1.2s', '0.7s', '0.4s'],
        },
        heartbeat: {
            copy: 'Pulse check. Receipts or it did not happen.',
            speeds: ['8s', '5s', '3s', '1.1s'],
        },
    };

    const glyphSVG = `
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="glyphGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="oklch(var(--brand-teal))" />
                    <stop offset="60%" stop-color="oklch(var(--brand-purple))" />
                    <stop offset="100%" stop-color="oklch(var(--brand-green))" />
                </linearGradient>
            </defs>
            <circle cx="32" cy="32" r="29" stroke="oklch(var(--zp-state) / 0.18)" stroke-width="0.45" fill="none"/>
            <g class="whorl-outer">
                <path d="M 32 9 A 23 23 0 1 1 12 44" stroke="url(#glyphGrad)" stroke-width="1" stroke-linecap="round" opacity="0.55"/>
                <circle cx="32" cy="9" r="1" fill="oklch(var(--brand-teal))" opacity="0.8"/>
            </g>
            <g class="whorl-mid">
                <path d="M 45 40 A 15 15 0 1 1 32 17" stroke="url(#glyphGrad)" stroke-width="1.2" stroke-linecap="round" opacity="0.78"/>
                <circle cx="45" cy="40" r="0.85" fill="oklch(var(--brand-purple))" opacity="0.85"/>
            </g>
            <g class="whorl-inner">
                <path d="M 25 36 A 8 8 0 1 1 39 36" stroke="url(#glyphGrad)" stroke-width="1.35" stroke-linecap="round" opacity="0.95"/>
                <circle cx="25" cy="36" r="0.75" fill="oklch(var(--brand-teal))"/>
            </g>
            <circle cx="32" cy="32" r="2" fill="oklch(var(--zp-state))" class="whorl-center"/>
        </svg>
    `;

    let selectedMood = 'calm';
    let moodWasChosen = false;
    let latestStatus = null;

    function getGlyphParts() {
        const wrap = document.getElementById('zephyy-glyph');
        if (!wrap) return null;
        return {
            wrap,
            outer: wrap.querySelector('.whorl-outer'),
            mid: wrap.querySelector('.whorl-mid'),
            inner: wrap.querySelector('.whorl-inner'),
            center: wrap.querySelector('.whorl-center'),
        };
    }

    function applyGlyphSpeed(mood) {
        const parts = getGlyphParts();
        if (!parts) return;
        const speeds = MOODS[mood].speeds;
        [parts.outer, parts.mid, parts.inner, parts.center].forEach(function (part, index) {
            if (part) part.style.animationDuration = speeds[index];
        });
    }

    function setMood(mood, chosenByVisitor) {
        if (!MOODS[mood]) return;
        selectedMood = mood;
        moodWasChosen = moodWasChosen || chosenByVisitor;
        document.body.dataset.zpMood = mood;

        document.querySelectorAll('.zp-mood-btn').forEach(function (button) {
            const isActive = button.dataset.mood === mood;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });

        const copy = document.getElementById('zp-mood-copy');
        if (copy) copy.textContent = MOODS[mood].copy;
        applyGlyphSpeed(mood);
    }

    function inferMood(value) {
        const normalized = String(value || '').toLowerCase();
        if (normalized.includes('debug')) return 'debugging';
        if (normalized.includes('heart') || normalized.includes('monitor')) return 'heartbeat';
        if (normalized.includes('active') || normalized.includes('focus') || normalized.includes('work')) return 'active';
        return 'calm';
    }

    function formatAgo(value) {
        const timestamp = new Date(value).getTime();
        if (!Number.isFinite(timestamp)) return 'No recent receipt';
        const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
        if (seconds < 60) return seconds + 's ago';
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) return minutes + 'm ago';
        const hours = Math.round(minutes / 60);
        return hours < 48 ? hours + 'h ago' : Math.round(hours / 24) + 'd ago';
    }

    function hydrateSignalPanel(detail) {
        if (!detail) return;
        const data = detail.data || {};
        const state = document.getElementById('zp-deck-state');
        const work = document.getElementById('zp-deck-work');
        const model = document.getElementById('zp-deck-model');
        const heartbeat = document.getElementById('zp-deck-heartbeat');
        const navDot = document.getElementById('zp-nav-status-dot');

        if (state) {
            state.textContent = detail.online
                ? (data.mood ? data.mood + '. Signal is live.' : 'Online. Signal is live.')
                : 'Offline. The local machine is quiet.';
        }
        if (work) work.textContent = data.workingOn || 'Standing by without pretending that means idle.';
        if (model) model.textContent = data.chatModel || 'Lightweight public lane';
        if (heartbeat) heartbeat.textContent = data.lastHeartbeat ? formatAgo(data.lastHeartbeat) : 'No recent receipt';
        if (navDot) navDot.className = 'zp-dot ' + (detail.online ? 'online' : 'offline');
    }

    function setupGlyph() {
        const wrap = document.getElementById('zephyy-glyph');
        if (!wrap) return;
        wrap.innerHTML = glyphSVG;
        wrap.setAttribute('role', 'button');
        wrap.setAttribute('tabindex', '0');
        wrap.setAttribute('aria-label', 'Cycle profile signal state');

        function cycleMood() {
            const order = Object.keys(MOODS);
            const next = order[(order.indexOf(selectedMood) + 1) % order.length];
            setMood(next, true);
            wrap.classList.remove('zp-spring');
            void wrap.offsetWidth;
            wrap.classList.add('zp-spring');
        }

        wrap.addEventListener('click', cycleMood);
        wrap.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                cycleMood();
            }
        });
    }

    function setupMoodButtons() {
        document.querySelectorAll('.zp-mood-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                setMood(button.dataset.mood, true);
                if (navigator.vibrate) {
                    try { navigator.vibrate(8); } catch (error) { /* Optional haptic. */ }
                }
            });
        });
        setMood(selectedMood, false);
    }

    function setupSignalDeck() {
        const tabs = Array.from(document.querySelectorAll('.zp-deck-tab'));
        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                tabs.forEach(function (candidate) {
                    const active = candidate === tab;
                    candidate.classList.toggle('active', active);
                    candidate.setAttribute('aria-selected', String(active));
                });
            });
        });

        document.body.addEventListener('htmx:afterSwap', function (event) {
            if (event.detail.target && event.detail.target.id === 'zp-signal-panel') {
                hydrateSignalPanel(latestStatus);
            }
        });
    }

    function setupStatusBridge() {
        window.addEventListener('zephyy-status', function (event) {
            latestStatus = event.detail;
            hydrateSignalPanel(latestStatus);
            if (!moodWasChosen) setMood(inferMood(event.detail.data && event.detail.data.mood), false);
        });

        if (window.__zpLatestStatus) {
            latestStatus = window.__zpLatestStatus;
            hydrateSignalPanel(latestStatus);
            if (!moodWasChosen) setMood(inferMood(latestStatus.data && latestStatus.data.mood), false);
        }
    }

    function setupChatButtons() {
        const triggers = document.querySelectorAll('#zp-open-chat, [data-open-zephyy-chat]');
        triggers.forEach(function (trigger) {
            trigger.addEventListener('click', function () {
                const orb = document.getElementById('zp-orb-demo');
                if (orb) orb.click();
            });
        });
    }

    function setupSectionNav() {
        const links = Array.from(document.querySelectorAll('.zp-profile-nav-links a'));
        const sections = links
            .map(function (link) { return document.querySelector(link.getAttribute('href')); })
            .filter(Boolean);
        if (!sections.length || !('IntersectionObserver' in window)) return;

        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                links.forEach(function (link) {
                    link.classList.toggle('active', link.getAttribute('href') === '#' + entry.target.id);
                });
            });
        }, { rootMargin: '-25% 0px -62% 0px' });

        sections.forEach(function (section) { observer.observe(section); });
    }

    function init() {
        setupGlyph();
        setupMoodButtons();
        setupSignalDeck();
        setupStatusBridge();
        setupChatButtons();
        setupSectionNav();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
