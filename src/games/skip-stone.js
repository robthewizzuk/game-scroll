// Skip Stone: skim flat stones across the lake. Swipe sideways from the shore: a fast, flat swipe skips
// best, while a steep one plops straight in. Each bounce loses a little speed. Lily pads give an extra
// kick, ducks stop the stone dead. Five stones; count every skip.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { C16 } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes, noise } = gs.sound;
const { clamp, rnd } = gs.util;

let W = 160, H = 176;
const K = C16;
const FLICK = .13, LATE = .06;   // seconds: how early before touching the water a flick counts, and how late after

function make(api) {
  const feel = new Feel({ pixel: true });
  let stone, cam, stones, skips, best, score, t, swipe, ripples, pads, ducks, msg, ml, wait;
  const WATER = () => Math.round(H * .6);

  function lay() {
    pads = []; ducks = [];
    for (let x = 140; x < 2600; x += rnd(90, 200)) (Math.random() < .25 ? ducks : pads).push({ x: Math.round(x), b: Math.random() * 6 });
  }
  function ready() { stone = null; cam = 0; skips = 0; }

  return {
    reset() { stones = 5; score = 0; best = 0; t = 0; swipe = null; ripples = []; msg = ''; ml = 0; wait = 0; lay(); ready(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt;
      for (const r of ripples) r.l -= dt; ripples = ripples.filter(r => r.l > 0);
      if (wait > 0) { wait -= dt; if (wait <= 0) { if (stones <= 0) return api.over(); ready(); } return; }
      if (!stone) return;
      stone.vy += 380 * dt; stone.x += stone.vx * dt; stone.y += stone.vy * dt; stone.spin += stone.vx * dt * .2; stone.since += dt;
      cam = Math.max(0, stone.x - W * .4);
      for (const d of ducks) if (!d.hit && Math.abs(stone.x - d.x) < 7 && stone.y > WATER() - 9) { d.hit = true; return sink('DUCKED!'); }
      if (stone.y >= WATER()) {
        const steep = stone.vy / stone.vx;
        if (stone.vx > 60 && steep < .75) {
          skips++; score++; api.score(score);
          // a flick just as it touches the water keeps it skimming; a bounce left alone (or flicked too early) drags it down
          const good_ = stone.flick === 'good';
          stone.y = WATER(); stone.vy = -stone.vy * (good_ ? .6 : .5); stone.vx *= good_ ? .9 : stone.flick ? .42 : .5; stone.flick = null; stone.since = 0; stone.good = good_;
          if (good_) good();
          const pad = pads.find(p => Math.abs(p.x - stone.x) < 9);
          if (pad) { stone.vx += 50; stone.vy -= 60; feel.juice.pop(Math.round(stone.x - cam), WATER() - 12, 'BOING', { color: K[5] }); sfx(900, .06, 'triangle', .03, 400); }
          ripples.push({ x: stone.x, l: 1 }); sfx(600 + skips * 40, .03, 'square', .03); haptic(skips % 5 === 0 ? 'medium' : 'tick');
          if (skips % 5 === 0) notes('C6 E6', { len: .05 });
        } else return sink(skips ? `${skips} SKIPS` : 'PLOP');
      }
    },
    draw(c) {
      c.fillStyle = K[7]; c.fillRect(0, 0, W, WATER());
      c.fillStyle = K[1]; for (let i = 0; i < 4; i++) { const x = Math.round(((i * 70 - cam * .2) % (W + 40) + W + 40) % (W + 40) - 20); c.fillRect(x, 20 + i * 9, 20, 4); c.fillRect(x + 4, 17 + i * 9, 10, 3); }
      // far hills and treeline
      c.fillStyle = K[6]; for (let x = 0; x < W; x += 8) { const hh = 8 + Math.round(Math.sin((x + cam * .4) * .05) * 4); c.fillRect(x, WATER() - hh, 8, hh); }
      c.fillStyle = K[8]; c.fillRect(0, WATER(), W, H - WATER());
      c.fillStyle = K[7]; for (let i = 0; i < 20; i++) c.fillRect(Math.round(((i * 37 - cam) % W + W) % W), WATER() + 4 + (i * 13) % (H - WATER() - 8), 6, 1);
      feel.begin(c);
      // your shore
      if (cam < 60) { c.fillStyle = K[11]; c.fillRect(-Math.round(cam), WATER() - 10, 30, H - WATER() + 10); c.fillStyle = K[5]; c.fillRect(-Math.round(cam), WATER() - 12, 30, 3); }
      for (const p of pads) { const x = Math.round(p.x - cam); if (x < -10 || x > W + 10) continue; c.fillStyle = K[6]; c.fillRect(x - 7, WATER() - 1, 14, 3); c.fillStyle = K[5]; c.fillRect(x - 6, WATER() - 2, 12, 2); }
      for (const d of ducks) { const x = Math.round(d.x - cam), b = Math.round(Math.sin(t * 2 + d.b)); if (x < -10 || x > W + 10) continue; c.fillStyle = d.hit ? K[13] : K[4]; c.fillRect(x - 5, WATER() - 5 + b, 10, 5); c.fillRect(x + 2, WATER() - 9 + b, 4, 4); c.fillStyle = K[3]; c.fillRect(x + 6, WATER() - 8 + b, 2, 1); }
      for (const r of ripples) { const x = Math.round(r.x - cam), w = Math.round((1 - r.l) * 14) + 2; c.fillStyle = K[1]; c.fillRect(x - w, WATER(), 2, 1); c.fillRect(x + w - 1, WATER(), 2, 1); }
      // the stone
      // its shadow on the water, which lights up while a flick would be in time
      if (stone && stone.vy > 0) { const sx = Math.round(stone.x - cam), now = (WATER() - stone.y) / stone.vy < FLICK && !stone.flick; c.fillStyle = now ? K[1] : K[7]; c.fillRect(sx - (now ? 4 : 2), WATER() + 1, now ? 8 : 4, 1); }
      if (stone) { const x = Math.round(stone.x - cam), y = Math.round(stone.y), f = Math.abs(Math.sin(stone.spin)) > .5; c.fillStyle = K[13]; c.fillRect(x - 3, y - (f ? 2 : 1), 6, f ? 3 : 2); c.fillStyle = K[14]; c.fillRect(x - 2, y - (f ? 2 : 1), 2, 1); }
      else if (wait <= 0) { c.fillStyle = K[13]; c.fillRect(14, WATER() - 16, 6, 3); }
      // swipe guide
      if (swipe && swipe.cur) { c.fillStyle = K[1]; const n = 8; for (let i = 0; i <= n; i++) c.fillRect(Math.round(swipe.x + (swipe.cur.x - swipe.x) * i / n), Math.round(swipe.y + (swipe.cur.y - swipe.y) * i / n), 1, 1); }
      feel.end(c, W, H);
      text(c, `${score}`, 4, 3, { color: K[0] });
      for (let i = 0; i < stones; i++) { c.fillStyle = K[13]; c.fillRect(W - 9 - i * 7, 4, 5, 3); }
      text(c, `BEST ${best}`, W - 4, 12, { align: 'right', color: K[0] });
      if (stone) text(c, `${skips}`, W / 2, Math.round(H * .3), { font: 'big', align: 'center', color: K[1] });
      if (ml > 0) text(c, msg, W / 2, Math.round(H * .3), { font: 'big', align: 'center', color: K[1] });
      else if (!stone && wait <= 0 && stones === 5) text(c, 'SWIPE FLAT, TAP AT SPLASH', W / 2, H - 12, { align: 'center', color: K[1] });
    },
    down(x, y) { if (stone) flick(); else if (wait <= 0) swipe = { x, y, t, cur: null }; },
    move(x, y, pr) { if (swipe && pr) swipe.cur = { x, y }; },
    up(x, y) {
      if (!swipe) return;
      const dx = x - swipe.x, dy = y - swipe.y, dt = Math.max(.04, t - swipe.t); swipe = null;
      if (dx < 15) return;
      const sp = clamp(Math.hypot(dx, dy) / dt * .45, 60, 330), ang = clamp(Math.atan2(dy, dx), -.6, 1.2);
      stone = { x: 18, y: WATER() - 12, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, spin: 0, flick: null, since: 1, good: true };
      stones--; noise(.05, { vol: .03, from: 2500, to: 900 }); haptic('light');
    },
    key(k, d) { if (!d || k !== ' ') return; if (stone) flick(); else if (wait <= 0) { swipe = { x: 10, y: 100, t: t - .12 }; this.up(70, 108); } },
  };

  // The one flick a bounce gets: in time when the stone is about to touch the water (or has just bounced off it);
  // any other flick wobbles it and that bounce is a weak one, so tapping blindly does nothing for you.
  function flick() {
    if (stone.flick) return;
    if (skips && stone.since < LATE && !stone.good) {   // a moment late: it still counts for the bounce it just made
      stone.vx *= .9 / .5; stone.vy *= .6 / .5; stone.good = true; good(); return;
    }
    const soon = stone.vy > 0 && (WATER() - stone.y) / stone.vy < FLICK;
    stone.flick = soon ? 'good' : 'early';
    if (soon) haptic('tick');
    else { feel.juice.pop(Math.round(stone.x - cam), Math.round(stone.y) - 8, 'WOBBLE', { color: K[13] }); sfx(240, .04, 'square', .02); }
  }
  function good() { feel.juice.pop(Math.round(stone.x - cam), WATER() - 6, 'FLICK', { color: K[1] }); haptic('tick'); }
  function sink(why) {
    best = Math.max(best, skips); msg = why; ml = 1.3; wait = 1.4;
    ripples.push({ x: stone.x, l: 1 }); ripples.push({ x: stone.x, l: .7 });
    sfx(160, .15, 'sine', .04, -80); haptic(why === 'DUCKED!' ? 'warning' : 'light');
    if (why === 'DUCKED!') { feel.hurt(Math.round(stone.x - cam), WATER()); notes('A4 F4', { len: .08 }); }
    else if (skips >= 8) { feel.win(Math.round(stone.x - cam), WATER()); }
    stone = null;
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'skip-stone',
  title: 'Skip Stone',
  tag: 'Color · Throw',
  retro: true, era: 'color', pal: 'lemon',
  w: 160, h: 176, maxW: 220, maxH: 240,
  goal: 25,
  hint: 'Swipe sideways, fast and flat, to skim a stone across the lake, then tap just as it touches the water to keep it skipping. Lily pads kick it on, ducks stop it. Five stones; every skip counts.',
  make,
};
