// gs.city's street life: what the people of a city do besides walking round the blocks, and how they react.
//
// Now and then someone stops: looks in a shop window, takes a call, stops to chat with someone passing, sits on a park
// bench, or goes in at a door. Round a crash people run from it, then some come to look and some phone it in; they
// jump out of the way of a car coming at them (a chase, a crash, or the player: city.avoid with a speed); they cower at
// a bang. witness(at) asks who saw something (people with a clear line to it), and they phone the police (a 'call'
// event the Wanted kit reads). A driver gets out of a wrecked car and stands looking at it, then calls it in.
// On a Next Gen view the nearest few people are promoted from the crowd to full people (gs.models.human twins of
// the crowd's own, with gs.characters Reactions): faces that look at you, and real stumbles and falls (a ragdoll
// in the World3D after city.solid(world)) when they are hit; anyone knocked over near the camera is promoted first.
// Kit use only: city.js's People calls these.

import { POSES } from './poses.js';
import { Reactions } from './reactions.js';
import { phoneClass } from './speed.js';

const TAU = Math.PI * 2, S = Math.sin, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const KERB = .15;

/** The moves the city's people make besides walking (on gs.poses' joints), added to a person's rig. */
export function addMoves(rig) {
  if (rig.poses.phone) return rig;
  // a phone at the right ear, the head tipped to it, weight on one leg
  rig.add('phone', p => ({ j: { spine: [.03, 0, .02], head: [.08 + S(p * TAU) * .03, .12, -.12], armR: [-.45, .55, .55], foreR: [-2.45, 0, 0], handR: [0, 0, -.4], armL: [.05, 0, -.1], foreL: [-.35, 0, 0], legL: [-.04, 0, -.05], legR: [.04, 0, .06], shinR: [.12, 0, 0] }, drop: .005 }), { time: 3 });
  // talking with someone: hands that move as the words come, a nod
  rig.add('talk', p => {
    const a = S(p * TAU), b = S(p * TAU * 2 + 1), c = S(p * TAU * 3 + 2);
    return { j: { spine: [.04, .05 * a, 0], head: [.05 + .05 * b, .1 * a, 0], armR: [-.55 - .3 * Math.max(0, b), .15, .12], foreR: [-1.25 - .35 * c, .2 * a, 0], handR: [.2 * b, 0, 0], armL: [-.25 - .2 * Math.max(0, -a), -.1, -.12], foreL: [-1.0 - .25 * b, 0, 0] }, drop: 0 };
  }, { time: 2.6 });
  // ducking at a bang: down low, arms over the head
  const crouch = POSES.crouch.cycle(0);
  rig.add('cower', { j: { ...crouch.j, spine: [.62, 0, 0], head: [.35, 0, 0], armL: [-2.5, .2, -.45], armR: [-2.5, -.2, .45], foreL: [-1.75, 0, 0], foreR: [-1.75, 0, 0] }, drop: crouch.drop + .04 });
  rig.poses.cower.per = 0;   // (one pose: a single row in a crowd's texture)
  return rig;
}

