// The built-in voice, off the main thread (src/kit/talk.js): downloads the voice file once (kept in the browser's cache
// storage), checks its SHA-256, and writes lines to sound with Pocket TTS 7M (pocket-tts.js). On a computer, the sound
// is made by the 100M model's bigger decoder (a file of its own, the same way), which hasn't the small one's whine;
// where that file can't be had, or with the small one, the whine's fixed tones are filtered out instead.
// Where the computer has the cores, two or three of these share each line as a production line: the lead turns text
// into latents and runs the first layers of Mimi's decoder, each next stage runs more of it, a frame behind, and the
// last makes the sound and answers the page. Alone, the lead does it all.
// A line comes back a piece at a time (the model's parts: the first sentence on its own), so it can start playing
// while the rest is written, and a finished line said the same way is kept (cache storage) for the next launch.
//   lead:  { type: 'load', url, sha, decoder?: { url, sha }, port?, cores }
//                                               -> { type: 'ready', simd, cores, big } | { type: 'failed', why }
//          { type: 'say', id, text, voice, lang, tempo, lively, seed, ahead }   seed null: a fresh take, not kept;
//                                               ahead: written ahead of time, after the lines wanted now
//          { type: 'stop', id }                 ends that line early
//          { type: 'soon', id }                 a line written ahead is wanted now
//   stage: { type: 'stage', from: port, to: port | null, i }   (the i-th after the lead) then works from what comes
//          down the port: first the weights it needs and where the decoder is cut (pocket-tts.js cutsFor)
//   to the page, from whichever writes the sound: { type: 'piece', id, pcm: Float32Array (24 kHz) | null, text, last, speed }
import { unpack } from './talk-pack.js';
import { makeFlow, makeMimi, seeded, withDecoder, cutsFor, MIMI_SMALL } from './pocket-tts.js';
import { stretch, notch } from './voice-fx.js';
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
  const s = JSON.stringify([fileUrl, m.voice, m.lively || 0, m.tempo || 1, m.seed, words]);
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
const piece = (id, pcm, text, last, speed = 0) => pcm
  ? postMessage({ type: 'piece', id, pcm, text, last, speed }, [pcm.buffer])
  : postMessage({ type: 'piece', id, pcm: null, text: '', last: true, speed: 0 });

/** Where the sound is made: frames in, a piece out at the end of each part, the line kept at the end. */
function writer() {
  let id = -1, tempo = 1, key = null, t0 = 0, frames = [], text = '', done = [], secs = 0, broken = false, whine = null;
  const flush = last => {
    if (!frames.length && !last) return;
    const raw = join(frames);
    if (whine) notch(raw, 24000, whine);
    const pcm = stretch(raw, 24000, tempo), copy = key ? pcm.slice() : null;
    secs += pcm.length / 24000;
    if (key) done.push({ text, pcm: copy });
    // how fast it was written (seconds of sound a second), on lines long enough that the start-up doesn't count much
    piece(id, pcm, text, last, last && secs >= 2 ? secs / Math.max(.001, (Date.now() - t0) / 1000) : 0);
    frames = [];
  };
  return {
    line(m) { id = m.id; tempo = m.tempo || 1; key = m.key || null; t0 = m.t0 || Date.now(); frames = []; text = ''; done = []; secs = 0; broken = false; whine = m.whine || null; },
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
  const { id } = m, words = spoken(String(m.text), { lang: m.lang }), key = await keyOf(m, words);
  if (key) {   // said before, the same way: from the cache, at once
    const have = await kept(key);
    if (have?.length) { have.forEach((p, i) => piece(id, p.pcm, p.text, i === have.length - 1, 99)); return; }
  }
  const opts = { lively: m.lively || 0, quick: true, rnd: m.seed == null ? Math.random : seeded(m.seed) };
  const head = { id, tempo: m.tempo || 1, key, t0: Date.now(), whine: first.cfg.whine || null };
  const l = flow.line(words, m.voice, opts), out = next || null, w = out ? null : writer();
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
    if (m.type === 'bytes') {   // the weights it needs (the whole voice file, or only the computers' decoder) and the cuts
      try {
        const pack = unpack(m.bytes);
        mimi = makeMimi(pack, { lo: m.cuts[i + 1], hi: m.cuts[i + 2] });
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

/**
 * The lead's half of the start: the voice file and (on a computer) the bigger decoder's, then the stages after it (if
 * any) get their copies and where to cut. No decoder file (offline the first time, a bad download): the small one.
 */
async function load(m) {
  const bytes = await bytesOf(m.url, m.sha);
  let dec = null;
  if (m.decoder) try { dec = await bytesOf(m.decoder.url, m.decoder.sha); } catch { dec = null; }
  fileUrl = dec ? `${m.url} ${m.decoder.url}` : m.url;   // (lines kept from one decoder aren't the other's)
  const pack = withDecoder(unpack(bytes), dec && unpack(dec)), cfg = pack.mimi || MIMI_SMALL, big = !!dec;
  flow = makeFlow(pack);
  if (m.port) {
    const port = m.port, cuts = cutsFor(cfg, m.cores || 2), send = dec ? dec.slice(0) : bytes.slice(0);
    if (cuts.length === (m.cores || 2)) {
      const up = await new Promise(res => { port.onmessage = e => res(e.data?.type === 'ready'); port.postMessage({ type: 'bytes', bytes: send, cuts }, [send]); });
      port.onmessage = null;
      if (up) { first = makeMimi(pack, { hi: cuts[1] }); next = port; return { simd: flow.simd, cores: m.cores, big }; }
    }
  }
  first = makeMimi(pack);
  return { simd: flow.simd, cores: 1, big };
}

onmessage = e => {
  const m = e.data || {};
  if (m.type === 'stage') beStage(m);
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
