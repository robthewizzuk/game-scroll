#!/usr/bin/env node
// Skin fit: a real face's colouring, part by part, measured off a real head scan's colour picture as numbers (human-fit.js SKIN_DATA).
//
//   node scripts/skin-fit.mjs [show=out.png] [write]
//
// The scan is the head fit's (scripts/head-fit.mjs: scripts/face-lab/ref/LeePerrySmith.glb and its colour picture Map-COL.jpg beside it,
// CC BY 3.0, never committed). The head fit lays it over our head; here each bit of its skin is put where it would be on a real face's
// picture (human-paint.js faceUV, the half face from in front), and its colour measured beside the plain skin of its forehead and cheeks:
// how much redder and how much bluer than that each part is, each against its green, so the light and shade the photo took in with the
// colour are left out (the renderer makes its own: a lighter or darker table had come out as the photo's shading, a shine on the tip of
// the nose and a shadow beside it, over our own); and how speckled it is over a few millimetres (pores, small vessels). Left out, and filled
// in from round about: what a face's paint draws by itself (the brows, the lips, the line of the lashes), the nostrils, and a man's beard
// (a woman's face, or a shaven man's, would otherwise wear its shadow). Both halves of the scan go into the one half of the table.
// `write` puts the table into src/kit/models/human-fit.js; `show` draws the three numbers as pictures. Needs python3 with PIL to read the jpg.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2), opt = Object.fromEntries(args.filter(a => a.includes('=')).map(a => a.split('='))), write = args.includes('write');
const REF = path.join(ROOT, 'scripts/face-lab/ref'), PIC = path.join(REF, 'Map-COL.jpg');
if (!fs.existsSync(PIC)) { console.error('no colour picture at ' + PIC + ' (see scripts/head-fit.mjs)'); process.exit(1); }
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'skin-fit-'));

// ---- the scan laid over our head (metres about the middle of our head), with where each point is on its colour picture
execFileSync(process.execPath, [path.join(ROOT, 'scripts/head-fit.mjs'), path.join(tmp, 'fit.png'), 'colour=' + path.join(tmp, 'scan.json')], { stdio: 'ignore' });
const scan = JSON.parse(fs.readFileSync(path.join(tmp, 'scan.json'), 'utf8'));
// ---- its colour picture, as light (not sRGB)
const raw = execFileSync('python3', ['-c', 'import sys; from PIL import Image; im = Image.open(sys.argv[1]).convert("RGB"); sys.stdout.write("%d %d\\n" % im.size); sys.stdout.flush(); sys.stdout.buffer.write(im.tobytes())', PIC], { maxBuffer: 1 << 28 });
const nl = raw.indexOf(10), [PW, PH] = raw.subarray(0, nl).toString().split(' ').map(Number), px = raw.subarray(nl + 1);
const lin = b => { const s = b / 255; return s <= .04045 ? s / 12.92 : Math.pow((s + .055) / 1.055, 2.4); }, LIN = Float32Array.from({ length: 256 }, (_, b) => lin(b));
const colourAt = (u, v, out) => {   // (bilinear; the picture's rows run down from v = 1)
  const x = u * PW - .5, y = (1 - v) * PH - .5, x0 = Math.max(0, Math.min(PW - 2, Math.floor(x))), y0 = Math.max(0, Math.min(PH - 2, Math.floor(y))), fx = Math.min(1, Math.max(0, x - x0)), fy = Math.min(1, Math.max(0, y - y0));
  for (let c = 0; c < 3; c++) { const a = LIN[px[(y0 * PW + x0) * 3 + c]], b = LIN[px[(y0 * PW + x0 + 1) * 3 + c]], d = LIN[px[((y0 + 1) * PW + x0) * 3 + c]], e = LIN[px[((y0 + 1) * PW + x0 + 1) * 3 + c]]; out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy; }
  return out;
};

