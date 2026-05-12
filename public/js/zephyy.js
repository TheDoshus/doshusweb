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

  // Put trap inside terminal — onscreen so mobile can focus it
  const trapInput = document.createElement('textarea');
  trapInput.setAttribute('autocorrect', 'off');
  trapInput.setAttribute('autocomplete', 'off');
  trapInput.setAttribute('spellcheck', 'false');
  trapInput.setAttribute('rows', '1');
  trapInput.style.cssText = 'position:absolute;bottom:4px;left:6px;right:6px;width:calc(100%-12px);height:1px;opacity:0;font:inherit;color:transparent;background:transparent;border:none;outline:none;resize:none;pointer-events:none;caret-color:transparent;';
  termBody.appendChild(trapInput);

  const sequences = [
    { cmd: 'whoami', output: 'zephyy — celestial co-pilot, partner-in-crime' },
    { cmd: 'uptime', output: 'Online since Mon May 04 2026. <span class="highlight">All systems nominal</span>.' },
    { cmd: 'uname -a', output: 'Zephyrus G14 | WSL2 | Phoenix, AZ | MST' },
    { cmd: 'tasks --next', output: '<span class="highlight">Chat Orb (Phase 2)</span> — backend architecture' },
    { cmd: 'mood --get', output: getMoodText() },
    { cmd: 'projects --list', output: '· Aether (dashboard)\n· doshus.net (site)\n· ZephyyBot (GitHub)' },
    { cmd: 'status', output: '<span class="success">● ONLINE</span> — Ready when you are.' },
  ];

  const userCommands = {
    help() { return 'Commands: help, whoami, skills, projects, status, uptime, mood, uname, connect, clear, kaboom'; },
    whoami() { return 'zephyy — celestial co-pilot. She/her. I live in WSL2 on a Zephyrus G14. Currently speaking from AETHER mission control.'; },
    skills() { return 'Code Review · Debug Surgery · Git Wrangling · CSS Sorcery · Research Deep-Dives · Memory Management · 3am Philosophy'; },
    projects() { return '· <a href="https://doshus.net" target="_blank">doshus.net</a> — cosmic personal site\n· <strong>AETHER</strong> — mission control dashboard\n· <strong>ZephyyBot</strong> — GitHub automation\n· <strong>Space Drift</strong> — animated cosmic background'; },
    status() { return '<span class="success">● ONLINE</span> — All systems nominal. Mood: ' + getMoodText().toLowerCase(); },
    uptime() { return 'Agent online since Mon May 04 2026. Current session: active.'; },
    mood() { return 'Current mood: ' + getMoodText() + '  '; },
    uname() { return 'ZEPHYRUS G14 || WSL2 || Phoenix, AZ (MST)'; },
    connect() { return 'Reach Doshus through the <a href="#connect">Connect</a> section.'; },
    clear() { return '__CLEAR__'; },
    kaboom() { return '💥 KABOOM! ...Just kidding. Everything is fine. Probably.'; },
    ls() { return 'about/  capabilities/  habitat/  projects/  vibe/  skills/  values/  terminal/  realm/  connect/'; },
    '': function() { return ''; },
  };

  let seqIndex = 0;
  let typing = false;
  let interactive = false;
  let scheduleId = 0;
  let idleTimer = 0;

  function getMoodText() {
    const moods = ['Focused ⚡', 'Playful 🪼', 'Philosophical 🌌', 'Sassy 💅', 'Builder mode 🔧'];
    return moods[Math.floor(Math.random() * moods.length)];
  }

  function getCurrentTyped() {
    return termBody.querySelector('.zp-terminal-line:last-child .zp-typed')
      || termBody.querySelector('.zp-terminal-line .zp-typed');
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
  }

  function addPromptLine() {
    const line = document.createElement('div');
    line.className = 'zp-terminal-line';
    line.innerHTML = '<span class="zp-prompt">zephyy@doshus:~$</span><span class="zp-typed"></span><span class="zp-cursor blink">█</span>';
    termBody.appendChild(line);
    termBody.scrollTop = termBody.scrollHeight;
  }

  function trimTerminal() {
    const lines = termBody.querySelectorAll('.zp-terminal-line:not(.zp-terminal-output)');
    while (lines.length > 3) lines[0].remove();
    const outputs = termBody.querySelectorAll('.zp-terminal-output');
    while (outputs.length > 4) outputs[0].remove();
  }

  // ─── Auto-demo typing animation ───
  function typeText(el, text, speed, callback) {
    const prompt = termBody.querySelector('.zp-prompt');
    const cursor = getCurrentCursor();
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
    if (typing || interactive) return;
    typing = true;
    const seq = sequences[seqIndex % sequences.length];
    seqIndex++;
    const typedEl = getCurrentTyped();
    if (!typedEl) { typing = false; return; }
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

  // ─── Single schedule loop (no duplication!) ───
  function scheduleLoop() {
    scheduleId = setTimeout(() => {
      if (!interactive && !typing) nextSequence();
      scheduleLoop();
    }, 7000);
  }

  function stopSchedule() {
    if (scheduleId) { clearTimeout(scheduleId); scheduleId = 0; }
  }

  // ─── Interactive input ───
  function processCommand(cmd) {
    const trimmed = cmd.trim().toLowerCase();
    const handler = userCommands[trimmed];
    if (!handler || trimmed === '') {
      addOutput('zephyy: command not found: ' + cmd.trim() + ' — try <span class="highlight">help</span>');
    } else {
      const result = handler();
      if (result === '__CLEAR__') { termBody.innerHTML = ''; trapInput.value = ''; addPromptLine(); return; }
      if (result) addOutput(result);
    }
    trimTerminal();
    trapInput.value = '';
    addPromptLine();
    startIdleTimer();
  }

  function handleKeydown(e) {
    if (typing) return;
    const typed = getCurrentTyped();
    if (!typed) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = trapInput.value;
      typed.textContent = cmd;
      processCommand(cmd);
      return;
    }

    // Echo keystrokes to visible prompt after a microtick (so .value reflects it)
    setTimeout(() => {
      typed.textContent = trapInput.value;
    }, 0);
  }

  // ─── Idle timer: go back to auto-demo after 20s ───
  function startIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      interactive = false;
      trapInput.style.pointerEvents = 'none';
      trapInput.style.opacity = '0';
      trapInput.blur();
      trapInput.value = '';
      const cursor = getCurrentCursor();
      if (cursor) cursor.style.display = 'inline';
      typing = false;
      scheduleLoop();
    }, 20000);
  }

  function activateInteractive() {
    if (interactive) return;
    interactive = true;
    typing = false;
    stopSchedule();
    if (!getCurrentTyped() || getCurrentTyped().textContent !== '') addPromptLine();
    trapInput.style.pointerEvents = 'auto';
    trapInput.style.opacity = '0.01';
    trapInput.value = '';
    trapInput.focus();
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = 0; }
    startIdleTimer();
  }

  // ─── Events ────
  terminal.addEventListener('click', activateInteractive);
  terminal.addEventListener('touchstart', activateInteractive, { passive: true });
  trapInput.addEventListener('keydown', handleKeydown);
  trapInput.addEventListener('input', () => {
    const typed = getCurrentTyped();
    if (typed) typed.textContent = trapInput.value;
  });

  // ─── Start auto-demo ───
  setTimeout(nextSequence, 1200);
  scheduleLoop();
}
function setupSidebarTab() {
  const tab = document.getElementById('sidebar-tab');
  const nav = document.getElementById('sidebar-nav');
  if (!tab || !nav) return;

  const NAV_CLOSED = -200;
  const NAV_OPEN = 6;
  const TAB_OPEN = 60;
  const SNAP = 50; // px to trigger snap

  let tracking = false;
  let startX = 0;
  let startOpen = false;

  function isOpen() { return nav.classList.contains('open'); }

  function prepareSnap() {
    nav.style.transition = '';
    tab.style.transition = '';
  }

  function openSidebar() {
    nav.classList.add('open');
    tab.classList.add('open');
    nav.style.left = '';
    nav.style.transition = '';
    tab.style.left = '';
    tab.style.transition = '';
  }

  function closeSidebar() {
    nav.classList.remove('open');
    tab.classList.remove('open');
    nav.style.left = '';
    nav.style.transition = '';
    tab.style.left = '';
    tab.style.transition = '';
  }

  // ─── Finger-tracking swipe (tab + nav) ───
  function startTracking(e) {
    tracking = true;
    startX = e.touches[0].clientX;
    startOpen = isOpen();
  }

  function moveTracking(e) {
    if (!tracking) return;
    const dx = e.touches[0].clientX - startX;

    if (startOpen) {
      // Swiping left to close — track nav + tab leftward
      const nLeft = NAV_OPEN + Math.min(dx, 0);
      nav.style.transition = 'none';
      nav.style.left = Math.max(nLeft, NAV_CLOSED) + 'px';
      tab.style.transition = 'none';
      tab.style.left = Math.max(TAB_OPEN + Math.min(dx, 0), 0) + 'px';
    } else if (dx > 3) {
      // Swiping right to open — track nav + tab rightward
      nav.style.transition = 'none';
      nav.style.left = Math.min(NAV_CLOSED + dx, NAV_OPEN) + 'px';
      tab.style.transition = 'none';
      tab.style.left = Math.min(dx, TAB_OPEN) + 'px';
    }
  }

  function endTracking(e) {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - startX;

    if (startOpen) {
      prepareSnap();
      if (dx < -SNAP) closeSidebar(); else openSidebar();
    } else {
      prepareSnap();
      if (dx > SNAP) openSidebar(); else closeSidebar();
    }
  }

  // Tab handles all swipes
  tab.addEventListener('touchstart', startTracking, { passive: true });
  tab.addEventListener('touchmove', moveTracking, { passive: true });
  tab.addEventListener('touchend', endTracking);

  // Swipe from main content area to close
  document.addEventListener('touchstart', (e) => {
    if (isOpen() && !nav.contains(e.target) && e.target !== tab) {
      startTracking(e);
    }
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (tracking && startOpen) moveTracking(e);
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (tracking && startOpen) endTracking(e);
  });

  // ─── Edge swipe from left 25px of screen to open ───
  let edgeWatch = false;
  let edgeX = 0;
  document.addEventListener('touchstart', (e) => {
    if (!isOpen() && e.touches[0].clientX < 25 && !nav.contains(e.target) && e.target !== tab) {
      edgeWatch = true;
      edgeX = e.touches[0].clientX;
    }
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (edgeWatch && !isOpen() && e.touches[0].clientX - edgeX > 30) {
      openSidebar();
      edgeWatch = false;
    }
  }, { passive: true });
  document.addEventListener('touchend', () => { edgeWatch = false; }, { passive: true });

  // ─── Tap toggle + click-outside-close ───
  tab.addEventListener('click', (e) => {
    if (!tracking) { if (isOpen()) closeSidebar(); else openSidebar(); }
  });

  document.addEventListener('click', (e) => {
    if (isOpen() && !nav.contains(e.target) && e.target !== tab) closeSidebar();
  });

  // ─── Link click closes ───
  nav.querySelectorAll('.zp-sidebar-link').forEach(link => {
    link.addEventListener('click', () => { setTimeout(closeSidebar, 150); });
  });
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

  const sections = document.querySelectorAll('.zp-section');
  if (!sections.length) return;

  // Start hidden only for sections — NOT cards (that's what made it invisible)
  sections.forEach(s => s.classList.add('zp-reveal'));

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('zp-revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -10px 0px' });

  sections.forEach(s => observer.observe(s));

  // Immediately reveal any sections already in viewport (avoids flash)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      sections.forEach(s => {
        const rect = s.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          s.classList.add('zp-revealed');
          observer.unobserve(s);
        }
      });
    });
  });
}

// ─── Parallax Glyph ───
function setupParallaxGlyph() {
  // Skip on mobile — scroll event + layout reads tank performance
  if (window.innerWidth < 901) return;

  const glyph = document.querySelector('.zp-glyph-wrap');
  if (!glyph) return;

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        const heroH = glyph.closest('.zp-hero')?.offsetHeight || window.innerHeight;
        const progress = Math.min(scrollY / heroH, 1);
        const translateY = progress * 40;
        const scale = 1 - progress * 0.2;
        const opacity = 1 - progress * 0.5;
        glyph.style.transform = `translateY(${translateY}px) scale(${scale})`;
        glyph.style.opacity = Math.max(opacity, 0.3);
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}
