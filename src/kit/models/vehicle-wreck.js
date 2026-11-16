// A vehicle in a crash (vehicles.js gives every car, lorry, bus, motorbike, boat and helicopter this, on top of its wear and tear,
// vehicle-damage.js): how much more it can take (health), smoke from its engine as that runs low, then fire, then a
// blast that chars it, blows its glass out and throws its doors off; tyres that burst; doors and bumpers knocked loose
// by a hard hit and off by the next, to lie in the road (bodies of their own when the game has a gs.physics3d World3D).
// Its hit() (and so World3D.vehicle's crashes) does all of this by itself. World3D.vehicle reads it back: a flat tyre
// sits low and grips less, a smoking engine pulls less, a wreck not at all. A boat that has blown up sinks (sinking: gs.craft
// Boat lets it settle and go under) and a helicopter's rotor is thrown off (gs.craft Hover drops it). Kit use only.
import { Vector3, Box3, Quaternion, Euler } from 'three';
import { Particles3D } from '../particles3d.js';
import { sounds } from '../sound.js';
import { linksFor, linksOf } from '../links.js';

const { min, max, abs, hypot, sin, random, PI } = Math, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
// how much a hit takes off (a lorry or a bus takes about twice what a car does; a motorbike less)
const TOUGH = { car: 1, truck: 1.8, bus: 1.9, bike: .7, boat: 1.5, helicopter: .8 };
// health below which it smokes, smokes black, and burns (and then blows up after its fuse)
export const SMOKE = .55, DARK = .3, FIRE = .12;
const V1 = new Vector3(), V2 = new Vector3(), Q1 = new Quaternion(), E1 = new Euler();

/**
 * Gives a road vehicle health, harm(), burst(), loosen(), detach(), blow(), putOut(), on(), tyres, engine and wrecked,
 * and adds to its hit(), mend() and update(). dmg: what wearAndTear() returned.
 */
