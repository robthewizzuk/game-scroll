// Ray tracing that loses the graphics chip (hd3d.js decides when reflections are ray traced; hd3d-gpu-trace.js draws them).
// The rays are traced in a shader of our own, the heaviest the kit asks of a phone's driver, and a driver that will not
// take it does not always say so: it can take the whole WebGPU device down instead. The first report from a chip that
// is not an Adreno (a Pixel 10a, Mali-G715, 2026-11-14) showed it: during the hall's ray traced run the device was lost,
// a new one was made, the tracing started again on it and lost that one too, until the fourth loss put the phone's 3D on
// WebGL for the rest of the session, with a three second freeze on the way.
// So a chip lost while the last 3D frame drawn was ray traced is put down to the ray tracing: it stays off for the rest
// of the session, whoever asks for it, and the new device draws reflections from the screen. And it is noted on the
// phone for this build of the app, so the next start does not trace by itself and lose the chip again (a test or the
// phone test tour that asks for tracing outright still tries once a session, which is how a fix is found to work).
// Kit use only.
import { store } from '../util.js';

const KEY = 'gs_trace_lost', BUILD = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev';
/** on: the last 3D frame drawn on WebGPU was ray traced; lost: ray tracing lost the chip this session; told: a loss put down to it that the report has not told yet (src/perf.js). */
export const TRACE = { on: false, lost: false, told: false };
/** Each WebGPU frame of a view on screen: whether its reflections were ray traced. */
export function traceDrew(on) { TRACE.on = !!on; }
/** The note kept on this phone ({ build, n, at }), or null: ray tracing lost its chip on this build of the app. */
export const traceNote = () => { const s = store.get(KEY, null); return s && s.build === BUILD ? s : null; };
/**
 * May reflections be ray traced? asked: something asked for it outright (HD.traced = true: tests, the phone test tour),
 * which a note from an earlier session does not stop; a loss in this session stops both.
 */
export const traceMay = asked => !TRACE.lost && (!!asked || !traceNote());
/** Why not, for the reports: 'lost' (it lost the chip this session), 'before' (it did on this build before: off by itself), '' (it may). */
export const traceOff = () => TRACE.lost ? 'lost' : traceNote() ? 'before' : '';
/** The graphics chip was lost (gpu.js onGpuLoss). True if ray tracing was drawing: it is off from now on, and noted. */
export function traceLostChip() {
  if (!TRACE.on) return false;
  const was = store.get(KEY, null);
  TRACE.on = false; TRACE.lost = TRACE.told = true;
  store.set(KEY, { build: BUILD, n: (was && was.build === BUILD ? was.n | 0 : 0) + 1, at: Date.now() });
  return true;
}
/** Tests: as on a phone that has never lost its chip to ray tracing. */
export function traceAgain() { TRACE.on = TRACE.lost = TRACE.told = false; try { localStorage.removeItem(KEY); } catch (_) { /* no storage */ } }
