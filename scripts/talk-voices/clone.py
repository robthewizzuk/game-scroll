# Makes a voice for the built-in voice (src/kit/talk-files.js, own: true) from a licensed recording, with Kyutai's
# voice-cloning Pocket TTS model (the gated kyutai/pocket-tts: accept its terms on Hugging Face, then HF_TOKEN or a
# signed-in proxy). The recording is first brought to one loudness (Kyutai's cleaned recordings' level), as the model
# speaks as loud as the recording it heard. Kept small: only the frames the model heard, as 16-bit floats (the voice file packs them in 8 bits).
#   pip install pocket-tts==4.0.1 soundfile
#   python scripts/talk-voices/clone.py <recording.wav> <name>      writes scripts/talk-voices/<name>.safetensors
# Then add { name, kind, hz, lang, credit, own: true } to TALK_VOICES, bump TALK_VERSION, and run
# node scripts/talk-pack.mjs --new for the new TALK_SHA256.
import sys, os, tempfile, numpy as np
import soundfile as sf
from safetensors.numpy import save_file, load_file
from pocket_tts import TTSModel
from pocket_tts.models.model_state import export_model_state

LANGUAGE = 'english_7m_refl_2026-10'  # the model the app's voice file is made from (TALK_SOURCE.dir)
src, name = sys.argv[1], sys.argv[2]
tts = TTSModel.load_model(language=LANGUAGE)
LEVEL = -15.5  # dB: the loud parts' level (90th percentile of 20 ms frames' RMS), as in Kyutai's cleaned recordings
y, sr = sf.read(src, dtype='float32', always_2d=True)
y = y.mean(axis=1)
frames = y[:len(y) // (sr // 50) * (sr // 50)].reshape(-1, sr // 50)
loud = np.percentile(np.sqrt((frames ** 2).mean(axis=1)), 90)
gain = min(10 ** (LEVEL / 20) / loud, 0.98 / np.abs(y).max())
level = tempfile.NamedTemporaryFile(suffix='.wav', delete=False).name
sf.write(level, y * gain, sr)
full = os.path.join(os.path.dirname(os.path.abspath(__file__)), f'.{name}.full.safetensors')
export_model_state(tts.get_state_for_audio_prompt(level), full)
os.remove(level)
st, out = load_file(full), {}
for k, v in st.items():
    if not k.endswith('/cache'): continue
    layer = k[:-len('/cache')]
    pos = int(st[layer + '/offset'][0])
    out[k] = np.ascontiguousarray(v[:, :, :pos]).astype(np.float16)
    out[layer + '/offset'] = np.array([pos], dtype=np.int64)
    out[layer + '/pad'] = st[layer + '/pad'].astype(np.int64)
os.remove(full)
dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), f'{name}.safetensors')
save_file(out, dest, metadata={'source': os.path.basename(src), 'model': LANGUAGE})
print(dest, pos, 'frames', f'{20 * np.log10(gain):+.1f} dB', os.path.getsize(dest), 'bytes')
