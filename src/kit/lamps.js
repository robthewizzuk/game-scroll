// Night lights (HDView.placeLamps): the lamp pool, light shapes drawn in code, and shadows for the nearest lamps.
//
// A game hands placeLamps its lamp spots every frame ({ x, y, z, col, i, flick } and, new here: dir, angle, soft,
// reach, shadow, shape, tube, rect). The nearest few get real lights from a pool that never shrinks (a light coming or
// going would rebuild shaders on WebGL); a spot keeps the light it had last frame while it stays among the nearest,
// so a lamp's light (and its shadow) doesn't hop from one pool light to another as the camera moves.
//
// Shadows. On WebGPU the lights are clustered (three's Forward+, hd3d-gpu.js), which has no shadows, and a shader may
// read only 16 textures, so a map per lamp is out. Instead all lamp shadows share one depth picture, an atlas of
// slots (lamps-gpu.js draws it and reads it inside the clustered lights' loop). The nearest lamps that ask for a
// shadow get a slot; a slot is drawn again only when its lamp or something it sees moved (HDView.shadowLights hashes
// what each slot sees, as it does for the sun), and at most a few slots a frame are drawn (the nearest and longest
// waiting first), so a street of lamps with cars going under them costs a few small shadow maps a frame, not one for
// every lamp. On WebGL the shadowed lamps are a few real spot lights with shadows (three's own), by quality tier.
//
// Light shapes (shape: 'headlamp' | 'window' | 'blinds' | 'cage' | 'leaves' | 'grille' | 'stained'): a picture drawn
// in code (no image files) that the light shines through, like a theatre gobo: a car's dipped beam with its sharp top
// edge, the bars of a window frame, the slats of a blind, a lamp's wire cage. On WebGPU the shader works the shape out
// where it is needed (no picture at all); on WebGL each is a picture painted from the same sums (three's SpotLight.map).
//
// Neon and signs: a tube light (tube: [x, y, z], the far end) lights as the nearest point of the tube to each surface
// does, so a long tube draws a long highlight on a wet road; a sign (rect: { w, h, normal }) lights from its face, on
// its front side only. neon() and sign() make the glowing things to go with them. WebGL lights both from their middle.
//
// A sign that lights with its own picture (picture: a canvas or a CanvasTexture; live: true for a canvas redrawn every
// frame, a texture is copied again when its version moves on): a TV, a video wall, a stained window. On WebGPU the
// picture is a square of the decals' atlas (decals-gpu.js) and each part of the sign's light takes the colour of where
// it comes from (lamps-gpu.js); on WebGL the lamp at its middle takes the picture's average colour.
// Kit use only (hd3d.js).
import { PointLight, SpotLight, Vector3, Matrix4, PerspectiveCamera, CanvasTexture, SRGBColorSpace, LinearMipmapLinearFilter } from 'three';

/** The light shapes, by their index (lamps-gpu.js works the same shapes out in the shader: keep the two alike). */
export const SHAPES = ['headlamp', 'window', 'blinds', 'cage', 'leaves', 'grille', 'stained', 'bars'];

const fr = x => x - Math.floor(x), sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (x, y) => fr(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
const vnoise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), u = sm(0, 1, x - i), w = sm(0, 1, y - j); return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - w) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * w; };
const PANES = [[.88, .27, .23], [.23, .44, .88], [.94, .75, .25], [.25, .75, .42], [.75, .38, .82], [.94, .54, .19]];
/**
 * A light shape's colour at (u, v) of the light's picture, 0..1 from its top left, as seen from the light looking out
 * (white: all the light passes). The same sums as lamps-gpu.js shapeNode; WebGL paints its pictures from these.
 */
