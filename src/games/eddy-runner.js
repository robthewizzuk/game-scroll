import gs from '../gamescroll.js';

const { C16 } = gs.palettes;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { Streams } = gs.flow;
const { Path } = gs.paths;
const { text } = gs.pixel;
const { mix } = gs.tick;
const { clamp, rnd } = gs.util;
const { sounds } = gs.sound;
const { haptic } = gs.device;

const W = 176, H = 176;
const STEP_Y = 56, NUM_PTS = 14, FOAM_MAX = 56;
const tmpA = { x: 0, y: 0 }, tmpB = { x: 0, y: 0 }, tmpN = { x: 0, y: 0 };

function make(api) {
  const feel = new Feel({ pixel: true });
  const ready = new Ready({ eat: true });
  const K = gs.tweak('Feel', {
    current: [58, 30, 100, 'base river current speed'],
    steer: [3.0, 1.5, 5.0, 'how sharply the kayak carves'],
    stroke: [52, 20, 90, 'forward paddle burst speed'],
    drag: [.92, .75, .98, 'how much water carries the kayak'],
    whirl: [48, 20, 90, 'whirlpool spin and pull strength'],
    hull: [3, 2, 5, 1, 'hull hits before sinking'],
  });

  // Pre-allocated object pools to avoid per-frame GC
  const foam = Array.from({ length: FOAM_MAX }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, col: C16[1], s: 1 }));
  const pts = Array.from({ length: NUM_PTS }, () => ({ x: W / 2, y: 0 }));
  const leftBankX = new Float32Array(180);
  const leftBankY = new Float32Array(180);
  const rightBankX = new Float32Array(180);
  const rightBankY = new Float32Array(180);
  const keys = { left: false, right: false };

  let foamIdx = 0;
  let streams, riverPath, river;
  let kayak, camY, score, hull, misses, gatesSpawned, gatesCleared, t;
  let boulders, whirls, gates, trees;
  let lastSlot, genSeed, eddyGlow, nextGateY;
  let holding, dragStartX, dragStartY, dragX, dragMoved, swipedUp;

  function spawnFoam(x, y, vx, vy, life, col, s = 1) {
    const f = foam[foamIdx];
    foamIdx = (foamIdx + 1) % FOAM_MAX;
    f.x = x; f.y = y; f.vx = vx; f.vy = vy; f.life = life; f.max = life; f.col = col; f.s = s;
  }

  function nextRand() {
    genSeed = (genSeed * 1664525 + 1013904223) >>> 0;
    return genSeed / 4294967296;
  }

  function riverWidthAt() {
    return clamp(106 - gatesCleared * 0.65, 90, 106);
  }

  function currentSpeedAt() {
    return K.current + Math.min(30, gatesCleared * 1.4);
  }

  function rebuildStreams() {
    riverPath = new Path(pts, { detail: 10 });
    streams = new Streams({ space: '2d' });
    river = streams.river(riverPath, { width: riverWidthAt(), speed: currentSpeedAt(), push: 1 });
    for (let i = 0; i < boulders.length; i++) {
      const b = boulders[i];
      const nr = riverPath.nearest(b.x, b.y);
      river.rock(nr.d, b.side, b.r);
      if (b.eddy) streams.pool({ x: b.ex, y: b.ey }, b.er, { push: 0.16 });
    }
    for (let i = 0; i < whirls.length; i++) {
      const w = whirls[i];
      streams.whirl({ x: w.x, y: w.y }, w.r, w.spin, w.pull);
    }
  }

  function populateSegment(toY) {
    const gateStep = 112;
    while (nextGateY > toY + 18) {
      const gy = nextGateY;
      nextGateY -= gateStep;
      const n = riverPath.nearest(W / 2, gy);
      const halfW = riverWidthAt() * 0.5;

      // Alternate distinct chutes (left / center / right) so staying centered misses side gates
      const choices = lastSlot === 0 ? [-1, 1] : lastSlot < 0 ? [1, 0] : [-1, 0];
      const slot = gatesSpawned === 0 ? (nextRand() < 0.5 ? -1 : 1) : choices[(nextRand() * choices.length) | 0];
      lastSlot = slot;

      const gateW = clamp(29 - gatesSpawned * 0.3, 23, 29);
      const maxOffset = Math.max(12, halfW - gateW * 0.5 - 5);
      const side = slot * maxOffset * (0.85 + nextRand() * 0.15);
      const gp = riverPath.offset(n.d, side);
      const lx = gp.x - (-gp.dy) * (gateW * 0.5);
      const ly = gp.y - gp.dx * (gateW * 0.5);
      const rx = gp.x + (-gp.dy) * (gateW * 0.5);
      const ry = gp.y + gp.dx * (gateW * 0.5);

      gates.push({
        x: gp.x, y: gp.y, dx: gp.dx, dy: gp.dy, angle: gp.angle,
        width: gateW, side, leftX: lx, leftY: ly, rightX: rx, rightY: ry,
        state: 0,
      });

      // Guarding boulder + calm eddy pocket in the opposing/center channel
      const rockSide = slot === 0 ? (nextRand() < 0.5 ? -1 : 1) * halfW * 0.52 : -slot * halfW * (0.18 + nextRand() * 0.32);
      const rockD = clamp(n.d + (nextRand() < 0.5 ? 24 : -26), 10, riverPath.length - 10);
      const rp = riverPath.offset(rockD, rockSide);
      const rad = 6.5 + nextRand() * 3.5;
      if (Math.hypot(rp.x - gp.x, rp.y - gp.y) > gateW * 0.55 + rad) {
        const eddy = rad >= 7;
        const ep = riverPath.offset(clamp(rockD + rad + 10, 8, riverPath.length - 8), rockSide);
        boulders.push({ x: rp.x, y: rp.y, side: rockSide, r: rad, eddy, ex: ep.x, ey: ep.y, er: rad * 1.85 });
      }

      // Whirlpools upstream between gates
      if (gatesSpawned >= 1 && nextRand() < 0.85) {
        const wSide = slot === 0 ? (nextRand() < 0.5 ? -0.52 : 0.52) * halfW : (nextRand() < 0.55 ? 0 : -slot * 0.48) * halfW;
        const wD = clamp(n.d - 48 + nextRand() * 16, 12, riverPath.length - 12);
        const wp = riverPath.offset(wD, wSide);
        const wr = 17 + nextRand() * 5;
        if (Math.hypot(wp.x - gp.x, wp.y - gp.y) > gateW * 0.5 + 8) {
          const dir = nextRand() < 0.5 ? 1 : -1;
          whirls.push({
            x: wp.x, y: wp.y, r: wr, coreR: 5.5,
            spin: dir * (K.whirl + Math.min(18, gatesCleared * 0.9)),
            pull: K.whirl * 0.52,
            rimTime: 0, grazed: false, phase: nextRand() * 6.28,
          });
        }
      }

      // Decorative shoreline pines outside the banks
      for (let s = -1; s <= 1; s += 2) {
        if (nextRand() < 0.75) {
          const tp = riverPath.offset(n.d, s * (halfW + 10 + nextRand() * 14));
          if (tp.x > 4 && tp.x < W - 4) trees.push({ x: tp.x, y: tp.y, r: 4 + ((nextRand() * 3) | 0) });
        }
      }

      gatesSpawned++;
    }
  }

  function shiftRiverAhead() {
    // Recycle 3 behind points to the front
    for (let k = 0; k < 3; k++) {
      const reused = pts.shift();
      const prev = pts[pts.length - 1];
      reused.x = clamp(prev.x + (nextRand() * 2 - 1) * 32, 48, W - 48);
      reused.y = prev.y - STEP_Y;
      pts.push(reused);
    }
    const cullY = camY + H + 36;
    for (let i = boulders.length - 1; i >= 0; i--) if (boulders[i].y > cullY) boulders.splice(i, 1);
    for (let i = whirls.length - 1; i >= 0; i--) if (whirls[i].y > cullY) whirls.splice(i, 1);
    for (let i = gates.length - 1; i >= 0; i--) if (gates[i].y > cullY) gates.splice(i, 1);
    for (let i = trees.length - 1; i >= 0; i--) if (trees[i].y > cullY) trees.splice(i, 1);

    riverPath = new Path(pts, { detail: 10 });
    populateSegment(pts[pts.length - 1].y);
    rebuildStreams();
  }

  function damageHull(hx, hy, label) {
    if (kayak.invuln > 0) return;
    hull--;
    kayak.invuln = 0.55;
    const sx = clamp(Math.round(hx), 16, W - 16);
    const sy = clamp(Math.round(hy - camY), 24, H - 16);
    feel.hurt(sx, sy);
    feel.juice.pop(sx, sy - 8, label, { color: C16[2] });
    if (hull <= 0) {
      feel.lose();
      api.over();
    }
  }

  function addPoints(ptsVal, wx, wy, label, col) {
    score += ptsVal;
    api.score(score);
    const sx = clamp(Math.round(wx), 18, W - 18);
    const sy = clamp(Math.round(wy - camY), 24, H - 18);
    if (ptsVal >= 5) feel.powerup(sx, sy, { color: col, text: label });
    else if (ptsVal === 2) { feel.score(sx, sy, 2, { color: col }); feel.juice.pop(sx, sy - 9, label, { color: col }); }
    else { feel.coin(sx, sy, { color: col, text: label }); }
  }

  function paddleStroke() {
    if (kayak.strokeCd > 0) {
      // Mashing strokes too fast catches a choppy wake and twists the bow
      kayak.boost = 0;
      kayak.steer = clamp(kayak.steer + kayak.paddleDir * 0.24, -1.15, 1.15);
      return;
    }
    kayak.boost = K.stroke;
    kayak.strokeCd = 0.5;
    kayak.paddleDir *= -1;
    kayak.paddleAnim = 0.3;
    const sx = Math.round(kayak.x), sy = Math.round(kayak.y - camY);
    sounds.jump?.(1.3);
    haptic('tick');
    const bx = kayak.x - Math.cos(kayak.angle) * 8;
    const by = kayak.y - Math.sin(kayak.angle) * 8;
    for (let i = 0; i < 4; i++) {
      spawnFoam(bx + rnd(-3, 3), by + rnd(-3, 3), rnd(-18, 18), rnd(10, 32), 0.35, C16[1], 2);
    }
    feel.juice.burst(sx, sy + 6, { n: 4, speed: 45, life: 0.2, size: 2, color: C16[1], angle: Math.PI / 2, arc: 1.0 });
  }

  function reset() {
    genSeed = 20261116;
    score = 0;
    hull = K.hull;
    misses = 0;
    gatesSpawned = 0;
    gatesCleared = 0;
    lastSlot = 0;
    nextGateY = -74;
    t = 0;
    eddyGlow = 0;
    holding = false; dragMoved = false; swipedUp = false;
    keys.left = false; keys.right = false;

    for (let i = 0; i < FOAM_MAX; i++) foam[i].life = 0;
    boulders = []; whirls = []; gates = []; trees = [];

    // Start 3 points behind y=0 and 10 points ahead
    let cx = W / 2;
    for (let i = 0; i < NUM_PTS; i++) {
      pts[i].x = cx;
      pts[i].y = (3 - i) * STEP_Y;
      if (i >= 4) cx = clamp(cx + (nextRand() * 2 - 1) * 30, 50, W - 50);
    }

    kayak = {
      x: W / 2, y: 0, px: W / 2, py: 0,
      steer: 0, angle: -Math.PI / 2, pAngle: -Math.PI / 2,
      boost: 0, strokeCd: 0, invuln: 0,
      paddlePhase: 0, paddleDir: 1, paddleAnim: 0,
    };
    camY = kayak.y - 122;

    riverPath = new Path(pts, { detail: 10 });
    populateSegment(pts[NUM_PTS - 1].y);
    rebuildStreams();

    api.score(0);
    feel.clear();
    ready.reset();
  }

  function update(dt) {
    feel.update(dt);
    if (feel.frozen) return;
    if (!ready.update(dt)) return;
    t += dt;

    kayak.px = kayak.x; kayak.py = kayak.y; kayak.pAngle = kayak.angle;
    kayak.invuln = Math.max(0, kayak.invuln - dt);
    kayak.strokeCd = Math.max(0, kayak.strokeCd - dt);
    kayak.boost = Math.max(0, kayak.boost - K.stroke * 2.4 * dt);
    kayak.paddleAnim = Math.max(0, kayak.paddleAnim - dt);

    // Steering input: keyboard or one-handed touch drag/hold
    const kb = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let touchSteer = 0;
    if (holding) {
      if (dragMoved) {
        touchSteer = clamp((dragX - dragStartX) / 22, -1, 1);
      } else {
        const dx = dragX - kayak.x;
        if (Math.abs(dx) > 6) touchSteer = clamp(dx / 22, -1, 1);
      }
    }
    const steerIn = kb !== 0 ? kb : touchSteer;

    if (steerIn !== 0) {
      kayak.steer = clamp(kayak.steer + (steerIn * 1.15 - kayak.steer) * Math.min(1, K.steer * 3.4 * dt), -1.15, 1.15);
    } else {
      kayak.steer *= Math.max(0, 1 - 2.2 * dt);
    }

    // Water current & whirlpools via gs.flow.Streams
    const here = streams.carry(kayak, dt, { drag: K.drag });
    if (here.in && here.stream && here.stream.kindOf === 'whirl') {
      kayak.steer = clamp(kayak.steer + Math.sign(here.stream.spin) * 1.15 * dt, -1.2, 1.2);
    }
    const inEddy = here.in && here.stream && here.stream.kindOf === 'pool';
    eddyGlow = inEddy ? Math.min(1, eddyGlow + dt * 6) : Math.max(0, eddyGlow - dt * 4);

    kayak.angle = -Math.PI / 2 + kayak.steer;
    kayak.paddlePhase += dt * (kayak.paddleAnim > 0 ? 16 : 4.5);

    // Keel carving + forward paddle cruise & stroke burst
    const carvePenalty = 1 - Math.abs(kayak.steer) * 0.34;
    const fwdSpeed = (14 + kayak.boost) * carvePenalty;
    const carveSide = Math.sin(kayak.steer) * (here.speed * 0.42 + fwdSpeed * 0.58);
    kayak.x += carveSide * dt;
    kayak.y += Math.sin(kayak.angle) * fwdSpeed * dt;

    // Wake foam trail
    if ((t * 60 | 0) % 2 === 0) {
      const sternX = kayak.x - Math.cos(kayak.angle) * 7;
      const sternY = kayak.y - Math.sin(kayak.angle) * 7;
      spawnFoam(sternX + rnd(-2, 2), sternY, rnd(-8, 8), rnd(14, 28), 0.32, inEddy ? C16[7] : C16[1], 1);
    }

    // Update foam particles
    for (let i = 0; i < FOAM_MAX; i++) {
      const f = foam[i];
      if (f.life <= 0) continue;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.life -= dt;
    }

    // Riverbank collision check
    const halfW = riverWidthAt() * 0.5;
    const nr = riverPath.nearest(kayak.x, kayak.y);
    if (!here.in || nr.dist > halfW - 4) {
      const dx = kayak.x - nr.x;
      const dy = kayak.y - nr.y;
      const d = Math.hypot(dx, dy) || 1;
      kayak.x = nr.x + (dx / d) * (halfW - 5);
      kayak.y = nr.y + (dy / d) * (halfW - 5);
      kayak.steer *= 0.3;
      damageHull(kayak.x, kayak.y, 'BANK!');
      if (hull <= 0) return;
    }

    // Boulder collision check
    for (let i = 0; i < boulders.length; i++) {
      const b = boulders[i];
      const dx = kayak.x - b.x, dy = kayak.y - b.y;
      const d = Math.hypot(dx, dy);
      const minD = b.r + 4.5;
      if (d < minD) {
        const inv = 1 / (d || 1);
        kayak.x = b.x + dx * inv * (minD + 1);
        kayak.y = b.y + dy * inv * (minD + 1);
        damageHull(b.x, b.y, 'ROCK!');
        if (hull <= 0) return;
      }
    }

    // Whirlpool core & rim graze check
    for (let i = 0; i < whirls.length; i++) {
      const w = whirls[i];
      w.phase += dt * (w.spin > 0 ? 5 : -5);
      const dx = kayak.x - w.x, dy = kayak.y - w.y;
      const d = Math.hypot(dx, dy);
      if (d < w.coreR + 3.4) {
        const inv = 1 / (d || 1);
        kayak.x = w.x + dx * inv * (w.coreR + 6);
        kayak.y = w.y + dy * inv * (w.coreR + 6);
        damageHull(w.x, w.y, 'VORTEX!');
        if (hull <= 0) return;
      } else if (d < w.r - 1 && !w.grazed && Math.abs(kayak.steer) > 0.24) {
        w.rimTime += dt;
        if (w.rimTime >= 0.2) {
          w.grazed = true;
          addPoints(2, w.x, w.y - 8, 'WHIRL +2', C16[7]);
        }
      }
    }

    // Slalom buoy gate check
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      if (g.state !== 0) continue;

      const dL = Math.hypot(kayak.x - g.leftX, kayak.y - g.leftY);
      const dR = Math.hypot(kayak.x - g.rightX, kayak.y - g.rightY);
      if (dL < 3.5 || dR < 3.5) {
        // Soft buoy bump
        const bx = dL < dR ? g.leftX : g.rightX;
        const by = dL < dR ? g.leftY : g.rightY;
        const dx = kayak.x - bx, dy = kayak.y - by, dd = Math.hypot(dx, dy) || 1;
        kayak.x = bx + (dx / dd) * 4;
        kayak.y = by + (dy / dd) * 4;
      }

      const vx = kayak.x - g.x, vy = kayak.y - g.y;
      const along = vx * g.dx + vy * g.dy;
      const across = vx * -g.dy + vy * g.dx;
      const pvx = kayak.px - g.x, pvy = kayak.py - g.y;
      const pAlong = pvx * g.dx + pvy * g.dy;

      if (pAlong <= 0 && along > 0 && Math.abs(across) <= g.width * 0.5) {
        g.state = 1;
        misses = 0;
        gatesCleared++;
        const graze = Math.min(dL, dR) < 8.5;
        addPoints(graze ? 5 : 3, g.x, g.y, graze ? 'GRAZE +5' : '+3', C16[4]);
      } else if (kayak.y < g.y - 16) {
        g.state = -1;
        misses++;
        const sx = clamp(Math.round(kayak.x), 24, W - 24);
        const sy = clamp(Math.round(kayak.y - camY), 28, H - 16);
        feel.juice.pop(sx, sy - 8, `MISS ${misses}/3`, { color: C16[2] });
        feel.click();
        if (misses >= 3) {
          feel.lose();
          api.over();
          return;
        }
      }
    }

    // Advance camera & endless river path
    camY = kayak.y - 122;
    if (kayak.y < pts[5].y) shiftRiverAhead();
  }

  function drawRiverRibbon(c, cam) {
    const s = riverPath.samples;
    const halfW = riverWidthAt() * 0.5;
    const minY = cam - 28, maxY = cam + H + 28;
    let count = 0;
    for (let i = 0; i < s.length && count < 178; i++) {
      const p = s[i];
      if (p.y < minY - 60 || p.y > maxY + 60) continue;
      riverPath.offset(p.d, -halfW, tmpA);
      riverPath.offset(p.d, halfW, tmpB);
      leftBankX[count] = Math.round(tmpA.x);
      leftBankY[count] = Math.round(tmpA.y - cam);
      rightBankX[count] = Math.round(tmpB.x);
      rightBankY[count] = Math.round(tmpB.y - cam);
      count++;
    }
    if (count < 2) return;

    // Sandy/muddy bank border
    c.beginPath();
    c.moveTo(leftBankX[0] - 4, leftBankY[0]);
    for (let i = 1; i < count; i++) c.lineTo(leftBankX[i] - 4, leftBankY[i]);
    for (let i = count - 1; i >= 0; i--) c.lineTo(rightBankX[i] + 4, rightBankY[i]);
    c.closePath();
    c.fillStyle = C16[11];
    c.fill();

    // Deep river water fill
    c.beginPath();
    c.moveTo(leftBankX[0], leftBankY[0]);
    for (let i = 1; i < count; i++) c.lineTo(leftBankX[i], leftBankY[i]);
    for (let i = count - 1; i >= 0; i--) c.lineTo(rightBankX[i], rightBankY[i]);
    c.closePath();
    c.fillStyle = C16[8];
    c.fill();

    // Fast center chute highlight band
    c.beginPath();
    for (let i = 0; i < count; i++) {
      const lx = Math.round(leftBankX[i] + (rightBankX[i] - leftBankX[i]) * 0.25);
      if (i === 0) c.moveTo(lx, leftBankY[i]);
      else c.lineTo(lx, leftBankY[i]);
    }
    for (let i = count - 1; i >= 0; i--) {
      const rx = Math.round(leftBankX[i] + (rightBankX[i] - leftBankX[i]) * 0.75);
      c.lineTo(rx, rightBankY[i]);
    }
    c.closePath();
    c.fillStyle = C16[7];
    c.fill();

    // Animated whitewater flow streaks along the river path
    const flowOff = (t * currentSpeedAt()) % 28;
    for (let d = riverPath.length - flowOff; d > 0; d -= 28) {
      riverPath.at(d, tmpN);
      const sy = Math.round(tmpN.y - cam);
      if (sy < -10 || sy > H + 10) continue;
      for (let lane = -1; lane <= 1; lane++) {
        const sx = Math.round(tmpN.x + lane * halfW * 0.42 + Math.sin(d * 0.08 + lane) * 4);
        c.fillStyle = lane === 0 ? C16[1] : C16[8];
        c.fillRect(sx, sy, 1, 5);
        if (lane !== 0) { c.fillStyle = C16[1]; c.fillRect(sx, sy + 7, 1, 3); }
      }
    }
  }

  function drawKayak(c, sx, sy, ang) {
    c.save();
    c.translate(sx, sy);
    c.rotate(ang + Math.PI / 2);

    // Invulnerability blink
    const flash = kayak.invuln > 0 && ((t * 22 | 0) % 2 === 1);

    // Paddle shaft & oscillating blades
    const swing = Math.sin(kayak.paddlePhase) * (kayak.paddleAnim > 0 ? 0.65 : 0.28);
    c.save();
    c.rotate(swing);
    c.fillStyle = C16[0];
    c.fillRect(-10, -1, 20, 2);
    c.fillStyle = C16[12];
    c.fillRect(-9, 0, 18, 1);
    // Blades
    c.fillStyle = flash ? C16[1] : C16[4];
    c.fillRect(-12, -2, 3, 4);
    c.fillRect(9, -2, 3, 4);
    c.restore();

    // Wooden/orange kayak hull (pointing up in local space)
    c.fillStyle = C16[0];
    c.fillRect(-3, -8, 6, 16);
    c.fillRect(-2, -10, 4, 20);
    c.fillRect(-1, -11, 2, 22);

    c.fillStyle = flash ? C16[1] : C16[3];
    c.fillRect(-2, -7, 4, 14);
    c.fillRect(-1, -9, 2, 18);

    // Bow gold stripe
    c.fillStyle = C16[4];
    c.fillRect(-1, -8, 2, 3);

    // Cockpit & paddler life vest + helmet
    c.fillStyle = C16[12];
    c.fillRect(-2, -2, 4, 5);
    c.fillStyle = C16[2];
    c.fillRect(-2, -1, 4, 3);
    c.fillStyle = C16[1];
    c.fillRect(-1, -2, 2, 2);

    c.restore();
  }

  function draw(c) {
    const cam = kayak ? mix(kayak.py, kayak.y) - 122 : camY;

    // Lush riverside terrain
    c.fillStyle = C16[15];
    c.fillRect(0, 0, W, H);
    // Dithered grass strips
    c.fillStyle = C16[6];
    const scrollTick = (Math.floor(cam / 12) * 12);
    for (let gy = scrollTick - 12; gy < cam + H + 12; gy += 12) {
      const sy = Math.round(gy - cam);
      const gx = ((Math.abs(gy) * 19) % (W - 16)) + 4;
      c.fillRect(gx, sy, 4, 2);
      c.fillRect((gx + 67) % (W - 10), sy + 5, 3, 2);
    }

    feel.begin(c);

    drawRiverRibbon(c, cam);

    // Calm eddy pockets behind rocks
    for (let i = 0; i < boulders.length; i++) {
      const b = boulders[i];
      if (!b.eddy) continue;
      const ey = Math.round(b.ey - cam);
      if (ey < -24 || ey > H + 24) continue;
      const ex = Math.round(b.ex);
      const er = Math.round(b.er);
      c.fillStyle = C16[6];
      c.fillRect(ex - er + 2, ey - er + 2, er * 2 - 4, er * 2 - 4);
      c.fillStyle = C16[7];
      const dotAng = t * 2.5 + i;
      c.fillRect(Math.round(ex + Math.cos(dotAng) * (er * 0.45)), Math.round(ey + Math.sin(dotAng) * (er * 0.45)), 2, 2);
    }

    // Whirlpools
    for (let i = 0; i < whirls.length; i++) {
      const w = whirls[i];
      const wy = Math.round(w.y - cam);
      if (wy < -28 || wy > H + 28) continue;
      const wx = Math.round(w.x);
      const r = Math.round(w.r);
      // Swirling pixel arms
      for (let a = 0; a < 10; a++) {
        const ang = w.phase + a * 0.628;
        const rr = r * (0.35 + (a % 3) * 0.25);
        const px = Math.round(wx + Math.cos(ang) * rr);
        const py = Math.round(wy + Math.sin(ang) * rr);
        c.fillStyle = a % 2 === 0 ? C16[1] : C16[7];
        c.fillRect(px - 1, py - 1, 2, 2);
      }
      // Core vortex
      const cr = Math.round(w.coreR);
      c.fillStyle = C16[8];
      c.fillRect(wx - cr - 1, wy - cr - 1, cr * 2 + 2, cr * 2 + 2);
      c.fillStyle = C16[0];
      c.fillRect(wx - cr + 1, wy - cr + 1, cr * 2 - 2, cr * 2 - 2);
      if (w.grazed) {
        c.fillStyle = C16[4];
        c.fillRect(wx - 1, wy - 1, 2, 2);
      }
    }

    // River boulders
    for (let i = 0; i < boulders.length; i++) {
      const b = boulders[i];
      const by = Math.round(b.y - cam);
      if (by < -16 || by > H + 16) continue;
      const bx = Math.round(b.x);
      const r = Math.round(b.r);
      // Upstream whitewater foam collar
      c.fillStyle = C16[1];
      c.fillRect(bx - r - 1, by - r - 2, r * 2 + 2, 3);
      // Stepped pixel boulder
      c.fillStyle = C16[0];
      c.fillRect(bx - r, by - r + 1, r * 2, r * 2 - 2);
      c.fillRect(bx - r + 1, by - r, r * 2 - 2, r * 2);
      c.fillStyle = C16[13];
      c.fillRect(bx - r + 1, by - r + 1, r * 2 - 2, r * 2 - 2);
      c.fillStyle = C16[14];
      c.fillRect(bx - r + 2, by - r + 1, Math.max(2, r - 1), Math.max(2, r - 2));
    }

    // Slalom buoy gates
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      const gy = Math.round(g.y - cam);
      if (gy < -16 || gy > H + 16) continue;
      const lx = Math.round(g.leftX), ly = Math.round(g.leftY - cam);
      const rx = Math.round(g.rightX), ry = Math.round(g.rightY - cam);

      // Dashed gate wire
      const wireCol = g.state > 0 ? C16[5] : g.state < 0 ? C16[2] : C16[1];
      c.fillStyle = wireCol;
      const steps = 6;
      for (let s = 1; s < steps; s++) {
        const fx = Math.round(lx + (rx - lx) * (s / steps));
        const fy = Math.round(ly + (ry - ly) * (s / steps));
        c.fillRect(fx - 1, fy, 2, 1);
      }

      // Left Red Buoy
      c.fillStyle = C16[0]; c.fillRect(lx - 3, ly - 3, 6, 6);
      c.fillStyle = C16[2]; c.fillRect(lx - 2, ly - 2, 4, 4);
      c.fillStyle = C16[1]; c.fillRect(lx - 1, ly - 2, 2, 1);

      // Right Gold Buoy
      c.fillStyle = C16[0]; c.fillRect(rx - 3, ry - 3, 6, 6);
      c.fillStyle = C16[4]; c.fillRect(rx - 2, ry - 2, 4, 4);
      c.fillStyle = C16[1]; c.fillRect(rx - 1, ry - 2, 2, 1);
    }

    // Foam & wake droplets
    for (let i = 0; i < FOAM_MAX; i++) {
      const f = foam[i];
      if (f.life <= 0) continue;
      const fy = Math.round(f.y - cam);
      if (fy < -4 || fy > H + 4) continue;
      c.fillStyle = f.col;
      c.fillRect(Math.round(f.x), fy, f.s, f.s);
    }

    // Kayak
    if (kayak) {
      const kx = Math.round(mix(kayak.px, kayak.x));
      const ky = Math.round(mix(kayak.py, kayak.y) - cam);
      drawKayak(c, kx, ky, mix(kayak.pAngle, kayak.angle));
    }

    // Riverside pine trees
    for (let i = 0; i < trees.length; i++) {
      const tr = trees[i];
      const ty = Math.round(tr.y - cam);
      if (ty < -12 || ty > H + 12) continue;
      const tx = Math.round(tr.x), r = tr.r;
      c.fillStyle = C16[0]; c.fillRect(tx - r, ty - r, r * 2, r * 2);
      c.fillStyle = C16[6]; c.fillRect(tx - r + 1, ty - r + 1, r * 2 - 2, r * 2 - 2);
      c.fillStyle = C16[5]; c.fillRect(tx - r + 1, ty - r + 1, r, r);
    }

    feel.end(c, W, H);

    // HUD: stays strictly in top-left and top-right corners, clear of center scoreArea()
    // Top-left: Hull pips
    c.fillStyle = C16[0];
    c.fillRect(2, 2, K.hull * 9 + 4, 9);
    for (let i = 0; i < K.hull; i++) {
      c.fillStyle = i < hull ? C16[2] : C16[13];
      c.fillRect(5 + i * 9, 4, 6, 5);
      if (i < hull) {
        c.fillStyle = C16[1];
        c.fillRect(6 + i * 9, 5, 2, 1);
      }
    }

    // Top-right: Gate miss warning pips (3 misses in a row ends run)
    c.fillStyle = C16[0];
    c.fillRect(W - 35, 2, 33, 9);
    text(c, 'MISS', W - 21, 4, { color: C16[14], align: 'right' });
    for (let i = 0; i < 3; i++) {
      c.fillStyle = i < misses ? C16[2] : C16[5];
      c.fillRect(W - 19 + i * 5, 4, 4, 5);
    }

    if (eddyGlow > 0.25 && ready.playing) {
      text(c, 'EDDY', 4, H - 10, { color: C16[7], shadow: C16[0] });
    }

    if (ready.waiting) {
      ready.draw(c, W, H, { pixel: true, text: 'DRAG TO CARVE', color: C16[1], y: 74, shadow: C16[0] });
      if (ready.t % 1 <= 0.7) {
        text(c, 'RELEASE TO STROKE', W / 2, 86, { color: C16[4], align: 'center', shadow: C16[0] });
      }
    }
  }

  return {
    reset,
    update,
    draw,
    down(x, y) {
      if (ready.go()) return;
      holding = true;
      dragStartX = x;
      dragStartY = y;
      dragX = x;
      dragMoved = false;
      swipedUp = false;
    },
    move(x, y, pressed) {
      if (!pressed || !holding) return;
      dragX = x;
      if (Math.abs(x - dragStartX) > 4) dragMoved = true;
      if (!swipedUp && dragStartY - y > 14) {
        swipedUp = true;
        paddleStroke();
      }
    },
    up() {
      if (!holding) return;
      holding = false;
      if (!swipedUp) paddleStroke();
    },
    key(k, isDown) {
      if (isDown && ready.go()) return;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = isDown;
      if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = isDown;
      if (isDown && (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ')) paddleStroke();
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'eddy-runner',
  title: 'Eddy Runner',
  tag: 'Advance · Action',
  retro: true,
  era: 'advance',
  pal: 'grape',
  w: W,
  h: H,
  tick: 60,
  music: 'chase',
  goal: 40,
  hint: 'Drag to carve through buoy gates and release to paddle forward. Avoid rocks, banks, and whirlpool cores!',
  creator: 'Antigravity',
  make,
};
