// Acts a mood on a recording with the app's own pitch code (src/kit/voice-pitch.js: PSOLA for the pitch and its range,
// WSOLA for the pace), for prompt.py. Praat's "Change gender" did this before; on four voices a speech-quality model
// scores these the same or a little higher (sad, which barely moves the pitch, 0.15 higher: Praat changed a recording
// even where nothing was asked of it, this gives it back as it was).
// Reads lines of JSON on stdin, { in, out, rate, st, range, pace } (in, out: raw 32-bit float files), writes one line
// back when each is done.
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync } from 'node:fs';
import { humanize, pace } from '../../src/kit/voice-pitch.js';

for await (const line of createInterface({ input: process.stdin })) {
  const o = JSON.parse(line), b = readFileSync(o.in), x = new Float32Array(b.buffer, b.byteOffset, b.length >> 2);
  // the whole voice moved st semitones and its swings range times as wide, nothing else of humanize's (no drift, jitter,
  // breath, noise); then the pace
  const y = humanize(Float32Array.from(x), o.rate, { wide: o.range, shift: 2 ** (o.st / 12), wobble: 0, drift: 0, jitter: 0, breath: 0, first: true, lo: .5, hi: 2 });
  const z = pace(y, o.rate, o.pace);
  writeFileSync(o.out, Buffer.from(z.buffer, z.byteOffset, z.byteLength));
  process.stdout.write(JSON.stringify({ n: z.length }) + '\n');
}
