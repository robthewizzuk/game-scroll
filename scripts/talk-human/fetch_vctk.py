# The VCTK voices' real speakers: 48 sentences each (mic1), from the Hugging Face copy of VCTK (CC BY 4.0), with texts.
#   python scripts/talk-human/fetch_vctk.py        writes $WORK/ref/<speaker>/<id>.flac and $WORK/ref/texts.json
import os, sys, json, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fsspec, pyarrow.parquet as pq
from common import WORK, VOICES, speaker
want = {s for _, c in VOICES if (s := speaker(c))}
base = 'https://huggingface.co/datasets/sanchit-gandhi/vctk/resolve/main/'
files = [x['path'] for x in json.load(urllib.request.urlopen('https://huggingface.co/api/datasets/sanchit-gandhi/vctk/tree/main/data'))]
fs = fsspec.filesystem('https'); got = {s: 0 for s in want}; texts = {}
for fn in sorted(files):
    p = pq.ParquetFile(fs.open(base + fn))
    for i in range(p.metadata.num_row_groups):
        st = p.metadata.row_group(i).column(0).statistics
        spk = [s for s in want if st.min <= s <= st.max and got[s] < 48]
        if not spk: continue
        for r in p.read_row_group(i, columns=['speaker_id', 'audio', 'text', 'text_id']).to_pylist():
            s = r['speaker_id']
            if s not in spk or got[s] >= 48 or not r['audio']['path'].endswith('mic1.flac'): continue
            os.makedirs(f'{WORK}/ref/{s}', exist_ok=True)
            open(f"{WORK}/ref/{s}/{r['text_id']}.flac", 'wb').write(r['audio']['bytes'])
            texts[f"{s}/{r['text_id']}"] = r['text']; got[s] += 1
    json.dump(texts, open(f'{WORK}/ref/texts.json', 'w'))
    if all(v >= 48 for v in got.values()): break
print('speakers', got)   # (p315 isn't in this copy: george's speaker has only the sentence the voice was made from)
