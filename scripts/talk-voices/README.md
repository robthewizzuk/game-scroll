# The built-in voice's own voices

Kyutai ships voices for Pocket TTS, and `src/kit/talk-files.js` packs some of them. The ones marked `own: true` there
are ours: Kyutai's voice-cloning model (the gated [kyutai/pocket-tts](https://huggingface.co/kyutai/pocket-tts)) heard
each one from a recording whose speaker gave it under a licence that allows this.

Every voice, Kyutai's and ours, is kept in `prompts/<name>.safetensors` as what the model heard of its recording (its
prompt: a row of 224 numbers for each 80 ms, after the model's speaker projection), not as the voice state the model
makes from it (its memory of the recording, 8 layers of keys and values): nine times smaller, and the app makes the
same voice from it (`pocket-tts.js` `prompt()`). `prompt.py` makes them from the recordings in `sources.json` and
checks each against the voice as Kyutai ships it, or as `clone.py` made it (all matched to 5 places).
`scripts/talk-pack.mjs` packs them; daan (no recording to hear) is packed as Kyutai ships it.

Each prompt also has four moods: `angry`, `happy`, `scared` and `sad`, the same recording acted in code and heard
again. How a mood moves a voice was measured in [CREMA-D](https://github.com/CheyneyComputerScience/CREMA-D) (Open
Database License: its clips are not shipped, only these measurements): its ten actors whose moods listeners named best,
each mood against the same actor's calm reading, gives pitch (semitones), pitch range, pace and loudness. `prompt.py`
moves the recording that way at 0.6 of an actor's strength (loudness at half of that again) with the app's own pitch code (`act.mjs`: PSOLA for pitch, WSOLA for pace). Cloning the
acted clips themselves sounded worse (a speech-quality model: 1.7 to 3.6 against 3.9 to 4.4 for the voice's own
recording acted), and so did moving one voice's state by another's mood (1.3).

Only recordings with a licence for this, and named in each voice's `credit`:

- [VCTK](https://datashare.ed.ac.uk/handle/10283/3443) (CC BY 4.0), sentence 23 from the `mic1` recordings, as
  Kyutai keeps them in [kyutai/tts-voices](https://huggingface.co/kyutai/tts-voices/tree/main/vctk).
- Kyutai's [Unmute Voice Donation Project](https://unmute.sh/voice-donation) (CC0), in
  [kyutai/tts-voices/voice-donations](https://huggingface.co/kyutai/tts-voices/tree/main/voice-donations).

Never Expresso or EARS (non-commercial), or anything without a stated licence.

## Making one

```bash
pip install pocket-tts==4.0.1
HF_HUB_DISABLE_XET=1 python scripts/talk-voices/clone.py <recording.wav> <name>
```

Accept the model's terms on Hugging Face first (and be signed in: `HF_TOKEN`). Then add the voice to `TALK_VOICES`
with `own: true`, its `kind` and `hz` (its middle pitch over test lines: a man's under 125, a woman's over 145), `lang`
and `credit`, its recording to `sources.json`, and run `prompt.py <name>` (it checks the prompt against `clone.py`'s
file, which needn't be kept after). Bump `TALK_VERSION`, and `node scripts/talk-pack.mjs ml-cache --new` prints the new
`TALK_SHA256`.

How the voices here were chosen: each candidate said nine test lines; Whisper wrote down what it heard (word errors),
its pitch was measured (the middle, how steady it stays a man's or a woman's), and a speech quality model scored it.
The clearest of each accent and kind were kept.
