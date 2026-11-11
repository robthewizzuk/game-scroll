// The bookkeeping behind gs.vision's Objects and Scanner (vision.js): the 80 everyday things the object
// model knows by name, the kinds of barcode, the seed a code gives, how the camera picture is cut to
// the shape a game shows it in, and what counts as "in view" and "just arrived". No camera and no
// library in here, so all of it is checked in Node (scripts/kit-test.mjs).

/** The 80 things Objects can spot (the names of the COCO pictures its model learned from). */
export const NAMES = Object.freeze(['person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
  'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe',
  'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove',
  'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich',
  'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv',
  'laptop', 'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase',
  'scissors', 'teddy bear', 'hair drier', 'toothbrush']);
// other words a game maker might reach for
const ALSO = { phone: 'cell phone', mobile: 'cell phone', sofa: 'couch', plant: 'potted plant', table: 'dining table', ball: 'sports ball',
  fridge: 'refrigerator', 'hair dryer': 'hair drier', hairdryer: 'hair drier', aeroplane: 'airplane', plane: 'airplane', motorbike: 'motorcycle',
  bike: 'bicycle', television: 'tv', telly: 'tv', teddy: 'teddy bear', racket: 'tennis racket', glass: 'wine glass', doughnut: 'donut',
  mug: 'cup', bag: 'handbag', rucksack: 'backpack', lorry: 'truck', 'remote control': 'remote', computer: 'laptop' };
/** The model's name for a thing ('phone' is 'cell phone'), or null if it isn't one of the 80. */
export const nameOf = n => { const k = String(n ?? '').toLowerCase().trim(); return NAMES.includes(k) ? k : ALSO[k] || null; };

/** The kinds of code Scanner reads. */
export const KINDS = Object.freeze(['qr', 'ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-128', 'code-39', 'code-93', 'codabar', 'itf', 'data-matrix', 'aztec', 'pdf417']);
// codes with strong error checks of their own are believed at one look; the striped ones at two alike
const SQUARE = new Set(['qr', 'data-matrix', 'aztec', 'pdf417']);
// the phone's own reader (the web's BarcodeDetector) and ZXing each have their own names for them
const PHONE = { qr_code: 'qr', ean_13: 'ean-13', ean_8: 'ean-8', upc_a: 'upc-a', upc_e: 'upc-e', code_128: 'code-128', code_39: 'code-39', code_93: 'code-93',
  codabar: 'codabar', itf: 'itf', data_matrix: 'data-matrix', aztec: 'aztec', pdf417: 'pdf417' };
const ZXING = { QRCode: 'qr', EAN13: 'ean-13', EAN8: 'ean-8', UPCA: 'upc-a', UPCE: 'upc-e', Code128: 'code-128', Code39: 'code-39', Code93: 'code-93',
  Codabar: 'codabar', ITF: 'itf', DataMatrix: 'data-matrix', Aztec: 'aztec', PDF417: 'pdf417' };
// ZXing names the exact variety it read ('QRCodeModel2', 'ITF14', 'ISBN'): each belongs to one of ours
const VARIETY = { QRCodeModel1: 'qr', QRCodeModel2: 'qr', ISBN: 'ean-13', Code39Std: 'code-39', Code39Ext: 'code-39', ITF14: 'itf', AztecCode: 'aztec', CompactPDF417: 'pdf417' };
/** Our name for a reader's format name ('qr_code' and 'QRCode' are both 'qr'), or null for one we don't offer. */
export const kindOf = f => PHONE[f] || ZXING[f] || VARIETY[f] || null;
/** The reader's own names for a list of our kinds: phoneKinds(['qr']) is ['qr_code'], zxingKinds(['qr']) is ['QRCode']. */
export const phoneKinds = kinds => Object.keys(PHONE).filter(f => kinds.includes(PHONE[f]));
export const zxingKinds = kinds => Object.keys(ZXING).filter(f => kinds.includes(ZXING[f]));

/**
 * The seed a text gives: a whole number from 0 to 4,294,967,295, the same for the same code on every
 * phone, and far apart for codes that differ by one digit. A 13-digit code that starts with 0 is the
 * 12-digit code after it (see reads()), so both give one seed.
 */
export function seedOf(text) {
  let s = String(text ?? '').trim();
  if (/^0\d{12}$/.test(s)) s = s.slice(1);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

/**
 * How a camera picture vw x vh is cut to a shape (width / height; 0 keeps the camera's own): the part
 * of the camera picture to take (sx, sy, sw, sh: its middle) and the size to draw it at (w, h: no
 * bigger than `size` on its long side, and never bigger than the camera gave).
 */
export function cut(vw, vh, shape, size) {
  const want = shape > 0 ? shape : vw / vh;
  let sw = vw, sh = vh;
  if (vw / vh > want) sw = vh * want; else sh = vw / want;
  const k = Math.min(1, size / Math.max(sw, sh));
  return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh, w: Math.max(1, Math.round(sw * k)), h: Math.max(1, Math.round(sh * k)) };
}

