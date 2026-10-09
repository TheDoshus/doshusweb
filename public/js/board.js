// ─── BOARD: drag, resize, hide and restore panels, saved per visitor (UI-SPEC.md) ───
// Markup: .board[data-board=<name>] > .panel[id][data-w][data-h]. The controls are
// built here, so a page without JS still gets the laid-out board, just fixed.
// Loads after main.js and uses its prefersReducedMotion and haptic().
document.querySelectorAll('.board[data-board]').forEach((board) => {
    const MAX_H = 6; // the [data-h] rules in board.css stop at 6
    const KEY = `board:${board.dataset.board}`;
    const panels = () => [...board.children].filter((el) => el.matches('.panel'));
    const shown = () => panels().filter((p) => !p.hidden);
    const title = (p) => p.querySelector('h2')?.textContent ?? p.getAttribute('aria-label') ?? p.id;
    const snapshot = () => panels().map((p) => ({ id: p.id, w: p.dataset.w, h: p.dataset.h, hidden: p.hidden }));
    const DEFAULT = snapshot();
    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
    const size = (p, prop) => +getComputedStyle(p).getPropertyValue(prop) || 1;
    // moveBefore keeps focus and playing media; insertBefore is the fallback
    const place = (el, ref) => (board.moveBefore ? board.moveBefore(el, ref) : board.insertBefore(el, ref));
    const button = (text, label, className) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        if (label) b.setAttribute('aria-label', label);
        if (className) b.className = className;
        return b;
    };

    // Toolbar: live region for screen readers, the add-widget menu, reset
    const bar = document.createElement('div');
    const status = document.createElement('p');
    const menu = document.createElement('div');
    const add = button('＋ Add widget');
    const reset = button('Reset layout');
    bar.className = 'board-bar';
    status.className = 'sr-only';
    status.setAttribute('aria-live', 'polite');
    menu.className = 'board-menu';
    menu.id = `${board.dataset.board}-menu`;
    menu.popover = 'auto';
    add.setAttribute('popovertarget', menu.id);
    bar.append(status, add, reset, menu);
    board.before(bar);
    const say = (msg) => { status.textContent = msg; };

    // FLIP: measure, change, then slide every panel from where it was
    function flip(change) {
        const first = new Map(shown().map((p) => [p, p.getBoundingClientRect()]));
        change();
        if (prefersReducedMotion) return;
        first.forEach((a, p) => {
            p.getAnimations().forEach((anim) => anim.cancel());
            const b = p.getBoundingClientRect();
            if (a.left !== b.left || a.top !== b.top) {
                p.animate({ translate: [`${a.left - b.left}px ${a.top - b.top}px`, '0 0'] },
                    { duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
            }
        });
    }

    function apply(items) {
        items.forEach(({ id, w, h, hidden }) => {
            const p = document.getElementById(id);
            if (!p || p.parentElement !== board) return;
            Object.entries({ w, h }).forEach(([k, v]) => (v ? (p.dataset[k] = v) : delete p.dataset[k]));
            p.hidden = Boolean(hidden);
            place(p, null);
        });
    }

    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(snapshot())); } catch { /* private mode: layout lasts this visit */ }
        fillMenu();
    }

    function fillMenu() {
        const hidden = panels().filter((p) => p.hidden);
        const empty = document.createElement('p');
        empty.textContent = 'Every widget is already on the board.';
        menu.replaceChildren(...(hidden.length ? hidden.map((p) => {
            const b = button(`＋ ${title(p)}`);
            b.addEventListener('click', () => {
                flip(() => { p.hidden = false; });
                menu.hidePopover();
                save();
                say(`${title(p)} added back`);
                p.scrollIntoView({ block: 'nearest' });
                p.querySelector('.panel-grip').focus({ preventScroll: true });
            });
            return b;
        }) : [empty]));
    }

    // Pointer drag on a control, with keyboard arrows as the equal path
    function track(handle, onMove, onDone) {
        handle.addEventListener('pointerdown', (e) => {
            if (e.button) return;
            e.preventDefault();
            handle.setPointerCapture(e.pointerId);
            const stop = new AbortController();
            const done = () => { stop.abort(); onDone(); save(); haptic(); };
            handle.addEventListener('pointermove', (ev) => onMove(ev, e), { signal: stop.signal });
            handle.addEventListener('pointerup', done, { signal: stop.signal });
            handle.addEventListener('pointercancel', done, { signal: stop.signal });
            haptic();
            return onMove(null, e);
        });
    }
    const arrow = (e) => ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] })[e.key];

    panels().forEach((p) => {
        const name = title(p);
        const tools = document.createElement('div');
        const grip = button('⠿', `Move ${name}`, 'panel-grip');
        const hide = button('✕', `Hide ${name}`, 'panel-close');
        const resize = button('', `Resize ${name}`, 'panel-resize');
        tools.className = 'panel-tools';
        tools.append(grip, hide);
        p.append(tools, resize);
        const position = () => say(`${name} moved to ${shown().indexOf(p) + 1} of ${shown().length}`);

        // Move: swap into whichever panel the pointer is over
        let last = null;
        track(grip, (ev) => {
            if (!ev) { p.classList.add('is-dragging'); board.classList.add('is-arranging'); return; }
            if (ev.clientY < 64) scrollBy(0, -16);
            else if (ev.clientY > innerHeight - 64) scrollBy(0, 16);
            const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.panel');
            if (over === last) return;
            last = over;
            if (!over || over === p || over.parentElement !== board) return;
            const ahead = p.compareDocumentPosition(over) & Node.DOCUMENT_POSITION_PRECEDING;
            flip(() => place(p, ahead ? over : over.nextElementSibling));
        }, () => { p.classList.remove('is-dragging'); board.classList.remove('is-arranging'); last = null; position(); });
        grip.addEventListener('keydown', (e) => {
            const [dx, dy] = arrow(e) ?? [];
            if (dx === undefined) return;
            e.preventDefault();
            const list = shown();
            const target = list[list.indexOf(p) + (dx || dy)];
            if (!target) return;
            flip(() => place(p, dx + dy < 0 ? target : target.nextElementSibling));
            grip.focus();
            p.scrollIntoView({ block: 'nearest' });
            save();
            position();
        });

        // Resize: snap to whole grid cells, measured from this panel's own size
        const setSize = (w, h) => {
            const cols = size(board, '--cols');
            [w, h] = [clamp(w, 1, cols), clamp(h, 1, MAX_H)];
            if (w === size(p, '--w') && h === size(p, '--h')) return;
            flip(() => Object.assign(p.dataset, { w, h }));
            say(`${name} is ${w} wide, ${h} tall`);
        };
        let start;
        track(resize, (ev, down) => {
            if (!ev) {
                const r = p.getBoundingClientRect();
                const gap = parseFloat(getComputedStyle(board).columnGap) || 0;
                const [w, h] = [size(p, '--w'), size(p, '--h')];
                start = { w, h, sx: (r.width + gap) / w, sy: (r.height + gap) / h };
                return;
            }
            setSize(Math.round(start.w + (ev.clientX - down.clientX) / start.sx),
                Math.round(start.h + (ev.clientY - down.clientY) / start.sy));
        }, () => {});
        resize.addEventListener('keydown', (e) => {
            const [dx, dy] = arrow(e) ?? [];
            if (dx === undefined) return;
            e.preventDefault();
            setSize(size(p, '--w') + dx, size(p, '--h') + dy);
            save();
        });

        hide.addEventListener('click', () => {
            flip(() => { p.hidden = true; });
            save();
            say(`${name} hidden. Add it back from Add widget.`);
            add.focus();
        });
    });

    // Restore this visitor's layout; panels added since then land first
    try {
        const saved = JSON.parse(localStorage.getItem(KEY));
        if (Array.isArray(saved)) apply(saved);
    } catch { /* no saved layout */ }
    fillMenu();

    reset.addEventListener('click', () => {
        try { localStorage.removeItem(KEY); } catch { /* nothing saved */ }
        flip(() => apply(DEFAULT));
        fillMenu();
        haptic();
        say('Layout reset');
    });
});
