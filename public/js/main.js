/* --- GLOBAL ANALYTICS --- */
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
// Honor Global Privacy Control: a visitor whose browser says "don't track me" sends no analytics
if (!navigator.globalPrivacyControl) gtag('config', 'G-KQ1RGHNMZG');

// Smooth scrolling for in-page links lives in CSS (shared.css, html scroll-behavior)

// Respect the user's OS-level motion preference
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── HAPTICS ───
// Shared short-tap helper for click feedback sitewide. Silent no-op on
// browsers/devices without vibration support (desktop, iOS Safari).
function haptic(ms = 8) {
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
}

// Deep Space Stars
const starsContainer = document.getElementById('stars');
if (starsContainer) {

    // ─── STAR LAYER CONFIG ───
    // Far = tiny & slow, Mid = medium, Close = big & fast
    const starLayers = [
        { count: 170, minSize: 0.5, maxSize: 1.5, className: 'star star-far',   drift: 0.3 },
        { count: 55,  minSize: 1.5, maxSize: 2.8, className: 'star star-mid',   drift: 0.7 },
        { count: 20,  minSize: 2.8, maxSize: 4.5, className: 'star star-close', drift: 1.2 },
    ];

    // ─── RAM CACHE ───
    const starsData = [];

    // ─── CREATE STARS ───
    starLayers.forEach(layer => {
        for (let i = 0; i < layer.count; i++) {
            const star = document.createElement('div');
            star.className = layer.className;

            // Anchor the physical DOM element to the top left. 
            // We will move it purely with GPU transforms later.
            star.style.left = '0px';
            star.style.top = '0px';

            const size = Math.random() * (layer.maxSize - layer.minSize) + layer.minSize;
            star.style.width = size + 'px';
            star.style.height = size + 'px';

            star.style.animationDelay = Math.random() * 5 + 's';
            star.style.animationDuration = (Math.random() * 4 + 3) + 's';

            starsContainer.appendChild(star);

            // Populate the memory array with its initial randomized coordinates
            starsData.push({
                el: star,
                drift: layer.drift,
                x: Math.random() * 100, // Viewport Width percentage
                y: Math.random() * 100  // Viewport Height percentage
            });
        }
    });

    // ─── PARALLAX VARIABLES ───
    let mouseX = 0;
    let mouseY = 0;
    let currentX = 0;
    let currentY = 0;

    // ─── MOUSE PARALLAX (DESKTOP) ───
    document.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX / window.innerWidth - 0.5);
        mouseY = (e.clientY / window.innerHeight - 0.5);
    });

    // ─── FPS PERFORMANCE MONITOR (SUSTAINED RECOVERY) ───
    let isPaused = false;
    let frameCount = 0;
    let lastFpsCheck = performance.now();
    let consecutiveGoodSeconds = 0; // The recovery buffer

    let lastFrame = performance.now();

    function checkPerformance() {
        const now = performance.now();
        // One frame over a second is a hidden tab or a single hitch, not a slow page:
        // start a fresh window instead of judging the engine on it
        if (now - lastFrame > 1000) { frameCount = 0; lastFpsCheck = now; }
        lastFrame = now;
        frameCount++;
        const elapsed = now - lastFpsCheck;

        // Evaluate the frame rate once every 2.5 second
        if (elapsed >= 2500) { 
            const fps = frameCount / (elapsed / 1000);

            if (fps < 25) {
                isPaused = true;
                consecutiveGoodSeconds = 0; // Reset the recovery buffer if it chokes
            } else if (isPaused && fps >= 30) {
                consecutiveGoodSeconds++;
                // Require 5 straight clean checks (12.5 seconds) to unlock the engine
                if (consecutiveGoodSeconds >= 5) {
                    isPaused = false;
                    consecutiveGoodSeconds = 0;
                }
            }

            // Same low-FPS signal also eases off other ambient decorative CSS
            // animations (glows, spins, drifts) sitewide — not just the stars.
            document.body.classList.toggle('zp-motion-throttled', isPaused);

            frameCount = 0;
            lastFpsCheck = now;
        }
    }

    // ─── MAIN ANIMATION LOOP: TIME DILATION ENGINE ───
    let currentSpeed = 1; // 1 = 100% speed, 0 = fully paused

    function animateStars() {
        checkPerformance();

        // 1. Calculate Time Dilation (The Brake Pedal)
        const targetSpeed = isPaused ? 0 : 1;
        // Smoothly transition between moving and paused over several frames
        currentSpeed += (targetSpeed - currentSpeed) * 0.05; 

        // 2. Calculate Parallax Target
        // We calculate this regardless of speed so the internal math never jumps
        currentX += (mouseX - currentX) * 0.12;
        currentY += (mouseY - currentY) * 0.12;

        // 3. Iterate over the high-speed RAM array
        for (let i = 0; i < starsData.length; i++) {
            const star = starsData[i];

            // If the engine is fully paused (speed near 0), skip DOM writes entirely.
            // This is crucial: it relieves the CPU/GPU, allowing the FPS to actually recover.
            if (currentSpeed < 0.005 && isPaused) {
                continue; 
            }

            // Apply Time Dilation to the drift
            star.x += (star.drift * 0.04) * currentSpeed;
            star.y += (star.drift * 0.01) * currentSpeed;

            // Wrap around screen edges seamlessly
            // Subtraction is used instead of setting to 0 to prevent micro-stutters
            if (star.x > 100) star.x -= 100; 
            if (star.x < 0) star.x += 100;
            if (star.y > 100) star.y -= 100;
            if (star.y < 0) star.y += 100;

            // Apply Time Dilation to the parallax intensity
            const finalParallaxX = currentX * star.drift * 80 * currentSpeed;
            const finalParallaxY = currentY * star.drift * 80 * currentSpeed;

            // Single GPU-Accelerated DOM Write
            star.el.style.transform = `translate3d(calc(${star.x}vw + ${finalParallaxX}px), calc(${star.y}vh + ${finalParallaxY}px), 0)`;
        }

        requestAnimationFrame(animateStars);
    }

    if (prefersReducedMotion) {
        // Static starfield: place each star once, skip the drift/parallax loop
        starsData.forEach(star => {
            star.el.style.transform = `translate3d(${star.x}vw, ${star.y}vh, 0)`;
        });
    } else {
        // Kick off the animation loop
        animateStars();
    }
}

