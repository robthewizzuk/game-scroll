// The look of 2D games: lights in the dark that cast shadows off walls, whole-screen effects (an
// old TV, bloom, colour grading, glitches, shockwaves) and a fast way to draw thousands of sprites.
// Screen effects and fast sprites use PixiJS and pixi-filters (both free, MIT), which load the first
// time a game uses them. The game still decides what everything looks like.
//
//   const { Lights, Screen, Batch } = gs.look2d;
//   reset() {
//     lights = new Lights(W, H, { dark: .85, color: '#05060f' });   // how dark it is away from lights
//     screen = new Screen({ crt: { curvature: 2 }, bloom: { threshold: .6 } });   // make it in make() or reset()
//   }
//   draw(c) {
//     drawLevel(c);
//     lights.draw(c, [{ x: hero.x, y: hero.y, r: 90, color: '#ffcc66' }, ...torches], { walls: map, cam });
//     screen.apply(c);                                   // last: the whole frame goes through the effects
//   }
//   screen.set({ glitch: { slices: 6 } }) to add one, screen.set({ glitch: null }) to take it off.
//
//   Fast sprites (WebGL, for bullet storms and big crowds):
//   batch = new Batch(W, H);  const tex = batch.texture(spr);           // a gs.pixel sprite, a canvas, or (c) => draw, w, h
//   const b = batch.add(tex, x, y);  b.x += 3; b.rotation = .5; b.scale.set(2); b.tint = 0xff8800; b.alpha = .5
//   batch.remove(b);  in draw: batch.draw(c)
//
// Screen effects: crt, bloom, grade (brightness, contrast, saturation, gamma, red/green/blue),
// pixelate, glitch, rgbSplit, film (old film grain), shockwave ({ x, y } in game units; restarts each
// set), godrays, zoomBlur, blur, outline, grayscale. Each takes the options of its pixi-filters filter.

import { lazy } from './lazy.js';
import { prefs } from './prefs.js';
import { GlowField, glowRes } from './glow2d.js';
import { own } from './cleanup.js';

/* ---------- lights (plain canvas, no library) ---------- */

