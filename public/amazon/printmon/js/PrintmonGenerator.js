/**
 * PrintmonGenerator.js v4 — Design System Architecture
 * 
 * Template CSS uses CSS custom properties (design tokens).
 * AI remaps only the master palette values in the :root block.
 * RGB tuples are auto-computed from hex for alpha transparency.
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';
const wallpaperCache = new Map();

// ─── Base Theme Registry ───────────────────────────────────

const BASE_THEMES = {
  GTA: {
    name: 'GTA 6',
    cssFile: 'css/newer/_template-gta.css',
    htmlFile: 'template.html',
    description: 'Custom generated theme — Classic base',
  },
  Glass: {
    name: 'Glass',
    cssFile: 'css/newer/_template-glass.css',
    htmlFile: 'template.html',
    description: 'Custom generated theme — Glass base',
  },
  Halloween: {
    name: 'Halloween',
    cssFile: 'css/newer/_template-halloween.css',
    htmlFile: 'template.html',
    description: 'Custom generated theme — Halloween base',
  },
  Forest: {
    name: 'Forest',
    cssFile: 'css/newer/_template-forest.css',
    htmlFile: 'template.html',
    description: 'Custom generated theme — Forest base',
  },
  Witch: {
    name: 'Witchery',
    cssFile: 'css/newer/_template-witch.css',
    htmlFile: 'template.html',
    description: 'Custom generated theme — Witch base',
  },
  Terminal: {
    name: 'Terminal',
    cssFile: 'css/newer/_template-terminal.css',
    htmlFile: 'template.html',
    description: 'CRT console flavor — monospace, scanlines, hard corners',
  },
  Aurora: {
    name: 'Aurora',
    cssFile: 'css/newer/_template-aurora.css',
    htmlFile: 'template.html',
    description: 'Cosmic glass flavor — frosted panels, gradient title, pill buttons',
  },
  Synthwave: {
    name: 'Synthwave',
    cssFile: 'css/newer/_template-synthwave.css',
    htmlFile: 'template.html',
    description: '80s retrowave flavor — neon text shadows, scanlines, and high-tech typography',
  },
  Brutalist: {
    name: 'Brutalist',
    cssFile: 'css/newer/_template-brutalist.css',
    htmlFile: 'template.html',
    description: 'Stark, high-contrast brutalist design — hard shadows, thick borders, flat colors',
  },
};

// ─── Font Pool ───────────────────────────────────────────────

const FONT_POOL = {
  spooky: [
    "'Chiller', cursive",
    "'Jokerman', cursive",
    "'Blackadder ITC', cursive"
  ],
  elegant: [
    "'French Script MT', cursive",
    "'Vivaldi', cursive",
    "'Edwardian Script ITC', cursive",
    "'Vladimir Script', cursive"
  ],
  bold: [
    "'Impact', sans-serif",
    "'Broadway', fantasy",
    "'Showcard Gothic', fantasy",
    "'Stencil', fantasy",
    "'Wide Latin', serif"
  ],
  playful: [
    "'Curlz MT', fantasy",
    "'Kristen ITC', fantasy",
    "'Ravie', fantasy",
    "'Jokerman', fantasy",
    "'Snap ITC', fantasy"
  ],
  tech: [
    "'Consolas', monospace",
    "'OCR A Extended', monospace"
  ],
  classic: [
    "'Old English Text MT', serif",
    "'Castellar', serif",
    "'Colonna MT', serif"
  ]
};

// ─── Token Palette Extraction ──────────────────────────────

/**
 * Extract the master palette from the :root block.
 * Only captures hex color variables + glow RGB tuples.
 */
function extractPalette(css) {
  // Pull out the :root block
  const rootMatch = css.match(/:root\s*\{([^}]+)\}/s);
  if (!rootMatch) return { hexVars: {}, glowVars: {} };

  const rootBlock = rootMatch[1];
  const hexVars = {};
  const glowVars = {};

  // Match variable declarations with hex values: --pm-xxx: #XXXXXX;
  const hexRe = /(--pm-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6,8})\b/g;
  let m;
  while ((m = hexRe.exec(rootBlock)) !== null) {
    hexVars[m[1]] = m[2];
  }

  // Match glow RGB tuples: --pm-glow-xxx: R, G, B;
  const glowRe = /(--pm-glow-\w+)\s*:\s*(\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3})/g;
  while ((m = glowRe.exec(rootBlock)) !== null) {
    glowVars[m[1]] = m[2].replace(/\s+/g, ' ');
  }

  return { hexVars, glowVars };
}

