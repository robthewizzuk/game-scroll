import gs from '../gamescroll.js';
const { Timers } = gs.math;
const { Brain } = gs.brains;
const SWINGS = ['L', 'R', 'S', 'quickL', 'quickR', 'hold'];
const { sounds, noise, tone } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { HDView, Particles, pbr, rbox, surface, speckle, sun, spot, THREE } = gs.hd;
const { Group, Mesh, InstancedMesh, Object3D, Vector3, CylinderGeometry, SphereGeometry, TorusGeometry, BoxGeometry, PlaneGeometry, CircleGeometry, Color } = THREE;

// Mech Brawl: one-on-one boxing between two giant cartoon mechs in a stadium. Tap the left or right
// side to throw that fist (left: quick jab, right: heavy hook). Watch the rival: when a fist glows
// and pulls back, swipe to dodge or hold a thumb down to block. A dodged swing leaves the rival OPEN
// for double damage. Knock them out to face a tougher one; armour plates fly off on big hits.
// The rival's swings come from a Tiny Brains rival with a memory: its teacher is the old pattern (a jab
// from either side, the odd SMASH), and for each swing it may instead throw a quick one or hold back,
// from how you box (how often you block, dodge, how late you leave it, the health bars). It feels each
// swing: a dodge at the last moment is the thrill, a block or a hit less so. Its memory keeps which
// swing gave this player a close call, the win-rate rail keeps the bout fair (a slower wind-up while you
// are losing), and its visor flashes gold when it throws one it remembered.
let W = 300, H = 300;
const RIVALS = [
  { name: 'RUSTBUCKET', col: '#c86a2a', hp: 100, wind: .8, rest: [1.4, 2.4], guard: .25 },
  { name: 'BOLT BARON', col: '#2a8ad8', hp: 120, wind: .66, rest: [1.1, 2], guard: .35 },
  { name: 'IRON MAMA', col: '#9a3ad0', hp: 145, wind: .56, rest: [.9, 1.7], guard: .4 },
  { name: 'MEGA TONNE', col: '#d03040', hp: 175, wind: .48, rest: [.7, 1.4], guard: .45 },
];

