/**
 * ZEPHYY CHAT ORB
 * Split from zephyy.js 2026-07-12 — everything chat: panel UI, message
 * rendering (escapeHtml/renderContent), send flow, session lifecycle UX.
 *
 * Depends on zephyy-realtime.js (window.__zpRealtime API: msgsRef/controlRef,
 * loadHistory, resetSession, sessionEnded) — loaded before this file.
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

    /* Replace the 💬 placeholder with the dual-vortex glyph
       (local copy — the badge's glyphSVG lives in a separate IIFE closure) */
    const orbGlyphSVG = `
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="orbGlyphGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.98" />
                <stop offset="50%" stop-color="#d8f0ff" stop-opacity="0.9" />
                <stop offset="100%" stop-color="#ffffff" stop-opacity="0.75" />
            </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="29" stroke="#ffffff" stroke-opacity="0.2" stroke-width="0.8" fill="none"/>
        <g class="whorl-outer" style="transform-origin: 32px 32px">
            <path d="M 32 9 A 23 23 0 1 1 12 44"
                stroke="url(#orbGlyphGrad)" stroke-width="3.2" stroke-linecap="round" opacity="0.85"/>
            <circle cx="32" cy="9" r="2.0" fill="#ffffff" opacity="0.9"/>
        </g>
        <g class="whorl-mid" style="transform-origin: 32px 32px">
            <path d="M 45 40 A 15 15 0 1 1 32 17"
                stroke="url(#orbGlyphGrad)" stroke-width="3.4" stroke-linecap="round" opacity="0.9"/>
            <circle cx="45" cy="40" r="1.8" fill="#ffffff" opacity="0.95"/>
        </g>
        <g class="whorl-inner" style="transform-origin: 32px 32px">
            <path d="M 25 36 A 8 8 0 1 1 39 36"
                stroke="url(#orbGlyphGrad)" stroke-width="3.8" stroke-linecap="round" opacity="0.98"/>
            <circle cx="25" cy="36" r="1.6" fill="#ffffff" opacity="0.98"/>
        </g>
        <circle cx="32" cy="32" r="3.6" fill="#ffffff" class="whorl-center"/>
    </svg>
    `;
    if (orb && !orb.querySelector('.zp-orb-glyph')) {
        const orbGlyph = document.createElement('span');
        orbGlyph.className = 'zp-orb-glyph';
        orbGlyph.innerHTML = orbGlyphSVG;
        orb.insertBefore(orbGlyph, orb.firstChild);
        orb.classList.add('has-glyph');
    }

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

    /* ── Listen for online/offline status changes from Firebase listener.
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
            /* Focus input once the open transition settles */
            setTimeout(function() {
                if (inputEl && !inputEl.disabled) inputEl.focus();
            }, 350);
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

    function renderContent(text) {
        // Linkify BEFORE escaping — otherwise & in URLs gets corrupted to &amp;
        var placeholders = [];
        var imgPlaceholders = [];
        var i = 0;
        // 0. Markdown images: ![alt](url) → placeholder (must go before links)
        //    Accept https:// AND data: URIs (HuggingFace/Gemini return base64 data URIs)
        text = text.replace(/!\[([^\]]*)\]\(((?:https?:\/\/|data:image\/)[^\s)]+)\)/g, function(m, alt, url) {
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
        text = escapeHtml(text);
        // 4. Restore images from placeholders → click-to-expand lightbox
        imgPlaceholders.forEach(function(p) {
            var url = escapeHtml(p.url);
            var alt = escapeHtml(p.alt);
            var id = 'zpli' + (i++);
            // Store raw data off-DOM so large data URIs do not live in attributes.
            imgUrlMap[id] = { url: p.url, alt: p.alt };
            var html =
                '<figure class="zp-chat-img-card">' +
                    '<img src="' + url + '" alt="' + alt + '" data-zpli="' + id + '" class="zp-chat-img" loading="lazy">' +
                    '<figcaption class="zp-chat-img-meta">' +
                        '<span>Generated by Zephyy</span>' +
                        '<button type="button" class="zp-chat-img-copy" data-zpli="' + id + '">Copy prompt</button>' +
                    '</figcaption>' +
                '</figure>';
            text = text.replace(p.ph, function() { return html; });
        });
        // 5. Restore links from placeholders (escape label + url — they were captured raw before step 3)
        placeholders.forEach(function(p) {
            var html = '<a href="' + escapeHtml(p.url) + '" target="_blank" rel="noopener">' + escapeHtml(p.label) + '</a>';
            text = text.replace(p.ph, function() { return html; });
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
                window.open(url, '_blank', 'noopener');
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
            .then(function() { setCopyButtonState(button, 'Copied'); })
            .catch(function() { setCopyButtonState(button, 'Failed'); });
    });

    /* ── Local message cache: instant paint on panel open, before the
       Firebase round-trip lands. Reconciled by loadMessages' full repaint. ── */
    var CACHE_KEY = 'zp-chat-cache';
    function readMsgCache() {
        try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || []; } catch (e) { return []; }
    }
    function saveMsgCache(list) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(-30))); } catch (e) { /* quota — skip */ }
    }
    function cacheAppend(role, content, timestamp) {
        var list = readMsgCache();
        list.push({ role: role, content: content, timestamp: timestamp });
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
        /* Instant paint from local cache while Firebase round-trips —
           the full repaint below reconciles any drift. */
        if (!messagesEl.querySelector('.zp-chat-msg')) {
            readMsgCache().forEach(function(m) {
                addMessage(m.role, m.content, m.timestamp);
            });
        }
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

            var cacheList = [];
            keys.forEach(function(key) {
                var msg = data[key];
                addMessage(msg.role, msg.content, msg.timestamp);
                cacheList.push({ role: msg.role, content: msg.content, timestamp: msg.timestamp });
            });
            saveMsgCache(cacheList);

            if (sessionEnded || (window.__zpRealtime && window.__zpRealtime.sessionEnded)) {
                /* Session ended while we were away — don't show dead history */
                startFreshSession();
                return;
            }
            removeWelcome();
            removeQuickReplies();
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

        var userTs = Date.now();
        var msgEl = addMessage('user', text, userTs);

        /* Delivery tick — pending until the RTDB push confirms */
        var tick = document.createElement('span');
        tick.className = 'zp-tick';
        tick.textContent = '…';
        tick.title = 'Sending';
        tick.dataset.ts = userTs;
        msgEl.appendChild(tick);

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

        if (window.__zpRealtime) {
            window.__zpRealtime.msgsRef.push({
                role: 'user', content: text, timestamp: userTs
            }).then(function() {
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
        }

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
        cacheAppend(msg.role, msg.content, msg.timestamp);
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

    /* ── Message detection: handled exclusively by zephyy-realtime.js onValue listener.
       No polling fallback — that duplicated every message fetch. ── */

    /* ================================================
     * 6. INIT
     * ================================================ */

    /* ── A11y: announce replies, keyboard-operable orb, Esc closes ── */
    messagesEl.setAttribute('role', 'log');
    messagesEl.setAttribute('aria-live', 'polite');
    messagesEl.setAttribute('aria-relevant', 'additions');
    orb.setAttribute('role', 'button');
    orb.setAttribute('tabindex', '0');
    orb.setAttribute('aria-label', 'Chat with Zephyy');
    orb.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel(); }
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && panel.classList.contains('open')) togglePanel();
    });

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

    /* ── Fresh session — any session end resets to the first-load vibe:
       new session, clean panel, Zephyy ready to chat. No dead-end state,
       no "press Enter to restart" — the ended session just fades away. ── */
    var resettingSession = false;
    function startFreshSession() {
        if (resettingSession) return;
        resettingSession = true;
        sessionEnded = false;
        touchActivity(); /* don't let the idle timer instantly re-fire on the new session */
        /* Forget the visitor identity — a fresh session greets like a first visit */
        localStorage.removeItem('zp-visitor-name');
        localStorage.removeItem('zp-no-name');
        localStorage.removeItem(CACHE_KEY);
        /* New session + rebound Firebase refs via realtime's lifecycle API */
        if (window.__zpRealtime && window.__zpRealtime.resetSession) {
            sessionId = window.__zpRealtime.resetSession();
        } else {
            /* Realtime not loaded — swap localStorage so a reload picks it up */
            sessionId = crypto.randomUUID ? crypto.randomUUID() :
                'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    var r = Math.random() * 16 | 0;
                    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
                });
            localStorage.setItem('zephyy-chat-session', sessionId);
        }
        /* Wipe the panel back to the first-load state (keep any typed draft) */
        messagesEl.querySelectorAll('.zp-chat-msg, .zp-chat-ended').forEach(function(el) { el.remove(); });
        removeThinkingBubble();
        if (sendBtn) sendBtn.disabled = false;
        if (inputEl) { inputEl.placeholder = 'Message Zephyy...'; }
        if (panel.classList.contains('open')) {
            setTimeout(function() { showNamePrompt(); }, 400);
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
    var refreshBtn = document.getElementById("zp-chat-refresh");
    if (refreshBtn) refreshBtn.addEventListener("click", function() {
        localStorage.removeItem('zephyy-chat-session');
        localStorage.removeItem('zp-visitor-name');
        localStorage.removeItem('zp-no-name');
        localStorage.removeItem(CACHE_KEY);
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

    /* ── Idle timeout (30 min, only when panel open) ──
       Write 'ended' to the OLD session's control so the orb knows, then let
       the control watcher's zephyy-session-ended event drive the fresh reset
       (single reset path). Fallback resets directly if realtime is absent. ── */
    setInterval(function() {
        if (panel.classList.contains('open') && Date.now() - lastActivity > 30 * 60 * 1000) {
            if (window.__zpRealtime && window.__zpRealtime.controlRef) {
                window.__zpRealtime.controlRef.update({
                    state: 'ended', reason: 'idle_timeout', timestamp: Date.now()
                }).catch(function(){});
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
})();
