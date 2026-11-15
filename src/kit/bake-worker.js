// Baked light's rays, off the main thread (bake-light.js asks; bake-trace.js does the work). A worker keeps the level it was
// given ('scene', or 'have': one another worker built) and then takes slices of it to trace ('probes', 'texels'), or a light
// map's texels to find ('map'); the first also reads and writes the store ('read', 'write': bake-store.js). It answers the
// way jobs.js's workers do ({ id, r } or { id, error }), its arrays handed over without a copy.
import { bakeReady, buildScene, Rays, bakeProbes, bakeTexels, mapTexels } from './bake-trace.js';
import { aoBytes } from './bake-grid.js';
import { open, readTiles, writeTiles } from './bake-store.js';

const scenes = new Map();
self.onmessage = async e => {
  const { id, kind, data } = e.data;
  try {
    await bakeReady;
    // the level: built here (and its tree sent back, for the other workers), or a tree another worker built
    if (kind === 'scene') { const s = buildScene(data.job); scenes.clear(); scenes.set(data.key, new Rays(s)); self.postMessage({ id, r: { n: s.n, was: s.was, nodes: s.nodes, T: s.T } }); return; }
    if (kind === 'have') { scenes.clear(); scenes.set(data.key, new Rays(data.scene)); self.postMessage({ id, r: 1 }); return; }
    if (kind === 'hello') { open(); self.postMessage({ id, r: 1 }); return; }
    // the store (bake-store.js): kept tiles read back, new ones kept
    if (kind === 'read') { self.postMessage({ id, r: await readTiles(data.keys) }); return; }
    if (kind === 'write') { await writeTiles(data.recs); self.postMessage({ id, r: 1 }); return; }
    if (kind === 'map') { const m = mapTexels(data.geo, data.m, data.size); self.postMessage({ id, r: m }, [m.pos.buffer, m.nrm.buffer, m.at.buffer]); return; }
    const rays = scenes.get(data.key); if (!rays) throw new Error('no level ' + data.key);
    if (kind === 'probes') { const r = bakeProbes(rays, data); self.postMessage({ id, r }, [r.buffer]); return; }
    if (kind === 'texels') { const r = aoBytes(bakeTexels(rays, data)); self.postMessage({ id, r }, [r.buffer]); return; }
    throw new Error('no job ' + kind);
  } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};
