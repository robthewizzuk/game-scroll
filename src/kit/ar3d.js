// AR 3D kit for era:'ar' games (see docs/ar-3d.md): 3D objects that sit in your real room.
//
// The back camera picture fills the screen and the phone's gyro turns the 3D camera, so things you
// place stay put in the room while you move the phone around (look-around AR: you turn on the spot,
// you don't walk around). It uses the Next Gen renderer (hd3d.js) with a see-through background,
// real-time shadows that fall on your real floor, and reflections.
//
// Fallbacks, so every AR game still plays anywhere:
//  - no camera (refused, desktop): a virtual room is drawn behind the scene instead;
//  - no gyro (desktop, refused motion): drag on the screen to look around (v.drag(dx, dy)).
//
// Making it sit in the room better:
//  - floor calibration: the first time, the player drags a grid until it lies on their real floor.
//    That sets how high the phone is held (stored), so things stand on the real floor. A small
//    "Floor" chip redoes it any time. Games pause while it's open (v.calibrating) and pass their
//    input through v.input(...) first.
//  - light estimation: the camera picture's brightness and colour set the 3D lights, so objects
//    dim in a dark room and pick up warm lamp light.
//  - on Android the compass-locked orientation is used, so "straight ahead" doesn't drift.
//
// Native AR (world mode): in the phone app, where the NativeAR plugin and ARKit / ARCore are
// there, the camera picture is drawn natively behind a see-through page and the 3D camera follows
// the phone's real position as well as its turn, so players can walk around things. The floor
// comes from the lowest surface the phone finds (no calibration needed), and light from the
// phone's own estimate. v.mode says which is running ('world' or 'look'); v.surfaces() lists found
// surfaces and v.hit(x, y) finds where a screen point meets one. Everything else works the same.
import { HDView, HD, pbr, surface, speckle, sun, THREE } from './hd3d.js';
import { startCamera, stopCamera, orientation, haptic } from './device.js';
import { store } from '../util.js';
import { nativeStart, nativeStop, nativeHit } from './native-ar.js';
const { Matrix4, Plane, Raycaster, Vector2, Group, Mesh, PlaneGeometry, BoxGeometry, ShadowMaterial, MeshBasicMaterial, CanvasTexture, SRGBColorSpace, Vector3, Quaternion, Euler, BackSide, GridHelper } = THREE;

// A 50 cm grid of bright lines that fades out towards its edges, for lining up the floor.
let GT = null;
function gridTex() {
  if (GT) return GT;
  const S = 512, cv = Object.assign(document.createElement('canvas'), { width: S, height: S }), g = cv.getContext('2d');
  g.strokeStyle = '#19e3b1'; g.lineWidth = 2.5;
  for (let i = 0; i <= 12; i++) { const p = 2 + i * (S - 4) / 12; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.moveTo(0, p); g.lineTo(S, p); g.stroke(); }
  g.globalCompositeOperation = 'destination-in';
  const f = g.createRadialGradient(S / 2, S / 2, S * .1, S / 2, S / 2, S / 2); f.addColorStop(0, '#000'); f.addColorStop(1, '#0000');
  g.fillStyle = f; g.fillRect(0, 0, S, S);
  GT = new CanvasTexture(cv); GT.colorSpace = SRGBColorSpace; GT.anisotropy = 8;
  return GT;
}

/** World floor height in metres. The 3D camera sits at FLOOR + the player's calibrated eye height
 *  (1.3 m until calibrated), so a game can always put things on the floor at y = FLOOR. */
export const FLOOR = -1.3;
const EYE_KEY = 'gs_ar_eye', EYE_MIN = .3, EYE_MAX = 2.1;
// The long side of a phone's main camera sees roughly this many degrees.
const LONG_FOV = 64;

