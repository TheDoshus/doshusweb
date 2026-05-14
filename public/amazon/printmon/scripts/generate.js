#!/usr/bin/env node
/**
 * generate.js — Printmon Theme Generator CLI
 * 
 * Usage:
 *   node generate.js '{"name":"Neon Drift","tagline":"ride the waveform","primary":"#ff00ff","accent":"#00ffff"}'
 *   node generate.js --file theme.json
 *   node generate.js --demo          (generates 3 demo themes)
 * 
 * Output:
 *   - css/generated/<safeName>.css
 *   - Updates generated/manifest.json
 *   - Prints result JSON to stdout
 */

const fs = require('fs');
const path = require('path');

// Read .env for API keys
const envPath = path.join(process.env.HOME, '.openclaw', 'workspace', 'zephyy', '.env');
try {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  });
} catch {
  console.error('Warning: .env not loaded');
}

const { PrintmonGenerator } = require('../js/PrintmonGenerator.js');

const ROOT = __dirname;
const CSS_DIR = path.join(ROOT, '..', 'css', 'generated');
const GEN_DIR = path.join(ROOT, '..', 'generated');
const MANIFEST_PATH = path.join(GEN_DIR, 'manifest.json');
const PREVIEW_PATH = path.join(GEN_DIR, 'preview.html');

