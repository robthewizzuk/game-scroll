// Doodle recognition: the player draws, the game knows what it is. "Draw a sword to fight", "draw a
// bridge across the gap", "draw an umbrella before the rain". A small drawing model (about 440 KB of
// weights, trained on Google's Quick, Draw! drawings, CC BY 4.0) runs on the phone in plain JavaScript
// in a few milliseconds; nothing is sent anywhere, and it is only fetched by a game that uses it.
// It knows 200 things (Doodle.things). Measured on the dataset's own pictures of drawings it never
// saw: 76 in 100 are named right among all 200, 89 in 100 are in its first three guesses, and 96 in
// 100 are right when the game asks it to choose among five (`among`). So ask among the few things
// your game cares about. The animals that look alike as doodles are the hard ones (dog, bear, bird,
// frog, raccoon, tiger: a third to a half right among all 200), so don't put two of those in one
// `among`. Drawn from strokes, as a game does it, on 2,100 real drawings of 14 things (nine of them
// those look-alike animals): 60 in 100 right among all 200, 80 in its first three, 95 among five.
//
//   const { Doodle } = gs.doodle;
//   reset() { doodle = new Doodle(); strokes = []; }       // make it in make() or reset(): the model loads first
//   down(x, y) { strokes.push([{ x, y }]); }
//   move(x, y, pressed) { if (pressed) strokes.at(-1).push({ x, y }); }
//   up() {
//     const best = doodle.guess(strokes, { among: ['sword', 'umbrella', 'bridge'] })[0];
//     if (best.sure > .5) use(best.name);
//   }
//
// guess(strokes, { among }) gives every thing it knows (or just `among`), most likely first, as
// { name, sure } with the sures adding up to 1. strokes: arrays of { x, y } points (any units),
// or gs.strokes Stroke objects (their .points). For simple shapes (circle, line, zigzag...) the
// $Q recogniser in gs.strokes is quicker and needs no model.
//
// It can learn this player's own way of drawing a thing (Tiny Brains' teaching by example): when the
// game knows what a drawing was (it asked for a cat, and the player says that was one),
// doodle.learn(strokes, 'cat') keeps it, and a later drawing made the same way counts as a cat
// (`yours: true` on that guess). new Doodle(api) keeps what it learned on the phone. Measured on real
// drawings of nine look-alike animals, asked to choose among the nine: for a player who draws a thing
// alike each time (one real drawing, redrawn with a wobble), 70 in 100 right before, 91 after one
// example and 95 after three (84 with twice the wobble); for one who never draws alike, 75 before
// and 76 after; fewer than one in 100 of their other animals is lost to it. A drawing that looks
// nothing like the thing (it isn't in the model's first twenty guesses of the 200) is not learned,
// so a scribble can't be taught as a cat.

import { lazy } from './lazy.js';
import { Examples } from './brains.js';

const model = lazy('Doodle recognition', () => import('./doodle-model.js').then(m => unpack(m.MODEL)));
export const loadDoodle = () => model.load();

