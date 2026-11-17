# Shared by the talk-human scripts: where things are, and the speech-quality model.
import os, re, json, glob
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
WORK = os.environ.get('WORK') or os.path.join(ROOT, 'ml-cache', 'talk-human')   # downloads, recordings, results
SRC = open(os.path.join(ROOT, 'src/kit/talk-files.js')).read()
VOICES = re.findall(r"name: '([a-z_]+)'[^\n]*?credit: ([^\n]*)", SRC)
KIND = dict(re.findall(r"name: '([a-z_]+)', kind: '(\w+)'", SRC))
def speaker(credit):
    m = re.search(r'speaker (p\d+)', credit); return m.group(1) if m else None
def recordings(name, credit):
    """The real speaker's recordings: VCTK sentences (fetch_vctk.py), else the voice's own source recording in phrases (refs.py)."""
    s = speaker(credit)
    return (sorted(glob.glob(f'{WORK}/ref/{s}/*.flac')) if s else []) or sorted(glob.glob(f'{WORK}/ref2/{name}/seg/*.wav'))
_mos = None
def mos(a, sr):
    """UTMOS22 strong (MIT; the ONNX export at TigreGotico/utmos-onnx), a speech-quality model: about 1 to 5."""
    global _mos
    import numpy as np, librosa, onnxruntime as ort
    if _mos is None:
        f = f'{WORK}/utmos.onnx'
        if not os.path.exists(f):
            import urllib.request; os.makedirs(WORK, exist_ok=True)
            urllib.request.urlretrieve('https://huggingface.co/TigreGotico/utmos-onnx/resolve/main/utmos22_strong.onnx', f)
        _mos = ort.InferenceSession(f, providers=['CPUExecutionProvider'])
    a16 = librosa.resample(a, orig_sr=sr, target_sr=16000)
    return float(_mos.run(None, {'wave': a16[None].astype(np.float32)})[0][0])