let ROOM = null;
function roomLooks() {
  if (ROOM) return ROOM;
  const wood = surface(256, ({ col, h, r, size: S }) => {
    for (let y = 0; y < S; y += 32) {
      const v = 120 + Math.random() * 30 | 0; col.fillStyle = `rgb(${v + 40},${v},${v - 40})`; col.fillRect(0, y, S, 32);
      h.fillStyle = '#000'; h.fillRect(0, y, S, 2); col.fillStyle = '#0003'; col.fillRect(0, y, S, 2);
      const cut = Math.random() * S; h.fillRect(cut, y, 2, 32);
      r.fillStyle = Math.random() < .5 ? '#888' : '#aaa'; r.fillRect(0, y + 2, S, 30);
    }
    speckle(col, S, 900, '#3a2210', 2, .25);
  }, { strength: 2 });
  const paint = surface(128, ({ col, size: S }) => { col.fillStyle = '#d9d4ca'; col.fillRect(0, 0, S, S); speckle(col, S, 600, '#a09888', 1.2, .25); });
  ROOM = { floor: pbr('#ffffff', { tex: wood.repeat(6, 6), rough: .7 }), wall: pbr('#bdb6aa', { tex: paint.repeat(4, 2), rough: .95, side: BackSide }) };
  return ROOM;
}

const Z = new Vector3(0, 0, 1), Y = new Vector3(0, 1, 0), Q1 = new Quaternion(-Math.sqrt(.5), 0, 0, Math.sqrt(.5));
const eu = new Euler(), q0 = new Quaternion(), qd = new Quaternion(), qy = new Quaternion(), tmp = new Vector3();
const mA = new Matrix4(), mB = new Matrix4(), mC = new Matrix4(), sc = new Vector3(), ray = new Raycaster(), floorPl = new Plane(new Vector3(0, 1, 0), -FLOOR), v2 = new Vector2();
const GOOD = { TRACKING: 1, LIMITED: 1 };
// a fresh native-AR state: the latest pose and projection, and how native space maps to game space
// How far below the phone the floor can be: standing or sitting, never a table top right under it.
const FLOOR_MIN = .75, FLOOR_MAX = 2.3;
const natState = () => ({ pose: new Matrix4(), proj: new Matrix4(), has: false, tracking: 'PAUSED', light: null, planes: [], yaw0: null, x0: 0, z0: 0, yOff: null, yOffT: 0, floor: null, M: new Matrix4(), t0: performance.now(),
  floorA: 0, scan: true, scanT: 0, asking: false, cands: [], shown: 0 });

