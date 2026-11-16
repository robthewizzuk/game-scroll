// Lava Gate: Next Gen 3D molten-foundry diversion strategy game.
// Divert volcanic lava streams into the lit Forge Crucible while shielding the Center Crystal Vault.
import gs from '../gamescroll.js';

const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { Keys } = gs.controls;
const { Fluid } = gs.fluid;
const { icon } = gs.icons;
const { clamp } = gs.util;
const { HDView, Particles, pbr, rbox, sun, surface, speckle, THREE } = gs.hd;

let W = 300, H = 300;
const BOX = [-3.2, 0, -3.2, 3.2, 2.8, 3.2];

// Gate pose targets: CLOSED seals the side crucible channel; OPEN angles across the center chute to divert.
const GATE_CLOSED = { lx: -1.98, rx: 1.98, y: 1.30, z: 0.32, lyaw: 0.12, ryaw: -0.12 };
const GATE_OPEN = { lx: 0.02, rx: -0.02, y: 1.44, z: -0.22, lyaw: 0.46, ryaw: -0.46 };

const sstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// Sculpted foundry terrain heightfield: shared identically by fluid.ground() and the 3D floor mesh.
function groundHeight(x, z) {
  let y = z < 1.65
    ? 1.85 - 1.23 * clamp((z + 3.0) / 4.65, 0, 1)
    : 0.62 - 0.54 * sstep(1.65, 2.02, z);

  // Outer containment walls: narrow upper chute flaring into 3 wide lower channels.
  const flare = sstep(-0.85, 0.15, z);
  const halfW = 0.88 + 1.84 * flare;
  const ax = Math.abs(x);
  if (ax > halfW) y += 0.94 * sstep(halfW, halfW + 0.28, ax);

  // Backstop behind crater & front lip around crucible pits.
  if (z < -2.72) y += 0.96 * sstep(-2.72, -3.05, z);
  if (z > 2.82) y += 0.96 * sstep(2.82, 3.12, z);

  // Raised divider ridges separating Left, Center, and Right channels.
  if (z > -0.02) {
    const fadeZ = sstep(-0.02, 0.22, z);
    const rL = 1 - sstep(0.10, 0.28, Math.abs(x + 1.04));
    const rR = 1 - sstep(0.10, 0.28, Math.abs(x - 1.04));
    y += 0.88 * fadeZ * Math.max(rL, rR);
  }
  return y;
}

// Persistent 3D scene & fluid objects (built ONCE in setup(), reused cleanly every round).
let v, light, fluid, tap, sparks;
let gateSolidL, gateSolidR, drainL, drainC, drainR;
let gateMeshL, gateMeshR, stripMatL, stripMatR;
let matPoolL, matPoolR, ringBeaconL, ringBeaconR, beaconMatL, beaconMatR;
let vaultCrystal, vaultMat, shieldRings;

const _up = new THREE.Vector3(0, 1, 0);
const _qL = new THREE.Quaternion();
const _qR = new THREE.Quaternion();
const _colGold = new THREE.Color('#ffaa18');
const _colCool = new THREE.Color('#252734');
const _colWarn = new THREE.Color('#ff3222');
const _colCyan = new THREE.Color('#2be8ff');
const _colJam = new THREE.Color('#ff9a24');

const lamps = [
  { x: 0, y: 2.35, z: -2.55, col: '#ff5a18', i: 7, reach: 5.5, flick: 0.25 },
  { x: -1.95, y: 1.15, z: 2.35, col: '#ffb830', i: 7, reach: 4.8, flick: 0.08 },
  { x: 1.95, y: 1.15, z: 2.35, col: '#3a4258', i: 1.5, reach: 4.8, flick: 0 },
  { x: 0, y: 1.05, z: 2.35, col: '#38e8ff', i: 5, reach: 4.5, flick: 0.05 },
];