let videoJsLoadPromise;

// The one "meme unavailable" image every fallback uses
function memeUnavailable() {
    const img = document.createElement('img');
    img.src = '/assets/images/Image_not_available.webp';
    img.alt = 'Meme unavailable';
    return img;
}

// One observer for every meme video: play while it's on screen, pause once it scrolls away,
// and never restart one the visitor paused themselves. Saves decoding video nobody can see.
const memeVideoObserver = 'IntersectionObserver' in window && new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
        const player = target.memePlayer;
        if (!player || player.isDisposed()) return;
        if (!isIntersecting) player.pause();
        else if (!target.dataset.userPaused) player.play()?.catch(() => {});
    });
}, { threshold: 0.25 });

function loadVideoJs() {
    if (window.videojs) return Promise.resolve(window.videojs);

    if (!videoJsLoadPromise) {
        videoJsLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/assets/vendor/videojs/video.min.js';
            script.async = true;
            script.onload = () => {
                if (window.videojs) {
                    resolve(window.videojs);
                } else {
                    reject(new Error('Video.js loaded without exposing videojs'));
                }
            };
            script.onerror = () => reject(new Error('Video.js failed to load'));
            document.head.appendChild(script);
        });
    }

    return videoJsLoadPromise;
}

function createMemeIcon(className, paths) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add(className);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    paths.forEach(pathData => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        svg.appendChild(path);
    });

    return svg;
}

function createMemeVideoControls(player) {
    const controls = document.createElement('div');
    controls.className = 'meme-video-controls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Meme video controls');

    const playbackButton = document.createElement('button');
    playbackButton.type = 'button';
    playbackButton.className = 'meme-video-control';
    playbackButton.appendChild(createMemeIcon('meme-icon-play', ['M8 5v14l11-7z']));
    playbackButton.appendChild(createMemeIcon('meme-icon-pause', ['M8 5v14', 'M16 5v14']));

    const soundButton = document.createElement('button');
    soundButton.type = 'button';
    soundButton.className = 'meme-video-control';
    soundButton.appendChild(createMemeIcon('meme-icon-muted', [
        'M11 5 6 9H3v6h3l5 4V5Z',
        'm16 9 6 6',
        'm22 9-6 6',
    ]));
    soundButton.appendChild(createMemeIcon('meme-icon-volume', [
        'M11 5 6 9H3v6h3l5 4V5Z',
        'M15.5 8.5a5 5 0 0 1 0 7',
        'M19 5a10 10 0 0 1 0 14',
    ]));

    const syncPlaybackButton = () => {
        const isPaused = player.paused();
        const label = isPaused ? 'Play meme video' : 'Pause meme video';
        playbackButton.dataset.state = isPaused ? 'paused' : 'playing';
        playbackButton.setAttribute('aria-label', label);
        playbackButton.title = label;
    };

    const syncSoundButton = () => {
        const isMuted = player.muted();
        const label = isMuted ? 'Unmute meme video' : 'Mute meme video';
        soundButton.dataset.state = isMuted ? 'muted' : 'audible';
        soundButton.setAttribute('aria-label', label);
        soundButton.title = label;
    };

    playbackButton.addEventListener('click', event => {
        event.stopPropagation();
        haptic();
        // Remember a visitor's own pause so scrolling back doesn't restart it
        const slot = playbackButton.closest('.random-meme, .random-meme-fixed');
        if (slot) slot.dataset.userPaused = player.paused() ? '' : '1';
        if (player.paused()) {
            const playAttempt = player.play();
            if (playAttempt) playAttempt.catch(syncPlaybackButton);
        } else {
            player.pause();
        }
    });

    soundButton.addEventListener('click', event => {
        event.stopPropagation();
        haptic();
        player.muted(!player.muted());
    });

    player.on('play', syncPlaybackButton);
    player.on('pause', syncPlaybackButton);
    player.on('volumechange', syncSoundButton);
    syncPlaybackButton();
    syncSoundButton();

    controls.appendChild(playbackButton);
    controls.appendChild(soundButton);
    return controls;
}

