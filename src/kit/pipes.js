// Shaders a round built in the middle of play, built under the loading screen the next time (WebGPU).
//
// A 3D round builds nearly all its shaders before it starts: under the loading screen (getReady in src/main.js)
// and in the kit's background builds (hd3d.js holdNew, buildAhead). What it still meets for the first time in the
// middle of play (an effect first used a minute in, a shadow for a new kind of mesh, a thing the game makes
// late) has its pipeline made then, by the graphics driver: a frame that stops while it compiles (tens to
// hundreds of milliseconds on a phone), or, built in the background, a thing that shows up late. Unity traces
// these (PSO tracing) and Godot bakes them ahead (its shader baker). Here a game's own rounds are the trace.
//
// While a round is being played, each pipeline the shared WebGPU device makes for the first time is noted for
// that game: its whole descriptor, with the WGSL text of its shaders and its layouts (plain WebGPU, nothing of
// three's). The notes are kept on this phone (IndexedDB 'gs-pipes', squeezed). The next time a card of that
// game is the one on screen, the same pipelines are made again in the background (createRenderPipelineAsync:
// the browser's own threads, no frame waits for them), the loading screen waits a little for them (a soft
// wait: GATE.soft at most), and they are kept while the card is on screen. A browser's WebGPU hands back the
// pipeline it already holds when asked for an identical one (Dawn: Chrome, Android's web view, the Mac and
// Windows app), so when three asks for it in the round it is there at once. What the round makes is kept
// too, so "Play again" doesn't build what three let go of.
//
// A note that is then not used (the kit's shaders changed in an app update, another quality tier, a part of
// the game not reached) is dropped after MISS rounds of real play in a row without it. At most MAX pipelines
// a game, the KEEP games played last. A new three.js (rev) starts the notes again.
// Kit use only: games never see this. The app says which card is on screen and when its round is played.
import { waitsOn } from './getready.js';

const DB = 'gs-pipes', STORE = 'games', V = 1;
export const PIPES = { MAX: 96, KEEP: 40, MISS: 3, playedMs: 20000, on: true };

let dev = null, rev = '';
const meta = new WeakMap();   // shader module -> { code, h }; bind group layout and pipeline layout -> { d: plain data }
let everMade = new Set();     // pipelines this device has made this session (by key)
const cards = new Map();      // card -> { id, keys (noted pipelines made again for it), used, made (pipelines held), left, dev, played }
const recs = new Map();       // game id -> { id, pipes: [{ key, kind, d, miss }], mods: { hash: WGSL }, has: Set, loaded, dirty }
let front = null, playingCard = null, playingAt = 0;
const stats = { noted: 0, primed: 0, ready: 0, failed: 0, hits: 0, saves: 0, made: 0, midRound: 0, midRoundReady: 0 };
const saving = new Set();

// a short hash of a string (cyrb53)
function hash(s) {
  let a = 0xdeadbeef, b = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677); }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (b >>> 0).toString(36) + (a >>> 0).toString(36);
}
const NOPE = new Error('not ours');
const isGpu = v => (typeof GPUShaderModule !== 'undefined' && v instanceof GPUShaderModule) || (typeof GPUBindGroupLayout !== 'undefined' && v instanceof GPUBindGroupLayout) || (typeof GPUPipelineLayout !== 'undefined' && v instanceof GPUPipelineLayout);
// A descriptor as plain data, keys in order and labels left out: a shader module as { $m: hash } (its text in mods),
// a layout as what made it. Throws NOPE for a module or layout the watched device did not make.
function plain(v, mods) {
  if (v == null || typeof v !== 'object') return v;
  const m = meta.get(v);
  if (m) {
    if (m.code === undefined) return m.d;
    if (!m.h) m.h = hash(m.code);
    if (mods) mods[m.h] = m.code;
    return { $m: m.h };
  }
  if (isGpu(v)) throw NOPE;
  if (Array.isArray(v)) return v.map(x => plain(x, mods));
  const o = {};
  for (const k of Object.keys(v).sort()) if (k !== 'label' && v[k] !== undefined && typeof v[k] !== 'function') o[k] = plain(v[k], mods);
  return o;
}

