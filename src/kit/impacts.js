// What a shot does where it lands, and what a gun throws out as it fires, for a 3D game (Next Gen best, any 3D view):
// hits that look and sound of what was hit (sparks off metal, dust and chips off stone, splinters off wood, glints off
// glass, a spray of dirt or sand, a splash on water, a puff off cloth and people: no blood), a mark left on the
// surface, muzzle flashes that light the scene, and spent cases that fly out, bounce and tinkle. Kit use: games get
// this as gs.fx3d.Impacts.
//
//   const { Impacts } = gs.fx3d;
//   reset() { fx = new Impacts(view); }                          // (make it once in make(); fx.clear() in reset())
//   update(dt) {
//     for (const s of arms.fire(muzzle, dir, held)) {
//       fx.muzzle(muzzle, dir, { kind: arms.kind }); fx.shell(held.gun.points.eject, { kind: arms.kind });
//       const hit = world.ray(s.from, s.dir, s.range);
//       if (hit) fx.hit(hit, { from: s.from });                   // a World3D ray hit: what it is made of is read from its mesh
//     }
//     fx.update(dt);
//   }
//
// What was hit is read from the mesh (gs.sound.Foley's reading: userData.sound, gs.models materials by their recipes, other
// materials by their names), or say so: fx.hit(hit, { surface: 'metal' }). Surfaces: metal, stone, wood, glass, dirt,
// grass, gravel, sand, snow, mud, water, ice, cloth, body, plastic, rubber, leaves, carpet.
import { InstancedMesh, CylinderGeometry, MeshStandardMaterial, Object3D, Vector3, Quaternion, Euler, Matrix4, DynamicDrawUsage } from 'three';
import { Particles3D } from './particles3d.js';
import { Foley } from './foley.js';
import { noise, tone } from './sound.js';
import { linksFor } from './links.js';

