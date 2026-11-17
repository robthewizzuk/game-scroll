// Controls kit: on-screen joysticks and buttons, two-thumb layouts, and tap / double-tap / hold /
// swipe detection that feels the same in every game. All positions are in the game's own units.
//
// Each control has down(x, y, id) / move(x, y, pressed, id) / up(x, y, id) like a game. Pass your
// game's input straight through, or let `route()` hand each finger to the first control that wants it:
//
//   import { Stick, Button, Gestures, route, twoThumb } from '../kit/controls.js';
//   const stick = new Stick({ x: 60, y: H - 70, r: 40, floating: true, zone: [0, H / 2, W / 2, H / 2] });
//   const jump = new Button({ x: W - 60, y: H - 70, r: 32, label: 'A' });
//   const input = route(stick, jump);
//   // game object: down: input.down, move: input.move, up: input.up
//   // update: player.vx = stick.x * speed;  if (jump.pressed()) ...  (pressed() is true once per tap)
//   // draw:   stick.draw(c); jump.draw(c);
//
// Fingers are tracked by pointer id, so a stick and a button work at the same time (two thumbs).
//
// On a games handheld or in Steam's games mode (src/desktop.js consoleMode: a ROG Ally, a Steam Deck) the sticks and
// buttons aren't drawn: it has real ones, and the game plays with them through key() (Rob, 2026-11-17: "hide any
// transparent controls like joystick etc as we will use the physical controls"). They come back for a few seconds
// whenever a finger touches the screen, and still work under a finger all the while. onScreen() says which.
import { consoleMode } from '../desktop.js';

const TAU = Math.PI * 2;
let touchAt = -1e9;
if (consoleMode && typeof addEventListener === 'function') addEventListener('pointerdown', e => { if (e.pointerType === 'touch') touchAt = performance.now(); }, { capture: true, passive: true });
const SHOW_AFTER_TOUCH = 8000;
/** Whether on-screen sticks and buttons are drawn now: always on a phone; on a handheld (real controls) only for a few seconds after a touch. */
export const onScreen = () => !hideOnScreen.on || performance.now() - touchAt < SHOW_AFTER_TOUCH;
/** (tests) on: hide them, as on a handheld */
export const hideOnScreen = { on: consoleMode };
const inZone = (z, x, y) => !z || (x >= z[0] && y >= z[1] && x <= z[0] + z[2] && y <= z[1] + z[3]);
const now = () => performance.now() / 1000;

/* ---------- joystick ---------- */
/**
 * A virtual thumbstick. Read stick.x and stick.y (-1..1, with a small dead zone), stick.mag (0..1),
 * stick.angle (radians) and stick.active. Options:
 *   x, y, r      where it sits and how far the knob travels
 *   floating     true: it appears wherever the thumb lands inside `zone` (best on phones)
 *   zone         [x, y, w, h] area that grabs a touch (default: a circle around the stick)
 *   dead         dead zone 0..1 (default .12)
 *   axis         'both' | 'x' | 'y' (a one-axis slider, e.g. steering)
 */
export class Stick {
  constructor({ x = 60, y = 200, r = 40, floating = false, zone = null, dead = .12, axis = 'both', color = '#ffffff' } = {}) {
    Object.assign(this, { hx: x, hy: y, r, floating, zone, dead, axis, color });
    this.cx = x; this.cy = y; this.kx = x; this.ky = y; this.id = null; this.x = 0; this.y = 0;
  }
  /** Moves the stick's home spot (call from resize()). */
  place(x, y, zone = this.zone) { this.hx = x; this.hy = y; this.zone = zone; if (this.id == null) { this.cx = this.kx = x; this.cy = this.ky = y; } }
  get active() { return this.id != null; }
  get mag() { return Math.min(1, Math.hypot(this.x, this.y)); }
  get angle() { return Math.atan2(this.y, this.x); }
  wants(x, y) { return this.zone ? inZone(this.zone, x, y) : Math.hypot(x - this.hx, y - this.hy) < this.r * 1.6; }
  down(x, y, id = 0) {
    if (this.id != null || !this.wants(x, y)) return false;
    this.id = id;
    if (this.floating) { this.cx = x; this.cy = y; } else { this.cx = this.hx; this.cy = this.hy; }
    this.set(x, y); return true;
  }
  move(x, y, pressed, id = 0) { if (id !== this.id) return false; this.set(x, y); return true; }
  up(x, y, id = 0) { if (id !== this.id) return false; this.release(); return true; }
  release() { this.id = null; this.x = this.y = 0; this.cx = this.kx = this.hx; this.cy = this.ky = this.hy; }
  set(x, y) {
    let dx = x - this.cx, dy = y - this.cy;
    if (this.axis === 'x') dy = 0; if (this.axis === 'y') dx = 0;
    const d = Math.hypot(dx, dy), k = d > this.r ? this.r / d : 1;
    this.kx = this.cx + dx * k; this.ky = this.cy + dy * k;
    const m = Math.min(1, d / this.r), live = m < this.dead ? 0 : (m - this.dead) / (1 - this.dead);
    this.x = d ? dx / d * live : 0; this.y = d ? dy / d * live : 0;
  }
  /** Draws the base ring and knob. Faint while idle so it doesn't cover the game. */
  draw(c, { alpha = this.active ? .55 : .22, pixel = false } = {}) {
    if (!onScreen()) return;
    c.save(); c.globalAlpha = alpha; c.strokeStyle = this.color; c.fillStyle = this.color;
    const P = v => pixel ? Math.round(v) : v;
    c.lineWidth = pixel ? 1 : 2; c.beginPath(); c.arc(P(this.cx), P(this.cy), this.r, 0, TAU); c.stroke();
    c.globalAlpha = alpha * 1.4; c.beginPath(); c.arc(P(this.kx), P(this.ky), this.r * .45, 0, TAU); c.fill();
    c.restore();
  }
}

