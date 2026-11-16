// One small fast sum for the engine's own neural nets (pocket-tts.js): C = A·Bᵀ (+ bias), with the four-wide
// number lanes every computer and phone has (WebAssembly SIMD). The module's bytes are written here at load time,
// so there is no file to ship and nothing to build. Kit use only.
//
//   const g = gemm(memory)       memory: a WebAssembly.Memory holding A, B, C and bias (offsets count floats)
//   g(a, lda, b, ldb, c, ldc, M, N, K, bias)
//       C[m*ldc + n] = bias[n] + Σk A[m*lda + k] · B[n*ldb + k]    for m < M, n < N  (bias 0: none)
//   g.wsum(w, n, v, ldv, out, D, acc)   out[i] (+)= Σj w[j]·v[j*ldv + i], i < D: attention's weighted sum of values
//   K and D are multiples of 4. Where WebAssembly SIMD is missing, the same sum in plain JavaScript (slower).

const leb = (n, out) => { do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; out.push(b); } while (n); return out; };
const sleb = (n, out) => { for (;;) { const b = n & 0x7f; n >>= 7; if ((n === 0 && !(b & 0x40)) || (n === -1 && (b & 0x40))) { out.push(b); return out; } out.push(b | 0x80); } };
const str = s => [...leb(s.length, []), ...[...s].map(c => c.charCodeAt(0))];
const section = (id, body) => [id, ...leb(body.length, []), ...body];
const vec = items => [...leb(items.length, []), ...items.flat()];

// R rows of A at a time (2 or 4) against 4 rows of B, each loaded once a step and used for every row of A: R x 4 sums
// in registers. 4 rows suit phones (32 vector registers), 2 most PCs (16); gemm() times both and keeps the faster.
function gemmBody(fma = false, R = 2) {
  // params: a lda b ldb c ldc M N K bias (all i32, floats counted)
  const A = 0, LDA = 1, B = 2, LDB = 3, C = 4, LDC = 5, M = 6, N = 7, K = 8, BIAS = 9;
  // i32 locals
  let at = 10; const m = at++, n = at++, kk = at++, K4 = at++, ar = [at++, at++, at++, at++], cr = [at++, at++, at++, at++], bb = [at++, at++, at++, at++];
  const nI32 = at - 10;
  // v128 locals
  const acc = Array.from({ length: 4 }, () => [at++, at++, at++, at++]), bv = [at++, at++, at++, at++], av = at++;
  const nV = at - 10 - nI32;
  const c = [];
  const get = i => c.push(0x20, ...leb(i, [])), set = i => c.push(0x21, ...leb(i, [])), tee = i => c.push(0x22, ...leb(i, []));
  const i32 = v => c.push(0x41, ...sleb(v, []));
  const add = () => c.push(0x6a), mul = () => c.push(0x6c), shl = () => c.push(0x74), lts = () => c.push(0x48), les = () => c.push(0x4c), not = () => c.push(0x41, 1, 0x73);
  const simd = op => c.push(0xfd, ...leb(op, []));
  const vload = () => { simd(0x00); c.push(0, 0); }, vzero = () => { simd(0x0c); for (let i = 0; i < 16; i++) c.push(0); };
  const fadd4 = () => simd(0xe4), fmul4 = () => simd(0xe6), lane = l => { simd(0x1f); c.push(l); };
  // acc += x * y: one fused multiply-add where relaxed SIMD has it (f32x4.relaxed_madd)
  const madd = (sum, x, y) => { if (fma) { get(x); get(y); get(sum); simd(0x105); } else { get(sum); get(x); get(y); fmul4(); fadd4(); } set(sum); };
  const f32load = () => c.push(0x2a, 2, 0), f32store = () => c.push(0x38, 2, 0), fadd = () => c.push(0x92);
  const block = () => c.push(0x02, 0x40), loop = () => c.push(0x03, 0x40), end = () => c.push(0x0b), br = d => c.push(0x0c, d), brif = d => c.push(0x0d, d);
  const iff = () => c.push(0x04, 0x40), els = () => c.push(0x05);
  const hsum = v => { get(v); lane(0); get(v); lane(1); fadd(); get(v); lane(2); fadd(); get(v); lane(3); fadd(); };
  const store = (row, col, sum) => {      // C[row + col] = sum (+ bias[col])
    get(row); get(n); i32(col); add(); i32(2); shl(); add();
    hsum(sum);
    get(BIAS); c.push(0x04, 0x7d); get(BIAS); get(n); add(); i32(col); add(); i32(2); shl(); f32load(); els(); c.push(0x43, 0, 0, 0, 0); end(); fadd();
    f32store();
  };
  const bRows = cols => {                 // bb[j] = byte address of B's row n + j
    get(B); get(n); get(LDB); mul(); add(); i32(2); shl(); set(bb[0]);
    for (let j = 1; j < cols; j++) { get(bb[j - 1]); get(LDB); i32(2); shl(); add(); set(bb[j]); }
  };
  // rows m .. m + r - 1 of C against B's rows n .. n + cols - 1 (bb, set by the caller)
  const tile = (r, cols) => {
    get(A); get(m); get(LDA); mul(); add(); i32(2); shl(); set(ar[0]);
    get(C); get(m); get(LDC); mul(); add(); i32(2); shl(); set(cr[0]);
    for (let i = 1; i < r; i++) { get(ar[i - 1]); get(LDA); i32(2); shl(); add(); set(ar[i]); get(cr[i - 1]); get(LDC); i32(2); shl(); add(); set(cr[i]); }
    for (let i = 0; i < r; i++) for (let j = 0; j < cols; j++) { vzero(); set(acc[i][j]); }
    i32(0); set(kk);
    block(); loop();
      get(kk); get(K4); lts(); not(); brif(1);
      for (let j = 0; j < cols; j++) { get(bb[j]); get(kk); add(); vload(); set(bv[j]); }
      for (let i = 0; i < r; i++) { get(ar[i]); get(kk); add(); vload(); set(av); for (let j = 0; j < cols; j++) madd(acc[i][j], av, bv[j]); }
      get(kk); i32(16); add(); set(kk); br(0);
    end(); end();
    for (let i = 0; i < r; i++) for (let j = 0; j < cols; j++) store(cr[i], j, acc[i][j]);
    get(m); i32(r); add(); set(m);
  };
  get(K); i32(2); shl(); set(K4);
  // B's rows (the weights, the big one) four at a time on the outside, so each is read from memory once and used for
  // every row of A while it is close at hand; then the last few one at a time
  i32(0); set(n);
  for (const cols of [4, 1]) {
    block(); loop();
      if (cols === 4) { get(n); i32(4); add(); get(N); les(); } else { get(n); get(N); lts(); }
      not(); brif(1);
      bRows(cols);
      i32(0); set(m);
      block(); loop();                                                   // A's rows, R at a time while they last
        get(m); get(M); lts(); not(); brif(1);
        get(m); i32(R); add(); get(M); les();
        iff(); tile(R, cols); els(); tile(1, cols); end();
        br(0);
      end(); end();
      get(n); i32(cols); add(); set(n); br(0);
    end(); end();
  }
  end();
  const locals = vec([[...leb(nI32, []), 0x7f], [...leb(nV, []), 0x7b]]);
  return [...locals, ...c];
}

