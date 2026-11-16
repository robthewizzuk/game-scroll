# The built-in voice's own voices

Kyutai ships voices for Pocket TTS, and `src/kit/talk-files.js` packs some of them. The ones marked `own: true` there
are ours: Kyutai's voice-cloning model (the gated [kyutai/pocket-tts](https://huggingface.co/kyutai/pocket-tts)) heard
each one from a recording whose speaker gave it under a licence that allows this, and `clone.py` kept what it heard
here as `<name>.safetensors`: the voice state (the model's memory of the recording, 8 layers of keys and values), only
the frames it heard, in 16-bit floats. `scripts/talk-pack.mjs` reads them from here instead of Kyutai's voice files.

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
and `credit`, bump `TALK_VERSION`, and `node scripts/talk-pack.mjs ml-cache --new` prints the new `TALK_SHA256`.

How the voices here were chosen: each candidate said nine test lines; Whisper wrote down what it heard (word errors),
its pitch was measured (the middle, how steady it stays a man's or a woman's), and a speech quality model scored it.
The clearest of each accent and kind were kept.
