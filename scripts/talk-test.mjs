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
import { makeTTS, makeFlow, makeMimi, seeded } from '../src/kit/pocket-tts.js';
import { spoken, respell } from '../src/kit/say-words.js';
import { stretch } from '../src/kit/voice-fx.js';
import { cast, wantOf, describe } from '../src/kit/voices.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails++; };

// casting from the built-in list (no file needed): what talk.js lists, built the same way
globalThis.__gsOwnVoice = true;
const { ownVoices, castOwn } = await import('../src/kit/talk.js');
{
  const list = ownVoices(), kindOf = at => TALK_VOICES[at].kind, pick = w => castOwn(wantOf(w));
  const women = new Set(), men = new Set();
  for (let take = 0; take < 9; take++) { const w = pick({ kind: 'woman', take }); women.add(w.at); ok(kindOf(w.at) === 'woman' && w.pitch === 1, `cast: woman take ${take} is ${TALK_VOICES[w.at].name} (${TALK_VOICES[w.at].lang})`); }
  for (let take = 0; take < 7; take++) { const m = pick({ kind: 'man', take }); men.add(m.at); ok(kindOf(m.at) === 'man' && m.pitch === 1, `cast: man take ${take} is ${TALK_VOICES[m.at].name} (${TALK_VOICES[m.at].lang})`); }
  ok(women.size === 9 && men.size === 7, 'cast: every voice of a kind is a different one before any repeats');
  ok(TALK_VOICES[pick({ kind: 'woman', take: 0 }).at].lang === 'en-GB' && pick({ kind: 'woman', take: 9 }).pitch !== 1, 'cast: a British voice first (the default accent), a nudged pitch once all are used');
  ok(TALK_VOICES[pick({ kind: 'woman', lang: 'en-US' }).at].lang === 'en-US' && TALK_VOICES[pick({ kind: 'man', lang: ['en-US'], take: 1 }).at].lang === 'en-US', 'cast: American voices when asked for en-US');
  ok(TALK_VOICES[pick({ kind: 'woman', take: 3 }).at].name === 'eponine', 'cast: a Scottish woman next after the English ones (en-GB-scotland is in en-GB)');
  ok(castOwn(wantOf({ kind: 'man', lang: 'fr-FR' })) === null, 'cast: no built-in voice for French (the computer says it)');
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
  { // the two halves (a worker each) say it exactly as one does
    const flow = makeFlow(pack), front = makeMimi(pack, { part: 'front' }), back = makeMimi(pack, { part: 'back' }), one = say('Two cores, one voice.', 'paul', 9);
    const l = flow.line('Two cores, one voice.', 'paul', { rnd: seeded(9) }), parts = []; let lat, SA, SB, tf = 0, tb = 0;
    while ((lat = l.next())) {
      const first = l.first || !SA; if (first) { SA = front.start(); SB = back.start(); }
      let t = performance.now(); const rows = front.front(SA, lat); tf += performance.now() - t;
      t = performance.now(); const out = back.back(SB, rows); tb += performance.now() - t;
      if (first) for (let i = 0; i < 120; i++) out[i] *= i / 119;
      parts.push(out);
    }
    const two = new Float32Array(parts.length * 1920); parts.forEach((p, i) => two.set(p, i * 1920));
    ok(two.length === one.length && two.every((x, i) => x === one[i]), `two halves: the same sound as one (text and front ${(tf / parts.length).toFixed(1)} ms a frame, back ${(tb / parts.length).toFixed(1)} ms)`);
  }
  { // lively: a wider pitch range, the same length of line, the words still there
    const plain = say('Oh, you found it! That is wonderful news.', 'george', 4), live = (() => { const l = tts.line('Oh, you found it! That is wonderful news.', 'george', { rnd: seeded(4), lively: 1 }), ps = []; let c; while ((c = l.next())) ps.push(c); const a = new Float32Array(ps.length * 1920); ps.forEach((p, i) => a.set(p, i * 1920)); return a; })();
    const spread = a => { const hz = pitches(a, tts.rate); const st = hz.map(h => 12 * Math.log2(h / 100)), m = st.reduce((x, y) => x + y, 0) / st.length; return Math.sqrt(st.reduce((x, y) => x + (y - m) ** 2, 0) / st.length); };
    ok(live.length === plain.length && spread(live) > spread(plain) * 1.1, `lively: pitch spread ${spread(plain).toFixed(2)} -> ${spread(live).toFixed(2)} semitones`);
  }
  const long = say('This is a longer line. It goes on for a while, in more than one part, so that it is cut into pieces of text the model reads one after another, and each still comes out.', 'george');
  ok(long.length / tts.rate > 7, `a long line in parts: ${(long.length / tts.rate).toFixed(1)} s`);
  // the file the PR check makes is the one talk-files.js pins (writeTo checked its SHA-256)
  ok(bytes.length > 8e6 && bytes.length < 16e6, `file: ${(bytes.length / 1e6).toFixed(1)} MB (${TALK_VERSION}/${TALK_FILE})`);
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
      return { up, said, said2, ms, shaped: s.shaped(), words, n: list.length, first: list[0]?.name, cores: t.ownCores(), threads: navigator.hardwareConcurrency, said3, ms3, again, ms4 };
    });
    ok(r.up === true, 'page: the voice file loads in the worker');
    ok(r.said === true && r.shaped === true, `page: say() speaks with the built-in voice through the mixer (${(r.ms / 1000).toFixed(1)} s from the call to the last word)`);
    ok(r.said2 === true && r.words.length === 4, `page: a cast, shaped, faster line speaks with its words timed (${r.words.join(', ')})`);
    ok(r.n === TALK_VOICES.length && /built in/.test(r.first), `page: voices() lists the built-in ones (${r.first})`);
    ok(r.cores === (r.threads >= 4 ? 2 : 1), `page: ${r.cores} worker${r.cores > 1 ? 's' : ''} write the voice (${r.threads} threads here)`);
    ok(r.said3 === true && r.again === true && r.ms4 < r.ms3, `page: numbers, a respelled name and lively said (${(r.ms3 / 1000).toFixed(1)} s), the same line again from the kept take (${(r.ms4 / 1000).toFixed(1)} s)`);
    ok(!errs.length, 'page: no errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } finally { await b.close(); await server.close(); }
}
