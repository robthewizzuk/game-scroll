// Sound kit: richer sound than single sfx() beeps, all made in code (no sound files).
//
//   import { sounds, noise, notes, music } from '../kit/sound.js';
//   sounds.coin();  sounds.jump();  sounds.hurt();  sounds.boom();      // ready-made effects
//   noise(.3, { vol: .08, from: 2000, to: 200 });                        // explosions, hits, wind
//   notes('C5 E5 G5 C6', { len: .08, wave: 'square' });                  // a quick jingle
//   const m = music({ tempo: 120, lead: 'C5 . E5 . G5 . E5 .', bass: 'C3 . . . G2 . . .', drums: 'k . h . s . h .' });
//   m.start();  m.stop();  m.speed(1.2);                                 // looping background music
//
// Everything respects the player's Sound & haptics settings (sound on/off, volume, music on/off). Music stops by itself when the round ends or the
// player swipes to another game, but stop it in your own game-over code too if it should end sooner.
import { sfx, sound, audio, setSfxOut, delay } from '../sfx.js';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { buildSamples, SAMPLE_RATE } from './zzfx.js';
import { lazy } from './lazy.js';
import { register, own } from './cleanup.js';
import { SETS, VOICES, KITS, voiceFor, makeVoice, makeKit } from './instruments.js';
import { cast as castVoice, wantOf, describe as describeVoice } from './voices.js';
import { fxOf, pcm16, shape, canShape, wordTimes, goodMarks } from './voice-fx.js';
import { caster, blocked, muffleOf, Room } from './acoustics.js';

/* ---------- notes ---------- */
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Frequency of a note name like 'A4', 'C#5', 'Eb3' (or a number of Hz, passed through). */
export function freq(n) {
  if (typeof n === 'number') return n;
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(String(n).trim());
  if (!m) return +n > 0 ? +n : 0;   // '523': Hz written as text (notes() takes a line of them)
  const semi = NOTE[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
  return 440 * 2 ** ((semi - 69) / 12);
}

/* ---------- one tone, with an envelope (softer than sfx) ---------- */
/**
 * tone(freq, { len, wave, vol, slide, attack, hold, wobble, at }): one note. freq is Hz or a note name.
 * wave: 'square' | 'triangle' | 'sine' | 'sawtooth'. slide: Hz to bend by over the note.
 * hold: seconds it stays at full volume before fading (0: it fades from the start, like a pluck).
 * wobble: [times a second, Hz either way] wavers the pitch (sirens, whistles, springs).
 * at: seconds from now to start it (for scheduling). bus: the mixer channel it plays into (default 'sfx').
 * (when: a time on the sound clock itself, instead of at. music() writes its notes this way: "from now"
 * is read a moment later for each note, and those moments differ by up to a hundredth of a second.)
 */
export function tone(f, { len = .1, wave = 'square', vol = .05, slide = 0, attack = .005, hold = 0, wobble = null, at = 0, when = null, out = null, bus = null } = {}) {
  if (sound.muted || !sound.volume) return;
  const a = audio(); if (!a) return;
  const hz = freq(f) * tune; if (!hz) return;
  try {
    const { ctx } = a, t = when == null ? ctx.currentTime + at : Math.max(when, ctx.currentTime), o = ctx.createOscillator(), g = ctx.createGain(), v = Math.max(.0002, vol * level);
    o.type = wave; o.frequency.setValueAtTime(hz, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, hz + slide * tune), t + len);
    if (wobble) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = wobble[0]; lg.gain.value = wobble[1] * tune; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + len + .02); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + attack);
    if (hold > 0) g.gain.setValueAtTime(v, t + Math.min(len - .005, Math.max(attack, hold)));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(out || route || busIn(bus || playBus)); o.start(t); o.stop(t + len + .02);
  } catch { /* audio unavailable */ }
}
// While a ready-made sound plays with a little variation (see vary below), its notes are tuned and
// levelled by these.
let tune = 1, level = 1;

/* ---------- noise: explosions, hits, snares, wind ---------- */
let noiseBuf = null;
function noiseBuffer(ctx) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
/**
 * noise(len, { vol, from, to, filter, q, at }): a burst of noise through a filter that sweeps from
 * `from` Hz to `to` Hz. High to low = explosion; short and high = hit or snare; long and low = rumble.
 * filter: 'lowpass' (default) | 'highpass' | 'bandpass'.
 */
export function noise(len = .25, { vol = .08, from = 3000, to = 300, filter = 'lowpass', q = 1, at = 0, when = null, attack = 0, hold = 0, out = null, bus = null } = {}) {
  if (sound.muted || !sound.volume) return;
  const a = audio(); if (!a) return;
  try {
    const { ctx } = a, t = when == null ? ctx.currentTime + at : Math.max(when, ctx.currentTime), src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), v = Math.max(.0002, vol * level);
    src.buffer = noiseBuffer(ctx); src.loop = true;
    // The filter and the volume start out at their own values, not the browser's (350 Hz, full volume): a burst
    // timed ahead (at, when) can start one sample before the changes timed for the same moment, and that
    // sample of raw noise at full volume is a loud click through a highpass (a hi-hat on the beat, a shatter).
    f.type = filter; f.Q.value = q; f.frequency.value = Math.max(40, from * tune); f.frequency.setValueAtTime(Math.max(40, from * tune), t); f.frequency.exponentialRampToValueAtTime(Math.max(40, to * tune), t + len);
    g.gain.value = attack > 0 ? 0.0001 : v;
    if (attack > 0) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + attack); } else g.gain.setValueAtTime(v, t);
    if (hold > 0) g.gain.setValueAtTime(v, t + Math.min(len - .005, Math.max(attack, hold)));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(len, attack + .01));
    src.connect(f); f.connect(g); g.connect(out || route || busIn(bus || playBus)); src.start(t, Math.random() * .9); src.stop(t + len + .02);
  } catch { /* audio unavailable */ }
}

/* ---------- places and backgrounds: reverb made in code, steady beds of sound ---------- */
/**
 * space({ seconds, decay, wet, bright, pre }): the sound of a place (a room, a church, a valley, a
 * cave): a reverb whose echo tail is made in code. Play into it with tone(f, { out: sp.in }) or
 * noise(len, { out: sp.in }) (the sound plus its echo), or new Ears({ space: sp }) for 3D sounds.
 * seconds: how long the tail is; decay: how fast it dies away (higher is shorter); wet: 0..1 how
 * much echo; bright: Hz above which the tail is dull; pre: seconds before the first echo (big
 * places have more). sp.set({ wet, bright }, seconds) glides; sp.tail takes only the echo.
 * Returns null where there is no audio, so pass sp?.in.
 */
export function space({ seconds = 2.4, decay = 3, wet = .35, bright = 5000, pre = .02 } = {}) {
  const a = audio(); if (!a) return null;
  try {
    const { ctx } = a, inp = ctx.createGain(), tail = ctx.createGain(), dl = ctx.createDelay(1), cv = ctx.createConvolver(), lp = ctx.createBiquadFilter(), w = ctx.createGain();
    const n = Math.max(64, Math.floor(seconds * ctx.sampleRate)), ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    cv.buffer = ir; dl.delayTime.value = Math.min(1, pre); lp.type = 'lowpass'; lp.frequency.value = bright; w.gain.value = wet;
    const to = busIn('sfx'); inp.connect(to); inp.connect(tail); tail.connect(dl); dl.connect(cv); cv.connect(lp); lp.connect(w); w.connect(to);
    const sp = {
      in: inp, tail,
      set({ wet: v, bright: hz } = {}, sec = .3) { const t = ctx.currentTime, k = Math.max(.01, sec / 3); if (v != null) w.gain.setTargetAtTime(v, t, k); if (hz != null) lp.frequency.setTargetAtTime(hz, t, k); return sp; },
    };
    return sp;
  } catch { return null; }
}
// beds use a longer noise loop than the bursts, so the repeat can't be heard
let bedBuf = null;
function bedBuffer(ctx) {
  if (bedBuf) return bedBuf;
  const n = ctx.sampleRate * 5; bedBuf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = bedBuf.getChannelData(ch); let b = 0; for (let i = 0; i < n; i++) { b = b * .6 + (Math.random() * 2 - 1) * .4; d[i] = b * 1.6; } }
  return bedBuf;
}
const beds = new Set();
/**
 * bed({ vol, from, filter, q, gusts, out }): a steady background sound made from noise: wind, rain,
 * a river, a crowd's hum, the roar of an engine room. b.set({ vol, from, q }, seconds) glides to new
 * values (a storm rising, a door closing on the wind). gusts: 0..1 slow random swells. Beds fade in,
 * stop with the round and go quiet on the pause screen; b.stop() ends one sooner.
 */
export function bed({ vol = .03, from = 600, filter = 'lowpass', q = .7, gusts = 0, out = null } = {}) {
  const dead = { set() { return dead; }, stop() {} };
  if (sound.muted || !sound.volume) return dead;
  const a = audio(); if (!a) return dead;
  try {
    const { ctx } = a, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), sw = ctx.createGain();
    src.buffer = bedBuffer(ctx); src.loop = true; src.loopStart = Math.random() * 4; f.type = filter; f.frequency.value = from; f.Q.value = q;
    g.gain.value = 0; sw.gain.value = 1;
    src.connect(f); f.connect(sw); sw.connect(g); g.connect(out || busIn('sfx')); src.start(ctx.currentTime, Math.random() * 4);
    // gusts: two slow wobbles that never line up, so the swells don't repeat
    const lfos = [];
    if (gusts > 0) for (const hz of [.07 + Math.random() * .03, .17 + Math.random() * .05]) { const o = ctx.createOscillator(), lg = ctx.createGain(); o.frequency.value = hz; lg.gain.value = gusts * .35; o.connect(lg); lg.connect(sw.gain); o.start(); lfos.push(o); }
    const b = {
      vol, held: false,
      set({ vol: v, from: hz, q: qq } = {}, sec = .5) { const t = ctx.currentTime, k = Math.max(.01, sec / 3); if (v != null) { b.vol = v; if (!b.held) g.gain.setTargetAtTime(v, t, k); } if (hz != null) f.frequency.setTargetAtTime(hz, t, k); if (qq != null) f.Q.setTargetAtTime(qq, t, k); return b; },
      hold(on) { b.held = on; g.gain.setTargetAtTime(on ? 0 : b.vol, ctx.currentTime, .08); },
      stop() { try { g.gain.setTargetAtTime(0, ctx.currentTime, .15); src.stop(ctx.currentTime + .8); for (const o of lfos) o.stop(ctx.currentTime + .8); } catch { /* stopped */ } beds.delete(b); },
    };
    g.gain.setTargetAtTime(vol, ctx.currentTime, .4);
    beds.add(b); return b;
  } catch { return dead; }
}
register('beds', { stop: () => { for (const b of [...beds]) b.stop(); }, pause: () => { for (const b of beds) b.hold(true); }, resume: () => { for (const b of beds) b.hold(false); } });

/* ---------- jingles ---------- */
/**
 * notes('C5 E5 G5 C6', { len, gap, wave, vol }): plays notes one after another. '.' is a rest.
 * A note can have its own length in steps after a colon: 'C5:2' lasts two steps. Returns the
 * jingle's length in seconds.
 */
