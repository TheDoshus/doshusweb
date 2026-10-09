#!/usr/bin/env bun
// bun run memes:convert — shrink memes into web formats without losing quality.
//   bun run memes:convert                encode + measure every meme not yet WebM/WebP, print a report
//   bun run memes:convert --apply        swap in each candidate that passed, regenerate meme-list.json
//   bun run memes:convert a.mp4 b.jpg    limit either run to these files
// A candidate wins only if it is smaller AND clears the quality bar; otherwise the original stays.
// Video: VP9 + Opus 96k, judged by VMAF. It climbs a CRF ladder (32, 36, 40) and keeps the first
// rung that is smaller while still clearing the bar, so already-lean files get a chance too
// (2026-10-03 on djraccooni: CRF 32 = VMAF 91.7 at 18% smaller; CRF 30 = 92.6 at 7%, CRF 34 = 90.7
// at 27%). Images: WebP q85 (animated for GIFs), judged by SSIM. Needs ffmpeg/ffprobe with libvpx-vp9, libopus, libwebp and libvmaf on PATH; HEIC also
// needs heif-convert (libheif). Encodes run one at a time: parallel ffmpeg gets OOM-killed on small
// machines. Candidates and scores are cached in node_modules/.cache/memes-convert, so --apply reuses
// them, and an unchanged meme is never re-encoded.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readdirSorted = require('./lib/readdir-sorted');

const ROOT = path.join(__dirname, '..');
const MEMES = path.join(ROOT, 'public', 'assets', 'memes');
const CACHE = path.join(ROOT, 'node_modules', '.cache', 'memes-convert');
const RESULTS = path.join(CACHE, 'results.json');
const QUALITY = { vmaf: 90, ssim: 0.97 }; // the bar a candidate must clear
const VIDEO = /\.(mp4|mov|mkv|avi)$/i;
const IMAGE = /\.(jpe?g|png|gif|heic)$/i;
const CRF_LADDER = [32, 36, 40];
const ENCODE = {
    video: (crf) => ['-map', '0:v:0', '-map', '0:a:0?', '-pix_fmt', 'yuv420p', '-c:v', 'libvpx-vp9', '-crf', `${crf}`,
        '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-c:a', 'libopus', '-b:a', '96k'],
    image: () => ['-c:v', 'libwebp', '-quality', '85', '-compression_level', '6'],
    gif: () => ['-c:v', 'libwebp_anim', '-quality', '85', '-compression_level', '6', '-loop', '0'],
};
const RECIPE = JSON.stringify([ENCODE.video(0), ENCODE.image(), CRF_LADDER, QUALITY]); // a changed recipe re-encodes everything
const APPLY = process.argv.includes('--apply');
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const run = (cmd, args, minutes = 30) =>
    spawnSync(cmd, args, { encoding: 'utf8', timeout: minutes * 60e3, maxBuffer: 256 << 20 });
const kb = (n) => `${Math.round(n / 1024)} KB`;
const lastLine = (text) => (text || '').trim().split('\n').pop() || 'no output';

// What this ffmpeg can do; a missing piece skips that kind of meme instead of guessing
const encoders = run('ffmpeg', ['-hide_banner', '-encoders']);
if (encoders.error) {
    console.log('ffmpeg not found on PATH. Install it (Firebase Studio: .idx/dev.nix has ffmpeg-full; rebuild the environment).');
    process.exit(1);
}
const can = {
    video: /libvpx-vp9/.test(encoders.stdout) && /libopus/.test(encoders.stdout),
    image: /\blibwebp\b/.test(encoders.stdout),
    gif: /libwebp_anim/.test(encoders.stdout),
    vmaf: /\blibvmaf\b/.test(run('ffmpeg', ['-hide_banner', '-filters']).stdout),
    heic: !run('heif-convert', ['--help'], 1).error,
};

