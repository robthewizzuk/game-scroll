# Tunes humanize() per voice so it sounds like its own real speaker. The cost: how far the voice's features (feat.py,
# over 8 of its takes) are from its speaker's (refs.py), each in units of how much VCTK's speakers differ from each other,
# weighted; plus a speech-quality floor (UTMOS may go no lower than the real speaker's own score, or 0.35 under the
# voice as the model speaks it, whichever is higher: the model scores real people lower than clean speech, so it guards
# against harm, not against sounding human). Pace is set straight from the measured syllable rate (slowing costs no
# quality), kept between 0.84 and 1.08 so lines never drag or rush; then each setting in turn takes a step either way
# and keeps it where the cost falls, the steps shrinking each sweep (50 to 70 tries a voice: about 3 minutes). A voice
# that comes out no nearer its speaker than the model's own take is left as the model says it.
#   python scripts/talk-human/tune.py [voice,voice...]      writes $WORK/tuned/<voice>.json; then write.py
import os, sys, json, glob, shutil, subprocess, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from multiprocessing import Pool
from common import WORK, ROOT, VOICES, KIND, mos
from feat import feats, load, summary
REF = json.load(open(f'{WORK}/ref.json'))['sum']; REFMOS = json.load(open(f'{WORK}/refmos.json'))
KEYS = ['sd', 'rng', 'micro', 'fall', 'rate', 'lengthen', 'jit', 'shim', 'jitE', 'shimE', 'hnr', 'hnrE', 'unvE']
W = dict(sd=2, rng=1, micro=1, fall=1.5, rate=1.5, lengthen=.7, jit=1, shim=1, jitE=.7, shimE=.7, hnr=1.5, hnrE=1, unvE=.3)
VCTK = [n for n, c in VOICES if 'speaker p' in c and REF.get(n) and REF[n]['n'] > 20]
SCALE = {k: max(1e-3, float(np.std([REF[n][k] for n in VCTK]))) for k in KEYS}
# humanize()'s settings tuned, each with its range (voice-pitch.js says what each does)
# (breathy: air through the voice, gated by its own cycle and as loud as its own top end; added as plain hiss on top it
# was heard as noise. The room under it all is the same quiet one for every voice, TONE: low, about 50 dB down.)
P = [('wide', 1, 2.4), ('drift', 0, .03), ('jitter', 0, .006), ('fall', 0, 4), ('shimmer', 0, .25), ('endJitter', 0, 4),
     ('breathy', 0, 1), ('lengthen', 1, 1.6)]
TONE = .003
def unpack(u): return {**{n: lo + (hi - lo) * float(np.clip(x, 0, 1)) for (n, lo, hi), x in zip(P, u)}, 'tone': TONE}
def target(v):
    """Its own speaker's features; a speaker with few recordings is drawn toward the middle of the speakers of its kind."""
    own = REF.get(v); n = own['n'] if own else 0
    pool = [x for x in VCTK if KIND[x] == KIND.get(v, 'woman')] or VCTK
    mid = {k: float(np.median([REF[x][k] for x in pool])) for k in KEYS}
    return {k: own[k] if n >= 20 else (n * own[k] + 8 * mid[k]) / (n + 8) if own else mid[k] for k in KEYS}
def _f(f): return feats(*load(f))
def _m(f): return mos(*load(f))
def main(v, N=8):
    hv = subprocess.Popen(['node', os.path.join(os.path.dirname(__file__), 'server.mjs')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
    out = f'{WORK}/tmp-{v}'; pool = Pool(2); tgt = target(v)
    def run(p, tempo):
        hv.stdin.write(json.dumps({'voice': v, 'p': p, 'tempo': tempo, 'out': out, 'n': N}) + '\n'); hv.stdin.flush(); hv.stdout.readline()
        fs = sorted(glob.glob(out + '/*.24k'))
        return summary(pool.map(_f, fs)), float(np.mean(pool.map(_m, fs[:3])))
    r0, m0 = run(None, 1)
    floor = max(REFMOS.get(v) or 3.9, m0 - .35)
    TEMPO = float(np.clip(tgt['rate'] / r0['rate'], .84, 1.08))
    feat = lambda r: sum(W[k] * ((r[k] - tgt[k]) / SCALE[k]) ** 2 for k in KEYS) / sum(W.values())
    tries = [0]
    def cost(u):
        tries[0] += 1; r, m = run(unpack(u), TEMPO)
        return feat(r) + 800 * max(0, floor - m) ** 2, r, m
    x = np.array([(1.3 - 1) / 1.4, .014 / .03, .0022 / .006, .25, .2, .2, .25, .2]); best = cost(x)
    z = np.zeros(len(P)); c = cost(z)   # (or from nothing added, where that is nearer)
    if c[0] < best[0]: best, x = c, z
    for d in (.25, .12, .06):
        for i in range(len(x)):
            for s in (+1, -1):
                y = x.copy(); y[i] = np.clip(y[i] + s * d, 0, 1)
                if y[i] == x[i]: continue
                c = cost(y)
                if c[0] < best[0]: best, x = c, y; break   # (that way helped: the other isn't tried)
    c, r, m = best
    if c >= feat(r0): x, TEMPO, c, r, m = np.zeros(len(P)), 1., feat(r0), r0, m0   # no nearer than as the model says it: left so
    res = dict(voice=v, floor=floor, realmos=REFMOS.get(v), params={**unpack(x), 'tempo': TEMPO}, cost=c, mos=m, mos0=m0, raw=r0, got=r, target=tgt, cost0=feat(r0), tries=tries[0])
    os.makedirs(f'{WORK}/tuned', exist_ok=True); json.dump(res, open(f'{WORK}/tuned/{v}.json', 'w'), indent=1)
    print(v, 'cost %.2f -> %.2f' % (res['cost0'], c), 'quality %.2f -> %.2f' % (m0, m), {k: round(q, 3) for k, q in res['params'].items()}, flush=True)
    hv.kill(); pool.close(); shutil.rmtree(out, ignore_errors=True)
if __name__ == '__main__':
    for v in (sys.argv[1].split(',') if len(sys.argv) > 1 else [n for n, _ in VOICES]): main(v)
