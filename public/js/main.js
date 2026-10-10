/* --- GLOBAL ANALYTICS --- */
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
// Honor Global Privacy Control: a visitor whose browser says "don't track me" sends no analytics
if (!navigator.globalPrivacyControl) gtag('config', 'G-KQ1RGHNMZG');

// Smooth scrolling for in-page links lives in CSS (shared.css, html scroll-behavior)

// Respect the user's OS-level motion preference
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── HAPTICS ───
// Shared short-tap helper for click feedback sitewide. Silent no-op on
// browsers/devices without vibration support (desktop, iOS Safari).
function haptic(ms = 8) {
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
}

// Deep Space Stars
// Two WebGL draws a frame paint the whole sky: the nebula, slowly turning and shifting color, then
// every star as a point that twinkles on its own clock, drifts smoothly between pixels and shifts
// with the pointer and the scroll; a shooting star crosses now and then. Colors are the --star-*
// and --nebula-* tokens in shared.css, so a monthly theme is a token swap. No WebGL: the still
// nebula of .cosmic-bg and the shooting stars. Reduced motion: one still frame, no meteors.
// (Measured 2026-10-09: main-thread cost the same as no stars; the old 245-element engine took a
// fifth of a core on /nexus.)
const starsContainer = document.getElementById('stars');
if (starsContainer) {

    // ─── STAR LAYER CONFIG ───
    // Far = tiny & slow, Mid = medium, Close = big, bright & fast, with a glow. Counts are per
    // 1.3 megapixels of window (1440x900), scaled to the visitor's. Radius in css px, twinkle rate
    // in radians/s. Depths keep one decimal: the drift wraps every 100 fields, seamless only then.
    const DEPTHS = [
        { count: 220, radius: [0.25, 0.75], depth: 0.3, light: [0.2, 0.55], rate: [0.9, 1.6] },
        { count: 60, radius: [0.75, 1.4], depth: 0.7, light: [0.4, 0.8], rate: [1, 1.8] },
        { count: 20, radius: [1.4, 2.25], depth: 1.2, light: [0.6, 1], rate: [1.2, 2.1], glow: 1 },
    ];
    const TINTS = ['white', 'white', 'white', 'white', 'cool', 'cool', 'warm', 'violet'];
    const DRIFT = [0.024, 0.006];  // fields per second at depth 1, across and down
    const PARALLAX = 80;           // px of pointer parallax at depth 1, edge to edge
    const SCROLL = 0.06;           // stars shift this share of the page scroll, times depth
    const PAD = 60;                // the field runs this far past every edge, so no star pops in
    const rand = (lo, hi) => lo + Math.random() * (hi - lo);

    // Positions are fractions of the field. A third of the far stars crowd a soft wavy band
    // (periodic across the field, so it has no seam where the field wraps)
    const scale = Math.min(Math.max(innerWidth * innerHeight / 1.3e6, 0.5), 1.6);
    const stars = DEPTHS.flatMap((d, i) => Array.from({ length: Math.round(d.count * scale) }, () => {
        const x = Math.random();
        const y = i === 0 && Math.random() < 0.35
            ? (1.45 + 0.12 * Math.sin(x * 2 * Math.PI) + 0.07 * (Math.random() + Math.random() - 1)) % 1
            : Math.random();
        return { x, y, d, r: rand(...d.radius), tint: TINTS[Math.floor(Math.random() * TINTS.length)],
            phase: rand(0, 2 * Math.PI), rate: rand(...d.rate) };
    }));

    // An oklch token ("88% 0.06 250") as oklab, and oklab as the gamma-encoded sRGB floats WebGL
    // takes (CSS Color 4 math)
    function labOf(name) {
        const [L, C, H] = getComputedStyle(starsContainer).getPropertyValue(name).trim().split(/\s+/);
        return [parseFloat(L) / (L.endsWith('%') ? 100 : 1), C * Math.cos(H * Math.PI / 180), C * Math.sin(H * Math.PI / 180)];
    }
    function srgb([L, a, b]) {
        const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
        const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
        const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
        return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s]
            .map((c) => Math.min(Math.max(c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055, 0), 1));
    }

    // ─── SHADERS ───
    const VERTEX = `
        attribute vec2 a_pos;    // 0..1 across the field
        attribute vec4 a_star;   // radius (css px), depth, twinkle phase, twinkle rate
        attribute vec4 a_color;  // rgb, glow 0..1
        attribute vec2 a_light;  // dimmest, brightest
        uniform vec2 u_view;     // the sky's box, css px
        uniform vec2 u_shift;    // drift + parallax at depth 1, css px
        uniform float u_time, u_dpr, u_max;
        varying vec4 v_color;
        varying float v_radius, v_size, v_light;
        const float PAD = ${PAD}.0;
        void main() {
            vec2 span = u_view + 2.0 * PAD;
            vec2 p = mod(a_pos * span + u_shift * a_star.y, span) - PAD;
            gl_Position = vec4(p / u_view * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
            v_radius = a_star.x * u_dpr;
            v_size = min(2.0 * v_radius * (1.0 + 3.0 * a_color.a) + 2.0, u_max);
            gl_PointSize = v_size;
            v_light = mix(a_light.x, a_light.y, 0.5 + 0.5 * sin(u_time * a_star.w + a_star.z));
            v_color = a_color;
        }`;
    // gl_PointCoord is measured from the star's exact center, so the disk stays antialiased and
    // moves smoothly between pixels; close stars add a halo in --star-glow
    const FRAGMENT = `
        precision mediump float;
        uniform vec3 u_glow;
        varying vec4 v_color;
        varying float v_radius, v_size, v_light;
        void main() {
            float d = length(gl_PointCoord - 0.5) * v_size;
            float core = clamp(v_radius + 0.5 - d, 0.0, 1.0);
            float halo = v_color.a * 0.6 * pow(max(1.0 - d / (4.0 * v_radius), 0.0), 2.0);
            gl_FragColor = vec4(v_color.rgb * core + u_glow * halo * (1.0 - core), core + halo * (1.0 - core)) * v_light;
        }`;

    // ─── NEBULA ───
    // The glow behind the stars: a gradient from black through two nebula colors and back to
    // black, turning once every TURN seconds while its colors drift through these moments, one
    // every 2 s ("token alpha where", where in % along the gradient). Here it moves smoothly for
    // one light pass a frame; as a CSS animation it snapped every 2 s (gradients don't tween) and
    // repainted the whole window each time. .cosmic-bg keeps the first moment, still, for pages
    // without WebGL; a page whose CSS sets --sky-nebula: none on #stars keeps its own background.
    const NEBULA = [
        'purple .85 30, blue .65 65', 'purple .80 32, blue .60 64', 'purple .78 33, blue .68 63', 'blue .82 31, purple .58 66',
        'blue .88 34, purple .52 65', 'blue .90 35, purple .55 64', 'purple .85 33, blue .72 62', 'pink .82 30, blue .70 61',
        'pink .78 29, blue .68 63', 'purple .74 31, pink .30 68', 'blue .88 30, purple .72 65', 'blue .84 32, purple .68 64',
        'purple .86 34, blue .62 63', 'blue .82 31, purple .58 66', 'blue .78 33, purple .62 64', 'pink .38 25, purple .80 58',
        'purple .85 30, blue .62 65', 'purple .82 32, blue .66 64', 'purple .80 33, blue .70 63', 'purple .83 31, blue .67 65',
    ].map((m) => m.split(', ').map((stop) => stop.split(' ')));
    const TURN = 40;
    const drifting = getComputedStyle(starsContainer).getPropertyValue('--sky-nebula').trim() !== 'none';
    const backdrop = document.querySelector('.cosmic-bg');
    // The gradient's colors along its line, worked out in JS (paint()) and read here from a
    // RAMP x 1 texture: each pixel finds how far along the line it sits (the browser's own
    // linear-gradient() math, in buffer pixels with y up) and looks up its color
    const RAMP = 256;
    const ramp = new Uint8Array(RAMP * 4).fill(255);
    const CORNER = 'attribute vec2 a_corner; void main() { gl_Position = vec4(a_corner, 0.0, 1.0); }';
    const GLOW = `
        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        #else
        precision mediump float;
        #endif
        uniform vec2 u_size, u_dir;  // buffer px; heading (sin, cos of the CSS angle)
        uniform sampler2D u_ramp;
        void main() {
            vec2 p = gl_FragCoord.xy - 0.5 * u_size;
            float t = clamp(dot(p, u_dir) / dot(abs(u_dir), u_size) + 0.5, 0.0, 1.0);
            // Dithered like the browser's own gradients, so the dark ramps don't band
            float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            gl_FragColor = vec4(texture2D(u_ramp, vec2((t * ${RAMP - 1}.0 + 0.5) / ${RAMP}.0, 0.5)).rgb + (n - 0.5) / 255.0, 1.0);
        }`;
    // The ramp for a point between two moments: black, the two colors, black, mixed in oklab with
    // premultiplied alpha and laid over the black page, as the browser mixes a gradient
    function paint(m, n, k) {
        const v = (j) => m[j] + (n[j] - m[j]) * k;
        const at = [0, v(8), v(9), 1];
        const stops = [[0, 0, 0, 1], [v(0), v(1), v(2), v(3)], [v(4), v(5), v(6), v(7)], [0, 0, 0, 1]];
        for (let i = 0, s = 0; i < RAMP; i++) {
            const t = i / (RAMP - 1);
            while (t > at[s + 1]) s++;
            const f = (t - at[s]) / (at[s + 1] - at[s]);
            const c = stops[s].map((x, j) => x + (stops[s + 1][j] - x) * f);
            srgb([c[0] / c[3], c[1] / c[3], c[2] / c[3]]).forEach((x, j) => { ramp[4 * i + j] = x * c[3] * 255 + 0.5; });
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, RAMP, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, ramp);
    }

    // ─── WEBGL SKY ───
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false,
        depth: false, stencil: false, powerPreference: 'low-power' });
    const pointer = { x: 0, y: 0 }, eased = { x: 0, y: 0 };
    // scrolled is kept by a scroll listener: reading scrollY in the frame would force a layout
    // whenever something else on the page had just changed one
    let frame = 0, last = 0, time = 0, w = 0, h = 0, scrolled = 0;
    let sky, nebula, moments, shown;
    let calm = false; // set for the rest of the visit once the watcher catches the device struggling

    // A program from its shaders, with its uniforms' locations and its attributes laid over its
    // own buffer. The two programs share attribute slots, so use() points them at its buffer.
    function build(vertex, fragment, uniforms, attributes, data) {
        const program = gl.createProgram();
        for (const [type, src] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, src);
            gl.compileShader(shader);
            gl.attachShader(program, shader);
        }
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
        let offset = 0;
        const layout = attributes.map(([name, size]) => {
            const loc = gl.getAttribLocation(program, name);
            gl.enableVertexAttribArray(loc);
            offset += size * 4;
            return [loc, size, offset - size * 4];
        });
        return { program, buffer, stride: offset, layout, u: Object.fromEntries(uniforms.map((name) => [name, gl.getUniformLocation(program, name)])) };
    }
    function use({ program, buffer, stride, layout }) {
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        layout.forEach(([loc, size, offset]) => gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset));
    }
    // Both programs, with the star and nebula colors read from the tokens (a nebula that fails
    // to build just leaves .cosmic-bg showing)
    function compile() {
        const tint = Object.fromEntries([...new Set(TINTS)].map((t) => [t, srgb(labOf(`--star-${t}`))]));
        sky = build(VERTEX, FRAGMENT, ['u_view', 'u_shift', 'u_time', 'u_dpr', 'u_max', 'u_glow'],
            [['a_pos', 2], ['a_star', 4], ['a_color', 4], ['a_light', 2]],
            stars.flatMap((s) => [s.x, s.y, s.r, s.d.depth, s.phase, s.rate, ...tint[s.tint], s.d.glow || 0, ...s.d.light]));
        if (!sky) return false;
        nebula = drifting && build(CORNER, GLOW, ['u_size', 'u_dir'], [['a_corner', 2]], [-1, -1, 3, -1, -1, 3]);
        if (nebula) {
            gl.bindTexture(gl.TEXTURE_2D, gl.createTexture()); // the ramp, on unit 0 for good
            for (const [key, value] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
                [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, key, value);
            shown = -1;
        }
        if (backdrop) backdrop.hidden = !!nebula && !calm; // fully covered, so the page skips compositing it
        // Each moment as paint() takes it: both colors as oklab times alpha and alpha, then where they sit
        const color = ([token, alpha]) => [...labOf(`--nebula-${token}`).map((c) => c * alpha), +alpha];
        moments = NEBULA.map(([a, b]) => [...color(a), ...color(b), a[2] / 100, b[2] / 100]);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);  // premultiplied alpha
        use(sky);
        gl.uniform1f(sky.u.u_max, gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1]);
        gl.uniform3fv(sky.u.u_glow, srgb(labOf('--star-glow')));
        size();
        return true;
    }
    // The drawing buffer matches the sky's box in device pixels (capped at 2x: past that, stars
    // only cost fill), so the canvas is never stretched
    function size() {
        w = starsContainer.clientWidth || innerWidth;
        h = starsContainer.clientHeight || innerHeight;
        const dpr = Math.min(devicePixelRatio || 1, 2);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
        if (nebula) {
            gl.useProgram(nebula.program);
            gl.uniform2f(nebula.u.u_size, canvas.width, canvas.height);
            gl.useProgram(sky.program);
        }
        gl.uniform2f(sky.u.u_view, w, h);
        gl.uniform1f(sky.u.u_dpr, canvas.width / w);
        draw(); // resizing clears the buffer, and the next frame's draw comes after it's painted
    }
    // Drift is in fields (wrapping every 100), so a resize keeps every star's place
    function draw() {
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (nebula && !calm) {
            use(nebula);
            const turn = time / TURN;
            // The colors move in 32 steps from one moment to the next (too fine to see), the turn every frame
            const step = Math.round(turn % 1 * moments.length * 32) % (moments.length * 32);
            if (step !== shown) {
                shown = step;
                const i = Math.floor(step / 32);
                paint(moments[i], moments[(i + 1) % moments.length], step % 32 / 32);
            }
            const angle = (135 + 360 * turn) * Math.PI / 180;
            gl.uniform2f(nebula.u.u_dir, Math.sin(angle), Math.cos(angle));
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            use(sky);
        }
        gl.uniform1f(sky.u.u_time, time);
        gl.uniform2f(sky.u.u_shift, time * DRIFT[0] % 100 * (w + 2 * PAD) + eased.x * PARALLAX,
            time * DRIFT[1] % 100 * (h + 2 * PAD) + eased.y * PARALLAX - scrolled * SCROLL);
        gl.drawArrays(gl.POINTS, 0, stars.length);
    }
    // A hidden tab or a long hitch resumes where it left off instead of jumping ahead
    function tick(now) {
        const dt = Math.min(now - (last || now), 50) / 1000;
        last = now;
        time += dt;
        const k = 1 - Math.exp(-dt * 7.5);  // the old engine's 0.12 per 60 Hz frame, at any refresh rate
        eased.x += (pointer.x - eased.x) * k;
        eased.y += (pointer.y - eased.y) * k;
        draw();
        frame = requestAnimationFrame(tick);
    }

    // ─── SHOOTING STARS ───
    // One element streaking 20-40 degrees down, left or right, animated on the compositor. Its head
    // is the element's right end, so rotating it to its heading puts the tail behind
    function meteor() {
        const m = document.createElement('i');
        m.className = 'sky-meteor';
        const x = rand(0.15, 0.85) * starsContainer.clientWidth, y = rand(0.05, 0.4) * starsContainer.clientHeight;
        const heading = rand(20, 40) * Math.PI / 180, run = rand(250, 450), side = Math.random() < 0.5 ? 1 : -1;
        const dx = side * Math.cos(heading) * run, dy = Math.sin(heading) * run;
        const turn = `rotate(${Math.atan2(dy, dx)}rad)`;
        starsContainer.append(m);
        const streak = m.animate([
            { transform: `translate(${x}px, ${y}px) ${turn} scaleX(0.2)`, opacity: 0 },
            { opacity: 1, offset: 0.2 },
            { transform: `translate(${x + dx}px, ${y + dy}px) ${turn} scaleX(1)`, opacity: 0 },
        ], { duration: rand(700, 1100), easing: 'cubic-bezier(.3, 0, .8, .6)' });
        streak.onfinish = streak.oncancel = () => m.remove();
    }

    // ─── FPS WATCHER ───
    // The stars need no brake any more, but a struggling device still eases off the other ambient
    // animations: under 25 fps over 2.5 s the body gets .zp-motion-throttled (Zephyy's CSS pauses
    // her glows, spins and drifts) until 5 straight checks run at 30+ (12.5 s). One frame over a
    // second is a hidden tab or a single hitch, not a slow page: it starts a fresh window. The
    // nebula settles into .cosmic-bg's still one for the rest of the visit, sparing the device a
    // full-screen pass a frame (once only, so it can't flicker back and forth)
    function watchFrameRate() {
        let frames = 0, start = performance.now(), prev = start, clean = 0, throttled = false;
        requestAnimationFrame(function check(now) {
            if (now - prev > 1000) { frames = 0; start = now; }
            prev = now;
            frames++;
            if (now - start >= 2500) {
                const fps = frames * 1000 / (now - start);
                if (fps < 25) {
                    throttled = true;
                    clean = 0;
                    calm = true;
                    if (backdrop) backdrop.hidden = false;
                }
                else if (throttled) { clean = fps >= 30 ? clean + 1 : 0; throttled = clean < 5; }
                document.body.classList.toggle('zp-motion-throttled', throttled);
                frames = 0;
                start = now;
            }
            requestAnimationFrame(check);
        });
    }

    const ready = gl && compile();
    if (ready) {
        starsContainer.append(canvas);
        new ResizeObserver(size).observe(starsContainer);
        // A GPU reset (driver update, sleep) drops the context: stop, then rebuild once it's back
        canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            cancelAnimationFrame(frame);
            if (backdrop) backdrop.hidden = false; // the still nebula stands in until the GPU is back
        });
        canvas.addEventListener('webglcontextrestored', () => { if (compile() && !prefersReducedMotion) frame = requestAnimationFrame(tick); });
    }
    if (!prefersReducedMotion) {
        if (ready) {
            document.addEventListener('pointermove', (e) => {
                pointer.x = e.clientX / innerWidth - 0.5;
                pointer.y = e.clientY / innerHeight - 0.5;
            }, { passive: true });
            addEventListener('scroll', () => { scrolled = scrollY; }, { passive: true });
            scrolled = scrollY;
            frame = requestAnimationFrame(tick);
        }
        // A shooting star every 20-60 s while the tab is in view
        (function next(wait) {
            setTimeout(() => { if (!document.hidden) meteor(); next(rand(20e3, 60e3)); }, wait);
        })(rand(4e3, 12e3));
        watchFrameRate();
    }
}

