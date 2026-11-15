// Castle Lanes: two castles, three lanes. Pick a soldier card, then tap a lane to send it marching. Swords
// beat bows, bows beat spears, spears beat swords, and soldiers that reach the far castle knock its walls
// down. Bread refills over time, so spend it well. Topple the enemy castle to face a tougher one.
// The enemy commander has two Tiny Brains: a habit reader (gs.brains.Predict) that learns which soldier
// you tend to send next, so it can have the counter on its way, and the win-rate dial (gs.brains.Dial)
// that sets how often it trusts that guess and how fast its bread comes in, so each castle stays a
// fair fight for this player. A "?" over its castle shows when it has read your next soldier.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { rnd } = gs.util;
const { Predict, Dial } = gs.brains;

let W = 360, H = 640;
const KINDS = {
  sword: { cost: 2, hp: 6, atk: 2, speed: 34, beats: 'bow', sign: 'S', col: '#e63946' },
  spear: { cost: 3, hp: 7, atk: 2, speed: 28, beats: 'sword', sign: 'P', col: '#457b9d' },
  bow: { cost: 3, hp: 4, atk: 2, speed: 30, beats: 'spear', sign: 'B', col: '#2a9d8f', range: 60 },
};
const NAMES = ['sword', 'spear', 'bow'];