/** The nearest point of a block's pavement ring to x, z, as the s People.at() takes. */
export function project(L, b, x, z) {
  const r = L.ring(b), w = r[1][0] - r[0][0], d = r[2][1] - r[1][1], base = [0, w, w + d, 2 * w + d];
  let best = 0, bd = Infinity;
  for (let i = 0; i < 4; i++) {
    const a = r[i], c = r[(i + 1) % 4], vx = c[0] - a[0], vz = c[1] - a[1], len = Math.hypot(vx, vz) || 1, t = clamp(((x - a[0]) * vx + (z - a[1]) * vz) / (len * len), 0, 1);
    const px = a[0] + vx * t, pz = a[1] + vz * t, dd = (px - x) ** 2 + (pz - z) ** 2; if (dd < bd) { bd = dd; best = base[i] + t * len; }
  }
  return { s: best, d: Math.sqrt(bd) };
}
/** Back to walking round the nearest block's pavement from wherever someone is (walking there first when it is far). */
export function toRing(L, p) {
  let bb = null, best = null;
  for (const b of L.plan.blocks) { const q = project(L, b, p.x, p.z); if (!best || q.d < best.d) { best = q; bb = b; } }
  p.act = null; p.cross = null; p.wait = 0; p.waitFor = null;
  if (best.d > .8) { const at = L.at(bb, best.s); p.free = { x: at.x, z: at.z, run: p.panic > 0 ? 2.8 : 1, then: { ring: bb, s: best.s } }; return; }
  p.free = null; p.block = bb; p.s = best.s;
}
// someone starts doing something where they stand: { move, t (seconds), face (heading), then }
const act = (p, move, t, face = p.heading, then = null) => { p.act = { move, t, face, then }; p.free = null; p.wait = 0; p.waitFor = null; return p; };
const faceTo = (p, x, z) => Math.atan2(x - p.x, z - p.z);

/**
 * One person for one frame, when they are doing something other than walking round the block. Returns true when
 * it moved them (so the usual pavement walk is skipped).
 */
export function lifeStep(L, p, dt) {
  const city = L.city;
  if (p.act) {
    const A = p.act; A.t -= dt;
    p.heading = p.heading + wrap(A.face - p.heading) * Math.min(1, dt * 5);
    if (p.calling && A.move === 'phone' && A.t <= 0) { city.event({ kind: 'call', at: p.calling.at, about: p.calling.about, by: p }); p.calling = null; }
    if (A.with && A.with.act?.with !== p) A.t = Math.min(A.t, .3);   // (the one they were talking to has gone)
    if (A.t <= 0) {
      p.act = null; const then = A.then;
      if (typeof then === 'function') then(p);
      else if (then === 'gone') L.vanish(p);
      else toRing(L, p);
    }
    return true;
  }
  if (p.free) {
    const F = p.free, dx = F.x - p.x, dz = F.z - p.z, d = Math.hypot(dx, dz), v = p.speed * (F.run || 1) * (p.panic > 0 ? 2.6 : 1);
    if (d < .35 + v * dt) {
      p.x = F.x; p.z = F.z; p.free = null;
      if (F.then?.ring) { p.block = F.then.ring; p.s = F.then.s; }
      else if (typeof F.then === 'function') F.then(p);
      else toRing(L, p);
      return true;
    }
    const q = L._q ||= { x: 0, z: 0 }; q.x = p.x + dx / d * v * dt; q.z = p.z + dz / d * v * dt;
    city.collide(q, .3, (city.ground(p.x, p.z) || 0) + .2);
    const moved = Math.hypot(q.x - p.x, q.z - p.z); F.slow = moved < v * dt * .3 ? (F.slow || 0) + dt : 0;
    p.heading = Math.atan2(q.x - p.x, q.z - p.z) || p.heading; p.x = q.x; p.z = q.z;
    if (F.slow > 1.2) { p.free = null; toRing(L, p); }   // (walked into a corner: off another way)
    return true;
  }
  return false;
}

