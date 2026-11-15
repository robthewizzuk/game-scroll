// A person's looks that change while the game runs, with no sculpting again (gs.models.human's person.looks): heavier or
// thinner, more muscle, older, a face's jaw, chin, cheeks, nose, lips, brow and eyes, the skin's and hair's colour, a
// lean towards good or evil, and marks on the skin (scars and tattoos) that ride the body as it moves. And Creator: a
// character creator's state, sliders that show at once on the person and picks (sex, hair, beard, skin) that make the
// person again in the background and swap them in.
//
// Shapes: each point of the person (all three levels, the wet eyes, the lids' shadow and a real head's hair strips) is
// moved from where it was sculpted, by how much of it each bone carries (its skin weights): the body's along its own
// normal, a bone's worth at a time (the belly and hips for weight, the chest, shoulders and arms for muscle); the face's by
// the face's own small bones (human-head.js faceBones: the jaw, the chin, each cheek, each side of the nose, the lips, the
// brows, the eyes and lids), each the way that part grows. The person gets its own list of points the first time (its twins
// keep theirs). Colours: the person's own copies of its skin, hair and eye materials, tinted; older, the lines of a
// real face (its live face's wrinkles) stay in a little. Marks: the skin's triangles round a spot copied a hair over it, on
// the same bones, with a picture drawn in code.
//
// Kit use only: games reach it as person.looks and gs.models.Creator.

import { BufferGeometry, BufferAttribute, CanvasTexture, Color, Matrix4, SkinnedMesh, Vector3, SRGBColorSpace } from 'three';
import { pbr } from '../hd3d.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), _g = new Color();
/** The shape sliders, -1..1 (0: as sculpted; muscle and age 0..1). */
export const LOOK_SHAPES = ['weight', 'muscle', 'age', 'jaw', 'chin', 'cheeks', 'nose', 'lips', 'brow', 'eyes'];
const FACE_KEYS = ['jaw', 'chin', 'cheeks', 'nose', 'lips', 'brow', 'eyes'];
// metres out along the normal a whole bone's worth of skin goes at 1 (weight: a man's and a woman's; thin is .6 of it inwards)
const WEIGHT_M = { belly: .05, waist: .04, hips: .03, spine: .02, chest: .018, hipL: .03, legL: .028, kneeL: .012, shinL: .01, armL: .016, bicepL: .016, shoulderL: .012, elbowL: .008, foreL: .009, collarL: .01, neck: .006 };
const WEIGHT_F = { belly: .035, waist: .03, hips: .045, spine: .016, chest: .02, hipL: .045, legL: .036, kneeL: .014, shinL: .012, armL: .016, bicepL: .015, shoulderL: .01, elbowL: .008, foreL: .008, collarL: .008, neck: .005 };
const MUSCLE = { chest: .028, spine: .02, collarL: .016, shoulderL: .022, armL: .02, bicepL: .026, elbowL: .008, foreL: .014, twistL: .008, legL: .02, hipL: .012, kneeL: .006, shinL: .014, neck: .008, waist: -.008, belly: -.012 };
const sided = T => { const o = { ...T }; for (const k in T) if (k.endsWith('L')) o[k.slice(0, -1) + 'R'] = T[k]; return o; };
const W_M = sided(WEIGHT_M), W_F = sided(WEIGHT_F), MUS = sided(MUSCLE);

/**
 * person.looks: set({ weight, muscle, age, jaw, chin, cheeks, nose, lips, brow, eyes, skin, hair, eyesColour, lean, height }) at
 * any time (shapes -1..1, muscle and age 0..1, lean -1 (evil) .. 1 (good), skin / hair colours, height a scale); get(name);
 * mark({ kind, at, design, colour, size, turn, seed }) adds a scar or a tattoo (mark.strength 0..1 fades it in or out; mark.remove());
 * pack() / unpack(data) for api.save().
 */
