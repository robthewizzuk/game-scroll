import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;
const { text } = gs.pixel;

// Three doors per room. Each door's sign hints at what's behind it, but signs only tell the odds.
// Skulls hide monsters guarding big hoards, chests can be mimics, hearts heal. Go as deep as you dare.
const P = PAL.rose, W = 160, H = 160;
const SIGNS = ['skull', 'chest', 'heart', 'mystery'];

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  let doors, hp, gold, depth, t, pick, result, wait, maxHp;
  function room() {
    doors = [0, 1, 2].map(() => { const r = Math.random(); return SIGNS[r < .3 ? 0 : r < .62 ? 1 : r < .8 ? 2 : 3]; });
    if (!doors.includes('chest') && !doors.includes('heart')) doors[Math.random() * 3 | 0] = 'chest';
    pick = -1; result = null;
  }
  function open(i) {
    if (pick >= 0) return; pick = i; let sign = doors[i]; const d = depth;
    if (sign === 'mystery') sign = SIGNS[Math.random() * 3 | 0];
    let txt, dg = 0, dh = 0;
    if (sign === 'skull') { const fight = Math.random() < Math.max(.35, .7 - d * .02); dh = fight ? -1 : -2; dg = 5 + d * 2; txt = fight ? 'BEAT IT' : 'OUCH'; }
    else if (sign === 'chest') { if (Math.random() < Math.min(.4, .12 + d * .015)) { dh = -1; txt = 'MIMIC!'; } else { dg = 2 + (d >> 1); txt = 'GOLD'; } }
    else { dh = Math.random() < .25 ? 2 : 1; txt = 'HEAL'; }
    hp = Math.min(maxHp, hp + dh); gold += dg; depth++; api.score(gold + depth);
    result = { txt, dg, dh }; wait = 1.1;
    if (dg) feel.juice.burst(30 + i * 50, 84, { n: Math.min(20, 6 + dg), speed: 50, life: .5, size: 2, color: [P[3], P[2]], gravity: 90 });
    if (dh < 0) { haptic('error'); sfx(140, .25, 'square', .05, -40); feel.juice.shake(hp <= 0 ? 6 : 4); } else if (dg) { haptic('success'); sfx(880, .12, 'square', .04, 200); } else { haptic('light'); sfx(600, .15, 'square', .03, 100); }
  }
  return {
    reset() { hp = 5; maxHp = 5; gold = 0; depth = 0; t = 0; wait = 0; feel.clear(); room(); },
    fx(dt) { feel.update(dt); },
    update(dt) { feel.update(dt); t += dt; if (wait > 0) { wait -= dt; if (wait <= 0) { if (hp <= 0) return api.over(); room(); } } },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = P[2]; for (let y = 16; y < 120; y += 10) for (let x = (y / 10 % 2) * 10; x < W; x += 20) c.fillRect(x, y, 18, 8);
      c.fillStyle = P[1]; c.fillRect(0, 118, W, 42);
      doors.forEach((s, i) => {
        const x = 12 + i * 50, y = 40, isOpen = pick === i;
        c.fillStyle = P[0]; c.fillRect(x - 2, y - 2, 40, 80);
        c.fillStyle = isOpen ? P[0] : P[1]; c.fillRect(x, y, 36, 78);
        if (!isOpen) { c.fillStyle = P[2]; c.fillRect(x + 28, y + 40, 3, 3); }
        // sign above the door
        c.fillStyle = P[3]; c.fillRect(x + 8, y - 22, 20, 16); c.fillStyle = P[0];
        const cx = x + 18, cy = y - 14;
        if (s === 'skull') { c.fillRect(cx - 5, cy - 5, 10, 7); c.fillRect(cx - 3, cy + 2, 6, 3); c.fillStyle = P[3]; c.fillRect(cx - 3, cy - 2, 2, 2); c.fillRect(cx + 1, cy - 2, 2, 2); }
        else if (s === 'chest') { c.fillRect(cx - 6, cy - 3, 12, 8); c.fillStyle = P[2]; c.fillRect(cx - 6, cy - 1, 12, 1); c.fillRect(cx - 1, cy, 2, 2); }
        else if (s === 'heart') { c.fillRect(cx - 5, cy - 4, 4, 3); c.fillRect(cx + 1, cy - 4, 4, 3); c.fillRect(cx - 6, cy - 2, 12, 3); c.fillRect(cx - 4, cy + 1, 8, 2); c.fillRect(cx - 2, cy + 3, 4, 2); }
        else { c.font = '8px "Press Start 2P", monospace'; c.textAlign = 'center'; text(c, '?', cx, cy + 4 - 8, { color: c.fillStyle, align: 'center', font: 'big' }); }
        if (isOpen && result) {
          c.fillStyle = P[3]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(result.txt, x + 18, y + 36);
          if (result.dg) c.fillText(`+${result.dg}`, x + 18, y + 48);
          if (result.dh) c.fillText(`${result.dh > 0 ? '+' : ''}${result.dh}HP`, x + 18, y + 58);
        }
      });
      feel.end(c, W, H);
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = P[0]; c.fillText(`F${depth + 1}`, 4, 10);
      c.textAlign = 'right'; c.fillText(`$${gold}`, W - 4, 10);
      for (let i = 0; i < maxHp; i++) { c.fillStyle = i < hp ? P[3] : P[0]; c.fillRect(6 + i * 9, 132, 6, 6); }
      c.fillStyle = P[3]; c.textAlign = 'left'; c.fillText('HP', 6, 150);
    },
    down(x, y) { if (wait > 0 || y < 18 || y > 120) return; const i = Math.floor((x - 10) / 50); if (i >= 0 && i < 3) open(i); },
    key(k, d) { if (!d) return; const i = { ArrowLeft: 0, ArrowUp: 1, ArrowRight: 2, 1: 0, 2: 1, 3: 2 }[k]; if (i != null && wait <= 0) open(i); },
  };
}

export default {
  id: 'dungeon-door', title: 'Dungeon Door', tag: 'Pocket · Strategy', retro: true, w: W, h: H, pal: 'rose', goal: 60,
  hint: 'Pick a door. Skulls guard big gold but hurt, chests are usually gold but can bite, hearts heal, and ? could be anything. Go as deep as you can.',
  make,
};