// how each surface answers a hit: bits (particles: colours, how many, how fast, glow), dust (a soft puff), mark (the
// decal's look), sound ([noise from Hz, to Hz, length, volume] and a ping's Hz), flash (a spark's light)
const LOOK = {
  metal: { bits: ['#fff0b0', '#ff8020', 14, 6, true], dust: null, mark: 'metal', sound: [7000, 2500, .06, .05, 3200], light: '#ffd890' },
  stone: { bits: ['#8a8378', '#5e584f', 10, 4, false], dust: '#b3aa9c', mark: 'stone', sound: [5000, 900, .08, .06, 0] },
  wood: { bits: ['#a87a4a', '#6e4a28', 9, 3.5, false], dust: '#9c8466', mark: 'wood', sound: [2500, 500, .09, .07, 0] },
  glass: { bits: ['#e8f4ff', '#a0c8e8', 14, 3, true], dust: null, mark: 'glass', sound: [9000, 5000, .12, .04, 4200] },
  dirt: { bits: ['#5c4630', '#3a2c1e', 10, 3.5, false], dust: '#7a6448', mark: null, sound: [1400, 300, .1, .06, 0] },
  sand: { bits: ['#cdb88a', '#a8935f', 12, 3, false], dust: '#d6c49a', mark: null, sound: [2200, 600, .1, .05, 0] },
  snow: { bits: ['#ffffff', '#dfe8f0', 12, 2.5, false], dust: '#f4f8fc', mark: null, sound: [1800, 500, .1, .04, 0] },
  water: { bits: ['#e8f4ff', '#9fc3d8', 16, 4, false], dust: '#d8eaf4', mark: null, sound: [3000, 400, .18, .05, 0], up: true },
  cloth: { bits: ['#d8d0c4', '#a8a090', 5, 1.5, false], dust: '#c8c0b4', mark: null, sound: [900, 300, .06, .05, 0] },
  body: { bits: ['#f0ece6', '#c8c0b4', 6, 1.6, false], dust: '#e6e0d8', mark: null, sound: [700, 200, .07, .06, 0] },
  plastic: { bits: ['#c8c8c8', '#888888', 8, 3, false], dust: null, mark: 'stone', sound: [3500, 1200, .05, .05, 0] },
};
const SAME = { grass: 'dirt', gravel: 'stone', mud: 'dirt', ice: 'glass', rubber: 'plastic', leaves: 'dirt', carpet: 'cloth' };
// the marks, painted once each on a little canvas (a picture each: few, so the WebGPU grid keeps them all)
const MARKS = {
  metal: { size: .045, paint(c, s) { const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(10,10,10,1)'); g.addColorStop(.35, 'rgba(40,38,36,.95)'); g.addColorStop(.5, 'rgba(190,185,175,.7)'); g.addColorStop(1, 'rgba(120,115,110,0)'); c.fillStyle = g; c.fillRect(0, 0, s, s); } },
  stone: { size: .09, paint(c, s) {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(15,13,11,1)'); g.addColorStop(.22, 'rgba(40,36,32,.95)'); g.addColorStop(.45, 'rgba(150,140,128,.55)'); g.addColorStop(1, 'rgba(150,140,128,0)'); c.fillStyle = g; c.fillRect(0, 0, s, s);
    c.strokeStyle = 'rgba(30,26,22,.6)'; c.lineWidth = s / 64; for (let i = 0; i < 6; i++) { const a = i * 1.05 + .3; c.beginPath(); c.moveTo(s / 2 + Math.cos(a) * s * .12, s / 2 + Math.sin(a) * s * .12); c.lineTo(s / 2 + Math.cos(a + .2) * s * .38, s / 2 + Math.sin(a + .2) * s * .38); c.stroke(); }
  } },
  wood: { size: .08, paint(c, s) { const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(12,8,4,1)'); g.addColorStop(.25, 'rgba(50,32,18,.9)'); g.addColorStop(.5, 'rgba(200,160,110,.5)'); g.addColorStop(1, 'rgba(200,160,110,0)'); c.fillStyle = g; c.save(); c.translate(s / 2, s / 2); c.scale(1, .6); c.translate(-s / 2, -s / 2); c.fillRect(0, 0, s, s); c.restore(); } },
  glass: { size: .16, paint(c, s) {
    c.strokeStyle = 'rgba(240,248,255,.85)'; c.lineWidth = s / 128;
    for (let i = 0; i < 9; i++) { const a = i * .7 + (i % 3) * .2; c.beginPath(); c.moveTo(s / 2, s / 2); let x = s / 2, y = s / 2; for (let k = 1; k <= 4; k++) { x += Math.cos(a + (k % 2 ? .1 : -.1)) * s * .11; y += Math.sin(a + (k % 2 ? .1 : -.1)) * s * .11; c.lineTo(x, y); } c.stroke(); }
    for (const r of [.12, .22]) { c.beginPath(); c.arc(s / 2, s / 2, s * r, 0, 6.3); c.stroke(); }
    c.fillStyle = 'rgba(20,24,28,.9)'; c.beginPath(); c.arc(s / 2, s / 2, s * .03, 0, 6.3); c.fill();
  } },
};
// the cases guns throw: radius, length, colour, how far they fly
const CASES = { small: [.0045, .019, '#c49a3c', 1], rifle: [.005, .045, '#c49a3c', 1.2], shell: [.0105, .065, '#a8322a', .8] };
const FLASH = { pistol: [1, '#ffcf80'], revolver: [1.3, '#ffc070'], smg: [.8, '#ffd090'], shotgun: [1.6, '#ffb860'], rifle: [1.2, '#ffd080'], sniper: [1.6, '#ffc880'], launcher: [2.2, '#ffa040'] };

const _v = new Vector3(), _n = new Vector3(), _q = new Quaternion(), _m = new Matrix4(), _e = new Euler(), _s = new Vector3(1, 1, 1);
let ears = null, earsAt = -1;
const sound = (at, len, o) => { const now = Date.now(); if (now - earsAt > 500) { earsAt = now; ears = linksFor(null, true)?.one('ears') || null; } if (ears) ears.noise(len, at, o); else noise(len, o); };
const ping = (at, f, o) => { if (ears) ears.tone(f, at, o); else tone(f, o); };

/**
 * Hits, muzzle flashes and spent cases for one view (a gs.hd HDView best: its flashes light the scene and its decals
 * mark what was hit; any 3D view with a scene works). particles: a gs.fx3d Particles3D to share (one is made);
 * marks: false for no marks; holes: the most marks left at once (60: the oldest go); sounds: false for none; cases: the
 * most spent cases lying about at once (60).
 */
export class Impacts {
  constructor(view, { particles = null, marks = true, sounds = true, cases = 60, holes = 60, link = true } = {}) {
    this.view = view; this.marks = marks && !!view?.decal; this.holes = []; this.most = holes; this.sounds = sounds; this.max = cases;
    this.fx = particles || new Particles3D(view.scene || view); this.own = !particles;
    this.links = linksFor(view, link);
    this.cases = []; this.meshes = {};
    for (const k in CASES) {
      const [r, l, col] = CASES[k], g = new CylinderGeometry(r, r, l, 8); g.rotateX(Math.PI / 2);
      const m = new InstancedMesh(g, new MeshStandardMaterial({ color: col, metalness: k === 'shell' ? .1 : .9, roughness: k === 'shell' ? .5 : .3 }), cases);
      m.instanceMatrix.setUsage(DynamicDrawUsage); m.count = 0; m.castShadow = true; m.frustumCulled = false; m.name = 'cases:' + k;
      (view.scene || view).add(m); this.meshes[k] = m;
    }
  }
  /** What a mesh is made of, as a hit reads it ('metal', 'stone'...; 'stone' if nothing says). */
  surfaceOf(mesh) { const m = Foley.materialOf(mesh); return m || 'stone'; }
  /**
   * A shot landing: hit is a gs.physics3d World3D ray's hit ({ point, normal, mesh }) or { point, normal, mesh };
   * o: surface (else read from the mesh), power (1: a rifle round; a shotgun pellet .4, a bat 1.5), from (where the
   * shot came from: bits fly back a little towards it), mark (false: none here), sound (false: none). Returns the surface.
   */
  hit(hit, { surface = null, power = 1, from = null, mark = true, sound: snd = true } = {}) {
    const p = hit.point, nrm = hit.normal || { x: 0, y: 1, z: 0 };
    let s = surface || this.surfaceOf(hit.mesh || hit.thing?.mesh || null); const L = LOOK[SAME[s] || s] || LOOK.stone; s = SAME[s] || s;
    _n.set(nrm.x, nrm.y, nrm.z).normalize();
    // bits fly off along the normal, leaning back towards the shooter a little
    if (from) { _v.set(from.x - p.x, from.y - p.y, from.z - p.z).normalize(); _n.addScaledVector(_v, .35).normalize(); }
    const at = { x: p.x + nrm.x * .02, y: p.y + nrm.y * .02, z: p.z + nrm.z * .02 }, dir = L.up ? { x: 0, y: 1, z: 0 } : { x: _n.x, y: _n.y, z: _n.z };
    const [c0, c1, count, speed, glow] = L.bits, k = Math.max(.3, Math.min(2.5, power));
    this.fx.make(at, { burst: Math.round(count * k), life: glow ? [.1, .3] : [.3, .7], speed: [speed * .4 * k, speed * k], size: glow ? [.012, .03] : [.015, .04], colors: [c0, c1], shape: 'cone', angle: L.up ? .35 : .7, radius: .01, dir, gravity: -9.8, glow, shrink: !!glow });
    if (L.dust) this.fx.make(at, { burst: Math.round(5 * k), life: [.5, 1.1], speed: [.3, 1.1 * k], size: [.06 * k, .16 * k], colors: [L.dust, L.dust], shape: 'cone', angle: .8, radius: .02, dir, gravity: L.up ? -3 : .1, glow: false, grow: true });
    if (L.light) this.fx.flash(at, { col: L.light, i: 2.5 * k, reach: 1.5, life: .06 });
    if (s === 'water') for (const w of this.links?.all('water') || []) if (w.rip && Math.abs(w.height(p.x, p.z) - p.y) < .5) { w.splash(p.x, p.z, { size: .12 * k, speed: 2 + k }); break; }
    if (mark && this.marks && L.mark && hit.mesh && !hit.mesh.isSkinnedMesh) {
      const M = MARKS[L.mark], d = this.view.decal(hit.mesh, new Vector3(p.x, p.y, p.z), new Vector3(nrm.x, nrm.y, nrm.z), { size: M.size * Math.sqrt(k), paint: M.paint, key: 'impact:' + L.mark, max: 1000, rough: .8 });
      if (d) { this.holes.push(d); if (this.holes.length > this.most) this.holes.shift().dispose(); }   // (its own oldest go: the game's other marks stay)
    }
    if (snd && this.sounds) {
      const [f0, f1, len, vol, hz] = L.sound;
      sound(p, len, { vol: vol * Math.min(1.5, k), from: f0 * (.9 + Math.random() * .2), to: f1 });
      if (hz) ping(p, hz * (.85 + Math.random() * .3), { len: .08, wave: 'sine', vol: .02, slide: -hz * .1 });
    }
    return s;
  }
  /** A gun's muzzle flash at `at` pointing along dir: a burst of light (in a Next Gen view) and a quick cone of fire and a wisp of smoke. kind: the weapon (its size), or size. */
  muzzle(at, dir, { kind = 'rifle', size = FLASH[kind]?.[0] ?? 1 } = {}) {
    const col = FLASH[kind]?.[1] || '#ffd080', d = { x: dir.x, y: dir.y, z: dir.z };
    this.fx.flash(at, { col, i: 12 * size, reach: 4 * size, life: .05 });
    this.fx.make(at, { burst: Math.round(8 * size), life: [.03, .06], speed: [2 * size, 6 * size], size: [.05 * size, .12 * size], colors: ['#fff4d0', col], shape: 'cone', angle: .25, radius: .005, dir: d });
    this.fx.make(at, { burst: Math.round(3 * size), life: [.5, 1], speed: [.2, .8], size: [.05 * size, .12 * size], colors: ['#b8b4ae', '#9a968f'], shape: 'cone', angle: .5, radius: .01, dir: d, gravity: .3, glow: false, grow: true });
    return this;
  }
  /**
   * A spent case thrown out of a gun: at its eject point (an Object3D, a weapon's points.eject, or a point with right:
   * the gun's right side), kind 'small' | 'rifle' | 'shell' or the weapon's ('pistol', 'shotgun'...: what ARSENAL says
   * it throws; none for a revolver or launcher). It flies out to the right, bounces on what is under it (the game's
   * World3D, else the ground at y = 0) with a tinkle, and lies there until there are too many.
   */
  shell(eject, { kind = 'small', right = null, speed = 1 } = {}) {
    const k = CASES[kind] ? kind : { pistol: 'small', smg: 'small', rifle: 'rifle', sniper: 'rifle', shotgun: 'shell' }[kind]; if (!k) return null;
    const p = new Vector3(), r = new Vector3(1, 0, 0);
    if (eject?.isObject3D) { eject.getWorldPosition(p); eject.getWorldQuaternion(_q); r.applyQuaternion(_q); } else { p.set(eject.x, eject.y, eject.z); if (right) r.set(right.x, right.y, right.z).normalize(); }
    const f = CASES[k][3] * speed, c = { k, p, v: r.multiplyScalar(2.2 * f).add(new Vector3((Math.random() - .5) * .6, 1.6 * f + Math.random() * .5, (Math.random() - .5) * .6)),
      q: new Quaternion().setFromEuler(_e.set(Math.random() * 6, Math.random() * 6, 0)), spin: new Vector3((Math.random() - .5) * 40, (Math.random() - .5) * 40, (Math.random() - .5) * 20), still: false, bounces: 0 };
    this.cases.push(c); if (this.cases.length > this.max) this.cases.shift();
    return c;
  }
  update(dt) {
    if (this.own) this.fx.update(dt);
    const W = this.links?.one('world');
    for (const c of this.cases) {
      if (c.still) continue;
      c.v.y -= 9.8 * dt; c.p.addScaledVector(c.v, dt);
      _q.setFromEuler(_e.set(c.spin.x * dt, c.spin.y * dt, c.spin.z * dt)); c.q.multiply(_q);
      const g = W ? W.floorAt(c.p.x, c.p.y + .05, c.p.z, .3) ?? -1e9 : 0, r = CASES[c.k][0];
      if (c.p.y - r < g && c.v.y < 0) {
        c.p.y = g + r; c.bounces++;
        if (this.sounds && c.v.y < -1) ping(c.p, (c.k === 'shell' ? 900 : 2800) * (.8 + Math.random() * .4), { len: c.k === 'shell' ? .05 : .09, wave: c.k === 'shell' ? 'triangle' : 'sine', vol: Math.min(.03, -c.v.y * .006) });
        c.v.y *= -.35; c.v.x *= .5; c.v.z *= .5; c.spin.multiplyScalar(.5);
        if (Math.abs(c.v.y) < .5 || c.bounces > 4) { c.still = true; c.v.set(0, 0, 0); c.q.setFromEuler(_e.set(0, Math.random() * 6.28, 0)); }   // (lying on its side)
      }
    }
    for (const k in this.meshes) this.meshes[k].count = 0;
    for (const c of this.cases) { const m = this.meshes[c.k]; m.setMatrixAt(m.count++, _m.compose(c.p, c.q, _s)); }
    for (const k in this.meshes) { const m = this.meshes[k]; if (m.count) m.instanceMatrix.needsUpdate = true; }
    return this;
  }
  /** Takes away the cases lying about and the particles (each round). */
  clear() { this.cases = []; for (const d of this.holes) d.dispose(); this.holes = []; for (const k in this.meshes) this.meshes[k].count = 0; if (this.own) this.fx.clear(); return this; }
  dispose() { this.clear(); for (const k in this.meshes) { const m = this.meshes[k]; m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); } if (this.own) this.fx.dispose(); }
}
