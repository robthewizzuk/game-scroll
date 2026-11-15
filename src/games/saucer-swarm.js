import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic, want } = gs.device;
const { rnd, clamp } = gs.util;
const { Brain, Wave } = gs.brains;
const FLIGHTS = ['drift', 'swerve', 'rush', 'hang'];
const { Particles, pbr, THREE } = gs.hd;
const { ARView, arNote, FLOOR } = gs.ar;
const { Group, Mesh, SphereGeometry, TorusGeometry, CylinderGeometry, ConeGeometry, Vector3 } = THREE;

// Saucer Swarm: flying saucers invade your room. They come in from in front and the sides, circle
// and creep closer; if one gets right up to you it zaps a shield. Turn the phone to put the
// crosshair on a saucer and tap to fire. Quick kills chain a combo.
// Enemies: chrome scouts, green zippers (small, fast, weaving), red tanks (big, take three hits),
// purple splitters (burst into two minis) and gold saucers (worth a lot, give a shield back).
// Shoot a blue power saucer to upgrade the laser for this run: Twin (two targets at once), then
// Mega (double damage, three targets, faster). Getting zapped drops a level. The shop sells a
// faster laser for good, and boosts to start on Twin or with an extra shield.
// Every fighting saucer flies by a Tiny Brains Wave: each one is a small experiment on one brain (with a
// memory), choosing a few times a second to drift as usual, swerve out from under your crosshair, rush
// in or hang back. Each feels how it went: shot down just before it reached you is the close call, shot
// the moment it showed up is dull. The brain moves towards the saucers that made the best fights for
// this player, and the win-rate rail keeps the swarm fair.
let W = 300, H = 460;
const SIDE = 1.45;   // saucers stay within this angle (radians) either side of straight ahead

// body colour, hit points, points, size, speed (approach and circling), when they start showing up (s)
const KINDS = {
  scout: { body: '#d8dde6', dome: '#8affdc', hp: 1, pts: 1, size: 1, speed: 1, from: 0, radar: '#ff4a6a' },
  zip: { body: '#3fd46a', dome: '#d8ffe0', hp: 1, pts: 2, size: .7, speed: 1.7, from: 8, radar: '#5ad86a' },
  tank: { body: '#b8332f', dome: '#ffb0a0', hp: 3, pts: 3, size: 1.45, speed: .6, from: 15, radar: '#ff7a3a' },
  split: { body: '#8a52f0', dome: '#e6d4ff', hp: 1, pts: 2, size: 1.1, speed: .9, from: 22, radar: '#b06aff' },
  mini: { body: '#c9a8ff', dome: '#ffffff', hp: 1, pts: 1, size: .6, speed: 1.4, from: 1e9, radar: '#c9a8ff' },
  gold: { body: '#ffcb4a', dome: '#fff0a0', hp: 2, pts: 5, size: 1, speed: 1, from: 0, radar: '#ffd24a' },
  power: { body: '#2a8cff', dome: '#bfe4ff', hp: 1, pts: 1, size: 1, speed: .75, from: 0, radar: '#4ab0ff' },
};
// laser levels for a run: targets hit per shot, damage, extra aim help (px), name
const LASER = [null, { n: 1, dmg: 1, help: 0, name: 'LASER' }, { n: 2, dmg: 1, help: 10, name: 'TWIN' }, { n: 3, dmg: 2, help: 18, name: 'MEGA' }];

