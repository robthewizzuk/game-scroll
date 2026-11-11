// Cluster detail's builds, off the main thread (detail.js asks; detail-build.js does the work). A build is
// also saved in the app's own IndexedDB under the key detail.js gives it (the mesh's content), so the
// next launch reads it back instead of building: 'get' answers with the saved build or null, 'build'
// builds, saves and answers. The newest builds stay, up to CAP bytes.
import { buildFrom, buildReady, buffersOf } from './detail-build.js';

const DB = 'gs-detail', CAP = 64 * 1048576;
let dbp = null;
const open = () => dbp ||= new Promise(res => {
  try {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => { rq.result.createObjectStore('builds'); rq.result.createObjectStore('when'); };
    rq.onsuccess = () => res(rq.result); rq.onerror = rq.onblocked = () => res(null);
  } catch (e) { res(null); }
});
const tx = (db, mode, fn) => new Promise(res => { try { const t = db.transaction(['builds', 'when'], mode), r = fn(t.objectStore('builds'), t.objectStore('when')); t.oncomplete = () => res(r?.result); t.onerror = t.onabort = () => res(null); } catch (e) { res(null); } });
const good = d => d && d.index?.length > 0 && d.start?.length > 0 && d.gFirst && d.roots > 0;
async function saved(key) {
  const db = await open(); if (!db) return null;
  const d = await tx(db, 'readonly', b => b.get(key)); if (!good(d)) return null;
  tx(db, 'readwrite', (b, w) => w.put({ t: Date.now(), bytes: d.index.byteLength }, key));   // used just now: the last to be thrown away
  return d;
}
async function save(key, d) {
  const db = await open(); if (!db) return;
  const put = tx(db, 'readwrite', (b, w) => { b.put(d, key); w.put({ t: Date.now(), bytes: d.index.byteLength }, key); });   // (copied into the store as it is put: the build can be handed over straight after)
  put.then(async () => {
    const keys = await tx(db, 'readonly', (b, w) => w.getAllKeys()), whens = await tx(db, 'readonly', (b, w) => w.getAll());
    if (!keys || !whens) return;
    const all = keys.map((k, i) => ({ k, ...whens[i] })).sort((a, b) => b.t - a.t); let sum = 0; const old = [];
    for (const e of all) { sum += e.bytes || 0; if (sum > CAP && e.k !== key) old.push(e.k); }
    if (old.length) tx(db, 'readwrite', (b, w) => { for (const k of old) { b.delete(k); w.delete(k); } });
  });
}
self.onmessage = async e => {
  const { id, op, key } = e.data;
  try {
    if (op === 'get') { const d = await saved(key); self.postMessage({ id, r: d }, d ? buffersOf(d) : []); }
    else if (op === 'build') { await buildReady; const d = buildFrom(e.data.input, e.data.opts); await save(key, d); self.postMessage({ id, r: d }, buffersOf(d)); }
    else if (op === 'clear') { const db = await open(); if (db) await tx(db, 'readwrite', (b, w) => { b.clear(); w.clear(); }); self.postMessage({ id, r: true }); }
    else self.postMessage({ id, error: 'unknown job' });
  } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};
