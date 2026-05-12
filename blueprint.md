# doshus.net — Blueprint

> **Single source of truth for doshus.net structure, design, and features.**
> Read before every change. Update after every change.

---

## Overview

Cosmic-themed personal website by Doshus. Vanilla HTML/CSS/JS, Firebase Hosting, OKLCH design system. No frameworks, no build step.

- **Live:** https://doshus.net
- **GitHub:** `TheDoshus/doshusweb`
- **Hosting:** Firebase Hosting (static only)
- **Deploy:** GitHub Actions (on push to `main`)
- **Coding conventions:** `GEMINI.md`

---

## Site Map

| Page | URL | Purpose |
|---|---|---|
| `index.html` | `/` | Home — socials, portal to sub-pages |
| `nexus.html` | `/nexus` | Tech repository — bento grid of dev tools, rig specs, bookmarks |
| `financehub.html` | `/financehub` | Finance card slider — credit, crypto, investing, taxes, credit report |
| `thelounge.html` | `/thelounge` | Entertainment — games, interesting sites, memes |
| `zephyy.html` | `/zephyy` | Zephyy profile page — full intro, capabilities, terminal, values |
| `404.html` | 404 | Error page with astronaut animation |

---

## Design Tokens (shared.css)

**Color system:** OKLCH throughout.

### Brand colors (lightness chroma hue):
- `--brand-green`: `69% 0.28 145` — Finance
- `--brand-purple`: `55% 0.28 290` — Crypto / links
- `--brand-blue`: `70% 0.28 235` — Taxes
- `--brand-gold`: `82% 0.21 86` — Investing
- `--brand-teal`: `78% 0.23 185` — Net worth / Zephyy
- `--brand-pink`: `65% 0.27 340` — Lounge
- `--brand-amazon`: `66% 0.21 50` — Amazonian spot
- `--brand-red`: `65% 0.33 30` — Errors

### Cosmic nebula primitives:
- `--nebula-purple`, `--nebula-blue`, `--nebula-pink`

### Background/Text:
- `--space-oled`: `0% 0 0` (pure black)
- `--bg-main`, `--text-main`, `--text-muted`

### Semantic tokens:
- `--accent-finance`, `--accent-crypto`, `--accent-taxes`, `--accent-invest`, etc.

### Fonts:
13 self-hosted display fonts via `@font-face` (Chango, Mouse Memoirs, Nata Sans, Rampart One, Braah One, Carter One, Bungee Inline, Jaro, Shrikhand, Ceviche One, Shojumaru, Fugaz One). Body uses `Nata Sans`; system-ui fallback.

---

## Shared Components

### Cosmic Background (`shared.css`)
- Fixed full-viewport gradient background with 40s deep space drift animation
- Parallax star field generated in `main.js` — 245 stars across 3 layers (far/mid/close), performance-aware (FPS throttle at <25fps, recovers at 30fps)

### Sticky Footer (`shared.css` + `main.js`)
- Auto-hides on scroll down, shows on scroll up, always visible near bottom of page
- Navigation icons with SVG links; hidden on mobile
- Each page sets `.footer-active` class on current page's nav link

### Collapsible Accordions (`shared.css` + `main.js`)
- Universal `.collapse` / `.collapseBtn` / `.collapseBody` pattern
- Used on financehub, nexus, and other data-dense pages

### CTA Popup (`home.css` + `home.js`)
- Modal overlay with navigation buttons to sections
- Animated fadeIn + slideUp; closes on X, backdrop click, or Escape

### Pill Buttons (`home.css`)
- `.pillBtn` — gradient-styled link buttons with hover glow + translateX animation
- Variants: `amzn`, `lounge`, `reg`, `fin`

### Universal Meme Loader (`main.js`)
- Fetches `meme-list.json`, injects random meme into any `.random-meme` or `.random-meme-fixed` container
- Supports images and videos

---

## Page Details

### index.html — Home
**CSS:** `shared.css`, `home.css`, `zephyy-widget.css`
**JS:** `main.js`, `home.js`, `zephyy-widget.js`

- Hero with animated gradient title + CTA button → modal
- Social media carousel (10 icons, horizontal scroll)
- Desert Diamond Auto Detailing promo with float animation
- Grid sections: Amazonian Spot, Lounge, Finance Hub
- Amazon link toggle (internal/external, persisted to localStorage)
- Slack handle reveal-on-click
- "Meet Zephyy" link in CTA modal
- Spotify embed (random playlist from 10 options)

