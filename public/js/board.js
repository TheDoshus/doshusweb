// ─── BOARD: a fine grid of panels each visitor arranges (UI-SPEC.md) ───
// Markup: .board[data-board=<name>] > .panel[id][data-x][data-y][data-w][data-h], in grid
// cells counted from 1. This file lays the panels out, adds the move/hide/resize controls
// and saves the visitor's layout. Loads after main.js: uses prefersReducedMotion, haptic().
let active = null; // ends the one gesture running on any board (cancelled); a second pointer waits
// Whether a finger or pen is in use (board.css stills a block's ✕ and corner then, which a tap would
// otherwise find, its hover waking them): a touch screen to begin with, then the last pointer pressed or moved
const touching = (on) => document.documentElement.toggleAttribute('data-touch', on);
touching(matchMedia('(hover: none)').matches);
addEventListener('pointerdown', (e) => touching(e.pointerType !== 'mouse'), true);
addEventListener('pointermove', (e) => e.pointerType === 'mouse' && touching(false), { capture: true, passive: true });
document.querySelectorAll('.board[data-board]').forEach((board) => {
    const VERSION = 2; // bump when the saved shape changes; older saves are ignored
    const MIN_H = 3;
    const EDGES = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'];
    const css = getComputedStyle(board);
    // Grid size and the narrowest panel come from board.css, which changes them per tier
    const cols = () => +css.getPropertyValue('--cols') || 1;
    const minW = () => Math.min(+css.getPropertyValue('--min-cols') || 1, cols());
    const cell = () => ({ x: board.clientWidth / cols(), y: parseFloat(css.gridAutoRows) });
    // A page board's width as --board-w, for a host whose panel's inset answers to the board, not its
    // cells: set as each default measure starts, and kept as the board resizes (a board in a panel
    // has none: written as its panel resizes, it restyled every block in it for nothing)
    const boardW = () => { if (!host) board.style.setProperty('--board-w', `${board.clientWidth}px`); };
    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
    const panels = [...board.children].filter((el) => el.matches('.panel'));
    // A panel's own parts, never those of a board inside it (UI-SPEC § Boards in a panel)
    const own = (p, sel) => p.querySelector(`:scope > ${sel}`);
    // A board inside a panel: its blocks move within that panel, which holds them
    const host = board.parentElement.closest('.panel');
    const title = (p) => own(p, '.panel-head h2')?.textContent ?? p.getAttribute('aria-label') ?? p.id;
    // A panel marked data-collapsed starts as its title bar (data-h counts the bar's rows) and opens to its content.
    // Hidden is the markup's too, not the DOM's now: a panel hidden in one tier's layout is still in the others'
    const hiddenAtStart = new Set(panels.filter((p) => p.hidden));
    const read = (p) => ({ x: +p.dataset.x || 1, y: +p.dataset.y || 1, w: +p.dataset.w || 6, h: +p.dataset.h || 8, hidden: hiddenAtStart.has(p), collapsed: 'collapsed' in p.dataset && !!own(p, '.panel-head') });
    // A page can lay out a smaller tier itself: data-mid / data-phone hold that tier's cells, "x y w h",
    // on every panel of the board (else, or if any is malformed, the tier flows the wide layout)
    const cellsIn = (t) => {
        if (t === 'wide' || !panels.every((p) => p.dataset[t])) return false;
        const cells = panels.map((p) => p.dataset[t].trim().split(/\s+/).map(Number));
        if (!cells.every((c) => c.length === 4 && c.every((n) => Number.isInteger(n) && n > 0))) return false;
        return new Map(panels.map((p, i) => [p, { ...read(p), x: cells[i][0], y: cells[i][1], w: cells[i][2], h: cells[i][3] }]));
    };
    const copy = (map) => new Map([...map].map(([p, r]) => [p, { ...r }]));
    const keyOf = (t) => `board:${board.dataset.board}${t === 'wide' ? '' : `:${t}`}`;
    const keyFor = () => keyOf(tier());
    // Three grids, each with its own layout and save: wide, placed by data-x/y/w/h; mid, up to
    // 1080px (foldables, tablets), the wide layout flowed onto half the columns; and phone, up to
    // 640px, a stack of full-width panels. Mid and phone panels start in the wide reading order,
    // each as tall as its content. The tier is the grid board.css gives the board (24, 12 or 6
    // columns): by the window's width, or a board in a panel's by its own
    const TIERS = ['(max-width: 640px)', '(max-width: 1080px)'].map((query) => matchMedia(query));
    const tier = () => ({ 6: 'phone', 12: 'mid' })[cols()] ?? 'wide';
    let key;
    let base;
    let layout = new Map();
    // moveBefore keeps focus and playing media; insertBefore is the fallback
    const place = (el, ref) => (board.moveBefore ? board.moveBefore(el, ref) : board.insertBefore(el, ref));
    const el = (tag, className, text) => Object.assign(document.createElement(tag), { className: className ?? '', textContent: text ?? '' });
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
        map.forEach((r, p) => {
            p.hidden = r.hidden;
            p.classList.toggle('is-collapsed', !!r.collapsed);
            own(p, '.panel-head .panel-collapse')?.setAttribute('aria-expanded', String(!r.collapsed));
            setCell(p, r);
        });
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
    // Heights in fractional px: whole-pixel readings (offsetHeight, scrollHeight) summed can land a
    // pixel either side of a row, an empty row or a body a pixel short (a scrollbar on Windows)
    const tall = (n) => n.getBoundingClientRect().height;
    const rows = (px) => Math.ceil(px / cell().y - 1e-3); // float noise isn't a row
    // A class change (collapsed, open) starts transitions, and under reduced motion every property
    // has one (shared.css: 0.01ms, so transitionend still fires): a size read right after it would
    // be the old one, so what's being measured lands its transitions first
    const looks = /^(opacity|rotate|scale|translate|transform|color|background-color|border-color|box-shadow|outline-color|filter|backdrop-filter)$/;
    const landed = (n) => { n.getAnimations({ subtree: true }).forEach((a) => a instanceof CSSTransition && !looks.test(a.transitionProperty) && a.finish()); return n; };
    // A panel's fixed parts (head and foot) and the gutter around it, in px: above and below, or
    // (margin) any sides, since a host may inset a panel either side of its cells (--inset)
    const parts = (p) => [...p.children].filter((n) => n.matches('.panel-head, .panel-foot')).reduce((s, n) => s + tall(n), 0);
    const margin = (p, ...sides) => sides.reduce((n, k) => n + (parseFloat(getComputedStyle(p)[`margin${k}`]) || 0), 0);
    const gutters = (p) => margin(p, 'Top', 'Bottom');
    // A meme, or a list marked data-scroll (a window onto what it holds), keeps its height. On a tall
    // board everything else holds what it holds (UI-SPEC § Sizes): never shorter than its content
    const kept = (p) => p.matches('.panel-media') || 'scroll' in p.dataset;
    const whole = (p) => 'tall' in board.dataset && !kept(p);
    // The shortest a panel can get: its head and foot plus a few lines of body (or MIN_H); on a tall
    // board, all it holds at its width (read where it stands, or with `settle` once a glide lands;
    // `less`: as it was before a board inside it grew by that many px)
    function minH(p, settle = false, less = 0) {
        const fixed = parts(p);
        const least = Math.max(MIN_H, Math.ceil((fixed + gutters(p) + (fixed ? 48 : 0)) / cell().y));
        return whole(p) && !p.hidden && !p.classList.contains('is-collapsed') ? Math.max(least, contentH(p, false, !settle, less)) : least;
    }
    // The narrowest a visitor can make a panel: --min-cols, and on a tall board no narrower than its
    // title's longest word, whole (at the title's size now)
    function narrowest(p) {
        const h2 = 'tall' in board.dataset && p.querySelector(':scope > .panel-head > h2');
        if (!h2) return minW();
        const was = h2.style.cssText;
        h2.style.cssText += '; width: min-content; overflow-wrap: normal';
        const word = h2.getBoundingClientRect().width;
        h2.style.cssText = was;
        const head = getComputedStyle(h2.parentElement);
        const px = word + parseFloat(head.paddingLeft) + parseFloat(head.paddingRight) + p.offsetWidth - p.clientWidth + margin(p, 'Left', 'Right');
        return Math.min(cols(), Math.max(minW(), Math.ceil(px / cell().x)));
    }
    // After a change, a panel on a tall board that lands short of what it holds grows to hold it (and
    // one that held exactly what it holds, `hug`, holds exactly that again). Run inside a flip's
    // change, so the glide starts from where everything stood
    function grow(map, p, hug = false) {
        const r = map.get(p);
        if (!whole(p) || r.hidden || r.collapsed) return;
        const h = hug ? minH(p, true) : Math.max(r.h, minH(p, true));
        if (h !== r.h) { r.h = h; render(resolve(map, p)); }
    }
    // Collapsed to its title bar: the head alone (and the panel's border). A running glide carries
    // on: the bar's one-line title keeps it one height at any width, and finishing the glide here
    // would make the panel jump
    const headRows = (p) => rows(tall(landed(own(p, '.panel-head'))) + gutters(p) + p.offsetHeight - p.clientHeight);
    // The tallest: one screen (100dvh), so a panel always fits in view. A board marked data-tall (a
    // page that reads top to bottom, like the Lounge), or a panel marked so on any board, lets it be
    // as tall as what it holds, read where it stands (a running glide carries on); a hidden one,
    // which holds nothing it can measure, keeps the height it has
    const maxH = (p) => Math.max(minH(p), Math.floor(innerHeight / cell().y),
        ('tall' in board.dataset || 'tall' in p.dataset) && !p.matches('.panel-media') ? (p.hidden ? Infinity : contentH(p, false, true)) : 0);
    // Tall enough for everything it holds, at its current width (a running glide is finished
    // first, so that's the width it lands at, unless `gliding` reads it where it stands). A meme
    // gets a little over half the screen, or with `exact` (once its picture has loaded) exactly
    // its picture's shape at the width its frame gives it
    function contentH(p, exact, gliding, less = 0) {
        // Read mid-gesture (`gliding`), it neither finishes the glide nor lands transitions: nothing's
        // changed class, and a live resize reads it every frame
        if (!gliding) { p.getAnimations().forEach((anim) => anim.id === 'glide' && anim.finish()); landed(p); }
        if (p.matches('.panel-media')) {
            const media = exact && p.querySelector('video, img');
            const ratio = media && (media.videoHeight / media.videoWidth || media.naturalHeight / media.naturalWidth);
            return Math.round((ratio ? media.offsetWidth * ratio + p.offsetHeight - media.offsetHeight + gutters(p) : innerHeight * 0.55) / cell().y);
        }
        const body = own(p, '.panel-body');
        return rows(parts(p) + gutters(p) + p.offsetHeight - p.clientHeight + (body ? bodyH(body) : 0) - less); // border too
    }
    // A body's content end to end, whatever height the body has now: its padding and the extent of
    // its in-flow children, margins in. Read off the layout as it stands, so nothing moves and a
    // body scrolled (or being swiped) keeps its place. Its children sit in elements stacked in flow
    // and don't stretch (UI-SPEC.md § Markup). A classic scrollbar (Windows) narrows the body and
    // makes its content taller than it will be once the panel fits it, so it goes for the reading
    // (overlay scrollbars, the touch screens that swipe, take no room and are left alone)
    function bodyH(body) {
        const bar = body.offsetWidth > body.clientWidth;
        if (bar) body.style.setProperty('overflow', 'hidden');
        const css = getComputedStyle(body);
        const kids = [...body.children].filter((n) => { const k = getComputedStyle(n); return k.display !== 'none' && k.position !== 'absolute' && k.position !== 'fixed'; });
        let h = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom);
        if (kids.length) {
            const [a, z] = [kids[0], kids.at(-1)];
            h += z.getBoundingClientRect().bottom + parseFloat(getComputedStyle(z).marginBottom) - a.getBoundingClientRect().top + parseFloat(getComputedStyle(a).marginTop);
        }
        if (bar) body.style.removeProperty('overflow');
        return h;
    }
    // Keep every panel inside what it can be at this size: the grid's width, then (measured at
    // that width) its own minimum height, head and foot, and one screen; a collapsed one, its head
    function fit(map) {
        map.forEach((r) => {
            r.w = clamp(r.w, minW(), cols());
            r.x = clamp(r.x, 1, cols() - r.w + 1);
            r.y = Math.max(1, r.y); // a save from before 2026-10-16's top-edge fix may hold a row above the board
        });
        render(resolve(map));
        map.forEach((r, p) => {
            if (!r.collapsed) r.h = clamp(r.h, minH(p), maxH(p));
            else if (!r.hidden) r.h = headRows(p);
        });
        return resolve(map);
    }
    function defaults() {
        boardW(); // measured at the board's width now, not as of the last observer report
        const wide = new Map(panels.map((p) => [p, read(p)]));
        const t = tier();
        const media = (p) => p.matches('.panel-media');
        // A meme or a list (kept) keeps its height: only what a panel holds in full is measured
        const own = t === 'wide' ? wide : cellsIn(t);
        if (own) {
            // The markup's cells, each row grown to its tallest content where this window wraps it
            // taller than the cells allow; panels sharing a row's top and height grow together (a
            // meme or a list in it counts at its height)
            render(own);
            const row = (r) => `${r.y}/${r.h}`;
            const need = new Map();
            own.forEach((r, p) => { if (!r.collapsed && !r.hidden) need.set(row(r), Math.max(need.get(row(r)) ?? 0, kept(p) ? r.h : clamp(contentH(p), minH(p), maxH(p)))); });
            if (!('tall' in board.dataset)) {
                own.forEach((r) => { if (!r.collapsed) r.h = Math.max(r.h, need.get(row(r)) ?? 0); });
                return fit(own);
            }
            // A tall board reads top to bottom, as the page it came from flowed: a row is as tall as
            // what it holds at this width, shorter too, and each panel keeps the gap its cells give
            // it under the lowest of the panels right above it in its columns (so the cells are exact
            // where they were measured, and a box never holds a blank band)
            const was = new Map([...own].map(([p, r]) => [p, { ...r }]));
            const shown = [...own].filter(([, r]) => !r.hidden).sort(([, a], [, b]) => a.y - b.y);
            const over = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w;
            const under = (a, b) => a.y + a.h <= b.y && over(a, b); // a ends above b, in some of its columns
            shown.forEach(([p, r]) => {
                const o = was.get(p);
                if (!r.collapsed) r.h = need.get(row(o)) ?? r.h;
                const above = shown.map(([q]) => q).filter((q) => under(was.get(q), o));
                const right = above.filter((q) => !above.some((m) => m !== q && under(was.get(q), was.get(m))));
                const end = (m) => Math.max(...right.map((q) => m.get(q).y + m.get(q).h));
                if (right.length) r.y = end(own) + o.y - end(was);
            });
            return fit(own);
        }
        const order = [...wide].sort(([, a], [, b]) => a.y - b.y || a.x - b.x).map(([p]) => p);
        // Phone: full width. Mid: half the row, or all of it for a panel spanning three quarters or
        // more of the wide row, so every row holds two panels or one; a meme keeps its wide height
        const width = (p) => (t === 'phone' || wide.get(p).w >= cols() * 1.5 ? cols() : Math.floor(cols() / 2));
        const flow = new Map(order.map((p) => [p, { x: 1, y: 1, w: width(p), h: MIN_H, hidden: false, collapsed: wide.get(p).collapsed }]));
        render(flow); // at their widths, so each body's content wraps the way it will
        flow.forEach((r, p) => { r.h = r.collapsed ? headRows(p) : (t === 'mid' && media(p)) || 'scroll' in p.dataset ? wide.get(p).h : clamp(contentH(p), minH(p), maxH(p)); });
        // In reading order, each takes the highest free spot, leftmost first
        const placed = [];
        flow.forEach((r) => {
            for (let y = 1; !placed.includes(r); y++) {
                for (let x = 1; x <= cols() - r.w + 1; x++) {
                    if (placed.some((o) => overlap(o, { ...r, x, y }))) continue;
                    Object.assign(r, { x, y });
                    placed.push(r);
                    break;
                }
            }
        });
        return fit(flow);
    }
    const same = (a, b) => [...a].every(([p, r]) => ['x', 'y', 'w', 'h', 'hidden', 'collapsed'].every((k) => (r[k] ?? false) === (b.get(p)[k] ?? false)));
    // The layout Reset replaced, offered back until the next change; whether the visitor has arranged
    // anything this visit (a layout saved on an earlier one is fitted again as content lands); and the
    // saves a Reset of the board around this one took, every tier's, held for its Undo
    let undo = null, arranged = false, held = null;
    let height = board.offsetHeight; // a board in a panel: how tall its panel last heard it was
    // Reading order becomes DOM order, so tab order follows the layout. Add widget shows only
    // with something to add
    function settle(next) {
        layout = next;
        // Last to first, moving only a panel not already in front of the one after it: an
        // unchanged order touches nothing (Firefox before 144 has no moveBefore, and its
        // insertBefore rebuilds every panel it moves). Hidden panels keep their cells, so they
        // sort in place too
        let after = ghost;
        [...layout].sort(([, a], [, b]) => b.y - a.y || b.x - a.x)
            .forEach(([p]) => { if (p.nextElementSibling !== after) place(p, after); after = p; });
        fillMenu();
        add.hidden = !panels.some((p) => layout.get(p).hidden);
        board.toggleAttribute('data-custom', !same(layout, base)); // the visitor's own, for the board around it
        offer();
        if (stale && same(layout, base)) remeasure();
        tell();
    }
    // Whether Undo would put anything back: saves it holds, or what its Reset replaced, if that differs
    // from what's here or a board in its panels holds saves
    const undoable = () => !!held || (!!undo && (!same(undo, layout) || !!board.querySelector('.board[data-held]')));
    // Reset shows once this board, or a board in one of its panels, differs from its default; Undo,
    // while it would put something back
    function offer() {
        const back = undoable();
        reset.hidden = !back && same(layout, base) && !board.querySelector('.board[data-custom]');
        label(reset, back ? words.undo : words.reset);
    }
    const hold = (saves) => { held = saves; board.toggleAttribute('data-held', !!saves); offer(); };
    // A board in a panel tells its panel when it's grown or shrunk, once it's done (a gesture's
    // arranging room gone), and still before the page paints it
    function tell() {
        if (host) queueMicrotask(() => {
            const grew = board.offsetHeight - height;
            height += grew;
            if (grew) board.dispatchEvent(new CustomEvent('boardchange', { bubbles: true, detail: grew }));
        });
    }
    // A visitor's change: settle it and save it (a board back at its default saves nothing).
    // `back` is what a reset replaced; any other change drops it
    function commit(next, back = null) {
        // A move into a wall or a drop in place arranges nothing and saves nothing (a layout fitted
        // with the fallback fonts mustn't overwrite the save it came from)
        const changed = !same(next, layout);
        undo = back;
        if (changed && held) hold(null); // changed since: an Undo around it leaves it be
        arranged ||= changed;
        settle(next);
        if (!changed) return;
        try {
            if (same(layout, base)) localStorage.removeItem(key);
            else localStorage.setItem(key, JSON.stringify({ v: VERSION, cols: cols(), items: [...layout].map(([p, r]) => ({ id: p.id, ...r })) }));
        } catch { /* private mode: the layout lasts this visit */ }
    }
    // This size's layout: the default, with the visitor's saved one on top (panels added to the
    // page since keep their default spot). Runs again when the window crosses into another tier
    function load(keep = null) {
        // Measuring renders the markup's cells for a moment, which can clamp a body scrolled
        // inside: each keeps its place
        const scrolled = panels.flatMap((p) => { const b = own(p, '.panel-body'); return b?.scrollTop ? [[b, b.scrollTop]] : []; });
        key = keyFor();
        base = defaults();
        const next = copy(base);
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(key)); } catch { /* no saved layout */ }
        // A save keeps the grid it was made on: one from another (the phone tier had 4 columns until
        // 2026-10-11, before saves recorded theirs) would land in the wrong cells, so it's set aside
        if (saved?.v === VERSION && (saved.cols ?? (tier() === 'phone' ? 4 : cols())) === cols()) {
            saved.items.forEach(({ id, x, y, w, h, hidden, collapsed, full }) => {
                const p = document.getElementById(id);
                if (next.has(p)) next.set(p, { x, y, w, h, hidden, collapsed, full });
            });
        }
        render(fit(next));
        undo = keep; // a re-measure right after a Reset keeps Undo on offer (and its focus)
        settle(next);
        scrolled.forEach(([b, top]) => { if (b.scrollTop !== top) b.scrollTop = top; });
        return !!saved;
    }

    // ─── Toolbar, live region, snap ghost ───
    // The bar goes where the page gives it a home (any element with data-board-bar=<name>),
    // otherwise right above the board; a board in a panel keeps its two buttons, as icons, with
    // that panel's tools
    const tools = host && own(host, ':is(.panel-head, .panel-grab) > .panel-tools');
    const bar = document.querySelector(`[data-board-bar="${board.dataset.board}"]`) ?? el(tools ? 'span' : 'div');
    const status = el('p', 'sr-only');
    const menu = el('div', 'board-menu');
    const add = button('');
    const reset = button('');
    const where = tools && title(host);
    const words = where
        ? { add: ['＋', `Add a block back to ${where}`], reset: ['↺', `Reset ${where}'s blocks`], undo: ['↶', `Undo the reset of ${where}'s blocks`] }
        : { add: ['＋ Add widget'], reset: ['Reset layout'], undo: ['Undo reset'] };
    const label = (b, [text, name]) => {
        b.textContent = text;
        if (name) { b.title = name; b.setAttribute('aria-label', name); }
    };
    label(add, words.add);
    const ghost = el('div', 'board-ghost');
    status.setAttribute('aria-live', 'polite');
    menu.id = `${board.dataset.board}-menu`;
    menu.popover = 'auto';
    add.setAttribute('popovertarget', menu.id);
    ghost.hidden = true;
    bar.classList.add(tools ? 'board-tools' : 'board-bar');
    bar.append(status, add, reset, menu);
    if (!bar.isConnected) tools ? tools.prepend(bar) : board.before(bar);
    board.append(ghost);
    const say = (msg) => { status.textContent = msg; };
    // The ghost marks where a grabbed panel will land, in that panel's accent and inset (computed to
    // a length, board.css; a carried panel's own margins are 0, so they can't be read instead)
    const showGhost = (p, r) => {
        ['--accent', '--inset'].forEach((k) => ghost.style.setProperty(k, getComputedStyle(p).getPropertyValue(k)));
        setCell(ghost, r);
        ghost.hidden = false;
    };

    function fillMenu() {
        // Add widget only shows while something is hidden, so the menu is never empty. It's rebuilt
        // only when what's hidden changes, so a re-measure leaves an open menu (and its focus) be
        const gone = panels.filter((p) => layout.get(p).hidden);
        if (gone.length === menu.children.length && gone.every((p, i) => menu.children[i].dataset.id === p.id)) return;
        menu.replaceChildren(...gone.map((p) => {
            const b = button(`＋ ${title(p)}`);
            b.dataset.id = p.id;
            b.addEventListener('click', () => {
                const next = copy(layout);
                next.get(p).hidden = false; // back where it was; anything there now is pushed down
                flip(() => { render(resolve(next, p)); grow(next, p); });
                commit(next);
                menu.hidePopover();
                say(`${title(p)} added back`);
                p.scrollIntoView({ block: 'nearest' });
                own(p, ':is(.panel-head, .panel-grab) .panel-grip').focus({ preventScroll: true });
            });
            return b;
        }));
    }

    // ─── Pointer gestures: start() returns { move, done(cancel) }, or nothing to ignore the press ───
    // While one runs, the page scrolls when the pointer nears the top or bottom of the screen
    // (faster the closer it gets, the same speed at any refresh rate, and on while it rests
    // there), and Escape or a cancelled pointer puts everything back. Only the pointer that
    // started it drives it. A page with a sticky bar on top says so the standard way
    // (scroll-padding-top on the root), and the top edge starts below it
    const EDGE = 64;
    // The handle a drag ran from since the last press: the click its release fires is no double-click
    let dragged = null;
    // A block a finger has set down stays picked, its ✕ and corner live (board.css), until a press lands outside it
    function pick(p) {
        if (p.classList.contains('is-picked')) return;
        p.classList.add('is-picked');
        const off = new AbortController();
        addEventListener('pointerdown', (ev) => { if (!p.contains(ev.target)) { p.classList.remove('is-picked'); off.abort(); } }, { capture: true, signal: off.signal });
    }
    function begin(handle, start, e, first = e) {
        if (active) return;
        handle.setPointerCapture(e.pointerId);
        const op = start(e);
        if (!op) return;
        dragged = handle;
        board.classList.add('is-arranging');
        const stop = new AbortController();
        const on = (type, fn, opts, target = handle) => target.addEventListener(type, fn, { signal: stop.signal, ...opts });
        const mine = (fn) => (ev) => ev.pointerId === e.pointerId && fn(ev);
        let last = first; // the move that started it, so a refresh before the next move doesn't aim at the press
        let scroll = 0;
        let then = 0;
        const pad = getComputedStyle(document.documentElement).scrollPaddingTop;
        const top = EDGE + (pad.endsWith('%') ? innerHeight * parseFloat(pad) / 100 : parseFloat(pad) || 0);
        const edge = (now) => {
            const v = last.clientY < top ? last.clientY - top : Math.max(0, last.clientY - innerHeight + EDGE);
            const dt = Math.min(now - (then || now), 50); // ms since the last step
            then = v && now;
            scroll = v && requestAnimationFrame(edge);
            if (!v) return;
            scrollBy({ top: clamp(v / 50, -1.2, 1.2) * dt, behavior: 'instant' }); // the page's smooth scroll would queue
            op.move(last); // re-aim at whatever is under the pointer now
        };
        // The panel lands before the board drops its arranging room, so the page can't lose its scroll
        const end = (cancel) => {
            stop.abort(); cancelAnimationFrame(scroll); active = null; op.done(cancel); board.classList.remove('is-arranging'); haptic();
            if (e.pointerType === 'mouse') return;
            if (host) pick(handle.closest('.panel'));
            // A finger let go where it held fires a click there, on whatever is under it now (a ✕ the
            // pick just made live, a link): it's the gesture's, so nothing takes it. One that moved fires
            // none, so the next press disarms it, and a real tap after a drag still lands
            const off = new AbortController();
            addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); }, { capture: true, once: true, signal: off.signal });
            addEventListener('pointerdown', () => off.abort(), { capture: true, once: true, signal: off.signal });
            setTimeout(() => off.abort(), 400);
        };
        // A change under the gesture (a board in the panel being resized swapped its tier) is followed at once
        active = Object.assign(() => end(true), { refresh: () => op.move(last) });
        on('pointermove', mine((ev) => { last = ev; op.move(ev); scroll ||= requestAnimationFrame(edge); }));
        on('pointerup', mine(() => end(false)));
        // Capture lost with no release seen: it was let go where this page couldn't see, so it lands.
        // The handle's own loss only: a finger's implicit capture on the title, handed to the handle
        // as the hold lifts the panel, bubbles up as one too
        on('lostpointercapture', mine((ev) => ev.target === handle && end(false)));
        on('pointercancel', mine(() => end(true)));
        on('keydown', (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); end(true); } }, {}, window);
        // Once a finger has a panel, it moves the panel and not the page, and opens no menu
        on('touchmove', (ev) => { if (ev.cancelable) ev.preventDefault(); }, { passive: false });
        on('contextmenu', (ev) => ev.preventDefault());
        scroll = requestAnimationFrame(edge); // a press already at the edge scrolls without waiting for a move
        haptic();
        return op;
    }
    // A gesture starts only once it means it, so a plain click or tap costs nothing. With
    // `hold`, a finger or pen rests on the handle for --hold (board.css) before the panel lifts,
    // so a swipe that starts on it still scrolls the page; anything else lifts once it has
    // moved a few px from where it pressed
    // `where` narrows a handle to the presses it answers (a block answers on its strip's band only)
    function track(handle, start, hold, where) {
        handle.addEventListener('pointerdown', (e) => {
            dragged = null;
            // A press on a control inside the handle (the head's ✕, a block's link or toggle), or in a
            // board-in-the-panel's menu, is a click, not a drag
            if (e.button || cols() < 2 || (where && !where(e)) || (e.target !== handle && e.target.closest('button, a, input, label, select, textarea, summary, .board-menu'))) return;
            const panel = handle.closest('.panel');
            const wait = new AbortController();
            // A block isn't captured at the press, so it hears this pointer on the window: a fast move out
            // of it, or a release outside, still ends the wait
            const on = (type, fn) => (where && type.startsWith('pointer')
                ? addEventListener(type, (ev) => ev.pointerId === e.pointerId && fn(ev), { capture: true, signal: wait.signal })
                : handle.addEventListener(type, fn, { signal: wait.signal }));
            const moved = (ev, px) => Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) > px;
            let timer = 0;
            const quit = () => { wait.abort(); panel.classList.remove('is-pressed'); if (timer) { clearTimeout(timer); panel.classList.remove('is-holding'); } };
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
            // A thin edge loses a fast pointer otherwise; a block is captured only once it moves, so a click lands on what it pressed
            if (!where) handle.setPointerCapture(e.pointerId);
            panel.classList.add('is-pressed'); // a frame under the first move can't take it (board.css)
            on('pointermove', (ev) => {
                if (!ev.buttons) return quit(); // its release went unseen (it hears the whole window, so it'd carry on a hover)
                if (moved(ev, 3)) { quit(); begin(handle, start, e, ev)?.move(ev); }
            });
        });
    }

    // Move: the panel follows the pointer (translate only, so the compositor carries it) while
    // the ghost shows where it will land
    const moveFrom = (p) => (e) => {
        // The layout box, not the slightly scaled one a held panel has grown into
        const rect = p.getBoundingClientRect();
        const r0 = { width: p.offsetWidth, height: p.offsetHeight };
        Object.assign(r0, { left: rect.left + (rect.width - r0.width) / 2, top: rect.top + (rect.height - r0.height) / 2 });
        const off = { x: e.clientX - r0.left + margin(p, 'Left'), y: e.clientY - r0.top + margin(p, 'Top') };
        const me = layout.get(p);
        const at = { x: me.x, y: me.y };
        let next = layout;
        let frame = 0;
        let pending;
        Object.assign(p.style, { width: `${r0.width}px`, height: `${r0.height}px`, left: `${r0.left}px`, top: `${r0.top}px` });
        p.classList.add('is-dragging');
        // Carried, it's fixed in place, which a panel with a filter (a home box's blur, gone on a lean
        // board) or a transform places from itself rather than the window: so it's set back where it
        // was, and where a panel placed it, it's kept with the pointer as the page scrolls
        const now = p.getBoundingClientRect();
        const shift = { x: now.left + (now.width - r0.width) / 2 - r0.left, y: now.top + (now.height - r0.height) / 2 - r0.top };
        p.style.left = `${r0.left - shift.x}px`;
        p.style.top = `${r0.top - shift.y}px`;
        const placed = Math.abs(shift.x) > 0.5 || Math.abs(shift.y) > 0.5;
        const b0 = board.getBoundingClientRect();
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
                const b = placed ? board.getBoundingClientRect() : b0;
                p.style.translate = `${ev.clientX - e.clientX + b0.left - b.left}px ${ev.clientY - e.clientY + b0.top - b.top}px`;
                pending = ev;
                frame ||= requestAnimationFrame(retarget);
            },
            done(cancel) {
                cancelAnimationFrame(frame);
                if (cancel) next = layout;
                flip(() => {
                    ghost.hidden = true;
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
        const floor = minH(p, true);
        const ceiling = maxH(p);
        const narrow = narrowest(p);
        // On a tall board one that held exactly its content keeps holding it as it's made wider or narrower
        const hugging = whole(p) && start.h <= floor;
        const r0 = p.getBoundingClientRect();
        const y0 = scrollY; // the edge follows the pointer on the page, so it keeps up while the page scrolls
        // The live edge stays between the panel's minimum and the board's edge (px, gutters out); its
        // height limits are read as it goes (follow)
        const room = { x: margin(p, 'Left', 'Right'), y: gutters(p) };
        const px = (cells, axis) => cells * c[axis] - room[axis];
        const limit = { w: [px(narrow, 'x'), px(dir.includes('w') ? start.x + start.w - 1 : cols() - start.x + 1, 'x')] };
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
            // What it holds, read at the width it's being given (on a tall board, its floor follows)
            p.style.width = `${w}px`;
            const least = whole(p) ? minH(p) : floor, top = Math.max(ceiling, least);
            const lim = [px(least, 'y'), px(dir.includes('n') ? Math.min(top, start.y + start.h - 1) : top, 'y')];
            const sides = !dir.includes('s') && !dir.includes('n') && whole(p);
            const h = dir.includes('s') ? clamp(r0.height + dy, ...lim) : dir.includes('n') ? clamp(r0.height - dy, ...lim)
                : sides ? (hugging ? lim[0] : Math.max(r0.height, lim[0])) : r0.height;
            Object.assign(p.style, { width: `${w}px`, height: `${h}px`,
                translate: `${dir.includes('w') ? r0.width - w : 0}px ${dir.includes('n') ? r0.height - h : 0}px` });
            d.c = snap(dx / c.x, d.c);
            d.r = snap(dy / c.y, d.r);
            const r = { ...start };
            if (dir.includes('e')) r.w = clamp(start.w + d.c, narrow, cols() - start.x + 1);
            if (dir.includes('w')) { r.x = clamp(start.x + d.c, 1, start.x + start.w - narrow); r.w = start.w + start.x - r.x; }
            while (r.w > start.w && blocked(r)) { if (dir.includes('w')) r.x++; r.w--; }
            if (dir.includes('s')) r.h = clamp(start.h + d.r, least, top);
            if (dir.includes('n')) { const lo = Math.max(1, start.y + start.h - top); r.y = clamp(start.y + d.r, lo, Math.max(lo, start.y + start.h - least)); r.h = Math.max(start.h + start.y - r.y, least); }
            if (sides) r.h = hugging ? least : Math.max(start.h, least);
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
                flip(() => {
                    ghost.hidden = true;
                    p.classList.remove('is-resizing');
                    ['width', 'height', 'translate'].forEach((k) => p.style.removeProperty(k));
                    render(next);
                    if (!cancel) grow(next, p, hugging && !/[ns]/.test(dir)); // a side drag that hugged hugs where it landed
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
            // Made wider or narrower (not taller or shorter), one that held exactly its content keeps holding
            // it: judged where the layout had it, its glide landed, not at a width it's still gliding through
            flip(() => {
                const hug = !d[1] && whole(p) && !layout.get(p).collapsed && layout.get(p).h <= minH(p, true);
                render(resolve(next, p));
                grow(next, p, hug);
            });
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
        // only shows on focus. The tools sit at the end of the head or grab strip
        const headed = own(p, '.panel-head');
        const head = headed ?? p.appendChild(el('div', 'panel-grab'));
        const tools = el('div', 'panel-tools');
        const grip = button('⠿', `Move ${name} with the arrow keys`, 'panel-grip');
        const collapse = headed && button('▾', `Collapse ${name} to its title bar`, 'panel-collapse');
        const hide = button('✕', `Hide ${name}`, 'panel-close');
        tools.append(...[grip, collapse, hide].filter(Boolean));
        head.append(tools);
        EDGES.forEach((dir) => {
            // The corner is the keyboard's way in; the other edges are pointer-only
            const edge = dir === 'se' ? button('', `Resize ${name}; Enter fits it to its content`, 'panel-edge') : el('span', 'panel-edge');
            edge.dataset.dir = dir;
            p.append(edge);
            track(edge, resizeFrom(p, dir));
        });
        // Double-click the corner (or Enter on it) and the panel takes the height its content
        // needs at this width; a meme takes its picture's shape
        const corner = own(p, '.panel-edge[data-dir="se"]');
        corner.title = 'Drag to resize, double-click to fit';
        corner.addEventListener('click', (e) => {
            if (e.detail === 1 || (e.detail && dragged === corner)) return; // one click of a pair, or the click a drag's release fires
            const next = copy(layout);
            next.get(p).h = clamp(contentH(p, true), minH(p), maxH(p));
            flip(() => render(resolve(next, p)));
            commit(next);
            say(`${name} fitted to ${next.get(p).h} rows`);
        });
        const dots = el('span', 'panel-dots');
        dots.setAttribute('aria-hidden', 'true');
        p.append(dots);
        // A block (a headless panel on a board in a panel) holds content up to its top, links and all: its
        // strip only holds its tools, and the block answers a press on the strip's band itself (on what it
        // holds, a picture too) unless it's on a control, so nothing it holds is covered (an embed keeps
        // its own presses; the dots move it)
        const band = !headed && host && ((e) => {
            const r = head.getBoundingClientRect();
            return !e.target.closest('.panel-grab, .panel-edge, .panel-dots') && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        });
        track(band ? p : head, moveFrom(p), true, band);
        track(dots, moveFrom(p), true);

        keyed(grip, p, (r, dx, dy, next) => {
            r.x = clamp(r.x + dx, 1, cols() - r.w + 1);
            r.y = Math.max(1, r.y + dy);
            // Stepping into a neighbor's rows hops it: going up, take its top (it moves down);
            // going down, start inside it so resolve() settles this panel underneath
            const hit = [...next].find(([o, n]) => o !== p && !n.hidden && overlap(n, r))?.[1];
            if (hit && dy) r.y = dy < 0 ? hit.y : hit.y + 1;
        });
        keyed(corner, p, (r, dx, dy) => {
            r.w = clamp(r.w + dx, narrowest(p), cols() - r.x + 1);
            r.h = clamp(r.h + dy, minH(p), maxH(p));
        });

        // Collapse to the title bar and back. The space below stays as it was, and opening again
        // pushes down whatever has moved into it
        collapse?.addEventListener('click', () => {
            const next = copy(layout);
            const r = next.get(p);
            if (r.collapsed) {
                p.classList.remove('is-collapsed'); // one that started collapsed has no height to go back to: it fits its content
                Object.assign(r, { h: r.full ?? clamp(contentH(p, true), minH(p), maxH(p)), collapsed: false, full: undefined });
            }
            else {
                Object.assign(r, { full: r.h, collapsed: true });
                p.classList.add('is-collapsed'); // measured as the title bar it becomes
                r.h = headRows(p);
            }
            flip(() => { render(resolve(next, p)); grow(next, p); });
            commit(next);
            say(`${name} ${r.collapsed ? 'collapsed' : 'opened'}`);
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
    // the panels' blur for the rest of the visit: once, so the blur can't flicker back on. It may
    // have caught the machine before this script ran
    const leanOut = () => { if (document.body.classList.contains('zp-motion-throttled')) { board.classList.add('is-lean'); lean.disconnect(); } };
    const lean = new MutationObserver(leanOut);
    lean.observe(document.body, { attributeFilter: ['class'] });
    leanOut();

    // Default heights are measured from the content, so measure again once the fonts are in, as
    // pictures arrive (their load events, caught on the way down) and when the window's width
    // changes within a tier, unless the visitor has arranged the layout this visit (or is doing it
    // now). A layout saved on an earlier visit is fitted again from the save, since its first fit
    // measured with the fallback fonts and may have held a tall panel short of what it holds.
    // Height alone never re-measures: a phone's toolbar hiding mid-scroll mustn't move panels.
    // Crossing into another tier swaps layouts, ending a gesture first so it can't save into the other one
    let again, stale = false, width = innerWidth;
    // The visitor's own layout, arranged this visit: it isn't measured again (one at its default is)
    const theirs = () => arranged && !same(layout, base);
    // Arranged, it waits: settle() asks again once the layout is back at its default
    const measure = () => {
        // Mid-gesture on any board, or a finger resting on a panel (it swells): once it ends
        if (active || board.querySelector('.is-holding')) return remeasure();
        stale = theirs(); // a measure skipped
        if (!stale) load(undo);
    };
    const remeasure = () => { clearTimeout(again); again = setTimeout(measure, 150); };
    load();
    document.fonts?.ready.then(remeasure);
    board.addEventListener('load', remeasure, true);
    addEventListener('resize', () => { if (innerWidth !== width) { width = innerWidth; remeasure(); } });
    // A board in a panel follows its own width: it measures again as that changes within a tier, and
    // swaps layouts once its panel is narrower or wider into another (after the gesture doing it,
    // which may be the visitor resizing that panel)
    let across = board.clientWidth;
    const swap = () => (active ? setTimeout(swap, 150) : keyFor() !== key && load());
    const widthChanged = () => {
        if (board.clientWidth === across) return;
        across = board.clientWidth;
        if (keyFor() === key) return remeasure(); // once its width rests: a window swept across measures it once, not every step
        if (active) { render(fit(copy(layout))); tell(); } // meanwhile the old layout, fitted into the new grid
        swap();
    };
    // (read in the next frame, out of the observer's own pass, which reading the tier would loop)
    new ResizeObserver(() => { boardW(); if (host) requestAnimationFrame(widthChanged); }).observe(board);
    if (!host) TIERS.forEach((mq) => mq.addEventListener('change', () => { active?.(); load(); }));
    // A board in one of these panels grew or shrank (its blocks moved, or what they hold changed): the
    // panel holds it. A layout that isn't the visitor's own (theirs) is measured again; theirs keeps its
    // panel's height unless it's now short of the board, or held just what it holds before
    board.addEventListener('boardchange', (e) => {
        const p = e.target.parentElement.closest('.panel');
        if (!panels.includes(p)) return;
        if (active) { active.refresh(); return remeasure(); } // the gesture holds it now, a measure after
        if (!theirs()) return load(undo);
        const next = copy(layout), r = next.get(p);
        if (r.hidden || r.collapsed) return;
        const hug = r.h <= minH(p, true, e.detail);
        flip(() => grow(next, p, hug));
        commit(next);
    });

    // Reset puts the board, and every board in its panels, back to its default (Doshus, 2026-10-17);
    // then, until each one's next change, Undo puts back what it had. The pressed board tells the boards
    // in its panels with a boardreset event (detail: whether it's Undo); each of those takes every
    // tier's save, held for its Undo, since its tier can change under it (the Reset gives its panel back
    // its default width), and its own pending Undo gives way
    function restart(undoing, pressed) {
        active?.(); // a gesture running would land over it
        if (pressed) board.querySelectorAll('.board[data-board]').forEach((b) => b.dispatchEvent(new CustomEvent('boardreset', { detail: undoing })));
        if (undoing && held) {
            // The saves go back, and it loads this tier's (another's, once its panel is put back)
            Object.entries(held).forEach(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* blocked since */ } });
            hold(null);
            flip(() => load());
            arranged = true;
        } else if (!pressed) {
            if (undoing) return; // changed since, or nothing held: it keeps what it has
            const saves = {};
            ['wide', 'mid', 'phone'].map(keyOf).forEach((k) => { try { const v = localStorage.getItem(k); if (v) { saves[k] = v; localStorage.removeItem(k); } } catch { /* nothing saved */ } });
            flip(() => load()); // a box hidden now (no width to measure) measures again as it shows
            hold(Object.keys(saves).length ? saves : null);
        } else {
            let next = undoing ? undo : null;
            // The default measured now, with the boards inside it reset (and any measure skipped while it
            // was arranged); a layout put back fitted to what its panels hold now
            flip(() => { if (!next) { stale = false; base = defaults(); } next ??= copy(base); render(undoing ? fit(next) : next); });
            commit(next, undoing ? null : copy(layout));
        }
        if (!pressed) return;
        say(undoing ? 'Layout restored' : 'Layout reset');
        haptic();
    }
    reset.addEventListener('click', () => restart(undoable(), true));
    board.addEventListener('boardreset', (e) => restart(e.detail, false));
    // A board in one of its panels changed whether it's the visitor's own, or whether it holds saves
    if (board.querySelector('.board[data-board]')) new MutationObserver(offer).observe(board, { subtree: true, attributeFilter: ['data-custom', 'data-held'] });
});
