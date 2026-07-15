# Quick Suite Prompt — Sync internal Printmon mirror with doshus.net (2026-07-15 batch)

Copy everything below the line into Amazon Quick Suite with the internal Printmon files
available. This version was written against real internal copies (VI/Easter/Kuromi
classics + TheDoshus GTA/Halloween), so the link rules below are exact.

---

You are editing my **internal-network Printmon mirror** (served from drive.corp — pages
use root-relative `/view/aaustinp@/...` links and have **no `<base>` tag**). The external
site (doshus.net/amazon/printmon) is canonical for layout/features; internal link forms
are canonical for links. Apply each task **surgically**.

## Hard rules
1. **Preserve CRLF line endings**; never reformat, re-indent, or rewrap untouched lines.
2. **Never rewrite internal link forms** (`/view/aaustinp@/...`, `/view/swlls@/...`,
   `localhost:5965`, `axzile.corp`, `drive.corp`) and never add a `<base>` tag.
3. **Never remove internal-only content** (e.g. a dropdown entry the external site lacks,
   like Eraserhead/Aizawa — internal can be ahead of external).
4. If a task's target text is missing on a page (already applied / never had it), skip
   that page and note it. Do not improvise.
5. Internal css/js references stay **bare** (no `?v=` cache-busters) — that is external-only.

## Task 1 — swapbtn.css: replace/append the Zephyy orb styles
In the internal `css/swapbtn.css`: if a `.zephyy-orb` block exists from an earlier sync,
delete it entirely (from the `Zephyy gallery orb` comment to the end of its
reduced-motion block). Then append this whole payload to the end of the file (as CRLF):

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

/* -- orb dock: orb floats above the Doshus.NET scroll button ------------
   2026-07-15 relocation (Doshus): lowkey placement in the horizontal
   scroll strip instead of beside Swap Themes. Wrapper spans the button;
   orb hovers above it with a gentle bob. */
.zephyy-orb-dock {
    position: relative;
    display: inline-block;
}
.zephyy-orb-dock .zephyy-orb {
    position: absolute;
    bottom: calc(100% + 3px);
    left: 50%;
    width: 18px;
    height: 18px;
    margin-left: -9px;
    animation: zephyy-orb-pulse 3.2s ease-in-out infinite, zephyy-orb-bob 4.6s ease-in-out infinite;
}
.zephyy-orb-dock .zephyy-orb:hover,
.zephyy-orb-dock .zephyy-orb:focus-visible {
    transform: none;
    animation: none;  /* transformed ancestor would re-anchor the fixed tip */
}
/* The strip's scroller (overflow-x) must clip vertically, so the tip cannot
   escape upward via absolute positioning; swap-img.js promotes it to
   position:fixed on hover/focus instead. These rules cover the rest. */
.zephyy-orb-dock .zephyy-orb-tip {
    white-space: normal;  /* strip sets nowrap; restore bubble wrap */
    transform-origin: bottom center;
}
@keyframes zephyy-orb-bob {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
}
@media (prefers-reduced-motion: reduce) {
    .zephyy-orb-dock .zephyy-orb { animation: none; }
}
```

## Task 2 — swap-img.js: append the quip + tooltip-positioning block
In the internal `js/swap-img.js`: if a `ZEPHYY GALLERY ORB` block exists, replace it with
the payload below; otherwise append it at the end of the file. Do not touch
`toggleDropdown` or anything else already in the file.

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

	// Docked orb (inside the horizontal scroll strip): the strip's scroller
	// clips the tip, so lift it out with position:fixed while shown.
	var orb = tip.parentElement;
	if (orb && orb.closest && orb.closest('.zephyy-orb-dock')) {
		var place = function() {
			var r = orb.getBoundingClientRect();
			tip.style.position = 'fixed';
			tip.style.top = 'auto';
			tip.style.bottom = (window.innerHeight - r.top + 8) + 'px';
			tip.style.left = Math.max(8, r.left + r.width / 2 - 105) + 'px';
		};
		orb.addEventListener('mouseenter', place);
		orb.addEventListener('focus', place);
	}
})();
```

## Task 3 — dock the orb above the Doshus.NET button (strip pages only)
On **every page whose scroll strip has the Doshus.NET button** (the TheDoshusPrintmon2*
family — e.g. GTA line: `<button onclick="window.open('https://doshus.net')"
class="scroll-button" ...>Doshus.NET</button>`):

Wrap that button and add the orb anchor immediately after it, inside a dock span:

```html
<span class="zephyy-orb-dock"><button onclick="window.open('https://doshus.net')" class="scroll-button" data-tooltip="My lil webpage (check out The Lounge)">Doshus.NET</button><a class="zephyy-orb" href="https://doshus.net/amazon/printmon/gallery.html" aria-label="Zephyy's Theme Gallery"><span class="zephyy-orb-tip" role="tooltip">skins I cooked up — come see ✨</span></a></span>
```

⚠ Keep each page's existing button attributes exactly as found (tooltips may vary) —
only wrap and append. The orb href is the **absolute external gallery URL** (the gallery
only exists on doshus.net; it is reachable from work machines).

If a page still has an old orb anchor beside its Swap Themes button from an earlier sync,
delete that one — the dock replaces it.

Classic pages (Printmon2Doshus*) have no scroll strip — **skip them** for the orb.

## Task 4 — classic pages: backfill missing dropdown entries
The internal classics' "Printmon 2" dropdown section is stale (9 entries). Bring each
classic page's list up to the internal GTA page's full set by inserting the missing
anchors in alphabetical position (formatting matched to the surrounding lines):

```html
<a href="TheDoshusPrintmon2Butterfly.html">Butterfly</a>
<a href="TheDoshusPrintmon2Aizawa.html">Eraserhead</a>
<a href="TheDoshusPrintmon2Glass.html">Glass</a>
<a href="TheDoshusPrintmon2Halloween.html">Halloween</a>
<a href="TheDoshusPrintmon2Melody.html">Melody</a>
<a href="TheDoshusPrintmon2OP.html">One Piece</a>
<a href="TheDoshusPrintmon2Solo.html">Solo Leveling</a>
<a href="TheDoshusPrintmon2Strawberry.html">StrawberryShortcake</a>
<a href="TheDoshusPrintmon2Toki.html">Toki Doki</a>
```

Only add entries whose target page actually exists on the internal mirror — if one
doesn't, skip that anchor and note it. Do the same check on the TheDoshus family pages'
dropdowns (the GTA copy is complete; others may lag).

## Task 5 — link sanity pass
Search every page for `.html?version=` — each Printmon2LATEST link must contain exactly
ONE URL (the external site had a page with two URLs concatenated in one href; verify the
internal copies don't). Report anything odd; fix only obvious duplications.

## Verify before finishing
1. Open a TheDoshus page → scroll the strip right → orb floats above Doshus.NET, bobbing.
2. Hover the orb → glassy "Zephyy:" tooltip appears ABOVE it, fully visible (not clipped
   by the strip), with one of six rotating quips per page load.
3. Click the orb → external theme gallery opens.
4. Open a classic page → dropdown shows the new Printmon 2 entries; every link resolves.
5. Browser console: no new errors on any edited page.
