// gs.models.fur(mesh, options): fur or hair on a mesh, in layers. A coat of strands is drawn as "shells": copies of
// the surface, each a little further out along its normals, each cut by one picture of strands seen from their
// tips (a strand's height is the picture's alpha), so less of every strand shows the further out a shell is and
// the eye joins the dots into strands standing in the coat.
// Everything is three.js's own: a map with an alpha cut, vertex colours, and two morph targets that every shell
// shares (out along the normal; over toward where the strands lie), so WebGL and WebGPU draw it alike, skinned
// or not, and a coat is one geometry however many layers it has. The strand pictures are made in code.
// A coat thins out by itself with distance (half its layers, then none), so a herd far away costs nothing.
// Kit use: creatures (creature.js) and people's hair (human.js); games reach it as gs.models.fur.
import { BufferAttribute, BufferGeometry, DataTexture, LinearFilter, LinearMipmapLinearFilter, Mesh, NoColorSpace, RepeatWrapping, RGBAFormat, SkinnedMesh, Sphere, UnsignedByteType, Vector3 } from 'three';
import { pbr, HD } from '../hd3d.js';

const PI = Math.PI, TAU = PI * 2, mn = Math.min, mx = Math.max;
const rng = s => { let a = (s | 0) || 1; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

// ================================================================= the pictures of strands
const PICS = new Map(), SIZE = 256;
/** How many strands across one picture: what `tile` is divided by to space them. */
export const ACROSS = { fur: 32, hair: 36 };
/**
 * The picture a coat is cut by, made once: alpha is how high the strand at each point stands (0 none .. 1 the
 * longest), the colour is that strand's own shade (a multiplier). 'fur': strands on end, a thick short undercoat
 * with longer guard hairs through it; 'hair': long strands lying side by side, running along v.
 */
export function strands(kind = 'fur', seed = 1) {
  const key = kind + ':' + seed, had = PICS.get(key); if (had) return had;
  const S = SIZE, Hh = new Float32Array(S * S), Tt = new Float32Array(S * S).fill(.72), r = rng(seed * 7919 + (kind === 'hair' ? 31 : 17));
  const put = (x, y, a, tint) => { const j = ((y % S + S) % S) * S + (x % S + S) % S; if (a > Hh[j]) { Hh[j] = a; Tt[j] = tint; } };
  if (kind === 'hair') {
    // each strand: a wavering line down the picture, tallest along its middle, a little higher and lower along its length
    const lay = (G, w0, w1, h0, h1, t0, t1) => {
      const c = S / G;
      for (let j = 0; j < G; j++) {
        const w = c * (w0 + (w1 - w0) * r()), hh = h0 + (h1 - h0) * r(), tint = t0 + (t1 - t0) * r(), k1 = 1 + Math.floor(r() * 2), p1 = r() * TAU, k2 = 1 + Math.floor(r() * 3), p2 = r() * TAU, off = (r() - .5) * .5 * c;
        for (let y = 0; y < S; y++) {
          const cx = (j + .5) * c + off + c * .3 * Math.sin(y / S * TAU * k1 + p1), h = hh * (.74 + .26 * Math.sin(y / S * TAU * k2 + p2));
          for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++) { const dx = x + .5 - cx, k = 1 - dx * dx / (w * w); if (k > 0) put(x, y, h * k, tint); }
        }
      }
    };
    lay(ACROSS.hair * 2, .75, 1, .22, .55, .58, .78); lay(ACROSS.hair, .5, .8, .55, 1, .78, 1);
  } else {
    // each strand seen from its tip: round, tallest in the middle, so it is thinner the higher up it is cut
    const coat = (G, r0, r1, h0, h1, t0, t1) => {
      const c = S / G;
      for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
        const cx = (gx + .15 + .7 * r()) * c, cy = (gy + .15 + .7 * r()) * c, rad = c * (r0 + (r1 - r0) * r()), h = h0 + (h1 - h0) * r(), tint = t0 + (t1 - t0) * r();
        for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) { const dx = x + .5 - cx, dy = y + .5 - cy, k = 1 - (dx * dx + dy * dy) / (rad * rad); if (k > 0) put(x, y, h * k, tint); }
      }
    };
    coat(ACROSS.fur * 2, .78, .98, .24, .52, .6, .78); coat(ACROSS.fur, .44, .62, .6, 1, .8, 1);
  }
  const D = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { const t = Math.round(mn(1, Tt[i]) * 255); D[i * 4] = D[i * 4 + 1] = D[i * 4 + 2] = t; D[i * 4 + 3] = Math.round(mn(1, Hh[i]) * 255); }
  const tex = new DataTexture(D, S, S, RGBAFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = RepeatWrapping; tex.magFilter = LinearFilter; tex.minFilter = LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.colorSpace = NoColorSpace; tex.anisotropy = 4;
  tex.name = 'gs-strands:' + key; tex.needsUpdate = true;
  PICS.set(key, tex); return tex;
}

