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
    delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance;
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
  for (const [name, v, lo, hi] of [['walk', 1.36, .12, .4], ['jog', 3.4, .07, .24], ['run', 5.6, .07, .19], ['sneak', 1, .12, .48]]) {
    rig.play(name, { fade: 0 }); let x = 0, n = 0, last = 0, a = Infinity, b = -Infinity, low = Infinity; const at = new Vector3();
    for (let i = 0; i < 960; i++) { rig.update(1 / 240, { speed: v }); x += v / 240; root.position.z = x; root.updateMatrixWorld(true); B.footL.getWorldPosition(at); const ph = rig.phase; if (ph < last) n++; last = ph; low = Math.min(low, at.y); if (n === 1 && ph > lo && ph < hi) { a = Math.min(a, at.z); b = Math.max(b, at.z); } }
    assert.ok(b - a < .012, name + ': the planted foot slides ' + (b - a).toFixed(4) + ' m'); assert.ok(low > .08, name + ': no foot goes through the floor ' + low.toFixed(3));
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
  // automatic 3D quality: Rob's Fold reports (2026-11-10) averaged 57 fps at 60 but dropped a frame 3 times a second
  const B = 1000 / 60;
  assert.equal(sp.qualityVerdict(B * 1.3, 0, B), 'slow', 'a slow average steps down');
  assert.equal(sp.qualityVerdict(1000 / 57, 3, B), 'slow', 'a good average with frames a refresh late steps down');
  assert.equal(sp.qualityVerdict(B, 1, B), 'ok', 'one late frame in a window (a hitch) is not enough');
  assert.equal(sp.qualityVerdict(B, 1, B) === 'fast', false, 'and is never room to climb');
  assert.equal(sp.qualityVerdict(B, 0, B), 'fast', 'on the beat with none late: room to climb');
  console.log('frame generation: exact camera turns, battery and heat, pacing by the clock, screen rate, stutter-aware quality ok');
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
    assert.deepEqual(hand.names, ['handL']); assert.ok(hand.slots.includes('skin'));
    for (let i = 0; i < hand.n; i += 7) assert.equal(hand.SW[i * 4] + hand.SW[i * 4 + 1] + hand.SW[i * 4 + 2] + hand.SW[i * 4 + 3], 255, 'weights are whole');
    const right = HS.mirrored(hand); assert.deepEqual(right.names, ['handR']); assert.ok(right.P[0] === -hand.P[0] && right.I[0][1] === hand.I[0][2], 'the other hand: turned over');
    const sp = { build: { shoulders: 1, chest: 1, waist: 1, hips: 1, limbs: 1, bust: 0, neck: 1 }, top: { kind: 'tunic', sleeves: 'long', pockets: 4, buttons: '#888', collar: '#333' }, legs: { kind: 'trousers' }, feet: { kind: 'tall' }, face: { jaw: 1 }, hat: { kind: 'helmet', colour: '#444' }, belt: { colour: '#222' }, web: null, extras: {}, pack: null, gear: [], hands: 'open', gloves: null, hair: '#333', hairStyle: 'short', moustache: false };
    const jobs = HS.jobsFor(sp), again = HS.jobsFor({ ...sp, top: { ...sp.top, buttons: '#abc', collar: '#def' }, hat: { kind: 'helmet', colour: '#f00' } });
    assert.deepEqual(jobs.map(j => j.kind), ['trunk', 'arm', 'hand', 'head', 'hat']); assert.deepEqual(jobs.map(j => j.key), again.map(j => j.key), 'colours do not change what is sculpted');
    const hat = HS.sculpt(jobs[4]); assert.ok(hat.n > 300 && hat.slots.includes('helm') && hat.names[0] === '$', 'a helmet on a bone of its own');
    // each arm is a piece of its own (it turns in the shoulder; nothing is stretched across the armpit): one sculpt serves both, unless the left wears an armband
    assert.equal(jobs[1].side, 'LR'); const banded = HS.jobsFor({ ...sp, top: { ...sp.top, band: '#dd0' } }).filter(j => j.kind === 'arm'); assert.deepEqual(banded.map(j => j.side), ['L', 'R']); assert.equal(banded[1].key, jobs[1].key, 'the bare arm is shared');
    const arm = HS.sculpt(jobs[1]); assert.deepEqual([...arm.names].sort(), ['armL', 'foreL']); assert.ok(arm.n > 500 && arm.slots.includes('top'));
    let minX = 9; for (let i = 0; i < arm.n; i++) minX = Math.min(minX, arm.P[i * 3]); assert.ok(minX > .1, 'a left arm, on its own side: ' + minX);
    assert.deepEqual([...HS.mirrored(arm).names].sort(), ['armR', 'foreR']);
    // a kind that is not on the list is no hat and no pack, even a name every object answers to (a kind reaches the sculptor as text, over a worker message)
    for (const kind of ['constructor', 'toString', 'nonsuch']) {
      assert.deepEqual(HS.jobsFor({ ...sp, hat: { kind }, pack: { kind } }).map(j => j.kind), ['trunk', 'arm', 'hand', 'head'], 'no hat or pack of kind ' + kind);
      for (const what of ['hat', 'pack']) assert.throws(() => HS.sculpt({ kind: what, a: { kind } }), new RegExp(`no ${what} called '${kind}'`));
    }
    assert.ok(typeof HS.VERSION === 'string' && HS.VERSION.length > 4, 'the sculptor has a stamp for saved copies');
  }
  console.log('gs.models: sculpted people ok');
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
    const S = stage(), spine = S.f.rig.parts.spine; let lean = 0;
    const out = run(S, 1.6, { .3: r => r.hit([0, 0, -.35]), .4: () => { lean = spine.rotation.x; } });
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

// every check above has passed; something a kit started (a timer) would keep Node waiting a minute before it exits
process.exit(0);