function make(api) {
  const feel = new Feel();
  let units, bread, foe, me, them, pick, score, level, t, aiT, msg, ml, ended, read = 0, lastLane = 1;
  const habits = new Predict(api, { name: 'castle-lanes-habits', moves: NAMES });
  const dial = new Dial(api, { name: 'castle-lanes', target: .6 });
  const laneX = i => W * (i + .5) / 3, TOPY = 110, BOTY = () => H - 170;

  function newLevel() { level++; me = me ?? 20; them = 12 + level * 4; units = []; foe = 5; aiT = 2; }
  function spawn(side, kind, lane) {
    const k = KINDS[kind];
    units.push({ side, kind, lane, y: side === 1 ? BOTY() : TOPY, hp: k.hp, cd: 0 });
    sfx(side === 1 ? 500 : 300, .06, 'square', .03);
  }

  return {
    reset() { bread = 5; me = 20; score = 0; level = 0; t = 0; pick = null; msg = ''; ml = 0; ended = false; newLevel(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt;
      bread = Math.min(10, bread + dt * .7); foe = Math.min(10, foe + dt * (.55 + level * .08) * (.85 + .3 * dial)); read = Math.max(0, read - dt);
      // the enemy commander: answers your soldiers with their counter, or pushes a lane
      aiT -= dt;
      if (aiT <= 0) {
        aiT = rnd(.8, 1.6);
        const mine = units.filter(u => u.side === 1 && u.y < H * .65).sort((a, b) => a.y - b.y)[0];
        let kind, lane;
        const next = habits.guess();
        // it has read your next soldier: send its counter down the lane you used last
        if (next && habits.sure > .4 && Math.random() < dial * .7) { kind = NAMES.find(n => KINDS[n].beats === next); lane = lastLane; read = 1.2; }
        else if (mine && Math.random() < .7) { kind = NAMES.find(n => KINDS[n].beats === mine.kind); lane = mine.lane; }
        else { kind = NAMES[Math.random() * 3 | 0]; lane = Math.random() * 3 | 0; }
        if (foe >= KINDS[kind].cost) { foe -= KINDS[kind].cost; spawn(-1, kind, lane); }
      }
      for (const u of units) {
        const k = KINDS[u.kind]; u.cd -= dt;
        const foes = units.filter(o => o.side !== u.side && o.lane === u.lane && o.hp > 0);
        const near = foes.filter(o => Math.abs(o.y - u.y) < (k.range || 22)).sort((a, b) => Math.abs(a.y - u.y) - Math.abs(b.y - u.y))[0];
        if (near) { if (u.cd <= 0) { u.cd = .8; near.hp -= k.atk * (k.beats === near.kind ? 2 : 1); if (near.hp <= 0 && u.side === 1) { score++; api.score(score); } sfx(200 + Math.random() * 100, .03, 'square', .02); } continue; }
        u.y -= u.side * k.speed * dt;
        if (u.side === 1 && u.y <= TOPY - 10) { u.hp = 0; them -= 2; score += 2; api.score(score); feel.hit(laneX(u.lane), TOPY - 20, { power: .5 }); haptic('light'); }
        if (u.side === -1 && u.y >= BOTY() + 10) { u.hp = 0; me -= 2; feel.hurt(laneX(u.lane), BOTY() + 20); haptic('error'); }
      }
      units = units.filter(u => u.hp > 0);
      if (them <= 0) { score += 10; api.score(score); notes('C5 E5 G5 C6', { len: .07 }); feel.win(W / 2, 80); haptic('success'); msg = `Castle ${level} falls!`; ml = 2; dial.result(true); newLevel(); }
      if (me <= 0 && !ended) { ended = true; dial.result(false); feel.lose(); api.over(); }
    },
    draw(c) {
      c.fillStyle = '#8ab17d'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 3; i++) { c.fillStyle = '#e9c46a80'; c.fillRect(laneX(i) - 26, TOPY, 52, BOTY() - TOPY); }
      // castles
      const castle = (y, hp, max, col, flip) => { c.fillStyle = col; c.fillRect(20, y - 24, W - 40, 40); for (let x = 20; x < W - 20; x += 24) c.fillRect(x, y - (flip ? -16 : 34), 14, 12); c.fillStyle = '#00000040'; c.fillRect(40, y - 6, W - 80, 8); c.fillStyle = '#ffd166'; c.fillRect(40, y - 6, (W - 80) * Math.max(0, hp / max), 8); };
      castle(TOPY - 30, them, 12 + level * 4, '#6d597a', false);
      castle(BOTY() + 34, me, 20, '#7f5539', true);
      if (read > 0) {   // the commander read your next soldier: its counter is coming down this lane
        c.globalAlpha = Math.min(1, read * 2); c.fillStyle = '#ffd166'; c.font = '800 20px Rubik, sans-serif'; c.textAlign = 'center';
        c.fillText('?', laneX(lastLane), TOPY + 24 - Math.sin(t * 8) * 2); c.globalAlpha = 1;
      }
      feel.begin(c);
      // one-time pick highlight shows lanes are tappable
      if (pick) for (let i = 0; i < 3; i++) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.setLineDash([6, 6]); c.strokeRect(laneX(i) - 26, TOPY, 52, BOTY() - TOPY); c.setLineDash([]); }
      for (const u of units) {
        const k = KINDS[u.kind], x = laneX(u.lane) + (u.side === 1 ? 6 : -6), y = u.y;
        c.fillStyle = u.side === 1 ? '#1d3557' : '#6a040f'; c.beginPath(); c.arc(x, y, 12, 0, 7); c.fill();
        c.fillStyle = k.col; c.beginPath(); c.arc(x, y, 8, 0, 7); c.fill();
        c.fillStyle = '#fff'; c.font = '700 11px sans-serif'; c.textAlign = 'center'; c.fillText(k.sign, x, y + 4);
        c.fillStyle = '#00000060'; c.fillRect(x - 10, y + 14, 20, 3); c.fillStyle = '#fff'; c.fillRect(x - 10, y + 14, 20 * u.hp / k.hp, 3);
      }
      feel.end(c, W, H);
      // cards and bread
      NAMES.forEach((n, i) => {
        const k = KINDS[n], x = 20 + i * ((W - 40) / 3), w = (W - 40) / 3 - 8, y = H - 104, ok = bread >= k.cost;
        c.fillStyle = pick === n ? '#ffd166' : ok ? '#fefae0' : '#fefae060'; c.beginPath(); c.roundRect(x, y, w, 70, 10); c.fill();
        c.fillStyle = k.col; c.beginPath(); c.arc(x + w / 2, y + 24, 14, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = '700 14px sans-serif'; c.textAlign = 'center'; c.fillText(k.sign, x + w / 2, y + 29);
        c.fillStyle = '#283618'; c.font = '700 12px Rubik, sans-serif'; c.fillText(`${n} · ${k.cost} bread`, x + w / 2, y + 58);
      });
      c.fillStyle = '#00000040'; c.fillRect(20, H - 24, W - 40, 10); c.fillStyle = '#dda15e'; c.fillRect(20, H - 24, (W - 40) * bread / 10, 10);
      c.fillStyle = '#283618'; c.font = '700 12px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText(`bread ${Math.floor(bread)}`, 20, H - 30);
      c.textAlign = 'center';
      if (ml > 0) { c.fillStyle = '#fff'; c.font = '800 24px Rubik, sans-serif'; c.fillText(msg, W / 2, H * .45); }
      else if (t < 6) { c.fillStyle = '#283618'; c.font = '600 13px Rubik, sans-serif'; c.fillText('Tap a card, then a lane. Sword > bow > spear > sword', W / 2, H * .45); }
    },
    down(x, y) {
      if (y > H - 110) { const i = Math.floor((x - 20) / ((W - 40) / 3)); const n = NAMES[i]; if (n && bread >= KINDS[n].cost) { pick = pick === n ? null : n; sfx(700, .03, 'square', .02); haptic('tick'); } return; }
      if (!pick) return;
      const lane = Math.min(2, Math.max(0, Math.floor(x / (W / 3))));
      if (bread >= KINDS[pick].cost) { bread -= KINDS[pick].cost; spawn(1, pick, lane); habits.see(pick); lastLane = lane; haptic('light'); }
      if (bread < KINDS[pick].cost) pick = null;
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'castle-lanes',
  title: 'Castle Lanes',
  tag: 'Casual · Strategy',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 80,
  hint: 'Tap a soldier card, then a lane to send it. Swords beat bows, bows beat spears, spears beat swords. Reach the enemy castle to knock it down before yours falls.',
  make,
};
