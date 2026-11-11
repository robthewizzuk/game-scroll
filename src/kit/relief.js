// Real surface detail (gs.models.relief): the bumps a material only paints (its height picture: the
// bricks of a wall, the tiles of a roof, the bark of a trunk) made into real geometry, in the background.
//
//   const roof = new Mesh(roofGeometry, pbr('#fff', { tex: tiles, depth: .024 }));
//   gs.models.relief(roof);                    // or relief(group, { depth: .05, fine: .02, maxTris: 200000 })
//
// The mesh draws as it always did (flat, with the parallax shader where there is one) until its relief
// has been built in the worker (relief-build.js: a second or two for a roof, once for a mesh's content,
// then kept in IndexedDB). From then on the Next Gen view draws the relief in its place through cluster
// detail (detail.js; hd3d.js autoDetail), so it costs triangles only where it is near enough to show:
// full detail at arm's length, the flat surface again on the far side of the valley. The game's own
// mesh keeps its simple geometry (raycasts, physics and anything else that reads it stay as cheap as
// before), and with HD.detail off it simply draws as before.
//
// The relief takes its shape from the height picture the material was made with (surface()'s height
// layer: pbr({ tex }), gs.models.material()), read through the mesh's UVs. Depth is how far the lowest
// parts go in: nothing is pushed out, so the mesh still fits where it was put. Not for materials laid
// on by position or scattered (gs.models.material's solid and scatter), and not for meshes that move
// their points (skinned, morphing).
import { BufferGeometry, BufferAttribute } from 'three';
import { Clusters, keyOf, work, canWork, canCluster } from './detail.js';

const RELIEF = new WeakMap();   // mesh -> its relief: { state: 'building' | 'ready' | 'failed', geometry, clusters, base, ver, key, tris, done }
/** A mesh's relief (kit use: the view reads it), or undefined. */
export const reliefOf = mesh => RELIEF.get(mesh);
/** Raised whenever a relief arrives or is taken off (the view looks again the same frame, instead of at its next scan). */
export const reliefNews = { n: 0 };

const VERSION = 1, MEM = 96 * 1048576;
const made = new Map();   // key -> { p (a promise of { geometry, clusters, info }), r (the same once here), t }
let clock = 0;

// the height picture as bytes (one a pixel), with a number for what is in it
const PICS = new WeakMap();
function picture(t) {
  const im = t.image, ver = t.source?.version ?? t.version;
  const c = PICS.get(im); if (c && c.ver === ver) return c;
  const w = im.width, h = im.height; if (!w || w !== h) return null;
  let rgba = null, step = 4;
  if (im.data) { rgba = im.data; step = Math.max(1, Math.round(rgba.length / (w * h))); }
  else {
    let cx = im.getContext ? im.getContext('2d', { willReadFrequently: true }) : null;
    if (!cx) { const cv = document.createElement('canvas'); cv.width = cv.height = w; cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0); }
    rgba = cx.getImageData(0, 0, w, h).data;
  }
  const data = new Uint8Array(w * h); let hash = 0x811c9dc5;
  for (let i = 0; i < w * h; i++) { const v = rgba[i * step]; data[i] = rgba instanceof Float32Array ? Math.max(0, Math.min(255, v * 255)) : v; }
  for (let i = 0, st = Math.max(1, (w * h) >> 16); i < w * h; i += st) { hash = Math.imul(hash ^ data[i], 0x01000193); }
  const out = { data, size: w, hash: (hash >>> 0).toString(36), ver };
  PICS.set(im, out);
  return out;
}
// which height picture a normal map was made from (surface() says so): found through the material's normal
// map, so a copy of the material (wear() makes one) still has it
const BUMPS = new WeakMap();
/** Kit use (surface()): this normal map was made from that height picture. */
export const noteHeight = (normal, height) => { if (normal && height) BUMPS.set(normal, height); };
const heightOf = (m, o) => { const t = (o.height?.isTexture ? o.height : o.height?.height) || (m.normalMap && BUMPS.get(m.normalMap)) || m.userData.pom?.height || m.userData.recipeHeight; return t && t.isTexture && t.image ? t : null; };   // (a texture has a height of its own: its picture's)
const plain = (a, size) => a && !a.isInterleavedBufferAttribute && a.array instanceof Float32Array && a.itemSize === size;
const num = x => +(+x).toPrecision(6);

