/**
 * ZEPHYY CHAT ORB
 * Split from zephyy-pages.js 2026-07-12 — everything chat: panel UI, message
 * rendering (escapeHtml/renderContent), send flow, session lifecycle UX.
 *
 * Depends on zephyy-live.js, loaded before this file: its 'zephyy-status' events, and
 * window.__zpConnect(), which connects on first use and resolves with the session API
 * (loadHistory, sendMessage, resetSession, controlRef, sessionEnded).
 * DOM lives in zephyy.html only; all lookups guard for missing elements.
 */

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

    /* Her whorl, the one copy every surface draws: the orb (bold), the chat header, the status
       badge (zephyy-widget.js) and her profile (zephyy-pages.js). Three rings spin at their own speeds
       around a pulsing center; zephyy-orb.css colors and moves them. Each copy gets its own
       gradient id: a page draws several, and a url(#id) into a hidden copy paints nothing */
    const WHORL = { // per ring (outer, mid, inner): stroke width, opacity, dot radius; then the center's radius
        fine: { w: [1, 1.2, 1.35], o: [0.55, 0.78, 0.95], dot: [1, 0.85, 0.75], center: 2, ring: 0.45 },
        bold: { w: [3.2, 3.4, 3.8], o: [0.85, 0.9, 0.98], dot: [2, 1.8, 1.6], center: 3.6, ring: 0.8 },
    };
    const RINGS = [['outer', 'M 32 9 A 23 23 0 1 1 12 44', 32, 9], ['mid', 'M 45 40 A 15 15 0 1 1 32 17', 45, 40], ['inner', 'M 25 36 A 8 8 0 1 1 39 36', 25, 36]];
    let whorls = 0;
    window.zephyyWhorl = function (bold) {
        const v = WHORL[bold ? 'bold' : 'fine'];
        const id = 'zp-whorl-' + (++whorls);
        return `<svg class="whorl${bold ? ' whorl-bold' : ''}" viewBox="0 0 64 64" fill="none" aria-hidden="true">`
            + `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0"/><stop offset="0.55"/><stop offset="1"/></linearGradient></defs>`
            + `<circle class="whorl-ring" cx="32" cy="32" r="29" stroke-width="${v.ring}"/>`
            + RINGS.map(([name, d, x, y], i) => `<g class="whorl-${name}"><path d="${d}" stroke="url(#${id})" stroke-width="${v.w[i]}" stroke-linecap="round" opacity="${v.o[i]}"/><circle cx="${x}" cy="${y}" r="${v.dot[i]}"/></g>`).join('')
            + `<circle class="whorl-center" cx="32" cy="32" r="${v.center}"/></svg>`;
    };
    if (orb && !orb.querySelector('.zp-orb-glyph')) {
        const orbGlyph = document.createElement('span');
        orbGlyph.className = 'zp-orb-glyph';
        orbGlyph.innerHTML = window.zephyyWhorl(true);
        orb.insertBefore(orbGlyph, orb.firstChild);
        orb.classList.add('has-glyph');
    }
    const headerGlyph = document.querySelector('.zp-chat-icon-glyph');
    if (headerGlyph) headerGlyph.innerHTML = window.zephyyWhorl();

    /* ── Varied first-visit greeting — the static welcome line rotates so
       returning-but-new visitors don't get the exact same open every time.
       Repaint removes the welcome once a real conversation exists; a fresh session puts it back. ── */
    const welcomeMsg = document.getElementById('zp-welcome-msg');
    (function(welcome) {
        if (!welcome) return;
        var intros = [
            "Hey there! ⚡ I'm Zephyy — Doshus's celestial co-pilot. What are we exploring today?",
            "Welcome in! ⚡ I'm Zephyy. Ask me about the site, tools, money myths, or grab a theme or meme.",
            "*materializes from the starfield* ✨ Zephyy here. Doshus's co-pilot and resident guide. What can I help you find?",
            "Hey hey! ⚡ Zephyy here — celestial co-pilot and navigator. What would you like to dive into?",
            "Yo! 🌌 Zephyy in the orbit. Looking for tools, finance breakdowns, or just exploring?"
        ];
        welcome.textContent = intros[Math.floor(Math.random() * intros.length)];
    })(welcomeMsg);

    /* ── Header name → profile link (JS so all 10 stamped pages get it
       without markup surgery) ── */
    (function() {
        var nameEl = document.querySelector('.zp-chat-name');
        if (!nameEl || nameEl.closest('a')) return;
        var link = document.createElement('a');
        link.href = '/zephyy';
        link.className = 'zp-chat-name-link';
        link.title = "Visit Zephyy's profile";
        nameEl.parentNode.insertBefore(link, nameEl);
        link.appendChild(nameEl);
    })();

    /* Detect touch device — hide tooltip, open panel on tap directly */
    const isTouchDevice = 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
    if (isTouchDevice && tooltip) {
        tooltip.style.display = 'none';
    }

    /* Session state */
    let isOpen = false;
    let quickReplied = false;
    let sessionEnded = false;

    /* ── Her online/offline status, from zephyy-live.js's status events.
       Offline does NOT disable input — RTDB is always up, so messages queue
       and the orb answers them when Zephyy wakes. Just set expectations. ── */
    var zephyyOnline = true;
    var offlineNoteShown = false;
    function handleOnlineChange(e) {
        zephyyOnline = e.detail.online;
        var offlineBanner = document.getElementById('zp-offline-banner');
        if (!zephyyOnline) {
            if (!offlineBanner) {
                offlineBanner = document.createElement('div');
                offlineBanner.className = 'zp-chat-msg zp-chat-msg-bot';
                offlineBanner.id = 'zp-offline-banner';
                offlineBanner.textContent = '😴 Zephyy is recharging right now — you can still leave a message, she\'ll reply when she\'s back.';
                messagesEl.insertBefore(offlineBanner, messagesEl.firstChild);
            }
            if (inputEl) { inputEl.disabled = false; inputEl.placeholder = 'Leave Zephyy a message...'; }
            if (sendBtn) sendBtn.disabled = false;
        } else {
            if (offlineBanner) offlineBanner.remove();
            offlineNoteShown = false;
            if (inputEl) { inputEl.disabled = false; inputEl.placeholder = 'Message Zephyy...'; }
            if (sendBtn) sendBtn.disabled = false;
        }
    }
    window.addEventListener('zephyy-status', handleOnlineChange); /* its detail carries online too */

    /* ================================================
     * 2. DOM HELPERS
     * ================================================ */

    function scrollToBottom() {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function togglePanel() {
        isOpen = !isOpen;
        panel.classList.toggle('open', isOpen);
        panel.setAttribute('aria-hidden', String(!isOpen));
        panel.inert = !isOpen;
        orb.setAttribute('aria-expanded', String(isOpen));
        var bd = document.getElementById('zp-chat-backdrop');
        if (bd) bd.classList.toggle('open', isOpen);
        if (isOpen) {
            window.haptic?.(6);
            orb.classList.remove('unread');
            /* Ensure starters show even if loadMessages hasn't fired yet */
            setTimeout(function() { showStarters(); }, 600);
            /* Focus input once the open transition settles */
            setTimeout(function() {
                if (inputEl && !inputEl.disabled) inputEl.focus();
            }, 350);
        } else {
            if (typeof chatActionState !== 'undefined') chatActionState.disposeTimer();
            activeChatPlayers.forEach(function(player) {
                try {
                    if (player && typeof player.pause === 'function' && !player.isDisposed() && !player.paused()) {
                        player.pause();
                    }
                } catch (e) {}
            });
            orb.focus();
        }
    }

    function escapeHtml(s) {
        // Safe for both text content and double-quoted attribute values.
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ── Safe media parsing for chat messages ── */
    function parseMediaUrl(rawUrl) {
        if (typeof rawUrl !== 'string') return null;
        var value = rawUrl.trim();
        if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(value)) {
            return { isStash: false, type: 'image', url: value };
        }
        var absolute = value.match(/^https?:\/\/([^/?#]*)([^?#]*)/i);
        var relative = /^\/(?!\/)/.test(value);
        if (!absolute && !relative) return null;
        // Inspect the original pathname before URL() can normalize dot segments.
        // Queries and fragments are opaque provider data, not path components.
        if (absolute && /[@\\\u0000-\u0020]/.test(absolute[1])) return null;
        var rawPath = absolute ? (absolute[2] || '/') : value.split(/[?#]/)[0];
        if (/%(?:2f|5c)/i.test(rawPath)) return null;
        var probe;
        try { probe = decodeURIComponent(rawPath); } catch (e) { return null; }
        // Decode only nested path-control escapes. A literal percent in a valid
        // encoded filename must not be fed to decodeURIComponent a second time.
        for (var depth = 0; depth < 5; depth++) {
            if (/[\\\u0000-\u001f\u007f]/.test(probe) || /(^|\/)\.{1,2}(\/|$)/.test(probe) || /%(?:2f|5c)/i.test(probe)) return null;
            var next = probe.replace(/%(25|2e)/gi, function(_, hex) { return String.fromCharCode(parseInt(hex, 16)); });
            if (next === probe) break;
            if (depth === 4) return null;
            probe = next;
        }
        var parsed, currentOrigin;
        try {
            var location = typeof window !== 'undefined' && window.location;
            var base = location && location.href || 'https://doshus.net/';
            parsed = new URL(value, base);
            currentOrigin = location && location.origin || new URL(base).origin;
        } catch (e) { return null; }
        if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) return null;
        var canonical = parsed.hostname === 'doshus.net' || parsed.hostname === 'www.doshus.net';
        var trusted = parsed.origin === currentOrigin || (canonical && parsed.port === '');
        if (canonical && !trusted) return null;
        if (trusted && parsed.pathname.startsWith('/assets/memes/')) {
            var filename;
            try { filename = decodeURIComponent(parsed.pathname.slice('/assets/memes/'.length)); } catch (e) { return null; }
            if (!filename || /[\/\\]/.test(filename)) return null;
            var video = /\.(mp4|webm|mov)$/i.test(filename);
            if (!video && !/\.(jpe?g|png|gif|webp)$/i.test(filename)) return null;
            var encoded = encodeURIComponent(filename).replace(/[!'()*]/g, function(ch) { return '%' + ch.charCodeAt(0).toString(16).toUpperCase(); });
            return { isStash: true, type: video ? 'video' : 'image', url: '/assets/memes/' + encoded };
        }
        if (!absolute) return null;
        // Preserve safe provider URLs, including signatures and extensionless
        // image endpoints, without granting any external URL video/stash trust.
        if (/\.(mp4|webm|mov|avi|mkv|ogg|mp3|wav|html?|js|json|css|exe|sh|txt|pdf|zip)$/i.test(parsed.pathname)) return null;
        return { isStash: false, type: 'image', url: value };
    }

    function renderContent(text) {
        // Linkify BEFORE escaping — otherwise & in URLs gets corrupted to &amp;
        var placeholders = [];
        var mediaPlaceholders = [];
        var i = 0;
        // 0. Markdown media: ![alt](url) → placeholder (must go before links)
        // Accepts https://, data:image/, and /assets/memes/ paths (with balanced parens support)
        text = text.replace(/!\[([^\]]*)\]\(((?:https?:\/\/|data:image\/|\/assets\/memes\/)(?:[^\s()]+|\([^\s()]+\))+)\)/g, function(m, alt, url) {
            var media = parseMediaUrl(url);
            if (!media) return m; // rejected/unsafe media left as raw text
            var ph = '\x00MEDIA' + (i++) + '\x00';
            mediaPlaceholders.push({ ph: ph, alt: alt, url: media.url, isStash: media.isStash, mediaType: media.type });
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
        text = escapeHtml(text);
        // 4. Restore media from placeholders
        mediaPlaceholders.forEach(function(p) {
            var url = escapeHtml(p.url);
            var alt = escapeHtml(p.alt);
            var id = 'zpli' + (i++);
            var html;
            if (p.isStash && p.mediaType === 'video') {
                html =
                    '<figure class="zp-chat-img-card zp-chat-video-card zp-chat-stash-card" data-stash-url="' + url + '">' +
                        '<video controls playsinline preload="metadata" class="video-js zp-chat-video zp-chat-stash-video" src="' + url + '" aria-label="Doshus.NET meme stash video">' +
                        '</video>' +
                        '<figcaption class="zp-chat-img-meta zp-chat-stash-meta">' +
                            '<span>Doshus.NET Meme Stash</span>' +
                        '</figcaption>' +
                    '</figure>';
            } else if (p.isStash) {
                html =
                    '<figure class="zp-chat-img-card zp-chat-stash-card" data-stash-url="' + url + '">' +
                        '<img src="' + url + '" alt="Doshus.NET meme stash image" class="zp-chat-img zp-chat-stash-img" loading="lazy">' +
                        '<figcaption class="zp-chat-img-meta zp-chat-stash-meta">' +
                            '<span>Doshus.NET Meme Stash</span>' +
                        '</figcaption>' +
                    '</figure>';
            } else {
                imgUrlMap[id] = { url: p.url, alt: p.alt };
                html =
                    '<figure class="zp-chat-img-card">' +
                        '<img src="' + url + '" alt="' + alt + '" data-zpli="' + id + '" class="zp-chat-img" loading="lazy">' +
                        '<figcaption class="zp-chat-img-meta">' +
                            '<span>Generated by Zephyy</span>' +
                            '<button type="button" class="zp-chat-img-copy" data-zpli="' + id + '">Copy prompt</button>' +
                        '</figcaption>' +
                    '</figure>';
            }
            text = text.replace(p.ph, function() { return html; });
        });
        // 5. Restore links from placeholders (escape label + url — they were captured raw before step 3)
        placeholders.forEach(function(p) {
            var html = '<a href="' + escapeHtml(p.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(p.label) + '</a>';
            text = text.replace(p.ph, function() { return html; });
        });
        // 6. Bold: **text**
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // 7. Newlines to <br>
        text = text.replace(/\n/g, '<br>');
        return text;
    }

    /* ── Canonical stash catalog & human-approved caption resolution ── */
    var stashCatalogPromise = null;
    var stashCatalogMap = null;

    function normalizeStashPath(urlStr) {
        if (!urlStr || typeof urlStr !== 'string') return null;
        var prefix = '/assets/memes/';
        var rawPath = urlStr.trim();
        if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
            try {
                var location = typeof window !== 'undefined' && window.location;
                var base = location && location.href || 'https://doshus.net/';
                var u = new URL(rawPath, base);
                var currentOrigin = location && location.origin || new URL(base).origin;
                var canonical = u.hostname === 'doshus.net' || u.hostname === 'www.doshus.net';
                var trusted = u.origin === currentOrigin || (canonical && u.port === '');
                if (!trusted) return null;
                rawPath = u.pathname;
            } catch (e) {
                return null;
            }
        }
        if (!rawPath.startsWith(prefix)) return null;
        var encodedFilename = rawPath.slice(prefix.length);
        var decodedFilename;
        try {
            decodedFilename = decodeURIComponent(encodedFilename);
        } catch (e) {
            return null; // Malformed percent-encoding fails closed
        }
        // Strict boundary: single file under /assets/memes/, no traversal, no separators
        if (!decodedFilename || /[\/\\]/.test(decodedFilename) || decodedFilename.includes('..')) {
            return null;
        }
        return {
            path: prefix + decodedFilename,
            id: decodedFilename
        };
    }

    function loadStashCatalog() {
        if (stashCatalogMap) return Promise.resolve(stashCatalogMap);
        if (!stashCatalogPromise) {
            stashCatalogPromise = fetch('/assets/memes/meme-catalog.json')
                .then(function(resp) {
                    if (!resp.ok) throw new Error('Catalog fetch failed: ' + resp.status);
                    return resp.json();
                })
                .then(function(data) {
                    var map = {};
                    if (data && Array.isArray(data.items)) {
                        data.items.forEach(function(item) {
                            if (item && typeof item.path === 'string') {
                                map[item.path] = item;
                                var filename = item.path.slice('/assets/memes/'.length);
                                map[filename] = item;
                            }
                            if (item && typeof item.id === 'string') {
                                map[item.id] = item;
                            }
                        });
                    }
                    stashCatalogMap = map;
                    return map;
                })
                .catch(function() {
                    stashCatalogPromise = null;
                    return null;
                });
        }
        return stashCatalogPromise;
    }

    function resolveStashCaptions(container) {
        if (!container) return;
        var figures = container.querySelectorAll ? container.querySelectorAll('figure.zp-chat-stash-card[data-stash-url]') : [];
        if (!figures || figures.length === 0) return;
        loadStashCatalog().then(function(catalogMap) {
            if (!catalogMap) return;
            for (var f = 0; f < figures.length; f++) {
                var fig = figures[f];
                var stashUrl = fig.dataset ? fig.dataset.stashUrl : fig.getAttribute('data-stash-url');
                if (!stashUrl) continue;
                var norm = normalizeStashPath(stashUrl);
                if (!norm) continue;
                var item = catalogMap[norm.path] || catalogMap[norm.id];
                if (item && item.captionReview === 'human' && typeof item.description === 'string' && item.description.trim()) {
                    var approvedText = item.description.trim();
                    var meta = fig.querySelector('.zp-chat-stash-meta');
                    if (meta && !meta.querySelector('.zp-chat-stash-desc')) {
                        var descSpan = document.createElement('span');
                        descSpan.className = 'zp-chat-stash-desc';
                        descSpan.textContent = approvedText;
                        meta.insertBefore(descSpan, meta.firstChild);
                    }
                    var mediaEl = fig.querySelector('video') || fig.querySelector('img');
                    if (mediaEl) {
                        if (mediaEl.tagName === 'VIDEO') mediaEl.setAttribute('aria-label', approvedText);
                        else mediaEl.setAttribute('alt', approvedText);
                    }
                }
            }
        }).catch(function() {});
    }


    /* ── Shared Video.js player lifecycle for chat stash videos ── */
    var activeChatPlayers = new Set();

    function initChatVideoPlayers(container) {
        if (!container) return;
        var videos = container.querySelectorAll ? container.querySelectorAll('video.zp-chat-stash-video') : [];
        if (!videos || videos.length === 0) return;
        var epochAtInit = sessionEpoch;
        for (var i = 0; i < videos.length; i++) {
            (function(videoEl) {
                if (videoEl._zpPlayer && !videoEl._zpPlayer.isDisposed()) return;
                if (!videoEl.isConnected) return;
                if (!window.attachVideoJsPlayer) return;

                var p = window.attachVideoJsPlayer(videoEl, { controls: true, preload: 'metadata', playsinline: true, responsive: true, fluid: true });

                p.then(function(player) {
                    if (!player) return;
                    if (sessionEpoch !== epochAtInit || !videoEl.isConnected) {
                        if (typeof player.dispose === 'function' && !player.isDisposed()) player.dispose();
                        return;
                    }
                    videoEl._zpPlayer = player;
                    activeChatPlayers.add(player);
                    if (typeof player.one === 'function') {
                        player.one('dispose', function() {
                            if (videoEl._zpPlayer === player) videoEl._zpPlayer = null;
                            activeChatPlayers.delete(player);
                        });
                    }
                }).catch(function() {
                    if (videoEl.isConnected) {
                        videoEl.controls = true;
                        videoEl.classList.remove('video-js');
                    }
                });
            })(videos[i]);
        }
    }

    function disposeChatVideoPlayers() {
        activeChatPlayers.forEach(function(player) {
            try {
                if (player && typeof player.dispose === 'function' && !player.isDisposed()) {
                    player.dispose();
                }
            } catch (e) {}
        });
        activeChatPlayers.clear();
    }

    /* ── Action proposals & suggestions lifecycle & state manager ── */
    var sessionEpoch = 0;

    function disableProposalCard(card) {
        if (!card) return;
        card.classList.add('zp-proposal-disabled');
        var btns = card.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) {
            btns[i].disabled = true;
        }
    }

    var chatActionState = (function() {
        var epoch = 0;
        var activeProposal = null; // { key, id, expiresAt, confirmMessage, cancelMessage, editMessage, cardEl }
        var activeSuggestions = null; // { key, rowEl }
        var consumedProposalIds = new Set();
        var activeExpiryTimer = null;
        var latestSeq = 0;

        function disposeTimer() {
            if (activeExpiryTimer) {
                clearTimeout(activeExpiryTimer);
                activeExpiryTimer = null;
            }
        }

        function staleControls() {
            if (activeProposal && activeProposal.cardEl) {
                disableProposalCard(activeProposal.cardEl);
            }
            activeProposal = null;
            disposeTimer();
            if (activeSuggestions && activeSuggestions.rowEl) {
                var btns = activeSuggestions.rowEl.querySelectorAll('button');
                for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
            }
            activeSuggestions = null;
        }

        function scheduleExpiry(expiresAt) {
            disposeTimer();
            if (typeof expiresAt === 'number' && Number.isFinite(expiresAt)) {
                var remaining = expiresAt - Date.now();
                if (remaining > 0) {
                    activeExpiryTimer = setTimeout(function() {
                        staleControls();
                    }, remaining);
                }
            }
        }

        function validateContract(proposal) {
            if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) return false;
            if (typeof proposal.id !== 'string' || !proposal.id.trim()) return false;
            if (typeof proposal.title !== 'string' || !proposal.title.trim()) return false;
            if (typeof proposal.summary !== 'string') return false;
            if (typeof proposal.confirmMessage !== 'string' || !proposal.confirmMessage.length || proposal.confirmMessage.length > 2000) return false;
            if (typeof proposal.cancelMessage !== 'string' || !proposal.cancelMessage.length || proposal.cancelMessage.length > 2000) return false;
            if (typeof proposal.editMessage !== 'string' || proposal.editMessage.length > 2000) return false;
            if (typeof proposal.expiresAt !== 'number' || !Number.isFinite(proposal.expiresAt)) return false;
            return true;
        }

        return {
            get epoch() { return epoch; },
            reset: function(newEpoch) {
                epoch = newEpoch;
                disposeTimer();
                activeProposal = null;
                activeSuggestions = null;
                consumedProposalIds.clear();
                latestSeq = 0;
            },
            onUserAction: function(ts) {
                latestSeq = Math.max(latestSeq, ts || Date.now());
                staleControls();
            },
            onAssistantMessage: function(ts) {
                latestSeq = Math.max(latestSeq, ts || Date.now());
                staleControls();
            },
            validateContract: validateContract,
            isProposalEligible: function(proposal, msgSeq) {
                if (!validateContract(proposal)) return false;
                if (consumedProposalIds.has(proposal.id)) return false;
                if (Date.now() >= proposal.expiresAt) return false;
                if (typeof msgSeq === 'number' && latestSeq > msgSeq) return false;
                return true;
            },
            setActiveProposal: function(key, proposal, cardEl) {
                activeProposal = {
                    key: key,
                    id: proposal.id,
                    expiresAt: proposal.expiresAt,
                    confirmMessage: proposal.confirmMessage,
                    cancelMessage: proposal.cancelMessage,
                    editMessage: proposal.editMessage,
                    cardEl: cardEl
                };
                scheduleExpiry(proposal.expiresAt);
            },
            setActiveSuggestions: function(key, rowEl) {
                activeSuggestions = { key: key, rowEl: rowEl };
            },
            isActionClickEligible: function(proposal, cardEl) {
                if (!proposal || consumedProposalIds.has(proposal.id)) return false;
                if (cardEl && (cardEl.dataset.consumed === 'true' || cardEl.classList.contains('zp-proposal-disabled'))) return false;
                if (Date.now() >= proposal.expiresAt) {
                    if (cardEl) disableProposalCard(cardEl);
                    staleControls();
                    return false;
                }
                return true;
            },
            consumeProposal: function(id) {
                if (id) consumedProposalIds.add(id);
                staleControls();
            },
            staleControls: staleControls,
            disposeTimer: disposeTimer
        };
    })();

    function sendOpaqueAction(text) {
        if (typeof text !== 'string' || !text.length || text.length > 2000 || sessionEnded) return;

        touchActivity();
        removeWelcome();
        removeStarters();

        var userTs = Date.now();
        var msgEl = addMessage('user', text, userTs);

        var tick = document.createElement('span');
        tick.className = 'zp-tick';
        tick.textContent = '…';
        tick.title = 'Sending';
        tick.dataset.ts = userTs;
        var timeEl = msgEl.querySelector('.zp-chat-msg-time');
        (timeEl || msgEl).appendChild(tick);

        if (zephyyOnline) {
            addThinkingBubble();
        }

        send(text).then(function() {
            tick.textContent = '✓';
            tick.title = 'Delivered';
            tick.classList.add('zp-delivered');
            cacheAppend('user', text, userTs);
        }).catch(function() {
            removeThinkingBubble();
            tick.textContent = '!';
            tick.title = 'Failed to send';
            tick.classList.add('zp-failed');
            addMessage('bot', '⚠️ Message didn\'t send. Try refreshing the page or check back later.', Date.now());
        });
    }

    function renderProposalCard(proposal, msgKey, msgSeq) {
        if (!chatActionState.validateContract(proposal)) return null;

        var isEligible = chatActionState.isProposalEligible(proposal, msgSeq);

        var title = proposal.title.trim().slice(0, 100);
        var summary = proposal.summary.trim().slice(0, 1000);
        var confirmMsg = proposal.confirmMessage;
        var cancelMsg = proposal.cancelMessage;
        var editMsg = proposal.editMessage;

        var card = document.createElement('div');
        card.className = 'zp-proposal-card' + (!isEligible ? ' zp-proposal-disabled' : '');
        card.setAttribute('role', 'region');
        card.setAttribute('aria-label', title);
        card.dataset.proposalId = proposal.id.slice(0, 100);
        if (msgKey) card.dataset.msgKey = msgKey;

        var head = document.createElement('div');
        head.className = 'zp-proposal-head';
        head.textContent = title;
        card.appendChild(head);

        if (summary) {
            var body = document.createElement('div');
            body.className = 'zp-proposal-summary';
            body.textContent = summary;
            card.appendChild(body);
        }

        var actions = document.createElement('div');
        actions.className = 'zp-proposal-actions';
        actions.setAttribute('role', 'group');
        actions.setAttribute('aria-label', 'Proposal actions');

        var confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'zp-proposal-btn zp-proposal-confirm';
        confirmBtn.textContent = title;
        confirmBtn.setAttribute('aria-label', title);
        if (!isEligible) confirmBtn.disabled = true;

        var editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'zp-proposal-btn zp-proposal-edit';
        editBtn.textContent = 'Edit request';
        editBtn.setAttribute('aria-label', 'Edit request');
        if (!isEligible) editBtn.disabled = true;

        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'zp-proposal-btn zp-proposal-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.setAttribute('aria-label', 'Cancel proposal');
        if (!isEligible) cancelBtn.disabled = true;

        confirmBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!chatActionState.isActionClickEligible(proposal, card)) return;
            card.dataset.consumed = 'true';
            chatActionState.consumeProposal(proposal.id);
            disableProposalCard(card);
            sendOpaqueAction(confirmMsg);
        });

        editBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!chatActionState.isActionClickEligible(proposal, card)) return;
            if (inputEl) {
                inputEl.value = editMsg;
                inputEl.focus();
            }
        });

        cancelBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!chatActionState.isActionClickEligible(proposal, card)) return;
            card.dataset.consumed = 'true';
            chatActionState.consumeProposal(proposal.id);
            disableProposalCard(card);
            sendOpaqueAction(cancelMsg);
        });

        actions.appendChild(confirmBtn);
        actions.appendChild(editBtn);
        actions.appendChild(cancelBtn);
        card.appendChild(actions);

        if (isEligible) {
            chatActionState.setActiveProposal(msgKey, proposal, card);
        }

        return card;
    }

    function isLegacyProtocolSuggestion(s) {
        if (!s || typeof s !== 'object') return false;
        var label = typeof s.label === 'string' ? s.label.trim() : '';
        var msg = typeof s.message === 'string' ? s.message.trim() : '';
        return /^(another|video)(\s+meme)?$/i.test(label) ||
               /^\[MEME(?::(?:random|video|next))?\]$/i.test(msg) ||
               /^\[[A-Z0-9_:-]+\]$/i.test(msg);
    }

    function normalizeSuggestion(s) {
        if (!s || typeof s !== 'object') return null;
        var label = typeof s.label === 'string' ? s.label.trim() : '';
        var msg = typeof s.message === 'string' ? s.message.trim() : '';
        if (!label || !msg) return null;

        // Exact supported legacy tokens and exact known label/message pairs ONLY, anchored whole input
        var isLegacyVideo = /^\[MEME(?::|\s+)?video\]$/i.test(msg) ||
                            (/^(video|show\s+a\s+video|video\s+meme|show\s+me\s+a\s+video\s+meme)$/i.test(label) &&
                             (/^(video|show\s+a\s+video|video\s+meme|show\s+me\s+a\s+video\s+meme)$/i.test(msg) || /^\[MEME(?::|\s+)?video\]$/i.test(msg)));
        var isLegacyAnother = /^\[MEME(?::|\s+)?(random|next)\]$/i.test(msg) ||
                              (/^\[MEME\]$/i.test(msg) && /^(another|another\s+meme|next|next\s+meme)$/i.test(label)) ||
                              (/^(another|another\s+meme|show\s+me\s+another\s+meme|next|next\s+meme)$/i.test(label) &&
                               /^(another|another\s+meme|show\s+me\s+another\s+meme|next|next\s+meme)$/i.test(msg));

        if (isLegacyVideo) {
            return {
                label: 'Show a video',
                message: 'Show me a video meme'
            };
        }
        if (isLegacyAnother) {
            return {
                label: 'Another meme',
                message: 'Show me another meme'
            };
        }

        var cleanMsg = msg;
        if (/^\[[A-Z0-9_:-]+\]$/i.test(cleanMsg) || cleanMsg.startsWith('[')) {
            if (label && !label.startsWith('[')) {
                cleanMsg = label;
            } else {
                return null;
            }
        }

        var cleanLabel = label || cleanMsg;
        if (!cleanLabel || cleanLabel.length > 60 || !cleanMsg || cleanMsg.length > 2000) return null;
        return {
            label: cleanLabel,
            message: cleanMsg
        };
    }

    function renderSuggestions(suggestions, msgKey) {
        if (!Array.isArray(suggestions) || suggestions.length === 0) return null;
        var valid = [];
        for (var i = 0; i < suggestions.length && valid.length < 2; i++) {
            var norm = normalizeSuggestion(suggestions[i]);
            if (norm) valid.push(norm);
        }
        if (valid.length === 0) return null;

        var row = document.createElement('div');
        row.className = 'zp-chat-suggestions';
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', 'Suggestions');
        if (msgKey) row.dataset.msgKey = msgKey;

        valid.forEach(function(s) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'zp-suggestion-chip';
            btn.textContent = s.label;
            btn.setAttribute('aria-label', s.label);
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (btn.disabled) return;
                var btns = row.querySelectorAll('button');
                for (var b = 0; b < btns.length; b++) btns[b].disabled = true;
                sendOpaqueAction(s.message);
            });
            row.appendChild(btn);
        });

        chatActionState.setActiveSuggestions(msgKey, row);
        return row;
    }

    function isFabricatedProtocolMessage(content) {
        if (typeof content !== 'string') return false;
        var trimmed = content.trim();
        return /^\[MEME(?::[^\]]*)?\]$/i.test(trimmed) || /^\[[A-Z_]+(?::[^\]]*)?\]$/i.test(trimmed);
    }

    function translateLegacyUserContent(content) {
        if (typeof content !== 'string') return content;
        var trimmed = content.trim();
        if (/^\[MEME(?::|\s+)?video\]$/i.test(trimmed)) {
            return 'Show me a video meme';
        }
        if (/^\[MEME(?::|\s+)?(random|next)\]$/i.test(trimmed)) {
            return 'Show me another meme';
        }
        if (/^\[MEME\]$/i.test(trimmed)) {
            return 'Gimme a meme';
        }
        var memeQuery = trimmed.match(/^\[MEME(?::|\s+)([^\]\r\n]+)\]$/i);
        if (memeQuery && memeQuery[1].trim()) {
            return 'Show me a meme about ' + memeQuery[1].trim();
        }
        if (/^\[THEME:generate\]$/i.test(trimmed)) {
            return 'Help me make a Printmon theme';
        }
        return content;
    }

    function addMessage(role, content, timestamp, meta, key) {
        if (role === 'assistant') role = 'bot';
        if (role === 'user') {
            content = translateLegacyUserContent(content);
        }

        var msgKey = key || (meta && meta.key);
        if (msgKey) {
            var msgs = messagesEl.childNodes || messagesEl.children || [];
            for (var mIdx = 0; mIdx < msgs.length; mIdx++) {
                if (msgs[mIdx].dataset && msgs[mIdx].dataset.msgKey === msgKey) {
                    return msgs[mIdx];
                }
            }
        } else if (role !== 'user') {
            var prev = messagesEl.querySelector('.zp-chat-msg-' + role + ':last-of-type[data-content]');
            if (prev && prev.dataset.content === content) return prev;
        }

        var ts = timestamp || Date.now();

        if (role === 'user') {
            chatActionState.onUserAction(ts);
        } else if (role === 'bot') {
            chatActionState.onAssistantMessage(ts);
        }

        var div = document.createElement('div');
        div.className = 'zp-chat-msg zp-chat-msg-' + role;
        div.dataset.content = content;
        if (msgKey) div.dataset.msgKey = msgKey;
        div.innerHTML = renderContent(content);

        if (role === 'bot' && meta) {
            if (meta.actionProposal) {
                var card = renderProposalCard(meta.actionProposal, msgKey, ts);
                if (card) div.appendChild(card);
            }
            if (meta.suggestions) {
                var sug = renderSuggestions(meta.suggestions, msgKey);
                if (sug) div.appendChild(sug);
            }
        }

        if (timestamp) {
            var time = document.createElement('div');
            time.className = 'zp-chat-msg-time';
            time.textContent = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            div.appendChild(time);
        }
        messagesEl.appendChild(div);
        initChatVideoPlayers(div);
        resolveStashCaptions(div);
        scrollToBottom();
        return div;
    }

    /* ── Image lightbox: store raw URLs keyed by element id so onclick
       can look up data URIs without inlining them in DOM attributes. ── */
    var imgUrlMap = {};

    /* ── Lightbox: inject once, reused for every image click ── */
    var lightboxEl = null;
    function ensureLightbox() {
        if (lightboxEl) return;
        lightboxEl = document.createElement('div');
        lightboxEl.className = 'zp-lightbox';
        lightboxEl.innerHTML =
            '<div class="zp-lightbox-bg"></div>' +
            '<button type="button" class="zp-lightbox-download" aria-label="Download image">Download</button>' +
            '<div class="zp-lightbox-close">&times;</div>' +
            '<img class="zp-lightbox-img" alt="">';
        lightboxEl.querySelector('.zp-lightbox-bg').addEventListener('click', closeLightbox);
        lightboxEl.querySelector('.zp-lightbox-close').addEventListener('click', closeLightbox);
        lightboxEl.querySelector('.zp-lightbox-download').addEventListener('click', downloadLightboxImage);
        document.body.appendChild(lightboxEl);
    }
    var currentLightboxImage = null;
    function openLightbox(item) {
        ensureLightbox();
        currentLightboxImage = item;
        var image = lightboxEl.querySelector('.zp-lightbox-img');
        image.src = item.url;
        image.alt = item.alt || 'Generated image';
        lightboxEl.classList.add('zp-lightbox--open');
        document.addEventListener('keydown', onLightboxKey);
    }
    function closeLightbox() {
        if (!lightboxEl) return;
        lightboxEl.classList.remove('zp-lightbox--open');
        document.removeEventListener('keydown', onLightboxKey);
    }
    function imageDownloadName(alt, url) {
        var base = (alt || 'zephyy-generated-image')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || 'zephyy-generated-image';
        var ext = '.png';
        if (/^data:image\/jpe?g/i.test(url) || /\.jpe?g(?:[?#]|$)/i.test(url)) ext = '.jpg';
        if (/^data:image\/webp/i.test(url) || /\.webp(?:[?#]|$)/i.test(url)) ext = '.webp';
        return base + ext;
    }
    function triggerDownload(url, filename) {
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
    function downloadLightboxImage(e) {
        if (e) e.stopPropagation();
        if (!currentLightboxImage || !currentLightboxImage.url) return;
        var url = currentLightboxImage.url;
        var filename = imageDownloadName(currentLightboxImage.alt, url);
        if (url.indexOf('data:image/') === 0) {
            triggerDownload(url, filename);
            return;
        }
        fetch(url)
            .then(function(resp) {
                if (!resp.ok) throw new Error('image fetch failed');
                return resp.blob();
            })
            .then(function(blob) {
                var objectUrl = URL.createObjectURL(blob);
                triggerDownload(objectUrl, filename);
                setTimeout(function() { URL.revokeObjectURL(objectUrl); }, 1000);
            })
            .catch(function() {
                window.open(url, '_blank', 'noopener,noreferrer');
            });
    }
    function copyText(value) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(value);
        }
        return new Promise(function(resolve, reject) {
            var textarea = document.createElement('textarea');
            textarea.value = value;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy') ? resolve() : reject(new Error('copy failed'));
            } catch (err) {
                reject(err);
            } finally {
                textarea.remove();
            }
        });
    }
    function setCopyButtonState(button, label) {
        var original = button.dataset.label || button.textContent;
        button.dataset.label = original;
        button.textContent = label;
        clearTimeout(button._zpCopyTimer);
        button._zpCopyTimer = setTimeout(function() {
            button.textContent = original;
        }, 1300);
    }
    function onLightboxKey(e) {
        if (e.key === 'Escape') closeLightbox();
    }

    // Delegate clicks on .zp-chat-img to the lightbox
    document.addEventListener('click', function(e) {
        var img = e.target.closest('.zp-chat-img');
        if (!img || !img.dataset.zpli) return;
        var item = imgUrlMap[img.dataset.zpli];
        if (item) openLightbox(item);
    });
    document.addEventListener('click', function(e) {
        var button = e.target.closest('.zp-chat-img-copy');
        if (!button || !button.dataset.zpli) return;
        var item = imgUrlMap[button.dataset.zpli];
        if (!item || !item.alt) return;
        copyText(item.alt)
            .then(function() {
                window.haptic?.(15);
                setCopyButtonState(button, 'Copied');
            })
            .catch(function() { setCopyButtonState(button, 'Failed'); });
    });

    /* ── Local message cache: instant paint on panel open, before the
       Firebase round-trip lands. Reconciled by loadMessages' full repaint. ── */
    var CACHE_KEY = 'zp-chat-cache';
    function readMsgCache() {
        try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || []; } catch (e) { return []; }
    }
    /* zephyy-live.js and -orb-embed.js ask this: a conversation going? */
    window.zephyyHasConvo = function() { return readMsgCache().length > 0; };
    function saveMsgCache(list) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(-30))); } catch (e) { /* quota — skip */ }
    }
    function cacheAppend(role, content, timestamp, meta) {
        var list = readMsgCache();
        var item = { role: role, content: content, timestamp: timestamp };
        if (meta && meta.actionProposal) item.actionProposal = meta.actionProposal;
        if (meta && meta.suggestions) item.suggestions = meta.suggestions;
        list.push(item);
        saveMsgCache(list);
    }

    function removeWelcome() {
        var w = document.getElementById('zp-welcome-msg');
        if (w) w.remove();
    }

    function setWelcomeText(text) {
        var w = document.getElementById('zp-welcome-msg');
        if (w) w.textContent = text;
    }

    /* Thinking/typing indicator — label defaults to 'thinking' (optimistic,
       shown right after send); 'typing' when driven by real orb state. */
    function addThinkingBubble(label) {
        var el = document.getElementById('zp-chat-thinking');
        if (el) el.remove();
        var div = document.createElement('div');
        div.className = 'zp-chat-msg zp-chat-msg-bot zp-chat-thinking';
        div.id = 'zp-chat-thinking';
        div.innerHTML = '<span class="zp-thinking-dots"><span>⚡</span><span class="zp-thinking-text">' + (label || 'thinking') + '</span><span class="zp-dot">.</span><span class="zp-dot">.</span><span class="zp-dot">.</span></span>';
        messagesEl.appendChild(div);
        scrollToBottom();
    }

    function removeThinkingBubble() {
        var el = document.getElementById('zp-chat-thinking');
        if (el) el.remove();
    }

    /* Remove starter chips & quick-reply elements from DOM */
    function removeStarters() {
        var r = document.getElementById('zp-starters-row');
        if (r) r.remove();
        var qr = document.getElementById('zp-quick-reply-row');
        if (qr) qr.remove();
        var nr = document.getElementById('zp-name-input-row');
        if (nr) nr.remove();
    }

    /* ================================================
     * 3. PAGE-AWARE STARTERS (replaces name prompt gate)
     * ================================================ */

    var STARTERS = [
        { id: 'meme', label: 'Gimme a meme', prompt: 'Gimme a meme' },
        { id: 'printmon', label: 'Make a Printmon theme', prompt: 'Help me make a Printmon theme' }
    ];

    function getOrderedStarters() {
        var p = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '';
        var priorityId = null;
        if (p.includes('/amazon/printmon') || p.includes('/printmon')) {
            priorityId = 'printmon';
        }

        if (!priorityId) return STARTERS.slice();

        var prioritized = [];
        var rest = [];
        STARTERS.forEach(function(s) {
            if (s.id === priorityId) {
                prioritized.push(s);
            } else {
                rest.push(s);
            }
        });
        return prioritized.concat(rest);
    }

    function showStarters() {
        if (quickReplied) return;
        var row = document.getElementById('zp-starters-row');
        if (row) return; // already shown
        /* Don't show starters if conversation already has user messages */
        var existingMsgs = messagesEl.querySelectorAll('.zp-chat-msg-user');
        if (existingMsgs.length > 0) return;

        row = document.createElement('div');
        row.id = 'zp-starters-row';
        row.className = 'zp-chat-msg zp-chat-msg-bot zp-starters-row';
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', 'Conversation starters');

        var starters = getOrderedStarters();
        starters.forEach(function(item) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'zp-starter-chip';
            btn.textContent = item.label;
            btn.setAttribute('data-starter', item.id);
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                removeStarters();
                sendText(item.prompt);
            });
            row.appendChild(btn);
        });

        messagesEl.appendChild(row);
        scrollToBottom();
    }

    function sendText(text) {
        if (!text) return;
        quickReplied = true; // prevent re-showing starters
        removeWelcome();
        removeStarters();
        inputEl.value = text;
        sendBtn.click();
    }

    /* ================================================
     * 4. FIREBASE OPERATIONS
     * ================================================ */

    /* The chat's Firebase connection (zephyy-live.js): the first ask loads the SDK and
       signs in, so opening the panel starts it and every send waits for it */
    function connect() {
        return window.__zpConnect ? window.__zpConnect() : Promise.reject(new Error('No chat connection'));
    }
    function send(text) {
        return connect().then(function(rt) { return rt.sendMessage(text); });
    }

    function loadMessages() {
        var currentEpoch = sessionEpoch;
        /* Instant paint from local cache while Firebase round-trips —
           the full repaint below reconciles any drift. */
        if (!messagesEl.querySelector('.zp-chat-msg')) {
            readMsgCache().forEach(function(m) {
                addMessage(m.role, m.content, m.timestamp, m, m.key);
            });
        }
        connect().catch(function(error) {
            if (currentEpoch !== sessionEpoch) return;
            addMessage('bot', 'Private chat could not connect. Please refresh or try again later.', Date.now());
            throw error;
        }).then(function(rt) {
            if (currentEpoch !== sessionEpoch) return null;
            return rt.loadHistory(50);
        }).then(function(snap) {
            if (!snap || currentEpoch !== sessionEpoch) return;
            if (!snap.exists()) { showStarters(); return; }
            var data = snap.val();
            var keys = Object.keys(data).sort(function (a, b) {
                return (data[a].timestamp - data[b].timestamp) || a.localeCompare(b);
            });
            if (keys.length === 0) { showStarters(); return; }

            disposeChatVideoPlayers();
            while (messagesEl.firstChild) {
                messagesEl.removeChild(messagesEl.firstChild);
            }

            var cacheList = [];
            keys.forEach(function(key) {
                var msg = data[key];
                addMessage(msg.role, msg.content, msg.timestamp, msg, key);
                var item = { role: msg.role, content: msg.content, timestamp: msg.timestamp, key: key };
                if (msg.actionProposal) item.actionProposal = msg.actionProposal;
                if (msg.suggestions) item.suggestions = msg.suggestions;
                cacheList.push(item);
            });
            saveMsgCache(cacheList);

            if (sessionEnded || (window.__zpRealtime && window.__zpRealtime.sessionEnded)) {
                /* Session ended while we were away — don't show dead history */
                startFreshSession();
                return;
            }
            removeWelcome();
            removeStarters();
            showStarters();
        }).catch(function() { /* silent */ });
    }

    function sendMessage() {
        if (sendBtn.disabled || sessionEnded) return;
        var text = inputEl.value.trim();
        if (!text) return;

        chatActionState.onUserAction(Date.now());

        sendBtn.disabled = true;
        inputEl.value = '';
        touchActivity();

        removeWelcome();
        removeStarters();

        var userTs = Date.now();
        var msgEl = addMessage('user', text, userTs);

        /* Delivery tick — pending until the RTDB push confirms */
        var tick = document.createElement('span');
        tick.className = 'zp-tick';
        tick.textContent = '…';
        tick.title = 'Sending';
        tick.dataset.ts = userTs;
        var timeEl = msgEl.querySelector('.zp-chat-msg-time');
        (timeEl || msgEl).appendChild(tick);

        if (zephyyOnline) {
            /* Optimistic thinking bubble + slow-response note, online only */
            addThinkingBubble();
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
        }

        send(text).then(function() {
            tick.textContent = '✓';
            tick.title = 'Delivered';
            tick.classList.add('zp-delivered');
            cacheAppend('user', text, userTs);
            /* Offline: no thinking bubble — set honest expectations once */
            if (!zephyyOnline && !offlineNoteShown) {
                offlineNoteShown = true;
                addMessage('bot', '📬 Delivered. Zephyy\'s recharging right now — she\'ll pick this up the moment she\'s back ⚡', Date.now());
            }
        }).catch(function() {
            removeThinkingBubble();
            tick.textContent = '!';
            tick.title = 'Failed to send';
            tick.classList.add('zp-failed');
            addMessage('bot', '⚠️ Message didn\'t send. Try refreshing the page or check back later.', Date.now());
            sendBtn.disabled = false;
        });

        sendBtn.disabled = false;
        inputEl.focus();
    }

    /* ================================================
     * 5. REALTIME MESSAGE HANDLER (replaces pollAndDetect)
     * ================================================ */

    /* ── Listen for new messages from Firebase realtime listener ── */
    window.addEventListener('zephyy-chat-error', function(e) {
        removeThinkingBubble();
        addMessage('bot', e.detail.message, Date.now());
    });

    window.addEventListener('zephyy-msg', function(e) {
        var msg = e.detail;
        var badge = document.getElementById('zp-model-badge');
        if (badge && msg.model) {
            badge.dataset.telemetryModel = msg.model;
            badge.textContent = /stash|deterministic/i.test(msg.model) ? 'Meme stash' : msg.model;
        }
        var panelOpen = panel.classList.contains('open');
        if (!panelOpen) {
            orb.classList.add('unread');
            return;
        }
        removeThinkingBubble();
        if (window.__zpSlowTimeout) { clearTimeout(window.__zpSlowTimeout); window.__zpSlowTimeout = null; }
        var sn = document.getElementById('zp-slow-note'); if (sn) sn.remove();
        addMessage(msg.role, msg.content, msg.timestamp, msg);
        cacheAppend(msg.role, msg.content, msg.timestamp, msg);
    });

    /* ── Control state extras: real typing indicator + seen receipts.
       The orb writes control.typing / control.lastSeen (secret-authed, so
       the locked rules don't apply) — until it does, these never fire. ── */
    var typingStaleTimer = null;
    function markSeen(lastSeen) {
        messagesEl.querySelectorAll('.zp-chat-msg-user .zp-tick').forEach(function(t) {
            if (Number(t.dataset.ts) <= lastSeen && !t.classList.contains('zp-seen')) {
                t.textContent = '⚡';
                t.title = 'Seen';
                t.classList.add('zp-seen');
            }
        });
    }
    window.addEventListener('zephyy-ctrl', function(e) {
        var ctrl = e.detail || {};
        if (typeof ctrl.visitorId === 'string') {
            try { localStorage.setItem('zp-visitor-id', ctrl.visitorId); } catch (err) { /* no-op */ }
        }
        if (ctrl.visitorForget === true) {
            try { localStorage.removeItem('zp-visitor-id'); } catch (err) { /* no-op */ }
            try { localStorage.removeItem(CACHE_KEY); } catch (err) { /* no-op */ }
            startFreshSession();
        }
        if (ctrl.typing) {
            if (panel.classList.contains('open')) addThinkingBubble('typing');
            /* Stale guard: if the orb crashes mid-typing, don't spin forever */
            clearTimeout(typingStaleTimer);
            typingStaleTimer = setTimeout(function() {
                typingStaleTimer = null;
                removeThinkingBubble();
            }, 30000);
        } else if (typingStaleTimer) {
            clearTimeout(typingStaleTimer);
            typingStaleTimer = null;
            removeThinkingBubble();
        }
        if (typeof ctrl.lastSeen === 'number') markSeen(ctrl.lastSeen);
    });

    /* ── Session end from Firebase (remote end, _SESSION_ENDED_, or our own
       idle write echoing back) → reset straight to a fresh session ── */
    window.addEventListener('zephyy-session-ended', function() {
        startFreshSession();
    });

    /* ── Message detection: handled exclusively by zephyy-live.js onValue listener.
       No polling fallback — that duplicated every message fetch. ── */

    /* ================================================
     * 6. INIT
     * ================================================ */

    /* ── A11y: announce replies, keyboard-operable orb, Esc closes ── */
    messagesEl.setAttribute('role', 'log');
    messagesEl.setAttribute('aria-live', 'polite');
    messagesEl.setAttribute('aria-relevant', 'additions');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Chat with Zephyy');
    panel.setAttribute('aria-hidden', 'true');
    panel.inert = true;
    orb.setAttribute('role', 'button');
    orb.setAttribute('tabindex', '0');
    orb.setAttribute('aria-label', 'Chat with Zephyy');
    orb.setAttribute('aria-controls', 'zp-chat-panel');
    orb.setAttribute('aria-expanded', 'false');
    orb.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel(); }
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && panel.classList.contains('open')) togglePanel();
    });

    /* Warm the connection while the pointer heads for the orb, so the panel opens to it ready */
    orb.addEventListener('pointerenter', function() { connect().catch(function() {}); }, { once: true });

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

    /* ── Fresh session — any session end resets to the first-load vibe:
       new session, clean panel, Zephyy ready to chat. No dead-end state,
       no "press Enter to restart" — the ended session just fades away. ── */
    var resettingSession = false;
    function startFreshSession() {
        if (resettingSession) return;
        resettingSession = true;
        sessionEpoch++;
        chatActionState.reset(sessionEpoch);
        disposeChatVideoPlayers();
        sessionEnded = false;
        touchActivity(); /* don't let the idle timer instantly re-fire on the new session */
        /* A fresh session greets like a first visit: new session, rebound Firebase refs */
        try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* storage blocked: nothing cached */ }
        connect().then(function(rt) { rt.resetSession(); }).catch(function() { /* no chat connection: nothing to reset */ });
        /* Wipe the panel back to the first-load state (keep any typed draft) */
        messagesEl.querySelectorAll('.zp-chat-msg').forEach(function(el) { el.remove(); });
        if (welcomeMsg) messagesEl.prepend(welcomeMsg);
        quickReplied = false;
        removeThinkingBubble();
        if (sendBtn) sendBtn.disabled = false;
        if (inputEl) { inputEl.placeholder = 'Message Zephyy...'; }
        if (panel.classList.contains('open')) {
            setTimeout(function() { showStarters(); }, 400);
        }
        resettingSession = false;
    }

    /* checkControl → replaced by zephyy-session-ended event from Firebase */

    /* ── Idle timeout (30 min) ── */
    var lastActivity = Date.now();
    function touchActivity() { lastActivity = Date.now(); }

    /* ── Events ── */
    orb.addEventListener('click', togglePanel);
    if (closeBtn) closeBtn.addEventListener('click', togglePanel);
    if (backdrop) backdrop.addEventListener('click', togglePanel);
    /* ── Refresh wipes the whole session, so it's a two-tap confirm:
       first tap arms the button for 3.5s, second tap actually resets. ── */
    var refreshBtn = document.getElementById("zp-chat-refresh");
    var refreshConfirmTimer = null;
    function disarmRefresh() {
        refreshBtn.classList.remove('confirming');
        refreshBtn.title = '';
        refreshBtn.setAttribute('aria-label', 'Refresh chat');
    }
    if (refreshBtn) refreshBtn.addEventListener("click", function() {
        clearTimeout(refreshConfirmTimer);
        if (!refreshBtn.classList.contains('confirming')) {
            refreshBtn.classList.add('confirming');
            refreshBtn.title = 'Start over? Tap again to confirm';
            refreshBtn.setAttribute('aria-label', 'Tap again to confirm starting over');
            refreshConfirmTimer = setTimeout(disarmRefresh, 3500);
            return;
        }
        disarmRefresh();
        window.haptic?.(8);
        startFreshSession(); /* a new server session too, not just a cleared screen */
    });
    sendBtn.addEventListener('click', function(e) {
        if (e.isTrusted && !sendBtn.disabled && !sessionEnded && inputEl.value.trim()) {
            window.haptic?.(8);
        }
        sendMessage();
    });
    inputEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    inputEl.addEventListener('input', touchActivity);
    messagesEl.addEventListener('scroll', touchActivity);
    messagesEl.addEventListener('touchmove', touchActivity);

    /* ── Idle timeout (30 min, only when panel open) ──
       Write 'ended' to the OLD session's control so the orb knows, then let
       the control watcher's zephyy-session-ended event drive the fresh reset
       (single reset path). Fallback resets directly if realtime is absent. ── */
    setInterval(function() {
        if (panel.classList.contains('open') && Date.now() - lastActivity > 30 * 60 * 1000) {
            if (window.__zpRealtime && window.__zpRealtime.controlRef) {
                window.__zpRealtime.controlRef.child('state').set('ended').catch(function() {
                    addMessage('bot', 'Could not confirm session closure.', Date.now());
                });
                /* safety net in case the local event doesn't echo */
                setTimeout(function() { startFreshSession(); }, 1500);
            } else {
                startFreshSession();
            }
            touchActivity(); /* don't re-fire while the reset settles */
        }
    }, 30000);

    /* ── Session keepalive: handled server-side via RTDB control watcher.
       Client no longer mutates message timestamps — that corrupted history. ── */

    /* Export test helpers in test environments */
    if (typeof window !== 'undefined') {
        window.__zpTest = {
            renderContent: renderContent,
            parseMediaUrl: parseMediaUrl,
            getOrderedStarters: getOrderedStarters,
            showStarters: showStarters,
            removeStarters: removeStarters,
            renderProposalCard: renderProposalCard,
            renderSuggestions: renderSuggestions,
            chatActionState: chatActionState,
            sendOpaqueAction: sendOpaqueAction,
            loadStashCatalog: loadStashCatalog,
            resolveStashCaptions: resolveStashCaptions,
            initChatVideoPlayers: initChatVideoPlayers,
            disposeChatVideoPlayers: disposeChatVideoPlayers,
            getActiveChatPlayers: function() { return activeChatPlayers; },
            setStashCatalogMap: function(m) { stashCatalogMap = m; },
            isFabricatedProtocolMessage: isFabricatedProtocolMessage,
            isLegacyProtocolSuggestion: isLegacyProtocolSuggestion,
            normalizeSuggestion: normalizeSuggestion,
            normalizeStashPath: normalizeStashPath,
            translateLegacyUserContent: translateLegacyUserContent
        };
    }
})();
