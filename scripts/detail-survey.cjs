// Where the triangles are in the Next Gen, AR and Board games, and which of them cluster detail draws:
// plays each game a few seconds on WebGL, then lists every drawn mesh of 2,000 triangles or more (instanced
// copies counted in full), whether a cluster twin draws it, and if not, why not.
//   npm run build:bundled && node scripts/detail-survey.cjs [id ...] [--json out.json]
const { chromium, devices } = require('playwright');
const fs = require('fs');
(async () => {
  const argv = process.argv.slice(2), ji = argv.indexOf('--json'), jout = ji >= 0 ? argv.splice(ji, 2)[1] : null;
  const server = await (await import('vite')).preview({ preview: { port: 4186 } });
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 })).newPage();
  await p.goto('http://localhost:4186/'); await p.waitForFunction(() => window.__gs, null, { timeout: 20000 });
  const eras = await p.evaluate(() => Object.fromEntries(__gs.GAMES.map(g => [g.id, g.era])));
  const ids = argv.length ? argv : Object.keys(eras).filter(id => ['nextgen', 'ar', 'board'].includes(eras[id]));
  const all = {};
  for (const id of ids) {
    await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(1500);
    // (a Next Gen game shows a loading screen after Play: started again until it plays, then a few seconds of play)
    let t0 = Date.now(), played = 0;
    while (Date.now() - t0 < 40000 && played < 12) { if (await p.evaluate(() => __gs.active.state) !== 'playing') await p.evaluate(() => __gs.start()); else played++; await p.waitForTimeout(500); }
    const r = await p.evaluate(id => {
      const v = window.__hdView; if (!v || !v.scene.getObjectsByProperty) return null;
      const twins = new Set(); for (const e of v.details?.map.values() || []) if (e.twin) twins.add(e.o);
      const out = []; let total = 0, inTwins = 0;
      v.scene.traverseVisible(o => {
        if (!o.isMesh || o.name === 'gs-detail') return;
        if (o.userData.gsDetailed) { const g = o.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); total += t; inTwins += t; if (t >= 2000) out.push({ name: o.name || o.type, per: Math.round(t), n: 1, tris: Math.round(t), why: 'TWIN' }); return; }
        const g = o.userData.gsLod?.base || o.geometry; if (!g?.attributes?.position) return;
        const per = (g.index ? g.index.count : g.attributes.position.count) / 3, n = o.isInstancedMesh ? o.count : o.isInstancedMesh2 ? (o._instancesArrayCount || o.instancesCount || 1) : 1, tris = per * n;
        total += tris; if (twins.has(o)) inTwins += tris;
        if (tris < 2000) return;
        const m = o.userData.gsGlMat || o.material, why = [];
        if (twins.has(o)) why.push('TWIN');
        else {
          if (o.isSkinnedMesh) why.push('skinned'); if (o.morphTargetInfluences) why.push('morph');
          if (o.isInstancedMesh || o.isInstancedMesh2) why.push('instanced'); if (o.isBatchedMesh) why.push('batched');
          if (Array.isArray(m)) why.push('materials:' + m.length);
          else if (m) { if (m.transparent) why.push('see-through'); if (m.alphaTest > 0 || m.alphaHash) why.push('alpha-test'); if (m.positionNode || m.displacementMap) why.push('moving-points'); if (m.isShaderMaterial) why.push('shader'); if (Object.hasOwn(m, 'onBeforeCompile')) why.push('obc'); }
          if (o.userData.detail === false) why.push('opted-out'); if (o.userData.gsReflect) why.push('reflector');
          if ((o.layers.mask & 0xffffff) !== 1) why.push('layer'); if (!o.frustumCulled) why.push('no-cull');
          if (o.onBeforeRender !== Object.getPrototypeOf(o).onBeforeRender && Object.hasOwn(o, 'onBeforeRender')) why.push('own-hook');
          if (o.isMesh && n === 1 && per < (window.__hd.detailMin || 8000) && !why.length) why.push('small');
          if (o.isCutMesh || o.isDetailMesh) return;
          if (!why.length) why.push('?');
        }
        out.push({ name: o.name || g.name || o.type, per: Math.round(per), n, tris: Math.round(tris), why: why.join(' ') });
      });
      out.sort((a, b) => b.tris - a.tris);
      return { total: Math.round(total), inTwins: Math.round(inTwins), meshes: out.slice(0, 14) };
    }, id);
    all[id] = r;
    if (!r) { console.log(id, 'no view'); continue; }
    console.log(`\n${id}: ${r.total.toLocaleString()} triangles shown, ${r.inTwins.toLocaleString()} through cluster detail`);
    for (const m of r.meshes) console.log(`  ${String(m.tris).padStart(9)} ${(m.per + (m.n > 1 ? ' x' + m.n : '')).padEnd(14)} ${m.why.padEnd(28)} ${m.name}`);
  }
  if (jout) fs.writeFileSync(jout, JSON.stringify(all, null, 1));
  await b.close(); server.httpServer.close(); process.exit(0);
})();