export class ARView extends HDView {
  constructor(o = {}) {
    super({ bg: '#0b0f14', env: .7, amb: .9, sky: '#e8eef8', ground: '#6a5e50', fov: 62, ...o });
    this.scene.background = null; this.clearBg = true; this.cam.far = 60;
    // sunlight from above-behind; its shadows land on an invisible floor that only shows shadow
    this.sunL = sun('#fff4e4', 2.4, 7, [-.35, 1, .45]); this.scene.add(this.sunL, this.sunL.target); this.sunL.follow(0, FLOOR, -2);
    super.onTier(T => { this.sunL.setTier(T); this.gameTier?.(T); });
    const catcher = new Mesh(new PlaneGeometry(40, 40), new ShadowMaterial({ color: 0x000000, opacity: .38 }));
    catcher.rotation.x = -Math.PI / 2; catcher.position.y = FLOOR + .002; catcher.receiveShadow = true; this.scene.add(catcher);
    // the virtual room, shown only while there is no camera picture
    const L = roomLooks(), room = new Group();
    const fl = new Mesh(new PlaneGeometry(14, 14), L.floor); fl.rotation.x = -Math.PI / 2; fl.position.y = FLOOR; fl.receiveShadow = true;
    const walls = new Mesh(new BoxGeometry(14, 6, 14), L.wall); walls.position.y = FLOOR + 2.98;   // its bottom face sits just under the wooden floor
    const grid = new GridHelper(14, 14, 0xffffff, 0xffffff); grid.position.y = FLOOR + .003; grid.material.transparent = true; grid.material.opacity = .08;
    room.add(fl, walls, grid); this.room = room; this.scene.add(room);
    // calibration grid: a 6 m teal grid on the floor, shown while the player lines it up
    this.calGrid = new Mesh(new PlaneGeometry(6, 6), new MeshBasicMaterial({ map: gridTex(), transparent: true, depthWrite: false, toneMapped: false }));
    this.calGrid.rotation.x = -Math.PI / 2; this.calGrid.position.y = FLOOR + .004; this.calGrid.visible = false; this.scene.add(this.calGrid);
    this.eye = store.get(EYE_KEY, null); this.cal = null; this.chip = null;
    // light estimate from the camera picture
    this.lightCv = null; this.lightN = 0; this.lum = .45; this.tint = [1, 1, 1];
    this.camState = 'off'; this.camera = null; this.yaw0 = null; this.yaw = 0; this.pitch = 0; this.sensor = false;
    this.camQ = new Quaternion(); this.nat = null; this.rect = null;
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.off(); });
  }
  /** Let a game react to quality changes (the kit already handles the sun's shadows). */
  onTier(fn) { this.gameTier = fn; return this; }

  /** Call every update while playing: starts the back camera once (asks permission the first time). */
  live() {
    if (this.camState !== 'off') return this;
    this.camState = 'asking';
    // native AR first (phone app with ARKit / ARCore), else the web camera with the gyro
    nativeStart(this).then(r => {
      if (this.camState !== 'asking') { if (r.started) nativeStop(this); return; }
      if (r.started) { this.camState = 'native'; this.nat = natState(); this.cal = null; this.calGrid.visible = false; return; }
      if (r.reason === 'camera') { this.camState = 'denied'; return; }   // camera refused: don't ask twice
      startCamera().then(c => {
        if (this.camState !== 'asking') { if (c) stopCamera(); return; }   // switched off while asking
        this.camera = c; this.camState = c ? 'on' : 'denied';
        if (c && this.eye == null) this.calibrate();   // first time with a camera: line up the floor
      });
    });
    return this;
  }
  /** Stop the camera (call from reset() and before api.over()). Denied stays denied for this game. */
  off() {
    if (this.camState === 'on' || this.camState === 'asking') stopCamera();
    nativeStop(this); this.nat = null;
    if (this.camState !== 'denied') this.camState = 'off'; this.camera = null; return this;
  }
  /** True while the real camera picture is showing. */
  get seeing() { if (this.camState === 'native') return true; const v = this.camera?.video; return !!(v && v.readyState >= 2 && v.videoWidth); }
  /** 'world' while native AR tracks the phone's real position (walk around), else 'look' (turn on the spot). */
  get mode() { return this.camState === 'native' ? 'world' : 'look'; }

  /* ---------- native AR (called by native-ar.js) ---------- */
  frame(d) {
    const n = this.nat; if (!n || !d.pose) { if (n && d.tracking) n.tracking = d.tracking; return; }
    n.tracking = d.tracking; n.pose.fromArray(d.pose); n.proj.fromArray(d.proj); n.light = d.light || null;
    if (!GOOD[d.tracking]) return;
    const m = d.pose;
    if (n.yaw0 == null) {
      // the first good pose (or after recenter): where the phone points becomes "straight ahead" (-z),
      // where it stands becomes x = z = 0, and until a floor is found it's held at the calibrated height
      n.yaw0 = Math.atan2(m[8], m[10]); n.x0 = m[12]; n.z0 = m[14];
      if (n.floor == null) n.yOff = n.yOffT = FLOOR + (this.eye ?? -FLOOR) - m[13];
      if (n.yOff == null) n.yOff = n.yOffT;
    }
    n.has = true;
  }
  planes(list) {
    const n = this.nat; if (!n) return;
    n.planes = list;
    // the floor is the biggest surface a sensible height below the phone. It only changes for a
    // clearly bigger one (or the same one growing), so the room doesn't keep shifting up and down.
    const py = n.pose.elements[13]; let best = null;
    for (const p of list) {
      const y = p.pose[13], a = p.w * p.d;
      if (a >= .08 && y < py - FLOOR_MIN && y > py - FLOOR_MAX && (!best || a > best.a)) best = { y, a };
    }
    if (!best) return;
    if (n.floor == null || best.a > n.floorA * 1.5 || (Math.abs(best.y - n.floor) < .04 && best.a >= n.floorA)) this.setFloor(best.y, best.a);
  }
  setFloor(y, a = 0) {
    const n = this.nat, was = n.floor == null;
    n.floor = y; n.floorA = a; n.yOffT = FLOOR - y; if (n.yOff == null) n.yOff = n.yOffT;
    if (was && n.scan) { n.scan = false; n.shown = 1.4; haptic('success'); }   // found: show the grid on it for a moment
  }
  // While looking for the floor, ask where the middle of the screen meets something a few times a
  // second. A real surface counts at once; rough feature points need three that agree.
  scanFloor(dt) {
    const n = this.nat, r = this.rect;
    if (n.floor != null || n.asking || !r || !GOOD[n.tracking] || (n.scanT -= dt) > 0) return;
    n.scanT = .2; n.asking = true;
    nativeHit(r.left + r.width / 2, r.top + r.height * .6).then(hs => {
      n.asking = false; const h = hs[0]; if (!h || this.nat !== n || n.floor != null) return;
      const y = h.pose[13], py = n.pose.elements[13]; if (y > py - FLOOR_MIN || y < py - FLOOR_MAX) return;   // a table top, or nonsense
      if (h.kind === 'plane') return this.setFloor(y);
      n.cands.push(y); if (n.cands.length > 6) n.cands.shift();
      const near = n.cands.filter(c => Math.abs(c - y) < .05);
      if (near.length >= 3) this.setFloor(near.reduce((a, b) => a + b) / near.length);
    });
  }
  /**
   * Surfaces native AR has found, in game space: [{ id, p (centre), q (turn), w, d, floor }]. w runs
   * along the surface's own x and d along its z. Empty in look mode.
   */
  surfaces() {
    const n = this.nat; if (!n?.has) return [];
    return n.planes.map(s => {
      const p = new Vector3(), q = new Quaternion(); mA.fromArray(s.pose).premultiply(n.M).decompose(p, q, sc);
      return { id: s.id, p, q, w: s.w, d: s.d, floor: n.floor != null && Math.abs(s.pose[13] - n.floor) < .05 };
    });
  }
  /** True once native AR has found the real floor. */
  get floorFound() { return this.nat?.floor != null; }
  /**
   * Where game point (x, y) on the screen meets a real surface: resolves { p: Vector3, kind } or null.
   * kind is 'plane' or 'point' (native AR) or 'floor' (look mode: the line of sight hits FLOOR).
   */
  async hit(x, y) {
    const n = this.nat, r = this.rect;
    if (n?.has && r) {
      const h = (await nativeHit(r.left + x / this.W * r.width, r.top + y / this.H * r.height))[0];
      if (h && this.nat === n) return { p: new Vector3().setFromMatrixPosition(mA.fromArray(h.pose).premultiply(n.M)), kind: h.kind };
      if (h) return null;
    }
    ray.setFromCamera(v2.set(x / this.W * 2 - 1, 1 - y / this.H * 2), this.cam);
    const p = ray.ray.intersectPlane(floorPl, new Vector3());
    return p && p.distanceTo(this.cam.position) < 15 ? { p, kind: 'floor' } : null;
  }
  // native pose -> 3D camera; called from look()
  lookNative(dt) {
    const n = this.nat;
    if (n.has) {
      n.yOff += (n.yOffT - n.yOff) * (1 - Math.exp(-dt * 5));   // a newly found floor eases in
      n.M.makeTranslation(-n.x0, 0, -n.z0).premultiply(mB.makeRotationY(-n.yaw0)).premultiply(mC.makeTranslation(0, n.yOff, 0));
      mA.multiplyMatrices(n.M, n.pose).decompose(this.cam.position, this.cam.quaternion, sc);
      this.scanFloor(dt);
      // the teal grid shows while looking for the floor (where it's guessed) and briefly once found
      if (n.shown > 0) n.shown -= dt;
      this.calGrid.visible = n.scan || n.shown > 0;
      this.calGrid.material.opacity = n.scan ? .35 + .25 * Math.sin(performance.now() / 180) : Math.min(1, n.shown);
      this.calGrid.position.set(this.cam.position.x, FLOOR + .004, this.cam.position.z);
    } else this.cam.position.set(0, FLOOR + this.eyeH, 0);
    this.sensor = true; this.cam.updateMatrixWorld();
    return this;
  }
  // native projection, cropped from the full screen to where the game's canvas sits
  projectNative(c) {
    const n = this.nat, r = this.rect = c.canvas.getBoundingClientRect(), VW = innerWidth, VH = innerHeight;
    if (!n.has || !r.width || !r.height) return;
    const sx = VW / r.width, ox = (VW - 2 * r.left - r.width) / r.width, sy = VH / r.height, oy = (r.height - VH + 2 * r.top) / r.height;
    mA.set(sx, 0, 0, ox, 0, sy, 0, oy, 0, 0, 1, 0, 0, 0, 0, 1);
    this.cam.projectionMatrix.multiplyMatrices(mA, n.proj); this.cam.projectionMatrixInverse.copy(this.cam.projectionMatrix).invert();
    this.cam.fov = 2 * Math.atan(1 / this.cam.projectionMatrix.elements[5]) * 180 / Math.PI;   // games use fov for sizes
  }

  /** Make where the phone points now "straight ahead" (call from reset()). */
  recenter() {
    this.yaw0 = null; this.yaw = 0; this.pitch = 0;
    // where you stand becomes x = z = 0 (native AR takes it on the next frame), so things a game
    // places now from eyePos line up with the new "ahead" instead of last round's position
    if (this.nat) this.nat.yaw0 = null;
    this.cam.position.x = this.cam.position.z = 0;
    return this;
  }
  /** No-gyro fallback: drag to look around (pixels moved). */
  drag(dx, dy) { if (this.sensor) return; this.yaw += dx * .007; this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + dy * .006)); }

  /** Point the 3D camera the way the phone points. Call once per frame before draw(). */
  look(dt = 1 / 60) {
    if (this.nat) return this.lookNative(dt);
    const o = orientation(), d = Math.PI / 180;
    if (o) {
      if (this.absSeen !== o.abs) { this.absSeen = o.abs; this.yaw0 = null; }   // source changed: re-take "ahead"
      eu.set(o.beta * d, o.alpha * d, -o.gamma * d, 'YXZ');
      qd.setFromEuler(eu).multiply(Q1).multiply(q0.setFromAxisAngle(Z, -o.screen * d));
      if (this.yaw0 == null) { tmp.set(0, 0, -1).applyQuaternion(qd); this.yaw0 = Math.atan2(-tmp.x, -tmp.z); }
      qd.premultiply(qy.setFromAxisAngle(Y, -this.yaw0));
      if (!this.sensor) { this.sensor = true; this.camQ.copy(qd); }
      this.camQ.slerp(qd, 1 - Math.exp(-dt * 28));   // smooth out sensor jitter, still feels instant
    } else {
      this.sensor = false;
      this.camQ.setFromEuler(eu.set(this.pitch, this.yaw, 0, 'YXZ'));
    }
    this.cam.quaternion.copy(this.camQ); this.cam.position.set(0, FLOOR + this.eyeH, 0); this.cam.updateMatrixWorld();
    return this;
  }
  /** How high the phone is held above the floor, in metres. */
  get eyeH() { return this.nat?.has ? this.cam.position.y - FLOOR : this.cal ? this.cal.eye : this.eye ?? -FLOOR; }
  /** Where the phone is (the camera position). */
  get eyePos() { return this.cam.position; }

  /* ---------- floor calibration ---------- */
  /** Open floor calibration: drag until the grid lies on the real floor, then tap Done. */
  calibrate() { if (!this.cal) { this.cal = { eye: this.eye ?? -FLOOR, drag: null, moved: 0 }; this.calGrid.visible = true; } return this; }
  /** True while the floor calibration is open: games should not advance (skip update). */
  get calibrating() { return !!this.cal || !!this.nat?.scan; }
  /**
   * Route a game's input through the kit first: input('down' | 'move' | 'up', x, y, id[, pressed]).
   * Returns true when the kit used it (calibration, or the Floor chip), so the game should ignore it.
   */
  input(kind, x, y, id, pressed) {
    const n = this.nat;
    if (n?.scan) {   // looking for the floor: everything waits; Skip carries on at the guessed height
      const b = n.skip;
      if (kind === 'up' && b && x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) { n.scan = false; this.calGrid.visible = false; haptic('light'); }
      return true;
    }
    const c = this.cal;
    if (!c) {
      const k = this.chip;
      if (kind === 'down' && k && x > k.x && x < k.x + k.w && y > k.y && y < k.y + k.h) { this.calibrate(); haptic('light'); return true; }
      return false;
    }
    if (kind === 'down') { c.drag = { id, y }; c.moved = 0; }
    else if (kind === 'move' && c.drag && c.drag.id === id && pressed) {
      // dragging down lowers the grid: the phone must be held higher than assumed
      const dy = y - c.drag.y; c.drag.y = y; c.moved += Math.abs(dy);
      c.eye = Math.max(EYE_MIN, Math.min(EYE_MAX, c.eye + dy * .006 * Math.max(.6, c.eye)));
    } else if (kind === 'up' && c.drag && c.drag.id === id) {
      const b = c.done; c.drag = null;
      if (c.moved < 8 && b && x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) {
        this.eye = Math.round(c.eye * 100) / 100; store.set(EYE_KEY, this.eye); this.cal = null; this.calGrid.visible = false; haptic('success');
      }
    }
    return true;
  }

  /* ---------- light estimation ---------- */
  // Twice a second, shrink the camera picture to 8 x 6 pixels and read its average brightness and
  // colour (reading pixels back makes the graphics chip wait, so not every frame). The lights ease
  // towards that, so a dim room gives dim, warm or cool objects.
  estimateLight(video) {
    const now = performance.now(); if (now - this.lightN < 500) return; this.lightN = now;
    try {
      const cv = this.lightCv ||= Object.assign(document.createElement('canvas'), { width: 8, height: 6 });
      const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(video, 0, 0, 8, 6);
      const d = g.getImageData(0, 0, 8, 6).data; let r = 0, gr = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += (d[i] / 255) ** 2.2; gr += (d[i + 1] / 255) ** 2.2; b += (d[i + 2] / 255) ** 2.2; }
      const n = d.length / 4; r /= n; gr /= n; b /= n;
      const lum = Math.min(1, Math.pow(.2126 * r + .7152 * gr + .0722 * b, 1 / 2.2)), m = Math.max(r, gr, b, 1e-3);
      const k = .45; this.lum += (lum - this.lum) * k;
      this.tint = this.tint.map((t, i) => t + ((.55 + .45 * [r, gr, b][i] / m) - t) * k);
    } catch { /* picture not readable yet */ }
  }
  nativeLight() {
    const l = this.nat.light; if (!l) return;
    const k = .05, c = l.color || [1, 1, 1], m = Math.max(...c, 1e-3);
    this.lum += (Math.min(1, Math.max(0, l.intensity)) - this.lum) * k;
    this.tint = this.tint.map((t, i) => t + ((.55 + .45 * c[i] / m) - t) * k);
  }
  applyLight(on) {
    const L = on ? this.lum : .45, [r, g, b] = on ? this.tint : [1, 1, 1];
    this.hemi.intensity = .3 + L * 1.35; this.sunL.intensity = .7 + L * 3.6; this.envI = .25 + L * 1;
    this.hemi.color.setRGB(.91 * r, .93 * g, .97 * b); this.sunL.color.setRGB(r, .96 * g, .9 * b);
  }

  /** Unit vector the phone is pointing along. */
  forward(out = new Vector3()) { return out.set(0, 0, -1).applyQuaternion(this.cam.quaternion); }
  /** Which way the phone faces on the floor plane, in radians (0 = the start direction, turning left is +). */
  heading() { const f = this.forward(tmp); return Math.atan2(-f.x, -f.z); }
  /** Angle in radians between where the phone points and world point p. */
  offAim(p) { const f = this.forward(tmp), c = this.cam.position, x = p.x - c.x, y = p.y - c.y, z = p.z - c.z, l = Math.hypot(x, y, z) || 1; return Math.acos(Math.max(-1, Math.min(1, (f.x * x + f.y * y + f.z * z) / l))); }

  /** Draw the camera picture (or the virtual room), then the 3D scene on top. HUD goes after. */
  draw(c, W, H) {
    this.fit(W, H);
    let fov = 62;
    if (this.nat) {
      // the camera picture is drawn natively behind the page: leave the canvas see-through
      this.under = null; this.underCss = '';
      c.clearRect(0, 0, W, H); this.room.visible = false; this.nativeLight(); this.applyLight(true);
      this.projectNative(c); this.render(c, W, H); return;
    }
    if (this.seeing) {
      const v = this.camera.video, vw = v.videoWidth, vh = v.videoHeight, s = Math.max(W / vw, H / vh);
      // the video itself sits under the 3D canvas (CSS object-fit: cover crops it the same way), so
      // it isn't redrawn every frame; tests and screenshots (no direct mode) still draw it here
      this.underCss = '';
      if (HD.direct) this.under = v; else { this.under = null; c.drawImage(v, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s); }
      // match the 3D lens to what the camera shows, so placed things don't slide as you turn
      const f = Math.max(vw, vh) / 2 / Math.tan(LONG_FOV * Math.PI / 360);
      fov = 2 * Math.atan(H / s / 2 / f) * 180 / Math.PI;
      this.room.visible = false; this.estimateLight(v); this.applyLight(true);
    } else {
      this.applyLight(false); this.under = null;
      if (HD.direct) this.underCss = 'linear-gradient(#2b3442, #151a22)';
      else { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2b3442'); g.addColorStop(1, '#151a22'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
      this.room.visible = true;
    }
    if (Math.abs(this.cam.fov - fov) > .05) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
    this.render(c, W, H);
  }

  /**
   * Edge arrows to things you can't see: items = [{ p: Vector3, col }]. Off-screen and behind-you
   * targets get an arrow on the screen edge pointing the way to turn.
   */
  pointers(c, W, H, items) {
    const m = this.cam.matrixWorldInverse;
    for (const it of items) {
      const [sx, sy, z] = this.toScreen(it.p.x, it.p.y, it.p.z);
      if (z < 1 && sx > 12 && sx < W - 12 && sy > 12 && sy < H - 12) continue;
      const l = tmp.copy(it.p).applyMatrix4(m), a = Math.atan2(-l.y, l.x);
      const rx = W / 2 - 22, ry = H / 2 - 30, k = Math.min(rx / Math.abs(Math.cos(a) || 1e-3), ry / Math.abs(Math.sin(a) || 1e-3));
      const x = W / 2 + Math.cos(a) * k, y = H / 2 + Math.sin(a) * k;
      c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = it.col || '#fff'; c.strokeStyle = '#000a'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(13, 0); c.lineTo(-7, -9); c.lineTo(-3, 0); c.lineTo(-7, 9); c.closePath(); c.stroke(); c.fill(); c.restore();
    }
  }
}

