#!/usr/bin/env node
// The board engine (UI-SPEC.md, public/js/board.js) in a real browser, on /nexus (a few cases on
// /financehub and /thelounge) served from public/. Every case here is a bug a review found or a promise the spec makes.
// Run: bun run test. Once per machine: bunx playwright install chromium. PW_CHROMIUM=<path to a
// chrome binary> runs another Chromium build instead of Playwright's own. It runs the full build,
// not the headless shell Playwright launches by default: the shell keeps a cross-site frame in its
// page's process, so the Sandspiel frame never takes the pointer away as it does in a browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', 'public');
const PAGE = '/nexus.html';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const WIDE = { viewport: { width: 1440, height: 900 } };
const FOLD = { viewport: { width: 901, height: 1000 }, isMobile: true, hasTouch: true }; // a Galaxy Z Fold7 opened
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const SMALL = { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true };
const LAUNCH = { channel: 'chromium', executablePath: process.env.PW_CHROMIUM || undefined, args: ['--disable-3d-apis'] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// shared.css's reduced motion still transitions every property for a frame: wait out two frames
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
// Wait out a node's transitions (its subtree's too), not a frame count (a busy machine starts them
// late); a cancelled one counts as done, and an endless one can't hang the suite past 2s
const settled = (handle, subtree = true) => handle.evaluate((n, subtree) => Promise.race([
    Promise.allSettled(n.getAnimations({ subtree }).map((a) => a.finished)), new Promise((r) => setTimeout(r, 2000))]), subtree);

function serve() {
    const server = http.createServer((req, res) => {
        let file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (!file.startsWith(ROOT)) return res.writeHead(403).end();
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
        fs.readFile(file, (err, body) => (err ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(body)));
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

let base;
async function open(browser, opts = WIDE, { init, motion = 'reduce', delayBoard, path = PAGE, route } = {}) {
    const ctx = await browser.newContext({ ...opts, reducedMotion: motion });
    if (init) await ctx.addInitScript(init);
    await ctx.route((url) => !url.href.startsWith(base), (r) => r.abort()); // nothing leaves the machine
    if (route) await ctx.route(...route); // a page or a reply made for the case: [url, handler]
    if (delayBoard) await ctx.route('**/js/board.js', async (r) => { await sleep(delayBoard); r.continue(); });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + path, { waitUntil: 'load' });
    // Web fonts change what a panel measures; board.js measures its defaults again once they're in
    await page.evaluate(() => document.fonts.ready);
    await sleep(600);
    return { ctx, page, errors };
}
// In the page: a panel's cells, a tier's save, and the moves its DOM sees
const cells = (page, id) => page.evaluate((id) => { const s = document.getElementById(id).style; return ['x', 'y', 'w', 'h'].map((k) => +s.getPropertyValue('--' + k)); }, id);
const saved = (page, tier = '') => page.evaluate((k) => localStorage.getItem('board:nexus' + k), tier && ':' + tier);
const arranging = (page) => page.evaluate(() => document.querySelector('.board').classList.contains('is-arranging'));
const countMoves = () => { window.__moves = 0; for (const m of ['moveBefore', 'insertBefore']) { const f = Element.prototype[m]; if (f) Element.prototype[m] = function (...a) { if (this.matches?.('.board')) window.__moves++; return f.apply(this, a); }; } };
// Once every board's cells and height have held still for 400ms (longer than the engine's 150ms waits for a
// resize to rest, so a measure still due resets it); 4s without that fails
const steady = async (page) => {
    for (let last = '', since = Date.now(), end = Date.now() + 4000; Date.now() < end; await sleep(100)) {
        const now = await page.evaluate(() => [...document.querySelectorAll('.board')].map((b) => `${b.offsetHeight}:${[...b.querySelectorAll(':scope > .panel')].map((p) => p.style.cssText).join()}`).join('|'));
        if (now !== last) [last, since] = [now, Date.now()];
        else if (Date.now() - since >= 400) return;
    }
    throw new Error('the boards never held still for 400ms within 4s');
};
const center = async (page, id) => { await page.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'center' }), id); await sleep(150); };
// Made shorter than what it holds by the keyboard, as a visitor would, so its body scrolls inside
// (Nexus's Dev Core, marked data-tall, is as tall as its content by default)
const squeeze = async (page, id, n = 10) => { await page.focus(`#${id} > .panel-edge[data-dir="se"]`); for (let i = 0; i < n; i++) await page.keyboard.press('ArrowUp'); await sleep(300); };
async function drag(page, sel, dx, dy, { hold, before } = {}) {
    const box = await page.locator(sel).boundingBox();
    const x = box.x + box.width / 2, y = box.y + Math.min(box.height / 2, 20);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 6, y + 6);
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
    if (before) await before();
    if (hold) await sleep(hold);
    await page.mouse.up();
    await sleep(200);
}