// the same names, in the same order, as scripts/doodle-model/classes.json (kit-test checks it)
const THINGS = [
  "sword", "star", "circle", "triangle", "square", "house", "tree", "cat", "fish", "bird", "sun", "moon", "cloud", "lightning", "umbrella", "key",
  "ladder", "bridge", "car", "sailboat", "airplane", "flower", "apple", "snowman", "mountain", "hat", "crown", "envelope", "eye", "smiley face",
  "fork", "hammer", "axe", "door", "candle", "clock", "cup", "diamond", "banana", "bicycle", "spider", "snake", "rainbow", "octopus", "light bulb",
  "hot air balloon", "ant", "bat", "bear", "bee", "butterfly", "camel", "cow", "crab", "crocodile", "dog", "dolphin", "dragon", "duck", "elephant",
  "flamingo", "frog", "giraffe", "hedgehog", "horse", "kangaroo", "lion", "lobster", "monkey", "mosquito", "mouse", "owl", "panda", "parrot",
  "penguin", "pig", "rabbit", "raccoon", "rhinoceros", "scorpion", "sea turtle", "shark", "sheep", "snail", "squirrel", "swan", "tiger", "whale",
  "zebra", "bread", "broccoli", "cake", "carrot", "donut", "grapes", "hamburger", "hot dog", "ice cream", "lollipop", "mushroom", "onion", "pear",
  "pineapple", "pizza", "popsicle", "strawberry", "watermelon", "peanut", "anvil", "backpack", "basket", "book", "boomerang", "bucket", "broom",
  "camera", "cannon", "compass", "drums", "dumbbell", "eyeglasses", "feather", "flashlight", "guitar", "headphones", "helmet", "hourglass", "knife",
  "lantern", "leaf", "map", "microphone", "necklace", "paintbrush", "parachute", "pencil", "piano", "rake", "saw", "scissors", "screwdriver",
  "shovel", "skull", "snowflake", "spoon", "teapot", "telephone", "tent", "tooth", "trumpet", "violin", "wheel", "wine glass", "shoe", "sock",
  "t-shirt", "pants", "bowtie", "mailbox", "megaphone", "suitcase", "vase", "barn", "bus", "canoe", "castle", "church", "fence", "flying saucer",
  "helicopter", "lighthouse", "motorbike", "palm tree", "cactus", "rain", "skateboard", "skyscraper", "stairs", "stop sign", "submarine", "tornado",
  "tractor", "traffic light", "train", "truck", "windmill", "campfire", "bed", "chair", "table", "bench", "television", "laptop", "hand",
  "moustache", "mermaid", "angel", "soccer ball", "tennis racquet", "basketball",
];

function unpack({ classes, layers, data }) {
  const bin = atob(data), bytes = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = (bin.charCodeAt(i) << 24) >> 24;
  const W = {};
  for (const L of layers) {
    const n = L.shape.reduce((a, b) => a * b, 1), w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = bytes[L.offset + i] * L.scale;
    W[L.name] = w;
  }
  return { classes, W };
}

// How thick a stroke is drawn, in pixels from its middle to where it has faded out. Measured on 2,100
// real drawings of 14 things (strokes from Quick, Draw!, ones the model never saw): at 1.2 the model
// names 60 in 100 right among all 200, the same as it does on the dataset's own pictures; at 1.6 (what
// this was until then) 45 in 100, because the lines were half as thick again as the ones it learned from.
const LINE = 1.2;
/** Draws strokes into a 28 x 28 picture the way the training drawings were made (fitted, centred, soft lines). */
export function picture(strokes, size = 28) {
  const lines = (strokes || []).map(s => (Array.isArray(s) ? s : s && s.points) || []).filter(s => s.length);
  const img = new Float32Array(size * size);
  if (!lines.length) return img;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of lines) for (const p of s) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const span = Math.max(x1 - x0, y1 - y0, 1e-6), k = (size - 3.5) / span;
  const ox = (size - (x1 - x0) * k) / 2, oy = (size - (y1 - y0) * k) / 2;
  const segs = [];
  for (const s of lines) {
    const pts = s.map(p => [(p.x - x0) * k + ox, (p.y - y0) * k + oy]);
    if (pts.length === 1) pts.push([pts[0][0] + .01, pts[0][1]]);
    for (let i = 1; i < pts.length; i++) segs.push(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }
  // each pixel: how close its centre is to the nearest line (a line about a pixel and a half wide, soft edges)
  for (let n = 0; n < segs.length; n += 4) {
    const ax = segs[n], ay = segs[n + 1], bx = segs[n + 2], by = segs[n + 3], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - 2)), maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx) + 2));
    const minY = Math.max(0, Math.floor(Math.min(ay, by) - 2)), maxY = Math.min(size - 1, Math.ceil(Math.max(ay, by) + 2));
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + .5, py = y + .5, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
      const ex = ax + dx * t - px, ey = ay + dy * t - py, d = Math.sqrt(ex * ex + ey * ey);
      const v = Math.max(0, Math.min(1, LINE - d)), i = y * size + x;
      if (v > img[i]) img[i] = v;
    }
  }
  return img;
}

