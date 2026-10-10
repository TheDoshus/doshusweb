#!/usr/bin/env node
// The board engine (UI-SPEC.md, public/js/board.js) in a real browser, on /nexus (a few cases on
// /financehub) served from public/. Every case here is a bug a review found or a promise the spec makes.
// Run: bun run test. Once per machine: bunx playwright install chromium. PW_CHROMIUM=<path to a
// chrome binary> runs another Chromium build instead of Playwright's own.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// shared.css's reduced motion still transitions every property for a frame: wait out two frames
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

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
    await sleep(600);
    return { ctx, page, errors };
}
// In the page: a panel's cells, a tier's save, and the moves its DOM sees
const cells = (page, id) => page.evaluate((id) => { const s = document.getElementById(id).style; return ['x', 'y', 'w', 'h'].map((k) => +s.getPropertyValue('--' + k)); }, id);
const saved = (page, tier = '') => page.evaluate((k) => localStorage.getItem('board:nexus' + k), tier && ':' + tier);
const arranging = (page) => page.evaluate(() => document.querySelector('.board').classList.contains('is-arranging'));
const countMoves = () => { window.__moves = 0; for (const m of ['moveBefore', 'insertBefore']) { const f = Element.prototype[m]; if (f) Element.prototype[m] = function (...a) { if (this.matches?.('.board')) window.__moves++; return f.apply(this, a); }; } };
const center = async (page, id) => { await page.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'center' }), id); await sleep(150); };
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
        const rate = moved / (Date.now() - t0);
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
    async 'a panel taller than the screen scrolls to its end, then the page carries on'(browser) {
        const all = [];
        for (const opts of [WIDE, PHONE]) {
            const { ctx, page, errors } = await open(browser, opts);
            all.push(...errors);
            const at = `${opts.viewport.width}px`;
            const body = () => page.evaluate(() => { const b = document.querySelector('#dev-core .panel-body'); return [b.scrollTop, b.scrollHeight - b.clientHeight]; });
            assert.ok((await body())[1] > 0, `${at}: Dev Core fits on screen, so this case tests nothing`);
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
                return { collapsed: p.classList.contains('is-collapsed'), slack: +p.style.getPropertyValue('--h') - head / row, over: body.scrollHeight - body.clientHeight };
            });
            const start = await rig();
            assert.ok(start.collapsed && start.slack >= 0 && start.slack < 1, `${at}: starts as a tight title bar ${JSON.stringify(start)}`);
            assert.equal(await saved(page, opts === WIDE ? '' : 'phone'), null, `${at}: the default saves nothing`);
            await page.click('#rig .panel-collapse');
            await frames(page);
            const opened = await rig();
            assert.ok(!opened.collapsed && opened.over <= 0, `${at}: opens to its content ${JSON.stringify(opened)}`);
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
            for (const card of (await page.locator('.ccGrid .ccCard').all()).slice(0, 8)) {
                await card.scrollIntoViewIfNeeded();
                await card.hover();
                await frames(page);
                const cut = await card.evaluate((c) => {
                    const tip = c.querySelector('.card-tooltip').getBoundingClientRect();
                    const box = c.closest('details').querySelector('summary').getBoundingClientRect().bottom;
                    return Math.round(Math.max(box, 0) - tip.top);
                });
                assert.ok(cut <= 0, `${opts.viewport.width}px: ${await card.locator('.card-title').textContent()}'s tooltip cut by ${cut}px`);
            }
            await page.context().close();
        }
        return all;
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
        c.forEach(([x, , w]) => assert.deepEqual([x, w], [1, 4]));
        c.slice(1).forEach(([, y], i) => assert.ok(y >= c[i][1] + c[i][3], 'stacked without overlap'));
        // Twice the air between stacked panels (32px), the panels as wide as before (24px in from the edge)
        const [gap, edge] = await page.evaluate(() => {
            const [a, b] = [...document.querySelectorAll('.panel')].map((p) => p.getBoundingClientRect());
            return [b.top - a.bottom, a.left];
        });
        assert.deepEqual([Math.round(gap), Math.round(edge)], [32, 24]);
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
            await frames(page);
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
};

(async () => {
    const server = await serve();
    base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--disable-3d-apis'] });
    let failed = 0;
    for (const [name, test] of Object.entries(TESTS)) {
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
    console.log(failed ? `\n${failed} failed` : '\nall board tests passed');
    process.exitCode = failed ? 1 : 0;
})();
