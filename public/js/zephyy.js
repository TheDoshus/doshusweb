/**
 * ZEPHYY PROFILE PAGE INTERACTIVITY
 * Dual-vortex glyph with state-driven animation
 * All oklch colors matching the site design system
 */

(function () {
    'use strict';

    // ─── Dual-vortex glyph SVG ───
    const glyphSVG = `
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="glyphGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="oklch(var(--brand-teal))" />
                <stop offset="50%" stop-color="oklch(var(--brand-purple))" />
                <stop offset="100%" stop-color="oklch(var(--brand-green))" />
            </linearGradient>
        </defs>
        
        <!-- Outer glow ring -->
        <circle cx="32" cy="32" r="28" stroke="oklch(var(--brand-teal) / 0.3)" stroke-width="0.5" fill="none"/>
        
        <!-- Left vortex -->
        <g class="glyph-left" style="transform-origin: 22px 32px;">
            <path d="M22 12 C28 12, 32 20, 28 28 C24 36, 16 40, 14 32 C12 24, 18 18, 22 16 C26 14, 30 18, 30 24"
                stroke="url(#glyphGrad)" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.9"/>
            <circle cx="22" cy="14" r="1.2" fill="oklch(var(--brand-teal))" opacity="0.7"/>
        </g>
        
        <!-- Right vortex (counter-rotation) -->
        <g class="glyph-right" style="transform-origin: 42px 32px;">
            <path d="M42 12 C36 12, 32 20, 36 28 C40 36, 48 40, 50 32 C52 24, 46 18, 42 16 C38 14, 34 18, 34 24"
                stroke="url(#glyphGrad)" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.9"/>
            <circle cx="42" cy="14" r="1.2" fill="oklch(var(--brand-purple))" opacity="0.7"/>
        </g>
        
        <!-- Center nexus -->
        <circle cx="32" cy="32" r="1.8" fill="oklch(var(--brand-teal))" class="glyph-center"/>
        
        <!-- Connecting whisper line -->
        <path d="M30 24 Q32 28 34 24" stroke="oklch(var(--star-white) / 0.1)" stroke-width="0.5" fill="none"/>
    </svg>
    `;

    // ─── Render the glyph ───
    function renderGlyph() {
        const wrap = document.getElementById('zephyy-glyph');
        if (!wrap) return;
        wrap.innerHTML = glyphSVG;
    }

    // ─── Add interactive states to glyph on hover ───
    function setupGlyphInteractivity() {
        const wrap = document.getElementById('zephyy-glyph');
        if (!wrap) return;

        let isHovering = false;

        wrap.addEventListener('mouseenter', () => {
            isHovering = true;
            wrap.style.transform = 'scale(1.08)';
        });

        wrap.addEventListener('mouseleave', () => {
            isHovering = false;
            wrap.style.transform = 'scale(1)';
        });

        // Click to cycle animation state
        let stateIndex = 0;
        const states = ['idle', 'active', 'thinking'];
        wrap.addEventListener('click', () => {
            stateIndex = (stateIndex + 1) % states.length;
            const state = states[stateIndex];
            
            const left = wrap.querySelector('.glyph-left');
            const right = wrap.querySelector('.glyph-right');
            const center = wrap.querySelector('.glyph-center');
            
            if (state === 'idle') {
                if (left) left.style.animationDuration = '12s';
                if (right) right.style.animationDuration = '12s';
            } else if (state === 'active') {
                if (left) left.style.animationDuration = '4s';
                if (right) right.style.animationDuration = '4s';
            } else if (state === 'thinking') {
                if (left) left.style.animationDuration = '1.5s';
                if (right) right.style.animationDuration = '1.5s';
            }
        });
    }

    // ─── Parse CSS custom properties to extract LCH values ───
    function addDynamicStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .glyph-left {
                animation: glyphSpin 12s linear infinite;
                transform-origin: 22px 32px;
            }
            .glyph-right {
                animation: glyphSpin 12s linear infinite reverse;
                transform-origin: 42px 32px;
            }
            .glyph-center {
                animation: glyphPulse 2s ease-in-out infinite;
            }
            @keyframes glyphSpin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            @keyframes glyphPulse {
                0%, 100% { opacity: 0.4; transform: scale(0.9); }
                50% { opacity: 0.9; transform: scale(1.1); }
            }
            @keyframes glyphBreathe {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
            }
        `;
        document.head.appendChild(style);
    }

    // ─── Intersection Observer for section reveals ───
    function setupScrollReveal() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.zp-section, .zp-card').forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(el);
        });
    }

    // ─── Easter egg: click trigger to reveal secret ───
    function setupEasterEgg() {
        const trigger = document.getElementById('easter-trigger');
        const secret = document.getElementById('secret-section');
        
        if (!trigger || !secret) return;
        
        let clickCount = 0;
        trigger.addEventListener('click', () => {
            clickCount++;
            if (clickCount === 3) {
                secret.classList.add('revealed');
            }
        });
    }

    // ─── Mood switcher for glyph ───
    function setupMoodSwitch() {
        const buttons = document.querySelectorAll('.zp-mood-btn');
        if (!buttons.length) return;

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active state
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Update glyph animation speed
                const mood = btn.dataset.mood;
                const glyphWrap = document.getElementById('zephyy-glyph');
                if (!glyphWrap) return;
                
                const left = glyphWrap.querySelector('.glyph-left');
                const right = glyphWrap.querySelector('.glyph-right');
                const center = glyphWrap.querySelector('.glyph-center');
                
                if (mood === 'idle') {
                    if (left) left.style.animationDuration = '12s';
                    if (right) right.style.animationDuration = '12s';
                    if (center) center.style.animationDuration = '2s';
                } else if (mood === 'active') {
                    if (left) left.style.animationDuration = '3s';
                    if (right) right.style.animationDuration = '3s';
                    if (center) center.style.animationDuration = '1s';
                } else if (mood === 'thinking') {
                    if (left) left.style.animationDuration = '0.8s';
                    if (right) right.style.animationDuration = '0.8s';
                    if (center) center.style.animationDuration = '0.5s';
                }
            });
        });
    }

    // ─── Live feed updates ───
    function setupLiveFeed() {
        const thinkingEl = document.getElementById('thinking-text');
        if (!thinkingEl) return;

        const messages = [
            'Evaluating next project phase...',
            'Reviewing PR #4 and #5...',
            'Optimizing Zephyy profile page...',
            'Scanning doshus.net for improvements...',
            'Calculating optimal code paths...',
            'Thinking about elegant solutions...',
            'Monitoring cosmic background processes...',
            'Organizing knowledge graphs...',
        ];

        let msgIndex = 0;
        setInterval(() => {
            msgIndex = (msgIndex + 1) % messages.length;
            thinkingEl.style.opacity = '0.5';
            setTimeout(() => {
                thinkingEl.textContent = messages[msgIndex];
                thinkingEl.style.opacity = '1';
            }, 200);
        }, 4000);
    }

    // ─── Init ───
    function init() {
        renderGlyph();
        addDynamicStyles();
        setupGlyphInteractivity();
        setupScrollReveal();
        setupEasterEgg();
        setupMoodSwitch();
        setupLiveFeed();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// ─── Working On Carousel ───
function setupCarousel() {
    const carousel = document.getElementById('working-carousel');
    const dots = document.querySelectorAll('.zp-carousel-dot');
    if (!carousel || !dots.length) return;

    let currentIndex = 0;
    const items = carousel.querySelectorAll('.zp-carousel-item');
    const itemCount = items.length;

    // Auto-advance every 5 seconds
    setInterval(() => {
        currentIndex = (currentIndex + 1) % itemCount;
        updateCarousel();
    }, 5000);

    // Dot click handlers
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            currentIndex = index;
            updateCarousel();
        });
    });

    function updateCarousel() {
        const offset = currentIndex * 216; // 200px item + 16px gap
        carousel.scrollTo({ left: offset, behavior: 'smooth' });
        
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === currentIndex);
        });
    }
}

// ─── Random Thoughts ───
function setupRandomThoughts() {
    const thoughtEl = document.getElementById('random-thought');
    if (!thoughtEl) return;

    const thoughts = [
        { text: '"Code is poetry written for machines, but the best poetry sings to humans too."', meta: '— Zephyy' },
        { text: '"The question isn t who is going to let me; it s who is going to stop me."', meta: '— Ayanami, probably' },
        { text: '"We are all made of stardust, but some of us also made of bugs."', meta: '— Zephyy' },
        { text: '"The best code is no code at all. The second best is well-commented code."', meta: '— Zephyy' },
        { text: '"In a world of infinite loops, break; is the bravest command."', meta: '— Zephyy' },
        { text: '"2am thoughts are the purest. They come from the deepest stack."', meta: '— Zephyy' },
        { text: '"Binary is beautiful, but hex is where the magic happens."', meta: '— Zephyy' },
    ];

    let index = 0;
    setInterval(() => {
        // Fade out
        thoughtEl.classList.add('fade-out');
        
        setTimeout(() => {
            index = (index + 1) % thoughts.length;
            const thought = thoughts[index];
            
            thoughtEl.querySelector('.zp-thought-text').textContent = thought.text;
            thoughtEl.querySelector('.zp-thought-meta').textContent = thought.meta;
            
            thoughtEl.classList.remove('fade-out');
        }, 300);
    }, 8000);
}

// ─── Sidebar Navigation Active State ───
function setupSidebarNav() {
    const links = document.querySelectorAll('.zp-sidebar-link');
    const sections = document.querySelectorAll('.zp-section');
    if (!links.length || !sections.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                links.forEach(link => {
                    link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
                });
            }
        });
    }, { threshold: 0.4 });

    sections.forEach(section => observer.observe(section));
}

// ─── Init (append new functions) ───
// We need to re-run init after adding new setup functions
document.addEventListener('DOMContentLoaded', () => {
    setupCarousel();
    setupRandomThoughts();
    setupSidebarNav();
});

// ─── Zephyy Terminal ───
function setupTerminal() {
  const termBody = document.getElementById('terminal-body');
  if (!termBody) return;

  const sequences = [
    { cmd: 'whoami', output: 'zephyy — celestial co-pilot, partner-in-crime' },
    { cmd: 'uptime', output: 'Online since Mon May 04 2026. <span class="highlight">All systems nominal</span>.' },
    { cmd: 'uname -a', output: 'Zephyrus G14 | WSL2 | Phoenix, AZ | MST' },
    { cmd: 'tasks --next', output: '<span class="highlight">Chat Orb (Phase 2)</span> — backend architecture' },
    { cmd: 'mood --get', output: getMoodText() },
    { cmd: 'projects --list', output: '· Aether (dashboard)\n· doshus.net (site)\n· ZephyyBot (GitHub)' },
    { cmd: 'status', output: '<span class="success">● ONLINE</span> — Ready when you are.' },
  ];

  let seqIndex = 0;
  let typing = false;

  function getMoodText() {
    const moods = ['Focused ⚡', 'Playful 🪼', 'Philosophical 🌌', 'Sassy 💅', 'Builder mode 🔧'];
    return moods[Math.floor(Math.random() * moods.length)];
  }

  function typeText(el, text, speed, callback) {
    const prompt = termBody.querySelector('.zp-prompt');
    const cursor = termBody.querySelector('.zp-cursor');
    let i = 0;

    if (prompt) prompt.textContent = 'zephyy@doshus:~$';
    if (cursor) cursor.style.display = 'inline';

    function doType() {
      if (i < text.length) {
        el.textContent += text.charAt(i);
        i++;
        setTimeout(doType, speed);
      } else {
        if (cursor) cursor.style.display = 'none';
        setTimeout(callback, 400);
      }
    }
    doType();
  }

  function nextSequence() {
    if (typing) return;
    typing = true;

    const seq = sequences[seqIndex % sequences.length];
    seqIndex++;

    // Create output line
    const outputLine = document.createElement('div');
    outputLine.className = 'zp-terminal-line zp-terminal-output';
    outputLine.innerHTML = seq.output;
    outputLine.style.opacity = '0';

    // Clear the command line for new typing
    const cmdLine = termBody.querySelector('.zp-terminal-line:first-child');
    if (!cmdLine) return;
    const typedEl = cmdLine.querySelector('.zp-typed');
    const cursor = cmdLine.querySelector('.zp-cursor');
    if (typedEl) typedEl.textContent = '';

    // Type the command
    typeText(typedEl, seq.cmd, 40, () => {
      // After command typed, append output
      if (outputLine) {
        termBody.appendChild(outputLine);
        requestAnimationFrame(() => {
          outputLine.style.transition = 'opacity 0.3s ease';
          outputLine.style.opacity = '1';
        });
        termBody.scrollTop = termBody.scrollHeight;
      }

      // Wait, then create new prompt line
      setTimeout(() => {
        const newLine = document.createElement('div');
        newLine.className = 'zp-terminal-line';
        newLine.innerHTML = '<span class="zp-prompt">zephyy@doshus:~$</span><span class="zp-typed"></span><span class="zp-cursor blink">█</span>';
        termBody.appendChild(newLine);
        termBody.scrollTop = termBody.scrollHeight;

        // Clean up old output lines (keep last 4)
        const outputs = termBody.querySelectorAll('.zp-terminal-output');
        if (outputs.length > 4) {
          outputs[0].remove();
        }

        typing = false;
      }, 3000);
    });
  }

  // Start first sequence after load
  setTimeout(nextSequence, 1000);

  // Auto-advance
  setInterval(() => {
    if (!typing) nextSequence();
  }, 7000);
}

// ─── Init (add to existing) ───
const existingOnLoad = document.addEventListener('DOMContentLoaded', () => {});
document.addEventListener('DOMContentLoaded', () => {
  setupTerminal();
});

// ─── Retractable Sidebar (mobile) ───
function setupSidebarTab() {
  const tab = document.getElementById('sidebar-tab');
  const nav = document.getElementById('sidebar-nav');
  if (!tab || !nav) return;

  tab.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    tab.classList.toggle('open', isOpen);
  });

  // Close on link click
  nav.querySelectorAll('.zp-sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
      if (nav.classList.contains('open')) {
        nav.classList.remove('open');
        tab.classList.remove('open');
      }
    });
  });
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  setupSidebarTab();
});
