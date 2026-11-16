import gs from '../gamescroll.js';
const { sounds, noise, tone } = gs.sound;
const { haptic, want } = gs.device;
const { clamp, rnd } = gs.util;
const { Particles, pbr, rbox, surface, speckle, THREE } = gs.hd;
const { ARView, arNote, FLOOR } = gs.ar;
const { Brain } = gs.brains;
const STARES = ['short', 'usual', 'long', 'back'];
const { Group, Mesh, Vector3, Quaternion, SphereGeometry, ConeGeometry, CapsuleGeometry, CylinderGeometry } = THREE;

// Freeze Rex: a dinosaur has wandered into your room. You feel its footsteps through the phone, and
// you want photos: tap to snap one (bigger, closer and centred scores more). But it only sees
// movement. When it stops and sniffs, FREEZE: hold the phone dead still until it looks away. Move
// while it's watching and it charges. A photo while it's staring scores triple, if you dare.
// How long it stares comes from a Tiny Brains rival with a memory: each time it stops it picks a short
// look, its usual one, a long stare, or a glance back (it looks away, then whips round again soon after),
// from how still you keep, how often you dare a photo and how far you've got. It feels each stare: the
// one you only just held your nerve through is the thrill, an easy one is dull. Its memory keeps which
// stare gave this player a close call, and the win-rate rail keeps it fair.
let W = 300, H = 460;
const HEIGHT = 2.3;

let MT = null;
function looks() {
  if (MT) return MT;
  const scales = surface(256, ({ col, h, r, size: S }) => {
    col.fillStyle = '#4f7a3a'; col.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 10) for (let x = (y / 10 % 2) * 6; x < S; x += 12) { h.fillStyle = '#d0d0d0'; h.beginPath(); h.arc(x, y, 5, 0, 7); h.fill(); col.fillStyle = Math.random() < .3 ? '#3a5a2a' : '#5a8a42'; col.beginPath(); col.arc(x, y, 4.5, 0, 7); col.fill(); }
    for (let i = 0; i < 26; i++) { col.fillStyle = '#2a4420'; col.globalAlpha = .5; col.beginPath(); col.ellipse(rnd(0, S), rnd(0, S), rnd(8, 20), rnd(4, 9), rnd(0, 3), 0, 7); col.fill(); }   // stripes
    col.globalAlpha = 1; speckle(col, S, 600, '#a8c870', 1.2, .3); r.fillStyle = '#a0a0a0'; r.fillRect(0, 0, S, S);
  }, { strength: 2.5 });
  MT = { skin: pbr('#ffffff', { tex: scales.repeat(2, 2), rough: .65, sheen: .4 }), belly: pbr('#d8c890', { rough: .7 }), mouth: pbr('#8a2a2a', { rough: .6 }), tooth: pbr('#f2ead8', { rough: .3 }),
    eye: pbr('#ffd040', { glow: .6, rough: .1 }), eyeHot: pbr('#ff2020', { glow: 4 }), claw: pbr('#2a2420', { rough: .3 }) };
  return MT;
}
function makeRex() {
  const m = looks(), g = new Group(), body = new Group(); g.add(body);
  const S = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, par = body) => { const o = new Mesh(geo, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; par.add(o); return o; };
  const sph = new SphereGeometry(1, 24, 16);
  S(sph, m.skin, 0, 1.5, 0, .75, .7, 1.25); S(sph, m.belly, 0, 1.3, .25, .6, .55, .9);
  const neck = new Group(); neck.position.set(0, 1.95, .9); body.add(neck);
  S(sph, m.skin, 0, .2, .2, .38, .45, .45, neck);
  const head = new Group(); head.position.set(0, .55, .5); neck.add(head);
  S(rbox(.6, .5, 1.1, .2), m.skin, 0, 0, .3, 1, 1, 1, head);
  const jaw = new Group(); jaw.position.set(0, -.2, -.1); head.add(jaw); S(rbox(.52, .16, 1, .07), m.skin, 0, -.05, .45, 1, 1, 1, jaw); S(rbox(.46, .05, .9, .02), m.mouth, 0, .04, .45, 1, 1, 1, jaw);
  const cone = new ConeGeometry(.035, .12, 5);
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) { const t = S(cone, m.tooth, s * .22, -.24, .1 + i * .12, 1, 1, 1, head); t.rotation.x = Math.PI; }
  const eyes = [-1, 1].map(s => S(new SphereGeometry(.07, 10, 8), m.eye, s * .27, .14, .05, 1, 1, 1, head));
  // tail: a chain of shrinking segments that sways
  const tail = []; let par = body, z = -1.1, y = 1.55;
  for (let i = 0; i < 6; i++) { const seg = new Group(); seg.position.set(0, i ? 0 : y, i ? -.42 : z); par.add(seg); S(sph, m.skin, 0, 0, -.2, .42 - i * .06, .38 - i * .055, .32, seg); tail.push(seg); par = seg; }
  const legs = [-1, 1].map(s => { const hip = new Group(); hip.position.set(s * .45, 1.35, -.1); body.add(hip); S(sph, m.skin, 0, -.2, 0, .32, .55, .42, hip); const shin = new Group(); shin.position.set(0, -.7, -.05); hip.add(shin); S(new CapsuleGeometry(.13, .55, 4, 8), m.skin, 0, -.3, .05, 1, 1, 1, shin); S(rbox(.3, .1, .45, .05), m.skin, 0, -.66, .2, 1, 1, 1, shin); for (const cx of [-.1, 0, .1]) S(cone, m.claw, cx, -.68, .45, 1, 1, 1, shin).rotation.x = Math.PI / 2; return hip; });
  for (const s of [-1, 1]) { const arm = S(new CapsuleGeometry(.05, .25, 3, 6), m.skin, s * .42, 1.65, .95, 1, 1, 1); arm.rotation.x = .9; }
  g.userData = { body, neck, head, jaw, eyes, tail, legs };
  return g;
}

