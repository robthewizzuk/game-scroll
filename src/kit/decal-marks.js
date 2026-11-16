// gs.hd.mark(kind, o): ready-made pictures for v.decal(), painted in code: the signs, stencils, stains and damage
// that make a place look used (a warning sign on a door, a number stencilled on a container, rust running from a
// bolt, a damp stain under a sill, oil on the floor, a scorch from a blast, a crack, a made-up company's badge).
//   v.decal(mesh, hit.point, hit.normal, gs.hd.mark('rust', { size: .8 }))
// Each comes with its own size, which way up it goes (signs, text and runs upright, stains turned at random) and a
// distress pass (worn through in patches, broken at the edges, a little grime), so no two look new. Every mark is
// a 128 x 128 picture (the WebGPU decal grid's square), stretched over its size: wide marks paint for that.
// distress(c, s, o) wears any picture you painted yourself the same way.
// (decal-marks.js; marks.js is the ground marks kit.) Kit use: hd3d.js exports these as gs.hd.mark, gs.hd.marks and gs.hd.distress.

// a small seeded value noise for the wear: smooth, two octaves, no repeat that shows on a 128 picture
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, s) => vnoise(x, y, s) * .55 + vnoise(x * 2.3, y * 2.3, s + 7) * .3 + vnoise(x * 5.1, y * 5.1, s + 13) * .15;
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rng(seed) { let s = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1; const next = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; for (let i = 0; i < 8; i++) next(); return next; }

/**
 * Wears a painted picture (s x s, on canvas context c) in place: worn through in patches (amount 0..1), its edges
 * broken up, and darker grime in its low parts (grime 0..1). seed: another pattern.
 */
export function distress(c, s, { amount = .4, grime = .25, seed = 1, scale = 1 } = {}) {
  if (amount <= 0 && grime <= 0) return;
  const img = c.getImageData(0, 0, s, s), d = img.data, k = 6 / s * scale;
  for (let y = 0, i = 0; y < s; y++) for (let x = 0; x < s; x++, i += 4) {
    if (d[i + 3] === 0) continue;
    const n = fbm(x * k, y * k, seed), fine = vnoise(x * k * 9, y * k * 9, seed + 31);
    // worn through: patches where the noise is low, more as amount grows, with a ragged rim from the fine noise
    const keep = sm(amount * .75 - .08, amount * .75 + .06, n + (fine - .5) * .22);
    d[i + 3] = d[i + 3] * keep;
    // grime: darker towards the bottom and in the noise's hollows
    const g = grime * (.35 + .65 * y / s) * (1 - n) * 1.3, dk = 1 - Math.min(.6, g);
    d[i] *= dk; d[i + 1] *= dk * .98; d[i + 2] *= dk * .95;
  }
  c.putImageData(img, 0, 0);
}

