// gs.dungeon's rules, as plain data (no three.js): a text map (gs.gen's, or your own) read into cells and things, and
// dressed from a seed: doors (one locked, its key in a chest you can reach first), a gate opened by a row of levers set
// the right way, pressure plates, spike traps in the corridors, chests, a secret wall that shortens the way, torches
// on the walls, pillars in the big rooms, barrels and crates in the corners. What is open, pressed, found and taken
// is kept here; dungeon3d.js builds and moves the meshes and makes them solid. Kit use only: games reach it through
// gs.dungeon (Dungeon, layout).

import { rng } from './math.js';

/**
 * The letters a map may use (and what gs.gen's dungeon() writes): '#' rock, '.' floor, ' ' nothing, 'S' start, 'E'
 * exit, 'D' door, 'K' locked door, 'G' gate, 'V' lever, 'O' pressure plate, 'C' chest, 'X' spike trap, 'H' secret
 * wall, 'T' torch (on the wall next to it), 'P' pillar, 'B' barrel, 'R' crate. Any other letter is a mark: find() it.
 */
export const LEGEND = { D: 'door', K: 'locked', G: 'gate', V: 'lever', O: 'plate', C: 'chest', X: 'trap', H: 'secret', T: 'torch', P: 'pillar', B: 'barrel', R: 'crate' };
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * Reads a map into cells and things. map: text, or a gs.gen dungeon() result (its rooms are used); size (metres a
 * cell, 3); seed; dress (true: add doors, a locked door and its key, a lever gate, plates, traps, chests, a secret wall,
 * torches, pillars and clutter to what the map has; false: only what the map says). Gives { cols, rows, size, grid
 * (rows of chars: '#' rock, '.' floor, ' ' nothing), rooms, start, exit, marks, things: [{ id, kind, col, row, x, z,
 * axis ('x' | 'z': which way a door or gate is passed through), face ([dx, dz] into the room: a thing on a wall), key,
 * group (levers and plates that work a gate share it with the gate), want (a lever's right setting) }] }; x and z are
 * metres from the map's middle.
 */
export function layout(map, { size = 3, seed = 1, dress = true } = {}) {
  const text = typeof map === 'string' ? map : map.text, rows0 = String(text).replace(/^\s*\n|\n\s*$/g, '').split('\n');
  const indent = Math.min(...rows0.filter(r => r.trim()).map(r => r.match(/^ */)[0].length));
  const raw = rows0.map(r => r.slice(indent).replace(/\s+$/, '')), rows = raw.length, cols = Math.max(...raw.map(r => r.length));
  const grid = raw.map(r => [...r.padEnd(cols, ' ')]);
  const x0 = -cols * size / 2, z0 = -rows * size / 2, at = (c, r) => ({ x: x0 + (c + .5) * size, z: z0 + (r + .5) * size });
  const things = [], marks = {}, R = rng(seed * 2654435761 + 7);
  let start = null, exit = null;
  const add = (kind, c, r, o = {}) => { const t = { id: things.length, kind, col: c, row: r, ...at(c, r), ...o }; things.push(t); return t; };
  const ch = (c, r) => (r < 0 || r >= rows || c < 0 || c >= cols ? ' ' : grid[r][c]);
  const isFloor = (c, r) => { const k = ch(c, r); return k !== '#' && k !== ' '; };
  // what the map says
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = grid[r][c]; if (k === '#' || k === '.' || k === ' ') continue;
    grid[r][c] = k === 'H' || k === 'T' ? '#' : '.';
    if (k === 'S') start = { col: c, row: r, ...at(c, r) };
    else if (k === 'E') exit = { col: c, row: r, ...at(c, r) };
    else if (LEGEND[k]) add(LEGEND[k], c, r);
    else (marks[k] ||= []).push({ col: c, row: r, ...at(c, r) });
  }
  const rooms = (typeof map === 'object' && map.rooms || []).map((q, i) => ({ id: i, col: q.x, row: q.y, cols: q.w, rows: q.h, ...at(q.x + q.w / 2 - .5, q.y + q.h / 2 - .5) }));
  const roomOf = (c, r) => rooms.find(q => c >= q.col && c < q.col + q.cols && r >= q.row && r < q.row + q.rows) || null;
  const thingAt = (c, r) => things.find(t => t.col === c && t.row === r && t.kind !== 'torch' && t.kind !== 'lever');
  // which way a door or gate is passed through, and which way a thing on a wall faces
  const axisOf = (c, r) => (isFloor(c, r - 1) || isFloor(c, r + 1)) && !(isFloor(c - 1, r) && isFloor(c + 1, r) && !isFloor(c, r - 1)) ? 'z' : 'x';
  const wallFace = (c, r) => { for (const [dx, dz] of DIRS) if (isFloor(c + dx, r + dz)) return [dx, dz]; return [0, 1]; };
  // a passage cell: floor with floor on two opposite sides and rock on the other two
  const passage = (c, r) => isFloor(c, r) && ((isFloor(c - 1, r) && isFloor(c + 1, r) && !isFloor(c, r - 1) && !isFloor(c, r + 1)) || (isFloor(c, r - 1) && isFloor(c, r + 1) && !isFloor(c - 1, r) && !isFloor(c + 1, r)));
  // cells reachable from the start, with some things as walls
  const reach = (from, block = () => false) => {
    const seen = new Uint8Array(cols * rows), q = [[from.col, from.row]]; seen[from.row * cols + from.col] = 1;
    while (q.length) { const [c, r] = q.pop(); for (const [dx, dz] of DIRS) { const a = c + dx, b = r + dz; if (!isFloor(a, b) || seen[b * cols + a] || block(a, b)) continue; seen[b * cols + a] = 1; q.push([a, b]); } }
    return seen;
  };
  if (!start) { outer: for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (isFloor(c, r)) { start = { col: c, row: r, ...at(c, r) }; break outer; } }
  if (dress && start) {
    const near = (c, r, d) => things.some(t => Math.abs(t.col - c) + Math.abs(t.row - r) < d);
    // doors where a passage meets a room
    const doorSpots = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!passage(c, r) || roomOf(c, r)) continue;
      if (DIRS.some(([dx, dz]) => roomOf(c + dx, r + dz)) && !thingAt(c, r)) doorSpots.push([c, r]);
    }
    for (const [c, r] of doorSpots) if (R() < .45 && !near(c, r, 2) && !(start.col === c && start.row === r)) add('door', c, r);
    // a secret wall: rock between two floors far apart by the long way round
    {
      let best = null;
      for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
        if (grid[r][c] !== '#') continue;
        for (const [dx, dz] of [[1, 0], [0, 1]]) {
          if (!isFloor(c - dx, r - dz) || !isFloor(c + dx, r + dz) || isFloor(c + dz, r + dx) || isFloor(c - dz, r - dx)) continue;
          const d = walk(c - dx, r - dz, c + dx, r + dz); if (d > 14 && (!best || d > best.d)) best = { c, r, d };
        }
      }
      if (best) { grid[best.r][best.c] = '.'; add('secret', best.c, best.r, { found: false }); }
    }
    // the exit's room behind a gate with levers, if a door leads to it; else one door becomes the gate
    const doors = things.filter(t => t.kind === 'door');
    if (doors.length >= 2) {
      const reachNo = d => reach(start, (a, b) => a === d.col && b === d.row);
      const gateDoor = exit ? doors.find(d => !reachNo(d)[exit.row * cols + exit.col]) : null;
      // (no door alone shuts the exit off: a corridor cell that does, nearest the exit, becomes the gate)
      let cut = null;
      if (exit && !gateDoor) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (!passage(c, r) || roomOf(c, r) || thingAt(c, r) || (c === exit.col && r === exit.row) || (c === start.col && r === start.row)) continue;
        const d = Math.abs(c - exit.col) + Math.abs(r - exit.row); if (cut && d >= cut.d) continue;
        if (!reach(start, (a, b) => a === c && b === r)[exit.row * cols + exit.col]) cut = { c, r, d };
      }
      const g = gateDoor || (cut ? add('door', cut.c, cut.r) : doors[Math.floor(R() * doors.length)]);
      g.kind = 'gate'; g.group = 'gate' + g.id;
      // levers on the walls of the nearest room the start can reach without the gate
      const sec0 = things.find(t => t.kind === 'secret'), ok = reach(start, (a, b) => (a === g.col && b === g.row) || (sec0 && a === sec0.col && b === sec0.row)), room = rooms.filter(q => ok[q.row * cols + q.col] && !roomOf(g.col, g.row)).sort((a, b) => Math.hypot(a.x - g.x, a.z - g.z) - Math.hypot(b.x - g.x, b.z - g.z))[0];
      const spots = room ? wallsOf(room) : [];
      const n = Math.min(3, spots.length);
      for (let i = 0; i < n; i++) { const [c, r, f] = spots[Math.floor((i + .5) / n * spots.length)]; add('lever', c, r, { face: f, group: g.group, want: i === 0 ? true : R() < .5, on: false }); }
      if (n && things.filter(t => t.group === g.group && t.kind === 'lever').every(l => !l.want)) things.find(t => t.group === g.group && t.kind === 'lever').want = true;
      // a locked door elsewhere, and its key in a chest the start can reach first
      const others = things.filter(t => t.kind === 'door');
      if (others.length) {
        const lk = others[Math.floor(R() * others.length)]; lk.kind = 'locked'; lk.key = 'key' + lk.id;
        const sec = things.find(t => t.kind === 'secret'), free = reach(start, (a, b) => (a === lk.col && b === lk.row) || (a === g.col && b === g.row) || (sec && a === sec.col && b === sec.row));   // (the key never behind the secret)
        const keyRoom = rooms.filter(q => free[q.row * cols + q.col] && !(q.col <= start.col && start.col < q.col + q.cols && q.row <= start.row && start.row < q.row + q.rows)).sort(() => R() - .5)[0] || rooms.find(q => free[q.row * cols + q.col]);
        if (keyRoom) { const [c, r] = cornerOf(keyRoom); add('chest', c, r, { loot: [{ id: lk.key, n: 1 }], face: wallFace(c, r) }); }
      }
    }
    // spike traps in the long corridors
    const corridor = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (passage(c, r) && !roomOf(c, r) && !thingAt(c, r) && !near(c, r, 3) && Math.abs(c - start.col) + Math.abs(r - start.row) > 4) corridor.push([c, r]);
    for (let i = 0; i < Math.min(4, Math.floor(corridor.length / 12)); i++) { const [c, r] = corridor.splice(Math.floor(R() * corridor.length), 1)[0]; if (!near(c, r, 3)) add('trap', c, r, { armed: true }); }
    // a torch now and then along the corridors, on the rock beside them
    {
      let n = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (!passage(c, r) || roomOf(c, r) || ++n % 9) continue;
        const side = DIRS.find(([dx, dz]) => ch(c + dx, r + dz) === '#' && !things.some(t => t.col === c + dx && t.row === r + dz));
        if (side) add('torch', c + side[0], r + side[1], { face: [-side[0], -side[1]] });
      }
    }
    // chests in rooms off the way, torches on every room's walls, pillars in the big rooms, clutter in corners
    for (const q of rooms) {
      if (R() < .35 && !things.some(t => t.kind === 'chest' && roomOf(t.col, t.row) === q)) { const [c, r] = cornerOf(q); if (!thingAt(c, r)) add('chest', c, r, { face: wallFace(c, r) }); }
      const W = wallsOf(q); for (let i = 0; i < Math.min(4, Math.max(1, Math.round(W.length / 6))); i++) { const [c, r, f] = W[Math.floor((i + .3) / Math.max(1, Math.round(W.length / 6)) * W.length) % W.length]; if (!things.some(t => (t.kind === 'torch' || t.kind === 'lever') && t.col === c && t.row === r)) add('torch', c, r, { face: f }); }
      if (q.cols >= 6 && q.rows >= 5) for (const [dc, dr] of [[1, 1], [q.cols - 2, 1], [1, q.rows - 2], [q.cols - 2, q.rows - 2]]) { const c = q.col + dc, r = q.row + dr; if (!thingAt(c, r) && !(c === start.col && r === start.row) && !(exit && c === exit.col && r === exit.row)) add('pillar', c, r); }
      for (let i = 0; i < 2; i++) if (R() < .5) { const [c, r] = cornerOf(q); if (!thingAt(c, r) && !(c === start.col && r === start.row)) add(R() < .5 ? 'barrel' : 'crate', c, r); }
    }
  }
  // what walls face: a torch or lever on a rock cell faces the floor beside it; doors and gates know their axis
  for (const t of things) {
    if ((t.kind === 'torch' || t.kind === 'lever') && !t.face) t.face = wallFace(t.col, t.row);
    if (t.kind === 'door' || t.kind === 'locked' || t.kind === 'gate' || t.kind === 'secret') t.axis = t.kind === 'secret' ? (isFloor(t.col - 1, t.row) && isFloor(t.col + 1, t.row) ? 'x' : 'z') : axisOf(t.col, t.row);
    if (t.kind === 'door' || t.kind === 'locked' || t.kind === 'gate' || t.kind === 'chest') t.open = false;
  }
  // a gate from the map with levers or plates near it, and no group: they work it
  for (const g of things.filter(t => t.kind === 'gate' && !t.group)) {
    g.group = 'gate' + g.id;
    for (const t of things) if ((t.kind === 'lever' || t.kind === 'plate') && !t.group && Math.abs(t.col - g.col) + Math.abs(t.row - g.row) <= 8) { t.group = g.group; if (t.kind === 'lever') { t.want ??= true; t.on ??= false; } }
  }
  for (const t of things) { if (t.kind === 'plate') t.down = false; if (t.kind === 'trap') t.armed ??= true; }
  return { cols, rows, size, x0, z0, grid: grid.map(r => r.join('')), rooms, start, exit, marks, things };

  // the shortest walk between two cells (Infinity if none), the rock in between not counted
  function walk(a, b, c2, d2) {
    const seen = new Int32Array(cols * rows).fill(-1), q = [[a, b]]; seen[b * cols + a] = 0;
    for (let i = 0; i < q.length; i++) { const [c, r] = q[i], s = seen[r * cols + c]; if (c === c2 && r === d2) return s; if (s > 40) break; for (const [dx, dz] of DIRS) { const x = c + dx, y = r + dz; if (!isFloor(x, y) || seen[y * cols + x] >= 0) continue; seen[y * cols + x] = s + 1; q.push([x, y]); } }
    return Infinity;
  }
  // the rock cells round a room that face into it: [col, row, face]
  function wallsOf(q) {
    const out = [];
    for (let c = q.col; c < q.col + q.cols; c++) { if (ch(c, q.row - 1) === '#') out.push([c, q.row - 1, [0, 1]]); if (ch(c, q.row + q.rows) === '#') out.push([c, q.row + q.rows, [0, -1]]); }
    for (let r = q.row; r < q.row + q.rows; r++) { if (ch(q.col - 1, r) === '#') out.push([q.col - 1, r, [1, 0]]); if (ch(q.col + q.cols, r) === '#') out.push([q.col + q.cols, r, [-1, 0]]); }
    return out.filter(([c, r]) => !things.some(t => t.col === c && t.row === r));
  }
  function cornerOf(q) {
    const cs = [[q.col, q.row], [q.col + q.cols - 1, q.row], [q.col, q.row + q.rows - 1], [q.col + q.cols - 1, q.row + q.rows - 1]].filter(([c, r]) => isFloor(c, r) && !thingAt(c, r) && !DIRS.some(([dx, dz]) => passage(c + dx, r + dz) && !roomOf(c + dx, r + dz)) && !(start && c === start.col && r === start.row) && !(exit && c === exit.col && r === exit.row));
    return cs.length ? cs[Math.floor(R() * cs.length)] : [q.col, q.row];
  }
}