/**
 * Build a human-readable summary of the palette for the AI prompt.
 * Groups variables by semantic family.
 */
function describePalette(hexVars) {
  const groups = {
    'HUE 1 — Primary (main identity)': [],
    'HUE 2 — Warm (gold/secondary)': [],
    'HUE 3 — Cool (cyan accent)': [],
    'Surfaces (panel backgrounds)': [],
    'Light surfaces (dropdowns)': [],
    'Text': [],
  };

  for (const [name, value] of Object.entries(hexVars)) {
    if (name.startsWith('--pm-hue1')) groups['HUE 1 — Primary (main identity)'].push({ name, value });
    else if (name.startsWith('--pm-hue2')) groups['HUE 2 — Warm (gold/secondary)'].push({ name, value });
    else if (name.startsWith('--pm-hue3')) groups['HUE 3 — Cool (cyan accent)'].push({ name, value });
    else if (name.startsWith('--pm-surface')) groups['Surfaces (panel backgrounds)'].push({ name, value });
    else if (name.startsWith('--pm-light') || name.startsWith('--pm-neutral')) groups['Light surfaces (dropdowns)'].push({ name, value });
    else if (name.startsWith('--pm-text')) groups['Text'].push({ name, value });
  }

  let desc = '';
  for (const [group, vars] of Object.entries(groups)) {
    if (vars.length === 0) continue;
    desc += `\n${group}:\n`;
    for (const v of vars) {
      desc += `  ${v.name}: ${v.value}\n`;
    }
  }

  return desc;
}

// ─── RGB Computation ───────────────────────────────────────

/**
 * Convert hex color to RGB tuple string: "R, G, B"
 */
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  if (hex.length === 8) hex = hex.slice(0, 6); // strip alpha
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

/**
 * WCAG relative luminance of a hex color (0–1, 0=black, 1=white).
 */
