// Gap Drop: a bouncing ball sits on a stack of floors that wrap round like a drum. Drag left and right to
// turn the whole stack so a gap slides under the ball and it drops to the next floor. Red tiles pop the
// ball. Fall through three floors without a bounce and you're hot: you smash the next floor, red or not.
import gs from '../gamescroll.js';
const { Ready } = gs.rounds;
const { Feel } = gs.effects;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { rnd } = gs.util;
const { approach } = gs.juice;

let W = 360, H = 640;
const GAP = 130, SEGS = 12;

function make(api) {
  const ready = new Ready({ eat: false });   // the round starts on the first touch
  const feel = new Feel();
  let floors, rot, ball, cam, score, falls, t, last, bits, depth;

  function floor(i) {
    // 12 tiles round the drum: some gaps, some red, the rest plain
    const tiles = new Array(SEGS).fill(0), g = Math.random() * SEGS | 0, gw = i > 15 ? 1 : 2;
    for (let k = 0; k < gw; k++) tiles[(g + k) % SEGS] = 1;
    const reds = Math.min(6, 2 + Math.floor(i / 4));
    for (let k = 0; k < reds; k++) { const j = Math.random() * SEGS | 0; if (tiles[j] === 0 && Math.abs(j - g) > 1) tiles[j] = 2; }
    return { y: 260 + i * GAP, tiles, gone: false, i };
  }
  const tileAt = f => { const w = W / SEGS * 1.0, x = ((W / 2 - rot) % W + W) % W; return f.tiles[Math.floor(x / w) % SEGS]; };

  return {
    reset() { floors = []; for (let i = 0; i < 8; i++) floors.push(floor(i)); floors[0].tiles = floors[0].tiles.map(v => v === 2 ? 0 : v); floors[1].tiles = floors[1].tiles.map(v => v === 2 ? 0 : v); rot = 0; ball = { y: 150, vy: 0 }; cam = 0; score = 0; falls = 0; t = 0; last = null; bits = []; depth = 8; ready.reset(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      for (const b of bits) { b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 900 * dt; b.l -= dt; }
      bits = bits.filter(b => b.l > 0);
      const prevY = ball.y;
      ball.vy += 1500 * dt; ball.y += ball.vy * dt;
      for (const f of floors) {
        if (f.gone || prevY + 12 > f.y || ball.y + 12 < f.y) continue;
        const tile = tileAt(f);
        if (ready.playing && (tile === 1 || falls >= 3)) {
          // through the gap (or smashing through when hot)
          f.gone = true; score++; api.score(score);
          if (tile !== 1) { feel.boom(W / 2, f.y - cam, { size: .5 }); haptic('heavy'); }
          else { sfx(500 + falls * 80, .05, 'triangle', .03); haptic('light'); }
          for (let k = 0; k < 10; k++) bits.push({ x: W / 2 + rnd(-W / 2, W / 2), y: f.y, vx: rnd(-120, 120), vy: rnd(-200, 0), l: 1, col: '#ffffff' });
          falls++;
          if (falls === 3) { notes('C5 E5 G5', { len: .05 }); feel.juice.pop(W / 2, ball.y - cam - 40, 'HOT!', { color: '#ff7b00' }); }
          continue;
        }
        if (tile === 2 && ready.playing) { feel.hurt(W / 2, ball.y - cam); feel.lose(); haptic('error'); return api.over(); }
        // bounce
        ball.y = f.y - 12; ball.vy = -560; falls = 0; sfx(260, .05, 'sine', .04); if (ready.playing) haptic('tick');
        break;
      }
      cam = approach(cam, ball.y - H * .35, 6, dt);
      floors = floors.filter(f => f.y > cam - 60);
      while (floors.length < 9) floors.push(floor(depth++));
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#22223b'); g.addColorStop(1, '#4a4e69'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      // the drum's pole
      c.fillStyle = '#9a8c98'; c.fillRect(W / 2 - 18, 0, 36, H); c.fillStyle = '#c9ada7'; c.fillRect(W / 2 - 18, 0, 8, H);
      feel.begin(c);
      c.save(); c.translate(0, -cam);
      const w = W / SEGS;
      for (const f of floors) {
        if (f.gone) continue;
        const hue = (f.i * 23) % 360;
        for (let k = 0; k < SEGS; k++) {
          const tile = f.tiles[k]; if (tile === 1) continue;
          // tiles slide round with the turn, wrapping at the screen edge
          let x = ((k * w + rot) % W + W) % W;
          for (const xx of [x, x - W]) {
            c.fillStyle = tile === 2 ? '#ef233c' : `hsl(${hue},55%,62%)`; c.fillRect(xx, f.y, w - 2, 16);
            c.fillStyle = tile === 2 ? '#8d0801' : `hsl(${hue},45%,42%)`; c.fillRect(xx, f.y + 12, w - 2, 4);
          }
        }
      }
      for (const b of bits) { c.fillStyle = `rgba(255,255,255,${b.l})`; c.fillRect(b.x, b.y, 5, 5); }
      // the ball
      const sq = ball.vy < -400 ? .85 : 1;
      c.fillStyle = falls >= 3 ? '#ff7b00' : '#fff3b0'; c.beginPath(); c.ellipse(W / 2, ball.y, 12 / sq, 12 * sq, 0, 0, 7); c.fill();
      c.fillStyle = '#ffffff90'; c.beginPath(); c.arc(W / 2 - 4, ball.y - 4, 3, 0, 7); c.fill();
      c.restore();
      feel.end(c, W, H);
      if (!ready.playing) { c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = '700 17px Rubik, sans-serif'; c.fillText('Drag left and right to turn', W / 2, H - 80); c.font = '500 14px Rubik, sans-serif'; c.fillText('Drop through the gaps, miss the red', W / 2, H - 56); }
    },
    down(x) { ready.go(); last = x; },
    move(x, y, pr) { if (!pr || last == null) return; rot += (x - last) * 1.1; last = x; },
    up() { last = null; },
    key(k, d) { if (!d) return; ready.go(); if (k === 'ArrowLeft') rot -= W / SEGS; if (k === 'ArrowRight') rot += W / SEGS; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'gap-drop',
  title: 'Gap Drop',
  tag: 'Casual · Drop',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 60,
  hint: 'Drag left and right to turn the floors so the bouncing ball drops through the gaps. Red tiles pop it; three drops in a row smash the next floor.',
  make,
};
