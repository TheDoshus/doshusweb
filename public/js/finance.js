// ═══════════════════════════════════════
// FINANCE CARD SLIDER: SWIPE + NAV + LOCALSTORAGE + DYNAMIC HEIGHT
// ═══════════════════════════════════════
const viewport = document.querySelector('.sliderView');
const slides = document.getElementById('sliderTrack');
const allSlides = document.querySelectorAll('.slide');
const navDots = document.querySelectorAll('.nav-dot');
const prevBtn = document.getElementById('slide-prev');
const nextBtn = document.getElementById('slide-next');
const progressFill = document.getElementById('nav-progress-fill');
let currentSlide = 0;
const totalSlides = allSlides.length;
const STORAGE_KEY = 'financeSlidePosition';

// ─── HEIGHT + SCROLL HELPERS (single source of truth) ───
// Size the viewport window to the active card
function setSliderHeight() {
    const activeSlide = allSlides[currentSlide];
    if (activeSlide && viewport) viewport.style.height = activeSlide.offsetHeight + 'px'; // its box: a gliding panel's overflow would inflate scrollHeight
}

// If you switch from a long card to a short card, jump up to the nav bar
// so you don't end up stranded in empty space!
function correctScroll() {
    const navBar = document.querySelector('.slideNav');
    if (!navBar) return;
    const navRect = navBar.getBoundingClientRect();
    if (navRect.top < 0) {
        window.scrollBy({ top: navRect.top - 20, behavior: 'instant' });
    }
}


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

    setSliderHeight();
    correctScroll();

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

// Only wire up the slider if this page actually has one
if (viewport && slides && totalSlides > 0) {

    // ─── ARROW CLICKS ───
    prevBtn?.addEventListener('click', () => goToSlide(currentSlide - 1));
    nextBtn?.addEventListener('click', () => goToSlide(currentSlide + 1));

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
        // A finger moving a panel on a slide's board isn't swiping
        if (slides.querySelector('.board.is-arranging')) { isSwiping = false; return; }
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

            // Require a 20% screen swipe to trigger the next card
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
        // A panel's grip or corner took the arrow, or a panel is being moved
        if (e.defaultPrevented || slides.querySelector('.board.is-arranging')) return;
        if (e.key === 'ArrowRight') goToSlide(currentSlide + 1);
        if (e.key === 'ArrowLeft') goToSlide(currentSlide - 1);
    });

    // ─── RESTORE FROM LOCALSTORAGE ───
    // Check if user has a saved slide position from a previous visit
    const savedSlide = parseInt(localStorage.getItem(STORAGE_KEY));
    if (savedSlide >= 0 && savedSlide < totalSlides) {
        // Restore saved position (don't save again to avoid loop)
        goToSlide(savedSlide, false);
    } else {
        // No (or invalid) saved position, start at beginning
        goToSlide(0);
    }

    // ─── HEIGHT FOLLOWS THE ACTIVE SLIDE ───
    // Whatever changes a slide's size (a fold easing, a panel moved or resized, an image, the
    // window) resizes the window onto it
    const resized = new ResizeObserver(setSliderHeight);
    allSlides.forEach((slide) => resized.observe(slide));
}

// ─── CARD TOOLTIPS: kept inside the box that would cut them off ───
// The nearest box that clips (a panel body scrolls, an open fold clips to its content), or the screen
function clipBox(el) {
    for (let n = el.parentElement; n; n = n.parentElement) {
        const fold = n.matches('details[open]') && getComputedStyle(n, '::details-content').overflow !== 'visible';
        if (fold || getComputedStyle(n).overflow !== 'visible') {
            const r = n.getBoundingClientRect();
            return { top: fold ? n.querySelector('summary').getBoundingClientRect().bottom : r.top, left: r.left, right: r.right };
        }
    }
    return { top: 0, left: 0, right: innerWidth };
}
document.querySelectorAll('.ccCard').forEach((card) => {
    const tip = card.querySelector('.card-tooltip');
    card.addEventListener('pointerenter', () => {
        // Where it sits at rest, centered over the card, worked out from layout: a transition still
        // running from the last hover would skew a measured box
        const c = card.getBoundingClientRect(), box = clipBox(card), w = tip.offsetWidth;
        const left = c.left + c.width / 2 - w / 2;
        // Under the card when there's no room above (13px for the lifts hover gives the card and the tooltip)
        card.classList.toggle('tip-below', c.top - tip.offsetHeight - 13 < Math.max(0, box.top));
        // Along the card, never past the box's sides (8px in from them)
        const shift = Math.max(0, Math.max(box.left, 0) + 8 - left) - Math.max(0, left + w - Math.min(box.right, innerWidth) + 8);
        if (shift) tip.style.setProperty('--tip-shift', `${shift}px`);
        else tip.style.removeProperty('--tip-shift');
    });
});
