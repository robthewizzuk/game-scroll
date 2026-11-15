// Listening games: real sounds (a dog barking, a whistle, laughing, clapping, a door knock) and spoken
// words ("jump!", "fire!"). Both run on the phone: nothing the mic hears is recorded or leaves it.
//
//   const { Sounds, Voice } = gs.hear;
//   reset() { ears = new Sounds({ want: ['Dog', 'Whistling', 'Laughter', 'Clapping'] }); }   // in make() or reset()
//   tap to start: ears.start();
//   update(dt) { ears.update(dt); if (ears.heard('Dog')) scareCats(); }
//
//   voice = new Voice({ words: ['jump', 'fire', 'left', 'right'] });
//   tap to start: voice.start();                // false if this phone can't listen on the phone itself
//   update(dt) { if (voice.said('jump')) jump(); }
//
// Sounds uses Google's YAMNet (521 everyday sounds): in the phone apps on the phone's AI chip with the
// mic read natively (npu.js), on the web through MediaPipe Audio (Apache-2.0). About 4 to 5 MB of model
// and engine, downloaded from our games server the first time a listening game is played.
// Voice uses the phone's own ON-DEVICE speech recogniser (iPhone, and Android 12+): phones without
// one say voice.available false, and the game uses its touch controls. Always give a touch way to play.

import { lazy } from './lazy.js';
import { register } from './cleanup.js';
import { ML_VERSION } from './vision-files.js';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { npuInfo, loadModel, npuMic, npuMicDone, npuListen, yamnetLabels } from './npu.js';

const BASE = String((import.meta.env && import.meta.env.VITE_GAMES_URL) || '').replace(/\/+$/, '');
const ML = BASE ? `${BASE}/ml/${ML_VERSION}/` : `ml/${ML_VERSION}/`;
const mediapipe = async () => {
  const [m, loader] = await Promise.all([import('@mediapipe/tasks-audio'), import('@mediapipe/tasks-audio/audio_wasm_internal.js?url')]);
  return { m, files: { wasmLoaderPath: loader.default, wasmBinaryPath: ML + 'audio_wasm_internal.wasm' } };
};
// with the NPU plugin the web engine isn't needed (it loads later only if the plugin fails)
const lib = lazy('Sound recognition', async () => (await npuInfo()).available ? { native: true } : mediapipe());
export const loadHear = () => lib.load();

const native = Capacitor.isNativePlatform();
const plugin = native && Capacitor.isPluginAvailable('PhoneAI') ? registerPlugin('PhoneAI') : null;
const live = new Set();
/** Stops every listener (the app calls this when a round ends or the player leaves). */
export function stopHearing() { paused = []; for (const l of [...live]) l.stop(); }
// a paused game lets go of the mic (so the phone's mic light goes off) and picks it up again after
let paused = [];
register('hear', {
  stop: stopHearing,
  pause() { paused = [...live]; for (const l of paused) l.stop(); },
  resume() { const back = paused; paused = []; for (const l of back) l.start(); },
});

// ---------------------------------------------------------------- Sounds

// What is heard as a short list of numbers: each of the surest five sounds adds its own fixed pattern
// of pluses and minuses (made from its name), as strongly as it is heard. Two takes of one sound give
// nearly the same numbers; different sounds give unrelated ones.
const SHAPE_N = 32, patterns = new Map();
function pattern(name) {
  let p = patterns.get(name); if (p) return p;
  let h = 2166136261; for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  p = new Float32Array(SHAPE_N);
  for (let i = 0; i < SHAPE_N; i++) { h = Math.imul(h ^ (h >>> 15), 2246822519) + i | 0; h ^= h >>> 13; p[i] = h & 1 ? 1 : -1; }
  patterns.set(name, p); return p;
}
function soundShape(cats) {
  const top = cats.filter(c => (c.categoryName || c.displayName) && c.score >= .05).sort((a, b) => b.score - a.score).slice(0, 5);
  if (!top.length) return null;
  const out = new Array(SHAPE_N).fill(0);
  for (const c of top) { const p = pattern(c.categoryName || c.displayName), w = Math.sqrt(c.score) * 3 / Math.sqrt(SHAPE_N); for (let i = 0; i < SHAPE_N; i++) out[i] += p[i] * w; }
  return out;
}

/**
 * Hears everyday sounds. opts: want (names to listen for, from YAMNet's list: 'Dog', 'Cat', 'Whistling',
 * 'Clapping', 'Laughter', 'Knock', 'Speech', 'Singing', 'Music', 'Bird', 'Cough', 'Snoring', 'Bell'...;
 * leave out to hear everything), sure (how sure before it counts, .3), every (seconds between looks, .25).
 *   heard(name)   true once for each time it's heard (since the last call)
 *   hearing(name) how sure it is that the sound is going on now (0..1)
 *   top           the loudest-and-surest sound right now: { name, sure } or null
 *   shape         what is being heard now as 32 numbers for gs.brains.Examples (a sound of your own:
 *                 mine.add('spoon on a glass', ears.shape), mine.guess(ears.shape)); null in silence.
 *                 It is the mix of everyday sounds this one is made of, so it tells apart sounds
 *                 that the list tells apart, under names of your own.
 */
