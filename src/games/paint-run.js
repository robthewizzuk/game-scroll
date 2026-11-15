import gs from '../gamescroll.js';
const { sfx } = gs.sound, { haptic } = gs.device, { clamp, rnd } = gs.util, { Feel } = gs.effects, { Ready } = gs.rounds;
const { View, G, part, grp, blob, flat, THREE } = gs.toon;
const { Group } = THREE;
const text = gs.pixel.text;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

// Paint Run: a drop of paint runs down a sheet of paper on a giant desk. You are always one colour.
// A wall of your own colour bursts when you run into it (and bursts in a row are worth more); a wall
// of any other colour hurts. Run under a paint shower to change colour. Gold-framed walls are a big
// bonus if you arrive in the right colour. Jump the rulers and the puddles of thinner.
const LANE = 1.15, FAR = 40;
const INK = ['#e8503c', '#3a7ae0', '#f2c230'], NAME = ['RED', 'BLUE', 'YELLOW'];
let W = 176, H = 176;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // own sounds and buzzes
  const ready = new Ready();                                             // the first tap starts the run, and does nothing else
  let objs, lane, lx, jumpT, speed, dist, pts, lives, t, nextZ, inv, msg, dead, sw, col, streak;
  const proj = (x, z, y = 0) => { const [sx, sy] = view3d().toScreen(x * LANE, y * 1.1, -z); return { x: sx, y: sy }; };
  let v3;
  function view3d() {
    if (!v3) {
      v3 = new View({ bg: '#f6efdc', fog: ['#f6efdc', 16, FAR], sun: [-.5, 1, .6], sunI: 2.2, amb: 1.15 });
      v3.add(part(G.plane, '#d9c49a', { sx: 60, sz: 120, z: -50, line: false }), part(G.plane, '#fdfbf4', { sx: 3.7, sz: 120, z: -50, y: .005, line: false }));
      for (const sx of [-1, 1]) v3.add(part(G.box, '#e8b860', { sx: .25, sy: .1, sz: 120, x: sx * 1.97, y: .05, z: -50 }));
      v3.def('rule', () => part(G.plane, '#a9c6ee', { sx: 3.7, sz: .07, line: false }));
      const mark = (k, z) => k === 0 ? [part(G.box, '#ffffff', { sx: .6, sy: .16, sz: .03, y: .9, z, line: false })]
        : k === 1 ? [part(G.cyl, '#ffffff', { sx: .26, sy: .03, sz: .26, y: .9, z, rx: Math.PI / 2, line: false })]
        : [-1, 1].map(s => part(G.cyl, '#ffffff', { sx: .13, sy: .03, sz: .13, x: s * .22, y: .9, z, rx: Math.PI / 2, line: false }));
      INK.forEach((c, k) => {
        v3.def('wall' + k, () => grp(part(G.box, c, { sx: 1.02, sy: 1.7, sz: .14, y: .85 }), ...mark(k, .08)));
        v3.def('gold' + k, () => grp(part(G.box, c, { sx: .9, sy: 1.58, sz: .14, y: .85 }), ...mark(k, .08), part(G.box, '#f8d048', { sx: 1.1, sy: .1, sz: .2, y: 1.72, glow: .4 }), ...[-1, 1].map(s => part(G.box, '#f8d048', { sx: .1, sy: 1.76, sz: .2, x: s * .5, y: .88, glow: .4 }))));
        v3.def('arch' + k, () => grp(...[-1, 1].map(s => part(G.cyl, '#8a8a96', { sx: .06, sy: 2, sz: .06, x: s * .52, y: 1 })), part(G.box, c, { sx: 1.2, sy: .24, sz: .3, y: 2.05 }), part(G.box, flat(c, .4), { sx: .98, sy: 1.9, sz: .02, y: .98 }), ...[-1, 0, 1].map(s => part(G.ball, c, { sx: .08, sy: .14, sz: .08, x: s * .3, y: 1.84 - Math.abs(s) * .1, line: false }))));
        v3.def('run' + k, () => {
          const g = new Group(), l = [-1, 1].map(s => { const leg = new Group(); leg.position.set(s * .12, .34, 0); leg.add(part(G.pill, '#3a3040', { sx: .14, sy: .26, sz: .14, y: -.16 })); return leg; });
          g.add(...l, part(G.ball, c, { sx: .34, sy: .4, sz: .3, y: .7 }), part(G.cone, c, { sx: .17, sy: .34, sz: .17, y: 1.18 }), part(G.ball, '#ffffff', { s: .07, x: -.13, y: .88, z: .22, line: false }));
          g.userData.l = l; return g;
        });
        v3.def('crayon' + k, () => grp(part(G.cyl, c, { sx: .24, sy: 1.7, sz: .24, y: .85 }), part(G.cyl, '#fbf3e0', { sx: .25, sy: .5, sz: .25, y: .7 }), part(G.cone, c, { sx: .24, sy: .5, sz: .24, y: 1.95 })));
      });
      v3.def('pot', () => grp(part(G.cyl, '#b8bcc8', { sx: .5, sy: .7, sz: .5, y: .35 }), part(G.cyl, '#46b85a', { sx: .44, sy: .04, sz: .44, y: .71, line: false })));
      v3.def('drop', () => grp(part(G.ball, '#ffffff', { s: .15, glow: .5 }), part(G.cone, '#ffffff', { sx: .1, sy: .2, sz: .1, y: .2, glow: .5 })));
      v3.def('hurdle', () => grp(part(G.box, '#f0c860', { sx: 3.5, sy: .32, sz: .08, y: .22 }), ...[-3, -2, -1, 0, 1, 2, 3].map(i => part(G.box, '#6a4a20', { sx: .03, sy: .16, sz: .02, x: i * .5, y: .3, z: .05, line: false }))));
      v3.def('spill', () => part(G.disc, '#4a3a5a', { sx: .5, sz: .5, y: .012, line: false }));
      v3.def('blob', () => blob(1, .28));
    }
    v3.persp(W, H, 58, .1, 80); return v3;
  }
  const shuffled = () => shuffle([0, 1, 2]);
  function spawn(z) {
    const r = Math.random(), lvl = Math.min(1, dist / 1500), L = [-1, 0, 1][Math.random() * 3 | 0];
    if (r < .28) shuffled().forEach((c, i) => objs.push({ k: 'wall', c, lane: i - 1, z }));                // one of each: find your colour
    else if (r < .42) { const cs = shuffled(), n = 1 + (Math.random() * 2 | 0), ls = shuffled(); for (let i = 0; i < n; i++) objs.push({ k: 'wall', c: cs[i], lane: ls[i] - 1, z }); }
    else if (r < .58) { const c = Math.random() * 3 | 0, other = [-1, 0, 1].filter(l => l !== L)[Math.random() * 2 | 0]; objs.push({ k: 'arch', c, lane: L, z }, { k: 'wall', c, gold: true, lane: other, z: z + 7 }); }
    else if (r < .68) shuffled().forEach((c, i) => objs.push({ k: 'arch', c, lane: i - 1, z }));
    else if (r < .78 + lvl * .05) objs.push({ k: 'hurdle', lane: 0, z });
    else if (r < .86 + lvl * .05) objs.push({ k: 'spill', lane: L, z, len: 2.2 });
    else for (let i = 0; i < 5; i++) objs.push({ k: 'drop', lane: L, z: z + i * .9, y: 0 });
    if (Math.random() < .35) for (let i = 0; i < 3; i++) objs.push({ k: 'drop', lane: [-1, 0, 1][Math.random() * 3 | 0], z: z + 2.5 + i * .9, y: .4 });
  }
  const air = () => jumpT > 0 ? Math.sin(Math.PI * (1 - jumpT / .62)) : 0;
  function hurt(txt) {
    if (inv > 0) return; lives--; inv = 1.6; streak = 0; haptic('heavy'); sfx(130, .3, 'sawtooth', .05, -60); msg = { txt, l: 1 }; feel.juice.shake(4);
    if (lives <= 0) { dead = .01; sfx(100, .7, 'square', .05, -40); }
  }
  const score = () => api.score(pts + Math.floor(dist / 10));
  const self = {
    reset() {
      objs = []; lane = 0; lx = 0; jumpT = 0; speed = 9; dist = 0; pts = 0; lives = 3; t = 0; nextZ = 14; inv = 0; dead = 0; sw = null; msg = null;
      col = Math.random() * 3 | 0; streak = 0; feel.clear(); ready.reset();
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); t += dt;
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.2) api.over(); return; }
      if (!ready.update(dt)) return;
      speed = Math.min(18, 9 + dist / 180); const dz = speed * dt; dist += dz;
      inv = Math.max(0, inv - dt); if (jumpT > 0) jumpT = Math.max(0, jumpT - dt);
      lx += (lane - lx) * (1 - Math.pow(1e-6, dt));
      for (const o of objs) o.z -= dz;
      nextZ -= dz; if (nextZ < FAR) { spawn(nextZ); nextZ += rnd(5.5, 9) - Math.min(2.5, dist / 800); }
      const y = air(), me = Math.round(lx);
      for (const o of objs) {
        if (o.done) continue;
        if (o.k === 'spill') { if (o.z < .2 && o.z + o.len > -.2 && o.lane === me && y < .15) { o.done = true; hurt('SLIPPED'); } continue; }
        if (o.k === 'hurdle') { if (Math.abs(o.z) < .3 && y < .3) { o.done = true; hurt('TRIPPED'); } continue; }
        if (o.z > .5 || o.z < -.5 || o.lane !== me) continue;
        const p = proj(o.lane, Math.max(o.z, 0), .8);
        if (o.k === 'drop') { if (Math.abs(y - o.y) < .55) { o.done = true; pts++; sfx(1300, .04, 'square', .03, 300); } continue; }
        if (o.k === 'arch') { o.done = true; if (col !== o.c) { col = o.c; msg = { txt: NAME[col], l: .7 }; feel.juice.burst(p.x, p.y, { n: 14, speed: 80, life: .5, size: 2, color: [INK[col], '#ffffff'] }); sfx(520, .12, 'sine', .05, 400); haptic('medium'); } continue; }
        o.done = true;                                        // a wall
        if (o.c === col) {
          streak++; const n = (o.gold ? 15 : 5) + Math.min(5, streak - 1); pts += n;
          feel.juice.burst(p.x, p.y, { n: o.gold ? 22 : 12, speed: 110, life: .5, size: 2, color: [INK[col], '#ffffff'] }).pop(p.x, p.y - 12, '+' + n, { color: o.gold ? '#f8d048' : '#ffffff' });
          sfx(o.gold ? 880 : 420 + Math.min(5, streak) * 60, .1, 'square', .05, 200); haptic(o.gold ? 'success' : 'medium');
        } else { feel.juice.burst(p.x, p.y, { n: 10, speed: 90, life: .4, size: 2, color: [INK[o.c], '#3a3040'] }); hurt('WRONG COLOUR'); }
      }
      objs = objs.filter(o => o.z + (o.len || 0) > -2 && !(o.done && o.k !== 'spill' && o.k !== 'arch' && o.k !== 'hurdle'));
      score();
    },
    fx(dt) { feel.update(dt); t += dt; },
    draw(c) {
      const v = view3d(); v.frame();
      for (let z = -(dist % 2) - 2; z < FAR; z += 2) v.put('rule', [0, .01, -z]);
      for (let z = -(dist % 4) - 4; z < FAR; z += 4) for (const sd of [-1, 1]) {
        const i = Math.floor((z + dist) / 4) * 2 + (sd > 0);
        if (i % 5 === 0) v.put('pot', [sd * 3, 0, -z]); else v.put('crayon' + ((i % 3) + 3) % 3, [sd * (2.7 + (i % 2) * .5), 0, -z], { rz: sd * ((i % 4) - 1.5) * .06 });
      }
      for (const o of objs) {
        if (o.z > FAR) continue;
        const X = o.lane * LANE, Z = -o.z;
        if (o.k === 'spill') { v.put('spill', [X, 0, Z - o.len / 2], { sz: o.len }); continue; }
        if (o.k === 'hurdle') { v.put('hurdle', [0, 0, Z]); continue; }
        if (o.k === 'arch') { v.put('arch' + o.c, [X, 0, Z]); continue; }
        if (o.done) continue;
        if (o.k === 'drop') { v.put('drop', [X, .45 + o.y * 1.1 + Math.sin(t * 4 + o.z) * .06, Z], { ry: t * 3 + o.z }); continue; }
        v.put((o.gold ? 'gold' : 'wall') + o.c, [X, 0, Z]);
      }
      const y = air(), run = v.put('run' + col, [lx * LANE, y * 1.1, 0], { sy: 1 + (jumpT > 0 ? .12 : Math.sin(t * 14) * .04) });
      const sw2 = ready.playing ? Math.sin(t * 14) : 0; run.userData.l[0].rotation.x = sw2 * .8; run.userData.l[1].rotation.x = -sw2 * .8;
      run.visible = !(inv > 0 && (t * 14 | 0) % 2);
      v.put('blob', [lx * LANE, .03, 0], { s: .42 * (1 - Math.min(.5, y * .4)) });
      v.cam.position.set(lx * LANE * .3, 3, 5.4); v.cam.lookAt(lx * LANE * .15, 0, -8);
      v.render(c, W, H);
      feel.begin(c); feel.end(c, W, H);
      // HUD: lives, and the colour you are now with its mark
      for (let i = 0; i < 3; i++) { c.fillStyle = '#3a3040'; c.fillRect(3 + i * 9, 3, 8, 8); c.fillStyle = i < lives ? '#ffffff' : '#8a8494'; c.fillRect(4 + i * 9, 4, 6, 6); }
      c.fillStyle = '#3a3040'; c.fillRect(W - 17, 3, 14, 14); c.fillStyle = INK[col]; c.fillRect(W - 16, 4, 12, 12); c.fillStyle = '#ffffff';
      if (col === 0) c.fillRect(W - 14, 9, 8, 2); else if (col === 1) { c.fillRect(W - 12, 7, 4, 6); c.fillRect(W - 13, 8, 6, 4); } else { c.fillRect(W - 14, 8, 3, 3); c.fillRect(W - 9, 8, 3, 3); }
      if (streak >= 2) text(c, 'x' + streak, W - 20, 7, { color: '#3a3040', align: 'right' });
      if (msg) text(c, msg.txt, W / 2, Math.round(H * .4), { color: '#ffffff', align: 'center', shadow: '#3a3040' });
      ready.draw(c, W, H, { text: 'TAP TO RUN', pixel: true, color: '#ffffff', shadow: '#3a3040', y: Math.round(H * .4) });
    },
    down(x, y) { if (ready.go() || dead) return; sw = { x, y, t, used: false }; },
    move(x, y, p) {
      if (!p || !sw || sw.used || dead) return; const dx = x - sw.x, dy = y - sw.y;
      if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy)) { sw.used = true; lane = clamp(lane + Math.sign(dx), -1, 1); sfx(400, .03, 'square', .03); haptic('tick'); }
      else if (dy < -16 && Math.abs(dy) > Math.abs(dx)) { sw.used = true; self.jump(); }
    },
    up() { if (sw && !sw.used && t - sw.t < .3) self.jump(); sw = null; },
    jump() { if (jumpT <= 0 && !dead && ready.playing) { jumpT = .62; sfx(500, .08, 'square', .04, 400); haptic('light'); } },
    key(k, d) {
      if (!d) return; if (ready.go() || dead) return;
      if (k === 'ArrowLeft') lane = Math.max(-1, lane - 1); if (k === 'ArrowRight') lane = Math.min(1, lane + 1);
      if (k === 'ArrowUp' || k === ' ') self.jump();
    },
  };
  return self;
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'paint-run', title: 'Paint Run', tag: 'Console · Runner', retro: true, era: 'console', pal: 'lemon', w: 176, h: 176, maxW: 260, maxH: 320, goal: 250, music: 'chase',
  hint: 'Swipe left or right to change lanes, tap or swipe up to jump. Run through walls of your own colour and dodge the others. A paint shower changes your colour.',
  make,
};
