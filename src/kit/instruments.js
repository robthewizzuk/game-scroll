// Instruments for music(): sets of voices that sound like a band, a synth group or an orchestra, and
// drum kits to go with them, all made in code with Tone.js synths (no sound files). The 'chip' set is
// music()'s own square and triangle waves and needs none of this.
//
//   music({ set: 'band', tempo: 120, lead: 'C5 . E5 . G5 . E5 .', bass: 'C3 . . . G2 . . .', drums: 'k . h . s . h .' })
//   music({ ...compose({ mood: 'heroic', seed: 'my-game' }), set: 'orchestra' })
//   music({ set: 'synth', voices: { lead: 'bell', drums: 'kit' }, ... })      // swap single parts
//   const piano = gs.sound.instrument('epiano');  piano.play('C4', { len: .4 });   // one voice to play yourself
//
// Tone.js loads the first time a tune asks for a set (the tune plays in the chip sound until it's in).
// Kit use only: games reach this through gs.sound.

/** Which voice plays each part in a set. */
export const SETS = {
  chip: null,
  synth: { lead: 'saw', bass: 'sub', pad: 'warm', arp: 'pulse', drums: '808' },
  band: { lead: 'epiano', bass: 'bassguitar', pad: 'organ', arp: 'pick', drums: 'kit' },
  orchestra: { lead: 'flute', bass: 'cello', pad: 'strings', arp: 'harp', drums: 'concert' },
};

// Each voice: the Tone synth it is, its settings, how loud (dB; set so a whole tune comes out at about the
// level it has in the chip sound: scripts/sound-test.cjs measures it), and extras: lp (a low-pass filter
// after it, Hz), vibrato [Hz, cents].
const env = (attack, decay, sustain, release) => ({ attack, decay, sustain, release });
export const VOICES = {
  // synth group
  saw: { synth: 'MonoSynth', db: -33, o: { oscillator: { type: 'fatsawtooth', count: 3, spread: 22 }, filter: { Q: 1.5, type: 'lowpass', rolloff: -24 }, envelope: env(.01, .12, .55, .2), filterEnvelope: { ...env(.01, .2, .45, .3), baseFrequency: 500, octaves: 3 } } },
  sub: { synth: 'MonoSynth', db: -38, o: { oscillator: { type: 'square' }, filter: { Q: 2, type: 'lowpass', rolloff: -24 }, envelope: env(.005, .2, .6, .12), filterEnvelope: { ...env(.005, .15, .3, .2), baseFrequency: 80, octaves: 3 } } },
  warm: { synth: 'Synth', db: -35, lp: 1400, o: { oscillator: { type: 'fatsawtooth', count: 3, spread: 28 }, envelope: env(.22, .3, .7, .5) } },
  pulse: { synth: 'Synth', db: -34, o: { oscillator: { type: 'pulse', width: .3 }, envelope: env(.003, .12, .15, .1) } },
  // band
  epiano: { synth: 'FMSynth', db: -23, o: { harmonicity: 2, modulationIndex: 3.5, oscillator: { type: 'sine' }, envelope: env(.004, 1.1, .08, .4), modulation: { type: 'sine' }, modulationEnvelope: env(.002, .35, .15, .3) } },
  bassguitar: { synth: 'MonoSynth', db: -32, o: { oscillator: { type: 'fmsquare5', modulationType: 'triangle', modulationIndex: 2, harmonicity: .501 }, filter: { Q: 1, type: 'lowpass', rolloff: -24 }, envelope: env(.01, .1, .4, .3), filterEnvelope: { ...env(.01, .1, .8, .4), baseFrequency: 50, octaves: 4.4 } } },
  organ: { synth: 'Synth', db: -42, o: { oscillator: { type: 'custom', partials: [1, .7, .45, 0, .3, 0, 0, .2] }, envelope: env(.02, .05, .9, .12) } },
  pick: { synth: 'MonoSynth', db: -35.5, o: { oscillator: { type: 'sawtooth' }, filter: { Q: 1, type: 'lowpass', rolloff: -12 }, envelope: env(.002, .5, 0, .3), filterEnvelope: { ...env(.001, .18, .1, .2), baseFrequency: 300, octaves: 3.5 } } },
  // orchestra
  flute: { synth: 'Synth', db: -40.5, vibrato: [5.2, 14], o: { oscillator: { type: 'custom', partials: [1, .35, .08] }, envelope: env(.06, .1, .85, .16) } },
  cello: { synth: 'MonoSynth', db: -33, o: { oscillator: { type: 'sawtooth' }, filter: { Q: .8, type: 'lowpass', rolloff: -24 }, envelope: env(.05, .2, .7, .25), filterEnvelope: { ...env(.05, .3, .5, .4), baseFrequency: 180, octaves: 2.2 } } },
  strings: { synth: 'Synth', db: -36, lp: 2200, o: { oscillator: { type: 'fatsawtooth', count: 3, spread: 18 }, envelope: env(.18, .2, .8, .45) } },
  harp: { synth: 'Synth', db: -35, o: { oscillator: { type: 'custom', partials: [1, .4, .15, .05] }, envelope: env(.002, .9, 0, .9) } },
  // more, for voices: { lead: '...' } and instrument()
  brass: { synth: 'MonoSynth', db: -40, o: { oscillator: { type: 'sawtooth' }, filter: { Q: 2, type: 'lowpass', rolloff: -24 }, envelope: env(.04, .1, .8, .15), filterEnvelope: { ...env(.07, .2, .6, .2), baseFrequency: 300, octaves: 2.8 } } },
  bell: { synth: 'FMSynth', db: -25, o: { harmonicity: 5.07, modulationIndex: 6, oscillator: { type: 'sine' }, envelope: env(.001, 1.4, 0, 1.4), modulation: { type: 'sine' }, modulationEnvelope: env(.001, .4, 0, .4) } },
  kalimba: { synth: 'FMSynth', db: -24.5, o: { harmonicity: 8, modulationIndex: 2, oscillator: { type: 'sine' }, envelope: env(.001, 2, .1, 2), modulation: { type: 'square' }, modulationEnvelope: env(.002, .2, 0, .2) } },
  marimba: { synth: 'Synth', db: -32, o: { oscillator: { type: 'custom', partials: [1, 0, .5, 0, .33] }, envelope: env(.001, 1.2, 0, 1.2) } },
  steelpan: { synth: 'Synth', db: -25.5, o: { oscillator: { type: 'fatcustom', partials: [.2, 1, 0, .5, .1], spread: 40, count: 3 }, envelope: env(.001, 1.6, 0, 1.6) } },
};