function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  const el = document.createElement('canvas'); el.width = Math.max(1, w); el.height = Math.max(1, h); return el;
}
function hexA(col, a) {
  const m = String(col).match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return col;
  let h = m[1]; if (h.length === 3) h = [...h].map(x => x + x).join('');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

/**
 * Darkness with holes of light. Each light: { x, y, r, color?, power? (0..1), cone? (radians wide),
 * dir? (radians), flicker? (0..1), shadows? (default true), size? (glow: how big the bright middle is) }.
 * walls: a gs.tiles TileMap, anything with ray(x0, y0, x1, y1), or a list of [x1, y1, x2, y2] segments,
 * to cut shadows behind them.
 *
 * glow: true works the light out on the graphics chip instead (2D radiance cascades, glow2d.js): light
 * runs from each light's bright middle and from whatever draw()'s emit(c) paints (lava, neon, a glowing
 * pickup lights the room in its own shape and colour), stops at walls and whatever block(c) paints, and
 * gives soft shadows that sharpen near what casts them; the cost doesn't grow with the lights. Options:
 * res (texels a game unit; picked for the phone), bright (how brightly emit()'s paint shines, 3), haze
 * (the glow added round bright light, .3), sky (the light coming in from past the screen's edges,
 * '#000' none), steady (how much of the last frames' light is kept, .75: steadier, a little slower to
 * follow; 0 none). lights.glowing says whether the chip is doing it; where it can't, the canvas lights
 * draw instead (and emit() is added on top), so a game looks right either way.
 */
export class Lights {
  constructor(w, h, { dark = .85, color = '#000000', pixel = false, rays = 120, scale = 1, glow = false, res = 0, bright = 3, haze = .3, sky = null, steady = .75 } = {}) {
    Object.assign(this, { w, h, dark, color, pixel, rays, scale, glow, bright, haze, sky, steady });
    this.cv = canvas(Math.ceil(w * scale), Math.ceil(h * scale)); this.g = this.cv.getContext('2d'); this.t = 0;
    this.glowing = false;
    if (glow) {
      const k = glowRes(w, h, res); this.res = k;
      this.fw = Math.max(8, Math.ceil(w * k)); this.fh = Math.max(8, Math.ceil(h * k));
      this.field = new GlowField(this.fw, this.fh); own(this);   // (the chip's pictures go when the card leaves the feed)
      this.sc = canvas(this.fw, this.fh); this.sg = this.sc.getContext('2d', { willReadFrequently: false });
      this.bc = null; this.out = [];
    }
  }
  free() { this.field?.free(); }
  /** The points that light at (x, y) reaches, out to r: a polygon around it, cut by walls. */
  reach(l, walls) {
    const n = l.cone ? Math.max(8, Math.ceil(this.rays * l.cone / (Math.PI * 2))) : this.rays, pts = [];
    const a0 = l.cone ? (l.dir || 0) - l.cone / 2 : 0, span = l.cone || Math.PI * 2;
    if (l.cone) pts.push([l.x, l.y]);
    for (let i = 0; i <= n; i++) {
      const a = a0 + span * i / n, ex = l.x + Math.cos(a) * l.r, ey = l.y + Math.sin(a) * l.r;
      let hx = ex, hy = ey;
      if (walls) {
        if (Array.isArray(walls)) { let best = 1; for (const s of walls) { const t = segHit(l.x, l.y, ex, ey, s); if (t < best) best = t; } hx = l.x + (ex - l.x) * best; hy = l.y + (ey - l.y) * best; }
        else if (walls.ray) { const h = walls.ray(l.x, l.y, ex, ey); if (h) { hx = h.x; hy = h.y; } }
      }
      pts.push([hx, hy]);
    }
    return pts;
  }
  /**
   * Draws the darkness and lights over what's on c. cam: a gs.camera2d Camera2D if the world scrolls.
   * With glow: emit(c) paints what glows and block(c) what stops light (any colour: it counts as a
   * wall), both in world units like the lights.
   */
  draw(c, lights, { walls = null, cam = null, dt = 1 / 60, emit = null, block = null } = {}) {
    if (this.glow && this.glowDraw(c, lights, walls, cam, dt, emit, block)) return this;
    this.t += dt;
    const g = this.g, s = this.scale;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.fillStyle = hexA(this.color, this.dark); g.fillRect(0, 0, this.cv.width, this.cv.height);
    g.setTransform(s, 0, 0, s, 0, 0);
    if (cam) { const [ox, oy] = cam.offset(); g.translate(ox, oy); g.scale(cam.zoom, cam.zoom); }
    g.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      const fl = l.flicker ? 1 - l.flicker * (.5 + .5 * Math.sin(this.t * 23 + l.x) * Math.sin(this.t * 7.3 + l.y)) * .5 : 1;
      const r = l.r * fl, p = (l.power ?? 1) * fl;
      const grad = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
      if (this.pixel) { grad.addColorStop(0, `rgba(0,0,0,${p})`); grad.addColorStop(.55, `rgba(0,0,0,${p})`); grad.addColorStop(.56, `rgba(0,0,0,${p * .5})`); grad.addColorStop(.85, `rgba(0,0,0,${p * .5})`); grad.addColorStop(.86, 'rgba(0,0,0,0)'); }
      else { grad.addColorStop(0, `rgba(0,0,0,${p})`); grad.addColorStop(.6, `rgba(0,0,0,${p * .7})`); grad.addColorStop(1, 'rgba(0,0,0,0)'); }
      g.fillStyle = grad;
      g.beginPath();
      if ((walls && l.shadows !== false) || l.cone) { const pts = this.reach({ ...l, r }, l.shadows === false ? null : walls); g.moveTo(pts[0][0], pts[0][1]); for (const q of pts) g.lineTo(q[0], q[1]); g.closePath(); }
      else g.arc(l.x, l.y, r, 0, Math.PI * 2);
      g.fill();
    }
    c.save(); c.globalCompositeOperation = 'source-over';
    if (this.pixel) c.imageSmoothingEnabled = false;
    c.drawImage(this.cv, 0, 0, this.w, this.h);
    // a soft tint of each light's colour on top
    c.globalCompositeOperation = 'lighter';
    if (cam) { const [ox, oy] = cam.offset(); c.translate(ox, oy); c.scale(cam.zoom, cam.zoom); }
    for (const l of lights) if (l.color) {
      const grad = c.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      grad.addColorStop(0, hexA(l.color, .22 * (l.power ?? 1))); grad.addColorStop(1, hexA(l.color, 0));
      c.fillStyle = grad; c.beginPath(); c.arc(l.x, l.y, l.r, 0, Math.PI * 2); c.fill();
    }
    if (emit) { c.globalCompositeOperation = 'lighter'; emit(c); }
    c.restore();
    return this;
  }
  /** flicker's dimming for a light now (1 steady). */
  fl(l) { return l.flicker ? 1 - l.flicker * (.5 + .5 * Math.sin(this.t * 23 + l.x) * Math.sin(this.t * 7.3 + l.y)) * .5 : 1; }
  glowDraw(c, lights, walls, cam, dt, emit, block) {
    const { fw, fh, res: k, sg: g } = this;
    this.t += dt;
    const zoom = cam ? cam.zoom : 1, [ox, oy] = cam ? cam.offset() : [0, 0];
    const world = gg => { gg.setTransform(k, 0, 0, k, 0, 0); gg.translate(ox, oy); gg.scale(zoom, zoom); };
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, fw, fh);
    world(g); g.fillStyle = '#000'; g.strokeStyle = '#000';
    // walls: a TileMap's solid tiles on screen, or segments
    if (walls && walls.cols && walls.solid) {
      const s = walls.size, x0 = Math.max(0, Math.floor(-ox / zoom / s)), y0 = Math.max(0, Math.floor(-oy / zoom / s));
      const x1 = Math.min(walls.cols - 1, Math.ceil((this.w - ox) / zoom / s)), y1 = Math.min(walls.rows - 1, Math.ceil((this.h - oy) / zoom / s));
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (walls.solid(tx, ty)) g.fillRect(tx * s, ty * s, s, s);
    } else if (Array.isArray(walls)) {
      g.lineWidth = 1.6 / (k * zoom); g.beginPath();
      for (const [ax, ay, bx, by] of walls) { g.moveTo(ax, ay); g.lineTo(bx, by); }
      g.stroke();
    }
    if (block) {   // painted in any colour, then made black: it only stops light
      if (!this.bc) { this.bc = canvas(fw, fh); this.bg2 = this.bc.getContext('2d'); }
      const b = this.bg2; b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-over'; b.clearRect(0, 0, fw, fh);
      world(b); block(b);
      b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-in'; b.fillStyle = '#000'; b.fillRect(0, 0, fw, fh);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(this.bc, 0, 0); g.restore();
    }
    if (emit) { g.save(); emit(g); g.restore(); }
    // the lights, in texels: a bright disc each, as bright as reaching r needs (2D light falls off as 1 / distance)
    const out = this.out; out.length = 0;
    for (const l of lights) {
      const f = this.fl(l), x = (l.x * zoom + ox) * k, y = (l.y * zoom + oy) * k, r = l.r * f * zoom * k;
      const a = Math.max(2.5, (l.size ?? Math.min(6, Math.max(2, l.r * .04))) * zoom * k);
      if (x < -r || y < -r || x > fw + r || y > fh + r) continue;
      const L = .35 * Math.PI * r / a * (l.power ?? 1) * f * (l.cone ? Math.sqrt(Math.PI * 2 / Math.max(.2, l.cone)) : 1), [cr, cg, cb] = rgb(l.color || '#ffffff');
      out.push({ x, y, a, cone: l.cone ? l.cone / 2 : 0, dir: l.dir || 0, r: cr * L, g: cg * L, b: cb * L });
    }
    const [dr, dg, db] = rgb(this.color), d = this.dark;
    const pic = this.field.run(this.sc, out, {
      bright: this.bright, haze: this.pixel ? 0 : this.haze, pixel: this.pixel, ow: fw, oh: fh,
      amb: [1 - d + dr * d, 1 - d + dg * d, 1 - d + db * d], sky: this.sky ? rgb(this.sky) : [0, 0, 0],
      shift: [(ox - (this.ox ?? ox)) * k, (oy - (this.oy ?? oy)) * k], keep: this.steady,
    });
    this.ox = ox; this.oy = oy;
    if (!pic) { this.glowing = false; this.t -= dt; return false; }
    this.glowing = true;
    c.save(); if (this.pixel) c.imageSmoothingEnabled = false;
    c.globalCompositeOperation = 'multiply'; c.drawImage(pic, 0, 0, fw, fh, 0, 0, this.w, this.h);
    if (emit) {   // what glows, drawn sharp over the dark at the game's own size
      c.save(); c.globalCompositeOperation = 'source-over';
      if (cam) { c.translate(ox, oy); c.scale(zoom, zoom); }
      emit(c); c.restore();
    }
    if (!this.pixel) { c.globalCompositeOperation = 'lighter'; c.drawImage(pic, 0, fh, fw, fh, 0, 0, this.w, this.h); }
    c.restore();
    return true;
  }
}
const rgbCache = new Map();
function rgb(col) {   // a colour as [r, g, b] 0..1 (hex, or anything the canvas reads)
  let v = rgbCache.get(col); if (v) return v;
  const m = String(col).match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) { let h = m[1]; if (h.length === 3) h = [...h].map(x => x + x).join(''); v = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); }
  else { const t = canvas(1, 1).getContext('2d'); t.fillStyle = col; t.fillRect(0, 0, 1, 1); const p = t.getImageData(0, 0, 1, 1).data; v = [p[0] / 255, p[1] / 255, p[2] / 255]; }
  if (rgbCache.size > 256) rgbCache.clear();
  rgbCache.set(col, v); return v;
}
function segHit(x0, y0, x1, y1, [ax, ay, bx, by]) {   // where (0..1) the ray first crosses segment a-b, or 1
  const rx = x1 - x0, ry = y1 - y0, sx = bx - ax, sy = by - ay, d = rx * sy - ry * sx;
  if (Math.abs(d) < 1e-9) return 1;
  const t = ((ax - x0) * sy - (ay - y0) * sx) / d, u = ((ax - x0) * ry - (ay - y0) * rx) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : 1;
}