/** A small "camera off / look around" note for the HUD, so players know what the fallback is. */
export function arNote(c, v, W, H) {
  if (v.cal) return calHUD(c, v, W, H);
  // the Floor chip: redo the calibration any time the camera is on
  if (v.nat) return nativeNote(c, v, W, H);
  if (v.seeing) {
    const k = v.chip = { x: 10, y: H - 36, w: 62, h: 24 };
    c.save(); c.fillStyle = '#04110ecc'; c.strokeStyle = '#19e3b188'; c.lineWidth = 1; c.beginPath(); c.roundRect(k.x, k.y, k.w, k.h, 12); c.fill(); c.stroke();
    c.fillStyle = '#8affdc'; c.font = '700 11px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('⇕ Floor', k.x + k.w / 2, k.y + 16); c.restore();
  } else v.chip = null;
  let t = null;
  if (v.camState === 'asking') t = 'Starting camera…';
  else if (v.camState === 'denied') t = v.sensor ? 'No camera: playing in a virtual room' : 'No camera: drag to look around';
  else if (!v.sensor && v.seeing) t = 'No motion sensor: drag to look around';
  if (!t) return;
  c.save(); c.font = '600 11px Rubik, sans-serif'; c.textAlign = 'center';
  const w = c.measureText(t).width + 20; c.fillStyle = '#000a'; const y = v.chip ? H - 64 : H - 34; c.beginPath(); c.roundRect(W / 2 - w / 2, y, w, 22, 11); c.fill();
  c.fillStyle = '#fff'; c.fillText(t, W / 2, y + 15); c.restore();
}