export function notes(seq, { len = .09, gap = 0, wave = 'square', vol = .05, at: from = 0 } = {}) {
  let at = from;
  for (const tok of String(seq).trim().split(/\s+/)) {
    const [n, k] = tok.split(':'), steps = +k || 1, d = len * steps;
    if (n !== '.' && n !== '-') tone(n, { len: d * .95, wave, vol, at });
    at += d + gap;
  }
  return at - from;
}

/* ---------- ready-made sounds ---------- */
// Short, punchy, and pitched to sit together. Each takes an optional pitch multiplier (1 = normal),
// handy for rising combos: sounds.coin(1 + combo * .1). Sounds that repeat a lot (steps, hits, shots)
// come out a touch different each time; tuned ones (coins, jingles) play exact, so they stay in key.
const vary = (fn, by = .04) => (p = 1, ...more) => {
  tune = 1 + (Math.random() * 2 - 1) * by; level = 1 + (Math.random() * 2 - 1) * by * 2;
  try { return fn(p, ...more); } finally { tune = 1; level = 1; }
};
const rand = (a, b) => a + Math.random() * (b - a);
const chime = (hz, list) => { for (const [m, v, len] of list) tone(hz * m, { len, wave: 'sine', vol: v }); };   // a struck thing: [times the pitch, volume, seconds]
export const sounds = {
  /* --- the first seventeen --- */
  coin: (p = 1) => { tone(988 * p, { len: .06, vol: .05 }); tone(1319 * p, { len: .14, vol: .05, at: .06 }); },
  jump: vary((p = 1) => tone(300 * p, { len: .16, wave: 'square', vol: .045, slide: 500 * p }), .02),
  hurt: vary((p = 1) => { tone(220 * p, { len: .22, wave: 'sawtooth', vol: .05, slide: -150 * p }); noise(.12, { vol: .05, from: 1500, to: 400 }); }, .03),
  hit: vary((p = 1) => { noise(.07, { vol: .09, from: 4000 * p, to: 800, filter: 'bandpass', q: .8 }); tone(140 * p, { len: .06, wave: 'triangle', vol: .08, slide: -60 }); }),
  boom: vary((p = 1) => { noise(.6, { vol: .14, from: 1800 * p, to: 60 }); tone(90 * p, { len: .4, wave: 'sine', vol: .12, slide: -60 }); }),
  laser: (p = 1) => tone(1400 * p, { len: .12, wave: 'sawtooth', vol: .035, slide: -1100 * p }),
  shoot: vary((p = 1) => { noise(.05, { vol: .06, from: 6000, to: 2000, filter: 'highpass' }); tone(600 * p, { len: .06, wave: 'square', vol: .03, slide: -300 }); }),
  powerup: (p = 1) => notes([523, 659, 784, 1047, 1319].map(f => Math.round(f * p)).join(' '), { len: .05, wave: 'square', vol: .04 }),
  select: (p = 1) => tone(880 * p, { len: .05, wave: 'square', vol: .035 }),
  blip: (p = 1) => tone(660 * p, { len: .03, wave: 'triangle', vol: .05 }),
  pop: (p = 1) => tone(500 * p, { len: .08, wave: 'sine', vol: .07, slide: 600 * p }),
  splash: vary(() => noise(.35, { vol: .08, from: 3500, to: 500, filter: 'bandpass', q: .5 })),
  click: vary(() => noise(.02, { vol: .06, from: 5000, to: 4000, filter: 'highpass' }), .03),
  win: () => notes('C5 E5 G5 C6:3', { len: .1, wave: 'square', vol: .05 }),
  lose: () => notes('G4 Eb4 C4:3', { len: .16, wave: 'triangle', vol: .07 }),
  levelup: () => notes('C5 G5 C6 E6 G6:3', { len: .07, wave: 'square', vol: .045 }),
  countdown: (last = false) => tone(last ? 1047 : 523, { len: last ? .3 : .12, wave: 'square', vol: .05 }),

  /* --- menus and buttons --- */
  tick: (p = 1) => tone(1800 * p, { len: .012, wave: 'square', vol: .03 }),
  tock: (p = 1) => tone(900 * p, { len: .02, wave: 'triangle', vol: .05 }),
  toggle: (p = 1) => { tone(700 * p, { len: .03, wave: 'triangle', vol: .05 }); tone(1050 * p, { len: .04, wave: 'triangle', vol: .05, at: .04 }); },
  back: (p = 1) => { tone(660 * p, { len: .04, wave: 'triangle', vol: .045 }); tone(440 * p, { len: .06, wave: 'triangle', vol: .045, at: .045 }); },
  confirm: (p = 1) => { tone(784 * p, { len: .06, vol: .04 }); tone(1175 * p, { len: .12, vol: .04, at: .06 }); },
  deny: (p = 1) => { tone(196 * p, { len: .09, wave: 'sawtooth', vol: .045, hold: .07 }); tone(185 * p, { len: .14, wave: 'sawtooth', vol: .045, hold: .1, at: .1 }); },
  open: (p = 1) => { noise(.12, { vol: .04, from: 600, to: 3000, filter: 'bandpass', q: 1.2 }); tone(520 * p, { len: .1, wave: 'sine', vol: .04, slide: 400 * p }); },
  close: (p = 1) => { noise(.1, { vol: .04, from: 3000, to: 500, filter: 'bandpass', q: 1.2 }); tone(700 * p, { len: .09, wave: 'sine', vol: .04, slide: -350 * p }); },

  /* --- moving about --- */
  step: vary((p = 1) => { noise(.035, { vol: .045, from: 900 * p, to: 300 }); tone(110 * p, { len: .03, wave: 'sine', vol: .04, slide: -40 }); }, .08),
  land: vary((p = 1) => { noise(.09, { vol: .07, from: 700 * p, to: 120 }); tone(95 * p, { len: .09, wave: 'sine', vol: .09, slide: -45 }); }),
  dash: vary((p = 1) => noise(.16, { vol: .13, from: 500, to: 5000 * p, filter: 'bandpass', q: .9, attack: .02 })),
  skid: vary((p = 1) => { noise(.28, { vol: .1, from: 2600 * p, to: 1700, filter: 'bandpass', q: 6, hold: .12 }); tone(1900 * p, { len: .26, wave: 'sawtooth', vol: .012, slide: -500, hold: .1 }); }),
  flap: vary((p = 1) => noise(.07, { vol: .12, from: 500 * p, to: 1400, filter: 'bandpass', q: .8, attack: .015 }), .06),
  bounce: vary((p = 1) => tone(260 * p, { len: .11, wave: 'sine', vol: .08, slide: 300 * p }), .02),
  boing: (p = 1) => tone(180 * p, { len: .32, wave: 'triangle', vol: .07, slide: 260 * p, wobble: [22, 60 * p] }),
  swoosh: vary((p = 1) => noise(.2, { vol: .12, from: 900 * p, to: 4000, filter: 'bandpass', q: 1.5, attack: .06 })),
  whoosh: vary((p = 1) => noise(.38, { vol: .14, from: 300 * p, to: 1800, filter: 'bandpass', q: .8, attack: .14 })),
  slip: (p = 1) => tone(700 * p, { len: .24, wave: 'sine', vol: .05, slide: 900 * p }),

  /* --- fights and things breaking --- */
  slash: vary((p = 1) => noise(.11, { vol: .11, from: 7000 * p, to: 1500, filter: 'bandpass', q: 1.4, attack: .01 })),
  punch: vary((p = 1) => { noise(.05, { vol: .09, from: 1800 * p, to: 300 }); tone(120 * p, { len: .08, wave: 'sine', vol: .11, slide: -60 }); }),
  block: vary((p = 1) => { tone(520 * p, { len: .05, wave: 'square', vol: .04 }); noise(.04, { vol: .06, from: 3000, to: 1500, filter: 'bandpass', q: 2 }); }),
  clang: vary((p = 1) => { for (const [m, v, len] of [[1, .05, .35], [2.76, .03, .25], [5.4, .02, .15]]) tone(620 * p * m, { len, wave: 'triangle', vol: v }); noise(.03, { vol: .06, from: 8000, to: 5000, filter: 'highpass' }); }, .03),
  bow: vary((p = 1) => { tone(240 * p, { len: .07, wave: 'triangle', vol: .06, slide: -120 }); noise(.14, { vol: .045, from: 2500 * p, to: 6000, filter: 'bandpass', q: 2, attack: .02 }); }),
  reload: vary((p = 1) => { noise(.02, { vol: .06, from: 3500, to: 2500, filter: 'bandpass', q: 3 }); noise(.03, { vol: .07, from: 2200, to: 1200, filter: 'bandpass', q: 3, at: .09 }); tone(300 * p, { len: .03, wave: 'square', vol: .03, at: .09 }); }, .03),
  zap: vary((p = 1) => { tone(1800 * p, { len: .14, wave: 'sawtooth', vol: .035, slide: -1500 * p, wobble: [55, 300] }); noise(.06, { vol: .035, from: 7000, to: 3000, filter: 'highpass' }); }),
  charge: (p = 1) => { tone(160 * p, { len: .6, wave: 'sawtooth', vol: .045, slide: 900 * p, attack: .5 }); tone(320 * p, { len: .6, wave: 'square', vol: .018, slide: 1800 * p, attack: .5 }); },
  shield: (p = 1) => { tone(440 * p, { len: .3, wave: 'sine', vol: .05, slide: 220 * p, wobble: [9, 25] }); tone(660 * p, { len: .3, wave: 'sine', vol: .03, slide: 330 * p }); },
  thud: vary((p = 1) => { tone(70 * p, { len: .16, wave: 'sine', vol: .14, slide: -30 }); noise(.06, { vol: .06, from: 500, to: 100 }); }),
  crack: vary((p = 1) => { noise(.03, { vol: .1, from: 5000 * p, to: 1500, filter: 'bandpass', q: 1 }); noise(.09, { vol: .06, from: 2500 * p, to: 600, filter: 'bandpass', q: .7, at: .025 }); }),
  shatter: vary((p = 1) => { noise(.05, { vol: .08, from: 9000, to: 6000, filter: 'highpass' }); for (let i = 0; i < 5; i++) tone(rand(2200, 5400) * p, { len: rand(.05, .15), wave: 'triangle', vol: .022, at: .02 + i * .035 + rand(0, .02) }); noise(.3, { vol: .03, from: 8000, to: 5000, filter: 'highpass', at: .05 }); }),
  crumble: vary((p = 1) => { for (let i = 0; i < 6; i++) noise(.06, { vol: .05, from: rand(900, 1800) * p, to: 200, at: i * .05 + rand(0, .03) }); tone(60 * p, { len: .35, wave: 'sine', vol: .07, slide: -20 }); }),
  blast: vary((p = 1) => { noise(.9, { vol: .14, from: 2600 * p, to: 40 }); tone(60 * p, { len: .7, wave: 'sine', vol: .14, slide: -35 }); noise(.12, { vol: .09, from: 6000, to: 2000, filter: 'bandpass' }); }),

  /* --- pick-ups and rewards --- */
  gem: (p = 1) => { tone(1568 * p, { len: .05, wave: 'sine', vol: .05 }); tone(2093 * p, { len: .07, wave: 'sine', vol: .05, at: .045 }); tone(3136 * p, { len: .16, wave: 'sine', vol: .04, at: .09 }); },
  key: (p = 1) => { tone(1245 * p, { len: .04, vol: .03 }); tone(1661 * p, { len: .04, vol: .03, at: .05 }); tone(2489 * p, { len: .1, vol: .025, at: .1 }); },
  heal: (p = 1) => notes([523, 659, 784, 1047].map(f => Math.round(f * p)).join(' '), { len: .07, wave: 'sine', vol: .06 }),
  star: (p = 1) => { tone(2637 * p, { len: .08, wave: 'sine', vol: .04 }); tone(3520 * p, { len: .22, wave: 'sine', vol: .035, at: .06, wobble: [14, 40] }); },
  chest: () => { noise(.05, { vol: .05, from: 1200, to: 500 }); notes('G5 C6 E6 G6:3', { len: .06, wave: 'triangle', vol: .05, at: .06 }); },
  combo: (p = 1) => { tone(880 * p, { len: .05, vol: .035 }); tone(1320 * p, { len: .08, vol: .035, at: .04 }); },
  perfect: () => { notes('E6 G6 B6 E7:3', { len: .045, wave: 'triangle', vol: .05 }); noise(.2, { vol: .015, from: 9000, to: 7000, filter: 'highpass', at: .12 }); },
  unlock: () => { noise(.025, { vol: .06, from: 3000, to: 1800, filter: 'bandpass', q: 3 }); notes('C5 G5 C6:2', { len: .07, wave: 'square', vol: .04, at: .06 }); },
  cash: (p = 1) => { noise(.03, { vol: .05, from: 6000, to: 4000, filter: 'highpass' }); tone(2093 * p, { len: .05, vol: .03, at: .03 }); tone(2637 * p, { len: .18, vol: .03, at: .08 }); },

  /* --- weather and animals --- */
  drip: vary((p = 1) => { tone(1400 * p, { len: .05, wave: 'sine', vol: .06, slide: -700 * p }); tone(700 * p, { len: .07, wave: 'sine', vol: .05, slide: 500 * p, at: .05 }); }, .06),
  bubble: vary((p = 1) => tone(300 * p, { len: .09, wave: 'sine', vol: .06, slide: 500 * p }), .1),
  gust: vary((p = 1) => noise(.9, { vol: .11, from: 300 * p, to: 900, filter: 'bandpass', q: .6, attack: .4 })),
  thunder: vary((p = 1) => { noise(.08, { vol: .12, from: 5000, to: 800 }); noise(1.6, { vol: .12, from: 400 * p, to: 50, at: .05 }); tone(48 * p, { len: 1.2, wave: 'sine', vol: .1, slide: -15, at: .05 }); }),
  crackle: vary(() => { for (let i = 0; i < 7; i++) noise(rand(.015, .035), { vol: rand(.06, .12), from: rand(3000, 7000), to: 1500, filter: 'bandpass', q: 1.5, at: i * .045 + rand(0, .03) }); }),
  chirp: vary((p = 1) => { tone(2800 * p, { len: .06, wave: 'sine', vol: .04, slide: 1200 * p }); tone(3400 * p, { len: .05, wave: 'sine', vol: .04, slide: -900 * p, at: .08 }); tone(2900 * p, { len: .07, wave: 'sine', vol: .035, slide: 1400 * p, at: .15 }); }, .06),
  croak: vary((p = 1) => { tone(140 * p, { len: .16, wave: 'sawtooth', vol: .05, wobble: [38, 50 * p], hold: .1 }); tone(190 * p, { len: .14, wave: 'sawtooth', vol: .045, wobble: [42, 60 * p], hold: .08, at: .2 }); }, .06),
  buzz: vary((p = 1) => tone(220 * p, { len: .3, wave: 'sawtooth', vol: .03, wobble: [28, 25 * p], hold: .2 })),
  squeak: vary((p = 1) => { tone(1900 * p, { len: .09, wave: 'sine', vol: .05, slide: 900 * p }); tone(2500 * p, { len: .06, wave: 'sine', vol: .04, slide: -600 * p, at: .09 }); }, .06),
  growl: vary((p = 1) => { tone(75 * p, { len: .5, wave: 'sawtooth', vol: .06, slide: -20, wobble: [24, 14], hold: .3 }); noise(.5, { vol: .03, from: 400, to: 200, hold: .3 }); }),

  /* --- machines --- */
  beep: (p = 1) => tone(1000 * p, { len: .1, wave: 'square', vol: .035, hold: .08 }),
  alarm: (p = 1) => { for (let i = 0; i < 4; i++) tone((i % 2 ? 740 : 988) * p, { len: .14, wave: 'square', vol: .035, hold: .12, at: i * .15 }); },
  siren: (p = 1) => tone(620 * p, { len: .9, wave: 'triangle', vol: .05, hold: .8, wobble: [2.2, 180 * p] }),
  ring: (p = 1) => { for (let i = 0; i < 2; i++) tone(1400 * p, { len: .3, wave: 'sine', vol: .04, hold: .28, wobble: [22, 160], at: i * .38 }); },
  door: vary(() => { noise(.25, { vol: .04, from: 300, to: 180, filter: 'bandpass', q: 4, attack: .05 }); tone(90, { len: .1, wave: 'sine', vol: .1, slide: -30, at: .26 }); noise(.05, { vol: .07, from: 900, to: 200, at: .26 }); }),
  lever: vary((p = 1) => { noise(.02, { vol: .07, from: 2500, to: 1500, filter: 'bandpass', q: 2 }); tone(180 * p, { len: .05, wave: 'square', vol: .04, at: .02 }); noise(.03, { vol: .06, from: 1500, to: 500, at: .08 }); }, .03),
  teleport: (p = 1) => { tone(300 * p, { len: .35, wave: 'sine', vol: .05, slide: 2400 * p, wobble: [30, 80] }); noise(.3, { vol: .03, from: 1000, to: 8000, filter: 'bandpass', q: 2, attack: .1 }); },
  warp: (p = 1) => tone(1800 * p, { len: .5, wave: 'sawtooth', vol: .045, slide: -1700 * p, wobble: [18, 120] }),
  robot: (p = 1) => { for (const [f, at] of [[440, 0], [660, .07], [330, .14], [550, .21]]) tone(f * p, { len: .06, wave: 'square', vol: .03, hold: .05, at }); },
  rev: vary((p = 1) => tone(70 * p, { len: .6, wave: 'sawtooth', vol: .05, slide: 160 * p, hold: .3, wobble: [30, 8] })),

  /* --- the round itself --- */
  go: (p = 1) => tone(1047 * p, { len: .35, wave: 'square', vol: .038, hold: .2 }),
  buzzer: (p = 1) => { tone(150 * p, { len: .45, wave: 'sawtooth', vol: .036, hold: .4 }); tone(155 * p, { len: .45, wave: 'square', vol: .018, hold: .4 }); },
  fanfare: () => { notes('G4 C5 E5 G5:2 E5 G5:4', { len: .09, wave: 'square', vol: .045 }); notes('E4 G4 C5 E5:2 C5 E5:4', { len: .09, wave: 'triangle', vol: .05 }); },
  tada: (p = 1) => { for (const f of [523, 659, 784]) tone(f * p, { len: .09, vol: .03 }); for (const f of [523, 659, 784, 1047]) tone(f * p, { len: .5, vol: .028, at: .12 }); },
  whistle: (p = 1) => { tone(2300 * p, { len: .35, wave: 'sine', vol: .036, hold: .3, wobble: [32, 90] }); noise(.35, { vol: .012, from: 5000, to: 4000, filter: 'bandpass', q: 3, hold: .3 }); },
  gong: (p = 1) => { chime(110 * p, [[1, .09, 1.8], [1.48, .05, 1.4], [2.37, .035, 1], [3.6, .02, .6]]); noise(.25, { vol: .04, from: 1200, to: 200 }); },
  bell: (p = 1) => chime(880 * p, [[1, .06, .9], [2, .03, .7], [2.76, .025, .5], [5.4, .012, .3]]),
  roll: () => { for (let i = 0; i < 14; i++) noise(.03, { vol: .03 + i * .004, from: 4000, to: 1500, filter: 'bandpass', q: .8, at: i * .045 }); noise(.2, { vol: .09, from: 5000, to: 1200, filter: 'bandpass', q: .7, at: .65 }); tone(150, { len: .2, wave: 'sine', vol: .1, slide: -90, at: .65 }); },
  horn: (p = 1) => { tone(233 * p, { len: .4, wave: 'sawtooth', vol: .04, hold: .34 }); tone(294 * p, { len: .4, wave: 'sawtooth', vol: .035, hold: .34 }); },
  sad: (p = 1) => { for (const [f, at] of [[311, 0], [294, .28], [277, .56]]) tone(f * p, { len: .26, wave: 'sawtooth', vol: .04, hold: .2, at }); tone(262 * p, { len: .7, wave: 'sawtooth', vol: .04, hold: .4, at: .84, wobble: [6, 10] }); },
  heart: (p = 1) => { tone(60 * p, { len: .1, wave: 'sine', vol: .14, slide: -20 }); tone(55 * p, { len: .12, wave: 'sine', vol: .1, slide: -20, at: .16 }); },

  /* --- cartoon --- */
  wobble: (p = 1) => tone(300 * p, { len: .5, wave: 'sine', vol: .042, hold: .3, wobble: [7, 90 * p] }),
  squish: vary((p = 1) => { noise(.12, { vol: .06, from: 1200 * p, to: 300, filter: 'bandpass', q: 2 }); tone(200 * p, { len: .1, wave: 'sine', vol: .05, slide: -120 }); }, .06),
  plop: vary((p = 1) => { tone(400 * p, { len: .07, wave: 'sine', vol: .08, slide: -250 * p }); tone(180 * p, { len: .06, wave: 'sine', vol: .05, slide: 250 * p, at: .06 }); }, .06),
  zip: (p = 1) => tone(400 * p, { len: .1, wave: 'square', vol: .03, slide: 2200 * p }),
  honk: (p = 1) => { tone(330 * p, { len: .2, wave: 'square', vol: .028, hold: .17 }); tone(415 * p, { len: .2, wave: 'square', vol: .022, hold: .17 }); },
  twinkle: (p = 1) => { [2093, 2637, 3136, 3951, 4186].forEach((f, i) => tone(f * p, { len: .09, wave: 'sine', vol: .03, at: i * .05 })); },
  pluck: (p = 1) => tone(440 * p, { len: .25, wave: 'triangle', vol: .07 }),
  munch: vary((p = 1) => { noise(.05, { vol: .12, from: 1500 * p, to: 500, filter: 'bandpass', q: 1.5 }); noise(.05, { vol: .12, from: 1300 * p, to: 400, filter: 'bandpass', q: 1.5, at: .1 }); }, .06),
  gulp: vary((p = 1) => { tone(500 * p, { len: .06, wave: 'sine', vol: .06, slide: -250 }); tone(250 * p, { len: .09, wave: 'sine', vol: .07, slide: 350 * p, at: .07 }); }, .05),
};
export { sfx };   // the classic single beep, re-exported so one import covers everything

