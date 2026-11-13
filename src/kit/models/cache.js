// Textures made in code, kept across launches (gs.models materials): the first time a material is
// made its pictures are saved, squeezed as WebP, in the app's own IndexedDB; next launch they are
// read back while the 3D parts load, so making it again costs nothing. The newest 64 stay.
//
// When the phone runs short of memory (src/kit/memory.js: low or critical) the pictures read back are let
// go of (a material already made keeps its own; one made after that is painted again), and read back once
// memory is fine again.
// Kit use only (games can't reach storage; they just ask gs.models for a material).
import { onMemory } from '../memory.js';

const DB = 'gs-bakes', STORE = 'bakes', KEEP = 64, VERSION = 1;
const mem = new Map();   // key -> { w, h, layers: { name: ImageBitmap } }
const saved = new Set(); // the keys in the database, so a bake painted again isn't saved twice
let dbp = null, dropped = false;
const open = () => dbp ||= new Promise(res => {
  try {
    const rq = indexedDB.open(DB, VERSION);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
    rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null);
  } catch (e) { res(null); }
});
const tx = (db, mode, fn) => new Promise(res => { try { const t = db.transaction(STORE, mode), s = t.objectStore(STORE), r = fn(s); t.oncomplete = () => res(r?.result); t.onerror = t.onabort = () => res(null); } catch (e) { res(null); } });

/** Reads the saved bakes into memory (the 3D parts wait for this while loading; never rejects). */
export async function warm() {
  const db = await open(); if (!db) return;
  const all = await tx(db, 'readonly', s => s.getAll()); if (!all) return;
  all.sort((a, b) => b.t - a.t);
  await Promise.all(all.slice(0, KEEP).map(async e => {
    saved.add(e.key); if (mem.has(e.key)) return;
    try { const layers = {}; for (const [k, blob] of Object.entries(e.layers)) layers[k] = await createImageBitmap(blob); mem.set(e.key, { w: e.w, h: e.h, layers }); } catch (err) { /* a bad entry is just made again */ }
  }));
  if (all.length > KEEP) tx(db, 'readwrite', s => { for (const e of all.slice(KEEP)) s.delete(e.key); });
}
/** The saved pictures for key ({ w, h, layers }), or null. */
export const get = key => mem.get(key) || null;
/** Saves canvases (name -> canvas) under key, in the background. */
export function put(key, canvases) {
  const first = Object.values(canvases)[0]; if (!first) return;
  mem.set(key, { w: first.width, h: first.height, layers: canvases });
  if (saved.has(key)) return; saved.add(key);
  (async () => {
    const db = await open(); if (!db) return;
    const layers = {};
    for (const [k, c] of Object.entries(canvases)) {
      const blob = await new Promise(r => { try { c.toBlob(r, 'image/webp', .92); } catch (e) { r(null); } });
      if (!blob) return; layers[k] = blob;
    }
    tx(db, 'readwrite', s => s.put({ key, w: first.width, h: first.height, t: Date.now(), layers }, key));
  })();
}
/** Forgets every saved bake (Settings › clear cache, tests). */
export async function clear() { mem.clear(); saved.clear(); const db = await open(); if (db) await tx(db, 'readwrite', s => s.clear()); }

/** Lets go of the pictures read back from storage (they stay saved). Returns how many bakes. */
export function drop() {
  let n = 0;
  for (const [k, e] of mem) {
    const L = Object.values(e.layers);
    if (typeof ImageBitmap === 'undefined' || !L.some(b => b instanceof ImageBitmap)) continue;   // (a canvas painted this run: a material holds it anyway)
    for (const b of L) try { b.close?.(); } catch (_) { /* already gone */ }
    mem.delete(k); n++;
  }
  if (n) dropped = true;
  return n;
}
/** How many bakes are held in memory now, and whether some were let go of (tests, the frame lab). */
export const held = () => ({ bakes: mem.size, dropped });
onMemory(level => {
  if (level >= 2) drop();
  else if (!level && dropped) { dropped = false; warm(); }   // fine again: read them back
});
