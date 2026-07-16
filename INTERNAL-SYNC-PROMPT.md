# Quick Suite Prompt — Sync internal Printmon mirror with doshus.net (2026-07-16 batch)

Copy everything below the line into Amazon Quick Suite with the internal Printmon files
available. This batch REPLACES the 2026-07-15 orb entirely: the orb is rebuilt as the
shared "sitewide" component doshus.net now uses (whorl avatar, darker palette), and it
now sits INLINE BESIDE the Doshus.NET button (above collided with the buttons' upward
tooltips; below overlapped the button and gave the strip a vertical scrollbar). The
tooltip drops below the strip via position:fixed.

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

## Task 1 — swapbtn.css: replace the old orb styles with the new component
In the internal `css/swapbtn.css`: delete the ENTIRE old Zephyy orb section from the
`/* ── Zephyy gallery orb ──` comment down through the last orb-related
reduced-motion block (everything the 2026-07-15 sync appended — `.zephyy-orb`,
`.zephyy-orb-tip`, `.zephyy-orb-dock`, their keyframes and media queries). Leave the
dropdown styles above it untouched. Then append this whole payload to the end of the
file (as CRLF):

```css
/* ── Zephyy orb (shared-component port, 2026-07-16) ─────────────────
   Same orb doshus.net uses sitewide: whorl avatar core + quip tooltip.
   Sits inline beside the Doshus.NET button; the tooltip drops below
   the strip (the buttons' own tooltips pop upward — this clears them). */
.zephyy-orb-dock {
    position: relative;
    display: inline-block;
}
.zephyy-orb-sitewide-wrapper.printmon-dock {
    position: relative;
    display: inline-flex;
    vertical-align: middle;
    margin-left: 8px;
}
.zephyy-orb-sitewide {
    position: relative;
    display: flex;
    align-items: center;
    cursor: pointer;
    opacity: 1;
}
.sitewide-orb-core {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, oklch(58% 0.12 300), oklch(38% 0.17 300) 70%);
    box-shadow: 0 0 8px oklch(38% 0.17 300 / 0.35);
    transition: box-shadow 0.3s ease;
    position: relative;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}
.zephyy-orb-sitewide:hover .sitewide-orb-core,
.zephyy-orb-sitewide:focus-visible .sitewide-orb-core {
    box-shadow: 0 0 15px oklch(52% 0.21 302), 0 0 30px oklch(38% 0.20 304 / 0.4);
}
.sitewide-orb-core .zp-orb-glyph {
    display: block;
    width: 82%;
    height: 82%;
    pointer-events: none;
}
.sitewide-orb-core .zp-orb-glyph svg { width: 100%; height: 100%; display: block; }
.whorl-outer, .whorl-mid, .whorl-inner { transform-origin: 32px 32px; }
.whorl-outer { animation: whorlSpin 16s linear infinite; }
.whorl-mid   { animation: whorlSpin 11s linear infinite; }
.whorl-inner { animation: whorlSpin 7s linear infinite; }
.whorl-center { animation: whorlPulse 2.5s ease-in-out infinite; }
@keyframes whorlSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes whorlPulse {
    0%, 100% { opacity: 0.5; transform: scale(0.85); }
    50%      { opacity: 1;   transform: scale(1.15); }
}
.sitewide-orb-preview {
    background: oklch(38% 0.17 300);
    color: oklch(95% 0.02 300);
    padding: 6px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-family: "Amazon Ember", sans-serif;
    font-weight: 600;
    box-shadow: 0 4px 12px oklch(0% 0 0 / 0.3);
    border: 1px solid oklch(52% 0.21 302 / 0.4);
    display: none;
    opacity: 0;
    visibility: hidden;
    position: absolute;
    top: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    white-space: normal;
    width: max-content;
    max-width: 210px;
    text-align: center;
    line-height: 1.35;
    pointer-events: none;
    z-index: 1001;
}
.zephyy-orb-sitewide:hover .sitewide-orb-preview,
.zephyy-orb-sitewide:focus-visible .sitewide-orb-preview {
    display: block;
    opacity: 1;
    visibility: visible;
}
@media (prefers-reduced-motion: reduce) {
    .whorl-outer, .whorl-mid, .whorl-inner, .whorl-center { animation: none; }
    .zephyy-orb-sitewide-wrapper, .zephyy-orb-sitewide,
    .sitewide-orb-core, .sitewide-orb-preview { transition: none; }
}
```

