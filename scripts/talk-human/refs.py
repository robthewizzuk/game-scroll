# What each voice's real speaker sounds like: features (feat.py) and the speech-quality score over their recordings.
# A voice that isn't a VCTK speaker's is measured on its own source recording (scripts/talk-voices/sources.json), cut
# into phrases at pauses of 300 ms or more.
#   python scripts/talk-human/refs.py      writes $WORK/ref.json and $WORK/refmos.json
import os, sys, json, glob, tempfile, urllib.request, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from concurrent.futures import ProcessPoolExecutor
from common import WORK, ROOT, VOICES, speaker, recordings, mos
from feat import feats, load, summary
SOURCES = json.load(open(os.path.join(ROOT, 'scripts/talk-voices/sources.json')))
def phrases(name):
    import librosa, soundfile as sf
    d = f'{WORK}/ref2/{name}/seg'
    if glob.glob(d + '/*.wav') or name not in SOURCES: return
    os.makedirs(d, exist_ok=True)
    f = os.path.join(tempfile.gettempdir(), 'gsh-' + SOURCES[name]['url'].split('/')[-1])
    if not os.path.exists(f): urllib.request.urlretrieve(SOURCES[name]['url'], f)
    a, sr = librosa.load(f, sr=24000, mono=True); segs = []
    for s, e in librosa.effects.split(a, top_db=30, frame_length=1024, hop_length=240):
        if segs and s - segs[-1][1] < .3 * sr: segs[-1][1] = e
        else: segs.append([s, e])
    for k, (s, e) in enumerate(x for x in segs if x[1] - x[0] >= .8 * sr): sf.write(f'{d}/{k:02d}.wav', a[max(0, s - 2400):e + 2400], sr)
def one(f):
    try: return f, feats(*load(f))
    except Exception: return f, None
if __name__ == '__main__':
    for name, credit in VOICES:
        if not speaker(credit) or not glob.glob(f'{WORK}/ref/{speaker(credit)}/*.flac'): phrases(name)
    jobs = {name: recordings(name, credit) for name, credit in VOICES}
    with ProcessPoolExecutor(3) as ex: res = dict(ex.map(one, [f for fs in jobs.values() for f in fs], chunksize=4))
    out = {n: summary([res[f] for f in fs]) if fs else None for n, fs in jobs.items()}
    json.dump({'sum': out}, open(f'{WORK}/ref.json', 'w'))
    scores = {n: round(float(np.mean([mos(*load(f)) for f in fs[:16]])), 3) if fs else None for n, fs in jobs.items()}
    json.dump(scores, open(f'{WORK}/refmos.json', 'w'))
    for n in out: print(n, out[n] and out[n]['n'], scores[n])