function perceivedBrightness(hex) {
  const [r, g, b] = hexToRgb(hex).split(', ').map(Number);
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Lighten a hex color by a factor (0–1).
 */
function lightenHex(hex, factor) {
  const rgb = hexToRgb(hex).split(', ').map(Number);
  const lightened = rgb.map(c => Math.min(255, Math.round(c + (255 - c) * factor)));
  return '#' + lightened.map(c => c.toString(16).padStart(2, '0')).join('');
}

/**
 * Darken a hex color by a factor (0–1).
 */
function darkenHex(hex, factor) {
  const rgb = hexToRgb(hex).split(', ').map(Number);
  const darkened = rgb.map(c => Math.max(0, Math.round(c * (1 - factor))));
  return '#' + darkened.map(c => c.toString(16).padStart(2, '0')).join('');
}

/**
 * Blend two hex colors.
 * @param {string} fromHex
 * @param {string} toHex
 * @param {number} ratio - 0 keeps fromHex, 1 becomes toHex
 * @returns {string}
 */
function blendHex(fromHex, toHex, ratio) {
  const clamped = Math.max(0, Math.min(1, Number(ratio) || 0));
  const from = hexToRgb(fromHex).split(', ').map(Number);
  const to = hexToRgb(toHex).split(', ').map(Number);
  const mixed = from.map((value, index) => {
    return Math.round(value + (to[index] - value) * clamped);
  });
  return '#' + mixed.map(c => c.toString(16).padStart(2, '0')).join('');
}

/**
 * Auto-derive a full 14-token palette from 3 seed colors.
 * @param {string} primary - main brand color (hex)
 * @param {string} accent - cool accent (hex)
 * @param {string} [surface] - dark surface (hex, default derived from primary)
 * @returns {{ palette: Object, glow: Object }}
 */
function derivePalette(primary, accent, surface) {
  let p = primary || '#9F31C7';
  let a = accent || '#00C1FF';

  // Guard: if the AI picks a near-black primary for "dark theme" requests,
  // the title text renders invisible on the dark surface. Boost luminance
  // to at least #444 (~0.05) so text is readable at 0.76 alpha.
  const MIN_PRIMARY_LUM = 0.05;
  const pLum = perceivedBrightness(p);
  if (pLum < MIN_PRIMARY_LUM) {
    const boost = Math.min(0.75, (MIN_PRIMARY_LUM - pLum) * 12);
    p = lightenHex(p, boost);
  }

  if (perceivedBrightness(a) < 0.08) {
    a = lightenHex(a, 0.42);
  }

  // Build a bridge color so two-input themes feel intentional instead of flat.
  const bridge = blendHex(p, a, 0.34);
  const warm = blendHex(lightenHex(p, 0.08), lightenHex(bridge, 0.22), 0.46);
  const brightPrimary = lightenHex(blendHex(p, a, 0.12), 0.28);
  const accentLight = lightenHex(blendHex(a, '#ffffff', 0.14), 0.24);
  const surfaceSeed = surface || darkenHex(blendHex(p, a, 0.16), 0.9);
  const deepSurface = darkenHex(surfaceSeed, 0.08);
  const altSurface = darkenHex(blendHex(surfaceSeed, bridge, 0.18), 0.18);
  const lightTone = lightenHex(blendHex(p, bridge, 0.24), 0.68);

  return {
    palette: {
      '--pm-hue1': p,
      '--pm-hue1-deep': darkenHex(p, 0.5),
      '--pm-hue1-bright': brightPrimary,
      '--pm-hue2': warm,
      '--pm-hue2-bright': lightenHex(warm, 0.25),
      '--pm-hue2-deep': darkenHex(warm, 0.35),
      '--pm-hue3': a,
      '--pm-hue3-light': accentLight,
      '--pm-surface': deepSurface,
      '--pm-surface-alt': altSurface,
      '--pm-light': lightTone,
      '--pm-neutral': '#e3e3e3',
      '--pm-text': '#ffffff',
      '--pm-text-dark': '#000000',
    },
    glow: {
      '--pm-glow-warm': hexToRgb(lightenHex(blendHex(warm, p, 0.3), 0.05)),
      '--pm-glow-cool': hexToRgb(lightenHex(blendHex(a, bridge, 0.18), 0.18)),
    },
  };
}

/**
 * Build CSS :root block with hex vars AND computed -rgb variants.
 * { "--pm-hue1": "#FF0000", ... } → CSS :root { ... }
 */
function buildRootBlock(hexVars, glowVars) {
  const lines = [':root {'];

  // Group by base name (strip -rgb suffix, which shouldn't exist anyway)
  const rgbVars = {};

  for (const [name, value] of Object.entries(hexVars)) {
    lines.push(`  ${name}: ${value};`);
    // Compute RGB if this is a base color (not already rgb)
    if (value.startsWith('#')) {
      const rgbName = name + '-rgb';
      rgbVars[rgbName] = hexToRgb(value);
    }
  }

  // Insert computed RGB tuples after their hex counterparts
  // We need to rebuild since insertion order matters
  const finalLines = [':root {'];
  for (const [name, value] of Object.entries(hexVars)) {
    finalLines.push(`  ${name}: ${value};`);
    if (value.startsWith('#')) {
      const rgbName = name + '-rgb';
      finalLines.push(`  ${rgbName}: ${rgbVars[rgbName]};`);
    }
  }

  // Add glow vars
  for (const [name, value] of Object.entries(glowVars)) {
    finalLines.push(`  ${name}: ${value};`);
  }

  finalLines.push('}');
  return finalLines.join('\n');
}

// ─── Color Remap ──────────────────────────────────────────

/**
 * Replace palette values in the CSS :root block only.
 * colorMap: { "--pm-hue1": "#NEWHEX", ... }
 */
function remapPalette(css, colorMap) {
  let result = css;
  for (const [varName, newValue] of Object.entries(colorMap)) {
    // Match the variable declaration line: --pm-xxx: #OLDHEX;
    const escapedName = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${escapedName}\\s*:\\s*)(#[0-9a-fA-F]{3,8}|[^;]+)`, 'g');
    result = result.replace(re, `$1${newValue}`);
  }
  return result;
}

/**
 * Produce the final CSS: rebuilt :root block + element rules with var() refs.
 */
function buildCSS(css, hexVars, glowVars) {
  // Replace the :root block with the rebuilt one
  const newRoot = buildRootBlock(hexVars, glowVars);
  return css.replace(/:root\s*\{[^}]+\}/s, newRoot);
}

