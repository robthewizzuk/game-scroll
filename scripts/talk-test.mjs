// Checks the desktop app's built-in voice (src/kit/talk.js, pocket-tts.js; Pocket TTS 7M): npm run talk-test
// Makes the voice file first when ml-cache/ hasn't got it (scripts/talk-pack.mjs: a download from Hugging Face; offline,
// the checks that need it are left out). Then: the file reads back, the word pieces, every voice speaks a line of about
// the right length at the pitch its kind says, the same seed says it the same way, a speed change keeps the pitch,
// casting, espeak's list on Linux; and with --browser (the PR check runs it), say() in a page speaks through the
// worker and the mixer.
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { TALK_VOICES, TALK_VERSION, TALK_FILE } from '../src/kit/talk-files.js';
import { unpack } from '../src/kit/talk-pack.js';
import { makeTTS, makeFlow, makeMimi, seeded, cutsFor, MIMI_BIG } from '../src/kit/pocket-tts.js';
import { spoken, respell } from '../src/kit/say-words.js';
import { stretch, marksFrom, resample } from '../src/kit/voice-fx.js';
import { cast, wantOf, describe } from '../src/kit/voices.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails++; };

// casting from the built-in list (no file needed): what talk.js lists, built the same way
globalThis.__gsOwnVoice = true;
const { ownVoices, castOwn } = await import('../src/kit/talk.js');
{
  const list = ownVoices(), kindOf = at => TALK_VOICES[at].kind, pick = w => castOwn(wantOf(w));
  const women = new Set(), men = new Set(), nW = TALK_VOICES.filter(v => v.kind === 'woman').length, nM = TALK_VOICES.filter(v => v.kind === 'man').length;
  for (let take = 0; take < nW; take++) { const w = pick({ kind: 'woman', take }); women.add(w.at); ok(kindOf(w.at) === 'woman' && w.pitch === 1, `cast: woman take ${take} is ${TALK_VOICES[w.at].name} (${TALK_VOICES[w.at].lang})`); }
  for (let take = 0; take < nM; take++) { const m = pick({ kind: 'man', take }); men.add(m.at); ok(kindOf(m.at) === 'man' && m.pitch === 1, `cast: man take ${take} is ${TALK_VOICES[m.at].name} (${TALK_VOICES[m.at].lang})`); }
  ok(women.size === nW && men.size === nM && nW >= 11 && nM >= 9, 'cast: every voice of a kind is a different one before any repeats');
  ok(TALK_VOICES[pick({ kind: 'woman', take: 0 }).at].lang === 'en-GB' && pick({ kind: 'woman', take: nW + nW * (nW - 1) / 2 }).pitch !== 1, 'cast: a British voice first (the default accent), a nudged pitch once all are used');
  ok(pick({ kind: 'woman', take: nW }).voiceURI === 'gs-voice:anna+vera' && pick({ kind: 'man', take: nM }).voiceURI.includes('+') && pick({ kind: 'man', take: nM }).pitch === 1, `cast: then voices between two (${pick({ kind: 'woman', take: nW }).voiceURI}, ${pick({ kind: 'man', take: nM }).voiceURI})`);
  ok(TALK_VOICES[pick({ kind: 'woman', lang: 'en-US' }).at].lang === 'en-US' && TALK_VOICES[pick({ kind: 'man', lang: ['en-US'], take: 1 }).at].lang === 'en-US', 'cast: American voices when asked for en-US');
  ok(TALK_VOICES[pick({ kind: 'woman', take: 3 }).at].name === 'eponine', 'cast: a Scottish woman next after the English ones (en-GB-scotland is in en-GB)');
  ok(castOwn(wantOf({ kind: 'man', lang: 'fr-FR' })) === null, 'cast: no built-in voice for French (the computer says it)');
  ok(TALK_VOICES[pick({ kind: 'woman', lang: ['en-FR'] }).at].name === 'estelle' && TALK_VOICES[pick({ kind: 'man', lang: ['en-IT'] }).at].name === 'giovanni', 'cast: an English line with a French or Italian accent when asked for');
  ok(list[pick({ like: ['javert'] }).at].voiceURI === 'gs-voice:javert' && TALK_VOICES[pick({ like: ['stuart'] }).at].kind === 'any', 'cast: a voice asked for by name, the in-between ones too');
  ok(TALK_VOICES[pick('any').at].name === 'anna', 'cast: a line with no voice given is said by the first British voice');
}
// Linux: espeak-ng's list as Chromium gives it through speech-dispatcher
{
  const v = (name, lang = 'en-US') => describe({ name, voiceURI: name, lang, localService: true });
  ok(v('English (America) espeak-ng').sex === 'm' && !v('English (America) espeak-ng').joke, 'espeak: the plain voice is a man\'s');
  ok(v('English (Great Britain)+female2 espeak-ng', 'en-GB').sex === 'f', 'espeak: +female2 is a woman\'s');
  ok(v('English (America)+male3 espeak-ng').sex === 'm', 'espeak: +male3 is a man\'s');
  ok(v('English (America)+Half-LifeAnnouncementSystem espeak-ng').joke && v('English (America)+Max espeak-ng').joke, 'espeak: novelty variants are not cast');
  const list = ['English (America) espeak-ng', 'English (America)+Demonic espeak-ng', 'English (America)+female1 espeak-ng', 'English (America)+male2 espeak-ng'].map(name => ({ name, voiceURI: name, lang: 'en-US', localService: true }));
  ok(list[cast(list, wantOf({ kind: 'woman', lang: 'en-US' })).at].name.includes('female1'), 'espeak: a woman cast from the list');
}
// text as it is said (say-words.js): each was misread before (checked with a phoneme recogniser)
for (const [text, want, lang] of [
  ["That'll be £5.99, or $12 if you're American.", "That'll be five pounds ninety-nine, or twelve dollars if you're American."],
  ['You scored 2,048 points, 87% of the record.', 'You scored two thousand and forty-eight points, eighty-seven per cent of the record.'],
  ['Zorblax the 3rd lands at 07:45 on 01/02/2026.', 'Zorblax the third lands at seven forty-five on the first of February, twenty twenty-six.'],
  ['On 01/02/2026 at 7pm it cost $250.', 'On January second, twenty twenty-six at seven p m it cost two hundred fifty dollars.', 'en-US'],
  ["It's -5 degrees, and 1.5 km to go.", "It's minus five degrees, and one point five kilometres to go."],
  ['Call 999, or press #1 for the shop.', 'Call nine nine nine, or press number one for the shop.'],
  ['Door 42 opened in 1987, on 14 March.', 'Door forty-two opened in nineteen eighty-seven, on the fourteenth of March.'],
  ['GET OUT OF MY SWAMP, said the ogre. The NPC and the FBI.', 'get out of my swamp, said the ogre. The NPC and the FBI.'],
  ['No. I may go on 2 May. Mr. Brown & Dr. Who.', 'No. I may go on the second of May. Mister Brown and Doctor Who.'],
  ["It's 17:00, not 00:00 or 3:30 pm.", "It's seventeen hundred, not midnight or three thirty p m."],
]) { const got = spoken(text, { lang }); ok(got === want, `words: "${text}" -> "${got}"`); }
{
  const r = respell("Zorblax's ship. ZORBLAX! notZorblax", { Zorblax: 'zor blacks' });
  ok(r.text === "zor blacks's ship. zor blacks! notZorblax" && r.at(r.text.indexOf('ship')) === 10 && r.at(r.text.indexOf('notZ')) === 25, `respell: "${r.text}", word marks back in place`);
}
{ // a speed change at the same pitch
  const r = 24000, x = new Float32Array(r); for (let i = 0; i < r; i++) x[i] = Math.sin(2 * Math.PI * 180 * i / r) * .5;
  for (const t of [.8, 1.25]) { const y = stretch(x, r, t); ok(Math.abs(y.length - r / t) < 2 && Math.abs(f0(y.subarray(2000, y.length - 2000), r) - 180) < 4, `stretch ${t}: ${y.length} samples at ${f0(y.subarray(2000, y.length - 2000), r).toFixed(0)} Hz`); }
}

