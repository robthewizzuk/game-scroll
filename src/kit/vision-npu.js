// Face and hand tracking on the phone's AI chip (the NPU), for gs.vision. The camera is read natively and
// the models run in ONNX Runtime (Qualcomm's NPU on Snapdragon phones, the Neural Engine through Core
// ML on iPhones, the CPU elsewhere); only the landmarks come back to the game. This file is the part in
// between: where to look in each camera frame (the face or palm detector, then following the last
// landmarks), and turning the models' numbers into the same landmarks MediaPipe gives on the web, so
// vision.js's Face and Hands read them the same way either way.
//
// The steps and numbers follow Google's MediaPipe face and hand landmarker graphs (Apache-2.0), whose
// models these are (converted to ONNX by scripts/npu-models.py). The engine that runs them is passed
// in: the native one (npu.js) in the app, ONNX Runtime Web in scripts/npu-test.
// Kit use only.

/* ---------- SSD anchors and decoding (MediaPipe SsdAnchorsCalculator, TensorsToDetectionsCalculator) ---------- */
function anchors(size, strides) {
  const out = [];
  for (let i = 0; i < strides.length;) {
    const s = strides[i]; let per = 0;
    while (i < strides.length && strides[i] === s) { per += 2; i++; }   // two anchors a layer (aspect 1 and the interpolated one)
    const n = Math.ceil(size / s);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let k = 0; k < per; k++) out.push([(x + .5) / n, (y + .5) / n]);
  }
  return out;
}
const FACE_ANCHORS = anchors(128, [8, 16, 16, 16]);   // 896
const PALM_ANCHORS = anchors(192, [8, 16, 16, 16]);   // 2016
const sigmoid = v => 1 / (1 + Math.exp(-Math.max(-100, Math.min(100, v))));

function decode(boxes, scores, anc, size, kps, minScore) {
  const out = [], per = 4 + kps * 2;
  for (let i = 0; i < anc.length; i++) {
    const s = sigmoid(scores[i]); if (s < minScore) continue;
    const b = i * per, [ax, ay] = anc[i];
    const cx = boxes[b] / size + ax, cy = boxes[b + 1] / size + ay, w = boxes[b + 2] / size, h = boxes[b + 3] / size;
    const k = []; for (let j = 0; j < kps; j++) k.push([boxes[b + 4 + j * 2] / size + ax, boxes[b + 5 + j * 2] / size + ay]);
    out.push({ s, x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, k });
  }
  return out;
}
const iou = (a, b) => {
  const w = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), h = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)), i = w * h;
  return i / ((a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - i || 1);
};
// weighted non-max suppression: overlapping detections are averaged by score
function wnms(ds, thr, max) {
  ds = ds.sort((a, b) => b.s - a.s); const out = [];
  while (ds.length && out.length < max) {
    const top = ds[0], near = ds.filter(d => iou(top, d) > thr); ds = ds.filter(d => iou(top, d) <= thr);
    const tw = near.reduce((a, d) => a + d.s, 0), avg = f => near.reduce((a, d) => a + f(d) * d.s, 0) / tw;
    out.push({ s: top.s, x0: avg(d => d.x0), y0: avg(d => d.y0), x1: avg(d => d.x1), y1: avg(d => d.y1), k: top.k.map((_, j) => [avg(d => d.k[j][0]), avg(d => d.k[j][1])]) });
  }
  return out;
}

