# UI-SPEC.md — how doshus.net pages are built

The house spec for page UI: a **board** of **panels** on a fine grid that each visitor can
move, resize from any edge, hide and bring back, dressed in the site's own cosmic look. The
idea comes from dashboard design systems (uniform containers on a shared grid and spacing
scale); the code, names and look are ours. Implementation: `public/css/board.css` +
`public/js/board.js`. Proving ground: `/lab/nexus` (`public/lab/nexus.html`), a copy of `/nexus`.

## Markup

```html
<div class="board" data-board="nexus">                     <!-- name = the saved-layout key -->
  <article class="panel" id="dev-core" data-accent="finance"
           data-x="1" data-y="1" data-w="12" data-h="21">    <!-- grid cells, counted from 1 -->
    <header class="panel-head">
      <span class="panel-icon" aria-hidden="true"><svg>…</svg></span>
      <h2>Dev Core</h2>
      <span class="panel-tag">N.01</span>
    </header>
    <div class="panel-body">
      <p>One-line description.</p>
      <section class="group"><h3>⌘ Site Tooling</h3><p>Blurb</p>
        <nav class="chips"><a href="…">W3C Validator</a>…</nav></section>
      <details class="fold" open><summary>// shell_tools</summary>
        <div class="tip"><b>name</b><p>what it does</p><code>command</code><a href="…">link</a></div>
      </details>
    </div>
    <footer class="panel-foot"><span>06 endpoints</span><b>SYNCED</b></footer>
  </article>
  <figure class="panel panel-media" id="meme-1" data-accent="lounge" data-x="13" data-y="14"
          data-w="6" data-h="8" aria-label="Meme slot 1">
    <div class="random-meme-fixed"></div>                   <!-- main.js fills it -->
  </figure>
</div>
```

| Part | Job |
|---|---|
| `.board[data-board]` | 24 columns × 2rem rows on desktop and tablet; one column in reading order on phones (≤640px) |
| `.panel[id]` | One widget. `data-x`/`data-y` place it, `data-w`/`data-h` size it, in cells. The `id` is how a saved layout finds it, so never rename one casually. At least 4 columns wide, and never shorter than its head and foot plus a few lines |
| `data-accent` | Picks a semantic accent (`finance`, `crypto`, `taxes`, `invest`, `networth`, `lounge`, `amzn`, `myth`, `discord`); everything inside reads `--accent` |
| `.panel-head` / `-body` / `-foot` | Title row (also a drag handle), content that scrolls when the panel is smaller than it, status line |
| `.group` | Titled cluster inside a body |
| `.chips` | Wrap of link buttons (plain `<a>`s, no class per link) |
| `.fold` | Native `<details>` accordion that eases open; no JS |
| `.tip` | Name, description, command, link, styled by element (`b`, `p`, `code`, `a`) |
| `.panel-media` | A panel whose content another script owns (memes); `board.js` gives it an invisible grab strip over its top-left, clear of a video's buttons |

## Rules

- **Content is markup, controls are JS.** `board.js` adds the move pill, the eight resize
  handles, the snap ghost, Add widget and Reset, so the HTML holds only content. Without JS the
  panels still flow as plain blocks.
- **No `style=` attributes in markup.** Cells are `data-x/y/w/h` and colors are `data-accent`;
  `board.js` turns cells into `--x/--y/--w/--h` through the CSSOM, which the CSP allows, so the
  `'unsafe-inline'` style exception stays an exception for widgets.
- **Free placement:** a panel stays wherever it's dropped, gaps and all. Dropped onto a panel
  that starts above it, it tucks in underneath; anything else it lands on is pushed down.
  Resizing never shoves a panel beside or above (growth stops at its edge); only the bottom edge
  pushes what's below. Hiding leaves a gap and re-adding returns a panel to its spot. Reset
  restores the page's default.
- **Cheap to move:** panels glide translate-only on the compositor (only a panel whose size
  changes animates width/height), the board re-lays out at most once a frame, and backdrop blur
  is off while arranging: blurring the live star field behind every moving panel is the heaviest
  thing on the page.
- **Native first:** `<details>` for folds, the Popover API for the menu, `moveBefore()` (falls
  back to `insertBefore`) so reordering the DOM keeps focus and playing media. DOM order follows
  the layout, so tab order and the phone stack match what the visitor arranged.
- **Scales, not numbers:** spacing `--sp-2xs…l`, radius `--r-s/m/l`, type `--fs-xs/s/l`, fonts
  `--font-mono`/`--font-title`. They live in `board.css` until a second page adopts the board,
  then move to `shared.css`.
- **Every control has a keyboard path:** arrows on the ⠿ grip (it only shows for keyboard focus)
  move one cell, hopping a neighbor they step into; arrows on the corner handle resize; a live
  region announces each one.

## What a visitor can do

Grab a panel by its top (the title bar, or a meme's top-left) to move it: the board lights up
as a field of cells and a breathing ghost in the panel's accent shows where it will land, while
the other panels glide out of the way. Drag any edge or corner to resize, with the same ghost;
it snaps to whole cells and the content scrolls once the panel is smaller than it. The feel is
tunable from the knobs on `.board` in `board.css`: `--field-opacity`, `--ghost-fill`,
`--ghost-glow`, and `--glide` / `--ghost-glide` (glide durations, ms). ✕ (top right, on hover) hides a panel, **＋ Add
widget** brings it back, **Reset layout** returns to the default. The layout saves per browser
in `localStorage` (`board:<name>`, versioned so an old save never breaks a new board); an
untouched board saves nothing, so changes to the defaults reach every visitor who hasn't
arranged their own.

## Roadmap

1. **Lab:** `/lab/nexus` until Doshus signs off on the look and feel.
2. **Nexus:** the lab replaces `nexus.html`; nexus.css keeps only the hero and footer bits,
   and the scales move to `shared.css`.
3. **Every page where it fits:** Finance Hub, the Lounge, Zephyy's profile.
4. **Inner sections:** groups and folds reorder within a panel and move between panels, using
   the same gesture code in list mode. Panels stay the only thing that resizes; content reflows.
5. **Widget catalog over htmx:** widgets that aren't on a page by default (Discord presence,
   Zephyy status, a meme slot) become fragments in a shared folder, and Add widget pulls them
   in with htmx, the way the Zephyy profile's signal deck already does (`zephyy/fragments/`,
   htmx 2.0.10, which then moves from `/zephyy/vendor/` to a shared vendor folder).
6. **Zephyy drives the board:** one registry of page actions (show a panel, open a page at a
   panel, highlight, reset) that only ever names known pages and panel ids. Zephyy's chat replies
   carry those actions over the existing realtime channel; the same registry is offered to
   browser agents through WebMCP (`document.modelContext.registerTool()`, origin trial in Chrome
   149 and Edge 150, 2026-10-09) where the browser supports it. AG-UI is the wire format to
   consider if the OpenClaw gateway grows an event stream.
7. **Monthly themes** (BLUEPRINT card `49f2128c`): `main.js` sets `data-month` on `<html>`,
   and twelve small blocks in `shared.css` re-point the ambient primitives (nebula, the `--star-*`
   tints, the snap field). The WebGL sky reads its tints once at load, so `data-month` is set
   before the star block runs. Section accents stay put so finance stays green.