{ // the resampler (shape()): 24 kHz to 48 kHz with nothing mirrored above the old top
  const r = 24000, n = r, tone = f => Float32Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * f * i / r));
  const up = resample(tone(9000), 2), m = 48000, at = f => { let c = 0, q = 0; for (let i = m / 4; i < m * 3 / 4; i++) { c += up[i] * Math.cos(2 * Math.PI * f * i / m); q += up[i] * Math.sin(2 * Math.PI * f * i / m); } return Math.hypot(c, q) / (m / 4); };
  ok(Math.abs(up.length - m) < 4 && at(9000) > .95 && at(15000) < .001, `resample: 9 kHz kept (${at(9000).toFixed(3)}), its mirror at 15 kHz ${(20 * Math.log10(at(15000) + 1e-9)).toFixed(0)} dB`);
}

let bytes = null;
try {
  const { writeTo } = await import('./talk-pack.mjs');
  bytes = readFileSync(await writeTo(join(ROOT, 'ml-cache')));
} catch (e) { console.log(`no voice file (${e.message}): the checks that speak are left out`); }

if (bytes) {
  const pack = unpack(bytes), tts = makeTTS(pack, { plain: !!process.env.PLAIN });
  ok(pack.cast.length === TALK_VOICES.length && pack.cast.every((v, i) => v.name === TALK_VOICES[i].name && v.kind === TALK_VOICES[i].kind), `file: ${pack.cast.length} voices, as talk-files.js lists them`);
  ok(/Kyutai/.test(pack.about) && pack.cast.every(v => v.credit), 'file: credits for the model and every voice');
  for (const s of ['Hello there.', "I'll have that back, thank you.", 'café ☃ 42']) ok(tts.tokenizer.decode(tts.tokenizer.encode(s)).trim() === s, `pieces: "${s}" reads back`);
  console.log(`speaking with ${tts.simd ? 'WebAssembly SIMD' : 'plain JavaScript'}`);
  const seeded = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const say = (text, voice, seed = 1) => { const l = tts.line(text, voice, { rnd: seeded(seed) }), parts = []; let c, n = 0; while ((c = l.next())) { parts.push(c); n += c.length; } const a = new Float32Array(n); n = 0; for (const p of parts) { a.set(p, n); n += p.length; } return a; };
  const line = 'Door three is opening. Please stand clear.';
  let secs = 0, t0 = performance.now();
  for (const v of TALK_VOICES) {
    const a = say(line, v.name), s = a.length / tts.rate; secs += s;
    let e = 0, peak = 0; for (const x of a) { e += x * x; peak = Math.max(peak, Math.abs(x)); }
    const hz = f0(a, tts.rate), rms = Math.sqrt(e / a.length);
    ok(s > 1.4 && s < 4.5 && rms > .01 && peak < 1 && (v.kind === 'woman' ? hz > 140 : v.kind === 'man' ? hz < 130 : hz > 0),
      `${v.name} (${v.kind}): ${s.toFixed(2)} s, loudness ${rms.toFixed(3)}, ${hz.toFixed(0)} Hz`);
  }
  const ms = performance.now() - t0;
  console.log(`spoke ${secs.toFixed(1)} s in ${(ms / 1000).toFixed(1)} s: ${(secs / ms * 1000).toFixed(1)}x real time on one thread`);
  const a1 = say('Same again.', 'anna', 7), a2 = say('Same again.', 'anna', 7), a3 = say('Same again.', 'anna', 8);
  ok(a1.length === a2.length && a1.every((x, i) => x === a2[i]), 'the same seed says a line the same way');
  ok(a1.length !== a3.length || a1.some((x, i) => x !== a3[i]), 'another seed says it a little differently');
  for (const n of [2, 3]) { // cut across 2 or 3 workers (pocket-tts.js cutsFor), it says a line exactly as one does
    const text = n === 2 ? 'Two cores, one voice.' : 'Three workers, one voice.', voice = n === 2 ? 'paul' : 'estelle', seed = n === 2 ? 9 : 5;
    const flow = makeFlow(pack), cuts = cutsFor(pack.mimi, n), st = cuts.map((lo, i) => makeMimi(pack, { lo, hi: cuts[i + 1] })), one = say(text, voice, seed);
    const l = flow.line(text, voice, { rnd: seeded(seed) }), parts = [], ms = cuts.map(() => 0); let lat, S = null;
    while ((lat = l.next())) {
      const first = l.first || !S; if (first) S = st.map(m => m.start());
      let x = lat; st.forEach((m, i) => { const t = performance.now(); x = m.step(S[i], x); ms[i] += performance.now() - t; });
      if (first) for (let i = 0; i < 120; i++) x[i] *= i / 119;
      parts.push(x);
    }
    const all = new Float32Array(parts.length * 1920); parts.forEach((p, i) => all.set(p, i * 1920));
    ok(all.length === one.length && all.every((x, i) => x === one[i]), `${n} stages (cut at ${cuts.join(', ')}): the same sound as one (${ms.map(t => (t / parts.length).toFixed(1)).join(' | ')} ms a frame)`);
  }
  { // the first sentence is a part of its own (quick), so it can be played while the rest is written
    const l = makeFlow(pack).line('Over here. The door at the end of the long hall is open now, so hurry.', 'anna', { rnd: seeded(2), quick: true });
    ok(l.parts.length >= 2 && l.parts[0].trim() === 'Over here.', `pieces: the first sentence on its own ("${l.parts[0]}" of ${l.parts.length})`);
    l.stop?.();
  }
  { // word marks from the sound: the word after each full stop starts at the end of a pause, not where length alone puts it
    const text = 'Wait. Not that one. The red door, on the left.', a = say(text, 'george', 3), m = marksFrom(text, a, tts.rate);
    const quietBefore = t => { const i = Math.round(t * tts.rate), w = Math.round(tts.rate * .06); let e = 0; for (let k = Math.max(0, i - w); k < i; k++) e += a[k] * a[k]; return Math.sqrt(e / w); };
    let loud = 0; for (const x of a) loud += x * x; loud = Math.sqrt(loud / a.length);
    const after = [text.indexOf('Not'), text.indexOf('The')].map(i => m[m.indexOf(i) + 1]);
    ok(m.length === 2 * 10 && m.every((v, i) => i % 2 === 0 || i < 3 || v >= m[i - 2]) && after.every(t => quietBefore(t) < loud * .35),
      `marks from the sound: 10 words in order, "Not" and "The" just after a pause (${after.map(t => t.toFixed(2)).join(', ')} s)`);
  }
  { // a voice between two: its pitch between theirs
    const hz = v => f0(say('Pick up the lantern before the light goes.', v, 6), tts.rate), [a, b, m] = ['george', 'charles', 'george+charles'].map(hz);
    ok(m > Math.min(a, b) - 5 && m < Math.max(a, b) + 5 && m !== a, `blend: george+charles speaks at ${m.toFixed(0)} Hz (george ${a.toFixed(0)}, charles ${b.toFixed(0)})`);
  }
  { // lively: a wider pitch range, the same length of line, the words still there
    const plain = say('Oh, you found it! That is wonderful news.', 'george', 4), live = (() => { const l = tts.line('Oh, you found it! That is wonderful news.', 'george', { rnd: seeded(4), lively: 1 }), ps = []; let c; while ((c = l.next())) ps.push(c); const a = new Float32Array(ps.length * 1920); ps.forEach((p, i) => a.set(p, i * 1920)); return a; })();
    const spread = a => { const hz = pitches(a, tts.rate); const st = hz.map(h => 12 * Math.log2(h / 100)), m = st.reduce((x, y) => x + y, 0) / st.length; return Math.sqrt(st.reduce((x, y) => x + (y - m) ** 2, 0) / st.length); };
    ok(live.length === plain.length && spread(live) > spread(plain) * 1.1, `lively: pitch spread ${spread(plain).toFixed(2)} -> ${spread(live).toFixed(2)} semitones`);
  }
  const long = say('This is a longer line. It goes on for a while, in more than one part, so that it is cut into pieces of text the model reads one after another, and each still comes out.', 'george');
  ok(long.length / tts.rate > 7, `a long line in parts: ${(long.length / tts.rate).toFixed(1)} s`);
  // the file the PR check makes is the one talk-files.js pins (writeTo checked its SHA-256)
  ok(bytes.length > 18e6 && bytes.length < 25e6, `file: ${(bytes.length / 1e6).toFixed(1)} MB (${TALK_VERSION}/${TALK_FILE})`);
}