/* ---------- ZzFX: design your own sound effects ---------- */
// Design a sound on https://killedbyapixel.github.io/ZzFX/ (move the sliders, press play), copy the
// numbers it shows, and play them: zzfx(...[,,925,.04,.3,.6,1,.3,,6.27,-184,.09,.17]). Sounds are
// built once and cached, so playing the same one again is cheap.
const zcache = new Map();
/** Plays a ZzFX sound (the numbers from the ZzFX designer). Returns nothing. */
export function zzfx(...params) { playZ(params, null); }
function playZ(params, out) {
  if (sound.muted || !sound.volume) return;
  const a = audio(); if (!a) return;
  try {
    const key = params.join(',');
    let buf = zcache.get(key);
    if (!buf) {
      const data = buildSamples(...params);
      buf = a.ctx.createBuffer(1, data.length, SAMPLE_RATE); buf.getChannelData(0).set(data);
      if (zcache.size > 64) zcache.delete(zcache.keys().next().value);
      zcache.set(key, buf);
    }
    const src = a.ctx.createBufferSource(), g = a.ctx.createGain();
    src.buffer = buf; g.gain.value = .3; src.connect(g); g.connect(out || busIn(playBus)); src.start();
  } catch { /* audio unavailable */ }
}
/** Makes a reusable sound from ZzFX numbers: const zap = zsound(...numbers); zap(); zap(1.5) plays it higher. */
export function zsound(...params) {
  return (pitch = 1) => { const p = [...params]; if (pitch !== 1) p[2] = (p[2] ?? 220) * pitch; zzfx(...p); };
}