let videoJsLoadPromise;

// The one "meme unavailable" image every fallback uses
function memeUnavailable() {
    const img = document.createElement('img');
    img.src = '/assets/images/Image_not_available.webp';
    img.alt = 'Meme unavailable';
    return img;
}

// One observer for every meme video: play while it's on screen, pause once it scrolls away,
// and never restart one the visitor paused themselves. Saves decoding video nobody can see.
const memeVideoObserver = 'IntersectionObserver' in window && new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
        const player = target.memePlayer;
        if (!player || player.isDisposed()) return;
        if (!isIntersecting) player.pause();
        else if (!target.dataset.userPaused) player.play()?.catch(() => {});
    });
}, { threshold: 0.25 });

function loadVideoJs() {
    if (window.videojs) return Promise.resolve(window.videojs);

    if (!videoJsLoadPromise) {
        videoJsLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/assets/vendor/videojs/video.min.js';
            script.async = true;
            script.onload = () => {
                if (window.videojs) {
                    resolve(window.videojs);
                } else {
                    reject(new Error('Video.js loaded without exposing videojs'));
                }
            };
            script.onerror = () => reject(new Error('Video.js failed to load'));
            document.head.appendChild(script);
        });
    }

    return videoJsLoadPromise;
}

function createMemeIcon(className, paths) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add(className);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    paths.forEach(pathData => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        svg.appendChild(path);
    });

    return svg;
}

