// Star Join: a night sky fills your room and a new constellation hides in it. Its stars are numbered: turn
// to find them and tap them in order, 1, 2, 3..., to draw the picture before the clock runs out. Wrong
// stars cost time. Each finished picture scores its stars and adds time, and the next one is bigger.
import gs from '../gamescroll.js';
const { Ready } = gs.rounds;
const { sounds, notes, sfx } = gs.sound;
const { haptic, want } = gs.device;
const { Juice } = gs.juice;
const { Gestures } = gs.controls;
const { Particles, pbr, THREE } = gs.hd;
const { ARView, arNote } = gs.ar;
const { rnd } = gs.util;

let W = 300, H = 460;
const NAMES = ['THE KETTLE', 'THE LONG CAT', 'THE KITE', 'THE SNAIL', 'THE LADDER', 'THE BOOT', 'THE TEAPOT', 'THE OWL', 'THE CROWN', 'THE WHALE'];

function make(api) {
  const ready = new Ready();   // the first touch starts the round and does nothing else
  want('motion');
  const fx = new Juice();
  let v, starGeo, dimMat, litMat, nextMat, pool, dust, lines, lineMat, sparks;
  let stars, decoys, next, level, score, time, t, ended, name, nameT;
  const g = new Gestures({
    tap: (x, y) => tapAt(x, y),
    drag: (x, y, dx, dy) => { v?.drag(-dx, -dy); },
  });

  function setup() {
    v = new ARView();
    starGeo = new THREE.IcosahedronGeometry(.09, 1);
    dimMat = pbr('#9fb0d0', { glow: 1.2 }); litMat = pbr('#ffe9a0', { glow: 6 }); nextMat = pbr('#bfe0ff', { glow: 3 });
    pool = []; for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(starGeo, dimMat); m.visible = false; v.scene.add(m); pool.push(m); }
    // faint background dust so the sky feels full
    const pts = []; for (let i = 0; i < 260; i++) { const a = Math.random() * 6.28, e = rnd(-.2, 1.2), d = 9; pts.push(-Math.sin(a) * d * Math.cos(e), Math.sin(e) * d, -Math.cos(a) * d * Math.cos(e)); }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#8090b0', size: .04, transparent: true, opacity: .7 })); v.scene.add(dust);
    lineMat = new THREE.LineBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: .9 });
    lines = new THREE.Line(new THREE.BufferGeometry(), lineMat); v.scene.add(lines);
    sparks = new Particles(v, { max: 300, additive: true });
  }
  function newPicture() {
    level++;
    const n = Math.min(9, 3 + level), spread = v.sensor ? Math.min(Math.PI, .6 + level * .35) : Math.min(Math.PI * .45, .5 + level * .12);
    const centre = v.sensor ? rnd(-Math.PI, Math.PI) : rnd(-.2, .2);
    for (const m of pool) m.visible = false;
    stars = []; decoys = [];
    // a wandering path of stars: each one a step from the last, so it reads as a picture
    let a = centre + rnd(-spread, spread) * .5, e = rnd(.1, .5);
    for (let i = 0; i < n; i++) {
      if (i) { const dir = rnd(0, 6.28); a += Math.cos(dir) * rnd(.25, .45) * (spread / 1.2 + .4); e = Math.max(-.15, Math.min(.9, e + Math.sin(dir) * rnd(.15, .3))); }
      a = Math.max(centre - spread, Math.min(centre + spread, a));
      stars.push({ m: pool[i], a, e, done: false });
    }
    for (let i = 0; i < Math.min(8, 2 + level); i++) decoys.push({ m: pool[n + i], a: centre + rnd(-spread, spread), e: rnd(-.15, .9) });
    for (const s of [...stars, ...decoys]) { const d = 4; s.m.position.set(-Math.sin(s.a) * d * Math.cos(s.e), Math.sin(s.e) * d, -Math.cos(s.a) * d * Math.cos(s.e)); s.m.visible = true; s.m.material = dimMat; s.m.scale.setScalar(1); }
    next = 0; drawLines(); name = NAMES[(level - 1) % NAMES.length]; nameT = 2;
  }
  function drawLines() {
    const pts = []; for (const s of stars) if (s.done) pts.push(s.m.position.x, s.m.position.y, s.m.position.z);
    lines.geometry.dispose(); lines.geometry = new THREE.BufferGeometry(); lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  }
  function tapAt(x, y) {
    if (!v || ended) return;
    if (ready.go()) { sounds.click(); return; }
    let best = null, bd = 36;
    for (const s of [...stars, ...decoys]) { if (s.done) continue; const [sx, sy, z] = v.toScreen(s.m.position.x, s.m.position.y, s.m.position.z); const d = Math.hypot(sx - x, sy - y); if (z < 1 && d < bd) { bd = d; best = s; } }
    if (!best) return;
    if (best === stars[next]) {
      best.done = true; best.m.material = litMat; next++; drawLines();
      notes(['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6'][Math.min(8, next - 1)], { len: .08, vol: .05 }); haptic('light');
      const p = best.m.position; for (let i = 0; i < 16; i++) sparks.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-.6, .6), vy: rnd(-.6, .6), vz: rnd(-.6, .6), life: .6, size: .04, col: [3, 2.6, 1.2], drag: 2 });
      if (next === stars.length) {
        score += stars.length; api.score(score); time = Math.min(60, time + 8 + stars.length); sounds.powerup(); haptic('success');
        fx.pop(W / 2, H * .3, name + ' +' + stars.length, { size: 22, color: '#ffe9a0' });
        newPicture();
      }
    } else { time -= 2; sfx(180, .12, 'square', .03); haptic('warning'); fx.pop(x, y - 16, '-2s', { color: '#ff8080' }); }
  }

  return {
    reset() {
      if (!v) setup();
      v.off(); v.recenter();
      level = 0; score = 0; time = 30; t = 0; ready.reset(); ended = false; sparks.clear(); fx.clear(); g.release();
      newPicture();
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      v.live(); if (v.calibrating) return;   // finding or lining up the floor: the round waits
      fx.update(dt); sparks.update(dt); t += dt;
      if (!ready.playing || ended) return;
      time -= dt; nameT = Math.max(0, nameT - dt);
      const s = stars[next]; if (s) s.m.scale.setScalar(1.2 + Math.sin(t * 6) * .25);
      if (time <= 0) { ended = true; time = 0; v.off(); sounds.lose(); api.over(); }
    },
    draw(c) {
      v.look();
      v.draw(c, W, H);
      c.fillStyle = '#050820b8'; c.fillRect(0, 0, W, H);   // dim the room so the sky glows
      // the stars and lines glow on top of the dimmed room
      const scr = s => v.toScreen(s.m.position.x, s.m.position.y, s.m.position.z);
      c.strokeStyle = '#ffe9a0'; c.lineWidth = 2; c.beginPath(); let first = true;
      for (const s of stars) { if (!s.done) break; const [sx, sy, z] = scr(s); if (z >= 1) { first = true; continue; } if (first) c.moveTo(sx, sy); else c.lineTo(sx, sy); first = false; }
      c.stroke();
      for (const s of [...stars, ...decoys]) {
        const [sx, sy, z] = scr(s); if (z >= 1 || !s.m.visible) continue;
        const big = s === stars[next] ? 1.3 + Math.sin(t * 6) * .3 : 1, col = s.done ? '255,233,160' : s === stars[next] ? '200,230,255' : '170,185,215';
        const gr = c.createRadialGradient(sx, sy, 0, sx, sy, 14 * big); gr.addColorStop(0, `rgba(${col},1)`); gr.addColorStop(.25, `rgba(${col},.8)`); gr.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = gr; c.beginPath(); c.arc(sx, sy, 14 * big, 0, 7); c.fill();
      }
      // numbers next to the stars still to join
      c.font = '700 13px Rubik, sans-serif'; c.textAlign = 'center';
      stars.forEach((s, i) => {
        if (s.done) return;
        const [sx, sy, z] = v.toScreen(s.m.position.x, s.m.position.y, s.m.position.z); if (z >= 1) return;
        c.fillStyle = i === next ? '#ffe9a0' : '#bfd0f0'; c.fillText(String(i + 1), sx + 12, sy - 8);
      });
      const tgt = stars[next]; if (tgt) v.pointers(c, W, H, [{ p: tgt.m.position, col: '#ffe9a0' }]);
      fx.begin(c); fx.end(c, W, H);
      c.textAlign = 'left'; c.font = '700 16px Rubik, sans-serif'; c.fillStyle = time < 8 && (t * 4 | 0) % 2 ? '#ff7070' : '#fff';
      c.fillText(Math.ceil(time) + 's', 14, 28);
      c.textAlign = 'center';
      if (nameT > 0 && ready.playing) { c.fillStyle = '#ffe9a0'; c.font = '800 18px Rubik, sans-serif'; c.fillText(name, W / 2, H * .82); c.font = '500 12px Rubik, sans-serif'; c.fillStyle = '#cfe0ff'; c.fillText(`${stars.length} stars to join`, W / 2, H * .82 + 18); }
      if (!ready.playing) { c.fillStyle = '#fff'; c.font = '700 16px Rubik, sans-serif'; c.fillText('Tap the stars in number order', W / 2, H * .78); c.font = '500 12px Rubik, sans-serif'; c.fillStyle = '#cfe0ff'; c.fillText('Turn the phone (or drag) to find them. Tap to start', W / 2, H * .78 + 20); }
      arNote(c, v, W, H);
    },
    // the AR kit gets touches first: its floor panels (Skip, Done, the Floor chip) use them
    down: (x, y, id) => { if (!v?.input?.('down', x, y, id)) g.down(x, y, id); },
    move: (x, y, p, id) => { if (!v?.input?.('move', x, y, id, p)) g.move(x, y, p, id); },
    up: (x, y, id) => { if (!v?.input?.('up', x, y, id)) g.up(x, y, id); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'star-join',
  title: 'Star Join',
  tag: 'AR · Puzzle',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 25,
  hint: 'Constellations hide in the sky around you. Turn the phone to find the numbered stars and tap them in order before time runs out. No camera? Drag to look around.',
  make,
};
