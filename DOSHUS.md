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
| `firebase.json` | Firebase Hosting config |
| `database.rules.json` | Firebase RTDB security rules |

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

# See the live site (WSL2 → opens in Windows browser)
explorer.exe "https://doshus.net"
```

---

**This file lives at `~/.openclaw/projects/doshusweb/DOSHUS.md`.**