function build(key, g, pic, tex, opts) {
  let e = made.get(key);
  if (e) { e.t = ++clock; return e.p; }
  const run = async () => {
    let d = canWork() ? await work({ op: 'get', key }).catch(() => null) : null;
    if (!d?.relief) {
      const A = g.attributes, extra = [];
      for (const name in A) if (name !== 'position' && name !== 'normal' && name !== 'uv' && A[name].array instanceof Float32Array && !A[name].isInterleavedBufferAttribute) extra.push({ name, size: A[name].itemSize, array: A[name].array.slice() });
      const input = { positions: A.position.array.slice(), normals: A.normal.array.slice(), uvs: A.uv.array.slice(), index: g.index ? Uint32Array.from(g.index.array) : null, extra,
        height: { data: pic.data.slice(), size: pic.size, repeat: [tex.repeat.x, tex.repeat.y], offset: [tex.offset.x, tex.offset.y], flipY: tex.flipY } };
      const cluster = { maxTris: 512, group: 8 };
      if (canWork()) d = await work({ op: 'relief', key, input, opts, cluster }, [input.positions.buffer, input.normals.buffer, input.uvs.buffer, input.height.data.buffer, ...(input.index ? [input.index.buffer] : []), ...extra.map(x => x.array.buffer)]);
      else if (typeof document === 'undefined') {   // (tests in Node: built on the spot)
        const [R, B] = await Promise.all([import('./relief-build.js'), import('./detail-build.js')]); await Promise.all([R.reliefReady, B.buildReady]);
        d = R.reliefClusters(R.buildRelief(input, opts), input, B.buildFrom, cluster);
      } else throw new Error('no worker to build in');
    }
    const r = d.relief, geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(r.positions, 3)); geometry.setAttribute('normal', new BufferAttribute(r.normals, 3)); geometry.setAttribute('uv', new BufferAttribute(r.uvs, 2));
    r.names.forEach((name, i) => geometry.setAttribute(name, new BufferAttribute(r.extra[i], r.sizes[i])));
    geometry.computeBoundingSphere(); geometry.computeBoundingBox(); geometry.name = (g.name || 'mesh') + ':relief';
    const clusters = new Clusters(d); clusters.key = key; clusters.users = 0;
    const out = { geometry, clusters, info: { tris: r.tris, points: r.points, split: r.split, full: r.full, depth: r.depth, fine: r.fine, error: r.error }, bytes: clusters.bytes + r.positions.byteLength + r.normals.byteLength + r.uvs.byteLength + r.extra.reduce((n, a) => n + a.byteLength, 0) };
    const e2 = made.get(key); if (e2) e2.r = out;
    tidy();
    return out;
  };
  e = { p: null, r: null, t: ++clock };
  made.set(key, e);
  e.p = run().catch(err => { made.delete(key); throw err; });
  return e.p;
}
// reliefs nothing draws any more are let go, oldest first, once they add up to more than MEM bytes
function tidy() {
  let sum = 0; for (const e of made.values()) if (e.r) sum += e.r.bytes;
  if (sum <= MEM) return;
  for (const [k, e] of [...made].sort((a, b) => a[1].t - b[1].t)) { if (sum <= MEM) break; if (!e.r || e.r.clusters.users > 0) continue; made.delete(k); sum -= e.r.bytes; e.r.geometry.dispose(); }
}

