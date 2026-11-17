// The app's own voice: Kyutai's Pocket TTS 7M with the 100M model's decoder (the 7M's own adds a steady whine, the
// "robotic twang"), built in, so a character sounds the same on a Mac, a Windows PC, a SteamOS handheld (whose own
// voice is espeak's) and a phone, and every line goes through the mixer. Kit use (sound.js).
// It runs in background workers (talk-worker.js): one, or a production line of 2 (4 threads) or 3 (8 threads) that
// each run part of the model on the same line. The voice file (about 22 MB, talk-files.js) downloads from the games
// host the first time a character speaks and stays in the cache; the first time, the worker times a line of its own,
// and a device that can't write speech well ahead of playing it keeps its own voices. A line comes back a piece at a
// time (the first sentence first) and is kept for the next launch. Until the file is in, or where it can't run (a
// phone saving data or with under 4 GB, a device too slow), lines are said by the device's own voices as before.
//   ownVoice()            true where the built-in voice is used (the desktop app and the phone apps; window.__gsOwnVoice = true or false in tests)
//   ownVoices()           its voices for casting, listed as a phone lists its own: [{ name, voiceURI, lang, localService }]
//   speak({ text, voiceURI, rate, pitch, lively, fresh, lang, keep })   -> a promise of the first piece
//                         { ok, samples: Float32Array, rate, text, last, more: promise of the next piece or null }, or null
//   readyNow()            a promise: true once the voice can speak (it starts loading then), false where it can't
//   cancel()              ends the lines being written (not those written ahead: keep); hurry(ticket) one of those is wanted now
//   ownCores()            1, 2 or 3 workers writing it (0 until ready); ownSpeed() how fast, timed at the start
import { desktop } from '../desktop.js';
import { TALK_VERSION, TALK_FILE, TALK_SHA256, TALK_VOICES } from './talk-files.js';

const BASE = String((import.meta.env && import.meta.env.VITE_GAMES_URL) || '').replace(/\/+$/, '');
const URL_OF = () => {
  const rel = `ml/${TALK_VERSION}/${TALK_FILE}`;   // no games server (dev, tests): served with the app (npm run ml)
  return BASE ? `${BASE}/${rel}` : new URL(rel, globalThis.location?.href || 'http://localhost/').href;
};
const RATE = 24000;

// the phone apps too (Capacitor sets window.Capacitor), but not on a phone saving data or with little memory: the
// file is 22 MB and the model wants about 90 MB while it speaks; those keep the phone's own voices
const phone = () => {
  const cap = globalThis.Capacitor; if (!cap?.isNativePlatform?.()) return false;
  const nav = globalThis.navigator || {};
  return !nav.connection?.saveData && !(nav.deviceMemory && nav.deviceMemory < 4);
};
/** Whether this app speaks with the built-in voice. */
export const ownVoice = () => globalThis.__gsOwnVoice !== false && !!(desktop || globalThis.__gsOwnVoice || phone()) && typeof Worker === 'function' && typeof WebAssembly === 'object';

/** The built-in voices, shaped like a phone's list so voices.js casts from them (kind and accent in the name). */
export const ownVoices = () => TALK_VOICES.map(v => ({
  name: `${v.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} (built in${v.kind === 'woman' ? ', female' : v.kind === 'man' ? ', male' : ''})`,
  voiceURI: `gs-voice:${v.name}`, lang: v.lang, localService: true, own: v.name,
}));

const NUDGE = [1, .9, 1.1, .84];
// How natural each voice sounds (UTMOS, a speech-quality model, over 6 lines each from the model, 11-17): within an accent
// the most natural is cast first. Measure again when the voices change (a voice not listed goes after the ones that are).
const NATURAL = { lola: 4.50, azelma: 4.49, bill_boerst: 4.49, eponine: 4.49, eve: 4.49, jane: 4.49, mary: 4.49,
  sam: 4.49, alba: 4.48, caro_davy: 4.48, george: 4.48, june: 4.48, michael: 4.48, vera: 4.48, jack: 4.47,
  kiri: 4.47, anna: 4.46, ruth: 4.45, stuart_bell: 4.45, thandi: 4.45, oliver: 4.44, walt: 4.44, charles: 4.43,
  orla: 4.43, declan: 4.41, harry: 4.41, paul: 4.41, javert: 4.40, luc: 4.40, niamh: 4.40, peter_yearsley: 4.40,
  conor: 4.38, daan: 4.38, hank: 4.38, priya: 4.38, frank: 4.37, pieter: 4.37, arjun: 4.36, fantine: 4.36,
  angus: 4.35, giovanni: 4.34, estelle: 4.31, bronwen: 4.27, lucy: 4.22, marius: 4.22 };
/**
 * Casts a built-in voice for what a game asked for (voices.js wantOf): { at (in ownVoices()), pitch, voiceURI } or null
 * for a language it doesn't speak. Like voices.js cast(), but a cast bigger than the voices in the accent asked for goes
 * on to the other English voices of that kind, then to voices between two of them ('gs-voice:anna+vera', the nearest
 * accents paired first: 190 more women, 231 more men), before any is used twice (with a pitch nudge).
 */