export function shapeAt(i, u, v) {
  const box = (a, b) => sm(a - .01, a + .01, u) * sm(a - .01, a + .01, v) * (1 - sm(b - .01, b + .01, u)) * (1 - sm(b - .01, b + .01, v));
  const line = (x, w) => sm(w - .008, w + .008, Math.abs(x));
  switch (i) {
    case 0: {   // a dipped headlight: bright under a sharp cut-off a little below the middle that rises to the right (the kerb side), a hot spot just under it, fading towards the near ground
      const v0 = .5 - .1 * sm(.5, .72, u), under = sm(v0 - .012, v0 + .012, v), side = sm(0, .22, u) * (1 - sm(.78, 1, u));
      const hot = Math.exp(-((u - .56) ** 2 * 9 + (v - v0 - .07) ** 2 * 60)), k = (under * (1 - .6 * sm(v0, 1, v)) + hot * .9 + .05 * sm(v0 - .14, v0, v)) * side;
      return [k, k, k];
    }
    case 1: { const k = box(.1, .9) * line(u - .5, .03) * line(v - .5, .03); return [k, k, k]; }   // a window of four panes
    case 2: { const k = box(.08, .92) * sm(.5, .56, fr(v * 12)); return [k, k, k]; }   // a slatted blind
    case 3: {   // a lamp's wire cage: two rings and six spokes
      const x = u - .5, y = v - .5, r = Math.hypot(x, y), a = Math.atan2(y, x), sp = Math.abs(fr(a / (Math.PI / 3) + .5) - .5) * r * Math.PI / 3;
      const k = line(r - .22, .018) * line(r - .4, .018) * (r < .08 ? 1 : sm(.012, .028, sp)); return [k, k, k];
    }
    case 4: { const n = vnoise(u * 7, v * 7) * .6 + vnoise(u * 15 + 3, v * 15) * .4, k = .12 + .88 * sm(.48, .62, n); return [k, k, k]; }   // light through leaves
    case 5: { const k = sm(.12, .18, fr(u * 6)) * (1 - sm(.82, .88, fr(u * 6))) * sm(.12, .18, fr(v * 6)) * (1 - sm(.82, .88, fr(v * 6))); return [k, k, k]; }   // a grille of square holes
    case 6: {   // a stained glass window: coloured panes in lead lines
      const cx = Math.floor((u - .1) / .16), cy = Math.floor((v - .1) / .16), c = PANES[Math.floor(hash(cx + 7, cy + 3) * 6) % 6];
      const k = box(.1, .9) * sm(.04, .1, fr((u - .1) / .16)) * (1 - sm(.9, .96, fr((u - .1) / .16))) * sm(.04, .1, fr((v - .1) / .16)) * (1 - sm(.9, .96, fr((v - .1) / .16)));
      return [c[0] * k, c[1] * k, c[2] * k];
    }
    case 7: { const k = box(.1, .9) * sm(.12, .2, fr((u - .1) * 7.5)) * line(v - .3, .015); return [k, k, k]; }   // a barred window: upright bars and a crossbar
    default: return [1, 1, 1];
  }
}
export const shapeIndex = name => name == null ? -1 : typeof name === 'number' ? name : SHAPES.indexOf(name);
const canvas = (w, h) => { if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; } return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : null; };
const ONE = new Map();
/** WebGL: a shape's picture for three's SpotLight.map ('none': all light). */
export function shapeTexture(name, size = 128) {
  if (ONE.has(name)) return ONE.get(name);
  const cv = canvas(size, size); let t = null;
  if (cv) {
    const c = cv.getContext('2d'), img = c.createImageData(size, size), d = img.data, i = shapeIndex(name);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const k = (y * size + x) * 4, col = i < 0 ? [1, 1, 1] : shapeAt(i, (x + .5) / size, (y + .5) / size);
      // (sRGB, as three reads a colour picture)
      for (let j = 0; j < 3; j++) d[k + j] = Math.round(255 * Math.pow(Math.min(1, Math.max(0, col[j])), 1 / 2.2));
      d[k + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    t = new CanvasTexture(cv); t.colorSpace = SRGBColorSpace; t.minFilter = LinearMipmapLinearFilter; t.name = 'lamp shape ' + name;
  }
  ONE.set(name, t); return t;
}

/* ---------- a sign's own picture ---------- */
// each picture a sign lights with, as a 128 x 128 picture (the decals' atlas square's size) and its average colour
const PICS = new WeakMap(), PIC_PX = 128;
function picOf(src, live) {
  let p = PICS.get(src);
  if (!p) {
    const cv = canvas(PIC_PX, PIC_PX); if (!cv) return null;
    const tex = new CanvasTexture(cv); tex.colorSpace = SRGBColorSpace; tex.minFilter = LinearMipmapLinearFilter; tex.name = 'sign picture';
    p = { cv, c: cv.getContext('2d', { willReadFrequently: true }), tex, ver: null, dirty: false, mean: null, meanVer: null, small: null };
    PICS.set(src, p);
  }
  const img = src.isTexture ? src.image : src, ver = src.isTexture ? src.version : live ? NaN : 0;
  if (img && !(ver === p.ver)) {   // (NaN: every frame)
    p.ver = ver; p.c.clearRect(0, 0, PIC_PX, PIC_PX); p.c.drawImage(img, 0, 0, PIC_PX, PIC_PX); p.tex.needsUpdate = true; p.dirty = true; p.meanVer = null;
  }
  return p;
}
// (WebGL) its average colour, halved down to 16 x 16 and read once each time it changes
function meanOf(p) {
  if (p.mean && p.meanVer === p.ver) return p.mean;   // (a live picture's version is NaN: read again every frame)
  const s = p.small ||= canvas(64, 64), c = s.getContext('2d', { willReadFrequently: true });
  c.clearRect(0, 0, 64, 64); c.drawImage(p.cv, 0, 0, 64, 64); c.drawImage(s, 0, 0, 64, 64, 0, 0, 32, 32); c.drawImage(s, 0, 0, 32, 32, 0, 0, 16, 16);
  const d = c.getImageData(0, 0, 16, 16).data; let r = 0, g = 0, b = 0;
  const lin = x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; };
  for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; r += lin(d[i]) * a; g += lin(d[i + 1]) * a; b += lin(d[i + 2]) * a; }
  const n = d.length / 4; (p.mean ||= [1, 1, 1]); p.mean[0] = r / n; p.mean[1] = g / n; p.mean[2] = b / n; p.meanVer = p.ver;
  return p.mean;
}

