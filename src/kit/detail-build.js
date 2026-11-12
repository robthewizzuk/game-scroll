// Cluster detail, the building half (gs.detail; detail.js draws what this makes).
//
// A mesh is cut into small pieces ("clusters", up to 512 triangles each). Neighbouring clusters are put
// in groups, each group is simplified to half its triangles with its outer edge left exactly as it was,
// and the result is cut into clusters again: a coarser copy of that patch of the mesh. The coarser
// clusters are grouped (with different neighbours, so the old edges fall inside the new groups) and
// halved again, and so on up to a handful of triangles for the whole mesh. Because a group's outer edge
// never changes, a patch drawn fine fits a patch drawn coarse with no crack between them, so every
// frame each part of the mesh can be drawn just fine enough for how big it is on screen (detail.js).
// This is the idea behind Unreal's Nanite, built on meshoptimizer's clusterizer and simplifier, and it
// follows the same steps as meshoptimizer's own clusterlod.h.
//
// Only triangles are made: every level uses the mesh's own points, so the answer is one long index
// list (all the clusters of all the levels) and a few small tables. No three.js here: it runs in a
// worker (detail-worker.js) or straight in Node (the kit test).
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';
import { MeshoptClusterizer } from 'three/examples/jsm/libs/meshopt_clusterizer.module.js';

/** Resolves once buildClusters() can run. */
export const buildReady = Promise.all([MeshoptSimplifier.ready, MeshoptClusterizer.ready]);

export const BUILD_VERSION = 2;   // (kept in every build: raise it when the tables change, and saved builds from before are made again; detail-worker.js)
const MAX_VERTS = 256, HUGE = 3e38;

// one level's clusters from a triangle list: [{ idx (into the caller's points), sphere [x, y, z, r] }]
function clusterize(idx, pos, maxTris, ids = null) {
  const b = MeshoptClusterizer.buildMeshletsFlex(idx, pos, 3, MAX_VERTS, Math.max(1, maxTris >> 2), maxTris, 0, 2);
  const bounds = MeshoptClusterizer.computeMeshletBounds(b, pos, 3), out = [];
  for (let i = 0; i < b.meshletCount; i++) {
    const vo = b.meshlets[i * 4], to = b.meshlets[i * 4 + 1], n = b.meshlets[i * 4 + 3] * 3, ix = new Uint32Array(n);
    if (ids) for (let k = 0; k < n; k++) ix[k] = ids[b.vertices[vo + b.triangles[to + k]]];
    else for (let k = 0; k < n; k++) ix[k] = b.vertices[vo + b.triangles[to + k]];
    const s = bounds[i];
    out.push({ idx: ix, sphere: [s.centerX, s.centerY, s.centerZ, s.radius], lod: null, err: 0, refined: -1, owner: -1 });
  }
  return out;
}

// which clusters touch: adj[i] = Map(neighbour -> points they share), counted by place (so a seam in the
// normals or UVs doesn't hide that two clusters meet)
function touching(clusters, remap, nv, mark) {
  const n = clusters.length, own = [];
  const count = new Uint32Array(nv + 1);
  for (let c = 0; c < n; c++) {
    const ix = clusters[c].idx, mine = [];
    for (let k = 0; k < ix.length; k++) { const r = remap[ix[k]]; if (mark[r] !== c + 1) { mark[r] = c + 1; mine.push(r); count[r + 1]++; } }
    own.push(mine);
  }
  for (const mine of own) for (const r of mine) mark[r] = 0;
  for (let i = 0; i < nv; i++) count[i + 1] += count[i];
  const at = count.slice(0, nv), list = new Uint32Array(count[nv]);
  for (let c = 0; c < n; c++) for (const r of own[c]) list[at[r]++] = c;
  const adj = Array.from({ length: n }, () => new Map());
  for (let r = 0; r < nv; r++) {
    const a = count[r], b = count[r + 1];
    if (b - a < 2 || b - a > 16) continue;   // (a point shared by very many clusters, a fan's hub, says little about who is next to whom)
    for (let i = a; i < b; i++) for (let j = i + 1; j < b; j++) { const x = list[i], y = list[j]; adj[x].set(y, (adj[x].get(y) || 0) + 1); adj[y].set(x, (adj[y].get(x) || 0) + 1); }
  }
  return adj;
}