export class Looks {
  constructor(person, { skin = '#c89878', hair = '#3a2a1e', fem = false } = {}) {
    this.p = person; this.base = { skin: new Color(skin), hair: new Color(hair), height: person.scale.x }; this.fem = fem;
    this.v = { weight: 0, muscle: 0, age: 0, jaw: 0, chin: 0, cheeks: 0, nose: 0, lips: 0, brow: 0, eyes: 0, lean: 0, skin: null, hair: null, height: 1 };
    this.marks = []; this.parts = null; this.mats = null;
  }
  get(k) { return this.v[k]; }
  /** Changes how the person looks, at once: only what is named changes. */
  set(o = {}) {
    let shape = false, colour = false;
    for (const k in o) {
      if (!(k in this.v) || o[k] === undefined) continue;
      const v = k === 'skin' || k === 'hair' ? (o[k] == null ? null : '#' + new Color(/^[0-9a-f]{6}$/i.test(o[k]) ? '#' + o[k] : o[k]).getHexString()) : k === 'height' ? clamp(+o[k], .7, 1.3) : clamp(+o[k], k === 'muscle' || k === 'age' ? 0 : -1, 1);
      if (this.v[k] === v || (typeof v === 'number' && Number.isNaN(v))) continue;   // (not a number: left as it was)
      this.v[k] = v;
      if (LOOK_SHAPES.includes(k)) shape = true; else colour = true;
    }
    if (shape) this.shape();
    if (colour || 'age' in o) this.colour();
    if ('height' in o) this.p.scale.setScalar(this.base.height * this.v.height);
    return this;
  }
  // the person's meshes that carry points to move: its own copies of their geometry, the sculpted points kept
  meshes() {
    if (this.parts) return this.parts;
    const P = this.p, list = [...(P.lods || []), P.shadowBody, P.wet, P.eyeShadow, ...(P.strips || []), ...(P.hair?.shells || [])].filter(Boolean), own = new Map();
    const skel = P.mesh.skeleton, names = skel.bones.map(b => b.name), at = skel.boneInverses.map(m => new Vector3().setFromMatrixPosition(new Matrix4().copy(m).invert()));
    this.names = names; this.boneAt = at;
    this.parts = [];
    for (const m of list) {
      let g = own.get(m.geometry);
      if (!g) {
        const src = m.geometry; g = new BufferGeometry();
        for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);
        for (const k in src.morphAttributes) g.morphAttributes[k] = src.morphAttributes[k];
        g.setIndex(src.index); for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
        g.boundingSphere = src.boundingSphere?.clone() || null; g.userData = { ...src.userData }; g.name = src.name;
        const p0 = src.attributes.position, P0 = new Float32Array(p0.count * 3);
        for (let i = 0; i < p0.count; i++) { P0[i * 3] = p0.getX(i); P0[i * 3 + 1] = p0.getY(i); P0[i * 3 + 2] = p0.getZ(i); }
        g.setAttribute('position', new BufferAttribute(P0.slice(), 3));
        const hairAll = (P.strips || []).includes(m) || (P.hair?.shells || []).includes(m);
        own.set(src, g); this.parts.push({ g, P0, D: {}, head: m === P.wet || m === P.eyeShadow || hairAll, hair: hairAll ? 'all' : (P.lods || []).includes(m) ? (P.lods || []).indexOf(m) : null });
      }
      m.geometry = g;
    }
    // which points are hair (they grey and take the hair's colour): the close level's hair and hairs (its sixth and seventh materials),
    // and the same points on the coarser levels (found by where they are)
    const L0 = this.parts.find(q => q.hair === 0);
    if (L0) {
      const g = L0.g, I = g.index.array, n = g.attributes.position.count, mask = new Uint8Array(n), keys = new Set(), key = (A, i) => A[i * 3].toFixed(5) + ',' + A[i * 3 + 1].toFixed(5) + ',' + A[i * 3 + 2].toFixed(5);
      for (const gr of g.groups) if (gr.materialIndex === 6 || gr.materialIndex === 7) for (let t = gr.start; t < gr.start + gr.count; t++) mask[I[t]] = 1;
      for (let i = 0; i < n; i++) if (mask[i]) keys.add(key(L0.P0, i));
      L0.mask = mask;
      for (const q of this.parts) if (typeof q.hair === 'number' && q.hair > 0) { const c = q.g.attributes.position.count, M = new Uint8Array(c); for (let i = 0; i < c; i++) if (keys.has(key(q.P0, i))) M[i] = 1; q.mask = M; }
    }
    for (const q of this.parts) if (q.hair === 'all') q.mask = new Uint8Array(q.g.attributes.position.count).fill(1);
    return this.parts;
  }
  // how far each point goes at 1 for one shape: a list of moves, worked out once per geometry
  moves(part, k) {
    if (part.D[k]) return part.D[k];
    const g = part.g, n = g.attributes.position.count, P0 = part.P0, N = g.attributes.normal, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, names = this.names, A = this.boneAt;
    const D = new Float32Array(n * 3), body = k === 'weight' || k === 'muscle' || k === 'age';
    const T = k === 'weight' ? (this.fem ? W_F : W_M) : k === 'muscle' ? MUS : null;
    const idx = nm => names.indexOf(nm);
    const eyes = ['L', 'R'].map(s => A[idx('eye' + s)]).filter(Boolean);
    const neckY = A[idx('neck')]?.y ?? null;
    const lipB = ['lipUpL', 'lipUpR', 'lipLowL', 'lipLowR'].map(nm => A[idx(nm)]).filter(Boolean), mouth = lipB.length ? lipB.reduce((a, q) => a.add(q), new Vector3()).multiplyScalar(1 / lipB.length).add(new Vector3(0, 0, -.018)) : null;
    for (let i = 0; i < n; i++) {
      const x = P0[i * 3], y = P0[i * 3 + 1], z = P0[i * 3 + 2];
      let dx = 0, dy = 0, dz = 0;
      // (the body's growth fades out up to the neck, so a collar stays round the neck instead of standing off it)
      const neckFade = neckY == null ? 1 : clamp((neckY - .02 - y) / .16, 0, 1);
      for (let q = 0; q < 4; q++) {
        const w = SW.getComponent(i, q); if (w < .001) continue;
        const b = names[SI.getComponent(i, q)] || '', bp = A[SI.getComponent(i, q)];
        if (T) { const a = T[b] * (b === 'neck' ? 1 : neckFade); if (a && N) { dx += N.getX(i) * a * w; dy += N.getY(i) * a * w; dz += N.getZ(i) * a * w; } continue; }
        if (k === 'age') { if (b === 'jaw' || b === 'chin' || b.startsWith('cheek') || b.startsWith('corner')) dy -= .0035 * w; else if (b.startsWith('lowLid')) dy -= .0015 * w; continue; }
        if (k === 'jaw' && (b === 'jaw' || b.startsWith('lipLow') || b.startsWith('corner'))) dx += x * .2 * w * (b === 'jaw' ? 1 : .4);
        else if (k === 'chin' && b === 'chin') { dy -= .008 * w; dz += .007 * w; }
        else if (k === 'cheeks' && b.startsWith('cheek')) { dx += Math.sign(x) * .007 * w; dz += .003 * w; dy += .0015 * w; }
        else if (k === 'nose' && b.startsWith('nose')) { dx += Math.sign(x) * .0035 * w; dz += .006 * w; dy -= .001 * w; }
        else if (k === 'lips' && (b.startsWith('lipUp') || b.startsWith('lipLow')) && mouth) { const ox = (x - mouth.x) * .5, oy = y - mouth.y, oz = z - mouth.z, l = Math.hypot(ox, oy, oz) || 1; dx += ox / l * .0035 * w; dy += oy / l * .0035 * w; dz += oz / l * .0035 * w; }
        else if (k === 'brow' && (b.startsWith('brow'))) { dz += .006 * w; dy -= .001 * w; }
        else if (k === 'eyes' && bp && (b.startsWith('eye') || b.startsWith('lid') || b.startsWith('lowLid'))) {
          const c = eyes.length ? eyes.reduce((a, e) => (Math.abs(e.x - x) < Math.abs(a.x - x) ? e : a)) : bp;
          dx += (x - c.x) * .14 * w; dy += (y - c.y) * .14 * w; dz += (z - c.z) * .14 * w;
        }
      }
      if (body && !T) { /* (age: the face only) */ }
      D[i * 3] = dx; D[i * 3 + 1] = dy; D[i * 3 + 2] = dz;
    }
    return (part.D[k] = D);
  }
  shape() {
    const v = this.v;
    for (const part of this.meshes()) {
      const pos = part.g.attributes.position, A = pos.array; A.set(part.P0);
      for (const k of LOOK_SHAPES) {
        let s = v[k]; if (!s) continue;
        if (part.head && (k === 'weight' || k === 'muscle')) continue;
        if (k === 'weight' && s < 0) s *= .6;
        const D = this.moves(part, k); for (let i = 0; i < A.length; i++) A[i] += D[i] * s;
      }
      pos.needsUpdate = true;
    }
    for (const m of this.marks) m.place();
  }
  // the person's own skin, hair and eye materials (copies, so others in the same clothes keep theirs)
  own() {
    if (this.mats) return this.mats;
    const P = this.p, out = this.mats = { skin: null, hair: [], eyes: null };
    const swap = (m, i, fn) => { const arr = Array.isArray(m.material) ? m.material.slice() : null, cur = arr ? arr[i] : m.material; if (!cur) return null; const c = fn(cur); if (arr) { arr[i] = c; m.material = arr; } else m.material = c; return c; };
    const cache = new Map(), copy = mt => { if (!cache.has(mt)) { const c = mt.clone(); c.userData = { ...mt.userData, gsLooksCopy: true }; cache.set(mt, c); } return cache.get(mt); };
    for (const [L, m] of (P.lods || []).entries()) {
      if (!Array.isArray(m.material)) continue;
      out.skin = swap(m, 0, copy) || out.skin;
      if (L === 0) out.eyes = swap(m, 1, copy);
    }
    out.hair = out.hair.filter(Boolean);
    for (const mt of [out.skin, out.eyes, ...out.hair]) if (mt) mt.userData.gsBase = { colour: mt.color.clone(), emissive: mt.emissive?.clone(), ei: mt.emissiveIntensity ?? 0 };
    return out;
  }
  colour() {
    const v = this.v, M = this.own(), age = v.age, lean = v.lean;
    const skinTo = v.skin ? new Color(v.skin) : this.base.skin;
    const ratio = (to, from, most = 8) => new Color(Math.min(most, to.r / Math.max(.02, from.r)), Math.min(most, to.g / Math.max(.02, from.g)), Math.min(most, to.b / Math.max(.02, from.b)));
    if (M.skin) {
      const b = M.skin.userData.gsBase, t = ratio(skinTo, this.base.skin);
      if (age > 0) { const l = (t.r + t.g + t.b) / 3; t.lerp(new Color(l, l, l), age * .18); t.multiplyScalar(1 - age * .05); }
      if (lean < 0) t.multiply(new Color(1, 1, 1).lerp(new Color(.82, .86, .8), -lean));
      else if (lean > 0) t.multiply(new Color(1, 1, 1).lerp(new Color(1.05, 1.01, .95), lean));
      M.skin.color.copy(b.colour).multiply(t);
      if (M.skin.emissive) { M.skin.emissive.set(lean > 0 ? '#ffd8a0' : '#000000'); M.skin.emissiveIntensity = lean > 0 ? lean * .05 : b.ei; }
    }
    // hair: its points' own colours, as the hair's colour changes and as it greys (a material's colour can only darken a dark head of hair)
    const hb = this.base.hair, lum = c => .3 * c.r + .59 * c.g + .11 * c.b, to = ratio(v.hair ? new Color(v.hair) : hb, hb, 40), grey = new Color('#8a867f').lerp(new Color('#b4b0a9'), clamp((age - .5) * 2, 0, 1)), gk = clamp(age * 1.1 - .2, 0, .85), c = new Color();
    for (const part of this.meshes()) {
      if (!part.mask) continue;
      const src = part.g.attributes.color; if (!src) continue;
      if (!part.C0) { const k = src.itemSize, C0 = new Float32Array(src.count * k); for (let i = 0; i < src.count; i++) for (let j = 0; j < k; j++) C0[i * k + j] = src.getComponent(i, j); part.C0 = C0; part.g.setAttribute('color', new BufferAttribute(C0.slice(), k)); }
      const A = part.g.attributes.color, k = A.itemSize, C0 = part.C0, out = A.array;
      for (let i = 0; i < part.mask.length; i++) {
        if (!part.mask[i]) continue;
        c.setRGB(C0[i * k] * to.r, C0[i * k + 1] * to.g, C0[i * k + 2] * to.b);
        if (gk > 0) { const l = clamp(lum(c) / Math.max(.02, lum(hb) * Math.max(.3, (to.r + to.g + to.b) / 3)), .4, 1.6); c.lerp(_g.copy(grey).multiplyScalar(l), gk); }
        out[i * k] = Math.min(1, c.r); out[i * k + 1] = Math.min(1, c.g); out[i * k + 2] = Math.min(1, c.b);
      }
      A.needsUpdate = true;
    }
    if (M.eyes?.emissive) { const evil = clamp(-lean * 1.6 - .6, 0, 1); M.eyes.emissive.set('#ff2a08'); M.eyes.emissiveIntensity = evil * .3; }
    const f = this.p.face; if (f) f.lines = clamp(age * 1.1 - .1, 0, .85);
  }
  /**
   * A mark on the skin: kind 'tattoo' | 'scar' | 'paint'; at: 'cheekL' | 'cheekR' | 'brow' | 'chin' | 'eyeL' | 'eyeR' | 'neck' | 'armL' | 'armR' |
   * 'foreL' | 'foreR' | 'handL' | 'handR' | 'chest' | 'back', or { bone, off: [x, y, z] } (metres from the bone, as made); design (tattoo:
   * 'band' | 'spiral' | 'star' | 'rune' | 'leaf' | 'wing' | 'dots'; scar: 'slash' | 'claw' | 'burn' | 'stitch'; paint: 'stripes' | 'mask'),
   * colour, size (metres across), turn (radians), seed. Returns { strength (0..1), remove() }.
   */
  mark(o = {}) { const m = new Mark(this, o); this.marks.push(m); return m; }
  pack() { return { v: { ...this.v }, marks: this.marks.map(m => m.o) }; }
  unpack(d) { if (!d) return this; this.set(d.v || {}); for (const m of this.marks.slice()) m.remove(); for (const o of d.marks || []) this.mark(o); return this; }
}