export class Sounds {
  constructor({ want = null, sure = .3, every = .25 } = {}) {
    this.L = lib.get();
    this.want = want ? new Set(want.map(w => w.toLowerCase())) : null;
    this.sure = sure; this.every = every;
    this.ready = false; this.running = false; this.failed = null;
    this.now = new Map(); this.fresh = new Map(); this.top = null; this.wait = 0; this.shape = null;
  }
  /** Starts the mic and the model. Call from a tap. Resolves to this (check .ready / .failed). */
  async start() {
    if (this.running) return this;
    this.running = true; live.add(this);
    if (this.L.native && !this.noNative) {
      try {
        const [, names] = await Promise.all([loadModel('yamnet'), yamnetLabels()]);
        if (!this.running) return this;
        if (await npuMic()) {
          if (!this.running) { npuMicDone(); return this; }
          this.native = { names, busy: false }; this.ready = true; return this;
        }
      } catch (e) { console.warn('NPU sound recognition did not start, using the web one:', e); }
      this.noNative = true;
      if (!this.running) return this;
    }
    try {
      if (this.L.native) this.L = await mediapipe();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (!this.running) { stream.getTracks().forEach(t => t.stop()); return this; }
      const ctx = new (window.AudioContext || window.webkitAudioContext)(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
      an.fftSize = 32768; src.connect(an);   // about 0.7 s of sound at 48 kHz, which is what YAMNet looks at
      this.audio = { stream, ctx, an, buf: new Float32Array(an.fftSize) };
      const { m, files } = this.L;
      this.task ||= await m.AudioClassifier.createFromOptions(files, { baseOptions: { modelAssetPath: ML + 'yamnet.tflite' }, maxResults: 5, scoreThreshold: .05 });
      if (!this.running) { this.close(); return this; }
      this.ready = true;
    } catch (e) {
      this.failed = e; this.running = false; live.delete(this); this.close();
    }
    return this;
  }
  close() { const a = this.audio; if (!a) return; this.audio = null; a.stream.getTracks().forEach(t => t.stop()); a.ctx.close().catch(() => {}); }
  stop() {
    if (this.native) { this.native = null; npuMicDone(); }
    if (!this.running && !this.audio) return; this.running = false; this.ready = false; live.delete(this); this.close();
  }
  /** Looks at the newest sound now and then (every `every` seconds). Call each frame with dt. */
  update(dt = 1 / 60) {
    if (!this.ready || (!this.audio && !this.native)) return this;
    this.wait -= dt; if (this.wait > 0) return this; this.wait = this.every;
    const n = this.native;
    if (n) {
      // the AI chip: the result comes back on a later update
      if (!n.busy) {
        n.busy = true;
        npuListen().then(sc => {
          if (this.native !== n) return;
          const top = [...sc].map((s, i) => ({ categoryName: n.names[i], score: s })).filter(c => c.score >= .05).sort((a, b) => b.score - a.score).slice(0, 5);
          this.heardCats(top);
        }).catch(() => {}).finally(() => { n.busy = false; });
      }
      return this;
    }
    const a = this.audio; a.an.getFloatTimeDomainData(a.buf);
    let res; try { res = this.task.classify(a.buf, a.ctx.sampleRate); } catch { return this; }
    return this.heardCats(res?.[0]?.classifications?.[0]?.categories || []);
  }
  heardCats(cats) {
    this.shape = soundShape(cats);
    const seen = new Map();
    for (const c of cats) { const n = c.categoryName || c.displayName; if (!n) continue; if (this.want && !this.want.has(n.toLowerCase())) continue; seen.set(n, c.score); }
    // a sound counts once each time it starts (it has to drop below half `sure` before it counts again)
    for (const [n, s] of seen) if (s >= this.sure && (this.now.get(n) || 0) < this.sure / 2) this.fresh.set(n, (this.fresh.get(n) || 0) + 1);
    this.now = seen;
    let best = null; for (const [n, s] of seen) if (s >= this.sure && (!best || s > best.sure)) best = { name: n, sure: s };
    this.top = best;
    return this;
  }
  /** True once for each time `name` started (since the last call). */
  heard(name) { const k = [...this.fresh.keys()].find(n => n.toLowerCase() === String(name).toLowerCase()); if (!k) return false; const v = this.fresh.get(k) - 1; if (v > 0) this.fresh.set(k, v); else this.fresh.delete(k); return true; }
  /** How sure it is that `name` is going on now, 0..1. */
  hearing(name) { for (const [n, s] of this.now) if (n.toLowerCase() === String(name).toLowerCase()) return s; return 0; }
}

// ---------------------------------------------------------------- Voice

const norm = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9' ]+/g, ' ').trim();
function close(a, b) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 1) return false;
  // one letter different, missing or extra ("jumped" doesn't count, "jum" doesn't either)
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
  return d + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Spoken commands, recognised on the phone itself. opts: words (what to listen for: single words or
 * short phrases), also ({ jump: ['hop', 'up'] }: other words that mean the same), language ('en-GB').
 *   available     true / false once known (null before): can this phone listen on the phone itself?
 *   start()       call from a tap; resolves to true if it's listening
 *   said(word)    true once for each time the word was said (since the last call)
 *   heard         the words it caught lately (the newest last), for showing on screen
 *   stop()
 * It keeps listening until stop() (the recogniser restarts itself after pauses).
 */
