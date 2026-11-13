// 3D outdoor worlds: land made from noise or a heightmap (THREE.Terrain, the three.terrain.js
// library: hills, mountains, islands, dunes...), grass that sways in the wind and fades out far
// away, simple low-poly trees and rocks to scatter with gs.props, and water with waves you can float
// on (the same wave sums move the mesh and answer water.height(x, z), so boats sit right).
//
//   const { Land, Water, tree, rock } = gs.outdoors;
//   reset() {
//     land = new Land({ size: 200, low: -4, high: 18, kind: 'hills', seed: 5, colours: [[-4, '#c9b27a'], [1, '#5d9b3a'], [12, '#7a7a6a']] });
//     view.scene.add(land.object); land.solid(world);                      // walk and drive on it
//     land.grass({ count: 3000, colour: '#6fae3f' });                       // wind and distance fade are in update()
//     props.kind('pine', tree({ kind: 'pine' }), toon('#fff', { vertexColors: true }));
//     land.scatter(props, 'pine', 300, { above: 2, steep: .5, gap: 4, seed: 1 });
//     sea = new Water({ size: 300, level: 0, waves: 1 }); view.scene.add(sea.mesh);
//   }
//   update(dt) { land.update(dt, camera); sea.update(dt, camera.position); hero.y = land.height(hero.x, hero.z); }
//
// One wind for the whole world (new Wind({ x, z, gust })): land.wind = wind sways the grass,
// looks.leaves(m, { wind }) the trees, Weather({ wind }) the rain, Particles' wind the smoke and dust,
// v.air({ wind }) the cloud shadows, and wind.at(x, z) is the push on a bullet or a flag. Gusts roll
// across the land downwind, so a gust shows in the grass before it reaches you.
// impostor(geometry, material): far trees as a few crossed cards with pictures of the real tree.
//
// Sizes are metres; y is up. Keep segments modest on phones (64-128 a side).

import { timed } from './prof.js';
import { BufferAttribute, BufferGeometry, Color, DataTexture, Group, InstancedBufferAttribute, InstancedMesh, LinearFilter, RGBAFormat, ConeGeometry, CylinderGeometry, DodecahedronGeometry, DoubleSide, Float32BufferAttribute, IcosahedronGeometry, LinearMipmapLinearFilter, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, OrthographicCamera, SRGBColorSpace, Scene, SphereGeometry, Vector2, Vector3, Vector4, WebGLRenderTarget } from 'three';
import { fbm } from './math.js';
import { bakeRenderer as renderer } from './hd3d.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export { looks, groundDetail, horizon } from './looks.js';
export { Water } from './water.js';
export { Sea } from './sea.js';
export { Marks } from './marks.js';
export { Cloth } from './cloth.js';
import { looks as LOOKS } from './looks.js';
import { rockArrays, RockMap } from './land-rock.js';
import { pause, built, need, loading } from './slices.js';
import { run, canRun } from './jobs.js';
import Terrain, { TerrainNS, createSeededRandom, scatterGrass, updateGrass, updateGrassLOD } from 'three.terrain.js';

// rock made for a land (land.rocks()): the same land and the same asking again get the same arrays
const ROCKS = new Map();
const keepRock = (key, a) => { if (ROCKS.size >= 3 && !loading()) ROCKS.delete(ROCKS.keys().next().value); ROCKS.set(key, a); return a; };

const KINDS = {
  hills: TerrainNS.PerlinLayers, mountains: TerrainNS.DiamondSquare, rolling: TerrainNS.SimplexLayers, islands: TerrainNS.HillIsland,
  bumps: TerrainNS.Hill, dunes: TerrainNS.CosineLayers, cracked: TerrainNS.Worley, ridges: TerrainNS.Fault, smooth: TerrainNS.Perlin,
};

/**
 * A piece of land. kind: 'hills' | 'mountains' | 'rolling' | 'islands' | 'bumps' | 'dunes' |
 * 'cracked' | 'ridges' | 'smooth', or a function (x, z) => height for your own shape (gs.math.fbm
 * is handy). size: metres a side; segments: grid lines a side; low / high: the height range; seed;
 * smooth: passes of smoothing; steps: terraces (0 for none); colours: [[height, colour], ...] paints
 * by height (your look); material: your own instead.
 */
