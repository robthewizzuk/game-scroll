// Falling sand and destructible ground: a grid where every cell is a material that behaves by itself
// (sand piles up, water and oil flow and settle by weight, fire spreads through wood and oil and leaves
// smoke, acid eats ground, slow lava sets fire to things and turns to stone where water cools it) and solid ground you can blast holes in, the loose bits falling as rubble.
// For sand toys, digging games, worm-style artillery and physics puzzles. The kit runs the grid and
// paints it into a picture; your game draws that picture scaled up and keeps its own heroes, who ask
// solid(x, y) to stand on it.
//
//   const { Sand, M } = gs.sand;
//   reset() { sand = new Sand(120, 200); sand.fill((x, y) => y > 150 ? M.DIRT : M.EMPTY); }
//   move(x, y, pressed) { if (pressed) sand.paint(x / 3, y / 3, 3, M.WATER); }   // 3 game units a cell
//   update(dt) { sand.update(dt); }                                                // 60 steps a second
//   draw(c) { c.imageSmoothingEnabled = false; c.drawImage(sand.picture(), 0, 0, 360, 600); }
//   boom(x, y) { sand.blast(x / 3, y / 3, 8); }                                    // a hole, rubble flies
//
// A CPU grid in flat arrays: about 120 x 200 cells runs well inside a phone's frame. Each step walks
// from the bottom up and turns left/right every step so piles don't lean.
import { timed } from './prof.js';

/** Materials. EMPTY, WALL (never moves or breaks), DIRT (solid, blasts into sand), WOOD (solid, burns), SAND, WATER, OIL, FIRE, SMOKE, ACID, STEAM, LAVA (slow, hot), STONE (solid: cooled lava). */
export const M = Object.freeze({ EMPTY: 0, WALL: 1, DIRT: 2, WOOD: 3, SAND: 4, WATER: 5, OIL: 6, FIRE: 7, SMOKE: 8, ACID: 9, STEAM: 10, LAVA: 11, STONE: 12 });
// colours as [r, g, b] with how much each cell's shade varies
const COL = [[0, 0, 0, 0], [92, 92, 104, 6], [122, 88, 56, 14], [140, 98, 58, 10], [224, 196, 120, 18], [52, 120, 220, 8], [92, 70, 40, 6], [255, 140, 40, 40], [90, 90, 96, 12], [120, 230, 60, 12], [200, 210, 225, 10], [255, 96, 24, 34], [70, 66, 72, 10]];
const SOLID = new Set([M.WALL, M.DIRT, M.WOOD, M.STONE]);
const DENSITY = [0, 99, 99, 99, 10, 5, 4, 0, -1, 6, -2, 8, 99];   // heavier sinks through lighter (liquids and powders); negative rises
const FLOW = { [M.WATER]: 4, [M.OIL]: 3, [M.ACID]: 3, [M.LAVA]: 1 };