/**
 * The state of a dungeon and its rules: what is open, pressed, found and taken, and what each thing does when used.
 * Built by gs.dungeon.Dungeon (which moves the meshes to match); usable alone for a 2D game or a test.
 */
export class DungeonRules {
  constructor(L, { loot = null, trapRearm = 3 } = {}) {
    this.L = L; this.things = L.things; this.handlers = {}; this.loot = loot; this.trapRearm = trapRearm;
    this.seen = new Uint8Array(L.cols * L.rows); this.inTrap = new Set(); this.solved = new Set();
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  /** The cell at a spot (metres): { col, row, ch } or null outside. */
  cellAt(x, z) { const L = this.L, c = Math.floor((x - L.x0) / L.size), r = Math.floor((z - L.z0) / L.size); return c < 0 || r < 0 || c >= L.cols || r >= L.rows ? null : { col: c, row: r, ch: L.grid[r][c] }; }
  /** Can one walk through this cell now (floor, and no shut door, gate, secret or pillar)? */
  open(c, r) {
    const L = this.L, k = L.grid[r]?.[c]; if (k === undefined || k === '#' || k === ' ') return false;
    for (const t of this.things) if (t.col === c && t.row === r) {
      if ((t.kind === 'door' || t.kind === 'locked' || t.kind === 'gate') && !t.open) return false;
      if (t.kind === 'secret' && !t.found) return false;
      if (t.kind === 'pillar') return false;
    }
    return true;
  }
  /** Things that can be used within r metres of (x, z), nearest first: doors, locked doors, levers, chests, a secret wall. */
  near(x, z, r = 2.2) {
    const S = this.L.size;
    return this.things.filter(t => ['door', 'locked', 'lever', 'chest', 'secret'].includes(t.kind) && !(t.kind === 'chest' && t.open) && !(t.kind === 'secret' && t.found))
      .map(t => ({ t, d: Math.hypot(this.spot(t).x - x, this.spot(t).z - z) })).filter(o => o.d <= r + (o.t.kind === 'secret' ? S / 2 : 0)).sort((a, b) => a.d - b.d).map(o => o.t);
  }
  /** Where a thing is to be reached: a lever or torch at its wall's face, the rest at the middle of their cell. */
  spot(t) { const S = this.L.size; return t.face && (t.kind === 'lever' || t.kind === 'torch') ? { x: t.x + t.face[0] * S / 2, z: t.z + t.face[1] * S / 2 } : { x: t.x, z: t.z }; }
  /**
   * Uses a thing (or the nearest usable within reach of { x, z }): opens or shuts a door, unlocks a locked one with its
   * key from inventory (a gs.items Inventory, or anything with has/take/add), pulls a lever, opens a chest (its loot
   * goes into inventory), finds a secret wall. Returns { ok, thing, why ('locked' | 'nothing' | 'blocked'), loot }.
   */
  use(what, { inventory = null } = {}) {
    const t = what && 'kind' in what ? what : this.near(what.x, what.z)[0];
    if (!t) return { ok: false, why: 'nothing' };
    if (t.kind === 'locked') {
      if (!inventory?.has?.(t.key)) return { ok: false, thing: t, why: 'locked' };
      inventory.take?.(t.key, 1); t.kind = 'door'; t.open = true; this.emit('unlock', t); this.emit('open', t); return { ok: true, thing: t };
    }
    if (t.kind === 'door') { t.open = !t.open; this.emit(t.open ? 'open' : 'shut', t); return { ok: true, thing: t }; }
    if (t.kind === 'lever') { t.on = !t.on; this.emit('lever', t); this.check(t.group); return { ok: true, thing: t }; }
    if (t.kind === 'secret') { t.found = true; this.emit('secret', t); return { ok: true, thing: t }; }
    if (t.kind === 'chest') {
      if (t.open) return { ok: false, thing: t, why: 'nothing' };
      t.open = true; const loot = t.loot || (this.loot ? this.loot(t) : [{ id: 'gold', n: 5 + (t.id * 7) % 20 }]);
      if (inventory) for (const l of loot) inventory.add(l.id, l.n);
      this.emit('loot', t, loot); return { ok: true, thing: t, loot };
    }
    return { ok: false, thing: t, why: 'nothing' };
  }
  // a gate opens while all its levers are set right and all its plates are pressed
  check(group) {
    if (!group) return;
    const parts = this.things.filter(t => t.group === group && (t.kind === 'lever' || t.kind === 'plate')), gate = this.things.find(t => t.group === group && t.kind === 'gate');
    if (!gate || !parts.length) return;
    const right = parts.every(t => t.kind === 'lever' ? t.on === t.want : t.down);
    if (right !== gate.open) { gate.open = right; this.emit(right ? 'open' : 'shut', gate); if (right && !this.solved.has(group)) { this.solved.add(group); this.emit('solved', gate); } }
  }
  /**
   * Each frame: who stands where. feet: [{ x, z }] (the hero, crates pushed onto plates, anything heavy). Presses and
   * lets up plates, fires a trap when something steps on it (emit 'trap', thing, who), and marks what the first of them
   * has seen (its room, or the cells round it) for the map.
   */
  step(dt, feet = []) {
    const L = this.L, S = L.size;
    for (const t of this.things) {
      if (t.kind === 'plate') {
        const down = feet.some(f => Math.abs(f.x - t.x) < S * .4 && Math.abs(f.z - t.z) < S * .4);
        if (down !== t.down) { t.down = down; this.emit(down ? 'press' : 'release', t); this.check(t.group); }
      } else if (t.kind === 'trap') {
        t.wait = Math.max(0, (t.wait || 0) - dt);
        const who = feet.find(f => Math.abs(f.x - t.x) < S * .45 && Math.abs(f.z - t.z) < S * .45);
        if (who && t.armed && !t.wait) { t.armed = false; t.fired = 0; t.wait = this.trapRearm; this.emit('trap', t, who); }
        if (!t.armed && t.wait <= 0 && !who) t.armed = true;
        if (t.fired != null) t.fired += dt;
      }
    }
    const f = feet[0]; if (f) this.see(f.x, f.z);
  }
  see(x, z) {
    const L = this.L, cell = this.cellAt(x, z); if (!cell) return;
    const room = L.rooms.find(q => cell.col >= q.col && cell.col < q.col + q.cols && cell.row >= q.row && cell.row < q.row + q.rows);
    const [c0, r0, c1, r1] = room ? [room.col - 1, room.row - 1, room.col + room.cols, room.row + room.rows] : [cell.col - 2, cell.row - 2, cell.col + 2, cell.row + 2];
    for (let r = Math.max(0, r0); r <= Math.min(L.rows - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(L.cols - 1, c1); c++) this.seen[r * L.cols + c] = 1;
  }
  find(mark) { return this.L.marks[mark] || []; }
  pack() { return { t: this.things.map(t => [t.open ? 1 : 0, t.on ? 1 : 0, t.found ? 1 : 0, t.kind === 'locked' ? 1 : 0]), s: btoa(String.fromCharCode(...pack8(this.seen))) }; }
  unpack(d) {
    if (!d) return this;
    d.t?.forEach(([o, on, f, lk], i) => { const t = this.things[i]; if (!t) return; if (t.kind === 'locked' && !lk) t.kind = 'door'; if ('open' in t) t.open = !!o; if (t.kind === 'lever') t.on = !!on; if (t.kind === 'secret') t.found = !!f; });
    if (d.s) { const b = atob(d.s); for (let i = 0; i < this.seen.length; i++) this.seen[i] = (b.charCodeAt(i >> 3) >> (i & 7)) & 1; }
    return this;
  }
}
const pack8 = a => { const o = new Uint8Array(Math.ceil(a.length / 8)); for (let i = 0; i < a.length; i++) if (a[i]) o[i >> 3] |= 1 << (i & 7); return o; };
