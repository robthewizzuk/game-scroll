// The traced level's blocks, built off the main thread (hd3d-gpu-trace.js asks through jobs.js;
// trace-build.js does the work): a job in ({ id, kind: 'block', data }), the block's arrays out
// ({ id, r }), their buffers handed over without a copy.
import { buildBlock, blockBuffers, traceReady } from './trace-build.js';

self.onmessage = async e => {
  const { id, data } = e.data;
  try { await traceReady; const r = buildBlock(data); self.postMessage({ id, r }, blockBuffers(r)); }
  catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};
