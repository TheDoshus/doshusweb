#!/usr/bin/env bun
// bun run test:profile [base URL | local route] [route]; PROFILE_BASE_URL / PROFILE_ROUTE also work.
// No networkidle: zephyy-live.js keeps Firebase event streams open.
const { chromium } = require('playwright');
const { serve } = require('../scripts/serve.js');

const DEADLINE_MS = 15000;
const STABLE_FRAMES = 3;
const TABS = ['identity', 'receipts', 'latest', 'now'];
const FRAGMENTS = TABS.map((tab) => `/zephyy/fragments/${tab}`);
const PAGES = ['/zephyy', '/zephyy/crew', '/zephyy/qa', '/zephyy/changelog', '/zephyy/status'];
const VIEWPORTS = [
    { name: 'desktop 1440px', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
    { name: 'mobile 390px', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
];
const TRANSIENT = /(?:^|\s)(?:net::)?ERR_(?:NETWORK_CHANGED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION_RESET|NETWORK_IO_SUSPENDED)(?=$|\s|:)/;
const pause = () => new Promise((resolve) => setTimeout(resolve, 16));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
let passed = 0, failed = 0, unknown = 0;
function record(kind, label, detail) {
    if (kind === 'PASS') passed++; else if (kind === 'UNKNOWN') unknown++; else failed++;
    console.log(`${kind}  ${label}: ${detail}`);
}
const fault = (text, network = false) => Object.assign(new Error(text), { network });
const problem = (error, stage) => ({ text: error.message, network: error.network === true, stage });
const drain = (errors, stage) => errors.splice(0).map((error) => ({ ...error, stage }));
function raiseErrors(errors) {
    if (errors.length) throw Object.assign(new Error('browser errors'), { problems: errors.splice(0) });
}
async function check(label, state, errors, operation) {
    const result = { label, problems: [], detail: 'assertions passed' };
    try { await operation(); }
    catch (error) { result.problems.push(...(error.problems || [problem(error, state.stage)])); }
    result.problems.push(...drain(errors, state.stage));
    result.problems.forEach((p) => { p.stage ||= state.stage; });
    return result;
}
// Buffer the whole attempt: a retry cannot leave stale PASS/FAIL counts behind.
async function retryCheck(label, operation) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const results = await operation();
        const problems = results.flatMap((r) => r.problems);
        const networkOnly = problems.length > 0 && problems.every((p) => p.network);
        if (networkOnly && !attempt) {
            console.log(`RETRY ${label}: transient network errors; retrying page check once (${problems[0].text})`);
            continue;
        }
        for (const r of results) record(r.problems.length ? (networkOnly ? 'UNKNOWN' : 'FAIL') : 'PASS', r.label,
            r.problems.length ? `${networkOnly ? 'network unstable: ' : ''}${r.problems.map((p) => `[${p.stage}] ${p.text}`).join(' | ')}` : r.detail);
        return;
    }
}

