// Sky Drifter: a hot air balloon has no rudder. Hold to fire the burner (it rises slowly, with lag), let go to
// cool and sink. Each band of sky blows its own way at its own speed, so you steer sideways by picking a height.
// Ride the right wind to the flagged field and set down gently. Trees, ponds and plain grass cost a balloon.
import gs from '../gamescroll.js';
const { PAL } = gs.palettes;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { text } = gs.pixel;
const { sounds, bed } = gs.sound;
const { haptic } = gs.device;
const { pix, clamp } = gs.util;

const R = PAL.ice;
const W = 160, H = 160, GROUND = 136;
const BANDS = [24, 46, 68, 90, 112];          // envelope-centre heights of the four wind layers; below 112 is calm
const BALLOON = ['...00000...', '..0212120..', '.021212120.', '02121212120', '02121212120', '02121212120', '.021212120.', '..0212120..', '...02120...', '....000....', '....0.0....', '....0.0....', '...00000...', '...01110...', '...00000...'];
const LIFE = ['.000.', '02120', '02120', '.000.', '..0..'];

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });
  const ready = new Ready({ eat: false });
  let roar = null;
  let x, yb, vx, vy, heat, burn, keyBurn, winds, offs, shuffle, warn, ground, target, lives, score, landings, phase, pt, tleft, tmax, msg, ml, t;

  const dist = (a, b) => { const d = Math.abs(a - b) % W; return Math.min(d, W - d); };
  const layer = cy => { for (let i = 0; i < 4; i++) if (cy < BANDS[i + 1]) return i; return -1; };
  function newWinds() {
    const sp = Math.min(30, 15 + landings * 1.4);
    winds = [0, 1, 2, 3].map(() => (Math.random() < .5 ? -1 : 1) * Math.round(sp * (.45 + Math.random() * .55)));
    if (winds.every(w => w > 0) || winds.every(w => w < 0)) { const i = Math.random() * 4 | 0; winds[i] = -winds[i]; }
    shuffle = Math.max(8, 16 - landings * .6); warn = false;
  }
  function newField() {
    const tw = Math.max(16, 30 - landings * 2);
    let tx; do tx = 6 + Math.random() * (W - 12 - tw) | 0; while (dist(tx + tw / 2, x) < 50);
    target = { x0: tx, x1: tx + tw };
    ground = [];
    const free = (a, b) => (b < target.x0 - 4 || a > target.x1 + 4) && (b < x - 10 || a > x + 10);   // never under the balloon as it lifts off
    for (let n = 0, tries = 0; n < 4 && tries < 40; tries++) {
      const w = 8 + (Math.random() * 12 | 0), a = Math.random() * (W - w) | 0, b = a + w;
      if (free(a, b) && ground.every(s => b < s.x0 - 2 || a > s.x1 + 2)) { ground.push({ x0: a, x1: b, k: n % 2 ? 'pond' : 'tree' }); n++; }
    }
    tmax = tleft = Math.max(20, 34 - landings);
  }
  const under = px => { for (const s of ground) if (px >= s.x0 && px < s.x1) return s.k; return px >= target.x0 && px < target.x1 ? 'field' : 'grass'; };
  const say = (m, s = 1.2) => { msg = m; ml = s; };

  function touchDown(kind) {
    phase = 'landed'; pt = 0; vx = 0;
    if (kind === 'field') {
      const soft = vy < 9, mid = Math.abs(x - (target.x0 + target.x1) / 2) < (target.x1 - target.x0) / 4;
      const pts = (soft ? 3 : 1) + (mid ? 1 : 0);
      score += pts; landings++; api.score(score);
      say(soft ? (mid ? 'BULLSEYE' : 'SOFT') : 'BUMPY'); sounds[soft ? 'tada' : 'thud'](); haptic(soft ? 'success' : 'medium');
      feel.juice.burst(x, yb, { n: soft ? 18 : 8, speed: 60, life: .5, size: 2, color: [R[0], R[2]], angle: -Math.PI / 2, arc: 2.4, gravity: 120 }).pop(x, yb - 26, '+' + pts, { color: R[0] });
      if (!soft) feel.juice.shake(3);
    } else lose(kind === 'tree' ? 'IN THE TREES' : kind === 'pond' ? 'SPLASH!' : 'OFF THE FIELD');
    vy = 0;
  }
  function lose(why) {
    lives--; say(why); phase = 'landed'; pt = 0; vx = 0; vy = 0;
    sounds[why === 'SPLASH!' ? 'splash' : 'thud'](); haptic('error');
    feel.juice.shake(5).burst(x, yb - 4, { n: 14, speed: 70, life: .5, size: 2, color: [R[0], R[1]], gravity: 150 });
  }

  return {
    reset() {
      roar?.stop(); roar = null;   // the app stops beds with each round, so make a fresh one per round
      x = 20; yb = 80; vx = 0; vy = 0; heat = .5; burn = false; keyBurn = false; landings = 0; score = 0; lives = 3; phase = 'fly'; pt = 0; msg = ''; ml = 0; t = 0;
      offs = [0, 0, 0, 0]; newWinds(); newField(); feel.clear(); ready.reset();
    },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      for (let i = 0; i < 4; i++) offs[i] += winds[i] * dt;   // the streamers drift even before the start
      if (!ready.update(dt)) return;
      // the burner roars while it fires: a low rumble with a flickering edge
      const roaring = phase === 'fly' && (burn || keyBurn);
      if (!roar) roar = bed({ vol: 0, from: 240, filter: 'lowpass', q: .9 });
      roar.set({ vol: roaring ? .07 : 0, from: roaring ? 200 + Math.random() * 160 : 140 }, roaring ? .06 : .18);
      if (ml > 0) ml -= dt;
      shuffle -= dt;
      if (shuffle < 1.5 && !warn) { warn = true; sounds.gust(); }
      if (shuffle <= 0) { newWinds(); say('WINDS SHIFT', 1); haptic('light'); }
      if (phase === 'landed') {
        pt += dt;
        if (pt > 1.3) { if (lives <= 0) return api.over(); phase = 'fly'; heat = .9; vy = -4; newField(); }
        return;
      }
      tleft -= dt;
      if (tleft <= 0) {   // the field gives up on you: a balloon lost, a new field, and you keep flying
        lives--; say('TOO LATE'); sounds.buzzer(); haptic('error'); feel.juice.shake(3);
        if (lives <= 0) { roar?.set({ vol: 0 }, .05); return api.over(); }
        newField(); return;
      }
      const on = burn || keyBurn;
      heat = on ? Math.min(1, heat + (1 - heat) * .9 * dt + .05 * dt) : Math.max(0, heat - .28 * dt);
      vy += ((.5 - heat) * 44 - vy * .8) * dt;
      yb += vy * dt;
      if (yb < 38) { yb = 38; vy = Math.max(0, vy); }
      const li = layer(yb - 14), wind = li < 0 ? 0 : winds[li];
      vx += (wind - vx) * Math.min(1, 1.5 * dt);
      x = (x + vx * dt + W) % W;
      const k = under(x);
      if (k === 'tree' && yb > GROUND - 9) return touchDown('tree');
      if (yb >= GROUND) { yb = GROUND; touchDown(k); }
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      // wind layers: band edges, clouds and streamers that drift with each layer
      for (let i = 0; i < 4; i++) {
        const top = BANDS[i] - 8, w = winds[i], blink = warn && (t * 6 | 0) % 2;
        c.fillStyle = R[2]; for (let xx = (i * 3) % 6; xx < W; xx += 6) c.fillRect(xx, top, 2, 1);
        const cx = Math.round(((i * 57 + offs[i] * .6) % W + W) % W);
        for (const dx of [0, -W]) { c.fillRect(cx + dx, top + 8, 16, 4); c.fillRect(cx + dx + 4, top + 5, 8, 3); c.fillRect(cx + dx + 90, top + 13, 12, 3); }
        c.fillStyle = blink ? R[2] : R[1];
        const len = 2 + Math.round(Math.abs(w) / 5);
        for (let j = 0; j < 5; j++) { const sx = Math.round(((j * 37 + i * 11 + offs[i]) % W + W) % W), sy = top + 4 + (j * 7) % 15; c.fillRect(sx, sy, len, 1); c.fillRect(w > 0 ? sx + len - 1 : sx, sy - 1, 1, 3); }
        // arrow at the left edge: which way and how hard
        c.fillStyle = R[0]; const ay = top + 10, n = Math.min(3, 1 + (Math.abs(w) / 10 | 0));
        for (let a = 0; a < n; a++) { const ax = 2 + a * 4; if (w > 0) { c.fillRect(ax, ay - 2, 1, 1); c.fillRect(ax + 1, ay - 1, 1, 1); c.fillRect(ax + 2, ay, 1, 1); c.fillRect(ax + 1, ay + 1, 1, 1); c.fillRect(ax, ay + 2, 1, 1); } else { c.fillRect(ax + 2, ay - 2, 1, 1); c.fillRect(ax + 1, ay - 1, 1, 1); c.fillRect(ax, ay, 1, 1); c.fillRect(ax + 1, ay + 1, 1, 1); c.fillRect(ax + 2, ay + 2, 1, 1); } }
      }
      // ground: grass, ploughed fields, the flagged target, ponds and trees
      c.fillStyle = R[1]; c.fillRect(0, GROUND, W, H - GROUND);
      c.fillStyle = R[2]; for (let xx = 0; xx < W; xx += 3) c.fillRect(xx, GROUND + 2 + (xx % 2), 1, 1);
      c.fillStyle = R[2]; c.fillRect(target.x0, GROUND, target.x1 - target.x0, 6);
      c.fillStyle = R[1]; for (let xx = target.x0 + 1; xx < target.x1; xx += 3) c.fillRect(xx, GROUND + 1, 1, 5);
      c.fillStyle = R[0]; c.fillRect(target.x0, GROUND, 1, 6); c.fillRect(target.x1 - 1, GROUND, 1, 6);
      const fx = Math.round((target.x0 + target.x1) / 2), wave = (t * 4 | 0) % 2;
      c.fillRect(fx, GROUND - 14, 1, 14); c.fillRect(fx + 1, GROUND - 14, 6, 4); c.fillStyle = R[2]; c.fillRect(fx + 2 + wave, GROUND - 13, 3, 2);
      for (const s of ground) {
        if (s.k === 'pond') { c.fillStyle = R[2]; c.fillRect(s.x0, GROUND, s.x1 - s.x0, 5); c.fillStyle = R[3]; c.fillRect(s.x0 + 2 + ((t * 3 | 0) % 3), GROUND + 2, 3, 1); c.fillStyle = R[0]; c.fillRect(s.x0, GROUND + 5, s.x1 - s.x0, 1); }
        else for (let xx = s.x0; xx < s.x1 - 3; xx += 6) { c.fillStyle = R[0]; c.fillRect(xx, GROUND - 9, 6, 7); c.fillRect(xx + 1, GROUND - 10, 4, 1); c.fillRect(xx + 2, GROUND - 2, 2, 2); c.fillStyle = R[1]; c.fillRect(xx + 1, GROUND - 8, 2, 2); }
      }
      // the balloon (drawn twice near an edge so it wraps cleanly)
      const bx = Math.round(x), by = Math.round(yb), fire = (burn || keyBurn) && phase === 'fly';
      for (const dx of [0, -W, W]) {
        const px = bx + dx; if (px < -8 || px > W + 8) continue;
        pix(c, BALLOON, px - 5, by - 15, { 0: R[0], 1: R[1], 2: R[2] });
        if (fire) { c.fillStyle = (t * 20 | 0) % 2 ? R[3] : R[2]; c.fillRect(px, by - 6, 1, 2); }
      }
      feel.end(c, W, H);
      // HUD on the grass strip, well clear of the score badge
      for (let i = 0; i < lives; i++) pix(c, LIFE, 3 + i * 7, 148, { 0: R[0], 1: R[1], 2: R[2] });
      c.fillStyle = R[0]; c.fillRect(30, 150, W - 34, 4); c.fillStyle = R[3]; c.fillRect(31, 151, Math.round((W - 36) * clamp(tleft / tmax, 0, 1)), 2);
      if (ml > 0) text(c, msg, W / 2, Math.max(20, Math.ceil(api.scoreArea().bottom) + 2), { color: R[0], align: 'center' });
      ready.draw(c, W, H, { pixel: true, text: 'HOLD: BURNER', color: R[0], y: 104 });
      if (ready.waiting) text(c, 'WINDS STEER YOU', W / 2, 112, { color: R[0], align: 'center' });
    },
    down() { ready.go(); burn = true; if (phase === 'fly') { sounds.whoosh(.7); haptic('tick'); } },
    up() { burn = false; },
    pause() { roar?.set({ vol: 0 }, .05); },
    key(k, d) { if (k === ' ' || k === 'ArrowUp') { if (d) ready.go(); keyBurn = d; } },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'sky-drifter',
  title: 'Sky Drifter',
  tag: 'Pocket · Flight',
  retro: true, pal: 'ice',
  w: W, h: H,
  tick: 60,
  music: 'calm',
  goal: 10,
  hint: 'Hold to fire the burner and rise, let go to sink. Each sky layer blows its own way: pick a height to drift to the flag, then land softly.',
  creator: 'Noctizzle',
  make,
};