function pill(c, t, W, y) {
  c.save(); c.font = '600 11px Rubik, sans-serif'; c.textAlign = 'center';
  const w = c.measureText(t).width + 20; c.fillStyle = '#000a'; c.beginPath(); c.roundRect(W / 2 - w / 2, y, w, 22, 11); c.fill();
  c.fillStyle = '#fff'; c.fillText(t, W / 2, y + 15); c.restore();
}
function nativeNote(c, v, W, H) {
  v.chip = null;
  const n = v.nat;
  if (n.scan) return scanHUD(c, v, W, H);
  if (!GOOD[n.tracking]) pill(c, 'Finding your room: move the phone slowly', W, H - 34);
  else if (n.floor == null && performance.now() - n.t0 < 8000) pill(c, 'Point at the floor to find it', W, H - 34);
}

function scanHUD(c, v, W, H) {
  const n = v.nat, wait = (performance.now() - n.t0) / 1000;
  c.save(); c.textAlign = 'center';
  c.fillStyle = '#04110ed9'; c.beginPath(); c.roundRect(16, 60, W - 32, 74, 14); c.fill();
  c.fillStyle = '#fff'; c.font = '800 16px Rubik, sans-serif'; c.fillText('Find your floor', W / 2, 86);
  c.font = '500 12px Rubik, sans-serif'; c.fillStyle = '#c4ccdc';
  c.fillText(GOOD[n.tracking] ? 'Point the phone at the floor a few steps ahead' : 'Move the phone slowly from side to side', W / 2, 106);
  c.fillText('and sweep it slowly from side to side', W / 2, 122);
  n.skip = null;
  if (wait > 6) {
    const b = n.skip = { x: W / 2 - 50, y: H - 76, w: 100, h: 36 };
    c.fillStyle = '#04110ed9'; c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 18); c.fill();
    c.fillStyle = '#8affdc'; c.font = '700 13px Rubik, sans-serif'; c.fillText('Skip', W / 2, b.y + 23);
  }
  c.restore();
}