export function castOwn(want) {
  const list = ownVoices(), low = s => String(s || '').toLowerCase();
  for (const frag of want.like || []) { const at = list.findIndex(v => (low(v.name) + ' ' + low(v.voiceURI)).includes(frag)); if (at >= 0) return { at, pitch: 1 }; }
  const langs = want.langs || ['en-gb'];
  if (!langs.some(l => l.split('-')[0] === 'en')) return null;
  const kind = want.kind === 'woman' || want.kind === 'man' ? want.kind : null;
  // nearest accent first: the one asked for, its regions (en-gb-scotland for en-gb), then any English; the most natural first in each
  const score = v => { const l = low(v.lang); for (let i = 0; i < langs.length; i++) { if (l === langs[i]) return i * 3; if (l.startsWith(langs[i] + '-')) return i * 3 + 1; } return 99; };
  const pool = TALK_VOICES.map((v, at) => ({ at, v })).filter(c => kind ? c.v.kind === kind : c.v.kind !== 'any').sort((a, b) => score(a.v) - score(b.v) || (kind ? 0 : (a.v.kind === 'woman' ? 0 : 1) - (b.v.kind === 'woman' ? 0 : 1)) || (NATURAL[b.v.name] ?? 0) - (NATURAL[a.v.name] ?? 0) || a.at - b.at);   // (no kind asked for: a woman first, as before)
  const take = want.take || 0, n = pool.length, uri = c => list[c.at].voiceURI;
  if (take < n) return { at: pool[take].at, pitch: 1, voiceURI: uri(pool[take]) };
  // then pairs of one kind: neighbours in the list first (the same accent), then two apart, and so on
  const pairs = kind ? n * (n - 1) / 2 : 0;
  if (take - n < pairs) {
    let k = take - n;
    for (let d = 1; d < n; d++) for (let i = 0; i + d < n; i++) if (!k--) return { at: pool[i].at, pitch: 1, voiceURI: `${uri(pool[i])}+${pool[i + d].v.name}` };
  }
  const c = pool[take % n];
  return { at: c.at, pitch: NUDGE[Math.min(1 + Math.floor((take - n - pairs) / n), NUDGE.length - 1)], voiceURI: uri(c) };
}

let worker = null, stages = [], failed = false, ready = null, nextId = 1, cores = 0, slow = 0, speed = 0;
// how fast it must write a line to speak it in time (seconds of speech a second, timed at the start)
const FAST_ENOUGH = 1.4;
const waiting = new Map();   // id -> { put(piece), keep }
function start() {
  if (worker || failed) return worker;
  try {
    const make = () => new Worker(new URL('./talk-worker.js', import.meta.url), { type: 'module' });
    worker = make();
    let res = null; ready = new Promise(r => { res = r; });
    const heard = e => {
      const m = e.data || {};
      if (m.type === 'ready') {
        cores = m.cores || 1; speed = m.speed || 0;
        if (speed < FAST_ENOUGH) { off(); res(false); } else res(true);   // too slow here: the device's own voices
      }
      else if (m.type === 'failed') { off(); res(false); }
      else if (m.type === 'piece') {
        if (m.id === 0) { if (m.last || !m.pcm) worker?.postMessage({ type: 'probed', speed: m.pcm ? m.speed : 0 }); return; }   // the start-up line, timed
        const w = waiting.get(m.id); if (!w) return;
        if (m.last) waiting.delete(m.id);
        if (m.last && m.pcm && m.speed) checkSpeed(m.speed);
        w.put(m.pcm && m.pcm.length ? m : null, m.last);
      }
    };
    worker.onmessage = heard;
    worker.onerror = () => { off(); res(false); };
    // a production line where the device has cores to spare: 2 workers from 4 threads, 3 from 8; the lead cuts the
    // decoder between them (pocket-tts.js cutsFor)
    const threads = globalThis.navigator?.hardwareConcurrency || 2, n = threads >= 8 ? 3 : threads >= 4 ? 2 : 1;
    let port = null, used = 1;
    if (n > 1 && typeof MessageChannel === 'function') {
      try {
        const chans = Array.from({ length: n }, () => new MessageChannel());
        port = chans[1].port1;   // chans[i] runs from worker i-1 to worker i
        for (let i = 1; i < n; i++) {
          const w = make(), last = i === n - 1, to = last ? null : chans[i + 1].port1;
          w.onmessage = heard; w.onerror = () => { off(); res(false); };
          w.postMessage({ type: 'stage', from: chans[i].port2, to, i: i - 1 }, to ? [chans[i].port2, to] : [chans[i].port2]);
          stages.push(w);
        }
        used = n;
      } catch { for (const w of stages) w.terminate(); stages = []; port = null; }
    }
    worker.postMessage({ type: 'load', url: URL_OF(), sha: TALK_SHA256, port, cores: used }, port ? [port] : []);
  } catch { off(); }
  return worker;
}
function off() {
  failed = true;
  for (const w of [worker, ...stages]) try { w?.terminate(); } catch {}
  worker = null; stages = []; ready = Promise.resolve(false);
  for (const [, w] of waiting) w.put(null, true);
  waiting.clear();
}
// too slow to keep up after all (a busy or hot device): two lines in a row written slower than they play, and the
// device's own voices take over until the app is opened again
function checkSpeed(x) { slow = x < 1.2 ? slow + 1 : 0; if (slow >= 2) off(); }
// a number from the words and the voice, so a line is said the same way each time (it is written once, then kept)
const hash = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return h | 0; };
/** True once the built-in voice can speak (it starts loading on the first call), false where it can't. */
export function readyNow() { if (!ownVoice() || failed) return Promise.resolve(false); start(); return ready || Promise.resolve(false); }

