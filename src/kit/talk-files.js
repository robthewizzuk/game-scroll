// The built-in voice of the Mac, Windows and Linux app (src/kit/talk.js): Kyutai's Pocket TTS 7M, its word pieces and
// the voices, packed into one file of 8-bit numbers by scripts/talk-pack.mjs from Kyutai's own files at the revision
// below. The games workflow uploads it to the games host once (ml/<TALK_VERSION>/, beside the face tracking files) and
// the app downloads it the first time a character speaks, checks it against TALK_SHA256, and keeps it.
// Bump TALK_VERSION (and the hash: the pack script prints it) whenever the file changes.

export const TALK_VERSION = 'pocket-tts-7m-2';
export const TALK_FILE = 'english-7m.gsv';
export const TALK_SHA256 = '3a6eb536f506160c84e59ec329ab050327e430e0b75bb06084de73a4a7e540a1';
export const TALK_SOURCE = {
  repo: 'kyutai/pocket-tts-without-voice-cloning',
  revision: 'a7056f505a4a8ca72d8b5fb1440071d6f1a35739',
  dir: 'languages/english_7m_refl_2026-10',
};

// The voices packed in, each heard by the model from a recording a speaker gave under a licence that allows this.
// kind: how the model's voice sounds, from its middle pitch in Hz over nine lines (hz): a man's under 125, a woman's
// over 145; 'any' for the three that wander between the two from line to line (cast only when asked for by name).
// lang: the speaker's accent where the dataset says it ('en' where it doesn't); English said with another language's
// accent is en-<country> (en-FR: English as a French speaker says it), cast after all the others or when asked for. Kyutai also ships
// voices from datasets for non-commercial use only (Expresso, EARS): those are left out.
const VCTK = 'VCTK corpus, CSTR, University of Edinburgh (CC BY 4.0)';
const DONATED = 'Unmute Voice Donation Project, Kyutai (CC0)';
const LIBRIVOX = 'Voice-Zero, from LibriVox (CC0)';
const COMMON = 'Mozilla Common Voice (CC0)';
export const TALK_VOICES = [
  { name: 'anna', kind: 'woman', hz: 197, lang: 'en-GB', credit: VCTK + ', speaker p228' },
  { name: 'vera', kind: 'woman', hz: 174, lang: 'en-GB', credit: VCTK + ', speaker p229' },
  { name: 'fantine', kind: 'woman', hz: 202, lang: 'en-GB', credit: VCTK + ', speaker p244' },
  { name: 'eponine', kind: 'woman', hz: 157, lang: 'en-GB-scotland', credit: VCTK + ', speaker p262' },
  { name: 'azelma', kind: 'woman', hz: 220, lang: 'en-CA', credit: VCTK + ', speaker p303' },
  { name: 'mary', kind: 'woman', hz: 200, lang: 'en-US', credit: VCTK + ', speaker p333' },
  { name: 'jane', kind: 'woman', hz: 205, lang: 'en-US', credit: VCTK + ', speaker p339' },
  { name: 'eve', kind: 'woman', hz: 198, lang: 'en-US', credit: VCTK + ', speaker p361' },
  { name: 'caro_davy', kind: 'woman', hz: 150, lang: 'en', credit: LIBRIVOX + ', reader Caro Davy' },
  { name: 'charles', kind: 'man', hz: 77, lang: 'en-GB', credit: VCTK + ', speaker p254' },
  { name: 'paul', kind: 'man', hz: 109, lang: 'en-GB', credit: VCTK + ', speaker p259' },
  { name: 'george', kind: 'man', hz: 120, lang: 'en-US', credit: VCTK + ', speaker p315' },
  { name: 'michael', kind: 'man', hz: 94, lang: 'en-US', credit: VCTK + ', speaker p360' },
  { name: 'alba', kind: 'any', hz: 132, lang: 'en', credit: 'Alba MacKenna, voice actor (CC BY 4.0)' },
  { name: 'marius', kind: 'any', hz: 128, lang: 'en', credit: DONATED },
  { name: 'javert', kind: 'man', hz: 80, lang: 'en', credit: DONATED },
  { name: 'bill_boerst', kind: 'man', hz: 121, lang: 'en', credit: LIBRIVOX + ', reader Bill Boerst' },
  { name: 'peter_yearsley', kind: 'man', hz: 82, lang: 'en', credit: LIBRIVOX + ', reader Peter Yearsley' },
  { name: 'stuart_bell', kind: 'any', hz: 130, lang: 'en', credit: LIBRIVOX + ', reader Stuart Bell' },
  // speakers of other languages, speaking English with their accent (the juergen and rafael voices have no licence stated: left out)
  { name: 'estelle', kind: 'woman', hz: 258, lang: 'en-FR', credit: 'Kyutai, a recording of its own for unmute.sh (CC0)' },
  { name: 'lola', kind: 'woman', hz: 206, lang: 'en-ES', credit: COMMON + ', Spanish' },
  { name: 'giovanni', kind: 'man', hz: 113, lang: 'en-IT', credit: COMMON + ', Italian' },
  { name: 'daan', kind: 'man', hz: 88, lang: 'en-NL', credit: 'CML-TTS dataset, Dutch, speaker 11290 (CC BY 4.0)' },
];

export const TALK_ABOUT = 'Pocket TTS 7M by Kyutai (model CC BY 4.0, code MIT), run in the app in plain JavaScript';