/**
 * gpu.js: the shared WebGPU device, once made (and the new one after a loss). Its pipelines are noted from now
 * on, and the cards on screen have theirs made on it. revision: three's, so notes from another three start again.
 */
export function watchDevice(d, revision = '') {
  if (!d || d === dev) return;
  if (!d.gsPipes) {
    const o = d.gsPipes = {};
    const wrap = (k, after) => {
      const f = d[k]; if (typeof f !== 'function') return;
      o[k] = f.bind(d);
      d[k] = function (desc) { const out = f.call(d, desc); if (d === dev) try { after(desc, out, k); } catch (_) { /* not noted */ } return out; };
    };
    wrap('createShaderModule', (desc, m) => { if (typeof desc?.code === 'string') meta.set(m, { code: desc.code, h: '' }); });
    wrap('createBindGroupLayout', (desc, x) => meta.set(x, { d: { $bgl: plain(desc?.entries || []) } }));
    wrap('createPipelineLayout', (desc, x) => meta.set(x, { d: { $pl: (desc?.bindGroupLayouts || []).map(l => plain(l)) } }));
    for (const k of ['createRenderPipeline', 'createRenderPipelineAsync', 'createComputePipeline', 'createComputePipelineAsync']) wrap(k, made);
  }
  dev = d; rev = String(revision); everMade = new Set();
  // what was held was on the last device: the cards on screen have theirs made again on this one
  for (const [card, H] of cards) { H.made.clear(); H.keys.clear(); H.used.clear(); H.left = 0; H.dev = null; startPrime(card, H); }
}

// the device made a pipeline (three, or a kit): note it if a round is being played and it is new
function made(desc, out, kind) {
  if (!PIPES.on) return;
  const mods = {};
  let d; try { d = plain(desc, mods); } catch (e) { return; }
  const compute = kind.includes('Compute'), key = hash((compute ? 'c' : 'r') + JSON.stringify(d));
  const first = !everMade.has(key); everMade.add(key); stats.made++;
  let had = false;
  for (const H of cards.values()) if (H.keys.has(key)) { had = true; if (!H.used.has(key)) { H.used.add(key); stats.hits++; } }
  const card = playingCard, H = card && cards.get(card);
  if (!H) return;
  // held while the card is on screen (Play again, a thing made again after three let it go)
  if (out && typeof out.then === 'function') out.then(p => { if (cards.get(card) === H && H.dev === dev) H.made.set(key, p); }, () => {}); else if (out) H.made.set(key, out);
  if (!first) return;   // (made before this session, out of the round: under the loading screen, or by an earlier card)
  stats.midRound++; if (had) stats.midRoundReady++;
  const R = record(H.id);
  if (R.has.has(key)) return;
  R.pipes.push({ key, kind: compute ? 'compute' : 'render', d, miss: 0 }); R.has.add(key);
  Object.assign(R.mods, mods); R.dirty = true; stats.noted++;
  while (R.pipes.length > PIPES.MAX) R.has.delete(R.pipes.shift().key);
}
function record(id) {
  let R = recs.get(id);
  if (!R) recs.set(id, R = { id, pipes: [], mods: {}, has: new Set(), loaded: false, dirty: false });
  return R;
}