/** Now and then, someone walking round a block stops to do something. */
export function ambient(L, p, dt, q) {
  if ((p.think -= dt) > 0 || p.panic > 0 || p.cross || p.wait > 0) return false;
  const R = L.R, city = L.city, b = p.block; p.think = 3 + R() * 6;
  const r = R();
  if (b.kind === 'park' && r < .14) {   // a bench in this park
    const bench = L.plan.benches.find(s => s.x > b.x0 && s.x < b.x1 && s.z > b.z0 && s.z < b.z1 && Math.hypot(s.x - p.x, s.z - p.z) < 30 && !L.list.some(o => o.seat === s));
    if (bench) {
      const fx = Math.sin(bench.rot), fz = Math.cos(bench.rot);
      p.seat = bench; p.free = { x: bench.x + fx * .62, z: bench.z + fz * .62, run: 1, then: o => { act(o, 'sit', 10 + R() * 18, bench.rot, o2 => { o2.seat = null; toRing(L, o2); }); o.x = bench.x + fx * .1; o.z = bench.z + fz * .1; } };
      return true;
    }
  }
  if (r < .1) { act(p, 'phone', 5 + R() * 8); return true; }
  if (r < .2) {   // someone passing: stop and chat
    for (const o of L.list) {
      if (o === p || o.act || o.free || o.cross || o.wait > 0 || o.down > 0 || o.panic > 0) continue;
      const dx = o.x - p.x, dz = o.z - p.z; if (dx * dx + dz * dz > 6) continue;
      const t = 6 + R() * 10; act(p, 'talk', t, faceTo(p, o.x, o.z)); act(o, 'talk', t, faceTo(o, p.x, p.z)); p.act.with = o; o.act.with = p;
      return true;
    }
  }
  if (r < .3 && b.kind === 'build') {   // a look in a shop window: facing away from the road
    const side = [Math.PI, -Math.PI / 2, 0, Math.PI / 2][q.seg];
    act(p, 'idle', 3 + R() * 5, side); return true;
  }
  if (r < .34) {   // in at a door
    const door = L.plan.spots.door.find(s => Math.hypot(s.x - p.x, s.z - p.z) < 10);
    if (door) { p.free = { x: door.x - (door.nx || 0) * .2, z: door.z - (door.nz || 0) * .2, run: 1, then: o => L.vanish(o) }; return true; }
  }
  return false;
}

/**
 * The frame's dangers: whatever is moving fast that isn't keeping to a lane (a chase, a car sliding, the player
 * given to city.avoid with a speed), as { x, z, vx, vz, r }.
 */
export function dangers(L) {
  const out = L._danger ||= []; out.length = 0;
  for (const c of L.city.cars.list) if (c.mode !== 'lane' && c.mode !== 'wreck' && Math.abs(c.v) > 3) out.push({ x: c.x, z: c.z, vx: c.vx ?? Math.sin(c.heading) * c.v, vz: c.vz ?? Math.cos(c.heading) * c.v, r: c.wid / 2 + .3, car: c });
  for (const o of L.city.cars.seen || []) if (Math.hypot(o.vx || 0, o.vz || 0) > 3) out.push(o);
  return out;
}
/** Out of the way of something coming at them: a jump to the side they are on, then away (and a full person braces). */
export function dodge(L, p, D) {
  for (const o of D) {
    const rx = p.x - o.x, rz = p.z - o.z, v2 = o.vx * o.vx + o.vz * o.vz; if (rx * rx + rz * rz > 900) continue;
    const tc = clamp((rx * o.vx + rz * o.vz) / v2, 0, 1.4), cx = rx - o.vx * tc, cz = rz - o.vz * tc;
    if (tc <= 0 || tc >= 1.35 || cx * cx + cz * cz > (1.7 + (o.r || 1)) ** 2) continue;
    const v = Math.sqrt(v2), px = -o.vz / v, pz = o.vx / v, side = px * rx + pz * rz >= 0 ? 1 : -1;
    p.act = null; p.cross = null; p.wait = 0; p.waitFor = null; p.panic = 2.5;
    p.free = { x: p.x + px * side * 3.2 - o.vx / v * .5, z: p.z + pz * side * 3.2 - o.vz / v * .5, run: 1.8 };
    if (p.full && !p.full.react.busy) p.full.react.brace({ x: o.x, y: 1, z: o.z }, .6);
    L.city.cars.stat?.('dodges');
    return true;
  }
  return false;
}

