// The desktop app's built-in voice, off the main thread (src/kit/talk.js): downloads the voice file once (kept in the
// browser's cache storage), checks its SHA-256, and writes lines to sound with Pocket TTS 7M (pocket-tts.js).
//   { type: 'load', url, sha }                        -> { type: 'ready', simd } | { type: 'failed', why }
//   { type: 'say', id, text, voice, tempo, temp }     -> { type: 'line', id, pcm: Float32Array (24 kHz), seconds } | { type: 'line', id, pcm: null }
//   { type: 'stop', id }                              ends that line early (its answer is pcm: null)
import { unpack } from './talk-pack.js';
import { makeTTS } from './pocket-tts.js';
import { stretch } from './voice-fx.js';

let tts = null, loading = null;
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

async function speak({ id, text, voice, tempo = 1, temp = .3 }) {
  const line = tts.line(String(text), voice, { temp });
  const parts = []; let n = 0, c, t0 = performance.now();
  while ((c = line.next())) {
    parts.push(c); n += c.length;
    if (performance.now() - t0 > 12) { await breathe(); t0 = performance.now(); }
    if (stops.has(id)) { line.stop(); stops.delete(id); return postMessage({ type: 'line', id, pcm: null }); }
  }
  let pcm = new Float32Array(n); n = 0; for (const p of parts) { pcm.set(p, n); n += p.length; }
  pcm = stretch(pcm, tts.rate, tempo);
  postMessage({ type: 'line', id, pcm, seconds: pcm.length / tts.rate }, [pcm.buffer]);
}

let running = false;
async function drain() {
  if (running) return; running = true;
  try { while (queue.length) { const m = queue.shift(); if (stops.delete(m.id)) { postMessage({ type: 'line', id: m.id, pcm: null }); continue; } try { await speak(m); } catch { postMessage({ type: 'line', id: m.id, pcm: null }); } } }
  finally { running = false; }
}

onmessage = async e => {
  const m = e.data || {};
  if (m.type === 'load') {
    loading ||= (async () => {
      try { tts = makeTTS(unpack(await bytesOf(m.url, m.sha))); postMessage({ type: 'ready', simd: tts.simd }); }
      catch (err) { loading = null; postMessage({ type: 'failed', why: String(err?.message || err) }); }
    })();
  } else if (m.type === 'say') { if (!tts) postMessage({ type: 'line', id: m.id, pcm: null }); else { queue.push(m); drain(); } }
  else if (m.type === 'stop') stops.add(m.id);
};