// A JPEG's EXIF orientation (1 = upright). WebP output drops EXIF, so a phone photo that relies on
// the tag to stand upright would land sideways: those are left for a hand conversion.
function exifOrientation(file) {
    const d = fs.readFileSync(file);
    const i = d.indexOf('Exif\0\0');
    if (i < 0) return 1;
    const t = d.subarray(i + 6);
    const le = t.toString('latin1', 0, 2) === 'II';
    const u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
    const ifd = le ? t.readUInt32LE(4) : t.readUInt32BE(4);
    for (let k = 0, n = u16(ifd); k < n; k++) if (u16(ifd + 2 + 12 * k) === 0x112) return u16(ifd + 2 + 12 * k + 8);
    return 1;
}

function videoFrames(file) {
    const p = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets',
        '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', file]);
    return +p.stdout.trim() || null;
}
// VMAF pairs frames by timestamp; WebM's ms-rounded stamps mispair fast cuts unless both inputs
// are read at one fixed rate (-r 30), which pairs them frame by frame (handoff 2026-10-03)
function score(kind, candidate, reference) {
    const metric = kind === 'video'
        ? ['-r', '30', '-i', candidate, '-r', '30', '-i', reference, '-lavfi',
            '[0:v]format=yuv420p[d];[1:v]format=yuv420p[r];[d][r]libvmaf=n_threads=4']
        : ['-i', candidate, '-i', reference, '-lavfi', '[0:v]format=yuv444p[d];[1:v]format=yuv444p[r];[d][r]ssim'];
    const out = run('ffmpeg', ['-hide_banner', ...metric, '-f', 'null', '-']).stderr;
    const m = (kind === 'video' ? /VMAF score:?\s*([\d.]+)/ : /All:([\d.]+)/).exec(out);
    return m ? +m[1] : null;
}

function measure(name, src, size) {
    const kind = VIDEO.test(name) ? 'video' : /\.gif$/i.test(name) ? 'gif' : 'image';
    const outName = name.replace(/\.[^.]+$/, kind === 'video' ? '.webm' : '.webp');
    const candidate = path.join(CACHE, outName);
    if (fs.existsSync(path.join(MEMES, outName))) return { verdict: 'skip', note: `${outName} already exists` };
    if (!can[kind]) return { verdict: 'skip', note: `this ffmpeg can't encode ${kind}` };
    if (kind === 'video' && !can.vmaf) return { verdict: 'skip', note: 'no libvmaf: quality unmeasurable' };
    if (kind === 'image' && exifOrientation(src) > 1) return { verdict: 'skip', note: 'rotated phone photo (EXIF): convert by hand' };

    let input = src;
    // A real HEIC (ISO box 'ftyp' at byte 4) needs decoding to a lossless PNG first, since ffmpeg
    // can't read its tiles; a phone's JPEG saved as .heic just goes straight in
    if (/\.heic$/i.test(name) && fs.readFileSync(src).subarray(4, 8).toString() === 'ftyp') {
        if (!can.heic) return { verdict: 'skip', note: 'HEIC needs heif-convert (libheif)' };
        input = path.join(CACHE, `${name}.png`);
        const dec = run('heif-convert', [src, input], 5);
        if (dec.status !== 0) return { verdict: 'fail', note: lastLine(dec.stderr || dec.stdout) };
    }
    const bar = kind === 'video' ? QUALITY.vmaf : QUALITY.ssim;
    const metric = kind === 'video' ? 'VMAF' : 'SSIM';
    let result;
    for (const crf of kind === 'video' ? CRF_LADDER : [null]) {
        process.stdout.write(`  encoding ${name}${crf ? ` at CRF ${crf}` : ''} ... `);
        const enc = run('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', input, ...ENCODE[kind](crf), candidate]);
        if (enc.status !== 0 || !fs.existsSync(candidate)) {
            console.log('failed');
            return { verdict: 'fail', note: enc.error ? enc.error.message : lastLine(enc.stderr) };
        }
        const after = fs.statSync(candidate).size;
        const quality = score(kind === 'gif' ? 'image' : kind, candidate, input);
        const sameFrames = kind !== 'video' || videoFrames(candidate) === videoFrames(input);
        const verdict = quality === null ? 'keep: unmeasured'
            : !sameFrames ? 'keep: frame count changed'
            : quality < bar ? 'keep: quality'
            : after >= size ? 'keep: bigger'
            : 'convert';
        console.log(verdict);
        result = { verdict, candidate, outName, after, quality, metric, ...(crf && { note: `CRF ${crf}` }) };
        if (verdict !== 'keep: bigger') break; // a win, or quality already under the bar: higher CRF only gets worse
    }
    return result;
}

