# Quick Suite Prompt — Sync internal Printmon mirror with doshus.net (2026-07-17 batch: theme-matched Swap button)

Copy everything below the line into Amazon Quick Suite with the internal Printmon files
available. This batch makes the **Swap Themes button match each theme page**: swapbtn.css
now routes the button's colors through `--swap-accent` / `--swap-glow` / `--swap-ink`
custom properties (fallback = the classic gold), and every theme css file declares its
own accent block at the top. Colors are `oklch()` — all modern browsers support it.

---

You are editing my **internal-network Printmon mirror** (served from drive.corp — pages
use root-relative `/view/aaustinp@/...` links and have **no `<base>` tag**). The external
site (doshus.net/amazon/printmon) is canonical for layout/features; internal link forms
are canonical for links. Apply each task **surgically**.

## Hard rules
1. **Preserve CRLF line endings**; never reformat, re-indent, or rewrap untouched lines.
2. **Never rewrite internal link forms** (`/view/aaustinp@/...`, `/view/swlls@/...`,
   `localhost:5965`, `axzile.corp`, `drive.corp`) and never add a `<base>` tag.
3. **Never remove internal-only content** (dropdown entries the external site lacks, etc.).
4. If a task's target text is missing on a page (already applied / never had it), skip
   that page and note it. Do not improvise.
5. User-facing wording is **theme/themes**, never skin/skins (both sides renamed 2026-07-17).

## Task 1 — swapbtn.css: replace the button rules with the theme-routed version
In the internal `css/swapbtn.css`, replace the ENTIRE `.dropbtn2 { ... }` block and the
`.dropbtn2:hover { ... }` block (currently hardcoded gold `#c4ab49f2` / purple hover)
with this payload (as CRLF). Leave `.dropdown2`, `.dropdown2-content`, and everything
else in the file untouched:

```css
.dropbtn2 {
    /* Theme-routed accent: handcrafted pages set --swap-accent in their
       theme css (loaded after this file); generated pages already expose
       --pm-hue1 via the token contract; fallback = the classic gold.
       Alpha is applied here so the per-page vars stay plain colors. */
    --_swap: var(--swap-accent, var(--pm-hue1, oklch(74.4% 0.121 95.0)));
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
```

(`--pm-hue1` only exists on external generated pages — harmless internally.)

## Task 2 — theme css files: prepend each file's accent block
Prepend the matching block below to the **very top** of each internal theme css file
(before any existing content, then a blank line). If an internal theme css has a
different filename, match by theme. If a file already contains `--swap-accent`, skip it.

**`css/older/2024.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(56.1% 0.145 302.6);
    --swap-glow: oklch(74.2% 0.172 359.9);
}
```

**`css/older/Bitcoin.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(85.5% 0.156 93.2);
    --swap-ink: oklch(25% 0 0);
}
```

**`css/older/Christmas.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(46.7% 0.091 232.0);
    --swap-glow: oklch(60.2% 0.179 24.3);
}
```

**`css/older/Christmas2.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(58.5% 0.181 259.4);
    --swap-glow: oklch(81.0% 0.213 149.3);
}
```

**`css/older/Easter.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(55.0% 0.211 346.5);
}
```

**`css/older/GTA6.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(56.1% 0.145 302.6);
    --swap-glow: oklch(74.2% 0.172 359.9);
}
```

**`css/older/Halloween.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(72.7% 0.152 74.3);
    --swap-glow: oklch(44.3% 0.195 314.6);
}
```

**`css/older/HarryPotter.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(74.6% 0.143 87.5);
}
```

**`css/older/HelloKitty.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(65.2% 0.265 357.0);
    --swap-glow: oklch(100.0% 0.000 89.9);
}
```

**`css/older/Kuromi.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(50.6% 0.129 332.1);
    --swap-glow: oklch(73.1% 0.210 345.7);
}
```

**`css/older/OG.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(62.8% 0.258 29.2);
    --swap-glow: oklch(30.1% 0.032 254.3);
}
```

**`css/older/Summer.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(70.1% 0.231 141.5);
    --swap-glow: oklch(46.1% 0.131 259.0);
}
```

**`css/older/Thanksgiving.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(53.5% 0.160 145.8);
    --swap-glow: oklch(38.7% 0.087 41.3);
}
```

**`css/older/Thanksgiving2.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(75.1% 0.179 58.3);
    --swap-glow: oklch(45.9% 0.183 15.4);
}
```

**`css/newer/2AD.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(46.3% 0.137 140.1);
    --swap-glow: oklch(88.4% 0.124 84.4);
}
```

**`css/newer/2Aizawa.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(30.1% 0.000 89.9);
    --swap-glow: oklch(83.0% 0.145 94.1);
}
```

**`css/newer/2Butterfly.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(90.6% 0.032 314.7);
    --swap-glow: oklch(45.1% 0.161 320.4);
    --swap-ink: oklch(25% 0 0);
}
```

**`css/newer/2DemonSlayer.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(59.2% 0.243 29.2);
}
```

**`css/newer/2Forest.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(57.7% 0.188 143.1);
    --swap-glow: oklch(83.8% 0.179 111.8);
}
```

**`css/newer/2GTA.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(54.5% 0.226 315.1);
    --swap-glow: oklch(71.2% 0.110 190.4);
}
```

**`css/newer/2Glass.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(100% 0 0 / 0.3);
    --swap-glow: oklch(100.0% 0.000 89.9);
}
```

**`css/newer/2HMC.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(59.3% 0.031 248.3);
    --swap-glow: oklch(81.5% 0.082 225.8);
}
```

**`css/newer/2Hallo.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(47.9% 0.197 29.2);
    --swap-glow: oklch(73.3% 0.181 50.3);
}
```

**`css/newer/2Kuromi.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(50.6% 0.129 332.1);
    --swap-glow: oklch(73.1% 0.210 345.7);
}
```

**`css/newer/2Melody.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(66.2% 0.273 336.0);
    --swap-glow: oklch(82.2% 0.166 329.1);
}
```

**`css/newer/2OP.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(64.6% 0.194 41.1);
    --swap-glow: oklch(62.3% 0.188 259.8);
}
```

**`css/newer/2Solo.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(54.1% 0.247 293.0);
}
```

**`css/newer/2Spongebob.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(90.3% 0.187 98.7);
    --swap-glow: oklch(48.4% 0.189 263.6);
    --swap-ink: oklch(25% 0 0);
}
```

**`css/newer/2Strawberry.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(61.2% 0.200 15.7);
    --swap-glow: oklch(86.3% 0.090 154.9);
}
```

**`css/newer/2Toki.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(41.1% 0.063 138.5);
    --swap-glow: oklch(88.4% 0.184 136.6);
}
```

**`css/newer/2Witch.css`**
```css
/* Swap Themes button — page accent (consumed by css/swapbtn.css) */
:root {
    --swap-accent: oklch(30.1% 0.121 325.3);
    --swap-glow: oklch(65.8% 0.088 120.5);
}
```
## Task 3 — nothing else changed
No markup, layout, or link changes this batch. Do not touch anything outside Tasks 1–2.

## Verify before finishing
1. Open several theme pages → the Swap Themes button now wears that page's accent color
   (e.g. Melody = hot pink, Spongebob = yellow with dark text, Kuromi = plum) instead of
   the old gold-on-everything.
2. Hover the button → it brightens toward white and scales slightly (no more purple jump).
3. Pages whose css was skipped still show the classic gold button (the fallback).
4. Browser console: no CSS errors on any edited page.
