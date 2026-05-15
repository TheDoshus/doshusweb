/**
 * PrintmonGallery.js v2
 * 
 * Gallery page logic for generated Printmon themes.
 * Reads from Firebase RTDB — single merged theme entries with embedded CSS/HTML.
 * Renders cards with extracted colors, srcdoc preview, and standalone page links.
 */

(function () {
  'use strict';

  const RTDB_BASE = 'https://doshusweb-default-rtdb.firebaseio.com';
  const themesUrl = RTDB_BASE + '/printmon/themes.json';
  let themes = [];
  let filtered = [];

  // ─── DOM Refs ─────────────────────────────────────────
  const grid = document.getElementById('themeGrid');
  const searchInput = document.getElementById('gallerySearch');
  const countEl = document.getElementById('themeCount');
  const modal = document.getElementById('previewModal');
  const modalClose = document.getElementById('modalClose');
  const previewFrame = document.getElementById('previewFrame');
  const previewName = document.getElementById('previewName');
  const previewTagline = document.getElementById('previewTagline');
  const loadingEl = document.getElementById('loading');
  const previewLink = document.getElementById('previewLink');

  // ─── Extract dominant color from CSS ──────────────────
  function extractColor(css, fallback) {
    // Try to find a prominent background or gradient color
    const hexRe = /#[0-9a-fA-F]{3,8}/g;
    const matches = css.match(hexRe) || [];
    if (matches.length > 2) return matches[Math.floor(matches.length / 2)];
    // Try rgba
    const rgbaRe = /rgba?\((\d+),\s*(\d+),\s*(\d+)/;
    const rgbaM = css.match(rgbaRe);
    if (rgbaM) {
      const r = parseInt(rgbaM[1]).toString(16).padStart(2,'0');
      const g = parseInt(rgbaM[2]).toString(16).padStart(2,'0');
      const b = parseInt(rgbaM[3]).toString(16).padStart(2,'0');
      return '#' + r + g + b;
    }
    return fallback || '#444444';
  }

  // ─── Fetch Themes from RTDB ──────────────────────────
  async function loadThemes() {
    try {
      const rtdbRes = await fetch(themesUrl);
      if (!rtdbRes.ok) throw new Error('RTDB unavailable');
      const rtdbData = await rtdbRes.json();
      if (!rtdbData || typeof rtdbData !== 'object' || Object.keys(rtdbData).length === 0) {
        if (loadingEl) loadingEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;padding:3rem;">No generated themes yet. Check back soon!</p>';
        return;
      }

      themes = Object.values(rtdbData)
        .filter(t => t && t.name && t.css)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      if (loadingEl) loadingEl.style.display = 'none';

      if (themes.length === 0) {
        grid.innerHTML = '<p class="empty-state" style="grid-column:1/-1;text-align:center;color:var(--color-text-muted);padding:3rem;">No generated themes yet. Be the first — ask Zephyy to make one!</p>';
        return;
      }

      filtered = [...themes];
      render();
    } catch (err) {
      console.error('Failed to load themes:', err);
      if (loadingEl) {
        loadingEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;padding:3rem;">Couldn\'t load themes. Try refreshing.</p>';
      }
    }
  }

  // ─── Render Grid ──────────────────────────────────────
  function render() {
    if (!grid) return;
    if (countEl) countEl.textContent = filtered.length;
    if (filtered.length === 0) {
      grid.innerHTML = '<p class="empty-state" style="grid-column:1/-1;text-align:center;color:var(--color-text-muted);padding:3rem;">No themes match. Try a different search.</p>';
      return;
    }

    grid.innerHTML = filtered
      .map((t, i) => {
        const primary = extractColor(t.css, '#2d8f2d');
        const accent = extractColor(t.css.replace(primary, ''), '#88ff88');
        const wallpaperCount = (t.wallpapers && t.wallpapers.length) || 0;
        return `
        <div class="theme-card" onclick="window.openTheme('${t.safeName}')" style="animation-delay:${i * 0.05}s">
          <div class="card-preview" style="background:linear-gradient(135deg, ${primary}cc, ${accent}88)">
            <span class="card-glow" style="border-color:${accent}"></span>
            <span class="card-name">${t.name}</span>
          </div>
          <div class="card-body">
            <p class="card-tagline">${t.tagline || ''}</p>
            <div class="card-meta">
              ${wallpaperCount > 0 ? `<span class="chip">🖼 ${wallpaperCount} wallpapers</span>` : ''}
              <span class="chip">${t.baseTheme || 'Custom'}</span>
            </div>
          </div>
        </div>
      `;
      })
      .join('');
  }

  // ─── Search Filter ────────────────────────────────────
  function filterThemes(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
      filtered = [...themes];
    } else {
      filtered = themes.filter(
        (t) =>
          (t.name && t.name.toLowerCase().includes(q)) ||
          (t.tagline && t.tagline.toLowerCase().includes(q)) ||
          (t.baseTheme && t.baseTheme.toLowerCase().includes(q))
      );
    }
    render();
  }

  // ─── Open standalone page ─────────────────────────────
  window.openThemePage = function (safeName) {
    const theme = themes.find((t) => t.safeName === safeName);
    if (!theme) return;
    const fullPage = theme.html || buildStandalonePage(theme);
    const blob = new Blob([fullPage], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  window.viewThemeSource = function (safeName) {
    const theme = themes.find((t) => t.safeName === safeName);
    if (!theme) return;
    // Open raw CSS + HTML in a new window for inspection
    const source = `<!DOCTYPE HTML>
<html><head><title>Source: ${theme.name}</title>
<style>body{background:#1a1a1a;color:#e0e0e0;font:13px/1.6 monospace;padding:2rem;max-width:900px;margin:0 auto}
h2{color:#88ff88;border-bottom:1px solid #333;padding-bottom:4px}
pre{background:#0d0d0d;padding:12px;border-radius:6px;overflow-x:auto;white-space:pre-wrap;max-height:60vh}
.hex{color:#88ccff}.rgba{color:#ffcc88}</style></head><body>
<h1>${theme.name}</h1><p>Tagline: ${theme.tagline||''} | Base: ${theme.baseTheme||'GTA'} | Wallpapers: ${(theme.wallpapers||[]).length}</p>
<h2>CSS (${(theme.css||'').length}B)</h2><pre>${(theme.css||'').replace(/</g,'&lt;')}</pre>
<h2>HTML (${(theme.html||'').length}B)</h2><pre>${(theme.html||'').replace(/</g,'&lt;')}</pre>
</body></html>`;
    const blob = new Blob([source], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  function buildStandalonePage(theme) {
    const css = theme.css || '';
    const wallpapers = (theme.wallpapers || []).map(w => {
      if (typeof w === 'string') return w;
      return w.url || w.large2x || w.large || '';
    }).filter(Boolean);
    const bgStyle = wallpapers.length > 0
      ? `document.body.style.backgroundImage="url('${wallpapers[0]}')";document.body.style.backgroundSize='cover';document.body.style.backgroundAttachment='fixed';`
      : '';

    return `<!DOCTYPE HTML>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${theme.name} — Printmon Theme</title>
  <link rel="stylesheet" href="css/newer/Shared2Printmon.css">
  <link rel="stylesheet" href="css/swapbtn.css">
  <style>${css}</style>
</head>
<body onload="${bgStyle}">
  <div class="printmon-container">
    <h1>${theme.name}</h1>
    <p class="subtitle">${theme.tagline || ''}</p>
  </div>
  <script>
    // Wallpaper rotation
    const wallpapers = ${JSON.stringify(wallpapers)};
    if (wallpapers.length > 0) {
      const i = Math.floor(Math.random() * wallpapers.length);
      const u = wallpapers[i];
      if (typeof u === 'string' && (u.endsWith('.mp4') || u.endsWith('.webm'))) {
        const v = document.createElement('video');
        v.src = u; v.autoplay = true; v.loop = true; v.muted = true;
        v.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;object-fit:fill;z-index:-1';
        document.body.appendChild(v);
      } else if (u) {
        document.body.style.backgroundImage = "url('" + u + "')";
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundAttachment = 'fixed';
        document.body.style.backgroundPosition = 'center';
      }
    }
  </script>
</body>
</html>`;
  }

  // ─── Preview Modal ────────────────────────────────────
  window.openTheme = function (safeName) {
    if (!modal || !previewFrame) return;
    const theme = themes.find((t) => t.safeName === safeName);
    if (!theme) return;

    if (previewName) previewName.textContent = theme.name;
    if (previewTagline) previewTagline.textContent = theme.tagline || '';

    // Show action buttons
    if (previewLink) {
      previewLink.onclick = function() { window.openThemePage(safeName); };
      previewLink.style.display = 'inline-block';
    }
    var vsb = document.getElementById('viewSourceBtn');
    if (vsb) {
      vsb.onclick = function() { window.viewThemeSource(safeName); };
      vsb.style.display = 'inline-block';
    }

    // Use srcdoc to render the theme HTML directly in the iframe
    const fullPage = theme.html || buildStandalonePage(theme);
    previewFrame.srcdoc = fullPage;

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
  };

  function closeModal() {
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
    if (previewFrame) previewFrame.srcdoc = '';
  }

  // ─── Events ───────────────────────────────────────────
  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  if (searchInput) {
    searchInput.addEventListener('input', (e) => filterThemes(e.target.value));
  }

  // ─── Init ─────────────────────────────────────────────
  loadThemes();
})();