if (bytes) { // the decoder is the 100M model's: no steady whine at 3.6 kHz standing out of the voice
  const pack = unpack(bytes), tts = makeTTS(pack);
  ok(pack.mimi?.d === MIMI_BIG.d && pack.get('mimi.decoder_transformer.transformer.layers.2.linear1.weight') === null, `decoder: the 100M model's (d ${pack.mimi?.d}, ${pack.mimi?.layers} layers), the 7M's own left out`);
  const stand = x => { const r = 24000, lv = f => { let c = 0, q = 0; for (let i = 0; i < x.length; i++) { const w = .5 - .5 * Math.cos(2 * Math.PI * i / x.length); c += w * x[i] * Math.cos(2 * Math.PI * f * i / r); q += w * x[i] * Math.sin(2 * Math.PI * f * i / r); } return c * c + q * q; };
    let side = 0; for (const o of [-60, -45, -30, 30, 45, 60]) side += lv(3600 + o); return 10 * Math.log10(lv(3600) / (side / 6)); };
  let w = 0;
  for (const [v, sd] of [['anna', 2], ['paul', 3], ['alba', 4]]) { const l = tts.line('There is a lantern by the door, if you want it.', v, { rnd: seeded(sd) }), ps = []; let c; while ((c = l.next())) ps.push(c); const a = new Float32Array(ps.length * 1920); ps.forEach((p, i) => a.set(p, i * 1920)); w += stand(a); }
  ok(w / 3 < 9, `decoder: the 3.6 kHz line stands ${(w / 3).toFixed(1)} dB above the sound beside it (the 7M's own decoder: about 17)`);
}

