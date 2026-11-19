// Solis Bay: Next Gen 3D open-city crime action.
// Original 5-district coastal bay city (Coral Strip, Old Naranja, Glass Quarter, Pelican Marina, Sawgrass Edge).
// Leads: Mateo "Mako" Delgado & Nadia Vance — drive, drift, hijack, swim, boat, take cover, shoot with 3rd-person
// shoulder or 1st-person ADS + lock-on assist, fight rival crews, visit Solis Customs & Bayside Arms, tune 5 radio
// stations, and evade 5★ SBPD cars, boats, and choppers for 100 Rep.
import gs from '../gamescroll.js';

const { Feel } = gs.effects;
const { twoThumb, Keys } = gs.controls;
const { Radio, sounds, bed, noise, score: filmScore, Ears, mixer } = gs.sound;
const { icon } = gs.icons;
const { clamp } = gs.util;
const { rng } = gs.math;
const { Sky, Weather } = gs.sky;
const { Metro, Gps, Wanted, Interiors } = gs.city;
const { Car } = gs.vehicles;
const { Boat, Hover } = gs.craft;
const { Swimmer } = gs.climb;
const { arm, Pouch, Pickups, Health, DriveBy, Markers, Explosives, Shots, ARSENAL, weaponSound } = gs.combat;
const { Reputation } = gs.rpg;
const { Cover3D, TakeCover } = gs.tactics;
const { CameraRig, GunRig } = gs.camera;
const { World3D } = gs.physics3d;
const { Ground } = gs.outdoors;
const { Reactions } = gs.characters;
const { Impacts, Particles3D } = gs.fx3d;
const { WorldSave } = gs.missions;
const { vehicle, human, prop, weapon, material, wear } = gs.models;
const { HDView, pbr, sun, mark, THREE } = gs.hd;

let W = 300, H = 480;

/** @type {{ style: string; blocks: [number, number]; seed: number; name: string }[]} */
const DISTRICTS = [
  { style: 'beach', blocks: [3, 3], seed: 101, name: 'Coral Strip' },
  { style: 'oldtown', blocks: [3, 3], seed: 202, name: 'Old Naranja' },
  { style: 'downtown', blocks: [3, 3], seed: 303, name: 'Glass Quarter' },
  { style: 'marina', blocks: [3, 3], seed: 404, name: 'Pelican Marina' },
  { style: 'glades', blocks: [3, 3], seed: 505, name: 'Sawgrass Edge' },
];

// District plazas & waterfront landmarks (verified on seed 77 bay layout)
const YARD_X = 954.6;
const YARD_Z = -378.0;
const YARD_Y = 0.165;
const SLIP_POS = { x: 1099.06, y: 0, z: -439.19, heading: 0 };
const DOCK_POS = { x: 1095.86, y: 0.15, z: -439.19 };
const BEACH_LOT = { x: 1656.5, y: 0.15, z: -220.0 };
const BIKE_POS = { x: 1662.0, y: 0.15, z: -221.0 };         // Coral Strip beachfront lot
const HELI_POS = { x: YARD_X + 24.0, y: YARD_Y, z: YARD_Z - 2.0 }; // Pelican Marina quay helipad
const RESPRAY_POS = { x: -70.0, y: 0.15, z: 2.0 };      // Old Naranja Block 1 Plaza
const ARMS_POS = { x: 1504.0, y: 0.15, z: -296.0 };       // Coral Strip Block 1 Plaza

// District bounding centers & half-extents for smooth atmospheric blending
const GLADES_RECT = { x0: 255.3, x1: 525.2, z0: -133.5, z1: 133.5 };
const MARINA_RECT = { x0: 822.1, x1: 1081.3, z0: -423.2, z1: -167.8 };

const WEAPON_ORDER = /** @type {const} */ (['baton', 'pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'grenade', 'launcher']);
const WEAPON_COSTS = { baton: 0, pistol: 0, smg: 200, shotgun: 350, rifle: 600, sniper: 900, grenade: 450, launcher: 1200 };
const WEAPON_LABELS = { baton: 'BATON', pistol: 'PISTOL', smg: 'SMG', shotgun: 'SHOTGUN', rifle: 'RIFLE', sniper: 'SNIPER', grenade: 'GRENADE', launcher: 'RPG' };

const CUSTOMS_PAINTS = [
  { name: 'BAY TEAL', hex: '#16969a' },
  { name: 'CORAL FLAME', hex: '#ff5e57' },
  { name: 'SOLIS GOLD', hex: '#ffd32a' },
  { name: 'NEON VIOLET', hex: '#7d5fff' },
  { name: 'MIAMI MINT', hex: '#0be881' },
  { name: 'PEARL WHITE', hex: '#eef2f7' },
  { name: 'SUNSET ORANGE', hex: '#ff9f1a' },
  { name: 'MIDNIGHT', hex: '#262f3d' },
];

const CREWS = {
  pastel: { id: 'pastel', name: 'Pastel Crew' },
  flota: { id: 'flota', name: 'La Flota Roja' },
  salvage: { id: 'salvage', name: 'Sawgrass Salvage' },
};

function crewForDistrict(distName) {
  if (distName === 'Pelican Marina') return CREWS.flota;
  if (distName === 'Sawgrass Edge' || distName === 'Old Naranja') return CREWS.salvage;
  return CREWS.pastel;
}

/** @type {import('../gamescroll.js').RadioStation[]} */
const STATIONS = [
  { name: 'Coral FM', freq: '88.4', mood: 'happy', set: 'synth', voices: { lead: 'steelpan', pad: 'warm' }, tagline: 'Tropical electro & coast vibes', dj: { name: 'Sunny Vega', voice: 'woman' } },
  { name: 'Palma Gold', freq: '99.5', mood: 'heroic', set: 'orchestra', voices: { lead: 'brass' }, tagline: 'Classic cruiser anthems', dj: { name: 'Rico Sol', voice: 'man' } },
  { name: 'Sunset Soul', freq: '102.7', mood: 'calm', set: 'band', voices: { lead: 'epiano', pad: 'organ' }, tagline: 'Late-afternoon bay grooves', dj: { name: 'Tia Carmen', voice: 'woman' } },
  { name: 'Glades Bass', freq: '95.1', mood: 'tense', set: 'synth', voices: { bass: 'sub', lead: 'saw' }, tagline: 'Heavy low-end from the west', dj: { name: 'Big Cypress', voice: 'man' } },
  { name: 'Baybeat', freq: '107.3', mood: 'chase', set: 'synth', voices: { drums: '808' }, tagline: 'High-speed pursuit beats', dj: { name: 'DJ Mako', voice: 'man' } },
];

const JOBS = [
  {
    name: 'Palma Strip Heat',
    kind: 'vehicle',
    caller: 'TIA CARMEN',
    fromDistrict: 'Coral Strip',
    toDistrict: 'Old Naranja',
    call: 'Boost the Palma GT on Coral Strip and drop it in Old Naranja!',
    heat: 1,
    rep: 25,
    pay: 260,
  },
  {
    name: 'Escrow Shakedown',
    kind: 'interior',
    caller: 'NADIA',
    toDistrict: 'Old Naranja',
    call: 'Duck into the Old Naranja shop, grab the ledger, and shake 2★ SBPD!',
    heat: 2,
    rep: 25,
    pay: 320,
  },
  {
    name: 'Pelican Cut',
    kind: 'boat',
    caller: 'DOCKHAND',
    toDistrict: 'Pelican Marina',
    call: 'Take Flamingo 24 from Pelican slip and raid the Port Container Yard!',
    heat: 2,
    rep: 30,
    pay: 400,
  },
  {
    name: 'Neon Protection',
    kind: 'shootout',
    caller: 'NADIA',
    toDistrict: 'Glass Quarter',
    call: 'Push Glass Quarter — fight off rival crew & 3★ SBPD chopper sweep!',
    heat: 3,
    rep: 30,
    pay: 480,
  },
  {
    name: 'Sawgrass Extraction',
    kind: 'shootout',
    caller: 'MAKO',
    toDistrict: 'Sawgrass Edge',
    call: 'Hold Sawgrass Salvage off, swap leads or take the chopper to break 4★ SBPD!',
    heat: 4,
    rep: 40,
    pay: 650,
  },
];

/** @type {Parameters<typeof human>[0]} */
const MAKO_LOOK = {
  look: 'real',
  sex: 'm',
  age: 29,
  seed: 42,
  skin: '#c88c68',
  hair: '#1e1918',
  hairStyle: 'short',
  hairStrands: false,
  strands: false,
  body: '#1f6e74',
  legs: '#28303d',
  shoes: '#eceae4',
};

/** @type {Parameters<typeof human>[0]} */
const NADIA_LOOK = {
  look: 'real',
  sex: 'f',
  age: 27,
  seed: 91,
  skin: '#d9a484',
  hair: '#3b211a',
  hairStyle: 'long',
  hairStrands: false,
  strands: false,
  body: '#c85a3a',
  legs: '#232834',
  shoes: '#22242a',
};

/** @type {Parameters<typeof human>[0]} */
const GANG_LOOK = {
  look: 'real',
  sex: 'm',
  age: 32,
  seed: 73,
  skin: '#b87b56',
  hair: '#171516',
  hairStyle: 'short',
  hairStrands: false,
  strands: false,
  body: '#8c2832',
  legs: '#22252c',
  shoes: '#1a1a1d',
};

// Single calibrated base look — smoothly modulated per frame without calling v.look() mid-play
const BASE_LOOK = {
  sun: false,
  glare: 0.1,
  shafts: 0.06,
  bloom: 0.22,
  exposure: 0.98,
  beams: null,
  flare: { strength: 0.08, threshold: 1.5, dirt: 0.05, tint: [1, 0.92, 0.84] },
  film: { halation: 0.08, grain: 0.6, fringe: 0.005 },
  eye: { amount: 0.22, min: 0.88, max: 1.15, speed: 0.7 },
  air: { haze: 0.0009, colour: '#a9c4dc', sunColour: '#f4c698', mist: 0, wet: 0.12, macro: 0.55 },
  weather: { kind: 'rain', amount: 0, wet: 0.12, pools: 0 },
};

// Reusable scratch objects (zero per-frame allocations)
const camDirVec = new THREE.Vector3();
const camPosVec = new THREE.Vector3();
const shootTargetVec = new THREE.Vector3();
const tracerFromVec = new THREE.Vector3();
const tracerToVec = new THREE.Vector3();
const tracerMidVec = new THREE.Vector3();
const tracerDirVec = new THREE.Vector3();
const zForwardAxis = new THREE.Vector3(0, 0, 1);
const sunClrScratch = new THREE.Color('#ffd9a8');
const moonClrScratch = new THREE.Color('#88a8dc');
const hemiSkyDay = new THREE.Color('#9bc4ee');
const hemiSkyNight = new THREE.Color('#2d3f68');
const hemiGndDay = new THREE.Color('#5a5148');
const hemiGndNight = new THREE.Color('#181f2c');
const airColDay = new THREE.Color('#a9c4dc');
const airColDusk = new THREE.Color('#c89c88');
const airColNight = new THREE.Color('#25334f');
const airSunDay = new THREE.Color('#f4c698');
const airSunDusk = new THREE.Color('#ff9d6c');
const airSunNight = new THREE.Color('#425b84');
const airScratch = {
  haze: 0.0009,
  mist: 0,
  wet: 0.12,
  macro: 0.55,
  colour: new THREE.Color('#a9c4dc'),
  sunColour: new THREE.Color('#f4c698'),
};

const aimOrigin = { x: 0, y: 0, z: 0 };
const aimDirObj = { x: 0, y: 0, z: -1 };
const aheadPt = { x: 0, z: 0 };
const playerQuery = { x: 0, z: 0, y: 0, heading: 0, v: 0, car: false, boat: false, swim: false };
const avoidQuery = { x: 0, z: 0, vx: 0, vz: 0 };
const rigTarget = { position: new THREE.Vector3(), yaw: 0, grounded: true };
const coverMoveVec = { x: 0, z: 0 };
const boatInput = { throttle: 0, steer: 0 };
const carInput = { throttle: 0, steer: 0, brake: false, drift: false };
const engOpts = { from: 110, vol: 0 };
const hideInput = { move: coverMoveVec, aim: false, blind: false };
const swimInput = { move: coverMoveVec, up: false, down: false, fast: false };
const swimPlayOpts = { at: 0 };
const hidePlayOpts = { fade: 0.1 };
const rigUpdOpts = { speed: 0, aim: 0 };
const BLEND_OPTS = { idle: 0, walk: 1.8, run: 4.5 };
const BUMP_OPTS = { keep: 0.45 };
const COVER_UPD_OPTS = { reach: 12 };
const LIGHT_FIT_OPTS = { far: 170, tall: 60, near: 28 };
const MINI_OPTS = { range: 165 };
const ICON_RAD_ON = { color: '#ffb24a' };
const ICON_RAD_OFF = { color: '#9aa4b8' };
const INDOOR_PLACE = { tail: 0.55, wet: 0.22, echo: 0.1, delay: 0.06 };
const exitCand = { x: 0, y: 0, z: 0, heading: 0 };
const mapPtScratch = [0, 0];
const barrelBoomHit = { point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), mesh: null };
const wieldOpts = { how: 'ready', pitch: 0, yaw: 0, hands: true, keep: true };
const gangWieldOpts = { how: 'ready', pitch: 0, yaw: 0, hands: false, keep: false };
const GUN_KEYS = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'launcher'];

const tmpBox = new THREE.Box3();
const tmpSize = new THREE.Vector3();
const tmpCenter = new THREE.Vector3();
const _hitPt = new THREE.Vector3();
const _hitNrm = new THREE.Vector3();
const _pushVec = { x: 0, y: 0, z: 0 };

function firstMesh(obj) {
  if (!obj) return null;
  if (obj.isMesh) return obj;
  let found = null;
  obj.traverse?.(c => {
    if (!found && c.isMesh) found = c;
  });
  return found;
}

function addYardStaticCollider(group, list) {
  group.updateMatrixWorld(true);
  tmpBox.setFromObject(group);
  if (tmpBox.isEmpty()) return;
  tmpBox.getSize(tmpSize);
  tmpBox.getCenter(tmpCenter);
  list.push({
    box: [Math.max(0.4, tmpSize.x), Math.max(0.5, tmpSize.y), Math.max(0.4, tmpSize.z)],
    at: { x: tmpCenter.x, y: tmpCenter.y, z: tmpCenter.z },
  });
}

function rectProximity(rect, x, z, falloff = 160) {
  const dx = x < rect.x0 ? rect.x0 - x : x > rect.x1 ? x - rect.x1 : 0;
  const dz = z < rect.z0 ? rect.z0 - z : z > rect.z1 ? z - rect.z1 : 0;
  const d = Math.hypot(dx, dz);
  if (d >= falloff) return 0;
  const u = 1 - d / falloff;
  return u * u * (3 - 2 * u);
}

function smoothWindow(val, a, b, c, d) {
  if (val <= a || val >= d) return 0;
  if (val < b) { const u = (val - a) / (b - a); return u * u * (3 - 2 * u); }
  if (val > c) { const u = (d - val) / (d - c); return u * u * (3 - 2 * u); }
  return 1;
}

function carProfileFor(mesh, barracuda, hotCoupe, bikeMesh) {
  if (mesh === bikeMesh) return { topMult: 1.24, accelMult: 1.32, gripMult: 1.15, label: 'Solis Fang', cop: false, bike: true };
  if (mesh === hotCoupe) return { topMult: 1.18, accelMult: 1.22, gripMult: 1.12, label: 'Palma GT', cop: false, bike: false };
  if (mesh === barracuda) return { topMult: 1.0, accelMult: 1.02, gripMult: 1.0, label: 'Barracuda', cop: false, bike: false };
  if (typeof mesh?.siren === 'function') return { topMult: 1.14, accelMult: 1.15, gripMult: 1.08, label: 'SBPD Cruiser', cop: true, bike: false };
  return { topMult: 0.92, accelMult: 0.92, gripMult: 0.96, label: 'Street Ride', cop: false, bike: false };
}

function makeRiderMover(world, mesh, { radius = 0.38, height = 1.8, step = 0.35, slope = 50, gravity = -20, at } = {}) {
  const rider = world.rider({ capsule: [radius, height], step, slope, snap: 0.35, push: true, tag: 'mover', at });
  const _feet = { x: 0, y: 0, z: 0 };
  let active = true;
  const syncFeet = () => {
    const p = rider.to || rider.body.translation();
    const o = world.at;
    const rawY = p.y - rider.half - rider.lift;
    _feet.x = p.x + o.x;
    _feet.y = rider.grounded && rider.floor != null && Math.abs(rider.floor - rawY) < 0.15 ? rider.floor : rawY;
    _feet.z = p.z + o.z;
  };
  syncFeet();
  const mover = {
    world,
    rider,
    body: rider.body,
    collider: rider.collider,
    mesh: mesh || null,
    tag: 'mover',
    kind: 'mover',
    dead: false,
    gravity,
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: false,
    dx: 0,
    dz: 0,
    get feet() { return _feet; },
    walk(vx, vz) { this.vx = vx; this.vz = vz; return this; },
    jump(speed = 7, force = false) { if (this.grounded || force) { this.vy = speed; this.grounded = false; } return this; },
    place(x, y, z) {
      rider.place(x, y, z);
      this.vy = 0;
      this.grounded = false;
      syncFeet();
      return this;
    },
    setActive(on) {
      const next = !!on;
      if (active !== next) {
        active = next;
        rider.collider.setEnabled(active);
      }
    },
    stepMove(dt) {
      if (!active || rider.dead) return;
      if (this.grounded && this.vx === 0 && this.vz === 0 && this.vy <= 0) {
        this.dx = 0;
        this.dz = 0;
        return;
      }
      this.vy += this.gravity * dt;
      if (this.grounded && this.vy < 0) this.vy = Math.max(this.vy, -2);
      const wy = this.vy * dt;
      rider.slide(this.vx * dt, wy, this.vz * dt, null, dt);
      this.grounded = rider.grounded;
      if (this.grounded && this.vy < 0) this.vy = 0;
      if (wy > 0 && rider.moved.y < wy * 0.5) this.vy = 0;
      this.dx = rider.moved.x;
      this.dz = rider.moved.z;
      syncFeet();
    },
    remove() {
      this.dead = true;
      rider.remove();
    },
  };
  return mover;
}

