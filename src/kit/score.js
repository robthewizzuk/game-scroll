// A film score for a game, as action games mix theirs: stems rendered once (score-render.js: a drone, strings, an
// ostinato pulse, ticks, big drums, brass, a high lift) that all loop together, faded in and out by how intense
// the play is, with the one-off moments laid on the beat (an orchestral hit), on the bar (a riser that builds for a
// few seconds and lands an impact on the next bar line) and stings for a win, a loss or a find. It plays on the
// music channel, so the player's music setting, the mixer and gunfire's dip (gunshots.js) all reach it.
//
//   reset() { score = gs.sound.score({ mood: 'tense', key: 'D' }); }       // made in the background while the round loads
//   update(dt) {
//     if (!score.playing) score.start();
//     score.intensity(enemiesNear / 6);       // 0 the drone alone .. .5 strings, pulse and ticks .. .85 drums and brass
//     if (boss) score.final(true);            // the high lift on top
//   }
//   on a kill: score.hit()        before the boss door opens: score.riser(4)        game over: score.sting('lose')
//
// moods: 'tense', 'heroic', 'dark', 'sad', 'chase', 'explore'; key: 'C' .. 'B' (a flat as 'Bb'); tempo: beats a minute
// (the mood's own if not given); seed: the same seed, the same music; vol: 0..1. gs.sound.follow(score) drives its
// intensity from the play as it does a music() tune's.
import { audio, sound } from '../sfx.js';
import { kitBus } from './sound.js';
import { register } from './cleanup.js';
import { run, canRun } from './jobs.js';
import { scorePart, plan, STEMS, ONESHOTS, MOODS, partRate, stemLength } from './score-render.js';

// how each stem sits as intensity rises (smoothstep ramps: a, the strings, pulse and ticks; b, the drums and brass)
const ss = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
function levels(x, fin) {
  const a = ss(.3, .6, x), b = ss(.7, .95, x), f = fin ? b : 0;
  return { drone: 1 - .15 * a - .15 * b - .2 * f, strings: a * (.85 + .15 * b), pulse: a * (.8 + .2 * b) * (1 - .2 * f), ticks: a * (.7 + .3 * b), drums: b, brass: b * (1 - .15 * f), lift: f };
}
const made = new Map();   // a score's parts once made, shared by every score with the same options (key -> part -> [L, R])
const live = new Set(), held = new Set();
const stats = { parts: 0, inWorker: 0, here: 0 };
/** Kit and tests: how many parts were made, and where. */
export const scoreStats = () => ({ ...stats, playing: live.size });

// makes the parts (the stems first, the drone before all), a few at once in workers or, without, a few milliseconds at
// a time here; onPart(name) as each lands
function make(key, o, onPart) {
  let have = made.get(key);
  if (!have) {
    // (a score's parts are a few megabytes: only the last two kinds made are kept, for "Play again" and the next card)
    for (const old of [...made.keys()]) if (made.size >= 2 && old !== key) made.delete(old);
    made.set(key, have = { parts: {}, cbs: [] });
  }
  have.cbs.push(onPart);
  for (const n of Object.keys(have.parts)) onPart(n);
  if (have.started) return have;
  have.started = true;
  const order = [...STEMS, ...ONESHOTS], next = () => order.shift();
  const land = (n, ch) => { have.parts[n] = ch; stats.parts++; for (const cb of have.cbs) cb(n); };
  const here = n => {   // (stepped: never more than a few milliseconds of a frame)
    const g = scorePart(n, o);
    const step = () => { const t0 = Date.now(); let x; do { x = g.next(); } while (!x.done && Date.now() - t0 < 6); if (x.done) { stats.here++; land(n, x.value); go(); } else setTimeout(step, 0); };
    setTimeout(step, 0);
  };
  const go = () => { const n = next(); if (!n) return; if (canRun()) run('sound', { what: 'score', part: n, ...o }).then(ch => { stats.inWorker++; land(n, ch); go(); }, () => here(n)); else here(n); };
  for (let i = 0; i < (canRun() ? 3 : 1); i++) go();
  return have;
}

/**
 * A film score (see above). Returns { start(), stop(), pause(), resume(), intensity(x, fade), final(on), hit(strength),
 * riser(seconds), sting('win' | 'lose' | 'found'), playing, ready, level, nextBeat(), nextBar(), speed() }.
 */
