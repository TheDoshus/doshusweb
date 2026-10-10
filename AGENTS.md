# AGENTS.md — doshusweb

Cross-agent conventions for **doshus.net**. Governs how any coding agent — Claude Code, Zephyy, Codex, Opencode, or any model you bring — works on this codebase. Vanilla HTML/CSS/JS on Firebase Hosting: no frameworks, no build step; `public/` is served as-is. See `DOSHUS.md` for deploy workflow and `BLUEPRINT.md` for architecture/roadmap.

> **Single source of truth.** These are the project rules for every agent, and there is no `CLAUDE.md` (Doshus, 2026-10-10). Claude Code (v2.1.277+) reads this file itself when no `CLAUDE.md` sits in the working directory or above it. Under `~/.openclaw` one does (OpenClaw's own), so on a machine with this repo there, `~/.claude/settings.json` needs `"pluginConfigs": {"cc-plugin-agents-md@builtin": {"options": {"instructionFiles": "claude-md-and-agents-md"}}}` (or `/config` → Project instructions), which loads both and never reads one `AGENTS.md` twice; project settings can't set it (Claude Code docs § AGENTS.md, read 2026-10-10). Gemini CLI reads only `GEMINI.md` unless told otherwise: point it here with `"context": {"fileName": ["AGENTS.md"]}` in its `settings.json` rather than keeping a copy. VS Code needs no file of its own: its Copilot, Codex and Local harnesses read `AGENTS.md` (`chat.useAgentsMdFile`, default on), so a `.github/copilot-instructions.md` would only be a second copy; its own Claude harness reads only `CLAUDE.md` (VS Code docs approved 2026-09-17), so it doesn't get these rules. The one exception is the generated build-standards block below: it comes from the OpenClaw root `AGENTS.md`, which also governs anything done from the OpenClaw house itself (Zephyy's identity, confirming external actions). Everything after that block is doshusweb's own. Deploys, pushes to other repos and anything that leaves the machine still need Doshus's OK.

<!-- canon:build-standards — generated from the OpenClaw root AGENTS.md (the one source); edit it there, never here -->
## How Doshus Wants Things Built

Doshus's standards for everything an agent or operator builds or changes, in every project:
code, config, prompts, hooks, docs and UI. They are the standing bar, not requests. "Rule N"
below means the numbered coding Rules, which say how to meet them.

### The build bar

1. **Futureproof.** Build so the next agent, model, machine or data source plugs in without
   rewriting what is already there: derive, don't copy (Rule 12). Anything that depends on a
   version, model, quota or upstream says so when it drifts, before it breaks.
2. **Modular.** Each part has one clear job and a defined interface, so it can be swapped
   out, or backed by another clean path, without touching the rest: *"a generic standard is
   better than a custom ragdolled one."* Modular is organized, not scattered: extend the part
   shaped like your change before adding another (Rule 18). A pile of small scripts splitting
   one job is not modular.
3. **Lean and optimized.** *"The meanest and leanest code possible. I believe less code is
   the best code."* Lean over clever, native features first, the fewest moving parts, no
   bloat in code, prose or reports: a report states the finding, not the scan (Rule 16).
   Optimizing never costs a capability: *"I'm not here to lose functionality but improve
   on it."*
4. **One source.** Every fact, rule, helper and template has one home, and everything else
   points at it. Where a harness cannot point, the copy is generated from the source and
   checked for drift. A hand-kept copy is allowed only when it forks into something
   specialized for one agent, harness or situation, and it names what it forks from.
5. **Portable.** It must survive a teleport: *"I don't wanna boot up on another machine with
   nothin workin."* Nothing machine-specific is baked into code or docs: users, homes, paths,
   ports and hosts come from config or the environment, or are derived (Rule 4). Build it
   generic enough to share, with our specifics layered on top.
6. **Continuous.** When you learn or land something, update the memory, daily log, doc,
   handoff or board it changes right then, not at the end. Saying you will is not doing it.
