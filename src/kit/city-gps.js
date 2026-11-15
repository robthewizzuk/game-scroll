// gs.city Gps: finding the way round a City or a big city of districts (Metro). A route to where the player is going
// that follows them (worked out again when they leave it), the next turn and how far, markers for the things a game
// wants found (jobs, shops, a target; ones that matter pinned to the minimap's edge when off it), a minimap that turns
// with the player, a full map to pan, zoom and tap for a waypoint, and the way drawn on the road itself in 3D.
//
//   const gps = new Gps(city);                                   // a City or a Metro
//   gps.to(target);                                              // or the player taps the full map: gps.tap(x, y)
//   gps.watch(mission);                                          // anything with .markers: [{ at, kind, text, icon, pinned }]
//   gps.show(view);                                              // the way on the road ahead, glowing arrows
//   update(dt) { gps.update(dt, player); }                       // player: { x, z } (and heading to turn the minimap)
//   draw(c)    { gps.mini(c, W - 96, 10, 86, 86); }               // gps.next: { turn: 'left' | 'right' | 'ahead' | 'arrive', in }
//
// The kit gives answers and plain drawings; the game chooses where they go, their colours, and what arriving means.

import { BufferAttribute, BufferGeometry, CanvasTexture, Mesh, MeshBasicMaterial, RepeatWrapping, SRGBColorSpace, DoubleSide } from 'three';

const KIND = {   // a default look per kind of marker (the game's own icon drawer wins: Gps({ icon }))
  target: { colour: '#40ffb0', shape: 'ring' }, waypoint: { colour: '#c070ff', shape: 'pin' }, job: { colour: '#ffd040', shape: 'diamond' },
  shop: { colour: '#60b0ff', shape: 'square' }, danger: { colour: '#ff5050', shape: 'triangle' }, friend: { colour: '#70e070', shape: 'dot' }, home: { colour: '#ffffff', shape: 'house' },
};
const zOf = p => p.z ?? p.y;

export class Gps {
  /**
   * city: a gs.city City or Metro. off: metres off the route before it is worked out again (18); every: seconds between
   * routes worked out anyway, for a moving target (0: only when off it or the target moves `moved` metres, 25); arrive:
   * metres from the end that count as there (14); turn: degrees that count as a turn (30); icon: (c, name, x, y, size,
   * { color }) => void to draw a marker's `icon` (gs.icons.icon), else each kind has a plain shape.
   */
  constructor(city, { off = 18, every = 0, moved = 25, arrive = 14, turn = 30, icon = null, colour = '#40ffb0' } = {}) {
    this.city = city; this.opts = { off, every, moved, arrive, turn: turn * Math.PI / 180 }; this.icon = icon; this.colour = colour;
    this.route = null; this.s = 0; this.left = 0; this.next = null; this.arrived = false; this.offT = 0; this.t = 0;
    this.goal = null; this.waypoint = null; this.markers = []; this.sources = []; this.player = null; this.heading = 0;
    this.big = null; this.line = null; this.routes = 0;
  }
  /** Where to go: { x, z } (a thing that moves is followed), or null for nowhere. What the game sets wins over the player's waypoint. */
  to(target) { this.goal = target || null; this.reroute(); return this; }
  /** Adds a marker { at, kind, text, icon, pinned, colour } (at: { x, z } or a thing that moves); returns it. */
  add(m) { this.markers.push(m); return m; }
  remove(m) { const i = this.markers.indexOf(m); if (i >= 0) this.markers.splice(i, 1); return this; }
  clear() { this.markers.length = 0; this.sources.length = 0; this.goal = null; this.waypoint = null; this.route = null; this.next = null; this.arrived = false; this.lineDirty = true; return this; }
  /** Also shows the markers of something else, read each frame: an array, or anything with .markers (a gs.missions Mission or Jobs). */
  watch(source) { if (source && !this.sources.includes(source)) this.sources.push(source); return this; }
  unwatch(source) { const i = this.sources.indexOf(source); if (i >= 0) this.sources.splice(i, 1); return this; }
  /** Every marker shown now: its own, the watched ones' and the waypoint. */
  all(out = []) {
    out.length = 0; for (const m of this.markers) out.push(m);
    for (const s of this.sources) { const L = Array.isArray(s) ? s : s.markers; if (L) for (const m of L) if (m?.at) out.push(m); }
    if (this.waypoint) out.push(this.waypoint);
    return out;
  }
  /** Where the route goes now: the game's to(), else the player's waypoint, else the first pinned marker. */
  get target() { const t = this.goal || this.waypoint?.at || this.all(this._all ||= []).find(m => m.pinned)?.at || null; return t; }

