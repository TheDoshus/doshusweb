/**
 * PrintmonGenerator.js
 * 
 * Template engine for generated Printmon themes.
 * Takes a palette → produces the 22 CSS override slots + wallpapers.
 * Designed for free-model generation (model picks colors/tagline, engine assembles CSS).
 * 
 * Usage:
 *   const gen = new PrintmonGenerator(palette);
 *   const css = gen.generateCSS();
 *   const wallpapers = await gen.fetchWallpapers();
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'placeholder';

// ─── Color Math ───────────────────────────────────────────────
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)]
    .map((c) => clamp(c).toString(16).padStart(2, '0'))
    .join('');
}

function alpha(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function lerpColor(c1, c2, t) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  return rgbToHex(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t
  );
}

function darken(hex, amount = 0.3) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function lighten(hex, amount = 0.3) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount
  );
}

// ─── Palette → CSS Slots ──────────────────────────────────────

class PrintmonGenerator {
  /**
   * @param {Object} theme
   * @param {string} theme.name         — "Neon Drift"
   * @param {string} theme.tagline      — "ride the waveform"
   * @param {string} theme.primary      — "#ff00ff"
   * @param {string} theme.accent       — "#00ffff"
   * @param {string} [theme.bgDark]     — derived if omitted
   * @param {string} [theme.glowColor]  — derived if omitted
   * @param {string} [theme.fontTitle]  — "Showcard Gothic"
   * @param {string} [theme.fontSubtitle] — "Amazon Ember"
   * @param {string} [theme.feature]    — description for easter egg
   */
  constructor(theme) {
    this.name = theme.name || 'Untitled';
    this.tagline = theme.tagline || 'A generated Printmon theme';
    this.primary = theme.primary || '#6366f1';
    this.accent = theme.accent || '#a855f7';
    this.bgDark = theme.bgDark || darken(this.primary, 0.85);
    this.glowColor = theme.glowColor || this.accent;
    this.fontTitle = theme.fontTitle || 'Showcard Gothic';
    this.fontSubtitle = theme.fontSubtitle || 'Amazon Ember';
    this.feature = theme.feature || 'null';
    
    // Derive intermediate colors
    this.textLight = '#ffffff';
    this.textMuted = '#d0d0d0';
    this.bgPanel = alpha(this.bgDark, 0.5);
  }

  /**
   * Generate the theme CSS file content (matching the 22-slot pattern).
   */
  generateCSS(safeName) {
    const sn = safeName || this.name.replace(/[^a-zA-Z0-9_-]/g, '');
    const P = this.primary;
    const A = this.accent;
    const BD = this.bgDark;
    const G = this.glowColor;
    const TL = this.textLight;

    return `/* Generated Theme: ${this.name} */
/* Tagline: ${this.tagline} */

.printbox {
    background-color: ${alpha(BD, 0.5)};
    border: 5px double ${alpha(A, 0.7)}
}
h1 {
    color: ${alpha(A, 0.76)};
    text-shadow: 2px 2px ${alpha(P, 0.7)};
}
.subtitle {
    color: ${alpha(G, 0.95)};
    font-family: '${this.fontSubtitle}';
    font-size: 20pt;
}
.input-group label {
    color: ${TL};
}
.input-group label span {
    color: ${alpha(A, 0.93)};
}
input[type="text"] {
    border: 1.5px solid ${alpha(G, 0.95)};
}
.print-button {
    background: linear-gradient(90deg, ${alpha(P, 0.82)}, ${alpha(BD, 0.89)});
    color: ${alpha(TL, 0.73)};
    box-shadow: 0 0 15px ${alpha(G, 0.5)}, 0 0 30px ${alpha(P, 0.6)};
}

.print-button:hover {
    background: linear-gradient(145deg, ${alpha(darken(P, 0.2), 0.94)}, ${alpha(A, 0.92)});
    transform: scale(1.05);
    box-shadow: 0 0 20px ${alpha(A, 0.7)}, 0 0 40px ${alpha(darken(P, 0.2), 0.5)};
}

.buttonsLine1 {
    background: linear-gradient(145deg, ${alpha(P, 0.85)}, ${alpha(darken(A, 0.15), 0.77)});
    color: ${TL};
    box-shadow: 0 0 15px rgba(0, 0, 0, 0.7), 0 0 30px ${alpha(P, 0.51)};
}
.buttonsLine1:hover {
    background: linear-gradient(165deg, #000, ${alpha(A, 0.7)});
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.9), 0 0 40px ${alpha(A, 0.64)};
}

.buttonsLine2 {
    background: linear-gradient(195deg, ${alpha(P, 0.85)}, ${alpha(darken(A, 0.15), 0.77)});
    color: ${TL};
    box-shadow: 0 0 15px rgba(0, 0, 0, 0.7), 0 0 30px ${alpha(P, 0.51)};
}
.buttonsLine2:hover {
    background: linear-gradient(165deg, #000, ${alpha(A, 0.7)});
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.9), 0 0 40px ${alpha(A, 0.64)};
}

.buttonsLine3 {
    background: linear-gradient(70deg, ${alpha(P, 0.85)}, ${alpha(darken(A, 0.15), 0.77)});
    color: ${TL};
    box-shadow: 0 0 15px rgba(0, 0, 0, 0.7), 0 0 30px ${alpha(P, 0.51)};
}
.buttonsLine3:hover {
    background: linear-gradient(165deg, #000, ${alpha(A, 0.7)});
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.9), 0 0 40px ${alpha(A, 0.64)};
}

.quick-print-buttons button:hover {
    background-color: ${alpha(P, 0.68)};
    border-color: #000;
}
.quick-print-buttons button:active {
    background-color: #000;
    border-color: ${lighten(A, 0.3)};
}
.scroll-container {
    scrollbar-color: ${alpha(BD, 0.89)} ${alpha(A, 0.43)};
}
.scroll-button {
    background-color: ${alpha(A, 0.75)};
}
.scroll-button:hover {
    background-color: ${darken(A, 0.2)};
}
.asin-sticker-container {
    background-color: ${alpha(P, 0.26)};
    border: 2px dashed ${alpha(A, 0.81)};
}
.asin-sticker-header {
    color: ${TL};
}
.asin-sticker-content button {
    background-color: ${alpha(P, 0.63)};
}
.asin-sticker-content button:hover {
    background-color: ${alpha(A, 0.58)};
}
.MultiBarcode-printer {
    background-color: ${alpha(BD, 0.59)};
    border: 5px double ${alpha(G, 0.7)};
}
.MultiBarcode-printer h2 {
    color: ${TL};
    text-shadow: 2px 2px ${alpha(P, 0.7)};
}
#textAreaID {
    border: 1.5px solid ${alpha(G, 0.95)};
}
.multiButton {
    background: linear-gradient(90deg, ${alpha(P, 0.82)}, ${alpha(BD, 0.89)});
    color: ${TL};
    box-shadow: 0 0 15px ${alpha(G, 0.5)}, 0 0 30px ${alpha(P, 0.6)};
}

.multiButton:hover {
    background: linear-gradient(145deg, ${alpha(darken(P, 0.2), 0.94)}, ${alpha(A, 0.92)});
    transform: scale(1.05);
    box-shadow: 0 0 20px ${alpha(A, 0.7)}, 0 0 40px ${alpha(darken(P, 0.2), 0.5)};
}

#quickbuttons-dropdown .qb-dropbtn {
    background: linear-gradient(145deg, ${alpha(P, 0.85)}, ${alpha(darken(A, 0.15), 0.77)});
    color: ${TL};
    box-shadow: 0 0 15px rgba(0, 0, 0, 0.7), 0 0 30px ${alpha(P, 0.51)};
}
#quickbuttons-dropdown .qb-dropdown-content {
    background-color: ${alpha(P, 0.83)};
}
#quickbuttons-dropdown .qb-dropdown-content a {
    color: ${TL};
}
#quickbuttons-dropdown .qb-dropdown-content a:hover {
    background-color: ${alpha(TL, 0.63)};
}
#quickbuttons-dropdown:hover .qb-dropbtn {
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.9), 0 0 40px ${alpha(A, 0.64)};
}
`;
  }

  /**
   * Fetch wallpapers from Pexels matching the theme.
   * @returns {Promise<string[]>} Array of wallpaper URLs
   */
  async fetchWallpapers(count = 5) {
    const query = `${this.name} aesthetic background`;
    try {
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape&size=large`,
        {
          headers: { Authorization: PEXELS_API_KEY },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (!res.ok) {
        console.error(`Pexels search failed: ${res.status}`);
        return [];
      }
      const data = await res.json();
      return (data.photos || []).map((p) => p.src?.large2x || p.src?.large || p.src?.original);
    } catch (err) {
      console.error('Pexels fetch error:', err.message);
      return [];
    }
  }
}

module.exports = { PrintmonGenerator, alpha, darken, lighten, lerpColor, hexToRgb, rgbToHex };
