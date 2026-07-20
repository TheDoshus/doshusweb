# AGENTS.md — doshusweb

Cross-agent conventions for **doshus.net**. Governs how any coding agent — Claude Code, Zephyy, Codex, Opencode, or any model you bring — works on this codebase. Vanilla HTML/CSS/JS on Firebase Hosting: no frameworks, no build step; `public/` is served as-is. See `DOSHUS.md` for deploy workflow and `blueprint.md` for architecture/roadmap.

> **Single source of truth.** These are the project rules for every agent. `CLAUDE.md` is just the Claude-Code doorway and imports this file via `@AGENTS.md` — so edit rules *here*, not there. The root `~/.openclaw/AGENTS.md` still governs cross-project behavior (preserve Zephyy's identity, confirm external actions, etc.); this file adds the doshusweb-specific rules.

## Hard rules

- **oklch colors only.** No hex, no rgb/rgba anywhere in CSS. Black is `oklch(var(--space-oled))`, white is `oklch(var(--star-white))`.
- **Use the token system** in `public/css/shared.css`:
  - Tier 1 primitives hold raw `L C H` triples (e.g. `--brand-purple: 55% 0.28 290`) — always consumed as `oklch(var(--token))` or `oklch(var(--token) / alpha)`.
  - Tier 2 semantic tokens: `--accent-finance`, `--accent-crypto`, `--accent-taxes`, `--accent-invest`, `--accent-networth`, `--accent-lounge`, `--accent-amzn`, `--accent-myth`, `--accent-discord`. `--text-main` / `--text-muted` are **full colors** — use as `var(--text-muted)`, never re-wrapped in `oklch()`.
- **Accent routing pattern** for per-section theming: one custom property set per scope, shared rules consume it. Existing examples: `--sec` (finance.css), `--node-accent` (nexus.css), `--pill-accent` (home.css), `--swap-accent` (printmon swapbtn.css — per-theme-page button, `--pm-hue1` fallback themes generated pages). Extend this pattern; don't copy-paste per-section rule blocks.
- **CSP is strict** (chasing MDN Observatory 100). Adding any external fetch/iframe/script requires updating the CSP headers in `firebase.json` — in **both** hosting targets (`main` and `zephyy`). Scope to the tightest path that works (e.g. `https://discord.com/widget`, not `https://discord.com`).
- Fonts are self-hosted woff2 in `public/assets/fonts/` — no Google Fonts requests.

## Layout

| Path | What |
|---|---|
| `public/*.html` + `css/` + `js/` | Main site (home, financehub, thelounge, nexus, zephyy) |
| `public/css/shared.css` | Tokens, fonts, cosmic background, shared components |
| `public/js/main.js` | Global: stars engine, meme loader, collapsibles, sticky footer |
| `public/zephyy/` | Zephyy profile subpages |
| `public/amazon/` | Printmon + work tools — legacy tree, don't refactor casually |
| `public/assets/memes/` | Meme pool; regen index with `node generate-meme-list.js` |
| `firebase.json` | Hosting config + CSP/security headers (two targets) |

## Conventions

- **Grep before you write.** Before adding a new function, CSS token, util, or component, search `public/` for one that already does the job (`grep -rn "formatDate\|--accent-" public/`) — reuse or extend it, never spawn a parallel. A second date-helper or a duplicate token is a bug. This site's token + accent-routing system exists to be *extended*, not copy-pasted.
- JS is vanilla: guard for missing DOM elements (scripts are shared across pages), build user-facing strings with `createElement`/`textContent` (not innerHTML), keep console quiet in production paths.
- **No `?v=` cache-busters** on css/js references (Doshus's call 2026-07-16: low traffic, 7-day `max-age` self-heals). Don't reintroduce them; changed assets just take up to a week to propagate.
- Respect `prefers-reduced-motion` for any new animation (CSS override exists in shared.css; JS checks `prefersReducedMotion` in main.js).
- Random meme containers: any `.random-meme` / `.random-meme-fixed` div gets auto-filled by main.js from `meme-list.json`.

## Verify before committing

```bash
find public -name '*.js' -exec node -c {} \;   # JS syntax
python3 -c "import json; json.load(open('firebase.json'))"
# CSS brace balance (browsers won't error on this — a missed } silently eats rules)
for f in public/css/*.css; do python3 -c "
c=open('$f').read(); d=c.count('{')-c.count('}')
print('UNBALANCED: $f depth', d) if d else None"; done
python3 -m http.server 8080 -d public          # eyeball locally
```

Deploys are manual and preview-first — never auto-deploy (see DOSHUS.md).

## Session handoffs

Read the newest file in `handoff/` before starting work; append/create `handoff/YYYY-MM-DD.md` (today's date) with what you did + open items before wrapping up.