function make(api) {
  let v, world, light, weather, sky, metro, gps, law, radio, scoreMusic, ears;
  let inside, cover, hide, swim, pickups, yardGround;
  let fx3d, impacts, markers, explosives, shots, rep, worldSave;
  let yardPropsGroup, beachPropsGroup, serviceGroup;
  let mako, nadia, barracuda, hotCoupe, bikeMesh, heliMesh, boatMesh, arrowMesh;
  let dropRing, dropBeacon, pickRing, pickBeacon, resprayRing, armsRing, dinerRing, heliRing;
  let dinerPos = { x: -24.0, y: 0.15, z: -42.0 };
  let stuntJumps = [];
  let bayCrateMeshes = [];
  let bayCrates = [];
  let grenadePool = [];
  let rocketPool = [];
  let pickupMeshes = [];
  let tracerPool = [];
  let barrelPool = [];
  let gangPool = [];
  let fpWeapons = {};
  let wpWieldMako = {}, wpWieldNadia = {};
  let camRig, gunRig;
  let yardBoundsShapes = [];
  let decalTargetMeshes = [];
  let worldReady = false;

  const makeBeacon = (col) => {
    const mat = pbr(col, { glow: 2.2, rough: 0.28, metal: 0.2 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.16, 10, 28), mat);
    ring.rotation.x = Math.PI / 2;
    const beamMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.9, 18, 16, 1, true), beamMat);
    v.scene.add(ring, beam);
    return [ring, beam];
  };

  const makeServicePad = (col, x, y, z) => {
    const padMat = pbr(col, { glow: 1.4, rough: 0.3, metal: 0.35 });
    const pad = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.14, 8, 28), padMat);
    pad.rotation.x = Math.PI / 2;
    pad.position.set(x, y + 0.12, z);
    serviceGroup.add(pad);
    return pad;
  };

  const stampPropDecal = (group, localOffset, normal, markSpec) => {
    const target = group.getObjectByName('walls') || group.getObjectByName('body') || firstMesh(group);
    if (!target) return;
    group.updateMatrixWorld(true);
    _hitPt.set(localOffset[0], localOffset[1], localOffset[2]).applyMatrix4(group.matrixWorld);
    _hitNrm.set(normal[0], normal[1], normal[2]).transformDirection(group.matrixWorld).normalize();
    v.decal(target, _hitPt, _hitNrm, markSpec);
  };

  const buildPortAndBeachProps = () => {
    yardPropsGroup = new THREE.Group();
    yardPropsGroup.name = 'yardProps';
    v.scene.add(yardPropsGroup);
    beachPropsGroup = new THREE.Group();
    beachPropsGroup.name = 'beachProps';
    v.scene.add(beachPropsGroup);
    serviceGroup = new THREE.Group();
    serviceGroup.name = 'servicePads';
    v.scene.add(serviceGroup);

    const oldNaranja = metro.districts.find(d => d.name === 'Old Naranja');
    const dinerDoor = oldNaranja?.plan?.spots?.door?.[Math.floor((oldNaranja.plan.spots.door.length || 0) * 0.45)];
    if (dinerDoor) {
      dinerPos.x = dinerDoor.x + (dinerDoor.nx || 0) * 1.8;
      dinerPos.z = dinerDoor.z + (dinerDoor.nz || 0) * 1.8;
      dinerPos.y = metro.ground(dinerPos.x, dinerPos.z);
    }

    resprayRing = makeServicePad('#3cd8ff', RESPRAY_POS.x, RESPRAY_POS.y, RESPRAY_POS.z);
    armsRing = makeServicePad('#ffb24a', ARMS_POS.x, ARMS_POS.y, ARMS_POS.z);
    dinerRing = makeServicePad('#ffcf5c', dinerPos.x, dinerPos.y, dinerPos.z);
    heliRing = makeServicePad('#f4b938', HELI_POS.x, HELI_POS.y, HELI_POS.z);

    const rampGeo = new THREE.BoxGeometry(4.4, 0.14, 2.2);
    const rampMat = pbr('#ffae38', { glow: 0.9, rough: 0.35, metal: 0.25 });
    stuntJumps = [];
    for (const distName of ['Coral Strip', 'Glass Quarter', 'Sawgrass Edge']) {
      const distObj = metro.districts.find(d => d.name === distName);
      const edges = distObj?.plan?.edges || [];
      const nodes = distObj?.plan?.nodes || [];
      let bestEdge = null;
      for (const e of edges) {
        if (!bestEdge || e.len > bestEdge.len) bestEdge = e;
      }
      if (bestEdge && nodes[bestEdge.a] && nodes[bestEdge.b]) {
        const a = nodes[bestEdge.a], b = nodes[bestEdge.b];
        const sx = (a.x + b.x) * 0.5, sz = (a.z + b.z) * 0.5;
        const sy = metro.ground(sx, sz);
        const rotY = Math.atan2(bestEdge.dx, bestEdge.dz);
        const rampMesh = new THREE.Mesh(rampGeo, rampMat);
        rampMesh.position.set(sx, sy + 0.08, sz);
        rampMesh.rotation.y = rotY;
        serviceGroup.add(rampMesh);
        stuntJumps.push({ district: distName, x: sx, y: sy, z: sz, mesh: rampMesh, cd: 0 });
      }
    }

    yardGround = new Ground(v, {
      size: [60, 44],
      kind: 'yard',
      at: [YARD_X, YARD_Z],
      y: YARD_Y,
      bumps: 0.35,
    });
    yardGround.lane(YARD_X - 27, YARD_Z, YARD_X + 27, YARD_Z, { width: 4.5, strength: 0.85 });
    yardGround.line(YARD_X - 26, YARD_Z - 18, YARD_X + 26, YARD_Z - 18, { colour: 'yellow', width: 0.16, strength: 0.75 });
    yardGround.line(YARD_X - 26, YARD_Z + 18, YARD_X + 26, YARD_Z + 18, { colour: 'yellow', width: 0.16, strength: 0.75 });
    yardGround.bay(YARD_X - 12, YARD_Z - 11, 3.2, 7.2, { colour: 'yellow', strength: 0.7 });
    yardGround.bay(YARD_X + 2, YARD_Z - 11, 3.2, 7.2, { colour: 'yellow', strength: 0.7 });
    yardGround.bay(YARD_X + 14, YARD_Z + 11, 3.2, 7.2, { colour: 'white', angle: Math.PI, strength: 0.65 });
    yardGround.hatch(YARD_X - 19, YARD_Z + 9, 6.5, 4.2, { colour: 'yellow', strength: 0.75 });
    yardGround.stamp(YARD_X - 6, YARD_Z + 2, 'oil', { size: 1.9, strength: 0.8 });
    yardGround.stamp(YARD_X + 8, YARD_Z - 1, 'skid', { size: 4.2, angle: 0.3, strength: 0.75 });
    yardGround.stamp(YARD_X + 14, YARD_Z + 7, 'scorch', { size: 2.1, strength: 0.7 });

    const shapes = [];
    shapes.push({ box: [60, 0.34, 44], at: { x: YARD_X, y: -0.005, z: YARD_Z } });

    const placeProp = (kind, x, y, z, rotY = 0, opts = {}, solid = true, targetGroup = yardPropsGroup) => {
      const g = prop(kind, opts);
      g.position.set(x, y, z);
      g.rotation.y = rotY;
      targetGroup.add(g);
      if (solid) addYardStaticCollider(g, shapes);
      return g;
    };

    placeProp('crane', YARD_X - 2, YARD_Y, YARD_Z, 0, { size: 11, seed: 3 }, false);
    const c1 = placeProp('container', YARD_X - 12, YARD_Y, YARD_Z - 11, 0, { size: 6.06, colour: '#8b3728', seed: 11 });
    const c2 = placeProp('container', YARD_X + 2, YARD_Y, YARD_Z - 11, 0, { size: 6.06, colour: '#2d5c84', seed: 22 });
    const c3 = placeProp('container', YARD_X + 14, YARD_Y, YARD_Z + 11, Math.PI * 0.5, { size: 12.19, colour: '#3e6948', seed: 33 });

    stampPropDecal(c1, [1.24, 1.35, 0], [1, 0, 0], mark('stencil', { text: 'SB-04', colour: '#ece6d4', size: [1.3, 0.42] }));
    stampPropDecal(c1, [0, 1.4, 3.04], [0, 0, 1], mark('hazard', { sign: 'flame', word: true, size: 0.72 }));
    stampPropDecal(c2, [-1.24, 1.35, 0.8], [-1, 0, 0], mark('logo', { text: 'SOLIS', colour: '#e6b43c', size: 0.9 }));
    stampPropDecal(c2, [1.24, 1.0, -1.2], [1, 0, 0], mark('rust', { size: [1.2, 1.4] }));
    stampPropDecal(c3, [1.24, 1.2, 1.5], [1, 0, 0], mark('graffiti', { size: [1.6, 0.9] }));

    const skip = placeProp('skip', YARD_X - 20, YARD_Y, YARD_Z - 12, 0.25, { seed: 5 }, true);
    stampPropDecal(skip, [0.95, 0.8, 0], [1, 0, 0], mark('stripes', { size: [1.3, 0.28] }));
    placeProp('oildrum', YARD_X - 5, YARD_Y, YARD_Z - 7, 0.4, { seed: 7 }, false);
    placeProp('oildrum', YARD_X - 4.1, YARD_Y, YARD_Z - 7.4, 1.2, { seed: 8 }, false);
    placeProp('barrier', YARD_X - 24, YARD_Y, YARD_Z - 5, Math.PI * 0.5, { seed: 1 }, false);
    placeProp('waterbarrier', YARD_X - 24, YARD_Y, YARD_Z + 5, Math.PI * 0.5, { seed: 3 }, false);

    for (let i = 0; i < 3; i++) {
      placeProp('bollard', DOCK_POS.x - 14, 0.15, DOCK_POS.z + i * 10, 0, { seed: i + 1 }, false);
    }

    const lockerMat = material('corrugated', { colour: '#4e6372', wear: 0.68 });
    const hullTrimMat = material('hull', { colour: '#8f3428', wear: 0.55 });
    const locker = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.5, 2.8), lockerMat);
    locker.position.set(YARD_X + 21, YARD_Y + 1.25, YARD_Z - 14);
    locker.castShadow = locker.receiveShadow = true;
    wear(locker, { edges: 0.65, dirt: 0.6, ground: 0.55, seed: 14 });
    yardPropsGroup.add(locker);
    addYardStaticCollider(locker, shapes);
    v.decal(locker, [YARD_X + 19.08, YARD_Y + 1.4, YARD_Z - 14], [-1, 0, 0], mark('hazard', { sign: 'bolt', word: true, size: 0.62 }));
    v.decal(locker, [YARD_X + 21, YARD_Y + 0.9, YARD_Z - 12.58], [0, 0, 1], mark('scorch', { size: 0.95 }));
    decalTargetMeshes.push(locker);

    const shack = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.4, 3.0), hullTrimMat);
    shack.position.set(BEACH_LOT.x, BEACH_LOT.y + 1.2, BEACH_LOT.z);
    shack.castShadow = shack.receiveShadow = true;
    wear(shack, { edges: 0.6, dirt: 0.5, ground: 0.45, seed: 8 });
    beachPropsGroup.add(shack);
    addYardStaticCollider(shack, shapes);
    v.decal(shack, [BEACH_LOT.x - 1.82, BEACH_LOT.y + 1.3, BEACH_LOT.z], [-1, 0, 0], mark('logo', { text: 'BAYWATCH', colour: '#1f5fa8', size: 0.8 }));
    v.decal(shack, [BEACH_LOT.x, BEACH_LOT.y + 1.1, BEACH_LOT.z + 1.52], [0, 0, 1], mark('rust', { size: 0.85 }));
    decalTargetMeshes.push(shack);

    placeProp('waterbarrier', BEACH_LOT.x - 6, BEACH_LOT.y, BEACH_LOT.z + 5, 0.1, { seed: 6 }, false, beachPropsGroup);
    placeProp('oildrum', BEACH_LOT.x - 3.2, BEACH_LOT.y, BEACH_LOT.z + 4.5, 0.3, { seed: 9 }, false, beachPropsGroup);
    placeProp('bollard', BEACH_LOT.x + 8, BEACH_LOT.y, BEACH_LOT.z - 6, 0, { seed: 11 }, false, beachPropsGroup);

    yardBoundsShapes = world.shapes(shapes, { tag: 'yard', sound: 'metal' });
  };

  const setupWorld = () => {
    // World3D first so Rapier WASM StillLoading aborts cleanly before WebGL init
    world = new World3D({ gravity: -20 });

    human.need([MAKO_LOOK, NADIA_LOOK, GANG_LOOK]);
    v = new HDView({ bg: '#7aa8d8', fog: 0.00018, env: 0.45, amb: 0.5, fov: 60 });
    v.autoOcclude = false;
    v.occluders?.(null);

    light = sun('#ffd6a6', 2.2, 90, [0.55, 0.58, -0.45]);
    light.softShadows(2);
    v.scene.add(light, light.target);
    v.sun = light;
    v.onTier(T => light.setTier(T));

    weather = new Weather(v, { kind: 'rain', amount: 0 });
    v.look('golden hour', BASE_LOOK);

    sky = new Sky(v, {
      time: 15.6,
      speed: 0.12,
      physical: { haze: 4.2, blue: 1.7, mie: 0.0022, glow: 0.65, bright: 0.42 },
      clouds: 0.32,
      gap: 0.5,
      env: false,
      sun: light,
      fog: false,
      light: false,
    });
    if (sky.mat?.uniforms?.disc) sky.mat.uniforms.disc.value = 4.0;

    metro = new Metro(v, {
      seed: 77,
      districts: DISTRICTS,
      coast: 'bay',
      bay: 380,
      climate: 'tropical',
      live: 190,
      budget: 0.9,
      keep: 340,
      sea: true,
      far: true,
      hills: 0.1,
      river: true,
      highway: true,
      sky,
      traffic: 0.005,
      people: 0.005,
      crowd: false,
      paint: false,
      fleet: false,
      sound: false,
    });
    v.occluders?.(null);
    v.lampLights?.(26);
    metro.solid(world, { cars: 0, people: 0, within: 0, furniture: false, parked: true });
    for (const c of metro.cities) if (c.people) c.people.fullMax = 0;

    ears = new Ears({ level: world, rays: 1, hard: 0.58, auto: false });

    gps = new Gps(metro, { off: 48, arrive: 14, icon, colour: '#38f8b0' });
    law = new Wanted(metro, api, { max: 5, cars: 3, officers: true, brains: true, armed: true, air: true, water: true });
    warmupCop = law?.cops?.[0]?.twin() || null;
    if (warmupCop) warmupCop.lod = 0;

    inside = new Interiors(metro, { world, link: false, reach: 3.0, people: 1, auto: true, seed: 77 });
    cover = new Cover3D({ world, ms: 0.25, space: 2.0, floors: 1, cell: 4 });
    hide = new TakeCover(cover);
    swim = new Swimmer({ height: 1.8, water: metro.water, world });
    pickups = new Pickups({ reach: 1.9 });

    fx3d = new Particles3D(v.scene);
    impacts = new Impacts(v, { particles: fx3d, marks: true, holes: 36, cases: 40, link: false });
    markers = new Markers();
    explosives = new Explosives({ fuse: 0.14, radius: 7.5, damage: 95, world: false, link: false });
    shots = new Shots({ gravity: 0, push: 12, link: false });
    worldSave = new WorldSave(api, { every: 10, link: false });

    radio = new Radio({ stations: STATIONS, seed: 'solis-bay', sky, on: false });
    scoreMusic = filmScore({ mood: 'tense', key: 'D', seed: 77, vol: 0.85 });

    buildPortAndBeachProps();

    mako = human(MAKO_LOOK);
    nadia = human(NADIA_LOOK);
    mako.lod = 0;
    nadia.lod = 1;
    for (const hBody of [mako, nadia]) {
      if (hBody.rig) hBody.rig.steps = false;
      if (hBody.breath) hBody.breath.on = false;
      if (hBody.idle) hBody.idle.on = false;
      if (hBody.rig?.follow) hBody.rig.follow.amount = 0;
      v.scene.add(hBody);
    }

    // Pre-warm all 6 weapon models (FPS + Mako 3rd-person + Nadia 3rd-person)
    for (const k of WEAPON_ORDER) {
      const mFp = weapon(k, { shadows: false });
      mFp.visible = true;
      fpWeapons[k] = mFp;

      const m1 = weapon(k, { shadows: false });
      wpWieldMako[k] = m1.wield(mako);
      m1.visible = false;

      const m2 = weapon(k, { shadows: false });
      wpWieldNadia[k] = m2.wield(nadia);
      m2.visible = false;
    }

    // Pooled rival gang NPCs + Reactions + pistol wields
    for (let i = 0; i < 3; i++) {
      const gb = human(GANG_LOOK);
      gb.lod = 1;
      if (gb.rig) gb.rig.steps = false;
      if (gb.breath) gb.breath.on = false;
      if (gb.idle) gb.idle.on = false;
      if (gb.rig?.follow) gb.rig.follow.amount = 0;
      v.scene.add(gb);
      const gw = weapon('pistol', { shadows: false }).wield(gb);
      gw.update(0, { how: 'ready', hands: true, keep: false });
      const react = new Reactions(gb, { world: false, ground: (x, z) => metro.ground(x, z), steady: 0.9, rest: 3.0 });
      gangPool.push({
        body: gb,
        wield: gw,
        react,
        crew: CREWS.pastel,
        x: 0,
        y: 0,
        z: 0,
        homeX: 0,
        homeZ: 0,
        heading: 0,
        hp: 75,
        alive: false,
        fireCd: 1.5,
        patrolPhase: i * 2.1,
      });
    }

    // Pooled explosive red barrels
    const drumGeo = new THREE.CylinderGeometry(0.36, 0.38, 1.08, 12);
    drumGeo.translate(0, 0.54, 0);
    const drumMat = pbr('#c93528', { rough: 0.45, metal: 0.55 });
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(drumGeo, drumMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      v.scene.add(mesh);
      barrelPool.push({ mesh, exp: null, x: 0, y: 0, z: 0 });
    }

    // Pooled 3D bullet tracer streaks
    const trGeo = new THREE.BoxGeometry(0.032, 0.032, 1);
    const trMat = new THREE.MeshBasicMaterial({ color: '#ffe590', transparent: true, opacity: 0.9 });
    for (let i = 0; i < 10; i++) {
      const tm = new THREE.Mesh(trGeo, trMat);
      tm.frustumCulled = false;
      tm.visible = false;
      v.scene.add(tm);
      tracerPool.push({ mesh: tm, life: 0 });
    }

    // Pooled thrown grenades & flying rockets
    const grGeo = new THREE.SphereGeometry(0.11, 8, 6);
    const grMat = pbr('#3d5a3b', { rough: 0.5, metal: 0.4 });
    for (let i = 0; i < 4; i++) {
      const gm = new THREE.Mesh(grGeo, grMat);
      gm.castShadow = true;
      gm.visible = false;
      v.scene.add(gm);
      grenadePool.push({ mesh: gm, active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fuse: 0 });
    }

    const rktGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.55, 8);
    rktGeo.rotateX(Math.PI * 0.5);
    const rktMat = pbr('#ff7b38', { glow: 1.4, rough: 0.3, metal: 0.35 });
    for (let i = 0; i < 4; i++) {
      const rm = new THREE.Mesh(rktGeo, rktMat);
      rm.visible = false;
      v.scene.add(rm);
      rocketPool.push({ mesh: rm, active: false, smokeT: 0 });
    }

    // Pooled floating contraband crates for Pelican Cut
    const bayGeo = new THREE.BoxGeometry(0.95, 0.72, 0.95);
    const bayMat = pbr('#2ef2b8', { glow: 0.85, rough: 0.35, metal: 0.25 });
    for (let i = 0; i < 3; i++) {
      const bm = new THREE.Mesh(bayGeo, bayMat);
      bm.castShadow = true;
      bm.visible = false;
      v.scene.add(bm);
      bayCrateMeshes.push(bm);
    }

    barracuda = vehicle('car', { style: 'saloon', colour: '#16969a', inside: true, lit: false });
    hotCoupe = vehicle('car', { style: 'sports', colour: '#ff6f61', inside: true, lit: false });
    hotCoupe.visible = false;
    bikeMesh = vehicle('bike', { style: 'sport', colour: '#ff3b7f', lit: false });
    heliMesh = vehicle('helicopter', { style: 'light', colour: '#f4b938', lit: true });
    boatMesh = vehicle('boat', { style: 'motor', colour: '#d8473c', lit: true });
    v.scene.add(barracuda, hotCoupe, bikeMesh, heliMesh, boatMesh);
    v.detail([barracuda, hotCoupe, bikeMesh, heliMesh, boatMesh], false);

    camRig = new CameraRig(v, { mode: 'chase', distance: 5.8, height: 2.3, look: 1.35, lag: 0.14, walls: world, fov: 60 });
    gunRig = new GunRig(v, fpWeapons.pistol, { kind: 'pistol', rig: camRig });
    gunRig.root.visible = false;

    const arrowMat = pbr('#38f8b0', { glow: 0.4, rough: 0.35 });
    arrowMesh = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.48, 4), arrowMat);
    v.scene.add(arrowMesh);

    [dropRing, dropBeacon] = makeBeacon('#38f8b0');
    [pickRing, pickBeacon] = makeBeacon('#ffae38');

    const crateGeo = new THREE.BoxGeometry(0.55, 0.42, 0.55);
    const crateCols = ['#48e08a', '#f7b731', '#4bcffa', '#ff6b6b', '#a55eea'];
    for (let i = 0; i < 6; i++) {
      const pm = new THREE.Mesh(crateGeo, pbr(crateCols[i % crateCols.length], { rough: 0.35, metal: 0.3, glow: 0.45 }));
      pm.castShadow = true;
      pm.visible = false;
      v.scene.add(pm);
      pickupMeshes.push(pm);
    }

    v.wantFlashes?.();
    worldReady = true;
  };

  const feel = new Feel();
  const pad = twoThumb(W, H, { right: ['RIDE', 'FIRE', 'AIM'], r: 28 });
  const padBtnList = Object.values(pad.buttons);
  const keys = new Keys();

  const K = gs.tweak('Feel', {
    walkSpeed: [4.8, 2.5, 8, 'walking speed (m/s)'],
    sprintSpeed: [7.2, 4, 11, 'sprinting speed (m/s)'],
    carTop: [25, 14, 36, 'top driving speed (m/s)'],
    carAccel: [14.5, 7, 24, 'driving acceleration (m/s^2)'],
    carTurn: [2.15, 1.2, 3.6, 'steering responsiveness'],
    carGrip: [8.2, 4, 13, 'lateral cornering grip'],
    daySpeed: [0.12, 0, 1, 'time-of-day speed (hours per real minute scale)'],
    dropRep: [28, 15, 60, 'Rep earned per mission objective'],
    escapeRep: [25, 10, 50, 'Rep earned when escaping SBPD pursuit'],
  });

  // Zero-churn per-slot fitted string cache
  const slotCache = new Map();
  const fitText = (c, slot, str, maxW) => {
    let entry = slotCache.get(slot);
    if (entry && entry.str === str && entry.maxW === maxW) return entry.out;
    let out = str;
    if (c.measureText(str).width > maxW) {
      while (out.length > 1 && c.measureText(out + '…').width > maxW) out = out.slice(0, -1);
      out += '…';
    }
    if (entry) {
      entry.str = str;
      entry.maxW = maxW;
      entry.out = out;
    } else {
      slotCache.set(slot, { str, maxW, out });
    }
    return out;
  };

  let R, t, score, cash, inCar, inBoat, inHeli, carCtrl, boatCtrl, heliCtrl, driveBy, activeCarMesh;
  let mover, leads, leadIdx, activeLead, otherLead;
  let phase, jobIdx, job, targetPos, pickupPos, jobsDoneCount = 0;
  let bannerText, bannerCol, bannerT, hitT, rideCooldown, engineSound, radioStarted, savedStationIdx = 0;
  let lastDistrictName, skyTick, poseTick, lawTick, lawDt, gpsDt, lastCityCount = 0;
  let pendingRadioOn = 0, pendingGpsGoal = null, pendingGpsLabel = '', pendingGpsKind = 'target', pendingGpsDelay = 0, pendingPickupLaw = null;
  let gpsShown, hudSub, wasIndoor, warmupCop = null, warmedCop = false;
  let lastScoreThreat = -1, lastScoreFinal = false;
  let lastCarLights = null, lastActiveCarMesh = null, lastActiveCarLit = null, lastWantedStars = 0;
  let activeCarProfile = { topMult: 1, accelMult: 1, gripMult: 1, label: 'Barracuda', cop: false, bike: false };
  let rideKey = false, coverKey = false, swapKey = false, gunKey = false, aimKey = false;
  let aimMode = false, fpsAim = false, fireHeld = false, lawWired = false, expWired = false, saveWired = false, scoreStarted = false;
  let recentShotT = 0, batonCd = 0, grenadeCd = 0, driftSec = 0, driftSkidCd = 0, driftSmokeAcc = 0, newsCooldown = 0;
  let carJumpT = 0, paintIdx = 0, shakedownOpen = false, cratesLeft = 0;
  let hipShoulder = false, hasLitBarrel = false, radioDirty = true;
  let lockedTarget = null;
  let weaponWheelOpen = false, radioWheelOpen = false;
  let phoneCaller = '', phoneLine = '', phoneTitleStr = '', phoneLine1 = '', phoneLine2 = '', phoneT = 0, phoneHoldLeft = 0;
  let overKind = null, overT = 0;
  let curHaze = 0.0009, curMist = 0, curWet = 0.12, curRain = 0, curPools = 0;
  let curBloom = 0.22, curExp = 0.98, curSunI = 2.0, curHemiI = 0.5;
  let lastClockStr, lastClockMin, lookDragId = null, lookLastX = 0, lookLastY = 0;
  let lastDistHud = '', lastDistClock = '', lastDistText = '';
  let lastAmmoKind = '', lastAmmoClip = -1, lastAmmoPool = -1, lastAmmoText = '';
  let lastCashVal = -1, lastCashStr = '$500';
  let lastSpeedVal = -1, lastSpeedStr = '0 KM/H';
  let lastNextIn = -1, lastNextTurn = '', lastNextStr = '';
  let lastSwapName = '', lastSwapStr = 'SWAP Nadia';
  let lastModeLead = '', lastModeKind = '', lastModeStr = 'Mako · On Foot';
  let lastLawSec = -1, lastLawSecStr = '0s';
  let cachedRadOn = false, cachedRadTitle = 'Radio · 5 Stations', cachedRadSub = '';
  let lastHudW = -1, lastHudH = -1, lastHudWeaponOpen = false;

  const say = (txt, col = '#ffffff', dur = 3.2) => {
    bannerText = txt;
    bannerCol = col;
    bannerT = dur;
  };

  const awardRep = (pts, label, col = '#68f8c4') => {
    score = Math.min(100, score + pts);
    api.score(score);
    if (label) feel.coin(W * 0.5, H * 0.35, { color: col, text: label });
    if (score >= 100 && !overKind) {
      scoreMusic?.sting('win');
      worldSave?.now(true);
      api.win();
      return true;
    }
    return false;
  };

  const triggerOver = (kind) => {
    if (overKind) return;
    overKind = kind;
    overT = 1.15;
    fireHeld = false;
    aimMode = false;
    weaponWheelOpen = false;
    radioWheelOpen = false;
    scoreMusic?.sting('lose');
    feel.lose();
    camRig?.shake(0.6);
    worldSave?.now(true);
  };

  const announceNews = (line, urgent = true) => {
    if (!radio || !radio.power || newsCooldown > 0) return;
    newsCooldown = 14;
    try { radio.news(line, { urgent }); } catch {}
  };

  const ringPhone = (caller, line, dur = 4.2) => {
    phoneCaller = caller || 'SOLIS DISPATCH';
    phoneLine = line || '';
    phoneTitleStr = `CALL · ${phoneCaller}`;
    const mid = Math.ceil(phoneLine.length * 0.5);
    const spIdx = phoneLine.indexOf(' ', mid - 6);
    const splitAt = spIdx > 6 && spIdx < phoneLine.length - 4 ? spIdx : mid;
    phoneLine1 = phoneLine.slice(0, splitAt);
    phoneLine2 = phoneLine.slice(splitAt).trim();
    phoneT = dur;
    phoneHoldLeft = 1.6;
    if (radio?.power) radio.hold(true);
    try { sounds.blip?.(1.15); } catch {}
  };

  const updateAtmosphere = (dt, snap = false) => {
    if (!v || !sky || !light) return;
    const hr = ((sky.time % 24) + 24) % 24;
    const nightW = sky.night;
    const duskW = Math.max(smoothWindow(hr, 17.5, 18.4, 19.6, 20.6), smoothWindow(hr, 4.8, 5.6, 6.4, 7.2));
    const px = playerQuery.x, pz = playerQuery.z;
    const gladesW = rectProximity(GLADES_RECT, px, pz, 160);
    const marinaW = rectProximity(MARINA_RECT, px, pz, 130);

    const tgtHaze = clamp(0.0008 + gladesW * 0.0019 + marinaW * 0.0005 + duskW * 0.0005 + nightW * 0.0007, 0.0007, 0.0032);
    const tgtMist = clamp(gladesW * 0.0036 + nightW * gladesW * 0.0014, 0, 0.005);
    const tgtRain = clamp((nightW > 0.55 ? 0.35 : 0) + duskW * 0.16 * (0.4 + 0.6 * marinaW), 0, 0.45);
    const tgtWet = clamp(0.1 + tgtRain * 0.85 + marinaW * 0.15, 0.1, 0.72);
    const tgtPools = clamp(tgtRain * 0.9, 0, 0.45);
    const tgtBloom = 0.21 + duskW * 0.04 + nightW * 0.08;
    const tgtExp = 0.98 + nightW * 0.06;
    const tgtSunI = nightW > 0.7 ? 0.55 : 2.15 - duskW * 0.65;
    const tgtHemiI = 0.54 - nightW * 0.14;

    const k = snap ? 1 : 1 - Math.exp(-Math.max(0.001, dt) * 1.15);
    curHaze += (tgtHaze - curHaze) * k;
    curMist += (tgtMist - curMist) * k;
    curWet += (tgtWet - curWet) * k;
    curRain += (tgtRain - curRain) * k;
    curPools += (tgtPools - curPools) * k;
    curBloom += (tgtBloom - curBloom) * k;
    curExp += (tgtExp - curExp) * k;
    curSunI += (tgtSunI - curSunI) * k;
    curHemiI += (tgtHemiI - curHemiI) * k;

    // Unified sun/moon directional lighting without horizon blinding
    if (nightW < 0.75) {
      const sd = sky.sunDir;
      light.aim?.(sd.x, Math.max(0.24, sd.y), sd.z);
      sunClrScratch.copy(sky.sunCol);
      const maxC = Math.max(sunClrScratch.r, sunClrScratch.g, sunClrScratch.b, 1);
      if (maxC > 1) sunClrScratch.multiplyScalar(1 / maxC);
      sunClrScratch.lerp(moonClrScratch, nightW * 0.5);
      light.color.copy(sunClrScratch);
    } else {
      light.aim?.(-0.42, 0.58, 0.68);
      light.color.copy(moonClrScratch);
    }
    light.intensity = curSunI;

    const a = v._air;
    if (a) {
      a.haze = curHaze;
      a.mist = curMist;
      a.wet = curWet;
      a.colour.copy(airColDay).lerp(airColDusk, duskW).lerp(airColNight, nightW);
      a.sunColour.copy(airSunDay).lerp(airSunDusk, duskW).lerp(airSunNight, nightW);
    } else {
      v.air(airScratch);
    }

    v.bloom = curBloom;
    v.exposure = curExp;
    v.hemi.intensity = curHemiI;
    v.hemi.color.copy(hemiSkyDay).lerp(hemiSkyNight, nightW);
    v.hemi.groundColor.copy(hemiGndDay).lerp(hemiGndNight, nightW);

    if (weather) {
      const visRain = curRain > 0.04 ? curRain : 0;
      weather.set('rain', visRain);
      weather.wet = curWet;
      weather.pools = curPools;
    }
  };

  const applyVehiclePaint = (veh, hex) => {
    if (!veh) return;
    const shared = veh !== barracuda && veh !== hotCoupe && veh !== bikeMesh;
    veh.traverse?.(m => {
      if (m.isMesh && m.name === 'paint' && m.material?.color) {
        if (shared && !m.userData._ownPaint) {
          m.material = m.material.clone();
          m.userData._ownPaint = true;
        }
        m.material.color.set(hex);
      }
    });
  };

  const activeGun = (lead = activeLead) => (lead ? lead.guns[lead.weaponKind] || null : null);

  const equipWeapon = (lead, kind) => {
    if (!lead || !lead.unlocked.has(kind)) return false;
    lead.weaponKind = kind;
    if (lead === activeLead) {
      const hasAim = !!ARSENAL[kind]?.gun || kind === 'grenade';
      if (aimMode && !hasAim) setAimMode(false);
      else if (camRig) camRig.opts.fovAim = kind === 'sniper' ? 22 : null;
      updateWieldModels();
      if (gunRig && ARSENAL[kind]?.gun && fpWeapons[kind]) gunRig.draw?.();
    }
    return true;
  };

  const placeAtDistrict = (name, nearPos = null, minD = 30, maxD = 120, kind = 'street') => {
    const d = metro.districts.find(x => x.name === name) || metro.districts[0];
    const center = { x: (d.rect.x0 + d.rect.x1) * 0.5, z: (d.rect.z0 + d.rect.z1) * 0.5 };
    if (d.city) {
      const sp = d.city.spot(kind, { near: nearPos || center, min: nearPos ? minD : 0, max: maxD, rnd: R });
      if (sp) return { x: sp.x, y: metro.ground(sp.x, sp.z), z: sp.z, heading: sp.heading || 0 };
    }
    if (kind === 'door' && d.plan?.spots?.door?.length) {
      const doors = d.plan.spots.door;
      const pick = doors[Math.floor((R ? R() : 0.3) * doors.length)];
      return { x: pick.x + (pick.nx || 0) * 1.4, y: pick.y ?? 0.15, z: pick.z + (pick.nz || 0) * 1.4, heading: Math.atan2(-(pick.nx || 0), -(pick.nz || 1)) };
    }
    return { x: center.x, y: metro.ground(center.x, center.z), z: center.z, heading: 0 };
  };

  const setGpsGoal = (goalPos, kind, text) => {
    gps.clear();
    gps.add({ at: RESPRAY_POS, kind: 'shop', text: 'Customs' });
    gps.add({ at: ARMS_POS, kind: 'shop', text: 'Arms' });
    gps.add({ at: dinerPos, kind: 'home', text: 'Diner' });
    if (goalPos) {
      gps.add({ at: goalPos, kind, text, pinned: true });
      gps.to(goalPos);
    }
  };

  const updateWieldModels = () => {
    for (const lead of leads) {
      const show3p = !lead.inVehicle && !(lead === activeLead && aimMode && fpsAim);
      for (const [k, w] of Object.entries(lead.wields)) {
        w.gun.visible = show3p && lead.weaponKind === k;
      }
      lead.body.visible = !(lead === activeLead && aimMode && fpsAim);
    }
    if (gunRig && activeLead) {
      const k = activeLead.weaponKind;
      const hasGun = !!ARSENAL[k]?.gun;
      if (fpWeapons[k] && gunRig.model !== fpWeapons[k] && hasGun) {
        gunRig.hold(fpWeapons[k], k);
      }
      gunRig.root.visible = !!aimMode && fpsAim && !inCar && !inBoat && !inHeli && hasGun;
    }
  };

  const setAimMode = (on) => {
    if (inCar || inBoat || inHeli) on = false;
    aimMode = !!on;
    hipShoulder = false;
    if (aimMode) {
      let k = activeLead.weaponKind;
      if (!ARSENAL[k]?.gun && k !== 'grenade') {
        if (activeLead.unlocked.has('pistol')) {
          activeLead.weaponKind = 'pistol';
          k = 'pistol';
        }
      }
      const hasGun = !!ARSENAL[k]?.gun;
      const canAim = hasGun || k === 'grenade';
      if (canAim) {
        const f = activeLead.foot;
        f.heading = camRig.targetYaw + camRig.yaw;
      }
      camRig.opts.fovAim = k === 'sniper' ? 22 : null;
      if (fpsAim && hasGun) {
        camRig.to('first', 0.14, { height: 1.62, walls: world });
        gunRig.aiming = true;
      } else {
        camRig.to('shoulder', 0.14, { distance: 2.45, height: 1.66, side: 0.62, look: 1.5, lag: 0.05, walls: world });
        gunRig.aiming = false;
      }
      camRig.aiming = true;
      v.aiming = 1;
    } else {
      camRig.aiming = false;
      camRig.opts.fovAim = null;
      gunRig.aiming = false;
      v.aiming = 0;
      camRig.to('chase', 0.2, { distance: 5.8, height: 2.3, look: 1.35, walls: world });
    }
    updateWieldModels();
  };

  const spawnEncounter = (cx, cz, radius = 16, districtName = lastDistrictName) => {
    const aliveNeeded = Math.min(3, 1 + Math.floor(jobIdx / 1.5));
    const crew = crewForDistrict(districtName);
    for (let i = 0; i < gangPool.length; i++) {
      const g = gangPool[i];
      if (i >= aliveNeeded) {
        g.alive = false;
        g.body.visible = false;
        continue;
      }
      const ang = i * 2.1 + 0.6;
      const dist = 5 + i * 3.5;
      const gx = cx + Math.sin(ang) * Math.min(radius, dist);
      const gz = cz + Math.cos(ang) * Math.min(radius, dist);
      const tmp = { x: gx, z: gz };
      metro.collide(tmp, 0.45, 0.2);
      const gy = metro.ground(tmp.x, tmp.z);
      g.crew = crew;
      g.x = g.homeX = tmp.x;
      g.z = g.homeZ = tmp.z;
      g.y = gy;
      g.hp = 68 + jobIdx * 8;
      g.alive = !metro.water?.wet(tmp.x, tmp.z);
      g.fireCd = 1.4 + i * 0.5;
      g.body.visible = g.alive;
      if (g.alive) {
        g.body.position.set(g.x, g.y, g.z);
        g.body.rotation.set(0, g.heading, 0);
        g.react.reset();
        g.body.rig.blend(BLEND_OPTS, 0);
        rigUpdOpts.speed = 0;
        rigUpdOpts.aim = 0;
        g.body.rig.update(0, rigUpdOpts);
        g.wield.update(0, { how: 'ready', hands: true, keep: false });
      }
    }
  };

  const assignJob = (idx) => {
    jobIdx = idx % JOBS.length;
    job = JOBS[jobIdx];
    shakedownOpen = false;
    bayCrates = [];
    cratesLeft = 0;
    for (const bm of bayCrateMeshes) bm.visible = false;

    const startRef = inCar && carCtrl ? { x: carCtrl.x, z: carCtrl.y } : inHeli && heliCtrl ? heliCtrl.pos : activeLead.foot;

    if (job.kind === 'vehicle') {
      if (inCar) {
        phase = 'deliver';
        targetPos = placeAtDistrict(job.toDistrict, startRef, 90, 260);
        pickupPos = null;
        if (activeCarMesh !== hotCoupe) hotCoupe.visible = false;
        setGpsGoal(targetPos, 'target', job.toDistrict);
        hudSub = `Deliver ride to ${job.toDistrict}`;
        spawnEncounter(targetPos.x, targetPos.z, 14, job.toDistrict);
      } else {
        phase = 'pickup';
        pickupPos = placeAtDistrict(job.fromDistrict, startRef, 22, 85);
        targetPos = placeAtDistrict(job.toDistrict, pickupPos, 90, 260);
        hotCoupe.position.set(pickupPos.x, metro.ground(pickupPos.x, pickupPos.z), pickupPos.z);
        hotCoupe.rotation.set(0, (pickupPos.heading || 0) + Math.PI, 0);
        hotCoupe.visible = true;
        setGpsGoal(pickupPos, 'job', 'Hot Ride');
        hudSub = `Board ride on ${job.fromDistrict}`;
        spawnEncounter(targetPos.x, targetPos.z, 14, job.toDistrict);
      }
    } else if (job.kind === 'interior') {
      phase = 'interior';
      pickupPos = null;
      targetPos = placeAtDistrict('Old Naranja', startRef, 35, 130, 'door');
      setGpsGoal(targetPos, 'target', 'Shop Door');
      hudSub = 'Walk inside Old Naranja shop';
      spawnEncounter(targetPos.x + 8, targetPos.z + 8, 12, 'Old Naranja');
    } else if (job.kind === 'boat') {
      phase = inBoat ? 'deliver_boat' : 'board_boat';
      pickupPos = { x: DOCK_POS.x, y: DOCK_POS.y, z: DOCK_POS.z, heading: 0 };
      targetPos = { x: YARD_X, y: YARD_Y, z: YARD_Z, heading: 0 };
      for (let i = 0; i < 3; i++) {
        const u = 0.25 + i * 0.25;
        let cx = SLIP_POS.x + (YARD_X - SLIP_POS.x) * u;
        let cz = SLIP_POS.z + (YARD_Z - SLIP_POS.z) * u;
        for (let probe = 0; probe < 8 && !metro.water?.wet(cx, cz); probe++) {
          cx += 10;
          cz -= 8;
        }
        const cy = metro.water?.height ? metro.water.height(cx, cz) : 0;
        bayCrates.push({ x: cx, y: cy > -50 ? cy : 0, z: cz, taken: false, mesh: bayCrateMeshes[i] });
        if (bayCrateMeshes[i]) {
          bayCrateMeshes[i].position.set(cx, 0.25, cz);
          bayCrateMeshes[i].visible = true;
        }
      }
      cratesLeft = bayCrates.length;
      const navPt = phase === 'board_boat' ? pickupPos : targetPos;
      setGpsGoal(navPt, 'target', phase === 'board_boat' ? 'Marina Boat' : 'Port Yard');
      hudSub = phase === 'board_boat' ? 'Board boat at Pelican Marina' : 'Scoop 3 bay crates -> Port Yard';
      spawnEncounter(YARD_X, YARD_Z, 18, 'Pelican Marina');
    } else {
      phase = 'deliver';
      pickupPos = null;
      targetPos = placeAtDistrict(job.toDistrict, startRef, 70, 200);
      setGpsGoal(targetPos, 'target', job.toDistrict);
      if (law.stars < job.heat) law.set(job.heat);
      const crew = crewForDistrict(job.toDistrict);
      hudSub = `Clear ${crew.name} in ${job.toDistrict}`;
      spawnEncounter(targetPos.x, targetPos.z, 16, job.toDistrict);
    }
    ringPhone(`${job.caller} · ${job.name}`, job.call, 4.4);
  };

  const koGangMember = (g, head = false, labelTag = 'KO') => {
    g.alive = false;
    g.body.visible = false;
    const pay = activeLead.name === 'Nadia' ? 145 : 120;
    cash += pay;
    const crewName = g.crew?.name || 'Rival';
    const crewId = g.crew?.id;
    if (rep && crewId) rep.did('crewKo', { seen: [crewId] });
    awardRep(8, `+8 ${crewName} ${labelTag} · +$${pay}`, '#ff9f43');
    markers.add(head, true);
  };

  const detonateAt = (ax, ay, az, radius = 8.0, damage = 110) => {
    const boomAt = { x: ax, y: ay, z: az };
    fx3d.boom(boomAt, { size: 1.7 });
    sounds.boom?.();
    camRig.shake(0.55);
    const dmgAt = (px, py, pz, rMax) => {
      const d = Math.hypot(px - ax, (py - ay) * 0.6, pz - az);
      return d < rMax ? damage * (1 - d / rMax) : 0;
    };
    for (const g of gangPool) {
      if (!g.alive) continue;
      const dmg = dmgAt(g.x, g.y + 0.8, g.z, radius);
      if (dmg > 0) {
        g.hp -= dmg;
        _pushVec.x = (g.x - ax) * 2.5; _pushVec.y = 3.5; _pushVec.z = (g.z - az) * 2.5;
        g.react.hit(_pushVec, boomAt);
        if (g.hp <= 0) koGangMember(g, false, 'BLAST KO');
      }
    }
    for (const o of law.officers) {
      if (o.gone || o.alive === false) continue;
      const oy = o.body?.position?.y ?? 0;
      const dmg = dmgAt(o.x, oy + 0.8, o.z, radius);
      if (dmg > 0) law.hitOfficer(o, dmg, boomAt, boomAt);
    }
    for (const b of law.boats || []) {
      if (b.down || !b.model) continue;
      const bx = b.craft?.x ?? b.model.position.x, bz = b.craft?.z ?? b.model.position.z;
      const dmg = dmgAt(bx, 0.8, bz, radius + 4);
      if (dmg > 0) b.model.harm?.(clamp(dmg / 95, 0.35, 1.2));
    }
    if (law.heli && !law.heli.down && law.heli.model) {
      const hp = law.heli.model.position;
      const dmg = dmgAt(hp.x, hp.y, hp.z, radius + 6);
      if (dmg > 0) law.heli.model.harm?.(clamp(dmg / 85, 0.45, 1.2));
    }
    for (const b of explosives.list) {
      if (b.gone) continue;
      if (Math.hypot(b.x - ax, b.z - az) < radius * 0.85 && Math.hypot(b.x - ax, b.z - az) > 0.25) {
        explosives.light(b, true);
        hasLitBarrel = true;
      }
    }
    for (const pv of [barracuda, hotCoupe, bikeMesh, heliMesh, boatMesh, activeCarMesh]) {
      if (!pv || pv.wrecked || pv.visible === false) continue;
      if (pv === activeCarMesh && [barracuda, hotCoupe, bikeMesh, heliMesh, boatMesh].includes(pv)) continue;
      const d = Math.hypot(pv.position.x - ax, pv.position.y - ay, pv.position.z - az);
      if (d > 0.5 && d < radius) pv.harm?.(clamp((1 - d / radius) * 0.55, 0.12, 0.6));
    }
    if (activeLead && !overKind) {
      const selfDmg = dmgAt(playerQuery.x, playerQuery.y + 0.7, playerQuery.z, radius);
      if (selfDmg > 0) {
        const lost = activeLead.health.hurt(selfDmg * 0.55, { from: boomAt, at: activeLead.foot, facing: activeLead.foot.heading });
        v.hit?.(lost);
        v.health = activeLead.health.frac;
        if (activeLead.health.dead) triggerOver('WASTED');
      }
    }
    law.crime('shots', boomAt);
  };

  const wireVehicleWreck = (veh) => {
    if (!veh || veh._wreckWired || typeof veh.on !== 'function') return;
    veh._wreckWired = true;
    veh.on('fire', () => {
      if ((inCar && activeCarMesh === veh) || (inHeli && veh === heliMesh) || (inBoat && veh === boatMesh)) {
        say('ENGINE ON FIRE — BAIL OUT!', '#ff5a52', 3.0);
        try { sounds.alarm?.(1.1); } catch {}
      }
    });
    veh.on('blow', e => {
      const at = e?.at || veh.position;
      if ((inCar && activeCarMesh === veh) || (inHeli && veh === heliMesh) || (inBoat && veh === boatMesh)) {
        stepOut(true);
        if (!overKind) {
          const lost = activeLead.health.hurt(68, { from: at, at: activeLead.foot, facing: activeLead.foot.heading });
          v.hit?.(lost);
          v.health = activeLead.health.frac;
          if (activeLead.health.dead) triggerOver('WASTED');
        }
      }
      detonateAt(at.x, at.y, at.z, e?.radius || 8.5, 110);
    });
  };

  const seatLeadInCar = (vehMesh, cx, cz, heading) => {
    if (activeCarMesh && activeCarMesh !== barracuda && activeCarMesh !== hotCoupe && activeCarMesh !== bikeMesh && activeCarMesh !== vehMesh) {
      activeCarMesh.visible = false;
    }
    wireVehicleWreck(vehMesh);
    setAimMode(false);
    hipShoulder = false;
    hide.leave();
    activeCarMesh = vehMesh;
    activeCarProfile = carProfileFor(vehMesh, barracuda, hotCoupe, bikeMesh);
    activeCarMesh.visible = true;
    activeCarMesh.position.set(cx, metro.ground(cx, cz), cz);
    activeCarMesh.rotation.set(0, heading + Math.PI, 0);
    const seatName = activeCarProfile.bike ? 'rider' : 'driver';
    activeCarMesh.putIn?.(activeLead.body, seatName);
    activeLead.inVehicle = true;
    inCar = true;
    inBoat = false;
    inHeli = false;
    carJumpT = 0;
    mover.mesh = null;
    mover.gravity = 0;
    mover.walk(0, 0);
    mover.setActive(false);
    mover.place(cx, -120, cz);

    const makoBonus = activeLead.name === 'Mako';
    carCtrl = new Car({
      x: cx,
      y: cz,
      angle: Math.PI / 2 - heading,
      top: K.carTop * activeCarProfile.topMult * (activeCarMesh._tuned ? 1.08 : 1),
      accel: K.carAccel * activeCarProfile.accelMult * (makoBonus ? 1.06 : 1),
      brakes: 34,
      turn: K.carTurn,
      roll: activeCarProfile.bike ? 0.25 : 0.35,
      grip: K.carGrip * activeCarProfile.gripMult * (makoBonus ? 1.12 : 1),
      reverse: 0.42,
    });
    driveBy = new DriveBy(activeCarMesh, { seat: seatName, open: !!activeCarProfile.bike });
    if (activeCarProfile.bike) {
      camRig.to('chase', 0.22, { distance: 6.4, height: 2.5, look: 1.2, walls: false });
    } else {
      camRig.to('chase', 0.25, { distance: 9.0, height: 4.0, look: 1.25, walls: false });
    }

    if (!radioStarted) {
      pendingRadioOn = 2;
    }
    radio.listen({ inside: true });
    updateWieldModels();

    if (phase === 'pickup') {
      phase = 'deliver';
      awardRep(15, '+15 REP', '#ffcf5c');
      pendingPickupLaw = { x: cx, z: cz, heat: job.heat };
      pendingGpsGoal = targetPos;
      pendingGpsLabel = job.toDistrict;
      pendingGpsKind = 'target';
      pendingGpsDelay = 3;
      hudSub = `Deliver to ${job.toDistrict}`;
      say(`${activeCarProfile.label} boosted! Go to ${job.toDistrict}`, '#68f8c4', 3.4);
    } else if (activeCarProfile.bike) {
      say('Solis Fang mounted!', '#ff9ff3', 2.0);
    }
  };

  const boardBoat = () => {
    wireVehicleWreck(boatMesh);
    setAimMode(false);
    hipShoulder = false;
    hide.leave();
    if (inCar && activeCarMesh) activeCarMesh.takeOut?.(activeLead.body);
    inCar = false;
    inHeli = false;
    inBoat = true;
    activeLead.inVehicle = true;
    mover.mesh = null;
    mover.gravity = 0;
    mover.walk(0, 0);
    mover.setActive(false);
    mover.place(boatCtrl.x, -120, boatCtrl.z);
    boatMesh.putIn?.(activeLead.body, 'helm', { from: swim.state !== 'out' ? 'water' : undefined });
    driveBy = new DriveBy(boatMesh, { seat: 'helm', open: true });
    camRig.to('chase', 0.25, { distance: 10.5, height: 4.4, look: 1.3, walls: false });
    if (!radioStarted) pendingRadioOn = 2;
    radio.listen({ inside: true });
    updateWieldModels();

    if (phase === 'board_boat') {
      phase = 'deliver_boat';
      if (law.stars < 2) law.set(2);
      setGpsGoal(targetPos, 'target', 'Port Yard');
      hudSub = `Bay Crates ${3 - cratesLeft}/3 -> Port Yard`;
      say('Flamingo 24 underway! Scoop 3 crates to Port Yard!', '#68f8c4', 3.5);
    }
  };

  const boardHeli = () => {
    if (!heliCtrl || heliMesh.wrecked) return;
    wireVehicleWreck(heliMesh);
    setAimMode(false);
    hipShoulder = false;
    hide.leave();
    if (inCar && activeCarMesh) activeCarMesh.takeOut?.(activeLead.body);
    if (inBoat) boatMesh.takeOut?.(activeLead.body);
    inCar = false;
    inBoat = false;
    inHeli = true;
    activeLead.inVehicle = true;
    mover.mesh = null;
    mover.gravity = 0;
    mover.walk(0, 0);
    mover.setActive(false);
    mover.place(heliCtrl.pos.x, -120, heliCtrl.pos.z);
    heliMesh.putIn?.(activeLead.body, 'pilot');
    driveBy = null;
    camRig.to('chase', 0.25, { distance: 13.5, height: 5.8, look: 1.2, walls: false });
    if (!radioStarted) pendingRadioOn = 2;
    radio.listen({ inside: true });
    updateWieldModels();
    say('Solis Chopper airborne · UP/DOWN to climb!', '#ffd166', 3.2);
  };

  const findSafeExit = (bx, bz, baseHeading, candOffsets, preferDry) => {
    let best = null;
    for (const [sideDist, backDist] of candOffsets) {
      const rx = Math.cos(baseHeading) * sideDist - Math.sin(baseHeading) * backDist;
      const rz = -Math.sin(baseHeading) * sideDist - Math.cos(baseHeading) * backDist;
      exitCand.x = bx + rx;
      exitCand.z = bz + rz;
      const gy = metro.ground(exitCand.x, exitCand.z, 3);
      exitCand.y = gy;
      const wet = !!metro.water?.wet(exitCand.x, exitCand.z);
      const hitWall = metro.collide(exitCand, 0.45, gy);
      const movedFar = Math.hypot(exitCand.x - (bx + rx), exitCand.z - (bz + rz)) > 0.65;
      exitCand.y = metro.ground(exitCand.x, exitCand.z, gy + 1.5);
      if (preferDry && wet) {
        if (!best) best = { x: exitCand.x, y: Math.max(-0.2, exitCand.y), z: exitCand.z };
        continue;
      }
      if (!hitWall && !movedFar) {
        return { x: exitCand.x, y: wet ? Math.max(-0.2, exitCand.y) : exitCand.y, z: exitCand.z };
      }
      if (!best) best = { x: exitCand.x, y: wet ? Math.max(-0.2, exitCand.y) : exitCand.y, z: exitCand.z };
    }
    return best || { x: bx, y: metro.ground(bx, bz), z: bz };
  };

  const stepOut = (force = false) => {
    if (inHeli && heliCtrl) {
      const hx = heliCtrl.pos.x, hz = heliCtrl.pos.z;
      const gy = metro.ground(hx, hz, heliCtrl.pos.y + 1.5);
      const alt = heliCtrl.pos.y - gy;
      const wet = !!metro.water?.wet(hx, hz);
      if (!force && !heliCtrl.onGround && !wet && alt > 4.0) {
        say('Descend lower to exit chopper!', '#ffd166', 2.0);
        return;
      }
      heliMesh.takeOut?.(activeLead.body);
      const safe = findSafeExit(hx, hz, Math.PI - heliCtrl.heading, [[2.8, 0], [-2.8, 0], [0, 3.2]], true);
      const f = activeLead.foot;
      f.x = safe.x;
      f.y = safe.y;
      f.z = safe.z;
      f.heading = Math.PI - heliCtrl.heading;
      f.v = 0;
      inHeli = false;
      activeLead.inVehicle = false;
      mover.mesh = activeLead.body;
      mover.gravity = -20;
      mover.setActive(true);
      world.queries?.();
      mover.place(f.x, f.y + 0.08, f.z);
      activeLead.body.position.set(f.x, f.y, f.z);
      activeLead.body.rotation.set(0, f.heading, 0);
      radio.listen({ inside: false, distance: 4 });
      if (!radio.now.on) scoreMusic?.resume();
      if (engineSound) engineSound.set({ vol: 0 }, 0.08);
      camRig.to('chase', 0.25, { distance: 5.8, height: 2.3, look: 1.35, walls: world });
      updateWieldModels();
      say('Stepped out of Solis Chopper', '#d8e6ff', 2.0);
      return;
    }
    if (inBoat && boatCtrl) {
      boatMesh.takeOut?.(activeLead.body);
      const safe = findSafeExit(boatCtrl.x, boatCtrl.z, Math.PI - boatCtrl.heading, [[2.4, 0], [-2.4, 0], [0, 2.8]], true);
      const f = activeLead.foot;
      f.x = safe.x;
      f.y = safe.y;
      f.z = safe.z;
      f.heading = Math.PI - boatCtrl.heading;
      f.v = 0;
      inBoat = false;
      activeLead.inVehicle = false;
      mover.mesh = activeLead.body;
      mover.gravity = -20;
      mover.setActive(true);
      world.queries?.();
      mover.place(f.x, f.y + 0.08, f.z);
      radio.listen({ inside: false, distance: 4 });
      if (!radio.now.on) scoreMusic?.resume();
      if (engineSound) engineSound.set({ vol: 0 }, 0.08);
      camRig.to('chase', 0.25, { distance: 5.8, height: 2.3, look: 1.35, walls: world });
      updateWieldModels();
      say('Stepped off Flamingo 24', '#d8e6ff', 2.0);
      return;
    }
    if (!inCar || !activeCarMesh) return;
    activeCarMesh.takeOut?.(activeLead.body);
    const carHeading = Math.PI / 2 - carCtrl.angle;
    const safe = findSafeExit(carCtrl.x, carCtrl.y, carHeading, [[-1.75, 0], [1.75, 0], [0, 3.0]], true);
    const f = activeLead.foot;
    f.x = safe.x;
    f.y = safe.y;
    f.z = safe.z;
    f.heading = carHeading;
    f.v = 0;
    inCar = false;
    activeLead.inVehicle = false;
    mover.mesh = activeLead.body;
    mover.gravity = -20;
    mover.setActive(true);
    world.queries?.();
    mover.place(f.x, f.y + 0.08, f.z);
    activeLead.body.position.set(f.x, f.y, f.z);
    activeLead.body.rotation.set(0, f.heading, 0);
    activeLead.body.rig.blend(BLEND_OPTS, 0);
    rigUpdOpts.speed = 0;
    rigUpdOpts.aim = 0;
    activeLead.body.rig.update(0, rigUpdOpts);
    radio.listen({ inside: false, distance: 4 });
    if (!radio.now.on) scoreMusic?.resume();
    if (engineSound) engineSound.set({ vol: 0 }, 0.08);
    camRig.to('chase', 0.25, { distance: 5.8, height: 2.3, look: 1.35, walls: world });
    updateWieldModels();
  };

  const tryBoardOrExit = () => {
    if (rideCooldown > 0) return;
    rideCooldown = 0.35;
    if (inCar || inBoat || inHeli) {
      stepOut();
      return;
    }
    const p = { x: activeLead.foot.x, z: activeLead.foot.z };
    if (heliCtrl && !heliMesh.wrecked && Math.hypot(heliCtrl.pos.x - p.x, heliCtrl.pos.z - p.z) < 6.2) {
      boardHeli();
      return;
    }
    if (bikeMesh && !bikeMesh.wrecked && Math.hypot(bikeMesh.position.x - p.x, bikeMesh.position.z - p.z) < 4.8) {
      const h = Math.atan2(-Math.sin(bikeMesh.rotation.y), -Math.cos(bikeMesh.rotation.y));
      seatLeadInCar(bikeMesh, bikeMesh.position.x, bikeMesh.position.z, h);
      return;
    }
    if (boatCtrl && !boatMesh.wrecked && Math.hypot(boatCtrl.x - p.x, boatCtrl.z - p.z) < 6.0) {
      boardBoat();
      return;
    }
    if (!barracuda.wrecked && Math.hypot(barracuda.position.x - p.x, barracuda.position.z - p.z) < 4.8) {
      const h = Math.atan2(-Math.sin(barracuda.rotation.y), -Math.cos(barracuda.rotation.y));
      seatLeadInCar(barracuda, barracuda.position.x, barracuda.position.z, h);
      return;
    }
    if (hotCoupe.visible && !hotCoupe.wrecked && Math.hypot(hotCoupe.position.x - p.x, hotCoupe.position.z - p.z) < 5.5) {
      const h = Math.atan2(-Math.sin(hotCoupe.rotation.y), -Math.cos(hotCoupe.rotation.y));
      seatLeadInCar(hotCoupe, hotCoupe.position.x, hotCoupe.position.z, h);
      return;
    }
    const nearParked = metro.cars.near(p, 5.5, { parked: true })[0];
    const nearTraffic = nearParked || metro.cars.near(p, 5.5)[0];
    if (nearTraffic) {
      const taken = metro.cars.take(nearTraffic, { driver: false, by: activeLead.body });
      if (taken) {
        v.scene.add(taken);
        const h = Math.atan2(-Math.sin(taken.rotation.y), -Math.cos(taken.rotation.y));
        seatLeadInCar(taken, taken.position.x, taken.position.z, h);
        return;
      }
    }
    say('Move closer to a car, bike, boat or chopper', '#ffd166', 1.8);
  };

  const swapLead = () => {
    if (inCar || inBoat || inHeli) stepOut(true);
    setAimMode(false);
    hide.leave();
    activeLead.foot.x = mover.feet.x;
    activeLead.foot.y = mover.feet.y;
    activeLead.foot.z = mover.feet.z;
    leadIdx = 1 - leadIdx;
    activeLead = leads[leadIdx];
    otherLead = leads[1 - leadIdx];

    const jumpDist = Math.hypot(activeLead.foot.x - otherLead.foot.x, activeLead.foot.z - otherLead.foot.z);
    if (jumpDist > 200 || !metro.districtAt(activeLead.foot.x, activeLead.foot.z, 40)) {
      metro.switchTo(activeLead.foot, { reset: true });
      for (const c of metro.cities) if (c.people && c.people.fullMax !== 0) c.people.fullMax = 0;
    }
    activeLead.foot.y = metro.ground(activeLead.foot.x, activeLead.foot.z, activeLead.foot.y + 1.5);
    world.queries?.();

    mover.mesh = activeLead.body;
    mover.gravity = -20;
    mover.setActive(true);
    mover.place(activeLead.foot.x, activeLead.foot.y + 0.08, activeLead.foot.z);

    // Put idle lead's weapon cleanly in hand & sync height
    const ow = otherLead.wields[otherLead.weaponKind];
    ow?.update(0, { how: 'low', hands: true, keep: false });

    v.cut?.();
    camRig.yaw = 0;
    camRig.pitch = 0;
    v.health = activeLead.health.frac;
    updateWieldModels();
    say(`Swapped to ${activeLead.name} (${activeLead.weaponKind.toUpperCase()})`, '#7ee8ff', 2.4);
  };

  const findAimAssistTarget = (camPos, camDir) => {
    let best = null;
    let bestDot = 0.95; // ~18 deg cone
    const testTarget = (x, y, z, kind, ref) => {
      const dx = x - camPos.x, dy = y - camPos.y, dz = z - camPos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 1.2 || dist > 55) return;
      const dot = (dx * camDir.x + dy * camDir.y + dz * camDir.z) / dist;
      if (dot > bestDot) {
        bestDot = dot;
        best = { x, y, z, dist, kind, ref };
      }
    };
    for (const o of law.officers) {
      if (o.gone || o.alive === false) continue;
      testTarget(o.x, (o.body?.position?.y ?? 0) + 1.25, o.z, 'officer', o);
    }
    for (const g of gangPool) {
      if (!g.alive) continue;
      testTarget(g.x, g.y + 1.22, g.z, 'gang', g);
    }
    for (const b of law.boats || []) {
      if (b.down) continue;
      const bx = b.craft?.x ?? b.model?.position?.x;
      const bz = b.craft?.z ?? b.model?.position?.z;
      if (bx != null && bz != null) testTarget(bx, 1.0, bz, 'boat', b);
    }
    if (law.heli && !law.heli.down && law.heli.model) {
      const hp = law.heli.model.position;
      testTarget(hp.x, hp.y, hp.z, 'heli', law.heli);
    }
    for (const b of explosives.list) {
      if (!b.gone) testTarget(b.x, b.y + 0.55, b.z, 'barrel', b);
    }
    if (!best) return null;
    aimDirObj.x = (best.x - camPos.x) / best.dist;
    aimDirObj.y = (best.y - camPos.y) / best.dist;
    aimDirObj.z = (best.z - camPos.z) / best.dist;
    const wall = world.ray(camPos, aimDirObj, Math.max(0.5, best.dist - 0.8), c => c !== mover?.rider && c !== mover);
    if (wall && wall.distance < best.dist - 1.2) return null;
    return best;
  };

  const spawnTracer = (from, to) => {
    let slot = tracerPool[0];
    for (const item of tracerPool) {
      if (item.life <= 0) { slot = item; break; }
      if (item.life < slot.life) slot = item;
    }
    tracerFromVec.set(from.x, from.y, from.z);
    tracerToVec.set(to.x, to.y, to.z);
    const len = tracerFromVec.distanceTo(tracerToVec);
    if (len < 0.2) return;
    tracerMidVec.lerpVectors(tracerFromVec, tracerToVec, 0.5);
    tracerDirVec.subVectors(tracerToVec, tracerFromVec).divideScalar(len);
    slot.mesh.position.copy(tracerMidVec);
    slot.mesh.quaternion.setFromUnitVectors(zForwardAxis, tracerDirVec);
    slot.mesh.scale.set(1, 1, Math.min(len, 18));
    slot.mesh.visible = true;
    slot.life = 0.055;
  };

  const triggerReload = () => {
    const k = activeLead.weaponKind;
    const gun = activeGun(activeLead);
    if (!gun || gun.reloading > 0) return false;
    if (gun.startReload()) {
      weaponSound(k, 'reload', activeLead.foot);
      if (aimMode && fpsAim && gunRig) gunRig.reload(gun.reload);
      say(`Reloading ${WEAPON_LABELS[k]}…`, '#ffd166', 1.2);
      return true;
    }
    return false;
  };

  const fireShot = () => {
    const k = activeLead.weaponKind;
    const f = activeLead.foot;

    // Melee baton swing on foot
    if (k === 'baton' && !inCar && !inBoat && !inHeli) {
      if (batonCd > 0) return;
      batonCd = 0.42;
      recentShotT = 0.5;
      f.heading = camRig.targetYaw + camRig.yaw;
      activeLead.body.rig.play?.('punch', { fade: 0.06 });
      weaponSound('baton', 'swing', f);
      camRig.shake(0.08);
      const fwdX = Math.sin(f.heading), fwdZ = Math.cos(f.heading);
      let hitAny = false;
      for (const o of law.officers) {
        if (o.gone || o.alive === false) continue;
        const dx = o.x - f.x, dz = o.z - f.z;
        const d = Math.hypot(dx, dz);
        if (d < 2.6 && (dx * fwdX + dz * fwdZ) / (d || 1) > 0.25) {
          law.hitOfficer(o, 40, o, f);
          markers.add(false, o.alive === false || o.gone);
          hitAny = true;
        }
      }
      for (const g of gangPool) {
        if (!g.alive) continue;
        const dx = g.x - f.x, dz = g.z - f.z;
        const d = Math.hypot(dx, dz);
        if (d < 2.6 && (dx * fwdX + dz * fwdZ) / (d || 1) > 0.25) {
          g.hp -= 40;
          _pushVec.x = fwdX * 3.2; _pushVec.y = 0.8; _pushVec.z = fwdZ * 3.2;
          g.react.hit(_pushVec, g);
          if (g.hp <= 0) koGangMember(g, false, 'KO');
          else markers.add(false, false);
          hitAny = true;
        }
      }
      if (hitAny) {
        weaponSound('baton', 'bash', f);
        law.crime('fight', playerQuery);
      }
      return;
    }

    // Thrown grenade on foot
    if (k === 'grenade' && !inCar && !inBoat && !inHeli) {
      if (grenadeCd > 0) return;
      if (activeLead.pouch.count('grenades') <= 0) {
        grenadeCd = 0.6;
        say('Out of Grenades — visit Bayside Arms!', '#ff6b6b', 2.0);
        return;
      }
      const gSlot = grenadePool.find(g => !g.active);
      if (!gSlot) return;
      activeLead.pouch.take('grenades', 1);
      grenadeCd = 0.75;
      recentShotT = 0.6;
      f.heading = camRig.targetYaw + camRig.yaw;
      activeLead.body.rig.play?.('punch', { fade: 0.06 });
      weaponSound('grenade', 'pin', f);
      v.cam.getWorldDirection(camDirVec);
      gSlot.active = true;
      gSlot.x = f.x + Math.sin(f.heading) * 0.55;
      gSlot.y = f.y + 1.48;
      gSlot.z = f.z + Math.cos(f.heading) * 0.55;
      gSlot.vx = camDirVec.x * 16.5;
      gSlot.vy = camDirVec.y * 16.5 + 4.8;
      gSlot.vz = camDirVec.z * 16.5;
      gSlot.fuse = 1.75;
      gSlot.mesh.position.set(gSlot.x, gSlot.y, gSlot.z);
      gSlot.mesh.visible = true;
      law.crime('shots', playerQuery);
      metro.people.scare(playerQuery, 22);
      if (law.stars < 1) law.set(1);
      return;
    }

    const gun = activeGun(activeLead);
    if (!gun) return;
    if (gun.ammo <= 0 && !gun.reloading) {
      triggerReload();
      return;
    }

    v.cam.getWorldDirection(camDirVec);
    camPosVec.copy(v.cam.position);
    const range = gun.range || 75;

    // 3rd-person crosshair convergence + soft aim assist
    let convDist = range;
    const camWall = world.ray(camPosVec, camDirVec, range, c => c !== mover?.rider && c !== mover);
    if (camWall && camWall.distance > 1.2) convDist = camWall.distance;
    if (lockedTarget && lockedTarget.dist < convDist + 0.5) {
      shootTargetVec.set(lockedTarget.x, lockedTarget.y, lockedTarget.z);
    } else {
      shootTargetVec.copy(camPosVec).addScaledVector(camDirVec, convDist);
    }

    let fired = [];
    const activeWield = activeLead.wields[k];
    if ((inCar || inBoat) && driveBy) {
      const df = driveBy.from;
      aimDirObj.x = shootTargetVec.x - df.x;
      aimDirObj.y = shootTargetVec.y - df.y;
      aimDirObj.z = shootTargetVec.z - df.z;
      const dl = Math.hypot(aimDirObj.x, aimDirObj.y, aimDirObj.z) || 1;
      aimDirObj.x /= dl; aimDirObj.y /= dl; aimDirObj.z /= dl;
      driveBy.aim(aimDirObj);
      fired = driveBy.fire(gun, true);
      if (fired.length) {
        weaponSound(k, 'fire', driveBy.from);
        if (driveBy.glass && activeCarMesh?.hit) activeCarMesh.hit(driveBy.glass, { power: 0.2 });
      }
    } else if (hide.busy && hide.muzzle) {
      aimOrigin.x = hide.muzzle.x;
      aimOrigin.y = hide.muzzle.y;
      aimOrigin.z = hide.muzzle.z;
      aimDirObj.x = shootTargetVec.x - aimOrigin.x;
      aimDirObj.y = shootTargetVec.y - aimOrigin.y;
      aimDirObj.z = shootTargetVec.z - aimOrigin.z;
      const dl = Math.hypot(aimDirObj.x, aimDirObj.y, aimDirObj.z) || 1;
      aimDirObj.x /= dl; aimDirObj.y /= dl; aimDirObj.z /= dl;
      fired = gun.pull(aimOrigin, aimDirObj, true);
      if (fired.length) weaponSound(k, 'fire', aimOrigin);
    } else if (aimMode && fpsAim) {
      aimOrigin.x = camPosVec.x + camDirVec.x * 0.45;
      aimOrigin.y = camPosVec.y + camDirVec.y * 0.45;
      aimOrigin.z = camPosVec.z + camDirVec.z * 0.45;
      aimDirObj.x = shootTargetVec.x - aimOrigin.x;
      aimDirObj.y = shootTargetVec.y - aimOrigin.y;
      aimDirObj.z = shootTargetVec.z - aimOrigin.z;
      const dl = Math.hypot(aimDirObj.x, aimDirObj.y, aimDirObj.z) || 1;
      aimDirObj.x /= dl; aimDirObj.y /= dl; aimDirObj.z /= dl;
      fired = gun.pull(aimOrigin, aimDirObj, true);
      if (fired.length) weaponSound(k, 'fire', aimOrigin);
    } else {
      f.heading = camRig.targetYaw + camRig.yaw;
      recentShotT = 0.7;
      activeWield?.update(0, { how: aimMode ? 'aim' : 'hip', pitch: Math.asin(clamp(camDirVec.y, -1, 1)), yaw: 0, hands: true, keep: true });
      const mp = activeWield?.muzzle;
      if (mp && (mp.x !== 0 || mp.y !== 0 || mp.z !== 0)) {
        aimOrigin.x = mp.x;
        aimOrigin.y = mp.y;
        aimOrigin.z = mp.z;
      } else {
        aimOrigin.x = f.x + Math.sin(f.heading) * 0.5;
        aimOrigin.y = f.y + 1.42;
        aimOrigin.z = f.z + Math.cos(f.heading) * 0.5;
      }
      aimDirObj.x = shootTargetVec.x - aimOrigin.x;
      aimDirObj.y = shootTargetVec.y - aimOrigin.y;
      aimDirObj.z = shootTargetVec.z - aimOrigin.z;
      const dl = Math.hypot(aimDirObj.x, aimDirObj.y, aimDirObj.z) || 1;
      aimDirObj.x /= dl; aimDirObj.y /= dl; aimDirObj.z /= dl;
      fired = gun.pull(aimOrigin, aimDirObj, true);
      if (fired.length) weaponSound(k, 'fire', aimOrigin);
    }

    if (!fired.length) return;
    recentShotT = 0.7;
    law.crime('shots', playerQuery);
    metro.people.scare(playerQuery, 26);
    if (law.stars < 1) law.set(1);

    const rec = ARSENAL[k]?.gun?.recoil ?? 0.05;
    camRig.recoil(rec * (aimMode ? 0.55 : 0.8), (Math.random() - 0.5) * rec * 0.45);
    camRig.shake(aimMode ? 0.07 : 0.05);
    if (aimMode && fpsAim && gunRig) gunRig.fire(1, k);

    impacts.muzzle(fired[0].from, fired[0].dir, { kind: k });
    const ejectNode = activeWield?.gun?.points?.eject;
    if (ARSENAL[k]?.shell) {
      impacts.shell(ejectNode || fired[0].from, { kind: k });
    }

    // RPG launcher fires tracked physical rockets via gs.combat.Shots
    if (k === 'launcher') {
      for (const s of fired) {
        const rSlot = rocketPool.find(r => !r.active) || rocketPool[0];
        rSlot.active = true;
        rSlot.smokeT = 0;
        rSlot.mesh.position.set(s.from.x, s.from.y, s.from.z);
        tracerDirVec.set(s.dir.x, s.dir.y, s.dir.z).normalize();
        rSlot.mesh.quaternion.setFromUnitVectors(zForwardAxis, tracerDirVec);
        rSlot.mesh.visible = true;
        shots.add(s, { rocketSlot: rSlot, not: mover?.rider });
      }
      return;
    }

    for (const s of fired) {
      let endDist = Math.min(range, 55);
      let hitHandled = false;

      // 1. Check explosive barrels along ray
      for (const b of explosives.list) {
        if (b.gone) continue;
        const bx = b.x - s.from.x, by = b.y + 0.55 - s.from.y, bz = b.z - s.from.z;
        const tProj = bx * s.dir.x + by * s.dir.y + bz * s.dir.z;
        if (tProj > 0 && tProj < range) {
          const px = s.from.x + s.dir.x * tProj - b.x;
          const py = s.from.y + s.dir.y * tProj - (b.y + 0.55);
          const pz = s.from.z + s.dir.z * tProj - b.z;
          if (px * px + py * py + pz * pz < 0.36 && tProj < endDist) {
            endDist = tProj;
            barrelBoomHit.point.set(s.from.x + s.dir.x * tProj, s.from.y + s.dir.y * tProj, s.from.z + s.dir.z * tProj);
            impacts.hit(barrelBoomHit, { surface: 'metal', from: s.from, mark: false });
            explosives.light(b, true);
            hasLitBarrel = true;
            markers.add(false, true);
            hitHandled = true;
            break;
          }
        }
      }

      // 2. Check rival gang NPCs
      if (!hitHandled) {
        for (const g of gangPool) {
          if (!g.alive) continue;
          const gx = g.x - s.from.x, gz = g.z - s.from.z;
          const a = s.dir.x * s.dir.x + s.dir.z * s.dir.z || 1;
          const tg = (gx * s.dir.x + gz * s.dir.z) / a;
          if (tg <= 0 || tg > range) continue;
          const dist3 = tg * Math.sqrt(a + s.dir.y * s.dir.y);
          if (dist3 >= endDist) continue;
          const cx = s.from.x + s.dir.x * tg - g.x;
          const cz = s.from.z + s.dir.z * tg - g.z;
          const hy = s.from.y + s.dir.y * tg - g.y;
          if (cx * cx + cz * cz < 0.16 && hy > 0.35 && hy < 1.85) {
            endDist = dist3;
            const head = hy > 1.52;
            const dmg = s.damageAt(dist3, head);
            g.hp -= dmg;
            _pushVec.x = s.dir.x * 2.4; _pushVec.y = 0.5; _pushVec.z = s.dir.z * 2.4;
            barrelBoomHit.point.set(s.from.x + s.dir.x * tg, s.from.y + s.dir.y * tg, s.from.z + s.dir.z * tg);
            g.react.hit(_pushVec, barrelBoomHit.point);
            impacts.hit(barrelBoomHit, { surface: 'cloth', from: s.from, mark: false });
            if (g.hp <= 0) koGangMember(g, head, 'KO');
            else markers.add(head, false);
            hitHandled = true;
            break;
          }
        }
      }

      // 3. Check SBPD officers, boats, heli
      if (!hitHandled) {
        const lawHit = law.shoot(s.from, s.dir, { damage: s.damage, range });
        if (lawHit) {
          endDist = lawHit.d ?? Math.hypot(lawHit.point.x - s.from.x, lawHit.point.y - s.from.y, lawHit.point.z - s.from.z);
          markers.add(!!lawHit.head, !!lawHit.down);
          impacts.hit({ point: lawHit.point }, { surface: lawHit.kind === 'officer' ? 'cloth' : 'metal', from: s.from, mark: false });
          feel.hit?.(W * 0.5, H * 0.45, { power: 0.35 });
          hitHandled = true;
        }
      }

      // 4. World wall / floor / prop hit
      if (!hitHandled) {
        const wHit = world.ray(s.from, s.dir, range, c => c !== mover?.rider && c !== mover);
        if (wHit && wHit.point) {
          endDist = wHit.distance;
          impacts.hit(wHit, { from: s.from, mark: !!decalTargetMeshes.includes(wHit.mesh) || wHit.mesh === yardGround?.mesh });
        }
      }

      tracerToVec.set(
        s.from.x + s.dir.x * endDist,
        s.from.y + s.dir.y * endDist,
        s.from.z + s.dir.z * endDist
      );
      spawnTracer(s.from, tracerToVec);
    }
  };

  // Interactive HUD hitboxes (dynamic layout, clear of api.scoreArea(), minimap & thumbsticks)
  const rdRect = { x: 8, y: 150, w: 170, h: 30 };
  const rdPrevRect = { x: 8, y: 150, w: 24, h: 30 };
  const rdNextRect = { x: 154, y: 150, w: 24, h: 30 };
  const mrRect = { x: W - 90, y: 10, w: 80, h: 80 };
  const swapRect = { x: 8, y: 80, w: 72, h: 22 };
  const gunRect = { x: 84, y: 80, w: 96, h: 22 };
  const covRect = { x: 8, y: 106, w: 74, h: 22 };
  const camRect = { x: 86, y: 106, w: 72, h: 22 };
  const shopActionRect = { x: 60, y: H - 90, w: 180, h: 28 };
  const shopAltRect = { x: 60, y: H - 58, w: 180, h: 28 };
  const wheelPanelRect = { x: 20, y: 80, w: 260, h: 260 };
  const phoneCardRect = { x: 20, y: 20, w: 160, h: 46 };
  const hudLayout = { mr: mrRect, maxHudW: 160, topY: 8 };

  const layoutTopHud = () => {
    if (W === lastHudW && H === lastHudH && weaponWheelOpen === lastHudWeaponOpen) return hudLayout;
    lastHudW = W;
    lastHudH = H;
    lastHudWeaponOpen = weaponWheelOpen;
    const s = Math.min(82, W * 0.25);
    mrRect.x = W - s - 10;
    mrRect.y = 10;
    mrRect.w = s;
    mrRect.h = s;
    const maxW = Math.max(134, Math.min(194, mrRect.x - 16));
    const sa = api.scoreArea ? api.scoreArea() : null;
    const topY = sa && 8 + maxW > sa.x - 2 ? Math.round(sa.bottom + 4) : 8;

    const pillY1 = topY + 76;
    const pillY2 = pillY1 + 26;
    swapRect.x = 8;
    swapRect.y = pillY1;
    swapRect.w = Math.min(78, Math.floor((maxW - 4) * 0.44));

    gunRect.x = swapRect.x + swapRect.w + 4;
    gunRect.y = pillY1;
    gunRect.w = Math.max(72, maxW - swapRect.w - 4);

    covRect.x = 8;
    covRect.y = pillY2;
    covRect.w = Math.min(86, Math.floor((maxW - 4) * 0.54));

    camRect.x = covRect.x + covRect.w + 4;
    camRect.y = pillY2;
    camRect.w = Math.max(54, maxW - covRect.w - 4);

    // Place radio bar completely clear of left thumbstick!
    if (W >= 420) {
      rdRect.w = 216;
      rdRect.h = 32;
      rdRect.x = Math.round((W - rdRect.w) * 0.5);
      rdRect.y = H - 40;
    } else {
      rdRect.x = 8;
      rdRect.y = pillY2 + 26;
      rdRect.w = maxW;
      rdRect.h = 28;
    }
    rdPrevRect.x = rdRect.x;
    rdPrevRect.y = rdRect.y;
    rdPrevRect.w = 24;
    rdPrevRect.h = rdRect.h;
    rdNextRect.x = rdRect.x + rdRect.w - 24;
    rdNextRect.y = rdRect.y;
    rdNextRect.w = 24;
    rdNextRect.h = rdRect.h;

    const pw = Math.min(264, W - 28);
    wheelPanelRect.w = pw;
    wheelPanelRect.x = Math.round((W - pw) * 0.5);
    wheelPanelRect.h = weaponWheelOpen ? 248 : 262;
    wheelPanelRect.y = Math.round(Math.max(topY + 30, (H - wheelPanelRect.h) * 0.44));

    const sbW = Math.min(210, W - 100);
    shopActionRect.w = sbW;
    shopActionRect.h = 26;
    shopActionRect.x = Math.round((W - sbW) * 0.5);
    shopActionRect.y = W >= 420 ? H - 74 : H - 122;
    shopAltRect.w = sbW;
    shopAltRect.h = 26;
    shopAltRect.x = shopActionRect.x;
    shopAltRect.y = shopActionRect.y + 30;

    const centerGap = mrRect.x - (8 + maxW) - 12;
    if (W >= 460 && centerGap >= 140) {
      phoneCardRect.w = Math.min(196, centerGap);
      phoneCardRect.h = 42;
      phoneCardRect.x = Math.round(8 + maxW + (centerGap + 12 - phoneCardRect.w) * 0.5);
      phoneCardRect.y = sa ? Math.round(sa.bottom + 4) : 10;
    } else {
      phoneCardRect.w = Math.min(256, W - 20);
      phoneCardRect.h = 38;
      phoneCardRect.x = 10;
      phoneCardRect.y = W >= 420 ? topY + 132 : rdRect.y + rdRect.h + 6;
    }

    hudLayout.maxHudW = maxW;
    hudLayout.topY = topY;
    return hudLayout;
  };

  const hitBox = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  const tuneRadioStation = (idx) => {
    radioStarted = true;
    const len = radio.stations.length;
    const targetIdx = ((idx % len) + len) % len;
    savedStationIdx = targetIdx;
    radio.tune(targetIdx);
    if (!radio.power) radio.on();
    scoreMusic?.pause();
    radioDirty = true;
    sounds.click();
    worldSave?.soon(0.5);
  };

  const turnRadioOff = () => {
    radio.off();
    if (!radio.power) scoreMusic?.resume();
    radioDirty = true;
    sounds.click();
  };

  const resetPickupsAndBarrels = () => {
    pickups.clear();
    const spots = [
      { x: YARD_X - 8, y: YARD_Y + 0.35, z: YARD_Z - 4, kind: 'rifle', respawn: 35 },
      { x: YARD_X + 6, y: YARD_Y + 0.35, z: YARD_Z + 5, kind: 'health', amount: 40, respawn: 25 },
      { x: BEACH_LOT.x - 4, y: BEACH_LOT.y + 0.35, z: BEACH_LOT.z + 2, kind: 'ammo', of: 'pistol', amount: 36, respawn: 20 },
      { x: DOCK_POS.x - 6, y: DOCK_POS.y + 0.35, z: DOCK_POS.z + 4, kind: 'shotgun', respawn: 35 },
      { x: ARMS_POS.x + 6, y: ARMS_POS.y + 0.35, z: ARMS_POS.z + 4, kind: 'ammo', of: 'rifle', amount: 30, respawn: 25 },
    ];
    spots.forEach((s, idx) => {
      const p = pickups.add(s);
      p.meshIdx = idx;
    });

    explosives.list.length = 0;
    const barrelSpots = [
      [YARD_X - 9, YARD_Z + 4],
      [YARD_X + 9, YARD_Z - 5],
      [YARD_X + 10.2, YARD_Z - 4.3],
      [BEACH_LOT.x - 5.5, BEACH_LOT.z - 4.5],
    ];
    barrelPool.forEach((bp, i) => {
      const [bx, bz] = barrelSpots[i];
      const by = metro.ground(bx, bz);
      bp.x = bx; bp.y = by; bp.z = bz;
      bp.mesh.position.set(bx, by, bz);
      bp.mesh.visible = true;
      bp.exp = explosives.add({ x: bx, y: by, z: bz, radius: 7.5, damage: 95, fuse: 0.14 });
    });
  };

  const nearServiceShop = () => {
    const px = playerQuery.x, pz = playerQuery.z;
    if (Math.hypot(px - RESPRAY_POS.x, pz - RESPRAY_POS.z) < 8.5) return 'respray';
    if (Math.hypot(px - ARMS_POS.x, pz - ARMS_POS.z) < 8.5) return 'arms';
    if (Math.hypot(px - dinerPos.x, pz - dinerPos.z) < 8.5) return 'diner';
    return null;
  };

  const nextLockedWeapon = () => WEAPON_ORDER.find(k => !activeLead.unlocked.has(k)) || null;

  const completeEscrowShakedown = (pressured) => {
    shakedownOpen = false;
    jobsDoneCount++;
    const bonus = pressured ? 150 : 0;
    const basePay = job.pay + bonus;
    const pay = activeLead.name === 'Nadia' ? Math.round(basePay * 1.2) : basePay;
    cash += pay;
    rep?.did('mission');
    if (law.stars < job.heat) law.set(job.heat);
    say(pressured ? `Adjuster squeezed! +${job.rep} Rep · +$${pay}` : `Ledger secured! +${job.rep} Rep · +$${pay}`, '#68f8c4', 3.4);
    if (awardRep(job.rep, `+${job.rep} REP · +$${pay}`, '#68f8c4')) return;
    announceNews('Old Naranja shopkeepers report a ledger heist', false);
    assignJob(jobIdx + 1);
  };

  const useServiceAction = (slot) => {
    const shop = nearServiceShop();
    if (!shop) return false;
    if (shop === 'diner') {
      if (slot === 0) {
        activeLead.health.heal(100);
        sky.time = (sky.time + 4) % 24;
        sky.update(0);
        updateAtmosphere(0, true);
        worldSave?.soon(0.1);
        sounds.confirm?.();
        feel.coin(W * 0.5, H * 0.42, { color: '#ffcf5c', text: 'RESTED · FULL HP' });
        say("Rested at Tia Carmen's Diner (+4h · Full HP)", '#ffcf5c', 2.8);
        return true;
      }
      if (slot === 1) {
        swapLead();
        return true;
      }
      return false;
    }
    if (shop === 'respray') {
      const cost = cash >= 250 ? 250 : law.stars > 0 && jobsDoneCount === 0 ? 0 : 250;
      if (cash < cost) {
        say('Need $250 for Solis Customs!', '#ff6b6b', 2.0);
        return true;
      }
      cash -= cost;
      law.set(0);
      paintIdx = (paintIdx + 1) % CUSTOMS_PAINTS.length;
      const paint = CUSTOMS_PAINTS[paintIdx];
      const paintTarget = inCar && activeCarMesh ? activeCarMesh : barracuda;
      paintTarget?.mend?.();
      paintTarget._tuned = true;
      applyVehiclePaint(paintTarget, paint.hex);
      fx3d.sparks(playerQuery, { color: paint.hex, count: 24, power: 1.1 });
      sounds.confirm?.();
      feel.coin(W * 0.5, H * 0.42, { color: '#3cd8ff', text: cost ? `${paint.name} -$250` : paint.name });
      say(`Painted ${paint.name} · +8% Tune · Heat Cleared!`, '#3cd8ff', 2.8);
      worldSave?.soon(0.4);
      return true;
    }
    if (shop === 'arms') {
      if (slot === 0) {
        if (cash < 150) { say('Need $150 for Armor & Ammo', '#ff6b6b', 2.0); return true; }
        cash -= 150;
        activeLead.health.addArmour(50);
        activeLead.pouch.add('pistol', 36);
        activeLead.pouch.add('shells', 12);
        activeLead.pouch.add('rifle', 45);
        activeLead.pouch.add('grenades', 2);
        activeLead.pouch.add('rockets', 2);
        sounds.reload?.();
        feel.coin(W * 0.5, H * 0.42, { color: '#48e08a', text: '+50 ARMOR & AMMO' });
        say('Armor, Ammo & Heavy Gear Restocked!', '#48e08a', 2.2);
        worldSave?.soon(0.4);
        return true;
      }
      const nextW = nextLockedWeapon();
      if (nextW) {
        const price = WEAPON_COSTS[nextW];
        if (cash < price) { say(`Need $${price} for ${WEAPON_LABELS[nextW]}`, '#ff6b6b', 2.0); return true; }
        cash -= price;
        for (const ld of leads) ld.unlocked.add(nextW);
        equipWeapon(activeLead, nextW);
        sounds.confirm?.();
        feel.coin(W * 0.5, H * 0.42, { color: '#ffb24a', text: `${WEAPON_LABELS[nextW]} UNLOCKED` });
        say(`Unlocked ${WEAPON_LABELS[nextW]}!`, '#ffb24a', 2.5);
        worldSave?.soon(0.4);
        return true;
      }
    }
    return false;
  };

  const wireEvents = () => {
    for (const veh of [barracuda, hotCoupe, bikeMesh, heliMesh, boatMesh]) wireVehicleWreck(veh);

    if (!lawWired) {
      lawWired = true;
      law.on('escaped', () => {
        say(`SBPD Shaken! +${K.escapeRep} Rep`, '#78ff98', 3.0);
        awardRep(K.escapeRep, `+${K.escapeRep} ESCAPE`, '#78ff98');
        scoreMusic?.hit(0.75);
      });
      law.on('busted', () => {
        triggerOver('BUSTED');
      });
      law.on('shot', s => {
        if (!s.hit || !activeLead || overKind) return;
        const mult = hide.busy ? hide.exposed : 1;
        const lost = activeLead.health.hurt(s.damage * mult, { from: s.from, at: activeLead.foot, facing: activeLead.foot.heading });
        if (lost > 0) {
          v.hit?.(lost);
          v.health = activeLead.health.frac;
          camRig.shake(0.24);
          feel.hit?.(W * 0.5, H * 0.5, { power: 0.35 });
          if (activeLead.health.dead) triggerOver('WASTED');
        }
      });
      law.on('officer down', () => {
        cash += 45;
        awardRep(6, '+6 KO · +$45', '#ff9f43');
        scoreMusic?.hit(0.95);
      });
      law.on('boat down', () => {
        cash += 120;
        awardRep(12, '+12 BOAT', '#ff9f43');
        scoreMusic?.hit(1.0);
      });
      law.on('heli down', () => {
        cash += 250;
        awardRep(18, '+18 CHOPPER', '#ff9f43');
        scoreMusic?.hit(1.0);
      });
    }

    if (!expWired) {
      expWired = true;
      explosives.on('boom', e => {
        for (const bp of barrelPool) {
          if (bp.exp && bp.exp.gone) bp.mesh.visible = false;
        }
        detonateAt(e.at.x, e.at.y, e.at.z, e.radius || 7.5, e.damage || 95);
      });
    }
  };

  return {
    reset() {
      if (!worldReady) setupWorld(api);
      R = rng(409);
      t = 0;
      score = 0;
      api.score(0);
      cash = 500;
      jobsDoneCount = 0;
      savedStationIdx = 0;
      hitT = 0;
      rideCooldown = 0;
      recentShotT = 0;
      batonCd = 0;
      grenadeCd = 0;
      driftSec = 0;
      driftSkidCd = 0;
      driftSmokeAcc = 0;
      newsCooldown = 0;
      carJumpT = 0;
      paintIdx = 0;
      shakedownOpen = false;
      cratesLeft = 0;
      bayCrates = [];
      for (const sj of stuntJumps) sj.cd = 0;
      for (const bm of bayCrateMeshes) bm.visible = false;
      for (const gm of grenadePool) { gm.active = false; gm.mesh.visible = false; }
      for (const rm of rocketPool) { rm.active = false; rm.mesh.visible = false; }
      shots.list.length = 0;
      lockedTarget = null;
      aimMode = false;
      fpsAim = false;
      hipShoulder = false;
      hasLitBarrel = false;
      radioDirty = true;
      weaponWheelOpen = false;
      radioWheelOpen = false;
      fireHeld = false;
      overKind = null;
      overT = 0;
      phoneT = 0;
      phoneHoldLeft = 0;
      lastHudW = -1;
      lastSwapName = '';
      lastModeLead = '';
      lastModeKind = '';
      lastLawSec = -1;
      rideKey = coverKey = swapKey = gunKey = aimKey = false;
      bannerText = '';
      bannerCol = '#ffffff';
      bannerT = 0;
      radioStarted = false;
      radio.hold(false);
      radio.off();
      radio.listen({ inside: false, distance: 0 });
      try { mixer.place(null, 0.05); } catch {}
      scoreStarted = false;
      skyTick = 1;
      poseTick = 0;
      lawTick = 1;
      lawDt = 0;
      gpsDt = 0;
      pendingRadioOn = 0;
      pendingGpsGoal = null;
      pendingGpsLabel = '';
      pendingGpsDelay = 0;
      pendingPickupLaw = null;
      lastScoreThreat = -1;
      lastScoreFinal = false;
      lastCarLights = null;
      lastActiveCarMesh = null;
      lastActiveCarLit = null;
      lastWantedStars = 0;
      wasIndoor = false;
      gpsShown = false;
      lastClockStr = '15:36';
      lastClockMin = -1;
      lastDistHud = '';
      lastAmmoKind = '';
      lastCashVal = -1;
      lastSpeedVal = -1;
      lastNextIn = -1;
      lastDistrictName = 'Coral Strip';
      hudSub = 'Board Barracuda or boost Palma GT';
      if (yardPropsGroup) yardPropsGroup.visible = true;
      if (yardGround?.mesh) yardGround.mesh.visible = true;

      if (!engineSound) {
        engineSound = bed({ vol: 0, from: 110, filter: 'lowpass', q: 4 });
        try { noise(0.01, { vol: 0 }); } catch {}
      } else {
        engineSound.set({ vol: 0 }, 0.02);
      }

      rep = new Reputation({
        factions: { pastel: { start: -10 }, flota: { start: -15 }, salvage: { start: -15 }, civ: { start: 10 } },
        deeds: { crewKo: { fame: 5 }, mission: { fame: 12, civ: 5 }, stunt: { fame: 8 } },
      });

      const mkPouch = new Pouch({ pistol: 72, rifle: 60, shells: 18, grenades: 3, rockets: 3 }, { max: { pistol: 240, shells: 60, rifle: 240, grenades: 8, rockets: 6 } });
      const ndPouch = new Pouch({ pistol: 96, rifle: 60, shells: 16, grenades: 3, rockets: 3 }, { max: { pistol: 240, shells: 60, rifle: 240, grenades: 8, rockets: 6 } });
      const mkHp = new Health({ max: 100, regen: 2.2, delay: 6, armour: 25, maxArmour: 100 });
      const ndHp = new Health({ max: 100, regen: 2.2, delay: 6, armour: 50, maxArmour: 100 });

      const makeLeadGuns = (pouch) => ({
        pistol: arm('pistol', { pouch }),
        smg: arm('smg', { pouch }),
        shotgun: arm('shotgun', { pouch }),
        rifle: arm('rifle', { pouch }),
        sniper: arm('sniper', { pouch }),
        launcher: arm('launcher', { pouch }),
      });

      const savedUnlocks = new Set(['baton', 'pistol']);
      const nadiaUnlocks = new Set(['baton', 'pistol', 'smg']);

      leads = [
        {
          name: 'Mako',
          body: mako,
          wields: wpWieldMako,
          pouch: mkPouch,
          health: mkHp,
          guns: makeLeadGuns(mkPouch),
          unlocked: new Set(savedUnlocks),
          weaponKind: 'pistol',
          foot: { x: 0, y: 0.15, z: 0, heading: 0, v: 0 },
          inVehicle: false,
        },
        {
          name: 'Nadia',
          body: nadia,
          wields: wpWieldNadia,
          pouch: ndPouch,
          health: ndHp,
          guns: makeLeadGuns(ndPouch),
          unlocked: new Set(nadiaUnlocks),
          weaponKind: 'smg',
          foot: { x: 0, y: 0.15, z: 0, heading: Math.PI, v: 0 },
          inVehicle: false,
        },
      ];
      leadIdx = 0;
      activeLead = leads[0];
      otherLead = leads[1];

      if (!saveWired) {
        saveWired = true;
        worldSave.keep(
          'solis',
          () => ({
            cash,
            stationIdx: savedStationIdx,
            jobsDone: jobsDoneCount,
            paintIdx,
            unlocks: [...activeLead.unlocked],
            rep: rep?.pack(),
          }),
          (d) => {
            if (!d) return;
            if (typeof d.cash === 'number') cash = Math.max(250, d.cash);
            if (typeof d.stationIdx === 'number') savedStationIdx = ((d.stationIdx % STATIONS.length) + STATIONS.length) % STATIONS.length;
            if (typeof d.jobsDone === 'number') jobsDoneCount = d.jobsDone;
            if (typeof d.paintIdx === 'number') paintIdx = ((d.paintIdx % CUSTOMS_PAINTS.length) + CUSTOMS_PAINTS.length) % CUSTOMS_PAINTS.length;
            if (d.rep) rep?.unpack(d.rep);
            if (Array.isArray(d.unlocks)) {
              for (const u of d.unlocks) {
                if (WEAPON_ORDER.includes(u)) {
                  leads[0].unlocked.add(u);
                  leads[1].unlocked.add(u);
                }
              }
            }
          }
        );
      }
      worldSave.load();
      radio.tune(savedStationIdx);

      // Prepare ground collider BEFORE placing both characters!
      const makoSpot = placeAtDistrict('Coral Strip');
      metro.prepare(makoSpot).reset(makoSpot);
      for (const c of metro.cities) if (c.people) c.people.fullMax = 0;
      lastCityCount = metro.cities.length;
      world.queries?.();

      makoSpot.y = metro.ground(makoSpot.x, makoSpot.z);
      const mh = makoSpot.heading || 0;
      const nx = makoSpot.x + Math.sin(mh) * 4.5 - Math.cos(mh) * 2.0;
      const nz = makoSpot.z + Math.cos(mh) * 4.5 + Math.sin(mh) * 2.0;
      const nadiaSpot = { x: nx, y: metro.ground(nx, nz), z: nz, heading: mh + Math.PI };
      metro.collide(nadiaSpot, 0.45, nadiaSpot.y);
      nadiaSpot.y = metro.ground(nadiaSpot.x, nadiaSpot.z);

      leads[0].foot.x = makoSpot.x; leads[0].foot.y = makoSpot.y; leads[0].foot.z = makoSpot.z; leads[0].foot.heading = mh;
      leads[1].foot.x = nadiaSpot.x; leads[1].foot.y = nadiaSpot.y; leads[1].foot.z = nadiaSpot.z; leads[1].foot.heading = nadiaSpot.heading;

      law.reset();
      hide.reset();
      swim.reset();
      impacts.clear();
      fx3d.clear();
      markers.list.length = 0;
      for (const tm of tracerPool) { tm.mesh.visible = false; tm.life = 0; }
      if (inside?.regions) {
        inside.regions.want([]);
        inside.regions.trim(0);
        inside.room = null;
      }
      resetPickupsAndBarrels();

      if (!mover) mover = makeRiderMover(world, mako, { radius: 0.38, height: 1.8 });
      mover.mesh = mako;
      mover.gravity = -20;
      mover.walk(0, 0);
      mover.setActive(true);
      mover.place(activeLead.foot.x, activeLead.foot.y + 0.08, activeLead.foot.z);

      if (boatCtrl?.rider) boatCtrl.rider.remove();
      boatCtrl = new Boat(metro.water, { at: SLIP_POS, heading: SLIP_POS.heading, world, vehicle: boatMesh, power: 12, top: 21 });

      if (heliCtrl?.rider) heliCtrl.rider.remove();
      const heliGroundY = metro.ground(HELI_POS.x, HELI_POS.z);
      heliCtrl = new Hover({
        at: { x: HELI_POS.x, y: heliGroundY, z: HELI_POS.z },
        heading: 0,
        climb: 9,
        speed: 24,
        accel: 15,
        turn: 2.1,
        tilt: 0.26,
        world,
        vehicle: heliMesh,
        ground: (x, z) => metro.ground(x, z),
        crashSpeed: 7.5,
      });

      sky.time = 15.6;
      sky.speed = K.daySpeed;
      sky.update(0);

      activeCarMesh?.takeOut?.(mako);
      activeCarMesh?.takeOut?.(nadia);
      boatMesh?.takeOut?.(mako);
      boatMesh?.takeOut?.(nadia);
      heliMesh?.takeOut?.(mako);
      heliMesh?.takeOut?.(nadia);
      for (const veh of [barracuda, hotCoupe, bikeMesh, heliMesh, boatMesh]) {
        veh?.mend?.();
        veh._tuned = false;
      }
      activeCarMesh = null;
      driveBy = null;
      inCar = false;
      inBoat = false;
      inHeli = false;

      mako.lod = warmedCop ? 1 : 0;
      nadia.lod = 1;
      mako.position.set(activeLead.foot.x, activeLead.foot.y, activeLead.foot.z);
      mako.rotation.set(0, activeLead.foot.heading, 0);
      mako.rig.blend(BLEND_OPTS, 0);
      rigUpdOpts.speed = 0;
      rigUpdOpts.aim = 0;
      mako.rig.update(0, rigUpdOpts);
      if (!warmedCop) {
        nadia.position.set(
          activeLead.foot.x + Math.sin(activeLead.foot.heading) * 1.8 - Math.cos(activeLead.foot.heading) * 0.6,
          activeLead.foot.y,
          activeLead.foot.z + Math.cos(activeLead.foot.heading) * 1.8 + Math.sin(activeLead.foot.heading) * 0.6
        );
      } else {
        nadia.position.set(otherLead.foot.x, otherLead.foot.y, otherLead.foot.z);
      }
      nadia.rotation.set(0, otherLead.foot.heading, 0);
      nadia.rig.blend(BLEND_OPTS, 0);
      nadia.rig.update(0, rigUpdOpts);

      if (!warmedCop) {
        // Warm particles, brass shells, and tracer shader behind Play loading screen
        fx3d.sparks(makoSpot, { count: 2, light: false });
        impacts.shell(makoSpot, { kind: 'pistol' });
        impacts.shell(makoSpot, { kind: 'rifle' });
        impacts.shell(makoSpot, { kind: 'shotgun' });
        tracerPool[0].mesh.position.set(makoSpot.x, makoSpot.y + 1.2, makoSpot.z + 2);
        tracerPool[0].mesh.visible = true;
        if (warmupCop) {
          warmupCop.lod = 0;
          warmupCop.position.set(
            activeLead.foot.x + Math.sin(activeLead.foot.heading) * 1.4,
            activeLead.foot.y,
            activeLead.foot.z + Math.cos(activeLead.foot.heading) * 1.4
          );
          warmupCop.rotation.set(0, activeLead.foot.heading + Math.PI, 0);
          warmupCop.visible = true;
          if (!warmupCop.parent) v.scene.add(warmupCop);
        }
      }

      playerQuery.x = activeLead.foot.x;
      playerQuery.y = activeLead.foot.y;
      playerQuery.z = activeLead.foot.z;
      playerQuery.heading = activeLead.foot.heading;
      playerQuery.v = 0;
      playerQuery.car = false;
      playerQuery.boat = false;
      playerQuery.swim = false;

      updateAtmosphere(0, true);

      const bx = activeLead.foot.x + Math.sin(activeLead.foot.heading) * 2.6 + Math.cos(activeLead.foot.heading) * 2.1;
      const bz = activeLead.foot.z + Math.cos(activeLead.foot.heading) * 2.6 - Math.sin(activeLead.foot.heading) * 2.1;
      barracuda.position.set(bx, metro.ground(bx, bz), bz);
      barracuda.rotation.set(0, activeLead.foot.heading + Math.PI, 0);
      if (paintIdx > 0) applyVehiclePaint(barracuda, CUSTOMS_PAINTS[paintIdx].hex);
      bikeMesh.position.set(BIKE_POS.x, metro.ground(BIKE_POS.x, BIKE_POS.z), BIKE_POS.z);
      bikeMesh.rotation.set(0, Math.PI * 0.25, 0);
      bikeMesh.visible = true;
      const initLit = sky.night > 0.2;
      barracuda.lights?.(initLit);
      hotCoupe.lights?.(initLit);
      bikeMesh.lights?.(initLit);
      lastCarLights = initLit;
      barracuda.visible = true;

      v.health = 1;
      v.aiming = 0;
      camRig.yaw = 0;
      camRig.pitch = 0;
      camRig.aiming = false;
      camRig.opts.fovAim = null;
      camRig.to('chase', 0.01, { distance: 5.8, height: 2.3, look: 1.35, walls: world });
      rigTarget.position.set(activeLead.foot.x, activeLead.foot.y, activeLead.foot.z);
      rigTarget.yaw = activeLead.foot.heading;
      camRig.update(0.016, rigTarget);
      v.cut?.();

      updateWieldModels();
      wpWieldMako.pistol.update(0, { how: 'ready', hands: true, keep: false });
      wpWieldNadia.smg.update(0, { how: 'ready', hands: true, keep: false });

      assignJob(0);
      if (!warmedCop) {
        const hx = activeLead.foot.x + Math.sin(activeLead.foot.heading) * 3.8 - Math.cos(activeLead.foot.heading) * 2.2;
        const hz = activeLead.foot.z + Math.cos(activeLead.foot.heading) * 3.8 + Math.sin(activeLead.foot.heading) * 2.2;
        hotCoupe.position.set(hx, metro.ground(hx, hz), hz);
        hotCoupe.rotation.set(0, activeLead.foot.heading + Math.PI, 0);
        hotCoupe.visible = true;

        const bkx0 = activeLead.foot.x + Math.sin(activeLead.foot.heading) * 3.0;
        const bkz0 = activeLead.foot.z + Math.cos(activeLead.foot.heading) * 3.0;
        bikeMesh.position.set(bkx0, metro.ground(bkx0, bkz0), bkz0);
        bikeMesh.visible = true;

        const hlx0 = activeLead.foot.x - Math.cos(activeLead.foot.heading) * 4.5;
        const hlz0 = activeLead.foot.z + Math.sin(activeLead.foot.heading) * 4.5;
        heliMesh.position.set(hlx0, metro.ground(hlx0, hlz0) + 0.1, hlz0);
        heliMesh.visible = true;

        grenadePool[0].mesh.position.set(activeLead.foot.x, activeLead.foot.y + 1.0, activeLead.foot.z + 1.8);
        grenadePool[0].mesh.visible = true;
        rocketPool[0].mesh.position.set(activeLead.foot.x, activeLead.foot.y + 1.1, activeLead.foot.z + 2.2);
        rocketPool[0].mesh.visible = true;
        bayCrateMeshes[0].position.set(activeLead.foot.x, activeLead.foot.y + 0.5, activeLead.foot.z + 2.5);
        bayCrateMeshes[0].visible = true;
      }
      gps.update(0, activeLead.foot);
      if (!gpsShown) {
        gps.show(v);
        gpsShown = true;
      }

      wireEvents();
      scoreMusic?.stop();
      feel.clear();
      pad.release();
      keys.clear();
    },

    resize(w, h) {
      W = w;
      H = h;
      pad.layout(w, h);
    },

    update(dt) {
      const sdt = Math.min(0.033, dt);
      feel.update(sdt);
      if (feel.frozen) return;

      t += sdt;
      if (overKind) {
        overT -= sdt;
        camRig.update(sdt, rigTarget);
        impacts.update(sdt);
        fx3d.update(sdt);
        if (overT <= 0) api.over();
        return;
      }

      if (!warmedCop && t > 0.04) {
        warmedCop = true;
        warmupCop?.removeFromParent();
        warmupCop = null;
        mako.visible = false;
        mako.lod = 1;
        mako.visible = true;
        nadia.position.set(otherLead.foot.x, otherLead.foot.y, otherLead.foot.z);
        impacts.clear();
        fx3d.clear();
        tracerPool[0].mesh.visible = false;
        grenadePool[0].mesh.visible = false;
        rocketPool[0].mesh.visible = false;
        if (bayCrateMeshes[0]) bayCrateMeshes[0].visible = bayCrates.length > 0 && !bayCrates[0].taken;
        if (activeCarMesh !== bikeMesh) {
          bikeMesh.position.set(BIKE_POS.x, metro.ground(BIKE_POS.x, BIKE_POS.z), BIKE_POS.z);
          bikeMesh.rotation.set(0, Math.PI * 0.25, 0);
        }
        if (!inHeli && heliCtrl) {
          heliMesh.position.set(heliCtrl.pos.x, heliCtrl.pos.y, heliCtrl.pos.z);
          heliMesh.quaternion.set(heliCtrl.quat.x, heliCtrl.quat.y, heliCtrl.quat.z, heliCtrl.quat.w);
        }
        const nl = sky.night > 0.2;
        if (lastCarLights !== nl) {
          lastCarLights = nl;
          barracuda.lights?.(nl);
          hotCoupe.lights?.(nl);
          bikeMesh.lights?.(nl);
        }
        if (pickupPos && phase === 'pickup') {
          hotCoupe.position.set(pickupPos.x, metro.ground(pickupPos.x, pickupPos.z), pickupPos.z);
          hotCoupe.rotation.set(0, (pickupPos.heading || 0) + Math.PI, 0);
          hotCoupe.visible = true;
        } else {
          hotCoupe.visible = activeCarMesh === hotCoupe;
        }
      }

      hitT = Math.max(0, hitT - sdt);
      bannerT = Math.max(0, bannerT - sdt);
      rideCooldown = Math.max(0, rideCooldown - sdt);
      recentShotT = Math.max(0, recentShotT - sdt);
      batonCd = Math.max(0, batonCd - sdt);
      grenadeCd = Math.max(0, grenadeCd - sdt);
      driftSkidCd = Math.max(0, driftSkidCd - sdt);
      newsCooldown = Math.max(0, newsCooldown - sdt);
      for (const sj of stuntJumps) if (sj.cd > 0) sj.cd = Math.max(0, sj.cd - sdt);
      rep?.update(sdt);
      if (phoneT > 0) phoneT = Math.max(0, phoneT - sdt);
      if (phoneHoldLeft > 0) {
        phoneHoldLeft -= sdt;
        if (phoneHoldLeft <= 0) radio.hold(false);
      }

      if (!scoreStarted && !radio.now.on) {
        scoreStarted = true;
        scoreMusic?.start();
      }

      sky.speed = K.daySpeed;
      const st = skyTick++ & 7;
      if (st === 0) sky.update(sdt * 8);
      if ((st & 1) === 0) {
        updateAtmosphere(sdt * 2, false);
        if (warmedCop) {
          const nl = sky.night > 0.2;
          if (lastCarLights !== nl) {
            lastCarLights = nl;
            barracuda.lights?.(nl);
            hotCoupe.lights?.(nl);
          }
        }
      }
      if (st === 4) weather?.update(sdt * 8);

      if (pendingPickupLaw) {
        const pl = pendingPickupLaw;
        pendingPickupLaw = null;
        if (pl.heat > 0) {
          if (law.stars < pl.heat) law.set(pl.heat);
        } else {
          law.crime('theft', pl);
        }
      }
      if (pendingRadioOn > 0 && --pendingRadioOn === 0 && !radioStarted) {
        radioStarted = true;
        radio.tune(savedStationIdx);
        radio.on();
        scoreMusic?.pause();
        radioDirty = true;
      }
      if (pendingGpsGoal && --pendingGpsDelay <= 0) {
        setGpsGoal(pendingGpsGoal, pendingGpsKind, pendingGpsLabel);
        pendingGpsGoal = null;
      }

      if ((radioStarted || radio.power) && (st & 1) === 1) radio.update(sdt * 2);

      // Live news alerts when police escalate
      if (law.stars > lastWantedStars) {
        if (law.stars === 2) announceNews('Solis Bay PD pursuit expanding across the metro', true);
        else if (law.stars === 3) announceNews('Aviation and marine units scrambled over Solis Bay', true);
        else if (law.stars >= 4) announceNews('All-points alert! Heavy SBPD blockades in effect', true);
      }
      lastWantedStars = law.stars;

      const k = keys.axis();
      const sx = pad.left.active ? pad.left.x : k.x;
      const sy = pad.left.active ? pad.left.y : k.y;
      const modalOpen = weaponWheelOpen || radioWheelOpen || gps.opened || shakedownOpen;
      const actRide = !modalOpen && (pad.buttons.RIDE.pressed() || rideKey);
      const actAimTap = !modalOpen && (pad.buttons.AIM.pressed() || aimKey);
      const actFire = !modalOpen && !inHeli && (pad.buttons.FIRE.isDown || fireHeld || keys.held('f') || keys.held('Enter'));
      const actBrake = !modalOpen && (pad.buttons.AIM.isDown || keys.held(' ') || keys.held('Shift'));
      rideKey = aimKey = false;

      if (coverKey) {
        coverKey = false;
        if (!inCar && !inBoat && !inHeli) {
          if (hide.busy) hide.leave();
          else {
            cover.around(mover.feet, 6);
            if (hide.take(mover.feet, activeLead.foot.heading)) say('In Cover · AIM to peek', '#8ef5c8', 2.0);
          }
        }
      }
      if (swapKey) {
        swapKey = false;
        swapLead();
      }
      if (gunKey) {
        gunKey = false;
        const unlockedList = WEAPON_ORDER.filter(w => activeLead.unlocked.has(w));
        const curIdx = unlockedList.indexOf(activeLead.weaponKind);
        const nxtKind = unlockedList[(curIdx + 1) % unlockedList.length];
        equipWeapon(activeLead, nxtKind);
        sounds.click();
      }

      if (actRide) tryBoardOrExit();
      if (actAimTap && !inCar && !inBoat && !inHeli) setAimMode(!aimMode);

      // Dynamic button labels
      pad.buttons.RIDE.label = (inCar || inBoat || inHeli) ? 'EXIT' : 'RIDE';
      pad.buttons.FIRE.label = inHeli ? 'UP' : (!inCar && !inBoat && activeLead.weaponKind === 'baton') ? 'HIT' : (!inCar && !inBoat && activeLead.weaponKind === 'grenade') ? 'TOSS' : 'FIRE';
      pad.buttons.AIM.label = inHeli ? 'DOWN' : inCar ? 'DRIFT' : inBoat ? 'BRAKE' : aimMode ? 'HIP' : 'AIM';

      activeLead.health.update(sdt);
      for (let gi = 0; gi < GUN_KEYS.length; gi++) activeLead.guns[GUN_KEYS[gi]].update(sdt);
      v.health = activeLead.health.frac;

      if (inHeli && heliCtrl) {
        const heliUp = !modalOpen && (pad.buttons.FIRE.isDown || keys.held(' ') || keys.held('q') || keys.held('Q'));
        const heliDown = !modalOpen && (pad.buttons.AIM.isDown || keys.held('Shift') || keys.held('z') || keys.held('Z'));
        heliCtrl.update(sdt, {
          x: 0,
          y: Math.abs(sy) > 0.08 ? clamp(-sy, -1, 1) : 0,
          up: (heliUp ? 1 : 0) - (heliDown ? 1 : 0),
          yaw: Math.abs(sx) > 0.05 ? clamp(sx, -1, 1) : 0,
        });
        if (lookDragId === null && heliCtrl.speed > 2.0) {
          camRig.yaw *= Math.exp(-sdt * 2.5);
          camRig.pitch *= Math.exp(-sdt * 2.5);
        }
        engOpts.from = 80 + heliCtrl.speed * 7 + (heliUp ? 35 : 0);
        engOpts.vol = heliCtrl.onGround && !heliUp ? 0.01 : 0.028;
        engineSound?.set(engOpts, 0.1);

        playerQuery.x = heliCtrl.pos.x;
        playerQuery.z = heliCtrl.pos.z;
        playerQuery.y = heliCtrl.pos.y;
        playerQuery.heading = Math.PI - heliCtrl.heading;
        playerQuery.v = heliCtrl.speed;
        playerQuery.car = false;
        playerQuery.boat = false;
        playerQuery.swim = false;

        rigTarget.position.set(heliCtrl.pos.x, heliCtrl.pos.y + 1.2, heliCtrl.pos.z);
        rigTarget.yaw = Math.PI - heliCtrl.heading;
        rigTarget.grounded = heliCtrl.onGround;

        if (heliCtrl.crashed && !overKind) {
          stepOut(true);
          if (!overKind) {
            const lost = activeLead.health.hurt(62, { from: heliCtrl.pos, at: activeLead.foot, facing: activeLead.foot.heading });
            v.hit?.(lost);
            v.health = activeLead.health.frac;
            if (activeLead.health.dead) triggerOver('WASTED');
          }
        }
      } else if (inBoat && boatCtrl) {
        boatInput.throttle = Math.abs(sy) > 0.08 ? clamp(-sy * 1.15, -1, 1) : 0;
        boatInput.steer = Math.abs(sx) > 0.05 ? Math.sign(sx) * Math.pow(Math.abs(sx), 1.25) : 0;
        boatCtrl.update(sdt, boatInput);
        driveBy?.update(sdt);
        engOpts.from = 95 + boatCtrl.speed * 14;
        engOpts.vol = 0.012 + Math.min(1, boatCtrl.speed / 16) * 0.02;
        engineSound?.set(engOpts, 0.1);

        if (lookDragId === null && Math.abs(boatCtrl.speed) > 2.0) {
          camRig.yaw *= Math.exp(-sdt * 2.5);
          camRig.pitch *= Math.exp(-sdt * 2.5);
        }

        playerQuery.x = boatCtrl.x;
        playerQuery.z = boatCtrl.z;
        playerQuery.y = boatCtrl.y;
        playerQuery.heading = Math.PI - boatCtrl.heading;
        playerQuery.v = boatCtrl.speed;
        playerQuery.car = false;
        playerQuery.boat = true;
        playerQuery.swim = false;

        rigTarget.position.set(boatCtrl.x, boatCtrl.y + 0.6, boatCtrl.z);
        rigTarget.yaw = Math.PI - boatCtrl.heading;
        rigTarget.grounded = true;
      } else if (inCar && carCtrl && activeCarMesh) {
        const makoBonus = activeLead.name === 'Mako';
        carInput.throttle = Math.abs(sy) > 0.08 ? clamp(-sy * 1.15, -1, 1) : 0;
        const rawSteer = Math.abs(sx) > 0.05 ? Math.sign(sx) * Math.pow(Math.abs(sx), 1.35) : 0;
        carInput.steer = rawSteer * (1 - 0.32 * carCtrl.pace);
        carInput.drift = actBrake && Math.abs(sx) > 0.22 && carCtrl.speed > 7;
        carInput.brake = actBrake && !carInput.drift;

        const engHealthScale = 0.45 + 0.55 * (activeCarMesh.engine ?? 1);
        carCtrl.top = K.carTop * activeCarProfile.topMult * (activeCarMesh._tuned ? 1.08 : 1) * engHealthScale;
        carCtrl.accel = K.carAccel * activeCarProfile.accelMult * (makoBonus ? 1.06 : 1);
        carCtrl.turn = K.carTurn;
        carCtrl.grip = K.carGrip * activeCarProfile.gripMult * (makoBonus ? 1.12 : 1);
        carCtrl.update(sdt, carInput);
        driveBy?.update(sdt);

        // Drift feedback & free-roam stunt bonus
        if ((carInput.drift || carCtrl.drifting) && carCtrl.speed > 8) {
          driftSec += sdt;
          driftSmokeAcc += sdt;
          if (driftSkidCd <= 0) {
            driftSkidCd = 0.7;
            try { sounds.skid?.(0.95); } catch {}
          }
          if (driftSmokeAcc >= 0.14) {
            driftSmokeAcc = 0;
            fx3d.make(playerQuery, { burst: 2, life: [0.35, 0.55], speed: [0.4, 1.0], size: [0.3, 0.55], colors: ['#b8bcc4', '#7a7e86'], glow: false, grow: true });
          }
        } else if (driftSec > 1.2) {
          const bonusCash = Math.min(100, Math.round(driftSec * 28));
          cash += bonusCash;
          awardRep(2, `DRIFT +$${bonusCash}`, '#7ee8ff');
          driftSec = 0;
        } else {
          driftSec = 0;
        }

        if (lookDragId === null && Math.abs(carCtrl.speed) > 2.5) {
          camRig.yaw *= Math.exp(-sdt * 3.2);
          camRig.pitch *= Math.exp(-sdt * 3.0);
        }

        engOpts.from = 105 + Math.abs(carCtrl.speed) * 15;
        engOpts.vol = 0.012 + carCtrl.pace * 0.02;
        engineSound?.set(engOpts, 0.1);

        const px = carCtrl.x, pz = carCtrl.y;
        const heading = Math.PI / 2 - carCtrl.angle;
        const gy = metro.ground(px, pz, (activeCarMesh.position.y || 0) + 1.5);

        playerQuery.x = px;
        playerQuery.z = pz;
        playerQuery.y = gy;
        playerQuery.heading = heading;
        playerQuery.v = carCtrl.speed;
        playerQuery.car = true;
        playerQuery.boat = false;
        playerQuery.swim = false;

        const wall = metro.collide(playerQuery, 1.15, gy + 0.5);
        if (wall) {
          const nx = playerQuery.x - px, nz = playerQuery.z - pz;
          const len = Math.hypot(nx, nz) || 1;
          carCtrl.x = playerQuery.x;
          carCtrl.y = playerQuery.z;
          if (Math.abs(carCtrl.speed) > 6 && hitT <= 0) {
            hitT = 0.45;
            feel.hit?.(W * 0.5, H * 0.5, { power: 0.45 });
            if (Math.abs(carCtrl.speed) > 9) {
              activeCarMesh.harm?.(clamp((Math.abs(carCtrl.speed) - 8) * 0.014, 0.05, 0.2));
              activeCarMesh.hit?.(playerQuery, { power: 0.45 });
            }
          }
          carCtrl.bump(nx / len, nz / len, BUMP_OPTS);
        }

        if (hitT <= 0) {
          const hitCar = metro.cars.hit(playerQuery, 1.15);
          if (hitCar) {
            hitT = 0.8;
            metro.cars.bump(hitCar);
            if (Math.abs(carCtrl.speed) > 8) activeCarMesh.harm?.(clamp((Math.abs(carCtrl.speed) - 7) * 0.012, 0.04, 0.16));
            carCtrl.bump();
            law.crime('crash', playerQuery);
            metro.people.scare(playerQuery, 12);
          } else {
            const hitPed = metro.people.hit(playerQuery, 1.0);
            if (hitPed && Math.abs(carCtrl.speed) > 2.5) {
              hitT = 0.8;
              carCtrl.speed *= 0.45;
              law.crime('hit', playerQuery);
              metro.people.scare(playerQuery, 10, 3);
            }
          }
        }

        // Check Bayshore Stunt Jumps at high speed
        if (Math.abs(carCtrl.speed) > 15 && carJumpT <= 0) {
          for (const sj of stuntJumps) {
            if (sj.cd <= 0 && Math.hypot(carCtrl.x - sj.x, carCtrl.y - sj.z) < 5.2) {
              sj.cd = 15;
              carJumpT = 0.65;
              try { sounds.jump?.(1.1); } catch {}
              rep?.did('stunt');
              cash += 200;
              awardRep(10, 'STUNT +$200', '#ffd166');
              say('STUNT JUMP! +$200 · +10 REP', '#ffd166', 2.8);
              break;
            }
          }
        }
        let jumpY = 0;
        let jumpPitch = 0;
        if (carJumpT > 0) {
          carJumpT = Math.max(0, carJumpT - sdt);
          const u = carJumpT / 0.65;
          jumpY = Math.sin(u * Math.PI) * 2.4;
          jumpPitch = Math.sin(u * Math.PI) * 0.24;
        }

        activeCarMesh.position.set(carCtrl.x, gy + jumpY, carCtrl.y);
        activeCarMesh.rotation.set(jumpPitch, heading + Math.PI, 0);
        if (activeCarMesh.move) activeCarMesh.move(sdt, carCtrl.speed, { steer: carInput.steer });
        else {
          activeCarMesh.roll?.(carCtrl.speed * sdt);
          activeCarMesh.steer?.(carInput.steer * 0.45);
        }

        const nl = sky.night > 0.2;
        if (activeCarMesh === barracuda || activeCarMesh === hotCoupe || activeCarMesh === bikeMesh) {
          if (lastCarLights !== nl) {
            lastCarLights = nl;
            barracuda.lights?.(nl);
            hotCoupe.lights?.(nl);
            bikeMesh.lights?.(nl);
          }
        } else if (lastActiveCarMesh !== activeCarMesh || lastActiveCarLit !== nl) {
          lastActiveCarMesh = activeCarMesh;
          lastActiveCarLit = nl;
          activeCarMesh.lights?.(nl);
        }

        avoidQuery.x = carCtrl.x;
        avoidQuery.z = carCtrl.y;
        avoidQuery.vx = Math.cos(carCtrl.angle) * carCtrl.speed;
        avoidQuery.vz = Math.sin(carCtrl.angle) * carCtrl.speed;
        metro.avoid(avoidQuery, 1.3);

        rigTarget.position.set(carCtrl.x, gy, carCtrl.y);
        rigTarget.yaw = heading;
        rigTarget.grounded = true;
      } else {
        // On foot / swimming / in cover
        const f = activeLead.foot;
        const mag = Math.hypot(sx, sy);
        const sprinting = !aimMode && (keys.held('Shift') || mag > 0.92);
        const topWalk = sprinting ? K.sprintSpeed : K.walkSpeed;
        const camYaw = camRig.targetYaw + camRig.yaw;

        if (mag > 0.1) {
          const moveYaw = (aimMode || recentShotT > 0)
            ? camYaw + Math.atan2(-sx, -sy)
            : Math.atan2(-sx * Math.cos(camYaw) - sy * Math.sin(camYaw), -sy * Math.cos(camYaw) + sx * Math.sin(camYaw));
          const sp = topWalk * clamp(mag, 0, 1);
          coverMoveVec.x = Math.sin(moveYaw) * clamp(mag, 0, 1);
          coverMoveVec.z = Math.cos(moveYaw) * clamp(mag, 0, 1);
          if (!hide.busy) {
            mover.walk(Math.sin(moveYaw) * sp, Math.cos(moveYaw) * sp);
            if (!aimMode && recentShotT <= 0) f.heading = moveYaw;
            f.v = sp;
          }
        } else {
          coverMoveVec.x = coverMoveVec.z = 0;
          if (!hide.busy) mover.walk(0, 0);
          f.v = 0;
        }

        if (aimMode || recentShotT > 0) f.heading = camYaw;

        if (hide.busy) {
          hideInput.aim = aimMode;
          hideInput.blind = actFire && !aimMode;
          hide.update(sdt, hideInput, mover.feet);
          mover.walk(hide.walk.x, hide.walk.z);
          f.heading = hide.facing;
          f.v = Math.hypot(hide.walk.x, hide.walk.z);
        }

        if (swim.state !== 'out' || f.y < -0.15) {
          swimInput.up = keys.held(' ');
          swimInput.down = keys.held('c');
          swimInput.fast = sprinting;
          swim.update(sdt, swimInput, mover);
          if (swim.hurt > 0) {
            activeLead.health.hurt(swim.hurt);
            v.hit?.(swim.hurt);
            v.health = activeLead.health.frac;
            if (activeLead.health.dead) {
              triggerOver('WASTED');
              return;
            }
          }
          if (swim.facing != null && swim.state !== 'out' && !aimMode) f.heading = swim.facing;
        }

        if ((aimMode || hide.busy) && st === 7) {
          cover.update(mover.feet, COVER_UPD_OPTS);
        }
        if (gunRig) {
          gunRig.aiming = aimMode && fpsAim;
          gunRig.sprinting = sprinting;
        }
        rigTarget.grounded = mover.grounded;
      }

      // Physics step + bulletproof ground floor net for both leads
      if (!inCar && !inBoat && !inHeli) mover.stepMove(sdt);
      if (inBoat || inHeli) world.step(sdt);
      else if (!inCar && (st & 1) === 1) world.step(Math.min(0.033, sdt * 2));

      if (!inCar && !inBoat && !inHeli) {
        const f = activeLead.foot;
        const mp = mover.feet;
        const wet = !!metro.water?.wet(mp.x, mp.z);
        const gy = metro.ground(mp.x, mp.z, mp.y + 1.8);
        if (!wet && Number.isFinite(gy) && mp.y < gy - 0.06) {
          mover.place(mp.x, gy + 0.02, mp.z);
          mover.vy = 0;
          mover.grounded = true;
          mp.y = gy;
        } else if (wet && Number.isFinite(gy) && mp.y < Math.max(-3.0, gy)) {
          const bedY = Math.max(-3.0, gy);
          mover.place(mp.x, bedY + 0.05, mp.z);
          mover.vy = 0;
          mp.y = bedY;
        }
        f.x = mp.x;
        f.y = mp.y;
        f.z = mp.z;

        playerQuery.x = f.x;
        playerQuery.y = f.y;
        playerQuery.z = f.z;
        playerQuery.heading = f.heading;
        playerQuery.v = f.v;
        playerQuery.car = false;
        playerQuery.boat = false;
        playerQuery.swim = swim.state !== 'out';

        activeLead.body.position.set(f.x, f.y, f.z);
        activeLead.body.rotation.set(0, f.heading, 0);
        const rigActive = f.v > 0.01 || aimMode || recentShotT > 0 || hide.busy || swim.state !== 'out';
        if (rigActive ? ((poseTick++ & 1) === 0) : st === 7) {
          v.cam.getWorldDirection(camDirVec);
          const aimPitch = Math.asin(clamp(camDirVec.y, -1, 1));
          if (swim.pose) {
            if (swim.at != null) {
              swimPlayOpts.at = swim.at;
              activeLead.body.rig.play?.(swim.pose, swimPlayOpts);
            } else {
              activeLead.body.rig.play?.(swim.pose);
            }
          } else if (hide.busy && hide.pose) {
            activeLead.body.rig.play?.(hide.pose, hidePlayOpts);
            activeLead.body.rig.upper?.(hide.upper);
          } else {
            activeLead.body.rig.upper?.((aimMode || recentShotT > 0) ? 'aim' : null);
            activeLead.body.rig.blend(BLEND_OPTS, f.v);
          }
          rigUpdOpts.speed = f.v;
          rigUpdOpts.aim = aimPitch;
          activeLead.body.rig.update(rigActive ? sdt * 2 : sdt * 8, rigUpdOpts);
        }

        // Update 3rd-person weapon IK pose & hip-fire shoulder camera
        if (!aimMode && recentShotT > 0) {
          if (!hipShoulder) {
            hipShoulder = true;
            camRig.to('shoulder', 0.12, { distance: 3.6, height: 1.85, side: 0.56, look: 1.48, lag: 0.08, walls: world });
          }
        } else if (hipShoulder) {
          hipShoulder = false;
          if (!aimMode) camRig.to('chase', 0.22, { distance: 5.8, height: 2.3, look: 1.35, walls: world });
        }

        const wk = activeLead.weaponKind;
        const aw = activeLead.wields[wk];
        if (aw && !(aimMode && fpsAim)) {
          v.cam.getWorldDirection(camDirVec);
          wieldOpts.pitch = Math.asin(clamp(camDirVec.y, -1, 1));
          wieldOpts.how = aimMode ? 'aim' : recentShotT > 0 ? 'hip' : 'ready';
          aw.update(sdt, wieldOpts);
        }

        if (otherLead && !otherLead.inVehicle) {
          const ogy = metro.ground(otherLead.foot.x, otherLead.foot.z);
          if (Number.isFinite(ogy)) otherLead.foot.y = ogy;
          otherLead.body.position.set(otherLead.foot.x, otherLead.foot.y, otherLead.foot.z);
        }

        if (f.v > 0.1) {
          avoidQuery.x = f.x;
          avoidQuery.z = f.z;
          avoidQuery.vx = Math.sin(f.heading) * f.v;
          avoidQuery.vz = Math.cos(f.heading) * f.v;
          metro.avoid(avoidQuery, 0.9);
        }

        rigTarget.position.set(f.x, f.y, f.z);
        rigTarget.yaw = (aimMode || recentShotT > 0) ? camRig.targetYaw : f.heading;
      }

      // Collect world pickups
      const offered = pickups.update(sdt, playerQuery);
      for (const p of offered) {
        let took = false;
        if (p.kind === 'health' && activeLead.health.hp < activeLead.health.max) {
          activeLead.health.heal(p.amount || 40);
          took = true;
        } else if (p.kind === 'armour' && activeLead.health.armour < activeLead.health.maxArmour) {
          activeLead.health.addArmour(p.amount || 35);
          took = true;
        } else if (p.kind === 'ammo') {
          activeLead.pouch.add(p.of || 'pistol', p.amount || 30);
          took = true;
        } else if (WEAPON_ORDER.includes(p.kind)) {
          const already = activeLead.unlocked.has(p.kind);
          for (const ld of leads) ld.unlocked.add(p.kind);
          const ammoName = ARSENAL[p.kind]?.ammo;
          if (ammoName) activeLead.pouch.add(ammoName, ARSENAL[p.kind].pickup || 16);
          if (!already) equipWeapon(activeLead, p.kind);
          took = true;
        }
        if (took) {
          pickups.taken(p);
          scoreMusic?.hit(0.6);
          sounds.coin(1.2);
          feel.coin(W * 0.5, H * 0.4, { color: '#78ff98', text: p.kind.toUpperCase() });
        }
      }
      for (let i = 0; i < pickups.list.length; i++) {
        const p = pickups.list[i];
        const m = pickupMeshes[p.meshIdx];
        if (!m) continue;
        m.visible = p.here;
        if (p.here) {
          m.position.set(p.x, p.y + p.bob, p.z);
          m.rotation.y = p.spin;
        }
      }

      // Update camera, FPS gun, aim-assist, acoustics, FX, bullets, rockets, grenades & gang crew
      camRig.update(sdt, rigTarget);
      if (aimMode && fpsAim && !inCar && !inBoat && !inHeli) gunRig.update(sdt);

      if ((st & 1) === 0 && (aimMode || inCar || inBoat) && !inHeli) {
        v.cam.getWorldDirection(camDirVec);
        lockedTarget = findAimAssistTarget(v.cam.position, camDirVec);
      } else if (!aimMode && !inCar && !inBoat) {
        lockedTarget = null;
      }

      if (actFire) fireShot();

      if (impacts.cases.length) impacts.update(sdt);
      if (fx3d.live.size > 0) fx3d.update(sdt);
      if (markers.list.length) markers.update(sdt);
      if (hasLitBarrel) {
        explosives.update(sdt);
        let anyLit = false;
        for (const b of explosives.list) if (!b.gone && b.lit >= 0) { anyLit = true; break; }
        hasLitBarrel = anyLit;
      }
      for (const tm of tracerPool) {
        if (tm.life > 0) {
          tm.life -= sdt;
          if (tm.life <= 0) tm.mesh.visible = false;
        }
      }
      for (const gr of grenadePool) {
        if (!gr.active) continue;
        gr.fuse -= sdt;
        gr.vy -= 18 * sdt;
        gr.x += gr.vx * sdt;
        gr.y += gr.vy * sdt;
        gr.z += gr.vz * sdt;
        const floorY = metro.ground(gr.x, gr.z, gr.y + 1.0) + 0.1;
        if (gr.y <= floorY) {
          gr.y = floorY;
          if (gr.vy < -1.5) gr.vy = -gr.vy * 0.38;
          else gr.vy = 0;
          gr.vx *= 0.62;
          gr.vz *= 0.62;
        }
        gr.mesh.position.set(gr.x, gr.y, gr.z);
        if (gr.fuse <= 0) {
          gr.active = false;
          gr.mesh.visible = false;
          detonateAt(gr.x, gr.y + 0.2, gr.z, 8.2, 115);
        }
      }
      if (shots.list.length > 0) {
        const rHits = shots.update(sdt, world);
        for (const h of rHits) {
          const rs = h.shot?.rocketSlot;
          if (rs) { rs.active = false; rs.mesh.visible = false; }
          detonateAt(h.at.x, h.at.y, h.at.z, 9.5, 140);
        }
        for (const p of shots.list) {
          const rs = p.rocketSlot;
          if (rs) {
            rs.mesh.position.set(p.x, p.y, p.z);
            if ((rs.smokeT -= sdt) <= 0) {
              rs.smokeT = 0.04;
              fx3d.sparks(p, { count: 2, power: 0.3, light: false });
            }
          }
          let directHit = false;
          for (const g of gangPool) {
            if (g.alive && Math.hypot(p.x - g.x, p.y - (g.y + 1.0), p.z - g.z) < 2.2) { directHit = true; break; }
          }
          if (!directHit) {
            for (const o of law.officers) {
              if (!o.gone && o.alive !== false && Math.hypot(p.x - o.x, p.y - ((o.body?.position?.y ?? 0) + 1.0), p.z - o.z) < 2.2) { directHit = true; break; }
            }
          }
          if (!directHit) {
            for (const b of law.boats || []) {
              if (!b.down && b.craft && Math.hypot(p.x - b.craft.x, p.y - 1.0, p.z - b.craft.z) < 3.6) { directHit = true; break; }
            }
          }
          if (!directHit && law.heli && !law.heli.down && law.heli.model) {
            const hp = law.heli.model.position;
            if (Math.hypot(p.x - hp.x, p.y - hp.y, p.z - hp.z) < 4.5) {
              directHit = true;
              law.heli.model.blow?.();
            }
          }
          if (directHit || p.left <= 0.08) {
            p.dead = true;
            if (rs) { rs.active = false; rs.mesh.visible = false; }
            detonateAt(p.x, p.y, p.z, 9.5, 140);
          }
        }
        if (shots.list.some(p => p.dead)) shots.list = shots.list.filter(p => !p.dead);
      }

      // Update rival gang crew
      for (const g of gangPool) {
        if (!g.alive) {
          if (g.body.visible) g.body.visible = false;
          continue;
        }
        const dx = playerQuery.x - g.x, dz = playerQuery.z - g.z;
        const dist = Math.hypot(dx, dz);
        g.body.visible = t <= 0.25 || dist < 150;
        if (!g.body.visible) continue;
        g.react.update(sdt);
        if (dist < 28) {
          g.heading = Math.atan2(dx, dz);
          if (!g.react.busy && dist > 9) {
            const nx = g.x + (dx / dist) * 2.1 * sdt;
            const nz = g.z + (dz / dist) * 2.1 * sdt;
            if (!metro.water?.wet(nx, nz)) {
              g.x = nx;
              g.z = nz;
              g.y = metro.ground(g.x, g.z, g.y + 1.2);
            }
          }
          g.fireCd -= sdt;
          if (g.fireCd <= 0 && !g.react.busy && !overKind) {
            g.fireCd = 1.65 + Math.random() * 0.9;
            weaponSound('pistol', 'fire', g);
            fx3d.sparks({ x: g.x + Math.sin(g.heading) * 0.5, y: g.y + 1.4, z: g.z + Math.cos(g.heading) * 0.5 }, { count: 4, power: 0.4, light: false });
            aimDirObj.x = dx / (dist || 1);
            aimDirObj.y = (playerQuery.y - g.y) / (dist || 1);
            aimDirObj.z = dz / (dist || 1);
            aimOrigin.x = g.x; aimOrigin.y = g.y + 1.4; aimOrigin.z = g.z;
            const blocked = world.ray(aimOrigin, aimDirObj, Math.max(0.5, dist - 0.8), c => c !== mover?.rider && c !== mover);
            if (!blocked || blocked.distance >= dist - 1.1) {
              const hitChance = hide.busy ? 0.18 * hide.exposed : inCar ? 0.25 : 0.48;
              if (Math.random() < hitChance) {
                const lost = activeLead.health.hurt(7, { from: g, at: activeLead.foot, facing: activeLead.foot.heading });
                if (lost > 0) {
                  v.hit?.(lost);
                  v.health = activeLead.health.frac;
                  camRig.shake(0.14);
                  if (activeLead.health.dead) { triggerOver('WASTED'); return; }
                }
              }
            }
          }
        } else if (!g.react.busy) {
          g.patrolPhase += sdt * 0.8;
          g.heading = g.patrolPhase;
        }
        g.body.position.set(g.x, g.y, g.z);
        g.body.rotation.set(0, g.heading, 0);
        if ((st & 1) === 0) {
          g.body.rig.upper?.(dist < 28 ? 'aim' : null);
          g.body.rig.blend(BLEND_OPTS, dist < 28 && dist > 9 && !g.react.busy ? 2.1 : 0);
          rigUpdOpts.speed = dist < 28 && dist > 9 ? 2.1 : 0;
          rigUpdOpts.aim = 0;
          g.body.rig.update(sdt * 2, rigUpdOpts);
          gangWieldOpts.how = dist < 28 ? 'aim' : 'ready';
          g.wield.update(sdt * 2, gangWieldOpts);
        }
      }

      metro.update(sdt, playerQuery);
      if (metro.cities.length !== lastCityCount) {
        lastCityCount = metro.cities.length;
        for (const c of metro.cities) if (c.people && c.people.fullMax !== 0) c.people.fullMax = 0;
        world.queries?.();
      }
      if (inside.room || wasIndoor || (!inCar && !inBoat && st === 3)) {
        inside.update((inside.room || wasIndoor) ? sdt : sdt * 8, playerQuery);
        if (inside.entered || inside.left) world.queries?.();
        if (inside.entered && !wasIndoor) {
          wasIndoor = true;
          try { mixer.place(INDOOR_PLACE, 0.3); } catch {}
        } else if (inside.left && wasIndoor) {
          wasIndoor = false;
          try { mixer.place(null, 0.3); } catch {}
        }
      }
      if (st === 5 || inside.entered || inside.left) {
        v.cam.getWorldDirection(camDirVec);
        ears.place(v.cam.position, camDirVec);
      }

      lawDt += sdt;
      const lawIdle = law.stars === 0 && !law.units.length && !law.officers.length && !law.calls.length && !metro.events.length && !law.search && !actFire;
      const lawDue = !lawIdle ? ((lawTick++ & 1) === 0 || metro.events.length > 0 || actFire) : st === 6;
      if (lawDue) {
        law.update(lawDt, playerQuery);
        lawDt = 0;
      }

      gpsDt += sdt;
      if (!gps.route || st === 7) {
        gps.update(gpsDt, playerQuery);
        gpsDt = 0;
      } else {
        if (gps.player) { gps.player.x = playerQuery.x; gps.player.z = playerQuery.z; }
        gps.heading = playerQuery.heading;
      }

      const threat = clamp(law.stars / 4 + (aimMode ? 0.15 : 0), 0, 1);
      if (Math.abs(threat - lastScoreThreat) >= 0.02) {
        lastScoreThreat = threat;
        scoreMusic?.intensity(threat, 0.8);
      }
      const isFinal = law.stars >= 4;
      if (isFinal !== lastScoreFinal) {
        lastScoreFinal = isFinal;
        scoreMusic?.final(isFinal);
      }

      const dist = metro.districtAt(playerQuery.x, playerQuery.z);
      lastDistrictName = dist ? dist.name : 'Solis Bay';
      worldSave.update(sdt);

      // Mission progression checks
      if (bayCrates.length > 0 && (phase === 'board_boat' || phase === 'deliver_boat')) {
        for (let i = 0; i < bayCrates.length; i++) {
          const bc = bayCrates[i];
          if (bc.taken) {
            if (bc.mesh) bc.mesh.visible = false;
            continue;
          }
          const wy = metro.water?.height ? metro.water.height(bc.x, bc.z) : 0;
          if (bc.mesh) {
            bc.mesh.visible = true;
            bc.mesh.position.set(bc.x, (wy > -50 ? wy : 0) + 0.25 + Math.sin(t * 2.6 + i) * 0.14, bc.z);
            bc.mesh.rotation.y = t * 1.1 + i;
          }
          if (inBoat && Math.hypot(bc.x - playerQuery.x, bc.z - playerQuery.z) < 9.5) {
            bc.taken = true;
            if (bc.mesh) bc.mesh.visible = false;
            cratesLeft = bayCrates.filter(c => !c.taken).length;
            cash += 100;
            sounds.coin?.(1.2);
            feel.coin(W * 0.5, H * 0.38, { color: '#2ef2b8', text: 'CRATE +$100' });
            hudSub = cratesLeft > 0 ? `Bay Crates ${bayCrates.length - cratesLeft}/${bayCrates.length} -> Port Yard` : 'All 3 Crates Secured! Dock at Port Yard';
          }
        }
      }

      if (phase === 'pickup' && pickupPos) {
        const dp = Math.hypot(pickupPos.x - playerQuery.x, pickupPos.z - playerQuery.z);
        if (inCar || dp < 4.2) {
          if (!inCar) seatLeadInCar(hotCoupe, pickupPos.x, pickupPos.z, pickupPos.heading || 0);
        }
      } else if (phase === 'interior') {
        if ((inside.entered || inside.room) && !shakedownOpen) {
          shakedownOpen = true;
          hudSub = 'Confront adjuster or bolt!';
          say('Adjuster inside — pick action!', '#ffd166', 3.0);
        }
      } else if (phase === 'board_boat') {
        if (inBoat) phase = 'deliver_boat';
      } else if ((phase === 'deliver' || phase === 'deliver_boat') && targetPos) {
        const dd = Math.hypot(targetPos.x - playerQuery.x, targetPos.z - playerQuery.z);
        const reachD = phase === 'deliver_boat' ? 28 : 7.5;
        if (dd < reachD && Math.abs(playerQuery.v) < 13) {
          jobsDoneCount++;
          const pts = job?.rep ?? K.dropRep;
          const allCratesBonus = phase === 'deliver_boat' && bayCrates.length > 0 && cratesLeft === 0 ? 150 : 0;
          const basePay = (job?.pay ?? 300) + allCratesBonus;
          const pay = activeLead.name === 'Nadia' ? Math.round(basePay * 1.2) : basePay;
          cash += pay;
          rep?.did('mission');
          for (const bm of bayCrateMeshes) bm.visible = false;
          bayCrates = [];
          say(`${job.name} complete! +${pts} Rep · +$${pay}`, '#68f8c4', 3.2);
          if (awardRep(pts, `+${pts} REP · +$${pay}`, '#68f8c4')) return;
          announceNews(`Suspect spotted fleeing ${lastDistrictName}`, false);
          assignJob(jobIdx + 1);
        }
      }
    },

    draw(c) {
      if (phase === 'pickup' && pickupPos) {
        const py = metro.ground(pickupPos.x, pickupPos.z);
        pickRing.visible = pickBeacon.visible = true;
        dropRing.visible = dropBeacon.visible = false;
        pickRing.position.set(pickupPos.x, py + 0.25 + Math.sin(t * 3.5) * 0.08, pickupPos.z);
        pickBeacon.position.set(pickupPos.x, py + 9, pickupPos.z);
      } else if (targetPos && (phase === 'deliver' || phase === 'interior' || phase === 'board_boat' || phase === 'deliver_boat')) {
        const tp = phase === 'board_boat' && pickupPos ? pickupPos : targetPos;
        const ty = metro.ground(tp.x, tp.z);
        pickRing.visible = pickBeacon.visible = false;
        dropRing.visible = dropBeacon.visible = true;
        dropRing.position.set(tp.x, ty + 0.25 + Math.sin(t * 3.5) * 0.08, tp.z);
        dropBeacon.position.set(tp.x, ty + 9, tp.z);
      } else {
        pickRing.visible = pickBeacon.visible = false;
        dropRing.visible = dropBeacon.visible = false;
      }

      if (resprayRing) {
        const dxR = v.cam.position.x - RESPRAY_POS.x, dzR = v.cam.position.z - RESPRAY_POS.z;
        resprayRing.visible = t <= 0.25 || (dxR * dxR + dzR * dzR < 180 * 180);
        if (resprayRing.visible) resprayRing.rotation.z = t * 1.2;
      }
      if (armsRing) {
        const dxA = v.cam.position.x - ARMS_POS.x, dzA = v.cam.position.z - ARMS_POS.z;
        armsRing.visible = t <= 0.25 || (dxA * dxA + dzA * dzA < 180 * 180);
        if (armsRing.visible) armsRing.rotation.z = -t * 1.2;
      }
      if (dinerRing) {
        const dxD = v.cam.position.x - dinerPos.x, dzD = v.cam.position.z - dinerPos.z;
        dinerRing.visible = t <= 0.25 || (dxD * dxD + dzD * dzD < 180 * 180);
        if (dinerRing.visible) dinerRing.rotation.z = t * 0.9;
      }
      if (heliRing) {
        const dxH = v.cam.position.x - HELI_POS.x, dzH = v.cam.position.z - HELI_POS.z;
        heliRing.visible = t <= 0.25 || (dxH * dxH + dzH * dzH < 180 * 180);
        if (heliRing.visible) heliRing.rotation.z = -t * 0.8;
      }

      const activeTarget = (phase === 'pickup' || phase === 'board_boat') && pickupPos ? pickupPos : targetPos;
      const nxt = gps.ahead(14, aheadPt) || activeTarget;
      if (nxt && !aimMode) {
        arrowMesh.visible = true;
        arrowMesh.position.set(playerQuery.x, playerQuery.y + (inCar || inBoat || inHeli ? 2.55 : 2.35) + Math.sin(t * 4) * 0.06, playerQuery.z);
        arrowMesh.lookAt(nxt.x, arrowMesh.position.y, nxt.z);
        arrowMesh.rotateX(Math.PI / 2);
      } else {
        arrowMesh.visible = false;
      }

      const dxY = v.cam.position.x - YARD_X, dzY = v.cam.position.z - YARD_Z;
      const nearYard = t <= 0.25 || (dxY * dxY + dzY * dzY < 220 * 220);
      if (yardPropsGroup) yardPropsGroup.visible = nearYard;
      if (yardGround?.mesh) yardGround.mesh.visible = nearYard;
      if (nearYard) yardGround?.update(v.cam.position);
      const dxB = v.cam.position.x - BEACH_LOT.x, dzB = v.cam.position.z - BEACH_LOT.z;
      if (beachPropsGroup) beachPropsGroup.visible = t <= 0.25 || (dxB * dxB + dzB * dzB < 280 * 280);

      light.fit(v, LIGHT_FIT_OPTS);
      v.fit(W, H);
      feel.begin(c);
      v.render(c, W, H);
      feel.end(c, W, H);

      if (gps.opened) {
        gps.map(c, 0, 0, W, H);
        return;
      }

      pad.draw(c);

      // Sniper scope lens + mil-dot crosshair overlay
      if (aimMode && activeLead.weaponKind === 'sniper' && !inCar && !inBoat && !inHeli && !overKind) {
        const scX = W * 0.5, scY = H * 0.5;
        const scR = Math.min(W, H) * 0.42;
        c.save();
        c.fillStyle = 'rgba(2, 6, 12, 0.88)';
        c.beginPath();
        c.rect(0, 0, W, H);
        c.arc(scX, scY, scR, 0, Math.PI * 2, true);
        c.fill();
        c.strokeStyle = 'rgba(255, 255, 255, 0.72)';
        c.lineWidth = 1.6;
        c.beginPath();
        c.arc(scX, scY, scR, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(scX - scR, scY); c.lineTo(scX + scR, scY);
        c.moveTo(scX, scY - scR); c.lineTo(scX, scY + scR);
        c.stroke();
        c.fillStyle = 'rgba(255, 255, 255, 0.8)';
        for (let m = 1; m <= 4; m++) {
          const d = m * (scR * 0.2);
          c.fillRect(scX - d - 1, scY - 2, 2, 4);
          c.fillRect(scX + d - 1, scY - 2, 2, 4);
          c.fillRect(scX - 2, scY - d - 1, 4, 2);
          c.fillRect(scX - 2, scY + d - 1, 4, 2);
        }
        c.restore();
      }

      // Dynamic GTA crosshair + spread + lock-on tint + reload arc + hitmarkers
      const showCrosshair = aimMode || recentShotT > 0 || ((inCar || inBoat) && fireHeld);
      if (showCrosshair && !overKind) {
        const gun = activeGun(activeLead);
        const sp = gun ? clamp(4 + gun.spreadNow * 140, 4, 22) : 5;
        const cx = W * 0.5, cy = H * 0.5;
        c.save();
        c.strokeStyle = lockedTarget ? '#ff5e57' : 'rgba(255, 255, 255, 0.9)';
        c.lineWidth = lockedTarget ? 2 : 1.5;
        c.beginPath();
        c.moveTo(cx - sp - 5, cy); c.lineTo(cx - sp, cy);
        c.moveTo(cx + sp, cy); c.lineTo(cx + sp + 5, cy);
        c.moveTo(cx, cy - sp - 5); c.lineTo(cx, cy - sp);
        c.moveTo(cx, cy + sp); c.lineTo(cx, cy + sp + 5);
        c.stroke();
        c.fillStyle = lockedTarget ? '#ff5e57' : '#ffffff';
        c.beginPath(); c.arc(cx, cy, 1.5, 0, Math.PI * 2); c.fill();
        if (gun && gun.reloading > 0) {
          const frac = 1 - gun.reloading / gun.reload;
          c.strokeStyle = '#ffd166';
          c.lineWidth = 2.2;
          c.beginPath();
          c.arc(cx, cy, 12, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
          c.stroke();
        }
        if (markers.showing) {
          const lastM = markers.list[markers.list.length - 1];
          c.strokeStyle = (lastM.kill || lastM.head) ? '#ff4757' : '#ffffff';
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(cx - 7, cy - 7); c.lineTo(cx - 3, cy - 3);
          c.moveTo(cx + 7, cy - 7); c.lineTo(cx + 3, cy - 3);
          c.moveTo(cx - 7, cy + 7); c.lineTo(cx - 3, cy + 3);
          c.moveTo(cx + 7, cy + 7); c.lineTo(cx + 3, cy + 3);
          c.stroke();
        }
        c.restore();
      }

      const { mr, maxHudW, topY } = layoutTopHud();
      const clockMin = Math.floor(sky.time * 60) % 1440;
      if (clockMin !== lastClockMin) {
        lastClockMin = clockMin;
        const hh = String(Math.floor(clockMin / 60)).padStart(2, '0');
        const mm = String(clockMin % 60).padStart(2, '0');
        lastClockStr = `${hh}:${mm}`;
      }
      if (lastDistrictName !== lastDistHud || lastClockStr !== lastDistClock) {
        lastDistHud = lastDistrictName;
        lastDistClock = lastClockStr;
        lastDistText = `${lastDistrictName} · ${lastClockStr}`;
      }
      if (cash !== lastCashVal) {
        lastCashVal = cash;
        lastCashStr = `$${cash}`;
      }

      // Top-left status card (clear of score badge & minimap)
      c.save();
      c.fillStyle = 'rgba(10, 14, 24, 0.8)';
      c.beginPath();
      c.roundRect(8, topY, maxHudW, 72, 8);
      c.fill();

      c.font = '700 11px Rubik, sans-serif';
      c.textAlign = 'left';
      c.fillStyle = '#e8f4ff';
      c.fillText(fitText(c, 'dist', lastDistText, maxHudW - 58), 15, topY + 15);
      c.textAlign = 'right';
      c.fillStyle = '#52f295';
      c.fillText(lastCashStr, 8 + maxHudW - 8, topY + 15);

      c.textAlign = 'left';
      if (law.stars > 0) {
        const pulseRed = law.seen && Math.floor(t * 4) % 2 === 0;
        let sxPos = 15;
        c.font = '700 11px Rubik, sans-serif';
        for (let i = 0; i < 5; i++) {
          const lit = i < law.stars;
          c.fillStyle = lit ? (law.seen ? (pulseRed ? '#ff4d5a' : '#4da6ff') : '#ffd166') : 'rgba(255,255,255,0.22)';
          c.fillText(lit ? '★' : '☆', sxPos, topY + 31);
          sxPos += 11;
        }
        c.font = '700 10px Rubik, sans-serif';
        c.fillStyle = law.seen ? (pulseRed ? '#ff6b6b' : '#74b9ff') : '#ffd166';
        let stTxt;
        if (law.busting > 0.15) stTxt = 'BUST!';
        else if (law.seen) stTxt = 'PURSUIT';
        else {
          const sec = Math.ceil(law.left);
          if (sec !== lastLawSec) { lastLawSec = sec; lastLawSecStr = `${sec}s`; }
          stTxt = lastLawSecStr;
        }
        c.fillText(fitText(c, 'stars', stTxt, maxHudW - 76), sxPos + 2, topY + 31);
      } else {
        c.fillStyle = '#8ef5c8';
        const modeTxt = inHeli ? 'Chopper' : inBoat ? 'At Helm' : inCar ? activeCarProfile.label : swim.state !== 'out' ? 'Swimming' : hide.busy ? 'In Cover' : 'On Foot';
        if (activeLead.name !== lastModeLead || modeTxt !== lastModeKind) {
          lastModeLead = activeLead.name;
          lastModeKind = modeTxt;
          lastModeStr = `${activeLead.name} · ${modeTxt}`;
        }
        c.fillText(fitText(c, 'stars', lastModeStr, maxHudW - 14), 15, topY + 31);
      }

      c.font = '500 10px Rubik, sans-serif';
      c.fillStyle = '#b9c9e4';
      c.fillText(fitText(c, 'sub', hudSub, maxHudW - 14), 15, topY + 45);

      // Health bar + Armor bar (+ breath bar underwater)
      const barW = maxHudW - 22;
      c.fillStyle = 'rgba(255,255,255,0.16)';
      c.fillRect(15, topY + 52, barW, 4);
      c.fillStyle = activeLead.health.frac > 0.4 ? '#38f8b0' : '#ff5e57';
      c.fillRect(15, topY + 52, barW * activeLead.health.frac, 4);

      c.fillStyle = 'rgba(255,255,255,0.14)';
      c.fillRect(15, topY + 58, barW, 3);
      const armFrac = activeLead.health.maxArmour > 0 ? activeLead.health.armour / activeLead.health.maxArmour : 0;
      c.fillStyle = '#48a8ff';
      c.fillRect(15, topY + 58, barW * armFrac, 3);

      if (swim.under) {
        c.fillStyle = '#48dbfb';
        c.fillRect(15, topY + 63, barW * swim.air, 3);
      }

      // Row 1 Pills: SWAP + WEAPON/AMMO (opens Weapon Wheel)
      if (otherLead.name !== lastSwapName) {
        lastSwapName = otherLead.name;
        lastSwapStr = `SWAP ${otherLead.name}`;
      }
      c.fillStyle = 'rgba(10, 14, 24, 0.8)';
      c.beginPath(); c.roundRect(swapRect.x, swapRect.y, swapRect.w, swapRect.h, 6); c.fill();
      c.fillStyle = '#7ee8ff'; c.font = '700 10px Rubik, sans-serif';
      c.fillText(fitText(c, 'swap', lastSwapStr, swapRect.w - 10), swapRect.x + 5, swapRect.y + 15);

      const wk = activeLead.weaponKind;
      const gObj = activeGun(activeLead);
      const ammoClip = gObj ? gObj.ammo : wk === 'grenade' ? activeLead.pouch.count('grenades') : -1;
      const ammoPool = gObj ? activeLead.pouch.count(ARSENAL[wk].ammo) : -1;
      if (wk !== lastAmmoKind || ammoClip !== lastAmmoClip || ammoPool !== lastAmmoPool) {
        lastAmmoKind = wk;
        lastAmmoClip = ammoClip;
        lastAmmoPool = ammoPool;
        lastAmmoText = gObj ? `${WEAPON_LABELS[wk]} ${ammoClip}/${ammoPool}` : wk === 'grenade' ? `GRENADE ${ammoClip}` : WEAPON_LABELS[wk];
      }
      c.fillStyle = weaponWheelOpen ? 'rgba(255, 209, 102, 0.28)' : 'rgba(10, 14, 24, 0.8)';
      c.beginPath(); c.roundRect(gunRect.x, gunRect.y, gunRect.w, gunRect.h, 6); c.fill();
      c.fillStyle = '#ffd166';
      c.fillText(fitText(c, 'gun', lastAmmoText, gunRect.w - 10), gunRect.x + 5, gunRect.y + 15);

      // Row 2 Pills: COVER / CAM or SIREN
      if (!inCar && !inBoat && !inHeli) {
        c.fillStyle = hide.busy ? 'rgba(56, 248, 176, 0.28)' : 'rgba(10, 14, 24, 0.8)';
        c.beginPath(); c.roundRect(covRect.x, covRect.y, covRect.w, covRect.h, 6); c.fill();
        c.fillStyle = '#8ef5c8';
        c.fillText(hide.busy ? 'LEAVE COV' : 'COVER [Q]', covRect.x + 5, covRect.y + 15);

        c.fillStyle = fpsAim ? 'rgba(126, 232, 255, 0.25)' : 'rgba(10, 14, 24, 0.8)';
        c.beginPath(); c.roundRect(camRect.x, camRect.y, camRect.w, camRect.h, 6); c.fill();
        c.fillStyle = '#d8e8ff';
        c.fillText(fpsAim ? '1ST-P' : '3RD-P', camRect.x + 6, camRect.y + 15);
      } else if (inCar && activeCarProfile.cop) {
        c.fillStyle = activeCarMesh?.sirenOn ? 'rgba(255, 77, 90, 0.35)' : 'rgba(10, 14, 24, 0.8)';
        c.beginPath(); c.roundRect(covRect.x, covRect.y, covRect.w, covRect.h, 6); c.fill();
        c.fillStyle = '#ff9ff3';
        c.fillText(activeCarMesh?.sirenOn ? 'SIREN ON' : 'SIREN [H]', covRect.x + 5, covRect.y + 15);
      }
      c.restore();

      // Top-right minimap + live SBPD / gang / shop overlays + turn prompt
      c.save();
      c.globalAlpha = 0.92;
      gps.mini(c, mr.x, mr.y, mr.w, mr.h, MINI_OPTS);
      c.globalAlpha = 1;
      const miniM = gps._mini;
      if (miniM) {
        c.save();
        c.beginPath();
        c.arc(miniM.cx, miniM.cy, miniM.r - 1, 0, Math.PI * 2);
        c.clip();
        const copPulse = Math.floor(t * 5) % 2 === 0;
        for (const u of law.units || []) {
          const cx = u.car?.x, cz = u.car?.z ?? u.car?.y;
          if (cx == null || cz == null) continue;
          gps.toMap(miniM, cx, cz, mapPtScratch);
          c.fillStyle = copPulse ? '#ff4757' : '#3b82f6';
          c.beginPath(); c.arc(mapPtScratch[0], mapPtScratch[1], 3.2, 0, Math.PI * 2); c.fill();
        }
        for (const b of law.boats || []) {
          if (b.down) continue;
          const bx = b.craft?.x, bz = b.craft?.z;
          if (bx == null || bz == null) continue;
          gps.toMap(miniM, bx, bz, mapPtScratch);
          c.fillStyle = copPulse ? '#38bdf8' : '#ff4757';
          c.fillRect(mapPtScratch[0] - 2.5, mapPtScratch[1] - 2.5, 5, 5);
        }
        if (law.heli && !law.heli.down && law.heli.model) {
          const hp = law.heli.model.position;
          gps.toMap(miniM, hp.x, hp.z, mapPtScratch);
          c.strokeStyle = '#ff6b6b';
          c.lineWidth = 1.5;
          c.beginPath(); c.arc(mapPtScratch[0], mapPtScratch[1], 4.2, 0, Math.PI * 2); c.stroke();
        }
        for (const g of gangPool) {
          if (!g.alive) continue;
          gps.toMap(miniM, g.x, g.z, mapPtScratch);
          c.fillStyle = '#ffa502';
          c.beginPath(); c.arc(mapPtScratch[0], mapPtScratch[1], 2.5, 0, Math.PI * 2); c.fill();
        }
        for (const bc of bayCrates) {
          if (bc.taken) continue;
          gps.toMap(miniM, bc.x, bc.z, mapPtScratch);
          c.fillStyle = '#2ef2b8';
          c.fillRect(mapPtScratch[0] - 2.5, mapPtScratch[1] - 2.5, 5, 5);
        }
        if (heliCtrl && !inHeli && !heliMesh.wrecked) {
          gps.toMap(miniM, heliCtrl.pos.x, heliCtrl.pos.z, mapPtScratch);
          c.fillStyle = '#f4b938';
          c.beginPath(); c.arc(mapPtScratch[0], mapPtScratch[1], 3, 0, Math.PI * 2); c.fill();
        }
        c.restore();
      }
      const nx = gps.next;
      if (nx && nx.turn !== 'arrive' && nx.in < 160) {
        const rndIn = Math.max(5, Math.round(nx.in / 5) * 5);
        if (rndIn !== lastNextIn || nx.turn !== lastNextTurn) {
          lastNextIn = rndIn;
          lastNextTurn = nx.turn;
          lastNextStr = `${nx.turn === 'left' ? '↰' : '↱'} ${rndIn} m`;
        }
        const ty = mr.y + mr.h + 14;
        c.fillStyle = 'rgba(10, 14, 24, 0.8)';
        c.beginPath();
        c.roundRect(mr.x, ty - 11, mr.w, 18, 6);
        c.fill();
        c.font = '700 10px Rubik, sans-serif';
        c.textAlign = 'center';
        c.fillStyle = '#68f8c4';
        c.fillText(lastNextStr, mr.x + mr.w * 0.5, ty + 2);
      }
      c.restore();

      // Vehicle Speedometer / Altitude pill & Engine Health bar
      if (inCar || inBoat || inHeli) {
        let hudNum = 0;
        let unitLabel = 'KM/H';
        if (inHeli && heliCtrl) {
          const gy = metro.ground(heliCtrl.pos.x, heliCtrl.pos.z, heliCtrl.pos.y + 1.5);
          hudNum = Math.max(0, Math.round(heliCtrl.pos.y - gy));
          unitLabel = 'M ALT';
        } else {
          hudNum = Math.round(Math.abs(inCar && carCtrl ? carCtrl.speed : boatCtrl ? boatCtrl.speed : 0) * 3.6);
        }
        const spKey = inHeli ? hudNum + 10000 : hudNum;
        if (spKey !== lastSpeedVal) {
          lastSpeedVal = spKey;
          lastSpeedStr = `${hudNum} ${unitLabel}`;
        }
        c.save();
        c.fillStyle = 'rgba(10, 14, 24, 0.78)';
        c.beginPath(); c.roundRect(W - 86, H - 122, 76, 20, 6); c.fill();
        c.font = '700 11px Rubik, sans-serif';
        c.textAlign = 'center';
        c.fillStyle = carInput.drift ? '#ff9f43' : '#e8f4ff';
        c.fillText(lastSpeedStr, W - 48, H - 108);

        const curVeh = inHeli ? heliMesh : inBoat ? boatMesh : activeCarMesh;
        const vh = curVeh?.health ?? 1;
        if (vh < 0.72) {
          c.fillStyle = 'rgba(10, 14, 24, 0.8)';
          c.fillRect(W - 86, H - 129, 76, 4);
          c.fillStyle = curVeh?.burning && Math.floor(t * 6) % 2 === 0 ? '#ff3b30' : vh < 0.35 ? '#ff5e57' : '#ffae38';
          c.fillRect(W - 86, H - 129, 76 * Math.max(0, vh), 4);
        }
        c.restore();
      }

      // Context Shakedown / Service Shop prompt (Solis Customs / Bayside Arms / Tia Carmen's Diner)
      const nearShop = nearServiceShop();
      if ((shakedownOpen || nearShop) && !weaponWheelOpen && !radioWheelOpen) {
        c.save();
        c.textAlign = 'center';
        c.font = '700 10px Rubik, sans-serif';
        if (shakedownOpen) {
          c.fillStyle = 'rgba(32, 16, 42, 0.94)';
          c.beginPath(); c.roundRect(shopActionRect.x, shopActionRect.y, shopActionRect.w, shopActionRect.h, 7); c.fill();
          c.strokeStyle = '#ff6b9d'; c.lineWidth = 1; c.stroke();
          c.fillStyle = '#ffeef6';
          c.fillText('[1] PRESSURE ADJUSTER (+$150)', shopActionRect.x + shopActionRect.w * 0.5, shopActionRect.y + 17);

          c.fillStyle = 'rgba(16, 36, 46, 0.94)';
          c.beginPath(); c.roundRect(shopAltRect.x, shopAltRect.y, shopAltRect.w, shopAltRect.h, 7); c.fill();
          c.strokeStyle = '#38f8b0'; c.stroke();
          c.fillStyle = '#38f8b0';
          c.fillText('[2] GRAB LEDGER & BOLT', shopAltRect.x + shopAltRect.w * 0.5, shopAltRect.y + 17);
        } else if (nearShop === 'diner') {
          c.fillStyle = 'rgba(42, 34, 14, 0.92)';
          c.beginPath(); c.roundRect(shopActionRect.x, shopActionRect.y, shopActionRect.w, shopActionRect.h, 7); c.fill();
          c.strokeStyle = '#ffcf5c'; c.lineWidth = 1; c.stroke();
          c.fillStyle = '#fff5d6';
          c.fillText("TIA CARMEN'S DINER · REST & HEAL", shopActionRect.x + shopActionRect.w * 0.5, shopActionRect.y + 17);

          c.fillStyle = 'rgba(20, 26, 38, 0.92)';
          c.beginPath(); c.roundRect(shopAltRect.x, shopAltRect.y, shopAltRect.w, shopAltRect.h, 7); c.fill();
          c.strokeStyle = '#7ee8ff'; c.stroke();
          c.fillStyle = '#7ee8ff';
          c.fillText(`SWAP TO ${otherLead.name.toUpperCase()}`, shopAltRect.x + shopAltRect.w * 0.5, shopAltRect.y + 17);
        } else if (nearShop === 'respray') {
          const cost = cash >= 250 ? 250 : law.stars > 0 && jobsDoneCount === 0 ? 0 : 250;
          c.fillStyle = 'rgba(16, 46, 66, 0.9)';
          c.beginPath(); c.roundRect(shopActionRect.x, shopActionRect.y, shopActionRect.w, shopActionRect.h, 7); c.fill();
          c.strokeStyle = '#3cd8ff'; c.lineWidth = 1; c.stroke();
          c.fillStyle = '#e8fbff';
          c.fillText(cost ? `SOLIS CUSTOMS · RESPRAY & TUNE $${cost}` : 'SOLIS CUSTOMS · FREE RESPRAY & TUNE', shopActionRect.x + shopActionRect.w * 0.5, shopActionRect.y + 17);
        } else {
          c.fillStyle = 'rgba(42, 28, 12, 0.9)';
          c.beginPath(); c.roundRect(shopActionRect.x, shopActionRect.y, shopActionRect.w, shopActionRect.h, 7); c.fill();
          c.strokeStyle = '#ffb24a'; c.lineWidth = 1; c.stroke();
          c.fillStyle = '#fff5dc';
          c.fillText('BAYSIDE ARMS · +50 ARMOR & AMMO ($150)', shopActionRect.x + shopActionRect.w * 0.5, shopActionRect.y + 17);

          const nxtW = nextLockedWeapon();
          if (nxtW) {
            c.fillStyle = 'rgba(20, 26, 38, 0.92)';
            c.beginPath(); c.roundRect(shopAltRect.x, shopAltRect.y, shopAltRect.w, shopAltRect.h, 7); c.fill();
            c.strokeStyle = '#ffd166'; c.stroke();
            c.fillStyle = '#ffd166';
            c.fillText(`BUY ${WEAPON_LABELS[nxtW]} ($${WEAPON_COSTS[nxtW]})`, shopAltRect.x + shopAltRect.w * 0.5, shopAltRect.y + 17);
          }
        }
        c.restore();
      }

      // Burner Phone Call Banner
      if (phoneT > 0 && phoneLine && !weaponWheelOpen && !radioWheelOpen) {
        c.save();
        c.globalAlpha = Math.min(1, phoneT * 2);
        c.fillStyle = 'rgba(10, 22, 34, 0.9)';
        c.beginPath(); c.roundRect(phoneCardRect.x, phoneCardRect.y, phoneCardRect.w, phoneCardRect.h, 8); c.fill();
        c.strokeStyle = '#38f8b0'; c.lineWidth = 1; c.stroke();
        c.font = '700 9px Rubik, sans-serif';
        c.textAlign = 'left';
        c.fillStyle = '#38f8b0';
        c.fillText(fitText(c, 'ph1', phoneTitleStr, phoneCardRect.w - 14), phoneCardRect.x + 8, phoneCardRect.y + 12);
        c.font = '500 9px Rubik, sans-serif';
        c.fillStyle = '#e8f4ff';
        c.fillText(fitText(c, 'ph2', phoneLine1, phoneCardRect.w - 14), phoneCardRect.x + 8, phoneCardRect.y + 24);
        c.fillText(fitText(c, 'ph3', phoneLine2, phoneCardRect.w - 14), phoneCardRect.x + 8, phoneCardRect.y + 34);
        c.restore();
      }

      // Multi-Station Radio Bar (< PREV | Station 1/5 -> Wheel | NEXT >)
      if (radioDirty || ((skyTick & 15) === 0 && radio.power)) {
        radioDirty = false;
        const rn = radio.now;
        cachedRadOn = rn.on;
        cachedRadTitle = rn.on ? `${rn.station} ${rn.freq} (${rn.index + 1}/${STATIONS.length})` : 'Radio · 5 Stations';
        cachedRadSub = rn.on ? (rn.kind === 'talk' ? (rn.line || rn.dj) : rn.song ? `${rn.song.title} · ${rn.song.artist}` : '') : '';
      }
      c.save();
      c.fillStyle = 'rgba(10, 14, 24, 0.84)';
      c.beginPath();
      c.roundRect(rdRect.x, rdRect.y, rdRect.w, rdRect.h, 8);
      c.fill();
      c.strokeStyle = cachedRadOn ? 'rgba(255, 178, 74, 0.5)' : 'rgba(255, 255, 255, 0.22)';
      c.lineWidth = 1;
      c.stroke();

      c.font = '700 11px Rubik, sans-serif';
      c.fillStyle = '#d8e2f5';
      c.textAlign = 'center';
      c.fillText('◀', rdPrevRect.x + 12, rdRect.y + rdRect.h * 0.62);
      c.fillText('▶', rdNextRect.x + 12, rdRect.y + rdRect.h * 0.62);

      const centerLeft = rdRect.x + 24;
      const centerW = rdRect.w - 48;
      icon(c, cachedRadOn ? 'musical-notes' : 'speaker-off', centerLeft + 10, rdRect.y + rdRect.h * 0.5, 13, cachedRadOn ? ICON_RAD_ON : ICON_RAD_OFF);
      c.textAlign = 'left';
      if (!cachedRadOn) {
        c.font = '600 10px Rubik, sans-serif';
        c.fillStyle = '#c8d0e0';
        c.fillText(fitText(c, 'rad1', cachedRadTitle, centerW - 22), centerLeft + 20, rdRect.y + rdRect.h * 0.63);
      } else {
        c.font = '700 10px Rubik, sans-serif';
        c.fillStyle = '#ffffff';
        c.fillText(fitText(c, 'rad1', cachedRadTitle, centerW - 22), centerLeft + 20, rdRect.y + 12);
        c.font = '500 9px Rubik, sans-serif';
        c.fillStyle = '#b8c4dc';
        c.fillText(fitText(c, 'rad2', cachedRadSub, centerW - 22), centerLeft + 20, rdRect.y + 23);
      }
      c.restore();

      // Objective toast banner (strictly below radio bar & phone banner)
      if (bannerT > 0 && bannerText && !weaponWheelOpen && !radioWheelOpen && !overKind) {
        const minBanTop = Math.max(mr.y + mr.h + 26, rdRect.y + rdRect.h + 10, phoneT > 0 ? phoneCardRect.y + phoneCardRect.h + 10 : 0);
        const banY = minBanTop + 15;
        c.save();
        c.globalAlpha = Math.min(1, bannerT * 2);
        c.font = '700 11px Rubik, sans-serif';
        c.textAlign = 'center';
        c.fillStyle = 'rgba(8, 12, 20, 0.8)';
        c.beginPath();
        c.roundRect(14, banY - 15, W - 28, 22, 7);
        c.fill();
        c.fillStyle = bannerCol;
        c.fillText(fitText(c, 'ban', bannerText, W - 40), W * 0.5, banY);
        c.restore();
      }

      // GTA Weapon Wheel Overlay (2 x 4 for 8 weapons + reload button)
      if (weaponWheelOpen) {
        const px = wheelPanelRect.x, py = wheelPanelRect.y, pw = wheelPanelRect.w;
        c.save();
        c.fillStyle = 'rgba(8, 12, 22, 0.92)';
        c.beginPath(); c.roundRect(px, py, pw, wheelPanelRect.h, 12); c.fill();
        c.strokeStyle = '#ffd166'; c.lineWidth = 1.5; c.stroke();
        c.font = '700 12px Rubik, sans-serif'; c.fillStyle = '#ffd166'; c.textAlign = 'center';
        c.fillText('ARSENAL WHEEL', px + pw * 0.5, py + 22);

        const colW = Math.floor((pw - 30) / 2);
        for (let i = 0; i < WEAPON_ORDER.length; i++) {
          const k = WEAPON_ORDER[i];
          const col = i % 2, row = Math.floor(i / 2);
          const bx = px + 10 + col * (colW + 10);
          const by = py + 32 + row * 42;
          const owned = activeLead.unlocked.has(k);
          const equipped = activeLead.weaponKind === k;
          c.fillStyle = equipped ? 'rgba(255, 209, 102, 0.28)' : owned ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)';
          c.beginPath(); c.roundRect(bx, by, colW, 36, 7); c.fill();
          c.strokeStyle = equipped ? '#ffd166' : 'rgba(255,255,255,0.18)'; c.lineWidth = 1; c.stroke();
          c.textAlign = 'left'; c.font = '700 10px Rubik, sans-serif';
          c.fillStyle = owned ? '#ffffff' : '#7b879c';
          c.fillText(WEAPON_LABELS[k], bx + 8, by + 15);
          c.font = '500 9px Rubik, sans-serif';
          const g = activeLead.guns[k];
          const sub = !owned ? `ARMS $${WEAPON_COSTS[k]}` : g ? `${g.ammo}/${activeLead.pouch.count(ARSENAL[k].ammo)}` : k === 'grenade' ? `${activeLead.pouch.count('grenades')} LEFT` : 'MELEE';
          c.fillStyle = owned ? '#a6c4e0' : '#ffb24a';
          c.fillText(sub, bx + 8, by + 29);
        }
        // Reload button at bottom of wheel
        const rby = py + 206;
        c.fillStyle = 'rgba(56, 248, 176, 0.2)';
        c.beginPath(); c.roundRect(px + 10, rby, pw - 20, 32, 7); c.fill();
        c.fillStyle = '#38f8b0'; c.textAlign = 'center'; c.font = '700 11px Rubik, sans-serif';
        c.fillText('RELOAD ACTIVE WEAPON [R]', px + pw * 0.5, rby + 20);
        c.restore();
      }

      // GTA Radio Station Wheel Overlay
      if (radioWheelOpen) {
        const px = wheelPanelRect.x, py = wheelPanelRect.y, pw = wheelPanelRect.w;
        c.save();
        c.fillStyle = 'rgba(8, 12, 22, 0.92)';
        c.beginPath(); c.roundRect(px, py, pw, wheelPanelRect.h, 12); c.fill();
        c.strokeStyle = '#ffb24a'; c.lineWidth = 1.5; c.stroke();
        c.font = '700 12px Rubik, sans-serif'; c.fillStyle = '#ffb24a'; c.textAlign = 'center';
        c.fillText('SOLIS BAY RADIO', px + pw * 0.5, py + 22);

        for (let i = 0; i < STATIONS.length; i++) {
          const st = STATIONS[i];
          const by = py + 32 + i * 36;
          const cur = radio.power && radio.index === i;
          c.fillStyle = cur ? 'rgba(255, 178, 74, 0.25)' : 'rgba(255, 255, 255, 0.06)';
          c.beginPath(); c.roundRect(px + 10, by, pw - 20, 31, 6); c.fill();
          c.strokeStyle = cur ? '#ffb24a' : 'rgba(255,255,255,0.14)'; c.lineWidth = 1; c.stroke();
          c.textAlign = 'left'; c.font = '700 10px Rubik, sans-serif';
          c.fillStyle = cur ? '#ffd166' : '#ffffff';
          c.fillText(`${st.name} · ${st.freq}`, px + 18, by + 13);
          c.font = '500 9px Rubik, sans-serif'; c.fillStyle = '#b4c2d8';
          c.fillText(fitText(c, `rw${i}`, `${st.dj.name} · ${st.tagline}`, pw - 38), px + 18, by + 25);
        }
        const offY = py + 32 + STATIONS.length * 36 + 4;
        c.fillStyle = !radio.power ? 'rgba(255, 107, 107, 0.25)' : 'rgba(255, 255, 255, 0.08)';
        c.beginPath(); c.roundRect(px + 10, offY, pw - 20, 32, 6); c.fill();
        c.fillStyle = '#ff9f9f'; c.textAlign = 'center'; c.font = '700 10px Rubik, sans-serif';
        c.fillText('RADIO OFF (SCORE MUSIC)', px + pw * 0.5, offY + 20);
        c.restore();
      }

      // WASTED / BUSTED Dramatic End Beat
      if (overKind) {
        c.save();
        c.fillStyle = overKind === 'BUSTED' ? 'rgba(10, 26, 66, 0.55)' : 'rgba(54, 8, 12, 0.55)';
        c.fillRect(0, 0, W, H);
        c.fillStyle = 'rgba(0, 0, 0, 0.72)';
        c.fillRect(0, H * 0.42, W, 62);
        c.font = '900 30px Rubik, sans-serif';
        c.textAlign = 'center';
        c.fillStyle = overKind === 'BUSTED' ? '#5ea8ff' : '#ff4d5a';
        c.fillText(overKind, W * 0.5, H * 0.42 + 42);
        c.restore();
      }
    },

    down(x, y, id) {
      if (overKind) return;
      const { mr } = layoutTopHud();

      if (weaponWheelOpen) {
        const px = wheelPanelRect.x, py = wheelPanelRect.y, pw = wheelPanelRect.w;
        if (!hitBox(wheelPanelRect, x, y)) { weaponWheelOpen = false; return; }
        const colW = Math.floor((pw - 30) / 2);
        for (let i = 0; i < WEAPON_ORDER.length; i++) {
          const col = i % 2, row = Math.floor(i / 2);
          const bx = px + 10 + col * (colW + 10);
          const by = py + 32 + row * 42;
          if (x >= bx && x <= bx + colW && y >= by && y <= by + 36) {
            const k = WEAPON_ORDER[i];
            if (equipWeapon(activeLead, k)) {
              sounds.click();
              weaponWheelOpen = false;
            } else {
              say(`Buy ${WEAPON_LABELS[k]} at Bayside Arms ($${WEAPON_COSTS[k]})`, '#ffb24a', 2.0);
            }
            return;
          }
        }
        const rby = py + 206;
        if (x >= px + 10 && x <= px + pw - 10 && y >= rby && y <= rby + 32) {
          triggerReload();
          weaponWheelOpen = false;
        }
        return;
      }

      if (radioWheelOpen) {
        const px = wheelPanelRect.x, py = wheelPanelRect.y, pw = wheelPanelRect.w;
        if (!hitBox(wheelPanelRect, x, y)) { radioWheelOpen = false; return; }
        for (let i = 0; i < STATIONS.length; i++) {
          const by = py + 32 + i * 36;
          if (x >= px + 10 && x <= px + pw - 10 && y >= by && y <= by + 31) {
            tuneRadioStation(i);
            radioWheelOpen = false;
            return;
          }
        }
        const offY = py + 32 + STATIONS.length * 36 + 4;
        if (x >= px + 10 && x <= px + pw - 10 && y >= offY && y <= offY + 32) {
          turnRadioOff();
          radioWheelOpen = false;
        }
        return;
      }

      if (gps.opened) {
        if (x >= mr.x && x <= mr.x + mr.w && y >= mr.y && y <= mr.y + mr.h) gps.close();
        else gps.tap(x, y);
        return;
      }

      if (hitBox(mr, x, y)) { gps.open(); return; }
      if (hitBox(swapRect, x, y)) { swapKey = true; return; }
      if (hitBox(gunRect, x, y)) { weaponWheelOpen = true; radioWheelOpen = false; sounds.click(); return; }

      if (!inCar && !inBoat && !inHeli) {
        if (hitBox(covRect, x, y)) { coverKey = true; return; }
        if (hitBox(camRect, x, y)) {
          fpsAim = !fpsAim;
          if (aimMode) setAimMode(true);
          sounds.click();
          say(fpsAim ? 'First-Person ADS Active' : 'Over-Shoulder ADS Active', '#7ee8ff', 1.8);
          return;
        }
      } else if (inCar && activeCarProfile.cop && hitBox(covRect, x, y)) {
        activeCarMesh?.siren?.(!activeCarMesh.sirenOn);
        sounds.click();
        return;
      }

      if (shakedownOpen) {
        if (hitBox(shopActionRect, x, y)) { completeEscrowShakedown(true); return; }
        if (hitBox(shopAltRect, x, y)) { completeEscrowShakedown(false); return; }
      }

      const nearShopTap = nearServiceShop();
      if (nearShopTap) {
        if (hitBox(shopActionRect, x, y) && useServiceAction(0)) return;
        if ((nearShopTap === 'arms' && nextLockedWeapon() || nearShopTap === 'diner') && hitBox(shopAltRect, x, y) && useServiceAction(1)) return;
      }

      if (phoneT > 0 && hitBox(phoneCardRect, x, y)) {
        phoneT = 0;
        phoneHoldLeft = 0;
        radio.hold(false);
        return;
      }

      if (hitBox(rdPrevRect, x, y)) { tuneRadioStation((radio.power ? radio.index : 0) - 1); return; }
      if (hitBox(rdNextRect, x, y)) { tuneRadioStation(radio.power ? radio.index + 1 : 0); return; }
      if (hitBox(rdRect, x, y)) { radioWheelOpen = true; weaponWheelOpen = false; sounds.click(); return; }

      pad.down(x, y, id);
      let padClaimed = pad.left.id === id;
      for (let bi = 0; !padClaimed && bi < padBtnList.length; bi++) {
        if (padBtnList[bi].id === id) padClaimed = true;
      }
      if (!padClaimed && lookDragId === null) {
        lookDragId = id;
        lookLastX = x;
        lookLastY = y;
      }
    },

    move(x, y, pr, id) {
      if (overKind) return;
      if (id === lookDragId && pr) {
        camRig.yaw -= (x - lookLastX) * 0.008;
        camRig.pitch = clamp(camRig.pitch - (y - lookLastY) * 0.006, -0.75, 0.75);
        lookLastX = x;
        lookLastY = y;
      }
      if (!gps.opened && !weaponWheelOpen && !radioWheelOpen) pad.move(x, y, pr, id);
    },

    up(x, y, id) {
      if (id === lookDragId) lookDragId = null;
      if (!gps.opened && !weaponWheelOpen && !radioWheelOpen) pad.up(x, y, id);
    },

    key(k, d) {
      if (overKind) return;
      if (d) {
        if (k === 'm' || k === 'M') { if (gps.opened) gps.close(); else gps.open(); }
        else if (k === 'e' || k === 'E') rideKey = true;
        else if (k === 'r' || k === 'R') triggerReload();
        else if (k === 'q' || k === 'Q') coverKey = true;
        else if (k === 'c' || k === 'C') swapKey = true;
        else if (k === 'Tab') gunKey = true;
        else if (k === 'v' || k === 'V') aimKey = true;
        else if (k === 'h' || k === 'H') {
          if (inCar && activeCarProfile.cop) activeCarMesh?.siren?.(!activeCarMesh.sirenOn);
          else if (inCar) { try { sounds.horn?.(); } catch {} }
        }
        else if (shakedownOpen && k === '1') completeEscrowShakedown(true);
        else if (shakedownOpen && k === '2') completeEscrowShakedown(false);
        else if (k === '[') tuneRadioStation((radio.power ? radio.index : 0) - 1);
        else if (k === ']') tuneRadioStation(radio.power ? radio.index + 1 : 0);
        else if (k === 'n' || k === 'N') { radioWheelOpen = !radioWheelOpen; weaponWheelOpen = false; }
      }
      if (k === 'f' || k === 'F') fireHeld = d;
      keys.key(k, d);
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'solis-bay',
  title: 'Solis Bay',
  tag: 'Next Gen · Action',
  retro: true,
  era: 'nextgen',
  pal: 'grape',
  w: 300,
  h: 480,
  maxW: 600,
  maxH: 520,
  goal: 100,
  hint: 'Drive cars & bikes, pilot the chopper, shoot or blast 3 crews, visit Solis Customs & Tia Carmen\'s, and shake 5★ SBPD for 100 Rep.',
  creator: 'Rob',
  make,
};