  /* ---------- the route ---------- */
  reroute() { this.route = null; this.lineDirty = true; this.t = 0; }
  // works the route out from the player to the target
  plan(p, t) {
    const r = this.city.route({ x: p.x, z: zOf(p) }, { x: t.x, z: zOf(t) }); this.routes++;
    if (!r || r.points.length < 2) { this.route = null; return; }
    const P = r.points, S = [0]; for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    // the turns: where the way bends by more than `turn` within a few metres (a corner, or a curve's worth of it)
    const turns = [];
    for (let i = 1; i < P.length - 1; i++) {
      let j = i - 1; while (j > 0 && S[i] - S[j] < 8) j--; let k = i + 1; while (k < P.length - 1 && S[k] - S[i] < 8) k++;
      const a = Math.atan2(P[i][0] - P[j][0], P[i][1] - P[j][1]), b = Math.atan2(P[k][0] - P[i][0], P[k][1] - P[i][1]), d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
      if (Math.abs(d) >= this.opts.turn && (!turns.length || S[i] - turns.at(-1).s > 12)) turns.push({ s: S[i], x: P[i][0], z: P[i][1], turn: d > 0 ? 'left' : 'right', angle: d });
    }
    this.route = { ...r, at: S, turns, to: { x: t.x, z: zOf(t) } }; this.s = 0; this.lineDirty = true;
  }
  // how far along the route a point is (searching near where it was, so a road running back alongside isn't taken for it)
  progress(x, z) {
    const R = this.route, P = R.points, S = R.at; let best = Infinity, bs = this.s, bd = Infinity;
    for (let i = 1; i < P.length; i++) {
      if (S[i] < this.s - 40 || S[i - 1] > this.s + 400) continue;
      const ax = P[i - 1][0], az = P[i - 1][1], dx = P[i][0] - ax, dz = P[i][1] - az, L2 = dx * dx + dz * dz || 1, f = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const d = Math.hypot(ax + dx * f - x, az + dz * f - z), s = S[i - 1] + f * (S[i] - S[i - 1]), score = d + Math.max(0, this.s - s) * .5;
      if (score < best) { best = score; bs = s; bd = d; }
    }
    return [bs, bd];
  }
  /**
   * Once a frame. player: { x, z } (or a Vector3, a gs.vehicles car's x, y), and its heading (radians, as atan2(dx, dz)) to
   * turn the minimap. Works the route out again when the player leaves it, follows how far along they are, and says the next turn.
   */
  update(dt, player, heading = player.heading ?? this.heading) {
    const x = player.x, z = zOf(player); this.player = { x, z }; this.heading = heading; this.t += dt;
    const T = this.target;
    if (!T) { if (this.route) { this.route = null; this.lineDirty = true; } this.next = null; this.left = 0; this.arrived = false; return this; }
    const R = this.route, o = this.opts;
    const moved = R && Math.hypot(R.to.x - T.x, R.to.z - zOf(T)) > o.moved;
    if (!R || moved || (o.every > 0 && this.t > o.every)) { this.plan(this.player, T); this.t = 0; this.offT = 0; }
    if (!this.route) { this.next = null; return this; }
    const [s, d] = this.progress(x, z); this.s = Math.max(this.s, s - 2);
    if (d > o.off) { if ((this.offT += dt) > .4) { this.plan(this.player, T); this.offT = 0; } } else this.offT = 0;
    const r = this.route; this.left = Math.max(0, r.length - this.s);
    this.arrived = this.left < o.arrive || Math.hypot(r.to.x - x, r.to.z - z) < o.arrive;
    const nt = r.turns.find(q => q.s > this.s + 2);
    this.next = this.arrived ? { turn: 'arrive', in: 0, at: r.to } : nt && nt.s - this.s < this.left - o.arrive ? { turn: nt.turn, in: nt.s - this.s, at: { x: nt.x, z: nt.z } } : { turn: 'arrive', in: this.left, at: r.to };
    if (this.line) this.road();
    return this;
  }
  /** The point d metres further along the route from the player (for an arrow over the car), or the target. */
  ahead(d = 12, out = {}) {
    const r = this.route; if (!r) { const T = this.target; if (T) { out.x = T.x; out.z = zOf(T); return out; } return null; }
    const s = Math.min(r.length, this.s + d), S = r.at, P = r.points; let i = 1; while (i < S.length - 1 && S[i] < s) i++;
    const f = (s - S[i - 1]) / ((S[i] - S[i - 1]) || 1); out.x = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f; out.z = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f; return out;
  }

