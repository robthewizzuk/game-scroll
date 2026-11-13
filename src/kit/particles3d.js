// 3D particle effects (fire, smoke, sparks, explosions, magic, snow) for any 3D view, on WebGL and
// WebGPU alike. The particles move here, and are drawn as soft dots that face the camera in two
// meshes (glowing ones and soft ones) with three.js's own plain material, so there is no shader of
// their own to port and no library to load. Kit use: games get this as gs.fx3d.Particles3D.
import { timed } from './prof.js';
import { Mesh, BufferGeometry, BufferAttribute, DynamicDrawUsage, MeshBasicMaterial, CanvasTexture, AdditiveBlending, NormalBlending, Color, Vector3 } from 'three';

let dot = null;
function dotTexture() {
  if (dot) return dot;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d', { willReadFrequently: true }), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);   // (painted in memory: hd3d.js surface())
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.4, 'rgba(255,255,255,.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return dot = new CanvasTexture(c);
}
const K = new Color();
const rgb = c => { K.set(c); return [K.r, K.g, K.b]; };
const pair = v => Array.isArray(v) ? v : [v, v];
// the same dice every time for a seed (mulberry32): a replay or a test gets the same particles
const seeded = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const MAX = 16384;   // dots in one mesh at most
const STRIDE = 19;   // numbers kept per particle: place 3, speed 3, age, life, size, end size, red, green and blue (start, end), fade, gravity, its effect

