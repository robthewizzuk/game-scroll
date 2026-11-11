// Sculpts gs.models.creature's meshes off the main thread (see creature-shapes.js): a plan in, plain arrays out.
// It answers the way jobs.js's workers do ({ id, r } or { id, error }).
import { sculpt, thinReady } from './creature-shapes.js';

self.onmessage = async e => {
  const { id, data } = e.data;
  try {
    await thinReady;
    const p = sculpt(data);
    self.postMessage({ id, r: p }, [p.P.buffer, p.N.buffer, p.slot.buffer, p.ao.buffer, p.SI.buffer, p.SW.buffer, ...p.I.map(i => i.buffer)]);
  } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};
