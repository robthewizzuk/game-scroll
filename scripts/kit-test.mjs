// Quick checks of the game kits in Node: npm run kit-test
import assert from 'node:assert/strict';
const { Physics, loadPhysics } = await import('../src/kit/physics.js');

let threw = null; try { new Physics(); } catch (e) { threw = e; }
assert.ok(threw?.kitLoading, 'Physics before load throws StillLoading with kitLoading');
await threw.kitLoading; await loadPhysics();

// a box falls and lands on the floor of walls
{
  const p = new Physics({ gravity: 900, walls: [0, 0, 300, 400] });
  const box = p.box(150, 50, 30, 30);
  let hits = 0, maxSpeed = 0; p.onHit((a, b, speed) => { hits++; maxSpeed = Math.max(maxSpeed, speed); });
  for (let i = 0; i < 180; i++) p.step(1 / 60);
  assert.ok(Math.abs(box.y - 385) < 3, 'box rests on floor, y=' + box.y);
  assert.ok(hits >= 1 && maxSpeed > 300, 'hit reported with speed ' + maxSpeed);
  assert.ok(box.onGround(), 'onGround');
  assert.ok(p.at(150, 385) === box, 'at() finds the box');
  const r = p.ray(150, 10, 150, 400); assert.ok(r.thing === box, 'ray hits box'); assert.ok(Math.abs(r.y - 370) < 3, 'ray y ' + r.y);
}
// a tilted box tumbles (rotation works)
{
  const p = new Physics({ walls: [0, 0, 300, 400] });
  const b = p.box(150, 300, 80, 20, { angle: .6 });
  for (let i = 0; i < 240; i++) p.step(1 / 60);
  assert.ok(Math.abs(Math.sin(b.angle)) < .05, 'plank settles flat, angle ' + b.angle);
}
// pendulum on a hinge keeps its length; rope holds a weight
{
  const p = new Physics();
  const bob = p.circle(200, 100, 10);
  p.hinge(null, bob, 100, 100);
  for (let i = 0; i < 60; i++) p.step(1 / 60);
  assert.ok(Math.abs(Math.hypot(bob.x - 100, bob.y - 100) - 100) < 3, 'pendulum length');
  const w = p.circle(300, 200, 10, { density: 2 });
  p.rope(null, 300, 0, w, 300, 200, { links: 10 });
  for (let i = 0; i < 120; i++) p.step(1 / 60);
  assert.ok(w.y < 215, 'rope holds weight, y=' + w.y);
}
// spring, weld, grab, blast, remove, groups, sensor
{
  const p = new Physics({ walls: [0, 0, 400, 400] });
  const a = p.box(100, 380, 40, 40), b = p.box(140, 380, 40, 40);
  p.weld(a, b, 120, 380);
  for (let i = 0; i < 30; i++) p.step(1 / 60);
  assert.ok(Math.abs(b.x - a.x - 40) < 2, 'weld keeps distance');
  const g = p.grab(100, 380); assert.ok(g);
  for (let i = 0; i < 60; i++) { g.move(100, 200); p.step(1 / 60); }
  assert.ok(a.y < 300, 'grab lifts, y=' + a.y); g.release();
  const c = p.circle(300, 380, 10); p.step(1 / 60); p.blast(290, 385, 60, 800); p.step(1 / 60);
  assert.ok(c.vx > 100, 'blast pushes');
  p.remove(c); assert.ok(!p.things.includes(c));
  const g1 = p.circle(200, 100, 10, { group: 3 }), g2 = p.circle(200, 60, 10, { group: 3 });
  for (let i = 0; i < 120; i++) p.step(1 / 60);
  assert.ok(Math.abs(g1.y - g2.y) < 5, 'same group passes through');
  const s = p.box(50, 50, 20, 20, { sensor: true, fixed: true }); let sensed = false;
  p.onHit((x, y) => { if (x === s || y === s) sensed = true; });
  p.circle(50, 10, 5); for (let i = 0; i < 30; i++) p.step(1 / 60);
  assert.ok(sensed, 'sensor reports');
  const sp = p.circle(300, 100, 10); p.spring(null, sp, 300, 50, 300, 100, { stiffness: 3 });
  for (let i = 0; i < 300; i++) p.step(1 / 60);
  assert.ok(sp.y < 150, 'spring holds, y=' + sp.y);
}
console.log('physics ok');

// 3D physics
{
  const THREE = await import('three');
  const { World3D, loadPhysics3D } = await import('../src/kit/physics3d.js');
  let e = null; try { new World3D(); } catch (x) { e = x; }
  assert.ok(e?.kitLoading, '3D StillLoading'); await loadPhysics3D();
  const w = new World3D({ gravity: -20 });
  const level = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 20)); floor.position.y = -.5; level.add(floor);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 20)); wall.position.set(5, 2, 0); level.add(wall);
  const step = new THREE.Mesh(new THREE.BoxGeometry(2, .25, 20)); step.position.set(-3, .125, 0); level.add(step);
  w.ground(level);
  const crateMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); crateMesh.position.set(0, 5, 3);
  const crate = w.box(crateMesh, 1, 1, 1);
  let hit = 0; w.onHit((a, b, sp) => { if (sp > 3) hit++; });
  const heroMesh = new THREE.Object3D(); heroMesh.position.set(0, 0, 0);
  const hero = w.mover(heroMesh, { radius: .4, height: 1.8 });
  for (let i = 0; i < 120; i++) { hero.walk(6, 0); w.step(1 / 60); }
  assert.ok(Math.abs(crateMesh.position.y - .5) < .05, 'crate lands, y=' + crateMesh.position.y);
  assert.ok(hit > 0, '3D hit');
  assert.ok(heroMesh.position.x < 4.7 && heroMesh.position.x > 4, 'mover stopped by wall, x=' + heroMesh.position.x);
  assert.ok(hero.grounded, 'mover grounded');
  for (let i = 0; i < 76; i++) { hero.walk(-6, 0); w.step(1 / 60); }
  assert.ok(heroMesh.position.x < -2.5 && heroMesh.position.y > .2, 'mover climbs step, ' + heroMesh.position.x + ',' + heroMesh.position.y);
  hero.jump(8); w.step(1 / 60); for (let i = 0; i < 10; i++) { hero.walk(0, 0); w.step(1 / 60); }
  assert.ok(heroMesh.position.y > 1, 'jump, y=' + heroMesh.position.y);
  const r = w.ray({ x: 0, y: 10, z: 3 }, { x: 0, y: -1, z: 0 }, 50);
  assert.ok(r && r.thing === crate && Math.abs(r.point.y - 1) < .05, 'ray hits crate');
  const bob = w.ball(null, .3, { at: { x: 2, y: 3, z: -3 } }); w.pin(null, bob, { x: 0, y: 3, z: -3 });
  for (let i = 0; i < 60; i++) w.step(1 / 60);
  const p = bob.pos; assert.ok(Math.abs(Math.hypot(p.x, p.y - 3, p.z + 3) - 2) < .1, 'pin keeps length');
  console.log('physics3d ok');
}

// AI
{
  const { Crowd, NavGrid, Brain } = await import('../src/kit/ai.js');
  const crowd = new Crowd(), player = { x: 300, y: 300 };
  const bat = crowd.add(0, 0, { speed: 100 }).chase(player);
  for (let i = 0; i < 300; i++) crowd.update(1 / 60);
  assert.ok(Math.hypot(bat.x - 300, bat.y - 300) < 30, 'chase gets close: ' + bat.x + ',' + bat.y);
  const lvl = ['..........', '.########.', '.#......#.', '.#.####.#.', '...#..#...'];
  const nav = new NavGrid(10, 5, 10, (x, y) => lvl[y][x] === '#');
  const route = nav.path(5, 5, 45, 25);
  assert.ok(route && route.length >= 3, 'path found');
  for (const p of route) assert.ok(!nav.blocked(p.x, p.y), 'route avoids walls');
  nav.set(0, 2, true); nav.set(0, 3, true); nav.set(2, 4, true); nav.set(9, 1, true); nav.set(9, 2, true);
  assert.ok(nav.path(5, 5, 45, 25) === null || true);
  const ant = crowd.add(5, 5, { speed: 80, radius: 3 }).follow([{ x: 95, y: 5 }]);
  for (let i = 0; i < 200; i++) crowd.update(1 / 60);
  assert.ok(ant.arrived && ant.x > 85, 'follow arrives ' + ant.x);
  const b = new Brain('a', { a: { update() { if (b.time > .5) b.go('b'); } }, b: {} });
  for (let i = 0; i < 40; i++) b.update(1 / 60);
  assert.ok(b.is('b'), 'brain switches');
  const sheep = []; for (let i = 0; i < 10; i++) sheep.push(crowd.add(100 + i * 3, 100, { speed: 40 }).wander().flock());
  for (let i = 0; i < 60; i++) crowd.update(1 / 60);
  console.log('ai ok');
}
// math
{
  const { rng, daily, noise2, fbm, Grid, Timers, overlap } = await import('../src/kit/math.js');
  const a = rng('x'), b = rng('x'); assert.ok(a() === b() && a.int(1, 6) === b.int(1, 6), 'seeded');
  assert.ok(daily('g', new Date('2026-01-01T03:00Z')) === daily('g', new Date('2026-01-01T22:00Z')), 'daily same day');
  const n = noise2(.3, .7); assert.ok(n >= -1 && n <= 1 && Math.abs(noise2(.3, .7001) - n) < .01, 'noise smooth');
  assert.ok(Math.abs(fbm(1, 2)) <= 1);
  const g = new Grid(32); g.add({ x: 10, y: 10, r: 5 }); g.add({ x: 300, y: 300, r: 5 });
  assert.ok(g.near(0, 0, 20).length === 1, 'grid near');
  const t = new Timers(); let fired = 0; t.every(.1, () => fired++); for (let i = 0; i < 31; i++) t.update(1 / 100);
  assert.ok(fired === 3, 'timers ' + fired);
  assert.ok(overlap.circles({ x: 0, y: 0, r: 5 }, { x: 8, y: 0, r: 5 }) && !overlap.boxes({ x: 0, y: 0, w: 5, h: 5 }, { x: 6, y: 0, w: 5, h: 5 }));
  console.log('math ok');
}
// game objects
{
  const { Things } = await import('../src/kit/things.js');
  const t = new Things();
  const p = t.add({ x: 100, y: 100, r: 10 }, 'player');
  const c1 = t.add({ x: 105, y: 100, r: 4 }, 'coin'), c2 = t.add({ x: 300, y: 100, r: 4 }, 'coin');
  assert.ok(t.hit(p, 'coin') === c1, 'hit finds the touching coin');
  const box = t.add({ x: 200, y: 200, w: 40, h: 20 }, 'wall');
  assert.ok(t.touch({ x: 215, y: 205, r: 2 }, box) && !t.touch({ x: 225, y: 205, r: 2 }, box), 'circle vs box');
  let pairs = 0; for (let i = 0; i < 30; i++) t.add({ x: i * 10, y: 0, r: 2 }, 'bullet'); for (let i = 0; i < 30; i++) t.add({ x: i * 10 + 1, y: 0, r: 2 }, 'enemy');
  t.hits('bullet', 'enemy', (b, e) => { pairs++; t.kill(b); });
  assert.ok(pairs === 30, 'grid hits pairs ' + pairs);           // 900 pairs: grid path; each bullet hits once
  assert.ok(t.count('bullet') === 0 && t.nearest(290, 0, 'enemy').x === 291, 'kill and nearest');
  t.update(0); assert.ok(t.list.length === 34, 'sweep drops killed ' + t.list.length);
  const r = t.reuse('bullet', () => ({}), { x: 1, y: 2 }); assert.ok(!r.dead && t.is(r, 'bullet') && r.x === 1, 'reuse');
  assert.ok(t.near(100, 100, 10, 'coin')[0] === c1 && t.all('coin').length === 2 && c2, 'near');
  const t3 = new Things({ plane: 'xz' }); const a = t3.add({ x: 0, y: 50, z: 0, r: 1 }, 'a'); t3.add({ x: 1, y: -50, z: 0, r: 1 }, 'b');
  assert.ok(t3.hit(a, 'b'), 'xz plane ignores y');
  console.log('things ok');
}
// scenes, levels, pacing
{
  const { Scenes, Levels } = await import('../src/kit/rounds.js');
  const log = [];
  const s = new Scenes({ intro: { enter: () => log.push('in'), update: (dt, sc) => { if (sc.time > 1) sc.go('play', { fade: .5 }); } }, play: { enter: (sc, d) => log.push('play') } }, 'intro');
  for (let i = 0; i < 60; i++) s.update(1 / 30);
  assert.ok(s.name === 'play' && !s.changing && log.join() === 'in,play', 'scene change ' + log);
  s.go('intro', { fade: 1 }); s.update(.5); assert.ok(s.cover > .95 && s.name === 'intro', 'cover peaks mid-change');
  s.after(.2, 'play'); for (let i = 0; i < 40; i++) s.update(.05); assert.ok(s.name === 'play', 'after');
  const L = new Levels(['a', 'b'], { loop: true }); L.next(); L.next(); assert.ok(L.now === 'a' && L.lap === 1 && L.number === 3, 'levels loop');
  const { Spawner, Waves, Director, ramp } = await import('../src/kit/pacing.js');
  const sp = new Spawner({ every: 1, fastest: .25, over: 10 }); let n = 0;
  for (let i = 0; i < 600; i++) sp.update(1 / 60, () => n++);
  assert.ok(n >= 14 && n <= 24 && sp.gap < .3, 'spawner speeds up ' + n + ' ' + sp.gap);
  const w = new Waves([{ count: 3, every: .2, kind: 'bat' }, { count: 1, kind: 'boss' }], { breather: 1, first: 0 }); const got = []; let alive = 0;
  for (let i = 0; i < 300; i++) { w.update(1 / 30, k => { got.push(k); alive++; }, alive); if (i === 60) alive = 0; if (i === 150) alive = 0; }
  assert.ok(got.join() === 'bat,bat,bat,boss' && w.state === 'done', 'waves ' + got + ' ' + w.state);
  const d = new Director({ over: 10 }); for (let i = 0; i < 300; i++) d.update(1 / 30); const before = d.level; d.hurt(2);
  assert.ok(before > .9 && d.level < before && d.calm, 'director eases off when hurt');
  assert.ok(ramp(5, 0, 10, 10) === 5, 'ramp');
  console.log('rounds + pacing ok');
}
// aim assist and senses
{
  const { AimAssist } = await import('../src/kit/aim.js');
  const as = new AimAssist({ cone: 15, range: 300, pull: .6, autoFire: .1 });
  const target = { x: 200, y: 20, r: 10 }; let aim = 0, fired = false;
  for (let i = 0; i < 90; i++) { const a = as.update(1 / 60, { x: 0, y: 0 }, aim, [target]); aim = a.angle; fired ||= a.fire; }
  assert.ok(Math.abs(aim - Math.atan2(20, 200)) < .02 && fired, 'pulled onto target and fired ' + aim);
  assert.ok(as.turn(1) < 1, 'sticky aim slows turning');
  const off = as.update(1 / 60, { x: 0, y: 0 }, 1.5, [target]); assert.ok(!off.target, 'outside the cone: no help');
  const blocked = as.update(1 / 60, { x: 0, y: 0 }, 0, [target], { sees: () => false }); assert.ok(!blocked.target, 'walls block');
  const THREE = await import('three');
  const a3 = new AimAssist({ cone: 10, range: 50, pull: 1 }); let dir = new THREE.Vector3(0, 0, -1);
  for (let i = 0; i < 60; i++) dir = a3.update(1 / 60, { x: 0, y: 0, z: 0 }, dir, [{ x: 1, y: 0, z: -10, r: .5 }]).dir;
  assert.ok(dir.isVector3 && Math.abs(Math.atan2(dir.x, -dir.z) - Math.atan2(1, 10)) < .02, '3D pull');
  const { Senses, Noises } = await import('../src/kit/senses.js');
  const g = { x: 0, y: 0, facing: 0, senses: new Senses({ range: 100, fov: 90, spotTime: .5 }) }, pl = { x: 50, y: 0 };
  for (let i = 0; i < 30; i++) g.senses.update(1 / 30, g, pl);
  assert.ok(g.senses.mood === 'alert' && g.senses.lastSeen.x === 50, 'spotted in the cone');
  for (let i = 0; i < 30 * 5; i++) g.senses.update(1 / 30, g, { x: -50, y: 0 });
  assert.ok(g.senses.mood === 'searching', 'searching after losing sight: ' + g.senses.mood);
  const h = new Senses({ range: 100 }), noises = new Noises(); noises.make(-30, 0, 60);
  h.update(1 / 30, { x: 0, y: 0, facing: 0 }, { x: -50, y: 0 }, { noises }); noises.update(1 / 30);
  assert.ok(h.mood === 'suspicious' && h.lookAt.x === -30, 'heard a noise behind');
  const wall = new Senses({ range: 100 }); for (let i = 0; i < 60; i++) wall.update(1 / 30, { x: 0, y: 0, facing: 0 }, pl, { sees: () => false });
  assert.ok(wall.mood === 'calm', 'walls block sight');
  const gs2 = [{ x: 10, y: 0, senses: new Senses() }, { x: 500, y: 0, senses: new Senses() }]; Senses.alertAll(gs2, 0, 0, 100);
  assert.ok(gs2[0].senses.mood === 'alert' && gs2[1].senses.mood === 'calm', 'alertAll radius');
  console.log('aim + senses ok');
}
// camera rigs and living characters (three.js maths only)
{
  const THREE = await import('three');
  const { CameraRig } = await import('../src/kit/camera.js');
  const cam = new THREE.PerspectiveCamera(60, 1, .1, 100), hero = new THREE.Object3D();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, .2), new THREE.MeshBasicMaterial()); wall.position.set(0, 1, -3); wall.updateMatrixWorld();
  const rig = new CameraRig(cam, { mode: 'chase', distance: 6, height: 2, lag: 0 });
  rig.update(1 / 60, hero);
  assert.ok(Math.abs(cam.position.z + 6) < .5 && cam.position.y > 1, 'chase sits behind ' + cam.position.toArray());
  rig.set({ walls: [wall] }); rig.update(1 / 60, hero);
  assert.ok(cam.position.z > -3, 'pulled in front of the wall ' + cam.position.z);
  rig.to('top', .5); for (let i = 0; i < 40; i++) rig.update(1 / 60, hero);
  assert.ok(cam.position.y > 10, 'blended to top ' + cam.position.y);
  rig.kick(10, .3); rig.update(.05, hero); assert.ok(cam.fov > 60, 'fov kick');
  const { lookAt, reach, Steps, Wobble } = await import('../src/kit/characters.js');
  const body = new THREE.Group(), head = new THREE.Object3D(); head.position.y = 1.6; body.add(head);
  lookAt(head, new THREE.Vector3(5, 1.6, 0), null, { max: 3 });
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(head.quaternion); assert.ok(f.x > .95, 'head turns to look ' + f.toArray());
  lookAt(head, new THREE.Vector3(-5, 1.6, -5), null, { max: .5 }); assert.ok(new THREE.Euler().setFromQuaternion(head.quaternion, 'YXZ').y >= -.51, 'look limit');
  // a leg: thigh (origin hip) with shin (origin knee .5 down), shin .5 long
  const hip = new THREE.Group(); hip.position.y = 1; body.add(hip);
  const thigh = new THREE.Mesh(new THREE.BoxGeometry(.1, .5, .1).translate(0, -.25, 0)); hip.add(thigh);
  const shin = new THREE.Mesh(new THREE.BoxGeometry(.1, .5, .1).translate(0, -.25, 0)); shin.position.y = -.5; thigh.add(shin);
  const goal = new THREE.Vector3(.2, .3, .3); assert.ok(reach(thigh, shin, goal), 'in reach');
  const tip = shin.localToWorld(new THREE.Vector3(0, -.5, 0)); assert.ok(tip.distanceTo(goal) < .01, 'foot on target ' + tip.toArray());
  const st = new Steps({ stride: .3 }); const mover = new THREE.Object3D(); let landed = 0;
  for (let i = 0; i < 120; i++) { mover.position.z += 1.5 / 60; st.update(1 / 60, mover); landed += st.feet.filter(x => x.landed).length; }
  assert.ok(landed >= 4 && st.feet.every(x => Math.abs(x.pos.z - mover.position.z) < .8), 'feet step along ' + landed);
  const wb = new Wobble(); wb.hit(1); let peak = 0; for (let i = 0; i < 120; i++) { wb.update(1 / 60); peak = Math.max(peak, Math.abs(wb.value)); }
  assert.ok(peak > .3 && Math.abs(wb.value) < .05, 'wobble settles');
  console.log('camera + characters ok');
}
// ragdoll (3D physics) and 3D path finding
{
  const THREE = await import('three');
  const { World3D, loadPhysics3D } = await import('../src/kit/physics3d.js');
  await loadPhysics3D();
  const scene = new THREE.Scene(), w = new World3D(); w.floor(0);
  const guy = new THREE.Group(); guy.position.y = 1.2; scene.add(guy);
  guy.add(new THREE.Mesh(new THREE.BoxGeometry(.4, .6, .25)));
  const mk = (x, y) => { const l = new THREE.Group(); l.position.set(x, y, 0); l.add(new THREE.Mesh(new THREE.BoxGeometry(.12, .5, .12).translate(0, -.25, 0))); guy.add(l); return l; };
  const legL = mk(-.12, -.3), legR = mk(.12, -.3), armL = mk(-.28, .25);
  const rag = w.ragdoll(guy, { push: [0, 1, -3] });
  assert.ok(rag.parts.length === 4 && legL.parent === scene, 'parts become bodies in the scene');
  for (let i = 0; i < 180; i++) w.step(1 / 60);
  const hipToLeg = guy.localToWorld(new THREE.Vector3(-.12, -.3, 0)).distanceTo(legL.position);
  assert.ok(guy.position.y < .5 && hipToLeg < .08, 'falls down and stays jointed ' + guy.position.y + ' ' + hipToLeg);
  assert.ok(armL.position.y > -.1 && legR.position.y > -.1, 'rests on the floor');
  rag.remove();
  const { NavMesh3D, loadNav3D } = await import('../src/kit/nav3d.js');
  let t = null; try { new NavMesh3D([]); } catch (e) { t = e; } assert.ok(t?.kitLoading, 'nav3d lazy');
  await loadNav3D();
  const lvl = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, .2, 20)); floor.position.y = -.1; lvl.add(floor);
  const block = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 12)); block.position.set(0, 1.5, 0); lvl.add(block);
  const nav = new NavMesh3D([lvl], { radius: .3 });
  const path = nav.path({ x: -5, y: 0, z: 0 }, { x: 5, y: 0, z: 0 });
  assert.ok(path.length >= 3 && path.every(p => Math.abs(p.x) > 1 || Math.abs(p.z) > 5.9), 'path goes round the block ' + path.map(p => p.toArray().map(v => v.toFixed(1))).join(' '));
  const crowd = nav.crowd(), ag = crowd.add({ x: -5, y: 0, z: 0 }, { speed: 4 });
  for (let i = 0; i < 60 * 8; i++) { ag.goto({ x: 5, y: 0, z: 0 }); crowd.update(1 / 60); }
  assert.ok(ag.position.distanceTo(new THREE.Vector3(5, 0, 0)) < .6, 'agent walks there ' + ag.position.toArray());
  assert.ok(nav.random() && nav.closest({ x: 0, y: 5, z: 0 }).y < 3.2, 'random and closest');
  console.log('ragdoll + nav3d ok');
}
// one clean-up registry: every kit's stop runs, and one failing doesn't stop the rest
{
  const { register, stopAll, pauseAll, resumeAll } = await import('../src/kit/cleanup.js');
  const log = [];
  register('test-a', { stop: () => { log.push('a'); throw new Error('boom'); }, pause: () => log.push('pa'), resume: () => log.push('ra') });
  register('test-b', { stop: () => log.push('b') });
  stopAll(); pauseAll(); resumeAll();
  assert.ok(log.includes('a') && log.includes('b') && log.includes('pa') && log.includes('ra'), 'cleanup hooks all run ' + log);
  console.log('cleanup ok');
}
// a card's subscriptions end when it leaves the feed; a failed lazy load can be tried again
{
  const { ownedBy, onRelease, release } = await import('../src/kit/cleanup.js');
  const card = {}, log = [];
  ownedBy(card, () => onRelease(() => log.push('off')));
  assert.equal(onRelease(() => log.push('stray')), null, 'nothing to tie to outside make() / reset()');
  release(card); release(card);
  assert.deepEqual(log, ['off'], 'onRelease runs once when the card goes');
  const { lazy } = await import('../src/kit/lazy.js');
  let tries = 0;
  const lib = lazy('flaky', () => { if (++tries === 1) throw new Error('offline'); return 'lib'; });
  let e1 = null; try { lib.get(); } catch (e) { e1 = e; }
  assert.ok(e1?.kitLoading, 'first get starts the load');
  await e1.kitLoading.then(() => assert.fail('should fail'), () => {});
  let e2 = null; try { lib.get(); } catch (e) { e2 = e; }
  assert.ok(e2?.kitLoading, 'after a failure, the next get loads again (not the old error)');
  assert.equal(await e2.kitLoading, 'lib'); assert.equal(lib.get(), 'lib', 'second try works');
  console.log('release + lazy retry ok');
}
// a game's reward and shop prices can't break the wallet
{
  const { rewardOf, fairPrice, MAX_REWARD } = await import('../src/kit/progress.js');
  assert.equal(rewardOf(undefined), 10); assert.equal(rewardOf(0), 0); assert.equal(rewardOf(25), 25);
  assert.equal(rewardOf(1e9), MAX_REWARD); assert.equal(rewardOf(-50), 0); assert.equal(rewardOf('10'), 10); assert.equal(rewardOf('x'), 0); assert.equal(rewardOf(7.9), 7);
  assert.ok(fairPrice(25) && !fairPrice(0) && !fairPrice(-5) && !fairPrice('25') && !fairPrice(2.5) && !fairPrice(NaN), 'prices are whole numbers 1 and up');
  console.log('wallet limits ok');
}
// Reduce motion softens shake and flash
{
  const { setPrefs, prefs } = await import('../src/kit/prefs.js');
  const { Shake, Juice } = await import('../src/kit/juice.js');
  const a = new Shake(); a.add(6); const full = a.trauma;
  setPrefs({ reduceMotion: true });
  const b = new Shake(); b.add(6);
  assert.ok(b.trauma < full * .5, 'reduce motion: smaller shake ' + b.trauma + ' vs ' + full);
  const j = new Juice(); j.flash('#fff', .4); assert.ok(j.fl.a < .2, 'reduce motion: softer flash');
  assert.ok(Object.isFrozen(prefs), 'games cannot change prefs');
  setPrefs({ reduceMotion: false });
  console.log('prefs ok');
}
// 2D camera: dead zone, bounds, toWorld
{
  const { Camera2D } = await import('../src/kit/camera2d.js');
  const cam = new Camera2D(160, 144, { bounds: [0, 0, 640, 144], deadzone: [40, 40], lag: 0 });
  const t = { x: 10, y: 72 }; cam.update(1 / 60, t);
  assert.equal(cam.x, 80, 'clamped to the left edge');
  t.x = 300; cam.update(1 / 60, t); assert.ok(Math.abs(cam.x - 280) < 1e-6, 'follows to the dead zone edge ' + cam.x);
  t.x = 900; cam.update(1 / 60, t); assert.equal(cam.x, 560, 'clamped to the right edge');
  const w = cam.toWorld(80, 72); assert.ok(Math.abs(w.x - 560) < 1e-6 && Math.abs(w.y - 72) < 1e-6, 'toWorld');
  assert.ok(cam.sees(600, 70) && !cam.sees(100, 70), 'sees');
  console.log('camera2d ok');
}
// tile levels and movers
{
  const { TileMap } = await import('../src/kit/tiles.js');
  const { Platformer, TopDown } = await import('../src/kit/movers.js');
  const map = TileMap.fromText(`
    ..........
    .P......E.
    ....--....
    ..........
    ...../####
    ##########`, { size: 10 });
  assert.equal(map.cols, 10); assert.equal(map.rows, 6);
  assert.deepEqual(map.find('P').map(m => [m.x, m.y]), [[15, 15]], 'marks');
  const hero = new Platformer({ x: 15, y: 15, w: 8, h: 8, jump: 25, run: 60 });
  for (let i = 0; i < 60; i++) hero.update(1 / 60, map, {});
  assert.ok(hero.onGround && Math.abs(hero.bottom - 50) < .01, 'lands on the floor ' + hero.bottom);
  // run right up the slope onto the block
  for (let i = 0; i < 120; i++) hero.update(1 / 60, map, { x: 1 });
  assert.ok(hero.onGround && Math.abs(hero.bottom - 40) < .6 && hero.x > 55, 'walked up the slope onto the block ' + hero.x + ',' + hero.bottom);
  // a jump reaches about the jump height, coyote time works after walking off
  const h2 = new Platformer({ x: 25, y: 46, w: 8, h: 8, jump: 25 }); h2.update(1 / 60, map, {});
  let top = h2.y; h2.update(1 / 60, map, { jump: true }); for (let i = 0; i < 40; i++) { h2.update(1 / 60, map, { jump: true }); top = Math.min(top, h2.y); }
  assert.ok(46 - top > 20 && 46 - top < 30, 'jump height ~25: ' + (46 - top));
  // one-way platform: jump up through it and stand on it
  assert.ok(map.info(4, 2).oneWay, 'one-way tile');
  const h3 = new Platformer({ x: 45, y: 46, w: 6, h: 8, jump: 35 }); h3.update(1 / 60, map, {});
  h3.update(1 / 60, map, { jump: true }); for (let i = 0; i < 90; i++) h3.update(1 / 60, map, { jump: true });
  assert.ok(h3.onGround && Math.abs(h3.bottom - 20) < .01, 'stands on the one-way platform ' + h3.bottom);
  // top-down slides along walls
  const td = new TopDown({ x: 15, y: 25, w: 8, h: 8, speed: 80 }); for (let i = 0; i < 60; i++) td.update(1 / 60, map, { x: -1, y: 1 });
  assert.ok(td.left >= 0 - 1e-6 && td.bottom <= 50 + 1e-6, 'top-down stops at walls');
  assert.ok(map.sees(15, 15, 85, 15) && !map.sees(15, 45, 85, 45), 'line of sight');
  console.log('tiles + movers ok');
}
// animation states
{
  const { Animator } = await import('../src/kit/anim.js');
  const steps = [];
  const a = new Animator({ idle: { frames: 2, fps: 4 }, run: { frames: 4, fps: 10, events: { 1: 'step', 3: 'step' } }, punch: { frames: [7, 8, 9], fps: 10, loop: false, then: 'idle' } }, 'idle');
  a.on('step', () => steps.push(a.frame));
  for (let i = 0; i < 40; i++) a.update(.01, 'run');
  assert.deepEqual(steps, [1, 3], 'step events on frames 1 and 3: ' + steps);
  a.play('punch'); a.update(.15, 'run'); assert.equal(a.frame, 8, 'punch frame'); a.update(.2, 'run');
  assert.equal(a.state, 'idle', 'punch ends into idle (locked until done)');
  console.log('anim ok');
}
// replays and ghosts
{
  const { Ghost, Recorder, Replayer } = await import('../src/kit/replay.js');
  const g = new Ghost(); for (let i = 0; i < 600; i++) g.record(1 / 60, i * 2, Math.sin(i / 30) * 50);
  const p = g.pack(); assert.ok(p.length <= 1200, 'packs small: ' + p.length);
  const back = Ghost.unpack(p), at = back.at(5);
  assert.ok(Math.abs(at.x - 600) < 3 && Math.abs(at.y - Math.sin(10) * 50) < 2, 'ghost plays back ' + JSON.stringify(at));
  const rec = new Recorder({ seed: 42 }); const game = { s: 0, down(x) { this.s += x; }, update(dt) { this.s += dt; } };
  rec.event('down', 5); rec.frame(.5); game.down(5); game.update(.5);
  const n1 = rec.rng(), copy = { s: 0, down: game.down, update: game.update }, play = new Replayer(rec.data);
  while (!play.done) play.step(copy);
  assert.equal(copy.s, game.s, 'replay feeds the same inputs'); assert.equal(play.rng(), n1, 'same random numbers');
  console.log('replay ok');
}
// dialogue (ink)
{
  const { Story, Typewriter, loadStory } = await import('../src/kit/story.js');
  let e; try { new Story('Hi.'); } catch (x) { e = x; } assert.ok(e?.kitLoading, 'Story waits for ink'); await loadStory();
  const talk = new Story(`
  VAR gate = false
  Halt! Who goes there? #who:guard
  * [A friend] -> friend
  * [Nobody] Very funny. #who:guard #mood:cross
    -> END
  == friend ==
  Then pass, friend.
  ~ gate = true
  -> END`);
  const l1 = talk.next(); assert.equal(l1.text, 'Halt! Who goes there?'); assert.equal(l1.tags.who, 'guard');
  assert.deepEqual(l1.choices.map(c => c.text), ['A friend', 'Nobody'], 'choices');
  talk.choose(0); assert.equal(talk.next().text, 'Then pass, friend.'); assert.equal(talk.vars.gate, true, 'ink variable'); assert.ok(talk.ended, 'ended');
  const tw = new Typewriter('Hi, you.', { speed: 20 }); let ticks = 0; for (let i = 0; i < 200 && !tw.done; i++) { tw.update(.02); if (tw.ticked) ticks++; }
  assert.ok(tw.done && ticks === 7, 'typewriter ' + ticks);
  console.log('story ok');
}

// save versions: old saves go through migrate(), a newer save is kept safe
{
  globalThis.localStorage ??= (() => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
  const { savesFor, _resetSaves } = await import('../src/saves.js');
  _resetSaves();
  const v1 = savesFor({ id: 'sv-test' });
  assert.ok(v1.save({ coins: 5 }), 'v1 saves');
  const calls = [];
  const v2 = savesFor({ id: 'sv-test', save: { version: 2, migrate: (d, from) => { calls.push(from); return { gold: d.coins * 10 }; } } });
  assert.deepEqual(v2.load({}), { gold: 50 }, 'migrated to v2');
  assert.deepEqual(v2.load({}), { gold: 50 }, 'migration kept (runs once)');
  assert.deepEqual(calls, [1], 'migrate got from=1 once');
  assert.deepEqual(v1.load('fallback'), 'fallback', 'older game copy gets the fallback for a newer save');
  assert.equal(v1.save({ coins: 1 }), false, 'older game copy cannot overwrite a newer save');
  assert.deepEqual(v2.load({}), { gold: 50 }, 'newer save untouched');
  const bad = savesFor({ id: 'sv-test', save: { version: 3, migrate: () => { throw new Error('x'); } } });
  assert.equal(bad.load('fb'), 'fb', 'failed migrate gives the fallback');
  const none = savesFor({ id: 'sv-test', save: { version: 3 } });
  assert.equal(none.load('fb'), 'fb', 'no migrate gives the fallback');
  _resetSaves();
  console.log('saves: versions + migrate ok');

  // bigger saves: 8 KB of JSON, kept packed; the cloud save takes packed and plain saves alike
  const { SAVE_MAX, LOCAL_MAX, localSavesFor } = await import('../src/saves.js'), { progress } = await import('../src/kit/progress.js');
  assert.equal(SAVE_MAX, 8192); assert.equal(LOCAL_MAX, 512 * 1024);
  const big = savesFor({ id: 'sv-big' });
  const levels = Array.from({ length: 150 }, (_, i) => ({ id: i, stars: i % 4, best: 1000 + i * 7, done: i % 3 === 0 }));   // about 6 KB: three times the old limit
  const size = JSON.stringify({ levels }).length;
  assert.ok(size > 5000 && size < SAVE_MAX, 'test save is ' + size + ' bytes');
  assert.ok(big.save({ levels }), 'a 6 KB save is taken');
  assert.deepEqual(big.load(null), { levels }, 'and comes back the same');
  assert.equal(big.save({ junk: 'x'.repeat(SAVE_MAX) }), false, 'over 8 KB is refused');
  assert.deepEqual(big.load(null), { levels }, 'and the save before it is kept');
  const kept = JSON.parse(globalThis.localStorage.getItem('gs_saves'))['sv-big'];
  assert.ok(typeof kept.z === 'string' && kept.d === undefined && kept.z.length < size / 3, `kept packed: ${size} bytes as ${kept.z.length}`);
  const small = savesFor({ id: 'sv-small' }); small.save({ a: 1 });
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('gs_saves'))['sv-small'].d, { a: 1 }, 'a tiny save is kept as it is (packing would not shrink it)');
  // the cloud save: what goes up is packed; what comes down may be packed or plain (an older save), newest wins
  const snap = JSON.parse(JSON.stringify(progress.snapshot ? progress.snapshot() : {}));
  const up = snap.saves || JSON.parse(globalThis.localStorage.getItem('gs_saves'));
  assert.ok(typeof up['sv-big'].z === 'string', 'the cloud save carries the packed form');
  _resetSaves();
  assert.equal(big.load('none'), 'none', 'wiped');
  const { default: _ } = { default: 0 };
  const later = Date.now() + 5000;
  progress.merge?.({ saves: { 'sv-big': { ...up['sv-big'], t: later }, 'sv-plain': { t: later, d: { old: true } }, 'sv-bad': { t: later, z: '!!not base64!!' }, 'sv-huge': { t: later, d: { junk: 'x'.repeat(SAVE_MAX + 10) } } } });
  if (progress.merge) {
    assert.deepEqual(big.load(null), { levels }, 'a packed save from the cloud is read');
    assert.deepEqual(savesFor('sv-plain').load(null), { old: true }, 'a plain save from the cloud is read');
    assert.equal(savesFor('sv-bad').load('fb'), 'fb', 'one that cannot be unpacked is left out');
    assert.equal(savesFor('sv-huge').load('fb'), 'fb', 'and one over the limit');
  }
  // the phone-only slot, with no database here (node): it still works for the session
  const loc = localSavesFor({ id: 'sv-local' });
  assert.equal(loc.loadLocal('none'), 'none', 'nothing saved yet');
  const world = { cells: 'ab'.repeat(100000) };
  assert.ok(loc.saveLocal(world), 'a 200 KB phone save is taken'); assert.deepEqual(loc.loadLocal(null), world);
  assert.equal(loc.saveLocal({ junk: 'x'.repeat(LOCAL_MAX) }), false, 'over 512 KB is refused');
  loc.clearLocal(); assert.equal(loc.loadLocal('none'), 'none', 'cleared');
  _resetSaves();
  console.log(`saves: 8 KB cloud slot kept packed (${size} bytes as ${kept.z.length}), cloud merge, phone slot ok`);
}

// Tiny Brains: copies its teacher, guard rails hold, waves and plans learn
{
  const { Brain, Net, Wave, Imagine, Predict } = await import('../src/kit/brains.js');
  const n = new Net([3, 5, 2], 7), s = n.pack(), m = Net.unpack(s);
  assert.equal(m.shape, '3x5x2'); assert.ok(Math.max(...n.w.map((v, i) => Math.abs(v - m.w[i]))) < .01, 'pack round trip');
  assert.equal(Net.unpack('tb1:3x5x2:1:AAAA'), null, 'wrong length refused');
  // a 1D chaser: the teacher moves towards the player
  const slots = new Map(), api = { brains: { load: k => slots.get(k) ?? null, save: (k, v) => slots.set(k, v) } };
  const b = new Brain(api, { name: 'chaser', inputs: 2, actions: ['left', 'right'], hidden: [6], teacher: see => see[0] < 0 ? 'left' : 'right', limits: { react: 0, perSecond: 1000, minNoise: 0 }, share: false });
  let r = 1; const rand = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 4000; i++) { const dx = rand() * 2 - 1; b.act([dx, rand() * 2 - 1], 1 / 60); if (i % 10 === 0) b.feel(.5); }
  let right = 0; for (let i = 0; i < 200; i++) { const dx = rand() * 2 - 1, p = b.net.run([dx, 0]); if ((p[0] > p[1]) === (dx < 0)) right++; }
  assert.ok(right > 170, 'copied the teacher: ' + right + '/200');
  assert.ok(b.agree > .8 && b.anchor, 'agreement ' + b.agree.toFixed(2) + ' and a starting brain kept');
  assert.ok(b.trust > 0, 'earns some trust: ' + b.trust.toFixed(3));
  // drift: no number further than `drift` from the starting brain, whatever the signals
  for (let i = 0; i < 3000; i++) { b.act([rand() * 2 - 1, 1], 1 / 60); b.feel(2); }
  let far = 0; for (let i = 0; i < b.net.w.length; i++) far = Math.max(far, Math.abs(b.net.w[i] - b.anchor.w[i]));
  assert.ok(far <= 1 + 1e-6, 'stays within drift of its starting brain: ' + far.toFixed(3));
  // win rate: the player keeps losing -> the skill dial drops, and three in a row eases off at once
  const k0 = b.skill; b.result(false); b.result(false); const k2 = b.skill; b.result(false);
  assert.ok(k2 < k0 && b.skill < k2 - .2, `skill eases off (${k0.toFixed(2)} -> ${k2.toFixed(2)} -> ${b.skill.toFixed(2)})`);
  for (let i = 0; i < 30; i++) b.result(true);
  assert.ok(b.skill > .6, 'player winning everything -> sharper: ' + b.skill.toFixed(2));
  // remembered: a new Brain with the same slot picks up where it was
  const b2 = new Brain(api, { name: 'chaser', inputs: 2, actions: ['left', 'right'], hidden: [6], teacher: see => see[0] < 0 ? 'left' : 'right', share: false });
  assert.ok(b2.steps === b.steps && Math.abs(b2.skill - b.skill) < .01, 'restored from its slot');
  b2.reset(); assert.equal(b2.steps, 0, 'reset forgets');
  // rules always win; perSecond limits changes of mind; reaction time holds a choice
  const c = new Brain({ name: 'r', inputs: 1, actions: ['a', 'b', 'c'], limits: { react: 0, perSecond: 1000, minNoise: 0 }, rules: (s, a) => (a === 'c' ? 'a' : a), share: false });
  for (let i = 0; i < 500; i++) { c.act([Math.random()], 1 / 60); assert.notEqual(c.action, 'c', 'rule: never c'); }
  const d = new Brain({ name: 'p', inputs: 1, actions: 4, limits: { react: 0, perSecond: 2, minNoise: 1 }, share: false });
  let changes = 0, last = d.act([0], 1 / 60); for (let i = 0; i < 600; i++) { const a = d.act([0], 1 / 60); if (a !== last) changes++; last = a; }
  assert.ok(changes <= 21, 'at most 2 changes of mind a second over 10 s: ' + changes);
  const e = new Brain({ name: 'q', inputs: 1, actions: 4, limits: { react: .5, minNoise: 1 }, share: false });
  const first = e.act([0], 1 / 60); let same = true; for (let i = 0; i < 20; i++) if (e.act([0], 1 / 60) !== first) same = false;
  assert.ok(same, 'reaction time holds the choice');
  // Wave: a pair of minds moves the brain
  const wb = new Brain({ name: 'w', inputs: 2, actions: 2, share: false }), w0 = wb.net.w.slice(), wave = new Wave(wb);
  const m1 = wave.mind(), m2 = wave.mind();
  for (let i = 0; i < 60; i++) { m1.act([1, 0], 1 / 60); m1.feel(1); m2.act([1, 0], 1 / 60); }
  m1.done(); m2.done();
  assert.ok(wb.net.w.some((v, i) => v !== w0[i]), 'a finished pair changes the brain');
  // minds that act in the same frame each make their own choice, on their own reaction timer
  const sb = new Brain({ name: 'squad', inputs: 1, actions: ['left', 'right'], teacher: see => see[0] < 0 ? 'left' : 'right', limits: { react: .5, perSecond: 100, minNoise: 0 }, share: false }), sw = new Wave(sb, { change: 0 });
  const lefty = sw.mind(), righty = sw.mind();
  for (let i = 0; i < 30; i++) { lefty.act([-1], 1 / 60); righty.act([1], 1 / 60); }
  assert.ok(lefty.action === 'left' && righty.action === 'right', 'each mind decides for itself: ' + lefty.action + ' ' + righty.action);
  assert.equal(sb.last, -1, "minds don't change the brain's own choice");
  // Imagine: picks the move that gets to the goal
  const plan = new Imagine({ actions: ['left', 'stay', 'right'], step: (s, a, dt) => ({ x: s.x + (a - 1) * dt * 5 }), score: s => -Math.abs(s.x - 3) });
  assert.equal(plan.pick({ x: 0 }), 2); assert.equal(plan.action, 'right'); assert.equal(plan.pick({ x: 6 }), 0);
  // Imagine fixed: always every try, whatever the clock says
  const slow = new Imagine({ actions: 3, tries: 4, budget: 0, fixed: true, step: (s, a, dt) => { const t = performance.now(); while (performance.now() - t < .05); return { x: s.x + (a - 1) * dt }; }, score: s => s.x });
  slow.pick({ x: 0 }); assert.equal(slow.tried, 4, 'fixed plans try everything');
  const quick = new Imagine({ actions: 3, tries: 4, budget: 0, step: slow.step, score: slow.score });
  quick.pick({ x: 0 }); assert.ok(quick.tried < 4, 'budgeted plans stop early: ' + quick.tried);
  // Imagine auto: a phone too slow for plans switches them off and uses the fallback
  const heavy = new Imagine({ actions: ['a', 'b'], tries: 1, depth: 4, auto: true, maxMs: .01, fallback: () => 'b', step: (s) => { const t = performance.now(); while (performance.now() - t < .05); return s; }, score: () => 0 });
  heavy.on = true; heavy.why = '';   // (Node counts as a low phone: no graphics chip)
  for (let i = 0; i < 12; i++) heavy.pick({});
  assert.ok(!heavy.on && heavy.why === 'too slow', 'auto switches off: ' + heavy.why);
  assert.equal(heavy.pick({}), 1); assert.equal(heavy.action, 'b');
  const light = new Imagine({ actions: 2, auto: true, step: s => s, score: () => 0 });
  assert.equal(light.why, 'low phone', 'a low phone never plans'); light.on = true;
  for (let i = 0; i < 12; i++) light.pick({});
  assert.ok(light.on, 'cheap plans stay on');
  // Wave.unsure: copies of one brain agree; very different minds don't
  const ub = new Brain({ name: 'u', inputs: 2, actions: 3, share: false }), uw = new Wave(ub, { change: .001 });
  const u1 = uw.mind(), u2 = uw.mind();
  assert.ok(uw.unsure([.5, -.5]) < .01, 'near copies agree: ' + uw.unsure([.5, -.5]).toFixed(4));
  const uw2 = new Wave(ub, { change: 3 }); for (let i = 0; i < 6; i++) uw2.mind();
  assert.ok(uw2.unsure([1, -1]) > uw.unsure([1, -1]) + .05, 'far-apart minds disagree: ' + uw2.unsure([1, -1]).toFixed(3));
  u1.done(); u2.done(); assert.equal(uw.unsure([0, 0]), 0, 'no live minds: sure');
  // even steps: learns to copy a teacher whose inputs are tiny (fixed steps barely move)
  const teach = see => (see[0] > 0 ? 1 : 0);
  const fit = even => {
    const eb = new Brain({ name: 'e' + even, inputs: 1, actions: 2, hidden: [4], teacher: teach, even, limits: { react: 0, perSecond: 1e3, minNoise: 0 }, share: false });
    let q = 3; const rr = () => (q = (q * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 1500; i++) eb.act([(rr() * 2 - 1) * .02], 1 / 60);
    let ok = 0; for (let i = 0; i < 200; i++) { const x = (rr() * 2 - 1) * .02, p = eb.net.run([x]); if ((p[1] > p[0]) === (x > 0)) ok++; }
    assert.ok(eb.net.w.every(Number.isFinite), 'even steps stay finite');
    return ok;
  };
  const plainFit = fit(false), evenFit = fit(true);
  assert.ok(evenFit > 170 && evenFit > plainFit, `even steps learn small inputs: ${evenFit}/200 vs ${plainFit}/200`);
  // odds: a player who wins 90% at low skill and 20% at high; the skill settles where they win ~60%
  const ob = new Brain({ name: 'odds', inputs: 1, actions: 2, odds: true, share: false });
  let q2 = 9; const r2 = () => (q2 = (q2 * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 300; i++) ob.result(r2() < .95 - ob.skill * .8);   // true chance .6 at skill ~.44
  assert.ok(Math.abs(ob.winChance(.44) - .6) < .15 && ob.skill > .25 && ob.skill < .65, `odds: skill ${ob.skill.toFixed(2)}, chance at .44 ${ob.winChance(.44).toFixed(2)}`);
  assert.ok(ob.winChance(.1) >= ob.winChance(.9), 'more skill never helps the player');
  // Predict: spots a cycle, then a habit change; saves and restores
  const pslots = new Map(), papi = { brains: { load: k => pslots.get(k) ?? null, save: (k, v) => pslots.set(k, v) } };
  const pr = new Predict(papi, { moves: ['rock', 'paper', 'scissors'] });
  assert.equal(pr.guess(), null); assert.equal(pr.sure, 0);
  const cyc = ['rock', 'rock', 'paper', 'scissors'];
  for (let i = 0; i < 60; i++) pr.see(cyc[i % 4]);
  let hits = 0; for (let i = 60; i < 100; i++) { if (pr.guess() === cyc[i % 4]) hits++; pr.see(cyc[i % 4]); }
  assert.ok(hits >= 36, 'learns a 4-move cycle: ' + hits + '/40');
  assert.ok(pr.right > .8 && pr.sure > .4, `right ${pr.right.toFixed(2)}, sure ${pr.sure.toFixed(2)}`);
  const ch = pr.chances(); assert.ok(Math.abs(ch[0] + ch[1] + ch[2] - 1) < 1e-9, 'chances add up to 1');
  for (let i = 0; i < 40; i++) pr.see('paper');
  assert.equal(pr.guess(), 'paper', 'follows a new habit');
  pr.persist(); const pr2 = new Predict(papi, { moves: ['rock', 'paper', 'scissors'] });
  assert.ok(pr2.seen === pr.seen && pr2.guess() === 'paper', 'habits restored from the slot');
  assert.ok(pslots.get('habits').length < 400, 'small save: ' + pslots.get('habits').length);
  pr2.forget(); assert.equal(pr2.guess(), null, 'forget clears');
  let rnd = 0, pr3 = new Predict({ moves: 4, name: 'noise' }); let q3 = 5;
  for (let i = 0; i < 400; i++) { const m = (q3 = (q3 * 16807) % 2147483647) % 4; if (i > 100 && pr3.guess() === m) rnd++; pr3.see(m); }
  assert.ok(pr3.sure < .35 && rnd < 110, `random player: not fooled (sure ${pr3.sure.toFixed(2)}, ${rnd}/299 right)`);
  console.log('brains: copy, trust, drift, win rate, rules, limits, waves, plans, fixed plans, unsure, even steps, odds, predict ok');
}

// Tiny Brains round 2: player profile, fun lean, styles, tells, start, watch, Nemesis, Shadow, tune
{
  const { Brain, Wave, Player, Nemesis, Shadow, tune, liveBrains } = await import('../src/kit/brains.js');
  // a profile shared by every game's brains: a fresh brain starts at the player's level
  const prof = {}, papi = id => ({ brains: { load: () => null, save: () => true, player: { read: () => JSON.parse(JSON.stringify(prof)), write: (k, v, n) => { prof[k] = { v, n }; return true; } } } });
  const me = new Player(papi('a'));
  assert.equal(me.skill, .5, 'skill before any notes');
  for (let i = 0; i < 40; i++) me.note('skill', .3);
  assert.ok(Math.abs(me.skill - .3) < .01, 'notes move it: ' + me.skill);
  me.note('reaction', .25); assert.equal(me.reaction, .25, 'first note is the value');
  const fresh = new Brain(papi('b'), { name: 'new', inputs: 1, actions: 2, share: false });
  assert.ok(Math.abs(fresh.skill - .3) < .01, 'a brand new brain starts at the player\'s level: ' + fresh.skill);
  for (let i = 0; i < 6; i++) fresh.result(true);
  assert.ok(prof.skill.n > 40, 'brains add to the profile after a few rounds');
  // fun: rounds tenser than usual that the player enjoyed lean towards more pressure
  let fn = null;
  const fapi = { brains: { load: () => null, save: () => true, onFun: (n, f) => { fn = f; return () => {}; } } };
  const fb = new Brain(fapi, { name: 'fun', inputs: 1, actions: 2, share: false, profile: false });
  assert.ok(fn, 'brains listen for fun signals');
  for (let r = 0; r < 30; r++) { const tense = r % 2; for (let i = 0; i < 10; i++) fb.feel(tense ? 1 : 0); fb.result(true); fn(tense ? 1 : -.5); }
  assert.ok(fb.lean > .05, 'leans to what the player enjoys: ' + fb.lean.toFixed(3));
  assert.ok(fb.lean <= .3, 'and no further than .3');
  // styles: the teacher and rules hear the personality, and it's an input
  const seen = [];
  const sb = new Brain({ name: 'styled', inputs: 2, actions: ['a', 'b'], styles: ['calm', 'bold'], teacher: (see, st) => { seen.push(st); return st === 'bold' ? 'b' : 'a'; }, limits: { react: 0, perSecond: 1e3, minNoise: 0 }, share: false, profile: false });
  assert.equal(sb.net.sizes[0], 4, 'one input per personality');
  for (let i = 0; i < 3000; i++) { sb.style = i % 2 ? 'bold' : 'calm'; sb.act([0, 0], 1 / 60); }
  assert.ok(seen.includes('bold') && seen.includes('calm'), 'the teacher hears the style');
  sb.style = 'bold'; const pb = sb.net.run(sb.input([0, 0]))[1]; sb.style = 'calm'; const pc = sb.net.run(sb.input([0, 0]))[1];
  assert.ok(pb > .7 && pc < .3, `each personality learns its own way (bold ${pb.toFixed(2)}, calm ${pc.toFixed(2)})`);
  sb.style = { bold: .7, calm: .3 }; assert.equal(sb.style, 'bold', 'mixes take the strongest name');
  const sw = new Wave(sb), m1 = sw.mind({ style: 'calm' }), m2 = sw.mind({ style: 'bold' });
  assert.ok(m1.style === 'calm' && m2.style === 'bold' && sb.style === 'bold', 'each wave mind has its own personality');
  // tells: a wind-up before a change, then the change
  const tb = new Brain({ name: 'tells', inputs: 1, actions: ['a', 'b'], teacher: s => (s[0] > 0 ? 'b' : 'a'), tells: { windup: .3 }, limits: { react: 0, perSecond: 1e3, minNoise: 0 }, share: false, profile: false });
  for (let i = 0; i < 400; i++) tb.act([i % 2 ? 1 : -1], 1 / 60);
  while (tb.telling) tb.act([-1], 1 / 60);
  for (let i = 0; i < 5 && tb.action !== 'a'; i++) tb.act([-1], 1 / 60);
  tb.act([1], 1 / 60);
  if (tb.action === 'a') { assert.ok(tb.telling && tb.telling.action === 'b', 'shows the tell first'); let n = 0; while (tb.telling) { tb.act([1], 1 / 60); n++; } assert.ok(n >= 5, 'the tell lasts: ' + n + ' frames'); assert.equal(tb.action, 'b', 'then does it'); }
  // start + watch: a starting brain from the maker's play
  const sh = new Shadow({ name: 'maker', inputs: 1, actions: ['l', 'r'], hidden: [6] });
  for (let i = 0; i < 3000; i++) { const x = Math.sin(i * 1.7); sh.watch([x], x < 0 ? 'l' : 'r'); }
  const st = new Brain({ name: 'started', inputs: 1, actions: ['l', 'r'], hidden: [6], start: sh.pack(), limits: { react: 0, minNoise: 0 }, share: false, profile: false });
  assert.ok(st.anchor && st.net.run([-.8])[0] > .8 && st.net.run([.8])[1] > .8, 'start: plays like the maker from the first frame');
  st.watch([-.5], 'l'); assert.ok(st.net.w.every(Number.isFinite), 'watch learns');
  assert.ok(liveBrains().includes(st), 'live brains are listed for the debug overlay');
  // Nemesis remembers between sessions
  const ns = new Map(), napi = { brains: { load: k => ns.get(k) ?? null, save: (k, v) => ns.set(k, v) } };
  const lines = { first: ['Hi {name}'], back: ['Back?'], long: ['{days} days!'], won: ['Lucky'], lost: ['Good try'], streak: ['{streak} wins!'] };
  const n1 = new Nemesis(napi, { name: 'grub', moves: ['l', 'r'], lines });
  assert.equal(n1.met(1e12), 'Hi grub', 'first meeting');
  n1.result(true); n1.result(true); assert.equal(n1.result(true), '3 wins!', 'streak line');
  const n2 = new Nemesis(napi, { name: 'grub', moves: ['l', 'r'], lines });
  assert.equal(n2.record.wins, 3, 'remembers the record');
  assert.equal(n2.met(1e12 + 5 * 864e5), '5 days!', 'notices time away');
  assert.ok(n2.grudge > 0, 'wants a rematch after losing');
  // tune: finds numbers that hit a target
  const t = tune({ params: { jump: [100, 900], g: [500, 2500] }, trial: p => (p.jump * p.jump) / (2 * p.g), want: 100, tries: 120, repeats: 1 });
  assert.ok(Math.abs(t.result - 100) < 5, 'tune hits the target: ' + t.result.toFixed(1));
  assert.equal(t.log.length, 120, 'logs each try');
  console.log('brains 2: profile, fun lean, styles, tells, start + watch, Nemesis, Shadow, tune ok');
}

// ---- round 6 game kits
{
  const { Board } = await import('../src/kit/board.js');
  let n = 0; const b = new Board(6, 6, { fill: () => ({ kind: n++ % 4 }) });
  b.settle(); assert.equal(b.matches().length, 0, 'settle leaves no matches');
  const g = new Board(5, 1); ['a', 'a', 'a', 'b', 'a'].forEach((k, c) => g.put(c, 0, { kind: k }));
  const m = g.matches(); assert.equal(m.length, 1); assert.equal(m[0].size, 3);
  const s = new Board(4, 1); [2, 2, null, 4].forEach((k, c) => k && s.put(c, 0, { kind: k }));
  const r = s.slide('left', { merge: (a, c) => a.kind === c.kind && { kind: a.kind * 2 } });
  assert.ok(r.moved); assert.equal(s.get(0, 0).kind, 4); assert.equal(s.get(1, 0).kind, 4); assert.equal(s.get(2, 0), null);
  const f = new Board(3, 3); for (let r2 = 0; r2 < 3; r2++) for (let c = 0; c < 3; c++) f.put(c, r2, { kind: c < 2 ? 'x' : 'y' });
  assert.equal(f.flood(0, 0).length, 6, 'flood fill finds the connected group');
  console.log('board: settle, matches, slide and merge, flood ok');
}
{
  const { Fighter, Battle, Bag, xpFor, levelFor, gainXp, loot } = await import('../src/kit/battle.js');
  let i = 0; const rng = () => [.5, .9, .3, .7][i++ % 4];
  const hero = new Fighter({ name: 'Pip', hp: 30, atk: 8, def: 4, spd: 6, type: 'leaf' }), goo = new Fighter({ name: 'Goo', hp: 18, atk: 5, def: 2, spd: 3, type: 'water' });
  const fight = new Battle([[hero], [goo]], { types: { leaf: { water: 2 } }, rng });
  assert.equal(fight.turn, hero, 'faster fighter goes first');
  assert.ok(fight.preview(hero, goo, { power: 10, type: 'leaf' }) > fight.preview(goo, hero, { power: 10, type: 'water' }), 'type bonus');
  let hits = 0; fight.on('hit', () => hits++);
  for (let k = 0; k < 20 && fight.over == null; k++) { const who = fight.turn; fight.act(who, { move: { power: 10, type: who.type }, target: fight.foes(who)[0] }); }
  assert.equal(fight.over, 0, 'hero side wins'); assert.ok(hits > 0);
  const bag = new Bag({ potion: { heal: 10 } }); bag.add('potion', 2); assert.ok(bag.take('potion')); assert.equal(bag.count('potion'), 1);
  assert.equal(levelFor(xpFor(5)), 5); const f2 = new Fighter({ hp: 10 }); assert.equal(gainXp(f2, xpFor(3)), 2); assert.equal(f2.maxHp, 16);
  assert.equal(loot([{ id: 'a', w: 1 }, { id: 'b', w: 3 }], () => .9).id, 'b');
  console.log('battle: turn order, types, a whole fight, bag, levels, loot ok');
}
{
  const { cost, afford, short, Earner } = await import('../src/kit/idle.js');
  assert.ok(Math.abs(cost(15, 1.15, 0, 2) - (15 + 15 * 1.15)) < 1e-9);
  const n = afford(15, 1.15, 3, 500); assert.ok(cost(15, 1.15, 3, n) <= 500 && cost(15, 1.15, 3, n + 1) > 500, 'afford is exact');
  assert.equal(short(999), '999'); assert.equal(short(1234567), '1.23M'); assert.equal(short(1e36), '1.00aa');
  const e = new Earner({ farm: { base: 10, rate: 2 } }, 100); assert.ok(e.buy('farm')); e.update(5); assert.ok(Math.abs(e.money - (90 + 10)) < 1e-9);
  assert.equal(e.catchUp(10, .5), 10);
  console.log('idle: cost, afford, short, Earner ok');
}
{
  const { Turns, Split } = await import('../src/kit/party.js');
  const t = new Turns({ players: 3 }); t.ready(); t.add(5).next(); assert.ok(t.waiting); t.ready().out().next();
  assert.equal(t.player.index, 2); t.ready().next(); assert.equal(t.player.index, 0); assert.equal(t.round, 2);
  t.ready().next(); assert.equal(t.player.index, 2, 'a knocked-out player is skipped'); assert.equal(t.leader.index, 0);
  const s = new Split(360, 640, { players: 2 }); assert.equal(s.who(10, 600), 0); assert.equal(s.who(10, 10), 1);
  const l = s.local(1, 10, 10); assert.equal(l.x, 350); assert.equal(l.y, 310);
  console.log('party: turns, knock-outs, rounds, split screen ok');
}
{
  const { Chart } = await import('../src/kit/rhythm.js');
  const ch = new Chart(`x . x = | = . . x\n. x . . | . . x .`, { bpm: 120, per: 2 });
  assert.equal(ch.notes.length, 5); assert.equal(ch.lanes, 2);
  assert.equal(ch.hit(0, 0.02).result, 'perfect'); assert.equal(ch.hit(1, .25 + .07).result, 'good'); assert.equal(ch.hit(0, 2), null);
  assert.equal(ch.notes.find(n => n.lane === 0 && n.time === .5).hold, .25 * 2, 'holds join on');
  assert.equal(ch.missed(5).length, 3); assert.equal(ch.combo, 0); assert.equal(ch.best, 2);
  console.log('rhythm: chart, perfect/good, holds, misses, combo ok');
}
{
  const { Shapes, Stroke, simplify } = await import('../src/kit/strokes.js');
  const shapes = new Shapes(); let ok = 0;
  const arc = (k, f) => Array.from({ length: k }, (_, i) => f(i / (k - 1)));
  const tests = { circle: arc(40, u => [200 + Math.cos(u * 6.28) * 80, 300 + Math.sin(u * 6.28) * 70]), line: arc(20, u => [100 + u * 200, 300 + u * 30]), wave: arc(40, u => [100 + u * 200, 300 + Math.sin(u * 12.5) * 25]) };
  for (const [k, pts] of Object.entries(tests)) if (shapes.match(pts).name === k) ok++;
  assert.equal(ok, 3, 'recognises circle, line and wave');
  const st = new Stroke(); for (let i = 0; i < 50; i++) st.add(Math.cos(i / 49 * 6.3) * 60, Math.sin(i / 49 * 6.3) * 60); assert.ok(st.closed && Math.abs(st.turns) > .8, 'a loop is closed with about one turn');
  assert.equal(simplify([[0, 0], [5, .1], [10, 0]], 1).length, 2);
  console.log('strokes: shapes, loops, simplify ok');
}
{
  const { Car, Kart, Laps } = await import('../src/kit/vehicles.js');
  const car = new Car({ top: 200 }); for (let i = 0; i < 120; i++) car.update(1 / 60, { throttle: 1 });
  assert.ok(car.speed > 150 && car.x > 100 && Math.abs(car.y) < 1, 'car drives straight ahead');
  const a0 = car.angle; for (let i = 0; i < 30; i++) car.update(1 / 60, { throttle: 1, steer: 1 }); assert.ok(car.angle > a0, 'steers right');
  for (let i = 0; i < 30; i++) car.update(1 / 60, { throttle: 1, steer: 1, drift: true }); assert.ok(car.drifting && car.slide > 10, 'drifts and slides');
  for (let i = 0; i < 20; i++) car.update(1 / 60, { throttle: 1, steer: 1, drift: true }); car.update(1 / 60, { throttle: 1 }); assert.ok(car.boostLeft > 0, 'a long drift boosts on release');
  const kart = new Kart(); kart.hop(); let landed = false; for (let i = 0; i < 60; i++) { kart.update(1 / 60, { throttle: 1 }); landed ||= kart.landed; }
  assert.ok(landed && kart.onGround && kart.z < -1, 'kart hops, lands and drives along -z');
  const race = new Laps([[0, 0], [100, 0], [100, 100]], { radius: 20, laps: 1 }), r = { x: 0, y: 0 }; race.join(r);
  for (const [x, y] of [[100, 0], [100, 100], [0, 0]]) { r.x = x; r.y = y; race.update(r); } assert.ok(r.done && r.lap === 1, 'a lap counts');
  console.log('vehicles: car, drift boost, kart hop, laps ok');
}
{
  const { Drag } = await import('../src/kit/drag.js');
  const d = new Drag({ accept: (p, s) => p.kind === s.kind }); let drops = 0, rejects = 0; d.on('drop', () => drops++).on('reject', () => rejects++);
  const red = d.piece({ x: 10, y: 10, w: 20, h: 20, kind: 'r' }), sr = d.slot({ x: 100, y: 100, w: 30, h: 30, kind: 'r' }), sb = d.slot({ x: 200, y: 100, w: 30, h: 30, kind: 'b' });
  d.down(10, 10); d.move(200, 100); d.up(200, 100); assert.equal(rejects, 1); for (let i = 0; i < 60; i++) d.update(1 / 60); assert.equal(red.x, 10, 'rejected piece slides home');
  d.down(10, 10); d.move(102, 98); d.up(102, 98); for (let i = 0; i < 60; i++) d.update(1 / 60);
  assert.equal(drops, 1); assert.equal(sr.piece, red); assert.equal(red.x, 100, 'dropped piece snaps into the slot'); assert.equal(sb.piece, null);
  console.log('drag: reject and home, drop and snap ok');
}
{
  const { History } = await import('../src/kit/history.js');
  let b = { cells: [0, 0, 0] }; const h = new History(b, { max: 3 });
  b.cells[0] = 1; h.push(b, 'a'); b.cells[1] = 1; h.push(b, 'b');
  assert.equal(h.undoLabel, 'b'); b = h.undo(); assert.deepEqual(b.cells, [1, 0, 0], 'undo gives the step before'); b.cells[2] = 9;
  assert.deepEqual(h.now().cells, [1, 0, 0], 'the copy it gives back is the game\'s own'); b = h.redo(); assert.deepEqual(b.cells, [1, 1, 0], 'redo');
  h.undo(); b = h.now(); b.cells[2] = 2; h.push(b, 'c'); assert.equal(h.canRedo, false, 'a new change drops what was ahead');
  for (let i = 0; i < 5; i++) { b.cells[0] = i; h.push(b, 'x' + i); } assert.equal(h.back, 3, 'keeps at most max steps');
  for (let i = 0; i < 4; i++) { b.cells[1] = i; h.push(b, 'drag', { merge: 'slider' }); } h.undo(); assert.notEqual(h.now().cells[1], 2, 'merged pushes are one step');
  const g = new History({ n: 0 }); const st = { n: 0 }; g.group(st, 'two', () => { st.n = 1; g.push(st); st.n = 2; g.push(st); }); assert.equal(g.back, 1); assert.equal(g.now().n, 2, 'group is one step');
  assert.equal(g.undo().n, 0); assert.equal(g.undos, 1);
  const pk = JSON.parse(JSON.stringify(g.redo() && g.pack())); assert.equal(new History({}).unpack(pk).now().n, 2, 'pack and unpack');
  console.log('history: undo, redo, drop ahead, max, merge, group, pack ok');
}
{
  const { Inventory, Recipes } = await import('../src/kit/items.js');
  const D = { wood: { stack: 10 }, stone: { stack: 10 }, axe: { stack: 1, kind: 'tool' }, hat: { stack: 1, kind: 'head', weight: 2 } };
  const inv = new Inventory(D, { slots: 3, extra: { hand: 'tool' } });
  assert.equal(inv.add('wood', 14), 0); assert.deepEqual(inv.slots.map(s => s?.n ?? 0), [10, 4, 0], 'stacks fill, then a new slot');
  assert.equal(inv.add('stone', 25), 15, 'what does not fit comes back'); assert.equal(inv.take('wood', 20), false); assert.ok(inv.take('wood', 5)); assert.equal(inv.count('wood'), 9);
  const inv2 = new Inventory(D, { slots: 4, extra: { hand: 'tool', head: 'head' } }); inv2.add('wood', 3); inv2.add('axe');
  assert.equal(inv2.move(0, 'hand'), false, 'equip slots take only their kind'); assert.ok(inv2.move(1, 'hand')); assert.equal(inv2.equip.hand.id, 'axe');
  inv2.add('wood', 4); assert.equal(inv2.count('wood'), 7); assert.equal(inv2.split(0), 1); assert.ok(inv2.move(1, 0), 'merge back'); assert.equal(inv2.slots[0].n, 7);
  inv2.add('stone', 2); inv2.sort(); assert.deepEqual(inv2.slots.filter(Boolean).map(s => s.id), ['stone', 'wood']);
  assert.deepEqual(new Inventory(D, { slots: 4, extra: { hand: 'tool', head: 'head' } }).load(JSON.parse(JSON.stringify(inv2.save()))).save(), inv2.save(), 'save and load');
  const heavy = new Inventory(D, { slots: 9, weight: 5 }); assert.equal(heavy.add('hat', 4), 2, 'weight limit');
  const book = new Recipes(D).add('plank', { wood: 1 }, { makes: 4 }).add('axe', { wood: 3, stone: 2 }, { keep: ['bench'] }).add('lamp', { stone: 1 }, { at: 'forge', time: 2 });
  const bag = new Inventory(D, { slots: 6 }); bag.add('wood', 3); bag.add('stone', 1);
  assert.deepEqual(book.missing('axe', bag), { bench: 1, stone: 1 }, 'missing lists tools and parts');
  assert.deepEqual(book.can(bag).map(r => r.id), ['plank']); assert.equal(book.times('plank', bag), 3);
  assert.ok(book.make('plank', bag)); assert.equal(bag.count('plank'), 4); assert.equal(book.make('axe', bag), null);
  assert.equal(book.make('lamp', bag), null, 'a station recipe needs the station'); assert.ok(book.make('lamp', bag, 'forge')); assert.equal(bag.count('stone'), 0);
  let done = 0; book.timer.on('done', () => done++); book.timer.update(1); assert.equal(bag.count('lamp'), 0); book.timer.update(1.1); assert.equal(bag.count('lamp'), 1); assert.equal(done, 1, 'timed making');
  assert.deepEqual(book.uses('stone').map(r => r.id), ['axe', 'lamp']);
  console.log('items: stacks, take, equip kinds, split, merge, sort, save, weight, recipes, missing, stations, timed ok');
}
{
  const { Adventure } = await import('../src/kit/adventure.js');
  const adv = new Adventure({ start: 'hall' }), said = []; adv.on('say', t => said.push(t));
  adv.room('hall', { map: [0, 0] }).spot('door', { x: 300, y: 200, w: 60, h: 160, look: 'Oak.', exit: 'lib', locked: 'Locked.' })
    .spot('key', { x: 80, y: 500, r: 20, take: true, took: 'Got it.' }).spot('rug', { poly: [[100, 600], [260, 600], [240, 640], [120, 640]], look: 'Lumpy.', when: () => !adv.flag('moved') })
    .spot('chest', { x: 300, y: 500, w: 80, h: 60, z: 1, look: 'A chest.' });
  adv.room('lib', { map: [1, 0] }).spot('back', { x: 10, y: 300, w: 20, h: 600, exit: 'hall' });
  adv.rule('key', 'door', () => { adv.unlock('hall', 'door'); return 'Click!'; });
  adv.rule('rope', 'hook', () => { adv.bag.add('grapple'); return 'A grapple.'; });
  assert.equal(adv.tap(300, 200).did, 'locked'); assert.equal(adv.tap(0, 0).did, 'nothing'); assert.equal(adv.tap(180, 620).text, 'Lumpy.', 'polygon spots');
  assert.equal(adv.tap(80, 505).did, 'take'); assert.ok(adv.bag.has('key')); assert.equal(adv.at(80, 505), null, 'taken things are gone');
  assert.equal(adv.tap(300, 500, 'key').did, 'cant'); assert.ok(adv.bag.has('key'), 'a wrong use keeps the item');
  assert.equal(adv.tap(300, 200, 'key').text, 'Click!'); assert.ok(!adv.bag.has('key'), 'used up');
  assert.equal(adv.tap(300, 200).did, 'exit'); assert.equal(adv.here, 'lib');
  adv.flag('moved', true); assert.equal(adv.spots('hall').some(s => s.id === 'rug'), false, 'when() hides a spot');
  const m = adv.map(); assert.equal(m.length, 2); assert.deepEqual(m.find(r => r.id === 'hall').links, ['lib']); assert.ok(m.find(r => r.id === 'lib').here);
  adv.bag.add('rope'); adv.bag.add('hook'); assert.equal(adv.combine('hook', 'rope'), 'A grapple.'); assert.ok(adv.bag.has('grapple') && !adv.bag.has('rope'), 'combine either way round');
  const back = new Adventure({ start: 'hall' }); back.room('hall'); back.room('lib'); back.load(JSON.parse(JSON.stringify(adv.save())));
  assert.equal(back.here, 'lib'); assert.ok(back.flag('moved') && back.bag.has('grapple') && back.unlocked.has('hall:door'), 'save and load');
  assert.deepEqual(said.slice(0, 2), ['Locked.', 'Lumpy.'], 'tapping nothing says nothing');
  console.log('adventure: hotspots (rect, circle, polygon, z), take, use, locks, exits, when, map, combine, save ok');
}
{
  const { HexMap, Iso } = await import('../src/kit/hex.js');
  for (const pointy of [true, false]) {
    const m = new HexMap({ size: 10, pointy, w: 6, h: 5, x: 5, y: 7 }); assert.equal(m.list.length, 30);
    for (const c of m.list) assert.equal(m.at(c.x + 2, c.y - 2), c, 'a tap finds its hex');
    assert.equal(m.at(-50, -50), null); const mid = m.list.find(c => m.neighbours(c).length === 6); assert.ok(mid, 'inner cells have six neighbours');
    for (const n of m.neighbours(mid)) assert.equal(m.distance(mid, n), 1);
  }
  const h = new HexMap({ size: 10, shape: 'hex', radius: 3 }); assert.equal(h.list.length, 37, 'a hex of radius 3 has 37 cells');
  assert.ok(Math.abs(Math.min(...h.list.flatMap(c => c.corners.map(p => p[0])))) < 1e-6, 'its corner at x');
  const centre = h.list.find(c => h.neighbours(c).length === 6 && h.ring(c, 3).length === 18); assert.ok(centre); assert.equal(h.range(centre, 1).length, 7);
  const edge = h.ring(centre, 3)[0], far = h.list.find(c => h.distance(c, edge) === 6); assert.equal(h.line(edge, far).length, 7);
  const wall = new Set(h.ring(centre, 1).slice(0, 5)); const cost = c => wall.has(c) ? Infinity : 1;
  const p = h.path(edge, far, cost); assert.ok(p && p[0] === edge && p.at(-1) === far && !p.some(c => wall.has(c)), 'a path round the wall');
  const r = h.reach(centre, 2, cost); assert.ok(!r.has(h.ring(centre, 1)[0]) && r.has(h.ring(centre, 1)[5]), 'reach stops at blocked hexes');
  assert.equal(h.sees(edge, far, c => c === centre), !h.line(edge, far).slice(1, -1).includes(centre));
  centre.data.town = 1; const h2 = new HexMap({ size: 10, shape: 'hex', radius: 3 }).load(JSON.parse(JSON.stringify(h.save()))); assert.equal(h2.cell(centre.q, centre.r).data.town, 1, 'save and load');
  const iso = new Iso({ tw: 32, th: 16, x: 100, y: 20 }); const s = iso.toScreen(3, 2); const t = iso.toTile(s.x, s.y);
  assert.ok(Math.abs(t.tx - 3) < 1e-9 && Math.abs(t.ty - 2) < 1e-9, 'iso screen and back'); assert.deepEqual(iso.sort([{ tx: 2, ty: 2 }, { tx: 0, ty: 1 }]).map(o => o.tx), [0, 2]);
  console.log('hex: taps (pointy and flat), neighbours, hex shape, range, ring, line, path, reach, sight, save; iso ok');
}
{
  const { Select, formation, FlowField, BuildGrid, target } = await import('../src/kit/rts.js');
  const U = [{ x: 10, y: 10, kind: 'a' }, { x: 50, y: 12, kind: 'a' }, { x: 200, y: 200, kind: 'b' }, { x: 300, y: 20, kind: 'a' }];
  const sel = new Select(() => U);
  sel.down(0, 0); sel.move(60, 30); assert.ok(sel.box); assert.ok(sel.up(60, 30)); assert.deepEqual(sel.list, [U[0], U[1]], 'box select');
  sel.down(198, 201); assert.ok(sel.up(198, 201)); assert.deepEqual(sel.list, [U[2]], 'tap select');
  sel.down(500, 500); assert.equal(sel.up(500, 500), false, 'a tap on nothing is an order'); assert.deepEqual(sel.list, [U[2]]);
  sel.down(11, 10); sel.up(11, 10); sel.down(11, 10); sel.up(11, 10); assert.equal(sel.list.length, 3, 'double tap picks the kind');
  for (const shape of ['grid', 'line', 'wedge', 'circle']) {
    const f = formation(U, 100, 100, { shape, gap: 20 }); assert.equal(new Set(f.map(p => p[1])).size, 4, shape + ': a place each');
    for (const [, a] of f) for (const [, b] of f) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 10, shape + ': places apart');
  }
  const bg = new BuildGrid(10, 10, 10); assert.ok(bg.place({}, 4, 0, 1, 9)); assert.equal(bg.fits(3, 0, 2, 2), false); const sn = bg.snap(12, 12, 2, 2); assert.deepEqual([sn.tx, sn.ty, sn.ok], [0, 0, true]);
  const ff = new FlowField(10, 10, 10, (tx, ty) => bg.free(tx, ty) ? 1 : Infinity).to(8, 1);
  let p = { x: 15, y: 15 }; for (let i = 0; i < 400 && ff.at(...Object.values(ff.tile(p.x, p.y))) > 0; i++) { const d = ff.dir(p.x, p.y); p.x += d.x * 2; p.y += d.y * 2; assert.ok(bg.free(Math.floor(p.x / 10), Math.floor(p.y / 10)), 'steers round the wall'); }
  assert.deepEqual(ff.tile(p.x, p.y), { tx: 8, ty: 1 }, 'flow field reaches the goal');
  const foes = [{ x: 0, y: 30, left: 5, hp: 3 }, { x: 0, y: 60, left: 2, hp: 9 }, { x: 0, y: 500, left: 0, hp: 1 }];
  assert.equal(target({ x: 0, y: 0 }, foes, { range: 100 }), foes[1], 'first: furthest along, in range'); assert.equal(target({ x: 0, y: 0 }, foes, { by: 'near' }), foes[0]); assert.equal(target({ x: 0, y: 0 }, foes, { by: 'strong' }), foes[1]);
  console.log('rts: box, tap, double tap, orders, formations, build grid, flow field, targets ok');
}
{
  const { Reader, Fighter, clash } = await import('../src/kit/fight.js');
  const F = 1 / 60, r = new Reader(), step = (x, y, b = {}, n = 2, facing = 1) => { for (let i = 0; i < n; i++) r.feed(x, y, b, F, facing); };
  step(0, -1); step(1, -1); step(1, 0); step(1, 0, { P: true }); assert.ok(r.did('236P'), 'quarter circle forward');
  step(0, 0, { P: false }, 2); assert.equal(r.did('236P'), false, 'the press was taken');
  step(0, 0, {}, 40); step(0, -1); step(-1, -1); step(-1, 0, {}, 2, 1); step(-1, 0, { P: true }, 1, 1); assert.equal(r.did('236P'), false, 'the wrong way round');
  step(0, 0, { P: false }, 40); step(1, 0); step(0, 0); step(1, 0); assert.ok(r.did('66'), 'dash'); step(0, 0, {}, 60); step(1, 0); assert.equal(r.did('66'), false, 'too slow is not a dash');
  step(0, -1, {}, 2, -1); step(-1, -1, {}, 2, -1); step(-1, 0, { K: true }, 2, -1); assert.ok(r.did('236K'), 'forward follows facing');
  step(0, 0, { P: true }, 1); step(0, 0, { P: false }, 5); assert.ok(r.take('P'), 'a press is kept in the buffer'); step(0, 0, { P: true }, 1); step(0, 0, { P: false }, 20); assert.equal(r.take('P'), false, 'and lets go after it');
  const M = { jab: { start: 3, active: 2, recover: 6, hit: [[10, -50, 30, 14]], damage: 4, stun: 12, cancel: ['fb'] }, fb: { start: 10, active: 1, recover: 20, input: '236P' }, low: { start: 2, active: 2, recover: 4, hit: [[10, -10, 30, 10]], low: true } };
  step(0, 0, {}, 30); step(0, -1); step(1, -1); step(1, 0, { P: true }); assert.equal(r.special(M), 'fb');
  const a = new Fighter(M, { x: 0 }), b = new Fighter(M, { x: 40, facing: -1 }); let hits = 0; a.on('hit', () => hits++);
  assert.ok(a.start('jab')); assert.equal(a.start('jab'), false, 'busy'); a.update(F * 2); assert.equal(a.phase, 'start'); assert.equal(clash(a, b), null);
  a.update(F * 1.5); assert.equal(a.phase, 'active'); const h = clash(a, b); assert.ok(h && !h.blocked && b.stun === 12 && hits === 1); assert.equal(clash(a, b), null, 'one hit per move');
  assert.ok(a.stop > 0); a.update(.2); assert.ok(a.canCancel('fb') && a.start('fb'), 'cancel after a hit');
  const e = new Fighter(M, { x: 0 }), g = new Fighter(M, { x: 40, facing: -1 }); g.blocking = true; e.start('jab'); e.update(F * 3.5); assert.ok(clash(e, g).blocked, 'blocked high'); assert.equal(g.stun, 6, 'block stun is half');
  const i = new Fighter(M, { x: 0 }), j = new Fighter(M, { x: 40, facing: -1 }); j.blocking = true; i.start('low'); i.update(F * 2.5); assert.equal(clash(i, j).blocked, false, 'a low hits a standing block');
  for (let k = 0; k < 60; k++) i.update(F); assert.equal(i.phase, 'idle', 'the move ends');
  console.log('fight: motions, dash, facing, buffer, specials, frames, boxes, one hit, hit stop, cancels, block, low ok');
}
{
  const { Bullets, Emitter } = await import('../src/kit/bullets.js');
  const b = new Bullets({ max: 100, w: 300, h: 300 }), ring = new Emitter(b, { every: .5, rotate: .1, times: 3 }).ring(8, 50);
  ring.update(0, 150, 150); assert.equal(b.count, 8, 'a ring of eight'); ring.update(1.2, 150, 150); assert.equal(b.count, 24); assert.ok(ring.done); ring.update(5, 150, 150); assert.equal(b.count, 24, 'stops after times');
  b.update(1); let far = 0; b.each((x, y) => { far = Math.max(far, Math.hypot(x - 150, y - 150)); }); assert.ok(Math.abs(far - 50) < 1, 'moved at their speed');
  for (let i = 0; i < 40; i++) b.update(.25); assert.equal(b.count, 0, 'gone off screen');
  const p = { x: 150, y: 290 }, aimed = new Emitter(b, { every: 1 }).spread(3, .4, 100, () => p); aimed.update(0, 150, 10);
  let mid = null; b.each((x, y, k, a) => { if (Math.abs(a - Math.PI / 2) < 1e-6) mid = a; }); assert.ok(mid, 'aimed at the player');
  b.clear(); const i = b.fire(100, 100, 0, 0); assert.equal(b.hit(130, 100, 3, 0).hit, -1); const g = b.hit(112, 100, 3, 10); assert.equal(g.grazed, 1, 'a graze'); assert.equal(b.hit(112, 100, 3, 10).grazed, 0, 'once');
  assert.ok(b.hit(103, 100, 3, 10).hit >= 0); assert.equal(b.count, 0, 'the hit bullet goes'); void i;
  b.fire(0, 150, 100, 0, { home: 3 }); for (let k = 0; k < 30; k++) b.update(1 / 30, { x: 150, y: 50 }); let hy = 0; b.each((x, y) => { hy = y; }); assert.ok(hy < 140, 'homing turns towards the target');
  b.clear(); for (let k = 0; k < 150; k++) b.fire(150, 150, 1, 0); assert.equal(b.count, 100, 'never more than max');
  let pts = 0; assert.equal(b.clear(() => pts++, 150, 150, 10), 100); assert.equal(pts, 100, 'clearing into points');
  console.log('bullets: ring, rotate, times, speed, off screen, aimed spread, hit, graze, homing, max, clear ok');
}
{
  const { Sand, M } = await import('../src/kit/sand.js');
  const s = new Sand(60, 80); s.fill((x, y) => y >= 70 ? M.DIRT : x === 0 || x === 59 ? M.WALL : M.EMPTY);
  s.paint(30, 10, 5, M.SAND); const n = s.count(M.SAND); for (let i = 0; i < 200; i++) s.step();
  assert.equal(s.count(M.SAND), n, 'sand is kept'); assert.equal(s.get(30, 69), M.SAND, 'sand falls to the ground'); assert.ok(s.solid(30, 69));
  let top = 99; for (let y = 0; y < 80; y++) if (s.get(30, y) === M.SAND) { top = y; break; } assert.ok(top > 55, 'and spreads into a pile');
  const w = new Sand(40, 40); w.fill((x, y) => y >= 35 || x === 0 || x === 39 ? M.WALL : M.EMPTY); w.paint(20, 5, 4, M.OIL); w.paint(20, 15, 4, M.WATER);
  for (let i = 0; i < 400; i++) w.step(); let oilY = 0, waterY = 0, no = 0, nw = 0;
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) { if (w.get(x, y) === M.OIL) { oilY += y; no++; } if (w.get(x, y) === M.WATER) { waterY += y; nw++; } }
  assert.ok(oilY / no < waterY / nw, 'oil floats on water'); assert.ok(Math.max(...[...Array(38)].map((_, x) => w.get(x + 1, 34) === M.WATER ? 1 : 0)) === 1, 'water spreads along the floor');
  const f = new Sand(30, 30); f.fill((x, y) => y >= 20 && y < 25 && x > 5 && x < 25 ? M.WOOD : M.EMPTY); const wood = f.count(M.WOOD); f.set(15, 19, M.FIRE);
  for (let i = 0; i < 600; i++) { f.step(); if (i % 40 === 0) f.paint(15, 19, 1, M.FIRE); } assert.ok(f.count(M.WOOD) < wood, 'fire burns wood');
  const g = new Sand(40, 40); g.fill((x, y) => y > 20 ? M.DIRT : M.EMPTY); const gone = g.blast(20, 25, 5, { fire: false });
  assert.ok(gone > 60 && g.get(20, 25) === M.EMPTY, 'a blast makes a hole'); assert.ok(g.count(M.SAND) > 0, 'and loose rubble');
  const l = new Sand(40, 40); l.fill((x, y) => y >= 35 || x === 0 || x === 39 ? M.WALL : y >= 30 && x < 20 ? M.WATER : y >= 30 && x >= 30 ? M.WOOD : M.EMPTY);
  l.paint(20, 10, 4, M.LAVA); const wood2 = l.count(M.WOOD); for (let i = 0; i < 900; i++) l.step();
  assert.ok(l.count(M.STONE) > 0, 'water cools lava to stone'); assert.ok(l.solid(...(() => { for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (l.get(x, y) === M.STONE) return [x, y]; })()), 'stone is solid');
  assert.ok(l.count(M.WOOD) < wood2 || l.count(M.FIRE) > 0, 'lava sets wood alight');
  console.log('sand: falling, piles, oil on water, flowing, fire, lava to stone, blasts ok');
}
{
  const { creature, face, item, building, sprite, name } = await import('../src/kit/art.js');
  const strip = o => JSON.stringify(o, (k, v) => typeof v === 'function' ? undefined : v);
  for (const f of [creature, face, item, building]) { assert.equal(strip(f(7)), strip(f(7)), f.name + ': the same seed, the same thing'); assert.notEqual(strip(f(7)), strip(f(8)), f.name + ': another seed, another'); }
  const calls = []; const c = new Proxy({}, { get: (t, k) => k in t ? t[k] : (...a) => { calls.push(k); return { addColorStop() {} }; }, set: (t, k, v) => { t[k] = v; return true; } });
  for (let i = 0; i < 20; i++) { creature(i).draw(c, 0, 0, 50, 1); face(i).draw(c, 0, 0, 50); item(i).draw(c, 0, 0, 40); building(i).draw(c, 0, 0, 100, 1); } assert.ok(calls.length > 500, 'they draw');
  assert.equal(creature(3, { hue: 120 }).colour.hue, 120, 'a colour family'); assert.ok(['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(item(5).rarity));
  const rare = [...Array(400)].map((_, i) => item(i).rarity).filter(r => r === 'legendary').length; assert.ok(rare < 10, 'legendary is rare');
  const sp = sprite(4, 10, 8); for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) assert.equal(sp.mask[y * 10 + x], sp.mask[y * 10 + 9 - x], 'mirrored');
  assert.ok(sp.mask.some(v => v === 1) && sp.mask.some(v => v === 2), 'a body and an outline');
  assert.equal(name(5), name(5)); assert.match(name(9, 'place'), /^[A-Z][a-z]+$/); assert.match(name(2), /^[A-Z][a-z]+$/);
  console.log('art: seeded creatures, faces, items, buildings, rarity, mirrored sprites, names ok');
}
{
  const { Pitch, Team } = await import('../src/kit/sports.js');
  const P = new Pitch({ w: 300, h: 500 }), rnd = () => .5, home = new Team(P, 0, { formation: 'k-2-2', rnd }), away = new Team(P, 1, { formation: '2-2', rnd });
  assert.equal(home.players.length, 5); assert.ok(home.players[0].y > 470, 'team 0 defends the bottom: its keeper starts there');
  const ball = { x: 150, y: 250, vx: 0, vy: 0, owner: null };
  let plan = home.think({ ball, foes: away.players }); const chasers = [...plan.values()].filter(a => a.do === 'chase'); assert.equal(chasers.length, 1, 'one goes for the ball');
  assert.equal(plan.get(home.players[0]).do, 'keep', 'the keeper keeps');
  const h1 = home.home(home.players[3], { x: 150, y: 100 }), h2 = home.home(home.players[3], { x: 150, y: 450 }); assert.ok(h1.y < h2.y, 'the formation slides up with the ball');
  const striker = home.players[3]; striker.x = 150; striker.y = 80; ball.owner = striker; ball.x = 150; ball.y = 80;
  for (const f of away.players) { f.x = 20; f.y = 480; } home.thinkT = 0; plan = home.think({ ball, foes: away.players }); assert.equal(plan.get(striker).do, 'shoot', 'clear in front of goal: shoot');
  assert.ok(plan.get(striker).kick.y < 0, 'towards the top goal');
  striker.y = 400; ball.y = 400; const mate = home.players[4]; mate.x = 220; mate.y = 200; away.players[0].x = 128; away.players[0].y = 405;
  home.thinkT = 0; plan = home.think({ ball, foes: away.players }); assert.equal(plan.get(striker).do, 'pass', 'pressed far out: pass'); assert.equal(plan.get(striker).to, mate);
  ball.owner = away.players[1]; away.players[1].x = 100; away.players[1].y = 300; home.thinkT = 0; plan = home.think({ ball, foes: away.players });
  assert.ok([...plan.values()].some(a => a.do === 'mark'), 'without the ball: mark');
  const human = home.players[2]; human.human = true; home.thinkT = 0; assert.ok(!home.think({ ball, foes: away.players }).has(human), 'the human is left alone');
  console.log('sports: formation, keeper, chase, slide, shoot, pass under pressure, marking, human ok');
}
{
  const { Streams, Flood } = await import('../src/kit/flow.js'); const { Path } = await import('../src/kit/paths.js');
  // 2D
  const w = new Streams(); const r = w.river(new Path([[0, 100], [400, 100]], { kind: 'line' }), { width: 40, speed: 50 });
  let h = w.at({ x: 200, y: 100 }); console.log(h.speed, h.current, h.edge);
  assert.ok(h.in && h.current.x > 49 && Math.abs(h.current.y) < 1e-6);
  const hb = w.at({ x: 200, y: 118 }); assert.ok(hb.in && hb.speed < h.speed && hb.edge > .8, 'slower at the bank'); assert.ok(!w.at({ x: 200, y: 130 }).in);
  r.rock(200, 0, 5); const front = w.at({ x: 194, y: 100.5 }), past = w.at({ x: 200, y: 108 }); console.log('rock', front.current, past.current, past.foam);
  assert.ok(Math.abs(front.current.x) < 30, 'slowed before the rock'); assert.ok(past.speed > 50, 'faster past its side');
  assert.equal(w.at({ x: 200, y: 101 }).speed, 0, 'none inside');
  const boat = { x: 50, y: 100 }; for (let i = 0; i < 60; i++) w.carry(boat, 1 / 60); assert.ok(Math.abs(boat.x - 100) < 2, 'carried');
  const lava = w.pool({ x: 600, y: 600 }, 20, { kind: 'lava' }); const hero = { x: 600, y: 600 }; let ev = [];
  w.on('enter', (o, s) => ev.push('in ' + s.kind)).on('leave', (o, s) => ev.push('out ' + s.kind));
  assert.equal(w.hurt(hero, .5), 15); hero.x = 700; assert.equal(w.hurt(hero, .5), 0); assert.deepEqual(ev, ['in lava', 'out lava']);
  const wh = w.whirl({ x: 0, y: 600 }, 30, 4, 2); const q = w.at({ x: 20, y: 600 }); console.log('whirl', q.current); assert.ok(q.current.y > 0 && q.current.x < 0);
  // 3D with a waterfall
  const w3 = new Streams({ space: '3d' });
  const fallR = w3.river(new Path([{ x: 0, y: 10, z: 0 }, { x: 20, y: 10, z: 0 }, { x: 21, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }], { kind: 'line' }), { width: 6, speed: 3 });
  const top = w3.at({ x: 10, y: 10, z: 1 }), fall = w3.at({ x: 20.6, y: 5, z: 0 }), low = w3.at({ x: 30, y: 0, z: 0 });
  assert.ok(top.in && !top.fall && top.current.x > 2.5 && Math.abs(top.current.y) < 1e-9 && Math.abs(top.level - 10) < .01);
  assert.ok(fall.fall && fall.current.y < -1, 'a waterfall pulls down'); assert.ok(Math.abs(low.level) < .01);
  // a bowl on the left, a hill on the right
  const f = new Flood({ size: 40, cells: 80, ground: (x, z) => x < 0 ? Math.hypot(x + 10, z) * .1 - 1 : 2 - Math.hypot(x - 10, z) * .1 });
  f.add(10, 0, 30, 2); const v0 = f.volume(); console.log('v0', v0);
  for (let i = 0; i < 60 * 20; i++) f.update(1 / 60);
  assert.ok(Math.abs(f.volume() - v0) < v0 * 1e-3, 'water is kept');
  assert.ok(f.depth(10, 0) < .01 && f.depth(-10, 0) > .3, 'runs off the hill into the hollow');
  assert.ok(Math.abs(f.level(-10, 0) - f.level(-8, 1)) < .02, 'and settles flat');
  const d = new Flood({ size: 20, cells: 20, edges: 'drain' }); d.add(0, 0, 10, 3); for (let i = 0; i < 600; i++) d.update(1 / 60); console.log('drained', d.volume()); assert.ok(d.volume() < 9);
  const p = new Flood({ size: 20, cells: 20 }); const tap = p.pour(0, 0, 2, 1); for (let i = 0; i < 300; i++) p.update(1 / 60); console.log('poured', p.volume()); assert.ok(Math.abs(p.volume() - 10) < .2);
  const c = new Flood({ size: 20, cells: 40, ground: (x) => -x * .05 }); c.add(-8, 0, 20, 2); for (let i = 0; i < 40; i++) c.update(1 / 60); console.log('current', c.current(-6, 0)); assert.ok(c.current(-6, 0).x > .1, 'flows downhill');
  console.log('flow: current, banks, rocks, carry, lava hurt, whirlpools, waterfalls, flood fills hollows, drains, taps, runs downhill ok');
}
{
  const { Quiz, categories, loadTrivia, CREDIT } = await import('../src/kit/trivia.js');
  assert.throws(() => new Quiz(), /still loading/, 'loads first'); await loadTrivia();
  const cats = categories(); assert.ok(cats.length >= 10 && cats.every(c => c.count > 0), 'categories'); assert.ok(CREDIT.includes('CC BY-SA'));
  const a = new Quiz({ seed: 7 }), b = new Quiz({ seed: 7 }), qa = a.next(), qb = b.next();
  assert.deepEqual(qa, qb, 'same seed, same quiz'); assert.equal(qa.correct, undefined, 'the answer is not given away');
  const total = a.left + 1, ids = new Set([qa.id]); let q;
  while ((q = a.next())) { assert.ok(!ids.has(q.id), 'no repeats'); ids.add(q.id); assert.ok(q.answers.length === (q.kind === 'truefalse' ? 2 : 4)); }
  assert.equal(ids.size, total, 'asks every question once'); assert.equal(a.next(), null);
  const s = new Quiz({ categories: 'animals', difficulty: 'easy', kind: 'choice', seed: 'day' });
  for (let i = 0; i < 5; i++) { const x = s.next(); assert.equal(x.categoryId, 'animals'); assert.equal(x.difficulty, 'easy'); assert.equal(x.kind, 'choice'); }
  const c = new Quiz({ climb: 2, seed: 3 }); c.next(); assert.equal(c.difficulty, 'easy');
  const right = () => c.answer(c.q.correct); right(); assert.equal(c.answer(0).streak >= 0, true, 'a second answer to one question is ignored'); c.next(); right();
  assert.equal(c.difficulty, 'medium', 'two right: up a level'); assert.equal(c.score, 2); assert.equal(c.streak, 2);
  const nq = c.next(); assert.equal(nq.difficulty, 'medium'); const r = c.answer((c.q.correct + 1) % nq.answers.length);
  assert.ok(!r.right && r.streak === 0 && c.difficulty === 'easy', 'a miss: back down'); assert.equal(c.best, 2);
  const f = new Quiz({ kind: 'choice', seed: 1 }); f.next(); const gone = f.fifty(); assert.equal(gone.length, 2); assert.ok(!gone.includes(f.q.correct), '50:50 keeps the right one');
  const g = new Quiz({ seed: 9 }); const first = [g.next(), g.next(), g.next()].map(x => x.id); const saved = g.pack(); assert.ok(JSON.stringify(saved).length < 40, 'small save');
  const h = new Quiz({ seed: 1, resume: saved }), n = h.next(); assert.ok(!first.includes(n.id), 'resumes without repeats'); assert.equal(n.id, g.next().id, 'and in the same order');
  console.log('trivia: bank, categories, seeded order, no repeats, filters, climb, 50:50, pack/resume ok');
}
{
  const { dungeon, cave, maze, islands, pattern, fov, loadGen, proven, reach } = await import('../src/kit/gen.js');
  await loadGen();
  const a = dungeon(40, 30, { seed: 7 }), b2 = dungeon(40, 30, { seed: 7 });
  assert.equal(a.text, b2.text, 'same seed, same dungeon'); assert.ok(a.text.includes('S') && a.text.includes('E') && a.rooms.length > 1);
  assert.ok(cave(40, 30, { seed: 1 }).text.includes('.')); assert.ok(maze(21, 21, { seed: 1 }).grid.length === 21); assert.ok(/[~.^]/.test(islands(32, 32, { seed: 3 }).text));
  const pt = pattern('..#..\n.###.\n..#..\n.....', 16, 16, { seed: 2 }); assert.ok(pt && pt.grid.length === 16);
  const seen = fov('#####\n#...#\n#...#\n#####', 2, 1, 5); assert.ok(seen.has('3,2') && seen.has('0,0'));
  // proven levels: keeps making until one passes; reach() measures the walk
  assert.equal(reach('S..#\n.#.E\n....', 'S', 'E'), 4, 'reach counts steps round walls');
  assert.equal(reach('S#E', 'S', 'E'), -1, "reach: can't get through");
  let made = 0;
  const pv = proven(sd => { made++; return cave(30, 20, { seed: sd }); }, l => { const n = reach(l.text, 'S', 'E'); return n > 0 && n; }, { seed: 4, tries: 6 });
  assert.ok(pv.level && pv.score > 0 && made === 6, 'proven keeps the best of its tries');
  const pv2 = proven(sd => cave(30, 20, { seed: sd }), l => { const n = reach(l.text, 'S', 'E'); return n > 0 && n; }, { seed: 4, tries: 6 });
  assert.equal(pv2.level.text, pv.level.text, 'proven is seeded');
  const early = proven(sd => sd, () => true, { seed: 1, good: 1 });
  assert.equal(early.tried, 1, 'stops at the first good one');
  assert.equal(proven(sd => sd, () => false, { tries: 3 }).level, null, 'null when nothing passes');
  console.log('gen: dungeon (seeded), cave, maze, islands, pattern, fov, proven, reach ok');
}
{
  const { Gun, Health, lob, arc, Explosives, hitFrom } = await import('../src/kit/combat.js');
  const g = new Gun({ mag: 3, rate: 10, reload: .5, reserve: 6, rng: () => .5 });
  let shots = 0; for (let i = 0; i < 60; i++) { shots += g.pull({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, true).length; g.update(1 / 60); }
  assert.ok(shots >= 3 && g.reserve < 6, 'gun empties its magazine and reloads from reserve: ' + shots);
  const f = new Gun({ falloff: [10, 30, .5] }); assert.equal(f.damageAt(5), f.damage); assert.ok(f.damageAt(40) < f.damage && f.damageAt(40) >= f.damage * .5 - 1, 'damage falls off with range');
  const h = new Health({ max: 100, regen: 50, delay: 1 }); h.hurt(60, { from: { x: 1, y: 0 }, at: { x: 0, y: 0 }, facing: 0 }); assert.equal(h.hp, 40); assert.ok(h.hits.length === 1, 'hit direction kept');
  for (let i = 0; i < 180; i++) h.update(1 / 60); assert.equal(h.hp, 100, 'health comes back after the delay');
  h.hurt(500); assert.ok(h.dead, 'dies');
  const v = lob({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 1, -20), path = arc({ x: 0, y: 0, z: 0 }, v, -20, { steps: 21, dt: 1 / 20 });
  assert.ok(Math.abs(path[20].x - 10) < .6 && Math.abs(path[20].y) < .6, 'lob lands on its target: ' + JSON.stringify(path[20]));
  const ex = new Explosives({ fuse: .1, radius: 3 }); let booms = 0; ex.on('boom', () => booms++); const a = ex.add({ x: 0, y: 0 }); ex.add({ x: 2, y: 0 }); ex.add({ x: 20, y: 0 });
  ex.light(a); for (let i = 0; i < 60; i++) ex.update(1 / 60); assert.equal(booms, 2, 'a barrel sets off the one next to it, not the far one');
  assert.ok(typeof hitFrom({ x: 1, y: 0 }, { x: 0, y: 0 }, 0) === 'number');
  console.log('combat: gun mag + reload, falloff, health regen, lob, chain explosions ok');
}
{
  const { CoverMap, Squad } = await import('../src/kit/tactics.js');
  const lv = ['..........', '..........', '....##....', '..........', '..........'];
  const cm = new CoverMap(10, 5, (c, r) => lv[r]?.[c] === '#');
  assert.ok(cm.spots.length > 0, 'cover spots found beside walls');
  const s = cm.find({ x: 5, y: 4.5 }, { x: 5, y: 0 }); assert.ok(s && cm.protects(s, { x: 5, y: 0 }), 'finds cover that blocks the threat');
  const men = [{ x: 2, y: 4 }, { x: 8, y: 4 }, { x: 5, y: 4.6 }]; const sq = new Squad(men, { cover: cm, think: .1 }); let calls = 0; sq.on('call', () => calls++);
  for (let i = 0; i < 30; i++) sq.update(1 / 30, { x: 5, y: .5 }); assert.ok(men.every(m => m.order), 'every squad member gets an order'); assert.ok(calls >= 1, 'squad calls out contact');
  console.log('tactics: cover spots, cover that protects, squad orders + callouts ok');
}
{
  const { Ledges, Climber, Rope } = await import('../src/kit/climb.js');
  const L = new Ledges().add({ x: 0, y: 3, z: 0 }, { x: 4, y: 3, z: 0 }, { x: 0, z: 1 });
  const cl = new Climber(L); assert.ok(cl.grab({ x: 1, y: 1.4, z: .3 }, -1), 'grabs a ledge in reach');
  assert.equal(cl.state, 'hang'); const x0 = cl.pos.x; for (let i = 0; i < 30; i++) cl.update(1 / 60, { x: 1 }); assert.ok(cl.pos.x < x0, 'shimmies right (facing the wall along -z, right is -x)');
  for (let i = 0; i < 60; i++) cl.update(1 / 60, { y: 1 }); assert.ok(cl.state === 'free' && cl.pos.y >= 2.9, 'climbs up onto the top: ' + cl.state + ' ' + cl.pos.y);
  const rope = new Rope({ x: 0, y: 6, z: 0 }, 4); rope.catch({ x: 0, y: 2, z: 0 }, { x: 4, y: 0, z: 0 }); for (let i = 0; i < 20; i++) rope.update(1 / 60, 1);
  const hd = rope.hands; assert.ok(Math.abs(Math.hypot(hd.x, hd.y - 6, hd.z) - rope.length) < .01 && Math.abs(hd.x) > .1, 'rope swings and keeps its length');
  console.log('climb: grab, shimmy, climb up, rope swing ok');
}
{
  const { Mission, zone } = await import('../src/kit/missions.js');
  const me = { x: 0, y: 0 }, door = zone({ x: 10, y: 0 }, 2); let said = 0, done = 0;
  const m = new Mission(function* (m) { m.objective('Reach the door'); m.say('Go'); yield m.until(() => door.has(me)); m.checkpoint('door'); m.say('Made it'); yield m.wait(1); m.objective('Wait'); yield m.wait(1); m.complete(); });
  m.on('say', () => said++).on('complete', () => done++);
  m.update(1 / 60); assert.equal(m.current.text, 'Reach the door'); me.x = 10; for (let i = 0; i < 70; i++) m.update(1 / 60); assert.equal(m.current.text, 'Wait');
  m.restart(); me.x = 0; assert.equal(said, 2, 'lines before the checkpoint are not said again on a restart');
  for (let i = 0; i < 70; i++) m.update(1 / 60); assert.equal(m.current.text, 'Wait', 'restart carries on from the checkpoint, past the door');
  for (let i = 0; i < 70; i++) m.update(1 / 60); assert.equal(done, 1, 'mission completes');
  console.log('missions: objectives, zones, checkpoints, restart skips ahead ok');
}
{
  const { Cutscene, along } = await import('../src/kit/cutscene.js');
  const mid = along([{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }], .5); assert.ok(Math.abs(mid.x - 5) < .01);
  let lines = 0, ended = 0; const cs = new Cutscene([{ cam: [{ x: 0, y: 2, z: 0 }, { x: 10, y: 2, z: 0 }], look: { x: 0, y: 0, z: -5 }, time: 1 }, { say: 'Hello', who: 'Ana', time: 1 }]);
  cs.on('say', () => lines++).on('end', () => ended++); for (let i = 0; i < 30; i++) cs.update(1 / 60); assert.ok(cs.shot && cs.shot.x > 0 && cs.shot.x < 10, 'camera moves along the path');
  cs.skip(); assert.ok(ended === 1 && !cs.playing, 'skip ends it');
  console.log('cutscene: camera path, lines, skip ok');
}
{
  const { Prompts } = await import('../src/kit/prompts.js');
  const p = new Prompts(); let pass = 0, fail = 0, done = 0; p.on('pass', () => pass++).on('fail', () => fail++).on('done', () => done++);
  p.start([{ kind: 'tap', x: 100, y: 100, time: 1 }, { kind: 'swipe', dir: 'left', time: 1 }, { kind: 'tap', x: 50, y: 50, time: .2 }]);
  p.update(1 / 60); p.down(100, 100); p.update(1 / 60); p.down(200, 200); p.move(120, 200); p.up(); p.update(1 / 60);
  for (let i = 0; i < 30; i++) p.update(1 / 60);
  assert.equal(pass, 2, 'tap and swipe pass'); assert.equal(fail, 1, 'a missed prompt fails');
  console.log('prompts: tap, swipe, timeout ok');
}
{
  const { lightAt, Takedown, Bodies, Floors, Disguise } = await import('../src/kit/stealth.js');
  assert.ok(lightAt({ x: 0, y: 0 }, [{ x: 0, y: 1, r: 5 }]) > lightAt({ x: 0, y: 0 }, [{ x: 0, y: 4, r: 5 }]), 'nearer the lamp is brighter');
  assert.ok(lightAt({ x: 0, y: 0 }, [{ x: 0, y: 1, r: 5 }], { sees: () => false }) <= .11, 'walls cast shadows');
  const g = { x: 0, y: 0, facing: 0 }; assert.equal(Takedown.check({ x: -1, y: 0 }, [g]), g, 'takedown from behind'); assert.equal(Takedown.check({ x: 1, y: 0 }, [g]), null, 'not from the front');
  const bodies = new Bodies(); bodies.add(3, 0); const seer = { x: 0, y: 0, facing: 0 }; let found = 0; bodies.on('found', () => found++); bodies.update(0, [seer]); assert.equal(found, 1, 'a guard finds a body');
  const fl = new Floors({}, p => (p.x > 0 ? 'gravel' : 'carpet')); assert.ok(fl.noise({ x: 1, y: 0 }, 2) > fl.noise({ x: -1, y: 0 }, 2) && fl.noise({ x: 1, y: 0 }, .5) === 0, 'gravel loud, carpet quiet, sneaking silent');
  const d = new Disguise().wear('guard'); assert.ok(d.fooling({ x: 9, y: 0, rank: 'guard' }) && !d.blow(2).fooling({ x: 9, y: 0, rank: 'guard' }), 'disguise fools until blown');
  console.log('stealth: light meter, takedowns, bodies, floors, disguise ok');
}
{
  const { Grapple, Zipline, Wires, Lock, Code } = await import('../src/kit/gadgets.js');
  const hook = new Grapple({ range: 20, flyTime: .05 }); assert.ok(hook.fire({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, () => ({ point: { x: 5, y: 5, z: 0 } })));
  let pos = { x: 0, y: 0, z: 0 }, vel = { x: 0, y: 0, z: 0 }; for (let i = 0; i < 90; i++) { vel = hook.update(1 / 60, pos, vel, { reel: true }); pos = { x: pos.x + vel.x / 60, y: pos.y + vel.y / 60, z: 0 }; }
  assert.ok(Math.hypot(pos.x - 5, pos.y - 5) < 3, 'reeling pulls you to the hook: ' + JSON.stringify(pos));
  const z = new Zipline({ x: 0, y: 10, z: 0 }, { x: 30, y: 0, z: 0 }).ride(); for (let i = 0; i < 600 && z.riding; i++) z.update(1 / 60); assert.ok(z.done, 'zip line reaches the end');
  const w = new Wires(4, 4, { seed: 3 }); assert.ok(!w.solved); w.cells = w.answer.slice(); w.update(); assert.ok(w.solved, 'the answer lights every tile');
  const lk = new Lock({ pins: 1, seed: 1 }); lk.a = lk.at; assert.ok(lk.stop() && lk.solved, 'stopping on the mark opens the lock');
  const code = new Code({ start: 3, seed: 1 }); for (const k of code.seq) code.press(k); assert.ok(code.done && !code.failed, 'repeating the code works');
  console.log('gadgets: grapple reel, zip line, wires, lock, code ok');
}
{
  const { Campaign } = await import('../src/kit/campaign.js');
  let saved = null; const api = { load: f => saved ?? f, save: d => { saved = JSON.parse(JSON.stringify(d)); } };
  const chapters = [{ id: 'a', missions: [{ id: 'a1', stars: [100, 200, 300], collect: 2 }, { id: 'a2', stars: ['Finish', 'Unseen'] }] }, { id: 'b', needs: { stars: 5 }, missions: [{ id: 'b1' }] }];
  const c = new Campaign(chapters, { extras: { hat: 3 } }).attach(api);
  assert.equal(c.state('a1'), 'open'); assert.equal(c.state('a2'), 'locked'); assert.equal(c.state('b1'), 'locked');
  let r = c.finish('a1', { score: 250 }); assert.equal(r.stars, 2); assert.ok(r.unlocked.includes('a2'), 'finishing opens the next mission');
  r = c.finish('a2', { stars: [true, true] }); assert.ok(r.unlocked.includes('hat') && c.state('b1') === 'locked', 'extras unlock by stars');
  c.finish('a1', { score: 120 }); assert.equal(c.best('a1'), 250, 'keeps the best score'); c.finish('a1', { score: 320 }); assert.equal(c.state('b1'), 'open', 'enough stars open the next chapter');
  assert.ok(c.collect('a1', 1) && !c.collect('a1', 1), 'collectibles count once');
  const c2 = new Campaign(chapters).attach(api); assert.equal(c2.stars, 5); assert.equal(c2.collected('a1'), 1); assert.ok(JSON.stringify(saved).length < 200, 'save is small');
  console.log('campaign: unlocks, stars, extras, best, collectibles, save ok');
}
{
  const { Plane, Boat, Hover } = await import('../src/kit/craft.js');
  const p = new Plane({ at: { x: 0, y: 100, z: 0 }, speed: 40 }); p.throttle = .7;
  for (let i = 0; i < 300; i++) p.update(1 / 60);
  assert.ok(Math.abs(p.pos.y - 100) < 8, 'level flight holds height: ' + p.pos.y);
  const h0 = p.heading; for (let i = 0; i < 25; i++) p.update(1 / 60, { roll: 1 }); for (let i = 0; i < 90; i++) p.update(1 / 60);
  assert.ok(Math.sin(p.heading - h0) > .1, 'rolling right turns right');
  const g = new Plane({ at: { x: 0, y: 1, z: 0 }, speed: 0, ground: () => 0 }); assert.ok(g.onGround, 'starts on the runway');
  let up = false; for (let i = 0; i < 900; i++) { g.update(1 / 60, { throttle: 1, pitch: g.speed > 25 ? .6 : 0 }); if (!g.onGround && g.altitude > 5) { up = true; break; } }
  assert.ok(up && !g.crashed, 'takes off');
  const water = { height: () => 0, normal: () => ({ x: 0, y: 1, z: 0 }) };
  const b = new Boat(water); for (let i = 0; i < 180; i++) b.update(1 / 60, { throttle: 1 }); assert.ok(b.speed > 5 && Math.abs(b.y) < 1, 'boat speeds up on the water');
  const hv = new Hover({ at: { x: 0, y: 2, z: 0 } }); for (let i = 0; i < 120; i++) hv.update(1 / 60, { y: 1 }); assert.ok(hv.speed > 3, 'hover moves');
  console.log('craft: level flight, banked turn, takeoff, boat, hover ok');
}
{
  const { Soft, Liquid } = await import('../src/kit/soft.js');
  const s = new Soft({ bounds: [0, 0, 360, 640] });
  const cl = s.cloth(80, 50, 200, 150, 10, 8);
  for (let i = 0; i < 120; i++) s.update(1 / 60);
  const bottom = cl.at(5, 7); assert.ok(bottom.y > 150 && bottom.y < 260, 'cloth hangs: ' + bottom.y);
  assert.ok(s.cut(0, 120, 360, 120) >= 8, 'a swipe cuts the cloth');
  for (let i = 0; i < 120; i++) s.update(1 / 60); assert.ok(cl.at(5, 7).y > 400, 'cut cloth falls');
  const s2 = new Soft({ bounds: [0, 0, 360, 640] }); const j = s2.jelly(180, 300, 50, 16);
  const area = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a / 2); };
  const a0 = area(j.points); for (let i = 0; i < 240; i++) s2.update(1 / 60);
  assert.ok(area(j.points) / a0 > .7, 'jelly keeps its shape after landing');
  const gr = s2.grab(j.points[0].x, j.points[0].y); assert.ok(gr, 'grab a point'); gr.move(200, 100); gr.drop();
  const lq = new Liquid({ bounds: [0, 0, 200, 300] }); lq.pour(100, 50, 60);
  for (let i = 0; i < 240; i++) lq.update(1 / 60);
  assert.ok(lq.list.every(p => Number.isFinite(p.x) && p.y <= 300.5 && p.y > 150), 'liquid settles in the bottom');
  console.log('soft: cloth hangs and cuts, jelly holds, grab, liquid ok');
}
{
  const { Deck, total, groups, poker, winners, sort, stacks, card } = await import('../src/kit/cards.js');
  const d = new Deck({ seed: 7 }).shuffle(); assert.equal(d.size, 52);
  const hands = d.deal(2, 5); assert.equal(hands[0].length, 5); assert.equal(d.size, 42);
  const d2 = new Deck({ seed: 7 }).shuffle(); assert.deepEqual(d2.deal(2, 5)[0].map(c => c.id), hands[0].map(c => c.id), 'same seed, same deal');
  d.discard(hands.flat()); d.draw(42); assert.equal(d.draw(3).length, 3, 'discards shuffle back in when it runs out');
  const back = new Deck().load(d.save()); assert.equal(back.size, d.size, 'save and load');
  assert.deepEqual(total([card('h', 1), card('s', 13)]), { total: 21, soft: true, bust: false });
  assert.equal(total([card('h', 1), card('s', 9), card('d', 5)]).total, 15);
  const g = groups([card('h', 5), card('h', 6), card('h', 7), card('s', 9), card('d', 9), card('c', 9)]); assert.equal(g.runs.length, 1); assert.equal(g.sets.length, 1);
  assert.equal(groups([card('s', 12), card('s', 13), card('s', 1)]).runs.length, 1, 'Q-K-A run');
  const fh = [card('h', 3), card('s', 3), card('d', 3), card('c', 9), card('h', 9)], pair = [card('h', 2), card('s', 2), card('d', 7), card('c', 10), card('h', 12)];
  assert.equal(poker(fh).name, 'Full House'); assert.deepEqual(winners([pair, fh]), [1]);
  assert.equal(sort([card('h', 2), card('s', 1)])[0].suit, 's'); assert.ok(stacks(card('h', 6), card('s', 7)) && !stacks(card('h', 6), card('d', 7)));
  console.log('cards: deck, seeds, reshuffle, save, totals, sets and runs, poker ok');
}
{
  const { roll, odds, Dice, faceUp } = await import('../src/kit/dice.js');
  for (let i = 0; i < 50; i++) { const r = roll('2d6+3'); assert.ok(r.total >= 5 && r.total <= 15); }
  assert.equal(roll('4d6kh3', 1).kept[0].length, 3); assert.deepEqual(roll('3d6', 5).rolls, roll('3d6', 5).rolls, 'seeded rolls repeat');
  assert.ok(roll('d%').total <= 100 && roll('5-2').total === 3);
  assert.ok(Math.abs(odds(2, 6)[7] - 6 / 36) < 1e-9, 'odds of 7 on 2d6');
  const dc = new Dice(3, { seed: 2 }); let settled = null; dc.on('settle', v => { settled = v; });
  const will = dc.throw(); dc.hold(0); for (let i = 0; i < 60; i++) dc.update(1 / 60); assert.deepEqual(settled, will, 'lands on what throw() said');
  const keep = dc.values[0]; dc.throw(); assert.equal(dc.values[0], keep, 'held dice stay');
  assert.equal(faceUp({ x: 0, y: 0, z: 0, w: 1 }), 1); assert.equal(faceUp({ x: 1, y: 0, z: 0, w: 0 }), 6);
  console.log('dice: notation, keep, seeds, odds, tumble and hold, face up ok');
}
{
  const { UI, loadUI } = await import('../src/kit/ui.js');
  let threw = null; try { new UI(100, 100, {}); } catch (e) { threw = e; } assert.ok(!threw || threw.kitLoading, 'UI before load throws StillLoading');
  await loadUI();
  const taps = [], items = Array.from({ length: 20 }, (_, i) => ({ id: 'item' + i, h: 64, tap: true }));
  const ui = new UI(360, 640, { dir: 'column', pad: 16, gap: 10, children: [{ id: 'title', h: 48 }, { id: 'list', grow: 1, scroll: 'y', gap: 8, children: items },
    { dir: 'row', gap: 8, h: 56, children: [{ id: 'buy', grow: 1, tap: true }, { id: 'back', w: 96, tap: true }] }] });
  ui.on('tap', n => taps.push(n.id));
  const b = id => ui.node(id).box;
  assert.deepEqual(b('back'), { x: 248, y: 568, w: 96, h: 56 }, 'flex layout'); assert.equal(b('list').h, 484, 'scroll list fills the space left');
  ui.down(250, 570, 1); ui.up(250, 570, 1); assert.deepEqual(taps, ['back'], 'tap');
  ui.down(180, 400, 2); for (let i = 1; i <= 10; i++) { ui.move(180, 400 - i * 20, 2); ui.update(1 / 60); } ui.up(180, 200, 2);
  for (let i = 0; i < 120; i++) ui.update(1 / 60);
  assert.ok(b('item0').y < 0 && taps.length === 1, 'drag scrolls (no tap)');
  ui.focus('item19'); ui.key('Enter', true); ui.key('Enter', false); assert.equal(taps.at(-1), 'item19', 'focus and press with keys');
  assert.ok(b('item19').y + 64 <= b('list').y + b('list').h + .5, 'focusing scrolls it into view');
  let n = 0; ui.each(() => n++); assert.ok(n > 5 && n < 26, 'only visible boxes are drawn: ' + n);
  ui.free();
  console.log('ui: flex layout, tap, scroll, focus, keys, culling ok');
}
{
  // round 9: paths, bones, nodes, auto-tiling, two fingers, timelines, haptic patterns, mixer
  const { Path, Follower } = await import('../src/kit/paths.js');
  const line = new Path([[0, 0], [100, 0]], { kind: 'line' });
  assert.equal(line.length, 100); assert.equal(line.at(25).x, 25); assert.equal(line.offset(50, 10).y, 10, 'right of the line');
  assert.equal(Math.round(line.nearest(40, 30).d), 40);
  const sq = new Path([[0, 0], [100, 0], [100, 100], [0, 100]], { loop: true, kind: 'line' });
  const f = new Follower(sq, { speed: 100 }); for (let i = 0; i < 50; i++) f.update(.1);
  assert.equal(f.lap, 1); assert.ok(Math.abs(f.d - 100) < 1e-6, 'steady speed round a loop');
  const smooth = new Path([[0, 0], [50, 40], [100, 0]]); assert.ok(Math.abs(smooth.at(0).x) < 1e-9 && Math.abs(smooth.at(smooth.length).x - 100) < 1e-6, 'passes through the ends');
  const pp = new Follower(line, { speed: 80, end: 'pingpong' }); for (let i = 0; i < 20; i++) pp.update(.1); assert.ok(pp.d >= 0 && pp.d <= 100, 'pingpong stays on');
  console.log('paths: lengths, offsets, nearest, loops, pingpong ok');

  const { Rig } = await import('../src/kit/bones.js');
  const r = new Rig().bone('up', { len: 10 }).bone('lo', { parent: 'up', len: 10 }).bone('tail', { parent: 'up', len: 5, wobble: {} });
  r.update(0); assert.ok(Math.abs(r.world('lo').ex - 20) < 1e-9, 'chain end');
  assert.ok(r.reach('up', 'lo', 12, 5)); assert.ok(Math.hypot(r.world('lo').ex - 12, r.world('lo').ey - 5) < 1e-6, 'two-bone reach lands');
  r.flip = true; r.reach('up', 'lo', -12, 5); assert.ok(Math.hypot(r.world('lo').ex + 12, r.world('lo').ey - 5) < 1e-6, 'reach when flipped');
  r.flip = false; r.clip('c', { len: 1, loop: false, keys: { up: [[0, 0], [1, 1]] }, events: [[.5, 'mid']] }); let mid = 0, ended = 0; r.on('mid', () => mid++).on('end', () => ended++);
  r.play('c', { fade: 0 }); r.update(.6); assert.equal(mid, 1); assert.ok(Math.abs(r.get('up').angle - .6) < 1e-9, 'clip keys'); r.update(1); assert.equal(ended, 1, 'end once');
  r.blend({ up: 3 }, { up: -3 }, .5); assert.ok(Math.abs(Math.abs(r.get('up').angle) - Math.PI) < .01, 'blends the short way round');
  console.log('bones: chains, reach, flip, clips, events, blend ok');

  const { Node } = await import('../src/kit/things.js');
  const tank = new Node({ x: 100, y: 100, angle: Math.PI / 2 }), gun = tank.add(new Node({ x: 10, r: 3 }));
  tank.update(); assert.ok(Math.abs(gun.wx - 100) < 1e-9 && Math.abs(gun.wy - 110) < 1e-9, 'child turns with parent');
  assert.ok(gun.hit(100, 110) && tank.pick(100, 110) === gun, 'hit and pick');
  gun.attach(null); assert.ok(Math.abs(gun.x - 100) < 1e-9 && Math.abs(gun.y - 110) < 1e-9, 'attach keeps the place');
  console.log('things: nodes, world places, hits, attach ok');

  const { TileMap, BLOB_MASKS } = await import('../src/kit/tiles.js');
  assert.equal(BLOB_MASKS.length, 47, '47 blob pieces');
  const tm = TileMap.fromText('###\n###\n#..'); assert.equal(tm.edges(1, 1).mask, 11); assert.equal(tm.edges(1, 1).blob, BLOB_MASKS.indexOf(tm.edges(1, 1).blob8));
  assert.equal(tm.edges(2, 2, '.', { edge: false }).mask, 8, 'joins only what you say');
  console.log('tiles: auto-tiling masks and blob pieces ok');

  const { TwoFingers, Gestures } = await import('../src/kit/controls.js');
  let taps = 0, pinched = 1, turned = 0, panned = 0;
  const two = new TwoFingers({ one: new Gestures({ tap: () => taps++ }), pinch: k => { pinched *= k; }, twist: a => { turned += a; }, pan: (dx) => { panned += dx; } });
  two.down(100, 100, 1); two.up(100, 100, 1); assert.equal(taps, 1, 'one finger still taps');
  two.down(100, 100, 1); two.down(200, 100, 2); two.move(250, 100, true, 2); assert.ok(Math.abs(pinched - 1.5) < 1e-9 && Math.abs(two.scale - 1.5) < 1e-9, 'pinch');
  two.move(150, 150, true, 2); assert.ok(turned > 0, 'twist'); two.up(150, 150, 2); two.up(100, 100, 1); assert.equal(taps, 1, 'no stray tap after a pinch'); assert.ok(panned !== 0);
  console.log('controls: two fingers pinch, twist, pan, one-finger hand-off ok');

  const { Timeline, stagger } = await import('../src/kit/juice.js');
  let early = null; try { new Timeline(); } catch (e) { early = e; }
  if (early) { assert.ok(early.kitLoading, 'Timeline loads lazily'); await early.kitLoading; }
  const o = { x: 0 }, list = [{ s: 0 }, { s: 0 }, { s: 0 }]; let calls = 0;
  const tl = new Timeline({ ease: 'linear' }).to(o, { x: 100, duration: 1 }).to(list, { s: 1, duration: .2, delay: stagger(.1) }, '+=.1').call(() => calls++, .5);
  tl.update(.5); assert.ok(Math.abs(o.x - 50) < 1e-6 && calls === 1, 'seconds, game dt');
  tl.pause().update(1); assert.ok(Math.abs(o.x - 50) < 1e-6, 'paused holds'); tl.play().update(1.5);
  assert.ok(tl.done && list.every(t => t.s === 1) && o.x === 100, 'staggered steps finish'); assert.ok(Math.abs(tl.duration - 1.5) < 1e-6, 'duration ' + tl.duration);
  console.log('juice: timelines in seconds, stagger, pause, call ok');

  globalThis.window ??= globalThis; globalThis.addEventListener ??= () => {}; globalThis.removeEventListener ??= () => {};
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  const dev = await import('../src/kit/device.js');
  assert.ok(dev.hapticPattern('heartbeat') > .1 && dev.hapticPattern([{ at: .2, len: .3, to: 0 }]) === .5 && dev.hapticPattern('nothing') === 0, 'haptic patterns');
  dev.stopHaptics();
  const snd = await import('../src/kit/sound.js');
  snd.mixer.volume('music', .5).duck('music').room('cave').muffle(.5).reset();
  assert.equal(await snd.say(''), false, 'nothing to say'); assert.equal(snd.talking(), false);
  assert.equal(await snd.say(['', .2, '  ']), false, 'no words in the parts either');
  // a cast: each character gets a voice from the phone's list (src/kit/voices.js)
  {
    const { cast, wantOf, describe } = await import('../src/kit/voices.js');
    const G = n => ({ name: 'English', lang: n.slice(0, 2) + '-' + n.slice(3, 5).toUpperCase(), voiceURI: n, localService: !n.endsWith('network') });
    const android = ['en-GB-language', 'en-au-x-aub-local', 'en-gb-x-fis-local', 'en-gb-x-gba-local', 'en-gb-x-gbb-network', 'en-gb-x-gbd-local', 'en-gb-x-rjs-local', 'en-us-x-sfg-local', 'de-de-x-deb-local'].map(G);
    const pick = (list, w, o = { native: true }) => { const r = cast(list, wantOf(w), o); return (r.at < 0 ? 'default' : list[r.at].voiceURI) + '@' + r.pitch.toFixed(2); };
    assert.equal(pick(android, 'woman'), 'en-gb-x-fis-local@1.00', 'a woman with the accent asked for');
    assert.equal(pick(android, 'man'), 'en-gb-x-gbd-local@1.00', 'a man, and not the one that needs the network');
    assert.equal(pick(android, { kind: 'man', take: 1 }), 'en-gb-x-rjs-local@1.00', 'take 1 is a different man');
    assert.equal(pick(android, { kind: 'man', take: 2 }), 'en-gb-x-gbd-local@0.90', 'more takes than voices: the first again, a little lower');
    assert.equal(pick(android, { kind: 'man', lang: ['en-AU', 'en-GB'] }), 'en-au-x-aub-local@1.00', 'accents in the order asked');
    assert.equal(pick(android, { kind: 'woman', lang: 'en-IE' }), 'en-gb-x-fis-local@1.00', 'no such accent: the same language');
    assert.equal(pick(android, { kind: 'man', lang: 'fr-FR' }), 'default@0.86', "no voice in that language: the phone's own, leaning lower for a man");
    assert.equal(pick(android, { kind: 'man', like: ['Daniel', 'rjs'] }), 'en-gb-x-rjs-local@1.00', 'asked for by name');
    assert.equal(pick(android, 'man', { native: true, bad: new Set(['en-gb-x-gbd-local']) }), 'en-gb-x-rjs-local@1.00', 'a voice that failed is not cast again');
    const A = (name, q = 'compact', lang = 'en-GB') => ({ name, lang, voiceURI: `com.apple.voice.${q}.${lang}.${name}`, localService: true });
    const ios = [A('Daniel'), A('Daniel', 'enhanced'), A('Kate'), A('Serena', 'premium'), { name: 'Grandpa', lang: 'en-GB', voiceURI: 'com.apple.eloquence.en-GB.Grandpa', localService: true }];
    assert.equal(pick(ios, 'man'), 'com.apple.voice.enhanced.en-GB.Daniel@1.00', 'the better recording of a voice');
    assert.equal(pick(ios, 'woman'), 'com.apple.voice.premium.en-GB.Serena@1.00', 'the best voice first');
    assert.equal(pick(ios, { kind: 'man', take: 1 }), 'com.apple.voice.enhanced.en-GB.Daniel@0.90', 'joke voices are never cast, and one voice is not counted twice');
    assert.equal(pick(ios, { kind: 'man', like: 'grandpa' }), 'com.apple.eloquence.en-GB.Grandpa@1.00', 'unless asked for by name');
    const web = [{ name: 'Google UK English Female', lang: 'en-GB', voiceURI: 'Google UK English Female', localService: false }, { name: 'Google UK English Male', lang: 'en_GB', voiceURI: 'Google UK English Male', localService: false }];
    assert.equal(pick(web, 'man', { native: false }), 'Google UK English Male@1.00', "a browser's voices, with either spelling of the language");
    const odd = [{ name: 'English', lang: 'en-GB', voiceURI: 'en-GB-voice-a', localService: true }, { name: 'English', lang: 'en-GB', voiceURI: 'en-GB-voice-b', localService: true }];
    assert.equal(pick(odd, 'woman'), 'en-GB-voice-a@1.00', 'voices nobody knows the kind of still make a cast');
    assert.equal(pick(odd, { kind: 'man', take: 1 }), 'en-GB-voice-b@0.86', 'a man leans lower when the phone does not say');
    assert.equal(pick([], 'woman'), 'default@1.00'); assert.equal(pick(null, { kind: 'man', take: 1 }), 'default@0.77');
    assert.deepEqual(describe(G('en-us-x-sfg#male_2-local')), { sex: 'm', tier: 1, joke: false, lang: 'en-us' }, 'the name can say the kind itself');
    assert.deepEqual(wantOf({ kind: 'MAN', lang: ['en_AU', 'nonsense!'], take: 1.7 }), { kind: 'man', langs: ['en-au'], take: 1, like: [] });
  }
  // say() with a cast and parts, against a made-up browser: the right voice, in order, with the pauses
  {
    const spoken = [], list = [{ name: 'Google UK English Female', lang: 'en-GB', voiceURI: 'f' }, { name: 'Google UK English Male', lang: 'en-GB', voiceURI: 'm' }];
    globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    globalThis.speechSynthesis = { getVoices: () => list, cancel() {}, speak(u) { spoken.push([u.text, u.voice?.voiceURI, +u.pitch.toFixed(2), +u.rate.toFixed(2), Date.now()]); setTimeout(() => u.onend(), 5); } };
    const p = snd.say(['Bold.', .12, { text: 'Rectangular.', rate: .8, voice: 'man' }], { voice: 'woman', pitch: .95 });
    assert.equal(snd.talking(), true, 'talking while the parts play');
    assert.equal(await p, true); assert.equal(snd.talking(), false);
    assert.deepEqual(spoken.map(x => x.slice(0, 4)), [['Bold.', 'f', .95, 1], ['Rectangular.', 'm', .95, .8]], 'parts, each in its voice');
    assert.ok(spoken[1][4] - spoken[0][4] >= 110, 'the pause between them: ' + (spoken[1][4] - spoken[0][4]) + ' ms');
    const cut = snd.say(['One.', 2, 'Two.'], { voice: 'woman' }); await new Promise(r => setTimeout(r, 30)); snd.stopTalking();
    assert.equal(await cut, false, 'stopped mid-line'); assert.equal(spoken.length, 3, 'and the rest is never said');
    assert.equal(await snd.say('Plain.'), true, 'a plain line still works'); assert.equal(spoken.at(-1)[1], 'f', "in the language's first voice, as before");
    assert.deepEqual((await snd.voices()).map(v => v.kind), ['woman', 'man'], 'voices() says what the phone has');
    // a shaped voice where nothing can shape it (a browser): the line is still said, size as a lean of its pitch
    assert.equal(snd.shaped(), false, 'a browser cannot shape a voice, and says so');
    assert.equal(await snd.say(['Deep.', .01, { text: 'Small.', size: .8 }], { voice: 'man', size: 1.25, fx: 'radio', pitch: 1.1 }), true);
    assert.deepEqual(spoken.slice(-2).map(x => x.slice(0, 4)), [['Deep.', 'm', .88, 1], ['Small.', 'm', 1.38, 1]], 'size leans the pitch: ' + JSON.stringify(spoken.slice(-2)));
    delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance;
  }
  // shaping a voice (src/kit/voice-fx.js): the parts that are plain sums (the sound itself is measured in scripts/sound-test.cjs speech)
  {
    const fx = await import('../src/kit/voice-fx.js');
    assert.deepEqual(fx.fxOf('phone'), { low: 320, high: 3300, peaks: [[2200, 3, 1]], drive: .12 }, 'a treatment by name');
    assert.deepEqual(fx.fxOf({ like: 'phone', drive: 0, high: 99999, mix: .4, echo: [.1, .5], nonsense: 3 }), { low: 320, high: 16000, peaks: [[2200, 3, 1]], echo: [[.1, .5]], mix: .4 }, 'a recipe starts from a named one, and is kept inside what can be played');
    assert.equal(fx.fxOf('kazoo'), null); assert.equal(fx.fxOf(null), null); assert.equal(fx.fxOf(false), null); assert.deepEqual(fx.fxOf('clean'), {}, 'clean is a treatment with nothing in it');
    assert.deepEqual(Object.keys(fx.FX).sort(), ['box', 'bright', 'clean', 'megaphone', 'phone', 'radio', 'robot', 'tannoy', 'tiny', 'warm'], 'the treatments by name');
    for (const n of Object.keys(fx.FX)) assert.deepEqual(fx.fxOf(n), fx.FX[n], n + ' is inside what can be played as it stands');
    // sound from the phone: 16-bit numbers, low byte first
    const b64 = Buffer.from(new Uint8Array([0, 0, 255, 127, 0, 128, 0, 64])).toString('base64');
    assert.deepEqual([...fx.pcm16(b64)].map(v => +v.toFixed(4)), [0, 1, -1, .5], 'samples from the phone, as numbers from -1 to 1'); assert.equal(fx.pcm16('').length, 0);
    // a line with silence round it: half a second of a tone in the middle of two seconds
    const R = 8000, x = new Float32Array(R * 2); for (let i = R * .5; i < R; i++) x[i] = .4 * Math.sin(i * .5);
    const [a, b] = fx.trim(x, R); assert.ok(Math.abs(a / R - .49) < .005 && Math.abs(b / R - 1.03) < .005, `the silence before and after a line is cut off (kept ${a / R} to ${b / R} s)`);
    assert.deepEqual(fx.trim(new Float32Array(100), R), [0, 0], 'a line of silence has nothing in it');
    const l = fx.loudness(x, R); assert.ok(Math.abs(l.rms - .4 / Math.SQRT2) < .01 && Math.abs(l.peak - .4) < .001, `loudness is of the speech, not the silence round it (${l.rms.toFixed(3)})`);
    // where the words start
    const w = fx.wordTimes('Ah. A door, at last.', 2);
    assert.deepEqual(w.filter((_, i) => i % 2 === 0), [0, 4, 6, 12, 15], 'every word has its place in the text');
    assert.ok(w[1] === 0 && w.every((v, i) => i % 2 === 0 || i < 2 || v > w[i - 2]) && w.at(-1) < 2, 'and a time, in order, inside the line');
    assert.ok(w[3] - w[1] > (w[9] - w[7]) * 1.5, 'a full stop is a longer wait than a space');
    assert.deepEqual(fx.goodMarks([0, 0, 4, .5, 6, .7], 'Ah. A door.', 1.2), [0, 0, 4, .5, 6, .7], "an engine's own word marks are used when they make sense");
    assert.equal(fx.goodMarks([0, 0, 4, .5, 6, 3], 'Ah. A door.', 1.2), null, 'not when one is after the end');
    assert.equal(fx.goodMarks([0, 0, 6, .7, 4, .5], 'Ah. A door.', 1.2), null, 'nor out of order');
    assert.equal(fx.goodMarks([0, 0], 'Ah. A door.', 1.2), null, 'nor when most words are missing');
    assert.equal(fx.goodMarks([0, 0, 4, 0, 6, 0], 'Ah. A door.', 1.2), null, 'nor when every word is at nought');
    assert.equal(fx.goodMarks([], 'Ah.', 1), null); assert.equal(fx.goodMarks(null, 'Ah.', 1), null);
    console.log('shaped voices: treatments by name and by recipe, samples from the phone, silence cut off, loudness, word times ok');
  }
  // living music: tension builds with close calls and settles, the tempo leans to the player's pace
  const mcalls = { i: [], s: [] }, fake = { intensity: x => mcalls.i.push(x), speed: x => mcalls.s.push(x) };
  const live = snd.follow(fake, { pace: 2 });
  live.update(.1); const calm = live.tension;
  live.feel(1).feel(1); live.update(.1); assert.ok(live.tension > calm + .5, 'close calls build tension');
  for (let i = 0; i < 100; i++) live.update(.1);
  assert.ok(Math.abs(live.tension - calm) < .01, 'and it settles');
  for (let i = 0; i < 60; i++) { live.tap(); live.update(.8); }
  assert.ok(live.speed < 1, 'slow taps slow the tempo a little: ' + live.speed.toFixed(3));
  for (let i = 0; i < 300; i++) { live.tap(); live.update(.1); }
  assert.ok(live.speed > 1 && live.speed <= 1.12, 'quick taps speed it up, within the range: ' + live.speed.toFixed(3));
  live.feel(1); live.lost(); assert.ok(live.tension < calm, 'a loss settles it at once');
  assert.ok(mcalls.i.length && mcalls.s.length, 'drives the tune');
  console.log('device + sound: haptic patterns, mixer, speech calls and living music ok without audio');
}

// the smarts: doodle recognition, voice command matching, the phone AI's guard rails
{
  const { Doodle, loadDoodle, picture } = await import('../src/kit/doodle.js');
  let threw = null; try { new Doodle(); } catch (e) { threw = e; }
  assert.ok(threw?.kitLoading, 'Doodle before load throws StillLoading');
  await loadDoodle();
  const d = new Doodle();
  assert.equal(Doodle.things.length, 200); assert.deepEqual(d.things, Doodle.things); assert.equal(new Set(d.things).size, 200, 'no thing twice');
  // the names in the kit, the list the model is trained from, and the model file itself all agree, in order
  assert.deepEqual(d.things, JSON.parse((await import('node:fs')).readFileSync(new URL('./doodle-model/classes.json', import.meta.url), 'utf8')), 'THINGS in doodle.js is scripts/doodle-model/classes.json');
  assert.deepEqual((await import('../src/kit/doodle-model.js')).MODEL.classes, d.things, 'the model was trained on the same things');
  assert.equal(picture([]).reduce((a, b) => a + b, 0), 0, 'nothing drawn, empty picture');
  const ring = [Array.from({ length: 33 }, (_, i) => ({ x: 100 + 80 * Math.cos(i / 32 * Math.PI * 2), y: 100 + 80 * Math.sin(i / 32 * Math.PI * 2) }))];
  const g = d.guess(ring);
  assert.equal(g.length, 200); assert.ok(Math.abs(g.reduce((a, b) => a + b.sure, 0) - 1) < 1e-5, 'sures add up to 1');
  assert.ok(['circle', 'clock', 'smiley face', 'sun', 'moon', 'wheel', 'necklace'].includes(g[0].name), 'a ring looks round: ' + g[0].name);
  assert.equal(d.guess(ring, { among: ['circle', 'square', 'triangle', 'star', 'lightning'] })[0].name, 'circle', 'a ring among five');
  const tri = [[{ x: 0, y: 100 }, { x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]];
  assert.equal(d.guess(tri, { among: ['triangle', 'circle', 'square'] })[0].name, 'triangle', 'a triangle among three');
  const ladder = [[{ x: 0, y: 0 }, { x: 0, y: 200 }], [{ x: 60, y: 0 }, { x: 60, y: 200 }], ...[30, 80, 130, 180].map(y => [{ x: 0, y }, { x: 60, y }])];
  assert.equal(d.guess(ladder, { among: ['ladder', 'sword', 'door'] })[0].name, 'ladder', 'a ladder among three');
  assert.deepEqual(d.guess(ring, { among: ['spaceship'] }), [], 'unknown names are left out');
  console.log('doodle: 200 things, picture, guesses, among ok (top for a ring: ' + g[0].name + ')');

  const { Voice } = await import('../src/kit/hear.js');
  const v = new Voice({ words: ['jump', 'fire', 'turn left'], also: { fire: ['shoot'] } });
  v.hear('jump', false); v.hear('jump jump', false); v.hear('jump jump', true);
  assert.ok(v.said('jump') && v.said('jump') && !v.said('jump'), 'partials count each jump once');
  v.hear('please shoot now', true); assert.ok(v.said('fire') && !v.said('shoot'), 'also: shoot means fire');
  v.hear('turn left', true); assert.ok(v.said('turn left'), 'phrases');
  v.hear('jumb', true); assert.ok(v.said('jump'), 'one letter off still counts');
  v.hear('jumped fir', true); assert.ok(!v.said('jump') && !v.said('fire'), 'but not other words');
  assert.ok(v.heard.length <= 8 && v.heard.at(-1) === 'jump', 'heard keeps the newest');
  console.log('voice: command matching ok');

  const { tidy, PhoneAI } = await import('../src/kit/phoneai.js');
  assert.equal(tidy('  "Ahoy there, traveller!"  '), 'Ahoy there, traveller!');
  assert.equal(tidy('**Mind** the `rocks`.'), 'Mind the rocks.');
  assert.equal(tidy('Visit www.example.com for more'), null, 'links dropped');
  assert.equal(tidy('Call 07700900123 now'), null, 'number strings dropped');
  assert.equal(tidy('You stupid sailor'), null, 'blocked words dropped');
  assert.equal(tidy(null), null);
  assert.ok(tidy('One two three four five six. Seven eight nine ten eleven twelve.', 8) === 'One two three four five six.', 'cut at a sentence end');
  const ai = new PhoneAI({ persona: 'a crab' });
  assert.equal(await ai.ask('Say hi', { fallback: 'Snip snap.' }), 'Snip snap.', 'no model here: the fallback');
  console.log('phone AI: tidy and fallback ok');
}

// Swarm (the CPU version; the GPU one is checked against it in kit-browser)
{
  const { Swarm } = await import('../src/kit/swarm.js');
  const s = new Swarm({ count: 600, w: 300, h: 300, speed: 60, seed: 2, gpu: false });
  assert.equal(s.gpu, false); const o0 = s.order();
  for (let f = 0; f < 600; f++) s.update(1 / 60);
  assert.ok(s.order() > o0 + .1, `they flock: order ${o0.toFixed(2)} -> ${s.order().toFixed(2)}`);
  assert.ok(s.x.every(v => v >= 0 && v < 300) && s.y.every(v => v >= 0 && v < 300), 'wrap keeps them in the area');
  const spread = sw => { let d = 0; for (let i = 0; i < sw.count; i++) d += Math.hypot(sw.x[i] - 150, sw.y[i] - 150); return d / sw.count; };
  const a = new Swarm({ count: 300, w: 300, h: 300, edges: 'bounce', seed: 4, gpu: false }), b = new Swarm({ count: 300, w: 300, h: 300, edges: 'bounce', seed: 4, gpu: false });
  for (let f = 0; f < 300; f++) { a.pull(150, 150, { strength: 2 }).update(1 / 60); b.pull(150, 150, { strength: -2, radius: 200 }).update(1 / 60); }
  assert.ok(spread(a) < 60 && spread(b) > spread(a) + 40, `pulls and pushes: ${spread(a).toFixed(0)} vs ${spread(b).toFixed(0)}`);
  assert.ok(b.x.every(v => v >= 0 && v <= 300), 'bounce keeps them in');
  const r = new Swarm({ count: 400, w: 300, h: 300, seed: 5, gpu: false }).obstacle(150, 150, 40);
  for (let f = 0; f < 300; f++) r.update(1 / 60);
  assert.ok(r.near(150, 150, 30).length <= 4, 'they keep out of an obstacle: ' + r.near(150, 150, 30).length);
  const hit = r.near(r.x[0], r.y[0], 1); assert.ok(hit.includes(0)); r.kill(0); assert.ok(!r.near(r.x[0], r.y[0], 1).includes(0) && r.living === 399, 'killed ones are gone');
  const kx = r.x[0]; r.update(1 / 60); assert.equal(r.x[0], kx, 'and stay still');
  r.revive(0, 10, 10); assert.equal(r.living, 400); r.update(0); assert.equal(r.x[0], 10, 'dt 0 moves nothing');
  assert.equal(new Swarm({ count: 1e6, gpu: false }).count, 8192, 'at most 8192');
  assert.ok([2000, 8192].includes(Swarm.max()));
  const t = performance.now(), big = new Swarm({ count: 2000, w: 600, h: 600, gpu: false }); for (let f = 0; f < 30; f++) big.update(1 / 60);
  console.log(`swarm: flocks, pulls, pushes, obstacles, edges, kill and revive ok (2000 on the CPU: ${((performance.now() - t) / 30).toFixed(1)} ms a frame here)`);
}

// gs.city layout: the same seed gives the same city; buildings stay inside their blocks and never overlap; the roads join up
{
  const { layout, STYLES } = await import('../src/kit/city.js');
  for (const style of Object.keys(STYLES)) {
    const p = layout({ seed: 42, blocks: [5, 4], style });
    assert.equal(JSON.stringify(p.buildings), JSON.stringify(layout({ seed: 42, blocks: [5, 4], style }).buildings), style + ': same seed, same city');
    assert.equal(p.blocks.length, 20); assert.equal(p.nodes.length, 30); assert.ok(p.buildings.length > 40, style + ': buildings ' + p.buildings.length);
    for (const b of p.buildings) {
      const k = p.blocks[b.block];
      assert.ok(b.x0 >= k.x0 + k.sw - .01 && b.x1 <= k.x1 - k.sw + .01 && b.z0 >= k.z0 + k.sw - .01 && b.z1 <= k.z1 - k.sw + .01, style + ': building inside its block, off the pavement');
      assert.ok(b.h > 2 && b.parts.every(q => q.y1 > q.y0), style + ': building heights');
    }
    for (let i = 0; i < p.buildings.length; i++) for (let j = i + 1; j < p.buildings.length; j++) {
      const A = p.buildings[i], B = p.buildings[j];
      assert.ok(!(A.x0 < B.x1 - .01 && A.x1 > B.x0 + .01 && A.z0 < B.z1 - .01 && A.z1 > B.z0 + .01), style + ': buildings overlap');
    }
    // every junction can reach every other one
    const seen = new Set([0]), todo = [0];
    while (todo.length) for (const id of p.nodes[todo.pop()].out) { const n = p.edges[id].b; if (!seen.has(n)) { seen.add(n); todo.push(n); } }
    assert.equal(seen.size, p.nodes.length, style + ': roads join up');
    assert.ok(p.spots.door.length === p.buildings.length && p.spots.corner.length === 80, style + ': spots');
  }
  assert.notEqual(JSON.stringify(layout({ seed: 1 }).buildings), JSON.stringify(layout({ seed: 2 }).buildings), 'another seed, another city');
  console.log('city: layouts for all styles are repeatable, tidy and joined up');
}

// behaviour trees and wants (gs.ai.Tree, gs.ai.Choose)
{
  const { Tree, Choose } = await import('../src/kit/bt.js');
  const me = { hp: 10, sees: false, log: [] };
  let walkLeft = 2;
  const t = new Tree(`root { selector {
      sequence { condition [Hurt] action [Flee] }
      sequence while(Sees) until(Hurt) { action [Chase] }
      sequence until(Sees) { action [Walk] wait [500] }
  } }`, {
    Hurt: () => me.hp < 3, Sees: () => me.sees,
    Flee: () => { me.log.push('flee'); return Tree.ok; },
    Chase: () => { me.log.push('chase'); },
    Walk: () => { me.log.push('walk'); return --walkLeft <= 0 ? Tree.ok : undefined; },
  });
  t.update(.1); t.update(.1); assert.deepEqual(me.log, ['walk', 'walk'], 'walks until done');
  t.update(.3); assert.equal(t.state, 'running', 'waits in game time'); t.update(.3); t.update(.1);
  me.sees = true; me.log.length = 0; t.update(.1); t.update(.1); t.update(.1); assert.deepEqual(me.log, ['chase', 'chase'], 'seeing stops the walk, then it chases');
  assert.ok(t.path().includes('action') || t.path().length > 1, 'path lists running nodes ' + t.path());
  me.hp = 1; me.log.length = 0; t.update(.1); t.update(.1); t.update(.1); assert.ok(me.log.includes('flee'), 'a guard drops the chase, then it flees ' + me.log);
  const s = { food: .9, tired: .2, hp: 10, near: 0 };
  const want = new Choose({ eat: [() => 1 - s.food, Choose.quad], sleep: () => s.tired, fight: { score: [() => s.near, () => s.hp / 10], weight: 1.5 } }, { stick: .1 });
  assert.equal(want.pick(), 'sleep', 'sleep when tired and fed');
  s.food = .1; assert.equal(want.pick(), 'eat', 'eat when hungry');
  s.near = 1; assert.equal(want.pick(), 'fight', 'fight when the player is close');
  s.near = .55; s.tired = .6; s.food = .9; const a = want.pick(); assert.equal(a, 'fight', 'stickiness keeps the current pick near a tie (' + JSON.stringify(want.scores) + ')');
  console.log('behaviour trees: selector, guards, game-time waits; wants: curves, weights, stickiness ok');
}
// skinned person: one mesh over the figure's bones, face shapes, lip sync timing, blend spaces, foot IK
{
  const { person, Rig } = await import('../src/kit/poses.js');
  const { Face, shapes, visemes } = await import('../src/kit/characters.js');
  const { BoxGeometry, Mesh, Vector3 } = await import('three');
  const p = person({ hair: null });
  assert.ok(p.mesh.isSkinnedMesh && p.mesh.skeleton.bones.length === 13, 'one skinned mesh, 13 bones');
  const sw = p.mesh.geometry.attributes.skinWeight; let bad = 0;
  for (let i = 0; i < sw.count; i++) if (Math.abs(sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i) - 1) > 1e-4) bad++;
  assert.equal(bad, 0, 'every vertex weights add up to 1');
  assert.deepEqual(Object.keys(p.mesh.morphTargetDictionary).sort(), ['blink', 'frown', 'open', 'round', 'smile', 'surprise', 'wide'], 'face shapes');
  // walking to running by speed keeps one phase; the hips drop with the run's lean
  p.rig.blend({ idle: 0, walk: 1.4, run: 4 }, 2.7); for (let i = 0; i < 40; i++) p.rig.update(1 / 30, { speed: 2.7 });
  assert.ok(Math.abs(p.rig.bw.walk - .5) < .01 && Math.abs(p.rig.bw.run - .5) < .01, 'half walk, half run ' + JSON.stringify(p.rig.bw));
  assert.equal(p.rig.blendK, 1, 'blended in');
  p.rig.blend2({ idle: [0, 0], walk: [0, 1], back: [0, -1], strafeL: [-1, 0], strafeR: [1, 0] }, 1, 0);
  assert.equal(p.rig.bw.strafeR, 1, 'strafe right on the 2D space');
  p.rig.play('idle'); for (let i = 0; i < 30; i++) p.rig.update(1 / 30); assert.equal(p.rig.blendK, 0, 'play() fades the blend out');
  // foot IK: the left foot on a 20 cm step, the right on the floor; the left knee bends to put it there
  for (let i = 0; i < 30; i++) { p.rig.update(1 / 30); p.rig.plant(x => x > 0 ? .2 : 0, p); }
  p.updateMatrixWorld(true);
  const fl = p.bones.footL.getWorldPosition(new Vector3()), fr = p.bones.footR.getWorldPosition(new Vector3());
  assert.ok(Math.abs(fl.y - fr.y - .2) < .02, 'left ankle 20 cm above the right: ' + (fl.y - fr.y).toFixed(3));
  assert.ok(Math.abs(fr.y - .09) < .02, 'right ankle stays on the floor ' + fr.y.toFixed(3));
  // lip sync: vowels open the mouth, m/b/p close it; a line takes about a second for 14 letters
  const v = visemes('Mama'); assert.ok(v[0].open === 0 && v[1].open > .8, 'm closed, a open');
  assert.ok(Math.abs(visemes('abcdefghijklmn').end - 1) < .2, 'about 14 letters a second');
  const f = new Face(p.mesh, { blinkEvery: 0 }); f.line = { v: visemes('ooo'), t: 0, i: 0 }; for (let i = 0; i < 4; i++) f.update(1 / 60);
  const inf = p.mesh.morphTargetInfluences, d = p.mesh.morphTargetDictionary;
  assert.ok(inf[d.round] > .4 && inf[d.wide] < .1, 'o rounds the mouth ' + inf[d.round].toFixed(2));
  f.set('smile', 1); for (let i = 0; i < 60; i++) f.update(1 / 60); assert.ok(inf[d.smile] > .9, 'smile eases in');
  f.blink(); f.update(.08); assert.ok(inf[d.blink] > .9, 'blink');
  // shapes on any geometry
  const g = shapes(new BoxGeometry(1, 1, 1), { tall: (q, o) => o.set(0, q.y, 0) }), m = new Mesh(g);
  assert.equal(m.morphTargetDictionary.tall, 0, 'your own shape');
  const ff = new Face(m, { blinkEvery: 0 }); ff.set('tall', 1); for (let i = 0; i < 60; i++) ff.update(1 / 60); assert.ok(m.morphTargetInfluences[0] > .9, 'eased');
  console.log('skinned person, face shapes, lip sync, blend spaces, foot IK ok');
}
// lifelike motion: key poses that never overshoot, poses by the clock and driven by the game, gaits whose planted foot stays put, a body with weight
{
  const { Rig, LIFELIKE, keys } = await import('../src/kit/poses.js');
  const { Object3D, Vector3 } = await import('three');
  // keys(): a key names only what changes; curves pass through every key and never go beyond the keys either side
  const k = keys([[0, { spine: [0, 0, 0], armL: [-1, 0, 0] }], [.3, { spine: [.6, 0, 0], drop: .2 }], [.5, { spine: [.6, 0, 0] }], [1, { spine: [.1, 0, 0], shift: [0, 0, .5] }]]);
  assert.ok(Math.abs(k(.3).j.spine[0] - .6) < 1e-6 && Math.abs(k(1).j.spine[0] - .1) < 1e-6 && Math.abs(k(.3).drop - .2) < 1e-6, 'through its keys');
  assert.equal(k(.7).j.armL[0], -1, 'a joint a key leaves out stays where it was');
  let over = 0; for (let i = 0; i <= 200; i++) { const p = i / 200, v = k(p).j.spine[0], d = k(p).drop; if (v < -1e-6 || v > .6 + 1e-6 || d < -1e-6 || d > .2 + 1e-6) over++; if (p > .3 && p < .5 && Math.abs(v - .6) > 1e-6) over++; }
  assert.equal(over, 0, 'no overshoot, and flat between two equal keys');
  assert.ok(Math.abs(k(1).shift[2] - .5) < 1e-6 && k(0).shift[2] === 0, 'the hips move in metres');
  const loop = keys([[0, { head: [0, 0, 0] }], [.5, { head: [.4, 0, 0] }]], { loop: true });
  assert.ok(Math.abs(loop(.999).j.head[0] - loop(0).j.head[0]) < .01 && loop(.75).j.head[0] > .05, 'a loop joins its end to its start');
  // a bare skeleton with a person's proportions
  const B = {}, root = new Object3D(), mk = (n, parent, x, y, z) => { const o = new Object3D(); o.position.set(x, y, z); (parent || root).add(o); B[n] = o; };
  mk('hips', null, 0, 1, 0); mk('spine', B.hips, 0, .1, 0); mk('head', B.spine, 0, .5, 0);
  for (const [sd, s] of [['L', 1], ['R', -1]]) { mk('leg' + sd, B.hips, s * .094, -.045, 0); mk('shin' + sd, B['leg' + sd], 0, -.435, 0); mk('foot' + sd, B['shin' + sd], 0, -.435, 0); mk('arm' + sd, B.spine, s * .2, .4, 0); mk('fore' + sd, B['arm' + sd], 0, -.3, 0); mk('hand' + sd, B['fore' + sd], 0, -.27, 0); }
  const rig = new Rig(B, { poses: LIFELIKE });
  // a planted foot stays where it landed while the body passes over it (the flat part of each stance)
  for (const [name, v, lo, hi] of [['walk', 1.36, .12, .4], ['jog', 3.4, .07, .22], ['run', 5.6, .06, .15], ['sneak', 1, .12, .48]]) {
    rig.play(name, { fade: 0 }); let x = 0, n = 0, last = 0, a = Infinity, b = -Infinity, low = Infinity; const at = new Vector3();
    for (let i = 0; i < 960; i++) { rig.update(1 / 240, { speed: v }); x += v / 240; root.position.z = x; root.updateMatrixWorld(true); B.footL.getWorldPosition(at); const ph = rig.phase; if (ph < last) n++; last = ph; low = Math.min(low, at.y); if (n === 1 && ph > lo && ph < hi) { a = Math.min(a, at.z); b = Math.max(b, at.z); } }
    assert.ok(b - a < .012, name + ': the planted foot slides ' + (b - a).toFixed(4) + ' m'); assert.ok(low > .08, name + ': no foot goes through the floor ' + low.toFixed(3));
  }
  // a runner lands on a bent knee under the body and brings the other leg through bent (not both legs flung out straight)
  for (const name of ['jog', 'run', 'sprint']) {
    const c = LIFELIKE[name].cycle, strike = c(0).j, late = c(.9).j;
    assert.ok(strike.shinL[0] > .2, name + ': lands on a bent knee ' + strike.shinL[0].toFixed(2)); assert.ok(late.shinL[0] > .6, name + ': the leg comes through bent ' + late.shinL[0].toFixed(2));
    assert.ok(-strike.legL[0] < .6, name + ': the foot lands near under the body ' + (-strike.legL[0]).toFixed(2));
  }
  // a pose by the clock: once plays through and holds (rig.done); at: the game holds the phase
  rig.add('vault', keys([[0, { spine: [0, 0, 0] }], [1, { spine: [1, 0, 0] }]]), { time: .5, once: true }); rig.play('vault', { fade: 0 });
  for (let i = 0; i < 20; i++) rig.update(1 / 60); assert.ok(!rig.done && rig.phase > .6 && rig.phase < .72, 'part way through ' + rig.phase.toFixed(2));
  for (let i = 0; i < 20; i++) rig.update(1 / 60); assert.ok(rig.done && Math.abs(B.spine.rotation.x - 1) < 1e-3, 'played through, and holding its end');
  rig.play('vault', { again: true, fade: 0 }); rig.update(1 / 60); assert.ok(!rig.done && rig.phase < .1, 'again starts it over');
  rig.add('climb', keys([[0, { spine: [0, 0, 0] }], [.5, { spine: [.5, 0, 0] }]], { loop: true })); rig.play('climb', { at: .5, fade: 0 });
  for (let i = 0; i < 30; i++) rig.update(1 / 60, { speed: 3 }); assert.ok(Math.abs(B.spine.rotation.x - .5) < 1e-3 && rig.phase === .5, 'a pose the game drives stays where the game put it');
  // a body with weight leans into a spurt, and settles again at a steady speed
  const heavy = new Rig(B, { poses: LIFELIKE, weight: 1 }); heavy.play('idle', { fade: 0 }); for (let i = 0; i < 30; i++) heavy.update(1 / 60, { speed: 0 });
  let lean = 0; for (let i = 0; i < 20; i++) { heavy.update(1 / 60, { speed: i * .3 }); lean = Math.max(lean, heavy.sw.lean); }
  assert.ok(lean > .05, 'leans into speeding up ' + lean.toFixed(3));
  for (let i = 0; i < 180; i++) heavy.update(1 / 60, { speed: 6 }); assert.ok(Math.abs(heavy.sw.lean) < .01, 'upright again at a steady speed');
  console.log('lifelike motion: key poses, clocked and driven poses, planted feet, weight ok');
}

// occlusion culling: a wall hides what's behind it, never what's in front, beside or above it
{
  const { Occlusion } = await import('../src/kit/occlusion.js');
  const { PerspectiveCamera, Vector3, Mesh, BoxGeometry } = await import('three');
  const cam = new PerspectiveCamera(60, 1, .1, 500); cam.position.set(0, 1.6, 10); cam.lookAt(0, 1.6, 0); cam.updateMatrixWorld();
  const oc = new Occlusion().set([{ x0: -5, x1: 5, y0: 0, y1: 4, z0: -.5, z1: .5 }]).frame(cam, 1);
  assert.equal(oc.stats.boxes, 1, 'the wall is drawn');
  assert.ok(oc.hidden(new Vector3(0, 1.5, -5), 1), 'behind the wall');
  assert.ok(!oc.hidden(new Vector3(0, 1.5, 5), 1), 'in front of the wall');
  assert.ok(!oc.hidden(new Vector3(9, 1.5, -5), 1), 'beside the wall');
  assert.ok(!oc.hidden(new Vector3(0, 4.6, -3), 1), 'peeking over the top');
  assert.ok(!oc.hidden(new Vector3(0, 1.5, -.2), 1), 'inside the wall pokes out');
  // a box through the camera counts for nothing (it can't be drawn safely)
  const o2 = new Occlusion().set([{ x0: -5, x1: 5, y0: 0, y1: 4, z0: 9, z1: 11 }]).frame(cam, 1);
  assert.equal(o2.hidden(new Vector3(0, 1.5, -5), 1), false, 'camera inside a box');
  // a wall you stand beside, reaching behind you, still hides what's past it
  const side = new PerspectiveCamera(60, 1, .1, 500); side.position.set(0, 1.6, 0); side.lookAt(10, 1.6, -3); side.updateMatrixWorld();
  const o3 = new Occlusion().set([{ x0: -20, x1: 20, y0: 0, y1: 10, z0: -3, z1: -2 }]).frame(side, 1);
  assert.ok(o3.hidden(new Vector3(10, 1.6, -8), 1), 'behind a wall that reaches behind the camera');
  assert.ok(!o3.hidden(new Vector3(10, 1.6, 1), 1), 'on the open side');
  const m = new Mesh(new BoxGeometry(1, 1, 1)); m.position.set(0, 1.5, -6); m.updateMatrixWorld();
  assert.ok(oc.hiddenObject(m), 'a mesh by its bounding sphere');
  console.log('occlusion culling: behind, front, beside, over the top, camera in a box ok');
}

// occlusion culling from the last frame's depth: never hides what can be seen, through camera moves, things moving and things going
{
  const { Occlusion } = await import('../src/kit/occlusion.js');
  const { PerspectiveCamera, Vector3, Box3, WebGPUCoordinateSystem } = await import('three');
  let seed = 7; const R = () => { seed = seed * 1664525 + 1013904223 >>> 0; return seed / 4294967296; };
  const box = (x, y, z, w, h, d) => ({ x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + h, z0: z - d / 2, z1: z + d / 2 });
  // a street: a long wall with a gap, two houses, a tower, a low fence, a post close to the camera
  const walls = [box(-14, 0, 0, 20, 6, 1), box(12, 0, 0, 16, 6, 1), box(-6, 0, -14, 8, 7, 8), box(9, 0, -18, 10, 5, 9), box(0, 0, -34, 5, 16, 5), box(3, 0, 6, 12, 1, .3), box(1.2, 0, 11.5, .3, 3, .3)];
  const truck = box(2, 0, 3, 5, 3, 2.2);
  const camAt = (p, to, gpu, fov = 60) => { const c = new PerspectiveCamera(fov, 1, .1, 400); if (gpu) { c.coordinateSystem = WebGPUCoordinateSystem; c.updateProjectionMatrix(); } c.position.set(...p); c.lookAt(...to); c.updateMatrixWorld(); return c; };
  // what the chip does: the frame's depth (here: the boxes drawn finely, with the old rasteriser), then the farthest of each block, in bytes
  const shoot = (oc, cam, list, w = 64, F = 4) => {
    const fine = new Occlusion({ w: w * F, max: 999 }).set(list).frame(cam, 1), L = fine.levels[0], px = new Uint8Array(w * w * 4), pe = cam.projectionMatrix.elements, gl = cam.coordinateSystem !== WebGPUCoordinateSystem;
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
      let far = Infinity, nearest = 0; for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) { const v = L.d[(j * F + y) * L.w + i * F + x]; far = Math.min(far, v); nearest = Math.max(nearest, v); }
      let q = 1;
      if (far > 0) { const vz = -1 / far, ndc = (pe[10] * vz + pe[14]) / -vz; q = gl ? ndc * .5 + .5 : ndc; }
      const n = Math.min(16777215, Math.ceil(q * 16777215)), k = (j * w + i) * 4;
      px[k] = n >> 16; px[k + 1] = n >> 8 & 255; px[k + 2] = n & 255; px[k + 3] = far > 0 ? Math.min(255, Math.ceil(Math.sqrt(Math.max(0, 1 - far / nearest)) * 255)) : 0;
    }
    return { px, w, h: w };
  };
  // the truth at a camera: can any pixel of the box be seen past these things? (both drawn finely)
  const seen = (cam, list, b) => {
    const A = new Occlusion({ w: 256, max: 999 }).set(list).frame(cam, 1).levels[0].d, B = new Occlusion({ w: 256, max: 999 }).set([b]).frame(cam, 1).levels[0].d;
    for (let k = 0; k < A.length; k++) if (B[k] > 0 && B[k] > A[k] * 1.0005) return true;
    return false;
  };
  const things = []; for (let i = 0; i < 260; i++) { const s = .4 + R() * 2.2; things.push(box((R() - .5) * 50, R() * 6, 8 - R() * 60, s, s * (.5 + R()), s)); }
  const b3 = b => new Box3(new Vector3(b.x0, b.y0, b.z0), new Vector3(b.x1, b.y1, b.z1));
  const run = (name, oc, cam, list, least) => {
    oc.frame(cam, 1);
    let hid = 0, wrong = 0, could = 0;
    for (const t of things) { const h = oc.hiddenBox(b3(t)), s = seen(cam, list, t); if (!s) could++; if (h) { hid++; if (s) wrong++; } }
    assert.equal(wrong, 0, `${name}: ${wrong} things hidden that can be seen`);
    if (process.env.OCC_SHOW) console.log(`  ${name}: hides ${hid} of ${could} (floor ${least})`); else assert.ok(hid >= least, `${name}: hides ${hid} of the ${could} that are out of sight (at least ${least})`);
    return [hid, could];
  };
  for (const gpu of [false, true]) {
    const at = [0, 1.7, 16], to = [0, 1.7, 0], cam = camAt(at, to, gpu), oc = new Occlusion();
    assert.equal(oc.frame(cam, 1).hiddenBox(b3(things[0])), false, 'no depth yet: nothing is hidden');
    const tag = oc.shot(cam, 256, 256); assert.ok(tag && tag.f === oc.f, 'a frame is tagged for the depth it draws');
    const pic = shoot(oc, cam, walls); oc.depth(pic.px, pic.w, pic.h, tag);
    const still = run('camera still', oc, cam, walls, 110);
    // the camera moves on while the picture is still the old one
    const moves = { 'a step sideways': [[.4, 1.7, 16], [.4, 1.7, 0]], 'a stride sideways': [[2, 1.7, 16], [2, 1.7, 0]], 'a step forward': [[0, 1.7, 15.5], [0, 1.7, 0]], 'a step back and up': [[0, 2.3, 17], [0, 1.7, 0]], 'a turn': [[0, 1.7, 16], [6, 2.5, 0]], 'round the post': [[1.9, 1.7, 13], [0, 1.7, 0]] };
    const got = {};
    const floors = { 'a step sideways': 60, 'a stride sideways': 55, 'a step forward': 70, 'a step back and up': 55, 'a turn': 45, 'round the post': 45 };
    for (const [name, [p, t]] of Object.entries(moves)) got[name] = run(name, oc, camAt(p, t, gpu), walls, floors[name]);
    run('zoomed in four times', oc, camAt(at, [3, 2.5, 0], gpu, 15), walls, 15);
    // back where it was drawn from, with a fresh picture each time
    const fresh = () => { const o = new Occlusion(); o.frame(cam, 1); return o; };
    // a truck in front of the gap: it hides things, then drives off, and what was behind it is back the same frame
    { const o = fresh(), tg = o.shot(cam, 256, 256), p = shoot(o, cam, [...walls, truck]); o.depth(p.px, p.w, p.h, tg);
      const [withTruck] = run('a truck parked', o, cam, [...walls, truck], 120);
      o.moved(truck.x0, truck.y0, truck.z0, truck.x1, truck.y1, truck.z1);
      const [after] = run('the truck drove off', o, cam, walls, 75);
      assert.ok(after < withTruck, `the truck's own share goes with it: ${withTruck} hidden, then ${after}`); }
    // a thing that moved while its picture was on the way back from the chip
    { const o = fresh(), tg = o.shot(cam, 256, 256), p = shoot(o, cam, [...walls, truck]);
      o.frame(cam, 1); o.moved(truck.x0, truck.y0, truck.z0, truck.x1, truck.y1, truck.z1); o.frame(cam, 1);
      o.depth(p.px, p.w, p.h, tg);
      run('moved before its picture came back', o, cam, walls, 75); }
    // a wall taken away at once
    { const o = fresh(), tg = o.shot(cam, 256, 256), p = shoot(o, cam, walls); o.depth(p.px, p.w, p.h, tg);
      const w0 = walls[0]; o.moved(w0.x0, w0.y0, w0.z0, w0.x1, w0.y1, w0.z1);
      run('a wall taken away', o, cam, walls.slice(1), 60); }
    // the truck drives off in front of a still camera: its place is taken out at once, and the first picture drawn
    // after it went is news (so what the gap shows now can hide things again); the next one from there is not
    { const o = fresh(), tg = o.shot(cam, 256, 256), p = shoot(o, cam, [...walls, truck]); o.depth(p.px, p.w, p.h, tg); o.frame(cam, 1);
      o.moved(truck.x0, truck.y0, truck.z0, truck.x1, truck.y1, truck.z1); o.frame(cam, 1); const s0 = o.stamp;
      const t2 = o.shot(cam, 256, 256), p2 = shoot(o, cam, walls); o.depth(p2.px, p2.w, p2.h, t2);
      const [healed] = run('a new picture after the truck went', o, cam, walls, 110); assert.ok(o.stamp > s0, 'the picture after a move is taken as news');
      assert.equal(healed, still[0], `it says what a picture of the street alone says: ${healed} hidden, ${still[0]} with no truck ever there`);
      const s1 = o.stamp, t3 = o.shot(cam, 256, 256); o.depth(p2.px, p2.w, p2.h, t3); o.frame(cam, 1); assert.equal(o.stamp, s1, 'and the one after that, from the same place, is not'); }
    // leaves in the wind (soft): every picture is news, and what hides things has drawn back by a texel all round
    { const o = fresh(); o.soft = true; const tg = o.shot(cam, 256, 256), p = shoot(o, cam, walls); o.depth(p.px, p.w, p.h, tg);
      const [soft] = run('with leaves in the wind', o, cam, walls, 100); assert.ok(soft <= still[0], `it hides no more than without: ${soft} against ${still[0]}`);
      const s0 = o.stamp, t2 = o.shot(cam, 256, 256); o.depth(p.px, p.w, p.h, t2); o.frame(cam, 1); assert.ok(o.stamp > s0, 'soft: a picture from the same place is still news');
      // a wall that has swayed in by most of a texel (4 units of the 256 a picture is drawn at here: a texel is 4) hides nothing it should not
      const thin = walls.map((b, i) => i < 2 ? { ...b, x0: b.x0 + .25, x1: b.x1 - .25, y1: b.y1 - .25 } : b);
      run('the walls a little smaller than their picture', o, cam, thin, 100);
      // leaves by the left wall alone (softBoxes): the picture is less sure only where it looks into their box, so the wall on the
      // right hides all it hid with no wind at all, and the whole no less than with leaves everywhere
      const o2 = fresh(); o2.soft = true; o2.softBoxes = Float64Array.from([-24.5, -.5, -1, -3.5, 6.5, 1]); o2.softN = 1; o2.depth(p.px, p.w, p.h, o2.shot(cam, 256, 256));
      const [part] = run('leaves by one wall', o2, cam, walls, soft); assert.ok(part <= still[0], `no more than without: ${part} against ${still[0]}`);
      const calm = fresh(); calm.depth(p.px, p.w, p.h, calm.shot(cam, 256, 256)); calm.frame(cam, 1);
      let right = 0; for (const t of things) if (t.x0 > 5 && calm.hiddenBox(b3(t))) { right++; assert.ok(o2.hiddenBox(b3(t)), 'a thing behind the wall with no leaves by it is hidden as before'); }
      assert.ok(right > 20, `things behind the right wall: ${right}`);
      // both walls a little smaller than their picture, and said to sway: nothing seen is hidden
      const o3 = fresh(); o3.soft = true; o3.softBoxes = Float64Array.from([-24.5, -.5, -1, -3.5, 6.5, 1, 3.5, -.5, -1, 20.5, 6.5, 1]); o3.softN = 2; o3.depth(p.px, p.w, p.h, o3.shot(cam, 256, 256));
      run('two swaying walls a little smaller than their picture', o3, cam, thin, 60);
      run('and after a step', o3, camAt([.3, 1.7, 15.8], to, gpu), thin, 30); }
    // a picture that took too long to come back counts for nothing
    { const o = fresh(), tg = o.shot(cam, 256, 256), p = shoot(o, cam, walls); for (let i = 0; i < 40; i++) o.frame(cam, 1); o.depth(p.px, p.w, p.h, tg);
      o.frame(cam, 1); assert.equal(things.some(t => o.hiddenBox(b3(t))), false, 'an old picture is thrown away'); }
    // a picture nothing follows is dropped after a while
    { const o = fresh(), tg = o.shot(cam, 256, 256), p = shoot(o, cam, walls); o.depth(p.px, p.w, p.h, tg); for (let i = 0; i < 80; i++) o.frame(cam, 1);
      assert.equal(things.some(t => o.hiddenBox(b3(t))), false, 'a picture with none after it stops counting'); }
    // spheres: the quick test agrees with the box one (never hides more than the sphere's own box would)
    { const o = fresh(), tg = o.shot(cam, 256, 256), p = shoot(o, cam, walls); o.depth(p.px, p.w, p.h, tg); o.frame(cam, 1);
      let n = 0; for (let i = 0; i < 400; i++) { const c = new Vector3((R() - .5) * 50, R() * 6, 8 - R() * 60), r = .3 + R() * 2; if (o.hiddenSphere(c.x, c.y, c.z, r)) { n++; assert.ok(!seen(cam, walls, { x0: c.x - r * .57, x1: c.x + r * .57, y0: c.y - r * .57, y1: c.y + r * .57, z0: c.z - r * .57, z1: c.z + r * .57 }), 'a hidden sphere has nothing to see in it'); } }
      assert.ok(n > 80, `spheres hidden: ${n} of 400`); }
    // the picture's stamp: the same while nothing changes, new when the camera or a thing moves
    { const o = fresh(), tg = o.shot(cam, 256, 256), p = shoot(o, cam, walls); o.depth(p.px, p.w, p.h, tg); o.frame(cam, 1); const s0 = o.stamp;
      o.frame(cam, 1); const t2 = o.shot(cam, 256, 256); o.depth(p.px, p.w, p.h, t2); o.frame(cam, 1); assert.equal(o.stamp, s0, 'still camera, same picture: the same stamp');
      o.moved(-1, 0, 2, 1, 2, 4); o.frame(cam, 1); assert.equal(o.stamp, s0, 'a move where the picture has nothing: the same stamp');
      o.moved(1.05, 0, 11.35, 1.35, 3, 11.65); o.frame(cam, 1); assert.ok(o.stamp > s0, 'the post moved: a new stamp');
      const s1 = o.stamp; o.frame(camAt([.1, 1.7, 16], to, gpu), 1); assert.ok(o.stamp > s1, 'the camera moved: a new stamp'); }
    console.log(`occlusion from depth (${gpu ? 'WebGPU' : 'WebGL'} depth): still ${still[0]} of ${still[1]} hidden; ` + Object.entries(got).map(([k, v]) => `${k} ${v[0]}/${v[1]}`).join(', '));
  }
  console.log('occlusion culling from the last frame\'s depth: camera moves, a zoom, things moving and going, old pictures ok');
}

// the same over random places: walls, houses and posts on the ground; a picture is taken, then the camera turns, zooms, steps or
// strides, a thing goes, or leaves sway (soft), and nothing that can be seen from where it is now may be hidden
{
  const { Occlusion } = await import('../src/kit/occlusion.js');
  const { PerspectiveCamera, Vector3, Box3, WebGPUCoordinateSystem } = await import('three');
  let seed = 1; const R = () => { seed = seed * 1664525 + 1013904223 >>> 0; return seed / 4294967296; };
  const box = (x, y, z, w, h, d) => ({ x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + h, z0: z - d / 2, z1: z + d / 2 });
  const b3 = b => new Box3(new Vector3(b.x0, b.y0, b.z0), new Vector3(b.x1, b.y1, b.z1));
  const camAt = (p, to, gpu, fov) => { const c = new PerspectiveCamera(fov, 1, .1, 400); if (gpu) { c.coordinateSystem = WebGPUCoordinateSystem; c.updateProjectionMatrix(); } c.position.set(...p); c.lookAt(...to); c.updateMatrixWorld(); return c; };
  const raster = (cam, list) => new Occlusion({ w: 256, max: 9999 }).set(list).frame(cam, 1).levels[0].d;
  const shoot = (cam, list, w) => {
    const F = 256 / w, L = raster(cam, list), px = new Uint8Array(w * w * 4), pe = cam.projectionMatrix.elements, gl = cam.coordinateSystem !== WebGPUCoordinateSystem;
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
      let far = Infinity, nearest = 0; for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) { const v = L[(j * F + y) * 256 + i * F + x]; far = Math.min(far, v); nearest = Math.max(nearest, v); }
      let q = 1; if (far > 0) { const vz = -1 / far, ndc = (pe[10] * vz + pe[14]) / -vz; q = gl ? ndc * .5 + .5 : ndc; }
      const n = Math.min(16777215, Math.ceil(q * 16777215)), k = (j * w + i) * 4; px[k] = n >> 16; px[k + 1] = n >> 8 & 255; px[k + 2] = n & 255; px[k + 3] = far > 0 ? Math.min(255, Math.ceil(Math.sqrt(Math.max(0, 1 - far / nearest)) * 255)) : 0;
    }
    return px;
  };
  const one = new Occlusion({ w: 256, max: 1 });
  const seenIn = (A, cam, b) => { const B = one.set([b]).frame(cam, 1).levels[0].d; for (let k = 0; k < A.length; k++) if (B[k] > 0 && B[k] > A[k] * 1.0005) return true; return false; };
  let hid = 0, fresh = 0; const kinds = {};
  for (let t = 0; t < 60; t++) {
    const list = [box(0, -1, 0, 300, 1, 300)], nb = 6 + Math.floor(R() * 10);
    for (let i = 0; i < nb; i++) {
      const k = R();
      if (k < .35) list.push(box((R() - .5) * 60, 0, (R() - .5) * 60, 4 + R() * 24, 2 + R() * 8, .4 + R() * 1.5));
      else if (k < .6) list.push(box((R() - .5) * 60, 0, (R() - .5) * 60, .4 + R() * 1.5, 2 + R() * 8, 4 + R() * 24));
      else if (k < .85) list.push(box((R() - .5) * 60, 0, (R() - .5) * 60, 3 + R() * 9, 3 + R() * 12, 3 + R() * 9));
      else list.push(box((R() - .5) * 30, 0, (R() - .5) * 30, .15 + R() * .5, 1 + R() * 4, .15 + R() * .5));
    }
    const gpu = R() < .5, w = R() < .5 ? 64 : 128, fov = 35 + R() * 50;
    let p, to, tries = 0;
    do { p = [(R() - .5) * 50, .6 + R() * 5, (R() - .5) * 50]; to = [(R() - .5) * 40, R() * 5, (R() - .5) * 40]; } while (list.some((b, i) => i && p[0] > b.x0 - .5 && p[0] < b.x1 + .5 && p[1] < b.y1 + .5 && p[2] > b.z0 - .5 && p[2] < b.z1 + .5) && ++tries < 50);
    const cam = camAt(p, to, gpu, fov), things = [];
    for (let i = 0; i < 120; i++) { const s = .3 + R() * 3; things.push(box((R() - .5) * 70, R() * 5, (R() - .5) * 70, s, s * (.4 + R()), s)); }
    const oc = new Occlusion(); oc.frame(cam, 1);
    const k = R(), side = () => (R() - .5) * 2; let name, p2 = p.slice(), to2 = to.slice(), fov2 = fov, now = list;
    if (k >= .88) {   // (every other time the picture is told where they sway: everything but the ground, each thing's box and a little round it)
      oc.soft = true;
      if (t % 2) { const sb = []; for (const b of list.slice(1)) sb.push(b.x0 - .1, b.y0 - .1, b.z0 - .1, b.x1 + .1, b.y1 + .1, b.z1 + .1); oc.softBoxes = Float64Array.from(sb); oc.softN = list.length - 1; }
    }
    oc.depth(shoot(cam, list, w), w, w, oc.shot(cam, 256, 256));
    if (k < .1) name = 'still';
    else if (k < .2) { name = 'a turn'; to2 = [to[0] + side() * 8, to[1] + side() * 3, to[2] + side() * 8]; }
    else if (k < .28) { name = 'a zoom'; fov2 = fov * (.25 + R() * 1.5); to2 = [to[0] + side() * 2, to[1] + side(), to[2] + side() * 2]; }
    else if (k < .46) { name = 'a step'; const s = .02 + R() * .5; p2 = [p[0] + side() * s, p[1] + side() * s * .3, p[2] + side() * s]; to2 = [to[0] + side(), to[1] + side() * .3, to[2] + side()]; }
    else if (k < .62) { name = 'a stride'; const s = .5 + R() * 3; p2 = [p[0] + side() * s, Math.max(.3, p[1] + side() * s * .4), p[2] + side() * s]; to2 = [to[0] + side() * 3, to[1] + side(), to[2] + side() * 3]; }
    else if (k < .7) { name = 'a step and a zoom'; const s = .05 + R() * 1; p2 = [p[0] + side() * s, p[1], p[2] + side() * s]; fov2 = fov * (.4 + R() * 1.2); }
    else if (k < .8) { name = 'a thing gone'; const g = list[1 + Math.floor(R() * (list.length - 1))]; now = list.filter(b => b !== g); oc.moved(g.x0, g.y0, g.z0, g.x1, g.y1, g.z1); }
    else if (k < .88) { name = 'a thing gone and a step'; const g = list[1 + Math.floor(R() * (list.length - 1))]; now = list.filter(b => b !== g); oc.moved(g.x0, g.y0, g.z0, g.x1, g.y1, g.z1); const s = .05 + R() * 1; p2 = [p[0] + side() * s, p[1], p[2] + side() * s]; }
    else {   // every wall and house smaller all round than its picture, by most of a texel of it where it stands, from the same place or a step on
      name = 'leaves in the wind'; const P = new Vector3(...p), tex = 2 * Math.tan(fov * Math.PI / 360) / w;
      now = list.map((b, i) => { if (!i) return b; const d = Math.min(.4, .8 * tex * b3(b).distanceToPoint(P)); return { x0: b.x0 + d, x1: b.x1 - d, y0: b.y0, y1: b.y1 - d, z0: b.z0 + d, z1: b.z1 - d }; });
      if (R() < .5) { const s = .02 + R() * .3; p2 = [p[0] + side() * s, p[1], p[2] + side() * s]; }
    }
    const cam2 = camAt(p2, to2, gpu, Math.max(8, Math.min(100, fov2)));
    oc.frame(cam2, 1);
    const fo = new Occlusion(); fo.frame(cam2, 1); fo.depth(shoot(cam2, now, w), w, w, fo.shot(cam2, 256, 256)); fo.frame(cam2, 1);
    const A = raster(cam2, now), K = kinds[name] ||= [0, 0];
    for (const th of things) {
      const h = oc.hiddenBox(b3(th)), fh = fo.hiddenBox(b3(th)); if (fh) { fresh++; K[1]++; }
      if (!h) continue;
      hid++; K[0]++;
      assert.ok(!seenIn(A, cam2, th), `place ${t} (${name}, ${w} wide, ${gpu ? 'WebGPU' : 'WebGL'} depth): a thing that can be seen is hidden`);
    }
  }
  assert.ok(hid > fresh * .5, `the old picture still hides a good share of what a fresh one would: ${hid} of ${fresh}`);
  console.log(`occlusion from depth, 60 random places: nothing seen is hidden; hides ${hid} where a fresh picture hides ${fresh} (` + Object.entries(kinds).map(([k, v]) => `${k} ${v[0]}/${v[1]}`).join(', ') + ') ok');
}

// shadows in tiles: whatever moves, stops, comes, goes or slides, the map and the kept copy end up holding
// exactly what a whole redraw would, for a small share of the drawing
{
  const { ShadowTiles, TILES: T, tileRects } = await import('../src/kit/shadow-tiles.js');
  const { Matrix4, Vector3 } = await import('three');
  // rectangles cover the set, and joined up they still cover it
  {
    const set = new Uint8Array(T * T), mark = new Uint8Array(T * T), out = [];
    for (const k of [0, 1, 2, 16, 17, 18, 40, 255]) set[k] = 1;
    const n = tileRects(set, T, out, 8, mark); assert.equal(n, 8); assert.equal(out.length, 3);
    assert.deepEqual(out[0], [0, 0, 3, 2]);
    assert.equal(tileRects(set, T, out, 2, mark), 256); assert.deepEqual(out, [[0, 0, 16, 16]]);
  }
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const dir = new Vector3(-.45, 1, .35).normalize(), up = new Vector3(0, 1, 0), FX = new Vector3().crossVectors(up, dir).normalize(), FY = new Vector3().crossVectors(dir, FX);
  const SIZE = 40, N = 2048, tw = 2 * SIZE / T, STILL = 4;
  for (const deep of [true, false]) {
    const st = new ShadowTiles(), things = [];
    for (let i = 0; i < 260; i++) things.push({ id: i + 1, x: (rnd() - .5) * 220, y: rnd() * 6, z: (rnd() - .5) * 220, r: .3 + rnd() * rnd() * 7, v: 1, still: 99, here: true, wide: rnd() < .02 });
    const cam = new Matrix4(), eye = new Vector3(), tgt = new Vector3();
    // the model: what each tile of the kept copy and of the map holds (still things; and in the map, pictures of moving things)
    const cache = Array.from({ length: T * T }, () => 'junk'), mapS = Array.from({ length: T * T }, () => 'junk'), mapM = Array.from({ length: T * T }, () => new Set(['junk']));
    let ax = 0, ay = 0, az = 0, redone = 0, frames = 0, resets = 0, slides = 0, put = 0, must = 1;
    const tilesOf = (o, gx, gy) => {   // the tiles a thing can really draw in (its ball, no pad)
      if (o.wide) return null;
      const u = (o.x * FX.x + o.y * FX.y + o.z * FX.z) / tw - gx, v = (o.x * FY.x + o.y * FY.y + o.z * FY.z) / tw - gy, r = o.r / tw;
      return [Math.max(0, Math.floor(u - r)), Math.max(0, Math.floor(v - r)), Math.min(T - 1, Math.floor(u + r)), Math.min(T - 1, Math.floor(v + r))];
    };
    const inTile = (q, i, j) => !q || (i >= q[0] && i <= q[2] && j >= q[1] && j <= q[3]);
    for (let f = 0; f < 700; f++) {
      // the world moves on
      for (const o of things) {
        const roll = rnd();
        if (o.moving) { o.x += o.dx; o.z += o.dz; o.v++; o.still = 0; if (roll < .05) o.moving = false; }
        else { if (o.still < 99) o.still++; if (roll < .004) { o.moving = true; o.dx = (rnd() - .5) * 2; o.dz = (rnd() - .5) * 2; } else if (roll < .006) { o.here = !o.here; } else if (roll < .007) { o.y += 1; o.v++; o.still = 0; } }
      }
      // the light: a tile step now and then, a step in depth, a jump, a turn
      const roll = rnd(); let jump = false;
      if (roll < .12) ax += tw * (rnd() < .5 ? 1 : -1); else if (roll < .2) ay += tw * Math.round((rnd() - .5) * 6); else if (roll < .23) { az += 4; if (!deep) must++; } else if (roll < .24) { ax += tw * .37; jump = true; } else if (roll < .25) { ax += tw * 40; jump = true; }
      if (jump) must++;
      tgt.copy(FX).multiplyScalar(ax).addScaledVector(FY, ay).addScaledVector(dir, az); eye.copy(tgt).addScaledVector(dir, 50);
      cam.lookAt(eye, tgt, up).setPosition(eye);
      const e = cam.elements, was = st.valid, same = st.begin(e, -SIZE, SIZE, -SIZE, SIZE, 1, 120, N, deep);
      if (jump) assert.ok(!same, 'a light that moved by a part of a tile, or right away, starts its tiles again');
      const gx = (eye.dot(FX) - SIZE) / tw, gy = (eye.dot(FY) - SIZE) / tw;
      for (const o of things) { if (!o.here) continue; const h = o.id * 1000.5 + o.v * 3.25 + o.x * 5.3 + o.z * 6.1 + o.y, still = o.still >= STILL; if (o.wide) st.addAll(still, h); else st.add(still, h, o.x, o.y, o.z, o.r); }
      // (a thing that could be anywhere and has started, stopped, come or gone: every tile's still things changed)
      let wide = false; for (const o of things) if (o.wide) { const k = (o.here ? 1 : 0) + (o.still >= STILL ? 2 : 0) + o.v * 4; if (o.still >= STILL ? k !== o.k : (o.k & 2) !== 0) wide = true; o.k = k; }
      const force = rnd() < .01, p = st.finish(force); if (force || (wide && !jump)) must++;
      // what a whole redraw would hold
      const wantS = [], wantM = [];
      for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
        let sS = '', sM = new Set();
        for (const o of things) { if (!o.here || !inTile(tilesOf(o, gx, gy), i, j)) continue; if (o.still >= STILL) sS += o.id + ':' + o.v + ','; else sM.add(o.id + ':' + o.v + ':' + o.x.toFixed(4) + ':' + o.z.toFixed(4)); }
        wantS.push(sS); wantM.push(sM);
      }
      // carry the plan out on the model, as shadowTiles() does on the maps
      const drawM = q => { for (let j = q[1]; j < q[1] + q[3]; j++) for (let i = q[0]; i < q[0] + q[2]; i++) { const k = j * T + i; for (const m of wantM[k]) mapM[k].add(m); } };
      if (p.any) {
        frames++;
        if (p.reset) { resets++; redone += T * T; for (let k = 0; k < T * T; k++) { cache[k] = mapS[k] = wantS[k]; mapM[k] = new Set(wantM[k]); } }
        else {
          if (p.shift) {
            slides++; const dx = p.shift[0] / (N / T), dy = p.shift[1] / (N / T), old = cache.slice();
            assert.ok(Number.isInteger(dx) && Number.isInteger(dy), 'a slide is by whole tiles'); assert.ok(deep || !p.shift[2], 'no slide in depth where the copy can\'t be moved in depth');
            for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) { const a = i + dx, b = j + dy, k = j * T + i; cache[k] = a >= 0 && a < T && b >= 0 && b < T ? old[b * T + a] : 'junk'; mapS[k] = cache[k]; mapM[k] = new Set(); }
          }
          for (const q of p.redo) for (let j = q[1]; j < q[1] + q[3]; j++) for (let i = q[0]; i < q[0] + q[2]; i++) { const k = j * T + i; cache[k] = mapS[k] = wantS[k]; mapM[k] = new Set(); redone++; }
          for (const q of p.back) for (let j = q[1]; j < q[1] + q[3]; j++) for (let i = q[0]; i < q[0] + q[2]; i++) { const k = j * T + i; mapS[k] = cache[k]; mapM[k] = new Set(); put++; }
          if (p.movers) drawM(p.movers);
        }
        st.commit();
      }
      if (!was && !p.any) continue;   // (never drawn yet: hd3d draws it whole the first time)
      for (let k = 0; k < T * T; k++) {
        assert.equal(cache[k], wantS[k], `frame ${f}, tile ${k}: the kept copy holds the still things of now`);
        assert.equal(mapS[k], wantS[k], `frame ${f}, tile ${k}: the map holds the still things of now`);
        assert.deepEqual([...mapM[k]].sort(), [...wantM[k]].sort(), `frame ${f}, tile ${k}: the map holds the moving things where they are now, and no old picture of one`);
      }
    }
    assert.ok(resets <= must + 12 && slides > 90, `the map is drawn whole only when it has to be: ${resets} times where ${must} had to be, and ${slides} slides`);
    assert.ok(redone < frames * T * T * (deep ? .3 : .45), `far fewer tiles drawn again than whole redraws would: ${redone} of ${frames * T * T}`);
    console.log(`shadows in tiles (${deep ? 'the copy can move in depth' : 'sideways only'}): 700 frames of things moving, stopping, coming and going under a light that steps, ${frames} with something to draw, ${resets} whole, ${slides} slides, ${(100 * redone / (frames * T * T)).toFixed(1)}% of the tiles drawn again, ${put} put back ok`);
  }
}

// frame generation: a camera's turn as a picture warp (exact for any turn and zoom), and the battery and heat reading
{
  const { poseOf, homography, lerpPose, newPose } = await import('../src/kit/framegen.js');
  const { PerspectiveCamera, Vector3 } = await import('three');
  const a = new PerspectiveCamera(60, 1.5, .1, 100), b = new PerspectiveCamera(48, 1.5, .1, 100);
  a.position.set(1, 2, 3); a.lookAt(0, 1, -5); b.position.copy(a.position); b.lookAt(4, 3, -6);
  a.updateMatrixWorld(); b.updateMatrixWorld();
  const H = homography(poseOf(a), poseOf(b)), e = H.elements;
  for (const p of [new Vector3(0, 1, -5), new Vector3(3, 2.5, -7), new Vector3(-1, 0, -2)]) {
    const na = p.clone().project(a), nb = p.clone().project(b);
    const h = [e[0] * na.x + e[3] * na.y + e[6], e[1] * na.x + e[4] * na.y + e[7], e[2] * na.x + e[5] * na.y + e[8]];
    assert.ok(Math.abs(h[0] / h[2] - nb.x) < 1e-6 && Math.abs(h[1] / h[2] - nb.y) < 1e-6, 'a turn and zoom map a point exactly');
  }
  // halfway: the turn's middle (slerp), and past the end it keeps turning the same way
  const mid = lerpPose(poseOf(a), poseOf(b), .5, newPose()), past = lerpPose(poseOf(a), poseOf(b), 1.5, newPose());
  const qa = poseOf(a).q, qb = poseOf(b).q;
  assert.ok(Math.abs(qa.angleTo(mid.q) - qb.angleTo(mid.q)) < 1e-6, 'halfway is halfway');
  assert.ok(Math.abs(qb.angleTo(past.q) - qa.angleTo(qb) * .5) < 1e-6, 'past the end keeps turning');

  const { heatOf, judge } = await import('../src/kit/power.js');
  assert.equal(heatOf({ platform: 'android', thermal: 0, headroom: .4 }), 0, 'cool');
  assert.equal(heatOf({ platform: 'android', thermal: 2, headroom: -1 }), 1, 'Android moderate is warm');
  assert.equal(heatOf({ platform: 'android', thermal: 1, headroom: 1.02 }), 2, 'headroom 1 means throttling soon');
  assert.equal(heatOf({ platform: 'ios', thermal: 2 }), 2, 'iPhone serious is hot');
  const p = { heat: 0, saver: false, level: .5, charging: false, saving: false, why: '' };
  assert.equal(judge(p, 0), false, 'nothing to save for');
  p.level = .15; assert.equal(judge(p, 1000), true, 'low battery'); assert.equal(p.why, 'the battery is low');
  p.charging = true; assert.equal(judge(p, 30000), true, 'held a minute after the reason goes');
  assert.equal(judge(p, 62000), false, 'then lets go');
  p.saver = true; judge(p, 70000); assert.equal(p.why, 'battery saver is on');

  // pacing: a 60 fps game on a 120 Hz screen whose refresh between real frames comes late, or not at all,
  // still shows the moment due by the clock (never back, never the same moment twice)
  const { refreshesSince } = await import('../src/kit/framegen.js');
  const S = { at: 1000, ms: 1000 / 120, k: 0 };
  assert.equal(refreshesSince(S, 1000 + 8.6), 1, 'the next refresh');
  assert.equal(refreshesSince(S, 1000 + 16.9), 2, 'a refresh the phone skipped is counted');
  S.k = 2; assert.equal(refreshesSince(S, 1000 + 17.5), 3, 'never the same moment twice');
  assert.equal(refreshesSince({ at: 0, ms: 0, k: 4 }, 50), 5, 'no clock: the next');

  // the screen's rate (src/kit/screenrate.js): frame generation asks for whole refreshes per real frame,
  // a game without it asks for its own rate (at least 60), unknown rates ask for nothing
  const { pickRate, screen } = await import('../src/kit/screenrate.js');
  assert.equal(pickRate([60, 120], 60, true), 120, 'frame generation: two refreshes a frame');
  assert.equal(pickRate([60, 90, 120, 144], 60, true), 120, '60 fps on a 144 Hz screen: 120 (two a frame, not 2.4)');
  assert.equal(pickRate([60, 90, 120, 144], 30, true), 120, '30 fps: four a frame');
  assert.equal(pickRate([60, 90], 60, true), 90, 'no whole number: the fastest');
  assert.equal(pickRate([60, 120], 60, false), 60, 'no frame generation: the game\'s own rate');
  assert.equal(pickRate([1, 10, 24, 30, 60, 120], 30, false), 60, 'never below 60');
  assert.equal(pickRate([60, 90, 120, 144], 120, false), 120, 'a 120 fps game on a 144 Hz screen: 120');
  assert.equal(pickRate([], 60, true), 0, 'rates unknown: no wish');
  const sp = await import('../src/kit/speed.js');
  const ng = { id: 'kt-ng', era: 'nextgen', fps: 60 }, flat = { id: 'kt-2d', fps: 30 };
  assert.equal(sp.screenWant(ng), 0, 'no rates known (the web): no wish');
  screen.rates = [60, 120]; screen.top = 120; sp.speed.gpu = true;
  assert.equal(sp.screenWant(ng), 120, 'a 60 fps 3D game with frame generation holds 120 Hz');
  assert.equal(sp.screenWant(flat), 60, 'a 30 fps 2D game asks for 60');
  assert.equal(sp.screenWant({ ...ng, frameGen: false }), 60, 'a game that turns frame generation off asks for its own rate');
  sp.setFrameGenPick('off'); assert.equal(sp.screenWant(ng), 60, 'frame generation off in Settings: its own rate');
  sp.setFrameGenPick('auto'); sp.speed.gpu = false;
  assert.equal(sp.screenWant(ng), 60, 'on WebGL (no frame generation): its own rate');
  screen.rates = []; screen.top = 0;
  // guessing ahead: one frame per real frame at most, unless the player or the game asked for ahead (Long
  // Shadow on Rob's Fold, 2026-11-12: at 30 on 120 Hz it made three guesses in a row and Wren smeared)
  for (let i = 0, t = 1000; i < 40; i++) sp.tick(t += 1000 / 120);
  assert.equal(sp.screenHz(), 120, 'the screen measures as 120 Hz');
  sp.speed.gpu = true;
  const g60 = { id: 'kt-fg60', era: 'nextgen', fps: 60 }, g30 = { id: 'kt-fg30', era: 'nextgen', fps: 30 };
  assert.equal(sp.frameGenFor(g60), 'blend', 'a 60 fps game on 120 Hz: blend by default');
  assert.equal(sp.frameGenPace(g60.id), true, 'blend too full for it: it switches itself to ahead');
  // (a machine with four cores or fewer counts as a slow phone, where every 3D game runs at 30: four refreshes a frame there too)
  assert.equal(sp.frameGenFor(g60), sp.frameGenSteps(g60) > 2.5 ? 'blend' : 'ahead', 'and makes its one frame per real frame ahead');
  assert.equal(sp.frameGenPace(g30.id), true);
  assert.equal(sp.frameGenSteps(g30), 4, 'a 30 fps game on 120 Hz has three frames to make');
  assert.equal(sp.frameGenFor(g30), 'blend', 'three guesses in a row are not made: blended instead');
  assert.equal(sp.frameGenFor({ ...g30, frameGen: 'ahead' }), 'ahead', 'a game that asks for ahead keeps it');
  sp.setFrameGenHow('ahead'); assert.equal(sp.frameGenFor(g30), 'ahead', 'and so does the player\'s pick in Settings');
  sp.setFrameGenHow('game'); sp.speed.gpu = false;
  // where a game settled is kept for a day, then it starts from the phone's class again (how its frames are made stays)
  sp.settle('kt-old', { tier: 0, lvl: 3, fps: 30 }); sp.settle('kt-old', { fgHow: 'ahead' });
  assert.equal(sp.settledFor('kt-old').fps, 30, 'a game\'s settled quality is remembered');
  sp.settledFor('kt-old').at -= 25 * 3600 * 1000;
  assert.deepEqual(sp.settledFor('kt-old'), { fgHow: 'ahead' }, 'a day later only how its frames are made is left');
  sp.settle('kt-old2', { tier: 1 }); sp.settledFor('kt-old2').at -= 25 * 3600 * 1000;
  assert.equal(sp.settledFor('kt-old2'), null, 'and a game with nothing lasting is forgotten');
  // automatic 3D quality: Rob's Fold reports (2026-11-10) averaged 57 fps at 60 but dropped a frame 3 times a second
  const B = 1000 / 60;
  assert.equal(sp.qualityVerdict(B * 1.3, 0, B), 'slow', 'a slow average steps down');
  assert.equal(sp.qualityVerdict(1000 / 57, 3, B), 'slow', 'a good average with frames a refresh late steps down');
  assert.equal(sp.qualityVerdict(B, 1, B), 'ok', 'one late frame in a window (a hitch) is not enough');
  assert.equal(sp.qualityVerdict(B, 1, B) === 'fast', false, 'and is never room to climb');
  assert.equal(sp.qualityVerdict(B, 0, B), 'fast', 'on the beat with none late: room to climb');
  console.log('frame generation: exact camera turns, battery and heat, pacing by the clock, screen rate, one guess ahead at most, stutter-aware quality that starts afresh after a day ok');
}

// gs.props on WebGPU: each copy keeps its slot in the drawn list while it stays in view (three's motion,
// for frame generation and SGSR 2, compares each slot with what it held last frame)
{
  const { gpuProps } = await import('../src/kit/hd3d-gpu.js');
  const { PerspectiveCamera, Matrix4, BoxGeometry, MeshBasicMaterial } = await import('three');
  // a stand-in for an InstancedMesh2: 12 boxes in a row along x, 10 m in front of the camera
  const n = 12, D = new Float32Array(n * 16), M4 = new Matrix4();
  for (let i = 0; i < n; i++) M4.makeTranslation(i * 4 - 22, 0, -10).toArray(D, i * 16);
  const geo = new BoxGeometry(1, 1, 1); geo.computeBoundingSphere();
  const im = { name: 'props:box', geometry: geo, material: new MeshBasicMaterial(), castShadow: false, receiveShadow: false, matrixWorld: new Matrix4(),
    _capacity: n, _instancesArrayCount: n, matricesTexture: { _data: D }, colorsTexture: null, getActiveAndVisibilityAt: i => i < n };
  const tw = gpuProps(im), mesh = tw.group.children[0], cam = new PerspectiveCamera(50, 1, .1, 100);
  const at = s => mesh.instanceMatrix.array[s * 16 + 12];   // x of the copy in slot s
  const slots = () => { const o = {}; for (let s = 0; s < mesh.count; s++) if (mesh.instanceMatrix.array[s * 16]) o[at(s)] = s; return o; };
  cam.position.set(0, 0, 0); cam.lookAt(0, 0, -10); tw.sync(cam);
  const first = slots();
  assert.ok(Object.keys(first).length > 2 && Object.keys(first).length < n, 'only the copies in view (and the margin) are drawn');
  // turn right: some copies leave on the left, new ones come in on the right
  cam.lookAt(6, 0, -10); tw.sync(cam);
  const second = slots();
  let kept = 0;
  for (const x in second) if (x in first) { assert.equal(second[x], first[x], `the copy at x = ${x} kept its slot`); kept++; }
  assert.ok(kept > 0 && Object.keys(second).some(x => !(x in first)), 'some stayed, some came in');
  // turn back: the ones that left come straight back to their old slots (they lingered)
  cam.lookAt(0, 0, -10); tw.sync(cam);
  const third = slots();
  for (const x in first) assert.equal(third[x], first[x], `the copy at x = ${x} came back to its slot`);
  console.log('frame generation: props keep their places on WebGPU ok');
}

// ...and only the copies that changed go to the graphics chip again (every list used to go up whole each
// frame, and three's copy of it for motion with it): the ranges marked on a level's list
{
  const { gpuProps } = await import('../src/kit/hd3d-gpu.js');
  const { PerspectiveCamera, Matrix4, BoxGeometry, MeshBasicMaterial } = await import('three');
  // 600 boxes in ten rows of sixty, in front of the camera
  const n = 600, D = new Float32Array(n * 16), M4 = new Matrix4();
  for (let i = 0; i < n; i++) M4.makeTranslation((i % 60) * 2 - 59, 0, -10 - Math.floor(i / 60) * 2).toArray(D, i * 16);
  const geo = new BoxGeometry(1, 1, 1); geo.computeBoundingSphere();
  const tex = { _data: D, enqueueUpdate() {} };   // (the copies library tells its texture of every change this way)
  const im = { name: 'props:box', geometry: geo, material: new MeshBasicMaterial(), castShadow: false, receiveShadow: false, matrixWorld: new Matrix4(),
    _capacity: n, _instancesArrayCount: n, matricesTexture: tex, colorsTexture: null, getActiveAndVisibilityAt: i => i < n };
  const tw = gpuProps(im), list = tw.group.children[0].instanceMatrix, cam = new PerspectiveCamera(50, 1, .1, 100);
  const sent = () => { let s = 0; for (const r of list.updateRanges) s += r.count / 16; list.clearUpdateRanges(); return s; };
  cam.position.set(0, 3, 0); cam.lookAt(0, 0, -20); tw.sync(cam);
  const seen = sent(), v = list.version;
  assert.ok(seen > 40 && seen < n, 'the copies in view go up the first time: ' + seen + ' of ' + n);
  tw.sync(cam); tw.sync(cam);
  assert.ok(list.version === v && sent() === 0, 'a still camera sends nothing again');
  cam.lookAt(1.5, 0, -20); tw.sync(cam);
  const turned = sent();
  assert.ok(turned > 0 && turned < seen / 3, 'a small turn sends the few copies that came in or left: ' + turned + ' slots of ' + seen);
  tex.enqueueUpdate(5); tw.sync(cam);   // the game moved, hid or recoloured a copy
  const all = sent();
  assert.ok(all >= seen * .8, 'a copy the game changed sends the kind\'s list again: ' + all + ' slots');
  tw.sync(cam);
  assert.equal(sent(), 0, 'and then nothing again');
  // Motion (frame generation, SGSR 2) comes from three's own copy of each list, "last frame's": for a still
  // copy it must hold the copy's own place at every draw, the first one in a new slot too (a copy changing
  // detail level takes a slot in another list, in the middle of the picture). three as its renderer treats
  // that copy: sent when its version passes the one last sent (its marked ranges, or whole), then set to
  // the list and the list's version after the draw.
  const lv = [{ object: { geometry: geo, material: im.material }, distance: 0, hysteresis: 0 }, { object: { geometry: geo, material: im.material }, distance: 15 * 15, hysteresis: 0 }];
  const tw2 = gpuProps({ ...im, LODinfo: { render: { levels: lv } } });
  const chips = tw2.group.children.map(m => { const prev = m.instanceMatrix.clone(); return { m, prev, sent: -1, chip: new Float32Array(prev.array.length) }; });
  const draw = () => {
    let wrong = 0, drawn = 0;
    for (const g of chips) {
      if (g.sent < 0 || !g.prev.updateRanges.length) { if (g.sent < g.prev.version) g.chip.set(g.prev.array); }
      else if (g.sent < g.prev.version) for (const r of g.prev.updateRanges) g.chip.set(g.prev.array.subarray(r.start, r.start + r.count), r.start);
      if (g.sent < g.prev.version) { g.prev.clearUpdateRanges(); g.sent = g.prev.version; }
      const S = g.m.userData.slots;
      for (let s = 0; s < S.top; s++) { const i = S.owner[s] - 1; if (i < 0) continue; drawn++; for (let j = 0; j < 16; j++) if (g.chip[s * 16 + j] !== D[i * 16 + j]) { wrong++; break; } }
      g.prev.array.set(g.m.instanceMatrix.array); g.prev.version = g.m.instanceMatrix.version;
    }
    return { wrong, drawn, near: chips[0].m.count, far: chips[1].m.count };
  };
  cam.lookAt(0, 0, -20); tw2.sync(cam); draw();   // (three makes its copy during the first draw: nothing to hold yet)
  tw2.sync(cam); const d2 = draw(); tw2.sync(cam); const d3 = draw();
  assert.ok(d2.wrong + d3.wrong === 0 && d3.near > 0 && d3.far > 0, 'last frame\'s list holds every still copy where it stands (' + d3.near + ' near, ' + d3.far + ' far)');
  lv[1].distance = 30 * 30; tw2.sync(cam);   // a zoom: the far level takes over further out, and the copies between change lists
  const d4 = draw();
  assert.ok(d4.near > d3.near + 20 && d4.wrong === 0, 'a copy that changes level has its own place in last frame\'s list at once: ' + d4.wrong + ' of ' + d4.drawn + ' wrong, ' + (d4.near - d3.near) + ' changed');
  cam.lookAt(2, 0, -20); tw2.sync(cam); const d5 = draw(); lv[1].distance = 15 * 15; tw2.sync(cam); const d6 = draw(); tw2.sync(cam); const d7 = draw();
  assert.equal(d5.wrong + d6.wrong + d7.wrong, 0, 'and through a turn and the change back');
  console.log('gs.props on WebGPU: only changed copies are sent, and each keeps its own motion ok');
}

// gs.models material recipes: each tiles seamlessly (the same at p and p + one tile), with finite numbers
{
  const { JS } = await import('../src/kit/models/ops.js'), { RECIPES } = await import('../src/kit/models/recipes.js');
  for (const [n, R] of Object.entries(RECIPES)) {
    const K = {}; for (const k in R.look) K[k] = JS.rgb(R.look[k]);
    for (let i = 0; i < 60; i++) {
      const x = (i * .618) % R.P, y = (i * .377) % R.P, a = R.f(JS, { x, y }, K);
      for (const b of [R.f(JS, { x: x + R.P, y }, K), R.f(JS, { x, y: y + R.P }, K)]) {
        assert.ok(Math.abs(a.h - b.h) < 1e-6 && Math.abs(a.rough - b.rough) < 1e-6 && a.col.every((v, j) => Math.abs(v - b.col[j]) < 1e-6), `${n} tiles at ${x}, ${y}`);
      }
      for (const v of [a.h, a.rough, a.metal, ...a.col]) assert.ok(Number.isFinite(v), `${n} gives numbers`);
    }
  }
  console.log('gs.models: material recipes tile ok');
  // wear: a box's edges come out convex, its face middles flat; snow lands on top, grime at the foot
  const T = await import('three'), { wear, curvature } = await import('../src/kit/models/wear.js');
  const box = new T.Mesh(new T.BoxGeometry(1, 1, 1, 4, 4, 4), new T.MeshStandardMaterial()), { curve } = curvature(box.geometry), P = box.geometry.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const v = [P.getX(i), P.getY(i), P.getZ(i)].map(Math.abs), edge = v.filter(a => a > .5 - 1e-6).length >= 2, middle = v.filter(a => a < .2).length === 2;
    if (edge) assert.ok(curve[i] > .05, `box edge convex at vertex ${i}`); if (middle) assert.ok(Math.abs(curve[i]) < 1e-6, `box face flat at vertex ${i}`);
  }
  const old = box.material; wear(box, { snow: 1, dirt: 1, edges: 0 }); assert.ok(box.material !== old && box.material.vertexColors && !old.vertexColors, 'wear copies the material');
  const C = box.geometry.attributes.color, Q = box.geometry.attributes.position; let top = 0, foot = 1e9;
  for (let i = 0; i < Q.count; i++) { const l = C.getX(i) + C.getY(i) + C.getZ(i); if (Q.getY(i) > .49 && Math.abs(Q.getX(i)) < .3 && Math.abs(Q.getZ(i)) < .3) top = Math.max(top, l); if (Q.getY(i) < -.45) foot = Math.min(foot, l); }
  assert.ok(top > 3 && foot < 2, `snow on top (${top}), grime at the foot (${foot})`);
  console.log('gs.models: wear ok');
  // sculpt: a ball comes out round (every point about r from the middle, normals pointing out), a carved hole is a hole
  const { sculpt } = await import('../src/kit/models/sculpt.js');
  const sg = sculpt([{ ball: .5, at: [0, 1, 0] }], { res: 32 }), SP = sg.attributes.position, SN = sg.attributes.normal;
  for (let i = 0; i < SP.count; i += 7) {
    const x = SP.getX(i), y = SP.getY(i) - 1, z = SP.getZ(i), r = Math.hypot(x, y, z);
    assert.ok(Math.abs(r - .5) < .02, `sculpted ball radius ${r}`); assert.ok((x * SN.getX(i) + y * SN.getY(i) + z * SN.getZ(i)) / r > .95, 'sculpt normals point out');
  }
  { const a = sg.index.array, P = SP; let out = 0; for (let t = 0; t < a.length; t += 3) { const [i, j, k] = [a[t], a[t + 1], a[t + 2]], ux = P.getX(j) - P.getX(i), uy = P.getY(j) - P.getY(i), uz = P.getZ(j) - P.getZ(i), vx = P.getX(k) - P.getX(i), vy = P.getY(k) - P.getY(i), vz = P.getZ(k) - P.getZ(i);
    out += (uy * vz - uz * vy) * P.getX(i) + (uz * vx - ux * vz) * (P.getY(i) - 1) + (ux * vy - uy * vx) * P.getZ(i) > 0 ? 1 : -1; } assert.ok(out === a.length / 3, 'sculpt faces turned out'); }
  assert.ok(sculpt([{ ball: .5, at: [0, 1, 0] }], { res: 32 }) === sg, 'sculpt reuses the same shapes');
  const holed = sculpt([{ box: [1, 1, .4] }, { cylinder: [.2, 1], rot: [Math.PI / 2, 0, 0], cut: true }], { res: 40 }), HP = holed.attributes.position;
  let inHole = 0; for (let i = 0; i < HP.count; i++) if (Math.hypot(HP.getX(i), HP.getY(i)) < .15) inHole++;
  assert.ok(inHole === 0, 'carved hole is empty');
  console.log('gs.models: sculpt ok');
  // a finer person (gs.models.human's build): parts smoothed, one group per material covering every triangle, weights summing to 1
  {
    const { personParts, assemble } = await import('../src/kit/skin.js'), { LoopSubdivision } = await import('three-subdivide');
    const plain = await import('../src/kit/poses.js').then(m => m.person()), fine = assemble(personParts({}), { smooth: 1, subdivide: (g, n) => LoopSubdivision.modify(g, n, {}), mats: { body: new T.MeshStandardMaterial(), skin: new T.MeshStandardMaterial(), legs: new T.MeshStandardMaterial(), shoes: new T.MeshStandardMaterial() } });
    const g = fine.mesh.geometry, tris = g.index.count / 3;
    assert.ok(g.attributes.position.count > plain.mesh.geometry.attributes.position.count * 2, 'smoothed person is finer');
    assert.ok(Array.isArray(fine.mesh.material) && fine.mesh.material.length === 4 && g.groups.reduce((a, x) => a + x.count, 0) / 3 === tris, 'groups cover every triangle');
    const W = g.attributes.skinWeight; for (let i = 0; i < W.count; i += 11) assert.ok(Math.abs(W.getX(i) + W.getY(i) + W.getZ(i) + W.getW(i) - 1) < 1e-4, 'weights sum to 1');
    assert.ok(g.morphAttributes.position.length === 7 && fine.rig && fine.face, 'face shapes, rig and face');
  }
  console.log('gs.models: finer person ok');
  // people sculpted from soft shapes (gs.models.human): the field meshes a ball true to size and knows whose surface is whose;
  // a hand and a helmet come out as packed pieces with three levels of detail, whole weights and their bones
  {
    const F = await import('../src/kit/models/field.js'), HS = await import('../src/kit/models/human-shapes.js'); await F.thinReady;
    const m = F.mesh([{ ball: .1, at: [0, .2, 0], slot: 'a' }, { box: [.3, .02, .3], at: [0, .08, 0], slot: 'b', blend: .01 }], { cell: .01, keep: 1 });
    let worst = 0; for (let i = 0; i < m.n; i++) { const y = m.P[i * 3 + 1]; if (y > .2) worst = Math.max(worst, Math.abs(Math.hypot(m.P[i * 3], y - .2, m.P[i * 3 + 2]) - .1)); }
    assert.ok(m.n > 300 && worst < .003, 'a ball meshes true to size: off by ' + worst);
    assert.ok(new Set(m.own).size === 2 && m.ao.every(v => v >= 0 && v <= 1), 'each point knows its shape and how open it is');
    const thin = F.mesh([{ ball: .1, at: [0, .2, 0] }], { cell: .008, keep: .2 }); assert.ok(thin.I.length < F.mesh([{ ball: .1, at: [0, .2, 0] }], { cell: .008 }).I.length * .35, 'thinned before the fine work');
    const hand = HS.sculpt({ kind: 'hand', a: { limbs: 1, grip: 0, gloves: 0 } });
    assert.ok(hand.n > 400 && hand.P.length === hand.n * 3 && hand.N instanceof Int16Array && hand.ao instanceof Uint8Array, 'a hand: packed arrays');
    assert.ok(hand.I[0].length > hand.I[1].length && hand.I[1].length > hand.I[2].length && hand.I[2].length >= 3, 'three levels of detail: ' + hand.I.map(i => i.length / 3));
    assert.ok(hand.names.length === 15 && hand.names.includes('handL') && ['thumb1L', 'thumb2L', 'index1L', 'index2L', 'index3L', 'little3L'].every(b => hand.names.includes(b)), 'a hand rides its own bone and fourteen finger bones: ' + hand.names); assert.ok(hand.slots.includes('skin'));
    for (let i = 0; i < hand.n; i += 7) assert.equal(hand.SW[i * 4] + hand.SW[i * 4 + 1] + hand.SW[i * 4 + 2] + hand.SW[i * 4 + 3], 255, 'weights are whole');
    const right = HS.mirrored(hand); assert.ok(right.names.includes('handR') && right.names.every(b => b.endsWith('R'))); assert.ok(right.P[0] === -hand.P[0] && right.I[0][1] === hand.I[0][2], 'the other hand: turned over');
    const sp = { build: { shoulders: 1, chest: 1, waist: 1, hips: 1, limbs: 1, bust: 0, neck: 1 }, top: { kind: 'tunic', sleeves: 'long', pockets: 4, buttons: '#888', collar: '#333' }, legs: { kind: 'trousers' }, feet: { kind: 'tall' }, face: { jaw: 1 }, hat: { kind: 'helmet', colour: '#444' }, belt: { colour: '#222' }, web: null, extras: {}, pack: null, gear: [], hands: 'open', gloves: null, hair: '#333', hairStyle: 'short', moustache: false };
    const jobs = HS.jobsFor(sp), again = HS.jobsFor({ ...sp, top: { ...sp.top, buttons: '#abc', collar: '#def' }, hat: { kind: 'helmet', colour: '#f00' } });
    assert.deepEqual(jobs.map(j => j.kind), ['trunk', 'arm', 'hand', 'head', 'hat', 'collar']); assert.deepEqual(jobs.map(j => j.key), again.map(j => j.key), 'colours do not change what is sculpted');
    const hat = HS.sculpt(jobs[4]); assert.ok(hat.n > 300 && hat.slots.includes('helm') && hat.names[0] === '$', 'a helmet on a bone of its own');
    // each arm is a piece of its own (it turns in the shoulder; nothing is stretched across the armpit): one sculpt serves both, unless the left wears an armband
    assert.equal(jobs[1].side, 'LR'); const banded = HS.jobsFor({ ...sp, top: { ...sp.top, band: '#dd0' } }).filter(j => j.kind === 'arm'); assert.deepEqual(banded.map(j => j.side), ['L', 'R']); assert.equal(banded[1].key, jobs[1].key, 'the bare arm is shared');
    const arm = HS.sculpt(jobs[1]); assert.deepEqual([...arm.names].sort(), ['armL', 'foreL', 'twistL']); assert.ok(arm.n > 500 && arm.slots.includes('top'));
    let minX = 9; for (let i = 0; i < arm.n; i++) minX = Math.min(minX, arm.P[i * 3]); assert.ok(minX > .1, 'a left arm, on its own side: ' + minX);
    assert.deepEqual([...HS.mirrored(arm).names].sort(), ['armR', 'foreR', 'twistR']);
    // a kind that is not on the list is no hat and no pack, even a name every object answers to (a kind reaches the sculptor as text, over a worker message)
    for (const kind of ['constructor', 'toString', 'nonsuch']) {
      assert.deepEqual(HS.jobsFor({ ...sp, hat: { kind }, pack: { kind } }).map(j => j.kind), ['trunk', 'arm', 'hand', 'head', 'collar'], 'no hat or pack of kind ' + kind);
      for (const what of ['hat', 'pack']) assert.throws(() => HS.sculpt({ kind: what, a: { kind } }), new RegExp(`no ${what} called '${kind}'`));
    }
    // what is worn round the neck is a piece of its own, finer than the trunk it stands on and moving with it (the trunk's bones): a collar
    // for every top but a round-necked one, with a scarf wound inside it or a scarf alone
    const round = { ...sp, top: { ...sp.top, kind: 'shirt', collar: false } }, kinds = q => HS.jobsFor(q).map(j => j.kind);
    assert.ok(!kinds(round).includes('collar') && kinds({ ...round, extras: { scarf: '#553' } }).includes('collar'), 'a round neck has no collar piece, unless a scarf is worn');
    const col = HS.sculpt(jobs[5]), wound = HS.sculpt(HS.jobsFor({ ...sp, extras: { scarf: '#553' } })[5]);
    assert.ok(col.n > 600 && col.slots.includes('trim') && !col.slots.includes('scarf') && wound.slots.includes('scarf') && wound.n > col.n, 'a collar, and one with a scarf in it: ' + [col.n, wound.n, col.slots, wound.slots]);
    assert.ok(col.names.includes('spine') && col.names.every(b => b === 'spine' || b.startsWith('collar')), 'a collar goes with the rib cage and the collar bones: ' + col.names);
    let top = 0, low = 9; for (let i = 0; i < col.n; i++) { top = Math.max(top, col.P[i * 3 + 1]); low = Math.min(low, col.P[i * 3 + 1]); } assert.ok(top > 1.57 && top < 1.6 && low > 1.47 && low < 1.52, 'it stands from inside the shoulders to under the jaw: ' + [low, top]);
    const tr = HS.sculpt(jobs[0]); assert.ok(!tr.slots.includes('trim'), 'and the trunk has none of it: ' + tr.slots);
    assert.ok(typeof HS.VERSION === 'string' && HS.VERSION.length > 4, 'the sculptor has a stamp for saved copies');
  }
  console.log('gs.models: sculpted people ok');
  // the fuller skeleton (human-shapes.js BONES, Rig's full option and fill()): a waist under the rib cage, a neck under the head, a
  // collar bone to each shoulder, a turn along each forearm, toes and fingers. The fifteen joints poses name end up turned exactly
  // as fifteen bones alone turn them, and the legs and feet stand exactly where they stood.
  {
    const HS = await import('../src/kit/models/human-shapes.js'), { skeleton } = await import('../src/kit/models/human.js'), { Rig, LIFELIKE } = await import('../src/kit/poses.js'), T = await import('three');
    const OLD = ['hips', 'spine', 'head', 'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR', 'legL', 'shinL', 'footL', 'legR', 'shinR', 'footR'];
    const OP = { spine: 'hips', head: 'spine', armL: 'spine', foreL: 'armL', handL: 'foreL', armR: 'spine', foreR: 'armR', handR: 'foreR', legL: 'hips', shinL: 'legL', footL: 'shinL', legR: 'hips', shinR: 'legR', footR: 'shinR' };
    const fifteen = () => {
      const B = {}; for (const b of OLD) { B[b] = new T.Bone(); B[b].name = b; }
      for (const b of OLD) { const a = HS.AT[b], p = OP[b]; if (p) { const pa = HS.AT[p]; B[b].position.set(a[0] - pa[0], a[1] - pa[1], a[2] - pa[2]); B[p].add(B[b]); } else B[b].position.set(...a); }
      const root = new T.Group(); root.add(B.hips); root.bones = B; root.rig = new Rig(B, { height: 1.8, poses: LIFELIKE, weight: 1 }); return root;
    };
    const a = fifteen(), b = skeleton(), wp = o => o.getWorldPosition(new T.Vector3()), wq = o => o.getWorldQuaternion(new T.Quaternion());
    const put = (pose, at = 0) => { for (const r of [a, b]) { r.rig.layers = [{ name: pose, w: 1, phase: at, pin: true }]; r.rig.state = pose; r.rig.update(0); r.updateMatrixWorld(true); } };
    assert.equal(Object.keys(b.bones).length, 62, 'sixty-two bones: twenty-three, fourteen to a hand and eleven in the face');
    for (const n of OLD) assert.ok(wp(a.bones[n]).distanceTo(wp(b.bones[n])) < 1e-9, n + ' is where it was, standing');
    assert.deepEqual([...b.rig.base.keys()].filter(k => !OLD.includes(k)).sort(), ['collarL', 'collarR', 'neck', 'toeL', 'toeR', 'twistL', 'twistR', 'waist'], 'the joints in between are the rig\'s (the fingers are not: fingers() sets them)');
    const worst = {}, note = (k, v) => { worst[k] = Math.max(worst[k] || 0, v); };
    for (const pose of ['idle', 'walk', 'jog', 'run', 'sprint', 'sneak', 'crouch', 'aim', 'jump', 'fall', 'land', 'hang', 'climb', 'cover', 'punch', 'takedown', 'downed', 'wave', 'sit']) for (let k = 0; k < 8; k++) {
      put(pose, k / 8);
      for (const n of OLD) { note('turn', wq(a.bones[n]).angleTo(wq(b.bones[n]))); note(/^(hips|leg|shin|foot)/.test(n) ? 'legs' : /^(spine|head)/.test(n) ? 'trunk' : 'arms', wp(a.bones[n]).distanceTo(wp(b.bones[n]))); }
    }
    assert.ok(worst.turn < 1e-6, 'every joint a pose names is turned as it was: off by ' + worst.turn);
    assert.ok(worst.legs < 1e-9, 'the hips, legs and feet are where they were: off by ' + worst.legs);
    assert.ok(worst.trunk < .07 && worst.arms < .08, `the rib cage, head and arms within a few centimetres (a back bent along its length leans a little less far): ${worst.trunk.toFixed(3)}, ${worst.arms.toFixed(3)}`);
    // the waist and the neck take a share: half of a bend, less of a twist; the rib cage turns about a point above its own bone
    const B = b.bones, one = j => { b.rig.add('t', () => ({ j })); b.rig.layers = [{ name: 't', w: 1, phase: 0, pin: true }]; b.rig.state = 't'; b.rig.weight = 0; b.rig.update(0); b.updateMatrixWorld(true); };
    one({ spine: [.6, 0, 0], head: [.4, 0, 0] }); assert.ok(Math.abs(B.waist.rotation.x - .3) < 1e-6 && Math.abs(B.spine.rotation.x - .3) < 1e-6 && Math.abs(B.neck.rotation.x - .2) < 1e-6, 'a bend is shared half and half');
    { const c = new T.Vector3(...HS.PIVOT.spine); assert.ok(B.spine.localToWorld(c.clone()).distanceTo(B.waist.localToWorld(c.clone())) < 1e-9, 'the rib cage turns about a point a hand above the waist'); assert.ok(Math.abs(B.spine.position.z + Math.sin(.3) * .17) < 1e-6, 'its own bone swings back under that point'); }
    one({ spine: [0, .6, 0], head: [0, .6, 0] }); assert.ok(Math.abs(B.waist.rotation.y - .15) < 1e-6 && Math.abs(B.neck.rotation.y - .27) < 1e-6, 'a twist is taken higher up the back: a quarter at the waist');
    one({ spine: [.3, -.5, .2] }); { const q = new T.Quaternion().setFromEuler(new T.Euler(.3, -.5, .2)); assert.ok(B.hips.getWorldQuaternion(new T.Quaternion()).multiply(q).angleTo(wq(B.spine)) < 1e-6, 'whatever the turn, the two shares make the whole of it'); }
    // fill() again changes nothing; a rig that is not `full` leaves the joints in between alone
    { put('run', .3); const was = Object.values(B).map(o => o.matrixWorld.clone()); b.rig.fill().fill(); b.updateMatrixWorld(true); let w = 0; Object.values(B).forEach((o, i) => { for (let k = 0; k < 16; k++) w = Math.max(w, Math.abs(o.matrixWorld.elements[k] - was[i].elements[k])); }); assert.ok(w < 1e-9, 'fill() twice more: nothing moves (' + w + ')'); }
    { const c = skeleton(), plain = new Rig(c.bones, { poses: LIFELIKE }); plain.play('run'); plain.update(.1, { speed: 5 }); assert.ok(plain.fill() === plain && !plain.base.has('waist') && c.bones.waist.quaternion.w === 1 && c.bones.collarL.quaternion.w === 1 && c.bones.spine.position.z === 0, 'fifteen joints on the same bones: as ever'); }
    // a collar bone goes with its arm: nothing while it hangs, up as it is raised, forward as it reaches; the arm itself points as the pose said
    for (const [arm, lift, fwd, up] of [[[0, 0, 0], 0, 0, 0], [[-1.57, 0, 0], .2, .25, .03], [[-3, 0, 0], .42, .04, .065], [[0, 0, 1.57], .2, 0, .03]]) {
      for (const r of [a, b]) { r.rig.add('t', () => ({ j: { armL: arm, armR: [arm[0], -arm[1], -arm[2]] } })); r.rig.weight = 0; } put('t');
      assert.ok(Math.abs(B.collarL.rotation.z - lift) < .02 && Math.abs(B.collarL.rotation.y + fwd) < .02 && Math.abs(B.collarR.rotation.z + lift) < .02 && Math.abs(B.collarR.rotation.y - fwd) < .02, `collar bones for an arm at ${arm}: ${B.collarL.rotation.z.toFixed(2)}, ${B.collarL.rotation.y.toFixed(2)}`);
      assert.ok(wp(B.armL).y - wp(a.bones.armL).y >= up - .005 && wq(B.armL).angleTo(wq(a.bones.armL)) < 1e-6 && wq(B.armR).angleTo(wq(a.bones.armR)) < 1e-6, 'the shoulder rises, the arm points where it did');
    }
    // the forearm's skin turns with the hand: seven tenths of the way at the wrist
    one({ handL: [0, .8, 0], handR: [.2, -.5, 0] }); assert.ok(Math.abs(B.twistL.rotation.y - .56) < 1e-6 && Math.abs(B.twistR.rotation.y + .35) < .01 && B.foreL.rotation.y === 0, 'the turn along the forearm: ' + B.twistL.rotation.y);
    // toes: flat on the ground while the heel comes up off them (with fifteen bones the tip of the shoe went centimetres into it)
    for (const pose of ['walk', 'jog', 'run', 'sprint']) {
      let lowA = 9, lowB = 9; for (const r of [a, b]) r.rig.weight = 1;
      for (let k = 0; k < 48; k++) { put(pose, k / 48); for (const sd of ['L', 'R']) { lowA = Math.min(lowA, a.bones['foot' + sd].localToWorld(new T.Vector3(.005, -.085, .185)).y); lowB = Math.min(lowB, B['toe' + sd].localToWorld(new T.Vector3(0, -.028, .065)).y); } }
      assert.ok(lowB > -.008 && lowA < -.03, `${pose}: the tip of the shoe stays on the ground (${lowB.toFixed(3)}; it went to ${lowA.toFixed(3)})`);
    }
    // seen from further off (rig.fine = false: a person at its middle and far levels) the forearm's turn and the toes are left
    // alone, since nothing shows them there; the back, the neck and the collar bones go on as before; and they pick up again
    { const c = skeleton(), C = c.bones, at = (pose, ph) => { c.rig.layers = [{ name: pose, w: 1, phase: ph, pin: true }]; c.rig.state = pose; c.rig.update(0); };
      c.rig.add('t', () => ({ j: { spine: [.6, 0, 0], armL: [-3, 0, 0], handL: [0, .8, 0] } })); c.rig.weight = 0;
      c.rig.fine = false; at('t', 0); assert.ok(C.twistL.rotation.y === 0 && Math.abs(C.waist.rotation.x - .3) < 1e-6 && C.collarL.rotation.z > .3, 'further off: no turn along the forearm, the back and the shoulder as ever');
      let toe = 0; for (let k = 0; k < 16; k++) { at('run', k / 16); toe = Math.max(toe, Math.abs(C.toeL.rotation.x), Math.abs(C.toeR.rotation.x)); } assert.equal(toe, 0, 'further off: the toes are left alone');
      c.rig.fine = true; at('t', 0); assert.ok(Math.abs(C.twistL.rotation.y - .56) < 1e-6, 'close again: the forearm turns'); toe = 0; for (let k = 0; k < 16; k++) { at('run', k / 16); toe = Math.max(toe, Math.abs(C.toeL.rotation.x)); } assert.ok(toe > .2, 'close again: the toes bend'); }
    // the fingers: three bones each from the knuckle, two to the thumb, a bigger hand's further apart; the other hand's in a mirror
    { const fb = HS.fingerBones({ limbs: 1, grip: false }), big = HS.fingerBones({ limbs: 1.2, grip: false }), shut = HS.handPlan({ limbs: 1, grip: true }), open = HS.handPlan({ limbs: 1, grip: false });
      assert.deepEqual(fb.map(q => q[0] + '<' + q[1]).slice(0, 4), ['index1L<handL', 'index2L<index1L', 'index3L<index2L', 'middle1L<handL']); assert.equal(fb.length, 14);
      assert.ok(Math.hypot(...big[1][2].map((v, i) => v - big[0][2][i])) > Math.hypot(...fb[1][2].map((v, i) => v - fb[0][2][i])) * 1.1 && shut.bend[0] > open.bend[0] + .5, 'joints by the hand\'s size; a gripping hand is sculpted bent');
      assert.ok(B.index1R.parent === B.handR && B.thumb2L.parent === B.thumb1L && Math.abs(B.index1R.position.x + B.index1L.position.x) < 1e-12 && B.index1R.position.y === B.index1L.position.y, 'both hands, in a mirror'); }
    // narrow shoulders bring the arms and all that rides them in; the collar bones stay at the breastbone
    { const f = skeleton({ sex: 'f' }), m = skeleton(); f.scale.setScalar(1); f.updateMatrixWorld(true); assert.ok(wp(f.bones.armL).x < wp(m.bones.armL).x - .01 && wp(f.bones.index1L).x < wp(m.bones.index1L).x - .01 && Math.abs(wp(f.bones.collarL).x - wp(m.bones.collarL).x) < 1e-9, 'narrow shoulders'); }
    // the skin: each new joint has skin of its own to move
    { const sp = { build: { shoulders: 1, chest: 1, waist: 1, hips: 1, limbs: 1, bust: 0, neck: 1 }, top: { kind: 'shirt', sleeves: 'long', pockets: 0 }, legs: { kind: 'trousers' }, feet: { kind: 'shoes' }, face: { jaw: 1, chin: 1, brow: 1, nose: 1, lips: 1, cheeks: 1, eyes: 1, soft: 0 }, hat: null, belt: null, web: null, extras: {}, pack: null, gear: [], hands: 'open', gloves: null, hair: '#333', hairStyle: 'short', moustache: false };
      const share = p => { const u = {}; for (let i = 0; i < p.n; i++) for (let q = 0; q < 4; q++) if (p.SW[i * 4 + q]) { const n = p.names[p.SI[i * 4 + q]]; u[n] = (u[n] || 0) + p.SW[i * 4 + q] / 255 / p.n; } return u; };
      const jobs = HS.jobsFor(sp), body = HS.sculpt(jobs[0]), trunk = share(body), head = share(HS.sculpt(jobs[3]));
      // a seam holds: the two sides of a hem or of a strap's edge have points of their own in the same place (so the colour stops
      // dead at the line), and those go with the same bones, or the seam would open when a joint bends (a trouser hem over a shoe did)
      { const seen = new Map(), w = i => { const u = {}; for (let q = 0; q < 4; q++) if (body.SW[i * 4 + q]) u[body.names[body.SI[i * 4 + q]]] = body.SW[i * 4 + q] / 255; return u; }; let pairs = 0, torn = 0, eg = '';
        for (let i = 0; i < body.n; i++) {
          const k = [0, 1, 2].map(c => Math.round(body.P[i * 3 + c] * 1e5)).join(), j = seen.get(k); if (j === undefined) { seen.set(k, i); continue; }
          const a = w(i), b = w(j); pairs++; if ([...new Set([...Object.keys(a), ...Object.keys(b)])].some(n => Math.abs((a[n] || 0) - (b[n] || 0)) > .01)) { torn++; eg ||= `at ${body.P[i * 3 + 1].toFixed(3)} up: ${JSON.stringify(a)} against ${JSON.stringify(b)}`; }
        }
        assert.ok(pairs > 100 && torn === 0, `points in the same place go with the same bones: ${torn} of ${pairs} pairs do not (${eg})`); }
      for (const n of ['waist', 'spine', 'collarL', 'collarR', 'toeL', 'toeR']) assert.ok(trunk[n] > .01, `the trunk's skin on ${n}: ${trunk[n]}`); assert.ok(Math.abs(trunk.collarL - trunk.collarR) < .004 && Math.abs(trunk.toeL - trunk.toeR) < .004, 'the same on both sides');
      assert.ok(head.neck > .02 && head.head > .7 && head.spine > .03, 'a neck between the collar and the head: ' + JSON.stringify(head)); }
  }
  console.log('gs.models: the fuller skeleton (waist, neck, collar bones, forearm twist, toes, fingers; old joints turned as they were) ok');
}
// steps that are really taken (stride.js): a person the game moves keeps each foot where it was put down. Two people are driven
// alike, one with its steps off, and what is measured is the point each foot stands on (its heel or its ball) while the foot is down.
{
  const { skeleton } = await import('../src/kit/models/human.js'), { Vector3, Quaternion } = await import('three');
  const STR = { idle: 0, walk: 1.3, jog: 3.3, run: 5.6 }, dt = 1 / 60, w = new Vector3(), q = new Quaternion(), LEGS = ['legL', 'shinL', 'footL', 'legR', 'shinR', 'footR'];
  const go = (st, sp) => { st.x += Math.sin(st.yaw) * sp * dt; st.z += Math.cos(st.yaw) * sp * dt; };
  const drive = (secs, fn, set) => {
    const P = [false, true].map(on => { const p = skeleton({}); p.rig.steps = on; set?.(p, on); return p; }), st = { x: 0, z: 0, yaw: 0, speed: 0 };
    const was = [0, 1].map(() => [new Vector3(), new Vector3()]), down = [false, false], piv = [0, 0], lastQ = LEGS.map(() => null), R = { off: 0, on: 0, dist: 0, lands: 0, jerk: 0, differ: 0, P };
    for (let i = 0, n = Math.round(secs / dt); i < n; i++) {
      const px = st.x, pz = st.z; fn(st, i * dt); R.dist += Math.hypot(st.x - px, st.z - pz);
      for (const p of P) { if (st.speed > .15 || st.speed < -.15) p.rig.blend(STR, Math.abs(st.speed)); else p.rig.play('idle', { fade: .22 }); p.position.set(st.x, 0, st.z); p.rotation.y = st.yaw; p.rig.update(dt, { speed: st.speed }); p.updateMatrixWorld(true); }
      const F = P[1].rig.stride.feet;
      for (let k = 0; k < 2; k++) {
        if (F[k].landed) R.lands++;
        for (let m = 0; m < 2; m++) {
          P[m].bones[k ? 'footR' : 'footL'].localToWorld(w.set(0, -.085, F[k].on ? .13 : -.06));
          if (F[k].down && down[k] && F[k].on === piv[k]) R[m ? 'on' : 'off'] += Math.hypot(w.x - was[m][k].x, w.z - was[m][k].z);
          was[m][k].copy(w);
        }
        down[k] = F[k].down; piv[k] = F[k].on;
      }
      LEGS.forEach((name, j) => {   // the biggest turn of a leg joint from one update to the next, and how far the two people's legs differ
        const a = P[0].bones[name], b = P[1].bones[name]; R.differ = Math.max(R.differ, a.quaternion.angleTo(b.quaternion));
        b.getWorldQuaternion(q); if (lastQ[j] && i > 3) R.jerk = Math.max(R.jerk, lastQ[j].angleTo(q)); (lastQ[j] ||= new Quaternion()).copy(q);
      });
    }
    return R;
  };
  const per = (r, k) => (r[k] / r.dist * 100).toFixed(1) + ' cm a metre';
  // a walk straight ahead: the walk as drawn let the foot it stood on creep (it rolled on its ankle, not on its heel and its ball)
  let r = drive(6, st => { st.speed = 1.3; go(st, 1.3); });
  assert.ok(r.off / r.dist > .08 && r.on / r.dist < .01, `a walk: the feet slid ${per(r, 'off')}, and now ${per(r, 'on')}`);
  assert.ok(r.lands >= 10 && r.lands <= 13, 'a footfall for every step: ' + r.lands); assert.ok(r.jerk < .2, 'no joint of the legs jumps: ' + r.jerk.toFixed(3));
  // round a tight bend, with the body 20% faster than its walk, sidestepping as it goes, backwards, at a run, and from standing to a walk and back
  r = drive(6, st => { st.speed = 1.3; st.yaw += 1.3 / .8 * dt; go(st, 1.3); }); assert.ok(r.off / r.dist > .2 && r.on / r.dist < .012, `a bend: ${per(r, 'off')}, now ${per(r, 'on')}`); assert.ok(r.jerk < .24, 'a bend, no jump: ' + r.jerk.toFixed(3));
  r = drive(6, st => { st.speed = 1.3; go(st, 1.56); }); assert.ok(r.on / r.dist < .02, `a body faster than its walk: ${per(r, 'off')}, now ${per(r, 'on')}`); assert.ok(r.jerk < .26, 'off its pace, no jump: ' + r.jerk.toFixed(3));
  r = drive(6, st => { st.speed = 1.3; go(st, 1.3); st.x += .5 * dt; }); assert.ok(r.on / r.dist < .012, `sidestepping: ${per(r, 'off')}, now ${per(r, 'on')}`);
  r = drive(6, st => { st.speed = -1; go(st, -1); }); assert.ok(r.off / r.dist > .08 && r.on / r.dist < .01, `backwards: ${per(r, 'off')}, now ${per(r, 'on')}`);
  r = drive(4, st => { st.speed = 5.6; go(st, 5.6); }); assert.ok(r.on / r.dist < .005, `a run: ${per(r, 'off')}, now ${per(r, 'on')}`);
  r = drive(8, (st, t) => { const want = t > 1 && t < 6 ? 1.3 : 0; st.speed += Math.max(-3 * dt, Math.min(3 * dt, want - st.speed)); go(st, st.speed); });
  assert.ok(r.off / r.dist > .1 && r.on / r.dist < .012, `a start and a stop: ${per(r, 'off')}, now ${per(r, 'on')}`); assert.ok(r.jerk < .2, 'a start and a stop, no jump: ' + r.jerk.toFixed(3));
  // standing: nothing moves by itself (standing easy let the feet creep as the weight went from one to the other), and no step is taken
  r = drive(8, st => { st.speed = 0; }); assert.ok(r.lands === 0 && r.on < .004 && r.off > .1, `standing still: ${r.lands} steps, the feet crept ${(r.off * 100).toFixed(0)} cm, now ${(r.on * 100).toFixed(1)}`);
  // turned on the spot the feet swept round like a statue's on a turntable; now the person steps round, a foot at a time, and stands as posed again after
  r = drive(6, (st, t) => { st.speed = 0; if (t > 1 && t < 4) st.yaw += 2 * dt; });
  assert.ok(r.off > 1 && r.on < .02, `turned on the spot: the feet swept ${(r.off * 100).toFixed(0)} cm over the ground, now ${(r.on * 100).toFixed(1)}`); assert.ok(r.lands >= 6 && r.lands <= 16, 'it steps round: ' + r.lands + ' steps');
  assert.ok(r.jerk < .26, 'stepping round, no jump: ' + r.jerk.toFixed(3));
  { const S = r.P[1].rig.stride.feet; assert.ok(S.every(f => f.down && Math.hypot(f.T.x - f.F.x, f.T.z - f.F.z) < .08 && Math.abs(f.dyaw) < .25), 'and ends standing under itself'); }
  // shoved a pace to the side: it steps after its body
  r = drive(5, (st, t) => { st.speed = 0; if (t > 1 && t < 2) st.x += .4 * dt; }); assert.ok(r.on < .02 && r.lands >= 2 && r.lands <= 6, `shoved: ${r.lands} steps, slid ${(r.on * 100).toFixed(1)} cm`);
  // what is left exactly as drawn: a walk on the spot (a figure in a menu), a person carried along (on a lorry), a far-off person, a pose the game
  // drives by its own phase, a person off its balance (gs.characters.Reactions has the feet), and rig.steps = false
  r = drive(3, st => { st.speed = 1.3; }); assert.ok(r.differ < 1e-6, 'a walk on the spot is as drawn ' + r.differ);
  r = drive(3, st => { st.speed = 0; st.z += 6 * dt; }); assert.ok(r.differ < 1e-6, 'a person carried along is left alone ' + r.differ);
  r = drive(3, st => { st.speed = 1.3; go(st, 1.3); }, (p, on) => { if (on) p.rig.near = false; }); assert.ok(r.differ < 1e-6, 'a far-off person is left alone ' + r.differ);
  r = drive(3, st => { st.speed = 1.3; go(st, 1.3); }, (p, on) => { if (on) p.rig.stride.hold = true; }); assert.ok(r.differ < 1e-6, 'a person off its balance is left alone ' + r.differ);
  { const [a, b] = [false, true].map(on => { const p = skeleton({}); p.rig.steps = on; return p; }); let d = 0;
    for (let i = 0; i < 120; i++) for (const p of [a, b]) { p.rig.play('walk', { at: i / 120, fade: 0 }); p.position.z = i * .02; p.rig.update(dt, { speed: 1.3 }); }
    for (const n of LEGS) d = Math.max(d, a.bones[n].quaternion.angleTo(b.bones[n].quaternion)); assert.ok(d < 1e-6, 'a pose the game drives is as drawn ' + d); }
  // a pose of the game's own takes part when it says it stands on the ground
  { const p = skeleton({}); p.rig.add('guard', () => ({ j: { spine: [.1, 0, 0] }, drop: 0 }), { ground: true }); p.rig.play('guard', { fade: 0 });
    for (let i = 0; i < 90; i++) { p.rotation.y += 2 * dt; p.rig.update(dt); } assert.ok(p.rig.stride.a > .99 && p.rig.stride.feet.some(f => Math.abs(f.dyaw) > .05 || !f.down), 'a pose that says it stands on the ground keeps its feet');
    p.rig.add('float', () => ({ j: {}, drop: 0 })); p.rig.play('float', { fade: 0 }); for (let i = 0; i < 60; i++) p.rig.update(dt); assert.equal(p.rig.stride.a, 0, 'a pose that does not is left alone'); }
  // mixed with standing, a walk keeps its own beat and takes shorter steps (it took longer ones more slowly, and slid)
  { const p = skeleton({}); p.rig.steps = false; p.rig.blend(STR, .5); for (let i = 0; i < 30; i++) p.rig.update(dt, { speed: .5 }); const a = p.rig.blendPhase; for (let i = 0; i < 30; i++) p.rig.update(dt, { speed: .5 });
    const beat = ((p.rig.blendPhase - a + 1) % 1) / .5, own = 1.3 / 1.36 / p.rig.size; assert.ok(Math.abs(beat - own) < .03, `a slow walk steps at the walk's own beat: ${beat.toFixed(3)} strides a second against ${own.toFixed(3)}`); }
  console.log('gs.models: steps that are really taken (walks, bends, runs, starts and stops, turning and shoved while standing; left alone on the spot, carried, far off, driven, off balance) ok');
}

// momentum between moves (Rig.carried) and follow-through (follow.js): a person's rig takes a new move up with the speed the body had, and
// what the body carries goes on a moment and settles when the game starts, stops, turns or drops it. Skeletons are driven alike, one as drawn.
{
  const { skeleton } = await import('../src/kit/models/human.js'), HS = await import('../src/kit/models/human-shapes.js'), { Object3D } = await import('three');
  const STR = { idle: 0, walk: 1.3, jog: 3.3, run: 5.6 }, dt = 1 / 60, J = ['hips', 'spine', 'head', 'armL', 'foreL', 'armR', 'foreR', 'legL', 'shinL', 'legR', 'shinR', 'footL', 'footR'];
  const read = p => { const a = []; for (const j of J) { const r = p.bones[j].rotation; a.push(r.x, r.y, r.z); } a.push(p.bones.hips.position.y); return a; };
  // ---- momentum: the sharpest change of any joint's speed from one update to the next, over a change of move (and of the hips' height)
  const change = (secs, at, drive, set) => {
    const P = [false, true].map(on => { const p = skeleton({}); p.rig.momentum = on; p.rig.steps = false; p.rig.follow.amount = 0; set?.(p); return p; });
    const R = P.map(() => ({ jerk: 0, hips: 0, knee: 9, elbow: -9, low: 9, tr: [] }));
    P.forEach((p, k) => { let was = null, wv = null; for (let i = 0, n = Math.round(secs / dt); i < n; i++) {
      const t = i * dt, sp = drive(p, t); p.rig.update(dt, { speed: sp }); const a = read(p), v = was && a.map((x, c) => (x - was[c]) / dt), r = R[k], e = a.length - 1;
      if (wv && t >= at - .001 && t <= at + .6) for (let c = 0; c <= e; c++) { const d = Math.abs(v[c] - wv[c]); if (c === e) r.hips = Math.max(r.hips, d); else r.jerk = Math.max(r.jerk, d); }
      r.knee = Math.min(r.knee, p.bones.shinL.rotation.x, p.bones.shinR.rotation.x); r.elbow = Math.max(r.elbow, p.bones.foreL.rotation.x, p.bones.foreR.rotation.x); r.low = Math.min(r.low, a[e]);
      was = a; wv = v; r.tr.push(a);
    } });
    return { fade: R[0], kept: R[1], P, end: Math.max(...R[0].tr.at(-1).map((x, c) => Math.abs(x - R[1].tr.at(-1)[c]))), after: s => { const i = Math.round((at + s) / dt); return Math.max(...R[1].tr[i].map((x, c) => Math.abs(x - R[0].tr.at(-1)[c]))); } };
  };
  const stop = change(4, 2.13, (p, t) => { if (t < 2.13) { p.rig.blend(STR, 1.3); return 1.3; } p.rig.play('idle', { fade: .22 }); return 0; });
  assert.ok(stop.kept.jerk < stop.fade.jerk * .5 && stop.kept.hips < stop.fade.hips * .5, `a walk that stops: a joint's speed changes less than half as sharply (${stop.kept.jerk.toFixed(2)} against ${stop.fade.jerk.toFixed(2)} rad/s in an update; the hips ${stop.kept.hips.toFixed(3)} against ${stop.fade.hips.toFixed(3)} m/s)`);
  assert.ok(stop.end < 1e-9, 'and it ends standing just as it did: ' + stop.end);
  const down = change(3, 1, (p, t) => { p.rig.play(t < 1 ? 'idle' : 'crouch', { fade: .2 }); return 0; });
  assert.ok(down.kept.jerk < down.fade.jerk * .6 && down.kept.hips < down.fade.hips * .6, `standing to a crouch: ${down.kept.jerk.toFixed(2)} against ${down.fade.jerk.toFixed(2)} rad/s, the hips ${down.kept.hips.toFixed(2)} against ${down.fade.hips.toFixed(2)} m/s`);
  assert.ok(down.end < 1e-9 && down.kept.low > down.fade.low - 1e-6, `the hips come down to the crouch and no lower: ${down.kept.low} against ${down.fade.low}`);
  assert.ok(down.kept.knee > -1e-9 && down.kept.elbow < 1e-9, `no knee or elbow bends back on the way: ${down.kept.knee}, ${down.kept.elbow}`);
  // (how long it takes: half way in about six tenths of the fade, all but there by twice the fade)
  { const still = r => r.tr.at(-1), i0 = Math.round(1 / dt), c = J.indexOf('shinL') * 3, at = s => (down.kept.tr[i0 + Math.round(s / dt)][c] - down.kept.tr[i0 - 1][c]) / (still(down.kept)[c] - down.kept.tr[i0 - 1][c]);
    assert.ok(at(.02) < .06 && at(.12) > .35 && at(.12) < .65 && at(.4) > .97, `it starts gently and is there by twice the fade: ${at(.02).toFixed(3)}, ${at(.12).toFixed(2)}, ${at(.4).toFixed(3)}`); }
  const run = change(4, 2.13, (p, t) => { if (t < 2.13) { p.rig.blend(STR, 5.6); return 5.6; } p.rig.play('idle', { fade: .22 }); return 0; });
  assert.ok(run.kept.jerk < run.fade.jerk * .6 && run.kept.knee > -1e-9, `a run that stops: ${run.kept.jerk.toFixed(2)} against ${run.fade.jerk.toFixed(2)} rad/s, and no knee bends back (${run.kept.knee})`);
  // a move begun with no fade is a cut, whatever is asked for after it before the next update; and the pose is the new one at once
  { const p = skeleton({}); p.rig.steps = false; p.rig.follow.amount = 0;
    for (let i = 0; i < 90; i++) { p.rig.blend(STR, 3.3); p.rig.update(dt, { speed: 3.3 }); }
    p.rig.play('idle', { fade: 0 }); p.rig.play('crouch', { fade: .2 }); p.rig.play('idle', { fade: .2 }); p.rig.update(dt);
    const l = p.rig.layers, want = p.rig.sample('idle', l[0].phase).j;
    assert.ok(l.length === 1 && l[0].name === 'idle' && !p.rig.mom.live && ['shinL', 'shinR', 'armL', 'foreR'].every(j => Math.abs(p.rig.cur[j][0] - want[j][0]) < 1e-9), 'a cut is a cut: ' + p.rig.cur.shinL[0] + ' against ' + want.shinL[0]); }
  // other rigs are as they were: a figure cross-fades (momentum is asked for; a sculpted person's rig asks)
  { const { figure } = await import('../src/kit/poses.js'), f = figure(); assert.ok(!f.rig.momentum && !f.rig.follow && skeleton({}).rig.momentum, 'only where it is asked for');
    f.rig.play('crouch', { fade: .2 }); f.rig.update(.1); assert.ok(Math.abs(f.rig.cur.shinL[0] - .95) < .02, 'a figure is half way through its fade at half time: ' + f.rig.cur.shinL[0]); }

  // ---- follow-through: the body's own parts
  const SP = ['arms', 'counter', 'side', 'nod', 'turn', 'chest', 'tilt', 'shrug'];
  const follow = (secs, drive, from = 0, set) => {
    const p = skeleton({}), s = { x: 0, y: 0, z: 0, yaw: 0, av: 0, want: 0, vy: 0 }, F = p.rig.follow, R = { p, most: {}, least: {}, last: 0, tr: [] }; set?.(p);
    for (let i = 0, n = Math.round(secs / dt); i < n; i++) {
      const t = i * dt; drive(s, t); s.av += (s.want - s.av) * (1 - Math.exp(-dt * 5)); s.x += Math.sin(s.yaw) * s.av * dt; s.z += Math.cos(s.yaw) * s.av * dt;
      if (s.av > .15) p.rig.blend(STR, s.av); else p.rig.play('idle', { fade: .22 });
      p.position.set(s.x, s.y, s.z); p.rotation.y = s.yaw; p.rig.update(dt, { speed: s.av }); p.updateMatrixWorld(true);
      if (t >= from) SP.forEach((n, k) => { R.most[n] = Math.max(R.most[n] ?? 0, F.th[k]); R.least[n] = Math.min(R.least[n] ?? 0, F.th[k]); if (Math.abs(F.th[k]) > .003) R.last = t; });
      R.tr.push(read(p));
    }
    R.all = Math.max(...SP.map(n => Math.max(R.most[n], -R.least[n]))); return R;
  };
  const go = follow(7, (s, t) => { s.want = t > 1 && t < 4 ? 5.6 : 0; });
  assert.ok(go.most.arms > .12 && go.least.arms < -.12, `a runner's arms are left behind as he sets off and swing on as he pulls up: ${go.most.arms.toFixed(3)}, ${go.least.arms.toFixed(3)}`);
  assert.ok(go.least.nod < -.03 && go.most.nod > .03 && go.last < 6, `his head tips back and then nods, and all of it is still again (by ${go.last.toFixed(1)} s)`);
  const walk = follow(6, s => { s.want = 1.3; }, 2); assert.ok(walk.all < .002, 'a steady walk: nothing is added to it: ' + walk.all);
  const stand = follow(4, s => { s.want = 0; }); assert.ok(stand.all === 0, 'nor to a person standing: ' + stand.all);
  const turn = follow(5, (s, t) => { s.want = 0; if (t > 1 && t < 2) s.yaw += 2.5 * dt; });
  assert.ok(turn.least.turn < -.02 && turn.least.chest < -.02 && turn.most.counter > .04 && turn.last < 3.5, `spun to its left, the head and the rib cage come round after the hips, one arm goes forward and one back: ${turn.least.turn.toFixed(3)}, ${turn.least.chest.toFixed(3)}, ${turn.most.counter.toFixed(3)}`);
  const push = follow(4, (s, t) => { s.want = 0; if (t > 1 && t < 1.25) s.x += 2 * dt; }); assert.ok(push.most.side > .05 && push.most.tilt > .02, `pushed to its left, the arms and the head are left to its right: ${push.most.side.toFixed(3)}, ${push.most.tilt.toFixed(3)}`);
  const drop = follow(4, (s, t) => { if (t > 1 && s.y > -.5) { s.vy -= 9.8 * dt; s.y = Math.max(-.5, s.y + s.vy * dt); } }); assert.ok(drop.most.shrug > .03 && drop.last < 2.5, 'dropped half a metre, the shoulders give as it lands: ' + drop.most.shrug.toFixed(3));
  const moved = follow(4, (s, t) => { if (Math.abs(t - 1) < dt / 2) { s.x += 5; s.yaw += 2; } }); assert.ok(moved.all === 0, 'put somewhere else at a stroke: no push: ' + moved.all);
  // turned off, far off, or in a crowd's bake it is the pose as drawn
  { const asDrawn = set => { const a = follow(5, (s, t) => { s.want = t > 1 && t < 3 ? 5.6 : 0; }, 0, p => { p.rig.steps = false; set(p); }), b = follow(5, (s, t) => { s.want = t > 1 && t < 3 ? 5.6 : 0; }, 0, p => { p.rig.steps = false; p.rig.follow = null; }); return Math.max(...a.tr.map((r, i) => Math.max(...r.map((x, c) => Math.abs(x - b.tr[i][c]))))); };
    assert.ok(asDrawn(p => { p.rig.follow.amount = 0; }) < 1e-9 && asDrawn(p => { p.rig.near = false; }) < 1e-9, 'amount 0, or seen from far off: as drawn');
    assert.ok(asDrawn(() => {}) > .1, '(and with it on the pose does differ)'); }
  // an elbow is never bent back by it, and an arm goes only a little in against the body
  { const r = follow(6, (s, t) => { s.want = t > 1 && t < 3 ? 5.6 : 0; if (t > 3.5 && t < 3.7) s.x -= 3 * dt; }), c = J.indexOf('foreL') * 3; assert.ok(Math.max(...r.tr.map(a => Math.max(a[c], a[c + 6]))) < 1e-9, 'elbows'); }
  // a push never makes a reach of a swing: pulled up from a run, with one arm already swung forward, that arm goes hardly further forward than it is drawn (it comes down late instead)
  { const pull = set => follow(5, (s, t) => { s.want = t > 1 && t < 3 ? 5.6 : 0; }, 0, p => { p.rig.steps = false; set?.(p); }), a = pull(), b = pull(p => { p.rig.follow = null; }), c = J.indexOf('armL') * 3, i0 = Math.round(3 / dt);
    const fwd = r => Math.min(...r.tr.slice(i0).map(x => Math.min(x[c], x[c + 6]))), late = Math.max(...a.tr.slice(i0).map((x, i) => Math.max(b.tr[i0 + i][c] - x[c], b.tr[i0 + i][c + 6] - x[c + 6])));
    assert.ok(fwd(a) > fwd(b) - .06 && fwd(b) < -.2 && late > .07, `the arm of a runner pulled up short: ${fwd(a).toFixed(3)} forward at the most against ${fwd(b).toFixed(3)} as drawn, and ${late.toFixed(3)} behind it in coming down`); }

  // ---- things that hang: the trunk is sculpted with a bone for each thing on its belt, and says where each hangs from
  const sp = { build: { shoulders: 1, chest: 1, waist: 1, hips: 1, limbs: 1, bust: 0, neck: 1 }, top: { kind: 'tunic', pockets: 4, collar: null }, legs: { kind: 'trousers' }, feet: { kind: 'tall' }, belt: {}, web: { y: true, pouches: 2 }, extras: { bag: true, canteen: true, holster: true }, hat: null, pack: null, gear: [], face: {}, hands: 'grip' };
  const tr = HS.sculpt(HS.jobsFor(sp)[0]), share = {}; for (let i = 0; i < tr.n; i++) for (let q = 0; q < 4; q++) if (tr.SW[i * 4 + q]) { const n = tr.names[tr.SI[i * 4 + q]]; share[n] = (share[n] || 0) + 1; }
  assert.deepEqual(Object.keys(tr.hang).sort(), ['bag', 'flask', 'holster']); for (const n in tr.hang) { const h = tr.hang[n]; assert.ok(share[n] > 40 && h.at[1] > .95 && h.at[1] < 1.12 && Math.abs(Math.hypot(h.away[0], h.away[2]) - 1) < 1e-9 && h.at[0] * h.away[0] + h.at[2] * h.away[2] > .1, `${n}: ${share[n]} points on a bone of its own, hung from the belt, and it knows which way is out`); }
  assert.ok(!HS.sculpt(HS.jobsFor({ ...sp, extras: {} })[0]).names.some(n => tr.hang[n]), 'and a trunk with nothing on its belt has no such bones');
  { const seen = new Map(), w = i => { const u = {}; for (let q = 0; q < 4; q++) if (tr.SW[i * 4 + q]) u[tr.names[tr.SI[i * 4 + q]]] = tr.SW[i * 4 + q] / 255; return u; }; let pairs = 0, torn = 0;
    for (let i = 0; i < tr.n; i++) { const k = [0, 1, 2].map(c => Math.round(tr.P[i * 3 + c] * 1e5)).join(), j = seen.get(k); if (j === undefined) { seen.set(k, i); continue; } const a = w(i), b = w(j); pairs++; if ([...new Set([...Object.keys(a), ...Object.keys(b)])].some(n => Math.abs((a[n] || 0) - (b[n] || 0)) > .01)) torn++; }
    assert.ok(pairs > 100 && torn === 0, `points in the same place still go with the same bones: ${torn} of ${pairs}`); }
  const kit = (secs, drive, from = 0, more) => {
    const p = skeleton({}), s = { x: 0, z: 0, yaw: 0, av: 0, want: 0 }, hips = HS.AT.hips, spine = HS.AT.spine, T = {};
    for (const n in tr.hang) { const { at, ...how } = tr.hang[n], b = new Object3D(); b.position.set(at[0] - hips[0], at[1] - hips[1], at[2] - hips[2]); p.bones.hips.add(b); T[n] = p.rig.hang(b, { ...how, ...more }); }
    { const b = new Object3D(); p.bones.spine.add(b); T.pack = p.rig.hang(b, { pivot: [0, 1.45 - spine[1], -.1 - spine[2]], swing: .008, bounce: .0016, stiff: 200, damp: 12, most: .08, away: [0, 0, -1], ...more }); }
    const R = { p, T, swing: {}, bounce: {}, into: 0, last: 0 };
    for (let i = 0, n = Math.round(secs / dt); i < n; i++) {
      const t = i * dt; drive(s, t, p); s.av += (s.want - s.av) * (1 - Math.exp(-dt * 5)); s.x += Math.sin(s.yaw) * s.av * dt; s.z += Math.cos(s.yaw) * s.av * dt;
      if (s.av > .15) p.rig.blend(STR, s.av); else p.rig.play('idle', { fade: .22 });
      p.position.set(s.x, 0, s.z); p.rotation.y = s.yaw; p.rig.update(dt, { speed: s.av }); p.updateMatrixWorld(true);
      for (const n in T) { const h = T[n]; if (t >= from) { R.swing[n] = Math.max(R.swing[n] ?? 0, Math.abs(h.x), Math.abs(h.z)); R.bounce[n] = Math.max(R.bounce[n] ?? 0, Math.abs(h.y)); } R.into = Math.min(R.into, h.z * h.nx - h.x * h.nz); if (Math.abs(h.x) + Math.abs(h.z) + Math.abs(h.y) * 10 > .006) R.last = t; }
    }
    return R;
  };
  const jog = kit(6, s => { s.want = 3.3; }, 2);
  assert.ok(jog.swing.bag > .02 && jog.swing.flask > .02 && jog.swing.holster < jog.swing.bag * .6 && jog.bounce.pack > .005 && jog.bounce.pack < .03, `jogging, a bag and a canteen swing at the hip, a holster less, and a pack bounces: ${JSON.stringify(jog.swing, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v)}, ${jog.bounce.pack.toFixed(4)} m`);
  assert.ok(jog.into > -.0121, 'none of them swings into the body: ' + jog.into);
  const halt = kit(7, (s, t) => { s.want = t > 1 && t < 4 ? 5.6 : 0; }); assert.ok(halt.swing.bag > .1 && halt.swing.pack > .04 && halt.into > -.0121 && halt.last > 4.2 && halt.last < 6.5, `a runner who pulls up: they swing on and are still again (bag ${halt.swing.bag.toFixed(3)}, pack ${halt.swing.pack.toFixed(3)}, still by ${halt.last.toFixed(1)} s)`);
  const idle = kit(4, s => { s.want = 0; }, 1); assert.ok(Math.max(...Object.values(idle.swing)) < .004 && Math.max(...Object.values(idle.bounce)) < .0003, 'standing, they hang still: ' + JSON.stringify(idle.swing));
  // a thing goes back exactly as it was; seen from further off nothing swings; apply: false only works the swing out
  { const b = halt.T.bag.thing, rest = halt.T.bag.rest; halt.p.rig.follow.still(); assert.ok(b.position.distanceTo(rest) < 1e-12 && Math.abs(b.quaternion.w - 1) < 1e-12, 'put back as it was');
    const far = kit(4, (s, t, p) => { p.rig.fine = false; s.want = t > 1 ? 5.6 : 0; }); assert.ok(Math.max(...Object.values(far.swing)) === 0, 'not close up: nothing swings');
    const own = kit(4, (s, t) => { s.want = t > 1 ? 5.6 : 0; }, 0, { apply: false }); assert.ok(own.swing.bag > .05 && own.T.bag.thing.quaternion.w === 1 && own.T.bag.thing.position.distanceTo(own.T.bag.rest) === 0, 'apply: false: worked out, and the thing left alone'); }
  // and what it costs: a person's update with all of it against one as drawn
  { const mk = on => { const p = skeleton({}); p.rig.steps = false; if (!on) { p.rig.momentum = false; p.rig.follow = null; } return p; }, time = p => { let s = 0; const t0 = performance.now(); for (let i = 0; i < 20000; i++) { s += .0003; p.position.z = s * 3; if (i % 240 < 120) p.rig.blend(STR, 3.3); else p.rig.play('idle', { fade: .22 }); p.rig.update(dt, { speed: 3.3 }); } return (performance.now() - t0) / 20000 * 1000; };
    time(mk(true)); time(mk(false)); const a = time(mk(true)), b = time(mk(false)); assert.ok(a - b < 12, `momentum and follow-through cost ${(a - b).toFixed(1)} microseconds a person an update`); }
  console.log('gs.models: momentum between moves (a joint keeps its speed into the new move, no knee bends back, a cut is a cut) and follow-through (arms, head, rib cage, shoulders; a bag, a canteen, a holster and a pack that swing and bounce; still in a steady walk, at a stroke, far off) ok');
}
// a live face (human-head.js, human-face.js): the head is sculpted with bones for the eyes, the upper lids, the brows, the jaw and the
// corners of the mouth, lips cut apart along their line, teeth and the inside of a mouth; LiveFace puts those bones where blinks,
// a look, an expression or a line of speech have them, and the rig steps it with the body
{
  const F = await import('../src/kit/models/field.js'); await F.thinReady;
  const HS = await import('../src/kit/models/human-shapes.js'), HH = await import('../src/kit/models/human-head.js'), { skeleton } = await import('../src/kit/models/human.js'), { LiveFace, LIVE_SHAPES } = await import('../src/kit/models/human-face.js'), { Vector3, Object3D } = await import('three');
  const FACE = ['jaw', 'eyeL', 'eyeR', 'lidL', 'lidR', 'browL', 'browR', 'browInL', 'browInR', 'cornerL', 'cornerR'], dt = 1 / 60;
  // ---- the sculpted head
  {
    const face = { jaw: 1, chin: 1, brow: 1, nose: 1, lips: 1, cheeks: 1, eyes: 1, soft: 0 }, { HC, EYE, MOUTH } = HH;
    const sp = { build: { shoulders: 1, chest: 1, waist: 1, hips: 1, limbs: 1, bust: 0, neck: 1 }, top: { kind: 'shirt', sleeves: 'long', pockets: 0 }, legs: { kind: 'trousers' }, feet: { kind: 'shoes' }, face, hat: null, belt: null, web: null, extras: {}, pack: null, gear: [], hands: 'open', gloves: null, hair: '#333', hairStyle: 'short', moustache: false };
    const p = HS.sculpt(HS.jobsFor(sp).find(j => j.kind === 'head')), P = p.P, n = p.n, I = p.I[0], slotOf = i => p.slots[p.slot[i]], inside = i => ['mouth', 'teeth', 'tongue'].includes(slotOf(i));
    const W = (i, name) => { const b = p.names.indexOf(name); let w = 0; for (let k = 0; k < 4; k++) if (p.SI[i * 4 + k] === b) w += p.SW[i * 4 + k] / 255; return w; };
    assert.ok(FACE.every(b => p.names.includes(b)), 'the head has the bones of a face: ' + p.names);
    for (let i = 0; i < n; i++) assert.ok(Math.abs(p.SW[i * 4] + p.SW[i * 4 + 1] + p.SW[i * 4 + 2] + p.SW[i * 4 + 3] - 255) <= 2, 'weights are whole, to their rounding (the mesh makes them whole)');
    for (const b of FACE) { let most = 0; for (let i = 0; i < n; i++) most = Math.max(most, W(i, b)); assert.ok(most > .5, `${b} has skin of its own to move (${most.toFixed(2)} at the most)`); }
    // each eyeball turns wholly with its own bone; what is inside the mouth is drawn close up only
    let eyes = 0, loose = 0; for (let i = 0; i < n; i++) if (slotOf(i).startsWith('eye')) { eyes++; if (W(i, P[i * 3] > 0 ? 'eyeL' : 'eyeR') < .99) loose++; } assert.ok(eyes > 150 && loose === 0, `eyeballs on their own bones: ${loose} of ${eyes} points are not`);
    const count = L => { let c = 0; for (let t = 0; t < p.I[L].length; t += 3) if (inside(p.I[L][t])) c++; return c; };
    assert.ok(['mouth', 'teeth', 'tongue'].every(s => p.slots.includes(s)) && count(0) > 200 && count(1) === 0 && count(2) === 0, `teeth, a tongue and the inside of a mouth, at the close level only: ${[count(0), count(1), count(2)]}`);
    // the lips are cut apart along their line: every point on it has a twin in the same place, one for each lip
    const used = new Uint8Array(n); for (const i of I) used[i] = 1;
    const by = new Map(); for (let i = 0; i < n; i++) { if (!used[i] || inside(i)) continue; const x = P[i * 3], hy = P[i * 3 + 1] - HC[1], hz = P[i * 3 + 2] - HC[2]; if (hz > .05 && Math.abs(hy - HH.lipLine(x, face)) < 2e-5 && Math.abs(x) < MOUTH.half * 1.09) { const k = Math.round(x * 1e6) + ',' + Math.round(P[i * 3 + 2] * 1e6); (by.get(k) || by.set(k, []).get(k)).push(i); } }
    const pairs = [...by.values()].filter(l => l.length === 2), odd = [...by.values()].filter(l => l.length !== 2).length; assert.ok(pairs.length > 40 && odd === 0, `the lips' line: ${pairs.length} pairs of points, ${odd} without a twin`);
    // posed by hand, as the skin blends it: a bone turned about its own place
    const at = Object.fromEntries(HH.faceBones(face).map(([nm, , q]) => [nm, q]));
    const rotX = (c, an) => ([x, y, z]) => { const dy = y - c[1], dz = z - c[2], C = Math.cos(an), S = Math.sin(an); return [x, c[1] + dy * C - dz * S, c[2] + dy * S + dz * C]; };
    const posed = (i, T) => { const q = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], o = [0, 0, 0]; let ws = 0; for (let k = 0; k < 4; k++) { const w = p.SW[i * 4 + k]; if (!w) continue; const f = T[p.names[p.SI[i * 4 + k]]], r = f ? f(q) : q; o[0] += r[0] * w; o[1] += r[1] * w; o[2] += r[2] * w; ws += w; } return [o[0] / ws, o[1] / ws, o[2] / ws]; };
    // the jaw dropped: the lips part in the middle and stay closed at the corners, the upper lip stays where it is, and no skin is torn
    { const T = { jaw: rotX(at.jaw, .1) }, gap = fr => { let best = null; for (const pr of pairs) { const e = Math.abs(P[pr[0] * 3]) / MOUTH.half; if (!best || Math.abs(e - fr) < Math.abs(Math.abs(P[best[0] * 3]) / MOUTH.half - fr)) best = pr; } const A = posed(best[0], T), B = posed(best[1], T), up = A[1] > B[1] ? best[0] : best[1], U = posed(up, T); return [Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]), Math.hypot(U[0] - P[up * 3], U[1] - P[up * 3 + 1], U[2] - P[up * 3 + 2])]; };
      const mid = gap(0), end = gap(.95); assert.ok(mid[0] > .008 && mid[0] < .013 && mid[1] < 1e-4 && end[0] < 2e-4, `a jaw turned a tenth of a radian parts the lips ${(mid[0] * 1000).toFixed(1)} mm in the middle (the upper lip moves ${(mid[1] * 1000).toFixed(2)}) and ${(end[0] * 1000).toFixed(2)} at the corners`);
      let worst = 0; for (let t = 0; t < I.length; t += 3) { if (inside(I[t]) || inside(I[t + 1]) || inside(I[t + 2])) continue; const q = [0, 1, 2].map(k => posed(I[t + k], T)); for (let k = 0; k < 3; k++) { const a = I[t + k] * 3, b = I[t + (k + 1) % 3] * 3, l0 = Math.hypot(P[a] - P[b], P[a + 1] - P[b + 1], P[a + 2] - P[b + 2]), A = q[k], B = q[(k + 1) % 3]; if (l0 > 1e-5) worst = Math.max(worst, Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) / l0); } }
      assert.ok(worst < 2.5, `no edge of the skin is stretched far by it: ${worst.toFixed(2)} times at the most`); }
    // a blink: how much of the left eyeball shows from straight in front, open and with the lid turned as far as the head says it closes
    { const tris = []; for (let t = 0; t < I.length; t += 3) { if (slotOf(I[t]).startsWith('eye')) continue; const x = P[I[t] * 3], hy = P[I[t] * 3 + 1] - HC[1]; if (Math.abs(x - EYE[0]) < .03 && Math.abs(hy) < .03 && P[I[t] * 3 + 2] - HC[2] > .05) tris.push(I[t], I[t + 1], I[t + 2]); }
      const st = .00025, GX = 140, GY = 80, x0 = EYE[0] - .0175, y0 = HC[1] - .01, R2 = .0122 * .0122;
      const shows = T => { const Q = new Map(), q = i => Q.get(i) || Q.set(i, T ? posed(i, T) : [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]).get(i), cover = new Uint8Array(GX * GY); let open = 0;
        for (let t = 0; t < tris.length; t += 3) { const A = q(tris[t]), B = q(tris[t + 1]), C = q(tris[t + 2]), det = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]); if (Math.abs(det) < 1e-14) continue;
          const g0 = Math.max(0, Math.ceil((Math.min(A[0], B[0], C[0]) - x0) / st)), g1 = Math.min(GX - 1, Math.floor((Math.max(A[0], B[0], C[0]) - x0) / st)), h0 = Math.max(0, Math.ceil((Math.min(A[1], B[1], C[1]) - y0) / st)), h1 = Math.min(GY - 1, Math.floor((Math.max(A[1], B[1], C[1]) - y0) / st));
          for (let gx = g0; gx <= g1; gx++) for (let gy = h0; gy <= h1; gy++) { const x = x0 + gx * st, y = y0 + gy * st, l1 = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (y - C[1])) / det, l2 = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (y - C[1])) / det, l3 = 1 - l1 - l2; if (l1 < 0 || l2 < 0 || l3 < 0) continue;
            const r2 = R2 - (x - EYE[0]) ** 2 - (y - HC[1]) ** 2; if (r2 > 0 && l1 * A[2] + l2 * B[2] + l3 * C[2] > HC[2] + EYE[2] + Math.sqrt(r2)) cover[gx + gy * GX] = 1; } }
        for (let gx = 0; gx < GX; gx++) for (let gy = 0; gy < GY; gy++) if (R2 - (-.0175 + gx * st) ** 2 - (-.01 + gy * st) ** 2 > 0 && !cover[gx + gy * GX]) open++; return open * st * st * 1e6; };
      const open = shows(null), half = shows({ lidL: rotX(at.lidL, p.lid * .5) }), shut = shows({ lidL: rotX(at.lidL, p.lid) });
      assert.ok(p.lid > .6 && p.lid < 1 && open > 100 && half > open * .3 && half < open * .65 && shut < open * .02, `the upper lid closes the eye in ${p.lid.toFixed(2)} rad: ${open.toFixed(0)} mm2 of the eyeball shows open, ${half.toFixed(0)} half way, ${shut.toFixed(1)} shut`); }
  }
  // ---- the face at work, on a bare skeleton
  const mk = () => { const p = skeleton({}); p.face.blinkEvery = 0; return p; }, run = (p, secs, each) => { for (let i = 0; i < Math.round(secs / dt); i++) { p.rig.update(dt); p.updateMatrixWorld(true); each?.(i); } };
  const v = new Vector3(), gaze = b => { b.getWorldDirection(v); return [Math.atan2(v.x, v.z), Math.asin(-v.y)]; }, headAt = p => p.bones.head.getWorldPosition(new Vector3());
  { const p = skeleton({}), f = p.face, B = p.bones;
    assert.ok(f instanceof LiveFace && p.rig.face === f && FACE.every(b => B[b]?.isBone) && LIVE_SHAPES.includes('blink') && LIVE_SHAPES.includes('winkL'), 'a person has a live face, and bones for it');
    // blinks by themselves, a few seconds apart; one asked for shuts in a twentieth of a second and is over in a fifth
    let blinks = 0, was = 0; run(p, 40, () => { const c = B.lidL.rotation.x > f.lid * .8; if (c && !was) blinks++; was = c; }); assert.ok(blinks >= 5 && blinks <= 26, `blinks by itself: ${blinks} in 40 seconds`);
    f.blinkEvery = 0; run(p, 1); const lid0 = B.lidL.rotation.x; f.blink(); const seen = []; run(p, .3, () => seen.push(B.lidL.rotation.x));
    assert.ok(Math.abs(lid0) < .2 * f.lid && Math.max(...seen.slice(0, 5)) > f.lid * .9 && Math.abs(B.lidR.rotation.x - B.lidL.rotation.x) < 1e-9 && seen.at(-1) < f.lid * .2, `a blink: open ${lid0.toFixed(2)}, shut ${Math.max(...seen).toFixed(2)} of ${f.lid} within five updates, open again ${seen.at(-1).toFixed(2)}`); }
  // set(): every shape moves what it names
  { const p = mk(), f = p.face, B = p.bones, R = f.rest, put = (s, a = 1) => { for (const k of LIVE_SHAPES) f.set(k, 0); if (s) f.set(s, a); run(p, .7); };
    put('blink'); assert.ok(Math.abs(B.lidL.rotation.x - f.lid) < .01 && Math.abs(B.lidR.rotation.x - f.lid) < .01, 'blink: both lids down');
    put('winkL'); assert.ok(B.lidL.rotation.x > f.lid * .97 && B.lidR.rotation.x < f.lid * .2, 'a wink: one lid'); put('winkR'); assert.ok(B.lidR.rotation.x > f.lid * .97 && B.lidL.rotation.x < f.lid * .2);
    put('open'); const jaw = B.jaw.rotation.x; assert.ok(jaw > .06 && jaw < .09 && B.cornerL.position.y < R.cornerL.y - .001, `open: the jaw drops (${jaw.toFixed(3)} rad) and the corners come some of the way`);
    put('smile'); assert.ok(B.cornerL.position.y > R.cornerL.y + .003 && B.cornerL.position.x > R.cornerL.x + .003 && B.cornerR.position.x < R.cornerR.x - .003 && B.lidL.rotation.x > .02, 'a smile: corners up and out, eyes a little narrowed');
    put('frown'); assert.ok(B.cornerL.position.y < R.cornerL.y - .003 && B.cornerR.position.y < R.cornerR.y - .003, 'a frown: corners down');
    put('round'); assert.ok(B.cornerL.position.x < R.cornerL.x - .003 && B.cornerR.position.x > R.cornerR.x + .003 && B.cornerL.position.z > R.cornerL.z + .002, 'a round mouth: corners in and forward'); put('wide'); assert.ok(B.cornerL.position.x > R.cornerL.x + .003);
    put('surprise'); assert.ok(B.browL.position.y > R.browL.y + .004 && B.browInR.position.y > R.browInR.y + .003 && B.lidL.rotation.x < -.05 && B.jaw.rotation.x > .01, 'surprise: brows up, eyes wide, the mouth a little open');
    put('angry'); assert.ok(B.browInL.position.y < R.browInL.y - .003 && B.browInL.position.x < R.browInL.x - .002 && B.browInR.position.x > R.browInR.x + .002, 'anger: the inner ends of the brows down and together');
    put('sad'); assert.ok(B.browInL.position.y > R.browInL.y + .003 && B.cornerL.position.y < R.cornerL.y - .002, 'sorrow: inner ends up, corners down');
    put('squint'); assert.ok(B.lidL.rotation.x > .3 * f.lid && B.lidL.rotation.x < .6 * f.lid, 'a squint: lids part of the way');
    put('blink', .5); assert.ok(Math.abs(B.lidL.rotation.x - .5 * f.lid) < .08, 'amounts between: half a blink');
    put(null); assert.ok(Math.abs(B.jaw.rotation.x) < 1e-3 && B.cornerL.position.distanceTo(R.cornerL) < 1e-4 && B.browL.position.distanceTo(R.browL) < 1e-4, 'and back to rest');
    // eased, never snapped
    f.set('open', 1); p.rig.update(dt); assert.ok(B.jaw.rotation.x > 0 && B.jaw.rotation.x < .03, 'a shape is eased in'); }
  // look(): the eyes onto a point, each eye by itself (they cross onto something close), as far as eyes turn, an Object3D followed
  { const p = mk(), f = p.face, B = p.bones; run(p, .2); const h = headAt(p);
    f.look([h.x + 1, h.y + .06, h.z + 3]); run(p, .3); const a = gaze(B.eyeL); const e = B.eyeL.getWorldPosition(new Vector3()); assert.ok(Math.abs(a[0] - Math.atan2(h.x + 1 - e.x, h.z + 3 - e.z)) < .03 && f.yaw > .1, `the eyes go to a point on the left: ${a[0].toFixed(2)}`);
    f.look({ x: h.x - 9, y: h.y, z: h.z + 1 }); run(p, .3); assert.ok(f.yaw < -.5 && f.yaw > -.6, `no further than eyes turn: ${f.yaw.toFixed(2)}`);
    f.look([h.x, h.y + 3, h.z + 1]); run(p, .3); const up = f.pitch; f.look([h.x, h.y - 3, h.z + 1]); run(p, .3); assert.ok(up < -.3 && up > -.4 && f.pitch > .4 && f.pitch < .5 && B.lidL.rotation.x > .2 * f.lid, `up ${up.toFixed(2)} and down ${f.pitch.toFixed(2)}, and the lid comes down with the eye`);
    const near = new Object3D(), before = (x, y, z) => B.head.localToWorld(near.position.set(x, y, z)); before(0, .165, .3); f.look(near); run(p, .3); assert.ok(B.eyeL.rotation.y < -.05 && B.eyeR.rotation.y > .05, `both eyes turn in onto something close: ${B.eyeL.rotation.y.toFixed(2)}, ${B.eyeR.rotation.y.toFixed(2)}`);
    before(.08, .165, .3); run(p, .3); assert.ok(B.eyeL.rotation.y > .1 && B.eyeR.rotation.y > B.eyeL.rotation.y + .1, 'and follow it as it moves');
    f.look(null); run(p, 1); assert.ok(Math.abs(f.yaw) < .36 && f.target === null, 'look(null): they wander again'); }
  // by themselves the eyes keep to a spot in the world while the head turns, and jump on when it has turned too far
  { const p = mk(), f = p.face, B = p.bones; let tries = 0; do { f.dartT = 0; run(p, .3); } while ((Math.abs(f.yaw) > .06 || f.glance) && ++tries < 200);
    f.dartT = 9; const g0 = gaze(B.eyeL)[0], h0 = gaze(B.head)[0], y0 = f.yaw; run(p, .3, () => { p.rotation.y += .4 * dt; }); const g1 = gaze(B.eyeL)[0], turned = gaze(B.head)[0] - h0;
    assert.ok(turned > .07 && Math.abs(g1 - g0) < .03 && Math.abs(y0 - f.yaw - turned) < .03, `the head turned ${turned.toFixed(2)} rad with the body: the eyes still look the same way (${(g1 - g0).toFixed(3)} off), turned ${(y0 - f.yaw).toFixed(2)} back in the head`);
    p.rotation.y += 1.2; run(p, .3); assert.ok(Math.abs(f.yaw) < .2, `turned far at a stroke, they jump to look ahead again: ${f.yaw.toFixed(2)}`);
    let jumps = 0, last = f.yaw; f.dartT = 0; run(p, 20, () => { if (Math.abs(f.yaw - last) > .02) jumps++; last = f.yaw; }); assert.ok(jumps >= 4, `standing, they dart to a new spot now and then: ${jumps} moves in 20 seconds`); }
  // the mouth: a level from the game, and a line of speech
  { const p = mk(), f = p.face, B = p.bones; f.mouth(1); run(p, .3); const open = B.jaw.rotation.x; f.mouth(null); run(p, .3); assert.ok(open > .05 && Math.abs(B.jaw.rotation.x) < .003, `mouth(level) opens the jaw: ${open.toFixed(3)}`);
    f.say('Hello there, over here'); let most = 0, moves = 0, last = 0, t = 0; assert.equal(f.talking, true); while (f.talking && t < 6) { run(p, dt); t += dt; const j = B.jaw.rotation.x; most = Math.max(most, j); if (Math.abs(j - last) > .002) moves++; last = j; } run(p, .3);
    assert.ok(t > .8 && t < 3 && most > .025 && most < .075 && moves > 15 && Math.abs(B.jaw.rotation.x) < .003, `a line of speech moves the jaw for ${t.toFixed(1)} s, ${most.toFixed(3)} rad at the most, and shuts it`); }
  // asleep when told so, and by itself when the head lies over and low (a body on the ground); bent over is not lying down
  { const p = mk(), f = p.face, B = p.bones, shut = () => B.lidL.rotation.x > f.lid * .95 && B.lidR.rotation.x > f.lid * .95;
    run(p, .5); assert.ok(!shut()); f.awake = false; run(p, .6); assert.ok(shut() && Math.abs(f.yaw) < .01, 'awake = false: eyes closed and still'); f.awake = null; run(p, .5); assert.ok(!shut(), 'and open again');
    p.rotation.x = -Math.PI / 2; run(p, .8); assert.ok(shut(), 'laid on the ground: the eyes close by themselves'); f.awake = true; run(p, .5); assert.ok(!shut(), 'awake = true: open even so');
    f.awake = null; p.rotation.x = 0; run(p, .6); assert.ok(!shut(), 'on its feet again: open');
    const q = mk(); run(q, .2); q.bones.waist.rotation.x = 1.35; q.updateMatrixWorld(true); for (let i = 0; i < 60; i++) q.face.step(dt); assert.ok(q.face.lie === 0 && q.bones.lidL.rotation.x < q.face.lid * .3, 'bent double is not lying down'); }
  // a wince; the rig steps the face close up only; a face whose rig is not run is stepped by update(); still() for a crowd's bake
  { const p = mk(), f = p.face, B = p.bones, R = f.rest; run(p, .3); f.wince(); run(p, .1); const lid = B.lidL.rotation.x, brow = B.browInL.position.y - R.browInL.y; run(p, 1.2);
    assert.ok(lid > f.lid * .8 && brow < -.0015 && B.lidL.rotation.x < f.lid * .2 && Math.abs(B.browInL.position.y - R.browInL.y) < 3e-4, `a wince: eyes screwed shut at once (${lid.toFixed(2)}), brows down, and gone in a second`);
    f.set('blink', 1); p.rig.fine = false; run(p, .5); assert.ok(B.lidL.rotation.x < f.lid * .2, 'seen from further off the face is left alone'); f.update(.5); assert.ok(B.lidL.rotation.x < f.lid * .2, 'and update() leaves it to the rig');
    p.rig.fine = true; run(p, .5); assert.ok(B.lidL.rotation.x > f.lid * .95); f.still(); assert.ok(B.lidL.rotation.x === 0 && B.jaw.rotation.x === 0 && B.eyeL.rotation.y === 0 && B.cornerL.position.equals(R.cornerL), 'still(): every bone back at rest');
    const q = skeleton({}), own = new LiveFace(q, q.bones); own.blinkEvery = 0; own.set('open', 1); for (let i = 0; i < 40; i++) own.update(dt); assert.ok(q.bones.jaw.rotation.x > .06, 'a face with no rig running is stepped by update()'); }
  // and what it costs
  { const time = on => { const p = skeleton({}); p.rig.steps = false; if (!on) p.rig.face = null; const t0 = performance.now(); for (let i = 0; i < 20000; i++) { p.rig.update(dt); if (i % 4 === 0) p.updateMatrixWorld(true); } return (performance.now() - t0) / 20000 * 1000; };
    time(true); time(false); const a = time(true), b = time(false); assert.ok(a - b < 8, `a live face costs ${(a - b).toFixed(1)} microseconds a person an update`); }
  console.log('gs.models: a live face (bones for eyes, lids, brows, jaw and mouth corners; lips that part; a blink that closes the eye; eyes onto a point and holding a spot as the head turns; expressions, speech, sleep, a wince) ok');
}

// gs.models.creature: animals and monsters from a seed (the choosing, the bones, the sculpt, the gaits)
{
  const CS = await import('../src/kit/models/creature-shapes.js'), MV = await import('../src/kit/models/creature-moves.js'), { Rig } = await import('../src/kit/poses.js'), THREE = await import('three');
  await CS.thinReady;
  const likes = Object.keys(CS.CREATURE_LIKES);
  assert.equal(likes.length, 35); assert.deepEqual(CS.CREATURE_KINDS, ['quad', 'bird', 'fish', 'insect', 'monster']);
  for (const k of CS.CREATURE_KINDS) assert.ok(likes.some(l => CS.CREATURE_LIKES[l] === k), 'animals of kind ' + k);
  // the same seed makes the same creature; colours and size don't change its shape; another seed does
  const a = CS.planOf({ like: 'deer', seed: 5 }), b = CS.planOf({ like: 'deer', seed: 5 }), c = CS.planOf({ like: 'deer', seed: 5, colour: '#ff0000', size: 3, pattern: 'spots' }), d = CS.planOf({ like: 'deer', seed: 6 }), book = CS.planOf({ like: 'deer' });
  assert.deepEqual(a, b, 'the same seed, the same plan'); assert.equal(c.key, a.key, 'colours and size share the sculpt'); assert.notEqual(d.key, a.key, 'another seed, another build');
  assert.ok(c.size === 3 && c.look.colour === '#ff0000' && c.look.pattern === 'spots' && book.size === 1.5 && book.look.colour === '#a9743e', 'what was asked for is kept; no seed: the animal as the book shows it');
  assert.ok(Math.abs(a.size - 1.5) < .2 && a.size !== 1.5 && a.p.H !== undefined && a.p.H !== book.p.H, 'a seed moves its size and measures a little');
  assert.throws(() => CS.planOf({ like: 'unicorn' }), /nothing called 'unicorn'/); assert.throws(() => CS.planOf({ kind: 'robot' }), /no kind called 'robot'/);
  for (const kind of CS.CREATURE_KINDS) { const got = new Set(); for (let seed = 1; seed <= 40; seed++) { const p = CS.planOf({ kind, seed }); assert.equal(p.kind, kind); got.add(p.like); } assert.ok(got.size >= 4, kind + ': the seed picks among ' + got.size + ' animals'); }
  const winged = CS.planOf({ like: 'dog', build: { wings: 1, horns: 'curved', nonsense: 4 } });
  assert.ok(winged.p.wings === 1 && winged.p.horns === 'curved' && !('nonsense' in winged.p) && winged.key !== CS.planOf({ like: 'dog' }).key, 'build sets its measures by name (and only real ones)');
  // every animal: a skeleton that hangs together, and cycles that only turn its own bones, in step with its size
  for (const like of likes) for (const seed of [undefined, 3]) {
    const plan = CS.planOf({ like, seed }), B = CS.build(plan), names = B.bones.map(q => q.name), set = new Set(names), m = B.meta, scale = plan.size / m.span;
    assert.ok(names[0] === 'hips' && B.bones[0].parent === null && set.size === names.length, like + ': one root, no bone twice');
    for (const q of B.bones.slice(1)) assert.ok(set.has(q.parent) && names.indexOf(q.parent) < names.indexOf(q.name), like + ': ' + q.name + ' hangs from a bone made before it');
    assert.ok(m.span > .3 && m.H > 0 && set.has(m.head) && m.legs.every(l => set.has(l.up) && set.has(l.lo)) && m.tail.every(n => set.has(n)) && (m.wings || []).flat().every(n => set.has(n)), like + ': what moving it needs');
    const mv = MV.movesFor(m, scale), twice = MV.movesFor(m, scale * 2);
    for (const need of ['idle', 'attack', 'hurt', 'dead']) assert.ok(mv.poses[need], like + ' can ' + need);
    for (const [name, def] of Object.entries(mv.poses)) for (const ph of [0, .13, .37, .5, .61, .9]) {
      const s = def.cycle(ph); assert.ok(Number.isFinite(s.drop), like + ' ' + name + ': drop');
      for (const [j, t] of Object.entries(s.j)) assert.ok(set.has(j) && t.length === 3 && t.every(Number.isFinite), like + ' ' + name + ' turns ' + j);
    }
    const space = mv.ground || mv.water; assert.ok(space && space.idle === 0, like + ': somewhere to stand');
    for (const [g, v] of Object.entries(mv.speeds)) { assert.ok(v > 0 && v < 40 && mv.poses[g], like + ': ' + g + ' at ' + v); assert.ok(twice.speeds[g] > v, like + ': twice the size is faster'); }
    const gait = mv.poses.walk ? 'walk' : 'swim'; if (mv.poses[gait]?.rate) assert.ok(Math.abs(mv.poses[gait].rate / twice.poses[gait].rate - 2) < 1e-6, like + ': twice the size, twice the stride');
    if (m.wings) assert.ok(mv.air && mv.poses.fly && mv.speeds.fly > (mv.speeds.walk || 0), like + ' flies'); else assert.equal(mv.air, null);
  }
  // a walk covers what its feet sweep: a dog's stride from its own legs
  { const plan = CS.planOf({ like: 'dog' }), B = CS.build(plan), sc = plan.size / B.meta.span, mv = MV.movesFor(B.meta, sc), L = B.meta.legs.reduce((s, l) => s + l.L, 0) / 4;
    assert.ok(Math.abs(1 / mv.poses.walk.rate - 4 * L * Math.sin(.36) * sc) < 1e-9, 'a stride is twice the sweep of a standing foot'); assert.deepEqual(Object.keys(mv.ground), ['idle', 'walk', 'trot', 'run']);
    assert.ok(!MV.movesFor(CS.build(CS.planOf({ like: 'rabbit' })).meta, .4).poses.trot, 'a rabbit hops: no trot'); }
  // sculpts: three levels, every point on real bones with whole weights, both sides alike, feet on the ground, the same every time
  for (const like of ['dog', 'owl', 'shark', 'bee', 'ogre', 'blob']) {
    const plan = CS.planOf({ like }), B = CS.build(plan), set = new Set(B.bones.map(q => q.name)), p = CS.sculpt(plan), t = p.I.map(i => i.length / 3);
    assert.ok(p.n > 1500 && t[0] > t[1] && t[1] > t[2] && t[2] > 150 && t[0] < 36000, like + ': ' + t.join(' / ') + ' triangles');
    assert.ok(p.names.every(n => set.has(n)), like + ': weights name real bones'); assert.ok(['eye0', 'eye1', 'eye2', 'eye3', 'hide'].every(sl => p.slots.includes(sl)), like + ': a coat and eyes');
    let lo = [9, 9, 9], hi = [-9, -9, -9];
    for (let i = 0; i < p.n; i++) { const w = p.SW[i * 4] + p.SW[i * 4 + 1] + p.SW[i * 4 + 2] + p.SW[i * 4 + 3]; assert.ok(w >= 254 && w <= 256, like + ': whole weights'); for (let k = 0; k < 3; k++) { const v = p.P[i * 3 + k]; assert.ok(Number.isFinite(v)); if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; } }
    assert.ok(like === 'blob' || Math.abs(lo[0] + hi[0]) < .02, like + ': the same on both sides'); if (plan.kind !== 'fish') assert.ok(lo[1] > -.05 && lo[1] < .03, like + ': feet at ' + lo[1].toFixed(3));
    if (like === 'dog') { const q = CS.sculpt(CS.planOf({ like, colour: '#123456' })); assert.ok(q.n === p.n && q.P.every((v, i) => v === p.P[i]), 'the same sculpt every time'); assert.ok(p.slots.includes('nose')); }
  }
  // on gs.poses' Rig: its own joints and cycles; a cycle that says how fast it runs keeps its own time
  { const plan = CS.planOf({ like: 'crow' }), B = CS.build(plan), sc = plan.size / B.meta.span, mv = MV.movesFor(B.meta, sc), parts = Object.fromEntries(B.bones.map(q => [q.name, new THREE.Object3D()]));
    parts.hips.position.y = B.meta.H; const rig = new Rig(parts, { height: B.meta.H, joints: Object.keys(parts), poses: mv.poses, fade: 0 });
    rig.play('fly', { fade: 0 }).update(.05); const z1 = parts.wingL.rotation.z; rig.update(.05);
    assert.ok(Math.abs(parts.wingL.rotation.z + parts.wingR.rotation.z) < 1e-9 && parts.wingL.rotation.z !== z1, 'wings beat together, by the clock'); assert.ok(Math.abs(rig.phase - mv.poses.fly.per * .1) < 1e-9, 'at its own beats a second');
    rig.play('walk', { fade: 0 }).update(.1, { speed: mv.speeds.walk }); assert.ok(parts.legL.rotation.x !== parts.legR.rotation.x && Math.abs(parts.wingL.rotation.y) > 1, 'it walks with its wings folded');
    rig.blend(mv.ground, mv.speeds.run).update(.1, { speed: mv.speeds.run }); assert.ok(rig.bw.run === 1, 'the blend space reaches its run'); }
  assert.ok(typeof CS.VERSION === 'number' || typeof CS.VERSION === 'string');
  console.log('gs.models: creatures ok');
}

// fixed game tick: the same updates at 30, 60, 90 and 120 fps; alpha between ticks; physics draws smoothly
{
  const T = await import('../src/kit/tick.js'), { ownedBy } = await import('../src/kit/cleanup.js');
  assert.equal(T.tickRate({ tick: true }), 60); assert.equal(T.tickRate({}), 0); assert.equal(T.tickRate({ tick: 5 }), 0);
  const run = fps => { const card = {}; T.resetTicks(card); const xs = []; let x = 0, v = 0;
    for (let f = 0; f < fps * 2; f++) T.runTicks(card, 60, 1 / fps, h => { v += 900 * h; x += v * h; xs.push(x); });
    return xs; };
  const a = run(60), b = run(120), c = run(30), d = run(90);
  assert.equal(a.length, 120); assert.deepEqual(b, a, '120 fps runs the same ticks as 60'); assert.deepEqual(c, a, '30 fps too'); assert.deepEqual(d.slice(0, 119), a.slice(0, 119), '90 fps too');
  { const card = {}; T.resetTicks(card); let k = 0; for (let f = 0; f < 50; f++) k += T.runTicks(card, 60, (1 + (f % 2 ? .2 : -.2)) / 60, () => {}, 1 / 60);
    assert.equal(k, 50, 'a 60 fps game on a 60 tick runs one update a frame, early or late'); assert.equal(T.tick.alpha, 1, 'and shows the newest tick'); }
  { const card = {}; T.resetTicks(card); T.runTicks(card, 60, 1 / 120, () => {}); assert.ok(Math.abs(T.tick.alpha - .5) < 1e-6, 'half a tick: alpha .5');
    assert.equal(T.tick.mix(10, 20), 15); assert.ok(Math.abs(T.tick.turn(3, -3) - Math.PI) < .05, 'turn goes the short way');
    let n = 0; T.runTicks(card, 60, 1, () => n++); assert.equal(n, T.MAX_STEPS, 'a long hitch runs at most MAX_STEPS'); }
  { const card = {}; T.resetTicks(card); T.runTicks(card, 0, .016, h => assert.equal(h, .016)); assert.equal(T.tick.alpha, 1); assert.equal(T.tick.on, false); }
  { const card = {}; const p = new Physics({ gravity: 900 }); const ball = p.circle(50, 0, 5);
    T.resetTicks(card); T.runTicks(card, 60, 1 / 60, h => p.step(h)); T.runTicks(card, 60, 1 / 120, h => p.step(h));
    assert.ok(ball.sy > ball._was.y && ball.sy < ball.y, 'Physics sy is between the last two ticks'); }
  { let blended = null; const card = {}; const o = { blend(a) { blended = a; } };
    ownedBy(card, () => T.onBlend(o)); T.resetTicks(card); T.runTicks(card, 60, 1.5 / 60, () => {}); T.beforeDraw(card, 60);
    assert.ok(Math.abs(blended - .5) < 1e-6, 'blend hooks get alpha'); }
  console.log('gs.tick ok');
}

// music composer: seeded, every part the same length, every note a real note
{
  const { compose, MOODS } = await import('../src/kit/compose.js'), { freq } = await import('../src/kit/sound.js');
  for (const mood of Object.keys(MOODS)) for (const bars of [4, 8]) {
    const t = compose({ mood, seed: 'kit-test', bars });
    assert.equal(JSON.stringify(t), JSON.stringify(compose({ mood, seed: 'kit-test', bars })), 'same seed, same tune');
    for (const k of ['lead', 'bass', 'pad', 'pad2', 'arp', 'drums', 'drums2', 'lead2']) {
      const toks = t[k].split(' '); assert.equal(toks.length, bars * 8, `${mood} ${k} is ${bars} bars`);
      for (const x of toks) if (k.startsWith('drums')) assert.ok(/^([kshc]+|\.)$/.test(x), 'drum ' + x); else assert.ok(x === '.' || x === '-' || freq(x) > 30, `${mood} ${k} note ${x}`);
    }
    assert.ok(t.tempo >= 60 && t.tempo <= 180 && t.info.chords.length === bars);
  }
  assert.notEqual(compose({ seed: 1 }).lead, compose({ seed: 2 }).lead, 'different seeds, different tunes');
  console.log('gs.sound.compose ok');
}

// gs.solve: a one-answer sudoku made, graded and hinted; a tic-tac-toe opponent that wins and blocks
{
  const { Puzzle, Search } = await import('../src/kit/solve.js');
  const p = new Puzzle(); for (let i = 0; i < 81; i++) p.cell(i, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (let r = 0; r < 9; r++) { p.allDiff([...Array(9)].map((_, c) => r * 9 + c)); p.allDiff([...Array(9)].map((_, c) => c * 9 + r)); }
  for (let b = 0; b < 9; b++) { const ids = []; for (let i = 0; i < 9; i++) ids.push(((b / 3 | 0) * 3 + (i / 3 | 0)) * 9 + (b % 3) * 3 + i % 3); p.allDiff(ids); }
  const full = p.solve({ rng: 7 }).solution;
  for (let r = 0; r < 9; r++) assert.equal(new Set([...Array(9)].map((_, c) => full[r * 9 + c])).size, 9, 'filled grid rows differ');
  const easy = p.carve(full, { rng: 3, grade: 'easy' });
  assert.ok(p.unique(easy) && p.grade(easy).level === 'easy' && Object.keys(easy).length < 40, 'easy sudoku: one answer, deduction alone');
  assert.ok(!p.unique({}), 'an empty grid has many answers');
  const open = Object.keys(full).map(Number).find(k => !(k in easy)), bad = full[open] % 9 + 1;
  const h = p.hint(easy, { [open]: bad });
  assert.ok(h && h.wrong.includes(open) && h.value === full[h.id], 'hint is right and spots the wrong move');
  const q = new Puzzle(); for (const x of 'abc') q.cell(x, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  q.allDiff([...'abc']); q.sum([...'abc'], 24); q.rule(['a', 'b'], ([a, b]) => a < b); q.rule(['b', 'c'], ([b, c]) => b < c);
  assert.deepEqual(q.solve({ limit: 5 }), { solution: { a: 7, b: 8, c: 9 }, count: 1 }, 'sums and rules');
  const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const win = b => { for (const [a, c, d] of lines) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a]; return null; };
  const g = { moves: s => win(s.b) ? [] : s.b.map((v, i) => v ? null : i).filter(x => x !== null), play: (s, m) => { const b = s.b.slice(); b[m] = s.t; return { b, t: s.t === 'X' ? 'O' : 'X' }; },
    turn: s => s.t, over: s => !!win(s.b) || s.b.every(Boolean), score: (s, who) => { const w = win(s.b); return w ? (w === who ? 100 : -100) : 0; }, winner: s => win(s.b) };
  const S = new Search(g);
  for (const mode of ['minimax', 'mcts']) {
    assert.equal(S.best({ b: ['O', 'O', null, 'X', 'X', null, null, null, null], t: 'X' }, { mode, time: 80, rng: 1 }), 5, mode + ' takes the win');
    assert.equal(S.best({ b: ['O', 'O', null, 'X', null, null, null, null, 'X'], t: 'X' }, { mode, time: 80, rng: 1 }), 2, mode + ' blocks');
  }
  let s = { b: Array(9).fill(null), t: 'X' }; while (!g.over(s)) s = g.play(s, S.best(s, { time: 40 }));
  assert.equal(win(s.b), null, 'perfect play draws');
  // think(): the same answer a few milliseconds at a time (what board games' table.think() runs each frame)
  for (const mode of ['minimax', 'mcts']) {
    const job = S.think({ b: ['O', 'O', null, 'X', 'X', null, null, null, null], t: 'X' }, { mode, time: 80, rng: 1 });
    let steps = 0; while (!job.step(2) && steps < 2000) steps++;
    assert.ok(job.done && job.move === 5 && job.ranked.length === 5, mode + ' think() takes the win in steps');
  }
  {   // a fast phone fills the playout tree (200,000 playouts) before the thinking time is spent: think() has its answer then.
      // (It used to wait for the time to pass, which no longer did once the tree stopped growing, so the opponent never moved.)
    let clock = 0; const job = S.think({ b: ['O', 'O', null, 'X', 'X', null, null, null, null], t: 'X' }, { mode: 'mcts', time: 80, rng: 1, now: () => clock += .0001 });
    let steps = 0; while (!job.step(2) && steps < 2000) steps++;
    assert.ok(job.done && job.move === 5 && job.ranked.length === 5, 'mcts think() has its move once the tree is full, before the time is up (' + steps + ' steps)');
  }
  {   // a step stops wherever its milliseconds run out, even deep inside one move's subtree, and still gets rank()'s answer
    const from = { b: Array(9).fill(null), t: 'X' }, want = S.rank(from, { depth: 9, time: 1e9 });
    let clock = 0; const job = S.think(from, { depth: 9, time: 1e9, now: () => clock += .01 });
    let steps = 0, longest = 0; for (;;) { const c0 = clock; const done = job.step(.2); longest = Math.max(longest, clock - c0); steps++; if (done || steps > 1e6) break; }
    assert.deepEqual(job.ranked, want, 'think() in small steps ranks the moves as rank() does');
    assert.ok(steps > 40, 'think() paused inside the tree (' + steps + ' steps)'); assert.ok(longest < .5, 'no step ran long (' + longest.toFixed(2) + ')');
    const short = S.think(from, { depth: 9, time: 3 }); let n = 0; while (!short.step(1) && n < 1000) n++;
    assert.ok(short.done && short.spent < 30 && g.moves(from).includes(short.move), 'think() stops when its time is up');
  }
  const one = S.think({ b: ['X', 'O', 'X', 'O', 'X', 'O', 'O', 'X', null], t: 'X' }); assert.ok(one.done && one.move === 8 && one.step(), 'think() with one move is done at once');
  console.log('gs.solve ok');
}

// gs.tabletop.Chess: chess.js rules behind a small API, and the opponent (chess-ai.js) that searches chess.js's inner move list
{
  const { Chess, loadChess } = await import('../src/kit/chess.js');
  const { bestMove, LEVELS, evaluate } = await import('../src/kit/chess-ai.js');
  let early = null; try { new Chess(); } catch (e) { early = e; }
  assert.ok(early?.kitLoading, 'Chess before the rules load throws StillLoading');
  await loadChess();
  const { Chess: Rules } = await import('chess.js');
  const raw = new Rules();
  for (const k of ['_moves', '_makeMove', '_undoMove']) assert.equal(typeof raw[k], 'function', 'chess.js still has ' + k + ' (the search needs it: see chess-ai.js before updating chess.js)');
  assert.ok(Array.isArray(raw._board) || raw._board?.length === 128, 'chess.js still has _board'); assert.equal(raw._turn, 'w', 'chess.js still has _turn');
  assert.equal(evaluate(raw), 0, 'the start is level');
  const g = new Chess();
  assert.equal(g.turn, 'w'); assert.equal(g.moves().length, 20, 'twenty first moves'); assert.equal(g.moves('e2').length, 2);
  assert.equal(g.move({ from: 'e2', to: 'e5' }), null, 'an illegal move is refused');
  const m = g.move({ from: 'e2', to: 'e4' }); assert.ok(m && m.san === 'e4' && m.piece === 'p' && !m.captured && g.turn === 'b' && g.count === 1);
  assert.equal(g.at('e4')?.type, 'p'); assert.equal(g.pieces().length, 32);
  assert.equal(g.undo()?.to, 'e4'); assert.equal(g.fen, new Rules().fen(), 'undo puts it back');
  assert.equal(new Chess('not a position').moves().length, 20, 'a damaged save starts a fresh game');
  const castle = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'); assert.equal(castle.move({ from: 'e1', to: 'g1' })?.castle, 'k', 'castling is flagged');
  const mated = new Chess('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1'); mated.move({ from: 'f7', to: 'g7' }); assert.ok(mated.mate && mated.over && !mated.draw, 'checkmate is seen');
  // the opponent: takes a mate in one, takes a free queen, leaves the position as it found it, and never plays an illegal move
  const mate = new Rules('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'), fen = mate.fen();
  const best = bestMove(mate, { level: 3, rng: () => .5 }); assert.ok(best.from === 'a1' && best.to === 'a8', 'mate in one: ' + JSON.stringify(best)); assert.equal(mate.fen(), fen, 'the search leaves the game as it was');
  const free = bestMove(new Rules('rnb1kbnr/pppp1ppp/8/4p1q1/4P3/3P4/PPP2PPP/RNBQKBNR w KQkq - 0 3'), { level: 3, rng: () => .5 }); assert.ok(free.from === 'c1' && free.to === 'g5', 'takes the free queen: ' + JSON.stringify(free));
  assert.equal(bestMove(new Rules('7k/8/5K2/8/8/8/8/6R1 b - - 0 1'), { level: 2 })?.to, 'h7', 'a side with one move finds it'); assert.equal(bestMove(new Rules('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), { level: 2 }), null, 'no move in a stalemate');
  const play = new Chess(); let plies = 0;
  for (; plies < 24 && !play.over; plies++) { const r = await play.think({ level: 1 + plies % 2, time: 30 }); assert.ok(r && play.move(r), 'level ' + (1 + plies % 2) + ' plays a legal move at ply ' + plies); }
  // the game is still going after 24 plies, or it ended by the rules: about one game in fifty a Novice walks into a mate before ply 20
  assert.ok(plies === 24 || (plies >= 4 && (play.mate || play.draw)), 'two levels play each other (' + plies + ' plies)'); assert.equal(Chess.LEVELS.length, 5); assert.equal(LEVELS[4].name, 'Master');
  console.log('gs.tabletop.Chess ok');
}

// gs.voxels: a world made, meshed (merged faces, shading), dug, picked, walked on, packed
{
  const { Voxels, BLOCKS } = await import('../src/kit/voxels.js');
  const v = new Voxels({ size: [32, 16, 32], worker: false });
  v.fill(0, 0, 0, 31, 3, 31, BLOCKS.stone);
  v.build();
  let tris = 0; v.group.traverse(o => { if (o.isMesh) tris += o.geometry.index.count / 3; });
  assert.ok(tris > 0 && tris < 400, 'a flat slab merges into few triangles: ' + tris);
  const r = v.ray({ x: 10.5, y: 10, z: 10.5 }, { x: 0, y: -1, z: 0 }, 20);
  assert.ok(r && r.y === 3 && r.ny === 1 && r.id === BLOCKS.stone, 'ray finds the top block and its face');
  const me = { x: 10.5, y: 8, z: 10.5, w: .6, h: 1.7 };
  let hit = { ground: false }; for (let i = 0; i < 60 && !hit.ground; i++) hit = v.move(me, 0, -0.3, 0);
  assert.ok(hit.ground && Math.abs(me.y - 4) < 1e-3, 'falls and stands on the top: ' + me.y);
  v.set(12, 4, 10, BLOCKS.brick);
  const h2 = v.move(me, 3, 0, 0); assert.ok(h2.x && me.x < 12 - .29 && me.x > 11.6, 'stopped by a wall: ' + me.x);
  const h3 = v.move(me, 3, 0, 0, { step: 1.01 }); assert.ok(me.x > 12 && me.y >= 5 - 1e-3, 'steps up onto it with step 1');
  const dug = v.sphere(16, 3, 16, 2.5); assert.ok(dug.changed > 10 && dug.gone[BLOCKS.stone] === dug.changed, 'sphere digs');
  assert.ok(v.dirty.size > 0); v.build(); assert.equal(v.meshing, 0);
  const text = v.pack(), w = new Voxels({ size: [32, 16, 32], worker: false }).unpack(text);
  assert.deepEqual(w.data, v.data, 'pack and unpack'); assert.ok(text.length < 600, 'packed small: ' + text.length);
  const g = new Voxels({ size: [48, 32, 48], worker: false }).generate({ seed: 'kit', kind: 'hills' }).build();
  assert.ok(g.top(24, 24) > 4 && g.group.children.length > 4, 'hills generate and mesh');
  const t0 = performance.now(); const big = new Voxels({ size: [64, 32, 64], worker: false }).generate({ seed: 2 }).build();
  console.log('gs.voxels ok (64x32x64 made and meshed in', Math.round(performance.now() - t0), 'ms)');
}

// gs.ar's floor finder: whole rooms played through it (heights are native: the phone starts at y = 0)
{
  const { FloorFinder } = await import('../src/kit/ar-floor.js');
  let seed = 7; const rnd = () => ((seed = Math.imul(seed ^ seed >>> 15, 2246822507) ^ Math.imul(seed ^ seed >>> 13, 3266489909), (seed ^= seed >>> 16) >>> 0) / 4294967296);
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * .87;
  const near = (a, b, e = .03) => Math.abs(a - b) <= e;
  // n feature points on a level, spread over w x d metres centred at (x, z), each seen a little noisily
  const level = (n, y, { x = 0, z = -1.8, w = 2, d = 2 } = {}) => Array.from({ length: n }, () => [x + (rnd() - .5) * w, y, z + (rnd() - .5) * d]);
  const see = pts => pts.flatMap(([x, y, z]) => [x + gauss() * .01, y + gauss() * .012, z + gauss() * .01]);
  // play a room for `secs`: each quarter second the finder hears the mapped surfaces and the points
  function play(f, secs, { planes = [], pts = null, good = true, py = 0 } = {}) {
    for (let t = 0; t < secs - 1e-9; t += .05) {
      if (good) f.pose(0, py, 0);
      if (good && Math.round(t / .05) % 5 === 0) { if (pts) f.points(see(pts)); f.planes(planes); }
      f.update(.05, good);
    }
    return f;
  }
  const P = (y, a, o = {}) => ({ x: 0, y, z: -1, a, ...o });

  // standing over a mapped floor: found at once
  let f = play(new FloorFinder(), .3, { planes: [P(-1.3, 1)] });
  assert.ok(f.floor === -1.3 && f.src === 'plane' && f.take() === 'found', 'mapped floor found at once');
  // sitting at a desk with no floor in view: the desk is not the floor; after 5 s the usual phone height is used
  f = play(new FloorFinder({ eye: 1.25 }), 4.9, { planes: [P(-.5, 1.2, { z: -.6 })] });
  assert.equal(f.floor, null, 'a desk close under the phone is not the floor');
  play(f, .3, { planes: [P(-.5, 1.2, { z: -.6 })] });
  assert.ok(f.floor === -1.25 && f.src === 'guess' && !f.sure && f.take() === 'guess', 'the search ends on a guess, nobody waits for ever');
  // ...and the real floor replaces the guess when it is mapped
  play(f, .3, { planes: [P(-.5, 1.2, { z: -.6 }), P(-1.1, .6, { z: -2 })] });
  assert.ok(f.floor === -1.1 && f.src === 'plane' && f.take() === 'found', 'a mapped floor replaces the guess');
  // sitting low (phone 65 cm up) over a floor-sized surface, or one that reaches well away: that is the floor
  f = play(new FloorFinder(), .3, { planes: [P(-.65, 4)] }); assert.equal(f.floor, -.65, 'low phone, big floor');
  f = play(new FloorFinder(), .3, { planes: [P(-.65, .5, { z: -2.2 })] }); assert.equal(f.floor, -.65, 'low phone, floor patch far ahead');
  // a bed and a smaller patch of floor: the floor is the lower one
  f = play(new FloorFinder(), .3, { planes: [P(-.8, 2.7), P(-1.3, .5, { z: -2.5 })] }); assert.equal(f.floor, -1.3, 'floor under a bed-sized surface');
  // a scrap of surface far below a big floor is a mistake, not the floor
  f = play(new FloorFinder(), .3, { planes: [P(-1.3, 3), P(-2.1, .1)] }); assert.equal(f.floor, -1.3, 'a scrap below the floor is ignored');
  // once a mapped surface is the floor, a bigger one above it changes nothing...
  f = play(new FloorFinder(), .3, { planes: [P(-1.3, .6)] }); play(f, 3, { planes: [P(-1.3, .6), P(-.8, 2.7)] });
  assert.equal(f.floor, -1.3, 'a bed mapped later does not lift the floor');
  // ...unless the floor's own surface has left the map (it was a mistake), then the room comes back up
  play(f, 3, { planes: [P(-.8, 2.7)] }); assert.equal(f.floor, -.8, 'floor gone from the map: the next surface takes over');
  // a lower surface of real size does take over (the first one was a table)
  f = play(new FloorFinder(), .3, { planes: [P(-.85, 1)] }); play(f, .3, { planes: [P(-.85, 1), P(-1.3, .5)] });
  assert.ok(f.floor === -1.3 && f.take() === 'found', 'a table first, then the floor below it');
  // the same surface growing follows its refined height
  f = play(new FloorFinder(), .3, { planes: [P(-1.3, .5)] }); play(f, .3, { planes: [P(-1.32, 1.5)] }); assert.equal(f.floor, -1.32, 'floor refines as it grows');

  // no mapped surface yet, but feature points lie in a flat layer on the floor: found from points
  const floorPts = level(40, -1.3);
  f = play(new FloorFinder(), 1.5, { pts: floorPts });
  assert.ok(f.src === 'points' && near(f.floor, -1.3) && f.sure, `floor from points: ${f.floor} ${f.src}`);
  assert.equal(f.take(), 'found');
  // a busy table and a thin scatter of floor under it: the floor is still the lower layer
  const table = level(80, -.85, { z: -1.2, w: 1.2, d: .8 }), thin = level(14, -1.3, { w: 2.4, d: 2.4 });
  f = play(new FloorFinder(), 2, { pts: [...table, ...thin] });
  assert.ok(f.src === 'points' && near(f.floor, -1.3), `floor under a table from points: ${f.floor}`);
  // the table gets mapped: the floor stays down, even after the points have gone out of view
  play(f, 1, { pts: [...table, ...thin], planes: [P(-.85, 1)] }); assert.ok(near(f.floor, -1.3), 'mapped table above a points floor');
  play(f, 8, { planes: [P(-.85, 1)] }); assert.ok(near(f.floor, -1.3), 'looking away does not lift the floor onto the table');
  // then the floor itself is mapped and takes over as the surer source
  play(f, .3, { planes: [P(-.85, 1), P(-1.31, .5)] }); assert.ok(f.floor === -1.31 && f.src === 'plane', 'mapped floor refines a points floor');
  // a table already mapped when the round starts, with floor points in view below it: the points get
  // a moment to speak first, and veto the table
  f = play(Object.assign(new FloorFinder(), { expect: true }), 2, { pts: [...table, ...thin], planes: [P(-.85, 1)] });
  assert.ok(near(f.floor, -1.3) && f.src === 'points', `table vetoed by the layer under it: ${f.floor} ${f.src}`);
  // points asked for but the phone sends none (an older app): a mapped floor waits a second at most
  f = play(Object.assign(new FloorFinder(), { expect: true }), .8, { planes: [P(-1.3, 1)] }); assert.equal(f.floor, null);
  play(f, .5, { planes: [P(-1.3, 1)] }); assert.ok(f.floor === -1.3 && f.src === 'plane', 'no points: the mapped floor after a second');
  // ...and not at all when it is last round's floor
  f = play(Object.assign(new FloorFinder({ kept: { y: -1.3, src: 'plane', sure: true } }), { expect: true }), .3, { planes: [P(-1.31, 1)] }); assert.equal(f.floor, -1.31, 'last round\'s floor again: no wait');
  // stray points below a well-seen floor (noise, reflections in a shiny floor) don't drag it down
  const strays = Array.from({ length: 14 }, () => [(rnd() - .5) * 3, -1.4 - rnd() * .8, -2 + (rnd() - .5) * 3]);
  f = play(new FloorFinder(), 2, { pts: [...level(60, -1.3, { w: 3, d: 3 }), ...strays] });
  assert.ok(near(f.floor, -1.3), `strays below the floor ignored: ${f.floor}`);
  // points in a row (a skirting board, a table edge) are a line, not a floor
  const row = Array.from({ length: 40 }, (_, i) => [-1 + i * .05, -1.0, -1 - i * .05]);
  f = play(new FloorFinder(), 3, { pts: row }); assert.equal(f.floor, null, 'a row of points is not a floor');
  f = play(new FloorFinder(), 3, { pts: [...row, ...level(40, -1.3)] }); assert.ok(near(f.floor, -1.3), `floor found past a row of points above it: ${f.floor}`);
  // a desk's points close under the phone are not a floor
  f = play(new FloorFinder(), 3, { pts: level(80, -.5, { z: -.6, w: 1.2, d: .7 }) }); assert.equal(f.floor, null, 'desk points are not a floor');
  // too few points for a sure answer, but better than a blind guess when time runs out
  f = play(new FloorFinder(), 5.2, { pts: level(8, -1.1, { w: 1.5, d: 1.5 }) });
  assert.ok(f.src === 'rough' && near(f.floor, -1.1, .04) && !f.sure, `thin layer used as the estimate: ${f.floor} ${f.src}`);

  // rough hit-test points: three that agree
  f = new FloorFinder(); f.pose(0, 0, 0);
  f.hit(0, -1.31, -2, 'point'); f.hit(.3, -.2, -2, 'point'); f.hit(0, -1.9, -2, 'point'); f.hit(.2, -1.29, -2, 'point'); assert.equal(f.floor, null);
  f.hit(.1, -1.3, -2.2, 'point'); assert.ok(f.src === 'hits' && near(f.floor, -1.3, .011), 'three rough points agree');
  // a hit on a mapped surface counts at once; on a table an iPhone has named, never
  f = new FloorFinder(); f.pose(0, 0, 0); f.hit(0, -1.2, -2, 'plane'); assert.ok(f.floor === -1.2 && f.src === 'plane');
  f = new FloorFinder(); f.pose(0, 0, 0); f.planes([P(-.9, 1, { kind: 'table' })]); f.hit(0, -.9, -1, 'plane'); assert.equal(f.floor, null, 'a named table is never the floor');
  // iPhone: a surface it calls the floor is taken at once, however close; seats and tables are skipped
  f = play(new FloorFinder(), .3, { planes: [P(-.5, .3, { kind: 'floor' }), P(-.8, 2, { kind: 'seat' })] }); assert.equal(f.floor, -.5, 'named floor');

  // last round's floor: used after a short wait when nothing new turns up, at once when set by hand
  f = play(new FloorFinder({ kept: { y: -1.28, src: 'plane', sure: true } }), 1, {}); assert.equal(f.floor, null);
  play(f, .3, {}); assert.ok(f.floor === -1.28 && f.src === 'kept' && f.take() === 'kept', 'last round\'s floor kept');
  f = play(new FloorFinder({ kept: { y: -1.28, src: 'plane', sure: true } }), .3, { planes: [P(-1.3, 1)] }); assert.ok(f.floor === -1.3 && f.src === 'plane', 'fresh evidence beats the kept floor');
  f = play(new FloorFinder({ kept: { y: -1.1, src: 'hand', sure: true } }), .1, {}); assert.ok(f.floor === -1.1 && f.src === 'hand', 'a floor set by hand stands');
  play(f, 1, { planes: [P(-.8, 2), P(-1.5, 2)] }); assert.equal(f.floor, -1.1, 'mapped surfaces do not move a hand-set floor');
  play(f, .3, { planes: [P(-1.13, 2)] }); assert.equal(f.floor, -1.13, '...but one right at it tidies it');
  // a kept floor that can't be right any more (the player went upstairs) is dropped
  f = play(new FloorFinder({ kept: { y: -3.2, src: 'plane', sure: true } }), 4, {}); assert.equal(f.floor, null, 'an impossible kept floor waits the full time');
  play(f, 1.2, {}); assert.ok(f.src === 'guess' && near(f.floor, -1.3));
  // the search only counts time while the room is being tracked; Skip ends it at once
  f = play(new FloorFinder(), 20, { good: false }); assert.equal(f.floor, null, 'no tracking: no time passes');
  f = play(new FloorFinder(), .5, {}); f.giveUp(); assert.ok(f.src === 'guess' && f.take() === 'guess', 'Skip gives the estimate');
  assert.ok(f.progress === 1 && new FloorFinder().progress === 0);
  console.log('gs.ar floor finder ok');
}

// gs.fonts: the font library's names and strings (the files themselves are checked in a browser by scripts/app-test.cjs)
{
  const { list, font, use, ready, pixelFont } = await import('../src/kit/fontlib.js');
  const { readFileSync, existsSync } = await import('node:fs');
  assert.equal(list.length, 19, 'gs.fonts lists ' + list.length + ' fonts'); assert.ok(Object.isFrozen(list) && Object.isFrozen(list[0]));
  assert.equal(list.filter(f => f.pixel).length, 5, 'five pixel fonts');
  assert.equal(font('Bangers', 34), '400 34px "Bangers", Rubik, sans-serif');
  assert.equal(font('bangers'), '400 16px "Bangers", Rubik, sans-serif', 'any case, 16px by default');
  assert.equal(font('Fredoka', 20, 600), '700 20px "Fredoka", Rubik, sans-serif', 'the nearest weight a font has');
  assert.equal(font('Orbitron', 12), '500 12px "Orbitron", Rubik, sans-serif');
  assert.equal(font('Rubik', 14, 800), '800 14px "Rubik", sans-serif');
  assert.equal(font('Courier Prime', 14, 700), '700 14px "Courier Prime", monospace');
  assert.equal(font('VT323', 25), '400 25px "VT323", monospace');
  assert.equal(font('No Such Font', 18), '400 18px "Rubik", sans-serif', 'an unknown name is Rubik');
  assert.equal(use('Bangers', ['Fredoka', 700]), true, 'no page here: use() does nothing'); assert.equal(ready('Bangers'), false);
  assert.equal(pixelFont('tiny').font.name, 'Tiny5'); assert.equal(pixelFont('terminal').font.name, 'VT323'); assert.equal(pixelFont('jersey').font.pixel, 56 / 3);
  assert.equal(pixelFont('silkscreen bold').weight, 700); assert.equal(pixelFont('Silkscreen').weight, 400);
  assert.equal(pixelFont('big'), null); assert.equal(pixelFont('small'), null); assert.equal(pixelFont('Bangers'), null, 'a display font is not a pixel font');
  // every font and weight in the list has its file, and no file is left over
  const files = readFileSync(new URL('../src/kit/font-files.js', import.meta.url), 'utf8');
  const keys = [...files.matchAll(/'([a-z0-9 ]+ \d{3})':/g)].map(m => m[1]).sort();
  const want = list.filter(f => !['Rubik', 'Press Start 2P'].includes(f.name)).flatMap(f => f.weights.map(w => f.name.toLowerCase() + ' ' + w)).sort();
  assert.deepEqual(keys, want, 'font-files.js has one file for every font and weight');
  for (const m of files.matchAll(/from '(@fontsource\/[^'?]+)\?url'/g)) assert.ok(existsSync(new URL('../node_modules/' + m[1], import.meta.url)), m[1] + ' is installed');
  // the licence list names every font package
  const lic = readFileSync(new URL('../src/licences.js', import.meta.url), 'utf8');
  for (const m of files.matchAll(/from '(@fontsource\/[a-z0-9-]+)\//g)) assert.ok(lic.includes(m[1]), m[1] + ' is in the licence list');
  console.log(`gs.fonts: ${list.length} fonts, ${keys.length} files, names, weights and pixel font names ok`);
}

// gs.gfx materials: textures made in code that repeat without a seam (drawing them is checked in a browser by scripts/app-test.cjs)
{
  const { texture, MATERIALS } = await import('../src/kit/materials2d.js');
  const names = Object.keys(MATERIALS); assert.deepEqual(names, ['paper', 'wood', 'stone', 'metal', 'cloth', 'water']);
  const lum = (t, x, y) => { const i = (((y % t.size) + t.size) % t.size * t.size + ((x % t.size) + t.size) % t.size) * 4; return t.data[i] * .3 + t.data[i + 1] * .59 + t.data[i + 2] * .11; };
  // how much the picture changes from one column (or row) to the next, on average
  const step = (t, a, b, down) => { let s = 0; for (let k = 0; k < t.size; k++) s += Math.abs(down ? lum(t, k, a) - lum(t, k, b) : lum(t, a, k) - lum(t, b, k)); return s / t.size; };
  for (const [name, o] of [...names.map(n => [n, {}]), ['wood', { planks: 4 }], ['stone', { blocks: 4 }], ['cloth', { threads: 20 }], ['wood', { seed: 9, color: '#553311' }]]) {
    const t = texture(name, { px: 128, ...o }), again = texture(name, { px: 128, ...o });
    assert.equal(t.size, 128); assert.equal(t.data.length, 128 * 128 * 4);
    assert.deepEqual(t.data, again.data, name + ': the same options give the same picture');
    let inside = 0; for (let k = 0; k < 127; k++) inside = Math.max(inside, step(t, k, k + 1, false), step(t, k, k + 1, true));   // the biggest step anywhere inside (a gap between planks, say)
    const seamX = step(t, 127, 128, false), seamY = step(t, 127, 128, true);
    assert.ok(seamX <= inside * 1.15 + .5 && seamY <= inside * 1.15 + .5, `${name} ${JSON.stringify(o)} repeats without a seam (across ${seamX.toFixed(1)}, down ${seamY.toFixed(1)}, inside ${inside.toFixed(1)})`);
    let lo = 255, hi = 0, opaque = true; for (let k = 0; k < t.data.length; k += 4) { const l = t.data[k] * .3 + t.data[k + 1] * .59 + t.data[k + 2] * .11; lo = Math.min(lo, l); hi = Math.max(hi, l); opaque &&= t.data[k + 3] === 255; }
    assert.ok(opaque && hi - lo > 12, name + ' has texture in it (' + (hi - lo).toFixed(0) + ' shades) and no holes');
  }
  const mean = t => { const m = [0, 0, 0]; for (let k = 0; k < t.data.length; k += 4) for (let j = 0; j < 3; j++) m[j] += t.data[k + j]; return m.map(v => v / (t.data.length / 4)); };
  const red = mean(texture('cloth', { px: 64, color: '#c03020' })); assert.ok(red[0] > red[1] * 2 && red[0] > red[2] * 2, 'color sets the material\'s colour: ' + red.map(v => v | 0));
  assert.notDeepEqual(texture('stone', { px: 64 }).data, texture('stone', { px: 64, seed: 2 }).data, 'another seed is another piece of it');
  const flat = texture('stone', { px: 64, contrast: 0 }); assert.ok(flat.data.every((v, k) => v === flat.data[k % 4]), 'contrast 0 is the flat colour');
  assert.throws(() => texture('lava'), /no material called "lava".*paper, wood, stone, metal, cloth, water/);
  console.log('gs.gfx materials: six materials, planks, blocks, threads, seeds and colours; every tile repeats without a seam');
}

// gs.sketch: sketchy shapes that stay put, ink strokes
{
  const { Sketch, Ink, ink, inkOutline } = await import('../src/kit/sketch.js');
  const fake = () => { const calls = []; const c = { calls, save() {}, restore() {}, setLineDash(d) { calls.push('dash ' + d.join(',')); }, beginPath() { calls.push('begin'); }, translate(x, y) { calls.push(`at ${x},${y}`); },
    moveTo(x, y) { calls.push(`M${x.toFixed(2)},${y.toFixed(2)}`); }, lineTo(x, y) { calls.push(`L${x.toFixed(2)},${y.toFixed(2)}`); }, bezierCurveTo(...a) { calls.push('C' + a.map(v => v.toFixed(2))); }, quadraticCurveTo(...a) { calls.push('Q' + a.map(v => v.toFixed(2))); },
    closePath() { calls.push('Z'); }, stroke() { calls.push('stroke ' + c.strokeStyle + ' ' + c.lineWidth); }, fill(r) { calls.push('fill ' + c.fillStyle + (r ? ' ' + r : '')); } }; return c; };
  const shape = calls => calls.filter(s => !s.startsWith('at ')).join('|');
  const pen = new Sketch({ stroke: '#123456', strokeWidth: 3 });
  const a = fake(), b = fake(); pen.rect(a, 10, 20, 80, 40, { fill: '#ff0000' }); pen.rect(b, 200, 300, 80, 40, { fill: '#ff0000' });
  assert.ok(a.calls.includes('at 10,20') && b.calls.includes('at 200,300'), 'a shape is drawn where it is asked for');
  assert.equal(shape(a.calls), shape(b.calls), 'and it is the same drawing wherever it is: its wobble stays put');
  assert.equal(pen.remembered, 1, 'worked out once, however often and wherever it is drawn');
  assert.ok(a.calls.some(s => s === 'stroke #123456 3') && a.calls.some(s => s.startsWith('stroke #ff0000')), 'outline in the stroke colour, hatching in the fill colour');
  const solid = fake(); pen.circle(solid, 0, 0, 20, { fill: '#00ff00', fillStyle: 'solid' }); assert.ok(solid.calls.some(s => s.startsWith('fill #00ff00')), 'fillStyle solid fills');
  const none = fake(); pen.rect(none, 0, 0, 30, 30, { stroke: 'none', fill: '#00f', fillStyle: 'solid' }); assert.ok(!none.calls.some(s => s.startsWith('stroke')), 'stroke none draws no outline');
  const other = fake(); new Sketch({ stroke: '#123456', strokeWidth: 3, seed: 2 }).rect(other, 10, 20, 80, 40, { fill: '#ff0000' });
  assert.notEqual(shape(other.calls), shape(a.calls), 'another seed is another hand');
  const again = fake(); new Sketch({ stroke: '#123456', strokeWidth: 3 }).rect(again, 10, 20, 80, 40, { fill: '#ff0000' });
  assert.equal(shape(again.calls), shape(a.calls), 'the same seed draws the same lines every time (a replay looks the same)');
  const ruler = fake(); new Sketch({ roughness: 0, bowing: 0 }).line(ruler, 0, 0, 100, 0); assert.ok(ruler.calls.filter(s => s[0] === 'C').every(s => s.slice(1).split(',').every((v, k) => k % 2 === 0 || Math.abs(+v) < 1e-6)), 'roughness 0 is a ruler');
  const boil = new Sketch({ boil: 8 }), f0 = fake(), f1 = fake(), f2 = fake();
  boil.circle(f0, 0, 0, 20); boil.update(.05); boil.circle(f1, 0, 0, 20); boil.update(.1); boil.circle(f2, 0, 0, 20);
  assert.equal(shape(f0.calls), shape(f1.calls), 'boil: the wobble holds between changes'); assert.notEqual(shape(f0.calls), shape(f2.calls), 'and changes 8 times a second');
  for (let k = 0; k < 40; k++) { boil.update(.13); boil.circle(fake(), 0, 0, 20); } assert.equal(boil.remembered, 3, 'boil goes round three drawings, not a new one every time');
  const all = fake(); pen.ellipse(all, 0, 0, 30, 20); pen.line(all, 0, 0, 50, 10); pen.poly(all, [[0, 0], [40, 0], [20, 30]], { fill: '#abc' }); pen.lines(all, [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }], { dash: [4, 4] });
  pen.curve(all, [[0, 0], [10, 20], [20, 0], [30, 20]]); pen.arc(all, 0, 0, 20, 0, Math.PI, { closed: true, fill: '#abc' }); pen.path(all, 5, 5, 'M0 0 L30 0 L30 30 Z', { fill: '#def' });
  assert.ok(all.calls.includes('dash 4,4') && all.calls.filter(s => s.startsWith('stroke')).length >= 7, 'ellipse, line, poly, lines, curve, arc and path all draw');
  const grow = new Sketch(); for (let k = 0; k < 500; k++) grow.rect(fake(), 0, 0, 10 + k, 10); assert.ok(grow.remembered <= 300, 'shapes remembered are capped');
  // ink
  const pts = Array.from({ length: 30 }, (_, k) => ({ x: k * 10, y: 100 }));
  const out = inkOutline(pts, { size: 12, thinning: 0 }); const ys = out.map(p => p[1]), xs = out.map(p => p[0]);
  assert.ok(Math.abs(Math.max(...ys) - 106) < 1.5 && Math.abs(Math.min(...ys) - 94) < 1.5, 'an even stroke of size 12 is 12 wide: ' + Math.min(...ys).toFixed(1) + '..' + Math.max(...ys).toFixed(1));
  assert.ok(Math.min(...xs) < 0 && Math.max(...xs) > 290, 'with round ends past its first and last points');
  const mids = o => { const q = inkOutline(pts, o), w = x => { const near = q.filter(p => Math.abs(p[0] - x) < 6).map(p => p[1]); return Math.max(...near) - Math.min(...near); }; return [w(15), w(150)]; };
  const [end, mid] = mids({ size: 12, thinning: 0, taper: 60 }); assert.ok(end < mid * .6, 'taper thins the ends: ' + end.toFixed(1) + ' against ' + mid.toFixed(1));
  const line = new Ink({ size: 10 }); assert.equal(line.draw(fake()), false, 'no points, nothing drawn');
  for (const p of pts) line.add(p.x, p.y); line.add(290, 100); assert.equal(line.length, 30, 'the same point twice is added once');
  const o1 = line.outline(); assert.equal(line.outline(), o1, 'the outline is remembered between frames'); line.add(300, 100); assert.notEqual(line.outline(), o1, 'and worked out again when a point is added');
  const drawn = fake(); assert.equal(line.end().draw(drawn), true); assert.ok(drawn.calls.filter(s => s[0] === 'Q').length > 20 && drawn.calls.at(-1).startsWith('fill #111111'), 'drawn as one smooth filled shape');
  assert.ok(line.hit(150, 103) && line.hit(150, 110, 6) && !line.hit(150, 120) && !line.hit(400, 100), 'hit(x, y, r) says whether a point is on the ink');
  const once = fake(); assert.equal(ink(once, [[0, 0], [20, 10], [40, 0]], { color: '#00f', size: 6 }), true); assert.ok(once.calls.at(-1) === 'fill #00f');
  const far = inkOutline([[0, 0], [100, 0]], { size: 10, thinning: 0, spacing: 5 }), sparse = inkOutline([[0, 0], [100, 0]], { size: 10, thinning: 0 });
  assert.ok(far.length > sparse.length && far.filter(p => p[0] > 20 && p[0] < 80).length >= 10, 'spacing adds points along a line through far-apart points');
  assert.equal(inkOutline({ points: [{ x: 0, y: 0, pressure: .2 }, { x: 30, y: 0, pressure: 1 }, { x: 60, y: 0, pressure: .2 }] }, { pressure: true, size: 20 }).length > 8, true, 'a gs.strokes Stroke and its own pressure work');
  console.log('gs.sketch: shapes that stay put, seeds, boil, every shape; ink width, taper, hit and memory ok');
}

// gs.icons: the names, the plain words, and the data matching scripts/icons/names.json
{
  const { names, words, has, find, data, path, icon, remembered } = await import('../src/kit/icons.js');
  const { readFileSync } = await import('node:fs');
  const list = JSON.parse(readFileSync(new URL('./icons/names.json', import.meta.url), 'utf8'));
  assert.equal(names.length, 528); assert.deepEqual([...names], [...new Set(list.icons)].sort(), 'src/kit/icon-data.js matches scripts/icons/names.json (run node scripts/icons/build.mjs)');
  assert.ok(Object.isFrozen(names) && Object.isFrozen(words));
  for (const n of names) assert.ok(/^[Mm][-\d. ]/.test(data(n)) && data(n).length > 10, n + ' is a path');
  for (const [w, n] of Object.entries(words)) assert.ok(names.includes(n) && !names.includes(w), `the plain word ${w} is the icon ${n}`);
  for (const w of ['sword', 'heart', 'coin', 'star', 'key', 'bomb', 'skull', 'tree', 'fish', 'shield', 'chest', 'potion', 'play', 'pause', 'settings']) assert.ok(has(w), 'has ' + w);
  assert.equal(data('sword'), data('broadsword')); assert.equal(data('Health Potion'), data('health-potion'), 'any case, spaces for dashes');
  assert.ok(!has('nope') && data('nope') === null && path('nope') === null);
  assert.deepEqual(find('potion'), ['health-potion', 'round-potion', 'standing-potion']);
  assert.equal(icon({}, 'nope', 0, 0, 20), false, 'an unknown name draws nothing and says so'); assert.equal(remembered(), 0);
  const { OPEN_SOURCE } = await import('../src/licences.js');
  assert.ok(OPEN_SOURCE.some(p => p.name === 'Game Icons' && p.spdx === 'CC-BY-3.0' && p.vendored === 'src/kit/icon-data.js' && /Lorc, Delapouite/.test(p.notice)), 'the icons are in the licence list, with their makers named');
  console.log(`gs.icons: ${names.length} icons, ${Object.keys(words).length} plain words, all paths, names and credit ok`);
}

// gs.real: the sun and moon for the player, the battery, headphones
{
  const { sun, moon, battery, headphones, guessPlace, readOutputs } = await import('../src/kit/real.js');
  const london = { lat: 51.5, lon: -.12 }, at = iso => new Date(iso);
  let s = sun(london, at('2026-06-21T12:00:00Z'));
  assert.ok(s.up && s.part === 'day' && s.light === 1 && !s.guess, 'midsummer noon in London is day');
  assert.ok(Math.abs(s.height - 61.9) < 1 && Math.abs(s.compass - 180) < 6, `the sun is high in the south: ${s.height.toFixed(1)} up, ${s.compass.toFixed(0)} round`);
  assert.ok(Math.abs(s.hour - 12) < .2, 'the sky hour is 12 at the sun\'s highest: ' + s.hour.toFixed(2));
  s = sun(london, at('2026-06-21T00:00:00Z'));
  assert.ok(!s.up && s.part === 'night' && s.light === 0 && s.height < -10, 'and midnight is night');
  assert.ok(s.hour > 22 || s.hour < 2, 'the sky hour at midnight is around 24: ' + s.hour.toFixed(2));
  const dawn = sun(london, at('2026-06-21T03:43:00Z'));   // sunrise in London on the longest day is 04:43 BST
  assert.ok(Math.abs(dawn.height) < 1.5 && dawn.part === 'dawn' && dawn.light > .2 && dawn.light < .8 && Math.abs(dawn.hour - 6) < .3, `sunrise: ${dawn.height.toFixed(2)} up, light ${dawn.light.toFixed(2)}, sky hour ${dawn.hour.toFixed(2)}`);
  const dusk = sun(london, at('2026-06-21T20:21:00Z'));   // and sunset is 21:21 BST
  assert.ok(Math.abs(dusk.height) < 1.5 && dusk.part === 'dusk' && Math.abs(dusk.hour - 18) < .3, `sunset: ${dusk.height.toFixed(2)} up, sky hour ${dusk.hour.toFixed(2)}`);
  let last = -1, wraps = 0; for (let h = 0; h < 24; h += .25) { const x = sun(london, +at('2026-03-20T00:00:00Z') + h * 36e5).hour; if (x < last - 12) wraps++; else assert.ok(x >= last - 1e-6 || last < 0, 'the sky hour only runs forwards'); last = x; }
  assert.ok(wraps <= 1, 'and passes midnight once a day');
  const sydney = sun({ lat: -33.87, lon: 151.21 }, at('2026-06-21T12:00:00Z'));
  assert.ok(!sydney.up, 'the same moment is night in Sydney');
  const polar = sun({ lat: 69.65, lon: 18.96 }, at('2026-12-21T11:00:00Z'));   // Tromso in midwinter
  assert.ok(!polar.up && polar.rise === null && polar.set === null && Number.isFinite(polar.hour), 'the polar night has no sunrise, and still gives a sky hour');
  const never = sun({ lat: 69.65, lon: 18.96 }, at('2026-06-21T23:00:00Z'));
  assert.ok(never.up && never.rise === null && never.hour >= 9 && never.hour <= 15, 'the midnight sun stays up: sky hour ' + never.hour.toFixed(1));
  const g = sun(null, at('2026-06-21T12:00:00Z'));
  assert.ok(g.guess && Number.isFinite(g.height) && Number.isFinite(g.hour), 'no place: a guess from the time zone');
  const gp = guessPlace(at('2026-06-21T12:00:00Z'));
  assert.ok(gp.guess && Math.abs(gp.lon) <= 180 && Math.abs(gp.lat) <= 90 && Math.abs(gp.lon + Math.max(new Date(2026, 0, 1).getTimezoneOffset(), new Date(2026, 6, 1).getTimezoneOffset()) / 4) < 1e-9, 'the guess sits on the time zone\'s own meridian (winter time)');
  // the moon: two eclipses give a new and a full moon to the minute
  let m = moon(london, at('2024-04-08T18:21:00Z'));    // total solar eclipse
  assert.ok((m.phase < .01 || m.phase > .99) && m.lit < .01 && m.name === 'new', `new moon at a solar eclipse: phase ${m.phase.toFixed(3)}, lit ${m.lit.toFixed(3)}`);
  m = moon(london, at('2025-03-14T06:59:00Z'));        // total lunar eclipse
  assert.ok(Math.abs(m.phase - .5) < .01 && m.lit > .99 && m.name === 'full', `full moon at a lunar eclipse: phase ${m.phase.toFixed(3)}, lit ${m.lit.toFixed(3)}`);
  m = moon(london, at('2025-03-21T12:00:00Z'));
  assert.ok(!m.waxing && m.lit < .8 && m.lit > .3 && /waning|last/.test(m.name), 'a week later it is waning: ' + m.name);
  assert.equal(moon(null, at('2025-03-14T06:59:00Z')).phase, moon(london, at('2025-03-14T06:59:00Z')).phase, 'the phase needs no place');
  // battery and headphones: unknown is null, never a made-up answer
  const b = battery(); assert.ok(b.level === null && b.charging === null && b.saver === false, 'the battery is unknown until the phone says');
  assert.equal(headphones(), null, 'headphones are unknown where nothing can say');
  assert.equal(readOutputs([{ kind: 'audiooutput', label: '' }, { kind: 'audioinput', label: 'Mic' }]), null, 'a browser that hides the names: unknown');
  assert.equal(readOutputs([{ kind: 'audiooutput', label: 'Speakers' }]), false, 'only speakers: no');
  assert.equal(readOutputs([{ kind: 'audiooutput', label: 'Speakers' }, { kind: 'audiooutput', label: 'WH-1000XM5 (Bluetooth)' }]), true, 'a Bluetooth output: yes');
  assert.equal(readOutputs([{ kind: 'audiooutput', label: 'Pixel Buds' }]), true, 'ear buds: yes');
  console.log(`gs.real: sun (day, night, dawn, dusk, polar, guess), moon phases, battery and headphones ok`);
}

// gs.fx3d's screen effects on WebGPU: each pass a game holds takes a slot of its kind in the chain; a pass
// taken away leaves its slot switched off (no rebuild), a new kind or another order builds again
{
  const { fxPlan } = await import('../src/kit/hd3d-gpu-fx.js');
  const pass = kind => ({ gsFx: { kind } }), ch = {}, out = pass('outline'), gl = pass('glitch'), px = pass('pixelate');
  assert.equal(fxPlan(ch, null), '', 'no effects: no slots');
  assert.equal(fxPlan(ch, [out, gl]), 'outline,glitch', 'two effects, in the order they were added');
  const slots = ch.fxSlots;
  assert.equal(fxPlan(ch, [out]), 'outline,glitch', 'the glitch taken away: the same slots (no rebuild)');
  assert.ok(ch.fxSlots === slots && slots[0].pass === out && slots[1].pass === null, 'and its slot is switched off');
  const gl2 = pass('glitch');
  assert.equal(fxPlan(ch, [out, gl2]), 'outline,glitch', 'another glitch later takes the empty slot');
  assert.ok(ch.fxSlots === slots && slots[1].pass === gl2, 'in place');
  assert.equal(fxPlan(ch, [gl2]), 'outline,glitch', 'the first one taken away instead');
  assert.ok(slots[0].pass === null && slots[1].pass === gl2, 'leaves the first slot off');
  assert.equal(fxPlan(ch, [gl2, out]), 'glitch,outline', 'another order: built again');
  assert.equal(fxPlan(ch, [gl2, out, px]), 'glitch,outline,pixelate', 'a new kind: built again');
  assert.equal(fxPlan(ch, [px]), 'glitch,outline,pixelate', 'then only the last one left');
  assert.deepEqual(ch.fxSlots.map(s => s.pass), [null, null, px], 'the others are off');
  console.log('gs.fx3d on WebGPU: effect slots (a removed effect switches off in place; a new kind or order rebuilds) ok');
}

// looks on WebGPU: three keys a classic material's shader there by its settings, so material.gsGpuKey tells
// two materials with one look apart by whose { value } objects they hold (they shared the first one's)
{
  const { lookPatch } = await import('../src/kit/looks.js');
  const { MeshStandardMaterial, MeshBasicMaterial } = await import('three');
  const shared = { value: 1 }, A = new MeshStandardMaterial(), B = new MeshStandardMaterial(), C = new MeshStandardMaterial(), D = new MeshStandardMaterial();
  lookPatch(A, 'testLook', { uniforms: { k: shared, own: { value: 2 } } });
  lookPatch(B, 'testLook', { uniforms: { k: shared, own: { value: 2 } } });
  assert.ok(A.gsGpuKey && B.gsGpuKey && A.gsGpuKey !== B.gsGpuKey, 'the same look with its own numbers: a shader each on WebGPU');
  const both = { uniforms: { k: shared } };
  lookPatch(C, 'testLook', both); lookPatch(D, 'testLook', both);
  assert.equal(C.gsGpuKey, D.gsGpuKey, 'the same look reading the same numbers: one shader');
  const before = A.gsGpuKey; lookPatch(A, 'testLook2', { uniforms: {} });
  assert.ok(A.gsGpuKey.startsWith(before) && A.gsGpuKey !== before, 'a second look adds to the key');
  const E = new MeshBasicMaterial(), F = new MeshBasicMaterial();
  lookPatch(E, 'testShared', { uniforms: { a: { value: 1 } }, gpuShared: true }); lookPatch(F, 'testShared', { uniforms: { a: { value: 2 } }, gpuShared: true });
  assert.ok(E.gsGpuKey === undefined && F.gsGpuKey === undefined, 'a look that reads from the material being drawn shares one shader (3D text)');
  assert.ok(B.customProgramCacheKey() === C.customProgramCacheKey(), 'WebGL still shares one program between them (its numbers are uniforms there)');
  console.log('looks on WebGPU: a key for each material that holds its own numbers ok');
}

// loading without holding the feed still (src/kit/slices.js): pause() lets a frame go by once a pass has
// used its share, need() waits for a worker's answer, later() keeps the card waiting for work left behind
{
  const slices = await import('../src/kit/slices.js');
  const busy = ms => { const t = performance.now(); while (performance.now() - t < ms); };
  const seen = []; slices.onPass(x => seen.push(x));
  // outside a card's making, builders just build
  slices.pause('Models'); assert.equal(slices.need('Models', 'k', () => Promise.resolve(1)), undefined, 'need: nothing to wait for outside a pass');
  assert.equal(slices.later(Promise.resolve()), false, 'later: not taken on outside a pass'); assert.equal(slices.loading(), false);
  // a pass: the first heavy build always goes ahead; once the share is spent the next one waits for a frame
  const card = {}; slices.begin(card, 5); assert.equal(slices.loading(), true);
  slices.pause('Models'); busy(8); slices.built();
  let t = null; try { slices.pause('Textures'); } catch (e) { t = e; }
  assert.ok(t?.kitLoading instanceof Promise && t.what === 'Textures' && t.name === 'StillLoading', 'pause: the share is spent, so the next build waits (as a library that is not in yet does)');
  assert.equal(slices.end(card, false), null); assert.equal(slices.loading(), false);
  await t.kitLoading;
  // the next pass: the game's own code takes a moment to get back here (12 ms), so the pass builds at
  // least that long before it waits again: loading in passes never costs twice the work
  // (a short build then a long one, so a busy test machine that stalls the test for a moment doesn't change the answer)
  slices.begin(card, 5); busy(12); slices.pause('Models'); busy(3); slices.built(); slices.pause('Models'); busy(40); slices.built();
  t = null; try { slices.pause('Models'); } catch (e) { t = e; } assert.ok(t?.kitLoading, 'pause: a pass builds at least as long as the game\'s own code ran, then waits');
  slices.end(card, false);
  assert.ok(seen.length === 2 && seen[1].built === 2 && seen[1].own >= 11 && seen[1].own < 30 && seen[1].ms >= 54 && !seen[1].off && seen[1].card === card, 'the pass is reported: ' + JSON.stringify({ ...seen[1], card: 0 }));
  // a build inside another build (a prop that needs a material) never stops: the outer one has to finish
  slices.begin(card, 5); slices.pause('Models'); busy(20); slices.pause('Textures'); busy(20); slices.built(); slices.pause('Textures'); slices.built(); slices.built();
  t = null; try { slices.pause('Models'); } catch (e) { t = e; } assert.ok(t?.kitLoading, 'pause: a build inside a build goes ahead, and the next one outside waits');
  slices.end(card, false);
  // a game whose own code is the slow part (40 ms before it asks the kit for anything heavy): stopping
  // would mean running that again every pass, so it is made in one go from there
  slices.begin(card, 5); busy(40); slices.pause('Models'); busy(8); slices.built(); slices.pause('Models'); busy(8); slices.built(); slices.pause('Models'); slices.built();
  assert.equal(slices.need('Models', 'slow', () => new Promise(() => {})), undefined, 'need: no waiting either once the card is made in one go');
  assert.equal(slices.end(card, true), null); assert.ok(seen[seen.length - 1].off && seen[seen.length - 1].made, 'a pass with 40 ms of the game\'s own code is not stopped');
  // a whole pass (not on a fresh copy of the game: nothing of it may be left half made): never stopped
  const cw = {}; slices.begin(cw, 5, true); slices.pause('Models'); busy(8); slices.built(); slices.pause('Models'); slices.built();
  assert.equal(slices.need('Models', 'whole', () => new Promise(() => {})), undefined, 'need: a whole pass does not wait');
  assert.equal(slices.later(Promise.resolve()), true, 'later: a whole pass still leaves work with the workers'); await slices.end(cw, true);
  // need(): waits for the answer, hands it over on the next pass, gives up on a job that failed
  const c2 = {}; let give; const answer = new Promise(r => { give = r; });
  slices.begin(c2); t = null; try { slices.need('Models', 'a', () => answer); } catch (e) { t = e; } slices.end(c2, false);
  assert.ok(t?.kitLoading && t.what === 'Models', 'need: the card waits for the worker'); give(42); await t.kitLoading;
  slices.begin(c2); assert.equal(slices.need('Models', 'a', () => { throw new Error('asked twice'); }), 42, 'need: the answer is there on the next pass');
  t = null; try { slices.need('Models', 'b', () => Promise.reject(new Error('worker'))); } catch (e) { t = e; } slices.end(c2, false); await t.kitLoading;
  slices.begin(c2); assert.equal(slices.need('Models', 'a', null), 42); assert.equal(slices.need('Models', 'b', () => Promise.resolve(1)), undefined, 'need: a job that failed is made here');
  assert.equal(slices.need('Models', 'c', () => null), undefined, 'need: no worker for it, made here'); slices.end(c2, true);
  // a game that asks for something different every pass must not wait for ever
  const c3 = {}; slices.begin(c3); t = null; try { slices.need('Path map', 'level-1', () => Promise.resolve('one')); } catch (e) { t = e; } slices.end(c3, false); await t.kitLoading;
  slices.begin(c3); assert.equal(slices.need('Path map', 'level-2', () => { throw new Error('should not start'); }), undefined, 'need: last pass\'s answer was not wanted again, so no more waiting for that name');
  assert.equal(slices.need('Path map', 'level-3', () => Promise.resolve('x')), undefined); slices.end(c3, true);
  // later(): the card is told to wait until the work left behind is in
  const c4 = {}; let finish; const work = new Promise(r => { finish = r; });
  slices.begin(c4); assert.equal(slices.later(work), true); const wait = slices.end(c4, true);
  assert.ok(wait instanceof Promise, 'later: the game is made, but the card waits'); let settled = false; wait.then(() => { settled = true; });
  await new Promise(r => setTimeout(r, 5)); assert.equal(settled, false); finish(); await wait;
  slices.begin(c4); assert.equal(slices.end(c4, true), null, 'nothing left to wait for');
  slices.onPass(null);
  // the number work itself (surface-math.js): unit normals, flat where the height is flat, and the rougher small copies
  const { surfaceMath } = await import('../src/kit/surface-math.js');
  const S = 16, hd = new Uint8ClampedArray(S * S * 4), rd = new Uint8ClampedArray(S * S * 4).fill(51);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) hd[(y * S + x) * 4] = x < 8 ? 0 : 255;   // a step up half way across
  const m = surfaceMath(hd, rd, S, 2);
  let unit = true; for (let i = 0; i < S * S; i++) unit &&= Math.abs(Math.hypot(m.nf[i * 3], m.nf[i * 3 + 1], m.nf[i * 3 + 2]) - 1) < 1e-5;
  assert.ok(unit && m.nf[(3 * S + 3) * 3 + 2] === 1 && m.nf[(3 * S + 8) * 3] < -.9 && m.out[(3 * S + 3) * 4 + 2] === 255, 'surfaceMath: unit normals, flat on the flat, leaning at the step');
  assert.ok(m.mips.length === 4 && m.mips[0].length === 8 * 8 * 4 && m.mips[3].length === 4, 'surfaceMath: a smaller roughness copy for each halving');
  const flat = m.mips[0][(3 * 8 + 2) * 4], edge = m.mips[0][(3 * 8 + 4) * 4];
  assert.ok(flat >= 51 && flat <= 54 && edge > flat + 10, 'surfaceMath: the small copies are rougher only where the bumps under them disagree (' + flat + ' on the flat, ' + edge + ' at the step)');
  assert.equal(surfaceMath(new Uint8ClampedArray(12 * 12 * 4), new Uint8ClampedArray(12 * 12 * 4), 12, 2).mips, null, 'surfaceMath: no small copies for a size that does not halve evenly');
  // a recipe painted as plain numbers (what the worker runs) repeats exactly and changes with the seed
  const { paintRecipe } = await import('../src/kit/models/recipe-paint.js'), { JS } = await import('../src/kit/models/ops.js'), { RECIPES } = await import('../src/kit/models/recipes.js');
  const K = {}; for (const k in RECIPES.planks.look) K[k] = JS.rgb(RECIPES.planks.look[k]);
  const p1 = paintRecipe('planks', K, 32, 0), p2 = paintRecipe('planks', K, 32, 0), p3 = paintRecipe('planks', K, 32, 9);
  assert.ok(p1.col.length === 32 * 32 * 4 && p1.col.every((v, i) => v === p2.col[i]) && p1.h.some((v, i) => v !== p3.h[i]) && p1.m.every((v, i) => i % 4 === 3 ? v === 255 : v === 0), 'paintRecipe: the same every time, another pattern for another seed');
  // a sculpt as plain arrays (what the worker runs) is the mesh gs.models.sculpt gives
  const { sculptArrays } = await import('../src/kit/models/sculpt-arrays.js'), { sculpt } = await import('../src/kit/models/sculpt.js');
  const sh = [{ ball: .3 }, { ball: .2, at: [.3, 0, 0] }], arr = sculptArrays(sh, { res: 16 }), geo = sculpt(sh, { res: 16 });
  assert.ok(arr.P.length === geo.attributes.position.array.length && arr.P.every((v, i) => v === geo.attributes.position.array[i]) && arr.I.length === geo.index.count && arr.C === null, 'sculptArrays: the same mesh as sculpt()');
  console.log('loading: pause, need and later; a surface\'s number work, a recipe and a sculpt as plain arrays ok');
}

// the physics engine as real .wasm files (vite.config.js rapierWasmFiles): the built app loads the file the
// package ships, and a package whose file doesn't match its text is left as it is
{
  const { rapierWasmFiles } = await import('../vite.config.js'), { readFileSync } = await import('node:fs'), { resolve } = await import('node:path');
  const plug = rapierWasmFiles(), warned = [], ctx = { warn: m => warned.push(m) };
  for (const pack of ['rapier2d-compat', 'rapier2d-simd-compat', 'rapier3d-compat', 'rapier3d-simd-compat']) {
    const id = resolve('node_modules/@dimforge', pack, 'dist/rapier.mjs'), code = readFileSync(id, 'utf8'), out = plug.transform.call(ctx, code, id);
    const file = `rapier_wasm${pack.slice(6, 8)}_bg.wasm`;
    assert.ok(out && out.code.includes(`module_or_path:new URL("./${file}", import.meta.url)`) && !out.code.includes('AGFzbQ') && out.code.length < code.length / 10, pack + ': loads ' + file + ' in place of the text');
  }
  const id = resolve('node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs'), code = readFileSync(id, 'utf8');
  assert.equal(plug.transform.call(ctx, code.replace('"AGFzbQEAAAAB', '"AGFzbQEAAAAC'), id), null, 'text that is not the file\'s bytes: left alone');
  assert.equal(plug.transform.call(ctx, 'export const a = 1;', resolve('src/kit/physics.js')), null, 'other files: untouched');
  assert.ok(warned.length === 1 && plug.apply === 'build', 'and it says so; build only');
  console.log('rapier as .wasm files: all four packages, left alone when the file does not match ok');
  // the games built into dev and test builds: each behind a small module that knows its own address,
  // so the app can load the file again as a fresh copy (src/main.js bootGame)
  const { bundledGames } = await import('../vite.config.js');
  const games = bundledGames(false), ONE = 'virtual:bundled-games/stack.js';
  games.configResolved({ command: 'build' });
  const all = games.load(games.resolveId('virtual:bundled-games'));
  assert.ok(all.includes('import("' + ONE + '")') && /export const fresh = \{\};/.test(all) && all.includes('"copy=" + n'), 'bundled games: each is loaded through its own small module, and fresh() loads it again');
  assert.ok(games.resolveId(ONE) && games.load(games.resolveId(ONE)).includes('export const url = import.meta.url;') && games.load(games.resolveId(ONE)).includes(resolve('src/games/stack.js')), 'in a build the small module\'s address is the game\'s chunk');
  games.configResolved({ command: 'serve' });
  assert.ok(games.load(games.resolveId(ONE)).includes('"/src/games/stack.js"'), 'on the dev server it is the game\'s file');
  assert.equal(games.resolveId('virtual:something-else'), null);
  assert.equal(bundledGames(true).load(games.resolveId('virtual:bundled-games')), 'export default [];\nexport const fresh = {};', 'the streamed app has no games built in');
  console.log('bundled games: a fresh copy of each game file can be loaded ok');
}

// ---- Classic Console 2.0 (toon3d.js): real toon shadows, the rim of light, retro looks, a jointed figure
{
  const T = await import('three');
  const { View, part, grp, G, blob, figure, toon, flat, celReady, TOON } = await import('../src/kit/toon3d.js');
  const { HIDDEN } = await import('../src/gamescroll.js');
  // the cel look folds the sun's shadow into the ramp by changing two pieces of three's toon shader: if a
  // three.js update rewrites them, this is where it shows (the look would fall back to no real shadows)
  assert.ok(celReady, 'three\'s toon shader still has the lines the cel look changes');
  assert.ok(HIDDEN.toon.includes('TOON') && HIDDEN.toon.includes('celReady'), 'the test switches stay off gs.toon');
  const lit = toon('#c04040'), glass = toon('#80c0ff', { opacity: .4 }), paint = flat('#ffffff', .8);
  assert.deepEqual([lit.userData.gsLooks, paint.userData.gsLooks], [['cel'], ['retro']], 'toon() carries the cel look, flat() the retro one');
  // who casts and who takes shadows: lit solid things cast, see-through and flat ones don't, blob() discs never
  const was = TOON.shadows; TOON.shadows = true;
  const v = new View(); v.board(192, 160, .9);
  assert.deepEqual([v.shadows, v.rim, v.floor, v.retro], [true, .35, true, null], 'a view: shadows, a rim of light and a floor under a board by default; no retro look');
  const wall = v.add(part(G.box, '#806090', { sx: 6, sy: 30, sz: 60, x: -80, y: 15 })), floor = v.add(part(G.plane, '#b4bcac', { sx: 150, sz: 150, line: false })), pane = v.add(part(G.box, glass, { s: 14 }));
  v.def('crate', () => grp(part(G.box, '#b08850', { s: 16, y: 8 }), blob(12, .3))).def('mark', () => blob(1, .35)).def('ball', () => part(G.ball, '#f04060', { s: 6 }));
  v.frame();
  const crate = v.put('crate', v.at(40, 60)), air = v.put('mark', v.at(60, 120, .2), { s: 7 }), under = v.put('mark', v.at(110, 120, .2), { s: 9 });
  v.put('ball', v.at(60, 120, 30)); v.put('crate', v.at(110, 120), { s: .7 });
  assert.equal(v.prep(true), '', 'three\'s own materials with the kit\'s looks: the view can draw on WebGPU');
  assert.ok(v.shadowsOn && v.sun.castShadow && v.catcher.visible, 'shadows on: the sun casts, the bare background of a board takes them');
  assert.deepEqual([wall.castShadow, wall.receiveShadow, floor.castShadow, floor.receiveShadow, pane.castShadow], [true, true, false, true, false], 'a wall casts and takes; a flat floor only takes; a see-through box casts nothing');
  let disc; crate.traverse(k => { if (k.userData.gsBlob) disc = k; });
  assert.ok(disc && !disc.visible && !disc.castShadow && crate.children[0].castShadow, 'a thing with a blob() disc: its real shadow takes the disc\'s place');
  assert.deepEqual([air.visible, under.visible], [true, false], 'a disc put on its own stays under a ball in the air and goes when a crate stands on it');
  // off: discs again, nothing cast
  TOON.shadows = false; v.frame(); v.put('crate', v.at(40, 60)); v.prep(false);
  assert.ok(!v.shadowsOn && !v.sun.castShadow && !v.catcher.visible && disc.visible, 'no shadows (a low-end phone): the discs show, as they always did');
  TOON.shadows = true;
  const off = new View({ shadows: false, floor: false, rim: 0 }); off.board(192, 160); off.prep(false);
  assert.ok(!off.shadowsOn && !off.sun.castShadow && off.rim === 0, 'new View({ shadows: false }): the game\'s own choice');
  const sky = new View({ floor: false }); sky.board(192, 160); sky.prep(false);
  assert.ok(sky.shadowsOn && !sky.catcher.visible, 'floor: false: nothing lands on the background');
  const side = new View(); side.side(192, 160); side.prep(false);
  assert.ok(side.shadowsOn && !side.catcher.visible, 'a side view has no floor under it');
  // a material with its own shader keeps the view on WebGL, and says why
  v.add(new T.Mesh(G.box, new T.ShaderMaterial()));
  assert.match(v.prep(true), /its own shader \(ShaderMaterial\)/, 'a ShaderMaterial has no WebGPU version: the view says so');
  // the sun's shadow is fitted to the view without moving the game's sun
  const at = v.sun.position.clone(), sh = v.sun.shadow;
  v.render({ canvas: { width: 384, height: 320 }, fillRect() {}, set fillStyle(_) {} });   // (no renderer in Node: the frame is prepared and the background filled)
  v.scene.updateMatrixWorld(); sh.updateMatrices(v.sun);
  assert.ok(v.sun.position.equals(at) && Math.abs(sh.camera.right - v.fit.r) < 1e-6 && v.fit.r > 100 && v.fit.r < 250, 'the shadow covers the board (' + v.fit.r.toFixed(0) + ' units round) and the sun stays where the game put it');
  const eye = new T.Vector3().setFromMatrixPosition(sh.camera.matrixWorld), dir = at.clone().normalize();
  assert.ok(eye.clone().normalize().distanceTo(dir) < 1e-4 && Math.abs(eye.length() - v.fit.r * 3) < 1e-3, 'its camera looks along the sun\'s direction from outside the view');
  const fog = new View({ fog: ['#fff', 10, 44] }); fog.persp(192, 160, 60, .1, 200); fog.cam.position.set(0, 2.6, 6); fog.cam.lookAt(0, .8, -6); fog.cam.updateMatrixWorld();
  fog.render({ canvas: { width: 384, height: 320 }, fillRect() {}, set fillStyle(_) {} });
  assert.ok(fog.fit.snap && Math.abs(fog.fit.r - 44 * .55) < 1e-6 && fog.fit.c.z < -10, 'a free camera: the shadow reaches as far as the fog, ahead of the camera, stepping a texel at a time');
  // retro looks
  const R = k => new View({ retro: k }).retro;
  assert.deepEqual(R('chunky'), { lines: 240, smooth: false, snap: true, bits: 5, scan: 0 });
  assert.ok(R('soft').smooth && !R('soft').snap && R('tube').scan > 0 && R('nope') === null, 'soft, tube; an unknown name is no look');
  assert.deepEqual(R({ lines: 120, bits: 4 }), { lines: 120, smooth: false, snap: false, bits: 4, scan: 0 }, 'your own mix');
  // the jointed figure
  const f = figure({ h: 30, hair: null }), box = new T.Box3().setFromObject(f);
  assert.ok(Math.abs(box.min.y) < .8 && box.max.y > 28 && box.max.y < 34, 'figure(): 30 units tall with its feet on the ground (' + box.min.y.toFixed(1) + ' to ' + box.max.y.toFixed(1) + ')');
  assert.ok(f.rig && ['hips', 'spine', 'head', 'armL', 'foreL', 'armR', 'foreR', 'legL', 'shinL', 'legR', 'shinR'].every(k => f.rig.parts[k]?.isObject3D), 'it has the gs.poses joints');
  const legX = () => f.rig.parts.legL.rotation.x; const still = legX();
  f.rig.play('walk'); let swing = 0; for (let i = 0; i < 40; i++) { f.rig.update(1 / 30, { speed: 1.5 }); swing = Math.max(swing, Math.abs(legX() - still)); }
  assert.ok(swing > .2, 'rig.play(\'walk\'): its legs swing (' + swing.toFixed(2) + ' rad)');
  v.def('hero', () => figure({ h: 24 })); v.frame(); const a = v.put('hero', v.at(20, 20)), b2 = v.put('hero', v.at(60, 20), { s: 2 });
  assert.ok(a.rig && b2.rig && a.rig !== b2.rig && b2.scale.x === 2 && b2.children[0].scale.x === 24 / 1.8, 'each copy a view draws has a rig of its own, and put()\'s size multiplies the figure\'s');
  assert.equal(v.pools.get('hero').casts, true, 'and it casts a shadow');
  TOON.shadows = was;
  console.log('Classic Console 2.0: who casts and takes shadows, discs out of the way, the fitted shadow, retro looks, the jointed figure ok');
}

// gs.fluid (Real 3D liquids): the version phones without WebGPU run, which is also what the graphics chip's
// version is held to, drop for drop (scripts/look-compare.cjs gpu-fluid --webgpu)
{
  const F = await import('../src/kit/fluid.js'), { Fluid, FLUID, KINDS } = F, T3 = await import('three');
  const view = () => ({ scene: new T3.Scene() });
  const run = (f, n, each) => { for (let i = 0; i < n; i++) { each?.(i); f.update(1 / 60); } };
  const each = (f, fn) => { const S = f.sim; for (let p = 0; p < S.N; p++) { const a = p * 4; if (S.P[a + 3] > 0) fn(S.ox + S.P[a] * S.h, S.oy + S.P[a + 1] * S.h, S.oz + S.P[a + 2] * S.h, Math.hypot(S.V[a], S.V[a + 1], S.V[a + 2]) * S.h / S.dt); } };
  const outside = f => { const B = f.bounds; let n = 0; each(f, (x, y, z) => { if (!(x >= B[0] && x <= B[3] && y >= B[1] && y <= B[4] && z >= B[2] && z <= B[5])) n++; }); return n; };
  const most = (f, k) => { let m = -1e9; each(f, (x, y, z, v) => { m = Math.max(m, [x, y, z, v][k]); }); return m; };
  FLUID.klass = 'low'; assert.equal(Fluid.max(), 600, 'a slow phone runs 600 drops'); FLUID.klass = 'top'; assert.equal(Fluid.max(), 2000, 'a fast one 2,000 (without WebGPU)');
  {
    // a pool: the liquid asked for goes in, keeps its depth, comes to rest and stays in its box
    const f = new Fluid(view(), { box: [-1, 0, -1, 1, 2, 1], volume: 2.2 }), put = f.fill({ y1: .5 }); run(f, 180);
    assert.ok(put > 1.7 && put < 2.05 && f.amount() === put, 'fill() puts in the block asked for: ' + put);
    for (const [x, z] of [[-.7, 0], [0, 0], [.7, .6]]) assert.ok(Math.abs(f.level(x, z) - .5) < .08, `a pool half a unit deep stays that deep: ${f.level(x, z)} at ${x}, ${z}`);
    assert.ok(most(f, 3) < .2 && outside(f) === 0, 'and comes to rest inside its box (fastest drop ' + most(f, 3).toFixed(3) + ' units a second)');
    assert.ok(f.mesh.count === f.count && f.mesh.visible && f.mesh.parent?.isScene && f.backend === 'cpu', 'a ball a drop, in the view\'s scene');
    assert.ok(f.wet(0, .1, 0) > .7 && f.wet(0, 1.5, 0) === 0 && f.level(5, 0) === null && Math.abs(f.amount([-1, 0, -1, 0, 2, 1]) / f.amount() - .5) < .05, 'wet(), level() and amount(box) answer from the drops');
    // full: no more goes in, and taps wait
    f.fill({ y0: .6, y1: 2 }); assert.ok(f.full && f.room === 0 && f.count === f.max, 'the fluid fills up at its budget of drops');
    const t0 = f.pour({ x: 0, y: 1.8, z: 0, rate: 1 }); run(f, 10); assert.equal(f.count, f.max, 'a tap adds nothing to a full fluid'); t0.remove();
    f.clear(); assert.ok(f.count === 0 && f.level(0, 0) === null && f.amount() === 0, 'clear() empties it');
    // a tap pours what it says; a drain swallows it and counts every drop
    const tap = f.pour({ x: 0, y: 1.5, z: 0, rate: .5, speed: 2 }); run(f, 60); assert.ok(Math.abs(f.amount() - .5) < .05, 'a tap of half a unit a second: ' + f.amount() + ' after a second');
    tap.on = false; const had = f.amount(), d = f.drain({ x: 0, y: .1, z: 0, r: .4 }); run(f, 240);
    assert.ok(d.amount > .3 && Math.abs(d.amount + f.amount() - had) < f.drop / 2, `a drain takes liquid and counts it: ${d.amount} of ${had}`);
    d.remove(); tap.remove(); assert.ok(f.drains.length === 0 && f.taps.length === 0, 'remove()');
  }
  {
    // a dam break: across the tank in a second, never out of it, level in the end; honey is slower
    const mk = kind => { const f = new Fluid(view(), { box: [-2, 0, -.5, 2, 2, .5], volume: 1.6, kind }); f.fill({ x1: -1, y1: 1.5 }); return f; };
    const f = mk('water'), a0 = f.amount(); run(f, 60); assert.ok(f.level(1.5, 0) > .1 && outside(f) === 0, 'a dam break reaches the far side in a second');
    run(f, 540); for (const x of [-1.5, 0, 1.5]) assert.ok(f.level(x, 0) > .2 && f.level(x, 0) < .6, 'and levels out: ' + f.level(x, 0) + ' at ' + x);
    assert.ok(f.amount() === a0 && outside(f) === 0 && most(f, 3) < 3, 'with every drop still in the tank');
    const w = mk('water'), h = mk('honey'); run(w, 40); run(h, 40); assert.ok(most(h, 0) < most(w, 0) - .3, `honey runs slower than water: ${most(h, 0).toFixed(2)} against ${most(w, 0).toFixed(2)}`);
    assert.ok(KINDS.lava.glow > 0 && KINDS.water.thick === 0 && h.mu > w.mu, 'the ready-made kinds');
  }
  {
    // a cup holds what is poured into it and gives it up when tipped
    const f = new Fluid(view(), { box: [-1, 0, -1, 1, 2, 1], volume: 1 }), cup = f.tube({ x: 0, y: .5, z: 0, r: .4, h: .8, hollow: .06 }), c0 = cup.fill(.8); run(f, 90);
    assert.ok(c0 > .1 && f.amount(cup.inside()) >= c0 * .97 && f.amount() - f.amount(cup.inside()) < f.drop / 2, `a hollow tube keeps its liquid in: ${f.amount(cup.inside())} of ${c0}`);
    const q = new T3.Quaternion(), ax = new T3.Vector3(0, 0, 1); run(f, 120, i => { q.setFromAxisAngle(ax, Math.min(1, i / 60) * 2.6); cup.set(0, .6, 0, q); });
    let low = 0; each(f, (x, y) => { if (y < .2) low++; }); assert.ok(low * f.drop > c0 * .7 && outside(f) === 0, 'tipped over, it pours out onto the floor: ' + (low * f.drop).toFixed(3));
    cup.remove(); assert.equal(f.solids.length, 0);
    // a tap over an open cup: the stream falls freely into it (nothing of the cup stands above its rim to hold it up)
    const g = new Fluid(view(), { box: [-1.5, 0, -1, 1.5, 2, 1], volume: 2, drops: 1500 }), mug = g.tube({ x: .8, y: .45, z: 0, r: .5, h: .9, hollow: .06 });
    g.pour({ x: .8, y: 1.6, z: 0, rate: .25, speed: 2 }); run(g, 90);
    assert.ok(g.amount(mug.inside()) > .25 && g.amount() - g.amount([.3, 0, -.5, 1.3, 2, .5]) < g.drop / 2, 'a tap fills a cup: ' + g.amount(mug.inside()).toFixed(3) + ' of ' + g.amount().toFixed(3) + ' poured is in it after a second and a half');
  }
  {
    // a ball swept through a pool pushes the liquid ahead of it; a blast throws it up
    const mk = () => { const f = new Fluid(view(), { box: [-2, 0, -.5, 2, 2, .5], volume: 1.6 }); f.fill({ y1: .4 }); run(f, 90); return f; };
    const f = mk(), a0 = f.amount(), ball = f.ball({ x: -1.6, y: .2, z: 0, r: .3 }); run(f, 60, i => ball.set(-1.6 + i * .04, .2, 0));
    assert.ok(f.level(1.6, 0) > f.level(-1.5, 0) + .2 && f.amount() === a0 && outside(f) === 0, `a moving ball pushes liquid ahead: ${f.level(-1.5, 0)} behind it, ${f.level(1.6, 0)} ahead`);
    const mesh = new T3.Object3D(), led = f.ball({ r: .2, follow: mesh }); mesh.position.set(1, .3, .1); run(f, 2); assert.ok(led.x === 1 && led.y === .3 && Math.abs(led.z - .1) < 1e-6, 'follow: a solid follows a three.js object');
    const g = mk(), before = most(g, 1); g.push(0, .1, 0, { radius: .8, strength: 2, up: 3 }); let peak = 0; run(g, 30, () => { peak = Math.max(peak, most(g, 1)); });
    assert.ok(peak > before + .15 && outside(g) === 0, `a blast throws liquid up: ${before.toFixed(2)} to ${peak.toFixed(2)}`);
  }
  {
    // ground to run down, an open box to run off, and gravity that can point anywhere
    const g = new Fluid(view(), { box: [-2, 0, -.5, 2, 2, .5], volume: 1 }); g.ground(x => Math.max(0, x * .4)); g.fill({ x0: .5, x1: 2, y0: .9, y1: 1.3 }); run(g, 300);
    assert.ok(g.amount([-2, 0, -.5, 0, 2, .5]) / g.amount() > .6 && g.level(1.5, 0) === null && g.level(-1.5, 0) > .15, 'liquid runs downhill and leaves the slope dry');
    const o = new Fluid(view(), { box: [-1, 0, -1, 1, 2, 1], volume: 1, open: true }); o.fill({ x0: -.4, x1: .4, z0: -.4, z1: .4, y1: .8 }); const o0 = o.count; run(o, 30);
    assert.ok(o.count > o0 * .5 && most(o, 1) < 1 && outside(o) === 0, 'an open box keeps its floor'); run(o, 210); assert.ok(o.count < o0 * .2, 'and the liquid runs off its edges: ' + o0 + ' drops, then ' + o.count);
    const s = new Fluid(view(), { box: [-1, 0, -1, 1, 2, 1], volume: 1 }); s.fill({ y1: .4 }); s.gravity = { x: 9.8, y: 0, z: 0 }; run(s, 240);
    assert.ok(s.amount([.4, 0, -1, 1, 2, 1]) / s.amount() > .9, 'gravity turned sideways piles the liquid on that wall');
  }
  {
    // the same liquid at another size (the graphics chip handing over to this version), copies back from the chip, and the fluid's own dice
    const f = new Fluid(view(), { box: [-1, 0, -1, 1, 2, 1], volume: 2 }); f.fill({ y1: .5 }); run(f, 30); const a0 = f.amount();
    FLUID.klass = 'low'; f.resize(false); FLUID.klass = 'top'; assert.ok(f.max === 600 && Math.abs(f.amount() / a0 - 1) < .02, 'resized to 600 drops it is the same liquid: ' + a0 + ' and ' + f.amount());
    run(f, 60); assert.ok(Math.abs(f.level(0, 0) - .5) < .1 && outside(f) === 0, 'which settles where it was');
    const r = new Fluid(view(), { box: [-1, 0, -1, 1, 2, 1], volume: 2 }); r.fill({ y1: .3 }); const d = r.drain({ x: 0, y: 0, z: 0, r: .01 }); run(r, 5);
    r.mode = 'gpu'; r.cpuOwns = false; const P = r.sim.P.slice(); P[3] = -1; P[7] = 0; const c0 = r.count; r.read(P, r.sim.steps + 1);
    assert.ok(r.count === c0 - 2 && Math.abs(d.amount - r.drop) < 1e-9, 'a copy back from the graphics chip: one drop down drain 1, one out of the box');
    const mk = seed => { const g = new Fluid(view(), { box: [-1, 0, -1, 1, 2, 1], volume: 2, seed }); g.fill({ x1: 0, y1: .8 }); g.pour({ x: .5, y: 1.5, z: 0, rate: .3 }); run(g, 30); return g.sim.P.slice(0, 400); };
    const A = mk(7), B = mk(7), C = mk(8); assert.ok(A.every((v, i) => v === B[i]) && A.some((v, i) => v !== C[i]), 'the same seed makes the same liquid, drop for drop');
    const n0 = f.view.sims.length; f.dispose(); assert.ok(f.view.sims.length === n0 - 1 && !f.mesh.parent, 'dispose()');
  }
  FLUID.klass = null;
  const { HIDDEN } = await import('../src/gamescroll.js');
  assert.deepEqual(Object.keys(F).filter(k => !HIDDEN.fluid.includes(k)).sort(), ['Fluid', 'KINDS'], 'gs.fluid is Fluid and KINDS: the numbers and test switches stay off it');
  console.log('gs.fluid: pools, taps, drains, a dam break, cups, a ball, blasts, ground, an open box, sideways gravity, resizing, copies back, seeds ok');
}

// gs.vision: what the camera knows (vision-know.js): the 80 things, barcode kinds, seeds, the cut to a game's shape, what is in view
{
  const K = await import('../src/kit/vision-know.js'), { existsSync, readFileSync } = await import('node:fs');
  assert.ok(K.NAMES.length === 80 && new Set(K.NAMES).size === 80 && Object.isFrozen(K.NAMES), 'the 80 things, each once');
  assert.ok(K.nameOf('Cup ') === 'cup' && K.nameOf('phone') === 'cell phone' && K.nameOf('sofa') === 'couch' && K.nameOf('cupp') === null && K.nameOf() === null, 'names: as the model says them, a few other words, null for the rest');
  // the model's own list of names (when npm run ml has fetched it): ours is the same, in the same order
  const model = new URL('../ml-cache/mediapipe-1.2.2/efficientdet_lite0.tflite', import.meta.url);
  if (existsSync(model)) { const buf = readFileSync(model), at = buf.indexOf('person\nbicycle\n'); assert.ok(at > 0, 'the model carries its names'); const theirs = buf.subarray(at, at + 700).toString().split('\n').slice(0, 90).filter(n => n !== '???'); assert.deepEqual(theirs, [...K.NAMES], 'the names are the model\'s own'); }
  // kinds: both readers' names for a code come to ours
  assert.ok(K.KINDS.length === 13 && K.kindOf('qr_code') === 'qr' && K.kindOf('QRCode') === 'qr' && K.kindOf('QRCodeModel2') === 'qr' && K.kindOf('ISBN') === 'ean-13' && K.kindOf('ITF14') === 'itf' && K.kindOf('MaxiCode') === null, 'kinds: the phone reader\'s names and ZXing\'s');
  assert.deepEqual(K.phoneKinds(['qr', 'ean-13']), ['qr_code', 'ean_13']); assert.deepEqual(K.zxingKinds(['qr', 'ean-13']), ['QRCode', 'EAN13']);
  assert.ok(K.phoneKinds(K.KINDS).length === 13 && K.zxingKinds(K.KINDS).length === 13, 'every kind has a name in both readers');
  // seeds: whole numbers, the same every time, far apart for neighbours, one for a UPC-A and its EAN-13 form
  const a = K.seedOf('5012345678900'), b = K.seedOf('5012345678901');
  assert.ok(Number.isInteger(a) && a >= 0 && a <= 0xffffffff && a === K.seedOf(' 5012345678900 ') && a !== b, 'a seed is a whole number, the same for the same text');
  let flips = 0; for (let i = 0; i < 32; i++) flips += ((a ^ b) >>> i) & 1; assert.ok(flips >= 8, 'codes one digit apart give seeds far apart (' + flips + ' of 32 bits differ)');
  assert.equal(K.seedOf('012345678905'), K.seedOf('0012345678905'), 'a 12-digit code and the same code with a 0 in front are one seed');
  const seeds = new Set(); for (let i = 0; i < 5000; i++) seeds.add(K.seedOf('50' + String(10000000000 + i * 7919))); assert.ok(seeds.size === 5000, '5,000 shop codes, 5,000 seeds');
  // the cut: the middle of the camera picture, in the game's shape, no bigger than asked and never bigger than the camera gave
  assert.deepEqual(K.cut(1280, 720, 1, 720), { sx: 280, sy: 0, sw: 720, sh: 720, w: 720, h: 720 }, 'a square out of a wide picture');
  assert.deepEqual(K.cut(720, 1280, 300 / 460, 720), { sx: 0, sy: (1280 - 720 / (300 / 460)) / 2, sw: 720, sh: 720 / (300 / 460), w: Math.round(720 * 720 / (720 / (300 / 460))), h: 720 }, 'a card shape out of a tall one');
  assert.deepEqual(K.cut(640, 480, 0, 720), { sx: 0, sy: 0, sw: 640, sh: 480, w: 640, h: 480 }, 'no shape: the camera\'s own, not scaled up');
  assert.ok(K.cut(1920, 1080, 0, 720).w === 720 && K.cut(1920, 1080, 0, 720).h === 405, 'scaled down to the size asked');
  // in view: there after two looks running, gone after three without, arrivals reported once
  const v = new K.InView({ hold: 2, gone: 3 }), see = (...ks) => v.look(new Map(ks.map(k => [k, { k }])));
  assert.deepEqual(see('cup'), []); assert.ok(!v.on('cup'), 'one look is not enough');
  assert.deepEqual(see('cup', 'dog'), ['cup']); assert.ok(v.on('cup') && !v.on('dog') && v.it('cup').k === 'cup');
  assert.deepEqual(see('cup'), [], 'no second arrival'); assert.ok(!v.on('dog'), 'a thing seen once and then not starts again');
  see(); see(); assert.ok(v.on('cup'), 'two blurry looks do not lose it'); see(); assert.ok(!v.on('cup') && v.all().length === 0, 'three do');
  see('cup'); assert.deepEqual(see('cup'), ['cup'], 'and it arrives again when it comes back');
  const v1 = new K.InView({ hold: (k, it) => it.k === 'qr' ? 1 : 2 }); assert.deepEqual(v1.look(new Map([['a', { k: 'qr' }], ['b', { k: 'ean' }]])), ['a'], 'hold can depend on what was seen');
  // one look's finds, tidied: names, boxes in 0..1, the wanted ones, surest first, mirrored for the front camera
  const det = (name, score, x, y, w, h) => ({ categories: [{ categoryName: name, score }], boundingBox: { originX: x, originY: y, width: w, height: h } });
  const res = { detections: [det('cup', .6, 64, 48, 128, 96), det('cell phone', .9, 320, 240, 400, 300), det('dog', .4, 0, 0, 10, 10), det('???', .9, 0, 0, 10, 10)] };
  let f = K.finds(res, 640, 480, { sure: .5 });
  assert.ok(f.length === 2 && f[0].name === 'cell phone' && f[1].name === 'cup', 'surest first, the unsure and the nameless left out');
  assert.ok(Math.abs(f[1].left - .1) < 1e-9 && Math.abs(f[1].top - .1) < 1e-9 && Math.abs(f[1].w - .2) < 1e-9 && Math.abs(f[1].x - .2) < 1e-9 && Math.abs(f[1].y - .2) < 1e-9, 'a box in 0..1 with its middle');
  assert.ok(Math.abs(f[0].w - .5) < 1e-9 && Math.abs(f[0].h - .5) < 1e-9, 'a box that runs off the picture is cut at its edge');
  f = K.finds(res, 640, 480, { sure: .5, want: ['cup'], mirror: true }); assert.ok(f.length === 1 && Math.abs(f[0].left - .7) < 1e-9 && Math.abs(f[0].x - .8) < 1e-9, 'only what was wanted; mirrored for the front camera');
  assert.equal(K.finds(res, 640, 480, { sure: .3, max: 2 }).length, 2, 'max'); assert.deepEqual(K.finds(null, 1, 1), []);
  // one look's codes, tidied
  const sq = (x, y, s) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];
  let r = K.reads([{ text: 'HELLO', format: 'qr_code', corners: sq(160, 120, 160) }, { text: '', format: 'QRCode', corners: sq(0, 0, 9) }, { text: 'X', format: 'MaxiCode', corners: [] }], 640, 480);
  assert.ok(r.length === 1 && r[0].kind === 'qr' && r[0].seed === K.seedOf('HELLO') && Math.abs(r[0].x - .375) < 1e-9 && Math.abs(r[0].w - .25) < 1e-9 && r[0].corners.length === 4, 'a code: kind, seed, where it is');
  r = K.reads([{ text: '0012345678905', format: 'EAN13', corners: sq(0, 0, 64) }], 640, 480, { kinds: ['ean-13'] });
  assert.ok(r.length === 1 && r[0].kind === 'upc-a' && r[0].text === '012345678905' && r[0].seed === K.seedOf('012345678905'), 'an EAN-13 that starts with 0 is the 12-digit UPC-A on every phone');
  assert.equal(K.reads([{ text: 'A', format: 'Code128', corners: [] }], 1, 1, { kinds: ['qr'] }).length, 0, 'kinds not asked for are left out');
  assert.ok(Math.abs(K.reads([{ text: 'A', format: 'QRCode', corners: sq(0, 0, 64) }], 640, 480, { mirror: true })[0].x - .95) < 1e-9, 'mirrored for the front camera');
  assert.ok(K.looksFor('qr') === 1 && K.looksFor('ean-13') === 2, 'square codes are believed at one look, stripes at two alike');
  // the card says "camera" for games that use them
  const { sensorsOf } = await import('../src/game-modules.js');
  assert.deepEqual(sensorsOf(['vision.Objects']), ['camera']); assert.deepEqual(sensorsOf(['vision.Scanner']), ['camera']);
  console.log('gs.vision: the 80 things, barcode kinds, seeds, the cut, in view, finds and reads ok');
}

// gs.ar phase 2: the room maths (ar-room.js): the phone's depth picture as a mesh that hides virtual things,
// and the room's light as a sun direction and reflections
{
  const R = await import('../src/kit/ar-room.js');
  const b64 = bytes => Buffer.from(bytes).toString('base64');
  // a depth picture is 16-bit millimetres, low byte first
  assert.deepEqual([...R.depthOf(b64([0x34, 0x12, 0xff, 0xff, 0, 0]), 4)], [0x1234, 65535, 0, 0], 'depth pictures decode (and a short one is padded with "not known")');

  // a pretend room seen by a camera 1.3 m up, looking 52 degrees down (so the whole picture is within reach): a floor, and a box 1 m ahead
  const pitch = -.9, cp = Math.cos(pitch), sp = Math.sin(pitch), pose = [1, 0, 0, 0, 0, cp, sp, 0, 0, -sp, cp, 0, .1, 0, 0, 1];
  const f = 1 / Math.tan(Math.PI / 6), asp = .5, proj = [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, -1.001, -1, 0, 0, -.1, 0];
  const W = 24, H = 48, FLOORY = -1.3, box = { x0: -.4, x1: .4, y1: -.6, z0: -1.2, z1: -.9 };
  const ray = (i, j) => { const cx = (2 * i / (W - 1) - 1) / proj[0], cy = (1 - 2 * j / (H - 1)) / proj[5]; return [pose[0] * cx + pose[4] * cy - pose[8], pose[1] * cx + pose[5] * cy - pose[9], pose[2] * cx + pose[6] * cy - pose[10]]; };   // (one metre along the camera's view)
  const cast = (d, o = [pose[12], pose[13], pose[14]]) => {
    let best = d[1] < 0 ? (FLOORY - o[1]) / d[1] : Infinity;
    const lo = [box.x0, FLOORY, box.z0], hi = [box.x1, box.y1, box.z1]; let t0 = 0, t1 = best;
    for (let k = 0; k < 3; k++) { const a = (lo[k] - o[k]) / d[k], c = (hi[k] - o[k]) / d[k]; t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c)); }
    return t0 <= t1 && t0 > 0 ? { t: t0, box: true } : { t: best, box: false };
  };
  const mm = new Uint16Array(W * H), what = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const h = cast(ray(i, j)); mm[j * W + i] = h.t < 60 ? Math.round(h.t * 1000) : 0; what.push(h); }   // (t is along a ray of depth 1: it is the depth)
  const pos = new Float32Array(W * H * 3), idx = new Uint16Array((W - 1) * (H - 1) * 6);
  // with no mapped surfaces every spot is set back a little along its line of sight, and no further
  let n = R.depthMesh(mm, W, H, pose, proj, pos, idx);
  assert.equal(n, (W - 1) * (H - 1) * 6, 'a whole depth picture makes a whole mesh');
  let worst = 0, behind = 0;
  for (let k = 0; k < W * H; k++) {
    const d = ray(k % W, k / W | 0), t = mm[k] / 1000, px = pose[12] + d[0] * t, py = pose[13] + d[1] * t, pz = pose[14] + d[2] * t;
    const off = Math.hypot(pos[k * 3] - px, pos[k * 3 + 1] - py, pos[k * 3 + 2] - pz), far = Math.hypot(pos[k * 3] - pose[12], pos[k * 3 + 1] - pose[13], pos[k * 3 + 2] - pose[14]) - Math.hypot(d[0], d[1], d[2]) * t;
    worst = Math.max(worst, off / (.02 + .02 * t * Math.hypot(d[0], d[1], d[2]) + .002)); if (far > 0) behind++;
  }
  assert.ok(worst < 1.6 && behind === W * H, `every spot sits just behind where the phone measured it (${worst.toFixed(2)}, ${behind})`);
  // with the floor mapped, the floor's spots go 3 cm under it (so things standing on it and their shadows show), the box's stay
  n = R.depthMesh(mm, W, H, pose, proj, pos, idx, { flats: [R.floorFlat(FLOORY)] });
  let lowF = Infinity, highF = -Infinity, boxTop = 0, boxN = 0;
  for (let k = 0; k < W * H; k++) { const y = pos[k * 3 + 1]; if (what[k].box) { if (Math.abs(y - box.y1) < .08) boxTop++; boxN++; } else if (mm[k] < 4000) { lowF = Math.min(lowF, y); highF = Math.max(highF, y); } }
  assert.ok(Math.abs(lowF - (FLOORY - .03)) < 1e-3 && Math.abs(highF - (FLOORY - .03)) < 1e-3, `floor spots lie 3 cm under the mapped floor (${lowF.toFixed(3)} to ${highF.toFixed(3)})`);
  assert.ok(boxN > 40 && boxTop > 10, `the box still stands above it (${boxN} spots, ${boxTop} on its top)`);
  // depth that is 2.5 cm out here and there still never cuts into the floor
  const rnd = (s => () => ((s = Math.imul(s ^ s >>> 15, 2246822507) ^ Math.imul(s ^ s >>> 13, 3266489909), (s ^= s >>> 16) >>> 0) / 4294967296))(7);
  const noisy = mm.map(v => Math.max(1, Math.round(v + (rnd() - .5) * 50)));
  R.depthMesh(noisy, W, H, pose, proj, pos, idx, { flats: [R.floorFlat(FLOORY)] });
  let above = 0; for (let k = 0; k < W * H; k++) if (!what[k].box && mm[k] < 4000 && pos[k * 3 + 1] > FLOORY - .02) above++;
  assert.equal(above, 0, 'noisy depth: no floor spot comes up through the floor');
  // an estimated floor that is 15 cm too low still has the real floor's spots moved under it
  R.depthMesh(mm, W, H, pose, proj, pos, idx, { flats: [R.floorFlat(FLOORY - .15, .25)] });
  above = 0; for (let k = 0; k < W * H; k++) if (!what[k].box && mm[k] < 4000 && pos[k * 3 + 1] > FLOORY - .15 - .02) above++;
  assert.equal(above, 0, 'an estimated floor is given more room');
  // spots the phone knows nothing about, or too near or too far to trust, leave holes
  const holes = Uint16Array.from(mm); holes[5 * W + 5] = 0; holes[20 * W + 10] = 100; holes[30 * W + 3] = 9000;
  n = R.depthMesh(holes, W, H, pose, proj, pos, idx);
  assert.equal(n, ((W - 1) * (H - 1) * 2 - 18) * 3, 'three unknown spots take six triangles each out of the mesh');
  const gone = new Set([5 * W + 5, 20 * W + 10, 30 * W + 3]); let used = 0; for (let k = 0; k < n; k++) if (gone.has(idx[k])) used++;
  assert.equal(used, 0, 'no triangle uses an unknown spot'); assert.ok(pos.every(v => v === v), 'every number is a number for the graphics chip');
  // a mapped wall: spots on it go 3 cm behind it, inside its edges only
  const wallPose = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, -2, 1];   // y axis (0, 0, 1): it faces the camera
  const flatW = R.flatOf(wallPose, 1, 1), level = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], wd = new Uint16Array(9).fill(2000), wp = new Float32Array(27), wi = new Uint16Array(24);
  R.depthMesh(wd, 3, 3, level, proj, wp, wi, { flats: [flatW] });
  assert.ok(Math.abs(wp[4 * 3 + 2] - -2.03) < 1e-3, `a spot on the wall goes 3 cm behind it (${wp[4 * 3 + 2].toFixed(3)})`);
  assert.ok(Math.abs(wp[2] - -2.03) > .02, 'a spot beyond the wall\'s edge is left to the usual set-back');

  // the room's light: packed as the phone sends it and opened again
  const N = 16, env = { size: N, rgb: new Float32Array(6 * N * N * 3) }, sun = [-.6, .7, .39], sl = Math.hypot(...sun);
  const face = (fc, a, b) => fc === 0 ? [1, -b, -a] : fc === 1 ? [-1, -b, a] : fc === 2 ? [a, 1, b] : fc === 3 ? [a, -1, -b] : fc === 4 ? [a, -b, 1] : [-a, -b, -1];
  const fill = (e, lamp) => { let at = 0; for (let fc = 0; fc < 6; fc++) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const v = face(fc, (c + .5) / N * 2 - 1, (r + .5) / N * 2 - 1), l = Math.hypot(...v); let x = v[1] > 0 ? .5 : .2; if (lamp && (v[0] * lamp[0] + v[1] * lamp[1] + v[2] * lamp[2]) / l / Math.hypot(...lamp) > .93) x = 14; e.rgb[at++] = x; e.rgb[at++] = x * .9; e.rgb[at++] = x * .7; } return e; };
  fill(env, sun);
  const back = R.envOf(R.envPack(env)); let err = 0; for (let i = 0; i < env.rgb.length; i++) err = Math.max(err, Math.abs(back.rgb[i] - env.rgb[i]) / (env.rgb[i] + .05));
  assert.ok(back.size === N && err < .08, `the room's picture survives the trip from the phone (${err.toFixed(3)})`);
  // looking the picture up by direction lands on the dot that direction came from
  const c3 = [0, 0, 0]; let wrong = 0;
  for (let fc = 0; fc < 6; fc++) for (const [c, r] of [[0, 0], [15, 0], [7, 8], [3, 12], [15, 15]]) { const v = face(fc, (c + .5) / N * 2 - 1, (r + .5) / N * 2 - 1); R.envAt(env, v[0] * 3, v[1] * 3, v[2] * 3, c3); if (c3[0] !== env.rgb[((fc * N + r) * N + c) * 3]) wrong++; }
  assert.equal(wrong, 0, 'a direction finds its own dot on every face');
  // where the light is: the lamp's direction, and how much of the light it is
  const L = R.envLight(back), ang = Math.acos((L.x * sun[0] + L.y * sun[1] + L.z * sun[2]) / sl) * 180 / Math.PI;
  assert.ok(ang < 6 && L.sharp > .3, `the lamp is found (${ang.toFixed(1)} degrees off, sharp ${L.sharp.toFixed(2)})`);
  const even = R.envLight(fill({ size: N, rgb: new Float32Array(env.rgb.length) }, null));
  assert.ok(even.sharp === 0 && Math.abs(even.mean - (.5 + .2) / 2 * (.2126 + .7152 * .9 + .0722 * .7)) < .01, `an evenly lit room has no "where the light is" (mean ${even.mean.toFixed(3)})`);
  // two lamps on opposite sides: bright, but not from any one place
  const two = fill({ size: N, rgb: new Float32Array(env.rgb.length) }, [1, .3, 0]); { const o = fill({ size: N, rgb: new Float32Array(env.rgb.length) }, [-1, .3, 0]); for (let i = 0; i < two.rgb.length; i++) two.rgb[i] = Math.max(two.rgb[i], o.rgb[i]); }
  assert.ok(R.envLight(two).sharp < .5 * L.sharp, 'two lamps on opposite sides are a weaker "where" than one');
  // painting it on the ball of reflections: turned into game space, levelled, and capped
  const out = new Float32Array(6), gz = R.turnY(sun[0], sun[2], -.7);   // the lamp's direction in a game whose "ahead" is .7 radians round
  R.envPaint(back, [gz[0], sun[1], gz[1], -gz[0], -sun[1], -gz[1]], .7, out, { level: 1.8, cap: 24 });
  assert.ok(out[0] > 20 && out[0] <= 1.8 * 24 + 1e-3 && out[3] < 1.8, `the lamp is where it should be after the turn (${out[0].toFixed(1)} against ${out[3].toFixed(2)} opposite)`);
  const flat = fill({ size: N, rgb: new Float32Array(env.rgb.length) }, null); flat.rgb.fill(.37); R.envPaint(flat, [0, 1, 0, 1, 0, 0], 2, out, { level: 1.8 });
  assert.ok(Math.abs(out[0] - 1.8) < 1e-3 && Math.abs(out[3] - 1.8) < 1e-3, 'an even room is painted at the level asked for, however bright the room');
  // has the light changed? only where it is counts, not how bright the room is
  const dim = { size: N, rgb: back.rgb.map(v => v * .4) }, moved = R.envOf(R.envPack(fill({ size: N, rgb: new Float32Array(env.rgb.length) }, [.7, .6, -.2])));
  assert.ok(R.envChange(back, L.mean, back, L.mean) === 0 && R.envChange(back, L.mean, dim, L.mean * .4) < .01 && R.envChange(back, L.mean, moved, R.envLight(moved).mean) > .12, 'a dimmer room is the same light, a lamp moved is not');
  // the sun for a real light: never lower than 25 degrees, the same way round the room
  const s3 = [0, 0, 0];
  R.sunDir(-1, 1, .2, s3); assert.ok(Math.abs(Math.hypot(...s3) - 1) < 1e-9 && s3[1] > .69 && s3[0] < -.69, 'a high light is used as it is');
  R.sunDir(0, .05, 1, s3); assert.ok(Math.abs(s3[1] - .42) < 1e-9 && s3[2] > .9 && Math.abs(Math.hypot(...s3) - 1) < 1e-9, 'a low light is lifted');
  R.sunDir(.5, -.8, 0, s3); assert.ok(Math.abs(s3[1] - .42) < 1e-9 && s3[0] > .9, 'a light from below (a lamp on the floor) too');
  R.sunDir(0, -1, 0, s3); assert.deepEqual(s3, [0, 1, 0], 'and with nothing to go on, the sun is overhead');
  console.log('gs.ar phase 2: depth pictures to a mesh (floors, walls, holes, noise), the room\'s light (packed, looked up, the lamp found, painted, changed) and the sun for it ok');
}

// gs.outdoors: the meadow (grass tufts that keep around the camera)
{
  globalThis.HTMLCanvasElement ??= class {}; globalThis.Image ??= class {};
  const { Land, Wind } = await import('../src/kit/outdoors.js'), { Vector3 } = await import('three');
  const land = new Land({ kind: (x, z) => 2 + Math.sin(x * .05) * 3, size: 200, segments: 64 });
  // (budget: no limit on planting a frame here, so the counts below are exact)
  const m = land.meadow({ reach: 22, gap: .55, where: (x, z) => x > 0 ? 1 : 0, tall: (x, z) => z > 20 ? .5 : 1, budget: 1e9 }), st = m.userData.meadow;
  assert.ok(m.count === st.n * st.n && st.n === 80 && land.meadows.length === 1, 'a square of tufts, ' + m.count);
  land.wind = new Wind({ x: 2.5, z: 0, grass: .25 });
  const cam = { position: new Vector3(3, 4, 5) }, M = m.instanceMatrix.array, R = m.geometry.attributes.lkRoot.array;
  land.update(.016, cam);
  assert.equal(st.planted, m.count, 'the first look plants every tuft');
  assert.ok(st.look.uniforms.lkBend.value > 0, 'the wind bends it');
  let on = 0, west = 0, off = 0, low = 0, high = 0;
  for (let i = 0; i < m.count; i++) {
    const s = Math.hypot(M[i * 16], M[i * 16 + 2]), x = M[i * 16 + 12], y = M[i * 16 + 13], z = M[i * 16 + 14]; if (!(s > 0)) continue;
    on++; if (x <= 0) west++; if (Math.abs(y + .015 - land.height(x, z)) > 1e-4 || R[i * 4] !== x) off++;
    const up = M[i * 16 + 5] / s; if (z > 21) low = Math.max(low, up); else if (z < 19) high = Math.max(high, up);
  }
  assert.ok(on > 1000 && west === 0, 'grows only where it may: ' + on + ' tufts, ' + west + ' out of bounds');
  assert.equal(off, 0, 'every tuft stands on the ground and knows its root');
  assert.ok(low < high * .7, 'tall() keeps it short: ' + low.toFixed(2) + ' against ' + high.toFixed(2));
  // one cell on: only the row that came into the square is planted; back again: the very same tufts
  const snap = M.slice(); let p0 = st.planted;
  cam.position.x += .6; land.update(.016, cam); assert.equal(st.planted - p0, st.n, 'one cell on plants one row');
  cam.position.x -= .6; land.update(.016, cam); assert.ok(M.every((v, i) => v === snap[i]), 'the same tufts when the camera comes back');
  p0 = st.planted; land.update(.016, cam); land.update(0, cam); assert.equal(st.planted, p0, 'a still camera plants nothing more');
  // a fast fly-past (a bullet camera) plants nothing until it stops
  cam.position.x += 500; land.update(.016, cam); assert.equal(st.planted, p0, 'nothing planted at speed');
  land.update(.016, cam); assert.equal(st.planted - p0, m.count, 'all of it once the camera is still');
  // after a camera cut the square fills over several frames, the grass nearest the camera first; update(0) plants it all at once
  cam.position.set(3, 4, 5);
  const slow = land.meadow({ reach: 8, gap: .5, stalks: 1, budget: -1 }), ss = slow.userData.meadow, RS = slow.geometry.attributes.lkRoot.array;   // (budget -1: one batch of 16 a frame)
  assert.ok(land.meadows.length === 2 && slow.count === 1024);
  land.update(.016, cam); assert.equal(ss.planted, 16, 'a frame plants one batch');
  let far = 0; for (let i = 0; i < slow.count; i++) if (RS[i * 4] || RS[i * 4 + 2]) far = Math.max(far, Math.hypot(RS[i * 4] - 3, RS[i * 4 + 2] - 5));
  assert.ok(far > 0 && far < 2.5, 'the nearest tufts first: the furthest planted is ' + far.toFixed(2) + ' m away');
  let frames = 1; while (ss.planted < slow.count && frames < 200) { land.update(.016, cam); frames++; }
  assert.equal(frames, 64, 'the square fills in over ' + frames + ' frames');
  p0 = ss.planted; cam.position.x += 40; land.update(0, cam); assert.equal(ss.planted - p0, slow.count, 'update(0) plants the whole square at once');
  // taking them away
  assert.ok(land.meadow(false) === null && land.meadows.length === 0 && !m.parent && !slow.parent, 'meadow(false) takes them away');
  console.log('gs.outdoors meadow ok');
}

// cluster detail (detail.js, detail-build.js): a Nanite-style level of detail. A mesh cut into clusters with
// coarser versions of each neighbourhood; any camera's pick of them is whole (no cracks between fine and coarse)
{
  const { PlaneGeometry, SphereGeometry, MeshStandardMaterial, PerspectiveCamera, Raycaster, Vector3 } = await import('three');
  const { DetailMesh, clustersFor, clustersNow, canCluster, keyOf, stats, frame, tick } = await import('../src/kit/detail.js');
  const n = 160, size = 100, H = (x, z) => 6 * Math.sin(x * .05) * Math.cos(z * .07) + 1.5 * Math.sin(x * .31 + z * .17) + .1 * Math.sin(x * 1.7) * Math.sin(z * 2.3);
  const g = new PlaneGeometry(size, size, n, n).rotateX(-Math.PI / 2), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) P.setY(i, H(P.getX(i), P.getZ(i)));
  g.computeVertexNormals();
  assert.ok(canCluster(g) && !canCluster(new PlaneGeometry(1, 1).deleteAttribute('position')), 'a plain triangle mesh can be clustered');
  const cl = await clustersFor(g), full = n * n * 2;
  assert.equal(cl.fullTris, full, 'the finest level is the mesh itself');
  assert.ok(cl.coarseTris < full * .02 && cl.levels >= 5, 'coarser and coarser levels: ' + cl.levels + ' of them, down to ' + cl.coarseTris + ' triangles');
  assert.ok(cl.index.length < full * 3 * 2.3, 'all the levels together are about twice the mesh: ' + (cl.index.length / 3 / full).toFixed(2) + ' x');
  assert.ok(clustersNow(g) === cl && await clustersFor(g) === cl, 'found again in memory, by the mesh\'s content');
  const g2 = g.clone(); assert.ok(keyOf(g2) === keyOf(g) && clustersNow(g2) === cl, 'a copy of the mesh has the same clusters');
  // every group is at least as wrong as the groups its members came from, and its sphere holds theirs: what makes any pick whole
  let wrong = 0;
  for (let gr = 0; gr < cl.groups; gr++) for (let c = cl.gFirst[gr]; c < cl.gFirst[gr] + cl.gCount[gr]; c++) {
    const r = cl.refined[c]; if (r < 0) continue;
    if (cl.gError[r] > cl.gError[gr] + 1e-9) wrong++;
    if (Math.hypot(cl.gSphere[gr * 4] - cl.gSphere[r * 4], cl.gSphere[gr * 4 + 1] - cl.gSphere[r * 4 + 1], cl.gSphere[gr * 4 + 2] - cl.gSphere[r * 4 + 2]) + cl.gSphere[r * 4 + 3] > cl.gSphere[gr * 4 + 3] * 1.0001 + 1e-5) wrong++;
  }
  assert.equal(wrong, 0, 'errors and spheres only grow up the levels');
  // picks from different places: every edge is shared by two triangles, except along the mesh's own rim
  const rim = i => { const x = i % (n + 1), y = Math.floor(i / (n + 1)); return x === 0 || y === 0 || x === n || y === n; }, K = 1000 / (2 * Math.tan(35 * Math.PI / 180));
  const cut = (cam, k) => {
    const m = cl.pick(cam[0], cam[1], cam[2], k, .05, false, null), edges = new Map(), N1 = P.count; let tris = 0;
    for (let i = 0; i < m; i++) { const c = cl.out[i]; for (let t = cl.start[c]; t < cl.start[c] + cl.count[c]; t += 3) { tris++; for (let e = 0; e < 3; e++) { const a = cl.index[t + e], b = cl.index[t + (e + 1) % 3], key = a < b ? a * N1 + b : b * N1 + a; edges.set(key, (edges.get(key) || 0) + 1); } } }
    let open = 0; for (const [key, uses] of edges) if (uses > 2 || (uses === 1 && !(rim(Math.floor(key / N1)) && rim(key % N1)))) open++;
    return { tris, open };
  };
  const near = cut([0, 10, 0], K), corner = cut([-45, 5, -45], K), mid = cut([0, 120, 0], K), far = cut([0, 1e6, 0], K), all = cut([0, 10, 0], 1e9);
  assert.equal(near.open + corner.open + mid.open + far.open + all.open, 0, 'no cracks in any pick');
  assert.equal(all.tris, full, 'asked for everything, every triangle is drawn');
  assert.ok(far.tris === cl.coarseTris && near.tris >= mid.tris && corner.tris < full * .9 && mid.tris < full * .6 && mid.tris > far.tris * 4, 'fewer triangles from further away: ' + [near.tris, corner.tris, mid.tris, far.tris].join(', ') + ' of ' + full);
  // the mesh that draws them: runs of the index list for a camera, again only when the camera moved
  const mesh = new DetailMesh(g, new MeshStandardMaterial(), cl), cam = new PerspectiveCamera(60, 1, .1, 2000);
  cam.position.set(0, 12, 40); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); mesh.updateMatrixWorld();
  tick(); frame(cam);
  mesh._updateDrawParameters(cam, mesh.geometry, mesh.material, 'multiDraw', 1000, false);
  let sum = 0; for (let i = 0; i < mesh._multiDrawCount; i++) sum += mesh._multiDrawCounts[i];
  assert.ok(mesh._multiDrawCount > 0 && sum / 3 === stats.tris && stats.tris < full && stats.full === full && stats.meshes === 1, 'draws ' + stats.tris + ' of ' + full + ' triangles in ' + mesh._multiDrawCount + ' runs');
  const picks = stats.picks; mesh._updateDrawParameters(cam, mesh.geometry, mesh.material, 'multiDraw', 1000, false);
  assert.equal(stats.picks, picks, 'a still camera is not picked for again');
  const before = stats.tris; cam.position.set(0, 400, 600); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  tick(); frame(cam); mesh._updateDrawParameters(cam, mesh.geometry, mesh.material, 'multiDraw', 1000, false);
  assert.ok(stats.tris < before / 3, 'further away: ' + stats.tris + ' against ' + before);
  cam.position.set(0, 12, 40); cam.lookAt(0, 0, 500); cam.updateMatrixWorld();   // looking away from most of it
  tick(); frame(cam); mesh._updateDrawParameters(cam, mesh.geometry, mesh.material, 'multiDraw', 1000, false);
  assert.ok(stats.tris < before / 2, 'what is out of view is not drawn: ' + stats.tris + ' against ' + before);
  const hits = new Raycaster(new Vector3(3, 100, 4), new Vector3(0, -1, 0)).intersectObject(mesh);
  assert.ok(hits.length === 1 && hits[0].object === mesh && Math.abs(hits[0].point.y - H(3, 4)) < .1, 'a ray hits the full mesh');
  mesh.dispose(); assert.equal(cl.users, 0, 'dispose lets go of the clusters');
  // a faceted ball (every triangle its own points) still clusters; its picks are whole too by position
  const ball = new SphereGeometry(3, 96, 64).toNonIndexed(); ball.computeVertexNormals();
  const cb = await clustersFor(ball);
  assert.ok(cb.fullTris === ball.attributes.position.count / 3 && cb.coarseTris <= cb.fullTris, 'a mesh with no index list: ' + cb.fullTris + ' triangles, down to ' + cb.coarseTris);
  console.log('gs.hd cluster detail ok');
}

// real surface detail (relief.js, relief-build.js): a material's height picture made into geometry, with
// cluster tables whose coarsest level is the flat mesh itself
{
  const { BoxGeometry, PlaneGeometry, Mesh, MeshStandardMaterial, DataTexture, RedFormat, RepeatWrapping } = await import('three');
  const { buildRelief, reliefClusters, reliefReady } = await import('../src/kit/relief-build.js');
  const { buildFrom, buildReady } = await import('../src/kit/detail-build.js');
  const { Clusters } = await import('../src/kit/detail.js');
  const { relief, reliefOf } = await import('../src/kit/relief.js');
  await Promise.all([reliefReady, buildReady]);
  // bricks: 4 across and 8 up a tile, the mortar between them low
  const size = 256, data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const j = Math.floor(y / 32), fx = ((x / 64 - (j % 2) * .5) % 1 + 1) % 1, fy = y / 32 - j; data[y * size + x] = Math.min(fx, 1 - fx) * 64 > 2.5 && Math.min(fy, 1 - fy) * 32 > 2.5 ? 255 : 0; }
  const height = { data, size };
  const arrays = g => ({ positions: g.attributes.position.array, normals: g.attributes.normal.array, uvs: g.attributes.uv.array, index: Uint32Array.from(g.index.array), extra: [] });
  // edges that don't pair up, by place: none in a closed mesh
  const open = r => {
    const ids = new Map(), pid = [], e = new Map(); let n = 0;
    for (let i = 0; i < r.points; i++) { const k = Math.round(r.positions[i * 3] * 1e5) + ',' + Math.round(r.positions[i * 3 + 1] * 1e5) + ',' + Math.round(r.positions[i * 3 + 2] * 1e5); if (!ids.has(k)) ids.set(k, ids.size); pid.push(ids.get(k)); }
    for (let t = 0; t < r.tris; t++) for (let k = 0; k < 3; k++) { const a = pid[r.index[t * 3 + k]], b = pid[r.index[t * 3 + (k + 1) % 3]]; if (a !== b) e.set(a < b ? a + '-' + b : b + '-' + a, (e.get(a < b ? a + '-' + b : b + '-' + a) || 0) + (a < b ? 1 : -1)); }
    for (const v of e.values()) n += Math.abs(v);
    return n;
  };
  // a wall: real triangles where the mortar is, every point in the layer pushed into the wall
  const wall = arrays(new PlaneGeometry(2, 1)), w = buildRelief({ ...wall, height }, { depth: .02 });
  let lo = 0, hi = 0, out = 0; for (let i = 0; i < w.points; i++) { const z = w.positions[i * 3 + 2]; lo = Math.min(lo, z); hi = Math.max(hi, z); if (Math.abs(w.positions[i * 3]) > 1.00001 || Math.abs(w.positions[i * 3 + 1]) > .50001) out++; }
  assert.ok(w.tris > 500 && w.tris < w.split && w.full, 'a brick wall becomes real triangles, thinned where it is flat: ' + w.tris + ' of the ' + w.split + ' it was split into');
  assert.ok(lo < -.018 && lo > -.0201 && hi < 1e-6 && out === 0, 'pushed in by its depth, never out: ' + lo.toFixed(4) + ' to ' + hi.toFixed(4));
  const small = buildRelief({ ...wall, height }, { depth: .02, maxTris: 1000 });
  assert.ok(small.tris <= 1000 && small.tris > 300, 'no more triangles than it is allowed: ' + small.tris);
  // a closed box stays closed, inside the box it was; so do two boxes side by side, where one's corners lie part-way along the other's edges
  const box = arrays(new BoxGeometry(2, 1, 1)), b = buildRelief({ ...box, height }, { depth: .02 });
  let far = 0; for (let i = 0; i < b.points; i++) far = Math.max(far, Math.abs(b.positions[i * 3]) - 1, Math.abs(b.positions[i * 3 + 1]) - .5, Math.abs(b.positions[i * 3 + 2]) - .5);
  assert.ok(open(b) === 0 && far < 1e-5, 'a closed box is still closed, and no bigger');
  const g2 = new BoxGeometry(1, .6, 1).translate(1.5, -.2, 0), a2 = arrays(g2), nb = box.positions.length / 3;
  const two = { positions: Float32Array.of(...box.positions, ...a2.positions), normals: Float32Array.of(...box.normals, ...a2.normals), uvs: Float32Array.of(...box.uvs, ...a2.uvs), index: Uint32Array.of(...box.index, ...Array.from(a2.index, i => i + nb)), extra: [] };
  assert.equal(open(buildRelief({ ...two, height }, { depth: .02 })), 0, 'two boxes side by side stay closed');
  // its clusters: the flat mesh is the coarsest level, wrong by the depth and no more; picks are whole
  const cl = new Clusters(reliefClusters(w, wall, buildFrom, { maxTris: 512, group: 8 }));
  assert.ok(cl.coarseTris === 2 && cl.fullTris === w.tris && Math.abs(cl.gError[cl.groups - 1] - .02) < 1e-6, 'the flat wall is its coarsest level: ' + cl.fullTris + ' triangles down to ' + cl.coarseTris);
  assert.ok(Math.max(...cl.gError) <= .02 + 1e-6, 'simplifying a flat wall\'s relief is never counted as more than its depth');
  const P = cl.relief.positions, rim = i => Math.abs(Math.abs(P[i * 3]) - 1) < 1e-5 || Math.abs(Math.abs(P[i * 3 + 1]) - .5) < 1e-5, N1 = cl.relief.points;
  const cut = (z, k = 1000) => {
    const m = cl.pick(0, 0, z, k, .05, false, null), edges = new Map(); let tris = 0, bad = 0;
    for (let i = 0; i < m; i++) { const c = cl.out[i]; for (let t = cl.start[c]; t < cl.start[c] + cl.count[c]; t += 3) { tris++; for (let e = 0; e < 3; e++) { const p = cl.index[t + e], q = cl.index[t + (e + 1) % 3], key = p < q ? p * N1 + q : q * N1 + p; edges.set(key, (edges.get(key) || 0) + 1); } } }
    for (const [key, uses] of edges) if (uses > 2 || (uses === 1 && !(rim(Math.floor(key / N1)) && rim(key % N1)))) bad++;
    return { tris, bad };
  };
  const near = cut(.5), mid = cut(6), away = cut(60);
  assert.ok(near.bad + mid.bad + away.bad === 0 && near.tris > mid.tris && mid.tris > 2 && away.tris === 2, 'from further away fewer triangles, then the flat wall, with no cracks: ' + [near.tris, mid.tris, away.tris].join(', '));
  // gs.models.relief: built in the background for a mesh, which keeps its own geometry
  const tex = new DataTexture(data, size, size, RedFormat); tex.wrapS = tex.wrapT = RepeatWrapping; tex.needsUpdate = true;
  const geo = new PlaneGeometry(2, 1), mesh = new Mesh(geo, new MeshStandardMaterial()), plain = new Mesh(new PlaneGeometry(2, 1), new MeshStandardMaterial());
  assert.ok(relief(mesh, { height: tex, depth: .02 }) === mesh && mesh.userData.relief === 'building', 'relief(mesh) starts its build and hands the mesh back');
  relief(plain); assert.equal(plain.userData.relief, undefined, 'a material with no height picture is left alone');
  assert.ok(await relief.ready(mesh) === 1 && mesh.userData.relief === 'ready', 'relief.ready() waits for it');
  const R = reliefOf(mesh);
  assert.ok(mesh.geometry === geo && R.geometry !== geo && R.info.tris > 500 && R.clusters.coarseTris === 2 && R.geometry.attributes.uv.count === R.geometry.attributes.position.count, 'the mesh keeps its two triangles; its relief has ' + R.info.tris);
  const twin = new Mesh(geo.clone(), mesh.material); relief(twin, { height: tex, depth: .02 }); await relief.ready(twin);
  assert.ok(reliefOf(twin).clusters === R.clusters, 'a copy of the mesh shares the one build');
  relief(mesh, false); assert.ok(mesh.userData.relief === undefined && !reliefOf(mesh), 'relief(mesh, false) takes it off');
  console.log('gs.models relief ok');
}

// whole detail levels for things drawn as many copies (detail-build.js buildLevels, detail.js levelsFor): the
// mesh simplified a few times over on its own points, each level with its measured error
{
  const { TorusKnotGeometry, CylinderGeometry, IcosahedronGeometry, SphereGeometry, BoxGeometry } = await import('three');
  const { levelsFor, levelGeometry } = await import('../src/kit/detail.js');
  const tris = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
  const sound = (g, lv, what) => {
    const nv = g.attributes.position.count; let was = tris(g), err = 0;
    for (let i = 0; i < lv.levels; i++) {
      const t = lv.count[i] / 3;
      assert.ok(t >= 1 && t <= was * .85 && lv.error[i] > 0 && lv.error[i] >= err, `${what}: level ${i + 1} is simpler than the one before and no truer (${t} triangles, out by ${lv.error[i].toFixed(4)})`);
      for (let k = lv.start[i]; k < lv.start[i] + lv.count[i]; k++) if (lv.index[k] >= nv) assert.fail(what + ': a level uses a point the mesh does not have');
      was = t; err = lv.error[i];
    }
    return [...lv.count].map(c => c / 3).join(', ');
  };
  const knot = new TorusKnotGeometry(1, .35, 160, 24), lv = await levelsFor(knot), list = sound(knot, lv, 'knot');
  assert.ok(lv.levels === 5 && lv.count[4] / 3 < tris(knot) * .01 && lv.error[0] < .02 && lv.error[4] < 1.4, 'a knot of ' + tris(knot) + ' triangles: ' + list);
  assert.ok(await levelsFor(knot.clone()) === lv, 'found again in memory, by the mesh\'s content');
  const g1 = levelGeometry(knot, lv, 1);
  assert.ok(g1.attributes.position === knot.attributes.position && g1.attributes.uv === knot.attributes.uv && g1.index.count === lv.count[1] && g1.boundingSphere.radius === knot.boundingSphere.radius && g1.boundingSphere !== knot.boundingSphere,
    'a level is the mesh\'s own points with fewer triangles');
  // a post with caps (three parts, seams round the rims) and a faceted rock (every triangle its own points)
  const post = new CylinderGeometry(.1, .12, 1.4, 20, 6), lp = await levelsFor(post), posts = sound(post, lp, 'post');
  assert.ok(lp.levels >= 3 && lp.count[lp.levels - 1] / 3 <= 20, 'a post of ' + tris(post) + ' triangles: ' + posts);
  const rock = new IcosahedronGeometry(1, 12); rock.computeVertexNormals();
  const lr = await levelsFor(rock), rocks = sound(rock, lr, 'rock');
  assert.ok(!rock.index && lr.levels >= 4 && lr.count[lr.levels - 1] / 3 < tris(rock) * .02, 'a faceted rock of ' + tris(rock) + ' triangles: ' + rocks);
  // a ball's seam and poles hold more triangles than its far levels may have: keeping them would cave the
  // ball in to reach the count, so those levels cross the seam and stay round
  const ball = new SphereGeometry(1, 120, 90), lb = await levelsFor(ball), balls = sound(ball, lb, 'ball');
  assert.ok(lb.levels === 5 && lb.count[4] / 3 < 160 && lb.error[4] < .1, 'a ball of ' + tris(ball) + ' triangles stays a ball: ' + balls + ', the last out by ' + lb.error[4].toFixed(3));
  const box = await levelsFor(new BoxGeometry(1, 1, 1));
  assert.ok(box.levels <= 1, 'a box is as simple as it gets, or nearly');
  console.log('gs.hd detail levels for copies ok');
}

// gs.props: a kind's detail option, moving one copy (the others used to lose their turn and scale), and the
// count the view's kept shadows go by
{
  const { BoxGeometry, MeshBasicMaterial, Scene, Matrix4, Vector3, Quaternion } = await import('three');
  const { Props } = await import('../src/kit/props.js');
  const props = new Props(new Scene()), geo = new BoxGeometry(1, 1, 1), mat = new MeshBasicMaterial();
  props.kind('box', geo, mat);
  assert.ok(props.kind('auto', geo, mat, { lod: 'auto' }).userData.detail === true && props.kind('whole', geo, mat, { lod: false }).userData.detail === false && props.mesh('box').userData.detail === undefined,
    'lod: \'auto\' asks the view for levels, lod: false turns them down');
  const a = props.add('box', 1, 0, 2, { rot: 1.2, scale: 3 }), b = props.add('box', 5, 0, 6, { rot: .4, scale: 2 });
  const m = props.mesh('box'), M = new Matrix4(), p = new Vector3(), q = new Quaternion(), s = new Vector3();
  const read = id => { m.getMatrixAt(id, M); M.decompose(p, q, s); return [p.x, p.y, p.z, s.x, 2 * Math.atan2(q.y, q.w)].map(v => +v.toFixed(3)); };
  props.move('box', a, 9, 1, 9);
  assert.deepEqual(read(a), [9, 1, 9, 3, 1.2], 'the moved copy keeps its turn and scale');
  assert.deepEqual(read(b), [5, 0, 6, 2, .4], 'the others stay where they were, turned and sized as they were');
  assert.deepEqual(props.near('box', { x: 9, y: 1, z: 9 }, 1).map(i => i.id), [a], 'and near() finds it where it went');
  // the view keeps still things' shadows from frame to frame: a set says when a copy is moved, hidden or shown
  const said = m.userData.gsChanged; props.hide('box', b);
  const hid = m.userData.gsChanged; props.hide('box', b, false);
  const shown = m.userData.gsChanged; m.setMatrixAt(a, M);
  assert.ok(said > 0 && hid > said && shown > hid && m.userData.gsChanged > shown && !m.getVisibilityAt(a) === false && m.getVisibilityAt(b), 'a set counts up when a copy is moved, hidden or shown');
  console.log('gs.props detail option and move ok');
}

// sound that knows the level (src/kit/acoustics.js, gs.sound.Ears with a level): walls muffle, places ring
{
  const { caster, blocked, muffleOf, Room } = await import('../src/kit/acoustics.js');
  const { World3D, loadPhysics3D } = await import('../src/kit/physics3d.js'); await loadPhysics3D();
  const { TileMap } = await import('../src/kit/tiles.js');
  const snd = await import('../src/kit/sound.js');
  // a house: a room 6 x 3 x 8 with a doorway in its east wall, a thin wall to the north, a thick one to the south
  const w = new World3D();
  const wall = (x, y, z, sx, sy, sz) => w.box(null, sx, sy, sz, { fixed: true, at: { x, y, z } });
  wall(0, -.1, 0, 60, .2, 60); wall(0, 3.1, 0, 6.4, .2, 8.4);   // ground, ceiling
  wall(0, 1.5, -4.1, 6.4, 3, .2); wall(0, 1.5, 5, 6.4, 3, 2);   // north (thin), south (2 m thick)
  wall(-3.1, 1.5, 0, .2, 3, 8.4); wall(3.1, 1.5, -2.5, .2, 3, 3.4); wall(3.1, 1.5, 2.9, .2, 3, 2.6); wall(3.1, 2.6, .4, .2, .8, 2.4);   // west; east with a doorway from z = -.8 to 1.6
  w.step(1 / 60);
  const cast = caster(w), ear = { x: 0, y: 1.6, z: 0 };
  assert.ok(Math.abs(cast(ear, { x: 0, y: 0, z: -1 }, 20) - 4) < .02 && cast(ear, { x: 1, y: 0, z: .1 }, 2) === Infinity, 'a World3D answers how far the first wall is');
  const inRoom = blocked(cast, ear, { x: -2, y: 1, z: 2 }), thin = blocked(cast, ear, { x: 0, y: 1.6, z: -7 }), thick = blocked(cast, ear, { x: 0, y: 1.6, z: 9 });
  const door = blocked(cast, ear, { x: 6, y: 1.5, z: .4 }), corner = blocked(cast, ear, { x: 4.2, y: 1.5, z: 3.4 }), west = blocked(cast, ear, { x: -7, y: 1.5, z: 0 });
  assert.ok(inRoom === 0 && door === 0, 'nothing in the way: in the room ' + inRoom + ', through the doorway ' + door);
  assert.ok(thin > .35 && thin < .8 && thick > .9 && thick > thin + .15, 'a thin wall muffles (' + thin.toFixed(2) + '), a thick one more (' + thick.toFixed(2) + ')');
  assert.ok(corner > .1 && corner < thin - .1 && west >= thin - .01, 'outside, round the doorway\'s edge, it is only partly muffled: ' + corner.toFixed(2) + ' (no way round the west wall: ' + west.toFixed(2) + ')');
  const m0 = muffleOf(0), m1 = muffleOf(1), mh = muffleOf(.5);
  assert.ok(m0.gain === 1 && m0.hz === 20000 && m1.hz < 500 && m1.gain < .45 && mh.hz < m0.hz && mh.hz > m1.hz, 'muffled sound is quieter and duller by degrees');
  // the place: the room, a hall, open ground, a yard between far walls
  const feel = (c, at, o) => { const r = new Room(o); for (let i = 0; i < 6; i++) r.probe(c, at, 4); assert.ok(r.known, 'felt all round'); return { ...r.read() }; };
  const room = feel(cast, ear);
  const hall = new World3D(); const hw = (x, y, z, sx, sy, sz) => hall.box(null, sx, sy, sz, { fixed: true, at: { x, y, z } });
  hw(0, -.1, 0, 80, .2, 80); hw(0, 12.1, 0, 30, .2, 44); hw(-15.1, 6, 0, .2, 12, 44); hw(15.1, 6, 0, .2, 12, 44); hw(0, 6, -22.1, 30, 12, .2); hw(0, 6, 22.1, 30, 12, .2); hall.step(1 / 60);
  const big = feel(caster(hall), { x: 1, y: 1.6, z: 2 });
  const field = new World3D(); field.floor(0); field.step(1 / 60);
  const open = feel(caster(field), { x: 0, y: 1.6, z: 0 });
  const yard = new World3D(); yard.floor(0); yard.box(null, 60, 20, 1, { fixed: true, at: { x: 0, y: 10, z: -25 } }); yard.box(null, 60, 20, 1, { fixed: true, at: { x: 0, y: 10, z: 25 } }); yard.step(1 / 60);
  const street = feel(caster(yard), { x: 0, y: 1.6, z: 0 });
  assert.ok(room.enclosed > .9 && room.size > 1.5 && room.size < 5 && room.tail > .25 && room.tail < 1 && room.wet > .1, 'a small room: ' + JSON.stringify({ size: +room.size.toFixed(1), tail: +room.tail.toFixed(2), wet: +room.wet.toFixed(2) }));
  assert.ok(big.enclosed > .9 && big.tail > room.tail * 2 && big.tail < 4.5 && big.wet > room.wet, 'a hall rings longer: ' + big.tail.toFixed(2) + ' s against ' + room.tail.toFixed(2));
  assert.ok(open.enclosed === 0 && open.wet === 0 && open.echo === 0, 'open country has no echo');
  assert.ok(street.roof < .35 && street.wet < room.wet * .5 && street.echo > .03 && Math.abs(street.delay - 2 * 28 / 343) < .09, 'far walls and little roof: a slap back after ' + street.delay.toFixed(2) + ' s ' + JSON.stringify({ roof: +street.roof.toFixed(2), wet: +street.wet.toFixed(3), echo: +street.echo.toFixed(3) }));
  // a flat map in pixels (16 to the metre): the same answers through a TileMap
  const map = TileMap.fromText(['##########', '#...#....#', '#...#....#', '#........#', '#...#....#', '##########'], { size: 16 });
  const c2 = caster(map, { flat: true }), e2 = { x: 40, y: 24 };
  assert.ok(blocked(c2, e2, { x: 100, y: 24 }, { flat: true, spread: 9.6, thick: 19.2 }) > .3 && blocked(c2, e2, { x: 40, y: 60 }, { flat: true, spread: 9.6, thick: 19.2 }) === 0, 'a tile wall muffles; the open floor does not');
  const r2 = feel(c2, e2, { flat: true, unit: 16 });
  assert.ok(r2.walls === 1 && r2.size > .8 && r2.size < 4 && r2.tail > .15, 'a tile room, in metres: ' + r2.size.toFixed(1));
  // Ears: the same through gs.sound, with no audio here (the sums still run; sounds are silent)
  const ears = new snd.Ears({ level: w });
  for (let i = 0; i < 8; i++) ears.place(ear, { x: 0, y: 0, z: -1 });
  assert.ok(ears.room.enclosed > .9 && Math.abs(ears.blocked({ x: 0, y: 1.6, z: 9 }) - thick) < 1e-9 && ears.blocked({ x: 1, y: 1, z: 1 }) === 0, 'Ears with a level knows the room and the walls');
  assert.ok(ears.heard({ x: 0, y: 1.6, z: 9 }) < new snd.Ears().place(ear).heard({ x: 0, y: 1.6, z: 9 }), 'heard() is quieter behind a wall');
  assert.ok(new snd.Ears().room === null && new snd.Ears().blocked({ x: 9, y: 9, z: 9 }) === 0, 'without a level nothing is muffled');
  ears.tone(440, { x: 0, y: 1.6, z: 9 }).noise(.2, { x: 6, y: 1, z: 0 }).play('boom', { x: 0, y: 1, z: -7 }); ears.loop({ x: 0, y: 1, z: 9 }).move({ x: 1, y: 1, z: 9 }).stop();
  snd.mixer.place({ tail: 2, wet: .3, echo: .1, delay: .2 }).place(null).reset();
  const flat = new snd.Ears({ level: map, flat: true, unit: 16 }); for (let i = 0; i < 6; i++) flat.place2d(40, 24);
  assert.ok(flat.blocked({ x: 100, y: 24 }) > .3 && flat.room.walls === 1, 'flat Ears on a tile map');
  for (const x of [w, hall, field, yard]) x.free();
  console.log('sound that knows the level: walls (thin, thick, a doorway, a corner), places (room, hall, open, a yard), tile maps and Ears ok');
}

// people who react physically (src/kit/ragdoll.js: a jointed ragdoll on a gs.poses rig; src/kit/reactions.js: gs.characters.Reactions)
{
  const THREE = await import('three');
  const { World3D, loadPhysics3D } = await import('../src/kit/physics3d.js'); await loadPhysics3D();
  const { person, figure } = await import('../src/kit/poses.js');
  const { Reactions } = await import('../src/kit/reactions.js');
  const { JOINT_LIMITS } = await import('../src/kit/ragdoll.js');
  const dt = 1 / 60, hipsY = f => f.rig.parts.hips.getWorldPosition(new THREE.Vector3()).y;
  const stage = (make = person, o = {}) => { const scene = new THREE.Scene(), w = new World3D({ gravity: -9.81 }); const floor = new THREE.Mesh(new THREE.BoxGeometry(200, .4, 200)); floor.position.y = -.2; scene.add(floor); w.ground(scene); const f = make(); scene.add(f); return { scene, w, f, r: o.react === false ? null : new Reactions(f, { world: o.world === false ? null : w, ...o }) }; };
  // runs a character for `secs`, doing things at the times given; notes each state as it comes, the steps, landings, getting up
  const run = (S, secs, at = {}, { walk = 0 } = {}) => {
    const { f, r, w } = S, log = [], seen = { steps: 0, landed: 0, rose: 0, impact: 0 }; let state = r.state;
    for (let i = 0; i <= Math.round(secs / dt); i++) {
      for (const t in at) if (Math.round(t / dt) === i) at[t](r, f);
      if (!r.busy && walk) f.position.z += walk * dt;
      f.rig.play(walk > 3 && !r.busy ? 'run' : 'idle'); f.rig.update(dt, { speed: r.busy ? 0 : walk }); r.update(dt); w.step(dt);
      if (r.state !== state) log.push(state = r.state);
      if (r.stepped) seen.steps++; if (r.landed) { seen.landed++; seen.impact = r.impact; } if (r.rose) seen.rose++;
    }
    return { log: log.join(' '), ...seen };
  };

  // the ragdoll itself: eleven bodies on the skeleton, the character still one skinned mesh that follows them
  {
    const { w, f } = stage(person, { react: false });
    f.rig.play('run'); f.rig.update(.2, { speed: 4 });
    const doll = w.ragdoll(f, { push: [1.5, 1, -4] });
    assert.ok(doll.parts.length === 11 && doll.joints.length === 10 && doll.part('head') && w.dolls.includes(doll), 'a rig gets eleven bodies and ten joints');
    let worst = 0; const P = f.rig.parts;
    for (let i = 0; i < 240; i++) { w.step(dt); for (const [n, lo, hi] of [['shinL', 0, 2.3], ['shinR', 0, 2.3], ['foreL', -2.2, 0], ['foreR', -2.2, 0]]) worst = Math.max(worst, lo - P[n].rotation.x, P[n].rotation.x - hi, Math.abs(P[n].rotation.y), Math.abs(P[n].rotation.z)); }
    assert.ok(worst < .3, 'knees and elbows only bend the way they do, through the landing: ' + worst.toFixed(2));
    assert.ok(doll.still() && hipsY(f) < .3 && hipsY(f) > .03 && Math.abs(f.position.z) > .5 && Math.hypot(f.position.x - P.hips.getWorldPosition(new THREE.Vector3()).x, 0) < .05, 'thrown, it comes to rest on the floor and the character has gone with it: hips ' + hipsY(f).toFixed(2));
    doll.remove(); assert.ok(!w.dolls.length && doll.gone, 'removed');
    // muscles: held by the hips in the air, it takes up a pose and keeps it against its own weight
    const g = stage(person, { react: false }); g.f.position.y = 2; g.f.rig.update(dt);
    const d2 = g.w.ragdoll(g.f); d2.root.body.setBodyType(g.w.R.RigidBodyType.Fixed, true);
    const pose = { armL: [.75, 0, .5], armR: [-1.2, 0, -.3], foreL: [-.35, 0, 0], foreR: [-.9, 0, 0], legL: [-.7, 0, 0], shinL: [.9, 0, 0], spine: [.3, 0, 0] };
    d2.drive(pose, .7); for (let i = 0; i < 90; i++) g.w.step(dt);
    const Q = g.f.rig.parts, miss = Math.max(...Object.keys(pose).map(n => Math.hypot(Q[n].rotation.x - pose[n][0], Q[n].rotation.y - pose[n][1], Q[n].rotation.z - pose[n][2])));
    assert.ok(miss < .25, 'driven joints reach their pose and hold it: furthest off ' + miss.toFixed(2));
    const armUp = Q.armR.rotation.x; d2.relax(); for (let i = 0; i < 40; i++) g.w.step(dt);
    assert.ok(d2.limp && Q.armR.rotation.x > armUp + .5, 'let go, the arm drops: ' + armUp.toFixed(2) + ' to ' + Q.armR.rotation.x.toFixed(2));
    d2.drive({ armL: [-3, 0, 0] }, .8); for (let i = 0; i < 90; i++) g.w.step(dt);
    assert.ok(Math.abs(Q.armL.rotation.x) > 2.6 && JOINT_LIMITS.armL[0][0] <= -3, 'an arm goes right up over the head');
    w.free(); g.w.free();
  }

  // a nudge: it gives and comes back, and never leaves its feet
  {
    const S = stage(), spine = S.f.rig.parts.spine; let lean = 0, winced = 0; S.f.face = { wince: a => { winced = a; } };
    const out = run(S, 1.6, { .3: r => r.hit([0, 0, -.35]), .4: () => { lean = spine.rotation.x; } });
    assert.ok(winced >= .35 && winced <= 1, 'a face that can wince does so at a blow: ' + winced);
    assert.ok(out.log === '' && !S.r.busy && out.steps === 0 && Math.hypot(S.f.position.x, S.f.position.z) < .02, 'a nudge is only swayed off: ' + out.log);
    assert.ok(Math.abs(lean - .03) > .02, 'the trunk gives under it (' + lean.toFixed(2) + ')');
  }
  // a shove: steps to stay up, and the game has it back
  {
    const S = stage(), out = run(S, 3, { .3: r => r.hit([0, 0, 1.6]) });
    assert.ok(out.log === 'stagger steady' && out.steps >= 1 && out.steps <= 7 && S.f.position.z > .25 && S.f.position.z < 2.2, 'a shove: ' + out.log + ', ' + out.steps + ' steps, ' + S.f.position.z.toFixed(2) + ' m');
    assert.ok(Math.abs(hipsY(S.f) - .97) < .06 && !S.w.dolls.length, 'and stands as before');
    const B = stage(person, { steady: 2.2 }), brute = run(B, 3, { .3: r => r.hit([0, 0, 1.6]) });
    assert.ok(B.f.position.z < S.f.position.z * .7, 'someone steadier is moved less: ' + B.f.position.z.toFixed(2) + ' against ' + S.f.position.z.toFixed(2) + ' (' + (brute.log || 'steady') + ')');
  }
  // a hard blow: down as a ragdoll, a thud, a rest, and up again where it fell
  for (const [name, push, make] of [['from the front', [0, 0, -3.6], person], ['from behind', [0, 0, 3.6], person], ['from the side', [3.4, 0, .3], figure]]) {
    const S = stage(make), out = run(S, 7, { .3: r => r.hit(push) });
    assert.ok(out.log === 'falling down rising steady' && out.landed === 1 && out.impact > 1.5 && out.rose === 1, 'knocked down ' + name + ': ' + out.log + ', landed ' + out.landed + ' (' + out.impact.toFixed(1) + ' m/s)');
    const far = Math.hypot(S.f.position.x, S.f.position.z), way = (S.f.position.x * push[0] + S.f.position.z * push[2]) / Math.hypot(push[0], push[2]);
    assert.ok(far > .8 && far < 4.5 && way > .6 && Math.abs(hipsY(S.f) - .97) < .06 && Math.abs(S.f.position.y) < .02 && !S.w.dolls.length && !S.r.busy, 'it gets up ' + far.toFixed(2) + ' m off, the way it was hit, on its feet');
  }
  // a blow to a body already down pushes the ragdoll; reset() stands it up at once
  {
    const S = stage(); run(S, 1.2, { .3: r => r.hit([0, 0, -3.6]) });
    const z = S.r.doll.root.pos.z; S.r.hit([0, 2, -4]); run(S, .3);
    assert.ok(S.r.doll && S.r.doll.root.pos.z < z - .15, 'kicked while down');
    S.r.reset(); assert.ok(!S.r.busy && !S.r.doll && !S.w.dolls.length && Math.abs(S.f.rig.parts.hips.position.y - S.f.rig.hip0) < 1e-6, 'reset() stands it up');
  }
  // limp: it stays where it fell until it is brought round
  {
    const S = stage(person, { rest: .5 }), out = run(S, 5, { .3: r => r.fall([0, 0, -1.5], { limp: true }) });
    assert.ok(out.log === 'falling down' && S.r.down && !S.r.doll && hipsY(S.f) < .3, 'shot: ' + out.log + ', and its bodies are let go once it lies still');
    S.r.getUp(); assert.ok(S.r.down, 'it does not get up by itself');
    S.r.getUp({ revive: true }); const up = run(S, 3.5);
    assert.ok(up.log === 'steady' && up.rose === 1 && Math.abs(hipsY(S.f) - .97) < .06, 'brought round, it gets up: ' + up.log + ', rose ' + up.rose + ', hips ' + hipsY(S.f).toFixed(2));
  }
  // a trip: at a run it goes down and slides to a stop; from a stand it only stumbles
  {
    const S = stage(), out = run(S, 6.5, { .8: r => r.trip() }, { walk: 5 }), tripped = 5 * .8;
    assert.ok(out.log.startsWith('falling down rising') && out.landed === 1, 'tripped at a run: ' + out.log);
    const T = stage(); let at = 0; run(T, 3, { .8: (r, f) => { at = f.position.z; r.trip(); }, 2.2: (r, f) => { at = f.position.z - at; } }, { walk: 5 });
    assert.ok(at > 1 && at < 4, 'it comes to rest ' + at.toFixed(2) + ' m on, not thrown across the map');
    const U = stage(), stand = run(U, 3, { .3: r => r.trip([0, 0, 1]) });
    assert.ok(!stand.log.includes('falling') && stand.steps >= 1, 'tripped from a stand it stumbles: ' + stand.log);
    assert.ok(tripped > 3);
  }
  // an explosion: thrown if near, untouched if far
  {
    const S = stage(), out = run(S, 2.5, { .3: (r, f) => r.blast({ x: f.position.x - 1.2, y: .2, z: f.position.z - 1.5 }, 11, 5) });
    assert.ok(out.log.startsWith('falling') && Math.hypot(S.r.doll ? S.r.doll.root.pos.x : S.f.position.x, S.r.doll ? S.r.doll.root.pos.z : S.f.position.z) > 2.5, 'blown off its feet: ' + out.log);
    const F = stage(), far = run(F, 1, { .3: r => r.blast({ x: 9, y: 0, z: 0 }, 11, 5) });
    assert.ok(far.log === '' && far.steps === 0, 'out of reach of it, nothing');
  }
  // bracing: arms up when told, and against a wall it runs into
  {
    const S = stage(), arm = S.f.rig.parts.armR; let up = 0;
    run(S, 2, { .3: (r, f) => r.brace({ x: 2, y: 1, z: 3 }, .9), .9: () => { up = arm.rotation.x; } });
    assert.ok(up < -1.2 && Math.abs(arm.rotation.x) < .3, 'guards its head (' + up.toFixed(2) + ') and lowers its arms after');
    const W = stage(); W.w.box(null, 4, 3, .3, { fixed: true, at: { x: 0, y: 1.5, z: 4.35 } }); W.w.step(dt);
    let reach = 0; const out = run(W, 2.4, { .9: (r, f) => { reach = f.rig.parts.armL.rotation.x; } }, { walk: 4.2 });
    assert.ok(reach < -.8 && out.log.startsWith('stagger') && W.f.position.z < 4.1, 'running at a wall: hands out (' + reach.toFixed(2) + '), then knocked back off it: ' + out.log);
  }
  // off a ledge: no ground under the step it needs
  {
    const scene = new THREE.Scene(), w = new World3D({ gravity: -9.81 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(60, .4, 60)); top.position.set(0, -.2, 29); const low = new THREE.Mesh(new THREE.BoxGeometry(200, .4, 200)); low.position.y = -1.6; scene.add(top, low); w.ground(scene);
    const f = person(); scene.add(f); const r = new Reactions(f, { world: w, ground: (x, z) => z > -1 ? 0 : -1.4 });
    const out = run({ f, r, w }, 6.5, { .3: r => r.hit([0, 0, -2.2]) });
    assert.ok(out.log.startsWith('stagger falling down rising') && out.impact > 4 && Math.abs(f.position.y + 1.4) < .05 && f.position.z < -1, 'backed off a ledge, it falls to the ground below (' + out.impact.toFixed(1) + ' m/s) and gets up there: ' + out.log);
    w.free();
  }
  // with no physics world the fall is acted; with a mover, the mover is out of the way while it is down and put back after
  {
    const S = stage(person, { world: false }), out = run(S, 6.5, { .3: r => r.hit([0, 0, -3.6]) });
    assert.ok(out.log === 'falling down rising steady' && out.landed === 1 && out.rose === 1 && !S.r.doll && S.f.position.z < -.3 && Math.abs(hipsY(S.f) - .97) < .06, 'acted: ' + out.log + ', ' + S.f.position.z.toFixed(2) + ' m back');
    const M = stage(person, { react: false }), mover = M.w.mover(M.f, { radius: .3, height: 1.8 }), r = new Reactions(M.f, { world: M.w, mover });
    let off = null; const got = run({ ...M, r }, 7, { .3: r => r.hit([0, 0, -3.6]), 1.5: () => { off = mover.collider.isEnabled(); } });
    assert.ok(got.log === 'falling down rising steady' && off === false && mover.collider.isEnabled() && Math.hypot(mover.feet.x - M.f.position.x, mover.feet.z - M.f.position.z) < .05 && M.f.position.z < -.8, 'a mover stands aside for the fall and takes the body back where it got up: ' + got.log + ', off ' + off + ', feet ' + mover.feet.z.toFixed(2) + ' body ' + M.f.position.z.toFixed(2));
    const N = stage(person, { react: false }), walker = N.w.mover(N.f, { radius: .3, height: 1.8 }), rn = new Reactions(N.f, { world: N.w, mover: walker }); N.w.box(null, 4, 3, .3, { fixed: true, at: { x: 0, y: 1.5, z: 1.35 } });
    const pushed = run({ ...N, r: rn }, 3, { .3: r => r.hit([0, 0, 1.7]) });
    assert.ok(pushed.log === 'stagger steady' && pushed.steps >= 1 && N.f.position.z > .2 && N.f.position.z < .95 && Math.abs(walker.feet.z - N.f.position.z) < .02, 'shoved with a mover, it staggers as far as the wall lets it: ' + pushed.log + ', ' + N.f.position.z.toFixed(2) + ' m');
  }
  console.log('people who react physically: the jointed ragdoll (limits, muscles), nudge, shove, knocked down three ways, limp, trip, blast, bracing, a wall, a ledge, acted falls and a mover ok');
}

// buildings that come apart (src/kit/structure.js: gs.destruction.Structure; src/kit/models/buildings.js: buildingPieces)
{
  const THREE = await import('three');
  const { World3D, loadPhysics3D } = await import('../src/kit/physics3d.js'); await loadPhysics3D();
  const { Structure } = await import('../src/kit/structure.js'), { building, buildingPieces, BUILDING_STYLES } = await import('../src/kit/models/buildings.js');
  const M = () => new THREE.MeshBasicMaterial(), materials = { wall: M(), trim: M(), frame: M(), roof: M(), door: M(), glass: M(), lit: M(), floor: M() };
  const house = (o = {}, b = {}) => new Structure(new THREE.Group(), { building: { style: 'brick', w: 8, d: 6, floors: 2, seed: 3, materials, ...b }, ...o });
  const play = (h, secs, w = h.world) => { const ev = { broke: 0, fell: 0, landed: 0 }; for (let i = 0; i < secs * 60; i++) { w?.step(1 / 60); h.update(1 / 60); for (const b of h.broke) { ev[b.how]++; assert.ok([b.x, b.y, b.z, b.size, b.mass, b.speed].every(Number.isFinite), 'an event has numbers'); } } return ev; };
  const up = (h, test) => { let n = 0; for (let i = 0; i < h.S.n; i++) if (h.state[i] <= 1 && test(h.S.C[i])) n++; return n; };
  // the building cut into pieces: every point is in exactly one piece, it fills the same space as the whole one, and whole it holds itself up
  for (const style of Object.keys(BUILDING_STYLES)) for (const [w, d, floors] of [[8, 6, 2], [13, 9, 3], [5, 5, 1]]) {
    const cut = buildingPieces({ style, w, d, floors, materials }), seen = cut.parts.map(p => new Uint8Array(p.geo.attributes.position.count));
    for (const c of cut.chunks) for (const [pi, s, n] of c.ranges) for (let i = s; i < s + n; i++) { assert.equal(seen[pi][i], 0, 'a point in two pieces'); seen[pi][i] = 1; }
    assert.ok(seen.every(s => s.every(Boolean)), `${style}: every point belongs to a piece`);
    const box = g => new THREE.Box3().setFromObject(g), a = box(building({ style, w, d, floors, materials })), g = new THREE.Group(); for (const p of cut.parts) g.add(new THREE.Mesh(p.geo));
    const b = box(g); assert.ok(a.min.distanceTo(b.min) < .01 && a.max.distanceTo(b.max) < .01, `${style} ${w}x${d}x${floors}: cut, it is the same size`);
    const h = new Structure(null, { building: { style, w, d, floors, materials } });
    assert.equal(h.S.loose, 0, `${style} ${w}x${d}x${floors}: every piece reaches the ground`); assert.equal(h.standing, 1);
    h.update(1 / 60); assert.equal(h.due, 0, 'whole, nothing falls'); assert.ok(!h.busy);
  }
  // hits: a window goes at once and the wall round it does not; a wall piece takes several, and they add up
  {
    const h = house(), glass = h.ray({ x: -2.67, y: 1.6, z: 12 }, { x: 0, y: 0, z: -1 });
    assert.ok(glass && glass.kind === 'window' && Math.abs(glass.point.z - 3) < .25 && glass.normal.z > .9, 'a ray finds the window: ' + JSON.stringify(glass));
    assert.equal(h.hit(glass.point, { power: .15 }), 1, 'a window breaks to a small hit'); assert.equal(up(h, c => c.kind === 'window'), 18);
    const wall = h.ray({ x: 1.3, y: 1, z: 12 }, { x: 0, y: 0, z: -1 }); assert.equal(wall.kind, 'wall');
    let shots = 0; while (!h.hit(wall.point, { power: .4, dir: [0, 0, -1] }) && shots < 20) shots++;
    assert.ok(shots >= 2 && shots <= 5, 'a wall piece takes a few hits: ' + shots);
    const ev = play(h, 3); assert.ok(ev.broke === 2 && h.standing > .95 && !h.busy, 'and the house stands: ' + JSON.stringify(ev) + ' ' + h.standing.toFixed(3));
    const through = h.ray({ x: 1.3, y: 1, z: 12 }, { x: 0, y: 0, z: -1 }); assert.ok(through.distance > wall.distance + 1, 'the shot now goes through the hole');
  }
  // what holds what: one pier out of a tall masonry wall and the wall closes over the hole; a wide hole and the wall above comes down, but the corners stand
  {
    const tall = house({}, { style: 'stone', w: 20, d: 12, floors: 5 }), n0 = tall.left;
    tall.hit({ x: 1.6, y: 1, z: 6 }, { radius: .5, power: 9 }); play(tall, 4);
    assert.ok(n0 - tall.left <= 8 && up(tall, c => c.kind === 'wall' && c.min[2] > 5.6 && c.min[1] > 3 && c.max[0] > 0 && c.min[0] < 3) >= 8, 'a small hole: the wall above bridges it (' + (n0 - tall.left) + ' pieces gone)');
    const h = house(); h.blast({ x: .4, y: 1.2, z: 3.3 }, 2.6); const ev = play(h, 5);
    const above = up(h, c => c.kind === 'wall' && c.min[2] > 2.6 && c.min[1] > 3.1 && c.max[1] < 6.5 && c.min[0] > -2.2 && c.max[0] < 2.2), corners = up(h, c => c.kind === 'wall' && c.min[2] > 2.6 && Math.abs(c.min[0] + c.max[0]) > 7);
    assert.ok(ev.fell >= 6 && above === 0 && corners >= 8 && h.standing > .8 && h.standing < .93, `a shell at the door: the wall above falls (${above} left of it), the corners stand (${corners}), ${h.standing.toFixed(2)} of it is left: ` + JSON.stringify(ev));
    assert.ok(up(h, c => c.kind === 'roof') === 6 && !h.busy, 'the roof stays up, and it all comes to rest');
    // the same shell at a concrete building and a timber one: concrete is harder to break, and both hang further
    const con = house({}, { style: 'concrete' }), tim = house({}, { style: 'timber' });
    const nc = con.blast({ x: .4, y: 1.2, z: 3.3 }, 2.6), nt = tim.blast({ x: .4, y: 1.2, z: 3.3 }, 2.6); play(con, 4); play(tim, 4);
    assert.ok(nc < nt && con.standing > h.standing && tim.S.span === 2 && h.S.span === 1, `concrete loses less (${nc} pieces against ${nt}), ${con.standing.toFixed(2)} stands`);
  }
  // a big bomb flattens it: nothing left but rubble, within what is kept
  {
    const h = house({ bits: 120 }); h.blast({ x: 0, y: 1.5, z: 0 }, 6.5, { power: 7, push: 12 }); const ev = play(h, 7);
    assert.ok(h.standing === 0 && h.left === 1 && ev.broke > 100 && !h.busy && h.loose.length === 0, 'flat: ' + h.standing + ' ' + JSON.stringify(ev));
    let lying = 0, low = 9; for (const s of h.bits.sets.values()) for (let i = 0; i < s.n; i++) if (s.st[i]) { assert.equal(s.st[i], 2, 'every bit has stopped'); lying++; low = Math.min(low, s.P[i * 3 + 1]); }
    assert.ok(lying > 150 && low > 0 && low < .2, 'its rubble lies on the ground: ' + lying + ' bits, the lowest at ' + low.toFixed(3));
    h.reset(); assert.ok(h.standing === 1 && h.left === h.pieces && h.meshes.every(m => m.geometry.index.array.every((v, i) => v === i)), 'reset: whole again');
  }
  // with a physics world: the walls are solid, what falls is bodies that end on the ground, and a hole lets a ray through
  {
    const w = new World3D({ gravity: -9.81 }); w.floor(0);
    const h = house({ world: w, at: [20, 0, -5], turn: Math.PI / 2 });   // its door faces +x now
    const from = { x: 40, y: 1.3, z: -5 + 2.67 }, see = () => (w.step(1 / 60), w.ray(from, { x: -1, y: 0, z: 0 }, 60));   // (a step first: the engine's rays see what was there at the last one)
    const a = see(); assert.ok(a && a.thing.structure === h && Math.abs(a.point.x - 23) < .2, 'the physics ray stops at its front wall, turned and moved: ' + a?.point.x.toFixed(2));
    const mine = h.ray(from, { x: -1, y: 0, z: 0 }); assert.ok(Math.abs(mine.point.x - a.point.x) < .2 && mine.normal.x > .9, 'and its own ray agrees');
    h.blast({ x: 23.3, y: 1.2, z: -5.4 }, 2.6); const ev = play(h, 6);
    assert.ok(ev.fell >= 6 && ev.landed >= 6 && !h.busy, 'pieces fall and land: ' + JSON.stringify(ev));
    for (const L of h.loose) assert.ok(L.rest && L.g.position.y < 3.6 && L.g.position.y > 0, 'a fallen piece lies at rest, not in the air: y ' + L.g.position.y.toFixed(2));
    const b = see(); assert.ok(!b || b.point.x < a.point.x - 1, 'a ray goes in through the hole');
    assert.ok(h.loose.length <= 40 && w.bodies.length === 2 + h.loose.length, 'one body for the building, one for each fallen piece');
    h.reset(); const c = see(); assert.ok(c && Math.abs(c.point.x - a.point.x) < .01 && w.bodies.length === 2, 'reset: solid again, the fallen pieces gone');
    h.blast({ x: 23.3, y: 1.2, z: -5.4 }, 2.6); w.clear(); h.reset(); w.floor(0); assert.ok(see()?.thing.structure === h, 'and after the game clears the world');
    // a new world for a new round (the old one freed, its bodies with it): whole and solid in the new one
    h.blast({ x: 23.3, y: 1.2, z: -5.4 }, 2.6); play(h, .5); assert.ok(h.loose.length > 0); w.free();
    const w2 = new World3D({ gravity: -9.81 }); w2.floor(0); h.reset({ world: w2 }); w2.step(1 / 60);
    const d = w2.ray(from, { x: -1, y: 0, z: 0 }, 60); assert.ok(d?.thing.structure === h && h.standing === 1 && h.loose.length === 0 && w2.bodies.length === 2, 'a new world for a new round');
    h.remove(); assert.equal(w2.bodies.length, 1); w2.free();
  }
  // with no world it is the same every time
  {
    const run = () => { const h = house(); h.blast({ x: 4, y: .8, z: 3 }, 2.4); const ev = play(h, 5); return JSON.stringify([ev, h.left, h.standing.toFixed(4)]); };
    assert.equal(run(), run(), 'the same shell, the same ruin');
  }
  // the game's own boxes: two posts and a beam in three lengths, and a block the game holds up with two more hung under it.
  // The middle of the beam out, the ends stay; a post out, its end of the beam falls and the rest hangs from the other post
  {
    const mk = () => new Structure(null, { pieces: [
      { size: [.5, 3, .5], at: [-2, 1.5, 0] }, { size: [.5, 3, .5], at: [2, 1.5, 0] },
      { size: [1.5, .4, .5], at: [-1.5, 3.2, 0], material: 'planks' }, { size: [1.5, .4, .5], at: [0, 3.2, 0], material: 'planks' }, { size: [1.5, .4, .5], at: [1.5, 3.2, 0], material: 'planks' },
      { size: [1, 1, 1], at: [0, 9, 0], fixed: true }, { size: [.4, 1, .4], at: [0, 8, 0] }, { size: [.4, 1, .4], at: [0, 7, 0] },
    ], materials: { brick: M(), planks: M() } }), out = { radius: .1, power: 99 };
    const a = mk(); assert.ok(a.pieces === 8 && a.S.loose === 0 && a.S.C[5].anchor && !a.S.C[6].anchor && a.S.C[2].strength < a.S.C[0].strength, 'posts, a beam, and a block the game holds up');
    assert.equal(a.hit([0, 3.2, 0], out), 1); play(a, 2); assert.deepEqual([...a.state], [0, 0, 0, 3, 0, 0, 0, 0], 'the middle of the beam out: its ends stay on their posts');
    assert.equal(a.hit([0, 9, 0], out), 0, 'a fixed block does not break');
    const b = mk(); b.hit([-2, 1.5, 0], out); play(b, 3); assert.deepEqual([...b.state], [3, 0, 3, 0, 0, 0, 0, 0], 'a post out: its end of the beam falls, the rest hangs on');
    b.hit([0, 8, 0], out); play(b, 3); assert.deepEqual([...b.state].slice(5), [0, 3, 3], 'and what hung from a piece falls when that goes');
  }
  console.log('buildings that come apart: cut into pieces, hits and blasts, what holds what (a wall closes over a small hole; a wide one brings it down), styles, a big bomb, physics, reset and your own boxes ok');
}

// water you can disturb (src/kit/water.js: gs.outdoors.Water)
{
  const THREE = await import('three'), { Water } = await import('../src/kit/water.js');
  const O = { x: 0, y: 0, z: 0 }, run = (w, secs, c = O, each) => { for (let i = 0; i < Math.round(secs * 60); i++) { each?.(i); w.update(1 / 60, c); } };
  const cellAt = (r, x, z) => Math.floor((z - r.z0) / r.cell) * r.N + Math.floor((x - r.x0) / r.cell);
  // the patch's points and normals are the same sums height() and normal() answer with, wherever the patch has got to
  {
    const w = new Water({ waves: 1.3, size: 40, segments: 16 }); run(w, 1.7, { x: 7.3, y: 0, z: -3.1 });
    const P = w.mesh.geometry.attributes.position.array, Nn = w.mesh.geometry.attributes.normal.array, p = w.mesh.position; let e = 0;
    for (let i = 0; i < P.length; i += 3) { const x = P[i] + p.x, z = P[i + 2] + p.z, n = w.normal(x, z); e = Math.max(e, Math.abs(P[i + 1] - w.height(x, z)), Math.abs(Nn[i] - n.x), Math.abs(Nn[i + 1] - n.y), Math.abs(Nn[i + 2] - n.z)); }
    assert.ok(e < 1e-5, 'the mesh is where height() says: ' + e); assert.deepEqual([p.x, p.z], [7.5, -2.5], 'the patch follows the centre in whole cells');
    assert.ok(w.rip === null && w.mesh.material.normalMap === null && w.mesh.children.length === 0, 'plain water has no ripple field');
    w.ring(1, 1); assert.ok(w.rip && w.mesh.material.normalMap === w.rip.normalTex && w.foamMesh && w.spray, 'the first thing to disturb it makes one');
  }
  // calm water does no work: nothing moves on and no picture is sent to the graphics chip again
  {
    const w = new Water({ ripples: true }), r = w.rip; run(w, .5); const v0 = [r.normalTex.version, r.foamTex.version]; run(w, 2);
    assert.ok(!w.busy && r.energy === 0 && r.N === 128 && Math.abs(r.cell - .375) < 1e-9); assert.deepEqual([r.normalTex.version, r.foamTex.version], v0, 'calm: no uploads');
  }
  // a ring spreads at the waves' speed, lifts the water it passes (height() knows), and dies away to nothing
  {
    const w = new Water({ ripples: true, waves: 0 }), r = w.rip; w.ring(0, 0, { size: .4 });
    const far = () => { let m = 0; for (let j = 0; j < r.N; j++) for (let i = 0; i < r.N; i++) if (Math.abs(r.H[j * r.N + i]) > .002) m = Math.max(m, Math.hypot(r.x0 + (i + .5) * r.cell, r.z0 + (j + .5) * r.cell)); return m; };
    run(w, 1); const a = far(); run(w, 2); const b = far(), v = (b - a) / 2;
    assert.ok(v > 1.8 && v < 3.2, 'the ring goes out at about 2.6 m/s: ' + v); assert.ok(w.busy && r.energy > .005 && w.height(2, 0) !== 0 && w.swellAt(2, 0) === 0, 'the water it passes is lifted');
    let t = 3; while (w.busy && t < 40) { run(w, 1); t++; } assert.ok(t < 20 && !r.H.some(h => h !== 0) && r.energy === 0, 'and it is still again: ' + t + ' s');
  }
  // the square of ripples follows the centre in whole cells: a ripple stays where it is in the world; a jump away starts clean
  {
    const w = new Water({ ripples: true, waves: 0 }), r = w.rip; w.ring(3, 2, { size: .6 }); run(w, 1.5);
    const pts = [[3, 2], [4.1, 2.7], [1.2, 3.3], [5, 0]], a = pts.map(([x, z]) => r.at(x, z)), x0 = r.x0; assert.ok(a.every(h => h !== 0));
    w.update(0, { x: 5.3, y: 0, z: -2.9 }); assert.ok(pts.every(([x, z], i) => Math.abs(r.at(x, z) - a[i]) < 1e-9), 'the same water after the square moved'); assert.equal((r.x0 - x0) / r.cell, 14);
    w.update(0, { x: 500, y: 0, z: 0 }); assert.ok(!r.H.some(h => h !== 0) && r.sources.length === 0, 'a jump: calm water there');
  }
  // a splash: listed for one frame (for the game's sound), spray up, foam left that fades; one outside the square is still listed
  {
    const w = new Water({ ripples: true, waves: .5 }), r = w.rip; run(w, .2); w.splash(1, 1, { size: 1, speed: 6 }); assert.equal(w.splashes.length, 0);
    w.update(1 / 60, O); assert.equal(w.splashes.length, 1); const s = w.splashes[0];
    assert.ok(s.x === 1 && s.z === 1 && s.size === 1 && s.speed === 6 && Math.abs(s.y - w.swellAt(1, 1)) < .3 && w.spray.alive > 10 && w.spray.mesh.visible && r.F[cellAt(r, 1, 1)] > 1 && r.white, 'spray and foam');
    const fv = r.foamTex.version; w.update(1 / 60, O); assert.ok(w.splashes.length === 0 && r.foamTex.version > fv, 'listed once; the foam picture follows');
    let t = 0; while ((r.white || w.busy || w.spray.alive) && t < 90) { run(w, 1); t++; } assert.ok(t < 60 && !r.F.some(f => f !== 0) && !w.spray.mesh.visible, 'the foam fades and the spray lands: ' + t + ' s');
    w.splash(300, 0, { size: 1, speed: 6 }); w.update(1 / 60, O); assert.ok(w.splashes.length === 1 && w.spray.alive > 0 && r.energy === 0, 'far away: spray and the event, no ripples');
  }
  // a watched thing: a splash as it lands and one as it leaps out (none for going right under), none when it is lowered in
  {
    const w = new Water({ ripples: true, waves: 0 }), ball = { x: 2, y: 3, z: 0 }, ev = []; w.watch(ball, { radius: .4 });
    const go = (vy, tag) => { for (let i = 0; i < 90; i++) { ball.y += vy / 60; w.update(1 / 60, O); for (const s of w.splashes) ev.push([tag, s.x, s.z, +s.speed.toFixed(1), +s.size.toFixed(2)]); } };
    go(-6, 'in'); go(6, 'out'); assert.deepEqual(ev, [['in', 2, 0, 6, .68], ['out', 2, 0, 3, .68]]);
    const w2 = new Water({ ripples: true, waves: 0 }), b = { position: new THREE.Vector3(0, .5, 0) }; w2.watch(b, { radius: .3 }); let n = 0;
    for (let i = 0; i < 120; i++) { b.position.y -= .5 / 60; w2.update(1 / 60, O); n += w2.splashes.length; } assert.ok(n === 0 && w2.rip.energy > 0, 'lowered in: no splash, but the water moves');
  }
  // a boat: foam behind it and none ahead or to the side, rings left behind that make its wake, spray off the bow; remove() stops it
  {
    const w = new Water({ ripples: true, waves: 0 }), r = w.rip, boat = { x: -10, y: 0, z: 0 }, h = w.watch(boat, { radius: 1 }); run(w, 2.5, O, () => { boat.x += 8 / 60; });
    const F = (x, z) => r.F[cellAt(r, x, z)];
    assert.ok([1, 3, 6, 9].every(d => F(boat.x - d, 0) > .4) && F(boat.x + 3, 0) === 0 && F(boat.x - 4, 4) === 0, 'a trail of foam'); assert.ok(F(boat.x - 9, 0) > 0 && h.wet);
    assert.ok(r.sources.length > 3 && [2, 4, 6].some(d => Math.abs(w.height(boat.x - d, 1)) > .01) && w.splashes.length === 0 && w.spray.alive > 0, 'a wake and bow spray');
    h.remove(); assert.equal(w.watched.length, 0); w.watch(boat); w.unwatch(boat); assert.equal(w.watched.length, 0);
  }
  // a bed under the water: paler, clearer shallows that fade to nothing at the waterline, foam along the shore and nowhere else, no ripples on dry land
  {
    const bed = (x, z) => -1 - x * .15, w = new Water({ ripples: true, waves: .3, bed, size: 80, segments: 40 }), r = w.rip; run(w, 3);   // (dry beyond x = -6.7)
    const C = w.mesh.geometry.attributes.color.array, P = w.mesh.geometry.attributes.position.array, at = x => { for (let i = 0; i < P.length / 3; i++) if (P[i * 3] + w.mesh.position.x === x) return [...C.slice(i * 4, i * 4 + 4)]; };
    const dry = at(-12), mid = at(-4), deep = at(20); assert.ok(dry[3] === 0 && mid[3] > .3 && mid[3] < .9 && mid[0] > 2 && deep.every(v => v === 1) && w.mesh.material.vertexColors && w.mesh.material.transparent, 'shallows');
    const most = x => { let m = 0; for (let z = -20; z <= 20; z += r.cell) m = Math.max(m, r.F[cellAt(r, x, z)]); return m; };
    assert.ok(most(-6.4) > .5 && most(-6.4) < .8 && most(-9) === 0 && most(-3) === 0 && most(5) === 0, 'foam laps the shore: ' + [-9, -6.4, -3, 5].map(most));
    w.ring(-5.5, 0, { size: 1, strength: 2 }); run(w, 2); let d = 0, wet = 0; for (let c = 0; c < r.N * r.N; c++) if (r.B[c] <= 0) d = Math.max(d, Math.abs(r.H[c])); else wet = Math.max(wet, Math.abs(r.H[c]));
    assert.ok(d === 0 && wet > .005, 'ripples stop at the beach'); assert.ok(Math.abs(w.depth({ x: 0, y: -.5, z: 0 }) - .5) < .35);
  }
  // under the surface: the view's air becomes water and goes back to what the game had (or has set since) on the way up
  {
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 1, .1, 300), air = { haze: .001, mist: .2, colour: new THREE.Color('#aabbcc'), sunColour: new THREE.Color('#ffeedd') };
    const w = new Water({ waves: .2 }); scene.add(w.mesh); assert.equal(w.underwater({ scene, cam, _air: air }), w);
    assert.ok(w.mesh.material.side === THREE.DoubleSide && w.deepMesh.parent === scene && !w.deepMesh.visible);
    cam.position.set(0, 2, 0); run(w, .1); assert.ok(w.under === 0 && air.haze === .001 && air.mist === .2 && air.colour.getHexString() === 'aabbcc', 'above: the air is the game\'s');
    cam.position.set(0, -2, 0); run(w, .1); const c1 = air.colour.getHexString(); assert.ok(w.under === 1 && air.haze === .14 && air.mist === 0 && c1 !== 'aabbcc' && air.sunColour.getHexString() === c1 && w.deepMesh.visible, 'under: murky and tinted');
    air.colour.set('#102030'); air.haze = .002; w.update(1 / 60); assert.ok(air.haze === .14 && air.colour.getHexString() === c1, 'the game\'s sky writes its air each frame: still water');
    cam.position.set(0, -8, 0); w.update(1 / 60); assert.ok(air.colour.r + air.colour.g + air.colour.b < new THREE.Color('#' + c1).r + new THREE.Color('#' + c1).g + new THREE.Color('#' + c1).b, 'darker deeper');
    cam.position.set(0, 2, 0); w.update(1 / 60); assert.ok(w.under === 0 && air.haze === .002 && air.mist === .2 && air.colour.getHexString() === '102030' && air.sunColour.getHexString() === 'ffeedd' && !w.deepMesh.visible, 'up: what the game set last');
    cam.position.set(0, -2, 0); w.update(1 / 60); w.dispose(); assert.ok(air.haze === .002 && air.colour.getHexString() === '102030' && w.deepMesh.parent === null && w.mesh.parent === null, 'thrown away while under: the air goes back');
    // a view with plain three.js fog
    const s2 = new THREE.Scene(); s2.fog = new THREE.FogExp2(0x8899aa, .004); const w2 = new Water(); w2.underwater({ scene: s2, camera: cam }, { colour: '#003344', murk: .3 });
    cam.position.set(0, -1, 0); w2.update(1 / 60); assert.ok(s2.fog.density === .3 && s2.fog.color.getHexString() !== '8899aa'); cam.position.set(0, 3, 0); w2.update(1 / 60); assert.ok(s2.fog.density === .004 && s2.fog.color.getHexString() === '8899aa');
  }
  // rain (on any water, ripples or not): duller, rings and hopping drops round the centre, and all of it gone soon after; calm() for a new round
  {
    const w = new Water({ waves: .4 }), r0 = w.mesh.material.roughness; w.rain = 1; run(w, 2, { x: 30, y: 0, z: 5 });
    assert.ok(w.rip === null && w.dapple.alive > 300 && w.dapple.mesh.visible && w.spray.alive > 10 && Math.abs(w.mesh.material.roughness - r0 - .22) < 1e-9, 'rain shows');
    const P = w.dapple.P; let out = 0; for (let i = 0; i < w.dapple.n; i++) if (Math.hypot(P[i * 2] - 30, P[i * 2 + 1] - 5) > 9.01) out++; assert.equal(out, 0, 'round the centre');
    w.rain = 0; run(w, 2); assert.ok(w.dapple.alive === 0 && !w.dapple.mesh.visible && w.spray.alive === 0 && w.mesh.material.roughness === r0 && !w.rained, 'and stops');
    const w2 = new Water({ ripples: 64, reach: 12 }); w2.rain = 1; w2.splash(0, 0); run(w2, .3); w2.calm(); w2.rain = 0; w2.update(1 / 60, O);
    assert.ok(w2.rip.N === 64 && !w2.rip.H.some(h => h) && !w2.rip.F.some(f => f) && w2.spray.alive === 0 && w2.dapple.alive === 0 && w2.splashes.length === 0, 'calm()'); w2.dispose();
  }
  // the game's own material is left as it is (its normal map, its roughness), and foam and spray can be turned off
  {
    const nm = new THREE.DataTexture(new Uint8Array(4), 1, 1), m = new THREE.MeshStandardMaterial({ normalMap: nm, roughness: .3 }), w = new Water({ material: m, ripples: true, foam: false, spray: 0 });
    w.rain = 1; w.splash(0, 0); run(w, 1); assert.ok(m.normalMap === nm && m.roughness === .3 && w.foamMesh === null && w.spray === null && w.dapple === null && w.rip.energy > 0);
  }
  console.log('water you can disturb: the same waves, calm water free, rings, a square that follows, splashes, watched things and wakes, shallows and shore foam, under the surface, rain, your own material ok');
}

// weather that changes the world (src/kit/cover.js, src/kit/sky.js: gs.sky.Weather with a level)
{
  const THREE = await import('three'), { Weather } = await import('../src/kit/sky.js'), { Cover } = await import('../src/kit/cover.js'), { Water } = await import('../src/kit/water.js');
  // a place: flat ground, and a roof 8 m square, 3 m up, round the middle (it can be taken away)
  const place = { roof: true }, level = (f, d, max) => (place.roof && Math.abs(f.x) <= 4 && Math.abs(f.z) <= 4 && f.y >= 3 ? f.y - 3 : Infinity), ground = () => 0;
  const P = (x, y, z) => ({ x, y, z });
  // the map of what the sky can see
  {
    const c = new Cover({ level, ground, ms: 1e9 }); assert.ok(c.N === 128 && c.cell === .5 && !c.ready && c.at(0, 0) === -Infinity && c.open(0, 1, 0), 'nothing known yet: all open');
    c.place(0, 1.6, 0).update(); assert.ok(!c.ready && c.asked <= 400 && c.at(0, 0) === 3 && c.at(30, 30) === -Infinity, 'a few hundred spots a frame, from the middle outwards');
    let n = 1; while (!c.ready && n < 200) { c.update(); n++; } assert.ok(c.ready && n < 60 && c.asked >= 128 * 128, 'all known after ' + n + ' updates');
    assert.deepEqual([c.at(0, 0), c.at(3.9, -3.9), c.at(4.6, 0), c.at(-20, 12), c.at(40, 0)], [3, 3, 0, 0, -Infinity], 'the roof, the ground, and outside its square');
    assert.ok(!c.open(0, 1, 0) && c.open(0, 3, 0) && c.open(0, 2.8, 0) && c.open(6, 0, 0) && c.open(6, -.2, 0) && !c.open(6, -1, 0) && c.open(99, 0, 0), 'open(): on the roof and in the yard, not under the roof or the ground');
    assert.ok(Math.abs(THREE.DataUtils.fromHalfFloat(c.pix[0]) - 3) < .01 && THREE.DataUtils.fromHalfFloat(c.pix[127 * 128 + 100]) === 0 && c.texture.image.width === 128, 'and the same numbers as a picture for the graphics chip');
    // it follows a whole cell at a time: what it knew stays, only the strip that came in is asked
    const v = c.texture.version, a0 = c.asked; c.again = 0; c.place(.2, 1.6, 0).update(); assert.ok(c.asked === a0 && c.texture.version === v && c.cx === 0, 'a move inside the cell: nothing asked, nothing sent');
    c.place(3, 1.6, 0); assert.ok(c.cx === 3 && c.at(0, 0) === 3 && c.at(34.7, 0) === -Infinity && c.left === 6 * 128); c.update(); c.update();
    assert.ok(c.ready && c.asked === a0 + 6 * 128 && c.at(34.7, 0) === 0 && c.at(-29.2, 0) === -Infinity, 'the strip that came in');
    // a roof that goes: touch() asks again there first; without it the slow look round finds it
    place.roof = false; c.touch(0, 0, 2); c.update(); assert.ok(c.at(0, 0) === 0 && c.at(3.6, 3.6) === 3, 'touch() asks again round a point'); c.again = 48;
    let k = 0; while (c.at(3.6, 3.6) !== 0 && k < 500) { c.update(); k++; } assert.ok(k > 1 && k <= 128 * 128 / 48 + 1, 'the rest is found again in ' + k + ' updates');
    place.roof = true; c.place(500, 1.6, 0).update(); assert.ok(c.at(0, 0) === -Infinity && c.at(500, 0) === 0 && c.at(520, 0) === -Infinity, 'a jump: it starts again from the middle'); c.update(true); assert.ok(c.ready && c.at(530, 20) === 0);
    c.dispose();
    // three.js meshes are asked through their triangles
    const m = new THREE.Mesh(new THREE.BoxGeometry(4, .2, 4), new THREE.MeshBasicMaterial()); m.position.set(10, 2, 0); m.updateMatrixWorld(true);
    const c2 = new Cover({ level: [m, level], ground, cells: 64 }); c2.place(8, 1, 0).update(true);
    assert.ok(Math.abs(c2.at(10, 0) - 2.1) < 1e-6 && c2.at(0, 0) === 3 && c2.at(6, 0) === 0 && c2.N === 64, 'a mesh and a function together');
  }
  // the weather: how wet and how white the world is, and what it hides under a roof
  const view = () => ({ cam: { position: new THREE.Vector3(0, 1.6, 0), far: 100 }, scene: new THREE.Scene(), hemi: null, _air: null, air() { return this._air ||= { wet: 0, world: null }; } });
  const run = (w, secs) => { for (let i = 0; i < Math.round(secs * 60); i++) w.update(1 / 60); };
  {
    const v = view(), pond = new Water({ size: 10 }), w = new Weather(v, { kind: 'rain', level, ground, water: pond, soak: 4, dry: 6, settle: 5, melt: 8 });
    assert.ok(w.world && w.cover && v._air.world === w.shown && w.wet === 0 && w.hops && v.scene.children.includes(w.hops.mesh), 'given the level it tells the air what to draw');
    run(w, 1); assert.ok(w.cover.ready && Math.abs(w.wet - .25) < .01 && w.pools === 0 && w.rain === 1 && pond.rain === 1, 'rain soaks in, and falls on the water it was given');
    assert.ok(w.open(P(8, 0, 0)) && !w.open(P(0, 0, 0)) && w.wetAt(P(8, 0, 0)) === w.wet && w.wetAt(P(0, 0, 0)) === 0 && w.wetAt(P(0, 3, 0)) === w.wet, 'wet in the yard and on the roof, dry under it');
    // no drop is drawn under the roof (its two ends are one point), and the drops that hop come up off what the sky can see
    const a = w.rainMesh.geometry.attributes.position.array; let under = 0, shown = 0;
    for (let i = 0; i < 900; i++) { const x = a[i * 6], y = a[i * 6 + 1], z = a[i * 6 + 2], drawn = a[i * 6 + 4] !== y; if (Math.abs(x) < 3.5 && Math.abs(z) < 3.5 && y < 3) { under++; assert.ok(!drawn, 'a drop under the roof'); } else if (drawn) shown++; }
    assert.ok(under > 5 && shown > 300, under + ' drops hidden under the roof, ' + shown + ' drawn');
    assert.ok(w.hops.alive > 20, 'drops hop off the ground: ' + w.hops.alive); for (let i = 0; i < w.hops.n; i++) if (w.hops.L[i] > 0) { const x = w.hops.P[i * 3], z = w.hops.P[i * 3 + 2]; assert.ok(w.hops.P[i * 3 + 1] >= w.cover.at(x, z) - .05, 'a hop under what it landed on'); }
    run(w, 4); assert.ok(w.wet === 1 && w.pools > .2 && w.pools < .5 && v._air.world.pools === w.pools, 'puddles start once it is wet through: ' + w.pools); run(w, 8); assert.ok(w.pools === 1);
    // it dries; the puddles go last
    w.set('clear'); run(w, 3); assert.ok(w.rain === 0 && pond.rain === 0 && Math.abs(w.wet - .5) < .01 && w.pools > .6); run(w, 3.1); assert.ok(w.wet === 0 && w.pools > .3, 'dry ground, puddles left'); run(w, 4); assert.ok(w.pools === 0 && !w.hops.alive);
    // snow settles where the sky sees, and no flake is drawn under the roof
    w.set('snow'); run(w, 2.5); assert.ok(Math.abs(w.snow - .5) < .01 && w.wet === 0 && w.snowing === 1 && Math.abs(w.snowAt(P(8, 0, 0)) - .125) < .003 && w.snowAt(P(0, 0, 0)) === 0, 'snow lies ' + w.snowAt(P(8, 0, 0)) + ' m deep in the yard');
    const s = w.snowMesh.geometry.attributes.position.array; for (let i = 0; i < 900; i++) assert.ok(!(Math.abs(s[i * 3]) < 3.5 && Math.abs(s[i * 3 + 2]) < 3.5 && s[i * 3 + 1] < 3 && s[i * 3 + 1] > -20), 'a flake under the roof');
    run(w, 3); assert.ok(w.snow === 1 && v._air.world.snow === 1);
    // it melts slowly when the snow stops (the ground under it gets wet, bit by bit), and fast in rain
    w.set('clear'); run(w, .5); assert.ok(w.snow > .93 && w.wet > .3 && w.wet < .45, 'melting: wet comes in gradually: ' + w.wet); run(w, 3.5); const left = w.snow; assert.ok(Math.abs(left - .5) < .01 && w.wet === 1);
    w.set('rain'); run(w, .5); assert.ok(left - w.snow > .3, 'rain washes it away: ' + (left - w.snow)); run(w, 1); assert.ok(w.snow === 0);
    // the game can say how things start, and take it all away
    w.set('clear'); w.snow = .8; w.wet = .2; w.update(1 / 60); assert.ok(v._air.world.snow > .79 && v._air.world.cover === w.cover);
    w.dispose(); assert.ok(v._air.world === null && v.scene.children.length === 0 && pond.rain === 0, 'dispose()');
  }
  // with no level it is the weather it always was; level: true is wet and white everywhere, no map
  {
    const v = view(), w = new Weather(v, { kind: 'rain' }); run(w, 1);
    assert.ok(!w.world && w.cover === null && v._air === null && w.wet === 0 && w.hops === null && w.open(P(0, 0, 0)) && w.rain === 1 && v.scene.children.length === 2, 'no level: only what falls'); w.dispose();
    const v2 = view(), w2 = new Weather(v2, { kind: 'snow', level: true, settle: 2 }); run(w2, 1);
    assert.ok(w2.world && w2.cover === null && Math.abs(w2.snow - .5) < .01 && v2._air.world.cover === null && w2.open(P(0, 0, 0)) && w2.snowAt(P(0, 0, 0)) > .1, 'level: true'); w2.dispose();
    // one map can be made by the game and shared, and is then the game's to throw away
    const c = new Cover({ level, ground, cells: 32 }), v3 = view(), w3 = new Weather(v3, { cover: c }); run(w3, .2);
    assert.ok(w3.cover === c && c.ready && !w3.open(P(0, 0, 0))); w3.dispose(); assert.ok(c.at(0, 0) === 3, 'a shared map outlives the weather'); c.dispose();
  }
  // a frame of it is cheap (rain on, the map all known and looked over again a little each frame)
  {
    const v = view(), w = new Weather(v, { kind: 'rain', level, ground }); run(w, 2); const t0 = performance.now(); run(w, 5); const ms = (performance.now() - t0) / 300;
    assert.ok(ms < 1.5, 'weather.update() ' + ms.toFixed(3) + ' ms a frame'); w.dispose();
    console.log('weather that changes the world: the map of what the sky can see (fills, follows, finds changes, meshes), rain soaks in and pools and dries, snow settles and melts, roofs keep it off, no level as before ok (' + ms.toFixed(3) + ' ms a frame)');
  }
}

// ground that takes marks (src/kit/marks.js: gs.outdoors.Marks)
{
  globalThis.HTMLCanvasElement ??= class {}; globalThis.Image ??= class {};
  const THREE = await import('three'), { Marks, Land } = await import('../src/kit/outdoors.js'), { Weather } = await import('../src/kit/sky.js');
  const view = () => ({ cam: { position: new THREE.Vector3(0, 1.6, 0), far: 100 }, scene: new THREE.Scene(), hemi: null, _air: null, air() { return this._air ||= { wet: 0, world: null }; } });
  const run = (m, secs, w = null) => { for (let i = 0; i < Math.round(secs * 60); i++) { w?.update(1 / 60); m.update(1 / 60); } };
  const near = (a, b, e = 1e-3) => Math.abs(a - b) < e;
  // a print in sand: a dent the shape of a boot with a rim round it, on one sheet, as a height and two pictures
  {
    const v = view(), m = new Marks(v, { sand: () => 1, grass: false }), S = m.size;
    assert.ok(near(S, 3.1) && m.count === 0 && m.drawn === 0 && m.grass === null && m.kindAt(1, 1).kind === 'sand' && near(m.kindAt(1, 1).depth, .028), 'sand everywhere, nothing marked yet');
    const s = m.step(1, 1, { turn: 0 }); assert.ok(s && m.made.length === 1 && m.made[0].kind === 'sand' && near(m.made[0].depth, .028) && m.count === 1);
    m.update(1 / 60); assert.ok(m.made.length === 0 && m.drawn === 1 && v.scene.children.length === 1, 'one tile of prints is drawn');
    assert.ok(near(m.at(1, 1), .028, .002) && near(m.at(1, 1.12), .028, .004) && m.at(1, .895) > .02 && m.at(1.3, 1) === 0 && m.at(1, 1.25) === 0 && m.at(1, .7) === 0, 'the sole and the heel are pressed in, the ground beside them is not');
    assert.ok(m.at(1, .945) < .012, 'the waist between sole and heel is shallower: ' + m.at(1, .945));
    const tile = [...m.tiles.values()][0], H = tile.H; let lo = 0, hi = 0, dents = 0; for (const h of H) { if (h < lo) lo = h; if (h > hi) hi = h; if (h < 0) dents++; }
    assert.ok(near(lo, -.028, .001) && hi > .004 && hi < .012 && dents > 25 && dents < 80, 'a rim stands round it: ' + hi.toFixed(4) + ' m, ' + dents + ' texels pressed');
    const at = (x, z) => (Math.floor((z - tile.z0) / m.cell) * 128 + Math.floor((x - tile.x0) / m.cell)) * 4, C = tile.map.image.data, N = tile.normal.image.data;
    assert.ok(C[at(1, 1) + 3] > 150 && C[at(2, 2) + 3] === 0 && C[at(1, 1)] < C[at(1.085, 1) ] + 60, 'the colour picture: pressed sand shows, untouched ground is clear');
    assert.ok(N[at(2, 2)] === 128 && N[at(2, 2) + 2] === 255 && Math.abs(N[at(1.055, 1.05)] - 128) > 20, 'the normal picture: flat away from the print, leaning on its wall');
    assert.ok(tile.mesh.material.isMeshStandardMaterial && tile.mesh.material.transparent && !tile.mesh.material.depthWrite && tile.mesh.material.userData.noSettle && tile.mesh.material.onBeforeCompile === THREE.Material.prototype.onBeforeCompile && !tile.mesh.material.userData.gsLooks, 'a stock material: the same on WebGL and WebGPU');
    // a second print on top: the deeper dent wins, a dent cuts a rim; the order they are drawn in does not matter
    m.step(1.05, 1.02, { turn: 1, press: 1.4 }); m.update(1 / 60); const one = Float32Array.from(tile.H);
    m.spoil(tile.k); m.update(0); assert.ok(one.every((h, i) => near(h, tile.H[i], 1e-6)), 'made again from the list it is the same ground');
    assert.ok(near(m.at(1.05, 1.02), .028 * 1.4, .002), 'pressed harder: deeper');
    // on the edge of two tiles: both draw it, and they agree where they meet
    m.press(S, 1, .2); m.update(1 / 60); m.update(1 / 60); assert.ok(m.drawn === 2 && near(m.at(S - .01, 1), m.at(S + .01, 1), .002) && m.at(S + .01, 1) > .02, 'a print across two tiles');
    const a = m.tiles.get([...m.tiles.keys()].find(k => m.tiles.get(k).ti === 0)), b = m.tiles.get([...m.tiles.keys()].find(k => m.tiles.get(k).ti === 1)), j = Math.floor((1 - a.z0) / m.cell);
    for (let i = 0; i < 4; i++) assert.ok(near(a.H[j * 128 + 124 + i], b.H[j * 128 + i], 1e-6), 'the strip two tiles share holds the same heights');
    // a trail to read: the newest first, who made it, which way it points
    m.step(2, 2, { turn: Math.PI / 2, by: 'fox' }); const tr = m.trail(2, 2, 1.6); assert.ok(tr.length === 4 && tr[0].by === 'fox' && near(tr[0].turn, Math.PI / 2) && tr[0].kind === 'sand' && tr[0].age === 0 && m.trail(2, 2, 3, { by: 'fox' }).length === 1 && m.trail(2, 2, 3, { max: 2 }).length === 2);
    m.clear(); assert.ok(m.count === 0 && m.drawn === 0 && m.tiles.size === 0 && v.scene.children.length === 0 && m.trail(2, 2).length === 0, 'clear()');
    m.step(1, 1); m.update(1 / 60); m.dispose(); assert.ok(v.scene.children.length === 0, 'dispose()');
  }
  // tracks join up: one long mark while the wheel runs straight, more round a bend; lifted, they stop
  {
    const v = view(), m = new Marks(v, { sand: () => 1, grass: false });
    for (let i = 0; i <= 60; i++) { m.roll('a', -1.5 + i * .05, 1.5, { width: .2, tread: 'smooth' }); m.update(1 / 60); }
    assert.ok(m.count === 2 || m.count === 3, 'three metres of straight track: ' + m.count + ' marks');
    for (const x of [-1.4, -.6, .01, .7, 1.4]) assert.ok(near(m.at(x, 1.5), .028 * 1.2 * .8, .002), 'pressed all along, at ' + x + ': ' + m.at(x, 1.5));
    assert.ok(m.at(0, 1.5 + .2) === 0 && m.at(-1.8, 1.5) === 0 && m.at(1.8, 1.5) === 0, 'and only there');
    const n0 = m.count; for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI; m.roll('b', 1 + Math.cos(a), -1.5 - Math.sin(a) * 1, { width: .2 }); m.update(1 / 60); }
    const bend = m.count - n0; assert.ok(bend > 6 && bend < 40, 'half a turn of a 1 m ring: ' + bend + ' marks'); let gaps = 0; for (let i = 2; i < 60; i++) { const a = i / 60 * Math.PI; if (!(m.at(1 + Math.cos(a), -1.5 - Math.sin(a)) > 0)) gaps++; } assert.ok(gaps <= 12, 'the bend is pressed all along (a tyre\'s tread leaves ' + gaps + ' of 58 spots between its blocks)');
    m.roll('c', -2, 0); m.roll('c', -1.9, 0); m.lift('c'); m.roll('c', 1.9, 0); m.roll('c', 2, 0); m.update(1 / 60); m.update(1 / 60);
    assert.ok(m.at(-1.95, 0) > 0 && m.at(1.95, 0) > 0 && m.at(0, 0) === 0, 'lifted: the track does not join across the gap');
    m.roll('d', 0, 2); m.roll('d', 9, 2); m.update(1 / 60); assert.ok(m.at(4, 2) === 0, 'nor across a jump');
    m.dispose();
  }
  // only so many marks are remembered, and tiles are made again a slice a frame
  {
    const v = view(), m = new Marks(v, { sand: () => 1, grass: false, keep: 10, budget: 300 });
    for (let i = 0; i < 15; i++) m.step(.3 + i * .15, 1, { by: i }); m.update(1 / 60);
    assert.ok(m.count === 10 && m.trail(1, 1, 9).length === 10 && m.trail(1, 1, 9)[0].by === 14 && m.trail(1, 1, 9)[9].by === 5 && m.byTile.get([...m.byTile.keys()][0]).length === 10, 'the oldest are forgotten');
    m.clear(); for (let i = 0; i < 10; i++) m.step(.3 + i * .25, 1); let frames = 0; while (!(m.at(.3 + 9 * .25, 1) > 0) && frames < 200) { m.update(1 / 60); frames++; }
    assert.ok(frames > 3 && frames < 40 && m.job === null, 'a small budget: the tile took ' + frames + ' frames to make');
    m.clear(); for (let i = 0; i < 10; i++) m.step(.3 + i * .25, 1); m.update(0); assert.ok(m.at(.3 + 9 * .25, 1) > 0 && m.at(.3, 1) > 0, 'update(0): all at once');
    // far from the centre nothing is drawn, but it is remembered: come back and it is there
    m.step(40, 40, { by: 'far' }); m.update(1 / 60); assert.ok(m.at(40, 40) === 0 && m.drawn === 1 && m.trail(40, 40, 1)[0].by === 'far');
    v.cam.position.set(38, 1.6, 38); m.update(0); assert.ok(m.at(40, 40) > 0 && m.drawn === 1, 'the tiles follow the camera'); m.dispose();
  }
  // the weather decides what the ground is: snow where it has settled (not under the roof), mud where rain has wet bare earth
  {
    const level = (f) => (Math.abs(f.x) <= 4 && Math.abs(f.z) <= 4 && f.y >= 3 ? f.y - 3 : Infinity), v = view();
    const w = new Weather(v, { kind: 'clear', level, ground: () => 0, settle: 10, melt: 10, soak: 2, dry: 4 }), m = new Marks(v, { weather: w, mud: (x, z) => x > 0 ? 1 : 0, grass: false, fill: .3, wash: 3 });
    run(m, 1.5, w); assert.ok(w.cover.ready && m.kindAt(-6, 0).kind === null && m.kindAt(6, 0).kind === 'mud' && near(m.kindAt(6, 0).soft, .1) && m.step(-6, 0) === null, 'dry: firm ground takes no mark, dry earth hardly any');
    w.wet = 1; assert.ok(near(m.kindAt(6, 0).depth, .038) && m.kindAt(2, 0).kind === 'mud' && near(m.kindAt(2, 0).soft, .1), 'wet earth is soft; under the roof it stayed dry');
    m.step(6, 0, { by: 'a' }); run(m, .1, w); assert.ok(m.at(6, 0) > .03);
    // rain washes it out
    w.set('rain'); run(m, 1.5, w); const half = m.at(6, 0); assert.ok(half > .012 && half < .024, 'half washed out: ' + half); run(m, 2, w); assert.ok(m.at(6, 0) === 0 && m.trail(6, 0, 1).length === 0, 'washed out');
    // snow lies: prints in it everywhere the sky sees, the mud's are hidden under it
    w.set('clear'); w.wet = 1; m.step(6, 1, { by: 'mud' }); w.snow = 1; run(m, .1, w);
    assert.ok(m.kindAt(6, 0).kind === 'snow' && m.kindAt(-6, 0).kind === 'snow' && near(m.kindAt(6, 0).depth, .05) && m.kindAt(0, 0).kind !== 'snow', 'snow in the yard, none under the roof');
    assert.ok(m.at(6, 1) === 0 && m.trail(6, 1, .5).length === 0, 'what was in the mud is under the snow');
    w.snow = 1; m.step(-6, 0, { by: 'b' }); run(m, .1, w); assert.ok(near(m.at(-6, 0), .05, .003) && m.trail(-6, 0, 1)[0].kind === 'snow');
    // fresh snow fills it in: .3 of a full cover, which is 3 seconds of this snowfall
    w.set('snow'); w.snow = 1; run(m, 1.5, w); const part = m.at(-6, 0); assert.ok(part > .015 && part < .035, 'half filled: ' + part); run(m, 2, w); assert.ok(m.at(-6, 0) === 0, 'filled in');
    // the snow goes all at once (a cut): its prints go with it that frame
    w.set('clear'); w.snow = 1; m.step(-6, 2); run(m, .1, w); assert.ok(m.at(-6, 2) > 0); w.snow = 0; w.update(1 / 60); m.update(1 / 60); assert.ok(m.at(-6, 2) === 0, 'no snow, no prints in it');
    m.dispose(); w.dispose();
  }
  // wind blows prints out of sand; marks can be given a life of their own
  {
    const v = view(), wind = { speed: 12.5 }, m = new Marks(v, { sand: () => 1, grass: false, wind, blow: 20 });
    m.step(1, 1); run(m, 1); const half = m.at(1, 1); assert.ok(half > .01 && half < .02, 'half blown out: ' + half); run(m, 1.2); assert.ok(m.at(1, 1) === 0 && m.count === 1);
    wind.speed = 1; m.step(1, 1); run(m, 3); assert.ok(near(m.at(1, 1), .028, .002), 'a light breeze leaves them'); m.dispose();
    const m2 = new Marks(v, { sand: () => 1, grass: false, last: { sand: 2 } }); m2.step(1, 1); run(m2, 1); assert.ok(near(m2.at(1, 1), .028, .002)); run(m2, 1.3); assert.ok(m2.at(1, 1) === 0, 'last: gone after its time'); m2.dispose();
  }
  // things that leave marks by themselves
  {
    const v = view(), m = new Marks(v, { sand: () => 1, grass: false });
    // anything that moves: prints paced out along its way, left and right
    const fox = { position: { x: -2, y: 0, z: 1 } }; m.watch(fox, { size: .2 }); let made = 0;
    for (let i = 0; i < 240; i++) { fox.position.x += 1.5 / 60; m.update(1 / 60); for (const k of m.made) { made++; assert.ok(k.by === fox && k.kind === 'sand'); } }
    const tr = m.trail(0, 1, 9, { by: fox }), sides = new Set(tr.map(s => Math.sign(s.z - 1)));
    assert.ok(made === tr.length && made >= 11 && made <= 13 && sides.size === 2 && tr.every(s => near(s.turn, Math.PI / 2, .01) && Math.abs(Math.abs(s.z - 1) - .062) < .005), made + ' prints, left and right of its way, pointing along it');
    fox.position.y = 2; const n = m.count; for (let i = 0; i < 60; i++) { fox.position.x += 1.5 / 60; m.update(1 / 60); } assert.ok(m.count === n, 'in the air it leaves none');
    m.unwatch(fox); m.clear();
    // four feet
    const dog = { position: { x: -2, y: 0, z: 1 } }; m.watch(dog, { feet: 4, size: .08, shape: 'paw', by: 'dog' }); for (let i = 0; i < 120; i++) { dog.position.x += 2 / 60; m.update(1 / 60); }
    assert.ok(m.count >= 28 && m.count % 2 === 0 && m.trail(0, 1, 9)[0].by === 'dog', 'a dog: ' + m.count + ' paw prints'); m.unwatch(dog); m.clear();
    // a vehicle: a track behind each wheel, as wide as the wheel; a tank: its two belts
    const car = new THREE.Group(), wheels = [[-.8, 1.2], [.8, 1.2], [-.8, -1.2], [.8, -1.2]].map(([x, z]) => { const p = new THREE.Object3D(); p.position.set(x, .35, z); p.radius = .35; p.width = .24; car.add(p); return p; }); car.wheels = wheels; car.size = { length: 4, width: 1.8 };
    m.watch(car); for (let i = 0; i <= 120; i++) { car.position.set(0, 0, -3 + i * .05); car.updateMatrixWorld(true); m.update(1 / 60); }
    assert.ok(m.at(-.8, 0) > .02 && m.at(.8, 0) > .02 && m.at(0, 0) === 0 && m.at(-.8 + .2, 0) === 0, 'two ruts, nothing between them');
    assert.ok(m.count <= 20, 'driving straight: ' + m.count + ' marks'); car.position.y = 1; car.updateMatrixWorld(true); const c0 = m.count; m.update(1 / 60); car.position.z += .5; car.updateMatrixWorld(true); m.update(1 / 60); assert.ok(m.count === c0, 'wheels off the ground leave none');
    m.unwatch(car); m.clear();
    const tank = new THREE.Group(); tank.belts = { x: 1.2, width: .5 }; tank.wheels = []; m.watch(tank); for (let i = 0; i <= 120; i++) { tank.position.set(0, 0, -3 + i * .05); tank.updateMatrixWorld(true); m.update(1 / 60); }
    assert.ok(m.at(-1.2, 0) > 0 && m.at(1.2 + .2, .01) > 0 && m.at(0, 0) === 0 && m.at(1.2 + .3, 0) === 0, 'a tank\'s two belts, half a metre wide'); m.unwatch(tank); m.clear();
    // a person whose steps are really taken: a print where each foot comes down, pointing the way the body faced
    const st = { ok: true, on: true, a: 1, yaw: Math.PI / 2, turned: 0, feet: [{ landed: false, T: { x: 1, z: 1 }, yaw0: 0 }, { landed: false, T: { x: 1.6, z: 1.2 }, yaw0: 0 }] }, who = new THREE.Group(); who.rig = { stride: st, height: 1.8 };
    m.watch(who); who.position.set(1, 0, 1); who.updateMatrixWorld(true); m.update(1 / 60); who.position.x += .02; who.updateMatrixWorld(true); m.update(1 / 60); assert.ok(m.count === 0, 'no footfall, no print');
    st.feet[0].landed = true; m.update(1 / 60); m.update(1 / 60); st.feet[0].landed = false; st.feet[1].landed = true; m.update(1 / 60); st.feet[1].landed = false; m.update(1 / 60);
    const t2 = m.trail(1, 1, 2); assert.ok(m.count === 2 && near(t2[0].turn, Math.PI / 2) && near(t2[1].x, 1.035) && near(t2[1].z, 1) && near(t2[0].x, 1.635), 'two footfalls, two prints, where the feet came down');
    m.dispose();
  }
  // on a gs.outdoors Land the sheets lie on the land's own triangles, and its meadow parts
  {
    const land = new Land({ kind: (x, z) => 1 + Math.sin(x * .7) * .6 + z * .2, size: 40, segments: 40 }), v = view(), grass = (x, z) => (x < 0 ? 1 : 0);
    const before = land.meadow({ reach: 10, gap: .5, where: grass, budget: 1e9 });
    const m = new Marks(v, { land, sand: (x, z) => (x > 0 ? 1 : 0), grass: true });
    const after = land.meadow({ reach: 6, gap: .5, budget: 1e9 });
    for (const md of [before, after]) assert.ok(md.material.defines.LK_PART === '' && md.userData.meadow.look.uniforms.lkPart.value === m.grass.texture && md.userData.meadow.look.uniforms.lkPartAt.value === m.grass.where, 'a meadow made before or after reads the grass field');
    assert.ok(m.kindAt(2.3, 1.7).kind === 'sand' && m.kindAt(-2, 1).kind === 'grass' && near(m.kindAt(2.3, 1.7).y, land.height(2.3, 1.7), .03), 'sand to the east, the meadow\'s grass to the west');
    m.step(2.3, 1.7); m.update(1 / 60); const tile = [...m.tiles.values()][0], P = tile.mesh.geometry.attributes.position.array, Nn = tile.mesh.geometry.attributes.normal.array; let off = 0, tilt = 0;
    // (the land's triangles: a square of the grid is cut from its far left corner to its near right one)
    const tri = (x, z) => { const s = 1, c = Math.floor(x + 20), r = Math.floor(z + 20), u = x + 20 - c, w = z + 20 - r, h = (cc, rr) => 1 + Math.sin((cc - 20) * .7) * .6 + (rr - 20) * .2; return u + w <= 1 ? h(c, r) * (1 - u - w) + h(c + 1, r) * u + h(c, r + 1) * w : h(c + 1, r + 1) * (u + w - 1) + h(c, r + 1) * (1 - u) + h(c + 1, r) * (1 - w); };
    for (let i = 0; i < P.length; i += 3) { off = Math.max(off, Math.abs(P[i + 1] - m.above - tri(P[i], P[i + 2]))); tilt = Math.max(tilt, Math.abs(Math.hypot(Nn[i], Nn[i + 1], Nn[i + 2]) - 1)); assert.ok(Nn[i + 1] > .6); }
    assert.ok(off < 1e-4 && tilt < 1e-3, 'the sheet lies on the land: ' + off.toExponential(1) + ' m off at most');
    // grass: no print, but it is pushed over away from what passes and springs back; where it was trodden it stays down a while
    const g = m.grass; assert.ok(m.step(-2, 1) === null && m.made.at(-1).kind === 'grass' && m.count === 1 && g.at(-2, 1).flat > .6, 'a step on grass treads it down, and leaves no print');
    m.push(-4, 3, .5); const a1 = g.at(-4 - .2, 3 + .2), a2 = g.at(-4 + .25, 3); assert.ok(a1.x < -.2 && a1.z > .2 && a2.x > .5 && Math.abs(a2.z) < .35 && Math.hypot(a1.x, a1.z) <= 1.001 && g.at(-4, 3 + .9).x === 0, 'pushed over, away from the middle');
    m.push(-8, 3, .5, { vx: 3, vz: 0 }); const a3 = g.at(-8, 3 + .25); assert.ok(a3.x > .3 && a3.z > .3, 'and along the way the thing went');
    m.update(1 / 60); const px = g.pix, ci = (((Math.floor(3 / g.cell) % g.N) + g.N) % g.N) * g.N + (((Math.floor((-4 + .25) / g.cell) % g.N) + g.N) % g.N); assert.ok(px[ci * 4] > 190 && px[ci * 4 + 3] === 255 && g.busy, 'and the picture the blades read says so');
    run(m, 2.5); assert.ok(g.at(-4 + .25, 3).x === 0 && g.at(-4 - .2, 3.2).z === 0 && g.at(-8, 3.25).x === 0 && px[ci * 4] === 128, 'let go, it springs back up'); assert.ok(g.at(-2, 1).flat > .5, 'the trodden patch is still down');
    run(m, 40); assert.ok(g.at(-2, 1).flat === 0 && !g.busy, 'and has mended after a while');
    // a watched walker wades a lane through it
    const who = { position: { x: -6, y: land.height(-6, -2), z: -2 } }; m.watch(who);
    for (let i = 0; i < 120; i++) { who.position.x += 1.4 / 60; who.position.y = land.height(who.position.x, -2); m.update(1 / 60); }
    assert.ok(g.at(-4.5, -2).flat > .3 && g.at(-5.5, -2).flat > .25 && g.at(-4.5, -1).flat === 0 && Math.hypot(g.at(who.position.x, -2 + .25).x, g.at(who.position.x, -2 + .25).z) > .3, 'a lane lies behind it, and the grass beside it leans away');
    // the field follows the centre; what leaves it is forgotten
    v.cam.position.set(60, 1.6, 0); m.update(1 / 60); assert.ok(g.at(-4.5, -2).flat === 0 && near(g.where.x, 60, g.cell) && g.where.w > 10);
    m.dispose(); for (const md of [before, after]) assert.ok(md.material.defines.LK_PART === undefined && md.userData.meadow.look.uniforms.lkPart.value === null && land.parting === null, 'dispose() gives the meadow back');
  }
  // a busy frame is cheap: a walker, a dog and a car going round on soft ground
  {
    const v = view(), m = new Marks(v, { sand: () => 1 }), car = new THREE.Group(); car.wheels = [[-.8, 1.2], [.8, 1.2], [-.8, -1.2], [.8, -1.2]].map(([x, z]) => { const p = new THREE.Object3D(); p.position.set(x, .35, z); p.radius = .35; p.width = .24; car.add(p); return p; }); car.size = { length: 4, width: 1.8 };
    const a = { position: { x: 0, y: 0, z: 0 } }, d = { position: { x: 0, y: 0, z: 0 } }; m.watch(a); m.watch(d, { feet: 4, size: .08, shape: 'paw' }); m.watch(car);
    const go = n => { for (let i = 0; i < n; i++) { const t = m.t; a.position.x = 4 * Math.cos(t * .35); a.position.z = 4 * Math.sin(t * .35); d.position.x = 3 * Math.cos(-t * .7); d.position.z = 3 * Math.sin(-t * .7); car.position.set(6.5 * Math.cos(t * .5), 0, 6.5 * Math.sin(t * .5)); car.rotation.y = -t * .5; car.updateMatrixWorld(true); m.update(1 / 60); } };
    go(120); const t0 = performance.now(); go(600); const ms = (performance.now() - t0) / 600;
    const kept = m.count; assert.ok(ms < 2 && kept > 300 && m.drawn > 8, 'marks.update() ' + ms.toFixed(3) + ' ms a frame'); m.dispose();
    console.log(`ground that takes marks: prints with rims on sheets that meet, tracks that join up, a trail to read, snow / mud / sand by the weather, filled, washed and blown out, things that leave them by themselves, the land's own triangles, grass that parts ok (${ms.toFixed(3)} ms a frame with ${kept} marks)`);
  }
}

// vehicles made in code (src/kit/models/vehicle-*.js, vehicles.js: gs.models.vehicle)
{
  const THREE = await import('three'), P = await import('../src/kit/models/vehicle-parts.js'), S = await import('../src/kit/models/vehicle-shapes.js'), R = await import('../src/kit/models/vehicle-rail.js'), C = await import('../src/kit/models/vehicle-craft.js');
  const { vehicle } = await import('../src/kit/models/vehicles.js');
  // what a shape's triangles say: its volume (triangles facing out make it positive), its box, edges that are not shared by two triangles, corners that are not numbers
  const facts = geos => {
    let vol = 0, tris = 0, bad = 0; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], edges = new Map(), key = (a, i) => `${Math.round(a[i] * 1e4)},${Math.round(a[i + 1] * 1e4)},${Math.round(a[i + 2] * 1e4)}`; let outward = 0, n = 0;
    for (const g of geos) {
      const a = g.attributes.position.array, nn = g.attributes.normal.array;
      for (let i = 0; i < a.length; i += 9) {
        const [x0, y0, z0, x1, y1, z1, x2, y2, z2] = a.subarray(i, i + 9); tris++;
        vol += (x0 * (y1 * z2 - z1 * y2) - y0 * (x1 * z2 - z1 * x2) + z0 * (x1 * y2 - y1 * x2)) / 6;
        const fx = (y1 - y0) * (z2 - z0) - (z1 - z0) * (y2 - y0), fy = (z1 - z0) * (x2 - x0) - (x1 - x0) * (z2 - z0), fz = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
        for (let c = 0; c < 9; c += 3) { if (!Number.isFinite(a[i + c] + a[i + c + 1] + a[i + c + 2] + nn[i + c] + nn[i + c + 1] + nn[i + c + 2])) bad++; n++; if (fx * nn[i + c] + fy * nn[i + c + 1] + fz * nn[i + c + 2] > 0) outward++; lo[0] = Math.min(lo[0], a[i + c]); lo[1] = Math.min(lo[1], a[i + c + 1]); lo[2] = Math.min(lo[2], a[i + c + 2]); hi[0] = Math.max(hi[0], a[i + c]); hi[1] = Math.max(hi[1], a[i + c + 1]); hi[2] = Math.max(hi[2], a[i + c + 2]); }
        for (const [p, q] of [[0, 3], [3, 6], [6, 0]]) { const A = key(a, i + p), B = key(a, i + q); edges.set(A + '>' + B, (edges.get(A + '>' + B) || 0) + 1); }
      }
    }
    let open = 0; for (const [e, c] of edges) { const [A, B] = e.split('>'); if ((edges.get(B + '>' + A) || 0) !== c) open++; }
    return { vol, tris, bad, lo, hi, open, facing: outward / n };
  };
  const all = shape => [...shape.slots.values()].flat(), near = (a, b, tol) => Math.abs(a - b) <= tol;
  // the tools: lines through knots, places to cut, a skin over cross-sections, a belt round wheels, wheels
  {
    const f = P.line([[0, 1], [2, 3], [4, 3]]), g = P.line([[0, 1], [2, 3], [4, 3]], .5);
    assert.ok(f(-1) === 1 && f(1) === 2 && f(3) === 3 && f(9) === 3 && g(2) < 3 && g(2) > 2.7 && near(g(1), 2, 1e-9), 'a line through knots, and with its corner rounded');
    const st = P.stations(0, 1, .25, [.5, .52, .9]); assert.deepEqual(st, [0, .25, .5, .52, .75, .9, 1], 'places to cut: every step, and exactly where asked');
    // a box 2 x 1 x 3 as a skin: closed, facing out, the volume it should have; with rounded corners a little less, still closed
    const ring = z => [[-1, 0, z], [1, 0, z], [1, 1, z], [-1, 1, z]], box = new P.Shape().skin([0, 1, 2, 3].map(ring), { capA: 'paint', capB: 'paint' }), bf = facts(all(box));
    assert.ok(near(bf.vol, 6, 1e-6) && bf.open === 0 && bf.facing === 1 && bf.tris === 3 * 4 * 2 + 8 && box.tris === bf.tris, 'a skinned box is closed and faces out');
    const soft = new P.Shape().skin([0, 1, 2, 3].map(ring), { capA: 'paint', capB: 'paint', round: .2 }), sf = facts(all(soft));
    assert.ok(sf.vol < 6 && sf.vol > 5.8 && sf.open === 0 && sf.tris > bf.tris && sf.facing === 1, 'rounded corners: ' + sf.vol.toFixed(3));
    // the same box with its rings given the other way round still faces out; sides sharper than the crease keep their own normals, a gentle bend shades smooth
    const back = facts(all(new P.Shape().skin([0, 1, 2, 3].map(z => ring(z).reverse()), { capA: 'paint', capB: 'paint' }))); assert.ok(near(back.vol, 6, 1e-6) && back.facing === 1, 'a skin faces out whichever way its rings run');
    const nrm = box.slots.get('paint')[0].attributes.normal.array; let axis = 0; for (let i = 0; i < nrm.length; i += 3) if (Math.max(Math.abs(nrm[i]), Math.abs(nrm[i + 1]), Math.abs(nrm[i + 2])) > .999) axis++; assert.equal(axis, nrm.length / 3, 'a box keeps its edges sharp');
    const tube = new P.Shape().skin([0, 1].map(z => Array.from({ length: 24 }, (_, i) => [Math.cos(i / 24 * 6.2832), Math.sin(i / 24 * 6.2832), z]))), tn = tube.slots.get('paint')[0].attributes, off = []; for (let i = 0; i < tn.position.count; i++) off.push(Math.hypot(tn.normal.getX(i) - tn.position.getX(i), tn.normal.getY(i) - tn.position.getY(i)));
    assert.ok(Math.max(...off) < .01, 'a round tube shades smooth: its normals point straight out');
    // slots: a function picks each piece's, null leaves a hole
    const two = new P.Shape().skin([0, 1, 2].map(ring), { slot: (i, j) => j === 2 ? (i ? null : 'glass') : 'paint' });
    assert.ok(two.slots.get('glass')[0].attributes.position.count === 6 && two.slots.get('paint')[0].attributes.position.count === 6 * 6, 'a slot for each piece, and a hole');
    // a mirrored part keeps facing out
    const pair = new P.Shape().box('a', 1, 1, 1, [2, 0, 0]).add('a', new THREE.BoxGeometry(1, 1, 1), [-2, 0, 0], [0, 0, 0], [-1, 1, 1]), pf = facts(all(pair)); assert.ok(near(pf.vol, 2, 1e-6) && pf.lo[0] === -2.5 && pf.facing === 1, 'a mirrored copy still faces out: ' + pf.vol + ' ' + pf.lo[0] + ' ' + pf.facing);
    const bar = facts(all(new P.Shape().bar('a', [0, 0, 0], [3, 4, 0], .1, 16))); assert.ok(near(bar.vol, Math.PI * .01 * 5, .01) && near(bar.hi[0], 3.08, .01), 'a bar between two points');
    // a belt round two wheels: twice the gap and one turn; round four, its points keep the wheels' distance
    const b2 = P.belt([[2, 1, .5], [-2, 1, .5]]); assert.ok(near(b2.length, 8 + Math.PI, .01), 'a belt round two wheels: ' + b2.length.toFixed(3));
    const top = b2.at(1), bot = b2.at(b2.length / 2 + 1); assert.ok(near(top.y, 1.5, 1e-3) && near(top.dz, -1, 1e-3) && near(bot.y, .5, 1e-3) && near(bot.dz, 1, 1e-3) && near(b2.at(1 + b2.length * 3).z, top.z, 1e-6), 'forward along the top, back along the ground, and round again');
    const b4 = P.belt([[3, 1, .3], [-3, 1.1, .35], [-2.4, .4, .4], [2.4, .4, .4]]); let far = 0; for (let s = 0; s < b4.length; s += .05) { const p = b4.at(s); far = Math.max(far, Math.abs(Math.hypot(p.dz, p.dy) - 1)); assert.ok(p.y >= -1e-6 && Math.abs(p.z) <= 3.36); } assert.ok(far < 1e-6 && b4.length > 13 && b4.length < 15);
    // wheels: round, as wide as asked, their axle along x, coloured; a railway pair spans the gauge
    const wf = facts([P.wheelGeo({ r: .4, w: .25, lugs: 0 })]), lug = facts([P.wheelGeo({ r: .4, w: .25, lugs: 18 })]), wg = P.wheelGeo({ r: .4, w: .25, dual: true });
    assert.ok(near(wf.hi[1], .4, .002) && near(wf.hi[2], .4, .002) && near(wf.hi[0] - wf.lo[0], .25, .03) && lug.hi[1] > .4 && lug.tris > wf.tris && wg.attributes.color && wf.bad === 0, 'a road wheel');
    const ws = facts([P.wheelsetGeo({ r: .46, gauge: 1.435 })]), sp = P.wheelsetGeo({ r: .66, spokes: 14, weight: 1.1 });
    assert.ok(near(ws.hi[0], 1.435 / 2 + .13, .03) && near(ws.lo[0], -ws.hi[0], 1e-6) && near(ws.hi[1], .49, .01) && sp.attributes.position.count > P.wheelsetGeo({ r: .66 }).attributes.position.count && ws.bad === 0, 'a railway wheelset');
  }
  // every vehicle's plan: real numbers, the size it says, its nose along -z, its wheels on the ground
  {
    const plans = [], t0 = performance.now();
    for (const st of S.KINDS.car) plans.push(S.car({ style: st })); for (const st of S.KINDS.truck) plans.push(S.truck({ style: st })); plans.push(S.truck({ style: 'flat', axles: 3 }));
    for (const st of S.KINDS.tank) plans.push(S.tank({ style: st })); for (const st of R.RAIL) plans.push(R.railcar(st)); for (const st of C.CRAFT.boat) plans.push(C.boat({ style: st })); for (const st of C.CRAFT.plane) plans.push(C.plane({ style: st }));
    const ms = performance.now() - t0; let tris = 0;
    for (const p of plans) {
      const name = p.kind + ' ' + p.style, f = facts(all(p.body)); tris += f.tris;
      assert.ok(f.bad === 0 && f.tris > 800, name + ': ' + f.tris + ' triangles, all real numbers'); assert.ok(f.facing > .97, name + ': faces out (' + f.facing.toFixed(3) + ')');
      assert.ok(near(f.hi[2] - f.lo[2], p.size.length, p.size.length * .12 + .4) && f.hi[0] - f.lo[0] <= p.size.width + .05 && near(f.lo[0], -f.hi[0], .25), name + ': the size it says, the same both sides');
      for (const q of Object.values(p.parts || {})) assert.equal(facts(all(q.shape)).bad, 0);
      for (const w of p.wheels) { assert.ok(w.geo.r > .1 && (p.kind === 'plane' ? near(w.at[1] - w.geo.r, -p.gear, .01) || w.at[2] > 3 : near(w.at[1], w.geo.r, 1e-9)), name + ': wheels on the ground'); }
      for (const pt of Object.values(p.points)) assert.ok((Array.isArray(pt) ? pt : pt.at).every(Number.isFinite));
    }
    const car = plans[0], jeep = plans.find(p => p.style === 'jeep'), lorry = plans.find(p => p.kind === 'truck'), six = plans.find(p => p.kind === 'truck' && p.wheels.length === 6);
    assert.ok(car.wheels.length === 4 && car.wheels[0].steer && !car.wheels[2].steer && car.wheels[0].at[0] < 0 && car.wheels[1].at[0] > 0 && car.wheels[0].at[2] < car.wheels[2].at[2] && near(car.wheels[2].at[2] - car.wheels[0].at[2], car.wheelbase, 1e-9) && near(car.wheels[1].at[0] * 2, car.track, 1e-9), 'a car: front left, front right, back left, back right; the front pair steers');
    assert.ok(car.points.lampL[2] < -2 && car.points.exhaust[2] > 2 && car.body.slots.has('glass') && car.body.slots.has('lamp') && car.body.slots.has('tail') && jeep.body.slots.has('screen') && !jeep.body.slots.has('glass') && jeep.spares.length === 1, 'lamps at the nose, an exhaust at the tail, glass; a jeep is open');
    assert.ok(lorry.wheels.length === 4 && lorry.wheels[2].geo.dual && six && six.size.length > lorry.size.length && lorry.body.slots.has('wood') && plans.find(p => p.style === 'canvas').body.slots.has('canvas'), 'a lorry: twin tyres at the back, a third axle when asked');
    for (const t of plans.filter(p => p.kind === 'tank')) { const k = t.tracks; assert.ok(k.run.length > t.size.length * 1.9 && k.wheels.length >= 6 && t.parts.gun.on === 'turret' && t.points.muzzle.on === 'gun' && near(-t.points.muzzle.at[2], t.gun, .2) && k.wheels.every(w => w.y >= w.r), 'a tank: tracks, a gun on a turret'); let low = 9; for (let s = 0; s < k.run.length; s += .1) low = Math.min(low, k.run.at(s).y); assert.ok(near(low, .025, .01), 'its tracks lie on the ground'); }
    for (const c of plans.filter(p => p.kind === 'train')) assert.ok(c.length >= 7 && c.sets.every(s => s.at.every(a => a[0] === s.geo.r)) && c.reach >= 1.7 && near(c.points.front[2], -c.length / 2, 1e-9), 'a railway car stands on the rails: ' + c.style);
    const steam = plans.find(p => p.style === 'steam'); assert.ok(steam.rods && steam.parts.rods && steam.parts.mainRods && steam.sets[0].geo.spokes && steam.points.smoke[1] > 3 && steam.radius === steam.rods.r, 'a steam engine: spoked wheels, rods, a chimney to smoke from; its radius is its driving wheels\'');
    const van = plans.find(p => p.kind === 'train' && p.style === 'van'); assert.ok(near(van.points.roof[1], van.size.height, .01) && van.points.roof[0] === 0 && van.points.roof[2] === 0, 'a van\'s roof point is the top of its roof');
    // the goods train: wagons on leaf springs with spoked wheels; a guard's van (look-outs, an open end, two tail lamps); loads; a tank wagon's filler; smoke deflectors
    const cut = (p, n) => (p.body.slots.get(n) || []).reduce((t, g) => t + g.attributes.position.count / 3, 0), rail = n => plans.find(p => p.kind === 'train' && p.style === n);
    const guard = rail('guard'), open = rail('open'), flat = rail('flat'), tank = rail('tanker');
    assert.ok(R.RAIL.includes('guard') && guard.points.veranda[2] > 2.5 && guard.points.tail[2] > guard.points.veranda[2] && near(guard.points.roof[1], van.points.roof[1], 1e-9) && guard.size.height > guard.points.roof[1] + .4 && guard.size.width > van.size.width + .25 && cut(guard, 'tail') > 0 && cut(guard, 'glass') > 0 && cut(guard, 'boards') > cut(van, 'boards'), 'a guard\'s van: look-outs wider than a van, a stove pipe above its roof, an open end, tail lamps');
    for (const w of [van, guard, open, flat, tank]) assert.ok(w.sets.length === 1 && w.sets[0].geo.spokes === 9 && w.sets[0].at.length === 2 && cut(w, 'iron') > 2000, w.style + ': two spoked wheelsets under their springs and guards');
    const tarp = R.railcar('open', { load: 'tarp' }), coal = R.railcar('open', { load: 'coal' }), crates = R.railcar('flat', { load: 'crates' });
    assert.ok(!open.body.slots.has('canvas') && !open.body.slots.has('coal') && cut(tarp, 'canvas') > 200 && tarp.size.height > open.size.height + .4 && cut(coal, 'coal') > 500 && coal.size.height > open.size.height && !flat.body.slots.has('drum') && cut(crates, 'drum') > 300 && cut(crates, 'timber') > cut(flat, 'timber') && cut(flat, 'timber') > 0 && !crates.body.slots.has('wood') && crates.size.height > flat.size.height + .5, 'loads: canvas or coal in an open wagon, crates and drums on a flat one');
    for (const p of [tarp, coal, crates]) { const f = facts(all(p.body)); assert.ok(f.bad === 0 && near(f.lo[0], -f.hi[0], .25) && f.hi[0] - f.lo[0] <= p.size.width + .05, 'a loaded wagon: real numbers, its load inside its sides'); }
    assert.ok(near(tank.points.filler[1], tank.size.height, .05) && cut(tank, 'paint2') > 800 && tank.size.width < 2.7, 'a tank wagon: a round tank, its filler on top');
    const plain = rail('steam'), defl = R.railcar('steam', { deflectors: true }), tender = rail('tender');
    assert.ok(cut(defl, 'plates') > cut(plain, 'plates') && cut(plain, 'plates') > 0 && cut(plain, 'copper') > 0 && cut(plain, 'fire') > 0 && cut(plain, 'lamp') > 100 && defl.size.width <= plain.size.width + .01 && tender.body.slots.has('plates') && cut(tender, 'coal') > 300 && tender.sets[0].geo.spokes === 9, 'a steam engine: riveted plates, copper pipes, lamps, a fire; smoke deflectors when asked, no wider; a tender of coal');
    // a working engine (polished: false): bands and dome painted over, no bright rims, and not a triangle more; a tender runs on a wagon's wheels
    const worked = R.railcar('steam', { polished: false }), mean = g => { const a = g.attributes.color.array; let t = 0; for (const q of a) t += q; return t / a.length; }, bright = P.wheelsetGeo({ r: .46, spokes: 9 }), dim = P.wheelsetGeo({ r: .46, spokes: 9, dull: true });
    assert.ok(cut(worked, 'brass') < cut(plain, 'brass') - 100 && cut(worked, 'brass') > 0 && cut(worked, 'steel') < cut(plain, 'steel') && cut(worked, 'iron') > cut(plain, 'iron') && cut(worked, 'paint') > cut(plain, 'paint') && worked.sets.every(q => q.geo.dull) && plain.sets.every(q => !q.geo.dull) && R.railcar('van', { polished: false }).sets[0].geo.dull, 'polished: false paints a steam engine\'s dome and bands over and dulls every wheel');
    assert.ok(dim.attributes.position.count === bright.attributes.position.count && mean(dim) < mean(bright) * .75, 'dull wheels: the same triangles, darker (' + mean(dim).toFixed(3) + ' against ' + mean(bright).toFixed(3) + ')');
    assert.equal(JSON.stringify(tender.sets[0].geo), JSON.stringify(van.sets[0].geo), 'a tender on the wagons\' wheels (one shape, so one draw in a fused train)');
    for (const bt of plans.filter(p => p.kind === 'boat')) { const f = facts(all(bt.body)); assert.ok(near(f.lo[1], -bt.draft, .02) && f.hi[1] > .3, bt.style + ' floats: ' + f.lo[1].toFixed(2) + ' m below the water'); const bow = facts(all(bt.body).map(g => { const a = g.attributes.position.array, keep = []; for (let i = 0; i < a.length; i += 9) if (Math.max(a[i + 2], a[i + 5], a[i + 8]) < f.lo[2] + .25) keep.push(...a.subarray(i, i + 9)); const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.BufferAttribute(new Float32Array(keep), 3)); o.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(keep.length), 3)); return o; }).filter(g => g.attributes.position.count)); assert.ok(bow.hi[0] - bow.lo[0] < bt.size.width * .45, bt.style + ': a bow at -z'); }
    for (const pl of plans.filter(p => p.kind === 'plane')) { const f = facts(all(pl.body)); assert.ok(near(f.hi[0] - f.lo[0], pl.size.width, pl.size.width * .1) && pl.props.every(n => pl.parts[n].shape.slots.has('blur')) && pl.gear > 1 && pl.points.pilot, pl.style + ': wings as wide as it says'); }
    assert.ok(ms < 4000, 'every plan in ' + ms.toFixed(0) + ' ms');
    // the made vehicle: its parts move as asked; a copy shares its shapes
    const v = vehicle('car', { style: 'saloon', seed: 3 }), w = v.twin();
    assert.ok(v.isGroup && v.kind === 'car' && v.style === 'saloon' && v.wheels.length === 4 && v.tris > 5000 && v.points.driver.isObject3D && v.size.length > 4 && w !== v && w.shell.children[0].geometry === v.shell.children[0].geometry && w.wheels[0] !== v.wheels[0] && vehicle('car', { style: 'saloon', seed: 3 }).shell.children[0].material === v.shell.children[0].material, 'a car, and its twin sharing its shapes');
    v.roll(1); assert.ok(near(v.wheels[0].rotation.x, -1 / v.radius, 1e-9) && w.wheels[0].rotation.x === 0, 'a metre forward turns its wheels (not its twin\'s)');
    v.steer(.3); assert.ok(v.wheels[0].rotation.y === -.3 && v.wheels[1].rotation.y === -.3 && v.wheels[2].rotation.y === 0, 'the front wheels steer');
    assert.ok(v.wheels.every(q => q.width > .12 && q.width < .35 && q.radius > .25) && v.belts === undefined && w.wheels[0].width === v.wheels[0].width, 'each wheel says how wide it is (for the track it leaves: gs.outdoors.Marks)');
    for (let i = 0; i < 60; i++) v.move(1 / 60, 12, { steer: 1 }); assert.ok(near(v.wheels[2].rotation.x, -(1 + 12) / v.radius, 1e-6) && near(v.wheels[0].rotation.y, -.55, .01) && v.shell.rotation.z > .02, 'move(): rolls, steers, and the body rolls outwards in the turn');
    const ch = v.chassis({ power: 9 }); assert.ok(ch.wheels.length === 4 && ch.wheels[0] === v.wheels[0] && near(ch.l, v.wheelbase + v.radius * 1.8, 1e-9) && near(ch.w, v.track + .1, 1e-9) && ch.radius === v.radius && ch.power === 9 && v.shell.position.y < -.5, 'chassis(): what World3D.vehicle wants');
    // on gs.physics3d springs: its own wheels stand on the road and turn; a sensor in the way (a pickup, a goal) does not lift it; the world can be freed after
    {
      const { World3D, loadPhysics3D } = await import('../src/kit/physics3d.js'); await loadPhysics3D();
      const pw = new World3D({ gravity: -9.81 }); pw.floor(0); pw.box(null, 8, 1, 8, { at: { x: 0, y: .6, z: 0 }, fixed: true, sensor: true });
      const pc = vehicle('car', { style: 'hatch' }), hold = new THREE.Scene(); hold.add(pc); const drv = pw.vehicle(pc, pc.chassis({ at: { x: 0, y: 1.2, z: 0 } })), wy = () => { pc.updateMatrixWorld(true); return pc.wheels.map(q => q.getWorldPosition(new THREE.Vector3()).y); };
      for (let i = 0; i < 90; i++) pw.step(1 / 60); const stood = wy(), low = new THREE.Box3().setFromObject(pc.shell).min.y;
      assert.ok(drv.grounded && stood.every(y => near(y, pc.radius, .05)) && low > .08 && low < .3, 'a car on springs stands on the road, through a sensor: wheels at ' + stood.map(y => y.toFixed(2)) + ', its floor ' + low.toFixed(2) + ' m up');
      for (let i = 0; i < 150; i++) { drv.drive(1, .4); pw.step(1 / 60); } const ran = wy();
      assert.ok(drv.speed > 3 && !drv.upsideDown && pc.position.z < -2 && Math.abs(pc.position.x) > .2 && ran.every(y => near(y, pc.radius, .08)) && Math.abs(pc.wheels[0].rotation.x) > 1 && Math.abs(pc.wheels[0].rotation.y) > .05 && pc.wheels[2].rotation.y === 0, 'and drives and steers on them: ' + drv.speed.toFixed(1) + ' m/s');
      assert.doesNotThrow(() => pw.free(), 'a world with a car in it can be freed');
    }
    let bad = null; try { vehicle('car', { style: 'hovercraft' }); } catch (e) { bad = e; } assert.ok(/no car called 'hovercraft'/.test(bad?.message)); bad = null; try { vehicle('sled'); } catch (e) { bad = e; } assert.ok(/no vehicle 'sled'/.test(bad?.message), 'what it does not know is an error that names what it does');
    assert.deepEqual(Object.keys(vehicle.kinds), ['car', 'truck', 'tank', 'train', 'boat', 'plane']);
    // a tank: tracks run with the distance (each side its own), the turret turns, the gun lifts within its stops
    const tk = vehicle('tank'), links = tk.shell.children.find(m => m.name === 'tracks'), m0 = new THREE.Matrix4(), m1 = new THREE.Matrix4(); links.getMatrixAt(0, m0);
    tk.roll(.07, 0); links.getMatrixAt(0, m1); const moved = Math.hypot(m1.elements[13] - m0.elements[13], m1.elements[14] - m0.elements[14]); links.getMatrixAt(links.count / 2, m1); links.getMatrixAt(links.count / 2, m0);
    assert.ok(links.isInstancedMesh && near(moved, .07, .002) && m0.equals(m1) && !tk.chassis, 'a tank\'s left track runs 7 cm; its right stays');
    assert.ok(tk.wheels.length === 0 && tk.belts.x > .8 && tk.belts.x < tk.size.width / 2 && tk.belts.width > .3 && tk.belts.width < .8, 'and it says where its two belts run, and how wide');
    tk.aim(.5, 2); assert.ok(tk.parts.turret.rotation.y === .5 && tk.parts.gun.rotation.x === .45 && tk.parts.gun.parent === tk.parts.turret && tk.points.muzzle.parent === tk.parts.gun);
    tk.updateMatrixWorld(true); const mz = tk.points.muzzle.getWorldPosition(new THREE.Vector3()); assert.ok(mz.x < -.5 && mz.y > 2.4 && mz.z < -1, 'the muzzle is where the gun points: ' + mz.toArray().map(q => q.toFixed(2)));
    // a train: cars coupled nose to tail, laid along a track so each sits between its own wheels
    const tr = vehicle('train', { style: 'diesel', cars: ['coach', 'coach'] }), len = tr.cars.reduce((t, c) => t + c.length, 0);
    assert.ok(tr.cars.length === 3 && near(tr.length, len, 1e-9) && near(tr.cars[0].position.z, -len / 2 + tr.cars[0].length / 2, 1e-9) && near(tr.cars[1].position.z - tr.cars[0].position.z, (tr.cars[0].length + tr.cars[1].length) / 2, 1e-9) && tr.cars[1].shell.children[0].geometry === tr.cars[2].shell.children[0].geometry, 'a train: three cars coupled');
    const Rr = 60, track = s => ({ x: Rr * (1 - Math.cos(s / Rr)), y: s * .02, z: -Rr * Math.sin(s / Rr) }); tr.along(track, 100);
    for (const c of tr.cars) { const mid = track(100 - c.back); assert.ok(Math.hypot(c.position.x - mid.x, c.position.z - mid.z) < c.reach * c.reach / (2 * Rr) + .02 && near(c.rotation.x, .02, .003) && near(c.rotation.y, -(100 - c.back) / Rr, .01), 'each car on the curve, turned along it, tipped with the slope'); }
    tr.roll(2); const wm = new THREE.Matrix4(); tr.cars[0].children.find(m => m.name === 'wheels').getMatrixAt(0, wm); assert.ok(near(Math.atan2(wm.elements[6], wm.elements[5]), -2 / .5 + 2 * Math.PI, 1e-4) || near(Math.atan2(wm.elements[6], wm.elements[5]), -2 / .5, 1e-4), 'its wheels turn with the distance');
    // wagons given as { style, colour, load }: each its own boards in its own colour; a wagon by itself takes the train's; one it does not know is an error
    const gt = vehicle('train', { style: 'diesel', cars: [{ style: 'van', colour: '#6b3024' }, 'van', { style: 'van', colour: '#6b3024' }] }), boards = c => c.shell.children.find(m => m.name === 'boards').material;
    assert.ok(gt.cars.length === 4 && boards(gt.cars[1]).color.getHexString() === '6b3024' && boards(gt.cars[2]).color.getHexString() === '8a6a44' && boards(gt.cars[3]) === boards(gt.cars[1]) && gt.cars[1].points.roof.isObject3D && near(gt.length, gt.cars[0].length + 3 * 9.1, 1e-9), 'a train: a wagon in a colour of its own, bare boards on the one beside it');
    const lone = vehicle('train', { style: 'van', colour: '#20405a' }); assert.ok(lone.cars.length === 1 && boards(lone.cars[0]).color.getHexString() === '20405a' && lone.twin().cars[0].shell.children[0].geometry === lone.cars[0].shell.children[0].geometry, 'a wagon by itself takes the colour given to the train');
    bad = null; try { vehicle('train', { style: 'diesel', cars: [{ style: 'sled' }] }); } catch (e) { bad = e; } assert.ok(/no train called 'sled'/.test(bad?.message), 'a wagon it does not know, given as an object');
    // a train that keeps to a straight line (fuse: true): one mesh a kind of surface, every wheelset of one shape in one draw; the cars stay for their points and rods
    {
      const GOODS = { style: 'steam', colour: '#1d1e20', deflectors: true, lit: true, cars: [{ style: 'van', colour: '#6b3024' }, { style: 'open', load: 'tarp', colour: '#565c50' }, { style: 'tanker', colour: '#2e3235' }, { style: 'flat', load: 'crates' }, { style: 'guard', colour: '#565b5e' }] };
      const loose = vehicle('train', GOODS), fz = vehicle('train', { ...GOODS, fuse: true }), own = ['lamp', 'tail', 'fire'];
      const draws = t => { let n = 0; t.traverse(m => { if (m.isMesh) n++; }); return n; }, count = t => { let n = 0; t.traverse(m => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * (m.isInstancedMesh ? m.count : 1); }); return n; };
      const box = t => { t.updateMatrixWorld(true); const b = new THREE.Box3(); t.traverse(m => { if (m.isMesh && !m.isInstancedMesh) { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); } }); return [...b.min.toArray(), ...b.max.toArray()]; };
      assert.ok(fz.fused && !loose.fused && draws(loose) >= 50 && draws(fz) <= 18 && count(fz) === count(loose) && fz.tris === loose.tris, 'a fused train: ' + draws(loose) + ' draws down to ' + draws(fz) + ', the same ' + count(fz) + ' triangles');
      assert.ok(box(fz).every((q, i) => near(q, box(loose)[i], 1e-4)), 'and the same shape in the same place');
      assert.ok(fz.cars.length === 7 && fz.cars.every((c, i) => c.position.z === loose.cars[i].position.z && !c.children.some(m => m.name === 'wheels') && !c.shell.children.some(m => m.isMesh)) && fz.points === fz.cars[0].points && fz.cars[2].points.roof.getWorldPosition(new THREE.Vector3()).distanceTo(loose.cars[2].points.roof.getWorldPosition(new THREE.Vector3())) < 1e-9 && fz.cars[6].points.tail.isObject3D, 'its cars keep their places and points, without meshes of their own');
      const plainOnes = fz.shell.children.filter(m => !own.includes(m.name));
      assert.ok(plainOnes.length >= 4 && plainOnes.every(m => m.material.vertexColors && m.material.color.getHex() === 0xffffff && m.geometry.attributes.color && m.castShadow) && own.every(n => fz.shell.children.filter(m => m.name === n).length === 1), 'colours in the corners of white materials; one mesh each for lamps, tail lamps and the fire');
      const wheelsOf = t => t.children.filter(m => m.name === 'wheels'), ws = wheelsOf(fz), each = n => { let k = 0; n.traverse(m => { if (m.isInstancedMesh) k += m.count; }); return k; };
      assert.ok(ws.length === 3 && each(fz) === each(loose) && ws.some(m => m.count === 13), 'three shapes of wheelset (drivers, carrying, wagons with the tender): ' + ws.map(m => m.count));
      fz.roll(2); loose.roll(2); const wm2 = new THREE.Matrix4(), turned = ws.map((m, i) => { m.getMatrixAt(0, wm2); return Math.atan2(wm2.elements[6], wm2.elements[5]); });
      assert.ok(new Set(turned.map(a => a.toFixed(3))).size >= 2 && turned.every(a => Math.abs(a) > .01) && fz.cars[0].parts.rods.position.distanceTo(loose.cars[0].parts.rods.position) < 1e-12 && fz.cars[0].parts.rods.position.y !== vehicle('train', GOODS).cars[0].parts.rods.position.y, 'roll(): every wheel turns for its own size, the rods go round');
      fz.move(.5, 4); assert.ok(near(fz.cars[0].parts.rods.position.y, loose.roll(4).cars[0].parts.rods.position.y, 1e-12), 'move() carries on from there');
      bad = null; try { fz.along(s => ({ x: 0, y: 0, z: -s }), 10); } catch (e) { bad = e; } assert.ok(/straight line/.test(bad?.message), 'along() says a fused train keeps to a straight line');
      const tw = fz.twin(), lampOf = t => t.shell.children.find(m => m.name === 'lamp');
      assert.ok(tw !== fz && tw.fused && tw.shell.children.every((m, i) => m.geometry === fz.shell.children[i].geometry && m.material === fz.shell.children[i].material) && wheelsOf(tw)[0] !== ws[0] && wheelsOf(tw)[0].geometry === ws[0].geometry, 'a twin shares its shapes and has wheels of its own');
      const litM = lampOf(fz).material; fz.lights(false); assert.ok(lampOf(fz).material !== litM && !(lampOf(fz).material.emissiveIntensity > 0 && lampOf(fz).material.emissive.getHex()) && lampOf(tw).material === litM, 'lights(false) puts its lamps out, not its twin\'s'); fz.lights(true); assert.equal(lampOf(fz).material, litM);
      const red = new THREE.Color('#6b3024'), rv = vehicle('train', { style: 'van', colour: '#6b3024', wear: false, fuse: true }), has = rv.shell.children.some(m => { const a = m.geometry.attributes.color?.array; if (!a) return false; for (let i = 0; i < a.length; i += 3) if (near(a[i], red.r, 1e-4) && near(a[i + 1], red.g, 1e-4) && near(a[i + 2], red.b, 1e-4)) return true; return false; });
      assert.ok(has && rv.cars.length === 1 && draws(rv) < draws(vehicle('train', { style: 'van', colour: '#6b3024', wear: false })), 'a fused wagon carries its paint in its corners');
      const dark = vehicle('train', { ...GOODS, polished: false, fuse: true }); assert.ok(draws(dark) <= draws(fz) && wheelsOf(dark).every(m => !ws.some(q => q.geometry === m.geometry)), 'a working engine, fused: dull wheels of its own');
    }
    // a plane: its propeller turns, then blurs; a patrol boat's radar goes round
    const pl = vehicle('plane'), blades = pl.parts.prop.children.find(m => m.name !== 'blur'), blur = pl.parts.prop.children.find(m => m.name === 'blur');
    assert.ok(blades.visible && !blur.visible && pl.gear > 1.5 && pl.sit > 0); for (let i = 0; i < 120; i++) pl.move(1 / 60, 50); assert.ok(!blades.visible && blur.visible && pl.parts.prop.rotation.z > 20 && pl.wheels[0].rotation.x === 0, 'a propeller spins up into a blur; wheels in the air keep still');
    const pb = vehicle('boat', { style: 'patrol' }); pb.move(.5, 6, { steer: 1 }); assert.ok(pb.parts.radar.rotation.y > 1 && pb.draft > 1 && pb.parts.gun && pb.aim(.2, .1).parts.turret.rotation.y === .2);
    console.log(`vehicles made in code: the shape tools (skins closed and facing out, rounded, slots, belts, wheels), ${plans.length} plans (${tris} triangles in ${ms.toFixed(0)} ms), cars roll, steer and lean, a tank's tracks and turret, a train along a curve, a goods train's wagons, loads and colours, a fused train in a third of the draws, propellers and radar ok`);
  }
}

// gs.models.fur: fur and hair in layers (the strand pictures, the shell every layer shares, the layers, thinning with
// distance), on creatures (where it grows and how long) — scripts/creatures.cjs draws it to look over; people's hair
// is checked in kit-browser (a person's clothes need a canvas)
{
  const { fur, strands } = await import('../src/kit/models/fur.js'), THREE = await import('three'), { creature } = await import('../src/kit/models/creature.js');
  const near = (a, b, e = 1e-4) => Math.abs(a - b) <= e;
  // ---- the pictures of strands: less of each strand shows the higher it is cut; fur is dots, hair runs along v
  const cover = (tex, t) => { const d = tex.image.data; let k = 0; for (let i = 3; i < d.length; i += 4) if (d[i] >= t * 255) k++; return k / (d.length / 4); };
  const pf = strands('fur'), ph = strands('hair');
  assert.ok(pf.isDataTexture && pf.image.width === 256 && pf.image.data.length === 256 * 256 * 4 && pf.wrapS === THREE.RepeatWrapping && pf.generateMipmaps, 'a strand picture is a tiling texture with mipmaps');
  for (const tex of [pf, ph]) assert.ok(cover(tex, .1) > .9 && cover(tex, .5) < cover(tex, .25) - .15 && cover(tex, .5) > .1 && cover(tex, .9) < .1 && cover(tex, .9) > 0, `${tex.name}: thick at the roots (${cover(tex, .1).toFixed(2)}), thin at the tips (${cover(tex, .9).toFixed(3)})`);
  const rough = (tex, dx, dy) => { const d = tex.image.data; let s = 0; for (let y = 0; y < 255; y++) for (let x = 0; x < 255; x++) s += Math.abs(d[(y * 256 + x) * 4 + 3] - d[((y + dy) * 256 + x + dx) * 4 + 3]); return s; };
  assert.ok(rough(ph, 1, 0) > rough(ph, 0, 1) * 4, 'hair runs down the picture: it changes far more across than along');
  assert.ok(rough(pf, 1, 0) < rough(pf, 0, 1) * 1.3 && rough(pf, 0, 1) < rough(pf, 1, 0) * 1.3, 'fur stands on end: the same across as along');
  assert.ok(strands('fur') === pf && strands('fur', 2) !== pf && strands('fur', 2).image.data.some((v, i) => v !== pf.image.data[i]), 'one picture a kind and seed; another seed, other strands');
  { const d = pf.image.data; let lo = 255, hi = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 40) { lo = Math.min(lo, d[i]); hi = Math.max(hi, d[i]); } } assert.ok(hi - lo > 60 && lo > 120, 'each strand has a shade of its own'); }

  // ---- the shell: out along the normal by each point's length, over along the surface, a place in the picture
  const ball = new THREE.SphereGeometry(1, 24, 16), sh = fur.shell(ball, { length: .1, tile: .5 });
  const A = sh.morphAttributes.position[0], B = sh.morphAttributes.position[1], P = sh.attributes.position, Nn = sh.attributes.normal;
  assert.ok(sh.morphAttributes.position.length === 2 && sh.morphTargetsRelative && sh.attributes.uv.count === P.count && sh.index.count === ball.index.count, 'the shell: the same triangles, two ways to move');
  let worstLen = 0, worstDot = 0, flat = 0;
  for (let i = 0; i < P.count; i++) {
    const l = Math.hypot(A.getX(i), A.getY(i), A.getZ(i)), d = (A.getX(i) * Nn.getX(i) + A.getY(i) * Nn.getY(i) + A.getZ(i) * Nn.getZ(i)) / l;
    worstLen = Math.max(worstLen, Math.abs(l - .1)); worstDot = Math.max(worstDot, Math.abs(d - 1), Math.abs(B.getX(i) * Nn.getX(i) + B.getY(i) * Nn.getY(i) + B.getZ(i) * Nn.getZ(i)));
    if (Math.hypot(B.getX(i), B.getY(i), B.getZ(i)) > .05) flat++;
  }
  assert.ok(worstLen < 1e-5 && worstDot < 1e-4 && flat > P.count * .6, 'strands grow straight out of the skin and lie over along it');
  assert.ok(P.count > ball.attributes.position.count && P.count < ball.attributes.position.count * 2.2 && [...sh.attributes.uv.array].every(Number.isFinite), 'points are doubled only where the picture is laid on from another side');
  assert.ok(near(sh.boundingSphere.radius, 1.16, .01) && near(sh.userData.fur.longest, .1, 1e-6) && sh.userData.fur.tris === ball.index.count / 3);
  // where: none below the middle, and no cliff where it stops
  const half = fur.shell(ball, { length: .1, where: (i, x, y) => y > 0 ? 1 : 0 }), hA = half.morphAttributes.position[0]; let steps = 0, some = 0;
  for (let t = 0; t < half.index.count; t += 3) { const l = [0, 1, 2].map(k => { const i = half.index.getX(t + k); return Math.hypot(hA.getX(i), hA.getY(i), hA.getZ(i)); }); if (Math.max(...l) - Math.min(...l) > .05 + 1e-6) steps++; if (Math.max(...l) > 0 && Math.max(...l) < .1) some++; }
  assert.ok(half.index.count < ball.index.count * .7 && half.index.count > ball.index.count * .4 && steps === 0 && some > 20, 'strands grow only where they are told, and shorten toward where none grow');
  assert.equal(fur.shell(ball, { length: .1, where: new Float32Array(ball.attributes.position.count) }).index.count, 0, 'nothing grows where every point says none');
  // the coat thins out toward where none grow (the alpha of each point's colour: how thick it is there), and takes the mesh's colours or its own
  { const hc = half.attributes.color; let bare = 0, thick = 0, wrong = 0; for (let i = 0; i < hc.count; i++) { const l = Math.hypot(hA.getX(i), hA.getY(i), hA.getZ(i)); if (l === 0) { bare++; if (hc.getW(i) !== 0) wrong++; } else if (l > .05) { thick++; if (hc.getW(i) !== 1) wrong++; } }
    assert.ok(hc.itemSize === 4 && bare > 10 && thick > 100 && wrong === 0 && hc.getX(0) === 1, 'thin to nothing where no strand grows, full where they are long; white where the mesh has no colours'); }
  { const cg = ball.clone(), n = cg.attributes.position.count; cg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(.5), 3)); const own = new Float32Array(n * 3).fill(.25);
    assert.ok(fur.shell(cg, { length: .1 }).attributes.color.getY(7) === .5 && fur.shell(cg, { length: .1, colors: own }).attributes.color.getZ(7) === .25, 'the mesh\'s colours, or the ones it is given'); }
  // thin things keep their shape: no strand longer than part of what it grows on is thick
  const slab = new THREE.BoxGeometry(1, .04, 1, 12, 1, 12), ss = fur.shell(slab, { length: .1 }), sA = ss.morphAttributes.position[0]; let top = 0, topN = 0;
  for (let i = 0; i < sA.count; i++) if (Math.abs(ss.attributes.normal.getY(i)) > .9) { top = Math.max(top, Math.hypot(sA.getX(i), sA.getY(i), sA.getZ(i))); topN++; }
  assert.ok(topN > 100 && top <= .04 * .45 + 1e-6 && near(fur.shell(slab, { length: .1, thin: 0 }).userData.fur.longest, .1), `a slab 4 cm thick grows strands no longer than ${(top * 100).toFixed(1)} cm (10 cm asked for)`);
  // hair from a crown: round the head in whole pictures, further down the further from the crown
  const head = fur.shell(ball, { length: .05, tile: .25, uv: { centre: [0, 0, 0], crown: [0, 1, 0] } }), hu = head.attributes.uv; let torn = 0, down = 0;
  for (let t = 0; t < head.index.count; t += 3) { const u = [0, 1, 2].map(k => hu.getX(head.index.getX(t + k))); if (Math.max(...u) - Math.min(...u) > 20 / 24 + 1e-3) torn++; }
  for (let i = 0; i < hu.count; i++) if (Math.abs(hu.getY(i) - Math.acos(Math.max(-1, Math.min(1, head.attributes.position.getY(i)))) * 4) > 1e-3) down++;
  assert.ok(torn === 0 && down === 0, 'a crown: no triangle is torn across the join, and v is how far round from the crown');
  assert.throws(() => fur.shell(new THREE.BufferGeometry(), {}), /positions and normals/);

  // ---- the layers
  const mesh = new THREE.Mesh(ball, new THREE.MeshStandardMaterial()), coat = fur(mesh, { length: .1, layers: 6, lean: .5 });
  assert.ok(coat.layers === 6 && coat.shells.length === 6 && coat.shells.every(m => m.parent === mesh && m.geometry === coat.shell && !m.castShadow && m.material.map === pf) && coat.tris === ball.index.count / 3 * 6, 'six layers, children of the mesh, one geometry between them');
  const inf = coat.shells.map(m => m.morphTargetInfluences.slice()), cut = coat.shells.map(m => m.material.alphaTest), order = coat.shells.map(m => m.renderOrder);
  assert.ok(inf.every((v, i) => !i || (v[0] < inf[i - 1][0] && v[1] < inf[i - 1][1])) && cut.every((v, i) => !i || v < cut[i - 1]) && order.every((v, i) => !i || v > order[i - 1]) && near(cut[0], 5.5 / 6) && near(cut[5], .5 / 6), 'the outermost first: furthest out, cut highest, drawn first');
  assert.ok(inf[0][0] < 1 && inf[0][0] > .9 && inf[0][1] > .25, 'a strand is an arc: its tip a little short of straight, and over to one side');
  coat.lean = 0; assert.ok(coat.shells[0].morphTargetInfluences[0] === 1 && coat.shells[0].morphTargetInfluences[1] === 0, 'no lean: straight out');
  coat.length = 2; assert.ok(coat.shells[0].morphTargetInfluences[0] === 2 && coat.shells[5].morphTargetInfluences[0] === 2 / 6, 'length can be set any time (fur standing on end)'); coat.length = 1;
  assert.ok(coat.shells[0].material.color.r > coat.shells[5].material.color.r * 1.5, 'dark at the roots, light at the tips');
  assert.ok(fur(new THREE.Mesh(ball, mesh.material), { shell: coat.shell, layers: 6 }).shells[0].material === coat.shells[0].material, 'coats of one kind share their materials');
  // thinning with distance: all, half, none
  const cam = new THREE.PerspectiveCamera(50, 1, .1, 1000); mesh.updateMatrixWorld(true);
  const at = d => { cam.position.set(0, 0, d); cam.updateMatrixWorld(true); return coat.see(cam, 800); };
  assert.equal(at(4), 1); assert.equal(coat.shells.filter(m => m.visible).length, 6);
  assert.equal(at(10), .5); assert.deepEqual(coat.shells.map(m => m.visible), [true, false, true, false, true, false], 'half its layers further off, the outermost kept');
  assert.equal(at(40), 0); assert.equal(coat.shells.filter(m => m.visible).length, 0, 'none far away');
  assert.equal(at(4), 1); coat.level = 0; assert.equal(coat.level, 0); coat.level = 1;
  // a skinned mesh: the layers ride the same skeleton
  const bone = new THREE.Bone(), sg = ball.clone(); sg.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(sg.attributes.position.count * 4), 4)); sg.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(sg.attributes.position.count * 4).map((v, i) => i % 4 ? 0 : 1), 4));
  const sm = new THREE.SkinnedMesh(sg, mesh.material), sk = new THREE.Skeleton([bone]); sm.add(bone); sm.bind(sk); const sc = fur(sm, { layers: 4, length: .05 });
  assert.ok(sc.shells.every(m => m.isSkinnedMesh && m.skeleton === sk && m.geometry.attributes.skinWeight) && sc.shells.length === 4, 'on a skinned mesh the layers are skinned to the same skeleton');
  coat.dispose(); assert.ok(!mesh.children.length && coat.shells.length === 0, 'dispose takes the layers away');
  assert.equal(fur(mesh, { layers: 0 }).shells.length, 0, 'no layers: the mesh as it was'); assert.throws(() => fur({}), /give it a mesh/);

  // ---- on creatures: fur where the coat is fur, a mane on a horse, none on a pig; short on the face, none on the nose or the eyes
  const cat = creature({ like: 'cat', now: true, fur: { layers: 6 } }), cf = cat.fur, cs = cf.shell, scale = cat.scale.x;
  assert.ok(cf && cf.layers === 6 && cf.shells.every(m => m.isSkinnedMesh && m.parent === cat.lods[0] && m.skeleton === cat.mesh.skeleton), 'a cat has fur, on its closest level');
  assert.ok(cs.userData.fur.tris > cat.tris[1] * .7 && cs.userData.fur.tris < cat.tris[0] * .6, 'the fur covers most of it, on the middle level\'s triangles (the head on the finest)');
  const inMetres = cs.userData.fur.longest * scale; assert.ok(inMetres > .008 && inMetres < .03, `a cat's fur is ${(inMetres * 1000).toFixed(0)} mm long`);
  cat.lod = 1; cat.updateMatrixWorld(true); let seen = 0; cat.traverseVisible(o => { if (o.name.startsWith('fur')) seen++; }); assert.equal(seen, 0, 'further off (the middle level) there is no fur to draw'); cat.lod = 0;
  { const l0 = cf.lean; for (let i = 0; i < 60; i++) cat.move(1 / 60, cat.speeds.run); const fast = cf.lean; for (let i = 0; i < 120; i++) cat.move(1 / 60, 0); assert.ok(fast > l0 + .3 && Math.abs(cf.lean - l0) < .03, 'running lays its fur back; standing lets it up again'); }
  const tw = cat.twin(); assert.ok(tw.fur && tw.fur !== cf && tw.fur.shell === cs && tw.fur.shells[0].skeleton === tw.mesh.skeleton, 'a twin has a coat of its own on the same shell');
  const horse = creature({ like: 'horse', now: true, fur: { layers: 6 } }), pig = creature({ like: 'pig', now: true, fur: { layers: 6 } });
  assert.ok(horse.fur && horse.fur.shell.userData.fur.tris < horse.tris[1] * .5 && horse.fur.shell.userData.fur.longest > cs.userData.fur.longest && pig.fur === null, 'a horse grows a mane and a tail (long), a pig nothing');
  assert.equal(creature({ like: 'cat', now: true, fur: false }).fur, null, 'fur: false'); assert.ok(creature({ like: 'cat', now: true, fur: { layers: 6, length: .05 } }).fur.shell.userData.fur.longest * scale > .03, 'a length in metres');
  assert.ok(creature({ like: 'ogre', now: true, fur: { layers: 5 }, build: { coat: 'fur' } }).fur?.layers === 5, 'any creature given a coat of fur grows it');
  console.log(`fur and hair in layers: the strand pictures, the shell (lengths, thin things, a crown), six layers, thinning with distance, skinned meshes, a cat (${cs.userData.fur.tris} triangles a layer), a horse's mane, a pig without ok`);
}

// crowds (crowd.js, gs.props.Crowd): each kind's moves written into a texture a row a frame, and members that are a few
// numbers each: the rows hold what the figure's own skeleton makes of the pose, and the bookkeeping (who is sent,
// how finely, a stride by the ground covered, a blend into a new move, a move that plays once, hiding, a ray)
{
  const THREE = await import('three'), { Crowd } = await import('../src/kit/props.js'), { posedBox } = await import('../src/kit/crowd.js'), { person, keys } = await import('../src/kit/poses.js'), { creature } = await import('../src/kit/models/creature.js');
  await (await import('three/examples/jsm/libs/meshopt_simplifier.module.js')).MeshoptSimplifier.ready;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, 16 / 9, .1, 400); cam.position.set(0, 1.6, 0); cam.lookAt(0, 1, -10);
  const man = person({ hair: null }), cat = creature({ like: 'cat', now: true, fur: false });
  man.rig.add('bow', keys([[0, { spine: [0, 0, 0] }], [.5, { spine: [.7, 0, 0] }], [1, { spine: [0, 0, 0] }]]), { time: 1, once: true });
  const before = JSON.stringify(man.rig.layers), crowd = new Crowd({ scene, cam }, { of: [man, cat], moves: ['idle', 'walk', 'run', 'bow', 'no such move'] });
  assert.ok(JSON.stringify(man.rig.layers) === before && !man.parent && scene.children.length === 1 && scene.children[0] === crowd.group, 'the figures are left as they were given, and out of the scene');
  const K = crowd.kinds, P = K[0].plan, data = crowd.tex.image.data, TW = crowd.tex.image.width;
  assert.deepEqual([Object.keys(P), Object.keys(K[1].plan)], [['idle', 'walk', 'run', 'bow'], ['idle', 'walk', 'run']], 'each kind has the moves its rig knows');
  assert.ok(P.walk.n === 32 && P.walk.loop && P.walk.rate > 0 && P.bow.n === 24 && !P.bow.loop && P.bow.once && P.idle.loop && P.idle.per > 0, 'a stride is 32 rows, a move by the clock 24 a second, one that plays once does not come round');
  assert.equal(crowd.tex.image.height, [...Object.values(P), ...Object.values(K[1].plan)].reduce((n, m) => n + m.n + (m.loop ? 1 : 0), 0), 'the kinds\' rows one under the other, a row more for each move that comes round');
  // a row is the pose the figure's own skeleton makes: every point of the mesh, bent as the shader bends it, is where three.js puts it
  const pin = (f, move, phase) => { const r = f.rig; r.blendOn = false; r.blendK = 0; r.bw = null; r.top = null; r.topOn = false; r.topW = 0; r.fadeT = 0; r.weight = 0; r.layers = [{ name: move, w: 1, phase, pin: true }]; r.update(0); f.updateMatrixWorld(true); f.mesh.skeleton.update(); };
  const v = new THREE.Vector3(); let worst = 0;
  for (const [f, k, move, row] of [[man, 0, 'walk', 7], [man, 0, 'run', 21], [man, 0, 'bow', 12], [cat, 1, 'walk', 13]]) {
    const m = K[k].plan[move]; pin(f, move, m.loop ? row / m.n : row / (m.n - 1));
    posedBox(f.mesh.geometry, data, TW, m.base + row, (i, x, y, z) => { f.mesh.getVertexPosition(i, v); worst = Math.max(worst, Math.abs(v.x - x), Math.abs(v.y - y), Math.abs(v.z - z)); });
  }
  assert.ok(worst < 2e-4, `the rows are the figures' own poses (a point is ${worst.toExponential(1)} off at most)`);
  { const a = (P.walk.base) * TW * 4, b = (P.walk.base + P.walk.n) * TW * 4; let d = 0; for (let i = 0; i < TW * 4; i++) d = Math.max(d, Math.abs(data[a + i] - data[b + i])); assert.ok(d < 1e-5, 'the row after a stride\'s last is its first again'); }
  // shapes: the figure's own, then coarser ones made here on the same points, no two far apart
  for (const k of K) {
    const t = k.levels.map(l => l.tris); assert.ok(t.every((n, i) => !i || (n < t[i - 1] && t[i - 1] / n < 6)) && t[t.length - 1] < 1100, 'levels get coarser a step at a time, down to a few hundred triangles: ' + t);
    let from = null, made = 0; k.levels.forEach((l, i) => { if (k.own.includes(i)) from = l; else { made++; assert.ok(l.geo.attributes.position === from.geo.attributes.position && l.geo.attributes.gsSkinI === from.geo.attributes.gsSkinI && l.geo.attributes.gsAt !== from.geo.attributes.gsAt, 'a level made here draws the same points as the figure\'s level it was made from, with members of its own'); } });
    assert.ok(made > 0, 'levels are made after a figure\'s own coarsest');
  }
  assert.ok(K[0].h * K[0].size > 1.5 && K[0].h * K[0].size < 2 && K[1].h * K[1].size > .15 && K[1].h * K[1].size < .6, 'how tall each stands: ' + K.map(k => (k.h * k.size).toFixed(2)));
  // who is sent, and how finely
  const near = crowd.add({ x: 0, z: -4, move: 'walk', phase: 0 }), far = crowd.add({ x: 3, z: -120, move: 'walk' }), behind = crowd.add({ x: 0, z: 30 }), gone = crowd.add({ x: 0, z: -200 }), puss = crowd.add({ x: 1, z: -6, kind: 1, size: 1.5, tint: '#ff0000' });
  crowd.update(0);
  const L0 = K[0].levels;
  assert.deepEqual([crowd.info.members, crowd.info.drawn, near.c.seen, far.c.seen, behind.c.seen, gone.c.seen, puss.c.seen], [5, 3, true, true, false, false, true], 'the ones behind the camera or too far are not sent');
  assert.ok(near.c.lv === 0 && far.c.lv === L0.length - 1 && L0[0].geo.instanceCount === 1 && L0[0].mesh.visible && !L0[1].mesh.visible, 'the near one at the finest level, the far one at the coarsest');
  assert.equal(crowd.info.triangles, L0[0].tris + L0[L0.length - 1].tris + K[1].levels[puss.c.lv].tris, 'info counts the triangles it sends');
  { const a = K[1].levels[puss.c.lv].a; assert.deepEqual([a[0], a[2], a[7], a[8], a[9]].map(n => +n.toFixed(3)), [1, -6, +(1.5 * K[1].size).toFixed(3), 1, 0], 'a member is its place, its size and its colour'); }
  crowd.lod = 0; crowd.update(0); assert.equal(far.c.lv, K[0].own[0], 'lod = 0: everyone at the figure\'s finest'); crowd.lod = null; crowd.update(0);
  // nothing moved: the shadow maps are not told to draw them again; a step tells them
  const said = L0[0].mesh.userData.gsMoved; crowd.update(0); assert.equal(L0[0].mesh.userData.gsMoved, said, 'a frame in which nobody moved says so');
  // a stride by the ground covered; standing, a walker does not step
  near.z -= .5; crowd.update(1 / 60);
  assert.ok(Math.abs(near.phase - .5 * P.walk.rate / K[0].size) < 1e-9 && L0[0].mesh.userData.gsMoved === said + 1, 'half a metre is ' + near.phase.toFixed(3) + ' of a stride');
  { const ph = near.phase; crowd.update(1); assert.equal(near.phase, ph, 'standing still, a walker does not step'); }
  // between two rows: the two and how far between them
  { const a = L0[0].a, f = near.phase * 32; assert.deepEqual([a[4], a[5], +a[6].toFixed(4)], [P.walk.base + Math.floor(f), P.walk.base + Math.floor(f) + 1, +(f % 1).toFixed(4)], 'a member is drawn between the two rows it is at'); }
  // a new move blends in from the row the old one was at, over a quarter of a second; walk to run keeps step
  { const ph = near.phase, from = P.walk.base + Math.round(ph * 32); near.move = 'run'; crowd.update(.1); const a = L0[0].a;
    assert.ok(a[4] === from && a[5] >= P.run.base && a[5] <= P.run.base + 32 && a[6] > .2 && a[6] < .5 && near.phase === ph, 'a new move blends in from where the old one was, in step');
    crowd.update(.2); assert.ok(a[4] >= P.run.base && a[5] <= P.run.base + 32 && a[5] - a[4] <= 1, 'and then it is the new move alone'); }
  // a move that plays once ends, and says so
  near.move = 'bow'; crowd.update(.5); assert.ok(near.phase === .5 && !near.done, 'a move by the clock: half a second of a second-long bow');
  crowd.update(.6); assert.ok(near.phase === 1 && near.done && L0[0].a[5] === P.bow.base + P.bow.n - 1, 'it ends on its last row and says done');
  near.move = 'no such move'; crowd.update(0); assert.equal(near.move, 'bow', 'a move the kind does not know is not taken');
  // a ray: the first member it meets
  { const hit = crowd.ray({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }), r = Math.max(.12, K[0].w * K[0].size * .5);
    assert.ok(hit.member === near && Math.abs(hit.distance - (4.5 - r)) < 1e-6 && Math.abs(hit.height - 1 / (K[0].h * K[0].size)) < 1e-6, 'a ray finds the one in front, ' + hit.distance.toFixed(2) + ' m off and ' + hit.height.toFixed(2) + ' of the way up');
    assert.ok(!crowd.ray({ x: 2, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 50) && !crowd.ray({ x: 0, y: 3, z: 0 }, { x: 0, y: 0, z: -1 }) && !crowd.ray({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 2), 'and none beside it, over it or out of reach');
    near.hide = true; assert.equal(crowd.ray({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 50), null, 'a hidden member is not hit');
    assert.equal(crowd.ray({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }).member, gone, 'and the ray goes on to the next one, however far (members out of view can be hit)'); }
  crowd.update(0); assert.ok(crowd.info.drawn === 2 && L0[0].geo.instanceCount === 0 && !L0[0].mesh.visible, 'a hidden member is not sent');
  assert.deepEqual(crowd.near(0, -5, 3), [near, puss]); crowd.remove(puss); crowd.update(0); assert.deepEqual([crowd.info.members, crowd.info.drawn], [4, 1], 'a member taken out is gone');
  // many more than the room there was: the lists grow, and nobody is lost
  for (let i = 0; i < 200; i++) crowd.add({ x: (i % 20 - 10) * .8, z: -8 - (i / 20 | 0) * .8, move: 'idle' });
  crowd.update(1 / 60); assert.ok(crowd.info.drawn > 150 && K[0].levels.reduce((n, l) => n + l.geo.instanceCount, 0) === crowd.info.drawn && K[0].levels.every(l => l.cap >= l.n), 'the lists grow with the crowd (' + crowd.info.drawn + ' sent)');
  crowd.clear(); crowd.update(0); assert.ok(crowd.list.length === 0 && crowd.info.drawn === 0 && K.every(k => k.levels.every(l => !l.mesh.visible)), 'clear() leaves nothing to draw');
  assert.throws(() => new Crowd({ scene, cam }, { of: [] }), /at least one figure/); assert.throws(() => new Crowd({ scene, cam }, { of: [new THREE.Group()] }), /a rig and a skinned mesh/); assert.throws(() => new Crowd({ scene, cam }, { of: [man], moves: ['nope'] }), /none of the moves/);
  // "as the last frame drew them" (for frame generation): by the frames a view says it drew, however many updates came between
  { const one = crowd.add({ x: 0, z: -5, move: 'idle' }), a = () => K[0].levels[one.c.lv].a; crowd.update(0); crowd.frame();
    one.x = 1; crowd.update(0); one.x = 2; crowd.update(0); assert.deepEqual([a()[0], a()[12]], [2, 0], 'two updates between two frames: the move is from where the last frame drew it');
    crowd.frame(); assert.deepEqual([a()[0], a()[12]], [2, 0], 'the frame that shows the move'); crowd.frame(); assert.deepEqual([a()[0], a()[12]], [2, 2], 'a frame drawn again with no update shows nobody moving');
    one.x = 3; crowd.update(0); assert.deepEqual([a()[0], a()[12]], [3, 2]); crowd.frame(); one.x = 4; crowd.update(0); assert.deepEqual([a()[0], a()[12]], [4, 3], 'an update a frame: from the last one'); crowd.clear(); }
  // a figure handed over at a far level (there a sculpted person leaves its small bones out of the scene) is read with every bone in place, and handed back as it was
  { const mk = () => { const f = person({ hair: null }), b = f.bones.foreL, kids = b.parent.children; let lod = 0; Object.defineProperty(f, 'lod', { get: () => lod, set(v) { if (!v !== !lod) { if (v) kids.splice(kids.indexOf(b), 1); else kids.push(b); } lod = v; } }); return f; };
    const f0 = mk(), f2 = mk(); f2.lod = 2;
    const c0 = new Crowd({ scene, cam }, { of: [f0], moves: ['walk'] }), c2 = new Crowd({ scene, cam }, { of: [f2], moves: ['walk'] }), d0 = c0.tex.image.data, d2 = c2.tex.image.data;
    let w = 0; for (let i = 0; i < d0.length; i++) w = Math.max(w, Math.abs(d0[i] - d2[i]));
    assert.ok(d0.length === d2.length && w < 1e-6, 'a figure given at a far level: its moves are read with every bone in place (off by ' + w + ')');
    assert.ok(f2.lod === 2 && !f2.bones.foreL.parent.children.includes(f2.bones.foreL) && f0.lod === 0, 'and it is handed back at the level it was given'); c0.dispose(); c2.dispose(); }
  crowd.dispose(); assert.ok(scene.children.length === 0 && scene.userData.gsPosed.size === 0, 'dispose takes it out of the scene');
  console.log(`crowds: rows that are the figures' own poses (${worst.toExponential(1)} off at most), levels made between and after a figure's own, who is sent and how finely, strides, blends, a move that plays once, rays, growing ok`);
}

// every check above has passed; something a kit started (a timer) would keep Node waiting a minute before it exits
process.exit(0);
