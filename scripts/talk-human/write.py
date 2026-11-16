# Writes src/kit/voice-human.js from tune.py's results ($WORK/tuned/*.json).
#   python scripts/talk-human/write.py
import json, glob, numpy as np
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import WORK, ROOT
REF = json.load(open(f'{WORK}/ref.json'))['sum']
rows = {}
for f in sorted(glob.glob(f'{WORK}/tuned/*.json')):
    r = json.load(open(f)); p = r['params']; v = r['voice']
    own = REF.get(v); share = min(1, max(.3, (own['npause'] if own else .4) / .36))
    rows[v] = dict(wide=p['wide'], drift=p['drift'], jitter=p['jitter'], fall=p['fall'], shimmer=p['shimmer'], endJitter=p['endJitter'],
                   creak=p['creak'], breathy=0, lengthen=p['lengthen'], tone=0, tempo=p['tempo'], pause=share)
KEYS = ['wide', 'drift', 'jitter', 'fall', 'shimmer', 'endJitter', 'creak', 'breathy', 'lengthen', 'tone', 'tempo', 'pause']
RND = dict(wide=2, drift=4, jitter=4, fall=2, shimmer=3, endJitter=2, creak=2, breathy=3, lengthen=2, tone=4, tempo=2, pause=2)
med = {k: round(float(np.median([r[k] for r in rows.values()])), RND[k]) if rows else None for k in KEYS}
if not rows: med = dict(wide=1.6, drift=.014, jitter=.0022, fall=0, shimmer=0, endJitter=0, creak=0, breathy=0, lengthen=1, tone=0, tempo=1, pause=1)
fmt = lambda d: '[' + ', '.join(str(round(d[k], RND[k])) for k in KEYS) + ']'
body = ',\n'.join(f'  {v}: {fmt(r)}' for v, r in rows.items())
js = f"""// How each built-in voice is made more like the real person it came from (voice-pitch.js humanize(), in talk-worker.js):
// tuned per voice (scripts/talk-human/README.md says how) so its sound matches its own speaker's real recordings: 48 of their
// sentences for the VCTK voices, the recordings it was cloned from for the rest (with the other speakers of its kind
// making up for a short one). The quality guard: a speech-quality model may score it no lower than the real speaker.
// Each: {', '.join(KEYS)}
// (tempo: its pace against the model's; pause: the share of commas it pauses at.)
const KEYS = {json.dumps(KEYS).replace('"', "'")};
const FIT = {{
{body}
}};
/** The settings in the middle of all the voices, for a voice not tuned. */
const MIDDLE = {fmt(med)};
const of = name => {{ const v = FIT[name] || MIDDLE; const o = {{ rise: 3 }}; KEYS.forEach((k, i) => {{ o[k] = v[i]; }}); return o; }};
// How a mood moves them: measured in CREMA-D, each of its ten clearest actors acting a mood against the same actor's calm
// reading (median over 110 pairs), at the share the moods are acted at (0.6). Anger and joy are clearer (less jitter at
// the ends, less creak); sadness is less steady; fear, joy and sadness fall further at the end. (Breath isn't added:
// as noise it was heard as hiss.)
// Each: [times, plus].
const MOOD = {{
  angry: {{ jitter: [.93, 0], shimmer: [.94, 0], endJitter: [.75, 0], creak: [.85, 0], breathy: [.8, 0] }},
  happy: {{ endJitter: [.8, 0], creak: [.94, 0], breathy: [.75, 0], fall: [1, 1.1] }},
  scared: {{ jitter: [1.04, 0], endJitter: [.9, 0], creak: [.9, 0], breathy: [.7, 0], fall: [1, .5] }},
  sad: {{ jitter: [1.1, 0], shimmer: [1.04, 0], fall: [1, .9] }},
}};
/** A voice's settings: 'anna', 'anna~sad' (in a mood), 'anna+vera' (a voice between two: halfway between theirs). */
export function humanOf(name) {{
  const [base, mood] = String(name || '').split('~'), [a, b] = base.split('+');
  const x = of(a), y = b ? of(b) : x, o = {{}};
  for (const k in x) o[k] = (x[k] + y[k]) / 2;
  for (const [k, [t, p]] of Object.entries(MOOD[mood] || {{}})) o[k] = o[k] * t + p;
  return o;
}}
"""
open(os.path.join(ROOT, 'src/kit/voice-human.js'), 'w').write(js)
print(len(rows), 'voices', med)
