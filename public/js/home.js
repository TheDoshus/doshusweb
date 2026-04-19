// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    initCTApop();
    initAmazonLinkToggle();
    
    // Wire up Slack Button
    const slackText = document.getElementById('slackText');
    if (slackText) slackText.addEventListener('click', handleSlackClick);

    initSpotifyEmbed();
});

// --- Feature Functions Below ---
function initSpotifyEmbed() {
    const playlistIds = [
        '7oanTkXtuVwcAUx882IQqD', '1lHiEucVsKf04tip7VetOo', '0s3TtgkY01p1L8PRqUggVV',
        '1YnNTk8GPvXPDJdzktSwwJ', '6BIUohSTfEaLfuFlWvtAVd', '1Z5J2B3Y218mcndyLLLOCN',
        '4BCpeg24zmnImrDSEVfEm0', '0dtsgsCgovlqVMCf5DNraj', '1BC12paN2yVqj81zHzB2B1',
        '2HrlpE0Cu2fXDubcHaBpsF'
    ];
    const iframe = document.getElementById('spotify-embed');
    if (iframe) {
        const selectedId = playlistIds[Math.floor(Math.random() * playlistIds.length)];
        iframe.src = `https://open.spotify.com/embed/playlist/${selectedId}`;
    }
}

// CTA Popup Box - "What's the move?"
function initCTApop() {
    const openBtn = document.getElementById('openctaPopup');
    const modal = document.getElementById('ctaPopup');
    const closeBtn = document.getElementById('closeModal');
    const navButtons = document.querySelectorAll('.ctaPopup-btn');
    
    if (!openBtn || !modal || !closeBtn) return; // Elements don't exist

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

// Reveal Slack Handle / Launch Slack
let slackRevealed = false;
function handleSlackClick() {
    const slackText = document.getElementById('slackText');
    
    if (!slackRevealed) {
        // First click: Remove the blur to reveal the handle
        slackText.classList.remove('email-hidden');
        slackText.classList.add('email-revealed');
        slackRevealed = true;
    } else {
        // Second click: Execute the redirect to Slack
        const slackUrl = 'https://amazon.enterprise.slack.com/team/U03AWNH0XJ8'; 
        window.open(slackUrl, '_blank', 'noopener,noreferrer');
    }
}

// Amazon Link Toggle - Switch between internal and external links
function initAmazonLinkToggle() {
    const toggle = document.getElementById('linkToggle');
    const toggleText = document.getElementById('toggleText');
    const amazonLinks = document.querySelectorAll('.amazon-link');
  
    if (!toggle || !toggleText || amazonLinks.length === 0) return;
  
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

                if (!internalUrl.startsWith('http')) {
                    link.removeAttribute('target');
                    link.removeAttribute('rel');
                }
                toggleText.textContent = 'Internal Links';
            }
        });
    }
    
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