#!/usr/bin/env node
// The board engine (UI-SPEC.md, public/js/board.js) in a real browser, on /lab/nexus served from
// public/. Every case here is a bug a review found or a promise the spec makes.
// Run: bun run test. Once per machine: bunx playwright install chromium. PW_CHROMIUM=<path to a
// chrome binary> runs another Chromium build instead of Playwright's own.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', 'public');
const PAGE = '/lab/nexus.html';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const WIDE = { viewport: { width: 1440, height: 900 } };
const FOLD = { viewport: { width: 901, height: 1000 }, isMobile: true, hasTouch: true }; // a Galaxy Z Fold7 opened
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
async function open(browser, opts = WIDE, { init, motion = 'reduce', delayBoard } = {}) {
    const ctx = await browser.newContext({ ...opts, reducedMotion: motion });
    if (init) await ctx.addInitScript(init);
    await ctx.route((url) => !url.href.startsWith(base), (r) => r.abort()); // nothing leaves the machine
    if (delayBoard) await ctx.route('**/js/board.js', async (r) => { await sleep(delayBoard); r.continue(); });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + PAGE, { waitUntil: 'load' });
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
        await center(page, 'mobile');
        const before = await cells(page, 'mobile');
        await drag(page, '#mobile .panel-head', 200, 0);
        const moved = await cells(page, 'mobile');
        assert.ok(moved[0] > before[0], `moved right: ${before} -> ${moved}`);
        assert.ok(JSON.parse(await saved(page)).items.some((i) => i.id === 'mobile' && i.x === moved[0]));
        await drag(page, '#mobile .panel-head', -200, 0, { before: () => page.keyboard.press('Escape') });
        assert.deepEqual(await cells(page, 'mobile'), moved);
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
        await sleep(500);
        const moved = y0 - (await page.evaluate(() => scrollY));
        await page.mouse.up();
        assert.ok(moved > 100 && moved < 700, `scrolled ${moved}px up in 500ms (0.68 px/ms expected)`);
        return errors;
    },
    async 'two fingers run one gesture'(browser) {
        const { ctx, page, errors } = await open(browser, { viewport: { width: 1300, height: 900 }, hasTouch: true });
        await center(page, 'mobile');
        const cdp = await ctx.newCDPSession(page);
        const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([id, x, y]) => ({ id, x, y })) });
        const a = await page.locator('#mobile .panel-head').boundingBox(), b = await page.locator('#stack .panel-head').boundingBox();
        const mobile = await cells(page, 'mobile');
        const A = [1, a.x + 100, a.y + 20], B = [2, b.x + 100, b.y + 20];
        await touch('touchStart', [A]); await sleep(100);
        await touch('touchStart', [A, B]); await sleep(700);
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.is-dragging')].map((p) => p.id)), ['mobile']);
        await touch('touchMove', [[1, A[1] + 160, A[2]], [2, B[1] - 60, B[2]]]); await sleep(100);
        await touch('touchMove', [[1, A[1] + 160, A[2]]]); await sleep(200); // finger 2 lifts: it's no longer listed
        assert.equal(await arranging(page), true, 'lifting the second finger ends nothing');
        await touch('touchEnd', []); await sleep(300);
        assert.ok((await cells(page, 'mobile'))[0] > mobile[0], "the first finger's move lands");
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
    async 'the keyboard moves and resizes'(browser) {
        const { page, errors } = await open(browser);
        const [x, y, w, h] = await cells(page, 'mobile');
        await page.focus('#mobile .panel-grip');
        await page.keyboard.press('ArrowRight');
        assert.equal((await cells(page, 'mobile'))[0], x + 1);
        await page.focus('#mobile .panel-edge[data-dir="se"]');
        await page.keyboard.press('ArrowDown');
        assert.equal((await cells(page, 'mobile'))[3], h + 1);
        assert.ok(await saved(page));
        return errors;
    },
    async 'Reset, then Undo, puts the visitor layout back'(browser) {
        const { page, errors } = await open(browser);
        await page.focus('#mobile .panel-grip');
        await page.keyboard.press('ArrowRight');
        const mine = await saved(page);
        const reset = page.locator('.board-bar button', { hasText: 'Reset layout' });
        await reset.click();
        assert.equal(await saved(page), null);
        await page.locator('.board-bar button', { hasText: 'Undo reset' }).click();
        assert.equal(await saved(page), mine);
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
    async 'every panel body lays out after the DOM reorders (moveBefore and size containers)'(browser) {
        const { page, errors } = await open(browser);
        await page.evaluate(() => document.querySelector('#rig .panel-close').click());
        await page.evaluate(() => document.querySelector('.board-menu button').click());
        assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.panel-body')].filter((b) => getComputedStyle(b).height === 'auto').map((b) => b.closest('.panel').id)), []);
        return errors;
    },
    async 'the mid tier: 12 columns, two panels to a row, its own save'(browser) {
        const { page, errors } = await open(browser, FOLD);
        const layout = await page.evaluate(() => ({ cols: getComputedStyle(document.querySelector('.board')).getPropertyValue('--cols').trim(),
            cells: [...document.querySelectorAll('.panel')].map((p) => ['x', 'y', 'w', 'h'].map((k) => +p.style.getPropertyValue('--' + k))) }));
        assert.equal(layout.cols, '12');
        for (const [x, , w] of layout.cells) assert.ok(w >= 6 && x + w - 1 <= 12, `cells ${x},${w}`);
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
        return errors;
    },
    async 'a head never lets its title, tag and tools overlap'(browser) {
        const all = [];
        for (const opts of [WIDE, FOLD, PHONE]) {
            const { page, errors } = await open(browser, opts);
            all.push(...errors);
            const bad = await page.evaluate(() => [...document.querySelectorAll('.panel')].flatMap((p) => {
                const box = p.getBoundingClientRect(), tools = p.querySelector('.panel-tools').getBoundingClientRect(), out = [];
                if (tools.left < box.left || tools.right > box.right + 1) out.push(`${p.id}: tools outside`);
                const h2 = p.querySelector('.panel-head h2')?.getBoundingClientRect();
                if (h2 && (h2.right > tools.left + 1 || h2.right > box.right)) out.push(`${p.id}: title under the tools`);
                return out;
            }));
            assert.deepEqual(bad, [], `${opts.viewport.width}px`);
            await page.context().close();
        }
        return all;
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