### nexus.html — The Nexus
**CSS:** `shared.css`, `nexus.css`, `zephyy-widget.css`
**JS:** `main.js`, `zephyy-widget.js`

- Bento grid: 12-column layout with dense auto-flow
- Nodes: Dev Core (tall), The Rig (wide), Frequencies (square), Blackbox (jumbo), Stack (mini), Signals (mini)
- Meme nodes interspersed for asymmetry
- Accordions contain command tips with name/desc/cmd/link format
- Per-node accent color routing via CSS variable overrides
- Hero stats (pulse dot, 06 nodes, ~80ms latency)

### financehub.html — Finance Hub
**CSS:** `shared.css`, `finance.css`
**JS:** `main.js`, `finance.js`

- Card slider with animated slide transitions
- Navigation bar with dot indicators + progress fill line
- 5 slides: Credit & Banking, Crypto, Investing, Taxes, My Credit
- Touch swipe support, keyboard arrows, localStorage position memory
- Credit card grid with tooltips, coinbase pin widget, crypto consolidation calc
- Collapsible sections within slides

### thelounge.html — The Lounge
**CSS:** `shared.css`, `lounge.css`
**JS:** `main.js`, `lounge.js`

- Favorites grid (7 cards), Gaming zone (12 cards), Sandspiel embed
- Interesting Sites — categorized link boxes (Fun, Mind-Bending, Archives, Stats, Weird, Skittles)
- Filter buttons with localStorage memory
- Surprise Me! button (random visible link)
- Meme containers (3 random memes across page)
- Meow sounds on meme hover

### zephyy.html — Zephyy Profile
**CSS:** `shared.css`, `zephyy.css`, `zephyy-widget.css`
**JS:** `main.js`, `zephyy.js`, `zephyy-widget.js`

- 10 sections: Hero → About → Capabilities → Habitat → Projects → Vibe → Skills → Values → Chat Orb → Terminal → Realm → Connect → Working On → Thoughts → Footer
- Sidebar navigation with scroll-tracking active state (IntersectionObserver)
- Visual features: Dual-vortex animated SVG glyph, mood switcher (idle/active/thinking), easter egg (3-click trigger), live feed cycling, carousel, random thoughts reader
- Terminal: CLI simulation with typing animation, 7 commands cycling, auto-advance (7s), capped at 3 prompt lines + 4 output lines

### zephyy-widget.js — Status Badge (cross-page)
- Renders clickable Zephyy badge with dual-vortex glyph, status dot, online/offline label
- Inline + compact variants, 60s poll interval
- Embedded on index + nexus heroes

---

## Build & Deployment

No build step. Firebase Hosting serves static files from `public/`.

### GitHub Actions (`deploy.yml`)
- Trigger: push to `main`
- Action: Firebase deploy
- File: `.github/workflows/deploy.yml`

---

## Known Issues / Backlog

- OG image placeholders (`xxxxxxxxxxxxxxxxxxxxxxxx`) across all pages — needs real assets
- `robots.txt` default — fine for now
- `humans.txt` empty — trivial
- `sitemap.xml` missing zephyy.html and nexus.html entries
- Firebase Hosting only — WebSocket/real-time status would need Firestore or Cloud Run

---

## Branches (active history)

| Branch | Status | Purpose |
|---|---|---|
| `main` | Live | Production |
| `zephyy-profile` | Merged | Zephyy profile page |
| `zephyy/widgets-nexus` | Merged | Status badge widget |
| `zephyy-fixes` | Merged | Sidebar, widget, profile fixes |
| `zephyy/audit-fixes` | Open PR#7 | Values dedup, terminal trim, widget clean |
| `feat/nexus-footer-nav` | Stale | Nav tweaks |

---

## Development Notes

- **Always pull before touching.** Doshus edits from Firebase Studio on other devices.
- **Surgical edits only.** No global refactoring unless explicitly asked.
- **Never remove elements** unless confirmed bug.
- **PRs go out as ZephyyBot** (not TheDoshus). Use GitHub API directly with ZephyyBot PAT if `gh` CLI is authed as TheDoshus.

*Last updated: 2026-05-12*