// Drum kits: k kick, s snare, h hi-hat, c crash. Each drum: a drum skin (hz it rings at, how far the
// pitch drops, how long) or filtered noise (filter type and Hz, how long), and how loud (dB).
export const KITS = {
  kit: {
    k: { skin: 52, octaves: 5, drop: .03, decay: .24, db: -20 },
    s: { noise: 'white', filter: ['bandpass', 1900, .6], decay: .16, db: -22, body: [190, .07, -28] },
    h: { noise: 'white', filter: ['highpass', 7000, .7], decay: .04, db: -27 },
    c: { noise: 'white', filter: ['highpass', 5000, .7], decay: .9, db: -27 },
  },
  808: {
    k: { skin: 46, octaves: 6, drop: .08, decay: .38, db: -20.5 },
    s: { noise: 'pink', filter: ['bandpass', 1300, .5], decay: .2, db: -19, body: [170, .1, -26] },
    h: { noise: 'white', filter: ['highpass', 9000, .7], decay: .03, db: -28 },
    c: { noise: 'white', filter: ['highpass', 6500, .7], decay: .6, db: -28 },
  },
  concert: {
    k: { skin: 82, octaves: 1.5, drop: .012, decay: .5, db: -21 },                       // a timpani
    s: { noise: 'white', filter: ['bandpass', 2600, .8], decay: .12, db: -19 },         // a snare drum
    h: { noise: 'white', filter: ['bandpass', 6000, 1.2], decay: .03, db: -24 },        // a shaker
    c: { noise: 'white', filter: ['highpass', 4000, .7], decay: 1.4, db: -28.5 },         // a cymbal
  },
};