// ---- marks: the skin round a spot, a hair over it, on the same bones; a picture drawn in code
const SPOTS = {
  cheekL: ['cheekL', [.012, -.004, .004], [1, .1, .6]], cheekR: ['cheekR', [-.012, -.004, .004], [-1, .1, .6]], brow: ['browInL', [-.012, .012, .01], [0, .2, 1]],
  chin: ['chin', [0, -.006, .01], [0, -.3, 1]], eyeL: ['lidL', [.004, 0, .014], [.3, 0, 1]], eyeR: ['lidR', [-.004, 0, .014], [-.3, 0, 1]], neck: ['neck', [.03, .03, .04], [.6, 0, .8]],
  armL: ['armL', [.06, -.1, 0], [1, 0, 0]], armR: ['armR', [-.06, -.1, 0], [-1, 0, 0]], foreL: ['foreL', [.035, -.1, .02], [.7, 0, .7]], foreR: ['foreR', [-.035, -.1, .02], [-.7, 0, .7]],
  handL: ['handL', [.02, -.04, .02], [0, 0, 1]], handR: ['handR', [-.02, -.04, .02], [0, 0, 1]], chest: ['chest', [0, .03, .14], [0, 0, 1]], back: ['spine', [0, .08, -.14], [0, 0, -1]],
};
class Mark {
  constructor(looks, o) {
    this.L = looks; this.o = { kind: 'tattoo', at: 'armL', size: .08, turn: 0, seed: 1, ...o };
    const P = looks.p, src = P.lods?.[0]; if (!src) throw new Error('looks.mark: a person from gs.models.human');
    looks.meshes();
    const g = src.geometry, A = looks.boneAt, names = looks.names, sp = typeof this.o.at === 'string' ? SPOTS[this.o.at] : [this.o.at.bone, this.o.at.off || [0, 0, 0], this.o.at.facing || [0, 0, 1]];
    if (!sp) throw new Error(`looks.mark: no spot '${this.o.at}' (try ${Object.keys(SPOTS).join(', ')})`);
    const bi = names.indexOf(sp[0]), base = bi >= 0 ? A[bi] : new Vector3(0, 1, 0), aim = new Vector3(...sp[1]).add(base), face = new Vector3(...sp[2]).normalize();
    // the skin's points: the first of the levels' groups (skin) only; the nearest to the spot, from the way it faces
    const pos = g.attributes.position, N = g.attributes.normal, I = g.index.array, skinG = g.groups.find(q => q.materialIndex === 0);
    const inSkin = new Uint8Array(pos.count); if (skinG) for (let t = skinG.start; t < skinG.start + skinG.count; t++) inSkin[I[t]] = 1;
    const v = new Vector3(), n = new Vector3(); let best = -1, bd = Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (!inSkin[i]) continue; v.fromBufferAttribute(pos, i); n.fromBufferAttribute(N, i);
      const d = v.distanceToSquared(aim) * (1.6 - n.dot(face) * .6); if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) throw new Error('looks.mark: no skin there');
    const c = new Vector3().fromBufferAttribute(pos, best), cn = new Vector3().fromBufferAttribute(N, best).lerp(face, .35).normalize();
    // its own way across: up the body (or the limb), turned by turn
    const up = Math.abs(cn.y) > .9 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0), t1 = new Vector3().crossVectors(up, cn).normalize(), t2 = new Vector3().crossVectors(cn, t1);
    const ct = Math.cos(this.o.turn), st = Math.sin(this.o.turn), a1 = t1.clone().multiplyScalar(ct).addScaledVector(t2, st), a2 = t2.clone().multiplyScalar(ct).addScaledVector(t1, -st);
    const R = this.o.size * .75, keep = [], map = new Map(), tri = [];
    for (let t = skinG ? skinG.start : 0; t < (skinG ? skinG.start + skinG.count : I.length); t += 3) {
      const a = I[t], b = I[t + 1], cc = I[t + 2]; let near = false;
      for (const q of [a, b, cc]) { v.fromBufferAttribute(pos, q); n.fromBufferAttribute(N, q); if (v.distanceTo(c) < R && n.dot(cn) > .15) near = true; }
      if (!near) continue;
      for (const q of [a, b, cc]) { if (!map.has(q)) { map.set(q, keep.length); keep.push(q); } tri.push(map.get(q)); }
    }
    const k = keep.length, UV = new Float32Array(k * 2), SI = new Uint16Array(k * 4), SW = new Float32Array(k * 4), NN = new Float32Array(k * 3);
    for (let j = 0; j < k; j++) {
      const q = keep[j]; v.fromBufferAttribute(pos, q).sub(c);
      UV[j * 2] = v.dot(a1) / this.o.size + .5; UV[j * 2 + 1] = v.dot(a2) / this.o.size + .5;
      for (let s = 0; s < 4; s++) { SI[j * 4 + s] = g.attributes.skinIndex.getComponent(q, s); SW[j * 4 + s] = g.attributes.skinWeight.getComponent(q, s); }
      NN[j * 3] = N.getX(q); NN[j * 3 + 1] = N.getY(q); NN[j * 3 + 2] = N.getZ(q);
    }
    const mg = new BufferGeometry(); this.keep = keep; this.src = g;
    mg.setAttribute('position', new BufferAttribute(new Float32Array(k * 3), 3)); mg.setAttribute('normal', new BufferAttribute(NN, 3)); mg.setAttribute('uv', new BufferAttribute(UV, 2));
    mg.setAttribute('skinIndex', new BufferAttribute(SI, 4)); mg.setAttribute('skinWeight', new BufferAttribute(SW, 4)); mg.setIndex(tri);
    mg.boundingSphere = src.geometry.boundingSphere?.clone() || null;
    const tex = new CanvasTexture(drawMark(this.o)); tex.colorSpace = SRGBColorSpace; tex.anisotropy = 4;
    const kind = this.o.kind, mat = pbr('#ffffff', { rough: kind === 'scar' ? .38 : .55 });
    Object.assign(mat, { map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = this.mesh = new SkinnedMesh(mg, mat); mesh.name = 'human:mark ' + kind; mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.userData.noAO = true;
    mesh.bind(src.skeleton, src.bindMatrix); P.add(mesh);
    this.place(); this.strength = this.o.strength ?? 1;
  }
  // a hair over the skin where the skin is now (after looks.shape)
  place() {
    const p = this.mesh.geometry.attributes.position, src = this.src.attributes.position, N = this.mesh.geometry.attributes.normal;
    for (let j = 0; j < this.keep.length; j++) { const q = this.keep[j]; p.setXYZ(j, src.getX(q) + N.getX(j) * .0006, src.getY(q) + N.getY(j) * .0006, src.getZ(q) + N.getZ(j) * .0006); }
    p.needsUpdate = true;
  }
  get strength() { return this.mesh.material.opacity; }
  set strength(v) { this.mesh.material.opacity = clamp(v, 0, 1); this.mesh.visible = v > .005; this.o.strength = this.mesh.material.opacity; }
  remove() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.map?.dispose(); this.mesh.material.dispose(); this.L.marks = this.L.marks.filter(m => m !== this); }
}