const { FACE_REAL, browAt } = await import(path.join(ROOT, 'src/kit/models/human-paint.js'));
const { browOf, rimOf, mouthAt, beardArea, EYE, HC } = await import(path.join(ROOT, 'src/kit/models/human-head.js'));
const { SKIN_N } = await import(path.join(ROOT, 'src/kit/models/human-fit.js'));
const L = FACE_REAL, f = { jaw: 1, chin: 1, brow: .82, nose: 1, lips: 1.12, cheeks: 1, eyes: 1, soft: 0, real: 1, es: 1, age: 35, fat: .5, asym: 0, aseed: 0, noseW: 1, bridge: 1, tip: 0, tilt: 0, lidFold: .35, faceW: 1, ears: 1 };

// ---- the scan's skin on the picture of a face: each half-millimetre dot the colour of the frontmost bit of the scan that lands there
const W = 160, H = Math.round((L.y1 - L.y0) / (L.x1 / W)), col = new Float32Array(W * H * 3).fill(NaN), dep = new Float32Array(W * H).fill(-Infinity);
const at = (x, hy, hz) => [(Math.abs(x) + 6 * Math.max(0, L.z0 - hz)) / L.x1 * W, (hy - L.y0) / (L.y1 - L.y0) * H];
{
  const P = scan.P, UV = scan.UV, I = scan.I, c3 = [0, 0, 0];
  for (let t = 0; t < I.length; t += 3) {
    const v = [I[t], I[t + 1], I[t + 2]], q = v.map(i => at(P[i * 3], P[i * 3 + 1], P[i * 3 + 2])), z = v.map(i => P[i * 3 + 2]);
    if (z.some(zz => zz < 0) || v.some(i => Math.sign(P[i * 3]) !== Math.sign(P[v[0] * 3]) && Math.abs(P[i * 3]) > .002)) continue;   // (the front only; a triangle across the middle is taken from one side)
    const area = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[2][0] - q[0][0]) * (q[1][1] - q[0][1]); if (Math.abs(area) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(...q.map(p => p[0])))), x1 = Math.min(W - 1, Math.ceil(Math.max(...q.map(p => p[0])))), y0 = Math.max(0, Math.floor(Math.min(...q.map(p => p[1])))), y1 = Math.min(H - 1, Math.ceil(Math.max(...q.map(p => p[1]))));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const sx = x + .5, sy = y + .5, w0 = ((q[1][0] - sx) * (q[2][1] - sy) - (q[2][0] - sx) * (q[1][1] - sy)) / area, w1 = ((q[2][0] - sx) * (q[0][1] - sy) - (q[0][0] - sx) * (q[2][1] - sy)) / area, w2 = 1 - w0 - w1;
      if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
      const d = w0 * z[0] + w1 * z[1] + w2 * z[2], j = y * W + x; if (d <= dep[j]) continue; dep[j] = d;
      colourAt(w0 * UV[v[0] * 2] + w1 * UV[v[1] * 2] + w2 * UV[v[2] * 2], w0 * UV[v[0] * 2 + 1] + w1 * UV[v[1] * 2 + 1] + w2 * UV[v[2] * 2 + 1], c3);
      col.set(c3, j * 3);
    }
  }
}
// ---- its plain skin: the middle of the forehead and the cheeks
const lum = (r, g, b) => .2126 * r + .7152 * g + .0722 * b, xOf = i => (i + .5) / W * L.x1, hyOf = j => L.y0 + (j + .5) / H * (L.y1 - L.y0);
const plain = [[], [], []];
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const x = xOf(i), hy = hyOf(j), k = (j * W + i) * 3; if (!(col[k] >= 0)) continue;
  if ((x < .025 && hy > .045 && hy < .07) || (x > .036 && x < .052 && hy > -.045 && hy < -.022)) for (let c = 0; c < 3; c++) plain[c].push(col[k + c]);
}
const med = a => { const s = Float64Array.from(a).sort(); return s.length ? s[s.length >> 1] : NaN; }, REFC = plain.map(med), REFL = lum(...REFC);
console.log('plain skin (light)', REFC.map(v => +v.toFixed(4)).join(' '), 'from', plain[0].length, 'dots');

