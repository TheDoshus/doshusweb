/* --- GLOBAL ANALYTICS --- */
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-KQ1RGHNMZG');

// Smooth scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });
});

// Deep Space Stars
const starsContainer = document.getElementById('stars');
if (starsContainer) {

    // ─── STAR LAYER CONFIG ───
    // Far = tiny & slow, Mid = medium, Close = big & fast
    const starLayers = [
        { count: 170, minSize: 0.5, maxSize: 1.5, className: 'star star-far',   drift: 0.3 },
        { count: 55, minSize: 1.5, maxSize: 2.8, className: 'star star-mid',   drift: 0.7 },
        { count: 20,  minSize: 2.8, maxSize: 4.5, className: 'star star-close', drift: 1.2 },
    ];

    // ─── CREATE STARS ───
    starLayers.forEach(layer => {
        for (let i = 0; i < layer.count; i++) {
            const star = document.createElement('div');
            star.className = layer.className;

            // Random position across the viewport
            star.style.left = Math.random() * 100 + '%';
            star.style.top = Math.random() * 100 + '%';

            // Random size within this layer's range
            const size = Math.random() * (layer.maxSize - layer.minSize) + layer.minSize;
            star.style.width = size + 'px';
            star.style.height = size + 'px';

            // Random twinkle timing
            star.style.animationDelay = Math.random() * 5 + 's';
            star.style.animationDuration = (Math.random() * 4 + 3) + 's';

            // Store drift speed for parallax calculations
            star.dataset.drift = layer.drift;

            starsContainer.appendChild(star);
        }
    });

    // ─── CACHE STAR ELEMENTS ───
    const allStars = starsContainer.querySelectorAll('.star');

    // ─── PARALLAX + DRIFT VARIABLES ───
    let mouseX = 0;
    let mouseY = 0;
    let currentX = 0;
    let currentY = 0;

    // ─── MOUSE PARALLAX (DESKTOP) ───
    document.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX / window.innerWidth - 0.5);
        mouseY = (e.clientY / window.innerHeight - 0.5);
    });

    // ─── FPS PERFORMANCE MONITOR ───
    let enableParallax = true;
    let frameCount = 0;
    let lastFpsCheck = performance.now();

    function checkPerformance() {
        frameCount++;
        const now = performance.now();

        if (now - lastFpsCheck >= 2000) {
            const fps = frameCount / ((now - lastFpsCheck) / 1000);

            if (fps < 30) {
                enableParallax = false;
                allStars.forEach(star => {
                    star.style.transform = '';
                });
            } else if (!enableParallax && fps > 45) {
                enableParallax = true;
            }

            frameCount = 0;
            lastFpsCheck = now;
        }
    }

    // ─── MAIN ANIMATION LOOP: PARALLAX + CONTINUOUS DRIFT ───
    function animateStars() {
        checkPerformance();

        if (enableParallax) {
            // Lerp: smoothly interpolate toward target mouse/gyro position
            currentX += (mouseX - currentX) * 0.12;
            currentY += (mouseY - currentY) * 0.12;

            // Update each star's position
            allStars.forEach(star => {
                const drift = parseFloat(star.dataset.drift) || 0.5;

                // Parallax offset from mouse
                const parallaxX = currentX * drift * 80;
                const parallaxY = currentY * drift * 80;

                // Get current position (or initialize if first frame)
                if (!star.dataset.x) {
                    const initialX = parseFloat(star.style.left);
                    const initialY = parseFloat(star.style.top);
                    star.dataset.x = isNaN(initialX) ? Math.random() * 100 : initialX;
                    star.dataset.y = isNaN(initialY) ? Math.random() * 100 : initialY;
                }

                // Continuous drift — stars slowly move diagonally
                // Faster drift for close stars, slower for far stars
                const driftSpeedX = drift * 0.04; // horizontal drift speed
                const driftSpeedY = drift * 0.01; // vertical drift speed

                // Update stored position
                let x = parseFloat(star.dataset.x) + driftSpeedX;
                let y = parseFloat(star.dataset.y) + driftSpeedY;

                // Wrap around screen edges
                if (x > 100) x = 0;
                if (x < 0) x = 100;
                if (y > 100) y = 0;
                if (y < 0) y = 100;

                // Store updated position
                star.dataset.x = x;
                star.dataset.y = y;

                // Apply position + parallax offset
                star.style.left = x + '%';
                star.style.top = y + '%';
                star.style.transform = `translate(${parallaxX}px, ${parallaxY}px)`;
            });
        }

        requestAnimationFrame(animateStars);
    }

    // Kick off the animation loop
    animateStars();
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
                const video = document.createElement('video');
                video.src = randomFile;
                video.autoplay = true;
                video.loop = true;
                video.muted = true;
                video.playsInline = true;
                video.style.width = '100%';
                video.style.height = '100%';
                video.style.objectFit = 'cover';
                video.style.borderRadius = '10px';

                video.onerror = function() {
                    container.innerHTML = '<img src="assets/images/Image_not_available.webp" alt="Error">';
                };

                container.appendChild(video);
                console.log(`🎬 Loaded video in container ${index + 1}: ${randomFile}`);
            } else {
                const img = document.createElement('img');
                img.src = randomFile;
                img.alt = 'Random Meme';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '10px';

                img.onerror = function() {
                    this.src = 'assets/images/Image_not_available.webp';
                };

                container.appendChild(img);
                console.log(`🎲 Loaded meme in container ${index + 1}: ${randomFile}`);
            }
        });

    } catch (error) {
        console.error('❌ Error loading memes:', error);
        // Fallback: Fill all broken containers with the error image
        document.querySelectorAll('.random-meme, .random-meme-fixed').forEach(c => {
            c.innerHTML = '<img src="assets/images/Image_not_available.webp" alt="Loading Error">';
        });
    }
}
window.addEventListener('DOMContentLoaded', loadUniversalMemes);

// ─── STICKY FOOTER: AUTO-HIDE + ALWAYS SHOW AT BOTTOM ───
let lastScrollY = window.scrollY;
const stickyFooter = document.getElementById('sticky-footer');
window.addEventListener('scroll', () => {
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