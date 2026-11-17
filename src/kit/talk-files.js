// The built-in voice of the Mac, Windows and Linux app and the phone apps (src/kit/talk.js): Kyutai's Pocket TTS 7M with
// the 100M model's decoder, its word pieces and the voices, packed into one file of 8-bit numbers by scripts/talk-pack.mjs from Kyutai's own files at the revision
// below. The games workflow uploads it to the games host once (ml/<TALK_VERSION>/, beside the face tracking files) and
// the app downloads it the first time a character speaks, checks it against TALK_SHA256, and keeps it.
// Bump TALK_VERSION (and the hash: the pack script prints it) whenever the file changes, a voice's hz, kind, lang or
// credit included (they are packed in: npm run talk-test fails when the hash is out of date).

export const TALK_VERSION = 'pocket-tts-7m-7';
export const TALK_FILE = 'english-7m.gsv';
export const TALK_SHA256 = 'daf91acfcdb12a9cc511cbdf5b32c32eeb8d0ebda99c162541a5fe61d02d3397';
export const TALK_SOURCE = {
  repo: 'kyutai/pocket-tts-without-voice-cloning',
  revision: 'a7056f505a4a8ca72d8b5fb1440071d6f1a35739',
  dir: 'languages/english_7m_refl_2026-10',
  // the decoder (latents to sound) comes from the 100M model at the same revision: the 7M's own small one adds a steady
  // 3.6 kHz whine and a faint 200 Hz buzz to every voice (the "robotic twang"); this one reads the 7M's latents just as
  // well without them, for about 3.5 times the work. Only its weights are packed (the small one is left out).
  decoderDir: 'languages/english_2026-10',
  // Kyutai's reward tuning (REFL) is a small step from the 7M before it (english_7m_2026-10: every weight it changed
  // moved 0.1 to 2%, the sound head and decoder not at all). Going five times as far along that step, W = before +
  // 5 (tuned - before), scored better on a speech-quality model (UTMOS 4.23 to 4.37 over 48 takes) with words as
  // clear and each voice at its own pitch; twice as far was still rising, ten times too far (deep voices lose their pitch).
  baseDir: 'languages/english_7m_2026-10',
  nudge: 5,
};

