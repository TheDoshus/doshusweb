# INTERNAL-SYNC.md — Amazon-internal Printmon mirror tracker

Doshus hosts the **handcrafted Printmon pages** on the Amazon internal network as a mirror
of `public/amazon/printmon/`. He syncs by hand (ctrl+H find/replace), so this file tracks
every external change that needs re-applying internally. Agents: **append a row whenever a
change touches something in the "must sync" column.** Doshus clears rows after syncing at work.

## Scope rules

| Stays external only (never mirror) | Must sync to internal |
|---|---|
| Zephyy chat orb + all generation flows | Page layout changes on handcrafted pages |
| Theme gallery + generated themes + RTDB anything | Toolbar / button / dropdown changes |
| Firebase, analytics, anything networked | Shared CSS the handcrafted pages consume |
| | New links between printmon pages |

Note: many links differ on the internal copies (different hosts/paths). Doshus will provide
an example internal page so agents can flag exact strings to ctrl+H — until then, list the
external-side change and mark the link caveat.

**Wording divergence (2026-07-17):** the internal copies say **theme/themes** everywhere the
external pages say **skin/skins** (Doshus ctrl+H'd `skins→themes` / `skin→theme` across the
internal printmon set after the 07-16 sync). Any future payload carrying user-facing "skin"
strings (orb quips, tooltip default, button/link labels) must swap to "theme" wording for the
internal side — or flag the strings so Doshus re-runs the ctrl+H.

## Pending sync items

| Date | Change | Files touched (external) | Notes for internal edit |
|---|---|---|---|
| _(none)_ | | | |

## Synced history

_(rows move here once applied internally, with sync date)_

**✅ Full sync applied 2026-07-17** via Quick Suite + manual ctrl+H (everything below in one
pass); internal additionally renamed skin→theme wording (see divergence note above).

| Date | Change | Files touched (external) | Notes for internal edit | Synced |
|---|---|---|---|---|
| 2026-07-12 | 5 handmade skins ported as generator bases — handcrafted pages themselves untouched, **no sync needed** (listed for awareness) | `css/`, `template.html` | — | n/a |
| 2026-07-12 | **Zephyy gallery orb** added beside Swap Themes button; "Theme Gallery 🖼️" link removed from dropdown; glassy tooltip restyle landed same day → cache-busters are now `?v=orb2` on swapbtn.css/swap-img.js refs | all 32 printmon pages (`template.html` + handcrafted), `css/swapbtn.css` (orb + glassy tooltip styles appended), `js/swap-img.js` (quip rotator appended) | ctrl+H strings: add `<a class="zephyy-orb" ...>` after the Swap Themes button OR skip entirely — orb links to the **external** gallery, which internal machines may not want. Dropdown gallery-link removal + `?v=orb2` cache-busters apply either way. | 2026-07-17 (as superseded by 07-16 orb) |
| 2026-07-12 | Missing theme dropdown entries added (Butterfly self-link; Butterfly on Strawberry; Halloween, Melody, One Piece, Solo Leveling, and Toki Doki on legacy Doshus pages) | `TheDoshusPrintmon2Butterfly.html`, `TheDoshusPrintmon2Strawberry.html`, all 14 `Printmon2Doshus*.html` pages with swap dropdowns | Apply the same ctrl+H anchor additions to the internal copies; preserve each dropdown's existing ordering and internal-only link variants. | 2026-07-17 |
| 2026-07-13 | Link repairs: Kuromi's Printmon2LATEST href was a mangled double-URL (two URLs concatenated) — fixed; Butterfly + Strawberry Printmon2LATEST normalized from `drive.corp` to canonical `drive-render.corp` | `TheDoshusPrintmon2Kuromi.html`, `TheDoshusPrintmon2Butterfly.html`, `TheDoshusPrintmon2Strawberry.html` | **Check the internal copies for the same defects** — the Kuromi double-URL bug likely exists there too. Host normalization: Doshus decides whether internal copies follow (their link variants may differ intentionally). | 2026-07-17 |
| 2026-07-15 | **Orb relocated**: dock above the Doshus.NET scroll button (18 strip pages); classics keep orb beside Swap Themes externally, SKIP orb internally (no strip); tooltip now position:fixed via swap-img.js; `?v=orb3` external-only | all strip pages, `css/swapbtn.css` (dock block), `js/swap-img.js` (positioning) | superseded by the 2026-07-16 batch | 2026-07-17 (skipped straight to 07-16) |
| 2026-07-16 | **Orb rebuilt + repositioned (final: ABOVE the button)**: now the shared component doshus.net uses sitewide — spinning whorl avatar in a darker-purple core, floating absolutely ABOVE the Doshus.NET button (dock wraps the button in flow so it stays aligned with siblings; below-button iterations hid the tooltip in the strip and grew a scrollbar), tooltip pops up above the strip via JS position:fixed on one line (nowrap + viewport clamp; hover scale moved off the tip's parent — a transformed ancestor hijacks position:fixed), CSS hover fallback gated `@media (hover: hover)` so touch can't re-trigger the clipped absolute version (touch: show on touchstart, auto-clear ~1.6s after touchend), quip pool 6→19; markup switched from `<a class="zephyy-orb">` to the `zephyy-orb-sitewide-wrapper printmon-dock` block; **all `?v=` cache-busters dropped sitewide** (internal was already bare). External pages also reference `../../css/zephyy-orb-embed.css` — internal does NOT mirror that file; the needed rules are inlined into the swapbtn.css payload | all strip pages, `css/swapbtn.css` (old orb block replaced), `js/swap-img.js` (orb IIFE replaced: quips + whorl injection + above-positioning + touch lifecycle) | Applied via INTERNAL-SYNC-PROMPT.md (2026-07-16 batch) in Quick Suite; classics stayed orb-free internally | 2026-07-17 |
