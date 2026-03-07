// ===================================
// THE LOUNGE - INTERACTIVE FEATURES
// ===================================

// Random meme/video loader for multiple boxes
async function loadRandomMemes() {
    memeContainer.innerHTML = '<div class="loading-spinner">Loading...</div>';
    try {
        const response = await fetch('/memes/meme-list.json');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const memeFiles = await response.json();

        if (memeFiles.length === 0) {
            console.warn('⚠️  No memes found in meme-list.json');
            return;
        }

        // Load memes into all three boxes
        for (let i = 1; i <= 3; i++) {
            const memeContainer = document.getElementById(`randomMeme${i}`);

            if (memeContainer) {
                // Pick a random file
                const randomIndex = Math.floor(Math.random() * memeFiles.length);
                const randomFile = memeFiles[randomIndex];

                // Check if it's a video or image
                const isVideo = /\.(mp4|webm|mov)$/i.test(randomFile);

                // Clear the container
                memeContainer.innerHTML = '';

                if (isVideo) {
                    // Create video element
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
                        console.error('Failed to load video:', this.src);
                        memeContainer.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/d/d1/Image_not_available.png?20210219185637" alt="Error">';
                    };

                    memeContainer.appendChild(video);
                } else {
                    // Create image element
                    const img = document.createElement('img');
                    img.src = randomFile;
                    img.alt = 'Random Meme';
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'cover';
                    img.style.borderRadius = '10px';

                    img.onerror = function() {
                        console.error('Failed to load image:', this.src);
                        this.src = 'https://upload.wikimedia.org/wikipedia/commons/d/d1/Image_not_available.png?20210219185637';
                    };

                    memeContainer.appendChild(img);
                }
            }
        }

        console.log('✅ Loaded random memes into all boxes');

    } catch (error) {
        console.error('❌ Error loading memes:', error);
    }
}
// In loadRandomMemes(), add a loading placeholder

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

        console.log('🎲 Surprise! Opening:', randomLink.href);
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
    console.log('🎮 The Lounge is loading...');
    loadRandomMemes();
    initCategoryFilters();
    initSurpriseButton();
    initFilterMemory(); // Add this line
    console.log('✅ The Lounge is ready!');
});