import gs from '../gamescroll.js';
const { sounds } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects;
const { Physics } = gs.physics;
const { Ready } = gs.rounds;
const { approach } = gs.juice;

// Wrecking Ball: a crane runs along a gantry over a building site. Your finger is where the ball wants to be:
// slide left and right and the crane follows, dragging the ball into a swing; slide up and down and the cable
// reels in and out. The tower is real bricks (Rapier 2D physics) that tumble, slide and knock each other
// down; glass panes shatter. Every brick knocked out of place scores; flatten most of a tower for more time.
const W = 360, H = 640, GROUND = 600, RAIL = 64, BALL = 22;
const BW = 32, BH = 16, COLS = 6, TX = (W - COLS * BW) / 2;   // bricks in a running bond, 6 wide

function make(api) {
  const K = gs.tweak('Feel', {
    follow: [9, 2, 20, 'how quickly the crane follows your finger'],
    craneTop: [900, 200, 1400, 'fastest the crane runs along the gantry (units a second)'],
    reel: [420, 100, 1000, 'how fast the cable reels in and out (units a second)'],
    weight: [11, 1, 20, 'how heavy the ball is next to a brick (felt next round)'],
    gravity: [2300, 800, 3200, 'how hard things fall (felt next round)'],
    time: [40, 15, 90, 1, 'seconds on the clock at the start'],
    clearAt: [.7, .5, 1, 'share of a tower knocked down that counts as cleared'],
  });
  const ready = new Ready({ eat: false });   // the clock and the crane wait for the first touch, which also steers
  const feel = new Feel();
  // a skyline behind the site, made once
  const sky = []; for (let x = -10; x < W + 10;) { const w = rnd(26, 52); sky.push({ x, w, h: rnd(60, 190), lit: Math.random() }); x += w + rnd(0, 6); }
  let parked = 0, skyFill = null, settling = false, phys, ball, trolley, rope, ropeLen, bricks, score, time, t, level, finger, crane, aim, knocked, total, cleared, hitCool, thudCool, glassCool;

  function build() {
    for (const b of bricks || []) if (!b.dead) phys.remove(b.t);
    bricks = []; knocked = 0;
    const rows = Math.min(20, 12 + level * 2);
    for (let r = 0; r < rows; r++) {
      const y = GROUND - BH / 2 - r * BH, slab = r % 5 === 4;   // a concrete floor every fifth row holds the walls together
      if (slab) { for (const half of [0, 1]) add(TX + BW * COLS / 4 + half * BW * COLS / 2, y, BW * COLS / 2, BH, 'slab'); continue; }
      const odd = r % 2, cells = [];
      if (odd) { cells.push([TX + BW / 4, BW / 2]); for (let c = 0; c < COLS - 1; c++) cells.push([TX + BW / 2 + c * BW + BW / 2, BW]); cells.push([TX + COLS * BW - BW / 4, BW / 2]); }
      else for (let c = 0; c < COLS; c++) cells.push([TX + c * BW + BW / 2, BW]);
      cells.forEach(([x, w], i) => add(x, y, w, BH, r > 1 && w === BW && i % 3 === 1 && r % 5 !== 0 && Math.random() < .55 ? 'glass' : 'brick'));
    }
    total = bricks.reduce((s, b) => s + b.worth, 0);
    // let the new tower settle under its own weight before play (the ball held where it is), and take each
    // brick's home from where it settled, so sag doesn't count as knocked down
    const keep = [ball.x, ball.y, ball.vx, ball.vy]; settling = true;
    for (let i = 0; i < 40; i++) { phys.step(1 / 60); ball.place(keep[0], keep[1]); ball.vx = keep[2]; ball.vy = keep[3]; }
    settling = false;
    for (const b of bricks) { b.x0 = b.t.x; b.y0 = b.t.y; b.a0 = b.t.angle; b.t.body.sleep(); }   // a still tower until something hits it
    cleared = 0;
  }
  function add(x, y, w, h, kind) {
    const t = phys.box(x, y, w - .2, h, { friction: kind === 'glass' ? .4 : .8, density: kind === 'slab' ? 1.6 : kind === 'glass' ? .6 : 1, tag: kind });
    const b = { t, kind, x0: x, y0: y, w, h, worth: kind === 'glass' ? 2 : kind === 'slab' ? 3 : 1, down: false, dead: false };
    const k = rnd(-8, 8); b.color = `rgb(${186 + k | 0},${86 + k | 0},${58 + k / 2 | 0})`;   // each brick a slightly different red, made once
    t.brick = b; bricks.push(b); return b;
  }
  function knock(b) {
    if (b.down) return; b.down = true; knocked += b.worth; score += b.worth; api.score(score);
  }
  function shatter(b) {
    if (b.dead) return; knock(b); b.dead = true; const x = b.t.x, y = b.t.y; phys.remove(b.t);
    feel.juice.burst(x, y, { n: 14, speed: 200, life: .5, size: 3, color: ['#d8f2ff', '#ffffff', '#9fd2f0'], shape: 'spark', gravity: 500 });
    if (glassCool <= 0) { sounds.shatter(rnd(.9, 1.2)); glassCool = .06; }
  }
  function tie(len) {
    rope?.remove();
    rope = phys.leash(trolley, ball, trolley.x, trolley.y + 8, ball.x, ball.y, len); ropeLen = len;
  }

  return {
    reset() {
      phys?.free?.();
      phys = new Physics({ gravity: K.gravity });   // in reset(): the engine is loaded by then, and every round starts clean
      phys.world.numSolverIterations = 8;   // (Rapier's own world: a tall stack sags less with more solver passes)
      phys.box(W / 2, GROUND + 30, W * 4, 60, { fixed: true, friction: .9, tag: 'ground' });
      for (const x of [7, W - 7]) phys.box(x, (RAIL + GROUND) / 2, 10, GROUND - RAIL, { fixed: true, friction: .3, bounce: .2, tag: 'leg' });   // the gantry's legs keep the ball (and flying bricks) on screen
      level = 0; bricks = null; score = 0; t = 0; time = K.time; hitCool = thudCool = glassCool = 0;
      crane = 70; finger = null; parked = 0; aim = { x: 70, len: 300 };
      trolley = phys.box(crane, RAIL + 10, 34, 12, { moving: true, tag: 'trolley', group: 1 });
      ball = phys.circle(crane, RAIL + 18 + 300, BALL, { density: K.weight, friction: .35, bounce: .05, bullet: true, drag: .02, tag: 'ball', group: 1 });
      rope = null; tie(300);
      phys.onHit((a, b, speed, x, y) => {
        if (settling) return;
        const bl = a.tag === 'ball' ? a : b.tag === 'ball' ? b : null, other = bl === a ? b : a;
        if (bl && other.brick) {
          if (other.brick.kind === 'glass' && speed > 60) shatter(other.brick);
          if (speed > 140 && hitCool <= 0) { feel.hit(x, y, { power: Math.min(1, speed / 900), color: '#e8c9a0' }); feel.juice.burst(x, y, { n: 8, speed: 90, life: .7, size: 4, color: ['#b9a58e', '#8d7b68'], gravity: -20, drag: 2 }); hitCool = .09; if (speed > 500) haptic('heavy'); }
          return;
        }
        if (speed > 300 && (a.tag === 'leg' || b.tag === 'leg') && (a.tag === 'ball' || b.tag === 'ball')) { sounds.clang(rnd(.8, 1)); feel.juice.shake(3); }
        for (const [p, q] of [[a, b], [b, a]]) if (p.brick?.kind === 'glass' && speed > 260 && q.tag !== 'ground') shatter(p.brick);   // falling bricks break glass too
        if (speed > 260 && thudCool <= 0 && (a.tag === 'ground' || b.tag === 'ground')) { sounds.thud(rnd(.8, 1.1)); thudCool = .07; feel.juice.burst(x, GROUND, { n: 4, speed: 50, life: .5, size: 3, color: '#b9a58e', angle: -Math.PI / 2, arc: 2.4, gravity: 120 }); }
      });
      build();
      ready.reset(); feel.clear();
    },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      hitCool -= dt; thudCool -= dt; glassCool -= dt;
      if (ready.update(dt)) {
        t += dt; time -= dt;
        if (time <= 0) { haptic('success'); return api.over(); }
      }
      // the crane runs after the finger (that's what swings the ball); the cable reels towards the finger's height
      if (finger) { aim.x = clamp(finger.x, 22, W - 22); aim.len = clamp(finger.y - RAIL - 10, 110, GROUND - RAIL - 12 - BALL); }
      const was = crane; crane = approach(crane, aim.x, K.follow, dt); crane = clamp(crane, was - K.craneTop * dt, was + K.craneTop * dt);
      trolley.place(crane, RAIL + 10);
      // the winch keeps the cable tight: it pays out only as far as the ball really hangs, so a ball resting on the
      // tower is pulled off it when the crane moves away, rather than lying there on a slack cable
      const hang = Math.hypot(ball.x - trolley.x, ball.y - trolley.y - 8);
      let want = Math.min(clamp(aim.len, ropeLen - K.reel * dt, ropeLen + K.reel * dt), hang + 6);
      // a ball sat on the rubble while the crane pulls away from it gets winched up until it swings free
      // (you'd lift it yourself on a real crane; here it just happens, so the ball never stays parked on the roof)
      const sat = finger && Math.abs(ball.x - crane) > 50 && ball.speed < 90 && ball.touching().some(o => o.brick);
      parked = sat ? parked + dt : Math.max(0, parked - dt * 2);
      if (parked > .2) want = Math.max(110, hang - K.reel * .7 * dt);
      if (Math.abs(want - ropeLen) > 2) tie(want);
      phys.step(dt);
      // a brick counts once it's been knocked out of its place (or off the screen)
      for (const b of bricks) {
        if (b.dead || b.down && b.t.sleeping) continue;
        const p = b.t, at = p.body.translation(), x = at.x * phys.scale, y = at.y * phys.scale, off = x < -60 || x > W + 60 || y > H + 60;   // (one read of where it is)
        if (!b.down && !p.sleeping && (Math.hypot(x - b.x0, y - b.y0) > 10 || Math.abs(p.angle - b.a0) > .35 || off)) knock(b);
        if (off) { b.dead = true; phys.remove(p); }
      }
      if (!cleared && knocked >= total * K.clearAt) {
        cleared = 1.4; level++; time += 15; score += 10; api.score(score);
        sounds.fanfare(); haptic('success'); feel.juice.pop(W / 2, 220, 'SITE CLEARED +15s', { color: '#ffffff', size: 22 });
      }
      if (cleared > 0) {
        cleared -= dt;
        // the next tower goes up once the old one has been carted off and the ball is out of the way
        if (cleared <= 0) {
          if (Math.abs(ball.x - W / 2) < BW * COLS / 2 + BALL + 4 && ball.y > GROUND - 22 * BH) cleared = .2;
          else { for (const b of bricks) if (!b.dead) feel.juice.burst(b.t.x, b.t.y, { n: 2, speed: 40, life: .5, size: 4, color: '#b9a58e', gravity: -30 }); build(); sounds.crumble(); }
        }
      }
    },
    draw(c, alpha = 1) {
      // sky and skyline
      if (skyFill?.c !== c) { const g = c.createLinearGradient(0, 0, 0, GROUND); g.addColorStop(0, '#5fa8e0'); g.addColorStop(1, '#cfe6f2'); skyFill = { c, g }; }
      const g = skyFill.g;
      feel.begin(c);
      c.fillStyle = g; c.fillRect(-20, -20, W + 40, GROUND + 20);
      c.fillStyle = '#fff6d0'; c.beginPath(); c.arc(300, 130, 26, 0, 7); c.fill();
      for (const s of sky) {
        c.fillStyle = '#9fbccc'; c.fillRect(s.x, GROUND - s.h, s.w, s.h);
        c.fillStyle = '#b6cfdb'; for (let y = GROUND - s.h + 8; y < GROUND - 10; y += 14) for (let x = s.x + 5; x < s.x + s.w - 6; x += 10) if (((x * 7 + y * 3) % 11) / 11 < s.lit) c.fillRect(x, y, 4, 6);
      }
      // ground: dirt, gravel and a site fence
      c.fillStyle = '#7a644c'; c.fillRect(-20, GROUND, W + 40, H - GROUND + 20);
      c.fillStyle = '#8d765c'; c.fillRect(-20, GROUND, W + 40, 5);
      c.fillStyle = '#6a5642'; for (let x = 4; x < W; x += 13) c.fillRect(x, GROUND + 12 + (x * 7) % 18, 4, 3);
      c.fillStyle = '#e8e2d4'; for (let x = 0; x < 70; x += 12) c.fillRect(x, GROUND - 26, 3, 26); for (let x = W - 70; x < W; x += 12) c.fillRect(x, GROUND - 26, 3, 26);
      c.fillRect(0, GROUND - 22, 72, 2); c.fillRect(W - 72, GROUND - 22, 72, 2); c.fillStyle = '#ff7a2a'; c.fillRect(0, GROUND - 14, 72, 4); c.fillRect(W - 72, GROUND - 14, 72, 4);
      // gantry legs and beam
      c.fillStyle = '#e0a21c'; c.fillRect(2, RAIL - 6, 10, GROUND - RAIL + 6); c.fillRect(W - 12, RAIL - 6, 10, GROUND - RAIL + 6);
      c.strokeStyle = '#b77f10'; c.lineWidth = 2; c.beginPath();
      for (let y = RAIL + 4; y < GROUND - 10; y += 24) { c.moveTo(3, y); c.lineTo(11, y + 12); c.moveTo(W - 3, y); c.lineTo(W - 11, y + 12); }
      c.stroke();
      c.fillStyle = '#ffc233'; c.fillRect(0, RAIL - 14, W, 6); c.fillRect(0, RAIL, W, 6);
      c.strokeStyle = '#d99a14'; c.beginPath(); for (let x = 0; x < W; x += 16) { c.moveTo(x, RAIL - 8); c.lineTo(x + 8, RAIL); c.lineTo(x + 16, RAIL - 8); } c.stroke();
      // bricks
      for (const b of bricks) {
        if (b.dead) continue;
        const p = b.t, at = p.body.translation(), w0 = p._was, sc = phys.scale, hw = b.w / 2 - .1, hh = b.h / 2;   // one read of where it is, mixed between ticks
        const x = w0 ? w0.x + (at.x * sc - w0.x) * alpha : at.x * sc, y = w0 ? w0.y + (at.y * sc - w0.y) * alpha : at.y * sc;
        c.save(); c.translate(x, y); c.rotate(p.sleeping || !w0 ? p.angle : p.sangle);
        if (b.kind === 'glass') {
          c.fillStyle = '#5b4a40'; c.fillRect(-hw, -hh, hw * 2, hh * 2);
          c.fillStyle = '#a9daf3'; c.fillRect(-hw + 2, -hh + 2, hw * 2 - 4, hh * 2 - 4);
          c.fillStyle = '#ffffffb0'; c.fillRect(-hw + 6, -hh + 3, 3, hh * 2 - 6); c.fillRect(-hw + 11, -hh + 3, 1, hh * 2 - 6);
        } else if (b.kind === 'slab') {
          c.fillStyle = '#a3a6a8'; c.fillRect(-hw, -hh, hw * 2, hh * 2);
          c.fillStyle = '#bfc2c3'; c.fillRect(-hw, -hh, hw * 2, 3);
          c.fillStyle = '#7f8385'; c.fillRect(-hw, hh - 3, hw * 2, 3); for (let k = -hw + 10; k < hw - 4; k += 18) c.fillRect(k, -1, 3, 3);
        } else {
          c.fillStyle = '#d9cbb4'; c.fillRect(-hw, -hh, hw * 2, hh * 2);   // mortar round it
          c.fillStyle = b.color; c.fillRect(-hw + 1, -hh + 1, hw * 2 - 2, hh * 2 - 2);
          c.fillStyle = '#ffffff22'; c.fillRect(-hw + 1, -hh + 1, hw * 2 - 2, 3);
          c.fillStyle = '#00000026'; c.fillRect(-hw + 1, hh - 4, hw * 2 - 2, 3);
        }
        c.restore();
      }
      // trolley, cable (slack when the ball is closer than the cable is long) and the ball
      const tx = trolley.sx, ty = trolley.sy, bx = ball.sx, by = ball.sy;
      c.fillStyle = '#3b3f45'; c.fillRect(tx - 18, ty - 8, 36, 14); c.fillStyle = '#ffc233'; c.fillRect(tx - 18, ty - 8, 36, 3);
      c.fillStyle = '#222'; c.beginPath(); c.arc(tx - 11, ty - 9, 4, 0, 7); c.arc(tx + 11, ty - 9, 4, 0, 7); c.fill();
      const ang = ball.sangle, ax = bx, d = Math.hypot(bx - tx, by - ty - 8), sag = Math.max(0, ropeLen - d) * .6;
      c.strokeStyle = '#2a2a2a'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(tx, ty + 6); c.quadraticCurveTo((tx + ax) / 2, (ty + by) / 2 + sag, ax, by - BALL + 2); c.stroke();
      c.fillStyle = '#555'; c.fillRect(bx - 4, by - BALL - 5, 8, 7);
      const bg = c.createRadialGradient(bx - 8, by - 9, 3, bx, by, BALL); bg.addColorStop(0, '#9aa0a6'); bg.addColorStop(.5, '#4b5055'); bg.addColorStop(1, '#1d1f22');
      c.fillStyle = bg; c.beginPath(); c.arc(bx, by, BALL, 0, 7); c.fill();
      c.strokeStyle = '#ffffff30'; c.lineWidth = 2; c.beginPath(); c.arc(bx, by, BALL - 6, ang - 2.4, ang - 1.4); c.stroke();
      // where the finger is asking the ball to go
      if (finger) { c.strokeStyle = '#ffffff80'; c.lineWidth = 2; c.beginPath(); c.arc(aim.x, RAIL + 10 + aim.len, 9, 0, 7); c.stroke(); }
      feel.end(c, W, H);
      // HUD (the app's score badge is top centre)
      const low = time < 8;
      c.fillStyle = '#00000055'; c.beginPath(); c.roundRect(10, 12, 64, 26, 13); c.fill();
      c.fillStyle = low && (t * 4 | 0) % 2 ? '#ff6a5a' : '#ffffff'; c.font = '700 16px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText(`${Math.max(0, Math.ceil(time))}s`, 22, 31);
      c.fillStyle = '#00000055'; c.beginPath(); c.roundRect(W - 84, 12, 74, 26, 13); c.fill();
      c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.fillText(`Site ${level + 1}`, W - 47, 31);
      // how much of this tower is down
      const k = Math.min(1, knocked / (total * K.clearAt));
      c.fillStyle = '#00000040'; c.fillRect(W / 2 - 60, 44 - 0, 120, 6); c.fillStyle = cleared ? '#7dff8a' : '#ffd84a'; c.fillRect(W / 2 - 60, 44, 120 * k, 6);
      if (ready.waiting) ready.draw(c, W, H, { text: 'Slide to swing the ball', y: 560 });
      else if (t < 4) { c.fillStyle = '#ffffffdd'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('left / right swings · up / down reels the cable', W / 2, 628); }
    },
    down(x, y) { ready.go(); finger = { x, y }; },
    move(x, y) { if (finger) { finger.x = x; finger.y = y; } },
    up() { finger = null; },
    key(k, d) {
      if (d) ready.go();
      if (!d) return;
      if (k === 'ArrowLeft') aim.x = clamp(aim.x - 60, 22, W - 22);
      if (k === 'ArrowRight') aim.x = clamp(aim.x + 60, 22, W - 22);
      if (k === 'ArrowUp') aim.len = clamp(aim.len - 40, 110, GROUND - RAIL - 12 - BALL);
      if (k === 'ArrowDown') aim.len = clamp(aim.len + 40, 110, GROUND - RAIL - 12 - BALL);
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'wrecking-ball', title: 'Wrecking Ball', tag: 'Casual · Physics', retro: false, w: W, h: H, goal: 100, tick: 60, music: 'chase',
  hint: 'Slide left and right to run the crane and swing the ball, up and down to reel the cable. Knock the tower down before time runs out; glass scores double and a flattened site adds time.',
  make,
};