// the network: three 3x3 convolutions (each with ReLU and 2x2 max pooling), then two dense layers.
// The sizes are read from the weights, so a retrained model of another size needs no change here.
function conv(x, c, h, w, W, B) {
  const co = B.length, pw = w + 2, ph = h + 2, pad = new Float32Array(c * ph * pw), n = h * w;
  for (let i = 0; i < c; i++) for (let y = 0; y < h; y++) pad.set(x.subarray((i * h + y) * w, (i * h + y + 1) * w), (i * ph + y + 1) * pw + 1);   // a border of zeros: no edge checks below
  const out = new Float32Array(co * n);
  for (let o = 0; o < co; o++) {
    const base = o * n; out.fill(B[o], base, base + n);
    for (let i = 0; i < c; i++) {
      const k = (o * c + i) * 9, w0 = W[k], w1 = W[k + 1], w2 = W[k + 2], w3 = W[k + 3], w4 = W[k + 4], w5 = W[k + 5], w6 = W[k + 6], w7 = W[k + 7], w8 = W[k + 8], po = i * ph * pw;
      for (let y = 0; y < h; y++) {
        let a = po + y * pw, b = a + pw, d = b + pw, q = base + y * w;
        for (let xx = 0; xx < w; xx++, a++, b++, d++, q++) {
          out[q] += w0 * pad[a] + w1 * pad[a + 1] + w2 * pad[a + 2] + w3 * pad[b] + w4 * pad[b + 1] + w5 * pad[b + 2] + w6 * pad[d] + w7 * pad[d + 1] + w8 * pad[d + 2];
        }
      }
    }
    for (let q = base; q < base + n; q++) if (out[q] < 0) out[q] = 0;
  }
  return out;
}
function pool(x, c, h, w) {
  const h2 = h >> 1, w2 = w >> 1, out = new Float32Array(c * h2 * w2);
  for (let i = 0; i < c; i++) for (let y = 0; y < h2; y++) for (let x2 = 0; x2 < w2; x2++) {
    const o = i * h * w + y * 2 * w + x2 * 2;
    out[(i * h2 + y) * w2 + x2] = Math.max(x[o], x[o + 1], x[o + w], x[o + w + 1]);
  }
  return out;
}
function dense(x, W, B, relu) {
  const m = x.length, n = B.length, out = new Float32Array(n);
  for (let o = 0; o < n; o++) { let s = B[o]; const r = o * m; for (let i = 0; i < m; i++) s += W[r + i] * x[i]; out[o] = relu && s < 0 ? 0 : s; }
  return out;
}
/** What the network makes of a 28 x 28 picture just before it names it (its last hidden layer). */
export function features(img, { W }) {
  const c1 = W['c1.bias'].length, c2 = W['c2.bias'].length, c3 = W['c3.bias'].length;
  let x = pool(conv(img, 1, 28, 28, W['c1.weight'], W['c1.bias']), c1, 28, 28);
  x = pool(conv(x, c1, 14, 14, W['c2.weight'], W['c2.bias']), c2, 14, 14);
  x = pool(conv(x, c2, 7, 7, W['c3.weight'], W['c3.bias']), c3, 7, 7);
  return dense(x, W['f1.weight'], W['f1.bias'], true);
}
/** The network's scores (logits) for a 28 x 28 picture (or for its features). */
export function scores(img, M, feats = features(img, M)) { return dense(feats, M.W['f2.weight'], M.W['f2.bias'], false); }

