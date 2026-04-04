document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.getElementById('sources-modal')?.classList.remove('open'); });

// ═══════════════════════════════════════
// FINANCE CARD SLIDER: SWIPE + NAV + LOCALSTORAGE + DYNAMIC HEIGHT
// ═══════════════════════════════════════
const viewport = document.querySelector('.finance-slides-viewport');
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
    if (index < 0) index = totalSlides - 1;
    else if (index >= totalSlides) index = 0;
    currentSlide = index;

    // ─── FADE EFFECT ───
    allSlides.forEach((slide, i) => {
        slide.classList.toggle('active-slide', i === currentSlide);
    });

    // ─── SMART SCROLL CORRECTION ───
    // If you switch from a long card to a short card, jump up to the nav bar
    // so you don't end up stranded in empty space!
    const navBar = document.querySelector('.finance-nav-bar');
    if (navBar) {
        const navRect = navBar.getBoundingClientRect();
        if (navRect.top < 0) {
            window.scrollBy({ top: navRect.top - 20, behavior: 'instant' });
        }
    }

    // ─── DYNAMIC HEIGHT ───
    requestAnimationFrame(() => {
        const activeSlide = allSlides[currentSlide];
        const slideHeight = activeSlide.scrollHeight;
        const viewport = document.querySelector('.finance-slides-viewport') || slides;
        viewport.style.height = slideHeight + 'px';
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

    // Update progress line fill
    const progressPercent = (currentSlide / (totalSlides - 1)) * 100;
    progressFill.style.width = progressPercent + '%';

    if (saveToStorage) localStorage.setItem(STORAGE_KEY, currentSlide);
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

// ─── TOUCH SWIPE (FADE OPTIMIZED) ───
let startX = 0;
let startY = 0;
let isSwiping = null;

slides.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isSwiping = null; // Reset
}, { passive: true });

slides.addEventListener('touchmove', (e) => {
    const diffX = e.touches[0].clientX - startX;
    const diffY = e.touches[0].clientY - startY;

    if (isSwiping === null) {
        // Did they move horizontally more than vertically?
        isSwiping = Math.abs(diffX) > Math.abs(diffY);
    }

    if (isSwiping) {
        e.preventDefault(); // Lock screen from scrolling up/down while swiping
    }
}, { passive: false });

slides.addEventListener('touchend', (e) => {
    if (isSwiping) {
        const endX = e.changedTouches[0].clientX;
        const diffX = endX - startX;
        
        // Require a 25% screen swipe to trigger the next card
        const threshold = window.innerWidth * 0.20; 

        if (Math.abs(diffX) > threshold) {
            if (diffX < 0) {
                goToSlide(currentSlide + 1);
            } else {
                goToSlide(currentSlide - 1);
            }
        }
    }
});

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
        viewport.style.height = slideHeight + 'px';
    });
});