// The traced level (ray traced reflections, hd3d-gpu-trace.js): a simplified copy of the level's
// triangles in one tree the graphics chip can send rays through. This makes one block of it from plain
// arrays: the pieces are put where they stand, the big ones simplified to fit the budget, and the tree
// built by three-mesh-bvh and packed the way its shader functions read it. No page needed: it runs in a
// worker (trace-worker.js), or on the spot where there is none, or straight in Node (the kit test).
// Kit use only.
import { BufferGeometry, BufferAttribute } from 'three';
import { MeshBVH } from 'three-mesh-bvh/src/core/MeshBVH.js';
import { SAH } from 'three-mesh-bvh/src/core/Constants.js';
import { appendBVHSubtree, getMaxNodeDepth, GPU_BYTES_PER_NODE } from 'three-mesh-bvh/src/webgpu/utils/packBVHBufferUtils.js';
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';

export const traceReady = MeshoptSimplifier.ready;
/** Floats a corner: where it is (and 1), which way it faces, and its look. */
export const VERT = 8;
/** Bytes a node (the library's packed node). */
export const NODE_BYTES = GPU_BYTES_PER_NODE;
/** The deepest a block's tree may go (the shader's stack holds this, the tree over the blocks, and a few to spare). */
export const BLOCK_DEPTH = 36;
const SIMPLIFY_MIN = 400;   // triangles: smaller pieces are kept as they are

/**
 * A corner's look in one number a float holds exactly: its colour in 16 bits (5-6-5), a place in
 * the glow table in 7 more (0: it doesn't glow), and one bit for polished metal (it shows its
 * surroundings in its colour, where other things show the light that falls on them).
 */
export function packLook(r, g, b, glow = 0, metal = false) {
  const q = (v, n) => Math.min(n, Math.max(0, Math.round(Math.sqrt(Math.max(0, v)) * n)));   // (stored as its square root: more of the 5 bits go to the dark colours, where the eye tells them apart)
  return (q(r, 31) | (q(g, 63) << 5) | (q(b, 31) << 11)) + ((glow & 127) + (metal ? 128 : 0)) * 65536;
}

// the piece's triangles, simplified to about `keep` of them (cached: the same shape is often used many times)
function simplified(shape, start, count, keep, cache) {
  const whole = shape.idx ? shape.idx.subarray(start, start + count) : null, n = (whole ? whole.length : count) / 3;
  if (keep >= .95 || n < SIMPLIFY_MIN) return whole;
  const target = Math.max(12, Math.floor(n * keep)) * 3, key = `${start}:${count}:${target}`, had = cache.get(shape)?.get(key);
  if (had) return had;
  let I = whole;
  if (!I) { I = new Uint32Array(count); for (let i = 0; i < count; i++) I[i] = start + i; }
  else if (!(I instanceof Uint32Array)) I = Uint32Array.from(I);
  let out = I;
  try {
    // (a reflection forgives a lot: up to a twelfth of the piece's size off, edges free to move)
    [out] = MeshoptSimplifier.simplify(I, shape.pos, 3, target, .08);
    if (out.length > target * 1.5) { const [o2] = MeshoptSimplifier.simplifySloppy(I, shape.pos, 3, null, target, .15); if (o2.length >= 12 && o2.length < out.length) out = o2; }
  } catch (e) { out = I; }
  if (!out.length) out = I;
  let m = cache.get(shape); if (!m) cache.set(shape, m = new Map());
  m.set(key, out);
  return out;
}

/**
 * One block of the traced level.
 * shapes: [{ pos: Float32Array (x, y, z a corner), nrm: the same for normals or null, col: the same for
 *   vertex colours or null, idx: Uint32Array | Uint16Array | null }]
 * items: [{ shape: which, start, count: its part of the index (or of the corners, with no index),
 *   m: Float32Array(16) where it stands or null (as it is), rgb: [r, g, b] its colour, glow: its place
 *   in the glow table, metal: polished metal, tint: use the vertex colours }]
 * budget: about how many triangles the block may hold.
 * Returns { nodes: Uint32Array (the tree, NODE_BYTES a node, its leaves counting triangles from the
 * block's first), index: Uint32Array (corners, from the block's first), attrs: Float32Array (VERT a
 * corner), box: [min x, y, z, max x, y, z], tris, verts, depth, was: triangles before simplifying,
 * left: the items left out (their places in `items`) }, or { tris: 0 } with nothing in it.
 */