/** Who sees a point: people within r with nothing in between (and not lying down). */
export function witness(L, at, r = 30) {
  const city = L.city, az = at.z ?? at.y, out = [];
  for (const p of L.list) {
    if (p.down > 0) continue;
    const dx = at.x - p.x, dz = az - p.z, d = Math.hypot(dx, dz); if (d > r) continue;
    if (d > 3 && city.ray({ x: p.x, y: 1.6, z: p.z }, { x: dx, y: (at.y ?? 1) - 1.6, z: dz }, d)) continue;
    out.push(p);
  }
  return out.sort((a, b) => Math.hypot(a.x - at.x, a.z - az) - Math.hypot(b.x - at.x, b.z - az));
}
/** Someone looks at it, then phones it in (a 'call' event in city.events when they finish, unless they are knocked over). */
export function report(L, p, at, about) {
  const R = L.R, az = at.z ?? at.y;
  act(p, 'idle', .8 + R() * 1.2, faceTo(p, at.x, az), o => { o.calling = { at: { x: at.x, z: az }, about }; act(o, 'phone', 4 + R() * 3, faceTo(o, at.x, az)); });
  return p;
}

/** What people do about the city's events this frame (crashes, wrecks, someone knocked over, the game's 'bang'). */
export function react(L, events) {
  const R = L.R;
  for (const e of events || []) {
    const at = e.at; if (!at) continue;
    const az = at.z ?? at.y;
    if (e.kind === 'bang' || e.kind === 'shots') { cower(L, at, e.r ?? 30); continue; }
    if (!((e.kind === 'crash' && (e.power || 0) > 5) || e.kind === 'wreck' || e.kind === 'knock')) continue;
    if (e.kind !== 'knock') L.scare({ x: at.x, z: az }, 10, 2.5);
    let lookers = 0;
    for (const p of L.list) {
      if (p.down > 0 || p.free || p.panic > 0 || p.cop || lookers > 5) continue;
      const d = Math.hypot(p.x - at.x, p.z - az); if (d < 8 || d > 34 || R() > .4) continue;
      // come over and look (from a few metres off, on their side), and some phone it in
      const k = (5 + R() * 3) / d, tx = at.x + (p.x - at.x) * k, tz = az + (p.z - az) * k, call = R() < .3;
      p.act = null; p.wait = 0; p.waitFor = null; p.cross = null; lookers++;
      p.free = { x: tx, z: tz, run: d > 18 ? 1.6 : 1, then: o => act(o, call ? 'phone' : 'idle', 7 + R() * 9, faceTo(o, at.x, az)) };
    }
  }
}
/** Everyone within r of a bang ducks for a moment, then runs. */
export function cower(L, at, r = 30) {
  const R = L.R, az = at.z ?? at.y;
  for (const p of L.list) {
    if (p.down > 0 || Math.hypot(p.x - at.x, p.z - az) > r) continue;
    act(p, 'cower', 1 + R() * 1.6, p.heading, o => { o.panic = 4; toRing(L, o); });
    if (p.full && !p.full.react.busy) p.full.react.brace({ x: at.x, y: 1.2, z: az }, .8);
  }
}
/** The driver of a car that won't drive on gets out, looks at it, and phones it in. */
export function fromCar(L, car) {
  const sk = L.plan.side === 'left' ? -1 : 1, h = car.heading, lx = Math.cos(h) * sk, lz = -Math.sin(h) * sk, w = car.wid / 2 + .5;
  const x = car.x + lx * w - Math.sin(h) * .3, z = car.z + lz * w - Math.cos(h) * .3;
  const p = L.join(x, z); if (!p) return null;
  p.heading = Math.atan2(car.x - x, car.z - z);
  act(p, 'idle', 3 + L.R() * 3, p.heading, o => report(L, o, { x: car.x, z: car.z }, 'crash'));
  return p;
}

/* ---------- full people: the nearest few, out of the crowd ---------- */