/* ---------- Tone.js: real synths, effects and sequencing (for music games) ---------- */
// Tone.js (tonejs.github.io, MIT) is big, so it loads the first time a game asks for it: call
// Tone() in make() or reset() (the app waits while it loads, like physics). It plays through the
// app's audio, so the player's volume and mute apply.
//   const T = gs.sound.Tone();
//   const synth = new T.PolySynth(T.Synth).toDestination();  synth.triggerAttackRelease(['C4', 'E4', 'G4'], '8n');
let toneHeld = false;
const toneLib = lazy('Tone.js', () => import('tone').then(T => {
  const a = audio(); if (!a) throw new Error('No audio on this device');
  T.setContext(a.ctx);
  const d = T.getDestination(); d.output.disconnect(); d.output.connect(busIn('music'));
  // a game's Tone loops stop with the round and hold on the pause screen
  register('tone', { stop: () => { T.getTransport().stop(); T.getTransport().cancel(); }, pause: () => T.getTransport().state === 'started' && (T.getTransport().pause(), toneHeld = true), resume: () => { if (toneHeld) { toneHeld = false; T.getTransport().start(); } } });
  return T;
}));
/** The Tone.js library (loads it the first time). */
export function Tone() { return toneLib.get(); }
/** Starts loading Tone.js without waiting for it (the app does this for a card whose soundtrack uses instruments). Kit use only. */
export function warm() { if (!toneLib.ready) toneLib.load().catch(() => {}); }

/* ---------- music ---------- */
const playing = new Set(), held = new Set();   // tunes playing now, and tunes paused mid-way
const DRUM = {
  k: (when, v, out) => { tone(150, { len: .12, wave: 'sine', vol: .14 * v, slide: -110, when, out }); },          // kick
  s: (when, v, out) => { noise(.12, { vol: .07 * v, from: 5000, to: 1500, filter: 'bandpass', q: .7, when, out }); },   // snare
  h: (when, v, out) => { noise(.03, { vol: .03 * v, from: 9000, to: 7000, filter: 'highpass', when, out }); },     // hi-hat
  c: (when, v, out) => { noise(.4, { vol: .03 * v, from: 9000, to: 4000, filter: 'highpass', when, out }); },      // crash
};
const VOICE = { lead: ['square', .028], bass: ['triangle', .07], pad: ['sine', .03], arp: ['square', .018] };
// The tune's clock. Notes are written onto the sound card's own clock AHEAD seconds before they sound,
// topped up every TICK ms, so the page can be busy for most of AHEAD (a level being built, a big frame)
// without the music stumbling. If it's busy for longer the missed steps are skipped, not played late: the
// tune stays on the beat, where a rhythm game's Beat expects it.
const AHEAD = .45, TICK = 50, FIRST = .03;
let toneRetry = 0;   // (a tune asks for Tone.js on its clock: after a failed load, not again for a few seconds)
/**
 * music({ tempo, lead, bass, pad, arp, drums, vol, swing, set, voices }): a looping tune. Each part is a
 * line of steps (eighth notes at the tempo): note names, '.' for a rest, '-' to hold the previous
 * note. drums use k (kick), s (snare), h (hi-hat), c (crash). Parts can be different lengths.
 * Returns { start(), stop(), pause(), resume(), speed(x), layer(name, level), intensity(x), playing, pos }. Keep tunes short and quiet: it plays under the game.
 * Layered music: give parts numbered names (lead2, drums2...) and layers: { drums: .3, lead2: .7 }
 * to bring them in with intensity(); parts not in layers always play.
 * set: the instruments, 'chip' (square and triangle waves, the default), 'synth', 'band' or 'orchestra';
 * voices: { lead: 'bell', drums: 'kit' } swaps single parts (the names are in gs.sound.VOICES and KITS).
 */
export function music({ tempo = 120, vol = 1, swing = 0, layers = null, set = 'chip', voices = null, ...parts } = {}) {
  const tracks = [];
  for (const [name, line] of Object.entries(parts)) {
    if (typeof line !== 'string') continue;
    tracks.push({ name, voice: name.replace(/\d+$/, ''), steps: line.trim().split(/\s+/), level: layers && layers[name] != null ? 0 : 1, to: layers && layers[name] != null ? 0 : 1, inst: voiceFor(set, name, voices) });
  }
  const wantsTone = tracks.some(tr => tr.inst);
  let intensity = 0;
  let timer = 0, step = 0, next = 0, rate = 1;
  let gate = null, band = null, log = [];   // this run's output, its Tone instruments, and [step, time] of what's written
  const stepLen = () => 60 / tempo / 2 / rate;
  function noteLen(tr, i) { let n = 1; while (tr.steps[(i + n) % tr.steps.length] === '-' && n < tr.steps.length) n++; return n; }
  // Notes written ahead can't be taken back, so each run plays through its own gate: closing it is what stops them.
  function open(a) { gate = a.ctx.createGain(); gate.connect(busIn('music')); }
  function close() {
    const g = gate, b = band; gate = null; band = null; log = [];
    if (!g) return;
    try { g.gain.setTargetAtTime(0, g.context.currentTime, .012); } catch { /* gone */ }
    setTimeout(() => { try { g.disconnect(); } catch { /* gone */ } if (b) for (const i of b.values()) i.dispose(); }, 250);
  }
  // the set's instruments, once Tone.js is in (until then, and if one fails, the part plays in the chip sound)
  function tuneUp() {
    if (band || !wantsTone || !gate) return;
    if (!toneLib.ready) { const at = Date.now(); if (at > toneRetry) { toneRetry = at + 8000; toneLib.load().then(() => { toneRetry = 0; }, () => {}); } return; }
    const T = toneLib.get(); band = new Map();
    for (const tr of tracks) if (tr.inst) try { const i = tr.voice === 'drums' ? makeKit(T, tr.inst, gate) : makeVoice(T, tr.inst, gate); if (i) band.set(tr, i); } catch (e) { console.warn('[music]', tr.inst, e); }
  }
  function schedule() { const was = playBus; playBus = 'music'; try { scheduleNow(); } finally { playBus = was; } }
  function scheduleNow() {
    const a = audio(); if (!a) return;
    const now = a.ctx.currentTime;
    if (!gate) open(a);
    tuneUp();
    if (!next) next = now + FIRST;
    else if (next < now + .01) { const k = Math.ceil((now + FIRST - next) / stepLen()); step += k; next += k * stepLen(); }   // fell behind: skip, stay on the beat
    while (next < now + AHEAD) {
      for (const tr of tracks) tr.level += (tr.to - tr.level) * Math.min(1, stepLen() / (tr.fade || .6));
      const sw = step % 2 ? swing * stepLen() : 0;
      if (!sound.muted && sound.volume && sound.music) for (const tr of tracks) {
        const tok = tr.steps[step % tr.steps.length], when = next + sw;
        if (tok === '.' || tok === '-' || tr.level < .02) continue;
        const lv = vol * tr.level, inst = band && band.get(tr);
        if (tr.voice === 'drums') {
          for (const d of tok) { if (inst) try { inst.hit(d, when, lv); continue; } catch (e) { band.delete(tr); inst.dispose(); console.warn('[music]', tr.inst, e); } DRUM[d]?.(when, lv, gate); }
          continue;
        }
        const len = stepLen() * noteLen(tr, step % tr.steps.length) * .9, hz = freq(tok);
        if (!hz) continue;
        if (inst) try { inst.play(hz, len, when, lv); continue; } catch (e) { band.delete(tr); inst.dispose(); console.warn('[music]', tr.inst, e); }
        const [wave, v] = VOICE[tr.voice] || VOICE.lead;
        tone(tok, { len, wave, vol: v * lv, when, attack: tr.voice === 'pad' ? .05 : .005, out: gate });
      }
      log.push([step, next]); if (log.length > 64) log.shift();
      step++; next += stepLen();
    }
  }
  const m = {
    get playing() { return !!timer; },
    start() { if (timer) return m; close(); step = 0; next = 0; schedule(); timer = setInterval(schedule, TICK); playing.add(m); held.delete(m); return m; },
    stop() { clearInterval(timer); timer = 0; close(); playing.delete(m); held.delete(m); return m; },
    /** Holds the tune where it is (resume() carries on from the same step). The app does this on pause. */
    pause() {
      if (!timer) return m;
      // carry on later from the first step that hasn't sounded yet (those after it were only written ahead)
      const now = audio()?.ctx.currentTime ?? 0, e = log.find(x => x[1] > now); if (e) step = e[0];
      clearInterval(timer); timer = 0; close(); playing.delete(m); held.add(m); return m;
    },
    resume() { if (timer || !held.has(m)) return m; held.delete(m); next = 0; schedule(); timer = setInterval(schedule, TICK); playing.add(m); return m; },
    /** Plays faster (x > 1) or slower, for rising tension. */
    speed(x) { rate = Math.max(.25, Math.min(4, x)); return m; },
    /** Fades one part in or out: m.layer('drums', 1) or m.layer('lead2', 0, 2) (fade seconds). */
    layer(name, level = 1, fade = .6) { for (const tr of tracks) if (tr.name === name) { tr.to = Math.max(0, Math.min(1, level)); tr.fade = fade; } return m; },
    /**
     * Sets how intense the music is, 0..1: each part named in `layers` comes in once intensity
     * reaches its number (layers: { drums: .3, lead2: .7 }), so combat can build the tune up.
     */
    intensity(x, fade = 1) { intensity = Math.max(0, Math.min(1, x)); if (layers) for (const [n, at] of Object.entries(layers)) m.layer(n, intensity >= at ? 1 : 0, fade); return m; },
    get level() { return intensity; },
    /**
     * Where the tune is as the player hears it, in steps (a fraction: 4.5 is half way through the fifth
     * eighth note), or -1 while it isn't playing. For pulsing a picture on the beat: Math.floor(m.pos / 2)
     * is the beat. It allows for the phone's sound delay (gs.sound.delay()).
     */
    get pos() {
      const a = timer && log.length ? audio() : null; if (!a) return -1;
      const t = a.ctx.currentTime - delay(); let e = null;
      for (const x of log) { if (x[1] > t) break; e = x; }
      return e ? e[0] + Math.min(1, (t - e[1]) / stepLen()) : -1;
    },
    /** True once the set's instruments are in (a tune started before then plays in the chip sound until they are). */
    get tuned() { return !wantsTone || !!band; },
  };
  return m;
}
/**
 * One instrument to play yourself (a piano toy, a tune the player taps out): instrument('epiano').
 * Names: gs.sound.VOICES (saw, sub, warm, pulse, epiano, bassguitar, organ, pick, flute, cello, strings,
 * harp, brass, bell, kalimba, marimba, steelpan). play(note, { len, vol, at }) plays one note (a name
 * like 'C4' or Hz); it plays on the music channel. Uses Tone.js, which loads the first time: make it in
 * make() or reset() (the app waits, as for physics).
 */
