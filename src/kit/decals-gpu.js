// Decals in the lamps' grid on WebGPU (HDView.decal; option 9 of the WebGPU engines review). A decal here is no mesh
// and no draw: it is a box in the world listed in the same clustered grid as the lamps (lamps-gpu.js KitLampsNode), and
// each lit pixel inside a box takes the decal's picture into its own colour and roughness before it is lit, so a mark
// is lit, shadowed and reflected as the surface it lies on. Hundreds of scorches, splats, bullet marks and posters cost
// a little per pixel where they lie and nothing else (on WebGL, and when the pictures are all in use, each decal is
// still a mesh cut from the surface, DecalGeometry, one draw each).
//
// Bevy's clustered decals read each decal's own picture, which needs bindless textures (not in WebGPU): here every
// picture is a square of one shared atlas, which a lit material reads as one more texture (a shader may read 16).
// The atlas is made once at its full size and never remade (a picture three remakes at a new size is left bound in
// still things' bind groups: clustered-lights notes in lamps-gpu.js), and pictures are copied into it on the graphics
// chip, each mip level from the picture's own, so a square never bleeds into its neighbours however far it is seen.
//
// In the lamps' list (the picture of rows lamps-gpu.js keeps per light) a decal takes the entries after the lamps, so
// in every cell of the grid the lamps come first (a crowded cell drops decals, never lamps) and the lamps' loop stops
// at the first decal. Its rows: 0..2 the camera's view to the decal's box (x across, y up the picture, z out of the
// surface; -0.5..0.5 inside), 3 its bounds (three's own row, which the grid is built from), 4 its glow and
// roughness, 5 where its picture is in the atlas, 6 its tint and opacity.
// The same atlas holds the pictures of signs that light with their own picture (lamps.js picture, lamps-gpu.js).
// Kit use only (lamps-gpu.js, hd3d-gpu.js, hd3d.js).
import { RenderTarget, SRGBColorSpace, LinearFilter, LinearMipmapLinearFilter, Matrix4, Vector2, Vector3, Box2, Frustum, Sphere } from 'three/webgpu';
import { Fn, Loop, If, Break, int, float, vec2, vec3, vec4, ivec2, textureLoad, texture, uniform, positionView, normalViewGeometry, smoothstep, dot, clamp, max, mix, abs, length, log2, exp2, renderGroup, diffuseColor, diffuseContribution, specularColorBlended, roughness } from 'three/tsl';

/** The atlas: SIDE x SIDE squares of PX texels. */
export const PX = 128, SIDE = 4, CELLS = SIDE * SIDE;
const ATLAS = new RenderTarget(PX * SIDE, PX * SIDE, { depthBuffer: false, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter });
ATLAS.texture.colorSpace = SRGBColorSpace; ATLAS.texture.generateMipmaps = true; ATLAS.texture.minFilter = LinearMipmapLinearFilter; ATLAS.texture.name = 'Decal pictures';
const atlasTex = texture(ATLAS.texture);
const LEVELS = Math.log2(PX) + 1, LOD_MAX = 5;   // (a square's own levels: 128 down to 1 texel; read no smaller than 4)

/* ---------- the squares ---------- */
const cellKey = new Array(CELLS).fill(null), cellUse = new Array(CELLS).fill(0), cellN = new Array(CELLS).fill(0);
let used = 0;
const B = new Box2(new Vector2(), new Vector2()), D = new Vector2();
/**
 * The square holding the picture of this key (a 128 x 128 mipmapped texture, hd3d.js decalTex), copied in the first
 * time; -1 when every square holds a picture some decal still shows (that decal is a mesh then).
 */
export function takeCell(r, key, tex) {
  let i = cellKey.indexOf(key);
  if (i < 0) {
    for (let j = 0; j < CELLS; j++) if (cellN[j] === 0 && (i < 0 || cellUse[j] < cellUse[i])) i = j;
    if (i < 0 || tex.image?.width !== PX) return -1;
    cellKey[i] = key;
    for (let l = 0; l < LEVELS; l++) {
      const s = PX >> l; B.max.set(s, s); D.set((i % SIDE) * s, Math.floor(i / SIDE) * s);
      r.copyTextureToTexture(tex, ATLAS.texture, B, D, l, l);
    }
  }
  cellN[i]++; cellUse[i] = ++used;
  return i;
}
/** A decal that showed square i has gone. */
export function giveCell(i) { if (i >= 0 && cellN[i] > 0) cellN[i]--; }
/** Where square i lies in the atlas: [u, v, width, height]. */
export const cellRect = i => [(i % SIDE) / SIDE, Math.floor(i / SIDE) / SIDE, 1 / SIDE, 1 / SIDE];
/** (tests) how many decals show each square. */
export const cellsInfo = () => ({ keys: cellKey.map(k => k === null ? null : typeof k === 'string' ? k : 'paint'), decals: cellN.slice() });

