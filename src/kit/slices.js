// Loading a game without holding the feed still.
//
// A game's make() is one function. A big one (a board game's room, a level with twenty textures made
// in code) used to run in one go on the main thread, a third of a second or more with nothing else
// able to move. The game's code can't be cut up from outside, so the kit's builders do three things
// while a card is being made for the first time (the app calls begin() and end() round it):
//
//  - later(): the heavy number work a builder can finish afterwards (a texture's normal map, a recipe
//    material's pixels) goes to a background worker (jobs.js). The builder returns at once; the card
//    stays "Loading…" until the work is in, then shows the game it has already made. after() puts
//    off the little main-thread work round it (reading the painted canvas back) the same way.
//  - pause(): a builder that keeps what it makes (a prop, a tree, a recipe material: anything with its
//    own memory of what it has made) asks before each heavy build. When the pass has used its share
//    of the frame the answer is a StillLoading, exactly as a library that isn't in yet gives
//    (lazy.js): the app shows "Loading…" with its bar and makes the game again on the next frame.
//    Everything already built comes straight back from the builders' own memories, so each pass gets
//    a little further: a pass that was stopped here always builds at least one thing the next time.
//    The builder says built() when it is done, so the pass knows how much of its time was the game's.
//  - need(): a builder that can't go on without a worker's answer (a sculpted mesh, a path map) waits
//    for it the same way, and is handed the answer on the next pass.
//
// Stopping a pass halfway is only safe when nothing of it is left behind. A game that keeps its world
// between makes (`if (!view) setup()` at the top of its file, as the starter templates do) would find
// that world half built on the next pass. So the app runs each pass of a card's first making on a
// fresh copy of the game's file, whose own memory starts empty, and keeps the copy that got to the
// end (main.js). Where it can't get a fresh copy, or the game is already made, the pass is `whole`:
// pause() and need() never stop it, and only later() is at work.
//
// A pass is only ever handed something by the whole of what was asked for (a prop's options, a
// sculpt's shapes, a level's triangles), never by where in make() the asking happened, so it can't be
// given something made for a different question. That is why a surface painted by a game's own
// function doesn't pause: nothing says what the function will paint until it has. A game whose own
// code is the slow part (running it again every frame would cost more than it saves) is spotted and
// made in one go, as before. Outside a card's making (a new round, tests, Node) builders just build.
// Kit use only: games never see this.
import { StillLoading } from './lazy.js';

const SHARE = 5;        // ms of building in a pass before the next heavy build waits for the next frame
const TOO_SLOW = 30;    // ms of the game's own code in a pass: more than this is not worth running again every pass
const MOST = 150;       // passes: a card that still isn't made after this many is made in one go
const cards = new WeakMap();   // card -> { off, passes, waits, got, needs }
const coming = new Map();      // key -> { promise, done, value, failed }: worker answers on their way (need)
let cur = null;                // the pass in progress

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
// the next frame (or soon, where there are no frames: a hidden page)
const nextFrame = () => new Promise(res => {
  let done = false; const go = () => { if (!done) { done = true; res(); } };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go);
  setTimeout(go, 60);
});

/**
 * The app: a pass of make() + reset() for this card starts now. share: the milliseconds of a frame
 * the pass may use (less while a game is being played). whole: this pass must run to the end (it is
 * not on a fresh copy of the game), so nothing stops it; work can still be left with the workers.
 */
export function begin(card, share = SHARE, whole = false) {
  let st = cards.get(card); if (!st) cards.set(card, st = { off: false, passes: 0, waits: new Set(), got: new Map(), needs: {} });
  if (++st.passes > MOST) st.off = true;
  cur = { st, t0: now(), built: 0, share, whole, depth: 0, inBuild: 0, buildT0: 0 };
}
/**
 * The app: the pass is over. made: true when the game was made (false: it is waiting for the next
 * pass). Returns a promise when the game is made but work its builders left with a worker is still
 * out: the app keeps "Loading…" up until it settles. Otherwise null.
 */
export function end(card, made) {
  const p = cur; cur = null;
  const st = cards.get(card);
  if (p && watch) watch({ card, ms: now() - p.t0, own: own(p), built: p.built, off: p.st.off, whole: p.whole, made, waits: st ? st.waits.size : 0 });
  if (!made || !st) return null;
  const waits = [...st.waits]; cards.delete(card);
  return waits.length ? Promise.all(waits) : null;
}
/** The app: this card's making failed or the card is gone. */
export function forget(card) { cards.delete(card); }
// tests and the loading measurements watch each pass through this (nothing else does)
let watch = null;
export function onPass(fn) { watch = fn; }
/** Is a card being made right now? (Builders hand work to workers only then.) */
export const loading = () => !!cur;
/** How many passes this card has taken so far (the app's loading bar counts them). */
export const passes = card => cards.get(card)?.passes || 0;