let MT = null;
function looks() {
  if (MT) return MT;
  MT = {
    mats: {}, lights: pbr('#ff3a6a', { glow: 3 }), belly: pbr('#40e0ff', { glow: 2.5 }), dark: pbr('#2a2e36', { rough: .4, metal: .8 }),
    G: { disc: new SphereGeometry(1, 32, 16), dome: new SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), ring: new TorusGeometry(1, .06, 8, 40), cyl: new CylinderGeometry(1, 1, 1, 20), spike: new ConeGeometry(1, 1, 8) },
  };
  for (const [k, d] of Object.entries(KINDS)) MT.mats[k] = {
    body: pbr(d.body, { rough: k === 'scout' ? .14 : .22, metal: 1 }),
    dome: pbr(d.dome, { rough: .05, metal: .1, glow: k === 'power' ? 2.4 : 1.6, clear: 1, transparent: k === 'scout', opacity: .85 }),
  };
  return MT;
}
function makeSaucer(kind) {
  const m = looks(), G = m.G, g = new Group(), M = m.mats[kind];
  const disc = new Mesh(G.disc, M.body); disc.scale.set(.24, .06, .24);
  const dome = new Mesh(G.dome, M.dome); dome.scale.set(.1, .09, .1); dome.position.y = .03;
  const ring = new Mesh(G.ring, m.lights); ring.rotation.x = Math.PI / 2; ring.scale.set(.2, .2, .4); ring.position.y = -.005;
  const belly = new Mesh(G.cyl, m.belly); belly.scale.set(.07, .02, .07); belly.position.y = -.055;
  const fin = new Mesh(G.cyl, m.dark); fin.scale.set(.12, .02, .12); fin.position.y = -.035;
  const parts = [disc, dome, ring, belly, fin];
  if (kind === 'tank') for (let i = 0; i < 6; i++) {   // armour spikes round the rim
    const sp = new Mesh(G.spike, m.dark), a = i / 6 * Math.PI * 2; sp.scale.set(.02, .07, .02);
    sp.position.set(Math.cos(a) * .24, 0, Math.sin(a) * .24); sp.rotation.z = -Math.PI / 2; sp.rotation.y = -a; parts.push(sp);
  }
  if (kind === 'zip') { const tail = new Mesh(G.spike, M.dome); tail.scale.set(.04, .16, .04); tail.rotation.x = Math.PI / 2; tail.position.z = .26; parts.push(tail); }
  for (const p of parts) { p.castShadow = true; g.add(p); }
  g.scale.setScalar(1.7 * KINDS[kind].size);   // toy-sized: a scout is about 80 cm across
  g.userData.ring = ring;
  return g;
}

