// Night sky: one generated star field, two ways to put it on screen (proving ground: /lab/sky).
//   Sky.gl(el)      WebGL points: the whole sky is one draw call a frame; every star twinkles on its
//                   own and drifts smoothly between pixels; pointer and scroll parallax
//   Sky.layers(el)  box-shadow layers slid by CSS animations: no JavaScript per frame, but each
//                   layer is a texture two screens wide, and stars twinkle in two groups per depth
// Colors are tokens on .sky (--star-white/cool/warm/violet/glow), so a monthly theme is a token swap:
// layers follow it live, gl after refresh(). Both return { refresh(), stop() } or null if they can't run.
const Sky = (() => {
    // Per 1.3 megapixels of viewport (1440x900, a laptop at 125-150% zoom), scaled to the visitor's
    // screen; the old engine drew 170/55/20 at any size. Sizes, light and twinkle ranges are the old
    // engine's (radius in css px, rate in radians/s), plus 50 far stars for the band.
    // Depths keep one decimal: the drift wraps every 100 fields, which is seamless only then
    const DEPTHS = [
        { count: 220, radius: [0.25, 0.75], depth: 0.3, light: [0.2, 0.55], rate: [0.9, 1.6] },
        { count: 60, radius: [0.75, 1.4], depth: 0.7, light: [0.4, 0.8], rate: [1, 1.8] },
        { count: 20, radius: [1.4, 2.25], depth: 1.2, light: [0.6, 1], rate: [1.2, 2.1], glow: 1 },
    ];
    const TINTS = ['white', 'white', 'white', 'white', 'cool', 'cool', 'warm', 'violet'];
    const DRIFT = [0.024, 0.006];  // field widths/heights per second at depth 1 (the old engine's pace)
    const PARALLAX = 80;           // px of pointer parallax at depth 1, edge to edge
    const SCROLL = 0.06;           // stars shift this fraction of the page scroll, times depth
    const PAD = 60;                // the field runs this far past every edge, so no star pops in
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rand = (lo, hi) => lo + Math.random() * (hi - lo);

    // Positions are fractions of the field. A third of the far stars crowd a soft wavy band
    // (periodic across the field, so it has no seam when the field wraps around)
    function field() {
        const scale = Math.min(Math.max(innerWidth * innerHeight / 1.3e6, 0.5), 1.6);
        const stars = [];
        DEPTHS.forEach((d, i) => {
            for (let n = Math.round(d.count * scale); n > 0; n--) {
                const x = Math.random();
                const band = i === 0 && Math.random() < 0.35;
                const y = band ? (0.45 + 0.12 * Math.sin(x * 2 * Math.PI) + 0.07 * (Math.random() + Math.random() - 1) + 1) % 1
                    : Math.random();
                stars.push({ x, y, d, layer: i, r: rand(...d.radius), tint: TINTS[Math.floor(Math.random() * TINTS.length)],
                    phase: rand(0, 2 * Math.PI), rate: rand(...d.rate) });
            }
        });
        return stars;
    }

    // oklch token ("88% 0.06 250") to the gamma-encoded sRGB floats WebGL wants (CSS Color 4 matrices)
    function srgb(el, name) {
        const [L, C, H] = getComputedStyle(el).getPropertyValue(name).trim().split(/\s+/);
        const l0 = parseFloat(L) / (L.endsWith('%') ? 100 : 1), a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
        const l = (l0 + 0.3963377774 * a + 0.2158037573 * b) ** 3;
        const m = (l0 - 0.1055613458 * a - 0.0638541728 * b) ** 3;
        const s = (l0 - 0.0894841775 * a - 1.2914855480 * b) ** 3;
        return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s]
            .map((c) => Math.min(Math.max(c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055, 0), 1));
    }

    // Pointer position as -0.5..0.5 across the window, eased by whoever reads it
    const pointer = { x: 0, y: 0 };
    addEventListener('pointermove', (e) => {
        pointer.x = e.clientX / innerWidth - 0.5;
        pointer.y = e.clientY / innerHeight - 0.5;
    }, { passive: true });

    // A shooting star: one element streaking 20-40 degrees down, left or right, on the compositor.
    // Its head is the element's right end, so rotating it to the heading puts the tail behind
    function meteor(el) {
        const m = document.createElement('i');
        m.className = 'sky-meteor';
        const x = rand(0.15, 0.85) * el.clientWidth, y = rand(0.05, 0.4) * el.clientHeight;
        const heading = rand(20, 40) * Math.PI / 180, run = rand(250, 450), side = Math.random() < 0.5 ? 1 : -1;
        const dx = side * Math.cos(heading) * run, dy = Math.sin(heading) * run;
        const turn = `rotate(${Math.atan2(dy, dx)}rad)`;
        el.append(m);
        m.animate([
            { transform: `translate(${x}px, ${y}px) ${turn} scaleX(0.2)`, opacity: 0 },
            { opacity: 1, offset: 0.2 },
            { transform: `translate(${x + dx}px, ${y + dy}px) ${turn} scaleX(1)`, opacity: 0 },
        ], { duration: rand(700, 1100), easing: 'cubic-bezier(.3, 0, .8, .6)' }).finished.finally(() => m.remove());
    }
    // ...fired every 20-60 s while the tab is in view
    function meteors(el) {
        if (still) return () => {};
        let timer;
        const next = (wait) => { timer = setTimeout(() => { if (!document.hidden) meteor(el); next(rand(20e3, 60e3)); }, wait); };
        next(rand(4e3, 12e3));
        return () => clearTimeout(timer);
    }

    const VERTEX = `
        attribute vec2 a_pos;    // 0..1 across the field
        attribute vec4 a_star;   // radius (css px), depth, twinkle phase, twinkle rate
        attribute vec4 a_color;  // rgb, glow 0..1
        attribute vec2 a_light;  // dimmest, brightest
        uniform vec2 u_view;     // viewport, css px
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
    // moves smoothly between pixels
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

    function gl(el) {
        const canvas = document.createElement('canvas');
        canvas.className = 'sky-canvas';
        const g = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false,
            depth: false, stencil: false, powerPreference: 'low-power' });
        if (!g) return null;
        const stars = field();
        let program, at = {}, frame = 0, last = 0, time = 0, w = 0, h = 0;
        const eased = { x: 0, y: 0 }, drift = { x: 0, y: 0 };  // drift in fields, so a resize keeps every star's place

        function compile() {
            const shader = (type, src) => {
                const s = g.createShader(type);
                g.shaderSource(s, src);
                g.compileShader(s);
                return s;
            };
            program = g.createProgram();
            g.attachShader(program, shader(g.VERTEX_SHADER, VERTEX));
            g.attachShader(program, shader(g.FRAGMENT_SHADER, FRAGMENT));
            g.linkProgram(program);
            if (!g.getProgramParameter(program, g.LINK_STATUS)) return false;
            g.useProgram(program);
            for (const name of ['u_view', 'u_shift', 'u_time', 'u_dpr', 'u_max', 'u_glow']) at[name] = g.getUniformLocation(program, name);
            g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
            let offset = 0;
            for (const [name, size] of [['a_pos', 2], ['a_star', 4], ['a_color', 4], ['a_light', 2]]) {
                const loc = g.getAttribLocation(program, name);
                g.enableVertexAttribArray(loc);
                g.vertexAttribPointer(loc, size, g.FLOAT, false, 12 * 4, offset * 4);
                offset += size;
            }
            g.enable(g.BLEND);
            g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);  // premultiplied alpha
            g.uniform1f(at.u_max, g.getParameter(g.ALIASED_POINT_SIZE_RANGE)[1]);
            refresh();
            size();
            return true;
        }
        // Re-read the color tokens (a theme change) into the star buffer
        function refresh() {
            const tint = {};
            for (const t of new Set(TINTS)) tint[t] = srgb(el, `--star-${t}`);
            g.uniform3fv(at.u_glow, srgb(el, '--star-glow'));
            g.bufferData(g.ARRAY_BUFFER, new Float32Array(stars.flatMap((s) =>
                [s.x, s.y, s.r, s.d.depth, s.phase, s.rate, ...tint[s.tint], s.d.glow || 0, ...s.d.light])), g.STATIC_DRAW);
            if (still) draw();
        }
        // The drawing buffer matches the sky's box in device pixels (capped at 2x: past that, stars
        // only cost fill), so the canvas is never stretched
        function size() {
            w = el.clientWidth || innerWidth;
            h = el.clientHeight || innerHeight;
            const dpr = Math.min(devicePixelRatio || 1, 2);
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            g.viewport(0, 0, canvas.width, canvas.height);
            g.uniform2f(at.u_view, w, h);
            g.uniform1f(at.u_dpr, canvas.width / w);
            if (still) draw();
        }
        function draw() {
            g.uniform1f(at.u_time, time);
            g.uniform2f(at.u_shift, drift.x * (w + 2 * PAD) + eased.x * PARALLAX,
                drift.y * (h + 2 * PAD) + eased.y * PARALLAX - (still ? 0 : scrollY * SCROLL));
            g.clearColor(0, 0, 0, 0);
            g.clear(g.COLOR_BUFFER_BIT);
            g.drawArrays(g.POINTS, 0, stars.length);
        }
        // A hidden tab or a long hitch resumes where it left off instead of jumping ahead
        function tick(now) {
            const dt = Math.min(now - (last || now), 50) / 1000;
            last = now;
            time += dt;
            drift.x = (drift.x + DRIFT[0] * dt) % 100;
            drift.y = (drift.y + DRIFT[1] * dt) % 100;
            const k = 1 - Math.exp(-dt * 7.5);  // the old engine's 0.12 per 60 Hz frame, at any refresh rate
            eased.x += (pointer.x - eased.x) * k;
            eased.y += (pointer.y - eased.y) * k;
            draw();
            frame = requestAnimationFrame(tick);
        }

        if (!compile()) return null;
        el.append(canvas);
        const resized = new ResizeObserver(size);
        resized.observe(el);
        if (!still) frame = requestAnimationFrame(tick);
        // A GPU reset (driver update, sleep) drops the context: stop, then rebuild when it's back
        canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(frame); });
        canvas.addEventListener('webglcontextrestored', () => { if (compile() && !still) frame = requestAnimationFrame(tick); });
        const stopMeteors = meteors(el);
        return {
            refresh,
            stop() {
                cancelAnimationFrame(frame);
                resized.disconnect();
                stopMeteors();
                canvas.remove();
            },
        };
    }

    function layers(el) {
        const stars = field();
        const root = document.createElement('div');
        root.className = 'sky-layers';
        let pending = 0, resizeTimer;

        // Each depth is one element sliding a field-width left to right on a loop, holding two
        // twinkle groups at different rates (so their phases keep shifting); each group paints its
        // stars twice, one field-width apart, so the loop has no seam. Colors stay var()
        // references, so a token swap recolors them live
        function build() {
            const w = (el.clientWidth || innerWidth) + 2 * PAD, h = (el.clientHeight || innerHeight) + 2 * PAD;
            root.style.setProperty('--field', `${w}px`);
            root.replaceChildren(...DEPTHS.map((d, i) => {
                const depth = document.createElement('div');
                depth.className = 'sky-depth';
                depth.style.setProperty('--depth', d.depth);
                depth.style.setProperty('--loop', `${1 / (DRIFT[0] * d.depth)}s`);
                depth.append(...[0, 1].map((group) => {
                    const dots = document.createElement('i');
                    dots.className = 'sky-dots';
                    dots.style.setProperty('--dim', d.light[0]);
                    dots.style.setProperty('--bright', d.light[1]);
                    // one fade is half a twinkle: pi / (radians per second)
                    dots.style.setProperty('--rate', `${Math.PI / d.rate[group]}s`);
                    dots.style.boxShadow = stars.filter((s, n) => s.layer === i && n % 2 === group).flatMap((s) => {
                        const y = (s.y * h - PAD).toFixed(1), spread = Math.max(s.r - 0.5, 0).toFixed(2);
                        return [0, w].flatMap((copy) => {
                            const x = (s.x * w - PAD + copy).toFixed(1);
                            const dot = `${x}px ${y}px 0 ${spread}px oklch(var(--star-${s.tint}))`;
                            return d.glow ? [dot, `${x}px ${y}px ${(4 * s.r).toFixed(1)}px ${s.r.toFixed(1)}px oklch(var(--star-glow) / 0.35)`] : [dot];
                        });
                    }).join(',');
                    return dots;
                }));
                return depth;
            }));
        }
        // Pointer parallax is one custom-property write per frame at most; CSS eases it
        function onPointer() {
            pending ||= requestAnimationFrame(() => {
                pending = 0;
                root.style.setProperty('--mx', pointer.x.toFixed(3));
                root.style.setProperty('--my', pointer.y.toFixed(3));
            });
        }
        // The layers are sized to the sky's box: rebuild once it settles on a new size
        let built = '';
        const resized = new ResizeObserver(() => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (built !== (built = `${el.clientWidth}x${el.clientHeight}`)) build();
            }, built ? 200 : 0);
        });

        el.append(root);
        resized.observe(el);
        if (!still) addEventListener('pointermove', onPointer, { passive: true });
        const stopMeteors = meteors(el);
        return {
            refresh() {},
            stop() {
                removeEventListener('pointermove', onPointer);
                resized.disconnect();
                clearTimeout(resizeTimer);
                stopMeteors();
                root.remove();
            },
        };
    }

    return { gl, layers, meteor };
})();