export class Land {
  constructor({ kind = 'hills', size = 200, segments = 96, low = -5, high = 20, seed = 1, smooth = 1, steps = 0, colours = null, material = null, edge = 0 } = {}) {
    Object.assign(this, { size, segments, low, high });
    const random = createSeededRandom(seed);
    const own = typeof kind === 'function' ? (g) => {
      // our own height function, in world metres (after the library's clamping, so it's exact)
      for (let r = 0; r <= segments; r++) for (let c = 0; c <= segments; c++) g[r * (segments + 1) + c] = kind(-size / 2 + c * size / segments, -size / 2 + r * size / segments);
    } : null;
    const heightmap = own ? () => {} : KINDS[kind] || KINDS.hills;
    this.object = Terrain({
      heightmap, random, frequency: 2.5, maxHeight: high, minHeight: low, xSize: size, ySize: size, xSegments: segments, ySegments: segments,
      steps: steps > 1 ? steps : 1, stretch: typeof kind !== 'function',
      after: (verts, o) => { if (own) own(verts); for (let i = 0; !own && i < smooth; i++) TerrainNS.Smooth(verts, o); if (edge > 0) TerrainNS.RadialEdges(verts, o, false, size * edge, TerrainNS.EaseInOut); },
      material: material || new MeshStandardMaterial({ color: '#ffffff', roughness: .95, flatShading: false, vertexColors: !!colours }),
    });
    this.mesh = this.object.children[0]; this.mesh.receiveShadow = true; this.mesh.castShadow = false;
    this.object.updateMatrixWorld(true);
    this.z = this.mesh.geometry.attributes.position.array;   // local z is world height
    if (colours) this.paint(colours);
    this.grassScene = null; this.grassMesh = null; this.time = 0; this.meadows = []; this.parting = null; this.rock = null;
  }
  /** The ground height at world x, z (between grid points it's blended); with land.rocks(), the top of the rock where rock stands over the ground. */
  height(x, z) { return this.rock ? this.rock.map.top(x, z) : this.height0(x, z); }
  // the height map itself
  height0(x, z) {
    const n = this.segments, s = this.size / n, fc = (x + this.size / 2) / s, fr = (z + this.size / 2) / s;
    const c = Math.max(0, Math.min(n - 1, Math.floor(fc))), r = Math.max(0, Math.min(n - 1, Math.floor(fr)));
    const u = Math.max(0, Math.min(1, fc - c)), v = Math.max(0, Math.min(1, fr - r)), Z = this.z, w = n + 1;
    // (asked many times a frame: the four corners are read straight from the grid, with no helper made per call)
    const i0 = (r * w + c) * 3 + 2, i1 = ((r + 1) * w + c) * 3 + 2;
    return (Z[i0] * (1 - u) + Z[i0 + 3] * u) * (1 - v) + (Z[i1] * (1 - u) + Z[i1 + 3] * u) * v;
  }
  /** The ground's up direction at x, z ({ x, y, z }). */
  normal(x, z, e = this.size / this.segments) {
    const dx = this.height(x + e, z) - this.height(x - e, z), dz = this.height(x, z + e) - this.height(x, z - e), l = Math.hypot(dx, 2 * e, dz);
    return { x: -dx / l, y: 2 * e / l, z: -dz / l };
  }
  /** How steep the ground is at x, z: 0 flat .. 1 a cliff. */
  slope(x, z) { return 1 - this.normal(x, z).y; }
  /** Is x, z on this land? */
  inside(x, z) { return Math.abs(x) <= this.size / 2 && Math.abs(z) <= this.size / 2; }
  /** Flattens a round patch (for a village, a landing pad, a pitch) to height h (default: its centre). */
  flatten(x, z, r, h = this.height(x, z), soft = r * .5) {
    const n = this.segments, s = this.size / n, w = n + 1;
    for (let rr = 0; rr <= n; rr++) for (let cc = 0; cc <= n; cc++) {
      const px = -this.size / 2 + cc * s, pz = -this.size / 2 + rr * s, d = Math.hypot(px - x, pz - z); if (d > r + soft) continue;
      const k = d <= r ? 1 : 1 - (d - r) / soft, i = (rr * w + cc) * 3 + 2; this.z[i] += (h - this.z[i]) * k * k * (3 - 2 * k);
    }
    const g = this.mesh.geometry; g.attributes.position.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere(); if (this.colours) this.paint(this.colours);
    if (this.rock) this.rocks(this.rock.options);   // (the rock stands on the land as it now is)
    return this;
  }
  /**
   * masks((x, z, y, slope) => [fields, forest, rock, trodden]): where each kind of ground goes, 0..1
   * at every grid point, for looks.ground (gs.outdoors.looks). Call again after flatten().
   */
  masks(fn) {
    const g = this.mesh.geometry, n = g.attributes.position.count, S = this.size, seg = this.segments, a = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const c = i % (seg + 1), r = Math.floor(i / (seg + 1)), x = -S / 2 + c * S / seg, z = -S / 2 + r * S / seg, m = fn(x, z, this.height(x, z), this.slope(x, z));
      for (let k = 0; k < 4; k++) a[i * 4 + k] = m[k] || 0;
    }
    g.setAttribute('gsMask', new BufferAttribute(a, 4)); return this;
  }
  /** Colours the land by height: [[height, colour], ...] blended in between. */
  paint(stops) {
    this.colours = stops; const g = this.mesh.geometry, n = g.attributes.position.count, cols = new Float32Array(n * 3), cs = stops.map(([h, c]) => [h, new Color(c)]), tmp = new Color();
    for (let i = 0; i < n; i++) {
      const h = this.z[i * 3 + 2]; let j = 0; while (j < cs.length - 1 && cs[j + 1][0] <= h) j++;
      const a = cs[j], b = cs[Math.min(cs.length - 1, j + 1)], k = b[0] > a[0] ? Math.max(0, Math.min(1, (h - a[0]) / (b[0] - a[0]))) : 0;
      tmp.copy(a[1]).lerp(b[1], k); cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new BufferAttribute(cols, 3)); const m = this.mesh.material; if (m && !m.vertexColors) { m.vertexColors = true; m.needsUpdate = true; } return this;
  }
  /**
   * Rock on the land: cliffs with ledges and overhangs where it is steep, caves and hollows cut through it, and
   * rock of your own shape melted into it. A height map has one height for each spot; this adds real rock that
   * can fold over itself. Call it once the land has its shape and colours (after flatten() and paint()), before
   * meadow(), scatter() and solid(). o:
   *   cliffs: true | { steep (.42: how steep the land must be, as land.slope()), depth (1: how far the rock stands
   *     out, x), beds (1.8 m: how thick the layers of stone), ledge (1.1 m: how far a hard bed stands out past a
   *     soft one), lip (.7 m: how far a bed leans out towards its top: overhangs), rough (.45), cracks (.5: the
   *     joints that run down the face), area: [x0, z0, x1, z1] (only here) }
   *   caves: [{ path: [[x, y, z, radius?], ...], radius (2.5), rough (.35) }]: a tunnel along a path; it is open
   *     wherever the path comes out of the ground, and the land's own squares are left out there
   *   shapes: [{ box: [wide, high, deep] | ball: radius | arch: [span, rise, thick, deep] | path, at: [x, y, z],
   *     turn, rough, blend (.6 m: how softly it melts into the land), cut: true (taken out instead: a hollow) }]
   *   cell (.4 m: how fine; halve it and there are four times the triangles), seed, colours: { rock, dark, top
   *     (flat tops and where rock meets the ground; default the land's own colour there), floor (a cave's) },
   *   material (your own instead of the plain one with these colours).
   * Afterwards land.height(x, z) is the top of whatever is highest, land.floor(x, y, z) what a thing at height y
   * stands on (a cave's floor, the ground under an overhang, a ledge), land.roof(x, y, z) the underside of what is
   * over it (Infinity: open sky), land.ray(from, dir, max) metres to the ground or rock, land.rocky(x, z) whether
   * rock shows there, land.sky(x, y, z) how much daylight reaches (1 .. about .1 deep in a cave). The weather, the
   * sound and the physics take the rock with the land (a Weather's ground: land.height keeps caves dry). Returns
   * the group of rock meshes (on the land already). land.rocks(false) takes it away.
   */
  rocks(o = {}) {
    if (this.rock) {   // (asked again: taken away first, and the land's own squares put back)
      const R = this.rock; R.group.removeFromParent(); R.group.traverse(m => m.geometry?.dispose()); if (R.own) R.material.dispose();
      this.mesh.geometry.setIndex(R.index0); this.rock = null;
    }
    if (o === false) return null;
    const n = this.segments, w = n + 1, g = this.mesh.geometry, I = g.index.array, Z = new Float32Array(w * w); for (let i = 0; i < w * w; i++) Z[i] = this.z[i * 3 + 2];
    const cut = I[0] === 0 && I[1] === w && I[2] === 1 && I[3] === w && I[4] === w + 1 && I[5] === 1, ca = g.attributes.color;
    const lin = (c, d) => { const k = new Color(c ?? d); return [k.r, k.g, k.b]; }, K = o.colours || {};
    const opts = { cell: o.cell ?? .4, seed: o.seed ?? 1, cliffs: o.cliffs ?? true, caves: o.caves || [], shapes: o.shapes || [], colours: { rock: lin(K.rock, '#a39a8a'), dark: lin(K.dark, '#5e564b'), top: K.top ? lin(K.top) : null, floor: lin(K.floor, '#4a4136') } };
    const grid = { z: Z, size: this.size, segments: n, cut, tint: ca && ca.itemSize === 3 ? Float32Array.from(ca.array) : null };
    // (the same land and the same asking give the same rock: kept, so a card that loads in passes makes it once;
    // while a card loads it is made in a background worker, the card waiting for it)
    let h = 2166136261; { const b = new Uint8Array(Z.buffer); for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 16777619); if (grid.tint) { const t = new Uint8Array(grid.tint.buffer); for (let i = 0; i < t.length; i += 7) h = Math.imul(h ^ t[i], 16777619); } }
    const key = 'rock|' + (h >>> 0) + '|' + this.size + '|' + JSON.stringify(opts);
    let A = ROCKS.get(key);
    if (!A) A = need('Land', key, () => canRun() && run('rock', { grid, o: opts }).then(a => ROCKS.get(key) || keepRock(key, a)));
    if (!A) { pause('Land'); A = keepRock(key, rockArrays(grid, opts)); built(); }
    const group = new Group(); group.name = 'rocks'; group.rotation.x = Math.PI / 2;   // (the land's own object is turned to lie flat: this turns the rock back, so it is in the world's own metres)
    const material = o.material || new MeshStandardMaterial({ color: '#ffffff', roughness: .93, metalness: 0, vertexColors: true });
    let tris = 0;
    for (const p of A.pieces) {
      if (!p.I.length) continue;
      const geo = new BufferGeometry(); geo.setAttribute('position', new BufferAttribute(p.P, 3)); geo.setAttribute('normal', new BufferAttribute(p.N, 3)); geo.setAttribute('color', new BufferAttribute(p.C, 3)); geo.setIndex(new BufferAttribute(p.I, 1));
      geo.computeBoundingBox(); geo.computeBoundingSphere();
      const m = new Mesh(geo, material); m.name = 'rock'; m.castShadow = m.receiveShadow = true; group.add(m); tris += p.I.length / 3;
    }
    // the land's own squares where a cave comes through the ground are left out
    const index0 = g.index;
    if (A.holes.length) {
      const gone = new Uint8Array(n * n); for (const q of A.holes) gone[q] = 1;
      const out = new (I.constructor)(I.length - A.holes.length * 6); let k = 0;
      for (let q = 0; q < n * n; q++) if (!gone[q]) for (let j = 0; j < 6; j++) out[k++] = I[q * 6 + j];
      g.setIndex(new BufferAttribute(out, 1));
    }
    this.object.add(group);
    this.rock = { group, material, own: !o.material, options: o, index0, holes: A.holes, tris, pieces: group.children.length, ms: A.stats.ms, map: new RockMap(A, grid, opts, (x, z) => this.height0(x, z)) };
    return group;
  }
  /** What a thing at height y stands on at x, z: the highest ground or rock at or under y + reach (a cave's floor, a ledge, the ground under an overhang). Without rocks: the land's height. */
  floor(x, y, z, reach = .6) { return this.rock ? this.rock.map.floor(x, y, z, reach) : this.height0(x, z); }
  /** The underside of what is over a point: Infinity under open sky. */
  roof(x, y, z) { return this.rock ? this.rock.map.roof(x, y, z) : y < this.height0(x, z) ? y : Infinity; }
  /** Does rock show at x, z (or has a cave taken the ground away there)? Grass and scattered things keep off it. */
  rocky(x, z) { const M = this.rock?.map; return !!M && M.changed(x, z) && Math.abs(M.top(x, z) - this.height0(x, z)) > .03; }
  /** How much daylight reaches a point: 1 in the open, about .7 under an overhang, down to .1 deep in a cave. */
  sky(x, y, z) { return this.rock ? this.rock.map.sky(x, y, z) : 1; }
  /** Metres from `from` along the unit direction `dir` to the ground or the rock ({ distance }), or null within max. (So a Land can be the level of a gs.sound Ears or a Weather.) */
  ray(from, dir, max = 100) {
    const M = this.rock ? this.rock.map : this.plain ||= new RockMap({ pieces: [], cell: .5, side: 16, nch: Math.ceil(this.size / 16) }, { z: new Float32Array(4), size: this.size, segments: 1 }, {}, (x, z) => this.height0(x, z));
    const d = M.ray(from, dir, max); return d < Infinity ? { distance: d } : null;
  }
  /** Makes it solid in a gs.physics3d World3D (walk, roll and drive on it). */
  solid(world, o = {}) {   // (the land's own squares, less those a cave took away, and the rock: not the grass that grows on it)
    const parts = [this.mesh, this.rock?.group].filter(Boolean);
    return world.ground({ updateMatrixWorld: () => this.object.updateMatrixWorld(true), traverse: fn => { for (const p of parts) p.traverse(fn); } }, o);
  }
  /**
   * Covers the land in grass tufts that sway (three.terrain.js grass). count: about how many tufts;
   * colour or tint: [min, max] colours; below / above: heights to keep between; steep: max slope (0..1).
   */
  grass({ count = 2000, colour = '#6aa83c', tint = null, width = 1.2, height = 1, blades = 5, above = -Infinity, below = Infinity, steep = .4, far = 60, seed = 2, wind = 1 } = {}) {
    if (this.grassScene) this.grassScene.removeFromParent();
    const faces = this.segments * this.segments * 2, per = Math.max(1, Math.round(count / faces)), spread = Math.min(1, count / faces);
    const pick = createSeededRandom(seed + 7), c = new Color(colour), lo = c.clone().multiplyScalar(.75), hi = c.clone().lerp(new Color('#ffffff'), .15);
    this.grassScene = scatterGrass(this.mesh.geometry, {
      instanced: true, width, height, bladeCount: blades, color: colour, windStrength: wind, maxTilt: 0, randomRotationAxis: 'y', positionJitter: this.size / this.segments * .5,
      w: this.segments, h: this.segments, instancesPerFace: per, random: createSeededRandom(seed), maxSlope: Math.acos(1 - steep),
      tintRange: tint ? { min: new Color(tint[0]).getHex(), max: new Color(tint[1]).getHex() } : { min: lo.getHex(), max: hi.getHex() },
      spread: (v) => v.z >= above && v.z <= below && pick() < spread && !(this.rock && this.rocky(v.x, -v.y)),
    });
    this.grassScene.traverse(o => { if (o.isMesh) { o.receiveShadow = true; this.grassMesh ||= o; } });
    this.grassFar = far; this.object.add(this.grassScene);
    return this.grassScene;
  }
  /**
   * Thick grass round the camera, for a camera down in it: a square of tufts that travels with the camera
   * over the land. Each tuft stays where it grows (the far side of the square is planted afresh ahead as the
   * camera moves), and tufts shrink to nothing towards the square's edge, so none pops. Blades bend with the
   * wind (land.wind) in gusts that roll across them. reach: metres from the camera to the edge; gap: metres
   * between tufts (reach 22 with gap .55 is 6,400 tufts: fewer on slower phones); height and width: a tall
   * blade, metres; blades: a tuft; bends: 1..3 pieces a blade (fewer for a far ring); stalks: tall seed
   * stalks a tuft; spread: how wide a tuft is; colours: [one green, another, dried out] the tufts range
   * between; where(x, z) => 0..1: how thickly it grows there (0 on a road, rock, a floor); tall(x, z) =>
   * 0..1: how high (short where it is trodden or cropped); steep: no grass on steeper ground; budget:
   * milliseconds a frame it may spend planting after a camera cut (.5: the square fills from the camera
   * outwards over a few frames). Call it again for another ring (fine tufts close by, coarse ones out to
   * the distance). Call land.update(dt, camera) every frame; land.update(0, camera) plants the whole
   * square at once (when loading, or just before a cut to a place you know). Returns the mesh (on the
   * land already; it sits at the world's origin). land.meadow(false) takes them all away.
   */
  meadow(o = {}) {
    if (o === false) { for (const m of this.meadows) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); } this.meadows = []; return null; }
    const { reach = 22, gap = .55, height = .45, width = .05, blades = 8, bends = 3, stalks = 0, spread = gap * .42, colours = ['#5a7a2e', '#8b9440', '#a89c5c'], where = null, tall = null, steep = .45, seed = 4, budget = .5 } = o;
    const n = Math.max(8, Math.ceil(reach * 2 / gap)), N = n * n, half = n >> 1, geo = tuft({ blades, bends, stalks, height, width, spread, seed });
    const root = new InstancedBufferAttribute(new Float32Array(N * 4), 4); geo.setAttribute('lkRoot', root);
    // (hardly any shine: a blade edge-on to the eye would glint white against a low sun)
    const mat = new MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, roughness: .78, side: DoubleSide, specularIntensity: .12 });
    const look = LOOKS.meadow(mat, { reach: [reach * .55, reach * .97], part: this.parting });   // (parting: the grass field of a gs.outdoors.Marks on this land)
    const mesh = new InstancedMesh(geo, mat, N); mesh.name = 'meadow'; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.rotation.x = Math.PI / 2;   // (the land's own object is turned to lie flat: this turns the meadow back, so it is in the world's own metres)
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(N * 3), 3);
    const M = mesh.instanceMatrix.array, C = mesh.instanceColor.array, R = root.array, cs = colours.map(c => new Color(c)), tint = new Color();
    // a number 0..1 for a cell of the world (the same every time, so a tuft is the same tuft whenever its cell comes back)
    const H = (i, j, k) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k + seed * 7, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const plant = (i, j) => {
      const slot = (((j % n) + n) % n) * n + (((i % n) + n) % n), q = slot * 16;
      const x = (i + .5 + (H(i, j, 1) - .5) * .9) * gap, z = (j + .5 + (H(i, j, 2) - .5) * .9) * gap, y = this.height(x, z) - .015;
      let w = this.inside(x, z) && this.slope(x, z) < steep && !(this.rock && this.rocky(x, z)) ? 1 : 0; if (w && where) w = where(x, z);
      const on = w > 0 && H(i, j, 3) < w * 1.25, s = on ? (.6 + .75 * H(i, j, 4)) * (.55 + .45 * Math.min(1, w)) : 0, a = H(i, j, 5) * 6.2832, c = Math.cos(a) * s, sn = Math.sin(a) * s;
      const up = on && tall ? Math.max(.05, tall(x, z)) : 1;
      M[q] = c; M[q + 1] = 0; M[q + 2] = -sn; M[q + 3] = 0; M[q + 4] = 0; M[q + 5] = s * (.85 + .3 * H(i, j, 6)) * up; M[q + 6] = 0; M[q + 7] = 0;
      M[q + 8] = sn; M[q + 9] = 0; M[q + 10] = c; M[q + 11] = 0; M[q + 12] = x; M[q + 13] = y; M[q + 14] = z; M[q + 15] = 1;
      R[slot * 4] = x; R[slot * 4 + 1] = y; R[slot * 4 + 2] = z;
      // one green or another, dried out in patches, each tuft a little lighter or darker
      const dry = Math.max(0, Math.min(1, (fbm(x * .045 + 7.3, z * .045 - 2.1, 2) + .08) * 2.2)) * .85, v = .8 + .4 * H(i, j, 8);
      tint.copy(cs[0]).lerp(cs[1], H(i, j, 7)); if (cs[2]) tint.lerp(cs[2], dry * (.4 + .6 * H(i, j, 9)));
      C[slot * 3] = tint.r * v; C[slot * 3 + 1] = tint.g * v; C[slot * 3 + 2] = tint.b * v;
    };
    // the square's cells, nearest the middle first, and which cell of the world each slot holds now
    const order = new Uint32Array(N), own = new Int32Array(N * 2).fill(0x7fffffff);
    { const d = k => Math.hypot((k % n) - half + .5, ((k / n) | 0) - half + .5), list = Array.from({ length: N }, (_, k) => k).sort((a, b) => d(a) - d(b)); order.set(list); }
    const st = { n, gap, reach, look, where, ci: null, cj: null, k: N, at: new Vector3(1e9, 0, 0), planted: 0 };
    // Plants the cells that came into the square round p and are not planted yet, from the middle out. After
    // a camera cut that is every cell: a few are planted each frame (`budget` milliseconds' worth), so a cut
    // never costs a long frame and the grass at your feet is there first; all: plant the lot now.
    st.follow = (p, all = false) => {
      const ci = Math.floor(p.x / gap), cj = Math.floor(p.z / gap);
      if (ci !== st.ci || cj !== st.cj) { st.ci = ci; st.cj = cj; st.k = 0; }
      if (st.k >= N) return 0;
      const i0 = ci - half, j0 = cj - half, t0 = all ? 0 : performance.now(); let done = 0;
      while (st.k < N) {
        const o = order[st.k++], i = i0 + o % n, j = j0 + ((o / n) | 0), q = ((((j % n) + n) % n) * n + (((i % n) + n) % n)) * 2;
        if (own[q] === i && own[q + 1] === j) continue;
        plant(i, j); own[q] = i; own[q + 1] = j;
        if ((++done & 15) === 0 && !all && performance.now() - t0 > budget) break;
      }
      if (done) { st.planted += done; mesh.instanceMatrix.needsUpdate = mesh.instanceColor.needsUpdate = root.needsUpdate = true; }
      return done;
    };
    mesh.userData.meadow = st; this.meadows.push(mesh); this.object.add(mesh);
    return mesh;
  }
  /**
   * Scatters a gs.props kind over the land: above / below heights, steep: max slope, gap, seed,
   * scale: [min, max], keepOut(x, z). Returns the ids.
   */
  scatter(props, name, count, { above = -Infinity, below = Infinity, steep = .5, keepOut = null, inset = 2, ...o } = {}) {
    const h = this.size / 2 - inset;
    return props.scatter(name, count, { x0: -h, z0: -h, x1: h, z1: h }, { ...o, y: (x, z) => this.height(x, z),
      keepOut: (x, z) => { const y = this.height(x, z); return y < above || y > below || this.slope(x, z) > steep || !!(this.rock && this.rocky(x, z)) || !!keepOut?.(x, z); } });
  }
  /** Each frame: sways the grass and hides tufts far from the camera. */
  update(dt, camera = null) {
    this.time += dt;
    if (this.grassScene) {
      const w = this.wind, k = w && camera ? w.at(camera.position.x, camera.position.z).gust : 1;
      this.grassScene.traverse(o => { if (!o.isMesh) return; updateGrass(o, this.time); const u = (o.userData.grassMaterial || o.material)?.userData?.grassUniforms; if (w && u?.windStrength) u.windStrength.value = w.speed * k * w.grass; });
      if (camera) updateGrassLOD(this.grassScene, camera, this.grassFar);
    }
    for (const mesh of this.meadows) {
      const st = mesh.userData.meadow, u = st.look.uniforms, w = this.wind, p = camera?.position;
      u.lkTime.value = this.time;
      if (w) { u.lkBend.value = Math.min(.8, w.speed * (p ? w.at(p.x, p.z).gust : 1) * w.grass * .4); u.lkBendDir.value.copy(w.uniforms.lkWindDir.value); }
      // the square follows the camera, unless it is flying past too fast to see grass (the tufts left behind are
      // sunk by their own shader) or is far above it; after a jump the square is planted over a few frames once
      // it is still (all at once with dt 0: call update(0, camera) before a cut you know is coming)
      if (p) { const far = p.distanceTo(st.at), fast = st.ci !== null && dt > 0 && far / dt > 60; st.at.copy(p); if (!fast && p.y - this.height(p.x, p.z) < st.reach * 2.5) st.follow(p, dt === 0); }
    }
    return this;
  }
  dispose() { this.object.traverse(o => { o.geometry?.dispose(); }); this.object.removeFromParent(); }
}

