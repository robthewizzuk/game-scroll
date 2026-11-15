import gs from '../gamescroll.js';
const { sounds } = gs.sound;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { Physics } = gs.physics;
const { material, sticker, shade, ball, slab } = gs.gfx;
const { ease } = gs.juice;
const { clamp, rnd } = gs.util;
const { tweak } = gs;

// Sling Smash: pull back the slingshot and fling stones at the grumpy blobs hiding in forts of wood,
// glass and stone. Everything is real Rapier physics (gs.physics): towers topple, planks snap where
// they were hit, stone cracks into chunks, glass bursts into shards and powder kegs throw the lot.
// Clear every blob to reach the next fort; unused stones are bonus points.

const W = 360, H = 640, GY = 560;                    // GY: the top of the ground
const GW = 480, GH = 150;                            // the ground picture, wide and deep enough for the view zoomed out
const mound = x => { const k = 1 - Math.min(1, Math.abs(x - SX) / 80); return GY - 24 * k * k * (3 - 2 * k); };   // the slingshot's mound
const SX = 64, SY = GY - 104;                         // where the stone rests in the sling's pouch
const PW = 10, SH = 50, PT = 10, SPAN = 66, GAP = 14;   // fort parts: pillar thickness, storey height, plank thickness, tower width
// What each part is made of. hp: how much hurt it takes; min: the speed under which a knock does nothing.
const MAT = {
  wood: { hp: 60, density: 1, friction: .7, bounce: .05, min: 110 },
  glass: { hp: 24, density: .7, friction: .3, bounce: .1, min: 90 },
  stone: { hp: 140, density: 2.2, friction: .85, bounce: .02, min: 130 },
  keg: { hp: 12, density: .9, friction: .6, bounce: .05, min: 100 },
  blob: { hp: 16, density: .8, friction: .7, bounce: .25, min: 70 },
  chief: { hp: 40, density: 1, friction: .7, bounce: .2, min: 80 },
};

