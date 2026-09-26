# DOSHUS.md — doshusweb

doshus.net. Your public site — vanilla HTML/CSS/JS, Firebase Hosting.

---

## What It Is

Your creative canvas. Made by hand, no frameworks. Animations, custom fonts, interactive widgets. The Zephyy profile lives here at `/zephyy`.

## Key Files

| File | What |
|---|---|
| `AGENTS.md` | Rules for every coding agent (Claude, Gemini, Codex, Zephyy) |
| `blueprint.md` | Site architecture and roadmap |
| `INTERNAL-SYNC.md` | Printmon changes waiting to be mirrored to the Amazon-internal copy |
| `scripts/generate-meme-list.js` | `npm run memes` — rebuilds `public/assets/memes/meme-list.json` after adding memes |
| `scripts/sync-zephyy-{nav,chat}.js` | `npm run sync:zephyy` — re-stamps the Zephyy subpages' nav bar and chat orb from `public/zephyy.html` |
| `firebase.json` | Firebase Hosting config + CSP/security headers (both targets) |
| `database.rules.json` | Firebase RTDB security rules |
| `scripts/update-csp-hashes.js` | Recomputes CSP hashes for inline scripts (`npm run csp:hashes`) |

## Key Folders

| Path | What |
|---|---|
| `public/` | All site files — HTML, CSS, JS, images, fonts |
| `public/zephyy/` | Zephyy profile page assets |
| `public/amazon/` | Printmon gallery and related pages |
| `public/assets/` | Shared assets (fonts, images, icons) |

## Quick Reference

- **Hosting:** Firebase Hosting, branch `main`
- **Deploy:** `firebase deploy --only hosting` (no auto-deploy)
- **Dev:** Open `public/` in browser or run a local server
- **RTDB:** `doshusweb-default-rtdb.firebaseio.com` — feedback, chat orb, Zephyy daily thoughts

For workspace layout and Zephyy's files: `~/.openclaw/workspace/DOSHUS.md`

## Security / CSP Playbook

**`Content-Security-Policy`** is strict (Observatory A+ 105/100, 2026-07-10): script-src has no `unsafe-inline`/`unsafe-eval`; inline scripts run via sha256 hashes only.

**Testing a stricter policy later** (e.g. dropping `unsafe-inline` from style-src): temporarily add a `Content-Security-Policy-Report-Only` header with the candidate policy to both targets, browse with DevTools open (`[Report Only]` lines = would-be blocks; ignore ones from `content.js` — that's browser extensions), promote when quiet, remove the RO header.

**Edited an inline `<script>`?** → `npm run csp:hashes` (rewrites the hash tokens in firebase.json; idempotent, good predeploy habit).

**RTDB rules:** edit `database.rules.json` → `firebase deploy --only database`. Repo is source of truth, console Rules tab is the mirror. `npm run deploy` does NOT push rules.

**Work links:** Amazonian Spot pills + work email live in RTDB `/config/worklinks`, not the repo. Edit in the Firebase console — live instantly, no deploy. Node missing/unreachable → section degrades gracefully (no pills, toggle hidden, email blurred).

**Quarantine:** `public/amazon/**` keeps its own loose CSP — excluded from the strict policy and the hash scan.

**Deferred security work (don't lose these):**
- **Chatorb follow-through** — abuse admission, retention, processing health and browser/action verification remain in the backend contract below.

## Chatorb

The live client uses private `zephyy/chat/ownedSessions` with anonymous-auth owners.
`database.rules.json` rejects priority metadata on client-writable nodes and requires
admin claims for non-chat writes. Keep matching client, rules and backend revisions
in the normal main branches before deploying; deploying an older branch can undo
these protections. The backend contract and remaining work live in
`~/.openclaw/scripts/bridges/orb/README.md`.

Run these from this repository:

```bash
node tests/chatorb-client.cjs
firebase emulators:exec --only database --project doshusweb "python3 tests/rules-emulator.py"
```

The client VM checks wiring; the real local emulator checks ownership, validation,
priority metadata and atomic writes. Neither proves production token verification,
browser CSP or persisted anonymous identity. The backend uses an administrative
Firebase credential: its assistant replies and journal writes depend on rules bypass.
A scoped credential migration requires a matching backend/rules design.

## Quick Commands for You

```bash
# Run a local dev server
cd ~/.openclaw/projects/doshusweb && python3 -m http.server 8080 -d public
# Then open http://localhost:8080

# Check what's changed in public/
ls -lt ~/.openclaw/projects/doshusweb/public/ | head -15

# Syntax-check JS files before committing
find ~/.openclaw/projects/doshusweb/public -name '*.js' -exec node -c {} \;

# Check RTDB rules
cat ~/.openclaw/projects/doshusweb/database.rules.json

# Preview channel FIRST (rule: previews before production deploys)
cd ~/.openclaw/projects/doshusweb && firebase hosting:channel:deploy preview

# Deploy to production (manual only — no auto-deploy)
cd ~/.openclaw/projects/doshusweb && npm run deploy

# Regenerate the meme list after dropping new memes in assets/memes/
cd ~/.openclaw/projects/doshusweb && npm run memes

# Re-stamp the Zephyy subpages (nav bar + chat orb) after editing public/zephyy.html
cd ~/.openclaw/projects/doshusweb && npm run sync:zephyy

# Resync CSP hashes after editing any inline <script> in public/*.html
cd ~/.openclaw/projects/doshusweb && npm run csp:hashes

# See the live site (WSL2 → opens in Windows browser)
explorer.exe "https://doshus.net"
```

---

**This file lives at `~/.openclaw/projects/doshusweb/DOSHUS.md`.**