/* ---------- PixiJS: screen effects and fast sprites ---------- */

const pixi = lazy('Screen effects', async () => {
  const [P, F] = await Promise.all([import('pixi.js'), import('pixi-filters')]);
  const renderer = await P.autoDetectRenderer({ preference: 'webgl', width: 2, height: 2, backgroundAlpha: 0, antialias: false, preserveDrawingBuffer: true, resolution: 1, autoDensity: false });
  return { P, F, renderer };
});
export const loadLook2D = () => pixi.load();

const scaleOf = c => { const m = c.getTransform?.(); return m ? Math.hypot(m.a, m.b) || 1 : 1; };
function fit(renderer, w, h) { if (renderer.width !== w || renderer.height !== h) renderer.resize(w, h); }

const EFFECTS = {
  crt: (F, o) => new F.CRTFilter({ curvature: 1, lineWidth: 1.5, lineContrast: .2, vignetting: .3, noise: .05, ...o }),
  bloom: (F, o) => new F.AdvancedBloomFilter({ threshold: .55, bloomScale: 1, brightness: 1, blur: 6, quality: 4, ...o }),
  grade: (F, o) => new F.AdjustmentFilter(o),
  pixelate: (F, o) => new F.PixelateFilter(o?.size ?? 4),
  glitch: (F, o) => new F.GlitchFilter({ slices: 5, offset: 20, ...o }),
  rgbSplit: (F, o) => new F.RGBSplitFilter(o),
  film: (F, o) => new F.OldFilmFilter({ sepia: .2, noise: .2, ...o }),
  shockwave: (F, o) => new F.ShockwaveFilter({ amplitude: 20, wavelength: 120, speed: 400, radius: -1, ...o }),
  godrays: (F, o) => new F.GodrayFilter(o),
  zoomBlur: (F, o) => new F.ZoomBlurFilter(o),
  blur: (F, o, P) => new P.BlurFilter(o),
  outline: (F, o) => new F.OutlineFilter(o),
  grayscale: F => new F.GrayscaleFilter(),
};
const ORDER = Object.keys(EFFECTS);
const MOTION = new Set(['crt', 'glitch', 'rgbSplit', 'shockwave', 'film', 'zoomBlur']);   // softened with Reduce motion