/* ---------- rectangles (MediaPipe DetectionsToRects, RectTransformation) ---------- */
// A rect is { cx, cy, w, h, a } in camera pixels, a = rotation in radians (clockwise, as y points down).
const norm = a => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
const angle = (x0, y0, x1, y1, target) => norm(target - Math.atan2(-(y1 - y0), x1 - x0));
function transform(r, { scale = 1, shiftY = 0 }) {
  const c = Math.cos(r.a), s = Math.sin(r.a), dx = -r.h * shiftY * s, dy = r.h * shiftY * c;
  const side = Math.max(r.w, r.h) * scale;    // square, the long side
  return { cx: r.cx + dx, cy: r.cy + dy, w: side, h: side, a: r.a };
}
/** A point in the model's input (0..1 across the crop) back to camera pixels. */
export function fromCrop(r, u, v) {
  const c = Math.cos(r.a), s = Math.sin(r.a), x = (u - .5) * r.w, y = (v - .5) * r.h;
  return [r.cx + x * c - y * s, r.cy + x * s + y * c];
}
// the detectors look at the whole picture fitted into a square (with bars), like MediaPipe's letterbox
const whole = (W, H) => ({ cx: W / 2, cy: H / 2, w: Math.max(W, H), h: Math.max(W, H), a: 0 });

