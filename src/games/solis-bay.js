// Solis Bay: Next Gen 3D open-city action vertical slice (PR 2).
// Setting: 5-district coastal bay metropolis (Coral Strip, Old Naranja, Glass Quarter, Pelican Marina, Sawgrass Edge).
// Lead: Mateo "Mako" Delgado — walk, hijack cars, follow 3D GPS, deliver hot rides, and evade SBPD for 100 Rep.
import gs from '../gamescroll.js';

const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { twoThumb, Keys } = gs.controls;
const { Radio, sounds, bed, noise } = gs.sound;
const { icon } = gs.icons;
const { clamp } = gs.util;
const { rng } = gs.math;
const { Sky } = gs.sky;
const { Metro, Gps, Wanted } = gs.city;
const { Car } = gs.vehicles;
const { vehicle, human } = gs.models;
const { HDView, pbr, sun, THREE } = gs.hd;

let W = 300, H = 480;

const DISTRICTS = [
  { style: 'beach', blocks: [3, 3], seed: 101, name: 'Coral Strip' },
  { style: 'oldtown', blocks: [3, 3], seed: 202, name: 'Old Naranja' },
  { style: 'downtown', blocks: [3, 3], seed: 303, name: 'Glass Quarter' },
  { style: 'marina', blocks: [3, 3], seed: 404, name: 'Pelican Marina' },
  { style: 'glades', blocks: [3, 3], seed: 505, name: 'Sawgrass Edge' },
];

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
    fromDistrict: 'Coral Strip',
    toDistrict: 'Old Naranja',
    call: "Tia Carmen: Boost the hot ride on Coral Strip and bring it to Old Naranja Diner!",
    heat: 1,
  },
  {
    name: 'Marina Run',
    fromDistrict: 'Old Naranja',
    toDistrict: 'Pelican Marina',
    call: 'Dockhand: Grab a fast wheels-up coupe and run the manifest down to Pelican Marina.',
    heat: 2,
  },
  {
    name: 'Glass Escrow',
    fromDistrict: 'Pelican Marina',
    toDistrict: 'Glass Quarter',
    call: 'Nadia: Pick up the courier ride and thread Glass Quarter traffic to the plaza.',
    heat: 2,
  },
  {
    name: 'Sawgrass Drop',
    fromDistrict: 'Glass Quarter',
    toDistrict: 'Sawgrass Edge',
    call: 'Salvage: Ditch the heat out west at the Sawgrass Edge chop-shop!',
    heat: 2,
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
  body: '#1f6e74',
  legs: '#28303d',
  shoes: '#eceae4',
};

let v, light, sky, metro, gps, law, radio, mako;
let dropRing, dropBeacon, pickRing, pickBeacon, arrowMesh;
let barracuda, hotCoupe, activeCarMesh;
let worldReady = false;

// Reusable scratch objects (zero per-frame allocations)
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const wantCam = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const aheadPt = { x: 0, z: 0 };
const playerQuery = { x: 0, z: 0, y: 0, heading: 0, v: 0, car: false };
const avoidQuery = { x: 0, z: 0, vx: 0, vz: 0 };

function makeBeacon(col) {
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
}

function setupWorld(api) {
  human.need([MAKO_LOOK]);
  v = new HDView({ bg: '#7aa8d8', fog: 0.00018, env: 0.5, amb: 0.55, fov: 60 });
  v.air({ haze: 0.00025 });
  v.lampLights(6);
  v.autoOcclude = false;

  light = sun('#fff0d6', 3.0, 90, [-0.45, 1, 0.35]);
  v.scene.add(light, light.target);
  v.onTier(T => light.setTier(T));

  sky = new Sky(v, {
    time: 17.55,
    speed: 0.12,
    physical: true,
    clouds: 0.35,
    gap: 0.5,
    env: false,
  });

  metro = new Metro(v, {
    seed: 77,
    districts: DISTRICTS,
    coast: 'bay',
    bay: 380,
    climate: 'tropical',
    sea: true,
    far: true,
    hills: 0.1,
    river: true,
    highway: true,
    sky,
    traffic: 0.06,
    people: 0.04,
    fleet: false,
    sound: false,
  });
  v.occluders?.(null);

  gps = new Gps(metro, { off: 20, arrive: 12, icon, colour: '#38f8b0' });
  law = new Wanted(metro, api, { max: 3, cars: 2, officers: true, brains: false, armed: true, air: false, water: false });
  radio = new Radio({ stations: STATIONS, seed: 'solis-bay', sky, on: false });

  mako = human(MAKO_LOOK);
  mako.mesh.userData.detail = false;
  v.scene.add(mako);

  barracuda = vehicle('car', { style: 'saloon', colour: '#16969a', inside: true, lit: false });
  hotCoupe = vehicle('car', { style: 'sports', colour: '#ff6f61', inside: true, lit: false });
  hotCoupe.visible = false;
  v.scene.add(barracuda, hotCoupe);

  const arrowMat = pbr('#38f8b0', { glow: 0.4, rough: 0.35 });
  arrowMesh = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.48, 4), arrowMat);
  v.scene.add(arrowMesh);

  [dropRing, dropBeacon] = makeBeacon('#38f8b0');
  [pickRing, pickBeacon] = makeBeacon('#ffae38');
  worldReady = true;
}