/** The app: a card of this game is the one on screen. What its rounds made before is made now, in the background. */
export function primePipes(card, id) {
  if (!PIPES.on || cards.has(card)) return;
  const H = { id, keys: new Set(), used: new Set(), made: new Map(), left: 0, dev: null, played: 0 };
  cards.set(card, H); front = H;
  startPrime(card, H);
}
function startPrime(card, H) {
  if (!dev || H.dev === dev) return;
  const d = H.dev = dev;
  H.left++;   // (reading the notes)
  load(H.id).then(R => { if (R && cards.get(card) === H && H.dev === d) build(H, R, d); }).catch(() => {}).finally(() => { H.left--; });
}
// plain data back into WebGPU objects, made with the device's own methods (not noted again), then the pipelines
function build(H, R, d) {
  const o = d.gsPipes, mods = new Map(), bgls = new Map();
  const live = v => {
    if (v == null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(live);
    if (v.$m) { let m = mods.get(v.$m); if (!m) { const code = R.mods[v.$m]; if (typeof code !== 'string') throw NOPE; mods.set(v.$m, m = o.createShaderModule({ code })); } return m; }
    if (v.$bgl) { const k = JSON.stringify(v); let l = bgls.get(k); if (!l) bgls.set(k, l = o.createBindGroupLayout({ entries: live(v.$bgl) })); return l; }
    if (v.$pl) return o.createPipelineLayout({ bindGroupLayouts: v.$pl.map(live) });
    const x = {}; for (const k in v) x[k] = live(v[k]); return x;
  };
  for (const e of R.pipes) {
    if (H.made.has(e.key) || e.bad) continue;
    H.keys.add(e.key);
    let p = null;
    d.pushErrorScope('validation');
    try { const desc = live(e.d); p = e.kind === 'compute' ? o.createComputePipelineAsync(desc) : o.createRenderPipelineAsync(desc); } catch (err) { e.bad = true; }
    // (a note this device refuses is dropped; one that fails because the device went is not: the next device makes it)
    d.popErrorScope().then(err => { if (err) e.bad = true; }, () => {});
    if (!p) { stats.failed++; continue; }
    H.left++; stats.primed++;
    p.then(x => { stats.ready++; if (H.dev === d) H.made.set(e.key, x); }, err => { if (err?.reason === 'validation') e.bad = true; stats.failed++; }).finally(() => { H.left--; });
  }
}

/** The app: the card left the screen (or the feed). Its pipelines are let go, and its notes kept up to date. */
export function releasePipes(card) {
  const H = cards.get(card); if (!H) return;
  if (playingCard === card) playingPipes(null);
  cards.delete(card); if (front === H) front = null;
  const R = recs.get(H.id);
  // a note not made again over a real round counts against it; one made again is fine again
  if (R && R.loaded && (H.played >= PIPES.playedMs || R.pipes.some(e => e.bad))) {
    const n = R.pipes.length;
    for (const e of R.pipes) if (H.keys.has(e.key)) { if (H.used.has(e.key)) e.miss = 0; else if (H.played >= PIPES.playedMs) e.miss++; }
    R.pipes = R.pipes.filter(e => !e.bad && e.miss < PIPES.MISS); R.has = new Set(R.pipes.map(e => e.key));
    if (R.pipes.length !== n || H.played >= PIPES.playedMs) R.dirty = true;
  }
  if (R?.dirty) save(H.id);
  H.made.clear();
  // (the notes of a game no card shows are let go of once they are saved)
  if (R && ![...cards.values()].some(x => x.id === H.id)) Promise.all([...saving]).then(() => { if (!R.dirty && ![...cards.values()].some(x => x.id === H.id)) recs.delete(H.id); });
}

/** The app, each frame: the card whose round is being played now (not paused, not getting ready), or null. */
export function playingPipes(card) {
  card ||= null;
  if (card === playingCard) return;
  const now = performance.now(), was = playingCard, W = was && cards.get(was);
  if (W) { W.played += now - playingAt; const R = recs.get(W.id); if (R?.dirty) save(W.id); }
  playingCard = card; playingAt = now;
}

// What the loading screen waits a little for: the card on screen's pipelines still being made
waitsOn(() => front && front.left > 0 ? { soft: front.left, what: 'Shaders' } : null);
if (typeof addEventListener === 'function') addEventListener('visibilitychange', () => { if (document.hidden) for (const R of recs.values()) if (R.dirty) save(R.id); });

/* ---------- kept on this phone ---------- */
let dbp = null;
const open = () => dbp ||= new Promise(res => {
  try { const rq = indexedDB.open(DB, V); rq.onupgradeneeded = () => rq.result.createObjectStore(STORE); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); }
  catch (e) { res(null); }
});
const tx = (db, mode, fn) => new Promise(res => { try { const t = db.transaction(STORE, mode), s = t.objectStore(STORE), r = fn(s); t.oncomplete = () => res(r?.result); t.onerror = t.onabort = () => res(null); } catch (e) { res(null); } });
async function squeeze(text) {
  if (typeof CompressionStream === 'undefined') return text;
  try { return await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob(); } catch (e) { return text; }
}
async function unsqueeze(v) { return typeof v === 'string' ? v : await new Response(v.stream().pipeThrough(new DecompressionStream('gzip'))).text(); }
// the notes for a game: the ones in memory, else read back (merged into any noted this session before the read)
async function load(id) {
  const R = record(id);
  if (R.loaded) return R;
  const db = await open(), e = db && await tx(db, 'readonly', s => s.get(id));
  if (!R.loaded) {
    R.loaded = true;
    try {
      if (e && e.rev === rev && e.v === V) {
        const got = JSON.parse(await unsqueeze(e.data)), old = (got.pipes || []).filter(p => !R.has.has(p.key));
        R.pipes = [...old, ...R.pipes]; R.has = new Set(R.pipes.map(p => p.key));
        R.mods = { ...got.mods, ...R.mods };
      }
    } catch (err) { /* unreadable: started again */ }
  }
  return R;
}
function save(id) {
  const R = recs.get(id); if (!R || !R.dirty) return;
  R.dirty = false;
  const job = (async () => {
    if (!R.loaded) await load(id);   // (noted before its notes were read: the two are merged first)
    const used = new Set(); for (const e of R.pipes) JSON.stringify(e.d, (k, v) => { if (k === '$m') used.add(v); return v; });
    const mods = {}; for (const h of used) if (R.mods[h]) mods[h] = R.mods[h];
    R.mods = mods;
    const data = await squeeze(JSON.stringify({ pipes: R.pipes.map(({ key, kind, d, miss }) => ({ key, kind, d, miss })), mods }));
    const db = await open(); if (!db) return;
    await tx(db, 'readwrite', s => R.pipes.length ? s.put({ v: V, rev, t: Date.now(), n: R.pipes.length, data }, id) : s.delete(id));
    stats.saves++;
    // the games played last are kept
    const all = []; await tx(db, 'readonly', s => { const c = s.openCursor(); c.onsuccess = () => { const x = c.result; if (!x) return; all.push([x.key, x.value.t || 0]); x.continue(); }; return c; });
    if (all.length > PIPES.KEEP) { all.sort((a, b) => b[1] - a[1]); await tx(db, 'readwrite', s => { for (const [k] of all.slice(PIPES.KEEP)) s.delete(k); }); }
  })().catch(() => {}).finally(() => saving.delete(job));
  saving.add(job);
}