function setup() {
  v = new HDView({ bg: '#0c080e', fog: 0.032, env: 0.45, amb: 0.35 });
  v.wantFlashes();
  v.lampLights(12);
  // a forge: halation round the molten glow, grain, and heat-warm flare
  v.film = { halation: .5, grain: 1.5, fringe: .02, halationTint: [1, .4, .12] }; v.flare = { strength: .3, threshold: .5, dirt: .4, tint: [1, .75, .5] };
  light = sun('#ffe0bd', 2.4, 10, [-0.45, 1, 0.35]).softShadows(2);
  v.scene.add(light, light.target);
  v.onTier(T => light.setTier(T));

  // Procedural basalt and forged bronze textures (painted once in memory).
  const basaltTex = surface(256, ({ col, h, r, size: S }) => {
    col.fillStyle = '#2b2530';
    col.fillRect(0, 0, S, S);
    speckle(col, S, 900, '#18141c', 1.8, 0.35);
    speckle(col, S, 420, '#443c4d', 1.4, 0.22);
    h.fillStyle = '#888';
    h.fillRect(0, 0, S, S);
    h.fillStyle = '#555';
    for (let i = 0; i < S; i += 32) {
      h.fillRect(0, i, S, 2);
      if ((i / 32) % 2 === 0) h.fillRect(i, 0, 2, S);
    }
    r.fillStyle = '#c4c4c4';
    r.fillRect(0, 0, S, S);
    speckle(r, S, 500, '#787878', 2.2, 0.35);
  });

  const bronzeTex = surface(256, ({ col, h, r, m, size: S }) => {
    col.fillStyle = '#8d6238';
    col.fillRect(0, 0, S, S);
    speckle(col, S, 450, '#5a3b1e', 1.4, 0.28);
    col.fillStyle = '#b4824d';
    for (let i = 8; i < S; i += 64) col.fillRect(0, i, S, 3);
    h.fillStyle = '#808080';
    h.fillRect(0, 0, S, S);
    h.fillStyle = '#d0d0d0';
    for (let i = 16; i < S; i += 32) {
      h.beginPath(); h.arc(i, 16, 4, 0, Math.PI * 2); h.fill();
      h.beginPath(); h.arc(i, S - 16, 4, 0, Math.PI * 2); h.fill();
    }
    r.fillStyle = '#606060';
    r.fillRect(0, 0, S, S);
    m.fillStyle = '#d8d8d8';
    m.fillRect(0, 0, S, S);
  }, { metal: true });

  // Sculpted foundry terrain mesh matching groundHeight(x, z).
  const floorGeo = new THREE.PlaneGeometry(6.4, 6.4, 36, 36);
  floorGeo.rotateX(-Math.PI / 2);
  const posAttr = floorGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const px = posAttr.getX(i), pz = posAttr.getZ(i);
    posAttr.setY(i, groundHeight(px, pz));
  }
  floorGeo.computeVertexNormals();
  const basaltMat = pbr('#393240', { tex: basaltTex, rep: [3, 3], rough: 0.78, metal: 0.14 });
  const terrain = new THREE.Mesh(floorGeo, basaltMat);
  terrain.receiveShadow = true;
  v.scene.add(terrain);

  // Solid stone plinth beneath the foundry.
  const plinth = new THREE.Mesh(rbox(6.6, 0.6, 6.6, 0.12), pbr('#1c1822', { rough: 0.85, metal: 0.1 }));
  plinth.position.set(0, -0.26, 0);
  plinth.receiveShadow = true;
  v.scene.add(plinth);

  const bronzeMat = pbr('#b27f4c', { tex: bronzeTex, rep: [2, 1], rough: 0.34, metal: 0.85 });
  const darkIronMat = pbr('#2a2a34', { rough: 0.45, metal: 0.78 });

  // Divider wall blocks (visual + matching fluid solids).
  for (const sx of [-1.04, 1.04]) {
    const wall = new THREE.Mesh(rbox(0.36, 1.05, 1.78, 0.06), basaltMat);
    wall.position.set(sx, 0.96, 1.02);
    wall.castShadow = wall.receiveShadow = true;
    v.scene.add(wall);
    const cap = new THREE.Mesh(rbox(0.40, 0.08, 1.82, 0.02), bronzeMat);
    cap.position.set(sx, 1.50, 1.02);
    cap.castShadow = true;
    v.scene.add(cap);
  }

  // Volcano crater spout at upper chute.
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.66, 0.85, 18), darkIronMat);
  nozzle.position.set(0, 2.38, -2.68);
  nozzle.rotation.x = 0.42;
  nozzle.castShadow = true;
  v.scene.add(nozzle);

  const magmaCore = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.18, 16), pbr('#ff5812', { glow: 4.2, rough: 0.25 }));
  magmaCore.position.set(0, 2.28, -2.56);
  magmaCore.rotation.x = 0.42;
  v.scene.add(magmaCore);

  // Crucibles (Left & Right).
  const ringGeo = new THREE.TorusGeometry(0.75, 0.11, 10, 28);
  const poolGeo = new THREE.CylinderGeometry(0.68, 0.68, 0.08, 24);
  const beaconGeo = new THREE.TorusGeometry(0.56, 0.045, 8, 28);

  matPoolL = pbr('#ffaa18', { glow: 3.0, glowCol: '#ffaa18', rough: 0.35 });
  matPoolR = pbr('#252734', { glow: 0.2, glowCol: '#252734', rough: 0.45 });
  beaconMatL = pbr('#ffd15c', { glow: 3.6, glowCol: '#ffd15c', rough: 0.2 });
  beaconMatR = pbr('#343948', { glow: 0.2, glowCol: '#343948', rough: 0.4 });

  for (const [cx, pMat, bMat, isLeft] of [[-1.95, matPoolL, beaconMatL, true], [1.95, matPoolR, beaconMatR, false]]) {
    const collar = new THREE.Mesh(ringGeo, bronzeMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(cx, 0.22, 2.35);
    collar.castShadow = collar.receiveShadow = true;
    v.scene.add(collar);

    const pool = new THREE.Mesh(poolGeo, pMat);
    pool.position.set(cx, 0.12, 2.35);
    v.scene.add(pool);

    const bRing = new THREE.Mesh(beaconGeo, bMat);
    bRing.rotation.x = Math.PI / 2;
    bRing.position.set(cx, 0.85, 2.35);
    v.scene.add(bRing);
    if (isLeft) ringBeaconL = bRing; else ringBeaconR = bRing;
  }

  // Center Crystal Overpressure Vault.
  const vaultCollar = new THREE.Mesh(ringGeo, darkIronMat);
  vaultCollar.rotation.x = Math.PI / 2;
  vaultCollar.position.set(0, 0.22, 2.35);
  vaultCollar.castShadow = vaultCollar.receiveShadow = true;
  v.scene.add(vaultCollar);

  vaultMat = pbr('#2be8ff', { rough: 0.14, metal: 0.2, clear: 1, glow: 2.5, glowCol: '#2be8ff' });
  vaultCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), vaultMat);
  vaultCrystal.position.set(0, 0.66, 2.35);
  vaultCrystal.castShadow = true;
  v.scene.add(vaultCrystal);

  const shieldMat = pbr('#48f0ff', { rough: 0.2, metal: 0.4, glow: 2.2, glowCol: '#48f0ff' });
  shieldRings = [];
  for (let i = 0; i < 3; i++) {
    const sr = new THREE.Mesh(new THREE.TorusGeometry(0.50 + i * 0.08, 0.028, 8, 28), shieldMat);
    sr.position.set(0, 0.66, 2.35);
    sr.rotation.set(0.45 + i * 0.5, i * 0.7, 0.3);
    v.scene.add(sr);
    shieldRings.push(sr);
  }

  // Two movable bronze Sluice Gates.
  stripMatL = pbr('#5d6b7d', { glow: 0.4, glowCol: '#5d6b7d', rough: 0.25 });
  stripMatR = pbr('#5d6b7d', { glow: 0.4, glowCol: '#5d6b7d', rough: 0.25 });
  const gateGeo = rbox(1.90, 0.90, 0.26, 0.06);
  const stripGeo = rbox(1.80, 0.09, 0.14, 0.03);

  gateMeshL = new THREE.Group();
  const bladeL = new THREE.Mesh(gateGeo, bronzeMat);
  bladeL.castShadow = bladeL.receiveShadow = true;
  const stripL = new THREE.Mesh(stripGeo, stripMatL);
  stripL.position.y = 0.48;
  gateMeshL.add(bladeL, stripL);
  v.scene.add(gateMeshL);

  gateMeshR = new THREE.Group();
  const bladeR = new THREE.Mesh(gateGeo, bronzeMat);
  bladeR.castShadow = bladeR.receiveShadow = true;
  const stripR = new THREE.Mesh(stripGeo, stripMatR);
  stripR.position.y = 0.48;
  gateMeshR.add(bladeR, stripR);
  v.scene.add(gateMeshR);

  // Fluid simulation + solids + drains (all created ONCE).
  fluid = new Fluid(v, { box: BOX, volume: 3.6, kind: 'lava', shadows: false, drops: Fluid.max() > 3000 ? undefined : 175 });
  fluid.ground(groundHeight);
  tap = fluid.pour({ x: 0, y: 2.35, z: -2.55, dir: [0, -0.72, 0.69], rate: 0.95, speed: 3.1, spread: 0.08, r: 0.24, on: false });

  fluid.box({ x: -1.04, y: 0.96, z: 1.02, w: 0.34, h: 1.25, d: 1.78 });
  fluid.box({ x: 1.04, y: 0.96, z: 1.02, w: 0.34, h: 1.25, d: 1.78 });
  gateSolidL = fluid.box({ x: GATE_CLOSED.lx, y: GATE_CLOSED.y, z: GATE_CLOSED.z, w: 1.90, h: 0.90, d: 0.26 });
  gateSolidR = fluid.box({ x: GATE_CLOSED.rx, y: GATE_CLOSED.y, z: GATE_CLOSED.z, w: 1.90, h: 0.90, d: 0.26 });

  drainL = fluid.drain({ x: -1.95, y: 0.25, z: 2.35, r: 0.72 });
  drainC = fluid.drain({ x: 0.00, y: 0.25, z: 2.35, r: 0.72 });
  drainR = fluid.drain({ x: 1.95, y: 0.25, z: 2.35, r: 0.72 });

  sparks = new Particles(v, { max: 240, additive: true });
  applyCamera();
}