export class Voice {
  constructor({ words = [], also = {}, language = 'en-GB' } = {}) {
    this.words = words.map(norm); this.language = language;
    this.alias = new Map();
    for (const w of this.words) this.alias.set(w, w);
    for (const [w, list] of Object.entries(also)) for (const a of list) this.alias.set(norm(a), norm(w));
    this.available = null; this.listening = false; this.heard = [];
    this.counts = new Map(); this.done = new Map(); this.fresh = new Map(); this.want = false;
    this.check();
  }
  async check() {
    try {
      if (plugin) this.available = !!(await plugin.speechAvailable({ language: this.language })).available;
      else this.available = !!webRecognition(this.language, true);
    } catch { this.available = false; }
    return this.available;
  }
  /** Starts listening (call from a tap). Resolves to true if it is. */
  async start() {
    if (this.listening) return true;
    if (this.available === null) await this.check();
    if (!this.available) return false;
    this.want = true; live.add(this);
    return this.listen();
  }
  async listen() {
    this.done = new Map();
    if (plugin) {
      if (!this.subs) this.subs = await Promise.all([
        plugin.addListener('speech', e => this.hear(e.text, e.final)),
        plugin.addListener('speechEnd', () => { this.listening = false; if (this.want) setTimeout(() => this.want && this.listen(), 150); }),
      ]);
      const r = await plugin.speechStart({ language: this.language, words: [...this.alias.keys()] }).catch(() => ({ started: false }));
      this.listening = !!r.started; if (!this.listening) this.want = false;
      return this.listening;
    }
    const rec = webRecognition(this.language);
    if (!rec) { this.want = false; return false; }
    rec.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) this.hear(e.results[i][0].transcript, e.results[i].isFinal); };
    rec.onend = () => { this.listening = false; this.rec = null; if (this.want) setTimeout(() => this.want && this.listen(), 150); };
    rec.onerror = () => {};
    try { rec.start(); this.rec = rec; this.listening = true; } catch { this.listening = false; }
    return this.listening;
  }
  // a partial or final transcript of the current utterance: count each command in it, and pass on
  // the ones beyond what this utterance already gave (partials repeat the words so far)
  hear(text, final) {
    const seen = new Map(), tokens = norm(text).split(/\s+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      for (const n of [3, 2, 1]) {
        if (i + n > tokens.length) continue;
        const phrase = tokens.slice(i, i + n).join(' ');
        let w = this.alias.get(phrase);
        if (!w && n === 1) for (const [a, to] of this.alias) if (!a.includes(' ') && close(phrase, a)) { w = to; break; }
        if (w) { seen.set(w, (seen.get(w) || 0) + 1); i += n - 1; break; }
      }
    }
    for (const [w, n] of seen) {
      const had = this.done.get(w) || 0;
      if (n > had) { this.fresh.set(w, (this.fresh.get(w) || 0) + n - had); this.done.set(w, n); for (let k = had; k < n; k++) { this.heard.push(w); if (this.heard.length > 8) this.heard.shift(); } }
    }
    if (final) this.done = new Map();
  }
  /** True once for each time `word` was said (since the last call). */
  said(word) {
    const w = this.alias.get(norm(word)) || norm(word), n = this.fresh.get(w) || 0;
    if (!n) return false;
    if (n > 1) this.fresh.set(w, n - 1); else this.fresh.delete(w);
    return true;
  }
  stop() {
    this.want = false; this.listening = false; live.delete(this);
    if (plugin) plugin.speechStop().catch(() => {});
    if (this.rec) { try { this.rec.abort(); } catch (_) {} this.rec = null; }
  }
}

// The browser's own recogniser (web version and dev only). It must run on the device: Chrome's
// processLocally where it's offered; dev builds may use the cloud one for testing.
function webRecognition(language, justAsk = false) {
  const R = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!R) return null;
  const dev = !!(import.meta.env && import.meta.env.DEV);
  const local = 'processLocally' in R.prototype;
  if (!local && !dev) return null;
  if (justAsk) return true;
  const rec = new R();
  rec.lang = language; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
  if (local) rec.processLocally = true;
  return rec;
}
