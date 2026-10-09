// ─── BOARD: a fine grid of panels each visitor arranges (UI-SPEC.md) ───
// Markup: .board[data-board=<name>] > .panel[id][data-x][data-y][data-w][data-h], in grid
// cells counted from 1. This file lays the panels out, adds the move/hide/resize controls
// and saves the visitor's layout. Loads after main.js: uses prefersReducedMotion, haptic().
document.querySelectorAll('.board[data-board]').forEach((board) => {
    const KEY = `board:${board.dataset.board}`;
    const VERSION = 2; // bump when the saved shape changes; older saves are ignored
    const MIN = { w: 3, h: 3 };
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
    // Gravity: in reading order each panel rises to its first free row. Whatever sits under the
    // moving panel's target makes way (it sorts after it), and the moving panel wins ties.
    function pack(map, moving) {
        const mv = map.get(moving);
        const placed = [];
        [...map].filter(([, r]) => !r.hidden)
            .map(([p, r]) => [p, r, mv && p !== moving && overlap(r, mv) ? mv.y + 0.5 : r.y])
            .sort(([pa, a, ka], [pb, b, kb]) => ka - kb || (pb === moving) - (pa === moving) || a.x - b.x)
            .forEach(([, r]) => {
                r.y = 1;
                for (let hit; (hit = placed.find((o) => overlap(r, o)));) r.y = hit.y + hit.h;
                placed.push(r);
            });
        return map;
    }
    const setCell = (node, r) => ['x', 'y', 'w', 'h'].forEach((k) => node.style.setProperty(`--${k}`, r[k]));
    function render(map) {
        map.forEach((r, p) => { p.hidden = r.hidden; setCell(p, r); });
    }
    // FLIP: measure, change, then slide every panel from where it was
    function flip(change, skip) {
        const first = new Map(panels.filter((p) => !p.hidden && p !== skip).map((p) => [p, p.getBoundingClientRect()]));
        change();
        if (prefersReducedMotion) return;
        first.forEach((a, p) => {
            p.getAnimations().forEach((anim) => anim.cancel());
            const b = p.getBoundingClientRect();
            if (!p.hidden && (a.left !== b.left || a.top !== b.top)) {
                p.animate({ translate: [`${a.left - b.left}px ${a.top - b.top}px`, '0 0'] },
                    { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
            }
        });
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

    function fillMenu() {
        const hidden = panels.filter((p) => layout.get(p).hidden);
        menu.replaceChildren(...(hidden.length ? hidden.map((p) => {
            const b = button(`＋ ${title(p)}`);
            b.addEventListener('click', () => {
                const next = copy(layout);
                Object.assign(next.get(p), { hidden: false, y: Infinity }); // joins at the bottom, then rises
                flip(() => render(pack(next, p)));
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
            if (e.button || cols() < 2) return;
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

    // Move: the panel follows the pointer while the ghost shows where it will land
    const moveFrom = (p) => (e) => {
        const r0 = p.getBoundingClientRect();
        const gutter = parseFloat(getComputedStyle(p).marginTop) || 0;
        const off = { x: e.clientX - r0.left + gutter, y: e.clientY - r0.top + gutter };
        let next = layout;
        let last = '';
        Object.assign(p.style, { width: `${r0.width}px`, height: `${r0.height}px`, left: `${r0.left}px`, top: `${r0.top}px` });
        p.classList.add('is-dragging');
        ghost.style.setProperty('--accent', getComputedStyle(p).getPropertyValue('--accent'));
        setCell(ghost, layout.get(p));
        ghost.hidden = false;
        return {
            move(ev) {
                Object.assign(p.style, { left: `${ev.clientX - off.x + gutter}px`, top: `${ev.clientY - off.y + gutter}px` });
                if (ev.clientY < 64) scrollBy(0, -16);
                else if (ev.clientY > innerHeight - 64) scrollBy(0, 16);
                const b = board.getBoundingClientRect();
                const c = cell();
                const me = layout.get(p);
                const x = clamp(Math.round((ev.clientX - off.x - b.left) / c.x) + 1, 1, cols() - me.w + 1);
                const y = Math.max(1, Math.round((ev.clientY - off.y - b.top) / c.y) + 1);
                if (`${x},${y}` === last) return;
                last = `${x},${y}`;
                next = copy(layout);
                Object.assign(next.get(p), { x, y });
                flip(() => { render(pack(next, p)); setCell(ghost, next.get(p)); }, p);
            },
            done() {
                ghost.hidden = true;
                flip(() => {
                    p.classList.remove('is-dragging');
                    ['width', 'height', 'left', 'top'].forEach((k) => p.style.removeProperty(k));
                    render(next);
                });
                commit(next);
                const r = next.get(p);
                say(`${title(p)} moved to column ${r.x}, row ${r.y}`);
            },
        };
    };

    // Resize from any edge or corner, snapping to whole cells
    const resizeFrom = (p, dir) => (e) => {
        const start = { ...layout.get(p) };
        const c = cell();
        let next = layout;
        let last = '';
        return {
            move(ev) {
                const dc = Math.round((ev.clientX - e.clientX) / c.x);
                const dr = Math.round((ev.clientY - e.clientY) / c.y);
                const r = { ...start };
                if (dir.includes('e')) r.w = clamp(start.w + dc, MIN.w, cols() - start.x + 1);
                if (dir.includes('w')) { r.x = clamp(start.x + dc, 1, start.x + start.w - MIN.w); r.w = start.w + start.x - r.x; }
                if (dir.includes('s')) r.h = Math.max(MIN.h, start.h + dr);
                if (dir.includes('n')) r.h = Math.max(MIN.h, start.h - dr);
                if (`${r.x},${r.w},${r.h}` === last) return;
                last = `${r.x},${r.w},${r.h}`;
                next = copy(layout);
                Object.assign(next.get(p), r);
                flip(() => render(pack(next, p)));
            },
            done() {
                commit(next);
                const r = next.get(p);
                say(`${title(p)} is ${r.w} columns by ${r.h} rows`);
            },
        };
    };

    // Keyboard: arrows on the grip move a cell sideways or past the neighbor above/below;
    // arrows on the corner grow and shrink
    const arrow = (e) => ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] })[e.key];
    function keyed(handle, p, change) {
        handle.addEventListener('keydown', (e) => {
            const d = arrow(e);
            if (!d || cols() < 2) return;
            e.preventDefault();
            const next = copy(layout);
            if (change(next.get(p), next, ...d) === false) return;
            flip(() => render(pack(next, p)));
            commit(next);
            handle.focus();
            p.scrollIntoView({ block: 'nearest' });
            const r = next.get(p);
            say(`${title(p)}: column ${r.x}, row ${r.y}, ${r.w} by ${r.h}`);
        });
    }

    panels.forEach((p) => {
        const name = title(p);
        const tools = el('div', 'panel-tools');
        const grip = button('⠿', `Move ${name}`, 'panel-grip');
        const hide = button('✕', `Hide ${name}`, 'panel-close');
        tools.append(grip, hide);
        p.append(tools);
        EDGES.forEach((dir) => {
            // The corner is the keyboard's way in; the other edges are pointer-only
            const edge = dir === 'se' ? button('', `Resize ${name}`, 'panel-edge') : el('span', 'panel-edge');
            edge.dataset.dir = dir;
            p.append(edge);
            track(edge, resizeFrom(p, dir));
        });
        track(grip, moveFrom(p));
        const head = p.querySelector('.panel-head');
        if (head) track(head, moveFrom(p));

        keyed(grip, p, (r, next, dx, dy) => {
            if (dx) r.x = clamp(r.x + dx, 1, cols() - r.w + 1);
            if (!dy) return true;
            const near = [...next].filter(([o, n]) => o !== p && !n.hidden && n.x < r.x + r.w && r.x < n.x + n.w && (dy > 0 ? n.y > r.y : n.y < r.y))
                .sort(([, a], [, b]) => dy * (a.y - b.y))[0];
            if (!near) return false;
            r.y = dy < 0 ? near[1].y : near[1].y + near[1].h; // onto the neighbor above, or just under the one below
            return true;
        });
        keyed(p.querySelector('.panel-edge[data-dir="se"]'), p, (r, next, dx, dy) => {
            r.w = clamp(r.w + dx, MIN.w, cols() - r.x + 1);
            r.h = Math.max(MIN.h, r.h + dy);
        });

        hide.addEventListener('click', () => {
            const next = copy(layout);
            next.get(p).hidden = true;
            flip(() => render(pack(next)));
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
    render(pack(layout));
    settle(layout);

    reset.addEventListener('click', () => {
        const next = pack(copy(DEFAULT));
        flip(() => render(next));
        settle(next);
        try { localStorage.removeItem(KEY); } catch { /* nothing saved */ }
        haptic();
        say('Layout reset');
    });
});
