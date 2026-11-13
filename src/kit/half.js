// Half precision (16-bit numbers) in the kit's own WebGPU passes, on graphics chips that have it (WebGPU's
// 'shader-f16': most phones' chips have it; the build machine's software WebGPU does not). A colour or a
// weight in half takes half the room in the chip's registers, and phone chips work most half maths at up
// to twice the speed, so a pass that is mostly sums of colours costs less. Depth, places, motion and texture
// positions stay in full precision: half has about three digits, so a place a few hundred metres out, or a
// pixel's place on a big screen, would be off by more than a pixel. Qualcomm's own SGSR 2 shader works
// its upscale pass in half (mediump) the same way; the WebGL version (sgsr2.js) already does.
//
// three's shading language (TSL) has only full-precision numbers, so a pass's maths in half is WGSL written
// here with halfFn: hf, hf2, hf3 and hf4 are its half numbers, HEPS the smallest number it divides by. On a chip
// with 'shader-f16' they are f16; everywhere else the same text is compiled with f32, so the build machine
// draws exactly the same maths, in full precision. Its parameters and its answer are full precision (three
// reads a WGSL function's types from its first line), and the function turns them into half inside.
// Each one is compiled once on its own in half before any material uses it (halfCheck, from gpu.js when
// WebGPU starts): one the chip won't compile is drawn in full precision instead and named in HD.info.half,
// so a mistake that only a phone can show costs the speed, never the picture.
//
// HD.half = false (the frame lab's switch: Half, and A/B) draws everything in full precision, to compare.
// Kit use only (hd3d-gpu.js and the passes it loads).
import { Node } from 'three/webgpu';
import { wgslFn, nodeObject } from 'three/tsl';

/**
 * on: HD.half (hd3d.js sets it each frame); chip: the chip has 'shader-f16' (null until halfCheck ran); failed: functions
 * the chip would not compile in half; pretend: HD.halfPretend, tests on a chip without half: everything acts as if it had
 * it (the switch, the passes built again, the frame lab's check) but the maths is drawn in full.
 */
export const HALF = { on: true, chip: null, failed: [], pretend: false };
const ALL = [];

// the WGSL text of a function in one precision: hf.. become f16 or f32 types
const HALF_TYPE = { hf: 'X', hf2: 'vec2<X>', hf3: 'vec3<X>', hf4: 'vec4<X>' };
function textOf(name, src, p) {
  return `fn ${name}_${p}${src}`.replace(/\b(hf[234]?)\b/g, (_, t) => HALF_TYPE[t].replace('X', p)).replace(/\bHEPS\b/g, p === 'f16' ? '6.104e-5' : '1.192e-7');
}

// a call to a half function: in half it also has the shader say so ('enable f16;' at its head). (three
// works a node out once into a variable when its answer is used more than once.)
class HalfCall extends Node {
  static get type() { return 'HalfCall'; }
  constructor(call, f16) { super(); this.call = call; this.f16 = f16; }
  getNodeType(b) { return this.call.getNodeType(b); }
  generate(b, output) { if (this.f16) b.enableDirective('f16'); return this.call.build(b, output); }
}

/**
 * A WGSL function whose maths runs in half where it can. name: a WGSL name of its own; src: the rest of
 * the function from its parameter list on, `(a: vec3<f32>, k: f32) -> vec4<f32> { let c = hf3(a); ... }`.
 * Returns call(args, half): args by the parameters' names; half: this pass wants half (halfWanted()).
 */
export function halfFn(name, src) {
  const F = { name, f16: textOf(name, src, 'f16'), f32: textOf(name, src, 'f32') };
  const h = wgslFn(F.f16), f = wgslFn(F.f32);
  ALL.push(F);
  if (dev) { HALF.failed.push(name); check(F).then(ok => { if (ok) HALF.failed.splice(HALF.failed.indexOf(name), 1); }); }   // made after WebGPU started: full until checked
  return (args, half) => { const f16 = !!half && HALF.chip === true && !HALF.failed.includes(name); return nodeObject(new HalfCall((f16 ? h : f)(args), f16)); };
}

/** Whether the passes being built now should use half: the chip has it and HD.half isn't false. */
export const halfWanted = () => HALF.on && (HALF.chip === true || HALF.pretend);

/** A short word for the passes' chain key: they are built again when it changes (HD.half switched). */
export const halfKey = () => (halfWanted() ? 'h' : 'f');

/**
 * Once, as WebGPU starts (gpu.js): does the chip have 'shader-f16', and does it compile each half function
 * on its own? Never rejects. (The passes' modules are loaded with hd3d-gpu.js, before this; one made later
 * is drawn in full until its own check has passed.)
 */
let dev = null;
async function check(F) {
  try {
    // (in an error scope of its own: a function that won't compile is answered here, not reported as the app's error)
    dev.pushErrorScope('validation');
    const m = dev.createShaderModule({ code: 'enable f16;\n' + F.f16, label: 'half check ' + F.name }), scope = dev.popErrorScope();
    const bad = (await m.getCompilationInfo()).messages.filter(x => x.type === 'error'); await scope.catch(() => {});
    if (!bad.length) return true;
    console.warn(`half precision: ${F.name} did not compile in half, so it stays in full:`, bad.map(x => `${x.lineNum}:${x.linePos} ${x.message}`).join('; '));
  } catch (e) { console.warn(`half precision: ${F.name} could not be checked, so it stays in full:`, e?.message || e); }
  return false;
}
export async function halfCheck(r) {
  const d = r?.backend?.device;
  HALF.chip = !!d?.features?.has('shader-f16');
  if (!HALF.chip) return;
  dev = d;
  // (at most 3 s: one not answered by then is drawn in full, so a chip slow to say can't hold WebGPU's start)
  const late = new Promise(res => setTimeout(() => res(false), 3000));
  await Promise.all(ALL.map(async F => { if (!await Promise.race([check(F), late])) HALF.failed.push(F.name); }));
}

/** What HD.info.half says: 'half', 'half (but not: ...)', 'full (switched off)' or 'full (no half on this chip)'. */
export function halfInfo() {
  if (HALF.chip !== true && !HALF.pretend) return HALF.chip === false ? 'full (no half on this chip)' : 'full';
  if (!HALF.on) return 'full (switched off)';
  if (HALF.chip !== true) return 'half (pretend: drawn in full, this chip has none)';
  if (HALF.failed.length >= ALL.length) return 'full (the chip compiled none in half)';
  return HALF.failed.length ? `half (but not: ${HALF.failed.join(', ')})` : 'half';
}

/** Tests: the WGSL of every half function in one precision ('f16' or 'f32'). */
export const halfTexts = (p = 'f16') => ALL.map(F => ({ name: F.name, code: F[p] }));
