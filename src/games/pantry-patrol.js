import gs from '../gamescroll.js';
const { sfx } = gs.sound, { haptic } = gs.device, { clamp, rnd } = gs.util, { glow } = gs.gfx, { Feel } = gs.effects, { Ready } = gs.rounds;
const { View, G, part, grp, blob, THREE } = gs.toon;
const { Group } = THREE;
const text = gs.pixel.text;

// Pantry Patrol: it is night in the larder and raccoons are after your pies. They creep up the
// room in the dark, but freeze wide-eyed while your torch is on them. Drag to point the torch, hold
// it on a raccoon until it stares, then let go: your camera flashes and every staring raccoon in the
// beam runs for it. The big bandit needs three flashes. Never flash a skunk: it sprays, and a pie is
// ruined. Each raccoon that reaches the table takes a pie.
const KINDS = {
  sneak: { hp: 1, sp: .085, w: 17, h: 15, model: 'raccoon' },
  kit: { hp: 1, sp: .17, w: 12, h: 11, model: 'raccoon', zig: true },
  bandit: { hp: 3, sp: .06, w: 20, h: 30, model: 'bandit' },
  skunk: { hp: 1, sp: .07, w: 17, h: 14, model: 'skunk' },
};
let W = 176, H = 176;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // own sounds and buzzes
  const ready = new Ready({ eat: false });                               // the raid starts when you first point the torch
  let foes, pies, raid, score, t, light, charge, msg, dead, held, toSpawn, spawnT, stink, restT;
  const hor = () => H * .38, flo = () => H - 8, beam = () => Math.max(W, H) * .2;
  const proj = (x, z) => { const s = 1 / (1 + z * 3.2); return { x: W / 2 + x * W * .5 * s, y: hor() + (flo() - hor()) * s, s }; };
  const mid = f => { const p = proj(f.x, f.z); return { x: p.x, y: p.y - f.h * p.s * 1.3 }; };
  const lit = f => { const p = mid(f); return Math.hypot(p.x - light.x, p.y - light.y) < beam() + f.w * proj(f.x, f.z).s; };
  function newRaid() {
    raid++; const n = 3 + raid;
    toSpawn = Array.from({ length: n }, (_, i) => { const r = Math.random(); return raid > 3 && i === n - 1 && r < .6 ? 'bandit' : raid > 1 && r < .2 ? 'skunk' : r < .7 || raid < 3 ? 'sneak' : 'kit'; });
    spawnT = 1; restT = 0; msg = { txt: 'RAID ' + raid, l: 1.2 };
  }
  // a 3D camera that matches proj() exactly: eye 1.6 up, nearest floor (z = 0) 1.2 ahead
  let v3, camKey;
  function cam() {
    const hc = 1.6, d0 = 1.2, f = (flo() - hor()) * d0 / hc, xs = W * .5 * hc / (flo() - hor()), key = W + ',' + H;
    if (camKey !== key) {
      camKey = key; const Hf = 2 * (H - hor()), c = v3.persp(W, H, 2 * Math.atan(Hf / 2 / f) * 180 / Math.PI, .05, 40).cam;
      c.position.set(0, hc, 0); c.lookAt(0, hc, -1); c.aspect = W / Hf; c.setViewOffset(W, Hf, 0, Hf / 2 - hor(), W, H); c.updateProjectionMatrix();
    }
    return { f, xs, d0 };
  }
  function view3d() {
    if (!v3) {
      v3 = new View({ bg: '#0c1020', fog: ['#0c1020', 3.5, 8], sun: [.3, 1, .8], sunI: 1.9, amb: .95, sky: '#a8b8e8', ground: '#302418' });
      v3.def('larder', () => {
        const g = new Group(), L = 7, zc = -1.2 - L / 2, jars = ['#e04848', '#f0c030', '#48a858', '#a060d0', '#f08830'];
        g.add(part(G.box, '#8a6038', { sx: 2, sy: .05, sz: L, y: -.025, z: zc }), part(G.box, '#cbb894', { sx: .1, sy: 3, sz: L, x: -1.05, y: 1.5, z: zc }), part(G.box, '#cbb894', { sx: .1, sy: 3, sz: L, x: 1.05, y: 1.5, z: zc }), part(G.box, '#3a3040', { sx: 2.2, sy: .1, sz: L, y: 3, z: zc }));
        g.add(part(G.box, '#b8a480', { sx: 2.2, sy: 3, sz: .1, y: 1.5, z: -1.2 - L }), part(G.box, '#2a1c14', { sx: .5, sy: .5, sz: .12, y: .25, z: -1.2 - L + .02 }));     // the back wall and the hole they come in by
        for (let i = 0; i < 9; i++) g.add(part(G.box, '#74502e', { sx: 2, sy: .06, sz: .04, z: -1.2 - i * .6, line: false }));
        for (const sx of [-1, 1]) for (let s = 0; s < 3; s++) {
          const y = .75 + s * .62; g.add(part(G.box, '#6a4a2a', { sx: .3, sy: .06, sz: L, x: sx * .88, y, z: zc }));
          for (let i = 0; i < 8; i++) { const k = (i + s * 2 + (sx > 0)) % 5; g.add(k === 4 ? part(G.box, jars[(i + s) % 5], { sx: .16, sy: .2, sz: .22, x: sx * .88, y: y + .13, z: -1.7 - i * .8 - s * .2 }) : part(G.cyl, jars[k], { sx: .08, sy: .22, sz: .08, x: sx * .88, y: y + .14, z: -1.7 - i * .8 - s * .2 })); }
        }
        return g;
      });
      const hit = (g, h) => { const f = part(G.box, '#ffffff', { sx: 1.2, sy: h, sz: 1.3, y: h / 2, glow: 1, opacity: .7, line: false }); f.visible = false; g.add(f); g.userData.flash = f; return g; };
      const eyes = (g, col, y, z, dx) => { g.userData.eyes = [-1, 1].map(s => part(G.ball, col, { s: .07, x: s * dx, y, z, glow: 1, line: false })); g.add(...g.userData.eyes); };
      const tail = (a, b) => [0, 1, 2, 3].map(i => part(G.ball, i % 2 ? b : a, { s: .17 - i * .015, y: .5 + i * .16, z: -.75 - i * .08 }));
      // models are one unit wide and one tall, facing the camera; put() sizes them
      v3.def('raccoon', () => {
        const g = grp(part(G.ball, '#8a8a94', { sx: .5, sy: .42, sz: .75, y: .45 }), part(G.ball, '#a4a4ae', { s: .33, y: .62, z: .62 }), part(G.box, '#2a2a34', { sx: .5, sy: .13, sz: .1, y: .67, z: .9, line: false }), part(G.ball, '#2a2a34', { s: .05, y: .55, z: .96, line: false }), ...tail('#8a8a94', '#2a2a34'), blob(.6, .35));
        for (const s of [-1, 1]) { g.add(part(G.cone, '#6a6a74', { s: .11, x: s * .2, y: .95, z: .58 })); for (const z of [-.35, .4]) g.add(part(G.box, '#4a4a54', { sx: .14, sy: .3, sz: .14, x: s * .3, y: .15, z })); }
        eyes(g, '#f8e040', .68, .95, .13); return hit(g, 1);
      });
      v3.def('bandit', () => {
        const g = grp(part(G.pill, '#8a8a94', { sx: .7, sy: .5, sz: .6, y: .42 }), part(G.ball, '#a4a4ae', { s: .27, y: .8, z: .08 }), part(G.box, '#2a2a34', { sx: .46, sy: .09, sz: .1, y: .83, z: .3, line: false }), part(G.ball, '#c8b080', { s: .26, x: .42, y: .5, z: -.2 }), ...tail('#8a8a94', '#2a2a34').map(m => { m.position.y -= .35; m.position.z += .3; return m; }), blob(.6, .35));
        for (const s of [-1, 1]) { g.add(part(G.cone, '#6a6a74', { s: .09, x: s * .17, y: 1.05, z: .05 })); g.add(part(G.box, '#4a4a54', { sx: .2, sy: .16, sz: .26, x: s * .2, y: .08, z: .05 })); }
        eyes(g, '#f8e040', .84, .34, .11); return hit(g, 1.1);
      });
      v3.def('skunk', () => {
        const g = grp(part(G.ball, '#1e1e28', { sx: .5, sy: .4, sz: .75, y: .43 }), part(G.box, '#f4f4f4', { sx: .16, sy: .06, sz: 1.2, y: .84, z: -.05, line: false }), part(G.ball, '#1e1e28', { s: .28, y: .55, z: .64 }), part(G.box, '#f4f4f4', { sx: .1, sy: .06, sz: .3, y: .84, z: .66, line: false }), part(G.ball, '#1e1e28', { s: .3, y: .95, z: -.8 }), part(G.ball, '#f4f4f4', { s: .2, y: 1.2, z: -.82 }), blob(.6, .35));
        for (const s of [-1, 1]) for (const z of [-.35, .4]) g.add(part(G.box, '#101018', { sx: .14, sy: .3, sz: .14, x: s * .3, y: .15, z }));
        eyes(g, '#70f070', .6, .9, .11); return hit(g, 1.3);
      });
    }
    return v3;
  }
  function snap() {                                      // the camera flash: everything staring in the beam runs
    if (dead || charge < 1 || !ready.playing) return;
    const inBeam = foes.filter(f => !f.gone && lit(f)), skunk = inBeam.find(f => f.k === 'skunk'), got = inBeam.filter(f => f.k !== 'skunk' && f.stare >= .4);
    if (!skunk && !got.length) return;
    charge = 0; feel.juice.flash('#ffffff', .6, .1); sfx(1800, .05, 'square', .05, -900); haptic('medium');
    let n = 0;
    for (const f of got) {
      const p = mid(f); f.hp--; f.hit = .12; f.stare = 0;
      if (f.hp <= 0) { f.gone = .01; n++; score += f.k === 'bandit' ? 3 : 1; feel.juice.burst(p.x, p.y, { n: 8, speed: 60, life: .4, size: 2, color: ['#ffffff', '#f8e070'] }); }
      else { f.z = Math.min(1.05, f.z + .25); feel.juice.pop(p.x, p.y - 10, f.hp + ' MORE', { color: '#f8e070' }); }
    }
    if (n > 1) { score += n - 1; feel.juice.pop(light.x, light.y - 16, n + ' AT ONCE', { color: '#80f8ff' }); haptic('success'); }
    if (n) { api.score(score); sfx(660 + n * 110, .12, 'square', .04, 300); }
    if (skunk) { skunk.gone = .01; lose('PHEW! SKUNK'); stink = 1.2; sfx(90, .5, 'sawtooth', .05, 40); }
  }
  function lose(txt) {
    pies--; msg = { txt, l: 1.1 }; haptic('heavy'); feel.juice.shake(4);
    if (pies <= 0) { dead = .01; msg = { txt: 'NO PIES LEFT', l: 9 }; sfx(80, .8, 'sawtooth', .05, -20); }
  }
  const self = {
    reset() {
      foes = []; pies = 5; raid = 0; score = 0; t = 0; light = { x: W / 2, y: H * .55 }; charge = 1; dead = 0; held = false; stink = 0; msg = null; toSpawn = []; spawnT = 0; restT = 0;
      feel.clear(); ready.reset(); newRaid();
    },
    resize(w, h) { W = w; H = h; if (light) light = { x: clamp(light.x, 0, W), y: clamp(light.y, 0, H) }; },
    update(dt) {
      feel.update(dt); t += dt; stink = Math.max(0, stink - dt);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.4) api.over(); return; }
      if (!ready.update(dt)) return;
      charge = Math.min(1, charge + dt / .8);
      spawnT -= dt;
      if (spawnT <= 0 && toSpawn.length) { const k = toSpawn.shift(); foes.push({ k, ...KINDS[k], x: rnd(-.7, .7), z: 1.1, ph: rnd(0, 6), hit: 0, stare: 0, gone: 0 }); spawnT = rnd(1.4, 2.6) - Math.min(.8, raid * .08); sfx(300, .04, 'square', .02, -100); }
      for (const f of foes) {
        f.hit = Math.max(0, f.hit - dt);
        if (f.gone) { f.gone += dt; f.z += 1.6 * dt; continue; }
        const seen = lit(f);
        if (f.k === 'skunk') { f.z -= f.sp * dt; if (f.z <= .05) f.gone = .01; continue; }       // skunks just wander through
        if (seen) { if (f.stare < .4 && f.stare + dt >= .4) { sfx(1000, .03, 'square', .02); haptic('tick'); } f.stare += dt; continue; }   // frozen in the light
        f.stare = 0; f.z -= f.sp * (1 + raid * .03) * dt; if (f.zig) f.x = clamp(f.x + Math.sin(t * 4 + f.ph) * .6 * dt, -.8, .8);
        if (f.z <= 0) { f.gone = .01; sfx(140, .3, 'sawtooth', .05, -60); lose('A PIE IS GONE'); }
      }
      foes = foes.filter(f => f.gone < .7);
      if (!toSpawn.length && !foes.length) { restT += dt; if (restT > 1.2) newRaid(); }
    },
    fx(dt) { feel.update(dt); t += dt; },
    draw(c) {
      const v = view3d(), k = cam(); v.frame();
      const X = x => x * k.xs, Z = z => -k.d0 * (1 + z * 3.2), u = k.d0 / k.f;   // u: world units per screen pixel at the front
      v.put('larder', [0, 0, 0], { sx: k.xs, sy: 1, sz: 1 });
      for (const f of foes) {
        const wide = f.stare >= .4, run = f.gone > 0;
        const o = v.put(f.model, [X(f.x) + (wide ? Math.sin(t * 50) * .01 : 0), 0, Z(f.z)], { sx: f.w * 2.6 * u, sy: f.h * 2.6 * u * (wide ? 1.08 : 1 + Math.sin(t * 8 + f.ph) * .04), sz: f.w * 2.6 * u, ry: run ? Math.PI : 0 });
        o.userData.flash.visible = f.hit > 0;
        for (const e of o.userData.eyes) e.scale.setScalar(wide ? .13 : .07);
      }
      v.render(c, W, H);
      // the dark, and the torch beam
      const r = beam() * 1.1, g = c.createRadialGradient(light.x, light.y, r * .3, light.x, light.y, r * 1.3);
      g.addColorStop(0, 'rgba(4,6,20,0)'); g.addColorStop(.6, 'rgba(4,6,20,.6)'); g.addColorStop(1, 'rgba(4,6,20,.9)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      glow(c, light.x, light.y, r * .9, '#f8e8c0', .12);
      if (stink > 0) { c.fillStyle = '#70c040'; c.globalAlpha = Math.min(.45, stink * .5); c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
      feel.begin(c);
      for (const f of foes) if (!f.gone && f.stare >= .4) { const p = mid(f); text(c, '!', p.x, p.y - f.h * proj(f.x, f.z).s * 1.6 - 8, { color: '#f8e070', align: 'center', shadow: '#101018' }); }
      feel.end(c, W, H);
      // HUD: pies on the left, the flash charging on the right
      c.fillStyle = '#101018'; c.fillRect(0, 0, W, 12);
      for (let i = 0; i < 5; i++) { const x = 4 + i * 10; c.fillStyle = i < pies ? '#c8823a' : '#3a3440'; c.fillRect(x, 5, 8, 4); c.fillRect(x + 1, 4, 6, 1); c.fillStyle = i < pies ? '#f0d090' : '#4a4450'; c.fillRect(x + 1, 3, 6, 2); }
      c.fillStyle = '#3a3440'; c.fillRect(W - 34, 4, 30, 4); c.fillStyle = charge >= 1 ? '#f8f8f0' : '#8a8498'; c.fillRect(W - 34, 4, Math.round(30 * charge), 4);
      if (msg) { c.fillStyle = '#101018'; c.fillRect(0, Math.round(H * .3) - 4, W, 13); text(c, msg.txt, W / 2, Math.round(H * .3), { color: dead ? '#f86060' : '#f8f0d8', align: 'center' }); }
      ready.draw(c, W, H, { pixel: true, color: '#f8f0d8', shadow: '#101018', y: Math.round(H * .24), text: 'DRAG TO POINT THE TORCH' });
    },
    down(x, y) { ready.go(); held = true; light = { x, y }; },
    move(x, y, p) { if (p && held) light = { x, y }; },
    up() { if (held) snap(); held = false; },
    key(k, d) {
      if (!d) return; ready.go(); const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (m) light = { x: clamp(light.x + m[0] * 12, 0, W), y: clamp(light.y + m[1] * 12, 0, H) };
      if (k === ' ') snap();
    },
  };
  return self;
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'pantry-patrol', title: 'Pantry Patrol', tag: 'Console · Night watch', retro: true, era: 'console', pal: 'grape', w: 176, h: 176, maxW: 280, maxH: 300, goal: 30, music: 'spooky',
  hint: 'Drag to point your torch. Raccoons freeze in the light: hold it on one until it stares, then let go to flash and send it running. Never flash a skunk.',
  make,
};
