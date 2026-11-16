import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp } = gs.util;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { Brain } = gs.brains;
const { mix } = gs.tick;
const { text: ptext } = gs.pixel;

// Blob Ball: one-on-one jelly football with snappy thumb steering, buffered jumps, squash-and-stretch
// headers, and a Tiny Brains rival that reads rallies and plays exciting close matches.
let W = 220, H = 150;
const R = 17, BR = 5, GOALH = 38, GOALW = 14;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // game keeps its own chiptune audio
  const ready = new Ready({ eat: false });                              // kick-off waits for the first touch

  // Feel knobs (docs/feel-words.md)
  const K = gs.tweak('Feel', {
    speed: [175, 90, 260, 'how fast your blob moves across the pitch'],
    accel: [1700, 600, 3600, 'how quickly your blob reaches top speed'],
    stop: [2100, 700, 4200, 'how quickly your blob brakes when released'],
    jump: [268, 170, 360, 'upward jump speed'],
    gravity: [560, 320, 900, 'downward gravity on blobs'],
    coyote: [0.12, 0.04, 0.24, 'seconds after leaving ground a jump still counts'],
    buffer: [0.14, 0.04, 0.24, 'seconds before landing a jump input stays queued'],
    power: [1.12, 0.8, 1.5, 'header punch multiplier off your blob'],
  });

  // Pre-allocated AI input buffer to avoid per-frame allocations
  const see = [0, 0, 0, 0, 0, 0];
  const actions = ['advance', 'defend', 'jump', 'hold'];

  // Tiny Brains opponent with guard rails + feel() signals
  const bot = new Brain(api, {
    name: 'blob-ball-rival',
    inputs: 6,
    actions,
    teacher: s => {
      const distBall = s[0], ballY = s[1], ballVx = s[2], meDist = s[4];
      if (Math.abs(distBall) < 0.16 && ballY > 0.06 && ballY < 0.56) return 'jump';
      if (distBall < -0.04 && meDist > -0.18) return 'advance';
      if (distBall > 0.04 || ballVx < -0.14) return 'defend';
      return 'hold';
    },
    limits: { react: 0.14, perSecond: 7, minNoise: 0.05 },
    rules: (s, a) => (s[1] < 0.04 && a === 'jump' ? 'defend' : a),
    tells: true,
  });

  let me, ai, ball, sc, match, goals, t, phase, pt, msg, clock, golden;
  let finger, tapStart, flickJump, moveDir, keyDir;
  let coyoteT, jumpBuf, heldJump, hitCd, rally, calmT;
  let prevMeX, prevMeY, prevAiX, prevAiY, prevBallX, prevBallY;
  const floor = () => H - 14;

  function syncPrev() {
    prevMeX = me.x; prevMeY = me.y;
    prevAiX = ai.x; prevAiY = ai.y;
    prevBallX = ball.x; prevBallY = ball.y;
  }

  function kickoff(towards) {
    me = { x: W * 0.25, y: floor(), vx: 0, vy: 0, sx: 1, sy: 1, wasAir: false };
    ai = { x: W * 0.75, y: floor(), vx: 0, vy: 0, sx: 1, sy: 1, wasAir: false };
    ball = { x: W / 2 + (towards || 0) * 10, y: H * 0.34, vx: (towards || 0) * 24, vy: 0 };
    phase = 'ready'; pt = 0; hitCd = 0; rally = 0; calmT = 0;
    coyoteT = 0; jumpBuf = 0; heldJump = false;
    syncPrev();
  }

  function startMatch() {
    sc = [0, 0]; clock = 90; golden = false;
    kickoff(0);
    msg = { txt: `MATCH ${match + 1}`, l: 1.4 };
  }

  const aiSpeed = () => clamp(92 + match * 12, 85, 175) * (0.62 + 0.45 * bot.skill);

  function queueJump() {
    jumpBuf = K.buffer;
    heldJump = true;
  }

  function doJump(s, isMe) {
    s.vy = -K.jump;
    s.sx = 0.78; s.sy = 1.28;
    if (isMe) {
      coyoteT = 0;
      jumpBuf = 0;
      sfx(520, 0.055, 'triangle', 0.04, 280);
      haptic('light');
      feel.juice.burst(s.x, floor() - 1, {
        n: 6, speed: 45, arc: Math.PI * 0.7, angle: -Math.PI / 2,
        life: 0.25, size: 1.8, gravity: 180, color: ['#d8f4ff', '#78c8f0'],
      });
    } else {
      sfx(430, 0.04, 'triangle', 0.025, 190);
    }
  }

  function moveSlime(s, tgtX, maxSpd, dt, lo, hi, isMe) {
    const dx = tgtX - s.x;
    const wantVx = Math.abs(dx) < 1.2 ? 0 : clamp(dx * 16, -maxSpd, maxSpd);
    const rate = wantVx === 0 ? K.stop : (wantVx * s.vx < 0 ? K.stop * 1.35 : K.accel);
    const step = rate * dt;
    if (Math.abs(wantVx - s.vx) <= step) s.vx = wantVx;
    else s.vx += Math.sign(wantVx - s.vx) * step;

    s.x = clamp(s.x + s.vx * dt, lo, hi);
    if (s.x <= lo || s.x >= hi) s.vx = 0;

    const wasGround = s.y >= floor() - 0.5;
    if (isMe) {
      if (wasGround) coyoteT = K.coyote;
      else coyoteT = Math.max(0, coyoteT - dt);
      if (jumpBuf > 0) jumpBuf = Math.max(0, jumpBuf - dt);
      if (jumpBuf > 0 && (wasGround || coyoteT > 0)) doJump(s, true);
    }

    s.vy += K.gravity * dt;
    s.y += s.vy * dt;
    if (s.y >= floor()) {
      s.y = floor();
      if (s.wasAir && s.vy > 90) {
        s.sx = 1.24; s.sy = 0.78;
        if (isMe) {
          sfx(180, 0.04, 'sine', 0.025, -40);
          feel.juice.burst(s.x, floor(), {
            n: 4, speed: 32, arc: Math.PI * 0.6, angle: -Math.PI / 2,
            life: 0.2, size: 1.4, gravity: 140, color: ['#98e090', '#f8f8f0'],
          });
        }
      }
      s.vy = 0;
      s.wasAir = false;
    } else {
      s.wasAir = true;
    }
    s.sx += (1 - s.sx) * Math.min(1, dt * 14);
    s.sy += (1 - s.sy) * Math.min(1, dt * 14);
  }

  function slimeHit(s, isMe) {
    const dx = ball.x - s.x, dy = ball.y - s.y, d = Math.hypot(dx, dy);
    if (d > 0.001 && d < R + BR && ball.y < s.y + 3) {
      const nx = dx / d, ny = dy / d;
      ball.x = s.x + nx * (R + BR);
      ball.y = s.y + ny * (R + BR);
      const rvx = ball.vx - s.vx, rvy = ball.vy - s.vy, dot = rvx * nx + rvy * ny;
      if (dot < 0) {
        const mult = isMe ? K.power : 1.0;
        ball.vx -= 1.92 * dot * nx * mult;
        ball.vy -= 1.92 * dot * ny * mult;
        ball.vx += s.vx * (isMe ? 0.58 : 0.48);
        ball.vy += Math.min(0, s.vy) * (isMe ? 0.45 : 0.36);
      }
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp > 340) { ball.vx *= 340 / sp; ball.vy *= 340 / sp; }
      s.sx = 1.2; s.sy = 0.82;

      if (hitCd <= 0) {
        hitCd = 0.08;
        rally++;
        calmT = 0;
        if (isMe) {
          haptic(sp > 200 ? 'medium' : 'light');
          if (sp > 210) {
            feel.juice.freeze(0.025);
            feel.juice.shake(1.8);
            feel.juice.burst(ball.x, ball.y, {
              n: 7, speed: 68, life: 0.28, size: 1.5, color: ['#f8e848', '#ffffff'],
            });
          }
        }
        // Excite Tiny Brains on sharp rallies and dramatic saves
        if (!isMe && ball.x > W - GOALW * 2.5 && ball.vx < -40) {
          bot.feel(0.9);
        } else if (isMe && ball.x > W * 0.58 && ball.vx > 150) {
          bot.feel(0.75);
        } else if (rally >= 3 && sp > 165) {
          bot.feel(0.55);
        }
        sfx(280 + Math.min(420, sp), 0.045, 'square', 0.04, 110);
      }
    }
  }

  function scored(side) {
    sc[side]++;
    phase = 'goal';
    pt = 0;
    feel.juice.burst(ball.x, ball.y, {
      n: 18, speed: 120, arc: Math.PI, angle: -Math.PI / 2,
      life: 0.8, size: 2, gravity: 300, color: [side ? '#f85858' : '#58c8f8', '#f8f8f0'],
    });
    if (side === 0) {
      goals++;
      api.score(goals);
      haptic('success');
      sfx(880, 0.3, 'square', 0.05, 400);
      feel.juice.shake(2.4);
      msg = { txt: 'GOAL!', l: 1.2 };
      bot.feel(0.6);
    } else {
      haptic('error');
      sfx(160, 0.3, 'sawtooth', 0.05, -50);
      msg = { txt: 'CONCEDED', l: 1.2 };
      feel.juice.shake(3.2);
      bot.feel(0.2);
    }
  }

  return {
    reset() {
      match = 0; goals = 0; t = 0;
      finger = null; tapStart = null; flickJump = false; moveDir = 0; keyDir = 0;
      feel.clear();
      ready.reset();
      startMatch();
    },
    fx(dt) { feel.update(dt); },
    resize(w, h) { if (w === W && h === H) return; W = w; H = h; if (me) kickoff(0); },
    update(dt) {
      feel.update(dt);
      if (feel.frozen) return;
      if (!ready.update(dt)) return;
      syncPrev();
      t += dt; pt += dt;
      if (hitCd > 0) hitCd -= dt;
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (phase === 'over') { if (pt > 1.8) api.over(); return; }
      if (phase === 'won') { if (pt > 1.8) { match++; startMatch(); } return; }
      if (phase === 'goal') {
        if (pt > 1.25) {
          const done = golden || sc[0] >= 5 || sc[1] >= 5;
          if (done) {
            const playerWon = sc[0] > sc[1];
            bot.result(playerWon);
            if (playerWon) {
              phase = 'won'; pt = 0;
              goals += 3;
              api.score(goals);
              msg = { txt: `WON ${sc[0]}-${sc[1]}!`, l: 1.8 };
              haptic('success');
            } else {
              phase = 'over'; pt = 0;
              msg = { txt: `LOST ${sc[0]}-${sc[1]}`, l: 9 };
            }
          } else {
            kickoff(sc[0] > sc[1] ? 1 : -1);
          }
        }
        return;
      }
      if (phase === 'ready') { if (pt > 0.65) phase = 'play'; else return; }

      if (!golden) {
        clock -= dt;
        if (clock <= 0) {
          clock = 0;
          if (sc[0] === sc[1]) {
            golden = true;
            msg = { txt: 'GOLDEN GOAL!', l: 1.4 };
            sfx(660, 0.14, 'triangle', 0.04, 140);
          } else {
            phase = 'goal'; pt = 1.3;
            msg = { txt: 'TIME!', l: 1.1 };
            return;
          }
        }
      }

      // Player steering: snappy acceleration + drag tracking + keyboard direction
      let tgt = me.x;
      if (keyDir) tgt = me.x + keyDir * 80;
      else if (finger) tgt = finger.x;
      moveSlime(me, tgt, K.speed, dt, R, W - R, true);

      // Tiny Brains rival decision + feel signals
      see[0] = clamp((ball.x - ai.x) / W, -1, 1);
      see[1] = clamp((ai.y - ball.y) / H, -1, 1);
      see[2] = clamp(ball.vx / 330, -1, 1);
      see[3] = clamp(ball.vy / 330, -1, 1);
      see[4] = clamp((me.x - ai.x) / W, -1, 1);
      see[5] = clamp((ball.x - W * 0.5) / (W * 0.5), -1, 1);
      bot.act(see, dt);

      const act = bot.action;
      let aimX = ai.x;
      if (act === 'advance') {
        aimX = clamp(ball.x + 8, W * 0.44, W - R);
      } else if (act === 'defend') {
        aimX = clamp(ball.x + 18 + ball.vx * 0.14, W * 0.54, W - R);
      } else if (act === 'hold') {
        aimX = clamp(W * 0.78, W * 0.55, W - R);
      } else if (act === 'jump') {
        aimX = clamp(ball.x + ball.vx * 0.08, W * 0.46, W - R);
        if (ai.y >= floor() - 0.5 && Math.abs(ball.x - ai.x) < 34 && ball.y < ai.y - 10) {
          doJump(ai, false);
        }
      }
      moveSlime(ai, aimX, aiSpeed(), dt, R, W - R, false);

      // Dull standoff penalty to teach active positioning
      if (Math.hypot(ball.vx, ball.vy) < 32) {
        calmT += dt;
        if (calmT > 2.4) { calmT = 0; bot.feel(-0.35); }
      } else {
        calmT = 0;
      }

      // Ball physics
      ball.vy += K.gravity * 0.52 * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.y > floor() - BR) {
        ball.y = floor() - BR;
        ball.vy *= -0.72;
        ball.vx *= 0.96;
        if (Math.abs(ball.vy) > 45) sfx(135, 0.03, 'triangle', 0.02);
      }
      if (ball.y < BR + 12) {
        ball.y = BR + 12;
        ball.vy = Math.abs(ball.vy) * 0.62;
      }

      // Goal frames: crossbar & back wall
      for (const side of [0, 1]) {
        const inX = side ? ball.x < GOALW : ball.x > W - GOALW;
        const barY = floor() - GOALH;
        if (inX && Math.abs(ball.y - barY) < BR + 1.5 && ball.vy > 0 && ball.y < barY + 2) {
          ball.vy = -Math.abs(ball.vy) * 0.65;
          sfx(420, 0.04, 'square', 0.03, -80);
        }
        if (inX && ball.y > barY + BR) { scored(side); return; }
      }
      if (ball.x < BR) { ball.x = BR; ball.vx = Math.abs(ball.vx) * 0.74; }
      if (ball.x > W - BR) { ball.x = W - BR; ball.vx = -Math.abs(ball.vx) * 0.74; }

      slimeHit(me, true);
      slimeHit(ai, false);
    },
    draw(c, alpha = 1) {
      c.fillStyle = '#284860';
      c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = '#386080';
      for (let i = 0; i < 8; i++) c.fillRect((i * 53 + 20) % W, 18 + (i * 29) % 40, 2, 2);

      // Pitch turf
      c.fillStyle = '#3c9a48'; c.fillRect(0, floor(), W, H - floor());
      c.fillStyle = '#48b058'; for (let x = 0; x < W; x += 20) c.fillRect(x, floor(), 10, H - floor());
      c.fillStyle = '#f8f8f040'; c.fillRect(W / 2 - 1, floor(), 2, H - floor());

      // Nets
      for (const side of [0, 1]) {
        const x = side ? W - GOALW : 0, y = floor() - GOALH;
        c.fillStyle = '#ffffff20'; c.fillRect(x, y, GOALW, GOALH);
        c.strokeStyle = '#ffffff50';
        for (let i = 4; i < GOALH; i += 6) { c.beginPath(); c.moveTo(x, y + i); c.lineTo(x + GOALW, y + i); c.stroke(); }
        c.fillStyle = '#f8f8f0'; c.fillRect(x, y - 2, GOALW, 2); c.fillRect(side ? x : x + GOALW - 2, y, 2, GOALH);
      }

      const mx = mix(prevMeX, me.x, alpha), my = mix(prevMeY, me.y, alpha);
      const ax = mix(prevAiX, ai.x, alpha), ay = mix(prevAiY, ai.y, alpha);
      const bx = mix(prevBallX, ball.x, alpha), by = mix(prevBallY, ball.y, alpha);

      const drawBlob = (sx0, sy0, s, col, eyeDir, tell) => {
        c.save();
        c.translate(sx0, sy0);
        c.scale(s.sx, s.sy);
        // Ground shadow when airborne
        c.fillStyle = col;
        c.beginPath(); c.arc(0, 0, R, Math.PI, 0); c.fill();
        c.fillStyle = '#ffffff40';
        c.beginPath(); c.arc(-R * 0.4, -R * 0.55, 4, 0, 7); c.fill();
        const ex = eyeDir * R * 0.45, ey = -R * 0.55;
        c.fillStyle = '#f8f8f0'; c.beginPath(); c.arc(ex, ey, 4, 0, 7); c.fill();
        const ang = Math.atan2(by - (sy0 + ey), bx - (sx0 + ex));
        c.fillStyle = '#101018';
        c.beginPath(); c.arc(ex + Math.cos(ang) * 2, ey + Math.sin(ang) * 2, 2, 0, 7); c.fill();
        c.restore();
        if (tell) {
          c.fillStyle = '#f8e848';
          c.fillRect(sx0 - 1, sy0 - R - 7, 2, 4);
          c.fillRect(sx0 - 1, sy0 - R - 2, 2, 1);
        }
      };

      drawBlob(mx, my, me, '#48b8f8', 1, false);
      drawBlob(ax, ay, ai, '#f85868', -1, bot.telling && bot.telling.action === 'jump');

      // Ball
      c.fillStyle = '#f8e848';
      c.beginPath(); c.arc(bx, by, BR, 0, 7); c.fill();
      c.fillStyle = '#c8a828';
      c.fillRect(bx - 1, by - 3, 2, 2);
      if (by < 14) { c.fillStyle = '#f8e848'; c.fillRect(bx - 2, 14, 4, 2); }
      feel.end(c, W, H);

      // Top HUD (kept well clear of top-right api.scoreArea() badge)
      c.fillStyle = '#10182880'; c.fillRect(0, 0, W, 11);
      ptext(c, `YOU ${sc[0]}`, 4, 3, { color: '#48b8f8', align: 'left' });
      ptext(c, golden ? 'GOLD' : `${Math.ceil(clock)}S`, W * 0.36, 3, {
        color: golden ? '#f8e848' : clock < 10 ? '#f8a040' : '#f8f8f0',
        align: 'center',
      });
      ptext(c, `${sc[1]} RIVAL`, W * 0.62, 3, { color: '#f85868', align: 'center' });

      if (msg) {
        c.fillStyle = '#000a'; c.fillRect(0, H * 0.38 - 9, W, 13);
        ptext(c, msg.txt, W / 2, H * 0.38 - 5, {
          color: phase === 'over' ? '#f86060' : '#f8e848',
          align: 'center',
          outline: '#101018',
        });
      }
      if (!ready.playing) {
        ready.draw(c, W, H, { text: 'SLIDE TO STEER - TAP TO JUMP', size: 1, color: '#f8f8f0', pixel: true, y: H * 0.56 });
      } else if (t < 4.5 && match === 0 && sc[0] + sc[1] === 0) {
        ptext(c, 'SLIDE TO STEER - TAP OR FLICK', W / 2, H * 0.56, { color: '#f8f8f0b0', align: 'center' });
      }
    },
    down(x, y, id) {
      ready.go();
      if (!finger || finger.id === id) {
        finger = { x, y, startX: x, startY: y, id };
        tapStart = { x, y, t, moved: false };
        flickJump = false;
      } else {
        // Second-finger quick tap anywhere jumps cleanly while steering with first thumb
        queueJump();
      }
    },
    move(x, y, p, id) {
      if (!p || !finger) return;
      if (finger.id !== undefined && id !== undefined && finger.id !== id) return;
      if (Math.abs(x - tapStart.x) > 10 || Math.abs(y - tapStart.y) > 10) tapStart.moved = true;
      if (!flickJump && finger.y - y > 10) {
        queueJump();
        flickJump = true;
        finger.y = y;
      } else if (y > finger.y) {
        finger.y = y;
        flickJump = false;
      }
      finger.x = x;
    },
    up(x, y, id) {
      if (finger && (finger.id === undefined || id === undefined || finger.id === id)) {
        const dist = tapStart ? Math.hypot((x ?? tapStart.x) - tapStart.x, (y ?? tapStart.y) - tapStart.y) : 99;
        if (tapStart && !flickJump && t - tapStart.t < 0.25 && dist < 14) {
          queueJump();
        }
        // Short-hop variable jump cut when releasing early on upward rise
        if (heldJump && me && me.vy < -95) me.vy *= 0.65;
        heldJump = false;
        finger = null;
      }
    },
    key(k, d) {
      if (!d) {
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') { moveDir &= ~1; keyDir = (moveDir & 2 ? 1 : 0); }
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') { moveDir &= ~2; keyDir = (moveDir & 1 ? -1 : 0); }
        else if ((k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') && me && me.vy < -95) { me.vy *= 0.65; heldJump = false; }
        return;
      }
      ready.go();
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { moveDir |= 1; keyDir = -1; }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { moveDir |= 2; keyDir = 1; }
      else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') queueJump();
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'blob-ball',
  title: 'Blob Ball',
  tag: 'Advance · Football',
  retro: true,
  era: 'advance',
  pal: 'mint',
  w: 220,
  h: 150,
  maxW: 340,
  maxH: 240,
  tick: 60,
  music: 'heroic',
  goal: 12,
  hint: 'One-on-one jelly football against an adaptive Tiny Brains rival. Slide your finger to steer, tap or flick up to jump, and head the ball into the rival net. First to five wins; lose a match and it ends.',
  creator: 'Game Scroll',
  make,
};
