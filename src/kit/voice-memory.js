// What each character has said lately, and how, so a line said again (or one shaped like it) comes out another way:
// games say the same lines over and over, and the same reading every time is much of what makes a character sound like
// a machine. A density bank (Rob's research, as gs.brains' Memory): each delivery a unit vector x (the words, the
// line's shape, which of four ways it was said), the bank rho the faded sum of x x' (positive, its trace kept at 1),
// and how familiar a new delivery is, x' rho x (0: nothing like it lately, 1: just this). Of the four ways to say a
// line, the least familiar is chosen: the first way (the line as it is always said, so it is kept and starts at once)
// until it has been heard lately.
//   const bank = deliveries();  bank.pick(text) -> take (0..3), without remembering it;  bank.said(text, take)
// Kit use (sound.js keeps one a character).

const D = 24, WORDS = 16, FADE = .8, PLAIN = .3;
// the four ways (talk-worker.js TAKES), as four directions as far from each other as they go (a tetrahedron's corners)
const WAYS = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(v => v.map(c => c / Math.sqrt(3)));

const hashOf = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return h >>> 0; };
/** The line itself: its words (hashed into WORDS slots, signed so unrelated words cancel) and its shape (asks, shouts, how long). */
function lineOf(text) {
  const t = String(text).toLowerCase(), v = new Float32Array(D), ws = t.match(/[\p{L}\p{N}']+/gu) || [];
  for (const w of ws) { const h = hashOf(w); v[h % WORDS] += h & 0x10000 ? 1 : -1; }
  let n = 0; for (let i = 0; i < WORDS; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1; for (let i = 0; i < WORDS; i++) v[i] *= .8 / n;   // (the words are most of what makes a line the same line)
  v[WORDS] = /\?/.test(t) ? .25 : 0; v[WORDS + 1] = /!/.test(t) ? .25 : 0; v[WORDS + 2] = Math.min(1, ws.length / 12) * .25;
  return v;
}
function deliveryOf(line, take) {
  const x = line.slice(), w = WAYS[take];
  for (let i = 0; i < 3; i++) x[WORDS + 3 + i] = w[i] * .55;
  let n = 0; for (let i = 0; i < D; i++) n += x[i] * x[i];
  n = Math.sqrt(n) || 1; for (let i = 0; i < D; i++) x[i] /= n;
  return x;
}

export function deliveries() {
  const rho = new Float32Array(D * D);
  let trace = 0;
  const familiar = x => { if (!trace) return 0; let s = 0; for (let i = 0; i < D; i++) { let r = 0; for (let j = 0; j < D; j++) r += rho[i * D + j] * x[j]; s += x[i] * r; } return s / trace; };
  return {
    /** Which of the four ways to say it now: the first, unless that has been heard lately; then the least familiar. */
    pick(text) {
      const line = lineOf(text), f = WAYS.map((_, k) => familiar(deliveryOf(line, k)));
      if (f[0] < PLAIN) return 0;
      let best = 0; for (let k = 1; k < 4; k++) if (f[k] < f[best]) best = k;
      return best;
    },
    /** Remembers that it was said, that way (older lines fade: about the last five count). */
    said(text, take = 0) {
      const x = deliveryOf(lineOf(text), take | 0);
      for (let i = 0; i < D * D; i++) rho[i] *= FADE;
      for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) rho[i * D + j] += x[i] * x[j];
      trace = trace * FADE + 1;
    },
    /** How familiar saying it that way would be now (0..1). */
    familiar: (text, take = 0) => familiar(deliveryOf(lineOf(text), take | 0)),
  };
}