7. **oklch() colors only.** Every color value: CSS, tokens, inline styles, SVG `fill` and
   `stroke`, generated colors, palettes, design specs, and any prompt you write for a tool
   that produces colors. No hex, rgb/rgba or hsl wherever oklch is available; a vendor
   example is a reference, not an exception.
8. **Smart value first.** Anything with more than one way to get it done (models, search,
   scraping, APIs, services) runs the best free option first, then the next best, and a paid
   one only as the true last resort. The order lives in the config that routes it, not only
   in prose: a doc that says "free first" over a config that picks paid is how every web
   search here ran on paid providers for months.

### How the work gets done

- **Ask when you don't know or aren't confident.** *"Guessing does none of us any good."* A
  question costs one message; a wrong guess costs the build and his trust.
- **Verify, don't assert.** Quote the output that proves it. A check that ran is not a check
  that found anything (Rule 15), and one that could not look reports UNKNOWN, never clean.
  Size the check to the blast radius: no unrequested repo-wide sweep for a local edit, and
  the wider audit when real dependencies or he calls for it.
- **Gold-star it before moving on.** Research it and think it through, then finish: the
  checks pass, the cleanup is done, the note is filed. Only then start the next thing.
- **Read the manual before you touch a part of the system.** Each part has a page: find it by the part's name and config keys and read it before the
  change, not after; a part with no page gets one in the same change.
- **Latest and greatest, done properly.** Prefer the maintained successor and the native
  feature over a superseded or hand-rolled one.
- **Build to the domain's published standard.** Where a spec or vendor best-practice guide
  exists (MCP, agent skills, hooks, an API), mirror it and build to it; our
  domain page holds only our deltas, each with its reason.
- **Track what you install.** A new tool, CLI or package gets a line in the tooling inventory
  and a manual the same session, or it rots unseen.
- **Call out mess when you see it:** duplication, stale docs, dead files, and builds kept
  only because redoing them is work. Don't route around it.
- **Answer every part.** Keep every field he asked for and never drop one for brevity.
- **Two sets of eyes, preferably two models.** Every change gets an independent review, by a
  different model where a free lane is available, and every finding is fixed or answered; a
  reviewer he names is part of done, and a command he runs as root is reviewed before he
  gets it. Short on review quota, routine work lands with its review
  owed and sharp edges wait. Timing
  and the kept verdict: Rule 7 § E.

**The messy trail** is the failure to guard against: scratch files left behind, a run-once
script left in the script store (Rule 18), notes unfiled, board cards not moved, decisions
not written down. Leave it clean and organized;
before you stop, ask what you left behind.
<!-- /canon -->

## Hard rules

- **oklch only** (build bar 7) — here black is `oklch(var(--space-oled))`, white is `oklch(var(--star-white))`.
- **Use the token system** in `public/css/shared.css`:
  - Tier 1 primitives hold raw `L C H` triples (e.g. `--brand-purple: 55% 0.28 290`) — always consumed as `oklch(var(--token))` or `oklch(var(--token) / alpha)`.
  - Tier 2 semantic tokens: `--accent-finance`, `--accent-crypto`, `--accent-taxes`, `--accent-invest`, `--accent-networth`, `--accent-lounge`, `--accent-amzn`, `--accent-myth`, `--accent-discord`. `--text-main` / `--text-muted` are **full colors** — use as `var(--text-muted)`, never re-wrapped in `oklch()`.