// A tuft of grass: narrow ribbons that taper to a point and curve outwards, leaning every way, and a few
// tall stalks with a seed head if asked for. uv.y runs from the root (0) to the tip (1); the colours are
// shades (darker down in the tuft, each blade its own, a touch yellower at the tip, the seed heads
// straw) for the tuft's own colour to tint; the normals point mostly up, so a meadow is lit like the
// ground it grows on.
function tuft({ blades = 8, bends = 3, stalks = 0, height = .45, width = .05, spread = .2, seed = 4 } = {}) {
  const R = createSeededRandom(seed + 11), P = [], Nn = [], U = [], C = [], I = [], L = Math.max(1, Math.min(3, bends | 0));
  for (let b = 0; b < blades + stalks; b++) {
    const stalk = b >= blades, a0 = R() * Math.PI * 2, r0 = Math.sqrt(R()) * spread * (stalk ? .6 : 1), bx = Math.cos(a0) * r0, bz = Math.sin(a0) * r0;
    const out = Math.atan2(bz, bx) + (R() - .5) * 3.6, fx = Math.cos(out), fz = Math.sin(out);   // the way it leans (mostly outwards); its width lies across that
    const h = stalk ? height * (1.25 + R() * .5) : height * (.45 + R() * .55), w = width * (.7 + R() * .6), lean = h * (stalk ? .05 + R() * .16 : .14 + R() * .55), shade = .8 + R() * .32, base = P.length / 3;
    for (let l = 0; l <= L; l++) {
      const t = l / L, k = t * t, cx = bx + fx * lean * k, cz = bz + fz * lean * k, y = h * t * (1 - .13 * k);
      // a blade narrows to its tip; a stalk is a thin stem that widens into its seed head just under the tip
      const hw = w * .5 * (stalk ? (l === L - 1 && L > 1 ? .95 : .3) : 1 - Math.pow(t, 1.6)), v = shade * (.3 + .7 * Math.pow(t, .8)), head = stalk && l >= L - 1 ? 1 : 0;
      const nl = Math.hypot(fx * .5 * t, 1, fz * .5 * t);
      for (const sd of l < L ? [-1, 1] : [0]) {
        P.push(cx - fz * hw * sd, y, cz + fx * hw * sd); Nn.push(fx * .5 * t / nl, 1 / nl, fz * .5 * t / nl); U.push(sd * .5 + .5, t);
        C.push(v * (1 + .5 * head), v * (1 + .3 * head), v * (1 - .14 * t) * (1 - .25 * head));
      }
    }
    for (let l = 0; l < L - 1; l++) { const i = base + l * 2; I.push(i, i + 1, i + 3, i, i + 3, i + 2); }
    I.push(base + (L - 1) * 2, base + (L - 1) * 2 + 1, base + L * 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(P, 3)); g.setAttribute('normal', new Float32BufferAttribute(Nn, 3)); g.setAttribute('uv', new Float32BufferAttribute(U, 2)); g.setAttribute('color', new Float32BufferAttribute(C, 3));
  g.setIndex(I); return g;
}

/**
 * The look of a gs.flow stream or pool in 3D: a river, stream or waterfall of moving water (foam at
 * its rocks, banks and falls), or molten lava (kind 'lava': glowing cracks, cooling crust), or acid.
 * The mesh follows the stream's path and width, so what you see is where stream.at() says the
 * liquid is. o: step (metres between rows), across (columns), lift (metres above the path), look
 * (options for looks.flow or looks.lava: colours, scale...), material (your own MeshStandardMaterial,
 * the look goes on it). update(dt) moves it on.
 */
export class River {
  constructor(stream, { step = 1, across = 6, lift = .02, look = {}, material = null } = {}) {
    this.stream = stream; const lavaK = stream.kind === 'lava';
    const acid = stream.kind === 'acid' ? { deep: [.05, .2, .02], shallow: [.2, .45, .05], foam: [.7, .95, .4] } : stream.kind === 'mud' ? { deep: [.06, .04, .02], shallow: [.12, .08, .04], foam: [.3, .25, .18], ripple: .2 } : {};
    const g = stream.path ? this.ribbon(stream, step, across, lift) : this.disc(stream, lift);
    const m = material || new MeshStandardMaterial({ color: '#ffffff', roughness: .1, metalness: 0 });
    if (!lavaK) { m.transparent = m.transparent || stream.kind !== 'mud'; m.opacity = Math.min(m.opacity, stream.kind === 'mud' ? 1 : .9); m.depthWrite = !m.transparent; }
    this.look = lavaK ? LOOKS.lava(m, { length: stream.length || 1, ...look }) : LOOKS.flow(m, { ...acid, ...look });
    this.mesh = new Mesh(g, m); this.mesh.receiveShadow = !lavaK; this.mesh.castShadow = false; this.mesh.userData.noSettle = true;
  }
  ribbon(s, step, n, lift) {
    const L = s.length, rows = Math.max(2, Math.ceil(L / step) + 1), pos = [], fl = [], dir = [], idx = [];
    for (let r = 0; r < rows; r++) {
      const d = Math.min(L, r * L / (rows - 1)), a = s.path.at(d), fall = s.isFall(d), h = Math.hypot(a.dx, a.dz) || 1;
      for (let i = 0; i <= n; i++) {
        const e = i / n * 2 - 1, side = e * s.width / 2, p = s.path.offset(d, side);
        let foam = fall ? .45 : Math.max(0, Math.abs(e) - .85) * 2.5;
        for (const k of s.rocks) { const dd = Math.hypot(p.x - k.x, p.z - k.z); foam = Math.max(foam, Math.min(1, (k.r * 1.8 - dd) / k.r)); }
        pos.push(p.x, p.y + lift, p.z); fl.push(side, d, s.speed * (1 - e * e * .75) * (fall ? 2.2 : 1), foam); dir.push(a.dx / h, a.dz / h, Math.abs(e));
      }
    }
    for (let r = 0; r < rows - 1; r++) for (let i = 0; i < n; i++) { const a = r * (n + 1) + i, b = a + n + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    return this.finish(pos, fl, dir, idx);
  }
  disc(p, lift, seg = 40) {
    const pos = [], fl = [], dir = [], idx = [], c = p.at, y = (c.y ?? 0) + lift, rings = 4, box = p.w != null;
    for (let j = 0; j <= rings; j++) for (let k = 0; k < seg; k++) {
      const t = k / seg * Math.PI * 2, f = j / rings, cx = Math.cos(t), cz = Math.sin(t);
      const ox = box ? Math.max(-1, Math.min(1, cx * 1.42)) * p.w / 2 * f : cx * p.r * f, oz = box ? Math.max(-1, Math.min(1, cz * 1.42)) * p.h / 2 * f : cz * p.r * f;
      pos.push(c.x + ox, y, (c.z ?? 0) + oz); fl.push(ox, oz, p.spin ? Math.abs(p.spin) * .3 : .15, f > .9 ? .3 : 0); dir.push(0, 1, f);
    }
    for (let j = 0; j < rings; j++) for (let k = 0; k < seg; k++) { const a = j * seg + k, b = j * seg + (k + 1) % seg; idx.push(a, b, a + seg, b, b + seg, a + seg); }
    return this.finish(pos, fl, dir, idx);
  }
  finish(pos, fl, dir, idx) {
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('lkFlow', new Float32BufferAttribute(fl, 4));
    g.setAttribute('lkDir', new Float32BufferAttribute(dir, 3)); g.setIndex(idx); g.computeVertexNormals();
    // faces up: the ribbon is wound so its normals point to the sky (flip if the path made them point down)
    const nrm = g.attributes.normal; let up = 0; for (let i = 1; i < nrm.count * 3; i += 3) up += nrm.array[i];
    if (up < 0) { for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]; g.setIndex(idx); g.computeVertexNormals(); }
    return g;
  }
  /** Each frame: moves the water (or lava) on. */
  update(dt) { this.look.uniforms.lkFlowT.value += dt; return this; }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.removeFromParent(); }
}


