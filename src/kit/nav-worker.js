// Builds a 3D path map (gs.nav3d) off the main thread: a level's triangles in, the map's bytes out,
// for the main thread to read back in (jobs.js runNav). Recast's voxel work is the slow part of a
// path map, tens to hundreds of milliseconds for a level, and none of it needs the page.
import { init, exportNavMesh } from 'recast-navigation';
import { generateSoloNavMesh } from 'recast-navigation/generators';

const ready = init();
self.onmessage = async e => {
  const { id, data } = e.data;
  try {
    await ready;
    const res = generateSoloNavMesh(data.pos, data.idx, data.cfg);
    if (!res.success) throw new Error(res.error || 'no map');
    const bytes = exportNavMesh(res.navMesh); res.navMesh.destroy();
    self.postMessage({ id, r: bytes }, [bytes.buffer]);
  } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};
