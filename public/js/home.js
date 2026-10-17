// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    initCTApop();
    loadWorkLinks(); // builds the Amazonian Spot pills, then runs initAmazonLinkToggle()

    // Wire up Slack Button
    const slackText = document.getElementById('slackText');
    if (slackText) slackText.addEventListener('click', handleSlackClick);

    initSpotifyEmbed();
    initDiscordModal();
});

// ─── AMAZONIAN SPOT WORK LINKS ───
// Pill links, work email, and Slack URL live in RTDB at /config/worklinks
// so they stay out of the public repo. Shape:
// { email, slackUrl, pills: [{ internal, external, internalText, externalText, amzn }] }
let workConfig = null;
function loadWorkLinks() {
    const container = document.getElementById('workLinks');
    if (!container) return;

    fetch('https://doshusweb-default-rtdb.firebaseio.com/config/worklinks.json')
        .then((r) => r.json())
        .then((cfg) => {
            if (!cfg || !Array.isArray(cfg.pills)) return;
            workConfig = cfg;

            const slackText = document.getElementById('slackText');
            if (slackText && cfg.email) slackText.textContent = cfg.email;

            cfg.pills.forEach((pill) => {
                const link = document.createElement('a');
                link.className = 'pillBtn amazon-link' + (pill.amzn ? ' amzn' : '');
                link.dataset.internal = pill.internal;
                link.dataset.external = pill.external;
                link.dataset.internalText = pill.internalText;
                link.dataset.externalText = pill.externalText;
                link.target = '_blank';
                link.addEventListener('click', () => haptic());
                container.appendChild(link);
            });
            initAmazonLinkToggle(); // sets href/text on the fresh pills
            container.dispatchEvent(new Event('load')); // the box grew: the board measures it again, as when a picture arrives
        })
        .catch(() => {
            /* RTDB unreachable — hide the toggle, leave the section text */
            const toggleWrap = document.querySelector('.link-toggle-container');
            if (toggleWrap) { toggleWrap.style.display = 'none'; toggleWrap.dispatchEvent(new Event('load')); } // the board measures the box again
        });
}

// ─── DISCORD WIDGET MODAL ───
// Socials Discord button opens a popup (a <dialog>, opened by main.js) with the embedded server
// widget (custom-styled, populated by main.js on first open — no requests to Discord for visitors
// who never click) and a click-to-copy username chip.
function initDiscordModal() {
    const openBtn = document.getElementById('discordSocial');
    const modal = document.getElementById('discordPopup');
    const copyBtn = document.getElementById('copyDiscordUser');

    if (!openBtn || !modal) return;

    openBtn.addEventListener('click', () => window.populateDiscordWidget(modal.querySelector('.discord-widget')));

    // Click-to-copy username chip
    if (copyBtn) {
        const label = document.getElementById('discordUserText');
        const username = copyBtn.dataset.username;
        let resetTimer = null;

        copyBtn.addEventListener('click', async function() {
            haptic();
            try {
                await navigator.clipboard.writeText(username);
                copyBtn.classList.add('copied');
                label.textContent = 'copied! ✓';
                clearTimeout(resetTimer);
                resetTimer = setTimeout(() => {
                    copyBtn.classList.remove('copied');
                    label.textContent = username;
                }, 1600);
            } catch {
                // Clipboard API blocked (http, permissions) — let them copy manually
                window.prompt('Copy my Discord username:', username);
            }
        });
    }
}

// --- Feature Functions Below ---
function initSpotifyEmbed() {
    const playlistIds = [
        '7oanTkXtuVwcAUx882IQqD', '1lHiEucVsKf04tip7VetOo', '0s3TtgkY01p1L8PRqUggVV',
        '1YnNTk8GPvXPDJdzktSwwJ', '6BIUohSTfEaLfuFlWvtAVd', '1Z5J2B3Y218mcndyLLLOCN',
        '4BCpeg24zmnImrDSEVfEm0', '0dtsgsCgovlqVMCf5DNraj', '1BC12paN2yVqj81zHzB2B1',
        '2HrlpE0Cu2fXDubcHaBpsF'
    ];
    const iframe = document.getElementById('spotify-embed');
    if (iframe) {
        const selectedId = playlistIds[Math.floor(Math.random() * playlistIds.length)];
        iframe.src = `https://open.spotify.com/embed/playlist/${selectedId}`;
    }
}

// CTA Popup Box - "What's the move?" (a <dialog>, opened by main.js): each button closes it and
// glides to its section
function initCTApop() {
    const modal = document.getElementById('ctaPopup');
    if (!modal) return;

    modal.querySelectorAll('.ctaPopup-btn').forEach(button => {
        button.addEventListener('click', function() {
            haptic();
            const targetSection = document.getElementById(this.dataset.target);
            if (!targetSection) return;
            modal.close();
            targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

// Reveal Slack Handle / Launch Slack
let slackRevealed = false;
function handleSlackClick() {
    haptic();
    const slackText = document.getElementById('slackText');
    if (!workConfig || !workConfig.email) return; // config not loaded — stay blurred

    if (!slackRevealed) {
        // First click: Remove the blur to reveal the handle
        slackText.classList.remove('email-hidden');
        slackText.classList.add('email-revealed');
        slackRevealed = true;
    } else if (workConfig.slackUrl) {
        // Second click: Execute the redirect to Slack
        window.open(workConfig.slackUrl, '_blank', 'noopener,noreferrer');
    }
}

// Amazon Link Toggle - Switch between internal and external links
function initAmazonLinkToggle() {
    const toggle = document.getElementById('linkToggle');
    const toggleText = document.getElementById('toggleText');
    const amazonLinks = document.querySelectorAll('.amazon-link');
  
    if (!toggle || !toggleText || amazonLinks.length === 0) return;
  
    // Load saved preference or default to false (internal links)
    toggle.checked = store.get('amazonLinkPreference') === 'true';
  
    // Function to update all links
    function updateLinks() {
        const isExternal = toggle.checked;

        amazonLinks.forEach(link => {
            const internalUrl = link.getAttribute('data-internal');
            const externalUrl = link.getAttribute('data-external');
            const internalText = link.getAttribute('data-internal-text');
            const externalText = link.getAttribute('data-external-text');

            if (isExternal) {
                // Switch to external links
                link.href = externalUrl;
                link.textContent = externalText;
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
                toggleText.textContent = 'External Links';
            } else {
                // Switch to internal links
                link.href = internalUrl;
                link.textContent = internalText;

                if (!internalUrl.startsWith('http')) {
                    link.removeAttribute('target');
                    link.removeAttribute('rel');
                }
                toggleText.textContent = 'Internal Links';
            }
        });
    }
    
    updateLinks();
  
    // Toggle function
    toggle.addEventListener('change', function() {
        haptic();
        updateLinks();
  
        // Save preference to localStorage
        store.set('amazonLinkPreference', this.checked);
  
        // Visual feedback
        toggleText.style.transform = 'scale(1.1)';
        setTimeout(() => {
            toggleText.style.transform = 'scale(1)';
        }, 200);
    });
}