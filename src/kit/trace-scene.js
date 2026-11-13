// The traced level's list (ray traced reflections, hd3d-gpu-trace.js): which of a scene's meshes go
// into the copy the rays are sent through, which of them stand still (one block for them all) and
// which move (a block for each shape, placed by its mesh every frame), and the plain arrays
// trace-build.js makes the blocks from. Looked at again every so often: things added, taken away,
// reshaped, set moving or come to rest ask for the blocks to be made again.
// What it leaves out: skinned and morphing meshes, copies (instanced sets), see-through and cut-out
// materials, lines and points. Those still show in reflections where they are on screen.
// Needs nothing from the page beyond a 2D canvas for a texture's average colour (without one: white).
// Kit use only.
const BACK = 1, SETTLE = 8, SETTLE_OVER = 24, GLOWS = 127, OTHERS = 48;
const mats = o => { const m = o.userData.gsGlMat || o.material; return Array.isArray(m) ? m : [m]; };
const solid = m => !!m && m.visible !== false && !m.transparent && !(m.alphaTest > 0) && !m.alphaHash && m.side !== BACK && m.colorWrite !== false && !m.wireframe
  && (m.isMeshStandardMaterial || m.isMeshBasicMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial);
const shapeOf = o => o.userData.gsLod?.base || o.geometry;
/** Does this mesh go into the traced level? (bits: the layers its things are drawn from.) */
export function traceable(o, bits = 1) {
  if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.isBatchedMesh || o.morphTargetInfluences?.length) return false;
  const ud = o.userData; if (ud.gsTwin || ud.decal || ud.noTrace || o.name === 'gs-batch' || !(o.layers.mask & bits)) return false;
  const p = shapeOf(o)?.attributes?.position; if (!p || p.count < 3) return false;
  return mats(o).some(solid);
}

// a texture's average colour, in linear light (once a texture; white where it can't be read)
const AVG = new WeakMap(); let pad = null;
const lin = c => (c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4));
function average(tex) {
  if (!tex?.image) return null;
  let a = AVG.get(tex); if (a && a.v === tex.version) return a.c;
  let c = null; const im = tex.image, srgb = tex.colorSpace === 'srgb';
  try {
    if (im.data && im.width) {
      // a data texture: a few hundred of its pixels
      const d = im.data, ch = d.length / (im.width * im.height) | 0, n = im.width * im.height, st = Math.max(1, n / 256 | 0), k = d instanceof Uint8Array || d instanceof Uint8ClampedArray ? 1 / 255 : 1;
      let r = 0, g = 0, b = 0, m = 0;
      for (let i = 0; i < n; i += st) { const R = d[i * ch] * k, G = ch > 1 ? d[i * ch + 1] * k : R, B = ch > 2 ? d[i * ch + 2] * k : R; r += srgb ? lin(R) : R; g += srgb ? lin(G) : G; b += srgb ? lin(B) : B; m++; }
      c = [r / m, g / m, b / m];
    } else if (typeof document !== 'undefined' && (im.width || im.videoWidth)) {
      pad ||= Object.assign(document.createElement('canvas'), { width: 8, height: 8 }).getContext('2d', { willReadFrequently: true });
      pad.clearRect(0, 0, 8, 8); pad.drawImage(im, 0, 0, 8, 8);
      const d = pad.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0;
      for (let i = 0; i < 256; i += 4) { r += srgb ? lin(d[i] / 255) : d[i] / 255; g += srgb ? lin(d[i + 1] / 255) : d[i + 1] / 255; b += srgb ? lin(d[i + 2] / 255) : d[i + 2] / 255; }
      c = [r / 64, g / 64, b / 64];
    }
  } catch (e) { c = null; }
  AVG.set(tex, { v: tex.version, c });
  return c;
}
/** Is it polished metal? (A traced hit shows such a thing's surroundings in its colour, not the light on it.) */
export const metalOf = m => m.metalness >= .5 && !m.isMeshBasicMaterial;
/** A material's colour as the traced level keeps it: [r, g, b] in linear light (an unlit material keeps none: it only glows). */
export function colourOf(m) {
  if (m.isMeshBasicMaterial) return [0, 0, 0];
  const c = m.color, a = average(m.map), k = metalOf(m) ? 1 : 1 - Math.min(1, m.metalness || 0);
  return [c.r * k * (a ? a[0] : 1), c.g * k * (a ? a[1] : 1), c.b * k * (a ? a[2] : 1)];
}
/** A material's own light: [r, g, b], or null when it gives none. */
export function glowOf(m, out = [0, 0, 0]) {
  if (m.isMeshBasicMaterial) { const c = m.color, a = average(m.map); out[0] = c.r * (a ? a[0] : 1); out[1] = c.g * (a ? a[1] : 1); out[2] = c.b * (a ? a[2] : 1); return out; }
  const e = m.emissive, k = m.emissiveIntensity ?? 1; if (!e || !(k > 0) || e.r + e.g + e.b <= 0) return null;
  const a = average(m.emissiveMap); out[0] = e.r * k * (a ? a[0] : 1); out[1] = e.g * k * (a ? a[1] : 1); out[2] = e.b * k * (a ? a[2] : 1);
  return out;
}

