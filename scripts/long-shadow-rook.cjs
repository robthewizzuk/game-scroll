// Sgt. Rook, the marksman in the church tower in Long Shadow's mission 2, has to be seen and shot through the scope. Plays the mission
// the real way on WebGPU at a phone's size (brief, intro, the climb to the chapel loft), then from each nest he is shot from (the chapel
// loft, 203 m, and the windmill, 243 m) scopes on him as he aims and checks that he is drawn (pictures with and without him), that his
// eyes are over the parapet and a line at his head reaches him (not the parapet, not the bell), that ducked all of him is under the
// parapet's top, and that a real round (the game's own fire(), aimed for the drop and the wind) takes him down.
// He went missing through the scope once: the feet-on-the-ground planting reached for the land 17 m below the belfry and sank him
// 45 cm, right behind the parapet. Runs the source with a dev server (a hook in make() to reach the round's state). Slow: about 5 min.
//   node scripts/long-shadow-rook.cjs [--size 475x751] [--dpr 1] [--tier 1]
const { chromium } = require('playwright'); const path = require('path'); const os = require('os');
const argv = process.argv.slice(2), arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const [VW, VH] = arg('--size', '475x751').split('x').map(Number), DPR = +arg('--dpr', 1), TIER = +arg('--tier', 1), OUT = os.tmpdir();
(async () => {
  const { createServer } = await import('vite');
  const hook = { name: 'ls-hook', enforce: 'pre', transform(code, id) {
    if (!/src[\\/]games[\\/]long-shadow\.js/.test(id)) return null;
    const out = code.replace('function make(api) {', 'function make(api) { globalThis.__ls = c => eval(c);');
    if (out === code) throw new Error('long-shadow.js: no make(api) to hook'); return { code: out, map: null };
  } };
  const server = await createServer({ mode: 'bundled', server: { port: 4196, hmr: false }, logLevel: 'error', plugins: [hook] }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
  const p = await (await b.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true })).newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  const t0 = Date.now(), say = s => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
  await p.goto('http://localhost:4196/'); await p.waitForFunction(() => window.__gs, null, { timeout: 180000 });
  await p.evaluate(async () => { while (!window.__gpu) await new Promise(r => setTimeout(r, 50)); window.__gpu.pick('webgpu'); await window.__gpu.ready(); });
  await p.evaluate(() => __gs.only('long-shadow', true));
  await p.waitForFunction(() => __gs.active && !__gs.active.loading && window.__ls, null, { timeout: 600000, polling: 1000 });
  const L = c => p.evaluate(c => { try { const r = __ls(c); return r === undefined ? null : JSON.parse(JSON.stringify(r, (k, v) => typeof v === 'number' ? +v.toFixed(4) : v)); } catch (e) { return 'ERR ' + e.message; } }, c);
  // __ff(sec, dt): run the round's update by hand (the app's own loop still draws); frames(n): wait for n drawn frames
  await p.evaluate(t => { const g = __gs.active.game; window.__ff = (sec, dt = 1 / 30) => { for (let i = 0, n = Math.round(sec / dt); i < n; i++) g.update(dt); }; __hd.force = t; }, TIER);
  const frames = n => p.evaluate(async n => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)); }, n);
  await p.evaluate(() => __gs.start()); await p.waitForFunction(() => __gs.active.state === 'playing', null, { timeout: 120000 });
  say(`ready on ${await p.evaluate(() => __gpu.name || 'webgpu')}, ${VW}x${VH} at ${DPR}x`);
  // mission 2 the real way: the brief, its level loaded, Go, the intro and the climb to the first nest
  await L(`move = null; state = 'brief'; built = false; sel = "m2"; WD.regions.want(sel); 1`);
  for (let i = 0; i < 1200 && !await L('WD.regions.has(sel)'); i++) { await p.evaluate(() => __ff(.1)); await p.waitForTimeout(250); }
  if (!await L('WD.regions.has(sel)')) throw new Error('mission 2 was not made in time');
  await L(`begin(sel); go(); 1`);
  for (let i = 0; i < 400; i++) { await p.evaluate(() => __ff(.25)); await frames(1); const s = await L('[state, !!move, mission.time]'); if (s[0] === 'play' && !s[1] && s[2] > .5) break; }
  say('in the mission ' + JSON.stringify(await L(`[state, nestId, (mission.objectives || []).filter(o => !o.done).map(o => o.text)]`)));
  if (await L('state') !== 'play') throw new Error('mission 2 did not start: ' + await L('state'));
  const out = [], bad = [];
  const aimHead = `(() => { const e = WD.v.cam.position, h = new gs.THREE.Vector3(); cs.m.bones.head.getWorldPosition(h); h.y += .1; const dx = h.x - e.x, dy = h.y - e.y, dz = h.z - e.z; look.yaw = Math.atan2(-dx, -dz); look.pitch = Math.atan2(dy, Math.hypot(dx, dz)); return 1; })()`;
  const crop = async (k) => p.evaluate(k => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x + c.width * (1 - k) / 2, y: c.y + c.height * (1 - k) / 2, width: c.width * k, height: c.height * k }; }, k);
  for (const nestName of ['chapel', 'mill2']) {
    if (nestName !== await L('nestId')) { await L(`move = null; arrive('${nestName}', true); 1`); for (let i = 0; i < 4; i++) { await p.evaluate(() => __ff(.1)); await frames(1); } }
    // he comes up and aims as he does in play (not hiding), and holds his shot while we look
    await L(`cs.hideT = 0; cs.to = null; cs.see = .5; cs.fireT = 99; cs.aimT = 0; scoped = true; glass = false; zoom = 12; 1`);
    for (let i = 0; i < 12; i++) { await L(aimHead); await p.evaluate(() => __ff(1 / 15)); await frames(1); }
    const m = await L(`(() => { const v = new gs.THREE.Vector3(), e = WD.v.cam.position; cs.m.bones.head.getWorldPosition(v); const head = v.y; cs.m.bones.eyeL.getWorldPosition(v); const eyes = v.y, par = WD.churchTop.y + .95;
      const sph = hitSpheres(cs, SPH)[0], ex = sph[0] - e.x, ey = sph[1] - e.y, ez = sph[2] - e.z, h = hitTest(e.x, e.y, e.z, e.x + ex * 1.01, e.y + ey * 1.01, e.z + ez * 1.01);
      return { nest: nestId, dist: +Math.hypot(ex, ez).toFixed(1), stance: cs.m.rig.state, plantDrop: +(cs.m.rig.plantDrop || 0).toFixed(2), eyesOverParapet: +(eyes - par).toFixed(2), headOverParapet: +(head - par).toFixed(2), lineHits: h ? (h.s === cs ? 'rook ' + (h.head ? 'head' : 'body') : h.box ? 'box ' + (h.box.kind || '') : h.bell ? 'bell' : h.ground ? 'ground' : 'other') : 'nothing' }; })()`);
    say(JSON.stringify(m));
    if (!(m.eyesOverParapet > .15)) bad.push(`${nestName}: his eyes are only ${m.eyesOverParapet} m over the parapet`);
    if (m.lineHits !== 'rook head') bad.push(`${nestName}: a line at his head hits ${m.lineHits}`);
    // ducked behind the parapet (between shots): all of him under its top, as the hit test has it (out of reach)
    await L(`cs.hideT = 30; 1`); for (let i = 0; i < 12; i++) await p.evaluate(() => __ff(1 / 15));
    const dk = await L(`(() => { const v = new gs.THREE.Vector3(); cs.m.bones.head.getWorldPosition(v); return +(v.y + .13 - WD.churchTop.y - .95).toFixed(2); })()`);
    say(`  ${nestName}: ducked, the top of his head is ${dk} m from the parapet's top`); if (dk > 0) bad.push(`${nestName}: ducked, his head shows over the parapet (${dk} m) where shots can't reach him`);
    await L(`cs.hideT = 0; cs.to = null; 1`); for (let i = 0; i < 12; i++) { await L(aimHead); await p.evaluate(() => __ff(1 / 15)); }
    // drawn? the scope's middle with him and without him
    const clip = await crop(.34);
    await L(aimHead); await frames(2);
    const a = await p.screenshot({ clip, path: path.join(OUT, 'long-shadow-rook-' + nestName + '.png'), timeout: 300000 });
    await L(`cs.m.visible = false; WD.hideRook = true; 1`);
    const vis0 = await L(`(() => { const u = cs.m.visible; return u; })()`);
    await p.evaluate(() => { const v = __ls('WD.v'); if (!v.__rr) { v.__rr = v.render.bind(v); v.render = (...a) => { if (__ls('WD.hideRook')) __ls('cs').m.visible = false; return v.__rr(...a); }; } });
    await frames(2);
    const b = await p.screenshot({ clip, timeout: 300000 });
    await L(`WD.hideRook = false; cs.m.visible = true; 1`);
    const diff = await p.evaluate(async ([A, B]) => {
      const load = async b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
      const a = await load(A), b = await load(B); let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++; return n;
    }, [a.toString('base64'), b.toString('base64')]);
    say(`  ${nestName}: ${diff} pixels change when he is taken out of the picture (${path.join(OUT, 'long-shadow-rook-' + nestName + '.png')})`);
    if (diff < 20) bad.push(`${nestName}: he is not in the picture (${diff} pixels)`);
  }
  {
    // a real round: aim for the drop and the wind by flying test bullets (the game's own stepBullet), breath held, then fire()
    const r = await L(`(() => { const e = WD.v.cam.position; cs.fireT = 99; cs.aimT = 0; breath.held = true; breath.v = 1;
      const tgt = () => { const q = hitSpheres(cs, SPH)[1]; return { x: q[0], y: q[1], z: q[2] }; };
      let T = tgt(), yaw = Math.atan2(-(T.x - e.x), -(T.z - e.z)), pitch = Math.atan2(T.y - e.y, Math.hypot(T.x - e.x, T.z - e.z));
      for (let it = 0; it < 8; it++) {
        const d = dirOf(yaw, pitch + BORE, tmpB), b = { x: e.x, y: e.y - .05, z: e.z, vx: d.x * V0, vy: d.y * V0, vz: d.z * V0, life: 3 }, D = Math.hypot(T.x - e.x, T.z - e.z);
        while (Math.hypot(b.x - e.x, b.z - e.z) < D && b.life > 0) stepBullet(b, 1 / 240);
        const want = Math.atan2(T.x - e.x, T.z - e.z), got = Math.atan2(b.x - e.x, b.z - e.z);
        pitch += Math.atan2(T.y - b.y, D); let dw = want - got; dw -= Math.round(dw / (2 * Math.PI)) * 2 * Math.PI; yaw += dw;
      }
      look.yaw = yaw; look.pitch = pitch; return { yaw, pitch }; })()`);
    say('aim ' + JSON.stringify(r));
    for (let i = 0; i < 40 && await L('gun.cool > 0 || gun.reloadLeft > 0'); i++) { await p.evaluate(() => __ff(1 / 30)); }
    await L(`look.yaw = ${r.yaw}; look.pitch = ${r.pitch}; breath.held = true; breath.v = 1; 1`);
    say('fire ' + JSON.stringify(await L(`(() => { const n = shots.length, a = gun.ammo; fire(); return { shots: shots.length - n, ammo: a + ' -> ' + gun.ammo, bulletCam: !!bulletCam, predicted: bulletCam ? (bulletCam.target === cs ? 'rook' : 'other') : null }; })()`)));
    for (let i = 0; i < 120; i++) { await p.evaluate(() => __ff(1 / 30)); if (i % 6 === 0) await frames(1); if (await L('cs.ko')) break; }
    const ko = await L('cs.ko'); say('real shot: Rook ' + (ko ? 'DOWN' : 'still up') + ' ' + JSON.stringify(await L(`[shots.length, !!bulletCam, mission.objectives.filter(o => !o.done).map(o => o.text)]`)));
    if (!ko) bad.push('a real round aimed at his chest did not take him down');
  }
  if (errors.length) bad.push('page errors: ' + errors.slice(0, 3).join(' | '));
  console.log(bad.length ? 'FAIL\n  ' + bad.join('\n  ') : 'PASS: Rook is drawn, above the parapet and in the line of fire from every nest, and a real round takes him down');
  await b.close(); await server.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