export function score({ mood = 'tense', key = 'D', tempo = null, seed = 1, vol = 1 } = {}) {
  const o = { mood: MOODS[mood] ? mood : 'tense', key, tempo, seed }, P = plan(o), k = JSON.stringify(o);
  let gate = null, t0 = 0, playing = false, want = false, x = 0, fin = false, pausedAt = -1, impactAt = -1;
  const src = {}, gain = {}, ab = {};
  const parts = make(k, o, n => { if (want && STEMS.includes(n)) { if (!playing) begin(); else join(n); } });
  const ctx = () => audio()?.ctx || null;
  function buffer(n) {
    if (ab[n]) return ab[n];
    const ch = parts.parts[n], c = ctx(); if (!ch || !c) return null;
    const b = c.createBuffer(2, ch[0].length, partRate(n)); b.copyToChannel ? (b.copyToChannel(ch[0], 0), b.copyToChannel(ch[1], 1)) : (b.getChannelData(0).set(ch[0]), b.getChannelData(1).set(ch[1]));
    return ab[n] = b;
  }
  function open() {
    const c = ctx(); if (!c || gate) return gate;
    gate = c.createGain(); gate.gain.value = Math.max(0, Math.min(1.5, vol)) * .75; gate.connect(kitBus('music'));
    return gate;
  }
  // a stem joins the loop where the others are (its loop is a whole number of bars, so it lines up)
  function join(n) {
    const c = ctx(), g0 = gate, b = buffer(n); if (!c || !g0 || !b || src[n]) return;
    const L = stemLength(P, n), now = c.currentTime + .02, off = ((now - t0) % L + L) % L;
    const s = c.createBufferSource(), g = c.createGain(); s.buffer = b; s.loop = true; s.loopEnd = b.duration; g.gain.value = 0;
    s.connect(g); g.connect(g0); s.start(now, off); src[n] = s; gain[n] = g; level(n, .3);
  }
  const level = (n, fade = 1) => { const g = gain[n], c = ctx(); if (!g || !c) return; const lv = levels(x, fin)[n] ?? 0, dip = impactAt > c.currentTime && impactAt - c.currentTime < .35 ? .45 : 1; g.gain.setTargetAtTime(lv * dip, c.currentTime, Math.max(.01, fade / 3)); };
  function begin() {
    const c = ctx(); if (!c || !open() || sound.muted || !sound.music) return;
    t0 = c.currentTime + .05 - (pausedAt > 0 ? pausedAt : 0); pausedAt = -1; playing = true; live.add(S); held.delete(S);
    for (const n of STEMS) if (parts.parts[n]) join(n);
  }
  function halt(keep) {
    const c = ctx(); for (const n of STEMS) { try { src[n]?.stop(); } catch { /* stopped */ } delete src[n]; delete gain[n]; }
    if (gate) { const g = gate; gate = null; try { g.gain.setTargetAtTime(0, c.currentTime, .05); setTimeout(() => { try { g.disconnect(); } catch { /* gone */ } }, 400); } catch { /* gone */ } }
    if (keep && c) pausedAt = (c.currentTime - t0) % (8 * P.bar); else pausedAt = -1;
    playing = false; live.delete(S);
  }
  // the audio clock's time of the next beat or bar line at least `ahead` seconds from now
  const next = (len, ahead = .03) => { const c = ctx(); if (!c) return 0; const now = c.currentTime + ahead; return playing ? t0 + Math.ceil((now - t0) / len - 1e-9) * len : now; };
  const shot = (n, when, g = 1, offset = 0) => { const c = ctx(), b = buffer(n); if (!c || !b || !open() || sound.muted || !sound.music) return false; const s = c.createBufferSource(), v = c.createGain(); s.buffer = b; v.gain.value = g; s.connect(v); v.connect(gate); s.start(Math.max(c.currentTime, when), Math.max(0, offset)); return true; };
  const S = {
    get playing() { return playing; },
    /** True once every stem is made (it starts with the drone as soon as that is, and the rest join as they come). */
    get ready() { return STEMS.every(n => parts.parts[n]); },
    get level() { return x; },
    get tempo() { return P.bpm; },
    /** The audio clock's time the loops started from (bar lines fall a whole number of bars after it). */
    get startedAt() { return t0; },
    start() { want = true; if (!playing && parts.parts.drone) begin(); return S; },
    stop() { want = false; halt(false); held.delete(S); return S; },
    pause() { if (playing) { halt(true); held.add(S); } return S; },
    resume() { if (held.has(S)) { held.delete(S); if (want) begin(); } return S; },
    /** How intense the play is, 0..1: the stems come in (strings, pulse and ticks from .3, drums and brass from .7). */
    intensity(v, fade = 1) { x = Math.max(0, Math.min(1, +v || 0)); for (const n of STEMS) level(n, fade); return S; },
    /** The last stand: the high lift on top (while intensity is up). */
    final(on = true) { fin = !!on; for (const n of STEMS) level(n, 1.5); return S; },
    /** An orchestral hit on the next beat (strength 0..1). */
    hit(strength = 1) { shot('hit', next(P.beat), .45 + .55 * Math.max(0, Math.min(1, strength))); return S; },
    /**
     * A build that lands an impact on a bar line at least `secs` seconds away (4): the rest of the score dips just
     * before it lands. The audio clock's time it lands at (0 if not ready).
     */
    riser(secs = 4) {
      const c = ctx(); if (!c || !parts.parts.riser || !parts.parts.impact) return 0;
      const at = next(P.bar, Math.max(1.2, Math.min(5, secs))), len = 5;   // (the riser is made 5 s long, peaking at its end)
      shot('riser', Math.max(c.currentTime, at - len), .9, Math.max(0, len - (at - c.currentTime))); shot('impact', at, .8);
      impactAt = at; for (const n of STEMS) { const g = gain[n]; if (g) { const lv = levels(x, fin)[n] ?? 0; g.gain.setTargetAtTime(lv * .45, at - .3, .05); g.gain.setTargetAtTime(lv, at + .05, .3); } }
      return at;
    },
    /** A sting: 'win' (the tonic turned major, swelling), 'lose' (low strings sinking), 'found' (the motif on a horn), on the next beat. */
    sting(what = 'win') { if (ONESHOTS.includes(what) && !['riser', 'impact'].includes(what)) shot(what, next(P.beat), .8); return S; },
    /** The audio clock's time of the next beat, and of the next bar line (for lining up your own sounds). */
    nextBeat: () => next(P.beat), nextBar: () => next(P.bar),
    /** (A rendered score keeps its tempo: here so gs.sound.follow() can drive it like a music() tune.) */
    speed() { return S; },
    layer(name, v = 1, fade = .6) { const g = gain[name], c = ctx(); if (g && c) g.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), c.currentTime, Math.max(.01, fade / 3)); return S; },
  };
  return S;
}
register('score', {
  stop: () => { for (const s of [...live, ...held]) s.stop(); },
  pause: () => { for (const s of [...live]) s.pause(); },
  resume: () => { for (const s of [...held]) s.resume(); },
});
if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', () => { if (document.hidden) for (const s of [...live]) s.pause(); });
