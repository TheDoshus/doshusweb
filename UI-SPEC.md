# UI-SPEC.md — the board layout

Doshus's layout for pages and apps: a **board** of **panels** on a fine grid that every visitor
can move, resize, hide and bring back, fluid from a folded phone to a wide monitor, saved per
visitor. This spec is the layout and its feel only. The look is a layer each host applies on
top (doshus.net's cosmic glass, Aether's own vibe), and so are the host's security and build
rules. Hosts are listed under [Implementations](#implementations).

## Markup

```html
<div class="board" data-board="nexus">                 <!-- name = the saved-layout key -->
  <article class="panel" id="dev-core" data-accent="finance"
           data-x="1" data-y="1" data-w="12" data-h="21"> <!-- grid cells, counted from 1 -->
    <header class="panel-head"><h2>Dev Core</h2></header>
    <div class="panel-body">…any content…</div>
    <footer class="panel-foot">…status line…</footer>
  </article>
  <figure class="panel panel-media" id="meme-1" data-accent="lounge"
          data-x="13" data-y="14" data-w="6" data-h="8" aria-label="Meme slot 1">
    …content another script owns (a video, an embed)…
  </figure>
</div>
```

| Part | Job |
|---|---|
| `.board[data-board]` | The grid. Its name keys the saved layouts |
| `.panel[id]` | One widget. `data-x`/`data-y` place it and `data-w`/`data-h` size it, in cells, for the wide layout. The `id` is how a saved layout finds it, so never rename one casually |
| `data-accent` | Picks the panel's accent from the host's palette; everything in the panel reads `--accent` |
| `.panel-head` / `-body` / `-foot` | Title row (a grab bar), content that scrolls when the panel is smaller than it, status line. All optional. A body's content sits in elements stacked in flow, top to bottom (no bare text, `display: contents`, `order` or reversed flow, auto margins or stretched children): the engine reads the body's height off their extent |
| `.panel-media` | A headless panel whose content another script owns; it gets a grab strip over its top-left, clear of the player's own buttons |

The markup holds only content. The engine adds every control (grab dots, resize handles, the
snap ghost, collapse ▾, ✕, Add widget, Reset), and without the engine the panels still flow as
plain blocks. What a panel holds answers to the panel's own width, never the window's, since a
visitor can make any panel narrow: content styles itself with container queries
(`@container panel (…)`, `cqi` units; the head, body and foot are the containers, and a media
panel's content is sized by the script that owns it), not viewport media queries. The head does
the same: a narrow one drops its icon, and narrower still the title takes a line of its own
under the controls, so it never gets crushed.
The board's bar (Add widget, Reset) sits right above the board unless the page gives it a home:
an empty `<div data-board-bar="nexus">` anywhere on the page (doshus.net puts it in the hero). A page with several boards (Finance Hub's slides) can home all their bars in one spot and show only the current board's: a bar marked `hidden` stays hidden.

## Layout

- **Three tiers, three layouts.** Wide: 24 columns of 2rem rows. Mid (up to 1080px: foldables
  opened, tablets): 12 columns. Phone (up to 640px): 4 columns. Each tier has its own default
  and its own save, and the board swaps between them live as the window crosses a tier (a
  foldable opening or closing). The wide default is the markup's cells, each row grown to its tallest content where the window wraps it taller than the cells allow (panels sharing a row's top and height grow together). Until a visitor arranges the board, defaults are measured again as fonts and pictures arrive and when the window's width changes within a tier (never on height alone, so a phone's toolbar hiding mid-scroll moves nothing; one skipped while the board was arranged runs once it's back at its default), and a panel scrolled inside keeps its place. The mid default flows
  the wide layout onto half the columns: every panel half the row, or all of it if it spans
  three quarters or more of the wide row, so a row holds two panels or one; each as tall as its
  content, media keeping its wide height, in the highest free spot in reading order (a half-width
  panel can fill the gap beside an earlier one, so it may read one place early). The phone
  default stacks every panel full width in the wide reading order, each as tall as its content,
  media a little over half the screen, with 2rem between panels (the wider tiers keep 1rem) and
  1.5rem to the screen's edge.
- **Sizes.** No narrower than `--min-cols` (4 of 24 wide, 4 of 12 mid, 2 of 4 phone), no
  shorter than its head and foot plus a few lines of body, no taller than one screen. Content
  scrolls inside a panel that's smaller than it.
- **Free placement.** A panel stays wherever it's dropped, gaps and all; nothing floats up on
  its own. Where it lands decides what moves:
  - dragged upward onto a panel with free space above it, that panel rises out of the way;
  - onto the upper half of a panel that starts above it, it takes that panel's place (a swap,
    which is how a narrow stack reorders);
  - onto the lower half of one, it tucks in underneath;
  - anything else it lands on is pushed straight down.
- **Resizing** stops at a panel that starts above (nothing is pushed up) and pushes down
  anything else it grows into.
- **Fit.** Double-clicking a panel's resize corner (or Enter on it) gives it the height its
  content needs at its width; a media panel takes its picture's shape.
- **Collapse.** ▾ shrinks a panel to its title bar and back. The title keeps to one line there
  (cut with … when it's long), so the bar is the same height at any width. The space below stays as it was
  (nothing floats up); opening it again pushes down whatever has moved in. A headless media
  panel has no title bar, so no ▾. A page can start a panel collapsed (`data-collapsed`, as a closed fold
  converts): its `data-h` counts the title bar's rows (what the markup lint checks for overlaps; the engine measures the bar itself), and it opens to fit its content. A panel with no title bar ignores it.
- **Hide and bring back.** ✕ hides a panel and leaves its gap; Add widget (shown only while a
  panel is hidden) brings it back to its spot. Reset (shown only once the layout differs from
  the default) returns to the default, then offers Undo reset until the next change.
- **Saving.** Per browser, in `localStorage` under `board:<name>` (wide), `board:<name>:mid`
  and `board:<name>:phone`, each panel's cells, hidden and collapsed state, versioned so an
  old save never breaks a new board. A layout at
  its default saves nothing, so a changed default reaches everyone who hasn't arranged their own.
- **Layout is data.** Cells live in `data-x/y/w/h`; the engine turns them into the custom
  properties `--x/--y/--w/--h`. Markup never carries inline styles.
- **Reading order follows the layout.** The DOM is reordered to match (with `moveBefore()`,
  which keeps focus and playing media), so tab order is what the visitor sees.

## Converting a page

A page converts so that a visitor who never touches anything sees the page they know, now
arrangeable. Customizing is opt-in, never the price of the conversion.

- **The default is today's page.** The hero stays as it is, with the board's bar in it.
  Everything below the hero becomes the board: each section or card group a panel, in the same
  order, at about the same widths, the same spacing between them as before (the board's
  `--gutter` matches the page's rhythm). Accents come from the page's existing routing, as
  `data-accent`.
- **Content answers to its panel.** A page's own styles for what goes inside a panel use
  container queries, never viewport media queries.
- **Proof.** Before/after screenshots at desktop and phone width, the host's markup lint and
  board tests passing, and an independent review, before it ships.

## Feel

- **Grab** by the title bar, the grab dots at a panel's top center, or a media panel's
  top-left strip. A mouse lifts the panel once it moves a few pixels, so a plain click does
  nothing at all. A finger or pen rests there for `--hold` (500ms; the panel swells slightly
  while it charges) before it lifts, so a swipe that starts on a panel still scrolls the page.
- **While moving**, the board lights up as a field of cells, a breathing ghost in the panel's
  accent shows where it will land, and the other panels glide out of the way. Near the top or
  bottom of the screen (the top measured from under any sticky bar, which the page declares as
  `scroll-padding-top` on the root) the page scrolls, faster the closer the pointer gets, and keeps going
  while it rests there, at the same speed on any refresh rate. Escape, or the browser cancelling
  the pointer, puts everything back where it was. One gesture at a time: a second finger waits.
- **Resize** from any edge or corner with a mouse, from one large corner on touch screens
  (thumbs catch thin edges by accident). The edge follows the pointer (scrolling included), the
  ghost shows the whole cells it will take, and it snaps into them on release.
- **Smooth on weak machines.** Panels glide translate-only, which the compositor runs off the
  main thread (only a panel whose size changes animates width and height). The board re-lays
  out at most once a frame, and the DOM reorders only the panels whose place changed. Backdrop
  blur behind panels switches off while arranging, and for the rest of the visit on a machine
  that can't hold 25 fps (over a moving background it has to be redone every frame).
- **Keyboard path for everything.** Arrows on the ⠿ grip (shown only to keyboard focus) move a
  panel one cell, hopping a neighbor; arrows on the corner handle resize and Enter fits; a live
  region announces each change.
- **Native first.** `<details>` for anything that folds, the Popover API for the Add widget
  menu, pointer events with capture for every gesture.
- **Reduced motion.** Panels jump instead of gliding; nothing else changes.

## Aesthetic layer

The layout reads these; a host's theme sets them. Everything visual about a board is one of
these or a host stylesheet on top.

| Knob | What it shapes |
|---|---|
| `--accent` (from `data-accent`) | A panel's border, glow, title, ghost and controls |
| `--cols`, `--row`, `--gutter`, `--min-cols` | Grid density and spacing |
| `--field-opacity` | How strongly the cell field shows while arranging |
| `--ghost-fill`, `--ghost-glow` | The landing ghost's fill and glow |
| `--glide`, `--ghost-glide` | How long panels and the ghost glide (ms) |
| `--hold` | How long a finger rests before a panel lifts (ms) |
| `--panel-fill`, `--panel-backdrop` | The panel glass: fill alpha, and a backdrop filter (`blur(5px)`, or `none` over a busy background on weak hardware) |
| `--sp-*`, `--r-*`, `--fs-*`, `--font-mono`, `--font-title` | Spacing, radius and type scales |
| Panel surface, snap field, ghost colors | The host's own styles for `.panel`, `.board::before`, `.board-ghost` |

## Roadmap

1. **Inner sections:** groups and folds reorder within a panel and move between panels, with
   the same gestures in list mode. Panels stay the only thing that resizes.
2. **Widget catalog:** widgets that aren't on a page by default are fragments the host serves,
   and Add widget pulls them in with htmx.
3. **Agents drive the board:** one registry of layout actions (show, hide, move, highlight,
   reset) that only ever names known boards and panel ids. A host's agent calls it (Zephyy over
   doshus.net's realtime channel); browser agents get it through WebMCP
   (`document.modelContext.registerTool()`, origin trial in Chrome 149 and Edge 150,
   2026-10-09). AG-UI is the wire format to consider for an event stream.
4. **Theme surface:** today doshus.net's styles read its site tokens directly. When a second
   host adopts the board, the panel surface, field and ghost colors move behind neutral
   `--board-*` tokens each host maps to its own palette.

## Implementations

| Host | Where | Status |
|---|---|---|
| doshus.net | `public/css/board.css` + `public/js/board.js`; first page on it `/nexus` (2026-10-10), the lab copy it was proven on retired | Reference implementation, signed off by Doshus 2026-10-09 ("this is the spec to keep improvin on"). Site rollout and theming: `BLUEPRINT.md` § Roadmap. Guarded by `bun run check` (board markup lint) and `bun run test` (`tests/board.cjs`, Chromium). Host deltas: the panel's head, body and foot are its size containers, not the panel, since Chromium 141 drops the layout inside a size container moved with `moveBefore()`; `content-visibility: auto` on panels measured 2026-10-10 on /lab/nexus (about 10–15 ms of style work saved per load, and it clips the resize edges), not taken; measure again on a longer page |
| Aether (OpenClaw mission control) | `projects/aether` in the OpenClaw repo | Planned: the same layout, rebuilt with bun and htmx, with Aether's own look |