// Learning a player's own drawing: what the network makes of the drawing (its last hidden layer), cut
// down to KEPT numbers by fixed random sums so three examples of a thing fit in 150 bytes. A new
// drawing as alike as FROM (cosine) to one of a thing's examples starts to count as that thing, up
// to BOOST on its score when it is the same drawing again. Measured: the same hand again is .69 to
// .92 alike, another person's same thing .13 to .62, another animal .01 to .54.
const KEPT = 48, FROM = .7, BOOST = 10, NEAR = 20, PER = 3;
let sums = null;
function small(f) {
  if (!sums || sums[0].length !== f.length) { let a = 12345; const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; sums = Array.from({ length: KEPT }, () => Float32Array.from({ length: f.length }, () => (r() < .5 ? -1 : 1))); }
  let q = 0; for (let i = 0; i < f.length; i++) q += f[i] * f[i]; q = 1.3 / (Math.sqrt(q) || 1);
  const out = new Float32Array(KEPT);
  for (let k = 0; k < KEPT; k++) { let t = 0; const p = sums[k]; for (let i = 0; i < f.length; i++) t += p[i] * f[i]; out[k] = t * q; }
  return out;
}
function alike(a, b) { let ab = 0, aa = 0, bb = 0; for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return ab / (Math.sqrt(aa * bb) || 1); }

export class Doodle {
  /** new Doodle(): the model alone. new Doodle(api, { name }): what learn() is shown is kept on the phone, with the game's brains (name: 'doodle'; save: false keeps it to the session). */
  constructor(api = null, opts = {}) {
    this.M = model.get();
    if (api && !api.brains && !api.score && arguments.length < 2) { opts = api; api = null; }
    this.own = new Examples(api, { name: String(opts.name || 'doodle'), inputs: KEPT, keep: PER, save: api ? opts.save !== false : false });
  }
  /** Every thing it can recognise. */
  static get things() { return THINGS.slice(); }
  get things() { return this.M.classes.slice(); }
  /**
   * What the strokes look like: [{ name, sure }], most likely first, sures adding up to 1. With
   * among, only those things are compared (names it doesn't know are left out).
   */
  guess(strokes, { among = null } = {}) {
    const f = features(picture(strokes), this.M), s = scores(null, this.M, f), names = this.M.classes;
    const keep = among ? names.map((n, i) => (among.includes(n) ? i : -1)).filter(i => i >= 0) : names.map((_, i) => i);
    if (!keep.length) return [];
    // a drawing made the way this player drew a thing before counts for that thing
    let mine = null;
    if (this.own.count()) {
      const x = small(f);
      for (const i of keep) { const ex = this.own.all(names[i]); if (!ex.length) continue; let m = 0; for (const e of ex) m = Math.max(m, alike(x, e)); if (m > FROM) { s[i] += BOOST * (m - FROM) / (1 - FROM); (mine ||= new Set()).add(i); } }
    }
    let top = -Infinity; for (const i of keep) top = Math.max(top, s[i]);
    let z = 0; const out = keep.map(i => { const e = Math.exp(s[i] - top); z += e; return mine && mine.has(i) ? { name: names[i], sure: e, yours: true } : { name: names[i], sure: e }; });
    for (const o of out) o.sure /= z;
    return out.sort((a, b) => b.sure - a.sure);
  }
  /**
   * "That drawing was a cat": keeps this player's way of drawing a thing (the newest three of each),
   * so a later drawing made the same way is guessed as it. Call it when the game knows what was
   * drawn. False, and nothing learned, for a thing the model doesn't know or a drawing that looks
   * nothing like it (the thing isn't in the model's first twenty guesses of all it knows).
   */
  learn(strokes, name) {
    const names = this.M.classes, i = names.indexOf(name); if (i < 0) return false;
    const f = features(picture(strokes), this.M), s = scores(null, this.M, f);
    let above = 0; for (let j = 0; j < s.length; j++) if (s[j] > s[i]) above++;
    if (above >= NEAR) return false;
    return this.own.add(name, small(f));
  }
  /** Forgets what learn() was shown: one thing's, or all of it. */
  forget(name) { this.own.forget(name); return this; }
  /** The things it has learned this player's way of drawing, and how many examples of each: { cat: 2 }. */
  get learned() { const out = {}; for (const n of this.own.names) out[n] = this.own.count(n); return out; }
}
