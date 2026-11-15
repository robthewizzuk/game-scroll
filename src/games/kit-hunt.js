import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { rnd } = gs.util;
const { backdrop, box, shadow, glow } = gs.gfx;
const { brick, BRICK_KEYS } = gs.bricks;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

// Five kit pieces are hidden inside the brick furniture in this room. Hold and drag your finger
// around to use the detector: the meter climbs, it beeps faster and your phone buzzes harder as
// you get close. Tap an object to smash it open. You only have so many hammer swings, so use the
// detector first. The detector battery is short, so sweep smartly. Each piece found tops the
// battery up a little, and pieces found in a row score a streak bonus. Smashing an empty object
// still tells you how warm that spot was. Find enough pieces to unlock the next room.
let W = 176, H = 192;

// Rooms change their wallpaper as you go deeper
const ROOMS = [
  { wall: ['#e0c8a0', '#a88860'], stripe: '#ffffff0c', rail: '#8c6c48', hud: ['#4a3624', '#281a10'] },
  { wall: ['#b8d0e0', '#7890a8'], stripe: '#ffffff10', rail: '#506878', hud: ['#283848', '#141c28'] },
  { wall: ['#d8c0e0', '#9878a8'], stripe: '#ffffff0e', rail: '#684878', hud: ['#3a2848', '#1c1028'] },
  { wall: ['#c8e0b0', '#88a870'], stripe: '#ffffff0c', rail: '#587848', hud: ['#2c4024', '#141e10'] },
];
const HOT = '#f84040', WARM = '#f8a020', COLD = '#40a0f8';
const heatCol = k => (k > .8 ? HOT : k > .5 ? WARM : COLD);