// groups of about `size` clusters that touch each other a lot (so little of a group's edge is shared with
// other groups: that edge can't be simplified). Grown from a seed by always taking the neighbour that
// shares the most points with the group so far; small leftovers join the neighbour they touch most, and
// pieces that touch nothing (loose parts) are grouped by where they are.
function partition(clusters, adj, size) {
  const n = clusters.length, gid = new Int32Array(n).fill(-1), groups = [];
  for (let s = 0; s < n; s++) {
    if (gid[s] >= 0) continue;
    const g = groups.length, members = [s], w = new Map(); gid[s] = g;
    const add = c => { for (const [o, k] of adj[c]) if (gid[o] < 0) w.set(o, (w.get(o) || 0) + k); };
    add(s);
    while (members.length < size) {
      let best = -1, bk = 0;
      for (const [o, k] of w) if (k > bk) { best = o; bk = k; }
      if (best < 0) break;
      w.delete(best); gid[best] = g; members.push(best); add(best);
    }
    groups.push(members);
  }
  // leftovers: a group under half size joins the group it touches most (while the two stay under 1.5 sizes)
  const small = size >> 1;
  for (let g = 0; g < groups.length; g++) {
    const m = groups[g]; if (!m || m.length >= small) continue;
    const w = new Map();
    for (const c of m) for (const [o, k] of adj[c]) if (gid[o] !== g) w.set(gid[o], (w.get(gid[o]) || 0) + k);
    let best = -1, bk = 0;
    for (const [o, k] of w) if (k > bk && groups[o] && groups[o].length + m.length <= size * 1.5) { best = o; bk = k; }
    if (best < 0) continue;
    for (const c of m) { gid[c] = best; groups[best].push(c); }
    groups[g] = null;
  }
  // loose pieces (still small, touching nothing left to join): by place, a Z-order walk through their centres
  const loose = [];
  for (let g = 0; g < groups.length; g++) { const m = groups[g]; if (m && m.length < small) { let lone = true; for (const c of m) for (const o of adj[c].keys()) if (gid[o] !== g) lone = false; if (lone) { loose.push(...m); groups[g] = null; } } }
  if (loose.length) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const c of loose) { const s = clusters[c].sphere; x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]); z0 = Math.min(z0, s[2]); z1 = Math.max(z1, s[2]); }
    const k = 1023 / Math.max(1e-9, x1 - x0, y1 - y0, z1 - z0), spread = v => { v &= 1023; v = (v | v << 16) & 0x30000ff; v = (v | v << 8) & 0x300f00f; v = (v | v << 4) & 0x30c30c3; return (v | v << 2) & 0x9249249; };
    const key = c => { const s = clusters[c].sphere; return spread((s[0] - x0) * k) | spread((s[1] - y0) * k) << 1 | spread((s[2] - z0) * k) << 2; };
    loose.sort((a, b) => key(a) - key(b));
    for (let i = 0; i < loose.length; i += size) groups.push(loose.slice(i, i + size));
  }
  return groups.filter(Boolean);
}

/**
 * The cluster tables for a mesh.
 * positions: Float32Array (x, y, z per point); index: Uint32Array or Uint16Array (three per triangle);
 * attrs: the other numbers of each point the simplifier should keep true (normals, UVs, colours), `stride`
 * floats a point, each weighed by `weights` (0.5 suits normals); o: { maxTris: triangles in a cluster (512),
 * group: clusters simplified together (8), sloppy: let a patch that won't simplify any other way be
 * simplified roughly (true); layer and inLayer(triangles, points): for a mesh that is a thin layer of
 * detail on a simpler surface (relief-build.js), how thick the layer is, and whether a simplified patch
 * (its triangles, as numbers into `points`, the mesh's point numbers) still lies in it: simplifying inside
 * the layer is then never counted as more than its thickness, however many levels do it }.
 * Returns { index, start, count, refined, sphere, gFirst, gCount, gSphere, gError, roots, levels, tris, version }:
 *   index: every cluster's triangles, one after another (Uint16Array when the points allow)
 *   cluster c: index[start[c] .. start[c] + count[c]), its own bounding sphere (sphere[c * 4 ..]), and
 *     refined[c]: the group whose members are the finer version of it (-1: it is the mesh's own triangles)
 *   group g: its members are clusters gFirst[g] .. gFirst[g] + gCount[g], a sphere round everything under
 *     it (gSphere) and the error, in the mesh's units, of drawing its coarser version instead (gError)
 *   roots: the first `roots` clusters are the coarsest ones (where picking starts)
 */