// ---- what is left out: the brows, the lashes' line, the lips, the nostrils, a beard, and anything far darker than the skin
const B = browOf(0), rim = rimOf(f), m3 = [0, 0, 0], b2 = [0, 0], sp = { face: f, beard: .6, moustache: true };
const out = (x, hy) => {
  for (const dx of [-.003, 0, .003]) for (const dy of [-.0025, 0, .0025]) if (hy + dy > .008 && hy + dy < .04 && browAt(x + dx, hy + dy, B, false, true) > 0) return true;
  if (Math.abs(hy - EYE[1]) < .02) { const q = rim(x, hy); if (q[0] < .0018) return true; }
  for (const dx of [-.0015, 0, .0015]) for (const dy of [-.0015, 0, .0015]) { if (hy + dy < -.045 && hy + dy > -.092 && x + dx < .034 && x + dx > -.034) { const m = mouthAt(Math.abs(x + dx), hy + dy, f, m3); if (m[1] > 0 || m[2] > .02) return true; } }
  beardArea(sp, x, hy, .095 - 6 * x * x, b2); if (Math.max(b2[0], b2[1]) > .35) return true;
  return false;
};
// the numbers a dot: how much redder and how much bluer than the plain skin, against its green, and how light (log2)
const NC = 3, N3 = new Float32Array(W * H * NC).fill(NaN);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const k = (j * W + i) * 3, r = col[k], g = col[k + 1], b = col[k + 2], x = xOf(i), hy = hyOf(j), n = (j * W + i) * NC; if (!(r >= 0) || !(g > 1e-4)) continue;
  if (lum(r, g, b) < .6 * REFL || out(x, hy)) continue;
  N3[n] = Math.log2(r / g / (REFC[0] / REFC[1])); N3[n + 1] = Math.log2(b / g / (REFC[2] / REFC[1])); N3[n + 2] = Math.log2(lum(r, g, b) / REFL);
}

// ---- into cells (SKIN_N: across, down), each the middle value of its dots if enough of them were measured; then the rest filled in
const [CW, CH] = SKIN_N, T = new Float32Array(CW * CH * NC).fill(NaN), known = new Uint8Array(CW * CH);
for (let cj = 0; cj < CH; cj++) for (let ci = 0; ci < CW; ci++) {
  const vals = [[], [], []], i0 = Math.floor(ci * W / CW), i1 = Math.floor((ci + 1) * W / CW), j0 = Math.floor(cj * H / CH), j1 = Math.floor((cj + 1) * H / CH);
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const k = (j * W + i) * NC; if (N3[k] === N3[k]) for (let c = 0; c < NC; c++) vals[c].push(N3[k + c]); }
  if (vals[0].length >= .3 * (i1 - i0) * (j1 - j0)) {
    for (let c = 0; c < 2; c++) T[(cj * CW + ci) * NC + c] = med(vals[c]);
    // (how speckled the skin is there: how far its dots' lightness strays from the cell's own, the middle of those strays, as a spread: the
    // pores, the fine red of small vessels, freckles; the photo's broad light and shade change too little across 3 mm to count)
    const m = med(vals[2]); T[(cj * CW + ci) * NC + 2] = 1.48 * med(vals[2].map(v => Math.abs(v - m)));
    known[cj * CW + ci] = 1;
  }
}
// (filled as a soap film would be, from the cells round about; the picture's edges, which nothing lands on, keep to the plain skin)
for (let c = 0; c < NC; c++) for (let n = 0; n < CW * CH; n++) if (!known[n]) T[n * NC + c] = 0;
for (let it = 0; it < 1500; it++) for (let cj = 0; cj < CH; cj++) for (let ci = 0; ci < CW; ci++) {
  const n = cj * CW + ci; if (known[n]) continue;
  for (let c = 0; c < NC; c++) { let s = 0, w = 0; for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const ii = ci + a, jj = cj + b; if (ii < 0 || jj < 0 || jj >= CH) continue; if (ii >= CW) { w++; continue; } s += T[(jj * CW + ii) * NC + c]; w++; } T[n * NC + c] = s / w; }
}
// (a cell's worth of softening: no edge between cells; the middle line mirrored, the face's other half)
const blur = (A, c, r) => { const o = new Float32Array(CW * CH); for (let cj = 0; cj < CH; cj++) for (let ci = 0; ci < CW; ci++) { let s = 0, w = 0; for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) { const ii = Math.min(CW - 1, ci + a < 0 ? -1 - (ci + a) : ci + a), jj = Math.max(0, Math.min(CH - 1, cj + b)), q = Math.exp(-(a * a + b * b) / (r * r / 2)); s += q * A[(jj * CW + ii) * NC + c]; w += q; } o[cj * CW + ci] = s / w; } return o; };
for (let c = 0; c < NC; c++) { const s = blur(T, c, 1); for (let n = 0; n < CW * CH; n++) T[n * NC + c] = s[n]; }