/* ---------- faces ---------- */
const FACE_SUBSET = [0, 1, 4, 5, 6, 7, 8, 10, 13, 14, 17, 21, 33, 37, 39, 40, 46, 52, 53, 54, 55, 58, 61, 63, 65, 66, 67, 70, 78, 80, 81, 82, 84, 87, 88, 91, 93, 95, 103, 105, 107, 109, 127, 132, 133, 136, 144, 145, 146, 148, 149, 150, 152, 153, 154, 155, 157, 158, 159, 160, 161, 162, 163, 168, 172, 173, 176, 178, 181, 185, 191, 195, 197, 234, 246, 249, 251, 263, 267, 269, 270, 276, 282, 283, 284, 285, 288, 291, 293, 295, 296, 297, 300, 308, 310, 311, 312, 314, 317, 318, 321, 323, 324, 332, 334, 336, 338, 356, 361, 362, 365, 373, 374, 375, 377, 378, 379, 380, 381, 382, 384, 385, 386, 387, 388, 389, 390, 397, 398, 400, 402, 405, 409, 415, 454, 466, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477];
export const BLENDSHAPES = ['_neutral', 'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight', 'eyeBlinkLeft', 'eyeBlinkRight', 'eyeLookDownLeft', 'eyeLookDownRight', 'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft', 'eyeLookOutRight', 'eyeLookUpLeft', 'eyeLookUpRight', 'eyeSquintLeft', 'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight', 'jawForward', 'jawLeft', 'jawOpen', 'jawRight', 'mouthClose', 'mouthDimpleLeft', 'mouthDimpleRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthFunnel', 'mouthLeft', 'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthPressLeft', 'mouthPressRight', 'mouthPucker', 'mouthRight', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper', 'mouthSmileLeft', 'mouthSmileRight', 'mouthStretchLeft', 'mouthStretchRight', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'noseSneerLeft', 'noseSneerRight'];

// the models, their input sizes and value ranges (scripts/npu-models.py names them)
export const MODELS = {
  'face-detect': { size: 128, range: [-1, 1] }, 'face-mesh': { size: 256, range: [0, 1] }, 'face-shapes': {},
  'palm-detect': { size: 192, range: [0, 1] }, 'hand-mesh': { size: 224, range: [0, 1] }, yamnet: {},
};

/**
 * Follows one face. engine: { image(model, frame, rect, size, range) -> outputs [Float32Array...],
 * tensor(model, Float32Array) -> outputs }. track(frame) with frame = { id, w, h } resolves to the
 * same shape MediaPipe's FaceLandmarker gives: { faceLandmarks: [[{ x, y, z } x 478]],
 * faceBlendshapes: [{ categories: [{ categoryName, score } x 52] }] } (empty arrays with no face).
 */
export class FacePipe {
  constructor(engine, { minFace = .5, shapes = true } = {}) { this.e = engine; this.minFace = minFace; this.shapes = shapes; this.roi = null; }
  async track(f) {
    const { w: W, h: H } = f;
    if (!this.roi) {
      const sq = whole(W, H), [box, sc] = await this.e.image('face-detect', f, sq, 128, [-1, 1]);
      const d = wnms(decode(box, sc, FACE_ANCHORS, 128, 6, .5), .3, 1)[0];
      if (!d) return { faceLandmarks: [], faceBlendshapes: [] };
      const p = (u, v) => fromCrop(sq, u, v), [ax, ay] = p(d.x0, d.y0), [bx, by] = p(d.x1, d.y1);
      const [ex0, ey0] = p(...d.k[0]), [ex1, ey1] = p(...d.k[1]);
      this.roi = transform({ cx: (ax + bx) / 2, cy: (ay + by) / 2, w: bx - ax, h: by - ay, a: angle(ex0, ey0, ex1, ey1, 0) }, { scale: 1.5 });
    }
    const r = this.roi, [mesh, flag] = await this.e.image('face-mesh', f, r, 256, [0, 1]);
    if (sigmoid(flag[0]) < this.minFace) { this.roi = null; return { faceLandmarks: [], faceBlendshapes: [] }; }
    const pts = [];
    for (let i = 0; i < 478; i++) {
      const [x, y] = fromCrop(r, mesh[i * 3] / 256, mesh[i * 3 + 1] / 256);
      pts.push({ x: x / W, y: y / H, z: mesh[i * 3 + 2] / 256 * r.w / W });
    }
    // next frame looks where the face is now
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0; for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    this.roi = transform({ cx: (x0 + x1) / 2 * W, cy: (y0 + y1) / 2 * H, w: (x1 - x0) * W, h: (y1 - y0) * H, a: angle(pts[33].x * W, pts[33].y * H, pts[263].x * W, pts[263].y * H, 0) }, { scale: 1.5 });
    let faceBlendshapes = [];
    if (this.shapes) {
      const t = new Float32Array(FACE_SUBSET.length * 2);
      FACE_SUBSET.forEach((k, i) => { t[i * 2] = pts[k].x * W; t[i * 2 + 1] = pts[k].y * H; });
      const [s] = await this.e.tensor('face-shapes', t);
      faceBlendshapes = [{ categories: BLENDSHAPES.map((n, i) => ({ categoryName: n, score: s[i] })) }];
    }
    return { faceLandmarks: [pts], faceBlendshapes };
  }
  reset() { this.roi = null; }
}

/* ---------- hands ---------- */
const PALM_POINTS = [0, 1, 2, 3, 5, 6, 9, 10, 13, 14, 17, 18];
// MediaPipe HandLandmarksToRectCalculator: turned so the wrist points down, sized round the palm and finger roots
function handRect(pts, W, H) {
  const P = i => [pts[i].x * W, pts[i].y * H];
  const [x0, y0] = P(0); let [x1, y1] = [(P(5)[0] + P(13)[0]) / 2, (P(5)[1] + P(13)[1]) / 2];
  x1 = (x1 + P(9)[0]) / 2; y1 = (y1 + P(9)[1]) / 2;
  const a = angle(x0, y0, x1, y1, Math.PI / 2), c = Math.cos(-a), s = Math.sin(-a);
  let lx = Infinity, ly = Infinity, hx = -Infinity, hy = -Infinity;
  for (const i of PALM_POINTS) { const [x, y] = P(i), rx = x * c - y * s, ry = x * s + y * c; lx = Math.min(lx, rx); ly = Math.min(ly, ry); hx = Math.max(hx, rx); hy = Math.max(hy, ry); }
  const mx = (lx + hx) / 2, my = (ly + hy) / 2, cb = Math.cos(a), sb = Math.sin(a);
  return { cx: mx * cb - my * sb, cy: mx * sb + my * cb, w: hx - lx, h: hy - ly, a };
}

/**
 * Follows up to `max` hands. track(frame) resolves to MediaPipe HandLandmarker's shape:
 * { landmarks: [[{ x, y, z } x 21]...], handednesses: [[{ categoryName: 'Left' | 'Right', score }]...] }.
 */
export class HandPipe {
  constructor(engine, { max = 2, minHand = .5 } = {}) { this.e = engine; this.max = max; this.minHand = minHand; this.rois = []; this.n = 0; }
  async track(f) {
    const { w: W, h: H } = f;
    // look for palms while fewer hands than wanted are followed (every few frames, it's the slow part)
    if (this.rois.length < this.max && (this.rois.length === 0 || this.n++ % 6 === 0)) {
      const sq = whole(W, H), [box, sc] = await this.e.image('palm-detect', f, sq, 192, [0, 1]);
      for (const d of wnms(decode(box, sc, PALM_ANCHORS, 192, 7, .5), .3, this.max)) {
        const p = (u, v) => fromCrop(sq, u, v), [ax, ay] = p(d.x0, d.y0), [bx, by] = p(d.x1, d.y1);
        const [wx, wy] = p(...d.k[0]), [mx, my] = p(...d.k[2]);
        const r = transform({ cx: (ax + bx) / 2, cy: (ay + by) / 2, w: bx - ax, h: by - ay, a: angle(wx, wy, mx, my, Math.PI / 2) }, { scale: 2.6, shiftY: -.5 });
        // a palm already followed isn't a new hand
        if (this.rois.length < this.max && !this.rois.some(o => Math.hypot(o.cx - r.cx, o.cy - r.cy) < Math.min(o.w, r.w) * .5)) this.rois.push(r);
      }
    }
    const landmarks = [], handednesses = [], next = [];
    for (const r of this.rois) {
      const [lm, pres, hand] = await this.e.image('hand-mesh', f, r, 224, [0, 1]);
      if (pres[0] < this.minHand) continue;
      const pts = [];
      for (let i = 0; i < 21; i++) { const [x, y] = fromCrop(r, lm[i * 3] / 224, lm[i * 3 + 1] / 224); pts.push({ x: x / W, y: y / H, z: lm[i * 3 + 2] / 224 * r.w / W }); }
      landmarks.push(pts); handednesses.push([hand[0] > .5 ? { categoryName: 'Right', score: hand[0] } : { categoryName: 'Left', score: 1 - hand[0] }]);
      next.push(transform(handRect(pts, W, H), { scale: 2, shiftY: -.1 }));
    }
    // two rects on the same hand: keep one
    this.rois = next.filter((r, i) => !next.slice(0, i).some(o => Math.hypot(o.cx - r.cx, o.cy - r.cy) < Math.min(o.w, r.w) * .3));
    return { landmarks, handednesses, aspect: W / H };
  }
  reset() { this.rois = []; }
}

/* ---------- the crop every engine does (also the reference for the native ones) ---------- */
/**
 * Fills a size x size x 3 Float32Array (rows from the top, RGB) from an RGBA picture, sampling it
 * through rect r (bilinear; outside the picture is black), scaled to range [lo, hi].
 */
export function cropToTensor(rgba, W, H, r, size, [lo, hi], out = new Float32Array(size * size * 3)) {
  const c = Math.cos(r.a), s = Math.sin(r.a), k = (hi - lo) / 255;
  for (let v = 0; v < size; v++) for (let u = 0; u < size; u++) {
    const x0 = ((u + .5) / size - .5) * r.w, y0 = ((v + .5) / size - .5) * r.h;
    const x = r.cx + x0 * c - y0 * s - .5, y = r.cy + x0 * s + y0 * c - .5;
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, o = (v * size + u) * 3;
    for (let ch = 0; ch < 3; ch++) {
      const at = (px, py) => (px < 0 || py < 0 || px >= W || py >= H) ? 0 : rgba[(py * W + px) * 4 + ch];
      const val = at(ix, iy) * (1 - fx) * (1 - fy) + at(ix + 1, iy) * fx * (1 - fy) + at(ix, iy + 1) * (1 - fx) * fy + at(ix + 1, iy + 1) * fx * fy;
      out[o + ch] = lo + val * k;
    }
  }
  return out;
}
