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

**Two CSP headers ship on every page** (both hosting targets in `firebase.json`):

1. **`Content-Security-Policy`** — the live, enforced one. Still carries `'unsafe-inline' 'unsafe-eval'` for now. Untouched until Report-Only proves clean.
2. **`Content-Security-Policy-Report-Only`** — the tightened candidate: no `unsafe-eval`, inline scripts allowed by **sha256 hash** instead of `unsafe-inline`, stale Google Fonts entries removed. It can't break anything — browsers just log would-be violations to the DevTools console as `[Report Only]` lines.

**The watch-then-promote loop:**
- After deploying, browse the site (especially financehub — CoinGecko/Binance widgets) with DevTools open. `[Report Only]` lines = things the tightened policy would block.
- Console quiet for a few days → promote: copy the Report-Only value over the live CSP value (keep `frame-ancestors` from the old live one — Report-Only ignores that directive so it's only in the enforced header), in **both** targets.

**Inline script hashes — the button:**
```bash
npm run csp:hashes
```
Run it **any time you add or edit an inline `<script>` block** in any HTML file (even a 1-character change breaks the hash). It rescans `public/**/*.html`, skips `amazon/`, and rewrites the hash tokens in `firebase.json`. Idempotent — safe to run whenever, good predeploy habit. No schedule needed; hashes only go stale when inline script *content* changes.

**Quarantine zone:** `public/amazon/**` keeps its own permissive CSP (live + report-only) — legacy work tools, deliberately excluded from the strict policy and from the hash scan.

**npm deps:** the `firebase` npm package was removed (site loads the SDK from the gstatic CDN; with no build step the npm copy was inert). If a build step ever lands, `npm i firebase` brings it back.

**Deferred security work (don't lose these):**
- **Chat orb XSS** — `renderContent()` in `zephyy.js` re-inserts link labels/URLs/img alts unescaped into `innerHTML`. Display-side fix, safe to do anytime (doesn't touch message format or RTDB paths).
- **RTDB rules** — `zephyy/chat/sessions` is world-readable and `messages` world-writable. Needs a design pass **coordinated with agents-oc + Aether** (they read/write the same paths).
- **Amazon email + corp URLs** — currently hardcoded in `index.html`/`home.js`; plan is to move them to an RTDB config node fetched at runtime so they're out of the public repo.

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