// ─── AI Prompt Builder ─────────────────────────────────────

function buildRemapPrompt(userRequest, baseKey, palette) {
  const paletteDesc = describePalette(palette.hexVars);

  return `You are a visual theme designer for a barcode-printing web tool called Printmon.

THEME REQUEST: "${userRequest}"
Base style: ${baseKey}

The UI uses a DESIGN SYSTEM with these semantic color tokens:
${paletteDesc}

GLOW COLORS (RGB tuples used in box-shadows):
  --pm-glow-warm: ${palette.glowVars['--pm-glow-warm'] || '255, 107, 107'}
  --pm-glow-cool: ${palette.glowVars['--pm-glow-cool'] || '78, 205, 196'}

Return a JSON color remap that transforms this into the requested theme:

{
  "name": "Theme name (max 3 words)",
  "tagline": "Witty tagline under 8 words",
  "palette": {
    "--pm-hue1": "#XXXXXX",
    "--pm-hue1-deep": "#XXXXXX",
    "--pm-hue1-bright": "#XXXXXX",
    "--pm-hue2": "#XXXXXX",
    "--pm-hue2-bright": "#XXXXXX",
    "--pm-hue2-deep": "#XXXXXX",
    "--pm-hue3": "#XXXXXX",
    "--pm-hue3-light": "#XXXXXX",
    "--pm-surface": "#XXXXXX",
    "--pm-surface-alt": "#XXXXXX",
    "--pm-light": "#XXXXXX",
    "--pm-neutral": "#XXXXXX",
    "--pm-text": "#XXXXXX",
    "--pm-text-dark": "#XXXXXX"
  },
  "glow": {
    "--pm-glow-warm": "R, G, B",
    "--pm-glow-cool": "R, G, B"
  }
}

DESIGN RULES:
- Pick 3-4 CORE COLORS that define the theme
- CRITICAL: Avoid overly saturated or neon colors. Saturation should be moderate (60-75% max) unless the theme specifically demands neon.
- Prefer muted, natural, or slightly desaturated tones that are comfortable to read on a dark background.
- Example bad picks: pure #FF0000, #00FF00, #FF69B4, #FFD700, #00BFFF — too bright for UI
- Example good picks: #C06080, #B8860B, #3B82F6, #6B8E23, #8B7355 — still colorful but readable
- Users spend hours staring at this interface. It should not look like a neon sign.
- Derive all variants from those core colors (bright = lighter/more saturated, deep = darker)
- HUE1 variants: base → bright (lighter) → deep (darker) — all in same color family
- HUE2 variants: base → bright (lighter) → deep (darker) — all in same color family
- HUE3 variants: base → light (paler/brighter) — same family
- Surface: dark color (near-black or deep shade of a theme color)
- Surface-alt: slightly different dark surface
- Light surfaces: pale tint for dropdown backgrounds
- Neutral: near-white for hover states
- Text: white or near-white (light-on-dark UI)
- Text-dark: dark for contrast on light dropdowns
- Glow warm: warm complement to the palette
- Glow cool: cool complement to the palette
- Keep the same character count in hex values (6 chars for solid, 8 if alpha)
- Make ALL values visually COHESIVE — this is a real UI, not abstract art
- Return ONLY valid JSON, no markdown, no backticks, no other text`;
}

// ─── PrintmonGenerator ─────────────────────────────────────

/**
 * Build short, palette-aware wallpaper searches, ordered best to safest.
 */
