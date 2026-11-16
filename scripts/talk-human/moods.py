# How a mood moves a voice, measured in CREMA-D (Open Database License; the clips are only measured, never shipped):
# the ten actors whose moods listeners named best (1006 1028 1038 1039 1058 1059 1064 1069 1079 1089, from its
# tabulated votes), each mood against the same actor's calm (neutral) reading of the same sentences.
#   python scripts/talk-human/moods.py
# prints pitch (semitones), pitch range (x), pace (x) and loudness (dB): scripts/talk-voices/prompt.py MOODS; and the
# voice's steadiness and breath (jitter, shimmer, noise, creaky ends): MOOD in write.py.
import os, sys, glob, json, collections, subprocess, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from concurrent.futures import ProcessPoolExecutor
from common import WORK
from feat import feats, load
ACTORS = [1006, 1028, 1038, 1039, 1058, 1059, 1064, 1069, 1079, 1089]
SENTENCES = 'DFA IEO IOM ITH ITS IWL IWW MTI TAI TIE TSI WSI'.split()
URL = 'https://media.githubusercontent.com/media/CheyneyComputerScience/CREMA-D/master/AudioWAV/'
D = f'{WORK}/crema'
def fetch():
    os.makedirs(D, exist_ok=True)
    for a in ACTORS:
        for s in SENTENCES:
            for e in ['ANG', 'DIS', 'FEA', 'HAP', 'NEU', 'SAD']:
                for lv in (['LO', 'MD', 'HI'] if s == 'IEO' and e != 'NEU' else ['XX']):
                    f = f'{a}_{s}_{e}_{lv}'
                    if not os.path.exists(f'{D}/{f}.wav'): subprocess.run(['curl', '-sSfL', '-m', '60', '-o', f'{D}/{f}.wav', URL + f + '.wav'])
def loud(a):
    fr = a[:len(a) // 320 * 320].reshape(-1, 320); return 20 * np.log10(np.percentile(np.sqrt((fr ** 2).mean(1)), 90) + 1e-9)
def one(f):
    try: a, sr = load(f); x = feats(a, sr)
    except Exception: return f, None
    return f, x and {**x, 'st': 12 * np.log2(x['med']), 'db': loud(a)}
if __name__ == '__main__':
    fetch()
    with ProcessPoolExecutor(3) as ex: R = dict(ex.map(one, sorted(glob.glob(D + '/*.wav')), chunksize=8))
    by = collections.defaultdict(lambda: collections.defaultdict(list))
    for f, x in R.items():
        if x: a, s, e, lv = os.path.basename(f)[:-4].split('_'); by[a][e].append(x)
    # the delivery: an actor's median in a mood against their median calm, then the median over the actors
    deliv = collections.defaultdict(list)
    for a, em in by.items():
        n = {k: np.median([x[k] for x in em['NEU']]) for k in ('st', 'sd', 'rate', 'db')}
        for e, xs in em.items():
            m = {k: np.median([x[k] for x in xs]) for k in n}
            deliv[e].append((m['st'] - n['st'], m['sd'] / n['sd'], m['rate'] / n['rate'], m['db'] - n['db']))
    print('delivery (semitones, range x, pace x, dB):')
    for e, v in deliv.items(): print(' ', e, [round(float(x), 2) for x in np.median(v, axis=0)])
    # the voice itself: each acted sentence against the same actor's calm reading of it (plain takes, _XX)
    K = ['jit', 'shim', 'jitE', 'shimE', 'hnr', 'hnrE', 'unvE', 'fall']
    plain = {os.path.basename(f)[:-4]: x for f, x in R.items() if f.endswith('_XX.wav')}
    print('the voice (x, or + for hnr, hnrE, fall):')
    for e in ['ANG', 'HAP', 'FEA', 'SAD']:
        d = {k: [] for k in K}
        for n, r in plain.items():
            a, s, m, _ = n.split('_'); base = plain.get(f'{a}_{s}_NEU_XX')
            if m != e or not r or not base: continue
            for k in K:
                if k in ('hnr', 'hnrE', 'fall'): d[k].append(r[k] - base[k])
                elif base[k] > 0 and r[k] > 0: d[k].append(np.log(r[k] / base[k]))
        print(' ', e, {k: round(float(np.median(v) if k in ('hnr', 'hnrE', 'fall') else np.exp(np.median(v))), 3) for k, v in d.items()})
