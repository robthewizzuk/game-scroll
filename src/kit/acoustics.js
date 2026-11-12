// Sound that knows the level: how muffled a sound is behind the walls between it and the listener, and
// what the place the listener stands in sounds like (a small room, a hall, a cave, a street, open
// country), worked out from the level itself with a few rays a frame. No audio here: gs.sound.Ears
// uses these answers (new Ears({ level })), and a game can read them for its own sounds or subtitles.
//
//   const cast = caster(world);                      // a gs.physics3d World3D, a TileMap, a City, Voxels, a function...
//   const k = blocked(cast, ear, source);            // 0 clear .. 1 behind a thick wall
//   room = new Room(); room.probe(cast, ear, 4);     // a few rays each frame
//   room.read()   ->   { size, walls, roof, enclosed, tail, wet, echo, delay }
//
// A level is anything that answers "what is the first solid thing along this line": a World3D, City or
// Voxels (ray(from, dir, max)), a TileMap or 2D Physics (ray(x0, y0, x1, y1)), a NavGrid (sees), a
// function (from, dir, max) => metres to the first solid thing (or null), or a list of those.
// Kit use only: games reach it through gs.sound (Ears, acoustics).

const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
const len = (x, y, z) => Math.hypot(x, y, z);
const clamp01 = v => Math.max(0, Math.min(1, v));

/**
 * One question for any kind of level: cast(from, dir, max) => metres to the first solid thing from
 * `from` along the unit direction `dir`, or Infinity when the way is clear for `max` metres. flat: the
 * level is 2D (a TileMap, 2D Physics, a NavGrid): points are { x, y } and directions lie in that plane.
 */
export function caster(level, { flat = false } = {}) {
  if (!level) return null;
  if (Array.isArray(level)) { const all = level.map(l => caster(l, { flat })).filter(Boolean); return all.length ? (f, d, m) => { let best = Infinity; for (const c of all) { const v = c(f, d, m); if (v < best) best = v; } return best; } : null; }
  if (typeof level === 'function') return (f, d, m) => { const v = level(f, d, m); return v == null || v === false ? Infinity : v === true ? 0 : typeof v === 'number' ? v : v.distance ?? v.dist ?? Infinity; };
  if (typeof level.ray === 'function') {
    if (level.ray.length >= 4) return (f, d, m) => {   // a line between two points on a flat map
      const r = level.ray(f.x, f.y, f.x + d.x * m, f.y + d.y * m); if (!r) return Infinity;
      return r.distance ?? Math.hypot(r.x - f.x, r.y - f.y);
    };
    const unit = level.scale > 0 && typeof level.get === 'function' ? level.scale : 0;   // (gs.voxels counts in blocks)
    return (f, d, m) => {
      const r = unit ? level.ray(f, d, m / unit) : level.ray(f, d, m); if (!r) return Infinity;
      return unit ? r.dist * unit : r.distance ?? r.dist ?? Infinity;
    };
  }
  if (typeof level.sees === 'function') return (f, d, m) => {   // a grid that only says yes or no: halve the line to find about where
    if (level.sees(f.x, f.y, f.x + d.x * m, f.y + d.y * m)) return Infinity;
    let lo = 0, hi = m; for (let i = 0; i < 5; i++) { const mid = (lo + hi) / 2; if (level.sees(f.x, f.y, f.x + d.x * mid, f.y + d.y * mid)) lo = mid; else hi = mid; }
    return hi;
  };
  return null;
}

const P3 = (p, flat) => flat ? V(p.x || 0, p.y || 0, 0) : V(p.x || 0, p.y || 0, p.z || 0);

/**
 * How much of a sound at `src` the level keeps from an ear at `ear`: 0 nothing in the way .. 1 behind a
 * thick wall with no way round. Sound finds its way through doorways and round corners, so when the
 * straight line is shut it also tries lines to points round the source and from points round the ear
 * (spread metres to each side), looks for a bent way round (out through a gap the ear can see to a spot
 * that can see the source: the longer the way round, the more is lost), and counts a thin wall as less
 * than a thick one. o: spread (metres, default .6), thick (metres of wall that count as solid, default
 * 1.2), flat (a 2D level).
 */