export function buildBlock({ shapes, items, budget = 3e5 }) {
  const cache = new Map(), triOf = it => (Number.isFinite(it.count) ? it.count : (shapes[it.shape].idx ? shapes[it.shape].idx.length : shapes[it.shape].pos.length / 3)) / 3;
  for (const it of items) if (!Number.isFinite(it.count)) { it.start = 0; it.count = triOf(it) * 3; }
  const was = items.reduce((n, it) => n + Math.floor(it.count / 3), 0);
  if (!was) return { tris: 0, was: 0, left: [] };
  // over the budget: the big pieces are simplified by what would bring the whole to it
  let small = 0, big = 0;
  for (const it of items) { const n = it.count / 3; if (n < SIMPLIFY_MIN) small += n; else big += n; }
  const keep = was <= budget ? 1 : Math.min(1, Math.max(.04, (budget - small) / Math.max(1, big)));
  const parts = items.map((it, k) => { const sh = shapes[it.shape]; return { it, k, sh, idx: simplified(sh, it.start, it.count, keep, cache) }; });
  let tris = parts.reduce((n, p) => n + (p.idx ? p.idx.length : p.it.count) / 3, 0); const left = [];
  // still well over (a great many small pieces): the smallest ones are left out
  if (tris > budget * 1.25) {
    const size = p => { const m = p.it.m, s = m ? Math.cbrt(Math.abs(m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]))) : 1; return (p.sh.r ??= radius(p.sh.pos)) * s; };
    parts.sort((a, b) => size(b) - size(a));
    while (parts.length > 1 && tris > budget * 1.25) { const p = parts.pop(); tris -= (p.idx ? p.idx.length : p.it.count) / 3; left.push(p.k); }
  }
  // the pieces in one list of corners and triangles, each corner where it stands
  let nv = 0;
  const maps = parts.map(p => {
    // (only the corners its triangles use)
    const P = p.sh.pos.length / 3, map = new Int32Array(P).fill(-1), first = nv, I = p.idx;
    if (I) { for (let i = 0; i < I.length; i++) if (map[I[i]] < 0) map[I[i]] = nv++; }
    else for (let i = p.it.start; i < p.it.start + p.it.count; i++) map[i] = nv++;
    return { map, first };
  });
  const attrs = new Float32Array(nv * VERT), index = new Uint32Array(Math.round(tris) * 3), box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  let ni = 0;
  parts.forEach((p, k) => {
    const { map } = maps[k], { pos, nrm, col } = p.sh, { m, rgb, glow, tint, metal } = p.it, I = p.idx;
    // normals turn by the inverse transpose (a squashed piece's still stand off its faces)
    let n0 = 1, n1 = 0, n2 = 0, n3 = 0, n4 = 1, n5 = 0, n6 = 0, n7 = 0, n8 = 1;
    if (m) {
      const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
      n0 = e * i - f * h; n1 = f * g - d * i; n2 = d * h - e * g; n3 = c * h - b * i; n4 = a * i - c * g; n5 = b * g - a * h; n6 = b * f - c * e; n7 = c * d - a * f; n8 = a * e - b * d;
      if (a * n0 + b * n1 + c * n2 < 0) { n0 = -n0; n1 = -n1; n2 = -n2; n3 = -n3; n4 = -n4; n5 = -n5; n6 = -n6; n7 = -n7; n8 = -n8; }
    }
    const flat = packLook(rgb[0], rgb[1], rgb[2], glow, metal);
    for (let v = 0; v < map.length; v++) {
      const o = map[v]; if (o < 0) continue;
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], w = o * VERT;
      const X = m ? m[0] * x + m[4] * y + m[8] * z + m[12] : x, Y = m ? m[1] * x + m[5] * y + m[9] * z + m[13] : y, Z = m ? m[2] * x + m[6] * y + m[10] * z + m[14] : z;
      attrs[w] = X; attrs[w + 1] = Y; attrs[w + 2] = Z; attrs[w + 3] = 1;
      if (X < box[0]) box[0] = X; if (Y < box[1]) box[1] = Y; if (Z < box[2]) box[2] = Z; if (X > box[3]) box[3] = X; if (Y > box[4]) box[4] = Y; if (Z > box[5]) box[5] = Z;
      if (nrm) {
        const a = nrm[v * 3], b = nrm[v * 3 + 1], c = nrm[v * 3 + 2];
        let A = n0 * a + n3 * b + n6 * c, B = n1 * a + n4 * b + n7 * c, C = n2 * a + n5 * b + n8 * c; const L = Math.hypot(A, B, C) || 1;
        attrs[w + 4] = A / L; attrs[w + 5] = B / L; attrs[w + 6] = C / L;
      }   // (none: left at nothing, and the shader takes the triangle's own facing)
      attrs[w + 7] = tint && col ? packLook(rgb[0] * col[v * 3], rgb[1] * col[v * 3 + 1], rgb[2] * col[v * 3 + 2], glow, metal) : flat;
    }
    if (I) for (let i = 0; i < I.length; i++) index[ni++] = map[I[i]];
    else for (let i = p.it.start; i < p.it.start + p.it.count; i++) index[ni++] = map[i];
  });
  // the tree over the triangles (three-mesh-bvh; it sorts the index it is given into the tree's order)
  const pos = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) { pos[v * 3] = attrs[v * VERT]; pos[v * 3 + 1] = attrs[v * VERT + 1]; pos[v * 3 + 2] = attrs[v * VERT + 2]; }
  const geo = new BufferGeometry(); geo.setAttribute('position', new BufferAttribute(pos, 3)); geo.setIndex(new BufferAttribute(index, 1));
  const bvh = new MeshBVH(geo, { strategy: SAH, targetLeafSize: 6, maxDepth: BLOCK_DEPTH, setBoundingBox: false, indirect: false });
  const root = bvh._roots[0], n = root.byteLength / 32, packed = new ArrayBuffer(n * NODE_BYTES);
  appendBVHSubtree(root, 0, n, 0, 0, packed);
  return { nodes: new Uint32Array(packed), index, attrs, box, tris: index.length / 3, verts: nv, depth: getMaxNodeDepth(root), was, left };
}
function radius(pos) {
  let a = Infinity, b = Infinity, c = Infinity, d = -Infinity, e = -Infinity, f = -Infinity;
  for (let i = 0; i < pos.length; i += 3) { const x = pos[i], y = pos[i + 1], z = pos[i + 2]; if (x < a) a = x; if (y < b) b = y; if (z < c) c = z; if (x > d) d = x; if (y > e) e = y; if (z > f) f = z; }
  return Math.hypot(d - a, e - b, f - c) / 2;
}
/** The buffers of a block, to hand over without a copy. */
export const blockBuffers = b => b.tris ? [b.nodes.buffer, b.index.buffer, b.attrs.buffer] : [];