function createMemeVideoControls(player) {
    const controls = document.createElement('div');
    controls.className = 'meme-video-controls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Meme video controls');

    const playbackButton = document.createElement('button');
    playbackButton.type = 'button';
    playbackButton.className = 'meme-video-control';
    playbackButton.appendChild(createMemeIcon('meme-icon-play', ['M8 5v14l11-7z']));
    playbackButton.appendChild(createMemeIcon('meme-icon-pause', ['M8 5v14', 'M16 5v14']));

    const soundButton = document.createElement('button');
    soundButton.type = 'button';
    soundButton.className = 'meme-video-control';
    soundButton.appendChild(createMemeIcon('meme-icon-muted', [
        'M11 5 6 9H3v6h3l5 4V5Z',
        'm16 9 6 6',
        'm22 9-6 6',
    ]));
    soundButton.appendChild(createMemeIcon('meme-icon-volume', [
        'M11 5 6 9H3v6h3l5 4V5Z',
        'M15.5 8.5a5 5 0 0 1 0 7',
        'M19 5a10 10 0 0 1 0 14',
    ]));

    const syncPlaybackButton = () => {
        const isPaused = player.paused();
        const label = isPaused ? 'Play meme video' : 'Pause meme video';
        playbackButton.dataset.state = isPaused ? 'paused' : 'playing';
        playbackButton.setAttribute('aria-label', label);
        playbackButton.title = label;
    };

    const syncSoundButton = () => {
        const isMuted = player.muted();
        const label = isMuted ? 'Unmute meme video' : 'Mute meme video';
        soundButton.dataset.state = isMuted ? 'muted' : 'audible';
        soundButton.setAttribute('aria-label', label);
        soundButton.title = label;
    };

    playbackButton.addEventListener('click', event => {
        event.stopPropagation();
        haptic();
        // Remember a visitor's own pause so scrolling back doesn't restart it
        const slot = playbackButton.closest('.random-meme, .random-meme-fixed');
        if (slot) slot.dataset.userPaused = player.paused() ? '' : '1';
        if (player.paused()) {
            const playAttempt = player.play();
            if (playAttempt) playAttempt.catch(syncPlaybackButton);
        } else {
            player.pause();
        }
    });

    soundButton.addEventListener('click', event => {
        event.stopPropagation();
        haptic();
        player.muted(!player.muted());
    });

    player.on('play', syncPlaybackButton);
    player.on('pause', syncPlaybackButton);
    player.on('volumechange', syncSoundButton);
    syncPlaybackButton();
    syncSoundButton();

    controls.appendChild(playbackButton);
    controls.appendChild(soundButton);
    return controls;
}