export function instrument(name, { vol = 1 } = {}) {
  if (!VOICES[name]) throw new Error(`There's no instrument called "${name}" (there's ${Object.keys(VOICES).join(', ')})`);
  const T = toneLib.get(), a = audio();
  const dead = { name, play() { return dead; }, free() {} };
  if (!a) return dead;
  const g = a.ctx.createGain(); g.gain.value = Math.max(0, Math.min(2, vol)); g.connect(busIn('music'));
  const v = makeVoice(T, name, g);
  const h = {
    name,
    play(note, { len = .3, vol: lv = 1, at = 0 } = {}) { if (!sound.muted && sound.volume) try { v.play(freq(note) || note, len, a.ctx.currentTime + Math.max(.005, at), lv); } catch { /* audio unavailable */ } return h; },
    free() { try { v.dispose(); g.disconnect(); } catch { /* gone */ } },
  };
  own(h);
  return h;
}
export { SETS, VOICES, KITS };
/**
 * Living music: makes a tune follow the play. Close calls push the tension up, it eases back when
 * things calm down, a loss brings it right down, and the tempo drifts a little towards the
 * player's own pace. It drives the tune's intensity() (so give it layers) and speed().
 *
 *   const song = music({ tempo: 112, layers: { drums: .25, lead2: .7 }, ... });
 *   const live = follow(song, { pace: 2 });   // pace: taps a second that count as "normal"
 *   update(dt) { if (!song.playing) song.start(); live.update(dt); }
 *   on a close call: live.feel(1)     on each tap: live.tap()     on game over: live.lost() / live.won()
 *
 * opts: calm (the resting intensity, .15), ease (how fast tension falls, per second, .25),
 * tempo ([lowest, highest] speed, [.92, 1.12]), brain (a Tiny Brain: its mood keeps tension up too).
 */
export function follow(song, { calm = .15, ease = .25, tempo = [.92, 1.12], pace = 2, brain = null } = {}) {
  let tension = calm, gap = 1 / pace, lastTap = -1, t = 0, speed = 1, lift = 0;
  const L = {
    get tension() { return tension; },
    get speed() { return speed; },
    /** A tense or exciting moment, about 0..1 (close call 1, a hit .5). */
    feel(x = 1) { tension = Math.min(1, tension + Math.max(0, +x || 0) * .35); return L; },
    /** The player did something: the tempo leans towards their pace. */
    tap() { if (lastTap >= 0) { const d = t - lastTap; if (d > .05 && d < 2) gap += (d - gap) * .15; } lastTap = t; return L; },
    /** The player lost: everything settles at once. */
    lost() { tension = calm * .5; lift = 0; return L; },
    /** The player won: a short lift. */
    won() { lift = 1; return L; },
    update(dt) {
      t += dt;
      const floor = brain ? Math.max(calm, Math.min(1, calm + (brain.mood || 0) * .5)) : calm;
      tension = Math.max(floor, tension - ease * dt);
      lift = Math.max(0, lift - dt * .5);
      const want = Math.min(1, tension + lift * .4);
      // the player's pace: quicker taps than `pace`, a bit faster; slower, a bit slower; tension adds a little
      const p = Math.max(tempo[0], Math.min(tempo[1], 1 + ((1 / gap) / pace - 1) * .08 + want * .05));
      speed += (p - speed) * Math.min(1, dt * .8);
      song.intensity(want, 1.2); song.speed(speed);
      return L;
    },
  };
  return L;
}

/** Stops every tune. The app calls it when a round ends or the player leaves a game. */
export function stopMusic() { for (const m of [...playing, ...held]) m.stop(); }
/** Holds every playing tune; resumeMusic() carries them on. The app calls these when a game pauses. */
export function pauseMusic() { for (const m of [...playing]) m.pause(); }
export function resumeMusic() { for (const m of [...held]) m.resume(); }
register('music', { stop: stopMusic, pause: pauseMusic, resume: resumeMusic });
if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', () => { if (document.hidden) pauseMusic(); });

/* ---------- 3D sound: sounds placed in the world ---------- */
// The browser's own 3D audio (Web Audio PannerNode with HRTF: real left/right and front/behind in
// headphones, distance fall-off on speakers). Place the ears each frame where the camera is, then
// play sounds at points. 2D games: pass { x, y } and they sit on a flat plane.
//   const ears = new Ears();
//   update() { ears.place(camera.position, camera.getWorldDirection(v)); }
//   ears.tone(440, enemy.pos, { len: .2 });  ears.noise(.4, barrel.pos);  ears.zzfx(gun.pos, ...numbers);
//   engine = ears.loop(car.pos, 'sawtooth', 80);  engine.move(car.pos).pitch(80 + speed * 6);  engine.stop();
//
// Sound that knows the level: new Ears({ level: world }) (a gs.physics3d World3D, a TileMap, a City,
// Voxels, a function, or a list of them: see acoustics.js). Every sound is then muffled by the walls
// between it and the ears by itself (less through a doorway or round a corner, more behind something
// thick; a loop is checked again as it and the ears move), and the place the ears stand in is felt out
// with a few rays a frame: a small room, a hall, a cave, a street or open country each gets its own
// echo, changing as the player walks from one to the next. ears.room is what it has worked out
// ({ size, walls, roof, enclosed, tail, wet, echo, delay }), ears.blocked(p) how muffled a point is.
const P3 = p => ({ x: p?.x || 0, y: p?.z == null ? 0 : (p.y || 0), z: p?.z == null ? (p?.y || 0) : p.z });
const OLD_MUFFLE = { gain: 1, hz: 700 };   // muffled: true, as it has always sounded
export class Ears {
  /**
   * ref: distance at full volume; max: past this it doesn't get quieter; rolloff: how fast it falls; hrtf: false for plain stereo (cheaper).
   * level: what stands in the way of sound (see above); hard: 0 soft .. 1 bare stone (how the place rings); unit: level units to a
   * metre (16 for a map of 16-pixel tiles a metre across); auto: false to work the place out (ears.room) but leave the echo to you;
   * rays: how many the place is felt with each frame (4).
   */
  constructor({ ref = 2, max = 60, rolloff = 1, hrtf = true, flat = false, space = null, send = .5, level = null, hard = .6, unit = 1, auto = true, rays = 4 } = {}) {
    Object.assign(this, { ref, max, rolloff, hrtf, flat, space, send, hard, unit, auto, rays }); this.pos = { x: 0, y: 0, z: 0 }; this.at = { x: 0, y: 0, z: 0 };
    this.live = []; this.turn = 0; this.heardAt = -1; this.level = level;
  }
  /** What stands in the way of sound (null: nothing does). Set it again when the level is another one. */
  set level(l) { this._level = l || null; this.cast = caster(l, { flat: this.flat }); this.place0 = new Room({ hard: this.hard, flat: this.flat, unit: this.unit }); if (!l && this.auto) mixer.place(null); }
  get level() { return this._level; }
  /** Where the listener is and which way it faces (forward and up are directions; up defaults to +y). */
  place(pos, forward = { x: 0, y: 0, z: -1 }, up = { x: 0, y: 1, z: 0 }) {
    this.at = this.flat ? { x: pos.x || 0, y: pos.y || 0, z: 0 } : { x: pos.x || 0, y: pos.y || 0, z: pos.z || 0 };
    const a = audio();
    if (a) {
      const L = a.ctx.listener, p = this.flat ? P3(pos) : { x: pos.x, y: pos.y, z: pos.z || 0 }, f = forward; this.pos = p;
      try {
        if (L.positionX) { const t = a.ctx.currentTime; L.positionX.setTargetAtTime(p.x, t, .02); L.positionY.setTargetAtTime(p.y, t, .02); L.positionZ.setTargetAtTime(p.z, t, .02);
          L.forwardX.setValueAtTime(f.x, t); L.forwardY.setValueAtTime(f.y || 0, t); L.forwardZ.setValueAtTime(f.z ?? -1, t); L.upX.setValueAtTime(up.x, t); L.upY.setValueAtTime(up.y, t); L.upZ.setValueAtTime(up.z, t); }
        else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y || 0, f.z ?? -1, up.x, up.y, up.z); }
      } catch { /* old audio */ }
    } else this.pos = this.flat ? P3(pos) : { x: pos.x, y: pos.y, z: pos.z || 0 };
    if (this.cast) this.listen(a);
    return this;
  }
  /** For top-down 2D games: the listener at (x, y) on the ground, facing up the screen. */
  place2d(x, y, facing = -Math.PI / 2) { if (!this.flat) { this.flat = true; this.level = this._level; } return this.place({ x, y }, { x: Math.cos(facing), y: 0, z: Math.sin(facing) }); }
  // each frame with a level: a few more rays round the ears, the place's echo brought up to date five
  // times a second, and two of the sounds that go on checked again for walls
  listen(a) {
    this.place0.probe(this.cast, this.at, this.rays);
    const now = a ? a.ctx.currentTime : 0;
    if (this.auto && a && now - this.heardAt > .2 && this.place0.seen >= 8) { this.heardAt = now; mixer.place(this.place0.read(), this.place0.known ? .6 : .3); }
    for (let k = 0, n = Math.min(2, this.live.length); k < n; k++) this.live[this.turn++ % this.live.length].hear();
  }
  /** The place round the ears, as the level says it is so far: { size, walls, roof, enclosed, tail, wet, echo, delay } (null without a level). */
  get room() { return this.cast ? this.place0.read() : null; }
  /** How much the level keeps a sound at p from the ears: 0 nothing in the way .. 1 behind a thick wall (0 without a level). */
  blocked(p) {
    if (!this.cast) return 0;
    // (a volley of sounds from one spot asks once: answers are kept a quarter of a second, by half-metre cells)
    const e = this.at, now = typeof performance !== 'undefined' ? performance.now() : Date.now(), M = this.memo ||= new Map();
    const ek = Math.round(e.x * 2 / this.unit) + ',' + Math.round(e.y * 2 / this.unit) + ',' + Math.round(e.z * 2 / this.unit);
    if (ek !== this.memoAt || now - this.memoT > 250 || M.size > 64) { M.clear(); this.memoAt = ek; this.memoT = now; }
    const key = Math.round((p.x || 0) / this.unit * 2) + ',' + Math.round((p.y || 0) / this.unit * 2) + ',' + Math.round((p.z || 0) / this.unit * 2);
    let k = M.get(key);
    if (k == null) { k = blocked(this.cast, e, this.flat ? { x: p.x || 0, y: p.y || 0 } : p, { flat: this.flat, spread: .6 * this.unit, thick: 1.2 * this.unit }); M.set(key, k); }
    return k;
  }
  /**
   * A panner at p. With a level the sound is muffled by what stands between it and the ears; muffled: true
   * (behind a wall, as you say) or 0..1 says so yourself, false leaves it clear. Kit use; play sounds into it.
   */
  node(p, { muffled, track = false } = {}) {
    const a = audio(); if (!a) return null;
    try {
      const q = this.flat ? P3(p) : { x: p.x, y: p.y, z: p.z || 0 }, pn = a.ctx.createPanner();
      pn.panningModel = this.hrtf ? 'HRTF' : 'equalpower'; pn.distanceModel = 'inverse'; pn.refDistance = this.ref; pn.maxDistance = this.max; pn.rolloffFactor = this.rolloff;
      if (pn.positionX) { pn.positionX.value = q.x; pn.positionY.value = q.y; pn.positionZ.value = q.z; } else pn.setPosition(q.x, q.y, q.z);
      const own = muffled === true || muffled === false || typeof muffled === 'number', k = muffled === true ? 1 : own ? +muffled : this.blocked(p);
      let end = pn;
      if (k > .02 || (track && this.cast && !own)) {
        const f = a.ctx.createBiquadFilter(), g = a.ctx.createGain(), m = muffled === true ? OLD_MUFFLE : muffleOf(k);
        f.type = 'lowpass'; f.frequency.value = m.hz; f.Q.value = .5; g.gain.value = m.gain; pn.connect(f); f.connect(g); end = g;
        if (!own) pn.gsMuffle = { f, g, k };
      }
      // with a space, some of each sound also goes into the place's echo (far sounds keep more of it)
      if (this.space?.tail) { const s = a.ctx.createGain(); s.gain.value = this.send; end.connect(s); s.connect(this.space.tail); }
      end.connect(busIn('sfx')); return pn;
    } catch { return null; }
  }
  /** One note at a point (options as tone(), plus muffled: true for behind a wall where there is no level to say so). */
  tone(f, p, o = {}) { const n = this.node(p, o); if (n) tone(f, { ...o, out: n }); return this; }
  /** A noise burst at a point (options as noise()). */
  noise(len, p, o = {}) { const n = this.node(p, o); if (n) noise(len, { ...o, out: n }); return this; }
  /** A ZzFX sound at a point. */
  zzfx(p, ...params) { const n = this.node(p); if (n) playZ(params, n); return this; }
  /** A ready-made sound at a point: ears.play('boom', pos). Ready-made sounds are built from tone and noise, so they follow. */
  play(name, p, pitch = 1, o = {}) {
    const n = this.node(p, o); if (!n || !sounds[name]) return this;
    route = n; try { sounds[name](pitch); } finally { route = null; }   // its notes go into the panner
    return this;
  }
  /** A steady sound that follows something (engines, fires, a humming generator): returns { move(p), pitch(hz), volume(v), stop() }. */
  loop(p, wave = 'sawtooth', hz = 90, { vol = .03, muffled } = {}) {
    const a = audio(), dead = { move() { return this; }, pitch() { return this; }, volume() { return this; }, stop() {} };
    if (!a || sound.muted || !sound.volume) return dead;
    const n = this.node(p, { muffled, track: true }); if (!n) return dead;
    try {
      const o = a.ctx.createOscillator(), g = a.ctx.createGain(); o.type = wave; o.frequency.value = hz; g.gain.value = vol; o.connect(g); g.connect(n); o.start();
      const self = this; let at = p;
      const h = {
        move(q) { at = q; const r = self.flat ? P3(q) : { x: q.x, y: q.y, z: q.z || 0 }, t = a.ctx.currentTime; if (n.positionX) { n.positionX.setTargetAtTime(r.x, t, .03); n.positionY.setTargetAtTime(r.y, t, .03); n.positionZ.setTargetAtTime(r.z, t, .03); } else n.setPosition(r.x, r.y, r.z); return h; },
        pitch(f) { o.frequency.setTargetAtTime(f, a.ctx.currentTime, .05); return h; },
        volume(v) { g.gain.setTargetAtTime(v, a.ctx.currentTime, .05); return h; },
        // (kit: the walls between it and the ears, looked at again; it glides to the new sound over a fifth of a second)
        hear() { const mf = n.gsMuffle; if (!mf) return; const k = self.blocked(at); if (Math.abs(k - mf.k) < .02) return; mf.k = k; const m = muffleOf(k), t = a.ctx.currentTime; mf.f.frequency.setTargetAtTime(m.hz, t, .07); mf.g.gain.setTargetAtTime(m.gain, t, .07); },
        /** 0..1: how muffled the level makes it now. */
        get muffled() { return n.gsMuffle?.k ?? 0; },
        stop() { try { g.gain.setTargetAtTime(0, a.ctx.currentTime, .05); o.stop(a.ctx.currentTime + .2); } catch { /* stopped */ } loops.delete(h); const i = self.live.indexOf(h); if (i >= 0) self.live.splice(i, 1); },
      };
      loops.add(h); if (n.gsMuffle) this.live.push(h); return h;
    } catch { return dead; }
  }
  /** How loud a sound at p would be here, 0..1 (for subtitles or "you heard that" hints): quieter with distance, and behind walls where there is a level. */
  heard(p) { const q = this.flat ? P3(p) : { x: p.x, y: p.y, z: p.z || 0 }, d = Math.hypot(q.x - this.pos.x, q.y - this.pos.y, q.z - this.pos.z); return this.ref / (this.ref + this.rolloff * Math.max(0, Math.min(this.max, d) - this.ref)) * (this.cast ? muffleOf(this.blocked(p)).gain : 1); }
}
/** The sums behind sound that knows the level, for your own sounds: caster(level), blocked(cast, ear, source), muffleOf(amount), Room (see Ears). */
export const acoustics = { caster, blocked, muffleOf, Room };
let route = null;   // while set, tone() and noise() play into this node (for Ears.play)
const loops = new Set();
register('ears', { stop: () => { for (const h of [...loops]) h.stop(); const a = audio(); try { a?.ctx.listener.positionX?.setValueAtTime(0, a.ctx.currentTime); } catch { /* ok */ } } });

