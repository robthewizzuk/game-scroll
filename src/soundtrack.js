// A soundtrack in one line. A game that says music: 'chase' in its definition gets an original tune for
// its rounds, written from that mood and the game's id (so each game keeps its own tune) by
// gs.sound.compose. The app plays it under the round and has it follow the action: it builds as the score
// climbs towards the goal, lifts for a moment each time the player scores, leans its tempo to how fast
// they're tapping, holds on the pause screen and stops when the round ends.
//
//   music: 'chase'                                    // happy, calm, tense, spooky, heroic, sad, silly, chase, puzzle
//   music: { mood: 'heroic', set: 'orchestra', vol: .8, seed: 'boss', tempo: 120, key: 'D', bars: 8 }
//
// The instruments (set) follow the style unless the game names them: pocket styles play the chip sound,
// the others a synth group, a band or an orchestra to suit the mood. A game with its own music() calls
// leaves `music` out. The player's Music switch (Sound & haptics) turns it off like any other tune.
import { music, follow, warm } from './kit/sound.js';
import { compose, MOODS } from './kit/compose.js';

const MOOD_SET = { happy: 'band', calm: 'band', tense: 'synth', spooky: 'orchestra', heroic: 'orchestra', sad: 'orchestra', silly: 'band', chase: 'synth', puzzle: 'band' };
const SETS = ['chip', 'synth', 'band', 'orchestra'];
const pixel = d => !!d.retro && d.era !== 'console' && d.era !== 'nextgen' && d.era !== 'ar' && d.era !== 'board';

/** What a game's `music` field asks for: { mood, set, seed, vol, ... }, or null (none, or not understood). */
export function trackOf(def) {
  const m = def && def.music; if (!m) return null;
  const o = typeof m === 'string' ? { mood: m } : typeof m === 'object' ? { ...m } : null;
  if (!o || !MOODS[o.mood]) return null;
  if (!SETS.includes(o.set)) o.set = pixel(def) ? 'chip' : MOOD_SET[o.mood];
  o.seed = o.seed ?? def.id; o.vol = Math.max(0, Math.min(1.5, o.vol == null ? .8 : +o.vol || 0));
  return o;
}

let cur = null;   // the round's tune: { id, song, live, prog, score }
let made = null;  // the next round's tune, made before the round starts (prepare)
function tuneFor(def) {
  const o = trackOf(def); if (!o) return null;
  const song = music({ ...compose({ mood: o.mood, seed: o.seed, tempo: o.tempo, key: o.key, bars: o.bars }), set: o.set, voices: o.voices, vol: o.vol });
  const c = { id: def.id, set: o.set, mood: o.mood, song, prog: 0, score: 0 };
  // (follow() reads a Tiny Brain's mood to keep tension up; here that's how far the score is to the goal)
  c.live = follow(song, { calm: .12, ease: .3, brain: { get mood() { return c.prog * 1.1; } } });
  return c;
}
export const soundtrack = {
  /** The card on screen has a soundtrack: have its instruments in by the time Play is tapped. */
  ready(def) { const o = trackOf(def); if (o && o.set !== 'chip') warm(); },
  /**
   * A round is about to begin (a 3D game behind its loading screen): the tune is written and its instruments
   * built now, without a sound, so start() only has to play it. Building them took the round's first frame.
   */
  prepare(def) {
    if (made && made.id === def.id) return;
    if (made) { try { made.song.stop(); } catch { /* gone */ } made = null; }
    try { made = tuneFor(def); made?.song[Symbol.for('gs.sound.tune')]?.(); } catch (e) { console.warn('[soundtrack]', def.id, e); made = null; }
  },
  /** A round began. */
  start(def) {
    const ahead = made && made.id === def.id ? made : null; if (ahead) made = null;
    soundtrack.stop();
    try {
      const c = ahead || tuneFor(def); if (!c) return;
      c.song.start(); cur = c;
    } catch (e) { console.warn('[soundtrack]', def.id, e); cur = null; }
  },
  /** Each frame of the round. */
  update(dt, score, goal) {
    const c = cur; if (!c) return;
    if (!c.song.playing) return;                       // paused with the round (the kit holds it), or stopped
    c.prog = goal > 0 ? Math.max(0, Math.min(1, score / goal)) : Math.min(1, c.prog + dt / 90);
    if (score > c.score) c.live.feel(.4);
    c.score = score;
    c.live.update(dt);
  },
  /** The player touched the game. */
  tap() { if (cur && cur.song.playing) cur.live.tap(); },
  /** The round ended, or the player left. */
  stop() { for (const c of [cur, made]) if (c) try { c.song.stop(); } catch { /* gone */ } cur = made = null; },
  /** For tests: the game whose tune is made and waiting for its round, or null. */
  get ahead() { return made ? made.id : null; },
  /** For tests and the debug panel: what's playing. */
  get now() { return cur ? { id: cur.id, mood: cur.mood, set: cur.set, playing: cur.song.playing, level: cur.song.level, tension: cur.live.tension, speed: cur.live.speed, tuned: cur.song.tuned, pos: cur.song.pos } : null; },
};