// wsum(w, n, v, ldv, out, D, acc): out[i] (+)= Σj w[j] · v[j*ldv + i] for i < D (a multiple of 4): attention's weighted values
function wsumBody() {
  const Wt = 0, Nn = 1, Vv = 2, LDV = 3, OUT = 4, Dd = 5, ACC = 6;
  const i = 7, j = 8, vr = 9, D4 = 10, N4 = 11, s = 12, wv = 13;
  const c = [];
  const get = k => c.push(0x20, ...leb(k, [])), set = k => c.push(0x21, ...leb(k, []));
  const i32 = v => c.push(0x41, ...sleb(v, []));
  const add = () => c.push(0x6a), shl = () => c.push(0x74), lts = () => c.push(0x48), not = () => c.push(0x41, 1, 0x73);
  const simd = op => c.push(0xfd, ...leb(op, []));
  const vload = () => { simd(0x00); c.push(0, 0); };
  get(Dd); i32(2); shl(); set(D4); get(Nn); i32(2); shl(); set(N4);
  get(Wt); i32(2); shl(); set(Wt); get(Vv); i32(2); shl(); set(Vv); get(OUT); i32(2); shl(); set(OUT); get(LDV); i32(2); shl(); set(LDV);
  i32(0); set(i);
  c.push(0x02, 0x40, 0x03, 0x40);
    get(i); get(D4); lts(); not(); c.push(0x0d, 1);
    get(ACC); c.push(0x04, 0x7b); get(OUT); get(i); add(); vload(); c.push(0x05); simd(0x0c); for (let k = 0; k < 16; k++) c.push(0); c.push(0x0b); set(s);
    get(Vv); get(i); add(); set(vr);
    i32(0); set(j);
    c.push(0x02, 0x40, 0x03, 0x40);
      get(j); get(N4); lts(); not(); c.push(0x0d, 1);
      get(Wt); get(j); add(); c.push(0x2a, 2, 0); simd(0x13); set(wv);       // splat w[j]
      get(s); get(wv); get(vr); vload(); simd(0xe6); simd(0xe4); set(s);
      get(vr); get(LDV); add(); set(vr);
      get(j); i32(4); add(); set(j); c.push(0x0c, 0);
    c.push(0x0b, 0x0b);
    get(OUT); get(i); add(); get(s); simd(0x0b); c.push(0, 0);            // v128.store
    get(i); i32(16); add(); set(i); c.push(0x0c, 0);
  c.push(0x0b, 0x0b, 0x0b);
  return [...vec([[...leb(5, []), 0x7f], [...leb(2, []), 0x7b]]), ...c];
}