/* ---------- mixer: channels, ducking, rooms, muffle ---------- */
// Every game sound goes through a channel ('sfx' for effects, 'music' for music(), Tone.js and
// layered tunes, 'voice' for your own speech-like sounds), then the shared room and muffle, then
// the player's volume. Change them any time; they all go back to normal when the round ends.
//   mixer.volume('music', .4)              // a channel's level (0..1, fades over .1 s)
//   mixer.duck('music', .3, .8)            // dip the music to 30% for .8 s (then back): big moments, lines
//   mixer.room('cave')                     // echo for everything: 'none' | 'room' | 'hall' | 'cave' | 'pipe', or { echo, delay, reverb, size }
//   mixer.muffle(.8)                       // 0..1 dull everything, like hearing it underwater or from inside a box
//   mixer.channel('alarm').volume(.5)      // your own channel; play into it with tone(f, { bus: 'alarm' }) ...
// Speech from say() dips the music for you while it talks.
let playBus = 'sfx';
const BUSES = ['sfx', 'music', 'voice'];
let mix = null;
function impulse(ctx, secs, decay) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * secs)), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** decay; }
  return b;
}
function mixGraph() {
  const a = audio(); if (!a) return null;
  if (mix && mix.ctx === a.ctx) return mix;
  const ctx = a.ctx, input = ctx.createGain(), muffle = ctx.createBiquadFilter(), dry = ctx.createGain(),
    verb = ctx.createConvolver(), verbGain = ctx.createGain(), delay = ctx.createDelay(1.5), fb = ctx.createGain(), echoGain = ctx.createGain();
  muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.Q.value = .7;
  input.connect(muffle); muffle.connect(dry); dry.connect(a.out);
  verbGain.gain.value = 0; muffle.connect(verb); verb.connect(verbGain); verbGain.connect(a.out);
  echoGain.gain.value = 0; fb.gain.value = 0; muffle.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(echoGain); echoGain.connect(a.out);
  mix = { ctx, input, muffle, verb, verbGain, delay, fb, echoGain, buses: new Map(), roomKey: '' };
  for (const b of BUSES) channelNode(b);
  return mix;
}
function channelNode(name) {
  const m = mixGraph(); if (!m) return null;
  let g = m.buses.get(name);
  if (!g) { g = m.ctx.createGain(); g.connect(m.input); m.buses.set(name, g); g.level = 1; }
  return g;
}
/** The input of a channel (kit use: where tone(), noise() and zzfx() play into). */
function busIn(name) { return channelNode(name || 'sfx') || audio()?.out; }
setSfxOut(() => busIn('sfx'));
function setLevel(g, v, fade) { const t = g.context.currentTime; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(v, t, Math.max(.005, fade / 3)); }
// The place's own echo, set from the level by Ears (mixer.place): effects and voices only, never the music.
// Two reverbs: the idle one is given the new tail and the two cross over, so walking from a cupboard
// into a hall never clicks; and one delay for the slap back off far walls outdoors.
function placeGraph() {
  const m = mixGraph(); if (!m) return null;
  if (m.place) return m.place;
  const ctx = m.ctx, send = ctx.createGain(), out = ctx.createGain(), dl = ctx.createDelay(1.5), dlp = ctx.createBiquadFilter(), dg = ctx.createGain();
  const slot = () => { const cv = ctx.createConvolver(), g = ctx.createGain(); cv.normalize = false; g.gain.value = 0; send.connect(cv); cv.connect(g); g.connect(out); return { cv, g, tail: 0 }; };
  dlp.type = 'lowpass'; dlp.frequency.value = 2600; dg.gain.value = 0; send.connect(dl); dl.connect(dlp); dlp.connect(dg); dg.connect(out);
  out.connect(m.muffle);   // (so the echo is dulled with everything else: under water, inside a box)
  for (const b of ['sfx', 'voice']) channelNode(b).connect(send);
  return m.place = { ctx, send, out, dl, dg, slots: [slot(), slot()], on: 0, busy: 0, irs: new Map() };
}
// an echo tail made in code: it dies away evenly (60 dB down at `secs`), the top end first, after a few
// first bounces off the nearest walls
function placeImpulse(p, secs) {
  const key = Math.round(Math.log(secs) / Math.log(1.2)), have = p.irs.get(key); if (have) return have;
  const ctx = p.ctx, T = Math.pow(1.2, key), n = Math.max(64, Math.floor(ctx.sampleRate * T)), b = ctx.createBuffer(2, n, ctx.sampleRate), k = Math.log(1000) / n;
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    for (let i = 0; i < n; i++) { const x = i / n, a = .12 + .5 * (1 - x) * (1 - x); lp += ((Math.random() * 2 - 1) - lp) * a; d[i] = lp * Math.exp(-k * i) * (i < 96 ? i / 96 : 1); }
    for (let e = 0; e < 5; e++) { const at = Math.floor(ctx.sampleRate * Math.min(T * .5, .006 + .011 * (e + 1) * (.6 + .8 * Math.random()) * Math.min(3, T))); if (at < n) d[at] += (Math.random() < .5 ? -1 : 1) * .6 / (e + 1.5); }
    // the whole tail carries about as much as the sound that set it off, whatever its length (so wet is how
    // much echo there is next to the sound, the same in every browser: the reverbs' own levelling is off).
    // .35: the tail is duller than most sounds, and gives the low and middle of a sound more than its share
    let sum = 0; for (let i = 0; i < n; i++) sum += d[i] * d[i]; const s = sum > 0 ? Math.sqrt(.35 / sum) : 0; for (let i = 0; i < n; i++) d[i] *= s;
  }
  if (p.irs.size >= 6) p.irs.delete(p.irs.keys().next().value);
  p.irs.set(key, b); return b;
}
const ROOMS = {
  none: { reverb: 0, echo: 0 },
  room: { reverb: .18, size: .5, echo: 0 },
  hall: { reverb: .32, size: 1.8, echo: 0 },
  cave: { reverb: .3, size: 2.6, echo: .25, delay: .32 },
  pipe: { reverb: .12, size: .4, echo: .4, delay: .09 },
};
export const mixer = {
  /** A channel's volume, 0..1 (default 1), fading over `fade` seconds. */
  volume(name, v, fade = .1) { const g = channelNode(name); if (g) { g.level = Math.max(0, Math.min(1, +v || 0)); setLevel(g, g.level, fade); } return mixer; },
  /** Dips a channel to `to` (of its volume) for `hold` seconds, then brings it back over `back` seconds. */
  duck(name = 'music', to = .3, hold = .6, back = .5) {
    const g = channelNode(name); if (!g) return mixer;
    const t = g.context.currentTime, lv = g.level;
    g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(lv * to, t, .03); g.gain.setTargetAtTime(lv, t + Math.max(0, hold), Math.max(.01, back / 3));
    return mixer;
  },
  /** Echo for everything: a room name, or { reverb 0..1, size (seconds of tail), echo 0..1, delay (seconds) }. */
  room(r = 'none') {
    const m = mixGraph(); if (!m) return mixer;
    const o = typeof r === 'string' ? (ROOMS[r] || ROOMS.none) : { ...ROOMS.none, ...r }, t = m.ctx.currentTime;
    const key = (o.size || 1).toFixed(2);
    if (o.reverb > 0 && m.roomKey !== key) { m.verb.buffer = impulse(m.ctx, Math.min(4, o.size || 1), 2.5); m.roomKey = key; }
    m.verbGain.gain.setTargetAtTime(Math.max(0, Math.min(1, o.reverb || 0)), t, .05);
    m.delay.delayTime.setTargetAtTime(Math.max(.02, Math.min(1.4, o.delay || .25)), t, .05);
    m.fb.gain.setTargetAtTime(Math.min(.7, (o.echo || 0) * 1.4), t, .05);
    m.echoGain.gain.setTargetAtTime(Math.max(0, Math.min(1, o.echo || 0)), t, .05);
    return mixer;
  },
  /**
   * The echo of the place the listener is in, for effects and voices (not the music): { tail: seconds it
   * rings, wet: 0..1 how much (1: the echo carries about as much as the sound itself; a room is about .3, a
   * great hall .5), echo: 0..1 a single slap back, delay: seconds until it returns }, gliding
   * there over `fade` seconds; null for none. new Ears({ level }) sets it from the level by itself; set it
   * yourself for a place you know (a cutscene in a cathedral: { tail: 3.5, wet: .4 }).
   */
  place(o = null, fade = .6) {
    if (!o && !mix?.place) return mixer;
    const p = placeGraph(); if (!p) return mixer;
    const t = p.ctx.currentTime, k = Math.max(.01, fade / 3), wet = o ? Math.max(0, Math.min(1, +o.wet || 0)) : 0, tail = wet > .004 ? Math.max(.15, Math.min(4.5, +o.tail || 1)) : 0;
    let cur = p.slots[p.on];
    // a tail within a fifth of the one ringing now keeps it (only its level moves); else the idle reverb takes the new one
    if (tail && (!cur.tail || Math.abs(Math.log(tail / cur.tail)) > .19) && t >= p.busy) {
      const next = p.slots[1 - p.on];
      try { next.cv.buffer = placeImpulse(p, tail); next.tail = tail; cur.g.gain.setTargetAtTime(0, t, k); p.on = 1 - p.on; p.busy = t + fade * 1.6; cur = next; } catch { /* no reverb here */ }
    }
    cur.g.gain.setTargetAtTime(cur.tail ? wet : 0, t, k);
    if (!tail) p.slots[1 - p.on].g.gain.setTargetAtTime(0, t, k);
    const e = o ? Math.max(0, Math.min(.6, +o.echo || 0)) : 0;
    if (e > 0) p.dl.delayTime.setTargetAtTime(Math.max(.05, Math.min(1.4, +o.delay || .2)), t, .12);
    p.dg.gain.setTargetAtTime(e, t, k);
    return mixer;
  },
  /** 0..1: how muffled everything sounds (0 clear, 1 deep underwater), fading over `fade` seconds. */
  muffle(x = 0, fade = .15) {
    const m = mixGraph(); if (!m) return mixer;
    const k = Math.max(0, Math.min(1, +x || 0)), hz = 20000 * Math.pow(250 / 20000, k);
    m.muffle.frequency.setTargetAtTime(hz, m.ctx.currentTime, Math.max(.005, fade / 3));
    return mixer;
  },
  /** A channel of your own (or a built-in one) to set: mixer.channel('alarm').volume(.5). */
  channel(name) { return { volume: (v, f) => mixer.volume(name, v, f), duck: (...a) => mixer.duck(name, ...a) }; },
  /** Back to normal: every channel at full volume, no room, no muffle. The app does this between rounds. */
  reset() {
    if (!mix) return mixer;
    for (const g of mix.buses.values()) { g.level = 1; setLevel(g, 1, .05); }
    mixer.room('none'); mixer.muffle(0, .05); mixer.place(null, .05);
    return mixer;
  },
};
register('mixer', { stop: () => mixer.reset() });

