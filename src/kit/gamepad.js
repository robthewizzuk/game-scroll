// Game controllers (Bluetooth or USB pads: Xbox, PlayStation, Switch, phone clip-on controllers).
// The app already turns a pad into keys for every game: the d-pad and left stick are the arrow
// keys, A is Space, B is 'x', X is 'z', Y is 'c', Start pauses. A game with key(k, down) works
// with a pad for free. For analog sticks and triggers, read the pad yourself:
//
//   const { pad, rumble } = gs.pad;
//   update(dt) {
//     const p = pad();                        // null if no controller is connected
//     if (p) { ship.vx = p.x * 200; if (p.pressed('a')) fire(); if (p.rt > .5) boost(); }
//   }
//   rumble(.6, 200);                          // strength 0..1, milliseconds (if the pad can)
//
// p.x, p.y (left stick, -1..1, with a dead zone), p.rx, p.ry (right stick), p.lt, p.rt (triggers
// 0..1), p.held('a' | 'b' | 'x' | 'y' | 'l' | 'r' | 'start' | 'select' | 'up' | 'down' | 'left' |
// 'right'), p.pressed(name) (just pressed this frame), p.released(name), p.index (which player).

import { hapticSettings } from './device.js';

const NAMES = ['a', 'b', 'x', 'y', 'l', 'r', 'lt2', 'rt2', 'select', 'start', 'ls', 'rs', 'up', 'down', 'left', 'right', 'home'];
const DEAD = .18;
const dz = v => Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD);
const state = new Map();   // index -> { now: Set, prev: Set, frame }
let frameNo = 0;

function read(gp) {
  let s = state.get(gp.index);
  if (!s) state.set(gp.index, s = { now: new Set(), prev: new Set(), frame: -1, gp });
  if (s.frame !== frameNo) {
    s.frame = frameNo; s.gp = gp; s.prev = s.now; s.now = new Set();
    gp.buttons.forEach((b, i) => { if (NAMES[i] && (b.pressed || b.value > .5)) s.now.add(NAMES[i]); });
    const [x = 0, y = 0] = gp.axes;
    if (x < -.5) s.now.add('left'); if (x > .5) s.now.add('right'); if (y < -.5) s.now.add('up'); if (y > .5) s.now.add('down');
  }
  const ax = gp.axes, bt = gp.buttons;
  return {
    index: gp.index, id: gp.id,
    x: dz(ax[0] || 0), y: dz(ax[1] || 0), rx: dz(ax[2] || 0), ry: dz(ax[3] || 0),
    lt: bt[6]?.value || 0, rt: bt[7]?.value || 0,
    held: n => s.now.has(n), pressed: n => s.now.has(n) && !s.prev.has(n), released: n => !s.now.has(n) && s.prev.has(n),
  };
}
// A browser shows a page its pads only once one has been used (a button pressed), and says so with
// 'gamepadconnected'. Until then there is nothing to read, so the pads are asked for only now and then
// (in case that news was missed): asking every frame cost the feed's frame a call into the browser (and
// now and then a wait on it) on every phone, almost none of which has a pad.
let seen = typeof navigator !== 'undefined' && typeof addEventListener === 'function' ? false : true, idle = 0;
if (!seen) addEventListener('gamepadconnected', () => { seen = true; });
function list() {
  if (!seen && (idle = (idle + 1) % 120)) return [];
  try { const l = [...(navigator.getGamepads?.() || [])].filter(g => g && g.connected); if (l.length) seen = true; return l; } catch { return []; }
}
/** The first connected controller (or the one for player `i`), or null. */
export function pad(i) { const l = list(); const g = i == null ? l[0] : l.find(p => p.index === i) || l[i]; return g ? read(g) : null; }
/** Every connected controller (local multiplayer). */
export function pads() { return list().map(read); }
/** Shakes the controller (if it can). strength 0..1, ms. Follows the player's vibration setting. */
export function rumble(strength = .5, ms = 150, i) {
  if (!hapticSettings.on) return;
  const l = list(), g = i == null ? l[0] : l.find(p => p.index === i);
  try { g?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: Math.min(1, strength * 1.2) }); } catch { /* not supported */ }
}

/* ---------- app use: pads as keys ---------- */
const KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', a: ' ', b: 'x', x: 'z', y: 'c', l: 'q', r: 'e', select: 'Escape' };
/**
 * Called by the app once per frame. Sends key(k, down) for buttons, and tells it about start (pause),
 * a (play) and up / down (move through the feed). Kit use only.
 */
export function pollPads(send) {
  frameNo++;
  for (const g of list()) {
    const p = read(g);
    for (const [n, k] of Object.entries(KEYS)) { if (p.pressed(n)) send('key', k, true); else if (p.released(n)) send('key', k, false); }
    if (p.pressed('start')) send('start');
  }
}
export const padConnected = () => list().length > 0;
