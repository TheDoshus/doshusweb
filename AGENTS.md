# AGENTS.md — doshusweb

Cross-agent conventions for **doshus.net**. Governs how any coding agent — Claude Code, Zephyy, Codex, Opencode, or any model you bring — works on this codebase. Vanilla HTML/CSS/JS on Firebase Hosting: no frameworks, no build step; `public/` is served as-is. See `DOSHUS.md` for deploy workflow and `blueprint.md` for architecture/roadmap.

> **Single source of truth.** These are the project rules for every agent. `CLAUDE.md` and `GEMINI.md` are one-line doorways that import this file (`@AGENTS.md`, `@./AGENTS.md`) for Claude Code and Gemini CLI — so edit rules *here*, not there. VS Code needs no file of its own: its Copilot, Codex and Local harnesses read `AGENTS.md` (`chat.useAgentsMdFile`, default on) and its Claude harness reads `CLAUDE.md` (VS Code docs approved 2026-09-17), so a `.github/copilot-instructions.md` would only be a second copy. The one exception is the generated build-standards block below: it comes from the OpenClaw root `AGENTS.md`, which also governs anything done from the OpenClaw house itself (Zephyy's identity, confirming external actions). Everything after that block is doshusweb's own. Deploys, pushes to other repos and anything that leaves the machine still need Doshus's OK.

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

### How the work gets done

- **Ask when you don't know or aren't confident.** *"Guessing does none of us any good."* A
 question costs one message; a wrong guess costs the build and his trust.
- **Verify, don't assert.** Quote the output that proves it. A check that ran is not a check
 that found anything (Rule 15), and one that could not look reports UNKNOWN, never clean.
 Size the check to the blast radius: no unrequested repo-wide sweep for a local edit, and
 the wider audit when real dependencies or he calls for it.
- **Gold-star it before moving on.** Research it and think it through, then finish: the
 checks pass, the cleanup is done, the note is filed. Only then start the next thing.
- **Latest and greatest, done properly.** Prefer the maintained successor and the native
 feature over a superseded or hand-rolled one.
- **Call out mess when you see it:** duplication, stale docs, dead files, and builds kept
 only because redoing them is work. Don't route around it.
- **Answer every part.** Keep every field he asked for and never drop one for brevity. When
 he names a reviewer or collaborator, their review is part of done.

**The messy trail** is the failure to guard against: scratch files left behind, notes
unfiled, board cards not moved, decisions not written down. Leave it clean and organized;
before you stop, ask what you left behind.
<!-- /canon -->

## Hard rules

- **oklch only** (build bar 7) — here black is `oklch(var(--space-oled))`, white is `oklch(var(--star-white))`.
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
| `public/assets/memes/` | Meme pool; regen index with `npm run memes` |
| `firebase.json` | Hosting config + CSP/security headers (two targets) |
| `scripts/` | Repo tooling, run through npm: `csp:hashes`, `memes`, `sync:zephyy` (re-stamp the Zephyy subpages after editing `public/zephyy.html`) |

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

Read the newest file in `handoff/` before starting work. Every session that changes files
appends one entry to `handoff/YYYY-MM-DD.md` (today's date; create it if you're first),
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
