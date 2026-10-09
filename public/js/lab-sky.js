// Sky lab (/lab/sky): switch star renderers with ?sky= and read what each leaves the page.
//   ?sky=gl (default) | layers | dom (the shipped main.js engine) | off (nebula only)
//   &cards=0 hides the glass cards (their backdrop blur re-renders whenever the sky moves)
//   &theme=aurora swaps the star tokens, the way a monthly theme would
// Must load before main.js: main.js starts its own engine only if #stars still exists.
(() => {
    const q = new URLSearchParams(location.search);
    const mode = q.get('sky') || 'gl';
    const host = document.getElementById('stars');
    const status = document.getElementById('sky-status');
    document.documentElement.classList.toggle('sky-aurora', q.get('theme') === 'aurora');
    document.body.classList.toggle('lab-no-cards', q.get('cards') === '0');

    let shown = mode;
    if (mode !== 'dom') {
        host.removeAttribute('id');
        host.className = 'sky';
        if (mode === 'gl' && !Sky.gl(host)) shown = Sky.layers(host) ? 'layers (WebGL unavailable)' : 'none';
        else if (mode === 'layers') Sky.layers(host);
    }

    // Every control is a link to this page with one setting changed, so a setup can be shared
    for (const a of document.querySelectorAll('.lab-sky [data-set]')) {
        const [key, value] = a.dataset.set.split('=');
        const next = new URLSearchParams(q);
        const on = (q.get(key) || a.dataset.default) === value;
        if (a.dataset.toggle !== undefined) {
            next.set(key, on ? a.dataset.toggle : value);
            a.setAttribute('aria-pressed', on);
        } else {
            next.set(key, value);
            if (on) a.setAttribute('aria-current', 'page');
        }
        a.href = `?${next}`;
    }
    document.getElementById('sky-meteor').addEventListener('click', () => Sky.meteor(host));

    // Frame meter: frames per second, and how many frames took over 1.5x the typical frame
    // (a stutter you can feel even when the average looks fine). Lab only.
    const meter = document.getElementById('sky-meter');
    const gaps = [];
    let last = performance.now(), mark = last;
    document.addEventListener('visibilitychange', () => { gaps.length = 0; last = mark = performance.now(); });
    requestAnimationFrame(function count(now) {
        gaps.push(now - last);
        last = now;
        if (now - mark >= 1000) {
            const typical = [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
            const late = gaps.filter((g) => g > typical * 1.5).length;
            meter.textContent = `${Math.round(gaps.length * 1000 / (now - mark))} fps · ${Math.round(late / gaps.length * 100)}% late`;
            gaps.length = 0;
            mark = now;
        }
        requestAnimationFrame(count);
    });
    status.textContent = shown;
})();
