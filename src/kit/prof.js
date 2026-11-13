// Where the phone's time goes, by part of the engine (Rob's pick 2 of 2026-11-13). The frame lab turns
// it on and reads take() once a frame, so its live panel and its report can say "physics 3D 1.2 ms,
// poses 0.8, crowds 0.4, 3D render 4.1 (shadows 0.8, drawing 2.1)" and what is left is the game's own
// code. Off, a timed method costs one extra call and one check; nothing is counted.
//
// A kit marks its per-frame work once, at load:
//   timed(World3D.prototype, 'step', 'physics 3D');
// and the 3D kit marks the parts of its frame by hand: const m = mark(); enter('3D: shadows'); ...; leave(m).
// A span inside another (a ragdoll's physics inside reactions) counts only for itself, so the parts add
// up to the time spent in all of them. PROF.trace also writes each span as a User Timing measure, which
// Chrome's DevTools shows on its timeline (chrome://inspect, the phone on a cable, a debug build).
// Engine only: games get nothing from here.

export const PROF = { on: false, trace: false };

const acc = new Map();          // name -> milliseconds of its own since the last take()
const N = [], T0 = [], K = [];  // the open spans: name, start, time of the spans inside it
let d = 0, top = 0;             // depth; time inside outermost spans since the last take()

/** Opens a span (only while PROF.on; pair it with leave()). */
export function enter(name) { N[d] = name; T0[d] = performance.now(); K[d] = 0; d++; }
/** The depth now, to close back to with leave(m) (a span left open by a throw is closed then too). */
export const mark = () => d;
/** Closes the newest span, or every span opened since mark m. */
export function leave(m = d - 1) {
  while (d > m && d > 0) {
    d--;
    const t = performance.now() - T0[d];
    acc.set(N[d], (acc.get(N[d]) || 0) + t - K[d]);
    if (d) K[d - 1] += t; else top += t;
    if (PROF.trace) try { performance.measure(N[d], { start: T0[d], duration: t }); } catch (_) { /* old browser */ }
  }
}

/**
 * Times obj[method] under name from now on (once; a second call is ignored). The method keeps its
 * `this`, arguments, return value and throws; off, it costs a call and a check.
 */
export function timed(obj, method, name) {
  const fn = obj?.[method];
  if (typeof fn !== 'function' || fn.gsTimed) return;
  const w = function () {
    if (!PROF.on) return fn.apply(this, arguments);
    const m = d; enter(name);
    try { return fn.apply(this, arguments); } finally { leave(m); }
  };
  w.gsTimed = name; w.raw = fn;
  try { Object.defineProperty(w, 'name', { value: fn.name }); } catch (_) { /* name is only for stack traces */ }
  obj[method] = w;
}

/** Times fn() under name (for code that isn't a method). */
export function span(name, fn) {
  if (!PROF.on) return fn();
  const m = d; enter(name);
  try { return fn(); } finally { leave(m); }
}

/**
 * Adds each part's own milliseconds since the last call into `into` ({ name: ms }) and starts again.
 * Returns the time spent inside all of them (the outermost spans), to take from the frame's total.
 */
export function take(into) {
  if (into) for (const [k, v] of acc) into[k] = (into[k] || 0) + v;
  acc.clear(); const t = top; top = 0; return t;
}

/** Tests: forget everything, close what is open. */
export function resetProf() { acc.clear(); d = 0; top = 0; }
