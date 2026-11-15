// Fuse Pass: five toy friends sit round a table passing a fizzing firework cake. When it lands with you,
// tap a friend to throw it on before the fuse burns down. Each catch scores. The robots throw it back
// sooner and sooner, and the fuse gets shorter. Holding it when it pops costs a party hat. Lose all three.
import gs from '../gamescroll.js';
const { sounds } = gs.sound;
const { haptic } = gs.device;
const { Juice } = gs.juice;
const { View, G, part, grp, blob } = gs.toon;
const { rnd } = gs.util;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

let W = 192, H = 176;
const SKIN = ['#f8c890', '#d89868', '#a86840', '#f0b8a0', '#c88858'];
const SHIRT = ['#e84848', '#48b8f0', '#f8c030', '#a060e0', '#60d070'];

let v3;
function view3d() {
  if (!v3) {
    v3 = new View({ bg: '#302048', sun: [-.4, 1, .6] });
    v3.def('table', () => part(G.cyl, '#8a5a30', { y: -.5 }));
    for (let i = 0; i < 5; i++) v3.def('kid' + i, () => grp(part(G.pill, SHIRT[i], { sx: 9, sy: 9, sz: 9, y: 6 }), part(G.ball, SKIN[i], { s: 8, y: 14 }), part(G.cone, '#ffffff', { s: 4, sy: 6, y: 20 }), blob(6)));
    v3.def('cake', () => grp(part(G.cyl, '#f0e0f0', { sx: 9, sy: 5, sz: 9, y: 2.5 }), part(G.cyl, '#f080b0', { sx: 9.5, sy: 1.5, sz: 9.5, y: 5 }), part(G.pill, '#ffffff', { sx: 1, sy: 6, sz: 1, y: 8 })));
    v3.def('spark', () => part(G.ball, '#ffe060', { s: 3, glow: 1 }));
  }
  v3.board(W, H, .7);
  return v3;
}

