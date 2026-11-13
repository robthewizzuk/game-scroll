// A camera like a real one (v.lens): the numbers both renderers draw it with, worked out once a frame.
//
// A real lens decides three things a plain blur doesn't:
//  - how far from the focus things go soft, from the aperture (f-stop), the focal length and the
//    distance focused on. The blur of a point (its circle of confusion) on a camera's picture is
//    A f s / (s - f) x |1/s - 1/z| millimetres: A the aperture's width (f / f-stop), f the focal length,
//    s the distance in focus, z the point's. So it grows with 1/distance, not distance: a long lens at
//    f/2.8 blurs a hill behind a face to nothing, a wide one at f/11 keeps the whole street sharp. The
//    focal length comes from the camera's own field of view on a full-frame picture (36 x 24 mm), so a
//    scope zoomed in focuses as a long lens does without the game saying so.
//  - focus pulls: the focus moves in dioptres (1 / metres), as a focus puller turns the ring, easing in
//    and out over `pull` seconds; 'auto' focuses on what is under `spot` on screen (the chip measures
//    the distance there, the median of nine points, read back without waiting).
//  - exposure, in stops, from the f-stop, shutter time and ISO, as a camera's meter works it out:
//    f/16 at 1/125 s and ISO 100 (the sunny sixteen rule) shows the game's lights as it set them, and
//    each stop more light doubles the picture. iso: 'auto' meters the picture as a camera does: towards
//    mid grey, all the way down when it is too bright and part of the way up when it is dark (night
//    stays night), so one lens works through a day and a night. Without iso the lens leaves exposure
//    alone (a cut scene opening up to f/1.8 for a soft background doesn't brighten).
//  - with motion blur on (v.motionBlur), the shutter time sets how long the smear is, as on film.

const SENSOR = 24;            // mm: the height of a full-frame camera's picture
const SUNNY = 15;             // the exposure value of a sunny day (f/16, 1/125 s, ISO 100): the game's lights as set
// iso: 'auto' aims the picture's mean (log) brightness here, in the kit's own light before tone mapping: about
// what a day scene of the kit's comes to at exposure 1, so a day scene keeps about its look
const KEY = -2.4;
let LV = null, LC = null, LD = null;

/** Exposure value (at ISO 100) of an f-stop, a shutter time in seconds and an ISO. */
export function ev100(N, t, iso) { return Math.log2(N * N / t) - Math.log2(iso / 100); }

// a critically damped ease (Unity's SmoothDamp): no overshoot, any frame time
function damp(S, to, time, dt) {
  if (!(time > 0) || !isFinite(S.D)) { S.D = to; S.vel = 0; return; }
  const w = 2 / time, x = w * dt, e = 1 / (1 + x + .48 * x * x + .235 * x * x * x), ch = S.D - to, tmp = (S.vel + w * ch) * dt;
  S.vel = (S.vel - w * tmp) * e; S.D = to + (ch + tmp) * e;
  if ((to - S.D) * ch > 0) { S.D = to; S.vel = 0; }   // (never past the target)
}

/**
 * This frame's lens (into v._ls), or null with no v.lens. dt: seconds since the last frame (real time);
 * cut: the camera jumped (the focus snaps). The numbers (sizes as parts of the picture's height):
 * K: blur across per dioptre away from the focus; D: the focus in dioptres; max: the widest blur;
 * blades (0 round), turn (radians), hi: how bright a point has to be, in the scene's light, to show as a bokeh disc;
 * exp: the exposure the lens adds (x); ae: the camera's own meter (null: none); mb: motion blur's amount from the shutter
 * (null: the game's own); af: autofocus wanted (spot: where, 0..1 from the top left).
 */