/* ---------- speech: text to speech ---------- */
// Characters that talk out loud, with no sound files: the phone's own voices (iPhone and Android
// speech, through @capacitor-community/text-to-speech; the browser's speechSynthesis on the web).
//   say('Watch out!', { pitch: 1.4, rate: 1.1 })      // returns a promise that ends when it's said
//   say('Bonjour', { lang: 'fr-FR' });  stopTalking();  talking() -> true while speaking
//   say(line, { onWord: at => ... })   at: where in the text each word starts, as it's spoken (where the phone says; lip sync)
// A cast: give each character a voice of their own, picked from the voices this phone has.
//   say('Minuted.', { voice: 'woman' })                               // 'woman' | 'man' | 'any'
//   say("I'll have that back.", { voice: { kind: 'man', lang: ['en-AU', 'en-GB'], take: 1 } })
//       lang: the accents to try, in order. take: the second (third...) such voice, so two men in one
//       scene sound different. like: ['Daniel', 'rjs'] asks for a voice by name where the phone has it.
//       A phone with no voice of that kind uses its own, a little lower or higher, so a cast still differs.
// Timing: an array says its parts one after another, with pauses (seconds) between, and a part can
// have its own pitch, rate and voice: the pause before a punchline, a slower last word.
//   say(['Bold.', .3, 'Visionary.', .5, { text: 'Rectangular.', rate: .85 }], { voice: 'woman' })
// voices() resolves to what this phone has: [{ name, lang, kind: 'woman' | 'man' | null }].
// pitch .5..2, rate .5..2 (1 normal), volume 0..1 (the player's volume applies on top). A voice at
// its own pitch sounds most human: prefer casting to bending pitch far from 1. Lines are cut at
// 300 characters (600 for all the parts of an array). A new line stops the one before. Music dips
// while it talks. Speech follows the player's mute; it stops when the round ends. Always show the
// words on screen too (some players play muted, and not every phone has every language).
// A shaped voice: the same phone voice made into a character.
//   say('Door three is opening.', { voice: 'woman', fx: 'tannoy' })     // through a loudspeaker in a hall
//   say('Copy that.', { voice: 'man', size: 1.15, fx: 'radio' })        // a bigger man, over a radio
//       size: 1.15 a bigger person (deeper in every way, at the same pace), .85 a smaller one (.6 to 1.6).
//       fx: 'radio' | 'tannoy' | 'phone' | 'megaphone' | 'box' | 'bright' | 'warm' | 'robot' | 'tiny' | 'clean',
//       or a recipe of your own: { like: 'radio', drive: .2, mix: .6 } (the parts are listed in voice-fx.js).
// With either, the phone writes the line to sound instead of speaking it and the kit plays it through
// the 'voice' channel of the mixer: so it is as loud on every phone, and mixer.room(), muffle() and the
// level's own echo (Ears) reach it like any other sound, and onWord gets every word. That needs the
// Android or iPhone app; in a browser, or on a phone that can't, the line is spoken as before, with
// size as a small change of pitch and no fx. shaped() says which: true once a line has played shaped,
// false where it can't be, null before the first try. A shaped line starts a moment later than a plain
// one (the phone writes all of it first), so open with a short pause: say([.2, 'Ah. A door.'], ...).
const TTS = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('TextToSpeech') ? registerPlugin('TextToSpeech') : null;
const RENDER = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('SpeechAudio') ? registerPlugin('SpeechAudio') : null;   // plugins/speech-audio
let talkingNow = 0, talkGen = 0, cancelTalk = null, voiceList = null;
// shaped lines: whether this phone can (null: not tried yet), voices that could not be written to sound, lines already
// made (the last few, so a line said twice starts at once), and the ones playing
let shapedOk = RENDER && canShape() ? null : false, shapeFails = 0, rendering = 0, clipSecs = 0;
const noShape = new Set(), clips = new Map(), live = new Set();
const badVoices = new Set();   // voices that failed here (not downloaded, say): not cast again this session
const clampN = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Number.isFinite(+v) ? +v : d));
const langOk = l => /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(l);
/** The phone's voices as it lists them (kit use). */
function listVoices() {
  return voiceList ||= (async () => {
    try {
      if (TTS) return (await TTS.getSupportedVoices()).voices || [];
      const S = globalThis.speechSynthesis; if (!S?.getVoices) return [];
      let v = S.getVoices();
      if (!v.length) {   // browsers fill the list a moment after the page loads
        await new Promise(res => { const t = setTimeout(res, 600); S.addEventListener?.('voiceschanged', () => { clearTimeout(t); res(); }, { once: true }); });
        v = S.getVoices();
      }
      if (!v.length) voiceList = null;   // none yet: look again next time
      return [...v];
    } catch { voiceList = null; return []; }
  })();
}
/** What voices this phone has to cast from: [{ name, lang, kind: 'woman' | 'man' | null }] (joke voices left out). */
export const voices = () => listVoices().then(l => l.map(v => ({ v, d: describeVoice(v) })).filter(x => !x.d.joke).map(({ v, d }) => ({ name: String(v.name || v.voiceURI || ''), lang: String(v.lang || ''), kind: d.sex === 'f' ? 'woman' : d.sex === 'm' ? 'man' : null })));
/** A voice or the phone that could not write a line to sound: three in a row with none working, and no more are tried. */
function shapeFailed(who) { noShape.add(who); if (++shapeFails >= 3 && shapedOk !== true) shapedOk = false; }
/**
 * One part of a line written to sound by the phone and shaped (size, fx): { buffer, gain, seconds, total,
 * marks } to play, or null where it can't be (then the phone says it itself).
 */