// the picture of a mark, 256 square, see-through round it
function drawMark({ kind = 'tattoo', design, colour, seed = 1 }) {
  const S = 256, cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
  const c = cv.getContext('2d'); let s = (seed * 2654435761) >>> 0; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  c.lineCap = c.lineJoin = 'round';
  if (kind === 'scar') {
    const d = design || 'slash', col = colour || '#d9a093';
    const cut = (x0, y0, x1, y1, w) => {   // a healed cut: a raised pale line, a little darker and pinker at its edges, uneven
      const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([x0 + (x1 - x0) * t + (r() - .5) * 4, y0 + (y1 - y0) * t + (r() - .5) * 4, Math.sin(t * Math.PI) ** .6]); }
      for (const [lw, cl, a] of [[w * 2.6, '#9a4a48', .35], [w * 1.5, '#c27a74', .55], [w, col, .95], [w * .35, '#f2cfc6', .6]]) {
        c.strokeStyle = cl; c.globalAlpha = a;
        for (let i = 1; i < pts.length; i++) { c.lineWidth = Math.max(.5, lw * pts[i][2]); c.beginPath(); c.moveTo(pts[i - 1][0], pts[i - 1][1]); c.lineTo(pts[i][0], pts[i][1]); c.stroke(); }
      }
      c.globalAlpha = 1;
    };
    if (d === 'claw') for (let i = 0; i < 3; i++) cut(70 + i * 40, 40 + i * 6, 110 + i * 40, 216 - i * 4, 9);
    else if (d === 'burn') {
      for (let i = 0; i < 26; i++) { const x = 128 + (r() - .5) * 120, y = 128 + (r() - .5) * 120, rr = 14 + r() * 30, g = c.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, i % 3 ? col : '#b8645e'); g.addColorStop(1, 'rgba(180,90,80,0)'); c.fillStyle = g; c.globalAlpha = .55; c.beginPath(); c.arc(x, y, rr, 0, 7); c.fill(); }
      c.globalAlpha = 1;
    } else if (d === 'stitch') { cut(30, 128, 226, 128, 8); c.strokeStyle = '#8a4a46'; c.lineWidth = 4; for (let x = 45; x < 220; x += 22) { c.beginPath(); c.moveTo(x - 6, 116); c.lineTo(x + 6, 140); c.stroke(); } }
    else cut(40, 50, 216, 206, 11);
    return cv;
  }
  const ink = colour || (kind === 'paint' ? '#a8282a' : '#1c2433'), d = design || (kind === 'paint' ? 'stripes' : 'band');
  c.strokeStyle = c.fillStyle = ink; c.globalAlpha = kind === 'paint' ? .85 : .82;
  // (ink spreads a little under skin: a soft edge)
  c.shadowColor = ink; c.shadowBlur = kind === 'paint' ? 2 : 3;
  const star = (x, y, R, n, inner) => { c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n - Math.PI / 2, q = i % 2 ? R * inner : R; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } c.closePath(); };
  if (d === 'band') { c.lineWidth = 10; for (const y of [70, 186]) { c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke(); } c.lineWidth = 8; c.beginPath(); for (let x = 0; x <= 256; x += 32) { c.lineTo(x, 92); c.lineTo(x + 16, 164); } c.stroke(); }
  else if (d === 'spiral') { c.lineWidth = 9; c.beginPath(); for (let a = 0; a < 6 * Math.PI; a += .05) { const q = 6 + a * 5.6; c.lineTo(128 + Math.cos(a) * q, 128 + Math.sin(a) * q); } c.stroke(); }
  else if (d === 'star') { star(128, 132, 100, 5, .42); c.lineWidth = 8; c.stroke(); star(128, 132, 44, 5, .42); c.fill(); }
  else if (d === 'rune') { c.lineWidth = 12; c.beginPath(); c.moveTo(128, 24); c.lineTo(128, 232); c.stroke(); for (let i = 0; i < 3; i++) { const y = 50 + r() * 140, sx = r() < .5 ? -1 : 1; c.beginPath(); c.moveTo(128, y); c.lineTo(128 + sx * (40 + r() * 40), y + (r() - .5) * 90); c.stroke(); } c.beginPath(); c.arc(128, 128, 112, 0, 7); c.lineWidth = 5; c.stroke(); }
  else if (d === 'leaf') { c.lineWidth = 6; c.beginPath(); c.moveTo(128, 240); c.quadraticCurveTo(110, 128, 128, 16); c.stroke(); for (let i = 0; i < 6; i++) { const y = 200 - i * 30, sx = i % 2 ? 1 : -1; c.beginPath(); c.ellipse(128 + sx * 34, y, 36, 12, sx * -.5, 0, 7); c.fill(); } }
  else if (d === 'wing') { for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(40, 150); c.quadraticCurveTo(110 + i * 12, 40 + i * 14, 230 - i * 4, 70 + i * 22); c.quadraticCurveTo(120 + i * 8, 120 + i * 6, 40, 160); c.globalAlpha = .55 + i * .05; c.fill(); } }
  else if (d === 'dots') { for (let y = 40; y < 230; y += 30) for (let x = 40; x < 230; x += 30) if (Math.hypot(x - 128, y - 128) < 100) { c.beginPath(); c.arc(x, y, 6 + 3 * Math.sin(x + y), 0, 7); c.fill(); } }
  else if (d === 'mask') { c.beginPath(); c.ellipse(128, 128, 120, 40, 0, 0, 7); c.fill(); }
  else { c.lineWidth = 22; for (const y of [80, 128, 176]) { c.beginPath(); c.moveTo(20, y); c.lineTo(236, y + (r() - .5) * 16); c.stroke(); } }
  return cv;
}