- **Accent routing pattern** for per-section theming: one custom property set per scope, shared rules consume it. Existing examples: `--sec` (finance.css), `--node-accent` (nexus.css), `--pill-accent` (home.css), `--swap-accent` (printmon swapbtn.css — per-theme-page button, `--pm-hue1` fallback themes generated pages). Extend this pattern; don't copy-paste per-section rule blocks.
- **CSP is strict, and stays that way** (Doshus's standard for every agent; A+ 110 on Observatory, 2026-09-26). No `'unsafe-*'`, wildcard or bare-scheme sources unless absolutely necessary; the standing exceptions are named in `CSP_EXCEPTIONS` in `scripts/check.js` (`style-src 'unsafe-inline'` because the widgets need it, already tested). Inline scripts get a hash via `csp:hashes`, never a looser policy; no inline `on*=` handlers or `javascript:` URLs: the browser refuses them, so they are dead code. Adding any external fetch/iframe/script requires updating the CSP headers in `firebase.json` — in **both** hosting targets (`main` and `zephyy`). Scope to the tightest path that works (e.g. `https://discord.com/widget`, not `https://discord.com`).
- Fonts are self-hosted woff2 in `public/assets/fonts/` — no Google Fonts requests. Each face is named once, as a `--font-*` token in `shared.css` (body, button, h1, h3, hero, title, accent, card, mono, panel); everything else uses the token, so trying a new font is one line. The exceptions, each commented: Home's pills name `'Braah One'` bare, so their → keeps falling back to the browser's own font; and the Printmon dock (`zephyy-orb-dock.css`) uses Amazon Ember, the internal site's font, which can't be hosted here.
- **The board is the page layout** (Doshus, 2026-10-10: "new standard like oklch"). New pages and sections, and any page being reworked, are a board of panels per `UI-SPEC.md` on `board.css` + `board.js`; no new bespoke card grids. Pages convert in the order of `BLUEPRINT.md` § Board rollout; until a page's turn, build its new content panel-shaped (one self-contained block: head, body, foot) so converting it is a wrap, not a rewrite.

## Layout

| Path | What |
|---|---|
| `public/*.html` + `css/` + `js/` | Main site (home, financehub, thelounge, nexus, zephyy) |
| `public/css/shared.css` | Tokens, fonts, cosmic background, shared components |
| `public/js/main.js` | Global: WebGL sky (the drifting nebula, then the star field; colors are the `--nebula-*` and `--star-*` tokens) + shooting stars, meme loader, collapsibles, sticky footer |
| `public/css/board.css` + `public/js/board.js` | The board engine (`UI-SPEC.md`); first page on it: `/nexus` |
| `public/zephyy/` | Zephyy profile subpages |
| `public/amazon/` | Printmon + work tools — hands off unless Doshus says so (Doshus, 2026-10-10); he hand-syncs it to an internal host (`AMZN-INTERNAL-SYNC.md`) |
| `public/assets/memes/` | Meme pool; regen index with `bun run memes`; shrink new ones with `bun run memes:convert` (quality-gated, report first) |
| `firebase.json` | Hosting config + CSP/security headers (two targets) |
| `scripts/` | Repo tooling, run through bun (`bun run <name>`): `check`, `csp:hashes`, `memes`, `memes:convert`, `sync:zephyy` (re-stamp the Zephyy subpages after editing `public/zephyy.html`) |

## Conventions

- **Two kinds of code, two bars** (Doshus, 2026-09-26). Zephyy's surface is agent-written — `zephyy.html`, `public/zephyy/`, `public/css/zephyy-*.css`, `public/js/zephyy-*.js` — and agents may clean it up without line-by-line review. Everything else is Doshus's hand-crafted code: recommend improvements freely, but show him the smallest diff and get his approval before it is committed. On both, fewer lines for the same behavior wins: skipping review is not skipping the bar.
- **Zephyy's surface rides the site; it doesn't fork it** (Doshus, 2026-10-10). Her pages use the same sky (`main.js`), tokens, `haptic()` and shared components as his, and add only what is hers: chat, realtime status, her glyph. Extend the `zephyy-*` file shaped like the change (one script per job, `zephyy.css` as the base under per-page sheets) instead of adding a file, and never copy a shared rule or helper into her sheets.
- **Grep before you write.** Before adding a new function, CSS token, util, or component, search `public/` for one that already does the job (`grep -rn "formatDate\|--accent-" public/`) — reuse or extend it, never spawn a parallel. A second date-helper or a duplicate token is a bug. This site's token + accent-routing system exists to be *extended*, not copy-pasted.
- JS is vanilla: guard for missing DOM elements (scripts are shared across pages), build user-facing strings with `createElement`/`textContent` (not innerHTML), keep console quiet in production paths.
- **No `?v=` cache-busters** on css/js references (Doshus's call 2026-07-16). css/js are served `Cache-Control: no-cache` (2026-10-10): browsers revalidate each load and get a 304 when nothing changed, so a change shows on the next load. A script whose new version can't run beside an old cached copy of another still gets a new file name in that deploy. Everything under `/assets/` (fonts, images, memes, vendored video.js) is `immutable` for a year, its rule after the css/js one in `firebase.json` so it wins: change one of those by giving it a new name. The one file there rebuilt in place, `assets/memes/meme-list.json` (`bun run memes`), gets `no-cache` from a rule after that, so a new meme reaches returning visitors.
- Respect `prefers-reduced-motion` for any new animation (CSS override exists in shared.css; JS checks `prefersReducedMotion` in main.js).
- Random meme containers: any `.random-meme` / `.random-meme-fixed` div gets auto-filled by main.js from `meme-list.json`.

## Verify before committing

```bash
bun run check                                  # read-only; exits 1 on any failure
bun run test                                   # chat client + board engine in Chromium (Playwright)
python3 -m http.server 8080 -d public          # eyeball locally
```

`bun run check` (`scripts/check.js`) runs: JS syntax (every `.js`/`.cjs`), every JSON file parses, CSS brace balance (browsers won't error on a missed `}`; it silently eats rules), oklch-only on `public/` CSS, HTML `<style>`/`style=`/color attributes, JS color strings and SVGs (Printmon and `vendor/` exempt; pre-lint SVGs are a baseline list that only shrinks), the CSP staying strict (both targets identical, no unsafe/wildcard sources outside `CSP_EXCEPTIONS`, no inline handlers or `javascript:` URLs outside Printmon), and drift: `csp:hashes` and `sync:zephyy` in `--check` mode must find nothing to change. A FAIL on drift means run that generator and commit the result. It also checks every board's markup (board names unique across the site, panel ids unique, cells inside the grid, no overlapping defaults) and that a page with a Printmon orb dock links its sheet. `bun run test` drives the board in Chromium, each case a bug a review found there or a promise `UI-SPEC.md` makes; a board change lands with its case.

Deploys are manual and preview-first — never auto-deploy (see DOSHUS.md).

## Session handoffs

Read the newest file in `handoff/` before starting work. Every session that changes files
appends one entry to `handoff/YYYY-MM-DD.md` (today's date; create it if you're first),
dated and stamped on the house clock, MST (America/Phoenix, no daylight saving; OpenClaw pins
it in `scripts/lib/localtime.py`), never UTC: `TZ=America/Phoenix date '+%F %H:%M'` gives both.
Claude Code gets that clock by default here from `.claude/settings.json`. Entries are
chronological and tagged with who did the work — `[claude]`, `[codex]`, `[zephyy]`,
`[agy]`, `[gemini]`, `[doshus]` — not merely which model ran it:

```markdown
## [21:40] [claude] Seasonal star palette
- **Changed:** public/js/main.js, public/css/shared.css
- **What/why:** stars engine picks a seasonal oklch palette from the date
- **Verified:** node --check OK; eyeballed all four seasons via a date override on :8080
- **NOT verified:** Safari; prefers-reduced-motion path; never deployed to a preview channel
- **Open:** none
```

All five fields are required. **`NOT verified:` is the point**: name the slices you did not
exercise ("never opened on mobile"), not a hedge ("may need more testing"). `none` means the
change has no untested surface, not that you ran out of time. A claim of scope in
`What/why` must be reachable from what `Verified:` covers. *(Forked from the OpenClaw root
AGENTS.md § Session Handoff Log, cut to what this repo needs.)*