// one mesh of dots: additive (glow) or plain (smoke, snow)
class Dots {
  constructor(scene, additive) {
    this.additive = additive; this.cap = 0; this.n = 0; this.P = new Float32Array(0);
    this.mat = new MeshBasicMaterial({ map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending });
    this.mesh = new Mesh(new BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.userData.gsNoInk = true;
    // the camera this mesh was last drawn with: the dots face it
    this.right = new Vector3(1, 0, 0); this.up = new Vector3(0, 1, 0);
    // (not a cube camera's, which a light probe or a room's reflections bake with)
    this.mesh.onBeforeRender = (r, s, cam) => { if (cam.parent?.type === 'CubeCamera') return; const e = cam.matrixWorld.elements; this.right.set(e[0], e[1], e[2]).normalize(); this.up.set(e[4], e[5], e[6]).normalize(); };
    this.grow(256); scene.add(this.mesh);
  }
  grow(cap) {
    cap = Math.min(MAX, cap); if (cap <= this.cap) return false;
    const P = new Float32Array(cap * STRIDE); P.set(this.P); this.P = P;
    const g = new BufferGeometry(), uv = new Float32Array(cap * 8), idx = cap * 4 > 65535 ? new Uint32Array(cap * 6) : new Uint16Array(cap * 6);
    for (let i = 0; i < cap; i++) { uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8); idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); }
    const pos = new BufferAttribute(new Float32Array(cap * 12), 3), col = new BufferAttribute(new Float32Array(cap * 16), 4);
    pos.setUsage(DynamicDrawUsage); col.setUsage(DynamicDrawUsage);
    g.setAttribute('position', pos); g.setAttribute('uv', new BufferAttribute(uv, 2)); g.setAttribute('color', col); g.setIndex(new BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    this.mesh.geometry.dispose(); this.mesh.geometry = g; this.cap = cap;
    return true;
  }
  /** Room for one more particle: its place in P, or -1 when the mesh is full. */
  slot() {
    if (this.n >= this.cap && !this.grow(this.cap * 2)) return -1;
    return this.n++ * STRIDE;
  }
  step(dt) {
    const P = this.P, g = this.mesh.geometry, pos = g.attributes.position.array, col = g.attributes.color.array;
    const rx = this.right.x, ry = this.right.y, rz = this.right.z, ux = this.up.x, uy = this.up.y, uz = this.up.z, add = this.additive;
    let n = 0;
    for (let i = 0; i < this.n; i++) {
      const j = i * STRIDE, age = P[j + 6] + dt, life = P[j + 7];
      if (age >= life) continue;
      const o = n * STRIDE; if (o !== j) P.copyWithin(o, j, j + STRIDE);
      P[o + 6] = age; P[o + 4] += P[o + 17] * dt;   // gravity on the speed up or down
      const x = P[o] += P[o + 3] * dt, y = P[o + 1] += P[o + 4] * dt, z = P[o + 2] += P[o + 5] * dt;
      const f = age / life, u = 1 - f, end = P[o + 9];
      // size over the particle's life: a soft curve from its start size to end times it (0 shrinks away, 2 grows)
      const hs = P[o + 8] * .5 * (end === 1 ? 1 : u * u * u + 3 * u * u * f * .9 + 3 * u * f * f * .5 + f * f * f * end);
      const a = P[o + 16] ? u : 1, k = add ? a : 1;   // glowing dots fade by getting darker
      const r = (P[o + 10] + (P[o + 11] - P[o + 10]) * f) * k, gg = (P[o + 12] + (P[o + 13] - P[o + 12]) * f) * k, b = (P[o + 14] + (P[o + 15] - P[o + 14]) * f) * k;
      const v = n * 12, ax = rx * hs, ay = ry * hs, az = rz * hs, bx = ux * hs, by = uy * hs, bz = uz * hs;
      pos[v] = x - ax - bx; pos[v + 1] = y - ay - by; pos[v + 2] = z - az - bz;
      pos[v + 3] = x + ax - bx; pos[v + 4] = y + ay - by; pos[v + 5] = z + az - bz;
      pos[v + 6] = x + ax + bx; pos[v + 7] = y + ay + by; pos[v + 8] = z + az + bz;
      pos[v + 9] = x - ax + bx; pos[v + 10] = y - ay + by; pos[v + 11] = z - az + bz;
      const c = n * 16, al = add ? 1 : a;
      for (let q = 0; q < 16; q += 4) { col[c + q] = r; col[c + q + 1] = gg; col[c + q + 2] = b; col[c + q + 3] = al; }
      n++;
    }
    this.n = n; g.setDrawRange(0, n * 6);
    for (const [at, per] of [[g.attributes.position, 12], [g.attributes.color, 16]]) { at.clearUpdateRanges(); at.addUpdateRange(0, Math.max(per, n * per)); at.needsUpdate = true; }
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

/**
 * Particle effects for one scene: new Particles3D(view.scene), then update(dt) every frame. Each
 * effect returns { at(pos), stop(), remove() }: move it, stop it making new particles (the ones
 * flying finish), or take it away at once. { seed: 7 } gives the same particles every time.
 */
export class Particles3D {
  constructor(scene, { seed = null } = {}) {
    this.scene = scene; this.live = new Set(); this.ids = 0; this.rnd = seed == null ? Math.random : seeded(seed | 0);
    this.glow = new Dots(scene, true); this.soft = new Dots(scene, false);
  }
  /**
   * Your own effect. o: life [min, max] seconds, speed [min, max], size [min, max] (a dot's width),
   * colors [from, to], rate (per second, 0 for a burst only), burst (count at the start), loop,
   * duration (seconds it makes particles for when it doesn't loop), shape: 'point' | 'sphere' | 'cone'
   * (radius, angle), up (a cone points up; else along z), gravity (units/s², negative falls), glow
   * (false: soft dots like smoke; else they glow), shrink (false to keep their size), grow (they
   * double in size), fade (false to stay solid).
   */
  make(pos, o = {}) {
    const fx = {
      pos: new Vector3(pos?.x || 0, pos?.y || 0, pos?.z || 0), on: true, t: 0, acc: 0, burst: o.burst || 0, loop: o.loop ?? false, duration: o.duration ?? 1, rate: o.rate ?? 0,
      life: pair(o.life ?? [.4, .8]), speed: pair(o.speed ?? [1, 3]), size: pair(o.size ?? [.1, .3]),
      c0: rgb((o.colors || ['#ffffff'])[0]), c1: rgb((o.colors || ['#ffffff', '#ffffff'])[1] ?? (o.colors || ['#ffffff'])[0]),
      shape: o.shape === 'cone' ? 2 : o.shape === 'point' ? 0 : 1, radius: o.radius ?? .1, angle: o.angle ?? .4, up: !!o.up,
      gravity: o.gravity || 0, end: o.shrink === false ? 1 : o.grow ? 2 : 0, fade: o.fade === false ? 0 : 1, dots: o.glow === false ? this.soft : this.glow,
      id: ++this.ids, at: p => { fx.pos.set(p.x, p.y, p.z); return fx; }, stop: () => { fx.on = false; return fx; },
      remove: () => { fx.on = false; this.live.delete(fx); const D = fx.dots, P = D.P; for (let i = 0; i < D.n; i++) if (P[i * STRIDE + 18] === fx.id) P[i * STRIDE + 6] = P[i * STRIDE + 7]; },
    };
    this.live.add(fx);
    return fx;
  }
  spawn(fx) {
    const D = fx.dots, j = D.slot(); if (j < 0) return;
    const P = D.P, R = this.rnd;
    // where it starts and which way it goes
    let dx, dy, dz, px = 0, py = 0, pz = 0;
    if (fx.shape === 2) {   // a cone: from a disc, spreading out by up to the angle
      const a = R() * 6.2831853, rr = Math.sqrt(R()) * fx.radius, th = R() * fx.angle, ph = R() * 6.2831853, s = Math.sin(th);
      const cx = Math.cos(a) * rr, cy = Math.sin(a) * rr, vx = s * Math.cos(ph), vy = s * Math.sin(ph), vz = Math.cos(th);
      if (fx.up) { px = cx; pz = -cy; dx = vx; dy = vz; dz = -vy; } else { px = cx; py = cy; dx = vx; dy = vy; dz = vz; }
    } else {
      const u = R() * 2 - 1, a = R() * 6.2831853, q = Math.sqrt(Math.max(0, 1 - u * u)); dx = q * Math.cos(a); dy = u; dz = q * Math.sin(a);
      if (fx.shape === 1) { const rr = Math.cbrt(R()) * fx.radius; px = dx * rr; py = dy * rr; pz = dz * rr; }   // a ball: starts anywhere in it, flying outwards
    }
    const sp = fx.speed[0] + (fx.speed[1] - fx.speed[0]) * R();
    P[j] = fx.pos.x + px; P[j + 1] = fx.pos.y + py; P[j + 2] = fx.pos.z + pz;
    P[j + 3] = dx * sp; P[j + 4] = dy * sp; P[j + 5] = dz * sp;
    P[j + 6] = 0; P[j + 7] = fx.life[0] + (fx.life[1] - fx.life[0]) * R();
    P[j + 8] = fx.size[0] + (fx.size[1] - fx.size[0]) * R(); P[j + 9] = fx.end;
    P[j + 10] = fx.c0[0]; P[j + 11] = fx.c1[0]; P[j + 12] = fx.c0[1]; P[j + 13] = fx.c1[1]; P[j + 14] = fx.c0[2]; P[j + 15] = fx.c1[2];
    P[j + 16] = fx.fade; P[j + 17] = fx.gravity; P[j + 18] = fx.id;
  }
  /** A burning flame that keeps going (torches, campfires, rockets). */
  fire(pos, { size = 1, color = '#ffb020', end = '#ff2000' } = {}) { return this.make(pos, { loop: true, rate: 40 * size, life: [.4, .8], speed: [.6 * size, 1.4 * size], size: [.25 * size, .5 * size], colors: [color, end], shape: 'cone', angle: .25, radius: .15 * size, up: true }); }
  /** Rising smoke (keeps going). */
  smoke(pos, { size = 1, color = '#777777' } = {}) { return this.make(pos, { loop: true, rate: 12 * size, life: [1.5, 2.5], speed: [.3, .7], size: [.4 * size, .8 * size], colors: [color, color], shape: 'cone', angle: .3, up: true, glow: false, grow: true }); }
  /** A quick shower of sparks. */
  sparks(pos, { color = '#ffe080', count = 30, power = 1 } = {}) { return this.make(pos, { burst: count, life: [.2, .5], speed: [3 * power, 7 * power], size: [.04, .1], colors: [color, '#ff6000'], gravity: -6 }); }
  /** An explosion: a flash of fire, a puff of smoke and a shower of sparks. */
  boom(pos, { size = 1 } = {}) {
    this.make(pos, { burst: 40, life: [.3, .7], speed: [2 * size, 6 * size], size: [.3 * size, .7 * size], colors: ['#fff2a0', '#ff3000'] });
    this.make(pos, { burst: 15, life: [.8, 1.5], speed: [.5, 1.5 * size], size: [.5 * size, 1 * size], colors: ['#555555', '#222222'], glow: false, grow: true });
    return this.sparks(pos, { count: 20, power: size });
  }
  /** Twinkly magic (keeps going): pickups, portals, spells. */
  magic(pos, { color = '#a070ff', end = '#40e0ff' } = {}) { return this.make(pos, { loop: true, rate: 25, life: [.6, 1.2], speed: [.2, .6], size: [.05, .15], colors: [color, end], radius: .4, gravity: .5 }); }
  /** Falling snow over an area round pos (keeps going). */
  snow(pos, { area = 10, rate = 60 } = {}) { return this.make(pos, { loop: true, rate, life: [3, 5], speed: [0, .2], size: [.04, .1], colors: ['#ffffff', '#ffffff'], radius: area / 2, gravity: -.8, glow: false, shrink: false, fade: false }); }
  /** How many particles are flying now. */
  get count() { return this.glow.n + this.soft.n; }
  update(dt) {
    dt = Math.min(dt, .1); if (!(dt > 0)) return;
    for (const fx of this.live) {
      if (fx.on) {
        for (; fx.burst > 0; fx.burst--) this.spawn(fx);
        fx.acc += fx.rate * dt; while (fx.acc >= 1) { fx.acc--; this.spawn(fx); }
        fx.t += dt; if (!fx.loop && fx.t >= fx.duration) fx.on = false;
      } else this.live.delete(fx);   // (its particles fly on: they belong to the dots)
    }
    this.glow.step(dt); this.soft.step(dt);
  }
  /** Takes every effect and particle away. */
  clear() { for (const fx of this.live) fx.on = false; this.live.clear(); this.glow.n = this.soft.n = 0; this.glow.step(0); this.soft.step(0); }
  dispose() { this.clear(); this.glow.dispose(); this.soft.dispose(); }
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(Particles3D.prototype, 'update', 'particles 3D');
