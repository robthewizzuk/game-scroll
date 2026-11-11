// Poses for 3D characters made in code: a jointed figure (or your own parts hooked up as joints), a
// library of poses (idle, walk, run, sprint, crouch, aim, jump, fall, land, hang, shimmy, climb,
// swing, cover, punch, takedown, downed, wave, sit...) and smooth blending between them, with an
// upper-body layer so a hero can aim while running. Walk and run cycles follow how far the
// character really moved, so feet don't slide. Your game picks the pose each frame.
//
//   const { Rig, figure } = gs.poses;
//   reset() {
//     hero = figure({ body: '#3a6ea5', skin: '#f1c27d', legs: '#2b2b38', mat: c => toon(c) });   // a Group with .rig
//     view.add(hero);
//   }
//   update(dt) {
//     hero.rig.play(onGround ? (speed > 4 ? 'run' : speed > .2 ? 'walk' : 'idle') : vy > 0 ? 'jump' : 'fall');
//     hero.rig.upper(aiming ? 'aim' : null);                    // arms and chest only, over the legs
//     hero.rig.update(dt, { speed, aim: pitch });              // speed: metres a second (drives the steps)
//   }
//   Blend spaces (blend trees): rig.blend({ idle: 0, walk: 1.4, run: 4, sprint: 7 }, speed) mixes the two
//   poses either side of the value, every cycle in step; rig.blend2({ idle: [0, 0], walk: [0, 1], back: [0, -1],
//   strafeL: [-1, 0], strafeR: [1, 0] }, x, y) mixes by a 2D value (strafing). play() goes back to one pose.
//   Feet on uneven ground (foot IK): rig.plant((x, z) => groundHeight, character) after rig.update().
//   A smooth skinned person with a face and lip sync: person() (src/kit/skin.js), the same Rig.
//   Your own model: new Rig({ hips, spine, head, armL, foreL, armR, foreR, legL, shinL, legR, shinR }) with
//   each part a Group whose origin is its joint (shoulder, elbow, hip, knee...), arms and legs hanging down.
//
// The figure faces +z (the way Object3D.lookAt turns things). Angles are radians.

