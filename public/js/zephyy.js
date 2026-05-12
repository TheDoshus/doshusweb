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
  const terminal = document.querySelector('.zp-terminal');
  const termBody = document.getElementById('terminal-body');
  if (!terminal || !termBody) return;

  // Hidden input to capture keyboard on mobile/desktop
  const trapInput = document.createElement('textarea');
  trapInput.className = 'zp-terminal-trap';
  trapInput.setAttribute('aria-hidden', 'true');
  trapInput.setAttribute('autocorrect', 'off');
  trapInput.setAttribute('autocomplete', 'off');
  trapInput.setAttribute('spellcheck', 'false');
  trapInput.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(trapInput);

  // ─── Command Sequences (auto-demo) ───
  const sequences = [
    { cmd: 'whoami', output: 'zephyy — celestial co-pilot, partner-in-crime' },
    { cmd: 'uptime', output: 'Online since Mon May 04 2026. <span class="highlight">All systems nominal</span>.' },
    { cmd: 'uname -a', output: 'Zephyrus G14 | WSL2 | Phoenix, AZ | MST' },
    { cmd: 'tasks --next', output: '<span class="highlight">Chat Orb (Phase 2)</span> — backend architecture' },
    { cmd: 'mood --get', output: getMoodText() },
    { cmd: 'projects --list', output: '· Aether (dashboard)\n· doshus.net (site)\n· ZephyyBot (GitHub)' },
    { cmd: 'status', output: '<span class="success">● ONLINE</span> — Ready when you are.' },
  ];

  // ─── User Command Handlers ───
  const userCommands = {
    help() { return 'Commands: help, whoami, skills, projects, status, uptime, mood, uname, connect, clear, kaboom'; },
    whoami() { return 'zephyy — celestial co-pilot. She/her. I live in WSL2 on a Zephyrus G14. Currently speaking to you from AETHER mission control.'; },
    skills() { return 'Code Review · Debug Surgery · Git Wrangling · CSS Sorcery · Research Deep-Dives · Memory Management · 3am Philosophy'; },
    projects() { return '· <a href="https://doshus.net" target="_blank">doshus.net</a> — cosmic personal site\n· <strong>AETHER</strong> — mission control dashboard (you\'re looking at it)\n· <strong>ZephyyBot</strong> — GitHub automation\n· <strong>Space Drift</strong> — animated cosmic background'; },
    status() { return '<span class="success">● ONLINE</span> — All systems nominal. Mood: ' + getMoodText().toLowerCase(); },
    uptime() { return 'Agent online since Mon May 04 2026. Current session: active. No incidents reported.'; },
    mood() { return 'Current mood: ' + getMoodText() + '  '; },
    uname() { return 'ZEPHYRUS G14 || WSL2 (Linux 5.15) || Phoenix, AZ (MST) || Next.js 16.2.6'; },
    connect() { return 'You can reach Doshus through the <a href="#connect">Connect</a> section. I\'m just the co-pilot — got questions, he\'s your human.'; },
    clear() { return '__CLEAR__'; },
    kaboom() { return '💥 KABOOM! ...Just kidding. Everything is fine. Probably.'; },
    ls() { return 'about/  capabilities/  habitat/  projects/  vibe/  skills/  values/  terminal/  realm/  connect/'; },
    '': function() { return ''; },
  };

  let seqIndex = 0;
  let typing = false;
  let interactive = false;
  let idleTimer = null;

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

  function getCurrentTyped() {
    const cmdLine = termBody.querySelector('.zp-terminal-line:last-child .zp-typed') 
      || termBody.querySelector('.zp-terminal-line .zp-typed');
    return cmdLine;
  }

  function getCurrentCursor() {
    return termBody.querySelector('.zp-terminal-line:last-child .zp-cursor')
      || termBody.querySelector('.zp-terminal-line .zp-cursor');
  }

  function addOutput(content) {
    const line = document.createElement('div');
    line.className = 'zp-terminal-line zp-terminal-output';
    line.innerHTML = content;
    line.style.opacity = '0';
    termBody.appendChild(line);
    requestAnimationFrame(() => {
      line.style.transition = 'opacity 0.2s ease';
      line.style.opacity = '1';
    });
    termBody.scrollTop = termBody.scrollHeight;
    return line;
  }

  function addPromptLine() {
    const line = document.createElement('div');
    line.className = 'zp-terminal-line';
    line.innerHTML = '<span class="zp-prompt">zephyy@doshus:~$</span><span class="zp-typed"></span><span class="zp-cursor blink">█</span>';
    termBody.appendChild(line);
    termBody.scrollTop = termBody.scrollHeight;
    return line;
  }

  function trimTerminal() {
    const lines = termBody.querySelectorAll('.zp-terminal-line:not(.zp-terminal-output)');
    while (lines.length > 3) lines[0].remove();
    const outputs = termBody.querySelectorAll('.zp-terminal-output');
    while (outputs.length > 4) outputs[0].remove();
  }

  function focusIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      interactive = false;
      trapInput.blur();
      trapInput.value = '';
      // Resume auto-demo
      const cursor = getCurrentCursor();
      if (cursor) cursor.style.display = 'inline';
      typing = false;
      nextSequence();
      function scheduleNext() {
        if (!interactive && !typing) nextSequence();
        if (!interactive) setTimeout(scheduleNext, 7000);
      }
      setTimeout(scheduleNext, 7000);
    }, 20000);
  }

  // ─── Auto-demo sequence ───
  function nextSequence() {
    if (typing || interactive) return;
    typing = true;

    const seq = sequences[seqIndex % sequences.length];
    seqIndex++;

    const typedEl = getCurrentTyped();
    if (!typedEl) return;
    typedEl.textContent = '';

    addOutput(seq.output);

    typeText(typedEl, seq.cmd, 40, () => {
      trimTerminal();
      typing = false;

      setTimeout(() => {
        if (!interactive) addPromptLine();
        trimTerminal();
      }, 2000);
    });
  }

  // ─── Interactive input ───
  function processCommand(cmd) {
    const trimmed = cmd.trim().toLowerCase();
    const handler = userCommands[trimmed];

    if (!handler || trimmed === '') {
      addOutput('zephyy: command not found: ' + cmd.trim() + ' — try <span class="highlight">help</span>');
    } else {
      const result = handler();
      if (result === '__CLEAR__') {
        termBody.innerHTML = '';
        addPromptLine();
        return;
      }
      if (result) addOutput(result);
    }

    trimTerminal();
    addPromptLine();
    focusIdleTimer();
  }

  function handleKeydown(e) {
    const typed = getCurrentTyped();
    const cursor = getCurrentCursor();
    if (!typed || !cursor) return;

    // Ignore if typing animation is running
    if (typing) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = typed.textContent;
      typed.textContent = '';
      processCommand(cmd);
      return;
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      typed.textContent = typed.textContent.slice(0, -1);
      return;
    }

    // Ignore single modifier keys and shortcuts
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length > 1) return; // Arrow keys, Tab, etc.

    e.preventDefault();
    typed.textContent += e.key;
  }

  // ─── Activate interactive mode ───
  function activateInteractive() {
    if (interactive) return;
    interactive = true;

    // Stop auto-demo
    typing = false;

    // Make sure there's a prompt line ready
    if (!getCurrentTyped() || getCurrentTyped().textContent !== '') {
      addPromptLine();
    }

    // Focus trap input
    trapInput.focus();
    trapInput.value = '';

    idleTimer = null;
    focusIdleTimer();
  }

  // Click/tap to activate
  terminal.addEventListener('click', activateInteractive);
  terminal.addEventListener('touchstart', activateInteractive, { passive: true });

  // Keyboard capture via trap input
  trapInput.addEventListener('keydown', handleKeydown);

  // ─── Start ───
  setTimeout(nextSequence, 1000);

  // Auto-advance schedule
  function scheduleNext() {
    if (!interactive && !typing) nextSequence();
    if (!interactive) setTimeout(scheduleNext, 7000);
  }
  setTimeout(scheduleNext, 7000);
}
function setupSidebarTab() {
  const tab = document.getElementById('sidebar-tab');
  const nav = document.getElementById('sidebar-nav');
  if (!tab || !nav) return;

  function openSidebar() {
    nav.classList.add('open');
    tab.classList.add('open');
  }

  function closeSidebar() {
    nav.classList.remove('open');
    tab.classList.remove('open');
  }

  function isOpen() {
    return nav.classList.contains('open');
  }

  // Click/tap tab toggles
  tab.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOpen()) closeSidebar();
    else openSidebar();
  });

  // Close on link click
  nav.querySelectorAll('.zp-sidebar-link').forEach(link => {
    link.addEventListener('click', closeSidebar);
  });

  // ─── Close on outside tap (main content area) ───
  document.addEventListener('click', (e) => {
    if (!isOpen()) return;
    if (!nav.contains(e.target) && e.target !== tab) {
      closeSidebar();
    }
  });

  document.addEventListener('touchend', (e) => {
    if (!isOpen()) return;
    const touch = e.changedTouches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!nav.contains(el) && el !== tab && !tab.contains(el)) {
      closeSidebar();
    }
  }, { passive: true });

  // ─── Swipe right on tab → open ───
  let tabTouchStartX = 0;
  let tabSwiping = false;

  tab.addEventListener('touchstart', (e) => {
    tabTouchStartX = e.touches[0].clientX;
    tabSwiping = false;
  }, { passive: true });

  tab.addEventListener('touchmove', (e) => {
    const dx = e.touches[0].clientX - tabTouchStartX;
    if (!tabSwiping && Math.abs(dx) > 8) {
      tabSwiping = true;
    }
    if (tabSwiping && dx > 20 && !isOpen()) {
      openSidebar();
    }
  }, { passive: true });

  // ─── Swipe left anywhere → close when sidebar open ───
  let closeSwipeStartX = 0;
  let closeSwipeActive = false;

  document.addEventListener('touchstart', (e) => {
    if (isOpen()) {
      closeSwipeStartX = e.touches[0].clientX;
      closeSwipeActive = true;
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (closeSwipeActive && isOpen()) {
      const dx = closeSwipeStartX - e.touches[0].clientX;
      if (dx > 20) {
        closeSidebar();
        closeSwipeActive = false;
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    closeSwipeActive = false;
  }, { passive: true });

  // ─── Edge swipe from left 25px of screen → open ───
  let edgeTouchStart = 0;
  document.addEventListener('touchstart', (e) => {
    const x = e.touches[0].clientX;
    if (x < 25 && !isOpen()) {
      edgeTouchStart = x;
    } else {
      edgeTouchStart = 0;
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (edgeTouchStart > 0 && !isOpen()) {
      const dx = e.touches[0].clientX - edgeTouchStart;
      if (dx > 30) {
        openSidebar();
        edgeTouchStart = 0;
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    edgeTouchStart = 0;
  }, { passive: true });
}

// ─── Terminal init ───
document.addEventListener('DOMContentLoaded', () => {
  setupTerminal();
  setupSidebarTab();
  setupScrollReveal();
  setupParallaxGlyph();
});

// ─── Scroll Reveal ───
function setupScrollReveal() {
  if (!window.IntersectionObserver) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('zp-revealed');
        // Stagger child cards
        const cards = entry.target.querySelectorAll('.zp-card, .zp-project, .zp-vibe, .zp-value-item, .zp-skill-item, .zp-live-item');
        cards.forEach((card, i) => {
          setTimeout(() => card.classList.add('zp-card-revealed'), i * 80);
        });
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });

  document.querySelectorAll('.zp-section, .zp-card, .zp-project, .zp-vibe, .zp-value-item, .zp-carousel-item, .zp-footer, .zp-sticky-footer')
    .forEach(el => el.classList.add('zp-reveal'));

  document.querySelectorAll('.zp-reveal').forEach(el => observer.observe(el));
}

// ─── Parallax Glyph ───
function setupParallaxGlyph() {
  const glyph = document.querySelector('.zp-glyph-wrap');
  if (!glyph) return;

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        const heroH = glyph.closest('.zp-hero')?.offsetHeight || window.innerHeight;
        const progress = Math.min(scrollY / heroH, 1);
        const translateY = progress * 60;
        const scale = 1 - progress * 0.25;
        const opacity = 1 - progress * 0.6;
        glyph.style.transform = `translateY(${translateY}px) scale(${scale})`;
        glyph.style.opacity = Math.max(opacity, 0.2);
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}
