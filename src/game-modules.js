// The shared modules a game may import, and which of their exports it gets.
//
// Games run inside the app, so they could in principle reach any app code: the wallet, the saved
// progress, settings. Only the modules below are handed to games. Everything else (progress,
// services, hearts, settings ...) is app-only, so a game can't pay itself credits, wipe a player's
// save or change their settings.
//
// Games import one module, src/gamescroll.js, and get everything through its default export `gs`.
// Used in three places, so they always agree:
//  - src/remote.js gives streamed games only gs;
//  - scripts/build-games.mjs refuses to build a game that imports anything else;
//  - scripts/game-lint.mjs flags such imports on pull requests.
//
// Adding a module here is a change to the app (it ships with an app update), so it needs its own PR.
export const GAME_MODULES = ['gamescroll.js'];

// Games import only the default export, gs (import gs from '../gamescroll.js'). What gs leaves out
// (raw storage, settings, the app's own hooks) is listed in src/gamescroll.js.
export const HIDDEN = {};

/**
 * Which parts of gs a game uses, read from its source: ['sound.sfx', 'device.haptic', 'physics.Physics', ...].
 * Streamed games carry this list, so an older app that lacks one of them skips the game.
 * Reads `const { a, b: c } = gs.ns`, `gs.ns.name` and plain `gs.ns`.
 */
export function gsNeeds(src) {
  const out = new Set();
  for (const m of src.matchAll(/\{([^{}]*)\}\s*=\s*gs\s*\.\s*(\w+)/g))
    for (const part of m[1].split(',')) { const n = part.trim().split(/\s*:\s*/)[0].trim(); if (/^\w+$/.test(n)) out.add(m[2] + '.' + n); }
  for (const m of src.matchAll(/\bgs\s*\.\s*(\w+)(?:\s*\.\s*(\w+))?/g)) out.add(m[2] ? m[1] + '.' + m[2] : m[1]);
  return [...out].sort();
}
/** Does gs (or a module object) have every path in names? */
export function hasAll(obj, names) {
  return names.every(n => { let o = obj; for (const k of n.split('.')) { if (o == null || !(k in Object(o))) return false; o = o[k]; } return true; });
}

// Extra features on the `api` a game receives in make(api). A streamed game that uses one is only
// offered to apps that have it (older apps skip the game instead of crashing).
export const API_FEATURES = ['save', 'load', 'clearSave', 'location', 'watchLocation', 'ahead', 'saveLocal', 'loadLocal', 'clearLocal'];

// How precisely a game may know where the player is. A game that calls api.location() or
// api.watchLocation() must say which in its definition (location: 'coarse'), and the feed shows it.
export const LOCATION_LEVELS = ['coarse', 'precise'];

// Which phone sensors a game uses, worked out from the gs parts it uses (gsNeeds), so the feed can
// say so before Play and ask for motion access on the Play tap. Games don't declare it themselves.
const SENSORS = {
  camera: ['device.startCamera', 'vision.Face', 'vision.Hands', 'vision.Body', 'vision.CutOut', 'vision.Signs', 'vision.Objects', 'vision.Scanner', 'vision', 'ar.ARView', 'ar'],
  mic: ['device.startMic', 'hear.Sounds', 'hear.Voice', 'hear'],
  steps: ['device.steps'],
  pressure: ['device.pressure'],
  light: ['device.light'],
  near: ['device.near'],
  motion: ['device.tilt', 'device.calibrateTilt', 'device.onMotion', 'device.onShake', 'device.heading', 'device.orientation', 'device.faceDown', 'moves.Moves', 'moves', 'ar.ARView', 'ar'],
};
/** ['camera', 'mic', 'steps', 'pressure', 'light', 'near', 'motion'] (the ones a game uses), from a gsNeeds list. */
export function sensorsOf(needs) {
  return Object.keys(SENSORS).filter(s => SENSORS[s].some(n => needs.includes(n)));
}
