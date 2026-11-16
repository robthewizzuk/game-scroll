// Ricochet Duel: top-down cyber-court energy-disc bank-shot duel against adaptive rival Volt.
import gs from '../gamescroll.js';

const { C16 } = gs.palettes;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { Brain, Dial } = gs.brains;
const { Gestures, Keys } = gs.controls;
const { text } = gs.pixel;
const { clamp, rnd } = gs.util;
const { mix } = gs.tick;

const W = 176, H = 176;
const GOAL = 15;
const WALL_L = 10, WALL_R = 166;
const COURT_T = 22, COURT_B = 160;
const PRISM = 15;
const SQRT1_2 = Math.SQRT1_2;
const TRAIL_N = 10;

// C16 cyber-court color roles
const BG = C16[0];        // #101018 deep cyber floor
const WHITE = C16[1];     // #f8f8f0 bright core
const RED = C16[2];       // #e04040 danger / damage
const ORANGE = C16[3];    // #f08830 warning / spark
const GOLD = C16[4];      // #f8d838 power bank / +5
const GREEN = C16[5];     // #58c040 player shields
const CYAN = C16[7];      // #38b8e8 player / prism / bank
const COBALT = C16[8];    // #3858d8 court rails
const PURPLE = C16[9];    // #8848c8 Volt body
const MAGENTA = C16[10];  // #e868b8 Volt surge / plasma bumper
const SLATE = C16[13];    // #888898 muted / recharging
const SILVER = C16[14];   // #c8c8d0 trim