export class Sand {
  constructor(w = 120, h = 200, { seed = 1 } = {}) {
    this.w = w; this.h = h; const n = w * h;
    this.t = new Uint8Array(n); this.life = new Uint8Array(n); this.shade = new Uint8Array(n); this.stepped = new Uint8Array(n);
    this.tick = 0; this.acc = 0; this.rate = 60; this.s = seed >>> 0 || 1;
    this.cv = null; this.img = null; this.px = null; this.dirty = true; this.bg = [0, 0, 0, 0];
  }
  rnd() { let s = this.s; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; this.s = s >>> 0; return this.s / 4294967296; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  /** The material at a cell (WALL outside the grid). */
  get(x, y) { x |= 0; y |= 0; return this.inside(x, y) ? this.t[y * this.w + x] : M.WALL; }
  set(x, y, m) { x |= 0; y |= 0; if (!this.inside(x, y)) return; const i = y * this.w + x; this.t[i] = m; this.shade[i] = this.rnd() * 255; this.life[i] = m === M.FIRE ? 30 + this.rnd() * 40 : m === M.SMOKE || m === M.STEAM ? 60 + this.rnd() * 80 : 0; this.dirty = true; }
  /** Whether a cell is something to stand on or bump into (walls, ground, wood, sand piles). */
  solid(x, y) { const m = this.get(x, y); return SOLID.has(m) || m === M.SAND; }
  /** Fills every cell from fn(x, y) => material. */
  fill(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, fn(x, y)); return this; }
  /** Paints a disc of a material (only over empty cells unless over is true). */
  paint(cx, cy, r, m, { over = false, chance = 1 } = {}) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r || !this.inside(x, y) || this.rnd() > chance) continue;
      if (over || this.t[y * this.w + x] === M.EMPTY || m === M.EMPTY) this.set(x, y, m);
    }
    return this;
  }
  /** Blasts a hole: ground and wood inside r are gone, a ring round it breaks into falling sand, and fire if hot. Returns cells removed. */
  blast(cx, cy, r, { fire = true } = {}) {
    let n = 0;
    for (let y = Math.floor(cy - r * 1.3); y <= cy + r * 1.3; y++) for (let x = Math.floor(cx - r * 1.3); x <= cx + r * 1.3; x++) {
      if (!this.inside(x, y)) continue; const d = Math.hypot(x - cx, y - cy), m = this.t[y * this.w + x];
      if (m === M.WALL) continue;
      if (d <= r) { if (m !== M.EMPTY) n++; this.set(x, y, fire && this.rnd() < .08 ? M.FIRE : M.EMPTY); }
      else if (d <= r * 1.3 && (m === M.DIRT || m === M.STONE) && this.rnd() < .6) this.set(x, y, M.SAND);
    }
    return n;
  }
  /** How many cells of a material there are (in a box: x, y, w, h). */
  count(m, x = 0, y = 0, w = this.w, h = this.h) { let n = 0; for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) if (this.t[j * this.w + i] === m) n++; return n; }
  /** Runs the grid on: `rate` steps a second (60), however long the frame was. */
  update(dt) { this.acc = Math.min(this.acc + dt, .1); while (this.acc >= 1 / this.rate) { this.acc -= 1 / this.rate; this.step(); } return this; }
  swap(i, j) { const t = this.t, l = this.life, s = this.shade; [t[i], t[j]] = [t[j], t[i]]; [l[i], l[j]] = [l[j], l[i]]; [s[i], s[j]] = [s[j], s[i]]; this.stepped[j] = this.tick & 255 | 1; }
  /** Moves the cell at i into j when j is lighter (empty, or a lighter fluid). */
  tryMove(i, x, y) {
    if (!this.inside(x, y)) return false;
    const j = y * this.w + x, a = this.t[i], b = this.t[j];
    if (SOLID.has(b) || b === a) return false;
    if (b !== M.EMPTY) {
      const cy = (i / this.w) | 0, da = DENSITY[a], db = DENSITY[b];
      const sinks = y > cy && da > db, rises = y < cy && da < 0 && db > da;   // heavier sinks through lighter; gas rises through anything
      if (!sinks && !rises) return false;
    }
    this.swap(i, j); return true;
  }
  step() {
    this.tick++; const { w, h, t } = this, mark = this.tick & 255 | 1, flip = this.tick & 1;
    for (let y = h - 1; y >= 0; y--) {
      for (let k = 0; k < w; k++) {
        const x = flip ? k : w - 1 - k, i = y * w + x, m = t[i];
        if (m <= M.WOOD || m === M.STONE || this.stepped[i] === mark) continue;
        const dir = this.rnd() < .5 ? -1 : 1;
        if (m === M.SAND) { this.tryMove(i, x, y + 1) || this.tryMove(i, x + dir, y + 1) || this.tryMove(i, x - dir, y + 1); continue; }
        if (m === M.LAVA) {   // sets fire to wood and oil, water cools it to stone (the water boils off)
          for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
            const nx = x + dx, ny = y + dy, nm = this.get(nx, ny);
            if (nm === M.WATER) { this.set(x, y, M.STONE); this.set(nx, ny, M.STEAM); break; }
            if ((nm === M.WOOD && this.rnd() < .04) || (nm === M.OIL && this.rnd() < .2)) this.set(nx, ny, M.FIRE);
            else if (nm === M.EMPTY && dy === -1 && this.rnd() < .002) this.set(nx, ny, M.SMOKE);
          }
          if (t[i] !== M.LAVA || this.rnd() < .55) continue;   // thick: moves about every other step
        }
        if (m === M.WATER || m === M.OIL || m === M.ACID || m === M.LAVA) {
          if (m === M.ACID) { for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0]]) { const nx = x + dx, ny = y + dy, nm = this.get(nx, ny); if ((nm === M.DIRT || nm === M.WOOD || nm === M.SAND) && this.rnd() < .05) { this.set(nx, ny, M.EMPTY); if (this.rnd() < .3) { this.set(x, y, M.SMOKE); break; } } } if (t[i] !== M.ACID) continue; }
          if (this.tryMove(i, x, y + 1) || this.tryMove(i, x + dir, y + 1) || this.tryMove(i, x - dir, y + 1)) continue;
          for (let s = 1, n = FLOW[m]; s <= n; s++) { const nx = x + dir * s; if (!this.inside(nx, y) || t[y * w + nx] !== M.EMPTY) { if (s > 1) this.swap(i, y * w + x + dir * (s - 1)); break; } if (s === n) this.swap(i, y * w + nx); }
          continue;
        }
        if (m === M.FIRE) {
          let fuel = false;
          for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
            const nx = x + dx, ny = y + dy, nm = this.get(nx, ny);
            if (nm === M.WOOD || nm === M.OIL) fuel = true;
            if ((nm === M.WOOD && this.rnd() < .05) || (nm === M.OIL && this.rnd() < .25)) this.set(nx, ny, M.FIRE);
            else if (nm === M.WATER) { this.set(nx, ny, M.STEAM); this.set(x, y, M.EMPTY); break; }
          }
          if (t[i] !== M.FIRE) continue;
          if (--this.life[i] <= 0) { this.set(x, y, this.rnd() < .5 ? M.SMOKE : M.EMPTY); continue; }
          if (!fuel && this.rnd() < .6) this.tryMove(i, x + (this.rnd() < .5 ? dir : 0), y - 1);   // (fire on fuel stays and burns it)
          continue;
        }
        if (m === M.SMOKE || m === M.STEAM) {
          if (--this.life[i] <= 0) { this.set(x, y, m === M.STEAM && this.rnd() < .3 ? M.WATER : M.EMPTY); continue; }
          this.tryMove(i, x + (this.rnd() < .4 ? dir : 0), y - 1) || this.tryMove(i, x + dir, y);
        }
      }
    }
    this.dirty = true;
  }
  /** Sets a material's colour [r, g, b, variation] (your game's look). */
  colour(m, rgbv) { COL[m] = rgbv; this.dirty = true; return this; }
  /** The grid as a picture (a canvas w x h pixels; draw it scaled up with smoothing off). bg: the empty colour [r, g, b, a]. */
  picture(bg = this.bg) {
    if (!this.cv) { this.cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(this.w, this.h) : Object.assign(document.createElement('canvas'), { width: this.w, height: this.h }); this.cx = this.cv.getContext('2d'); this.img = this.cx.createImageData(this.w, this.h); this.px = this.img.data; }
    if (!this.dirty) return this.cv;
    const { px, t, shade } = this;
    for (let i = 0, n = t.length; i < n; i++) {
      const m = t[i], o = i * 4;
      if (m === M.EMPTY) { px[o] = bg[0]; px[o + 1] = bg[1]; px[o + 2] = bg[2]; px[o + 3] = bg[3]; continue; }
      const c = COL[m], v = (shade[i] / 255 - .5) * c[3] * 2, f = m === M.FIRE ? this.life[i] / 70 : m === M.LAVA ? .75 + .25 * Math.sin(this.tick * .05 + shade[i] * .1) : 1;
      px[o] = c[0] + v; px[o + 1] = (c[1] + v) * f; px[o + 2] = (c[2] + v) * f; px[o + 3] = m === M.SMOKE || m === M.STEAM ? Math.min(255, 60 + this.life[i]) : 255;
    }
    this.cx.putImageData(this.img, 0, 0); this.dirty = false;
    return this.cv;
  }
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(Sand.prototype, 'update', 'falling sand');
