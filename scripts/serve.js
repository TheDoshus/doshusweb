#!/usr/bin/env bun
// bun run serve [port] [host]: public/ at the addresses Firebase Hosting gives it (firebase.json's main target), for
// previews and the tests: clean URLs (/thelounge is thelounge.html, and thelounge.html redirects there), its redirects, and
// 404.html for a miss. Its headers aren't sent: the CSP's frame-ancestors would keep a page out of an editor's preview pane.
// Redirect sources are matched exactly (ours are plain paths; a glob one would need matching here first)
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')).hosting.find((t) => t.target === 'main');
const PUBLIC = path.join(ROOT, site.public);
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain', '.xml': 'application/xml' };
const file = (p) => { try { return fs.statSync(p).isFile() ? p : null; } catch { return null; } };

function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    const moved = (to, code = 301) => res.writeHead(code, { location: to + url.search }).end();
    const redirect = (site.redirects ?? []).find((r) => r.source === p);
    if (redirect) return moved(redirect.destination, redirect.type);
    if (site.cleanUrls && p.endsWith('.html')) return moved(p.slice(0, -5).replace(/\/index$/, '/'));
    const asked = path.join(PUBLIC, p);
    if (!asked.startsWith(PUBLIC)) return res.writeHead(403).end();
    const hit = file(asked) ?? file(path.join(asked, 'index.html')) ?? (site.cleanUrls ? file(`${asked}.html`) : null);
    const body = hit ?? path.join(PUBLIC, '404.html');
    res.writeHead(hit ? 200 : 404, { 'content-type': TYPES[path.extname(body)] ?? 'application/octet-stream' });
    fs.createReadStream(body).pipe(res);
}

// Resolves with the server once it listens (port 0: any free one)
const serve = (port = 0, host = '127.0.0.1') => new Promise((resolve) => { const s = http.createServer(handle).listen(port, host, () => resolve(s)); });

if (require.main === module) {
    const [port = 8080, host = '127.0.0.1'] = process.argv.slice(2);
    serve(+port, host).then(() => console.log(`public/ at http://${host}:${port}`));
}
module.exports = { serve };
