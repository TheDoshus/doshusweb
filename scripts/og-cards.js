#!/usr/bin/env node
// npm run og — screenshots each sitemap page's hero at 1200×630 into
// public/assets/images/og/<slug>.jpg, for og:image / twitter:image.
// The pages are the art: re-run after a hero changes. Needs Playwright
// (npm i -g playwright, or npx) and a Chromium it can launch.

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', 'public');
const OUT = path.join(ROOT, 'assets', 'images', 'og');
// Floating chrome and live widgets that don't belong on a card.
const HIDE = '.sticky-footer, .zephyy-orb-sitewide-wrapper, .zephyy-badge-link, .zp-orb-demo, '
    + '.zp-profile-nav, .zp-sub-nav, #zp-status-bar { display: none !important; }';

const pages = [...fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8')
    .matchAll(/<loc>https:\/\/doshus\.net\/([^<]*)<\/loc>/g)].map((m) => m[1]);

// Minimal static server with Firebase's cleanUrls behavior.
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = [url, `${url}.html`, `${url}/index.html`].map((u) => path.join(ROOT, u))
        .find((f) => f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile());
    if (!file) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
}).listen(0, async () => {
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    fs.mkdirSync(OUT, { recursive: true });
    for (const p of pages) {
        const slug = p.replace(/\//g, '-') || 'home';
        await page.goto(base + p, { waitUntil: 'load' });
        await page.addStyleTag({ content: HIDE });
        await page.waitForTimeout(2500); // let the star field and title effects settle
        await page.screenshot({ path: path.join(OUT, `${slug}.jpg`), type: 'jpeg', quality: 88 });
        console.log(`og: ${slug}.jpg`);
    }
    await browser.close();
    server.close();
});
