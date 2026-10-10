# doshus.net — Blueprint

How the site is put together, what it depends on outside this repo, and what's next. Rules
for changing it live in `AGENTS.md`; commands and the deploy flow live in `DOSHUS.md`.
Update this file when structure, a page, or a cross-repo contract changes.

## Architecture

- **Static, hand-written, no build step.** `public/` is served as-is by Firebase Hosting
  (project `doshusweb`). The only tooling is the bun scripts in `scripts/`: generators that
  stamp shared markup and CSP hashes into committed files, and `bun run check`, which fails
  when any generated output has drifted.
- **Two hosting targets, one `public/`** (`firebase.json`, `.firebaserc`): `main` serves
  doshus.net with `cleanUrls`; `zephyy` rewrites every unmatched path to `zephyy.html`.
  `index.html` also sends the `zephyy.doshus.net` host to `/zephyy`. Both targets carry the
  same strict CSP, so any new external origin goes into both.
- **Security posture.** No inline script runs without a sha256 in the CSP (`csp:hashes`
  keeps them current). `public/amazon/**` is the quarantine: its own permissive CSP, skipped
  by the hash scan and the oklch lint.
- **Backend = Firebase RTDB only.** The browser talks to `doshusweb-default-rtdb`; nothing
  on the site calls OpenClaw directly. The home rig (OpenClaw) writes status, thoughts,
  replies and themes into RTDB, and the pages read them. `database.rules.json` is the source
  of truth and deploys separately from hosting.
- **Design system.** Tokens and fonts live in `public/css/shared.css` (tier 1 `L C H`
  primitives, tier 2 semantic accents); read them there, not from a copy. Per-section color
  goes through accent routing (see `AGENTS.md` § Hard rules). Self-hosted woff2 fonts only.
- **Shared runtime.** `public/js/main.js` runs on every page: star field, meme loader
  (`.random-meme*` ← `assets/memes/meme-list.json`), collapsibles, sticky footer.

## Site map

| URL | File | What |
|---|---|---|
| `/` | `index.html` | Home: socials, CTA modal, portals to every section, work-link pills |
| `/nexus` | `nexus.html` | Tech bento grid: dev tools, rig, bookmarks |
| `/financehub` | `financehub.html` | Finance card slider: credit, crypto, investing, taxes, credit report |
| `/thelounge` | `thelounge.html` | Games, curios, memes |
| `/bot` | `bot.html` | For site admins who find our User-Agent in their logs: the UA forms, what carries it and what doesn't, how to block it or reach us. UA forms and operator crew stamped by `sync:zephyy` |
| `/zephyy` | `zephyy.html` | Zephyy's profile: signal deck, story, systems, crew, code, contact. Styles: `zephyy.css` (the base all her pages share) + `zephyy-profile.css` (this page only); script: `zephyy-pages.js` (also on the subpages) |
| `/zephyy/fragments/*` | `zephyy/fragments/*.html` | HTMX panels the profile's signal deck swaps in (`now`, `identity`, `receipts`, `latest`) |
| `/zephyy/crew` · `/qa` · `/changelog` · `/status` | `zephyy/<id>/index.html` | Subpages. The nav bar is stamped from the page list in `scripts/sync-zephyy-nav.js` and the chat orb from `zephyy.html` by `sync:zephyy`; never hand-edit inside the `zp-nav` / `zp-chat` markers. The crew page's model chains, schedules and operator crew are stamped from `data/crew-facts.json` between `crew:` markers |
| `/amazon/printmon/*` | `amazon/printmon/` | Printmon: handcrafted themed pages, the theme gallery (`gallery.html`) and themes generated from chat (`generated/`, `css/generated/`) |
| `/amazon/aio/*`, `/amazon/tmb/*` | `amazon/aio/`, `amazon/tmb/` | Work tools: AIO pages, Tampermonkey bookmarks tutorial |
| 404 | `404.html` | Astronaut error page |

