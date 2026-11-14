// Sculpts gs.models.human's pieces off the main thread (see human-shapes.js): a job in, plain arrays out.
import { sculpt, thinReady } from './human-shapes.js';
import { gnmReady } from './human-gnm.js';

self.onmessage = async e => {
  const { id, job } = e.data;
  try {
    await thinReady;
    if (job.a?.face?.gnm) await gnmReady();   // (a GNM face: the whole skin's numbers, the first time one is sculpted)
    const p = sculpt(job);
    self.postMessage({ id, p }, [p.P.buffer, p.N.buffer, p.slot.buffer, p.ao.buffer, p.SI.buffer, p.SW.buffer, ...p.I.map(i => i.buffer), ...(p.thin ? [p.thin.buffer] : []), ...(p.strips ? [p.strips.P, p.strips.N, p.strips.U, p.strips.at, p.strips.dim, p.strips.I, p.strips.edge.at, p.strips.edge.to, p.strips.edge.k].map(a => a.buffer) : [])]);
  } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};
