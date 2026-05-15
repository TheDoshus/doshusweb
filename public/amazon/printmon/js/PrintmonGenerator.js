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
  // Sort longest first to prevent partial matches (#222 matching inside #222222)
  const entries = Object.entries(colorMap).sort((a,b) => b[0].length - a[0].length);
  for (const [original, replacement] of entries) {
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

  async fetchWallpapers(count = 5, altQuery) {
    const query = altQuery || `${this.name} background`;
    const clean = query.replace(/\b(theme|printmon|skin|make|create|generate|design|build|me|a|an)\b/gi, '').replace(/\s+/g, ' ').trim() || this.name;
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

  async generate(altQuery) {
    const sn = this.safeName();
    const css = this.recolor();
    const wallpapers = await this.fetchWallpapers(5, altQuery);

    return {
      name: this.name,
      safeName: sn,
      tagline: this.tagline,
      baseTheme: this.baseKey,
      wallpapers,
      css,
      html: buildHTML(this.name, this.tagline, css, wallpapers, this.baseKey),
      createdAt: new Date().toISOString(),
    };
  }
}

// ─── HTML Page Generator ────────────────────────────────────

function buildHTML(name, tagline, css, wallpapers, baseKey) {
  const wallpaperArray = wallpapers.map(w => `'${w}'`).join(',\n\t\t\t');
  // Absolute base URL so blob/srcdoc can resolve CSS/JS
  const BASE = 'https://doshus.net/amazon/printmon';
  
  return `<!DOCTYPE HTML>
<html lang="en">
<head><script async src="https://www.googletagmanager.com/gtag/js?id=G-KQ1RGHNMZG"></script><script>function gtag(){dataLayer.push(arguments)}window.dataLayer=window.dataLayer||[],gtag("js",new Date),gtag("config","G-KQ1RGHNMZG");</script>
\t<title>${name} - Printmon Theme</title>
\t<meta charset="UTF-8">
\t<meta name="viewport" content="width=device-width, initial-scale=1.0">
\t<link rel="stylesheet" href="${BASE}/css/swapbtn.css">
\t<link rel="stylesheet" href="${BASE}/css/newer/Shared2Printmon.css">
\t<style>
${css}
\t</style>
</head>
<body>
\t<div class="dropdown2">
        <button onclick="toggleDropdown()" class="dropbtn2">Swap Themes</button>
        <div id="myDropdown" class="dropdown2-content">
\t\t\t<h2>Printmon 2</h2>
            <a href="${BASE}/gallery.html">🎨 Theme Gallery</a>
            <a href="${BASE}/TheDoshusPrintmon2GTA.html">GTA 6</a>
\t\t\t<a href="${BASE}/TheDoshusPrintmon2Glass.html">Glass</a>
\t\t\t<a href="${BASE}/TheDoshusPrintmon2Halloween.html">Halloween</a>
\t\t\t<a href="${BASE}/TheDoshusPrintmon2Forest.html">Forest</a>
\t\t\t<a href="${BASE}/TheDoshusPrintmon2Witch.html">Witchery</a>
\t\t\t<a href="${BASE}/TheDoshusPrintmon2Kuromi.html">Kuromi</a>
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
\t<script src="${BASE}/js/swap-img.js"></script>
\t<script src="${BASE}/js/PrintmonPrinter.js" async></script>
\t<script>
\t\tconst wallpapers = [
\t\t\t${wallpaperArray}
\t\t];
\t\t(function(){const i=Math.floor(Math.random()*wallpapers.length),u=wallpapers[i];if(u.endsWith('.mp4')||u.endsWith('.webm')){const v=document.createElement('video');v.src=u;v.autoplay=true;v.loop=true;v.muted=true;v.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;object-fit:fill;z-index:-1';document.body.appendChild(v)}else{document.body.style.backgroundImage="url('"+u+"')";document.body.style.backgroundSize='cover';document.body.style.backgroundAttachment='fixed';document.body.style.backgroundPosition='center'}})();
\t</script>
</body>
</html>`;
}

// ─── Safe Name ────────────────────────────────────────────

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9\s_-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'untitled';
}

module.exports = {
  PrintmonGenerator, BASE_THEMES,
  extractColors, remapColors, buildRemapPrompt, buildHTML,
  wallpaperCache,
};