/* ---------- button ---------- */
/**
 * A round on-screen button. button.isDown is true while held; pressed() is true once per press
 * (then resets), released() once per let-go; heldFor is seconds held. Optional label, zone [x,y,w,h].
 */
export class Button {
  constructor({ x = 300, y = 200, r = 30, label = '', zone = null, color = '#ffffff' } = {}) {
    Object.assign(this, { x, y, r, label, zone, color });
    this.id = null; this.isDown = false; this._p = false; this._r = false; this.t0 = 0;
  }
  place(x, y, zone = this.zone) { this.x = x; this.y = y; this.zone = zone; }
  wants(x, y) { return this.zone ? inZone(this.zone, x, y) : Math.hypot(x - this.x, y - this.y) < this.r * 1.3; }
  get heldFor() { return this.isDown ? now() - this.t0 : 0; }
  pressed() { const p = this._p; this._p = false; return p; }
  released() { const r = this._r; this._r = false; return r; }
  down(x, y, id = 0) { if (this.id != null || !this.wants(x, y)) return false; this.id = id; this.isDown = true; this._p = true; this.t0 = now(); return true; }
  move(x, y, pressed, id = 0) { return id === this.id; }
  up(x, y, id = 0) { if (id !== this.id) return false; this.id = null; this.isDown = false; this._r = true; return true; }
  release() { this.id = null; this.isDown = false; this._p = this._r = false; }
  draw(c, { alpha = this.isDown ? .6 : .3, font = '700 14px Rubik, sans-serif' } = {}) {
    if (!onScreen()) return;
    c.save(); c.globalAlpha = alpha; c.fillStyle = this.color;
    c.beginPath(); c.arc(this.x, this.y, this.isDown ? this.r * .92 : this.r, 0, TAU); c.fill();
    if (this.label) { c.globalAlpha = .9; c.fillStyle = '#000000'; c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(this.label, this.x, this.y + 1); }
    c.restore();
  }
}

/* ---------- gestures ---------- */
/**
 * Tap, double-tap, hold and swipe on any area, with the same timings everywhere:
 *   const g = new Gestures({
 *     tap: (x, y) => {}, doubleTap: (x, y) => {}, hold: (x, y) => {}, holdEnd: (x, y, secs) => {},
 *     swipe: (dir, vx, vy, x, y) => {},            // dir is 'left' | 'right' | 'up' | 'down'
 *     drag: (x, y, dx, dy) => {},                  // every move while a finger is down
 *     zone: [x, y, w, h],                          // optional area; default: anywhere
 *   });
 * Call g.update() each frame (it fires hold() while the finger stays still). When doubleTap is
 * set, a single tap still fires straight away; a quick second one also fires doubleTap.
 */
