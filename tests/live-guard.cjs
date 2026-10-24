#!/usr/bin/env bun
// scripts/live-guard.js: what a release would drop from live. Offline: fixture trees, a scratch git
// repo, no Hosting API. Run: bun tests/live-guard.cjs (part of bun run test).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { localPaths, gitDeleted, drops } = require('../scripts/live-guard.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'live-guard-'));
const put = (f) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'x'); };
const git = (...a) => assert.equal(spawnSync('git', a, { cwd: tmp, encoding: 'utf8' }).status, 0, a.join(' '));
try {
    const pub = path.join(tmp, 'public');
    for (const f of ['index.html', '.well-known/security.txt', '.DS_Store', 'a/.hidden', 'node_modules/x/i.js', 'firebase.json'])
        put(path.join(pub, f));
    const ignore = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firebase.json'), 'utf8')).hosting[0].ignore;
    assert.deepEqual([...localPaths(pub, ignore)].sort(), ['/.well-known/security.txt', '/index.html'],
        "firebase.json's own ignore keeps .well-known and drops dot files, node_modules and firebase.json");

    const live = new Set(['/index.html', '/gone.html', '/studio-only.html', '/__/firebase/init.js']);
    const local = new Set(['/index.html']);
    assert.deepEqual(drops(live, local, new Set(), new Set()), ['/gone.html', '/studio-only.html'],
        'a live path the release lacks is a drop; Hosting\'s own /__/ files never are');
    assert.deepEqual(drops(live, local, new Set(['/gone.html']), new Set()), ['/studio-only.html'],
        'a path git deleted is an intended removal');
    assert.deepEqual(drops(live, local, new Set(), new Set(['/studio-only.html', '/gone.html'])), [],
        'DOSHUSWEB_ALLOW_DROP names intended removals');

    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    put(path.join(pub, 'gone.html')); put(path.join(pub, 'old.html'));
    git('add', '-A', 'public'); git('commit', '-qm', 'add');
    git('rm', '-q', 'public/gone.html'); git('mv', 'public/old.html', 'public/new.html'); git('commit', '-qm', 'rm');
    assert.deepEqual([...gitDeleted(tmp, pub)].sort(), ['/gone.html', '/old.html'],
        'git deletions, renames included, read back as live paths');
    assert.ok([...gitDeleted(tmp, tmp)].includes('/public/gone.html'),
        'a public folder at the repo root reads deletions as live paths too');

    fs.mkdirSync(path.join(pub, 'linked'));
    fs.symlinkSync(path.join(pub, 'index.html'), path.join(pub, 'linked', 'page.html'));
    assert.ok(localPaths(pub, ignore).has('/linked/page.html'), 'a symlinked file deploys: firebase-tools follows links');
    console.log('PASS  live guard: 7 cases');
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}
