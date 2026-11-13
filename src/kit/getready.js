// Getting a round ready behind the loading screen.
//
// A 3D round used to start the moment Play was pressed, and its first frames were the ones that built
// what the round needs: shaders for what reset() had just made (a new floor, another count of lights),
// their pictures sent to the graphics chip, shadow maps drawn for the first time. On WebGL that is one
// frame ten times as long as the rest; on WebGPU the new things wait hidden while their shaders build in
// the background, so the round began with half its level missing and filled in over the next second.
//
// So Play on a Next Gen, AR or Board game goes through the app's gate (src/main.js, getReady): a loading
// screen covers the card, the game's reset() runs, and then the round's own first frames are drawn under
// the cover, draw() without update(), on the same canvas and in the same pictures the round will use.
// Whatever those frames need is built there, where nobody sees it. The round starts when the kits have
// nothing left on its way and a few frames in a row came on time.
//
// This file is what the app and the kits share for that:
//   getready.warming  true while those frames are being drawn. A kit reads it to do the things that
//                     only make sense then: nothing is measured for the automatic quality (a frame
//                     that builds shaders says nothing about the phone), every frame is really drawn,
//                     and other cards' pictures wait.
//   waitsOn(fn)       a kit says what it still has on its way for the game on screen: fn() gives null,
//                     or { hard, soft, what }. hard: things the round must not start without (shaders
//                     being built, things hidden until theirs are). soft: things that only make it
//                     faster and come in unseen (cluster detail): the gate waits a little for them, not
//                     long. what: one word for the loading screen ("Shaders").
//   waiting()         the app: all of that added up.
// Kit and app use only: games never see this.

export const getready = { warming: false };

const askers = new Set();
/** A kit: fn() says what is still on its way for the game on screen (null, or { hard, soft, what }). Returns a function that takes it off again. */
export function waitsOn(fn) { askers.add(fn); return () => askers.delete(fn); }
/** The app: what the kits are still waiting for: { hard, soft, what }. */
export function waiting() {
  let hard = 0, soft = 0, what = '';
  for (const f of askers) {
    let a = null; try { a = f(); } catch (e) { /* a kit that can't say is not waited for */ }
    if (!a) continue;
    hard += a.hard | 0; soft += a.soft | 0; if (!what && a.what && (a.hard | 0 || a.soft | 0)) what = a.what;
  }
  return { hard, soft, what };
}

/**
 * Is the picture steady? The gate's rule for "a few frames in a row came on time", kept here so it can be
 * tested without a browser. A Steady is fed the gap in milliseconds between one drawn frame and the next:
 * add(gap, step), with step the milliseconds a frame takes at the game's rate. calm is how many gaps in a
 * row have been on time. A gap is on time when it is short by any of three measures: under 34 ms, under two
 * and a half frames at the game's rate, or under 1.8 times the usual gap lately (the middle one of the last
 * seven: a hot phone, or a test machine drawing in software, that can't reach the game's rate is steady at
 * its own, and one freak short gap doesn't make every gap after it look late). The first gap is left out
 * altogether: it holds the frame that did the building.
 */
export class Steady {
  constructor() { this.calm = 0; this.gaps = []; this.first = true; }
  add(gap, step = 16.7) {
    if (!(gap > 0)) return this.calm;
    if (this.first) { this.first = false; return this.calm; }
    const g = this.gaps, usual = g.length ? [...g].sort((a, b) => a - b)[g.length >> 1] : 0;
    this.calm = gap <= Math.max(34, 2.5 * step, 1.8 * usual) ? this.calm + 1 : 0;
    g.push(gap); if (g.length > 7) g.shift();
    return this.calm;
  }
}
