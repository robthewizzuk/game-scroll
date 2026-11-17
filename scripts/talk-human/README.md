# Making the built-in voices sound like the people they came from

Every built-in voice is a real person's: a VCTK speaker, a LibriVox reader, a donated recording
(`src/kit/talk-files.js` credits each). The model says lines in that voice, but more evenly than a person
does: narrower pitch, quicker, no pauses at commas, endings too clean. `src/kit/voice-pitch.js` `humanize()`
puts the person back after the model speaks (pitch movement and waver, a falling or rising end, the last
syllable drawn out, roughness at the ends, air in the voice, pace), and
`src/kit/voice-human.js` holds how much of each for every voice, tuned here against that voice's own real
recordings. These scripts make that table again (Python 3 with `pip install praat-parselmouth librosa
soundfile onnxruntime fsspec pyarrow`; work files go to `ml-cache/talk-human/`, or `$WORK`):

```bash
python scripts/talk-human/fetch_vctk.py   # 48 sentences of each VCTK voice's speaker, with their texts
python scripts/talk-human/refs.py         # each real speaker's features (feat.py) and speech-quality score
node scripts/talk-pack.mjs                # the voice file, if it isn't made yet
node scripts/talk-human/lines.mjs         # each voice says its speaker's sentences (8 to 16 each)
python scripts/talk-human/tune.py         # tunes each voice: about 6 minutes a voice
python scripts/talk-human/write.py        # writes src/kit/voice-human.js
```

**What is matched** (`feat.py`, Praat through parselmouth): how far pitch moves (spread, range, from moment
to moment), how far a statement's end falls, syllables a second (pauses left out), how much longer the last
syllable is, jitter and shimmer (how unsteady each cycle is) over the line and at its ends, harmonics to noise
(breath), and how much of each ending is unvoiced. Each is compared in units of how much the VCTK speakers
differ from each other on it. A voice whose speaker has few recordings is drawn toward the middle of the
speakers of its kind.

**The guard.** A speech-quality model (UTMOS22, MIT) must not score the result lower than the real speaker
scores, nor more than 0.35 under the voice as the model speaks it. That model scores real people lower than
clean synthetic speech (VCTK speakers 3.8 to 4.35, the model's voices about 4.4), so it guards against harm
(distortion, warble), not against sounding human.

**Air and a room, not hiss.** Real recordings have air in the voice and a room around it. Added as plain noise
on top (hiss through every word, a hiss in the pauses) they were heard as noise and cost the most quality. Now the
air goes through the voice as a person's does: noise between 2 and 6 kHz let through as the folds open each period,
as loud as the voice's own top end at that moment, more as a phrase trails off (`breathy`, tuned per voice). The
room is the same for every voice: low and soft (mostly under 500 Hz, about 50 dB under the voice), steady through
words and pauses, so a pause is a room and not digital silence. On frank the two cost 0.03 of quality together.
The breaths between sentences are about 35 dB under the voice, before most later sentences and in some long
pauses, not every one (louder and at every pause they sounded forced). There is no creak at the ends: pulses
far apart with silence between them were heard as crackle.

**Pace** is set straight from the measured syllable rate (slowing a voice costs no quality), between 0.84 and
1.08. How often a voice pauses at a comma follows how often its speaker pauses.

**Found along the way:** the model's melody already follows a real speaker's as closely as two real speakers'
follow each other (pitch shape matched along the words, 0.57 against 0.55), so a learned melody wouldn't help.

**Moods** (`moods.py`): how angry, happy, scared and sad move a voice, measured in CREMA-D. Its delivery
(pitch, range, pace, loudness) is acted into each voice's own recording by `scripts/talk-voices/prompt.py`
(with `act.mjs`: this same pitch code); its
effect on the voice itself (steadier and clearer when angry or happy, breathier and less steady when sad, a
further fall at the end when happy, scared or sad) is `MOOD` in `write.py`.
