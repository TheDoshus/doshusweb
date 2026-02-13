// Generate twinkling stars
const starsContainer = document.getElementById('stars');
const numberOfStars = 100;

for (let i = 0; i < numberOfStars; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    
    // Random position
    star.style.left = Math.random() * 100 + '%';
    star.style.top = Math.random() * 100 + '%';
    
    // Random size
    const size = Math.random() * 3 + 1;
    star.style.width = size + 'px';
    star.style.height = size + 'px';
    
    // Random animation delay
    star.style.animationDelay = Math.random() * 3 + 's';
    star.style.animationDuration = (Math.random() * 3 + 2) + 's';
    
    starsContainer.appendChild(star);
}

// Email reveal function
let emailRevealed = false;
function revealEmail() {
    const emailText = document.getElementById('emailText');
    const emailBox = document.getElementById('emailBox');
    
    if (!emailRevealed) {
        emailText.classList.remove('email-hidden');
        emailText.classList.add('email-revealed');
        emailRevealed = true;
    } else {
        navigator.clipboard.writeText('aaustinp@amazon.com').then(() => {
            const originalText = emailText.textContent;
            emailText.textContent = 'Copied to clipboard!';
            setTimeout(() => {
                emailText.textContent = originalText;
            }, 2000);
        });
    }
}

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

// Amazon Link Toggle - Switch between internal and external links
function initAmazonLinkToggle() {
    const toggle = document.getElementById('linkToggle');
    const toggleText = document.getElementById('toggleText');
    const amazonLinks = document.querySelectorAll('.amazon-link');
  
    if (!toggle || !toggleText || amazonLinks.length === 0) {
      return; // Elements don't exist on this page
    }
  
    // Load saved preference or default to false (internal links)
    const savedPreference = localStorage.getItem('amazonLinkPreference');
    toggle.checked = savedPreference ? JSON.parse(savedPreference) : false;
  
    // Function to update all links
    function updateLinks() {
      const isExternal = toggle.checked;
  
      amazonLinks.forEach(link => {
        const internalUrl = link.getAttribute('data-internal');
        const externalUrl = link.getAttribute('data-external');
        const internalText = link.getAttribute('data-internal-text');
        const externalText = link.getAttribute('data-external-text');
  
        if (isExternal) {
          // Switch to external links
          link.href = externalUrl;
          link.textContent = externalText;
          link.setAttribute('target', '_blank');
          link.setAttribute('rel', 'noopener noreferrer');
          toggleText.textContent = 'External Links';
        } else {
          // Switch to internal links
          link.href = internalUrl;
          link.textContent = internalText;
  
          // Remove target="_blank" for internal links (optional)
          if (!internalUrl.startsWith('http')) {
            link.removeAttribute('target');
            link.removeAttribute('rel');
          }
          toggleText.textContent = 'Internal Links';
        }
      });
    }
  
    // Initialize on page load
    updateLinks();
  
    // Toggle function
    toggle.addEventListener('change', function() {
      updateLinks();
  
      // Save preference to localStorage
      localStorage.setItem('amazonLinkPreference', JSON.stringify(this.checked));
  
      // Visual feedback
      toggleText.style.transform = 'scale(1.1)';
      setTimeout(() => {
        toggleText.style.transform = 'scale(1)';
      }, 200);
    });
  }
  
  // Call the function when DOM is ready
  document.addEventListener('DOMContentLoaded', initAmazonLinkToggle);

// Navigation Modal - "What's the move?" popup
function initNavigationModal() {
    const openBtn = document.getElementById('openNavModal');
    const modal = document.getElementById('navModal');
    const closeBtn = document.getElementById('closeModal');
    const navButtons = document.querySelectorAll('.nav-modal-btn');

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

    // Close modal with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
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

// Initialize on page load
window.addEventListener('DOMContentLoaded', initNavigationModal);