export function buildClusters({ positions, index, attrs = null, stride = 0, weights = null }, { maxTris = 512, group = 8, sloppy = true, layer = 0, inLayer = null } = {}) {
  const nv = positions.length / 3, remap = MeshoptSimplifier.generatePositionRemap(positions, 3);
  const A = attrs && stride > 0 ? attrs : new Float32Array(0), S = attrs && stride > 0 ? stride : 0, W = S ? Array.from(weights || new Array(S).fill(.5)) : [];
  const mark = new Uint32Array(nv), vGroup = new Int32Array(nv), locked = new Uint8Array(nv), loc = new Int32Array(nv).fill(-1);
  const all = [], groups = [];   // every cluster made; groups: { members: [cluster], sphere, err }
  let pending = clusterize(index instanceof Uint32Array ? index : Uint32Array.from(index), positions, maxTris);
  for (const c of pending) { c.lod = c.sphere; all.push(c); }
  const tris = [index.length / 3];
  let levels = 1;
  while (pending.length > 1) {
    const adj = touching(pending, remap, nv, mark), parts = partition(pending, adj, group);
    // the points on the edge between two groups stay put (and stay in): the simplifier may not touch them
    vGroup.fill(-1); locked.fill(0);
    for (let g = 0; g < parts.length; g++) for (const ci of parts[g]) { const ix = pending[ci].idx; for (let k = 0; k < ix.length; k++) { const r = remap[ix[k]]; if (vGroup[r] === -1) vGroup[r] = g; else if (vGroup[r] !== g) locked[r] = 1; } }
    const next = [], retry = [];
    let levelTris = 0;
    for (const part of parts) {
      const members = part.map(i => pending[i]);
      let total = 0; for (const c of members) total += c.idx.length;
      // the group's triangles, with its points numbered from 0
      const local = new Uint32Array(total), ids = []; let n = 0, at = 0;
      for (const c of members) for (let k = 0; k < c.idx.length; k++) { const v = c.idx[k]; let l = loc[v]; if (l < 0) { l = loc[v] = n++; ids.push(v); } local[at++] = l; }
      const lp = new Float32Array(n * 3), la = new Float32Array(n * S), ll = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const v = ids[i]; loc[v] = -1;
        lp[i * 3] = positions[v * 3]; lp[i * 3 + 1] = positions[v * 3 + 1]; lp[i * 3 + 2] = positions[v * 3 + 2];
        for (let k = 0; k < S; k++) la[i * S + k] = A[v * S + k];
        ll[i] = locked[remap[v]];
      }
      const target = Math.floor(total / 6) * 3, enough = total * .85;
      let [out, err] = MeshoptSimplifier.simplifyWithAttributes(local, lp, 3, la, S, W, ll, target, HUGE, ['ErrorAbsolute']);
      // a patch that won't halve (creases, seams): let the simplifier cross them; then, roughly, by merging nearby points
      if (out.length > enough) { const [o2, e2] = MeshoptSimplifier.simplifyWithAttributes(local, lp, 3, la, S, W, ll, target, HUGE, ['ErrorAbsolute', 'Permissive']); if (o2.length < out.length) { out = o2; err = e2; } }
      if (out.length > enough && sloppy) { const [o2, e2] = MeshoptSimplifier.simplifySloppy(local, lp, 3, ll, target, HUGE); if (o2.length <= enough) { out = o2; err = e2 * MeshoptSimplifier.getScale(lp, 3) * 2; } }
      if (out.length > enough) { for (const c of members) retry.push(c); continue; }   // stuck: these try again next level, grouped with others
      // the group: a sphere round everything under it, and an error no smaller than anything under it
      const cs = new Float32Array(members.length * 3), rs = new Float32Array(members.length); let worst = 0;
      let flat = 0, rest = 0;
      members.forEach((c, i) => { cs[i * 3] = c.lod[0]; cs[i * 3 + 1] = c.lod[1]; cs[i * 3 + 2] = c.lod[2]; rs[i] = c.lod[3]; worst = Math.max(worst, c.err); flat = Math.max(flat, c.flat || 0); rest = Math.max(rest, c.rest || 0); });
      const sb = MeshoptClusterizer.computeSphereBounds(cs, 3, rs, 1), sphere = [sb.centerX, sb.centerY, sb.centerZ, sb.radius];
      // Its own error on top of the worst under it, as the simplifier's own measure adds up (squares summed).
      // Kept in two parts: what was lost inside a layer of detail (flat: never more than the layer is thick)
      // and the rest.
      if (layer > 0 && inLayer && out.length && inLayer(out, ids)) flat = Math.min(layer, Math.hypot(flat, err)); else rest = Math.hypot(rest, err);
      const e = Math.max(worst, Math.hypot(flat, rest));
      const g = groups.length; groups.push({ members, sphere, err: e });
      for (const c of members) c.owner = g;
      // its coarser version, cut into clusters (none left: a small loose part that simplified away to nothing)
      const made = out.length ? clusterize(out, lp, maxTris, ids) : [{ idx: new Uint32Array(0), sphere, lod: null, err: 0, refined: -1, owner: -1, empty: true }];
      for (const c of made) { c.refined = g; c.lod = sphere; c.err = e; c.flat = flat; c.rest = rest; all.push(c); if (!c.empty) next.push(c); }
      levelTris += out.length / 3;
    }
    if (!next.length) break;   // nothing simplified this level: the mesh is as coarse as it gets
    for (const c of retry) levelTris += c.idx.length / 3;
    tris.push(levelTris); levels++;
    pending = next.concat(retry);
  }
  // the order clusters are kept in: the coarsest first (the ones no group took in), then level by level the
  // members of the groups under them, a group's members side by side, so neighbours in the mesh are mostly
  // neighbours in the list and a run of them is one draw
  const order = [], seenG = new Uint8Array(groups.length), gFirst = new Uint32Array(groups.length), gCount = new Uint32Array(groups.length);
  let cur = all.filter(c => c.owner < 0); const roots = cur.length;
  while (cur.length) {
    const nx = [];
    for (const c of cur) {
      c.id = order.length; order.push(c);
      const g = c.refined; if (g < 0 || seenG[g]) continue; seenG[g] = 1;
      for (const m of groups[g].members) nx.push(m);
    }
    cur = nx;
  }
  const nc = order.length, start = new Uint32Array(nc), count = new Uint32Array(nc), refined = new Int32Array(nc), sphere = new Float32Array(nc * 4);
  let totalIdx = 0; for (const c of order) totalIdx += c.idx.length;
  const out = nv > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx); let at = 0;
  for (let i = 0; i < nc; i++) { const c = order[i]; start[i] = at; count[i] = c.idx.length; refined[i] = c.refined; sphere.set(c.sphere, i * 4); out.set(c.idx, at); at += c.idx.length; }
  const gSphere = new Float32Array(groups.length * 4), gError = new Float32Array(groups.length);
  groups.forEach((g, i) => { gFirst[i] = g.members[0].id; gCount[i] = g.members.length; gSphere.set(g.sphere, i * 4); gError[i] = g.err; });
  return { version: BUILD_VERSION, index: out, start, count, refined, sphere, gFirst, gCount, gSphere, gError, roots, levels, tris };
}