function applyCamera() {
  if (!v) return;
  const aspect = Math.max(0.55, W / Math.max(1, H));
  const pull = aspect < 1 ? 1 / Math.sqrt(aspect) : 1;
  v.cam.position.set(0, 7.4 * pull, 5.5 * pull);
  v.cam.lookAt(0, 0.62, 0.15);
}

const FORGE_LABELS = Array.from({ length: 101 }, (_, i) => `FORGE ${i}%`);
const _sparkOpts = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.6, size: 0.12, col: [0, 0, 0], drag: 1.6, grav: 7, floor: 0.08 };
const _shieldOn = { color: '#4ef0ff', outline: '#0c080e', width: 2, alpha: 1 };
const _shieldOff = { color: '#4a3038', outline: '#0c080e', width: 2, alpha: 0.55 };
const _flakeOn = { color: '#b4fbff', alpha: 1 };
const _flakeOff = { color: '#708496', alpha: 0.65 };
const _readyOpts = { text: 'Tap Left or Right to divert lava', size: 13, y: 60 };

function make(api) {
  const feel = new Feel();
  const ready = new Ready({ eat: true });
  const keys = new Keys();

  const K = gs.tweak('Feel', {
    pourRate: [0.95, 0.45, 1.8, 'base magma flow rate from the crater (units cubed per second)'],
    flowAccel: [0.55, 0.0, 1.4, 'extra magma flow rate added as you approach the goal'],
    gateSpeed: [5.5, 2.0, 12.0, 'how fast the bronze sluice gates slide open and shut'],
    batchVol: [0.68, 0.35, 1.2, 'lava needed to forge one gold ingot batch in a crucible'],
    quenchCool: [2.6, 1.0, 6.0, 'seconds between cryo-quench blasts'],
    quenchPush: [6.8, 2.5, 12.0, 'outward blast strength of the cryo-quench pulse'],
    vaultMax: [0.42, 0.2, 0.9, 'center lava capacity per shield before it shatters'],
  });

  const heldKeys = Object.create(null);
  let score, t, shields, wantL, wantR, slideL, slideR;
  let demand, batchesOnSide, sideTimer, switchWarn;
  let goodAcc, batchAcc, vaultHeat, wrongHeat, jamTime;
  let quenchCD, surgeTimer, surgeLeft;
  let vaultFlash, wrongFlash, warnMsg, warnT, dead;
  let lastL, lastC, lastR;

  function syncGates(snap) {
    const eL = sstep(0, 1, slideL), eR = sstep(0, 1, slideR);
    const lx = GATE_CLOSED.lx + (GATE_OPEN.lx - GATE_CLOSED.lx) * eL;
    const ly = GATE_CLOSED.y + (GATE_OPEN.y - GATE_CLOSED.y) * eL;
    const lz = GATE_CLOSED.z + (GATE_OPEN.z - GATE_CLOSED.z) * eL;
    const lyaw = GATE_CLOSED.lyaw + (GATE_OPEN.lyaw - GATE_CLOSED.lyaw) * eL;
    _qL.setFromAxisAngle(_up, lyaw);
    gateMeshL.position.set(lx, ly, lz);
    gateMeshL.quaternion.copy(_qL);
    gateSolidL.set(lx, ly, lz, _qL);

    const rx = GATE_CLOSED.rx + (GATE_OPEN.rx - GATE_CLOSED.rx) * eR;
    const ry = GATE_CLOSED.y + (GATE_OPEN.y - GATE_CLOSED.y) * eR;
    const rz = GATE_CLOSED.z + (GATE_OPEN.z - GATE_CLOSED.z) * eR;
    const ryaw = GATE_CLOSED.ryaw + (GATE_OPEN.ryaw - GATE_CLOSED.ryaw) * eR;
    _qR.setFromAxisAngle(_up, ryaw);
    gateMeshR.position.set(rx, ry, rz);
    gateMeshR.quaternion.copy(_qR);
    gateSolidR.set(rx, ry, rz, _qR);

    if (snap) {
      gateSolidL.set(lx, ly, lz, _qL);
      gateSolidR.set(rx, ry, rz, _qR);
    }
  }

  function emitSparks(wx, wy, wz, count, r, g, b, spd = 4.5) {
    _sparkOpts.col[0] = r;
    _sparkOpts.col[1] = g;
    _sparkOpts.col[2] = b;
    for (let i = 0; i < count; i++) {
      _sparkOpts.x = wx + (Math.random() - 0.5) * 0.35;
      _sparkOpts.y = wy;
      _sparkOpts.z = wz + (Math.random() - 0.5) * 0.35;
      _sparkOpts.vx = (Math.random() - 0.5) * spd;
      _sparkOpts.vy = 1.5 + Math.random() * spd;
      _sparkOpts.vz = (Math.random() - 0.5) * spd;
      _sparkOpts.life = 0.55 + Math.random() * 0.35;
      sparks.emit(_sparkOpts);
    }
  }

  function damageShield(wx, wy, wz, reason) {
    if (dead) return;
    shields--;
    warnMsg = reason;
    warnT = 1.3;
    vaultFlash = 1;
    v.hurt = 0.78;
    const [sx, sy] = v.toScreen(wx, wy, wz);
    feel.hurt(sx, sy);
    feel.juice.pop(sx, sy, reason, { color: '#ff6078' });
    v.flash(wx, wy, wz, { col: '#ff3050', i: 16, reach: 6, life: 0.38 });
    emitSparks(wx, wy, wz, 26, 0.8, 2.5, 3.2, 5.8);
    if (shields >= 0 && shields < 3) shieldRings[shields].visible = false;
    if (shields <= 0) {
      dead = true;
      tap.on = false;
      feel.lose();
      api.over();
    }
  }

  function triggerQuench() {
    if (!ready.playing || dead || quenchCD > 0) return;
    quenchCD = K.quenchCool;
    fluid.push(0, 0.95, -0.1, { radius: 1.9, strength: K.quenchPush, up: 2.3 });
    vaultHeat = Math.max(0, vaultHeat - K.vaultMax * 0.18);
    const [sx, sy] = v.toScreen(0, 1.2, -0.1);
    feel.powerup(sx, sy, { color: '#78f2ff', text: 'QUENCH!' });
    v.flash(0, 1.3, -0.1, { col: '#78f2ff', i: 14, reach: 5.5, life: 0.32 });
    emitSparks(0, 1.25, -0.1, 24, 1.4, 2.9, 3.4, 6.2);
  }

  function toggleGate(side) {
    if (!ready.playing || dead) return;
    if (side === 0) wantL = !wantL;
    else wantR = !wantR;
    feel.click();
  }

  function drawGatePill(c, gx, gy, gz, active, jam, lblDivert, lblShut, saBottom) {
    const scr = v.toScreen(gx, gy, gz);
    const sx = scr[0], sy = scr[1];
    if (sy > saBottom + 8 && sy < H - 14) {
      c.fillStyle = jam ? 'rgba(255, 110, 30, 0.92)' : (active ? 'rgba(255, 178, 42, 0.9)' : 'rgba(20, 18, 28, 0.78)');
      c.beginPath();
      c.roundRect(sx - 34, sy - 11, 68, 20, 6);
      c.fill();
      c.fillStyle = (active || jam) ? '#140c06' : '#c6cbd8';
      c.font = '700 10px Rubik, sans-serif';
      c.fillText(active ? lblDivert : lblShut, sx, sy - 0.5);
    }
  }

  function drawCruciblePill(c, cx, isDem, isNext) {
    const scr = v.toScreen(cx, 1.05, 2.35);
    const sx = scr[0], sy = scr[1];
    if (isDem) {
      const pct = clamp(Math.round((batchAcc / K.batchVol) * 100), 0, 100);
      c.fillStyle = 'rgba(18, 12, 8, 0.82)';
      c.beginPath();
      c.roundRect(sx - 36, sy - 12, 72, 22, 7);
      c.fill();
      c.strokeStyle = '#ffbe40';
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = '#ffe28a';
      c.font = '700 11px Rubik, sans-serif';
      c.fillText(FORGE_LABELS[pct], sx, sy - 0.5);
    } else if (isNext) {
      c.fillStyle = 'rgba(255, 190, 64, 0.92)';
      c.beginPath();
      c.roundRect(sx - 32, sy - 10, 64, 19, 6);
      c.fill();
      c.fillStyle = '#180d04';
      c.font = '700 10px Rubik, sans-serif';
      c.fillText('NEXT!', sx, sy - 0.5);
    } else {
      c.fillStyle = 'rgba(24, 24, 34, 0.72)';
      c.beginPath();
      c.roundRect(sx - 28, sy - 9, 56, 17, 5);
      c.fill();
      c.fillStyle = '#8b92a8';
      c.font = '600 9px Rubik, sans-serif';
      c.fillText('OFFLINE', sx, sy - 0.5);
    }
  }

  return {
    reset() {
      if (!v) setup();
      applyCamera();
      fluid.clear();
      sparks.clear();
      feel.clear();
      ready.reset();
      keys.clear();
      for (const k in heldKeys) delete heldKeys[k];

      tap.on = false;
      tap.rate = K.pourRate;

      score = 0;
      t = 0;
      shields = 3;
      wantL = false;
      wantR = false;
      slideL = 0;
      slideR = 0;
      demand = 0;
      batchesOnSide = 0;
      sideTimer = 0;
      switchWarn = 0;
      goodAcc = 0;
      batchAcc = 0;
      vaultHeat = 0;
      wrongHeat = 0;
      jamTime = 0;
      quenchCD = 0;
      surgeTimer = 8.5;
      surgeLeft = 0;
      vaultFlash = 0;
      wrongFlash = 0;
      warnMsg = '';
      warnT = 0;
      dead = false;

      lastL = drainL.amount;
      lastC = drainC.amount;
      lastR = drainR.amount;

      v.hurt = 0;
      for (let i = 0; i < 3; i++) shieldRings[i].visible = true;
      syncGates(true);
      // Warm fluid and sparks materials/shaders before play starts
      fluid.splash(0, 2.25, -2.56, { amount: 0.04, speed: 0, up: 0 });
      fluid.update(1 / 60);
      emitSparks(0, 2.28, -2.56, 2, 3.0, 1.3, 0.3, 1.0);
      sparks.update(1 / 60);
    },

    resize(w, h) {
      W = w;
      H = h;
      applyCamera();
    },

    fx(dt) {
      feel.update(dt);
      sparks.update(dt);
      v.hurt = Math.max(0, v.hurt - dt * 1.8);
    },

    update(dt) {
      feel.update(dt);
      v.hurt = Math.max(0, v.hurt - dt * 1.8);
      if (feel.frozen) return;

      t += dt;
      vaultCrystal.rotation.y += dt * 1.4;
      for (let i = 0; i < 3; i++) {
        shieldRings[i].rotation.y += dt * (1.2 + i * 0.45);
        shieldRings[i].rotation.x += dt * (0.4 - i * 0.25);
      }

      if (!ready.update(dt)) {
        if (Math.random() < 0.22) emitSparks(0, 2.35, -2.55, 1, 3.0, 1.3, 0.3, 1.5);
        sparks.update(dt);
        return;
      }

      if (dead) {
        sparks.update(dt);
        return;
      }

      // Ramp magma flow cleanly toward goal and handle occasional surges.
      const prog = clamp(score / 100, 0, 1);
      surgeTimer -= dt;
      if (surgeTimer <= 0) {
        surgeTimer = 10.5 - prog * 2.5;
        surgeLeft = 1.25;
        fluid.splash(0, 2.15, -2.4, { amount: 0.16, speed: 2.0, up: 0.6 });
        v.flash(0, 2.35, -2.55, { col: '#ff7020', i: 12, reach: 5, life: 0.35 });
      }
      if (surgeLeft > 0) surgeLeft = Math.max(0, surgeLeft - dt);
      tap.on = true;
      tap.rate = (K.pourRate + prog * K.flowAccel) * (surgeLeft > 0 ? 1.45 : 1);

      // Slide gates smoothly toward their targets (only update transforms/solids while moving).
      const gStep = K.gateSpeed * dt;
      const prevL = slideL, prevR = slideR;
      slideL = wantL ? Math.min(1, slideL + gStep) : Math.max(0, slideL - gStep);
      slideR = wantR ? Math.min(1, slideR + gStep) : Math.max(0, slideR - gStep);
      if (slideL !== prevL || slideR !== prevR) syncGates(false);

      // Step fluid physics.
      fluid.update(dt);
      sparks.update(dt);

      quenchCD = Math.max(0, quenchCD - dt);
      vaultFlash = Math.max(0, vaultFlash - dt * 2.4);
      wrongFlash = Math.max(0, wrongFlash - dt * 2.4);
      warnT = Math.max(0, warnT - dt);

      // Demand switching logic (alternates Left <-> Right every ~1-2 batches or ~9s).
      const switchLimit = 9.5 - prog * 2.0;
      sideTimer += dt;
      if (switchWarn > 0) {
        switchWarn -= dt;
        if (switchWarn <= 0) {
          demand = 1 - demand;
          batchesOnSide = 0;
          batchAcc = 0;
          sideTimer = 0;
          wrongHeat = 0;
          feel.click();
        }
      } else if (sideTimer >= switchLimit || batchesOnSide >= 2) {
        switchWarn = 1.35;
      }

      // Check drain increments without mutating readonly FluidDrain.amount.
      const dL = Math.max(0, drainL.amount - lastL);
      lastL = drainL.amount;
      const dC = Math.max(0, drainC.amount - lastC);
      lastC = drainC.amount;
      const dR = Math.max(0, drainR.amount - lastR);
      lastR = drainR.amount;

      const dGood = demand === 0 ? dL : dR;
      const dBadSide = demand === 0 ? dR : dL;

      if (dGood > 0) {
        goodAcc += dGood;
        batchAcc += dGood;
        const bx = demand === 0 ? -1.95 : 1.95;
        if (Math.random() < 0.45) emitSparks(bx, 0.35, 2.35, 2, 3.2, 2.0, 0.5, 2.8);
        while (goodAcc >= 0.065) {
          goodAcc -= 0.065;
          score++;
          api.score(score);
        }
        if (batchAcc >= K.batchVol) {
          batchAcc -= K.batchVol;
          score += 5;
          api.score(score);
          batchesOnSide++;
          const [sx, sy] = v.toScreen(bx, 0.9, 2.35);
          feel.coin(sx, sy, { color: '#ffd452', text: '+5 FORGED!', pitch: 1 + Math.min(0.6, score * 0.005) });
          v.flash(bx, 0.9, 2.35, { col: '#ffbe40', i: 14, reach: 5, life: 0.35 });
          emitSparks(bx, 0.45, 2.35, 22, 3.4, 2.3, 0.6, 5.2);
          if (batchesOnSide >= 2 && switchWarn <= 0) switchWarn = 1.35;
        }
      }

      if (dBadSide > 0) {
        wrongHeat += dBadSide;
        wrongFlash = Math.min(1, wrongFlash + dBadSide * 4);
        const badX = demand === 0 ? 1.95 : -1.95;
        if (Math.random() < 0.4) emitSparks(badX, 0.35, 2.35, 2, 3.0, 0.5, 0.3, 3.0);
        if (wrongHeat >= K.vaultMax * 1.15) {
          wrongHeat -= K.vaultMax * 1.15;
          damageShield(badX, 0.65, 2.35, 'WRONG CRUCIBLE!');
        }
      }

      if (dC > 0) {
        vaultHeat += dC;
        vaultFlash = Math.min(1, vaultFlash + dC * 4.5);
        if (Math.random() < 0.5) emitSparks(0, 0.55, 2.35, 2, 1.2, 2.4, 3.2, 3.4);
        if (vaultHeat >= K.vaultMax) {
          vaultHeat -= K.vaultMax;
          damageShield(0, 0.72, 2.35, 'VAULT BREACH!');
        }
      }

      // Prevent crossing both gates into an X-dam indefinitely.
      if (wantL && wantR) {
        jamTime += dt;
        if (jamTime >= 0.85) {
          jamTime -= 0.85;
          damageShield(0, 1.35, -0.2, 'GATE JAM!');
        }
      } else {
        jamTime = Math.max(0, jamTime - dt * 1.6);
      }
    },

    draw(c) {
      // Update dynamic crucible, gate strip, and vault colors + lamps in place.
      const pulse = 0.5 + 0.5 * Math.sin(t * 9);
      const leftActive = demand === 0;
      const nextFlip = switchWarn > 0 && ((t * 8 | 0) % 2 === 0);

      // Crucible pools & beacons.
      matPoolL.color.copy(leftActive ? _colGold : (wrongFlash > 0.2 ? _colWarn : _colCool));
      matPoolL.emissive.copy(matPoolL.color);
      matPoolL.emissiveIntensity = leftActive ? 2.6 + pulse * 0.9 : (wrongFlash > 0.2 ? 2.8 : 0.2);

      matPoolR.color.copy(!leftActive ? _colGold : (wrongFlash > 0.2 ? _colWarn : _colCool));
      matPoolR.emissive.copy(matPoolR.color);
      matPoolR.emissiveIntensity = !leftActive ? 2.6 + pulse * 0.9 : (wrongFlash > 0.2 ? 2.8 : 0.2);

      const bL = leftActive || (switchWarn > 0 && !leftActive && nextFlip);
      const bR = !leftActive || (switchWarn > 0 && leftActive && nextFlip);
      beaconMatL.emissive.copy(bL ? _colGold : _colCool);
      beaconMatL.emissiveIntensity = bL ? 3.2 + pulse * 0.8 : 0.15;
      beaconMatR.emissive.copy(bR ? _colGold : _colCool);
      beaconMatR.emissiveIntensity = bR ? 3.2 + pulse * 0.8 : 0.15;
      ringBeaconL.position.y = 0.82 + (bL ? Math.sin(t * 4) * 0.08 : -0.2);
      ringBeaconR.position.y = 0.82 + (bR ? Math.sin(t * 4) * 0.08 : -0.2);

      // Gate top status strips.
      const jam = wantL && wantR;
      stripMatL.emissive.copy(jam ? _colJam : (wantL ? _colGold : _colCool));
      stripMatL.emissiveIntensity = jam ? 3.2 : (wantL ? 2.4 : 0.4);
      stripMatR.emissive.copy(jam ? _colJam : (wantR ? _colGold : _colCool));
      stripMatR.emissiveIntensity = jam ? 3.2 : (wantR ? 2.4 : 0.4);

      // Center Vault crystal color.
      vaultMat.emissive.copy(vaultFlash > 0.2 ? _colWarn : _colCyan);
      vaultMat.emissiveIntensity = vaultFlash > 0.2 ? 3.8 : 2.3 + Math.sin(t * 3) * 0.4;

      // Update reusable lamp array.
      lamps[0].i = surgeLeft > 0 ? 11 : 6.5 + Math.sin(t * 8) * 1.2;
      lamps[1].col = leftActive ? '#ffb830' : (wrongFlash > 0.2 ? '#ff3222' : '#3a4258');
      lamps[1].i = leftActive ? 8 : (wrongFlash > 0.2 ? 7 : 1.5);
      lamps[2].col = !leftActive ? '#ffb830' : (wrongFlash > 0.2 ? '#ff3222' : '#3a4258');
      lamps[2].i = !leftActive ? 8 : (wrongFlash > 0.2 ? 7 : 1.5);
      lamps[3].col = vaultFlash > 0.2 ? '#ff3050' : '#38e8ff';
      lamps[3].i = vaultFlash > 0.2 ? 9 : 5;
      v.placeLamps(lamps, 0, 1, 0, t);

      feel.begin(c);
      v.render(c, W, H);
      feel.end(c, W, H);

      // HUD kept strictly outside api.scoreArea() (top-center).
      const sa = api.scoreArea();
      const padX = Math.max(10, W * 0.035);

      // Top-left: 3 Vault Shields.
      for (let i = 0; i < 3; i++) {
        const ix = padX + 13 + i * 24;
        const iy = 22;
        const intact = i < shields;
        icon(c, intact ? 'shield' : 'cracked-shield', ix, iy, 20, intact ? _shieldOn : _shieldOff);
      }

      // Top-right: Quench Blast button/cooldown pill.
      const qReady = quenchCD <= 0;
      const qx = W - padX - 24;
      const qy = 24;
      c.save();
      c.beginPath();
      c.arc(qx, qy, 17, 0, Math.PI * 2);
      c.fillStyle = qReady ? 'rgba(20, 48, 62, 0.85)' : 'rgba(22, 18, 28, 0.72)';
      c.fill();
      c.lineWidth = 2.5;
      c.strokeStyle = qReady ? '#62f2ff' : 'rgba(130, 160, 180, 0.35)';
      c.stroke();
      if (!qReady) {
        const frac = 1 - clamp(quenchCD / K.quenchCool, 0, 1);
        c.beginPath();
        c.arc(qx, qy, 17, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        c.strokeStyle = '#62f2ff';
        c.stroke();
      }
      icon(c, 'snowflake', qx, qy, 18, qReady ? _flakeOn : _flakeOff);
      c.restore();

      // World-anchored tags via v.toScreen().
      c.textAlign = 'center';
      c.textBaseline = 'middle';

      drawGatePill(c, gateMeshL.position.x, 2.0, gateMeshL.position.z, wantL, jam, 'L: DIVERT', 'L: SHUT', sa.bottom);
      drawGatePill(c, gateMeshR.position.x, 2.0, gateMeshR.position.z, wantR, jam, 'R: DIVERT', 'R: SHUT', sa.bottom);

      drawCruciblePill(c, -1.95, demand === 0, switchWarn > 0 && demand !== 0);
      drawCruciblePill(c, 1.95, demand === 1, switchWarn > 0 && demand !== 1);

      // Center Vault warning / jam alert.
      if (jam || warnT > 0 || vaultHeat > K.vaultMax * 0.35) {
        const msg = jam ? 'JAM! SHUT ONE GATE' : (warnT > 0 ? warnMsg : 'VAULT OVERHEATING!');
        const [vx, vy] = v.toScreen(0, 1.35, 2.1);
        const pillY = clamp(vy, sa.bottom + 24, H - 38);
        c.fillStyle = 'rgba(195, 30, 52, 0.9)';
        c.beginPath();
        c.roundRect(vx - 68, pillY - 11, 136, 22, 7);
        c.fill();
        c.fillStyle = '#ffffff';
        c.font = '700 11px Rubik, sans-serif';
        c.fillText(msg, vx, pillY);
      }

      // Subtle one-handed control reminder during opening seconds.
      if (ready.playing && t < 5 && !dead) {
        c.fillStyle = 'rgba(255, 255, 255, 0.72)';
        c.font = '600 11px Rubik, sans-serif';
        c.fillText('Tap Left / Right: toggle gate · Top: Quench', W / 2, H - 12);
      }

      _readyOpts.y = sa.bottom + 24;
      ready.draw(c, W, H, _readyOpts);
    },

    down(x, y) {
      if (ready.go()) return;
      if (y < H * 0.28) {
        triggerQuench();
      } else if (x < W * 0.5) {
        toggleGate(0);
      } else {
        toggleGate(1);
      }
    },

    move() {},
    up() {},

    key(k, isDown) {
      keys.key(k, isDown);
      if (!isDown) {
        heldKeys[k] = false;
        return;
      }
      if (heldKeys[k]) return;
      heldKeys[k] = true;
      if (ready.go()) return;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'q' || k === 'Q') toggleGate(0);
      else if (k === 'ArrowRight' || k === 'd' || k === 'D' || k === 'e' || k === 'E') toggleGate(1);
      else if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') triggerQuench();
      else if (k === 'ArrowDown' || k === 's' || k === 'S') {
        wantL = false;
        wantR = false;
      }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'lava-gate',
  title: 'Lava Gate',
  tag: 'Next Gen · Strategy',
  retro: true,
  era: 'nextgen',
  pal: 'grape',
  w: 300,
  h: 300,
  maxW: 540,
  maxH: 540,
  tick: 60,
  music: 'tense',
  goal: 100,
  hint: 'Tap Left or Right to divert molten lava into the lit Forge Crucible. Guard the Center Crystal Vault and tap the top to Quench surges.',
  creator: 'Antigravity',
  make,
};