const TESTS = {
    async 'a plain click arranges nothing'(browser) {
        const { page, errors } = await open(browser, WIDE, { init: countMoves });
        await center(page, 'mobile');
        await page.evaluate(() => { window.__moves = 0; });
        await page.click('#mobile .panel-head h2');
        assert.equal(await arranging(page), false);
        assert.equal(await saved(page), null);
        assert.equal(await page.evaluate(() => window.__moves), 0);
        return errors;
    },
    async 'a drag moves a panel and saves; Escape puts it back'(browser) {
        const { page, errors } = await open(browser);
        await center(page, 'stack');
        const before = await cells(page, 'stack');
        await drag(page, '#stack .panel-head', 200, 0);
        const moved = await cells(page, 'stack');
        assert.ok(moved[0] > before[0], `moved right: ${before} -> ${moved}`);
        assert.ok(JSON.parse(await saved(page)).items.some((i) => i.id === 'stack' && i.x === moved[0]));
        await drag(page, '#stack .panel-head', -200, 0, { before: () => page.keyboard.press('Escape') });
        assert.deepEqual(await cells(page, 'stack'), moved);
        return errors;
    },
    async 'a drop after autoscrolling keeps the page where it is'(browser) {
        const { page, errors } = await open(browser);
        await page.evaluate(() => { const p = document.getElementById('mobile'); scrollTo({ top: p.getBoundingClientRect().top + scrollY - 300, behavior: 'instant' }); });
        await sleep(200);
        const h = await page.locator('#mobile .panel-head').boundingBox();
        await page.mouse.move(h.x + 120, h.y + 20);
        await page.mouse.down();
        await page.mouse.move(h.x + 130, h.y + 60);
        await page.mouse.move(h.x + 130, 890, { steps: 5 }); // the bottom edge
        await sleep(1500);
        const during = await page.evaluate(() => scrollY);
        await page.mouse.up();
        await sleep(300);
        const after = await page.evaluate(() => scrollY);
        assert.ok(during > 0 && after >= during - 50, `scrollY ${during} -> ${after}`);
        return errors;
    },
    async 'autoscroll runs while the pointer rests at the edge'(browser) {
        const { page, errors } = await open(browser);
        await page.evaluate(() => { const h = document.querySelector('#dev-core .panel-head').getBoundingClientRect(); scrollBy({ top: h.top - 20, behavior: 'instant' }); });
        await sleep(200);
        const h = await page.locator('#dev-core .panel-head').boundingBox();
        const y0 = await page.evaluate(() => scrollY);
        await page.mouse.move(h.x + 60, h.y + 10);
        await page.mouse.down();
        await page.mouse.move(h.x + 60, h.y + 5); // starts the drag at the top edge, then rests
        const t0 = Date.now();
        let moved = 0;
        while (moved <= 100 && Date.now() - t0 < 3000) { await sleep(100); moved = y0 - (await page.evaluate(() => scrollY)); }
        // The pace, timed in the page between two samples once it's running (a clock started out here
        // misses whatever scrolled before it, so a busy machine read fast)
        const sample = () => page.evaluate(() => [scrollY, performance.now()]);
        const [s1, t1] = await sample();
        await sleep(300);
        const [s2, t2] = await sample();
        assert.ok(s2 > 0, 'reached the top while timing the pace');
        const rate = (s1 - s2) / (t2 - t1);
        await page.mouse.up();
        assert.ok(moved > 100, `scrolled only ${moved}px up in 3s of resting`);
        // Paced by time, not frames: under the 1.2 px/ms cap, and nowhere near a pixel a frame
        assert.ok(rate < 1.3 && rate > 0.15, `${rate.toFixed(2)} px/ms`);
        return errors;
    },
    async 'two fingers run one gesture'(browser) {
        const { ctx, page, errors } = await open(browser, { viewport: { width: 1300, height: 900 }, hasTouch: true });
        await center(page, 'stack');
        const cdp = await ctx.newCDPSession(page);
        const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([id, x, y]) => ({ id, x, y })) });
        const a = await page.locator('#stack .panel-head').boundingBox(), b = await page.locator('#signals .panel-head').boundingBox();
        const stack = await cells(page, 'stack');
        const A = [1, a.x + 100, a.y + 20], B = [2, b.x + 100, b.y + 20];
        await touch('touchStart', [A]); await sleep(100);
        await touch('touchStart', [A, B]); await sleep(700);
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.is-dragging')].map((p) => p.id)), ['stack']);
        await touch('touchMove', [[1, A[1] + 160, A[2]], [2, B[1] - 60, B[2]]]); await sleep(100);
        await touch('touchMove', [[1, A[1] + 160, A[2]]]); await sleep(200); // finger 2 lifts: it's no longer listed
        assert.equal(await arranging(page), true, 'lifting the second finger ends nothing');
        await touch('touchEnd', []); await sleep(300);
        assert.ok((await cells(page, 'stack'))[0] > stack[0], "the first finger's move lands");
        assert.equal(await arranging(page), false);
        return errors;
    },
    async 'a cancelled pointer puts the panel back'(browser) {
        const { ctx, page, errors } = await open(browser, { viewport: { width: 1300, height: 900 }, hasTouch: true });
        await center(page, 'mobile');
        const cdp = await ctx.newCDPSession(page);
        const a = await page.locator('#mobile .panel-head').boundingBox();
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x + 100, y: a.y + 20 }] }); await sleep(700);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + 300, y: a.y + 20 }] }); await sleep(100);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await sleep(300);
        assert.equal(await saved(page), null);
        assert.equal(await arranging(page), false);
        return errors;
    },
    async 'hiding a panel moves no other in the DOM, even without moveBefore'(browser) {
        const { page, errors } = await open(browser, WIDE, { init: () => { delete Element.prototype.moveBefore; } });
        await page.evaluate(`(${countMoves})()`);
        for (const id of ['meme-2', 'meme-1', 'dev-core']) await page.evaluate((id) => document.querySelector(`#${id} > :is(.panel-head, .panel-grab) .panel-close`).click(), id);
        for (let i = 0; i < 3; i++) await page.evaluate(() => document.querySelector('.board-menu button').click());
        assert.equal(await page.evaluate(() => window.__moves), 0);
        assert.equal(await page.evaluate(() => document.querySelectorAll('.panel[hidden]').length), 0);
        return errors;
    },
    async "the click a drag's release fires is no double-click fit"(browser) {
        const { page, errors } = await open(browser);
        await center(page, 'mobile');
        const h0 = (await cells(page, 'mobile'))[3];
        const c = await page.locator('#mobile .panel-edge[data-dir="se"]').boundingBox();
        const x = c.x + c.width / 2, y = c.y + c.height / 2;
        await page.mouse.click(x, y); // one click: nothing
        await page.mouse.down({ clickCount: 2 }); // the second press of a pair...
        await page.mouse.move(x, y - 100, { steps: 6 }); // ...turns into a drag
        await page.mouse.up({ clickCount: 2 });
        await sleep(200);
        const h = (await cells(page, 'mobile'))[3];
        assert.ok(h < h0, `the drag shrank it (${h0} -> ${h}), it wasn't fit to its content`);
        return errors;
    },
    async 'crossing into another tier mid-gesture saves nothing there'(browser) {
        const { page, errors } = await open(browser);
        await center(page, 'mobile');
        const h = await page.locator('#mobile .panel-head').boundingBox();
        await page.mouse.move(h.x + 100, h.y + 20);
        await page.mouse.down();
        await page.mouse.move(h.x + 300, h.y + 20, { steps: 5 });
        await page.setViewportSize({ width: 500, height: 900 });
        await sleep(300);
        await page.mouse.up();
        await sleep(200);
        assert.equal(await saved(page, 'phone'), null);
        assert.equal(await page.evaluate(() => document.querySelectorAll('.is-dragging').length), 0);
        return errors;
    },
    async 'a machine caught struggling before the board loads gets the lean board'(browser) {
        const init = () => { const t = setInterval(() => { if (document.body) { document.body.classList.add('zp-motion-throttled'); clearInterval(t); } }, 1); };
        const { page, errors } = await open(browser, WIDE, { init, delayBoard: 600 });
        await sleep(400);
        assert.equal(await page.evaluate(() => document.querySelector('.board').classList.contains('is-lean')), true);
        return errors;
    },
    async 'fit leaves the body without a scrollbar'(browser) {
        const { page, errors } = await open(browser);
        await center(page, 'signals');
        await page.focus('#signals .panel-edge[data-dir="se"]');
        await page.keyboard.press('Enter');
        await sleep(200);
        const [sh, ch] = await page.evaluate(() => { const b = document.querySelector('#signals .panel-body'); return [b.scrollHeight, b.clientHeight]; });
        assert.ok(sh <= ch, `scrollHeight ${sh} > clientHeight ${ch}`);
        return errors;
    },
    async 'a panel that scrolls inside scrolls to its end, then the page carries on'(browser) {
        const all = [];
        for (const opts of [WIDE, PHONE]) {
            const { ctx, page, errors } = await open(browser, opts);
            all.push(...errors);
            const at = `${opts.viewport.width}px`;
            const body = () => page.evaluate(() => { const b = document.querySelector('#dev-core .panel-body'); return [b.scrollTop, b.scrollHeight - b.clientHeight]; });
            await squeeze(page, 'dev-core');
            assert.ok((await body())[1] > 0, `${at}: Dev Core shows all it holds, so this case tests nothing`);
            await page.evaluate(() => { const b = document.querySelector('#dev-core .panel-body').getBoundingClientRect(); scrollBy({ top: b.top - 100, behavior: 'instant' }); });
            await sleep(200);
            const box = await page.locator('#dev-core .panel-body').boundingBox();
            const [x, y] = [box.x + box.width / 2, box.y + 150];
            const y0 = await page.evaluate(() => scrollY);
            // A finger swipes up (CDP touch events; a synthesized scroll gesture moves nothing headless), a mouse wheels
            const cdp = opts.hasTouch && await ctx.newCDPSession(page);
            const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
            for (let n = 0; n < 4; n++) {
                if (!cdp) { for (let i = 0; i < 3; i++) { await page.mouse.move(x, y); await page.mouse.wheel(0, 250); await sleep(60); } continue; }
                await touch('touchStart', [{ x, y: y + 200 }]);
                for (let i = 1; i <= 10; i++) { await touch('touchMove', [{ x, y: y + 200 - i * 25 }]); await sleep(16); }
                await touch('touchEnd', []);
                await sleep(400);
            }
            await sleep(300);
            const [top, max] = await body();
            assert.ok(top >= max - 1, `${at}: the panel stopped at ${top} of ${max}`);
            assert.ok((await page.evaluate(() => scrollY)) > y0 + 200, `${at}: the page did not carry on past the panel`);
            await ctx.close();
        }
        return all;
    },
    async 'the keyboard moves and resizes'(browser) {
        const { page, errors } = await open(browser);
        const [x, y, w, h] = await cells(page, 'stack');
        await page.focus('#stack .panel-grip');
        await page.keyboard.press('ArrowRight');
        assert.equal((await cells(page, 'stack'))[0], x + 1);
        await page.focus('#stack .panel-edge[data-dir="se"]');
        await page.keyboard.press('ArrowDown');
        assert.equal((await cells(page, 'stack'))[3], h + 1);
        assert.ok(await saved(page));
        return errors;
    },
    async 'Reset, then Undo, puts the visitor layout back'(browser) {
        const { page, errors } = await open(browser);
        await page.focus('#stack .panel-grip');
        await page.keyboard.press('ArrowRight');
        const mine = await saved(page);
        const reset = page.locator('.board-bar button', { hasText: 'Reset layout' });
        await reset.click();
        assert.equal(await saved(page), null);
        await page.locator('.board-bar button', { hasText: 'Undo reset' }).click();
        assert.equal(await saved(page), mine);
        return errors;
    },
    async 'a panel marked data-collapsed starts as its title bar and opens to its content'(browser) {
        // Mark Rig before board.js reads the markup
        const init = () => new MutationObserver((_, mo) => { const p = document.getElementById('rig'); if (p) { p.dataset.collapsed = ''; mo.disconnect(); } })
            .observe(document, { childList: true, subtree: true });
        const all = [];
        for (const opts of [WIDE, PHONE]) {
            const { page, errors } = await open(browser, opts, { init });
            all.push(...errors);
            const at = `${opts.viewport.width}px`;
            const rig = () => page.evaluate(() => {
                const p = document.getElementById('rig'), row = parseFloat(getComputedStyle(p.parentElement).gridAutoRows);
                const head = p.querySelector('.panel-head').offsetHeight + 2 * parseFloat(getComputedStyle(p).marginTop) + p.offsetHeight - p.clientHeight;
                const body = p.querySelector('.panel-body');
                return { collapsed: p.classList.contains('is-collapsed'), slack: +p.style.getPropertyValue('--h') - head / row, over: body.scrollHeight - body.clientHeight,
                    capped: +p.style.getPropertyValue('--h') >= Math.floor(innerHeight / row) };
            });
            const start = await rig();
            assert.ok(start.collapsed && start.slack >= 0 && start.slack < 1, `${at}: starts as a tight title bar ${JSON.stringify(start)}`);
            assert.equal(await saved(page, opts === WIDE ? '' : 'phone'), null, `${at}: the default saves nothing`);
            await page.click('#rig .panel-collapse');
            await frames(page);
            const opened = await rig();
            assert.ok(!opened.collapsed && (opened.over <= 0 || opened.capped), `${at}: opens to its content (or a screen tall) ${JSON.stringify(opened)}`);
            if (opts === WIDE) {
                await page.locator('.board-bar button', { hasText: 'Reset layout' }).click();
                await frames(page);
                assert.ok((await rig()).collapsed, 'Reset puts it back collapsed');
            }
            await page.context().close();
        }
        return all;
    },
    async "a fold eases open and shut where CSS can't animate it (Firefox, Safari)"(browser) {
        // Chromium playing a browser without interpolate-size
        const init = () => { const s = CSS.supports.bind(CSS); CSS.supports = (...a) => (String(a[0]).startsWith('interpolate-size') ? false : s(...a)); };
        const { page, errors } = await open(browser, WIDE, { init, motion: 'no-preference' });
        // ...where <details> snaps open and shut, as it does there
        await page.addStyleTag({ content: '::details-content { transition: none !important; }' });
        const heights = (click) => page.evaluate(async (click) => {
            const fold = document.querySelector('#rig details.fold'), out = [];
            if (click) fold.querySelector('summary').click();
            for (let t = 0; t < 6; t++) { out.push(Math.round(fold.getBoundingClientRect().height)); await new Promise((r) => setTimeout(r, 90)); }
            return { out, open: fold.open };
        }, click);
        const shut = (await heights(false)).out[0];
        const opening = await heights(true);
        assert.ok(opening.open && opening.out.some((h) => h > shut + 5 && h < opening.out[5] - 5), `no in-between heights opening: ${opening.out}`);
        const closing = await heights(true);
        assert.ok(closing.out.some((h) => h < opening.out[5] - 5 && h > shut + 5), `no in-between heights closing: ${closing.out}`);
        await sleep(200);
        assert.equal(await page.evaluate(() => document.querySelector('#rig details.fold').open), false, 'ends closed');
        return errors;
    },
    async "a card's tooltip is never cut off by the box it's in (Finance Hub)"(browser) {
        const all = [];
        for (const opts of [WIDE, PHONE]) {
            const { page, errors } = await open(browser, opts, { path: '/financehub.html' });
            all.push(...errors);
            for (const card of await page.locator('.ccGrid .ccCard').all()) {
                await card.scrollIntoViewIfNeeded();
                await card.hover();
                await settled(card); // its lift and the tooltip's move
                const bad = await card.evaluate((c) => {
                    const tip = c.querySelector('.card-tooltip'), r = tip.getBoundingClientRect();
                    const box = c.closest('.panel-body').getBoundingClientRect(), out = [];
                    if (r.top < Math.max(box.top, 0) - 0.5 || r.bottom > Math.min(box.bottom, innerHeight) + 0.5) out.push(`cut ${Math.round(r.top)}-${Math.round(r.bottom)} vs ${Math.round(box.top)}-${Math.round(box.bottom)}`);
                    if (r.left < box.left - 0.5 || r.right > box.right + 0.5) out.push(`cut at the side ${Math.round(r.left)}-${Math.round(r.right)} vs ${Math.round(box.left)}-${Math.round(box.right)}`);
                    tip.style.pointerEvents = 'auto'; // it ignores the pointer; ask what paints on top at its middle
                    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                    tip.style.removeProperty('pointer-events');
                    if (!tip.contains(top)) out.push(`under ${top?.className}`);
                    return out.join('; ');
                });
                assert.equal(bad, '', `${opts.viewport.width}px: ${await card.locator('.card-title').textContent()}'s tooltip: ${bad}`);
            }
            const [sw, cw] = await page.evaluate(() => { const b = document.querySelector('#cc-cards .panel-body'); return [b.scrollWidth, b.clientWidth]; });
            assert.ok(sw <= cw, `${opts.viewport.width}px: the card panel scrolls sideways (${sw} > ${cw})`);
            await page.context().close();
        }
        return all;
    },
    async 'at a narrower desktop window the default rows grow to their content'(browser) {
        const all = [];
        for (const [path, viewport] of [['/nexus.html', { width: 1100, height: 1000 }], ['/financehub.html', { width: 1280, height: 720 }]]) {
            const { page, errors } = await open(browser, { viewport }, { path });
            all.push(...errors);
            const short = await page.evaluate(() => [...document.querySelectorAll('.board > .panel:not(.panel-media):not(.is-collapsed):not([hidden])')].flatMap((p) => {
                const b = p.querySelector('.panel-body'), row = parseFloat(getComputedStyle(p.parentElement).gridAutoRows);
                const capped = +p.style.getPropertyValue('--h') >= Math.floor(innerHeight / row);
                return b.scrollHeight - b.clientHeight > 1 && !capped ? [`${p.id} ${b.scrollHeight - b.clientHeight}px`] : [];
            }));
            assert.deepEqual(short, [], `${path} at ${viewport.width}px: panels scrolling inside`);
            await page.context().close();
        }
        return all;
    },
    async 'Finance Hub: the slider follows a slide that shrinks, even while panels glide'(browser) {
        const init = () => localStorage.setItem('financeSlidePosition', '4');
        const { page, errors } = await open(browser, WIDE, { init, motion: 'no-preference', path: '/financehub.html' });
        await page.click('#nw-budget .panel-collapse');
        await sleep(1600); // past the glide
        const [view, slide] = await page.evaluate(() => [document.querySelector('.sliderView').getBoundingClientRect().height, document.querySelector('.slide.active-slide').offsetHeight]);
        assert.ok(Math.abs(view - slide) < 2, `the window is ${Math.round(view)}px on a ${slide}px slide`);
        return errors;
    },
    async "Finance Hub: the last panel is clear of the footer and Zephyy's orb at the end of the page"(browser) {
        const all = [];
        for (const opts of [WIDE, PHONE]) {
            const { page, errors } = await open(browser, opts, { path: '/financehub.html' });
            all.push(...errors);
            await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
            await sleep(400);
            const hit = await page.evaluate(() => {
                const b = document.querySelector('#cc-banks .panel-collapse').getBoundingClientRect();
                return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('.panel-collapse') ? 'ok' : 'covered';
            });
            assert.equal(hit, 'ok', `${opts.viewport.width}px: Bank Accounts' ▾ is covered`);
            await page.context().close();
        }
        return all;
    },
    async 'a first-row card or link button lifting on hover keeps its whole border in view'(browser) {
        const all = [];
        for (const [path, sel] of [['/financehub.html', '#cc-cards .ccCard'], ['/financehub.html', '#cc-tools .qlBtn'], ['/nexus.html', '#rig .qlBtn']]) {
            const { page, errors } = await open(browser, { viewport: { width: 696, height: 824 } }, { path });
            all.push(...errors);
            const first = page.locator(sel).first();
            await first.scrollIntoViewIfNeeded();
            await first.hover();
            await settled(first);
            const cut = await first.evaluate((n) => n.getBoundingClientRect().top - n.closest('.panel-body').getBoundingClientRect().top);
            assert.ok(cut >= 0, `${path} ${sel}: its top edge is ${-cut.toFixed(1)}px past the panel body's`);
            await page.context().close();
        }
        return all;
    },
    async "Finance Hub: a card's tooltip stays on top while it slides away"(browser) {
        const { page, errors } = await open(browser, { viewport: { width: 696, height: 824 } }, { path: '/financehub.html', motion: 'no-preference' });
        const card = page.locator('#cc-cards .ccCard').first();
        await card.scrollIntoViewIfNeeded();
        await card.hover();
        await settled(card);
        const b = await card.boundingBox();
        await page.mouse.move(b.x + b.width / 2, b.y + b.height + 12); // into the gap above the next row
        await sleep(60);
        const r = await card.evaluate((c) => {
            const tip = c.querySelector('.card-tooltip'), t = tip.getBoundingClientRect();
            if (getComputedStyle(tip).visibility !== 'visible') return 'gone already';
            tip.style.pointerEvents = 'auto';
            const top = document.elementFromPoint(t.left + t.width / 2, t.bottom - 6);
            tip.style.removeProperty('pointer-events');
            return tip.contains(top) ? 'on top' : `under ${top?.closest('.ccCard')?.textContent.trim().split('\n')[0] ?? top?.className}`;
        });
        assert.equal(r, 'on top');
        // Back up to a card the pointer left behind: the card now hovered is on top, not the one just left
        const below = await page.evaluate(() => { const cs = [...document.querySelectorAll('#cc-cards .ccCard')], a = cs[0].getBoundingClientRect();
            return cs.findIndex((c) => { const r = c.getBoundingClientRect(); return Math.abs(r.left - a.left) < 2 && r.top > a.bottom; }); });
        const lower = page.locator('#cc-cards .ccCard').nth(below);
        await lower.hover();
        await settled(lower);
        await card.hover();
        await sleep(60);
        const mine = await card.evaluate((c) => {
            const tip = c.querySelector('.card-tooltip'), t = tip.getBoundingClientRect();
            tip.style.pointerEvents = 'auto';
            const top = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2);
            tip.style.removeProperty('pointer-events');
            return tip.contains(top) ? 'on top' : `under ${top?.closest('.ccCard')?.querySelector('.card-title')?.textContent ?? top?.className}`;
        });
        assert.equal(mine, 'on top', 'the card just hovered');
        return errors;
    },
    async 'Finance Hub: the slide nav sticks while the slides scroll under it, and a new slide starts at its top'(browser) {
        const { page, errors } = await open(browser, WIDE, { path: '/financehub.html' });
        await center(page, 'cc-tools');
        const top = await page.evaluate(() => document.querySelector('.slideNav').getBoundingClientRect().top);
        assert.ok(top >= 0 && top < 40, `the nav sits at ${Math.round(top)}px`);
        // The stuck wrap's empty sides beside the nav pass the pointer through to the slide below
        const side = await page.evaluate(() => { const w = document.querySelector('.sliderWrap').getBoundingClientRect(), n = document.querySelector('.slideNav').getBoundingClientRect();
            return document.elementFromPoint(w.left + (n.left - w.left) / 2, n.top + n.height / 2)?.closest('.sliderWrap') ? 'swallowed' : 'through'; });
        assert.equal(side, 'through');
        // A card's tooltip flips under the card rather than going under the nav
        const card = page.locator('#cc-cards .ccCard').nth(8);
        await card.evaluate((c) => { document.documentElement.style.scrollBehavior = 'auto'; scrollBy(0, c.getBoundingClientRect().top - 160); });
        await card.hover();
        await settled(card);
        const [tipTop, navBottom] = await card.evaluate((c) => [c.querySelector('.card-tooltip').getBoundingClientRect().top, document.querySelector('.slideNav').getBoundingClientRect().bottom]);
        assert.ok(tipTop >= navBottom - 0.5, `the tooltip starts ${Math.round(navBottom - tipTop)}px under the nav`);
        await page.click('.nav-dot[data-slide="4"]');
        await sleep(300);
        const [nav, view] = await page.evaluate(() => [document.querySelector('.slideNav').getBoundingClientRect().bottom, document.querySelector('.sliderView').getBoundingClientRect().top]);
        assert.ok(Math.abs(nav - view) < 2, `the new slide starts ${Math.round(view - nav)}px from the nav`);
        return errors;
    },
    async "Finance Hub: the CTA lands the nav where it sticks; a last-row card's tooltip doesn't flip into no room"(browser) {
        const { page, errors } = await open(browser, WIDE, { path: '/financehub.html' });
        await page.click('.hero .cta-button');
        await sleep(300);
        const at = await page.evaluate(() => document.querySelector('.slideNav').getBoundingClientRect().top);
        assert.ok(Math.abs(at - 32) < 3, `the CTA lands the nav at ${Math.round(at)}px`);
        // Tabbing on into the nav (it sits in the room the page keeps for it) scrolls nothing
        const y = await page.evaluate(() => scrollY);
        for (let i = 0; i < 6 && !(await page.evaluate(() => !!document.activeElement?.closest('.slideNav'))); i++) await page.keyboard.press('Tab');
        assert.ok(await page.evaluate(() => !!document.activeElement?.closest('.slideNav')), 'Tab never reached the nav');
        await sleep(300);
        assert.equal(await page.evaluate(() => scrollY), y, 'focusing the nav scrolled the page');
        const card = page.locator('#cc-cards .ccCard').last();
        // 20px under the stuck nav (it sticks 2rem from the top)
        await card.evaluate((c) => { document.documentElement.style.scrollBehavior = 'auto';
            scrollTo(0, c.getBoundingClientRect().top + scrollY - (32 + document.querySelector('.slideNav').offsetHeight + 20)); });
        await frames(page);
        const b = await card.boundingBox();
        assert.ok(Math.abs(b.y - (await page.evaluate(() => document.querySelector('.slideNav').getBoundingClientRect().bottom)) - 20) < 3, 'the card is not where the case needs it');
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); // a hover() would scroll it into view first
        await settled(card);
        assert.equal(await card.evaluate((c) => c.classList.contains('tip-below')), false, 'flipped under the last row');
        await page.mouse.move(5, 500);
        await settled(card);
        const over = await page.evaluate(() => { const b = document.querySelector('#cc-cards .panel-body'); return b.scrollHeight - b.clientHeight; });
        assert.ok(over <= 0, `the card panel scrolls ${over}px after the tooltip went`);
        // A tooltip that flipped under its card goes back above once it has slid away
        const first = page.locator('#cc-cards .ccCard').first();
        await first.hover();
        await settled(first);
        assert.equal(await first.evaluate((c) => c.classList.contains('tip-below')), true, "the first row's tooltip didn't flip, so this part tests nothing");
        await page.mouse.move(5, 500);
        await settled(first);
        await frames(page); // the transitionend that moves it back comes with the animation's end
        assert.equal(await first.evaluate((c) => c.classList.contains('tip-below')), false, 'still flipped after it went');
        return errors;
    },
    async "Finance Hub: a flipped tooltip hops back above only once hidden; in a squeezed panel it shows on the roomier side"(browser) {
        const { page, errors } = await open(browser, WIDE, { path: '/financehub.html', motion: 'no-preference' });
        await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; document.getElementById('cc-cards').scrollIntoView({ block: 'center' }); }); // no glide to race
        await sleep(150);
        const first = page.locator('#cc-cards .ccCard').first();
        // A short hover, left mid-slide: its move ends before its fade, and it must not hop above the card while it still shows
        let hops = 0;
        for (const ms of [240, 270, 300, 330]) {
            await first.hover();
            await sleep(ms);
            assert.equal(await first.evaluate((c) => c.classList.contains('tip-below')), true, "the first row's tooltip didn't flip, so this tests nothing");
            await page.mouse.move(5, 500);
            hops += await first.evaluate((c) => new Promise((done) => {
                const tip = c.querySelector('.card-tooltip'), t0 = performance.now(); let n = 0;
                const look = () => { if (getComputedStyle(tip).visibility === 'visible' && !c.classList.contains('tip-below')) n++; if (performance.now() - t0 < 500) requestAnimationFrame(look); else done(n); };
                requestAnimationFrame(look);
            }));
        }
        assert.equal(hops, 0, 'frames with the tooltip above the card while it still showed');
        await page.focus('#cc-cards .panel-edge[data-dir="se"]');
        while (await page.evaluate(() => +document.getElementById('cc-cards').style.getPropertyValue('--h')) > 9) await page.keyboard.press('ArrowUp');
        await sleep(800);
        await first.hover();
        await settled(first);
        const shown = await first.evaluate((c) => { const t = c.querySelector('.card-tooltip').getBoundingClientRect(), b = c.closest('.panel-body').getBoundingClientRect();
            return Math.max(0, Math.min(t.bottom, b.bottom) - Math.max(t.top, b.top)); });
        assert.ok(shown > 20, `only ${Math.round(shown)}px of the tooltip shows`);
        return errors;
    },
    async 'Finance Hub: a phone on its side keeps the nav in the page, and nothing makes room for it'(browser) {
        const { page, errors } = await open(browser, { viewport: { width: 667, height: 375 }, isMobile: true, hasTouch: true }, { path: '/financehub.html' });
        assert.deepEqual(await page.evaluate(() => { const w = getComputedStyle(document.querySelector('.sliderWrap')); return [w.position, w.top, getComputedStyle(document.documentElement).scrollPaddingTop]; }), ['relative', '0px', '0px']);
        await page.evaluate(() => document.querySelector('.hero .cta-button').click());
        await sleep(300);
        const at = await page.evaluate(() => document.querySelector('.slideNav').getBoundingClientRect().top);
        assert.ok(Math.abs(at) < 3, `the CTA lands the nav at ${Math.round(at)}px`);
        return errors;
    },
    async 'Finance Hub: a drag scrolls the page up from just under the stuck nav, even with a nav dot keyboard-focused'(browser) {
        const { page, errors } = await open(browser, WIDE, { path: '/financehub.html' });
        await center(page, 'cc-tools'); // the nav stuck on screen
        const dot = await page.locator('.nav-dot.active').boundingBox();
        await page.mouse.click(dot.x + dot.width / 2, dot.y + dot.height / 2); // a mouse click leaves the dot focused
        await page.keyboard.press('ArrowRight'); // and a key there makes that focus visible (over and back, to the same slide)
        await page.keyboard.press('ArrowLeft');
        assert.ok(await page.evaluate(() => !!document.querySelector('.slideNav :focus-visible')), 'no visible focus on the nav, so that part tests nothing');
        await center(page, 'cc-tools');
        const h = await page.locator('#cc-tools .panel-head').boundingBox();
        const nav = await page.evaluate(() => document.querySelector('.slideNav').getBoundingClientRect().bottom);
        const y0 = await page.evaluate(() => scrollY);
        await page.mouse.move(h.x + 100, h.y + 20);
        await page.mouse.down();
        await page.mouse.move(h.x + 110, h.y + 30, { steps: 3 });
        await page.mouse.move(h.x + 110, nav + 20, { steps: 8 }); // under the nav, below the bare 64px edge
        await sleep(500);
        const y1 = await page.evaluate(() => scrollY);
        await page.keyboard.press('Escape');
        await page.mouse.up();
        assert.ok(y1 < y0 - 20, `the page didn't scroll (${y0} → ${y1})`);
        return errors;
    },
    async "Finance Hub: the hero holds the showing slide's board bar, and only that one"(browser) {
        const { page, errors } = await open(browser, WIDE, { path: '/financehub.html' });
        const shown = () => page.evaluate(() => [...document.querySelectorAll('.board-bar')].filter((b) => b.checkVisibility()).map((b) => `${b.parentElement.className}:${b.dataset.boardBar}`));
        assert.deepEqual(await shown(), ['hero:finance-credit']);
        await page.click('.nav-dot[data-slide="3"]');
        assert.deepEqual(await shown(), ['hero:finance-taxes']);
        // A slide's Add widget menu closes with its bar
        await page.click('#tax-filing .panel-close');
        await page.click('[data-board-bar="finance-taxes"] button[popovertarget]');
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.evaluate(() => !!document.querySelector('.board-menu:popover-open')), false, 'the menu stayed open');
        return errors;
    },
    async 'Finance Hub: no bar shows in the hero before the slider picks its slide'(browser) {
        const ctx = await browser.newContext({ ...WIDE, reducedMotion: 'reduce' });
        await ctx.route((url) => !url.href.startsWith(base), (r) => r.abort());
        await ctx.route('**/js/finance.js', async (r) => { await sleep(900); r.continue(); }); // a slow second script
        const page = await ctx.newPage();
        page.goto(base + '/financehub.html').catch(() => {});
        await page.waitForSelector('.board-bar', { state: 'attached' });
        await sleep(300);
        assert.equal(await page.evaluate(() => [...document.querySelectorAll('.board-bar')].filter((b) => b.checkVisibility()).length), 0);
        await page.waitForLoadState('load');
        await sleep(300);
        assert.equal(await page.evaluate(() => [...document.querySelectorAll('.board-bar')].filter((b) => b.checkVisibility()).length), 1);
        return [];
    },
    async 'Finance Hub: no link button cuts its label at the edge'(browser) {
        const all = [];
        for (const width of [390, 520, 901, 1100, 1440]) {
            const { page, errors } = await open(browser, { viewport: { width, height: 900 } }, { path: '/financehub.html' });
            all.push(...errors);
            const cut = await page.evaluate(() => [...document.querySelectorAll('.slide .qlBtn')].filter((a) => a.scrollWidth > a.clientWidth + 1).map((a) => a.textContent.trim()));
            assert.deepEqual(cut, [], `${width}px`);
            await page.context().close();
        }
        return all;
    },
    async "at a roomy window the wide default is exactly the markup's cells"(browser) {
        const all = [];
        for (const path of ['/nexus.html', '/financehub.html', '/thelounge.html', '/']) {
            const { page, errors } = await open(browser, { viewport: { width: 1920, height: 2600 } }, { path });
            all.push(...errors);
            const moved = await page.evaluate(() => [...document.querySelectorAll('.board > .panel')].flatMap((p) => {
                const keys = 'collapsed' in p.dataset ? ['x', 'y', 'w'] : ['x', 'y', 'w', 'h']; // a collapsed bar's height is measured
                const got = keys.map((k) => p.style.getPropertyValue('--' + k)).join(), want = keys.map((k) => p.dataset[k]).join();
                return got === want ? [] : [`${p.id} ${want} → ${got}`];
            }));
            assert.deepEqual(moved, [], path);
            await page.context().close();
        }
        return all;
    },
    async 'default heights are measured again as pictures arrive'(browser) {
        const all = [];
        for (const opts of [{ viewport: { width: 1200, height: 900 } }, { ...PHONE, viewport: { width: 390, height: 2400 } }]) { // tall: the cards fit under the cap
            const ctx = await browser.newContext({ ...opts, reducedMotion: 'reduce' });
            await ctx.route((url) => !url.href.startsWith(base), (r) => r.abort());
            await ctx.route('**/assets/images/**', async (r) => { await sleep(1500); r.continue(); }); // a slow connection
            const page = await ctx.newPage();
            const errors = [];
            page.on('pageerror', (e) => errors.push(e.message));
            await page.goto(base + '/financehub.html', { waitUntil: 'load' });
            await sleep(500);
            const short = await page.evaluate(() => {
                const p = document.getElementById('cc-cards'), b = p.querySelector('.panel-body');
                const capped = +p.style.getPropertyValue('--h') >= Math.floor(innerHeight / parseFloat(getComputedStyle(p.parentElement).gridAutoRows));
                return capped ? 0 : b.scrollHeight - b.clientHeight;
            });
            assert.ok(short <= 1, `${opts.viewport.width}px: the card panel is ${short}px short of its pictures`);
            all.push(...errors);
            await ctx.close();
        }
        return all;
    },
    async 'a re-measure skipped while the layout was arranged runs once it is back at its default'(browser) {
        const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' });
        await ctx.route((url) => !url.href.startsWith(base), (r) => r.abort());
        await ctx.route('**/assets/images/**', async (r) => { await sleep(1500); r.continue(); });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(base + '/financehub.html', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#cc-myths .panel-close');
        await page.evaluate(() => document.querySelector('#cc-myths .panel-close').click()); // arranged while the pictures load
        await page.waitForLoadState('load');
        await sleep(400);
        await page.evaluate(() => { const bar = document.querySelector('[data-board-bar="finance-credit"]'); bar.querySelector('.board-menu').showPopover(); bar.querySelector('.board-menu button').click(); });
        await sleep(400);
        const short = await page.evaluate(() => { const b = document.querySelector('#cc-cards .panel-body'); return b.scrollHeight - b.clientHeight; });
        assert.ok(short <= 0, `the card panel is ${short}px short of its pictures`);
        return errors;
    },
    async "Reset lands on today's default, even after a measure skipped while arranged"(browser) {
        const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' });
        await ctx.route((url) => !url.href.startsWith(base), (r) => r.abort());
        await ctx.route('**/assets/images/**', async (r) => { await sleep(1500); r.continue(); });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(base + '/financehub.html', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#cc-tools .panel-grip');
        await page.focus('#cc-tools .panel-grip');
        await page.keyboard.press('ArrowDown'); // arranged (and saved) while the pictures load
        assert.ok(await page.evaluate(() => !!localStorage.getItem('board:finance-credit')), 'the move saved nothing, so this case tests nothing');
        await page.waitForLoadState('load');
        await sleep(400);
        await page.evaluate(() => [...document.querySelectorAll('[data-board-bar="finance-credit"] button')].find((b) => b.textContent === 'Reset layout').click());
        await sleep(400);
        const over = await page.evaluate(() => { const b = document.querySelector('#cc-cards .panel-body'); return b.scrollHeight - b.clientHeight; });
        assert.ok(over <= 0, `after Reset the card panel is ${over}px short of its pictures`);
        return errors;
    },
    async 'pictures arriving right after a Reset are measured, and Undo stays on offer'(browser) {
        const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' });
        await ctx.route((url) => !url.href.startsWith(base), (r) => r.abort());
        await ctx.route('**/assets/images/**', async (r) => { await sleep(1500); r.continue(); });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(base + '/financehub.html', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#cc-tools .panel-grip');
        await page.focus('#cc-tools .panel-grip');
        await page.keyboard.press('ArrowDown');
        await page.evaluate(() => [...document.querySelectorAll('[data-board-bar="finance-credit"] button')].find((b) => b.textContent === 'Reset layout').click());
        await page.waitForLoadState('load');
        await sleep(400);
        const [over, offer] = await page.evaluate(() => { const b = document.querySelector('#cc-cards .panel-body'), r = [...document.querySelectorAll('[data-board-bar="finance-credit"] button')].find((x) => /Undo/.test(x.textContent));
            return [b.scrollHeight - b.clientHeight, !!r && !r.hidden]; });
        assert.ok(over <= 0, `the card panel is ${over}px short of its pictures`);
        assert.equal(offer, true, 'Undo reset went away');
        return errors;
    },
    async 'Finance Hub: pictures arriving mid-drag are measured on every board once the drag ends'(browser) {
        const init = () => { window.__reads = {}; const get = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { window.__reads[k] = (window.__reads[k] ?? 0) + 1; return get.call(this, k); }; };
        const { page, errors } = await open(browser, WIDE, { path: '/financehub.html', init });
        const reads = () => page.evaluate(() => Object.fromEntries(Object.entries(window.__reads).filter(([k]) => k.startsWith('board:'))));
        await center(page, 'cc-tools');
        const h = await page.locator('#cc-tools .panel-head').boundingBox();
        await page.mouse.move(h.x + 100, h.y + 20);
        await page.mouse.down();
        await page.mouse.move(h.x + 140, h.y + 60, { steps: 4 });
        assert.ok(await page.evaluate(() => !!document.querySelector('.board.is-arranging')), 'no drag began, so this tests nothing');
        const before = await reads();
        await page.evaluate(() => document.querySelectorAll('.board').forEach((b) => b.dispatchEvent(new Event('load')))); // pictures on every slide
        await sleep(400); // the drag goes on
        assert.deepEqual(await reads(), before, 'a board measured again mid-drag');
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await sleep(400);
        const after = await reads();
        const missed = Object.keys(before).filter((k) => !(after[k] > before[k]));
        assert.deepEqual(missed, [], 'boards never measured again');
        return errors;
    },
    async 'a re-measure right after Reset keeps Undo on offer and keyboard focus on it'(browser) {
        const { page, errors } = await open(browser);
        await page.focus('#stack .panel-grip');
        await page.keyboard.press('ArrowRight');
        await page.focus('.board-bar button:not([popovertarget])');
        await page.keyboard.press('Enter');
        const undo = () => page.evaluate(() => { const b = document.activeElement; return `${b.tagName}:${b.textContent}:${b.hidden}`; });
        assert.equal(await undo(), 'BUTTON:Undo reset:false');
        await page.evaluate(() => document.querySelector('.board').dispatchEvent(new Event('load'))); // a picture arriving
        await sleep(400);
        assert.equal(await undo(), 'BUTTON:Undo reset:false');
        return errors;
    },
    async "a finger resting on a panel (it swells) doesn't measure it bigger"(browser) {
        const { ctx, page, errors } = await open(browser, PHONE);
        const all = () => page.evaluate(() => [...document.querySelectorAll('.board > .panel')].map((p) => `${p.id} ${p.style.getPropertyValue('--h')}`));
        await steady(page); // what the page settles to on its own first (a loaded machine is still measuring after open)
        const before = await all();
        await center(page, 'signals');
        const h = await page.locator('#signals .panel-head').boundingBox();
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: h.x + 60, y: h.y + 20 }] });
        await sleep(100);
        assert.ok(await page.evaluate(() => !!document.querySelector('.is-holding')), 'the press never started a hold');
        await page.evaluate(() => document.querySelector('.board').dispatchEvent(new Event('load'))); // a picture arriving mid-hold
        await sleep(250);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); // let go before it lifts
        await steady(page);
        assert.deepEqual(await all(), before);
        return errors;
    },
    async 'with scrollbars that take room (Windows), Fit gives a squeezed panel its content, no more and no less'(browser) {
        const classic = await chromium.launch({ ...LAUNCH, ignoreDefaultArgs: ['--hide-scrollbars'] });
        try {
            const { page, errors } = await open(classic, WIDE, { path: '/financehub.html' });
            const bad = [];
            for (const id of ['cc-myths', 'cc-freeze', 'cc-building', 'cc-rewards', 'cc-tools']) {
                await center(page, id);
                await page.focus(`#${id} > .panel-edge[data-dir="se"]`);
                for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowUp'); // squeezed: its body scrolls, with a scrollbar
                const bar = await page.evaluate((id) => { const b = document.querySelector(`#${id} > .panel-body`); return b.offsetWidth > b.clientWidth; }, id);
                if (!bar) { bad.push(`${id}: no scrollbar taking room, so it tests nothing`); continue; }
                await page.keyboard.press('Enter');
                await sleep(300);
                bad.push(...await page.evaluate((id) => {
                    const p = document.getElementById(id), b = p.querySelector('.panel-body'), row = parseFloat(getComputedStyle(p.parentElement).gridAutoRows);
                    const capped = +p.style.getPropertyValue('--h') >= Math.floor(innerHeight / row);
                    const kids = [...b.children].filter((n) => getComputedStyle(n).display !== 'none' && !/absolute|fixed/.test(getComputedStyle(n).position));
                    const css = getComputedStyle(b), [a, z] = [kids[0], kids.at(-1)];
                    const content = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom) + z.getBoundingClientRect().bottom + parseFloat(getComputedStyle(z).marginBottom) - a.getBoundingClientRect().top + parseFloat(getComputedStyle(a).marginTop);
                    if (b.offsetWidth > b.clientWidth) return [`${id}: a scrollbar stayed`];
                    if (!capped && b.scrollHeight > b.clientHeight) return [`${id}: ${b.scrollHeight - b.clientHeight}px short`];
                    if (b.clientHeight - content >= row) return [`${id}: ${Math.floor((b.clientHeight - content) / row)} spare row(s)`];
                    return [];
                }, id));
            }
            assert.deepEqual(bad, []);
            return errors;
        } finally { await classic.close(); }
    },
    async 'measuring again leaves a panel scrolled inside where it was'(browser) {
        // A short window caps The Stack at a screen by default, so it scrolls inside (the default
        // layout re-measures; one a visitor arranged this visit doesn't)
        const { page, errors } = await open(browser, { viewport: { width: 1440, height: 500 } });
        const top = await page.evaluate(() => { const b = document.querySelector('#stack .panel-body'); b.scrollTop = Math.floor((b.scrollHeight - b.clientHeight) / 2); return b.scrollTop; });
        assert.ok(top > 20, `The Stack barely scrolls (${top}px), so this case tests nothing`);
        await page.evaluate(() => document.querySelector('.board').dispatchEvent(new Event('load'))); // as a picture arriving
        await sleep(400); // past the re-measure
        assert.equal(await page.evaluate(() => document.querySelector('#stack .panel-body').scrollTop), top);
        return errors;
    },
    async "a re-measure leaves Add widget's menu open where it was, focus and all"(browser) {
        const { page, errors } = await open(browser);
        await page.evaluate(() => document.querySelector('#privacy .panel-close').click());
        await page.reload({ waitUntil: 'load' }); // a returning visitor: the save is fitted again as content lands
        await sleep(600);
        await page.locator('.board-bar button', { hasText: 'Add widget' }).click();
        await page.focus('.board-menu button');
        await page.evaluate(() => document.querySelector('.board').dispatchEvent(new Event('load'))); // as a picture arriving
        await sleep(400);
        assert.equal(await page.evaluate(() => document.activeElement.closest('.board-menu') ? document.activeElement.textContent : document.activeElement.tagName), '＋ Privacy & OpSec', 'focus after the re-measure');
        await page.keyboard.press('Enter');
        await sleep(300);
        assert.equal(await page.evaluate(() => document.getElementById('privacy').hidden), false, 'Enter on it brought nothing back');
        return errors;
    },
    async "a move into the board's edge arranges nothing, so a saved layout is still fitted again once the fonts are in"(browser) {
        const { ctx, page, errors } = await open(browser, { viewport: { width: 1440, height: 900 } });
        const devcore = () => page.evaluate(() => { const p = document.getElementById('dev-core'), b = p.querySelector('.panel-body'); return [+p.style.getPropertyValue('--h'), b.scrollHeight - b.clientHeight <= 1]; });
        const whole = await devcore();
        await page.focus('#stack .panel-grip');
        await page.keyboard.press('ArrowRight'); // saved: the layout is the visitor's
        let release;
        const held = new Promise((r) => { release = r; });
        await ctx.route('**/*.woff2', async (r) => { await held; r.continue(); }); // the fonts land only after the key press
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.focus('#dev-core .panel-grip');
        assert.equal(await page.evaluate(() => document.fonts.status), 'loading', 'the fonts landed before the move, so this case tests nothing');
        await page.keyboard.press('ArrowLeft'); // Dev Core is at the left edge already: nothing moves, and nothing is saved over
        release();
        await page.evaluate(() => document.fonts.ready);
        await sleep(600);
        assert.deepEqual(await devcore(), whole, 'Dev Core after a reload and a move into the edge: [rows, shows all it holds]');
        return errors;
    },
    async 'with no storage (private mode), an arrangement made this visit holds through a re-measure'(browser) {
        const { page, errors } = await open(browser, WIDE, { init: () => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; } });
        await page.focus('#stack .panel-grip');
        await page.keyboard.press('ArrowRight');
        const moved = await cells(page, 'stack');
        await page.evaluate(() => document.querySelector('.board').dispatchEvent(new Event('load'))); // as a picture arriving
        await sleep(400);
        assert.deepEqual(await cells(page, 'stack'), moved, 'the move was undone');
        return errors;
    },
    async 'a layout saved on an earlier visit is fitted again once the fonts are in, so a tall panel holds all it did'(browser) {
        const { ctx, page, errors } = await open(browser, { viewport: { width: 1440, height: 900 } });
        const devcore = () => page.evaluate(() => { const p = document.getElementById('dev-core'), b = p.querySelector('.panel-body'); return [+p.style.getPropertyValue('--h'), b.scrollHeight - b.clientHeight <= 1]; });
        const whole = await devcore();
        assert.deepEqual(whole.slice(1), [true], 'Dev Core scrolls inside at its default');
        await page.focus('#stack .panel-grip');
        await page.keyboard.press('ArrowRight'); // the layout becomes the visitor's, and is saved
        assert.ok(await saved(page));
        // The next visit: its fonts land after the board's first fit, which measured with the fallbacks
        await ctx.route('**/*.woff2', async (r) => { await sleep(500); r.continue(); });
        await page.reload({ waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        await sleep(600);
        assert.deepEqual(await devcore(), whole, 'Dev Core after a reload: [rows, shows all it holds]');
        return errors;
    },
    async 'no default panel body overflows by a pixel, at any width (a scrollbar on Windows)'(browser) {
        const all = [];
        for (const path of ['/nexus.html', '/financehub.html', '/thelounge.html', '/']) {
            const { page, errors } = await open(browser, { viewport: { width: 1920, height: 1000 } }, { path });
            all.push(...errors);
            const over = [];
            for (let width = 1920; width >= 320; width -= 40) {
                await page.setViewportSize({ width, height: 1000 });
                await sleep(350); // past the re-measure's debounce
                over.push(...await page.evaluate((width) => [...document.querySelectorAll('.board > .panel:not(.panel-media):not([data-scroll]):not(.is-collapsed):not([hidden])')].flatMap((p) => {
                    const b = p.querySelector('.panel-body'), row = parseFloat(getComputedStyle(p.parentElement).gridAutoRows);
                    const capped = +p.style.getPropertyValue('--h') >= Math.floor(innerHeight / row);
                    return b && !capped && b.scrollHeight > b.clientHeight ? [`${width}px ${p.id} +${b.scrollHeight - b.clientHeight}`] : [];
                }), width));
            }
            assert.deepEqual(over, [], path);
            await page.context().close();
        }
        return all;
    },
    async "the wide default follows the window's width within the tier"(browser) {
        const { page, errors } = await open(browser, { viewport: { width: 1200, height: 900 } });
        await page.setViewportSize({ width: 1440, height: 900 });
        await sleep(500);
        const all = (p) => p.evaluate(() => [...document.querySelectorAll('.board > .panel')].map((p) => `${p.id} ${['x', 'y', 'w', 'h'].map((k) => p.style.getPropertyValue('--' + k))}`));
        const resized = await all(page);
        const fresh = await open(browser, WIDE);
        assert.deepEqual(resized, await all(fresh.page));
        assert.equal(await page.evaluate(() => [...document.querySelectorAll('.board-bar button')].some((b) => /Reset|Undo/.test(b.textContent) && !b.hidden)), false, 'Reset shows');
        return [...errors, ...fresh.errors];
    },
    async 'a panel hidden in one tier is still in the others'(browser) {
        const { page, errors } = await open(browser, FOLD);
        await center(page, 'rig');
        await page.click('#rig .panel-close');
        await page.setViewportSize(WIDE.viewport);
        await sleep(400);
        assert.equal(await page.evaluate(() => document.getElementById('rig').hidden), false, 'hidden in the wide layout');
        await page.setViewportSize(FOLD.viewport);
        await sleep(400);
        assert.equal(await page.evaluate(() => document.getElementById('rig').hidden), true, "the mid layout forgot it's hidden");
        return errors;
    },
    async 'Finance Hub: arrow keys during a panel drag stay on the slide'(browser) {
        const { page, errors } = await open(browser, WIDE, { path: '/financehub.html' });
        await center(page, 'cc-tools');
        const h = await page.locator('#cc-tools .panel-head').boundingBox();
        await page.mouse.move(h.x + 100, h.y + 20);
        await page.mouse.down();
        await page.mouse.move(h.x + 160, h.y + 40, { steps: 4 });
        await page.keyboard.press('ArrowRight');
        await page.mouse.up();
        await sleep(200);
        assert.equal(await page.evaluate(() => document.querySelector('.slide.active-slide').id), 'slide-credit');
        return errors;
    },
    async 'a headless panel marked data-collapsed stays open and breaks nothing'(browser) {
        const init = () => new MutationObserver((_, mo) => { const p = document.getElementById('meme-1'); if (p) { p.dataset.collapsed = ''; mo.disconnect(); } })
            .observe(document, { childList: true, subtree: true });
        const { page, errors } = await open(browser, WIDE, { init });
        assert.equal(await page.evaluate(() => document.getElementById('meme-1').classList.contains('is-collapsed')), false);
        assert.ok(await page.evaluate(() => document.querySelectorAll('.panel-tools').length > 0), 'the board set up');
        return errors;
    },
    async 'collapse to the title bar and back'(browser) {
        const { page, errors } = await open(browser);
        const before = await cells(page, 'rig');
        await page.click('#rig .panel-collapse');
        await sleep(100);
        const shut = await page.evaluate(() => { const p = document.getElementById('rig'); return { cls: p.classList.contains('is-collapsed'), body: getComputedStyle(p.querySelector('.panel-body')).display, aria: p.querySelector('.panel-collapse').getAttribute('aria-expanded') }; });
        assert.deepEqual(shut, { cls: true, body: 'none', aria: 'false' });
        assert.ok((await cells(page, 'rig'))[3] <= 4, 'only the title bar is left');
        assert.ok(JSON.parse(await saved(page)).items.find((i) => i.id === 'rig').collapsed);
        await page.click('#rig .panel-collapse');
        await sleep(100);
        assert.deepEqual(await cells(page, 'rig'), before);
        assert.equal(await saved(page), null, 'back at the default, nothing is saved');
        return errors;
    },
    async 'every panel head, body and foot lays out after the DOM reorders (moveBefore and size containers)'(browser) {
        const { page, errors } = await open(browser);
        await page.evaluate(() => document.querySelector('#rig .panel-close').click());
        await page.evaluate(() => document.querySelector('.board-menu button').click());
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.panel > :is(.panel-head, .panel-body, .panel-foot)')]
            .filter((b) => getComputedStyle(b).height === 'auto').map((b) => `${b.closest('.panel').id} ${b.className}`)), []);
        return errors;
    },
    async 'the mid tier: 12 columns, two panels to a row, its own save'(browser) {
        const { page, errors } = await open(browser, FOLD);
        const layout = await page.evaluate(() => ({ cols: getComputedStyle(document.querySelector('.board')).getPropertyValue('--cols').trim(),
            cells: [...document.querySelectorAll('.panel')].map((p) => ['x', 'y', 'w', 'h'].map((k) => +p.style.getPropertyValue('--' + k))) }));
        assert.equal(layout.cols, '12');
        for (const [x, , w] of layout.cells) assert.ok((w === 6 && [1, 7].includes(x)) || (w === 12 && x === 1), `cells ${x},${w}: half the row or all of it`);
        assert.ok(layout.cells.some(([x]) => x === 7), 'two to a row');
        const overlap = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
        layout.cells.forEach((a, i) => layout.cells.slice(i + 1).forEach((b) => assert.ok(!overlap(a, b), `overlap ${a} / ${b}`)));
        await page.focus('#mobile .panel-grip');
        await page.keyboard.press('ArrowDown');
        assert.ok(await saved(page, 'mid'));
        assert.equal(await saved(page), null, 'the wide save is untouched');
        return errors;
    },
    async 'the phone tier: a full-width stack in reading order'(browser) {
        const { page, errors } = await open(browser, PHONE);
        const c = await page.evaluate(() => [...document.querySelectorAll('.panel')].map((p) => ['x', 'y', 'w', 'h'].map((k) => +p.style.getPropertyValue('--' + k))));
        c.forEach(([x, , w]) => assert.deepEqual([x, w], [1, 6]));
        c.slice(1).forEach(([, y], i) => assert.ok(y >= c[i][1] + c[i][3], 'stacked without overlap'));
        // Twice the air between stacked panels (32px), the panels as wide as before (24px in from the edge)
        const [gap, edge] = await page.evaluate(() => {
            const [a, b] = [...document.querySelectorAll('.panel')].map((p) => p.getBoundingClientRect());
            return [b.top - a.bottom, a.left];
        });
        assert.deepEqual([Math.round(gap), Math.round(edge)], [32, 24]);
        return errors;
    },
    async 'a phone layout saved on the old 4-column grid is set aside; a new save records its grid'(browser) {
        // Every panel saved full width on 4 columns, the first moved down a row
        const { page, errors } = await open(browser, PHONE, { init: () => {
            if (localStorage.getItem('seeded')) return;
            localStorage.setItem('seeded', '1');
            const ids = ['dev-core', 'rig', 'meme-1', 'mobile', 'meme-2', 'privacy', 'stack', 'signals', 'meme-3'];
            localStorage.setItem('board:nexus:phone', JSON.stringify({ v: 2, items: ids.map((id, i) => ({ id, x: 1, y: 3 + i * 20, w: 4, h: 20, hidden: false, collapsed: false })) }));
        } });
        const widths = await page.evaluate(() => [...document.querySelectorAll('.board > .panel')].map((p) => +p.style.getPropertyValue('--w')));
        assert.ok(widths.every((w) => w === 6), `the old save was applied: widths ${widths}`);
        await page.focus('#rig .panel-edge[data-dir="se"]');
        await page.keyboard.press('ArrowLeft');
        const save = JSON.parse(await saved(page, 'phone'));
        assert.equal(save.cols, 6, 'a save without its grid');
        return errors;
    },
    async 'a head keeps its title readable and clear of its tag and tools, at any width'(browser) {
        const all = [];
        for (const opts of [WIDE, FOLD, PHONE, SMALL]) {
            const { page, errors } = await open(browser, opts);
            all.push(...errors);
            const at = `${opts.viewport.width}px`;
            const heads = () => page.evaluate(() => [...document.querySelectorAll('.panel')].flatMap((p) => {
                const box = p.getBoundingClientRect(), tools = p.querySelector('.panel-tools').getBoundingClientRect(), out = [];
                if (tools.left < box.left || tools.right > box.right + 1) out.push(`${p.id}: tools outside`);
                const h2 = p.querySelector('.panel-head h2')?.getBoundingClientRect();
                if (!h2) return out;
                const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
                if (hit(h2, tools)) out.push(`${p.id}: title under the tools`);
                const tag = p.querySelector('.panel-tag')?.getBoundingClientRect();
                if (tag && hit(h2, tag)) out.push(`${p.id}: title under the tag`);
                if (h2.right > box.right || h2.width < 60) out.push(`${p.id}: title ${Math.round(h2.width)}px wide`);
                return out;
            }));
            assert.deepEqual(await heads(), [], at);
            // The narrowest a visitor can make one
            await page.focus('#signals .panel-edge[data-dir="se"]');
            for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft');
            await frames(page);
            assert.deepEqual(await heads(), [], `${at}, narrowest`);
            // The keyboard's move button shows without reflowing the head
            const size = () => page.evaluate(() => { const h = document.querySelector('#signals .panel-head'); return [h.offsetHeight, h.querySelector('h2').offsetWidth]; });
            const before = await size();
            await page.focus('#signals .panel-grip');
            await frames(page);
            assert.ok((await page.locator('#signals .panel-grip').boundingBox()).width > 20, 'the grip shows on keyboard focus');
            assert.deepEqual(await size(), before, `${at}: focusing the grip reflows the head`);
            await page.context().close();
        }
        return all;
    },
    async "a title starts at the head's edge, with no icon and at any window width"(browser) {
        const all = [];
        for (const opts of [WIDE, PHONE]) {
            const { page, errors } = await open(browser, opts);
            all.push(...errors);
            const indent = await page.evaluate(() => {
                const head = document.querySelector('#mobile .panel-head');
                head.querySelector('.panel-icon').remove();
                const text = document.createRange();
                text.selectNodeContents(head.querySelector('h2'));
                return text.getBoundingClientRect().left - head.getBoundingClientRect().left - parseFloat(getComputedStyle(head).paddingLeft);
            });
            assert.ok(Math.abs(indent) < 1, `${opts.viewport.width}px: title starts ${indent}px in`);
            await page.context().close();
        }
        return all;
    },
    async "a media panel's tools stay clear of its video buttons"(browser) {
        const all = [];
        for (const opts of [WIDE, PHONE]) {
            const { page, errors } = await open(browser, opts);
            all.push(...errors);
            for (const id of await page.evaluate(() => [...document.querySelectorAll('.panel-media')].map((p) => p.id))) {
                await center(page, id);
                const covered = await page.evaluate((id) => {
                    // The buttons main.js gives a video meme, shown as a hover shows them
                    const bar = Object.assign(document.createElement('div'), { className: 'meme-video-controls' });
                    bar.style.cssText = 'opacity: 1; pointer-events: auto; transform: none';
                    bar.append(...['Play', 'Unmute'].map((t) => Object.assign(document.createElement('button'), { className: 'meme-video-control', textContent: t })));
                    document.querySelector(`#${id} .random-meme-fixed`).append(bar);
                    return [...bar.children].filter((b) => { const r = b.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) !== b; }).map((b) => b.textContent);
                }, id);
                assert.deepEqual(covered, [], `${opts.viewport.width}px ${id}: something covers its video buttons`);
            }
            await page.context().close();
        }
        return all;
    },
    async 'a saved layout comes back on reload, collapsed panels and each tier included'(browser) {
        const { page, errors } = await open(browser);
        const rig = await cells(page, 'rig');
        await page.click('#rig .panel-collapse');
        await sleep(100);
        const shut = await cells(page, 'rig');
        await page.focus('#mobile .panel-grip');
        await page.keyboard.press('ArrowRight');
        const mobile = await cells(page, 'mobile');
        await page.reload({ waitUntil: 'load' });
        await sleep(600);
        assert.equal(await page.evaluate(() => document.getElementById('rig').classList.contains('is-collapsed')), true);
        assert.deepEqual(await cells(page, 'rig'), shut, 'still its title bar');
        assert.deepEqual(await cells(page, 'mobile'), mobile);
        await page.click('#rig .panel-collapse');
        await sleep(100);
        assert.deepEqual(await cells(page, 'rig'), rig, 'opens to the height it had');
        await page.setViewportSize(FOLD.viewport);
        await sleep(300);
        await page.focus('#mobile .panel-grip');
        await page.keyboard.press('ArrowDown');
        const mid = await cells(page, 'mobile');
        await page.reload({ waitUntil: 'load' });
        await sleep(600);
        assert.deepEqual(await cells(page, 'mobile'), mid, 'the mid layout comes back');
        return errors;
    },
    async 'collapsing mid-glide carries on from where the panel is'(browser) {
        const { page, errors } = await open(browser, WIDE, { motion: 'no-preference' });
        await page.focus('#mobile .panel-grip');
        for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
        await sleep(250);
        const jump = await page.evaluate(() => {
            const p = document.getElementById('mobile'), before = p.getBoundingClientRect().left;
            p.querySelector('.panel-collapse').click();
            return p.getBoundingClientRect().left - before;
        });
        assert.ok(Math.abs(jump) < 2, `jumped ${jump}px`);
        return errors;
    },
    async 'a collapsed bar is exactly its title bar, and measured again on load'(browser) {
        const { page, errors } = await open(browser, { viewport: { width: 1100, height: 900 } });
        // How far the bar's rows overshoot its head, in rows: [0, 1) is a tight fit
        const slack = () => page.evaluate(() => {
            const p = document.getElementById('rig'), row = parseFloat(getComputedStyle(p.parentElement).gridAutoRows);
            const need = p.querySelector('.panel-head').offsetHeight + 2 * parseFloat(getComputedStyle(p).marginTop) + p.offsetHeight - p.clientHeight;
            return (+p.style.getPropertyValue('--h') * row - need) / row;
        });
        await page.focus('#rig .panel-edge[data-dir="se"]');
        for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft'); // narrowest: its open title wraps
        await page.evaluate(() => document.querySelector('#rig .panel-collapse').click());
        await frames(page);
        let s = await slack();
        assert.ok(s >= 0 && s < 1, `collapsed narrow: ${s.toFixed(2)} rows of slack`);
        await page.evaluate(() => { // a stale save: the bar recorded far too tall
            const save = JSON.parse(localStorage.getItem('board:nexus'));
            save.items.find((i) => i.id === 'rig').h = 40;
            localStorage.setItem('board:nexus', JSON.stringify(save));
        });
        await page.reload({ waitUntil: 'load' });
        await sleep(600);
        s = await slack();
        assert.ok(s >= 0 && s < 1, `after a stale save: ${s.toFixed(2)} rows of slack`);
        return errors;
    },
    async "content in a panel's head, body and foot can query the panel's width"(browser) {
        const { page, errors } = await open(browser);
        const hits = await page.evaluate(() => {
            document.head.append(Object.assign(document.createElement('style'), { textContent: '@container panel (min-width: 1px) { .panel > * > * { --in-panel: 1; } }' }));
            return ['head', 'body', 'foot'].map((part) => getComputedStyle(document.querySelector(`#rig > .panel-${part} > *`)).getPropertyValue('--in-panel').trim());
        });
        assert.deepEqual(hits, ['1', '1', '1']);
        return errors;
    },
    async "a headless panel's keyboard grip shows inside the panel, however narrow"(browser) {
        const all = [];
        for (const opts of [SMALL, { viewport: { width: 1100, height: 900 } }]) {
            const { page, errors } = await open(browser, opts);
            all.push(...errors);
            await center(page, 'meme-1');
            await page.focus('#meme-1 .panel-edge[data-dir="se"]');
            for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft');
            await page.focus('#meme-1 .panel-grip');
            await settled(page.locator('#meme-1 .panel-grip'), false); // it shows through a transition
            const bad = await page.evaluate(() => {
                const g = document.querySelector('#meme-1 .panel-grip').getBoundingClientRect(), p = document.getElementById('meme-1').getBoundingClientRect();
                const top = document.elementFromPoint(g.x + g.width / 2, g.y + g.height / 2);
                return g.width < 20 || g.left < p.left || g.right > p.right || g.top < p.top || g.bottom > p.bottom || !top?.matches('.panel-grip');
            });
            assert.equal(bad, false, `${opts.viewport.width}px: the grip is hidden, outside the panel or covered`);
            await page.context().close();
        }
        return all;
    },
    async 'a collapsed panel holds its whole head, mid-glide and at any width'(browser) {
        const { page, errors } = await open(browser, WIDE, { motion: 'no-preference' });
        const spill = () => page.evaluate(() => [...document.querySelectorAll('.panel.is-collapsed')]
            .filter((p) => p.querySelector('.panel-head').getBoundingClientRect().bottom > p.getBoundingClientRect().bottom + 1).map((p) => p.id));
        await center(page, 'privacy');
        await page.focus('#privacy .panel-edge[data-dir="se"]');
        for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowLeft');
        await page.evaluate(() => document.querySelector('#privacy .panel-collapse').click()); // while it still glides
        await sleep(1300);
        assert.deepEqual(await spill(), []);
        for (const width of [1100, 1600]) {
            await page.setViewportSize({ width, height: 900 });
            await sleep(1300);
            assert.deepEqual(await spill(), [], `${width}px`);
        }
        return errors;
    },
    async 'Lounge: a resize let go over the Sandspiel frame ends there, and one let go unseen ends once the capture goes'(browser) {
        const { page, errors } = await open(browser, WIDE, { path: '/thelounge.html' });
        // Up from the panel's top edge: Sandspiel above is a wall, so the edge stops and the pointer
        // carries on over the game's frame, another page (here an error page, out of process too)
        const resize = async () => {
            // Its top edge low on the screen (short of the edge that scrolls), the frame above it in view
            await page.evaluate(() => scrollBy(0, document.getElementById('interesting').getBoundingClientRect().top - 760));
            await sleep(150);
            const edge = await page.locator('#interesting .panel-edge[data-dir="n"]').boundingBox();
            const frame = await page.locator('#sandspiel iframe').boundingBox();
            const x = edge.x + 40, y = edge.y + edge.height / 2, to = Math.max(frame.y + 40, Math.min(frame.y + frame.height - 40, y - 300));
            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.move(x, y - 6);
            await page.mouse.move(x + 50, to, { steps: 8 });
            assert.ok(to > frame.y && to < frame.y + frame.height, 'the pointer is over the frame');
            assert.equal(await page.evaluate(() => document.querySelector('#interesting').classList.contains('is-resizing')), true, 'the resize began');
            await page.mouse.up();
            await sleep(200);
        };
        await resize();
        assert.equal(await arranging(page), false, 'the resize never ended');
        // A frame that still took the pointer: its release goes unseen, and the capture going lands it
        await page.addStyleTag({ content: 'iframe { pointer-events: auto !important; }' });
        await resize();
        assert.equal(await arranging(page), true, 'the frame let the release through (the case needs one that keeps it)');
        const box = await page.locator('#interesting .panel-body').boundingBox();
        await page.mouse.move(box.x + 20, box.y + 20);
        await sleep(200);
        assert.equal(await arranging(page), false, 'the capture went with no release and left it arranging');
        assert.deepEqual(await page.evaluate(() => { const p = document.getElementById('interesting'); return [p.classList.contains('is-resizing'), p.style.width, p.style.height]; }), [false, '', ''], 'it never landed');
        assert.match(await page.evaluate(() => document.querySelector('[data-board-bar="lounge"] [aria-live]').textContent), /columns by/, 'it was put back, not dropped');
        return errors;
    },
    async 'Lounge: Surprise Me skips the links of a panel hidden or collapsed on the board'(browser) {
        const { page, errors } = await open(browser, WIDE, { path: '/thelounge.html', init: () => { window.open = (url) => { (window.__opened ??= []).push(url); }; } });
        // Hidden and collapsed: everything but Weird Internet
        for (const id of ['sites-fun', 'sites-mind-bending', 'sites-archives']) await page.evaluate((id) => document.querySelector(`#${id} > :is(.panel-head, .panel-grab) .panel-close`).click(), id);
        for (const id of ['sites-stats', 'sites-beer']) await page.evaluate((id) => document.querySelector(`#${id} > :is(.panel-head, .panel-grab) .panel-collapse`).click(), id);
        for (let i = 0; i < 40; i++) await page.evaluate(() => document.getElementById('surpriseBtn').click());
        const weird = await page.evaluate(() => [...document.querySelectorAll('#sites-weird .site-link')].map((a) => a.href));
        const opened = await page.evaluate(() => window.__opened);
        assert.equal(opened.length, 40);
        assert.deepEqual(opened.filter((u) => !weird.includes(u)), [], 'opened a link from a panel off the board');
        // The category filter's way, on a fresh board: Archives alone, the rest filtered out
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'load' });
        await sleep(400);
        await page.evaluate(() => document.querySelector('.filter-btn[data-category="archives"]').click());
        for (let i = 0; i < 40; i++) await page.evaluate(() => document.getElementById('surpriseBtn').click());
        const archives = await page.evaluate(() => [...document.querySelectorAll('#sites-archives .site-link')].map((a) => a.href));
        const filtered = await page.evaluate(() => window.__opened);
        assert.equal(filtered.length, 40);
        assert.deepEqual(filtered.filter((u) => !archives.includes(u)), [], 'opened a link from a filtered-out category');
        return errors;
    },
    async 'a page that lays out a smaller tier itself gets those cells there, each grown to its content'(browser) {
        const all = [];
        // At the windows the Lounge's and the home page's cells were measured for (a game frame is 60% of a phone's height)
        for (const [opts, tier, path] of ['/thelounge.html', '/'].flatMap((path) => [[{ ...FOLD, viewport: { width: 901, height: 700 } }, 'mid', path], [{ ...PHONE, viewport: { width: 390, height: 700 } }, 'phone', path]])) {
            const { page, errors } = await open(browser, opts, { path });
            all.push(...errors);
            const off = await page.evaluate(() => [...document.querySelectorAll('.board > .panel')].flatMap((p) => {
                // Each at its own board's tier: the page's by the window, a board in a panel's by its own width
                // (a board in a panel at its wide tier was measured at a roomy window: the case above)
                const tier = ({ 6: 'phone', 12: 'mid' })[getComputedStyle(p.parentElement).getPropertyValue('--cols').trim()] ?? 'wide';
                if (tier === 'wide' && p.parentElement.closest('.panel')) return [];
                const want = (tier === 'wide' ? ['x', 'y', 'w', 'h'].map((k) => p.dataset[k]) : p.dataset[tier].split(' ')).map(Number), got = ['x', 'y', 'w', 'h'].map((k) => +p.style.getPropertyValue('--' + k));
                return got.join() === want.join() ? [] : [`${p.id} ${want} → ${got}`]; // measured at this width, so exactly
            }));
            assert.deepEqual(off, [], `${path} ${tier}`);
            await page.context().close();
        }
        return all;
    },
    async "Home: each box where it was and as wide, the hero untouched, Let's Vibe landing with room, late work links held, and titles clear of the tools"(browser) {
        const all = [];
        // Frames [left, width] and the hero's title top, as the page before had them
        const was = { 1440: { socials: [270, 900], box: [136, 1168], hero: 327 }, 901: { socials: [16, 869], box: [32, 837], hero: 197 }, 390: { socials: [8, 374], box: [16, 358], hero: 245 } };
        for (const opts of [{ viewport: { width: 1440, height: 900 } }, { ...FOLD, viewport: { width: 901, height: 700 } }, { ...PHONE, viewport: { width: 390, height: 700 } }]) {
            const w = opts.viewport.width;
            const { page, errors } = await open(browser, opts, { path: '/' });
            all.push(...errors);
            const got = await page.evaluate(() => {
                const frame = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width)]; };
                return { socials: frame('socials'), box: ['amazonian', 'lounge', 'finance'].map(frame), hero: Math.round(document.querySelector('.hero h1').getBoundingClientRect().top) };
            });
            assert.deepEqual(got, { ...was[w], box: Array(3).fill(was[w].box) }, `${w}px: frames and hero`);
            // Let's Vibe's buttons land each box 4.5rem down
            const lands = [];
            for (const t of ['socials', 'amazonian', 'lounge', 'finance']) {
                await page.evaluate(() => scrollTo(0, 0));
                await page.click('#openctaPopup');
                await page.click(`.ctaPopup-btn[data-target="${t}"]`);
                await page.waitForFunction((t) => Math.abs(document.getElementById(t).getBoundingClientRect().top - 72) < 2, t, { timeout: 3000 }).catch(() => {});
                lands.push(Math.round(await page.evaluate((t) => document.getElementById(t).getBoundingClientRect().top, t)));
            }
            assert.ok(lands.every((y) => Math.abs(y - 72) <= 1.5), `${w}px: where Let's Vibe lands each box: ${lands}`);
            // Titles: centered where the page centered them (the card always, a box up to 900px), clear of the tools
            const titles = await page.evaluate(() => [...document.querySelectorAll('.board .panel-head > h2')].flatMap((t) => {
                const p = t.closest('.panel'), pr = p.getBoundingClientRect(), tools = t.parentElement.querySelector('.panel-tools').getBoundingClientRect(), r = document.createRange();
                r.selectNodeContents(t);
                const text = r.getBoundingClientRect(), centered = Math.abs(text.left + text.width / 2 - (pr.left + pr.width / 2)) <= 1.5, out = [];
                if (centered !== (p.id === 'socials' || innerWidth <= 900)) out.push(`${p.id} ${centered ? 'centered' : 'not centered'}`);
                if ([...r.getClientRects()].some((l) => l.left < tools.right - 1 && tools.left < l.right - 1 && l.top < tools.bottom - 1 && tools.top < l.bottom - 1)) out.push(`${p.id} under the tools`);
                return out;
            }));
            assert.deepEqual(titles, [], `${w}px: titles`);
            await page.context().close();
        }
        // The Amazon work links arrive from the database after the board measured: the box grows to hold them
        const ctx = await browser.newContext({ ...PHONE, reducedMotion: 'reduce' });
        await ctx.route((url) => !url.href.startsWith(base), async (r) => {
            if (!r.request().url().endsWith('/config/worklinks.json')) return r.abort();
            await sleep(800);
            r.fulfill({ contentType: 'application/json', body: JSON.stringify({ pills: [1, 2, 3, 4].map((i) => ({ internal: `https://a.example/${i}`, external: `https://b.example/${i}`, internalText: `Internal ${i} →`, externalText: `External ${i} →` })) }) });
        });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => all.push(e.message));
        await page.goto(base + '/', { waitUntil: 'load' });
        await page.waitForFunction(() => document.querySelectorAll('#workLinks .pillBtn').length === 4);
        await sleep(500);
        assert.equal(await page.evaluate(() => { const b = document.querySelector('#amazonian > .panel-body'); return b.scrollHeight - b.clientHeight; }), 0, 'Amazonian scrolls inside once its links are in');
        // The database unreachable, but only after the fonts are in: the toggle hides and the box shrinks to fit
        const slow = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
        await slow.route((url) => !url.href.startsWith(base), async (r) => { if (r.request().url().endsWith('/config/worklinks.json')) await sleep(1500); r.abort(); });
        const sp = await slow.newPage();
        sp.on('pageerror', (e) => all.push(e.message));
        await sp.goto(base + '/', { waitUntil: 'load' });
        await sp.waitForFunction(() => getComputedStyle(document.querySelector('.link-toggle-container')).display === 'none', null, { timeout: 5000 });
        await sleep(500);
        assert.ok(await sp.evaluate(() => { const b = document.querySelector('#amazonian > .panel-body'), z = b.lastElementChild;
            return b.getBoundingClientRect().bottom - z.getBoundingClientRect().bottom - parseFloat(getComputedStyle(b).paddingBottom) <= parseFloat(getComputedStyle(document.querySelector('.board')).gridAutoRows); }), 'Amazonian keeps a blank band where its hidden toggle was');
        await slow.close();
        // The narrowest phones: nothing in a panel runs sideways (the boxes clipped it before)
        for (const width of [320, 330, 360, 375]) {
            await page.setViewportSize({ width, height: 700 });
            await sleep(300);
            assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.board > .panel:not(.panel-media)')].filter((p) => { const b = p.querySelector('.panel-body'); return b.scrollWidth > b.clientWidth + 1; }).map((p) => p.id)), [], `${width}px: sideways`);
        }
        await ctx.close();
        return all;
    },
    async "Home: at any width a box holds no blank band and keeps its gaps, the promo is a link edge to edge and wraps as it did, the chart isn't cut, the card is 900px, and a title that fits takes one line"(browser) {
        const { ctx, page, errors } = await open(browser, { viewport: { width: 1440, height: 900 } }, { path: '/' });
        // (the work links' fetch fails here, so the toggle hides after the first measure, and says so)
        // The promo's sentence takes as many lines as on the page before (one down to 560px, then two)
        for (const [width, lines] of [1440, 1200, 1100, 1000, 901, 800, 700, 650, 641, 640, 600, 560, 480, 430, 390, 320].map((w) => [w, w >= 560 ? 1 : 2])) {
            await page.setViewportSize({ width, height: 800 });
            await steady(page);
            const got = await page.evaluate(() => {
                const panels = [...document.querySelectorAll('.board[data-board="home"] > .panel')];
                // A body's content end to its bottom edge: under a row (its own board's) means the box, or a block in it, is as tall as what it holds
                const blank = [...document.querySelectorAll('.board > .panel:not(.panel-media)')].filter((p) => { const b = p.querySelector(':scope > .panel-body'), kids = [...b.children].filter((k) => getComputedStyle(k).position !== 'absolute');
                    const end = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom + parseFloat(getComputedStyle(k).marginBottom))) + parseFloat(getComputedStyle(b).paddingBottom);
                    return b.getBoundingClientRect().bottom - end > parseFloat(getComputedStyle(p.parentElement).gridAutoRows); }).map((p) => p.id);
                // The gaps between panels, in rows: the ones their cells give them, at any width
                const tier = innerWidth <= 640 ? 'phone' : innerWidth <= 1080 ? 'mid' : 'wide';
                const cells = (p) => (tier === 'wide' ? ['x', 'y', 'w', 'h'].map((k) => +p.dataset[k]) : p.dataset[tier].split(' ').map(Number));
                const gaps = panels.slice(1).map((p, i) => { const a = panels[i], s = (q) => ['y', 'h'].map((k) => +q.style.getPropertyValue('--' + k)), [ay, ah] = s(a), [by] = s(p), [, cy, , ch] = cells(a), [, dy] = cells(p);
                    return (by - ay - ah) - (dy - cy - ch); }).filter(Boolean);
                // Every point of the promo's link is the link
                const link = document.querySelector('.promo-link'), lr = link.getBoundingClientRect(), top = lr.top + scrollY;
                const dead = [[0.5, 0.08], [0.15, 0.08], [0.85, 0.08], [0.5, 0.5]].filter(([fx, fy]) => {
                    scrollTo({ top: top + lr.height * fy - innerHeight / 2, behavior: 'instant' });
                    const r = link.getBoundingClientRect();
                    return !link.contains(document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy));
                });
                const chart = document.querySelector('.btc-chart-widget').getBoundingClientRect(), fb = document.querySelector('#finance > .panel-body').getBoundingClientRect();
                // A title that fits its head's room on one line takes one line
                const wraps = [...document.querySelectorAll('.board .panel-head > h2')].filter((t) => { const r = document.createRange(); r.selectNodeContents(t);
                    const lines = new Set([...r.getClientRects()].map((l) => Math.round(l.top))).size, head = t.parentElement, cs = getComputedStyle(head);
                    t.style.whiteSpace = 'nowrap'; const one = r.getBoundingClientRect().width; t.style.removeProperty('white-space');
                    return lines > 1 && one <= head.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); }).map((t) => t.closest('.panel').id);
                const said = document.createRange(); said.selectNodeContents(document.querySelector('.promo-text'));
                return { blank, gaps, dead: dead.length, cut: Math.round(fb.top - chart.top), card: Math.round(document.getElementById('socials').getBoundingClientRect().width), wraps, lines: new Set([...said.getClientRects()].map((l) => Math.round(l.top))).size };
            });
            assert.deepEqual([got.blank, got.gaps, got.dead, got.wraps], [[], [], 0, []], `${width}px: boxes with a blank band, gaps off their cells', dead spots on the promo, titles wrapped that fit: ${JSON.stringify(got)}`);
            assert.ok(got.cut <= 0, `${width}px: the chart starts ${got.cut}px above its box's body, cut off`);
            if ([1440, 1200, 1000].includes(width)) assert.equal(got.card, 900, `${width}px: the card's width`);
            assert.equal(got.lines, lines, `${width}px: lines the promo's sentence takes`);
        }
        // A weak machine's lean board (and an arranging one) drops the dressed panels' blur
        await page.evaluate(() => document.querySelector('.board').classList.add('is-lean'));
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.home-card, .home-box')].map((p) => getComputedStyle(p).backdropFilter)), Array(4).fill('none'), 'blur on a lean board');
        // Finance made as narrow as a panel gets: its freeze buttons stack, one to a row, and nothing
        // scrolls sideways (at a phone's width too, where shared.css lays them out two across)
        await page.evaluate(() => document.querySelector('.board').classList.remove('is-lean'));
        for (const width of [1440, 390]) {
            await page.setViewportSize({ width, height: 800 });
            await sleep(400);
            await page.focus('#finance > .panel-edge[data-dir="se"]');
            for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft');
            await sleep(300);
            assert.deepEqual(await page.evaluate(() => { const b = document.querySelector('#finance > .panel-body');
                return [getComputedStyle(b.querySelector('.qlBtns')).gridTemplateColumns.split(' ').length, b.scrollWidth - b.clientWidth]; }), [1, 0], `${width}px: [freeze buttons across, px it scrolls sideways] in the narrowest Finance`);
        }
        await ctx.close();
        return errors;
    },
    async 'on a tall board a meme keeps its height in a row beside a box, and a panel keeps its gap under the lowest panel above it'(browser) {
        // A beside a list B (which keeps its 24 rows) over C; a box D sharing a meme M's row under C
        const box = (id, cells, px, mark = '') => `<article class="panel" id="${id}" ${cells}${mark}><header class="panel-head"><h2>${id}</h2></header><div class="panel-body"><div style="height: ${px}px"></div></div></article>`;
        const html = `<!doctype html><html><head><link rel="stylesheet" href="/css/shared.css"><link rel="stylesheet" href="/css/board.css"></head><body><main><div class="board" data-board="made" data-tall>
            ${box('A', 'data-x="1" data-y="4" data-w="12" data-h="8"', 400)}${box('B', 'data-x="13" data-y="4" data-w="12" data-h="24"', 2000, ' data-scroll')}
            ${box('C', 'data-x="1" data-y="30" data-w="24" data-h="8"', 100)}${box('D', 'data-x="1" data-y="40" data-w="18" data-h="12"', 60)}
            <figure class="panel panel-media" id="M" data-x="19" data-y="40" data-w="6" data-h="12" aria-label="Meme"><div class="panel-body"></div></figure>
        </div></main><script src="/js/board.js"></script></body></html>`;
        const { page, errors } = await open(browser, WIDE, { path: '/made.html', route: [base + '/made.html', (r) => r.fulfill({ contentType: 'text/html', body: html })] });
        const [a, b, c, d, m] = await Promise.all(['A', 'B', 'C', 'D', 'M'].map((id) => cells(page, id)));
        // A grows to hold its content and still ends above B, so C stays its 2 rows under B; M keeps its 12 rows and D its row with it
        assert.deepEqual([a[3] > 8 && a[1] + a[3] < 28, b[3], c[1], m[3], d[3], d[1] === m[1]], [true, 24, 30, 12, 12, true], `A ${a}, B ${b}, C ${c}, D ${d}, M ${m}`);
        return errors;
    },
    async 'a board in a panel: its blocks move within the panel, which holds them, and its tier follows the panel'(browser) {
        const block = (id, cells, px) => `<section class="panel" id="${id}" aria-label="Block ${id}" ${cells}><div class="panel-body"><div style="height: ${px}px"></div></div></section>`;
        const html = `<!doctype html><html><head><link rel="stylesheet" href="/css/shared.css"><link rel="stylesheet" href="/css/board.css"></head><body><main><div class="board" data-board="made" data-surface="clear" data-tall>
            <article class="panel" id="H" data-x="1" data-y="2" data-w="24" data-h="10" style="backdrop-filter: blur(4px)"><header class="panel-head"><h2>Host</h2></header><div class="panel-body">
                <div class="board" data-board="made-in" data-surface="clear" data-tall>${block('A', 'data-x="1" data-y="1" data-w="12" data-h="4"', 60)}${block('B', 'data-x="13" data-y="1" data-w="12" data-h="4"', 60)}</div>
            </div></article>
            <article class="panel" id="O" data-x="1" data-y="13" data-w="24" data-h="6"><header class="panel-head"><h2>Other</h2></header><div class="panel-body"><p>below</p></div></article>
            <section class="panel" id="G" aria-label="Second" data-x="1" data-y="20" data-w="24" data-h="8"><div class="panel-body">
                <div class="board" data-board="made-in-2" data-tall><article class="panel" id="I" data-x="1" data-y="1" data-w="12" data-h="4"><header class="panel-head"><h2>Inner</h2></header><div class="panel-body"><p>held</p></div></article></div>
            </div></section>
        </div></main><div style="height: 150vh"></div><script src="/js/main.js"></script><script src="/js/board.js"></script></body></html>`;
        const { page, errors } = await open(browser, WIDE, { path: '/made.html', route: [base + '/made.html', (r) => r.fulfill({ contentType: 'text/html', body: html })] });
        // The panel holds its board whole, and the panel under it keeps its gap
        const held = () => page.evaluate(() => { const h = document.getElementById('H'), b = h.querySelector(':scope > .panel-body'), inner = b.querySelector('.board');
            return { inside: b.scrollHeight - b.clientHeight, blank: Math.round(b.getBoundingClientRect().bottom - inner.getBoundingClientRect().bottom - parseFloat(getComputedStyle(b).paddingBottom)) }; });
        const gap = async () => { const [h, o] = [await cells(page, 'H'), await cells(page, 'O')]; return o[1] - (h[1] + h[3]); };
        let got = await held();
        assert.deepEqual([got.inside <= 1, got.blank < 32, await gap()], [true, true, 1], `held at first: ${JSON.stringify(got)}`);
        // Each board's controls are its own: the panel's title, grip and corner aren't its blocks', and the
        // inner board's Reset and Add widget sit with the panel's tools
        assert.deepEqual(await page.evaluate(() => [document.querySelector('#H > .panel-head .panel-grip').getAttribute('aria-label'), document.querySelector('#A > .panel-grab .panel-grip').getAttribute('aria-label'),
            !!document.querySelector('#H > .panel-head > .panel-tools > .board-tools'), document.querySelectorAll('.board-bar').length]),
            ['Move Host with the arrow keys', 'Move Block A with the arrow keys', true, 1], 'controls');
        // A headless panel is named by its label, not by a block's title inside it
        assert.equal(await page.evaluate(() => document.querySelector('#G > .panel-grab .panel-grip').getAttribute('aria-label')), 'Move Second with the arrow keys', 'a headless host\'s grip');
        // Pointed at, the panel shows its tools and corner, not its blocks'
        await page.mouse.move(...await page.locator('#H > .panel-head').boundingBox().then((b) => [b.x + 200, b.y + 10]));
        await sleep(400);
        assert.deepEqual(await page.evaluate(() => ['#H > .panel-head > .panel-tools', '#H > .panel-edge[data-dir="se"]', '#A > .panel-grab > .panel-tools', '#A > .panel-edge[data-dir="se"]'].map((q) => getComputedStyle(document.querySelector(q)).opacity)), ['1', '1', '0', '0'], 'tools shown pointing at the panel');
        // A block carried stays under the pointer, the page scrolled under it too; dropped lower, the panel grows to hold it
        const g = await page.locator('#A > .panel-grab').boundingBox(), x = g.x + 20, y = g.y + g.height / 2;
        const a0 = await page.locator('#A').boundingBox();
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 6, y + 6);
        await page.mouse.move(x + 10, y + 260, { steps: 8 });
        assert.equal(await page.evaluate(() => { scrollBy({ top: 60, behavior: 'instant' }); return scrollY; }), 60, 'the page scrolled under the carried block');
        await page.mouse.move(x + 10, y + 262);
        await frames(page);
        const a1 = await page.evaluate(() => { const r = document.getElementById('A').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
        assert.deepEqual([Math.abs(a1.x - (a0.x + a0.width / 2 + 10)) < 6, Math.abs(a1.y - (a0.y + a0.height / 2 + 262)) < 6], [true, true], `carried block under the pointer ${JSON.stringify([a0, a1])}`);
        await page.mouse.up();
        await sleep(500);
        got = await held();
        const a = await cells(page, 'A');
        assert.deepEqual([a[0], a[1] > 4, got.inside <= 1, got.blank < 32, await gap(), !!await page.evaluate(() => localStorage.getItem('board:made-in')), await page.evaluate(() => !document.querySelector('#H .board-tools button:nth-of-type(2)').hidden)],
            [1, true, true, true, 1, true, true], `dropped lower: A ${a}, ${JSON.stringify(got)}`);
        // Its own Reset puts the blocks back, and the panel holds them as they were
        await page.click('#H .board-tools button:nth-of-type(2)', { force: true });
        await sleep(500);
        got = await held();
        assert.deepEqual([await cells(page, 'A'), got.inside <= 1, got.blank < 32], [[1, 1, 12, 4], true, true], `reset: ${JSON.stringify(got)}`);
        // Its panel without a blur (a lean board drops it), so the window places a carried block: it stays under the pointer as the page scrolls
        await page.evaluate(() => { document.getElementById('H').style.backdropFilter = 'none'; scrollTo({ top: 0, behavior: 'instant' }); });
        {
            const g = await page.locator('#A > .panel-grab').boundingBox(), x = g.x + 20, y = g.y + g.height / 2, a0 = await page.locator('#A').boundingBox();
            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.move(x + 6, y + 6);
            await page.mouse.move(x + 10, y + 260, { steps: 8 });
            await page.evaluate(() => scrollBy({ top: 60, behavior: 'instant' }));
            await page.mouse.move(x + 10, y + 262);
            await frames(page);
            const a1 = await page.evaluate(() => { const r = document.getElementById('A').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
            await page.keyboard.press('Escape');
            await page.mouse.up();
            await sleep(300);
            assert.deepEqual([Math.abs(a1.x - (a0.x + a0.width / 2 + 10)) < 6, Math.abs(a1.y - (a0.y + a0.height / 2 + 262)) < 6, await cells(page, 'A')], [true, true, [1, 1, 12, 4]], `carried in a panel with no blur ${JSON.stringify([a0, a1])}`);
            await page.evaluate(() => { document.getElementById('H').style.backdropFilter = 'blur(4px)'; scrollTo({ top: 0, behavior: 'instant' }); });
        }
        // A block hidden comes back from the panel's ＋
        await page.click('#B > .panel-grab .panel-close', { force: true });
        await sleep(300);
        assert.ok(await page.evaluate(() => document.getElementById('B').hidden), 'B hidden by its ✕');
        await page.click('#H .board-tools button:nth-of-type(1)', { force: true });
        assert.ok(await page.evaluate(() => document.getElementById('made-in-menu').matches(':popover-open')), 'the panel\'s ＋ opens its menu');
        // Its items are the menu's, not the panel's tool squares, and a press in the menu is no grab of the panel
        const item = await page.evaluate(() => { const b = document.querySelector('#made-in-menu button'); return [b.offsetWidth, b.scrollWidth <= b.clientWidth]; });
        const mb = await page.locator('#made-in-menu').boundingBox(), h0 = await cells(page, 'H');
        const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [mb.x + mb.width / 2, mb.y + 2]);
        await page.mouse.move(mb.x + mb.width / 2, mb.y + 2); // its padding, above its first item
        await page.mouse.down();
        await page.mouse.move(mb.x + mb.width / 2 + 200, mb.y + 202, { steps: 5 });
        await page.mouse.up();
        await sleep(300);
        assert.deepEqual([item[0] > 60, item[1], hit, await cells(page, 'H')], [true, true, 'made-in-menu', h0], `the menu: [its item ${item[0]}px wide, its label whole, pressed in its padding, the panel where it was]`);
        if (!await page.evaluate(() => document.getElementById('made-in-menu').matches(':popover-open'))) await page.click('#H .board-tools button:nth-of-type(1)', { force: true }); // let go outside it, it closed
        await page.click('#made-in-menu button', { force: true });
        await sleep(400);
        assert.deepEqual([await page.evaluate(() => document.getElementById('B').hidden), await cells(page, 'B'), await page.evaluate(() => document.querySelector('#H .board-tools button:nth-of-type(2)').hidden)], [false, [13, 1, 12, 4], true], 'B hidden and added back: [hidden, its cells, the ↺ hidden at the default]');
        // Narrowed to half the board (a 700px body) by keys, the panel's board is a mid tier's, 12 columns.
        // Its blocks arranged there, the panel narrowed to a third (470px) by its edge: the resize goes
        // through, and the board is a phone's, 6 columns, its blocks stacked full width
        const inner = () => page.evaluate(() => getComputedStyle(document.querySelector('#H .board')).getPropertyValue('--cols').trim());
        await page.focus('#H > .panel-edge[data-dir="se"]');
        for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft');
        await sleep(600);
        assert.equal(await inner(), '12', 'half: the inner board\'s columns');
        await page.focus('#A > .panel-grab .panel-grip');
        await page.keyboard.press('ArrowDown');
        await sleep(400);
        const e = await page.locator('#H > .panel-edge[data-dir="e"]').boundingBox(), cw = await page.evaluate(() => document.querySelector('.board').clientWidth / 24);
        await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
        await page.mouse.down();
        await page.mouse.move(e.x + e.width / 2 - 4 * cw, e.y + e.height / 2, { steps: 10 });
        await sleep(300); // the inner board has crossed into the phone tier under the pointer
        await page.mouse.up();
        await sleep(600);
        assert.equal((await cells(page, 'H'))[2], 8, 'the panel resized across its board\'s tiers');
        got = await held();
        const [ia, ib] = [await cells(page, 'A'), await cells(page, 'B')];
        assert.deepEqual([await page.evaluate(() => getComputedStyle(document.querySelector('#H .board')).getPropertyValue('--cols').trim()), ia[2], ib[2], ib[1] > ia[1], got.inside <= 1], ['6', 6, 6, true, true], `narrowed: A ${ia}, B ${ib}, ${JSON.stringify(got)}`);
        return errors;
    },
    async "a box its page fills after the first measure grows to hold it: the Lounge's Discord roster"(browser) {
        const all = [];
        const roster = { name: 'Doshus', presence_count: 40, members: Array.from({ length: 40 }, (_, i) => ({ username: `u${i}`, avatar_url: `${base}/doshusfavi.ico`, status: 'online' })) };
        const reply = async (r) => { await sleep(900); r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(roster) }); };
        for (const opts of [WIDE, PHONE]) {
            const { page, errors } = await open(browser, opts, { path: '/thelounge.html', route: ['https://discord.com/api/guilds/**', reply] });
            all.push(...errors);
            await sleep(1200);
            const got = await page.evaluate(() => { const b = document.querySelector('#discord .panel-body'); return [b.querySelectorAll('.discord-member').length, b.scrollHeight - b.clientHeight]; });
            assert.deepEqual([got[0], got[1] <= 1], [12, true], `${opts.viewport.width}px: [avatars shown, nothing scrolls inside] (scrolls ${got[1]}px)`);
            await page.context().close();
        }
        return all;
    },
    async 'on a tall board a box keeps holding what it holds: keys at full motion, a side drag that snaps, a top edge narrowing it at the top'(browser) {
        const all = [];
        // Narrowed and widened again by keys as fast as a held key repeats, gliding: back where it started
        {
            const { page, errors } = await open(browser, WIDE, { path: '/', motion: 'no-preference' });
            all.push(...errors);
            await center(page, 'amazonian');
            await page.focus('#amazonian > .panel-edge[data-dir="se"]');
            for (const [key, n] of [['ArrowLeft', 8], ['ArrowRight', 11]]) for (let i = 0; i < n; i++) { await page.keyboard.press(key); await sleep(30); }
            await sleep(1600);
            assert.deepEqual(await cells(page, 'amazonian'), [1, 59, 24, 17], 'Amazonian narrowed and widened by keys, gliding');
            // Collapsed, its ▾ turns as it did: measuring it lands only what can change a size
            await page.click('#amazonian > .panel-head .panel-collapse', { force: true });
            assert.ok(await page.evaluate(() => document.querySelector('#amazonian > .panel-head .panel-collapse').getAnimations().some((a) => a.transitionProperty === 'rotate' && a.playState === 'running')), 'the ▾ turning as it collapses');
            await page.context().close();
        }
        // Dragged narrower by its side edge, the Lounge box lands as tall as it holds at the width it snaps to
        {
            const { page, errors } = await open(browser, WIDE, { path: '/' });
            all.push(...errors);
            const slack = [];
            for (const dx of [-300, -420, -540, -660, -780]) {
                await page.evaluate(() => localStorage.clear());
                await page.reload();
                await page.evaluate(() => document.fonts.ready);
                await sleep(600);
                await center(page, 'lounge');
                const e = await page.locator('#lounge > .panel-edge[data-dir="e"]').boundingBox();
                await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
                await page.mouse.down();
                await page.mouse.move(e.x + e.width / 2 + dx, e.y + e.height / 2, { steps: 10 });
                await page.mouse.up();
                await sleep(500);
                slack.push(await page.evaluate(() => { const p = document.getElementById('lounge'), b = p.querySelector(':scope > .panel-body'), row = parseFloat(getComputedStyle(p.parentElement).gridAutoRows);
                    const end = Math.max(...[...b.children].map((k) => k.getBoundingClientRect().bottom + parseFloat(getComputedStyle(k).marginBottom))) + parseFloat(getComputedStyle(b).paddingBottom);
                    return b.getBoundingClientRect().bottom - end >= row || b.scrollHeight - b.clientHeight > 1 ? `${p.style.getPropertyValue('--w')} wide: ${Math.round(b.getBoundingClientRect().bottom - end)}px below, ${b.scrollHeight - b.clientHeight}px inside` : 0; }));
            }
            assert.deepEqual(slack.filter(Boolean), [], 'the Lounge box narrowed by its side edge');
            await page.context().close();
        }
        // A save from before that fix, holding a panel above the board, loads with the panel on it
        {
            const { page, errors } = await open(browser, WIDE, { path: '/thelounge.html', init: () => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('board:lounge', JSON.stringify({ v: 2, cols: 24, items: [{ id: 'picks', x: 1, y: -10, w: 12, h: 34 }] })); } } catch {} } });
            all.push(...errors);
            assert.ok((await cells(page, 'picks'))[1] >= 1, `a saved row above the board: ${await cells(page, 'picks')}`);
            await page.context().close();
        }
        // A top corner narrowing a panel near the board's top: the panel grows down, never above row 1, and saves that
        {
            const { page, errors } = await open(browser, WIDE, { path: '/thelounge.html' });
            all.push(...errors);
            await center(page, 'picks');
            const e = await page.locator('#picks > .panel-edge[data-dir="ne"]').boundingBox();
            await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
            await page.mouse.down();
            await page.mouse.move(e.x + e.width / 2 - 700, e.y + e.height / 2 + 40, { steps: 10 });
            await page.mouse.up();
            await sleep(500);
            const got = await cells(page, 'picks'), kept = await page.evaluate(() => JSON.parse(localStorage.getItem('board:lounge')).items.find((i) => i.id === 'picks').y);
            await page.reload();
            await sleep(800);
            assert.deepEqual([got[1] >= 1, kept >= 1, (await cells(page, 'picks'))[1] >= 1], [true, true, true], `picks narrowed from its top corner: ${got}, saved at row ${kept}`);
            await page.context().close();
        }
        return all;
    },
    async "Home: the Finance box's blocks sit where its content did, and move within it"(browser) {
        const all = [];
        // Tops of what each block holds, from the box's content edge, on the page before (its chart rose 11px past it; stacked, 16)
        const was = { 1440: [0, -11, 277, 597], 901: [0, -11, 277, 597], 390: [291, -16, 756, 1037] };
        // Each read where it would sit at its block's top: a block holds what it holds in its middle, in the room its rows round up to
        const tops = (page) => page.evaluate(() => { const b = document.querySelector('#finance > .panel-body'), top = b.getBoundingClientRect().top + parseFloat(getComputedStyle(b).paddingTop);
            const lift = (n) => { const body = n.closest('.panel-body'), k = [...body.children].find((c) => c.checkVisibility() && getComputedStyle(c).position !== 'absolute');
                return k.getBoundingClientRect().top - parseFloat(getComputedStyle(k).marginTop) - body.getBoundingClientRect().top - parseFloat(getComputedStyle(body).paddingTop); };
            return ['#fin-intro p', '.btc-chart-widget', '.credit-card-carousel', '.quickLinks'].map((q) => { const n = document.querySelector(q); return Math.round(n.getBoundingClientRect().top - top - lift(n)); }); });
        for (const opts of [{ viewport: { width: 1440, height: 900 } }, { ...FOLD, viewport: { width: 901, height: 700 } }, { ...PHONE, viewport: { width: 390, height: 700 } }]) {
            const { page, errors } = await open(browser, opts, { path: '/' });
            all.push(...errors);
            const got = await tops(page), w = opts.viewport.width;
            assert.deepEqual(got.map((t, i) => Math.abs(t - was[w][i]) <= 16), [true, true, true, true], `${w}px: tops of the intro, chart, cards and freeze buttons ${got} (was ${was[w]})`);
            // The chart as wide as it was (40% of the box beside the links; the box's width stacked), the first two links side by side as they were
            const look = await page.evaluate(() => { const c = document.querySelector('.btc-chart-widget').getBoundingClientRect().width, [a, b] = [...document.querySelectorAll('#fin-intro .button-group > a')].map((x) => x.getBoundingClientRect().top);
                return [Math.round(c), a === b]; });
            assert.deepEqual([Math.abs(look[0] - { 1440: 466, 901: 334, 390: 308 }[w]) <= 24, look[1] || w === 390], [true, true], `${w}px: [chart width ${look[0]}, links side by side]`);
            // In the box's accent, as before (a board in a panel takes its panel's)
            assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#fin-freeze .qlBtn')).borderColor), await page.evaluate(() => { const b = document.createElement('a'); b.className = 'qlBtn'; const q = document.createElement('div'); q.className = 'qlBtns'; q.append(b); document.querySelector('#finance > .panel-body').append(q); const c = getComputedStyle(b).borderColor; q.remove(); return c; }), `${w}px: the freeze buttons' color`);
            await page.context().close();
        }
        // Carried by its strip, the chart goes to the box's left; the box holds its blocks, the move is saved for the next visit
        const { page, errors } = await open(browser, WIDE, { path: '/' });
        all.push(...errors);
        await center(page, 'finance');
        const g = await page.locator('#fin-chart > .panel-grab').boundingBox(), cw = await page.evaluate(() => document.querySelector('#finance .board').clientWidth / 24);
        await drag(page, '#fin-chart > .panel-grab', -14 * cw, 0);
        await sleep(400);
        const held = () => page.evaluate(() => { const b = document.querySelector('#finance > .panel-body'); return b.scrollHeight - b.clientHeight; });
        assert.deepEqual([(await cells(page, 'fin-chart'))[0], await held() <= 1, !!await page.evaluate(() => localStorage.getItem('board:home-finance'))], [1, true, true], `chart carried left: ${await cells(page, 'fin-chart')}`);
        await page.reload();
        await page.evaluate(() => document.fonts.ready);
        await sleep(600);
        assert.deepEqual([(await cells(page, 'fin-chart'))[0], await held() <= 1], [1, true], 'after a reload');
        // Narrowed past 770.5px of box by its edge, the blocks it had stay in view, fitted into the
        // stacking grid, until it's let go (the chart was 2px wide in the old cells)
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        await sleep(600);
        await center(page, 'finance');
        {
            const e = await page.locator('#finance > .panel-edge[data-dir="e"]').boundingBox();
            await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
            await page.mouse.down();
            await page.mouse.move(e.x + e.width / 2 - 500, e.y + e.height / 2, { steps: 10 });
            await sleep(400);
            const chart = await page.evaluate(() => Math.round(document.getElementById('fin-chart').getBoundingClientRect().width));
            await page.keyboard.press('Escape');
            await page.mouse.up();
            assert.ok(chart > 100, `the chart ${chart}px wide mid-drag past 770.5px of box`);
        }
        // Narrowed past 770.5px of box, its blocks stack, the chart on top, as the box's content did
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        await sleep(600);
        await page.focus('#finance > .panel-edge[data-dir="se"]');
        for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowLeft');
        await sleep(800);
        const stack = await page.evaluate(() => ['fin-chart', 'fin-intro', 'fin-cards', 'fin-freeze'].map((id) => +document.getElementById(id).style.getPropertyValue('--y')));
        assert.deepEqual([stack.every((y, i) => !i || y > stack[i - 1]), await page.evaluate(() => getComputedStyle(document.querySelector('#finance .board')).getPropertyValue('--cols').trim()), await held() <= 1], [true, '12', true], `narrowed: rows ${stack}`);
        await page.context().close();
        // Windows swept across the box's tiers: no ResizeObserver loop (the inner board read its tier
        // inside the observer's pass), no width written on the inner board (it restyled every block), and
        // the card's rows right the frame the page crosses into the mid tier (measured at the new width)
        {
            const { page: sw, errors: swe } = await open(browser, { viewport: { width: 1200, height: 900 } }, { path: '/', init: () => { window.__loops = 0; addEventListener('error', (e) => { if (/ResizeObserver/.test(e.message)) window.__loops++; }); } });
            all.push(...swe);
            const settledH = async () => { await sleep(700); return (await cells(sw, 'socials'))[3]; };
            await sw.setViewportSize({ width: 1000, height: 900 });
            await frames(sw);
            const first = (await cells(sw, 'socials'))[3];
            assert.equal(first, await settledH(), 'the card\'s rows the frame the page crosses into the mid tier');
            for (const width of [920, 900, 880, 860, 700, 560, 540, 520, 480, 900, 1440]) { await sw.setViewportSize({ width, height: 900 }); await frames(sw); await sleep(120); }
            assert.deepEqual([await sw.evaluate(() => window.__loops), await sw.evaluate(() => document.querySelector('#finance .board').style.getPropertyValue('--board-w'))], [0, ''], '[ResizeObserver loops, the inner board\'s own --board-w]');
            await sw.context().close();
        }
        return all.concat(errors);
    },
    async "Home: the Lounge box's blocks sit where its content did, and move within it"(browser) {
        const all = [];
        // Tops of what each block holds, from the box's content edge, on the page before. At 1440px its
        // meme, a square at 48% of the box, stood 29px past the 500px player; the meme block now stands
        // flush with the player (Doshus, 2026-10-17: framed as the Lounge's memes), so the sites and links
        // sit two rows higher there
        const was = { 1440: [24, 64, 64, 633 - 32, 884 - 32], 901: [24, 64, 64, 608, 865], 390: [24, 89, 609, 941, 1480] };
        for (const opts of [{ viewport: { width: 1440, height: 900 } }, { ...FOLD, viewport: { width: 901, height: 700 } }, { ...PHONE, viewport: { width: 390, height: 700 } }]) {
            const { page, errors } = await open(browser, opts, { path: '/' });
            all.push(...errors);
            const w = opts.viewport.width;
            const got = await page.evaluate(() => { const b = document.querySelector('#lounge > .panel-body'), top = b.getBoundingClientRect().top + parseFloat(getComputedStyle(b).paddingTop);
                const at = (q) => Math.round(document.querySelector(q).getBoundingClientRect().top - top);
                const r = (q) => document.querySelector(q).getBoundingClientRect();
                const [meme, slot, spot, body, frame] = ['#lg-meme', '#lg-meme > .random-meme-fixed', '#lg-spotify', '#lg-spotify > .panel-body', '#lg-spotify iframe'].map(r);
                return { tops: ['#lg-intro p', '#lg-spotify iframe', '#lg-meme > .random-meme-fixed', '#lg-sites p', '#lg-links .button-group'].map(at),
                    flush: [meme.top - spot.top, meme.height - spot.height].map(Math.round), inset: [slot.left - meme.left, meme.bottom - slot.bottom].map(Math.round),
                    player: [frame.top - body.top, frame.height - body.height, frame.height].map(Math.round) };
            });
            // Each block within 16px of its old spot; beside the player (above a phone) the meme block stands flush with it, its picture
            // inside its frame (a 2px border and 8px in); the player covers its block's body
            assert.deepEqual([got.tops.map((t, i) => Math.abs(t - was[w][i]) <= 16), w === 390 || got.flush.every((d) => !d), got.inset, got.player.slice(0, 2), got.player[2] >= 500],
                [[true, true, true, true, true], true, [10, 10], [0, 0], true], `${w}px: ${JSON.stringify(got)} (tops were ${was[w]})`);
            await page.context().close();
        }
        // The meme carried by its strip to the box's left: it lands, the box holds its blocks, the move is saved
        const { page, errors } = await open(browser, WIDE, { path: '/' });
        all.push(...errors);
        await center(page, 'lounge');
        const cw = await page.evaluate(() => document.querySelector('#lounge .board').clientWidth / 24);
        await drag(page, '#lg-meme > .panel-grab', -12 * cw, 0);
        await sleep(400);
        const held = () => page.evaluate(() => { const b = document.querySelector('#lounge > .panel-body'); return b.scrollHeight - b.clientHeight; });
        assert.deepEqual([(await cells(page, 'lg-meme'))[0], await held() <= 1, !!await page.evaluate(() => localStorage.getItem('board:home-lounge'))], [1, true, true], `meme carried left: ${await cells(page, 'lg-meme')}`);
        // Narrowed past 770.5px of box, its blocks stack: Spotify, the meme, the sites, the links
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        await sleep(600);
        await page.focus('#lounge > .panel-edge[data-dir="se"]');
        for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowLeft');
        await sleep(800);
        const stack = await page.evaluate(() => ['lg-intro', 'lg-spotify', 'lg-meme', 'lg-sites', 'lg-links'].map((id) => +document.getElementById(id).style.getPropertyValue('--y')));
        assert.deepEqual([stack.every((y, i) => !i || y > stack[i - 1]), await page.evaluate(() => getComputedStyle(document.querySelector('#lounge .board')).getPropertyValue('--cols').trim()), await held() <= 1], [true, '12', true], `narrowed: rows ${stack}`);
        return all.concat(errors);
    },
    async "Home: a block made taller holds what it holds in its middle (none of it out of reach when it's too tall), the Spotify player fills its block and stops at its own height, and a block narrowed keeps its sites and pills inside it"(browser) {
        const all = [];
        const { page, errors } = await open(browser, WIDE, { path: '/' });
        all.push(...errors);
        const corner = async (page, id, key, n, wait = 400) => { await page.focus(`#${id} > .panel-edge[data-dir="se"]`); for (let i = 0; i < n; i++) await page.keyboard.press(key); await sleep(wait); };
        // Slack, six rows taller: its address as far from the block's top as from its bottom
        await corner(page, 'az-slack', 'ArrowDown', 6);
        const gaps = await page.evaluate(() => { const b = document.querySelector('#az-slack > .panel-body').getBoundingClientRect(), r = document.querySelector('#az-slack .work-email').getBoundingClientRect(); return [r.top - b.top, b.bottom - r.bottom].map(Math.round); });
        assert.ok(gaps[0] > 40 && Math.abs(gaps[0] - gaps[1]) <= 1, `Slack's room above and below: ${gaps}`);
        // Too tall for its block (forced here: the engine never makes a block's body shorter than what it holds), what it holds starts at
        // the body's top, where it can be scrolled to, not centered past it
        const over = await page.evaluate(() => { const b = document.querySelector('#az-tools > .panel-body'); Object.assign(b.style, { flex: 'none', height: '120px', transition: 'none' }); // (the height would ease in)
            const top = b.firstElementChild.getBoundingClientRect().top - b.getBoundingClientRect().top; b.removeAttribute('style'); return Math.round(top); });
        assert.ok(over >= 0, `too tall for its block, the tools' first note sits ${over}px from the body's top`);
        // The player, made taller, then as short as it goes: it covers the block's body each time, and the block stops at the player's 500px
        const player = () => page.evaluate(() => { const b = document.querySelector('#lg-spotify > .panel-body').getBoundingClientRect(), f = document.querySelector('#lg-spotify iframe').getBoundingClientRect(); return [b.top, b.height, f.top, f.height].map(Math.round); });
        await corner(page, 'lg-spotify', 'ArrowDown', 8);
        const tall = await player();
        await corner(page, 'lg-spotify', 'ArrowUp', 20);
        const short = await player();
        assert.deepEqual([tall[1] > 600, tall[2] === tall[0] && tall[3] === tall[1], short[1] >= 500 && short[1] < 520, short[2] === short[0] && short[3] === short[1]], [true, true, true, true],
            `taller ${tall}, shortest ${short} (body top and height, player top and height)`);
        await page.context().close();
        // In every tier: at its default height what each block holds sits within half a row of its top (the room its rows round up to).
        // Narrowed by its own width, not its box's: nothing a block holds past its sides, no site or pill over another, the sites at every
        // column on the way down; at 901px a box keeps 24 columns, where a sixth of it would be narrower than a pill
        const fits = (page, id) => page.evaluate((id) => {
            const b = document.querySelector(`#${id} > .panel-body`), box = b.getBoundingClientRect();
            const past = [...b.querySelectorAll('*')].filter((n) => { const r = n.getBoundingClientRect(); return r.width && (r.left < box.left - 1 || r.right > box.right + 1); }).map((n) => n.className || n.tagName);
            const over = ['.site-card', '.pillBtn'].flatMap((q) => { const rs = [...b.querySelectorAll(q)].map((n) => n.getBoundingClientRect());
                return rs.flatMap((a, i) => rs.slice(i + 1).filter((c) => a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1)); }).length;
            return { width: Math.round(box.width), past, over, sideways: b.scrollWidth - b.clientWidth };
        }, id);
        for (const opts of [{ viewport: { width: 1440, height: 900 } }, { viewport: { width: 901, height: 900 } }, { ...PHONE, viewport: { width: 390, height: 900 } }]) {
            const width = opts.viewport.width;
            const { page, errors } = await open(browser, opts, { path: '/' });
            all.push(...errors);
            const low = await page.evaluate(() => [...document.querySelectorAll('.panel .board > .panel > .panel-body')].flatMap((b) => {
                const k = [...b.children].find((c) => c.checkVisibility() && getComputedStyle(c).position !== 'absolute');
                const d = k.getBoundingClientRect().top - parseFloat(getComputedStyle(k).marginTop) - b.getBoundingClientRect().top - parseFloat(getComputedStyle(b).paddingTop);
                return d > parseFloat(getComputedStyle(b.closest('.board')).gridAutoRows) / 2 + 0.5 ? [`${b.parentElement.id} ${Math.round(d)}px down`] : [];
            }));
            assert.deepEqual(low, [], `${width}px: what a block holds further than half a row from its top at its default height`);
            for (let step = 0, last; step < 24; step++) {
                const got = await fits(page, 'lg-sites');
                assert.deepEqual([got.past, got.over, got.sideways <= 1], [[], 0, true], `the sites at ${width}px, ${got.width}px wide: ${JSON.stringify(got)}`);
                if (got.width === last) break;
                last = got.width;
                await corner(page, 'lg-sites', 'ArrowLeft', 1, 0);
                await frames(page);
            }
            // At its narrowest a short name stays whole (a smaller label in a block under 16rem); on a phone's narrowest block it may break
            if (width > 640) assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#lg-sites .site-card span')].filter((s) => ['dos.zone', 'neal.fun'].includes(s.textContent.trim()))
                .filter((s) => { const r = document.createRange(); r.selectNodeContents(s); return new Set([...r.getClientRects()].map((l) => Math.round(l.top))).size > 1; }).map((s) => s.textContent.trim())), [], `${width}px: short names broken at the sites' narrowest`);
            for (const id of ['lg-links', 'az-tools', 'fin-intro']) {
                await corner(page, id, 'ArrowLeft', 24);
                const got = await fits(page, id);
                assert.deepEqual([got.past, got.over, got.sideways <= 1], [[], 0, true], `${id} at ${width}px, squeezed to ${got.width}px: ${JSON.stringify(got)}`);
            }
            await page.context().close();
        }
        return all;
    },
    async "a meme on a clear board wears its box's frame, its picture stretched to it, and Fit gives it the picture's shape inside the frame"(browser) {
        const all = [];
        // Every slot shows a picture three times as tall as it's wide
        const tall = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="300"><rect width="100" height="300" fill="oklch(0.6 0.2 300)"/></svg>';
        const route = [(url) => /meme-list\.json$|tall\.svg$/.test(url.pathname), (r) => (r.request().url().endsWith('.json')
            ? r.fulfill({ contentType: 'application/json', body: JSON.stringify(['/assets/memes/tall.svg']) }) : r.fulfill({ contentType: 'image/svg+xml', body: tall }))];
        const look = (page, id) => page.evaluate((id) => { const p = document.getElementById(id), c = getComputedStyle(p), slot = p.querySelector('.random-meme-fixed');
            return [c.borderTopWidth, c.paddingTop, getComputedStyle(slot, '::before').content, getComputedStyle(slot.querySelector('img')).objectFit]; }, id);
        const frost = (page, id) => page.evaluate((id) => getComputedStyle(document.getElementById(id)).backdropFilter, id);
        // Framed and unlabeled on the clear boards (the Lounge, a box on home), Nexus's glass board keeping its slot's label; the picture
        // stretched to its frame on each (Doshus, 2026-10-17)
        for (const [path, id, want] of [['/thelounge.html', 'meme-1', ['2px', '8px', 'none', 'fill']], ['/', 'lg-meme', ['2px', '8px', 'none', 'fill']], ['/nexus.html', 'meme-1', ['1px', '0px', '"MEDIA / NODE"', 'fill']]]) {
            const { page, errors } = await open(browser, WIDE, { path, route });
            all.push(...errors);
            await center(page, id); // its picture loads lazily
            await page.waitForFunction((id) => document.querySelector(`#${id} img`)?.complete, id);
            assert.deepEqual(await look(page, id), want, `${path} #${id}: border, padding, label, fit`);
            if (path === '/thelounge.html') {
                // Frosted over the sky, and not on a struggling machine (the board's lean mode, as board.js sets it)
                const rest = await frost(page, id);
                await page.evaluate(() => document.querySelector('.board').classList.add('is-lean'));
                assert.deepEqual([rest, await frost(page, id)], ['blur(10px)', 'none'], `${path} #${id}: frosted at rest, then lean`);
            }
            if (id !== 'lg-meme') { await page.context().close(); continue; }
            // Not frosted again inside a box that already frosts what's behind it
            assert.equal(await frost(page, id), 'none', 'the home meme block\'s own frost');
            // Narrowed to a quarter of its box, then fitted: its picture's shape, inside the frame, to within the row it rounds to
            await page.focus('#lg-meme > .panel-edge[data-dir="se"]');
            for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
            await sleep(400);
            await page.dblclick('#lg-meme > .panel-edge[data-dir="se"]');
            await sleep(600);
            const slot = await page.locator('#lg-meme > .random-meme-fixed').boundingBox();
            assert.ok(Math.abs(slot.height - slot.width * 3) <= 9, `fitted: the slot ${Math.round(slot.width)}x${Math.round(slot.height)}, its picture ${Math.round(slot.width)}x${Math.round(slot.width * 3)}`);
            await page.context().close();
        }
        return all;
    },
    async "Home: a block's links take their presses, its strip covering nothing, and on a touch screen its ✕ and corner wait for a finger to pick it"(browser) {
        const all = [];
        // Every control a block holds answers a press anywhere on it: no block's strip or dots are over it,
        // and on a touch screen, at rest, nothing of the board's (a pointer sees a ✕ or corner as it reaches the block)
        const covered = (page, touch) => page.evaluate(async (touch) => {
            const out = [];
            for (const n of document.querySelectorAll('.panel .board > .panel > :is(.panel-body, .random-meme-fixed) :is(a, button, input, label, #slackText)')) {
                n.scrollIntoView({ block: 'center' });
                await new Promise(requestAnimationFrame);
                const r = n.getBoundingClientRect();
                if (!r.width || !r.height) continue;
                for (const [fx, fy] of [[0.5, 0.5], [0.1, 0.15], [0.9, 0.15], [0.1, 0.85], [0.9, 0.85]]) {
                    const hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
                    const chrome = hit && !n.contains(hit) && (hit.matches('.panel-grab') ? hit : hit.closest(touch ? '.panel-dots, .panel-tools, .panel-edge' : '.panel-dots'));
                    if (chrome) { out.push(`${n.closest('.panel').id} "${n.textContent.trim().slice(0, 16)}" under its ${chrome.className.split(' ')[0]}`); break; }
                }
            }
            return out;
        }, touch);
        // A block's thin resize edges tile the gutter beside it: none overlaps a control it holds (they'd take its last
        // 5px), and a pointer can reach every one (a neighbour's mustn't cover it)
        const edged = (page) => page.evaluate(async () => {
            const out = [];
            for (const p of document.querySelectorAll('.panel .board > .panel')) {
                const edges = [...p.querySelectorAll(':scope > .panel-edge:not([data-dir="se"])')].filter((e) => e.checkVisibility());
                const body = p.querySelector(':scope > :is(.panel-body, .random-meme-fixed)').getBoundingClientRect(); // what scrolls past it is clipped (the card carousel)
                for (const n of p.querySelectorAll(':scope > :is(.panel-body, .random-meme-fixed) :is(a, button, input, label, #slackText)')) {
                    const c = n.getBoundingClientRect(), r = { left: Math.max(c.left, body.left), right: Math.min(c.right, body.right), top: Math.max(c.top, body.top), bottom: Math.min(c.bottom, body.bottom) };
                    for (const e of edges) { const b = e.getBoundingClientRect(); if (c.width && Math.min(r.right, b.right) - Math.max(r.left, b.left) > 0 && Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) > 0) out.push(`${p.id} "${n.textContent.trim().slice(0, 16)}" under its ${e.dataset.dir} edge`); }
                }
                for (const e of edges) {
                    e.scrollIntoView({ block: 'center', inline: 'nearest' });
                    await new Promise(requestAnimationFrame);
                    const b = e.getBoundingClientRect();
                    if (![0.25, 0.5, 0.75].some((fx) => [0.25, 0.5, 0.75].some((fy) => document.elementFromPoint(b.left + b.width * fx, b.top + b.height * fy) === e))) out.push(`${p.id}'s ${e.dataset.dir} edge out of reach`);
                }
            }
            return out;
        });
        for (const [opts, touch] of [[WIDE, false], [{ viewport: { width: 900, height: 800 } }, false], [{ viewport: { width: 768, height: 800 } }, false], [FOLD, true], [PHONE, true]]) {
            const { page, errors } = await open(browser, opts, { path: '/' });
            all.push(...errors);
            assert.deepEqual([...await covered(page, touch), ...touch ? [] : await edged(page)], [], `${opts.viewport.width}px`);
            await page.context().close();
        }
        // A pointer: a click on the Slack line (a plain span, clickable) and on a link at the top of their blocks lands on them;
        // a drag from the strip's band on a block's text moves it; one starting below the band selects text, as it did
        {
            const { page, errors } = await open(browser, WIDE, { path: '/' });
            all.push(...errors);
            await page.evaluate(() => { window.__clicked = []; addEventListener('click', (e) => { window.__clicked.push(e.target.closest('#slackText') ? 'slack' : e.target.closest('a') ? 'link' : e.target.className); e.preventDefault(); }, true); });
            for (const q of ['#slackText', '#lg-links a']) {
                await page.evaluate((q) => document.querySelector(q).scrollIntoView({ block: 'center' }), q);
                await sleep(150);
                const b = await page.locator(q).first().boundingBox();
                await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
                await sleep(100);
            }
            assert.deepEqual(await page.evaluate(() => window.__clicked), ['slack', 'link'], 'clicks on a block\'s content');
            await center(page, 'amazonian');
            const intro = await cells(page, 'az-intro');
            await drag(page, '#az-intro p', 0, 120);
            assert.ok((await cells(page, 'az-intro'))[1] > intro[1], `the Amazonian intro dragged down by its text: ${intro} -> ${await cells(page, 'az-intro')}`);
            const tools = await cells(page, 'az-tools');
            const t = await page.locator('#az-tools .tool-description').nth(2).boundingBox();
            await page.mouse.move(t.x + 10, t.y + t.height / 2);
            await page.mouse.down();
            await page.mouse.move(t.x + 200, t.y + t.height / 2, { steps: 8 });
            await page.mouse.up();
            await sleep(200);
            assert.deepEqual([await cells(page, 'az-tools'), (await page.evaluate(() => getSelection().toString())).length > 5], [tools, true], 'a drag on the tool notes below the band selects their text');
            await page.context().close();
        }
        // A finger: held on a block it lifts (selecting nothing meanwhile); let go, the block is picked, its ✕ shown
        // and live, and a tap on it hides the block. A press elsewhere unpicks one
        {
            const { ctx, page, errors } = await open(browser, PHONE, { path: '/' });
            all.push(...errors);
            const cdp = await ctx.newCDPSession(page);
            const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
            const close = (id) => page.evaluate((id) => {
                const p = document.getElementById(id), c = p.querySelector(':scope > .panel-grab .panel-close'), r = c.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                return { picked: p.classList.contains('is-picked'), shown: getComputedStyle(c.parentElement).opacity, live: !!hit?.closest('.panel-close') && p.contains(hit), at: { x: r.left + r.width / 2, y: r.top + r.height / 2 } };
            }, id);
            // A finger-sized touch (Chromium moves one onto whatever answers a press nearby); a link it ends on doesn't navigate
            const hold = async (at, mid) => { await touch('touchStart', [{ ...at, radiusX: 12, radiusY: 12 }]); await sleep(200); const during = await mid?.(); await sleep(500); await touch('touchEnd', []); await sleep(300); return during; };
            await page.evaluate(() => addEventListener('click', (e) => e.target.closest('a') && e.preventDefault(), true));
            await center(page, 'lg-links');
            const rest = await close('lg-links');
            const dots = await page.evaluate(() => { const r = document.querySelector('#lg-links > .panel-dots').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
            const selecting = await hold(dots, () => page.evaluate(() => getComputedStyle(document.getElementById('lg-links')).userSelect));
            const picked = await close('lg-links');
            await touch('touchStart', [picked.at]);
            await touch('touchEnd', []);
            await sleep(400);
            const hidden = await page.evaluate(() => !document.getElementById('lg-links').checkVisibility());
            assert.deepEqual([rest.picked, rest.shown, rest.live, selecting, picked.picked, picked.shown, picked.live, hidden], [false, '0', false, 'none', true, '1', true, true], 'the Lounge links at rest, held, picked, then their ✕ tapped');
            // The Slack line, held by its icon and let go, then a press on the page's hero
            await center(page, 'az-slack');
            const icon = await page.locator('#az-slack .slack-icon').boundingBox();
            await hold({ x: icon.x + icon.width / 2, y: icon.y + icon.height / 2 });
            const slack = await close('az-slack');
            await page.evaluate(() => scrollTo(0, 0));
            await sleep(200);
            await touch('touchStart', [{ x: 20, y: 200 }]);
            await touch('touchEnd', []);
            await sleep(200);
            await center(page, 'az-slack');
            const after = await close('az-slack');
            assert.deepEqual([slack.picked, slack.live, after.picked, after.live], [true, true, false, false], 'the Slack line picked, then a press elsewhere');
            await page.context().close();
        }
        return all;
    },
    async "a block's press ends wherever the pointer goes, a finger let go clicks nothing, and a touch laptop's tap finds no unseen ✕"(browser) {
        const all = [];
        const pressed = () => document.querySelector('.panel.is-pressed, .board.is-arranging') !== null;
        // A mouse flicked out of a block's band and let go outside: nothing stays armed, so pointing at the block again carries nothing
        {
            const { page, errors } = await open(browser, WIDE, { path: '/' });
            all.push(...errors);
            await center(page, 'lounge');
            const before = await cells(page, 'lg-intro');
            const t = await page.locator('#lg-intro p').boundingBox();
            let x = t.x + 40, y = t.y + t.height / 2;
            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.move(x, y - 100); // one event, out of the block
            await page.mouse.up();
            await sleep(300);
            await page.mouse.move(x + 30, y + 10, { steps: 5 });
            await sleep(300);
            assert.deepEqual([await page.evaluate(pressed), await cells(page, 'lg-intro')], [false, before], 'the Lounge intro after a flick out and back');
            // A release the page never saw (the next move has no button down): the press ends, carrying nothing on that move
            // (pressed mid-screen: near its top or bottom a carried block scrolls the page, and moves with it)
            const cdp = await page.context().newCDPSession(page);
            await center(page, 'lg-intro');
            ({ x, y } = await page.locator('#lg-intro p').boundingBox().then((t) => ({ x: t.x + 40, y: t.y + t.height / 2 })));
            await page.mouse.move(x, y);
            await page.mouse.down();
            await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 60, y: y + 40, buttons: 0 });
            await sleep(200);
            const unseen = await page.evaluate(pressed);
            await page.mouse.up();
            // Carried by one jump, then a change under the gesture (another box's board told the page it grew): it stays where the jump left it
            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.move(x + 120, y + 90);
            await sleep(150);
            const carried = await page.evaluate(() => document.getElementById('lg-intro').style.translate);
            await page.evaluate(() => document.querySelector('#finance .board').dispatchEvent(new CustomEvent('boardchange', { bubbles: true, detail: 0 })));
            await sleep(150);
            const told = await page.evaluate(() => document.getElementById('lg-intro').style.translate);
            await page.keyboard.press('Escape');
            await page.mouse.up();
            assert.deepEqual([unseen, told], [false, carried], `a press whose release went unseen, and a carried block when the page is told of a change: ${JSON.stringify([unseen, told, carried])}`);
            // Spotify's dots sit on its frame, its one pointer handle: a quick first move onto the frame still lifts it
            await center(page, 'lg-spotify');
            const d = await page.locator('#lg-spotify > .panel-dots').boundingBox();
            await page.mouse.move(d.x + d.width / 2, d.y + 6);
            await page.mouse.down();
            for (const dy of [25, 60]) { await page.mouse.move(d.x + d.width / 2, d.y + 6 + dy); await sleep(16); }
            await sleep(150);
            const lifted = await page.evaluate(() => document.querySelector('#lounge .board').classList.contains('is-arranging'));
            await page.keyboard.press('Escape');
            await page.mouse.up();
            assert.equal(lifted, true, 'Spotify lifted by its dots, the first move landing on its frame');
            await page.context().close();
        }
        // A finger held still and let go: the click it fires reaches nothing, not the ✕ its pick just made live under it
        // (held where that ✕ sits) nor the Slack line. A finger's drag fires none, so a real tap right after it still lands
        {
            const { ctx, page, errors } = await open(browser, PHONE, { path: '/' });
            all.push(...errors);
            const cdp = await ctx.newCDPSession(page);
            const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
            await page.evaluate(() => { window.__hit = []; for (const q of ['#lg-links a', '#slackText']) document.querySelector(q).addEventListener('click', (e) => { e.preventDefault(); window.__hit.push(q); }); });
            const at = (q) => page.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, radiusX: 12, radiusY: 12 }; }, q);
            const held = ['lg-meme', 'lg-sites', 'az-tools', 'fin-intro'];
            for (const [id, q] of [...held.map((id) => [id, `#${id} > .panel-grab .panel-close`]), ['az-slack', '#slackText']]) {
                await center(page, id);
                await touch('touchStart', [await at(q)]);
                await sleep(700);
                await touch('touchEnd', []);
                await sleep(500);
            }
            const after = await page.evaluate((held) => [window.__hit.splice(0), held.filter((id) => !document.getElementById(id).checkVisibility())], held);
            await center(page, 'lg-intro');
            const d = await at('#lg-intro > .panel-dots');
            await touch('touchStart', [d]);
            await sleep(700);
            for (const dy of [40, 80, 120]) { await touch('touchMove', [{ ...d, y: d.y + dy }]); await sleep(60); }
            await touch('touchEnd', []);
            await page.evaluate(() => document.getElementById('lg-links').scrollIntoView({ block: 'center' })); // at once: inside the 400ms a let-go finger's click is waited for
            const pill = await at('#lg-links a');
            await touch('touchStart', [pill]);
            await touch('touchEnd', []);
            await sleep(300);
            after.push(await page.evaluate(() => window.__hit));
            assert.deepEqual(after, [[], [], ['#lg-links a']], 'clicks after holds, the blocks they hid, and a tap on a link just after a drag');
            await page.context().close();
        }
        // A touch laptop (a pointer that hovers, and a finger; a page alone can't emulate both): a tap where a block's unseen ✕ sits reaches what's under it
        {
            const laptop = await chromium.launch({ ...LAUNCH, args: [...LAUNCH.args, '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=2,availablePointerTypes=6'] });
            const { ctx, page, errors } = await open(laptop, { viewport: { width: 1440, height: 900 } }, { path: '/' }); // (hasTouch would report no hover; a CDP touch needs none)
            all.push(...errors);
            const cdp = await ctx.newCDPSession(page);
            const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
            const hid = [];
            for (const id of ['lg-intro', 'az-intro', 'lg-sites']) {
                await center(page, id);
                const c = await page.evaluate((id) => { const r = document.querySelector(`#${id} > .panel-grab .panel-close`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, radiusX: 12, radiusY: 12 }; }, id);
                await touch('touchStart', [c]);
                await touch('touchEnd', []);
                await sleep(400);
                if (!await page.evaluate((id) => document.getElementById(id).checkVisibility(), id)) hid.push(id);
            }
            const hover = await page.evaluate(() => matchMedia('(hover: hover)').matches), fingered = await page.evaluate(() => document.documentElement.hasAttribute('data-touch'));
            await page.mouse.move(720, 450); // over the sites, centered last (a frame keeps a mouse's moves from the page)
            await page.mouse.move(740, 460);
            const moused = await page.evaluate(() => document.documentElement.hasAttribute('data-touch'));
            await laptop.close();
            assert.deepEqual([hover, hid, fingered, moused], [true, [], true, false], `a tap where a block's ✕ sits unseen, and the finger's mode once a mouse moves: ${JSON.stringify([hover, hid, fingered, moused])}`);
        }
        return all;
    },
    async "a box's blocks: a window swept across measures them once it rests, and a box resized into their phone tier holds them while the pointer does"(browser) {
        const all = [];
        // Swept within the wide tier, 35 steps: each inner board reads its layout a handful of times, not once a step (1 to 3
        // seen; 6 leaves a slow machine room and is still far under the 35 a read per step would make)
        {
            const init = () => { window.__reads = {}; const get = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { window.__reads[k] = (window.__reads[k] ?? 0) + 1; return get.call(this, k); }; };
            const { page, errors } = await open(browser, WIDE, { path: '/', init });
            all.push(...errors);
            await steady(page);
            await page.evaluate(() => { window.__reads = {}; });
            for (let w = 1440; w >= 1100; w -= 10) { await page.setViewportSize({ width: w, height: 900 }); await sleep(16); }
            await steady(page);
            const reads = await page.evaluate(() => Object.entries(window.__reads).filter(([k]) => /^board:home-/.test(k)));
            assert.ok(reads.length && reads.every(([, n]) => n <= 6), `inner boards' reads over the sweep: ${JSON.stringify(reads)}`);
            await page.context().close();
        }
        // The Lounge box narrowed by its edge into its blocks' phone tier and held there: it holds its blocks, nothing scrolling inside
        {
            const { page, errors } = await open(browser, WIDE, { path: '/' });
            all.push(...errors);
            await center(page, 'lounge');
            const e = await page.locator('#lounge > .panel-edge[data-dir="e"]').boundingBox(), x = e.x + e.width / 2, y = e.y + e.height / 2;
            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.move(x - 650, y, { steps: 10 });
            await sleep(1200);
            const held = await page.evaluate(() => { const box = document.getElementById('lounge'), body = box.querySelector(':scope > .panel-body'), board = body.querySelector('.board');
                const last = Math.max(...[...board.querySelectorAll(':scope > .panel')].filter((p) => !p.hidden).map((p) => p.getBoundingClientRect().bottom));
                return { cols: getComputedStyle(board).getPropertyValue('--cols').trim(), inside: Math.round(body.scrollHeight - body.clientHeight), past: Math.round(last - body.getBoundingClientRect().bottom) }; });
            await page.mouse.up();
            assert.deepEqual([held.cols, held.inside <= 1, held.past <= 0], ['6', true, true], `the Lounge box held at its blocks' phone tier: ${JSON.stringify(held)}`);
            await page.context().close();
        }
        return all;
    },
    async "Home: the Amazonian box's blocks sit where its content did"(browser) {
        const all = [];
        // Tops of the intro, the Slack line and the tools from the box's content edge, on the page before (its toggle hidden: no work links here)
        const was = { 1440: [0, 42, 105], 901: [0, 42, 105], 390: [0, 85, 147] };
        for (const opts of [{ viewport: { width: 1440, height: 900 } }, { ...FOLD, viewport: { width: 901, height: 700 } }, { ...PHONE, viewport: { width: 390, height: 700 } }]) {
            const { page, errors } = await open(browser, opts, { path: '/' });
            all.push(...errors);
            const w = opts.viewport.width;
            // Each read where it would sit at its block's top: a block holds what it holds in its middle, in the room its rows round up to
            const got = await page.evaluate(() => { const b = document.querySelector('#amazonian > .panel-body'), top = b.getBoundingClientRect().top + parseFloat(getComputedStyle(b).paddingTop);
                const lift = (n) => { const body = n.closest('.panel-body'), k = [...body.children].find((c) => c.checkVisibility() && getComputedStyle(c).position !== 'absolute');
                    return k.getBoundingClientRect().top - parseFloat(getComputedStyle(k).marginTop) - body.getBoundingClientRect().top - parseFloat(getComputedStyle(body).paddingTop); };
                return { tops: ['#az-intro p', '#az-slack .work-email', '#az-tools .tool-description'].map((q) => { const n = document.querySelector(q); return Math.round(n.getBoundingClientRect().top - top - lift(n)); }), inside: b.scrollHeight - b.clientHeight }; });
            assert.deepEqual([got.tops.map((t, i) => Math.abs(t - was[w][i]) <= 8), got.inside <= 1], [[true, true, true], true], `${w}px: ${JSON.stringify(got)} (tops were ${was[w]})`);
            await page.context().close();
        }
        return all;
    },
    async "Home: a box can't be made smaller than what it holds, and the card's frame follows its cells as it's resized"(browser) {
        const { page, errors } = await open(browser, { viewport: { width: 1440, height: 900 } }, { path: '/' });
        const state = (id) => page.evaluate((id) => {
            const p = document.getElementById(id), r = p.getBoundingClientRect(), g = p.parentElement.querySelector(':scope > .board-ghost'), b = p.querySelector(':scope > .panel-body'), h2 = p.querySelector('.panel-head > h2');
            const kids = [...b.children].filter((k) => getComputedStyle(k).position !== 'absolute');
            let broken = false;
            if (h2) for (const walk = document.createTreeWalker(h2, NodeFilter.SHOW_TEXT); walk.nextNode();) for (const m of walk.currentNode.textContent.matchAll(/\S+/g)) {
                const t = document.createRange(); t.setStart(walk.currentNode, m.index); t.setEnd(walk.currentNode, m.index + m[0].length);
                broken ||= new Set([...t.getClientRects()].map((l) => Math.round(l.top))).size > 1;
            }
            return { right: Math.round(r.right), ghost: g.hidden ? null : Math.round(g.getBoundingClientRect().right), below: g.hidden ? null : Math.round(g.getBoundingClientRect().bottom - r.bottom), spill: Math.round(Math.max(...kids.map((k) => k.getBoundingClientRect().bottom)) - r.bottom), inside: b.scrollHeight - b.clientHeight, broken };
        }, id);
        const resize = async (id, dir, dx, dy) => {
            await center(page, id);
            const e = await page.locator(`#${id} > .panel-edge[data-dir="${dir}"]`).boundingBox();
            await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
            await page.mouse.down();
            await page.mouse.move(e.x + e.width / 2 + dx, e.y + e.height / 2 + dy, { steps: 10 });
            await frames(page);
            const during = await state(id);
            await page.mouse.up();
            await sleep(400);
            return [during, await state(id)];
        };
        // Made wider: the live edge, the ghost and where it lands agree (the card used to snap back to 900px)
        const [wide, landed] = await resize('socials', 'e', 200, 0);
        assert.deepEqual([wide.right, landed.right], [wide.ghost, wide.ghost], 'the card made wider: live edge, ghost, landed edge');
        // Squeezed from its corner as far as it goes: its title keeps its words, nothing spills or scrolls inside
        for (const id of ['socials', 'promo']) {
            const [during, after] = await resize(id, 'se', -1100, -700);
            assert.deepEqual([during.broken, during.spill <= 2, after.broken, after.spill <= 0, after.inside <= 1], [false, true, false, true, true], `${id} squeezed: [title broken mid-drag, holding all mid-drag, title broken, held all it holds, nothing scrolls inside] ${JSON.stringify([during, after])}`);
        }
        // Narrowed from its side, Finance's buttons and chart wrap taller, and it grows as the edge moves,
        // its ghost with it; made wide again it hugs what it holds again, no blank band
        const start = await cells(page, 'finance');
        const [fin, finLanded] = await resize('finance', 'e', -1100, 0);
        assert.deepEqual([fin.broken, fin.spill <= 2, fin.below >= 0 && fin.below < 40, finLanded.broken, finLanded.inside <= 1], [false, true, true, false, true], `Finance narrowed: [title broken mid-drag, holding all mid-drag, ghost holding it mid-drag, title broken, nothing scrolls inside] ${JSON.stringify([fin, finLanded])}`);
        const [back] = await resize('finance', 'e', 1100, 0);
        assert.deepEqual([await cells(page, 'finance'), back.below >= 0 && back.below < 40], [start, true], `Finance made wide again: [its cells, ghost holding it mid-drag] ${JSON.stringify(back)}`);
        // And by the keyboard, a column a press: each press that wraps what it holds taller grows it to hold it
        await center(page, 'amazonian');
        await page.focus('#amazonian > .panel-edge[data-dir="se"]');
        const presses = [];
        for (let i = 0; i < 24; i++) {
            await page.keyboard.press('ArrowLeft');
            await sleep(250);
            presses.push({ w: (await cells(page, 'amazonian'))[2], ...await state('amazonian') });
            if (presses.length > 1 && presses.at(-1).w === presses.at(-2).w) break;
        }
        const narrow = presses.at(-1);
        for (let i = 0; i < 24; i++) await page.keyboard.press('ArrowRight'); // wide again, it hugs what it holds again
        await sleep(400);
        assert.deepEqual(await cells(page, 'amazonian'), [1, 59, 24, 17], 'Amazonian made wide again by keys');
        for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown'); // taller than it holds, as asked
        await sleep(400);
        assert.equal((await cells(page, 'amazonian'))[3], 20, 'Amazonian made taller by keys');
        for (let i = 0; i < 24; i++) await page.keyboard.press('ArrowUp');
        await sleep(400);
        const amz = await state('amazonian');
        assert.deepEqual([narrow.broken, presses.filter((s) => s.inside > 1).map((s) => `${s.w} wide: ${s.inside}px`), amz.inside <= 1], [false, [], true], `Amazonian squeezed by keys: [title broken at its narrowest, presses it scrolled inside after, scrolls inside made shortest]`);
        return errors;
    },
    async "a panel marked data-tall on a board that isn't is as tall as what it holds, and a visitor can stretch it there past the screen"(browser) {
        const all = [];
        const devcore = (page) => page.evaluate(() => { const p = document.getElementById('dev-core'), b = p.querySelector('.panel-body');
            return { h: +p.style.getPropertyValue('--h'), past: p.offsetHeight > innerHeight, over: b.scrollHeight - b.clientHeight }; });
        // Nexus's Dev Core holds more than these screens: it shows whole, where the board's other panels stop at a screen
        for (const opts of [{ viewport: { width: 1440, height: 900 } }, { ...FOLD, viewport: { width: 901, height: 700 } }, PHONE]) {
            const { page, errors } = await open(browser, opts);
            all.push(...errors);
            const d = await devcore(page);
            assert.deepEqual([d.past, d.over <= 1], [true, true], `${opts.viewport.width}px: Dev Core ${d.past ? '' : 'no taller than the screen, '}scrolls ${d.over}px inside`);
            const capped = await page.evaluate(() => [...document.querySelectorAll('.board > .panel:not(#dev-core)')].filter((p) => p.offsetHeight > innerHeight + 1).map((p) => p.id));
            assert.deepEqual(capped, [], `${opts.viewport.width}px: panels taller than the screen`);
            await page.context().close();
        }
        // Made shorter than the screen, then stretched: it passes the screen and stops where what it holds ends
        const { page, errors } = await open(browser, { viewport: { width: 1440, height: 900 } });
        all.push(...errors);
        const whole = (await devcore(page)).h;
        await page.focus('#dev-core .panel-edge[data-dir="se"]');
        for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowUp');
        assert.ok((await devcore(page)).over > 1, 'shrunk: nothing scrolls inside');
        for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowDown');
        await sleep(300);
        const d = await devcore(page);
        assert.deepEqual([d.h, d.past, d.over <= 1], [whole, true, true], `stretched to ${d.h} rows (whole: ${whole}), scrolling ${d.over}px`);
        return all;
    },
    async "on a tall board a panel is as tall as what it holds, past one screen, so nothing scrolls inside it"(browser) {
        const all = [];
        for (const opts of [PHONE, { ...FOLD, viewport: { width: 901, height: 700 } }]) {
            const { page, errors } = await open(browser, opts, { path: '/thelounge.html' });
            all.push(...errors);
            const picks = await page.evaluate(() => { const p = document.getElementById('picks'), b = p.querySelector('.panel-body'); return { tall: p.offsetHeight > innerHeight, over: b.scrollHeight - b.clientHeight }; });
            assert.ok(picks.tall, `${opts.viewport.width}px: Picks is no taller than the screen`);
            assert.ok(picks.over <= 1, `${opts.viewport.width}px: Picks scrolls ${picks.over}px inside`);
            // Hidden, then the page reloaded, then brought back: still as tall as what it holds
            await page.evaluate(() => document.querySelector('#picks .panel-close').click());
            await page.reload({ waitUntil: 'load' });
            await sleep(600);
            await page.evaluate(() => [...document.querySelectorAll('.board-menu button')].find((b) => b.textContent.includes('Picks')).click());
            await sleep(300);
            const back = await page.evaluate(() => { const b = document.querySelector('#picks .panel-body'); return b.scrollHeight - b.clientHeight; });
            assert.ok(back <= 1, `${opts.viewport.width}px: brought back after a reload, Picks scrolls ${back}px inside`);
            await page.context().close();
        }
        return all;
    },
    async 'on a tall board, a resize while the panel still glides carries on from where it is'(browser) {
        const { page, errors } = await open(browser, WIDE, { path: '/thelounge.html', motion: 'no-preference' });
        await center(page, 'sandspiel');
        // Both presses and both readings in the page, so a busy machine can't stretch the gap between them
        const [before, after] = await page.evaluate(() => new Promise((done) => {
            const corner = document.querySelector('#sandspiel .panel-edge[data-dir="se"]'), width = () => document.getElementById('sandspiel').getBoundingClientRect().width;
            const press = () => corner.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
            press();
            setTimeout(() => { const a = width(); press(); done([a, width()]); }, 100);
        }));
        assert.ok(Math.abs(after - before) < 8, `it jumped ${Math.round(before - after)}px`);
        return errors;
    },
    async 'Lounge: the hero sits where it did, the bar under it taking none of its room, and a #link lands with room above'(browser) {
        const { page, errors } = await open(browser, WIDE, { path: '/thelounge.html' });
        const top = () => page.evaluate(() => document.querySelector('.hero h1').getBoundingClientRect().top);
        const withBar = await top();
        await page.evaluate(() => document.querySelector('[data-board-bar="lounge"]').style.setProperty('display', 'none'));
        assert.equal(withBar, await top(), 'the bar moves the hero');
        await page.goto(base + '/thelounge.html#discord', { waitUntil: 'load' });
        await sleep(400);
        const room = await page.evaluate(() => document.querySelector('#discord .section-title').getBoundingClientRect().top);
        assert.ok(room >= 48, `#discord's title lands ${Math.round(room)}px from the top`);
        return errors;
    },
    async "a malformed smaller tier's cells flow that tier instead"(browser) {
        // Spoilt as the parser adds it, before board.js reads it
        const { page, errors } = await open(browser, FOLD, { path: '/thelounge.html', init: () => {
            new MutationObserver((_, o) => { const d = document.getElementById('discord'); if (d) { d.setAttribute('data-mid', '1 2 12'); o.disconnect(); } }).observe(document, { childList: true, subtree: true });
        } });
        const bad = await page.evaluate(() => [...document.querySelectorAll('.board > .panel')].filter((p) => ['x', 'y', 'w', 'h'].some((k) => !(+p.style.getPropertyValue('--' + k) > 0))).map((p) => p.id));
        assert.deepEqual(bad, [], 'cells that are not numbers');
        const half = await page.evaluate(() => ['sites-mind-bending', 'sites-archives'].map((id) => +document.getElementById(id).style.getPropertyValue('--w')));
        assert.deepEqual(half, [6, 6], 'the tier did not flow');
        return errors;
    },
    async "a clear board frames a hovered panel, leaves nothing behind a click, hides its grab dots at rest, and a carried panel the page dressed still glows"(browser) {
        const { page, errors } = await open(browser, WIDE, { path: '/thelounge.html' });
        const state = (id) => page.evaluate((id) => { const p = document.getElementById(id), s = getComputedStyle(p);
            return { border: s.borderTopColor, glow: s.boxShadow, tools: getComputedStyle(p.querySelector('.panel-tools')).opacity, dots: getComputedStyle(p.querySelector('.panel-dots'), '::before').opacity }; }, id);
        await center(page, 'interesting');
        await page.click('#interesting .filter-btn[data-category="all"]'); // a click: focus without a visible ring
        await page.mouse.move(2, 2);
        await settled(page.locator('#interesting'), true);
        const after = await state('interesting');
        assert.match(after.border, /\/ 0\)$|, 0\)$|transparent/, `a frame left behind by a click: ${after.border}`);
        assert.equal(after.tools, '0', 'controls left behind by a click');
        assert.equal(after.dots, '0', 'grab dots at rest');
        const head = await page.locator('#interesting .panel-head').boundingBox();
        await page.mouse.move(head.x + 200, head.y + 20);
        await settled(page.locator('#interesting'), true);
        const hovered = await state('interesting');
        assert.doesNotMatch(hovered.border, /\/ 0\)$|, 0\)$|transparent/, 'no frame when hovered');
        assert.equal(hovered.tools, '1', 'no controls when hovered');
        await page.mouse.move(2, 2);
        // Carried, a box the page dressed (a category, a meme) takes the board's full border and glow
        for (const id of ['sites-weird', 'meme-3']) {
            await center(page, id);
            const box = await page.locator(`#${id}`).boundingBox();
            await page.mouse.move(box.x + 60, box.y + 14);
            await page.mouse.down();
            await page.mouse.move(box.x + 70, box.y + 24);
            await page.mouse.move(box.x + 90, box.y + 60, { steps: 4 });
            const held = await state(id);
            await page.keyboard.press('Escape');
            await page.mouse.up();
            assert.match(held.glow, /0px 0px 0px 2px/, `${id}: no ring while carried: ${held.glow}`);
            assert.doesNotMatch(held.border, /\/ 0\.\d+\)$/, `${id}: a faint border while carried: ${held.border}`);
        }
        return errors;
    },
    async 'a clear board shows the sky at rest, a frame when a panel is reached for, and a glow while one is held'(browser) {
        const { ctx, page, errors } = await open(browser, { viewport: { width: 1300, height: 900 }, isMobile: true, hasTouch: true }, { path: '/thelounge.html' });
        assert.equal(await page.evaluate(() => matchMedia('(hover: none)').matches), true, 'not a touch screen');
        await center(page, 'game');
        const look = () => page.evaluate(() => { const s = getComputedStyle(document.getElementById('game')); return { fill: s.backgroundColor, border: s.borderTopColor, glow: s.boxShadow }; });
        await page.mouse.move(2, 2);
        await settled(page.locator('#game'), false);
        const rest = await look();
        assert.match(rest.fill, /\/ 0\)$|, 0\)$|transparent/, `a fill at rest: ${rest.fill}`);
        assert.match(rest.border, /\/ 0\)$|, 0\)$|transparent/, `a frame at rest: ${rest.border}`);
        // At rest on a touch screen the controls and grab dots are faint
        const faint = await page.evaluate(() => ['.panel-tools', '.panel-edge[data-dir="se"]'].map((q) => getComputedStyle(document.querySelector(`#game ${q}`)).opacity).concat(getComputedStyle(document.querySelector('#game .panel-dots'), '::before').opacity));
        assert.deepEqual(faint, ['0.35', '0.35', '0.35'], 'touch controls at rest');
        // A tap leaves no frame (its hover would stick)
        const head = await page.locator('#game .panel-head').boundingBox();
        await page.touchscreen.tap(head.x + 300, head.y + 20);
        await settled(page.locator('#game'), false);
        const hovered = await look();
        assert.match(hovered.border, /\/ 0\)$|, 0\)$|transparent/, `a frame left by a tap: ${hovered.border}`);
        // A finger resting on the head: the panel charges a glow as it swells
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: head.x + 300, y: head.y + 20 }] });
        await sleep(250);
        const held = await page.evaluate(() => document.getElementById('game').classList.contains('is-holding'));
        await settled(page.locator('#game'), false);
        const glow = (await look()).glow;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        assert.ok(held, 'the hold never began');
        assert.ok(glow !== 'none' && glow !== hovered.glow, `no glow of its own while held: ${glow}`);
        return errors;
    },
    async "in a tier the engine flows, a list panel keeps its wide height"(browser) {
        // The Lounge without its own mid cells, as the parser adds each panel and before board.js reads it
        const { page, errors } = await open(browser, FOLD, { path: '/thelounge.html', init: () => {
            new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((n) => n.matches?.('.panel') && n.removeAttribute('data-mid')))).observe(document, { childList: true, subtree: true });
        } });
        const got = await page.evaluate(() => ['sites-fun', 'sites-beer'].map((id) => { const p = document.getElementById(id); return `${id} ${p.style.getPropertyValue('--h')} ${p.hasAttribute('data-mid') ? 'mid' : ''}`; }));
        const want = await page.evaluate(() => ['sites-fun', 'sites-beer'].map((id) => `${id} ${document.getElementById(id).dataset.h} `));
        assert.deepEqual(got, want);
        return errors;
    },
    async "a list panel (data-scroll) keeps its cells' height, shows more when made taller, and Fit shows it all"(browser) {
        const { page, errors } = await open(browser, WIDE, { path: '/thelounge.html' });
        await center(page, 'sites-fun');
        const look = () => page.evaluate(() => { const p = document.getElementById('sites-fun'), b = p.querySelector('.panel-body'), box = b.getBoundingClientRect();
            return { h: +p.style.getPropertyValue('--h'), over: b.scrollHeight - b.clientHeight, shown: [...b.querySelectorAll('.site-link')].filter((a) => a.getBoundingClientRect().bottom <= box.bottom).length }; }); // shown whole
        const start = await look();
        assert.equal(start.h, await page.evaluate(() => +document.getElementById('sites-fun').dataset.h), 'grown past its cells');
        assert.ok(start.over > 0, 'it holds no more than it shows');
        await page.focus('#sites-fun .panel-edge[data-dir="se"]');
        for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
        await frames(page);
        const taller = await look();
        assert.ok(taller.shown > start.shown, `taller, it shows ${taller.shown} links (${start.shown} before)`);
        await page.keyboard.press('Enter'); // Fit: everything it holds
        await frames(page);
        assert.ok((await look()).over <= 1, 'Fit leaves links scrolled out of view');
        return errors;
    },
    async "a finger resting on a panel's title, wobbling as fingers do, still lifts it"(browser) {
        const all = [];
        for (const [path, id] of [['/nexus.html', 'stack'], ['/thelounge.html', 'picks']]) { // each shorter than the window, so its title is on screen
            const { ctx, page, errors } = await open(browser, { viewport: { width: 1300, height: 900 }, hasTouch: true }, { path });
            all.push(...errors);
            await center(page, id);
            const cdp = await ctx.newCDPSession(page);
            const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
            // On the title's text: the finger's implicit capture lands on the h2, and the hold hands it to the head
            const at = await page.evaluate((id) => { const r = document.createRange(); r.selectNodeContents(document.querySelector(`#${id} > .panel-head h2`)); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, id);
            await touch('touchStart', [at]); await sleep(150);
            await touch('touchMove', [{ x: at.x + 2, y: at.y + 1 }]); await sleep(150);
            await touch('touchMove', [{ x: at.x + 1, y: at.y + 2 }]); await sleep(500);
            await touch('touchMove', [{ x: at.x + 160, y: at.y }]); await sleep(150);
            assert.equal(await arranging(page), true, `${path}: the panel dropped with the finger still down`);
            await touch('touchEnd', []); await sleep(300);
            assert.equal(await arranging(page), false, `${path}: lifting the finger ended nothing`);
            await page.context().close();
        }
        return all;
    },
    async 'Lounge: a category the filter left out is measured like the rest, so Show All brings it back whole'(browser) {
        const all = [];
        for (const opts of [PHONE, FOLD, { viewport: { width: 1100, height: 800 } }]) {
            // Read once its cells hold still: content arriving (the roster's fallback, the game's frame) re-measures
            const stillCells = async (page) => { let last = '', same = 0; for (let i = 0; i < 40 && same < 4; i++) { const now = String(await cells(page, 'sites-fun')); same = now === last ? same + 1 : 0; last = now; await sleep(100); } return cells(page, 'sites-fun'); };
            const fresh = await open(browser, opts, { path: '/thelounge.html' });
            const want = await stillCells(fresh.page);
            await fresh.ctx.close();
            // A visitor who left it on Weird Internet: the filter applies at load, before the board measures again
            const { page, errors } = await open(browser, opts, { path: '/thelounge.html', init: () => { try { localStorage.setItem('loungeFilter', 'weird'); } catch { /* the game's frame, an error page here */ } } });
            all.push(fresh.errors, ...errors);
            await page.evaluate(() => document.querySelector('.filter-btn[data-category="all"]').click());
            // Its own width and height (where it sits also follows panels above it, measured as their content arrives)
            const [, , ...got] = await stillCells(page);
            assert.deepEqual(got, want.slice(2), `${opts.viewport.width}px`);
            await page.context().close();
        }
        return all.flat();
    },
    async "Lounge: a big title's collapsed bar holds its whole head, under reduced motion too"(browser) {
        // Reduced motion gives every property a 0.01ms transition, so the head reads its open size right after the class
        const { page, errors } = await open(browser, FOLD, { path: '/thelounge.html' });
        await page.evaluate(() => ['picks', 'sandspiel', 'sites-fun'].forEach((id) => document.querySelector(`#${id} > :is(.panel-head, .panel-grab) .panel-collapse`).click()));
        await frames(page);
        const spill = await page.evaluate(() => ['picks', 'sandspiel', 'sites-fun'].flatMap((id) => {
            const p = document.getElementById(id), head = p.querySelector('.panel-head').getBoundingClientRect(), box = p.getBoundingClientRect();
            return head.bottom > box.bottom - 1 ? [`${id}: head ${(head.bottom - box.bottom + 1).toFixed(1)}px past its bar`] : [];
        }));
        assert.deepEqual(spill, []);
        return errors;
    },
    async "Lounge: the filter fades the other categories where they sit, and one comes up when pointed at"(browser) {
        const { page, errors } = await open(browser, WIDE, { path: '/thelounge.html' });
        const read = () => page.evaluate(() => [...document.querySelectorAll('.category-box')].map((p) => { const r = p.getBoundingClientRect();
            return `${p.dataset.category} ${Math.round(r.left)},${Math.round(r.top + scrollY)} ${(+getComputedStyle(p).opacity).toFixed(1)}`; }));
        const pressed = () => page.evaluate(() => [...document.querySelectorAll('.filter-btn')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.category).join());
        const before = await read();
        await page.evaluate(() => document.querySelector('.filter-btn[data-category="fun"]').click());
        await sleep(400);
        // Every box where it was (no hole, nothing moved up), Fun bright and the rest faded
        assert.deepEqual(await read(), before.map((b) => b.replace(/ 1\.0$/, b.startsWith('fun ') ? ' 1.0' : ' 0.3')));
        assert.equal(await pressed(), 'fun');
        await center(page, 'sites-stats');
        await page.hover('#sites-stats .category-header');
        await sleep(400);
        assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('sites-stats')).opacity), '1', 'a faded box pointed at stays faded');
        await page.mouse.move(0, 0);
        // Reached by the keyboard, or carried, it comes up too
        await page.focus('#sites-weird .site-link');
        await page.keyboard.press('Tab');
        await sleep(400);
        assert.equal(await page.evaluate(() => [document.activeElement.closest('.category-box')?.id, getComputedStyle(document.getElementById('sites-weird')).opacity].join()), 'sites-weird,1', 'a faded box with keyboard focus in it');
        await page.evaluate(() => document.activeElement.blur());
        await center(page, 'sites-archives');
        const head = await page.locator('#sites-archives .panel-head').boundingBox();
        await page.mouse.move(head.x + 40, head.y + 20);
        await page.mouse.down();
        await page.mouse.move(head.x + 60, head.y + 30, { steps: 3 });
        await frames(page);
        assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('sites-archives')).opacity), '0.92', 'a faded box carried');
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await page.mouse.move(0, 0);
        await sleep(400);
        await page.evaluate(() => document.querySelector('.filter-btn[data-category="all"]').click());
        await sleep(400);
        assert.deepEqual(await read(), before);
        assert.equal(await pressed(), 'all');
        return errors;
    },
    async "Lounge: a filter remembered from the last visit is on as the page opens, not fading in"(browser) {
        // Motion allowed, so the fade has its length; read in the first frame after the page's scripts ran
        const { page, errors } = await open(browser, WIDE, { path: '/thelounge.html', motion: 'no-preference', init: () => {
            try { localStorage.setItem('loungeFilter', 'weird'); } catch { /* the game's frame, an error page here */ }
            if (window === top) document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(() => { window.__first = getComputedStyle(document.getElementById('sites-fun')).opacity; }));
        } });
        assert.equal(await page.evaluate(() => window.__first), '0.3', 'Fun in the first frame');
        return errors;
    },
    async "Lounge: a collapsed section's title is cut short of its controls on a phone"(browser) {
        const all = [];
        for (const opts of [SMALL, PHONE]) {
            const { page, errors } = await open(browser, opts, { path: '/thelounge.html' });
            all.push(...errors);
            const ids = await page.evaluate(() => [...document.querySelectorAll('.section-panel')].map((p) => p.id));
            for (const id of ids) await page.evaluate((id) => document.querySelector(`#${id} > :is(.panel-head, .panel-grab) .panel-collapse`).click(), id);
            await frames(page);
            const hit = await page.evaluate((ids) => ids.flatMap((id) => {
                const head = document.querySelector(`#${id} > .panel-head`), t = head.querySelector('h2').getBoundingClientRect(), tools = head.querySelector('.panel-tools').getBoundingClientRect();
                return t.right > tools.left + 1 || head.scrollWidth > head.clientWidth + 1 ? [`${id}: title to ${Math.round(t.right)}, tools from ${Math.round(tools.left)}`] : [];
            }), ids);
            assert.deepEqual(hit, [], `${opts.viewport.width}px`);
            await page.context().close();
        }
        return all;
    },
    async "Lounge: nothing scrolls sideways or spills its card at any width, and the grids take the old page's columns"(browser) {
        const all = [];
        // The old page's columns (picks, games, each category's links) where the board must match them
        const old = { 1440: '4 3 311334', 1080: '2 4 242424', 901: '2 4 232323', 800: '2 4 131313', 725: '2 2 111111', 390: '2 2 111111' };
        // Where the old page's section content and boxes began; and the board's own breakpoint edges
        // (four games from 737px, four picks from 1137px, the narrow layout up to 725px)
        const edges = { 1440: [52, 52], 901: [32, 32], 390: [16, 16] };
        // The lists shown whole, every other one scrolling in its box: the old page's (mind-bending at 1000 and 1080px, beer from 1340, weird
        // from 1380), and more since its boxes start a few rows taller (Doshus, 2026-10-17)
        const whole = { 800: 'mind-bending', 901: 'mind-bending', 1000: 'mind-bending beer', 1080: 'mind-bending beer', 1081: 'beer', 1136: 'beer', 1137: 'beer', 1280: 'beer', 1340: 'beer', 1380: 'weird beer', 1440: 'weird beer', 1920: 'weird beer' };
        const bounds = { 725: '2 2 narrow', 726: '2 2 wide', 736: '2 2 wide', 737: '2 4 wide', 1080: '2 4 wide', 1081: '2 3 wide', 1136: '2 3 wide', 1137: '4 3 wide' };
        const { ctx, page, errors } = await open(browser, { viewport: { width: 1440, height: 800 } }, { path: '/thelounge.html' });
        all.push(...errors);
        for (const width of [320, 360, 390, 520, 640, 641, 700, 725, 726, 730, 736, 737, 746, 800, 901, 1000, 1080, 1081, 1136, 1137, 1280, 1340, 1380, 1440, 1920]) {
            await page.setViewportSize({ width, height: 800 });
            await sleep(350);
            const got = await page.evaluate(() => {
                const cols = (q) => getComputedStyle(q).gridTemplateColumns.split(' ').length;
                const side = [...document.querySelectorAll('.panel-body')].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.parentElement.id);
                const spill = [...document.querySelectorAll('.favorite-card, .game-card')].filter((c) => { const r = c.getBoundingClientRect(); return [...c.children].some((k) => { const q = k.getBoundingClientRect(); return q.left < r.left - 0.5 || q.right > r.right + 0.5; }); }).map((c) => c.textContent.trim().split('\n')[0]);
                const edges = [Math.round(document.querySelector('.embedded-game').getBoundingClientRect().left), Math.round(document.getElementById('sites-fun').getBoundingClientRect().left)];
                const narrow = getComputedStyle(document.querySelector('.sites-controls')).flexDirection === 'column' ? 'narrow' : 'wide';
                const whole = [...document.querySelectorAll('.category-box')].filter((p) => { const b = p.querySelector('.panel-body'); return b.scrollHeight - b.clientHeight <= 1; }).map((p) => p.dataset.category).join(' ');
                return { side, spill, edges, narrow, whole, cols: `${cols(document.querySelector('.favorites-grid'))} ${cols(document.querySelector('.gaming-grid'))} ${[...document.querySelectorAll('.category-links')].map(cols).join('')}` };
            });
            assert.deepEqual([got.side, got.spill], [[], []], `${width}px: sideways or spilling`);
            if (old[width]) assert.equal(got.cols, old[width], `${width}px: columns`);
            if (edges[width]) assert.deepEqual(got.edges, edges[width], `${width}px: where the content and a box start`);
            if (bounds[width]) assert.equal(`${got.cols.split(' ').slice(0, 2).join(' ')} ${got.narrow}`, bounds[width], `${width}px: picks, games, narrow`);
            assert.equal(got.whole, whole[width] ?? '', `${width}px: lists shown whole`);
        }
        await ctx.close();
        // With scrollbars that take room (Windows), as the old page had them: a half-width box keeps
        // its two link columns at 965px (Mind-Bending whole there, a few rows taller now), and Beer shows
        // whole in the band a 1366px laptop falls in
        const classic = await chromium.launch({ ...LAUNCH, ignoreDefaultArgs: ['--hide-scrollbars'] });
        try {
            const { page, errors } = await open(classic, { viewport: { width: 965, height: 800 } }, { path: '/thelounge.html' });
            all.push(...errors);
            for (const [width, want] of [[965, '232323 mind-bending'], [1355, '211224 beer']]) {
                await page.setViewportSize({ width, height: 800 });
                await sleep(350);
                assert.ok(await page.evaluate(() => innerWidth - document.documentElement.clientWidth > 0), `${width}px: no scrollbar taking room, so it tests nothing`);
                assert.equal(await page.evaluate(() => `${[...document.querySelectorAll('.category-links')].map((q) => getComputedStyle(q).gridTemplateColumns.split(' ').length).join('')} ${[...document.querySelectorAll('.category-box')]
                    .filter((p) => { const b = p.querySelector('.panel-body'); return b.scrollHeight - b.clientHeight <= 1; }).map((p) => p.dataset.category).join(' ')}`), want, `${width}px with classic scrollbars: link columns, lists shown whole`);
            }
        } finally {
            await classic.close();
        }
        return all;
    },
    async "a panel the page sets in from its cells (--inset): the ghost frames it, a drag reads from its frame, a resize stops at its landing edge"(browser) {
        const all = [];
        const rect = (page, sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; }, sel);
        // Grabs a panel by its head and starts carrying it (dir: which way the nudge goes)
        const grab = async (page, id, dir = 1) => {
            const h = await page.locator(`#${id} > .panel-head`).boundingBox();
            await page.mouse.move(h.x + 40, h.y + 20);
            await page.mouse.down();
            await page.mouse.move(h.x + 40 + 4 * dir, h.y + 20);
            await frames(page);
            return h;
        };
        // A Lounge box sits in by a section panel's edge above a phone, a section panel out by it on
        // one. A drag that read a frame's side off by that edge would take 0.55 of a cell past half
        // toward the board's edge (a box rightward, a section panel leftward, so it starts at the right)
        for (const [opts, id, dir] of [[WIDE, 'sites-fun', 1], [{ viewport: { width: 390, height: 844 } }, 'interesting', -1]]) {
            const { page, errors } = await open(browser, opts, { path: '/thelounge.html' });
            all.push(...errors);
            await center(page, id);
            if (dir < 0) { // as narrow as it goes (its title's longest word holds it at 4 of 6 columns), at the right
                await page.focus(`#${id} > .panel-edge[data-dir="se"]`);
                for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
                await page.focus(`#${id} > :is(.panel-head, .panel-grab) .panel-grip`);
                for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
                await sleep(300);
                await center(page, id);
            }
            const start = await cells(page, id), frame = await rect(page, `#${id}`);
            if (dir < 0) assert.deepEqual([start[0], start[2]], [3, 4], `${id} made narrow at the right`);
            const cw = await page.evaluate(() => { const b = document.querySelector('.board'); return b.clientWidth / +getComputedStyle(b).getPropertyValue('--cols'); });
            const h = await grab(page, id, dir);
            assert.deepEqual(await rect(page, '.board-ghost'), frame, `${opts.viewport.width}px: the ghost frames ${id} where it sits`);
            await page.mouse.move(h.x + 40 + cw * 0.55 * dir, h.y + 20, { steps: 4 }); // just past half a cell: no snap yet
            await frames(page);
            await page.mouse.up();
            await sleep(300);
            assert.deepEqual(await cells(page, id), start, `${opts.viewport.width}px: a drag of 0.55 of a cell moved ${id}`);
            await page.context().close();
        }
        // An inset in a font's units frames the same spot too (the ghost copies it computed, in px)
        {
            const { page, errors } = await open(browser);
            all.push(...errors);
            await page.evaluate(() => { const p = document.getElementById('stack'); p.style.fontSize = '24px'; p.style.setProperty('--inset', '1em'); });
            await center(page, 'stack');
            const frame = await rect(page, '#stack');
            await grab(page, 'stack');
            assert.deepEqual(await rect(page, '.board-ghost'), frame, 'an inset of 1em: the ghost frames the panel where it sits');
            await page.mouse.up();
            await page.context().close();
        }
        // Resized past the board's edge: the live edge stops where the ghost ends and the panel lands
        const { page, errors } = await open(browser, WIDE, { path: '/thelounge.html' });
        all.push(...errors);
        await center(page, 'sites-fun');
        const e = await page.locator('#sites-fun .panel-edge[data-dir="e"]').boundingBox();
        await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
        await page.mouse.down();
        await page.mouse.move(e.x + 2000, e.y + e.height / 2, { steps: 6 });
        await frames(page);
        const during = [(await rect(page, '#sites-fun'))[1], (await rect(page, '.board-ghost'))[1]];
        await page.mouse.up();
        await sleep(400);
        assert.deepEqual([...during, (await rect(page, '#sites-fun'))[1]], Array(3).fill(during[1]), 'live edge, ghost and landed edge');
        return all;
    },
    async 'Lounge: a section or category title centers on its panel, clear of the tools, at any width'(browser) {
        const all = [];
        for (const opts of [WIDE, { viewport: { width: 1280, height: 800 } }, FOLD, PHONE, SMALL]) {
            const { page, errors } = await open(browser, opts, { path: '/thelounge.html' });
            all.push(...errors);
            const off = await page.evaluate(() => [...document.querySelectorAll('.panel-head > :is(.section-title, .category-header)')].flatMap((t) => {
                const p = t.closest('.panel').getBoundingClientRect(), tools = t.parentElement.querySelector('.panel-tools').getBoundingClientRect();
                const r = document.createRange();
                r.selectNodeContents(t);
                const text = r.getBoundingClientRect(), id = t.closest('.panel').id, out = [];
                const shift = text.left + text.width / 2 - (p.left + p.width / 2);
                if (Math.abs(shift) > 1.5) out.push(`${id}: ${Math.round(shift)}px off center`);
                if ([...r.getClientRects()].some((l) => l.left < tools.right - 1 && tools.left < l.right - 1 && l.top < tools.bottom - 1 && tools.top < l.bottom - 1)) out.push(`${id}: under the tools`);
                // A narrow head (32rem or less) gives its title the whole width: one that fits there takes one line
                const head = getComputedStyle(t.parentElement), room = t.parentElement.clientWidth - parseFloat(head.paddingLeft) - parseFloat(head.paddingRight);
                const lines = new Set([...r.getClientRects()].map((l) => Math.round(l.top))).size;
                t.style.whiteSpace = 'nowrap';
                const one = r.getBoundingClientRect().width;
                t.style.removeProperty('white-space');
                if (room <= 512 && one <= room && lines > 1) out.push(`${id}: ${lines} lines though ${Math.round(one)}px fits in ${Math.round(room)}px`);
                // A section's title is as wide as its words, so its gradient runs across them
                if (t.matches('.section-title') && lines === 1 && t.getBoundingClientRect().width - text.width > 2) out.push(`${id}: title ${Math.round(t.getBoundingClientRect().width)}px wide for ${Math.round(text.width)}px of words`);
                return out;
            }));
            assert.deepEqual(off, [], `${opts.viewport.width}px: ${off.join('; ')}`);
            await page.context().close();
        }
        return all;
    },
};

(async () => {
    const server = await serve();
    base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch(LAUNCH);
    let failed = 0, ran = 0;
    for (const [name, test] of Object.entries(TESTS)) {
        if (process.env.ONLY && !name.includes(process.env.ONLY)) continue; // ONLY=<part of a name> runs just those
        ran++;
        try {
            const errors = await test(browser);
            assert.deepEqual(errors, [], 'page errors');
            console.log('PASS ', name);
        } catch (e) {
            failed++;
            console.log('FAIL ', name, '\n      ', e.message.split('\n')[0]);
        }
        for (const ctx of browser.contexts()) await ctx.close();
    }
    await browser.close();
    server.close();
    if (!ran) failed = 1, console.log(`ONLY=${process.env.ONLY} matches no case`);
    console.log(failed ? `\n${failed} failed` : '\nall board tests passed');
    process.exitCode = failed ? 1 : 0;
})();