// ---- as signed bytes of SKIN_MAX / 127 a step, base64
const { SKIN_MAX } = await import(path.join(ROOT, 'src/kit/models/human-fit.js'));
const bytes = new Uint8Array(CW * CH * NC); let most = 0;
for (let n = 0; n < CW * CH * NC; n++) { most = Math.max(most, Math.abs(T[n])); bytes[n] = Math.max(-127, Math.min(127, Math.round(T[n] / SKIN_MAX * 127))) & 255; }
const b64 = Buffer.from(bytes).toString('base64');
console.log('cells', CW, 'x', CH, '; largest', most.toFixed(3), 'of', SKIN_MAX, '; measured', known.reduce((a, b) => a + b, 0), 'of', CW * CH);
if (write) {
  const file = path.join(ROOT, 'src/kit/models/human-fit.js'), src = fs.readFileSync(file, 'utf8'), re = /export const SKIN_DATA = '[^']*';/;
  if (!re.test(src)) { console.error('no SKIN_DATA in ' + file); process.exit(1); }
  fs.writeFileSync(file, src.replace(re, `export const SKIN_DATA = '${b64}';`)); console.log('wrote SKIN_DATA into ' + path.relative(ROOT, file));
}

// ---- show=out.png: the three numbers as pictures (red: redder, blue: bluer, white: speckled), beside the scan's skin as measured
if (opt.show) {
  const S = 4, GW = CW * S, pw = GW * 4 + 30, ph = CH * S, img = new Uint8Array(pw * ph * 3).fill(255);
  const put = (x, y, rgb) => { if (x < 0 || y < 0 || x >= pw || y >= ph) return; img.set(rgb.map(v => Math.max(0, Math.min(255, Math.round(v)))), (y * pw + x) * 3); };
  for (let y = 0; y < ph; y++) for (let x = 0; x < GW; x++) {
    const i = Math.floor(x / GW * W), j = H - 1 - Math.floor(y / ph * H), k = (j * W + i) * 3, s = v => 255 * (v <= .0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - .055);
    put(x, y, col[k] >= 0 ? [s(col[k]), s(col[k + 1]), s(col[k + 2])] : [200, 200, 200]);
    const cj = CH - 1 - Math.floor(y / S), ci = Math.floor(x / S), n = (cj * CW + ci) * NC, g = v => 128 + v / SKIN_MAX * 127;
    put(x + GW + 10, y, [g(T[n]), 128, 128]); put(x + 2 * GW + 20, y, [128, 128, g(T[n + 1])]); put(x + 3 * GW + 30 - 1, y, [g(T[n + 2]), g(T[n + 2]), g(T[n + 2])]);
  }
  const png = (w, h, rgb) => {
    const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
    const rows = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { rows[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(rows, y * (w * 3 + 1) + 1); }
    const hd = Buffer.alloc(13); hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = 8; hd[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', hd), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
  };
  fs.writeFileSync(opt.show, png(pw, ph, img)); console.log('saved ' + opt.show);
}
fs.rmSync(tmp, { recursive: true, force: true });
