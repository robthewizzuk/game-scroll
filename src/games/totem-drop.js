// Totem Drop: stack carved 3D totems onto a stone plinth on your real floor using AR + 3D physics.
// Drag to steer the swaying totem overhead along the glowing drop-beam, then tap to release it
// before the 8s fuse runs out. Let each block settle calmly to score; 3 fallen blocks end the round.
import gs from '../gamescroll.js';
const { want, haptic } = gs.device;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { Gestures, Keys } = gs.controls;
const { sfx, sounds, tone, noise } = gs.sound;
const { clamp } = gs.util;
const { Particles, pbr, rbox, surface, speckle, THREE } = gs.hd;
const { ARView, arNote, FLOOR } = gs.ar;
const { World3D } = gs.physics3d;
const { Group, Mesh, BoxGeometry, CylinderGeometry, RingGeometry, CircleGeometry, Vector3, Color } = THREE;

let W = 300, H = 460;
const GOAL = 150;
const POOL = 18;
const PLINTH_X = 0, PLINTH_Z = -2.0;
const PLINTH_W = 0.72, PLINTH_H = 0.16;

// Piece archetypes: flat tops/bottoms matching physics box dimensions 1:1
const ARCHETYPES = [
  { kind: 'slab', w: 0.55, h: 0.16, d: 0.55, density: 1.25, sound: 'stone', pts: 20, count: 5 },
  { kind: 'totem', w: 0.42, h: 0.24, d: 0.42, density: 1.0, sound: 'wood', pts: 20, count: 5 },
  { kind: 'obelisk', w: 0.28, h: 0.30, d: 0.28, density: 1.15, sound: 'stone', pts: 25, count: 5 },
  { kind: 'crown', w: 0.34, h: 0.22, d: 0.34, density: 1.35, sound: 'metal', pts: 30, count: 3 },
];