import { BoxGeometry, CapsuleGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { reach } from './characters.js';
export { person, Face, shapes, visemes, FACE_SHAPES } from './skin.js';

const JOINTS = ['hips', 'spine', 'head', 'armL', 'foreL', 'armR', 'foreR', 'legL', 'shinL', 'legR', 'shinR'];
const UPPER = new Set(['spine', 'head', 'armL', 'foreL', 'armR', 'foreR']);
const S = Math.sin, TAU = Math.PI * 2;

// A pose: { joint: [rx, ry, rz] } plus drop (hips lower, in body heights). Forward swing of an arm or
// leg is negative x; knees bend positive x; elbows bend negative x.
const P = (o, drop = 0) => ({ j: o, drop });
const cyc = (fn, rate) => ({ cycle: fn, rate });   // rate: cycles per metre
export const POSES = {
  idle: cyc(p => P({ spine: [.03 + S(p * TAU) * .015, 0, 0], armL: [0, 0, -.08], armR: [0, 0, .08], foreL: [-.15, 0, 0], foreR: [-.15, 0, 0] }), 0),
  walk: cyc(p => { const s = S(p * TAU); return P({ spine: [.05, 0, 0], legL: [-.45 * s, 0, 0], legR: [.45 * s, 0, 0], shinL: [Math.max(0, .7 * S(p * TAU + 1.2)), 0, 0], shinR: [Math.max(0, -.7 * S(p * TAU + 1.2)), 0, 0], armL: [.4 * s, 0, -.06], armR: [-.4 * s, 0, .06], foreL: [-.3, 0, 0], foreR: [-.3, 0, 0] }, .015 * Math.abs(S(p * TAU * 2))); }, .55),
  run: cyc(p => { const s = S(p * TAU); return P({ spine: [.22, 0, 0], head: [-.12, 0, 0], legL: [-.9 * s - .1, 0, 0], legR: [.9 * s - .1, 0, 0], shinL: [.3 + Math.max(0, 1.3 * S(p * TAU + 1.4)), 0, 0], shinR: [.3 + Math.max(0, -1.3 * S(p * TAU + 1.4)), 0, 0], armL: [.8 * s, 0, -.1], armR: [-.8 * s, 0, .1], foreL: [-1.3, 0, 0], foreR: [-1.3, 0, 0] }, .04 + .03 * S(p * TAU * 2)); }, .32),
  sprint: cyc(p => { const s = S(p * TAU); return P({ spine: [.38, 0, 0], head: [-.25, 0, 0], legL: [-1.1 * s - .2, 0, 0], legR: [1.1 * s - .2, 0, 0], shinL: [.4 + Math.max(0, 1.6 * S(p * TAU + 1.4)), 0, 0], shinR: [.4 + Math.max(0, -1.6 * S(p * TAU + 1.4)), 0, 0], armL: [1 * s, 0, -.1], armR: [-1 * s, 0, .1], foreL: [-1.5, 0, 0], foreR: [-1.5, 0, 0] }, .06); }, .26),
  back: cyc(p => POSES.walk.cycle(1 - p), .55),   // walking backwards: the walk run in reverse
  strafeL: cyc(p => { const s = S(p * TAU); return P({ spine: [.05, 0, .04], legL: [-.1, 0, -.12 - .3 * Math.max(0, s)], legR: [-.1, 0, -.12 + .3 * Math.max(0, -s)], shinL: [.2 + .5 * Math.max(0, s), 0, 0], shinR: [.2 + .5 * Math.max(0, -s), 0, 0], armL: [0, 0, -.12], armR: [0, 0, .12], foreL: [-.3, 0, 0], foreR: [-.3, 0, 0] }, .02); }, .7),
  strafeR: cyc(p => { const s = S(p * TAU); return P({ spine: [.05, 0, -.04], legL: [-.1, 0, .12 - .3 * Math.max(0, -s)], legR: [-.1, 0, .12 + .3 * Math.max(0, s)], shinL: [.2 + .5 * Math.max(0, -s), 0, 0], shinR: [.2 + .5 * Math.max(0, s), 0, 0], armL: [0, 0, -.12], armR: [0, 0, .12], foreL: [-.3, 0, 0], foreR: [-.3, 0, 0] }, .02); }, .7),
  crouch: cyc(p => P({ spine: [.35, 0, 0], head: [-.3, 0, 0], legL: [-1.2, 0, -.1], legR: [-1.0, 0, .1], shinL: [1.9, 0, 0], shinR: [1.7, 0, 0], armL: [-.4, 0, -.1], armR: [-.4, 0, .1], foreL: [-.9, 0, 0], foreR: [-.9, 0, 0] }, .3 + S(p * TAU) * .005), 0),
  sneak: cyc(p => { const s = S(p * TAU); return P({ spine: [.4, 0, 0], head: [-.35, 0, 0], legL: [-1.0 - .35 * s, 0, 0], legR: [-1.0 + .35 * s, 0, 0], shinL: [1.6 + .3 * Math.max(0, S(p * TAU + 1.2)), 0, 0], shinR: [1.6 + .3 * Math.max(0, -S(p * TAU + 1.2)), 0, 0], armL: [-.3 + .2 * s, 0, -.1], armR: [-.3 - .2 * s, 0, .1], foreL: [-1, 0, 0], foreR: [-1, 0, 0] }, .26); }, .7),
  aim: cyc(() => P({ spine: [.05, .25, 0], head: [0, -.2, 0], armR: [-1.45, -.15, .1], foreR: [-.15, 0, 0], armL: [-1.35, .55, -.1], foreL: [-.55, 0, 0] }), 0),
  jump: cyc(() => P({ spine: [-.05, 0, 0], legL: [-.9, 0, 0], shinL: [1.3, 0, 0], legR: [.1, 0, 0], shinR: [.4, 0, 0], armL: [-2.5, 0, -.3], armR: [-2.5, 0, .3], foreL: [-.2, 0, 0], foreR: [-.2, 0, 0] }), 0),
  fall: cyc(p => P({ spine: [.1, 0, 0], legL: [-.4, 0, -.15], legR: [-.1, 0, .15], shinL: [.7, 0, 0], shinR: [.5, 0, 0], armL: [-.4 + S(p * TAU) * .3, 0, -1.2], armR: [-.4 - S(p * TAU) * .3, 0, 1.2], foreL: [-.4, 0, 0], foreR: [-.4, 0, 0] }), 0),
  land: cyc(() => P({ spine: [.45, 0, 0], legL: [-1, 0, -.1], legR: [-1, 0, .1], shinL: [1.6, 0, 0], shinR: [1.6, 0, 0], armL: [-.6, 0, -.5], armR: [-.6, 0, .5] }, .22), 0),
  hang: cyc(p => P({ spine: [-.05, 0, 0], armL: [-3.0, 0, -.25], armR: [-3.0, 0, .25], foreL: [-.15, 0, 0], foreR: [-.15, 0, 0], legL: [-.1 + S(p * TAU) * .05, 0, 0], legR: [.05 - S(p * TAU) * .05, 0, 0], shinL: [.3, 0, 0], shinR: [.2, 0, 0] }), 0),
  shimmy: cyc(p => { const s = S(p * TAU); return P({ armL: [-3.0, 0, -.25 - .25 * Math.max(0, s)], armR: [-3.0, 0, .25 + .25 * Math.max(0, -s)], foreL: [-.2, 0, 0], foreR: [-.2, 0, 0], legL: [0, 0, -.15 * s], legR: [0, 0, -.15 * s], shinL: [.3, 0, 0], shinR: [.3, 0, 0] }); }, 1.2),
  climb: cyc(() => P({ spine: [.8, 0, 0], head: [-.4, 0, 0], armL: [-1.2, 0, -.2], armR: [-1.2, 0, .2], foreL: [-1.6, 0, 0], foreR: [-1.6, 0, 0], legL: [-1.5, 0, 0], shinL: [2, 0, 0], legR: [-.2, 0, 0], shinR: [.6, 0, 0] }), 0),
  swing: cyc(p => P({ armL: [-3.0, 0, -.1], armR: [-3.0, 0, .1], foreL: [0, 0, 0], foreR: [0, 0, 0], legL: [-.5 + S(p * TAU) * .2, 0, 0], legR: [-.3 + S(p * TAU) * .2, 0, 0], shinL: [.6, 0, 0], shinR: [.4, 0, 0] }), 0),
  cover: cyc(p => P({ spine: [.3, 0, -.12], head: [-.2, .4, 0], legL: [-1.1, 0, -.15], legR: [-.8, 0, .15], shinL: [1.8, 0, 0], shinR: [1.5, 0, 0], armL: [-.7, 0, -.2], armR: [-1.1, -.3, .3], foreL: [-1.2, 0, 0], foreR: [-.6, 0, 0] }, .28 + S(p * TAU) * .004), 0),
  punch: cyc(() => P({ spine: [.15, -.35, 0], armR: [-1.55, -.1, .05], foreR: [-.05, 0, 0], armL: [-.6, .3, -.2], foreL: [-1.9, 0, 0], legL: [-.4, 0, 0], shinL: [.3, 0, 0], legR: [.2, 0, 0] }, .04), 0),
  takedown: cyc(() => P({ spine: [.5, 0, 0], head: [-.3, 0, 0], armL: [-1.4, .5, -.2], armR: [-1.6, -.4, .2], foreL: [-1.6, 0, 0], foreR: [-1.3, 0, 0], legL: [-.8, 0, 0], shinL: [1.0, 0, 0], legR: [.3, 0, 0], shinR: [.5, 0, 0] }, .12), 0),
  downed: cyc(p => P({ hips: [-1.35, 0, 0], spine: [.3, 0, 0], head: [.4, 0, 0], armL: [-.3, 0, -.6], armR: [-1.6 + S(p * TAU) * .1, 0, .3], foreL: [-1, 0, 0], foreR: [-.4, 0, 0], legL: [.2, 0, -.1], legR: [-.4, 0, .2], shinL: [.3, 0, 0], shinR: [.9, 0, 0] }, .78), 0),
  wave: cyc(p => P({ armR: [0, 0, 2.6], foreR: [0, 0, .5 + S(p * TAU) * .5], armL: [0, 0, -.08], foreL: [-.15, 0, 0] }), 0),
  sit: cyc(() => P({ spine: [-.05, 0, 0], legL: [-1.57, 0, -.08], legR: [-1.57, 0, .08], shinL: [1.57, 0, 0], shinR: [1.57, 0, 0], armL: [-.4, 0, -.1], armR: [-.4, 0, .1], foreL: [-.6, 0, 0], foreR: [-.6, 0, 0] }, .42), 0),
};
const TIMED = { idle: .25, aim: 0, wave: .8, hang: .35, swing: .3, cover: .2, downed: .25, fall: 2 };

/**
 * Joints hooked up to a character. parts: { hips, spine, head, armL, foreL, armR, foreR, legL, shinL,
 * legR, shinR } (any can be left out). fade: seconds to blend to a new pose. height: of the figure,
 * for how far the hips drop when crouching. joints: the names the poses turn, for a skeleton with other
 * joints than a person's (a creature's wings, tail and four legs: gs.models.creature). A pose may also say
 * how fast it runs when it doesn't follow the ground: { cycle, rate: 0, per: cycles a second }.
 */
export class Rig {
  constructor(parts, { fade = .18, height = 1.8, poses = {}, joints = JOINTS } = {}) {
    this.parts = parts; this.fade = fade; this.height = height; this.poses = { ...POSES, ...poses };
    this.base = new Map(); for (const k of joints) if (parts[k]) this.base.set(k, [parts[k].rotation.x, parts[k].rotation.y, parts[k].rotation.z]);
    this.hip0 = parts.hips ? parts.hips.position.y : 0;
    this.layers = [{ name: 'idle', w: 1, phase: 0 }]; this.top = null; this.topW = 0; this.phase = 0; this.state = 'idle'; this.cur = {};
  }
  /** Blends to a pose by name (or an object { joint: [x, y, z] } / a cycle). */
  play(name, { fade = this.fade } = {}) {
    this.blendOn = false;
    if (name === this.state) return this;
    this.state = name; this.fadeT = fade; this.layers.push({ name, w: 0, phase: this.phase });
    return this;
  }
  /** An upper-body pose over the legs (aim, wave, punch), or null to let go. */
  upper(name) { if (name) this.top = name; this.topOn = !!name; return this; }
  /** Adds your own pose: rig.add('dance', p => ({ j: { armL: [...] }, drop: 0 }), metresPerCycle). */
  add(name, fn, rate = 0) { this.poses[name] = cyc(typeof fn === 'function' ? fn : () => fn, rate); return this; }
  /** A 1D blend space: { pose: value }; mixes the two poses either side of v (speed, say), in step. Call each frame. */
  blend(space, v) {
    const e = Object.entries(space).sort((a, b) => a[1] - b[1]), w = this.bw = {};
    if (!e.length) return this;
    if (v <= e[0][1]) w[e[0][0]] = 1; else if (v >= e[e.length - 1][1]) w[e[e.length - 1][0]] = 1;
    else for (let i = 0; i < e.length - 1; i++) if (v >= e[i][1] && v <= e[i + 1][1]) { const t = (v - e[i][1]) / Math.max(1e-6, e[i + 1][1] - e[i][1]); w[e[i][0]] = 1 - t; w[e[i + 1][0]] = (w[e[i + 1][0]] || 0) + t; break; }
    return this.startBlend();
  }
  /** A 2D blend space: { pose: [x, y] }; mixes the poses nearest (x, y) (move direction: strafe, back...). */
  blend2(space, x, y) {
    const w = this.bw = {}; let sum = 0;
    for (const [n, [px, py]] of Object.entries(space)) {
      const d2 = (x - px) ** 2 + (y - py) ** 2; if (d2 < 1e-6) { for (const k in w) delete w[k]; w[n] = 1; sum = 1; break; }
      sum += w[n] = 1 / (d2 * d2);
    }
    for (const k in w) w[k] /= sum;
    return this.startBlend();
  }
  startBlend() {
    if (!this.blendOn) { this.blendOn = true; this.blendPhase ??= this.phase; }
    this.state = 'blend'; return this;
  }
  /**
   * Feet on the ground (foot IK), after update(): ground(x, z) is the floor height there; body the
   * character (its y is where flat ground is). The hips drop for the lower foot and the other knee bends.
   */
  plant(ground, body, { most = .45 } = {}) {
    const P = this.parts; if (!P.hips || !P.legL || !P.shinL || !P.legR || !P.shinR) return this;
    body.updateMatrixWorld(true);
    const legs = [[P.legL, P.shinL, this.feet?.[0]], [P.legR, P.shinR, this.feet?.[1]]];
    const tip = (shin, end) => end ? end.getWorldPosition(new Vector3()) : shin.localToWorld(new Vector3(0, -(shin.userData.ikLength ?? .43), 0));
    const base = body.getWorldPosition(new Vector3()).y, sc = body.getWorldScale(new Vector3()).y;
    const off = legs.map(([, s, e]) => { const t = tip(s, e); return Math.max(-most * sc, Math.min(most * sc, (ground(t.x, t.z) ?? base) - base)); });
    const drop = Math.max(0, -Math.min(off[0], off[1]));
    this.plantDrop = (this.plantDrop ?? drop) + (drop - (this.plantDrop ?? drop)) * Math.min(1, (this.lastDt || .016) * 14);
    const ps = P.hips.parent.getWorldScale(new Vector3()).y || 1;
    P.hips.position.y -= this.plantDrop / ps; P.hips.updateMatrixWorld(true);
    const fwd = new Vector3(0, 0, 1).transformDirection(body.matrixWorld);
    legs.forEach(([l, s, e], i) => {
      const t = tip(s, e).add(new Vector3(0, off[i] + this.plantDrop, 0)), knee = s.getWorldPosition(new Vector3()).addScaledVector(fwd, 1);
      reach(l, s, t, { pole: knee, end: e, length: e ? undefined : s.userData.ikLength ?? .43 });
    });
    return this;
  }
  sample(name, phase) { const def = this.poses[name]; if (!def) return { j: {}, drop: 0 }; return def.cycle(phase); }
  /** speed: metres a second (the walk and run cycles follow it); aim: up/down aim (radians) for the upper layer. */
  update(dt, { speed = 0, aim = 0, turn = 0 } = {}) {
    this.lastDt = dt;
    // a blend space: every pose in it shares one phase, moving at the mix of their rates
    this.blendK = Math.max(0, Math.min(1, (this.blendK || 0) + (this.blendOn ? 1 : -1) * dt / Math.max(.01, this.fade)));
    if (this.blendK > 0 && this.bw) {
      let rate = 0, timed = 0;
      for (const [n, w] of Object.entries(this.bw)) { const def = this.poses[n]; if (!def) continue; if (def.rate) rate += def.rate * w; else timed += (def.per ?? TIMED[n] ?? .2) * w; }
      this.blendPhase = ((this.blendPhase ?? 0) + speed * rate * dt + timed * dt) % 1;
    } else if (!this.blendOn) this.blendPhase = null;
    // advance phases: cycles by distance, still poses by time
    for (const l of this.layers) {
      const def = this.poses[l.name]; if (!def) continue;
      l.phase = (l.phase + (def.rate ? speed * def.rate * dt : (def.per ?? TIMED[l.name] ?? .2) * dt)) % 1;
    }
    const k = this.fadeT > 0 ? Math.min(1, dt / this.fadeT) : 1;
    const last = this.layers[this.layers.length - 1]; last.w = Math.min(1, last.w + k);
    let rest = 1 - last.w; for (let i = this.layers.length - 2; i >= 0; i--) { this.layers[i].w = Math.min(this.layers[i].w, rest); rest -= this.layers[i].w; }
    this.layers = this.layers.filter((l, i) => l.w > .001 || i === this.layers.length - 1);
    this.topW += ((this.topOn ? 1 : 0) - this.topW) * Math.min(1, dt / Math.max(.01, this.fade));
    // mix the layers
    const out = {}; let drop = 0;
    for (const l of this.layers) {
      const s = this.sample(l.name, l.phase); drop += s.drop * l.w;
      for (const [j, a] of Object.entries(s.j)) { const o = out[j] ||= [0, 0, 0]; o[0] += a[0] * l.w; o[1] += a[1] * l.w; o[2] += a[2] * l.w; }
    }
    if (this.blendK > 0 && this.bw) {   // over the layers, the blend space by how far it has faded in
      const k2 = this.blendK, mixd = {}; let bd = 0;
      for (const [n, w] of Object.entries(this.bw)) {
        const s = this.sample(n, this.blendPhase ?? 0); bd += s.drop * w;
        for (const [j, a] of Object.entries(s.j)) { const o = mixd[j] ||= [0, 0, 0]; o[0] += a[0] * w; o[1] += a[1] * w; o[2] += a[2] * w; }
      }
      for (const j of new Set([...Object.keys(out), ...Object.keys(mixd)])) { const o = out[j] ||= [0, 0, 0], a = mixd[j] || [0, 0, 0]; for (let i = 0; i < 3; i++) o[i] += (a[i] - o[i]) * k2; }
      drop += (bd - drop) * k2;
      if (this.blendOn && k2 >= 1) { this.layers = [{ name: Object.entries(this.bw).sort((a, b) => b[1] - a[1])[0]?.[0] || 'idle', w: 1, phase: this.blendPhase ?? 0 }]; }
    }
    if (this.top && this.topW > .001) {
      const s = this.sample(this.top, this.phase);
      for (const j of UPPER) { const a = s.j[j] || [0, 0, 0], o = out[j] ||= [0, 0, 0]; for (let i = 0; i < 3; i++) o[i] += (a[i] - o[i]) * this.topW; }
      if (this.top === 'aim') { (out.armR ||= [0, 0, 0])[0] -= aim * this.topW; (out.armL ||= [0, 0, 0])[0] -= aim * this.topW; (out.head ||= [0, 0, 0])[0] -= aim * .5 * this.topW; }
      if (!this.topOn && this.topW < .01) this.top = null;
    }
    if (turn) (out.spine ||= [0, 0, 0])[2] -= turn * .1;
    this.phase = last.phase;
    for (const [j, b] of this.base) { const a = out[j] || [0, 0, 0], p = this.parts[j]; p.rotation.set(b[0] + a[0], b[1] + a[1], b[2] + a[2]); }
    if (this.parts.hips) this.parts.hips.position.y = this.hip0 - drop * this.height;
    this.cur = out; return this;
  }
}

/**
 * A ready jointed figure (about 1.8 m, feet at y = 0, facing +z) built from capsules and boxes, with
 * a .rig. Colours: body, skin, legs, shoes, hair (null for none); mat(colour) makes the materials
 * (toon() for Console, pbr() for Next Gen); scale for bigger or smaller people.
 */
export function figure({ body = '#3a6ea5', skin = '#f1c27d', legs = '#2b2b38', shoes = '#1a1a1a', hair = '#3b2a1a', mat = c => new MeshStandardMaterial({ color: c, roughness: .7 }), scale = 1, shadows = true } = {}) {
  const part = (geo, col, x = 0, y = 0, z = 0) => { const m = new Mesh(geo, mat(col)); m.position.set(x, y, z); m.castShadow = shadows; return m; };
  const joint = (x, y, z, ...kids) => { const g = new Group(); g.position.set(x, y, z); for (const k of kids) g.add(k); return g; };
  const limb = (r, l) => new CapsuleGeometry(r, l, 4, 8);
  // lower leg and foot hang from the knee; thigh from the hip
  const shin = side => joint(0, -.42, 0, part(limb(.065, .32), legs, 0, -.2, 0), part(new BoxGeometry(.12, .07, .24), shoes, 0, -.43, .05));
  const leg = side => { const s = shin(side), g = joint(side * .1, 0, 0, part(limb(.08, .3), legs, 0, -.21, 0), s); g.userData.shin = s; return g; };
  const fore = () => joint(0, -.3, 0, part(limb(.05, .22), skin, 0, -.15, 0), part(new SphereGeometry(.055, 8, 6), skin, 0, -.32, 0));
  const arm = side => { const f = fore(), g = joint(side * .22, .3, 0, part(limb(.06, .22), body, 0, -.14, 0), f); g.userData.fore = f; return g; };
  const head = joint(0, .42, 0, part(new SphereGeometry(.13, 12, 10), skin, 0, .12, 0));
  if (hair) head.add(part(new SphereGeometry(.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * .5), hair, 0, .14, -.01));
  const armL = arm(1), armR = arm(-1), legL = leg(1), legR = leg(-1);
  const spine = joint(0, .05, 0, part(limb(.17, .26), body, 0, .22, 0), head, armL, armR);
  const hips = joint(0, .97, 0, part(new BoxGeometry(.3, .16, .18), legs, 0, -.02, 0), spine, legL, legR);
  const root = new Group(); root.add(hips); root.scale.setScalar(scale);
  root.rig = new Rig({ hips, spine, head, armL, foreL: armL.userData.fore, armR, foreR: armR.userData.fore, legL, shinL: legL.userData.shin, legR, shinR: legR.userData.shin }, { height: 1.8 });
  return root;
}