// spray paint: soft overspray round what was drawn, then the hard paint
function sprayed(c, s, draw, colour, soft = .02) {
  c.save(); c.fillStyle = c.strokeStyle = colour; c.shadowColor = colour; c.shadowBlur = s * soft * 2; draw(); c.restore();
  c.save(); c.fillStyle = c.strokeStyle = colour; draw(); c.restore();
}
// a stencil: the text cut with the bridges a real stencil leaves (thin gaps through each letter)
function stencilText(c, s, text, colour, aspect, rand) {
  const n = Math.max(1, text.length), fs = Math.min(s * .8, s / n * 1.5 * aspect) ;
  c.save(); c.scale(1 / aspect, 1);   // painted at its real width, squeezed into the square (stretched back over the decal)
  const W = s * aspect;
  c.font = `900 ${fs}px Impact, 'Arial Black', sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  sprayed(c, s, () => c.fillText(text, W / 2, s / 2 + fs * .04), colour, .015);
  // bridges: cut through each letter's middle, slightly off upright
  c.globalCompositeOperation = 'destination-out';
  const tw = c.measureText(text).width, x0 = W / 2 - tw / 2, step = tw / n;
  for (let i = 0; i < n; i++) { const bx = x0 + step * (i + .5) + (rand() - .5) * step * .12; c.fillRect(bx - fs * .035, s / 2 - fs * .6, fs * .07, fs * 1.2); }
  c.restore();
}
// drips running down from spots along y (paint or rust)
function drips(c, s, colour, n, y0, len, width, rand) {
  c.save(); c.strokeStyle = colour; c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = s * (.15 + rand() * .7), l = s * len * (.3 + rand() * .7), w = s * width * (.5 + rand());
    const g = c.createLinearGradient(0, y0, 0, y0 + l); g.addColorStop(0, colour); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.strokeStyle = g; c.lineWidth = w; c.beginPath(); c.moveTo(x, y0); c.lineTo(x + (rand() - .5) * w, y0 + l); c.stroke();
  }
  c.restore();
}
const radial = (c, x, y, r, stops) => { const g = c.createRadialGradient(x, y, 0, x, y, r); for (const [t, col] of stops) g.addColorStop(t, col); return g; };

const NAMES1 = ['Kor', 'Vel', 'Tam', 'Bre', 'Osk', 'Mar', 'Dun', 'Hal', 'Fen', 'Rul', 'Sab', 'Gor'], NAMES2 = ['ex', 'ton', 'ida', 'mar', 'co', 'ville', 'tek', 'line', 'ar', 'os'];
const WORDS = { '!': 'DANGER', bolt: 'HIGH VOLTAGE', flame: 'FLAMMABLE', drop: 'CORROSIVE', fall: 'MIND THE STEP' };

// Each kind: (c, s, o, rand) paints it; and how it lies by default
const KINDS = {
  // a warning sign: yellow triangle with a black rim and a symbol ('!', 'bolt', 'flame', 'drop'); word: true adds a plate with the warning under it
  hazard: { size: [.4, .4], upright: true, wear: .25, paint(c, s, o) {
    const sym = o.sign || '!', word = o.word ? (typeof o.word === 'string' ? o.word : WORDS[sym] || 'DANGER') : null, top = word ? .06 : .1, bot = word ? .7 : .9;
    const h = (bot - top) * s, cx = s / 2;
    c.lineJoin = 'round'; c.fillStyle = o.colour || '#f2c21b'; c.strokeStyle = '#141414'; c.lineWidth = s * .05;
    c.beginPath(); c.moveTo(cx, top * s); c.lineTo(cx + h * .58, bot * s); c.lineTo(cx - h * .58, bot * s); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#141414'; const my = top * s + h * .62, r = h * .2;
    if (sym === 'bolt') { c.beginPath(); c.moveTo(cx + r * .3, my - r * 1.4); c.lineTo(cx - r * .5, my + r * .1); c.lineTo(cx + r * .05, my + r * .1); c.lineTo(cx - r * .3, my + r * 1.4); c.lineTo(cx + r * .55, my - r * .2); c.lineTo(cx, my - r * .2); c.closePath(); c.fill(); }
    else if (sym === 'flame') { c.beginPath(); c.moveTo(cx, my - r * 1.4); c.bezierCurveTo(cx + r * 1.2, my - r * .3, cx + r * .9, my + r, cx, my + r); c.bezierCurveTo(cx - r * .9, my + r, cx - r * 1.1, my, cx - r * .2, my - r * .6); c.bezierCurveTo(cx - r * .2, my - r * .1, cx + r * .1, my, cx, my - r * 1.4); c.fill(); }
    else if (sym === 'drop') { c.beginPath(); c.moveTo(cx, my - r * 1.3); c.bezierCurveTo(cx + r, my, cx + r * .8, my + r, cx, my + r); c.bezierCurveTo(cx - r * .8, my + r, cx - r, my, cx, my - r * 1.3); c.fill(); }
    else { c.fillRect(cx - r * .2, my - r * 1.3, r * .4, r * 1.6); c.beginPath(); c.arc(cx, my + r * .75, r * .24, 0, 7); c.fill(); }
    if (word) { c.fillStyle = '#f4f1e8'; c.fillRect(s * .08, s * .76, s * .84, s * .2); c.fillStyle = '#141414'; c.font = `bold ${s * .1}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(word.slice(0, 14), cx, s * .865, s * .8); }
  } },
  // stencilled text sprayed on (a container's number, a bay letter, a warning): text, colour; wide marks get a wider size
  stencil: { size: t => [Math.max(.3, (t.length || 1) * .22), .3], upright: true, wear: .35, paint(c, s, o, rand, aspect) {
    stencilText(c, s, String(o.text ?? 'A-7').toUpperCase(), o.colour || '#e8e2d2', aspect, rand);
    if (o.drips !== false) drips(c, s, o.colour || '#e8e2d2', 2 + Math.floor(rand() * 3), s * .72, .25, .012, rand);
  } },
  // a big number or letter for a bay, a dock door, a floor zone
  number: { size: [.5, .5], upright: true, wear: .35, paint(c, s, o, rand) { stencilText(c, s, String(o.text ?? (1 + Math.floor(rand() * 9))), o.colour || '#e8e2d2', 1, rand); } },
  // caution stripes: diagonal bands (a kerb, a beam, a forklift lane's end)
  stripes: { size: [1.2, .2], upright: true, wear: .45, paint(c, s, o, rand, aspect) {
    c.save(); c.scale(1 / aspect, 1); const W = s * aspect, band = s * .45;
    c.fillStyle = o.colour || '#e8b81a'; c.fillRect(0, 0, W, s); c.fillStyle = o.dark || '#161616';
    for (let x = -s; x < W + s; x += band * 2) { c.beginPath(); c.moveTo(x, s); c.lineTo(x + band, s); c.lineTo(x + band + s, 0); c.lineTo(x + s, 0); c.closePath(); c.fill(); }
    c.restore();
  } },
  // a painted floor arrow
  arrow: { size: [.5, .9], upright: true, wear: .5, paint(c, s, o) {
    c.fillStyle = o.colour || '#ece6d6'; c.beginPath(); const cx = s / 2;
    c.moveTo(cx, s * .04); c.lineTo(s * .92, s * .42); c.lineTo(s * .64, s * .42); c.lineTo(s * .64, s * .96); c.lineTo(s * .36, s * .96); c.lineTo(s * .36, s * .42); c.lineTo(s * .08, s * .42); c.closePath(); c.fill();
  } },
  // a made-up company's badge: a ring or a hexagon with its name (text, or one made from the seed)
  logo: { size: [.5, .5], upright: true, wear: .3, paint(c, s, o, rand) {
    const name = String(o.text ?? (NAMES1[Math.floor(rand() * NAMES1.length)] + NAMES2[Math.floor(rand() * NAMES2.length)])).toUpperCase(), col = o.colour || ['#c0392b', '#1f5fa8', '#2e7d4f', '#d17a12'][Math.floor(rand() * 4)];
    const cx = s / 2, cy = s * .4, r = s * .3, hex = rand() < .5;
    c.fillStyle = col; c.beginPath();
    if (hex) for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); } else c.arc(cx, cy, r, 0, 7);
    c.closePath(); c.fill();
    c.fillStyle = '#f5f2ea'; c.font = `900 ${r}px 'Arial Black', sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(name[0], cx, cy + r * .06);
    c.fillStyle = col; c.font = `bold ${s * .12}px sans-serif`; c.fillText(name, cx, s * .86, s * .94);
  } },
  // a dark streak running down from a ledge or a sill (rain water and dirt)
  grime: { size: [.5, 1.2], upright: true, wear: 0, paint(c, s, o, rand) {
    const col = o.colour || '#1c1a16';
    for (let i = 0; i < 14; i++) {
      const x = s * (.2 + rand() * .6), w = s * (.05 + rand() * .12), l = s * (.4 + rand() * .6);
      const g = c.createLinearGradient(0, 0, 0, l); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = .12 + rand() * .14; c.fillStyle = g; c.fillRect(x - w / 2, 0, w, l);
    }
    c.globalAlpha = 1;
  } },
  // rust running down from a bolt, a seam or a hole near the top
  rust: { size: [.35, .9], upright: true, wear: 0, paint(c, s, o, rand) {
    const col = o.colour || '#7a3412', y0 = s * .08;
    c.fillStyle = radial(c, s / 2, y0, s * .12, [[0, '#3b1606'], [.5, col], [1, 'rgba(122,52,18,0)']]); c.fillRect(0, 0, s, s * .3);
    for (let i = 0; i < 9; i++) {
      const x = s * (.38 + rand() * .24), w = s * (.03 + rand() * .07), l = s * (.35 + rand() * .62);
      const g = c.createLinearGradient(0, y0, 0, y0 + l); g.addColorStop(0, col); g.addColorStop(.6, 'rgba(140,64,22,.5)'); g.addColorStop(1, 'rgba(140,64,22,0)');
      c.globalAlpha = .35 + rand() * .4; c.fillStyle = g; c.beginPath(); c.moveTo(x - w / 2, y0); c.lineTo(x + w / 2, y0); c.lineTo(x + w * .2 + (rand() - .5) * w, y0 + l); c.lineTo(x - w * .2, y0 + l); c.fill();
    }
    c.globalAlpha = 1;
  } },
  // a damp patch: dark, darker at its rim where it dried (a leak, a spill that soaked in)
  leak: { size: [.8, .8], upright: false, wear: 0, paint(c, s, o, rand) {
    const col = o.colour || '#141310';
    c.globalAlpha = .45; c.fillStyle = radial(c, s / 2, s / 2, s * .48, [[0, col], [.75, col], [.9, 'rgba(20,19,16,.6)'], [1, 'rgba(20,19,16,0)']]);
    c.beginPath(); for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, r = s * (.3 + fbm(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + 5, 3) * .2); c[i ? 'lineTo' : 'moveTo'](s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r); }
    c.fill(); c.globalAlpha = 1; void rand;
  } },
  // an oil stain on a floor: a dark middle and lighter rings where it spread
  oil: { size: [.7, .7], upright: false, wear: 0, rough: .25, paint(c, s, o, rand) {
    const col = o.colour || '#0d0c0b';
    for (let k = 0; k < 3; k++) {
      const x = s * (.4 + rand() * .2), y = s * (.4 + rand() * .2), r = s * (.18 + rand() * .2);
      c.fillStyle = radial(c, x, y, r, [[0, col], [.6, 'rgba(13,12,11,.8)'], [.85, 'rgba(13,12,11,.35)'], [1, 'rgba(13,12,11,0)']]); c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    }
  } },
  // a scorch from a blast or a fire: black middle, soot thrown out in spikes
  scorch: { size: [1, 1], upright: false, wear: .1, paint(c, s, o, rand) {
    const col = o.colour || '#080706';
    c.fillStyle = radial(c, s / 2, s / 2, s * .32, [[0, col], [.5, 'rgba(8,7,6,.85)'], [1, 'rgba(8,7,6,0)']]); c.fillRect(0, 0, s, s);
    c.strokeStyle = 'rgba(8,7,6,.35)'; c.lineCap = 'round';
    for (let i = 0; i < 26; i++) { const a = rand() * Math.PI * 2, r0 = s * .15, r1 = s * (.3 + rand() * .2); c.lineWidth = s * (.01 + rand() * .03); c.beginPath(); c.moveTo(s / 2 + Math.cos(a) * r0, s / 2 + Math.sin(a) * r0); c.lineTo(s / 2 + Math.cos(a) * r1, s / 2 + Math.sin(a) * r1); c.stroke(); }
  } },
  // a crack in concrete or plaster: a jagged line that branches
  crack: { size: [.9, .9], upright: false, wear: 0, paint(c, s, o, rand) {
    c.strokeStyle = o.colour || '#141210'; c.lineCap = 'round'; c.lineJoin = 'round';
    const run = (x, y, a, len, w, depth) => {
      c.lineWidth = w; c.beginPath(); c.moveTo(x, y);
      for (let i = 0; i < 8; i++) { a += (rand() - .5) * .9; x += Math.cos(a) * len / 8; y += Math.sin(a) * len / 8; c.lineTo(x, y); if (depth < 2 && rand() < .25) { const bx = x, by = y; c.stroke(); run(bx, by, a + (rand() < .5 ? -1 : 1) * (.5 + rand() * .6), len * .45, w * .6, depth + 1); c.lineWidth = w; c.beginPath(); c.moveTo(bx, by); } }
      c.stroke();
    };
    const a = rand() * Math.PI; run(s / 2, s / 2, a, s * .45, s * .018, 0); run(s / 2, s / 2, a + Math.PI, s * .4, s * .016, 0);
  } },
  // a bullet hole: dark middle, a chipped ring where the surface flaked off round it
  bullet: { size: [.08, .08], upright: false, wear: 0, paint(c, s, o, rand) {
    c.fillStyle = 'rgba(160,150,135,.55)'; c.beginPath(); for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI * 2, r = s * (.3 + rand() * .16); c[i ? 'lineTo' : 'moveTo'](s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r); } c.fill();
    c.fillStyle = radial(c, s / 2, s / 2, s * .2, [[0, '#050505'], [.6, '#16130f'], [1, 'rgba(22,19,15,0)']]); c.beginPath(); c.arc(s / 2, s / 2, s * .2, 0, 7); c.fill();
    c.strokeStyle = 'rgba(20,18,15,.6)'; c.lineWidth = s * .015; for (let i = 0; i < 5; i++) { const a = rand() * 7; c.beginPath(); c.moveTo(s / 2 + Math.cos(a) * s * .18, s / 2 + Math.sin(a) * s * .18); c.lineTo(s / 2 + Math.cos(a) * s * (.3 + rand() * .15), s / 2 + Math.sin(a) * s * (.3 + rand() * .15)); c.stroke(); }
  } },
  // a spray-painted tag in made-up letters: a fat outlined scrawl in two colours
  graffiti: { size: [1.6, .7], upright: true, wear: .3, paint(c, s, o, rand, aspect) {
    const text = String(o.text ?? (NAMES1[Math.floor(rand() * NAMES1.length)] + NAMES2[Math.floor(rand() * NAMES2.length)]).toUpperCase());
    const fill = o.colour || ['#d23c8a', '#2fa7d6', '#e6702a', '#6cc04a', '#9b59d0'][Math.floor(rand() * 5)], line = o.dark || '#141414';
    c.save(); c.scale(1 / aspect, 1); const W = s * aspect, fs = Math.min(s * .7, W / text.length * 1.4);
    c.translate(W / 2, s / 2); c.rotate((rand() - .5) * .15); c.font = `italic 900 ${fs}px 'Arial Black', Impact, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = fs * .16; sprayed(c, s, () => c.strokeText(text, 0, 0), line, .02);
    sprayed(c, s, () => c.fillText(text, 0, 0), fill, .01);
    c.restore();
    drips(c, s, fill, 2 + Math.floor(rand() * 3), s * .7, .3, .01, rand);
  } },
};