export function blocked(cast, ear, src, { spread = .6, thick = 1.2, flat = false } = {}) {
  if (!cast) return 0;
  const a = P3(ear, flat), b = P3(src, flat), dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = len(dx, dy, dz);
  if (d < 1e-3) return 0;
  const ux = dx / d, uy = dy / d, uz = dz / d, dir = V(ux, uy, uz), e = Math.min(spread * .13, d * .1);
  const d1 = cast(a, dir, d);
  if (!(d1 < d - e)) return 0;   // the straight line is clear
  // two directions across the line (in a flat level: one, in the plane)
  let rx, ry, rz, sx = 0, sy = 0, sz = 0;
  if (flat) { rx = -uy; ry = ux; rz = 0; }
  else {
    const hx = Math.abs(uy) > .95 ? 1 : 0, hy = Math.abs(uy) > .95 ? 0 : 1;   // (up, or east for a line straight up)
    rx = -uz * hy; ry = uz * hx; rz = ux * hy - uy * hx; const rl = len(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
    sx = uy * rz - uz * ry; sy = uz * rx - ux * rz; sz = ux * ry - uy * rx;
  }
  const offs = flat ? [[rx, ry, 0], [-rx, -ry, 0]] : [[rx, ry, rz], [-rx, -ry, -rz], [sx, sy, sz], [-sx, -sy, -sz]];
  let shut = 1, n = 1;
  const open = (p, q) => { const x = q.x - p.x, y = q.y - p.y, z = q.z - p.z, l = len(x, y, z); return l < 1e-3 || cast(p, V(x / l, y / l, z / l), l) >= l - e; };
  for (const o of offs) {
    const qs = V(b.x + o[0] * spread, b.y + o[1] * spread, b.z + o[2] * spread), qe = V(a.x + o[0] * spread, a.y + o[1] * spread, a.z + o[2] * spread);
    // (a point pushed off the source may itself be inside a wall: it only counts if the source can reach it)
    if (cast(b, V(o[0], o[1], o[2]), spread) >= spread - e) { n++; if (!open(a, qs)) shut++; }
    if (cast(a, V(o[0], o[1], o[2]), spread) >= spread - e) { n++; if (!open(qe, b)) shut++; }
  }
  // how much wall: from the far side back towards the ear, what is left between the two first hits
  const d2 = cast(b, V(-ux, -uy, -uz), d), wall = d2 < d ? Math.max(0, d - d1 - d2) : d - d1;
  const part = shut / n, heavy = clamp01(.35 + .65 * wall / thick), straight = clamp01(part * part * heavy + (part >= 1 ? .15 : 0));
  if (part < 1) return straight;
  // a way round: a fan of lines from the ear either side of the straight one; from points along each that
  // the ear can see, can the source be seen? The shortest such way says how much gets round
  let best = Infinity; const reach = d * 1.3 + 2 * spread, via = V();
  const fan = flat ? [[.3, 0], [-.3, 0], [.7, 0], [-.7, 0], [1.15, 0], [-1.15, 0]] : [[.3, 0], [-.3, 0], [.7, 0], [-.7, 0], [1.15, 0], [-1.15, 0], [0, .6], [0, -.6]];
  for (const [ar, as] of fan) {
    const c = Math.cos(ar || as), sn = Math.sin(ar || as), ox = ar ? rx : sx, oy = ar ? ry : sy, oz = ar ? rz : sz, f = V(ux * c + ox * sn, uy * c + oy * sn, uz * c + oz * sn);
    const clear = Math.min(cast(a, f, reach), reach) - spread * .4; if (clear < spread) continue;
    for (const t of [1, .66, .33]) {
      const l = clear * t; via.x = a.x + f.x * l; via.y = a.y + f.y * l; via.z = a.z + f.z * l;
      const rest = len(b.x - via.x, b.y - via.y, b.z - via.z), way = (l + rest) / d;
      if (way < best && open(via, b)) best = way;
    }
  }
  return best < Infinity ? Math.min(straight, clamp01(.16 + (best - 1) * 1.1)) : straight;
}

/**
 * What a muffled sound keeps: { gain: 0..1 of its loudness, hz: above this it is dulled }. amount is
 * blocked()'s answer.
 */
export function muffleOf(amount) {
  const k = clamp01(amount);
  return { gain: 1 - .62 * k, hz: 20000 * Math.pow(420 / 20000, k) };
}

// the directions a place is felt in: 24 spread evenly over the upper half of a ball (the floor is always
// there, so nothing is learned by looking down); a ring of 12 in a flat level
function dirs(flat) {
  const out = [];
  if (flat) { for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + .13; out.push(V(Math.cos(a), Math.sin(a), 0)); } return out; }
  const N = 24, g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) { const y = 1 - (i + .5) / N, r = Math.sqrt(1 - y * y), a = i * g; out.push(V(Math.cos(a) * r, y, Math.sin(a) * r)); }
  return out;
}

