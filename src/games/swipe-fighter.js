import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { View, G, part, grp, blob, flat, THREE } = gs.toon;
const { Group } = THREE;
const { Brain } = gs.brains;
const CHOICES = ['jab', 'heavy', 'sweep', 'guard', 'back'];
const teleHigh = flat('#ff4848', .35), teleLow = flat('#4890ff', .35);

// A one-on-one arena fighter built for thumbs. Tap to jab, swipe forward for a heavy blow, swipe
// down to sweep low, swipe up to hop, swipe back to step away, and hold still to guard. Guard
// stops jabs and heavies but not sweeps; hop over sweeps. Rivals flash before they strike: red
// means guard, blue means hop. Hit them while they wind up for a double-damage counter.
// Up close, each rival's choice (jab, heavy, sweep, guard, step back) comes from a Tiny Brains rival
// with a memory. Its teacher is the old dice roll; it sees how you fight (how often you guard and hop,
// whether you're winding up, the health bars) and feels each move: a sweep you hop or a blow you block
// at the last moment is the thrill, a swing at thin air is dull. Its memory keeps which move gave this
// player a close fight from where, and the win-rate rail keeps it fair (it thinks slower while you lose).
const MOVES = {
  jab: { wind: .1, act: .1, rec: .15, dmg: 4, reach: 26, kind: 'high' },
  heavy: { wind: .32, act: .12, rec: .35, dmg: 11, reach: 34, kind: 'high', push: 20 },
  sweep: { wind: .26, act: .12, rec: .4, dmg: 8, reach: 32, kind: 'low', down: true },
};
const RIVALS = [
  { name: 'BRAWN', col: '#c84838', skin: '#e8b080', speed: .75, aggro: .7 },
  { name: 'VEX', col: '#4878d0', skin: '#f0c8a0', speed: .9, aggro: .9 },
  { name: 'KOJI', col: '#38a048', skin: '#d8a070', speed: 1.05, aggro: 1.1 },
  { name: 'MARA', col: '#a848c8', skin: '#f8d0b0', speed: 1.2, aggro: 1.3 },
  { name: 'IRONJAW', col: '#808890', skin: '#c89060', speed: 1.35, aggro: 1.5 },
];
let W = 192, H = 160;