/**
 * buildClusters() from a geometry's plain arrays, as detail.js sends them: positions, index (or null:
 * every three points are a triangle), parts: [{ array, size, use }] the attributes to keep true (the first
 * `use` numbers of each `size`), stride and weights for them all.
 */
export function buildFrom({ positions, index, nv, parts = [], stride = 0, weights = [] }, o) {
  let attrs = null;
  if (stride) {
    attrs = new Float32Array(nv * stride); let at = 0;
    for (const p of parts) { for (let i = 0; i < nv; i++) for (let k = 0; k < p.use; k++) attrs[i * stride + at + k] = p.array[i * p.size + k]; at += p.use; }
  }
  if (!index) { index = new Uint32Array(nv); for (let i = 0; i < nv; i++) index[i] = i; }
  return buildClusters({ positions, index, attrs, stride, weights }, o);
}

/**
 * Whole detail levels of a mesh, for things drawn as many copies (gs.props; hd3d.js autoCopies picks one
 * for each copy by how far off it is): the mesh simplified to each of `keep` (fractions of its triangles)
 * for as long as it will simplify, never below `min` triangles. Every level uses the mesh's own points,
 * and comes with its error against the mesh itself, in the mesh's units. Takes what buildClusters() takes.
 * Returns { version, levels: n, index (every level's triangles, one after another), start, count, error }.
 */