function start(mesh, o) {
  const m = mesh.userData.gsGlMat || mesh.material;
  if (!m || Array.isArray(m) || mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.isBatchedMesh || mesh.morphTargetInfluences) return false;
  if (m.userData.recipe && (m.userData.recipe.solid || m.userData.recipe.scatter)) return false;
  const tex = heightOf(m, o), g = mesh.userData.gsLod?.base || mesh.geometry, A = g?.attributes;
  if (!tex || !A || !canCluster(g) || !plain(A.normal, 3) || !plain(A.uv, 2) || g.groups.length > 1) return false;
  const pic = picture(tex); if (!pic) return false;
  // lengths are given in metres as the mesh stands in the world; the builder works in the mesh's own units
  mesh.updateWorldMatrix(true, false);
  const s = mesh.matrixWorld.getMaxScaleOnAxis() || 1, len = x => x == null ? undefined : num(x / s);
  const opts = { depth: len(o.depth), depthTiles: o.depth == null ? num(m.userData.pom?.depth ?? .03) : undefined, fine: len(o.fine), coarse: len(o.coarse), error: len(o.error), maxTris: Math.max(1000, Math.round(o.maxTris ?? 150000)), mid: o.mid == null ? 1 : num(o.mid) };
  const key = ['relief', VERSION, keyOf(g), pic.hash, pic.size, num(tex.repeat.x), num(tex.repeat.y), num(tex.offset.x), num(tex.offset.y), tex.flipY ? 1 : 0, opts.depth ?? 't' + opts.depthTiles, opts.fine ?? '', opts.coarse ?? '', opts.error ?? '', opts.maxTris, opts.mid].join('|');
  const was = RELIEF.get(mesh); if (was && was.key === key && was.state !== 'failed') return true;
  const R = { state: 'building', key, geometry: null, clusters: null, info: null, base: g, ver: A.position.version, error: null, done: null };
  RELIEF.set(mesh, R); mesh.userData.relief = 'building';
  R.done = build(key, g, pic, tex, opts).then(r => {
    if (RELIEF.get(mesh) !== R) return false;
    R.geometry = r.geometry; R.clusters = r.clusters; R.info = r.info; R.state = 'ready'; mesh.userData.relief = 'ready'; reliefNews.n++;
    return true;
  }, err => { if (RELIEF.get(mesh) === R) { R.state = 'failed'; R.error = err; mesh.userData.relief = 'failed'; } return false; });
  return true;
}

/**
 * Real surface detail for a mesh (or every mesh under a group): its material's bumps made into geometry,
 * built in the background and drawn by the Next Gen view through cluster detail. Returns what it was given.
 * Options (lengths in metres): depth (how far the lowest parts go in; default: the material's parallax
 * depth, or 3% of a tile), fine (the smallest detail made, default half the depth: smaller is sharper and
 * costs more triangles), coarse (no edge longer than this, default 16 x fine), error (how far the surface
 * may be from the height picture, default a tenth of the depth), maxTris (the most triangles a mesh may get,
 * 150,000), height (a surface() set or its height texture, when the material has none of its own), mid
 * (the height that stays where the flat surface was, 0..1; default 1: nothing is pushed out).
 * relief(target, false) takes it off again. mesh.userData.relief says how it stands: 'building', 'ready',
 * 'failed' (it then just draws as before); relief.ready(target) resolves when every mesh's has arrived.
 */
export function relief(target, o = {}) {
  target?.traverse?.(x => {
    if (!x.isMesh || x.isDetailMesh) return;
    if (o === false) { if (RELIEF.delete(x)) { delete x.userData.relief; reliefNews.n++; } }
    else start(x, o);
  });
  return target;
}
/** Resolves once the relief of every mesh under target has arrived (or failed): the number that arrived. */
relief.ready = async target => {
  const all = []; target?.traverse?.(x => { const R = RELIEF.get(x); if (R?.done) all.push(R.done); });
  return (await Promise.all(all)).filter(Boolean).length;
};
