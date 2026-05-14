/**
 * PrintmonGallery.js
 * 
 * Gallery page logic for generated Printmon themes.
 * Reads from manifest.json (populated by the generator),
 * renders theme cards with previews, handles filtering.
 */

(function () {
  'use strict';

  const RTDB_BASE = 'https://doshusweb-default-rtdb.firebaseio.com';
  const themesUrl = RTDB_BASE + '/printmon/themes.json';
  const manifestUrl = 'generated/manifest.json'; // fallback
  let themes = [];
  let filtered = [];
  let usingRTDB = false;

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

  // ─── Fetch Manifest ───────────────────────────────────
  async function loadThemes() {
    try {
      // Try Firebase RTDB first (live themes)
      const rtdbRes = await fetch(themesUrl);
      if (rtdbRes.ok) {
        const rtdbData = await rtdbRes.json();
        if (rtdbData && typeof rtdbData === 'object') {
          themes = Object.values(rtdbData).sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
          );
          usingRTDB = true;
          filtered = [...themes];
          render();
          return;
        }
      }

      // Fallback: local manifest.json (demo themes)
      const res = await fetch(manifestUrl);
      if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);
      themes = await res.json();
      filtered = [...themes];
      render();
    } catch (err) {
      console.error('Failed to load themes:', err);
      if (loadingEl) {
        loadingEl.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;padding:3rem;">No generated themes yet. Check back soon!</p>';
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
      .map(
        (t, i) => `
        <div class="theme-card" onclick="window.openTheme('${t.safeName}')" style="animation-delay:${i * 0.05}s">
          <div class="card-preview" style="background:linear-gradient(135deg,${t.primary},${t.accent})">
            <span class="card-glow" style="border-color:${t.glowColor || t.accent}"></span>
            <span class="card-name">${t.name}</span>
          </div>
          <div class="card-body">
            <p class="card-tagline">${t.tagline}</p>
            <div class="card-chips">
              <span class="chip primary-chip" style="background:${t.primary}">Primary</span>
              <span class="chip accent-chip" style="background:${t.accent}">Accent</span>
            </div>
          </div>
        </div>
      `
      )
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
          t.name.toLowerCase().includes(q) ||
          t.tagline.toLowerCase().includes(q) ||
          t.feature.toLowerCase().includes(q)
      );
    }
    render();
  }

  // ─── Preview Modal ────────────────────────────────────
  window.openTheme = function (safeName) {
    if (!modal || !previewFrame) return;
    const theme = themes.find((t) => t.safeName === safeName);
    if (!theme) return;

    if (previewName) previewName.textContent = theme.name;
    if (previewTagline) previewTagline.textContent = theme.tagline;

    // RTDB themes use local preview page; CSS is fetched dynamically
    // RTDB mode: pass theme data URL (single merged entry, 1 fetch)
    const src = usingRTDB
      ? `generated/preview.html?theme=${encodeURIComponent(safeName)}&rtdb=true`
      : `generated/preview.html?theme=${encodeURIComponent(safeName)}`;
    previewFrame.src = src;

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
  };

  function closeModal() {
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
    if (previewFrame) previewFrame.src = '';
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
