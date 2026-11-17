// The built-in voice, off the main thread (src/kit/talk.js): downloads the voice file once (kept in the browser's cache
// storage), checks its SHA-256, and writes lines to sound with Pocket TTS 7M and the 100M model's decoder (pocket-tts.js).
// Then it times a line of its own (once a file: the answer is kept), so a device too slow to speak in time says so.
// Where the computer has the cores, two or three of these share each line as a production line: the lead turns text
// into latents and runs the first layers of Mimi's decoder, each next stage runs more of it, a frame behind, and the
// last makes the sound and answers the page. Alone, the lead does it all.
// A line comes back a piece at a time (the model's parts: the first sentence on its own), so it can start playing
// while the rest is written, and a finished line said the same way is kept (cache storage) for the next launch.
//   lead:  { type: 'load', url, sha, port?, cores }
//                                               -> { type: 'ready', simd, cores, speed } | { type: 'failed', why }
//                                               (speed: seconds of speech it writes a second, timed on a line of its own)
//          { type: 'say', id, text, voice, lang, tempo, lively, seed, ahead, act }   seed null: a fresh take, not kept;
//                                               ahead: written ahead of time, after the lines wanted now;
//                                               act: { take, effort, stress, pre } or null (talk.js speak())
//          { type: 'stop', id }                 ends that line early
//          { type: 'soon', id }                 a line written ahead is wanted now
//   stage: { type: 'stage', from: port, to: port | null, i }   (the i-th after the lead) then works from what comes
//          down the port: first the weights it needs and where the decoder is cut (pocket-tts.js cutsFor)
//   to the page, from whichever writes the sound: { type: 'piece', id, pcm: Float32Array (24 kHz) | null, text, last, speed }
import { unpack } from './talk-pack.js';
import { makeFlow, makeMimi, seeded, cutsFor, MIMI_BIG } from './pocket-tts.js';
import { stretch, marksFrom } from './voice-fx.js';
import { humanize, endOf } from './voice-pitch.js';
import { humanOf } from './voice-human.js';
import { spoken } from './say-words.js';

let loading = null, flow = null, first = null, next = null;   // next: the port to the next stage, once it is ready
const stops = new Set(), queue = [];
let fileUrl = '';

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
async function bytesOf(url, sha) {
  const check = async buf => { if (!crypto?.subtle) throw new Error('no SHA-256 here'); return hex(await crypto.subtle.digest('SHA-256', buf)) === sha; };
  let store = null;
  try { store = await caches.open('gs-talk'); } catch { /* no cache storage: the browser's own cache still has it */ }
  const kept = store && await store.match(url).catch(() => null);
  if (kept) { const buf = await kept.arrayBuffer(); if (await check(buf)) return buf; await store.delete(url).catch(() => {}); }
  const r = await fetch(url, { cache: 'force-cache' });
  if (!r.ok) throw new Error(`voice file: ${r.status}`);
  const buf = await r.arrayBuffer();
  if (!(await check(buf))) throw new Error('voice file: SHA-256 does not match');
  if (store) await store.put(url, new Response(buf.slice(0), { headers: { 'Content-Type': 'application/octet-stream' } })).catch(() => {});
  return buf;
}

