// Smaller meshes: a mesh's points kept in about half the bytes, in JavaScript and on the graphics chip,
// with nothing to see for it and no shader changed (the number work and why each choice is safe: slim-core.js).
//
// A dense model made in code (a person of fifty thousand points, a creature, a vehicle, a hillside, a wall
// whose bricks are real triangles) spent 32 to 84 bytes a point as plain 32-bit floats. slim() rewrites,
// in place, the lists that hold far more precision than shows:
//   normal      3 bytes (was 12)        colour     6 bytes, half floats (was 12)
//   bones       8 bytes for four bone numbers and four weights (was 24 on WebGL, 32 on WebGPU)
//   UVs         4 bytes, half floats (was 8): only where the maker asks and they are small enough to stay exact
// Places stay floats: games, physics and rays read them. Only a mesh that the engine alone draws (the real
// surface detail of gs.models.relief, drawn through a twin) has its places on a 16-bit grid as well
// (gridPlaces), with the grid's size and offset folded into the twin's matrix.
//
// The engine's own makers call slim() on what they make (gs.models.human, creature, vehicle, building,
// tree, gs.outdoors.Land...). A game's own geometry is never touched: a game may be writing to it.
// Reading a slimmed list: three.js's getX()/fromBufferAttribute() give the real numbers back as before;
// code that reads `.array` itself must go through floats() here instead.
import { BufferAttribute, InterleavedBuffer, InterleavedBufferAttribute, BufferGeometry, Matrix4, StaticDrawUsage } from 'three';
import { biggest, normals8, normals16, tangents8, units8, skin8, places16 } from './slim-core.js';

/**
 * Tuning and counts. on: false leaves every mesh as plain floats (HD.slim is this); min: triangles a mesh
 * needs before it is worth it (smaller ones are merged into batches and cost little; a mesh on bones: a
 * tenth of that); uvMost: the biggest UV a half float still holds to half a texel of a 1024 picture.
 */
export const SLIM = {
  on: true, min: 3000, uvMost: 2,
  /** What slim() and gridPlaces() have done since the app started: meshes, their bytes before and after (in JavaScript; the chip's are within a few percent of the same). */
  stats: { meshes: 0, was: 0, now: 0 },
};

const isPlain = a => !!a && a.isBufferAttribute && !a.isInterleavedBufferAttribute && !a.isInstancedBufferAttribute && a.array instanceof Float32Array && a.usage === StaticDrawUsage && a.array.length === a.count * a.itemSize;
const bytesOf = a => (a.isInterleavedBufferAttribute ? 0 : a.array.byteLength);
// Half floats are kept in a real Float16Array (Chrome 135, Safari 18.2): both of three.js r187's renderers send one as
// half floats. Its older Float16BufferAttribute (the bits in a Uint16Array) is no use here: on WebGPU three widens those
// to 32 bits and then asks the chip for a format that does not exist. Where there is no Float16Array, colours stay floats.
const F16 = typeof Float16Array !== 'undefined' ? Float16Array : null;
const half = (src, size) => new BufferAttribute(new F16(src), size);   // (rounded to the nearest half by the browser)
const named = (a, from) => { a.name = from.name; return a; };

/**
 * Rewrites a geometry's lists in fewer bytes, in place (see the top of this file), and gives it back. For
 * geometry the engine made and nobody will write to again. Options: normal (8 or 16 bits: 16 for smooth,
 * shiny things like a car's paint, where a tenth of a degree can show in a highlight), uv (true: UVs as
 * half floats where none is bigger than SLIM.uvMost; left alone otherwise, as a tiled surface's must be),
 * colour (false leaves colours alone), skin (false leaves bone weights alone), unit (names of other
 * lists whose numbers are 0..1 and came from bytes: kept as bytes), force (true: however few triangles).
 * A list that is not plain floats any more (slimmed already, interleaved) or is marked as changing is left
 * as it is, so calling it twice does nothing more. geometry.userData.gsSlim says what was done.
 */
