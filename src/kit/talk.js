// The desktop app's own voice: Kyutai's Pocket TTS 7M, built in, so a character sounds the same on a Mac, a Windows
// PC and a SteamOS handheld (whose own voice is espeak's), and every line goes through the mixer. Kit use (sound.js).
// It runs in a background worker (talk-worker.js); the voice file (about 12 MB, talk-files.js) downloads from the
// games host the first time a character speaks and stays in the cache. Until it is in, or where it can't run, lines
// are said by the computer's own voices as before.
//   ownVoice()            true where the built-in voice is used (the desktop app; window.__gsOwnVoice = true in tests)
//   ownVoices()           its voices for casting, listed as a phone lists its own: [{ name, voiceURI, lang, localService }]
//   speak({ text, voiceURI, rate, pitch })   -> { ok, samples: Float32Array, rate, marks: null } once written, or null
//   readyNow()            a promise: true once the voice can speak (it starts loading then), false where it can't
//   cancel()              ends the lines being written
import { desktop } from '../desktop.js';
import { TALK_VERSION, TALK_FILE, TALK_SHA256, TALK_VOICES } from './talk-files.js';

const BASE = String((import.meta.env && import.meta.env.VITE_GAMES_URL) || '').replace(/\/+$/, '');
const URL_OF = () => {
  const rel = `ml/${TALK_VERSION}/${TALK_FILE}`;   // no games server (dev, tests): served with the app (npm run ml)
  return BASE ? `${BASE}/${rel}` : new URL(rel, globalThis.location?.href || 'http://localhost/').href;
};
const RATE = 24000;

/** Whether this app speaks with the built-in voice. */
export const ownVoice = () => !!(desktop || globalThis.__gsOwnVoice) && typeof Worker === 'function' && typeof WebAssembly === 'object';

/** The built-in voices, shaped like a phone's list so voices.js casts from them (kind and accent in the name). */
export const ownVoices = () => TALK_VOICES.map(v => ({
  name: `${v.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} (built in${v.kind === 'woman' ? ', female' : v.kind === 'man' ? ', male' : ''})`,
  voiceURI: `gs-voice:${v.name}`, lang: v.lang, localService: true, own: v.name,
}));

const NUDGE = [1, .9, 1.1, .84];
/**
 * Casts a built-in voice for what a game asked for (voices.js wantOf): { at (in ownVoices()), pitch } or null for a
 * language it doesn't speak. Like voices.js cast(), but a cast bigger than the voices in the accent asked for goes on
 * to the other English voices of that kind before any is used twice (with a pitch nudge): there are 19 to go round.
 */
export function castOwn(want) {
  const list = ownVoices(), low = s => String(s || '').toLowerCase();
  for (const frag of want.like || []) { const at = list.findIndex(v => (low(v.name) + ' ' + low(v.voiceURI)).includes(frag)); if (at >= 0) return { at, pitch: 1 }; }
  const langs = want.langs || ['en-gb'];
  if (!langs.some(l => l.split('-')[0] === 'en')) return null;
  const kind = want.kind === 'woman' || want.kind === 'man' ? want.kind : null;
  // nearest accent first: the one asked for, its regions (en-gb-scotland for en-gb), then any English, in the list's order
  const score = v => { const l = low(v.lang); for (let i = 0; i < langs.length; i++) { if (l === langs[i]) return i * 3; if (l.startsWith(langs[i] + '-')) return i * 3 + 1; } return 99; };
  const pool = TALK_VOICES.map((v, at) => ({ at, v })).filter(c => kind ? c.v.kind === kind : c.v.kind !== 'any').sort((a, b) => score(a.v) - score(b.v) || a.at - b.at);
  const take = want.take || 0, c = pool[take % pool.length];
  return { at: c.at, pitch: NUDGE[Math.min(Math.floor(take / pool.length), NUDGE.length - 1)] };
}

let worker = null, failed = false, ready = null, nextId = 1;
const waiting = new Map();
function start() {
  if (worker || failed) return worker;
  try {
    worker = new Worker(new URL('./talk-worker.js', import.meta.url), { type: 'module' });
    let res = null; ready = new Promise(r => { res = r; });
    worker.onmessage = e => {
      const m = e.data || {};
      if (m.type === 'ready') res(true);
      else if (m.type === 'failed') { off(); res(false); }
      else if (m.type === 'line') { const w = waiting.get(m.id); if (w) { waiting.delete(m.id); w(m.pcm || null); } }
    };
    worker.onerror = () => { off(); res(false); };
    worker.postMessage({ type: 'load', url: URL_OF(), sha: TALK_SHA256 });
  } catch { off(); }
  return worker;
}
function off() {
  failed = true;
  try { worker?.terminate(); } catch { /* gone */ }
  worker = null; ready = Promise.resolve(false);
  for (const [, w] of waiting) w(null);
  waiting.clear();
}

/** True once the built-in voice can speak (it starts loading on the first call), false where it can't. */
export function readyNow() { if (!ownVoice() || failed) return Promise.resolve(false); start(); return ready || Promise.resolve(false); }

/**
 * Writes a line to sound: { ok: true, samples (Float32Array), rate, marks: null }, or null (not loaded, stopped, failed).
 * rate: how fast (1 normal, kept at the voice's pitch); pitch: how high (it raises the speed too, so the line is
 * slowed to match first). voiceURI: one of ownVoices().
 */
export async function speak({ text, voiceURI = '', rate = 1, pitch = 1 }) {
  if (!(await readyNow())) return null;
  const voice = String(voiceURI).replace(/^gs-voice:/, '') || TALK_VOICES[0].name, id = nextId++;
  pitch = Math.max(.5, Math.min(2, +pitch || 1)); rate = Math.max(.3, Math.min(3, +rate || 1));
  const pcm = await new Promise(res => { waiting.set(id, res); worker.postMessage({ type: 'say', id, text: String(text), voice, tempo: rate / pitch }); });
  if (!pcm || !pcm.length) return null;
  return { ok: true, samples: pcm, rate: Math.round(RATE * pitch), marks: null };
}

/** Ends every line being written (their speak() answers null). */
export function cancel() { if (!worker) return; for (const id of waiting.keys()) worker.postMessage({ type: 'stop', id }); }