  /* ---------- the maps ---------- */
  // a city point to the canvas, for the map drawn last ({ cx, cy, s, turn, at })
  toMap(M, x, z, out = [0, 0]) { const dx = (x - M.at.x) * M.s, dz = (z - M.at.z) * M.s, c = Math.cos(-M.turn), n = Math.sin(-M.turn); out[0] = M.cx + dx * c - dz * n; out[1] = M.cy + dx * n + dz * c; return out; }
  fromMap(M, px, py) { const dx = px - M.cx, dy = py - M.cy, c = Math.cos(M.turn), n = Math.sin(M.turn); return { x: M.at.x + (dx * c - dy * n) / M.s, z: M.at.z + (dx * n + dy * c) / M.s }; }
  /**
   * The minimap: the streets round the player in a circle (round: false for a square) that turns with them (turn: 'heading',
   * 'north' or radians), the route, the markers (pinned ones held at the edge when off it), the player's arrow in the middle.
   * range: metres from the middle to the edge (140). colours: the map's, plus route, player.
   */
  mini(c, x, y, w, h, { range = 140, turn = 'heading', round = true, colours = {}, route = true } = {}) {
    const p = this.player || this.city.start; if (!p) return;
    const rot = turn === 'heading' ? -this.heading + Math.PI : turn === 'north' ? 0 : +turn || 0, at = { x: p.x, z: zOf(p) };
    const M = this._mini = { cx: x + w / 2, cy: y + h / 2, s: Math.min(w, h) / 2 / range, turn: rot, at, r: Math.min(w, h) / 2, round, x, y, w, h };
    c.save(); c.beginPath(); if (round) c.arc(M.cx, M.cy, M.r, 0, Math.PI * 2); else c.rect(x, y, w, h); c.clip();
    this.city.drawMap(c, x, y, w, h, { at, range, turn: rot, colours });
    if (route) this.drawRoute(c, M, colours.route || this.colour, Math.max(2, M.r / 20));
    c.restore();
    this.drawMarkers(c, M, true);
    // the player: an arrow pointing the way they face
    const [px, py] = this.toMap(M, at.x, at.z), a = rot + this.heading, k = Math.max(5, M.r / 9);
    c.save(); c.translate(px, py); c.rotate(-a + Math.PI); c.fillStyle = colours.player || '#f07a1a'; c.strokeStyle = '#000a'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -k); c.lineTo(k * .7, k * .7); c.lineTo(0, k * .35); c.lineTo(-k * .7, k * .7); c.closePath(); c.stroke(); c.fill(); c.restore();
    c.save(); c.strokeStyle = '#ffffff66'; c.lineWidth = 1.5; c.beginPath(); if (round) c.arc(M.cx, M.cy, M.r - .75, 0, Math.PI * 2); else c.rect(x + .75, y + .75, w - 1.5, h - 1.5); c.stroke(); c.restore();
    return M;
  }
  /**
   * The full map: the whole city, north up, to pan (pan(dx, dy)), zoom (zoom(f, x, y)) and tap for a waypoint (tap(x, y)).
   * open() first (it starts on the player); then map(c, x, y, w, h) each frame while it is open (opened says so).
   */
  open(range = null) {
    const B = this.city.bounds || this.city.plan?.bounds, p = this.player || this.city.start || { x: 0, z: 0 };
    this.big = { at: { x: p.x, z: zOf(p) }, range: range || (B ? Math.max(B.x1 - B.x0, B.z1 - B.z0) * .3 : 400) };
    return this;
  }
  close() { this.big = null; this._full = null; return this; }
  get opened() { return !!this.big; }
  pan(dx, dy) { const F = this.big, M = this._full; if (!F || !M) return this; F.at.x -= dx / M.s; F.at.z -= dy / M.s; return this; }
  /** Zooms by f (2: twice as close) about a point on the map (its middle if left out). */
  zoom(f, px = null, py = null) {
    const F = this.big, M = this._full; if (!F || !M) return this;
    const before = px == null ? null : this.fromMap(M, px, py); F.range = Math.max(40, Math.min(6000, F.range / f));
    if (before) { const s = Math.min(M.w, M.h) / 2 / F.range; F.at.x = before.x - (px - M.cx) / s; F.at.z = before.z - (py - M.cy) / s; }
    return this;
  }
  map(c, x, y, w, h, { colours = {} } = {}) {
    if (!this.big) this.open();
    const F = this.big, M = this._full = { cx: x + w / 2, cy: y + h / 2, s: Math.min(w, h) / 2 / F.range, turn: 0, at: F.at, x, y, w, h, r: Infinity };
    this.city.drawMap(c, x, y, w, h, { at: F.at, range: F.range, turn: 0, colours });
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    this.drawRoute(c, M, colours.route || this.colour, 3);
    if (this.player) { const [px, py] = this.toMap(M, this.player.x, this.player.z), k = 7; c.save(); c.translate(px, py); c.rotate(-this.heading + Math.PI); c.fillStyle = colours.player || '#f07a1a'; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -k); c.lineTo(k * .7, k * .7); c.lineTo(0, k * .35); c.lineTo(-k * .7, k * .7); c.closePath(); c.stroke(); c.fill(); c.restore(); }
    c.restore();
    this.drawMarkers(c, M, false);
    return M;
  }
  /**
   * A tap on the full map: sets the player's waypoint on the nearest road there (or clears it, tapped again on it); the
   * route goes there unless the game has set one with to(). Returns the waypoint, or null (cleared, or the tap was off the map).
   */
  tap(px, py) {
    const M = this._full; if (!M || px < M.x || py < M.y || px > M.x + M.w || py > M.y + M.h) return null;
    if (this.waypoint) { const [wx, wy] = this.toMap(M, this.waypoint.at.x, this.waypoint.at.z); if (Math.hypot(wx - px, wy - py) < 18) { this.waypoint = null; this.reroute(); return null; } }
    const p = this.fromMap(M, px, py), r = this.city.road(p.x, p.z), at = r ? { x: r.x, z: r.z } : p;
    this.waypoint = { at, kind: 'waypoint', text: 'Waypoint', pinned: true, player: true }; this.reroute();
    return this.waypoint;
  }
  drawRoute(c, M, colour, width) {
    const r = this.route; if (!r) return;
    const P = r.points, S = r.at, q = [0, 0]; let started = false;
    c.save(); c.strokeStyle = colour; c.lineWidth = width; c.lineJoin = c.lineCap = 'round'; c.beginPath();
    if (this.player) { this.toMap(M, this.player.x, this.player.z, q); c.moveTo(q[0], q[1]); started = true; }
    for (let i = 0; i < P.length; i++) { if (S[i] < this.s) continue; this.toMap(M, P[i][0], P[i][1], q); if (started) c.lineTo(q[0], q[1]); else { c.moveTo(q[0], q[1]); started = true; } }
    c.stroke(); c.restore();
  }
  // each marker as its icon or its kind's shape; on the minimap a pinned one off the map is held at the edge, pointing to it
  drawMarkers(c, M, edge) {
    const list = this.all(this._all ||= []), q = [0, 0], size = edge ? Math.max(9, M.r / 7) : 14;
    for (const m of list) {
      const x = m.at.x, z = zOf(m.at); this.toMap(M, x, z, q);
      let px = q[0], py = q[1], held = false;
      if (edge) {
        const dx = px - M.cx, dy = py - M.cy, lim = M.round ? M.r - size * .7 : 0;
        if (M.round ? Math.hypot(dx, dy) > lim : (px < M.x + size / 2 || px > M.x + M.w - size / 2 || py < M.y + size / 2 || py > M.y + M.h - size / 2)) {
          if (!m.pinned && m.kind !== 'waypoint') continue;
          held = true;
          if (M.round) { const l = Math.hypot(dx, dy) || 1; px = M.cx + dx / l * lim; py = M.cy + dy / l * lim; }
          else { px = Math.max(M.x + size / 2, Math.min(M.x + M.w - size / 2, px)); py = Math.max(M.y + size / 2, Math.min(M.y + M.h - size / 2, py)); }
        }
      } else if (px < M.x || py < M.y || px > M.x + M.w || py > M.y + M.h) continue;
      this.mark(c, m, px, py, held ? size * .8 : size);
    }
  }
  /** Draws one marker at a canvas point (a game drawing its own marker list can use it too). */
  mark(c, m, x, y, size) {
    const K = KIND[m.kind] || KIND.target, col = m.colour || K.colour;
    if (m.icon && this.icon) { this.icon(c, m.icon, x, y, size, { color: col, outline: '#000' }); return; }
    const r = size / 2; c.save(); c.fillStyle = col; c.strokeStyle = '#000c'; c.lineWidth = Math.max(1, size / 9); c.beginPath();
    switch (K.shape) {
      case 'ring': c.arc(x, y, r * .8, 0, Math.PI * 2); c.stroke(); c.fill(); c.beginPath(); c.fillStyle = '#000a'; c.arc(x, y, r * .3, 0, Math.PI * 2); break;
      case 'pin': c.arc(x, y - r * .35, r * .55, Math.PI * .8, Math.PI * 2.2); c.lineTo(x, y + r); c.closePath(); break;
      case 'diamond': c.moveTo(x, y - r); c.lineTo(x + r * .8, y); c.lineTo(x, y + r); c.lineTo(x - r * .8, y); c.closePath(); break;
      case 'square': c.rect(x - r * .7, y - r * .7, r * 1.4, r * 1.4); break;
      case 'triangle': c.moveTo(x, y - r); c.lineTo(x + r * .9, y + r * .7); c.lineTo(x - r * .9, y + r * .7); c.closePath(); break;
      case 'house': c.moveTo(x, y - r); c.lineTo(x + r * .85, y - r * .1); c.lineTo(x + r * .6, y - r * .1); c.lineTo(x + r * .6, y + r * .8); c.lineTo(x - r * .6, y + r * .8); c.lineTo(x - r * .6, y - r * .1); c.lineTo(x - r * .85, y - r * .1); c.closePath(); break;
      default: c.arc(x, y, r * .6, 0, Math.PI * 2);
    }
    c.stroke(); c.fill(); c.restore();
  }
  /** Where a canvas point on the last full map is in the city: { x, z } (or null with no full map drawn). */
  pointAt(px, py) { return this._full ? this.fromMap(this._full, px, py) : null; }

  /* ---------- the way on the road, in 3D ---------- */
  /**
   * Shows the route on the road ahead of the player in a view: glowing arrows `width` metres wide for `reach` metres (220),
   * a hand's breadth over the road. hide() takes it away.
   */
  show(view, { reach = 220, width = 1.3, colour = this.colour, opacity = .55 } = {}) {
    if (this.line) this.hide();
    const n = Math.ceil(reach / 2) + 2, g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 2 * 3), 3)); g.setAttribute('uv', new BufferAttribute(new Float32Array(n * 2 * 2), 2));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
    const mat = new MeshBasicMaterial({ map: arrows(), color: colour, transparent: true, opacity, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false });
    const m = new Mesh(g, mat); m.name = 'gps way'; m.frustumCulled = false; m.renderOrder = 2; view.scene.add(m);
    this.line = { mesh: m, n, reach, width, view }; this.lineDirty = true; this.road();
    return this;
  }
  hide() { if (!this.line) return this; const m = this.line.mesh; m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); this.line = null; return this; }
  // the ribbon from the player along the route, made again when the player has gone on a couple of metres or the route changed
  road() {
    const L = this.line, r = this.route, m = L.mesh, g = m.geometry;
    if (!r || !this.player) { m.visible = false; return; }
    if (!this.lineDirty && Math.abs(this.s - (L.s ?? -99)) < 1.5) return;
    L.s = this.s; this.lineDirty = false; m.visible = true;
    const pos = g.attributes.position.array, uv = g.attributes.uv.array, ground = this.city.roadY ? (x, z) => this.city.roadY(x, z) : () => 0, h = L.width / 2, p = {}, q = {};
    let k = 0; const end = Math.min(r.length, this.s + L.reach);
    for (let s = this.s; k < L.n; s += 2) {
      const at = Math.min(s, end); this.at(Math.max(0, at - 1), p); this.at(Math.min(r.length, at + 1), q);
      const dx = q.x - p.x, dz = q.z - p.z; this.at(at, p); const l = Math.hypot(dx, dz) || 1, nx = -dz / l * h, nz = dx / l * h, y = ground(p.x, p.z) + .07;
      pos.set([p.x - nx, y, p.z - nz, p.x + nx, y, p.z + nz], k * 6); uv.set([0, at / 2.5, 1, at / 2.5], k * 4); k++;
      if (at >= end) break;
    }
    g.setDrawRange(0, Math.max(0, k - 1) * 6); g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true; g.computeBoundingSphere();
  }
  // a point s metres along the route
  at(s, out) { const r = this.route, S = r.at, P = r.points; let lo = 0, hi = S.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (S[mid] <= s) lo = mid; else hi = mid; } const f = (s - S[lo]) / ((S[hi] - S[lo]) || 1); out.x = P[lo][0] + (P[hi][0] - P[lo][0]) * f; out.z = P[lo][1] + (P[hi][1] - P[lo][1]) * f; return out; }
  dispose() { this.hide(); this.clear(); }
}

// arrows down the way, made in code: a chevron in a tile that repeats along the road
let ARROWS = null;
function arrows() {
  if (ARROWS) return ARROWS;
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const c = cv.getContext('2d');
  c.fillStyle = '#ffffff28'; c.fillRect(0, 0, 64, 64);
  c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(8, 50); c.lineTo(32, 18); c.lineTo(56, 50); c.lineTo(44, 50); c.lineTo(32, 34); c.lineTo(20, 50); c.closePath(); c.fill();
  const t = new CanvasTexture(cv); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
  return ARROWS = t;
}