// How long the pass has run outside the kit's own builds: the game's code, and kit work nobody keeps
// (a surface the game painted). Stopping the pass means running all of that again next time.
const own = p => now() - p.t0 - p.inBuild;

/**
 * A builder is about to make something heavy that it keeps (its own memory will hand it back next
 * time it is asked), and calls built() when it has. In a card's first making this may throw
 * StillLoading to let a frame go by; the pass after gets everything built so far from the builders'
 * memories and carries on from here. name: what the loading card says ("Textures", "Models").
 * A build inside another build (a prop that needs a material) never stops: the outer one has to finish.
 */
export function pause(name) {
  const p = cur; if (!p || p.whole || p.st.off) return;
  if (p.depth++ > 0) return;
  const mine = own(p);
  // A game whose own code is the slow part: stopping would cost more than it saves, this pass and
  // every pass after, so it is made in one go from here.
  if (mine > TOO_SLOW) { p.st.off = true; p.depth = 0; return; }
  // The pass has built something and used its share: at least SHARE ms of building, and at least as
  // long building as running the game's own code (so loading in passes never costs twice the work).
  if (p.built > 0 && p.inBuild >= Math.max(p.share, mine)) throw new StillLoading(name, nextFrame());
  p.built++; p.buildT0 = now();
}
/** The build that pause() let through is done (and in its builder's memory). */
export function built() {
  const p = cur; if (p && p.depth > 0 && --p.depth === 0) p.inBuild += now() - p.buildT0;
}

/**
 * A builder can't go on without a worker's answer. key says what is asked (everything the answer
 * depends on); start() begins the job and returns a promise of the answer (or nothing: no worker for
 * it). In a card's first making this throws StillLoading until the answer is in (the card says
 * "Loading…"), and the pass after gets the answer from here. It returns undefined, and the builder
 * makes the thing on the spot, when there is nothing to wait for (not loading, no worker, the job
 * failed) or waiting isn't worth it (inside another build, or the game's own code is the slow part).
 * A game that asks for something different every pass (a level laid out at random in reset()) would
 * wait for ever: an answer that came back and was not asked for again ends the waiting for that name
 * on this card.
 */
export function need(name, key, start) {
  const p = cur; if (!p || p.whole || p.st.off || p.depth > 0) return undefined;
  const st = p.st, n = st.needs[name] ||= { last: null, stop: false };
  if (st.got.has(key)) { if (n.last === key) n.last = null; return st.got.get(key); }
  if (n.stop) return undefined;
  if (n.last !== null && st.got.has(n.last)) { n.stop = true; return undefined; }   // (last pass's answer wasn't wanted this pass)
  let c = coming.get(key);
  if (!c) {
    let promise = null; try { promise = start(); } catch (err) { promise = null; }
    if (!promise) return undefined;
    c = { failed: false, value: undefined, done: false }; c.promise = promise.then(v => { c.value = v; c.done = true; coming.delete(key); }, () => { c.failed = true; });
    coming.set(key, c);
  }
  if (c.failed) { coming.delete(key); return undefined; }
  // (waiting means running the game's own code up to here again: not worth it for a game where that is the slow part)
  if (!c.done && own(p) > TOO_SLOW) { st.off = true; return undefined; }
  if (!c.done) { n.last = key; const got = st.got; throw new StillLoading(name, c.promise.then(() => { if (c.done) got.set(key, c.value); })); }
  st.got.set(key, c.value); return c.value;
}

/**
 * Work a builder has left with a worker and won't wait for (it fills in what the builder returned):
 * while a card is first being made, the card stays "Loading…" until the promise settles. Returns
 * whether it was taken on (false: nobody is waiting, so the builder should do the work now).
 */
export function later(promise) {
  const p = cur; if (!p) return false;
  const w = p.st.waits, q = promise.then(() => { w.delete(q); }, () => { w.delete(q); });
  w.add(q); return true;
}

// work put off with after(), done a few milliseconds a frame
const todo = []; let pumping = false;
function pump() {
  if (pumping || !todo.length) return;
  pumping = true;
  nextFrame().then(() => { pumping = false; const t = now(); while (todo.length && now() - t < SHARE) todo.shift()(); pump(); });
}
/**
 * A small piece of main-thread work a builder can put off until after the pass (reading a painted
 * canvas back to hand its pixels to a worker): start() is called a frame or so later, a few a
 * frame, whatever became of the pass, and the promise resolves with what it returned (a promise is
 * followed; a throw gives null). Null when no card is being made: do it now.
 */
export function after(start) {
  if (!cur) return null;
  return new Promise(res => { todo.push(() => { let r = null; try { r = start(); } catch (e) { r = null; } res(r); }); pump(); });
}