/**
 * Writes a line to sound, a piece at a time (the first sentence first, so it can play while the rest is written):
 * the first piece { ok: true, samples (Float32Array), rate, text (the words of that piece, as said), last,
 * more: a promise of the next piece (null after the last) }, or null (not loaded, stopped, failed).
 * rate: how fast (1 normal, kept at the voice's pitch); pitch: how high (it raises the speed too, so the line is
 * slowed to match first). voiceURI: one of ownVoices(). lively: 0 to 1, how far the pitch moves (every line moves further than the model speaks it, 1 the furthest: voice-pitch.js). The same
 * words in the same voice come out the same each time, and are kept for the next launch; fresh: true for a new take.
 * lang: how to read dates (en-US: month first). keep: a line written ahead of time: not ended by cancel(), and
 * written after the lines wanted now unless hurry(ticket) (ticket: an object speak() puts the line's id on).
 * act: how this saying of it differs (talk-worker.js): { take (0..3: another way of saying the same words), effort (0..1:
 * speaking up over noise), stress (words to stress), pre ('sigh' | 'gasp' | 'hmm' before it) }; null: as it comes.
 */
export async function speak({ text, voiceURI = '', rate = 1, pitch = 1, lively = 0, fresh = false, lang = 'en-GB', keep = false, ticket = null, act = null }) {
  if (!(await readyNow()) || !worker) return null;
  const voice = String(voiceURI).replace(/^gs-voice:/, '') || TALK_VOICES[0].name, id = nextId++;
  if (ticket) ticket.id = id;
  lively = Math.round(Math.max(0, Math.min(1, +lively || 0)) * 100) / 100;
  pitch = Math.max(.5, Math.min(2, +pitch || 1)); rate = Math.max(.3, Math.min(3, +rate || 1));
  const seed = fresh ? null : hash(`${voice}|${lively.toFixed(2)}|${text}`);
  // the pieces as a chain of promises, each resolved when its piece comes in
  const link = () => { let put = null; const p = new Promise(r => { put = r; }); return { p, put }; };
  let cur = link();
  const head = cur.p;
  waiting.set(id, { keep, put(m, last) {
    if (!m) { cur.put(null); return; }
    const nxt = last ? null : link();
    cur.put({ ok: true, samples: m.pcm, rate: Math.round(RATE * pitch), text: m.text || '', last: !!last, more: nxt ? nxt.p : Promise.resolve(null) });
    if (nxt) cur = nxt;
  } });
  worker.postMessage({ type: 'say', id, text: String(text), voice, lang: String(lang || 'en-GB'), tempo: rate / pitch, lively, seed, ahead: !!keep, act: actOf(act) });
  return head;
}

/** act as the worker takes it: only what changes the sound, in a fixed order (it is part of the line's key). */
function actOf(a) {
  if (!a) return null;
  const take = Math.max(0, Math.min(3, a.take | 0)), effort = Math.round(Math.max(0, Math.min(1, +a.effort || 0)) * 2) / 2;
  const stress = Array.isArray(a.stress) ? a.stress.map(w => String(w).toLowerCase()).filter(Boolean).slice(0, 8) : [];
  const pre = a.pre === 'sigh' || a.pre === 'gasp' || a.pre === 'hmm' ? a.pre : null;
  return take || effort || stress.length || pre ? { take, effort, stress, pre } : null;
}

/** How many workers write the voice (2 or 3 where the computer has cores to spare), 0 before it is ready. */
export const ownCores = () => cores;
/** How fast it writes speech here (seconds of speech a second, timed at the start; 0 before). */
export const ownSpeed = () => speed;

/** A line written ahead (keep) that is wanted now after all: written before the others waiting. */
export function hurry(ticket) { if (worker && ticket?.id) worker.postMessage({ type: 'soon', id: ticket.id }); }

/** Ends every line being written but those written ahead (keep): their pieces end with null. */
export function cancel() { if (!worker) return; for (const [id, w] of waiting) if (!w.keep) worker.postMessage({ type: 'stop', id }); }
