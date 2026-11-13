// Fill-ins for old Android System WebViews (Chrome 92 to 98), which some phones and Google Play's
// own test devices still run. Games are only ever tried on a current browser, so without these a
// game that draws a rounded box, or a library that asks Object.hasOwn, ends its round with a script
// error there. Each one is added only where the browser has none of its own. Loaded first by main.js.

/** roundRect for 2D canvases and paths (Chrome 99). radii: a number, { x, y }, or a list of one to four of those. */
function roundRect(x, y, w, h, radii = 0) {
  if (![x, y, w, h].every(Number.isFinite)) return;
  const list = Array.isArray(radii) ? radii : [radii];
  if (!list.length || list.length > 4) throw new RangeError(`${list.length} radii provided. Between one and four radii are necessary.`);
  const r = [];
  for (const v of list) {
    const p = v && typeof v === 'object' ? { x: +v.x || 0, y: +v.y || 0 } : { x: +v, y: +v };
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    if (p.x < 0 || p.y < 0) throw new RangeError('A radius is negative.');
    r.push(p);
  }
  // top left, top right, bottom right, bottom left (each its own copy: they may be scaled below)
  let [tl, tr, br, bl] = (r.length === 1 ? [0, 0, 0, 0] : r.length === 2 ? [0, 1, 0, 1] : r.length === 3 ? [0, 1, 2, 1] : [0, 1, 2, 3]).map(i => ({ ...r[i] }));
  // a negative width or height draws the same box from its other side
  if (w < 0) { x += w; w = -w; [tl, tr, br, bl] = [tr, tl, bl, br]; }
  if (h < 0) { y += h; h = -h; [tl, tr, br, bl] = [bl, br, tr, tl]; }
  // corners too big for the box are all scaled down together
  const k = Math.min(w / (tl.x + tr.x), h / (tr.y + br.y), w / (br.x + bl.x), h / (tl.y + bl.y));
  if (k < 1) for (const c of [tl, tr, br, bl]) { c.x *= k; c.y *= k; }
  const Q = Math.PI / 2;
  this.moveTo(x + tl.x, y);
  this.lineTo(x + w - tr.x, y); this.ellipse(x + w - tr.x, y + tr.y, tr.x, tr.y, 0, -Q, 0);
  this.lineTo(x + w, y + h - br.y); this.ellipse(x + w - br.x, y + h - br.y, br.x, br.y, 0, 0, Q);
  this.lineTo(x + bl.x, y + h); this.ellipse(x + bl.x, y + h - bl.y, bl.x, bl.y, 0, Q, 2 * Q);
  this.lineTo(x, y + tl.y); this.ellipse(x + tl.x, y + tl.y, tl.x, tl.y, 0, 2 * Q, 3 * Q);
  this.closePath();
  this.moveTo(x, y);
}

/** structuredClone (Chrome 98) for what games and kits copy: plain data, lists, Map, Set, Date and number arrays. */
function clone(v, seen = new Map()) {
  if (typeof v === 'function' || typeof v === 'symbol') throw new DOMException('That could not be cloned.', 'DataCloneError');
  if (v === null || typeof v !== 'object') return v;
  if (seen.has(v)) return seen.get(v);
  const keep = out => { seen.set(v, out); return out; };
  if (v instanceof Date) return keep(new Date(v.getTime()));
  if (v instanceof RegExp) return keep(new RegExp(v.source, v.flags));
  if (v instanceof ArrayBuffer) return keep(v.slice(0));
  if (ArrayBuffer.isView(v)) return keep(v instanceof DataView ? new DataView(v.buffer.slice(0), v.byteOffset, v.byteLength) : v.slice());
  if (v instanceof Map) { const out = keep(new Map()); for (const [k, x] of v) out.set(clone(k, seen), clone(x, seen)); return out; }
  if (v instanceof Set) { const out = keep(new Set()); for (const x of v) out.add(clone(x, seen)); return out; }
  const out = keep(Array.isArray(v) ? new Array(v.length) : {});
  for (const k of Object.keys(v)) out[k] = clone(v[k], seen);
  return out;
}

const add = (on, name, value) => { if (on && typeof on[name] !== 'function') Object.defineProperty(on, name, { value, writable: true, configurable: true }); };

for (const kind of ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'Path2D']) add(globalThis[kind]?.prototype, 'roundRect', roundRect);
// Object.hasOwn (Chrome 93)
add(Object, 'hasOwn', (obj, key) => { if (obj == null) throw new TypeError('Cannot convert undefined or null to object'); return Object.prototype.hasOwnProperty.call(obj, key); });
add(globalThis, 'structuredClone', v => clone(v));
