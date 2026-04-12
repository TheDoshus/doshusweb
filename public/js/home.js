// CTA Popup Box - "What's the move?"
function initCTApop() {
    const openBtn = document.getElementById('openctaPopup');
    const modal = document.getElementById('ctaPopup');
    const closeBtn = document.getElementById('closeModal');
    const navButtons = document.querySelectorAll('.ctaPopup-btn');
    if (!openBtn || !modal || !closeBtn) {
        return; // Elements don't exist
    }

    // Open modal
    openBtn.addEventListener('click', function() {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent scrolling
    });
    // Close modal
    closeBtn.addEventListener('click', function() {
        modal.classList.remove('active');
        document.body.style.overflow = ''; // Re-enable scrolling
    });
    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    // Navigation buttons - smooth scroll to sections
    navButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const targetSection = document.getElementById(targetId);

            if (targetSection) {
                // Close modal
                modal.classList.remove('active');
                document.body.style.overflow = '';

                // Smooth scroll to section
                targetSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}
window.addEventListener('DOMContentLoaded', initCTApop);