// ================================================================= the shell: one geometry every layer shares
const DOWN_AND_BACK = [0, -.55, -.83];
/**
 * The geometry a coat's layers share, from a mesh's geometry: the triangles where strands grow (with their own
 * picture coordinates), and two morph targets, [0] out along the normal by each point's strand length, [1] over
 * the way the strands lie. Options as fur()'s: length, where, index, tile, uv, flow, ease.
 */
function shell(geo, o = {}) {
  const P = geo.attributes.position, N = geo.attributes.normal;
  if (!P || !N) throw new Error('gs.models.fur: the mesh needs positions and normals');
  const n = P.count, I = o.index || geo.index?.array || null, nt = Math.floor((I ? I.length : n) / 3), at = k => I ? I[k] : k;
  const base = o.length ?? .03, w = o.where, len = new Float32Array(n);
  for (let i = 0; i < n; i++) len[i] = base * mx(0, w ? typeof w === 'function' ? +w(i, P.getX(i), P.getY(i), P.getZ(i)) || 0 : w[i] : 1);
  // no strand longer than `thin` of how thick what it grows on is there (an ear, a thin tail, a leg stay the shape they are):
  // each point looks straight in through the mesh for the nearest point of the far side
  const thin = o.thin ?? .45;
  if (thin > 0 && nt) {
    let edge = 0; const some = mn(nt, 240); for (let t = 0; t < some; t++) { const a = at(t * 3), b = at(t * 3 + 1); edge += Math.hypot(P.getX(a) - P.getX(b), P.getY(a) - P.getY(b), P.getZ(a) - P.getZ(b)); }
    const cell = mx(edge / some * 1.6, base * .4, 1e-6), grid = new Map(), keyOf = (x, y, z) => (Math.floor(x / cell) * 73856093 ^ Math.floor(y / cell) * 19349663 ^ Math.floor(z / cell) * 83492791) | 0, seen = new Uint8Array(n);
    for (let k = 0; k < nt * 3; k++) { const v = at(k); if (seen[v]) continue; seen[v] = 1; const key = keyOf(P.getX(v), P.getY(v), P.getZ(v)); let l = grid.get(key); if (!l) grid.set(key, l = []); l.push(v); }
    for (let i = 0; i < n; i++) {
      if (!(len[i] > 0)) continue;
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i), far = len[i] / thin; let thick = far;
      for (let s = cell * .5; s < far + cell && s - cell < thick; s += cell * .5) {
        const l = grid.get(keyOf(x - nx * s, y - ny * s, z - nz * s)); if (!l) continue;
        for (const q of l) {
          if (N.getX(q) * nx + N.getY(q) * ny + N.getZ(q) * nz > -.2) continue;
          const dx = x - P.getX(q), dy = y - P.getY(q), dz = z - P.getZ(q), d = dx * nx + dy * ny + dz * nz; if (d <= 0 || d >= thick) continue;
          if (dx * dx + dy * dy + dz * dz - d * d < cell * cell) thick = d;
        }
      }
      if (thick < far) len[i] = thick * thin;
    }
  }
  // strands shorten toward where none grow (a nose, a claw, the rim of an eye) and between long and short, so a coat has no cliff in it
  const step = base * (o.ease ?? .5);
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (let t = 0; t < nt; t++) { const a = at(t * 3), b = at(t * 3 + 1), c = at(t * 3 + 2), m = mn(len[a], len[b], len[c]) + step; if (len[a] > m) { len[a] = m; moved = true; } if (len[b] > m) { len[b] = m; moved = true; } if (len[c] > m) { len[c] = m; moved = true; } }
    if (!moved) break;
  }
  // where each point is in the picture. 'box': the picture laid on from whichever side a triangle faces most (strands
  // on end don't care which way up it is); a crown: strands streaming out from one point of a head, round and down
  const cr = o.uv && o.uv !== 'box' ? o.uv : null, tile = 1 / (o.tile || .1);
  let C, Ax, E1, E2, R, around;
  if (cr) {
    C = cr.centre || [0, 0, 0]; const k = cr.crown || [C[0], C[1] + 1, C[2]], d = [k[0] - C[0], k[1] - C[1], k[2] - C[2]]; R = Math.hypot(d[0], d[1], d[2]) || 1; Ax = d.map(v => v / R);
    const s = Math.abs(Ax[1]) < .9 ? [0, 1, 0] : [1, 0, 0]; E1 = [Ax[1] * s[2] - Ax[2] * s[1], Ax[2] * s[0] - Ax[0] * s[2], Ax[0] * s[1] - Ax[1] * s[0]]; const l = Math.hypot(E1[0], E1[1], E1[2]); E1 = E1.map(v => v / l);
    E2 = [Ax[1] * E1[2] - Ax[2] * E1[1], Ax[2] * E1[0] - Ax[0] * E1[2], Ax[0] * E1[1] - Ax[1] * E1[0]];
    around = cr.around ?? mx(1, Math.round(TAU * R * tile * .8));   // (whole pictures round the head, so the join doesn't show)
  }
  const polar = v => { const x = P.getX(v) - C[0], y = P.getY(v) - C[1], z = P.getZ(v) - C[2], r = Math.hypot(x, y, z) || 1e-9, ca = mx(-1, mn(1, (x * Ax[0] + y * Ax[1] + z * Ax[2]) / r)); return [Math.atan2(x * E2[0] + y * E2[1] + z * E2[2], x * E1[0] + y * E1[1] + z * E1[2]), Math.acos(ca)]; };
  const slot = new Int32Array(n * 4).fill(-1), src = [], uv = [], idx = [];
  const corner = (v, k, u, w2) => { let j = k < 0 ? -1 : slot[v * 4 + k]; if (j < 0) { j = src.length; if (k >= 0) slot[v * 4 + k] = j; src.push(v); uv.push(u, w2); } idx.push(j); };
  for (let t = 0; t < nt; t++) {
    const a = at(t * 3), b = at(t * 3 + 1), c = at(t * 3 + 2); if (len[a] + len[b] + len[c] <= 0) continue;
    if (cr) {
      // (a point at the crown itself has no way round of its own: in each triangle it takes its neighbours')
      const q = [polar(a), polar(b), polar(c)], pole = q.map(p => p[1] < 1e-4 || p[1] > PI - 1e-4), real = q.filter((p, i) => !pole[i]).map(p => p[0]), split = real.length > 1 && mx(...real) - mn(...real) > PI;
      const ph = q.map((p, i) => pole[i] ? null : split && p[0] < 0 ? p[0] + TAU : p[0]), mean = real.length ? ph.reduce((s2, p) => s2 + (p ?? 0), 0) / real.length : 0;
      [a, b, c].forEach((v, i) => corner(v, pole[i] ? -1 : split && q[i][0] < 0 ? 1 : 0, (ph[i] ?? mean) / TAU * around, q[i][1] * R * tile));
    } else {
      const ax = P.getX(a), ay = P.getY(a), az = P.getZ(a), ux = P.getX(b) - ax, uy = P.getY(b) - ay, uz = P.getZ(b) - az, vx = P.getX(c) - ax, vy = P.getY(c) - ay, vz = P.getZ(c) - az;
      const fx = Math.abs(uy * vz - uz * vy), fy = Math.abs(uz * vx - ux * vz), fz = Math.abs(ux * vy - uy * vx), k = fx >= fy && fx >= fz ? 0 : fy >= fz ? 1 : 2;
      for (const v of [a, b, c]) { const x = P.getX(v), y = P.getY(v), z = P.getZ(v); corner(v, k, (k === 0 ? z : x) * tile + k * .37, (k === 1 ? z : y) * tile + k * .61); }
    }
  }
  const m = src.length, g = new BufferGeometry();
  for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) {
    const a = geo.attributes[name]; if (!a) continue;
    const s = a.itemSize, A = new a.array.constructor(m * s); for (let i = 0; i < m; i++) for (let q = 0; q < s; q++) A[i * s + q] = a.array[src[i] * s + q];
    g.setAttribute(name, new BufferAttribute(A, s, a.normalized));
  }
  // each point's colour, and in its alpha how thick the coat is there: the picture's strands are that much lower, so
  // toward where none grow a coat thins out strand by strand instead of ending at a triangle's edge
  const ca = geo.attributes.color, co = o.colors, full = base * .12, Cc = new Float32Array(m * 4);
  for (let i = 0; i < m; i++) {
    const v = src[i], k = mn(1, len[v] / full);
    Cc[i * 4] = co ? co[v * 3] : ca ? ca.getX(v) : 1; Cc[i * 4 + 1] = co ? co[v * 3 + 1] : ca ? ca.getY(v) : 1; Cc[i * 4 + 2] = co ? co[v * 3 + 2] : ca ? ca.getZ(v) : 1; Cc[i * 4 + 3] = k * k * (3 - 2 * k);
  }
  g.setAttribute('color', new BufferAttribute(Cc, 4));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(new BufferAttribute(m > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
  // the two ways a layer moves: out, and over the way the strands lie (what of that runs along the surface)
  const out = new Float32Array(m * 3), over = new Float32Array(m * 3), fl = o.flow, F = Array.isArray(fl) ? fl : DOWN_AND_BACK, droop = cr ? cr.droop ?? .35 : 0; let longest = 0;
  for (let i = 0; i < m; i++) {
    const v = src[i], l = len[v], nx = N.getX(v), ny = N.getY(v), nz = N.getZ(v), x = P.getX(v), y = P.getY(v), z = P.getZ(v); if (l > longest) longest = l;
    let f = F;
    if (typeof fl === 'function') f = fl(x, y, z, nx, ny, nz) || F;
    else if (cr && !Array.isArray(fl)) {   // (away from the crown, and down a little)
      const dx = x - C[0], dy = y - C[1], dz = z - C[2], r = Math.hypot(dx, dy, dz) || 1e-9, ca = (dx * Ax[0] + dy * Ax[1] + dz * Ax[2]) / r; let ex = dx / r * ca - Ax[0], ey = dy / r * ca - Ax[1], ez = dz / r * ca - Ax[2]; const e = Math.hypot(ex, ey, ez) || 1;
      f = [ex / e, ey / e - droop, ez / e];
    }
    const d = f[0] * nx + f[1] * ny + f[2] * nz;
    out[i * 3] = nx * l; out[i * 3 + 1] = ny * l; out[i * 3 + 2] = nz * l;
    over[i * 3] = (f[0] - d * nx) * l; over[i * 3 + 1] = (f[1] - d * ny) * l; over[i * 3 + 2] = (f[2] - d * nz) * l;
  }
  g.morphAttributes.position = [new BufferAttribute(out, 3), new BufferAttribute(over, 3)]; g.morphTargetsRelative = true;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  g.boundingSphere = new Sphere(geo.boundingSphere.center.clone(), geo.boundingSphere.radius + longest * 1.6);
  g.userData.fur = { longest, tris: idx.length / 3, points: m };
  return g;
}

// ================================================================= the layers' materials (shared by every coat of one kind)
const MATS = new Map();
function layer(o, i, L) {
  const key = [o.kind, o.seed, L, i, o.rough, o.root, o.tip, o.colour].join('|'); let m = MATS.get(key);
  if (!m) {
    const t = i / L;
    m = pbr(o.colour, { rough: o.rough, vertexColors: true, map: strands(o.kind, o.seed), alphaTest: (i - .5) / L });
    m.color.multiplyScalar(o.root + (o.tip - o.root) * Math.pow(t, .8));   // (dark at the roots, where little light gets in)
    m.name = `fur:${o.kind}:${i}/${L}`; MATS.set(key, m);
  }
  return m;
}

const LAYERS = [0, 5, 7, 10], NEAR = 260, FAR = 120, wp = new Vector3();
/** How many layers a coat gets on this phone unless it is told: none on the slowest, 5, 7 and 10 as phones get faster. */
const layersHere = () => LAYERS[HD.tier] ?? 7;
/**
 * Fur or hair on a mesh, in layers (see the top of this file). mesh: a Mesh or a SkinnedMesh; its vertex colours
 * colour the coat. Options:
 * length (how long the strands are, in the mesh's own units: .03), where (how much of that at each point: a
 * Float32Array of 0..1 a point, or (i, x, y, z) => 0..1; 0 where none grow), index (the triangles to cover, as
 * indices: the mesh's own otherwise), kind ('fur' strands on end | 'hair' long strands lying together), tile (how
 * wide the strand picture is on the surface, mesh units: .1; fur has 32 strands across it), uv ('box', or for hair
 * { centre, crown, around, droop }: strands streaming from the crown of a head whose middle is centre), lean (0..1.5:
 * how far the strands lie over: .5), flow ([x, y, z] or (x, y, z, nx, ny, nz) => [x, y, z]: the way they lie: down
 * and back along -z otherwise), thin (no strand longer than this much of how thick the mesh is where it grows: .45;
 * 0: any length), layers (how many: by the phone's quality unless given: 0 on the slowest, where a coat is then
 * only the mesh itself, 5, 7 and 10 on faster ones), rough, root and tip
 * (how dark the roots and how light the tips: .65, 1.5), colour (a tint over the vertex colours), seed (which
 * picture of strands), auto (false: don't thin out with distance), size (how big
 * the furry thing is, mesh units, for that: twice its bounding sphere's radius otherwise), colors (the strands'
 * colours where they differ from the mesh's: a Float32Array, three a point), shell (another coat's `shell`, to
 * share its geometry: twins).
 * Returns the coat: shells (its meshes, outermost first, children of the mesh), layers, shell, tris (drawn at
 * full), length and lean (set them any time: a cat's fur standing up, a coat flattened by wind or water), level
 * (0, .5 or 1: how much of it is showing), see(camera, screenHeight) (sets level for a camera, as auto does),
 * dispose().
 */
export function fur(mesh, o = {}) {
  if (!mesh?.isMesh) throw new Error('gs.models.fur: give it a mesh');
  const L = mx(0, Math.round(o.layers ?? layersHere()));
  if (!L) return { shells: [], layers: 0, shell: null, tris: 0, length: 1, lean: o.lean ?? .5, level: 0, see: () => 0, dispose() {} };   // (a phone that draws no fur: the mesh as it was)
  const g = o.shell || shell(mesh.geometry, o), skinned = !!mesh.isSkinnedMesh && !!mesh.skeleton;
  const look = { kind: o.kind === 'hair' ? 'hair' : 'fur', seed: o.seed ?? 1, rough: o.rough ?? .86, root: o.root ?? .65, tip: o.tip ?? 1.5, colour: o.colour ?? o.color ?? '#ffffff' };
  const shells = [], info = g.userData.fur;
  for (let i = L; i >= 1; i--) {   // the outermost first: what it covers of the ones below is then not drawn at all
    const mat = layer(look, i, L), m = skinned ? new SkinnedMesh(g, mat) : new Mesh(g, mat);
    m.name = 'fur' + i; m.castShadow = false; m.receiveShadow = mesh.receiveShadow; m.renderOrder = (mesh.renderOrder || 0) + 1 + (L - i) * .001;
    m.userData.noLod = m.userData.noBatch = m.userData.noOcclude = true; m.userData.fur = i / L; m.raycast = () => {};
    if (skinned) { m.bind(mesh.skeleton, mesh.bindMatrix); m.boundingSphere = (mesh.boundingSphere || g.boundingSphere).clone(); m.boundingSphere.radius += info.longest * 1.6; }
    mesh.add(m); shells.push(m);
  }
  let lean = o.lean ?? .5, length = 1, level = 1, top = 0, since = 0;
  // how big it is on screen, in pixels, for a camera
  const big = o.size ?? (mesh.boundingSphere || g.boundingSphere).radius * 2;
  const pixels = (cam, h) => { const e = mesh.matrixWorld.elements; return big * Math.hypot(e[0], e[1], e[2]) / (2 * mx(.05, wp.setFromMatrixPosition(cam.matrixWorld).distanceTo(_at.setFromMatrixPosition(mesh.matrixWorld))) * Math.tan((cam.fov || 50) * PI / 360)) * h; };
  const pick = px => { coat.level = px > (level >= 1 ? NEAR * .9 : NEAR) ? 1 : px > (level > 0 ? FAR * .9 : FAR) ? .5 : 0; };
  // a strand is an arc: straight out of the skin, bending over the way it lies by `lean` at its tip
  const set = () => { const b = lean * 1.3; for (const m of shells) { const t = m.userData.fur; m.morphTargetInfluences[0] = length * (b > 1e-3 ? Math.sin(b * t) / b : t); m.morphTargetInfluences[1] = length * (b > 1e-3 ? (1 - Math.cos(b * t)) / b : 0); } };
  const show = () => { shells.forEach((m, k) => { m.visible = level >= 1 || (level > 0 && (L - k) % 2 === 0); }); };
  set();
  const coat = {
    shells, layers: L, shell: g, tris: info.tris * L,
    get lean() { return lean; }, set lean(v) { lean = mx(0, +v || 0); set(); },
    get length() { return length; }, set length(v) { length = mx(0, +v || 0); set(); },
    get level() { return level; }, set level(v) { const l = v >= 1 ? 1 : v > 0 ? .5 : 0; if (l !== level) { level = l; show(); } },
    /** Shows all, half or none of the layers by how big the mesh is on screen for this camera. */
    see(cam, screenH = 800) { if (cam?.isPerspectiveCamera) pick(pixels(cam, screenH)); return level; },
    dispose() { for (const m of shells) m.removeFromParent(); shells.length = 0; if (mesh.onBeforeRender === watch) mesh.onBeforeRender = before; if (!o.shell) g.dispose(); },
  };
  // by itself: the biggest any camera saw the mesh in the last tenth of a second decides (a shadow or mirror camera
  // far off can't strip a coat the player is looking at)
  const before = mesh.onBeforeRender, clock = typeof performance !== 'undefined' ? performance : Date;
  function watch(r, scene, cam, ...rest) {
    before.call(this, r, scene, cam, ...rest);
    if (!cam?.isPerspectiveCamera || scene?.overrideMaterial) return;
    const px = pixels(cam, r.getRenderTarget?.()?.height || r.domElement?.height || 800); if (px > top) top = px;
    const now = clock.now(); if (now - since > 100) { pick(top); top = 0; since = now; }
  }
  if (o.auto !== false) mesh.onBeforeRender = watch;
  return coat;
}
const _at = new Vector3();
fur.layers = layersHere;
/** The shell geometry by itself (to make once and hand to several coats as `shell`). */
fur.shell = shell;
/** The picture of strands for a kind and seed (a DataTexture: alpha is each strand's height). */
fur.strands = strands;
