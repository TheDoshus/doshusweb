#!/usr/bin/env bun
// bun run check — the pre-commit checks from AGENTS.md § Verify, read-only.
// Prints one PASS/FAIL line per check and exits 1 if any fail. The
// generators run with --check, so drift is reported, never written.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readdirSorted = require('./lib/readdir-sorted');

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
    for (const e of readdirSorted(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', '.claude', '.firebase'].includes(e.name)) continue;  // deps, VCS, agent worktrees, deploy cache
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

// Parse without running; `node --check` is the syntax oracle. It is called by name, not as
// process.execPath: under bun that is bun, and `bun --check` EXECUTES the file (bun 1.4.2).
// With no node on PATH, Bun's transpiler parses instead, and it misses module-goal errors
// (`import` in a .cjs, top-level `return` in a .mjs), so its result says so.
function syntaxError(f) {
    const r = spawnSync('node', ['--check', f], { encoding: 'utf8' });
    if (!r.error) return r.status ? r.stderr.split('\n').find((l) => /Error/.test(l)) || 'syntax error' : null;
    if (!globalThis.Bun) throw r.error;
    try {
        new Bun.Transpiler({ loader: 'js' }).transformSync(fs.readFileSync(f, 'utf8'));
        return null;
    } catch (e) {
        const first = e.errors?.[0] ?? e;
        return `${first.position?.line ?? '?'}: ${first.message} (bun parse: node not on PATH)`;
    }
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
        const err = syntaxError(f);
        return err ? [`${rel(f)}: ${err}`] : [];
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
    'zephyy orb stamp': () => runGenerator('sync-zephyy-orb.js'),
    'crew facts stamp': () => runGenerator('sync-zephyy-crew.js'),
    // A board's name and its panels' ids key every visitor's saved layout (UI-SPEC.md), so a
    // reused name or id mixes two saves; cells sit inside the wide grid board.css sets, at least
    // its narrowest panel wide, and the default panels don't overlap. A panel is a direct child
    // of its board, as board.js reads it, so the markup is walked tag by tag (comments blanked),
    // a board in a panel's body (UI-SPEC § Boards in a panel) checked as one of its own
    'boards are well-formed': () => {
        const css = fs.readFileSync(path.join(ROOT, 'public/css/board.css'), 'utf8');
        // Each tier's grid: every board's, then the window tiers' (a board in a panel gets the same
        // grids from container queries)
        const grid = (re) => { const m = css.match(re); return m && { cols: +m[1], minCols: +m[2] }; };
        const at = (w) => new RegExp(`@media \\(max-width: ${w}px\\) \\{\\s*\\.board:not\\(\\.panel \\.board\\) \\{[^}]*--cols:\\s*(\\d+)[^}]*--min-cols:\\s*(\\d+)`);
        const tiers = { '': grid(/(?:^|\n)\.board \{[^}]*--cols:\s*(\d+)[^}]*--min-cols:\s*(\d+)/), mid: grid(at(1080)), phone: grid(at(640)) };
        if (!Object.values(tiers).every(Boolean)) return ['public/css/board.css: a tier grid the board lint reads is gone (.board, and the 1080px and 640px window tiers)'];
        const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
        const OPTIONAL = /^(p|li|dt|dd|option|optgroup|tr|td|th|thead|tbody|tfoot|colgroup|caption|rt|rp)$/i; // end tag may be left out
        const TAG = /<(\/?)([a-z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/gi;
        const attrs = (s) => Object.fromEntries([...s.matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)]
            .map((m) => [m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '']));
        const names = new Map();
        const problems = [];
        for (const f of byExt('.html').filter((f) => rel(f).startsWith('public/'))) {
            const html = fs.readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
            const ids = new Set();
            const open = []; // the boards being walked, innermost last: how deep each is, and its panels' cells so far
            const stack = []; // every open element's tag: counting depth alone lets an ancestor's end tag stand in for a missing one
            for (const m of html.matchAll(TAG)) {
                const [, close, tag, rest] = m;
                const line = `${rel(f)}:${lineOf(html, m.index)}`;
                const board = open.at(-1);
                // A panel body's content sits in elements: the engine reads its height off theirs
                if (board?.body && board.body === board.depth && html.slice(board.at, m.index).trim()) problems.push(`${line}: bare text in a panel body (wrap it in an element)`);
                open.forEach((b) => { b.at = m.index + m[0].length; });
                if (close) {
                    // What it closes, with anything open inside it (each board's depth drops by all of them, so an
                    // end tag left out where it may be doesn't skew it); one whose end tag can't be left out is missing
                    const i = stack.lastIndexOf(tag.toLowerCase());
                    const shut = i < 0 ? [] : stack.splice(i);
                    const left = shut.slice(1).filter((t) => !OPTIONAL.test(t));
                    if (open.length && i < 0) problems.push(`${line}: </${tag}> closes nothing open`);
                    if (open.length && left.length) problems.push(`${line}: <${left.join('>, <')}> never closed before </${tag}>`);
                    open.forEach((b) => { b.depth -= shut.length; });
                    while (open.at(-1)?.depth <= 0) {
                        // A tier the page lays out itself names every panel's cells, or the engine flows it
                        const done = open.pop();
                        for (const tier of ['mid', 'phone']) if (done.named[tier] && done.named[tier] < done.count) problems.push(`${done.line}: ${done.named[tier]} of ${done.count} panels have data-${tier}; give every panel its ${tier} cells or none`);
                    }
                    if (open.includes(board) && board.depth < board.body) board.body = 0;
                    continue;
                }
                if (VOID.test(tag) || m[0].endsWith('/>')) continue; // opens nothing, e.g. an SVG <path/>
                stack.push(tag.toLowerCase());
                const a = attrs(rest);
                const depth = board?.depth;
                open.forEach((b) => b.depth++);
                if ('data-board' in a) {
                    if (names.has(a['data-board'])) problems.push(`${line}: board "${a['data-board']}" also in ${names.get(a['data-board'])}`);
                    names.set(a['data-board'], line);
                    open.push({ depth: 1, line, cells: { '': [], mid: [], phone: [] }, named: { mid: 0, phone: 0 }, count: 0 });
                    continue;
                }
                if (!board) continue;
                if (a.class?.split(/\s+/).includes('panel-body')) board.body = board.depth;
                if (depth !== 1 || !a.class?.split(/\s+/).includes('panel')) continue;
                const id = a.id;
                if (!id || ids.has(id)) problems.push(`${line}: panel id ${id ? `"${id}" repeats` : 'missing'}`);
                ids.add(id);
                board.count++;
                // The wide cells (data-x/y/w/h), and a smaller tier's where the page lays it out itself
                // (data-mid / data-phone: "x y w h")
                for (const [tier, { cols, minCols }] of Object.entries(tiers)) {
                    const raw = tier ? a[`data-${tier}`] : ['x', 'y', 'w', 'h'].map((k) => a[`data-${k}`]).join(' ');
                    if (tier && raw === undefined) continue;
                    if (tier) board.named[tier]++;
                    const parts = raw.trim().split(/\s+/).map(Number);
                    const [x, y, w, h] = parts;
                    const at = tier ? `${tier} cells` : 'cells';
                    if (parts.length !== 4 || !parts.every((n) => Number.isInteger(n) && n > 0) || w < minCols || x + w - 1 > cols) {
                        problems.push(`${line}: ${id} ${at} "${raw}": four whole numbers inside a ${cols}-column grid (≥ ${minCols} wide)`);
                        continue;
                    }
                    for (const o of board.cells[tier]) {
                        if (x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h) problems.push(`${line}: ${id} overlaps ${o.id}${tier && ` in the ${tier} tier`}`);
                    }
                    board.cells[tier].push({ id, x, y, w, h });
                }
            }
            if (open.length) problems.push(`${rel(f)}: a board is never closed (the file ends inside it)`);
        }
        return problems;
    },
    // The Printmon orb docks are styled by their own sheet; a page with a dock and without it
    // shows the floating site-wide orb instead (the theme pages run under a <base> to doshus.net)
    'orb docks link their sheet': () => byExt('.html').filter((f) => {
        const html = fs.readFileSync(f, 'utf8');
        return /\b(?:printmon|gallery)-dock\b/.test(html) && !html.includes('zephyy-orb-dock.css');
    }).map((f) => `${rel(f)}: has a Printmon orb dock but no css/zephyy-orb-dock.css`),
    // A picture in a page's markup carries its file's width and height, so its room is held before it arrives (CSS that
    // sets its width sets height: auto with it). Printmon's pages and the vendored copies are their own
    'pictures carry their size': () => byExt('.html').filter((f) => /^public\/(?!amazon\/|zephyy\/vendor\/)/.test(rel(f))).flatMap((f) => {
        const html = fs.readFileSync(f, 'utf8');
        return [...html.matchAll(/<img\b[^>]*>/g)].filter((m) => !/\swidth="\d+"/.test(m[0]) || !/\sheight="\d+"/.test(m[0]))
            .map((m) => `${rel(f)}:${lineOf(html, m.index)}: <img> with no width and height: ${m[0].match(/src="([^"]*)"/)?.[1] ?? '?'}`);
    }),
    // Every public page is in the sitemap, and every sitemap URL is a page.
    'sitemap matches pages': () => {
        const listed = new Set([...fs.readFileSync(path.join(ROOT, 'public/sitemap.xml'), 'utf8')
            .matchAll(/<loc>https:\/\/doshus\.net\/([^<]*)<\/loc>/g)].map((m) => m[1]));
        const pages = new Set(byExt('.html').map(rel)
            .filter((f) => /^public\/(?!404\.)[^/]+\.html$|^public\/zephyy\/[^/]+\/index\.html$/.test(f))
            .map((f) => f.replace(/^public\/|(index)?\.html$|\/index\.html$/g, '')));
        return [...pages].filter((p) => !listed.has(p)).map((p) => `missing from sitemap: /${p}`)
            .concat([...listed].filter((p) => !pages.has(p)).map((p) => `sitemap lists no page: /${p}`));
    },
    // RFC 9116: a way to reach Doshus, one Expires (past it, scanners treat the file as stale) and its own
    // address. It fails 30 days out, so the date is renewed, to under a year ahead, before it lapses
    'security.txt is current': () => {
        const file = 'public/.well-known/security.txt';
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        const field = (k) => [...text.matchAll(new RegExp(`^${k}:[ \\t]*(\\S+)[ \\t]*$`, 'gim'))].map((m) => m[1]);
        const contact = field('Contact'), expires = field('Expires'), canonical = field('Canonical');
        // RFC 3339 date-time with its zone, as the RFC requires (Date.parse would take a bare date too)
        const days = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/i.test(expires[0]) ? (Date.parse(expires[0]) - Date.now()) / 864e5 : NaN;
        return [
            ...!contact.length ? ['no Contact'] : contact.filter((c) => !/^(mailto|https|tel):/.test(c)).map((c) => `Contact ${c} isn't a mailto:, https: or tel: URI`),
            ...expires.length !== 1 ? [`${expires.length} Expires fields, not one`] : !(days > 30) ? [`Expires ${expires[0]} is ${Number.isNaN(days) ? 'not an RFC 3339 date-time with its zone' : `${Math.round(days)} days out`}: renew it, to under a year ahead`]
                : days >= 365 ? [`Expires ${expires[0]} is a year or more out (RFC 9116 asks for under one)`] : [],
            // Both hosts serve the file (one public/ folder, files before rewrites), so both are its address
            ...['doshus.net', 'zephyy.doshus.net'].map((h) => `https://${h}/.well-known/security.txt`).filter((u) => !canonical.includes(u)).map((u) => `no Canonical: ${u}`),
        ].map((p) => `${file}: ${p}`);
    }
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