/* ---------- lines kept between launches: the same words, voice and delivery come out the same, so once is enough ---------- */
const LINES = 'gs-talk-lines', KEEP = 400;   // (about 6 MB for 400 lines of a few seconds)
const lineUrl = key => `https://gs-talk.invalid/line/${key}`;
async function keyOf(m, words) {
  if (m.seed == null || !crypto?.subtle) return null;
  const s = JSON.stringify([fileUrl, HUMAN, m.voice, m.lively || 0, m.tempo || 1, m.seed, words, m.act || null]);
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
/** [{ text, pcm }] kept for this line, or null. */
async function kept(key) {
  try {
    const r = await (await caches.open(LINES)).match(lineUrl(key)); if (!r) return null;
    const b = await r.arrayBuffer(), d = new DataView(b), out = []; let at = 4;
    for (let i = 0, n = d.getUint32(0, true); i < n; i++) {
      const tl = d.getUint32(at, true), text = new TextDecoder().decode(new Uint8Array(b, at + 4, tl)); at += 4 + tl; at += (4 - at % 4) % 4;
      const len = d.getUint32(at, true), q = new Int16Array(b, at + 4, len), pcm = new Float32Array(len); at += 4 + len * 2; at += (4 - at % 4) % 4;
      for (let j = 0; j < len; j++) pcm[j] = q[j] / 32767;
      out.push({ text, pcm });
    }
    return out;
  } catch { return null; }
}
async function keep(key, pieces) {
  try {
    const enc = pieces.map(p => new TextEncoder().encode(p.text || '')), pad = n => n + (4 - n % 4) % 4;
    let size = 4; pieces.forEach((p, i) => { size += pad(4 + enc[i].length) + pad(4 + p.pcm.length * 2); });
    const b = new ArrayBuffer(size), d = new DataView(b); let at = 4; d.setUint32(0, pieces.length, true);
    pieces.forEach((p, i) => {
      d.setUint32(at, enc[i].length, true); new Uint8Array(b, at + 4).set(enc[i]); at = pad(at + 4 + enc[i].length);
      d.setUint32(at, p.pcm.length, true); const q = new Int16Array(b, at + 4, p.pcm.length);
      for (let j = 0; j < p.pcm.length; j++) q[j] = Math.max(-32767, Math.min(32767, Math.round(p.pcm[j] * 32767)));
      at = pad(at + 4 + p.pcm.length * 2);
    });
    const store = await caches.open(LINES), idx = lineUrl('index');
    const list = await (await store.match(idx))?.json().catch(() => []) || [];
    const keys = list.filter(k => k !== key); keys.push(key);
    while (keys.length > KEEP) await store.delete(lineUrl(keys.shift()));
    await store.put(lineUrl(key), new Response(b, { headers: { 'Content-Type': 'application/octet-stream' } }));
    await store.put(idx, new Response(JSON.stringify(keys), { headers: { 'Content-Type': 'application/json' } }));
  } catch { /* no cache storage, or it is full: it is written again next time */ }
}

// a moment for messages (a stop) between frames, without the clamped wait of setTimeout
const ch = new MessageChannel(), waits = [];
ch.port1.onmessage = () => waits.shift()?.();
const breathe = () => new Promise(res => { waits.push(res); ch.port2.postMessage(0); });

const join = parts => { let n = 0; for (const p of parts) n += p.length; const a = new Float32Array(n); n = 0; for (const p of parts) { a.set(p, n); n += p.length; } return a; };
// the start-up line (id 0) is timed, not played: on a stage, it goes to the page like any other (talk.js passes it on)
let probing = null;
const piece = (id, pcm, text, last, speed = 0) => {
  if (id === 0 && probing) { if (last || !pcm) probing(pcm ? speed : 0); return; }
  if (pcm) postMessage({ type: 'piece', id, pcm, text, last, speed }, [pcm.buffer]);
  else postMessage({ type: 'piece', id, pcm: null, text: '', last: true, speed: 0 });
};

/**
 * How each part is made more like a person once it is spoken (voice-pitch.js), with each voice's own settings, tuned
 * against the real person it came from (voice-human.js): how far its pitch moves (further with lively, up to 0.3 more),
 * its unsteadiness, how its sentences end (falling further, a little rough, the last syllable drawn out), the air in
 * its voice, its pace, a quiet room under it, and a soft breath before most sentences after the first and in some long pauses. Change HUMAN with them, so
 * lines kept from before are made again.
 */
const HUMAN = 'h6', LIVELY_WIDE = .3;
// Second listening notes (Rob 11-17): the model alone was heard as cleaner than after this file's processing. Measured
// (UTMOS, the same takes with one thing left out at a time): the added air cost .13, shimmer .09 and the slowest tunes
// (pace under .95) .09; so the air and shimmer each voice was tuned to are used at a part, and no voice is slowed past .95.
const AIR = .35, SHIMMER = .5, SLOWEST = .95;
// Another way of saying the same words (act.take 1 to 3, sound.js picks one a character hasn't used lately): a new take
// from the model, and its tune moved a little each its own way: [pitch range x, semitones, pace x]
const TAKES = [[1, 0, 1], [1.12, .7, .97], [.92, .35, 1.03], [1.06, .2, .95]];   // (never lower: see voice-pitch.js lo)
/**
 * Speaking up over noise (act.effort 0..1, the Lombard effect): people raise their pitch (about 2.5 semitones at full
 * effort), speak a touch slower and push more into the upper voice (talk-worker passes tilt to voice-pitch.js).
 */
const EFFORT = { st: 2, wide: .1, pace: -.03, tilt: 1 };
// A sentence that ends in "!" said with urgency (a 7M model reads "Run!" much as it reads "Sit."): higher, its tune
// wider, a touch quicker. A part that is only laughter ("Ha ha ha!", say()'s [laugh]) said as a laugh: high, wide
// and breathy. [semitones, range x, pace x, breathy at least]
const URGENT = [1.5, 1.15, 1.05, 0], LAUGH = [3, 1.5, 1.08, .8];
const urgencyOf = text => /^\W*(ha[\s,!.-]*)+$/i.test(text || '') ? LAUGH : /!\W*$/.test(text || '') ? URGENT : null;
/** Where each stressed word of a part is said: [[from, to] seconds, ...] (its words timed from the sound: voice-fx.js marksFrom). */
function stressAt(partText, x, words, used) {
  if (!words?.length || !partText) return null;
  const marks = marksFrom(partText, x, 24000), out = [];
  for (let i = 0; i < marks.length; i += 2) {
    const w = (partText.slice(marks[i]).match(/^\S+/) || [''])[0].toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
    if (!w || !words.includes(w) || used.has(w)) continue;
    used.add(w);
    out.push([marks[i + 1], i + 3 < marks.length ? marks[i + 3] : Math.min(x.length / 24000, marks[i + 1] + .45)]);
  }
  return out.length ? out : null;
}
/** Where the sound is made: frames in, a piece out at the end of each part, the line kept at the end. */
function writer() {
  let id = -1, tempo = 1, key = null, t0 = 0, frames = [], text = '', done = [], secs = 0, broken = false, probe = false, lively = 0, seed = 1, part = 0, fit = humanOf(''), act = null, used = new Set();
  const flush = last => {
    if (!frames.length && !last) return;
    const x = join(frames), [tw, tst, tpace] = TAKES[act?.take || 0], e = act?.effort || 0, [ust, uw, upace, ub] = urgencyOf(text) || [0, 1, 1, 0];
    const said = humanize(x, 24000, { ...fit, wide: (fit.wide + LIVELY_WIDE * lively) * tw * uw * (1 + EFFORT.wide * e), shift: 2 ** ((tst + ust + EFFORT.st * e) / 12), tilt: EFFORT.tilt * e, breathy: Math.max(fit.breathy * AIR, ub), shimmer: (fit.shimmer || 0) * SHIMMER,
      seed: seed + part, first: part === 0, end: endOf(text), clean: 1, deess: 1, pre: part === 0 ? act?.pre ?? null : null, stress: stressAt(text, x, act?.stress, used) });
    part++;
    const pcm = stretch(said, 24000, tempo * Math.max(SLOWEST, fit.tempo) * tpace * upace * (1 + EFFORT.pace * e)), copy = key ? pcm.slice() : null;
    secs += pcm.length / 24000;
    if (key) done.push({ text, pcm: copy });
    // how fast it was written (seconds of sound a second), on lines long enough that the start-up doesn't count much
    piece(id, pcm, text, last, last && (secs >= 2 || probe) ? secs / Math.max(.001, (Date.now() - t0) / 1000) : 0);
    frames = [];
  };
  return {
    line(m) { id = m.id; tempo = m.tempo || 1; key = m.key || null; t0 = m.t0 || Date.now(); frames = []; text = ''; done = []; secs = 0; broken = false; probe = !!m.probe; lively = m.lively || 0; seed = m.seed ?? (Math.random() * 2 ** 31) | 0; part = 0; fit = humanOf(m.voice); act = m.act || null; used = new Set(); },
    frame(m, pcm, partText) {
      if (m.id !== id || broken) return;
      if (m.first && frames.length) flush(false);
      if (m.first) text = partText ?? m.part ?? '';
      if (m.first) for (let i = 0; i < 120; i++) pcm[i] *= i / 119;   // (each part fades in)
      frames.push(pcm);
    },
    fail(m) { if (m.id === id) broken = true; },
    end(m) {
      if (m.id !== id || broken) { piece(m.id, null); id = -1; return; }
      flush(true);
      if (key && done.length) keep(key, done);
      id = -1;
    },
    stop(m) { piece(m.id, null); if (m.id === id) id = -1; },
  };
}

async function speak(m) {
  const { id } = m, words = spoken(sayCaps(String(m.text), m.act?.stress), { lang: m.lang }), key = await keyOf(m, words);
  if (key) {   // said before, the same way: from the cache, at once
    const have = await kept(key);
    if (have?.length) { have.forEach((p, i) => piece(id, p.pcm, p.text, i === have.length - 1, 99)); return; }
  }
  // (another take: the model's own take of it differs too)
  const take = m.act?.take || 0, s0 = m.seed == null ? null : (m.seed + take * 0x9e3779b1) >>> 0;
  const opts = { quick: true, rnd: s0 == null ? Math.random : seeded(s0) };
  const head = { id, tempo: m.tempo || 1, key, t0: Date.now(), probe: !!m.probe, lively: m.lively || 0, seed: s0, voice: m.voice, act: m.act || null };
  const l = flow.line(pauses(words, humanOf(m.voice).pause, m.seed), m.voice, opts), out = next || null, w = out ? null : writer();
  if (out) out.postMessage({ type: 'line', ...head }); else w.line(head);
  let S = null, lat, t0 = performance.now();
  while ((lat = l.next())) {
    const isFirst = l.first || !S;
    if (isFirst) S = first.start();
    const x = first.step(S, lat), msg = { type: 'rows', id, first: isFirst, part: isFirst ? l.parts[l.part] : null };
    if (out) out.postMessage({ ...msg, rows: x }, [x.buffer]); else w.frame(msg, x, msg.part);
    if (performance.now() - t0 > 12) { await breathe(); t0 = performance.now(); }
    if (stops.delete(id)) { l.stop(); if (out) out.postMessage({ type: 'stop', id }); else w.stop({ id }); return; }
  }
  if (out) out.postMessage({ type: 'end', id }); else w.end({ id });
}
/** A stressed word written in capitals ("I said NOW") said as a word, not spelled out: the model reads capitals as letters. */
const sayCaps = (text, stress) => stress?.length ? text.replace(/\b[A-Z][A-Z']+\b/g, w => stress.includes(w.toLowerCase()) ? w.toLowerCase() : w) : text;
/**
 * Pauses where a person reading would take one: the model runs straight through a comma, so some commas (each voice
 * its own share: humanOf().pause, from its real speaker) are given to it as a dash, which it pauses at.
 */
function pauses(words, share, seed) {
  if (!(share > 0)) return words;
  let s = ((seed ?? (Math.random() * 2 ** 31)) ^ 0x2545f491) >>> 0 || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  return words.replace(/(\p{L}),(?= \p{L})/gu, (q, a) => rnd() < share ? `${a} -` : q);
}
const none = id => next ? next.postMessage({ type: 'stop', id }) : piece(id, null);

let running = false;
async function drain() {
  if (running) return; running = true;
  try { while (queue.length) { const m = queue.shift(); if (stops.delete(m.id)) { none(m.id); continue; } try { await speak(m); } catch { none(m.id); } } }
  finally { running = false; }
}

/** A stage after the lead: more of the decoder (and the sound, if it is the last), from what comes in. */
function beStage({ from, to, i }) {
  let mimi = null, S = null, at = -1;
  const w = to ? null : writer();
  from.onmessage = async e => {
    const m = e.data || {};
    if (m.type === 'bytes') {   // the voice file (it uses only the decoder's weights) and where the decoder is cut
      try {
        const pack = unpack(m.bytes);
        mimi = makeMimi(pack, { lo: m.cuts[i + 1], hi: m.cuts[i + 2] });
        pack.forget();   // (its weights are in the decoder's own memory now)
        if (to) {   // the stage after this one gets its copy first
          const up = await new Promise(res => { to.onmessage = ev => res(ev.data?.type === 'ready'); to.postMessage({ type: 'bytes', bytes: m.bytes, cuts: m.cuts }, [m.bytes]); });
          to.onmessage = null;
          if (!up) throw new Error('the next stage failed');
        }
        from.postMessage({ type: 'ready' });
      } catch (err) { from.postMessage({ type: 'failed', why: String(err?.message || err) }); }
      return;
    }
    if (to) {   // a middle stage: rows in, rows on
      if (m.type === 'rows') {
        if (m.id !== at || m.first || !S) { at = m.id; S = mimi.start(); }
        try { const r = mimi.step(S, m.rows); to.postMessage({ ...m, rows: r }, [r.buffer]); } catch { to.postMessage({ type: 'stop', id: m.id }); at = -2; }
      } else to.postMessage(m);
      return;
    }
    if (m.type === 'line') { w.line(m); at = m.id; S = null; }
    else if (m.type === 'rows') {
      if (m.id !== at) return;
      if (m.first || !S) S = mimi.start();
      try { w.frame(m, mimi.step(S, m.rows), m.part); } catch { w.fail(m); }
    } else if (m.type === 'end') w.end(m);
    else if (m.type === 'stop') w.stop(m);
  };
}

/** The lead's half of the start: the voice file, then the stages after it (if any) get their copies and where to cut. */
async function load(m) {
  fileUrl = m.url;
  const bytes = await bytesOf(m.url, m.sha), pack = unpack(bytes), cfg = pack.mimi || MIMI_BIG;
  flow = makeFlow(pack);
  let cores = 1;
  if (m.port) {
    const port = m.port, cuts = cutsFor(cfg, m.cores || 2), send = bytes.slice(0);
    if (cuts.length === (m.cores || 2)) {
      const up = await new Promise(res => { port.onmessage = e => res(e.data?.type === 'ready'); port.postMessage({ type: 'bytes', bytes: send, cuts }, [send]); });
      port.onmessage = null;
      if (up) { first = makeMimi(pack, { hi: cuts[1] }); next = port; cores = m.cores; }
    }
  }
  first ||= makeMimi(pack);
  pack.forget();   // (the weights are in the model's own memory now)
  return { simd: flow.simd, cores, speed: await timed() };
}

// How fast it speaks here: a line of its own, timed the first time the file is used on this device (the answer is kept
// with the file's address); it also warms the maths up for the first real line.
const PROBE = 'One, two, three. The lantern is by the door, so mind the step.';
async function timed() {
  const at = `${fileUrl}#speed`;
  let store = null;
  try { store = await caches.open('gs-talk'); const r = await store.match(at); if (r) { const v = +(await r.text()); if (v > 0) return v; } } catch { /* not kept */ }
  flow.voiceOf(flow.voices[0]);   // (the voice made from its prompt first: that isn't timed)
  const speed = await new Promise(res => {
    probing = res;
    speak({ id: 0, text: PROBE, voice: flow.voices[0], lang: 'en-GB', tempo: 1, lively: 0, seed: null, probe: true }).catch(() => res(0));
  });
  probing = null;
  if (store && speed > 0) await store.put(at, new Response(String(speed))).catch(() => {});
  return speed;
}

onmessage = e => {
  const m = e.data || {};
  if (m.type === 'stage') beStage(m);
  else if (m.type === 'probed') probing?.(m.speed || 0);   // the start-up line, timed by the last stage (via the page)
  else if (m.type === 'load') {
    loading ||= load(m).then(r => postMessage({ type: 'ready', ...r }),
      err => { loading = null; postMessage({ type: 'failed', why: String(err?.message || err) }); });
  } else if (m.type === 'say') {
    if (!first) { piece(m.id, null); return; }
    // a line written ahead (ahead: true) waits behind every line wanted now
    const at = m.ahead ? -1 : queue.findIndex(q => q.ahead);
    if (at < 0) queue.push(m); else queue.splice(at, 0, m);
    drain();
  }
  else if (m.type === 'soon') {   // a line written ahead is wanted now: before the others written ahead
    const at = queue.findIndex(q => q.id === m.id); if (at < 0) return;
    const [q] = queue.splice(at, 1), to = queue.findIndex(x => x.ahead); q.ahead = false;
    if (to < 0) queue.push(q); else queue.splice(to, 0, q);
  } else if (m.type === 'stop') stops.add(m.id);
};
