# Quick Suite Prompt — Sync internal Printmon mirror with doshus.net (2026-07-12 batch)

Copy everything below the line into Amazon Quick Suite when you have the internal Printmon files open/available.

---

You are editing the **internal-network mirror** of my handcrafted Printmon pages. The canonical source is the external site (doshus.net/amazon/printmon); I sync changes into the internal copies by hand. Apply the edits below **surgically** — change only what each task specifies.

## Hard rules
1. **Preserve CRLF line endings** in every HTML file and in `css/swapbtn.css`. Do not reformat, re-indent, or rewrap anything you aren't explicitly told to change.
2. **Never touch the `<base href=...>` tag** on any page — it points at the internal host on these copies and everything depends on it.
3. Do not add, remove, or "fix" any other links, styles, or scripts beyond these tasks. Internal-only links (drive.corp, drive-render.corp, axzile, localhost) are intentional — leave them all alone.
4. If a task's target text is missing on a given page (already applied, or that page never had it), skip that page and note it — do not improvise.

## Task 1 — Add the Zephyy gallery orb button
On **every page that has the "Swap Themes" button**, insert this anchor immediately **after** the Swap Themes button element (same line-position the external pages use — right beside the button, inside the same toolbar container):

```html
<a class="zephyy-orb" href="https://doshus.net/amazon/printmon/gallery.html" aria-label="Zephyy's Theme Gallery"><span class="zephyy-orb-tip" role="tooltip">skins I cooked up — come see ✨</span></a>
```

Note: the href here is the **absolute external URL** (the theme gallery only exists on the external site — a relative `gallery.html` would 404 against the internal base tag).

Pages without a Swap Themes toolbar (e.g. the bare `Printmon2Doshus` original): skip.

## Task 2 — Remove the old gallery dropdown link (if present)
In each swap-themes dropdown, delete any line like:

```html
<a href="gallery.html">Theme Gallery 🖼️</a>
```

(or any anchor whose visible text is "Theme Gallery 🖼️"). The orb from Task 1 replaces it. If a page doesn't have it, skip.

## Task 3 — Append the orb styles to `css/swapbtn.css`
Append this entire block to the **end** of the internal copy of `css/swapbtn.css` (convert to CRLF to match the file). If a `.zephyy-orb` block already exists from an earlier sync, **replace it entirely** with this version (it includes the newer glassy tooltip):

```css
/* ── Zephyy gallery orb ─────────────────────────────────────
   Sits beside the Swap Themes button on every printmon page.
   Links to the theme gallery; quip text is rotated by swap-img.js. */
.zephyy-orb {
    position: relative;
    display: inline-block;
    width: 22px;
    height: 22px;
    margin-left: 8px;
    vertical-align: middle;
    border-radius: 50%;
    background:
        radial-gradient(circle at 32% 30%, oklch(92% 0.05 300 / 0.9), transparent 42%),
        radial-gradient(circle at 68% 72%, oklch(75% 0.22 330 / 0.55), transparent 55%),
        radial-gradient(circle at 50% 50%, oklch(62% 0.26 295), oklch(30% 0.17 285) 78%);
    box-shadow: 0 0 10px oklch(62% 0.26 295 / 0.55), 0 0 22px oklch(62% 0.26 295 / 0.25);
    animation: zephyy-orb-pulse 3.2s ease-in-out infinite;
    transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.zephyy-orb:hover,
.zephyy-orb:focus-visible {
    transform: scale(1.18);
    box-shadow: 0 0 14px oklch(70% 0.26 300 / 0.8), 0 0 30px oklch(62% 0.26 295 / 0.4);
    animation-play-state: paused;
}

.zephyy-orb-tip {
    position: absolute;
    top: calc(100% + 9px);
    left: -4px;
    width: max-content;
    max-width: 210px;
    padding: 8px 12px;
    border-radius: 12px;
    background: oklch(20% 0.06 290 / 0.96);
    background: linear-gradient(135deg, oklch(25% 0.08 292 / 0.86), oklch(18% 0.06 320 / 0.9));
    border: 1px solid oklch(72% 0.2 315 / 0.52);
    color: oklch(96% 0.015 300);
    font-family: 'Amazon Ember', sans-serif;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.35;
    -webkit-backdrop-filter: blur(12px) saturate(1.2);
    backdrop-filter: blur(12px) saturate(1.2);
    box-shadow:
        0 10px 28px oklch(8% 0.04 290 / 0.5),
        0 0 18px oklch(68% 0.24 305 / 0.24),
        inset 0 1px 0 oklch(94% 0.04 320 / 0.14);
    opacity: 0;
    visibility: hidden;
    transform: translateY(-6px) scale(0.96);
    transform-origin: top left;
    transition: opacity 0.22s ease, transform 0.22s ease, visibility 0.22s;
    pointer-events: none;
    z-index: 1001;
}

.zephyy-orb-tip::before {
    content: "Zephyy: ";
    color: oklch(80% 0.2 330);
    text-shadow: 0 0 10px oklch(72% 0.24 315 / 0.58);
}

.zephyy-orb:hover .zephyy-orb-tip,
.zephyy-orb:focus-visible .zephyy-orb-tip {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
    animation: zephyy-tip-in 0.24s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

@keyframes zephyy-tip-in {
    from { opacity: 0; transform: translateY(-6px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes zephyy-orb-pulse {
    0%, 100% { box-shadow: 0 0 10px oklch(62% 0.26 295 / 0.55), 0 0 22px oklch(62% 0.26 295 / 0.25); }
    50% { box-shadow: 0 0 13px oklch(70% 0.26 300 / 0.7), 0 0 28px oklch(62% 0.26 295 / 0.35); }
}

@media (prefers-reduced-motion: reduce) {
    .zephyy-orb { animation: none; }
    .zephyy-orb, .zephyy-orb-tip { transition: none; }
    .zephyy-orb:hover .zephyy-orb-tip,
    .zephyy-orb:focus-visible .zephyy-orb-tip { animation: none; }
}
```

