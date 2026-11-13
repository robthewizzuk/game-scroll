// Sculpts gs.models.human's pieces off the main thread (see human-shapes.js): a job in, plain arrays out.
import { sculpt, thinReady } from './human-shapes.js';

self.onmessage = async e => {
  const { id, job } = e.data;
  try {
    await thinReady;
    const p = sculpt(job);
    self.postMessage({ id, p }, [p.P.buffer, p.N.buffer, p.slot.buffer, p.ao.buffer, p.SI.buffer, p.SW.buffer, ...p.I.map(i => i.buffer), ...(p.thin ? [p.thin.buffer] : [])]);
  } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};