function make(api) {
  const feel = new Feel({ pixel: true });
  const ready = new Ready({ text: 'TAP TO DUEL' });
  const keys = new Keys();

  const K = gs.tweak('Feel', {
    discSpeed: [126, 80, 180, 'base speed of the energy disc'],
    maxSpeed: [235, 150, 310, 'top disc speed after power banks'],
    paddleSpeed: [290, 160, 420, 'how fast your paddle tracks your drag'],
    voltSpeed: [104, 70, 180, 'base speed of Volt paddle'],
    maxTilt: [.54, .2, .75, 'how much drag speed tilts your paddle'],
    parryWindow: [.2, .08, .35, 'seconds a tap or release powers a shot'],
    parryCool: [.55, .25, 1.0, 'seconds before Power Bank can pulse again'],
    bumperRespawn: [5.0, 2.0, 10.0, 'seconds for shattered plasma bumpers to recharge'],
    shields: [4, 2, 6, 1, 'player court shields before defeat'],
  });

  // Pre-allocated state objects (zero per-frame allocations in update/draw)
  const see = [0, 0, 0, 0, 0, 0];
  const prismFlash = new Float32Array(4);
  const wallFlash = new Float32Array(2);
  const trail = Array.from({ length: TRAIL_N }, () => ({ x: W / 2, y: H / 2, mode: 0 }));
  const bumpers = [
    { x: 50, y: 91, r: 8, hp: 1, cd: 0, flash: 0 },
    { x: 126, y: 91, r: 8, hp: 1, cd: 0, flash: 0 },
  ];
  const voltCells = [
    { x0: 16, x1: 62, intact: true, flash: 0 },
    { x0: 65, x1: 111, intact: true, flash: 0 },
    { x0: 114, x1: 160, intact: true, flash: 0 },
  ];
  const playerCells = Array.from({ length: 6 }, (_, i) => ({ x0: 0, x1: 0, intact: i < 4, flash: 0 }));
  const msg = { txt: '', t: 0, color: WHITE };

  const player = {
    x: W / 2, wasX: W / 2, y: 146, w: 30, h: 5,
    vx: 0, tilt: 0, wasTilt: 0,
    chargeT: 0, chargeCd: 0, flash: 0,
    idleT: 0, lastX: W / 2, straightStreak: 0,
  };

  const voltPad = {
    x: W / 2, wasX: W / 2, y: 35, w: 28, h: 5,
    vx: 0, dashT: 0, dashCd: 0, dashDir: 1, flash: 0,
    eyeOff: 0,
  };

  const disc = {
    x: W / 2, y: H / 2, wasX: W / 2, wasY: H / 2,
    vx: 0, vy: 0, r: 3.5, speed: 108,
    banked: false, power: false, voltSurge: false, playerHit: false,
    bounces: 0, serveT: 0, serveDir: 1, serveAimX: W / 2,
    trailHead: 0, trailTimer: 0,
  };

  let score = 0;
  let shields = 4;
  let t = 0;
  let rally = 0;
  let ended = false;
  let pointerDown = false;
  let pointerId = null;
  let targetX = W / 2;
  let dragDist = 0;
  let dragTime = 0;
  let pulsedInUp = false;

  const voltDial = new Dial(api, { name: 'volt-dial', target: .6, start: .42, range: [.2, .95] });

  function predictVoltX() {
    if (disc.vy >= -4) return disc.x;
    const ty = voltPad.y + 4;
    const dtHit = clamp((ty - disc.y) / disc.vy, 0, 2.2);
    let px = disc.x + disc.vx * dtHit;
    const minX = WALL_L + disc.r;
    const maxX = WALL_R - disc.r;
    const span = maxX - minX;
    if (span <= 0) return W / 2;
    let rel = px - minX;
    // Reflect across side walls without allocations
    const period = span * 2;
    rel = ((rel % period) + period) % period;
    if (rel > span) rel = period - rel;
    return minX + rel;
  }

  const volt = new Brain(api, {
    name: 'volt',
    inputs: 6,
    actions: ['left', 'center', 'right', 'dash'],
    limits: { react: .14, perSecond: 7, minNoise: .06 },
    tells: { windup: .08, unsure: .65 },
    teacher(s) {
      // s: [discVx, discVy, playerX, playerTilt, predVoltX, relDiscX]
      if (s[1] < -0.05) {
        const tx = W / 2 + s[4] * 68;
        const diff = tx - voltPad.x;
        if (Math.abs(diff) > 34 && disc.y < 108 && voltPad.dashCd <= 0) return 'dash';
        if (diff < -5) return 'left';
        if (diff > 5) return 'right';
        return 'center';
      }
      // Anticipate while ball travels toward player: counter straight returns or shade open angle
      const guardX = Math.abs(s[3]) > 0.35
        ? clamp(W / 2 - s[3] * 26, WALL_L + 22, WALL_R - 22)
        : clamp(W / 2 + s[2] * 20, WALL_L + 22, WALL_R - 22);
      const diff = guardX - voltPad.x;
      if (diff < -6) return 'left';
      if (diff > 6) return 'right';
      return 'center';
    },
    rules(s, a) {
      if (a === 'dash' && voltPad.dashCd > 0) return s[5] < 0 ? 'left' : 'right';
      if (voltPad.x <= WALL_L + voltPad.w * 0.5 + 4 && a === 'left') return 'center';
      if (voltPad.x >= WALL_R - voltPad.w * 0.5 - 4 && a === 'right') return 'center';
      return a;
    },
  });

  function showMsg(txt, color, dur = 1.1) {
    msg.txt = txt;
    msg.color = color;
    msg.t = dur;
  }

  function layoutPlayerShields(count) {
    const n = clamp(count | 0, 2, 6);
    const totalW = (WALL_R - 4) - (WALL_L + 4);
    const gap = 3;
    const cellW = (totalW - gap * (n - 1)) / n;
    for (let i = 0; i < 6; i++) {
      const c = playerCells[i];
      c.x0 = Math.round(WALL_L + 4 + i * (cellW + gap));
      c.x1 = Math.round(c.x0 + cellW);
      c.intact = i < n;
      c.flash = 0;
    }
  }

  function enforceVertical(speed) {
    const minVy = speed * 0.38;
    if (Math.abs(disc.vy) < minVy) {
      const sy = disc.vy >= 0 ? 1 : -1;
      const sx = disc.vx >= 0 ? 1 : -1;
      disc.vy = sy * minVy;
      disc.vx = sx * Math.sqrt(Math.max(1, speed * speed - disc.vy * disc.vy));
    }
  }

  function resetTrail(x, y) {
    for (let i = 0; i < TRAIL_N; i++) {
      trail[i].x = x;
      trail[i].y = y;
      trail[i].mode = 0;
    }
    disc.trailHead = 0;
  }

  function pushTrail() {
    const slot = trail[disc.trailHead];
    slot.x = disc.x;
    slot.y = disc.y;
    slot.mode = disc.power ? 3 : disc.banked ? 2 : disc.voltSurge ? 1 : 0;
    disc.trailHead = (disc.trailHead + 1) % TRAIL_N;
  }

  function prepServe(fromVolt = true) {
    disc.banked = false;
    disc.power = false;
    disc.voltSurge = false;
    disc.playerHit = !fromVolt;
    disc.bounces = 0;
    disc.speed = K.discSpeed + Math.min(24, score * 1.1);
    disc.serveT = 0.55;
    disc.serveDir = fromVolt ? 1 : -1;
    disc.x = disc.wasX = fromVolt ? voltPad.x : player.x;
    disc.y = disc.wasY = fromVolt ? voltPad.y + 8 : player.y - 8;
    disc.vx = 0;
    disc.vy = 0;
    rally = 0;

    // Volt serves away from player's current position (punishes idle/holding still!)
    const leftSpace = player.x - WALL_L;
    const rightSpace = WALL_R - player.x;
    const openRight = rightSpace >= leftSpace;
    const cornerX = openRight ? WALL_R - 18 : WALL_L + 18;
    disc.serveAimX = clamp(cornerX + rnd(-12, 12), WALL_L + 14, WALL_R - 14);
    resetTrail(disc.x, disc.y);
  }

  function launchServe() {
    const startX = disc.x;
    const startY = disc.y;
    const targetY = disc.serveDir > 0 ? player.y : voltPad.y;
    const dx = disc.serveAimX - startX;
    const dy = targetY - startY;
    const len = Math.hypot(dx, dy) || 1;
    disc.vx = (dx / len) * disc.speed;
    disc.vy = (dy / len) * disc.speed;
    enforceVertical(disc.speed);
    feel.shoot(disc.x, disc.y, { color: disc.serveDir > 0 ? MAGENTA : CYAN, angle: Math.atan2(disc.vy, disc.vx) });
  }

  function triggerPowerBank(fromRelease = false) {
    if (ended || ready.waiting) return;
    if (player.chargeCd > 0) {
      // Anti-mash penalty: blind repeated tapping delays recharge slightly
      if (!fromRelease) {
        player.chargeCd = Math.min(0.72, player.chargeCd + 0.12);
        feel.click();
      }
      return;
    }
    player.chargeT = K.parryWindow;
    player.chargeCd = K.parryCool;
    player.flash = 0.15;
    feel.click();
  }

  const gestures = new Gestures({
    tap() {
      pulsedInUp = true;
      triggerPowerBank(false);
    },
    swipe(dir) {
      if (dir === 'up') {
        pulsedInUp = true;
        triggerPowerBank(false);
      }
    },
    drag(x, y, dx) {
      targetX = clamp(x, WALL_L + player.w * 0.5 + 2, WALL_R - player.w * 0.5 - 2);
      dragDist += Math.abs(dx);
    },
  });

  function reflectPrism(nx, ny, idx) {
    const dot = disc.vx * nx + disc.vy * ny;
    if (dot < 0) {
      disc.vx -= 2 * dot * nx;
      disc.vy -= 2 * dot * ny;
      const spd = Math.min(K.maxSpeed, disc.speed * 1.03);
      const cur = Math.hypot(disc.vx, disc.vy) || 1;
      disc.vx = (disc.vx / cur) * spd;
      disc.vy = (disc.vy / cur) * spd;
      disc.speed = spd;
      enforceVertical(spd);
      disc.banked = true;
      disc.bounces++;
      prismFlash[idx] = 1;
      feel.hit(disc.x, disc.y, { color: CYAN, power: .4 });
      volt.feel(0.5);
    }
  }

  function stepDisc(subDt) {
    disc.x += disc.vx * subDt;
    disc.y += disc.vy * subDt;

    // 1. Side walls
    if (disc.x - disc.r < WALL_L) {
      disc.x = WALL_L + disc.r;
      disc.vx = Math.abs(disc.vx);
      disc.banked = true;
      disc.bounces++;
      wallFlash[0] = 1;
      enforceVertical(disc.speed);
      feel.hit(disc.x, disc.y, { color: COBALT, power: .28 });
    } else if (disc.x + disc.r > WALL_R) {
      disc.x = WALL_R - disc.r;
      disc.vx = -Math.abs(disc.vx);
      disc.banked = true;
      disc.bounces++;
      wallFlash[1] = 1;
      enforceVertical(disc.speed);
      feel.hit(disc.x, disc.y, { color: COBALT, power: .28 });
    }

    // 2. Four 45-degree corner prism bumpers
    const r = disc.r;
    // Top-Left prism: (x - WALL_L) + (y - COURT_T) < PRISM + r * 1.4
    const dTL = (disc.x - WALL_L) + (disc.y - COURT_T);
    if (dTL < PRISM + r * 1.41) {
      const push = (PRISM + r * 1.41 - dTL) * SQRT1_2;
      disc.x += push; disc.y += push;
      reflectPrism(SQRT1_2, SQRT1_2, 0);
    }
    // Top-Right prism
    const dTR = (WALL_R - disc.x) + (disc.y - COURT_T);
    if (dTR < PRISM + r * 1.41) {
      const push = (PRISM + r * 1.41 - dTR) * SQRT1_2;
      disc.x -= push; disc.y += push;
      reflectPrism(-SQRT1_2, SQRT1_2, 1);
    }
    // Bottom-Left prism
    const dBL = (disc.x - WALL_L) + (COURT_B - disc.y);
    if (dBL < PRISM + r * 1.41) {
      const push = (PRISM + r * 1.41 - dBL) * SQRT1_2;
      disc.x += push; disc.y -= push;
      reflectPrism(SQRT1_2, -SQRT1_2, 2);
    }
    // Bottom-Right prism
    const dBR = (WALL_R - disc.x) + (COURT_B - disc.y);
    if (dBR < PRISM + r * 1.41) {
      const push = (PRISM + r * 1.41 - dBR) * SQRT1_2;
      disc.x -= push; disc.y -= push;
      reflectPrism(-SQRT1_2, -SQRT1_2, 3);
    }

    // 3. Mid-court breakable plasma bumpers
    for (let i = 0; i < 2; i++) {
      const b = bumpers[i];
      if (b.hp <= 0) continue;
      const dx = disc.x - b.x;
      const dy = disc.y - b.y;
      const minD = b.r + disc.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD * minD) {
        const d = Math.sqrt(d2) || 0.001;
        const nx = dx / d, ny = dy / d;
        disc.x = b.x + nx * (minD + 0.5);
        disc.y = b.y + ny * (minD + 0.5);
        const dot = disc.vx * nx + disc.vy * ny;
        if (dot < 0) {
          disc.vx -= 2 * dot * nx;
          disc.vy -= 2 * dot * ny;
        }
        disc.speed = Math.min(K.maxSpeed, disc.speed * 1.06);
        const cur = Math.hypot(disc.vx, disc.vy) || 1;
        disc.vx = (disc.vx / cur) * disc.speed;
        disc.vy = (disc.vy / cur) * disc.speed;
        enforceVertical(disc.speed);
        b.hp = 0;
        b.cd = K.bumperRespawn;
        b.flash = 1;
        disc.bounces++;
        feel.boom(b.x, b.y, { size: .5, color: [MAGENTA, CYAN, WHITE] });
        volt.feel(0.65);
      }
    }

    // 4. Player paddle collision (moving downward toward player)
    if (disc.vy > 0 && disc.y + disc.r >= player.y - 3 && disc.y - disc.r <= player.y + 4) {
      const halfW = player.w * 0.5 + disc.r;
      if (Math.abs(disc.x - player.x) <= halfW) {
        const edge = clamp((disc.x - player.x) / (player.w * 0.5), -1, 1);
        const powered = player.chargeT > 0;
        const passiveIdle = player.idleT > 0.7 && Math.abs(player.vx) < 8 && !powered;
        const speedMul = powered ? 1.32 : passiveIdle ? 0.92 : 1.03;
        disc.speed = Math.min(K.maxSpeed, Math.max(K.discSpeed, disc.speed * speedMul));
        // Combine edge offset + horizontal drag tilt for deliberate bank-shot aiming
        // Completely motionless paddle returns gently straight to center into Volt's guard
        const aimAngle = passiveIdle
          ? clamp(edge * 0.14, -0.14, 0.14)
          : clamp(edge * 0.58 + player.tilt * 1.15, -1.1, 1.1);
        if (Math.abs(player.tilt) < 0.1 && !powered) player.straightStreak++;
        else player.straightStreak = 0;

        disc.vx = Math.sin(aimAngle) * disc.speed;
        disc.vy = -Math.cos(aimAngle) * disc.speed;
        enforceVertical(disc.speed);
        disc.y = player.y - 3 - disc.r - 0.5;
        disc.banked = false;
        disc.voltSurge = false;
        disc.playerHit = true;
        disc.power = powered;
        rally++;

        if (powered) {
          player.chargeT = 0;
          player.flash = 0.25;
          feel.powerup(disc.x, disc.y, { color: GOLD, text: 'POWER!' });
          showMsg('POWER BANK!', GOLD, 0.85);
          volt.feel(0.95);
        } else {
          player.flash = 0.12;
          feel.hit(disc.x, disc.y, { color: CYAN, power: .45 });
          volt.feel(Math.abs(aimAngle) > 0.45 ? 0.65 : -0.2);
        }
      }
    }

    // 5. Volt paddle collision (moving upward toward Volt)
    if (disc.vy < 0 && disc.y - disc.r <= voltPad.y + 3 && disc.y + disc.r >= voltPad.y - 4) {
      const halfW = voltPad.w * 0.5 + disc.r;
      if (Math.abs(disc.x - voltPad.x) <= halfW) {
        const edge = clamp((disc.x - voltPad.x) / (voltPad.w * 0.5), -1, 1);
        const skill = voltDial.skill;
        // Volt targets wide open lane or corner prism when player camps or spams straight shots
        const leftGap = player.x - WALL_L;
        const rightGap = WALL_R - player.x;
        const aimSide = rightGap >= leftGap ? 1 : -1;
        const smartBias = (player.idleT > 0.65 || player.straightStreak >= 2)
          ? aimSide * (0.48 + 0.35 * skill)
          : aimSide * 0.3 * skill + edge * 0.45;
        const jitter = (1 - skill) * rnd(-0.22, 0.22);
        const retAngle = clamp(smartBias + jitter, -0.98, 0.98);

        const surging = voltPad.dashT > 0;
        disc.speed = Math.min(K.maxSpeed, disc.speed * (surging ? 1.12 : 1.02));
        disc.vx = Math.sin(retAngle) * disc.speed;
        disc.vy = Math.cos(retAngle) * disc.speed;
        enforceVertical(disc.speed);
        disc.y = voltPad.y + 3 + disc.r + 0.5;
        disc.banked = false;
        disc.power = false;
        disc.voltSurge = surging;
        voltPad.flash = 0.16;
        rally++;

        feel.hit(disc.x, disc.y, { color: surging ? MAGENTA : PURPLE, power: surging ? .65 : .4 });
        volt.feel(surging ? 0.8 : 0.45);
      }
    }

    // 6. Goal checks
    if (disc.y - disc.r <= COURT_T) {
      // Unassisted serves bouncing off mid-court bumpers cannot score points on Volt
      if (!disc.playerHit) {
        disc.y = COURT_T + disc.r + 1;
        disc.vy = Math.abs(disc.vy);
        feel.hit(disc.x, COURT_T + 2, { color: PURPLE, power: .25 });
        return false;
      }
      // Player scored behind Volt!
      const pts = disc.banked ? 5 : 3;
      score += pts;
      api.score(score);

      // Shatter matching Volt shield cell (Left / Mid / Right)
      let hitCell = 1;
      if (disc.x < voltCells[0].x1 + 2) hitCell = 0;
      else if (disc.x > voltCells[2].x0 - 2) hitCell = 2;
      voltCells[hitCell].intact = false;
      voltCells[hitCell].flash = 1;

      const allBroken = !voltCells[0].intact && !voltCells[1].intact && !voltCells[2].intact;
      if (allBroken) {
        for (let i = 0; i < 3; i++) {
          voltCells[i].intact = true;
          voltCells[i].flash = 1;
        }
        showMsg('SHIELD REBOOT!', MAGENTA, 1.1);
      } else {
        showMsg(disc.banked ? `BANK +${pts}!` : `GOAL +${pts}`, disc.banked ? GOLD : CYAN, 0.95);
      }

      feel.coin(disc.x, COURT_T + 8, { color: disc.banked ? GOLD : CYAN, text: `+${pts}` });
      feel.boom(disc.x, COURT_T + 2, { size: .6, color: [disc.banked ? GOLD : CYAN, WHITE] });
      volt.feel(disc.banked ? 0.9 : 0.4);
      volt.result(true);

      if (score >= GOAL) {
        ended = true;
        voltDial.result(true);
        feel.win(W / 2, H / 2);
        api.win();
        return true;
      }
      prepServe(true);
      return true;
    }

    if (disc.y + disc.r >= COURT_B) {
      // Volt scored behind Player!
      shields--;
      const n = clamp(K.shields | 0, 2, 6);
      // Break closest intact shield cell to disc impact
      let best = -1, bestD = 1e9;
      for (let i = 0; i < n; i++) {
        if (!playerCells[i].intact) continue;
        const cx = (playerCells[i].x0 + playerCells[i].x1) * 0.5;
        const d = Math.abs(disc.x - cx);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best >= 0) {
        playerCells[best].intact = false;
        playerCells[best].flash = 1;
      }

      feel.hurt(disc.x, COURT_B - 4);
      volt.feel(player.idleT > 0.6 ? -0.5 : 0.6);
      volt.result(false);
      showMsg(player.idleT > 0.6 ? 'MOVE TO DEFEND!' : 'SHIELD LOST!', RED, 1.0);

      if (shields <= 0) {
        ended = true;
        voltDial.result(false);
        feel.lose();
        api.over();
        return true;
      }
      prepServe(true);
      return true;
    }
    return false;
  }

  return {
    reset() {
      score = 0;
      shields = clamp(K.shields | 0, 2, 6);
      t = 0;
      rally = 0;
      ended = false;
      pointerDown = false;
      pointerId = null;
      targetX = W / 2;
      dragDist = 0;
      dragTime = 0;
      pulsedInUp = false;

      player.x = player.wasX = player.lastX = W / 2;
      player.vx = 0;
      player.tilt = player.wasTilt = 0;
      player.chargeT = 0;
      player.chargeCd = 0;
      player.flash = 0;
      player.idleT = 0;
      player.straightStreak = 0;

      voltPad.x = voltPad.wasX = W / 2;
      voltPad.vx = 0;
      voltPad.dashT = 0;
      voltPad.dashCd = 0;
      voltPad.flash = 0;
      voltPad.eyeOff = 0;

      for (let i = 0; i < 4; i++) prismFlash[i] = 0;
      wallFlash[0] = wallFlash[1] = 0;
      for (let i = 0; i < 2; i++) {
        bumpers[i].hp = 1;
        bumpers[i].cd = 0;
        bumpers[i].flash = 0;
      }
      for (let i = 0; i < 3; i++) {
        voltCells[i].intact = true;
        voltCells[i].flash = 0;
      }
      layoutPlayerShields(shields);
      msg.txt = '';
      msg.t = 0;

      prepServe(true);
      api.score(0);
      feel.clear();
      ready.reset();
      gestures.release();
      keys.clear();
    },

    fx(dt) {
      feel.update(dt);
    },

    update(dt) {
      feel.update(dt);
      if (feel.frozen) return;
      if (!ready.update(dt) || ended) return;

      t += dt;
      gestures.update();
      if (msg.t > 0) msg.t = Math.max(0, msg.t - dt);

      // Decay flashes and recharge timers
      for (let i = 0; i < 4; i++) if (prismFlash[i] > 0) prismFlash[i] = Math.max(0, prismFlash[i] - dt * 3.5);
      for (let i = 0; i < 2; i++) {
        if (wallFlash[i] > 0) wallFlash[i] = Math.max(0, wallFlash[i] - dt * 4);
        const b = bumpers[i];
        if (b.flash > 0) b.flash = Math.max(0, b.flash - dt * 3.5);
        if (b.hp <= 0) {
          b.cd -= dt;
          if (b.cd <= 0) {
            b.hp = 1;
            b.cd = 0;
            b.flash = 0.8;
            feel.click();
          }
        }
      }
      for (let i = 0; i < 3; i++) if (voltCells[i].flash > 0) voltCells[i].flash = Math.max(0, voltCells[i].flash - dt * 3);
      for (let i = 0; i < 6; i++) if (playerCells[i].flash > 0) playerCells[i].flash = Math.max(0, playerCells[i].flash - dt * 3);

      // Player movement (touch target + keyboard axis)
      player.wasX = player.x;
      player.wasTilt = player.tilt;
      if (player.chargeT > 0) player.chargeT = Math.max(0, player.chargeT - dt);
      if (player.chargeCd > 0) player.chargeCd = Math.max(0, player.chargeCd - dt);
      if (player.flash > 0) player.flash = Math.max(0, player.flash - dt);

      const ka = keys.axis();
      if (ka.x !== 0) {
        targetX = clamp(player.x + ka.x * K.paddleSpeed * dt, WALL_L + player.w * 0.5 + 2, WALL_R - player.w * 0.5 - 2);
      }
      if (pointerDown) dragTime += dt;

      const minPX = WALL_L + player.w * 0.5 + 2;
      const maxPX = WALL_R - player.w * 0.5 - 2;
      const dx = clamp(targetX, minPX, maxPX) - player.x;
      const maxStep = K.paddleSpeed * dt;
      player.x += clamp(dx, -maxStep, maxStep);
      player.vx = (player.x - player.wasX) / dt;

      // Tilt paddle based on horizontal drag velocity so player actively aims bank shots
      const desiredTilt = clamp(player.vx / 210, -1, 1) * K.maxTilt;
      player.tilt += (desiredTilt - player.tilt) * Math.min(1, dt * 16);

      // Track player idleness for Volt's anti-idle targeting
      if (Math.abs(player.x - player.lastX) < 1.2) player.idleT += dt;
      else {
        player.idleT = 0;
        player.lastX = player.x;
      }

      // Volt Brain decision + movement
      voltPad.wasX = voltPad.x;
      if (voltPad.dashT > 0) voltPad.dashT = Math.max(0, voltPad.dashT - dt);
      if (voltPad.dashCd > 0) voltPad.dashCd = Math.max(0, voltPad.dashCd - dt);
      if (voltPad.flash > 0) voltPad.flash = Math.max(0, voltPad.flash - dt);

      const predX = predictVoltX();
      see[0] = clamp(disc.vx / 180, -1, 1);
      see[1] = clamp(disc.vy / 180, -1, 1);
      see[2] = clamp((player.x - W / 2) / 60, -1, 1);
      see[3] = clamp(player.tilt / K.maxTilt, -1, 1);
      see[4] = clamp((predX - W / 2) / 68, -1, 1);
      see[5] = clamp((disc.x - voltPad.x) / 76, -1, 1);

      volt.act(see, dt);
      const act = volt.action;
      const vSpd = K.voltSpeed * (0.64 + 0.36 * voltDial.skill);
      if (act === 'dash' && voltPad.dashCd <= 0) {
        voltPad.dashT = 0.16;
        voltPad.dashCd = 1.1 - 0.32 * voltDial.skill;
        voltPad.dashDir = predX >= voltPad.x ? 1 : -1;
        voltPad.flash = 0.2;
      }
      if (voltPad.dashT > 0) {
        voltPad.x += voltPad.dashDir * vSpd * 2.1 * dt;
      } else if (act === 'left') {
        voltPad.x -= vSpd * dt;
      } else if (act === 'right') {
        voltPad.x += vSpd * dt;
      } else {
        // 'center' holds guard on incoming shots or centers smoothly when ball goes down
        const guard = disc.vy < -5 ? predX : W / 2;
        const gDiff = guard - voltPad.x;
        if (Math.abs(gDiff) > 2) voltPad.x += clamp(gDiff, -vSpd * 0.65 * dt, vSpd * 0.65 * dt);
      }
      voltPad.x = clamp(voltPad.x, WALL_L + voltPad.w * 0.5 + 2, WALL_R - voltPad.w * 0.5 - 2);
      voltPad.vx = (voltPad.x - voltPad.wasX) / dt;
      voltPad.eyeOff = clamp((disc.x - voltPad.x) / 30, -4, 4);

      // Disc serve countdown or 2x sub-stepped movement
      disc.wasX = disc.x;
      disc.wasY = disc.y;
      if (disc.serveT > 0) {
        disc.serveT -= dt;
        disc.x = disc.wasX = disc.serveDir > 0 ? voltPad.x : player.x;
        if (disc.serveT <= 0) launchServe();
        return;
      }

      const subDt = dt * 0.5;
      if (!stepDisc(subDt)) stepDisc(subDt);

      disc.trailTimer += dt;
      if (disc.trailTimer >= 0.022) {
        disc.trailTimer = 0;
        pushTrail();
      }
    },

    draw(c, alpha = 1) {
      const sa = api.scoreArea();

      // 1. Cyber-court floor
      c.fillStyle = BG;
      c.fillRect(0, 0, W, H);

      feel.begin(c);

      // Subtle court grid & center line (strictly C16 with low alpha)
      c.save();
      c.globalAlpha = 0.14;
      c.fillStyle = COBALT;
      for (let gx = WALL_L + 13; gx < WALL_R; gx += 18) c.fillRect(gx, COURT_T, 1, COURT_B - COURT_T);
      for (let gy = COURT_T + 14; gy < COURT_B; gy += 18) c.fillRect(WALL_L, gy, WALL_R - WALL_L, 1);
      c.globalAlpha = 0.28;
      c.fillStyle = PURPLE;
      c.fillRect(WALL_L + 2, 91, WALL_R - WALL_L - 4, 1);
      c.strokeStyle = PURPLE;
      c.lineWidth = 1;
      c.beginPath();
      c.arc(W / 2, 91, 18, 0, Math.PI * 2);
      c.stroke();
      c.restore();

      // 2. Side energy rails
      c.fillStyle = wallFlash[0] > 0.1 ? CYAN : COBALT;
      c.fillRect(WALL_L - 2, COURT_T, 2, COURT_B - COURT_T);
      c.fillStyle = wallFlash[1] > 0.1 ? CYAN : COBALT;
      c.fillRect(WALL_R, COURT_T, 2, COURT_B - COURT_T);

      // 3. Four 45-degree corner prism bumpers
      for (let i = 0; i < 4; i++) {
        const cx = i % 2 === 0 ? WALL_L : WALL_R;
        const cy = i < 2 ? COURT_T : COURT_B;
        const sx = i % 2 === 0 ? 1 : -1;
        const sy = i < 2 ? 1 : -1;
        c.fillStyle = prismFlash[i] > 0.15 ? GOLD : CYAN;
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(cx + sx * PRISM, cy);
        c.lineTo(cx, cy + sy * PRISM);
        c.closePath();
        c.fill();
        c.fillStyle = WHITE;
        c.fillRect(cx + sx * 3 - (sx < 0 ? 1 : 0), cy + sy * 3 - (sy < 0 ? 1 : 0), 2, 2);
      }

      // 4. Volt's 3 shield/goal segments (top court line)
      for (let i = 0; i < 3; i++) {
        const vc = voltCells[i];
        const w = vc.x1 - vc.x0;
        if (vc.intact) {
          c.fillStyle = vc.flash > 0.15 ? WHITE : PURPLE;
          c.fillRect(vc.x0, COURT_T - 2, w, 4);
          c.fillStyle = vc.flash > 0.15 ? GOLD : MAGENTA;
          c.fillRect(vc.x0 + 2, COURT_T - 1, w - 4, 2);
        } else {
          c.fillStyle = vc.flash > 0.15 ? ORANGE : SLATE;
          c.fillRect(vc.x0, COURT_T - 1, 5, 2);
          c.fillRect(vc.x1 - 5, COURT_T - 1, 5, 2);
        }
      }

      // 5. Player's 4 court shields (bottom court line)
      const nShields = clamp(K.shields | 0, 2, 6);
      for (let i = 0; i < nShields; i++) {
        const pc = playerCells[i];
        const w = pc.x1 - pc.x0;
        if (pc.intact) {
          c.fillStyle = pc.flash > 0.15 ? WHITE : GREEN;
          c.fillRect(pc.x0, COURT_B - 2, w, 4);
          c.fillStyle = CYAN;
          c.fillRect(pc.x0 + 2, COURT_B - 2, w - 4, 1);
        } else {
          c.fillStyle = pc.flash > 0.15 ? RED : SLATE;
          c.fillRect(pc.x0, COURT_B - 1, 4, 2);
          c.fillRect(pc.x1 - 4, COURT_B - 1, 4, 2);
        }
      }

      // 6. Breakable mid-court plasma bumpers
      for (let i = 0; i < 2; i++) {
        const b = bumpers[i];
        if (b.hp > 0) {
          c.fillStyle = b.flash > 0.15 ? WHITE : MAGENTA;
          c.fillRect(b.x - 6, b.y - 6, 12, 12);
          c.fillStyle = CYAN;
          c.fillRect(b.x - 8, b.y - 3, 16, 6);
          c.fillRect(b.x - 3, b.y - 8, 6, 16);
          c.fillStyle = WHITE;
          c.fillRect(b.x - 2, b.y - 2, 4, 4);
        } else {
          const pct = clamp(1 - b.cd / K.bumperRespawn, 0, 1);
          c.fillStyle = SLATE;
          c.fillRect(b.x - 6, b.y - 6, 12, 1);
          c.fillRect(b.x - 6, b.y + 5, 12, 1);
          c.fillRect(b.x - 6, b.y - 6, 1, 12);
          c.fillRect(b.x + 5, b.y - 6, 1, 12);
          const fh = Math.round(pct * 10);
          if (fh > 0) {
            c.fillStyle = PURPLE;
            c.fillRect(b.x - 5, b.y + 5 - fh, 10, fh);
          }
        }
      }

      // 7. Disc spark trail
      for (let i = 0; i < TRAIL_N; i++) {
        const idx = (disc.trailHead + i) % TRAIL_N;
        const pt = trail[idx];
        const age = (i + 1) / TRAIL_N;
        const sz = age > 0.6 ? 4 : age > 0.3 ? 3 : 2;
        c.fillStyle = pt.mode === 3 ? GOLD : pt.mode === 2 ? CYAN : pt.mode === 1 ? MAGENTA : SLATE;
        c.fillRect(Math.round(pt.x - sz * 0.5), Math.round(pt.y - sz * 0.5), sz, sz);
      }

      // 8. Volt's paddle + adaptive tell
      const vx = Math.round(mix(voltPad.wasX, voltPad.x, alpha));
      const vw = voltPad.w;
      c.fillStyle = voltPad.flash > 0.05 ? WHITE : voltPad.dashT > 0 ? MAGENTA : PURPLE;
      c.fillRect(vx - vw * 0.5, voltPad.y - 2, vw, voltPad.h);
      c.fillStyle = volt.telling ? GOLD : RED;
      c.fillRect(vx - vw * 0.5 + 2, voltPad.y + 2, vw - 4, 1);
      // Visor eye scanning disc/target
      c.fillStyle = volt.telling ? GOLD : WHITE;
      c.fillRect(Math.round(vx + voltPad.eyeOff - 2), voltPad.y - 1, 4, 2);

      // 9. Player's tilted paddle (pixel-sliced to show drag-tilt angle)
      const px = Math.round(mix(player.wasX, player.x, alpha));
      const ptilt = mix(player.wasTilt, player.tilt, alpha);
      const pw = player.w;
      const slices = 5;
      const sliceW = pw / slices;
      const charged = player.chargeT > 0;
      const cooling = player.chargeCd > 0;
      for (let s = 0; s < slices; s++) {
        const u = s - (slices - 1) * 0.5;
        const sx = Math.round(px - pw * 0.5 + s * sliceW);
        const sy = Math.round(player.y - 2 + u * Math.sin(ptilt) * 3.2);
        c.fillStyle = charged ? GOLD : player.flash > 0.05 ? WHITE : CYAN;
        c.fillRect(sx, sy, Math.ceil(sliceW), player.h);
        c.fillStyle = WHITE;
        c.fillRect(sx, sy, Math.ceil(sliceW), 1);
      }
      if (charged) {
        c.fillStyle = WHITE;
        c.fillRect(px - pw * 0.5 - 2, player.y - 3, 2, 7);
        c.fillRect(px + pw * 0.5, player.y - 3, 2, 7);
      }

      // 10. Energy disc
      const dx = Math.round(mix(disc.wasX, disc.x, alpha));
      const dy = Math.round(mix(disc.wasY, disc.y, alpha));
      if (disc.serveT > 0) {
        const pulse = ((t * 10 | 0) % 2) ? WHITE : ORANGE;
        c.fillStyle = pulse;
        c.fillRect(dx - 4, dy - 4, 8, 8);
      }
      c.fillStyle = disc.power ? GOLD : disc.banked ? CYAN : disc.voltSurge ? MAGENTA : SILVER;
      c.fillRect(dx - 3, dy - 3, 6, 6);
      c.fillStyle = WHITE;
      c.fillRect(dx - 2, dy - 2, 4, 4);

      feel.end(c, W, H);

      // 11. Top-corner HUD (strictly outside api.scoreArea())
      const topY = 3;
      const leftSafe = Math.max(4, Math.floor(sa.x) - 4);
      if (leftSafe > 24) {
        text(c, 'VOLT', 4, topY, { color: MAGENTA });
        const lv = voltDial.level(5);
        for (let i = 0; i < 5; i++) {
          c.fillStyle = i < lv ? GOLD : SLATE;
          c.fillRect(4 + i * 4, topY + 7, 3, 2);
        }
      }

      text(c, `G${GOAL}`, W - 4, topY, { align: 'right', color: GOLD });
      for (let i = 0; i < nShields; i++) {
        c.fillStyle = i < shields ? GREEN : RED;
        c.fillRect(W - 4 - (nShields - i) * 5, topY + 7, 4, 2);
      }

      // 12. Bottom bar: Power Bank gauge + brief tactical prompt
      const readyPct = cooling ? clamp(1 - player.chargeCd / K.parryCool, 0, 1) : 1;
      c.fillStyle = SLATE;
      c.fillRect(10, 166, 36, 4);
      c.fillStyle = charged ? WHITE : readyPct >= 1 ? GOLD : CYAN;
      c.fillRect(10, 166, Math.round(36 * readyPct), 4);
      text(c, 'PWR', 49, 165, { color: readyPct >= 1 ? GOLD : SLATE });

      if (msg.t > 0) {
        text(c, msg.txt, W - 10, 165, { align: 'right', color: msg.color });
      } else if (t < 4.5 && !ready.waiting) {
        text(c, 'DRAG TILT  TAP PWR', W - 10, 165, { align: 'right', color: WHITE });
      } else if (rally >= 4) {
        text(c, `RALLY ${rally}`, W - 10, 165, { align: 'right', color: CYAN });
      } else {
        text(c, 'BANK +5', W - 10, 165, { align: 'right', color: CYAN });
      }

      ready.draw(c, W, H, { pixel: true, text: 'TAP TO DUEL', color: WHITE, y: 114 });
    },

    down(x, y, id) {
      if (ready.go()) return;
      if (ended) return;
      gestures.down(x, y, id);
      if (pointerId == null && y >= H * 0.42) {
        pointerId = id;
        pointerDown = true;
        dragDist = 0;
        dragTime = 0;
        targetX = clamp(x, WALL_L + player.w * 0.5 + 2, WALL_R - player.w * 0.5 - 2);
      }
    },

    move(x, y, pressed, id) {
      gestures.move(x, y, pressed, id);
      if (pressed && id === pointerId) {
        targetX = clamp(x, WALL_L + player.w * 0.5 + 2, WALL_R - player.w * 0.5 - 2);
      }
    },

    up(x, y, id) {
      pulsedInUp = false;
      gestures.up(x, y, id);
      if (id === pointerId) {
        // Releasing a drag right as the disc approaches triggers Power Bank timing
        if (!pulsedInUp && dragDist > 4 && dragTime < 0.9 && disc.vy > 0 && disc.y > 88) {
          triggerPowerBank(true);
        }
        pointerDown = false;
        pointerId = null;
        targetX = player.x;
      }
    },

    key(k, isDown) {
      if (isDown && ready.go()) return;
      keys.key(k, isDown);
      if (isDown && (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W')) {
        triggerPowerBank(false);
      }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'ricochet-duel',
  title: 'Ricochet Duel',
  tag: 'Advance · Duel',
  retro: true,
  era: 'advance',
  pal: 'grape',
  w: W,
  h: H,
  tick: 60,
  music: 'heroic',
  goal: GOAL,
  hint: 'Drag to tilt-aim bank shots past Volt and tap at impact for a Power Bank; score 15 or lose your shields.',
  creator: 'Antigravity',
  make,
};