/** Whole-screen effects. effects: { crt: {...}, bloom: {...} } (see the list at the top). */
export class Screen {
  constructor(effects = {}) {
    const { P, F, renderer } = pixi.get(); Object.assign(this, { P, F, renderer });
    this.on = {}; this.time = 0; this.set(effects);
  }
  /** Adds, changes (new options) or removes (null) effects. */
  set(effects) {
    for (const [k, o] of Object.entries(effects)) {
      if (!EFFECTS[k]) throw new Error(`Screen has no effect called "${k}" (there's ${ORDER.join(', ')})`);
      if (o === null || o === false) { delete this.on[k]; continue; }
      this.on[k] = { o: o === true ? {} : o, f: EFFECTS[k](this.F, o === true ? {} : o, this.P), t: 0 };
    }
    return this;
  }
  /** The pixi-filters filter for an effect, to change it directly: screen.filter('crt').curvature = 3. */
  filter(name) { return this.on[name]?.f || null; }
  /** Runs the frame drawn on c so far through the effects. Call it last in draw(c). */
  apply(c, dt = 1 / 60) {
    const names = ORDER.filter(k => this.on[k] && !(prefs.reduceMotion && MOTION.has(k) && k !== 'crt'));
    if (!names.length) return this;
    this.time += dt;
    const cv = c.canvas, w = cv.width, h = cv.height, k = scaleOf(c);
    for (const n of names) {
      const e = this.on[n]; e.t += dt; const f = e.f;
      if ('time' in f) f.time = n === 'shockwave' ? e.t : this.time;
      if (n === 'film' || n === 'glitch') { if ('seed' in f) f.seed = Math.random(); if (n === 'glitch' && e.t > (e.o.every ?? .1)) { f.refresh?.(); e.t = 0; } }
      if (n === 'shockwave' && e.o.x != null) f.center = { x: e.o.x * k, y: e.o.y * k };
      if (n === 'pixelate' && e.o.size) f.size = e.o.size * k;
    }
    const { P, renderer } = this;
    fit(renderer, w, h);
    if (!this.tex || this.tex.source.resource !== cv) { this.tex?.destroy(); this.tex = P.Texture.from(cv); this.sprite = new P.Sprite(this.tex); }
    this.tex.source.update();
    this.sprite.filters = names.map(n => this.on[n].f);
    this.sprite.filterArea = new P.Rectangle(0, 0, w, h);
    renderer.render({ container: this.sprite, clear: true });
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'copy'; c.drawImage(renderer.canvas, 0, 0); c.restore();
    return this;
  }
  /** Starts a shockwave at (x, y) (game units). */
  shock(x, y, o = {}) { if (!prefs.reduceMotion) this.set({ shockwave: { ...o, x, y } }); return this; }
}