async function clipFor(p, gen, stopped) {
  if (!RENDER || shapedOk === false) return null;
  const a = audio(); if (!a) return null;
  let list = null, pick = null;
  if (p.voice) {
    list = await Promise.race([listVoices(), stopped]); if (gen !== talkGen || !list) return null;
    pick = castVoice(list, wantOf(p.voice, p.lang), { native: true, bad: badVoices });
  }
  const cast = pick && pick.at >= 0 ? list[pick.at] : null, uri = cast ? String(cast.voiceURI || '') : '';
  const lang = cast && langOk(cast.lang) ? cast.lang : [].concat(p.lang).find(langOk) || 'en-GB', who = uri || lang;
  if (noShape.has(who)) return null;
  const pitch = clampN(p.pitch * (pick ? pick.pitch : 1), .5, 2, 1), key = JSON.stringify([p.text, who, p.rate, pitch, p.size, p.fx, p.joined, p.join]);
  const have = clips.get(key);
  if (have) { clips.delete(key); clips.set(key, have); return have; }
  let timer = null;
  rendering++;
  try {
    // a phone that never answers must not hold the line up: after this long it says the line itself
    const late = new Promise(res => { timer = setTimeout(res, Math.min(6000, 2500 + p.text.length * 30), 'late'); });
    const made = Promise.resolve(RENDER.render({ text: p.text, lang, voiceURI: uri, rate: clampN(p.rate * p.size, .3, 3, 1), pitch })).catch(() => null);
    const r = await Promise.race([made, stopped, late]);
    if (gen !== talkGen) return null;   // (stopped: stopTalking() has told the phone already)
    if (r === 'late') { try { Promise.resolve(RENDER.cancel()).catch(() => {}); } catch { /* gone */ } }
    if (!r || r === 'late' || !r.ok || !r.pcm || !(r.rate >= 4000)) { shapeFailed(who); return null; }
    const made2 = await shape(pcm16(r.pcm), r.rate, { size: p.size, fx: p.fx, outRate: a.ctx.sampleRate, open: !p.joined, close: p.join == null, hold: p.join == null ? 0 : p.join + .06 });
    // the engine's word marks are in seconds of what it wrote: less the silence cut off the front, slowed (or sped) by size
    const said = made2.seconds - made2.lead, own = Array.isArray(r.marks) ? r.marks.map((v, i) => i % 2 ? Math.max(0, (v - made2.cut) * p.size) : v) : null;
    const marks = goodMarks(own, p.text, said) || wordTimes(p.text, said);
    for (let i = 1; i < marks.length; i += 2) marks[i] += made2.lead;
    const clip = { buffer: made2.buffer, gain: made2.gain, seconds: made2.seconds, total: made2.total, marks };
    clips.set(key, clip); clipSecs += clip.total; shapeFails = 0;
    while (clips.size > 1 && (clips.size > 32 || clipSecs > 45)) { const [k0, c0] = clips.entries().next().value; clips.delete(k0); clipSecs -= c0.total; }
    return clip;
  } catch { shapeFailed(who); return null; } finally { clearTimeout(timer); rendering--; }
}
/** Fades a playing line out in a few thousandths of a second (a cut dead would click). */
function hush(v) { try { const t = v.g.context.currentTime; v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, .008); v.src.stop(t + .06); } catch { /* ended already */ } }
/** Plays a shaped part through the mixer's voice channel. Resolves true when its last word ends (its echoes ring on). */
function playClip(clip, p, gen, from, onWord, stopped) {
  const a = audio(); if (!a) return Promise.resolve(false);
  return new Promise(res => {
    const { ctx } = a, src = ctx.createBufferSource(), g = ctx.createGain(), t0 = ctx.currentTime + .02, mine = { src, g };
    let i = 0, done = false, tick = null, guard = null;
    const end = ok => { if (done) return; done = true; clearInterval(tick); clearTimeout(guard); res(ok); };
    src.buffer = clip.buffer; g.gain.value = clip.gain * p.vol; src.connect(g); g.connect(busIn('voice'));
    src.onended = () => { live.delete(mine); try { g.disconnect(); } catch { /* gone */ } end(true); };
    live.add(mine); shapedOk = true;
    const words = typeof onWord === 'function';
    tick = setInterval(() => {
      const now = ctx.currentTime - t0;
      if (words) for (const heard = now - delay(); i < clip.marks.length && clip.marks[i + 1] <= heard; i += 2) if (gen === talkGen) try { onWord(from + clip.marks[i]); } catch { /* the game's */ }
      if (now >= clip.seconds) end(true);
    }, 25);
    guard = setTimeout(() => end(true), (clip.total + 1.5) * 1000);   // (sound that isn't running, say before the first touch, must not hold the line up)
    stopped.then(() => end(false));
    src.start(t0);
  });
}
/** One part of a line, said in the phone's voice or a cast one. Resolves true when it was said. */
async function sayPart(p, gen, from, onWord, stopped) {
  if (p.clip) {   // a shaped part: the phone wrote it to sound (begun when the line was), and the kit plays it
    const clip = await Promise.race([p.clip, stopped]); if (gen !== talkGen) return false;
    if (clip) return playClip(clip, p, gen, from, onWord, stopped);
  }
  let list = null, pick = null;
  if (p.voice) {
    list = await Promise.race([listVoices(), stopped]); if (gen !== talkGen || !list) return false;
    pick = castVoice(list, wantOf(p.voice, p.lang), { native: !!TTS, bad: badVoices });
  }
  // (the phone speaking for itself can't be a bigger or smaller person: size leans its pitch that way instead)
  const lang = [].concat(p.lang).find(langOk) || 'en-GB', pitch = clampN(p.pitch * (pick ? pick.pitch : 1) / p.size, .5, 2, 1);
  const cast = pick && pick.at >= 0 ? list[pick.at] : null;
  // a part that never reports its end (a lost callback) must not hold up the rest of the line
  let timer = null;
  const late = new Promise(res => { timer = setTimeout(res, 4000 + p.text.length * 120 / p.rate, 'late'); });
  try {
    if (TTS) {
      const o = { text: p.text, lang, pitch, rate: p.rate, volume: p.volume, category: 'ambient', queueStrategy: 0 };
      const go = opt => Promise.race([TTS.speak(opt).then(() => true, () => false), stopped, late]);
      let ok = await go(cast ? { ...o, voice: pick.at, lang: langOk(cast.lang) ? cast.lang : lang } : o);
      if (ok === false && cast && gen === talkGen) { badVoices.add(cast.voiceURI); ok = await go(o); }   // that voice isn't on this phone after all: its own voice
      return ok === true || ok === 'late';
    }
    const S = globalThis.speechSynthesis, U = globalThis.SpeechSynthesisUtterance;
    if (!S || !U) return false;
    const said = new Promise(res => {
      try {
        const u = new U(p.text); u.lang = lang; u.pitch = pitch; u.rate = p.rate; u.volume = p.volume;
        const all = S.getVoices?.() || [];
        const v = cast || all.find(x => x.lang === lang) || all.find(x => x.lang?.startsWith(lang.slice(0, 2)));
        if (v) { u.voice = v; if (cast && v.lang) u.lang = v.lang; }
        u.onend = () => res(true); u.onerror = () => res(false);
        if (typeof onWord === 'function') u.onboundary = e => { if (gen === talkGen && (!e.name || e.name === 'word')) try { onWord(from + e.charIndex); } catch { /* the game's */ } };
        S.speak(u);
      } catch { res(false); }
    });
    const ok = await Promise.race([said, stopped, late]);
    return ok === true || ok === 'late';
  } finally { clearTimeout(timer); }
}
export function say(text, { pitch = 1, rate = 1, volume = 1, lang = 'en-GB', voice = null, onWord = null, size = null, fx = null } = {}) {
  // the parts of the line: strings (or { text, pitch, rate, volume, voice, lang, size, fx }) and pauses in seconds
  const parts = []; let room = Array.isArray(text) ? 600 : 300, any = false;
  for (const raw of Array.isArray(text) ? text : [text]) {
    if (typeof raw === 'number') { if (raw > 0) parts.push(Math.min(5, raw)); continue; }
    const o = raw && typeof raw === 'object' ? raw : { text: raw };
    const t = String(o.text ?? '').replace(/\s+/g, ' ').trim().slice(0, Math.min(300, room));
    if (!t) continue;
    room -= t.length; any = true;
    const vol = clampN(o.volume ?? volume, 0, 1, 1), sz = o.size ?? size, f = o.fx ?? fx;
    parts.push({ text: t, pitch: clampN(o.pitch ?? pitch, .5, 2, 1), rate: clampN(o.rate ?? rate, .5, 2, 1), volume: vol * sound.volume, vol, voice: o.voice ?? voice, lang: o.lang ?? lang,
      size: sz == null ? 1 : clampN(sz, .6, 1.6, 1), fx: fxOf(f), shape: sz != null || (f != null && f !== false) });
  }
  stopTalking();
  if (!any || sound.muted || !sound.volume) return Promise.resolve(false);
  const gen = ++talkGen;
  talkingNow++;
  const g = channelNode('music');
  if (g) { const t = g.context.currentTime; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(g.level * .35, t, .05); }
  const done = ok => { if (gen === talkGen) { talkingNow = Math.max(0, talkingNow - 1); cancelTalk = null; if (g) setLevel(g, g.level, .4); } return ok; };
  const stopped = new Promise(res => { cancelTalk = () => res(null); });
  // a line said in parts through one radio stays keyed up between them: its static comes before the first part and after the last only
  for (let i = 0, last = null, gap = 0; i < parts.length && shapedOk !== false; i++) {
    const p = parts[i];
    if (typeof p === 'number') { gap += p; continue; }
    if (last && p.fx && gap <= 1.2 && p.voice === last.voice && p.size === last.size && JSON.stringify(p.fx) === JSON.stringify(last.fx)) { last.join = gap; p.joined = true; }
    last = p; gap = 0;
  }
  // shaped parts are written to sound one after another from now, so each is ready (or nearly) when its turn comes
  if (shapedOk !== false) { let line = Promise.resolve(); for (const p of parts) if (p.shape) p.clip = line = line.then(() => gen === talkGen ? clipFor(p, gen, stopped) : null).catch(() => null); }
  return (async () => {
    let ok = false, from = 0;
    for (const p of parts) {
      if (gen !== talkGen) return false;
      if (typeof p === 'number') { await Promise.race([new Promise(res => setTimeout(res, p * 1000)), stopped]); continue; }
      if (await sayPart(p, gen, from, onWord, stopped)) ok = true;
      from += p.text.length + 1;
    }
    return gen === talkGen ? done(ok) : false;
  })().catch(() => done(false));
}
/** Stops speaking straight away. */
export function stopTalking() {
  talkGen++;
  if (cancelTalk) { cancelTalk(); cancelTalk = null; }
  if (talkingNow) { talkingNow = 0; const g = mix?.buses.get('music'); if (g) setLevel(g, g.level, .3); }
  for (const v of live) hush(v);
  live.clear();
  try { if (rendering) Promise.resolve(RENDER.cancel()).catch(() => {}); } catch { /* none */ }
  try { if (TTS) TTS.stop(); else globalThis.speechSynthesis?.cancel(); } catch { /* none */ }
}
/** True while a line is being spoken. */
export const talking = () => talkingNow > 0;
/** Whether lines with a size or fx are being shaped: true once one has played that way, false where the phone can't (and in a browser), null before the first try. */
export const shaped = () => shapedOk;
register('speech', { stop: stopTalking, pause: stopTalking });
