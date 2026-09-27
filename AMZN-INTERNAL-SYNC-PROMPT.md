# Quick Suite Prompt — Sync internal Printmon mirror with doshus.net (2026-07-17 batch 3: glassy orb core)

Copy everything below the line into Amazon Quick Suite with the internal Printmon files
available. This batch restyles **Zephyy's orb core** as translucent glass (see-through
with a top-left sheen, page blurs through it) instead of the solid purple ball. One
file changes: `css/swapbtn.css` (the orb section near the end).

---

You are editing my **internal-network Printmon mirror**. Apply the task **surgically**.

## Hard rules
1. **Preserve CRLF line endings**; never reformat untouched lines.
2. If the target text is missing (already applied), note it and stop. Do not improvise.

## Task — swapbtn.css: glass up the orb core
In the internal `css/swapbtn.css` (Zephyy orb section), make two replacements:

**1.** Replace the entire `.sitewide-orb-core { ... }` block with:

```css
.sitewide-orb-core {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    /* Glass orb: translucent purple depth + top-left sheen, page shows
       through via backdrop blur; the whorl glyph floats inside */
    background: radial-gradient(circle at 32% 28%,
        oklch(95% 0.03 300 / 0.5),
        oklch(62% 0.15 300 / 0.32) 42%,
        oklch(38% 0.17 300 / 0.5) 72%,
        oklch(28% 0.15 300 / 0.68));
    border: 1px solid oklch(85% 0.06 300 / 0.4);
    backdrop-filter: blur(6px) saturate(140%);
    -webkit-backdrop-filter: blur(6px) saturate(140%);
    box-shadow: 0 0 10px oklch(52% 0.21 302 / 0.35),
        inset 0 1px 6px oklch(100% 0 0 / 0.45),
        inset 0 -4px 10px oklch(30% 0.2 300 / 0.45);
    transition: box-shadow 0.3s ease, transform 0.3s ease;
    position: relative;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}
```

**2.** Replace the orb-hover glow block
(`.zephyy-orb-sitewide:hover .sitewide-orb-core, .zephyy-orb-sitewide:focus-visible .sitewide-orb-core { ... }`) with:

```css
.zephyy-orb-sitewide:hover .sitewide-orb-core,
.zephyy-orb-sitewide:focus-visible .sitewide-orb-core {
    /* Keep the glass insets alongside the hover glow */
    box-shadow: 0 0 15px oklch(52% 0.21 302), 0 0 30px oklch(38% 0.20 304 / 0.4),
        inset 0 1px 6px oklch(100% 0 0 / 0.45),
        inset 0 -4px 10px oklch(30% 0.2 300 / 0.45);
    transform: scale(1.12);
}
```

(If the internal hover block already carries `transform: scale(1.12)`, keep it — the
box-shadow lines are what change.)

## Verify before finishing
1. Any strip page → the orb above Doshus.NET is now a translucent glass sphere — you can
   faintly see the wallpaper through it, with a light sheen at the top-left and the
   spinning whorl inside. Purple identity still clearly reads on light pages.
2. Hover → brighter glow, sheen still visible, orb grows slightly.
3. No layout shift; button alignment unchanged; console clean.