/**
 * What is in view, from one look to the next. A key (a thing's name, a code's text) counts as in view
 * once it has shown up `hold` looks in a row (a number, or a function of the key and what was seen),
 * and as gone after `gone` looks without it, so one blurry frame neither makes a thing appear nor
 * makes it vanish.
 *   look(now)   one look: a Map of key -> what was seen. Gives the keys that came into view on this look.
 *   on(key)     in view now
 *   it(key)     what was last seen of it while in view (or null)
 *   all()       what was last seen of everything in view, longest in view first
 */
export class InView {
  constructor({ hold = 2, gone = 3 } = {}) { this.hold = hold; this.gone = gone; this.at = new Map(); }
  look(now) {
    const came = [];
    for (const [k, it] of now) {
      let e = this.at.get(k); if (!e) this.at.set(k, e = { hits: 0, misses: 0, on: false, it: null });
      e.hits++; e.misses = 0; e.it = it;
      if (!e.on && e.hits >= (typeof this.hold === 'function' ? this.hold(k, it) : this.hold)) { e.on = true; came.push(k); }
    }
    for (const [k, e] of this.at) if (!now.has(k)) { e.hits = 0; if (++e.misses >= this.gone || !e.on) this.at.delete(k); }
    return came;
  }
  on(k) { return !!this.at.get(k)?.on; }
  it(k) { const e = this.at.get(k); return e?.on ? e.it : null; }
  all() { const out = []; for (const e of this.at.values()) if (e.on) out.push(e.it); return out; }
  clear() { this.at.clear(); }
}

/**
 * One look's object finds, tidied: results is MediaPipe's ObjectDetector answer (detections with a
 * boundingBox in pixels and scored categories), w and h the picture's size, mirror whether the picture
 * was flipped like a selfie after the look. Gives [{ name, sure, x, y (the middle), w, h, left, top }]
 * in 0..1 of the picture, surest first, only the wanted names (null: all) at `sure` or better, `max` at most.
 */
export function finds(results, w, h, { want = null, sure = .5, max = 5, mirror = false } = {}) {
  const out = [];
  for (const d of results?.detections || []) {
    const c = d.categories?.[0], b = d.boundingBox, name = c && nameOf(c.categoryName);
    if (!name || !b || c.score < sure || (want && !want.includes(name))) continue;
    const l = Math.max(0, b.originX / w), t = Math.max(0, b.originY / h), r = Math.min(1, (b.originX + b.width) / w), bt = Math.min(1, (b.originY + b.height) / h);
    if (r <= l || bt <= t) continue;
    const left = mirror ? 1 - r : l;
    out.push({ name, sure: c.score, x: left + (r - l) / 2, y: (t + bt) / 2, w: r - l, h: bt - t, left, top: t });
  }
  return out.sort((a, b) => b.sure - a.sure).slice(0, max);
}

/**
 * One look's codes, tidied: list is [{ text, format, corners: [{ x, y } x 4] }] in picture pixels from
 * either reader. Gives [{ text, kind, seed, x, y (the middle), w, h, left, top, corners }] in 0..1 of
 * the picture; codes with no text, or of a kind not asked for, are left out. A shop's 12-digit UPC-A
 * is also a 13-digit EAN-13 with a 0 in front, and readers differ on which they say: here it is always
 * 'upc-a' with 12 digits, so a code reads the same on every phone.
 */
export function reads(list, w, h, { kinds = KINDS, mirror = false } = {}) {
  const out = [];
  for (const r of list || []) {
    let kind = kindOf(r.format), text = String(r.text ?? '').trim();
    if (kind === 'ean-13' && /^0\d{12}$/.test(text)) { kind = 'upc-a'; text = text.slice(1); }
    if (!kind || !text || !(kinds.includes(kind) || (kind === 'upc-a' && kinds.includes('ean-13')))) continue;
    const corners = (r.corners || []).map(p => ({ x: Math.min(1, Math.max(0, mirror ? 1 - p.x / w : p.x / w)), y: Math.min(1, Math.max(0, p.y / h)) }));
    const xs = corners.map(p => p.x), ys = corners.map(p => p.y);
    const left = xs.length ? Math.min(...xs) : 0, top = ys.length ? Math.min(...ys) : 0, wd = xs.length ? Math.max(...xs) - left : 1, ht = ys.length ? Math.max(...ys) - top : 1;
    out.push({ text, kind, seed: seedOf(text), x: left + wd / 2, y: top + ht / 2, w: wd, h: ht, left, top, corners });
  }
  return out;
}
/** How many looks alike before a code is believed: 1 for the square kinds (they check themselves), 2 for stripes. */
export const looksFor = kind => SQUARE.has(kind) ? 1 : 2;