/**
 * Draws a gs.flow Flood: a water surface over the ground where it's wet, lighter where shallow. With
 * view (an HDView) on WebGPU the flood runs on the graphics chip (bigger grids stay quick) and its
 * depths come back every few frames for flood.depth(), level() and current(); on WebGL it runs on the
 * CPU. o: deep, shallow (colours), opacity, rough, full (metres of water for the deep colour).
 */
export class FloodWater {
  constructor(flood, { view = null, deep = '#1d5872', shallow = '#6fa8b0', opacity = .85, rough = .08, full = 1.2 } = {}) {
    this.flood = flood; const { N, l } = flood;
    this.look = { deep: new Color(deep), shallow: new Color(shallow), opacity, rough, full, dry: .01, sink: .06 };
    const pos = new Float32Array(N * N * 3), idx = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = (j * N + i) * 3; pos[k] = flood.x0 + (i + .5) * l; pos[k + 2] = flood.z0 + (j + .5) * l; }
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) { const a = j * N + i; idx.push(a, a + N, a + 1, a + 1, a + N, a + N + 1); }
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new Float32BufferAttribute(new Float32Array(N * N * 3), 3));
    g.setAttribute('color', new Float32BufferAttribute(new Float32Array(N * N * 3), 3)); g.setIndex(idx);
    this.look.geometry = g; this.look.cellsIn = s => this.cellsIn(s);
    const m = new MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    this.mesh = new Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.mesh.userData.noSettle = true;
    this.view = view; if (view) (view.sims ||= []).push(this);
    this.sync();
  }
  cellsIn(s) { const { N, l } = this.flood, rc = Math.max(s.r, l * .5); let n = 0; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const cx = this.flood.x0 + (i + .5) * l, cz = this.flood.z0 + (j + .5) * l; if ((cx - s.x) ** 2 + (cz - s.z) ** 2 <= rc * rc) n++; } return n; }
  // the mesh from the CPU's depths: heights, normals by central differences (as the WebGPU mesh), colours
  sync() {
    const { N, l, B, D } = this.flood, L = this.look, g = this.mesh.geometry, P = g.attributes.position.array, Nm = g.attributes.normal.array, C = g.attributes.color.array;
    const hs = this._h ||= new Float32Array(N * N);
    for (let c = 0; c < N * N; c++) hs[c] = D[c] > L.dry ? B[c] + D[c] : B[c] - L.sink;
    const sh = L.shallow, dp = L.deep;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const c = j * N + i, k = c * 3;
      const nx = (hs[i > 0 ? c - 1 : c] - hs[i < N - 1 ? c + 1 : c]) / (i > 0 && i < N - 1 ? 2 * l : l), nz = (hs[j > 0 ? c - N : c] - hs[j < N - 1 ? c + N : c]) / (j > 0 && j < N - 1 ? 2 * l : l);
      const q = Math.hypot(nx, 1, nz); P[k + 1] = hs[c]; Nm[k] = nx / q; Nm[k + 1] = 1 / q; Nm[k + 2] = nz / q;
      const t = Math.min(1, Math.max(0, D[c] / L.full)), f = t * t * (3 - 2 * t);
      C[k] = sh.r + (dp.r - sh.r) * f; C[k + 1] = sh.g + (dp.g - sh.g) * f; C[k + 2] = sh.b + (dp.b - sh.b) * f;
    }
    for (const a of ['position', 'normal', 'color']) g.attributes[a].needsUpdate = true;
  }
  /** Each frame after flood.update(dt): the mesh follows the water (on WebGPU the graphics chip does this). */
  update() { if (!this.flood.gpu) this.sync(); return this; }
  // hd3d.js gpuSwap: on WebGPU the compute twin takes over the steps and the drawing, and gives them back
  gpuStep(G) {
    const f = this.flood;
    if (G) {
      if (this.twin?.r !== G.r) { this.twin?.dispose(); this.look.shallowV = new Vector3(this.look.shallow.r, this.look.shallow.g, this.look.shallow.b); this.look.deepV = new Vector3(this.look.deep.r, this.look.deep.g, this.look.deep.b); this.twin = { r: G.r, ...G.fx.gpuFlood(f, this.look) }; }
      if (!f.gpu) { f.gpu = { steps: 0, dirty: true }; }
      if (this.mesh.parent) { this.mesh.parent.add(this.twin.mesh); this.mesh.removeFromParent(); }
      this.twin.step(G.r, f.gpu.steps); f.gpu.steps = 0;
    } else if (f.gpu) {
      const n = f.gpu.steps; f.gpu = null; for (let k = 0; k < n; k++) f.step(1 / f.rate);   // (the last copy back is a few frames old)
      if (this.twin?.mesh.parent) { this.twin.mesh.parent.add(this.mesh); this.twin.mesh.removeFromParent(); }
      this.sync();
    }
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.removeFromParent(); this.twin?.mesh.removeFromParent(); this.twin?.dispose(); const s = this.view?.sims; if (s) s.splice(s.indexOf(this), 1); }
}