async function renderVideoMeme(container, randomFile) {
    let player;
    let hasFailed = false;

    const showFallback = () => {
        if (hasFailed) return;
        hasFailed = true;
        if (memeVideoObserver) memeVideoObserver.unobserve(container);
        if (player && !player.isDisposed()) player.dispose();
        container.classList.remove('meme-video-active');
        container.replaceChildren(memeUnavailable());
    };

    const video = document.createElement('video');
    video.className = 'video-js';
    video.src = randomFile;
    // No autoplay: the observer starts it once it's on screen, so only metadata loads before then
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = memeVideoObserver ? 'metadata' : 'auto';
    video.addEventListener('error', showFallback, { once: true });

    container.classList.add('meme-video-active');
    container.appendChild(video);

    try {
        const videojs = await loadVideoJs();
        if (!video.isConnected || hasFailed) return;

        player = videojs(video, {
            autoplay: false,
            loop: true,
            muted: true,
            playsinline: true,
            preload: memeVideoObserver ? 'metadata' : 'auto',
            controls: false,
            bigPlayButton: false,
            controlBar: false,
        });
        player.one('error', showFallback);
        container.appendChild(createMemeVideoControls(player));
        player.ready(() => {
            player.muted(true);
            player.loop(true);
            container.memePlayer = player;
            if (memeVideoObserver) memeVideoObserver.observe(container);
            else player.play()?.catch(() => {});
        });
    } catch {
        showFallback();
    }
}

