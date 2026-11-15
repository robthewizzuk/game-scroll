// Mounts (Rob's fantasy RPG gap 14, 2026-11-15): a horse to ride, or a flying beast. A saddle, a blanket, stirrups
// and reins made in code and fitted to whatever gs.models.creature carries them; getting on and off (walking to its
// left side and swinging up astride, as on a motorbike); a rider who sits each gait (deep at the walk, rising at the
// trot, forward over the neck at the gallop) with hands on the reins and feet in the stirrups; steering with weight
// (it takes time to get going, to stop and to turn, and turns wider the faster it goes); walk, trot, canter, gallop
// and jumps, with stamina for the gallop; flying (take off, climb, dive, bank and land); and blows and shots from
// the saddle, harder at a charge.
//
//   const { Mount } = gs.mounts;
//   make() {
//     [horse] = creature.all([{ like: 'horse', seed: 4 }]); [hero] = human.all([{ seed: 2 }]);
//     ride = new Mount(horse, { world });                 // the game's World3D is found by itself
//   }
//   reset() { ride.place(0, 0, 0); }
//   update(dt) {
//     if (tappedHorse) ride.enter(hero);                  // walks to it and gets on (ride.exit() gets off)
//     ride.ride(dt, { stick: stick.value, jump: jumpTapped, urge: swipedUp, rein: swipedDown });
//     if (swingTapped) ride.strike('right');
//     for (const e of ride.events) if (e.type === 'strike') hitAround(e.at, e.radius, e.power);
//   }
//
// The beast is moved by the kit (its position and turn); the rider is the beast's while on it (person.vehicle is the
// mount), as people in gs.models vehicles are. With a World3D it is a solid rider in the world: it slides along walls,
// shoves crates and lands on what is under it; without one it keeps to `ground(x, z)` (a height, 0 by default).
import { Group, Object3D, Mesh, Matrix4, Vector3, CylinderGeometry, TorusGeometry, BoxGeometry, SphereGeometry, BufferGeometry, BufferAttribute, DoubleSide } from 'three';
import { linksFor, linked } from './links.js';
import { riders } from './models/vehicle-seats.js';
import { material } from './models/materials.js';
import { pbr } from './hd3d.js';

const { PI, abs, min, max, sin, cos, atan2, hypot, sqrt, sign } = Math, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (v, to, by) => (v < to ? min(to, v + by) : max(to, v - by));
const wrap = a => { a %= 2 * PI; return a > PI ? a - 2 * PI : a < -PI ? a + 2 * PI : a; };
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/** The gaits on the ground, slowest first (a flyer's air speeds are its own). */
export const GAITS = Object.freeze(['stand', 'walk', 'trot', 'canter', 'gallop']);

// ---- fitting: where on the creature things go, from its own shape (its bind pose)
// the creature's sculpted points near a slice across its body (z, in its own units): the top of the back, how wide, the belly
function slice(geo, z, band, mask = null) {
  const P0 = geo.attributes.position, n = P0.count, P = mask ? { getX: i => mask[i] ? P0.getX(i) : 0, getY: i => P0.getY(i), getZ: i => mask[i] ? P0.getZ(i) : 1e9 } : P0; let top = -1e9, hw = 0, bot = 1e9, ti = -1;
  for (let i = 0; i < n; i++) { const pz = P.getZ(i); if (abs(pz - z) > band) continue; const x = abs(P.getX(i)), y = P.getY(i); if (x > hw) hw = x; }
  for (let i = 0; i < n; i++) {
    const pz = P.getZ(i); if (abs(pz - z) > band) continue; const x = abs(P.getX(i)), y = P.getY(i);
    if (x < hw * .25 && y > top) { top = y; ti = i; }
    if (x < hw * .25 && y < bot) bot = y;
  }
  // the widest over the upper half only (the legs below spread wider than the barrel)
  let w = 0; const mid = (top + bot) / 2; for (let i = 0; i < n; i++) { const pz = P.getZ(i); if (abs(pz - z) > band) continue; if (P.getY(i) > mid - (top - bot) * .1) w = max(w, abs(P.getX(i))); }
  // the belly: the lowest point near the middle that is still body (above where the legs meet it: the lowest a quarter of the way out)
  let belly = 1e9; for (let i = 0; i < n; i++) { const pz = P.getZ(i); if (abs(pz - z) > band) continue; if (abs(P.getX(i)) < w * .12) belly = min(belly, P.getY(i)); }
  return { top, hw: w || hw, bottom: belly < 1e9 ? belly : bot, vertex: ti, side: (down) => { let m = 0; for (let i = 0; i < n; i++) { const pz = P.getZ(i), y = P.getY(i); if (abs(pz - z) <= band * 2 && y > top - down && y <= top) m = max(m, abs(P.getX(i))); } return m || w || hw; } };
}
// the bone that carries a point most (by the skin weights of the nearest sculpted point)
function boneAt(mesh, i) {
  const SI = mesh.geometry.attributes.skinIndex, SW = mesh.geometry.attributes.skinWeight; let best = 0, w = -1;
  for (let k = 0; k < 4; k++) { const ww = SW.getComponent(i, k); if (ww > w) { w = ww; best = SI.getComponent(i, k); } }
  return mesh.skeleton.bones[best];
}
// an Object3D on a bone, where a point of the creature's own (bind pose) is: it then moves with the body
function pin(mesh, bone, x, y, z) {
  const o = new Object3D(), i = mesh.skeleton.bones.indexOf(bone);
  new Matrix4().copy(mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix).multiply(new Matrix4().makeTranslation(x, y, z)).decompose(o.position, o.quaternion, o.scale);
  bone.add(o); return o;
}
// a strip of cylinder round the body's barrel (its own units), centred on the top: span radians across, len along it
function wrapPiece(rx, ry, len, span, from = 0, seg = 18) {
  const g = new CylinderGeometry(1, 1, len, seg, 1, true, PI - span / 2 + from, span); g.rotateX(PI / 2); g.scale(rx, ry, 1); return g;
}

