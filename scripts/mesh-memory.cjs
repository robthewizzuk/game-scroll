// What the meshes of a 3D game cost in memory: every geometry the game's view holds (drawn or not), its
// points counted once however many meshes share them, as bytes in JavaScript and bytes on the graphics chip.
//   npm run build:bundled && node scripts/mesh-memory.cjs [id ...] [--webgpu] [--secs 4] [--top 8] [--json file]
// Without ids: a few of the heaviest Next Gen games. The chip's bytes are worked out from what three.js
// sends (on WebGPU it pads a point's numbers to four bytes and widens whole numbers to 32 bits), not read
// back from the chip. Compare a branch against main with --json before.json, then --vs before.json.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const walk = () => {
  const v = window.__hdView; if (!v) return null;
  const gpu = window.__hd.info.backend === 'webgpu';
  const seenA = new Set(), seenG = new Set(), by = {}, kinds = {}, list = [];
  let js = 0, chip = 0, verts = 0, tris = 0;
  // bytes three.js puts on the chip for one attribute
  const chipBytes = (a, index) => {
    const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array; if (!arr) return 0;
    let b = arr.byteLength;
    if (!gpu || a.isInterleavedBufferAttribute) return b;
    let per = arr.BYTES_PER_ELEMENT, size = a.itemSize;
    if (!a.normalized && per < 4 && !(arr instanceof Float32Array) && !(typeof Float16Array !== 'undefined' && arr instanceof Float16Array) && !index) per = 4;   // (already widened in place once it has drawn)
    let stride = per * size; if (size > 1 && stride % 4) stride = Math.ceil(stride / 4) * 4;
    return a.count * stride;
  };
  const add = (name, a, g, index) => {
    const key = a.isInterleavedBufferAttribute ? a.data : a; if (seenA.has(key)) return 0; seenA.add(key);
    const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array; if (!arr) return 0;
    const j = arr.byteLength, c = chipBytes(a, index), t = arr.constructor.name.replace('Array', '') + 'x' + a.itemSize + (a.normalized ? 'n' : '');
    const e = by[name] ||= { js: 0, chip: 0, types: {} }; e.js += j; e.chip += c; e.types[t] = (e.types[t] || 0) + j;
    js += j; chip += c; return j;
  };
  const kindOf = o => (o.isDetailMesh ? 'cluster detail' : o.isSkinnedMesh ? 'skinned' : o.isInstancedMesh2 || o.isInstancedMesh ? 'copies' : o.isBatchedMesh ? 'batched' : o.isPoints || o.isLine ? 'points and lines' : 'meshes');
  v.scene.traverse(o => {
    const g = o.geometry; if (!g || !g.attributes) return;
    const first = !seenG.has(g); seenG.add(g);
    let mine = 0;
    for (const k in g.attributes) mine += add(k, g.attributes[k], g, false);
    if (g.index) mine += add('index', g.index, g, true);
    for (const k in g.morphAttributes || {}) for (const a of g.morphAttributes[k]) mine += add('morph ' + k, a, g, false);
    if (first && g.attributes.position) { verts += g.attributes.position.count; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; }
    if (mine) { const kd = kindOf(o); kinds[kd] = (kinds[kd] || 0) + mine; let up = ''; if (!o.name) for (let x = o.parent; x && !up; x = x.parent) if (x.name) up = x.name + ' > ';   // (a mesh with no name: under what)
      list.push({ name: (o.name || up + o.type) + (g.name ? ' / ' + g.name : '') + (g.userData.gsSlim ? ' (kept small)' : ''), kind: kd, bytes: mine, verts: g.attributes.position?.count || 0 }); }
  });
  list.sort((a, b) => b.bytes - a.bytes);
  return { backend: window.__hd.info.backend, js, chip, verts, tris: Math.round(tris), geometries: seenG.size, by, kinds, top: list.slice(0, 40), slim: window.__hd.slimmed || null };
};
const mb = n => (n / 1048576).toFixed(2).padStart(7) + ' MB';
(async () => {
  const argv = process.argv.slice(2), take = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
  const gpu = argv.includes('--webgpu'); if (gpu) argv.splice(argv.indexOf('--webgpu'), 1);
  const secs = +(take('--secs') || 4), top = +(take('--top') || 8), json = take('--json'), vs = take('--vs'), tier = take('--tier');
  const ids = argv.length ? argv : ['long-shadow', 'bunker-breakout', 'parcel-dash', 'gravity-grip', 'neon-drift'];
  const server = await (await import('vite')).preview({ preview: { port: +(process.env.PORT || 4191) } });
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && /WebGPU|GPU|shader|pipeline|vertex/i.test(m.text()))) { const t = m.text().slice(0, 300); if (!errs.includes(t) && errs.length < 12) errs.push(t); } });
  await p.goto(`http://localhost:${+(process.env.PORT || 4191)}/`); await p.waitForFunction(() => window.__gs, null, { timeout: 20000 }); await p.waitForTimeout(400);
  const known = await p.evaluate(() => __gs.GAMES.map(g => g.id));
  const out = {}, before = vs ? JSON.parse(fs.readFileSync(vs, 'utf8')) : null;
  let first = true;
  for (const id of ids) {
    if (!known.includes(id)) { console.log(id, 'is not a game'); continue; }
    await p.evaluate(id => __gs.only(id, true), id); await p.waitForTimeout(1200);
    if (first) {
      first = false;
      await p.evaluate(async ([v, t]) => { while (!window.__gpu) await new Promise(r => setTimeout(r, 50)); if (t != null) window.__hd.force = +t; window.__hd.scale = .3; window.__hd.upscale = false; window.__gpu.pick(v); if (v === 'webgpu') await window.__gpu.ready(); }, [gpu ? 'webgpu' : 'webgl', tier]);
      await p.evaluate(id => __gs.only(id, true), id); await p.waitForTimeout(1200);
    }
    await p.evaluate(async () => { for (let i = 0; i < 600 && __gs.active.loading; i++) await new Promise(r => setTimeout(r, 100)); __gs.start(); });
    // (play a little, so background builds arrive: cluster detail, levels for copies, people's finer levels)
    const t0 = Date.now(); let r = null, last = -1, same = 0;
    while (Date.now() - t0 < secs * 1000 || same < 2) {
      await p.waitForTimeout(1000);
      if (await p.evaluate(() => __gs.active.state) !== 'playing') await p.evaluate(() => __gs.start());
      r = await p.evaluate(walk); if (!r) continue;
      same = r.js === last ? same + 1 : 0; last = r.js;
      if (Date.now() - t0 > 60000) break;
    }
    if (!r) { console.log(id, 'drew no 3D view'); continue; }
    out[id] = r;
    const was = before?.[id];
    console.log(`\n${id} (${r.backend}): ${r.geometries} geometries, ${r.verts.toLocaleString()} points, ${r.tris.toLocaleString()} triangles`);
    console.log(`  in JavaScript ${mb(r.js)}${was ? '   was ' + mb(was.js) + '  ' + (r.js / was.js * 100).toFixed(0) + '%' : ''}`);
    console.log(`  on the chip   ${mb(r.chip)}${was ? '   was ' + mb(was.chip) + '  ' + (r.chip / was.chip * 100).toFixed(0) + '%' : ''}`);
    console.log('  by what holds it: ' + Object.entries(r.kinds).sort((a, c) => c[1] - a[1]).map(([k, n]) => `${k} ${(n / 1048576).toFixed(2)}`).join(', '));
    for (const [k, e] of Object.entries(r.by).sort((a, c) => c[1].js - a[1].js)) console.log(`    ${k.padEnd(16)} ${mb(e.js)}  chip ${mb(e.chip)}   ${Object.entries(e.types).map(([t, n]) => t + ' ' + (n / 1048576).toFixed(2)).join(', ')}`);
    for (const t of r.top.slice(0, top)) console.log(`      ${mb(t.bytes)}  ${String(t.verts).padStart(7)} pts  ${t.kind.padEnd(14)} ${t.name.slice(0, 60)}`);
    if (r.slim) console.log('  kept small by the engine: ' + JSON.stringify(r.slim));
    if (errs.length) { console.log('  errors: ' + errs.join(' | ').slice(0, 400)); errs.length = 0; }
  }
  if (json) fs.writeFileSync(json, JSON.stringify(out));
  await b.close(); server.httpServer.close();
})();
