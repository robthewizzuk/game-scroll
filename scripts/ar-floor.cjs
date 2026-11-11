// Native AR without a phone: plays an AR game in world mode against a pretend AR plugin
// (scripts/lib/fake-native-ar.js) and checks that the "Find your floor" step ends the way it should in
// different rooms: a mapped floor, a plain floor with only feature points, a table in the way, sitting
// low, nothing found at all, a second round, lost tracking, lining the floor up by hand.
// The "room:" scenes play AR Lab (the test scene, with every AR phase 2 part asked for) and check
// those parts against the pretend phone: a real box hides the cube behind it, walls are mapped and
// never taken for the floor, the sun turns to the room's light and the reflections are painted from
// it, an anchor follows the phone's map, and a picture in the room is found.
// Usage: npm run build:bundled && node scripts/ar-floor.cjs [name-filter] [--shots dir] [--size 884x1104] [--webgpu]
// (--webgpu: draw on WebGPU, with Chromium's software Vulkan driver, as scripts/gpu-games.cjs does)
// It can't tell how well ARCore or ARKit really see a room: that still needs a phone (Settings > AR test).
const { chromium, devices } = require('playwright');
const path = require('path');

const argv = process.argv.slice(2), opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const SHOTS = opt('--shots'), SIZE = opt('--size');   // --size 884x1104: another screen (an unfolded foldable, say) rather than a phone
const GPU = argv.includes('--webgpu');
const only = argv.find(a => !a.startsWith('--'));
const GAME = 'bin-flick', LAB_SLOW = 6;   // (seconds more for AR Lab's floor search: settle() below)
const floorPts = (n, y, o = {}) => `Array.from({ length: ${n} }, () => ({ x: ${o.x ?? 0} + (s.rng() - .5) * ${o.w ?? 2.6}, y: ${y}, z: ${o.z ?? -2} + (s.rng() - .5) * ${o.d ?? 2.6} }))`;

