/**
 * PrintmonGenerator.js v3 — Color Remap Architecture
 * 
 * Parses ANY handcrafted theme CSS as a base, extracts all unique color values,
 * has AI remap them to a new palette, then string-replaces.
 * 
 * Result: identical structure + enhancements, just different colors.
 * Works for GTA, Glass, Halloween — any base theme without template-slots.
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';
const wallpaperCache = new Map();

// ─── Base Theme Registry ───────────────────────────────────

const BASE_THEMES = {
  GTA: {
    name: 'GTA 6',
    cssFile: 'css/newer/2GTA.css',
    htmlFile: 'TheDoshusPrintmon2GTA.html',
    description: 'Dark, vibrant gradients, Pricedown font — Doshus favorite',
  },
  Glass: {
    name: 'Glass',
    cssFile: 'css/newer/2Glass.css',
    htmlFile: 'TheDoshusPrintmon2Glass.html',
    description: 'Transparent, backdrop-blur, sleek modern glassmorphism',
  },
  Halloween: {
    name: 'Halloween',
    cssFile: 'css/newer/2Hallo.css',
    htmlFile: 'TheDoshusPrintmon2Halloween.html',
    description: 'Warm oranges, dark backgrounds, spooky vibes',
  },
  Forest: {
    name: 'Forest',
    cssFile: 'css/newer/2Forest.css',
    htmlFile: 'TheDoshusPrintmon2Forest.html',
    description: 'Green, natural, earthy tones',
  },
  Witch: {
    name: 'Witchery',
    cssFile: 'css/newer/2Witch.css',
    htmlFile: 'TheDoshusPrintmon2Witch.html',
    description: 'Dark purples, mystical, magical feel',
  },
};

// ─── Color Extraction ───────────────────────────────────────

function extractColors(css) {
  const hexColors = new Set();
  const rgbaColors = new Set();
  
  // Hex colors: #RGB, #RRGGBB, #RRGGBBAA
  const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
  let m;
  while ((m = hexRe.exec(css)) !== null) {
    hexColors.add(m[0]);
  }
  
  // rgba/rgb
  const rgbaRe = /rgba?\s*\([^)]+\)/g;
  while ((m = rgbaRe.exec(css)) !== null) {
    rgbaColors.add(m[0]);
  }
  
  // Named colors used in the CSS
  const namedColors = new Set();
  const namedRe = /\b(white|black|transparent|inherit|currentColor)\b/g;
  while ((m = namedRe.exec(css)) !== null) {
    namedColors.add(m[0]);
  }
  
  return { hex: [...hexColors], rgba: [...rgbaColors], named: [...namedColors] };
}

// ─── Color Remap ────────────────────────────────────────────

function remapColors(css, colorMap) {
  let result = css;
  for (const [original, replacement] of Object.entries(colorMap)) {
    // Escape regex special chars
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), replacement);
  }
  return result;
}

// ─── AI Prompt Builder ──────────────────────────────────────

function buildRemapPrompt(userRequest, baseKey, colors) {
  const hexList = colors.hex.join('\n  ');
  const rgbaList = colors.rgba.slice(0, 20).join('\n  ');

  return `You are a visual theme designer. Recolor a Printmon theme based on this request: "${userRequest}"

The current theme uses these colors:
HEX:
  ${hexList}

RGBA (first 20):
  ${rgbaList}

Return a JSON color remap. Replace EVERY hex color with a new value that matches the requested vibe.
Keep the same format: #RRGGBB with optional AA suffix stays the same length.
rgba values: change the RGB values, keep the alpha (last number) the same.
Named colors (white, black, transparent): do NOT change these.

Format:
{
  "name": "Short theme name (max 3 words)",
  "tagline": "Witty tagline under 8 words",
  "remap": {
    "#original1": "#new1",
    "#original2": "#new2",
    ...
  }
}

Rules:
- Pick 3-4 core colors for the theme, derive hex variants from those
- Every hex in the list MUST have a replacement
- Alpha suffixes (like C2, F2, 80, BF) stay semantically similar (semi-transparent stays semi-transparent)
- Make it visually cohesive — this is a real UI, not abstract art
- Return ONLY valid JSON, no other text`;
}

// ─── PrintmonGenerator ──────────────────────────────────────

class PrintmonGenerator {
  /**
   * @param {Object} opts
   * @param {string} opts.name
   * @param {string} opts.tagline
   * @param {string} [opts.baseTheme] — 'GTA', 'Glass', 'Halloween', 'Forest', 'Witch'
   * @param {Object} [opts.remap] — AI-generated color remap
   * @param {string} baseCSS — pre-loaded base theme CSS content
   */
  constructor({ name, tagline, baseTheme, remap }, baseCSS) {
    this.name = name || 'Untitled';
    this.tagline = tagline || '';
    this.baseKey = baseTheme || 'GTA';
    this.baseCSS = baseCSS || '';
    this.remap = remap || {};
  }

  recolor() {
    if (!this.remap || Object.keys(this.remap).length === 0) return this.baseCSS;
    return remapColors(this.baseCSS, this.remap);
  }

  async fetchWallpapers(count = 5) {
    const query = `${this.name} background aesthetic`;
    const cached = wallpaperCache.get(query);
    if (cached && Date.now() - cached.ts < 6 * 60 * 60 * 1000) {
      return cached.urls.slice(0, count);
    }

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
      wallpaperCache.set(query, { urls, ts: Date.now() });
      return urls;
    } catch (err) {
      console.error('Pexels error:', err.message);
      return [];
    }
  }

  safeName() {
    return this.name.replace(/[^a-zA-Z0-9\s_-]/g, '').trim()
      .replace(/\s+/g, '-').toLowerCase() || 'untitled';
  }

  async generate() {
    const sn = this.safeName();
    const css = this.recolor();
    const wallpapers = await this.fetchWallpapers(5);

    return {
      name: this.name,
      safeName: sn,
      tagline: this.tagline,
      baseTheme: this.baseKey,
      wallpapers,
      css,
      createdAt: new Date().toISOString(),
    };
  }
}

module.exports = {
  PrintmonGenerator, BASE_THEMES,
  extractColors, remapColors, buildRemapPrompt,
  wallpaperCache,
};
