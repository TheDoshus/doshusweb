#!/usr/bin/env node
// Syncs CSP sha256 hashes for inline <script> blocks into firebase.json.
//
// Usage: npm run csp:hashes   (run after editing any inline <script> in public/)
//
// Scans public/**/*.html (skipping public/amazon/ — quarantine zone with its
// own permissive CSP), hashes every executable inline script, and rewrites the
// 'sha256-...' tokens in the script-src directive of:
//   - every Content-Security-Policy-Report-Only header
//   - any Content-Security-Policy header that already carries sha256 tokens
// so the same command keeps working when Report-Only gets promoted to live.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const FIREBASE_JSON = path.join(ROOT, 'firebase.json');

function walkHtml(dir, out) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'amazon' || entry.name === 'node_modules') continue;
            walkHtml(full, out);
        } else if (entry.name.endsWith('.html')) {
            out.push(full);
        }
    }
    return out;
}

// Executable inline scripts only: no src=, and no non-JS type (e.g. ld+json)
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

function collectHashes() {
    const hashes = [];
    for (const file of walkHtml(PUBLIC_DIR, [])) {
        const html = fs.readFileSync(file, 'utf8');
        let m;
        while ((m = SCRIPT_RE.exec(html))) {
            const attrs = m[1];
            const body = m[2];
            if (/\bsrc\s*=/i.test(attrs)) continue;
            const type = (attrs.match(/\btype\s*=\s*["']?([\w/+-]+)/i) || [])[1];
            if (type && !/^(text\/javascript|module|application\/javascript)$/i.test(type)) continue;
            if (!body.trim()) continue;
            const hash = crypto.createHash('sha256').update(body).digest('base64');
            hashes.push({ file: path.relative(ROOT, file), hash: `'sha256-${hash}'` });
        }
    }
    return hashes;
}

function syncScriptSrc(policy, hashTokens) {
    return policy.replace(/script-src[^;]*/, (directive) => {
        const kept = directive.trim().split(/\s+/).filter((t) => !t.startsWith("'sha256-"));
        const selfIdx = kept.indexOf("'self'");
        kept.splice(selfIdx >= 0 ? selfIdx + 1 : 1, 0, ...hashTokens);
        return kept.join(' ');
    });
}

function main() {
    const found = collectHashes();
    const tokens = [...new Set(found.map((f) => f.hash))];
    console.log(`Found ${found.length} inline script(s):`);
    for (const f of found) console.log(`  ${f.file}  ${f.hash}`);

    let raw = fs.readFileSync(FIREBASE_JSON, 'utf8');
    let updated = 0;
    raw = raw.replace(
        /("key":\s*"(Content-Security-Policy(?:-Report-Only)?)",\s*"value":\s*")([^"]+)(")/g,
        (m, pre, key, value, post) => {
            const isReportOnly = key.endsWith('Report-Only');
            const hasHashes = value.includes("'sha256-");
            // Leave permissive policies (amazon quarantine) and the live CSP alone
            // until it opts in by carrying hashes itself.
            if (!value.includes("default-src 'none'")) return m;
            if (!isReportOnly && !hasHashes) return m;
            updated++;
            return pre + syncScriptSrc(value, tokens) + post;
        }
    );
    fs.writeFileSync(FIREBASE_JSON, raw);
    JSON.parse(fs.readFileSync(FIREBASE_JSON, 'utf8')); // sanity: still valid JSON
    console.log(`Updated ${updated} CSP header(s) in firebase.json`);
}

main();