// Each scene: set(s) arranges the pretend room (s = window.__ar, run in the page), then run(t) plays it.
const scenes = [
  { name: 'floor mapped, standing', set: `s.planes = [{ id: 'f', x: 0, y: -1.3, z: -2, w: 2, d: 2 }]`,
    async run(t) { const r = await t.settle(4); t.is(r.src, 'plane'); t.near(r.floor, -1.3); t.note(`found in ${r.secs} s`); t.ok(r.said === 'Floor found', `said "${r.said}"`); await t.shot('found'); } },
  { name: 'plain floor: no mapped surface, feature points only', set: `s.cloud = ${floorPts(60, -1.3)}`,
    async run(t) { const r = await t.settle(6); t.is(r.src, 'points'); t.near(r.floor, -1.3, .04); t.note(`found in ${r.secs} s`); } },
  { name: 'older app (no feature points): rough hit points agree', set: `s.sendPoints = false; s.pointHit = { y: -1.3, chance: .5, noise: .015 }`,
    async run(t) { const r = await t.settle(7); t.is(r.src, 'hits'); t.near(r.floor, -1.3, .04); } },
  { name: 'older app answering with one hit only still finds a mapped floor', set: `s.sendPoints = false; s.firstHitOnly = true; s.planes = [{ id: 'f', x: 0, y: -1.25, z: -2, w: 1.5, d: 1.5 }]`,
    async run(t) { const r = await t.settle(4); t.is(r.src, 'plane'); t.near(r.floor, -1.25); } },
  { name: 'sitting low over the floor (phone 65 cm up)', set: `s.room.floor = -.65; s.planes = [{ id: 'f', x: 0, y: -.65, z: -1.5, w: 2.5, d: 2.5 }]`,
    async run(t) { const r = await t.settle(4); t.is(r.src, 'plane'); t.near(r.floor, -.65); } },
  { name: 'a table mapped first, floor points under it', set: `s.planes = [{ id: 't', x: 0, y: -.85, z: -1.4, w: 1.2, d: .8 }]; s.room.boxes = [{ x: 0, z: -1.4, w: 1.2, d: .8, top: -.85 }]; s.cloud = [...${floorPts(80, -.85, { z: -1.4, w: 1.2, d: .8 })}, ...${floorPts(30, -1.3, { w: 3, d: 3 })}]`,
    async run(t) { const r = await t.settle(6); t.is(r.src, 'points'); t.near(r.floor, -1.3, .04); await t.wait(1500); await t.shot('table'); t.near((await t.state()).floor, -1.3, .04, 'floor stays under the table'); } },
  { name: 'iPhone: a named table is never the floor, a named floor is', set: `s.sendPoints = false; s.planes = [{ id: 't', x: 0, y: -.9, z: -1.4, w: 1.5, d: 1, kind: 'table' }]`,
    async run(t) { await t.wait(2500); t.ok((await t.state()).scan, 'still searching past the table'); await t.page.evaluate(() => __ar.planes.push({ id: 'f', x: 0, y: -1.3, z: -2.5, w: .6, d: .6, kind: 'floor' })); const r = await t.settle(3); t.is(r.src, 'plane'); t.near(r.floor, -1.3); } },
  { name: 'nothing found: play starts on an estimate, no tap needed', set: ``,
    async run(t) {
      await t.wait(1500); const mid = await t.state(); t.ok(mid.scan && !mid.grid, 'no grid on the floor while still searching'); await t.shot('searching');
      const r = await t.settle(9); t.is(r.src, 'guess'); t.near(r.floor, -1.3); t.ok(r.secs > 3.5, `waited ${r.secs} s`); t.ok(/estimated/.test(r.said || ''), `said "${r.said}"`); t.ok(r.chip, 'Floor chip shows'); await t.shot('estimated');
      // the real floor (20 cm higher than guessed) is mapped during play: it takes over
      await t.page.evaluate(() => { __ar.room.floor = -1.1; __ar.planes = [{ id: 'f', x: 0, y: -1.1, z: -2, w: 2, d: 2 }]; });
      await t.until(s => s.src === 'plane', 4); const s = await t.state(); t.is(s.src, 'plane'); t.near(s.floor, -1.1);
    } },
  { name: 'Skip carries on at once', set: ``,
    async run(t) { await t.until(s => s.skip, 5); await t.tap('skip'); const r = await t.settle(1.5); t.ok(!r.scan, 'Skip ends the search'); t.is(r.src, 'guess'); t.note(`skipped at ${r.secs} s`); } },
  { name: 'the next round keeps the floor', set: `s.planes = [{ id: 'f', x: 0, y: -1.3, z: -2, w: 2, d: 2 }]`,
    async run(t) {
      await t.settle(4);
      await t.page.evaluate(() => { __ar.planes = []; __gs.start(); });   // play again; the phone has lost its map of the room meanwhile
      await t.until(s => s.scan, 3); const again = Date.now();
      const r = await t.settle(4); r.secs = +((Date.now() - again) / 1000).toFixed(1); t.is(r.src, 'kept'); t.near(r.floor, -1.3); t.note(`kept after ${r.secs} s`);
    } },
  { name: 'tracking lost in a round: the game waits, then carries on', set: `s.planes = [{ id: 'f', x: 0, y: -1.3, z: -2, w: 2, d: 2 }]`,
    async run(t) {
      await t.settle(4); await t.page.evaluate(() => { __ar.tracking = 'PAUSED'; __ar.why = 'EXCESSIVE_MOTION'; });
      await t.until(s => s.lost, 4); let s = await t.state(); t.ok(s.lost && s.calibrating, 'game waits while tracking is lost'); await t.shot('lost');
      await t.page.evaluate(() => { __ar.tracking = 'TRACKING'; __ar.why = 'NONE'; });
      await t.until(s => !s.calibrating, 3); s = await t.state(); t.ok(!s.calibrating, 'game carries on'); t.is(s.src, 'plane');
    } },
  { name: 'a room that can\'t be tracked: carry on in look-around mode', set: `s.tracking = 'PAUSED'; s.why = 'INSUFFICIENT_LIGHT'`,
    async run(t) {
      await t.until(s => s.skip, 9); let s = await t.state(); t.ok(s.skip && s.scan, 'the way out is offered'); await t.shot('dark');
      await t.tap('skip'); await t.until(s => s.mode === 'look' && !s.nat, 4); s = await t.state(); t.is(s.mode, 'look'); t.ok(await t.page.evaluate(() => !__ar.running && __ar.stops >= 1), 'native AR stopped');
    } },
  { name: 'lining the floor up by hand, and scanning again', set: ``,
    async run(t) {
      await t.settle(9);
      await t.tap('chip'); await t.until(s => s.cal, 2); t.ok((await t.state()).cal, 'line-up opens from the Floor chip');
      await t.drag(150, 250, 150, 310); await t.shot('lineup');   // down: the floor is further below
      let s = await t.state(); t.is(s.src, 'hand'); t.ok(s.floor < -1.45, `floor lowered to ${s.floor}`);
      await t.tap('done'); await t.until(s => !s.cal, 2); s = await t.state(); t.ok(!s.cal && !s.calibrating, 'Done closes it'); const set = s.floor;
      // a surface mapped somewhere else doesn't move a floor set by hand
      await t.page.evaluate(() => { __ar.planes = [{ id: 'x', x: 0, y: -1.0, z: -2, w: 2, d: 2 }]; }); await t.wait(1200); t.near((await t.state()).floor, set, .001, 'hand-set floor stands');
      // scan again: now the mapped surface is found
      await t.tap('chip'); await t.until(s => s.cal, 2); await t.tap('again'); const r = await t.settle(4); t.is(r.src, 'plane'); t.near(r.floor, -1.0);
    } },
  // ---- AR phase 2 (AR Lab asks for every part) ----
  { name: 'room: a real box hides the cube behind it', game: 'ar-lab', set: `s.planes = [{ id: 'f', x: 0, y: -1.3, z: -2, w: 3, d: 3 }]; s.room.boxes = [{ x: 0, z: -1, w: 1.6, d: .3, top: -.6 }]`,
    async run(t) {
      await t.settle(4); await t.until(s => s.depth === 'on', 3); let s = await t.state(); t.is(s.depth, 'on');
      await t.wait(400); let a = await t.cube(); t.ok(a.alpha < 40, `the cube shows through the real box (alpha ${a.alpha})`); await t.shot('hidden');
      await t.page.evaluate(() => { __ar.room.boxes = []; });   // the box is taken away: the cube is in plain view
      await t.wait(700); a = await t.cube(); t.ok(a.alpha > 200 && a.lum > 60, `the cube does not show with nothing in front (alpha ${a.alpha}, brightness ${a.lum})`); await t.shot('shown');
      // ...and its shadow still falls on the real floor: the floor in the depth picture mustn't cover it
      const sh = await t.pixel(.24, -1.3, -1.5); t.ok(sh.alpha > 12, `no shadow on the floor beside the cube (alpha ${sh.alpha})`);
    } },
  { name: 'room: depth a few centimetres out does not cut into the cube', game: 'ar-lab', set: `s.planes = [{ id: 'f', x: 0, y: -1.3, z: -2, w: 3, d: 3 }]; s.depthNoise = .025`,
    async run(t) { await t.settle(4); await t.until(s => s.depth === 'on', 3); await t.wait(500); const a = await t.cube(); t.ok(a.alpha > 200, `the cube is cut into (alpha ${a.alpha})`); } },
  { name: 'room: a phone that can\'t measure depth plays as before', game: 'ar-lab', set: `s.planes = [{ id: 'f', x: 0, y: -1.3, z: -2, w: 3, d: 3 }]; s.room.boxes = [{ x: 0, z: -1, w: 1.6, d: .3, top: -.6 }]; s.can.depth = false`,
    async run(t) { await t.settle(4); await t.wait(600); const s = await t.state(); t.is(s.depth, 'no'); t.ok(await t.page.evaluate(() => __ar.depthSent === 0), 'no depth pictures are sent'); const a = await t.cube(); t.ok(a.alpha > 200, 'the cube shows as it always did'); } },
  { name: 'room: walls are mapped, and are never the floor', game: 'ar-lab', set: `s.planes = [{ id: 'w', x: 0, y: -.3, z: -3, w: 3, d: 2, kind: 'wall', nx: 0, nz: 1 }]; s.room.walls = [{ x: 0, z: -3, nx: 0, nz: 1, w: 3 }]`,
    async run(t) {
      await t.wait(2500); let s = await t.state(); t.ok(s.scan, 'a wall alone does not end the floor search'); t.is(s.walls, 1);
      await t.page.evaluate(() => __ar.planes.push({ id: 'f', x: 0, y: -1.3, z: -2, w: 3, d: 3 }));
      const r = await t.settle(4); t.is(r.src, 'plane'); t.near(r.floor, -1.3);
      const w = await t.page.evaluate(() => __hdView.surfaces().filter(s => s.wall).map(s => ({ ny: s.n.y, nz: s.n.z, floor: s.floor, kind: s.kind })));
      t.ok(w.length === 1 && Math.abs(w[0].ny) < .05 && w[0].nz > .9 && !w[0].floor && w[0].kind === 'wall', `the wall is listed facing the room (${JSON.stringify(w)})`);
      // a tap high on the screen lands on the wall, a tap low on the floor
      const hit = (x, y) => t.page.evaluate(([x, y]) => __hdView.hit(__hdView.W * x, __hdView.H * y).then(h => h && { wall: h.wall, ny: h.n.y, nz: h.n.z, far: h.p.distanceTo(__hdView.eyePos), out: h.q && [0, 0, 1].map((_, i) => 0) && (() => { const v = h.n.clone().set(0, 0, 1).applyQuaternion(h.q); return [v.x, v.y, v.z]; })() }), [x, y]);
      const up = await hit(.5, .1), down = await hit(.5, .7);
      t.ok(up && up.wall && Math.abs(up.ny) < .05 && up.far > 2.7 && up.far < 3.6 && up.out[2] > .9, `a tap on the wall (${JSON.stringify(up)})`);
      t.ok(down && !down.wall && down.ny > .95, `a tap on the floor (${JSON.stringify(down)})`); await t.shot('walls');
    } },
  { name: 'room: walls not asked of an older phone', game: 'ar-lab', set: `s.can.walls = false; s.planes = [{ id: 'w', x: 0, y: -.3, z: -3, w: 3, d: 2, kind: 'wall', nx: 0, nz: 1 }, { id: 'f', x: 0, y: -1.3, z: -2, w: 3, d: 3 }]`,
    async run(t) { const r = await t.settle(4); t.is(r.src, 'plane'); t.is(r.walls, 0); t.note(`found in ${r.secs} s`); } },
  { name: 'room: the sun turns to the real light (the phone says where it is)', game: 'ar-lab', set: `s.planes = [{ id: 'f', x: 0, y: -1.3, z: -2, w: 3, d: 3 }]; s.sun = { x: -1, y: 1, z: .2 }`,
    async run(t) {
      await t.settle(4); await t.until(s => s.light === 'real' && s.sun && s.sun[0] < -.55, 5); const s = await t.state(); t.is(s.light, 'real');
      t.ok(s.sun[0] < -.55 && s.sun[1] > .6 && s.sun[1] < .8, `the sun is up to the left (${s.sun.map(v => v.toFixed(2))})`);
      await t.until(s => s.env, 3); t.ok((await t.state()).env, 'the reflections are painted from the room'); await t.wait(300); await t.shot('light');
    } },
  { name: 'room: the light is found in the room\'s picture (the phone gives no direction)', game: 'ar-lab', set: `s.planes = [{ id: 'f', x: 0, y: -1.3, z: -2, w: 3, d: 3 }]; s.sun = { x: 1, y: .8, z: -.3 }; s.sunKnown = false`,
    async run(t) {
      await t.settle(4); await t.until(s => s.sun && s.sun[0] > .5, 5); const s = await t.state();
      t.ok(s.sun[0] > .5 && s.sun[1] > .45 && s.sun[1] < .75, `the sun is up to the right (${s.sun.map(v => v.toFixed(2))})`);
    } },
  { name: 'room: a low light is lifted, an even room leaves the sun be', game: 'ar-lab', set: `s.planes = [{ id: 'f', x: 0, y: -1.3, z: -2, w: 3, d: 3 }]; s.sun = null; s.envUp = s.envDown = .5`,
    async run(t) {
      await t.settle(4); await t.until(s => s.env, 4); let s = await t.state(); t.ok(s.env, 'the reflections are painted');
      t.ok(Math.abs(s.sun[1] - .87) < .05, `an even room keeps the kit's sun (${s.sun.map(v => v.toFixed(2))})`);
      // an evenly lit room lights the cube as the kit's studio does (SKY_LEVEL in ar3d.js): with the sun
      // and the sky light off, so only the reflections light it, the cube is as bright either way
      // (on WebGPU the cube's shader is built again when a light goes, which takes software Vulkan a moment)
      await t.page.evaluate(() => { __hdView.sunL.visible = __hdView.hemi.visible = false; }); await t.wait(GPU ? 3000 : 250);
      const real = await t.cube(); await t.page.evaluate(() => { __hdView.env = null; }); await t.wait(GPU ? 1500 : 250); const studio = await t.cube();
      await t.page.evaluate(() => { __hdView.sunL.visible = __hdView.hemi.visible = true; });
      t.note(`cube brightness ${real.lum} by the room's light alone, ${studio.lum} by the studio's`);
      t.ok(Math.abs(real.lum - studio.lum) < .05 * studio.lum, `an even room is ${real.lum}, the studio ${studio.lum}`);
      await t.page.evaluate(() => { __ar.sun = { x: 0, y: .05, z: 1 }; });   // a window behind the player, at eye height
      await t.until(s => s.sun[2] > .8, 6); s = await t.state(); t.ok(s.sun[2] > .8 && s.sun[1] > .38, `a low light is lifted to 25 degrees (${s.sun.map(v => v.toFixed(2))})`);
    } },
  { name: 'room: an anchor follows the phone\'s map', game: 'ar-lab', set: `s.planes = [{ id: 'f', x: 0, y: -1.3, z: -2, w: 3, d: 3 }]`,
    async run(t) {
      await t.settle(4); await t.until(s => s.anchors >= 1, 3);
      const held = () => t.page.evaluate(() => { const a = __hdView.anchors[0]; return a && { held: a.held, x: a.p.x, y: a.p.y, z: a.p.z, cube: a.objs[0].position.distanceTo(a.p) }; });
      const a = await held(); t.ok(a && a.held, 'the phone holds the cube\'s anchor'); t.near(a.y, -1.2, .01); t.near(a.z, -1.5, .01);
      await t.page.evaluate(() => { __ar.shift = { x: .1, y: 0, z: .05 }; });   // the phone corrects its map by 11 cm
      await t.wait(1300); const b = await held(); t.near(Math.hypot(b.x - a.x, b.z - a.z), .112, .01, 'the anchor moved with the map'); t.ok(b.cube < .001, 'the cube stays on its anchor');
      await t.page.evaluate(() => __gs.start()); await t.until(s => s.scan, 3);
      t.ok(await t.page.evaluate(() => Object.keys(__ar.anchors).length === 0), 'the next round lets the old anchors go');
    } },
  { name: 'room: an older app without anchors keeps the spot itself', game: 'ar-lab', set: `s.planes = [{ id: 'f', x: 0, y: -1.3, z: -2, w: 3, d: 3 }]; s.can.anchors = false; s.can.images = false`,
    async run(t) {
      await t.settle(4); await t.wait(800); const a = await t.page.evaluate(() => { const a = __hdView.anchors[0]; return a && { held: a.held, z: a.p.z }; });
      t.ok(a && !a.held, 'not held by the phone'); t.near(a.z, -1.5, .01); t.is((await t.state()).markOk, false);
    } },
  { name: 'room: a picture in the room is found, and a flag stands on it', game: 'ar-lab', set: `s.planes = [{ id: 'f', x: 0, y: -1.3, z: -2, w: 3, d: 3 }]; s.markers['ar-lab'] = { x: .25, y: -1.3, z: -1.3, yaw: .6, w: .14 }`,
    async run(t) {
      await t.settle(4); await t.until(s => s.markFound, 3);
      const m = () => t.page.evaluate(() => { const m = __hdView.markers[0], f = m.objs[0], e = __hdView.eyePos; return { ok: m.ok, found: m.found, tracked: m.tracked, w: m.w, y: m.p.y, far: Math.hypot(m.p.x - e.x, m.p.z - e.z), flag: f.position.distanceTo(m.p), shown: f.visible }; });
      await t.wait(400); let a = await m(); t.ok(a.ok && a.found && a.tracked, `the picture is in sight (${JSON.stringify(a)})`); t.near(a.w, .14, .001); t.near(a.y, -1.3, .01);
      t.ok(a.far > 1 && a.far < 1.7 && a.flag < .01 && a.shown, 'the flag stands on it'); await t.shot('marker');
      await t.page.evaluate(() => { __ar.markers['ar-lab'].x = -2.5; __ar.markers['ar-lab'].z = 2; });   // carried out of sight
      await t.wait(1100); a = await m(); t.ok(a.found && !a.tracked, `out of sight: found, not tracked (${JSON.stringify(a)})`);
    } },
  { name: 'room: a picture the phone turns down', game: 'ar-lab', set: `s.planes = [{ id: 'f', x: 0, y: -1.3, z: -2, w: 3, d: 3 }]; s.badImages = ['ar-lab']; s.markers['ar-lab'] = { x: .25, y: -1.3, z: -1.3 }`,
    async run(t) { await t.settle(4); await t.wait(600); const s = await t.state(); t.is(s.markOk, false); t.ok(!s.markFound, 'never found'); } },
];

