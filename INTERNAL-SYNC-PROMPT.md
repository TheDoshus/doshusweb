# Quick Suite Prompt — Sync internal Printmon mirror with doshus.net (2026-07-17 batch 2: theme-matched dropdown)

Copy everything below the line into Amazon Quick Suite with the internal Printmon files
available. This batch extends the theme-matched Swap button (already synced) to its
**dropdown menu**: accent-tinted dark glass panel, pastel accent links, themed border/
glow/scrollbar, and a slide-down open animation. One file changes: `css/swapbtn.css`.

---

You are editing my **internal-network Printmon mirror** (served from drive.corp). The
external site (doshus.net/amazon/printmon) is canonical for layout/features; internal
link forms are canonical for links. Apply the task **surgically**.

## Hard rules
1. **Preserve CRLF line endings**; never reformat, re-indent, or rewrap untouched lines.
2. **Never rewrite internal link forms** and never add a `<base>` tag.
3. If the target text is missing (already applied), note it and stop. Do not improvise.

## Task — swapbtn.css: replace the button + dropdown section
In the internal `css/swapbtn.css`, replace EVERYTHING from the `.dropdown2 {` rule at the
top of the file down through the `.dropdown2-content::-webkit-scrollbar-thumb:hover` block
(inclusive) with the payload below (as CRLF). The Zephyy-orb/whorl section after it stays
untouched. Note the `--_swap` custom property moved from `.dropbtn2` up to `.dropdown2`
so the dropdown inherits it too — after this edit `.dropbtn2` must NOT contain its own
`--_swap` line.

```css
.dropdown2 {
    position: fixed;
    left: 0px;
    z-index: 1000;
    /* Theme-routed accent, inherited by the button AND its dropdown:
       handcrafted pages set --swap-accent in their theme css (loaded after
       this file); generated pages already expose --pm-hue1 via the token
       contract; fallback = the classic gold. Alpha is applied at each use
       so the per-page vars stay plain colors. */
    --_swap: var(--swap-accent, var(--pm-hue1, oklch(74.4% 0.121 95.0)));
}

.dropbtn2 {
    background-color: color-mix(in oklab, var(--_swap) 92%, transparent);
    color: var(--swap-ink, oklch(100% 0 0));
    padding: 5px 10px;
    font-size: 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    box-shadow: 0 0 10px color-mix(in oklab, var(--swap-glow, var(--_swap)) 50%, transparent);
    transition: all 0.3s ease;
}

.dropbtn2:hover {
    background-color: color-mix(in oklab, var(--_swap) 74%, oklch(98% 0.01 95));
    transform: scale(1.05);
}

.dropdown2-content {
    display: none;
    position: absolute;
    /* Dark glass tinted with the page accent (was flat #3F3F3F91) */
    background-color: color-mix(in oklab, var(--_swap) 20%, oklch(24% 0 0 / 0.55));
    min-width: 225px;
    max-height: 400px;
    overflow-y: auto;
    box-shadow: 0 4px 12px oklch(0% 0 0 / 0.3),
                0 0 18px color-mix(in oklab, var(--swap-glow, var(--_swap)) 25%, transparent);
    border: 1px solid color-mix(in oklab, var(--_swap) 45%, transparent);
    border-radius: 6px;
    z-index: 1;
    font-family: 'Amazon Ember', sans-serif;
    color: oklch(100% 0 0);
    backdrop-filter: blur(5px);
    text-align: center;
}
.dropdown2-content h2 {
    border-bottom: 1.5px solid color-mix(in oklab, var(--_swap) 60%, oklch(97% 0 0 / 0.75));
    margin: 20px 10px;
}

.dropdown2-content a {
    /* Pastel of the theme's glow companion — always readable on the glass */
    color: color-mix(in oklab, var(--swap-glow, var(--_swap)) 55%, oklch(96% 0.005 95));
    padding: 10px 15px;
    text-decoration: none;
    display: block;
    font-size: 17.5px;
    transition: background-color 0.2s ease, color 0.2s ease;
    text-align: center;
    font-family: Imprint MT Shadow;
    font-weight: 600;
}

.dropdown2-content a:hover {
    background-color: color-mix(in oklab, var(--_swap) 45%, transparent);
    color: oklch(98% 0 0);
}

.show {
    display: block;
    transform-origin: top left;
    animation: swapMenuIn 0.28s cubic-bezier(0.34, 1.4, 0.64, 1);
}

@keyframes swapMenuIn {
    from { opacity: 0; transform: translateY(-8px) scale(0.96); }
    to   { opacity: 1; transform: none; }
}

/* Scrollbar styles for webkit browsers */
.dropdown2-content::-webkit-scrollbar {
    width: 6px;
}

.dropdown2-content::-webkit-scrollbar-track {
    background: oklch(20% 0 0 / 0.35);
}

.dropdown2-content::-webkit-scrollbar-thumb {
    background: color-mix(in oklab, var(--_swap) 65%, oklch(55% 0 0));
    border-radius: 3px;
}

.dropdown2-content::-webkit-scrollbar-thumb:hover {
    background: color-mix(in oklab, var(--_swap) 80%, oklch(75% 0 0));
}
```

Also: in the reduced-motion block at the very END of the file (the whorl one), make sure
`.show { animation: none; }` is present — add this line inside that block if missing:

```css
    .show { animation: none; }
```

## Verify before finishing
1. Open a few theme pages → click Swap Themes → the dropdown is now dark glass **tinted
   with that page's accent** (Melody pinkish, Kuromi plum, OP warm brown w/ pastel-blue
   links) with a matching border and soft glow — not the old flat gray + green links.
2. The menu slides down with a slight overshoot when opening (~0.3s).
3. Link hover shows a translucent accent highlight; scrollbar thumb is accent-tinted.
4. Pages without an accent block still get the classic-gold-tinted fallback everywhere.
5. Browser console: no CSS errors.
