// ─── BOARD: a fine grid of panels each visitor arranges (UI-SPEC.md) ───
// Markup: .board[data-board=<name>] > .panel[id][data-x][data-y][data-w][data-h], in grid
// cells counted from 1. This file lays the panels out, adds the move/hide/resize controls
// and saves the visitor's layout. Loads after main.js: uses prefersReducedMotion, haptic().
document.querySelectorAll('.board[data-board]').forEach((board) => {
    const VERSION = 2; // bump when the saved shape changes; older saves are ignored
    const MIN_H = 3;
    const EDGES = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'];
    const css = getComputedStyle(board);
    // Grid size and the narrowest panel come from board.css, which changes them for phones
    const cols = () => +css.getPropertyValue('--cols') || 1;
    const minW = () => Math.min(+css.getPropertyValue('--min-cols') || 1, cols());
    const cell = () => ({ x: board.clientWidth / cols(), y: parseFloat(css.gridAutoRows) });
    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
    const panels = [...board.children].filter((el) => el.matches('.panel'));
    const title = (p) => p.querySelector('h2')?.textContent ?? p.getAttribute('aria-label') ?? p.id;
    const read = (p) => ({ x: +p.dataset.x || 1, y: +p.dataset.y || 1, w: +p.dataset.w || 6, h: +p.dataset.h || 8, hidden: p.hidden });
    const copy = (map) => new Map([...map].map(([p, r]) => [p, { ...r }]));
    // Two layouts, each with its own default and save: the wide grid placed by data-x/y/w/h, and
    // the phone grid (board.css: fewer --cols up to 640px wide), whose default stacks the panels
    // full width in the wide reading order, each as tall as its content
    const phone = matchMedia('(max-width: 640px)');
    let key;
    let base;
    let layout = new Map();
    // moveBefore keeps focus and playing media; insertBefore is the fallback
    const place = (el, ref) => (board.moveBefore ? board.moveBefore(el, ref) : board.insertBefore(el, ref));
    const el = (tag, className, text) => Object.assign(document.createElement(tag), { className, textContent: text ?? '' });
    const button = (text, label, className) => {
        const b = el('button', className, text);
        b.type = 'button';
        if (label) b.setAttribute('aria-label', label);
        return b;
    };

    // ─── Layout engine ───
    const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    // Free placement: panels stay where they're put. A panel dragged upward lifts what it lands
    // on into any free space above (`up`). Otherwise, landing on the upper half of a panel that
    // starts above it, the moving panel takes that panel's top (a swap, the way a stack
    // reorders); on its lower half it tucks in underneath. Anything else it lands on is pushed
    // straight down, top to bottom, until nothing overlaps.
    function resolve(map, moving, up) {
        const mv = map.get(moving);
        const live = mv && !mv.hidden;
        const others = [...map].filter(([p, r]) => !r.hidden && p !== moving).map(([, r]) => r);
        if (live && up) others.filter((o) => overlap(o, mv)).sort((a, b) => b.y - a.y).forEach((o) => {
            const lifted = { ...o, y: mv.y - o.h };
            if (lifted.y >= 1 && !others.some((n) => n !== o && overlap(n, lifted))) o.y = lifted.y;
        });
        others.sort((a, b) => a.y - b.y || a.x - b.x);
        if (live) {
            const cut = others.find((o) => o.y < mv.y && overlap(o, mv) && mv.y < o.y + o.h / 2);
            if (cut) mv.y = cut.y;
            for (let hit; (hit = others.find((o) => o.y < mv.y && overlap(o, mv)));) mv.y = hit.y + hit.h;
        }
        const placed = live ? [mv] : [];
        others.forEach((r) => {
            for (let hit; (hit = placed.find((o) => overlap(r, o)));) r.y = hit.y + hit.h;
            placed.push(r);
        });
        return map;
    }
    const setCell = (node, r) => ['x', 'y', 'w', 'h'].forEach((k) => node.style.setProperty(`--${k}`, r[k]));
    function render(map) {
        map.forEach((r, p) => { p.hidden = r.hidden; setCell(p, r); });
    }
    // FLIP: measure, change, then glide every panel (and the ghost) from where it was. Moves are
    // translate-only, which the compositor runs off the main thread; only a node whose size
    // changed animates width/height. Measuring mid-flight picks up a running glide, so rapid
    // changes chain without a jump. Durations come from --glide / --ghost-glide in board.css.
    const ms = (prop) => parseFloat(css.getPropertyValue(prop)) || 0;
    function flip(change, skip) {
        const nodes = [...panels.filter((p) => !p.hidden && p !== skip), ...(ghost.hidden ? [] : [ghost])];
        const first = new Map(nodes.map((n) => [n, n.getBoundingClientRect()]));
        change();
        if (prefersReducedMotion) return;
        first.forEach((a, n) => {
            if (n.hidden) return;
            n.getAnimations().filter((anim) => anim.id === 'glide').forEach((anim) => anim.cancel());
            const b = n.getBoundingClientRect();
            const near = (u, v) => Math.abs(u - v) < 0.5; // ignore sub-pixel rounding
            const frames = { translate: [`${a.left - b.left}px ${a.top - b.top}px`, '0 0'] };
            if (!near(a.width, b.width) || !near(a.height, b.height)) {
                Object.assign(frames, { width: [`${a.width}px`, `${b.width}px`], height: [`${a.height}px`, `${b.height}px`] });
            } else if (near(a.left, b.left) && near(a.top, b.top)) return;
            n.animate(frames, { id: 'glide', duration: ms(n === ghost ? '--ghost-glide' : '--glide'), easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
        });
    }
    // Snap with hysteresis: the target only changes once the pointer is well into the next cell,
    // so hovering on a cell boundary doesn't flicker
    const snap = (raw, current) => (Math.abs(raw - current) > 0.6 ? Math.round(raw) : current);
    // A panel's fixed parts (head and foot) and the gutter around it, in px
    const parts = (p) => [...p.children].filter((n) => n.matches('.panel-head, .panel-foot')).reduce((s, n) => s + n.offsetHeight, 0);
    const gutters = (p) => 2 * (parseFloat(getComputedStyle(p).marginTop) || 0);
    // The shortest a panel can get: its head and foot plus a few lines of body (or MIN_H)
    function minH(p) {
        const fixed = parts(p);
        return Math.max(MIN_H, Math.ceil((fixed + gutters(p) + (fixed ? 48 : 0)) / cell().y));
    }
    // The tallest: one screen (100dvh), so a panel always fits in view
    const maxH = (p) => Math.max(minH(p), Math.floor(innerHeight / cell().y));
    // Tall enough for everything it holds, at its current width. A meme gets a little over half
    // the screen, or with `fit` (once its picture has loaded) exactly its picture's shape
    function contentH(p, fit) {
        const media = fit && p.querySelector('video, img');
        const ratio = media && (media.videoHeight / media.videoWidth || media.naturalHeight / media.naturalWidth);
        if (ratio) return Math.round((p.offsetWidth * ratio + gutters(p)) / cell().y);
        if (p.matches('.panel-media')) return Math.round(innerHeight * 0.55 / cell().y);
        const body = p.querySelector('.panel-body');
        body?.style.setProperty('flex', 'none'); // its own height, not what the panel gives it
        const h = parts(p) + gutters(p) + (body?.scrollHeight ?? 0);
        body?.style.removeProperty('flex');
        return Math.ceil(h / cell().y);
    }
    // Keep every panel inside what it can be at this size: the grid's width, its own minimum
    // height (head and foot) and one screen
    function fit(map) {
        render(resolve(map));
        map.forEach((r, p) => {
            r.w = clamp(r.w, minW(), cols());
            r.x = clamp(r.x, 1, cols() - r.w + 1);
            r.h = clamp(r.h, minH(p), maxH(p));
        });
        return resolve(map);
    }
    function defaults() {
        const wide = new Map(panels.map((p) => [p, read(p)]));
        if (!phone.matches) return fit(wide);
        const order = [...wide].sort(([, a], [, b]) => a.y - b.y || a.x - b.x).map(([p]) => p);
        const stack = new Map(order.map((p) => [p, { x: 1, y: 1, w: cols(), h: MIN_H, hidden: false }]));
        render(stack); // full width, so each body's content wraps the way it will
        let y = 1;
        stack.forEach((r, p) => { Object.assign(r, { y, h: clamp(contentH(p), minH(p), maxH(p)) }); y += r.h; });
        return fit(stack);
    }
    const same = (a, b) => [...a].every(([p, r]) => ['x', 'y', 'w', 'h', 'hidden'].every((k) => r[k] === b.get(p)[k]));
    // The layout Reset replaced, offered back until the next change
    let undo = null;
    // Reading order becomes DOM order, so tab order follows the layout. Add widget shows only
    // with something to add, Reset only once the layout differs from the default (or as Undo
    // right after a reset)
    function settle(next) {
        layout = next;
        // Last to first, moving only a panel not already in front of the one after it: an
        // unchanged order touches nothing (Firefox before 144 has no moveBefore, and its
        // insertBefore rebuilds every panel it moves)
        let after = ghost;
        [...layout].filter(([, r]) => !r.hidden).sort(([, a], [, b]) => b.y - a.y || b.x - a.x)
            .forEach(([p]) => { if (p.nextElementSibling !== after) place(p, after); after = p; });
        fillMenu();
        add.hidden = !panels.some((p) => layout.get(p).hidden);
        reset.hidden = !undo && same(layout, base);
        reset.textContent = undo ? 'Undo reset' : 'Reset layout';
    }
    // A visitor's change: settle it and save it (a board back at its default saves nothing).
    // `back` is what a reset replaced; any other change drops it
    function commit(next, back = null) {
        undo = back;
        settle(next);
        try {
            if (same(layout, base)) localStorage.removeItem(key);
            else localStorage.setItem(key, JSON.stringify({ v: VERSION, items: [...layout].map(([p, r]) => ({ id: p.id, ...r })) }));
        } catch { /* private mode: the layout lasts this visit */ }
    }
    // This size's layout: the default, with the visitor's saved one on top (panels added to the
    // page since keep their default spot). Runs again when the window crosses the phone width
    function load() {
        key = `board:${board.dataset.board}${phone.matches ? ':phone' : ''}`;
        base = defaults();
        const next = copy(base);
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(key)); } catch { /* no saved layout */ }
        if (saved?.v === VERSION) {
            saved.items.forEach(({ id, x, y, w, h, hidden }) => {
                const p = document.getElementById(id);
                if (next.has(p)) next.set(p, { x, y, w, h, hidden });
            });
        }
        render(fit(next));
        undo = null;
        settle(next);
        return !!saved;
    }

    // ─── Toolbar, live region, snap ghost ───
    // The bar goes where the page gives it a home (any element with data-board-bar=<name>),
    // otherwise right above the board
    const bar = document.querySelector(`[data-board-bar="${board.dataset.board}"]`) ?? el('div');
    const status = el('p', 'sr-only');
    const menu = el('div', 'board-menu');
    const add = button('＋ Add widget');
    const reset = button('Reset layout');
    const ghost = el('div', 'board-ghost');
    status.setAttribute('aria-live', 'polite');
    menu.id = `${board.dataset.board}-menu`;
    menu.popover = 'auto';
    add.setAttribute('popovertarget', menu.id);
    ghost.hidden = true;
    bar.classList.add('board-bar');
    bar.append(status, add, reset, menu);
    if (!bar.isConnected) board.before(bar);
    board.append(ghost);
    const say = (msg) => { status.textContent = msg; };
    // The ghost marks where a grabbed panel will land, in that panel's accent
    const showGhost = (p, r) => {
        ghost.style.setProperty('--accent', getComputedStyle(p).getPropertyValue('--accent'));
        setCell(ghost, r);
        ghost.hidden = false;
    };

    function fillMenu() {
        // Add widget only shows while something is hidden, so the menu is never empty
        menu.replaceChildren(...panels.filter((p) => layout.get(p).hidden).map((p) => {
            const b = button(`＋ ${title(p)}`);
            b.addEventListener('click', () => {
                const next = copy(layout);
                next.get(p).hidden = false; // back where it was; anything there now is pushed down
                flip(() => render(resolve(next, p)));
                commit(next);
                menu.hidePopover();
                say(`${title(p)} added back`);
                p.scrollIntoView({ block: 'nearest' });
                p.querySelector('.panel-grip').focus({ preventScroll: true });
            });
            return b;
        }));
    }

    // ─── Pointer gestures: start() returns { move, done(cancel) }, or nothing to ignore the press ───
    // While one runs, the page scrolls when the pointer nears the top or bottom of the screen
    // (faster the closer it gets, and on while it rests there), and Escape puts everything back
    const EDGE = 64;
    function begin(handle, start, e) {
        const op = start(e);
        if (!op) return;
        handle.setPointerCapture(e.pointerId);
        board.classList.add('is-arranging');
        const stop = new AbortController();
        const on = (type, fn, opts, target = handle) => target.addEventListener(type, fn, { signal: stop.signal, ...opts });
        let last = e;
        let scroll = 0;
        const edge = () => {
            const v = last.clientY < EDGE ? last.clientY - EDGE : Math.max(0, last.clientY - innerHeight + EDGE);
            scroll = v && requestAnimationFrame(edge);
            if (!v) return;
            scrollBy({ top: clamp(v / 3, -20, 20), behavior: 'instant' }); // the page's smooth scroll would queue
            op.move(last); // re-aim at whatever is under the pointer now
        };
        const end = (cancel) => { stop.abort(); cancelAnimationFrame(scroll); board.classList.remove('is-arranging'); op.done(cancel); haptic(); };
        on('pointermove', (ev) => { last = ev; op.move(ev); scroll ||= requestAnimationFrame(edge); });
        on('pointerup', () => end(false));
        on('pointercancel', () => end(false));
        on('keydown', (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); end(true); } }, {}, window);
        // Once a finger has a panel, it moves the panel and not the page, and opens no menu
        on('touchmove', (ev) => { if (ev.cancelable) ev.preventDefault(); }, { passive: false });
        on('contextmenu', (ev) => ev.preventDefault());
        haptic();
        return op;
    }
    // A gesture starts only once it means it, so a plain click or tap costs nothing. With
    // `hold`, a finger or pen rests on the handle for --hold (board.css) before the panel lifts,
    // so a swipe that starts on it still scrolls the page; anything else lifts once it has
    // moved a few px from where it pressed
    function track(handle, start, hold) {
        handle.addEventListener('pointerdown', (e) => {
            // A press on a button inside the handle (the head's ✕) is a click, not a drag
            if (e.button || cols() < 2 || (e.target !== handle && e.target.closest('button, a'))) return;
            const panel = handle.closest('.panel');
            const wait = new AbortController();
            const on = (type, fn) => handle.addEventListener(type, fn, { signal: wait.signal });
            const moved = (ev, px) => Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) > px;
            let timer = 0;
            const quit = () => { wait.abort(); if (timer) { clearTimeout(timer); panel.classList.remove('is-holding'); } };
            on('pointerup', quit);
            on('pointercancel', quit); // the page started scrolling
            if (hold && e.pointerType !== 'mouse') {
                let latest = e;
                timer = setTimeout(() => { quit(); begin(handle, start, latest); }, ms('--hold'));
                panel.classList.add('is-holding');
                on('pointermove', (ev) => { latest = ev; if (moved(ev, 10)) quit(); });
                on('contextmenu', (ev) => ev.preventDefault());
                return;
            }
            e.preventDefault();
            handle.setPointerCapture(e.pointerId); // a thin edge loses a fast pointer otherwise
            on('pointermove', (ev) => { if (moved(ev, 3)) { quit(); begin(handle, start, e)?.move(ev); } });
        });
    }

    // Move: the panel follows the pointer (translate only, so the compositor carries it) while
    // the ghost shows where it will land
    const moveFrom = (p) => (e) => {
        // The layout box, not the slightly scaled one a held panel has grown into
        const rect = p.getBoundingClientRect();
        const r0 = { width: p.offsetWidth, height: p.offsetHeight };
        Object.assign(r0, { left: rect.left + (rect.width - r0.width) / 2, top: rect.top + (rect.height - r0.height) / 2 });
        const gutter = parseFloat(getComputedStyle(p).marginTop) || 0;
        const off = { x: e.clientX - r0.left + gutter, y: e.clientY - r0.top + gutter };
        const me = layout.get(p);
        const at = { x: me.x, y: me.y };
        let next = layout;
        let frame = 0;
        let pending;
        Object.assign(p.style, { width: `${r0.width}px`, height: `${r0.height}px`, left: `${r0.left}px`, top: `${r0.top}px` });
        p.classList.add('is-dragging');
        showGhost(p, me);
        // Re-layout at most once a frame, however fast the pointer reports
        const retarget = () => {
            frame = 0;
            const b = board.getBoundingClientRect();
            const c = cell();
            const x = clamp(snap((pending.clientX - off.x - b.left) / c.x + 1, at.x), 1, cols() - me.w + 1);
            const y = Math.max(1, snap((pending.clientY - off.y - b.top) / c.y + 1, at.y));
            if (x === at.x && y === at.y) return;
            Object.assign(at, { x, y });
            next = copy(layout);
            Object.assign(next.get(p), at);
            flip(() => { render(resolve(next, p, at.y < me.y)); setCell(ghost, next.get(p)); }, p);
        };
        return {
            move(ev) {
                p.style.translate = `${ev.clientX - e.clientX}px ${ev.clientY - e.clientY}px`;
                pending = ev;
                frame ||= requestAnimationFrame(retarget);
            },
            done(cancel) {
                cancelAnimationFrame(frame);
                if (cancel) next = layout;
                ghost.hidden = true;
                flip(() => {
                    p.classList.remove('is-dragging');
                    ['width', 'height', 'left', 'top', 'translate'].forEach((k) => p.style.removeProperty(k));
                    render(next);
                });
                if (cancel) return say(`${title(p)} put back`);
                commit(next);
                const r = next.get(p);
                say(`${title(p)} moved to column ${r.x}, row ${r.y}`);
            },
        };
    };

    // Resize from any edge or corner: the dragged edge follows the pointer while the ghost shows
    // the whole cells it will snap to on release. A panel that starts above this one is a wall
    // (nothing gets pushed up); anything else the panel grows into is pushed down
    const resizeFrom = (p, dir) => (e) => {
        const start = { ...layout.get(p) };
        const blockers = [...layout].filter(([o, r]) => o !== p && !r.hidden && r.y < start.y).map(([, r]) => r);
        const blocked = (r) => blockers.some((o) => overlap(o, r));
        const c = cell();
        const floor = minH(p);
        const ceiling = maxH(p);
        const narrow = minW();
        const r0 = p.getBoundingClientRect();
        const y0 = scrollY; // the edge follows the pointer on the page, so it keeps up while the page scrolls
        // The live edge stays between the panel's minimum and the board's edge (px, gutters out)
        const gutters = 2 * (parseFloat(getComputedStyle(p).marginTop) || 0);
        const px = (cells, size) => cells * size - gutters;
        const limit = {
            w: [px(narrow, c.x), px(dir.includes('w') ? start.x + start.w - 1 : cols() - start.x + 1, c.x)],
            h: [px(floor, c.y), px(dir.includes('n') ? Math.min(ceiling, start.y + start.h - 1) : ceiling, c.y)],
        };
        const d = { c: 0, r: 0 };
        let next = layout;
        let last = '';
        let frame = 0;
        let pending;
        p.classList.add('is-resizing');
        showGhost(p, start);
        // Once a frame: size the panel to the pointer, then re-target the ghost and the panels it
        // pushes (the panel keeps its starting cell until release, so the two never fight)
        const follow = () => {
            frame = 0;
            const dx = pending.clientX - e.clientX;
            const dy = pending.clientY - e.clientY + scrollY - y0;
            const w = dir.includes('e') ? clamp(r0.width + dx, ...limit.w) : dir.includes('w') ? clamp(r0.width - dx, ...limit.w) : r0.width;
            const h = dir.includes('s') ? clamp(r0.height + dy, ...limit.h) : dir.includes('n') ? clamp(r0.height - dy, ...limit.h) : r0.height;
            Object.assign(p.style, { width: `${w}px`, height: `${h}px`,
                translate: `${dir.includes('w') ? r0.width - w : 0}px ${dir.includes('n') ? r0.height - h : 0}px` });
            d.c = snap(dx / c.x, d.c);
            d.r = snap(dy / c.y, d.r);
            const r = { ...start };
            if (dir.includes('e')) r.w = clamp(start.w + d.c, narrow, cols() - start.x + 1);
            if (dir.includes('w')) { r.x = clamp(start.x + d.c, 1, start.x + start.w - narrow); r.w = start.w + start.x - r.x; }
            while (r.w > start.w && blocked(r)) { if (dir.includes('w')) r.x++; r.w--; }
            if (dir.includes('s')) r.h = clamp(start.h + d.r, floor, ceiling);
            if (dir.includes('n')) { r.y = clamp(start.y + d.r, Math.max(1, start.y + start.h - ceiling), start.y + start.h - floor); r.h = start.h + start.y - r.y; }
            while (r.y < start.y && blocked(r)) { r.y++; r.h--; }
            if (`${r.x},${r.y},${r.w},${r.h}` === last) return;
            last = `${r.x},${r.y},${r.w},${r.h}`;
            next = copy(layout);
            Object.assign(next.get(p), r);
            flip(() => { render(resolve(next, p)); setCell(p, start); setCell(ghost, next.get(p)); }, p);
        };
        return {
            move(ev) {
                pending = ev;
                frame ||= requestAnimationFrame(follow);
            },
            // Release: the panel glides from wherever the pointer left it into the ghost's cells
            // (or, cancelled, back into its own)
            done(cancel) {
                cancelAnimationFrame(frame);
                if (frame && !cancel) follow();
                if (cancel) next = layout;
                ghost.hidden = true;
                flip(() => {
                    p.classList.remove('is-resizing');
                    ['width', 'height', 'translate'].forEach((k) => p.style.removeProperty(k));
                    render(next);
                });
                if (cancel) return say(`${title(p)} put back`);
                commit(next);
                const r = next.get(p);
                say(`${title(p)} is ${r.w} columns by ${r.h} rows`);
            },
        };
    };

    // Keyboard: arrows on the grip move one cell; arrows on the corner grow and shrink
    const arrow = (e) => ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] })[e.key];
    function keyed(handle, p, change) {
        handle.addEventListener('keydown', (e) => {
            const d = arrow(e);
            if (!d || cols() < 2) return;
            e.preventDefault();
            const next = copy(layout);
            change(next.get(p), ...d, next);
            flip(() => render(resolve(next, p)));
            commit(next);
            handle.focus();
            p.scrollIntoView({ block: 'nearest' });
            const r = next.get(p);
            say(`${title(p)}: column ${r.x}, row ${r.y}, ${r.w} by ${r.h}`);
        });
    }

    panels.forEach((p) => {
        const name = title(p);
        // The head and the grab dots move the panel (a headless panel gets a grab strip over its
        // top-left, clear of a video's own buttons); the grip is the keyboard's move control and
        // only shows on focus
        const head = p.querySelector('.panel-head') ?? p.appendChild(el('div', 'panel-grab'));
        const tools = el('div', 'panel-tools');
        const grip = button('⠿', `Move ${name} with the arrow keys`, 'panel-grip');
        const hide = button('✕', `Hide ${name}`, 'panel-close');
        tools.append(grip, hide);
        (head ?? p).append(tools);
        EDGES.forEach((dir) => {
            // The corner is the keyboard's way in; the other edges are pointer-only
            const edge = dir === 'se' ? button('', `Resize ${name}; Enter fits it to its content`, 'panel-edge') : el('span', 'panel-edge');
            edge.dataset.dir = dir;
            p.append(edge);
            track(edge, resizeFrom(p, dir));
        });
        // Double-click the corner (or Enter on it) and the panel takes the height its content
        // needs at this width; a meme takes its picture's shape
        const corner = p.querySelector('.panel-edge[data-dir="se"]');
        corner.title = 'Drag to resize, double-click to fit';
        corner.addEventListener('click', (e) => {
            if (e.detail === 1) return; // one click of a pair, or a click that ended a drag
            const next = copy(layout);
            next.get(p).h = clamp(contentH(p, true), minH(p), maxH(p));
            flip(() => render(resolve(next, p)));
            commit(next);
            say(`${name} fitted to ${next.get(p).h} rows`);
        });
        const dots = el('span', 'panel-dots');
        dots.setAttribute('aria-hidden', 'true');
        p.append(dots);
        [head, dots].forEach((handle) => track(handle, moveFrom(p), true));

        keyed(grip, p, (r, dx, dy, next) => {
            r.x = clamp(r.x + dx, 1, cols() - r.w + 1);
            r.y = Math.max(1, r.y + dy);
            // Stepping into a neighbor's rows hops it: going up, take its top (it moves down);
            // going down, start inside it so resolve() settles this panel underneath
            const hit = [...next].find(([o, n]) => o !== p && !n.hidden && overlap(n, r))?.[1];
            if (hit && dy) r.y = dy < 0 ? hit.y : hit.y + 1;
        });
        keyed(corner, p, (r, dx, dy) => {
            r.w = clamp(r.w + dx, minW(), cols() - r.x + 1);
            r.h = clamp(r.h + dy, minH(p), maxH(p));
        });

        hide.addEventListener('click', () => {
            const next = copy(layout);
            next.get(p).hidden = true;
            flip(() => render(resolve(next)));
            commit(next);
            say(`${name} hidden. Add it back from Add widget.`);
            add.focus({ preventScroll: true }); // focus where it comes back from, without jumping the page there
        });
    });

    // A machine main.js's frame-rate watcher catches struggling (body.zp-motion-throttled) loses
    // the panels' blur for the rest of the visit: once, so the blur can't flicker back on
    const lean = new MutationObserver(() => {
        if (!document.body.classList.contains('zp-motion-throttled')) return;
        board.classList.add('is-lean');
        lean.disconnect();
    });
    lean.observe(document.body, { attributeFilter: ['class'] });

    // Default heights are measured from the content, so measure again once the fonts are in,
    // unless the visitor has already made the layout their own
    if (!load()) document.fonts?.ready.then(() => { if (reset.hidden) load(); });
    phone.addEventListener('change', load);

    // Reset, then (until the next change) Undo puts the visitor's own layout back
    reset.addEventListener('click', () => {
        const next = undo ?? copy(base);
        flip(() => render(next));
        say(undo ? 'Layout restored' : 'Layout reset');
        commit(next, undo ? null : copy(layout));
        haptic();
    });
});
