#!/usr/bin/env node
// npm run check — the pre-commit checks from AGENTS.md § Verify, read-only.
// Prints one PASS/FAIL line per check and exits 1 if any fail. The
// generators run with --check, so drift is reported, never written.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

// Third-party code and the legacy Printmon tree (own CSP, own rules) are
// not ours to lint for color.
const NOT_OURS = /^public\/amazon\/|\/vendor\//;
// SVGs that carried hex before the lint existed. Shrink this list, never grow it.
const SVG_BASELINE = new Set([
    'Citi', 'amex', 'bofa', 'capone', 'chase', 'discordcon', 'discover', 'emailcon',
    'farcastercon', 'githubcon', 'instagramcon', 'playstationcon', 'popcorncon',
    'slackcon', 'spotifycon', 'twitchcon', 'youtubecon'
].map((n) => `public/assets/icons/${n}.svg`).concat('public/assets/images/Equifax_Logo.svg'));

// Broad CSP sources that stay on purpose: widgets need inline styles (Doshus
// tested dropping it, DOSHUS.md); images load from any https host.
const CSP_EXCEPTIONS = { 'style-src': ["'unsafe-inline'"], 'img-src': ['data:', 'https:'] };

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, out);
        else out.push(full);
    }
    return out;
}
const FILES = walk(ROOT);
const byExt = (...exts) => FILES.filter((f) => exts.includes(path.extname(f)));
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// ── color lint ──────────────────────────────────────────────────────────
const HEX = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi;
const FUNC = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab)\(/gi;
const NAMED = /(?<![-\w#.])(?:white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|gold|teal|navy|cyan|magenta|lime|maroon|olive|aqua|fuchsia)(?![-\w(])/gi;
// Blank out a match but keep its newlines, so reported line numbers stay true.
const blank = (m) => m.replace(/[^\n]/g, ' ');
const stripCss = (css) => css
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(["'])(?:\\.|(?!\1)[^\\\n])*\1/g, blank)
    .replace(/url\([^)]*\)/gi, blank);

function colorHits(text, offset = 0, named = true) {
    const hits = [];
    for (const re of named ? [HEX, FUNC, NAMED] : [HEX, FUNC]) {
        for (const m of text.matchAll(re)) hits.push({ index: offset + m.index, value: m[0] });
    }
    return hits;
}
// Values only (text after ':' that ends a declaration), so #id selectors never match.
function cssHits(css, offset = 0) {
    const clean = stripCss(css);
    const hits = [];
    for (const m of clean.matchAll(/:([^;{}]*)(?=[;}]|$)/g)) {
        hits.push(...colorHits(m[1], offset + m.index + 1));
    }
    return hits;
}
function htmlHits(html) {
    const hits = [];
    for (const m of html.matchAll(/(<style\b[^>]*>)([\s\S]*?)<\/style>/gi)) {
        hits.push(...cssHits(m[2], m.index + m[1].length));
    }
    for (const m of html.matchAll(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi)) {
        hits.push(...cssHits(m[2], m.index + m[0].indexOf(m[2])));
    }
    for (const m of html.matchAll(/\s(?:fill|stroke|stop-color|flood-color|lighting-color|color|bgcolor)\s*=\s*(["'])([^"']*)\1/gi)) {
        if (/^\s*url\(/i.test(m[2])) continue;
        hits.push(...colorHits(m[2], m.index + m[0].indexOf(m[2])));
    }
    return hits;
}
// JS: color functions anywhere, and string literals that are a hex color or
// CSS text containing one (": #fff"). Named colors are too ambiguous in JS.
function jsHits(js) {
    const hits = [];
    for (const m of js.matchAll(FUNC)) hits.push({ index: m.index, value: m[0] });
    for (const m of js.matchAll(/(["'`])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\1|:\s*#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b(?=[^\n]*["'`])/gi)) {
        hits.push({ index: m.index, value: m[0] });
    }
    return hits;
}

// ── checks ──────────────────────────────────────────────────────────────
function runGenerator(script) {
    const r = spawnSync(process.execPath, [path.join(__dirname, script), '--check'], { encoding: 'utf8' });
    if (r.status === 0) return [];
    const drift = r.stdout.split('\n').filter((l) => l.startsWith('Drift:'));
    return drift.length ? drift : [(r.stderr || r.stdout).trim().split('\n')[0]];
}

const CHECKS = {
    'js syntax': () => byExt('.js', '.cjs', '.mjs').flatMap((f) => {
        const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
        return r.status ? [`${rel(f)}: ${r.stderr.split('\n').find((l) => /Error/.test(l)) || 'syntax error'}`] : [];
    }),
    'json parses': () => byExt('.json').flatMap((f) => {
        try { JSON.parse(fs.readFileSync(f, 'utf8')); return []; } catch (e) { return [`${rel(f)}: ${e.message}`]; }
    }),
    'css braces balance': () => byExt('.css').flatMap((f) => {
        const css = stripCss(fs.readFileSync(f, 'utf8'));
        let depth = 0;
        for (let i = 0; i < css.length; i++) {
            if (css[i] === '{') depth++;
            else if (css[i] === '}' && --depth < 0) return [`${rel(f)}:${lineOf(css, i)}: unmatched }`];
        }
        return depth ? [`${rel(f)}: ${depth} unclosed {`] : [];
    }),
    'oklch only': () => FILES.flatMap((f) => {
        const name = rel(f);
        const ext = path.extname(f);
        if (NOT_OURS.test(name) || SVG_BASELINE.has(name)) return [];
        const lint = { '.css': cssHits, '.html': htmlHits, '.svg': htmlHits, '.js': jsHits }[ext];
        if (!lint || !name.startsWith('public/')) return [];
        const text = fs.readFileSync(f, 'utf8');
        return lint(text).map((h) => `${name}:${lineOf(text, h.index)}: ${h.value.trim()}`);
    }),
    // Doshus's standard: no unsafe or wildcard sources unless absolutely necessary.
    // Every standing exception is named in CSP_EXCEPTIONS.
    'csp stays strict': () => {
        const policies = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')).hosting
            .flatMap((t) => t.headers.flatMap((h) => h.headers))
            .filter((h) => h.key === 'Content-Security-Policy' && h.value.includes("default-src 'none'"))
            .map((h) => h.value);
        const problems = new Set(policies).size > 1 ? ['firebase.json: main and zephyy strict CSPs differ'] : [];
        for (const directive of (policies[0] || '').split(';')) {
            const [name, ...sources] = directive.trim().split(/\s+/);
            for (const s of sources) {
                if (/^'unsafe-|^\*$|^(https?|data|blob):$/.test(s) && !(CSP_EXCEPTIONS[name] || []).includes(s)) {
                    problems.push(`firebase.json: ${name} ${s}`);
                }
            }
        }
        // Inline handlers and javascript: URLs are dead under this CSP: the browser refuses them.
        return problems.concat(byExt('.html').filter((f) => !NOT_OURS.test(rel(f))).flatMap((f) => {
            const html = fs.readFileSync(f, 'utf8');
            return [...html.matchAll(/<[^>]*?\s(on[a-z]+\s*=|(?:href|src|action)\s*=\s*["']\s*javascript:)/gi)]
                .map((m) => `${rel(f)}:${lineOf(html, m.index)}: ${m[1].trim()}`);
        }));
    },
    'csp hashes current': () => runGenerator('update-csp-hashes.js'),
    'zephyy nav stamp': () => runGenerator('sync-zephyy-nav.js'),
    'zephyy chat stamp': () => runGenerator('sync-zephyy-chat.js')
};

let failed = 0;
for (const [name, run] of Object.entries(CHECKS)) {
    const problems = run();
    console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${name}`);
    for (const p of problems) console.log(`      ${p}`);
    if (problems.length) failed++;
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exitCode = failed ? 1 : 0;
