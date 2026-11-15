// Parcel Dash: rush parcels across a made-up city at dusk before the clock runs out. Made with
// gs.city (streets, traffic at the lights, people, the GPS: route, minimap and arrows on the road), gs.vehicles (the van's handling), gs.sky
// (the evening light) and gs.hd (Next Gen 3D).
import gs from '../gamescroll.js';
const { sounds, bed, Radio } = gs.sound;
const { haptic } = gs.device;
const { Juice } = gs.juice;
const { twoThumb, Keys } = gs.controls;
const { HDView, pbr, rbox, sun, THREE } = gs.hd;
const { City, Gps } = gs.city;
const { Sky } = gs.sky;
const { Car } = gs.vehicles;
const { rng } = gs.math;
const { icon } = gs.icons;
const { PhoneAI } = gs.phoneai;

let W = 300, H = 300;
let v, light, city, sky, van, wheels, beacon, ring, arrow, gps, drop;

function setup() {
  v = new HDView({ bg: '#8a98b0', fog: .0035, env: .5, amb: .5, fov: 62 });
  v.cam.near = .3; v.cam.far = 900; v.cam.updateProjectionMatrix();
  light = sun('#ffc890', 2.4, 60, [-.6, .45, .3]); v.scene.add(light, light.target); v.onTier(T => light.setTier(T));
  v.air({ haze: .0016, colour: '#9aa6bc' });
  sky = new Sky(v, { time: 17.9, speed: 0, stars: 200, sun: light, physical: true, fog: true });
  city = new City(v, { seed: 7, blocks: 6, style: 'downtown', sky, traffic: 1, people: 1 });
  // the GPS: the way to the drop, worked out again when you leave it, on the minimap and as arrows on the road
  gps = new Gps(city, { icon }); gps.show(v, { reach: 160, width: 1.6, opacity: .8 });
  drop = { at: { x: 0, z: 0 }, kind: 'job', icon: 'cardboard-box', pinned: true };
  // the delivery van: rounded body, a parcel on the roof rack, four wheels
  van = new THREE.Group(); wheels = [];
  const body = new THREE.Mesh(rbox(1.9, 1.3, 4, .25), pbr('#e8701c', { rough: .45, metal: .15 })); body.position.y = 1.05; body.castShadow = true; van.add(body);
  const glass = new THREE.Mesh(rbox(1.84, .55, 1, .12), pbr('#1a2430', { rough: .08, metal: .6 })); glass.position.set(0, 1.45, 1.35); van.add(glass);
  const box = new THREE.Mesh(rbox(1.2, .7, 1.4, .08), pbr('#a87c4c', { rough: .85 })); box.position.set(0, 2.05, -.6); box.castShadow = true; van.add(box);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(1.22, .72, .18), pbr('#cfc4a8', { rough: .7 })); tape.position.copy(box.position); van.add(tape);
  for (const [x, z] of [[-.9, 1.3], [.9, 1.3], [-.9, -1.3], [.9, -1.3]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .32, 14), pbr('#151515', { rough: .7 })); w.rotation.z = Math.PI / 2; w.position.set(x, .42, z); w.castShadow = true; van.add(w); wheels.push(w);
  }
  for (const x of [-.6, .6]) { const l = new THREE.Mesh(new THREE.BoxGeometry(.36, .18, .06), pbr('#fff2d0', { glow: 4 })); l.position.set(x, .9, 2.02); van.add(l); }
  v.scene.add(van);
  // where the parcel goes: a glowing ring on the pavement and a beam you can see over the roofs
  ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, .14, 8, 40), pbr('#40ffb0', { glow: 4 })); ring.rotation.x = Math.PI / 2; v.scene.add(ring);
  beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 160, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#40ffb0', transparent: true, opacity: .22, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  v.scene.add(beacon);
  arrow = new THREE.Mesh(new THREE.ConeGeometry(.5, 1.3, 4), pbr('#40ffb0', { glow: 2.5 })); arrow.rotation.x = Math.PI / 2; v.scene.add(arrow);
}

