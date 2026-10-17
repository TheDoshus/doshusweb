// ===================================
// THE LOUNGE - INTERACTIVE FEATURES
// ===================================

// Category filter functionality
function initCategoryFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const categoryBoxes = document.querySelectorAll('.category-box');

    if (filterButtons.length === 0 || categoryBoxes.length === 0) {
        return;
    }

    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            const selectedCategory = this.getAttribute('data-category');

            // Update active button
            filterButtons.forEach(btn => { btn.classList.remove('active'); btn.setAttribute('aria-pressed', btn === this); });
            this.classList.add('active');

            // Fade the other category boxes where they sit (hiding one would leave a hole in the board)
            if (selectedCategory === 'all') {
                // Show all boxes
                categoryBoxes.forEach(box => box.classList.remove('is-faded'));
            } else {
                // Bring out only the selected category
                categoryBoxes.forEach(box => {
                    const boxCategory = box.getAttribute('data-category');
                    if (boxCategory === selectedCategory) {
                        box.classList.remove('is-faded');
                    } else {
                        box.classList.add('is-faded');
                    }
                });
            }

            // Visual feedback
            this.style.transform = 'scale(1.1)';
            setTimeout(() => {
                this.style.transform = 'scale(1)';
            }, 200);
        });
    });
}

// Surprise Me! button - opens random link
function initSurpriseButton() {
    const surpriseBtn = document.getElementById('surpriseBtn');
    const allLinks = document.querySelectorAll('.site-link');

    if (!surpriseBtn || allLinks.length === 0) {
        return;
    }

    surpriseBtn.addEventListener('click', function() {
        // Get only the selected category's visible links (not faded by the filter, or in a panel hidden or collapsed on the board)
        const visibleLinks = Array.from(allLinks).filter(link => !link.closest('.is-faded') && link.getClientRects().length);

        if (visibleLinks.length === 0) {
            alert('No sites showing! Try a different category, or bring one back from Add widget.');
            return;
        }

        // Pick random link
        const randomIndex = Math.floor(Math.random() * visibleLinks.length);
        const randomLink = visibleLinks[randomIndex];

        // Visual feedback
        this.style.transform = 'scale(0.95)';
        setTimeout(() => {
            this.style.transform = 'scale(1)';
        }, 100);

        // Open the link
        window.open(randomLink.href, '_blank', 'noopener,noreferrer');

    });
}

// Save and restore filter selection
function initFilterMemory() {
    const filterButtons = document.querySelectorAll('.filter-btn');

    // Load saved filter on page load
    const savedFilter = store.get('loungeFilter') || 'all';

    filterButtons.forEach(button => {
        const category = button.getAttribute('data-category');

        // Apply saved filter, at once (only a visitor's pick fades)
        if (category === savedFilter) {
            button.click();
            document.querySelectorAll('.category-box').forEach(box => box.getAnimations().forEach(a => a.transitionProperty === 'opacity' && a.finish()));
        }

        // Save filter when clicked
        button.addEventListener('click', function() {
            store.set('loungeFilter', category);
        });
    });
}

// Add to your DOMContentLoaded event
window.addEventListener('DOMContentLoaded', function() {
    initCategoryFilters();
    initSurpriseButton();
    initFilterMemory();
});