/* ---------- the pool ---------- */
// by tier (index: low, medium, high, ultra): shadow slots in the WebGPU atlas, slots drawn at most a frame, and on
// WebGL the spot lights (for lamps with a dir or a shadow; with three's own shadows where the tier has shadows)
export const SLOTS = [0, 4, 8, 16], SLOT_DRAWS = [0, 1, 3, 4], GL_CONES = [1, 2, 2, 4];
const LIT_MAX = 64;   // lights a pool's lit list holds (lampLightAt)
/**
 * The light the pool's lit lamps (pool.lit, after place()) shine on a point, as three works a point light out (its
 * intensity over its distance to the power of its decay, faded out to nothing at its reach): out = [r, g, b]. For things
 * lit on the CPU, which three's lights don't reach (particles). lit may be null.
 */
export function lampLightAt(lit, x, y, z, out) {
  let r = 0, g = 0, b = 0;
  if (lit) for (let i = 0, a = lit.a; i < lit.n; i++) {
    const o = i * 8, dx = x - a[o], dy = y - a[o + 1], dz = z - a[o + 2], d2 = dx * dx + dy * dy + dz * dz, R2 = a[o + 6] * a[o + 6];
    if (d2 >= R2) continue;
    const q = d2 / R2, w = (1 - q * q) * (1 - q * q) / Math.max(.01, Math.pow(d2, a[o + 7] * .5));
    r += a[o + 3] * w; g += a[o + 4] * w; b += a[o + 5] * w;
  }
  out[0] = r; out[1] = g; out[2] = b; return out;
}
const DOWN = new Vector3(0, -1, 0), V = new Vector3(), W = new Vector3(), SHADOW_ANGLE = 1.15;
const KIND = { point: 0, tube: 1, rect: 2 };
const vec = (d, x, y, z) => Array.isArray(d) ? V.set(d[0], d[1], d[2]) : V.set(d.x ?? x, d.y ?? y, d.z ?? z);
// (a camera looking straight up or down has no "up" of its own: north is up then, the same for a shadow's slot and a shape)
const AIM = new Vector3();
function aim(cam, from, to) {
  cam.position.copy(from); AIM.subVectors(to, from).normalize();
  cam.up.set(0, 1, 0); if (Math.abs(AIM.y) > .999) cam.up.set(0, 0, -1);
  cam.lookAt(to); cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
}

