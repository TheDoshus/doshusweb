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
const envPath = path.join(process.env.HOME, '.openclaw', 'workspace', '.env');
try {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  });
} catch {
  console.error('Warning: .env not loaded');
}

const { PrintmonGenerator, BASE_THEMES, FONT_POOL, derivePalette } = require('../js/PrintmonGenerator.js');

const ROOT = __dirname;
const CSS_DIR = path.join(ROOT, '..', 'css', 'generated');
const GEN_DIR = path.join(ROOT, '..', 'generated');
const MANIFEST_PATH = path.join(GEN_DIR, 'manifest.json');

// Ensure dirs
[CSS_DIR, GEN_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

// ─── Maintenance Constants ──────────────────────────────────
const MAX_THEMES = 100;
const DEDUP_THRESHOLD = 0.15; // 15% palette similarity → dedup (only when names overlap)
const NEAR_IDENTICAL_THRESHOLD = 0.05; // below this, dedup regardless of name

// ─── Helpers ────────────────────────────────────────────────
function safeName(name) {
  return name
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase() || 'untitled';
}

function uniqueSafeName(base, manifest) {
  const taken = new Set((manifest || []).map((theme) => theme && theme.safeName).filter(Boolean));
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function hueToFamily(hex) {
  const clean = (hex || '#000000').replace('#', '');
  if (clean.length < 6) return 'monochrome';
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 0.08) return max > 0.72 ? 'frost' : 'monochrome';
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  if (hue < 20) return 'ember';
  if (hue < 45) return 'amber';
  if (hue < 75) return 'gold';
  if (hue < 150) return 'verdant';
  if (hue < 195) return 'aqua';
  if (hue < 250) return 'cobalt';
  if (hue < 315) return 'violet';
  return 'rose';
}

function familyToMood(family) {
  const map = {
    monochrome: 'tech',
    frost: 'elegant',
    ember: 'spooky',
    amber: 'bold',
    gold: 'classic',
    verdant: 'playful',
    aqua: 'tech',
    cobalt: 'bold',
    violet: 'elegant',
    rose: 'playful'
  };
  return map[family] || 'classic';
}

function buildThemeTags(record) {
  const tags = [
    'generated',
    record.baseTheme || 'GTA',
    hueToFamily(record.palette?.['--pm-hue1']),
    hueToFamily(record.palette?.['--pm-hue3']),
  ];
  return Array.from(new Set(tags.filter(Boolean).map((tag) => String(tag).trim().toLowerCase())));
}

function buildThemeSwatches(record) {
  const palette = record.palette || {};
  return [
    palette['--pm-hue1'],
    palette['--pm-hue2'],
    palette['--pm-hue3'],
    palette['--pm-surface'],
  ].filter(Boolean).slice(0, 4);
}

function slimThemeRecord(record) {
  if (!record || !record.safeName) return null;
  return {
    name: record.name,
    safeName: record.safeName,
    tagline: record.tagline || '',
    fontTitle: record.fontTitle || '',
    fontSubtitle: record.fontSubtitle || '',
    palette: record.palette || {},
    glow: record.glow || {},
    baseTheme: record.baseTheme || 'GTA',
    wallpapers: Array.isArray(record.wallpapers) ? record.wallpapers : [],
    cssFile: record.cssFile || '',
    createdAt: record.createdAt || new Date().toISOString(),
    tags: Array.isArray(record.tags) ? record.tags : buildThemeTags(record),
    swatches: Array.isArray(record.swatches) ? record.swatches : buildThemeSwatches(record),
    wallpaperCount: Number.isFinite(record.wallpaperCount)
      ? record.wallpaperCount
      : (Array.isArray(record.wallpapers) ? record.wallpapers.length : 0),
    deduplicated: Boolean(record.deduplicated),
    status: record.status || 'ok',
  };
}

function loadManifest() {
  try {
    const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    return Array.isArray(parsed)
      ? parsed.map(slimThemeRecord).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function saveManifest(manifest) {
  const slim = (manifest || []).map(slimThemeRecord).filter(Boolean);
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(slim, null, 2));
}

// ─── Deduplication ──────────────────────────────────────────
function hexDistance(a, b) {
  const ar = parseInt((a || '#000000').replace('#',''), 16);
  const br = parseInt((b || '#000000').replace('#',''), 16);
  const dr = ((ar >> 16) & 0xff) - ((br >> 16) & 0xff);
  const dg = ((ar >> 8) & 0xff) - ((br >> 8) & 0xff);
  const db = (ar & 0xff) - (br & 0xff);
  return Math.sqrt(dr * dr + dg * dg + db * db) / 441.67; // normalized 0–1
}

function paletteSimilarity(a, b) {
  const d1 = hexDistance(a['--pm-hue1'], b['--pm-hue1']);
  const d2 = hexDistance(a['--pm-hue3'], b['--pm-hue3']);
  return Math.max(d1, d2);
}

function nameTokens(name) {
  return new Set(
    String(name || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2)
  );
}

function namesOverlap(a, b) {
  const tb = nameTokens(b);
  for (const w of nameTokens(a)) if (tb.has(w)) return true;
  return false;
}

function findSimilarTheme(palette, manifest, name) {
  for (const t of manifest) {
    if (!t.palette) continue;
    const sim = paletteSimilarity(palette, t.palette);
    if (sim >= DEDUP_THRESHOLD) continue;
    // Different-named themes only dedup when palettes are nearly identical —
    // "Berry Rush" must not collide with "Cherry Blossom Drift" over shared pinks.
    if (sim < NEAR_IDENTICAL_THRESHOLD || namesOverlap(name, t.name)) return t;
  }
  return null;
}

// ─── Manifest Cap & Cleanup ─────────────────────────────────
function trimManifest(manifest) {
  const deduped = [];
  const seen = new Set();
  for (const theme of manifest) {
    if (!theme || !theme.safeName || seen.has(theme.safeName)) continue;
    seen.add(theme.safeName);
    deduped.push(theme);
  }
  if (deduped.length <= MAX_THEMES) return deduped;
  // Keep newest 100, evict oldest CSS files
  const kept = deduped.slice(0, MAX_THEMES);
  const evicted = deduped.slice(MAX_THEMES);
  for (const t of evicted) {
    const cssPath = path.join(ROOT, '..', t.cssFile);
    try { fs.unlinkSync(cssPath); } catch { /* already gone */ }
  }
  console.error(`Trimmed ${evicted.length} old themes (cap: ${MAX_THEMES})`);
  return kept;
}

// ─── Pre-load base CSS/HTML ──────────────────────────────
const BASE_CSS = {};
const BASE_HTML = {};
for (const [key, theme] of Object.entries(BASE_THEMES)) {
  try {
    const cssPath = path.join(ROOT, '..', theme.cssFile);
    BASE_CSS[key] = fs.readFileSync(cssPath, 'utf-8');
  } catch { /* skip */ }
  try {
    const htmlPath = path.join(ROOT, '..', theme.htmlFile);
    BASE_HTML[key] = fs.readFileSync(htmlPath, 'utf-8');
  } catch { /* skip */ }
}

// ─── Generate Theme ─────────────────────────────────────────
async function generate(themeInput) {
  // Support both old format ({primary, accent, ...}) and new format ({palette, glow})
  let palette, glow;
  if (themeInput.palette) {
    palette = themeInput.palette;
    glow = themeInput.glow || {};
  } else {
    // Old format: derive full palette from primary + accent
    const derived = derivePalette(themeInput.primary, themeInput.accent, themeInput.bgDark);
    palette = derived.palette;
    glow = derived.glow;
  }

  const baseKey = themeInput.baseTheme || 'GTA';
  
  let { fontTitle, fontSubtitle } = themeInput;
  // Auto-pick fonts only for default-base generations (orb path — variety
  // wanted). An explicit baseTheme keeps that base's signature fonts unless
  // fonts were explicitly requested too.
  if ((!fontTitle || !fontSubtitle) && !themeInput.baseTheme) {
    const family = hueToFamily(palette['--pm-hue1'] || '#000000');
    const mood = familyToMood(family);
    const pool = FONT_POOL[mood] || FONT_POOL.classic;
    // deterministic pick based on name length so same theme gets same fonts
    const i1 = (themeInput.name || 'a').length % pool.length;
    const i2 = ((themeInput.name || 'a').length + 1) % pool.length;
    if (!fontTitle) fontTitle = pool[i1];
    if (!fontSubtitle) fontSubtitle = pool[i2];
  }

  const gen = new PrintmonGenerator({
    name: themeInput.name || 'Untitled',
    tagline: themeInput.tagline || '',
    baseTheme: baseKey,
    palette,
    glow,
    fontTitle,
    fontSubtitle,
  }, BASE_CSS[baseKey] || '', BASE_HTML[baseKey] || '');

  // Load manifest early for dedup + cap checks
  const manifest = loadManifest();
  const sn = uniqueSafeName(safeName(gen.name), manifest);

  // Deduplication: compare palette tokens (skippable via force flag)
  const similar = themeInput.force ? null : findSimilarTheme(palette, manifest, gen.name);
  if (similar) {
    return {
      ...similar,
      deduplicated: true,
      generated: false,
      requestedName: gen.name,
      warning: 'Palette too similar to existing theme',
      status: 'deduplicated',
    };
  }

  // Generate complete theme (CSS + HTML + wallpapers)
  const keywords = `${gen.name} ${gen.tagline}`;
  let result;
  try {
    result = await gen.generate(keywords);
  } catch (e) {
    // Fallback: ship a CSS-only theme instead of hard failing the orb request.
    const css = gen.recolor();
    const cssPath = path.join(CSS_DIR, `${sn}.css`);
    fs.writeFileSync(cssPath, css);
    const fallbackRecord = {
      name: gen.name,
      safeName: sn,
      tagline: gen.tagline,
      palette,
      glow,
      baseTheme: baseKey,
      wallpapers: [],
      html: buildHTMLfromTemplate(gen.name, gen.tagline, css, [], '#1a1a2e', BASE_HTML[baseKey] || ''),
      css,
      cssFile: `css/generated/${sn}.css`,
      fontTitle,
      fontSubtitle,
      createdAt: new Date().toISOString(),
      status: 'partial',
      error: e.message,
    };
    fallbackRecord.swatches = buildThemeSwatches(fallbackRecord);
    fallbackRecord.tags = buildThemeTags(fallbackRecord);
    fallbackRecord.wallpaperCount = 0;
    const idx = manifest.findIndex((t) => t.safeName === sn);
    if (idx >= 0) manifest[idx] = fallbackRecord;
    else manifest.unshift(fallbackRecord);
    saveManifest(trimManifest(manifest));
    return fallbackRecord;
  }

  // Write CSS to file
  const cssPath = path.join(CSS_DIR, `${sn}.css`);
  fs.writeFileSync(cssPath, result.css);

  // Build theme record from generator result
  const record = {
    name: result.name,
    safeName: sn,
    tagline: result.tagline,
    palette,
    glow,
    baseTheme: result.baseTheme || baseKey,
    wallpapers: result.wallpapers || [],
    html: result.html || '',
    css: result.css,
    cssFile: `css/generated/${sn}.css`,
    fontTitle,
    fontSubtitle,
    createdAt: result.createdAt || new Date().toISOString(),
    status: 'ok',
  };
  record.swatches = buildThemeSwatches(record);
  record.tags = buildThemeTags(record);
  record.wallpaperCount = record.wallpapers.length;

  // Update manifest
  const idx = manifest.findIndex((t) => t.safeName === record.safeName);
  if (idx >= 0) manifest[idx] = record;
  else manifest.unshift(record);

  // Trim to cap
  const trimmed = trimManifest(manifest);
  saveManifest(trimmed);

  return record;
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
    // Regenerate preview page from final manifest (RTDB + local modes)
    generatePreviewPage(loadManifest());
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