function make(api) {
  const fx = new Juice(), keys = new Keys(), pad = twoThumb(W, H, { right: ['BRAKE'] });
  // the van's radio: five made-up stations, DJs between the songs (the phone's AI freshens their lines
  // where it can), and the news picks up how your evening is going
  const radio = new Radio({ seed: 'parcel-dash', ai: new PhoneAI({ words: 40 }) });
  let dial = null, newsT = 0;
  const dialAt = () => {
    const w = Math.min(176, W * .58), h = 30, a = api.scoreArea(); let y = 54;
    if (a && 10 < a.x + a.w && a.x < 10 + w && y < a.bottom) y = Math.ceil(a.bottom) + 4;
    return dial = { x: 10, y, w, h };
  };
  const onDial = (x, y) => { const d = dial || dialAt(); return x >= d.x - 4 && x <= d.x + d.w + 4 && y >= d.y - 4 && y <= d.y + d.h + 4; };
  // a tap on the dial: on, through the stations, then off
  const turnDial = () => {
    const n = radio.now;
    if (!n.on) radio.tune(0); else if (n.index === radio.stations.length - 1) radio.off(); else radio.next();
    sounds.click(); haptic('tick');
  };
  const tellRadio = text => { if (newsT <= 0) { radio.news(text); newsT = 25; } };
  let car, score, time, t, target, trip, hitT, delivered, engine, msg, msgT, R, camPos, camLook, radioStarted;
  const pickTarget = () => {
    target = city.spot('door', { near: { x: car.x, z: car.y }, min: 110, max: 300, rnd: R }) || city.spot('door', { rnd: R });
    ring.position.set(target.x, .2, target.z); beacon.position.set(target.x, 80, target.z);
    drop.at = target; gps.to(target); trip = city.route({ x: car.x, z: car.y }, target)?.length || 0;   // (how far it is by road, for the bonus)
  };
  const say = (s, col = '#fff') => { msg = [s, col]; msgT = 1.6; };
  // the radio's dial on the HUD: the station, then the song (or what the DJ is saying)
  const fit = (c, s, w) => { if (c.measureText(s).width <= w) return s; while (s.length > 1 && c.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; };
  const drawDial = c => {
    const d = dialAt(), n = radio.now;
    c.save(); c.globalAlpha = .82; c.fillStyle = '#0b1020'; c.beginPath(); c.roundRect(d.x, d.y, d.w, d.h, 8); c.fill(); c.globalAlpha = 1;
    c.strokeStyle = n.on ? '#ffb24a66' : '#ffffff33'; c.lineWidth = 1; c.stroke();
    icon(c, n.on ? 'musical-notes' : 'speaker-off', d.x + 14, d.y + d.h / 2, 16, { color: n.on ? '#ffb24a' : '#9aa4b8' });
    c.textAlign = 'left'; const tx = d.x + 27, tw = d.w - 32;
    if (!n.on) { c.font = '600 11px Rubik, sans-serif'; c.fillStyle = '#c8d0e0'; c.fillText('Radio off · tap for music', tx, d.y + 19); c.restore(); return; }
    c.font = '700 11px Rubik, sans-serif'; c.fillStyle = '#fff';
    c.fillText(fit(c, `${n.station}  ${n.freq}`, tw), tx, d.y + 13);
    const sub = n.kind === 'talk' ? (n.line ? `${n.dj}: “${n.line}”` : n.dj) : n.song ? `${n.song.title} · ${n.song.artist}` : '';
    c.font = '500 10px Rubik, sans-serif'; c.fillStyle = n.kind === 'talk' ? '#ffd9a0' : '#b8c4dc';
    c.fillText(fit(c, sub, tw), tx, d.y + 25);
    c.restore();
  };
  return {
    reset() {
      if (!v) setup();
      city.reset(); R = rng(11);
      const st = city.spot('street', { near: city.start, max: 60, rnd: R }) || city.road(0, 0);
      car = new Car({ x: st.x, y: st.z, angle: Math.PI / 2 - st.heading, top: 21, accel: 13, brakes: 32, turn: 2.3, roll: .35, grip: 7, reverse: .35 });
      score = 0; time = 50; t = 0; hitT = 0; delivered = 0; msg = null; msgT = 0; engine = null; radioStarted = false; newsT = 0;
      camPos = new THREE.Vector3(car.x, 6, car.y - 10); camLook = new THREE.Vector3(car.x, 1, car.y);
      gps.clear(); gps.add(drop); pickTarget(); gps.update(0, { x: car.x, z: car.y, heading: Math.PI / 2 - car.angle });
      fx.clear(); pad.release(); keys.clear();
    },
    resize(w, h) { W = w; H = h; pad.layout(w, h); },
    update(dt) {
      t += dt; time -= dt; hitT -= dt; msgT -= dt; newsT -= dt; fx.update(dt);
      engine ||= bed({ vol: .015, from: 120, filter: 'lowpass', q: 4 });
      if (!radioStarted) { radioStarted = true; radio.on(); }   // the radio comes on with the engine
      radio.listen({ inside: true }).update(dt);
      const k = keys.axis(), sx = pad.left.active ? pad.left.x : k.x, sy = pad.left.active ? pad.left.y : k.y;
      const braking = pad.buttons.BRAKE.isDown;
      car.update(dt, { throttle: pad.left.active || k.x || k.y ? Math.max(-1, Math.min(1, -sy * 1.4 + (pad.left.active ? .35 : 0))) : 0, steer: sx, brake: braking || keys.held(' ') });
      engine.set({ from: 110 + Math.abs(car.speed) * 18, vol: .012 + car.pace * .02 }, .1);
      // buildings push you back; cars and people make you lose time
      const p = { x: car.x, z: car.y }, wall = city.collide(p, 1.15, .5);
      if (wall) { const nx = p.x - car.x, nz = p.z - car.y, l = Math.hypot(nx, nz) || 1; car.x = p.x; car.y = p.z; if (Math.abs(car.speed) > 6) { sounds.hit(); haptic('medium'); fx.shake(3); } car.bump(nx / l, nz / l, { keep: .4 }); }
      const other = hitT <= 0 && city.cars.hit(p, 1.1);
      if (other) { hitT = 1; city.cars.bump(other); car.bump(); time -= 3; say('Crash! -3s', '#ff7060'); sounds.boom(); haptic('heavy'); fx.shake(6); city.people.scare(p, 12); tellRadio('an orange parcel van has just bumped into a car downtown, so expect some delays'); }
      const person = city.people.hit(p, 1);
      if (person && hitT <= 0 && Math.abs(car.speed) > 2) { hitT = 1; car.speed *= .2; time -= 2; say('Watch out! -2s', '#ffb040'); sounds.hurt(); haptic('warning'); city.people.scare(p, 10, 3); }
      city.avoid(p, 1.4);
      city.update(dt, p); sky.update(dt);
      // arrived? slow down at the ring
      const d = Math.hypot(target.x - car.x, target.z - car.y);
      if (d < 4.5) {
        if (Math.abs(car.speed) < 7) {
          delivered++; score = delivered; api.score(score);
          const bonus = Math.round(10 + Math.min(14, trip / 30)); time += bonus;
          say(`Delivered! +${bonus}s`, '#60ffb8'); sounds.coin(1.2); sounds.powerup(); haptic('success');
          if (delivered % 3 === 0) tellRadio(`the orange parcel van has dropped off ${delivered} parcels already this evening`);
          const [x, y] = v.toScreen(target.x, 2, target.z); fx.pop(x, y, '📦', { color: '#fff' });
          pickTarget();
        } else if (msgT <= 0) say('Slow down to drop it off', '#fff');
      }
      gps.update(dt, { x: car.x, z: car.y, heading: Math.PI / 2 - car.angle });   // (heading as atan2(dx, dz); the car's angle is atan2(dz, dx))
      if (time <= 0) { sounds.lose(); api.over(); }
    },
    draw(c) {
      const ang = car.angle, fx3 = Math.cos(ang), fz3 = Math.sin(ang);
      van.position.set(car.x, 0, car.y); van.rotation.y = Math.PI / 2 - ang;
      for (const w of wheels) w.rotation.x += car.speed * .016 / .42;
      ring.rotation.z += .02; ring.position.y = .25 + Math.sin(t * 3) * .08;
      // the arrow over the van points along the route
      const nxt = gps.ahead(12) || target;
      arrow.position.set(car.x, 3.4 + Math.sin(t * 4) * .1, car.y); arrow.rotation.set(Math.PI / 2, 0, 0); arrow.lookAt(nxt.x, 3.4, nxt.z); arrow.rotateX(Math.PI / 2);
      // a chase camera that swings round behind the van
      const want = new THREE.Vector3(car.x - fx3 * 10, 5.2 + car.pace * 1.5, car.y - fz3 * 10), look = new THREE.Vector3(car.x + fx3 * 6, 1.2, car.y + fz3 * 6);
      camPos.lerp(want, .12); camLook.lerp(look, .2);
      const cp = { x: camPos.x, z: camPos.z }; city.collide(cp, .6, camPos.y - 1); camPos.x = cp.x; camPos.z = cp.z;
      v.cam.position.copy(camPos); v.cam.lookAt(camLook);
      light.fit(v, { far: 180, tall: 60, near: 30 });
      v.fit(W, H);
      fx.begin(c); v.render(c, W, H); fx.end(c, W, H);
      pad.draw(c);
      // the HUD: time, parcels, how far, a little map with the way
      c.font = '700 18px Rubik, sans-serif'; c.textAlign = 'left'; c.fillStyle = time < 10 && (t * 4 | 0) % 2 ? '#ff6070' : '#fff';
      c.fillText(Math.ceil(Math.max(0, time)) + 's', 12, 26);
      c.font = '600 13px Rubik, sans-serif'; c.fillStyle = '#e8f0ff'; c.fillText('📦 ' + delivered + '   ' + Math.round(Math.hypot(target.x - car.x, target.z - car.y)) + ' m', 12, 46);
      const ms = Math.min(86, W * .28), mx = W - ms - 10, my = 10;
      c.globalAlpha = .92; gps.mini(c, mx, my, ms, ms, { range: 140 }); c.globalAlpha = 1;
      // the next turn, under the map
      const nx = gps.next;
      if (nx && nx.turn !== 'arrive' && nx.in < 120) {
        const ix = mx + ms / 2, iy = my + ms + 14;
        const sg = nx.turn === 'left' ? -1 : 1, ax = ix - 18;   // a bent arrow: up, then round to the side of the turn
        c.strokeStyle = '#40ffb0'; c.fillStyle = '#40ffb0'; c.lineWidth = 2.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(ax - sg * 3, iy + 7); c.lineTo(ax - sg * 3, iy - 2); c.lineTo(ax + sg * 3, iy - 2); c.stroke();
        c.beginPath(); c.moveTo(ax + sg * 8, iy - 2); c.lineTo(ax + sg * 3, iy - 7); c.lineTo(ax + sg * 3, iy + 3); c.fill();
        c.font = '700 12px Rubik, sans-serif'; c.textAlign = 'left'; c.fillStyle = '#e8fff4'; c.fillText(Math.round(nx.in / 5) * 5 + ' m', ix - 6, iy + 4);
      }
      drawDial(c);
      if (msgT > 0 && msg) { c.globalAlpha = Math.min(1, msgT * 2); c.font = '700 16px Rubik, sans-serif'; c.textAlign = 'center'; c.fillStyle = msg[1]; c.fillText(msg[0], W / 2, H * .3); c.globalAlpha = 1; }
      if (t < 4) {
        c.font = '500 12px Rubik, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fffc'; c.fillText('Left thumb: drive and steer · follow the green arrow', W / 2, H * .4);
        c.fillText('Tap the radio to change station', W / 2, H * .4 + 16);
      }
    },
    down: (x, y, id) => { if (onDial(x, y)) turnDial(); else pad.down(x, y, id); },
    move: (x, y, pr, id) => pad.move(x, y, pr, id),
    up: (x, y, id) => pad.up(x, y, id),
    key: (k, d) => { if (d && (k === 'r' || k === 'R')) turnDial(); keys.key(k, d); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'parcel-dash',
  title: 'Parcel Dash',
  tag: 'Next Gen · Driving',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,
  goal: 5,
  hint: 'Drive the van through the evening traffic and stop at the green beam to drop each parcel off. Every drop buys more time.',
  creator: 'Game Scroll',
  make,
};