let MT = null;
function looks() {
  if (MT) return MT;
  const plate = surface(256, ({ col, h, r, size: S }) => {
    col.fillStyle = '#fff'; col.fillRect(0, 0, S, S); speckle(col, S, 600, '#888', 1.5, .25);
    h.fillStyle = '#000'; for (let i = 0; i <= S; i += 64) { h.fillRect(i - 2, 0, 4, S); h.fillRect(0, i - 2, S, 4); }
    for (let y = 16; y < S; y += 64) for (let x = 16; x < S; x += 64) { h.fillStyle = '#fff'; h.beginPath(); h.arc(x, y, 3, 0, 7); h.fill(); }
    r.fillStyle = '#777'; r.fillRect(0, 0, S, S); speckle(r, S, 900, '#ddd', 3, .5);   // scuffs
  }, { strength: 3 });
  const deck = surface(512, ({ col, h, size: S }) => {
    col.fillStyle = '#2a2d33'; col.fillRect(0, 0, S, S); speckle(col, S, 3000, '#15171b', 1.5, .5);
    h.fillStyle = '#000'; for (let i = 0; i <= S; i += 128) { h.fillRect(i - 3, 0, 6, S); h.fillRect(0, i - 3, S, 6); }
    col.fillStyle = '#e8b020'; for (let i = 0; i < S; i += 32) { col.save(); col.translate(i, 0); col.rotate(.6); col.fillRect(0, 0, 12, 30); col.restore(); }   // hazard stripe edge
  }, { strength: 2 });
  MT = { plate, deck: pbr('#ffffff', { tex: deck.repeat(3, 3), rough: .55, metal: .6 }), joint: pbr('#2a2e36', { rough: .35, metal: .9 }), chrome: pbr('#e0e4ea', { rough: .12, metal: 1 }),
    visor: c => pbr(c, { glow: 3.2, rough: .1 }), glowFist: pbr('#ff6a20', { glow: 4 }), rope: pbr('#ff2a60', { glow: 2.5 }), crowd: pbr('#1a1c22', { rough: .8 }), flash: pbr('#ffffff', { glow: 5 }) };
  return MT;
}
const paint = col => pbr(col, { tex: looks().plate, rough: .35, metal: .45, clear: .8 });
function makeMech(col, visorCol) {
  const m = looks(), p = paint(col), g = new Group(), body = new Group(); g.add(body);
  const B = (w, h, d, mat, x, y, z, par = body) => { const o = new Mesh(rbox(w, h, d, Math.min(w, h, d) * .22), mat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; par.add(o); return o; };
  // legs
  for (const s of [-1, 1]) { B(.55, 1.1, .6, m.joint, s * .45, .55, 0); B(.7, .6, .8, p, s * .45, 1.2, 0); B(.7, .25, 1, p, s * .45, .12, .1); }
  B(1.5, .5, .9, m.joint, 0, 1.55, 0);
  const torso = B(2.1, 1.5, 1.4, p, 0, 2.5, 0); B(1.2, .8, .3, m.chrome, 0, 2.6, .72);
  const core = new Mesh(new SphereGeometry(.22, 16, 12), m.visor(visorCol)); core.position.set(0, 2.6, .86); body.add(core);
  const head = new Group(); head.position.set(0, 3.45, 0); body.add(head);
  B(.9, .6, .8, p, 0, 0, 0, head); const visor = B(.75, .18, .1, m.visor(visorCol), 0, .05, .42, head);
  // armour plates that can be knocked off
  const plates = [B(.9, .5, .3, p, -.55, 2.95, .72), B(.9, .5, .3, p, .55, 2.95, .72), B(.6, .5, .6, p, 0, .38, -.1, head)];
  const arms = {};
  for (const s of [-1, 1]) {
    const sh = new Group(); sh.position.set(s * 1.35, 2.9, 0); body.add(sh);
    B(.9, .7, .9, p, 0, .15, 0, sh); plates.push(B(.95, .3, .95, p, 0, .55, 0, sh));
    const arm = new Group(); sh.add(arm); B(.45, .45, 1.1, m.joint, 0, -.4, .3, arm);
    const fist = new Group(); fist.position.set(0, -.4, 1); arm.add(fist);
    const f = B(.75, .75, .75, p, 0, 0, 0, fist); B(.8, .2, .3, m.chrome, 0, .1, .3, fist);
    arms[s < 0 ? 'L' : 'R'] = { sh, arm, fist, f, ext: 0, wind: 0 };
  }
  g.userData = { body, head, torso, arms, plates, p, visor };
  return g;
}

function make(api) {
  const timers = new Timers(), later = (fn, ms) => timers.after(ms / 1000, fn);   // game-time delays: they pause with the game
  let v, me, foe, sunL, spots, sparks, smoke, debris, built;
  let myHp, foeHp, rival, ri, foeState, foeT, foeSide, open, myGuard, dodge, dodgeT, cool, score, t, msg, fingers, keys, hitFlash, koT, shake, roundT, flying;
  const tmp = new Vector3();
  const VISOR_RED = new Color('#ff4040'), VISOR_GOLD = new Color('#ffd040');
  // how this player boxes, kept across bouts: how often they block and dodge (-1 never .. 1 always) and how
  // late they leave a dodge (-1 early .. 1 at the last moment)
  const style = { block: 0, dodge: 0, late: 0 };
  let swingKind = 'L', remembered = 0;
  // see: 0..2 the habits above, 3 your health, 4 the rival's health
  const see = () => [style.block, style.dodge, style.late, myHp / 50 - 1, foeHp / rival.hp * 2 - 1];
  const brain = new Brain(api, {
    name: 'mech-brawl-rival', inputs: 5, actions: SWINGS, memory: true,
    // the teacher is the old pattern: a SMASH now and then (more in later rounds), else either fist
    teacher: () => Math.random() < .22 + ri * .03 ? 'S' : Math.random() < .5 ? 'L' : 'R',
    limits: { react: .1, perSecond: 10, minNoise: .06 },
  });
  // a swing is over: what the rival learns, and how this player boxes
  function felt(how) {
    const late = how === 'dodged' ? dodgeT / .45 * 2 - 1 : null;
    brain.feel(how === 'dodged' ? (late > .3 ? 1 : .35) : how === 'blocked' ? .4 : how === 'hit' ? .1 : 0);
    style.block += ((how === 'blocked' ? 1 : -1) - style.block) * .2;
    style.dodge += ((how === 'dodged' ? 1 : -1) - style.dodge) * .2;
    if (late != null) style.late += (late - style.late) * .3;
  }

  function setup() {
    v = new HDView({ bg: '#05070c', fog: .02, env: .45, sky: '#8090c0', ground: '#201820', amb: .4, fov: 55 }).lampLights(20);
    v.bloom = .75;
    // a stadium broadcast: anamorphic streaks off the floodlights, grain, flare
    v.film = 'anamorphic'; v.flare = { strength: .45, threshold: .45, dirt: .35 };
    sunL = sun('#fff0e0', 2.4, 10, [-.3, 1, .2]); v.scene.add(sunL, sunL.target); v.onTier(T => sunL.setTier(T)); sunL.follow(0, 0, 2);
    const m = looks();
    const deck = new Mesh(new CircleGeometry(9, 48), m.deck); deck.rotation.x = -Math.PI / 2; deck.receiveShadow = true; v.scene.add(deck);
    const ring = new Mesh(new TorusGeometry(8.6, .08, 8, 96), m.rope); ring.rotation.x = Math.PI / 2; ring.position.y = 1.4; v.scene.add(ring);
    const ring2 = ring.clone(); ring2.position.y = 2.2; v.scene.add(ring2);
    // stands + crowd silhouettes with phone lights
    const crowd = new InstancedMesh(rbox(1, 1, 1, .2), m.crowd, 260), lights = new InstancedMesh(new SphereGeometry(.07, 6, 4), m.flash, 120), mx = new Object3D();
    for (let i = 0; i < 260; i++) { const a = i / 260 * Math.PI * 2 * 3, r = 12 + (i % 3) * 2.2, y = 1 + (i % 3) * 1.4; mx.position.set(Math.cos(a) * r, y, Math.sin(a) * r); mx.scale.set(.7, 1.2 + Math.random() * .4, .6); mx.updateMatrix(); crowd.setMatrixAt(i, mx.matrix); if (i < 120) { mx.position.y += 1.1; mx.scale.setScalar(1); mx.updateMatrix(); lights.setMatrixAt(i, mx.matrix); } }
    v.scene.add(crowd, lights);
    spots = [[-8, 12, -6, '#ff4aa0'], [8, 12, -6, '#40c8ff'], [-8, 12, 10, '#ffd040'], [8, 12, 10, '#ffffff']].map(([x, y, z, c]) => ({ x, y, z, col: c, i: 120 }));
    const key = spot('#ffffff', 160, 30, .5); key.position.set(3, 14, -4); key.target.position.set(0, 2, 2); v.scene.add(key, key.target); v.onTier(T => { sunL.setTier(T); key.setTier(T); });
    me = makeMech('#a8aeb8', '#40e8ff'); v.scene.add(me);
    sparks = new Particles(v, { max: 400, additive: true }); smoke = new Particles(v, { max: 150, additive: false });
    debris = [];
  }
  function newFoe() {
    if (foe) v.scene.remove(foe);
    rival = { ...RIVALS[Math.min(ri, RIVALS.length - 1)] }; if (ri >= RIVALS.length) { rival.hp += (ri - 3) * 30; rival.wind = Math.max(.38, rival.wind - (ri - 3) * .04); rival.name += ' ' + 'I'.repeat(ri - 2); }
    foe = makeMech(rival.col, '#ff4040'); foe.position.set(0, 0, 4.4); foe.rotation.y = Math.PI; v.scene.add(foe);
    foeHp = rival.hp; foeState = 'rest'; foeT = rnd(...rival.rest) + 1; open = 0; roundT = 0; v.warmed = false;
  }
  function burst(p, n, col, sp = 7) { for (let i = 0; i < n; i++) sparks.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-sp, sp), vy: rnd(-2, sp), vz: rnd(-sp, sp), life: rnd(.2, .5), size: rnd(.08, .2), col, drag: 3, grav: 8, floor: 0 }); }
  function knockPlate(mech) {
    const pl = mech.userData.plates.filter(x => x.parent); if (!pl.length) return;
    const o = pl[(Math.random() * pl.length) | 0]; o.getWorldPosition(tmp); o.parent.remove(o); v.scene.add(o); o.position.copy(tmp);
    debris.push({ o, v: new Vector3(rnd(-3, 3), rnd(4, 7), rnd(-3, 3) + (mech === foe ? 2 : -2)), r: new Vector3(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8)), life: 4 });
  }
  function punch(side) {
    if (cool > 0 || koT > 0 || dodgeT > 0) return;
    const a = me.userData.arms[side]; a.ext = .01; cool = side === 'L' ? .28 : .55;
    tone(side === 'L' ? 300 : 200, { len: .08, wave: 'triangle', vol: .04, slide: -100 });
    later(() => land(side), side === 'L' ? 110 : 180);
  }
  function land(side) {
    if (!foe || koT > 0) return;
    const heavy = side === 'R'; let dmg = heavy ? 9 : 4;
    const guarded = foeState === 'rest' && Math.random() < rival.guard && !open;
    const fp = foe.userData.head.getWorldPosition(new Vector3()); fp.y -= .4;
    if (guarded) { dmg *= .25; tone(1200, { len: .05, wave: 'square', vol: .03 }); burst(fp, 8, [2, 2, 2.5], 4); haptic('light'); }
    else {
      if (open > 0) dmg *= 2; if (foeState === 'wind') { dmg *= 1.5; if (heavy) { foeState = 'rest'; foeT = 1; msg = { txt: 'COUNTER!', l: .8, col: '#ffd040' }; } }
      sounds.hit(heavy ? .7 : 1); haptic(heavy ? 'heavy' : 'medium'); burst(fp, heavy ? 30 : 14, [6, 3, 1]); shake = heavy ? .5 : .25;
      if (heavy && Math.random() < .35) knockPlate(foe);
      foe.userData.body.rotation.x = -.15; foe.userData.body.rotation.z = side === 'L' ? .08 : -.12;
    }
    foeHp -= dmg; score += Math.round(dmg * 10); api.score(score);
    if (foeHp <= 0) ko();
  }
  function ko() {
    koT = 3; foeHp = 0; brain.result(true); const bonus = 500 + ri * 250; score += bonus; api.score(score);
    msg = { txt: 'K.O.!', sub: `+${bonus}`, l: 2.6, col: '#ffd040' }; haptic('success'); sounds.win(); sounds.boom(.8);
    for (let i = 0; i < 3; i++) knockPlate(foe);
  }
  function foeAttack() {
    const a = foe.userData.arms[foeSide];
    if (foeSide === 'S') { foe.userData.arms.L.ext = foe.userData.arms.R.ext = .01; } else a.ext = .01;
    later(() => {
      if (koT > 0 || !foe) return;
      const smash = foeSide === 'S';
      if (dodgeT > 0) { felt('dodged'); open = 1.3; msg = { txt: 'DODGED · OPEN!', l: 1, col: '#40e8ff' }; haptic('light'); tone(900, { len: .1, wave: 'square', vol: .04, slide: 300 }); return; }
      let dmg = smash ? 24 : 14;
      felt(myGuard && !smash ? 'blocked' : 'hit');
      if (myGuard && !smash) { dmg = 4; tone(1500, { len: .05, wave: 'square', vol: .03 }); haptic('medium'); burst(tmp.set(0, 2.6, .9), 10, [2, 2, 2.6], 4); msg = { txt: 'BLOCKED', l: .6, col: '#cfe' }; }
      else { haptic('heavy'); sounds.hurt(.8); noise(.3, { vol: .12, from: 1600, to: 100 }); hitFlash = 1; shake = smash ? 1 : .7; if (Math.random() < .4) knockPlate(me); if (smash && myGuard) msg = { txt: "CAN'T BLOCK A SMASH, DODGE IT", l: 1.2, col: '#ff6a5a' }; }
      myHp -= dmg;
      if (myHp <= 0) { myHp = 0; brain.result(false); sounds.lose(); later(() => api.over(), 900); koT = 99; msg = { txt: 'DOWN!', l: 3, col: '#ff5050' }; }
    }, 140);
  }
  function update(dt) { timers.update(dt);
    t += dt; roundT += dt; remembered = Math.max(0, remembered - dt * 1.5); cool = Math.max(0, cool - dt); dodgeT = Math.max(0, dodgeT - dt); open = Math.max(0, open - dt); hitFlash = Math.max(0, hitFlash - dt * 2.5); shake = Math.max(0, shake - dt * 2);
    if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
    myGuard = Object.values(fingers).some(f => f.hold) || keys.has('ArrowDown');
    // KO'd rival topples, then a new one walks in
    if (koT > 0) { koT -= dt; if (koT > 50) { anim(dt); return; } foe.userData.body.rotation.x = Math.min(1.5, foe.userData.body.rotation.x + dt * 1.2); foe.position.y = Math.max(-1, foe.position.y - dt * .2); if (koT <= 0) { ri++; newFoe(); msg = { txt: `ROUND ${ri + 1}`, sub: rival.name, l: 1.8, col: '#fff' }; } anim(dt); return; }
    if (roundT < 1.5) { anim(dt); return; }
    // rival: rest (may guard) -> wind up a swing (glows) -> strike -> rest
    foeT -= dt;
    if (foeState === 'rest' && foeT <= 0 && open <= 0) {
      brain.act(see(), 1); swingKind = brain.action; remembered = brain.remembered ? 1 : 0;
      // hold: it waits a beat longer before swinging (a breather, or a nerve test)
      if (swingKind === 'hold') { foeT = rnd(.4, .8); felt('held'); anim(dt); return; }
      foeState = 'wind'; foeSide = swingKind === 'S' ? 'S' : swingKind.endsWith('L') ? 'L' : 'R';
      // a quick one winds up in under three quarters of the time; a low skill (you are losing) winds up slower
      foeT = rival.wind * (foeSide === 'S' ? 1.25 : 1) * (swingKind.startsWith('quick') ? .72 : 1) * (1.15 - .3 * brain.skill);
      tone(foeSide === 'S' ? 150 : 220, { len: .25, wave: 'sawtooth', vol: .03, slide: 120 }); }
    else if (foeState === 'wind' && foeT <= 0) { foeState = 'rest'; foeT = rnd(...rival.rest); foeAttack(); }
    anim(dt);
  }
  function anim(dt) {
    for (const mech of [me, foe]) {
      const u = mech.userData;
      for (const k of ['L', 'R']) { const a = u.arms[k]; if (a.ext > 0) { a.ext += dt * 7; if (a.ext > 2) a.ext = 0; } const e = a.ext > 0 ? Math.sin(Math.min(1, a.ext / 2) * Math.PI) : 0; a.arm.position.z = e * 1.5; a.arm.rotation.x = -e * .25; }
      u.body.rotation.x *= Math.exp(-dt * 6); u.body.rotation.z *= Math.exp(-dt * 6);
      u.body.position.y = Math.sin(t * 4 + (mech === me ? 0 : 2)) * .05;
    }
    // wind-up: the swinging fist pulls back and glows
    const fu = foe.userData, winding = foeState === 'wind' && koT <= 0;
    for (const k of ['L', 'R']) { const a = fu.arms[k], on = winding && (foeSide === k || foeSide === 'S'); a.f.material = on ? looks().glowFist : fu.p; if (on) { a.arm.position.z = -.6; a.sh.rotation.x = foeSide === 'S' ? -1.2 : 0; } else a.sh.rotation.x *= .8; }
    fu.body.rotation.y = winding && foeSide !== 'S' ? (foeSide === 'L' ? .35 : -.35) : fu.body.rotation.y * .85;
    fu.visor.material.emissiveIntensity = open > 0 ? .3 : 3.2;
    fu.visor.material.emissive.copy(remembered > 0 ? VISOR_GOLD : VISOR_RED);   // gold: a swing it remembered (a colour, so no new shader)
    // me: dodge sideways, guard up
    const mu = me.userData, dx = dodgeT > 0 ? dodge * Math.sin(dodgeT / .45 * Math.PI) * 1.3 : 0;
    me.position.x = dx; mu.body.rotation.z = -dx * .15;
    for (const k of ['L', 'R']) { const a = mu.arms[k]; if (myGuard && !a.ext) { a.sh.rotation.x = -.9; a.sh.rotation.z = k === 'L' ? -.4 : .4; } else { a.sh.rotation.x *= .7; a.sh.rotation.z *= .7; } }
    for (const d of debris) { d.life -= dt; d.v.y -= 14 * dt; d.o.position.addScaledVector(d.v, dt); d.o.rotation.x += d.r.x * dt; d.o.rotation.y += d.r.y * dt; if (d.o.position.y < .2) { d.o.position.y = .2; d.v.y *= -.3; d.v.x *= .6; d.v.z *= .6; d.r.multiplyScalar(.6); } if (d.life <= 0) v.scene.remove(d.o); }
    debris = debris.filter(d => d.life > 0);
    sparks.update(dt); smoke.update(dt);
  }
  function draw(c) {
    if (!built) self.reset();
    const sh = shake * .15;
    // three-quarter ringside view, so neither mech hides the other; pull back on tall (portrait) screens
    const back = Math.max(1, H / W * .9);
    v.cam.position.set(6.4 * back + me.position.x * .3 + rnd(-sh, sh), 4.3 + rnd(-sh, sh), -3.6 * back); v.cam.lookAt(me.position.x * .3, 2.3, 2.2);
    v.placeLamps(spots, 0, 3, 2, t); v.hurt = hitFlash * .8;
    v.render(c, W, H); hud(c);
  }
  function bar(c, x, y, w, h, k, col, right) { c.fillStyle = '#00000090'; c.beginPath(); c.roundRect(x, y, w, h, h / 2); c.fill(); c.fillStyle = col; const ww = Math.max(0, w * k); c.beginPath(); c.roundRect(right ? x + w - ww : x, y, ww, h, h / 2); c.fill(); }
  function hud(c) {
    const u = Math.min(W, H) / 300; c.save(); c.textBaseline = 'middle';
    const bw = W / 2 - 20 * u;
    bar(c, 10 * u, 12 * u, bw, 9 * u, myHp / 100, myHp < 30 ? '#ff5050' : '#40e8ff');
    bar(c, W - 10 * u - bw, 12 * u, bw, 9 * u, foeHp / rival.hp, rival.col, true);
    c.font = `800 ${8 * u}px Rubik, sans-serif`; c.fillStyle = '#fff'; c.textAlign = 'left'; c.fillText('YOU', 12 * u, 28 * u);
    c.textAlign = 'right'; c.fillText(rival.name, W - 12 * u, 28 * u);
    c.textAlign = 'center'; c.font = `800 ${12 * u}px Rubik, sans-serif`; c.fillText(String(score), W / 2, 16 * u);
    if (open > 0) { c.fillStyle = '#ffd040'; c.font = `800 ${14 * u}px Rubik, sans-serif`; c.fillText('OPEN! HIT HIM!', W / 2, H * .18); }
    if (foeState === 'wind' && koT <= 0) { c.fillStyle = foeSide === 'S' ? '#ff4040' : '#ff9a40'; c.font = `800 ${11 * u}px Rubik, sans-serif`; c.fillText(foeSide === 'S' ? 'SMASH! DODGE' : 'INCOMING', W / 2, H * .18); }
    if (msg) { c.globalAlpha = clamp(msg.l * 2, 0, 1); c.fillStyle = msg.col; c.font = `800 ${24 * u}px Rubik, sans-serif`; c.fillText(msg.txt, W / 2, H * .4); if (msg.sub) { c.font = `700 ${10 * u}px Rubik, sans-serif`; c.fillStyle = '#fff'; c.fillText(msg.sub, W / 2, H * .4 + 20 * u); } c.globalAlpha = 1; }
    if (t < 4) { c.fillStyle = '#ffffffd0'; c.font = `600 ${8.5 * u}px Rubik, sans-serif`; c.fillText('Tap left: jab · tap right: hook · swipe: dodge · hold: block', W / 2, H - 18 * u); }
    if (myGuard) { c.strokeStyle = '#40e8ff80'; c.lineWidth = 3 * u; c.strokeRect(4, 4, W - 8, H - 8); }
    c.restore();
  }
  const self = {
    reset() { timers.clear();
      if (!v) setup();
      for (const d of debris) v.scene.remove(d.o); debris = [];
      if (me) v.scene.remove(me); me = makeMech('#a8aeb8', '#40e8ff'); v.scene.add(me);
      myHp = 100; ri = 0; score = 0; t = 0; msg = { txt: 'ROUND 1', sub: 'FIGHT!', l: 1.6, col: '#fff' }; fingers = {}; keys = new Set(); cool = 0; dodgeT = 0; dodge = 0; hitFlash = 0; koT = 0; shake = 0; myGuard = false;
      newFoe(); sparks.clear(); smoke.clear(); built = true;
    },
    resize(w, h) { W = w; H = h; },
    update, draw,
    fx(dt) { if (v) anim(dt); },
    down(x, y, id = 0) { fingers[id] = { x0: x, y0: y, t0: t, hold: false, moved: 0, x }; },
    move(x, y, p, id = 0) { const f = fingers[id]; if (!f || !p) return; f.moved = Math.max(f.moved, Math.hypot(x - f.x0, y - f.y0)); f.x = x; if (f.moved > 28 && !f.used) { f.used = true; f.hold = false; dodge = x > f.x0 ? 1 : -1; dodgeT = .45; tone(500, { len: .08, wave: 'triangle', vol: .03, slide: 200 }); haptic('tick'); } },
    up(x, y, id = 0) { const f = fingers[id]; delete fingers[id]; if (!f || f.used) return; if (!f.hold && t - f.t0 < .26) punch(f.x0 < W / 2 ? 'L' : 'R'); },
    key(k, d) { if (d) keys.add(k); else keys.delete(k); if (!d) return; if (k === 'z' || k === 'ArrowUp') punch('L'); if (k === 'x' || k === ' ') punch('R'); if (k === 'ArrowLeft' || k === 'ArrowRight') { dodge = k === 'ArrowRight' ? 1 : -1; dodgeT = .45; } },
  };
  // a finger held still turns into a block
  const up0 = self.update; self.update = dt => { for (const f of Object.values(fingers)) if (!f.used && f.moved < 12 && t - f.t0 > .22) f.hold = true; up0(dt); };
  return self;
}

export default {
  id: 'mech-brawl',
  title: 'Mech Brawl',
  tag: 'Next Gen · Fighting',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,
  goal: 1500, reward: 25,
  hint: 'Box a giant mech in a stadium. Tap left to jab, tap right for a heavy hook. When the rival\'s fist glows, swipe to dodge or hold a thumb down to block (a red SMASH can only be dodged). Dodging leaves them open for double damage. Knock them out to face the next one.',
  traits: ['theme:scifi'],
  make,
};
