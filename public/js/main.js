/* --- GLOBAL ANALYTICS --- */
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-KQ1RGHNMZG');

// Smooth scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href.length < 2) return; // bare "#" — nothing to scroll to
        e.preventDefault();
        haptic();
        const target = document.getElementById(href.slice(1));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });
});

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

    function checkPerformance() {
        frameCount++;
        const now = performance.now();
        const elapsed = now - lastFpsCheck;

        // Evaluate the frame rate once every 2.5 second
        if (elapsed >= 2500) { 
            const fps = frameCount / (elapsed / 1000);

            if (fps < 25) {
                isPaused = true;
                consecutiveGoodSeconds = 0; // Reset the recovery buffer if it chokes
            } else if (isPaused && fps >= 30) {
                consecutiveGoodSeconds++;
                // Require 5 straight seconds of clean performance to unlock the engine
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
        if (player && !player.isDisposed()) player.dispose();
        container.classList.remove('meme-video-active');
        const fallbackImage = document.createElement('img');
        fallbackImage.src = '/assets/images/Image_not_available.webp';
        fallbackImage.alt = 'Error';
        container.replaceChildren(fallbackImage);
    };

    const video = document.createElement('video');
    video.className = 'video-js';
    video.src = randomFile;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.addEventListener('error', showFallback, { once: true });

    container.classList.add('meme-video-active');
    container.appendChild(video);

    try {
        const videojs = await loadVideoJs();
        if (!video.isConnected || hasFailed) return;

        player = videojs(video, {
            autoplay: 'muted',
            loop: true,
            muted: true,
            playsinline: true,
            preload: 'auto',
            controls: false,
            bigPlayButton: false,
            controlBar: false,
        });
        player.one('error', showFallback);
        container.appendChild(createMemeVideoControls(player));
        player.ready(() => {
            player.muted(true);
            player.loop(true);
            const playAttempt = player.play();
            if (playAttempt) playAttempt.catch(() => {});
        });
    } catch {
        showFallback();
    }
}

// Universal meme/video loader - Auto-loads from JSON on ANY page
async function loadUniversalMemes() {
    try {
        // Find ALL meme containers on the current page using their CSS classes
        const containers = document.querySelectorAll('.random-meme, .random-meme-fixed');
        
        if (containers.length === 0) return; // If no containers exist on this page, silently stop running

        const response = await fetch('/assets/memes/meme-list.json');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const memeFiles = await response.json();

        if (memeFiles.length === 0) {
            console.warn('⚠️ No memes found in meme-list.json');
            return;
        }

        // Loop through every container found and inject a random meme into each
        containers.forEach((container, index) => {
            const randomIndex = Math.floor(Math.random() * memeFiles.length);
            const randomFile = memeFiles[randomIndex];
            const isVideo = /\.(mp4|webm|avi|wmv|flv|mkv|mov)$/i.test(randomFile);

            container.innerHTML = ''; // Clear any existing content

            if (isVideo) {
                renderVideoMeme(container, randomFile);
            } else {
                const img = document.createElement('img');
                img.src = randomFile;
                img.alt = 'Random Meme';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '10px';

                img.onerror = function() {
                    this.src = '/assets/images/Image_not_available.webp';
                };

                container.appendChild(img);
            }
        });

    } catch (error) {
        console.error('❌ Error loading memes:', error);
        // Fallback: Fill all broken containers with the error image
        document.querySelectorAll('.random-meme, .random-meme-fixed').forEach(c => {
            c.innerHTML = '<img src="/assets/images/Image_not_available.webp" alt="Loading Error">';
        });
    }
}
window.addEventListener('DOMContentLoaded', loadUniversalMemes);

// ─── UNIVERSAL COLLAPSIBLE SECTIONS & MODALS ───
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Handle all Collapsible Sections (Accordions)
    document.querySelectorAll('.collapseBtn').forEach(btn => {
        btn.addEventListener('click', function() {
            haptic();
            this.parentElement.classList.toggle('open');
            
            // If we are inside the Finance Hub slider, tell the slider to resize
            if (typeof syncSliderHeight === 'function') {
                syncSliderHeight();
            }
        });
    });

    // 2. Handle opening Modals via data-target
    document.querySelectorAll('.srcBtn').forEach(btn => {
        btn.addEventListener('click', function() {
            haptic();
            const targetId = this.getAttribute('data-target');
            const targetModal = document.getElementById(targetId);
            if (targetModal) targetModal.classList.add('open');
        });
    });

    // 3. Handle closing Modals (Clicking the X)
    document.querySelectorAll('.srcClose').forEach(btn => {
        btn.addEventListener('click', function() {
            haptic();
            this.closest('.srcOverlay').classList.remove('open');
        });
    });

    // 4. Handle closing Modals (Clicking the dark background)
    document.querySelectorAll('.srcOverlay').forEach(overlay => {
        overlay.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('open');
            }
        });
    });
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