if (bytes && process.argv.includes('--browser')) await inBrowser();

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);

/** Middle pitch in Hz of the voiced parts (YIN). */
function f0(a, sr) { const out = pitches(a, sr).sort((x, y) => x - y); return out[out.length >> 1] || 0; }
/** The pitch of each voiced 20 ms, in Hz. */
function pitches(a, sr) {
  const W = 1024, out = [], minL = Math.floor(sr / 400), maxL = Math.floor(sr / 60), d = new Float32Array(maxL + 1);
  let peak = 0; for (const x of a) peak = Math.max(peak, Math.abs(x));
  const quiet = (peak * .02) ** 2;   // (some voices speak more softly: voiced parts are measured from the line's own peak)
  for (let s = 0; s + W + maxL < a.length; s += 480) {
    let e = 0; for (let i = 0; i < W; i++) e += a[s + i] ** 2; if (e / W < quiet) continue;
    let run = 0;
    for (let L = 1; L <= maxL; L++) { let x = 0; for (let i = 0; i < W; i++) { const q = a[s + i] - a[s + i + L]; x += q * q; } run += x; d[L] = x * L / (run || 1); }
    for (let L = minL; L <= maxL; L++) if (d[L] < .15) { while (L < maxL && d[L + 1] < d[L]) L++; out.push(sr / L); break; }
  }
  return out;
}