(async () => {
  const server = await (await import('vite')).preview({ preview: { port: 4183 } });
  const b = await chromium.launch(GPU ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json') } } : {});
  let failed = 0;
  for (const sc of scenes) {
    if (only && !sc.name.includes(only)) continue;
    const [vw, vh] = (SIZE || '').split('x').map(Number);
    const ctx = await b.newContext({ ...devices['iPhone 13'], ...(vw && vh ? { viewport: { width: vw, height: vh } } : {}), deviceScaleFactor: SHOTS && !SIZE ? 2 : 1 });   // (sharp screenshots at phone size; a big screen drawn in software at 2x is too slow to play)
    await ctx.addInitScript({ path: path.join(__dirname, 'lib/fake-native-ar.js') });
    const page = await ctx.newPage(), errs = [], bad = [], notes = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(m.text()); if (process.env.ALLCON) console.log('  [' + m.type() + '] ' + m.text().slice(0, 400)); });
    await page.goto('http://localhost:4183/'); await page.waitForFunction(() => window.__gs, null, { timeout: 60000 });
    if (GPU && !await page.evaluate(async () => { while (!window.__gpu) await new Promise(r => setTimeout(r, 50)); window.__gpu.pick('webgpu'); return !!(await window.__gpu.ready()); })) { console.log('FAIL WebGPU did not start in this browser'); process.exit(1); }
    await page.evaluate(`{ const s = window.__ar; s.picture = ${!!SHOTS}; ${sc.set} }`);
    await page.evaluate(id => __gs.only(id), sc.game || GAME); await page.waitForTimeout(300);
    await page.evaluate(() => __gs.start());
    const t0 = Date.now();
    const state = () => page.evaluate(() => {
      const v = window.__hdView, n = v && v.nat, f = n && n.ff;
      const st = v && v.status ? v.status() : {}, mk = v && v.markers && v.markers[0];
      return { mode: v ? v.mode : null, nat: !!n, scan: !!(n && n.scan), lost: !!(n && n.lost), calibrating: !!(v && v.calibrating), cal: !!(v && v.cal), src: f ? f.src : null, floor: f ? f.floor : null,
        said: n ? n.say : null, grid: !!(v && v.calGrid.visible), chip: !!(v && v.chip), skip: !!(n && n.skip), yOff: n ? n.yOff : null, camY: v ? v.cam.position.y : null,
        depth: st.depth, walls: st.walls, light: st.light, sun: st.sun, anchors: st.anchors, env: !!(v && v.envSrc), markOk: mk ? mk.ok : null, markFound: !!(mk && mk.found) };
    });
    // the game canvas's colour where a spot in the room is drawn: { alpha, lum } (alpha 0: the camera shows through)
    const pixel = (x, y, z) => page.evaluate(([x, y, z]) => {
      const v = __hdView, cv = __gs.active.canvas, [sx, sy] = v.toScreen(x, y, z), d = cv.getContext('2d').getImageData(Math.round(sx / v.W * cv.width), Math.round(sy / v.H * cv.height), 1, 1).data;
      return { alpha: d[3], lum: Math.round(.2126 * d[0] + .7152 * d[1] + .0722 * d[2]) };
    }, [x, y, z]);
    const t = {
      page, state, pixel,
      cube: () => pixel(0, -1.2, -1.5),   // AR Lab's cube, where it sits on the floor
      wait: ms => page.waitForTimeout(ms),
      async until(fn, secs) { const end = Date.now() + secs * 1000; for (;;) { const s = await state(); if (fn(s) || Date.now() > end) return s; await page.waitForTimeout(80); } },
      // wait for the floor search to end; says how long it took and what the player was told
      // (WebGPU is drawn in software here, several times slower: the same scene is given longer. So is AR Lab:
      // it builds its shaders in its first second, one frozen frame of two seconds or more in software graphics,
      // and the floor finder's clock counts a tenth of a second for any frame, so its second of waiting for
      // feature points ends that much later: 3.2 s on a quiet machine, 4.4 to 4.9 s on a busy one)
      async settle(secs) { const s = await t.until(s => s.nat && !s.scan && s.src, (secs + (sc.game === 'ar-lab' ? LAB_SLOW : 0)) * (GPU ? 3 : 1)); return { ...s, secs: +((Date.now() - t0) / 1000).toFixed(1) }; },
      ok(c, msg) { if (!c) bad.push(msg); },
      note(msg) { notes.push(msg); },   // timings are shown, not judged: a slow test machine isn't a bug
      is(a, e) { if (a !== e) bad.push(`expected ${e}, got ${a}`); },
      near(a, e, tol = .02, msg = '') { if (a == null || Math.abs(a - e) > tol) bad.push(`${msg} expected about ${e}, got ${a}`.trim()); },
      // game units -> page pixels
      async at(x, y) { return page.evaluate(([x, y]) => { const r = __gs.active.canvas.getBoundingClientRect(), [w, h] = __gs.size; return [r.x + x / w * r.width, r.y + y / h * r.height]; }, [x, y]); },
      async tap(what) {
        const k = await page.evaluate(what => { const v = __hdView, b = what === 'skip' ? v.nat.skip : what === 'chip' ? v.chip : v.cal[what]; return b && [b.x + b.w / 2, b.y + b.h / 2]; }, what);
        if (!k) { bad.push(`no ${what} button to tap`); return; }
        const [x, y] = await t.at(...k); await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); await page.waitForTimeout(150);
      },
      async drag(x0, y0, x1, y1) { const a = await t.at(x0, y0), z = await t.at(x1, y1); await page.mouse.move(...a); await page.mouse.down(); await page.mouse.move(...z, { steps: 8 }); await page.waitForTimeout(200); await page.mouse.up(); await page.waitForTimeout(150); },
      async shot(name) { if (SHOTS) { await page.waitForTimeout(350); await page.screenshot({ path: path.join(SHOTS, `ar-floor-${name}.png`) }); } },
    };
    try { await sc.run(t); } catch (e) { bad.push('threw: ' + e.message); }
    bad.push(...errs.map(e => 'page error: ' + e));
    if (GPU) { const on = await page.evaluate(() => window.__hd?.info.backend); if (on !== 'webgpu') bad.push(`drew on ${on}, not WebGPU (${await page.evaluate(() => window.__hd?.info.webgl)})`); }
    console.log(`${bad.length ? 'FAIL' : 'PASS'} ${sc.name}${notes.length ? ` (${notes.join(', ')})` : ''}${bad.length ? '\n   ' + bad.join('\n   ') : ''}`);
    if (bad.length) failed++;
    await ctx.close();
  }
  await b.close(); server.httpServer.close();
  process.exit(failed ? 1 : 0);
})();
