// Tile levels written as text, with collision: the way pocket-console games built their worlds.
// Each character is one tile. Walls stop you, one-way platforms can be jumped up through, slopes
// can be walked up, and any other letter marks a spot (where the player starts, coins, enemies).
//
//   const { TileMap } = gs.tiles;
//   const LEVEL = `
//     ....................
//     .P......o.o.o.......
//     ......-----.....E...
//     ....../####\\.......
//     ####################`;
//   reset() {
//     map = TileMap.fromText(LEVEL, { size: 16 });          // '#' wall, '-' one-way, '/' '\' slopes, '.' empty
//     hero = { ...map.find('P')[0], w: 12, h: 14, vx: 0, vy: 0 };    // marks give x, y (tile centre)
//     coins = map.find('o');  map.clear('o');               // take marks out of the map once read
//   }
//   update(dt) { const hit = map.move(hero, hero.vx * dt, hero.vy * dt); if (hit.down) hero.vy = 0; }
//   draw(c) { map.draw(c, (c, ch, x, y, s) => { c.fillStyle = '#654'; c.fillRect(x, y, s, s); }, cam); }
//
// Things that move (map.move) are boxes: x, y is the centre, w and h the size, in game units.
// Your own tile kinds: TileMap.fromText(text, { legend: { '~': { solid: false, water: true } } }) and
// map.info(tx, ty).water. map.ray() is a line of sight; map.walkable() feeds gs.ai.NavGrid.

import { linksFor } from './links.js';
const DEFAULT_LEGEND = {
  '#': { solid: true }, '=': { solid: true }, 'X': { solid: true },
  '-': { oneWay: true },
  '/': { slope: 1 }, '\\': { slope: -1 },
  '.': {}, ' ': {},
};

// The 47 joined-corner masks of the "blob" tile set, numbered 0..46 in rising mask order, so
// BLOB_INDEX[mask] is the piece to draw (masks from edges(): corners only set when both sides join).
const BLOB_MASKS = [];
for (let m = 0; m < 256; m++) {
  const n = m & 1, e = m & 4, s = m & 16, w = m & 64;
  if ((m & 2 && !(n && e)) || (m & 8 && !(s && e)) || (m & 32 && !(s && w)) || (m & 128 && !(n && w))) continue;
  BLOB_MASKS.push(m);
}
const BLOB_INDEX = new Int8Array(256).fill(-1);
BLOB_MASKS.forEach((m, i) => { BLOB_INDEX[m] = i; });
/** The 47 blob masks in order (BLOB_MASKS[i] is piece i's 8-bit mask), for drawing your own tile sheet. */
export { BLOB_MASKS };