export function wreckable(root, shell, plan, kind, dmg) {
  const tough = TOUGH[kind] ?? 1, handlers = {}, S = { health: 1, fuse: 0, blown: false, burnt: 0, stage: 0, t: 0 };
  const tell = (ev, e) => { for (const f of handlers[ev] || []) f(e); };
  /** Calls fn(e) when it starts to smoke ('smoke'), catches fire ('fire'), blows up ('blow': e.at, e.radius, e.hurt(point)), a tyre bursts ('burst': e.tyre) or a part comes off ('off': e.part, e.name). */
  root.on = (ev, fn) => { (handlers[ev] ||= []).push(fn); return root; };
  // (made in a game's make() or reset(): Explosives and other vehicles' blasts find it)
  linksFor(null)?.join('vehicles', root);

  // ---------------------------------------------------------------- where things are on it
  // its body's bounds in the shell's space (worked out once), its engine (a car's and lorry's in front, a bus's at the back, a bike's in the middle)
  let B = null;
  const bounds = () => {
    if (B) return B; B = new Box3();
    for (const m of shell.children) if (m.isMesh && (m.name === 'paint' || m.name === 'paint2' || m.name === 'dark')) { const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); B.union(g.boundingBox); }
    if (B.isEmpty()) B.set(new Vector3(-.9, 0, -2.2), new Vector3(.9, 1.4, 2.2));
    return B;
  };
  const engineAt = (v = V1) => {
    const b = bounds(), h = b.max.y - b.min.y;
    const P = root.points;
    if (kind === 'boat') { const m = root.parts.motor; if (m) return m.localToWorld(v.set(0, .35, .16)); if (P.exhaust) return P.exhaust.getWorldPosition(v); return shell.localToWorld(v.set(0, b.max.y * .5, b.max.z - 1.2)); }
    if (kind === 'helicopter') return P.smoke ? P.smoke.getWorldPosition(v) : shell.localToWorld(v.set(0, b.max.y * .85, (b.min.z + b.max.z) / 2 + .6));
    if (kind === 'bike') v.set(0, b.min.y + h * .38, (b.min.z + b.max.z) / 2);
    else if (kind === 'bus') v.set(0, b.min.y + h * .3, b.max.z - .9);
    else v.set(0, b.min.y + h * (kind === 'truck' ? .45 : .58), b.min.z + (kind === 'truck' ? .6 : (b.max.z - b.min.z) * .17));
    return shell.localToWorld(v);
  };
  const middle = (v = V1) => { const b = bounds(); return shell.localToWorld(v.set(0, b.min.y + (b.max.y - b.min.y) * .45, (b.min.z + b.max.z) / 2)); };
  const sceneOf = () => { let t = root; while (t.parent) t = t.parent; return t === root ? null : t; };
  const particles = () => { const sc = sceneOf(); return sc && typeof document !== 'undefined' ? new Particles3D(sc) : null; };   // (none off the page: tests)

  // ---------------------------------------------------------------- health, smoke and fire
  Object.defineProperty(root, 'health', { get: () => S.health, configurable: true });
  /** True once it has blown up (a burnt-out shell: no engine, no glass). */
  Object.defineProperty(root, 'wrecked', { get: () => S.blown, configurable: true });
  /** How much of its engine's pull is left, 0..1 (World3D.vehicle reads it): less as it smokes, none once it has blown up. */
  Object.defineProperty(root, 'engine', { get: () => S.blown ? 0 : S.health >= SMOKE ? 1 : .45 + S.health, configurable: true });
  /** A boat: how far it has gone down, 0..1 (blown up it sinks; badly holed it settles and lists; 1: under). gs.craft Boat reads it. */
  if (kind === 'boat') Object.defineProperty(root, 'sinking', { get: () => S.sink || 0, configurable: true });
  /** True while it is on fire (it blows up when its fuse runs out, unless put out). */
  Object.defineProperty(root, 'burning', { get: () => S.stage >= 3, configurable: true });
  /** Takes some of its health (1: new, 0: done for); what a hit does by itself, here for shots, fire and the game's own rules. */
  root.harm = (amount = .2) => {
    if (S.blown || !(amount > 0)) return root;
    S.health = max(0, S.health - amount / tough); stage();
    return root;
  };
  const stage = () => {
    const want = S.blown ? 4 : S.health <= FIRE ? 3 : S.health <= DARK ? 2 : S.health <= SMOKE ? 1 : 0;
    if (want === S.stage) return;
    const was = S.stage; S.stage = want;
    if (want >= 1 && was < 1) tell('smoke', { vehicle: root });
    if (want >= 3 && was < 3) { S.fuse = 5 + random() * 3; tell('fire', { vehicle: root }); }
    looks();
  };
  /** Puts out its fire (a fire engine's hose, a game's extinguisher): it smokes on, and needs another hit to catch again. */
  root.putOut = () => { if (S.blown || S.stage < 3) return root; S.health = FIRE + .02; S.fuse = 0; stage(); return root; };

  // the smoke and fire: their own particles (made the first time it smokes), following the engine
  let fx = null, smoke = null, fire = null, fire2 = null;
  const looks = () => {
    if (S.stage === 0) { smoke?.stop(); fire?.stop(); fire2?.stop(); smoke = fire = fire2 = null; return; }
    if (!fx) fx = particles(); if (!fx) return;
    const at = engineAt(), s = kind === 'bike' ? .6 : kind === 'car' ? 1 : 1.4;
    smoke?.stop(); smoke = null;
    const dark = S.stage >= 2, col = dark ? '#2b2926' : '#a19d96';
    smoke = fx.make(at, { loop: true, rate: (dark ? 16 : 9) * s, life: [1.6, 2.8], speed: [.5, 1.1], size: [.25 * s, (dark ? .75 : .5) * s], colors: [col, dark ? '#4a4744' : '#c9c6c0'], shape: 'cone', angle: .35, radius: .25 * s, up: true, glow: false, grow: true });
    if (S.stage >= 3 && !fire) fire = fx.fire(at, { size: .7 * s });
    if (S.stage >= 4 && !fire2) fire2 = fx.fire(middle(V2), { size: 1.3 * s });
  };
  const follow = () => {
    if (smoke || fire) { const at = engineAt(); smoke?.at(at); fire?.at(at); }
    if (fire2) fire2.at(middle(V2));
  };

  // ---------------------------------------------------------------- tyres
  /** Its tyres, by wheel (as root.wheels): { wheel, flat, i }. */
  const tyres = root.tyres = root.wheels.map((wheel, i) => ({ wheel, flat: false, i, y: wheel.position.y }));
  /** Bursts a tyre (a wheel's number, or the one nearest a point in the world): it goes flat and the wheel sits lower. */
  root.burst = (which = 0) => {
    const t = typeof which === 'number' ? tyres[which] : nearestTyre(which, Infinity); if (!t || t.flat) return root;
    t.flat = true; const m = t.wheel.children[0]; if (m) m.scale.set(1, .84, .84);
    t.wheel.position.y = t.y - t.wheel.radius * .16;   // (World3D.vehicle puts it where its now smaller wheel meets the road)
    if (!S.blown) sounds.boom?.(2.6);
    tell('burst', { vehicle: root, tyre: t });
    return root;
  };
  const nearestTyre = (p, reach) => {
    let best = null, bd = reach;
    for (const t of tyres) { if (t.flat) continue; t.wheel.getWorldPosition(V2); const d = V2.distanceTo(p) - t.wheel.radius; if (d < bd) { bd = d; best = t; } }
    return best;
  };

  // ---------------------------------------------------------------- doors and bumpers that come off
  const PARTS = ['doorL', 'doorR', 'backL', 'backR', 'bumperF', 'bumperR'].filter(n => root.parts[n]);
  const off = new Map();   // name -> { part, parent, at, q, body, v, w, lie, landed }
  const loose = new Set();
  const doorOf = name => root.doors?.find(d => d.name === name) || null;
  const centre = (part, v = V2) => { const m = part.children[0]; if (!m) return part.getWorldPosition(v); const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); return m.localToWorld(v.copy(g.boundingSphere.center)); };
  /** Knocks a door or bumper loose: a door hangs open and swings as it goes, a bumper droops at one end. */
  root.loosen = name => {
    const part = root.parts[name]; if (!part || loose.has(name) || off.has(name)) return root;
    loose.add(name);
    if (name.startsWith('bumper')) { const s = random() < .5 ? -1 : 1; part.rotation.z = s * .14; part.position.y -= .05; }
    return root;
  };
  /**
   * A door or bumper comes off: it goes into the world where it was, flung by push (metres a second, in the world; out
   * from the vehicle by default), and falls, tumbles and lies in the road: a body of its own in the game's World3D when
   * it has one. mend() puts it back.
   */
  root.detach = (name, { push = null } = {}) => {
    const part = root.parts[name], sc = sceneOf(); if (!part || off.has(name) || !sc) return root;
    const d = doorOf(name); if (d) d.gone = true;
    loose.delete(name);
    const rec = { part, parent: part.parent, at: part.position.clone(), q: part.quaternion.clone(), body: null, v: new Vector3(), w: new Vector3(), landed: false };
    off.set(name, rec);
    const from = middle(new Vector3()), c = centre(part, new Vector3());
    const v = push ? V1.set(push.x || 0, push.y || 0, push.z || 0) : V1.copy(c).sub(from).setY(0).normalize().multiplyScalar(2 + random() * 2).setY(1.5 + random() * 1.5);
    sc.attach(part);   // (where it was in the world, now its own)
    const world = linksOf(root)?.one('world');
    if (world?.hull) {
      try {
        rec.body = world.hull(part, { density: .35, sound: 'metal', tag: 'wreckage', vel: { x: v.x, y: v.y, z: v.z } });
        rec.body.twist((random() - .5) * 4, (random() - .5) * 3, (random() - .5) * 4);
      } catch (_) { rec.body = null; }   // (a world not ready yet: it falls by itself, below)
    }
    if (!rec.body) { rec.v.copy(v); rec.w.set((random() - .5) * 6, (random() - .5) * 4, (random() - .5) * 6); rec.ground = kind === 'helicopter' ? 0 : root.getWorldPosition(V2).y; }
    tell('off', { vehicle: root, name, part });
    return root;
  };
  // a part that fell off with no physics world: it falls, spins, and lies flat on the road where it lands
  const fall = dt => {
    for (const [name, r] of off) {
      if (r.body || r.landed) continue;
      const p = r.part; r.v.y -= 9.8 * dt; p.position.addScaledVector(r.v, dt);
      E1.set(r.w.x * dt, r.w.y * dt, r.w.z * dt); p.quaternion.multiply(Q1.setFromEuler(E1));
      if (p.position.y < r.ground + .25 && r.v.y < 0) {
        // lying: a door on its outer face (its own x across the road), a bumper on its back
        r.landed = true; p.updateMatrixWorld(); const yaw = Math.atan2(-p.matrixWorld.elements[8], -p.matrixWorld.elements[10]);
        p.quaternion.setFromEuler(E1.set(name.startsWith('bumper') ? -PI / 2 : 0, yaw, name.startsWith('bumper') ? 0 : (random() < .5 ? 1 : -1) * PI / 2, 'YXZ'));
        p.position.y = r.ground + (name.startsWith('bumper') ? .07 : .05);
      }
    }
  };
  // a loose door swings as the vehicle moves (and shuts or opens again only when told)
  let was = null; const swing = dt => {
    if (!loose.size || dt <= 0) return;
    root.getWorldPosition(V2); const speed = was ? V2.distanceTo(was) / dt : 0; (was ||= new Vector3()).copy(V2);
    for (const name of loose) { const d = doorOf(name); if (!d || d.gone) continue; d.want = clamp(.3 + .22 * sin(S.t * (2.5 + d.side) + d.side) * min(1, .3 + speed / 8), .05, .7); d.speed = 1.5; }
  };

  // ---------------------------------------------------------------- the blast
  /**
   * Blows it up now (it does by itself when its fire's fuse runs out): a fireball, its paint charred, its glass blown out,
   * most doors and bumpers thrown off, its tyres burnt flat, and a blast felt by what is round it (the World3D's bodies,
   * people who react, smoke, buildings that come apart and other vehicles, which may catch fire in turn). power: 1.
   */
  root.blow = ({ power = 1 } = {}) => {
    if (S.blown) return root;
    S.blown = true; S.health = 0; S.fuse = 0;
    const at = middle(new Vector3()), r = (kind === 'bike' ? 4 : kind === 'car' || kind === 'helicopter' ? 6 : 7.5) * power;
    if (!fx) fx = particles();
    fx?.boom(at, { size: (kind === 'bike' ? 1.3 : 2.2) * power });
    if (kind === 'helicopter' && root.parts.rotor) root.detach('rotor', { push: { x: (random() - .5) * 6, y: 5 + random() * 3, z: (random() - .5) * 6 } });   // (its rotor thrown off: it falls)
    sounds.boom?.(.55);
    // charred: its paint black and dull, sooty; its glass gone in a shower of bits; its lamps out
    for (const m of dmg.meshes(new Set(['paint', 'paint2', 'chrome', 'plates', 'plate', 'seat', 'liner']))) { dmg.own(m); const M = m.material; M.color?.set(m.name === 'chrome' ? '#33302c' : m.name === 'seat' || m.name === 'liner' ? '#141210' : m.name === 'plate' ? '#3a3631' : '#1f1c1a'); M.roughness = .95; M.metalness = m.name === 'chrome' ? .5 : .15; if ('clearcoat' in M) M.clearcoat = 0; if ('sheen' in M) M.sheen = 0; }
    for (const m of dmg.meshes('glass')) {
      if (!m.visible) continue; const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      const n = dmg.nearest([m], dmg.local(m.localToWorld(V2.copy(g.boundingSphere.center))).clone()); if (n) dmg.bits(n.sat, n.sn, 26, '#cfe2dd', 2.4);
      m.visible = false; hid.push(m);
    }
    for (const m of dmg.meshes(new Set(['lamp', 'tail']))) { dmg.own(m); m.material.emissiveIntensity = 0; m.material.color?.set('#222'); }
    for (const t of tyres) if (!t.flat) { t.flat = true; const w = t.wheel.children[0]; if (w) w.scale.set(1, .84, .84); t.wheel.position.y = t.y - t.wheel.radius * .16; }
    for (const name of PARTS) if (!off.has(name) && random() < (name.startsWith('bumper') ? .55 : .7)) {
      const c = centre(root.parts[name], new Vector3()), d = c.sub(at).setY(0).normalize();
      root.detach(name, { push: { x: d.x * (5 + random() * 4) * power, y: (4 + random() * 4) * power, z: d.z * (5 + random() * 4) * power } });
    }
    stage(); looks();
    // felt round it: the game's Explosives' own blast where it has one (bodies, people, smoke, buildings), else the world's and its people's
    const L = linksOf(root), push = r * 2.5, ex = L?.one('explosives');
    if (ex?.felt) ex.felt({ radius: r, damage: 80 * power, push, z: at.z }, at);
    else for (const p of L?.all('reactions') || []) p.blast?.(at, push, r * 1.5);
    const world = L?.one('world'); if (world?.blast) world.blast(at, r, push);
    if (!ex?.felt) for (const v of L?.all('vehicles') || []) if (v !== root && !v.wrecked && v.harm && v.parent) {   // (other vehicles near: dented on the side facing it and harmed, the nearest catching fire; Explosives' felt() does this too)
      const p = v.getWorldPosition(V2), d = hypot(p.x - at.x, p.z - at.z); if (d > r * 1.3) continue;
      const k = 1 - d / (r * 1.3), side = V1.set(at.x - p.x, 0, at.z - p.z).normalize().multiplyScalar(min(d, (v.size?.width || 1.8) / 2)).add(p).setY(p.y + .7);
      v.dent?.(side, { power: k * 1.4 }); v.harm(k * .9);
    }
    const e = { vehicle: root, at: { x: at.x, y: at.y, z: at.z }, radius: r, hurt: p => { const d = hypot(p.x - at.x, p.y - at.y, (p.z || 0) - at.z); return d >= r ? 0 : 1 - d / r; } };
    tell('blow', e);
    return root;
  };
  const hid = [];

  // ---------------------------------------------------------------- hits, update, mend
  const hit0 = root.hit;
  root.hit = (point, o = {}) => {
    const got = hit0(point, o), power = o.power ?? 1;
    if (!point) return got;
    const p = V1.set(point.x, point.y, point.z);
    // a tyre right there bursts on a sharp knock (a shot, a kerb taken too fast, a crash into its wheel)
    if (power >= .55) { const t = nearestTyre(p, .15); if (t) root.burst(t.i); }
    // a door or bumper hit hard: loose, and off the next time (or at once on a very hard one)
    if (power >= .85) for (const name of PARTS) {
      if (off.has(name)) continue;
      const c = centre(root.parts[name]), reach = name.startsWith('bumper') ? .8 : 1;
      if (c.distanceTo(p) > reach) continue;
      if (loose.has(name) || power >= 1.45) root.detach(name); else root.loosen(name);
    }
    root.harm(power * .16);
    return got;
  };
  const up = root.update;
  root.update = dt => {
    up?.(dt);
    if (!(dt > 0)) return root;
    S.t += dt;
    if (S.stage === 3 && !S.blown) { S.fuse -= dt; S.health = max(0, min(S.health, FIRE * clamp(S.fuse / 6, 0, 1))); if (S.fuse <= 0) root.blow(); }
    if (fire2 && S.blown && (S.burnt += dt) > 40) { fire2.stop(); fire2 = null; fire?.stop(); fire = null; }   // (a burnt-out shell smokes on)
    if (kind === 'boat') {   // a boat blown up goes down in a quarter of a minute; one badly holed settles low and lists, and no further
      const to = S.blown ? 1 : S.health < DARK ? .3 * (1 - S.health / DARK) : 0;
      if ((S.sink || 0) < to) S.sink = min(to, (S.sink || 0) + dt / (S.blown ? 14 : 30));
      if (S.sink > .55 && (fire || fire2 || smoke)) { fire?.stop(); fire2?.stop(); fire = fire2 = null; if (S.sink >= 1) { smoke?.stop(); smoke = null; } }   // (the water puts its fire out)
    }
    swing(dt); fall(dt); follow(); fx?.update(dt);
    return root;
  };
  const mend0 = root.mend;
  /** As good as new, crashes too: health back, fire out, tyres whole, its doors and bumpers back on. */
  root.mend = () => {
    for (const [name, r] of off) { if (r.body) { r.body.remove(); r.body = null; } r.parent.add(r.part); r.part.position.copy(r.at); r.part.quaternion.copy(r.q); const d = doorOf(name); if (d) { d.gone = false; d.open = d.want = 0; r.part.rotation.y = 0; } }
    off.clear();
    for (const name of loose) { const d = doorOf(name); if (d) d.want = 0; const p = root.parts[name]; if (name.startsWith('bumper')) { p.rotation.z = 0; p.position.y += .05; } }
    loose.clear();
    for (const t of tyres) { t.flat = false; const w = t.wheel.children[0]; if (w) w.scale.set(1, 1, 1); t.wheel.position.y = t.y; }
    for (const m of hid) m.visible = true; hid.length = 0;
    S.health = 1; S.blown = false; S.fuse = 0; S.burnt = 0; S.stage = 0; S.sink = 0;
    smoke?.remove(); fire?.remove(); fire2?.remove(); smoke = fire = fire2 = null; fx?.dispose(); fx = null;
    return mend0 ? mend0() : root;
  };
  return S;
}
