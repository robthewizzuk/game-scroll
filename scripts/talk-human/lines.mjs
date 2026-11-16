// The model's own takes (before humanize()) for each voice, of its real speaker's sentences (the VCTK texts; another
// voice says p228's), a file per part, for tune.py to make more human over and over.
//   node scripts/talk-human/lines.mjs [voice,voice...] [count]     writes $WORK/gen/<voice>/
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), WORK = process.env.WORK || join(ROOT, 'ml-cache/talk-human');
const { unpack } = await import(join(ROOT, 'src/kit/talk-pack.js'));
const { makeTTS, seeded } = await import(join(ROOT, 'src/kit/pocket-tts.js'));
const { TALK_VOICES, TALK_VERSION, TALK_FILE } = await import(join(ROOT, 'src/kit/talk-files.js'));
const { spoken } = await import(join(ROOT, 'src/kit/say-words.js'));
const tts = makeTTS(unpack(readFileSync(join(ROOT, 'ml-cache', TALK_VERSION, TALK_FILE))));   // (node scripts/talk-pack.mjs)
const texts = JSON.parse(readFileSync(join(WORK, 'ref/texts.json'), 'utf8'));
const [which = TALK_VOICES.map(v => v.name).join(','), N = 16] = process.argv.slice(2);
for (const name of which.split(',')) {
  const v = TALK_VOICES.find(x => x.name === name), spk = (v.credit.match(/speaker (p\d+)/) || [])[1];
  const from = spk && Object.keys(texts).some(k => k.startsWith(spk + '/')) ? spk : 'p228';
  let ids = Object.keys(texts).filter(k => k.startsWith(from + '/')).sort();
  ids = ids.filter((_, i) => i % Math.max(1, Math.floor(ids.length / N)) === 0).slice(0, +N);
  const dir = join(WORK, 'gen', name); mkdirSync(dir, { recursive: true });
  const meta = [];
  for (const id of ids) {
    const tid = id.split('/')[1], text = texts[id], seed = [...tid].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    const l = tts.line(spoken(text, { lang: 'en-GB' }), name, { rnd: seeded(seed), quick: true });
    const parts = []; let c, cur = -1;
    while ((c = l.next())) { if (l.part !== cur) { parts.push([]); cur = l.part; } parts[parts.length - 1].push(c); }
    parts.forEach((p, i) => { const n = p.reduce((a, x) => a + x.length, 0), a = new Float32Array(n); let k = 0; for (const x of p) { a.set(x, k); k += x.length; } writeFileSync(join(dir, `${tid}-${i}.24k`), Buffer.from(a.buffer)); });
    meta.push({ id: tid, text, seed, parts: parts.length, partText: l.parts });
  }
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta));
  console.log(name, ids.length, from);
}
