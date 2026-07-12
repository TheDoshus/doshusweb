/**
 * PrintmonGallery.js
 *
 * Public gallery for generated Printmon themes.
 * Reads merged theme records from Firebase RTDB and renders a richer card grid
 * with search, tag filters, swatches, and modal previews.
 */

(function () {
  'use strict';

  const RTDB_BASE = 'https://doshusweb-default-rtdb.firebaseio.com';
  const themesUrl = RTDB_BASE + '/printmon/themes.json';

  let themes = [];
  let activeTag = 'all';
  let sortMode = 'newest';

  const FAMILY_LABELS = {
    ember: 'Ember',
    amber: 'Amber',
    gold: 'Solar',
    verdant: 'Forest',
    aqua: 'Aqua',
    cobalt: 'Cobalt',
    violet: 'Violet',
    rose: 'Rose',
    frost: 'Frost',
    monochrome: 'Shadow',
  };

  const FAMILY_CARD_VOICES = {
    ember: { primary: 'Ember lead', accent: 'Ember spark' },
    amber: { primary: 'Amber heat', accent: 'Amber spark' },
    gold: { primary: 'Solar pulse', accent: 'Solar edge' },
    verdant: { primary: 'Forest pulse', accent: 'Verdant edge' },
    aqua: { primary: 'Aqua drift', accent: 'Aqua flare' },
    cobalt: { primary: 'Cobalt current', accent: 'Cobalt edge' },
    violet: { primary: 'Violet haze', accent: 'Violet edge' },
    rose: { primary: 'Rose pulse', accent: 'Rose glow' },
    frost: { primary: 'Frost bloom', accent: 'Frost edge' },
    monochrome: { primary: 'Shadow tone', accent: 'Shadow edge' },
  };

  const grid = document.getElementById('themeGrid');
  const searchInput = document.getElementById('gallerySearch');
  const sortSelect = document.getElementById('gallerySort');
  const countEl = document.getElementById('themeCount');
  const loadingEl = document.getElementById('loading');
  const filterBar = document.getElementById('filterBar');
  const statsEl = document.getElementById('themeStats');

  const modal = document.getElementById('previewModal');
  const modalClose = document.getElementById('modalClose');
  const previewFrame = document.getElementById('previewFrame');
  const previewName = document.getElementById('previewName');
  const previewTagline = document.getElementById('previewTagline');
  const previewMeta = document.getElementById('previewMeta');
  const previewLink = document.getElementById('previewLink');
  const copyThemeLink = document.getElementById('copyThemeLink');
  const viewSourceBtn = document.getElementById('viewSourceBtn');
  let activeThemeSafeName = '';
  let copyResetTimer = null;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function titleCase(tag) {
    return String(tag || '')
      .split(/[\s-]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  function familyLabel(family) {
    return FAMILY_LABELS[family] || titleCase(family || 'signal');
  }

  function familyCardLabel(family, role) {
    const familyVoice = FAMILY_CARD_VOICES[family] || FAMILY_CARD_VOICES.monochrome;
    return familyVoice[role] || familyVoice.primary;
  }

  function hueToFamily(hex) {
    const clean = String(hex || '').replace('#', '');
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

  function extractHexes(css) {
    return (String(css || '').match(/#[0-9a-fA-F]{6}/g) || [])
      .filter((hex, index, arr) => arr.indexOf(hex) === index);
  }

  function deriveSwatches(theme) {
    if (Array.isArray(theme.swatches) && theme.swatches.length) {
      return theme.swatches.slice(0, 4);
    }
    const palette = theme.palette || {};
    const paletteSwatches = [
      palette['--pm-hue1'],
      palette['--pm-hue2'],
      palette['--pm-hue3'],
      palette['--pm-surface'],
    ].filter(Boolean);
    if (paletteSwatches.length) return paletteSwatches.slice(0, 4);
    return extractHexes(theme.css).slice(0, 4);
  }

  function deriveTags(theme) {
    const base = [
      'generated',
      String(theme.baseTheme || 'GTA').toLowerCase(),
      hueToFamily((theme.palette || {})['--pm-hue1'] || deriveSwatches(theme)[0]),
      hueToFamily((theme.palette || {})['--pm-hue3'] || deriveSwatches(theme)[2]),
    ];
    return Array.from(new Set(base.filter(Boolean)));
  }

  /** Map internal base key to a UI-friendly label (GTA → Classic). */
  function baseDisplayName(key) {
    const map = { GTA: 'Classic', gta: 'Classic' };
    return map[key] || titleCase(key || 'Classic');
  }

  function buildFilterTokens(theme, primaryFamily, accentFamily, wallpaperCount) {
    const tokens = [];
    const baseTheme = String(theme.baseTheme || 'GTA').toLowerCase();
    tokens.push(`base:${baseTheme}`);
    if (primaryFamily) tokens.push(`mood:${primaryFamily}`);
    if (accentFamily && accentFamily !== primaryFamily) tokens.push(`mood:${accentFamily}`);
    tokens.push(wallpaperCount > 0 ? 'state:wallpaper-backed' : 'state:css-only');
    return tokens;
  }

  function buildDisplayChips(theme, primaryFamily, accentFamily, wallpaperCount) {
    const chips = [
      `${baseDisplayName(theme.baseTheme)} base`,
      familyCardLabel(primaryFamily, 'primary'),
      familyCardLabel(accentFamily, 'accent'),
      wallpaperCount > 0 ? `${wallpaperCount} wallpapers` : 'CSS only',
    ];
    return Array.from(new Set(chips.filter(Boolean)));
  }

  function normalizeTheme(theme) {
    if (!theme || !theme.name || !theme.safeName) return null;
    const swatches = deriveSwatches(theme);
    const wallpaperCount = Array.isArray(theme.wallpapers) ? theme.wallpapers.length : (theme.wallpaperCount || 0);
    const tags = Array.isArray(theme.tags) && theme.tags.length ? theme.tags : deriveTags(theme);
    const createdTs = Date.parse(theme.createdAt || '') || 0;
    const palette = theme.palette || {};
    const primaryFamily = hueToFamily(palette['--pm-hue1'] || swatches[0]);
    const accentFamily = hueToFamily(palette['--pm-hue3'] || swatches[2] || swatches[1]);
    const filterTokens = buildFilterTokens(theme, primaryFamily, accentFamily, wallpaperCount);
    const displayChips = buildDisplayChips(theme, primaryFamily, accentFamily, wallpaperCount);
    return {
      ...theme,
      swatches,
      tags,
      wallpaperCount,
      createdTs,
      primaryFamily,
      accentFamily,
      filterTokens,
      displayChips,
      searchText: [
        theme.name,
        theme.tagline,
        theme.baseTheme,
        tags.join(' '),
        displayChips.join(' '),
        familyLabel(primaryFamily),
        familyLabel(accentFamily),
      ].join(' ').toLowerCase(),
    };
  }

  function filterCounts(list) {
    const counts = new Map();
    list.forEach((theme) => {
      (theme.filterTokens || []).forEach((token) => {
        counts.set(token, (counts.get(token) || 0) + 1);
      });
    });
    return counts;
  }

  function filterLabel(token) {
    if (token === 'state:wallpaper-backed') return 'Wallpaper-backed';
    if (token === 'state:css-only') return 'CSS only';
    if (token.startsWith('base:')) return `${baseDisplayName(token.slice(5))} base`;
    if (token.startsWith('mood:')) return `${familyLabel(token.slice(5))} mood`;
    return titleCase(token);
  }

  function renderFilters() {
    if (!filterBar) return;
    const counts = filterCounts(themes);
    const baseTokens = Array.from(counts.entries())
      .filter(([token]) => token.startsWith('base:'))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4);
    const moodTokens = Array.from(counts.entries())
      .filter(([token]) => token.startsWith('mood:'))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4);
    const pills = [
      { key: 'all', label: 'All themes' },
      { key: 'state:wallpaper-backed', label: `Wallpaper-backed · ${counts.get('state:wallpaper-backed') || 0}` },
      ...baseTokens.map(([token, count]) => ({
        key: token,
        label: `${filterLabel(token)} · ${count}`,
      })),
      ...moodTokens.map(([token, count]) => ({
        key: token,
        label: `${filterLabel(token)} · ${count}`,
      })),
    ];
    filterBar.innerHTML = pills.map((pill) => `
      <button
        type="button"
        class="gallery-pill${activeTag === pill.key ? ' is-active' : ''}"
        data-tag="${escapeHtml(pill.key)}"
      >${escapeHtml(pill.label)}</button>
    `).join('');
  }

  function renderStats(list) {
    if (!statsEl) return;
    const baseCount = new Set(list.map((theme) => String(theme.baseTheme || 'GTA').toLowerCase())).size;
    const newest = list[0] && list[0].createdAt
      ? new Date(list[0].createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
      : 'n/a';
    statsEl.innerHTML = [
      `<div class="gallery-stat"><span class="stat-value">${themes.length}</span><span class="stat-label">themes archived</span></div>`,
      `<div class="gallery-stat"><span class="stat-value">${baseCount}</span><span class="stat-label">base skins in play</span></div>`,
      `<div class="gallery-stat"><span class="stat-value">${newest}</span><span class="stat-label">freshest drop</span></div>`,
    ].join('');
  }

  function visibleThemes() {
    const query = (searchInput && searchInput.value || '').toLowerCase().trim();
    let list = themes.filter((theme) => {
      if (query && !theme.searchText.includes(query)) return false;
      if (activeTag === 'all') return true;
      return (theme.filterTokens || []).includes(activeTag);
    });

    list = list.slice().sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      if (sortMode === 'wallpapers') return (b.wallpaperCount || 0) - (a.wallpaperCount || 0) || b.createdTs - a.createdTs;
      return b.createdTs - a.createdTs || a.name.localeCompare(b.name);
    });
    return list;
  }

  function renderThemeCard(theme, index) {
    const swatches = theme.swatches.length ? theme.swatches : ['#1f2937', '#334155', '#64748b'];
    const gradient = swatches.length >= 3
      ? `linear-gradient(135deg, ${swatches[0]} 0%, ${swatches[1]} 52%, ${swatches[2]} 100%)`
      : `linear-gradient(135deg, ${swatches[0]} 0%, ${swatches[1] || swatches[0]} 100%)`;

    return `
      <article class="theme-card" onclick="window.openTheme('${escapeHtml(theme.safeName)}')" style="animation-delay:${index * 0.04}s">
        <div class="card-preview" style="background:${gradient}">
          <div class="card-preview-overlay"></div>
          <div class="card-preview-copy">
            <span class="card-eyebrow">Printmon / ${escapeHtml(baseDisplayName(theme.baseTheme))}</span>
            <h3 class="card-name">${escapeHtml(theme.name)}</h3>
            <p class="card-tagline">${escapeHtml(theme.tagline || 'Generated for the gallery')}</p>
          </div>
        </div>
      </article>
    `;
  }

  function render() {
    if (!grid) return;
    const list = visibleThemes();
    if (countEl) countEl.textContent = String(list.length);

    if (!list.length) {
      grid.innerHTML = '<div class="empty-state"><h3>No matches in the vault</h3><p>Try another search or clear the active tag filter.</p></div>';
      return;
    }

    grid.innerHTML = list.map(renderThemeCard).join('');
  }

  function themeShareUrl(safeName) {
    const url = new URL(window.location.href);
    url.searchParams.set('theme', safeName);
    url.hash = '';
    return url;
  }

  function replaceThemeUrl(safeName) {
    if (!window.history || typeof window.history.replaceState !== 'function') return;
    const url = new URL(window.location.href);
    if (safeName) url.searchParams.set('theme', safeName);
    else url.searchParams.delete('theme');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }

  function fallbackCopyText(value) {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    textarea.remove();
    return copied;
  }

  async function copyShareLink(safeName) {
    if (!safeName || !copyThemeLink) return;
    const value = themeShareUrl(safeName).toString();
    let copied = false;

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch {
        copied = false;
      }
    }
    if (!copied) copied = fallbackCopyText(value);

    copyThemeLink.textContent = copied ? 'Link copied' : 'Copy failed';
    if (copyResetTimer) window.clearTimeout(copyResetTimer);
    copyResetTimer = window.setTimeout(function () {
      if (copyThemeLink) copyThemeLink.textContent = 'Copy link';
    }, 1800);
  }

  function buildStandalonePage(theme) {
    const css = theme.css || '';
    const wallpapers = (theme.wallpapers || []).map((wall) => {
      if (typeof wall === 'string') return wall;
      return wall && (wall.url || wall.large2x || wall.large || wall.original) || '';
    }).filter(Boolean);
    const bgStyle = wallpapers.length > 0
      ? `document.body.style.backgroundImage="url('${wallpapers[0]}')";document.body.style.backgroundSize='cover';document.body.style.backgroundAttachment='fixed';document.body.style.backgroundPosition='center';`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(theme.name)} — Printmon Theme</title>
  <link rel="stylesheet" href="https://doshus.net/amazon/printmon/css/newer/Shared2Printmon.css">
  <link rel="stylesheet" href="https://doshus.net/amazon/printmon/css/swapbtn.css">
  <style>${css}</style>
</head>
<body onload="${bgStyle}">
  <div class="printmon-container">
    <h1>${escapeHtml(theme.name)}</h1>
    <p class="subtitle">${escapeHtml(theme.tagline || '')}</p>
  </div>
</body>
</html>`;
  }

  window.openThemePage = function (safeName) {
    const theme = themes.find((item) => item.safeName === safeName);
    if (!theme) return;
    const fullPage = theme.html || buildStandalonePage(theme);
    const blob = new Blob([fullPage], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  window.viewThemeSource = function (safeName) {
    const theme = themes.find((item) => item.safeName === safeName);
    if (!theme) return;
    const source = `<!DOCTYPE html>
<html><head><title>Source: ${escapeHtml(theme.name)}</title>
<style>body{background:#07111e;color:#d9ecff;font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;padding:2rem;max-width:1100px;margin:0 auto}h1,h2{color:#7dd3fc}pre{background:#020817;padding:1rem;border-radius:14px;overflow-x:auto;white-space:pre-wrap}a{color:#a5f3fc}</style></head>
<body>
<h1>${escapeHtml(theme.name)}</h1>
<p>${escapeHtml(theme.tagline || '')}</p>
<h2>CSS</h2><pre>${escapeHtml(theme.css || '')}</pre>
<h2>HTML</h2><pre>${escapeHtml(theme.html || buildStandalonePage(theme))}</pre>
</body></html>`;
    const blob = new Blob([source], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  window.openTheme = function (safeName) {
    const theme = themes.find((item) => item.safeName === safeName);
    if (!theme || !modal || !previewFrame) return;

    activeThemeSafeName = safeName;
    replaceThemeUrl(safeName);

    if (previewName) previewName.textContent = theme.name;
    if (previewTagline) previewTagline.textContent = theme.tagline || 'Generated theme preview';
    if (previewMeta) {
      const metaBits = [
        `${baseDisplayName(theme.baseTheme)} base`,
        theme.wallpaperCount > 0 ? `${theme.wallpaperCount} wallpapers` : 'CSS only',
      ];
      previewMeta.innerHTML = metaBits.map((bit) => `<span class="theme-chip">${escapeHtml(bit)}</span>`).join('');
    }

    if (previewLink) {
      previewLink.onclick = function () { window.openThemePage(safeName); };
    }
    if (copyThemeLink) {
      copyThemeLink.textContent = 'Copy link';
      copyThemeLink.onclick = function () { copyShareLink(safeName); };
    }
    if (viewSourceBtn) {
      viewSourceBtn.onclick = function () { window.viewThemeSource(safeName); };
    }

    previewFrame.srcdoc = theme.html || buildStandalonePage(theme);
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
  };

  function closeModal() {
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
    if (previewFrame) previewFrame.srcdoc = '';
    if (activeThemeSafeName) replaceThemeUrl('');
    activeThemeSafeName = '';
  }

  async function loadThemes() {
    try {
      const response = await fetch(themesUrl);
      if (!response.ok) throw new Error(`RTDB unavailable (${response.status})`);
      const payload = await response.json();
      const list = payload && typeof payload === 'object'
        ? Object.values(payload).map(normalizeTheme).filter(Boolean)
        : [];

      themes = list.sort((a, b) => b.createdTs - a.createdTs || a.name.localeCompare(b.name));

      if (loadingEl) loadingEl.style.display = 'none';
      if (!themes.length) {
        if (grid) {
          grid.innerHTML = '<div class="empty-state"><h3>No generated themes yet</h3><p>Ask Zephyy for a custom Printmon vibe and this vault will light up.</p></div>';
        }
        return;
      }

      renderStats(themes);
      renderFilters();
      render();

      const requestedTheme = new URL(window.location.href).searchParams.get('theme');
      if (requestedTheme) window.openTheme(requestedTheme);
    } catch (error) {
      console.error('Failed to load themes:', error);
      if (loadingEl) {
        loadingEl.innerHTML = '<div class="empty-state"><h3>Theme vault offline</h3><p>Couldn’t reach the gallery data right now. Give it another refresh in a sec.</p></div>';
      }
    }
  }

  if (filterBar) {
    filterBar.addEventListener('click', function (event) {
      const btn = event.target.closest('[data-tag]');
      if (!btn) return;
      activeTag = btn.getAttribute('data-tag') || 'all';
      renderFilters();
      render();
    });
  }

  if (searchInput) searchInput.addEventListener('input', render);
  if (sortSelect) {
    sortSelect.addEventListener('change', function () {
      sortMode = sortSelect.value || 'newest';
      render();
    });
  }
  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (modal) modal.addEventListener('click', function (event) {
    if (event.target === modal) closeModal();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeModal();
  });

  loadThemes();
})();
