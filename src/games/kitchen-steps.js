// Kitchen Steps: cook each order one step at a time with your finger. CHOP by slashing across the
// food, STIR by drawing circles in the pot, POUR by holding until the line, FLIP with an upward flick
// when the pancake turns golden, and SEASON with the exact number of shakes. Beat the order clock.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { haptic } = gs.device;
const { sfx, notes, noise } = gs.sound;
const { clamp, rnd } = gs.util;
const { icon } = gs.icons;

let W = 360, H = 640;
const FOODS = [['carrot', '#ff8c2a', '#3fae49'], ['pepper', '#e63946', '#2d6a4f'], ['onion', '#e9c46a', '#a8803a'], ['leek', '#b7e4a0', '#4c956c']];
const DISHES = ['Garden Soup', 'Pepper Stew', 'Sunny Stack', 'Pan Bake', 'Market Mix', 'Golden Bowl'];

function make(api) {
  const feel = new Feel();
  let order, step, score, lives, t, clock, clockMax, done, stepT, banner, dishN;
  // per-step state
  let shakeT = -1, cuts, swipeStart, food, angle, lastA, turns, pour, pouring, brown, flipped, shakes, target, msg;

  function newOrder() {
    dishN++;
    const pool = ['chop', 'chop', 'stir', 'pour', 'flip', 'season'];
    const n = Math.min(5, 3 + Math.floor(dishN / 3));
    const steps = []; while (steps.length < n) { const s = pool[Math.random() * pool.length | 0]; if (steps[steps.length - 1] !== s) steps.push(s); }
    order = { name: DISHES[Math.random() * DISHES.length | 0], steps };
    clockMax = clock = 9 + n * 4.5 - Math.min(8, dishN * .6);
    step = 0; startStep();
    banner = { txt: order.name, l: 1.2 };
  }
  function startStep() {
    const s = order.steps[step]; stepT = 0; msg = null;
    if (s === 'chop') { food = FOODS[Math.random() * FOODS.length | 0]; cuts = []; target = 3 + Math.floor(Math.random() * 3); }
    if (s === 'stir') { turns = 0; lastA = null; target = 3; }
    if (s === 'pour') { pour = 0; pouring = false; target = rnd(.45, .8); }
    if (s === 'flip') { brown = 0; flipped = 0; }
    if (s === 'season') { shakes = 0; target = 1 + (Math.random() * 4 | 0); }
  }
  function next(good = true) {
    if (good) { feel.coin(W / 2, H * .5); haptic('success'); }
    step++;
    if (step >= order.steps.length) {
      const pts = 3 + Math.ceil(clock / clockMax * 5); score += pts; api.score(score);
      feel.win(W / 2, H * .45); notes('C5 E5 G5 C6:2', { len: .07 });
      banner = { txt: 'Order up!', sub: `+${pts}`, l: 1.2, next: true };
    } else startStep();
  }
  function fail(why) {
    lives--; feel.hurt(W / 2, H / 2); haptic('error'); msg = why;
    if (lives <= 0) { banner = { txt: why, sub: 'Kitchen closed', l: 1.6, over: true }; return; }
    banner = { txt: why, sub: `${lives} left`, l: 1.2, next: true };
  }

  return {
    reset() { score = 0; lives = 3; t = 0; dishN = 0; done = false; feel.clear(); newOrder(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.over) return api.over(); if (b.next) newOrder(); } if (banner && (banner.next || banner.over)) return; }
      clock -= dt; stepT += dt;
      if (clock <= 0) return fail('Too slow!');
      const s = order.steps[step];
      if (s === 'pour' && pouring) { pour += dt * .32; if (Math.random() < dt * 20) sfx(200 + pour * 300, .03, 'sine', .015); if (pour > 1) { pouring = false; fail('Spilled!'); } }
      if (s === 'flip') { brown += dt * (flipped === 0 ? .32 : .4); if (brown > 1) fail('Burnt!'); }
    },
    draw(c) {
      c.fillStyle = '#fdf0d5'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#f4dfb8'; for (let y = 0; y < H; y += 40) for (let x = (y / 40 % 2) * 40; x < W; x += 80) c.fillRect(x, y, 40, 40);
      // counter
      const cy = H * .62; c.fillStyle = '#b5835a'; c.fillRect(0, cy, W, H - cy); c.fillStyle = '#8f6040'; c.fillRect(0, cy, W, 8);
      // order ticket
      c.fillStyle = '#fff'; c.fillRect(18, 30, W - 36, 96); c.fillStyle = '#e63946'; c.fillRect(18, 30, W - 36, 6);
      c.fillStyle = '#3d2b1f'; c.font = '800 20px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText(order.name, 32, 62);
      order.steps.forEach((s, i) => { const x = 32 + i * ((W - 64) / order.steps.length); c.fillStyle = i < step ? '#2a9d8f' : i === step ? '#e76f51' : '#c9b79c'; c.beginPath(); c.roundRect(x, 76, (W - 64) / order.steps.length - 6, 32, 8); c.fill(); c.fillStyle = '#fff'; c.font = '700 11px Rubik, sans-serif'; c.textAlign = 'center'; if (i < step) icon(c, 'check-mark', x + ((W - 64) / order.steps.length - 6) / 2, 92, 16, { color: '#fff' }); else c.fillText(s.toUpperCase(), x + ((W - 64) / order.steps.length - 6) / 2, 97); });
      c.fillStyle = '#00000018'; c.fillRect(18, 120, W - 36, 6); c.fillStyle = clock / clockMax < .25 ? '#e63946' : '#2a9d8f'; c.fillRect(18, 120, (W - 36) * clock / clockMax, 6);
      feel.begin(c);
      const s = order.steps[step], mx = W / 2, my = H * .45;
      c.textAlign = 'center'; c.fillStyle = '#3d2b1f'; c.font = '700 18px Rubik, sans-serif';
      if (s === 'chop') {
        c.fillStyle = '#e9d5b4'; c.beginPath(); c.roundRect(mx - 120, my - 60, 240, 130, 14); c.fill(); c.fillStyle = '#d4b98f'; c.fillRect(mx - 110, my + 56, 220, 6);
        const pieces = cuts.length + 1, fw = 180;
        for (let i = 0; i < pieces; i++) { const x0 = mx - fw / 2 + i * fw / pieces + i * 6 - cuts.length * 3, w = fw / pieces; c.fillStyle = food[1]; c.beginPath(); c.roundRect(x0, my - 14, w - 2, 40, i === 0 ? [20, 4, 4, 20] : i === pieces - 1 ? [4, 20, 20, 4] : 4); c.fill(); c.fillStyle = '#ffffff40'; c.fillRect(x0 + 2, my - 10, w - 6, 6); }
        c.fillStyle = food[2]; c.fillRect(mx + fw / 2 + cuts.length * 3, my - 8, 22, 8); c.fillRect(mx + fw / 2 + cuts.length * 3 + 10, my - 18, 8, 12);
        c.fillStyle = '#3d2b1f'; c.fillText(`Slash down across it: ${cuts.length}/${target}`, mx, my + 110);
      } else if (s === 'stir') {
        c.fillStyle = '#495057'; c.beginPath(); c.ellipse(mx, my, 110, 78, 0, 0, 7); c.fill(); c.fillStyle = '#e9a23b'; c.beginPath(); c.ellipse(mx, my, 96, 66, 0, 0, 7); c.fill();
        c.strokeStyle = '#c47d1b'; c.lineWidth = 4; c.beginPath(); c.arc(mx, my, 40, (lastA ?? 0), (lastA ?? 0) + turns * Math.PI * 2 % 6.28 + .01); c.stroke();
        for (let i = 0; i < 7; i++) { const a = i * .9 + (lastA ?? 0); c.fillStyle = ['#3fae49', '#ff8c2a', '#e63946'][i % 3]; c.fillRect(mx + Math.cos(a) * (20 + i * 9) - 4, my + Math.sin(a) * (14 + i * 6) - 4, 8, 8); }
        c.fillStyle = '#3d2b1f'; c.fillText(`Draw circles in the pot: ${Math.floor(turns)}/${target}`, mx, my + 120);
      } else if (s === 'pour') {
        c.fillStyle = '#dee2e6'; c.fillRect(mx - 50, my - 70, 100, 150); c.fillStyle = '#ffffff'; c.fillRect(mx - 44, my - 70, 88, 144);
        c.fillStyle = '#90e0ef'; const fh = 144 * Math.min(1, pour); c.fillRect(mx - 44, my + 74 - fh, 88, fh);
        const ty = my + 74 - 144 * target; c.strokeStyle = '#e63946'; c.lineWidth = 3; c.setLineDash([8, 5]); c.beginPath(); c.moveTo(mx - 62, ty); c.lineTo(mx + 62, ty); c.stroke(); c.setLineDash([]);
        c.fillStyle = '#e63946'; c.beginPath(); c.moveTo(mx + 66, ty); c.lineTo(mx + 78, ty - 7); c.lineTo(mx + 78, ty + 7); c.fill();
        if (pouring) { c.fillStyle = '#90e0ef'; c.fillRect(mx - 4, my - 140, 8, 70); }
        c.fillStyle = '#6c757d'; c.save(); c.translate(mx + 20, my - 150); c.rotate(pouring ? -.9 : -.2); c.fillRect(-30, -16, 60, 32); c.restore();
        c.fillStyle = '#3d2b1f'; c.fillText('Hold to pour · let go on the line', mx, my + 120);
      } else if (s === 'flip') {
        c.fillStyle = '#343a40'; c.beginPath(); c.ellipse(mx, my + 20, 110, 30, 0, 0, 7); c.fill(); c.fillRect(mx + 100, my + 12, 90, 14);
        const air = flipped > 0 && stepT - flipped < .5 ? Math.sin((stepT - flipped) / .5 * Math.PI) * 90 : 0;
        const col = brown < .5 ? '#f8e4a6' : brown < .8 ? '#e9a23b' : '#7f4f24';
        c.save(); c.translate(mx, my + 8 - air); c.scale(1, flipped > 0 && stepT - flipped < .5 ? Math.cos((stepT - flipped) / .5 * Math.PI * 2) : 1); c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, 70, 18, 0, 0, 7); c.fill(); c.restore();
        // golden window meter
        c.fillStyle = '#00000020'; c.fillRect(mx - 100, my + 70, 200, 12); c.fillStyle = '#f4a261'; c.fillRect(mx - 100 + 200 * .55, my + 70, 200 * .25, 12);
        c.fillStyle = '#3d2b1f'; c.fillRect(mx - 100 + 200 * Math.min(1, brown) - 2, my + 64, 4, 24);
        c.fillText(flipped ? 'Golden again? Flick up!' : 'Flick up when it is golden', mx, my + 116);
      } else if (s === 'season') {
        c.fillStyle = '#f1faee'; c.beginPath(); c.ellipse(mx, my + 40, 100, 32, 0, 0, 7); c.fill(); c.fillStyle = '#e76f51'; c.beginPath(); c.ellipse(mx, my + 36, 76, 20, 0, 0, 7); c.fill();
        const shk = Math.max(0, .15 - (t - shakeT)) * 60;
        c.fillStyle = '#adb5bd'; c.beginPath(); c.roundRect(mx - 24, my - 90 + shk, 48, 70, 10); c.fill(); c.fillStyle = '#6c757d'; c.fillRect(mx - 24, my - 90 + shk, 48, 16);
        c.fillStyle = '#3d2b1f'; c.font = '800 28px Rubik, sans-serif'; c.fillText(`${shakes} / ${target}`, mx, my - 110);
        c.font = '700 18px Rubik, sans-serif'; c.fillText(`Tap exactly ${target} times, then tap the plate`, mx, my + 116);
      }
      feel.end(c, W, H);
      c.textAlign = 'center';
      for (let i = 0; i < lives; i++) icon(c, 'fried-eggs', 32 + i * 28, H - 32, 26, { color: '#fff3d6' });
      if (banner) { c.fillStyle = '#000000a0'; c.fillRect(0, H * .3, W, 90); c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = '800 30px Rubik, sans-serif'; c.fillText(banner.txt, W / 2, H * .3 + 42); if (banner.sub) { c.font = '600 18px Rubik, sans-serif'; c.fillText(banner.sub, W / 2, H * .3 + 72); } }
    },
    down(x, y) {
      if (banner && (banner.next || banner.over)) return;
      const s = order.steps[step], mx = W / 2, my = H * .45;
      swipeStart = { x, y, t };
      if (s === 'pour') { pouring = true; noise(.2, { vol: .03, from: 1200, to: 600 }); }
      if (s === 'season') {
        if (y > my + 10) { if (shakes === target) next(); else fail(shakes < target ? 'Too bland!' : 'Too salty!'); return; }
        shakes++; shakeT = t; sfx(2000 + Math.random() * 1500, .03, 'square', .02); haptic('tick'); feel.juice.burst(mx, my - 20, { n: 6, speed: 60, color: '#fff', gravity: 300, size: 2 });
      }
    },
    move(x, y, p) {
      if (!p || (banner && (banner.next || banner.over))) return;
      const s = order.steps[step], mx = W / 2, my = H * .45;
      if (s === 'stir') {
        const a = Math.atan2(y - my, x - mx);
        if (Math.hypot(x - mx, y - my) > 20) { if (lastA != null) { let d = a - lastA; d = Math.atan2(Math.sin(d), Math.cos(d)); turns += Math.abs(d) / (Math.PI * 2); if (Math.random() < .2) sfx(300 + Math.random() * 100, .03, 'sine', .02); } lastA = a; }
        if (turns >= target) { lastA = null; next(); }
      }
      if (s === 'chop' && swipeStart && swipeStart.y < my - 20 && y > my + 30 && Math.abs(x - mx) < 110 && !swipeStart.used) {
        swipeStart.used = true; cuts.push(x); noise(.06, { vol: .08, from: 4000, to: 1500 }); haptic('medium'); feel.juice.shake(3).burst(x, my + 6, { n: 8, speed: 120, color: food[1], gravity: 400 });
        if (cuts.length >= target) next();
      }
      if (s === 'flip' && swipeStart && swipeStart.y - y > 60 && t - swipeStart.t < .35 && !swipeStart.used) {
        swipeStart.used = true;
        if (brown >= .55 && brown <= .8) { if (flipped) next(); else { flipped = stepT; brown = .1; sfx(600, .12, 'triangle', .04, 400); haptic('success'); feel.juice.pop(mx, my - 40, 'Nice flip!', { color: '#2a9d8f' }); } }
        else if (brown < .55) { feel.juice.pop(mx, my - 40, 'Not yet…', { color: '#e76f51' }); haptic('warning'); brown = Math.max(0, brown - .05); }
        else fail('Burnt!');
      }
    },
    up() {
      const s = order?.steps[step];
      if (s === 'pour' && pouring && !(banner && (banner.next || banner.over))) { pouring = false; if (Math.abs(pour - target) < .07) { feel.juice.pop(W / 2, H * .3, 'Perfect!', { color: '#2a9d8f' }); next(); } else if (pour > target) fail('Too much!'); else feel.juice.pop(W / 2, H * .3, 'A bit more', { color: '#e76f51' }); }
      swipeStart = null;
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'kitchen-steps',
  title: 'Kitchen Steps',
  tag: 'Casual · Cooking',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 45,
  hint: 'Cook each order step by step: slash to chop, circle to stir, hold to pour, flick to flip, tap to season. Beat the order clock.',
  make,
};