function make(api) {
  const feel = new Feel({ sound: false }), ready = new Ready({ eat: false, text: 'Drag back anywhere, then let go' });
  // Knobs: the numbers that set how it feels (node scripts/knobs.mjs sling-smash lists them).
  const K = tweak('Feel', {
    gravity: [900, 400, 1600, 'how hard everything falls'],
    pull: [92, 50, 140, 'how far back the band stretches'],
    power: [6.6, 4, 12, 'launch speed for each unit of pull'],
    heavy: [4, 1, 10, 'how heavy the stone is'],
    hurt: [.06, .02, .15, .005, 'hurt for each unit of impact speed'],
    stoneHit: [1.5, .5, 3, 'extra hurt when the stone itself hits'],
    preview: [.5, 0, 1.2, 'seconds of flight the aiming dots show'],
    blast: [900, 200, 2000, 'how hard a powder keg throws things'],
    blastR: [110, 50, 200, 'how far a powder keg reaches'],
    grace: [.8, 0, 2, 'seconds a new fort settles before knocks count'],
  });
  const wood = material('wood', { color: '#c48a4c', scale: .55 });
  const stone = material('stone', { color: '#a3a6ae', scale: .5 });
  const rock = material('stone', { color: '#7d7468', scale: .7, seed: 4 });
  const dirt = material('stone', { color: '#8a5d3b', scale: .8, seed: 9, contrast: .7 });
  let best = api.load({ best: 1 }).best;
  let Z = 1, VW = W;   // the view's zoom (small forts are seen closer) and how wide the world it shows is
  let phys, level, score, shots, T, grace, drag, flying, spent, trail, breaking, clearing, msg, budget, look, settle, over;

  /* ---------- the fort ---------- */
  function part(x, y, w, h, mat, o = {}) {   // a block: w is always its long side, angle Math.PI / 2 stands it up
    const m = MAT[mat], t = phys.box(x, y, w, h, { density: m.density, friction: m.friction, bounce: m.bounce, angle: o.angle || 0, vx: o.vx || 0, vy: o.vy || 0, spin: o.spin || 0, tag: 'part' });
    t.mat = mat; t.max = t.hp = m.hp * (o.share ?? 1); t.gen = o.gen || 0; t.cut = o.cut || 0; t.seed = o.seed ?? rnd(0, 997) | 0; t.wob = 0; t.safe = o.safe || 0;
    return t;
  }
  function blob(x, y, chief) {
    const r = chief ? 16 : 13, m = MAT[chief ? 'chief' : 'blob'];
    const t = phys.circle(x, y - r, r, { density: m.density, friction: m.friction, bounce: m.bounce, spinDrag: 2, tag: 'blob' });
    t.mat = chief ? 'chief' : 'blob'; t.max = t.hp = m.hp; t.seed = rnd(0, 997) | 0; t.wob = 0; t.safe = 0; t.gen = 0;
    return t;
  }
  function tower(left, base, storeys, mats, o) {
    let b = base;
    for (let s = 0; s < storeys; s++) {
      const mat = mats[rnd(0, mats.length) | 0], top = s === storeys - 1;
      part(left + PW / 2, b - SH / 2, SH, PW, mat, { angle: Math.PI / 2 });
      part(left + SPAN - PW / 2, b - SH / 2, SH, PW, mat, { angle: Math.PI / 2 });
      if (o.keg && s === 0) { blob(left + PW + 14, b); part(left + SPAN - PW - 9, b - 9, 18, 16, 'keg', { angle: Math.PI / 2 }); }
      else blob(left + SPAN / 2, b, o.chief && top);
      part(left + SPAN / 2, b - SH - PT / 2, SPAN + 10, PT, mats[rnd(0, mats.length) | 0]);
      b -= SH + PT;
    }
    return b;   // the top of the tower
  }
  function build() {
    phys.clear();
    const L = level, mats = L < 2 ? ['wood'] : L < 3 ? ['wood', 'wood', 'glass'] : ['wood', 'glass', 'stone'];
    const n = L < 2 ? 1 : L < 4 ? 2 : 3, total = n * SPAN + (n - 1) * GAP;
    Z = clamp(W / (SX + 120 + total + 16), .85, 1.35); VW = W / Z;   // a small fort is seen closer up
    const x0 = VW - 16 - total;
    phys.box(VW / 2 - 40, GY + 40, VW + 120, 80, { fixed: true, friction: .9, tag: 'ground' });
    const hill = []; for (let x = SX - 84; x <= SX + 84; x += 8) hill.push([x, mound(x) + 1]);
    phys.line(hill, { friction: .9, tag: 'ground' });   // the mound under the slingshot is solid too
    const tops = [];
    for (let i = 0; i < n; i++) {
      const left = x0 + i * (SPAN + GAP);
      let base = GY;
      if (L >= 3 && Math.random() < .35) {   // a rock plinth lifts this tower
        const ph = 26 + (rnd(0, 2) | 0) * 12, p = phys.box(left + SPAN / 2, GY - ph / 2, SPAN + 18, ph, { fixed: true, friction: .9, tag: 'rock' });
        p.rock = true; base = GY - ph;
      }
      const most = Math.min(4, 1 + Math.floor(L / 2)), storeys = L < 2 ? 1 + (Math.random() < .5) : 1 + (rnd(0, most) | 0);
      const top = tower(left, base, storeys, mats, { keg: L >= 3 && Math.random() < .45, chief: L >= 4 && Math.random() < .5 });
      tops.push({ left, top, storeys, base });
    }
    for (let i = 0; i < n; i++) {   // on top: a bridge to the next tower, a roof, or one more blob
      const a = tops[i], b = tops[i + 1];
      if (a.done) continue;
      if (b && Math.abs(a.top - b.top) < 1 && Math.random() < .55) {
        part(a.left + SPAN + GAP / 2, a.top - PT / 2, SPAN + GAP + 2, PT, mats[rnd(0, mats.length) | 0]);
        blob(a.left + SPAN + GAP / 2, a.top - PT);
        a.done = b.done = true; continue;
      }
      if (Math.random() < .55) blob(a.left + SPAN / 2, a.top, L >= 5 && Math.random() < .4);
      else roof(a.left + SPAN / 2, a.top, L >= 3 && Math.random() < .5 ? 'stone' : 'wood');
    }
    const blobs = grumps();
    shots = clamp(Math.ceil(blobs * .7) + 2, 3, 6);
    grace = K.grace; flying = null; spent = []; trail = []; breaking = []; clearing = null; settle = 0;
  }
  function roof(x, y, mat) {
    const w = SPAN + 8, h = 26, m = MAT[mat];
    const t = phys.poly(x, y - h / 3, [[-w / 2, h / 3], [w / 2, h / 3], [0, -h * 2 / 3]], { density: m.density, friction: m.friction, bounce: m.bounce, tag: 'part' });
    t.mat = mat; t.max = t.hp = m.hp * .8; t.gen = 2; t.seed = rnd(0, 997) | 0; t.wob = 0; t.safe = 0; t.cut = 0; t.roof = true;
  }
  const isBlob = t => t.mat === 'blob' || t.mat === 'chief';
  const grumps = () => { let n = 0; for (const t of phys.things) if (isBlob(t) && !t.gone) n++; return n; };

  /* ---------- knocks and breaking ---------- */
  function knock(t, other, speed, x, y) {
    if (t.hp == null || t.gone || grace > 0 || t.safe > 0) return;
    const m = MAT[t.mat], over = speed - m.min;
    if (over <= 0) return;
    let k = other.fixed ? 1.2 : clamp(other.mass / t.mass, .25, 3);
    if (other.tag === 'stone') k *= K.stoneHit;
    hurt(t, over * K.hurt * k, x, y);
    if (budget > 0 && over > m.min * .3 && t.hp > 0) {   // a knock you can hear (a few a frame at most)
      budget--;
      if (isBlob(t)) sounds.squish(1 + rnd(-.1, .2)); else if (t.mat === 'glass') sounds.clang(1.8 + rnd(0, .4)); else sounds.thud(t.mat === 'stone' ? .7 : 1 + rnd(-.1, .1));
    }
  }
  function hurt(t, dmg, x, y) {
    if (t.gone || !(dmg > 0)) return;
    t.hp -= dmg; t.wob = 1;
    if (t.hp <= 0 && !t.queued) { t.queued = true; breaking.push([t, x ?? t.x, y ?? t.y]); }
  }
  function local(t, x, y) { const dx = x - t.x, dy = y - t.y, co = Math.cos(t.angle), si = Math.sin(t.angle); return [dx * co + dy * si, -dx * si + dy * co]; }
  function toWorld(t, lx, ly) { const co = Math.cos(t.angle), si = Math.sin(t.angle); return [t.x + lx * co - ly * si, t.y + lx * si + ly * co]; }
  function smash(t, hx, hy) {
    if (t.gone) return;
    t.gone = true;
    const { x, y, vx, vy, spin, angle } = t, was = { x, y, vx, vy, spin, angle };   // read before it leaves the world
    phys.remove(t);
    if (isBlob(t)) return pop(t, x, y);
    if (t.mat === 'keg') return explode(x, y);
    const big = t.mat === 'stone' ? 1 : t.mat === 'glass' ? .6 : .8;
    if (t.mat === 'glass') { sounds.shatter(1 + rnd(-.1, .2)); feel.juice.burst(...on(x, y), { n: 14, speed: 170, life: .6, size: 2.5, gravity: K.gravity * .6, shape: 'spark', color: ['#e6f8ff', '#a8dcf5', '#ffffff'], glow: true }); }
    else if (t.mat === 'stone') { sounds.crumble(1 + rnd(-.1, .1)); feel.juice.burst(...on(x, y), { n: 10, speed: 110, life: .7, size: 3, gravity: K.gravity * .7, shape: 'square', color: ['#b9bcc4', '#8a8d95', '#d8dade'] }); dust(x, y, 1); }
    else { sounds.crack(1 + rnd(-.15, .15)); feel.juice.burst(...on(x, y), { n: 10, speed: 150, life: .55, size: 2.2, gravity: K.gravity * .7, shape: 'spark', color: ['#e7b878', '#a8703c', '#f6d7a4'] }); }
    feel.hit(...on(x, y), { power: .25 * big, color: t.mat === 'glass' ? '#cdeeff' : '#ffffff' });
    if (t.mat === 'glass' || t.roof || t.gen >= 2) return shards(t, hx, hy, was);
    // wood snaps across where it was hit; stone cracks into two or four chunks
    const w = t.w, h = t.h, [lx] = local(was, hx, hy), out = [];
    if (t.mat === 'stone' && w >= 18 && h >= 18) for (const sx of [-1, 1]) for (const sy of [-1, 1]) out.push([sx * w / 4, sy * h / 4, w / 2, h / 2, 0]);
    else {
      const u = clamp(lx / w + .5 + rnd(-.08, .08), .3, .7), a = w * u, b = w - a;
      out.push([-w / 2 + a / 2, 0, a, h, (t.cut & 1) | 2], [w / 2 - b / 2, 0, b, h, (t.cut & 2) | 1]);
    }
    for (const [px, py, pw, ph, cut] of out) {
      const [wx, wy] = toWorld(was, px, py), lw = Math.max(pw, ph), lh = Math.min(pw, ph), turn = ph > pw ? Math.PI / 2 : 0;
      const ox = wx - hx, oy = wy - hy, d = Math.hypot(ox, oy) || 1;
      if (lw < 9 || lw * lh < 70) { bit(wx, wy, lw, lh, t.mat, angle + turn, vx + ox / d * 40, vy + oy / d * 40, spin); continue; }
      part(wx, wy, lw, lh, t.mat, { angle: angle + turn, vx: vx + ox / d * 50, vy: vy + oy / d * 50 - 20, spin: spin + rnd(-2, 2), gen: t.gen + 1, share: .55, cut: turn ? 0 : cut, safe: .15 });
    }
  }
  function bit(x, y, w, h, mat, angle, vx, vy, spin) {   // a small piece that tumbles for a moment and fades
    const t = phys.box(x, y, Math.max(3, w), Math.max(3, h), { density: MAT[mat].density, friction: .6, bounce: .1, angle, vx, vy, spin, tag: 'bit' });
    t.mat = mat; t.life = rnd(1.6, 2.6); t.seed = rnd(0, 997) | 0;
  }
  function shards(t, hx, hy, was) {   // glass (and roofs, and pieces already broken twice) burst into triangles
    const pts = t.kind === 'box' ? [[-t.w / 2, -t.h / 2], [rnd(-.2, .2) * t.w, -t.h / 2], [t.w / 2, -t.h / 2], [t.w / 2, t.h / 2], [rnd(-.2, .2) * t.w, t.h / 2], [-t.w / 2, t.h / 2]] : t.points;
    let [qx, qy] = local({ x: was.x, y: was.y, angle: was.angle }, hx, hy);
    const bx = t.kind === 'box' ? t.w * .3 : 6, by = t.kind === 'box' ? t.h * .3 : 6;
    qx = clamp(qx, -bx, bx); qy = clamp(qy, -by, by);
    const co = Math.cos(was.angle), si = Math.sin(was.angle), Wd = (lx, ly) => [was.x + lx * co - ly * si, was.y + lx * si + ly * co];
    for (let i = 0; i < pts.length; i++) {
      const a = Wd(qx, qy), b = Wd(...pts[i]), c = Wd(...pts[(i + 1) % pts.length]);
      const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
      if (area < 6) continue;
      const ox = cx - hx, oy = cy - hy, d = Math.hypot(ox, oy) || 1;
      try {
        const s = phys.poly(cx, cy, [a, b, c].map(p => [p[0] - cx, p[1] - cy]), { density: MAT[t.mat].density, friction: .5, bounce: .15, vx: was.vx * .6 + ox / d * 90, vy: was.vy * .6 + oy / d * 90 - 40, spin: rnd(-6, 6), tag: 'bit' });
        s.mat = t.mat; s.life = rnd(1.2, 2.2); s.seed = rnd(0, 997) | 0;
      } catch (_) { /* a sliver too thin to be a shape */ }
    }
  }
  function dust(x, y, size) { feel.juice.burst(...on(x, y), { n: 6, speed: 30 * size, life: .9, size: 9 * size, gravity: -30, drag: 2, color: ['#e9e2d4b0', '#cfc6b6a0'] }); }
  function pop(t, x, y) {
    const pts = t.mat === 'chief' ? 2 : 1;
    score += pts; api.score(score);
    sounds.pop(1 + rnd(0, .2)); sounds.squish(.8);
    feel.boom(...on(x, y), { size: t.mat === 'chief' ? .7 : .5, color: ['#86dc5a', '#c2f293', '#4fa83a', '#ffffff'] });
    feel.juice.pop(...on(x, y - t.r - 4), '+' + pts, { color: '#ffe066', size: 20, font: 'Rubik, sans-serif' });
  }
  function explode(x, y) {
    sounds.blast(1 + rnd(-.1, .1));
    feel.boom(...on(x, y), { size: 1.3, color: ['#ffd23f', '#ff8a3d', '#ff4d2e', '#fff4c0'] }); dust(x, y, 2);
    phys.blast(x, y, K.blastR, K.blast);
    for (const t of phys.things) {
      if (t.hp == null || t.gone) continue;
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < K.blastR) { const keep = t.safe; t.safe = 0; hurt(t, (1 - d / K.blastR) * 120, x, y); t.safe = keep; }
    }
  }

  /* ---------- shooting ---------- */
  const view = (x, y) => [x / Z, GY + (y - GY) / Z];   // a touch on the screen to a place in the zoomed world
  const on = (x, y) => [x * Z, GY + (y - GY) * Z];     // and back: effects are drawn on the screen, not in the zoom
  function aim() {
    if (!drag) return null;
    let dx = drag.x - drag.cx, dy = drag.y - drag.cy; const l = Math.hypot(dx, dy);
    if (l > K.pull) { dx *= K.pull / l; dy *= K.pull / l; }
    return { dx, dy, l: Math.min(l, K.pull) };
  }
  const loaded = () => !flying && !clearing && shots > 0 && !over;
  function fire(a) {
    const x = SX - a.dx, y = SY - a.dy;
    flying = phys.circle(x, y, 9, { density: K.heavy, bounce: .3, friction: .7, bullet: true, vx: a.dx * K.power, vy: a.dy * K.power, spin: a.dx * .1, tag: 'stone' });
    flying.age = 0; flying.rest = 0; shots--; trail = [];
    sounds.swoosh(1.1); sounds.pluck(.6); feel.juice.shake(1.5);
  }
  function retire() {
    if (!flying) return;
    flying.fade = .5; spent.push(flying); flying = null; settle = 0;
  }

  /* ---------- the pictures made once ---------- */
  const sky = sticker(W, GY, g => {
    const s = g.createLinearGradient(0, 0, 0, GY); s.addColorStop(0, '#5fb6ea'); s.addColorStop(.6, '#a8dcf3'); s.addColorStop(1, '#ffe8c2');
    g.fillStyle = s; g.fillRect(0, 0, W, GY);
    const sun = g.createRadialGradient(286, 118, 4, 286, 118, 120); sun.addColorStop(0, '#fffbe8'); sun.addColorStop(.18, '#fff1b8'); sun.addColorStop(.4, '#ffe9a855'); sun.addColorStop(1, '#ffe9a800');
    g.fillStyle = sun; g.fillRect(0, 0, W, GY);
    const hills = (base, amp, f, ph, col, top) => {
      g.beginPath(); g.moveTo(0, GY);
      for (let x = 0; x <= W; x += 6) g.lineTo(x, base - amp * (.6 * Math.sin(x * f + ph) + .4 * Math.sin(x * f * 2.3 + ph * 1.7)));
      g.lineTo(W, GY); g.closePath();
      const hg = g.createLinearGradient(0, base - amp, 0, GY); hg.addColorStop(0, top); hg.addColorStop(1, col); g.fillStyle = hg; g.fill();
    };
    hills(430, 50, .011, 1, '#b9d6e2', '#9ec3d6');
    hills(476, 34, .017, 4, '#8fbf92', '#a7d2a3');
    g.fillStyle = '#6fa874';   // little round trees on the near hills
    for (let i = 0; i < 9; i++) {
      const x = 14 + i * 41 + Math.sin(i * 7.1) * 12, y = 486 - 22 * (.6 * Math.sin(x * .017 + 4) + .4 * Math.sin(x * .039 + 6.8)) + 6, r = 8 + (i * 5 % 4) * 2;
      g.fillStyle = '#5b4632'; g.fillRect(x - 1.5, y, 3, 10);
      g.fillStyle = '#6fa874'; g.beginPath(); g.arc(x, y - r * .4, r, 0, 7); g.fill();
      g.fillStyle = '#8cc48a'; g.beginPath(); g.arc(x - r * .3, y - r * .7, r * .5, 0, 7); g.fill();
    }
    hills(522, 18, .023, 2, '#79b45e', '#8cc46c');
  });
  const ground = sticker(GW, GH, g => {
    const top = 30, deep = GH - top;   // the sticker starts 30 units above the ground, for the mound and the grass
    g.fillStyle = dirt.at(0, 0); g.fillRect(0, top, GW, deep);
    const shadeDown = g.createLinearGradient(0, top, 0, top + 100); shadeDown.addColorStop(0, '#00000000'); shadeDown.addColorStop(1, '#00000060');
    g.fillStyle = shadeDown; g.fillRect(0, top, GW, deep);
    g.fillStyle = '#6e4a2e'; for (let i = 0; i < 34; i++) { const x = (i * 53.7) % GW, y = top + 18 + (i * 37) % (deep - 26); g.beginPath(); g.ellipse(x, y, 3 + i % 3, 2 + i % 2, 0, 0, 7); g.fill(); }
    // the mound the slingshot stands on
    g.beginPath(); g.moveTo(-10, top + 2);
    for (let x = -10; x <= 150; x += 4) g.lineTo(x, mound(x) - GY + top + 2);
    g.lineTo(150, top + 12); g.lineTo(-10, top + 12); g.closePath();
    g.fillStyle = dirt.at(0, 0); g.fill();
    // grass: a band along the top, then blades
    const grassTop = x => mound(x) - GY + top + Math.sin(x * .3) * .8;
    g.beginPath(); g.moveTo(0, grassTop(0));
    for (let x = 0; x <= GW; x += 3) g.lineTo(x, grassTop(x));
    for (let x = GW; x >= 0; x -= 3) g.lineTo(x, grassTop(x) + 8 + Math.sin(x * .7) * 1.5);
    g.closePath(); const gg = g.createLinearGradient(0, 0, 0, top + 10); gg.addColorStop(0, '#8fd45a'); gg.addColorStop(1, '#4f9a33'); g.fillStyle = gg; g.fill();
    g.strokeStyle = '#6cbf45'; g.lineWidth = 1.4; g.lineCap = 'round';
    for (let x = 1; x < GW; x += 3.3) { const y = grassTop(x) + 1, l = 3 + (Math.sin(x * 12.9) * .5 + .5) * 5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(x * 3.1) * 1.6, y - l); g.stroke(); }
    g.fillStyle = '#ffe36e'; for (let i = 0; i < 9; i++) { const x = 20 + i * 51 + Math.sin(i * 3) * 9; g.beginPath(); g.arc(x, grassTop(x) - 3, 1.6, 0, 7); g.fill(); }
  });
  const cloud = sticker(90, 40, g => {
    g.fillStyle = '#ffffff';
    for (const [x, y, r] of [[22, 26, 13], [40, 18, 17], [60, 22, 14], [74, 28, 10], [44, 30, 12]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    g.fillStyle = '#dcecf6'; g.fillRect(10, 32, 72, 6);
  }, { shadow: '#5a8ab033', shadowBlur: 4, shadowY: 2 });

  /* ---------- drawing ---------- */
  function edge(c, w, h, cut, seed) {   // a block's outline; a snapped end is jagged
    const l = -w / 2, r = w / 2, t = -h / 2, b = h / 2, n = 4;
    c.beginPath(); c.moveTo(l + 1.5, t);
    c.lineTo(r - 1.5, t);
    if (cut & 2) for (let i = 1; i < n; i++) c.lineTo(r - ((i + seed) % 2 ? 3.5 : .5), t + h * i / n); else c.quadraticCurveTo(r, t, r, t + 1.5), c.lineTo(r, b - 1.5), c.quadraticCurveTo(r, b, r - 1.5, b);
    c.lineTo(l + 1.5, b);
    if (cut & 1) for (let i = n - 1; i > 0; i--) c.lineTo(l + ((i + seed) % 2 ? 3.5 : .5), t + h * i / n); else c.quadraticCurveTo(l, b, l, b - 1.5), c.lineTo(l, t + 1.5), c.quadraticCurveTo(l, t, l + 1.5, t);
    c.closePath();
  }
  function cracks(c, t, w, h) {   // grows as it is hurt
    const k = t.hp / t.max; if (k > .72) return;
    let s = t.seed * 9301 + 49297; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const lines = k > .45 ? 1 : 3;
    c.lineWidth = 1; c.strokeStyle = t.mat === 'glass' ? '#ffffffd0' : '#2b1a0c90';
    for (let i = 0; i < lines; i++) {
      let x = (r() - .5) * w * .7, y = r() < .5 ? -h / 2 : h / 2; const dir = y < 0 ? 1 : -1;
      c.beginPath(); c.moveTo(x, y);
      for (let j = 0; j < 3; j++) { x += (r() - .5) * h * .8; y += dir * h * (.2 + r() * .25); c.lineTo(x, y); }
      c.stroke();
    }
  }
  const lits = new Map();   // the light-to-dark wash across a block, one for each thickness (made once, not every frame)
  function lit(c, h) {
    let g = lits.get(h);
    if (!g) { g = c.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#ffffff38'); g.addColorStop(.4, '#ffffff00'); g.addColorStop(1, '#00000038'); lits.set(h, g); }
    return g;
  }
  const bodies = {};   // a blob's shaded body as a picture, one for each size
  function blobBody(r) {
    return bodies[r] ||= sticker(r * 2 + 4, r * 2 + 4, g => {
      const x = r + 2, y = r + 2, b = g.createRadialGradient(x - r * .35, y - r * .45, r * .1, x, y, r * 1.1);
      b.addColorStop(0, '#c4f58f'); b.addColorStop(.55, '#6cc644'); b.addColorStop(1, '#357a24');
      g.fillStyle = b; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.lineWidth = 1.3; g.strokeStyle = '#2b5f1d'; g.stroke();
      g.fillStyle = '#4c9a33'; for (let i = 0; i < 3; i++) { const a = 1 + i * 2.1; g.beginPath(); g.arc(x + Math.cos(a) * r * .55, y + Math.sin(a) * r * .3 + r * .35, r * .09, 0, 7); g.fill(); }
    });
  }
  const plinths = {};
  function plinth(w, h) { return plinths[w + 'x' + h] ||= sticker(w, h, g => slab(g, 0, 0, w, h, rock, { r: 5, shadow: false })); }
  function drawPart(c, t) {
    const w = t.w, h = t.h, wob = t.wob > 0 ? Math.sin(T * 50) * t.wob * .03 : 0;
    c.save(); c.translate(t.sx, t.sy); c.rotate(t.sangle + wob);
    if (t.kind === 'poly') {   // a roof
      c.beginPath(); for (const [px, py] of t.points) c.lineTo(px, py); c.closePath();
      c.fillStyle = (t.mat === 'stone' ? stone : wood).at(-40 + t.seed % 50, -20); c.fill();
      c.fillStyle = '#ffffff22'; c.fill(); c.lineWidth = 1.6; c.strokeStyle = t.mat === 'stone' ? '#4b4e57' : '#5a3418'; c.stroke();
      c.strokeStyle = '#ffffff55'; c.lineWidth = 1; c.beginPath(); const [a, , p] = t.points; c.moveTo(a[0] + 4, a[1] - 2); c.lineTo(p[0], p[1] + 4); c.stroke();
      c.restore(); return;
    }
    if (t.mat === 'keg') {
      edge(c, w, h, 0, 0);
      const g = c.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#8a2d1f'); g.addColorStop(.45, '#d8573c'); g.addColorStop(1, '#6e2116');
      c.fillStyle = g; c.fill(); c.lineWidth = 1.4; c.strokeStyle = '#3d140c'; c.stroke();
      c.fillStyle = '#4a4f5a'; for (const x of [-w * .32, w * .32]) c.fillRect(x - 1.5, -h / 2, 3, h);
      c.rotate(-Math.PI / 2); c.fillStyle = '#ffd23f'; c.beginPath();   // a little flash sign, upright
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = i % 2 ? 2.4 : 5.5; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.fill(); c.restore(); return;
    }
    edge(c, w, h, t.cut, t.seed);
    if (t.mat === 'glass') {
      c.fillStyle = '#bfe9fba8'; c.fill();
      c.save(); c.clip(); c.strokeStyle = '#ffffffa0'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(-w / 2 + w * .2, h / 2); c.lineTo(-w / 2 + w * .2 + h, -h / 2); c.moveTo(-w / 2 + w * .32, h / 2); c.lineTo(-w / 2 + w * .32 + h * .7, -h / 2); c.stroke(); c.restore();
      c.lineWidth = 1.6; c.strokeStyle = '#3f8fbf'; c.stroke();
    } else {
      c.fillStyle = (t.mat === 'stone' ? stone : wood).at(-w / 2 + (t.seed % 61), -h / 2 + (t.seed % 37)); c.fill();
      c.fillStyle = lit(c, h); c.fill();
      c.lineWidth = 1.5; c.strokeStyle = t.mat === 'stone' ? '#4b4e57' : '#5a3418'; c.stroke();
      if (t.mat === 'wood' && t.cut) { c.strokeStyle = '#f4d29a'; c.lineWidth = 1.2; c.beginPath(); for (const end of [1, 2]) if (t.cut & end) { const x = end === 2 ? w / 2 - 2 : -w / 2 + 2; c.moveTo(x, -h / 2 + 1); c.lineTo(x, h / 2 - 1); } c.stroke(); }
      if (t.mat === 'wood' && w > 30) { c.fillStyle = '#3d2410'; c.beginPath(); c.arc(-w / 2 + 5, 0, 1.2, 0, 7); c.arc(w / 2 - 5, 0, 1.2, 0, 7); c.fill(); }   // nails
    }
    cracks(c, t, w, h);
    c.restore();
  }
  function drawBit(c, t) {
    c.save(); c.globalAlpha = clamp(t.life / .5, 0, 1);
    phys.path(c, t);
    c.fillStyle = t.mat === 'glass' ? '#cdeefcb0' : t.mat === 'stone' ? '#9a9da5' : '#c08a4e'; c.fill();
    c.lineWidth = 1; c.strokeStyle = t.mat === 'glass' ? '#6fb6dc' : t.mat === 'stone' ? '#4b4e57' : '#5a3418'; c.stroke();
    c.restore();
  }
  function drawBlob(c, t) {
    const r = t.r, x = t.sx, y = t.sy, q = 1 + Math.sin(T * 26 + t.seed) * .14 * t.wob + Math.sin(T * 2.2 + t.seed) * .02;
    const rx = r * q, ry = r / q, hurtK = t.hp < t.max;
    c.fillStyle = '#00000026'; c.beginPath(); c.ellipse(x, y + ry * .92, rx * .8, 2.5, 0, 0, 7); c.fill();
    c.save(); c.translate(x, y + (r - ry) * .5); c.scale(q, 1 / q); blobBody(r).draw(c, 0, 0); c.restore();
    // eyes follow the stone (or the slingshot)
    const tx = flying ? flying.sx : look.x, ty = flying ? flying.sy : look.y, la = Math.atan2(ty - y, tx - x);
    const blink = ((T + t.seed * .37) % 3.6) < .1, er = r * .27, ey = y - r * .16;
    for (const s of [-1, 1]) {
      const ex = x + s * r * .36;
      if (blink) { c.strokeStyle = '#1d2a14'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(ex - er, ey); c.lineTo(ex + er, ey); c.stroke(); continue; }
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(ex, ey, er, er * (hurtK ? .7 : 1), 0, 0, 7); c.fill();
      c.fillStyle = '#18200f'; c.beginPath(); c.arc(ex + Math.cos(la) * er * .45, ey + Math.sin(la) * er * .4, er * .48, 0, 7); c.fill();
    }
    c.strokeStyle = '#1d2a14'; c.lineWidth = r * .14; c.lineCap = 'round';   // grumpy brows and a frown
    c.beginPath(); c.moveTo(x - r * .66, ey - er * 1.5); c.lineTo(x - r * .12, ey - er * .8); c.moveTo(x + r * .66, ey - er * 1.5); c.lineTo(x + r * .12, ey - er * .8); c.stroke();
    c.lineWidth = r * .1; c.beginPath();
    if (hurtK) { c.moveTo(x - r * .3, y + r * .45); for (let i = 1; i <= 4; i++) c.lineTo(x - r * .3 + i * r * .15, y + r * .45 + (i % 2 ? -1.5 : 1.5)); }
    else c.arc(x, y + r * .62, r * .26, Math.PI * 1.15, Math.PI * 1.85);
    c.stroke(); c.lineCap = 'butt';
    if (hurtK) { c.fillStyle = '#f2e3c0'; c.save(); c.translate(x + r * .5, y - r * .62); c.rotate(.6); c.fillRect(-r * .3, -r * .09, r * .6, r * .18); c.restore(); }
    if (t.mat === 'chief') {   // a battered metal helmet
      const hg = c.createLinearGradient(x - r, y - r, x + r, y); hg.addColorStop(0, '#e6ebf2'); hg.addColorStop(.5, '#9aa4b0'); hg.addColorStop(1, '#5d6670');
      c.fillStyle = hg; c.beginPath(); c.ellipse(x, y - ry * .5, rx * 1.02, ry * .62, 0, Math.PI, 0); c.closePath(); c.fill();
      c.lineWidth = 1.2; c.strokeStyle = '#3b4148'; c.stroke();
      c.fillStyle = '#3b4148'; c.fillRect(x - rx, y - ry * .52, rx * 2, 2.4);
      c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(x, y - ry * 1.32); c.lineTo(x - 3, y - ry * 1.08); c.lineTo(x + 3, y - ry * 1.08); c.fill();
      if (t.hp < t.max * .6) { c.strokeStyle = '#3b4148'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - r * .4, y - ry * .95); c.lineTo(x - r * .2, y - ry * .7); c.lineTo(x - r * .35, y - ry * .55); c.stroke(); }
    }
  }
  const pebble = sticker(20, 20, g => {   // the stone: a shaded ball with a few dark flecks that turn with it
    ball(g, 10, 10, 9, '#8e919b', { gloss: .5 });
    g.fillStyle = '#6a6d77'; for (let i = 0; i < 3; i++) { const k = i * 2.1; g.beginPath(); g.arc(10 + Math.cos(k) * 4.5, 10 + Math.sin(k) * 4.5, 1.4, 0, 7); g.fill(); }
  });
  function drawStone(c, x, y, a, alpha = 1) { pebble.draw(c, x, y, { angle: a, alpha }); }
  function drawSling(c, front, px, py, pull) {
    const base = GY - 22, tipL = [SX - 13, SY - 6], tipR = [SX + 12, SY - 7];
    const band = (tip) => { c.strokeStyle = '#6a2a1c'; c.lineWidth = 4.5 - pull * 2; c.lineCap = 'round'; c.beginPath(); c.moveTo(tip[0], tip[1]); c.lineTo(px, py); c.stroke(); c.lineCap = 'butt'; };
    const prong = (tip, light) => {
      c.strokeStyle = '#4a2a12'; c.lineWidth = 8; c.lineCap = 'round'; c.beginPath(); c.moveTo(SX, SY + 26); c.quadraticCurveTo(tip[0], SY + 18, tip[0], tip[1]); c.stroke();
      c.strokeStyle = light; c.lineWidth = 5; c.stroke(); c.lineCap = 'butt';
    };
    if (!front) {
      c.strokeStyle = '#4a2a12'; c.lineWidth = 10; c.lineCap = 'round'; c.beginPath(); c.moveTo(SX, base); c.lineTo(SX, SY + 24); c.stroke();
      c.strokeStyle = '#9a6234'; c.lineWidth = 6; c.stroke(); c.lineCap = 'butt';
      prong(tipL, '#8a5428'); band(tipL);
    } else {
      band(tipR); prong(tipR, '#a86c3a');
      c.fillStyle = '#5a3418'; c.fillRect(SX - 6, SY + 20, 12, 5);   // the leather wrap
    }
  }

  return {
    reset() {
      phys?.free?.();
      phys = new Physics({ gravity: K.gravity, scale: 30 });
      phys.onHit((a, b, speed, x, y) => {
        if (a === flying || b === flying) flying.hit = true;   // the trail stops at the first thing it meets
        knock(a, b, speed, x, y); knock(b, a, speed, x, y);
      });
      level = 1; score = 0; T = 0; drag = null; msg = null; over = false; budget = 3; look = { x: SX, y: SY };
      feel.clear(); ready.reset(); build();
    },
    update(dt) {
      T += dt;
      feel.update(dt); if (feel.frozen) return;
      for (const t of phys.things) if (t.wob > 0) t.wob = Math.max(0, t.wob - dt * 3);
      if (!ready.update(dt)) return;
      budget = 3; grace -= dt;
      phys.step(dt);
      for (let guard = 0; breaking.length && guard < 6; guard++) for (const [t, x, y] of breaking.splice(0)) smash(t, x, y);
      for (let i = phys.things.length - 1; i >= 0; i--) {   // (backwards: things leave the list as we go)
        const t = phys.things[i]; if (!t) continue;
        if (t.fixed) continue;
        if (t.safe > 0) t.safe -= dt;
        if (t.life != null && (t.life -= dt) <= 0) { phys.remove(t); continue; }
        if (t.y > H + 40 || t.x > VW + 60 || t.x < -80) {   // fell off the world
          if (isBlob(t) && !t.gone) { t.gone = true; pop(t, clamp(t.x, 20, W - 20), H - 30); }
          if (t === flying) flying = null;
          phys.remove(t);
        }
      }
      for (let i = spent.length - 1; i >= 0; i--) if ((spent[i].fade -= dt) <= 0) { phys.remove(spent[i]); spent.splice(i, 1); }
      if (flying) {
        flying.age += dt;
        if (!flying.hit && trail.length < 80 && (flying.age * 25 | 0) >= trail.length) trail.push([flying.x, flying.y]);
        flying.rest = flying.speed < 25 ? flying.rest + dt : 0;
        if (flying.rest > .5 || flying.age > 7) retire();
      } else settle += dt;
      if (msg) msg.t += dt;
      const left = grumps();
      if (!clearing && !left && grace <= 0) {
        clearing = { t: 0, given: 0, stones: shots };
        sounds.fanfare(); feel.juice.flash('#ffffff', .25, .2);
        msg = { text: 'Fort cleared!', t: 0 };
      }
      if (clearing) {
        clearing.t += dt;
        if (clearing.given < clearing.stones && clearing.t > .7 + clearing.given * .28) {   // each stone left over is a point
          clearing.given++; score++; api.score(score); shots--;
          const x = 24 + (shots) * 15;
          sounds.coin(1 + clearing.given * .08); feel.juice.pop(...on(x, GY - 20), '+1', { color: '#ffe066', size: 18, font: 'Rubik, sans-serif' });
        }
        if (clearing.t > 1.1 + clearing.stones * .28 + .6) {
          level++; if (level > best) { best = level; api.save({ best }); }
          msg = { text: 'Fort ' + level, t: 0 }; build();
        }
        return;
      }
      // out of stones with blobs still standing: once the dust settles, it's over
      if (!flying && shots <= 0 && left && !over) {
        const busy = phys.things.some(t => !t.fixed && t.hp != null && !t.sleeping && t.speed > 12);
        if ((!busy && settle > .6) || settle > 3.5) { over = true; sounds.sad(); feel.lose(); api.over(); }
      }
    },
    fx(dt) { T += dt; feel.update(dt); },
    draw(c) {
      sky.draw(c, 0, 0, { anchor: [0, 0] });
      for (let i = 0; i < 4; i++) { const x = ((i * 113 + T * (5 + i * 2)) % (W + 140)) - 90, y = 46 + (i * 57) % 150; cloud.draw(c, x, y, { anchor: [0, 0], scale: .7 + (i % 3) * .2 }); }
      feel.begin(c);
      c.save(); c.translate(0, GY); c.scale(Z, Z); c.translate(0, -GY);   // the zoom, about the ground at the left edge
      ground.draw(c, 0, GY - 30, { anchor: [0, 0] });
      // soft shadows on the ground under everything near it
      c.fillStyle = '#00000022';
      for (const t of phys.things) {
        if (t.fixed || t.life != null) continue;
        const co = Math.abs(Math.cos(t.sangle)), si = Math.abs(Math.sin(t.sangle));
        const hw = t.r || ((t.w || 40) * co + (t.h || 20) * si) / 2, hh = t.r || ((t.w || 40) * si + (t.h || 20) * co) / 2, gap = GY - (t.sy + hh);
        if (gap < 40 && gap > -6) { const k = 1 - Math.max(0, gap) / 40; c.beginPath(); c.ellipse(t.sx, GY + 1, hw * k + 2, 2.5 * k, 0, 0, 7); c.fill(); }
      }
      for (const t of phys.things) if (t.rock) { c.fillStyle = '#00000030'; c.fillRect(t.x - t.w / 2 + 2, t.y - t.h / 2 + 3, t.w, t.h); plinth(t.w, t.h).draw(c, t.x, t.y); }
      const a = aim(), pull = a ? a.l / K.pull : 0, ready2 = loaded();
      const px = ready2 ? SX - (a ? a.dx : 0) : SX, py = ready2 ? SY - (a ? a.dy : 0) : SY + 4;
      drawSling(c, false, px, py, pull);
      for (const t of phys.things) {
        if (t.fixed || t.tag === 'stone') continue;
        if (t.life != null) drawBit(c, t); else if (isBlob(t)) drawBlob(c, t); else drawPart(c, t);
      }
      c.fillStyle = '#ffffffb0';
      for (let i = 0; i < trail.length; i++) { c.beginPath(); c.arc(trail[i][0], trail[i][1], i % 3 ? 1.6 : 2.6, 0, 7); c.fill(); }
      for (const s of spent) drawStone(c, s.sx, s.sy, s.sangle, clamp(s.fade / .5, 0, 1));
      if (flying) drawStone(c, flying.sx, flying.sy, flying.sangle);
      if (ready2) drawStone(c, px, py, 0);
      drawSling(c, true, px, py, pull);
      if (ready2 && a && a.l > 6 && K.preview > 0) {   // where it's heading, for the first moment of flight
        const vx = a.dx * K.power, vy = a.dy * K.power;
        for (let i = 1; i <= 9; i++) { const tt = i / 9 * K.preview, x = px + vx * tt, y = py + vy * tt + .5 * K.gravity * tt * tt; c.fillStyle = `rgba(255,255,255,${.9 - i * .08})`; c.beginPath(); c.arc(x, y, 3 - i * .2, 0, 7); c.fill(); }
      }
      // the stones still to come wait on the mound
      for (let i = 0; i < shots - (ready2 ? 1 : 0); i++) drawStone(c, 22 + i * 15, mound(22 + i * 15) - 7, i);
      c.restore();
      feel.end(c, W, H);
      // HUD, clear of the app's score badge
      const sa = api.scoreArea(), hy = sa.y + sa.h / 2;
      c.textBaseline = 'middle'; c.font = '800 17px Rubik, sans-serif'; c.lineWidth = 4; c.strokeStyle = '#1d3b52a0';
      c.textAlign = 'left'; c.strokeText('Fort ' + level, 16, hy); c.fillStyle = '#ffffff'; c.fillText('Fort ' + level, 16, hy);
      const n = grumps(), tx = W - 16;
      c.textAlign = 'right'; c.strokeText('' + n, tx, hy); c.fillText('' + n, tx, hy);
      const bx = tx - c.measureText('' + n).width - 14;
      c.fillStyle = '#6cc644'; c.beginPath(); c.arc(bx, hy, 8, 0, 7); c.fill(); c.strokeStyle = '#2b5f1d'; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(bx - 3, hy - 1, 2.2, 0, 7); c.arc(bx + 3, hy - 1, 2.2, 0, 7); c.fill();
      if (best > 1) { c.font = '600 12px Rubik, sans-serif'; c.textAlign = 'left'; c.fillStyle = '#ffffffc0'; c.fillText('Best: fort ' + best, 16, hy + 20); }
      if (msg && msg.t < 1.8) {
        const k = ease.outBack(clamp(msg.t / .35, 0, 1)), fade = clamp((1.8 - msg.t) / .4, 0, 1);
        c.save(); c.globalAlpha = fade; c.translate(W / 2, 200); c.scale(k, k);
        c.font = '900 34px Rubik, sans-serif'; c.textAlign = 'center'; c.lineWidth = 7; c.strokeStyle = '#7a3b12'; c.strokeText(msg.text, 0, 0);
        c.fillStyle = '#ffd23f'; c.fillText(msg.text, 0, 0); c.restore();
      }
      c.textBaseline = 'alphabetic';
      ready.draw(c, W, H, { y: 300 });
    },
    down(x, y) {
      ready.go(); [x, y] = view(x, y);
      look = { x, y };
      if (!loaded()) return;
      drag = { x, y, cx: x, cy: y };
      sounds.pluck(.8);
    },
    move(x, y, pressed) { if (drag && pressed) [drag.cx, drag.cy] = view(x, y); },
    up() {
      const a = aim(); drag = null;
      if (!a || a.l < 8 || !loaded()) return;
      fire(a);
    },
    key(k, down) { if (down && k === ' ' && loaded()) { ready.go(); fire({ dx: 62, dy: -52, l: 80 }); } },
    debug(c) { phys.debugDraw(c); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'sling-smash', title: 'Sling Smash', tag: 'Casual · Physics', retro: false, w: W, h: H,
  tick: 60, music: 'silly', goal: 12,
  hint: 'Drag back anywhere and let go to fling a stone. Snap planks, smash glass and pop powder kegs to bring the forts down on the grumpy blobs. Clear them all to reach the next fort; unused stones are bonus points.',
  make,
};