function make(api) {
  let objs, swings, found, battery, need, room, score, t, probe, parts, pops, msg, dead, end, tap, pulseT, streak, shake, swing;
  let layer = null, dirty = true;   // the room (walls, floor, closed furniture) drawn once, redrawn only when it changes
  const top = 26;
  const look = () => ROOMS[(room - 1) % ROOMS.length];
  function build() {
    objs = []; const cols = 5, rows = 5 + (H > 230 ? 1 : 0), cw = (W - 12) / cols, rh = (H - top - 8) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (Math.random() < .15) continue;
      const w = Math.round(rnd(cw * .55, cw * .85)), h = Math.round(rnd(rh * .5, rh * .8));
      objs.push({ x: Math.round(6 + c * cw + (cw - w) / 2 + rnd(-3, 3)), y: Math.round(top + r * rh + (rh - h)), w, h, col: BRICK_KEYS[Math.random() * BRICK_KEYS.length | 0], piece: false, open: 0, heat: null });
    }
    const idx = shuffle(objs.map((_, i) => i)).slice(0, 5); for (const i of idx) objs[i].piece = true;
    swings = Math.max(6, 10 - Math.floor(room / 2)); battery = Math.max(3.5, 7.5 - room * .4); need = room > 4 ? 4 : 3; found = 0; end = 0; streak = 0;
    msg = { txt: `ROOM ${room}: FIND ${need} OF 5`, l: 1.6 }; dirty = true;
  }
  const centre = o => [o.x + o.w / 2, o.y + o.h / 2];
  function nearest(x, y) { let d = 1e9; for (const o of objs) if (o.piece && !o.open) { const [cx, cy] = centre(o); d = Math.min(d, Math.hypot(cx - x, cy - y)); } return d; }
  const heatAt = d => (d < 22 ? 1 : d < 40 ? .66 : d < 70 ? .33 : .05);
  function burst(x, y, col, n = 10) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-60, 60), vy: rnd(-80, 10), l: .5, col }); }
  function pop(txt, x, y, col = '#f8e040') { pops.push({ txt, x, y, col, l: 1 }); }
  function finish() {
    end = .01;
    if (found >= need) {
      score += found * 10 + swings * 3; if (found === 5) score += 20; api.score(score);
      msg = { txt: found === 5 ? 'FULL KIT! BONUS' : `${found}/5 FOUND`, l: 1.6 }; haptic('success'); sfx(880, .4, 'square', .05, 500);
    } else { msg = { txt: `ONLY ${found}/5...`, l: 9 }; dead = .01; haptic('error'); sfx(140, .5, 'square', .05, -60); }
  }
  function drawRoom(c) {
    const L = look();
    backdrop(c, 0, 0, W, H, L.wall[0], L.wall[1]);
    for (let y = top; y < H; y += 8) { c.fillStyle = (y / 8) % 2 ? '#0000000c' : L.stripe; c.fillRect(0, y, W, 8); c.fillStyle = '#00000018'; c.fillRect(0, y + 7, W, 1); }
    box(c, 0, top - 5, W, 5, L.rail, { r: 0, drop: false });
    for (const o of objs) if (!o.open) shadow(c, o.x + o.w / 2, o.y + o.h, o.w * .6, 3, .3);
    for (const o of objs) {
      if (o.open) continue;
      const n = Math.max(1, Math.round(o.h / 7)), bh = o.h / n;
      for (let i = 0; i < n; i++) brick(c, o.x + (i % 2), o.y + i * bh, o.w - (i % 2) * 2, bh, o.col, 5);
    }
    backdrop(c, 0, 0, W, top - 4, L.hud[0], L.hud[1]);
  }
  function roomLayer() {
    if (!layer || layer.width !== W || layer.height !== H) { layer = document.createElement('canvas'); layer.width = W; layer.height = H; dirty = true; }
    if (dirty) { const lc = layer.getContext('2d'); lc.clearRect(0, 0, W, H); drawRoom(lc); dirty = false; }
    return layer;
  }
  function gem(c, x, y, s = 1) { c.fillStyle = '#f8e040'; c.beginPath(); c.moveTo(x, y - 6 * s); c.lineTo(x + 5 * s, y); c.lineTo(x, y + 6 * s); c.lineTo(x - 5 * s, y); c.fill(); c.fillStyle = '#fff8c0'; c.fillRect(x - 1, y - 3 * s, 2, 2); }

  const self = {
    reset() { room = 1; score = 0; t = 0; probe = null; tap = null; parts = []; pops = []; dead = 0; pulseT = 0; shake = 0; swing = null; build(); },
    resize(w, h) { if (w === W && h === H) return; W = w; H = h; if (objs) build(); },
    snapshot() { return { room, score }; },
    restore(d) { room = d.room; score = d.score; build(); },
    update(dt) {
      t += dt; shake = Math.max(0, shake - dt);
      for (const p of parts) { p.l -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; } parts = parts.filter(p => p.l > 0);
      for (const p of pops) { p.l -= dt; p.y -= 16 * dt; } pops = pops.filter(p => p.l > 0);
      for (const o of objs) if (o.open) o.open += dt;
      if (swing) { swing.l -= dt; if (swing.l <= 0) swing = null; }
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.8) api.over(); return; }
      if (end) { end += dt; if (end > 1.8) { room++; build(); } return; }
      if (probe && !probe.on && t - probe.t0 > .2) probe.on = true;
      if (probe && probe.on && battery > 0) {
        battery = Math.max(0, battery - dt); const k = heatAt(nearest(probe.x, probe.y)); probe.k = k;
        pulseT -= dt; if (pulseT <= 0) { pulseT = .55 - k * .47; sfx(400 + k * 900, .03, 'square', .03); haptic(k > .8 ? 'heavy' : k > .5 ? 'medium' : k > .25 ? 'light' : 'tick'); }
        if (battery === 0) { sfx(180, .25, 'square', .04, -80); haptic('warning'); pop('BATTERY FLAT', probe.x - 28, probe.y - 10, '#f86060'); }
      }
    },
    draw(c) {
      const sx = shake ? Math.round(rnd(-2, 2) * gs.prefs.motion) : 0;
      c.save(); c.translate(sx, 0);
      c.drawImage(roomLayer(), 0, 0);
      // opened furniture: the bricks fall apart; pieces float up, empty ones show how warm they were
      for (const o of objs) {
        if (!o.open) continue;
        const k = Math.min(1, o.open * 3);
        for (let i = 0; i < 3; i++) brick(c, o.x + i * o.w / 3 + (i - 1) * k * 6, o.y + o.h - 4 + k * 2, o.w / 3, 4, o.col, 4);
        const [cx] = centre(o);
        if (o.piece) { const py = o.y + o.h / 2 - Math.min(10, o.open * 30); glow(c, cx, py, 14, '#f8e040', .5); gem(c, cx, py); }
        else if (o.heat != null) { c.fillStyle = heatCol(o.heat); c.fillRect(Math.round(cx - 4), o.y + o.h - 9, 8, 2); }
      }
      // the hammer coming down
      if (swing) { const k = swing.l / .18, a = -1.2 * k; c.save(); c.translate(swing.x + 6, swing.y - 2); c.rotate(a); c.fillStyle = '#8c6c48'; c.fillRect(-1, -14, 2, 14); c.fillStyle = '#9098a8'; c.fillRect(-5, -18, 10, 5); c.fillStyle = '#d0d8e0'; c.fillRect(-5, -18, 10, 1); c.restore(); }
      if (probe && probe.on && battery > 0) {
        const k = probe.k || 0, r = 10 + Math.sin(t * (6 + k * 20)) * 2, col = heatCol(k);
        glow(c, probe.x, probe.y, r * 2, col, .35); c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(probe.x, probe.y, r, 0, 7); c.stroke(); c.lineWidth = 1;
      }
      for (const p of parts) { c.fillStyle = p.col; c.fillRect(p.x | 0, p.y | 0, 2, 2); }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left';
      for (const p of pops) { c.globalAlpha = Math.min(1, p.l * 2); c.fillStyle = '#000'; c.fillText(p.txt, p.x + 1, p.y + 1); c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); } c.globalAlpha = 1;
      c.restore();
      // HUD (its background is in the room layer)
      for (let i = 0; i < 5; i++) { c.fillStyle = i < found ? '#f8e040' : '#584838'; c.beginPath(); const x = 6 + i * 10, y = 7; c.moveTo(x, y - 4); c.lineTo(x + 4, y); c.lineTo(x, y + 4); c.lineTo(x - 4, y); c.fill(); if (i === need - 1) { c.fillStyle = '#e0d0b080'; c.fillRect(x + 5, 2, 1, 10); } }
      c.textAlign = 'left'; c.fillStyle = '#e0d0b0'; c.fillText(`ROOM ${room}`, 4, 19);
      c.fillStyle = battery > 0 ? (battery < 1.5 && (t * 4 | 0) % 2 ? '#f8a020' : '#a0d0ff') : '#f86060'; c.fillText(battery > 0 ? `${battery.toFixed(1)}s` : 'FLAT', 60, 19);
      c.textAlign = 'right'; c.fillStyle = swings <= 2 ? '#f8a020' : '#e0d0b0'; c.fillText(`SWINGS ${swings}`, W - 4, 9);
      const k = probe && probe.on && battery > 0 ? probe.k || 0 : 0; c.fillStyle = '#584838'; c.fillRect(W - 54, 13, 50, 5); c.fillStyle = heatCol(k); c.fillRect(W - 54, 13, 50 * k, 5);
      if (streak > 1) { c.textAlign = 'left'; c.fillStyle = '#f8e040'; c.fillText(`x${streak}`, 108, 19); }
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000b'; c.fillRect(0, H / 2 - 10, W, 14); c.fillStyle = dead ? '#f86060' : '#f8e040'; c.fillText(msg.txt, W / 2, H / 2); }
      if (t < 7 && !msg) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H - 22, W, 20); c.fillStyle = '#f8f8f0'; c.fillText('HOLD + DRAG: DETECTOR', W / 2, H - 14); c.fillText('TAP: SMASH', W / 2, H - 5); }
    },
    down(x, y) { tap = { x, y, t }; probe = { x, y, on: false, t0: t }; },
    move(x, y, p) { if (!p || !probe) return; probe.x = x; probe.y = y; if (!probe.on && Math.hypot(x - tap.x, y - tap.y) > 8) probe.on = true; },
    up() {
      const quick = tap && t - tap.t < .22 && !(probe && probe.on); probe = null;
      if (!quick || dead || end) return;
      const o = objs.find(o => !o.open && tap.x > o.x - 2 && tap.x < o.x + o.w + 2 && tap.y > o.y - 2 && tap.y < o.y + o.h + 2); if (!o) return;
      if (swings <= 0) { sfx(120, .08, 'square', .03); return; }
      const [cx, cy] = centre(o);
      swings--; o.open = .01; dirty = true; swing = { x: cx, y: o.y, l: .18 }; shake = .12;
      burst(cx, cy, '#f0c020'); sfx(220, .1, 'square', .05, -80);
      if (o.piece) {
        found++; streak++; const bonus = streak > 1 ? streak * 2 : 0; score += 5 + bonus; api.score(score);
        battery = battery > 0 ? battery + 1 : battery;   // a little more detector time (a flat battery stays flat)
        haptic('success'); sfx(1200, .25, 'square', .05, 600); burst(cx, cy, '#f8e040', 14);
        pop(bonus ? `PIECE! +${bonus}` : 'PIECE!', o.x, o.y);
      } else {
        streak = 0; score += 1; api.score(score); haptic('medium');
        o.heat = heatAt(nearest(cx, cy)); pop(o.heat > .5 ? 'WARM...' : 'COLD', o.x, o.y, heatCol(o.heat));
      }
      if (found >= 5 || swings <= 0) finish();
    },
    key() {},
  };
  return self;
}

export default {
  id: 'kit-hunt', title: 'Kit Hunt', tag: 'Bricks · Phone', retro: true, era: 'advance', pal: 'lemon', w: 176, h: 192, maxW: 260, maxH: 320, goal: 150,
  hint: 'Five kit pieces hide in the brick furniture. Hold and drag to sweep the detector: it beeps faster, the bar fills and your phone buzzes harder as you get close. Tap an object to smash it open, but swings are limited. The detector battery only lasts a few seconds per room, and each piece found adds a second. Find the number of pieces shown to reach the next room.',
  make,
};