function make(api) {
  let you, foe, rival, ko, t, parts, msg, dead, sw, between, flash, wins;
  // how this player fights, kept across bouts: how often they guard and hop (-1 never .. 1 a lot)
  const habit = { guard: 0, hop: -.5 };
  // see: 0..1 the habits above, 2 what you're doing now (1 winding up, -1 recovering), 3 your health, 4 the rival's
  const see = () => [habit.guard, habit.hop, you.st === 'wind' ? 1 : you.st === 'rec' || you.stun > 0 ? -1 : 0, you.hp / you.max * 2 - 1, foe.hp / foe.max * 2 - 1];
  const mind = new Brain(api, {
    name: 'swipe-fighter-rival', inputs: 5, actions: CHOICES, memory: true,
    // the teacher is the old dice roll
    teacher: () => { const r = Math.random(); return r < .3 ? 'jab' : r < .55 ? 'heavy' : r < .78 ? 'sweep' : r < .9 ? 'guard' : 'back'; },
    limits: { react: .1, perSecond: 10, minNoise: .06 },
  });
  const floor = () => H - 22;
  const mk = (x, dir, col, skin) => ({ x, dir, hp: 60, max: 60, st: 'idle', mv: null, tt: 0, guard: false, air: 0, down: 0, stun: 0, col, skin, hitDone: false });
  function startFight() { const r = RIVALS[wins % RIVALS.length], lap = Math.floor(wins / RIVALS.length); rival = { ...r, speed: r.speed + lap * .2, aggro: r.aggro + lap * .3 }; foe = mk(W * .7, -1, r.col, r.skin); foe.hp = foe.max = 50 + wins * 6; foe.think = .8; you.x = W * .3; you.st = 'idle'; you.mv = null; between = 1.4; msg = { txt: `VS ${rival.name}`, l: 1.4 }; }
  function act(f, name) { if (f.st !== 'idle' || f.down > 0 || f.stun > 0 || f.air > 0) return false; f.st = 'wind'; f.mv = name; f.tt = 0; f.hitDone = false; f.guard = false; if (name === 'heavy') f.x += f.dir * 10; return true; }
  let v3;
  const limb = (col, len, w, fist) => { const g = new Group(); g.add(part(G.pill, col, { sx: w, sy: len, sz: w, y: -len / 2 })); if (fist) g.add(part(G.ball, fist, { s: w * .7, y: -len })); return g; };
  function rig(col, skin) {
    const g = new Group(), hips = new Group(); hips.position.y = 14; g.add(hips);
    const torso = new Group(); hips.add(torso);
    torso.add(part(G.box, col, { sx: 9, sy: 12, sz: 6, y: 7 }), part(G.box, '#302030', { sx: 9.4, sy: 2, sz: 6.4, y: 1 }), part(G.ball, skin, { s: 4.5, y: 17.5 }));
    torso.add(part(G.ball, col, { sx: 4.8, sy: 2, sz: 4.8, y: 19.5 }), part(G.ball, '#14101c', { s: .7, x: 1.6, y: 18, z: 4, line: false }), part(G.ball, '#14101c', { s: .7, x: -1.6, y: 18, z: 4, line: false }));
    const arms = [-1, 1].map(sx => { const a = limb(skin, 9, 2.6, skin); a.position.set(sx * 5.5, 11.5, 0); torso.add(a); return a; });
    const legs = [-1, 1].map(sx => { const l = limb('#302030', 14, 3.2, '#201820'); l.position.set(sx * 2.4, 0, 0); hips.add(l); return l; });
    const tele = part(G.ball, teleHigh, { s: 20, y: 18, line: false }); g.add(tele);
    g.userData = { hips, torso, arms, legs, tele }; return g;
  }
  function pose(u, f) {
    const { hips, torso, arms, legs } = u; hips.rotation.set(0, 0, 0); hips.position.y = 14; torso.rotation.set(0, 0, 0);
    legs[0].rotation.set(.25, 0, 0); legs[1].rotation.set(-.25, 0, 0);
    // guard-up boxing stance by default: fists in front of the face
    arms[0].rotation.set(-2.2, 0, .2); arms[1].rotation.set(-1.9, 0, -.2);
    if (f.down > 0) { hips.rotation.x = -Math.PI / 2; hips.position.y = 3; return; }
    const crouch = f.mv === 'sweep' && f.st !== 'wind';
    if (f.guard && f.st === 'idle') { arms[0].rotation.set(-2.6, 0, .7); arms[1].rotation.set(-2.6, 0, -.7); torso.rotation.x = .15; }
    else if (f.st === 'act' || (f.st === 'rec' && f.tt < .1)) {
      if (f.mv === 'sweep') { hips.position.y = 8; legs[1].rotation.set(-1.5, 0, 0); legs[0].rotation.set(.9, 0, 0); torso.rotation.x = -.3; }
      else if (f.mv === 'heavy') { arms[1].rotation.set(-1.6, 0, 0); torso.rotation.x = .3; arms[1].scale.y = 1.4; }
      else { arms[0].rotation.set(-1.57, 0, 0); arms[0].scale.y = 1.3; }
    } else if (f.st === 'wind') { torso.rotation.y = -.6; arms[1].rotation.set(-.6, 0, -.3); if (crouch || f.mv === 'sweep') hips.position.y = 10; }
    if (!(f.st === 'act' || f.st === 'rec')) { arms[0].scale.y = arms[1].scale.y = 1; }
    if (f.air > 0) { legs[0].rotation.x = .9; legs[1].rotation.x = -.4; }
    if (f.stun > 0) torso.rotation.z = Math.sin(t * 12) * .2;
  }
  function view3d() {
    if (!v3) {
      v3 = new View({ bg: '#20142c', sun: [-.5, .9, .8], sunI: 2.4, amb: .9, sky: '#c0a0ff', ground: '#402030' });
      v3.def('arena', () => {
        const g = new Group();
        g.add(part(G.box, '#a07858', { sx: 260, sy: 4, sz: 70, y: -2, z: -10 }), part(G.box, '#c09068', { sx: 200, sy: .6, sz: 34, y: .1, z: 0, line: false }));
        g.add(part(G.box, '#2a1c38', { sx: 300, sy: 160, sz: 4, y: 70, z: -60, line: false }));
        for (let i = -3; i <= 3; i++) { g.add(part(G.box, '#48385a', { sx: 22, sy: 46, sz: 6, x: i * 32, y: 70, z: -52 })); g.add(part(G.box, '#f8c040', { sx: 8, sy: 2, sz: 1, x: i * 32, y: 48, z: -48.5, glow: .8, line: false })); }
        for (let i = 0; i < 26; i++) g.add(part(G.ball, ['#5a4070', '#6a4a80', '#4a3460'][i % 3], { sx: 4, sy: 5, sz: 4, x: -110 + i * 9, y: 10 + (i % 2) * 3, z: -36 }));
        for (const sx of [-1, 1]) { g.add(part(G.box, '#e04040', { sx: 3, sy: 22, sz: 3, x: sx * 100, y: 11, z: -6 })); g.add(part(G.box, '#f8f0e0', { sx: 200, sy: 1, sz: 1, y: 12 + sx * 4, z: -6, line: false })); }
        return g;
      });
      for (const r of [...RIVALS, { col: '#e8e8f0', skin: '#f0c090' }]) v3.def('fighter:' + r.col + r.skin, () => rig(r.col, r.skin));
      v3.def('blob', () => blob(1, .4));
    }
    v3.side(W, H, 40, 0, H * .45); return v3;
  }
  function burst(x, y, col) { for (let i = 0; i < 8; i++) parts.push({ x, y, vx: rnd(-60, 60), vy: rnd(-70, 10), l: .35, col }); }
  function strike(a, b) {
    const m = MOVES[a.mv], d = Math.abs(a.x - b.x); if (d > m.reach || a.hitDone) return; a.hitDone = true;
    if (m.kind === 'low' && b.air > 0) { if (a === foe) mind.feel(1); burst(b.x, floor() - 4, '#ffffff'); return; }   // you hopped its sweep
    if (m.kind === 'high' && b.guard && b.st === 'idle') { if (a === foe) mind.feel(.6); b.x += a.dir * 6; sfx(900, .05, 'square', .03); parts.push({ txt: 'BLOCK', x: b.x, y: floor() - 46, l: .6, col: '#a0c8ff' }); if (b === you) haptic('light'); a.st = 'rec'; a.tt = 0; return; }
    const counter = b.st === 'wind', dmg = m.dmg * (counter ? 2 : 1);
    if (a === foe) mind.feel(.2); else if (counter) mind.feel(1);   // its blow landed; or you read its wind-up and countered
    b.hp -= dmg; b.st = 'idle'; b.mv = null; b.stun = .3 + (counter ? .25 : 0); b.guard = false; b.x += a.dir * (m.push || 6); if (m.down) b.down = .8;
    burst(b.x, floor() - (m.kind === 'low' ? 6 : 30), counter ? '#f8e040' : '#ffffff'); parts.push({ txt: counter ? `COUNTER ${dmg}` : `${dmg}`, x: b.x, y: floor() - 50, l: .7, col: counter ? '#f8e040' : '#f8f8f0' });
    flash = .08; sfx(counter ? 160 : 220, .12, 'square', .06, -80); haptic(b === you ? 'heavy' : counter ? 'success' : 'medium');
  }
  function step(f, o, dt) {
    f.stun = Math.max(0, f.stun - dt); f.down = Math.max(0, f.down - dt);
    if (f.air > 0) { f.air += dt; if (f.air > .55) f.air = 0; }
    if (f.st !== 'idle') { const m = MOVES[f.mv]; f.tt += dt; const sp = f === foe ? rival.speed : 1;
      if (f.st === 'wind' && f.tt >= m.wind / sp) { f.st = 'act'; f.tt = 0; sfx(f.mv === 'jab' ? 500 : 300, .05, 'square', .03, -100); }
      else if (f.st === 'act') { strike(f, o); if (f.tt >= m.act) { if (f === foe && !f.hitDone) mind.feel(-.3); f.st = 'rec'; f.tt = 0; } }   // a swing at thin air
      else if (f.st === 'rec' && f.tt >= m.rec / sp) { f.st = 'idle'; f.mv = null; } }
    f.x = clamp(f.x, 12, W - 12); f.dir = o.x > f.x ? 1 : -1;
    if (Math.abs(f.x - o.x) < 16) { const push = (16 - Math.abs(f.x - o.x)) / 2; f.x -= f.dir * push; }
  }
  function ai(dt) {
    foe.think -= dt; const d = Math.abs(foe.x - you.x);
    if (foe.st === 'idle' && !foe.stun && !foe.down) {
      // react to your wind-ups sometimes, based on aggression
      if (you.st === 'wind' && foe.think < .3 && Math.random() < .03 * rival.aggro) { if (you.mv === 'sweep') foe.air = .01; else foe.guard = true; }
      if (foe.think <= 0) {
        foe.guard = false; foe.think = rnd(.35, .9) / rival.aggro * (1.15 - .3 * mind.skill);
        if (d > 32) { foe.walk = rnd(.25, .6); }
        else {
          habit.guard += ((you.guard ? 1 : -1) - habit.guard) * .15;
          mind.act(see(), 1); const c = mind.action;
          if (c === 'guard') { foe.guard = true; foe.think = .6; mind.feel(0); }
          else if (c === 'back') { foe.back = .3; mind.feel(0); }
          else act(foe, c);
        }
      }
      if (foe.walk > 0) { foe.walk -= dt; foe.x += foe.dir * 40 * rival.speed * dt; }
      if (foe.back > 0) { foe.back -= dt; foe.x -= foe.dir * 50 * dt; }
    }
  }
  const self = {
    reset() { you = mk(W * .3, 1, '#e8e8f0', '#f0c090'); you.hp = you.max = 70; wins = 0; t = 0; parts = []; dead = 0; sw = null; flash = 0; ko = 0; startFight(); },
    resize(w, h) { const s = w / W; W = w; H = h; if (you) { you.x *= s; foe.x *= s; } },
    update(dt) {
      t += dt; flash = Math.max(0, flash - dt); for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; } else p.y -= 14 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.5) api.over(); return; }
      if (between > 0) { between -= dt; return; }
      if (ko) { ko += dt; if (ko > 1.6) { ko = 0; wins++; api.score(wins); you.hp = Math.min(you.max, you.hp + 25); startFight(); } return; }
      if (sw && !sw.used && t - sw.t > .16 && you.st === 'idle') you.guard = true;
      if (you.walk) { you.x += you.walk * 60 * dt; }
      step(you, foe, dt); ai(dt); step(foe, you, dt);
      if (foe.hp <= 0) { foe.hp = 0; ko = .01; mind.result(true); msg = { txt: 'K.O.!', l: 1.5 }; haptic('success'); sfx(880, .5, 'square', .05, 400); }
      else if (you.hp <= 0) { you.hp = 0; dead = .01; mind.result(false); msg = { txt: 'DOWN AND OUT', l: 9 }; haptic('error'); sfx(110, .7, 'sawtooth', .05, -40); }
    },
    draw(c) {
      const v = view3d(); v.frame();
      v.put('arena', v.sv(W / 2, floor()), { sx: W / 192 });
      for (const f of [foe, you]) {
        const air = f.air > 0 ? Math.sin(f.air / .55 * Math.PI) * 22 : 0, o = v.put('fighter:' + f.col + f.skin, v.sv(f.x, floor() - air, 0), { s: 1.35, ry: f.dir > 0 ? Math.PI / 2 : -Math.PI / 2 });
        pose(o.userData, f); o.userData.tele.visible = f === foe && f.st === 'wind'; if (o.userData.tele.visible) o.userData.tele.material = MOVES[f.mv].kind === 'low' ? teleLow : teleHigh;
        v.put('blob', v.sv(f.x, floor(), 0), { s: 12 * (f.air > 0 ? .7 : 1) });
      }
      v.render(c, W, H);
      if (flash > 0) { c.fillStyle = '#f8f8f0a0'; c.fillRect(0, 0, W, H); }
      for (const f of [foe, you]) if (f.stun > 0) { c.fillStyle = '#f8e040'; for (let i = 0; i < 3; i++) c.fillRect(f.x - 6 + ((t * 20 + i * 4) % 12), floor() - 40 - i, 2, 2); }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { if (p.txt) { c.fillStyle = '#000'; c.fillText(p.txt, p.x + 1, p.y + 1); c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); } else { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); } }
      // health bars
      const bw = W / 2 - 14;
      c.fillStyle = '#100818'; c.fillRect(4, 4, bw + 2, 7); c.fillRect(W - bw - 6, 4, bw + 2, 7);
      c.fillStyle = you.hp / you.max < .3 ? '#f84848' : '#f8d040'; c.fillRect(5, 5, bw * you.hp / you.max, 5);
      c.fillStyle = '#f8d040'; const fw = bw * foe.hp / foe.max; c.fillRect(W - 5 - fw, 5, fw, 5);
      c.fillStyle = '#f8f8f0'; c.textAlign = 'left'; c.fillText('YOU', 5, 19); c.textAlign = 'right'; c.fillText(rival.name, W - 5, 19);
      c.textAlign = 'center'; c.fillStyle = '#f8d040'; c.fillText(`${wins}`, W / 2, 10);
      if (msg) { c.fillStyle = '#000a'; c.fillRect(0, H * .4 - 10, W, 14); c.fillStyle = dead ? '#f86060' : '#f8f8f0'; c.fillText(msg.txt, W / 2, H * .4); }
      if (t < 9 && !msg) { c.fillStyle = '#000a'; c.fillRect(0, H - 20, W, 18); c.fillStyle = '#f8f8f0'; c.fillText('TAP JAB · SWIPE FWD HEAVY', W / 2, H - 12); c.fillText('DOWN SWEEP · UP HOP · HOLD GUARD', W / 2, H - 4); }
    },
    down(x, y) { sw = { x, y, t, used: false }; },
    move(x, y, p) {
      if (!p || !sw || sw.used || dead) return; const dx = x - sw.x, dy = y - sw.y; if (Math.hypot(dx, dy) < 16) return; sw.used = true; you.guard = false;
      if (Math.abs(dx) > Math.abs(dy)) { if (Math.sign(dx) === you.dir) self.cmd('heavy'); else self.cmd('back'); } else self.cmd(dy > 0 ? 'sweep' : 'hop');
    },
    up() { if (sw && !sw.used && t - sw.t < .16) self.cmd('jab'); you.guard = false; you.walk = 0; sw = null; },
    cmd(c2) {
      if (dead || ko || between > 0) return;
      habit.hop += ((c2 === 'hop' ? 1 : -1) - habit.hop) * .15;
      if (c2 === 'hop') { if (you.st === 'idle' && you.air === 0 && !you.down) { you.air = .01; sfx(500, .05, 'square', .03, 200); } return; }
      if (c2 === 'back') { if (you.st === 'idle') { you.x -= you.dir * 20; sfx(300, .04, 'square', .02); } return; }
      if (act(you, c2)) haptic('tick');
    },
    key(k, d) { if (k === 'ArrowDown' && d) self.cmd('sweep'); if (k === 'ArrowUp' && d) self.cmd('hop'); if (k === 'x' && d) self.cmd('heavy'); if (k === 'z' && d) self.cmd('jab'); if (k === 'c') you.guard = d; if (k === 'ArrowRight') you.walk = d ? 1 : 0; if (k === 'ArrowLeft') you.walk = d ? -1 : 0; },
  };
  return self;
}

export default {
  id: 'swipe-fighter', title: 'Swipe Fighter', tag: 'Console · Fighting', retro: true, era: 'console', pal: 'berry', w: 192, h: 160, maxW: 300, maxH: 240, goal: 5,
  hint: 'Tap to jab, swipe toward your rival for a heavy blow, swipe down to sweep, swipe up to hop, swipe away to step back, and hold still to guard. Guard stops jabs and heavies but not sweeps, so hop those. Red flash means guard, blue means hop. Hit a rival while they wind up for a double-damage counter.',
  make,
};
