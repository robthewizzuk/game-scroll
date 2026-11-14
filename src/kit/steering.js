// What the phone and driver steering list has set for this device (the list and its matching: src/steer.js). The
// kits read it where they choose: each field left at its default means "as the kit would choose by itself".
// Kit and app use only: games never see this.
//   webgpu    false: 3D draws with WebGL (gpu.js: no WebGPU device is made; for one game: its views stay on WebGL)
//   hdr       false: no HDR canvas, the usual 8-bit one (gpu.js)
//   klass     'mid' | 'low': this device counts as no better than that (speed.js phoneClass: frame rates, quality
//             tiers to start from, what the kits turn on)
//   tier      0 (low) .. 3 (ultra): the 3D quality tier goes no higher (hd3d.js)
//   fps       no game runs at more frames a second than this (speed.js)
//   frameGen  false: no frame generation (speed.js)
//   traced    false: no ray traced reflections (hd3d.js)
//   half      false: the kit's passes stay in full precision (hd3d.js, half.js)
//   pack      false: code-made textures are not packed into the chip's compressed formats (pack.js)
//   hide      (for a game) the game is not shown on this device (src/main.js)
// Rules for one game (when.game) are kept apart in games: steerFor(id) is the device's knobs with that game's
// own on top.
const BLANK = { webgpu: true, hdr: true, klass: null, tier: null, fps: null, frameGen: true, traced: true, half: true, pack: true, hide: false };
export const STEER = {
  ...BLANK,
  games: new Map(),   // game id -> its own knobs (only the fields a rule set)
  rules: [],          // the ids of the rules that matched this device
  ready: Promise.resolve(),   // the app's matching at start (gpu.js waits for it before it makes the device)
};
const KLASS = { low: 0, mid: 1, top: 2 };
/** The knobs for one game on this device (the device's, with the game's own rules on top); id null: the device's. */
export function steerFor(id) {
  const g = id && STEER.games.get(id);
  if (!g) return STEER;
  return { ...STEER, ...g, tier: low(STEER.tier, g.tier), fps: low(STEER.fps, g.fps), klass: lowKlass(STEER.klass, g.klass) };
}
const low = (a, b) => a == null ? b ?? null : b == null ? a : Math.min(a, b);
const lowKlass = (a, b) => !a ? b || null : !b ? a : KLASS[a] <= KLASS[b] ? a : b;
/** A class no better than the steering list allows (speed.js). */
export const capKlass = (k, cap = STEER.klass) => cap && KLASS[cap] != null && KLASS[k] > KLASS[cap] ? cap : k;
/** Tests: back to no rules. */
export function resetSteer() { Object.assign(STEER, BLANK); STEER.games = new Map(); STEER.rules = []; }