// ---- a character creator's state: sliders that show at once, picks that make the person again
const SKINS = ['#f2d3c0', '#e6bc9e', '#d4a07e', '#bd8562', '#a06a4a', '#82533a', '#65402c', '#4a2e20'];
const HAIRS = ['#e9d8a6', '#c9a35a', '#9a6a36', '#6a4426', '#3c281a', '#1a1412', '#8a3a1e', '#b8b5ae'];
const pickOf = (list, v) => list[Math.round(clamp(v, 0, 1) * (list.length - 1))];
const mixOf = (list, v) => { const f = clamp(v, 0, 1) * (list.length - 1), i = Math.min(list.length - 2, Math.floor(f)); return '#' + new Color(list[i]).lerp(new Color(list[i + 1]), f - i).getHexString(); };
/** The creator's sliders: id, group, label, min, max, step, and live (shows at once) or not (the person is made again when you stop). */
export const CREATOR_SLIDERS = [
  { id: 'height', group: 'build', label: 'Height', min: .88, max: 1.12, live: true }, { id: 'weight', group: 'build', label: 'Weight', min: -1, max: 1, live: true },
  { id: 'muscle', group: 'build', label: 'Muscle', min: 0, max: 1, live: true }, { id: 'age', group: 'age', label: 'Age', min: 0, max: 1, live: true },
  { id: 'jaw', group: 'face', label: 'Jaw', min: -1, max: 1, live: true }, { id: 'chin', group: 'face', label: 'Chin', min: -1, max: 1, live: true },
  { id: 'cheeks', group: 'face', label: 'Cheeks', min: -1, max: 1, live: true }, { id: 'nose', group: 'face', label: 'Nose', min: -1, max: 1, live: true },
  { id: 'lips', group: 'face', label: 'Lips', min: -1, max: 1, live: true }, { id: 'brow', group: 'face', label: 'Brow', min: -1, max: 1, live: true },
  { id: 'eyes', group: 'face', label: 'Eyes', min: -1, max: 1, live: true }, { id: 'skin', group: 'skin', label: 'Skin', min: 0, max: 1, live: true },
  { id: 'hair', group: 'hair', label: 'Hair colour', min: 0, max: 1, live: true }, { id: 'beard', group: 'hair', label: 'Beard', min: 0, max: 1.5, live: false },
  { id: 'lean', group: 'soul', label: 'Good or evil', min: -1, max: 1, live: true },
];
/** The creator's picks: id, group, label, choices (the person is made again when one changes). */
export const CREATOR_PICKS = [
  { id: 'sex', group: 'body', label: 'Body', choices: ['m', 'f'] }, { id: 'hairStyle', group: 'hair', label: 'Hair', choices: ['short', 'long', 'bun', 'bald'] },
  { id: 'heritage', group: 'face', label: 'Heritage', choices: ['african', 'east-asian', 'european', 'middle-eastern'] }, { id: 'seed', group: 'face', label: 'Face', choices: [1, 2, 3, 4, 5, 6, 7, 8] },
];

