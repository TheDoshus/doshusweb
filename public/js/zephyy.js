/**
 * Zephyy's pages: the profile glyph and mood dial, the HTMX signal deck, section nav, chat
 * CTAs, title word reveals and nav haptics. Every part checks for its markup, so the profile
 * and the subpages share this one file. Loads after main.js (haptic, prefersReducedMotion);
 * realtime data comes from zephyy-realtime.js.
 */

(function () {
    'use strict';

    // Each mood's line; its glyph speeds live in zephyy-profile.css, keyed off [data-zp-mood]
    const MOODS = {
        calm: 'Quiet orbit. Watching the whole board.',
        active: 'Pressure is up. Moving the work.',
        debugging: 'Two race conditions in a trench coat. Cute.',
        heartbeat: 'Pulse check. Receipts or it did not happen.',
    };


    let selectedMood = 'calm';
    let moodWasChosen = false;
    let latestStatus = null;

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
        if (copy) copy.textContent = MOODS[mood];
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
        wrap.innerHTML = window.zephyyWhorl?.() || ''; // zephyy-chat.js (guarded: a week-old cached copy predates it)
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
                haptic();
            });
        });
        setMood(selectedMood, false);
    }

    function setupSignalDeck() {
        const tabs = Array.from(document.querySelectorAll('.zp-deck-tab'));
        function activateTab(tab) {
            tabs.forEach(function (candidate) {
                const active = candidate === tab;
                candidate.classList.toggle('active', active);
                candidate.setAttribute('aria-selected', String(active));
                candidate.tabIndex = active ? 0 : -1;
            });
        }

        tabs.forEach(function (tab) {
            tab.addEventListener('click', function (event) {
                // htmx swaps the panel; the href (another section) is only for a page without it
                if (window.htmx) event.preventDefault();
                activateTab(tab);
            });
            tab.addEventListener('keydown', function (event) {
                const current = tabs.indexOf(tab);
                let next = null;
                if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
                if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
                if (event.key === 'Home') next = 0;
                if (event.key === 'End') next = tabs.length - 1;
                if (next === null) return;

                event.preventDefault();
                tabs[next].focus();
                tabs[next].click();
            });
        });
        const initialTab = tabs.find(function (tab) {
            return tab.getAttribute('aria-selected') === 'true';
        });
        if (initialTab) activateTab(initialTab);

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

    // The status page (/zephyy/status): the hero badge, service cards and live heartbeat row,
    // from zephyy-realtime.js's events (one Firebase connection, one heartbeat threshold);
    // the ages re-render every minute between beats
    function setupStatusPage() {
        const badge = document.getElementById('st-online-text');
        if (!badge) return;
        const el = function (id) { return document.getElementById(id); };
        const SERVICES = { gateway: 'svc-gateway', orb: 'svc-orb', ws: 'svc-ws', embed: 'svc-embed', aether: 'svc-aether' };
        let latest = null;
        let connected = true;
        function render() {
            const online = latest.online;
            const data = latest.data || {};
            const beat = data.lastHeartbeat;
            el('st-online-dot').className = 'st-svc-dot ' + (online ? 'online' : 'offline');
            badge.textContent = online ? 'ONLINE' : (data.online ? 'STALE' : 'OFFLINE');
            badge.className = 'st-hero-badge ' + (online ? 'online' : 'off');
            if (data.workingOn) el('st-working-on').textContent = data.workingOn;
            if (data.mood) el('st-mood').textContent = data.mood;
            const gateway = el('gw-zephyy-status');
            gateway.textContent = online ? 'online' : 'offline';
            gateway.className = 'st-gw-status ' + (online ? 'online' : 'offline');
            Object.keys(SERVICES).forEach(function (key) {
                const card = el(SERVICES[key]);
                const value = (data.services || {})[key];
                const up = value === 'active';
                card.querySelector('.st-svc-dot').className = 'st-svc-dot ' + (up ? 'online' : 'offline');
                const label = card.querySelector('.st-svc-label');
                label.textContent = value || 'unknown';
                label.className = 'st-svc-label' + (up ? '' : ' off');
            });
            el('st-updated-text').textContent = !connected
                ? (beat ? 'Firebase offline — showing the last reading.' : 'Can\'t reach the live feed — retrying.')
                : (beat ? 'Live via Firebase · last beat ' + formatAgo(beat) : 'No heartbeat on record yet.');
            if (!beat) return;
            const when = new Date(beat);
            el('st-last-beat').textContent = formatAgo(beat);
            el('st-beat-live-time').textContent = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + when.toLocaleDateString([], { month: 'short', day: 'numeric' });
            el('st-beat-live-detail').textContent = online
                ? 'All clear — services nominal. Heartbeat fresh.'
                : 'Heartbeat stale — gateway may be sleeping or restarting.';
        }
        window.addEventListener('zephyy-status', function (event) { latest = event.detail; render(); });
        window.addEventListener('zephyy-connection', function (event) {
            connected = event.detail.connected;
            if (latest) render();
        });
        setInterval(function () { if (latest) render(); }, 60000);
    }

    // Subpage titles reveal word by word as they scroll in; screen readers get the whole title
    function setupTitles() {
        const titles = document.querySelectorAll('.zp-sub-title');
        if (prefersReducedMotion || !titles.length || !('IntersectionObserver' in window)) return;
        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('zp-text-motion--visible');
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.35 });
        titles.forEach(function (title) {
            const text = title.textContent.trim();
            if (!text) return;
            const words = document.createElement('span');
            words.className = 'zp-motion-words';
            words.setAttribute('aria-hidden', 'true');
            text.split(/\s+/).forEach(function (word, index) {
                if (index) words.append(' ');
                const span = document.createElement('span');
                span.className = 'zp-motion-word';
                span.style.setProperty('--zp-word-index', index);
                span.textContent = word;
                words.append(span);
            });
            title.setAttribute('aria-label', text);
            title.replaceChildren(words);
            title.classList.add('zp-text-motion');
            observer.observe(title);
        });
    }

    function init() {
        setupGlyph();
        setupMoodButtons();
        setupSignalDeck();
        setupStatusBridge();
        setupChatButtons();
        setupSectionNav();
        setupTitles();
        setupStatusPage();
        document.querySelectorAll('.zp-sub-nav a').forEach(function (link) {
            link.addEventListener('click', function () { haptic(6); });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