async function renderVideoMeme(container, randomFile) {
    let player;
    let hasFailed = false;

    const showFallback = () => {
        if (hasFailed) return;
        hasFailed = true;
        if (memeVideoObserver) memeVideoObserver.unobserve(container);
        if (player && !player.isDisposed()) player.dispose();
        container.classList.remove('meme-video-active');
        container.replaceChildren(memeUnavailable());
    };

    const video = document.createElement('video');
    video.className = 'video-js';
    video.src = randomFile;
    // No autoplay: the observer starts it once it's on screen, so only metadata loads before then
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = memeVideoObserver ? 'metadata' : 'auto';
    video.addEventListener('error', showFallback, { once: true });

    container.classList.add('meme-video-active');
    container.appendChild(video);

    try {
        const videojs = await loadVideoJs();
        if (!video.isConnected || hasFailed) return;

        player = videojs(video, {
            autoplay: false,
            loop: true,
            muted: true,
            playsinline: true,
            preload: memeVideoObserver ? 'metadata' : 'auto',
            controls: false,
            bigPlayButton: false,
            controlBar: false,
        });
        player.one('error', showFallback);
        container.appendChild(createMemeVideoControls(player));
        player.ready(() => {
            player.muted(true);
            player.loop(true);
            container.memePlayer = player;
            if (memeVideoObserver) memeVideoObserver.observe(container);
            else player.play()?.catch(() => {});
        });
    } catch {
        showFallback();
    }
}

