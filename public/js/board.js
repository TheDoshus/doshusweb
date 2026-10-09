// ─── BOARD: a fine grid of panels each visitor arranges (UI-SPEC.md) ───
// Markup: .board[data-board=<name>] > .panel[id][data-x][data-y][data-w][data-h], in grid
// cells counted from 1. This file lays the panels out, adds the move/hide/resize controls
// and saves the visitor's layout. Loads after main.js: uses prefersReducedMotion, haptic().
document.querySelectorAll('.board[data-board]').forEach((board) => {
    const KEY = `board:${board.dataset.board}`;
    const VERSION = 2; // bump when the saved shape changes; older saves are ignored
    const MIN = { w: 4, h: 3 };
    const EDGES = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'];
    const css = getComputedStyle(board);
    const cols = () => +css.getPropertyValue('--cols') || 1;
    const cell = () => ({ x: board.clientWidth / cols(), y: parseFloat(css.gridAutoRows) });
    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
    const panels = [...board.children].filter((el) => el.matches('.panel'));
    const title = (p) => p.querySelector('h2')?.textContent ?? p.getAttribute('aria-label') ?? p.id;
    const read = (p) => ({ x: +p.dataset.x || 1, y: +p.dataset.y || 1, w: +p.dataset.w || 6, h: +p.dataset.h || 8, hidden: p.hidden });
    const copy = (map) => new Map([...map].map(([p, r]) => [p, { ...r }]));
    const DEFAULT = new Map(panels.map((p) => [p, read(p)]));
    let layout = copy(DEFAULT);
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
    // Free placement: panels stay where they're put. A moving panel that overlaps one starting
    // above it tucks in underneath that one; anything else it lands on is pushed straight down,
    // top to bottom, until nothing overlaps.
    function resolve(map, moving) {
        const mv = map.get(moving);
        const others = [...map].filter(([p, r]) => !r.hidden && p !== moving).map(([, r]) => r).sort((a, b) => a.y - b.y || a.x - b.x);
        if (mv && !mv.hidden) for (let hit; (hit = others.find((o) => o.y < mv.y && overlap(o, mv)));) mv.y = hit.y + hit.h;
        const placed = mv && !mv.hidden ? [mv] : [];
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
    // The shortest a panel can get: its head and foot plus a few lines of body (or MIN.h)
    function minH(p) {
        const fixed = [...p.children].filter((n) => n.matches('.panel-head, .panel-foot')).reduce((s, n) => s + n.offsetHeight, 0);
        const gutter = 2 * (parseFloat(getComputedStyle(p).marginTop) || 0);
        return Math.max(MIN.h, Math.ceil((fixed + gutter + (fixed ? 48 : 0)) / cell().y));
    }
    // Reading order becomes DOM order, so tab order and the phone stack follow the layout
    function settle(next) {
        layout = next;
        [...layout].filter(([, r]) => !r.hidden).sort(([, a], [, b]) => a.y - b.y || a.x - b.x)
            .forEach(([p]) => place(p, ghost));
        fillMenu();
    }
    // A visitor's change: settle it and save it (an untouched board saves nothing)
    function commit(next) {
        settle(next);
        try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, items: [...layout].map(([p, r]) => ({ id: p.id, ...r })) })); }
        catch { /* private mode: the layout lasts this visit */ }
    }

    // ─── Toolbar, live region, snap ghost ───
    const bar = el('div', 'board-bar');
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
    bar.append(status, add, reset, menu);
    board.before(bar);
    board.append(ghost);
    const say = (msg) => { status.textContent = msg; };
    // The ghost marks where a grabbed panel will land, in that panel's accent
    const showGhost = (p, r) => {
        ghost.style.setProperty('--accent', getComputedStyle(p).getPropertyValue('--accent'));
        setCell(ghost, r);
        ghost.hidden = false;
    };

    function fillMenu() {
        const hidden = panels.filter((p) => layout.get(p).hidden);
        menu.replaceChildren(...(hidden.length ? hidden.map((p) => {
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
        }) : [el('p', '', 'Every widget is already on the board.')]));
    }

    // ─── Pointer gestures: start() returns { move, done }, or nothing to ignore the press ───
    function track(handle, start) {
        handle.addEventListener('pointerdown', (e) => {
            // A press on a button inside the handle (the head's ✕) is a click, not a drag
            if (e.button || cols() < 2 || (e.target !== handle && e.target.closest('button, a'))) return;
            const op = start(e);
            if (!op) return;
            e.preventDefault();
            handle.setPointerCapture(e.pointerId);
            board.classList.add('is-arranging');
            const stop = new AbortController();
            const end = () => { stop.abort(); board.classList.remove('is-arranging'); op.done(); haptic(); };
            handle.addEventListener('pointermove', op.move, { signal: stop.signal });
            handle.addEventListener('pointerup', end, { signal: stop.signal });
            handle.addEventListener('pointercancel', end, { signal: stop.signal });
            haptic();
        });
    }

    // Move: the panel follows the pointer (translate only, so the compositor carries it) while
    // the ghost shows where it will land
    const moveFrom = (p) => (e) => {
        const r0 = p.getBoundingClientRect();
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
            flip(() => { render(resolve(next, p)); setCell(ghost, next.get(p)); }, p);
        };
        return {
            move(ev) {
                p.style.translate = `${ev.clientX - e.clientX}px ${ev.clientY - e.clientY}px`;
                // instant: the page-wide smooth scroll would queue a glide on every pointer move
                if (ev.clientY < 64) scrollBy({ top: -16, behavior: 'instant' });
                else if (ev.clientY > innerHeight - 64) scrollBy({ top: 16, behavior: 'instant' });
                pending = ev;
                frame ||= requestAnimationFrame(retarget);
            },
            done() {
                cancelAnimationFrame(frame);
                ghost.hidden = true;
                flip(() => {
                    p.classList.remove('is-dragging');
                    ['width', 'height', 'left', 'top', 'translate'].forEach((k) => p.style.removeProperty(k));
                    render(next);
                });
                commit(next);
                const r = next.get(p);
                say(`${title(p)} moved to column ${r.x}, row ${r.y}`);
            },
        };
    };

    // Resize from any edge or corner: the dragged edge follows the pointer while the ghost shows
    // the whole cells it will snap to on release. Growth never shoves a panel that sits beside or
    // above (the ghost stops at that panel's edge); only the bottom edge pushes what's below
    const resizeFrom = (p, dir) => (e) => {
        const start = { ...layout.get(p) };
        const blockers = [...layout].filter(([o, r]) => o !== p && !r.hidden && r.y < start.y + start.h).map(([, r]) => r);
        const blocked = (r) => blockers.some((o) => overlap(o, r));
        const c = cell();
        const floor = minH(p);
        const r0 = p.getBoundingClientRect();
        // The live edge stays between the panel's minimum and the board's edge (px, gutters out)
        const gutters = 2 * (parseFloat(getComputedStyle(p).marginTop) || 0);
        const px = (cells, size) => cells * size - gutters;
        const limit = {
            w: [px(MIN.w, c.x), px(dir.includes('w') ? start.x + start.w - 1 : cols() - start.x + 1, c.x)],
            h: [px(floor, c.y), dir.includes('n') ? px(start.y + start.h - 1, c.y) : Infinity],
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
            const dy = pending.clientY - e.clientY;
            const w = dir.includes('e') ? clamp(r0.width + dx, ...limit.w) : dir.includes('w') ? clamp(r0.width - dx, ...limit.w) : r0.width;
            const h = dir.includes('s') ? clamp(r0.height + dy, ...limit.h) : dir.includes('n') ? clamp(r0.height - dy, ...limit.h) : r0.height;
            Object.assign(p.style, { width: `${w}px`, height: `${h}px`,
                translate: `${dir.includes('w') ? r0.width - w : 0}px ${dir.includes('n') ? r0.height - h : 0}px` });
            d.c = snap(dx / c.x, d.c);
            d.r = snap(dy / c.y, d.r);
            const r = { ...start };
            if (dir.includes('e')) r.w = clamp(start.w + d.c, MIN.w, cols() - start.x + 1);
            if (dir.includes('w')) { r.x = clamp(start.x + d.c, 1, start.x + start.w - MIN.w); r.w = start.w + start.x - r.x; }
            while (r.w > start.w && blocked(r)) { if (dir.includes('w')) r.x++; r.w--; }
            if (dir.includes('s')) r.h = Math.max(floor, start.h + d.r);
            if (dir.includes('n')) { r.y = clamp(start.y + d.r, 1, start.y + start.h - floor); r.h = start.h + start.y - r.y; }
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
            done() {
                if (frame) { cancelAnimationFrame(frame); follow(); }
                ghost.hidden = true;
                flip(() => {
                    p.classList.remove('is-resizing');
                    ['width', 'height', 'translate'].forEach((k) => p.style.removeProperty(k));
                    render(next);
                });
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
        // The head is the grab bar (a headless panel gets a grab strip over its top-left, clear of
        // a video's own buttons); the grip is the keyboard's move control and only shows on focus
        const head = p.querySelector('.panel-head') ?? p.appendChild(el('div', 'panel-grab'));
        const tools = el('div', 'panel-tools');
        const grip = button('⠿', `Move ${name} with the arrow keys`, 'panel-grip');
        const hide = button('✕', `Hide ${name}`, 'panel-close');
        tools.append(grip, hide);
        (head ?? p).append(tools);
        EDGES.forEach((dir) => {
            // The corner is the keyboard's way in; the other edges are pointer-only
            const edge = dir === 'se' ? button('', `Resize ${name}`, 'panel-edge') : el('span', 'panel-edge');
            edge.dataset.dir = dir;
            p.append(edge);
            track(edge, resizeFrom(p, dir));
        });
        track(head, moveFrom(p));

        keyed(grip, p, (r, dx, dy, next) => {
            r.x = clamp(r.x + dx, 1, cols() - r.w + 1);
            r.y = Math.max(1, r.y + dy);
            // Stepping into a neighbor's rows hops it: going up, take its top (it moves down);
            // going down, start inside it so resolve() settles this panel underneath
            const hit = [...next].find(([o, n]) => o !== p && !n.hidden && overlap(n, r))?.[1];
            if (hit && dy) r.y = dy < 0 ? hit.y : hit.y + 1;
        });
        keyed(p.querySelector('.panel-edge[data-dir="se"]'), p, (r, dx, dy) => {
            r.w = clamp(r.w + dx, MIN.w, cols() - r.x + 1);
            r.h = Math.max(minH(p), r.h + dy);
        });

        hide.addEventListener('click', () => {
            const next = copy(layout);
            next.get(p).hidden = true;
            flip(() => render(resolve(next)));
            commit(next);
            say(`${name} hidden. Add it back from Add widget.`);
            add.focus();
        });
    });

    // Restore this visitor's layout; panels added to the page since keep their default spot
    try {
        const saved = JSON.parse(localStorage.getItem(KEY));
        if (saved?.v === VERSION) {
            saved.items.forEach(({ id, x, y, w, h, hidden }) => {
                const p = document.getElementById(id);
                if (layout.has(p)) layout.set(p, { x, y, w, h, hidden });
            });
        }
    } catch { /* no saved layout */ }
    render(resolve(layout));
    if (cols() > 1) { // lift anything saved shorter than its head and foot now need
        layout.forEach((r, p) => { r.h = Math.max(r.h, minH(p)); });
        render(resolve(layout));
    }
    settle(layout);

    reset.addEventListener('click', () => {
        const next = resolve(copy(DEFAULT));
        flip(() => render(next));
        settle(next);
        try { localStorage.removeItem(KEY); } catch { /* nothing saved */ }
        haptic();
        say('Layout reset');
    });
});
