// How each built-in voice is made more like the real person it came from (voice-pitch.js humanize(), in talk-worker.js):
// tuned per voice (scripts/talk-human/README.md says how) so its sound matches its own speaker's real recordings: 48 of their
// sentences for the VCTK voices, the recordings it was cloned from for the rest (with the other speakers of its kind
// making up for a short one). The quality guard: a speech-quality model may score it no lower than the real speaker.
// Each: wide, drift, jitter, fall, shimmer, endJitter, breathy, lengthen, tone, tempo, pause
// (tempo: its pace against the model's; pause: the share of commas it pauses at.)
const KEYS = ['wide', 'drift', 'jitter', 'fall', 'shimmer', 'endJitter', 'breathy', 'lengthen', 'tone', 'tempo', 'pause'];
const FIT = {
  alba: [1.3, 0.014, 0.0037, 1.0, 0.05, 1.04, 0.13, 1.05, 0.003, 0.9, 1],
  angus: [1.3, 0.0215, 0.0022, 1.76, 0.05, 0.56, 0.25, 1.27, 0.003, 0.97, 0.93],
  anna: [1.52, 0.0093, 0.0004, 1.24, 0.062, 0.24, 0.0, 1.0, 0.003, 0.84, 1],
  arjun: [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.003, 1.0, 1],
  azelma: [1.35, 0.0075, 0.0015, 0.48, 0.03, 0.48, 0.0, 1.0, 0.003, 0.87, 1],
  bill_boerst: [1.47, 0.0251, 0.0022, 1.0, 0.065, 1.56, 0.19, 1.04, 0.003, 0.92, 0.3],
  bronwen: [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.003, 1.0, 1],
  caro_davy: [1.3, 0.0179, 0.0022, 1.0, 0.05, 2.28, 0.25, 1.0, 0.003, 0.96, 0.53],
  charles: [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.003, 1.0, 0.88],
  conor: [1.65, 0.014, 0.0, 2.24, 0.05, 1.8, 0.25, 1.16, 0.003, 0.84, 1],
  daan: [1.3, 0.014, 0.0041, 1.0, 0.05, 1.04, 0.43, 1.12, 0.003, 0.85, 1],
  declan: [1.6, 0.0057, 0.0008, 1.72, 0.092, 0.48, 0.0, 1.07, 0.003, 0.84, 0.3],
  eponine: [1.65, 0.0065, 0.0037, 1.0, 0.05, 0.56, 0.25, 1.12, 0.003, 0.84, 0.65],
  estelle: [1.6, 0.0111, 0.0, 1.48, 0.062, 0.0, 0.0, 1.0, 0.003, 0.84, 0.57],
  eve: [1.3, 0.014, 0.0018, 0.0, 0.05, 1.56, 0.25, 1.12, 0.003, 0.88, 1],
  fantine: [1.52, 0.0, 0.0011, 0.52, 0.048, 0.24, 0.12, 1.0, 0.003, 1.01, 1],
  frank: [1.6, 0.0039, 0.0007, 1.0, 0.062, 0.24, 0.0, 1.0, 0.003, 0.84, 0.96],
  george: [1.3, 0.0158, 0.0022, 1.0, 0.08, 0.56, 0.12, 1.19, 0.003, 0.91, 1],
  giovanni: [1.17, 0.0075, 0.0004, 0.0, 0.062, 0.24, 0.0, 1.0, 0.003, 0.91, 1],
  hank: [1.65, 0.0197, 0.0048, 2.0, 0.05, 2.04, 0.25, 1.12, 0.003, 0.86, 0.65],
  harry: [1.35, 0.0111, 0.0, 0.0, 0.048, 0.0, 0.06, 1.0, 0.003, 0.87, 1],
  jack: [1.25, 0.0179, 0.0037, 2.0, 0.065, 2.52, 0.19, 1.19, 0.003, 0.84, 0.88],
  jane: [1.27, 0.0, 0.0011, 0.24, 0.048, 0.24, 0.06, 1.0, 0.003, 0.99, 1],
  javert: [1.0, 0.0215, 0.0022, 1.24, 0.05, 1.56, 0.07, 1.19, 0.003, 0.97, 0.3],
  june: [1.27, 0.0039, 0.0, 0.0, 0.062, 0.0, 0.0, 1.07, 0.003, 0.94, 1],
  kiri: [1.52, 0.0075, 0.0007, 0.0, 0.062, 0.48, 0.06, 1.0, 0.003, 0.9, 1],
  lola: [1.52, 0.0111, 0.0022, 1.24, 0.077, 1.0, 0.0, 1.0, 0.003, 0.86, 0.94],
  luc: [1.25, 0.0197, 0.0037, 0.0, 0.035, 0.0, 0.43, 1.0, 0.003, 1.0, 1],
  lucy: [1.35, 0.0036, 0.0008, 0.0, 0.062, 1.24, 0.0, 1.0, 0.003, 0.86, 1],
  marius: [1.0, 0.0039, 0.0, 0.0, 0.03, 0.0, 0.0, 1.04, 0.003, 0.84, 0.47],
  mary: [1.18, 0.0036, 0.0004, 1.48, 0.048, 0.24, 0.0, 1.19, 0.003, 1.04, 0.68],
  michael: [1.73, 0.0233, 0.0022, 2.0, 0.065, 0.48, 0.06, 1.12, 0.003, 0.97, 1],
  niamh: [1.52, 0.0, 0.0007, 1.72, 0.062, 0.24, 0.12, 1.0, 0.003, 0.89, 1],
  oliver: [1.0, 0.0, 0.0022, 0.0, 0.062, 0.52, 0.0, 1.0, 0.003, 0.92, 0.46],
  orla: [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.003, 1.0, 0.94],
  paul: [1.48, 0.014, 0.0037, 2.0, 0.035, 0.72, 0.25, 1.08, 0.003, 0.94, 0.42],
  peter_yearsley: [1.0, 0.0, 0.0, 0.0, 0.015, 0.0, 0.0, 1.0, 0.003, 0.9, 1],
  pieter: [1.35, 0.0018, 0.0004, 0.48, 0.077, 0.24, 0.0, 1.0, 0.003, 0.84, 0.35],
  priya: [1.0, 0.0, 0.0026, 1.48, 0.045, 0.24, 0.0, 1.0, 0.003, 1.0, 1],
  ruth: [1.18, 0.0039, 0.0015, 1.0, 0.048, 0.0, 0.12, 1.0, 0.003, 1.04, 0.67],
  sam: [1.3, 0.0158, 0.0041, 2.0, 0.05, 2.04, 0.37, 1.0, 0.003, 0.93, 0.3],
  stuart_bell: [1.0, 0.0036, 0.0015, 0.0, 0.062, 1.48, 0.0, 1.0, 0.003, 1.04, 0.82],
  thandi: [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.003, 1.0, 1],
  vera: [1.0, 0.0129, 0.0004, 0.24, 0.033, 0.24, 0.18, 1.0, 0.003, 1.0, 1],
  walt: [1.65, 0.0251, 0.0022, 1.0, 0.05, 2.52, 0.25, 1.0, 0.003, 0.97, 0.45]
};
/** The settings in the middle of all the voices, for a voice not tuned. */
const MIDDLE = [1.3, 0.0075, 0.0011, 1.0, 0.05, 0.48, 0.06, 1.0, 0.003, 0.92, 1.0];
const of = name => { const v = FIT[name] || MIDDLE; const o = { rise: 3 }; KEYS.forEach((k, i) => { o[k] = v[i]; }); return o; };
// How a mood moves them: measured in CREMA-D, each of its ten clearest actors acting a mood against the same actor's calm
// reading (median over 110 pairs), at the share the moods are acted at (0.6). Anger and joy are clearer (less jitter at
// the ends, less air in the voice); sadness is less steady; fear, joy and sadness fall further at the end.
// Each: [times, plus].
const MOOD = {
  angry: { jitter: [.93, 0], shimmer: [.94, 0], endJitter: [.75, 0], breathy: [.8, 0] },
  happy: { endJitter: [.8, 0], breathy: [.75, 0], fall: [1, 1.1] },
  scared: { jitter: [1.04, 0], endJitter: [.9, 0], breathy: [.7, 0], fall: [1, .5] },
  sad: { jitter: [1.1, 0], shimmer: [1.04, 0], fall: [1, .9] },
};
/** A voice's settings: 'anna', 'anna~sad' (in a mood), 'anna+vera' (a voice between two: halfway between theirs). */
export function humanOf(name) {
  const [base, mood] = String(name || '').split('~'), [a, b] = base.split('+');
  const x = of(a), y = b ? of(b) : x, o = {};
  for (const k in x) o[k] = (x[k] + y[k]) / 2;
  for (const [k, [t, p]] of Object.entries(MOOD[mood] || {})) o[k] = o[k] * t + p;
  return o;
}