// Universal meme/video loader - Auto-loads from JSON on ANY page
async function loadUniversalMemes() {
    // Find ALL meme containers on the current page using their CSS classes
    const containers = document.querySelectorAll('.random-meme, .random-meme-fixed');
    if (containers.length === 0) return; // If no containers exist on this page, silently stop running

    try {
        const response = await fetch('/assets/memes/meme-list.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const memeFiles = await response.json();
        if (memeFiles.length === 0) return;

        // Shuffle once, then deal one per container, so a page never shows the same meme twice
        for (let i = memeFiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [memeFiles[i], memeFiles[j]] = [memeFiles[j], memeFiles[i]];
        }

        containers.forEach((container, index) => {
            const memeFile = memeFiles[index % memeFiles.length];
            container.replaceChildren(); // Clear any existing content

            if (/\.(mp4|webm|avi|wmv|flv|mkv|mov)$/i.test(memeFile)) {
                renderVideoMeme(container, memeFile);
                return;
            }
            // Size and fit come from each page's CSS (.random-meme img / .random-meme-fixed img)
            const img = document.createElement('img');
            img.src = memeFile;
            img.alt = 'Random Meme';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.addEventListener('error', () => img.replaceWith(memeUnavailable()), { once: true });
            container.appendChild(img);
        });
    } catch {
        // Fallback: Fill all broken containers with the error image
        containers.forEach(c => c.replaceChildren(memeUnavailable()));
    }
}
window.addEventListener('DOMContentLoaded', loadUniversalMemes);

// ─── UNIVERSAL COLLAPSIBLE SECTIONS & MODALS ───
// Collapsibles are native <details class="collapse">: the browser opens, closes and announces
// them. `toggle` doesn't bubble, so it's caught on the way down.
document.addEventListener('toggle', (e) => {
    if (!e.target.matches?.('.collapse')) return;
    haptic();
}, true);
// Where CSS can't ease <details> (no interpolate-size: Firefox, Safari), the Web Animations API
// does, for .collapse and the board's .fold: open at once and grow, or shrink and close at the end.
// A click mid-flight turns it around from where it is
if (!CSS.supports('interpolate-size', 'allow-keywords') && !prefersReducedMotion) {
    const closing = new WeakSet();
    document.addEventListener('click', (e) => {
        const summary = e.target.closest?.('details:is(.collapse, .fold) > summary');
        if (!summary) return;
        e.preventDefault();
        const fold = summary.parentElement;
        const from = fold.getBoundingClientRect().height;
        fold.getAnimations().forEach((a) => a.cancel());
        const opening = !fold.open || closing.has(fold);
        closing.delete(fold);
        fold.open = true;
        const to = opening ? fold.offsetHeight : summary.offsetHeight + fold.offsetHeight - fold.clientHeight;
        const ease = fold.animate({ height: [`${from}px`, `${to}px`], overflow: ['clip', 'clip'] }, { duration: 400, easing: 'ease' });
        if (!opening) { closing.add(fold); ease.onfinish = () => { closing.delete(fold); fold.open = false; }; }
    });
}

// Modals are native <dialog class="srcOverlay">: showModal() brings focus trapping, the Escape
// key and an inert page behind it for free. The ✕ sits in a <form method="dialog">, which closes
// it with no script.
document.querySelectorAll('.srcBtn').forEach(btn => {
    btn.addEventListener('click', () => {
        haptic();
        document.getElementById(btn.dataset.target)?.showModal();
    });
});
// Clicking the dark background (the dialog itself, outside its card) closes it too
document.querySelectorAll('dialog.srcOverlay').forEach(dialog => {
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
});

// ─── STICKY FOOTER: AUTO-HIDE + ALWAYS SHOW AT BOTTOM ───
let lastScrollY = window.scrollY;
const stickyFooter = document.getElementById('sticky-footer');
if (stickyFooter) {
    stickyFooter.querySelectorAll('.footer-nav a').forEach(link => {
        link.addEventListener('click', () => haptic());
    });
}
if (stickyFooter) window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    const scrollPosition = window.scrollY + window.innerHeight;
    const pageHeight = document.documentElement.scrollHeight;

    // Always show footer when near the bottom (within 50px)
    if (pageHeight - scrollPosition < 50) {
        stickyFooter.classList.remove('footer-hidden');
    }
    // Scrolling DOWN — hide footer
    else if (currentScrollY > lastScrollY && currentScrollY > 100) {
        stickyFooter.classList.add('footer-hidden');
    }
    // Scrolling UP — show footer
    else {
        stickyFooter.classList.remove('footer-hidden');
    }
    lastScrollY = currentScrollY;
});
// ─── DISCORD WIDGET (shared component: lounge section + home modal) ───
// Pulls live presence from the Discord widget API and renders it in-house.
// Falls back to a static join card if unreachable (adblock/shields, widget
// disabled, Discord down). Widgets with [data-autoload] populate on page
// load; others (the home modal) call window.populateDiscordWidget on open.
const DISCORD_GUILD_ID = '1026149685846605925';
const DISCORD_MAX_AVATARS = 12;