export class Gestures {
  constructor({ zone = null, holdTime = .35, swipeDist = 24, swipeSpeed = 260, doubleGap = .28, ...cb } = {}) {
    Object.assign(this, { zone, holdTime, swipeDist, swipeSpeed, doubleGap, cb });
    this.f = null; this.lastTap = null;
  }
  wants(x, y) { return inZone(this.zone, x, y); }
  get holding() { return !!(this.f && this.f.held); }
  down(x, y, id = 0) {
    if (this.f || !this.wants(x, y)) return false;
    const t = now();
    this.f = { id, x0: x, y0: y, x, y, t0: t, pts: [{ x, y, t }], held: false, moved: false };
    return true;
  }
  move(x, y, pressed, id = 0) {
    const f = this.f; if (!f || f.id !== id) return false;
    const dx = x - f.x, dy = y - f.y, t = now();
    f.x = x; f.y = y; f.pts.push({ x, y, t }); while (f.pts.length > 2 && t - f.pts[0].t > .1) f.pts.shift();
    if (Math.hypot(x - f.x0, y - f.y0) > 10) f.moved = true;
    this.cb.drag?.(x, y, dx, dy);
    return true;
  }
  up(x, y, id = 0) {
    const f = this.f; if (!f || f.id !== id) return false;
    this.f = null;
    const t = now(), secs = t - f.t0, dx = x - f.x0, dy = y - f.y0, dist = Math.hypot(dx, dy);
    if (f.held) { this.cb.holdEnd?.(x, y, secs); return true; }
    const a = f.pts[0], dt = Math.max(.016, t - a.t), vx = (x - a.x) / dt, vy = (y - a.y) / dt;
    if (dist >= this.swipeDist && Math.hypot(vx, vy) >= this.swipeSpeed) {
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      this.cb.swipe?.(dir, vx, vy, f.x0, f.y0);
      return true;
    }
    if (!f.moved && secs < this.holdTime) {
      const lt = this.lastTap;
      if (lt && t - lt.t < this.doubleGap && Math.hypot(x - lt.x, y - lt.y) < 30) { this.lastTap = null; this.cb.doubleTap?.(x, y); }
      else { this.lastTap = { x, y, t }; }
      this.cb.tap?.(x, y);
    }
    return true;
  }
  update() {
    const f = this.f;
    if (f && !f.held && !f.moved && now() - f.t0 >= this.holdTime) { f.held = true; this.cb.hold?.(f.x, f.y); }
  }
  release() { this.f = null; }
}

/* ---------- two fingers: pinch, twist, two-finger drag ---------- */
/**
 * Pinch to zoom, twist to turn and two-finger drag (pan), with one-finger gestures still working:
 *   const two = new TwoFingers({
 *     one: new Gestures({ tap, swipe }),            // optional: gets the touch while only one finger is down
 *     pinch: (scale, x, y) => {},                   // scale since the last call (1.1 = 10% apart); x, y the midpoint
 *     twist: (angle, x, y) => {},                   // radians turned since the last call (clockwise is +)
 *     pan: (dx, dy) => {},                          // how far the midpoint moved
 *     start: (x, y) => {}, end: (scale, angle) => {},   // totals for the whole gesture
 *     zone: [x, y, w, h],
 *   });
 * Or read two.active, two.scale and two.angle (totals since the second finger landed) and two.x, two.y.
 * When a second finger lands, the one-finger control is released (no stray tap or swipe). Pass it
 * through like any control, or into route(). On desktop, the mouse wheel isn't sent to games, so
 * also offer buttons or a slider for zoom.
 */