function make(api) {
  want('motion');
  let v, fx, smoke, saucers, t, score, shields, maxShields, combo, comboT, cool, spawnT, beams, hitFlash, hurt, kills, tap, level, minLevel, powerAt, note, noteT;
  const pool = {};   // spare saucer meshes by kind
  // the swarm's brain. see: 0 how close to your crosshair it is (1 right under it), 1 how far away (1 far),
  // 2 what it is (1 small and quick, -1 a tank), 3 your shields
  const swarm = new Brain(api, {
    name: 'saucer-swarm-flight', inputs: 4, actions: FLIGHTS, memory: true,
    // the teacher: zippers and minis swerve out from under the crosshair, the rest drift in as before
    teacher: s => s[0] > .6 && s[2] > 0 ? 'swerve' : 'drift',
    limits: { react: .15, perSecond: 5, minNoise: .06 },
  });
  const wave = new Wave(swarm), seeBuf = [0, 0, 0, 0], sp = new Vector3();
  const flies = s => s.kind !== 'gold' && s.kind !== 'power';   // bonus saucers just drift
  function setup() {
    v = new ARView();
    fx = new Particles(v, { max: 500, additive: true }); smoke = new Particles(v, { max: 140, additive: false });
  }
  function meshFor(kind) {
    const free = (pool[kind] ||= []).find(m => !m.visible);
    if (free) return free;
    const m = makeSaucer(kind); v.scene.add(m); pool[kind].push(m); return m;
  }
  function pick() {
    if (kills >= powerAt && level < 3 && !saucers.some(s => s.kind === 'power')) { powerAt = kills + 10; return 'power'; }
    if (Math.random() < .08 && !saucers.some(s => s.kind === 'gold')) return 'gold';
    const ok = ['scout', 'zip', 'tank', 'split'].filter(k => t >= KINDS[k].from);
    return Math.random() < .45 ? 'scout' : ok[Math.random() * ok.length | 0];
  }
  function add(kind, a, r, y) {
    const K = KINDS[kind], mesh = meshFor(kind); mesh.visible = true;
    const s = { kind, K, mesh, a, r, y, spin: (Math.random() < .5 ? -1 : 1) * rnd(.15, .4) * K.speed, in: (rnd(.28, .4) + t / 160) * K.speed, ph: rnd(0, 6), born: 0, hp: K.hp, mind: null, think: 0, flight: 'drift' };
    if (flies(s)) s.mind = wave.mind();
    saucers.push(s); pos(s, mesh.position); return s;
  }
  function spawn() {
    // only from in front and the sides, never behind you (0 = straight ahead when the round started); the first ones come from in front
    const a = kills + saucers.length < 2 ? rnd(-.35, .35) : rnd(-1, 1) * Math.min(SIDE - .1, .7 + t / 25);
    add(pick(), a, rnd(5.5, 7.5), rnd(-.5, 1.1));
  }
  function pos(s, out = new Vector3()) {
    const weave = s.kind === 'zip' ? Math.sin(s.ph * 3.2) * .35 : 0;
    return out.set(-Math.sin(s.a) * s.r, s.y + Math.sin(s.ph * 2) * .12 + weave, -Math.cos(s.a) * s.r);
  }
  function boom(p, kind) {
    const col = { gold: [3, 2.4, .6], power: [.6, 1.6, 3], zip: [.6, 3, 1], split: [2, .9, 3], mini: [2, 1.4, 3], tank: [3, .8, .4] }[kind] || [3, 1.4, .5];
    const n = kind === 'tank' ? 70 : 40;
    for (let i = 0; i < n; i++) fx.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-2.5, 2.5), vy: rnd(-1.5, 3), vz: rnd(-2.5, 2.5), life: rnd(.4, .9), size: rnd(.03, .07), col, drag: 2, grav: 4, floor: FLOOR });
    for (let i = 0; i < 10; i++) smoke.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-.5, .5), vy: rnd(0, .7), vz: rnd(-.5, .5), life: rnd(.8, 1.4), size: rnd(.12, .22), grow: 1.5, col: [.4, .4, .45], a: .5, drag: 1.5 });
  }
  function remove(s) { s.mesh.visible = false; saucers.splice(saucers.indexOf(s), 1); if (s.mind) { s.mind.done(); s.mind = null; } }
  // a saucer chooses how to fly a few times a second (its mind's own reaction time on top)
  function think(s, dt) {
    s.think -= dt; if (!s.mind || s.think > 0) return;
    pos(s, sp); const [sx, sy, z] = v.toScreen(sp.x, sp.y, sp.z);
    seeBuf[0] = z >= 1 ? -1 : clamp(1 - Math.hypot(sx - W / 2, sy - H / 2) / (W * .35), -1, 1);
    seeBuf[1] = clamp((s.r - 1.3) / 3.1 - 1, -1, 1);
    seeBuf[2] = s.kind === 'zip' || s.kind === 'mini' ? 1 : s.kind === 'tank' ? -1 : 0;
    seeBuf[3] = shields / maxShields * 2 - 1;
    s.mind.act(seeBuf, .2 - s.think); s.think = .2;
    const was = s.flight; s.flight = s.mind.action;
    if (s.flight === 'swerve' && was !== 'swerve') s.spin = -Math.sign(s.spin || 1) * Math.max(.45, Math.abs(s.spin) * 1.6);   // dart the other way
  }
  // how a saucer's life went, for its mind: shot down just short of you is the close call
  function felt(s, shot) { if (s.mind) s.mind.feel(!shot ? .1 : s.r < 2.4 ? 1 : s.r < 4 ? .4 : s.born < 1.5 ? -.3 : 0); }
  function say(s) { note = s; noteT = 1.4; }
  function setLevel(l) { level = Math.max(minLevel, Math.min(3, l)); }
  // how far from the crosshair (px) a saucer still counts as under it: its size on screen plus help
  function reach(s, help) { return .45 * s.K.size / s.r * (H / 2) / Math.tan(v.cam.fov * Math.PI / 360) + 16 + help; }
  function kill(s, bp) {
    combo = comboT > 0 ? Math.min(5, combo + 1) : 1; comboT = 1.6; kills++;
    score += s.K.pts * combo; api.score(score);
    if (s.kind === 'gold') { shields = Math.min(maxShields, shields + 1); say('+1 SHIELD'); }
    if (s.kind === 'power') { setLevel(level + 1); say(`${LASER[level].name} LASER!`); sfx(520, .25, 'triangle', .06, 600); }
    if (s.kind === 'split') for (const d of [-1, 1]) { const m = add('mini', s.a + d * .12, s.r, s.y + d * .15); m.spin = d * .5; }
    felt(s, true); boom(bp, s.kind); remove(s); hitFlash = .25;
    haptic(s.kind === 'gold' || s.kind === 'power' ? 'success' : s.kind === 'tank' ? 'heavy' : 'medium');
    sfx(s.kind === 'tank' ? 110 : 160, .3, 'square', .06, -100); if (combo > 1) sfx(500 + combo * 120, .1, 'triangle', .04, 200);
  }
  function fire() {
    if (cool > 0) return;
    const L = LASER[level]; cool = (api.has?.('rapid') ? .1 : .16) * (level === 3 ? .75 : 1);
    // the saucers closest to the crosshair, each within its own size on screen (plus a little help)
    const p = new Vector3(), hits = [];
    for (const s of saucers) {
      pos(s, p); const [sx, sy, z] = v.toScreen(p.x, p.y, p.z); if (z >= 1) continue;
      const d = Math.hypot(sx - W / 2, sy - H / 2); if (d < reach(s, L.help)) hits.push({ s, d, sx, sy });
    }
    hits.sort((a, b) => a.d - b.d); hits.length = Math.min(hits.length, L.n);
    sfx(level === 3 ? 900 : 1200, .09, 'sawtooth', .035, -900);
    if (!hits.length) { beams = [{ x: W / 2, y: H / 2, t: .1 }]; combo = 0; haptic('tick'); return; }
    beams = hits.map(h => ({ x: h.sx, y: h.sy, t: .12 }));
    for (const h of hits) {
      const s = h.s, bp = pos(s); s.hp -= L.dmg;
      if (s.hp > 0) { haptic('light'); for (let i = 0; i < 10; i++) fx.emit({ x: bp.x, y: bp.y, z: bp.z, vx: rnd(-1, 1), vy: rnd(-1, 1), vz: rnd(-1, 1), life: .3, size: .04, col: [3, 3, 2] }); continue; }
      kill(s, bp);
    }
  }
  return {
    reset() {
      v?.off(); v?.recenter();
      if (v) { fx.clear(); smoke.clear(); for (const k in pool) for (const m of pool[k]) m.visible = false; }
      maxShields = 3 + (api.has?.('shield') ? 1 : 0); minLevel = 1;
      for (const s of saucers || []) s.mind?.done();   // last round's saucers stop being experiments
      saucers = []; t = 0; score = 0; shields = maxShields; combo = 0; comboT = 0; cool = 0; spawnT = .6; beams = null; hitFlash = 0; hurt = 0; kills = 0; tap = null;
      level = api.has?.('twin') ? 2 : 1; powerAt = 6; note = null; noteT = 0;
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      if (!v) return; v.live(); if (v.calibrating) return;   // floor calibration open: pause
      t += dt; cool -= dt; comboT -= dt; noteT -= dt; hitFlash = Math.max(0, hitFlash - dt); hurt = Math.max(0, hurt - dt * 1.5);
      const cap = Math.min(8, 2 + Math.floor(t / 10));
      spawnT -= dt; if (spawnT <= 0 && saucers.length < cap) { spawn(); spawnT = Math.max(.5, 1.8 - t / 40); }
      const p = new Vector3();
      for (const s of [...saucers]) {
        s.born += dt; s.ph += dt;
        s.a += s.spin * dt / Math.max(1, s.r / 3);
        if (Math.abs(s.a) > SIDE) { s.a = Math.sign(s.a) * SIDE; s.spin = -s.spin; }   // turn back at your side
        think(s, dt);
        s.r -= s.in * dt * (s.flight === 'rush' ? 1.7 : s.flight === 'hang' ? .35 : 1);
        s.mesh.rotation.y += dt * (s.kind === 'zip' ? 6 : 3); s.mesh.rotation.z = Math.sin(s.ph * 1.7) * .15;
        pos(s, s.mesh.position);
        if (s.r < 1.3) {   // close enough to zap you
          pos(s, p); shields--; hurt = 1; haptic('error'); sfx(90, .4, 'sawtooth', .07, -40);
          for (let i = 0; i < 20; i++) fx.emit({ x: p.x, y: p.y, z: p.z, vx: -p.x * rnd(.5, 2), vy: -p.y * rnd(.5, 2), vz: -p.z * rnd(.5, 2), life: .5, size: .05, col: [3, .5, 1] });
          felt(s, false); remove(s); combo = 0;
          if (level > minLevel) { setLevel(level - 1); say(`${LASER[level].name} LASER`); }
          if (shields <= 0) { swarm.result(score >= 40); v.off(); return api.over(); }
        }
      }
      fx.update(dt); smoke.update(dt);
      if (beams) { for (const b of beams) b.t -= dt; if (beams.every(b => b.t <= 0)) beams = null; }
    },
    fx(dt) { if (v) { fx.update(dt); smoke.update(dt); } },
    draw(c) {
      if (!v) { setup(); this.reset(); }
      v.look(1 / 60);
      v.draw(c, W, H);
      // laser beams from both sides of the screen; colour by level
      if (beams) {
        const col = [null, ['#19e3b155', '#b0fff0'], ['#4ab0ff55', '#d0ecff'], ['#ff4ad855', '#ffd0f4']][level];
        c.save(); c.globalCompositeOperation = 'lighter';
        for (const b of beams) {
          const k = Math.max(0, b.t / .12);
          for (const [w, cl] of [[level === 3 ? 14 : 9, col[0]], [level === 3 ? 5 : 3, col[1]]]) { c.strokeStyle = cl; c.lineWidth = w * k + 1; c.beginPath(); c.moveTo(W / 2 - 40, H + 4); c.lineTo(b.x, b.y); c.moveTo(W / 2 + 40, H + 4); c.lineTo(b.x, b.y); c.stroke(); }
        }
        c.restore();
      }
      // crosshair: turns red when something is under it, wider with a better laser
      const L = LASER[level || 1], p = new Vector3(); let lock = false;
      for (const s of saucers || []) { pos(s, p); const [sx, sy, z] = v.toScreen(p.x, p.y, p.z); if (z < 1 && Math.hypot(sx - W / 2, sy - H / 2) < reach(s, L.help)) lock = true; }
      const cr = 16 + L.help * .5;
      c.save(); c.translate(W / 2, H / 2); c.strokeStyle = lock ? '#ff4a6a' : '#ffffffd0'; c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, cr, 0, 7); c.stroke();
      for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.beginPath(); c.moveTo(cr + 4, 0); c.lineTo(cr + 12, 0); c.stroke(); }
      c.fillStyle = c.strokeStyle; c.fillRect(-1.5, -1.5, 3, 3); c.restore();
      // edge arrows and radar
      v.pointers(c, W, H, (saucers || []).map(s => ({ p: pos(s), col: s.K.radar })));
      const rx = W / 2, ry = 46, rr = 26, hd = v.heading();
      c.save(); c.fillStyle = '#04110ecc'; c.strokeStyle = '#19e3b1aa'; c.lineWidth = 1.5; c.beginPath(); c.arc(rx, ry, rr, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#19e3b133'; c.beginPath(); c.moveTo(rx, ry); c.arc(rx, ry, rr, -Math.PI / 2 - .5, -Math.PI / 2 + .5); c.fill();
      for (const s of saucers || []) { const a = s.a - hd, d = Math.min(1, s.r / 8) * rr; c.fillStyle = s.K.radar; c.beginPath(); c.arc(rx - Math.sin(a) * d, ry - Math.cos(a) * d, s.kind === 'tank' ? 3.4 : 2.6, 0, 7); c.fill(); }
      c.fillStyle = '#fff'; c.fillRect(rx - 1.5, ry - 1.5, 3, 3); c.restore();
      // shields, laser level, combo, notes
      c.save(); c.font = '700 12px Rubik, sans-serif'; c.textAlign = 'left';
      for (let i = 0; i < maxShields; i++) { c.fillStyle = i < shields ? '#19e3b1' : '#ffffff30'; c.beginPath(); c.roundRect(14 + i * 20, 18, 16, 8, 3); c.fill(); }
      c.fillStyle = '#fff'; c.fillText('SHIELD', 14, 40);
      c.textAlign = 'right'; c.fillStyle = ['', '#8affdc', '#7cc4ff', '#ff8ae6'][level]; c.fillText(`${L.name}${level > 1 ? ' ' + '▲'.repeat(level - 1) : ''}`, W - 14, 26);
      if (combo > 1 && comboT > 0) { c.font = '800 18px Rubik, sans-serif'; c.fillStyle = '#ffd24a'; c.fillText('x' + combo, W - 14, 74); }
      if (noteT > 0 && note) { c.textAlign = 'center'; c.font = '800 20px Rubik, sans-serif'; c.globalAlpha = Math.min(1, noteT * 2); c.lineWidth = 4; c.strokeStyle = '#000a'; c.strokeText(note, W / 2, H * .3); c.fillStyle = '#fff'; c.fillText(note, W / 2, H * .3); c.globalAlpha = 1; }
      c.restore();
      if (hurt > 0) { const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .7); g.addColorStop(0, '#ff000000'); g.addColorStop(1, `rgba(255,30,60,${hurt * .6})`); c.fillStyle = g; c.fillRect(0, 0, W, H); }
      arNote(c, v, W, H);
    },
    // gyro: tap anywhere fires at once. No gyro: drag to look, a tap (no drag) fires.
    down(x, y, id) { if (v?.input?.('down', x, y, id)) return; if (v?.sensor) return fire(); tap = { x, y, id, moved: 0 }; },
    move(x, y, pressed, id) { if (v?.input?.('move', x, y, id, pressed)) return; if (!pressed || !tap || tap.id !== id || v.sensor) return; v.drag(x - tap.x, y - tap.y); tap.moved += Math.abs(x - tap.x) + Math.abs(y - tap.y); tap.x = x; tap.y = y; },
    up(x, y, id) { if (v?.input?.('up', x, y, id)) return; if (tap && tap.id === id && tap.moved < 10 && !v.sensor) fire(); tap = null; },
  };
}

export default {
  id: 'saucer-swarm',
  title: 'Saucer Swarm',
  tag: 'AR · Shooter',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 40, reward: 20,
  hint: 'Flying saucers invade your room through the camera. Turn your phone to aim the crosshair and tap to zap them before they reach you. Watch for fast green zippers, armoured red tanks and purple splitters. Shoot a blue saucer to upgrade your laser; gold ones restore a shield. No camera? Drag to look around.',
  shop: [
    { id: 'rapid', name: 'Rapid Laser', price: 120, kind: 'unlock', desc: 'Your laser recharges faster, for good.' },
    { id: 'twin', name: 'Twin Start', price: 30, kind: 'boost', desc: 'Start the next run with the Twin laser.' },
    { id: 'shield', name: 'Extra Shield', price: 25, kind: 'boost', desc: 'A fourth shield for the next run.' },
  ],
  traits: ['theme:scifi'],
  make,
};