/** How many full people at once, by the phone's speed. */
export const FULL = { top: 3, mid: 2, low: 1 };
const PROMOTE = 6.5, DEMOTE = 11;   // metres from the camera
/** One of the crowd as a full person in the same place: a twin of the crowd's figure with Reactions. */
export function promote(L, p) {
  if (p.full || !L.crowd || !L.folk) return p.full || null;
  const src = L.folk[p.kind], m = L.members[L.list.indexOf(p)]; if (!src || !m) return null;
  const body = src.twin(); addMoves(body.rig);
  body.scale.setScalar(L.sizes[p.kind] * p.h); body.position.set(p.x, L.yOf(p), p.z); body.rotation.y = p.heading;
  L.city.group.add(body);
  const react = new Reactions(body, { rest: 1.1 + L.R() * .8 });
  p.full = { body, react, move: null, speed: 0, look: 0 }; m.hide = true;
  L.fulls.add(p);
  return p.full;
}
/** Back into the crowd. */
export function demote(L, p) {
  const f = p.full; if (!f) return;
  f.body.removeFromParent(); f.body.traverse?.(o => { if (o.isSkinnedMesh) o.skeleton?.dispose?.(); });
  const m = L.members[L.list.indexOf(p)]; if (m) { m.hide = false; m.x = p.x; m.z = p.z; m.turn = p.heading; }
  p.full = null; L.fulls.delete(p);
}
/** Each frame: who is promoted (the nearest few to the camera), and the full people posed from what they are doing. */
export function fullStep(L, dt) {
  if (!L.crowd || !L.folk) return;
  const cam = L.city.view.cam?.position, cx = cam?.x ?? 0, cz = cam?.z ?? 0;
  if ((L.pickT -= dt) <= 0 && cam) {
    L.pickT = .3;
    const max = L.fullMax ?? FULL[phoneClass()] ?? 2;
    for (const p of [...L.fulls]) if (!p.full.react.busy && p.down <= 0 && Math.hypot(p.x - cx, p.z - cz) > DEMOTE) demote(L, p);
    const near = L.list.filter(p => !p.full && p.down <= 0 && Math.abs(p.x - cx) < PROMOTE && Math.abs(p.z - cz) < PROMOTE).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
    for (const p of near) { if (L.fulls.size >= max || Math.hypot(p.x - cx, p.z - cz) > PROMOTE) break; promote(L, p); }
  }
  for (const p of L.fulls) {
    const f = p.full, B = f.body, R = f.react;
    if (R.busy) {   // stumbling or down: the body says where they are
      p.x = B.position.x; p.z = B.position.z; p.down = Math.max(p.down, .3); p.cross = null; p.act = null; p.free = null;
      R.update(dt); f.wasBusy = true; continue;
    }
    if (f.wasBusy) { f.wasBusy = false; p.down = 0; p.fall = 0; p.panic = 3; p.heading = B.rotation.y; toRing(L, p); }
    const ox = B.position.x, oz = B.position.z, y = L.yOf(p);
    B.position.set(p.x, y, p.z);
    const sp = dt > 0 ? Math.hypot(p.x - ox, p.z - oz) / dt : 0; f.speed += (Math.min(sp, 7) - f.speed) * Math.min(1, dt * 8);
    B.rotation.y += wrap(p.heading - B.rotation.y) * Math.min(1, dt * 9);
    const move = p.act ? p.act.move : null;
    if (move) { if (f.move !== move) { B.rig.play(move); f.move = move; } }
    else { f.move = null; B.rig.blend({ idle: 0, walk: 1.4, run: 4 }, f.speed); }
    B.rig.update(dt, { speed: f.speed, toward: p.free ? { x: p.free.x, z: p.free.z } : null });
    R.update(dt);
    // eyes on the camera when it is close (not while on the phone)
    if (B.face && (f.look -= dt) <= 0) { f.look = .5; const d = Math.hypot(p.x - cx, p.z - cz); B.face.look(d < 4 && move !== 'phone' && cam ? cam : null); }
  }
}
