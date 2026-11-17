// humanize() for tune.py: a line of JSON { voice, p (humanize's settings, or null), tempo, out, n } on stdin writes the
// voice's first n takes (lines.mjs) made more human to out/<id>.24k, and prints "ok".
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), WORK = process.env.WORK || join(ROOT, 'ml-cache/talk-human');
const { humanize, endOf } = await import(join(ROOT, 'src/kit/voice-pitch.js'));
const { stretch } = await import(join(ROOT, 'src/kit/voice-fx.js'));
const cache = {};
const load = v => cache[v] ||= JSON.parse(readFileSync(join(WORK, 'gen', v, 'meta.json'), 'utf8')).map(m => ({ ...m, pcm: Array.from({ length: m.parts }, (_, i) => new Float32Array(readFileSync(join(WORK, 'gen', v, `${m.id}-${i}.24k`)).buffer.slice(0))) }));
for await (const l of createInterface({ input: process.stdin })) {
  const q = JSON.parse(l), lines = load(q.voice).slice(0, q.n || 99); mkdirSync(q.out, { recursive: true });
  for (const m of lines) {
    const done = m.pcm.map((x, i) => {
      const y = q.p ? humanize(x, 24000, { ...q.p, seed: m.seed + i, first: i === 0, end: endOf(m.partText[i]) }) : x;
      return q.tempo && Math.abs(q.tempo - 1) > .01 ? stretch(y, 24000, q.tempo) : y;
    });
    const n = done.reduce((a, x) => a + x.length, 0), a = new Float32Array(n); let k = 0; for (const x of done) { a.set(x, k); k += x.length; }
    writeFileSync(join(q.out, `${m.id}.24k`), Buffer.from(a.buffer));
  }
  console.log('ok');
}