/**
 * The place round a listener, felt out a few rays at a time. far: metres a ray looks (things further
 * off don't count); hard: 0 soft (carpet, snow, a forest) .. 1 bare stone and metal (how long the echo
 * rings); flat: a 2D level (walls only: roof says how closed-in a top-down map sounds, default 1 indoors);
 * unit: level units to a metre (a map in pixels).
 * probe(cast, ear, n) casts the next n rays (it takes 24 to have felt all round: call it every frame
 * with 3 or 4); read() is the place as it is known so far.
 */
export class Room {
  constructor({ far = 60, hard = .6, flat = false, roof = 1, unit = 1 } = {}) {
    Object.assign(this, { far, hard, flat, flatRoof: roof, unit }); this.dirs = dirs(flat); this.d = new Float32Array(this.dirs.length).fill(-1); this.i = 0; this.seen = 0; this.at = null; this.out = {};
  }
  /** Forgets what it has felt (after a cut to another place). */
  clear() { this.d.fill(-1); this.seen = 0; this.at = null; return this; }
  probe(cast, ear, n = 4) {
    if (!cast) return this;
    const p = P3(ear, this.flat), N = this.dirs.length, u = this.unit;
    // (a jump further than the place is wide: what was felt belongs to somewhere else)
    if (this.at && len(p.x - this.at.x, p.y - this.at.y, p.z - this.at.z) / u > Math.max(6, (this.out.size || 6) * 2)) this.clear();
    this.at = p;
    for (let k = 0; k < n; k++) { const i = this.i = (this.i + 7) % N, v = cast(p, this.dirs[i], this.far * u) / u; if (this.d[i] < 0) this.seen++; this.d[i] = v < this.far ? v : this.far + 1; }
    return this;
  }
  /** true once every direction has been felt at least once. */
  get known() { return this.seen >= this.dirs.length; }
  /**
   * The place: size (metres to the walls on average: about half the room's width), walls and roof (0..1
   * of the ways out to the sides and upward that are closed), enclosed (0 open country .. 1 shut in),
   * tail (seconds the echo rings), wet (0..1 how much of it there is), echo and delay (a single slap
   * back off far walls outdoors: how strong, and seconds until it returns).
   */
  read() {
    const o = this.out, D = this.d, far = this.far; let side = 0, sideHit = 0, up = 0, upHit = 0, sum = 0, hits = 0, farSum = 0, farN = 0;
    for (let i = 0; i < D.length; i++) {
      const v = D[i]; if (v < 0) continue;
      const y = this.flat ? 0 : this.dirs[i].y, hit = v <= far;
      if (y >= .5) { up++; if (hit) upHit++; } else { side++; if (hit) sideHit++; }
      if (hit) { sum += v; hits++; if (v > 12 && y < .5) { farSum += v; farN++; } }
    }
    const walls = side ? sideHit / side : 0, roof = this.flat ? this.flatRoof * walls : up ? upHit / up : 0;
    // closed: how much of what is round and above the ear is solid. Echo builds up over several bounces and
    // each one loses what is open, so a room with its door open still rings and a yard hardly does
    const size = hits ? sum / hits : far, closed = this.flat ? (walls + roof) / 2 : (side + up) ? (sideHit + upHit) / (side + up) : 0, enclosed = closed;
    o.size = size; o.walls = walls; o.roof = roof; o.enclosed = enclosed;
    o.tail = Math.max(.15, Math.min(4.5, .208 * Math.pow(size, .853) * (.55 + .75 * this.hard) * (.35 + .65 * closed)));
    o.wet = Math.pow(closed, 4) * (.2 + .25 * Math.min(1, size / 12)) * (.7 + .5 * this.hard);
    // a slap back off far walls where there is no roof to fill the gap with echo: a yard, a street, a canyon
    const share = side ? farN / side : 0, mean = farN ? farSum / farN : 0;
    o.echo = clamp01((1 - roof) * share * .9) * .32 * (.6 + .6 * this.hard); o.delay = farN ? Math.max(.07, Math.min(1.2, 2 * mean / 343)) : 0;
    return o;
  }
}
