// How creatures move: walking, trotting, galloping, hopping, flying, swimming and slithering as cycles
// for gs.poses' Rig, worked out from what each creature is (which legs it has and how long they are,
// its wings, its tail), so a seed that changes the animal changes its gait to match and feet don't slide.
// A cycle is p (0..1 round the cycle) => { j: { bone: [x, y, z] turns }, drop }, as in poses.js; the ones
// that follow the ground say how many cycles a metre, the others how many a second.
// No three.js in here (tested in Node). Kit use only: games reach it as creature.rig and creature.move().
import { POSES } from '../poses.js';

const S = Math.sin, C = Math.cos, TAU = Math.PI * 2, PI = Math.PI, mx = Math.max, mn = Math.min, abs = Math.abs;
const cyc = (cycle, rate = 0, per) => ({ cycle, rate, per });
// one leg, q of the way round its step: f how far forward it is (1 .. -1; it goes back while it stands), lift and flex (0..1) while it swings
const step = q => { const t = q * TAU; return { f: C(t), lift: mx(0, -S(t)), flex: mx(0, -S(t - .45)) }; };
// a leg under the body (a dog's, a bird's): swung from the top, bent in the middle as it comes forward
// leg.bend: how far each joint folds as the leg lifts (a hind leg at the knee and the hock; a front one from the
// shoulder and at the wrist; a bird's at the ankle, forwards)
function under(j, leg, q, A, F, lean = 0) {
  const s = step(q), b = leg.bend || [0, 1, -.75];
  j[leg.up] = [-A * s.f + b[0] * F * s.flex + lean, 0, 0]; j[leg.lo] = [b[1] * F * s.flex, 0, 0];
  if (leg.ft) j[leg.ft] = [b[2] * F * s.flex + .3 * A * s.f, 0, 0];
}
// a leg out to the side (a lizard's, a beetle's): swept forward and back, lifted as it comes forward
function sideways(j, leg, q, A, lift) {
  const s = step(q);
  j[leg.up] = [0, -leg.side * A * s.f, leg.side * lift * s.lift]; j[leg.lo] = [0, 0, -leg.side * lift * .6 * s.lift];
}
const put = (j, leg, q, A, F, lift = .5) => leg.out ? sideways(j, leg, q, A * .9, lift) : under(j, leg, q, A, F);
// a tail (or any run of bones) swaying: each bone a little behind the last
const sway = (j, names, p, amp, lag = .7, up = 0) => names.forEach((n, i) => { j[n] = [up, amp * (1 + i * .35) * S(p * TAU - i * lag), 0]; });
// wings: m.wings lists each one's bones, left then right (creature.js turns them about the body's length last, as a
// wing does). Made spread; folded: swung back against the body, the wrist and tip zig-zagged in the wing's own plane
const foldW = (j, m, k = 1) => (m.wings || []).forEach((w, i) => {
  const s = i % 2 ? -1 : 1;
  if (w.length === 1) j[w[0]] = m.wingRest === 'up' ? [0, 0, s * 1.3 * k] : [0, s * 1.25 * k, -s * .2 * k];
  else { j[w[0]] = [0, s * 1.4 * k, -s * .75 * k]; j[w[1]] = [0, -s * 2.7 * k, 0]; if (w[2]) j[w[2]] = [0, s * 2.65 * k, 0]; }
});
// a wing beat: up and down from the shoulder, the wrist and tip a little behind, the wing turned into the stroke
const flapW = (j, m, p, amp, mid = .1, lag = .9) => (m.wings || []).forEach((w, i) => {
  const s = i % 2 ? -1 : 1, t = p * TAU - (i > 1 ? 1.2 : 0);
  j[w[0]] = [.2 * amp * C(t), 0, s * (mid + amp * S(t))]; if (w[1]) j[w[1]] = [0, 0, s * amp * .6 * S(t - lag)]; if (w[2]) j[w[2]] = [0, 0, s * amp * .5 * S(t - lag * 1.7)];
});
// metres a cycle covers: twice what the feet sweep while they stand
const stride = (legs, A) => 4 * (legs.reduce((a, l) => a + l.L, 0) / legs.length) * S(A);