function calHUD(c, v, W, H) {
  const cal = v.cal;
  c.save(); c.textAlign = 'center';
  c.fillStyle = '#04110ed9'; c.beginPath(); c.roundRect(16, 60, W - 32, 74, 14); c.fill();
  c.fillStyle = '#fff'; c.font = '800 16px Rubik, sans-serif'; c.fillText('Line up your floor', W / 2, 86);
  c.font = '500 12px Rubik, sans-serif'; c.fillStyle = '#c4ccdc';
  c.fillText(v.seeing ? 'Point at the floor, then drag up or down' : 'Drag up or down to set your height', W / 2, 106);
  c.fillText('until the grid lies flat on it', W / 2, 122);
  c.fillStyle = '#04110ed9'; c.beginPath(); c.roundRect(W / 2 - 75, H - 110, 150, 26, 13); c.fill();
  c.font = '700 13px Rubik, sans-serif'; c.fillStyle = '#8affdc'; c.fillText(`Phone height ${cal.eye.toFixed(2)} m`, W / 2, H - 92);
  const b = cal.done = { x: W / 2 - 60, y: H - 76, w: 120, h: 40 };
  c.fillStyle = '#f2f5fb'; c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 20); c.fill();
  c.fillStyle = '#05070c'; c.font = '800 14px Rubik, sans-serif'; c.fillText('Done', W / 2, b.y + 25);
  c.restore();
}

export { THREE };