function make(api) {
  const fx = new Juice();
  let kids, nap, holder, fuse, fuseMax, fly, score, hats, t, thinkT, started, ended, msg, ml, passes;
  const CX = () => W / 2, CY = () => H / 2 + 8;
  const seat = i => { const a = Math.PI / 2 + i * Math.PI * 2 / 5; return [CX() + Math.cos(a) * 58, CY() + Math.sin(a) * 44]; };

  function newCake(to) { fuseMax = Math.max(2.4, 6 - passes * .06); fuse = fuseMax * rnd(.6, 1); holder = to; fly = null; if (to === 0) doze(); thinkT = holder === 0 ? 0 : rnd(.35, 1.1) * Math.max(.45, 1 - passes * .015); }
  // when the cake reaches you, one or two friends nod off: throw to them and it bounces straight back
  function doze() { const k = shuffle([1, 2, 3, 4]); nap = k.slice(0, passes > 14 ? 2 : 1); }
  function throwTo(from, to) {
    fly = { from, to, k: 0 }; holder = -1; passes++; sounds.jump?.(); haptic('light');
  }
  function pop() {
    const [x, y] = holder >= 0 ? seat(holder) : [CX(), CY()];
    sounds.boom(); fx.shake(5).burst(x, y - 14, { n: 30, speed: 120, size: 3, color: ['#ffe060', '#f080b0', '#60d0ff', '#fff'] });
    if (holder === 0) { hats--; haptic('error'); fx.flash('#ff8040', .3); msg = hats > 0 ? 'POP! LOST A HAT' : 'PARTY OVER'; ml = 1.4; }
    else { score += 2; api.score(score); fx.pop(x, y - 30, '+2'); haptic('medium'); msg = 'POP! NOT YOU'; ml = 1; }
    if (hats <= 0) { if (!ended) { ended = true; api.over(); } return; }
    newCake(Math.random() * 5 | 0);
  }

  return {
    reset() { kids = [0, 1, 2, 3, 4]; nap = []; score = 0; hats = 3; t = 0; started = false; ended = false; msg = ''; ml = 0; passes = 0; newCake(0); fx.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      fx.update(dt); t += dt; if (ml > 0) ml -= dt;
      if (!started || ended) return;
      fuse -= dt;
      if (fly) { fly.k += dt / .45; if (fly.k >= 1) { if (fly.from === 0 && nap.includes(fly.to)) { fuse *= .6; msg = 'ASLEEP! IT BOUNCED BACK'; ml = 1.2; sounds.hit(); haptic('warning'); fly = { from: fly.to, to: 0, k: 0, back: true }; return; } holder = fly.to; const back = fly.back; fly = null; if (holder === 0) doze(); if (holder === 0 && !back) { score++; api.score(score); sounds.coin(1 + passes * .01); fx.pop(...seat(0).map((v, i) => v - (i ? 26 : 0)), '+1'); } thinkT = holder === 0 ? 0 : rnd(.25, 1.1) * Math.max(.4, 1 - passes * .015); } }
      if (fuse <= 0) { pop(); return; }
      if (holder > 0) {
        thinkT -= dt;
        if (thinkT <= 0) {
          // robots like throwing at you, more so as the fuse runs low
          const to = Math.random() < .45 + (1 - fuse / fuseMax) * .4 ? 0 : [1, 2, 3, 4].filter(k => k !== holder)[Math.random() * 3 | 0];
          throwTo(holder, to);
        }
      }
    },
    draw(c) {
      const v = view3d(); v.frame();
      v.put('table', v.at(CX(), CY()), { sx: 44, sy: 1, sz: 32 / v.sin });
      for (let i = 0; i < 5; i++) { const [x, y] = seat(i); v.put('kid' + i, v.at(x, y, holder === i ? Math.abs(Math.sin(t * 12)) * 2 : nap.includes(i) ? -3 : 0), { ry: Math.atan2(y - CY(), x - CX()) + Math.PI / 2 }); }
      let cx, cy, cz = 18;
      if (fly) { const [ax, ay] = seat(fly.from), [bx, by] = seat(fly.to); cx = ax + (bx - ax) * fly.k; cy = ay + (by - ay) * fly.k; cz = 18 + Math.sin(fly.k * Math.PI) * 26; }
      else if (holder >= 0) [cx, cy] = seat(holder);
      if (cx != null) {
        v.put('cake', v.at(cx, cy, cz), { ry: t * 3 });
        const low = fuse / fuseMax;
        v.put('spark', v.at(cx, cy, cz + 8 + low * 4 + Math.random()), { s: 1 + Math.random() * .6 });
      }
      fx.begin(c); v.render(c, W, H); fx.end(c, W, H);
      // fuse bar
      c.fillStyle = '#00000080'; c.fillRect(W / 2 - 40, H - 14, 80, 6);
      c.fillStyle = fuse / fuseMax < .3 ? '#ff5040' : '#ffd040'; c.fillRect(W / 2 - 40, H - 14, 80 * Math.max(0, fuse / fuseMax), 6);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < hats ? '#f080b0' : '#ffffff30'; c.beginPath(); c.moveTo(8 + i * 11, 15); c.lineTo(12 + i * 11, 5); c.lineTo(16 + i * 11, 15); c.fill(); }
      c.textAlign = 'center'; c.fillStyle = '#fff';
      if (holder === 0 && !fly && started) { c.font = '800 11px Rubik, sans-serif'; c.fillStyle = (t * 6 | 0) % 2 ? '#ffe060' : '#fff'; c.fillText('TAP A FRIEND!', W / 2, H - 22); }
      for (const i of nap) { const [x, y] = seat(i); c.font = '800 10px Rubik, sans-serif'; c.fillStyle = '#c0d8ff'; c.fillText('z', x + 6, y - 26 - (t * 8 % 6)); c.fillText('Z', x + 11, y - 32 - (t * 8 % 6)); }
      if (ml > 0) { c.font = '800 14px Rubik, sans-serif'; c.fillStyle = '#fff'; c.fillText(msg, W / 2, Math.max(30, api.scoreArea().bottom + 14)); }
      if (!started) { c.fillStyle = '#000b'; c.fillRect(0, H / 2 - 20, W, 34); c.fillStyle = '#fff'; c.font = '700 10px Rubik, sans-serif'; c.fillText('You are at the front with the cake.', W / 2, H / 2 - 6); c.fillText('Tap a friend to throw it. Tap to start', W / 2, H / 2 + 8); }
    },
    down(x, y) {
      if (!started) { started = true; return; }
      if (holder !== 0 || fly || ended) return;
      let best = -1, bd = 34;
      for (let i = 1; i < 5; i++) { const [sx, sy] = seat(i), d = Math.hypot(sx - x, sy - 10 - y); if (d < bd) { bd = d; best = i; } }
      if (best > 0) throwTo(0, best);
    },
    key(k, d) { if (!d) return; if (!started) { started = true; return; } if (holder === 0 && !fly && '1234'.includes(k)) throwTo(0, +k); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'fuse-pass',
  title: 'Fuse Pass',
  tag: 'Console · Party',
  retro: true, era: 'console', pal: 'grape',
  w: 192, h: 176, maxW: 300, maxH: 280,
  goal: 60,
  hint: 'A fizzing party cake gets passed round the table. When it lands with you, tap a friend who is awake to throw it on before it pops (sleepy ones bounce it back). Get caught holding it three times and the party is over.',
  make,
};
