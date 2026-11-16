import gs from '../gamescroll.js';
const { Physics } = gs.physics;
const { Soft } = gs.soft;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { icon } = gs.icons;
const { sounds } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;

let W = 360, H = 640;

const FRUIT_KINDS = ['cherry', 'lemon', 'gem'];
const FRUIT_COLS = ['#ff4d6d', '#ffe047', '#4fe3ff'];
const FRUIT_FILLS = ['#ff4d6d26', '#ffe04726', '#4fe3ff26'];
const FRUIT_STROKES = ['#ff4d6d88', '#ffe04788', '#4fe3ff88'];
const FRUIT_ICON_OPTS = FRUIT_COLS.map(color => ({ color, outline: '#111a26', width: 2 }));
const HEART_OPT_ON = { color: '#ff4d6d', outline: '#09111b', width: 2 };
const HEART_OPT_OFF = { color: '#ffffff26', outline: '#09111b', width: 2 };
const FRUIT_NAMES = ['+5', '+5', '+5'];
const KEYS_DOWN = new Set();
const METER_LABELS = Array.from({ length: 200 }, (_, i) => `${i}m`);

function make(api) {
  const feel = new Feel();
  const ready = new Ready({ text: 'TAP TO CLIMB' });
  const K = gs.tweak('Feel', {
    gravity: [220, 100, 450, 'jelly downward pull'],
    sludgeSpeed: [20, 10, 55, 'rising sludge speed'],
    sludgeRamp: [2.2, 0, 6, 'extra sludge speed per 1000px'],
    grabReach: [55, 30, 85, 'finger grab reach around jelly'],
    maxStretch: [125, 70, 195, 'max stretch tether length'],
    slingBoost: [1.25, 0.4, 2.5, 'release flick boost'],
    lives: [3, 1, 5, 1, 'jelly integrity hearts'],
    pressure: [1.05, 0.6, 1.5, 'jelly bounce-back pressure'],
  });

  let phys, soft, jelly;
  let score, bestAltPts, startY, camY, sludgeY, genTopY, chunkIndex;
  let lives, invuln, hitCooldown, t, goalShown, dead;
  let activeGrab, pointerId, grabWX, grabWY, clampedGrabX, clampedGrabY, dragVX, dragVY, lastPtrX, lastPtrY;
  let shelves, flaps, pistons, saws, fruits;
  let missRings, bubbles, eyeLookX, eyeLookY, blinkT;
  let gradCtx = null, bgGrad = null, bgGradH = 0, jellyGrad = null, hurtGrad = null;
  let lastClimbedM = -1, climbedText = '0m CLIMBED';

  // Reusable zero-alloc pools
  function initPools() {
    missRings = [];
    for (let i = 0; i < 4; i++) missRings.push({ x: 0, y: 0, r: 0, life: 0 });
    bubbles = [];
    for (let i = 0; i < 18; i++) {
      bubbles.push({
        x: rnd(20, W - 20),
        y: rnd(0, 60),
        r: rnd(3, 9),
        spd: rnd(18, 44),
        ph: rnd(0, 6.28),
      });
    }
  }

  function spawnMissRing(wx, wy) {
    for (let i = 0; i < missRings.length; i++) {
      const m = missRings[i];
      if (m.life <= 0) { m.x = wx; m.y = wy; m.r = 6; m.life = 0.35; return; }
    }
    missRings[0].x = wx; missRings[0].y = wy; missRings[0].r = 6; missRings[0].life = 0.35;
  }

  function addShelf(x, y, w, h, kind = 'stone') {
    const body = phys.box(x, y, w, h, { fixed: true, friction: 0.35, bounce: 0.2, tag: 'shelf' });
    const s = { body, x, y, w, h, kind };
    shelves.push(s);
    return s;
  }

  function addFlap(px, py, len, dir) {
    const cx = px + dir * (len * 0.5);
    const body = phys.box(cx, py, len, 12, { density: 0.32, friction: 0.12, bounce: 0.15, spinDrag: 2.2, tag: 'flap' });
    const joint = phys.hinge(null, body, px, py, { min: -1.45, max: 1.45 });
    flaps.push({ body, joint, px, py, len, dir });
  }

  function addPiston(cy, h, minGap, maxGap, speed, offset) {
    const span = (W - 28) * 0.5;
    const left = phys.box(14 - span * 0.5, cy, span, h, { moving: true, friction: 0.4, tag: 'piston' });
    const right = phys.box(W - 14 + span * 0.5, cy, span, h, { moving: true, friction: 0.4, tag: 'piston' });
    pistons.push({ left, right, cy, h, span, minGap, maxGap, speed, offset, gap: maxGap });
  }

  function addSaw(cx, cy, r, patrolAmp = 0, speed = 1.6, phase = 0) {
    const body = phys.circle(cx, cy, r * 0.72, { moving: true, friction: 0.2, bounce: 0.5, tag: 'saw' });
    saws.push({ body, baseX: cx, x: cx, y: cy, r, patrolAmp, speed, phase, ang: 0 });
  }

  function addFruit(x, y, idx) {
    const kindIdx = idx % FRUIT_KINDS.length;
    fruits.push({ x, y, r: 15, kindIdx, got: false, bob: rnd(0, 6.28) });
  }

  function buildChunk(topY, idx) {
    const difficulty = clamp(idx / 16, 0, 1);
    const gapW = Math.round(66 - difficulty * 18); // 66 -> 48px
    const side = idx % 2 === 0 ? -1 : 1;
    const typeRoll = idx === 0 ? 0 : (idx === 1 ? 1 : (idx * 7 + (Math.random() * 3 | 0)) % 5);

    if (typeRoll === 0) {
      // Staggered baffle shelves with optional spring flap-gate
      const y1 = topY + 130;
      const y2 = topY + 42;
      const gapX1 = side < 0 ? rnd(78, 128) : rnd(W - 128, W - 78);
      const gapX2 = side < 0 ? rnd(W - 135, W - 78) : rnd(78, 135);

      const l1 = gapX1 - gapW * 0.5 - 14;
      const r1 = (W - 14) - (gapX1 + gapW * 0.5);
      if (l1 > 16) addShelf(14 + l1 * 0.5, y1, l1, 18);
      if (r1 > 16) addShelf(W - 14 - r1 * 0.5, y1, r1, 18);
      if (idx >= 1) addFlap(gapX1 - gapW * 0.5, y1, gapW - 6, 1);

      const l2 = gapX2 - gapW * 0.5 - 14;
      const r2 = (W - 14) - (gapX2 + gapW * 0.5);
      if (l2 > 16) addShelf(14 + l2 * 0.5, y2, l2, 18);
      if (r2 > 16) addShelf(W - 14 - r2 * 0.5, y2, r2, 18);

      // Off-center pocket fruit
      const fx = gapX1 < W * 0.5 ? W - 48 : 48;
      addFruit(fx, y1 - 34, idx);
      return 185;
    }

    if (typeRoll === 1) {
      // Timed hydraulic piston pinch + side guide shelves
      const py = topY + 86;
      addShelf(42, py + 58, 56, 16);
      addShelf(W - 42, py + 58, 56, 16);
      addPiston(py, 28, 14, 88 - difficulty * 14, 2.0 + difficulty * 1.1, idx * 1.4);
      addFruit(W * 0.5 + side * 64, py - 42, idx);
      return 175;
    }

    if (typeRoll === 2) {
      // Saw-gear gauntlet: central saw with flanking squeeze chutes
      const sy = topY + 92;
      const sawR = 19 + difficulty * 3;
      addSaw(W * 0.5, sy, sawR, 38 + difficulty * 28, 1.5 + difficulty * 0.8, idx);
      addShelf(W * 0.5 - 92, sy + 28, 76, 16);
      addShelf(W * 0.5 + 92, sy + 28, 76, 16);
      addFruit(W * 0.5 - side * 118, sy - 16, idx);
      return 170;
    }

    if (typeRoll === 3) {
      // Twin-route airlock with central island, flap-gate, and guarded fruit
      const ay = topY + 95;
      addShelf(W * 0.5, ay, 84, 24);
      addFlap(14, ay, 82, 1);
      addFlap(W - 14, ay, 82, -1);
      addSaw(W * 0.5, ay - 56, 16, 0, 0, 0);
      addFruit(side < 0 ? 54 : W - 54, ay - 36, idx);
      return 190;
    }

    // typeRoll === 4: Rotating spinner chamber + corner ledges
    const cy = topY + 96;
    const barW = 128 + difficulty * 22;
    const spinner = phys.box(W * 0.5, cy, barW, 14, { moving: true, friction: 0.25, tag: 'spinner' });
    pistons.push({ spinner: true, body: spinner, cx: W * 0.5, cy, speed: (1.5 + difficulty * 0.9) * side, ang: idx });
    addShelf(50, cy + 62, 72, 16);
    addShelf(W - 50, cy - 58, 72, 16);
    addFruit(W * 0.5 - side * 124, cy, idx);
    return 195;
  }

  function ensureCourseAhead() {
    const neededTop = camY - H * 1.25;
    while (genTopY > neededTop) {
      const h = buildChunk(genTopY - 190, chunkIndex);
      genTopY -= h;
      chunkIndex++;
    }
  }

  function cullBehind() {
    const cutY = sludgeY + 260;
    for (let i = shelves.length - 1; i >= 0; i--) {
      if (shelves[i].y > cutY) { phys.remove(shelves[i].body); shelves.splice(i, 1); }
    }
    for (let i = flaps.length - 1; i >= 0; i--) {
      if (flaps[i].py > cutY) {
        flaps[i].joint.remove();
        phys.remove(flaps[i].body);
        flaps.splice(i, 1);
      }
    }
    for (let i = pistons.length - 1; i >= 0; i--) {
      const p = pistons[i];
      if (p.cy > cutY) {
        if (p.spinner) phys.remove(p.body);
        else { phys.remove(p.left); phys.remove(p.right); }
        pistons.splice(i, 1);
      }
    }
    for (let i = saws.length - 1; i >= 0; i--) {
      if (saws[i].y > cutY) { phys.remove(saws[i].body); saws.splice(i, 1); }
    }
    for (let i = fruits.length - 1; i >= 0; i--) {
      if (fruits[i].got || fruits[i].y > cutY) fruits.splice(i, 1);
    }
  }

  function jellyCenter(out) {
    const pts = jelly.points;
    let sx = 0, sy = 0;
    for (let i = 0; i < pts.length; i++) { sx += pts[i].x; sy += pts[i].y; }
    const n = pts.length || 1;
    out.x = sx / n;
    out.y = sy / n;
  }

  const centerBuf = { x: 0, y: 0 };
  const pushBuf = { x: 0, y: 0, z: 0 };
  const grabClampBuf = { x: 0, y: 0 };

  function damageJelly(hx, hy, pushForce = 680) {
    if (invuln > 0 || dead) return;
    lives--;
    invuln = 1.15;
    hitCooldown = 0.25;
    if (activeGrab) { activeGrab.drop(); activeGrab = null; pointerId = null; }
    pushBuf.x = hx; pushBuf.y = hy; pushBuf.z = 0;
    soft.push(pushBuf, 110, pushForce);
    jellyCenter(centerBuf);
    feel.hurt(centerBuf.x, centerBuf.y - camY);
    sounds.clang(0.75);
    if (lives <= 0) {
      dead = true;
      feel.boom(centerBuf.x, centerBuf.y - camY, { size: 0.9, color: ['#88ff5e', '#ff4d6d', '#ffffff'] });
      feel.lose();
      api.over();
    }
  }

  function setGrabTarget(wx, wy) {
    jellyCenter(centerBuf);
    let tx = clamp(wx, 18, W - 18);
    let ty = Math.min(wy, sludgeY - 12);
    const dx = tx - centerBuf.x, dy = ty - centerBuf.y;
    const dist = Math.hypot(dx, dy);
    if (dist > K.maxStretch) {
      const s = K.maxStretch / dist;
      tx = centerBuf.x + dx * s;
      ty = centerBuf.y + dy * s;
    }
    const near = phys.near(tx - 16, ty - 16, tx + 16, ty + 16, 4);
    const out = phys.outOf(tx, ty, 6, near);
    if (out) { tx = clamp(out.x, 18, W - 18); ty = out.y; }
    grabClampBuf.x = tx;
    grabClampBuf.y = ty;
    return grabClampBuf;
  }

  function applyScore(pts, wx, wy, col, label) {
    score += pts;
    api.score(score);
    if (label) {
      feel.coin(wx, wy - camY, { color: col, text: label, pitch: 1 + Math.min(score, 40) * 0.01 });
      sounds.gem(1.15);
    }
    if (!goalShown && score >= 45) {
      goalShown = true;
      feel.win(W * 0.5, H * 0.35);
    }
  }

  return {
    reset() {
      phys?.free?.();
      phys = new Physics({ gravity: 450 });
      soft = new Soft({
        gravity: { x: 0, y: K.gravity },
        world: phys,
        bounds: [12, -1e6, W - 12, H + 500],
        damping: 0.96,
        iterations: 6,
        weight: 0.65,
        bounce: 0.32,
        friction: 0.85,
      });

      shelves = []; flaps = []; pistons = []; saws = []; fruits = [];
      initPools();

      // Solid starting launch pad
      addShelf(W * 0.5, H - 72, W - 28, 22, 'base');

      jelly = soft.jelly(W * 0.5, H - 120, 28, 12, { pressure: K.pressure, stiff: 0.88, mass: 1 });
      soft.iterations = 3;
      soft.step = 1 / 90;
      startY = H - 120;
      camY = 0;
      sludgeY = H + 20;
      genTopY = H - 110;
      chunkIndex = 0;

      score = 0;
      bestAltPts = 0;
      lives = K.lives;
      invuln = 0;
      hitCooldown = 0;
      t = 0;
      goalShown = false;
      dead = false;
      activeGrab = null;
      pointerId = null;
      clampedGrabX = 0; clampedGrabY = 0;
      dragVX = 0; dragVY = 0;
      eyeLookX = 0; eyeLookY = 0; blinkT = 2.4;
      lastClimbedM = -1;
      climbedText = '0m CLIMBED';
      KEYS_DOWN.clear();

      // Build initial visible climbing course
      ensureCourseAhead();

      feel.clear();
      ready.reset();
      api.score(0);
    },

    resize(w, h) {
      W = w; H = h;
      bgGrad = null;
      if (soft) soft.bounds = [12, -1e6, W - 12, H + 500];
    },

    update(dt) {
      feel.update(dt);
      if (feel.frozen) return;

      // Animate sludge bubbles even on Ready screen
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        b.y -= b.spd * dt;
        if (b.y < -8) { b.y = rnd(40, 90); b.x = rnd(20, W - 20); }
      }
      for (let i = 0; i < missRings.length; i++) {
        const m = missRings[i];
        if (m.life > 0) { m.life -= dt; m.r += 52 * dt; }
      }

      if (!ready.update(dt)) return;
      if (dead) return;

      t += dt;
      if (invuln > 0) invuln = Math.max(0, invuln - dt);
      if (hitCooldown > 0) hitCooldown = Math.max(0, hitCooldown - dt);

      blinkT -= dt;
      if (blinkT < -0.12) blinkT = rnd(2.2, 4.5);

      // Update dynamic knobs
      soft.gravity.y = K.gravity;
      jelly.pressure = K.pressure;

      // Keyboard fallback nudges
      let kx = 0, ky = 0;
      if (KEYS_DOWN.has('ArrowLeft') || KEYS_DOWN.has('a') || KEYS_DOWN.has('A')) kx -= 1;
      if (KEYS_DOWN.has('ArrowRight') || KEYS_DOWN.has('d') || KEYS_DOWN.has('D')) kx += 1;
      if (KEYS_DOWN.has('ArrowUp') || KEYS_DOWN.has('w') || KEYS_DOWN.has('W') || KEYS_DOWN.has(' ')) ky -= 1;
      if (KEYS_DOWN.has('ArrowDown') || KEYS_DOWN.has('s') || KEYS_DOWN.has('S')) ky += 1;
      if (kx !== 0 || ky !== 0) {
        const pts = jelly.points;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          if (p.pinned) continue;
          p.px -= kx * 380 * soft.step * dt;
          p.py -= ky * 540 * soft.step * dt;
        }
      }

      // Update kinematic pistons & spinners
      const activeTop = camY - H * 0.5, activeBot = sludgeY + 120;
      for (let i = 0; i < pistons.length; i++) {
        const p = pistons[i];
        if (p.cy < activeTop || p.cy > activeBot) continue;
        if (p.spinner) {
          p.ang += p.speed * dt;
          p.body.place(p.cx, p.cy, p.ang);
        } else {
          const wave = 0.5 + 0.5 * Math.sin(t * p.speed + p.offset);
          const gap = p.minGap + (p.maxGap - p.minGap) * wave;
          p.gap = gap;
          p.left.place(W * 0.5 - gap * 0.5 - p.span * 0.5, p.cy, 0);
          p.right.place(W * 0.5 + gap * 0.5 + p.span * 0.5, p.cy, 0);
        }
      }

      // Spring flap-gates gently back toward closed (angle 0)
      for (let i = 0; i < flaps.length; i++) {
        const f = flaps[i];
        if (f.py < activeTop || f.py > activeBot) continue;
        f.body.twist(-f.body.angle * 0.45);
      }

      // Move patrolling saw-gears
      for (let i = 0; i < saws.length; i++) {
        const s = saws[i];
        if (s.y < activeTop || s.y > activeBot) continue;
        s.ang += 5.2 * dt;
        if (s.patrolAmp > 0) s.x = s.baseX + Math.sin(t * s.speed + s.phase) * s.patrolAmp;
        s.body.place(s.x, s.y, s.ang);
      }

      // Re-clamp active grab against moving walls/pistons so grabbed point never clips through
      if (activeGrab) {
        const clamped = setGrabTarget(grabWX, grabWY);
        clampedGrabX = clamped.x;
        clampedGrabY = clamped.y;
        activeGrab.move(clampedGrabX, clampedGrabY);
      }

      // Step Rapier & Soft Verlet
      phys.step(dt);
      soft.update(dt);

      // Compute jelly center (zero alloc)
      jellyCenter(centerBuf);
      const jx = centerBuf.x, jy = centerBuf.y;

      // Update eye look vector
      if (activeGrab) {
        eyeLookX = clamp((grabWX - jx) * 0.08, -4, 4);
        eyeLookY = clamp((grabWY - jy) * 0.08, -4, 4);
      } else {
        const dangerClose = sludgeY - jy < 170;
        eyeLookX *= 0.9;
        eyeLookY = dangerClose ? 3 : eyeLookY * 0.9;
      }

      // Altitude scoring (+1 per 80px climbed)
      const climbed = Math.max(0, startY - jy);
      const altPts = Math.floor(climbed / 80);
      if (altPts > bestAltPts) {
        const diff = altPts - bestAltPts;
        bestAltPts = altPts;
        applyScore(diff, jx, jy, '#9eff6b', null);
      }

      // Collectible pickups
      const pts = jelly.points;
      for (let i = 0; i < fruits.length; i++) {
        const f = fruits[i];
        if (f.got) continue;
        f.bob += dt * 3.2;
        let hit = Math.hypot(jx - f.x, jy - f.y) < f.r + 22;
        if (!hit) {
          for (let k = 0; k < pts.length; k += 2) {
            if (Math.hypot(pts[k].x - f.x, pts[k].y - f.y) < f.r + 8) { hit = true; break; }
          }
        }
        if (hit) {
          f.got = true;
          applyScore(5, f.x, f.y, FRUIT_COLS[f.kindIdx], FRUIT_NAMES[f.kindIdx]);
        }
      }

      // Saw-gear hazard check
      if (invuln <= 0 && hitCooldown <= 0) {
        for (let i = 0; i < saws.length; i++) {
          const s = saws[i];
          if (Math.abs(s.y - jy) > s.r + 56) continue;
          let hit = false;
          for (let k = 0; k < pts.length; k++) {
            if (Math.hypot(pts[k].x - s.x, pts[k].y - s.y) < s.r + 4) { hit = true; break; }
          }
          if (hit) { damageJelly(s.x, s.y, 760); break; }
        }
      }

      // Piston crush check (anti-lazy-trick & timing hazard!)
      if (invuln <= 0 && hitCooldown <= 0 && !dead) {
        for (let i = 0; i < pistons.length; i++) {
          const p = pistons[i];
          if (p.spinner) continue;
          if (p.gap < 28 && Math.abs(jy - p.cy) < p.h * 0.6 + 14 && jelly.area < jelly.rest * 0.62) {
            damageJelly(jx, p.cy - 20, 620);
            break;
          }
        }
      }

      // Camera smooth follow
      const targetCam = Math.min(0, jy - H * 0.56);
      camY += (targetCam - camY) * Math.min(1, dt * 8.5);

      // Rising toxic sludge
      const ramp = Math.min(36, (climbed / 1000) * K.sludgeRamp * 10);
      sludgeY -= (K.sludgeSpeed + ramp) * dt;
      if (sludgeY - jy > 540) sludgeY = jy + 540; // Keep pressure nearby if player rockets ahead

      // Sludge dissolve -> game over
      if (jy + 14 >= sludgeY) {
        dead = true;
        if (activeGrab) { activeGrab.drop(); activeGrab = null; pointerId = null; }
        feel.boom(jx, jy - camY, { size: 1.1, color: ['#52ff46', '#b8ff57', '#1a8f28'] });
        sounds.splash(0.75);
        feel.lose();
        api.over();
        return;
      }

      ensureCourseAhead();
      cullBehind();
    },

    draw(c) {
      if (gradCtx !== c || !bgGrad || bgGradH !== H) {
        gradCtx = c;
        bgGradH = H;
        bgGrad = c.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, '#0f1826');
        bgGrad.addColorStop(1, '#192a3d');
        jellyGrad = c.createRadialGradient(-8, -10, 4, 0, 0, 42);
        jellyGrad.addColorStop(0, '#c8ff8c');
        jellyGrad.addColorStop(0.65, '#4ee86c');
        jellyGrad.addColorStop(1, '#19a853');
        hurtGrad = c.createRadialGradient(-8, -10, 4, 0, 0, 42);
        hurtGrad.addColorStop(0, '#ffd4e0');
        hurtGrad.addColorStop(1, '#ff4d79');
      }

      // Background shaft gradient
      c.fillStyle = bgGrad;
      c.fillRect(0, 0, W, H);

      // Subtle scrolling background pipes & grid
      const gridOff = ((-camY) % 80 + 80) % 80;
      c.strokeStyle = '#ffffff0a';
      c.lineWidth = 1;
      for (let y = gridOff - 80; y < H + 80; y += 80) {
        c.beginPath(); c.moveTo(14, y); c.lineTo(W - 14, y); c.stroke();
      }
      c.fillStyle = '#0d1520';
      c.fillRect(46, 0, 14, H);
      c.fillRect(W - 76, 0, 18, H);
      c.fillStyle = '#203248';
      c.fillRect(50, 0, 3, H);
      c.fillRect(W - 72, 0, 4, H);

      feel.begin(c);
      c.save();
      c.translate(0, -camY);

      // Depth markers along the walls
      const firstMark = Math.floor((camY - 40) / 160) * 160;
      c.fillStyle = '#6c85a644';
      c.font = '700 10px Rubik, sans-serif';
      c.textAlign = 'left';
      for (let wy = firstMark; wy < camY + H + 40; wy += 160) {
        const meters = Math.round((startY - wy) / 80);
        if (meters > 0 && meters < METER_LABELS.length) c.fillText(METER_LABELS[meters], 20, wy - 4);
      }

      // Draw masonry shelves
      for (let i = 0; i < shelves.length; i++) {
        const s = shelves[i];
        if (s.y < camY - 60 || s.y > camY + H + 60) continue;
        const x0 = s.x - s.w * 0.5, y0 = s.y - s.h * 0.5;
        c.fillStyle = s.kind === 'base' ? '#2c3d52' : '#354961';
        c.beginPath(); c.roundRect(x0, y0, s.w, s.h, 5); c.fill();
        c.fillStyle = '#536f8f';
        c.fillRect(x0 + 3, y0 + 2, Math.max(0, s.w - 6), 3);
        c.strokeStyle = '#1b2736';
        c.lineWidth = 2;
        c.stroke();
        // Corner rivets
        c.fillStyle = '#89a3c2';
        c.beginPath();
        c.arc(x0 + 7, s.y, 2, 0, 7);
        c.arc(x0 + s.w - 7, s.y, 2, 0, 7);
        c.fill();
      }

      // Draw hinged flap-gates
      for (let i = 0; i < flaps.length; i++) {
        const f = flaps[i];
        if (f.py < camY - 90 || f.py > camY + H + 90) continue;
        c.save();
        c.translate(f.body.sx, f.body.sy);
        c.rotate(f.body.sangle);
        c.fillStyle = '#f5a623';
        c.beginPath(); c.roundRect(-f.len * 0.5, -6, f.len, 12, 4); c.fill();
        c.strokeStyle = '#633c04';
        c.lineWidth = 2;
        c.stroke();
        c.restore();
        // Hinge pin
        c.fillStyle = '#ffd978';
        c.beginPath(); c.arc(f.px, f.py, 5, 0, 7); c.fill();
        c.strokeStyle = '#633c04'; c.lineWidth = 1.5; c.stroke();
      }

      // Draw hydraulic pistons & rotating spinners
      for (let i = 0; i < pistons.length; i++) {
        const p = pistons[i];
        if (p.cy < camY - 120 || p.cy > camY + H + 120) continue;
        if (p.spinner) {
          c.save();
          c.translate(p.body.sx, p.body.sy);
          c.rotate(p.body.sangle);
          c.fillStyle = '#5a7391';
          c.beginPath(); c.roundRect(-p.body.w * 0.5, -7, p.body.w, 14, 5); c.fill();
          c.strokeStyle = '#1e2c3d'; c.lineWidth = 2; c.stroke();
          c.fillStyle = '#ff9f43';
          c.beginPath(); c.arc(0, 0, 6, 0, 7); c.fill();
          c.restore();
        } else {
          const lx = p.left.sx, rx = p.right.sx;
          // Hydraulic shafts
          c.fillStyle = '#7389a3';
          c.fillRect(14, p.cy - 5, Math.max(0, lx + p.span * 0.5 - 14), 10);
          c.fillRect(rx - p.span * 0.5, p.cy - 5, Math.max(0, W - 14 - (rx - p.span * 0.5)), 10);

          const hot = p.gap < 34;
          const headCol = hot ? '#ff5c6c' : '#d64556';
          // Left piston head
          c.fillStyle = headCol;
          c.beginPath(); c.roundRect(lx - p.span * 0.5, p.cy - p.h * 0.5, p.span, p.h, 5); c.fill();
          c.strokeStyle = '#40111a'; c.lineWidth = 2; c.stroke();
          c.fillStyle = hot ? '#ffe066' : '#ff99a4';
          c.fillRect(lx + p.span * 0.5 - 7, p.cy - p.h * 0.35, 4, p.h * 0.7);
          // Right piston head
          c.fillStyle = headCol;
          c.beginPath(); c.roundRect(rx - p.span * 0.5, p.cy - p.h * 0.5, p.span, p.h, 5); c.fill();
          c.strokeStyle = '#40111a'; c.lineWidth = 2; c.stroke();
          c.fillStyle = hot ? '#ffe066' : '#ff99a4';
          c.fillRect(rx - p.span * 0.5 + 3, p.cy - p.h * 0.35, 4, p.h * 0.7);
        }
      }

      // Draw spinning saw-gears
      for (let i = 0; i < saws.length; i++) {
        const s = saws[i];
        if (s.y < camY - 80 || s.y > camY + H + 80) continue;
        if (s.patrolAmp > 0) {
          c.strokeStyle = '#ffffff1f';
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(s.baseX - s.patrolAmp, s.y);
          c.lineTo(s.baseX + s.patrolAmp, s.y);
          c.stroke();
        }
        c.save();
        c.translate(s.x, s.y);
        c.rotate(s.ang);
        const teeth = 10;
        c.fillStyle = '#ff3b5c';
        c.beginPath();
        for (let k = 0; k < teeth * 2; k++) {
          const a = (k / (teeth * 2)) * Math.PI * 2;
          const rad = k % 2 === 0 ? s.r + 3 : s.r * 0.72;
          if (k === 0) c.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
          else c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        c.closePath();
        c.fill();
        c.strokeStyle = '#5c0b1b';
        c.lineWidth = 2;
        c.stroke();
        c.fillStyle = '#2a3647';
        c.beginPath(); c.arc(0, 0, s.r * 0.42, 0, 7); c.fill();
        c.fillStyle = '#ff9eab';
        c.beginPath(); c.arc(0, 0, 3, 0, 7); c.fill();
        c.restore();
      }

      // Draw fruit / gem collectibles
      for (let i = 0; i < fruits.length; i++) {
        const f = fruits[i];
        if (f.got || f.y < camY - 60 || f.y > camY + H + 60) continue;
        const fy = f.y + Math.sin(f.bob) * 4;
        const col = FRUIT_COLS[f.kindIdx];
        c.fillStyle = FRUIT_FILLS[f.kindIdx];
        c.beginPath(); c.arc(f.x, fy, 17, 0, 7); c.fill();
        c.strokeStyle = FRUIT_STROKES[f.kindIdx];
        c.lineWidth = 1.5;
        c.stroke();
        icon(c, FRUIT_KINDS[f.kindIdx], f.x, fy, 20, FRUIT_ICON_OPTS[f.kindIdx]);
      }

      // Draw miss rings (reuse color string + globalAlpha)
      c.strokeStyle = '#b4e6ff';
      c.lineWidth = 2;
      for (let i = 0; i < missRings.length; i++) {
        const m = missRings[i];
        if (m.life <= 0) continue;
        c.globalAlpha = clamp(m.life * 1.4, 0, 1);
        c.beginPath(); c.arc(m.x, m.y, m.r, 0, 7); c.stroke();
      }
      c.globalAlpha = 1;

      // Draw elastic grab tether when pulling jelly
      if (activeGrab) {
        const p = activeGrab.point;
        c.strokeStyle = '#b9ff66aa';
        c.lineWidth = 4;
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(clampedGrabX, clampedGrabY); c.stroke();
        c.fillStyle = '#d4ff88cc';
        c.beginPath(); c.arc(clampedGrabX, clampedGrabY, 8, 0, 7); c.fill();
        c.strokeStyle = '#ffffff';
        c.lineWidth = 2;
        c.beginPath(); c.arc(clampedGrabX, clampedGrabY, 13, 0, 7); c.stroke();
      }

      // Draw soft-body jelly as smooth closed quadratic spline using cached local gradient
      const pts = jelly.points;
      const n = pts.length;
      if (n > 2 && !dead) {
        jellyCenter(centerBuf);
        const cx = centerBuf.x, cy = centerBuf.y;
        const hurtFlash = invuln > 0 && ((invuln * 14 | 0) % 2 === 1);

        c.save();
        c.translate(cx, cy);
        c.beginPath();
        const startX = (pts[n - 1].x + pts[0].x) * 0.5 - cx;
        const startY = (pts[n - 1].y + pts[0].y) * 0.5 - cy;
        c.moveTo(startX, startY);
        for (let i = 0; i < n; i++) {
          const cur = pts[i];
          const nxt = pts[(i + 1) % n];
          c.quadraticCurveTo(cur.x - cx, cur.y - cy, (cur.x + nxt.x) * 0.5 - cx, (cur.y + nxt.y) * 0.5 - cy);
        }
        c.closePath();

        c.fillStyle = hurtFlash ? hurtGrad : jellyGrad;
        c.fill();
        c.strokeStyle = hurtFlash ? '#ffffff' : '#dfffb8';
        c.lineWidth = 2.5;
        c.stroke();

        // Glossy top-left jelly highlight
        c.fillStyle = '#ffffff66';
        c.beginPath();
        c.ellipse(-9, -10, 7, 4, -0.5, 0, 7);
        c.fill();

        // Expressive wobbly eyes
        const eyeClosed = blinkT < 0;
        const exL = -7 + eyeLookX * 0.4, exR = 7 + eyeLookX * 0.4;
        const ey = -2 + eyeLookY * 0.4;
        if (eyeClosed) {
          c.strokeStyle = '#0d3b1e';
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(exL - 3, ey); c.lineTo(exL + 3, ey);
          c.moveTo(exR - 3, ey); c.lineTo(exR + 3, ey);
          c.stroke();
        } else {
          c.fillStyle = '#ffffff';
          c.beginPath(); c.arc(exL, ey, 4.5, 0, 7); c.arc(exR, ey, 4.5, 0, 7); c.fill();
          c.fillStyle = '#0d2917';
          c.beginPath();
          c.arc(exL + eyeLookX * 0.35, ey + eyeLookY * 0.35, 2.3, 0, 7);
          c.arc(exR + eyeLookX * 0.35, ey + eyeLookY * 0.35, 2.3, 0, 7);
          c.fill();
        }
        c.restore();
      }

      // Draw rising toxic sludge
      if (sludgeY < camY + H + 80) {
        c.fillStyle = '#22c938cc';
        c.beginPath();
        c.moveTo(0, camY + H + 120);
        c.lineTo(0, sludgeY);
        for (let x = 0; x <= W; x += 24) {
          const wy = sludgeY + Math.sin(x * 0.045 + t * 4.5) * 4 + Math.cos(x * 0.09 - t * 3.1) * 2;
          c.lineTo(x, wy);
        }
        c.lineTo(W, camY + H + 120);
        c.closePath();
        c.fill();

        // Glowing neon top crest
        c.strokeStyle = '#9dff57';
        c.lineWidth = 3;
        c.beginPath();
        for (let x = 0; x <= W; x += 24) {
          const wy = sludgeY + Math.sin(x * 0.045 + t * 4.5) * 4 + Math.cos(x * 0.09 - t * 3.1) * 2;
          if (x === 0) c.moveTo(x, wy);
          else c.lineTo(x, wy);
        }
        c.stroke();

        // Bubbling sludge blobs
        c.fillStyle = '#b4ff6b99';
        for (let i = 0; i < bubbles.length; i++) {
          const b = bubbles[i];
          const bx = b.x + Math.sin(t * 2 + b.ph) * 4;
          const by = sludgeY + b.y;
          if (by < camY + H + 20) {
            c.beginPath(); c.arc(bx, by, b.r, 0, 7); c.fill();
          }
        }
      }

      // Side brick shaft walls
      c.fillStyle = '#1b2838';
      c.fillRect(0, camY - 20, 14, H + 40);
      c.fillRect(W - 14, camY - 20, 14, H + 40);
      c.fillStyle = '#2d4159';
      c.fillRect(11, camY - 20, 3, H + 40);
      c.fillRect(W - 14, camY - 20, 3, H + 40);

      c.restore();
      feel.end(c, W, H);

      ready.draw(c, W, H, { y: H * 0.42, color: '#d8ff99' });

      // Bottom HUD bar (well outside api.scoreArea() at top)
      c.fillStyle = '#09111bcc';
      c.beginPath(); c.roundRect(14, H - 44, W - 28, 32, 12); c.fill();
      c.strokeStyle = '#334e6b';
      c.lineWidth = 1.5;
      c.stroke();

      for (let i = 0; i < K.lives; i++) {
        icon(c, 'heart', 34 + i * 24, H - 28, 17, i < lives ? HEART_OPT_ON : HEART_OPT_OFF);
      }

      if (bestAltPts !== lastClimbedM) {
        lastClimbedM = bestAltPts;
        climbedText = `${bestAltPts * 2}m CLIMBED`;
      }
      c.fillStyle = '#c8f7a6';
      c.font = '700 13px Rubik, sans-serif';
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      c.fillText(climbedText, W - 26, H - 28);
    },

    down(x, y, id) {
      if (ready.go()) return;
      if (dead || activeGrab) return;
      const wx = x, wy = y + camY;
      const g = soft.grab(wx, wy, K.grabReach);
      if (!g) {
        spawnMissRing(wx, wy);
        return;
      }
      activeGrab = g;
      pointerId = id;
      grabWX = wx;
      grabWY = wy;
      const clamped = setGrabTarget(wx, wy);
      clampedGrabX = clamped.x;
      clampedGrabY = clamped.y;
      lastPtrX = wx;
      lastPtrY = wy;
      dragVX = 0;
      dragVY = 0;
      sounds.pop(1.3);
      haptic('light');
    },

    move(x, y, pressed, id) {
      if (!activeGrab || id !== pointerId) return;
      const wx = x, wy = y + camY;
      const dx = wx - lastPtrX, dy = wy - lastPtrY;
      dragVX = dragVX * 0.55 + clamp(dx * 60, -850, 850) * 0.45;
      dragVY = dragVY * 0.55 + clamp(dy * 60, -950, 850) * 0.45;
      lastPtrX = wx;
      lastPtrY = wy;
      grabWX = wx;
      grabWY = wy;
      const clamped = setGrabTarget(wx, wy);
      clampedGrabX = clamped.x;
      clampedGrabY = clamped.y;
      activeGrab.move(clampedGrabX, clampedGrabY);
    },

    up(x, y, id) {
      if (!activeGrab || id !== pointerId) return;
      const gp = activeGrab.point;
      activeGrab.drop();
      activeGrab = null;
      pointerId = null;

      // Apply release sling impulse to jelly points
      const spd = Math.hypot(dragVX, dragVY);
      if (spd > 45) {
        const boost = K.slingBoost * soft.step;
        const pts = jelly.points;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const w = p === gp ? 1.1 : 0.45;
          p.px -= dragVX * boost * w;
          p.py -= dragVY * boost * w;
        }
        sounds.boing(clamp(0.85 + spd / 1400, 0.85, 1.35));
      }
    },

    key(k, isDown) {
      if (isDown) {
        KEYS_DOWN.add(k);
        ready.go();
      } else {
        KEYS_DOWN.delete(k);
      }
    },

    debug(c) {
      c.save();
      c.translate(0, -camY);
      phys.debugDraw(c);
      c.restore();
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'goo-squeeze',
  title: 'Goo Squeeze',
  tag: 'Casual · Physics',
  retro: false,
  w: W, h: H, maxH: 800,
  tick: 60,
  music: 'silly',
  goal: 45,
  hint: 'Grab and stretch the jelly upward through squeeze gaps and flap-gates ahead of rising sludge.',
  creator: 'Antigravity',
  make,
};
