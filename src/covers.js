// A Next Gen, AR or Board game's card in the feed is a picture, not the game (src/main.js sleep()): nothing of the
// game is made until Play is pressed, so scrolling past one costs what scrolling past a photo does. The picture is
// the game as it looked the last time it was played on this phone: taken from its 3D canvas at the end of a round
// (one small copy, when the game-over screen comes up, never in play) and kept here, in IndexedDB, as a small JPEG.
// A game never played yet shows a cover drawn in code (main.js drawCover). App code only: games never see this.

const DB = 'gs-covers', STORE = 'pics', KEEP = 120, PX = 300;   // KEEP pictures, the games played last; PX: the longest side
let dbp = null;
const open = () => dbp ||= new Promise(res => {
  try { const rq = indexedDB.open(DB, 1); rq.onupgradeneeded = () => rq.result.createObjectStore(STORE); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); }
  catch (e) { res(null); }
});
const tx = (db, mode, fn) => new Promise(res => { try { const t = db.transaction(STORE, mode), r = fn(t.objectStore(STORE)); t.oncomplete = () => res(r?.result); t.onerror = t.onabort = () => res(null); } catch (e) { res(null); } });
const pics = new Map();   // id -> a promise of the picture (an ImageBitmap) or null, read once a session

export const covers = {
  /** The game's saved picture, ready to draw (an ImageBitmap), or null. */
  get(id) {
    let p = pics.get(id);
    if (!p) pics.set(id, p = (async () => {
      const db = await open(), e = db && await tx(db, 'readonly', s => s.get(id));
      if (!e || !(e.pic instanceof Blob) || typeof createImageBitmap !== 'function') return null;
      try { return await createImageBitmap(e.pic); } catch (_) { return null; }   // (decoded off the main thread)
    })());
    return p;
  },
  /**
   * Keep a picture of the game: src is its 3D canvas, read now, in the same frame it was drawn in (a WebGPU or WebGL
   * canvas is only readable until the frame is shown). w x h: the card's shape. The copy is small, and its encoding
   * and saving happen afterwards. Gives the copy (to show at once), or null.
   */
  take(id, src, w, h) {
    if (!src || !src.width || !src.height || typeof document === 'undefined') return null;
    const k = Math.min(1, PX / Math.max(w, h)), cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const x = cv.getContext('2d'); if (!x) return null;
    // (the 3D canvas has the card's shape; cover it the way the card shows it)
    const s = Math.max(cw / src.width, ch / src.height), dw = src.width * s, dh = src.height * s;
    x.fillStyle = '#0b0f14'; x.fillRect(0, 0, cw, ch);
    try { x.drawImage(src, (cw - dw) / 2, (ch - dh) / 2, dw, dh); } catch (_) { return null; }
    const dark = (() => { try { const d = x.getImageData(0, 0, cw, ch).data; let sum = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 97) { sum += d[i] + d[i + 1] + d[i + 2]; n++; } return sum / Math.max(1, n) < 6; } catch (_) { return false; } })();
    if (dark) return null;   // (an empty frame: the canvas was read too late, or the game's last frame was black)
    cv.toBlob(async b => {
      if (!b) return;
      pics.set(id, Promise.resolve(cv));
      const db = await open(); if (!db) return;
      await tx(db, 'readwrite', s => s.put({ pic: b, t: Date.now() }, id));
      const all = []; await tx(db, 'readonly', s => { const c = s.openCursor(); c.onsuccess = () => { const r = c.result; if (!r) return; all.push([r.key, r.value?.t || 0]); r.continue(); }; return c; });
      if (all.length > KEEP) { all.sort((a, b) => b[1] - a[1]); await tx(db, 'readwrite', s => { for (const [k2] of all.slice(KEEP)) s.delete(k2); }); }
    }, 'image/jpeg', .78);
    return cv;
  },
  /** Settings › Clear cache, and tests. */
  async clear() { pics.clear(); const db = await open(); if (db) await tx(db, 'readwrite', s => s.clear()); },
};