export function buildLevels({ positions, index, attrs = null, stride = 0, weights = null }, { keep = [.5, .2, .07, .02, .005], min = 8 } = {}) {
  const nv = positions.length / 3, I = index instanceof Uint32Array ? index : Uint32Array.from(index);
  // (normals, UVs and colours steer which points go but count for less than in a cluster build: a whole level
  // is swapped far off, where the shape is what shows, and heavy weights measurably cost shape)
  const A = attrs && stride > 0 ? attrs : new Float32Array(0), S = attrs && stride > 0 ? stride : 0, W = S ? Array.from(weights || new Array(S).fill(.5), w => w * .3) : [];
  const made = []; let last = I.length;
  for (const k of keep) {
    const target = Math.max(min, Math.floor(I.length * k / 3)) * 3, enough = last * .85;
    if (target > enough) break;
    // Twice: with creases and seams kept, and with leave to cross them (Permissive). The kept one is taken
    // unless it is clearly further out: a ball's seam and poles, or a flat-shaded mesh (all creases), hold
    // more triangles than a far level may have, and reaching the count round them caves the shape in. If
    // neither gets there, small loose parts may go too (a door knob, a chimney pot: Prune), and last,
    // roughly, nearby points are merged. An answer far under what was asked is not taken (Prune on a mesh
    // whose every triangle has points of its own takes the lot).
    const tried = [], run = more => {
      const [o, e] = MeshoptSimplifier.simplifyWithAttributes(I, positions, 3, A, S, W, null, target, HUGE, ['ErrorAbsolute', ...more]);
      if (o.length >= target * .5 && o.length <= enough) tried.push({ idx: o, err: e });
    }, there = () => tried.filter(t => t.idx.length <= target * 1.25);
    run([]); run(['Permissive']);
    if (!there().length) { run(['Prune']); run(['Prune', 'Permissive']); }
    if (!there().length) { const [o, e] = MeshoptSimplifier.simplifySloppy(I, positions, 3, null, target, HUGE); if (o.length >= target * .5 && o.length <= enough) tried.push({ idx: o, err: e * MeshoptSimplifier.getScale(positions, 3) * 2 }); }
    if (!tried.length) break;   // as simple as it gets
    const got = there(); let best = (got.length ? got : tried)[0];
    if (got.length) { for (const t of got) if (t.err * 1.5 < best.err) best = t; }   // (the first, plain, unless another is half as far out again)
    else for (const t of tried) if (t.idx.length < best.idx.length) best = t;        // (none got there: the simplest)
    let { idx: out, err } = best;
    if (made.length && err < made.at(-1).err) err = made.at(-1).err;   // (a coarser level is never called truer than a finer one)
    made.push({ idx: out, err }); last = out.length;
  }
  let total = 0; for (const m of made) total += m.idx.length;
  const out = nv > 65535 ? new Uint32Array(total) : new Uint16Array(total), start = new Uint32Array(made.length), count = new Uint32Array(made.length), error = new Float32Array(made.length);
  let at = 0; made.forEach((m, i) => { start[i] = at; count[i] = m.idx.length; error[i] = m.err; out.set(m.idx, at); at += m.idx.length; });
  return { version: BUILD_VERSION, levels: made.length, index: out, start, count, error };
}
/** buildLevels() from a geometry's plain arrays (see buildFrom). */
export function levelsFrom({ positions, index, nv, parts = [], stride = 0, weights = [] }, o) {
  let attrs = null;
  if (stride) {
    attrs = new Float32Array(nv * stride); let at = 0;
    for (const p of parts) { for (let i = 0; i < nv; i++) for (let k = 0; k < p.use; k++) attrs[i * stride + at + k] = p.array[i * p.size + k]; at += p.use; }
  }
  if (!index) { index = new Uint32Array(nv); for (let i = 0; i < nv; i++) index[i] = i; }
  return buildLevels({ positions, index, attrs, stride, weights }, o);
}

/** Every typed array in a build (to hand it to another thread without a copy). */
export const buffersOf = d => [d.index, d.start, d.count, d.refined, d.sphere, d.gFirst, d.gCount, d.gSphere, d.gError].map(a => a.buffer);
