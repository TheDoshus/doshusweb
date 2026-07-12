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
| _(queued)_ | Zephyy gallery orb button next to Swap Themes (planned — not built yet) | `template.html`, all `TheDoshusPrintmon2*.html`, swap-button CSS | Orb links to external gallery — decide whether internal copies get the orb (it points off-network) or skip it |

## Synced history

_(move rows here once applied internally, with sync date)_
