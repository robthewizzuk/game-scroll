# Keeps each built-in voice as what the model heard (its prompt: the recording as the model takes it in, after Kyutai's
# speaker projection, 224 numbers a frame) instead of the model's memory of it (2,048 a frame), and adds its moods: the
# same recording acted in code (pitch, its range, pace and loudness moved as actors move them, measured from CREMA-D;
# acted by the app's own pitch code, act.mjs)
# and heard again. The app runs a prompt through the model to make the voice (pocket-tts.js prompt()), which gives
# the same voice: each is checked here against the voice as Kyutai ships it, or as clone.py made it (all 44 matched to
# 5 places on 11-16). scripts/talk-pack.mjs packs these; a voice without one (daan: no recording) is packed as shipped.
#   pip install pocket-tts==4.0.1 soundfile        (and Node, for act.mjs)
#   HF_HUB_DISABLE_XET=1 python scripts/talk-voices/prompt.py [name ...]   writes scripts/talk-voices/prompts/<name>.safetensors
# (the gated kyutai/pocket-tts: accept its terms on Hugging Face first, and be signed in.)
import sys, os, json, tempfile, subprocess, urllib.request, numpy as np, torch
import soundfile as sf
from safetensors.numpy import save_file, load_file
from pocket_tts import TTSModel
from pocket_tts.models.tts_model import end_on_pause, convert_audio, audio_read

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = json.load(open(os.path.join(HERE, 'sources.json')))
# How each mood moves a voice, from CREMA-D's 91 actors (the ten whose moods listeners named best), against the same
# actor's calm reading: semitones, pitch range (x), pace (x), loudness (dB). Acted at ACT of an actor's strength, and the
# loudness at half of that again (the model speaks as loud as it hears, and a shout would be too loud next to the rest).
MOODS = {'angry': (8.0, .72, 1.26, 14.1), 'happy': (6.1, .98, 1.27, 7.9), 'scared': (6.4, .91, 1.18, 7.1), 'sad': (.25, 1.14, .99, -5.1)}
ACT, LEVEL = .6, -15.5
tts = TTSModel.load_model(language='english_7m_refl_2026-10')

def fetch(url):
    path = os.path.join(tempfile.gettempdir(), 'gsv-' + url.split('/')[-1])
    if not os.path.exists(path): urllib.request.urlretrieve(url, path)
    return path
def loud(y, sr):
    fr = y[:len(y) // (sr // 50) * (sr // 50)].reshape(-1, sr // 50)
    return np.percentile(np.sqrt((fr ** 2).mean(axis=1)), 90)
def heard(y, sr):
    """The prompt the model makes from a recording: [bos, frames...] x 224."""
    a = convert_audio(torch.from_numpy(y[None].astype(np.float32)), sr, tts.config.mimi.sample_rate, 1)
    a = end_on_pause(a, tts.config.mimi.sample_rate)
    with torch.no_grad():
        p = tts._encode_audio(a.unsqueeze(0))
        if tts.flow_lm.insert_bos_before_voice: p = torch.cat([tts.flow_lm.bos_before_voice, p], dim=1)
    return p[0].numpy()
def state_of(p):
    from pocket_tts.modules.stateful_module import init_states
    st = init_states(tts.flow_lm, batch_size=1, sequence_length=p.shape[0])
    with torch.no_grad(): tts._run_flow_lm_and_increment_step(model_state=st, audio_conditioning=torch.from_numpy(p[None]))
    return st
ACTOR = subprocess.Popen(['node', os.path.join(HERE, 'act.mjs')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
def acted(y, sr, mood):
    st, rng, pace, db = MOODS[mood]
    with tempfile.TemporaryDirectory() as d:
        y.astype(np.float32).tofile(f'{d}/in')
        ACTOR.stdin.write(json.dumps({'in': f'{d}/in', 'out': f'{d}/out', 'rate': sr, 'st': st * ACT, 'range': 1 + (rng - 1) * ACT, 'pace': 1 + (pace - 1) * ACT}) + '\n')
        ACTOR.stdin.flush(); ACTOR.stdout.readline()
        a = np.fromfile(f'{d}/out', dtype=np.float32)
    return a * (loud(y, sr) * 10 ** (db * ACT * .5 / 20) / loud(a, sr)), sr

for name in sys.argv[1:] or list(SRC):
    s = SRC[name]
    y, sr = sf.read(fetch(s['url']), dtype='float32', always_2d=True); y = y.mean(axis=1)
    if s.get('level'): y = y * min(10 ** (LEVEL / 20) / loud(y, sr), .98 / np.abs(y).max())   # (as clone.py did)
    calm = heard(y, sr)
    # the check: the voice made from the prompt is the voice as shipped
    # (an own voice is checked against clone.py's file where it is still here; the result is kept in the prompt's file)
    own = os.path.join(HERE, f'{name}.safetensors')
    ref = load_file(own) if s.get('own') and os.path.exists(own) else None
    mine = state_of(calm); worst = 1.0
    shipped = None if ref or s.get('own') else tts.get_state_for_audio_prompt(name)
    for l in range(8 if ref or shipped else 0):
        k = f'transformer.layers.{l}.self_attn'
        m = mine[k]['cache'][:, :, :calm.shape[0]].float().numpy().ravel()
        r = (ref[k + '/cache'].astype(np.float32) if ref else shipped[k]['cache'][:, :, :calm.shape[0]].float().numpy()).ravel()
        if len(r) != len(m): worst = 0; break
        worst = min(worst, float(np.corrcoef(m, r)[0, 1]))
    out = {'calm': calm.astype(np.float16)}
    for mood in MOODS:
        a, asr = acted(y, sr, mood); out[mood] = heard(a, asr).astype(np.float16)
    os.makedirs(os.path.join(HERE, 'prompts'), exist_ok=True)
    save_file(out, os.path.join(HERE, 'prompts', f'{name}.safetensors'), metadata={'source': s['url'], 'match': f'{worst:.5f}'})
    print(name, calm.shape[0], 'frames', 'matches the voice as shipped: %.5f' % worst, {k: v.shape[0] for k, v in out.items()}, flush=True)
    if worst < .999: print('  NOT THE SAME VOICE: keep its voice state instead', flush=True)
    if s.get('own') and not ref: print('  (not checked: no clone.py file for it here)', flush=True)
