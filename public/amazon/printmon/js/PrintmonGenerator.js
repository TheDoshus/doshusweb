/**
 * PrintmonGenerator.js v2 — Copy + Recolor Architecture
 * 
 * Copies an existing handcrafted theme's CSS as base, 
 * has AI recolor every element explicitly, then assembles.
 * Result: same quality as handcrafted themes, just different colors.
 * 
 * Usage:
 *   const gen = new PrintmonGenerator({ baseTheme: '2GTA', palette: {...} });
 *   const css = gen.recolor(palette);
 *   const wallpapers = await gen.fetchWallpapers();
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'placeholder';

// ─── In-memory Caches (bandwidth + rate-limit aware) ─────
const wallpaperCache = new Map(); // keyword → { urls, ts }

function cacheGet(key) {
  const entry = wallpaperCache.get(key);
  if (entry && Date.now() - entry.ts < 6 * 60 * 60 * 1000) return entry.urls; // 6hr TTL
  return null;
}

function cacheSet(key, urls) {
  wallpaperCache.set(key, { urls, ts: Date.now() });
}

// ─── Base Theme Registry ───────────────────────────────────

const BASE_THEMES = {
  '2GTA': {
    name: 'GTA 6',
    css: `@font-face {\n  font-family: 'Pricedown';\n  src: url("https://drive.corp.amazon.com/view/aaustinp@/Printmon%20Archive/Printmon%20Page%20Resources/Page%20Pieces/Fonts/Pricedown%20Bl.otf") format('opentype');\n  font-weight: normal;\n  font-style: normal;\n}\n\n.printbox { background-color: {printboxBg}; border: {printboxBorder} }\nh1 { color: {h1Color}; text-shadow: {h1TextShadow}; }\n.subtitle { color: {subtitleColor}; font-family: 'Harlow Solid Italic', 'Pricedown Black'; }\n.input-group label { color: {inputLabelColor}; }\n.input-group label span { color: {inputLabelSpanColor}; }\ninput[type="text"] { border: {inputBorder}; }\n.print-button { background: {printBtnBg}; color: {printBtnColor}; box-shadow: {printBtnShadow}; }\n.print-button:hover { background: {printBtnHoverBg}; box-shadow: {printBtnHoverShadow}; }\n.buttonsLine1 { background: {btn1Bg}; color: {btnColor}; box-shadow: {btn1Shadow}; }\n.buttonsLine1:hover { background: {btn1HoverBg}; box-shadow: {btn1HoverShadow}; }\n.buttonsLine2 { background: {btn2Bg}; color: {btnColor}; box-shadow: {btn2Shadow}; }\n.buttonsLine2:hover { background: {btn2HoverBg}; box-shadow: {btn2HoverShadow}; }\n.buttonsLine3 { background: {btn3Bg}; color: {btnColor}; box-shadow: {btn3Shadow}; }\n.buttonsLine3:hover { background: {btn3HoverBg}; box-shadow: {btn3HoverShadow}; }\n.quick-print-buttons button:hover { background-color: {quickBtnHoverBg}; border-color: {quickBtnHoverBorder}; }\n.quick-print-buttons button:active { background-color: {quickBtnActiveBg}; border-color: {quickBtnActiveBorder}; }\n.scroll-container { scrollbar-color: {scrollbarColor}; }\n.scroll-button { background-color: {scrollBtnBg}; }\n.scroll-button:hover { background-color: {scrollBtnHoverBg}; }\n.asin-sticker-container { background-color: {asinBg}; border: {asinBorder}; }\n.asin-sticker-header { color: {asinHeaderColor}; }\n.asin-sticker-content button { background-color: {asinBtnBg}; }\n.asin-sticker-content button:hover { background-color: {asinBtnHoverBg}; }\n.MultiBarcode-printer { background-color: {multiBg}; border: {multiBorder}; }\n.MultiBarcode-printer h2 { color: {multiH2Color}; text-shadow: {multiH2Shadow}; }\n#textAreaID { border: {textareaBorder}; }\n.multiButton { background: {multiBtnBg}; color: {multiBtnColor}; box-shadow: {multiBtnShadow}; }\n.multiButton:hover { background: {multiBtnHoverBg}; box-shadow: {multiBtnHoverShadow}; }\n#quickbuttons-dropdown .qb-dropbtn { background: {qbBtnBg}; color: {qbBtnColor}; box-shadow: {qbBtnShadow}; }\n#quickbuttons-dropdown .qb-dropdown-content { background-color: {qbDropdownBg}; }\n#quickbuttons-dropdown .qb-dropdown-content a { color: {qbLinkColor}; }\n#quickbuttons-dropdown .qb-dropdown-content a:hover { background-color: {qbLinkHoverBg}; }\n#quickbuttons-dropdown:hover .qb-dropbtn { box-shadow: {qbBtnHoverShadow}; }`,
    defaults: {
      printboxBg: '#06010180', printboxBorder: '5px double #c4ab49f2',
      h1Color: '#9F31C7C2', h1TextShadow: '2px 2px #c4ab49d6',
      subtitleColor: '#34b8b2c4',
      inputLabelColor: '#8cffff', inputLabelSpanColor: '#00C1FF',
      inputBorder: '1.5px solid #9F31C7CF',
      printBtnBg: 'linear-gradient(120deg, #8cffffbf, #ac6fdebd)', printBtnColor: '#ffffff',
      printBtnShadow: '0 0 15px rgba(255, 107, 107, 0.5), 0 0 30px rgba(78, 205, 196, 0.3)',
      printBtnHoverBg: 'linear-gradient(145deg, #a912fdcf, #cdb34e)',
      printBtnHoverShadow: '0 0 20px rgba(255, 107, 107, 0.7), 0 0 40px rgba(78, 205, 196, 0.5)',
      btn1Bg: 'linear-gradient(145deg, #a912fdcf, #cdb34e)', btnColor: '#ffffff',
      btn1Shadow: '0 0 15px rgba(255, 107, 107, 0.7), 0 0 30px rgba(78, 205, 196, 0.5)',
      btn1HoverBg: 'linear-gradient(145deg, #8cffffbf, #ac6fdebd)',
      btn1HoverShadow: '0 0 20px rgba(255, 107, 107, 0.9), 0 0 40px rgba(78, 205, 196, 0.7)',
      btn2Bg: 'linear-gradient(195deg, #a912fdcf, #cdb34e)', btn2Shadow: '0 0 15px rgba(255, 107, 107, 0.7), 0 0 30px rgba(78, 205, 196, 0.5)',
      btn2HoverBg: 'linear-gradient(145deg, #8cffffbf, #ac6fdebd)', btn2HoverShadow: '0 0 20px rgba(255, 107, 107, 0.9), 0 0 40px rgba(78, 205, 196, 0.7)',
      btn3Bg: 'linear-gradient(70deg, #a912fdcf, #cdb34e)', btn3Shadow: '0 0 15px rgba(255, 107, 107, 0.7), 0 0 30px rgba(78, 205, 196, 0.5)',
      btn3HoverBg: 'linear-gradient(145deg, #8cffffbf, #ac6fdebd)', btn3HoverShadow: '0 0 20px rgba(255, 107, 107, 0.9), 0 0 40px rgba(78, 205, 196, 0.7)',
      quickBtnHoverBg: '#a300ff85', quickBtnHoverBorder: '#a300ff',
      quickBtnActiveBg: '#0213ff7e', quickBtnActiveBorder: '#0600c7',
      scrollbarColor: '#a912fdcf #660a97ae', scrollBtnBg: '#cdb34ed6', scrollBtnHoverBg: '#cb8316',
      asinBg: '#360748A3', asinBorder: '2px dashed #fffc', asinHeaderColor: 'white',
      asinBtnBg: '#9f370fe8', asinBtnHoverBg: '#8cffffbf',
      multiBg: '#06010196', multiBorder: '5px double #c4ab49f2',
      multiH2Color: '#ffffff', multiH2Shadow: '2px 2px #d68cffbf',
      textareaBorder: '1.5px solid #9F31C7CF',
      multiBtnBg: 'linear-gradient(90deg, #8cffffbf, #ac6fdebd)', multiBtnColor: '#ffffff',
      multiBtnShadow: '0 0 15px rgba(255, 107, 107, 0.5), 0 0 30px rgba(78, 205, 196, 0.3)',
      multiBtnHoverBg: 'linear-gradient(145deg, #a912fdcf, #cdb34e)',
      multiBtnHoverShadow: '0 0 20px rgba(255, 107, 107, 0.7), 0 0 40px rgba(78, 205, 196, 0.5)',
      qbBtnBg: 'linear-gradient(145deg, #a912fdcf, #cdb34e)', qbBtnColor: '#ffffff',
      qbBtnShadow: '0 0 15px rgba(255, 107, 107, 0.7), 0 0 30px rgba(78, 205, 196, 0.5)',
      qbDropdownBg: '#e6b7ffcf', qbLinkColor: '#000000', qbLinkHoverBg: '#e3e3e3a0',
      qbBtnHoverShadow: '0 0 20px rgba(255, 107, 107, 0.9), 0 0 40px rgba(78, 205, 196, 0.7)',
    },
  },
  '2Glass': {
    name: 'Glass',
    css: null, // TODO: extract from 2Glass.css
    defaults: {},
  },
  '2Hallo': {
    name: 'Halloween',
    css: null,
    defaults: {},
  },
};

// ─── Color Manipulation ─────────────────────────────────────
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  return {
    r: parseInt(full.substring(0, 2), 16),
    g: parseInt(full.substring(2, 4), 16),
    b: parseInt(full.substring(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map(c => clamp(c).toString(16).padStart(2, '0')).join('');
}

function hexWithAlpha(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a.toFixed(2)})`;
}

// ─── PrintmonGenerator ──────────────────────────────────────

class PrintmonGenerator {
  /**
   * @param {Object} opts
   * @param {string} opts.name
   * @param {string} opts.tagline
   * @param {string} [opts.baseTheme] — '2GTA' (default), '2Glass', etc.
   * @param {Object} [opts.palette] — explicit color map from AI
   */
  constructor(opts = {}) {
    this.name = opts.name || 'Untitled';
    this.tagline = opts.tagline || '';
    this.baseThemeKey = opts.baseTheme || '2GTA';
    this.base = BASE_THEMES[this.baseThemeKey] || BASE_THEMES['2GTA'];
    this.palette = opts.palette || {}; // explicit AI-generated color map
  }

  /**
   * Recolor the base theme CSS with AI-provided palette.
   * Unspecified slots keep base defaults.
   */
  recolor() {
    let css = this.base.css;
    const colors = { ...this.base.defaults, ...this.palette };
    for (const [key, val] of Object.entries(colors)) {
      css = css.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
    }
    return css;
  }

  /**
   * Fetch wallpapers with keyword-based cache.
   */
  async fetchWallpapers(count = 5) {
    const query = `${this.name} background aesthetic`;
    const cached = cacheGet(query);
    if (cached) return cached.slice(0, count);

    try {
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape&size=large`,
        {
          headers: { Authorization: PEXELS_API_KEY },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (!res.ok) return [];
      const data = await res.json();
      const urls = (data.photos || []).map(p => p.src?.large2x || p.src?.large || p.src?.original);
      cacheSet(query, urls);
      return urls;
    } catch (err) {
      console.error('Pexels error:', err.message);
      return [];
    }
  }

  /**
   * Full generation → returns a single RTDB-ready record with embedded CSS.
   */
  async generate() {
    const sn = this.name.replace(/[^a-zA-Z0-9\s_-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'untitled';
    const css = this.recolor();
    const wallpapers = await this.fetchWallpapers(5);

    return {
      name: this.name,
      safeName: sn,
      tagline: this.tagline,
      baseTheme: this.baseThemeKey,
      wallpapers,
      css,                                  // ← merged into single entry
      createdAt: new Date().toISOString(),
    };
  }
}

// ─── AI Palette Prompt ──────────────────────────────────────

/**
 * Build the prompt that asks the AI to generate an explicit color palette
 * for each slot in the base theme.
 */
function buildPalettePrompt(userRequest, baseThemeKey) {
  const base = BASE_THEMES[baseThemeKey] || BASE_THEMES['2GTA'];
  const slotNames = Object.keys(base.defaults).join(', ');

  return `You are a theme designer. Generate a color palette for a Printmon theme based on this request: "${userRequest}"

Return ONLY valid JSON (no other text) with color values for each slot. 
Use the base GTA theme's structure — same gradient angles, same shadow offsets, same border styles — just recolor everything.

Format:
{
  "name": "Short theme name (max 3 words)",
  "tagline": "Witty tagline under 8 words",
  ${Object.keys(base.defaults).slice(0, 10).map(k => `"${k}": "${base.defaults[k]}"`).join(',\n  ')},
  ... (all slots listed above)
}

RULES:
- Name and tagline must match the requested theme vibe
- Pick 2–3 core colors for the theme, derive all slots from those (use hex with alpha, gradients use 2 colors)
- Gradients keep their existing angles and syntax — only change the colors inside
- Box shadows keep their existing blur/spread — only change the rgba colors
- Border styles (solid, double, dashed) stay the same — only change colors
- Make it look GOOD — intentional color choices, not random
- The base defaults are shown above as reference for the FORMAT`;
}

module.exports = { PrintmonGenerator, BASE_THEMES, buildPalettePrompt, wallpaperCache };
