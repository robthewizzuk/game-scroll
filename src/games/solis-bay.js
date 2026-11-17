// Solis Bay: Next Gen 3D open-city crime action (Phase 3).
// Original 5-district coastal bay city (Coral Strip, Old Naranja, Glass Quarter, Pelican Marina, Sawgrass Edge).
// Leads: Mateo "Mako" Delgado & Nadia Vance — drive, hijack, swim, boat, take cover, shoot with FPS/shoulder ADS,
// duck into open shops, raid Pelican Port container yard, and evade armed SBPD cars, boats, and choppers for 100 Rep.
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
const { Boat } = gs.craft;
const { Swimmer } = gs.climb;
const { Loadout, Pouch, Pickups, Health, DriveBy, ARSENAL, weaponSound } = gs.combat;
const { Cover3D, TakeCover } = gs.tactics;
const { CameraRig, GunRig } = gs.camera;
const { World3D } = gs.physics3d;
const { Ground } = gs.outdoors;
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

// Pelican Marina Block 3 (plaza: x 914..995, z -408..-348) & Slip 0 waterfront coordinates
const YARD_X = 954.6;
const YARD_Z = -378.0;
const YARD_Y = 0.165;
const SLIP_POS = { x: 1099.06, y: 0, z: -439.19, heading: 0 };
const DOCK_POS = { x: 1095.86, y: 0.15, z: -439.19 };
const BEACH_LOT = { x: 1656.5, y: 0.15, z: -220.0 };

/** @type {import('../gamescroll.js').RadioStation[]} */
const STATIONS = [
  { name: 'Coral FM', freq: '88.4', dj: { name: 'Sunny Vega', voice: 'woman' }, mood: 'happy' },
  { name: 'Glades Bass', freq: '95.1', dj: { name: 'Big Cypress', voice: 'man' }, mood: 'tense' },
  { name: 'Sunset Soul', freq: '102.7', dj: { name: 'Tia Carmen', voice: 'woman' }, mood: 'calm' },
  { name: 'Baybeat', freq: '107.3', dj: { name: 'DJ Mako', voice: 'man' }, mood: 'chase' },
];