function make(api) {
  const feel = new Feel();
  const ready = new Ready({ eat: false });
  const pad = twoThumb(W, H, { right: ['RIDE', 'BRAKE'] });
  const keys = new Keys();

  const K = gs.tweak('Feel', {
    walkSpeed: [4.8, 2.5, 8, 'Mako walking speed (m/s)'],
    sprintSpeed: [6.8, 4, 11, 'Mako sprinting speed (m/s)'],
    carTop: [22, 12, 34, 'top driving speed (m/s)'],
    carAccel: [22.776, 7, 24, 'driving acceleration (m/s^2)'],
    carTurn: [2.35, 1.2, 3.8, 'steering responsiveness'],
    carGrip: [7.4, 3, 12, 'lateral cornering grip'],
    daySpeed: [0.15, 0, 1, 'time-of-day speed (hours per real minute scale)'],
    dropRep: [35, 15, 60, 'Rep earned per delivery'],
    escapeRep: [47.12, 10, 50, 'Rep earned when escaping SBPD pursuit'],
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

  let R, t, score, inCar, carCtrl, foot, phase, jobIdx, job, targetPos, pickupPos;
  let bannerText, bannerCol, bannerT, hitT, rideCooldown, engineSound, radioStarted;
  let lastDistrictName, skyTick, gpsShown, hudSub, rideKey = false, lawWired = false;
  let lastClockStr, lastClockMin;

  const say = (txt, col = '#ffffff', dur = 3.2) => {
    bannerText = txt;
    bannerCol = col;
    bannerT = dur;
  };

  const placeAtDistrict = (name, nearPos = null, minD = 30, maxD = 120) => {
    const d = metro.districts.find(x => x.name === name) || metro.districts[0];
    const center = { x: (d.rect.x0 + d.rect.x1) * 0.5, z: (d.rect.z0 + d.rect.z1) * 0.5 };
    const sp = metro.spot('street', { in: d.name, near: nearPos || center, min: nearPos ? minD : 0, max: maxD, rnd: R });
    if (sp) return { x: sp.x, y: metro.ground(sp.x, sp.z), z: sp.z, heading: sp.heading || 0 };
    return { x: center.x, y: metro.ground(center.x, center.z), z: center.z, heading: 0 };
  };

  const assignJob = (idx) => {
    jobIdx = idx % JOBS.length;
    job = JOBS[jobIdx];
    const startRef = inCar ? { x: carCtrl.x, z: carCtrl.y } : foot;
    if (inCar) {
      phase = 'deliver';
      targetPos = placeAtDistrict(job.toDistrict, startRef, 90, 260);
      pickupPos = null;
      if (activeCarMesh !== hotCoupe) hotCoupe.visible = false;
      gps.clear().add({ at: targetPos, kind: 'target', text: job.toDistrict, pinned: true });
      gps.to(targetPos);
      hudSub = `Deliver to ${job.toDistrict}`;
      say(job.call, '#68f8c4', 4);
    } else {
      phase = 'pickup';
      pickupPos = placeAtDistrict(job.fromDistrict, startRef, 22, 90);
      targetPos = placeAtDistrict(job.toDistrict, pickupPos, 90, 260);
      hotCoupe.position.set(pickupPos.x, metro.ground(pickupPos.x, pickupPos.z), pickupPos.z);
      hotCoupe.rotation.set(0, (pickupPos.heading || 0) + Math.PI, 0);
      hotCoupe.visible = true;
      gps.clear().add({ at: pickupPos, kind: 'job', text: 'Hot Ride', pinned: true });
      gps.to(pickupPos);
      hudSub = `Board a ride on ${job.fromDistrict}`;
      say(job.call, '#ffd166', 4.2);
    }
  };

  const seatMakoIn = (vehMesh, cx, cz, heading) => {
    if (activeCarMesh && activeCarMesh !== barracuda && activeCarMesh !== hotCoupe && activeCarMesh !== vehMesh) {
      activeCarMesh.visible = false;
    }
    activeCarMesh = vehMesh;
    activeCarMesh.visible = true;
    activeCarMesh.position.set(cx, metro.ground(cx, cz), cz);
    activeCarMesh.rotation.set(0, heading + Math.PI, 0);
    activeCarMesh.putIn?.(mako, 'driver');
    inCar = true;
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
    if (!radioStarted) {
      radioStarted = true;
      radio.on();
    }
    radio.listen({ inside: true });
    if (phase === 'pickup') {
      phase = 'deliver';
      score = Math.min(100, score + 15);
      api.score(score);
      feel.coin(W * 0.5, H * 0.35, { color: '#ffcf5c', text: '+15 REP' });
      law.crime('theft', { x: cx, z: cz });
      if (law.stars < job.heat) law.set(job.heat);
      gps.clear().add({ at: targetPos, kind: 'target', text: job.toDistrict, pinned: true });
      gps.to(targetPos);
      hudSub = `Deliver to ${job.toDistrict}`;
      say(`Hot ride boosted! Run to ${job.toDistrict}`, '#68f8c4', 3.5);
      if (score >= 100) api.win();
    }
  };

  const stepOut = () => {
    if (!inCar || !activeCarMesh) return;
    activeCarMesh.takeOut?.(mako);
    const sideX = Math.cos(carCtrl.angle + Math.PI / 2) * 1.65;
    const sideZ = Math.sin(carCtrl.angle + Math.PI / 2) * 1.65;
    foot.x = carCtrl.x + sideX;
    foot.z = carCtrl.y + sideZ;
    foot.y = metro.ground(foot.x, foot.z);
    foot.heading = Math.PI / 2 - carCtrl.angle;
    foot.v = 0;
    metro.collide(foot, 0.45, foot.y);
    mako.position.set(foot.x, foot.y, foot.z);
    mako.rotation.set(0, foot.heading, 0);
    mako.rig.blend({ idle: 0, walk: 1.8, run: 4.5 }, 0);
    mako.rig.update(0, { speed: 0 });
    inCar = false;
    radio.listen({ inside: false });
    if (engineSound) engineSound.set({ vol: 0 }, 0.08);
  };

  const tryBoardOrExit = () => {
    if (rideCooldown > 0) return;
    rideCooldown = 0.35;
    if (inCar) {
      stepOut();
      say('On foot · Tap RIDE near any car', '#d8e6ff', 2.2);
      return;
    }
    const p = { x: foot.x, z: foot.z };
    // 1. Check Barracuda or hotCoupe
    const dCuda = Math.hypot(barracuda.position.x - p.x, barracuda.position.z - p.z);
    if (dCuda < 4.5) {
      const h = Math.atan2(-Math.sin(barracuda.rotation.y), -Math.cos(barracuda.rotation.y));
      seatMakoIn(barracuda, barracuda.position.x, barracuda.position.z, h);
      return;
    }
    if (hotCoupe.visible && Math.hypot(hotCoupe.position.x - p.x, hotCoupe.position.z - p.z) < 5.5) {
      const h = Math.atan2(-Math.sin(hotCoupe.rotation.y), -Math.cos(hotCoupe.rotation.y));
      seatMakoIn(hotCoupe, hotCoupe.position.x, hotCoupe.position.z, h);
      return;
    }
    // 2. Check parked or moving traffic / police car via Metro.cars.take()
    const nearParked = metro.cars.near(p, 5.5, { parked: true })[0];
    const nearTraffic = nearParked || metro.cars.near(p, 5.5)[0];
    if (nearTraffic) {
      const taken = metro.cars.take(nearTraffic, { driver: false, by: mako });
      if (taken) {
        v.scene.add(taken);
        const h = Math.atan2(-Math.sin(taken.rotation.y), -Math.cos(taken.rotation.y));
        seatMakoIn(taken, taken.position.x, taken.position.z, h);
        return;
      }
    }
    say('Move closer to a car to board', '#ffd166', 1.8);
  };

  const rdRect = { x: 10, y: H - 46, w: 170, h: 36 };
  const mrRect = { x: W - 92, y: 10, w: 82, h: 82 };
  const camCollide = { x: 0, z: 0 };
  const radioRect = () => {
    rdRect.x = 10;
    rdRect.y = H - 46;
    rdRect.w = Math.min(182, W * 0.56);
    rdRect.h = 36;
    return rdRect;
  };
  const miniRect = () => {
    const s = Math.min(82, W * 0.26);
    mrRect.x = W - s - 10;
    mrRect.y = 10;
    mrRect.w = s;
    mrRect.h = s;
    return mrRect;
  };

  const cycleRadio = () => {
    if (!radio.power) radio.on();
    else radio.next();
    sounds.click();
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
      rideKey = false;
      bannerText = '';
      bannerCol = '#ffffff';
      bannerT = 0;
      radioStarted = false;
      skyTick = 0;
      gpsShown = false;
      lastClockStr = '17:33';
      lastClockMin = -1;
      lastDistrictName = 'Coral Strip';
      hudSub = 'Board Barracuda or boost hot ride';

      // Pre-warm audio noise/engine bed in reset so boarding never hitches
      if (!engineSound) {
        engineSound = bed({ vol: 0, from: 110, filter: 'lowpass', q: 4 });
        try { noise(0.01, { vol: 0 }); } catch {}
      } else {
        engineSound.set({ vol: 0 }, 0.02);
      }

      const startSpot = placeAtDistrict('Coral Strip');
      foot = { x: startSpot.x, y: startSpot.y, z: startSpot.z, heading: startSpot.heading, v: 0 };
      metro.prepare(foot).reset(foot);
      law.reset();
      sky.time = 17.55;
      sky.speed = K.daySpeed;
      sky.update(0);

      // Re-attach Mako on foot and park his Flamingo Barracuda 3.8 m ahead
      activeCarMesh?.takeOut?.(mako);
      activeCarMesh = null;
      inCar = false;
      mako.position.set(foot.x, foot.y, foot.z);
      mako.rotation.set(0, foot.heading, 0);
      mako.rig.blend({ idle: 0, walk: 1.8, run: 4.5 }, 0);
      mako.rig.update(0, { speed: 0 });

      playerQuery.x = foot.x;
      playerQuery.y = foot.y;
      playerQuery.z = foot.z;
      playerQuery.heading = foot.heading;
      playerQuery.v = 0;
      playerQuery.car = false;

      const bx = foot.x + Math.sin(foot.heading) * 3.8;
      const bz = foot.z + Math.cos(foot.heading) * 3.8;
      barracuda.position.set(bx, metro.ground(bx, bz), bz);
      barracuda.rotation.set(0, foot.heading + Math.PI, 0);
      barracuda.lights?.(false);
      hotCoupe.lights?.(false);
      barracuda.visible = true;

      camPos.set(foot.x - Math.sin(foot.heading) * 5.4, foot.y + 2.9, foot.z - Math.cos(foot.heading) * 5.4);
      camLook.set(foot.x + Math.sin(foot.heading) * 6, foot.y + 1.3, foot.z + Math.cos(foot.heading) * 6);

      assignJob(0);
      gps.update(0, foot);
      if (!gpsShown) {
        gps.show(v);
        gpsShown = true;
      }

      if (!lawWired) {
        lawWired = true;
        law.on('escaped', () => {
          score = Math.min(100, score + K.escapeRep);
          api.score(score);
          feel.coin(W * 0.5, H * 0.3, { color: '#78ff98', text: `+${K.escapeRep} ESCAPE` });
          say(`SBPD Shaken! +${K.escapeRep} Rep`, '#78ff98', 3);
          if (score >= 100) api.win();
        });
        law.on('busted', () => {
          feel.lose();
          api.over();
        });
      }

      feel.clear();
      ready.reset();
      pad.release();
      keys.clear();
    },

    resize(w, h) {
      W = w;
      H = h;
      pad.layout(w, h);
    },

    update(dt) {
      const sdt = Math.min(0.05, dt);
      feel.update(sdt);
      if (feel.frozen) return;
      if (!ready.update(sdt)) return;

      t += sdt;
      hitT = Math.max(0, hitT - sdt);
      bannerT = Math.max(0, bannerT - sdt);
      rideCooldown = Math.max(0, rideCooldown - sdt);

      // Update Sky at reduced cadence to save per-frame CPU
      sky.speed = K.daySpeed;
      if ((skyTick++ & 3) === 0) {
        sky.update(sdt * 4);
        const nl = sky.night > 0.2;
        barracuda.lights?.(nl);
        hotCoupe.lights?.(nl);
      }

      if (radioStarted) radio.update(sdt);

      const k = keys.axis();
      const sx = pad.left.active ? pad.left.x : k.x;
      const sy = pad.left.active ? pad.left.y : k.y;
      const actRide = pad.buttons.RIDE.pressed() || rideKey;
      rideKey = false;
      const actAlt = pad.buttons.BRAKE.isDown || keys.held(' ') || keys.held('Shift');

      if (actRide) tryBoardOrExit();

      if (inCar && carCtrl && activeCarMesh) {
        const throttle = (pad.left.active || k.x || k.y) ? clamp(-sy * 1.4 + (pad.left.active ? 0.3 : 0), -1, 1) : 0;
        carCtrl.top = K.carTop;
        carCtrl.accel = K.carAccel;
        carCtrl.turn = K.carTurn;
        carCtrl.grip = K.carGrip;
        carCtrl.update(sdt, { throttle, steer: sx, brake: actAlt });
        engineSound?.set({ from: 110 + Math.abs(carCtrl.speed) * 16, vol: 0.012 + carCtrl.pace * 0.02 }, 0.1);

        const px = carCtrl.x, pz = carCtrl.y;
        const heading = Math.PI / 2 - carCtrl.angle;
        const gy = metro.ground(px, pz, (activeCarMesh.position.y || 0) + 1.5);

        playerQuery.x = px;
        playerQuery.z = pz;
        playerQuery.y = gy;
        playerQuery.heading = heading;
        playerQuery.v = carCtrl.speed;
        playerQuery.car = true;

        // Building / kerb push-out
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
          carCtrl.bump(nx / len, nz / len, { keep: 0.45 });
        }

        // Traffic & pedestrian collisions
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

        // Direct wheel roll / steer (avoids heavy seated skeleton IK each frame)
        activeCarMesh.position.set(carCtrl.x, gy, carCtrl.y);
        activeCarMesh.rotation.set(0, Math.PI / 2 - carCtrl.angle + Math.PI, 0);
        activeCarMesh.roll?.(carCtrl.speed * sdt);
        activeCarMesh.steer?.(sx * 0.45);
        activeCarMesh.lights?.(sky.night > 0.2);

        avoidQuery.x = carCtrl.x;
        avoidQuery.z = carCtrl.y;
        avoidQuery.vx = Math.cos(carCtrl.angle) * carCtrl.speed;
        avoidQuery.vz = Math.sin(carCtrl.angle) * carCtrl.speed;
        metro.avoid(avoidQuery, 1.3);
      } else {
        // On foot movement
        const mag = Math.hypot(sx, sy);
        const topWalk = actAlt ? K.sprintSpeed : K.walkSpeed;
        if (mag > 0.12) {
          const camYaw = Math.atan2(camLook.x - camPos.x, camLook.z - camPos.z);
          const moveYaw = camYaw + Math.atan2(-sx, -sy);
          const sp = topWalk * clamp(mag, 0, 1);
          foot.x += Math.sin(moveYaw) * sp * sdt;
          foot.z += Math.cos(moveYaw) * sp * sdt;
          foot.heading = moveYaw;
          foot.v = sp;
        } else {
          foot.v = 0;
        }

        const gy = metro.ground(foot.x, foot.z, foot.y + 1.5);
        foot.y = gy;
        playerQuery.x = foot.x;
        playerQuery.z = foot.z;
        playerQuery.y = gy;
        playerQuery.heading = foot.heading;
        playerQuery.v = foot.v;
        playerQuery.car = false;

        metro.collide(playerQuery, 0.45, gy);
        foot.x = playerQuery.x;
        foot.z = playerQuery.z;
        mako.position.set(foot.x, gy, foot.z);
        mako.rotation.set(0, foot.heading, 0);
        mako.rig.blend({ idle: 0, walk: 1.8, run: 4.5 }, foot.v);
        mako.rig.update(sdt, { speed: foot.v });

        avoidQuery.x = foot.x;
        avoidQuery.z = foot.z;
        avoidQuery.vx = Math.sin(foot.heading) * foot.v;
        avoidQuery.vz = Math.cos(foot.heading) * foot.v;
        metro.avoid(avoidQuery, 0.9);
      }

      metro.update(sdt, playerQuery);
      law.update(sdt, playerQuery);
      gps.update(sdt, playerQuery);

      // Update district label
      const dist = metro.districtAt(playerQuery.x, playerQuery.z);
      lastDistrictName = dist ? dist.name : 'Solis Causeway';

      // Mission progress checks
      if (phase === 'pickup' && pickupPos) {
        const dp = Math.hypot(pickupPos.x - playerQuery.x, pickupPos.z - playerQuery.z);
        if (inCar || dp < 4.0) {
          if (!inCar) {
            seatMakoIn(hotCoupe, pickupPos.x, pickupPos.z, pickupPos.heading || 0);
          }
        }
      } else if (phase === 'deliver' && targetPos) {
        const dd = Math.hypot(targetPos.x - playerQuery.x, targetPos.z - playerQuery.z);
        if (dd < 6.0 && Math.abs(playerQuery.v) < 8.5) {
          score = Math.min(100, score + K.dropRep);
          api.score(score);
          feel.coin(W * 0.5, H * 0.35, { color: '#68f8c4', text: `+${K.dropRep} REP` });
          say(`Drop complete! +${K.dropRep} Rep`, '#68f8c4', 3.2);
          if (score >= 100) {
            api.win();
            return;
          }
          assignJob(jobIdx + 1);
        }
      }
    },

    draw(c) {
      // Position objective beacons & GPS arrow
      if (phase === 'pickup' && pickupPos) {
        const py = metro.ground(pickupPos.x, pickupPos.z);
        pickRing.visible = pickBeacon.visible = true;
        dropRing.visible = dropBeacon.visible = false;
        pickRing.position.set(pickupPos.x, py + 0.25 + Math.sin(t * 3.5) * 0.08, pickupPos.z);
        pickBeacon.position.set(pickupPos.x, py + 9, pickupPos.z);
      } else if (phase === 'deliver' && targetPos) {
        const ty = metro.ground(targetPos.x, targetPos.z);
        pickRing.visible = pickBeacon.visible = false;
        dropRing.visible = dropBeacon.visible = true;
        dropRing.position.set(targetPos.x, ty + 0.25 + Math.sin(t * 3.5) * 0.08, targetPos.z);
        dropBeacon.position.set(targetPos.x, ty + 9, targetPos.z);
      } else {
        pickRing.visible = pickBeacon.visible = false;
        dropRing.visible = dropBeacon.visible = false;
      }

      const activeTarget = phase === 'pickup' ? pickupPos : targetPos;
      const nxt = gps.ahead(14, aheadPt) || activeTarget;
      if (nxt) {
        arrowMesh.visible = true;
        arrowMesh.position.set(playerQuery.x, playerQuery.y + (inCar ? 2.55 : 2.35) + Math.sin(t * 4) * 0.06, playerQuery.z);
        arrowMesh.lookAt(nxt.x, arrowMesh.position.y, nxt.z);
        arrowMesh.rotateX(Math.PI / 2);
      } else {
        arrowMesh.visible = false;
      }

      // Smooth chase camera
      const fx3 = Math.sin(playerQuery.heading);
      const fz3 = Math.cos(playerQuery.heading);
      const back = inCar ? 9.5 : 5.4;
      const up = inCar ? 4.4 + (carCtrl ? carCtrl.pace * 1.1 : 0) : 2.9;
      wantCam.set(playerQuery.x - fx3 * back, playerQuery.y + up, playerQuery.z - fz3 * back);
      lookAt.set(playerQuery.x + fx3 * 6, playerQuery.y + (inCar ? 1.2 : 1.3), playerQuery.z + fz3 * 6);
      camPos.lerp(wantCam, 0.14);
      camLook.lerp(lookAt, 0.22);

      camCollide.x = camPos.x;
      camCollide.z = camPos.z;
      metro.collide(camCollide, 0.55, camPos.y - 0.8);
      camPos.x = camCollide.x;
      camPos.z = camCollide.z;
      v.cam.position.copy(camPos);
      v.cam.lookAt(camLook);

      light.fit(v, { far: 170, tall: 60, near: 28 });
      v.fit(W, H);
      feel.begin(c);
      v.render(c, W, H);
      feel.end(c, W, H);

      if (gps.opened) {
        gps.map(c, 0, 0, W, H);
        return;
      }

      pad.draw(c);

      // Top-left status pill (kept clear of api.scoreArea())
      const mr = miniRect();
      const maxHudW = Math.max(118, mr.x - 18);
      const clockMin = Math.floor(sky.time * 60) % 1440;
      if (clockMin !== lastClockMin) {
        lastClockMin = clockMin;
        const hh = String(Math.floor(clockMin / 60)).padStart(2, '0');
        const mm = String(clockMin % 60).padStart(2, '0');
        lastClockStr = `${hh}:${mm}`;
      }

      c.save();
      c.fillStyle = 'rgba(10, 14, 24, 0.78)';
      c.beginPath();
      c.roundRect(8, 8, maxHudW, 56, 8);
      c.fill();

      c.font = '700 11px Rubik, sans-serif';
      c.textAlign = 'left';
      c.fillStyle = '#e8f4ff';
      c.fillText(fitText(c, 'dist', `${lastDistrictName} · ${lastClockStr}`, maxHudW - 14), 15, 23);

      // Wanted stars or status
      c.font = '700 11px Rubik, sans-serif';
      if (law.stars > 0) {
        let starsStr = '';
        for (let i = 0; i < 3; i++) starsStr += i < law.stars ? '★ ' : '☆ ';
        const statusStr = law.busting > 0.15 ? 'BUSTING!' : law.seen ? 'PURSUIT' : `EVADE ${Math.ceil(law.left)}s`;
        c.fillStyle = law.seen ? '#ff6b6b' : '#ffd166';
        c.fillText(fitText(c, 'stars', `${starsStr}${statusStr}`, maxHudW - 14), 15, 39);
      } else {
        c.fillStyle = '#8ef5c8';
        c.fillText(fitText(c, 'stars', `Mako · ${inCar ? 'Driving' : 'On Foot'}`, maxHudW - 14), 15, 39);
      }

      c.font = '500 10px Rubik, sans-serif';
      c.fillStyle = '#b9c9e4';
      c.fillText(fitText(c, 'sub', hudSub, maxHudW - 14), 15, 54);
      c.restore();

      // Top-right minimap & turn instruction
      c.save();
      c.globalAlpha = 0.92;
      gps.mini(c, mr.x, mr.y, mr.w, mr.h, { range: 165 });
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
      icon(c, rn.on ? 'musical-notes' : 'speaker-off', rd.x + 14, rd.y + rd.h * 0.5, 15, { color: rn.on ? '#ffb24a' : '#9aa4b8' });
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

      // Objective toast banner (kept clear of top HUD & minimap turn pill)
      if (bannerT > 0 && bannerText) {
        const banY = Math.max(mr.y + mr.h + 44, H * 0.29);
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
      const mr = miniRect();
      if (gps.opened) {
        if (x >= mr.x && x <= mr.x + mr.w && y >= mr.y && y <= mr.y + mr.h) gps.close();
        else gps.tap(x, y);
        return;
      }
      if (x >= mr.x && x <= mr.x + mr.w && y >= mr.y && y <= mr.y + mr.h) {
        gps.open();
        return;
      }
      const rd = radioRect();
      if (x >= rd.x && x <= rd.x + rd.w && y >= rd.y && y <= rd.y + rd.h) {
        cycleRadio();
        return;
      }
      pad.down(x, y, id);
    },

    move(x, y, pr, id) {
      if (!gps.opened) pad.move(x, y, pr, id);
    },

    up(x, y, id) {
      if (!gps.opened) pad.up(x, y, id);
    },

    key(k, d) {
      if (d) {
        if (k === 'm' || k === 'M') {
          if (gps.opened) gps.close();
          else gps.open();
        } else if (k === 'e' || k === 'E' || k === 'r' || k === 'R') {
          rideKey = true;
        }
      }
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
  hint: 'Walk, hijack cars, and follow GPS to deliver hot rides across Solis Bay while shaking SBPD for 100 Rep.',
  creator: 'Rob',
  make,
};