/** The voice a part plays in a set: voiceFor('band', 'lead') -> 'epiano' (null: the chip sound). */
export function voiceFor(set, part, voices = null) {
  const own = voices && (voices[part] ?? voices[part.replace(/\d+$/, '')]);
  if (own === 'chip') return null;
  const role = part.replace(/\d+$/, ''), name = own || (SETS[set] && SETS[set][role]) || null;
  if (!name) return null;
  return (role === 'drums' ? KITS : VOICES)[name] ? name : null;
}

/**
 * One voice, playing into `out` (an audio node). play(note, seconds, when, level): when is the audio
 * clock's time, level 0..1. dispose() frees it.
 */
export function makeVoice(T, name, out) {
  const v = VOICES[name]; if (!v) return null;
  // (the volume goes in as it's made: set afterwards, Tone.js changes it a tenth of a second later, and a
  // note played before then comes out at full blast)
  const s = new T[v.synth]({ ...v.o, volume: v.db }), parts = [s];
  let last = s;
  if (v.lp) { const f = new T.Filter(v.lp, 'lowpass'); s.connect(f); parts.push(f); last = f; }
  if (v.vibrato && s.detune) { const l = new T.LFO(v.vibrato[0], -v.vibrato[1], v.vibrato[1]); l.connect(s.detune); l.start(); parts.push(l); }
  last.connect(out);
  let prev = 0;
  return {
    name,
    play(note, len, when, lv = 1) {
      // (a synth takes its notes in order: one written for an earlier moment than the last is left out)
      if (when <= prev) return; prev = when;
      s.triggerAttackRelease(note, Math.max(.02, len), when, Math.max(0, Math.min(1, lv)));
    },
    /** Plays into another node from now on (a finished tune's instrument taken up by the next). */
    route(o) { try { last.disconnect(); } catch { /* not connected */ } if (o) last.connect(o); prev = 0; },
    /** Lets go of a held note at `when`. */
    hush(when) { try { s.triggerRelease(when); } catch { /* nothing held */ } },
    dispose() { for (const p of parts) try { p.dispose(); } catch { /* gone */ } },
  };
}

/** A drum kit playing into `out`. hit('k' | 's' | 'h' | 'c', when, level). */
export function makeKit(T, name, out) {
  const kit = KITS[name]; if (!kit) return null;
  const parts = [], drums = {}, outs = [], synths = [];
  for (const [k, d] of Object.entries(kit)) {
    if (d.skin) {
      const m = new T.MembraneSynth({ volume: d.db, pitchDecay: d.drop, octaves: d.octaves, oscillator: { type: 'sine' }, envelope: { attack: .001, decay: d.decay, sustain: 0, release: .08 } });
      m.connect(out); parts.push(m); outs.push(m); synths.push(m);
      drums[k] = { prev: 0, hit(when, lv) { m.triggerAttackRelease(d.skin, d.decay, when, lv); } };
    } else {
      const n = new T.NoiseSynth({ volume: d.db, noise: { type: d.noise }, envelope: { attack: .001, decay: d.decay, sustain: 0, release: .03 } }), f = new T.Filter({ type: d.filter[0], frequency: d.filter[1], Q: d.filter[2] });
      n.connect(f); f.connect(out); parts.push(n, f); outs.push(f); synths.push(n);
      let body = null;
      if (d.body) { body = new T.Synth({ volume: d.body[2], oscillator: { type: 'sine' }, envelope: { attack: .001, decay: d.body[1], sustain: 0, release: .03 } }); body.connect(out); parts.push(body); outs.push(body); synths.push(body); }
      drums[k] = { prev: 0, hit(when, lv) { n.triggerAttackRelease(d.decay, when, lv); if (body) body.triggerAttackRelease(d.body[0], d.body[1], when, lv); } };
    }
  }
  return {
    name,
    hit(k, when, lv = 1) { const d = drums[k]; if (!d || when <= d.prev + .01) return; d.prev = when; d.hit(when, Math.max(0, Math.min(1, lv))); },
    route(o) { for (const x of outs) { try { x.disconnect(); } catch { /* not connected */ } if (o) x.connect(o); } for (const d of Object.values(drums)) d.prev = 0; },
    hush(when) { for (const x of synths) try { x.triggerRelease(when); } catch { /* nothing held */ } },
    dispose() { for (const p of parts) try { p.dispose(); } catch { /* gone */ } },
  };
}
