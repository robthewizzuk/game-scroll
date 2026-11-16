// The desktop app's built-in voice, off the main thread (src/kit/talk.js): downloads the voice file once (kept in the
// browser's cache storage), checks its SHA-256, and writes lines to sound with Pocket TTS 7M (pocket-tts.js).
// Two of these share the work where the computer has the cores: the lead turns text into latents and runs the first
// part of Mimi's decoder (pocket-tts.js SPLIT), the back runs the rest and answers the page, a frame behind, so a line
// takes about half as long. Alone, the lead does it all.
//   lead: { type: 'load', url, sha, port? }               -> { type: 'ready', simd, cores } | { type: 'failed', why }
//         { type: 'say', id, text, voice, lang, tempo, lively, seed }   (the answer comes from the back where there is one)
//         { type: 'stop', id }                            ends that line early (its answer is pcm: null)
//   back: { type: 'back', port }                          then works from what the lead sends down the port
//   answer: { type: 'line', id, pcm: Float32Array (24 kHz), seconds } | { type: 'line', id, pcm: null }
import { unpack } from './talk-pack.js';
import { makeTTS, makeFlow, makeMimi, seeded } from './pocket-tts.js';
import { stretch } from './voice-fx.js';
import { spoken } from './say-words.js';

let tts = null, loading = null, back = null;   // back: the port to the other worker, once it is ready
let flow = null, front = null;
const stops = new Set(), queue = [];

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

// a moment for messages (a stop) between frames, without the clamped wait of setTimeout
const ch = new MessageChannel(), waits = [];
ch.port1.onmessage = () => waits.shift()?.();
const breathe = () => new Promise(res => { waits.push(res); ch.port2.postMessage(0); });

const join = parts => { let n = 0; for (const p of parts) n += p.length; const a = new Float32Array(n); n = 0; for (const p of parts) { a.set(p, n); n += p.length; } return a; };
const answer = (id, pcm) => pcm ? postMessage({ type: 'line', id, pcm, seconds: pcm.length / 24000 }, [pcm.buffer]) : postMessage({ type: 'line', id, pcm: null });
const none = id => back ? back.postMessage({ type: 'stop', id }) : answer(id, null);

async function speak({ id, text, voice, lang, tempo = 1, lively = 0, seed = null }) {
  const opts = { lively, rnd: seed == null ? Math.random : seeded(seed) }, words = spoken(String(text), { lang });
  let t0 = performance.now();
  const halt = async () => {
    if (performance.now() - t0 > 12) { await breathe(); t0 = performance.now(); }
    return stops.delete(id);
  };
  if (back) {   // two cores: latents and the front of the decoder here, the rest down the port
    const l = flow.line(words, voice, opts);
    let S = null, lat;
    while ((lat = l.next())) {
      const first = l.first || !S;
      if (first) S = front.start();
      const rows = front.front(S, lat);
      back.postMessage({ type: 'rows', id, rows, first }, [rows.buffer]);
      if (await halt()) { l.stop(); return back.postMessage({ type: 'stop', id }); }
    }
    return back.postMessage({ type: 'end', id, tempo });
  }
  const line = tts.line(words, voice, opts), parts = [];
  for (let c; (c = line.next());) {
    parts.push(c);
    if (await halt()) { line.stop(); return answer(id, null); }
  }
  answer(id, stretch(join(parts), 24000, tempo));
}

let running = false;
async function drain() {
  if (running) return; running = true;
  try { while (queue.length) { const m = queue.shift(); if (stops.delete(m.id)) { none(m.id); continue; } try { await speak(m); } catch { none(m.id); } } }
  finally { running = false; }
}

/** The back: Mimi's last layers and convolutions, from the rows the lead sends, and the answer to the page. */
function beBack(port) {
  let mimi = null, S = null, at = -1, parts = [];
  port.onmessage = e => {
    const m = e.data || {};
    if (m.type === 'bytes') {
      try { mimi = makeMimi(unpack(m.bytes), { part: 'back' }); port.postMessage({ type: 'ready' }); }
      catch (err) { port.postMessage({ type: 'failed', why: String(err?.message || err) }); }
    } else if (m.type === 'rows') {
      if (m.id !== at) { at = m.id; parts = []; S = null; }
      if (!S || m.first) S = mimi.start();
      try {
        const out = mimi.back(S, m.rows);
        if (m.first) for (let i = 0; i < 120; i++) out[i] *= i / 119;   // (each part fades in)
        parts.push(out);
      } catch { at = -2; parts = null; }
    } else if (m.type === 'end' || m.type === 'stop') {
      const ok = m.type === 'end' && m.id === at && parts;
      answer(m.id, ok ? stretch(join(parts), 24000, m.tempo) : null);
      if (m.id === at) { at = -1; parts = []; S = null; }
    }
  };
}

/** The lead's half of the start: the voice file, then the back (if there is one) gets its copy. */
async function load(m) {
  const bytes = await bytesOf(m.url, m.sha);
  if (m.port) {
    const port = m.port;
    const up = await new Promise(res => {
      port.onmessage = e => res(e.data?.type === 'ready');
      port.postMessage({ type: 'bytes', bytes: bytes.slice(0) });
    });
    port.onmessage = null;
    if (up) { const pack = unpack(bytes); flow = makeFlow(pack); front = makeMimi(pack, { part: 'front' }); back = port; return flow.simd; }
  }
  tts = makeTTS(unpack(bytes));
  return tts.simd;
}

onmessage = e => {
  const m = e.data || {};
  if (m.type === 'back') beBack(m.port);
  else if (m.type === 'load') {
    loading ||= load(m).then(simd => postMessage({ type: 'ready', simd, cores: back ? 2 : 1 }),
      err => { loading = null; postMessage({ type: 'failed', why: String(err?.message || err) }); });
  } else if (m.type === 'say') { if (!tts && !back) postMessage({ type: 'line', id: m.id, pcm: null }); else { queue.push(m); drain(); } }
  else if (m.type === 'stop') stops.add(m.id);
};