/* ---------- tests ---------- */
/** What has been noted, made ahead and found again this session (tests, the frame lab). */
export function pipeStats() {
  const H = front;
  return {
    watching: !!dev, playing: (playingCard && cards.get(playingCard)?.id) || null, ...stats,
    front: H && { id: H.id, noted: H.keys.size, used: H.used.size, held: H.made.size, left: H.left, played: Math.round(H.played) },
    games: [...recs.values()].map(R => ({ id: R.id, pipes: R.pipes.length, shaders: Object.keys(R.mods).length, dirty: R.dirty, loaded: R.loaded })),
  };
}
/** Tests: wait for the notes being saved. */
export const pipesSaved = () => Promise.all([...saving]);
/** Tests: save every game's notes now. */
export function savePipes() { for (const R of recs.values()) if (R.dirty || R.pipes.length) { R.dirty = true; save(R.id); } return pipesSaved(); }
/** Forgets every note (tests). */
export async function forgetPipes() { recs.clear(); const db = await open(); if (db) await tx(db, 'readwrite', s => s.clear()); }
/** Tests: a game's notes as they are now ({ pipes: [{ key, kind, d, miss }], mods: { hash: WGSL } }), or null. */
export const pipeNotes = id => { const R = recs.get(id); return R ? { pipes: R.pipes.map(e => ({ ...e })), mods: { ...R.mods } } : null; };