// Ensure dirs
[CSS_DIR, GEN_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

// ─── Maintenance Constants ──────────────────────────────────
const MAX_THEMES = 100;
const DEDUP_THRESHOLD = 0.15; // 15% palette similarity → dedup

// ─── Helpers ────────────────────────────────────────────────
function safeName(name) {
  return name
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase() || 'untitled';
}

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

// ─── Deduplication ──────────────────────────────────────────
function hexDistance(a, b) {
  const ar = parseInt(a.replace('#',''), 16);
  const br = parseInt(b.replace('#',''), 16);
  const dr = ((ar >> 16) & 0xff) - ((br >> 16) & 0xff);
  const dg = ((ar >> 8) & 0xff) - ((br >> 8) & 0xff);
  const db = (ar & 0xff) - (br & 0xff);
  return Math.sqrt(dr * dr + dg * dg + db * db) / 441.67; // normalized 0–1
}

function findSimilarTheme(gen, manifest) {
  for (const t of manifest) {
    const d1 = hexDistance(gen.primary, t.primary);
    const d2 = hexDistance(gen.accent, t.accent);
    if (d1 < DEDUP_THRESHOLD && d2 < DEDUP_THRESHOLD) return t;
  }
  return null;
}

// ─── Manifest Cap & Cleanup ─────────────────────────────────
function trimManifest(manifest) {
  if (manifest.length <= MAX_THEMES) return manifest;
  // Keep newest 100, evict oldest CSS files
  const kept = manifest.slice(0, MAX_THEMES);
  const evicted = manifest.slice(MAX_THEMES);
  for (const t of evicted) {
    const cssPath = path.join(ROOT, '..', t.cssFile);
    try { fs.unlinkSync(cssPath); } catch { /* already gone */ }
  }
  console.log(`  🧹 Trimmed ${evicted.length} old themes (cap: ${MAX_THEMES})`);
  return kept;
}

// ─── Generate Theme ─────────────────────────────────────────
async function generate(themeInput) {
  const gen = new PrintmonGenerator(themeInput);
  const sn = safeName(gen.name);

  // Load manifest early for dedup + cap checks
  const manifest = loadManifest();

  // Deduplication: check if palette already exists
  const similar = findSimilarTheme(gen, manifest);
  if (similar) {
    const msg = `  ⚠️  Palette too similar to existing theme "${similar.name}" (primary: ${similar.primary}, accent: ${similar.accent}). Skipping generation.`;
    console.log(msg);
    return { ...similar, deduplicated: true, warning: 'Palette too similar to existing theme' };
  }

  // Generate CSS
  const css = gen.generateCSS(sn);
  const cssPath = path.join(CSS_DIR, `${sn}.css`);
  fs.writeFileSync(cssPath, css);

  // Fetch wallpapers
  let wallpapers = [];
  try {
    wallpapers = await gen.fetchWallpapers(5);
  } catch (e) {
    console.error('Wallpaper fetch failed:', e.message);
  }

  // Build theme record
  const record = {
    name: gen.name,
    safeName: sn,
    tagline: gen.tagline,
    primary: gen.primary,
    accent: gen.accent,
    glowColor: gen.glowColor,
    bgDark: gen.bgDark,
    fontTitle: gen.fontTitle,
    fontSubtitle: gen.fontSubtitle,
    feature: gen.feature,
    wallpapers,
    cssFile: `css/generated/${sn}.css`,
    createdAt: new Date().toISOString(),
  };

  // Update manifest (already loaded above for dedup)
  const idx = manifest.findIndex((t) => t.safeName === sn);
  if (idx >= 0) manifest[idx] = record;
  else manifest.unshift(record);

  // Trim to cap
  const trimmed = trimManifest(manifest);
  saveManifest(trimmed);

  // Generate/update preview page (use trimmed manifest)
  generatePreviewPage(trimmed);

  return record;
}

// ─── Preview Page Generator ─────────────────────────────────
function generatePreviewPage(manifest) {
  // Generate the preview page that loads any theme by query param
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Printmon Preview</title>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-KQ1RGHNMZG"></script><script>function gtag(){dataLayer.push(arguments)}window.dataLayer=window.dataLayer||[],gtag("js",new Date),gtag("config","G-KQ1RGHNMZG");</script>
  <link rel="stylesheet" href="../css/swapbtn.css">
  <link rel="stylesheet" href="../css/newer/Shared2Printmon.css">
  <link rel="stylesheet" id="themeCSS" href="">
  <style id="wallpaperJS"></style>
</head>
<body>
  <div class="dropdown2">
    <button onclick="toggleDropdown()" class="dropbtn2">Swap Themes</button>
    <div id="myDropdown" class="dropdown2-content">
      <h2>Generated Themes</h2>
      ${manifest
        .map((t) => `<a href="preview.html?theme=${t.safeName}">${t.name}</a>`)
        .join('\n')}
      <h2>Printmon 2</h2>
      <a href="../Printmon2Doshus.html">RANDOM 🎲</a>
      <a href="../TheDoshusPrintmon2Halloween.html">Halloween</a>
      <a href="../TheDoshusPrintmon2Forest.html">Forest</a>
      <a href="../TheDoshusPrintmon2GTA.html">GTA 6</a>
      <a href="../TheDoshusPrintmon2Kuromi.html">Kuromi</a>
      <a href="../TheDoshusPrintmon2Spongebob.html">Spongebob</a>
      <a href="../TheDoshusPrintmon2Strawberry.html">Strawberry Shortcake</a>
      <a href="../TheDoshusPrintmon2Witch.html">Witchery</a>
      <a href="../gallery.html">← Back to Gallery</a>
    </div>
  </div>
  <div class="container">
    <div class="left">
      <div class="printbox">
        <h1>Printmon 2</h1>
        <p class="subtitle" id="subtitleTag">A generated theme</p>
        <div class="options">
          <label><input id="printafter" type="checkbox" checked> Print after scanning</label>
          <label><input id="jumptoq" type="checkbox"> Jump to quantity</label>
          <label><input id="nowhitespace" type="checkbox" checked> Trim whitespace characters</label>
        </div>
        <div class="input-group">
          <label for="barcodedata">Enter Barcode Data <span>(43 Characters Max)</span></label>
          <input id="barcodedata" type="text" maxlength="43">
        </div>
        <div class="input-group">
          <label for="displaytext">Enter Display Text</label>
          <input id="displaytext" type="text" maxlength="43">
        </div>
        <div class="input-group">
          <label for="quantity">Enter Quantity <span>(500 Max)</span></label>
          <input id="quantity" type="number" min="1" max="500" value="1">
        </div>
        <button type="button" class="print-button" onclick="alert('Preview mode — printing disabled')">Preview</button>
      </div>
      <div class="MultiBarcode-printer">
        <h2>Multiple Barcode Printer</h2>
        <div class="MultiPrinter-content">
          <textarea id="textAreaID" placeholder="Preview mode — enter test barcodes..."></textarea>
          <button type="button" class="multiButton" onclick="alert('Preview mode')">Preview Print</button>
        </div>
      </div>
    </div>
    <div class="right">
      <div class="quick-print-buttons">
        <button class="buttonsLine1" onclick="alert('Preview')">ATAC</button>
        <button class="buttonsLine2" onclick="alert('Preview')">DAMAGE</button>
        <button class="buttonsLine3" onclick="alert('Preview')">RECALL</button>
        <button class="buttonsLine1" onclick="alert('Preview')">NON-CON</button>
        <button class="buttonsLine2" onclick="alert('Preview')">1</button>
        <button class="buttonsLine3" onclick="alert('Preview')">C</button>
      </div>
    </div>
  </div>
  <script src="../js/swap-img.js"></script>
  <script>
    // Load theme CSS based on URL query param
    const params = new URLSearchParams(window.location.search);
    const themeName = params.get('theme');
    if (themeName) {
      const cssLink = document.getElementById('themeCSS');
      cssLink.href = '../css/generated/' + themeName + '.css';

      // Load manifest to set tagline
      fetch('manifest.json')
        .then(r => r.json())
        .then(manifest => {
          const theme = manifest.find(t => t.safeName === themeName);
          if (theme) {
            document.getElementById('subtitleTag').textContent = theme.tagline;
            document.title = theme.name + ' — Printmon Preview';

            // Set wallpaper from theme's wallpaper array
            if (theme.wallpapers && theme.wallpapers.length > 0) {
              const wall = theme.wallpapers[Math.floor(Math.random() * theme.wallpapers.length)];
              document.body.style.backgroundImage = "url('" + wall + "')";
              document.body.style.backgroundSize = 'cover';
              document.body.style.backgroundAttachment = 'fixed';
              document.body.style.backgroundPosition = 'center';
            }
          }
        })
        .catch(() => {});
    }
  </script>
</body>
</html>`;

  fs.writeFileSync(PREVIEW_PATH, html);
}

// ─── Demo Themes ────────────────────────────────────────────
const DEMO_THEMES = [
  {
    name: 'Neon Drift',
    tagline: 'ride the waveform',
    primary: '#ff00ff',
    accent: '#00ffff',
    feature: 'cursor-trail',
  },
  {
    name: 'Void Walker',
    tagline: 'embrace the abyss',
    primary: '#6366f1',
    accent: '#a855f7',
    bgDark: '#0a0a1a',
    feature: 'starfield-bg',
  },
  {
    name: 'Solar Blaze',
    tagline: 'born from the flame',
    primary: '#f97316',
    accent: '#fbbf24',
    bgDark: '#1a0a00',
    fontTitle: 'Impact',
    feature: 'ember-particles',
  },
  {
    name: 'Forest Warden',
    tagline: 'roots run deep',
    primary: '#22c55e',
    accent: '#86efac',
    bgDark: '#0a1a0a',
    feature: 'leaf-fall',
  },
  {
    name: 'Ice Queen',
    tagline: 'frozen in time',
    primary: '#06b6d4',
    accent: '#67e8f9',
    bgDark: '#0a1628',
    fontSubtitle: 'Georgia',
    feature: 'frost-shimmer',
  },
];

// ─── Main ───────────────────────────────────────────────────
async function main() {
  const arg = process.argv[2];

  if (arg === '--demo') {
    console.log('Generating', DEMO_THEMES.length, 'demo themes...\n');
    const results = [];
    for (const theme of DEMO_THEMES) {
      const record = await generate(theme);
      results.push(record);
      console.log('  ✅', record.name, `(${record.wallpapers.length} wallpapers)`);
    }
    console.log('\n✨ Done. Gallery:', path.relative(ROOT, path.join(GEN_DIR, '..', 'gallery.html')));
    console.log(JSON.stringify({ generated: results.length }, null, 2));
    return;
  }

  if (arg === '--file') {
    const filePath = process.argv[3];
    if (!filePath) {
      console.error('Usage: generate.js --file <path.json>');
      process.exit(1);
    }
    const theme = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const record = await generate(theme);
    console.log(JSON.stringify(record, null, 2));
    return;
  }

  if (arg) {
    try {
      const theme = JSON.parse(arg);
      const record = await generate(theme);
      console.log(JSON.stringify(record, null, 2));
    } catch {
      console.error('Invalid JSON. Usage: generate.js \'{"name":"...","tagline":"...","primary":"#...","accent":"#..."}\'');
      process.exit(1);
    }
    return;
  }

  // No args: show usage
  console.log('Printmon Theme Generator');
  console.log('');
  console.log('Usage:');
  console.log('  node generate.js \'{"name":"Neon Drift","tagline":"ride","primary":"#ff00ff","accent":"#00ffff"}\'');
  console.log('  node generate.js --file theme.json');
  console.log('  node generate.js --demo');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