export function lensFrame(v, dt, cut) {
  const L = v.lens;
  if (!L) { v._ls = null; return null; }
  const S = v._ls ||= { D: NaN, vel: 0, af: NaN, busy: false, n: 0, spot: [.5, .5], afWant: false };
  if (!LV) { const V = v.cam.position.constructor; LV = new V(); LC = new V(); LD = new V(); }
  const cam = v.cam, sensor = L.sensor > 0 ? L.sensor : SENSOR;
  // the focal length: given (and the camera's field of view set to match), or from the field of view
  if (L.focal > 0 && cam.isPerspectiveCamera) {
    const fov = 2 * Math.atan(sensor / 2 / L.focal) * 180 / Math.PI;
    if (Math.abs(cam.fov - fov) > 1e-6) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }
  const f = sensor / 2 / Math.tan((cam.fov ?? 50) * Math.PI / 360), N = Math.max(.7, +L.fstop || 2.8);
  // the focus: a distance, a thing or a point (along the camera's look), or 'auto'
  const fo = L.focus ?? 'auto';
  let T;
  S.afWant = fo === 'auto';
  if (typeof fo === 'number') T = 1 / Math.max(.05, fo);
  else if (S.afWant) T = isFinite(S.af) ? S.af : isFinite(S.D) ? S.D : .1;
  else if (fo && (fo.isObject3D || typeof fo.x === 'number')) {
    if (fo.isObject3D) fo.getWorldPosition(LV); else LV.set(fo.x, fo.y ?? 0, fo.z ?? 0);
    cam.getWorldPosition(LC); cam.getWorldDirection(LD);
    T = 1 / Math.max(.05, LV.sub(LC).dot(LD));
  } else T = isFinite(S.D) ? S.D : .1;
  if (S.afWant) { const sp = L.spot; S.spot[0] = sp ? +sp[0] : .5; S.spot[1] = sp ? +sp[1] : .5; }
  if (cut) S.D = NaN;
  damp(S, T, Math.max(0, L.pull ?? .5) * .4, Math.min(.1, Math.max(0, dt)));
  S.moving = Math.abs(S.D - T) > 1e-5 * (1 + T);   // (a pull under way: the still-frame check keeps drawing)
  L.at = S.D > 1e-6 ? 1 / S.D : Infinity;
  // the circle of confusion: millimetres on the picture per dioptre, then parts of the picture's height
  const A = f / N, s = S.D > 1e-6 ? 1000 / S.D : Infinity, mm = (isFinite(s) ? A * f * s / Math.max(s - f, 1e-3) : A * f) / 1000;
  S.K = mm / sensor * (L.blur ?? 1);
  S.max = Math.max(1, L.max ?? 24) / 640;
  S.blades = L.blades >= 3 ? Math.min(12, Math.round(L.blades)) : 0;
  S.turn = (L.turn ?? 0) * Math.PI / 180;
  S.bokeh = Math.max(0, L.bokeh ?? 1);
  // exposure, in stops: manual from the three settings, or the camera's own meter
  const ev = +L.ev || 0, t = +L.shutter > 0 ? +L.shutter : 0;
  if (typeof L.iso === 'number' && L.iso > 0) {
    const e = SUNNY - ev100(N, t || 1 / 125, L.iso) + ev;
    S.exp = 2 ** e; S.ae = null; L.stops = e;
  } else if (L.iso === 'auto') {
    S.exp = 2 ** ev;
    const ae = S.aeO ||= {};
    ae.key = 2 ** (L.key != null ? Math.log2(L.key) : KEY); ae.amount = 1; ae.night = L.night ?? .5; ae.min = 1 / 64; ae.max = 64; ae.speed = L.speed ?? 2.5; ae.darken = (L.speed ?? 2.5) * 1.6; ae.camera = true;
    S.ae = ae;
  } else { S.exp = 1; S.ae = null; L.stops = 0; }
  // the shutter's smear (motion blur's amount is a part of a frame's move)
  S.mb = t > 0 && dt > 0 ? Math.min(1.5, t / Math.max(dt, 1 / 240)) : null;
  // a point brighter than this (the screen's white at this exposure) shows as a disc of its own
  S.hi = 1.15 / Math.max(1e-4, (v.exposure ?? 1) * S.exp * (v.eye ? 2 ** v.eye.e : 1));
  return S;
}

/** The autofocus picture back (3 x 3 texels, see AF_PACK): its median distance, in dioptres, becomes the target. */
export function afTake(S, px) {
  if (!S) return;
  const d = [];
  for (let i = 0; i < 9; i++) {
    const o = i * 4;
    if (px[o + 2] > 127) { d.push(0); continue; }   // (the sky: as far as can be)
    const n = (px[o] * 256 + px[o + 1]) / 65535, z = 2 ** (n * 20 - 4);
    d.push(1 / Math.max(.05, z));
  }
  d.sort((a, b) => a - b);
  S.af = d[4];
}
/** How the autofocus texels hold a distance: log2(metres) from -4 to 16 in two bytes, and the sky. */
export const AF_LOG = [-4, 20];
