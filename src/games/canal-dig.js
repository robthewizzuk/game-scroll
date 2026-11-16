// Canal Dig: a tank of water sits at the top of a hill of earth, and thirsty flower pots are buried below.
// Drag your finger to dig tunnels: the water flows wherever you open a way, sand pockets slump into your
// tunnels and grey rock won't dig. Fill a pot to make it bloom. Fill all three for a bonus and a new hill.
import gs from '../gamescroll.js';
const { Ready } = gs.rounds;
const { Feel } = gs.effects;
const { Sand, M } = gs.sand;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes, noise } = gs.sound;
const { rng } = gs.math;

let W = 176, H = 208;
const GW = 88, GH = 96, S = 2, TOP = 16;   // the grid: 88 x 96 cells drawn 2 x 2 under a 16-pixel HUD
const FULL = 26;                           // water cells a pot needs to bloom

function make(api) {
  const ready = new Ready({ eat: false });   // the round starts on the first touch
  const feel = new Feel({ pixel: true });
  let sand, pots, score, t, time, level, last, ended, splash;

  function build() {
    level++;
    const r = rng(level * 7919 + (Math.random() * 1e6 | 0));
    sand = new Sand(GW, GH, { seed: level * 31 + 7 });
    // a rolling hill of earth with pockets of loose sand and a few rocks
    const surf = x => 22 + Math.round(Math.sin(x / 13 + level) * 3);
    sand.fill((x, y) => y >= surf(x) ? M.DIRT : M.EMPTY);
    for (let i = 0; i < 4 + level; i++) sand.paint(4 + r() * (GW - 8), 34 + r() * (GH - 44), 3 + r() * 4, M.SAND, { over: true });
    for (let i = 0; i < 2 + Math.min(5, level); i++) sand.paint(6 + r() * (GW - 12), 34 + r() * (GH - 44), 2 + r() * 3, M.STONE, { over: true });
    // the tank: stone walls on top of the hill, full of water; dig under it to let it out
    const tx = 6 + Math.floor(r() * (GW - 34)), tw = 22;
    for (let y = 6; y <= 20; y++) for (let x = tx; x < tx + tw; x++) {
      const edge = x === tx || x === tx + tw - 1;
      sand.set(x, y, edge ? M.WALL : y > 8 ? M.WATER : M.EMPTY);
    }
    for (let x = tx; x < tx + tw; x++) for (let y = 21; y < surf(x); y++) sand.set(x, y, M.DIRT);
    // three pots further down, spread across, walls of stone with an open top
    pots = [];
    for (let i = 0; i < 3; i++) {
      const px = 4 + i * 28 + Math.floor(r() * 12), py = 54 + Math.floor(r() * 30), pw = 12, ph = 8;
      for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) {
        const wall = x === px || x === px + pw - 1 || y === py + ph - 1;
        sand.set(x, y, wall ? M.WALL : M.EMPTY);
      }
      for (let x = px - 1; x <= px + pw; x++) for (let y = py - 3; y < py; y++) sand.set(x, y, M.DIRT);   // an earth lid, so nothing falls in until you dig
      pots.push({ x: px, y: py, w: pw, h: ph, full: false, bloom: 0 });
    }
    time = 40; splash = 0;
  }
  function dig(gx, gy) {
    let n = 0;
    for (let y = gy - 3; y <= gy + 3; y++) for (let x = gx - 3; x <= gx + 3; x++) {
      if ((x - gx) ** 2 + (y - gy) ** 2 > 10) continue;
      const m = sand.get(x, y); if (m === M.DIRT || m === M.SAND) { sand.set(x, y, M.EMPTY); n++; }
    }
    if (n && Math.random() < .25) noise(.04, { vol: .03, from: 900, to: 400 });
  }
  function at(x, y) { return [Math.floor(x / S), Math.floor((y - TOP) / S)]; }

  return {
    reset() { score = 0; t = 0; level = 0; last = null; ready.reset(); ended = false; build(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; sand.update(dt);
      if (!ready.playing) return;
      time -= dt; splash = Math.max(0, splash - dt);
      let done = 0;
      for (const p of pots) {
        if (p.full) { done++; p.bloom = Math.min(1, p.bloom + dt * 2); continue; }
        const w = sand.count(M.WATER, p.x + 1, p.y, p.w - 2, p.h - 1);
        p.fill = w / FULL;
        if (w >= FULL) {
          p.full = true; done++; score += 1; api.score(score);
          notes('E5 G5 C6', { len: .06 }); feel.coin((p.x + p.w / 2) * S, TOP + p.y * S); haptic('success');
        }
      }
      if (done === 3) { score += 2; api.score(score); feel.win(W / 2, H / 2); notes('C5 E5 G5 C6', { len: .07 }); feel.juice.pop(W / 2, 70, 'ALL BLOOMING +2', { color: '#ffe066' }); build(); return; }
      if (time <= 0) {
        if (done === 0 && !ended) { ended = true; feel.lose(); api.over(); return; }
        if (!ended) { feel.juice.pop(W / 2, 70, 'NEW HILL', { color: '#fff' }); build(); }
      }
    },
    draw(c) {
      // sky and the grid
      c.fillStyle = '#7ec8f0'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#3a2614'; c.fillRect(0, TOP + 30 * S, W, H);
      c.fillStyle = '#ffe066'; c.fillRect(W - 26, TOP + 4, 10, 10);
      feel.begin(c);
      c.imageSmoothingEnabled = false;
      c.drawImage(sand.picture([0, 0, 0, 0]), 0, TOP, GW * S, GH * S);
      // pots: a fill bar and a flower once full
      for (const p of pots) {
        const x = p.x * S, y = TOP + p.y * S, w = p.w * S;
        c.fillStyle = '#b5552b'; c.fillRect(x, y - 2, w, 2);
        if (p.full) {
          const g = Math.round(p.bloom * 10);
          c.fillStyle = '#3c9a3c'; c.fillRect(x + w / 2 - 1, y - 2 - g, 2, g);
          c.fillStyle = '#ff6fa8'; c.fillRect(x + w / 2 - 4, y - 6 - g, 8, 6); c.fillStyle = '#ffe066'; c.fillRect(x + w / 2 - 1, y - 4 - g, 2, 2);
        } else {
          c.fillStyle = '#00000060'; c.fillRect(x + 2, y - 7, w - 4, 3);
          c.fillStyle = '#5ab4ff'; c.fillRect(x + 2, y - 7, Math.round((w - 4) * Math.min(1, p.fill || 0)), 3);
        }
      }
      feel.end(c, W, H);
      c.fillStyle = '#1b2a3a'; c.fillRect(0, 0, W, TOP);
      text(c, `${score}`, 4, 5, { color: '#fff' });
      text(c, `HILL ${level}`, 40, 5, { color: '#9fd8ff' });
      text(c, `${Math.max(0, Math.ceil(time))}S`, W - 4, 5, { align: 'right', color: time < 8 && (t * 4 | 0) % 2 ? '#ff6060' : '#fff' });
      if (!ready.playing) { c.fillStyle = '#000000a0'; c.fillRect(8, H / 2 - 18, W - 16, 30); text(c, 'DRAG TO DIG A WAY', W / 2, H / 2 - 12, { align: 'center', color: '#fff' }); text(c, 'FROM THE WATER TO THE POTS', W / 2, H / 2, { align: 'center', color: '#9fd8ff' }); }
    },
    down(x, y) { ready.go(); last = at(x, y); dig(...last); haptic('tick'); },
    move(x, y, pressed) {
      if (!pressed || !last) return;
      const [gx, gy] = at(x, y), steps = Math.max(1, Math.ceil(Math.hypot(gx - last[0], gy - last[1]) / 2));
      for (let i = 1; i <= steps; i++) dig(Math.round(last[0] + (gx - last[0]) * i / steps), Math.round(last[1] + (gy - last[1]) * i / steps));
      last = [gx, gy];
    },
    up() { last = null; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'canal-dig',
  title: 'Canal Dig',
  tag: 'Advance · Physics',
  retro: true, era: 'advance', pal: 'lemon',
  w: 176, h: 208, maxW: 176, maxH: 208,
  goal: 12,
  hint: 'Drag to dig tunnels so the water in the tank flows down into the flower pots. Rock won\'t dig and sand slumps in. Fill all three for a bonus.',
  make,
};
