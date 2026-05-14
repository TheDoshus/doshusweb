# Page-Specific Implementation Notes

Page-level details that don't belong in the site blueprint (structure) or GEMINI.md (coding conventions).

---

## zephyy.html — Star System

- `main.js` IS loaded on zephyy.html, but its star generation is overridden by `zephyy.js` — 44 lightweight nodes, no parallax drift
- `#stars` container exists in HTML but was empty until star generation was added in zephyy.js
- `will-change` is overkill for simple twinkle — not needed