export function slim(geometry, { normal = 8, uv = false, colour = true, skin = true, unit = null, force = false } = {}) {
  const A = geometry?.attributes, P = A?.position;
  if (!SLIM.on || !P || geometry.userData.gsSlim) return geometry;
  const n = P.count, tris = (geometry.index ? geometry.index.count : n) / 3;
  if (!force && tris < (A.skinIndex ? SLIM.min / 10 : SLIM.min)) return geometry;
  let was = 0, now = 0; const did = [];
  const put = (name, a) => { was += bytesOf(A[name]); now += bytesOf(a); geometry.setAttribute(name, named(a, A[name])); did.push(name); };
  if (isPlain(A.normal) && A.normal.itemSize === 3) put('normal', normal === 16 ? new BufferAttribute(normals16(A.normal.array, n), 3, true) : new BufferAttribute(normals8(A.normal.array, n), 3, true));
  if (isPlain(A.tangent) && A.tangent.itemSize === 4) put('tangent', new BufferAttribute(tangents8(A.tangent.array, n), 4, true));
  if (colour && F16 && isPlain(A.color) && biggest(A.color.array) <= 65504) put('color', half(A.color.array, A.color.itemSize));
  if (uv && F16) for (const name of ['uv', 'uv1', 'uv2']) if (isPlain(A[name]) && A[name].itemSize === 2 && biggest(A[name].array) <= SLIM.uvMost) put(name, half(A[name].array, 2));
  for (const name of unit || []) if (isPlain(A[name])) { const b = units8(A[name].array); if (b) put(name, new BufferAttribute(b, A[name].itemSize, true)); }
  const si = A.skinIndex, sw = A.skinWeight;
  if (skin && si && sw && isPlain(sw) && sw.itemSize === 4 && si.itemSize === 4 && !si.isInterleavedBufferAttribute && si.usage === StaticDrawUsage) {
    // (one list for both, read at two offsets: on WebGPU three.js widens a list of whole numbers on its own to 32 bits each, but not one read this way)
    const s = skin8(si.array, sw.array, n), buf = new InterleavedBuffer(s.array, 8);
    was += si.array.byteLength + sw.array.byteLength; now += s.array.byteLength; did.push('skinIndex', 'skinWeight');
    geometry.setAttribute('skinIndex', named(new InterleavedBufferAttribute(buf, 4, 0, false), si)); geometry.setAttribute('skinWeight', named(new InterleavedBufferAttribute(buf, 4, 4, true), sw));
  }
  if (!did.length) return geometry;
  geometry.userData.gsSlim = { lists: did, was, now };
  count(geometry, was, now);
  return geometry;
}
/**
 * Geometries that share their lists (a figure's levels of detail: the same points, other triangles): the
 * first is slimmed and the others are given its lists, so the points are still kept once.
 */
export function slimShared(geos, o = {}) {
  const g0 = geos[0]; if (!g0) return geos;
  const before = { ...g0.attributes }; slim(g0, { force: true, ...o });
  if (!g0.userData.gsSlim) return geos;
  for (let i = 1; i < geos.length; i++) {
    const g = geos[i];
    for (const k in g0.attributes) if (g.attributes[k] === before[k] && g0.attributes[k] !== before[k]) g.setAttribute(k, g0.attributes[k]);
    g.userData.gsSlim = g0.userData.gsSlim;
  }
  return geos;
}
function count(geometry, was, now) {
  const S = SLIM.stats; S.meshes++; S.was += was; S.now += now;
  const gone = () => { geometry.removeEventListener('dispose', gone); S.meshes--; S.was -= was; S.now -= now; };
  geometry.addEventListener('dispose', gone);
}

/**
 * A geometry's places on a 16-bit grid, in place: for geometry only the engine draws and reads (the twin
 * of a mesh's real surface detail). The points then stand in a box of -1..1; geometry.userData.gsGrid
 * = { matrix, step, scale, offset } is what puts them back (the matrix goes after the mesh's own:
 * world = mesh.matrixWorld x matrix), and the geometry's bounding box and sphere are in the packed space,
 * as three.js expects of a mesh under that matrix. One scale for all three directions, so normals stay true.
 * most: the coarsest grid allowed, in the mesh's units (a point moves half a step at most): a mesh too big
 * for a grid that fine keeps its floats.
 */
export function gridPlaces(geometry, { most = Infinity } = {}) {
  const P = geometry?.attributes?.position;
  if (!SLIM.on || !isPlain(P) || P.itemSize !== 3 || geometry.userData.gsGrid) return geometry;
  if (geometry.morphAttributes?.position) return geometry;
  const p = places16(P.array, P.count); if (!(p.step <= most)) return geometry;
  const a = named(new BufferAttribute(p.array, 3, true), P), was = P.array.byteLength;
  geometry.setAttribute('position', a);
  geometry.userData.gsGrid = { matrix: new Matrix4().makeScale(p.scale, p.scale, p.scale).setPosition(p.offset[0], p.offset[1], p.offset[2]), step: p.step, scale: p.scale, offset: p.offset };
  geometry.boundingBox = null; geometry.boundingSphere = null; geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  count(geometry, was, p.array.byteLength);
  return geometry;
}

/**
 * A list's numbers as plain floats, whatever it is kept as: the list's own array when that is what it
 * already is (not a copy: don't write to it), else a new Float32Array. from, count: a run of its points.
 * For kit code that used to read `attribute.array`.
 */
export function floats(a, from = 0, count = a.count - from) {
  const size = a.itemSize;
  if (!a.isInterleavedBufferAttribute && !a.normalized) {
    if (a.array instanceof Float32Array) return from === 0 && count === a.count && a.array.length === count * size ? a.array : a.array.slice(from * size, (from + count) * size);
    if (F16 && a.array instanceof F16) return new Float32Array(a.array.subarray(from * size, (from + count) * size));
  }
  const out = new Float32Array(count * size), get = [i => a.getX(i), i => a.getY(i), i => a.getZ(i), i => a.getW(i)];
  for (let i = 0; i < count; i++) for (let k = 0; k < size; k++) out[i * size + k] = get[k](from + i);
  return out;
}
/** A run of a list's points as plain floats, always a new Float32Array (yours to change). */
export function floatsOf(a, from = 0, count = a.count - from) { const f = floats(a, from, count); return f === a.array ? f.slice() : f; }
/**
 * The points numbered in `src` out of some of a geometry's lists, as new lists kept the same way (bytes
 * stay bytes, lists read at two offsets stay one list): { name: attribute }. For a second geometry made
 * from a part of the first (a coat of fur over a body).
 */