// The voices packed in, each heard by the model from a recording a speaker gave under a licence that allows this.
// kind: how the model's voice sounds, from its middle pitch in Hz over nine lines (hz): a man's under 125, a woman's
// over 145; 'any' for the three that wander between the two from line to line (cast only when asked for by name).
// lang: the speaker's accent where the dataset says it ('en' where it doesn't); English said with another language's
// accent is en-<country> (en-FR: English as a French speaker says it), cast after all the others or when asked for. Kyutai also ships
// voices from datasets for non-commercial use only (Expresso, EARS): those are left out.
// own: true marks a voice Kyutai doesn't ship: its voice-cloning model heard it from the recording named in credit, and
// the voice is kept in scripts/talk-voices/ (its README says how they were made and chosen).
const VCTK = 'VCTK corpus, CSTR, University of Edinburgh (CC BY 4.0)';
const DONATED = 'Unmute Voice Donation Project, Kyutai (CC0)';
const LIBRIVOX = 'Voice-Zero, from LibriVox (CC0)';
const COMMON = 'Mozilla Common Voice (CC0)';
export const TALK_VOICES = [
  { name: 'anna', kind: 'woman', hz: 194, lang: 'en-GB', credit: VCTK + ', speaker p228' },
  { name: 'vera', kind: 'woman', hz: 177, lang: 'en-GB', credit: VCTK + ', speaker p229' },
  { name: 'fantine', kind: 'woman', hz: 203, lang: 'en-GB', credit: VCTK + ', speaker p244' },
  { name: 'eponine', kind: 'woman', hz: 170, lang: 'en-GB-scotland', credit: VCTK + ', speaker p262' },
  { name: 'bronwen', kind: 'woman', hz: 213, lang: 'en-GB-wales', credit: VCTK + ', speaker p253 (Cardiff)', own: true },
  { name: 'orla', kind: 'woman', hz: 211, lang: 'en-GB-ulster', credit: VCTK + ', speaker p261 (Belfast)', own: true },
  { name: 'azelma', kind: 'woman', hz: 208, lang: 'en-CA', credit: VCTK + ', speaker p303' },
  { name: 'mary', kind: 'woman', hz: 188, lang: 'en-US', credit: VCTK + ', speaker p333' },
  { name: 'jane', kind: 'woman', hz: 198, lang: 'en-US', credit: VCTK + ', speaker p339' },
  { name: 'eve', kind: 'woman', hz: 187, lang: 'en-US', credit: VCTK + ', speaker p361' },
  { name: 'ruth', kind: 'woman', hz: 160, lang: 'en-US', credit: VCTK + ', speaker p301 (North Carolina)', own: true },
  { name: 'june', kind: 'woman', hz: 176, lang: 'en-US', credit: VCTK + ', speaker p299 (California)', own: true },
  { name: 'lucy', kind: 'woman', hz: 225, lang: 'en-US', credit: VCTK + ', speaker p310 (Tennessee)', own: true },
  { name: 'niamh', kind: 'woman', hz: 199, lang: 'en-IE', credit: VCTK + ', speaker p283 (Cork)', own: true },
  { name: 'priya', kind: 'woman', hz: 203, lang: 'en-IN', credit: VCTK + ', speaker p248', own: true },
  { name: 'thandi', kind: 'woman', hz: 183, lang: 'en-ZA', credit: VCTK + ', speaker p314 (Cape Town)', own: true },
  { name: 'kiri', kind: 'woman', hz: 194, lang: 'en-NZ', credit: VCTK + ', speaker p335', own: true },
  { name: 'caro_davy', kind: 'woman', hz: 160, lang: 'en', credit: LIBRIVOX + ', reader Caro Davy' },
  { name: 'charles', kind: 'man', hz: 86, lang: 'en-GB', credit: VCTK + ', speaker p254' },
  { name: 'paul', kind: 'man', hz: 107, lang: 'en-GB', credit: VCTK + ', speaker p259' },
  { name: 'oliver', kind: 'man', hz: 112, lang: 'en-GB', credit: VCTK + ', speaker p243 (London)', own: true },
  { name: 'harry', kind: 'man', hz: 87, lang: 'en-GB', credit: VCTK + ', speaker p256 (Birmingham)', own: true },
  { name: 'angus', kind: 'man', hz: 93, lang: 'en-GB-scotland', credit: VCTK + ', speaker p263 (Aberdeen)', own: true },
  { name: 'conor', kind: 'man', hz: 107, lang: 'en-GB-ulster', credit: VCTK + ', speaker p292 (Belfast)', own: true },
  { name: 'george', kind: 'man', hz: 113, lang: 'en-US', credit: VCTK + ', speaker p315' },
  { name: 'michael', kind: 'man', hz: 96, lang: 'en-US', credit: VCTK + ', speaker p360' },
  { name: 'frank', kind: 'man', hz: 95, lang: 'en-US', credit: VCTK + ', speaker p334 (Chicago)', own: true },
  { name: 'walt', kind: 'man', hz: 97, lang: 'en-US', credit: VCTK + ', speaker p311 (Iowa), cleaned by Kyutai', own: true },
  // the donated recordings say no accent: these two are the ones an accent model (CommonAccent) heard as American
  { name: 'sam', kind: 'man', hz: 118, lang: 'en-US', credit: DONATED + ', voice Jeffrey', own: true },
  { name: 'hank', kind: 'man', hz: 88, lang: 'en-US', credit: DONATED + ', voice Jeremy_Q', own: true },
  { name: 'luc', kind: 'man', hz: 117, lang: 'en-CA', credit: VCTK + ', speaker p302 (Montreal)', own: true },
  { name: 'declan', kind: 'man', hz: 100, lang: 'en-IE', credit: VCTK + ', speaker p364 (Donegal)', own: true },
  { name: 'arjun', kind: 'man', hz: 113, lang: 'en-IN', credit: VCTK + ', speaker p251', own: true },
  { name: 'pieter', kind: 'man', hz: 92, lang: 'en-ZA', credit: VCTK + ', speaker p347 (Johannesburg)', own: true },
  { name: 'jack', kind: 'man', hz: 111, lang: 'en-AU', credit: VCTK + ', speaker p374', own: true },
  { name: 'alba', kind: 'any', hz: 121, lang: 'en', credit: 'Alba MacKenna, voice actor (CC BY 4.0)' },
  { name: 'marius', kind: 'any', hz: 136, lang: 'en', credit: DONATED },
  { name: 'javert', kind: 'man', hz: 82, lang: 'en', credit: DONATED },
  { name: 'bill_boerst', kind: 'man', hz: 114, lang: 'en', credit: LIBRIVOX + ', reader Bill Boerst' },
  { name: 'peter_yearsley', kind: 'man', hz: 90, lang: 'en', credit: LIBRIVOX + ', reader Peter Yearsley' },
  { name: 'stuart_bell', kind: 'any', hz: 117, lang: 'en', credit: LIBRIVOX + ', reader Stuart Bell' },
  // speakers of other languages, speaking English with their accent (the juergen and rafael voices have no licence stated: left out)
  { name: 'estelle', kind: 'woman', hz: 228, lang: 'en-FR', credit: 'Kyutai, a recording of its own for unmute.sh (CC0)' },
  { name: 'lola', kind: 'woman', hz: 201, lang: 'en-ES', credit: COMMON + ', Spanish' },
  { name: 'giovanni', kind: 'man', hz: 95, lang: 'en-IT', credit: COMMON + ', Italian' },
  { name: 'daan', kind: 'man', hz: 88, lang: 'en-NL', credit: 'CML-TTS dataset, Dutch, speaker 11290 (CC BY 4.0)' },
];

export const TALK_ABOUT = 'Pocket TTS 7M by Kyutai, its reward tuning taken five times as far, with the decoder of Pocket TTS 100M (models CC BY 4.0, code MIT), run in the app in plain JavaScript; its moods acted as measured from CREMA-D (Cao et al., Open Database License)';
