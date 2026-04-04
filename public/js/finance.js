document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.getElementById('sources-modal')?.classList.remove('open'); });

// ═══════════════════════════════════════
// FINANCE CARD SLIDER: SWIPE + NAV + LOCALSTORAGE + DYNAMIC HEIGHT
// ═══════════════════════════════════════
const slides = document.getElementById('finance-slides');
const allSlides = document.querySelectorAll('.finance-slide');
const navDots = document.querySelectorAll('.nav-dot');
const prevBtn = document.getElementById('slide-prev');
const nextBtn = document.getElementById('slide-next');
const progressFill = document.getElementById('nav-progress-fill');
let currentSlide = 0;
const totalSlides = allSlides.length;
const STORAGE_KEY = 'financeSlidePosition';

// ─── GO TO SLIDE FUNCTION ───
// Handles slide navigation, nav dot updates, progress bar, and localStorage
function goToSlide(index, saveToStorage = true) {
    if (index < 0 || index >= totalSlides) return;
    currentSlide = index;

    // Slide the container horizontally
    slides.style.transform = `translateX(-${currentSlide * 100}%)`;

    // ─── DYNAMIC HEIGHT ADJUSTMENT ───
    // Use requestAnimationFrame to ensure the DOM has updated before measuring
    requestAnimationFrame(() => {
        const activeSlide = allSlides[currentSlide];
        const slideHeight = activeSlide.scrollHeight;
        slides.style.height = slideHeight + 'px';
    });

    // Update nav dots
    navDots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentSlide);
        if (i === currentSlide) {
            const accent = dot.dataset.accent;
            dot.style.setProperty('--dot-color', accent);
            progressFill.style.background = accent;
        }
    });

    // Update progress line fill (0% at first slide, 100% at last slide)
    const progressPercent = (currentSlide / (totalSlides - 1)) * 100;
    progressFill.style.width = progressPercent + '%';

    // Update arrow states (disable at edges)
    prevBtn.disabled = currentSlide === 0;
    nextBtn.disabled = currentSlide === totalSlides - 1;

    // Save to localStorage (unless we're restoring from it)
    if (saveToStorage) {
        localStorage.setItem(STORAGE_KEY, currentSlide);
    }
}

// ─── ARROW CLICKS ───
prevBtn.addEventListener('click', () => goToSlide(currentSlide - 1));
nextBtn.addEventListener('click', () => goToSlide(currentSlide + 1));

// ─── DOT CLICKS ───
navDots.forEach(dot => {
    dot.addEventListener('click', () => {
        goToSlide(parseInt(dot.dataset.slide));
    });
});

// ─── TOUCH SWIPE (MOBILE) ───
let touchStartX = 0;
let touchEndX = 0;
const swipeThreshold = 50; // minimum px to count as a swipe

slides.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

slides.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;

    if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
            // Swiped left → next slide
            goToSlide(currentSlide + 1);
        } else {
            // Swiped right → previous slide
            goToSlide(currentSlide - 1);
        }
    }
}, { passive: true });

// ─── KEYBOARD NAVIGATION ───
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') goToSlide(currentSlide + 1);
    if (e.key === 'ArrowLeft') goToSlide(currentSlide - 1);
});

// ─── RESTORE FROM LOCALSTORAGE ───
// Check if user has a saved slide position from a previous visit
const savedSlide = localStorage.getItem(STORAGE_KEY);
if (savedSlide !== null) {
    const slideIndex = parseInt(savedSlide);
    if (slideIndex >= 0 && slideIndex < totalSlides) {
        // Restore saved position (don't save again to avoid loop)
        goToSlide(slideIndex, false);
    } else {
        // Invalid saved value, start at beginning
        goToSlide(0);
    }
} else {
    // No saved position, start at beginning
    goToSlide(0);
}

// ─── RECALCULATE HEIGHT ON WINDOW RESIZE ───
// If user rotates device or resizes browser, recalculate active slide height
window.addEventListener('resize', () => {
    requestAnimationFrame(() => {
        const activeSlide = allSlides[currentSlide];
        const slideHeight = activeSlide.scrollHeight;
        slides.style.height = slideHeight + 'px';
    });
});