export class TwoFingers {
  constructor({ zone = null, one = null, minScale = .002, minTurn = .002, ...cb } = {}) {
    Object.assign(this, { zone, one, minScale, minTurn, cb });
    this.f = new Map(); this.active = false; this.scale = 1; this.angle = 0; this.x = 0; this.y = 0; this.oneHas = false;
  }
  wants(x, y) { return inZone(this.zone, x, y); }
  geo() {
    const [a, b] = [...this.f.values()];
    return { d: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), a: Math.atan2(b.y - a.y, b.x - a.x), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  down(x, y, id = 0) {
    if (this.f.size >= 2 || (!this.f.size && !this.wants(x, y))) return false;
    this.f.set(id, { x, y });
    if (this.f.size === 1) { this.oneHas = !!this.one?.down(x, y, id); return true; }
    if (this.oneHas) { this.one.release?.(); this.oneHas = false; }
    const g = this.geo(); this.last = g; this.active = true; this.scale = 1; this.angle = 0; this.x = g.x; this.y = g.y;
    this.cb.start?.(g.x, g.y);
    return true;
  }
  move(x, y, pressed, id = 0) {
    const p = this.f.get(id); if (!p) return false;
    p.x = x; p.y = y;
    if (!this.active) { if (this.oneHas) this.one.move(x, y, pressed, id); return true; }
    const g = this.geo(), L = this.last;
    let da = g.a - L.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    const k = g.d / L.d;
    if (Math.abs(k - 1) > this.minScale) { this.scale *= k; this.cb.pinch?.(k, g.x, g.y); L.d = g.d; }
    if (Math.abs(da) > this.minTurn) { this.angle += da; this.cb.twist?.(da, g.x, g.y); L.a = g.a; }
    if (g.x !== L.x || g.y !== L.y) { this.cb.pan?.(g.x - L.x, g.y - L.y); L.x = g.x; L.y = g.y; }
    this.x = g.x; this.y = g.y;
    return true;
  }
  up(x, y, id = 0) {
    if (!this.f.has(id)) return false;
    this.f.delete(id);
    if (this.active) { this.active = false; this.cb.end?.(this.scale, this.angle); this.f.clear(); return true; }   // lift both: no surprise one-finger drag
    if (this.oneHas) { this.oneHas = false; this.one.up(x, y, id); }
    return true;
  }
  update() { this.one?.update?.(); }
  release() { if (this.oneHas) this.one.release?.(); this.oneHas = false; this.f.clear(); this.active = false; }
}

/* ---------- routing ---------- */
/**
 * Hands each finger to the first control that claims it (in the order given) and keeps it there
 * until that finger lifts. Returns { down, move, up, release } to use as the game's own handlers.
 * A plain function can be passed as a last catch-all: fn(type, x, y, id) with type 'down' | 'move' | 'up'.
 */
export function route(...controls) {
  const owner = new Map();
  const fn = typeof controls[controls.length - 1] === 'function' ? controls.pop() : null;
  return {
    down(x, y, id = 0) {
      for (const k of controls) if (k.down(x, y, id)) { owner.set(id, k); return true; }
      if (fn) { owner.set(id, fn); fn('down', x, y, id); return true; }
      return false;
    },
    move(x, y, pressed, id = 0) {
      const k = owner.get(id);
      if (k === fn && fn) fn('move', x, y, id); else if (k) k.move(x, y, pressed, id);
      else if (fn && !pressed) fn('move', x, y, id);
    },
    up(x, y, id = 0) {
      const k = owner.get(id); owner.delete(id);
      if (k === fn && fn) fn('up', x, y, id); else if (k) k.up(x, y, id);
    },
    /** Lets go of everything (call from reset()). */
    release() { owner.clear(); for (const k of controls) k.release?.(); },
  };
}

/* ---------- two thumbs ---------- */
/**
 * The standard two-thumb layout: a floating stick on the left half and, on the right half, either
 * a second stick (aim / look) or buttons. One-thumb fallback: the left stick still works alone.
 *   const pad = twoThumb(W, H, { right: 'stick' });          // or right: ['A', 'B'] for buttons
 *   pad.left.x / pad.left.y,  pad.right.x (stick) or pad.buttons.A.pressed()
 *   game: down/move/up -> pad.down/move/up; resize(w, h) -> pad.layout(w, h); draw -> pad.draw(c)
 */
export function twoThumb(W, H, { right = 'stick', r = null } = {}) {
  const R = r || Math.max(24, Math.min(W, H) * .12);
  const left = new Stick({ r: R, floating: true });
  const rs = right === 'stick' ? new Stick({ r: R, floating: true }) : null;
  const names = Array.isArray(right) ? right : [];
  const buttons = Object.fromEntries(names.map(n => [n, new Button({ r: R * .7, label: n })]));
  const pad = { left, right: rs, buttons };
  pad.layout = (w, h) => {
    const y = h - R * 1.8;
    left.place(R * 1.8, y, [0, h * .35, w / 2, h * .65]);
    if (rs) rs.place(w - R * 1.8, y, [w / 2, h * .35, w / 2, h * .65]);
    names.forEach((n, i) => buttons[n].place(w - R * 1.3 - (names.length - 1 - i) * R * 1.7, y + (i % 2 ? -R * .7 : R * .2)));
  };
  pad.layout(W, H);
  const r_ = route(...Object.values(buttons), ...(rs ? [rs] : []), left);
  pad.down = r_.down; pad.move = r_.move; pad.up = r_.up; pad.release = r_.release;
  pad.draw = (c, o) => { left.draw(c, o); rs?.draw(c, o); for (const b of Object.values(buttons)) b.draw(c, o); };
  return pad;
}

/* ---------- keyboard ---------- */
/**
 * Keeps track of held keys for desktop play: const keys = new Keys(); key: (k, d) => keys.key(k, d);
 * keys.held('ArrowLeft'), keys.axis() -> { x, y } from the arrows / WASD.
 */
export class Keys {
  constructor() { this.down = new Set(); }
  key(k, d) { const n = k.length === 1 ? k.toLowerCase() : k; if (d) this.down.add(n); else this.down.delete(n); }
  held(k) { return this.down.has(k.length === 1 ? k.toLowerCase() : k); }
  axis() {
    const h = k => this.down.has(k);
    return { x: (h('ArrowRight') || h('d') ? 1 : 0) - (h('ArrowLeft') || h('a') ? 1 : 0), y: (h('ArrowDown') || h('s') ? 1 : 0) - (h('ArrowUp') || h('w') ? 1 : 0) };
  }
  clear() { this.down.clear(); }
}
