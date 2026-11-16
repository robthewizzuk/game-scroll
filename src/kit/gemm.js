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

function gemmBody(fma = false) {
  // params: a lda b ldb c ldc M N K bias (all i32, floats counted)
  const A = 0, LDA = 1, B = 2, LDB = 3, C = 4, LDC = 5, M = 6, N = 7, K = 8, BIAS = 9;
  // locals
  const m = 10, n = 11, kk = 12, ar = 13, cr = 14, b0 = 15, b1 = 16, b2 = 17, b3 = 18, K4 = 19, ar2 = 20, cr2 = 21;
  const a0 = 22, s0 = 23, s1 = 24, s2 = 25, s3 = 26, t0 = 27, t1 = 28, t2 = 29, t3 = 30, a1 = 31;   // v128
  const f = 32;   // f32
  const c = [];
  const get = i => c.push(0x20, ...leb(i, [])), set = i => c.push(0x21, ...leb(i, [])), tee = i => c.push(0x22, ...leb(i, []));
  const i32 = v => c.push(0x41, ...sleb(v, []));
  const add = () => c.push(0x6a), mul = () => c.push(0x6c), shl = () => c.push(0x74), lts = () => c.push(0x48), les = () => c.push(0x4c);
  const simd = op => c.push(0xfd, ...leb(op, []));
  const vload = () => { simd(0x00); c.push(0, 0); }, vzero = () => { simd(0x0c); for (let i = 0; i < 16; i++) c.push(0); };
  const fadd4 = () => simd(0xe4), fmul4 = () => simd(0xe6), lane = l => { simd(0x1f); c.push(l); };
  // acc += x * y, x and y pushed by the two functions: one fused multiply-add where relaxed SIMD has it (f32x4.relaxed_madd)
  const madd = (acc, x, y) => { if (fma) { x(); y(); get(acc); simd(0x105); } else { get(acc); x(); y(); fmul4(); fadd4(); } set(acc); };
  const f32load = () => c.push(0x2a, 2, 0), f32store = () => c.push(0x38, 2, 0), fadd = () => c.push(0x92);
  const block = () => c.push(0x02, 0x40), loop = () => c.push(0x03, 0x40), end = () => c.push(0x0b), br = d => c.push(0x0c, d), brif = d => c.push(0x0d, d);
  const iff = () => c.push(0x04, 0x40), els = () => c.push(0x05);
  const bytesOf = i => { get(i); i32(2); shl(); };                       // floats -> bytes
  const hsum = v => { get(v); lane(0); get(v); lane(1); fadd(); get(v); lane(2); fadd(); get(v); lane(3); fadd(); };
  // acc += load(x + kk) * load(y + kk)
  const mac = (acc, x, y) => madd(acc, () => { get(x); get(kk); add(); vload(); }, () => { get(y); get(kk); add(); vload(); });
  const store = (row, col, sum) => {      // C[row + col] = sum (+ bias[col])
    get(row); get(n); i32(col); add(); i32(2); shl(); add();
    hsum(sum);
    get(BIAS); c.push(0x04, 0x7d); get(BIAS); get(n); add(); i32(col); add(); i32(2); shl(); f32load(); els(); c.push(0x43, 0, 0, 0, 0); end(); fadd();
    f32store();
  };
  // byte sizes
  bytesOf(K); set(K4);
  i32(0); set(m);
  block(); loop();                                                       // rows, two at a time while they last
    get(m); get(M); lts(); i32(1); c.push(0x73); brif(1);                // m >= M: done   (0x73 = i32.xor)
    get(A); get(m); get(LDA); mul(); add(); i32(2); shl(); set(ar);
    get(C); get(m); get(LDC); mul(); add(); i32(2); shl(); set(cr);
    get(m); i32(1); add(); get(M); lts();
    iff();                                                               // two rows: m and m + 1
      get(ar); get(LDA); i32(2); shl(); add(); set(ar2);
      get(cr); get(LDC); i32(2); shl(); add(); set(cr2);
      i32(0); set(n);
      block(); loop();
        get(n); i32(4); add(); get(N); les(); i32(1); c.push(0x73); brif(1);
        get(B); get(n); get(LDB); mul(); add(); i32(2); shl(); tee(b0); get(LDB); i32(2); shl(); add(); tee(b1); get(LDB); i32(2); shl(); add(); tee(b2); get(LDB); i32(2); shl(); add(); set(b3);
        vzero(); set(s0); vzero(); set(s1); vzero(); set(s2); vzero(); set(s3); vzero(); set(t0); vzero(); set(t1); vzero(); set(t2); vzero(); set(t3);
        i32(0); set(kk);
        block(); loop();
          get(kk); get(K4); lts(); i32(1); c.push(0x73); brif(1);
          get(ar); get(kk); add(); vload(); set(a0);
          get(ar2); get(kk); add(); vload(); set(a1);
          for (const [acc, br0, row] of [[s0, b0, a0], [s1, b1, a0], [s2, b2, a0], [s3, b3, a0], [t0, b0, a1], [t1, b1, a1], [t2, b2, a1], [t3, b3, a1]]) {
            madd(acc, () => get(row), () => { get(br0); get(kk); add(); vload(); });
          }
          get(kk); i32(16); add(); set(kk); br(0);
        end(); end();
        store(cr, 0, s0); store(cr, 1, s1); store(cr, 2, s2); store(cr, 3, s3);
        store(cr2, 0, t0); store(cr2, 1, t1); store(cr2, 2, t2); store(cr2, 3, t3);
        get(n); i32(4); add(); set(n); br(0);
      end(); end();
      block(); loop();                                                   // the last few columns, one at a time
        get(n); get(N); lts(); i32(1); c.push(0x73); brif(1);
        get(B); get(n); get(LDB); mul(); add(); i32(2); shl(); set(b0);
        vzero(); set(s0); vzero(); set(t0);
        i32(0); set(kk);
        block(); loop();
          get(kk); get(K4); lts(); i32(1); c.push(0x73); brif(1);
          get(b0); get(kk); add(); vload(); set(a1);
          madd(s0, () => { get(ar); get(kk); add(); vload(); }, () => get(a1));
          madd(t0, () => { get(ar2); get(kk); add(); vload(); }, () => get(a1));
          get(kk); i32(16); add(); set(kk); br(0);
        end(); end();
        store(cr, 0, s0); store(cr2, 0, t0);
        get(n); i32(1); add(); set(n); br(0);
      end(); end();
      get(m); i32(2); add(); set(m);
    els();                                                               // one row
      i32(0); set(n);
      block(); loop();
        get(n); i32(4); add(); get(N); les(); i32(1); c.push(0x73); brif(1);
        get(B); get(n); get(LDB); mul(); add(); i32(2); shl(); tee(b0); get(LDB); i32(2); shl(); add(); tee(b1); get(LDB); i32(2); shl(); add(); tee(b2); get(LDB); i32(2); shl(); add(); set(b3);
        vzero(); set(s0); vzero(); set(s1); vzero(); set(s2); vzero(); set(s3);
        i32(0); set(kk);
        block(); loop();
          get(kk); get(K4); lts(); i32(1); c.push(0x73); brif(1);
          get(ar); get(kk); add(); vload(); set(a0);
          for (const [acc, br0] of [[s0, b0], [s1, b1], [s2, b2], [s3, b3]]) madd(acc, () => get(a0), () => { get(br0); get(kk); add(); vload(); });
          get(kk); i32(16); add(); set(kk); br(0);
        end(); end();
        store(cr, 0, s0); store(cr, 1, s1); store(cr, 2, s2); store(cr, 3, s3);
        get(n); i32(4); add(); set(n); br(0);
      end(); end();
      block(); loop();
        get(n); get(N); lts(); i32(1); c.push(0x73); brif(1);
        get(B); get(n); get(LDB); mul(); add(); i32(2); shl(); set(b0);
        vzero(); set(s0);
        i32(0); set(kk);
        block(); loop();
          get(kk); get(K4); lts(); i32(1); c.push(0x73); brif(1);
          mac(s0, ar, b0);
          get(kk); i32(16); add(); set(kk); br(0);
        end(); end();
        store(cr, 0, s0);
        get(n); i32(1); add(); set(n); br(0);
      end(); end();
      get(m); i32(1); add(); set(m);
    end();
    br(0);
  end(); end();
  end();
  void f;
  const locals = vec([[...leb(12, []), 0x7f], [...leb(10, []), 0x7b], [1, 0x7d]]);
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

function moduleBytes(pages, fma) {
  const g = gemmBody(fma), w = wsumBody(), sig = n => [0x60, ...vec(Array.from({ length: n }, () => [0x7f])), 0];
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

/** gemm over this memory, with .wsum (see wsumBody); `.simd` says whether they are the fast ones. */
export function gemm(memory, { plain = false, fma = true } = {}) {
  const pages = memory.buffer.byteLength / 65536;
  if (!plain) for (const fused of fma ? [true, false] : [false]) {
    try {   // fused multiply-adds where the browser has relaxed SIMD, else the plain four-wide sums
      const mod = new WebAssembly.Module(moduleBytes(pages, fused));
      const ex = new WebAssembly.Instance(mod, { e: { m: memory } }).exports, fn = ex.gemm;
      fn.wsum = ex.wsum; fn.simd = true; fn.fma = fused;
      return fn;
    } catch (e) { if (globalThis.process?.env?.GEMM_DEBUG) console.error(e); /* not here */ }
  }
  const F = new Float32Array(memory.buffer), fn = slow(F); fn.wsum = slowWsum(F); fn.simd = false; fn.fma = false;
  return fn;
}
