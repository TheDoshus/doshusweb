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
async function open(browser, opts = WIDE, { init, motion = 'reduce', delayBoard, path = PAGE } = {}) {
    const ctx = await browser.newContext({ ...opts, reducedMotion: motion });
    if (init) await ctx.addInitScript(init);
    await ctx.route((url) => !url.href.startsWith(base), (r) => r.abort()); // nothing leaves the machine
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
const center = async (page, id) => { await page.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'center' }), id); await sleep(150); };
// Made shorter than what it holds by the keyboard, as a visitor would, so its body scrolls inside
// (Nexus's Dev Core, marked data-tall, is as tall as its content by default)
const squeeze = async (page, id, n = 10) => { await page.focus(`#${id} .panel-edge[data-dir="se"]`); for (let i = 0; i < n; i++) await page.keyboard.press('ArrowUp'); await sleep(300); };
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
        for (const id of ['meme-2', 'meme-1', 'dev-core']) await page.evaluate((id) => document.querySelector(`#${id} .panel-close`).click(), id);
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
        await sleep(500);
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
                await page.focus(`#${id} .panel-edge[data-dir="se"]`);
                for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowUp'); // squeezed: its body scrolls, with a scrollbar
                const bar = await page.evaluate((id) => { const b = document.querySelector(`#${id} .panel-body`); return b.offsetWidth > b.clientWidth; }, id);
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
        await ctx.route('**/*.woff2', async (r) => { await sleep(800); r.continue(); });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.focus('#dev-core .panel-grip');
        assert.equal(await page.evaluate(() => document.fonts.status), 'loading', 'the fonts landed before the move, so this case tests nothing');
        await page.keyboard.press('ArrowLeft'); // Dev Core is at the left edge already: nothing moves, and nothing is saved over
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
        for (const id of ['sites-fun', 'sites-mind-bending', 'sites-archives']) await page.evaluate((id) => document.querySelector(`#${id} .panel-close`).click(), id);
        for (const id of ['sites-stats', 'sites-beer']) await page.evaluate((id) => document.querySelector(`#${id} .panel-collapse`).click(), id);
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
            const off = await page.evaluate((tier) => [...document.querySelectorAll('.board > .panel')].flatMap((p) => {
                const want = p.dataset[tier].split(' ').map(Number), got = ['x', 'y', 'w', 'h'].map((k) => +p.style.getPropertyValue('--' + k));
                return got.join() === want.join() ? [] : [`${p.id} ${want} → ${got}`]; // measured at this width, so exactly
            }), tier);
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
        assert.equal(await page.evaluate(() => { const b = document.querySelector('#amazonian .panel-body'); return b.scrollHeight - b.clientHeight; }), 0, 'Amazonian scrolls inside once its links are in');
        // The narrowest phones: nothing in a panel runs sideways (the boxes clipped it before)
        for (const width of [320, 330, 360, 375]) {
            await page.setViewportSize({ width, height: 700 });
            await sleep(300);
            assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.board > .panel')].filter((p) => { const b = p.querySelector('.panel-body'); return b.scrollWidth > b.clientWidth + 1; }).map((p) => p.id)), [], `${width}px: sideways`);
        }
        await ctx.close();
        return all;
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
            return { h: +p.style.getPropertyValue('--h'), over: b.scrollHeight - b.clientHeight, shown: [...b.querySelectorAll('.site-link')].filter((a) => a.getBoundingClientRect().top < box.bottom).length }; });
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
            const at = await page.evaluate((id) => { const r = document.createRange(); r.selectNodeContents(document.querySelector(`#${id} .panel-head h2`)); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, id);
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
            const steady = async (page) => { let last = '', same = 0; for (let i = 0; i < 40 && same < 4; i++) { const now = String(await cells(page, 'sites-fun')); same = now === last ? same + 1 : 0; last = now; await sleep(100); } return cells(page, 'sites-fun'); };
            const fresh = await open(browser, opts, { path: '/thelounge.html' });
            const want = await steady(fresh.page);
            await fresh.ctx.close();
            // A visitor who left it on Weird Internet: the filter applies at load, before the board measures again
            const { page, errors } = await open(browser, opts, { path: '/thelounge.html', init: () => { try { localStorage.setItem('loungeFilter', 'weird'); } catch { /* the game's frame, an error page here */ } } });
            all.push(fresh.errors, ...errors);
            await page.evaluate(() => document.querySelector('.filter-btn[data-category="all"]').click());
            // Its own width and height (where it sits also follows panels above it, measured as their content arrives)
            const [, , ...got] = await steady(page);
            assert.deepEqual(got, want.slice(2), `${opts.viewport.width}px`);
            await page.context().close();
        }
        return all.flat();
    },
    async "Lounge: a big title's collapsed bar holds its whole head, under reduced motion too"(browser) {
        // Reduced motion gives every property a 0.01ms transition, so the head reads its open size right after the class
        const { page, errors } = await open(browser, FOLD, { path: '/thelounge.html' });
        await page.evaluate(() => ['picks', 'sandspiel', 'sites-fun'].forEach((id) => document.querySelector(`#${id} .panel-collapse`).click()));
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
            for (const id of ids) await page.evaluate((id) => document.querySelector(`#${id} .panel-collapse`).click(), id);
            await frames(page);
            const hit = await page.evaluate((ids) => ids.flatMap((id) => {
                const head = document.querySelector(`#${id} .panel-head`), t = head.querySelector('h2').getBoundingClientRect(), tools = head.querySelector('.panel-tools').getBoundingClientRect();
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
        // The lists the old page showed whole (every other one scrolled in its box)
        const whole = { 1000: 'mind-bending', 1080: 'mind-bending', 1340: 'beer', 1380: 'weird beer', 1440: 'weird beer', 1920: 'weird beer' };
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
        // its two link columns at 965px, and Beer shows whole in the band a 1366px laptop falls in
        const classic = await chromium.launch({ ...LAUNCH, ignoreDefaultArgs: ['--hide-scrollbars'] });
        try {
            const { page, errors } = await open(classic, { viewport: { width: 965, height: 800 } }, { path: '/thelounge.html' });
            all.push(...errors);
            for (const [width, want] of [[965, '232323 '], [1355, '211224 beer']]) {
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
            const h = await page.locator(`#${id} .panel-head`).boundingBox();
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
            if (dir < 0) { // half width, at the right
                await page.focus(`#${id} .panel-edge[data-dir="se"]`);
                for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
                await page.focus(`#${id} .panel-grip`);
                for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
                await sleep(300);
                await center(page, id);
            }
            const start = await cells(page, id), frame = await rect(page, `#${id}`);
            if (dir < 0) assert.deepEqual([start[0], start[2]], [4, 3], `${id} made half width at the right`);
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