/**
 * The wind over a world: x, z its steady push (metres a second, towards +x / +z), gust 0..1 (how much
 * stronger and weaker it gets), gustSize (metres across a gust), sway and grass (how much leaves and
 * grass move per m/s). Call wind.update(dt) each frame. wind.at(x, z) is the wind there now: { x, z,
 * speed, gust } (gust: 1 is the steady wind). wind.uniforms (lkWind: leaf sway, lkWindDir: which way)
 * plug into looks.leaves; wind.speed and wind.angle are the steady wind. Change x, z any time.
 */
export class Wind {
  constructor({ x = 3, z = 0, gust = .35, gustSize = 70, sway = .12, grass = 1.2 } = {}) {
    Object.assign(this, { x, z, gust, gustSize, sway, grass }); this.t = 0;
    this.uniforms = { lkWind: { value: 0 }, lkWindDir: { value: new Vector2(1, 0) } };
    this.update(0);
  }
  get speed() { return Math.hypot(this.x, this.z); }
  get angle() { return Math.atan2(this.z, this.x); }
  update(dt, at = null) {
    this.t += dt;
    const s = this.speed, d = this.uniforms.lkWindDir.value; if (s > 1e-4) d.set(this.x / s, this.z / s);
    this.uniforms.lkWind.value = s * this.sway * (at ? this.at(at.x, at.z).gust : 1);
    return this;
  }
  at(x, z, out = {}) {
    const s = this.speed, k = this.gustSize, drift = this.t * .8;   // gusts travel at most of the wind's speed
    const g = Math.max(0, 1 + this.gust * fbm((x - this.x * drift) / k, (z - this.z * drift) / k, 2) * 1.6);
    out.x = this.x * g; out.z = this.z * g; out.speed = s * g; out.gust = g; return out;
  }
}