function make(api) {
  want('motion');
  const feel = new Feel();
  const ready = new Ready({ text: 'Tap to start' });
  const keys = new Keys();

  const K = gs.tweak('Feel', {
    fuse: [8, 4, 15, 'seconds before a held block auto-drops'],
    swayAmp: [0.16, 0.04, 0.35, 'pendulum sway radius overhead (metres)'],
    swaySpeed: [1.55, 0.5, 3.5, 'pendulum sway speed (rad/s)'],
    aimSpeed: [0.0038, 0.001, 0.01, 'drag sensitivity moving block in X/Z'],
    settleTime: [0.6, 0.25, 1.5, 'seconds a block must stay still to score'],
    lives: [3, 1, 6, 1, 'fallen blocks before the round ends'],
  });

  let v, world, floorBody, plinthMesh, plinthBody, sparks, beam, reticle, beamMat, reticleMat;
  let pool, dropped, active;
  let score, falls, streak, won, ended, t, spawnCount, dropCooldown, lastHitSfx;
  let aimX, aimZ, hx, hy, hz, swayPhase, fuse, lastTickSec, towerTopY, refX, refZ, aimState;
  let msg, msgT;

  // Pre-allocated scratch objects to avoid per-frame allocations
  const _fwd = new Vector3();
  const _rayFrom = { x: 0, y: 0, z: 0 };
  const _rayDir = { x: 0, y: -1, z: 0 };
  const _ptrTarget = new Vector3(PLINTH_X, FLOOR + 0.4, PLINTH_Z);
  const _ptrArr = [{ p: _ptrTarget, col: '#40ffd0' }];
  const _sparkCol = [1, 0.85, 0.25];
  const _colTeal = new Color('#40ffd0');
  const _colAmber = new Color('#ffc14a');
  const _colRed = new Color('#ff4d6d');

  function buildMaterials() {
    const plinthTex = surface(256, ({ col, h, size: S }) => {
      col.fillStyle = '#3a404a'; col.fillRect(0, 0, S, S);
      h.fillStyle = '#707070'; h.fillRect(0, 0, S, S);
      for (let i = 0; i < 8; i++) {
        const y = i * 32;
        h.fillStyle = '#2a2a2a'; h.fillRect(0, y, S, 4);
        col.fillStyle = '#252a32'; col.fillRect(0, y, S, 4);
      }
      for (let x = 16; x < S; x += 32) {
        h.fillStyle = '#c0c0c0'; h.fillRect(x, 8, 8, 16);
      }
      speckle(col, S, 1800, '#1c2028', 1.4, 0.35);
      speckle(col, S, 800, '#6c7582', 1.1, 0.25);
    }, { strength: 2.4 });

    const stoneTex = surface(256, ({ col, h, size: S }) => {
      col.fillStyle = '#8b939c'; col.fillRect(0, 0, S, S);
      h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 64) {
        h.fillStyle = '#202020'; h.fillRect(0, y, S, 5);
        col.fillStyle = '#5c646d'; col.fillRect(0, y, S, 5);
        for (let x = 0; x < S; x += 32) {
          h.fillStyle = '#d8d8d8'; h.fillRect(x + 6, y + 14, 20, 8);
          h.fillStyle = '#343434'; h.fillRect(x + 12, y + 26, 8, 22);
        }
      }
      speckle(col, S, 1600, '#444b52', 1.5, 0.3);
      speckle(col, S, 900, '#b5bcc4', 1.2, 0.25);
    }, { strength: 2.2 });

    const woodTex = surface(256, ({ col, h, size: S }) => {
      col.fillStyle = '#b6693a'; col.fillRect(0, 0, S, S);
      h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y += 4) {
        const shade = 140 + ((y * 17) % 45);
        col.fillStyle = `rgba(${shade},${shade * 0.55 | 0},${shade * 0.32 | 0},0.35)`;
        col.fillRect(0, y, S, 2);
        h.fillStyle = (y % 8 === 0) ? '#686868' : '#969696';
        h.fillRect(0, y, S, 2);
      }
      // Carved mask bands
      for (let y = 24; y < S; y += 64) {
        col.fillStyle = '#265c58'; col.fillRect(0, y, S, 10);
        h.fillStyle = '#202020'; h.fillRect(0, y, S, 3);
        h.fillStyle = '#d0d0d0'; h.fillRect(0, y + 4, S, 6);
      }
      speckle(col, S, 900, '#4e2812', 1.3, 0.25);
    }, { strength: 2.0 });

    const jadeTex = surface(256, ({ col, h, size: S }) => {
      col.fillStyle = '#2a8c78'; col.fillRect(0, 0, S, S);
      h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);
      for (let x = 0; x < S; x += 32) {
        for (let y = 0; y < S; y += 32) {
          h.strokeStyle = '#303030'; h.lineWidth = 3;
          h.strokeRect(x + 4, y + 4, 24, 24);
          col.strokeStyle = '#1b5e50'; col.lineWidth = 2;
          col.strokeRect(x + 4, y + 4, 24, 24);
        }
      }
      speckle(col, S, 1200, '#62d4b8', 1.4, 0.28);
      speckle(col, S, 900, '#134238', 1.3, 0.3);
    }, { strength: 1.8 });

    const goldTex = surface(128, ({ col, h, size: S }) => {
      col.fillStyle = '#ffcf48'; col.fillRect(0, 0, S, S);
      h.fillStyle = '#909090'; h.fillRect(0, 0, S, S);
      for (let y = 12; y < S; y += 28) {
        h.fillStyle = '#e0e0e0'; h.fillRect(0, y, S, 6);
        col.fillStyle = '#ffe588'; col.fillRect(0, y, S, 6);
      }
      speckle(col, S, 500, '#b58416', 1.2, 0.3);
    }, { strength: 1.8 });

    return {
      plinth: pbr('#ffffff', { tex: plinthTex, rough: 0.78, metal: 0.08 }),
      slab: pbr('#ffffff', { tex: stoneTex, rough: 0.84, metal: 0.06 }),
      totem: pbr('#ffffff', { tex: woodTex, rough: 0.68, metal: 0.04 }),
      obelisk: pbr('#ffffff', { tex: jadeTex, rough: 0.30, metal: 0.14 }),
      crown: pbr('#ffd44a', { tex: goldTex, rough: 0.25, metal: 0.88 }),
      tealGlow: pbr('#36f2c8', { glow: 1.15, rough: 0.3 }),
      amberGlow: pbr('#ff9f2e', { glow: 0.95, rough: 0.3 }),
      goldTrim: pbr('#e8b838', { rough: 0.3, metal: 0.85 }),
    };
  }

  function makePieceMesh(arch, mats, geos) {
    const grp = new Group();
    if (arch.kind === 'slab') {
      const body = new Mesh(geos.slab, mats.slab);
      const inlay = new Mesh(geos.slabBand, mats.tealGlow);
      grp.add(body, inlay);
    } else if (arch.kind === 'totem') {
      const body = new Mesh(geos.totem, mats.totem);
      const brow = new Mesh(geos.totemBrow, mats.goldTrim);
      brow.position.set(0, 0.055, 0);
      const eyeL = new Mesh(geos.totemEye, mats.tealGlow);
      eyeL.position.set(-0.09, 0.015, 0.212);
      const eyeR = new Mesh(geos.totemEye, mats.tealGlow);
      eyeR.position.set(0.09, 0.015, 0.212);
      const eyeLB = new Mesh(geos.totemEye, mats.tealGlow);
      eyeLB.position.set(-0.09, 0.015, -0.212);
      const eyeRB = new Mesh(geos.totemEye, mats.tealGlow);
      eyeRB.position.set(0.09, 0.015, -0.212);
      grp.add(body, brow, eyeL, eyeR, eyeLB, eyeRB);
    } else if (arch.kind === 'obelisk') {
      const body = new Mesh(geos.obelisk, mats.obelisk);
      const ringTop = new Mesh(geos.obeliskBand, mats.amberGlow);
      ringTop.position.y = 0.07;
      const ringBot = new Mesh(geos.obeliskBand, mats.amberGlow);
      ringBot.position.y = -0.07;
      grp.add(body, ringTop, ringBot);
    } else {
      // Crown: stepped two-tier box whose total vertical span is exactly [-0.11, +0.11] (h = 0.22)
      const base = new Mesh(geos.crownBase, mats.crown);
      base.position.y = -0.04;
      const crest = new Mesh(geos.crownTop, mats.crown);
      crest.position.y = 0.07;
      const gemF = new Mesh(geos.crownGem, mats.tealGlow);
      gemF.position.set(0, -0.04, 0.172);
      const gemB = new Mesh(geos.crownGem, mats.tealGlow);
      gemB.position.set(0, -0.04, -0.172);
      const gemL = new Mesh(geos.crownGem, mats.tealGlow);
      gemL.position.set(-0.172, -0.04, 0);
      const gemR = new Mesh(geos.crownGem, mats.tealGlow);
      gemR.position.set(0.172, -0.04, 0);
      grp.add(base, crest, gemF, gemB, gemL, gemR);
    }
    grp.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    grp.visible = false;
    v.scene.add(grp);
    return grp;
  }

  function handleHit(a, b, speed) {
    if (speed < 0.35 || t - lastHitSfx < 0.08) return;
    lastHitSfx = t;
    const block = a.tag === 'block' ? a : (b.tag === 'block' ? b : null);
    const snd = block?.sound || 'stone';
    const vol = clamp(speed * 0.018, 0.015, 0.07);
    if (snd === 'wood') {
      tone(220 + Math.random() * 40, { len: 0.07, wave: 'triangle', vol, slide: -80 });
      noise(0.04, { vol: vol * 0.6, from: 900, to: 300, filter: 'bandpass' });
    } else if (snd === 'metal') {
      tone(680 + Math.random() * 60, { len: 0.16, wave: 'sine', vol: vol * 0.9, slide: -30 });
      tone(1020, { len: 0.11, wave: 'triangle', vol: vol * 0.4 });
    } else {
      tone(130 + Math.random() * 25, { len: 0.08, wave: 'triangle', vol, slide: -55 });
      noise(0.05, { vol: vol * 0.7, from: 600, to: 160, filter: 'lowpass' });
    }
    if (speed > 1.0) haptic('tick');
  }

  function setup() {
    v = new ARView();
    world = new World3D({ gravity: -9.8, smooth: true });
    floorBody = world.floor(FLOOR, { friction: 0.9, bounce: 0.03, tag: 'floor', sound: 'stone' });

    const mats = buildMaterials();

    // Carved stone plinth pedestal at (0, FLOOR + 0.08, -2.0)
    plinthMesh = new Group();
    const pMain = new Mesh(rbox(PLINTH_W, PLINTH_H, PLINTH_W, 0.02), mats.plinth);
    const pFoot = new Mesh(rbox(PLINTH_W + 0.1, 0.045, PLINTH_W + 0.1, 0.012), mats.plinth);
    pFoot.position.y = -0.057;
    const pRing = new Mesh(new RingGeometry(0.13, 0.165, 32), mats.tealGlow);
    pRing.rotation.x = -Math.PI / 2;
    pRing.position.y = PLINTH_H * 0.5 + 0.002;
    const pFrame = new Mesh(new RingGeometry(0.27, 0.295, 4), mats.amberGlow);
    pFrame.rotation.x = -Math.PI / 2;
    pFrame.rotation.z = Math.PI / 4;
    pFrame.position.y = PLINTH_H * 0.5 + 0.002;
    plinthMesh.add(pMain, pFoot, pRing, pFrame);
    plinthMesh.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    plinthMesh.position.set(PLINTH_X, FLOOR + PLINTH_H * 0.5, PLINTH_Z);
    v.scene.add(plinthMesh);
    plinthBody = world.box(plinthMesh, PLINTH_W, PLINTH_H, PLINTH_W, {
      fixed: true,
      friction: 0.88,
      bounce: 0.03,
      tag: 'plinth',
      sound: 'stone',
    });

    // Shared geometries created ONCE in setup()
    const geos = {
      slab: rbox(0.55, 0.16, 0.55, 0.015),
      slabBand: rbox(0.558, 0.036, 0.558, 0.006),
      totem: rbox(0.42, 0.24, 0.42, 0.015),
      totemBrow: rbox(0.43, 0.036, 0.43, 0.008),
      totemEye: new BoxGeometry(0.065, 0.045, 0.014),
      obelisk: rbox(0.28, 0.30, 0.28, 0.015),
      obeliskBand: rbox(0.288, 0.032, 0.288, 0.006),
      crownBase: rbox(0.34, 0.14, 0.34, 0.012),
      crownTop: rbox(0.24, 0.08, 0.24, 0.01),
      crownGem: new BoxGeometry(0.06, 0.05, 0.014),
    };

    // Pre-allocate POOL = 18 carved block meshes
    pool = [];
    for (const arch of ARCHETYPES) {
      for (let i = 0; i < arch.count; i++) {
        const mesh = makePieceMesh(arch, mats, geos);
        pool.push({
          kind: arch.kind,
          w: arch.w,
          h: arch.h,
          d: arch.d,
          density: arch.density,
          sound: arch.sound,
          pts: arch.pts,
          mesh,
          body: null,
          active: false,
          scored: false,
          fallen: false,
          countedFall: false,
          settleT: 0,
          reclaimT: 0,
          refX: PLINTH_X,
          refZ: PLINTH_Z,
        });
      }
    }

    // Glowing drop-beam laser and landing reticle (reused every frame)
    beamMat = pbr('#40ffd0', { glow: 1.6, transparent: true, opacity: 0.45, depthWrite: false });
    beam = new Mesh(new CylinderGeometry(0.006, 0.006, 1, 8), beamMat);
    beam.visible = false;
    v.scene.add(beam);

    reticleMat = pbr('#40ffd0', { glow: 1.8, transparent: true, opacity: 0.85, depthWrite: false });
    reticle = new Group();
    const rRing = new Mesh(new RingGeometry(0.095, 0.13, 28), reticleMat);
    rRing.rotation.x = -Math.PI / 2;
    const rDot = new Mesh(new CircleGeometry(0.024, 16), reticleMat);
    rDot.rotation.x = -Math.PI / 2;
    reticle.add(rRing, rDot);
    reticle.visible = false;
    v.scene.add(reticle);

    sparks = new Particles(v, { max: 140, additive: true });
    world.onHit(handleHit);
  }

  function say(txt, col = '#ffffff', dur = 1.2) {
    msg = { txt, col };
    msgT = dur;
  }

  function releasePoolItem(p) {
    if (p.body) {
      world.remove(p.body);
      p.body = null;
    }
    p.mesh.visible = false;
    p.active = false;
    p.scored = false;
    p.fallen = false;
    p.countedFall = false;
    p.settleT = 0;
    p.reclaimT = 0;
  }

  function pickPiece(desiredKind) {
    for (const p of pool) {
      if (!p.active && p.kind === desiredKind) return p;
    }
    for (const p of pool) {
      if (!p.active) return p;
    }
    // Reclaim oldest fallen block if pool is full
    for (let i = 0; i < dropped.length; i++) {
      if (dropped[i].fallen) {
        const old = dropped.splice(i, 1)[0];
        releasePoolItem(old);
        return old;
      }
    }
    return null;
  }

  function desiredKindFor(idx) {
    if (idx === 0) return 'slab';
    if (idx % 4 === 3) return 'crown';
    const cycle = idx % 3;
    return cycle === 0 ? 'slab' : cycle === 1 ? 'totem' : 'obelisk';
  }

  function spawnNext() {
    if (ended || active) return;
    const p = pickPiece(desiredKindFor(spawnCount));
    if (!p) return;

    p.active = true;
    p.scored = false;
    p.fallen = false;
    p.countedFall = false;
    p.settleT = 0;
    p.reclaimT = 0;
    p.mesh.visible = true;
    p.mesh.rotation.set(0, (spawnCount % 4) * (Math.PI * 0.5), 0);

    // Start each piece noticeably off-center so doing nothing or mashing one spot fails
    const angle = spawnCount * 2.39996 + (Math.random() - 0.5) * 0.6;
    const dist = spawnCount === 0 ? 0.30 : 0.32 + Math.min(0.14, spawnCount * 0.015);
    aimX = clamp(refX + Math.cos(angle) * dist, PLINTH_X - 0.65, PLINTH_X + 0.65);
    aimZ = clamp(refZ + Math.sin(angle) * dist, PLINTH_Z - 0.65, PLINTH_Z + 0.65);
    swayPhase = Math.random() * Math.PI * 2;
    fuse = K.fuse;
    lastTickSec = Math.ceil(fuse);
    spawnCount++;
    active = p;
    updateHoverTransform(true);
  }

  function updateHoverTransform(initial) {
    if (!active) return;
    const amp = initial || !ready.playing ? 0 : K.swayAmp * (1 + Math.min(0.55, score / 250));
    const spd = K.swaySpeed * (1 + Math.min(0.45, score / 300));
    const swX = Math.sin(t * spd + swayPhase) * amp;
    const swZ = Math.cos(t * spd * 0.73 + swayPhase) * amp * 0.62;

    hx = clamp(aimX + swX, PLINTH_X - 0.75, PLINTH_X + 0.75);
    hz = clamp(aimZ + swZ, PLINTH_Z - 0.75, PLINTH_Z + 0.75);
    hy = Math.max(FLOOR + 1.45, towerTopY + 0.85);
    active.mesh.position.set(hx, hy + Math.sin(t * 4) * 0.012, hz);

    // Cast drop-beam straight down onto plinth / tower / floor
    _rayFrom.x = hx;
    _rayFrom.y = hy - active.h * 0.5 - 0.01;
    _rayFrom.z = hz;
    const hit = world.ray(_rayFrom, _rayDir, 6);
    if (hit) {
      const len = Math.max(0.04, _rayFrom.y - hit.point.y);
      beam.visible = true;
      beam.position.set(hx, hit.point.y + len * 0.5, hz);
      beam.scale.set(1, len, 1);

      reticle.visible = true;
      reticle.position.set(hx, hit.point.y + 0.005, hz);
      const pulse = 1 + Math.sin(t * 7) * 0.08;
      reticle.scale.set(pulse, 1, pulse);

      const onTower = hit.thing && (hit.thing.tag === 'plinth' || hit.thing.tag === 'block');
      const err = Math.hypot(hx - refX, hz - refZ);
      if (!onTower) {
        aimState = 'off';
        beamMat.color.copy(_colRed);
        beamMat.emissive.copy(_colRed);
        reticleMat.color.copy(_colRed);
        reticleMat.emissive.copy(_colRed);
      } else if (err < 0.12) {
        aimState = 'center';
        beamMat.color.copy(_colTeal);
        beamMat.emissive.copy(_colTeal);
        reticleMat.color.copy(_colTeal);
        reticleMat.emissive.copy(_colTeal);
      } else {
        aimState = 'edge';
        beamMat.color.copy(_colAmber);
        beamMat.emissive.copy(_colAmber);
        reticleMat.color.copy(_colAmber);
        reticleMat.emissive.copy(_colAmber);
      }
    } else {
      beam.visible = false;
      reticle.visible = false;
      aimState = 'off';
    }
  }

  function dropActive(autoDrop = false) {
    if (!active || ended || dropCooldown > 0) return;
    const p = active;
    active = null;
    beam.visible = false;
    reticle.visible = false;

    p.mesh.position.set(hx, hy, hz);
    p.body = world.box(p.mesh, p.w, p.h, p.d, {
      friction: 0.9,
      bounce: 0.03,
      density: p.density,
      drag: 0.06,
      spinDrag: 0.35,
      tag: 'block',
      sound: p.sound,
    });
    p.refX = refX;
    p.refZ = refZ;
    p.scored = false;
    p.fallen = false;
    p.countedFall = false;
    p.settleT = 0;
    p.reclaimT = 0;
    dropped.push(p);
    dropCooldown = 0.32;

    haptic('light');
    sfx(autoDrop ? 210 : 340, 0.09, 'triangle', 0.04, -140);
  }

  function recomputeTowerTop() {
    let topY = FLOOR + PLINTH_H;
    let rx = PLINTH_X, rz = PLINTH_Z;
    for (const b of dropped) {
      if (!b.fallen && b.scored && b.body) {
        const p = b.body.pos;
        const tY = p.y + b.h * 0.5;
        if (tY > topY) {
          topY = tY;
          rx = p.x;
          rz = p.z;
        }
      }
    }
    towerTopY = topY;
    refX = rx;
    refZ = rz;
  }

  function steerAim(dx, dy) {
    if (!v || !active || !ready.playing || ended) return;
    v.forward(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();
    const rx = -_fwd.z, rz = _fwd.x;
    const s = K.aimSpeed;
    aimX += (rx * dx - _fwd.x * dy) * s;
    aimZ += (rz * dx - _fwd.z * dy) * s;
    aimX = clamp(aimX, PLINTH_X - 0.68, PLINTH_X + 0.68);
    aimZ = clamp(aimZ, PLINTH_Z - 0.68, PLINTH_Z + 0.68);
  }

  const g = new Gestures({
    tap: () => {
      if (!ready.playing || ended) return;
      if (active && dropCooldown <= 0) dropActive(false);
    },
    drag: (x, y, dx, dy) => {
      steerAim(dx, dy);
    },
  });

  const self = {
    reset() {
      if (!v) setup();
      v.off();
      v.recenter();
      floorBody.place(0, FLOOR, 0);
      plinthMesh.position.set(PLINTH_X, FLOOR + PLINTH_H * 0.5, PLINTH_Z);
      plinthBody.place(PLINTH_X, FLOOR + PLINTH_H * 0.5, PLINTH_Z);
      _ptrTarget.set(PLINTH_X, FLOOR + 0.4, PLINTH_Z);

      for (const p of pool) releasePoolItem(p);
      dropped = [];
      active = null;
      beam.visible = false;
      reticle.visible = false;

      score = 0;
      falls = 0;
      streak = 0;
      won = false;
      ended = false;
      t = 0;
      spawnCount = 0;
      dropCooldown = 0;
      lastHitSfx = -1;
      towerTopY = FLOOR + PLINTH_H;
      refX = PLINTH_X;
      refZ = PLINTH_Z;
      aimState = 'edge';
      msg = null;
      msgT = 0;

      if (!v.sensor) v.pitch = -0.26;
      sparks.clear();
      feel.clear();
      ready.reset();
      g.release();
      keys.clear();

      spawnNext();
    },

    resize(w, h) {
      W = w;
      H = h;
    },

    update(dt) {
      if (!v) return;
      v.live();
      if (v.calibrating) return;

      feel.update(dt);
      if (feel.frozen) return;
      sparks.update(dt);
      if (msgT > 0) msgT -= dt;
      if (!ready.update(dt)) {
        updateHoverTransform(true);
        return;
      }
      if (ended) return;

      t += dt;
      if (dropCooldown > 0) {
        dropCooldown -= dt;
        if (dropCooldown <= 0 && !active) spawnNext();
      }

      // Keyboard steering support for desktop testing
      const ax = keys.axis();
      if ((ax.x !== 0 || ax.y !== 0) && active) {
        aimX = clamp(aimX + ax.x * 1.1 * dt, PLINTH_X - 0.68, PLINTH_X + 0.68);
        aimZ = clamp(aimZ + ax.y * 1.1 * dt, PLINTH_Z - 0.68, PLINTH_Z + 0.68);
      }

      // Gently follow taller towers on desktop (no gyro)
      if (!v.sensor) {
        const targetPitch = clamp(Math.atan2((towerTopY + 0.35) - (FLOOR + (v.eyeH || 1.3)), 2.0), -0.45, 0.32);
        v.pitch += (targetPitch - v.pitch) * Math.min(1, dt * 3);
      }

      if (active) {
        fuse -= dt;
        const sec = Math.ceil(fuse);
        if (sec !== lastTickSec && sec <= 3 && sec > 0) {
          lastTickSec = sec;
          sfx(920, 0.03, 'triangle', 0.025);
        }
        updateHoverTransform(false);
        if (fuse <= 0) dropActive(true);
      }

      world.step(dt);

      // Evaluate dropped blocks for settling or falling off the plinth
      for (let i = dropped.length - 1; i >= 0; i--) {
        const b = dropped[i];
        if (!b.body) continue;
        const pos = b.body.pos;

        if (!b.fallen) {
          const distFromPlinth = Math.hypot(pos.x - PLINTH_X, pos.z - PLINTH_Z);
          if (pos.y < FLOOR + PLINTH_H - 0.02 || distFromPlinth > 0.78) {
            b.fallen = true;
            if (!b.countedFall) {
              b.countedFall = true;
              falls++;
              streak = 0;
              feel.hurt(W * 0.5, H * 0.55);
              say('BLOCK FELL!', '#ff4d6d', 1.2);
              recomputeTowerTop();
              if (falls >= K.lives && !ended) {
                ended = true;
                v.off();
                feel.lose();
                api.over();
                return;
              }
            }
          } else if (!b.scored) {
            const spd = b.body.speed;
            const sp = b.body.spin;
            const angSpd = Math.hypot(sp.x, sp.y, sp.z);
            if ((spd < 0.065 && angSpd < 0.14) || b.body.sleeping) {
              b.settleT += dt;
              if (b.settleT >= K.settleTime) {
                b.scored = true;
                const err = Math.hypot(pos.x - b.refX, pos.z - b.refZ);
                const prec = clamp(1 - err / 0.22, 0, 1);
                const alignBonus = Math.round(prec * 15);
                const pts = b.pts + alignBonus;
                score += pts;
                streak++;
                api.score(score);

                recomputeTowerTop();

                const [sx, sy, sz] = v.toScreen(pos.x, pos.y, pos.z);
                const px = sz < 1 ? clamp(sx, 36, W - 36) : W * 0.5;
                const py = sz < 1 ? clamp(sy, 70, H - 90) : H * 0.45;
                if (prec >= 0.78 || b.kind === 'crown') {
                  feel.coin(px, py, { color: '#ffd23f', pitch: 1.15 + Math.min(0.4, streak * 0.04) });
                  sounds.perfect?.();
                  say(b.kind === 'crown' ? `CROWN +${pts}` : `PERFECT! +${pts}`, '#ffd23f', 1.1);
                } else {
                  feel.coin(px, py, { color: '#40ffd0', pitch: 0.95 + Math.min(0.35, streak * 0.04) });
                  say(`STACKED +${pts}`, '#8affdc', 0.9);
                }

                _sparkCol[0] = b.kind === 'crown' ? 1.0 : 0.3;
                _sparkCol[1] = b.kind === 'crown' ? 0.85 : 1.0;
                _sparkCol[2] = b.kind === 'crown' ? 0.2 : 0.8;
                for (let k = 0; k < 20; k++) {
                  sparks.emit({
                    x: pos.x,
                    y: pos.y,
                    z: pos.z,
                    vx: (Math.random() - 0.5) * 1.1,
                    vy: 0.5 + Math.random() * 1.1,
                    vz: (Math.random() - 0.5) * 1.1,
                    life: 0.65,
                    size: 0.022,
                    col: _sparkCol,
                    drag: 1.8,
                    grav: 2.6,
                    floor: FLOOR,
                  });
                }

                if (!won && score >= GOAL) {
                  won = true;
                  feel.win(W * 0.5, H * 0.4);
                  say('GOAL 150! KEEP GOING', '#ffd23f', 1.8);
                  api.win();
                }
              }
            } else {
              b.settleT = Math.max(0, b.settleT - dt * 2);
            }
          }
        } else {
          b.reclaimT += dt;
          if (b.reclaimT > 1.8) {
            releasePoolItem(b);
            dropped.splice(i, 1);
          }
        }
      }
    },

    fx(dt) {
      if (v) sparks.update(dt);
      feel.update(dt);
    },

    draw(c) {
      if (!v) { setup(); self.reset(); }
      v.look(1 / 60);
      v.draw(c, W, H);
      v.pointers(c, W, H, _ptrArr);
      feel.begin(c);
      feel.end(c, W, H);

      // HUD kept well outside api.scoreArea() (top-center/right)
      c.save();
      c.fillStyle = '#071118cc';
      c.beginPath();
      c.roundRect(12, 12, 114, 42, 10);
      c.fill();

      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.font = '700 9px Rubik, sans-serif';
      c.fillStyle = '#8affdc';
      const heightCm = Math.max(0, Math.round((towerTopY - (FLOOR + PLINTH_H)) * 100));
      c.fillText(`TOWER ${heightCm} CM`, 22, 24);

      const maxLives = K.lives;
      const leftLives = Math.max(0, maxLives - falls);
      for (let i = 0; i < maxLives; i++) {
        const bx = 22 + i * 16;
        c.fillStyle = i < leftLives ? '#ffd23f' : '#ffffff26';
        c.fillRect(bx, 33, 11, 12);
        if (i < leftLives) {
          c.fillStyle = '#071118';
          c.fillRect(bx + 2, 36, 2, 2);
          c.fillRect(bx + 7, 36, 2, 2);
        }
      }

      if (ready.playing && !ended && active) {
        const frac = clamp(fuse / K.fuse, 0, 1);
        const bw = 136, bh = 8;
        const bx = (W - bw) * 0.5, by = H - 62;
        c.fillStyle = '#071118cc';
        c.beginPath();
        c.roundRect(bx - 12, by - 22, bw + 24, 38, 12);
        c.fill();

        c.textAlign = 'center';
        c.font = '700 10px Rubik, sans-serif';
        c.fillStyle = aimState === 'center' ? '#40ffd0' : aimState === 'edge' ? '#ffc14a' : '#ff6b81';
        c.fillText(
          aimState === 'center' ? 'ALIGNED · TAP TO DROP' : aimState === 'edge' ? 'NEAR EDGE · DRAG TO AIM' : 'OFF PLINTH! DRAG BACK',
          W * 0.5,
          by - 10
        );

        c.fillStyle = '#ffffff25';
        c.beginPath();
        c.roundRect(bx, by, bw, bh, 4);
        c.fill();
        c.fillStyle = frac > 0.45 ? '#40ffd0' : frac > 0.25 ? '#ffc14a' : '#ff4d6d';
        c.beginPath();
        c.roundRect(bx, by, Math.max(4, bw * frac), bh, 4);
        c.fill();
      }

      if (msgT > 0 && msg) {
        c.textAlign = 'center';
        c.globalAlpha = Math.min(1, msgT * 2);
        c.font = '800 20px Rubik, sans-serif';
        c.lineWidth = 4;
        c.strokeStyle = '#000a';
        c.strokeText(msg.txt, W * 0.5, H * 0.24);
        c.fillStyle = msg.col;
        c.fillText(msg.txt, W * 0.5, H * 0.24);
        c.globalAlpha = 1;
      }

      c.restore();
      ready.draw(c, W, H);
      arNote(c, v, W, H);
    },

    down(x, y, id) {
      if (v?.input?.('down', x, y, id)) return;
      if (ready.go()) return;
      g.down(x, y, id);
    },
    move(x, y, p, id) {
      if (v?.input?.('move', x, y, id, p)) return;
      g.move(x, y, p, id);
    },
    up(x, y, id) {
      if (v?.input?.('up', x, y, id)) return;
      g.up(x, y, id);
    },
    key(k, isDown) {
      keys.key(k, isDown);
      if (!isDown) return;
      if (ready.go()) return;
      if ((k === ' ' || k === 'Enter') && active && dropCooldown <= 0) dropActive(false);
    },
  };

  return self;
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'totem-drop',
  title: 'Totem Drop',
  tag: 'AR · Physics',
  retro: true,
  era: 'ar',
  pal: 'grape',
  w: 300,
  h: 460,
  maxW: 600,
  maxH: 680,
  tick: 60,
  music: 'calm',
  goal: GOAL,
  hint: 'Drag to aim each swaying carved totem over the stone plinth, then tap to drop it before the fuse runs out. Stack blocks calmly to score; three fallen blocks end the round.',
  creator: 'Antigravity',
  make,
};
