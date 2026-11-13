// The leaf pictures for gs.models' plants (plants.js), drawn in code: palm fronds, fan palm leaves, banana
// paddles, fern fronds, cypress sprays, elephant ears, reed blades, petals, ivy, hanging moss, lily pads and weeds. Like the
// trees' leaves (tree-textures.js) each is drawn pale with darker veins, cut out by its alpha, so the
// material's colour (and a plant's own vertex colours: dead fronds, petals) tints it. No image files.
// A picture's v runs from where the leaf starts (0, the bottom of the canvas) to its tip (1, the top); u
// across it, its middle line at .5. Kit use only.
import { CanvasTexture, SRGBColorSpace, LinearMipmapLinearFilter, ClampToEdgeWrapping } from 'three';

const made = {};
// a little seeded random for the pictures (the same leaves on every phone)
const rnd = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
const PALE = '#e9f0df', VEIN = 'rgba(96,112,74,.75)', STALK = '#c9c49a';

// a long thin leaf from (x0, y0) to (x1, y1), w px wide at its widest (a third of the way along), bending by `bow` px
function blade(x, x0, y0, x1, y1, w, bow = 0) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  const at = (t, s) => [x0 + dx * t + nx * (s + bow * 4 * t * (1 - t)), y0 + dy * t + ny * (s + bow * 4 * t * (1 - t))];
  x.beginPath(); const N = 8;
  for (let i = 0; i <= N; i++) { const t = i / N, h = w * .5 * Math.sin(Math.PI * Math.min(1, t * 1.25 + .05)) * (1 - t * .55); x.lineTo(...at(t, h)); }
  for (let i = N; i >= 0; i--) { const t = i / N, h = w * .5 * Math.sin(Math.PI * Math.min(1, t * 1.25 + .05)) * (1 - t * .55); x.lineTo(...at(t, -h)); }
  x.closePath(); x.fill();
}
/** A fern frond's outline: how far its leaflets reach at t (0 its foot .. 1 its tip), 0..1. */
export const fernShape = t => Math.min(1, Math.min(1, .55 + t * 2.4) * Math.pow(1 - t, .7) * 1.15) * .94 + .06;
const line = (x, a, b, c, d, w) => { x.lineWidth = w; x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); };
// a leaf's stalk and middle rib: wide at the bottom (the bare stalk, up to canvas y `base`), narrowing to a thin rib at the tip
function stalk(x, W, H, base, w0, w1) {
  x.fillStyle = STALK; x.beginPath(); x.moveTo(W / 2 - w0 / 2, H); x.lineTo(W / 2 - w1 / 2, base); x.lineTo(W / 2 - .8, 2); x.lineTo(W / 2 + .8, 2); x.lineTo(W / 2 + w1 / 2, base); x.lineTo(W / 2 + w0 / 2, H); x.closePath(); x.fill();
}

