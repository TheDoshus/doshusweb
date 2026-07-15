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

## Pending sync items

| Date | Change | Files touched (external) | Notes for internal edit |
|---|---|---|---|
| 2026-07-12 | 5 handmade skins ported as generator bases — handcrafted pages themselves untouched, **no sync needed** (listed for awareness) | `css/`, `template.html` | — |
| 2026-07-12 | **Zephyy gallery orb** added beside Swap Themes button; "Theme Gallery 🖼️" link removed from dropdown; glassy tooltip restyle landed same day → cache-busters are now `?v=orb2` on swapbtn.css/swap-img.js refs | all 32 printmon pages (`template.html` + handcrafted), `css/swapbtn.css` (orb + glassy tooltip styles appended), `js/swap-img.js` (quip rotator appended) | ctrl+H strings: add `<a class="zephyy-orb" ...>` after the Swap Themes button OR skip entirely — orb links to the **external** gallery, which internal machines may not want. Dropdown gallery-link removal + `?v=orb2` cache-busters apply either way. **INTERNAL-SYNC-PROMPT.md covers all of this verbatim.** |
| 2026-07-12 | Missing theme dropdown entries added (Butterfly self-link; Butterfly on Strawberry; Halloween, Melody, One Piece, Solo Leveling, and Toki Doki on legacy Doshus pages) | `TheDoshusPrintmon2Butterfly.html`, `TheDoshusPrintmon2Strawberry.html`, all 14 `Printmon2Doshus*.html` pages with swap dropdowns | Apply the same ctrl+H anchor additions to the internal copies; preserve each dropdown's existing ordering and internal-only link variants. |
| 2026-07-13 | Link repairs: Kuromi's Printmon2LATEST href was a mangled double-URL (two URLs concatenated) — fixed; Butterfly + Strawberry Printmon2LATEST normalized from `drive.corp` to canonical `drive-render.corp` | `TheDoshusPrintmon2Kuromi.html`, `TheDoshusPrintmon2Butterfly.html`, `TheDoshusPrintmon2Strawberry.html` | **Check the internal copies for the same defects** — the Kuromi double-URL bug likely exists there too. Host normalization: Doshus decides whether internal copies follow (their link variants may differ intentionally). |

## Synced history

_(move rows here once applied internally, with sync date)_
