# DOSHUS.md — doshusweb

doshus.net. Your public site — vanilla HTML/CSS/JS, Firebase Hosting.

---

## What It Is

Your creative canvas. Made by hand, no frameworks. Animations, custom fonts, interactive widgets. The Zephyy profile lives here at `/zephyy`.

## Key Files

| File | What |
|---|---|
| `blueprint.md` | Site architecture and roadmap |
| `GEMINI.md` | Gemini integration notes |
| `PAGE-NOTES.md` | Per-page change log and notes |
| `Github-Copilot-Doshusweb-Audit.md` | Copilot audit of the codebase |
| `generate-meme-list.js` | Printmon meme template generator |
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
| `node_modules/` | Dependencies (npm, for build tools) |

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
- **Chat orb XSS** — `renderContent()` in `zephyy.js` injects link labels/URLs/img alts unescaped into `innerHTML`. Display-only fix, safe anytime.
- **Chatorb release gate** — this branch proposes private `zephyy/chat/ownedSessions`, anonymous-auth owners and admin-only writes elsewhere. Production cutover is NOT approved or tested; see below.

## Chatorb development checkpoint

The companion backend is `scripts/bridges/chatorb.py` in the OpenClaw repo, branch
`feat/chatorb`. Its `scripts/bridges/orb/README.md` owns the full contract, remaining
work and coordinated cutover checklist. Both repositories must be reviewed together.

Run `node tests/chatorb-client.cjs` for the hermetic client test. This does not run
Firebase rules or prove a real browser can connect. Rules-emulator tests and a real
preview remain required before deployment. Firebase rule inheritance/validation
semantics: [official rules guide](https://firebase.google.com/docs/database/security/rules-conditions).

The new rules close old chat sessions and require admin claims for feedback reads
and non-chat writes. Enabling anonymous auth without those rules would broaden the
old authentication gates. Do not enable it as an isolated change. Likewise, old
widgets cached for seven days will fail against the new rules; settle the asset
cutover sequence before deploying. No query-string cache-busters are introduced.

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
cd ~/.openclaw/projects/doshusweb && node generate-meme-list.js

# Resync CSP hashes after editing any inline <script> in public/*.html
cd ~/.openclaw/projects/doshusweb && npm run csp:hashes

# See the live site (WSL2 → opens in Windows browser)
explorer.exe "https://doshus.net"
```

---

**This file lives at `~/.openclaw/projects/doshusweb/DOSHUS.md`.**