export function pickLists(geometry, names, src) {
  const out = {}, bufs = new Map(), m = src.length;
  for (const name of names) {
    const a = geometry.attributes[name]; if (!a) continue;
    if (a.isInterleavedBufferAttribute) {
      let b = bufs.get(a.data);
      if (!b) { const st = a.data.stride, from = a.data.array, to = new from.constructor(m * st); for (let i = 0; i < m; i++) for (let q = 0; q < st; q++) to[i * st + q] = from[src[i] * st + q]; bufs.set(a.data, b = new InterleavedBuffer(to, st)); }
      out[name] = new InterleavedBufferAttribute(b, a.itemSize, a.offset, a.normalized); continue;
    }
    const s = a.itemSize, from = a.array, to = new from.constructor(m * s); for (let i = 0; i < m; i++) for (let q = 0; q < s; q++) to[i * s + q] = from[src[i] * s + q];
    out[name] = new BufferAttribute(to, s, a.normalized);
  }
  return out;
}
/**
 * Another attribute of the same kind over the same numbers: for a second geometry that must free its own
 * lists on the chip without freeing the first's. seen (a Map, the same one for every list of the geometry)
 * keeps two lists read out of one (bone numbers and weights) as one in the copy too.
 */
export function sameList(a, seen = null) {
  if (a.isInterleavedBufferAttribute) {
    let d = seen?.get(a.data); if (!d) { d = new InterleavedBuffer(a.data.array, a.data.stride); seen?.set(a.data, d); }
    return named(new InterleavedBufferAttribute(d, a.itemSize, a.offset, a.normalized), a);
  }
  const b = new BufferAttribute(a.array, a.itemSize, a.normalized); b.gpuType = a.gpuType; return named(b, a);
}
/** Is any of this geometry's lists kept small (so that code which merges or cuts raw arrays must go through fat() first)? */
export const isSlim = g => !!(g?.userData?.gsSlim || g?.userData?.gsGrid);
/**
 * A copy of a geometry with every list as plain floats again (and its places unpacked): for code that
 * merges, cuts or rebuilds raw arrays (three.js's mergeGeometries, a shatter). The same index, groups and
 * blend shapes; a geometry with nothing slimmed is given back as it is.
 */
export function fat(geometry) {
  if (!isSlim(geometry)) return geometry;
  const g = new BufferGeometry(), A = geometry.attributes, un = geometry.userData.gsGrid;
  for (const name in A) {
    const a = A[name];
    if (name === 'skinIndex') { const f = floats(a), u = new Uint16Array(f.length); u.set(f); g.setAttribute(name, new BufferAttribute(u, a.itemSize)); continue; }
    const f = floats(a); g.setAttribute(name, new BufferAttribute(f === a.array ? f.slice() : f, a.itemSize));
  }
  if (un) g.attributes.position.applyMatrix4(un.matrix);
  if (geometry.index) g.setIndex(geometry.index);
  for (const gr of geometry.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  g.morphAttributes = geometry.morphAttributes; g.morphTargetsRelative = geometry.morphTargetsRelative; g.name = geometry.name;
  g.userData = { ...geometry.userData }; delete g.userData.gsSlim; delete g.userData.gsGrid;
  return g;
}

/**
 * The bytes the geometries under a thing keep, each list counted once however many geometries share it (a
 * figure's levels of detail are other triangles of the same points): { js (in JavaScript), chip (on the
 * graphics chip, worked out from what three.js sends, not read back: on WebGPU it pads a point's numbers to
 * four bytes and widens whole numbers to 32 bits), points }. For tests and the engine test scenes.
 */
export function meshBytes(root, webgpu = false) {
  const seen = new Set(); let js = 0, chip = 0, points = 0;
  const add = (a, index, place) => {
    const key = a.isInterleavedBufferAttribute ? a.data : a; if (seen.has(key)) return; seen.add(key);
    const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array; if (!arr) return;
    let c = arr.byteLength; js += c; if (place) points += a.count;
    if (webgpu && !a.isInterleavedBufferAttribute) {
      let per = arr.BYTES_PER_ELEMENT; const fl = arr instanceof Float32Array || (F16 && arr instanceof F16);
      if (!a.normalized && per < 4 && !fl && !index) per = 4;
      let stride = per * a.itemSize; if (a.itemSize > 1 && stride % 4) stride = Math.ceil(stride / 4) * 4;
      c = a.count * stride;
    }
    chip += c;
  };
  root.traverse(o => {
    const g = o.geometry; if (!g?.attributes) return;
    for (const k in g.attributes) add(g.attributes[k], false, k === 'position');
    if (g.index) add(g.index, true, false);
    for (const k in g.morphAttributes || {}) for (const a of g.morphAttributes[k]) add(a, false, false);
  });
  return { js, chip, points };
}
