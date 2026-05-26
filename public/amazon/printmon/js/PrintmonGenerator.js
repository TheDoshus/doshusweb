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
    cssFile: 'css/newer/_template.css',
    htmlFile: 'template.html',
    description: 'Custom generated theme — GTA base',
  },
  Glass: {
    name: 'Glass',
    cssFile: 'css/newer/_template.css',
    htmlFile: 'template.html',
    description: 'Custom generated theme — Glass base',
  },
  Halloween: {
    name: 'Halloween',
    cssFile: 'css/newer/_template.css',
    htmlFile: 'template.html',
    description: 'Custom generated theme — Halloween base',
  },
  Forest: {
    name: 'Forest',
    cssFile: 'css/newer/_template.css',
    htmlFile: 'template.html',
    description: 'Custom generated theme — Forest base',
  },
  Witch: {
    name: 'Witchery',
    cssFile: 'css/newer/_template.css',
    htmlFile: 'template.html',
    description: 'Custom generated theme — Witch base',
  },
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
 * Auto-derive a full 14-token palette from 3 seed colors.
 * @param {string} primary - main brand color (hex)
 * @param {string} accent - cool accent (hex)
 * @param {string} [surface] - dark surface (hex, default derived from primary)
 * @returns {{ palette: Object, glow: Object }}
 */
function derivePalette(primary, accent, surface) {
  let p = primary || '#9F31C7';
  const a = accent || '#00C1FF';
  const s = surface || darkenHex(p, 0.92);

  // Guard: if the AI picks a near-black primary for "dark theme" requests,
  // the title text renders invisible on the dark surface. Boost luminance
  // to at least #444 (~0.05) so text is readable at 0.76 alpha.
  const MIN_PRIMARY_LUM = 0.05;
  const pLum = perceivedBrightness(p);
  if (pLum < MIN_PRIMARY_LUM) {
    const boost = Math.min(0.75, (MIN_PRIMARY_LUM - pLum) * 12);
    p = lightenHex(p, boost);
  }

  // Generate a warm complementary accent from the primary
  const warm = lightenHex(darkenHex(p, 0.3), 0.2);

  return {
    palette: {
      '--pm-hue1': p,
      '--pm-hue1-deep': darkenHex(p, 0.5),
      '--pm-hue1-bright': lightenHex(p, 0.35),
      '--pm-hue2': warm,
      '--pm-hue2-bright': lightenHex(warm, 0.25),
      '--pm-hue2-deep': darkenHex(warm, 0.35),
      '--pm-hue3': a,
      '--pm-hue3-light': lightenHex(a, 0.4),
      '--pm-surface': s,
      '--pm-surface-alt': darkenHex(s, 0.15),
      '--pm-light': lightenHex(p, 0.65),
      '--pm-neutral': '#e3e3e3',
      '--pm-text': '#ffffff',
      '--pm-text-dark': '#000000',
    },
    glow: {
      '--pm-glow-warm': hexToRgb(warm),
      '--pm-glow-cool': hexToRgb(lightenHex(a, 0.3)),
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

class PrintmonGenerator {
  /**
   * @param {Object} opts
   * @param {string} opts.name
   * @param {string} opts.tagline
   * @param {string} [opts.baseTheme] — 'GTA', 'Glass', 'Halloween', 'Forest', 'Witch'
   * @param {Object} [opts.palette] — AI-generated palette remap
   * @param {Object} [opts.glow] — AI-generated glow remap
   * @param {string} opts.baseCSS — pre-loaded base theme CSS content
   * @param {string} [opts.baseHTML] — pre-loaded base theme HTML template
   */
  constructor({ name, tagline, baseTheme, palette, glow }, baseCSS, baseHTML) {
    this.name = name || 'Untitled';
    this.tagline = tagline || '';
    this.baseKey = baseTheme || 'GTA';
    this.baseCSS = baseCSS || '';
    this.baseHTML = baseHTML || '';
    this.palette = palette || {};
    this.glow = glow || {};
  }

  recolor() {
    if (!this.palette || Object.keys(this.palette).length === 0) return this.baseCSS;

    // Extract current palette, merge remapped values
    const current = extractPalette(this.baseCSS);
    const mergedHex = { ...current.hexVars, ...this.palette };
    const mergedGlow = { ...current.glowVars, ...(this.glow || {}) };

    // Rebuild the entire :root block with correct RGB tuples
    const newRoot = buildRootBlock(mergedHex, mergedGlow);
    return this.baseCSS.replace(/:root\s*\{[^}]+\}/s, newRoot);
  }

  async fetchWallpapers(count = 5, keywords) {
    const searchTerms = keywords
      ? keywords.replace(/\b(make|create|generate|design|build|me|a|an|theme|printmon|skin)\b/gi, '').replace(/\s+/g, ' ').trim()
      : this.name.replace(/\b(theme|printmon|skin)\b/gi, '').trim();
    const query = searchTerms || this.name;
    const cached = wallpaperCache.get(query);
    if (cached && Date.now() - cached.ts < 6 * 60 * 60 * 1000) {
      return cached.urls.slice(0, count);
    }

    // Tier 1: Pexels API
    if (PEXELS_API_KEY) {
      try {
        const res = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape&size=large`,
          {
            headers: { Authorization: PEXELS_API_KEY },
            signal: AbortSignal.timeout(8000),
          }
        );
        if (res.ok) {
          const data = await res.json();
          const urls = (data.photos || []).map(p => p.src?.large2x || p.src?.large || p.src?.original);
          if (urls.length > 0) {
            wallpaperCache.set(query, { urls, ts: Date.now() });
            return urls;
          }
        }
      } catch (err) {
        console.error('Pexels error:', err.message);
      }
    }

    // Tier 2: Pixabay (free, no key needed for basic search)
    try {
      const pxRes = await fetch(
        `https://pixabay.com/api/?key=25501287-bd54e2b21418e6c82bb6adb5b&q=${encodeURIComponent(query)}&per_page=${count}&orientation=horizontal&safesearch=true`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (pxRes.ok) {
        const pxData = await pxRes.json();
        const urls = (pxData.hits || []).map(h => h.largeImageURL || h.webformatURL);
        if (urls.length > 0) {
          wallpaperCache.set(query, { urls, ts: Date.now() });
          return urls;
        }
      }
    } catch (err) {
      console.error('Pixabay error:', err.message);
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
  PrintmonGenerator, BASE_THEMES,
  extractPalette, describePalette, hexToRgb,
  lightenHex, darkenHex, derivePalette, perceivedBrightness,
  remapPalette, buildRootBlock, buildRemapPrompt,
  buildHTML,
  wallpaperCache,
};