const DRAW = {
  // a feather palm's frond: a bare stalk for the first eighth, then narrow leaflets in pairs from the middle
  // rib out to both edges, sloping towards the tip, a few short or missing (wind-torn)
  frond: [128, 256, (x, W, H, R) => {
    const base = H * .88;   // (canvas y where the leaflets start: v .12)
    x.fillStyle = PALE;
    for (let i = 0; i < 44; i++) {
      const t = i / 43, y = base - t * (base - 4);
      for (const s of [-1, 1]) {
        if (R() < .06) continue;   // (one torn away)
        const reach = (W * .5 - 2) * (R() < .1 ? .55 + R() * .3 : .92 + R() * .08), rise = 18 + 10 * t;
        blade(x, W / 2, y, W / 2 + s * reach, y - rise, 5.5 - t * 2, s * (1.5 + R() * 2));
      }
    }
    stalk(x, W, H, base, 64, 5);
    return [];
  }],
  // a fan palm's leaf, seen from above: its stalk meets the middle; stiff folded segments spread round three
  // quarters of a circle and split apart at their tips
  fan: [256, 256, (x, W, H, R) => {
    const cx = W / 2, cy = H / 2, r = W / 2 - 3, n = 34, a0 = -Math.PI * .5 - Math.PI * .78, a1 = -Math.PI * .5 + Math.PI * .78;
    x.fillStyle = PALE;
    x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, r * .58, a0, a1); x.closePath(); x.fill();   // (whole in the middle)
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * (i + .5) / n, l = r * (.86 + R() * .14), sa = (a1 - a0) / n * .42;
      x.beginPath(); x.moveTo(cx + Math.cos(a - sa) * r * .5, cy + Math.sin(a - sa) * r * .5);
      x.lineTo(cx + Math.cos(a - sa * .6) * l, cy + Math.sin(a - sa * .6) * l); x.lineTo(cx + Math.cos(a) * (l + 4), cy + Math.sin(a) * (l + 4));
      x.lineTo(cx + Math.cos(a + sa * .6) * l, cy + Math.sin(a + sa * .6) * l); x.lineTo(cx + Math.cos(a + sa) * r * .5, cy + Math.sin(a + sa) * r * .5); x.closePath(); x.fill();
    }
    return Array.from({ length: n }, (_, i) => { const a = a0 + (a1 - a0) * (i + .5) / n; return [cx, cy, cx + Math.cos(a) * r * .9, cy + Math.sin(a) * r * .9]; });
  }],
  // a banana leaf: a long paddle on a stout midrib, fine veins out to the edge, torn along them in places
  paddle: [128, 256, (x, W, H, R) => {
    const cx = W / 2, top = 6, bot = H - 4;
    x.fillStyle = PALE; x.beginPath();
    for (let i = 0; i <= 24; i++) { const t = i / 24, y = bot - (bot - top) * t, h = (W / 2 - 3) * Math.pow(Math.sin(Math.PI * Math.min(1, .04 + t * .98)), .45) * (1 - .1 * t); x.lineTo(cx + h, y); }
    for (let i = 24; i >= 0; i--) { const t = i / 24, y = bot - (bot - top) * t, h = (W / 2 - 3) * Math.pow(Math.sin(Math.PI * Math.min(1, .04 + t * .98)), .45) * (1 - .1 * t); x.lineTo(cx - h, y); }
    x.closePath(); x.fill();
    // tears: thin cuts from the edge in towards the rib, along the veins
    x.globalCompositeOperation = 'destination-out'; x.strokeStyle = '#000';
    for (let i = 0; i < 14; i++) { const s = R() < .5 ? -1 : 1, y = top + 20 + R() * (bot - top - 40), d = (.35 + R() * .55) * (W / 2); line(x, cx + s * (W / 2), y + 10, cx + s * (W / 2 - d), y + 10 - d * .55, 1.6); }
    x.globalCompositeOperation = 'source-over';
    const v = [[cx, bot, cx, top + 4, 3, 'rgba(150,160,110,.6)']]; for (let y = bot - 8; y > top + 6; y -= 3.2) v.push([cx, y, 2, y - 16, .7, 'rgba(96,112,74,.3)'], [cx, y, W - 2, y - 16, .7, 'rgba(96,112,74,.3)']);
    return v;
  }],
  // a fern frond: leaflets (pinnae) in pairs from the rib, short at the frond's foot, longest a third of the way
  // up and shrinking to its tip, each a narrow strip cut into rounded lobes, sloping towards the tip
  fern: [128, 256, (x, W, H, R) => {
    const base = H * .9, N = 30; x.fillStyle = PALE; x.strokeStyle = PALE; x.lineWidth = 1.6;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), y = base - t * (base - 6);
      for (const s of [-1, 1]) {
        const reach = (W / 2 - 3) * fernShape(t) * (.92 + R() * .08), ex = W / 2 + s * reach, ey = y - (9 + 6 * t), dx = ex - W / 2, dy = ey - y, l = Math.hypot(dx, dy) || 1, a = Math.atan2(dy, dx);
        x.beginPath(); x.moveTo(W / 2, y); x.lineTo(ex, ey); x.stroke();
        const lobes = Math.max(2, Math.round(l / 4.6));
        for (let k = 0; k < lobes; k++) { const u = (k + .6) / (lobes + .4), w = 3.5 * (1 - u * .55) + .5; x.beginPath(); x.ellipse(W / 2 + dx * u, y + dy * u, 2.9, w, a, 0, Math.PI * 2); x.fill(); }
      }
    }
    stalk(x, W, H, base, 56, 3);
    return [];
  }],
  // a swamp cypress's spray: a twig with feathery branchlets either side, each lined with flat needles in two ranks
  spray: [128, 256, (x, W, H, R) => {
    x.strokeStyle = PALE; x.lineCap = 'round';
    line(x, W / 2, H, W / 2, 8, 2.4);
    for (let y = H - 14, k = 0; y > 14; y -= 8, k++) {
      const t = 1 - y / H, s = k % 2 ? 1 : -1, reach = (W / 2 - 5) * (1 - t * .55) * (.85 + R() * .15), ex = W / 2 + s * reach, ey = y - 22 - R() * 6, dx = ex - W / 2, dy = ey - y, l = Math.hypot(dx, dy);
      line(x, W / 2, y, ex, ey, 1.3);
      const ux = dx / l, uy = dy / l;
      for (let d = 4; d < l - 2; d += 2.6) {   // needles both sides of the branchlet, angled forward
        const px = W / 2 + ux * d, py = y + uy * d, nl = 5.5 * (1 - d / l * .5);
        for (const q of [-1, 1]) { const c = Math.cos(q * 1.05), sn = Math.sin(q * 1.05); line(x, px, py, px + (ux * c - uy * sn) * nl, py + (ux * sn + uy * c) * nl, 1.5); }
      }
    }
    return [[W / 2, H, W / 2, 10, 1.6]];
  }],
  // an elephant's ear: a big heart with the stalk meeting it a third of the way in from its notch
  heart: [256, 256, (x, W, H) => {
    const cx = W / 2, nY = H - 6, at = H * .68, tip = 6;   // notch at the bottom, the stalk joins at `at`, the tip at the top
    x.fillStyle = PALE; x.beginPath(); x.moveTo(cx, at);
    x.bezierCurveTo(cx - 40, nY + 10, cx - W * .52, nY - 30, cx - W * .46, at - 40);
    x.bezierCurveTo(cx - W * .4, at - 120, cx - 30, tip + 50, cx, tip);
    x.bezierCurveTo(cx + 30, tip + 50, cx + W * .4, at - 120, cx + W * .46, at - 40);
    x.bezierCurveTo(cx + W * .52, nY - 30, cx + 40, nY + 10, cx, at);
    x.fill();
    const v = [[cx, at, cx, tip + 8]]; for (let i = 1; i < 6; i++) { const y = at - i * 28; v.push([cx, y, cx - W * .4 + i * 12, y - 34], [cx, y, cx + W * .4 - i * 12, y - 34]); }
    v.push([cx, at, cx - W * .4, nY - 20], [cx, at, cx + W * .4, nY - 20]);
    return v;
  }],
  // a reed or a grass blade: narrow, tapering to a point, a line down the middle
  blade: [32, 256, (x, W, H) => {
    x.fillStyle = PALE; x.beginPath(); x.moveTo(2, H); x.lineTo(W / 2 - 1, 2); x.lineTo(W / 2 + 1, 2); x.lineTo(W - 2, H); x.closePath(); x.fill();
    return [[W / 2, H, W / 2, 6]];
  }],
  // a flower head from above: petals round a centre (the plant's own colour tints the petals; the centre is drawn darker)
  petals: [64, 64, (x, W, H, R) => {
    const cx = W / 2, cy = H / 2, n = 6 + Math.floor(R() * 3);
    x.fillStyle = '#ffffff';
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; x.save(); x.translate(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14); x.rotate(a); x.beginPath(); x.ellipse(0, 0, 15, 7.5, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
    x.fillStyle = '#b08a2a'; x.beginPath(); x.arc(cx, cy, 6.5, 0, Math.PI * 2); x.fill();
    return [];
  }],
  // an ivy leaf: three to five pointed lobes
  ivy: [64, 64, (x, W, H) => {
    const cx = W / 2, cy = H * .62; x.fillStyle = PALE; x.beginPath(); x.moveTo(cx, H - 2);
    const P = [[-.18, .02], [-.46, .06], [-.3, -.12], [-.36, -.36], [-.12, -.28], [0, -.58], [.12, -.28], [.36, -.36], [.3, -.12], [.46, .06], [.18, .02]];
    for (const [a, b] of P) x.lineTo(cx + a * W, cy + b * H);
    x.closePath(); x.fill();
    return [[cx, H - 2, cx, cy - H * .5], [cx, cy, cx - W * .36, cy - H * .3], [cx, cy, cx + W * .36, cy - H * .3]];
  }, 1.4],
  // moss hanging from a branch: wisps that fall from the top in thin wandering threads
  moss: [64, 256, (x, W, H, R) => {
    x.strokeStyle = PALE; x.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      let px = 6 + R() * (W - 12), py = H - 2 - R() * 10; const l = (.4 + R() * .6) * H; x.lineWidth = 1 + R() * 1.8; x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 12; k++) { px += (R() - .5) * 7; py -= l / 12; x.lineTo(Math.max(2, Math.min(W - 2, px)), py); }
      x.stroke();
    }
    return [];
  }],
  // a lily pad from above: round, cut in to the middle at one side, fine veins out from it
  pad: [128, 128, (x, W, H) => {
    const cx = W / 2, cy = H / 2, r = W / 2 - 3; x.fillStyle = PALE; x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, r, -Math.PI / 2 + .16, Math.PI * 1.5 - .16); x.closePath(); x.fill();
    return Array.from({ length: 16 }, (_, i) => { const a = -Math.PI / 2 + .3 + i / 15 * (Math.PI * 2 - .6); return [cx, cy, cx + Math.cos(a) * r * .9, cy + Math.sin(a) * r * .9]; });
  }],
  // weeds: a toothed leaf (left half) and a grass blade (right quarter), with a small flower head top right
  weed: [128, 128, (x, W, H) => {
    x.fillStyle = PALE; x.beginPath(); x.moveTo(32, H - 2);
    for (let i = 0; i <= 10; i++) { const t = i / 10, y = H - 4 - t * (H - 10), w = 26 * Math.sin(Math.PI * Math.min(1, t * 1.1 + .08)) * (i % 2 ? .62 : 1); x.lineTo(32 + w, y); }
    for (let i = 10; i >= 0; i--) { const t = i / 10, y = H - 4 - t * (H - 10), w = 26 * Math.sin(Math.PI * Math.min(1, t * 1.1 + .08)) * (i % 2 ? 1 : .62); x.lineTo(32 - w, y); }
    x.closePath(); x.fill();
    x.beginPath(); x.moveTo(68, H); x.lineTo(79, 4); x.lineTo(81, 4); x.lineTo(92, H); x.closePath(); x.fill();
    x.strokeStyle = '#a8b080'; line(x, 112, H, 112, 50, 2.5);
    x.fillStyle = '#ffffff'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.beginPath(); x.ellipse(112 + Math.cos(a) * 7, 34 + Math.sin(a) * 7, 6, 2.6, a, 0, Math.PI * 2); x.fill(); }
    return [[32, H - 2, 32, 8], [80, H, 80, 8]];
  }],
};

/** A plant leaf picture by name (frond, fan, paddle, fern, spray, heart, blade, petals, ivy, moss, pad, weed). */
export function plantTexture(name) {
  if (made[name]) return made[name];
  const [W, H, draw, vw = 1] = DRAW[name], c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });   // (painted in memory: hd3d.js surface())
  const veins = draw(x, W, H, rnd(4021 + name.length * 977));
  // shading only where the leaf is: a little darker down the middle, veins darker still
  x.globalCompositeOperation = 'source-atop';
  const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(110,130,90,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  if (name !== 'petals' && name !== 'moss' && name !== 'spray') { x.fillStyle = g; x.fillRect(0, 0, W, H); }
  for (const [a, b, cc, d, w = 1.4, st = VEIN] of veins) { x.strokeStyle = st; line(x, a, b, cc, d, w * vw); }
  x.globalCompositeOperation = 'source-over';
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.minFilter = LinearMipmapLinearFilter; t.anisotropy = 4; t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.userData.atlas = [W, H];
  return (made[name] = t);
}
export const PLANT_TEXTURES = Object.keys(DRAW);
