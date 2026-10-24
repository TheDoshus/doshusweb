#!/usr/bin/env bun
// Predeploy: refuse a release that drops a live file git never deleted. A deploy replaces the
// whole live tree, so a file that reached live outside git (a Firebase Studio deploy) goes with
// nothing saying so: ⚰️ 2026-10-24, a deploy from git took the Chiikawa Printmon theme offline.
// It reads the live release's paths through the Hosting REST API with the token `firebase deploy`
// refreshed just before this hook (its configstore), and compares paths, never hashes: Firebase
// hashes each file gzipped, and gzip differs per machine. An intended removal is deleted in git,
// or named in DOSHUSWEB_ALLOW_DROP (comma-separated live paths; `*` deploys whatever live holds,
// unread live list included). A preview channel deploy runs it too, on purpose: a preview
// rehearses the live deploy, so the drop it would make is caught there first.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const API = 'https://firebasehosting.googleapis.com/v1beta1';
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// What a deploy uploads: every file under public/ that firebase.json's ignore globs leave. Bun.Glob
// matches them as Firebase does: `**/.*` skips a dot-named file, never a file in .well-known/.
function localPaths(publicDir, ignore) {
    const globs = ignore.map((g) => new Bun.Glob(g));
    const out = new Set();
    // followSymlinks: firebase-tools' lister follows them (lib/listFiles.js, follow: true)
    for (const f of new Bun.Glob('**/*').scanSync({ cwd: publicDir, dot: true, onlyFiles: true, followSymlinks: true })) {
        const p = f.split(path.sep).join('/');
        if (!globs.some((g) => g.match(p))) out.add('/' + p);
    }
    return out;
}

// Live paths under publicDir that git recorded deleting (renames count as a delete).
function gitDeleted(root, publicDir) {
    const rel = path.relative(root, publicDir).split(path.sep).join('/');
    const r = spawnSync('git', ['log', '--no-renames', '--diff-filter=D', '--format=', '--name-only', '--', rel || '.'],
        { cwd: root, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git log exited ${r.status}: ${(r.stderr || '').trim()}`);
    return new Set(r.stdout.split('\n').filter(Boolean).map((f) => '/' + f.slice(rel ? rel.length + 1 : 0)));
}

// The live paths this release would drop: not local, not Hosting's own /__/ files, never deleted
// in git, not named as an intended removal.
const drops = (live, local, deleted, allow) => [...live]
    .filter((p) => !local.has(p) && !p.startsWith('/__/') && !deleted.has(p) && !allow.has(p)).sort();

function accessToken() {
    const store = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
        'configstore', 'firebase-tools.json');
    const conf = readJson(store);
    // The account firebase-tools deploys as: this project's, else the global default (lib/auth.js
    // getProjectDefaultAccount); it refreshes that account's tokens wherever they are stored.
    const email = conf.activeAccounts?.[process.env.PROJECT_DIR || ROOT];
    const { tokens } = !email || email === conf.user?.email ? conf
        : (conf.additionalAccounts || []).find((a) => a.user?.email === email) || {};
    if (!tokens?.access_token || !(tokens.expires_at > Date.now())) throw new Error(`no fresh token in ${store}`);
    return tokens.access_token;
}

async function livePaths(site, token) {
    const get = async (url) => {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) throw new Error(`${url.slice(API.length)}: HTTP ${r.status}`);
        return r.json();
    };
    const version = (await get(`${API}/sites/${site}/channels/live`)).release?.version?.name;
    const paths = new Set();
    for (let page = ''; version;) {  // a site never released, or disabled, has nothing live to drop
        const d = await get(`${API}/${version}/files?pageSize=1000${page && `&pageToken=${encodeURIComponent(page)}`}`);
        for (const f of d.files || []) paths.add(f.path);
        if (!(page = d.nextPageToken)) break;
    }
    return { version: (version || 'none').split('/').pop(), paths };
}

// The sites of every target deployed from this public/ (one today: main → doshusweb). A hook is
// not told which target it runs for, so targets sharing a folder are all held to it.
function sites(project, targets) {
    const mapped = readJson(path.join(ROOT, '.firebaserc')).targets?.[project]?.hosting || {};
    return [...new Set(targets.flatMap((t) => t.site ? [t.site] : mapped[t.target] || [project]))];
}

async function guard(site, local, deleted, allow) {
    let live;
    try {
        live = await livePaths(site, accessToken());
    } catch (e) {
        if (allow.has('*')) return console.log(`UNKNOWN  live guard: ${site}: ${e.message}; deploying anyway (DOSHUSWEB_ALLOW_DROP=*)`), true;
        return console.error(`FAIL  live guard: ${site}: live release UNREAD (${e.message}). Run \`firebase login\`, `
            + 'or deploy blind with DOSHUSWEB_ALLOW_DROP=*'), false;
    }
    const lost = allow.has('*') ? [] : drops(live.paths, local, deleted, allow);
    if (!lost.length) return console.log(`PASS  live guard: ${site}: drops nothing live (live ${live.version}: `
        + `${live.paths.size} files; this release ${local.size})`), true;
    console.error(`FAIL  live guard: ${site}: live ${live.version} serves ${lost.length} file(s) this release drops `
        + `and git never deleted:\n${lost.map((p) => `  ${p}`).join('\n')}\nCommit them from wherever they were deployed `
        + `and pull, or name an intended removal: DOSHUSWEB_ALLOW_DROP=${lost.join(',')}`);
    return false;
}

async function main() {
    const project = process.env.GCLOUD_PROJECT || readJson(path.join(ROOT, '.firebaserc')).projects.default;
    const publicDir = path.resolve(process.env.RESOURCE_DIR || path.join(ROOT, 'public'));
    const targets = [readJson(path.join(ROOT, 'firebase.json')).hosting].flat()
        .filter((t) => path.resolve(ROOT, t.public) === publicDir);
    if (!targets.length) throw new Error(`no hosting target deploys ${publicDir}`);
    const local = localPaths(publicDir, targets[0].ignore || []);
    const deleted = gitDeleted(ROOT, publicDir);
    const allow = new Set((process.env.DOSHUSWEB_ALLOW_DROP || '').split(',').map((s) => s.trim()).filter(Boolean));
    let ok = true;
    for (const site of sites(project, targets)) ok = (await guard(site, local, deleted, allow)) && ok;
    process.exit(ok ? 0 : 1);
}

if (require.main === module) main().catch((e) => { console.error(`FAIL  live guard: ${e.stack || e}`); process.exit(1); });
module.exports = { localPaths, gitDeleted, drops };