## Task 2 — swap-img.js: replace the orb block with the new one
In the internal `js/swap-img.js`: replace the entire `ZEPHYY GALLERY ORB` IIFE (from its
comment to its closing `})();`) with the payload below. Do not touch `toggleDropdown` or
anything else already in the file.

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
		'I recolor this whole page on request, you know',
		'need a new vibe for the barcode chaos?',
		'my gallery is stocked and ready to go',
		'feeling this base? there\'s plenty more',
		'want to see what else I can generate?',
		'grab a new skin. on the house 😉',
		'ruminating on new color schemes… wanna see? 🤔',
		'*reefing through the theme vault* oh hey, didn\'t see you there',
		'this page? yeah I painted it. more where that came from',
		'psst. the gallery misses you',
		'legally obligated to mention I make themes now',
		'you scan barcodes, I scan color wheels. we are not the same 💅',
		'caught you looking 👀 the gallery\'s one tap away',
		'plotting my next theme drop as we speak'
	];
	tip.textContent = "Zephyy: " + quips[Math.floor(Math.random() * quips.length)];

	// Whorl avatar — same glyph her chat orb wears on doshus.net (the chat
	// stack isn't loaded on printmon, so the SVG is inlined here).
	var core = document.querySelector('.zephyy-orb-dock .sitewide-orb-core');
	if (core && !core.querySelector('.zp-orb-glyph')) {
		var glyph = document.createElement('span');
		glyph.className = 'zp-orb-glyph';
		glyph.innerHTML =
			'<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' +
			'<defs><linearGradient id="pmOrbGrad" x1="0" y1="0" x2="1" y2="1">' +
			'<stop offset="0%" stop-color="#ffffff" stop-opacity="0.98"/>' +
			'<stop offset="50%" stop-color="#d8f0ff" stop-opacity="0.9"/>' +
			'<stop offset="100%" stop-color="#ffffff" stop-opacity="0.75"/>' +
			'</linearGradient></defs>' +
			'<circle cx="32" cy="32" r="29" stroke="#ffffff" stroke-opacity="0.2" stroke-width="0.8" fill="none"/>' +
			'<g class="whorl-outer"><path d="M 32 9 A 23 23 0 1 1 12 44" stroke="url(#pmOrbGrad)" stroke-width="3.2" stroke-linecap="round" opacity="0.85"/><circle cx="32" cy="9" r="2.0" fill="#ffffff" opacity="0.9"/></g>' +
			'<g class="whorl-mid"><path d="M 45 40 A 15 15 0 1 1 32 17" stroke="url(#pmOrbGrad)" stroke-width="3.4" stroke-linecap="round" opacity="0.9"/><circle cx="45" cy="40" r="1.8" fill="#ffffff" opacity="0.95"/></g>' +
			'<g class="whorl-inner"><path d="M 25 36 A 8 8 0 1 1 39 36" stroke="url(#pmOrbGrad)" stroke-width="3.8" stroke-linecap="round" opacity="0.98"/><circle cx="25" cy="36" r="1.6" fill="#ffffff" opacity="0.98"/></g>' +
			'<circle cx="32" cy="32" r="3.6" fill="#ffffff" class="whorl-center"/></svg>';
		core.appendChild(glyph);
	}

	// Docked orb (inside the horizontal scroll strip): the strip's scroller
	// clips the tip, so lift it out with position:fixed while shown.
	var orb = tip.closest('.zephyy-orb-sitewide-wrapper');
	if (orb && orb.closest('.zephyy-orb-dock')) {
		var place = function() {
			var r = orb.getBoundingClientRect();
			tip.style.position = 'fixed';
			tip.style.bottom = 'auto';
			tip.style.top = (r.bottom + 8) + 'px';
			tip.style.left = Math.max(8, r.left + r.width / 2 - 105) + 'px';
			tip.style.transform = 'none';
		};
		var reset = function() {
			tip.style.position = '';
			tip.style.top = '';
			tip.style.left = '';
			tip.style.transform = '';
		};
		orb.addEventListener('mouseenter', place);
		orb.addEventListener('focus', place);
		orb.addEventListener('mouseleave', reset);
		orb.addEventListener('blur', reset);
	}
})();
```

## Task 3 — strip pages: replace the old dock markup with the new component
On **every page whose scroll strip has the Doshus.NET button** (the TheDoshusPrintmon2*
family): find the 2026-07-15 dock span
(`<span class="zephyy-orb-dock">…<a class="zephyy-orb" …>…</a></span>`) and replace the
old `<a class="zephyy-orb" …>…</a>` anchor inside it with:

```html
<a class="zephyy-orb-sitewide-wrapper printmon-dock" href="https://doshus.net/amazon/printmon/gallery.html" aria-label="Zephyy's Theme Gallery"><div class="zephyy-orb-sitewide"><div class="sitewide-orb-core"></div><div class="sitewide-orb-preview zephyy-orb-tip" role="tooltip">skins I cooked up — come see ✨</div></div></a>
```

⚠ Keep each page's existing Doshus.NET button attributes exactly as found — only the
orb anchor inside the dock span changes. The orb href stays the **absolute external
gallery URL**.

Classic pages (Printmon2Doshus*): same as 07-15 — **skip them** for the orb (external
classics carry it beside Swap Themes, but the internal decision was to leave classics
orb-free; unchanged this batch).

## Task 4 — nothing else changed
No dropdown, link, or layout changes on printmon pages this batch beyond the orb. Do
not touch anything outside Tasks 1–3.

## Verify before finishing
1. Open a TheDoshus page → scroll the strip right → orb sits inline right of
   Doshus.NET with a slowly spinning white whorl inside a purple core; the strip has
   NO vertical scrollbar.
2. Hover the orb → core glows brighter purple; "Zephyy:" tooltip appears BELOW the
   strip, fully readable, one of 19 rotating quips per page load.
3. Hover the Doshus.NET button itself → only ITS tooltip shows (orb no longer overlaps
   it); neighboring tooltips clear the orb.
4. Click the orb → external theme gallery opens.
5. Browser console: no new errors on any edited page.