// Universal meme/video loader - Auto-loads from JSON on ANY page
async function loadUniversalMemes() {
    // Find ALL meme containers on the current page using their CSS classes
    const containers = document.querySelectorAll('.random-meme, .random-meme-fixed');
    if (containers.length === 0) return; // If no containers exist on this page, silently stop running

    try {
        const response = await fetch('/assets/memes/meme-list.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const memeFiles = await response.json();
        if (memeFiles.length === 0) return;

        // Shuffle once, then deal one per container, so a page never shows the same meme twice
        for (let i = memeFiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [memeFiles[i], memeFiles[j]] = [memeFiles[j], memeFiles[i]];
        }

        containers.forEach((container, index) => {
            const memeFile = memeFiles[index % memeFiles.length];
            container.replaceChildren(); // Clear any existing content

            if (/\.(mp4|webm|avi|wmv|flv|mkv|mov)$/i.test(memeFile)) {
                renderVideoMeme(container, memeFile);
                return;
            }
            // Size and fit come from each page's CSS (.random-meme img / .random-meme-fixed img)
            const img = document.createElement('img');
            img.src = memeFile;
            img.alt = 'Random Meme';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.addEventListener('error', () => img.replaceWith(memeUnavailable()), { once: true });
            container.appendChild(img);
        });
    } catch {
        // Fallback: Fill all broken containers with the error image
        containers.forEach(c => c.replaceChildren(memeUnavailable()));
    }
}
window.addEventListener('DOMContentLoaded', loadUniversalMemes);

// ─── UNIVERSAL COLLAPSIBLE SECTIONS & MODALS ───
// Collapsibles are native <details class="collapse">: the browser opens, closes and announces
// them. `toggle` doesn't bubble, so it's caught on the way down.
document.addEventListener('toggle', (e) => {
    if (!e.target.matches?.('.collapse')) return;
    haptic();
    // Inside the Finance Hub slider: keep resizing it while the section eases open or closed
    if (typeof syncSliderHeight !== 'function') return;
    const easing = new ResizeObserver(() => syncSliderHeight());
    easing.observe(e.target);
    setTimeout(() => easing.disconnect(), 600);
}, true);

// Modals are native <dialog class="srcOverlay">: showModal() brings focus trapping, the Escape
// key and an inert page behind it for free. The ✕ sits in a <form method="dialog">, which closes
// it with no script.
document.querySelectorAll('.srcBtn').forEach(btn => {
    btn.addEventListener('click', () => {
        haptic();
        document.getElementById(btn.dataset.target)?.showModal();
    });
});
// Clicking the dark background (the dialog itself, outside its card) closes it too
document.querySelectorAll('dialog.srcOverlay').forEach(dialog => {
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
});

// ─── STICKY FOOTER: AUTO-HIDE + ALWAYS SHOW AT BOTTOM ───
let lastScrollY = window.scrollY;
const stickyFooter = document.getElementById('sticky-footer');
if (stickyFooter) {
    stickyFooter.querySelectorAll('.footer-nav a').forEach(link => {
        link.addEventListener('click', () => haptic());
    });
}
if (stickyFooter) window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    const scrollPosition = window.scrollY + window.innerHeight;
    const pageHeight = document.documentElement.scrollHeight;

    // Always show footer when near the bottom (within 50px)
    if (pageHeight - scrollPosition < 50) {
        stickyFooter.classList.remove('footer-hidden');
    }
    // Scrolling DOWN — hide footer
    else if (currentScrollY > lastScrollY && currentScrollY > 100) {
        stickyFooter.classList.add('footer-hidden');
    }
    // Scrolling UP — show footer
    else {
        stickyFooter.classList.remove('footer-hidden');
    }
    lastScrollY = currentScrollY;
});
// ─── DISCORD WIDGET (shared component: lounge section + home modal) ───
// Pulls live presence from the Discord widget API and renders it in-house.
// Falls back to a static join card if unreachable (adblock/shields, widget
// disabled, Discord down). Widgets with [data-autoload] populate on page
// load; others (the home modal) call window.populateDiscordWidget on open.
const DISCORD_GUILD_ID = '1026149685846605925';
const DISCORD_MAX_AVATARS = 12;

window.populateDiscordWidget = async function(widget) {
    if (!widget || widget.dataset.loaded) return;
    widget.dataset.loaded = '1';

    const nameEl = widget.querySelector('.discord-server-name');
    const countEl = widget.querySelector('.discord-count');
    const membersEl = widget.querySelector('.discord-members');
    const joinEl = widget.querySelector('.discord-join');
    if (!countEl || !membersEl) return; // markup without the live parts: leave the static card

    try {
        const res = await fetch(`https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`);
        if (!res.ok) throw new Error(`widget API ${res.status}`);
        const data = await res.json();

        if (data.name && nameEl) nameEl.textContent = data.name;
        if (data.instant_invite && joinEl) joinEl.href = data.instant_invite;

        const online = data.presence_count ?? (data.members ? data.members.length : 0);
        countEl.textContent = online === 0 ? 'quiet right now — be the first in'
            : online === 1 ? '1 member online now'
            : `${online} members online now`;

        // Avatar bubbles for whoever's on right now
        membersEl.textContent = '';
        (data.members || []).slice(0, DISCORD_MAX_AVATARS).forEach(member => {
            const bubble = document.createElement('span');
            bubble.className = 'discord-member';
            if (member.status === 'idle' || member.status === 'dnd') {
                bubble.classList.add(`status-${member.status}`);
            }

            const img = document.createElement('img');
            img.src = member.avatar_url;
            img.alt = member.username;
            img.loading = 'lazy';
            img.title = member.game ? `${member.username} — playing ${member.game.name}` : member.username;
            img.onerror = function() { bubble.remove(); };

            bubble.appendChild(img);
            membersEl.appendChild(bubble);
        });

        const extras = online - Math.min(online, DISCORD_MAX_AVATARS);
        if (extras > 0) {
            const more = document.createElement('span');
            more.className = 'discord-more';
            more.textContent = `+${extras} more`;
            membersEl.appendChild(more);
        }
    } catch (error) {
        // Static fallback — still sells the click
        widget.classList.add('discord-offline');
        countEl.textContent = "the chat's always open — tap in";
    }
};

window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.discord-widget[data-autoload]').forEach(w => window.populateDiscordWidget(w));
});

// 404 "Go Back": the CSP refuses javascript: URLs; without history the link just goes home.
const backLink = document.querySelector('[data-back]');
if (backLink && history.length > 1) backLink.addEventListener('click', (e) => { e.preventDefault(); history.back(); });
