# Speech features for matching a voice to a real speaker (Praat, through parselmouth): feats(a, sr) -> dict, summary(rows)
import numpy as np, parselmouth, soundfile as sf
from parselmouth.praat import call
def load(f):
    if f.endswith('.24k'): return np.fromfile(f, np.float32), 24000
    if f.endswith('.f32'): return np.fromfile(f, np.float32), 44100
    a, sr = sf.read(f, dtype='float32'); return (a.mean(1) if a.ndim > 1 else a), sr
def feats(a, sr):
    snd = parselmouth.Sound(a.astype(np.float64), sr)
    pit = snd.to_pitch_ac(time_step=.01, pitch_floor=60, pitch_ceiling=450, voicing_threshold=.45)
    f0 = pit.selected_array['frequency']; t = pit.xs()
    inten = snd.to_intensity(minimum_pitch=75, time_step=.01); I = inten.values[0]; ti = inten.xs()
    top = np.percentile(I, 95); sp = I > top - 25
    if sp.sum() < 10 or (f0 > 0).sum() < 20: return None
    on = ti[sp][0]; off = ti[sp][-1]
    v = f0 > 0; med = np.median(f0[v]); st = 12 * np.log2(f0[v] / med)
    # frame-to-frame movement within voiced runs
    d = [abs(12*np.log2(f0[i]/f0[i-1])) for i in range(1, len(f0)) if v[i] and v[i-1]]
    # pauses inside the speech (quiet for 100 ms+)
    q = ~sp; pauses = []; i0 = None
    for k, (tt, qq) in enumerate(zip(ti, q)):
        if on < tt < off and qq and i0 is None: i0 = tt
        if (not qq or tt >= off) and i0 is not None:
            if tt - i0 >= .1: pauses.append(tt - i0)
            i0 = None
    speech = off - on - sum(pauses)
    # syllable nuclei: intensity peaks > 2 dB over the dip before, voiced, within the speech
    pk = []
    for k in range(1, len(I) - 1):
        if sp[k] and I[k] >= I[k-1] and I[k] > I[k+1]:
            tt = ti[k]; fv = pit.get_value_at_time(tt)
            if fv == fv and fv > 0 and (not pk or tt - pk[-1][0] > .08): pk.append((tt, I[k]))
    # keep peaks with a dip of 2 dB between them
    nuc = []
    for tt, ii in pk:
        if nuc:
            seg = I[(ti > nuc[-1][0]) & (ti < tt)]
            if len(seg) and min(seg) > min(ii, nuc[-1][1]) - 2:
                if ii > nuc[-1][1]: nuc[-1] = (tt, ii)
                continue
        nuc.append((tt, ii))
    rate = len(nuc) / max(.1, speech)
    # the final stretch: last 25% of voiced frames (pitch fall), last 250 ms of voice (voice quality)
    vt = t[v]; lastv = vt[-1]
    fin = vt > lastv - .3; fall = np.median(st[fin]) - np.median(st)
    # final lengthening: the last syllable's distance vs the median syllable gap
    gaps = np.diff([n[0] for n in nuc]); lastgap = (off - nuc[-1][0]) if nuc else 0
    lengthen = lastgap / np.median(gaps) if len(gaps) > 2 else 1
    pp = call(snd, 'To PointProcess (periodic, cc)', 60, 450)
    def vq(t0, t1):
        j = call(pp, 'Get jitter (local)', t0, t1, .0001, .02, 1.3)
        s = call([snd, pp], 'Get shimmer (local)', t0, t1, .0001, .02, 1.3, 1.6)
        return j, s
    jit, shim = vq(on, off); jitE, shimE = vq(max(on, lastv - .25), lastv + .01)
    harm = snd.to_harmonicity_cc(.01, 75, .1, 1.0); H = harm.values[0]; th = harm.xs()
    hnr = np.mean(H[H > -100]) if (H > -100).any() else 0
    he = H[(th > lastv - .25) & (H > -100)]; hnrE = np.mean(he) if len(he) else hnr
    # voiced frames dropping out near the end (creak, breath): share of unvoiced frames in the last 250 ms of sound
    endq = (t > off - .25) & (t < off); unv = 1 - v[endq].mean() if endq.any() else 0
    return dict(med=med, sd=st.std(), rng=np.percentile(st, 95) - np.percentile(st, 5), micro=float(np.median(d)) if d else 0,
                fall=fall, rate=rate, pause=sum(pauses) / max(.1, off - on), npause=len(pauses) / max(.1, speech), lengthen=lengthen,
                jit=jit, shim=shim, jitE=jitE, shimE=shimE, hnr=hnr, hnrE=hnrE, unvE=unv, dur=off - on)
KEYS = ['med','sd','rng','micro','fall','rate','pause','npause','lengthen','jit','shim','jitE','shimE','hnr','hnrE','unvE','dur']
def summary(rows):
    rows = [r for r in rows if r]; out = {}
    for k in KEYS:
        x = np.array([r[k] for r in rows], float); x = x[np.isfinite(x)]
        out[k] = float(np.median(x)) if len(x) else float('nan')
    out['n'] = len(rows); return out
if __name__ == '__main__':
    import sys, json, glob
    for d in sys.argv[1:]:
        fs = sorted(glob.glob(d + '/*'))
        fs = [f for f in fs if f.split('.')[-1] in ('flac', 'wav', '24k', 'f32')]
        print(d, json.dumps({k: round(v, 3) for k, v in summary([feats(*load(f)) for f in fs]).items()}))
