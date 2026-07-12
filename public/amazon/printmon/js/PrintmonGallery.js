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
  const viewSourceBtn = document.getElementById('viewSourceBtn');

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

  function normalizeTheme(theme) {
    if (!theme || !theme.name || !theme.safeName) return null;
    const swatches = deriveSwatches(theme);
    const wallpaperCount = Array.isArray(theme.wallpapers) ? theme.wallpapers.length : (theme.wallpaperCount || 0);
    const tags = Array.isArray(theme.tags) && theme.tags.length ? theme.tags : deriveTags(theme);
    const createdTs = Date.parse(theme.createdAt || '') || 0;
    return {
      ...theme,
      swatches,
      tags,
      wallpaperCount,
      createdTs,
      searchText: [
        theme.name,
        theme.tagline,
        theme.baseTheme,
        tags.join(' '),
      ].join(' ').toLowerCase(),
    };
  }

  function tagCounts(list) {
    const counts = new Map();
    list.forEach((theme) => {
      (theme.tags || []).forEach((tag) => {
        if (tag === 'generated') return;
        counts.set(tag, (counts.get(tag) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8);
  }

  function renderFilters() {
    if (!filterBar) return;
    const tags = tagCounts(themes);
    const pills = [
      { key: 'all', label: 'All themes' },
      { key: 'with-wallpapers', label: 'Wallpaper-backed' },
      ...tags.map(([tag, count]) => ({
        key: tag,
        label: `${titleCase(tag)} · ${count}`,
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
    const wallpaperThemes = list.filter((theme) => theme.wallpaperCount > 0).length;
    const newest = list[0] && list[0].createdAt
      ? new Date(list[0].createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
      : 'n/a';
    statsEl.innerHTML = [
      `<div class="gallery-stat"><span class="stat-value">${themes.length}</span><span class="stat-label">themes archived</span></div>`,
      `<div class="gallery-stat"><span class="stat-value">${wallpaperThemes}</span><span class="stat-label">with wallpapers</span></div>`,
      `<div class="gallery-stat"><span class="stat-value">${newest}</span><span class="stat-label">freshest drop</span></div>`,
    ].join('');
  }

  function visibleThemes() {
    const query = (searchInput && searchInput.value || '').toLowerCase().trim();
    let list = themes.filter((theme) => {
      if (query && !theme.searchText.includes(query)) return false;
      if (activeTag === 'all') return true;
      if (activeTag === 'with-wallpapers') return theme.wallpaperCount > 0;
      return (theme.tags || []).includes(activeTag);
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
    const chips = [
      titleCase(theme.baseTheme || 'GTA'),
      ...theme.tags.filter((tag) => tag !== 'generated' && String(tag).toLowerCase() !== String(theme.baseTheme || '').toLowerCase()).slice(0, 2).map(titleCase),
    ];
    if (theme.wallpaperCount > 0) chips.push(`${theme.wallpaperCount} wallpapers`);

    return `
      <article class="theme-card" onclick="window.openTheme('${escapeHtml(theme.safeName)}')" style="animation-delay:${index * 0.04}s">
        <div class="card-preview" style="background:${gradient}">
          <div class="card-preview-overlay"></div>
          <div class="card-preview-copy">
            <span class="card-eyebrow">Printmon / ${escapeHtml(titleCase(theme.baseTheme || 'GTA'))}</span>
            <h3 class="card-name">${escapeHtml(theme.name)}</h3>
            <p class="card-tagline">${escapeHtml(theme.tagline || 'Generated for the gallery')}</p>
          </div>
        </div>
        <div class="card-body">
          <div class="card-swatches">
            ${swatches.slice(0, 4).map((swatch) => `<span class="swatch-dot" style="background:${escapeHtml(swatch)}"></span>`).join('')}
          </div>
          <div class="card-meta">
            ${chips.slice(0, 4).map((chip) => `<span class="theme-chip">${escapeHtml(chip)}</span>`).join('')}
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

    if (previewName) previewName.textContent = theme.name;
    if (previewTagline) previewTagline.textContent = theme.tagline || 'Generated theme preview';
    if (previewMeta) {
      const metaBits = [
        titleCase(theme.baseTheme || 'GTA'),
        theme.wallpaperCount ? `${theme.wallpaperCount} wallpapers` : 'CSS-only',
        ...(theme.tags || []).filter((tag) => tag !== 'generated').slice(0, 2).map(titleCase),
      ];
      previewMeta.innerHTML = metaBits.map((bit) => `<span class="theme-chip">${escapeHtml(bit)}</span>`).join('');
    }

    if (previewLink) {
      previewLink.onclick = function () { window.openThemePage(safeName); };
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