/** Lots of sprites drawn with WebGL: far faster than the canvas for hundreds or thousands of things. */
export class Batch {
  constructor(w, h, { pixel = false } = {}) {
    const { P, renderer } = pixi.get(); Object.assign(this, { P, renderer, w, h, pixel });
    this.stage = new P.Container();
  }
  /**
   * A texture to make sprites from: a gs.pixel sprite, a canvas or image, or a function
   * (c) => draws, with its width and height.
   */
  texture(src, w, h) {
    const P = this.P; let cv = src;
    if (typeof src === 'function') { cv = canvas(Math.ceil(w), Math.ceil(h)); src(cv.getContext('2d')); }
    else if (src?.img && src.rows) cv = src.img;   // a gs.pixel sprite
    const t = P.Texture.from(cv);
    if (this.pixel || src?.rows) t.source.scaleMode = 'nearest';
    return t;
  }
  /** A sprite at x, y (its centre). Change x, y, rotation, scale, alpha, tint, visible any time. */
  add(tex, x = 0, y = 0, { scale = 1, rotation = 0, alpha = 1, tint } = {}) {
    const s = new this.P.Sprite(tex); s.anchor.set(.5); s.position.set(x, y); s.scale.set(scale); s.rotation = rotation; s.alpha = alpha;
    if (tint != null) s.tint = tint;
    this.stage.addChild(s); return s;
  }
  remove(s) { this.stage.removeChild(s); s.destroy(); return this; }
  clear() { for (const s of [...this.stage.children]) s.destroy(); this.stage.removeChildren(); return this; }
  get count() { return this.stage.children.length; }
  /** Draws every sprite onto c (in game units, over what's there). */
  draw(c) {
    const k = this.pixel ? 1 : scaleOf(c), w = Math.ceil(this.w * k), h = Math.ceil(this.h * k);
    fit(this.renderer, w, h);
    this.stage.scale.set(k);
    this.renderer.render({ container: this.stage, clear: true });
    c.save(); if (this.pixel) c.imageSmoothingEnabled = false;
    c.drawImage(this.renderer.canvas, 0, 0, w, h, 0, 0, this.w, this.h); c.restore();
    return this;
  }
}
