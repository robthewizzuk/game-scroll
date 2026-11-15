// Baked light's store on the phone (bake-light.js): IndexedDB, a record a tile. Read and written in a bake worker where there
// is one (bake-worker.js), so a busy main thread (a loading screen building shaders) doesn't hold up each answer; on the
// main thread where there are none.
// Kit use only.
const DB = 'gs-light', STORE = 'tiles', KEEP = 1500;
let dbp = null;
export const open = () => dbp ||= new Promise(res => {
  try {
    if (typeof indexedDB === 'undefined') return res(null);
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
    rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null);
  } catch (e) { res(null); }
});
export async function readTiles(keys) {
  const out = new Map(), db = await open(); if (!db || !keys.length) return out;
  return new Promise(res => {
    try {
      const t = db.transaction(STORE, 'readonly'), s = t.objectStore(STORE);
      for (const k of keys) { const r = s.get(k); r.onsuccess = () => { if (r.result) out.set(k, r.result); }; }
      t.oncomplete = () => res(out); t.onerror = t.onabort = () => res(out);
    } catch (e) { res(out); }
  });
}
let writes = 0;
export async function writeTiles(recs) {
  const db = await open(); if (!db || !recs.length) return;
  try {
    const t = db.transaction(STORE, 'readwrite'), s = t.objectStore(STORE), now = Date.now();
    for (const [k, v] of recs) s.put({ ...v, t: now }, k);
    // now and then, the oldest go (a phone keeps a few levels' worth)
    if ((writes += recs.length) > 200) { writes = 0; const all = s.getAllKeys(); all.onsuccess = () => { if (all.result.length > KEEP) trim(db); }; }
  } catch (e) { /* storage full or gone: baked again next time */ }
}
function trim(db) {
  try {
    const t = db.transaction(STORE, 'readwrite'), s = t.objectStore(STORE), c = s.openCursor(), ages = [];
    c.onsuccess = () => { const r = c.result; if (r) { ages.push([r.value.t || 0, r.key]); r.continue(); } else { ages.sort((a, b) => a[0] - b[0]); for (const [, k] of ages.slice(0, ages.length - KEEP)) s.delete(k); } };
  } catch (e) { /* nothing */ }
}
/** Forgets every kept bake (Settings › clear cache, tests). */
export async function clearBakes() { const db = await open(); if (!db) return; await new Promise(res => { try { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).clear(); t.oncomplete = t.onerror = () => res(); } catch (e) { res(); } }); }