/* ---------- the list ---------- */
// metres a pixel spans: depth x [0] + [1] (a perspective camera, an orthographic one), for the picture's mip level
const PIX = uniform(new Vector2()).setGroup(renderGroup);
const VM = new Matrix4(), PVM = new Matrix4(), FR = new Frustum(), SPH = new Sphere(), V = new Vector3(), SZ = new Vector2();
const order = [], vz = [];
/**
 * After the lamps (KitLampsNode._updateLightsTexture): the decals this camera can see, nearest last as three sorts
 * its lamps, written after them into the lights' picture, with the depth slices' ranges worked out again over both.
 * list: the view's grid decals (hd3d.js) { inv (world to box), at, r, cell, tint, alpha, glowC, rough }.
 */
export function writeDecals(node, camera, list) {
  const tex = node._lightsTexture, data = tex.image.data, line = tex.image.width * 4, nL = node._lightsCount.value;
  node.gsLampN.value = nL;
  let nd = 0;
  const r = node._renderer;
  if (list?.length && r && node.maxLights > nL) {
    const rt = r.getRenderTarget(); if (rt) SZ.set(rt.width, rt.height); else r.getDrawingBufferSize(SZ);
    const p11 = camera.projectionMatrix.elements[5], k = 2 / Math.max(1e-6, p11 * SZ.y);
    if (camera.isOrthographicCamera) PIX.value.set(0, k); else PIX.value.set(k, 0);
    PVM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); FR.setFromProjectionMatrix(PVM, camera.coordinateSystem);
    // seen, and at least a pixel and a half across
    for (let i = 0; i < list.length && nd < node.maxLights - nL; i++) {
      const d = list[i]; if (d.alpha <= 0) continue;
      SPH.center.copy(d.at); SPH.radius = d.r; if (!FR.intersectsSphere(SPH)) continue;
      V.copy(d.at).applyMatrix4(camera.matrixWorldInverse);
      const px = 2 * d.r / Math.max(1e-6, PIX.value.x * Math.max(0, -V.z) + PIX.value.y); if (px < 1.5) continue;
      order[nd] = i; vz[i] = V.z; nd++;
    }
    order.length = nd;
    order.sort((a, b) => vz[a] - vz[b]);
    for (let j = 0; j < nd; j++) {
      const d = list[order[j]], o = (nL + j) * 4;
      VM.multiplyMatrices(d.inv, camera.matrixWorld); const e = VM.elements;
      for (let row = 0; row < 3; row++) { const q = line * row + o; data[q] = e[row]; data[q + 1] = e[4 + row]; data[q + 2] = e[8 + row]; data[q + 3] = e[12 + row]; }
      let q = line * 3 + o; data[q] = d.at.x; data[q + 1] = d.at.y; data[q + 2] = d.at.z; data[q + 3] = d.r;
      q = line * 4 + o; data[q] = d.glowC[0]; data[q + 1] = d.glowC[1]; data[q + 2] = d.glowC[2]; data[q + 3] = d.rough;
      const R = cellRect(d.cell); q = line * 5 + o; data[q] = R[0]; data[q + 1] = R[1]; data[q + 2] = R[2]; data[q + 3] = R[3];
      q = line * 6 + o; data[q] = d.tint[0]; data[q + 1] = d.tint[1]; data[q + 2] = d.tint[2]; data[q + 3] = d.alpha;
    }
  }
  node.gsDecalN.value = nd;
  if (!nd) return;
  // the depth slices' ranges over the lamps and the decals (as three works them out for its lamps alone)
  const n = nL + nd, near = camera.near, far = camera.far, NZ = node.zSlices, ranges = node._zSliceRangesData, lz = node._lightViewZ, lo = node._lightSortOrder;
  for (let z = 0; z < NZ; z++) {
    const sNear = -(near * Math.pow(far / near, z / NZ)), sFar = -(near * Math.pow(far / near, (z + 1) / NZ));
    let a = n, b = 0;
    for (let i = 0; i < n; i++) {
      const rad0 = data[line * 3 + i * 4 + 3], rad = rad0 >= 0 ? rad0 : far, z0 = i < nL ? lz[lo[i]] : vz[order[i - nL]];
      if (z0 + rad >= sFar && z0 - rad <= sNear) { if (i < a) a = i; b = i + 1; }
    }
    if (a >= n) { a = 0; b = 0; }
    ranges[z * 4] = a; ranges[z * 4 + 1] = b;
  }
  node._zSliceRangesTexture.needsUpdate = true;
  node._lightsCount.value = n; tex.needsUpdate = true;
}