/**
 * A far-away stand-in for a tree (or any prop): a few cards crossed through its middle, each with a
 * picture of the real thing seen from that side, baked once. Lighting stays live (the cards get
 * rounded normals, so a crown lights like one shape), so they match the near trees in any light.
 * geometry + material: the near one (a map with alphaTest is cut out the same way). Options: cards
 * (2..4), size (texels per card picture), round (0 flat .. 1 round normals), material (options for
 * the cards' material: a MeshStandardMaterial, or a MeshPhysicalMaterial with the same specularIntensity when the near one is). Returns { geometry, material, texture, dispose() } (texture: a plain texture read back once, so it shows on WebGL and WebGPU), or null when
 * there is no 3D (tests without WebGL). Use it as the last level: props.kind(..., { lod: [[90, mid],
 * [240, imp.geometry, imp.material]] }).
 */
export function impostor(geometry, material, { cards = 3, size = 256, round = .7, material: mo = {} } = {}) {
  const r = renderer(); if (!r) return null;
  geometry.computeBoundingBox(); const bb = geometry.boundingBox;
  const rad = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z) * 1.02, y0 = bb.min.y, y1 = bb.max.y + .02, h = y1 - y0, cy = y0 + h * .55;
  const rt = new WebGLRenderTarget(size * cards, size, { samples: 0, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, colorSpace: SRGBColorSpace });
  const src = Array.isArray(material) ? material[0] : material;
  const flat = new MeshBasicMaterial({ map: src?.map || null, color: src?.color || '#ffffff', vertexColors: !!src?.vertexColors, alphaTest: src?.alphaTest || (src?.map ? .5 : 0), side: DoubleSide });
  const scene = new Scene(), mesh = new Mesh(geometry, flat); scene.add(mesh);
  const cam = new OrthographicCamera(-rad, rad, y1, y0, .1, rad * 4 + 10);
  // the clear colour is the tree's own (with no alpha), so cut-out edges don't go dark in the mips
  const c = new Color(src?.color || '#ffffff'), was = { rt: r.getRenderTarget(), auto: r.autoClear, alpha: r.getClearAlpha(), col: r.getClearColor(new Color()), sc: r.getScissorTest(), vp: r.getViewport(new Vector4()), sb: r.getScissor(new Vector4()) };
  if (geometry.attributes.color) { const a = geometry.attributes.color, m = new Color(0, 0, 0); for (let i = 0; i < a.count; i++) { m.r += a.getX(i); m.g += a.getY(i); m.b += a.getZ(i); } c.multiply(m.multiplyScalar(1 / a.count)); }
  try {
    r.setRenderTarget(rt); r.setClearColor(c.multiplyScalar(.35), 0); r.autoClear = false; r.clear(); r.setScissorTest(true);
    for (let k = 0; k < cards; k++) {
      const a = k / cards * Math.PI, nx = -Math.sin(a), nz = Math.cos(a);   // the card's front: looking back along -n
      cam.position.set(nx * (rad * 2 + 5), 0, nz * (rad * 2 + 5)); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
      r.setViewport(k * size, 0, size, size); r.setScissor(k * size, 0, size, size); r.render(scene, cam);
    }
  } finally { r.setScissorTest(was.sc); r.setRenderTarget(was.rt); r.setViewport(was.vp); r.setScissor(was.sb); r.autoClear = was.auto; r.setClearColor(was.col, was.alpha); flat.dispose(); }
  // read back once into a plain texture, so the cards draw on WebGL and WebGPU alike (a render
  // target's picture lives on the one GPU API that drew it)
  const px = new Uint8Array(size * cards * size * 4);
  r.readRenderTargetPixels(rt, 0, 0, size * cards, size, px); rt.dispose();
  const pic = new DataTexture(px, size * cards, size, RGBAFormat);
  Object.assign(pic, { colorSpace: SRGBColorSpace, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter, anisotropy: 4, needsUpdate: true });
  // the cards: one per picture, crossed through the middle
  const P = [], N = [], U = [], I = [], up = new Vector3(0, 1, 0), q = new Vector3(), n = new Vector3();
  for (let k = 0; k < cards; k++) {
    const a = k / cards * Math.PI, ax = Math.cos(a), az = Math.sin(a), b = P.length / 3;
    for (const [sx, sy] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      q.set(ax * rad * sx, sy > 0 ? y1 : y0, az * rad * sx); P.push(q.x, q.y, q.z);
      n.set(-Math.sin(a), 0, Math.cos(a)).lerp(q.clone().setY(q.y - cy).normalize(), round).lerp(up, .25).normalize(); N.push(n.x, n.y, n.z);
      U.push((k + (sx + 1) / 2) / cards, sy > 0 ? 1 : 0);
    }
    I.push(b, b + 3, b + 1, b + 1, b + 3, b + 2);
  }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(P, 3)); g.setAttribute('normal', new Float32BufferAttribute(N, 3)); g.setAttribute('uv', new Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeBoundingSphere();
  // (the cards take after a near material that turns its shine down, as leaves do: a card edge-on to the eye would glint white against a low sun)
  const m = src?.isMeshPhysicalMaterial ? new MeshPhysicalMaterial({ map: pic, alphaTest: .5, side: DoubleSide, roughness: .85, specularIntensity: src.specularIntensity, ...mo }) : new MeshStandardMaterial({ map: pic, alphaTest: .5, side: DoubleSide, roughness: .85, ...mo });
  return { geometry: g, material: m, texture: pic, dispose() { g.dispose(); m.dispose(); pic.dispose(); } };
}