**Chat orb.** On every page, in two forms. The full chat panel lives in the profile
(canonical markup inside the `zp-chat` markers) and is stamped into each Zephyy subpage;
client `js/zephyy-live.js` + `js/zephyy-orb.js` + `css/zephyy-orb.css`. Everywhere
else (home, nexus, financehub, lounge, 404, Printmon gallery) it arrives through
`js/zephyy-orb-embed.js`; on the Printmon pages it docks (over each theme page's Doshus.NET
button, in the gallery's hero) through `css/zephyy-orb-dock.css`, linked after the embed sheet.
Her status streams from RTDB's REST endpoint (Server-Sent Events, no SDK) and the daily thought
is one read; the Firebase SDK loads only for the chat (the pointer on the orb, the panel
opened, a send, or a visitor with a conversation going). Tests: `tests/chatorb-client.cjs` (client wiring) and
`tests/rules-emulator.py` (rules, in the Firebase emulator); both commands are in `DOSHUS.md`.

**Status surfaces.** `js/zephyy-widget.js` (badge on home and nexus) and
`/zephyy/status` both read `zephyy/status` in RTDB.

## Connected systems

Every contract that crosses this repo's edge, and which side owns its shape. "OpenClaw"
means the `Doshus-Agents-OC` repo (`~/.openclaw` on the rig).

| Contract | This repo's side | Other side | Owner |
|---|---|---|---|
| Chat orb protocol: `zephyy/chat/ownedSessions` (anonymous-auth owners, input → processing → reply) | Client JS above + `database.rules.json` | OpenClaw `scripts/bridges/chatorb.py` + `scripts/bridges/orb/` | Shared, released together; the contract and open work are in OpenClaw `scripts/bridges/orb/README.md` |
| `zephyy/status` (`online`, `lastHeartbeat`, `services.*` unit states, `workingOn`) | Read by the widget, profile and status page | Written by OpenClaw `scripts/zephyy/zephyy-status-ping.sh`; chatorb patches `workingOn` | OpenClaw |
| `zephyy/daily` (daily thought) | Profile renders it and fails closed on anything not marked `publicSafe` | Zephyy's daily-pulse cron (`workspace/templates/cron-prompts/daily-pulse.md`, `rtdb_set`) | Both: producer allowlist plus consumer validation (OpenClaw `workspace/ISSUES.md` BUG-007) |
| `printmon/themes` | Printmon gallery reads it (`amazon/printmon/js/PrintmonGallery.js`) | chatorb writes each theme generated from chat | OpenClaw |
| Printmon generator | `public/amazon/printmon/scripts/generate.js` | chatorb **executes** it with node (`DOSHUSWEB_ROOT`, default `~/.openclaw/projects/doshusweb`) | This repo; moving or renaming it breaks theme generation |
| `zephyy/feedback` | Rules only | chatorb posts visitor feedback | OpenClaw |
| `config/worklinks` (work pills, email, Slack) | `js/home.js` reads it; degrades to nothing if missing | Edited by Doshus in the Firebase console, no deploy | Doshus |
| RTDB rules | `database.rules.json` is the source; `firebase deploy --only database` | Firebase console is a mirror | This repo |
| Build standards in `AGENTS.md` | The `canon:build-standards` block, never hand-edited | Generated from OpenClaw root `AGENTS.md` by `canon-blocks.py`; OpenClaw's `canonblocks` checkup row catches drift | OpenClaw |
| Crew facts: `data/crew-facts.json` (model chains, job cadences, operator roster, User-Agent forms) | `scripts/sync-zephyy-crew.js` stamps it into `/zephyy/crew` and `/bot`; `bun run check` fails on an unstamped change | Generated by OpenClaw `scripts/bridges/crew-facts.py`; its checkup row `crewfacts` fails when this file no longer matches live | OpenClaw; never edit the JSON by hand |
| Zephyy's public claims (crew, pipeline, changelog, fragments) | Page text, authored here | Live facts: OpenClaw `wiki/shared/runtime-baseline.md` and the gateways | OpenClaw is truth; card `ec678abe` reconciles |
| Amazon-internal Printmon mirror | Handcrafted `amazon/printmon/` pages | Doshus's hand-synced copy on the Amazon network | Doshus; pending edits tracked in `AMZN-INTERNAL-SYNC.md` |

## Roadmap

Cards live on the OpenClaw kanban (`~/.openclaw/data/kanban.db`); IDs are the handle.

| Card | What |
|---|---|
| `49f2128c` | Seasonal page effects (Doshus's idea). Plan: `main.js` sets `data-month` on `<html>` before the star block reads its colors (the WebGL sky reads `--star-*` and `--nebula-*` once at load), and twelve small blocks in `shared.css` re-point the ambient primitives (nebula, `--star-*` tints, the board's snap field). Section accents stay put so finance stays green |
| `9414bd21` | Real OG images (every page's `og:image` is `doshusfavi.ico` today), `sitemap.xml` (lists 3 of 5 top-level pages, no `/zephyy/*`), `humans.txt` (empty) |
| `ec678abe` | QA page claims vs live: needs OpenClaw to verify. The crew page's model chains and schedules are now generated (`data/crew-facts.json`) |

**Board rollout** (the layout in `UI-SPEC.md`, signed off 2026-10-09): Nexus is the first page on it
(2026-10-10), and the lab copy it was proven on is retired; board changes are proven on a
preview channel and `tests/board.cjs` runs on `/nexus`. nexus.css keeps only the hero, the room
around the board and the footer link; the board's scales live in `shared.css`. Finance Hub
followed the same day (Doshus's call: the slider stays and each slide is a board of its blocks;
panel titles keep the font and color of the header each replaced). Next come the Lounge, the home page (Doshus, 2026-10-10: its hero stays; everything below it
becomes the board, the Discord section included, with the same spacing between sections as
now) and, last, Zephyy's profile (Doshus, 2026-10-10). Each conversion follows `UI-SPEC.md` § Converting a page. The widget catalog reuses the profile's htmx
fragments (`zephyy/fragments/`, htmx 2.0.10, moving from `/zephyy/vendor/` to a shared vendor
folder). Site-specific parts that stay out of the spec: the cells go through the CSSOM, so no
`style=` attribute ever leans on the CSP's `'unsafe-inline'`; `board.css` also carries the
site's content kit (`.group`, `.fold`, `.tip`; links are the site's own `.qlBtns` buttons, from `shared.css`) and its cosmic panel surfaces.

Chat-orb follow-through (abuse admission, retention, processing health, real-browser CSP
checks) is tracked in OpenClaw `scripts/bridges/orb/README.md` § Remaining work, not here.

## Development notes

- **Pull before touching.** Doshus also edits from Firebase Studio (`.idx/`) and VS Code.
- **Surgical edits.** Don't remove elements unless they are confirmed bugs; no global
  refactors unasked. `public/amazon/` above all: the generator contract makes it load-bearing.
- **Deploys are manual and preview-first** (`DOSHUS.md`); pushing to `main` deploys nothing.