/** say() in a page with the built-in voice: it loads in the worker, speaks through the mixer, and casts. */
async function inBrowser() {
  const { chromium } = createRequire(import.meta.url)('playwright'), vite = await import('vite');
  const server = await vite.createServer({ root: ROOT, server: { port: 4187 }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const p = await b.newPage(), errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(() => { window.__gsOwnVoice = true; });
    await p.goto('http://localhost:4187/scripts/talk-test.html');
    const r = await p.evaluate(async () => {
      const s = await import('/src/kit/sound.js'), t = await import('/src/kit/talk.js');
      const up = await t.readyNow(), t0 = performance.now();
      const said = await s.say([.1, 'Door three is opening.'], { voice: 'woman' });
      const ms = performance.now() - t0;
      const words = []; const said2 = await s.say("I'll have that back.", { voice: { kind: 'man', take: 1 }, fx: 'radio', size: 1.15, rate: 1.2, onWord: at => words.push(at) });
      const list = await s.voices();
      // a line of numbers and a made-up name, lively, said twice: the second time it is ready at once (the same take, kept)
      const o = { voice: 'man', lively: 1, respell: { Zorblax: 'zor blacks' } }, line3 = 'Zorblax pays £5.99 at 3:30 pm on the 14th.';
      let t1 = performance.now(); const said3 = await s.say(line3, o); const ms3 = performance.now() - t1;
      t1 = performance.now(); const again = await s.say(line3, o); const ms4 = performance.now() - t1;
      // a long line comes in pieces: the first (its first sentence) well before the last
      const long = 'Right. The bridge is out, the river is high, and the only other way round is the old mine road, which nobody has used in years.';
      t1 = performance.now(); const head = await t.speak({ text: long, voiceURI: 'gs-voice:daan', fresh: true }); const firstMs = performance.now() - t1;
      let n = head ? 1 : 0; for (let pc = head; pc && !pc.last; pc = await pc.more) n++;
      const lastMs = performance.now() - t1;
      // written ahead: prepare() while nothing is said, then say() starts at once
      const ahead = "We'll need a rope. And a lantern.", oa = { voice: { kind: 'woman', lang: ['en-ES'] } };
      const kept = { text: 'Kept for next time. Twice over.', voiceURI: 'gs-voice:giovanni' };
      for (let pc = await t.speak(kept); pc && !pc.last; pc = await pc.more);
      const prepared = await s.prepare(ahead, oa); t1 = performance.now();
      const said5 = await s.say(ahead, oa); const ms5 = performance.now() - t1;
      return { up, said, said2, ms, shaped: s.shaped(), words, n: list.length, first: list[0]?.name, cores: t.ownCores(), speed: t.ownSpeed(), threads: navigator.hardwareConcurrency, said3, ms3, again, ms4,
        pieces: n, firstMs, lastMs, prepared, said5, ms5 };
    });
    ok(r.up === true && r.speed >= 1.4, `page: the voice file loads in the worker, timed at ${r.speed.toFixed(1)}x real time at the start`);
    ok(r.said === true && r.shaped === true, `page: say() speaks with the built-in voice through the mixer (${(r.ms / 1000).toFixed(1)} s from the call to the last word)`);
    ok(r.said2 === true && r.words.length === 4, `page: a cast, shaped, faster line speaks with its words timed (${r.words.join(', ')})`);
    ok(r.n === TALK_VOICES.length && /built in/.test(r.first), `page: voices() lists the built-in ones (${r.first})`);
    ok(r.pieces >= 2 && r.firstMs < r.lastMs * .6, `page: a long line in ${r.pieces} pieces, the first in ${(r.firstMs / 1000).toFixed(2)} s, all in ${(r.lastMs / 1000).toFixed(2)} s`);
    ok(r.prepared === true && r.said5 === true, 'page: prepare() writes a line ahead and say() then says it');
    // a new launch: the lines said before come from the kept takes
    await p.reload();
    const k = await p.evaluate(async () => {
      const t = await import('/src/kit/talk.js'); await t.readyNow();
      const t0 = performance.now(), head = await t.speak({ text: 'Kept for next time. Twice over.', voiceURI: 'gs-voice:giovanni' });
      return { ms: performance.now() - t0, ok: !!head };
    });
    ok(k.ok && k.ms < 400, `page: after a reload, a line said before comes from the kept take (${k.ms.toFixed(0)} ms)`);
    ok(r.cores === (r.threads >= 8 ? 3 : r.threads >= 4 ? 2 : 1), `page: ${r.cores} worker${r.cores > 1 ? 's' : ''} write the voice (${r.threads} threads here)`);
    ok(r.said3 === true && r.again === true && r.ms4 < r.ms3, `page: numbers, a respelled name and lively said (${(r.ms3 / 1000).toFixed(1)} s), the same line again from the kept take (${(r.ms4 / 1000).toFixed(1)} s)`);
    ok(!errs.length, 'page: no errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally { await b.close(); await server.close(); }
}