// One Node-side deadline includes every await, including fonts in a no-JS context.
async function bounded(state, operation) {
    let timer;
    const controller = new AbortController();
    try {
        return await Promise.race([
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${state.stage} timed out after ${DEADLINE_MS}ms`)), DEADLINE_MS);
            }),
            operation(controller.signal)
        ]);
    } finally { clearTimeout(timer); controller.abort(); }
}

async function ready(page, state) {
    await bounded(state, async (signal) => {
        state.stage = 'fonts';
        await page.evaluate(() => document.fonts.ready.then(() => null));
        signal.throwIfAborted();
        state.stage = 'finite animations';
        await page.evaluate(() => Promise.all(document.getAnimations()
            .filter((a) => Number.isFinite(a.effect?.getTiming().iterations))
            .map((a) => a.finished.catch((error) => {
                if (error.name !== 'AbortError') throw error;
            }))).then(() => null));
        signal.throwIfAborted();
        state.stage = 'stable geometry';
        let previous, lastFrame, stable = 0;
        while (stable < STABLE_FRAMES) {
            signal.throwIfAborted();
            const { frame, geometry } = await page.evaluate(() => ({
                frame: document.timeline.currentTime,
                geometry: JSON.stringify([
                    document.documentElement.scrollWidth, document.documentElement.scrollHeight,
                    document.body.scrollWidth, document.body.scrollHeight,
                    ...Array.from(document.querySelectorAll('main, section, #zp-signal-panel, [data-panel]'), (el) => {
                        const r = el.getBoundingClientRect();
                        return [r.x, r.y, r.width, r.height];
                    })
                ])
            }));
            // The rendering timeline advances with JS disabled; don't count duplicate frames.
            if (frame !== null && frame !== lastFrame) {
                stable = geometry === previous ? stable + 1 : 0;
                previous = geometry;
                lastFrame = frame;
            }
            await pause();
        }
    });
}

// Browser transport failures use codes, regardless of host/resource. App errors never do.
function collectErrors(page) {
    const errors = [];
    page.on('pageerror', (error) => errors.push({ text: error.message, network: false }));
    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text(), loc = msg.location();
        const source = URL.canParse(loc.url) ? new URL(loc.url) : null;
        errors.push({ text: `${text} (${loc.url}:${loc.lineNumber}:${loc.columnNumber})`,
            network: msg.args().length === 0 && text.startsWith('Failed to load resource:') && TRANSIENT.test(text),
            htmxDiagnostic: /^htmx:(afterRequest|sendError), \[object HTML\w+Element\]$/.test(text)
                && source?.origin === new URL(page.url()).origin
                && /^\/zephyy\/vendor\/htmx-[^/]+\.min\.js$/.test(source.pathname) });
    });
    page.on('requestfailed', (req) => {
        const reason = req.failure()?.errorText || 'unknown';
        errors.push({ text: `requestfailed: ${req.method()} ${req.url()} (${reason})`, network: TRANSIENT.test(reason) });
    });
    return errors;
}

async function surface(page, errors) {
    raiseErrors(errors); // A failed asset makes its dependent layout assertions unverified until retry.
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        clientWidth: document.documentElement.clientWidth
    }));
    assert(scrollWidth <= clientWidth, `overflow: scrollWidth=${scrollWidth}px > clientWidth=${clientWidth}px`);
}

async function panel(page, tab) {
    const data = await page.evaluate((name) => {
        const el = document.querySelector(`#zp-signal-panel [data-panel="${name}"]`);
        return { visible: !!el && el.getClientRects().length > 0, text: el?.innerText || '' };
    }, tab);
    assert(data.visible && data.text.trim(), `expected visible non-empty ${tab} panel inside #zp-signal-panel`);
    if (tab === 'now') assert(data.text.toLowerCase().includes('profile sync'),
        `expected "profile sync", got ${JSON.stringify(data.text.slice(0, 80))}`);
}

async function checkTab(page, errors, vp, tab, base) {
    const result = { label: `${vp.name} HTMX swap ${tab}`, problems: [], detail: 'HTTP 200 redirects 0, panel visible, errors: 0, overflow: false' };
    const state = { stage: 'arm watchers' };
    const url = `${base}/zephyy/fragments/${tab}`;
    let onResponse, onFailure, response, requestError;
    try {
        raiseErrors(errors);
        await bounded(state, async (signal) => {
            await page.evaluate(() => {
                const target = document.getElementById('zp-signal-panel');
                if (!target) throw new Error('#zp-signal-panel missing');
                const watch = { settled: false, error: '' };
                const settle = (e) => { if (e.target === target) watch.settled = true; };
                const error = (e) => {
                    watch.error = `${e.type}: ${e.detail?.error || 'HTMX failure'}`;
                    if (e.type === 'htmx:sendError') watch.transportPath = e.detail?.pathInfo?.requestPath || e.detail?.requestConfig?.path;
                };
                const events = ['htmx:responseError', 'htmx:sendError', 'htmx:swapError'];
                target.addEventListener('htmx:afterSettle', settle);
                events.forEach((name) => document.body.addEventListener(name, error));
                window.__profileWatch = watch;
                window.__profileCleanup = () => {
                    target.removeEventListener('htmx:afterSettle', settle);
                    events.forEach((name) => document.body.removeEventListener(name, error));
                    delete window.__profileWatch;
                    delete window.__profileCleanup;
                };
            });
            signal.throwIfAborted();
            onResponse = (res) => { if (res.url() === url && res.request().method() === 'GET') response = res; };
            onFailure = (req) => { if (req.url() === url) requestError = req.failure()?.errorText || 'request failed'; };
            page.on('response', onResponse);
            page.on('requestfailed', onFailure);
            state.stage = 'click';
            await page.click(`#zp-tab-${tab}`, { timeout: DEADLINE_MS });
            for (;;) {
                signal.throwIfAborted();
                const watch = await page.evaluate(() => window.__profileWatch);
                state.stage = response ? 'htmx:afterSettle' : 'fragment response';
                if (requestError) throw fault(`fragment request: ${requestError}`, TRANSIENT.test(requestError));
                if (watch.error) {
                    // XHR's sendError can precede Playwright's requestfailed event; wait for its code.
                    if (!watch.error.startsWith('htmx:sendError:')) throw new Error(watch.error);
                } else {
                    if (response) assert(response.status() === 200 && !response.request().redirectedFrom(),
                        `fragment HTTP ${response.status()} (expected 200), redirected: ${!!response.request().redirectedFrom()}`);
                    if (response && watch.settled) break;
                }
                await pause();
            }
        });
        await ready(page, state);
        state.stage = 'errors/overflow';
        await surface(page, errors);
        state.stage = 'panel assertion';
        await panel(page, tab);
    } catch (error) {
        result.problems.push(...(error.problems || [problem(error, state.stage)]));
    } finally {
        if (onResponse) page.off('response', onResponse);
        if (onFailure) page.off('requestfailed', onFailure);
        let transportPath;
        try { transportPath = await page.evaluate(() => {
            const path = window.__profileWatch?.transportPath;
            window.__profileCleanup?.();
            return path;
        }); }
        catch (error) { result.problems.push(problem(error, 'watcher cleanup')); }
        // HTMX logs its XHR transport events itself. Correlate both event path and failed request code;
        // never exempt a vendor diagnostic solely because another resource failed on this page.
        if (requestError && TRANSIENT.test(requestError) && URL.canParse(transportPath, base) && new URL(transportPath, base).href === url) {
            errors.forEach((error) => { if (error.htmxDiagnostic) error.network = true; });
        }
        result.problems.push(...drain(errors, state.stage));
        result.problems.forEach((p) => { p.stage ||= state.stage; });
    }
    return result; // Publish once, after cleanup: never PASS+FAIL or two FAILs for one tab.
}

async function checkPage(browser, base, route, vp, noJS = false) {
    const label = `${vp.name} ${noJS ? 'fallback (no-JS) ' : ''}${route}`;
    await retryCheck(label, async () => {
        let context, errors = [];
        const results = [], state = { stage: 'context' };
        try {
            const { name, ...options } = vp;
            context = await browser.newContext({ ...options, javaScriptEnabled: !noJS });
            const page = await context.newPage();
            errors = collectErrors(page);
            results.push(await check(label, state, errors, async () => {
                state.stage = 'navigation';
                let res;
                try { res = await page.goto(base + route, { waitUntil: 'load', timeout: DEADLINE_MS }); }
                catch (error) { throw fault(error.message, TRANSIENT.test(error.message)); }
                assert(res?.status() === 200, `HTTP ${res?.status() ?? 'none'} (expected 200)`);
                raiseErrors(errors);
                await ready(page, state);
                state.stage = 'errors/overflow';
                await surface(page, errors);
                if (noJS) {
                    state.stage = 'fallback assertion';
                    const sections = await page.locator('section').count();
                    assert(sections === 8, `sections: ${sections} (expected 8)`);
                    await panel(page, 'now');
                }
            }));
            if (!results[0].problems.length && route === '/zephyy' && !noJS) {
                state.stage = 'panel assertion';
                results.push(await check(`${vp.name} initial now fragment`, state, errors, async () => {
                    raiseErrors(errors);
                    await panel(page, 'now');
                }));
                for (const tab of TABS) results.push(await checkTab(page, errors, vp, tab, base));
            }
        } catch (error) { results.push({ label, problems: [problem(error, state.stage)] }); }
        finally {
            try { if (context) await context.close(); }
            catch (error) { results.at(-1).problems.push(problem(error, 'context cleanup')); }
            results.at(-1).problems.push(...drain(errors, 'late browser errors'));
        }
        return results;
    });
}

(async () => {
    let server, browser;
    try {
        const raw = process.argv[2] || process.env.PROFILE_BASE_URL;
        let route = process.argv[3] || process.env.PROFILE_ROUTE;
        let base;
        if (!raw || raw.startsWith('/')) {
            server = await serve();
            base = `http://127.0.0.1:${server.address().port}`;
            if (raw) route = raw;
        } else {
            const url = new URL(raw);
            base = url.origin;
            if (!route && url.pathname !== '/') route = url.pathname;
        }
        const fragments = route ? (route.startsWith('/zephyy/fragments/') ? [route] : []) : FRAGMENTS;
        const pages = route ? (fragments.length ? [] : [route]) : PAGES;
        browser = await chromium.launch({ channel: 'chromium', executablePath: process.env.PW_CHROMIUM || undefined, args: ['--disable-3d-apis'] });
        const context = await browser.newContext();
        try {
            for (const fragment of fragments) await retryCheck(`fragment ${fragment}`, async () => {
                const state = { stage: 'request' };
                return [await check(`fragment ${fragment}`, state, [], async () => {
                    let res;
                    try { res = await context.request.get(base + fragment, { maxRedirects: 0, timeout: DEADLINE_MS }); }
                    catch (error) { throw fault(error.message, TRANSIENT.test(error.message)); }
                    assert(res.status() === 200 && !res.headers().location,
                        `expected HTTP 200 redirects 0, got HTTP ${res.status()}, location: ${res.headers().location || 'none'}`);
                })];
            });
        } finally { await context.close(); }
        for (const route of pages) for (const vp of VIEWPORTS) {
            if (route === '/zephyy') await checkPage(browser, base, route, vp, true);
            await checkPage(browser, base, route, vp);
        }
    } catch (error) { record('FAIL', 'profile runner', error.message); }
    finally {
        try { if (browser) await browser.close(); }
        catch (error) { record('FAIL', 'browser cleanup', error.message); }
        if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
        console.log(`\nsummary: ${passed} passed, ${failed} failed, ${unknown} UNKNOWN`);
        if (!failed && !unknown) console.log(`all ${passed} profile verification checks passed`);
        process.exitCode = failed ? 1 : unknown ? 2 : 0;
    }
})();
