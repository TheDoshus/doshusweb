#!/usr/bin/env bun
// bun run serve [port] [host]: public/ at the addresses Firebase Hosting gives it (firebase.json's main target), for
// previews and the tests: clean URLs (/thelounge is thelounge.html, and thelounge.html redirects there), its redirects, and
// 404.html for a miss. Firebase's own hosting emulator serves firebase.json exactly, headers too, but needs firebase-tools
// (Firebase Studio's dev.nix has none), and its headers can't go to a preview pane: the CSP's frame-ancestors keeps the page
// out of an editor's frame. Redirect sources are matched exactly (ours are plain paths; a glob one would need matching here)
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')).hosting.find((t) => t.target === 'main');
const PUBLIC = path.join(ROOT, site.public);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
const file = (p) => { try { return fs.statSync(p).isFile() ? p : null; } catch { return null; } };
const NOT_FOUND = path.join(PUBLIC, '404.html');
// public/ or below it, never a sibling (public-x/) or above
const inside = (p) => { const r = path.relative(PUBLIC, p); return !path.isAbsolute(r) && r !== '..' && !r.startsWith(`..${path.sep}`); };

function handle(req, res) {
    // A request that isn't a path (//x, a broken %-escape) gets a 400, never the server's end
    let url, p;
    try { url = new URL(req.url, 'http://x'); p = decodeURIComponent(url.pathname); } catch { return res.writeHead(400).end(); }
    if (!req.url.startsWith('/') || req.url.startsWith('//')) return res.writeHead(400).end();
    // Locations are built from the address as it came, still escaped, so they stay paths on this host
    const moved = (to, code = 301) => res.writeHead(code, { location: to + url.search }).end();
    const redirect = (site.redirects ?? []).find((r) => r.source === p);
    if (redirect) return moved(redirect.destination, redirect.type);
    const asked = path.join(PUBLIC, p);
    if (!inside(asked)) return res.writeHead(403).end();
    // name.html redirects to its clean address only when it's a page (Firebase: /zephyy/crew/index.html is /zephyy/crew)
    if (site.cleanUrls && p.endsWith('.html') && file(asked)) return moved(url.pathname.slice(0, -5).replace(/\/index$/, '') || '/');
    const hit = file(asked) ?? file(path.join(asked, 'index.html')) ?? (site.cleanUrls && !p.endsWith('.html') ? file(`${asked}.html`) : null);
    const found = hit && hit !== NOT_FOUND ? hit : null;
    res.writeHead(found ? 200 : 404, { 'content-type': TYPES[path.extname(found ?? NOT_FOUND)] ?? 'application/octet-stream' });
    fs.createReadStream(found ?? NOT_FOUND).pipe(res);
}

// Resolves with the server once it listens (port 0: any free one)
const serve = (port = 0, host = '127.0.0.1') => new Promise((resolve) => { const s = http.createServer(handle).listen(port, host, () => resolve(s)); });

if (require.main === module) {
    const [port = 8080, host = '127.0.0.1'] = process.argv.slice(2);
    serve(+port, host).then(() => console.log(`public/ at http://${host}:${port}`));
}
module.exports = { serve };