const same = (a, e) => { for (let i = 0; i < 16; i++) if (Math.abs(a[i] - e[i]) > 1e-5) return false; return true; };
// an attribute as plain floats, n a corner (as it is where it already is that)
function floats(at, n) {
  if (!at) return null;
  if (!at.isInterleavedBufferAttribute && !at.normalized && at.array instanceof Float32Array && at.itemSize === n && at.array.length === at.count * n) return at.array;
  const out = new Float32Array(at.count * n);
  for (let i = 0; i < at.count; i++) for (let c = 0; c < n; c++) out[i * n + c] = at.getComponent(i, c);
  return out;
}

export class TraceLevel {
  /**
   * bits: the layers the level's things are drawn from; budget: triangles for the still block;
   * moverMax: how many moving things; moverTris: triangles for all their shapes; shapeTris: for one.
   */
  constructor({ bits = 1, budget = 3e5, moverMax = 128, moverTris = 12e4, shapeTris = 2e4 } = {}) {
    Object.assign(this, { bits, budget, moverMax, moverTris, shapeTris });
    this.recs = new Map(); this.n = 0; this.other = 0; this.others = []; this.lights = []; this.moving = 0;
    this.gone = new WeakSet();   // meshes that were hidden and may come back (below)
    // what has changed since the blocks were last asked for: among the still things (one block for them all,
    // made again whole) and among the moving ones (a block a shape, kept while its shape is in use)
    this.dirtyStill = false; this.dirtyMovers = false; this.calm = 0;   // (calm: looks since the still things last changed)
    // the glow table: [material] by its place (0: none). The blocks keep places, not colours, and the
    // colours are read from the materials each frame: a lamp switched on shows without a new build
    this.glows = [null]; this.glowAt = new Map();
  }
  /**
   * Looks the scene over: sets `dirtyStill` and `dirtyMovers` when what the blocks were made from has
   * changed (until build() takes them). `other` counts what was seen that the level leaves out
   * (copies, skinned things...): they show in reflections by the screen; `others` lists the first few.
   * `lights` lists the scene's lights (for whoever lights the hits).
   * A thing that moves joins the moving ones; with more than a couple of dozen of those, one that has
   * stood still a while goes back among the still. A thing that is hidden and shown again (a pickup, a
   * door, a blinking sign) is kept among the moving ones for good: they can be hidden at once, where the
   * still block has to be made again, in the background, to lose anything.
   */
  scan(scene) {
    const n = ++this.n, { recs, bits, gone } = this, others = this.others, lights = this.lights, settle = this.moving > SETTLE_OVER; let still = false, movers = false, other = 0, moving = 0;
    others.length = 0; lights.length = 0;
    const hit = r => { if (r.moving) movers = true; else still = true; };
    scene.traverseVisible(o => {
      if (!o.isMesh) { if (o.isLight) lights.push(o); return; }
      if (!traceable(o, bits)) { if (o.userData.gsTraced) o.userData.gsTraced = false; if ((o.layers.mask & bits) && !o.userData.noTrace && !o.isDetailMesh) { other++; if (others.length < OTHERS) others.push(o); } return; }
      const g = shapeOf(o), ver = g.attributes.position.version + (g.index ? g.index.version : 0), ms = mats(o), e = o.matrixWorld.elements;
      let r = recs.get(o);
      if (!r) { const pin = !!o.userData.moves || gone.has(o); recs.set(o, r = { o, g, ver, ms, m: Float64Array.from(e), moving: pin, pin, still: 0, at: null, seen: n }); hit(r); }
      else {
        if (r.g !== g || r.ver !== ver || r.ms.length !== ms.length || r.ms.some((m, i) => m !== ms[i])) { r.g = g; r.ver = ver; r.ms = ms; hit(r); }
        if (!same(r.m, e)) { r.m.set(e); r.still = 0; if (!r.moving) { r.moving = true; still = movers = true; } }
        else if (r.moving && !r.pin && !o.userData.moves && ++r.still >= SETTLE && settle) { r.moving = false; still = movers = true; }   // come to rest: back among the still things
        // a material that has begun to glow since its block was made
        if (r.at && this.glows.length <= GLOWS) for (const m of ms) if (solid(m) && !this.glowAt.has(m) && glowOf(m)) hit(r);
      }
      r.seen = n; if (r.moving) moving++;
    });
    for (const [o, r] of recs) if (r.seen !== n) { recs.delete(o); if (o.userData.gsTraced) o.userData.gsTraced = false; if (o.parent) gone.add(o); hit(r); }
    this.other = other; this.moving = moving;
    if (still) { this.dirtyStill = true; this.calm = 0; } else this.calm++;
    if (movers) this.dirtyMovers = true;
    return still || movers;
  }
  // a material's place in the glow table (0: it gives no light)
  glow(m) {
    let i = this.glowAt.get(m); if (i !== undefined) return i;
    if (!glowOf(m) || this.glows.length > GLOWS) return 0;
    i = this.glows.length; this.glows.push(m); this.glowAt.set(m, i);
    return i;
  }
  // one mesh's pieces (a piece for each material it is drawn with), onto a job's lists
  add(job, r, m) {
    const g = r.g, shapes = job.shapes; let si = job.seen.get(g);
    if (si === undefined) {
      const A = g.attributes, col = A.color ? floats(A.color.itemSize === 3 ? A.color : { count: A.color.count, getComponent: (i, c) => A.color.getComponent(i, c) }, 3) : null;
      si = shapes.length; job.seen.set(g, si);
      shapes.push({ pos: floats(A.position, 3), nrm: floats(A.normal, 3), col, idx: g.index ? g.index.array : null });
    }
    const total = g.index ? g.index.count : g.attributes.position.count, dr = g.drawRange, lo = Math.max(0, dr.start), hi = Math.min(total, dr.start + dr.count);
    const piece = (mat, start, count) => {
      const a = Math.max(lo, start); count = Math.floor((Math.min(hi, start + count) - a) / 3) * 3;
      if (count < 3 || !solid(mat)) return;
      job.items.push({ shape: si, start: a, count, m, rgb: colourOf(mat), glow: this.glow(mat), metal: metalOf(mat), tint: !!mat.vertexColors });
      job.tris += count / 3;
    };
    if (r.ms.length > 1 || g.groups.length > 1) for (const gr of g.groups) piece(r.ms[gr.materialIndex ?? 0] || r.ms[0], gr.start, gr.count);
    else piece(r.ms[0], 0, total);
  }
  /** The key moving things of one shape and look share a block under. */
  key(r) { return r.g.id + ':' + r.ver + ':' + r.ms.map(m => m.id + (this.glowAt.has(m) || glowOf(m) ? 'g' : '')).join(','); }
  /**
   * What to build now. still: make the still things' block again (false: it is kept as it is); have(key):
   * is a moving shape's block already made? Returns { still: the still things' job (null with none, undefined
   * when kept), owners: the record each of its items came from, movers: [{ key, job (null when there is
   * one already), recs }] the moving shapes, left: moving things over the count }.
   * A job is what trace-build.js's buildBlock takes. Clears `dirtyMovers`, and `dirtyStill` with still.
   */
  build({ still = true, have = null } = {}) {
    if (still) this.dirtyStill = false; this.dirtyMovers = false;
    const job = () => ({ shapes: [], items: [], budget: 0, tris: 0, seen: new Map() }), sj = job(), owners = [], byShape = new Map(), none = new Set(), left = [];
    sj.budget = this.budget;
    let movers = 0;
    for (const r of this.recs.values()) {
      if (!r.moving) { if (still) { this.add(sj, r, Float32Array.from(r.m)); while (owners.length < sj.items.length) owners.push(r); } continue; }
      if (movers >= this.moverMax) { left.push(r); continue; }
      const key = this.key(r); if (none.has(key)) { left.push(r); continue; }
      let s = byShape.get(key);
      if (!s) {
        s = { key, job: null, recs: [] };
        if (!have?.(key)) { s.job = job(); this.add(s.job, r, null); if (!s.job.items.length) { none.add(key); left.push(r); continue; } }
        byShape.set(key, s);
      }
      s.recs.push(r); movers++;
    }
    const list = [...byShape.values()], made = list.filter(s => s.job), sum = made.reduce((n, s) => n + Math.min(this.shapeTris, s.job.tris), 0), k = Math.min(1, this.moverTris / Math.max(1, sum));
    for (const s of made) s.job.budget = Math.max(64, Math.floor(Math.min(this.shapeTris, s.job.tris) * k));
    const clean = j => { delete j.seen; return j; };
    return { still: !still ? undefined : sj.items.length ? clean(sj) : null, owners, movers: list.map(s => ({ key: s.key, job: s.job && clean(s.job), recs: s.recs })), left };
  }
}