/**
 * The cycles for a creature (meta: what build() in creature-shapes.js said it is), sized by scale (metres a
 * unit) so they keep step with the ground. Returns { poses, speeds (metres a second: walk, trot, run, fly, swim),
 * ground, air, water (blend spaces for creature.move()) }.
 */
export function movesFor(m, scale = 1) {
  const P = {}, speeds = {}, L = (m.legs?.length ? m.legs.reduce((a, l) => a + l.L, 0) / m.legs.length : m.H || .3) * scale, quick = 1 / Math.sqrt(mx(.02, scale * (m.H || .3) * 2));
  const tail = m.tail || [], jaw = m.jaw, neck = m.neck?.[0], head = m.head;
  const still = (j, p) => { if (m.spine?.[0]) j[m.spine[0]] = [.012 * S(p * TAU), 0, 0]; sway(j, tail, p, .05, .6); return j; };
  if (m.gait === 'quad') {
    const [FL, FR, HL, HR] = m.legs, legs = m.legs, sp = m.spine[0];
    const gait = (ph, A, F, body) => p => { const j = {}; legs.forEach((l, i) => put(j, l, p + ph[i], A, F)); return body(j, p); };
    P.idle = cyc(p => ({ j: { ...still({}, p), [head]: [0, .14 * S(p * TAU * .5), 0] }, drop: 0 }), 0, .22 * quick);
    P.walk = cyc(gait(m.hop ? [.5, .55, 0, .05] : [.25, .75, 0, .5], m.hop ? .5 : .36, m.hop ? 1 : .75, (j, p) => { j[sp] = [0, .035 * S(p * TAU), 0]; j.hips = [m.hop ? -.1 * S(p * TAU + .8) : 0, -.03 * S(p * TAU), 0]; if (neck) j[neck] = [.035 * S(p * TAU * 2), 0, 0]; sway(j, tail, p, .1); return { j, drop: m.hop ? -.12 * mx(0, S(p * TAU + .5)) : .012 * abs(S(p * TAU * 2)) }; }), 1 / (stride(legs, m.hop ? .5 : .36) * scale));
    P.trot = cyc(gait([0, .5, .5, 0], .5, 1, (j, p) => { j[sp] = [.02, .02 * S(p * TAU), 0]; if (neck) j[neck] = [.03 * S(p * TAU * 2), 0, 0]; sway(j, tail, p * 2, .08, .7, -.1); return { j, drop: -.018 * abs(S(p * TAU)) }; }), 1 / (stride(legs, .5) * scale));
    P.run = cyc(gait([.55, .65, 0, .1], .72, 1.25, (j, p) => { j[sp] = [-.11 * S(p * TAU + .3), 0, 0]; j.hips = [.07 * S(p * TAU + .9), 0, 0]; if (neck) j[neck] = [-.07 * S(p * TAU + .9) + .1, 0, 0]; sway(j, tail, p, .05, .7, -.18); return { j, drop: -.03 - .045 * S(p * TAU + 1.2) }; }), 1 / (stride(legs, .72) * 1.25 * scale));
    P.eat = cyc(p => { const j = still({}, p); if (neck) j[neck] = [m.reach ?? .9, 0, 0]; j[head] = [.25 + .06 * S(p * TAU * 2), 0, 0]; if (jaw) j[jaw] = [.16 * mx(0, S(p * TAU * 3)), 0, 0]; j[FL.up] = [-.12, 0, 0]; j[FR.up] = [.1, 0, 0]; return { j, drop: .02 }; }, 0, .3 * quick);
    P.sit = cyc(p => { const j = {}; j.hips = [-.7, 0, 0]; j[sp] = [.5 + .012 * S(p * TAU), 0, 0]; if (neck) j[neck] = [.15, 0, 0]; for (const l of [FL, FR]) { j[l.up] = [.22, 0, 0]; j[l.lo] = [-.02, 0, 0]; } for (const l of [HL, HR]) { j[l.up] = [-.55, 0, l.side * .25]; j[l.lo] = [1.35, 0, 0]; j[l.ft] = [-.9, 0, 0]; } sway(j, tail, p, .12, .6, .5); return { j, drop: m.sit ?? .34 }; }, 0, .2 * quick);
    P.jump = cyc(() => { const j = { [sp]: [-.12, 0, 0] }; for (const l of [FL, FR]) { j[l.up] = [-.95, 0, 0]; j[l.lo] = [.25, 0, 0]; } for (const l of [HL, HR]) { j[l.up] = [.85, 0, 0]; j[l.lo] = [.2, 0, 0]; j[l.ft] = [.5, 0, 0]; } tail.forEach(n => { j[n] = [-.15, 0, 0]; }); return { j, drop: 0 }; });
    speeds.walk = 1.5 * Math.sqrt(L); speeds.trot = 3.2 * Math.sqrt(L); speeds.run = 9 * Math.sqrt(L);
    if (m.hop) { delete P.trot; delete speeds.trot; speeds.walk = 2 * Math.sqrt(L); }
  }
  if (m.gait === 'bird') {
    const a = m.up, legs = m.legs, sp = m.spine[0], wingM = (m.wingSpan || .5) * scale;
    // in the air: legs tucked up (long ones trail behind)
    const tuck = j => { for (const l of legs) { j[l.up] = [m.trail ? .75 : .5, 0, 0]; j[l.lo] = [m.trail ? -.25 : -1.2, 0, 0]; j[l.ft] = [m.trail ? 1.1 : .9, 0, 0]; } return j; };
    const level = (j, k = .85, bob = 0) => { j.hips = [a * k + bob, 0, 0]; if (neck) j[neck] = [-a * k * .55, 0, 0]; j[head] = [-a * k * .4, 0, 0]; return j; };
    P.idle = cyc(p => { const j = {}; j[head] = [.04 * S(p * TAU), .3 * S(p * TAU * .5), 0]; sway(j, tail, p, .04); return { j, drop: .004 * S(p * TAU) }; }, 0, .22 * quick);
    const gait = (A, F, bob, lean) => p => {
      const j = {}; legs.forEach((l, i) => under(j, l, p + (m.hop ? .04 * i : i * .5), A, F));
      const k = S(p * TAU * (m.hop ? 1 : 2)); j.hips = [lean, 0, m.hop ? 0 : .05 * S(p * TAU)]; if (neck) j[neck] = [bob * k - lean * .5, 0, 0]; j[head] = [-bob * k - lean * .5, 0, 0]; sway(j, tail, p * 2, .05);
      return { j, drop: m.hop ? -.35 * step(p).lift : .012 * abs(S(p * TAU * 2)) };
    };
    P.walk = cyc(gait(m.hop ? .42 : .38, m.hop ? .7 : .8, .12, .04), 1 / (stride(legs, m.hop ? .42 : .38) * (m.hop ? 1.6 : 1) * scale));
    P.run = cyc(gait(.6, 1.1, .06, .22), 1 / (stride(legs, .6) * (m.hop ? 2 : 1.3) * scale));
    P.fly = cyc(p => { const j = tuck(level({}, .85, .05 * S(p * TAU + 1))); flapW(j, m, p, .7, .12); sway(j, tail, p, .03, .6, .08 * S(p * TAU)); return { j, drop: .05 * S(p * TAU + .6) }; }, 0, 2.6 * quick);
    P.glide = cyc(p => { const j = tuck(level({}, .9)); flapW(j, m, p, .04, .14); sway(j, tail, p, .04); return { j, drop: 0 }; }, 0, .35 * quick);
    P.hover = cyc(p => { const j = tuck(level({}, .25)); flapW(j, m, p, .95, 0, .7); sway(j, tail, p, .03, .6, .3); return { j, drop: .03 * S(p * TAU + .6) }; }, 0, 3.6 * quick);
    P.eat = cyc(p => { const j = {}, k = mx(0, S(p * TAU)); j.hips = [.45 + .25 * k, 0, 0]; if (neck) j[neck] = [.3 + .5 * k, 0, 0]; j[head] = [.2 * k, 0, 0]; if (jaw) j[jaw] = [.2 * mx(0, S(p * TAU * 2)), 0, 0]; for (const l of legs) j[l.up] = [-.45 - .25 * k, 0, 0]; return { j, drop: .04 }; }, 0, 1.6 * quick);
    P.sit = cyc(p => { const j = {}; for (const l of legs) { j[l.up] = [.9, 0, 0]; j[l.lo] = [-1.9, 0, 0]; j[l.ft] = [1, 0, 0]; } j[head] = [.03 * S(p * TAU), 0, 0]; return { j, drop: .62 }; }, 0, .2 * quick);
    P.jump = cyc(() => { const j = tuck({}); flapW(j, m, .2, .8, .2); return { j, drop: 0 }; });
    speeds.walk = (m.hop ? 2.4 : 1.8) * Math.sqrt(L); speeds.run = 6 * Math.sqrt(L); speeds.fly = 20 * Math.sqrt(wingM);
  }
  if (m.gait === 'quad' && m.wings) {   // a dragon: off the ground its legs hang folded and its wings beat slowly
    const sp = m.spine[0], hang = j => { for (const l of m.legs) { j[l.up] = [l.hind ? .75 : .55, 0, 0]; j[l.lo] = [l.hind ? .5 : -.9, 0, 0]; if (l.ft) j[l.ft] = [l.hind ? -.5 : 1, 0, 0]; } return j; };
    P.fly = cyc(p => { const j = hang({}); flapW(j, m, p, .62, .1); j[sp] = [.04 * S(p * TAU), 0, 0]; if (neck) j[neck] = [.25 + .05 * S(p * TAU + 1), 0, 0]; j[head] = [-.1, 0, 0]; sway(j, tail, p, .05, .5, .12 * S(p * TAU + 2) - .1); return { j, drop: .07 * S(p * TAU + .6) }; }, 0, 1.7 * quick);
    P.glide = cyc(p => { const j = hang({}); flapW(j, m, p, .04, .16); if (neck) j[neck] = [.3, 0, 0]; j[head] = [-.1, 0, 0]; sway(j, tail, p, .05, .5, -.1); return { j, drop: 0 }; }, 0, .3 * quick);
    P.hover = cyc(p => { const j = hang({}); flapW(j, m, p, .9, 0, .7); j.hips = [-.55, 0, 0]; if (neck) j[neck] = [.5, 0, 0]; j[head] = [.2, 0, 0]; sway(j, tail, p, .06, .5, .35); return { j, drop: .05 * S(p * TAU + .6) }; }, 0, 2.2 * quick);
    speeds.fly = 16 * Math.sqrt((m.wingSpan || .9) * scale);
  }
  if (m.gait === 'fish') {
    const lenM = (m.span || 1) * scale, fins = m.fins || [], sp = m.spine[0];
    // a wave down the body, biggest at the tail; the side fins scull
    const wave = (amp, fin) => p => {
      const t = p * TAU, j = { hips: [0, amp * .22 * S(t + 1.3), 0], [sp]: [0, -amp * .3 * S(t + .7), 0], [head]: [0, -amp * .22 * S(t + .2), 0] };
      tail.forEach((n, i) => { j[n] = [0, amp * (.45 + .3 * i) * S(t - .85 * (i + 1)), 0]; }); fins.forEach((n, i) => { const s = i ? -1 : 1; j[n] = [0, s * (.5 - fin), s * (.1 + fin * S(t * 2 + i * 2))]; });
      return { j, drop: 0 };
    };
    P.idle = cyc(wave(.1, .3), 0, mn(1.2, .3 * quick)); P.swim = cyc(wave(.42, .1), 1 / (.8 * lenM));
    P.attack = cyc(p => { const s = wave(.3, .1)(p), k = mx(0, S(p * TAU)); s.j[head] = [-.25 * k, s.j[head][1], 0]; return s; }, 0, 1.6);
    P.hurt = cyc(p => wave(.8, .3)(p * 2), 0, 1.5); P.dead = cyc(() => ({ j: { hips: [0, 0, PI * .96], ...Object.fromEntries(tail.map(n => [n, [0, .12, 0]])) }, drop: 0 }));
    speeds.swim = 2.2 * Math.sqrt(lenM);
  }
  if (m.gait === 'insect') {
    const legs = m.legs, up = m.wingRest === 'up', feel = (j, p, a = .12) => (m.feelers || []).forEach((n, i) => { j[n] = [a * S(p * TAU + i * 1.7), (i ? -1 : 1) * a * .6 * S(p * TAU * .7 + i), 0]; });
    const gait = (A, lift) => p => { const j = {}; legs.forEach(l => sideways(j, l, p + l.ph, A, lift)); feel(j, p * 2, .1); j.hips = [0, .035 * S(p * TAU), .03 * S(p * TAU)]; tail.forEach(n => { j[n] = [.04 * S(p * TAU * 2), 0, 0]; }); return { j, drop: 0 }; };
    P.idle = cyc(p => { const j = {}; if (up) foldW(j, m, .7 + .3 * S(p * TAU)); feel(j, p); tail.forEach(n => { j[n] = [.03 * S(p * TAU * 2), 0, 0]; }); if (head) j[head] = [0, .1 * S(p * TAU), 0]; return { j, drop: 0 }; }, 0, .45);
    P.walk = cyc(gait(.36, .45), 1 / (stride(legs, .36) * scale)); P.run = cyc(gait(.5, .55), 1 / (stride(legs, .5) * 1.1 * scale));
    P.eat = cyc(p => { const j = {}; j.hips = [.18 + .04 * S(p * TAU * 3), 0, 0]; feel(j, p * 3, .2); return { j, drop: .08 }; }, 0, .5);
    P.attack = cyc(p => { const j = {}, k = mx(0, S(p * TAU)); j.hips = [-.3 * k, 0, 0]; legs.slice(0, 2).forEach(l => { j[l.up] = [0, -l.side * .5 * k, l.side * .9 * k]; }); feel(j, p * 3, .2); return { j, drop: -.1 * k }; }, 0, 1.6);
    P.dead = cyc(() => { const j = { hips: [0, 0, PI] }; for (const l of legs) { j[l.up] = [0, 0, l.side * 1.1]; j[l.lo] = [0, 0, -l.side * 1.3]; } return { j, drop: 1 - 1.6 * (m.W || .1) / (m.H || .15) }; });
    if (m.wings) {
      const air = (amp, mid, tip) => p => { const j = {}; flapW(j, m, p, amp, mid, .5); for (const l of legs) { j[l.up] = [0, 0, -l.side * .55]; j[l.lo] = [0, 0, l.side * .5]; } j.hips = [tip, 0, 0]; feel(j, p * .15, .08); return { j, drop: .02 * S(p * TAU * (up ? 1 : .11)) }; };
      P.fly = cyc(air(up ? .95 : .5, up ? .3 : .12, .12), 0, up ? 4.5 : 13); P.hover = cyc(air(up ? .95 : .55, up ? .3 : .1, -.1), 0, up ? 5.5 : 15);
      speeds.fly = 14 * Math.sqrt((m.span || 1) * scale);
    }
    speeds.walk = 1.6 * Math.sqrt(L); speeds.run = 4 * Math.sqrt(L);
  }
  if (m.gait === 'biped') {   // it stands as a person does: a person's poses, in step with its own height
    const hM = (m.H || 1) * scale, k = 1.8 / hM, f = Math.sqrt(hM / 1.8);
    const as = (name, more) => { const src = POSES[name]; return { cycle: p => { const s = src.cycle(p), j = { ...s.j }; sway(j, tail, p, .12, .7); if (more) more(j, p); return { j, drop: s.drop }; }, rate: src.rate * k }; };
    for (const n of ['idle', 'walk', 'run', 'sprint', 'back', 'strafeL', 'strafeR', 'crouch', 'sneak', 'sit', 'jump', 'fall', 'land', 'wave']) P[n] = as(n);
    P.attack = cyc(p => { const k2 = mx(0, S(p * TAU)), j = { spine: [.15 * k2, -.45 * k2, 0], armR: [-1.7 * k2, -.2 * k2, .1], foreR: [-.9 + .8 * k2, 0, 0], armL: [-.3, 0, -.2], foreL: [-1.2, 0, 0], legL: [-.3 * k2, 0, 0], shinL: [.25 * k2, 0, 0] }; if (jaw) j[jaw] = [.5 * k2, 0, 0]; sway(j, tail, p, .15); return { j, drop: .03 * k2 }; }, 0, 1.3 * quick);
    P.dead = cyc(() => ({ j: { hips: [-1.45, 0, 0], spine: [.1, 0, 0], head: [.3, 0, .2], armL: [-.2, 0, -.6], armR: [-.3, 0, .5], foreL: [-.3, 0, 0], legL: [.25, 0, -.15], legR: [-.1, 0, .2], shinL: [.3, 0, 0], shinR: [.6, 0, 0], ...Object.fromEntries(tail.map(n => [n, [.2, 0, 0]])) }, drop: ((m.hipY || m.H * .45) - (m.W || .12) * 1.15) / m.H }));
    if (m.wings) {
      const air = (lean, amp, mid) => p => { const j = { spine: [lean, 0, 0], head: [-lean * .8, 0, 0], legL: [.25 + lean * .6, 0, 0], legR: [.4 + lean * .6, 0, 0], shinL: [.5, 0, 0], shinR: [.8, 0, 0], armL: [-.3, 0, -.35], armR: [-.3, 0, .35], foreL: [-.9, 0, 0], foreR: [-.9, 0, 0], hips: [lean * .9, 0, 0] }; flapW(j, m, p, amp, mid); sway(j, tail, p, .15, .7, .2); return { j, drop: .04 * S(p * TAU + .6) }; };
      P.fly = cyc(air(.55, .65, .12), 0, 2.4 * quick); P.glide = cyc(air(.65, .04, .16), 0, .3 * quick); P.hover = cyc(air(.05, .9, 0), 0, 3 * quick);
      speeds.fly = 16 * Math.sqrt((m.wingSpan || .9) * scale);
    }
    speeds.walk = 1.4 * f; speeds.run = 4 * f;
  }
  if (m.gait === 'blob') {   // it wobbles where it sits and gets about in hops
    const sp = m.spine[0], sizeM = (m.span || 1) * scale;
    const hop = (hi, lean) => p => { const t = p * TAU, upk = mx(0, S(t)); return { j: { hips: [lean * .5 * C(t), 0, 0], [sp]: [-lean * C(t), 0, 0], [head]: [-lean * .8 * C(t - .7), 0, 0] }, drop: -hi * upk + .12 * mx(0, -S(t)) }; };
    P.idle = cyc(p => ({ j: { [sp]: [.05 * S(p * TAU), 0, .05 * C(p * TAU)], [head]: [.07 * S(p * TAU + 1), 0, .07 * C(p * TAU + 1)] }, drop: .03 + .03 * S(p * TAU * 2) }), 0, .45);
    P.walk = cyc(hop(.35, .22), 1 / (.9 * sizeM)); P.run = cyc(hop(.7, .35), 1 / (1.8 * sizeM));
    P.attack = cyc(p => { const k = mx(0, S(p * TAU)); return { j: { [sp]: [.5 * k, 0, 0], [head]: [.35 * k, 0, 0] }, drop: -.15 * k }; }, 0, 1.4);
    P.hurt = cyc(p => ({ j: { [sp]: [-.3, 0, .12 * S(p * TAU * 3)], [head]: [-.25, 0, .15 * S(p * TAU * 3 + 1)] }, drop: .08 }), 0, 1.2);
    P.dead = cyc(() => ({ j: { [sp]: [.5, 0, .5], [head]: [.6, 0, .5] }, drop: .12 }));
    speeds.walk = 1.1 * Math.sqrt(sizeM); speeds.run = 2.6 * Math.sqrt(sizeM);
  }
  if (m.gait === 'serpent') {
    // a wave from the head to the tail's tip: each joint turns as the wave passes it (the tail's the other way: its bones run backwards)
    const lenM = (m.span || 1) * scale, front = [head, ...(m.neck || []), ...[...m.spine].reverse()], n0 = front.length;
    const wave = (amp, lift = 0) => p => {
      const t = p * TAU, j = { hips: [0, -amp * .5 * S(t - n0 * .75 + 1.2), 0] };
      front.forEach((n, i) => { j[n] = [0, amp * (.5 + .5 * mn(1, i / 2)) * S(t - i * .75), 0]; }); tail.forEach((n, i) => { j[n] = [0, -amp * S(t - (n0 + 1 + i) * .75), 0]; });
      if (lift) { const a = m.spine[m.spine.length - 1], b = m.neck?.[0]; j[m.spine[0]][0] = -lift * .45; j[a][0] = -lift * .55; if (b) j[b][0] = lift * .35; j[head][0] = lift * .6; }
      return { j, drop: 0 };
    };
    P.idle = cyc(wave(.1, .9), 0, .3); P.walk = cyc(wave(.5), 1 / (.55 * lenM)); P.run = cyc(wave(.68), 1 / (.75 * lenM)); P.swim = cyc(wave(.6), 1 / (.6 * lenM));
    P.rear = cyc(wave(.07, 1.5), 0, .35);
    P.attack = cyc(p => { const k = mx(0, S(p * TAU)), s = wave(.05, 1.4 - 1.3 * k)(p); if (jaw) s.j[jaw] = [.8 * k, 0, 0]; return s; }, 0, 1.5);
    P.hurt = cyc(p => wave(.9, .3)(p), 0, 1.6); P.dead = cyc(() => { const s = wave(.5)(0.3); s.j.hips = [0, 0, PI * .9]; return { j: s.j, drop: -1 }; });
    speeds.walk = 1.0 * Math.sqrt(lenM); speeds.run = 2.6 * Math.sqrt(lenM); speeds.swim = 1.6 * Math.sqrt(lenM);
  }
  // ---- what every kind can do: bite, flinch, lie dead
  if (!P.attack) P.attack = cyc(p => { const k = mx(0, S(p * TAU)), j = still({}, p); if (neck) j[neck] = [.12 - .3 * k, 0, 0]; if (head) j[head] = [-.18 * k, 0, 0]; if (jaw) j[jaw] = [.6 * k, 0, 0]; return { j, drop: .02 * k }; }, 0, 1.5 * quick);
  if (!P.hurt) P.hurt = cyc(p => { const j = {}; if (m.spine?.[0]) j[m.spine[0]] = [-.14, .05 * S(p * TAU * 2), 0]; if (head) j[head] = [-.3, .12, .1]; if (jaw) j[jaw] = [.25, 0, 0]; tail.forEach(n => { j[n] = [.25, 0, 0]; }); return { j, drop: .05 }; }, 0, 1.2);
  if (!P.dead) P.dead = cyc(() => { const j = {}; j.hips = [0, 0, PI / 2 - .06]; if (neck) j[neck] = [.3, 0, -.25]; if (jaw) j[jaw] = [.3, 0, 0]; for (const l of m.legs || []) { j[l.up] = l.out ? [0, 0, l.side * .3] : [l.hind ? .25 : -.2, 0, 0]; j[l.lo] = l.out ? [0, 0, 0] : [.3, 0, 0]; } tail.forEach(n => { j[n] = [.1, 0, 0]; }); return { j, drop: 1 - (m.W || .12) / (m.H || .3) }; });
  // on the ground (any pose that doesn't move the wings itself) the wings are folded
  if (m.wings) for (const def of Object.values(P)) { const c = def.cycle, w0 = m.wings[0][0]; def.cycle = p => { const s = c(p); if (!(w0 in s.j)) foldW(s.j, m); return s; }; }
  const space = names => Object.fromEntries([['idle', 0], ...names.filter(n => P[n] && speeds[n]).map(n => [n, speeds[n]])]);
  return { poses: P, speeds, ground: m.gait === 'fish' ? null : space(['walk', 'trot', 'run']), air: P.fly ? { ...(P.hover ? { hover: 0 } : { fly: 0 }), fly: speeds.fly || 1 } : null, water: P.swim ? space(['swim']) : null };
}
export { POSES };