function moduleBytes(pages, fma, R) {
  const g = gemmBody(fma, R), w = wsumBody(), sig = n => [0x60, ...vec(Array.from({ length: n }, () => [0x7f])), 0];
  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, vec([sig(10), sig(7)])),
    ...section(2, vec([[...str('e'), ...str('m'), 0x02, 0x00, ...leb(pages, [])]])),
    ...section(3, vec([[0], [1]])),
    ...section(7, vec([[...str('gemm'), 0x00, 0], [...str('wsum'), 0x00, 1]])),
    ...section(10, vec([[...leb(g.length, []), ...g], [...leb(w.length, []), ...w]])),
  ]);
}

/** The same sum in plain JavaScript (no WebAssembly SIMD). */
function slow(F) {
  return (a, lda, b, ldb, c, ldc, M, N, K, bias) => {
    for (let m = 0; m < M; m++) {
      const ar = a + m * lda, cr = c + m * ldc;
      for (let n = 0; n < N; n++) {
        const br = b + n * ldb; let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
        for (let k = 0; k < K; k += 4) { s0 += F[ar + k] * F[br + k]; s1 += F[ar + k + 1] * F[br + k + 1]; s2 += F[ar + k + 2] * F[br + k + 2]; s3 += F[ar + k + 3] * F[br + k + 3]; }
        F[cr + n] = s0 + s1 + s2 + s3 + (bias ? F[bias + n] : 0);
      }
    }
  };
}

function slowWsum(F) {
  return (w, n, v, ldv, out, D, acc) => {
    if (!acc) F.fill(0, out, out + D);
    for (let j = 0; j < n; j++) { const a = F[w + j], r = v + j * ldv; for (let i = 0; i < D; i++) F[out + i] += a * F[r + i]; }
  };
}

/** Which tile is faster on this device (2 or 4 rows a step), timed once on a sum the size of the voice's. */
let bestR = 0;
function pickRows(fma) {
  if (bestR) return bestR;
  try {
    const mem = new WebAssembly.Memory({ initial: 64 }), F = new Float32Array(mem.buffer);
    for (let i = 0; i < 1 << 19; i++) F[i] = ((i * 7919) % 97) / 97 - .5;
    const time = R => {
      const fn = new WebAssembly.Instance(new WebAssembly.Module(moduleBytes(64, fma, R)), { e: { m: mem } }).exports.gemm;
      let best = 1e9;
      for (let r = 0; r < 7; r++) { const t = performance.now(); fn(0, 512, 16384, 512, 1 << 19, 384, 16, 384, 512, 0); best = Math.min(best, performance.now() - t); }
      return best;
    };
    time(2); time(4);   // (warmed up)
    bestR = time(4) < time(2) * .97 ? 4 : 2;
  } catch { bestR = 2; }
  return bestR;
}

/** gemm over this memory, with .wsum (see wsumBody); `.simd` says whether they are the fast ones, `.rows` the tile it uses. */
export function gemm(memory, { plain = false, fma = true, rows = 0 } = {}) {
  const pages = memory.buffer.byteLength / 65536;
  if (!plain) for (const fused of fma ? [true, false] : [false]) {
    try {   // fused multiply-adds where the browser has relaxed SIMD, else the plain four-wide sums
      const R = rows || pickRows(fused), mod = new WebAssembly.Module(moduleBytes(pages, fused, R));
      const ex = new WebAssembly.Instance(mod, { e: { m: memory } }).exports, fn = ex.gemm;
      fn.wsum = ex.wsum; fn.simd = true; fn.fma = fused; fn.rows = R;
      return fn;
    } catch (e) { if (globalThis.process?.env?.GEMM_DEBUG) console.error(e); /* not here */ }
  }
  const F = new Float32Array(memory.buffer), fn = slow(F); fn.wsum = slowWsum(F); fn.simd = false; fn.fma = false;
  return fn;
}
