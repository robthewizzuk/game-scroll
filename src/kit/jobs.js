// Work off the main thread: the kit's heavy number work (a texture's normal map and roughness
// copies, a recipe material's pixels, a sculpted mesh) done in background workers while a card says
// "Loading…", so the feed and the game being played keep moving. Plain data in, plain arrays out
// (job-worker.js; path maps in nav-worker.js, barcodes in code-worker.js). Up to three workers, started when there is work and
// let go a few seconds after.
// A phone with no workers, or a worker that won't start, just means the work is done on the main
// thread as before: every caller keeps its own way of doing the job there.
// Kit use only (slices.js decides when a builder may wait for a worker).
const MOST = () => Math.max(1, Math.min(3, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency || 4) - 1));

// a pool of up to most() workers, each made by start()
function pool(start, most) {
  const idle = [], waiting = new Map(), queue = [], stats = { started: 0, done: 0, failed: 0, workers: 0 };
  let workers = 0, off = typeof Worker !== 'function', seq = 0, rest = 0;
  function pump() {
    clearTimeout(rest);
    while (queue.length && !off) {
      let w = idle.pop();
      if (!w && workers < most()) {
        try {
          w = start(); workers++; stats.workers = workers;
          w.onmessage = e => {
            const q = waiting.get(e.data.id); waiting.delete(e.data.id); idle.push(w);
            if (q) { if (e.data.error === undefined) { stats.done++; q.res(e.data.r); } else { stats.failed++; q.rej(new Error(e.data.error)); } }
            pump();
          };
          // a worker that won't start (or dies): its job, and everything after, is done on the main thread instead
          w.onerror = () => { off = true; workers--; stats.workers = workers; for (const [id, q] of waiting) if (q.w === w) { waiting.delete(id); stats.failed++; q.rej(new Error('worker')); } pump(); };
        } catch (e) { off = true; break; }
      }
      if (!w) break;
      const q = queue.shift(), id = ++seq; q.w = w; waiting.set(id, q);
      try { w.postMessage({ id, kind: q.kind, data: q.data }, q.transfer); }
      catch (e) { waiting.delete(id); idle.push(w); stats.failed++; q.rej(e); }   // (something in the job that can't be sent: the caller does it here)
    }
    if (off) for (const q of queue.splice(0)) { stats.failed++; q.rej(new Error('worker')); }
    if (!queue.length && !waiting.size) rest = setTimeout(() => { for (const w of idle.splice(0)) { w.terminate(); workers--; } stats.workers = workers; }, 4000);
  }
  return {
    stats, canRun: () => !off,
    run(kind, data, transfer = []) {
      if (off) return Promise.reject(new Error('worker'));
      stats.started++;
      return new Promise((res, rej) => { queue.push({ kind, data, transfer, res, rej }); pump(); });
    },
  };
}
const work = pool(() => new Worker(new URL('./job-worker.js', import.meta.url), { type: 'module' }), MOST);
// path maps have a worker of their own: it carries the path-finding engine, which the others don't need
const maps = pool(() => new Worker(new URL('./nav-worker.js', import.meta.url), { type: 'module' }), () => 1);
// and so does the barcode reader (gs.vision's Scanner): it carries ZXing
const codes = pool(() => new Worker(new URL('./code-worker.js', import.meta.url), { type: 'module' }), () => 1);

// and so do creatures (gs.models.creature): they carry the sculptor people are made with
const beasts = pool(() => new Worker(new URL('./models/creature-worker.js', import.meta.url), { type: 'module' }), MOST);

// tests and the loading measurements read this (nothing else does)
export const stats = work.stats, navStats = maps.stats;
/** Can work be handed to a worker here? (No: do it on the spot.) */
export const canRun = work.canRun, canRunNav = maps.canRun;
/**
 * Runs one job in a worker: kind is a job job-worker.js knows ('surface', 'recipe', 'sculpt'), data
 * what it needs (plain values and arrays), transfer the array buffers in data to hand over without a
 * copy (they are gone from here afterwards). A promise of the answer; it rejects when the job failed
 * or there are no workers, and the caller then does the work itself.
 */
export const run = work.run;
/** The same for a path map (nav-worker.js): data { pos, idx, cfg }, the answer the map's bytes. */
export const runNav = (data, transfer) => maps.run('nav', data, transfer);
/** The same for a creature (creature-worker.js): data its plan, the answer its sculpted piece. canRunCreature(): is there a worker for it? */
export const runCreature = plan => beasts.run('creature', plan), canRunCreature = beasts.canRun;
/** The same for a look for barcodes (code-worker.js): data { pixels, w, h, opts }, the answer what it found. canRunCode(): is there a worker for it? */
export const runCode = (data, transfer) => codes.run('code', data, transfer), canRunCode = codes.canRun;