/**
 * A character creator: new Creator(options for gs.models.human, { onSwap(old, now) }). person is the one to show; set(id, value) for a
 * slider or a pick (sliders show at once; the picks, and skin and hair colours exactly, make the person again in the background a
 * moment after the last change: onSwap then gives the old and the new, to put the new where the old stood); value(id); sliders,
 * picks (to draw your own panel); update(dt) each frame; options() (what to give gs.models.human for this person, with looks: its
 * looks.pack()); pack() / unpack(data) for api.save().
 */
export class Creator {
  constructor(human, o = {}, { onSwap = null, wait = .45 } = {}) {
    this.human = human; this.onSwap = onSwap; this.wait = wait; this.idle = 0; this.pending = false; this.making = null;
    this.vals = { sex: o.sex || 'm', hairStyle: o.hairStyle || 'short', heritage: typeof o.heritage === 'string' ? o.heritage : 'european', seed: o.seed ?? 1, beard: o.beard ?? 0, skin: .3, hair: .55, height: 1, weight: 0, muscle: .3, age: 0, jaw: 0, chin: 0, cheeks: 0, nose: 0, lips: 0, brow: 0, eyes: 0, lean: 0 };
    this.extra = { ...o }; for (const k of ['sex', 'hairStyle', 'heritage', 'seed', 'beard', 'skin', 'hair', 'looks']) delete this.extra[k];
    this.sliders = CREATOR_SLIDERS; this.picks = CREATOR_PICKS;
    this.person = human(this.made()); this.apply();
  }
  value(id) { return this.vals[id]; }
  made() { const v = this.vals; return { ...this.extra, sex: v.sex, hairStyle: v.hairStyle, heritage: v.heritage, seed: v.seed, beard: v.sex === 'f' ? 0 : v.beard, skin: mixOf(SKINS, v.skin), hair: mixOf(HAIRS, v.hair) }; }
  look() { const v = this.vals, o = {}; for (const k of ['height', 'weight', 'muscle', 'age', 'jaw', 'chin', 'cheeks', 'nose', 'lips', 'brow', 'eyes', 'lean']) o[k] = v[k]; return o; }
  apply() {
    const L = this.person.looks, v = this.vals, base = this.made();
    L.set({ ...this.look(), skin: base.skin, hair: base.hair });
  }
  /** Sets a slider or a pick. */
  set(id, value) {
    const s = this.sliders.find(q => q.id === id), p = this.picks.find(q => q.id === id);
    if (!s && !p) throw new Error(`Creator: no slider or pick '${id}'`);
    if (s) value = clamp(+value, s.min, s.max); else if (!p.choices.includes(value)) throw new Error(`Creator: '${id}' is one of ${p.choices.join(', ')}`);
    if (this.vals[id] === value) return this;
    this.vals[id] = value;
    if (s && s.live) { if (id === 'skin' || id === 'hair') this.person.looks.set({ [id]: this.made()[id] }); else this.person.looks.set({ [id]: value }); }
    if (!s || !s.live || id === 'skin' || id === 'hair') { this.pending = true; this.idle = 0; }
    return this;
  }
  /** Each frame: a moment after the last pick (or colour) the person is made again in the background, then swapped in. */
  update(dt = 0) {
    this.idle += dt;
    if (this.pending && !this.making && this.idle >= this.wait) {
      this.pending = false; const opts = this.made();
      this.making = Promise.resolve(this.human.ready ? this.human.ready(opts) : true).then(() => {
        this.making = null; if (this.pending) return;
        const old = this.person, now = this.human(opts);
        now.position.copy(old.position); now.quaternion.copy(old.quaternion);
        this.person = now; this.apply(); now.scale.setScalar(now.looks.base.height * this.vals.height);
        for (const m of old.looks?.marks || []) now.looks.mark(m.o);
        this.onSwap?.(old, now);
      }, e => { this.making = null; this.error = e; });
    }
    return this;
  }
  get busy() { return this.pending || !!this.making; }
  /** What to give gs.models.human for this person, and its looks (person.looks.unpack(o.looks) after making it). */
  options() { return { ...this.made(), looks: this.person.looks.pack() }; }
  pack() { return { v: { ...this.vals }, marks: this.person.looks.marks.map(m => m.o) }; }
  unpack(d) { if (!d) return this; Object.assign(this.vals, d.v || {}); this.pending = true; this.idle = this.wait; this.apply(); for (const o of d.marks || []) this.person.looks.mark(o); return this; }
}