fs.mkdirSync(CACHE, { recursive: true });
let results = {};
try { results = JSON.parse(fs.readFileSync(RESULTS, 'utf8')); } catch { /* first run */ }
const files = readdirSorted(MEMES)
    .filter((f) => VIDEO.test(f) || IMAGE.test(f))
    .filter((f) => !ONLY.length || ONLY.includes(f));

console.log(`Checking ${files.length} meme(s) not yet WebM/WebP${can.vmaf ? '' : ' (no libvmaf: videos will be skipped)'}`);
const rows = files.map((name) => {
    const src = path.join(MEMES, name);
    const { size, mtimeMs } = fs.statSync(src);
    const key = `${size}-${Math.floor(mtimeMs)}-${RECIPE}`;
    const cached = results[name];
    // skips and failures are re-checked every run (the machine may have gained the missing tool)
    if (cached?.key !== key || /^(skip|fail)/.test(cached.verdict) || (cached.candidate && !fs.existsSync(cached.candidate))) {
        results[name] = { key, size, ...measure(name, src, size) };
        fs.writeFileSync(RESULTS, JSON.stringify(results, null, 2)); // saved per file: an interrupted run resumes
    }
    return [name, results[name]];
});

console.log(`\n${'meme'.padEnd(44)}${'before'.padStart(10)}${'after'.padStart(10)}${'saved'.padStart(7)}  quality       verdict`);
for (const [name, r] of rows) {
    const saved = r.after ? `${Math.round((1 - r.after / r.size) * 100)}%` : '';
    const q = r.quality != null ? `${r.metric} ${r.metric === 'VMAF' ? r.quality.toFixed(1) : r.quality.toFixed(3)}` : '';
    console.log(`${name.slice(0, 43).padEnd(44)}${kb(r.size).padStart(10)}${(r.after ? kb(r.after) : '').padStart(10)}${saved.padStart(7)}  ${q.padEnd(14)}${r.verdict}${r.note ? ` (${r.note})` : ''}`);
}
const wins = rows.filter(([, r]) => r.verdict === 'convert');
const saving = wins.reduce((s, [, r]) => s + r.size - r.after, 0);
console.log(`\n${wins.length} of ${rows.length} pass the bar (VMAF >= ${QUALITY.vmaf}, SSIM >= ${QUALITY.ssim}), saving ${kb(saving)}.`);

if (!APPLY) {
    if (wins.length) console.log(`Candidates to eyeball: ${path.relative(ROOT, CACHE)}/. Swap them in with: bun run memes:convert --apply`);
    process.exit(0);
}
for (const [name, r] of wins) {
    fs.copyFileSync(r.candidate, path.join(MEMES, r.outName));
    fs.unlinkSync(path.join(MEMES, name)); // the original stays in git history
    delete results[name];
    console.log(`converted ${name} -> ${r.outName}`);
}
fs.writeFileSync(RESULTS, JSON.stringify(results, null, 2));
const list = run(process.execPath, [path.join(__dirname, 'generate-meme-list.js')], 1);
console.log(list.status === 0 ? 'meme-list.json regenerated. Review, then commit the swapped files and the list.' : `meme list failed: ${lastLine(list.stderr)}`);
