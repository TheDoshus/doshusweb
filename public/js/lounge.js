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

// ─── DISCORD SERVER WIDGET ───
// Pulls live presence from the Discord widget API and renders it
// in-house style. Falls back to a static join card if the API is
// unreachable (adblock, widget disabled, Discord down).
const DISCORD_GUILD_ID = '1026149685846605925';
const DISCORD_MAX_AVATARS = 12;

async function initDiscordWidget() {
    const widget = document.getElementById('discord-widget');
    if (!widget) return;

    const nameEl = document.getElementById('discord-server-name');
    const countEl = document.getElementById('discord-count');
    const membersEl = document.getElementById('discord-members');
    const joinEl = document.getElementById('discord-join');

    try {
        const res = await fetch(`https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`);
        if (!res.ok) throw new Error(`widget API ${res.status}`);
        const data = await res.json();

        if (data.name) nameEl.textContent = data.name;
        if (data.instant_invite) joinEl.href = data.instant_invite;

        const online = data.presence_count ?? (data.members ? data.members.length : 0);
        countEl.textContent = online === 0 ? 'quiet right now — be the first in'
            : online === 1 ? '1 member online now'
            : `${online} members online now`;

        // Avatar bubbles for whoever's on right now
        membersEl.textContent = '';
        (data.members || []).slice(0, DISCORD_MAX_AVATARS).forEach(member => {
            const bubble = document.createElement('span');
            bubble.className = 'discord-member';
            if (member.status === 'idle' || member.status === 'dnd') {
                bubble.classList.add(`status-${member.status}`);
            }

            const img = document.createElement('img');
            img.src = member.avatar_url;
            img.alt = member.username;
            img.loading = 'lazy';
            img.title = member.game ? `${member.username} — playing ${member.game.name}` : member.username;
            img.onerror = function() { bubble.remove(); };

            bubble.appendChild(img);
            membersEl.appendChild(bubble);
        });

        const extras = online - Math.min(online, DISCORD_MAX_AVATARS);
        if (extras > 0) {
            const more = document.createElement('span');
            more.className = 'discord-more';
            more.textContent = `+${extras} more`;
            membersEl.appendChild(more);
        }
    } catch (error) {
        // Static fallback — still sells the click
        widget.classList.add('discord-offline');
        countEl.textContent = "the chat's always open — tap in";
    }
}

// Add to your DOMContentLoaded event
window.addEventListener('DOMContentLoaded', function() {
    initCategoryFilters();
    initSurpriseButton();
    initFilterMemory();
    initDiscordWidget();
});