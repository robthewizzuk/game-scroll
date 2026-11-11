// Bridge to the NativeAR plugin (plugins/native-ar): ARKit on iPhone, ARCore on Android.
// The native camera view sits behind a see-through page; this module passes its pose, planes,
// feature points and light to whichever ARView is live, and (AR phase 2, when a game asks) its depth
// pictures, the room's light, anchors and found pictures. Used by ar3d.js, and by the feed to hide
// walk-around games.
import { Capacitor, registerPlugin } from '@capacitor/core';

const has = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('NativeAR');
const AR = has ? registerPlugin('NativeAR') : null;

let probe = null, supported = null, sink = null, listening = false;

/** Ask once whether this phone can do native AR. Resolves true / false. */
export function nativeARProbe() {
  if (!AR) { supported = false; return Promise.resolve(false); }
  return probe ||= AR.available().then(r => (supported = !!r?.supported), () => (supported = false));
}
/** true / false once known, null while still asking (or never asked). */
export const nativeARSupported = () => supported;

function listen() {
  if (listening) return; listening = true;
  AR.addListener('frame', d => sink?.frame(d));
  AR.addListener('planes', d => sink?.planes(d.planes || [], d.points || null, d.anchors || null));
  AR.addListener('depth', d => sink?.depth?.(d));
  AR.addListener('env', d => sink?.roomLight?.(d));
}

/**
 * Start native AR for one view ({ frame(d), planes(list, points, anchors), depth(d), roomLight(d) }).
 * ask: { depth, walls, light: 'real' } turns on the parts a game wants (an older app ignores them).
 * Resolves { started, reason, depth, walls, light }: the last three say which of them this phone gave.
 */
export async function nativeStart(view, ask = {}) {
  if (!AR || !(await nativeARProbe())) return { started: false, reason: 'unsupported' };
  listen(); sink = view;
  let r;
  try { r = await AR.start({ depth: !!ask.depth, walls: !!ask.walls, light: ask.light === 'real' ? 'real' : 'ambient' }); } catch (e) { r = { started: false, reason: String(e?.message || e) }; }
  if (sink !== view) {   // the game stopped (or another took over) while starting
    if (r?.started && !sink) AR.stop().catch(() => {});
    return { started: false, reason: 'switched' };
  }
  if (!r?.started) nativeStop(view);
  else document.documentElement.classList.add('ar-live');   // see-through page: the camera shows behind
  return r;
}
/** Stop native AR if this view (or any view, when none is given) owns it. Resolves when the phone has let go of the camera. */
export function nativeStop(view) {
  if (view && sink !== view) return Promise.resolve();
  sink = null;
  document.documentElement.classList.remove('ar-live');
  return AR ? AR.stop().catch(() => {}) : Promise.resolve();
}
/**
 * Ask for the feature points the phone is tracking (x, y, z in millimetres) with each "planes"
 * event, or stop them. The floor search uses them; an older app without this just ignores it.
 */
export function nativePoints(on) { AR?.points({ on: !!on }).catch(() => {}); }
/** Where a screen point (CSS px) meets a real surface: [{ pose: 16 floats, kind }]. */
export async function nativeHit(x, y) {
  if (!AR) return [];
  try { return (await AR.hitTest({ x, y }))?.hits || []; } catch { return []; }
}
/**
 * Hold a real spot: the phone keeps the pose (p: [x, y, z], q: [x, y, z, w], in its own space) fixed to
 * the room as it corrects its map, and sends it with each "planes" event. Resolves true when it will.
 */
export async function nativeAnchor(id, p, q) {
  if (!AR) return false;
  try { return !!(await AR.anchor({ id, p, q }))?.ok; } catch { return false; }   // (an older app has no anchors)
}
export function nativeUnanchor(id) { try { AR?.removeAnchor({ id }).catch(() => {}); } catch { /* an older app */ } }
/**
 * The pictures to look for in the room: [{ name, png (base64), width (metres) }]. Resolves
 * { added: [names], rejected: [names] } (a picture with too little detail is turned down), or null
 * when this phone or app can't look for pictures.
 */
export async function nativeImages(images) {
  if (!AR) return null;
  try { const r = await AR.images({ images }); return r && Array.isArray(r.added) ? r : null; } catch { return null; }
}