/** The kinds of mark gs.hd.mark makes. */
export const marks = Object.keys(KINDS);

/**
 * A ready-made decal picture: gs.hd.mark(kind, { size, text, colour, dark, sign, word, wear, grime, seed, angle })
 * gives the options for v.decal(mesh, point, normal, opts), so `v.decal(m, p, n, gs.hd.mark('hazard', { sign: 'bolt' }))`.
 * kinds: hazard (a warning triangle, sign '!' | 'bolt' | 'flame' | 'drop', word: true or your own words for a plate under it),
 * stencil (text sprayed through a stencil, with drips), number, stripes (caution), arrow (on a floor), logo (a made-up
 * company's badge: text, or a name from the seed), grime (a dark streak down a wall), rust (running down from the top),
 * leak (a damp patch), oil, scorch, crack, bullet, graffiti (a tag in made-up letters, or text).
 * size: metres (a number scales the kind's own shape, [w, h] sets it); wear 0..1 (worn through in patches; each kind has
 * its own), grime 0..1. Upright kinds come with angle 0 (their top up a wall; on a floor pass your own), others turned
 * at random. The same options give the same picture (it is painted once and kept).
 */
export function mark(kind, o = {}) {
  const K = KINDS[kind]; if (!K) throw new Error(`gs.hd.mark: no kind '${kind}' (${marks.join(', ')})`);
  const base = typeof K.size === 'function' ? K.size(String(o.text ?? 'A-7')) : K.size;
  const size = Array.isArray(o.size) ? o.size : typeof o.size === 'number' ? [base[0] * o.size / Math.max(base[0], base[1]), base[1] * o.size / Math.max(base[0], base[1])] : base;
  const aspect = size[0] / size[1], seed = o.seed ?? 1, wear = o.wear ?? K.wear, grime = o.grime ?? (K.wear > 0 ? .25 : 0);
  const key = 'gsMark:' + kind + ':' + JSON.stringify([o.text, o.colour, o.dark, o.sign, o.word, wear, grime, seed, aspect.toFixed(2)]);
  const paint = (c, s) => {
    const rand = rng(seed * 97 + 13);
    K.paint(c, s, o, rand, aspect);
    if (wear > 0 || grime > 0) distress(c, s, { amount: wear, grime, seed, scale: Math.max(1, aspect) });
  };
  const out = { paint, key, size: [size[0], size[1], o.depth ?? Math.max(.1, Math.min(size[0], size[1]) * .5)], rough: o.rough ?? K.rough ?? .8 };
  if (o.angle !== undefined) out.angle = o.angle; else if (K.upright) out.angle = 0;
  if (o.life !== undefined) out.life = o.life; if (o.max !== undefined) out.max = o.max; if (o.opacity !== undefined) out.opacity = o.opacity;
  return out;
}
