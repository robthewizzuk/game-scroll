// Log Driver: cel-shaded 3D river log-rolling and leaping action!
// Balance atop spinning timber logs drifting downstream, side-hop onto adjacent logs to grab
// golden axes or dodge saw-booms, and leap forward onto oncoming logs before the spillway!
import gs from '../gamescroll.js';
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { Spawner, ramp } = gs.pacing;
const { mix } = gs.tick;
const { Keys } = gs.controls;
const { View, G, part, grp, figure, THREE } = gs.toon;

let W = 192, H = 160;

const LANES = [-2.2, 0, 2.2];
const LOG_R = 0.48;
const Z_SPAWN = -27;
const Z_FALLS = 4.4;
const MAX_LOGS = 12;
const MAX_ROCKS = 5;
const MAX_BOOMS = 4;
const MAX_AXES = 5;
const MAX_DROPS = 10;
const MAX_RIPPLES = 8;
const MAX_TREES = 4;

let v3;
const _pos = [0, 0, 0];
const _opts = { rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
const _rigOpts = { speed: 0 };

function resetOpts() {
  _opts.rx = 0; _opts.ry = 0; _opts.rz = 0;
  _opts.sx = 1; _opts.sy = 1; _opts.sz = 1;
}

function noShadow(o) {
  o.traverse(m => { if (m.isMesh) m.userData.gsNoShadow = true; });
  return o;
}

function setupView() {
  if (v3) return v3;
  v3 = new View({
    bg: '#74c6fa',
    fog: ['#96d8fc', 17, 32],
    sun: [-0.55, 1.0, 0.55],
    sunI: 2.2,
    sky: '#eef8ff',
    ground: '#265c84',
    amb: 1.15,
  });

  // Static river bed, grassy banks, and back spillway foam lip (noShadow saves shadow pass draws)
  v3.add(
    noShadow(part(G.plane, '#2474c4', { sx: 12, sz: 72, z: -14, y: 0, line: false })),
    noShadow(part(G.box, '#4aa848', { sx: 18, sy: 1.6, sz: 72, x: -13.0, y: 0.35, z: -14 })),
    noShadow(part(G.box, '#4aa848', { sx: 18, sy: 1.6, sz: 72, x: 13.0, y: 0.35, z: -14 })),
    noShadow(part(G.box, '#dcf4ff', { sx: 8.2, sy: 0.28, sz: 1.0, x: 0, y: 0.1, z: Z_FALLS + 0.7, line: false })),
  );

  // Faceted 7-sided timber log geometry (1 mesh per log; crisp flat cel-shading bands show rotation)
  const rawCyl = new THREE.CylinderGeometry(LOG_R, LOG_R, 1, 7, 1);
  rawCyl.rotateX(Math.PI / 2);
  const logGeo = rawCyl.toNonIndexed();
  logGeo.computeVertexNormals();

  // Prefabs built once in setup()
  v3.def('hero', () => figure({
    h: 1.65,
    body: '#d83830',
    skin: '#f4c088',
    legs: '#305898',
    shoes: '#3a2414',
    hair: '#3a2214',
  }));
  v3.def('log', () => part(logGeo, '#96582a'));
  v3.def('rock', () => part(G.rock, '#6c7480', { sx: 0.72, sy: 0.65, sz: 0.72, y: 0.34 }));
  v3.def('boom', () => grp(
    part(G.box, '#e84434', { sx: 1.75, sy: 0.44, sz: 0.56, y: 0.48 }),
    noShadow(part(G.box, '#f8d038', { sx: 1.82, sy: 0.2, sz: 0.6, y: 0.84 })),
  ));
  v3.def('axe', () => grp(
    noShadow(part(G.cyl, '#9c6430', { sx: 0.07, sy: 0.85, sz: 0.07, y: 0.48 })),
    part(G.box, '#ffd638', { sx: 0.46, sy: 0.34, sz: 0.14, x: 0.18, y: 0.76, glow: 0.45 }),
  ));
  v3.def('drop', () => noShadow(part(G.ball, '#dcf4ff', { s: 0.16, line: false })));
  v3.def('ripple', () => noShadow(part(G.plane, '#bfe8ff', { sx: 1.1, sz: 0.36, line: false })));
  v3.def('pine', () => noShadow(part(G.cone, '#2d7c3a', { sx: 1.3, sy: 3.1, sz: 1.3, y: 1.6 })));
  v3.def('shadow', () => noShadow(part(G.disc, '#143c6c', { sx: 0.58, sz: 0.58, line: false })));

  // Pre-warm all 3D pools so zero meshes/rigs/materials are created mid-play
  v3.frame();
  v3.put('hero', [0, -50, 0]);
  v3.put('shadow', [0, -50, 0]);
  for (let i = 0; i < MAX_LOGS; i++) v3.put('log', [0, -50, 0]);
  for (let i = 0; i < MAX_ROCKS; i++) v3.put('rock', [0, -50, 0]);
  for (let i = 0; i < MAX_BOOMS; i++) v3.put('boom', [0, -50, 0]);
  for (let i = 0; i < MAX_AXES; i++) v3.put('axe', [0, -50, 0]);
  for (let i = 0; i < MAX_DROPS; i++) v3.put('drop', [0, -50, 0]);
  for (let i = 0; i < MAX_RIPPLES; i++) v3.put('ripple', [0, -50, 0]);
  for (let i = 0; i < MAX_TREES; i++) v3.put('pine', [0, -50, 0]);
  v3.frame();
  return v3;
}

function make(api) {
  setupView();

  const feel = new Feel();
  const ready = new Ready();
  const keys = new Keys();

  const K = gs.tweak('Feel', {
    speed: [3.4, 2.0, 6.0, 'starting river drift speed (units a second)'],
    ramp: [85, 30, 150, 'seconds until river reaches top speed'],
    steer: [4.2, 2.0, 7.5, 'how fast leaning counter-spins the log'],
    tip: [1.25, 0.5, 2.5, 'how strongly off-center weight tips you'],
    jumpTime: [0.44, 0.28, 0.7, 'seconds spent in the air on a forward leap'],
    spawn: [1.14, 0.6, 1.8, 'seconds between oncoming log waves at the start'],
    fastest: [0.64, 0.35, 1.0, 'shortest gap between log waves at top speed'],
  });

  const spawner = new Spawner({
    every: K.spawn,
    fastest: K.fastest,
    over: K.ramp,
    jitter: 0.1,
    first: 0.25,
  });

  // Pre-allocated object pools
  const logs = Array.from({ length: MAX_LOGS }, () => ({
    active: false, id: 0, lane: 1, z: 0, wz: 0, len: 4, roll: 0, wroll: 0, rollBias: 0, scored: false,
  }));
  const rocks = Array.from({ length: MAX_ROCKS }, () => ({ active: false, lane: 0, z: 0, wz: 0 }));
  const booms = Array.from({ length: MAX_BOOMS }, () => ({ active: false, lane: 0, z: 0, wz: 0 }));
  const axes = Array.from({ length: MAX_AXES }, () => ({ active: false, lane: 1, z: 0, wz: 0, bob: 0 }));
  const drops = Array.from({ length: MAX_DROPS }, () => ({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0 }));
  const trees = Array.from({ length: MAX_TREES }, () => ({ x: 0, z: 0, wz: 0, s: 1 }));

  let score, streak, t, rigStep, dead, ended, logSeq;
  let curLog, lane, px, wpx, py, wpy, pz, wpz, bal, camX;
  let airT, airDur, airStartX, airTargetX, hopT, hopFromX, hopToX;
  let lastSafeLane;
  const touch = { active: false, id: -1, downX: 0, downY: 0, curX: 0, curY: 0, downT: 0, swipedUp: false, jumpQueued: false };

  function alloc(pool) {
    for (let i = 0; i < pool.length; i++) if (!pool[i].active) return pool[i];
    return null;
  }

  function addLog(laneIdx, zPos, len, rollBias, scored = false) {
    const o = alloc(logs);
    if (!o) return null;
    o.active = true;
    o.id = ++logSeq;
    o.lane = laneIdx;
    o.z = zPos;
    o.wz = zPos;
    o.len = len;
    o.roll = 0;
    o.wroll = 0;
    o.rollBias = rollBias;
    o.scored = scored;
    return o;
  }

  function addRock(laneIdx, zPos) {
    const o = alloc(rocks);
    if (!o) return null;
    o.active = true; o.lane = laneIdx; o.z = zPos; o.wz = zPos;
    return o;
  }

  function addBoom(laneIdx, zPos) {
    const o = alloc(booms);
    if (!o) return null;
    o.active = true; o.lane = laneIdx; o.z = zPos; o.wz = zPos;
    return o;
  }

  function addAxe(laneIdx, zPos) {
    const o = alloc(axes);
    if (!o) return null;
    o.active = true; o.lane = laneIdx; o.z = zPos; o.wz = zPos; o.bob = Math.random() * 6.28;
    return o;
  }

  function emitSplash(x, y, z, count = 8) {
    let n = 0;
    for (let i = 0; i < drops.length && n < count; i++) {
      const d = drops[i];
      if (d.active) continue;
      d.active = true;
      d.x = x + rnd(-0.22, 0.22);
      d.y = y + rnd(0.05, 0.25);
      d.z = z + rnd(-0.22, 0.22);
      const a = Math.random() * 6.283;
      const spd = rnd(1.4, 3.0);
      d.vx = Math.cos(a) * spd;
      d.vy = rnd(2.8, 5.0);
      d.vz = Math.sin(a) * spd;
      d.life = rnd(0.35, 0.6);
      n++;
    }
  }

  function spawnWaveAt(zPos, forceHazards = false) {
    const shift = Math.random() < 0.55 ? 0 : (Math.random() < 0.5 ? -1 : 1);
    const safe = clamp(lastSafeLane + shift, 0, 2);
    const spinMag = rnd(0.55, 0.92) * (1 + Math.min(0.45, t / 85));
    const safeLen = rnd(3.3, 4.1);
    addLog(safe, zPos, safeLen, (Math.random() < 0.5 ? -1 : 1) * spinMag, false);

    const otherLanes = safe === 1 ? [0, 2] : [1, safe === 0 ? 2 : 0];
    const alt = otherLanes[Math.random() < 0.65 ? 0 : 1];
    if (Math.random() < 0.62 || forceHazards) {
      const altLen = rnd(3.1, 3.9);
      const altSpin = rnd(0.72, 1.15) * (Math.random() < 0.5 ? -1 : 1);
      addLog(alt, zPos + rnd(-0.35, 0.35), altLen, altSpin, false);
      if (alt !== 1 && (Math.random() < 0.52 || forceHazards)) {
        addAxe(alt, zPos);
      }
    }

    if (forceHazards || Math.random() < 0.44) {
      const hazardLane = otherLanes[1];
      if (hazardLane !== safe) {
        if ((t > 6 || forceHazards) && Math.random() < 0.45) {
          addBoom(hazardLane, zPos - 0.7);
        } else {
          addRock(hazardLane, zPos + rnd(-0.5, 0.5));
        }
      }
    } else if (t > 4 && Math.random() < 0.25) {
      addRock(safe, zPos + safeLen * 0.5 + 0.8);
    }

    lastSafeLane = safe;
  }

  function projectTo2D(wx, wy, wz) {
    const v = setupView();
    return v.toScreen(wx, wy, wz);
  }

  function wipeOut(reason) {
    if (dead > 0) return;
    dead = 0.01;
    emitSplash(px, Math.max(0.15, py), pz, 8);
    const [sx, sy] = projectTo2D(px, Math.max(0.3, py), pz);
    feel.hit(sx, sy, { color: '#70d4ff', power: 0.9 });
    feel.boom(sx, sy, { size: 0.75, color: ['#ffffff', '#88d8ff', '#ffd638'] });
    feel.juice.pop(sx, sy - 14, reason, { color: '#ff6b5a' });
  }

  function findLogAt(targetLane, targetZ, pad = 0.52) {
    let best = null, bestD = 99;
    for (let i = 0; i < logs.length; i++) {
      const l = logs[i];
      if (!l.active || l.lane !== targetLane) continue;
      const d = Math.abs(targetZ - l.z);
      if (d <= l.len * 0.5 + pad && d < bestD) {
        best = l;
        bestD = d;
      }
    }
    return best;
  }

  function startJump() {
    if (!curLog || airT > 0 || hopT > 0 || dead > 0) return;
    curLog = null;
    airT = 0.001;
    airDur = K.jumpTime;
    airStartX = px;
    airTargetX = LANES[lane];
    const [sx, sy] = projectTo2D(px, py + 0.4, pz);
    feel.jump(sx, sy);
  }

  function trySideHop(dir) {
    if (!curLog || airT > 0 || hopT > 0 || dead > 0) return false;
    const nextLane = lane + dir;
    if (nextLane < 0 || nextLane > 2) return false;
    const adj = findLogAt(nextLane, pz, 0.72);
    if (!adj) return false;
    for (let i = 0; i < booms.length; i++) {
      const b = booms[i];
      if (b.active && b.lane === nextLane && Math.abs(b.z - pz) < 0.9) return false;
    }
    lane = nextLane;
    curLog = adj;
    hopT = 0.16;
    hopFromX = px;
    hopToX = LANES[lane];
    bal = -dir * 0.25;
    const [sx, sy] = projectTo2D(px, py + 0.4, pz);
    feel.jump(sx, sy);
    if (!adj.scored) {
      adj.scored = true;
      score += 1;
      api.score(score);
      feel.score(sx, sy - 10, 1, { color: '#ffffff' });
    }
    return true;
  }

  function getSteer() {
    const ka = keys.axis();
    if (Math.abs(ka.x) > 0.1) return clamp(ka.x, -1, 1);
    if (!touch.active) return 0;
    const dx = touch.curX - touch.downX;
    if (Math.abs(dx) > 6) return clamp(dx / 24, -1, 1);
    if (touch.downX < W * 0.36) return -1;
    if (touch.downX > W * 0.64) return 1;
    return 0;
  }

  function resetRound() {
    for (let i = 0; i < logs.length; i++) logs[i].active = false;
    for (let i = 0; i < rocks.length; i++) rocks[i].active = false;
    for (let i = 0; i < booms.length; i++) booms[i].active = false;
    for (let i = 0; i < axes.length; i++) axes[i].active = false;
    for (let i = 0; i < drops.length; i++) drops[i].active = false;

    for (let i = 0; i < MAX_TREES; i++) {
      const tr = trees[i];
      tr.x = (i % 2 === 0 ? -1 : 1) * rnd(5.6, 7.6);
      tr.z = -24 + i * 7.2;
      tr.wz = tr.z;
      tr.s = rnd(0.9, 1.3);
    }

    score = 0;
    streak = 0;
    t = 0;
    rigStep = 0;
    dead = 0;
    ended = false;
    logSeq = 0;
    lastSafeLane = 1;

    // Starting safe center log + oncoming logs aligned to jump reach (~3.9 units/wave)
    curLog = addLog(1, 0.6, 4.6, 0.48, true);
    lane = 1;
    px = wpx = 0;
    py = wpy = LOG_R;
    pz = wpz = 0.6;
    bal = 0;
    camX = 0;
    airT = 0;
    airDur = K.jumpTime;
    hopT = 0;

    // Wave 1 guarantees center + side log with axe so first leap scores cleanly
    addLog(1, -3.2, 3.8, -0.58, false);
    addLog(0, -3.2, 3.6, 0.72, false);
    addAxe(0, -3.2);
    lastSafeLane = 1;

    spawnWaveAt(-7.1, false);
    spawnWaveAt(-11.0, true);
    spawnWaveAt(-14.9, false);
    spawnWaveAt(-18.8, false);
    spawnWaveAt(-22.7, false);
    spawnWaveAt(-26.6, false);

    touch.active = false;
    touch.jumpQueued = false;
    spawner.reset();
    feel.clear();
    ready.reset();
    keys.clear();
  }

  return {
    reset: resetRound,
    resize(w, h) { W = w; H = h; },

    update(dt) {
      feel.update(dt);
      if (feel.frozen) return;

      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        if (!d.active) continue;
        d.life -= dt;
        if (d.life <= 0) { d.active = false; continue; }
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;
        d.vy -= 12 * dt;
        if (d.y < 0) { d.y = 0; d.active = false; }
      }

      if (dead > 0) {
        dead += dt;
        if (dead > 0.65 && !ended) {
          ended = true;
          feel.lose();
          api.over();
        }
        return;
      }

      if (!ready.update(dt)) {
        rigStep += dt;
        return;
      }

      t += dt;
      rigStep += dt;

      const riverSpeed = ramp(t, K.speed, K.speed * 1.72, K.ramp);
      const jumpScrollBoost = airT > 0 ? 4.2 : 0;
      const scroll = riverSpeed + jumpScrollBoost;

      spawner.update(dt, () => spawnWaveAt(Z_SPAWN, false));

      for (let i = 0; i < logs.length; i++) {
        const l = logs[i];
        if (!l.active) continue;
        l.wz = l.z;
        l.wroll = l.roll;
        l.z += scroll * dt;
        if (l !== curLog) l.roll += l.rollBias * 0.55 * dt;
        if (l.z - l.len * 0.5 > Z_FALLS + 2.5) l.active = false;
      }
      for (let i = 0; i < rocks.length; i++) {
        const r = rocks[i];
        if (!r.active) continue;
        r.wz = r.z; r.z += scroll * dt;
        if (r.z > Z_FALLS + 2.2) r.active = false;
      }
      for (let i = 0; i < booms.length; i++) {
        const b = booms[i];
        if (!b.active) continue;
        b.wz = b.z; b.z += scroll * dt;
        if (b.z > Z_FALLS + 2.2) b.active = false;
      }
      for (let i = 0; i < axes.length; i++) {
        const a = axes[i];
        if (!a.active) continue;
        a.wz = a.z; a.z += scroll * dt;
        if (a.z > Z_FALLS + 2.2) a.active = false;
      }
      for (let i = 0; i < trees.length; i++) {
        const tr = trees[i];
        tr.wz = tr.z;
        tr.z += scroll * dt;
        if (tr.z > Z_FALLS + 2.6) {
          tr.z -= 28.8;
          tr.wz = tr.z;
        }
      }

      wpx = px; wpy = py; wpz = pz;
      const steer = getSteer();

      if ((touch.jumpQueued || keys.held('ArrowUp') || keys.held('w') || keys.held('W') || keys.held(' ')) && curLog && airT === 0 && hopT === 0) {
        touch.jumpQueued = false;
        startJump();
      }
      touch.jumpQueued = false;

      if (airT > 0) {
        airT += dt;
        const u = clamp(airT / airDur, 0, 1);
        airTargetX = clamp(airTargetX + steer * 2.8 * dt, LANES[0] - 0.5, LANES[2] + 0.5);
        px = airStartX + (airTargetX - airStartX) * u;
        py = LOG_R + Math.sin(u * Math.PI) * 1.55;
        pz = clamp(pz - 1.4 * dt, -0.4, 2.6);
        lane = clamp(Math.round((px - LANES[0]) / 2.2), 0, 2);

        if (u >= 1) {
          airT = 0;
          const landed = findLogAt(lane, pz, 0.56);
          if (!landed) {
            py = 0.05;
            wipeOut('SPLASH!');
            return;
          }
          curLog = landed;
          py = LOG_R;
          px = LANES[lane];
          bal = clamp((px - LANES[lane]) * 0.4 + rnd(-0.1, 0.1), -0.45, 0.45);
          const [sx, sy] = projectTo2D(px, py + 0.5, pz);
          feel.land(sx, sy, 1);
          if (!landed.scored) {
            landed.scored = true;
            const cleanCenter = Math.abs(pz - landed.z) < landed.len * 0.34 && Math.abs(bal) < 0.38;
            if (cleanCenter) {
              streak++;
              score += 3;
              api.score(score);
              feel.combo(streak, sx, sy - 14, { color: '#ffd638' });
              feel.juice.pop(sx, sy - 24, '+3 CLEAN!', { color: '#ffd638' });
            } else {
              streak = 0;
              score += 1;
              api.score(score);
              feel.score(sx, sy - 12, 1, { color: '#ffffff' });
            }
          }
        }
      } else if (curLog) {
        pz += scroll * dt;
        const relZ = pz - curLog.z;
        if (Math.abs(relZ) > curLog.len * 0.5 + 0.28) {
          curLog = null;
          wipeOut('SLIPPED OFF!');
          return;
        }

        const spinMult = 1 + Math.min(0.65, t / K.ramp);
        const logTorque = curLog.rollBias * spinMult;
        curLog.roll += (logTorque - steer * 2.4) * dt;
        bal += (logTorque * 0.9 + bal * K.tip + steer * K.steer) * dt;

        if (Math.abs(bal) > 0.78 && steer * bal > 0.2) {
          const dir = bal > 0 ? 1 : -1;
          trySideHop(dir);
        }

        if (Math.abs(bal) >= 1.0) {
          curLog = null;
          wipeOut('LOST BALANCE!');
          return;
        }

        if (hopT > 0) {
          hopT = Math.max(0, hopT - dt);
          const hu = 1 - hopT / 0.16;
          px = hopFromX + (hopToX - hopFromX) * hu;
          py = LOG_R + Math.sin(hu * Math.PI) * 0.72;
        } else {
          px = LANES[curLog.lane] + Math.sin(bal * 0.65) * LOG_R * 0.9;
          py = LOG_R * Math.cos(bal * 0.65);
        }

        if (!curLog.scored && curLog.z >= 0.4) {
          curLog.scored = true;
          score += 1;
          api.score(score);
          const [sx, sy] = projectTo2D(px, py + 0.7, pz);
          feel.score(sx, sy - 12, 1, { color: '#ffffff' });
        }

        if (pz >= Z_FALLS) {
          curLog = null;
          wipeOut('SPILLWAY!');
          return;
        }
      }

      camX += (px * 0.65 - camX) * Math.min(1, dt * 8);

      for (let i = 0; i < rocks.length; i++) {
        const r = rocks[i];
        if (!r.active) continue;
        if (Math.abs(pz - r.z) < 0.66 && Math.abs(px - LANES[r.lane]) < 0.74 && py < 0.86) {
          wipeOut('BOULDER!');
          return;
        }
      }
      for (let i = 0; i < booms.length; i++) {
        const b = booms[i];
        if (!b.active) continue;
        if (Math.abs(pz - b.z) < 0.62 && Math.abs(px - LANES[b.lane]) < 0.96 && py < 1.32) {
          wipeOut('SAW-BOOM!');
          return;
        }
      }
      for (let i = 0; i < axes.length; i++) {
        const a = axes[i];
        if (!a.active) continue;
        if (Math.abs(pz - a.z) < 0.85 && Math.abs(px - LANES[a.lane]) < 0.85 && py < 1.9) {
          a.active = false;
          score += 5;
          api.score(score);
          const [sx, sy] = projectTo2D(LANES[a.lane], 0.9, a.z);
          feel.coin(sx, sy - 6, { color: '#ffd638', pitch: 1.25 });
          feel.juice.pop(sx, sy - 18, '+5 AXE!', { color: '#ffd638' });
        }
      }
    },

    draw(c) {
      const v = setupView();
      v.persp(W, H, 52, 0.2, 60);
      v.cam.position.set(camX, 4.3, 6.2);
      v.cam.lookAt(camX * 0.45, 0.55, -5.5);
      v.cam.updateMatrixWorld();
      v.frame();

      for (let i = 0; i < trees.length; i++) {
        const tr = trees[i];
        _pos[0] = tr.x; _pos[1] = 0.85; _pos[2] = mix(tr.wz, tr.z);
        resetOpts(); _opts.sx = tr.s; _opts.sy = tr.s; _opts.sz = tr.s;
        v.put('pine', _pos, _opts);
      }

      let rippleN = 0;
      for (let i = 0; i < logs.length; i++) {
        const l = logs[i];
        if (!l.active) continue;
        const lz = mix(l.wz, l.z);
        _pos[0] = LANES[l.lane]; _pos[1] = 0.04; _pos[2] = lz;
        resetOpts(); _opts.rz = mix(l.wroll, l.roll); _opts.sz = l.len;
        v.put('log', _pos, _opts);

        if (lz > -15 && rippleN < MAX_RIPPLES) {
          rippleN++;
          _pos[0] = LANES[l.lane]; _pos[1] = 0.02; _pos[2] = lz + l.len * 0.5 + 0.22;
          resetOpts(); _opts.sx = 0.95 + Math.sin(t * 6 + l.id) * 0.1;
          v.put('ripple', _pos, _opts);
        }
      }

      for (let i = 0; i < rocks.length; i++) {
        const r = rocks[i];
        if (!r.active) continue;
        _pos[0] = LANES[r.lane]; _pos[1] = Math.sin(t * 3 + r.z) * 0.04; _pos[2] = mix(r.wz, r.z);
        resetOpts();
        v.put('rock', _pos, _opts);
      }
      for (let i = 0; i < booms.length; i++) {
        const b = booms[i];
        if (!b.active) continue;
        _pos[0] = LANES[b.lane]; _pos[1] = Math.sin(t * 5 + b.z) * 0.05; _pos[2] = mix(b.wz, b.z);
        resetOpts();
        v.put('boom', _pos, _opts);
      }
      for (let i = 0; i < axes.length; i++) {
        const a = axes[i];
        if (!a.active) continue;
        _pos[0] = LANES[a.lane]; _pos[1] = 0.72 + Math.sin(t * 4.5 + a.bob) * 0.18; _pos[2] = mix(a.wz, a.z);
        resetOpts(); _opts.ry = t * 3.4 + a.bob;
        v.put('axe', _pos, _opts);
      }

      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        if (!d.active) continue;
        _pos[0] = d.x; _pos[1] = d.y; _pos[2] = d.z;
        resetOpts();
        const sc = clamp(d.life * 2, 0.3, 1.1);
        _opts.sx = sc; _opts.sy = sc; _opts.sz = sc;
        v.put('drop', _pos, _opts);
      }

      const hx = mix(wpx, px);
      const hy = dead > 0 ? Math.max(-0.6, mix(wpy, py) - dead * 2.4) : mix(wpy, py);
      const hz = mix(wpz, pz);

      // Always put water ring / landing shadow on frame 1+ so zero materials compile mid-play
      _pos[0] = hx; _pos[1] = 0.015; _pos[2] = hz;
      resetOpts();
      _opts.sx = airT > 0 || hopT > 0 ? 0.85 : 1.0;
      _opts.sz = _opts.sx;
      v.put('shadow', _pos, _opts);

      _pos[0] = hx; _pos[1] = hy; _pos[2] = hz;
      resetOpts();
      _opts.ry = Math.PI - bal * 0.35;
      _opts.rz = dead > 0 ? bal * 1.4 + dead * 4 : -bal * 0.45;
      const hero = v.put('hero', _pos, _opts);
      if (hero.rig) {
        if (dead > 0) {
          hero.rig.play('fall');
          _rigOpts.speed = 0;
        } else if (airT > 0 || hopT > 0) {
          hero.rig.play(airT > airDur * 0.55 ? 'fall' : 'jump');
          _rigOpts.speed = 0;
        } else if (!ready.playing) {
          hero.rig.play('idle');
          _rigOpts.speed = 0;
        } else {
          hero.rig.play('run');
          _rigOpts.speed = 4.2 + Math.abs(bal) * 3.2;
        }
        hero.rig.update(rigStep, _rigOpts);
        rigStep = 0;
      }

      feel.begin(c);
      v.render(c, W, H);
      feel.end(c, W, H);

      if (ready.playing && dead === 0) {
        const bw = 66, bh = 6, bx = W * 0.5 - bw * 0.5, by = H - 12;
        c.fillStyle = 'rgba(14, 18, 28, 0.72)';
        c.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        c.fillStyle = '#4ad870';
        c.fillRect(bx + bw * 0.32, by, bw * 0.36, bh);
        c.fillStyle = '#f05040';
        c.fillRect(bx, by, bw * 0.18, bh);
        c.fillRect(bx + bw * 0.82, by, bw * 0.18, bh);
        const nx = bx + (0.5 + clamp(bal, -1, 1) * 0.48) * bw;
        c.fillStyle = Math.abs(bal) > 0.74 ? ((t * 14 | 0) % 2 ? '#ffffff' : '#ffeb3b') : '#ffffff';
        c.fillRect(nx - 2, by - 2, 4, bh + 4);
      }

      ready.draw(c, W, H, { text: 'Swipe L/R: Balance · Up: Leap', size: 8, y: H - 14 });
    },

    down(x, y, id) {
      if (ready.go()) return;
      if (dead > 0) return;
      touch.active = true;
      touch.id = id;
      touch.downX = x;
      touch.downY = y;
      touch.curX = x;
      touch.curY = y;
      touch.downT = t;
      touch.swipedUp = false;
    },

    move(x, y, pressed, id) {
      if (!pressed || !touch.active || touch.id !== id) return;
      const dy = touch.curY - y;
      touch.curX = x;
      touch.curY = y;
      if (!touch.swipedUp && (touch.downY - y > 15 || dy > 5)) {
        touch.swipedUp = true;
        touch.jumpQueued = true;
      }
    },

    up(x, y, id) {
      if (touch.active && touch.id === id) {
        const dtTap = t - touch.downT;
        const moved = Math.hypot(x - touch.downX, y - touch.downY);
        if (!touch.swipedUp && dtTap < 0.26 && moved < 12 && (x >= W * 0.3 && x <= W * 0.7 || y < H * 0.55)) {
          touch.jumpQueued = true;
        }
        touch.active = false;
        touch.id = -1;
      }
    },

    key(k, isDown) {
      if (isDown && ready.go()) return;
      keys.key(k, isDown);
      if (isDown && (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ')) {
        touch.jumpQueued = true;
      }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'log-driver',
  title: 'Log Driver',
  tag: 'Console · Action',
  retro: true,
  era: 'console',
  pal: 'grape',
  w: 192,
  h: 160,
  maxW: 300,
  maxH: 240,
  tick: 60,
  music: 'happy',
  goal: 50,
  hint: 'Hold or drag left and right to balance on spinning logs and hop lanes, and swipe up or tap center to leap onto oncoming logs.',
  creator: 'Antigravity',
  make,
};
