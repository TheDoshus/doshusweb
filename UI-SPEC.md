# UI-SPEC.md — how doshus.net pages are built

The house spec for page UI: a **board** of **panels** a visitor can rearrange, resize,
hide and bring back, dressed in the site's own cosmic look. The idea comes from dashboard
design systems (a board of uniform containers on a shared grid and spacing scale); the code,
names and look are ours. Implementation: `public/css/board.css` + `public/js/board.js`.
Proving ground: `/lab/nexus` (`public/lab/nexus.html`), a copy of `/nexus`.

## Markup

```html
<div class="board" data-board="nexus">                     <!-- name = the saved-layout key -->
  <article class="panel" id="dev-core" data-accent="finance" data-w="2" data-h="5">
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
  <figure class="panel panel-media" id="meme-1" data-accent="lounge" aria-label="Random meme">
    <div class="random-meme-fixed"></div>                   <!-- main.js fills it -->
  </figure>
</div>
```

| Part | Job |
|---|---|
| `.board[data-board]` | 4-column grid (2 at ≤1024px, 1 at ≤640px), rows at least 6rem and grow to fit content, dense packing |
| `.panel[id]` | One widget. `data-w` 1–4 columns, `data-h` 1–6 rows (defaults 1×2). The `id` is how a saved layout finds it, so never rename one casually |
| `data-accent` | Picks a semantic accent (`finance`, `crypto`, `taxes`, `invest`, `networth`, `lounge`, `amzn`, `myth`, `discord`); everything inside reads `--accent` |
| `.panel-head` / `-body` / `-foot` | Title row, content column, status line |
| `.group` | Titled cluster inside a body |
| `.chips` | Wrap of link buttons (plain `<a>`s, no class per link) |
| `.fold` | Native `<details>` accordion that eases open; no JS |
| `.tip` | Name, description, command, link, styled by element (`b`, `p`, `code`, `a`) |
| `.panel-media` | A panel whose content another script owns (memes) |

## Rules

- **Content is markup, controls are JS.** `board.js` adds the move/hide/resize controls, the
  Add widget menu and Reset, so the HTML holds only content and a no-JS visitor still gets the
  laid-out board.
- **No `style=` attributes.** Sizes are `data-w`/`data-h`, colors are `data-accent`; the CSP's
  `'unsafe-inline'` for styles stays an exception for widgets, not a habit.
- **Native first:** `<details>` for folds, the Popover API for the menu, `moveBefore()` (falls
  back to `insertBefore`) so moving a panel keeps focus and playing media.
- **Scales, not numbers:** spacing `--sp-2xs…l`, radius `--r-s/m/l`, type `--fs-xs/s/l`, fonts
  `--font-mono`/`--font-title`. They live in `board.css` until a second page adopts the board,
  then move to `shared.css`.
- **Every control has a keyboard path:** arrows on the move handle reorder, arrows on the
  resize handle resize, and a live region announces each change.

## What a visitor can do

Drag the ⠿ handle to reorder, drag the corner to resize (snaps to whole cells), ✕ to hide,
**＋ Add widget** to bring a hidden panel back, **Reset layout** to return to the page's
default. The layout saves per browser in `localStorage` (`board:<name>`); panels added to the
page after a visitor saved theirs show up first.

## Roadmap

1. **Lab:** `/lab/nexus` until Doshus signs off on the look and feel.
2. **Nexus:** the lab replaces `nexus.html`; nexus.css keeps only the hero and footer bits,
   and the scales move to `shared.css`.
3. **Every page where it fits:** Finance Hub, the Lounge, Zephyy's profile.
4. **Widget catalog over htmx:** widgets that aren't on a page by default (Discord presence,
   Zephyy status, a meme slot) become fragments in a shared folder, and Add widget pulls them
   in with htmx, the way the Zephyy profile's signal deck already does (`zephyy/fragments/`,
   htmx 2.0.10, which then moves from `/zephyy/vendor/` to a shared vendor folder).
5. **Monthly themes** (BLUEPRINT card `49f2128c`): `main.js` sets `data-month` on `<html>`,
   and twelve small blocks in `shared.css` re-point the ambient primitives (nebula, stars, board
   chrome). Section accents stay put so finance stays green; the board picks it all up for free
   because every color already flows through tokens.