/* ---------- the shader ---------- */
/**
 * Inside the lamps' setupLights, before any light: each decal of this pixel's cell that the pixel lies in lays its
 * picture over the surface's colour (and roughness, and a shine for glow), fading where the surface turns away from the
 * decal and towards its box's near and far faces. Not on see-through things, bodies that bend (people walk through
 * marks on the ground: they shouldn't wear them) or a material with decals = false (its own property, which three's
 * key for its shader takes in: userData is left out of it, so a material that only said so there shared the shader of
 * one like it that takes marks).
 */
export function decalPass(node, builder) {
  const m = builder.material, o = builder.object;
  if (!m || m.transparent === true || m.decals === false || m.isShadowMaterial || m.isShadowNodeMaterial || o?.isSkinnedMesh) return;
  const T = node._lightsTexture, std = m.isMeshStandardMaterial === true || m.isMeshStandardNodeMaterial === true, RL = builder.context.reflectedLight;
  // (a standard material lights its diffuse share and its highlight's colour, worked out from its colour before the
  // lights: those are what the mark changes; another lights its colour as it is. A plain three material is built as
  // its node twin, and keeps its own class here)
  const row = (li, r) => textureLoad(T, ivec2(li, r));
  Fn(() => {
    If(node.gsDecalN.greaterThan(0), () => {
      const P1 = vec4(positionView, 1), Ng = normalViewGeometry;
      const pix = positionView.z.negate().mul(PIX.x).add(PIX.y);
      Loop(node.maxLightsPerCluster, ({ i }) => {
        const t = node._getTile(i);
        If(t.equal(int(0)), () => { Break(); });
        const li = t.sub(1);
        If(li.greaterThanEqual(node.gsLampN), () => {
          const M0 = row(li, 0), M1 = row(li, 1), M2 = row(li, 2);
          const q = vec3(dot(M0, P1), dot(M1, P1), dot(M2, P1)).toVar();
          If(abs(q.x).lessThan(.5).and(abs(q.y).lessThan(.5)).and(abs(q.z).lessThan(.5)), () => {
            const face = dot(Ng, M2.xyz.normalize());
            const G = row(li, 4), A = row(li, 5), C = row(li, 6);
            // the mip level: texels of the square a pixel spans here, wider where the surface is seen at a slant
            const lod = clamp(log2(max(pix.mul(length(M0.xyz)).mul(PX).div(max(abs(face), .2)), 1)), 0, LOD_MAX);
            const h = exp2(lod).mul(.5 / PX), uv = clamp(q.xy.add(.5), vec2(h), vec2(h.oneMinus()));
            const s = atlasTex.sample(A.xy.add(uv.mul(A.zw))).level(lod);
            const a = s.a.mul(C.a).mul(smoothstep(.15, .45, face)).mul(smoothstep(.35, .5, abs(q.z)).oneMinus()).toVar();
            const c = s.rgb.mul(C.rgb);
            diffuseColor.rgb.assign(mix(diffuseColor.rgb, c, a));
            if (std) {
              diffuseContribution.assign(mix(diffuseContribution, c, a));
              specularColorBlended.assign(mix(specularColorBlended, vec3(.04), a));
              If(G.w.greaterThanEqual(0), () => { roughness.assign(mix(roughness, G.w, a)); });
            }
            RL.directDiffuse.addAssign(G.xyz.mul(a));   // (its glow: added as light, never darkened by AO)
          });
        });
      });
    });
  }, 'void')();
}
/**
 * Square i's picture again, from tex (a sign's picture that changed: lamps.js). Each of its levels copied over the old.
 */
export function refreshCell(r, i, tex) {
  if (i < 0 || tex.image?.width !== PX) return;
  for (let l = 0; l < LEVELS; l++) { const s = PX >> l; B.max.set(s, s); D.set((i % SIDE) * s, Math.floor(i / SIDE) * s); r.copyTextureToTexture(tex, ATLAS.texture, B, D, l, l); }
}
/** (TSL) The colour of square `cell` (a float) at uv (0..1 across it, 0 at its bottom) and mip level lod: a sign's picture (lamps-gpu.js). */
export function pictureAt(cell, uv, lod) {
  const h = exp2(lod).mul(.5 / PX), u = clamp(uv, vec2(h), vec2(h.oneMinus()));
  const o = vec2(cell.mod(SIDE), cell.div(SIDE).floor()).div(SIDE);
  return atlasTex.sample(o.add(u.div(SIDE))).level(lod).rgb;
}
/** Makes the atlas on the graphics chip (tests: a frame lab or probe may want it before any decal). */
export const decalAtlas = () => ATLAS;