## Task 4 — Append the tooltip quip rotator to `js/swap-img.js`
Append to the end of the internal copy of `js/swap-img.js`:

```js
// ZEPHYY GALLERY ORB — rotate the tooltip quip each page load
(function() {
	var tip = document.querySelector('.zephyy-orb-tip');
	if (!tip) return;
	var quips = [
		'skins I cooked up — come see ✨',
		'psst… the theme vault is this way 🌌',
		'fresh palette drops in the gallery',
		'your coworkers keep requesting skins. peek the results',
		'tap the orb. cosmic printmons await',
		'I recolor this whole page on request, you know'
	];
	tip.textContent = quips[Math.floor(Math.random() * quips.length)];
})();
```

## Task 5 — Cache-busters
In every page edited above, update the two asset references (only the query string changes):
- `css/swapbtn.css` → `css/swapbtn.css?v=orb2`
- `js/swap-img.js` → `js/swap-img.js?v=orb2`
If a reference already carries an older `?v=` value, replace it with `?v=orb2`.

## Task 6 — Backfill missing theme-dropdown entries
a) **All `Printmon2Doshus*` pages** (2024, Bitcoin, Christmas, Christmas2, Easter, HK, Halloween, HarryPotter, Kuromi, Summer, ThanksGiving, ThanksGiving2, TheOriginal, VI — NOT the bare `Printmon2Doshus`): the dropdown section that lists the `TheDoshusPrintmon2*` themes is missing five entries. Insert them where the other TheDoshusPrintmon2* links sit, keeping the page's indentation style:

```html
<a href="TheDoshusPrintmon2Halloween.html">Halloween</a>
<a href="TheDoshusPrintmon2Melody.html">Melody</a>
<a href="TheDoshusPrintmon2OP.html">One Piece</a>
<a href="TheDoshusPrintmon2Solo.html">Solo Leveling</a>
<a href="TheDoshusPrintmon2Toki.html">Toki Doki</a>
```

b) `TheDoshusPrintmon2Butterfly` page: add `<a href="TheDoshusPrintmon2Butterfly.html">Butterfly</a>` to its own dropdown (pages self-link by convention; match the label the other pages use for Butterfly).

c) `TheDoshusPrintmon2Strawberry` page: add the same Butterfly entry.

Skip any entry that already exists on a page.

## Task 7 — Small link repairs (if the internal copies inherited them)
a) On the **Kuromi** page, look for a mangled URL that starts with `https://drive-render.corp.amazon.comhttps://drive-render.corp.amazon.com/...` and remove the duplicated prefix so it starts with a single `https://drive-render.corp.amazon.com/`.

b) On **Butterfly** and **Strawberry**, if the "Amazon Printmon 2" link uses host `drive.corp.amazon.com`, change just the host to `drive-render.corp.amazon.com` (path/query unchanged).

## Verification checklist (report results per task)
- [ ] Every edited HTML file still has CRLF line endings and its original `<base>` tag.
- [ ] Orb anchor present next to Swap Themes on all toolbar pages; old "Theme Gallery 🖼️" dropdown link gone.
- [ ] `swapbtn.css` ends with the `.zephyy-orb` block exactly once; `swap-img.js` ends with the quip rotator exactly once.
- [ ] Both asset refs carry `?v=orb2` on every edited page.
- [ ] Dropdown counts: `Printmon2Doshus*` pages gained exactly 5 entries; Butterfly and Strawberry gained 1 each.
- [ ] Open one page in a browser: hovering the purple orb shows the glassy "Zephyy: …" tooltip; clicking goes to the external gallery.
