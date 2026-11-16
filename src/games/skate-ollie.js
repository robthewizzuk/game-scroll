import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;

// Skate down the street. Tap to ollie over cones, benches and gaps. While in the air, swipe left or right
// to spin a kickflip, up for a grab: each trick scores if it finishes before you land.
// Forgiving by design: the ollie fires on touch-down, a tap just before landing is remembered,
// you can still ollie a moment after rolling off a gap's edge, hitboxes are smaller than the art,
// and an unfinished trick just doesn't score instead of ending the run.
const W = 360, H = 640, GROUND = 470, SX = 100, G = 2200, JUMP = -900, BUFFER = .18, COYOTE = .14, HIT = 7;

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready({ eat: false });                // the street waits for the first tap, which is also the first ollie
  let y, vy, air, board, trick, tricks, pending, cleared, obs, speed, dist, t, score, msg, combo, swipe, bail, wantJump, offEdge;
  function addObs() { const r = Math.random() * (dist < 1500 ? .8 : 1); obs.push(r < .5 ? { k: 'cone', x: W + 30, w: 18, h: 30 } : r < .8 ? { k: 'bench', x: W + 30, w: 60, h: 36 } : { k: 'gap', x: W + 30, w: 70, h: 0 }); }
  // A trick only chains when it differs from the one before it in this jump (a kickflip after a kickflip is
  // "SAME AGAIN" and scores nothing), and a jump's tricks are banked on a clean landing: bail and they're lost.
  function finishTrick() {
    const same = tricks.length && tricks[tricks.length - 1] === trick.type;
    if (same) { msg = { txt: 'SAME AGAIN', l: .7 }; trick = null; board = 0; sfx(220, .05, 'square', .02); return; }
    tricks.push(trick.type); combo++; const pts = trick.type === 'flip' ? 3 : 2; pending += pts * combo;
    msg = { txt: `${trick.type === 'flip' ? 'KICKFLIP' : 'GRAB'} x${combo}`, l: .8 }; trick = null; board = 0; haptic('light'); sfx(700 + combo * 60, .06, 'square', .03, 150);
    feel.juice.burst(SX, y - 6, { n: 8 + combo * 3, speed: 160, life: .35, size: 3.5, color: ['#ffd34a', '#ffffff', '#3a5ad0'] });
  }
  function canOllie() { return !air || (offEdge >= 0 && t - offEdge < COYOTE && vy >= 0); }
  function ollie() { air = true; vy = JUMP; offEdge = -1; wantJump = -1; haptic('medium'); sfx(260, .08, 'square', .04, 300); }
  function press() { if (canOllie()) ollie(); else wantJump = t; }
  function trySwipe(dx, dy) {
    if (!air || trick || Math.hypot(dx, dy) < 26) return;
    if (Math.abs(dx) > Math.abs(dy)) trick = { type: 'flip', dir: Math.sign(dx), k: 0, dur: .3 };
    else if (dy < 0) trick = { type: 'grab', k: 0, dur: .26 };
    if (trick) swipe = null;
  }
  return {
    reset() { y = GROUND; vy = 0; air = false; board = 0; trick = null; tricks = []; pending = 0; cleared = false; obs = []; speed = 200; dist = 0; t = 0; score = 0; msg = null; combo = 0; swipe = null; bail = 0; wantJump = -1; offEdge = -1; feel.clear(); ready.reset(); addObs(); obs[0].x = W + 160; },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; if (msg) msg.l -= dt;
      speed = Math.min(380, 200 + dist / 60); const dx = speed * dt; dist += dx;
      for (const o of obs) o.x -= dx; obs = obs.filter(o => o.x + o.w > -20);
      const last = obs[obs.length - 1]; if (!last || last.x + last.w < W - speed * rnd(.95, 1.5) - (dist < 1000 ? 80 : 0)) addObs();
      if (air) {
        vy += G * dt; y += vy * dt;
        if (!cleared && obs.some(o => SX > o.x && SX < o.x + o.w)) cleared = true;
        if (trick) { trick.k += dt / trick.dur; board = trick.type === 'flip' ? trick.dir * trick.k * Math.PI * 2 : 0; if (trick.k >= 1) finishTrick(); }
        // land on a gap's edge if any part of the board is over road
        const gap = obs.find(o => o.k === 'gap' && SX > o.x + 14 && SX < o.x + o.w - 14);
        if (y >= GROUND && !gap && y < GROUND + 24) {
          y = GROUND; air = false; vy = 0; offEdge = -1;
          if (trick) { if (trick.k > .7) finishTrick(); else { msg = { txt: 'SLOPPY', l: .7 }; trick = null; board = 0; } }
          // tricks score only when the jump cleared a cone, bench or gap (flat-ground tricks are practice)
          if (pending) { if (cleared) { score += pending; api.score(score); msg = { txt: `+${pending}`, l: .8 }; } else msg = { txt: 'FLAT: NO SCORE', l: .8 }; pending = 0; }
          cleared = false;
          if (tricks.length) haptic('success'); else haptic('tick'); sfx(150, .05, 'square', .05);
          feel.juice.burst(SX, GROUND, { n: 5, speed: 70, life: .25, size: 3, color: ['#c9c9d6', '#ffffff'] });
          tricks = []; combo = 0;
          if (t - wantJump < BUFFER) ollie();
        }
      } else {
        const gap = obs.find(o => o.k === 'gap' && SX > o.x + 14 && SX < o.x + o.w - 14);
        if (gap) { air = true; vy = 0; offEdge = t; }
      }
      if (y > GROUND + 60) { msg = { txt: 'FELL IN', l: 1 }; haptic('error'); sfx(100, .4, 'square', .05, -40); feel.juice.shake(7); return api.over(); }
      for (const o of obs) if (o.k !== 'gap' && SX + HIT > o.x + 3 && SX - HIT < o.x + o.w - 3 && y > GROUND - o.h + 6) { bail = 1; msg = { txt: 'OUCH', l: 1 }; haptic('error'); sfx(100, .4, 'square', .05, -40); feel.juice.shake(9).burst(SX, y - 20, { n: 14, speed: 200, life: .4, size: 4, color: ['#ff7a2a', '#ffffff', '#7a4a2a'] }); return api.over(); }
      for (const o of obs) if (!o.passed && o.x + o.w < SX - 16) { o.passed = true; score += 1; api.score(score); }
    },
    fx(dt) { bail += dt; feel.update(dt); },
    draw(c) {
      c.fillStyle = '#ffd8a8'; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = '#e8b888'; for (let i = 0; i < 6; i++) { const x = ((i * 90 - dist * .2) % 540 + 540) % 540 - 90; c.fillRect(x, 220 - (i % 3) * 40, 70, GROUND - 220 + (i % 3) * 40); }
      c.fillStyle = '#7a7a8a'; c.fillRect(0, GROUND, W, H - GROUND); c.fillStyle = '#9a9aaa'; for (let x = -(dist % 60); x < W; x += 60) c.fillRect(x, GROUND + 20, 30, 4);
      for (const o of obs) {
        if (o.k === 'gap') { c.fillStyle = '#2a2a33'; c.fillRect(o.x, GROUND, o.w, H - GROUND); continue; }
        if (o.k === 'cone') { c.fillStyle = '#ff7a2a'; c.beginPath(); c.moveTo(o.x, GROUND); c.lineTo(o.x + o.w / 2, GROUND - o.h); c.lineTo(o.x + o.w, GROUND); c.fill(); c.fillStyle = '#fff'; c.fillRect(o.x + 5, GROUND - 14, o.w - 10, 4); }
        else { c.fillStyle = '#7a4a2a'; c.fillRect(o.x, GROUND - o.h, o.w, 8); c.fillRect(o.x + 6, GROUND - o.h, 6, o.h); c.fillRect(o.x + o.w - 12, GROUND - o.h, 6, o.h); }
      }
      // skater
      c.save(); c.translate(SX, y);
      if (bail) c.rotate(Math.min(1.4, bail * 4));
      const grab = trick && trick.type === 'grab';
      c.fillStyle = '#3a5ad0'; c.fillRect(-8, -60 + (grab ? 14 : 0), 16, 30); c.fillStyle = '#f2c79a'; c.beginPath(); c.arc(0, -70 + (grab ? 14 : 0), 9, 0, 7); c.fill();
      c.strokeStyle = '#2a2a3a'; c.lineWidth = 5; c.beginPath(); c.moveTo(-4, -30 + (grab ? 14 : 0)); c.lineTo(-10, -8); c.moveTo(4, -30 + (grab ? 14 : 0)); c.lineTo(10, -8); c.stroke();
      if (grab) { c.strokeStyle = '#f2c79a'; c.lineWidth = 4; c.beginPath(); c.moveTo(6, -40); c.lineTo(14, -6); c.stroke(); }
      c.save(); c.translate(0, -4); c.scale(1, Math.cos(board)); c.fillStyle = '#d04a4a'; c.fillRect(-22, -3, 44, 5); c.restore();
      c.fillStyle = '#222'; c.beginPath(); c.arc(-14, 2, 3, 0, 7); c.arc(14, 2, 3, 0, 7); c.fill();
      c.restore();
      feel.end(c, W, H);
      ready.draw(c, W, H, { y: 300, color: '#3a2a6a', shadow: '#ffffff90' });
      if (msg && msg.l > 0) { c.globalAlpha = clamp(msg.l * 2, 0, 1); c.fillStyle = msg.txt === 'SLOPPY' || msg.txt === 'SAME AGAIN' || msg.txt === 'FLAT: NO SCORE' || msg.txt === 'OUCH' || msg.txt === 'FELL IN' ? '#d03a3a' : '#3a2a6a'; c.font = '400 14px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(msg.txt, W / 2, 160); c.globalAlpha = 1; }
      if (t < 5) { c.fillStyle = '#5a3a2a'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('tap to ollie · swipe in the air: mix flips + grabs', W / 2, 600); }
    },
    // Touching the screen ollies straight away (or as soon as you land / within coyote time).
    // Dragging while airborne starts a trick the moment the swipe is long enough.
    down(x, y2) { ready.go(); swipe = { x, y: y2 }; press(); },
    move(x, y2, p) { if (p && swipe && air) trySwipe(x - swipe.x, y2 - swipe.y); },
    up(x, y2) { if (swipe && air) trySwipe(x - swipe.x, y2 - swipe.y); swipe = null; },
    key(k, d) { if (!d) return; ready.go(); if (k === ' ' || k === 'ArrowUp') press(); else if (k === 'ArrowLeft' || k === 'ArrowRight') trySwipe(k === 'ArrowLeft' ? -40 : 40, 0); },
  };
}

export default {
  id: 'skate-ollie', title: 'Skate Ollie', tag: 'Casual · Action', retro: false, w: W, h: H, goal: 40,
  hint: 'Tap to ollie over cones, benches and gaps. In the air, swipe sideways for a kickflip or up for a grab; mix them to chain a combo (the same trick twice in a row scores nothing). Tricks score only over an obstacle, when you land.',
  make,
};
