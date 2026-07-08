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
            filterButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');

            // Show/hide category boxes
            if (selectedCategory === 'all') {
                // Show all boxes
                categoryBoxes.forEach(box => box.classList.remove('hidden'));
            } else {
                // Show only selected category
                categoryBoxes.forEach(box => {
                    const boxCategory = box.getAttribute('data-category');
                    if (boxCategory === selectedCategory) {
                        box.classList.remove('hidden');
                    } else {
                        box.classList.add('hidden');
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
        // Get only visible links
        const visibleLinks = Array.from(allLinks).filter(link => {
            const parentBox = link.closest('.category-box');
            return !parentBox || !parentBox.classList.contains('hidden');
        });

        if (visibleLinks.length === 0) {
            alert('No sites available! Try selecting a different category.');
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
    const savedFilter = localStorage.getItem('loungeFilter') || 'all';

    filterButtons.forEach(button => {
        const category = button.getAttribute('data-category');

        // Apply saved filter
        if (category === savedFilter) {
            button.click();
        }

        // Save filter when clicked
        button.addEventListener('click', function() {
            localStorage.setItem('loungeFilter', category);
        });
    });
}

// Add to your DOMContentLoaded event
window.addEventListener('DOMContentLoaded', function() {
    initCategoryFilters();
    initSurpriseButton();
    initFilterMemory();
});