/**
 * The lamp pool of one view. Every pool light is in view.lamps: a point light for round lamps, tubes and signs, a
 * spot light for lamps with a dir (WebGPU) or with a shadow (WebGL). Each light's userData.gsLamp says what the WebGPU
 * lights node needs to know about it beyond three's own numbers (lamps-gpu.js): its shadow slot, its shape, its tube
 * or sign, and the matrix that takes a place in the world to its slot's (or shape's) picture.
 */
export class LampPool {
  constructor(view, dist = 7) {
    this.view = view; this.dist = dist; this.points = []; this.cones = []; this.used = new Map(); this.was = new Map();
    this.slots = []; this.slotPx = 0; this.cols = 4; this.rows = 0; this.atlasGen = 0; this.scratch = new PerspectiveCamera(); this.gpu = false;
    this.stats = { slots: 0, drawn: 0, waiting: 0 };
  }
  light(kind) {
    const l = kind === 'cone' ? new SpotLight('#ffd8a0', 0, this.dist, .6, .4, 1.6) : new PointLight('#ffd8a0', 0, this.dist, 1.6);
    l.userData.gsLamp = { slot: -1, shape: -1, kind: 0, reach: this.dist, a: new Vector3(), ha: 0, b: new Vector3(), hb: 0, m: new Matrix4(), proj: false, texel: 0, want: false, slotOf: null, pic: null, held: null, cell: -1 };
    if (l.isSpotLight) { this.view.scene.add(l.target); l.castShadow = false; }
    this.view.scene.add(l); this.view.lamps.push(l); (kind === 'cone' ? this.cones : this.points).push(l);
    return l;
  }
  /** The pool lights made by lampLights(): the round ones, made before any frame (they are what a game turns off by day). */
  adopt(l) { l.userData.gsLamp ||= { slot: -1, shape: -1, kind: 0, reach: this.dist, a: new Vector3(), ha: 0, b: new Vector3(), hb: 0, m: new Matrix4(), proj: false, texel: 0, want: false, slotOf: null, pic: null, held: null, cell: -1 }; this.points.push(l); }
  /**
   * The frame's lamps (HDView.placeLamps). T: the tier (ti its index); many: clustered lights (WebGPU) light 8 times
   * as many; gpu: drawn on WebGPU (shadows in the atlas, shapes, tubes and signs) or WebGL (three's own lights).
   */
  place(spots, x, y, z, t, T, ti, many, gpu) {
    const v = this.view, shadowOn = T.shadow > 0; this.gpu = gpu;
    // (WebGL, a pool made only for flashes (HDView.wantFlashes): its one light, so a game with no lamps pays for one more light, not four)
    const nMax = gpu && many ? T.lights * 8 : Math.min(T.lights, 4, !gpu && this.only ? this.only : 4);
    // the nearest first, by how far each is (a spot's rank shrinks that: a flash goes before the lamps round it)
    const near = this.near ||= []; near.length = 0;
    for (const s of spots) { const d2 = (s.x - x) ** 2 + (s.z - z) ** 2 + (s.y - y) ** 2; near.push([s, d2 * (s.rank ?? 1), d2]); }
    near.sort((a, b) => a[1] - b[1]);
    const n = Math.min(near.length, nMax);
    // WebGL: the pools made once at their tier's size, every light kept switched on (a light coming or going, or one
    // gaining or losing a shadow or a shape, rebuilds every shader there); the spot lights all carry a shape (a plain
    // one when the lamp has none) for the same reason, and are made only once a lamp wants one (a lamp with a dir or a
    // shadow), so a game with round lamps only pays for none
    let glCones = 0;
    if (!gpu) {
      while (this.points.length < nMax) this.light('point');
      if (!this.cones.length) for (let i = 0; i < n; i++) { const s = near[i][0]; if ((s.dir || s.shadow) && !s.tube && !s.rect) { glCones = GL_CONES[ti]; break; } }
      while (this.cones.length < glCones) { const l = this.light('cone'); l.shadow.bias = -.0005; l.shadow.normalBias = .03; l.shadow.camera.near = .1; l.shadow.radius = 2; l.map = shapeTexture('none'); }
      glCones = this.cones.length;
    }
    // which kind of light each of the nearest gets, and whether it may have a shadow (WebGPU: the slots are handed out
    // at drawing time, nearest first; WebGL: as many as the pool has spot lights)
    let conesLeft = glCones;
    const want = this.want ||= []; want.length = 0;
    for (let i = 0; i < n; i++) {
      const s = near[i][0], shaped = !!(s.tube || s.rect);
      let kind = 'point', shadow = !!s.shadow && shadowOn && !shaped;
      if (gpu) { if (s.dir && !shaped) kind = 'cone'; }
      else if ((shadow || s.dir) && !shaped && conesLeft > 0) { kind = 'cone'; conesLeft--; } else shadow = false;
      want.push({ s, kind, shadow, d2: near[i][2], key: near[i][1], i, l: null });
    }
    // lights kept from last frame (a spot keeps its light while it stays among the nearest), then free ones, then new ones (WebGPU)
    [this.used, this.was] = [this.was, this.used]; const was = this.was, cur = this.used; cur.clear();
    const taken = this.taken ||= new Set(); taken.clear();
    const kindOf = l => l.isSpotLight ? 'cone' : 'point';
    for (const w of want) { const l = was.get(w.s); if (l && !taken.has(l) && kindOf(l) === w.kind) { w.l = l; taken.add(l); } }
    for (const w of want) {
      if (w.l) continue;
      const pool = w.kind === 'cone' ? this.cones : this.points;
      let l = pool.find(o => !taken.has(o)) || null;
      if (!l && gpu) l = this.light(w.kind);
      if (!l) continue;
      w.l = l; taken.add(l);
    }
    const fadeN = near[n] ? near[n][1] : null;
    for (const w of want) {
      const { s, l, shadow, d2, key, i } = w; if (!l) continue;
      cur.set(s, l);
      const L = l.userData.gsLamp, reach = s.reach ?? this.dist;
      l.color.set(s.col || '#ffd8a0'); l.decay = s.decay ?? 1.6;
      const fl = s.flick ? (Math.sin(t * 31 + s.x * 7) > .6 || Math.sin(t * 3.1 + s.z) > .95 ? .25 : 1) : 1;
      // fade the furthest light in/out so swapping which lamps are lit never pops
      const fade = i === n - 1 && fadeN != null ? Math.max(0, Math.min(1, (fadeN - key) * .6)) : 1;
      l.intensity = (s.i ?? 6) * fl * fade; s.lit = fl;
      L.reach = reach; L.shape = gpu ? shapeIndex(s.shape) : -1; L.kind = 0; L.ha = L.hb = 0; L.pic = null; L.want = gpu && shadow; L.near = d2; L.zNear = s.near || 0;
      if (s.tube) {
        // a tube: the light sits at its middle, and reaches as far past every part of it as a lamp would
        vec(s.tube, s.x, s.y, s.z); l.position.set((s.x + V.x) / 2, (s.y + V.y) / 2, (s.z + V.z) / 2);
        L.a.set(V.x - s.x, V.y - s.y, V.z - s.z); L.ha = L.a.length() / 2; if (L.ha > 0) L.a.divideScalar(L.ha * 2);
        L.kind = gpu ? KIND.tube : 0; l.distance = reach + (gpu ? L.ha : 0);
      } else if (s.rect) {
        // a sign: its middle; its face's sideways (a) and upward (b) edges, half widths ha and hb; it shines from its
        // front, the side its normal points to (a x b)
        const r = s.rect; l.position.set(s.x, s.y, s.z);
        W.copy(vec(r.normal || [0, 0, 1], 0, 0, 1)).normalize();
        L.b.set(0, 1, 0); if (Math.abs(W.y) > .9) L.b.set(0, 0, -1);
        L.a.crossVectors(L.b, W).normalize(); L.b.crossVectors(W, L.a).normalize();
        L.ha = (r.w ?? 1) / 2; L.hb = (r.h ?? 1) / 2; L.kind = gpu ? KIND.rect : 0; l.distance = reach + (gpu ? Math.hypot(L.ha, L.hb) : 0);
        // its own picture: on WebGPU read where each part of its light comes from (pictures(), lamps-gpu.js); on WebGL its average colour
        if (s.picture) { L.pic = picOf(s.picture, s.live); if (L.pic && !gpu) { const m = meanOf(L.pic); l.color.r *= m[0]; l.color.g *= m[1]; l.color.b *= m[2]; } }
      } else { l.position.set(s.x, s.y, s.z); l.distance = reach; }
      if (l.isSpotLight) {
        l.target.position.copy(l.position).add(vec(s.dir || DOWN, 0, -1, 0).normalize());
        l.angle = Math.min(1.45, s.angle ?? (s.dir ? .6 : SHADOW_ANGLE)); l.penumbra = s.soft ?? (s.dir ? .45 : .7);
        if (!gpu) {
          // WebGL: a spot light with a shadow (three's own) and its shape, if it has one (three projects light.map
          // through the shadow's own camera)
          const map = shapeTexture(s.shape || 'none'); if (l.map !== map) l.map = map;
          const px = Math.max(128, T.shadow >> 1); if (l.shadow.mapSize.x !== px) { l.shadow.mapSize.set(px, px); l.shadow.map?.dispose?.(); l.shadow.map = null; }
          l.shadow.camera.far = reach; l.shadow.camera.up.set(0, 1, 0); if (Math.abs(V.y) > .999) l.shadow.camera.up.set(0, 0, -1);
          const zn = s.near || .1; if (l.shadow.camera.near !== zn) { l.shadow.camera.near = zn; l.shadow.camera.updateProjectionMatrix(); }
        }
      }
      l.visible = true;
    }
    // lights with no spot this frame go dark; on WebGL they stay switched on (see above), on WebGPU they are hidden
    // (clustered lights coming and going build nothing)
    for (const l of v.lamps) {
      if (taken.has(l)) continue;
      l.intensity = 0; const L = l.userData.gsLamp; if (L) { L.want = false; L.shape = -1; L.kind = 0; L.slot = -1; L.pic = null; }
      l.visible = !gpu && (l.isSpotLight || this.points.indexOf(l) < nMax);
    }
    // (WebGPU's spot lights carry neither: three would light them outside the clusters, each with a map and a shader of its own)
    for (const l of this.cones) { l.castShadow = !gpu && shadowOn; if (gpu && l.map) l.map = null; }
    // what is lit now, for things that light themselves by it on the CPU (particles: lampLightAt)
    const lit = this.lit ||= { n: 0, a: new Float32Array(LIT_MAX * 8) }, a = lit.a; lit.n = 0;
    for (const w of want) {
      const l = w.l; if (!l || !(l.intensity > 0) || lit.n >= LIT_MAX) continue;
      const o = lit.n++ * 8; a[o] = l.position.x; a[o + 1] = l.position.y; a[o + 2] = l.position.z;
      a[o + 3] = l.color.r * l.intensity; a[o + 4] = l.color.g * l.intensity; a[o + 5] = l.color.b * l.intensity; a[o + 6] = l.distance || this.dist; a[o + 7] = l.decay;
    }
  }
  /**
   * WebGPU, at drawing time: each sign lit with its own picture holds a square of the decals' atlas (fx: hd3d-gpu.js's
   * decalCell, decalFree, decalRefresh), copied in when it is first shown and again each time the picture changes; a
   * sign with no square left lights in its own colour.
   */
  pictures(fx, r) {
    this.fx = fx;
    for (const l of this.view.lamps) {
      const L = l.userData.gsLamp; if (!L) continue;
      const want = l.visible && l.intensity > 0 && L.kind === KIND.rect ? L.pic : null;
      if (want !== L.held) {
        if (L.cell >= 0) fx.decalFree(L.cell);
        L.held = want; L.cell = want ? fx.decalCell(r, want, want.tex) : -1;
        if (want) want.dirty = false;
      } else if (want?.dirty && L.cell >= 0) { fx.decalRefresh(r, L.cell, want.tex); want.dirty = false; }
    }
  }
  /**
   * WebGPU, at drawing time (the world's matrices worked out, origin.js's centre in place): hand the lamps that want a
   * shadow their slots in the atlas (nearest first; a lamp keeps its slot while it wants one), and point each slot's
   * stand-in (a spot light outside the scene, whose shadow camera HDView.shadowLights hashes what it sees through) at
   * its lamp. ti: the tier's index.
   */
  prepare(T, ti) {
    const lights = this._want ||= []; lights.length = 0;
    for (const l of this.view.lamps) { const L = l.userData.gsLamp; if (L) L.slotOf = null; if (l.visible && l.intensity > 0 && L?.want) lights.push(l); }
    // (no slots, and no atlas, until a lamp first wants a shadow: a pool of flashes, or lamps without shadows, has none)
    if (lights.length) this.shadowy = true;
    const K = T.shadow > 0 && this.shadowy ? SLOTS[ti] : 0, px = Math.max(64, T.shadow >> 1), rows = Math.ceil(K / this.cols);
    if (px !== this.slotPx || rows !== this.rows) { this.slotPx = px; this.rows = rows; }   // (atlasGen: the atlas's own, set after it is sized: lamps-gpu.js)
    while (this.slots.length < K) this.slots.push(newSlot(this.slots.length));
    this.slots.length = K;
    lights.sort((a, b) => a.userData.gsLamp.near - b.userData.gsLamp.near);
    if (lights.length > K) lights.length = K;
    for (const s of this.slots) if (s.light && !lights.includes(s.light)) { s.light = null; s.ready = false; }
    for (const l of lights) if (!this.slots.some(s => s.light === l)) { const s = this.slots.find(o => !o.light); s.light = l; s.ready = false; s.wait = 0; }
    for (const s of this.slots) {
      const l = s.light, P = s.proxy; if (!l) continue;
      const L = l.userData.gsLamp, c = P.shadow.camera;
      P.position.setFromMatrixPosition(l.matrixWorld);
      if (l.isSpotLight) { P.target.position.setFromMatrixPosition(l.target.matrixWorld); P.angle = Math.min(1.35, l.angle + .03); }
      else { P.target.position.copy(P.position).add(DOWN); P.angle = SHADOW_ANGLE; }
      P.distance = L.reach; c.far = Math.max(1, L.reach); c.near = L.zNear || Math.max(.02, Math.min(.1, L.reach * .02));
      P.shadow.mapSize.set(this.slotPx, this.slotPx);
      P.updateMatrixWorld(); P.target.updateMatrixWorld();
      if (c.coordinateSystem !== 2001) c.coordinateSystem = 2001;   // (WebGPU's depth runs 0..1)
      // three's own: fov, aspect and far from the light, then the camera aimed at the target (with our up, below)
      P.shadow.updateMatrices(P);
      aim(c, P.position, P.target.position); c.updateProjectionMatrix();
      P.shadow.matrix.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse); P.shadow._frustum.setFromProjectionMatrix(P.shadow.matrix, c.coordinateSystem);
      P.gsAt.copy(P.position); L.slotOf = s;
    }
  }
  /** The slots that have a lamp, for the frame's shadow walk (HDView.shadowLights) and gs.props' copies (their cameras). */
  proxies() { const o = this._px ||= []; o.length = 0; for (const s of this.slots) if (s.light) o.push(s.proxy); return o; }
  /**
   * After the walk: draws the slots that are due (draw(slot): into the atlas), at most the tier's few a frame, a slot not
   * yet drawn for its lamp first (the lamp has no shadow until it is), then the one waiting longest; and works out the
   * numbers each lamp's light reads (lamps-gpu.js): its slot, and the matrix from the world to its slot's picture or,
   * a shaped lamp with no slot, its own.
   */
  finish(ti, draw) {
    let budget = SLOT_DRAWS[ti] || 0;
    const due = this._due ||= []; due.length = 0;
    for (const s of this.slots) { if (s.gen !== this.atlasGen) s.ready = false; if (s.light && (s.proxy.shadow.needsUpdate || !s.ready)) { s.wait++; due.push(s); } }   // (a new atlas, or one another view drew into: nothing in it is this pool's)
    due.sort((a, b) => (a.ready === b.ready ? b.wait - a.wait : a.ready ? 1 : -1));
    let drawn = 0;
    for (const s of due) { if (budget <= 0) break; budget--; draw(s); s.proxy.shadow.needsUpdate = false; s.ready = true; s.gen = this.atlasGen; s.wait = 0; drawn++; }
    const St = this.stats; St.slots = this.slots.filter(s => s.light).length; St.drawn = drawn; St.waiting = due.length - drawn;
    for (const l of this.view.lamps) {
      const L = l.userData.gsLamp; if (!L) continue;
      const s = L.slotOf;
      if (s && s.light === l && s.ready) {
        const c = s.proxy.shadow.camera; L.slot = s.i; L.proj = true; L.m.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse); L.texel = 2 * Math.tan(s.proxy.angle) / this.slotPx;
      } else if (L.shape >= 0 && l.intensity > 0 && l.visible) {
        const c = this.scratch; V.setFromMatrixPosition(l.matrixWorld);
        if (l.isSpotLight) { W.setFromMatrixPosition(l.target.matrixWorld); c.fov = Math.min(170, l.angle * 360 / Math.PI); } else { W.copy(V).add(DOWN); c.fov = SHADOW_ANGLE * 360 / Math.PI; }
        c.aspect = 1; c.near = .05; c.far = Math.max(1, L.reach); c.coordinateSystem = 2001; aim(c, V, W); c.updateProjectionMatrix();
        L.slot = -1; L.proj = true; L.m.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse); L.texel = 0;
      } else { L.slot = -1; L.proj = false; }
    }
  }
  dispose() { for (const l of this.view.lamps) { const L = l.userData.gsLamp; if (L?.cell >= 0) { this.fx?.decalFree(L.cell); L.cell = -1; L.held = null; } l.removeFromParent(); l.target?.removeFromParent(); } this.view.lamps.length = 0; this.points.length = this.cones.length = 0; this.slots.length = 0; }
}
function newSlot(i) {
  const P = new SpotLight('#fff', 0, 10, SHADOW_ANGLE, 0, 1.6); P.castShadow = true; P.gsProxy = true; P.gsAt = new Vector3(); P.name = 'lamp shadow ' + i;
  P.shadow.bias = -.0006; P.shadow.normalBias = .02;
  return { i, proxy: P, light: null, ready: false, wait: 0, gen: -1 };
}