function buildWallpaperQueries(name, tagline, palette, keywords) {
  const stripPromptWords = (value) => String(value || '')
    .replace(/\b(make|create|generate|design|build|me|a|an|theme|printmon|skin)\b/gi, '')
    .replace(/[^a-z0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const limitWords = (value, max) => value.split(/\s+/).filter(Boolean).slice(0, max).join(' ');
  const parseHex = (hex) => {
    const clean = String(hex || '').replace(/^#/, '').slice(0, 6);
    if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
    const [r, g, b] = [0, 2, 4].map((offset) => parseInt(clean.slice(offset, offset + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let hue = 0;
    if (delta) {
      if (max === r) hue = 60 * (((g - b) / delta) % 6);
      else if (max === g) hue = 60 * (((b - r) / delta) + 2);
      else hue = 60 * (((r - g) / delta) + 4);
    }
    return { hue: hue < 0 ? hue + 360 : hue, lightness: (max + min) / 2, chroma: delta };
  };
  const hueWord = ({ hue, chroma }) => {
    if (chroma < 0.08) return 'monochrome';
    if (hue < 15 || hue >= 345) return 'crimson';
    if (hue < 45) return 'orange';
    if (hue < 70) return 'gold';
    if (hue < 155) return 'green';
    if (hue < 195) return 'teal';
    if (hue < 255) return 'blue';
    if (hue < 315) return 'purple';
    return 'pink';
  };

  const strippedKeywords = keywords ? stripPromptWords(keywords) : '';
  const strippedName = stripPromptWords(name);
  const subjectSource = strippedKeywords || stripPromptWords(`${name || ''} ${tagline || ''}`) || String(name || '').trim();
  const safetySource = keywords ? (strippedKeywords || String(name || '').trim()) : (strippedName || String(name || '').trim());
  const safetyQuery = limitWords(safetySource || 'wallpaper', 6);
  const paletteEntries = Object.entries(palette || {})
    .map(([key, value]) => [key, parseHex(value)])
    .filter((entry) => entry[1]);
  const dominant = (
    paletteEntries.find(([key, color]) => key === '--pm-hue1' && color.chroma >= 0.08)
    || paletteEntries.find(([key, color]) => key.startsWith('--pm-hue') && color.chroma >= 0.08)
    || paletteEntries.find(([, color]) => color.chroma >= 0.08)
    || paletteEntries[0]
  )?.[1];
  const surfaceColors = paletteEntries.filter(([key]) => key.startsWith('--pm-surface')).map(([, color]) => color);
  const moodColors = surfaceColors.length ? surfaceColors : paletteEntries.map(([, color]) => color);
  const averageLightness = moodColors.length
    ? moodColors.reduce((sum, color) => sum + color.lightness, 0) / moodColors.length
    : 0.5;
  const colorWord = dominant ? hueWord(dominant) : '';
  const moodWords = averageLightness < 0.45 ? 'dark moody' : 'bright airy';
  const subjectWords = subjectSource.split(/\s+/).filter((word) => word && word.toLowerCase() !== colorWord);
  const primarySubject = subjectWords.slice(0, 1).join(' ') || limitWords(subjectSource, 1);
  const secondarySubject = subjectWords.slice(0, 5 - (colorWord ? 1 : 0)).join(' ') || limitWords(subjectSource, 4);
  const candidates = [
    [primarySubject, colorWord, moodWords, 'abstract wallpaper'].filter(Boolean).join(' '),
    [secondarySubject, colorWord].filter(Boolean).join(' '),
    safetyQuery,
  ].map((query) => limitWords(query, 6)).filter(Boolean);

  return [...new Set(candidates)].slice(0, 3);
}

class PrintmonGenerator {
  /**
   * @param {Object} opts
   * @param {string} opts.name
   * @param {string} opts.tagline
   * @param {string} [opts.baseTheme] — 'GTA', 'Glass', 'Halloween', 'Forest', 'Witch'
   * @param {Object} [opts.palette] — AI-generated palette remap
   * @param {Object} [opts.glow] — AI-generated glow remap
   * @param {string} [opts.fontTitle] — custom font-family for h1
   * @param {string} [opts.fontSubtitle] — custom font-family for .subtitle
   * @param {string} opts.baseCSS — pre-loaded base theme CSS content
   * @param {string} [opts.baseHTML] — pre-loaded base theme HTML template
   */
  constructor({ name, tagline, baseTheme, palette, glow, fontTitle, fontSubtitle }, baseCSS, baseHTML) {
    this.name = name || 'Untitled';
    this.tagline = tagline || '';
    this.baseKey = baseTheme || 'GTA';
    this.baseCSS = baseCSS || '';
    this.baseHTML = baseHTML || '';
    this.palette = palette || {};
    this.glow = glow || {};
    this.fontTitle = fontTitle || '';
    this.fontSubtitle = fontSubtitle || '';
  }

  recolor() {
    let outCSS = this.baseCSS;
    if (this.palette && Object.keys(this.palette).length > 0) {
      // Extract current palette, merge remapped values
      const current = extractPalette(this.baseCSS);
      const mergedHex = { ...current.hexVars, ...this.palette };
      const mergedGlow = { ...current.glowVars, ...(this.glow || {}) };

      // Rebuild the entire :root block with correct RGB tuples
      const newRoot = buildRootBlock(mergedHex, mergedGlow);
      outCSS = this.baseCSS.replace(/:root\s*\{[^}]+\}/s, newRoot);
    }
    
    // Inject font overrides if provided
    if (this.fontTitle || this.fontSubtitle) {
      outCSS += '\n/* --- Generated Font Overrides --- */\n';
      if (this.fontTitle) outCSS += `h1 { font-family: ${this.fontTitle} !important; }\n`;
      if (this.fontSubtitle) outCSS += `.subtitle { font-family: ${this.fontSubtitle} !important; }\n`;
    }
    
    return outCSS;
  }

  async fetchWallpapers(count = 5, keywords) {
    const queries = buildWallpaperQueries(this.name, this.tagline, this.palette, keywords);
    const bestQuery = queries[0];
    const query = queries[queries.length - 1];
    const getCached = (candidate) => {
      const cached = wallpaperCache.get(candidate);
      return cached && Date.now() - cached.ts < 6 * 60 * 60 * 1000
        ? cached.urls.slice(0, count)
        : null;
    };

    // Tier 1: Pexels API
    if (PEXELS_API_KEY) {
      for (const candidate of queries) {
        const cached = getCached(candidate);
        if (cached) return cached;
        try {
          const res = await fetch(
            `https://api.pexels.com/v1/search?query=${encodeURIComponent(candidate)}&per_page=${count}&orientation=landscape&size=large`,
            {
              headers: { Authorization: PEXELS_API_KEY },
              signal: AbortSignal.timeout(8000),
            }
          );
          if (res.ok) {
            const data = await res.json();
            const urls = (data.photos || []).map(p => p.src?.large2x || p.src?.large || p.src?.original);
            if (urls.length > 0) {
              wallpaperCache.set(candidate, { urls, ts: Date.now() });
              return urls;
            }
          }
        } catch (err) {
          console.error('Pexels error:', err.message);
        }
      }
    }

    // Tier 2: Pixabay (free, no key needed for basic search)
    for (const candidate of [...new Set([bestQuery, query])]) {
      const cached = getCached(candidate);
      if (cached) return cached;
      try {
        const pxRes = await fetch(
          `https://pixabay.com/api/?key=25501287-bd54e2b21418e6c82bb6adb5b&q=${encodeURIComponent(candidate)}&per_page=${count}&orientation=horizontal&safesearch=true`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (pxRes.ok) {
          const pxData = await pxRes.json();
          const urls = (pxData.hits || []).map(h => h.largeImageURL || h.webformatURL);
          if (urls.length > 0) {
            wallpaperCache.set(candidate, { urls, ts: Date.now() });
            return urls;
          }
        }
      } catch (err) {
        console.error('Pixabay error:', err.message);
      }
    }

    // Tier 3: Lorem Picsum (free, no key — random by query doesn't exist, use random)
    try {
      const urls = [];
      for (let i = 0; i < count; i++) {
        urls.push(`https://picsum.photos/seed/${query.replace(/\s+/g,'-')}-${i}/1920/1080`);
      }
      return urls;
    } catch (err) {
      console.error('Picsum error:', err.message);
    }

    return [];
  }

  safeName() {
    return this.name.replace(/[^a-zA-Z0-9\s_-]/g, '').trim()
      .replace(/\s+/g, '-').toLowerCase() || 'untitled';
  }

  async generate(keywords) {
    const sn = this.safeName();
    const css = this.recolor();
    const wallpapers = await this.fetchWallpapers(5, keywords);

    // Extract dominant hex color for crypto widget bg
    const hexMatch = css.match(/#[0-9a-fA-F]{6}/);
    const cryptoBg = hexMatch ? hexMatch[0] : '#1a1a2e';

    const html = this.baseHTML
      ? buildHTMLfromTemplate(this.name, this.tagline, css, wallpapers, cryptoBg, this.baseHTML)
      : buildHTML(this.name, this.tagline, css, wallpapers, this.baseKey);

    return {
      name: this.name,
      safeName: sn,
      tagline: this.tagline,
      baseTheme: this.baseKey,
      wallpapers,
      css,
      html,
      createdAt: new Date().toISOString(),
    };
  }
}

// ─── Build HTML from base template ─────────────────────────

function buildHTMLfromTemplate(name, tagline, css, wallpapers, cryptoBg, baseHTML) {
  if (!baseHTML) return buildHTML(name, tagline, css, wallpapers, 'GTA');

  // Inject remapped CSS inline after Shared2Printmon link
  let html = baseHTML.replace(
    '<link rel="stylesheet" href="css/newer/Shared2Printmon.css">',
    '<link rel="stylesheet" href="css/newer/Shared2Printmon.css">\n\t<style>\n' + css + '\n\t</style>'
  );

  // Generate favicon
  const favicon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎨</text></svg>');

  // Template placeholder replacements
  html = html.replace('{{TITLE}}', name);
  html = html.replace('{{ICON}}', favicon);
  html = html.replace('{{TAGLINE}}', tagline || '');
  // Convert hex to 8-digit with 30% alpha for crypto widget transparency
  const alphaHex = cryptoBg + '4D'; // 30% opacity in hex
  html = html.replace('{{CRYPTO_BG}}', alphaHex);

  // Wallpapers — replace each slot
  for (let i = 0; i < 5; i++) {
    const wp = wallpapers[i] || (wallpapers[0] || '');
    html = html.replace("'{{WALLPAPER}}'", wp ? `'${wp}'` : "''");
  }

  return html;
}

// ─── HTML Page Generator ───────────────────────────────────

function buildHTML(name, tagline, css, wallpapers, baseKey) {
  const wallpaperArray = wallpapers.map(w => `'${w}'`).join(',\n\t\t\t');
  
  return `<!DOCTYPE HTML>
<html lang="en">
<head><script async src="https://www.googletagmanager.com/gtag/js?id=G-KQ1RGHNMZG"></script><script>function gtag(){dataLayer.push(arguments)}window.dataLayer=window.dataLayer||[],gtag("js",new Date),gtag("config","G-KQ1RGHNMZG");</script>
\t<title>${name} - Generated Printmon</title>
\t<meta charset="UTF-8">
\t<link rel="icon" type="image/png" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎨</text></svg>">
\t<link rel="stylesheet" href="css/swapbtn.css">
\t<link rel="stylesheet" href="css/newer/Shared2Printmon.css">
\t<style>
${css}
\t</style>
</head>
<body>
\t<div class="dropdown2">
        <button onclick="toggleDropdown()" class="dropbtn2">Swap Themes</button>
        <div id="myDropdown" class="dropdown2-content">
\t\t\t<h2>Printmon 2</h2>
            <a href="gallery.html">🎨 Generated Gallery</a>
            <a href="TheDoshusPrintmon2GTA.html">GTA 6</a>
\t\t\t<a href="TheDoshusPrintmon2Glass.html">Glass</a>
\t\t\t<a href="TheDoshusPrintmon2Halloween.html">Halloween</a>
\t\t\t<a href="TheDoshusPrintmon2Forest.html">Forest</a>
\t\t\t<a href="TheDoshusPrintmon2Witch.html">Witchery</a>
\t\t\t<a href="TheDoshusPrintmon2Kuromi.html">Kuromi</a>
\t\t\t<a href="TheDoshusPrintmon2Spongebob.html">Spongebob</a>
\t\t\t<a href="TheDoshusPrintmon2Strawberry.html">Strawberry Shortcake</a>
        </div>
    </div>
\t<div class="container">
\t\t<div class="left">
\t\t\t<div class="printbox">
\t\t\t\t<h1>Printmon 2</h1>
\t\t\t\t<p class="subtitle">${tagline}</p>
\t\t\t\t<div class="options">
\t\t\t\t\t<label><input id="printafter" type="checkbox" checked> Print after scanning</label>
\t\t\t\t\t<label><input id="jumptoq" type="checkbox"> Jump to quantity</label>
\t\t\t\t\t<label><input id="nowhitespace" type="checkbox" checked> Trim whitespace characters</label>
\t\t\t\t</div>
\t\t\t\t<div class="input-group">
\t\t\t\t\t<label for="barcodedata">Enter Barcode Data <span>(43 Characters Max)</span></label>
\t\t\t\t\t<input id="barcodedata" type="text" maxlength="43">
\t\t\t\t</div>
\t\t\t\t<div class="input-group">
\t\t\t\t\t<label for="displaytext">Enter Display Text</label>
\t\t\t\t\t<input id="displaytext" type="text" maxlength="43">
\t\t\t\t</div>
\t\t\t\t<div class="input-group">
\t\t\t\t\t<label for="quantity">Enter Quantity <span>(500 Max)</span></label>
\t\t\t\t\t<input id="quantity" type="number" min="1" max="500" value="1">
\t\t\t\t</div>
\t\t\t\t<button type="button" class="print-button" onclick="printlabel();">Print</button>
\t\t\t</div>
\t\t\t<div class="MultiBarcode-printer">
\t\t\t\t<h2>Multiple Barcode Printer</h2>
\t\t\t\t<div class="MultiPrinter-content">
\t\t\t\t\t<textarea id="textAreaID" placeholder="Enter barcodes here..."></textarea>
\t\t\t\t\t<button type="button" class="multiButton" onclick="printBulk();">Print Multiple Labels</button>
\t\t\t\t</div>
\t\t\t</div>
\t\t</div>
\t\t<div class="right">
\t\t\t<div class="quick-print-buttons">
\t\t\t\t<button class="buttonsLine1" onclick="printSticker(this.innerHTML);">ATAC</button>
\t\t\t\t<button class="buttonsLine2" onclick="printSticker(this.innerHTML);">DAMAGE</button>
\t\t\t\t<button class="buttonsLine3" onclick="printSticker(this.innerHTML);">RECALL</button>
\t\t\t\t<button class="buttonsLine1" onclick="printSticker(this.innerHTML);">NON-CON</button>
\t\t\t\t<button class="buttonsLine2" onclick="printSticker(this.innerHTML);">1</button>
\t\t\t\t<button class="buttonsLine3" onclick="printSticker(this.innerHTML);">C</button>
\t\t\t</div>
\t\t</div>
\t</div>
\t<script src="js/swap-img.js"></script>
\t<script src="js/PrintmonPrinter.js" async></script>
\t<script>
\t\tconst wallpapers = [
\t\t\t${wallpaperArray}
\t\t];
\t\t(function(){const i=Math.floor(Math.random()*wallpapers.length),u=wallpapers[i];if(u.endsWith('.mp4')||u.endsWith('.webm')){const v=document.createElement('video');v.src=u;v.autoplay=true;v.loop=true;v.muted=true;v.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;object-fit:fill;z-index:-1';document.body.appendChild(v)}else{document.body.style.backgroundImage="url('"+u+"')";document.body.style.backgroundSize='cover';document.body.style.backgroundAttachment='fixed';document.body.style.backgroundPosition='center'}})();
\t</script>
</body>
</html>`;
}

module.exports = {
  PrintmonGenerator, BASE_THEMES, FONT_POOL,
  extractPalette, describePalette, hexToRgb,
  lightenHex, darkenHex, derivePalette, perceivedBrightness,
  remapPalette, buildRootBlock, buildRemapPrompt,
  buildWallpaperQueries, buildHTML,
  wallpaperCache,
};