const tint = (geo, colour) => { const c = new Color(colour), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } geo.setAttribute('color', new BufferAttribute(a, 3)); return geo; };
const clean = g => { const o = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'color'].includes(k)) o.deleteAttribute(k); return o; };

/**
 * A simple low-poly tree as one geometry with vertex colours (use a material with vertexColors:
 * true). kind: 'pine' | 'round' | 'palm' | 'bush'; trunk / leaves: colours; height in metres. Its base is at y = 0.
 */
export function tree({ kind = 'pine', trunk = '#6b4a2b', leaves = '#3f7d3a', height = 5, seed = 1 } = {}) {
  const parts = [], h = height;
  if (kind === 'bush') { const s = new IcosahedronGeometry(h * .3, 0); s.translate(0, h * .22, 0); parts.push(tint(clean(s), leaves)); }
  else {
    const t = new CylinderGeometry(h * .04, h * .06, kind === 'palm' ? h : h * .45, 6); t.translate(0, (kind === 'palm' ? h : h * .45) / 2, 0); parts.push(tint(clean(t), trunk));
    if (kind === 'pine') for (let i = 0; i < 3; i++) { const c = new ConeGeometry(h * (.32 - i * .07), h * .38, 7); c.translate(0, h * (.42 + i * .2), 0); parts.push(tint(clean(c), leaves)); }
    else if (kind === 'palm') for (let i = 0; i < 6; i++) { const f = new ConeGeometry(h * .06, h * .45, 4); f.rotateZ(Math.PI / 2.4); f.translate(h * .2, 0, 0); f.rotateY(i / 6 * Math.PI * 2 + seed); f.translate(0, h * .98, 0); parts.push(tint(clean(f), leaves)); }
    else { const s = new SphereGeometry(h * .32, 7, 5); s.translate(0, h * .68, 0); parts.push(tint(clean(s), leaves)); }
  }
  const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
}
/** A low-poly rock (vertex colours), about `size` metres across, sitting on y = 0. */
export function rock({ size = 1, colour = '#8a8a80', seed = 1 } = {}) {
  const g = clean(new DodecahedronGeometry(size / 2, 0)), p = g.attributes.position, v = new Vector3();
  let s = seed * 9301 + 49297; const R = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const seen = new Map();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = v.toArray().map(n => n.toFixed(3)).join(); if (!seen.has(k)) seen.set(k, .75 + R() * .5); const m = seen.get(k); p.setXYZ(i, v.x * m, v.y * m * .7, v.z * m); }
  g.translate(0, size * .25, 0); g.computeVertexNormals(); return tint(g, colour);
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(Land.prototype, 'update', 'land and grass');
timed(Wind.prototype, 'update', 'land and grass');
timed(River.prototype, 'update', 'water');
timed(FloodWater.prototype, 'update', 'water');