export class TileMap {
  /** cols × rows tiles of size units, all empty. */
  constructor(cols, rows, { size = 16, legend = {}, link = true } = {}) {
    this.cols = cols; this.rows = rows; this.size = size;
    linksFor(null, link)?.join('tiles', this);   // (links.js: the game's level, for its movers, its guards' sight and flat ears)
    this.legend = { ...DEFAULT_LEGEND, ...legend };
    this.cells = new Array(cols * rows).fill('.');
    this.marks = [];
  }
  /** A map from rows of text (a string with line breaks, or an array). Blank lines and indents are trimmed. */
  static fromText(text, o = {}) {
    let lines = Array.isArray(text) ? text.slice() : String(text).split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    const indent = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^\s*/)[0].length));
    lines = lines.map(l => l.slice(indent).replace(/\s+$/, ''));
    const m = new TileMap(Math.max(...lines.map(l => l.length)), lines.length, o);
    lines.forEach((l, ty) => { for (let tx = 0; tx < m.cols; tx++) { const ch = l[tx] ?? '.'; m.cells[ty * m.cols + tx] = ch; if (!(ch in m.legend)) m.marks.push(m.mark(ch, tx, ty)); } });
    return m;
  }
  get w() { return this.cols * this.size; }
  get h() { return this.rows * this.size; }
  mark(ch, tx, ty) { const s = this.size; return { ch, tx, ty, x: (tx + .5) * s, y: (ty + .5) * s }; }
  /** Every spot marked with ch: [{ x, y (tile centre), tx, ty }]. */
  find(ch) { return this.marks.filter(m => m.ch === ch); }
  /** Turns every ch into empty tiles (after you've read the marks). */
  clear(ch, to = '.') { for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === ch) this.cells[i] = to; return this; }
  inside(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.cols && ty < this.rows; }
  /** The character at tile tx, ty ('#' outside the map, so the edges are walls). */
  get(tx, ty) { return this.inside(tx, ty) ? this.cells[ty * this.cols + tx] : this.edge ?? '#'; }
  set(tx, ty, ch) { if (this.inside(tx, ty)) this.cells[ty * this.cols + tx] = ch; return this; }
  /** What the tile is: { solid, oneWay, slope, ...your legend's fields }. */
  info(tx, ty) { return this.legend[this.get(tx, ty)] || {}; }
  /** The tile under a point in game units. */
  at(x, y) { const s = this.size; return { tx: Math.floor(x / s), ty: Math.floor(y / s), ch: this.get(Math.floor(x / s), Math.floor(y / s)) }; }
  solid(tx, ty) { return !!this.info(tx, ty).solid; }
  /** The floor height of a slope tile at world x, or null if (tx, ty) isn't a slope. */
  slopeY(tx, ty, x) {
    const k = this.info(tx, ty).slope; if (!k) return null;
    const s = this.size, lx = Math.max(0, Math.min(s, x - tx * s));
    return ty * s + (k > 0 ? s - lx : lx);
  }

  /**
   * Moves box (x, y centre, w, h) by dx, dy, stopping at walls. Returns what it touched:
   * { left, right, up, down, slope }. down means standing on something. Options: drop (fall
   * through one-way platforms), stepDown (how far it sticks to slopes going down) and stepUp (the
   * highest ledge it walks straight onto); both default to half a tile.
   */
  move(box, dx, dy, { drop = false, stepDown, stepUp } = {}) {
    const s = this.size, hit = { left: false, right: false, up: false, down: false, slope: 0 };
    const hw = box.w / 2, hh = box.h / 2, wasOn = !!box.onGround;
    // x first, in steps of under half a tile so nothing tunnels through
    const nx = Math.max(1, Math.ceil(Math.abs(dx) / (s / 2)));
    for (let i = 0; i < nx; i++) {
      const step = dx / nx; box.x += step;
      if (step === 0) break;
      const edge = step > 0 ? box.x + hw : box.x - hw, tx = Math.floor((step > 0 ? edge - 1e-6 : edge) / s);
      const y0 = Math.floor((box.y - hh + 1e-6) / s), y1 = Math.floor((box.y + hh - 1e-6) / s);
      let blocked = false, low = -1;
      for (let ty = y0; ty <= y1; ty++) if (this.solid(tx, ty)) { blocked = true; low = ty; }
      // a small step up (the top of a slope, a low ledge) is walked onto, not bumped into
      if (blocked && (wasOn || hit.down) && dy >= 0) {
        const top = low * s, rise = box.y + hh - top;
        let clear = rise > 0 && rise <= (stepUp ?? s / 2);
        for (let ty = Math.floor((top - box.h + 1e-6) / s); clear && ty < low; ty++) if (this.solid(tx, ty)) clear = false;
        for (let ty = y0; clear && ty <= y1; ty++) if (ty !== low && this.solid(tx, ty)) clear = false;
        if (clear) { box.y = top - hh; hit.down = true; blocked = false; }
      }
      if (blocked) { box.x = step > 0 ? tx * s - hw : (tx + 1) * s + hw; hit[step > 0 ? 'right' : 'left'] = true; break; }
      if (dy >= 0) this.onSlope(box, hit);   // walking up a slope (not while jumping off one)
    }
    // then y
    const ny = Math.max(1, Math.ceil(Math.abs(dy) / (s / 2)));
    for (let i = 0; i < ny; i++) {
      const step = dy / ny, before = box.y + hh; box.y += step;
      if (step === 0) break;
      const x0 = Math.floor((box.x - hw + 1e-6) / s), x1 = Math.floor((box.x + hw - 1e-6) / s);
      if (step > 0) {
        const ty = Math.floor((box.y + hh - 1e-6) / s);
        let land = false;
        for (let tx = x0; tx <= x1; tx++) {
          const t = this.info(tx, ty);
          if (t.solid && !this.slopeAbove(tx, ty, box)) land = true;
          else if (t.oneWay && !drop && before <= ty * s + 1e-3) land = true;
        }
        if (land) { box.y = ty * s - hh; hit.down = true; break; }
      } else {
        const ty = Math.floor((box.y - hh) / s);
        let bump = false;
        for (let tx = x0; tx <= x1; tx++) if (this.solid(tx, ty)) bump = true;
        if (bump) { box.y = (ty + 1) * s + hh; hit.up = true; break; }
      }
      if (step > 0 && this.onSlope(box, hit)) break;
    }
    // stick to slopes and steps going down, so running downhill doesn't hop
    if (!hit.down && wasOn && dy >= 0) {
      const reach = stepDown ?? s / 2, fx = box.x, feet = box.y + hh;
      for (let d = 0; d <= reach; d += 1) {
        const { tx, ty } = this.at(fx, feet + d + .5), sy = this.slopeY(tx, ty, fx);
        if (sy != null && sy <= feet + reach && sy >= feet - 1) { box.y = sy - hh; hit.down = true; hit.slope = this.info(tx, ty).slope; break; }
        if (this.solid(tx, ty) || (this.info(tx, ty).oneWay && !drop)) { const top = ty * s; if (top - feet <= reach && top >= feet - 1) { box.y = top - hh; hit.down = true; } break; }
      }
    }
    box.onGround = hit.down;
    return hit;
  }
  slopeAbove(tx, ty, box) { return !!this.info(tx, ty - 1).slope && box.y + box.h / 2 <= ty * this.size + 1; }
  /** If the box's feet are inside a slope, lifts it onto the slope. */
  onSlope(box, hit) {
    const hh = box.h / 2, feet = box.y + hh, { tx, ty } = this.at(box.x, feet - 1e-3), sy = this.slopeY(tx, ty, box.x);
    if (sy != null && feet >= sy) { box.y = sy - hh; hit.down = true; hit.slope = this.info(tx, ty).slope; if (box.vy > 0) box.vy = 0; return true; }
    return false;
  }

  /** First solid tile on the line from (x0, y0) to (x1, y1): { x, y, tx, ty } or null if it's clear. */
  ray(x0, y0, x1, y1) {
    const s = this.size, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, n = Math.ceil(len / (s / 4));
    for (let i = 0; i <= n; i++) { const x = x0 + dx * i / n, y = y0 + dy * i / n, t = this.at(x, y); if (this.solid(t.tx, t.ty)) return { x, y, tx: t.tx, ty: t.ty }; }
    return null;
  }
  /** Can (x0, y0) see (x1, y1) past the walls? */
  sees(x0, y0, x1, y1) { return !this.ray(x0, y0, x1, y1); }
  /** rows of true (open) / false (wall): new gs.ai.NavGrid from it for paths. */
  walkable() { const out = []; for (let ty = 0; ty < this.rows; ty++) { const r = []; for (let tx = 0; tx < this.cols; tx++) r.push(!this.solid(tx, ty)); out.push(r); } return out; }
  /**
   * Auto-tiling: which neighbours of (tx, ty) are the same kind, so your draw function can pick the
   * right edge, corner or middle piece. same: a string of characters that join up ('#=' : walls join
   * walls), a function (ch, tx, ty) => true, or left out (same character). Outside the map counts as
   * joined (edge: false to make it count as open).
   *   const t = map.edges(tx, ty);   t.n, t.e, t.s, t.w (and t.ne, t.se, t.sw, t.nw)
   *   t.mask: 4-bit (n 1, e 2, s 4, w 8): 16 pieces, for simple walls and paths
   *   t.blob: 0..46: the 47-piece set (corners only count when both sides next to them join)
   *   t.blob8: the raw 8-bit mask (n 1, ne 2, e 4, se 8, s 16, sw 32, w 64, nw 128) the blob comes from
   * Read it in draw(): map.draw(c, (c, ch, x, y, s, tx, ty) => drawWall(c, x, y, s, map.edges(tx, ty).mask)).
   */
  edges(tx, ty, same = null, { edge = true } = {}) {
    const me = this.get(tx, ty);
    const join = (x, y) => {
      if (!this.inside(x, y)) return edge;
      const ch = this.cells[y * this.cols + x];
      return typeof same === 'function' ? !!same(ch, x, y) : typeof same === 'string' ? same.includes(ch) : ch === me;
    };
    const n = join(tx, ty - 1), e = join(tx + 1, ty), s = join(tx, ty + 1), w = join(tx - 1, ty);
    const ne = n && e && join(tx + 1, ty - 1), se = s && e && join(tx + 1, ty + 1), sw = s && w && join(tx - 1, ty + 1), nw = n && w && join(tx - 1, ty - 1);
    const mask = (n ? 1 : 0) | (e ? 2 : 0) | (s ? 4 : 0) | (w ? 8 : 0);
    const blob8 = (n ? 1 : 0) | (ne ? 2 : 0) | (e ? 4 : 0) | (se ? 8 : 0) | (s ? 16 : 0) | (sw ? 32 : 0) | (w ? 64 : 0) | (nw ? 128 : 0);
    return { n, e, s, w, ne, se, sw, nw, mask, blob8, blob: BLOB_INDEX[blob8] };
  }
  /**
   * Calls draw(c, ch, x, y, size, tx, ty) for every non-empty tile on screen (all of them without
   * a camera). Your function draws the tile; the map only finds them.
   */
  draw(c, draw, cam = null, { empty = false } = {}) {
    const s = this.size, v = cam ? cam.view : { x: 0, y: 0, w: this.w, h: this.h };
    const tx0 = Math.max(0, Math.floor(v.x / s)), ty0 = Math.max(0, Math.floor(v.y / s));
    const tx1 = Math.min(this.cols - 1, Math.floor((v.x + v.w) / s)), ty1 = Math.min(this.rows - 1, Math.floor((v.y + v.h) / s));
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const ch = this.cells[ty * this.cols + tx];
      if (!empty && (ch === '.' || ch === ' ')) continue;
      draw(c, ch, tx * s, ty * s, s, tx, ty);
    }
    return this;
  }
}