/**
 * A mount: a creature (gs.models.creature: a horse, a deer, a giant owl, a dragon...) to ride. o: world (a World3D;
 * found by itself), ground (x, z) => height without one, fly (true: it flies; by default when the creature can),
 * saddle (false: none; { colour, blanket, leather }), reins (false: none), turn (how fast it turns, radians a second
 * at a walk), accel, stamina (seconds of gallop, 8), jump (metres, 1.1 for a horse's size), seat (metres the saddle
 * sits back from the middle of the back; the kit finds it), tag.
 */
export class Mount {
  constructor(beast, o = {}) {
    if (!beast?.rig || !beast.mesh?.skeleton) throw new Error('Mount: a creature from gs.models.creature');
    this.beast = beast; this.o = o; this.events = []; this.handlers = {};
    this.links = linksFor(null, o.link ?? true); this.given = o.world;
    this.flies = (o.fly ?? !!beast.speeds?.fly) && !!beast.speeds?.fly;
    const sp = beast.speeds || {}, walk = sp.walk || 1.6, trot = sp.trot || (sp.run ? (walk + sp.run) / 2.2 : walk * 2.2), run = sp.run || trot * 2.2;
    this.speeds = { stand: 0, walk, trot, canter: (trot + run) / 2, gallop: run * 1.05, back: -walk * .55, fly: sp.fly || 0 };
    this.size = beast.size; const S = beast.scale.x || 1; this.S = S;
    this.speed = 0; this.vy = 0; this.yaw = beast.rotation.y; this.gait = 'stand'; this.want = 'stand'; this.air = false; this.flying = false;
    this.pitch = 0; this.bank = 0; this.alt = 0; this.stamina = 1; this.tired = false; this.jumping = 0; this.turnRate = 0;
    this.swing = null; this.charge = 0; this.posture = 0; this.post = 0; this.t = 0;
    this.fit();
    this.parts = {}; this.points = { barL: this.gripL, barR: this.gripR }; this.doors = [];
    this.door = () => null; this.open = () => this;
    this.seats = { saddle: { name: 'saddle', point: this.seatPoint, side: -1, door: null, saddle: true, steer: true, hold: false, who: null } };
    riders(this, { lean: true, size: { width: this.size.width * .6, length: this.size.length } });
    this.ridersUpdate = this.update; delete this.update;   // (the rider's trips and seat: run from ride())
    this.layReins(0);
    this.links?.join('mounts', this);
  }
  get parent() { return this.beast.parent; }
  get world() { const w = linked(this.given, this.links, 'world'); return w?.rider ? w : null; }
  /** Who is in the saddle (or getting on), or null. */
  get rider() { return this.seats.saddle.who || this.trips.find(T => T.kind === 'enter')?.person || null; }
  on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; }
  emit(e) { this.events.push(e); for (const f of this.handlers[e.type] || []) f(e); return e; }

  // the saddle and its tack, made to the creature's own shape and pinned to its back, and the seat, grips and bit
  fit() {
    const B = this.beast, mesh = B.mesh, geo = mesh.geometry, S = this.S, M = 1 / S;   // M: a metre in the creature's own units
    geo.computeBoundingBox(); const bb = geo.boundingBox, L = bb.max.z - bb.min.z;
    // the saddle's place: just behind the withers, found as the front of the back's lowest stretch between the hips and the shoulders
    const hipsB = B.bones.hips, spineB = B.bones.spine || B.bones.neck || B.bones.head;
    const hz = hipsB ? this.bindZ(hipsB) : bb.min.z + L * .3, sz = spineB ? this.bindZ(spineB) : bb.min.z + L * .7;
    // the body's own points (carried by the hips, the spine or the neck: not wings, legs, a tail or the head)
    const SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight, bones = mesh.skeleton.bones, body = new Set(['hips', 'spine', 'neck', 'chest']);
    const mask = this.mask = new Uint8Array(geo.attributes.position.count);
    for (let i = 0; i < mask.length; i++) { let bi = 0, w = -1; for (let k = 0; k < 4; k++) { const ww = SW.getComponent(i, k); if (ww > w) { w = ww; bi = SI.getComponent(i, k); } } mask[i] = body.has(bones[bi]?.name) ? 1 : 0; }
    const cut = (z, b) => slice(geo, z, b, mask);
    const band = max(L * .03, .04 * M), nz = B.bones.neck ? this.bindZ(B.bones.neck) : sz;
    let zc = hz + (sz - hz) * .8;
    if (this.o.seat != null) zc = hz + (sz - hz) / 2 - this.o.seat * M;
    else if (cut(zc, band).hw * S > .4) {
      // a back too broad to sit astride (a dragon's): the nearest narrow enough place, on towards the neck, else the narrowest
      let best = zc, bw = Infinity;
      for (let t = .5; t <= 1.6; t += .05) { const z = hz + (nz - hz) * t * ((sz - hz) / ((nz - hz) || 1)) , w = cut(z, band).hw * S; if (!(w > 0)) continue; const sc = (w > .4 ? 10 + w : 0) + abs(z - zc) / L; if (sc < bw) { bw = sc; best = z; } }
      zc = best;
    }
    const s = cut(zc, band); if (s.vertex < 0) throw new Error('Mount: could not find the creature\'s back');
    this.back = s; const bone = boneAt(mesh, s.vertex);
    const ry = (s.top - s.bottom) / 2, yc = s.top - ry, rx = s.hw;
    // the tack, built in metres about the top of the back, on a group pinned there
    const tack = this.tack = new Group(); tack.name = 'mount:tack';
    const anchor = this.anchor = pin(mesh, bone, 0, s.top, zc); anchor.add(tack); tack.scale.setScalar(1);
    const so = this.o.saddle ?? {};
    if (so !== false) {
      const leather = material('leather', { colour: so.colour || '#6b4226', repeat: [2, 2], closeUp: false }), dark = material('leather', { colour: so.dark || '#3c2416', repeat: [2, 2], closeUp: false });
      const cloth = material('fabric', { colour: so.blanket || '#8a2f2a', repeat: [3, 3], closeUp: false }), steel = pbr('#9aa0a6', { rough: .35, metal: 1 });
      const add = (g, m, name, y = -s.top) => { const k = new Mesh(g, m); k.name = 'mount:' + name; k.position.y = y; k.castShadow = true; k.receiveShadow = true; tack.add(k); return k; };
      // (each piece in the creature's units, about the barrel's centre: the tack group is at the top of the back)
      const lift = .012 * M;
      add(wrapPiece(rx + lift, ry + lift, .78 * M, 2.1), cloth, 'blanket', -ry);
      add(wrapPiece(rx + lift * 2.4, ry + lift * 2.4, .56 * M, 1.5), dark, 'skirt', -ry).position.z = -.02 * M;
      // the seat on its tree: raised a hand over the spine, falling away to the flaps, so a rider's legs come down outside them
      const seat = add(wrapPiece(rx * .62 + .03 * M, ry + .085 * M, .5 * M, 1.25), leather, 'seat', -ry); seat.position.z = -.03 * M;
      for (const side of [-1, 1]) add(wrapPiece(rx + lift * 3, ry + lift * 3, .4 * M, .62, side * 1.02), dark, side < 0 ? 'flapL' : 'flapR', -ry).position.z = .02 * M;
      // pommel and cantle: a rise at the front, a roll at the back
      const pom = add(new SphereGeometry(.07 * M, 12, 8), leather, 'pommel', .1 * M); pom.scale.set(1.3, .8, 1); pom.position.z = .24 * M;
      const can = add(new TorusGeometry(.14 * M, .04 * M, 8, 16, PI), leather, 'cantle', .075 * M); can.position.z = -.25 * M; can.scale.set(1, .42, 1.4);
      // the girth round the belly
      const girth = add(new CylinderGeometry(1, 1, .07 * M, 24, 1, true), dark, 'girth', -ry); girth.geometry.rotateX(PI / 2); girth.scale.set(rx * 1.02 + lift, ry * 1.04 + lift, 1); girth.position.z = .12 * M;
      girth.material = dark; girth.material.side = DoubleSide;
      // stirrup leathers and irons, hanging to just under the belly
      this.irons = [];
      for (const side of [-1, 1]) {
        // (where a seated rider's foot hangs: the knee out against the flap, the iron under it, within a leg's reach)
        const D = min(.5 * M, (s.top - s.bottom) * .9), x = side * (max(rx, s.side(D)) + .05 * M), len = D - .12 * M;
        const strap = add(new BoxGeometry(.035 * M, len, .012 * M), dark, side < 0 ? 'leatherL' : 'leatherR', -.12 * M - len / 2); strap.position.x = x; strap.position.z = .05 * M;
        const iron = add(new TorusGeometry(.055 * M, .01 * M, 6, 14), steel, side < 0 ? 'ironL' : 'ironR', -D - .045 * M); iron.position.x = x; iron.position.z = .05 * M; iron.rotation.y = PI / 2;
        const foot = new Object3D(); foot.position.set(x + side * .02 * M, -D - .03 * M, .07 * M); tack.add(foot); this.irons.push(foot);
      }
    }
    // the seat (the rider's hips) and where the reins come to the hands
    this.seatAt = new Object3D(); this.seatAt.position.set(0, .13 * M, -.05 * M); tack.add(this.seatAt);
    // the bit: at the mouth (the front of the head, low), on whichever bone carries it
    const tip = this.tip(geo);
    this.bit = [-1, 1].map(side => { const p = pin(mesh, boneAt(mesh, tip.i), side * tip.w, tip.y, tip.z); return p; });
    // the shell the rider sits in (as a vehicle's: x across, y up, nose along -z, metres), riding on the creature's root
    const shell = this.shell = new Group(); shell.name = 'mount:shell'; shell.rotation.y = PI; shell.scale.setScalar(M); B.add(shell);
    this.seatPoint = new Object3D(); this.gripL = new Object3D(); this.gripR = new Object3D(); shell.add(this.seatPoint, this.gripL, this.gripR);
    // reins: two flat straps from the bit to the hands (or, with nobody on, to the pommel), sagging
    if (this.o.reins !== false) {
      const N = 12, g = new BufferGeometry(), pos = new Float32Array(4 * N * 2 * 3), idx = [];
      for (let r = 0; r < 4; r++) for (let i = 0; i < N - 1; i++) { const a = (r * N + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setAttribute('position', new BufferAttribute(pos, 3)); g.setIndex(idx);
      const m = material('leather', { colour: '#3a2214', closeUp: false }); m.side = DoubleSide;
      this.reins = new Mesh(g, m); this.reins.name = 'mount:reins'; this.reins.frustumCulled = false; this.reins.castShadow = true; this.reinsN = N; shell.add(this.reins);
    }
    B.updateMatrixWorld(true); this.place3();
  }
  bindZ(bone) { const i = this.beast.mesh.skeleton.bones.indexOf(bone), m = new Matrix4().copy(this.beast.mesh.skeleton.boneInverses[i]).invert(); return m.elements[14]; }
  tip(geo) {
    const P = geo.attributes.position; let z = -1e9, i = -1; for (let k = 0; k < P.count; k++) if (abs(P.getX(k)) < .05 && P.getZ(k) > z) { z = P.getZ(k); i = k; }
    const y = P.getY(i); let lo = y, w = 0; for (let k = 0; k < P.count; k++) if (z - P.getZ(k) < (z - this.back.top) * 0 + .12 / this.S && abs(P.getY(k) - y) < .2 / this.S) { lo = min(lo, P.getY(k)); w = max(w, abs(P.getX(k))); }
    return { i, z: z - .08 / this.S, y: (y + lo) / 2, w: w * .9 };
  }
  // the seat and grips in the shell, where the back is now (it rises and falls with the stride)
  place3() {
    const sh = this.shell, at = this.seatAt.getWorldPosition(V1);
    this.seatPoint.position.copy(sh.worldToLocal(at));
    const g = this.seatPoint.position, fwd = .3 + this.posture * .16, up = .2 - this.posture * .06;
    this.gripL.position.set(g.x - .09, g.y + up, g.z - fwd); this.gripR.position.set(g.x + .09, g.y + up, g.z - fwd);
  }
  layReins(sag) {
    if (!this.reins) return;
    const sh = this.shell, N = this.reinsN, pos = this.reins.geometry.attributes.position, who = this.seats.saddle.who;
    const hand = side => { const h = who?.rig?.parts?.[side < 0 ? 'handL' : 'handR']; return h ? sh.worldToLocal(h.getWorldPosition(V2)).clone() : (side < 0 ? this.gripL : this.gripR).position.clone().setY(this.seatPoint.position.y + .1); };
    for (let r = 0; r < 2; r++) {
      const a = sh.worldToLocal(this.bit[r].getWorldPosition(V1)).clone(), b = hand(r ? 1 : -1), drop = (who ? .05 : .12) + sag * .05;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1), x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t - drop * 4 * t * (1 - t), z = a.z + (b.z - a.z) * t;
        for (let e = 0; e < 2; e++) {   // (flat, then on edge)
          const k = ((r * 2 + e) * N + i) * 2 * 3, w = .011, dx = e ? 0 : w, dy = e ? w * .6 : 0;
          pos.array[k] = x - dx; pos.array[k + 1] = y - dy; pos.array[k + 2] = z; pos.array[k + 3] = x + dx; pos.array[k + 4] = y + dy; pos.array[k + 5] = z;
        }
      }
    }
    pos.needsUpdate = true; this.reins.geometry.computeVertexNormals?.();
  }

  /** Puts it at (x, y, z) facing `turn` (radians about y), standing still. */
  place(x = 0, y = 0, z = 0, turn = this.yaw) {
    const B = this.beast; B.position.set(x, y, z); this.yaw = B.rotation.y = turn; this.speed = 0; this.vy = 0; this.air = this.flying = false; this.gait = this.want = 'stand';
    const w = this.world; if (w && !this.body) this.body = w.rider({ box: [this.size.width * .7, this.size.height * .8, this.size.length * .8], at: { x, y, z }, turn, step: .35, slope: 42, mass: 500, tag: 'mount' });
    this.body?.place(x, y, z, turn); this.body && (this.body.owner = this);
    return this;
  }
  /** One gait faster (a nudge of the heels): stand, walk, trot, canter, gallop. */
  urge() { const i = GAITS.indexOf(this.want); this.want = GAITS[min(GAITS.length - 1, i + 1)]; return this; }
  /** One gait slower (a pull on the reins). */
  rein() { const i = GAITS.indexOf(this.want); this.want = GAITS[max(0, i - 1)]; return this; }

  /**
   * Each frame. input: stick ({ x: -1 left..1 right, y: -1 back..1 on }: on the ground, how far forward picks the gait up
   * to the one urged, and pulling back stops it and backs it up; in the air, the speed), jump (true: a jump on the ground,
   * a take-off for a flyer), urge / rein (true: a gait up or down), climb (-1..1, in the air: dive..climb), land (true:
   * come down). Moves the beast, plays its gait and sits the rider.
   */
  ride(dt, { stick = null, jump = false, urge = false, rein = false, climb = 0, land = false } = {}) {
    this.events = []; this.t += dt; if (dt <= 0) return this;
    const B = this.beast, sx = clamp(stick?.x || 0, -1, 1), sy = clamp(stick?.y || 0, -1, 1), busy = this.trips.length > 0;
    if (urge) this.urge(); if (rein) this.rein();
    // with nobody on (or someone getting on or off) it stands
    const ridden = !!this.seats.saddle.who && !busy;
    if (this.flying) this.fly(dt, ridden ? { sx, sy, climb, land } : { sx: 0, sy: 0, climb: -.4, land: true });
    else this.run(dt, ridden ? { sx, sy, jump } : { sx: 0, sy: 0, jump: false });
    // the rider's seat: how they sit the gait, the reins, the stirrups, and a blow in progress
    this.posture = approach(this.posture, this.flying ? .55 : this.air ? .9 : { stand: 0, walk: .05, trot: .2, canter: .35, gallop: .85, back: 0 }[this.gait] ?? 0, dt * 2.5);
    B.updateMatrixWorld(true); this.place3();
    this.ridersUpdate(dt);
    this.sit(dt);
    this.layReins(1 - this.posture);
    return this;
  }
  // on the ground: gaits with weight, turning wider the faster it goes, jumps, stamina for the gallop
  run(dt, { sx, sy, jump }) {
    const B = this.beast, SP = this.speeds;
    let want = 0;
    if (sy > .15) { let g = this.want === 'stand' ? 'walk' : this.want; if (this.tired && g === 'gallop') g = 'canter'; const top = SP[g]; want = top * clamp((sy - .15) / .7, .35, 1); if (sy > .92 && this.want === 'stand') this.want = 'walk'; }
    else if (sy < -.4) want = this.speed > .3 ? 0 : SP.back;
    else if (this.want !== 'stand' && sy >= -.15 && abs(sy) < .15 && this.seats.saddle.who) want = 0;
    // weight: it gets going over a second or two, stops quicker, and a stop from a gallop takes a few strides
    const up = want > this.speed ? 2.2 + this.speed * .15 : 4.5; if (!this.air) this.speed = approach(this.speed, want, up * dt);
    // the gait it is in, from its speed (for the rider's seat and the sounds)
    const v = this.speed, was = this.gait;
    this.gait = v < -.05 ? 'back' : v < .15 ? 'stand' : v < (SP.walk + SP.trot) / 2 ? 'walk' : v < (SP.trot + SP.canter) / 2 ? 'trot' : v < (SP.canter + SP.gallop) / 2 ? 'canter' : 'gallop';
    if (this.gait !== was) this.emit({ type: 'gait', gait: this.gait, was });
    // stamina: the gallop spends it, anything slower gives it back
    const st = this.o.stamina ?? 8;
    if (this.gait === 'gallop') { this.stamina = max(0, this.stamina - dt / st); if (this.stamina === 0 && !this.tired) { this.tired = true; this.emit({ type: 'tired' }); } }
    else { this.stamina = min(1, this.stamina + dt / (st * 1.6)); if (this.tired && this.stamina > .35) { this.tired = false; this.emit({ type: 'rested' }); } }
    // turning: quick on the spot and at a walk, wide at a gallop; the body leans into it
    const base = this.o.turn ?? 1.9, rate = base / (1 + max(0, abs(v) - SP.walk) * .22);
    this.turnRate = approach(this.turnRate, -sx * rate * (v < -.05 ? -1 : 1), dt * 6);
    this.yaw = wrap(this.yaw + this.turnRate * dt);
    // jumping: from a trot or faster (or a hop on the spot), its height from its size
    if (jump && !this.air && !this.jumping) {
      if (this.flies && this.seats.saddle.who) { this.takeOff(); return; }
      const h = this.o.jump ?? 1.1 * (this.size.height / 1.7), go = abs(v) > SP.walk * .8;
      this.vy = sqrt(2 * abs(this.world?.gravity?.y ?? -20) * (go ? h : h * .35)); this.air = true; this.jumping = 1; this.emit({ type: 'jump' });
    }
    const g = this.world?.gravity?.y ?? -20, fx = sin(this.yaw) * v * dt, fz = cos(this.yaw) * v * dt;
    if (this.air) this.vy += g * dt;
    this.move(fx, this.air ? this.vy * dt : -.05, fz, dt);
    // the beast's legs: the gait for the speed, or the jump's tuck in the air
    if (this.air && B.rig.poses.jump) { B.rig.play('jump', { fade: .12 }); B.rig.update(dt, { speed: abs(v) }); }
    else B.move(dt, abs(v), { turn: clamp(this.turnRate / 2, -1, 1) });
    // lean into the turn, pitch up off the ground and down onto it
    const lean = clamp(-this.turnRate * abs(v) * .025, -.22, .22);
    this.bank = approach(this.bank, lean, dt * 1.5); this.pitch = approach(this.pitch, this.air ? clamp(-this.vy * .03, -.25, .25) : 0, dt * 2);
    B.rotation.set(this.pitch, this.yaw, this.bank, 'YXZ');
  }
  // in the air: speed from the stick, climbing and diving, banking into turns, landing when it comes down slow
  takeOff() { this.airT = 0; this.flying = true; this.air = true; this.vy = 6; this.gait = 'fly'; this.speed = max(this.speed, this.speeds.fly * .45); this.emit({ type: 'takeoff' }); }
  fly(dt, { sx, sy, climb, land }) {
    const B = this.beast, F = this.speeds.fly, want = land ? F * .25 : F * (.45 + .55 * clamp((sy + 1) / 2, 0, 1)) * (1 + max(0, -climb) * .35);
    this.speed = approach(this.speed, want, dt * 3);
    const bankTo = clamp(sx, -1, 1) * .7; this.bank = approach(this.bank, bankTo, dt * 1.6);
    this.turnRate = -this.bank * 1.3 * (9.8 / max(4, this.speed)) * .4; this.yaw = wrap(this.yaw + this.turnRate * dt);
    const pitchTo = land ? -.18 : clamp(climb, -1, 1) * .45; this.pitch = approach(this.pitch, -pitchTo, dt * 1.2);
    const vy = -sin(this.pitch) * this.speed * 1.2 - (land ? 1.5 : 0) - (this.speed < F * .35 ? 3 : 0);
    const h = cos(this.pitch) * this.speed * dt;
    this.move(sin(this.yaw) * h, vy * dt, cos(this.yaw) * h, dt);
    B.move(dt, this.speed, { fly: true, turn: clamp(-this.bank, -1, 1) });
    B.rotation.set(this.pitch, this.yaw, -this.bank, 'YXZ');
    this.airT = (this.airT || 0) + dt;
    if (this.onGround && vy <= 0 && this.airT > .8) { this.airT = 0; this.flying = false; this.air = false; this.vy = 0; this.speed = min(this.speed, this.speeds.trot); this.pitch = 0; this.bank = 0; this.gait = 'walk'; this.want = 'trot'; this.emit({ type: 'land' }); }
  }
  // a move through the world (or over the ground without one)
  move(dx, dy, dz, dt) {
    const B = this.beast, body = this.body;
    if (body) {
      body.slide(dx, dy, dz, this.yaw, dt); const p = body.pos; B.position.set(p.x, p.y, p.z); this.onGround = body.grounded;
      if (body.wall && abs(this.speed) > 1 && !this.flying) { const hit = abs(this.speed); this.speed *= .3; this.emit({ type: 'bump', speed: hit, thing: body.wall.thing }); }
    } else {
      const g = this.o.ground ? this.o.ground(B.position.x + dx, B.position.z + dz) : 0; B.position.x += dx; B.position.z += dz; B.position.y += dy;
      this.onGround = B.position.y <= g + .001; if (this.onGround) B.position.y = g;
    }
    if (this.air && !this.flying && this.onGround && this.vy <= 0) { this.air = false; this.vy = 0; this.jumping = 0; this.emit({ type: 'land' }); }
    if (!this.air && !this.onGround && !this.flying && this.body && dy <= 0) { this.air = true; this.vy = 0; }   // (off a ledge)
  }
  // a rider's pose in this saddle (a motorbike's 'ride' is theirs again once off): upright at the walk, forward
  // over the neck at the gallop, legs round the barrel (the feet go to the irons after)
  seatPose(p) {
    const R = p?.rig; if (!R || this.posed === p) return;
    if (this.posed) this.unseat();
    const me = this, P = (j, drop = 0) => ({ j, drop });
    this.posed = p; this.kept = R.poses.ride;
    R.add('ride', ph => { const k = me.posture, b = Math.sin(ph * Math.PI * 2) * .01; return P({ spine: [.04 + k * .5 + b, 0, 0], head: [-.05 - k * .4, 0, 0], legL: [-.75, 0, -.55], legR: [-.75, 0, .55], shinL: [1.2, 0, 0], shinR: [1.2, 0, 0], footL: [-.25, 0, 0], footR: [-.25, 0, 0], armL: [-.6, .1, -.12], armR: [-.6, -.1, .12], foreL: [-1.05, 0, 0], foreR: [-1.05, 0, 0] }); }, { time: 1.4 });
  }
  unseat() { const p = this.posed; if (!p) return; if (this.kept) p.rig.poses.ride = this.kept; this.posed = null; this.kept = null; }
  // the rider sits the gait: the seat, hands on the reins (or a blow), feet in the irons
  sit(dt) {
    const who = this.seats.saddle.who || this.trips[0]?.person || null; if (who) this.seatPose(who); else if (this.posed) this.unseat();
    const p = this.seats.saddle.who; if (!p || this.trips.length) return;
    const bump = this.gait === 'trot' ? abs(sin(this.t * PI * 2 * 1.4)) : this.gait === 'canter' ? .5 + .5 * sin(this.t * PI * 2 * 1.6) : 0;
    p.position.y += (this.posture > .6 ? .08 : bump * .05) * (this.posture > .6 ? 1 : 1);   // (rising at the trot; up out of the saddle at the gallop)
    const S = this.swing, pts = {}, o = { blend: 1, knees: { L: [-1, -.1, .3], R: [1, -.1, .3] } };
    if (!S || S.t > S.time * .9) { pts.handL = this.gripL.getWorldPosition(new Vector3()); pts.handR = this.gripR.getWorldPosition(new Vector3()); }
    if (S) { S.t += dt; delete pts[S.hand]; if (S.t >= S.time) { this.swing = null; p.rig?.upper(null); } else if (!S.hit && S.t >= S.time * S.at) { S.hit = true; this.blow(S); } }
    if (this.irons) { pts.footL = this.irons[0].getWorldPosition(new Vector3()); pts.footR = this.irons[1].getWorldPosition(new Vector3()); }
    if (p.touch && Object.keys(pts).length) p.touch(pts, o);
  }
  /**
   * A blow from the saddle: side 'right' | 'left' | 'front' (overhead, down ahead). Its hit comes a moment in, as an
   * event { type: 'strike', at, radius, power, dir }: power grows with the speed (a charge at the gallop is twice a blow
   * at a stand). shoot(dir) looses an arrow instead: { type: 'shoot', from, dir }.
   */
  strike(side = 'right', { power = 1, time = .62 } = {}) {
    const p = this.seats.saddle.who; if (!p || this.swing || this.trips.length) return false;
    const pose = side === 'front' ? 'overhead' : side === 'left' ? 'backhand' : 'swing';
    p.rig?.upper(p.rig.poses[pose] ? pose : 'punch');
    this.swing = { side, power, time, t: 0, at: .45, hit: false, hand: side === 'left' ? 'handL' : 'handR', kind: 'strike' };
    return true;
  }
  shoot(dir = null, { time = .5 } = {}) {
    const p = this.seats.saddle.who; if (!p || this.swing || this.trips.length) return false;
    p.rig?.upper('aim'); this.swing = { side: 'front', power: 1, time, t: 0, at: .55, hit: false, hand: 'handR', kind: 'shoot', dir };
    return true;
  }
  blow(S) {
    const B = this.beast, f = new Vector3(sin(this.yaw), 0, cos(this.yaw)), r = new Vector3(-f.z, 0, f.x), seat = this.seatPoint.getWorldPosition(new Vector3());
    const charge = 1 + clamp(abs(this.speed) / max(1, this.speeds.gallop), 0, 1);
    if (S.kind === 'shoot') { const d = S.dir ? new Vector3(S.dir.x, S.dir.y || 0, S.dir.z).normalize() : f.clone(); return this.emit({ type: 'shoot', from: seat.clone().add(new Vector3(0, .5, 0)), dir: d, speed: this.speed }); }
    const side = S.side === 'left' ? 1 : S.side === 'right' ? -1 : 0;
    const at = seat.clone().addScaledVector(r, side * 1.1).addScaledVector(f, S.side === 'front' ? 1.5 : .5).setY(seat.y + (S.side === 'front' ? .2 : .1));
    this.charge = charge; void B;
    return this.emit({ type: 'strike', side: S.side, at, radius: 1.2, power: S.power * charge, dir: f, speed: this.speed });
  }
  /** A stick that takes it towards a point (for a companion's horse, or one led by the reins): pass to ride() as stick. */
  steerTo(x, z, { stop = 2, gait = 'trot' } = {}) {
    const B = this.beast, dx = x - B.position.x, dz = z - B.position.z, d = hypot(dx, dz);
    const a = wrap(atan2(dx, dz) - this.yaw); this.want = d < stop * 2 ? 'walk' : gait;
    return { x: clamp(-a * 1.5, -1, 1), y: d < stop ? 0 : clamp(d / (stop * 3), .3, 1) * (abs(a) > 1.8 ? .3 : 1) };
  }
  /** Saves where it is, its gait and its stamina. */
  pack() { const p = this.beast.position; return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), r: +this.yaw.toFixed(3), s: +this.stamina.toFixed(2) }; }
  unpack(d) { if (!d) return this; this.place(d.x, d.y, d.z, d.r); this.stamina = d.s ?? 1; return this; }
  /** Takes the tack off the creature and its body out of the world. */
  remove() {
    // whoever is on it or getting on is let go where they are, theirs again
    const home = this.beast.parent, people = new Set([this.seats.saddle.who, ...this.trips.map(T => T.person)].filter(Boolean));
    for (const p of people) { if (p.parent === this.shell) { if (home) home.attach(p); else this.shell.remove(p); } p.vehicle = null; p.seat = null; }
    this.seats.saddle.who = null; this.unseat();
    this.anchor.removeFromParent(); for (const b of this.bit) b.removeFromParent(); this.shell.removeFromParent(); this.body?.remove(); this.links?.leave(this); }
}
const V1 = new Vector3(), V2 = new Vector3();