const JOBS = [
  {
    name: 'Palma Strip Heat',
    kind: 'vehicle',
    fromDistrict: 'Coral Strip',
    toDistrict: 'Old Naranja',
    call: 'Tia Carmen: Boost the crimson coupe on Coral Strip and bring it to Old Naranja!',
    heat: 1,
    rep: 25,
  },
  {
    name: 'Escrow Shakedown',
    kind: 'interior',
    toDistrict: 'Old Naranja',
    call: 'Nadia: Step inside the Old Naranja shop, collect the ledger, and lose 2★ SBPD!',
    heat: 2,
    rep: 25,
  },
  {
    name: 'Pelican Cut',
    kind: 'boat',
    toDistrict: 'Pelican Marina',
    call: 'Dockhand: Board the Flamingo 24 boat at Pelican Marina and haul manifest to Port Yard!',
    heat: 2,
    rep: 30,
  },
  {
    name: 'Neon Protection',
    kind: 'shootout',
    toDistrict: 'Glass Quarter',
    call: 'Nadia: Swap leads or push Glass Quarter — survive 3★ SBPD squad & chopper sweep!',
    heat: 3,
    rep: 30,
  },
  {
    name: 'Sawgrass Salvage',
    kind: 'vehicle',
    fromDistrict: 'Glass Quarter',
    toDistrict: 'Sawgrass Edge',
    call: 'Salvage: Ditch the heat out west in foggy Sawgrass Edge!',
    heat: 2,
    rep: 35,
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

// Reusable scratch & option objects (zero per-frame allocations)
const camDirVec = new THREE.Vector3();
const aimOrigin = { x: 0, y: 0, z: 0 };
const aimDirObj = { x: 0, y: 0, z: -1 };
const aheadPt = { x: 0, z: 0 };
const playerQuery = { x: 0, z: 0, y: 0, heading: 0, v: 0, car: false, boat: false, swim: false };
const avoidQuery = { x: 0, z: 0, vx: 0, vz: 0 };
const rigTarget = { position: new THREE.Vector3(), yaw: 0, grounded: true };
const coverMoveVec = { x: 0, z: 0 };
const boatInput = { throttle: 0, steer: 0 };
const carInput = { throttle: 0, steer: 0, brake: false };
const engOpts = { from: 110, vol: 0 };
const hideInput = { move: coverMoveVec, aim: false, blind: false };
const swimInput = { move: coverMoveVec, up: false, down: false, fast: false };
const swimPlayOpts = { at: 0 };
const hidePlayOpts = { fade: 0.1 };
const rigUpdOpts = { speed: 0 };
const BLEND_OPTS = { idle: 0, walk: 1.8, run: 4.5 };
const BUMP_OPTS = { keep: 0.45 };
const COVER_UPD_OPTS = { reach: 12 };
const LIGHT_FIT_OPTS = { far: 170, tall: 60, near: 28 };
const MINI_OPTS = { range: 165 };
const ICON_RAD_ON = { color: '#ffb24a' };
const ICON_RAD_OFF = { color: '#9aa4b8' };
const INDOOR_PLACE = { tail: 0.55, wet: 0.22, echo: 0.1, delay: 0.06 };
/** @type {Record<string, Parameters<HDView['look']>[1]>} */
const MOOD_OPTS = {
  'golden hour': { air: { wet: 0.22, macro: 0.6 }, bloom: 0.45 },
  fog: { air: { haze: 0.0042, mist: 0.006, wet: 0.35, macro: 0.6 }, beams: { density: 0.04, strength: 0.45, glow: 0.4 } },
  'night rain': { bloom: 0.55, exposure: 1.12, glare: 0.45, air: { haze: 0.0024, wet: 0.78, macro: 0.6 }, weather: { kind: 'rain', amount: 0.65, wet: 0.85, pools: 0.75 } },
  'rainy dusk': { bloom: 0.48, air: { haze: 0.002, wet: 0.8, macro: 0.6 }, weather: { kind: 'rain', amount: 0.5, wet: 0.85, pools: 0.7 } },
  overcast: { air: { haze: 0.0018, wet: 0.55, macro: 0.6 }, weather: { kind: 'rain', amount: 0.3, wet: 0.6, pools: 0.45 } },
};
const tmpBox = new THREE.Box3();
const tmpSize = new THREE.Vector3();
const tmpCenter = new THREE.Vector3();
const _hitPt = new THREE.Vector3();
const _hitNrm = new THREE.Vector3();

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
  let yardPropsGroup, beachPropsGroup;
  let mako, nadia, barracuda, hotCoupe, boatMesh, arrowMesh;
  let dropRing, dropBeacon, pickRing, pickBeacon;
  let pickupMeshes = [];
  let fpWeapons = {};
  let wpWieldMako = {}, wpWieldNadia = {};
  let camRig, gunRig;
  let yardBoundsShapes = [];
  let decalTargetMeshes = [];
  let worldReady = false;

  const makeBeacon = (col) => {
    const mat = pbr(col, { glow: 2.8, rough: 0.25, metal: 0.2 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.16, 10, 28), mat);
    ring.rotation.x = Math.PI / 2;
    const beamMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.9, 18, 16, 1, true), beamMat);
    v.scene.add(ring, beam);
    return [ring, beam];
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

    yardGround = new Ground(v, {
      size: [60, 44],
      kind: 'yard',
      at: [YARD_X, YARD_Z],
      y: YARD_Y,
      bumps: 0.35,
    });
    // Haul road, painted bays, yellow hazard zones, oil and skid wear
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
    // Concrete slab base collider for Pelican Port Container Yard
    shapes.push({ box: [60, 0.34, 44], at: { x: YARD_X, y: -0.005, z: YARD_Z } });

    const placeProp = (kind, x, y, z, rotY = 0, opts = {}, solid = true, targetGroup = yardPropsGroup) => {
      const g = prop(kind, opts);
      g.position.set(x, y, z);
      g.rotation.y = rotY;
      targetGroup.add(g);
      if (solid) addYardStaticCollider(g, shapes);
      return g;
    };

    // Gantry crane straddling the haul lane
    placeProp('crane', YARD_X - 2, YARD_Y, YARD_Z, 0, { size: 11, seed: 3 }, false);
    // Containers forming industrial alleys and cover
    const c1 = placeProp('container', YARD_X - 12, YARD_Y, YARD_Z - 11, 0, { size: 6.06, colour: '#8b3728', seed: 11 });
    const c2 = placeProp('container', YARD_X + 2, YARD_Y, YARD_Z - 11, 0, { size: 6.06, colour: '#2d5c84', seed: 22 });
    const c3 = placeProp('container', YARD_X + 14, YARD_Y, YARD_Z + 11, Math.PI * 0.5, { size: 12.19, colour: '#3e6948', seed: 33 });

    // Stencils, rust, hazard signs, logos, graffiti on containers
    stampPropDecal(c1, [1.24, 1.35, 0], [1, 0, 0], mark('stencil', { text: 'SB-04', colour: '#ece6d4', size: [1.3, 0.42] }));
    stampPropDecal(c1, [0, 1.4, 3.04], [0, 0, 1], mark('hazard', { sign: 'flame', word: true, size: 0.72 }));
    stampPropDecal(c2, [-1.24, 1.35, 0.8], [-1, 0, 0], mark('logo', { text: 'SOLIS', colour: '#e6b43c', size: 0.9 }));
    stampPropDecal(c2, [1.24, 1.0, -1.2], [1, 0, 0], mark('rust', { size: [1.2, 1.4] }));
    stampPropDecal(c3, [1.24, 1.2, 1.5], [1, 0, 0], mark('graffiti', { size: [1.6, 0.9] }));

    // Skip (solid cover) and decorative yard props (drums, barriers, bollards)
    const skip = placeProp('skip', YARD_X - 20, YARD_Y, YARD_Z - 12, 0.25, { seed: 5 }, true);
    stampPropDecal(skip, [0.95, 0.8, 0], [1, 0, 0], mark('stripes', { size: [1.3, 0.28] }));
    placeProp('oildrum', YARD_X - 5, YARD_Y, YARD_Z - 7, 0.4, { seed: 7 }, false);
    placeProp('oildrum', YARD_X - 4.1, YARD_Y, YARD_Z - 7.4, 1.2, { seed: 8 }, false);
    placeProp('barrier', YARD_X - 24, YARD_Y, YARD_Z - 5, Math.PI * 0.5, { seed: 1 }, false);
    placeProp('waterbarrier', YARD_X - 24, YARD_Y, YARD_Z + 5, Math.PI * 0.5, { seed: 3 }, false);

    // Quay bollards beside Marina Slip 0
    for (let i = 0; i < 3; i++) {
      placeProp('bollard', DOCK_POS.x - 14, 0.15, DOCK_POS.z + i * 10, 0, { seed: i + 1 }, false);
    }

    // Worn corrugated dock office locker on yard edge using explicit material recipe + wear() + decals
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

    // Coral Strip beachfront customs shack & promenade barriers (worn look visible from spawn)
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
    // Construct World3D first so if Rapier WASM throws StillLoading, no Three/WebGL context is leaked
    world = new World3D({ gravity: -20 });

    human.need([MAKO_LOOK, NADIA_LOOK]);
    v = new HDView({ bg: '#7aa8d8', fog: 0.00018, env: 0.5, amb: 0.55, fov: 60 });
    v.autoOcclude = false;
    v.occluders?.(null);

    light = sun('#ffc48a', 3.0, 90, [0.72, 0.2, -0.5]);
    light.softShadows(2);
    v.scene.add(light, light.target);
    v.sun = light;
    v.onTier(T => light.setTier(T));

    weather = new Weather(v, { kind: 'rain', amount: 0 });
    v.look('golden hour', MOOD_OPTS['golden hour']);

    sky = new Sky(v, {
      time: 17.55,
      speed: 0.12,
      physical: true,
      clouds: 0.35,
      gap: 0.5,
      env: false,
      sun: light,
      fog: false,
      light: false,
    });

    metro = new Metro(v, {
      seed: 77,
      districts: DISTRICTS,
      coast: 'bay',
      bay: 380,
      climate: 'tropical',
      live: 130,
      budget: 0.2,
      keep: 250,
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
    law = new Wanted(metro, api, { max: 3, cars: 2, officers: true, brains: true, armed: true, air: true, water: true });
    warmupCop = law?.cops?.[0]?.twin() || null;
    if (warmupCop) warmupCop.lod = 0;
    inside = new Interiors(metro, { world: false, link: false, reach: 3.0, people: 1, auto: true, seed: 77 });
    cover = new Cover3D({ world, ms: 0.25, space: 2.0, floors: 1, cell: 4 });
    hide = new TakeCover(cover);
    swim = new Swimmer({ height: 1.8, water: metro.water, world });
    pickups = new Pickups({ reach: 1.8 });

    radio = new Radio({ stations: STATIONS, seed: 'solis-bay', sky, on: false });
    scoreMusic = filmScore({ mood: 'tense', key: 'D', seed: 77, vol: 0.85 });

    buildPortAndBeachProps();

    mako = human(MAKO_LOOK);
    nadia = human(NADIA_LOOK);
    mako.lod = 0;
    nadia.lod = 1;
    if (mako.rig) mako.rig.steps = false;
    if (nadia.rig) nadia.rig.steps = false;
    if (mako.breath) mako.breath.on = false;
    if (nadia.breath) nadia.breath.on = false;
    if (mako.idle) mako.idle.on = false;
    if (nadia.idle) nadia.idle.on = false;
    if (mako.rig?.follow) mako.rig.follow.amount = 0;
    if (nadia.rig?.follow) nadia.rig.follow.amount = 0;
    v.scene.add(mako, nadia);

    // Pre-warm third-person and first-person weapon models behind Play loading screen
    const wpKinds = /** @type {const} */ (['pistol', 'smg', 'shotgun', 'rifle', 'baton']);
    for (const k of wpKinds) {
      const mFp = weapon(k, { shadows: false });
      mFp.visible = true;
      fpWeapons[k] = mFp;
      if (k !== 'rifle') {
        const m1 = weapon(k, { shadows: false });
        wpWieldMako[k] = m1.wield(mako);
        m1.visible = false;
        const m2 = weapon(k, { shadows: false });
        wpWieldNadia[k] = m2.wield(nadia);
        m2.visible = false;
      }
    }
    const r1 = weapon('rifle', { shadows: false });
    wpWieldMako.rifle = r1.wield(mako);
    r1.visible = false;
    const r2 = weapon('rifle', { shadows: false });
    wpWieldNadia.rifle = r2.wield(nadia);
    r2.visible = false;

    barracuda = vehicle('car', { style: 'saloon', colour: '#16969a', inside: true, lit: false });
    hotCoupe = vehicle('car', { style: 'sports', colour: '#ff6f61', inside: true, lit: false });
    hotCoupe.visible = false;
    boatMesh = vehicle('boat', { style: 'motor', colour: '#d8473c', lit: true });
    v.scene.add(barracuda, hotCoupe, boatMesh);
    v.detail([barracuda, hotCoupe, boatMesh], false);

    camRig = new CameraRig(v, { mode: 'chase', distance: 5.8, height: 2.3, look: 1.35, lag: 0.14, walls: world, fov: 60 });
    gunRig = new GunRig(v, fpWeapons.pistol, { kind: 'pistol', rig: camRig });
    gunRig.root.visible = false;

    const arrowMat = pbr('#38f8b0', { glow: 0.4, rough: 0.35 });
    arrowMesh = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.48, 4), arrowMat);
    v.scene.add(arrowMesh);

    [dropRing, dropBeacon] = makeBeacon('#38f8b0');
    [pickRing, pickBeacon] = makeBeacon('#ffae38');

    // Pre-build pickup visual meshes (pooled, never created mid-round)
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
  const keys = new Keys();

  const K = gs.tweak('Feel', {
    walkSpeed: [4.8, 2.5, 8, 'walking speed (m/s)'],
    sprintSpeed: [7.0, 4, 11, 'sprinting speed (m/s)'],
    carTop: [22, 12, 34, 'top driving speed (m/s)'],
    carAccel: [22, 7, 24, 'driving acceleration (m/s^2)'],
    carTurn: [2.35, 1.2, 3.8, 'steering responsiveness'],
    carGrip: [7.4, 3, 12, 'lateral cornering grip'],
    daySpeed: [0.14, 0, 1, 'time-of-day speed (hours per real minute scale)'],
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

  let R, t, score, inCar, inBoat, carCtrl, boatCtrl, driveBy, activeCarMesh;
  let mover, leads, leadIdx, activeLead, otherLead;
  let phase, jobIdx, job, targetPos, pickupPos;
  let bannerText, bannerCol, bannerT, hitT, rideCooldown, engineSound, radioStarted;
  let lastDistrictName, skyTick, poseTick, lawTick, lawDt, gpsDt, lastCityCount = 0;
  let pendingRadioOn = 0, pendingGpsGoal = null, pendingGpsLabel = '', pendingGpsKind = 'target', pendingGpsDelay = 0, pendingPickupLaw = null;
  let gpsShown, hudSub, currentMood, wasIndoor, warmupCop = null, warmedCop = false;
  let lastScoreThreat = -1, lastScoreFinal = false;
  let lastCarLights = null, lastActiveCarMesh = null, lastActiveCarLit = null;
  let rideKey = false, coverKey = false, swapKey = false, gunKey = false, aimKey = false;
  let aimMode = false, fireHeld = false, lawWired = false, scoreStarted = false;
  let lastClockStr, lastClockMin, lookDragId = null, lookLastX = 0, lookLastY = 0;
  let lastDistHud = '', lastDistClock = '', lastDistText = '';
  let lastAmmoKind = '', lastAmmoClip = -1, lastAmmoPool = -1, lastAmmoText = '';

  const say = (txt, col = '#ffffff', dur = 3.2) => {
    bannerText = txt;
    bannerCol = col;
    bannerT = dur;
  };

  const applyMood = (distName, hour, force = false) => {
    let mood = 'golden hour';
    const night = hour >= 20.0 || hour < 5.5;
    const dusk = hour >= 18.4 && hour < 20.0;
    if (distName === 'Sawgrass Edge') mood = 'fog';
    else if (night) mood = 'night rain';
    else if (dusk) mood = 'rainy dusk';
    else if (distName === 'Pelican Marina') mood = 'overcast';
    if (!force && mood === currentMood) return;
    currentMood = mood;
    v.look(mood, MOOD_OPTS[mood]);
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

  const updateWieldModels = () => {
    for (const lead of leads) {
      const showWeapon = !lead.inVehicle && !(lead === activeLead && aimMode);
      for (const [k, w] of Object.entries(lead.wields)) {
        w.visible = showWeapon && lead.loadout.kind === k;
      }
      lead.body.visible = !(lead === activeLead && aimMode && camRig.mode === 'first');
    }
    if (gunRig && activeLead) {
      const k = activeLead.loadout.kind;
      if (fpWeapons[k] && gunRig.model !== fpWeapons[k] && ARSENAL[k]?.gun) {
        gunRig.hold(fpWeapons[k], k);
      }
      gunRig.root.visible = !!aimMode && !inCar && !inBoat && !!ARSENAL[k]?.gun;
    }
  };

  const setAimMode = (on) => {
    if (inCar || inBoat) on = false;
    aimMode = !!on;
    if (aimMode) {
      const hasGun = !!ARSENAL[activeLead.loadout.kind]?.gun;
      if (!hasGun) activeLead.loadout.use('pistol');
      camRig.to(hasGun ? 'first' : 'shoulder', 0.16);
      gunRig.aiming = true;
    } else {
      gunRig.aiming = false;
      v.aiming = 0;
      camRig.to('chase', 0.2);
    }
    updateWieldModels();
  };

  const assignJob = (idx) => {
    jobIdx = idx % JOBS.length;
    job = JOBS[jobIdx];
    const startRef = inCar && carCtrl ? { x: carCtrl.x, z: carCtrl.y } : activeLead.foot;

    if (job.kind === 'vehicle') {
      if (inCar) {
        phase = 'deliver';
        targetPos = placeAtDistrict(job.toDistrict, startRef, 90, 260);
        pickupPos = null;
        if (activeCarMesh !== hotCoupe) hotCoupe.visible = false;
        gps.clear().add({ at: targetPos, kind: 'target', text: job.toDistrict, pinned: true });
        gps.to(targetPos);
        hudSub = `Deliver ride to ${job.toDistrict}`;
      } else {
        phase = 'pickup';
        pickupPos = placeAtDistrict(job.fromDistrict, startRef, 22, 85);
        targetPos = placeAtDistrict(job.toDistrict, pickupPos, 90, 260);
        hotCoupe.position.set(pickupPos.x, metro.ground(pickupPos.x, pickupPos.z), pickupPos.z);
        hotCoupe.rotation.set(0, (pickupPos.heading || 0) + Math.PI, 0);
        hotCoupe.visible = true;
        gps.clear().add({ at: pickupPos, kind: 'job', text: 'Hot Ride', pinned: true });
        gps.to(pickupPos);
        hudSub = `Board a ride on ${job.fromDistrict}`;
      }
    } else if (job.kind === 'interior') {
      phase = 'interior';
      pickupPos = null;
      targetPos = placeAtDistrict('Old Naranja', startRef, 35, 130, 'door');
      gps.clear().add({ at: targetPos, kind: 'target', text: 'Shop Door', pinned: true });
      gps.to(targetPos);
      hudSub = 'Walk inside Old Naranja shop';
    } else if (job.kind === 'boat') {
      phase = inBoat ? 'deliver_boat' : 'board_boat';
      pickupPos = { x: DOCK_POS.x, y: DOCK_POS.y, z: DOCK_POS.z, heading: 0 };
      targetPos = { x: YARD_X, y: YARD_Y, z: YARD_Z, heading: 0 };
      const navPt = phase === 'board_boat' ? pickupPos : targetPos;
      gps.clear().add({ at: navPt, kind: 'target', text: phase === 'board_boat' ? 'Marina Boat' : 'Port Yard', pinned: true });
      gps.to(navPt);
      hudSub = phase === 'board_boat' ? 'Board boat at Pelican Marina slip' : 'Pilot bay & report to Port Yard';
    } else {
      phase = 'deliver';
      pickupPos = null;
      targetPos = placeAtDistrict(job.toDistrict, startRef, 70, 200);
      gps.clear().add({ at: targetPos, kind: 'target', text: job.toDistrict, pinned: true });
      gps.to(targetPos);
      if (law.stars < job.heat) law.set(job.heat);
      hudSub = `Hold ${job.toDistrict} vs ${job.heat}★ SBPD`;
    }
    say(job.call, '#ffd166', 4.0);
  };

  const seatLeadInCar = (vehMesh, cx, cz, heading) => {
    if (activeCarMesh && activeCarMesh !== barracuda && activeCarMesh !== hotCoupe && activeCarMesh !== vehMesh) {
      activeCarMesh.visible = false;
    }
    setAimMode(false);
    hide.leave();
    activeCarMesh = vehMesh;
    activeCarMesh.visible = true;
    activeCarMesh.position.set(cx, metro.ground(cx, cz), cz);
    activeCarMesh.rotation.set(0, heading + Math.PI, 0);
    activeCarMesh.putIn?.(activeLead.body, 'driver');
    activeLead.inVehicle = true;
    inCar = true;
    inBoat = false;
    mover.mesh = null;
    mover.gravity = 0;
    mover.walk(0, 0);
    mover.setActive(false);
    mover.place(cx, -120, cz);

    carCtrl = new Car({
      x: cx,
      y: cz,
      angle: Math.PI / 2 - heading,
      top: K.carTop,
      accel: K.carAccel,
      brakes: 34,
      turn: K.carTurn,
      roll: 0.35,
      grip: K.carGrip,
      reverse: 0.38,
    });
    driveBy = new DriveBy(activeCarMesh, { seat: 'driver' });
    camRig.to('chase', 0.25, { distance: 9.2, height: 4.2, look: 1.2, walls: false });

    if (!radioStarted) {
      pendingRadioOn = 2;
    }
    radio.listen({ inside: true });
    updateWieldModels();

    if (phase === 'pickup') {
      phase = 'deliver';
      score = Math.min(100, score + 15);
      api.score(score);
      feel.coin(W * 0.5, H * 0.35, { color: '#ffcf5c', text: '+15 REP' });
      pendingPickupLaw = { x: cx, z: cz, heat: job.heat };
      pendingGpsGoal = targetPos;
      pendingGpsLabel = job.toDistrict;
      pendingGpsKind = 'target';
      pendingGpsDelay = 3;
      hudSub = `Deliver to ${job.toDistrict}`;
      say(`Hot ride boosted! Run to ${job.toDistrict}`, '#68f8c4', 3.5);
      if (score >= 100) {
        scoreMusic?.sting('win');
        api.win();
      }
    }
  };

  const boardBoat = () => {
    setAimMode(false);
    hide.leave();
    if (inCar && activeCarMesh) activeCarMesh.takeOut?.(activeLead.body);
    inCar = false;
    inBoat = true;
    activeLead.inVehicle = true;
    mover.mesh = null;
    mover.gravity = 0;
    mover.walk(0, 0);
    mover.setActive(false);
    mover.place(boatCtrl.x, -120, boatCtrl.z);
    boatMesh.putIn?.(activeLead.body, 'helm', { from: swim.state !== 'out' ? 'water' : undefined });
    driveBy = new DriveBy(boatMesh, { seat: 'helm', open: true });
    camRig.to('chase', 0.25, { distance: 10.5, height: 4.5, look: 1.3, walls: false });
    updateWieldModels();

    if (phase === 'board_boat') {
      phase = 'deliver_boat';
      if (law.stars < 2) law.set(2);
      gps.clear().add({ at: targetPos, kind: 'target', text: 'Port Yard', pinned: true });
      gps.to(targetPos);
      hudSub = 'Dodge SBPD launches & dock at Port Yard';
      say('Flamingo 24 underway! Clear the bay to Pelican Port Yard!', '#68f8c4', 3.6);
    }
  };

  const stepOut = () => {
    if (inBoat && boatCtrl) {
      boatMesh.takeOut?.(activeLead.body);
      const sideX = Math.cos(boatCtrl.heading) * 2.2;
      const sideZ = Math.sin(boatCtrl.heading) * 2.2;
      const f = activeLead.foot;
      f.x = boatCtrl.x + sideX;
      f.z = boatCtrl.z + sideZ;
      f.y = Math.max(0, metro.ground(f.x, f.z));
      f.heading = boatCtrl.heading + Math.PI;
      f.v = 0;
      inBoat = false;
      activeLead.inVehicle = false;
      mover.mesh = activeLead.body;
      mover.gravity = -20;
      mover.setActive(true);
      mover.place(f.x, f.y + 0.1, f.z);
      camRig.to('chase', 0.25, { distance: 5.8, height: 2.3, look: 1.35, walls: world });
      updateWieldModels();
      say('Stepped off Flamingo 24', '#d8e6ff', 2.0);
      return;
    }
    if (!inCar || !activeCarMesh) return;
    activeCarMesh.takeOut?.(activeLead.body);
    const sideX = Math.cos(carCtrl.angle + Math.PI / 2) * 1.65;
    const sideZ = Math.sin(carCtrl.angle + Math.PI / 2) * 1.65;
    const f = activeLead.foot;
    f.x = carCtrl.x + sideX;
    f.z = carCtrl.y + sideZ;
    f.y = metro.ground(f.x, f.z);
    f.heading = Math.PI / 2 - carCtrl.angle;
    f.v = 0;
    metro.collide(f, 0.45, f.y);
    inCar = false;
    activeLead.inVehicle = false;
    mover.mesh = activeLead.body;
    mover.gravity = -20;
    mover.setActive(true);
    mover.place(f.x, f.y + 0.05, f.z);
    activeLead.body.position.set(f.x, f.y, f.z);
    activeLead.body.rotation.set(0, f.heading, 0);
    activeLead.body.rig.blend(BLEND_OPTS, 0);
    rigUpdOpts.speed = 0;
    activeLead.body.rig.update(0, rigUpdOpts);
    radio.listen({ inside: false });
    if (!radio.now.on) scoreMusic?.resume();
    if (engineSound) engineSound.set({ vol: 0 }, 0.08);
    camRig.to('chase', 0.25, { distance: 5.8, height: 2.3, look: 1.35, walls: world });
    updateWieldModels();
  };

  const tryBoardOrExit = () => {
    if (rideCooldown > 0) return;
    rideCooldown = 0.35;
    if (inCar || inBoat) {
      stepOut();
      return;
    }
    const p = { x: activeLead.foot.x, z: activeLead.foot.z };
    // Check boat first
    if (boatCtrl && Math.hypot(boatCtrl.x - p.x, boatCtrl.z - p.z) < 6.0) {
      boardBoat();
      return;
    }
    // Check Barracuda or hotCoupe
    if (Math.hypot(barracuda.position.x - p.x, barracuda.position.z - p.z) < 4.5) {
      const h = Math.atan2(-Math.sin(barracuda.rotation.y), -Math.cos(barracuda.rotation.y));
      seatLeadInCar(barracuda, barracuda.position.x, barracuda.position.z, h);
      return;
    }
    if (hotCoupe.visible && Math.hypot(hotCoupe.position.x - p.x, hotCoupe.position.z - p.z) < 5.5) {
      const h = Math.atan2(-Math.sin(hotCoupe.rotation.y), -Math.cos(hotCoupe.rotation.y));
      seatLeadInCar(hotCoupe, hotCoupe.position.x, hotCoupe.position.z, h);
      return;
    }
    // Check traffic / police cruiser via Metro.cars.take()
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
    say('Move closer to a car or boat to board', '#ffd166', 1.8);
  };

  const swapLead = () => {
    if (inCar || inBoat) stepOut();
    setAimMode(false);
    hide.leave();
    // Save active lead position
    activeLead.foot.x = mover.feet.x;
    activeLead.foot.y = mover.feet.y;
    activeLead.foot.z = mover.feet.z;
    leadIdx = 1 - leadIdx;
    activeLead = leads[leadIdx];
    otherLead = leads[1 - leadIdx];

    mover.mesh = activeLead.body;
    mover.setActive(true);
    mover.place(activeLead.foot.x, activeLead.foot.y + 0.05, activeLead.foot.z);
    const jumpDist = Math.hypot(activeLead.foot.x - otherLead.foot.x, activeLead.foot.z - otherLead.foot.z);
    if (jumpDist > 260 || !metro.districtAt(activeLead.foot.x, activeLead.foot.z, 40)) {
      metro.switchTo(activeLead.foot, { reset: true });
    }
    v.cut?.();
    camRig.yaw = 0;
    camRig.pitch = 0;
    v.health = activeLead.health.frac;
    updateWieldModels();
    say(`Swapped to ${activeLead.name} (${activeLead.loadout.kind.toUpperCase()})`, '#7ee8ff', 2.4);
  };

  const fireShot = () => {
    const ld = activeLead.loadout;
    if (ld.gun && ld.gun.ammo <= 0 && !ld.gun.reloading) {
      ld.reload({ at: aimOrigin });
      return;
    }
    // Determine aim direction from camera or lead heading
    v.cam.getWorldDirection(camDirVec);
    let shots = [];
    if ((inCar || inBoat) && driveBy && ld.gun) {
      aimDirObj.x = camDirVec.x;
      aimDirObj.y = camDirVec.y;
      aimDirObj.z = camDirVec.z;
      driveBy.aim(aimDirObj);
      shots = driveBy.fire(ld.gun, true);
      if (shots.length) {
        weaponSound(ld.kind, 'fire', driveBy.from);
        if (driveBy.glass && activeCarMesh?.hit) activeCarMesh.hit(driveBy.glass, { power: 0.2 });
      }
    } else if (hide.busy && hide.muzzle && ld.gun) {
      aimOrigin.x = hide.muzzle.x;
      aimOrigin.y = hide.muzzle.y;
      aimOrigin.z = hide.muzzle.z;
      aimDirObj.x = camDirVec.x;
      aimDirObj.y = camDirVec.y;
      aimDirObj.z = camDirVec.z;
      shots = ld.fire(aimOrigin, aimDirObj, true, { at: aimOrigin });
    } else if (ARSENAL[ld.kind]?.gun) {
      const eyeY = activeLead.foot.y + 1.55;
      aimOrigin.x = activeLead.foot.x + Math.sin(activeLead.foot.heading) * 0.45;
      aimOrigin.y = eyeY;
      aimOrigin.z = activeLead.foot.z + Math.cos(activeLead.foot.heading) * 0.45;
      if (aimMode) {
        aimDirObj.x = camDirVec.x;
        aimDirObj.y = camDirVec.y;
        aimDirObj.z = camDirVec.z;
      } else {
        aimDirObj.x = Math.sin(activeLead.foot.heading);
        aimDirObj.y = -0.02;
        aimDirObj.z = Math.cos(activeLead.foot.heading);
      }
      shots = ld.fire(aimOrigin, aimDirObj, true, { at: aimOrigin });
    }

    if (!shots.length) return;
    law.crime('shot', playerQuery);
    if (law.stars < 1) law.set(1);
    camRig.shake(aimMode ? 0.12 : 0.08);
    v.flash?.(shots[0].from.x, shots[0].from.y, shots[0].from.z, { col: '#ffbe68', i: 22, reach: 6, life: 0.08 });

    for (const s of shots) {
      const range = ld.gun?.range || 60;
      const lawHit = law.shoot(s.from, s.dir, { damage: s.damage });
      if (lawHit) {
        feel.hit?.(W * 0.5, H * 0.45, { power: 0.45 });
        continue;
      }
      const wHit = world.ray(s.from, s.dir, range, c => c !== mover.rider && c !== mover);
      if (wHit && wHit.point) {
        const hitMesh = decalTargetMeshes.find(m => m === wHit.mesh) || yardGround?.mesh;
        if (wHit.mesh === hitMesh && wHit.normal) {
          v.decal(wHit.mesh, wHit.point, wHit.normal, mark('bullet', { max: 24 }));
        }
      }
    }
  };

  // Interactive HUD hitboxes (computed dynamically to clear api.scoreArea() and minimap)
  const rdRect = { x: 10, y: H - 46, w: 170, h: 36 };
  const mrRect = { x: W - 90, y: 10, w: 80, h: 80 };
  const swapRect = { x: 8, y: 80, w: 72, h: 22 };
  const gunRect = { x: 84, y: 80, w: 96, h: 22 };
  const covRect = { x: 8, y: 106, w: 74, h: 22 };
  const hudLayout = { mr: mrRect, maxHudW: 160, topY: 8 };

  const layoutTopHud = () => {
    const s = Math.min(80, W * 0.25);
    mrRect.x = W - s - 10;
    mrRect.y = 10;
    mrRect.w = s;
    mrRect.h = s;
    const maxW = Math.max(132, Math.min(188, mrRect.x - 16));
    const sa = api.scoreArea ? api.scoreArea() : null;
    const topY = sa && 8 + maxW > sa.x - 2 ? Math.round(sa.bottom + 4) : 8;
    swapRect.x = 8;
    swapRect.y = topY + 70;
    swapRect.w = Math.min(76, Math.floor((maxW - 4) * 0.45));
    gunRect.x = swapRect.x + swapRect.w + 4;
    gunRect.y = topY + 70;
    gunRect.w = Math.max(70, maxW - swapRect.w - 4);
    covRect.x = 8;
    covRect.y = topY + 96;
    hudLayout.maxHudW = maxW;
    hudLayout.topY = topY;
    return hudLayout;
  };

  const radioRect = () => {
    rdRect.x = 10;
    rdRect.y = H - 46;
    rdRect.w = Math.min(180, W * 0.54);
    rdRect.h = 36;
    return rdRect;
  };
  const miniRect = () => {
    const s = Math.min(80, W * 0.25);
    mrRect.x = W - s - 10;
    mrRect.y = 10;
    mrRect.w = s;
    mrRect.h = s;
    return mrRect;
  };
  const hitBox = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  const cycleRadio = () => {
    if (!radio.power) {
      radioStarted = true;
      radio.on();
      scoreMusic?.pause();
    } else if (radio.now.index === radio.stations.length - 1) {
      radio.off();
      if (!radio.power) scoreMusic?.resume();
    } else {
      radioStarted = true;
      radio.next();
    }
    sounds.click();
  };

  const resetPickups = () => {
    pickups.clear();
    const spots = [
      { x: YARD_X - 8, y: YARD_Y + 0.35, z: YARD_Z - 4, kind: 'rifle', respawn: 35 },
      { x: YARD_X + 6, y: YARD_Y + 0.35, z: YARD_Z + 5, kind: 'health', amount: 40, respawn: 25 },
      { x: BEACH_LOT.x - 4, y: BEACH_LOT.y + 0.35, z: BEACH_LOT.z + 2, kind: 'ammo', of: 'pistol', amount: 36, respawn: 20 },
      { x: DOCK_POS.x - 6, y: DOCK_POS.y + 0.35, z: DOCK_POS.z + 4, kind: 'shotgun', respawn: 35 },
      { x: 90, y: 0.35, z: -580, kind: 'health', amount: 45, respawn: 25 },
    ];
    spots.forEach((s, idx) => {
      const p = pickups.add(s);
      p.meshIdx = idx;
    });
  };

  return {
    reset() {
      if (!worldReady) setupWorld(api);
      R = rng(409);
      t = 0;
      score = 0;
      api.score(0);
      hitT = 0;
      rideCooldown = 0;
      aimMode = false;
      fireHeld = false;
      rideKey = coverKey = swapKey = gunKey = aimKey = false;
      bannerText = '';
      bannerCol = '#ffffff';
      bannerT = 0;
      radioStarted = false;
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
      wasIndoor = false;
      gpsShown = false;
      currentMood = null;
      lastClockStr = '17:33';
      lastClockMin = -1;
      lastDistHud = '';
      lastAmmoKind = '';
      lastDistrictName = 'Coral Strip';
      hudSub = 'Board Barracuda or boost hot ride';
      if (yardPropsGroup) yardPropsGroup.visible = true;
      if (yardGround?.mesh) yardGround.mesh.visible = true;

      if (!engineSound) {
        engineSound = bed({ vol: 0, from: 110, filter: 'lowpass', q: 4 });
        try { noise(0.01, { vol: 0 }); } catch {}
      } else {
        engineSound.set({ vol: 0 }, 0.02);
      }

      const makoSpot = placeAtDistrict('Coral Strip');
      const mh = makoSpot.heading || 0;
      const nx = makoSpot.x + Math.sin(mh) * 4.5 - Math.cos(mh) * 2.0;
      const nz = makoSpot.z + Math.cos(mh) * 4.5 + Math.sin(mh) * 2.0;
      const nadiaSpot = { x: nx, y: metro.ground(nx, nz), z: nz, heading: mh + Math.PI };
      metro.collide(nadiaSpot, 0.45, nadiaSpot.y);

      const mkPouch = new Pouch({ pistol: 60, rifle: 60, shells: 16 });
      const ndPouch = new Pouch({ pistol: 84, rifle: 60, shells: 12 });
      const mkHp = new Health({ max: 100, regen: 2.5, delay: 6 });
      const ndHp = new Health({ max: 100, regen: 2.5, delay: 6 });
      const mkArms = new Loadout({ pouch: mkPouch, health: mkHp });
      mkArms.give('baton');
      mkArms.give('pistol', { use: true });
      const ndArms = new Loadout({ pouch: ndPouch, health: ndHp });
      ndArms.give('pistol');
      ndArms.give('smg', { use: true });

      leads = [
        {
          name: 'Mako',
          body: mako,
          wields: wpWieldMako,
          pouch: mkPouch,
          health: mkHp,
          loadout: mkArms,
          foot: { x: makoSpot.x, y: makoSpot.y, z: makoSpot.z, heading: makoSpot.heading, v: 0 },
          inVehicle: false,
        },
        {
          name: 'Nadia',
          body: nadia,
          wields: wpWieldNadia,
          pouch: ndPouch,
          health: ndHp,
          loadout: ndArms,
          foot: { x: nadiaSpot.x, y: nadiaSpot.y, z: nadiaSpot.z, heading: nadiaSpot.heading, v: 0 },
          inVehicle: false,
        },
      ];
      leadIdx = 0;
      activeLead = leads[0];
      otherLead = leads[1];

      metro.prepare(activeLead.foot).reset(activeLead.foot);
      for (const c of metro.cities) if (c.people) c.people.fullMax = 0;
      lastCityCount = metro.cities.length;
      law.reset();
      hide.reset();
      swim.reset();
      if (inside?.regions) {
        inside.regions.want([]);
        inside.regions.trim(0);
        inside.room = null;
      }
      resetPickups();

      if (!mover) mover = makeRiderMover(world, mako, { radius: 0.38, height: 1.8 });
      mover.mesh = mako;
      mover.gravity = -20;
      mover.walk(0, 0);
      mover.setActive(true);
      mover.place(activeLead.foot.x, activeLead.foot.y + 0.05, activeLead.foot.z);

      if (boatCtrl?.rider) boatCtrl.rider.remove();
      boatCtrl = new Boat(metro.water, { at: SLIP_POS, heading: SLIP_POS.heading, world, vehicle: boatMesh, power: 11, top: 20 });

      sky.time = 17.55;
      sky.speed = K.daySpeed;
      sky.update(0);
      applyMood('Coral Strip', sky.time, true);

      activeCarMesh?.takeOut?.(mako);
      activeCarMesh?.takeOut?.(nadia);
      boatMesh?.takeOut?.(mako);
      boatMesh?.takeOut?.(nadia);
      activeCarMesh = null;
      driveBy = null;
      inCar = false;
      inBoat = false;

      mako.lod = warmedCop ? 1 : 0;
      nadia.lod = 1;
      mako.position.set(activeLead.foot.x, activeLead.foot.y, activeLead.foot.z);
      mako.rotation.set(0, activeLead.foot.heading, 0);
      mako.rig.blend(BLEND_OPTS, 0);
      rigUpdOpts.speed = 0;
      mako.rig.update(0, rigUpdOpts);
      if (!warmedCop) {
        nadia.position.set(
          activeLead.foot.x + Math.sin(activeLead.foot.heading) * 1.9 - Math.cos(activeLead.foot.heading) * 0.6,
          activeLead.foot.y,
          activeLead.foot.z + Math.cos(activeLead.foot.heading) * 1.9 + Math.sin(activeLead.foot.heading) * 0.6
        );
      } else {
        nadia.position.set(otherLead.foot.x, otherLead.foot.y, otherLead.foot.z);
      }
      nadia.rotation.set(0, otherLead.foot.heading, 0);
      nadia.rig.blend(BLEND_OPTS, 0);
      nadia.rig.update(0, rigUpdOpts);
      if (!warmedCop && warmupCop) {
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

      playerQuery.x = activeLead.foot.x;
      playerQuery.y = activeLead.foot.y;
      playerQuery.z = activeLead.foot.z;
      playerQuery.heading = activeLead.foot.heading;
      playerQuery.v = 0;
      playerQuery.car = false;
      playerQuery.boat = false;
      playerQuery.swim = false;

      const bx = activeLead.foot.x + Math.sin(activeLead.foot.heading) * 2.6 + Math.cos(activeLead.foot.heading) * 2.1;
      const bz = activeLead.foot.z + Math.cos(activeLead.foot.heading) * 2.6 - Math.sin(activeLead.foot.heading) * 2.1;
      barracuda.position.set(bx, metro.ground(bx, bz), bz);
      barracuda.rotation.set(0, activeLead.foot.heading + Math.PI, 0);
      const initLit = !warmedCop || sky.night > 0.2;
      barracuda.lights?.(initLit);
      hotCoupe.lights?.(initLit);
      lastCarLights = initLit;
      barracuda.visible = true;

      v.health = 1;
      v.aiming = 0;
      camRig.yaw = 0;
      camRig.pitch = 0;
      camRig.to('chase', 0.01, { distance: 5.8, height: 2.3, look: 1.35, walls: world });
      rigTarget.position.set(activeLead.foot.x, activeLead.foot.y, activeLead.foot.z);
      rigTarget.yaw = activeLead.foot.heading;
      camRig.update(0.016, rigTarget);
      v.cut?.();

      updateWieldModels();

      assignJob(0);
      if (!warmedCop) {
        const hx = activeLead.foot.x + Math.sin(activeLead.foot.heading) * 3.8 - Math.cos(activeLead.foot.heading) * 2.2;
        const hz = activeLead.foot.z + Math.cos(activeLead.foot.heading) * 3.8 + Math.sin(activeLead.foot.heading) * 2.2;
        hotCoupe.position.set(hx, metro.ground(hx, hz), hz);
        hotCoupe.rotation.set(0, activeLead.foot.heading + Math.PI, 0);
        hotCoupe.visible = true;
      }
      gps.update(0, activeLead.foot);
      if (!gpsShown) {
        gps.show(v);
        gpsShown = true;
      }

      if (!lawWired) {
        lawWired = true;
        law.on('escaped', () => {
          score = Math.min(100, score + K.escapeRep);
          api.score(score);
          scoreMusic?.hit(0.75);
          feel.coin(W * 0.5, H * 0.3, { color: '#78ff98', text: `+${K.escapeRep} ESCAPE` });
          say(`SBPD Shaken! +${K.escapeRep} Rep`, '#78ff98', 3.0);
          if (score >= 100) {
            scoreMusic?.sting('win');
            api.win();
          }
        });
        law.on('busted', () => {
          scoreMusic?.sting('lose');
          feel.lose();
          api.over();
        });
        law.on('shot', s => {
          if (!s.hit || !activeLead) return;
          const mult = hide.busy ? hide.exposed : 1;
          const lost = activeLead.health.hurt(s.damage * mult, { from: s.from, at: activeLead.foot, facing: activeLead.foot.heading });
          if (lost > 0) {
            v.hit?.(lost);
            v.health = activeLead.health.frac;
            camRig.shake(0.28);
            feel.hit?.(W * 0.5, H * 0.5, { power: 0.4 });
            if (activeLead.health.dead) {
              scoreMusic?.sting('lose');
              feel.lose();
              api.over();
            }
          }
        });
        law.on('officer down', () => {
          score = Math.min(100, score + 6);
          api.score(score);
          scoreMusic?.hit(0.95);
          feel.coin(W * 0.5, H * 0.38, { color: '#ff9f43', text: '+6 KO' });
          if (score >= 100) {
            scoreMusic?.sting('win');
            api.win();
          }
        });
        law.on('boat down', () => {
          score = Math.min(100, score + 12);
          api.score(score);
          scoreMusic?.hit(1.0);
          feel.coin(W * 0.5, H * 0.38, { color: '#ff9f43', text: '+12 BOAT' });
          if (score >= 100) {
            scoreMusic?.sting('win');
            api.win();
          }
        });
        law.on('heli down', () => {
          score = Math.min(100, score + 18);
          api.score(score);
          scoreMusic?.hit(1.0);
          feel.coin(W * 0.5, H * 0.38, { color: '#ff9f43', text: '+18 HELI' });
          if (score >= 100) {
            scoreMusic?.sting('win');
            api.win();
          }
        });
      }

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
      if (!warmedCop && t > 0.04) {
        warmedCop = true;
        warmupCop?.removeFromParent();
        warmupCop = null;
        mako.visible = false;
        mako.lod = 1;
        mako.visible = true;
        nadia.position.set(otherLead.foot.x, otherLead.foot.y, otherLead.foot.z);
        const nl = sky.night > 0.2;
        if (lastCarLights !== nl) {
          lastCarLights = nl;
          barracuda.lights?.(nl);
          hotCoupe.lights?.(nl);
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

      if (!scoreStarted && !radio.now.on) {
        scoreStarted = true;
        scoreMusic?.start();
      }

      // Dynamic Sky & Weather + v.look mood switching (staggered across disjoint phases mod 8)
      sky.speed = K.daySpeed;
      const st = skyTick++ & 7;
      if (st === 0) {
        sky.update(sdt * 8);
        if (warmedCop) {
          const nl = sky.night > 0.2;
          if (lastCarLights !== nl) {
            lastCarLights = nl;
            barracuda.lights?.(nl);
            hotCoupe.lights?.(nl);
          }
        }
        applyMood(lastDistrictName, sky.time);
      } else if (st === 4) {
        weather?.update(sdt * 8);
      }

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
        radio.on();
        scoreMusic?.pause();
      }
      if (pendingGpsGoal && --pendingGpsDelay <= 0) {
        gps.clear().add({ at: pendingGpsGoal, kind: pendingGpsKind, text: pendingGpsLabel, pinned: true });
        gps.to(pendingGpsGoal);
        pendingGpsGoal = null;
      }

      if ((radioStarted || radio.power) && st === 2) radio.update(sdt * 8);

      const k = keys.axis();
      const sx = pad.left.active ? pad.left.x : k.x;
      const sy = pad.left.active ? pad.left.y : k.y;
      const actRide = pad.buttons.RIDE.pressed() || rideKey;
      const actAimTap = pad.buttons.AIM.pressed() || aimKey;
      const actFire = pad.buttons.FIRE.isDown || fireHeld || keys.held('f') || keys.held('Enter');
      const actBrake = pad.buttons.AIM.isDown || keys.held(' ') || keys.held('Shift');
      rideKey = aimKey = false;

      if (coverKey) {
        coverKey = false;
        if (!inCar && !inBoat) {
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
        activeLead.loadout.next();
        updateWieldModels();
      }

      if (actRide) tryBoardOrExit();
      if (actAimTap && !inCar && !inBoat) setAimMode(!aimMode);

      activeLead.health.update(sdt);
      activeLead.loadout.update(sdt);
      v.health = activeLead.health.frac;

      if (inBoat && boatCtrl) {
        boatInput.throttle = (pad.left.active || k.x || k.y) ? clamp(-sy * 1.3 + (pad.left.active ? 0.35 : 0), -1, 1) : 0;
        boatInput.steer = sx;
        boatCtrl.update(sdt, boatInput);
        driveBy?.update(sdt);
        engOpts.from = 95 + boatCtrl.speed * 14;
        engOpts.vol = 0.012 + Math.min(1, boatCtrl.speed / 16) * 0.02;
        engineSound?.set(engOpts, 0.1);

        playerQuery.x = boatCtrl.x;
        playerQuery.z = boatCtrl.z;
        playerQuery.y = boatCtrl.y;
        playerQuery.heading = boatCtrl.heading + Math.PI;
        playerQuery.v = boatCtrl.speed;
        playerQuery.car = false;
        playerQuery.boat = true;
        playerQuery.swim = false;

        rigTarget.position.set(boatCtrl.x, boatCtrl.y + 0.6, boatCtrl.z);
        rigTarget.yaw = boatCtrl.heading + Math.PI;
        rigTarget.grounded = true;
      } else if (inCar && carCtrl && activeCarMesh) {
        carInput.throttle = (pad.left.active || k.x || k.y) ? clamp(-sy * 1.4 + (pad.left.active ? 0.3 : 0), -1, 1) : 0;
        carInput.steer = sx;
        carInput.brake = actBrake;
        carCtrl.top = K.carTop;
        carCtrl.accel = K.carAccel;
        carCtrl.turn = K.carTurn;
        carCtrl.grip = K.carGrip;
        carCtrl.update(sdt, carInput);
        driveBy?.update(sdt);
        engOpts.from = 110 + Math.abs(carCtrl.speed) * 16;
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
            feel.hit?.(W * 0.5, H * 0.5, { power: 0.5 });
          }
          carCtrl.bump(nx / len, nz / len, BUMP_OPTS);
        }

        if (hitT <= 0) {
          const hitCar = metro.cars.hit(playerQuery, 1.15);
          if (hitCar) {
            hitT = 0.8;
            metro.cars.bump(hitCar);
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

        activeCarMesh.position.set(carCtrl.x, gy, carCtrl.y);
        activeCarMesh.rotation.set(0, Math.PI / 2 - carCtrl.angle + Math.PI, 0);
        activeCarMesh.roll?.(carCtrl.speed * sdt);
        activeCarMesh.steer?.(sx * 0.45);
        const nl = sky.night > 0.2;
        if (activeCarMesh === barracuda || activeCarMesh === hotCoupe) {
          if (lastCarLights !== nl) {
            lastCarLights = nl;
            barracuda.lights?.(nl);
            hotCoupe.lights?.(nl);
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
        // On foot / swimming / in cover via Rapier Mover + Swimmer + Cover3D
        const f = activeLead.foot;
        const mag = Math.hypot(sx, sy);
        const sprinting = !aimMode && (keys.held('Shift') || mag > 0.92);
        const topWalk = sprinting ? K.sprintSpeed : K.walkSpeed;
        const camYaw = camRig.targetYaw + camRig.yaw;

        if (mag > 0.1) {
          const moveYaw = aimMode ? camYaw + Math.atan2(-sx, -sy) : Math.atan2(-sx * Math.cos(camYaw) - sy * Math.sin(camYaw), -sy * Math.cos(camYaw) + sx * Math.sin(camYaw));
          const sp = topWalk * clamp(mag, 0, 1);
          coverMoveVec.x = Math.sin(moveYaw) * clamp(mag, 0, 1);
          coverMoveVec.z = Math.cos(moveYaw) * clamp(mag, 0, 1);
          if (!hide.busy) {
            mover.walk(Math.sin(moveYaw) * sp, Math.cos(moveYaw) * sp);
            if (!aimMode) f.heading = moveYaw;
            f.v = sp;
          }
        } else {
          coverMoveVec.x = coverMoveVec.z = 0;
          if (!hide.busy) mover.walk(0, 0);
          f.v = 0;
        }

        if (aimMode) f.heading = camYaw;

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
              scoreMusic?.sting('lose');
              feel.lose();
              api.over();
              return;
            }
          }
          if (swim.facing != null && swim.state !== 'out' && !aimMode) f.heading = swim.facing;
        }

        if ((aimMode || hide.busy) && st === 7) {
          cover.update(mover.feet, COVER_UPD_OPTS);
        }
        if (gunRig) {
          gunRig.aiming = aimMode;
          gunRig.sprinting = sprinting;
        }
        rigTarget.grounded = mover.grounded;
      }

      // Step Rider mover, Rapier 3D world & boat riders (skip Rapier step while driving kinematic Car; run on phase 1 when walking)
      if (!inCar && !inBoat) mover.stepMove(sdt);
      if (inBoat) world.step(sdt);
      else if (!inCar && st === 1) world.step(0.016);

      if (!inCar && !inBoat) {
        const f = activeLead.foot;
        const mp = mover.feet;
        // Safety clamp in case a streaming district mesh lags behind mover
        if (mp.y < -4.5) {
          const safeY = metro.ground(mp.x, mp.z);
          mover.place(mp.x, safeY + 0.1, mp.z);
          mp.y = safeY;
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
        const rigActive = f.v > 0.01 || aimMode || hide.busy || swim.state !== 'out';
        if (rigActive ? ((poseTick++ & 1) === 0) : st === 7) {
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
            activeLead.body.rig.upper?.(aimMode ? 'aim' : null);
            activeLead.body.rig.blend(BLEND_OPTS, f.v);
          }
          rigUpdOpts.speed = f.v;
          activeLead.body.rig.update(rigActive ? sdt * 2 : sdt * 8, rigUpdOpts);
        }

        if (f.v > 0.1) {
          avoidQuery.x = f.x;
          avoidQuery.z = f.z;
          avoidQuery.vx = Math.sin(f.heading) * f.v;
          avoidQuery.vz = Math.cos(f.heading) * f.v;
          metro.avoid(avoidQuery, 0.9);
        }

        rigTarget.position.set(f.x, f.y, f.z);
        rigTarget.yaw = aimMode ? camRig.targetYaw : f.heading;
      }

      // Update pickups & collect
      const got = pickups.collect(sdt, playerQuery, activeLead.loadout);
      if (got.length) {
        scoreMusic?.hit(0.6);
        sounds.coin(1.2);
        feel.coin(W * 0.5, H * 0.4, { color: '#78ff98', text: got[0].kind.toUpperCase() });
        updateWieldModels();
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

      // Update camera rig & first-person gun rig & acoustic Ears
      camRig.update(sdt, rigTarget);
      if (aimMode && !inCar && !inBoat) gunRig.update(sdt);

      if (actFire) fireShot();

      metro.update(sdt, playerQuery);
      if (metro.cities.length !== lastCityCount) {
        lastCityCount = metro.cities.length;
        for (const c of metro.cities) if (c.people && c.people.fullMax !== 0) c.people.fullMax = 0;
      }
      if (inside.room || wasIndoor || (!inCar && !inBoat && st === 3)) {
        inside.update((inside.room || wasIndoor) ? sdt : sdt * 8, playerQuery);
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

      // Update adaptive score intensity cleanly
      const threat = clamp(law.stars / 3 + (aimMode ? 0.15 : 0), 0, 1);
      if (Math.abs(threat - lastScoreThreat) >= 0.02) {
        lastScoreThreat = threat;
        scoreMusic?.intensity(threat, 0.8);
      }
      const isFinal = law.stars >= 3;
      if (isFinal !== lastScoreFinal) {
        lastScoreFinal = isFinal;
        scoreMusic?.final(isFinal);
      }

      const dist = metro.districtAt(playerQuery.x, playerQuery.z);
      lastDistrictName = dist ? dist.name : 'Solis Bay';

      // Mission progress checks
      if (phase === 'pickup' && pickupPos) {
        const dp = Math.hypot(pickupPos.x - playerQuery.x, pickupPos.z - playerQuery.z);
        if (inCar || dp < 4.2) {
          if (!inCar) seatLeadInCar(hotCoupe, pickupPos.x, pickupPos.z, pickupPos.heading || 0);
        }
      } else if (phase === 'interior') {
        if (inside.entered || inside.room) {
          score = Math.min(100, score + job.rep);
          api.score(score);
          scoreMusic?.hit(0.9);
          feel.coin(W * 0.5, H * 0.35, { color: '#68f8c4', text: `+${job.rep} REP` });
          if (law.stars < job.heat) law.set(job.heat);
          say(`Ledger secured indoors! +${job.rep} Rep`, '#68f8c4', 3.4);
          if (score >= 100) {
            scoreMusic?.sting('win');
            api.win();
            return;
          }
          assignJob(jobIdx + 1);
        }
      } else if (phase === 'board_boat') {
        if (inBoat) {
          phase = 'deliver_boat';
        }
      } else if ((phase === 'deliver' || phase === 'deliver_boat') && targetPos) {
        const dd = Math.hypot(targetPos.x - playerQuery.x, targetPos.z - playerQuery.z);
        const reachD = phase === 'deliver_boat' ? 28 : 7.0;
        if (dd < reachD && Math.abs(playerQuery.v) < 12) {
          const pts = job?.rep ?? K.dropRep;
          score = Math.min(100, score + pts);
          api.score(score);
          scoreMusic?.hit(0.9);
          feel.coin(W * 0.5, H * 0.35, { color: '#68f8c4', text: `+${pts} REP` });
          say(`${job.name} complete! +${pts} Rep`, '#68f8c4', 3.2);
          if (score >= 100) {
            scoreMusic?.sting('win');
            api.win();
            return;
          }
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

      const activeTarget = (phase === 'pickup' || phase === 'board_boat') && pickupPos ? pickupPos : targetPos;
      const nxt = gps.ahead(14, aheadPt) || activeTarget;
      if (nxt && !aimMode) {
        arrowMesh.visible = true;
        arrowMesh.position.set(playerQuery.x, playerQuery.y + (inCar || inBoat ? 2.55 : 2.35) + Math.sin(t * 4) * 0.06, playerQuery.z);
        arrowMesh.lookAt(nxt.x, arrowMesh.position.y, nxt.z);
        arrowMesh.rotateX(Math.PI / 2);
      } else {
        arrowMesh.visible = false;
      }

      // Distance-cull distant Pelican Port props & puddles and Coral Strip beach props after Play shader warmup
      const dxY = v.cam.position.x - YARD_X, dzY = v.cam.position.z - YARD_Z;
      const nearYard = t <= 0.25 || (dxY * dxY + dzY * dzY < 210 * 210);
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

      // Crosshair in ADS aim mode
      if (aimMode && !inCar && !inBoat) {
        c.save();
        c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        c.lineWidth = 1.5;
        const cx = W * 0.5, cy = H * 0.5;
        c.beginPath();
        c.moveTo(cx - 7, cy); c.lineTo(cx - 2, cy);
        c.moveTo(cx + 2, cy); c.lineTo(cx + 7, cy);
        c.moveTo(cx, cy - 7); c.lineTo(cx, cy - 2);
        c.moveTo(cx, cy + 2); c.lineTo(cx, cy + 7);
        c.stroke();
        c.restore();
      }

      // Top-left status pill + interactive quick-action pills (clear of score badge & minimap)
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

      c.save();
      c.fillStyle = 'rgba(10, 14, 24, 0.78)';
      c.beginPath();
      c.roundRect(8, topY, maxHudW, 66, 8);
      c.fill();

      c.font = '700 11px Rubik, sans-serif';
      c.textAlign = 'left';
      c.fillStyle = '#e8f4ff';
      c.fillText(fitText(c, 'dist', lastDistText, maxHudW - 14), 15, topY + 15);

      if (law.stars > 0) {
        let starsStr = '';
        for (let i = 0; i < 3; i++) starsStr += i < law.stars ? '★ ' : '☆ ';
        const statusStr = law.busting > 0.15 ? 'BUSTING!' : law.seen ? 'PURSUIT' : `EVADE ${Math.ceil(law.left)}s`;
        c.fillStyle = law.seen ? '#ff6b6b' : '#ffd166';
        c.fillText(fitText(c, 'stars', `${starsStr}${statusStr}`, maxHudW - 14), 15, topY + 30);
      } else {
        c.fillStyle = '#8ef5c8';
        const modeTxt = inBoat ? 'At Helm' : inCar ? 'Driving' : swim.state !== 'out' ? 'Swimming' : hide.busy ? 'In Cover' : 'On Foot';
        c.fillText(fitText(c, 'stars', `${activeLead.name} · ${modeTxt}`, maxHudW - 14), 15, topY + 30);
      }

      c.font = '500 10px Rubik, sans-serif';
      c.fillStyle = '#b9c9e4';
      c.fillText(fitText(c, 'sub', hudSub, maxHudW - 14), 15, topY + 44);

      // Health bar (+ underwater breath bar when diving)
      c.fillStyle = 'rgba(255,255,255,0.16)';
      c.fillRect(15, topY + 51, maxHudW - 22, 4);
      c.fillStyle = activeLead.health.frac > 0.4 ? '#38f8b0' : '#ff5e57';
      c.fillRect(15, topY + 51, (maxHudW - 22) * activeLead.health.frac, 4);
      if (swim.under) {
        c.fillStyle = '#48dbfb';
        c.fillRect(15, topY + 57, (maxHudW - 22) * swim.air, 3);
      }

      // SWAP Lead pill + WEAPON/Ammo pill
      c.fillStyle = 'rgba(10, 14, 24, 0.78)';
      c.beginPath(); c.roundRect(swapRect.x, swapRect.y, swapRect.w, swapRect.h, 6); c.fill();
      c.fillStyle = '#7ee8ff'; c.font = '700 10px Rubik, sans-serif';
      c.fillText(fitText(c, 'swap', `SWAP (${otherLead.name})`, swapRect.w - 10), swapRect.x + 6, swapRect.y + 14);

      const ld = activeLead.loadout;
      const ammoClip = ld.gun ? ld.gun.ammo : -1;
      const ammoPool = ld.gun ? ld.pouch.count(ARSENAL[ld.kind].ammo) : -1;
      if (ld.kind !== lastAmmoKind || ammoClip !== lastAmmoClip || ammoPool !== lastAmmoPool) {
        lastAmmoKind = ld.kind;
        lastAmmoClip = ammoClip;
        lastAmmoPool = ammoPool;
        lastAmmoText = ld.gun ? `${ld.kind.toUpperCase()} ${ammoClip}/${ammoPool}` : ld.kind.toUpperCase();
      }
      c.fillStyle = 'rgba(10, 14, 24, 0.78)';
      c.beginPath(); c.roundRect(gunRect.x, gunRect.y, gunRect.w, gunRect.h, 6); c.fill();
      c.fillStyle = '#ffd166';
      c.fillText(fitText(c, 'gun', lastAmmoText, gunRect.w - 10), gunRect.x + 6, gunRect.y + 14);

      if (!inCar && !inBoat) {
        c.fillStyle = hide.busy ? 'rgba(56, 248, 176, 0.25)' : 'rgba(10, 14, 24, 0.78)';
        c.beginPath(); c.roundRect(covRect.x, covRect.y, covRect.w, covRect.h, 6); c.fill();
        c.fillStyle = '#8ef5c8';
        c.fillText(hide.busy ? 'LEAVE COVER' : 'COVER [Q]', covRect.x + 6, covRect.y + 14);
      }
      c.restore();

      // Top-right minimap & turn instruction
      c.save();
      c.globalAlpha = 0.92;
      gps.mini(c, mr.x, mr.y, mr.w, mr.h, MINI_OPTS);
      c.globalAlpha = 1;
      const nx = gps.next;
      if (nx && nx.turn !== 'arrive' && nx.in < 160) {
        const ty = mr.y + mr.h + 15;
        const turnGlyph = nx.turn === 'left' ? '↰' : '↱';
        c.fillStyle = 'rgba(10, 14, 24, 0.78)';
        c.beginPath();
        c.roundRect(mr.x, ty - 11, mr.w, 18, 6);
        c.fill();
        c.font = '700 11px Rubik, sans-serif';
        c.textAlign = 'center';
        c.fillStyle = '#68f8c4';
        c.fillText(`${turnGlyph} ${Math.max(5, Math.round(nx.in / 5) * 5)} m`, mr.x + mr.w * 0.5, ty + 2);
      }
      c.restore();

      // Radio widget
      const rd = radioRect();
      const rn = radio.now;
      c.save();
      c.fillStyle = 'rgba(10, 14, 24, 0.8)';
      c.beginPath();
      c.roundRect(rd.x, rd.y, rd.w, rd.h, 8);
      c.fill();
      c.strokeStyle = rn.on ? 'rgba(255, 178, 74, 0.45)' : 'rgba(255, 255, 255, 0.2)';
      c.lineWidth = 1;
      c.stroke();
      icon(c, rn.on ? 'musical-notes' : 'speaker-off', rd.x + 14, rd.y + rd.h * 0.5, 15, rn.on ? ICON_RAD_ON : ICON_RAD_OFF);
      c.textAlign = 'left';
      const rtx = rd.x + 26, rtw = rd.w - 32;
      if (!rn.on) {
        c.font = '600 10px Rubik, sans-serif';
        c.fillStyle = '#c8d0e0';
        c.fillText(fitText(c, 'rad1', 'Radio off · tap to tune', rtw), rtx, rd.y + 22);
      } else {
        c.font = '700 10px Rubik, sans-serif';
        c.fillStyle = '#ffffff';
        c.fillText(fitText(c, 'rad1', `${rn.station} ${rn.freq}`, rtw), rtx, rd.y + 14);
        const sub = rn.kind === 'talk' ? (rn.line || rn.dj) : rn.song ? `${rn.song.title} · ${rn.song.artist}` : '';
        c.font = '500 9px Rubik, sans-serif';
        c.fillStyle = '#b8c4dc';
        c.fillText(fitText(c, 'rad2', sub, rtw), rtx, rd.y + 27);
      }
      c.restore();

      // Objective toast banner
      if (bannerT > 0 && bannerText) {
        const banY = Math.max(mr.y + mr.h + 44, topY + 138, H * 0.32);
        c.save();
        c.globalAlpha = Math.min(1, bannerT * 2);
        c.font = '700 12px Rubik, sans-serif';
        c.textAlign = 'center';
        c.fillStyle = 'rgba(8, 12, 20, 0.78)';
        c.beginPath();
        c.roundRect(14, banY - 16, W - 28, 24, 7);
        c.fill();
        c.fillStyle = bannerCol;
        c.fillText(fitText(c, 'ban', bannerText, W - 40), W * 0.5, banY);
        c.restore();
      }
    },

    down(x, y, id) {
      const { mr } = layoutTopHud();
      if (gps.opened) {
        if (x >= mr.x && x <= mr.x + mr.w && y >= mr.y && y <= mr.y + mr.h) gps.close();
        else gps.tap(x, y);
        return;
      }
      if (hitBox(mr, x, y)) { gps.open(); return; }
      if (hitBox(radioRect(), x, y)) { cycleRadio(); return; }
      if (hitBox(swapRect, x, y)) { swapKey = true; return; }
      if (hitBox(gunRect, x, y)) { gunKey = true; return; }
      if (!inCar && !inBoat && hitBox(covRect, x, y)) { coverKey = true; return; }

      pad.down(x, y, id);
      if (y < H * 0.55 && x > W * 0.35 && lookDragId === null) {
        lookDragId = id;
        lookLastX = x;
        lookLastY = y;
      }
    },

    move(x, y, pr, id) {
      if (id === lookDragId && pr) {
        camRig.yaw -= (x - lookLastX) * 0.008;
        camRig.pitch = clamp(camRig.pitch - (y - lookLastY) * 0.006, -0.75, 0.75);
        lookLastX = x;
        lookLastY = y;
      }
      if (!gps.opened) pad.move(x, y, pr, id);
    },

    up(x, y, id) {
      if (id === lookDragId) lookDragId = null;
      if (!gps.opened) pad.up(x, y, id);
    },

    key(k, d) {
      if (d) {
        if (k === 'm' || k === 'M') { if (gps.opened) gps.close(); else gps.open(); }
        else if (k === 'e' || k === 'E' || k === 'r' || k === 'R') rideKey = true;
        else if (k === 'q' || k === 'Q') coverKey = true;
        else if (k === 'c' || k === 'C') swapKey = true;
        else if (k === 'Tab') gunKey = true;
        else if (k === 'v' || k === 'V') aimKey = true;
      }
      fireHeld = k === 'f' || k === 'F' ? d : fireHeld;
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
  hint: 'Drive, boat, swim, take cover, shoot with ADS, duck into shops, and shake armed SBPD for 100 Rep.',
  creator: 'Rob',
  make,
};