function make(api) {
  want('motion');
  let v, rex, dust, flashFx, built;
  let state, sT, target, lives, score, t, susp, freezes, msg, flash, tap, lastQ, lastP, motion, stepT, level, shots, charge, heading, snapT;
  const tmp = new Vector3(), tq = new Quaternion();
  // how this player faces it, kept across rounds: how still they keep (-1 rock still .. 1 shaky), how often
  // they dare a photo while it stares; and this stare's closest call (suspicion at its highest)
  const nerve = { shaky: 0, dare: -.5 };
  let peak = 0, stare = 'usual', backSoon = false, daredNow = false;
  // see: 0..1 the habits above, 2 how far into the round (looks survived)
  const see = () => [nerve.shaky, nerve.dare, clamp(freezes / 8, 0, 1) * 2 - 1];
  const rexMind = new Brain(api, {
    name: 'freeze-rex-stare', inputs: 3, actions: STARES, memory: true, target: .8,
    // the teacher: a long stare for someone who keeps very still, a glance back at a daring photographer
    teacher: s => s[0] < -.4 ? 'long' : s[1] > .2 ? 'back' : 'usual',
    limits: { react: .1, perSecond: 10, minNoise: .1 },
  });
  // a stare is over: what it learns (a stare you only just held still through is the close call)
  function stared(survived) {
    rexMind.feel(!survived ? .1 : peak > .55 ? 1 : peak > .25 ? .4 : -.2);
    rexMind.result(survived);
    nerve.dare += ((daredNow ? 1 : -1) - nerve.dare) * .25;
  }

  function setup() {
    v = new ARView();
    rex = makeRex(); rex.scale.setScalar(HEIGHT / 2.9); v.scene.add(rex);
    dust = new Particles(v, { max: 200, additive: false }); flashFx = new Particles(v, { max: 60, additive: true });
  }
  const eye = () => v.eyePos;
  function pickSpot() {   // somewhere round you on the floor, 3 to 5.5 m away, mostly in front and to the sides
    const a = (v.sensor ? v.heading() : 0) + rnd(-1.4, 1.4), d = rnd(3, 5.5), e = eye();
    return new Vector3(e.x - Math.sin(a) * d, FLOOR, e.z - Math.cos(a) * d);
  }
  function say(txt, col = '#fff', l = 1.2, sub) { msg = { txt, col, l, sub }; }
  function setState(s) {
    state = s; sT = 0;
    if (s === 'walk') { target = pickSpot(); }
    if (s === 'sniff') { tone(110, { len: .5, wave: 'sawtooth', vol: .05, slide: 60 }); noise(.4, { vol: .05, from: 900, to: 200 }); haptic('warning'); }
    if (s === 'look') {
      susp = 0; sT = 0; peak = 0; daredNow = false; this_look = rnd(2, 3.2) + Math.min(2, level * .25);
      rexMind.act(see(), 1); stare = rexMind.action; backSoon = stare === 'back';
      // a low skill (you've been caught a lot) stares a little less
      this_look *= (stare === 'short' ? .65 : stare === 'long' ? 1.35 : 1) * (1.1 - .2 * rexMind.skill);
    }
    if (s === 'charge') { noise(1.2, { vol: .16, from: 1500, to: 60 }); tone(90, { len: 1, wave: 'sawtooth', vol: .1, slide: -40 }); haptic('error'); say('IT SAW YOU!', '#ff3030', 2); charge = rex.position.clone(); }
  }
  let this_look = 3;
  function snap() {
    if (state === 'charge' || snapT > 0 || !v) return;   // the camera winds on between photos, so mashing the shutter doesn't pay
    snapT = 1.5; flash = 1; tone(2200, { len: .03, wave: 'square', vol: .05 }); noise(.08, { vol: .06, from: 6000, to: 3000, filter: 'highpass' }); haptic('light');
    // how good is the photo: rex on screen, how big, how centred
    rex.userData.head.getWorldPosition(tmp); const [hx, hy, hz] = v.toScreen(tmp.x, tmp.y, tmp.z); const [fx, fy, fz] = v.toScreen(rex.position.x, rex.position.y, rex.position.z);
    if (hz > 1 || fz > 1 || hx < 0 || hx > W || hy < 0 || hy > H) { say('MISSED IT', '#ffffffb0', .8); return; }
    const size = Math.abs(fy - hy) / H, cen = 1 - Math.min(1, Math.hypot((hx + fx) / 2 - W / 2, (hy + fy) / 2 - H / 2) / (Math.min(W, H) * .6));
    let pts = Math.round(10 + size * 140 * (.4 + cen * .6)); const brave = state === 'look';
    if (brave) { pts *= 3; susp += .35; daredNow = true; }
    score += pts; shots++; api.score(score); say(brave ? `BRAVE SHOT +${pts}` : `+${pts}`, brave ? '#ffd040' : '#8affdc', 1, size > .45 ? 'FRAME FILLER!' : size > .25 ? 'NICE AND CLOSE' : 'GET CLOSER');
  }
  function update(dt) {
    if (!v) return; v.live(); if (v.calibrating) { lastQ = null; return; }
    t += dt; sT += dt; snapT = Math.max(0, snapT - dt); flash = Math.max(0, flash - dt * 2.5); if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
    // how much is the phone moving? turn rate (rad/s), plus walking speed in world mode
    v.look(dt);
    if (lastQ) { const ang = 2 * Math.acos(Math.min(1, Math.abs(lastQ.dot(v.cam.quaternion)))); const mv = lastP.distanceTo(v.cam.position); motion = motion * .7 + (ang / dt + mv / dt * 1.5) * .3; }
    lastQ = (lastQ || new Quaternion()).copy(v.cam.quaternion); lastP = (lastP || new Vector3()).copy(v.cam.position);
    if (tap?.dragging) motion = Math.max(motion, 1);   // no gyro: dragging the view is moving
    const u = rex.userData; let speed = 0;
    if (state === 'walk') {
      tmp.copy(target).sub(rex.position); tmp.y = 0; const d = tmp.length();
      if (d > .2) { const want = Math.atan2(tmp.x, tmp.z); heading += ((want - heading + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 2.5); speed = 1.1 + level * .08; rex.position.x += Math.sin(heading) * speed * dt; rex.position.z += Math.cos(heading) * speed * dt; }
      if (sT > (backSoon ? .9 : rnd(3, 5) - Math.min(1.5, level * .15)) || (d < .3 && sT > 2)) { backSoon = false; setState('sniff'); }
    } else if (state === 'sniff') {
      // turns to face you
      tmp.copy(eye()).sub(rex.position); const want = Math.atan2(tmp.x, tmp.z); heading += ((want - heading + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 4);
      if (sT > Math.max(.6, 1.1 - level * .05)) setState('look');
    } else if (state === 'look') {
      const dead = .14 - Math.min(.05, level * .006);
      if (motion > dead) susp += (motion - dead) * dt * 3.2;
      susp = Math.max(0, susp - dt * .08); peak = Math.max(peak, susp);
      nerve.shaky += (clamp(motion / .28 * 2 - 1, -1, 1) - nerve.shaky) * Math.min(1, dt * .5);
      if (susp >= 1) { stared(false); setState('charge'); }
      else if (sT > this_look) { stared(true); freezes++; level++; score += 50; api.score(score); say('IT LOOKED AWAY', '#8affdc', 1, `+50 · ${freezes} FREEZE${freezes > 1 ? 'S' : ''}`); haptic('success'); setState('walk'); }
    } else if (state === 'charge') {
      tmp.copy(eye()).sub(rex.position); tmp.y = 0; const d = tmp.length(); heading = Math.atan2(tmp.x, tmp.z); speed = 6;
      if (d > .9) { rex.position.addScaledVector(tmp.normalize(), speed * dt); } else if (sT > .2) { flash = .7; haptic('heavy'); v.off(); return api.over(); }
      if (sT > 2.5) { v.off(); return api.over(); }
    }
    // body animation
    rex.rotation.y = heading;
    const cyc = t * (speed > 3 ? 9 : 5.5); const walking = speed > 0;
    u.legs[0].rotation.x = walking ? Math.sin(cyc) * .5 : 0; u.legs[1].rotation.x = walking ? -Math.sin(cyc) * .5 : 0;
    u.body.position.y = walking ? Math.abs(Math.cos(cyc)) * .06 : Math.sin(t * 2) * .015;
    u.tail.forEach((s, i) => { s.rotation.y = Math.sin(t * 2 - i * .5) * (.06 + i * .02); s.rotation.x = .05; });
    const watching = state === 'look' || state === 'sniff' || state === 'charge';
    // head tracks the phone when watching
    u.neck.rotation.x = watching ? -.25 : Math.sin(t * 1.3) * .1 + .1; u.jaw.rotation.x = state === 'charge' ? .7 : state === 'sniff' ? Math.abs(Math.sin(t * 9)) * .2 : .05;
    for (const e of u.eyes) e.material = state === 'look' || state === 'charge' ? looks().eyeHot : looks().eye;
    // footsteps: felt more the closer it is
    if (walking) { stepT -= dt; if (stepT <= 0) { stepT = Math.PI / (speed > 3 ? 9 : 5.5); const d = rex.position.distanceTo(eye()); haptic(d < 3 ? 'heavy' : d < 4.5 ? 'medium' : 'light'); tone(55, { len: .12, wave: 'sine', vol: clamp(.14 - d * .015, .03, .12) }); for (let i = 0; i < 4; i++) dust.emit({ x: rex.position.x + rnd(-.3, .3), y: FLOOR + .05, z: rex.position.z + rnd(-.3, .3), vx: rnd(-.4, .4), vy: rnd(.1, .4), vz: rnd(-.4, .4), life: .9, size: .12, grow: 2, col: [.6, .55, .5], a: .4, drag: 2 }); } }
    dust.update(dt); flashFx.update(dt);
  }
  function draw(c) {
    if (!v) { setup(); this_reset(); }
    v.draw(c, W, H);
    v.pointers(c, W, H, [{ p: tmp.copy(rex.position).setY(FLOOR + 1.2), col: state === 'look' ? '#ff4040' : '#8affdc' }]);
    const u = Math.min(W, H) / 300; c.save(); c.textBaseline = 'middle'; c.textAlign = 'center';
    // viewfinder corners
    c.strokeStyle = '#ffffffa0'; c.lineWidth = 2; const m = 26, L = 18;
    for (const [x, y, dx, dy] of [[m, m + 40, 1, 1], [W - m, m + 40, -1, 1], [m, H - m - 40, 1, -1], [W - m, H - m - 40, -1, -1]]) { c.beginPath(); c.moveTo(x, y + dy * L); c.lineTo(x, y); c.lineTo(x + dx * L, y); c.stroke(); }
    c.fillStyle = '#04110ecc'; c.beginPath(); c.roundRect(10, 10, 110, 36, 10); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = '800 16px Rubik, sans-serif'; c.fillText(String(score), 20, 24); c.font = '600 9px Rubik, sans-serif'; c.fillStyle = '#8affdc'; c.fillText(`${shots} PHOTOS · ${freezes} FREEZES`, 20, 38);
    // freeze meter
    if (state === 'look' || state === 'sniff') {
      c.textAlign = 'center'; c.fillStyle = '#ff4a3a'; c.font = '800 28px Rubik, sans-serif'; c.fillText(state === 'sniff' ? 'FREEZE!' : "DON'T MOVE", W / 2, 76);
      if (state === 'look') { const bw = W * .55; c.fillStyle = '#00000080'; c.beginPath(); c.roundRect(W / 2 - bw / 2, 92, bw, 10, 5); c.fill(); c.fillStyle = susp > .6 ? '#ff3030' : '#ffb040'; c.beginPath(); c.roundRect(W / 2 - bw / 2, 92, Math.max(10, bw * Math.min(1, susp)), 10, 5); c.fill(); c.fillStyle = '#fff'; c.font = '600 9px Rubik, sans-serif'; c.fillText('IT SEES MOVEMENT', W / 2, 112); }
    }
    if (msg) { c.textAlign = 'center'; c.globalAlpha = Math.min(1, msg.l * 2); c.lineWidth = 4; c.strokeStyle = '#000a'; c.font = '800 22px Rubik, sans-serif'; c.strokeText(msg.txt, W / 2, H * .3); c.fillStyle = msg.col; c.fillText(msg.txt, W / 2, H * .3); if (msg.sub) { c.font = '600 11px Rubik, sans-serif'; c.fillStyle = '#fff'; c.fillText(msg.sub, W / 2, H * .3 + 20); } c.globalAlpha = 1; }
    // shutter button
    c.fillStyle = snapT > 0 ? '#ffffff50' : '#ffffffd0'; c.beginPath(); c.arc(W / 2, H - 70, 24, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(W / 2, H - 70, 30, -Math.PI / 2, -Math.PI / 2 + (1 - snapT / 1.5) * Math.PI * 2); c.stroke();
    if (t < 5 && shots === 0) { c.fillStyle = '#fff'; c.font = '600 12px Rubik, sans-serif'; c.fillText('Tap to take photos · when it sniffs, FREEZE', W / 2, H - 118); }
    c.restore();
    if (flash > 0) { c.fillStyle = `rgba(255,255,255,${flash * .8})`; c.fillRect(0, 0, W, H); }
    arNote(c, v, W, H);
  }
  function this_reset() {
    v?.off(); v?.recenter();
    lives = 1; score = 0; t = 0; susp = 0; freezes = 0; backSoon = false; peak = 0; msg = null; flash = 0; tap = null; lastQ = null; motion = 0; stepT = 0; level = 0; shots = 0; heading = 0; snapT = 0;
    if (v) { const e = { x: 0, z: 0 }; rex.position.set(e.x + rnd(-1, 1), FLOOR, e.z - 5); dust.clear(); state = 'walk'; sT = 0; target = new Vector3(rnd(-1.5, 1.5), FLOOR, -4); }
  }
  return {
    reset: this_reset,
    resize(w, h) { W = w; H = h; },
    update,
    draw,
    fx(dt) { if (v) dust.update(dt); },
    down(x, y, id) { if (v?.input?.('down', x, y, id)) return; tap = { x, y, x0: x, y0: y, id, dragging: false }; },
    move(x, y, pressed, id) { if (v?.input?.('move', x, y, id, pressed)) return; if (!tap || tap.id !== id || !pressed) return; if (Math.hypot(x - tap.x0, y - tap.y0) > 12) tap.dragging = true; if (!v.sensor) v.drag(x - tap.x, y - tap.y); tap.x = x; tap.y = y; },
    up(x, y, id) { if (v?.input?.('up', x, y, id)) return; if (tap && tap.id === id && !tap.dragging) snap(); tap = null; },
  };
}

export default {
  id: 'freeze-rex',
  title: 'Freeze Rex',
  tag: 'AR · Stealth',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 1200, reward: 20,
  hint: 'A dinosaur stomps round your room through the camera, and you feel every footstep. Tap to take photos: closer and centred scores more. When it stops to sniff, FREEZE and hold the phone dead still until it looks away, or it charges. No camera? Drag to look around.',
  traits: ['theme:dino'],
  make,
};
