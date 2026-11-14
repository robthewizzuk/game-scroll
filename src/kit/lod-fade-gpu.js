// lod-fade.js on WebGPU: a material's dithered twin as a node material. Kit use only (hd3d-gpu.js exports it
// to hd3d.js; gpuProps and props-gpu.js use the twin for copies).
//
// The twin is a node material with everything the material has (copied as three's own NodeLibrary.fromMaterial
// does, and again each frame it is used, so a game changing the material is followed) and a mask: a pixel is
// kept only where the screen's dither is under the level's share (coming in) or over it (going out). The share
// is the mesh's own (per: 'object', userData.gsFadeV, sent for each mesh drawn: one twin serves every person
// fading) or each copy's (per: 'copy', the copy's gsFade attribute in a fading copies' list). In the shadow pass
// the twin keeps the whole level, or none of it: the level with the larger share casts.
import { Vector2 } from 'three/webgpu';
import { uniform, attribute, screenCoordinate, interleavedGradientNoise, bool } from 'three/tsl';
import { FADE, WHOLE } from './lod-fade.js';

const FRAME = uniform(0).onRenderUpdate(() => FADE.frame);
const OBJ = uniform(new Vector2(1, 1)).onObjectUpdate(({ object }) => object?.userData?.gsFadeV || WHOLE);
const COPY = attribute('gsFade', 'vec2');
// kept: the dither under the share coming in, over it going out (the two levels are each other's complement)
const keep = v => interleavedGradientNoise(screenCoordinate.xy.add(FRAME.mul(5.588238))).sub(v.x).mul(v.y).lessThan(0);
// casts: coming in from half way (share .5 and over), going out until then
const casts = v => v.x.sub(.5).mul(v.y).add(v.y.mul(.5).add(.5).mul(1e-5)).greaterThan(0);
const MASK = { object: keep(OBJ), copy: keep(COPY) }, SHADOW = { object: casts(OBJ), copy: casts(COPY) };
// (not copied: what makes the twin itself, and the material's own WebGL shader patch: its WebGPU looks are nodes already)
const SKIP = new Set(['uuid', 'id', 'type', 'name', 'version', 'userData', '_listeners', 'maskNode', 'maskShadowNode', 'onBeforeCompile', 'customProgramCacheKey']);
const TWINS = { object: new WeakMap(), copy: new WeakMap() };

function copyInto(t, base) {
  for (const k in base) { if (SKIP.has(k)) continue; const v = base[k]; if (t[k] !== v && typeof v !== 'function') t[k] = v; }
  if (t.gsBaseVersion !== base.version) { if (t.gsBaseVersion != null) t.needsUpdate = true; t.gsBaseVersion = base.version; }
}

/**
 * The dithered twin of material m as drawn on WebGPU (a node material or a classic one, which three turns into
 * nodes), for per 'object' or 'copy'; null where it can't be made (then the change pops). r: the renderer
 * (its library names the node class for a classic material).
 */
export function fadeTwin(m, per = 'object', r = null) {
  if (!m) return null;
  const map = TWINS[per];
  let t = map.get(m);
  if (t !== undefined) { if (t) copyInto(t, m); return t; }
  t = null;
  try {
    const Cls = m.isNodeMaterial ? m.constructor : r?.library?.getMaterialNodeClass(m.type);
    if (Cls) {
      t = new Cls();
      copyInto(t, m);
      t.userData = { ...m.userData, gsFadeOf: m, gsGpu: undefined };
      const own = m.maskNode, ownSh = m.maskShadowNode || own;
      t.maskNode = own ? bool(own).and(MASK[per]) : MASK[per];
      t.maskShadowNode = ownSh ? bool(ownSh).and(SHADOW[per]) : SHADOW[per];
      t.name = (m.name || m.type) + ':fade';
      const gone = () => { m.removeEventListener('dispose', gone); map.delete(m); t.dispose(); };
      m.addEventListener('dispose', gone);
    }
  } catch (e) { t = null; }
  map.set(m, t);
  return t;
}