window.populateDiscordWidget = async function(widget) {
    if (!widget || widget.dataset.loaded) return;
    widget.dataset.loaded = '1';

    const nameEl = widget.querySelector('.discord-server-name');
    const countEl = widget.querySelector('.discord-count');
    const membersEl = widget.querySelector('.discord-members');
    const joinEl = widget.querySelector('.discord-join');
    if (!countEl || !membersEl) return; // markup without the live parts: leave the static card

    try {
        const res = await fetch(`https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`);
        if (!res.ok) throw new Error(`widget API ${res.status}`);
        const data = await res.json();

        if (data.name && nameEl) nameEl.textContent = data.name;
        if (data.instant_invite && joinEl) joinEl.href = data.instant_invite;

        const online = data.presence_count ?? (data.members ? data.members.length : 0);
        countEl.textContent = online === 0 ? 'quiet right now — be the first in'
            : online === 1 ? '1 member online now'
            : `${online} members online now`;

        // Avatar bubbles for whoever's on right now
        membersEl.textContent = '';
        (data.members || []).slice(0, DISCORD_MAX_AVATARS).forEach(member => {
            const bubble = document.createElement('span');
            bubble.className = 'discord-member';
            if (member.status === 'idle' || member.status === 'dnd') {
                bubble.classList.add(`status-${member.status}`);
            }

            const img = document.createElement('img');
            img.src = member.avatar_url;
            img.alt = member.username;
            img.loading = 'lazy';
            img.title = member.game ? `${member.username} — playing ${member.game.name}` : member.username;
            img.onerror = function() { bubble.remove(); };

            bubble.appendChild(img);
            membersEl.appendChild(bubble);
        });

        const extras = online - Math.min(online, DISCORD_MAX_AVATARS);
        if (extras > 0) {
            const more = document.createElement('span');
            more.className = 'discord-more';
            more.textContent = `+${extras} more`;
            membersEl.appendChild(more);
        }
    } catch (error) {
        // Static fallback — still sells the click
        widget.classList.add('discord-offline');
        countEl.textContent = "the chat's always open — tap in";
    }
};

window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.discord-widget[data-autoload]').forEach(w => window.populateDiscordWidget(w));
});

// 404 "Go Back": the CSP refuses javascript: URLs; without history the link just goes home.
const backLink = document.querySelector('[data-back]');
if (backLink && history.length > 1) backLink.addEventListener('click', (e) => { e.preventDefault(); history.back(); });
