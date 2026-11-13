// Long Shadow: a sniper campaign in a made-up 1944 river valley. You are Wren, a lone sharpshooter
// working for Captain Oake's raiders against the Grey Order (a fictional army: no real flags, symbols
// or people). Read the range and the wind, hold your breath and squeeze: bullets drop and drift, so
// you aim above and into the wind. Every shot is loud unless a passing train or the church bell
// covers it. Fire too often from one spot and they find you: squads take cover, close in and call
// down mortars, so you move to the next nest. Hits knock soldiers out: no blood, cartoon KOs.
//
// Kits: gs.hd (the look), gs.outdoors (land, water, trees), gs.props (instanced trees and rocks),
// gs.sky (time of day, rain), gs.poses (soldiers), gs.combat (rifle, health, explosives), gs.tactics
// (cover and squads), gs.ai (paths), gs.brains (the enemy commander learns how you play),
// gs.stealth (bodies get found), gs.missions, gs.cutscene, gs.prompts, gs.gadgets (zip line),
// gs.destruction (the watchtower), gs.campaign (stars and saves) and gs.models (Wren up close).
import gs from '../gamescroll.js';
const { sounds, noise, tone, space, bed, Ears, music, compose } = gs.sound;
const { haptic, hapticPattern } = gs.device;
const { clamp, rnd } = gs.util;
const { fbm, rng, noise3 } = gs.math;
const { Juice } = gs.juice;
const { HDView, Particles, pbr, rbox, sun, surface, speckle, THREE } = gs.hd;
const { Land, Water, Wind, looks, groundDetail, horizon, impostor } = gs.outdoors;
const { Props } = gs.props;
const { Regions } = gs.regions;
const { Sky, Weather } = gs.sky;
const { Gun, Health, Explosives } = gs.combat;
const { CoverMap, Squad } = gs.tactics;
const { NavGrid } = gs.ai;
const { Brain, Wave, Imagine, Nemesis } = gs.brains;
const { Senses, Noises } = gs.senses;
const { Bodies } = gs.stealth;
const { Mission } = gs.missions;
const { Cutscene } = gs.cutscene;
const { Prompts } = gs.prompts;
const { Zipline } = gs.gadgets;
const { Campaign } = gs.campaign;
const { shatter } = gs.destruction;
const { human, vehicle } = gs.models;
const { keys } = gs.poses;
const { Group, Mesh, InstancedMesh, Object3D, Vector3, BoxGeometry, CylinderGeometry, PlaneGeometry, SphereGeometry, TorusGeometry, Color } = THREE;

let W = 300, H = 420;
const TAU = Math.PI * 2;
const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ------------------------------------------------------------------ ballistics
// A rifle round at about its real speed, so drop and wind matter at 200-400 m but a walking man needs
// only a small lead. The rifle is zeroed at 100 m.
const V0 = 780, GRAV = 9.8, WIND_K = 1.1, ZERO = 100;
const dropAt = d => .5 * GRAV * (d / V0) ** 2;
const BORE = dropAt(ZERO) / ZERO;
const holdAt = d => (dropAt(d) - BORE * d) / d;              // radians to aim above the target at range d
const driftAt = (d, w) => .5 * WIND_K * w * (d / V0) ** 2 / d; // radians to aim into the wind at range d

// ------------------------------------------------------------------ the valley
// x runs west to east, z south (+) to north (-), y up. The river winds along x; the Ashvale ridge is
// south (your side), the village of Larkford and the rail line north, a stream and dam north-east.
const RIVER = x => 6 * Math.sin(x * .011);
const RAILZ = -42, RAILH = 4.6, STREAMX = 140, ROADBANK = 7.1, LAKE = 12.6, CROSSX = 33.1;   // (LAKE: the reservoir's level, under the dam's crest; CROSSX: where the road crosses the line)
// the top of the track's bed of stone (and the planks of the crossing) where it stands above the ground, for feet
const trackY = (x, z) => { const d = Math.abs(z - RAILZ); return d > 3.3 || Math.abs(x - STREAMX) < 17 ? -99 : Math.abs(x - CROSSX) < 3.2 ? RAILH + .215 - .44 * sm(1.68, 3.3, d) : d < 2.1 ? RAILH - .03 - .19 * sm(1.55, 2.1, d) : -99; };
function shape(x, z) {
  // the ridge rises concave (steeper near the top) so the nests up there see down into the valley
  let h = 2 + 30 * clamp((z - 20) / 150, 0, 1) ** 1.6 - sm(190, 300, z) * 14 + sm(-38, -62, z) * 4 + sm(-165, -300, z) * 40;
  const town = 1 - sm(60, 95, Math.hypot(x + 15, z + 108));
  h += fbm(x * .011 + 3, z * .011 - 2, 4) * 6 * (1 - town * .85) * (1 - .85 * sm(20, 120, z));
  h += Math.max(0, x - 200) * .12 + Math.max(0, -x - 230) * .1;
  const sx = Math.abs(x - STREAMX), stream = (1 - sm(5, 22, sx)) * sm(-30, -60, z);
  h -= stream * 9;
  // the east road crosses the stream on a built-up bank with a stone culvert under it (no fording)
  const emb = (1 - sm(4.5, 10, Math.abs(z - roadZ(x)))) * (1 - sm(24, 34, sx)) * sm(-30, -60, z);
  h = lerp(h, ROADBANK, emb);
  const rz = Math.abs(z - RIVER(x)); h -= 6.5 * (1 - sm(5, 15, rz));
  // the reservoir behind the dam: the stream's valley dug out into a basin that narrows up the hill, its banks
  // above the water all the way round (the water is a flat sheet: it must never show past its shore)
  if (z < -209) {
    const u = (-209 - z) / 88, ax = sx / lerp(31, 9, Math.min(1, u));
    if (ax < 1.6) { const rim = lerp(Math.max(h, LAKE + 2.5), h, sm(1.25, 1.6, ax)); h = lerp(Math.min(rim, LAKE - 6 + 9 * u), rim, sm(.55, 1, ax)); }
  }
  // Larkford's shelf of level ground, and then the railway, cut through whatever lies in its way
  const vd = Math.hypot(x + 15, z + 108); if (vd < 88) { const k = vd <= 58 ? 1 : 1 - (vd - 58) / 30; h += (6.4 - h) * k * k * (3 - 2 * k); }
  const rk = (1 - sm(5, 12, Math.abs(z - RAILZ))) * sm(12, 17.5, sx);
  h = lerp(h, RAILH - .2, rk);
  return h;
}
const ROADS = [
  [[40, 26], [52, 70], [60, 118], [44, 175]],                       // south road up to the ridge
  [[40, -18], [28, -60], [-12, -96], [-80, -104], [-230, -112]],    // bridge to Larkford and west
  [[-12, -96], [60, -84], [130, -72], [240, -78]],                  // east road (trucks come this way)
];
function roadD(x, z) {
  let best = 99;
  for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) {
    const [ax, az] = r[i], [bx, bz] = r[i + 1], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1), d = Math.hypot(x - ax - dx * t, z - az - dz * t); if (d < best) best = d;
  }
  return best;
}
// houses: [x, z, w, d, h, turned]
const HOUSES = [
  [-45, -80, 10, 7, 6, 0], [-42, -128, 9, 8, 7, 1], [8, -132, 11, 7, 6, 0], [22, -94, 9, 7, 5, 1], [-62, -112, 8, 8, 6, 0],
  [-2, -78, 8, 6, 5, 0], [36, -116, 10, 8, 6, 1], [-82, -88, 9, 7, 5, 1], [56, -98, 8, 7, 5, 0], [-55, -150, 10, 7, 6, 0],
  [28, -152, 8, 8, 5, 1], [-100, -120, 8, 7, 5, 0],
];
const CHURCH = { x: -15, z: -122, tz: -108 };
const MILL = { x: 70, z: -21 };
// the stone bridge: deck from bank to bank (heights from the land at each end, with a hump), two arches over the river
const BRIDGE = { x: 40, z0: -24, z1: 23, hump: 1.1, arches: [{ c: -4.2, hw: 6.4, spring: -1.8, rise: 4.3 }, { c: 9.3, hw: 5.2, spring: -1.8, rise: 3.9 }], pier: { z: 3.15, y0: -1.8, h: 2.3 } };
// the deck's height at z (never under the land, so it meets the road at the banks)
function bridgeDeck(land) {
  const top = z => Math.max(land.height(BRIDGE.x - 3, z), land.height(BRIDGE.x, z), land.height(BRIDGE.x + 3, z)), ya = top(BRIDGE.z0), yb = top(BRIDGE.z1);
  return z => { const t = clamp((z - BRIDGE.z0) / (BRIDGE.z1 - BRIDGE.z0), 0, 1); return Math.max(lerp(ya, yb, t) + BRIDGE.hump * Math.sin(Math.PI * t), land.height(BRIDGE.x - 3, z) + .05, land.height(BRIDGE.x, z) + .05, land.height(BRIDGE.x + 3, z) + .05); };
}
// nests: where Wren can lie up
const NESTS = {
  ridge: { name: 'Ridge rocks', x: 2, z: 160, up: 1.0, face: { x: 20, z: -80 } },
  tower: { name: 'Water tower', x: -128, z: -54, up: 13.1, face: { x: 0, z: -100 } },
  chapel: { name: 'Chapel belfry', x: 78, z: 76, up: 12.2, face: { x: 20, z: -60 }, ex: -.5, ez: -1.4 },   // ex, ez: the eye sits in the north arch, clear of the corner pillars
  mill2: { name: 'Windmill', x: -112, z: 116, up: 8.8, face: { x: 0, z: -80 } },
};
const LANDMARKS = [['Mill', MILL.x, 4, MILL.z], ['Church', CHURCH.x, 22, CHURCH.tz], ['Bridge', BRIDGE.x, 4, 0], ['Rail', 140, 6, RAILZ], ['Dam', STREAMX, 22, -205]];

// grid for paths and cover: 4 m cells over most of the valley
const CELL = 4, GX0 = -200, GZ0 = -180, GC = 110, GR = 90;

// ------------------------------------------------------------------ the look
// Everything here is painted or grown in code the first time the valley is built. The engine gives
// the light its mood (gs.hd: sun shadows fitted to the view, air with haze, valley mist and cloud
// shadows, a colour grade and sun glare; gs.sky: clouds and the sky's own light). The game paints the
// ground (patchwork fields, hedges, rutted lanes, mud by the river, puddles in the rain), grows the
// trees (cards of painted leaves that sway in the wind) and builds the village.
const GU = { uTime: { value: 0 }, uWet: { value: 0 }, uSun: { value: new Vector3(0, 1, 0) } };
// one wind for the valley (gs.outdoors Wind): it sways the grass and trees, carries smoke, dust and
// rain, and pushes the bullets; its gusts roll down the valley, so the grass shows one coming
const AIR = new Wind({ x: 2.5, z: 0, gust: .45, gustSize: 90, sway: .1, grass: .25 });
function dataTex(data, w, h = w, { srgb = false, clampEdge = false } = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = clampEdge ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}
// the ground (gs.outdoors looks.ground): meadow, patchwork fields with hedges, rutted lanes, forest
// floor, rock, mud by the river, puddles in the rain. Masks say which ground goes where: x fields,
// y forest floor, z rock, w trodden earth
const ROADSEGS = ROADS.flatMap(r => r.slice(0, -1).map((p, i) => [p[0], p[1], r[i + 1][0], r[i + 1][1]]));
function groundMat(tex) {
  const normal = tex.normal.clone(); normal.repeat.set(170, 170); normal.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .95, normalMap: normal, normalScale: new THREE.Vector2(.5, .5) });
  looks.ground(m, { detail: tex.detail, roads: ROADSEGS, wet: GU.uWet });
  return m;
}
const groundMasks = (x, z, y, sl) => {
  const town = Math.hypot(x + 15, z + 108), river = Math.abs(z - RIVER(x));
  let farm = sm(.2, .08, sl) * sm(70, 95, town) * sm(16, 26, river) * sm(8, 16, Math.abs(z - RAILZ)) * sm(30, 22, y) * sm(-170, -150, z) * sm(18, 30, Math.hypot(x - MILL.x, z - MILL.z));
  let trod = Math.max(1 - sm(30, 62, town), 1 - sm(9, 20, Math.hypot(x - MILL.x, z - MILL.z)));
  for (const nn of Object.values(NESTS)) { const d = Math.hypot(x - nn.x, z - nn.z); farm *= sm(10, 22, d); trod = Math.max(trod, 1 - sm(1.4, 4, d)); }
  return [farm, sm(-140, -175, z) * (1 - farm), clamp(sm(.28, .5, sl) + sm(40, 60, y), 0, 1), trod];
};
// a weathered boulder: a squashed ball pushed in and out by noise, flat underneath, smooth shading
function boulder(size, seed, colour = '#958f84', seg = 20) {
  const g = new SphereGeometry(1, seg, Math.round(seg * .65)), p = g.attributes.position, c = new Color(colour), col = [], R = rng(seed), o = R() * 40, sq = .55 + R() * .2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = noise3(x * 1.2 + o, y * 1.2, z * 1.2 - o) * .3 + noise3(x * 3 - o, y * 3 + o, z * 3) * .09;
    const k = 1 + n, yy = y * k * sq;
    p.setXYZ(i, x * k * size, (yy < -.12 ? -.12 + (yy + .12) * .25 : yy) * size, z * k * size * (.8 + .2 * Math.abs(Math.sin(o))));
    const v = .8 + n * .6 + (y > .3 ? .08 : 0); col.push(c.r * v, c.g * v, c.b * v);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
// rock (gs.outdoors looks.rock): the shape's own colour, cracks and grit, moss where the top faces the sky
function rockMat(tex) { const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 }); looks.rock(m, { detail: tex.detail }); return m; }

// ---- trees: crowns of painted leaf cards with soft round normals (so a crown lights like one shape),
// trunks and limbs; three crossed cards painted with the whole tree far away
// The atlas: 1024 x 512 in cells of 256: leaf clump, fir bough, whole oak, whole poplar / whole fir,
// bark, straw. The see-through texels take the colour of the leaves next to them, so blurred far
// leaves don't get dark rims.
const CELLS = { clump: [0, 0], bough: [1, 0], oak: [2, 0], poplar: [3, 0], fir: [0, 1], bark: [1, 1], straw: [2, 1] };
const cellUV = (k, x0 = 0, y0 = 0, x1 = 1, y1 = 1) => { const [cx, cy] = CELLS[k]; return [(cx + x0) / 4, (cy + y0) / 2, (cx + x1) / 4, (cy + y1) / 2]; };
function treeAtlas() {
  const W2 = 1024, H2 = 512, cv = document.createElement('canvas'); cv.width = W2; cv.height = H2;
  const g = cv.getContext('2d', { willReadFrequently: true }), R = rng(77);
  const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;
  const leaf = (x, y, s, a, col) => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, s, s * .5, 0, 0, TAU); g.fill(); g.restore(); };
  // leaves in an oval, lit from the top left, darker underneath and deep inside
  const clump = (cx, cy, rx, ry, n, size, hue, lx = 0, ly = 0, lr = 1) => {
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, r = Math.sqrt(R()), x = cx + Math.cos(a) * r * rx, y = cy + Math.sin(a) * r * ry;
      const lit = clamp(.55 - (x - lx) / lr * .3 - (y - ly) / lr * .45 + (r - .6) * .25, 0, 1);
      leaf(x, y, size * (.7 + R() * .6), R() * TAU, hsl(hue + R() * 18 - 9, 32 + R() * 24, 10 + lit * 26 + R() * 6));
    }
  };
  const trunk = (x, y0, y1, w0, w1, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x - w0 / 2, y0); g.lineTo(x - w1 / 2, y1); g.lineTo(x + w1 / 2, y1); g.lineTo(x + w0 / 2, y0); g.fill(); };
  const twig = (x0, y0, x1, y1, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - 6, x1, y1); g.stroke(); };
  // needles: short strokes off a twig, both sides
  const needles = (x0, y0, x1, y1, len, n, hue, lit) => {
    for (let i = 0; i < n; i++) {
      const t = R(), x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 4, a = Math.atan2(y1 - y0, x1 - x0) + (R() < .5 ? -1 : 1) * (.7 + R() * .5);
      const l = len * (.6 + R() * .6) * (1 - t * .5);
      g.strokeStyle = hsl(hue + R() * 14 - 7, 24 + R() * 18, 9 + lit * 20 + R() * 8); g.lineWidth = 1.6 + R(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  };
  // (0,0) a spray of broad leaves for crown cards: overlapping bunches with a ragged edge
  for (const [x, y, rx, ry, n] of [[128, 128, 66, 58, 300], [78, 98, 42, 38, 150], [178, 94, 44, 38, 150], [72, 166, 40, 34, 130], [184, 164, 42, 36, 130], [128, 56, 46, 32, 140], [128, 202, 48, 32, 130]]) clump(x, y, rx, ry, n, 6.4, 88, 104, 64, 150);
  // (1,0) a fir bough: a twig from the trunk side (left) out to the tip (right), drooping
  for (let k = 0; k < 9; k++) {
    const t = k / 9, x = 256 + 14 + t * 210, y = 120 + t * t * 34;
    for (const s of [-1, 1]) { const ex = x + 34 + R() * 20, ey = y + s * (42 - t * 26) + 8; twig(x, y, ex, ey, 2, '#3a2c1e'); needles(x, y, ex, ey, 12, 70, 128, s < 0 ? .9 : .4); }
  }
  twig(260, 120, 500, 156, 4, '#3d2e1f'); needles(262, 120, 498, 156, 13, 260, 126, .6);
  // (2,0) a whole oak
  trunk(640, 256, 132, 18, 9, '#4a3a2c'); twig(640, 170, 596, 122, 5, '#4a3a2c'); twig(640, 160, 690, 116, 5, '#4a3a2c');
  for (const [x, y, rx, ry] of [[640, 104, 96, 66], [584, 118, 50, 40], [700, 116, 50, 40], [640, 58, 62, 44], [604, 148, 44, 26], [678, 146, 44, 26]]) clump(x, y, rx, ry, 360, 6.2, 90, 600, 60, 120);
  // (3,0) a whole poplar (tall and narrow)
  trunk(896, 256, 150, 12, 6, '#4b3e30');
  clump(896, 120, 42, 112, 900, 5.6, 84, 880, 40, 110);
  // (0,1) a whole fir
  trunk(128, 512, 280, 14, 4, '#3d2f22');
  for (let k = 0; k < 15; k++) { const t = k / 14, y = 490 - t * 214, w = 104 * (1 - t) ** 1.05 + 6; for (const s of [-1, 1]) needles(128, y, 128 + s * w, y + 22 * (1 - t), 15 - t * 6, 70, 128, s < 0 ? .8 - t * .2 : .35); }
  // (1,1) bark: pale, the trunks get their colour from the tree (vertex colours)
  g.fillStyle = '#d4ccbf'; g.fillRect(256, 256, 256, 256);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(60,48,36,${.1 + R() * .2})`; g.fillRect(256 + R() * 256, 256, 1 + R() * 3, 256); }
  // (2,1) straw for hay and thatch
  g.fillStyle = '#c9b071'; g.fillRect(512, 256, 256, 256);
  for (let i = 0; i < 1600; i++) { const x = 512 + R() * 256, y = 256 + R() * 256, a = (R() - .5) * .9; g.strokeStyle = hsl(42 + R() * 10, 40 + R() * 25, 40 + R() * 28); g.lineWidth = 1 + R(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14); g.stroke(); }
  // the see-through texels take their neighbours' colour (3 steps), the rest each cell's own average
  const img = g.getImageData(0, 0, W2, H2), d = img.data, solid = new Uint8Array(W2 * H2);
  for (let i = 0; i < W2 * H2; i++) solid[i] = d[i * 4 + 3] > 60 ? 1 : 0;
  for (let p = 0; p < 3; p++) {
    const add = [];
    for (let y = 1; y < H2 - 1; y++) for (let x = 1; x < W2 - 1; x++) {
      const i = y * W2 + x; if (solid[i]) continue;
      let r = 0, gg = 0, b = 0, n = 0;
      for (const j of [i - 1, i + 1, i - W2, i + W2]) if (solid[j]) { r += d[j * 4]; gg += d[j * 4 + 1]; b += d[j * 4 + 2]; n++; }
      if (n) { d[i * 4] = r / n; d[i * 4 + 1] = gg / n; d[i * 4 + 2] = b / n; add.push(i); }
    }
    for (const i of add) solid[i] = 1;
  }
  for (const [cx, cy] of Object.values(CELLS)) {
    let r = 0, gg = 0, b = 0, n = 0;
    for (let y = cy * 256; y < cy * 256 + 256; y += 2) for (let x = cx * 256; x < cx * 256 + 256; x += 2) { const i = (y * W2 + x) * 4; if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; } }
    if (!n) continue; r /= n; gg /= n; b /= n;
    for (let y = cy * 256; y < cy * 256 + 256; y++) for (let x = cx * 256; x < cx * 256 + 256; x++) { const i = y * W2 + x; if (!solid[i]) { d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; } }
  }
  return dataTex(new Uint8Array(d.buffer), W2, H2, { srgb: true, clampEdge: true });
}
// geometry made of cards and tubes, with uvs into the atlas and vertex colours
function cards() {
  const P = [], N = [], U = [], C = [], I = [], v = new Vector3(), w = new Vector3();
  const b = {
    // a card: centre c, half-width axis ax, half-height axis ay (canvas top at +ay), uv rect, colour, normals (fn(corner) or one vector)
    card(c, ax, ay, uv, col, nf) {
      const base = P.length / 3;
      for (const [sx, sy, u, vv] of [[-1, 1, uv[0], uv[1]], [1, 1, uv[2], uv[1]], [1, -1, uv[2], uv[3]], [-1, -1, uv[0], uv[3]]]) {
        v.copy(c).addScaledVector(ax, sx).addScaledVector(ay, sy); P.push(v.x, v.y, v.z);
        const nn = typeof nf === 'function' ? nf(v, w) : nf; N.push(nn.x, nn.y, nn.z); U.push(u, vv); C.push(col.r, col.g, col.b);
      }
      I.push(base, base + 3, base + 1, base + 1, base + 3, base + 2);
    },
    // a tapered tube from a to b
    tube(a, bb, ra, rb, seg, col) {
      const dir = new Vector3().subVectors(bb, a), L = dir.length(); dir.normalize();
      const side = Math.abs(dir.y) < .9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0), e1 = new Vector3().crossVectors(dir, side).normalize(), e2 = new Vector3().crossVectors(dir, e1);
      const base = P.length / 3, [u0, v0, u1, v1] = cellUV('bark', .1, .1, .9, .9);
      for (let k = 0; k <= seg; k++) {
        const t = k / seg * TAU, cs = Math.cos(t), sn = Math.sin(t);
        for (const [p, r, vv] of [[a, ra, v1], [bb, rb, v0]]) { const nx = e1.x * cs + e2.x * sn, ny = e1.y * cs + e2.y * sn, nz = e1.z * cs + e2.z * sn; P.push(p.x + nx * r, p.y + ny * r, p.z + nz * r); N.push(nx, ny, nz); U.push(u0 + (u1 - u0) * k / seg, vv); C.push(col.r, col.g, col.b); }
      }
      for (let k = 0; k < seg; k++) { const i = base + k * 2; I.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
      void L;
    },
    geo() {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeBoundingSphere(); return g;
    },
  };
  return b;
}
const V3 = (x, y, z) => new Vector3(x, y, z), UP3 = new Vector3(0, 1, 0);
// leaf cards in an oval crown: mostly on the outside, facing every way, tinted darker inside and below
function crown(b, R, o, n, size, tint, uv) {
  const c = new Color(), cen = V3(o[0], o[1], o[2]), rad = V3(o[3], o[4], o[5]);
  for (let i = 0; i < n; i++) {
    const u = R() * 2 - 1, a = R() * TAU, s = Math.sqrt(1 - u * u), r = .5 + .5 * Math.sqrt(R());
    const p = V3(Math.cos(a) * s * r * rad.x, u * r * rad.y, Math.sin(a) * s * r * rad.z).add(cen);
    const yaw = R() * TAU, pitch = (R() - .3) * 1.1, f = V3(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
    const ax = new Vector3().crossVectors(UP3, f).normalize(), ay = new Vector3().crossVectors(f, ax).normalize(), k = size * (.75 + R() * .5);
    ax.multiplyScalar(k * .5); ay.multiplyScalar(k * .5);
    const depth = r, high = clamp((p.y - cen.y) / rad.y * .5 + .5, 0, 1);
    c.copy(tint).multiplyScalar((.55 + .45 * depth) * (.82 + .3 * high) * (.9 + R() * .2));
    b.card(p, ax, ay, uv, c, (q, out) => out.subVectors(q, cen).divide(rad).normalize().lerp(UP3, .2).normalize());
  }
}
// three crossed cards painted with the whole tree, for far away
function farCards(b, w, h, uv, tint, cy) {
  const cen = V3(0, cy, 0), col = new Color().copy(tint);
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI, ax = V3(Math.cos(a) * w / 2, 0, Math.sin(a) * w / 2); b.card(V3(0, h / 2, 0), ax, V3(0, h / 2, 0), uv, col, (q, out) => out.subVectors(q, cen).normalize().lerp(UP3, .3).normalize()); }
}
const BARK = new Color('#5a4a3a');
function oakGeo(lod, seed = 3) {
  const b = cards(), R = rng(seed), tint = new Color('#e8f0d8');
  if (lod === 2) { farCards(b, 9.6, 9.6, cellUV('oak'), tint, 6); return b.geo(); }
  b.tube(V3(0, -.4, 0), V3(0, 4.2, 0), .34, .22, 7, BARK);
  if (lod === 0) for (const [x, y, z] of [[-1.7, 5.4, .7], [1.8, 5.6, -.5], [.3, 6.6, 1.5], [-.4, 5.8, -1.7]]) b.tube(V3(0, 3.6, 0), V3(x, y, z), .16, .07, 5, BARK);
  const lumps = [[0, 6.3, 0, 3.3, 2.5, 3.3], [-1.9, 5.5, .8, 2.2, 1.8, 2.2], [2, 5.7, -.6, 2.3, 1.9, 2.2], [.4, 7.8, .3, 2.4, 1.7, 2.4], [-.6, 5.3, -1.9, 2, 1.6, 2]];
  const n = lod === 0 ? 120 : 40, size = lod === 0 ? 2.4 : 3.3;
  for (let i = 0; i < n; i++) crown(b, R, lumps[i % lumps.length], 1, size, tint, cellUV('clump'));
  return b.geo();
}
function poplarGeo(lod, seed = 5) {
  const b = cards(), R = rng(seed), tint = new Color('#e6f2cc');
  if (lod === 2) { farCards(b, 4.6, 14, cellUV('poplar', .25, 0, .75, 1), tint, 8); return b.geo(); }
  b.tube(V3(0, -.4, 0), V3(0, 6, 0), .24, .12, 6, BARK);
  crown(b, R, [0, 8.3, 0, 1.5, 5.5, 1.5], lod === 0 ? 92 : 36, lod === 0 ? 1.85 : 2.6, tint, cellUV('clump'));
  return b.geo();
}
function firGeo(lod, seed = 7) {
  const b = cards(), R = rng(seed), tint = new Color('#dfe8d8'), H = 12, c = new Color();
  if (lod === 2) { farCards(b, 7.2, 12.6, cellUV('fir', 0, .1, 1, 1), tint, 5); return b.geo(); }
  b.tube(V3(0, -.4, 0), V3(0, H * .95, 0), .3, .05, 6, BARK);
  const step = lod === 0 ? .62 : 1.25, per = lod === 0 ? 7 : 5, uv = cellUV('bough');
  for (let y = 1.6, k = 0; y < H - .4; y += step, k++) {
    const t = (y - 1.2) / (H - 1.2), r = 3.4 * (1 - t) ** .95 + .45;
    for (let i = 0; i < per; i++) {
      const a = (i + k * .5 + R() * .3) / per * TAU, dx = Math.cos(a), dz = Math.sin(a), inner = V3(dx * .15, y, dz * .15), outer = V3(dx * r, y - r * .32, dz * r);
      const cen = inner.clone().add(outer).multiplyScalar(.5), ax = outer.clone().sub(inner).multiplyScalar(.5), ay = V3(-dz, 0, dx).multiplyScalar(r * .36);
      c.copy(tint).multiplyScalar((.65 + .45 * t) * (.9 + R() * .2));
      const nrm = V3(dx, .9, dz).normalize();
      b.card(cen, ax, ay, uv, c, nrm);
    }
  }
  return b.geo();
}
// leaves (gs.outdoors looks.leaves): cut out of the atlas, sway with the wind, light up when you look
// towards the sun through them
function leafMat(atlas) {
  // (hardly any shine: a leaf card edge-on to the eye glints white against the low sun otherwise)
  const m = new THREE.MeshPhysicalMaterial({ map: atlas, vertexColors: true, roughness: .82, alphaTest: .5, side: THREE.DoubleSide, specularIntensity: .1 });
  looks.leaves(m, { time: GU.uTime, wind: AIR, sun: GU.uSun, atlas: [1024, 512], glow: .45 });
  return m;
}

// ---- the village is built from boxes, slopes and cylinders merged into a few meshes, each part with
// uvs in metres (so plaster, tiles, boards and stone keep their size) and a colour of its own
function solid() {
  const P = [], N = [], U = [], C = [], I = [], e1 = new Vector3(), e2 = new Vector3(), n = new Vector3(), ax = new Vector3(), ay = new Vector3(), d = new Vector3();
  const b = {
    // a flat convex polygon, corners counter-clockwise seen from the front
    face(pts, col, uv = 1) {
      e1.subVectors(pts[1], pts[0]); e2.subVectors(pts[pts.length - 1], pts[0]); n.crossVectors(e1, e2).normalize();
      ax.copy(e1).normalize(); ay.crossVectors(n, ax);
      const base = P.length / 3;
      for (const p of pts) { P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); d.subVectors(p, pts[0]); U.push(d.dot(ax) * uv, d.dot(ay) * uv); C.push(col.r, col.g, col.b); }
      for (let i = 1; i < pts.length - 1; i++) I.push(base, base + i, base + i + 1);
      return b;
    },
    // a box w (along its own x) x h x d, its base centre at x, y0, z, turned ry about y
    box(x, y0, z, w, h, dd, ry, col, uv = 1, under = false) {
      const c = Math.cos(ry), s = Math.sin(ry), at = (lx, ly, lz) => new Vector3(x + lx * c + lz * s, y0 + ly, z - lx * s + lz * c), hw = w / 2, hd = dd / 2;
      const p = [at(-hw, 0, hd), at(hw, 0, hd), at(hw, h, hd), at(-hw, h, hd), at(hw, 0, -hd), at(-hw, 0, -hd), at(-hw, h, -hd), at(hw, h, -hd)];
      b.face([p[0], p[1], p[2], p[3]], col, uv).face([p[4], p[5], p[6], p[7]], col, uv).face([p[1], p[4], p[7], p[2]], col, uv).face([p[5], p[0], p[3], p[6]], col, uv).face([p[3], p[2], p[7], p[6]], col, uv);
      if (under) b.face([p[5], p[4], p[1], p[0]], col, uv);
      return b;
    },
    // a cylinder (or cone, r1 = 0) from centre c along unit axis a
    cyl(c, a, r0, r1, h, seg, col, uv = 1, caps = true) {
      const s1 = Math.abs(a.y) < .9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0), u = new Vector3().crossVectors(a, s1).normalize(), w = new Vector3().crossVectors(a, u);
      const ring = (r, t) => Array.from({ length: seg }, (_, i) => { const q = i / seg * TAU; return c.clone().addScaledVector(a, t).addScaledVector(u, Math.cos(q) * r).addScaledVector(w, Math.sin(q) * r); });
      const lo = ring(r0, 0), hi = ring(r1 || 1e-4, h);
      for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; b.face([lo[i], hi[i], hi[j], lo[j]], col, uv); }
      if (caps) { b.face([...lo], col, uv); if (r1 > 0) b.face([...hi].reverse(), col, uv); }
      return b;
    },
    // a pointed roof: seg flat sides from a ring of radius r up to a point h above its middle, tiles in rows along each eave
    spire(x, y0, z, r, h, seg, col, uv = 1, turn = 0) {
      const top = new Vector3(x, y0 + h, z), at = i => new Vector3(x + Math.cos(turn + i / seg * TAU) * r, y0, z - Math.sin(turn + i / seg * TAU) * r);
      for (let i = 0; i < seg; i++) b.face([at(i), at(i + 1), top], col, uv);
      return b;
    },
    get empty() { return !P.length; },
    geo() {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeBoundingSphere(); return g;
    },
  };
  return b;
}
const PLASTER = ['#f1e7d0', '#ead7b0', '#e6cdb0', '#f3eee4', '#dfc39a', '#ead6c8', '#e2dccc'], PAINT = ['#56735f', '#5d7590', '#7b5a3e', '#465f46', '#8b8e84', '#6e4a3a'], ROOFS = ['#ffffff', '#f2dcd0', '#e4cbb6', '#fff2e2', '#d9c2b0'];
// painted textures (seeded, so the valley looks the same every time)
function villageTextures() {
  const R = rng(31);
  const blot = (g, S, n, dark, light, rr) => { for (let i = 0; i < n; i++) { const x = R() * S, y = R() * S, r = rr[0] + R() * rr[1], dk = R() < .6; for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, dk ? dark : light); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); } } };
  const plaster = surface(256, ({ col, h, size: S }) => {
    col.fillStyle = '#ddd6c8'; col.fillRect(0, 0, S, S); blot(col, S, 22, 'rgba(110,95,70,.07)', 'rgba(255,252,244,.1)', [12, 40]);
    speckle(col, S, 1600, '#968b7a', 1.3, .22); speckle(h, S, 2800, '#000', 1.2, .35); speckle(h, S, 900, '#fff', 1.4, .3);
    h.strokeStyle = '#3338'; h.lineWidth = 1; for (let i = 0; i < 6; i++) { let x = R() * S, y = R() * S; h.beginPath(); h.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (R() - .5) * 14; y += 4 + R() * 8; h.lineTo(x, y); } h.stroke(); }
  }, { strength: 1.6 });
  const tiles = surface(512, ({ col, h, size: S }) => {
    const rows = 8, per = 10, th = S / rows, tw = S / per, grey = q => `rgb(${q = Math.round(q * 255)},${q},${q})`;
    for (let j = 0; j < rows; j++) for (let i = -1; i <= per; i++) {
      const x = (i + (j % 2) * .5) * tw, y = j * th, hue = 10 + R() * 12, sat = 40 + R() * 20, l = 30 + R() * 13;
      const g = col.createLinearGradient(x, 0, x + tw, 0); g.addColorStop(0, `hsl(${hue},${sat}%,${l * .7}%)`); g.addColorStop(.42, `hsl(${hue},${sat}%,${l * 1.1}%)`); g.addColorStop(1, `hsl(${hue},${sat}%,${l * .66}%)`);   // (the barrel's own shading, kept gentle: strong stripes this fine shimmer through a swaying scope)
      col.fillStyle = g; col.fillRect(x, y, tw, th);
      // height (read by the roofs' depth): a round barrel across each tile
      const hg = h.createLinearGradient(x, 0, x + tw, 0); for (let k = 0; k <= 8; k++) hg.addColorStop(k / 8, grey(.16 + .84 * Math.sqrt(1 - (k / 4 - 1) ** 2))); h.fillStyle = hg; h.fillRect(x, y, tw, th);
    }
    // each row laps over the one below: it rises toward its lower end, drops at its lip and shades the tile under it
    for (let j = 0; j < rows; j++) {
      const y = j * th, lap = h.createLinearGradient(0, y, 0, y + th), sh = col.createLinearGradient(0, y, 0, y + 10);
      lap.addColorStop(0, 'rgba(0,0,0,.5)'); lap.addColorStop(1, 'rgba(0,0,0,0)'); h.fillStyle = lap; h.fillRect(0, y, S, th);
      sh.addColorStop(0, 'rgba(24,10,4,.46)'); sh.addColorStop(1, 'rgba(24,10,4,0)'); col.fillStyle = sh; col.fillRect(0, y, S, 10);
    }
    speckle(col, S, 2400, '#2e2216', 2, .3); blot(col, S, 10, 'rgba(70,84,40,.35)', 'rgba(60,70,36,.25)', [8, 20]);
  }, { strength: 3.6 });
  const stone = surface(256, ({ col, h, size: S }) => {
    col.fillStyle = '#5a554c'; col.fillRect(0, 0, S, S); h.fillStyle = '#1a1a1a'; h.fillRect(0, 0, S, S);
    for (let y = 0; y < S;) {
      const rh = y > S - 44 ? S - y : 18 + R() * 16; let x = -R() * 30;
      while (x < S) {
        const bw = 26 + R() * 36, l = 38 + R() * 24, c = `hsl(${32 + R() * 14},${5 + R() * 9}%,${l}%)`;
        for (const ox of [0, -S, S]) { col.fillStyle = c; col.beginPath(); col.roundRect(x + ox + 1.5, y + 1.5, bw - 3, rh - 3, 4); col.fill(); h.fillStyle = `rgb(${190 + R() * 50},${190 + R() * 50},${190 + R() * 50})`; h.beginPath(); h.roundRect(x + ox + 2.5, y + 2.5, bw - 5, rh - 5, 5); h.fill(); }
        x += bw;
      }
      y += rh;
    }
    speckle(col, S, 900, '#2a2620', 1.3, .3); speckle(col, S, 500, '#d8d0c0', 1.1, .2); blot(col, S, 8, 'rgba(60,72,34,.3)', 'rgba(40,36,30,.25)', [8, 20]);
  });
  const boards = surface(128, ({ col, h, size: S }) => {
    col.fillStyle = '#c4b49c'; col.fillRect(0, 0, S, S); h.fillStyle = '#909090'; h.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 16) { col.fillStyle = 'rgba(40,28,18,.6)'; col.fillRect(x, 0, 1.5, S); h.fillStyle = '#222'; h.fillRect(x, 0, 2, S); }
    for (let i = 0; i < 90; i++) { col.fillStyle = `rgba(70,50,32,${R() * .25})`; col.fillRect(R() * S, 0, .8 + R() * 1.4, S); }
    speckle(col, S, 200, '#5a4632', 1.2, .3);
  });
  const straw = surface(128, ({ col, h, size: S }) => {
    col.fillStyle = '#b8a066'; col.fillRect(0, 0, S, S); h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) { const x = R() * S, y = R() * S, a = (R() - .5) * .8 + Math.PI / 2, l = 6 + R() * 10; col.strokeStyle = `hsl(${40 + R() * 12},${35 + R() * 25}%,${32 + R() * 32}%)`; h.strokeStyle = R() < .5 ? '#bbb' : '#444'; for (const g of [col, h]) { g.lineWidth = 1 + R(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } }
  });
  return { plaster, tiles, stone, boards, straw };
}

let WD = null;
function world() {
  if (WD) return WD;
  human.need(looksOf(LOOKS.both));   // the people first: if this phone hasn't sculpted them yet the app waits here, before anything else is built (each mission's own: see WD.regions)
  const v = new HDView({ bg: '#c9c3b2', env: .55, sky: '#c8d2e0', ground: '#4a4434', amb: .42, fov: 62 });
  v.cam.near = .3; v.cam.far = 1600; v.cam.updateProjectionMatrix();
  v.exposure = 1; v.bloom = .3;
  const sl = sun('#fff0d8', 2.8, 34, [.9, .35, -.3]); v.scene.add(sl, sl.target); v.onTier(T => { sl.setTier(T); WD?.meadow?.(T); });
  v.sun = sl;
  sl.softShadows(1.4);   // shadows sharp where they touch and soft further out (WebGPU)
  // the eye adapts a little: dazzled facing the low sun, opening up into the dark of the woods
  v.autoExposure = { amount: .45, min: .75, max: 1.45, speed: .9, darken: 2 };
  // the air (haze, valley mist, cloud shadows, rain): on from the start, each mission sets its own
  v.air(MOODS.m1.air);

  // ---- land, with the nests and the village levelled, painted by the ground shader
  const tex = groundDetail();
  const land = new Land({ kind: shape, size: 640, segments: 128, material: groundMat(tex) });
  for (const n of Object.values(NESTS)) land.flatten(n.x, n.z, 5, undefined, n === NESTS.tower ? 3.5 : 6);   // (the water tower stands by the railway: its level ground stops short of the track's bed)
  land.flatten(MILL.x, MILL.z - 3, 9, 4.2, 6);
  land.masks(groundMasks);
  v.scene.add(land.object);
  land.wind = AIR;
  v.scene.add(horizon(land, { inner: 300, outer: 1300, segments: 144, rings: 20, lower: (x, z) => z > 0 && Math.abs(x) < 400 ? .55 : 0 }));   // far hills, lower to the south

  // the river and the lake: dark water with ripples that catch the sky
  const waterMat = (col, rep) => {
    const n = tex.ripple.clone(); n.repeat.set(rep, rep); n.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ color: col, roughness: .14, metalness: 0, normalMap: n, normalScale: new THREE.Vector2(.6, .6), transparent: true, opacity: .96, envMapIntensity: .45 });
  };
  const river = new Water({ level: -1.4, waves: .08, size: 640, segments: 40, material: waterMat('#1c2824', 70) });
  v.scene.add(river.mesh);
  const lake = new Water({ level: LAKE, waves: .1, size: 96, segments: 16, material: waterMat('#283639', 10) });
  lake.mesh.position.set(STREAMX, 0, -254); lake.mesh.scale.x = .72; v.scene.add(lake.mesh);   // (from the dam's face up the basin, no wider than the dam)
  const ripples = [river.mesh.material.normalMap, lake.mesh.material.normalMap];

  // ---- materials (built once)
  const VT = villageTextures(), { plaster, tiles, stone } = VT;
  const wood = surface(128, ({ col, h, size: S }) => { col.fillStyle = '#6b4a30'; col.fillRect(0, 0, S, S); for (let i = 0; i < 40; i++) { col.fillStyle = `rgba(30,18,10,${Math.random() * .3})`; col.fillRect(0, Math.random() * S, S, 1 + Math.random() * 2); } h.fillStyle = '#888'; h.fillRect(0, 0, S, S); });
  // the track's bed: broken grey stone, each piece with its own shade and height
  const gravel = surface(128, ({ col, h, r, size: S }) => {
    const R = rng(41); col.fillStyle = '#6f6a62'; col.fillRect(0, 0, S, S); h.fillStyle = '#505050'; h.fillRect(0, 0, S, S); r.fillStyle = '#e8e8e8'; r.fillRect(0, 0, S, S);
    for (let i = 0; i < 700; i++) { const x = R() * S, y = R() * S, a = 2 + R() * 3.4, b = a * (.55 + R() * .4), t = R() * 3.14, l = 105 + R() * 75, w = R() * 14 - 4, hh = 120 + R() * 130 | 0;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { if (x + ox < -8 || x + ox > S + 8 || y + oy < -8 || y + oy > S + 8) continue;
        col.fillStyle = `rgb(${l + w | 0},${l | 0},${l - w * 1.3 | 0})`; col.beginPath(); col.ellipse(x + ox, y + oy, a, b, t, 0, 6.3); col.fill();
        h.fillStyle = `rgb(${hh},${hh},${hh})`; h.beginPath(); h.ellipse(x + ox, y + oy, a * .85, b * .85, t, 0, 6.3); h.fill(); } }
  }, { strength: 3 });
  // the stone stands out from its mortar as you look across it (parallax occlusion, WebGPU)
  const M = {
    wall: pbr('#ffffff', { tex: plaster, rep: [2, 2], rough: .92 }),
    stone: pbr('#d8d2c6', { tex: stone, rough: .9, depth: .035 }), wood: pbr('#ffffff', { tex: wood, rough: .85 }),
    // the village's own: the textures tinted by each part's colour
    wallV: pbr('#ffffff', { tex: plaster, rough: .93, vertexColors: true }), roofV: pbr('#ffffff', { tex: tiles, rough: .78, vertexColors: true, depth: .024 }),
    stoneV: pbr('#ffffff', { tex: stone, rough: .9, vertexColors: true, depth: .035 }), woodV: pbr('#ffffff', { tex: VT.boards, rough: .82, vertexColors: true }),
    strawV: pbr('#ffffff', { tex: VT.straw, rough: 1, vertexColors: true }), lit: pbr('#2a2018', { rough: .3, glow: 0, glowCol: '#ffb860' }),
    glass: pbr('#1a2128', { rough: .15, metal: .4, glow: 0, glowCol: '#ffb860' }), iron: pbr('#3a3c3e', { rough: .45, metal: .8 }),
    rail: pbr('#8d8a86', { rough: .42, metal: .9 }), rust: pbr('#4d3527', { rough: .9, metal: .25 }), sleeper: pbr('#ffffff', { tex: wood, rough: .92 }), ballast: pbr('#ffffff', { tex: gravel, rough: 1, vertexColors: true }), dark: pbr('#24221f', { rough: .8 }), sand: pbr('#a39270', { rough: 1 }),
    drum: pbr('#a8352a', { rough: .5, metal: .3, clear: .3 }), green: pbr('#4c5a32', { rough: .7 }), brass: pbr('#c8a24a', { rough: .25, metal: 1 }),
    cloth: pbr('#c9bc8e', { rough: 1, side: THREE.DoubleSide }), canvas: pbr('#5d6150', { rough: 1 }), lamp: pbr('#ffcf80', { glow: 3 }),
    plant: pbr('#ffffff', { vertexColors: true, rough: .9 }), rock: rockMat(tex),
  };
  M.glass.emissive = new Color('#ffb860'); M.glass.emissiveIntensity = 0; M.lit.emissive = new Color('#ffb060'); M.lit.emissiveIntensity = 0;
  WD = { v, sl, land, river, lake, M, ripples, lodK: 1, ground: (x, z) => Math.max(land.height(x, z), trackY(x, z)), chims: [], winSpots: [], deckY: bridgeDeck(land) };
  // real light from lit windows at dusk (mood() turns the pool on; draw() moves it to the windows nearest where you look)
  v.lampLights(6.5); for (const l of v.lamps) l.visible = false;
  const solids = WD.solids = [];   // boxes that stop bullets: { x0, y0, z0, x1, y1, z1, kind }
  const box = (x, y, z, w, h, d, kind = 'wall') => solids.push({ x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + h, z0: z - d / 2, z1: z + d / 2, kind });
  // stone keeps its size on a tower and on a kerb: each face of a block is mapped in metres along its own plane
  const metres = (g, k = .5) => {
    const q = g.attributes.position, nn = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < q.count; i++) { const ax = Math.abs(nn.getX(i)), ay = Math.abs(nn.getY(i)), az = Math.abs(nn.getZ(i)); if (ay >= ax && ay >= az) uv.setXY(i, q.getX(i) * k, q.getZ(i) * k); else if (ax >= az) uv.setXY(i, q.getZ(i) * k, q.getY(i) * k); else uv.setXY(i, q.getX(i) * k, q.getY(i) * k); }
    uv.needsUpdate = true; return g;
  };
  const mesh = (geo, mat, x, y, z, ry = 0) => { const m = new Mesh(mat === M.stone ? metres(geo) : geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; v.scene.add(m); return m; };
  const ground = (x, z) => land.height(x, z);

  // ---- the village: plastered houses on stone plinths, tile roofs with deep eaves, shutters, chimneys,
  // doors, carts, barrels and hay, all merged into one mesh per material
  const K = { wall: solid(), roof: solid(), wood: solid(), stone: solid(), glass: solid(), lit: solid(), straw: solid(), ballast: solid() }, HR = rng(17), pick = a => a[HR() * a.length | 0];
  const o = new Object3D();
  const C_ = c => new Color(c), DARKWOOD = C_('#6a5444'), BEAM = C_('#5a4636'), SILL = C_('#cfc8bb'), WHITE = C_('#ffffff');
  const UP = new Vector3(0, 1, 0);
  // a gabled building: walls (kit kw, colour wc) w long and d deep, h to the eaves, ridge along its length
  function gabled(x, z, w, d, h, ry, { kw = K.wall, wc, roof = C_(pick(ROOFS)), y0 = ground(x, z) - .5, plinth = true, pitch = .42, eave = .5, verge = .35 } = {}) {
    const c = Math.cos(ry), s = Math.sin(ry), at = (lx, ly, lz) => new Vector3(x + lx * c + lz * s, y0 + ly, z - lx * s + lz * c);
    const top = h + .5, rise = d * pitch, slope = rise / (d / 2), t = .16;
    kw.box(x, y0, z, w, top, d, ry, wc, .33);
    kw.face([at(w / 2, top, d / 2), at(w / 2, top, -d / 2), at(w / 2, top + rise, 0)], wc, .33).face([at(-w / 2, top, -d / 2), at(-w / 2, top, d / 2), at(-w / 2, top + rise, 0)], wc, .33);
    if (plinth) K.stone.box(x, y0 - .4, z, w + .18, 1.3, d + .18, ry, SILL, .5);
    const eY = top - eave * slope, rY = top + rise + .05, X = w / 2 + verge, Z = d / 2 + eave;
    K.roof.face([at(-X, eY, Z), at(X, eY, Z), at(X, rY, 0), at(-X, rY, 0)], roof, .38).face([at(X, eY, -Z), at(-X, eY, -Z), at(-X, rY, 0), at(X, rY, 0)], roof, .38);
    K.wood.face([at(X, eY - t, Z), at(-X, eY - t, Z), at(-X, rY - t, 0), at(X, rY - t, 0)], BEAM, .5).face([at(-X, eY - t, -Z), at(X, eY - t, -Z), at(X, rY - t, 0), at(-X, rY - t, 0)], BEAM, .5);
    K.wood.face([at(-X, eY - t, Z), at(X, eY - t, Z), at(X, eY, Z), at(-X, eY, Z)], DARKWOOD, .5).face([at(X, eY - t, -Z), at(-X, eY - t, -Z), at(-X, eY, -Z), at(X, eY, -Z)], DARKWOOD, .5);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const a = at(sx * X, eY - t, sz * Z), b = at(sx * X, rY - t, 0), cc = at(sx * X, rY, 0), dd = at(sx * X, eY, sz * Z); K.wood.face(sx * sz > 0 ? [a, b, cc, dd] : [b, a, dd, cc], DARKWOOD, .5); }
    const ridge = at(0, 0, 0); K.roof.box(ridge.x, rY - .1, ridge.z, X * 2, .2, .34, ry, roof.clone().multiplyScalar(.75), .38);
    return { at, top, rise, rY, slope };
  }
  const house = (x, z, w, d, h, turned, { mill = false } = {}) => {
    const ry = turned ? Math.PI / 2 : 0, wc = C_(pick(PLASTER)), paint = C_(pick(PAINT)), y0 = ground(x, z) - .5;
    const g = gabled(x, z, w, d, h, ry, { wc, y0 });
    const { at, top, rise } = g;
    // the chimney through the roof
    const chx = (HR() - .5) * w * .5, chz = -d * .2, ch = at(chx, 0, chz);
    K.stone.box(ch.x, y0 + top + rise * .2, ch.z, .72, rise * .8 + 1.1, .72, ry, C_('#c9c0b2'), .5).box(ch.x, y0 + top + rise + 1.3, ch.z, .92, .14, .92, ry, C_('#a8a094'), .5);
    WD.chims.push([ch.x, y0 + top + rise + 1.5, ch.z]);
    // windows with frames, sills and shutters (some lit at dusk); a door at the front
    const floors = h >= 5.5 ? [1.45, 4.05] : [1.6], n = Math.max(2, Math.floor(w / 3)), doorAt = HR() * n | 0;
    for (const sz of [-1, 1]) for (const fy of floors) for (let i = 0; i < n; i++) {
      const lx = (i - (n - 1) / 2) * (w / n), wz = sz * d / 2, p = at(lx, 0, wz);
      if (mill && sz > 0 && fy === floors[1] && i === (n - 1) / 2) {
        // the mill's balcony door, open onto the dark inside: the radio man goes in and out of it
        const dk = C_('#120e0b'), q = (a, b2) => at(lx + a, b2, wz + .02);
        K.wood.face([q(-.52, 3.8), q(.52, 3.8), q(.52, 5.95), q(-.52, 5.95)], dk, 1);
        for (const sx of [-1, 1]) { const fp = at(lx + sx * .6, 0, wz); K.wood.box(fp.x, y0 + 3.8, fp.z, .14, 2.3, .16, ry, C_('#e8e2d6'), .5); }
        const lt = at(lx, 0, wz); K.wood.box(lt.x, y0 + 5.95, lt.z, 1.36, .16, .18, ry, C_('#e8e2d6'), .5);
        const leaf = at(lx - .5, 0, wz - .5); K.wood.box(leaf.x, y0 + 3.82, leaf.z, .06, 2.1, 1, ry, C_('#5c4430'), .5);   // the door, swung in against the jamb
        WD.millDoor = { x: lx + x, z: z + wz, y: y0 + 3.8 };
        continue;
      }
      if (sz > 0 && fy === floors[0] && i === doorAt) {
        K.wood.box(p.x, y0 + .75, p.z, 1.15, 2.25, .14, ry, C_('#5c4430'), .5).box(p.x, y0 + .75, p.z, 1.45, 2.45, .08, ry, SILL, .5);
        const st = at(lx, 0, wz + .45); K.stone.box(st.x, y0 + .3, st.z, 1.6, .5, .8, ry, SILL, .5);
        continue;
      }
      K.wood.box(p.x, y0 + fy - .1, p.z, 1.02, 1.3, .1, ry, C_('#e8e2d6'), .5);
      const zq = wz + sz * .056, q = (a, b2) => at(lx + a, fy + b2, zq), lit = !mill && HR() < .45;
      (lit ? K.lit : K.glass).face(sz > 0 ? [q(-.4, 0), q(.4, 0), q(.4, 1.1), q(-.4, 1.1)] : [q(.4, 0), q(-.4, 0), q(-.4, 1.1), q(.4, 1.1)], WHITE, 1);
      const sl = at(lx, 0, wz + sz * .08); K.stone.box(sl.x, y0 + fy - .16, sl.z, 1.12, .08, .22, ry, SILL, .5);
      const shut = HR() < .18;
      if (lit && !shut) { const o = at(lx, fy + .5, wz + sz * .35); WD.winSpots.push({ x: o.x, y: o.y, z: o.z, col: '#ffb468', i: WIN_LIGHT }); }   // (its light, just outside the glass)
      for (const sx of [-1, 1]) { const sp = at(lx + sx * (shut ? .2 : .64), 0, wz + sz * .07); K.wood.box(sp.x, y0 + fy - .03, sp.z, .42, 1.16, .05, ry, paint, .6); }
    }
    box(x, y0 + .1, z, turned ? d : w, h + .4, turned ? w : d, 'house');
    return g;
  };
  for (const hs of HOUSES) house(...hs);
  // the mill (with the radio post on its balcony)
  house(MILL.x, MILL.z, 11, 8, 8, 0, { mill: true });
  // the village square: a well, carts, barrels, crates; hay by the farms
  const cart = (x, z, ry, load) => {
    const c = Math.cos(ry), s = Math.sin(ry), at = (lx, ly, lz) => new Vector3(x + lx * c + lz * s, ground(x, z) + ly, z - lx * s + lz * c), y = ground(x, z), wc = C_('#7a6048');
    K.wood.box(x, y + .78, z, 2.6, .12, 1.4, ry, wc, .6);
    for (const sz of [-1, 1]) { const p = at(0, 0, sz * .66); K.wood.box(p.x, y + .9, p.z, 2.6, .34, .07, ry, wc, .6); }
    for (const sz of [-1, 1]) K.wood.cyl(at(-.2, .58, sz * .8), new Vector3(s * sz, 0, c * sz), .58, .58, .1, 12, C_('#5e4834'), .6);
    for (const sz of [-1, 1]) { const a = at(1.3, .85, sz * .5), b = at(3.3, .45, sz * .35); const dir = b.clone().sub(a), L = dir.length(); K.wood.cyl(a, dir.normalize(), .05, .04, L, 5, wc, .6, false); }
    if (load === 'hay') K.straw.cyl(at(0, .9, 0), UP, .95, .55, .9, 10, WHITE, .7);
    if (load === 'barrels') for (const lx of [-.6, .6]) K.wood.cyl(at(lx, .84, 0), UP, .34, .34, .8, 10, C_('#8a6a48'), .6);
  };
  cart(-31, -100, .5, 'hay'); cart(12, -112, 2.2, 'barrels'); cart(48, -92, -.4, null); cart(MILL.x - 9, MILL.z + 9, 1.2, 'barrels'); cart(-70, -96, 1.9, 'hay');
  { const wy = ground(-6, -104), wp = new Vector3(-6, wy, -104); K.stone.cyl(wp, UP, 1.1, 1.1, .95, 14, C_('#cfc6b8'), .5); for (const sx of [-1, 1]) K.wood.box(-6 + sx * .95, wy, -104, .14, 2.4, .14, 0, BEAM, .5); K.roof.box(-6, wy + 2.35, -104, 2.4, .1, 1.5, 0, C_('#e8d0c0'), .38); }
  for (const [x, z, n] of [[-36, -88, 3], [16, -98, 2], [31, -120, 4], [-48, -122, 2], [MILL.x + 5, MILL.z + 6, 3], [-8, -86, 2]]) for (let i = 0; i < n; i++) {
    const bx = x + (i % 2) * .8, bz = z + Math.floor(i / 2) * .8, y = ground(bx, bz);
    if (HR() < .5) K.wood.cyl(new Vector3(bx, y, bz), UP, .32, .32, .85, 10, C_('#8a6a48'), .6); else K.wood.box(bx, y, bz, .7, .7, .7, HR() * 3, C_('#9a8264'), .7);
  }
  // round haystacks in the fields north of the river and by the road east
  for (const [x, z] of [[-110, -40], [-104, -46], [-150, -20], [92, -110], [100, -104], [150, -112], [-160, 60], [-150, 70], [120, 60], [170, 30]]) {
    const y = ground(x, z); if (Math.abs(z - RIVER(x)) < 20) continue;
    K.straw.cyl(new Vector3(x, y - .1, z), UP, 1.9, 1.7, 1.6, 12, WHITE, .5).cyl(new Vector3(x, y + 1.5, z), UP, 1.7, 0, 1.5, 12, C_('#d8ccb0'), .5, false);
  }
  const millY = ground(MILL.x, MILL.z);
  { // the balcony: plank deck on joists, braced into the wall, a rail with turned balusters, and the radio set on a crate
    const top = millY + 3.3, fz = MILL.z + 4, D = 1.5, Wd = 8.6, x0 = MILL.x, PLANK = C_('#7a6048'), RAIL = C_('#6a5040');
    WD.millDeck = top;
    K.wood.box(x0, top - .14, fz + D / 2, Wd, .14, D, 0, PLANK, .6, true);
    for (let i = 0; i < 5; i++) { const jx = x0 - Wd / 2 + .2 + i * (Wd - .4) / 4; K.wood.box(jx, top - .36, fz + D / 2, .14, .22, D, 0, BEAM, .5, true);
      const a = new Vector3(jx, top - 1.5, fz + .02), b2 = new Vector3(jx, top - .3, fz + D - .15), dir = b2.clone().sub(a), L = dir.length(); K.wood.cyl(a, dir.normalize(), .07, .07, L, 5, BEAM, .5, false); }
    const rail = (ax, az, bx, bz) => {
      const L = Math.hypot(bx - ax, bz - az), ry2 = Math.atan2(bx - ax, bz - az) + Math.PI / 2, mx = (ax + bx) / 2, mz = (az + bz) / 2;
      K.wood.box(mx, top + .98, mz, L + .1, .08, .12, ry2, RAIL, .6).box(mx, top + .12, mz, L, .07, .09, ry2, RAIL, .6);
      for (let k = 0, n = Math.round(L / .2); k <= n; k++) { const bx2 = ax + (bx - ax) * k / n, bz2 = az + (bz - az) * k / n; K.wood.box(bx2, top + .19, bz2, .045, .79, .045, ry2, PLANK, .6); }
    };
    rail(x0 - Wd / 2 + .06, fz + D - .06, x0 + Wd / 2 - .06, fz + D - .06); rail(x0 - Wd / 2 + .06, fz + .1, x0 - Wd / 2 + .06, fz + D - .06); rail(x0 + Wd / 2 - .06, fz + .1, x0 + Wd / 2 - .06, fz + D - .06);
    for (const px of [-Wd / 2 + .06, -1.5, 1.5, Wd / 2 - .06]) K.wood.box(x0 + px, top, fz + D - .06, .13, 1.1, .13, 0, BEAM, .5);
    K.wood.box(x0 - 3.4, top, fz + .5, .62, .55, .55, .2, C_('#8a6e50'), .7).box(x0 - 3.4, top + .55, fz + .5, .46, .3, .3, .2, C_('#3e4436'), .8);
    box(x0, top - .4, fz + D / 2, Wd, .4, D, 'low');
  }
  // the water wheel: iron-bound rims, spokes and paddles round a hub, turning on its axle (x)
  const wb = baker(false, true), WET = '#6a5440', IRON = '#3c3a38', Zr = Math.PI / 2;
  wb.add(new CylinderGeometry(.38, .38, 1.5, 12), IRON, [0, 0, 0], { r: [0, 0, Zr] }).add(new CylinderGeometry(.1, .1, 2.6, 8), IRON, [0, 0, 0], { r: [0, 0, Zr] });
  for (const sx of [-.55, .55]) {
    wb.add(new THREE.TorusGeometry(3.05, .11, 6, 36), WET, [sx, 0, 0], { r: [0, Zr, 0], uv: [6, 1] }).add(new THREE.TorusGeometry(3.12, .05, 4, 36), IRON, [sx, 0, 0], { r: [0, Zr, 0] });
    for (let k = 0; k < 6; k++) wb.add(new BoxGeometry(.12, 6, .14), WET, [sx, 0, 0], { r: [k * Math.PI / 6, 0, 0], uv: [.3, 3] });
  }
  for (let k = 0; k < 18; k++) { const a = k * TAU / 18; wb.add(new BoxGeometry(1.3, .8, .07), WET, [0, Math.cos(a) * 3.1, Math.sin(a) * 3.1], { r: [a, 0, 0], uv: [1, .5] }); }
  const wheel = new Mesh(wb.geo(), M.woodV); wheel.castShadow = wheel.receiveShadow = true; wheel.position.set(MILL.x + 7, millY + 1.2, MILL.z + 1); v.scene.add(wheel); WD.wheel = wheel;
  { // the outer axle pier, and a stone trough of water the wheel turns in
    const tx = MILL.x + 7, tz = MILL.z + 1, SC = C_('#bdb6aa');
    K.stone.box(MILL.x + 8.5, millY - 1.5, tz, .7, 2.6, .9, 0, SC, .5);
    for (const [x, z, w, d] of [[tx - .95, tz, .3, 8], [tx + .95, tz, .3, 8], [tx, tz - 3.85, 1.6, .3], [tx, tz + 3.85, 1.6, .3]]) K.stone.box(x, millY - .15, z, w, .9, d, 0, SC, .5);
    const wm = waterMat('#22302c', 2), pool = mesh(new PlaneGeometry(1.6, 7.4), wm, tx, millY + .62, tz); pool.rotation.x = -Math.PI / 2; pool.castShadow = false; ripples.push(wm.normalMap);
  }
  const mast = mesh(new CylinderGeometry(.06, .08, 9, 6), M.iron, MILL.x - 4, millY + 12, MILL.z - 2); void mast;
  WD.flagA = flag(v, M, MILL.x + 4, millY + 8.4 + 3.4, MILL.z - 3);

  // church and tower (the M2 marksman sits in the belfry)
  const cy = ground(CHURCH.x, CHURCH.z) - .3;
  gabled(CHURCH.x, CHURCH.z, 18, 9, 8.5, Math.PI / 2, { kw: K.stone, wc: C_('#e2dacb'), y0: cy, plinth: false, pitch: .55, roof: C_('#ead2c2') }); box(CHURCH.x, cy, CHURCH.z, 9, 9, 18, 'stone');
  for (const sx of [-1, 1]) for (const z of [-4, 0, 4]) { const wz = CHURCH.z + z, wx = CHURCH.x + sx * 4.53; K.glass.face(sx > 0 ? [V3(wx, cy + 3, wz + .5), V3(wx, cy + 3, wz - .5), V3(wx, cy + 6.4, wz - .5), V3(wx, cy + 6.4, wz + .5)] : [V3(wx, cy + 3, wz - .5), V3(wx, cy + 3, wz + .5), V3(wx, cy + 6.4, wz + .5), V3(wx, cy + 6.4, wz - .5)], WHITE); }
  mesh(rbox(5, 17, 5, .08), M.stone, CHURCH.x, cy + 8.5, CHURCH.tz); box(CHURCH.x, cy, CHURCH.tz, 5, 17, 5, 'stone');
  for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) mesh(new BoxGeometry(.6, 4, .6), M.stone, CHURCH.x + dx, cy + 19, CHURCH.tz + dz);
  mesh(new BoxGeometry(5.4, .6, 5.4), M.stone, CHURCH.x, cy + 21.2, CHURCH.tz); box(CHURCH.x, cy + 20.9, CHURCH.tz, 5.4, .6, 5.4, 'stone');
  K.roof.spire(CHURCH.x, cy + 21.5, CHURCH.tz, 3.6, 7, 4, WHITE, .38, Math.PI / 4);
  WD.bell = mesh(new CylinderGeometry(.35, .8, 1.1, 12, 1, true), M.brass, CHURCH.x, cy + 20, CHURCH.tz);
  WD.churchTop = { x: CHURCH.x, y: cy + 17, z: CHURCH.tz };

  // the stone road bridge: a humped deck that meets the road at both banks, two river arches on a
  // pier with cutwaters, arch rings, a string course and parapets with coping
  {
    const deckY = bridgeDeck(land), bx = BRIDGE.x, HW = 3.4, IN = 2.95, PAR = 1, SC = C_('#cfc6b6'), RING = C_('#e2dacb'), ROAD = C_('#9d9282'), CAP = C_('#ddd5c6');
    const soffit = z => { for (const a of BRIDGE.arches) { const u = (z - a.c) / a.hw; if (Math.abs(u) < 1) return a.spring + a.rise * Math.sqrt(1 - u * u); } return null; };
    const P = (x, y, z) => new Vector3(x, y, z), st = .5;
    for (let z0 = BRIDGE.z0; z0 < BRIDGE.z1 - 1e-6; z0 += st) {
      const z1 = Math.min(BRIDGE.z1, z0 + st), y0 = deckY(z0), y1 = deckY(z1);
      const b0 = soffit(z0) ?? Math.min(ground(bx, z0), y0) - .8, b1 = soffit(z1) ?? Math.min(ground(bx, z1), y1) - .8;
      K.stone.face([P(bx - IN, y0, z0), P(bx - IN, y1, z1), P(bx + IN, y1, z1), P(bx + IN, y0, z0)], ROAD, .5);                    // the road
      for (const sx of [-1, 1]) {
        const xo = bx + sx * HW, xi = bx + sx * IN, f = (pts) => K.stone.face(sx > 0 ? pts : [pts[1], pts[0], pts[3], pts[2]], SC, .5);
        f([P(xo, b1, z1), P(xo, b0, z0), P(xo, y0 + PAR, z0), P(xo, y1 + PAR, z1)]);      // outer wall
        K.stone.face(sx > 0 ? [P(xi, y0, z0), P(xi, y1, z1), P(xi, y1 + PAR, z1), P(xi, y0 + PAR, z0)] : [P(xi, y1, z1), P(xi, y0, z0), P(xi, y0 + PAR, z0), P(xi, y1 + PAR, z1)], SC, .5);   // parapet, inside
        const xa = bx + sx * (HW + .08), xb = bx + sx * (IN - .05);                                                         // the coping on top
        K.stone.face(sx > 0 ? [P(xb, y0 + PAR + .12, z0), P(xb, y1 + PAR + .12, z1), P(xa, y1 + PAR + .12, z1), P(xa, y0 + PAR + .12, z0)] : [P(xa, y0 + PAR + .12, z0), P(xa, y1 + PAR + .12, z1), P(xb, y1 + PAR + .12, z1), P(xb, y0 + PAR + .12, z0)], CAP, .5);
        K.stone.face(sx > 0 ? [P(xa, y1 + PAR, z1), P(xa, y0 + PAR, z0), P(xa, y0 + PAR + .12, z0), P(xa, y1 + PAR + .12, z1)] : [P(xa, y0 + PAR, z0), P(xa, y1 + PAR, z1), P(xa, y1 + PAR + .12, z1), P(xa, y0 + PAR + .12, z0)], CAP, .5);
        const xs = bx + sx * (HW + .07);                                                                                    // string course under the parapet
        K.stone.face(sx > 0 ? [P(xs, y1 - .32, z1), P(xs, y0 - .32, z0), P(xs, y0 - .14, z0), P(xs, y1 - .14, z1)] : [P(xs, y0 - .32, z0), P(xs, y1 - .32, z1), P(xs, y1 - .14, z1), P(xs, y0 - .14, z0)], CAP, .5);
        if (soffit(z0) != null && soffit(z1) != null) {                                                                     // the arch ring, standing proud of the wall
          const xr = bx + sx * (HW + .06), r0 = Math.min(b0 + .55, y0 - .4), r1 = Math.min(b1 + .55, y1 - .4);
          K.stone.face(sx > 0 ? [P(xr, b1, z1), P(xr, b0, z0), P(xr, r0, z0), P(xr, r1, z1)] : [P(xr, b0, z0), P(xr, b1, z1), P(xr, r1, z1), P(xr, r0, z0)], RING, .5);
        }
      }
      if (soffit(z0) != null && soffit(z1) != null) K.stone.face([P(bx - HW, b0, z0), P(bx + HW, b0, z0), P(bx + HW, b1, z1), P(bx - HW, b1, z1)], SC, .5);   // the arch's underside
      if (Math.round(z0 * 2) % 8 === 0) { const zm = (z0 + z1) / 2, ym = deckY(zm); box(bx, ym - 2.2, zm, HW * 2, 2.2, 4, 'stone'); for (const sx of [-1, 1]) box(bx + sx * (HW - .2), ym, zm, .45, PAR, 4, 'low'); }
    }
    for (const ze of [BRIDGE.z0, BRIDGE.z1]) for (const sx of [-1, 1]) K.stone.box(bx + sx * (HW + IN) / 2, deckY(ze) - .2, ze, .62, PAR + .5, .62, 0, CAP, .5);   // end posts
    // the pier's cutwaters, pointing up and down the river
    for (const a of [BRIDGE.pier]) for (const sx of [-1, 1]) {
      K.stone.box(bx + sx * HW, a.y0, a.z, 1.4, a.h, 1.4, Math.PI / 4, SC, .5);
      K.stone.cyl(new Vector3(bx + sx * HW, a.y0 + a.h, a.z), UP, 1, 0, 1.3, 4, CAP, .5, false);
    }
  }

  // the railway: a bed of broken stone with sloping shoulders, tarred sleepers bedded in it (no two quite alike),
  // rails with a foot, a web and a head worn bright, planks where the road crosses, and the iron bridge over the stream
  { const GREY = C_('#b9b4aa'), y0 = RAILH - .24, y1 = RAILH - .03, P = (x, y, dz) => new Vector3(x, y, RAILZ + dz), B = K.ballast;
    for (const [xa, xb] of [[-318, STREAMX - 17], [STREAMX + 17, 318]]) for (let x = xa; x < xb; x += 24) { const x2 = Math.min(xb, x + 24);
      B.face([P(x, y1, 1.55), P(x2, y1, 1.55), P(x2, y1, -1.55), P(x, y1, -1.55)], GREY, .55)
        .face([P(x, y0, 2.1), P(x2, y0, 2.1), P(x2, y1, 1.55), P(x, y1, 1.55)], GREY, .55).face([P(x, y1, -1.55), P(x2, y1, -1.55), P(x2, y0, -2.1), P(x, y0, -2.1)], GREY, .55); }
    const xa = CROSSX - 3.2, xb = CROSSX + 3.2, top = RAILH + .215, yb = RAILH - .24, DIRT = C_('#8a7f6c'), PL = C_('#5a4a3c');
    B.face([P(xa, yb, 3.3), P(xb, yb, 3.3), P(xb, top, 1.68), P(xa, top, 1.68)], DIRT, .55).face([P(xa, top, -1.68), P(xb, top, -1.68), P(xb, yb, -3.3), P(xa, yb, -3.3)], DIRT, .55);
    for (const [dz, d] of [[0, 1.28], [-1.22, .9], [1.22, .9]]) for (let i = 0; i < 4; i++) K.wood.box(CROSSX, RAILH + .05, RAILZ + dz + (i - 1.5) * d / 4, 6.4, .165 - (i % 2) * .008, d / 4 - .012, 0, PL, .6); }
  const sleepers = new InstancedMesh(new BoxGeometry(2.5, .13, .24), M.sleeper, 1000), SR = rng(5), sc = new Color(); let si = 0;
  for (let x = -318; x < 318; x += .65) { o.position.set(x + (SR() - .5) * .05, RAILH - (SR() * .012), RAILZ + (SR() - .5) * .05); o.rotation.set(0, Math.PI / 2 + (SR() - .5) * .035, 0); o.scale.set(1, 1, 1); o.updateMatrix(); sleepers.setMatrixAt(si, o.matrix); const l = .34 + SR() * .2; sleepers.setColorAt(si++, sc.setRGB(l, l * .92, l * .84)); }
  sleepers.count = si; sleepers.receiveShadow = true; v.scene.add(sleepers);
  for (const s of [-.7175, .7175]) for (const [w, hh, y, mat] of [[.068, .04, .195, M.rail], [.022, .09, .13, M.rust], [.13, .022, .076, M.rust]]) mesh(new BoxGeometry(636, hh, w), mat, 0, RAILH + y, RAILZ + s).castShadow = false;
  for (const s of [-1, 1]) { mesh(new BoxGeometry(34, .4, .4), M.iron, STREAMX, RAILH + 3.2, RAILZ + s * 2); for (let i = -4; i <= 4; i++) mesh(new BoxGeometry(.3, 3.2, .3), M.iron, STREAMX + i * 4, RAILH + 1.6, RAILZ + s * 2).rotation.z = i % 2 ? .6 : -.6; }
  mesh(new BoxGeometry(34, .5, 4.4), M.iron, STREAMX, RAILH - .3, RAILZ);
  for (const sd of [-1, 1]) K.stone.box(STREAMX + sd * 19.4, RAILH - 4.2, RAILZ, 5.2, 4.1, 5.6, 0, C_('#b9b2a4'), .5);   // its stone abutments, under the ends of the track's bed
  // the culvert where the east road crosses the stream: a stone face each side with the arch the water runs through
  {
    const cz = roadZ(STREAMX), bed = ground(STREAMX, cz + 12), hgt = ROADBANK - bed + .9;
    for (const sd of [-1, 1]) {
      const z = cz + sd * 7.6;
      mesh(rbox(18, hgt, 1.1, .15), M.stone, STREAMX, bed + hgt / 2 - .6, z);
      mesh(rbox(19, .35, 1.4, .1), M.stone, STREAMX, ROADBANK + .45, z);                                 // coping
      const arch = mesh(new CylinderGeometry(2.6, 2.6, 1.2, 18, 1, false, 0, Math.PI), M.dark, STREAMX, Math.max(bed, -1.4) - .5, z + sd * .02); arch.rotation.set(Math.PI / 2, 0, Math.PI / 2); arch.castShadow = false;
      for (const k of [-1, 1]) mesh(rbox(1.2, hgt * .8, 3.4, .1), M.stone, STREAMX + k * 9.6, bed + hgt * .4 - .6, z + sd * 1.1).rotation.y = k * sd * .5;   // wing walls
    }
  }
  // the water tower (M1's second nest)
  const tw = { x: NESTS.tower.x, z: NESTS.tower.z + 2.2 }, ty = ground(NESTS.tower.x, NESTS.tower.z);
  for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) mesh(new CylinderGeometry(.18, .22, 10, 6), M.iron, tw.x + dx, ty + 5, tw.z + dz);
  mesh(new CylinderGeometry(2.7, 2.7, 3.2, 20), M.wood, tw.x, ty + 11.4, tw.z);
  // the dam up the stream, holding the reservoir: a stone wall leaning back, buttresses down its face, a walk along
  // the crest between parapets and the valve house in the middle
  { const zc = -206, X0 = STREAMX - 35, X1 = STREAMX + 35, top = 14, base = -2, zb = zc - 3.5, zt = zc + 1.2, zf = zc + 6.5, DS = C_('#bdb6a8'), DK = C_('#9d978b'), CP = C_('#d6d0c2'), Q = (x, y, z) => new Vector3(x, y, z), S = K.stone;
    S.face([Q(X0, base, zf), Q(X1, base, zf), Q(X1, top, zt), Q(X0, top, zt)], DS, .5).face([Q(X1, base, zb), Q(X0, base, zb), Q(X0, top, zb), Q(X1, top, zb)], DK, .5)
      .face([Q(X0, top, zt), Q(X1, top, zt), Q(X1, top, zb), Q(X0, top, zb)], CP, .5)
      .face([Q(X0, base, zb), Q(X0, base, zf), Q(X0, top, zt), Q(X0, top, zb)], DK, .5).face([Q(X1, base, zf), Q(X1, base, zb), Q(X1, top, zb), Q(X1, top, zt)], DK, .5);
    for (let i = -3; i <= 3; i++) { const x = STREAMX + i * 10, a = x - 1.1, b = x + 1.1, y1 = top - 1.5, y2 = top - .9;
      S.face([Q(a, base, zf + 1.8), Q(b, base, zf + 1.8), Q(b, y1, zt + .9), Q(a, y1, zt + .9)], CP, .5).face([Q(a, y1, zt + .9), Q(b, y1, zt + .9), Q(b, y2, zt + .3), Q(a, y2, zt + .3)], CP, .5)
        .face([Q(a, base, zf), Q(a, base, zf + 1.8), Q(a, y1, zt + .9), Q(a, y2, zt + .3)], DK, .5).face([Q(b, base, zf + 1.8), Q(b, base, zf), Q(b, y2, zt + .3), Q(b, y1, zt + .9)], DK, .5); }
    S.box(STREAMX, top, zt - .2, 70, .95, .36, 0, CP, .5).box(STREAMX, top, zb + .2, 70, .95, .36, 0, CP, .5);
    S.box(STREAMX, top, zc - 1.1, 5, 3.3, 3.5, 0, DS, .5); K.roof.spire(STREAMX, top + 3.3, zc - 1.1, 3.6, 2.1, 4, C_('#e4cbb6'), .38, Math.PI / 4);
    K.wood.box(STREAMX, top, zc + .66, 1, 2, .06, 0, C_('#3c342c'), .5); for (const sx of [-1.6, 1.6]) K.glass.box(STREAMX + sx, top + 1.5, zc + .66, .7, .9, .05, 0, WHITE, 1); }
  // the chapel belfry on the south bank (M2's first nest)
  const ch = NESTS.chapel, chy = ground(ch.x, ch.z) - .2;
  mesh(rbox(4.4, 11, 4.4, .1), M.stone, ch.x, chy + 5.5, ch.z); box(ch.x, chy, ch.z, 4.4, 11, 4.4, 'stone');
  for (const [dx, dz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) mesh(new BoxGeometry(.5, 2.6, .5), M.stone, ch.x + dx, chy + 12.3, ch.z + dz);
  K.roof.spire(ch.x, chy + 13.6, ch.z, 3.4, 3.6, 4, WHITE, .38, Math.PI / 4);
  { // the ladder up the belfry's east face (Wren climbs it at the start of mission 2)
    // (its rungs and rail ends are where his hands and feet go: MOVES has the numbers; the rails stand a
    // metre proud of the floor at the top, to hold as he steps in between them)
    const lx = ch.x + 2.2 + .18, r0 = chy + .3, LW = C_('#6a5444');
    for (const sz of [-.26, .26]) K.wood.box(lx, chy - .2, ch.z + sz, .07, r0 + MOVES.RAIL - chy + .2, .07, 0, LW, .6);
    for (let n = 0; n <= MOVES.TOP; n++) K.wood.box(lx, r0 + n * MOVES.GAP - .022, ch.z, .05, .045, .5, 0, LW, .6);
    WD.ladder = { lx, x: lx + MOVES.BACK, z: ch.z, cx: ch.x, y0: ground(lx + MOVES.BACK, ch.z), r0 };
    // the chapel's lamp, on a bracket beside the ladder's foot (lit at dusk, as the windows are)
    { const wx = ch.x + 2.2, lz = ch.z + .95, ly = chy + 2.25, IRON = C_('#2b2622');
      K.wood.box(wx + .13, ly + .3, lz, .3, .035, .035, 0, IRON, .5); K.wood.box(wx + .26, ly + .25, lz, .2, .05, .2, 0, IRON, .5); K.wood.box(wx + .26, ly - .03, lz, .16, .03, .16, 0, IRON, .5);
      K.lit.box(wx + .26, ly, lz, .13, .25, .13, 0, WHITE, 1);
      WD.winSpots.push({ x: wx + .85, y: ly + .2, z: lz + .1, col: '#ffb468', i: 4.2 }); }
  }
  gabled(ch.x, ch.z + 6.5, 10, 6, 5.5, Math.PI / 2, { kw: K.stone, wc: C_('#e6dfd2'), y0: chy, plinth: false, pitch: .5 }); box(ch.x, chy, ch.z + 6.5, 6, 6, 10, 'stone');   // (solid, like the tower: a round stops in it, and Wren and the camera go round it, not through)
  // the windmill on the ridge (M2's second nest) with turning sails
  const wm = { x: NESTS.mill2.x, z: NESTS.mill2.z + 3.4 }, wmy = ground(wm.x, wm.z) - .2;
  mesh(new CylinderGeometry(2.4, 3.6, 10, 12), M.wall, wm.x, wmy + 5, wm.z);
  K.roof.spire(wm.x, wmy + 9.9, wm.z, 2.8, 3, 12, WHITE, .38);
  K.wood.box(wm.x, wmy, wm.z + 3.38, 1.1, 2.3, .3, 0, C_('#1a1410'), .6).box(wm.x - .62, wmy, wm.z + 3.4, .16, 2.45, .36, 0, C_('#6a5444'), .6).box(wm.x + .62, wmy, wm.z + 3.4, .16, 2.45, .36, 0, C_('#6a5444'), .6).box(wm.x, wmy + 2.35, wm.z + 3.42, 1.4, .18, .38, 0, C_('#6a5444'), .6);   // the door
  const sails = new Group(); sails.position.set(wm.x - 3.1, wmy + 9.6, wm.z); sails.rotation.y = Math.PI / 2;
  for (let i = 0; i < 4; i++) { const s = new Mesh(new BoxGeometry(1.4, 9, .1), M.cloth); s.position.y = 4.6; const arm = new Group(); arm.rotation.z = i * Math.PI / 2; arm.add(s); sails.add(arm); }
  const spin = new Group(); spin.add(...sails.children); sails.add(spin); WD.sails = spin;
  sails.traverse(m => { if (m.isMesh) m.castShadow = true; }); v.scene.add(sails);
  WD.flagB = flag(v, M, ch.x + 12, chy + 6.8, ch.z - 4);
  { // the zip line from the ridge rocks down to the water tower: a pole and stays at the top, the cable (it
    // starts beside the nest, its bar where he can reach it from the ground, and clear of his line of sight)
    const eye = n => ({ x: n.x, y: land.height(n.x, n.z) + n.up + .5, z: n.z }), a = eye(NESTS.ridge), b = eye(NESTS.tower);
    const A = new Vector3(a.x - 2.5, a.y + .45, a.z), B = new Vector3(b.x, b.y + 1.6, b.z), d = B.clone().sub(A), L = d.length();
    const cable = mesh(new CylinderGeometry(.03, .03, L, 5, 1, true), M.iron, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); cable.quaternion.setFromUnitVectors(UP, d.normalize()); cable.castShadow = false;
    K.wood.cyl(new Vector3(A.x - d.x * .6, ground(A.x - d.x * .6, A.z - d.z * .6) - .3, A.z - d.z * .6), UP, .13, .1, A.y - ground(A.x, A.z) + 1, 7, C_('#5a4636'), .5);
    WD.zipA = A; WD.zipB = B;
    const tr = new Group(), blk = new Mesh(new BoxGeometry(.12, .16, .3), M.iron), wh = new Mesh(new CylinderGeometry(.07, .07, .05, 10), M.iron), bar = new Mesh(new CylinderGeometry(.018, .018, .5, 6), M.dark);
    wh.rotation.z = Math.PI / 2; wh.position.y = .04; blk.position.y = -.06; bar.rotation.z = Math.PI / 2; bar.position.y = -.2; tr.add(blk, wh, bar); tr.visible = false; v.scene.add(tr); WD.trolley = tr;
  }
  // the ridge nest: a tumble of rocks and a log to lie behind
  const rd = NESTS.ridge, ry = ground(rd.x, rd.z);
  for (const [dx, dz, s] of [[-2.6, -2.2, 1.5], [2.4, -2.4, 1.3], [3.8, -.6, 1.1], [-3.9, -.4, 1.2], [4.6, 1.6, 1], [-4.4, 1.8, 1.3]]) mesh(boulder(s * .62, dx * 7 + 3), M.rock, rd.x + dx, ry - .2, rd.z + dz).rotation.y = dx;
  mesh(new CylinderGeometry(.22, .25, 3.2, 8), M.wood, rd.x, ry - .02, rd.z - 1.8).rotation.z = Math.PI / 2;
  // the village's merged meshes, one per material
  const vmesh = (kit, mat, cast = true) => { if (kit.empty) return null; const m = new Mesh(kit.geo(), mat); m.castShadow = cast; m.receiveShadow = true; v.scene.add(m); return m; };
  vmesh(K.wall, M.wallV); vmesh(K.roof, M.roofV); vmesh(K.wood, M.woodV); vmesh(K.stone, M.stoneV); vmesh(K.glass, M.glass, false); vmesh(K.straw, M.strawV); vmesh(K.ballast, M.ballast, false);
  WD.wins = vmesh(K.lit, M.lit, false);

  // ---- field walls along the south road and north bank: cover for advancing squads
  WD.lowCells = new Set();
  const wallStones = new InstancedMesh(metres(rbox(3.8, 1, .8, .2)), M.stone, 160); let wsi = 0;
  const fieldWall = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 4);
    for (let i = 0; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n, y = ground(x, z);
      o.position.set(x, y + .45, z); o.rotation.set(0, Math.atan2(bx - ax, bz - az) + Math.PI / 2, 0); o.scale.set(1, 1, 1); o.updateMatrix(); wallStones.setMatrixAt(wsi++, o.matrix);
      box(x, y, z, 2.2, 1.05, 2.2, 'low'); WD.lowCells.add(cellKey(x, z));
    }
  };
  fieldWall(58, 40, 68, 62); fieldWall(28, 30, 30, 70); fieldWall(64, 98, 76, 132); fieldWall(20, 104, 36, 136);
  fieldWall(-6, -50, 24, -53); fieldWall(54, -52, 84, -49.5); fieldWall(-60, -60, -24, -62);   // (the first two used to cross the railway: they stand along its south side now, clear of the bed) fieldWall(-40, 40, -10, 58); fieldWall(-90, 80, -60, 100);
  wallStones.count = wsi; wallStones.castShadow = wallStones.receiveShadow = true; v.scene.add(wallStones);

  // ---- trees and rocks (instanced: fewer leaves far away, painted cards further still)
  const props = new Props(v.scene), atlas = treeAtlas(), leaves = leafMat(atlas);
  for (const [k, make_] of [['oak', oakGeo], ['poplar', poplarGeo], ['fir', firGeo]]) {
    // far away: an impostor (gs.outdoors: cards with baked pictures of the leafy tree), or the painted
    // cards when there's no 3D to bake with; the painted cards still cast the far shadows
    const near = make_(1), cards = make_(2), imp = impostor(make_(0), leaves, { cards: 3, size: 256, round: .6, material: { roughness: .85 } });
    const D = k === 'fir' ? FIR_LOD : TREE_LOD, lod = imp ? [[D[0], near], [D[1], imp.geometry, imp.material], [1e9, cards]] : [[D[0], near], [D[1], cards]];
    if (imp) looks.leaves(imp.material, { time: GU.uTime, wind: AIR, sun: GU.uSun, sway: .004, above: 3, atlas: [768, 256] });
    const m = props.kind(k, make_(0), leaves, { lod, shadowFar: 70 });
    m.addShadowLOD(near, 0);   // close shadows from the leafy shape, far ones from the cards
  }
  props.kind('rock', boulder(1.6, 4), M.rock, { lod: [[60, boulder(1.6, 4, undefined, 8)]], shadowFar: 50 });
  const clear = (x, z) => {
    if (roadD(x, z) < 7 || Math.abs(z - RIVER(x)) < 16 || Math.abs(z - RAILZ) < 10 || Math.hypot(x + 15, z + 108) < 70 || Math.hypot(x - MILL.x, z - MILL.z) < 20) return true;
    for (const n of Object.values(NESTS)) { if (Math.hypot(x - n.x, z - n.z) < 14) return true; }
    // keep the views from the nests to the village open
    if (z > -60 && z < 150 && x > -150 && x < 110) return true;
    return false;
  };
  // the fir woods on the hills behind the village: thick enough to close over (far off they are a few cards each)
  land.scatter(props, 'fir', 1100, { below: 70, steep: .6, gap: 3.4, seed: 3, keepOut: (x, z) => clear(x, z) || z > -150 || (z < -200 && Math.abs(x - STREAMX) < 44 && land.height(x, z) < LAKE + 1.2), scale: [.7, 1.5] });
  land.scatter(props, 'oak', 170, { steep: .5, gap: 8, seed: 5, keepOut: (x, z) => clear(x, z) || z < -170, scale: [.75, 1.25] });
  // poplars in lines along the lanes and the river banks, away from the lines of fire
  const R = rng(11), rows = [];
  for (const r of [ROADS[1].slice(2), ROADS[2].slice(1)]) for (let i = 0; i < r.length - 1; i++) {
    const [ax, az] = r[i], [bx, bz] = r[i + 1], L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
    for (let d = 4; d < L; d += 9 + R() * 3) for (const sd of [-1, 1]) if (R() < .8) rows.push([ax + (bx - ax) * d / L + nx * sd * 5.5, az + (bz - az) * d / L + nz * sd * 5.5]);
  }
  for (let x = -300; x < 300; x += 10 + R() * 6) if (x < -70 || x > 120) for (const sd of [-1, 1]) if (R() < .6) rows.push([x, RIVER(x) + sd * (13 + R() * 3)]);
  for (const [x, z] of rows) {
    if (Math.hypot(x + 15, z + 108) < 62 || Math.abs(z - RAILZ) < 7 || Math.hypot(x - MILL.x, z - MILL.z) < 16 || Math.abs(x - BRIDGE.x) < 12 || land.height(x, z) < -.5) continue;
    props.add('poplar', x, land.height(x, z) - .2, z, { rot: R() * TAU, scale: .85 + R() * .35 });
  }
  land.scatter(props, 'rock', 70, { steep: .7, gap: 8, seed: 9, keepOut: clear, scale: [.5, 1.6] });
  props.done(); WD.props = props;

  // ---- moving things
  // (the supply train is mission 1's own: made in its part of WD.regions, below)
  WD.dust = new Particles(v, { max: 500, additive: false, wind: AIR, blow: .3 });
  WD.sparks = new Particles(v, { max: 300, additive: true });
  WD.trail = new Particles(v, { max: 260, additive: false, wind: AIR, blow: .4 });
  WD.smoke = new Particles(v, { max: 200, additive: false, wind: AIR, blow: .6 });
  // the round, for its own camera: a pointed bullet with a boat tail and a crimp groove in a copper jacket, the
  // rifling's marks down its sides (so its spin shows), four times life size so it reads on a phone
  const bullet = (() => {
    const R_ = .016, L_ = .14, pts = [[0, 0], [.78, 0], [1, .12], [1, .28], [.93, .29], [.93, .31], [1, .32], [1, .44]];
    for (const u of [.15, .3, .45, .6, .74, .86, .95, 1]) pts.push([Math.max(0, 1 - Math.pow(u, 1.9)), .44 + .56 * u]);
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r * R_, (y - .5) * L_)), 16), q = g.attributes.position, col = [];
    for (let i = 0; i < q.count; i++) { const y = q.getY(i) / L_ + .5, a = Math.atan2(q.getZ(i), q.getX(i)), land_ = y > .13 && y < .44 && Math.cos(a * 4) > .55 ? .72 : 1, k = land_ * (y < .01 ? .6 : 1); col.push(k, k, k); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new Mesh(g, pbr('#c07a48', { rough: .24, metal: 1, vertexColors: true })); m.rotation.order = 'YXZ'; m.visible = false; return m;
  })();
  v.scene.add(bullet); WD.bullet = bullet;
  // tracers from enemy fire (pooled)
  const trMat = pbr('#ffd890', { glow: 3.2 }), trGeo = new BoxGeometry(.028, .028, 1);
  WD.tracers = Array.from({ length: 10 }, () => { const m = new Mesh(trGeo, trMat); m.visible = false; m.castShadow = false; v.scene.add(m); return m; });
  // first-person rifle (shown when not scoped): walnut stock, blued steel, a scope on two rings; held low and
  // a little across, so it comes into view from the corner. Half as big again and half as far again: the
  // same picture, but its near end stays the far side of the camera's near plane (.3), which used to cut
  // the bolt and the back of the scope away
  const gun = new Group(), steel = pbr('#ffffff', { vertexColors: true, rough: .34, metal: .85 }), walnut = pbr('#ffffff', { tex: wood, rough: .5, vertexColors: true });
  WD.rifleMats = [walnut, steel];
  { const P = rifleParts(true, true), near = [new THREE.MeshPhysicalMaterial({ map: walnut.map, normalMap: walnut.normalMap, roughnessMap: walnut.roughnessMap, vertexColors: true, roughness: .8, specularIntensity: .3, emissive: '#ffffff', emissiveMap: walnut.map, emissiveIntensity: .1 }), steel.clone()];
    // (seen along its length the stock is all grazing angles, where any surface mirrors the sky: its wood is given less of that, and a little of its own colour back, or it reads as blue steel)
    for (const m of near) m.side = THREE.DoubleSide; near[1].roughness = .46; near[1].metalness = .75; gun.add(new Mesh(P.wood, near[0]), new Mesh(P.steel, near[1])); const bolt = new Group(); bolt.add(new Mesh(P.bolt, near[1])); bolt.position.set(0, .03, .05); gun.add(bolt); WD.bolt = bolt; }
  gun.scale.setScalar(1.5); gun.position.set(.27, -.3, -.56); gun.rotation.set(.05, .13, -.1); gun.traverse(m => { m.castShadow = false; m.userData.noAO = true; }); v.cam.add(gun); WD.gun = gun;
  // rifles dropped by men who are down
  WD.dropped = Array.from({ length: 6 }, () => { const g = soldierRifle(false); g.visible = false; v.scene.add(g); return g; }); WD.dropN = 0;
  // nest markers (a soft flare where you can move to)
  WD.marks = new Particles(v, { max: 8, additive: true });
  // a helmet that pops off on a head shot
  WD.helmets = Array.from({ length: 4 }, () => { const m = folk('grey')[0].gear.hat.loose(); m.visible = false; v.scene.add(m); return { m, vx: 0, vy: 0, vz: 0, life: 0 }; });   // (loose copies of the riflemen's own)

  // ---- three lost letters in each mission, tucked where you can spot them with the glasses
  {
    const paper = pbr('#efe6d2', { rough: .9, glow: .18, glowCol: '#fff4dc', side: THREE.DoubleSide }), seal = pbr('#9a2a1e', { rough: .5 });
    const env = new PlaneGeometry(.34, .23), dot = new CylinderGeometry(.035, .035, .012, 10), at = (x, y, z, ry = 0, tilt = 0) => ({ x, y, z, ry, tilt });
    const g = (x, z) => ground(x, z), wy = g(-6, -104);
    WD.letterSpots = {
      m1: [at(-6.4, wy + 2.475, -103.8, .3), at(16.1, g(16, -98) + .9, -98, 1.1), at(MILL.x + 2.6, millY + 4.375, MILL.z + 5.44, 0, -1.2)],
      m2: [at(120, g(120, 60) + 2.98, 60, .3, -.3), at(48, g(48, -92) + .86, -92, -.4), at(-36, g(-36, -88) + .9, -88, 2)],
    };
    WD.letters = [0, 1, 2].map(() => { const l = new Group(), e = new Mesh(env, paper); e.rotation.x = -Math.PI / 2; const d = new Mesh(dot, seal); d.position.y = .008; l.add(e, d); l.visible = false; v.scene.add(l); return l; });
  }
  // ---- rooks in the trees: a shot (or a bullet landing near) sends them up, and that gives you away
  {
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -.2, -.45, .1, .05, 0, 0, .14, 0, 0, -.2, 0, 0, .14, .45, .1, .05, 0, -.02, -.22, 0, .03, .1, 0, -.04, .3], 3)); bg.computeVertexNormals();
    const birds = new InstancedMesh(bg, pbr('#15130f', { rough: 1, side: THREE.DoubleSide }), 36); birds.frustumCulled = false; birds.castShadow = false; birds.count = 0; v.scene.add(birds);
    WD.birds = birds;
    WD.flocks = [[24, 138], [-30, -134], [58, -48], [-118, 104], [96, 70]].map(([x, z]) => ({ x, z, y: g0(x, z) + 9, n: 12, t: 0, up: false, rest: 0, b: [] }));
    function g0(x, z) { return ground(x, z); }
  }
  // ---- paths and cover
  const coverAt = (c, r) => { if (WD.lowCells.has(c + ',' + r)) return true; const x = GX0 + (c + .5) * CELL, z = GZ0 + (r + .5) * CELL; return solidAt(x, z, solids); };
  // ---- the meadow: real grass round the camera wherever it comes down to the ground (the ridge nest, the
  // bullet camera, Wren on the move). It grows on open ground: not on lanes, yards, the rail bed, rock, the
  // forest floor, ploughed fields, river mud, or under a roof. Thinner on slower phones, none on the slowest.
  {
    const built = new Uint8Array(640 * 640);   // a metre a cell: 1 under anything built
    for (const b of solids) if (b.y0 < land.height((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2) + 1.5) for (let z = Math.floor(b.z0 + 319.6); z <= Math.floor(b.z1 + 320.4); z++) for (let x = Math.floor(b.x0 + 319.6); x <= Math.floor(b.x1 + 320.4); x++) if (x >= 0 && z >= 0 && x < 640 && z < 640) built[z * 640 + x] = 1;
    const grows0 = (x, z) => {
      if (built[Math.floor(z + 320) * 640 + Math.floor(x + 320)]) return 0;
      const y = land.height(x, z); if (y < 1) return 0;
      const m = groundMasks(x, z, y, land.slope(x, z)), yard = Math.max(1 - sm(26, 52, Math.hypot(x + 15, z + 108)), 1 - sm(7, 14, Math.hypot(x - MILL.x, z - MILL.z)));   // (tufts come up through the worn earth at a yard's edge)
      let lie = 1; for (const nn of Object.values(NESTS)) lie = Math.min(lie, sm(1.3, 3.2, Math.hypot(x - nn.x, z - nn.z)));   // pressed flat where he lies up; it grows back through the worn patch round it
      return clamp((1 - 1.4 * m[0]) * (1 - .8 * m[1]) * (1 - 1.5 * m[2]) * (1 - 1.15 * yard) * lie * sm(2.7, 4.4, roadD(x, z)) * sm(4.5, 7.5, Math.abs(z - RAILZ)) * sm(1, 2.2, y), 0, 1);
    };
    // (worked out once for each metre of ground, the first time grass is planted there: ten tufts share a metre)
    const grown = new Uint8Array(640 * 640);
    const grows = (x, z) => { const cx = Math.floor(x + 320), cz = Math.floor(z + 320); if (cx < 0 || cz < 0 || cx > 639 || cz > 639) return 0; const i = cz * 640 + cx; return ((grown[i] ||= 1 + Math.round(254 * grows0(cx - 319.5, cz - 319.5))) - 1) / 254; };
    // cropped short in front of where he lies up, so no blade crosses the sights
    const short = (x, z) => { let k = 1; for (const nn of Object.values(NESTS)) k = Math.min(k, .5 + .5 * sm(3, 8, Math.hypot(x - nn.x, z - nn.z))); return k; };
    // fine tufts close by, coarse ones out to the distance (none on the low tier)
    const RINGS = {
      medium: [{ reach: 10, gap: .45, blades: 7, bends: 2, width: .04, spread: .26 }],
      high: [{ reach: 8, gap: .32, blades: 9, width: .024, spread: .2, stalks: 1 }, { reach: 24, gap: .8, blades: 7, bends: 2, width: .07 }],
      ultra: [{ reach: 10, gap: .28, blades: 10, width: .022, spread: .19, stalks: 1 }, { reach: 28, gap: .7, blades: 7, bends: 2, width: .065 }],
    };
    WD.meadow = T => { const d = RINGS[T?.name]; if (d === WD.meadowD) return; WD.meadowD = d; land.meadow(false); for (const r of d || []) land.meadow({ ...r, height: .5, colours: ['#587a2b', '#7d8e35', '#a39a54'], where: grows, tall: short }); };
  }
  WD.cover = new CoverMap(GC, GR, coverAt, { size: CELL, x0: GX0, y0: GZ0, low: (c, r) => WD.lowCells.has(c + ',' + r) });
  WD.nav = new NavGrid(GC, GR, CELL, (c, r) => {
    const x = GX0 + (c + .5) * CELL, z = GZ0 + (r + .5) * CELL;
    if (Math.abs(x - BRIDGE.x) < 4 && z > BRIDGE.z0 - 6 && z < BRIDGE.z1 + 6) return false;   // the deck and the road onto each end
    // beside the bridge: the banks are steep and wet, and the parapets are walls. On and off at the ends only
    if (Math.abs(x - BRIDGE.x) < 16 && z > BRIDGE.z0 - 1 && z < BRIDGE.z1 + 1) return true;
    // no wading: the whole cell (its corners and edges too, where paths run between cells) stays out of the water
    for (const [dx, dz] of [[0, 0], [-2, -2], [2, -2], [-2, 2], [2, 2], [0, -2], [0, 2], [-2, 0], [2, 0]]) if (land.height(x + dx, z + dz) < -.9) return true;
    return coverAt(c, r) || land.slope(x, z) > .55;
  });
  WD.regions = missionParts(v);
  return WD;
}
// ------------------------------------------------------------------ each mission's own things (WD.regions)
// The valley, its village and everything both missions use are made with the file (world()). What only one
// mission uses is a part of WD.regions, made when that mission is picked (in reset(): under the loading
// screen; picked on the field file: over the next frames, the GO stamp says LOADING till it's in) and let go
// of once another is picked and the phone is short of memory.
function missionParts(v) {
  const R = new Regions(v, { keep: 1 });
  // dawn: the supply train Wren rides out on
  R.part('m1', r => {
    human.need(looksOf(LOOKS.m1));
    // the supply train: a freight engine of the 1940s, her tender and five wagons (gs.models.vehicle, joined into a
    // few meshes as she only runs straight, and a working engine with no brightwork). The kit's stands on the rail
    // tops with its nose along -z; the line runs along x, and the van Wren rides out on is TRAIN.W1 from train.x
    const tr = WD.rail = vehicle('train', { style: 'steam', colour: '#1d1e20', deflectors: true, lit: true, gauge: 1.365, fuse: true, polished: false,
      cars: [{ style: 'van', colour: '#6b3024' }, { style: 'open', load: 'tarp', colour: '#565c50' }, { style: 'tanker', colour: '#2e3235' }, { style: 'flat', load: 'crates' }, { style: 'guard', colour: '#565b5e' }] });
    const van = tr.cars[2], o = new Object3D();
    // the Order's yellow slash on the van's doors, under the brace that crosses each
    const mark = new InstancedMesh(new BoxGeometry(.01, .17, .9), pbr('#c4a84a', { rough: .9 }), 2);
    for (const i of [0, 1]) { o.position.set((i ? -1 : 1) * 1.414, 2.67, .32); o.rotation.x = -.55; o.updateMatrix(); mark.setMatrixAt(i, o.matrix); }
    mark.receiveShadow = true; van.add(mark);
    tr.rotation.y = -Math.PI / 2; tr.position.set(TRAIN.W1 + van.position.z, TRAIN.TOP, 0);
    WD.train = new Group(); WD.train.add(tr); WD.train.visible = false; v.scene.add(WD.train); WD.train.updateMatrixWorld(true);
    v.detail(tr, false);   // (she moves: drawn whole)
    TRAIN.RD = tr.radius; TRAIN.ROOF = van.points.roof.getWorldPosition(new Vector3()).y;
    r.on(() => { WD.train = WD.rail = null; });
  });
  // dusk: Sgt. Rook and Hale's squad (their faces are sculpted now, the first time on this phone)
  R.part('m2', () => { human.need(looksOf(LOOKS.m2)); });
  return R;
}
function roadZ(x) { const r = ROADS[2]; for (let i = r.length - 2; i >= 0; i--) { const [ax, az] = r[i], [bx, bz] = r[i + 1]; if (x >= ax) return az + (bz - az) * clamp((x - ax) / (bx - ax), 0, 1); } return r[0][1]; }
function cellKey(x, z) { return Math.floor((x - GX0) / CELL) + ',' + Math.floor((z - GZ0) / CELL); }
function solidAt(x, z, solids) { for (const b of solids) if (b.kind !== 'low' && x > b.x0 - .5 && x < b.x1 + .5 && z > b.z0 - .5 && z < b.z1 + .5 && b.y0 < 30) return true; return false; }
function roofGeo() {
  // a unit gable roof: 1 wide (x), 1 high, 1 deep (z), ridge along z
  const g = new THREE.BufferGeometry(), p = [-.5, 0, -.5, .5, 0, -.5, 0, 1, -.5, -.5, 0, .5, .5, 0, .5, 0, 1, .5];
  const idx = [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3];
  const pos = []; for (const i of idx) pos.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv = []; for (let i = 0; i < pos.length / 3; i++) uv.push(pos[i * 3] + pos[i * 3 + 2], pos[i * 3 + 1] + pos[i * 3 + 2] * .5);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}
function flag(v, M, x, y, z) {
  const pole = new Mesh(new CylinderGeometry(.05, .06, 4, 6), M.iron); pole.position.set(x, y - 2, z); v.scene.add(pole);
  const g = new PlaneGeometry(2, 1.1, 10, 4), cloth = new Mesh(g, M.cloth); cloth.position.set(x, y - .55, z); cloth.castShadow = true; v.scene.add(cloth);
  return { cloth, base: Float32Array.from(g.attributes.position.array), x, y, z };
}
// the supply train (made in world()): the rail tops above the sleepers and the van's middle from train.x; her driving
// wheels' radius and the van's roof above the sleepers are read from the train when it is made
const TRAIN = { TOP: .215, W1: -15.85, RD: .66, ROOF: 3.88 };

// ---- people: sculpted in code by gs.models.human (faces with eyes, hands with fingers, uniforms cut and
// worn, helmets, straps and pouches; three levels of detail) on the skeleton gs.poses moves. A hat or a
// pack is hidden by shrinking its bone to nothing (the helmet that flies off, the radio pack). The first
// of each face is sculpted (in the background, once per phone: the app shows "Loading…"); the rest of a
// squad are twins that share its geometry.
const PEOPLE_SPEC = (() => {
  const grey = (o, top = {}) => ({ hands: 'grip', ...o, outfit: {
    top: { kind: 'tunic', colour: '#5c636b', collar: '#3e454c', pockets: 4, buttons: '#8a8674', straps: true, tabs: '#23272b', band: '#d9c25a', ...top },
    legs: { kind: 'trousers', colour: '#4a5057' }, feet: { kind: 'tall', colour: '#1f1c19' }, hat: { kind: 'helmet', colour: '#4b5249' },
    belt: { colour: '#2b2723', buckle: '#8d8c80' }, webbing: { colour: '#2b2723', y: true, pouches: 3 }, extras: { bag: '#5f5e48', canteen: '#4a4034' }, pack: { kind: 'radio', colour: '#454a40', hide: true } } });
  const hale = o => ({ hands: 'grip', ...o, outfit: {
    top: { kind: 'blouse', colour: '#6b6f40', collar: null, pockets: 2, buttons: '#5a5840' }, legs: { kind: 'trousers', colour: '#5a5e37' }, feet: { kind: 'gaiters', colour: '#2b231a', gaiter: '#8a8464' },
    hat: { kind: 'beret', colour: '#3f4a2c', badge: '#b8a050' }, belt: { colour: '#7d7656', buckle: '#a09060' }, webbing: { colour: '#7d7656', y: true, pouches: 1, kind: 'big' }, pack: { kind: 'pack', colour: '#5f6238', roll: '#6a6450', hide: true } } });
  return {
    grey: [grey({ skin: '#d2a583', hair: '#4a3626', iris: '#6c8296', stubble: .4 }), grey({ skin: '#c9997a', hair: '#2e241c', iris: '#5a4a34', stubble: .65, face: { jaw: 1.08, nose: 1.08, brow: 1.12 } }),
      grey({ skin: '#dcb394', hair: '#8a6a3c', iris: '#5f7f6a', stubble: .12, face: { jaw: .93, chin: .94, nose: .94, cheeks: .9 } })],
    officer: [{ skin: '#d8ae8c', hair: '#3a2c20', iris: '#5a6f7a', moustache: true, stubble: .2, outfit: {
      top: { kind: 'tunic', colour: '#3d434b', collar: '#262b31', pockets: 4, buttons: '#b0a678', straps: true, tabs: '#8a2a22', cuffs: '#262b31', band: '#d9c25a' },
      legs: { kind: 'breeches', colour: '#2f343a' }, feet: { kind: 'tall', colour: '#141210' }, hat: { kind: 'cap', colour: '#353b42', band: '#d9c25a', badge: '#c0b070' },   // (the Order's yellow on his cap too: he is the one to find)
      belt: { colour: '#3a2416', buckle: '#b0a678' }, webbing: { colour: '#3a2416', cross: true }, extras: { holster: 'left' }, gloves: { colour: '#33261a' } } }],
    // Sgt. Rook, their marksman: a camouflage smock, a knitted cap, a scarf against the tower's wind
    rook: [{ hands: 'grip', skin: '#c79a7c', hair: '#57534c', iris: '#7a8a8a', stubble: .8, face: { jaw: 1.06, brow: 1.15, cheeks: .85, nose: 1.05 }, outfit: {
      top: { kind: 'smock', colour: '#4a4f3c', camo: ['#32372b', '#6b6551'], collar: null, pockets: 4 }, legs: { kind: 'trousers', colour: '#4a5057' }, feet: { kind: 'tall', colour: '#1f1c19' }, hat: { kind: 'wool', colour: '#3a3f38' },
      belt: { colour: '#2b2723', buckle: '#6d6c62' }, webbing: { colour: '#2b2723', pouches: 2 }, extras: { scarf: '#55584a' } } }],
    ally: [hale({ skin: '#e0b28b', hair: '#3a2a1a', iris: '#5a4a34', stubble: .3 }), hale({ skin: '#b98a68', hair: '#1e1814', iris: '#3f3428', stubble: .5, face: { jaw: 1.05, nose: 1.1 } }), hale({ skin: '#e6bea0', hair: '#9a6a3a', iris: '#5a7a8a', stubble: .1, face: { jaw: .95, chin: .95 } })],
    // Wren: a brushed camouflage smock and trousers, canvas gaiters, a knitted cap, a scarf of scrim at his neck
    wren: [{ hands: 'grip', skin: '#d6a985', hair: '#3a2a1c', iris: '#6b7a58', stubble: .3, face: { jaw: 1.03, brow: 1.06, cheeks: .92 }, outfit: {
      top: { kind: 'smock', colour: '#5f6742', camo: ['#3c472b', '#7b6b47'], collar: null, pockets: 4 }, legs: { kind: 'trousers', colour: '#4b4d33', camo: ['#3c472b', '#6e6444'] }, feet: { kind: 'gaiters', colour: '#2a221a', gaiter: '#6f6a4a' },
      hat: { kind: 'wool', colour: '#4a4a34', hide: false }, belt: { colour: '#5e5640', buckle: '#8a7a50' }, webbing: { colour: '#5e5640', y: true, pouches: 2 }, extras: { scarf: '#6b6a45', bag: '#545238' } } }],
  };
})();
// the looks each mission needs: the Grey Order's riflemen and officer and Wren in both; Sgt. Rook and Hale's
// squad only at dusk (mission 2), so they're sculpted and made only once that mission is picked (WD.regions)
const LOOKS = { both: ['grey', 'officer', 'wren'], m1: [], m2: ['rook', 'ally'] };
const looksOf = kinds => kinds.flatMap(k => PEOPLE_SPEC[k]);
const PEOPLE = {};
// the first of each face of a kind, made together the first time one of them is needed
const folk = kind => PEOPLE[kind] ||= human.all(PEOPLE_SPEC[kind]);
// merges shapes into one geometry with colours (skin: for a soldier, the bone each shape follows;
// uvs: keep each shape's texture coordinates, times uv [u, v], so a textured material shows its grain)
function baker(skin = false, uvs = false) {
  const P = [], N = [], C = [], U = [], SI = [], SW = [], I = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), nm = new THREE.Matrix3(), v = new Vector3(), w = new Vector3(), sc = new Vector3();
  let base = 0;
  return {
    add(g, col, at, { s = [1, 1, 1], r = [0, 0, 0], bone = 0, uv = [1, 1] } = {}) {
      m4.compose(v.set(at[0], at[1], at[2]), q.setFromEuler(e.set(r[0], r[1], r[2])), sc.set(s[0], s[1], s[2])); nm.getNormalMatrix(m4);
      const c = new Color(col), pos = g.attributes.position, nor = g.attributes.normal, tu = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m4); P.push(v.x, v.y, v.z); w.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); N.push(w.x, w.y, w.z);
        C.push(c.r, c.g, c.b); if (skin) { SI.push(bone, 0, 0, 0); SW.push(1, 0, 0, 0); }
        if (uvs) U.push(tu ? tu.getX(i) * uv[0] : 0, tu ? tu.getY(i) * uv[1] : 0);
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) I.push(g.index.getX(i) + base); else for (let i = 0; i < pos.count; i++) I.push(base + i);
      base += pos.count; return this;
    },
    geo() {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      if (uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      if (skin) { g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4)); }
      g.setIndex(I); g.computeBoundingSphere(); return g;
    },
  };
}
// ---- rifles, drawn in code: a bolt-action rifle with a walnut stock. The player's is finer and has a
// scope; the soldiers' are the same rifle with less in it. Its own space: the trigger at the origin, the
// muzzle towards -z, the bore along z at y = .03. Returns { wood, steel, bolt }: three geometries.
function rifleParts(fine, scope) {
  const kw = baker(false, true), ks = baker(), kb = baker(), Z = Math.PI / 2, n = fine ? 20 : 8, W_ = fine ? '#e6b98c' : '#b88458', S_ = '#30343a', D_ = '#191a1d', B_ = '#3a3d42';
  const tube = (r1, r2, len) => new CylinderGeometry(r1, r2, len, n);   // lying along z once turned: r1 at the butt end, r2 at the muzzle end
  // the stock: its side as an outline (z along the rifle, y up), given thickness and rounded edges
  const side = [[.36, .014], [.3, .017], [.2, .021], [.145, .014], [.105, .004], [.075, .008], [.055, .02], [-.46, .02], [-.485, .012], [-.49, -.004], [-.47, -.014], [-.3, -.02], [-.12, -.027], [-.02, -.032], [.03, -.03], [.055, -.022], [.085, -.027], [.115, -.04], [.15, -.058], [.21, -.08], [.3, -.1], [.36, -.112]];
  const st = new THREE.ExtrudeGeometry(new THREE.Shape(side.map(([z, y]) => new THREE.Vector2(-z, y))), { depth: .024, bevelEnabled: true, bevelThickness: .009, bevelSize: .007, bevelOffset: -.007, bevelSegments: fine ? 4 : 2 });
  st.translate(0, 0, -.012); st.rotateY(Z);
  kw.add(st, W_, [0, 0, 0], { uv: [5, 12] });
  kw.add(new CylinderGeometry(.0168, .0158, .27, n, 1, false, Z, Math.PI), W_, [0, .03, -.275], { r: [Z, 0, 0], uv: [1, 2] });   // the handguard over the barrel
  // a leather sling from the front band to the butt
  kw.add(new BoxGeometry(.022, .004, .31), '#4a3524', [0, -.052, -.15], { r: [-.1, 0, 0] }).add(new BoxGeometry(.022, .004, .3), '#4a3524', [0, -.078, .15], { r: [.075, 0, 0] });
  // steel: barrel, muzzle, sights, receiver, floor plate and trigger guard, bands, butt plate
  ks.add(tube(.0115, .0085, .62), S_, [0, .03, -.43], { r: [Z, 0, 0] }).add(tube(.0102, .0102, .014), S_, [0, .03, -.735], { r: [Z, 0, 0] });
  ks.add(new BoxGeometry(.01, .012, .03), S_, [0, .043, -.705]).add(new BoxGeometry(.0025, .013, .008), S_, [0, .054, -.708]);
  ks.add(tube(.0175, .0175, .19), S_, [0, .03, -.03], { r: [Z, 0, 0] }).add(tube(.0195, .0195, .04), S_, [0, .03, -.106], { r: [Z, 0, 0] }).add(tube(.011, .012, .05), B_, [0, .03, .088], { r: [Z, 0, 0] });
  ks.add(new BoxGeometry(.014, .012, .05), S_, [0, .051, -.142]).add(new BoxGeometry(.02, .009, .006), S_, [0, .061, -.12]);
  ks.add(new BoxGeometry(.022, .006, .09), S_, [0, -.033, -.03]).add(new THREE.TorusGeometry(.022, .0028, 6, fine ? 14 : 8, Math.PI), S_, [0, -.03, .028], { r: [Math.PI, Z, 0] }).add(new BoxGeometry(.004, .018, .006), S_, [0, -.04, .03], { r: [.3, 0, 0] });
  for (const z of [-.3, -.455]) ks.add(rbox(.047, .047, .014, .008), S_, [0, .002, z]);
  ks.add(new BoxGeometry(.036, .126, .006), B_, [0, -.049, .363]);
  ks.add(new BoxGeometry(.012, .004, .06), D_, [.0165, .034, -.02]);   // the port the spent case leaves by
  // the bolt (its own piece: the player's slides back): handle and knob, on the right
  kb.add(new CylinderGeometry(.0048, .0048, .05, 8), S_, [.036, -.006, 0], { r: [0, 0, Z + .45] }).add(new SphereGeometry(.0105, fine ? 12 : 6, fine ? 8 : 5), S_, [.06, -.018, 0]).add(tube(.0088, .0088, .07), B_, [0, 0, .02], { r: [Z, 0, 0] });
  if (scope) {
    const y = .084;
    ks.add(tube(.0127, .0127, .27), D_, [0, y, -.03], { r: [Z, 0, 0] }).add(tube(.0127, .0195, .06), D_, [0, y, -.19], { r: [Z, 0, 0] }).add(tube(.0195, .0195, .03), D_, [0, y, -.235], { r: [Z, 0, 0] });
    ks.add(tube(.0168, .0127, .045), D_, [0, y, .122], { r: [Z, 0, 0] }).add(tube(.0178, .0178, .022), D_, [0, y, .153], { r: [Z, 0, 0] });
    ks.add(new BoxGeometry(.024, .022, .032), D_, [0, y, -.03]).add(new CylinderGeometry(.0095, .0095, .022, n), S_, [0, y + .02, -.03]).add(new CylinderGeometry(.0095, .0095, .022, n), S_, [.021, y, -.03], { r: [0, 0, Z] });
    for (const z of [.05, -.105]) ks.add(new BoxGeometry(.016, .034, .014), S_, [0, .058, z]).add(tube(.0152, .0152, .014), S_, [0, y, z], { r: [Z, 0, 0] });
    ks.add(new CylinderGeometry(.0165, .0165, .002, n), '#0a0c10', [0, y, -.2495], { r: [Z, 0, 0] }).add(new CylinderGeometry(.015, .015, .002, n), '#0a0c10', [0, y, .1635], { r: [Z, 0, 0] });   // glass
  }
  return { wood: kw.geo(), steel: ks.geo(), bolt: kb.geo() };
}
// a soldier's rifle (a Group: wood, steel, bolt), cheap to make more of
function soldierRifle(scope) {
  const P = WD[scope ? 'scoped' : 'rifle'] ||= rifleParts(false, scope), g = new Group(), [wood, steel] = WD.rifleMats;
  for (const [geo, mat] of [[P.wood, wood], [P.steel, steel], [P.bolt, steel]]) { const m = new Mesh(geo, mat); m.castShadow = true; g.add(m); }
  g.children[2].position.set(0, .03, .05);
  return g;
}
// where a rifle sits on a man, in his chest's space (the spine bone: its origin at the waist, the shoulders
// .34 up, z forward, his right at -x): `at` the trigger, f the way the muzzle points, u the rifle's top
const HOLDS = (() => {
  const hold = (at, f, u) => { const z = new Vector3(-f[0], -f[1], -f[2]).normalize(), x = new Vector3(...u).cross(z).normalize(), y = new Vector3().crossVectors(z, x); return { p: new Vector3(...at), q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)) }; };
  return { slung: hold([-.17, .27, -.15], [.03, .995, -.1], [0, 0, -1]), ready: hold([0, .08, .3], [.5, -.42, .76], [0, 1, 0]), aim: hold([.063, .43, .357], [.565, 0, .825], [0, 1, 0]), back: hold([.05, .22, -.17], [-.5, .86, -.05], [0, 0, -1]) };
})();
const GRIP = [0, -.03, .05], FORE = [0, -.028, -.21], IN_HANDS = { rifle: 1, cs: 1 };
// a rifleman's aim: bladed to the target, the cheek down on the stock (the arms are then brought onto the rifle)
const SHOULDER = () => ({ j: { spine: [.14, -.6, 0], head: [.3, .52, .25], armR: [-1.1, 0, .9], foreR: [-1.9, 0, 0], armL: [-1.3, .2, -.2], foreL: [-.5, 0, 0] }, drop: 0 });
// on the radio: the handset at his ear and mouth, his elbow down by his side, the other arm hanging as the kit's people stand
// (the arm's turns were found by reaching for his ear with human.touch, then written down)
const CALL = () => ({ j: { spine: [.04, .1, 0], head: [.05, -.15, .12], collarR: [0, .08, -.01], armR: [-.62, .08, .63], foreR: [-2.74, -.12, .33], handR: [.01, .53, -.03], armL: [.03, 0, .065], foreL: [-.24, -.35, 0], handL: [-.15, -.35, 0] }, drop: 0 });
// his handset: black, an ear cup and a mouthpiece on a bar. It lies in his right fist, turned to run from his ear to his mouth.
function handset() {
  const geo = WD.handsetGeo ||= (() => { const k = baker(), D = '#131416', Z = Math.PI / 2; return k.add(new BoxGeometry(.02, .022, .12), D, [0, 0, 0]).add(new CylinderGeometry(.027, .027, .024, 12), D, [.014, 0, .066], { r: [0, 0, Z] }).add(new CylinderGeometry(.02, .024, .03, 12), D, [.016, 0, -.064], { r: [0, 0, Z] }).geo(); })();
  const m = new Mesh(geo, WD.rifleMats[1]); m.position.set(.03, -.104, .004); m.quaternion.set(.227, -.061, .029, .972).normalize();
  return m;
}
// ---- moves
// Wren's and the soldiers' own moves. A pose is a few key frames (gs.poses keys) that the rig fills in
// between; on the ladder and the zip line his hands and feet are then put on the rungs and the bar
// (human.touch). This block stands alone (it needs only keys and TAU), so it can be tried out by itself.
const MOVES = (() => {
  const S = Math.sin, PI = Math.PI, mix = (a, b, k) => a + (b - a) * k, sm = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
  // Up a ladder, hand over hand. One cycle is two rungs: each hand and foot holds its rung while he rises
  // past it, then goes up two. [when in the cycle it lets go, its rung at the bottom, how far out to the side]:
  // left hand, right foot, right hand, left foot, the way people climb.
  const GAP = .32, SWING = .36, LEAD = .2, BACK = .3, LIMBS = { handL: [0, 6, .19], footR: [.08, 2, -.1], handR: [.5, 7, -.19], footL: [.58, 3, .1] };
  // y: his feet line above the first rung (m). Gives where each hand and foot is in the ladder's own space
  // (x along the rungs, his left +; y up from the first rung; z out from the ladder), `at` for the body's pose
  // and `rise`, the surge as each leg pushes. Above rung `top` his hands take the rails, up to `rail`.
  function ladder(y, top = 1e3, rail = 1e3, out = {}) {
    const c = y / (GAP * 2) + LEAD; out.at = c - Math.floor(c);
    for (const k in LIMBS) {
      const [o, n0, x] = LIMBS[k], hand = k[0] === 'h', i = Math.floor(c - o), u = (c - o - i) / SWING, e = u < 1 ? sm(0, 1, u) : 1, nA = 2 * i + n0 - 2, n = nA + 2 * e;
      const cap = hand ? rail - .05 : 1e3, yA = Math.min(nA * GAP, cap), yB = Math.min((nA + 2) * GAP, cap), lift = u < 1 ? S(PI * u) * (yB - yA) / (2 * GAP) : 0, p = out[k] ||= { x: 0, y: 0, z: 0 };
      p.rail = hand ? sm(top, top + 1, n) : 0; p.x = x * mix(1, 1.37, p.rail); p.y = mix(yA, yB, e) + (hand ? 0 : .03); p.z = lift * (hand ? .09 : .13); p.lift = lift;
    }
    out.rise = .018 * S(2 * TAU * c + 1);
    return out;
  }
  // The belfry ladder: its top rung, and the floor and the rail ends above the first rung. His feet reach the
  // top two rungs when his feet line is at Y_END; then he pulls himself in between the rails and over the sill.
  const TOP = 33, FLOOR = 10.7, RAIL = 11.8, Y_END = ((TOP - 1) / 2 - LEAD) * 2 * GAP, OVER = 1.8;
  const track = pts => { const f = keys(pts.map(([t, v]) => [t, { v }])); return t => f(t).j.v; }, fy = n => n * GAP + .03 - FLOOR, E = ladder(Y_END, TOP, RAIL);
  const over = {
    root: track([[0, [0, Y_END - FLOOR, BACK]], [.3, [.02, Y_END - FLOOR + .1, BACK - .03]], [.85, [0, -.24, -.06]], [1.25, [0, -.12, -.52]], [OVER, [0, -.3, -.9]]]),
    footR: track([[0, [-.1, fy(TOP - 1), 0]], [.22, [-.12, -.2, .14]], [.45, [-.13, .14, -.18]], [.6, [-.13, .015, -.4]]]),
    footL: track([[0, [.1, fy(TOP), 0]], [.85, [.1, fy(TOP), 0]], [1.05, [.12, .17, -.38]], [1.25, [.11, .015, -.78]]]),
  };
  // t seconds into that: his feet line, hands and feet (x his left, y up from the floor he steps onto, z out
  // from the ladder), how firmly his hands still hold the rails, and `at` for the body's pose (topout)
  function topOut(t, out = {}) {
    for (const k of ['root', 'footL', 'footR']) { const v = over[k](t), p = out[k] ||= { x: 0, y: 0, z: 0 }; p.x = v[0]; p.y = v[1]; p.z = v[2]; }
    for (const k of ['handL', 'handR']) { const p = out[k] ||= { x: 0, y: 0, z: 0 }; p.x = E[k].x; p.y = E[k].y - FLOOR; p.z = 0; }
    out.grip = 1 - sm(.85, 1.15, t); out.at = Math.min(1, t / OVER); out.done = t >= OVER;
    return out;
  }
  // standing at ease as the kit's people do: the toes a little out, the arms hanging a little out from the shoulders, so the
  // hands lie beside the thighs (a +z turn takes a left arm or leg out from the body, a -z turn a right one)
  const EASE = { legL: [-.03, .1, .03], shinL: [.06, 0, 0], footL: [-.03, 0, 0], legR: [-.03, -.1, -.03], shinR: [.06, 0, 0], footR: [-.03, 0, 0], armL: [.03, 0, .065], foreL: [-.24, -.35, 0], handL: [-.15, -.35, 0], armR: [.03, 0, -.065], foreR: [-.24, .35, 0], handR: [-.15, .35, 0] };
  const STAND = { hips: [0, 0, 0], spine: [.03, 0, 0], head: [0, 0, 0], armL: [0, 0, .06], foreL: [-.2, 0, 0], handL: [0, 0, 0], armR: [0, 0, -.06], foreR: [-.2, 0, 0], handR: [0, 0, 0], legL: [0, 0, 0], shinL: [.05, 0, 0], footL: [0, 0, 0], legR: [0, 0, 0], shinR: [.05, 0, 0], footR: [0, 0, 0] };
  const poses = {
    topout: [keys([
      [0, { hips: [.06, 0, 0], spine: [.1, 0, 0], head: [-.42, 0, 0], armL: [-2.3, 0, -.1], foreL: [-.5, 0, 0], handL: [0, 0, 0], armR: [-2.3, 0, .1], foreR: [-.5, 0, 0], handR: [0, 0, 0], legL: [-.8, 0, 0], shinL: [1.1, 0, 0], footL: [.1, 0, 0], legR: [-.8, 0, 0], shinR: [1.1, 0, 0], footR: [.1, 0, 0] }],
      [.17, { hips: [.1, .12, 0], spine: [.3, -.12, 0], head: [-.2, 0, 0] }],
      [.33, { hips: [.2, .05, 0], spine: [.55, 0, 0], head: [-.05, 0, 0] }],
      [.48, { hips: [.25, 0, 0], spine: [.62, 0, 0], head: [-.25, 0, 0], armL: [-1.2, 0, .05], foreL: [-.9, 0, 0], armR: [-1.2, 0, -.05], foreR: [-.9, 0, 0] }],
      [.7, { hips: [.25, 0, 0], spine: [.5, 0, 0], head: [-.3, 0, 0], armL: [-.25, 0, .1], foreL: [-.9, 0, 0], armR: [-.25, 0, -.1], foreR: [-.9, 0, 0] }],
      [1, { hips: [.2, 0, 0], spine: [.42, 0, 0], head: [-.28, .25, 0], armL: [-.1, 0, .12], foreL: [-1.1, 0, 0], armR: [-.1, 0, -.12], foreR: [-1.1, 0, 0] }],
    ]), { time: OVER, once: true }],
    // A soldier knocked out, by where the round came from: thrown back off his feet; down on his knees and onto
    // his face; or spun and dropped on his side. He goes limp, hits the ground, settles. (His left is +x: an arm
    // or leg out to his left turns +z, to his right -z.)
    fallBack: [keys([
      [0, { ...STAND, drop: 0, shift: [0, 0, 0] }],
      [.1, { hips: [-.12, 0, 0], spine: [-.28, .1, 0], head: [-.35, 0, 0], armL: [-.5, 0, .6], foreL: [-.5, 0, 0], armR: [-.3, 0, -.8], foreR: [-.7, 0, 0], legL: [-.1, 0, 0], shinL: [.3, 0, 0], legR: [.1, 0, 0], shinR: [.25, 0, 0], drop: .02, shift: [0, 0, -.03] }],
      [.38, { hips: [-.55, 0, .05], spine: [-.2, 0, 0], head: [-.1, 0, 0], armL: [-.9, 0, 1], foreL: [-.6, 0, 0], armR: [-.7, 0, -1.1], foreR: [-.5, 0, 0], legL: [-.75, 0, .08], shinL: [1.5, 0, 0], legR: [-.5, 0, -.1], shinR: [1.3, 0, 0], drop: .2, shift: [0, 0, -.22] }],
      [.62, { hips: [-1.42, 0, .06], spine: [.12, 0, 0], head: [.3, 0, 0], armL: [-.5, 0, 1.2], foreL: [-.5, 0, 0], armR: [-.3, 0, -1], foreR: [-.8, 0, 0], legL: [-.9, 0, .12], shinL: [1.5, 0, 0], legR: [-.54, 0, -.2], shinR: [.91, 0, 0], footR: [-.87, 0, 0], drop: .476, shift: [0, 0, -.5] }],
      [.74, { hips: [-1.6, 0, .06], spine: [.02, 0, 0], head: [.1, .1, 0], drop: .468 }],
      [1, { hips: [-1.62, 0, .06], spine: [0, 0, 0], head: [.42, .45, 0], armL: [.23, 0, 1.15], foreL: [0, 0, 0], armR: [.16, 0, -.55], foreR: [-1, 0, 0], legL: [-.6, 0, .14], shinL: [1.45, 0, 0], footL: [.72, 0, 0], legR: [-.07, 0, -.24], shinR: [.35, 0, 0], footR: [0, 0, 0], drop: .481, shift: [0, 0, -.52] }],
    ]), { time: 1.05, once: true }],
    fallFront: [keys([
      [0, { ...STAND, drop: 0, shift: [0, 0, 0] }],
      [.1, { hips: [.1, 0, 0], spine: [.3, -.1, 0], head: [.3, 0, 0], armL: [-.3, 0, .5], foreL: [-.6, 0, 0], armR: [-.2, 0, -.6], foreR: [-.8, 0, 0], legL: [-.25, 0, 0], shinL: [.5, 0, 0], legR: [.05, 0, 0], shinR: [.4, 0, 0], drop: .03, shift: [0, 0, .03] }],
      [.36, { hips: [.35, 0, 0], spine: [.45, 0, 0], head: [.1, 0, 0], armL: [-1.2, 0, .4], foreL: [-.9, 0, 0], armR: [-.9, 0, -.5], foreR: [-1.1, 0, 0], legL: [-.35, 0, 0], shinL: [1.7, 0, 0], legR: [-.2, 0, 0], shinR: [1.6, 0, 0], drop: .26, shift: [0, 0, .12] }],
      [.5, { hips: [.94, 0, .03], spine: [.14, 0, 0], head: [-.18, .28, 0], armL: [-2.34, 0, .62], foreL: [-.62, 0, 0], armR: [-.37, 0, -.72], foreR: [-.65, 0, 0], legL: [-.16, 0, .06], shinL: [1.04, 0, 0], footL: [0, 0, 0], legR: [-.15, 0, -.08], shinR: [1.04, 0, 0], footR: [-.04, 0, 0], drop: .332, shift: [0, 0, .337] }],   // (on his knees, going over)
      [.62, { hips: [1.4, 0, .05], spine: [-.1, 0, 0], head: [-.35, .5, 0], armL: [-3, 0, .8], foreL: [-.4, 0, 0], armR: [.05, 0, -.9], foreR: [-.3, 0, 0], legL: [.02, 0, .1], shinL: [.5, 0, 0], legR: [.05, 0, -.15], shinR: [.9, 0, 0], drop: .474, shift: [0, 0, .48] }],
      [.75, { hips: [1.5, 0, .05], drop: .474 }],
      [1, { hips: [1.52, 0, .05], spine: [.18, 0, 0], head: [-.72, .7, 0], armL: [-3.08, 0, .9], foreL: [0, 0, 0], armR: [-.25, 0, -1], foreR: [0, 0, 0], legL: [-.06, 0, .12], shinL: [.12, 0, 0], footL: [.84, 0, 0], legR: [-.1, 0, -.2], shinR: [.43, 0, 0], footR: [-.05, 0, 0], drop: .486, shift: [0, 0, .5] }],
    ]), { time: 1.05, once: true }],
    fallRight: [keys([
      [0, { ...STAND, drop: 0, shift: [0, 0, 0] }],
      [.1, { hips: [0, .15, .1], spine: [.05, .25, .22], head: [0, .2, .3], armL: [-.4, 0, .9], foreL: [-.5, 0, 0], armR: [-.2, 0, -.3], foreR: [-.6, 0, 0], legL: [-.1, 0, 0], shinL: [.3, 0, 0], legR: [0, 0, 0], shinR: [.3, 0, 0], drop: .02, shift: [-.03, 0, 0] }],
      [.38, { hips: [.1, .3, .55], spine: [.2, .2, .2], head: [.1, 0, .2], armL: [-.8, 0, .9], foreL: [-.8, 0, 0], armR: [-.6, 0, -.4], foreR: [-1, 0, 0], legL: [-.5, 0, 0], shinL: [1.3, 0, 0], legR: [-.7, 0, 0], shinR: [1.5, 0, 0], drop: .22, shift: [-.2, 0, 0] }],
      [.62, { hips: [.1, .35, 1.4], spine: [.25, .1, .1], head: [.1, 0, .3], armL: [-1, 0, .2], foreL: [-.9, 0, 0], armR: [-1.2, 0, .1], foreR: [-.9, 0, 0], legL: [-.7, 0, 0], shinL: [1.2, 0, 0], legR: [0, 0, 0], shinR: [.85, 0, 0], drop: .432, shift: [-.46, 0, 0] }],
      [.75, { hips: [.1, .35, 1.4], drop: .43 }],
      [1, { hips: [.1, .35, 1.4], spine: [.3, .1, .15], head: [.2, 0, .81], armL: [-.94, 0, -.67], foreL: [-.71, 0, 0], armR: [-1.22, 0, .11], foreR: [-.96, 0, 0], legL: [-.8, 0, 0], shinL: [1.25, 0, 0], legR: [.19, 0, 0], shinR: [.8, 0, 0], drop: .439, shift: [-.48, 0, 0] }],
    ]), { time: 1.05, once: true }],
    // down on his right knee to fire, bladed to his target (the arms are then brought onto the rifle). The knee and the toes
    // behind it are on the ground, and the front foot flat: the hips' drop and the legs' turns are fitted to the body's own measures.
    kneel: [p => { const b = S(p * TAU) * .006; return { j: { hips: [.04, -.25, 0], spine: [.14 + b, .2, 0], head: [-.05, .05, 0], legL: [-1.71, 0, .1], shinL: [1.53, 0, 0], footL: [.12, 0, 0], legR: [.38, 0, -.06], shinR: [1.17, 0, 0], footR: [.92, 0, 0], armL: [-.5, 0, .1], foreL: [-1, 0, 0], armR: [-.3, 0, -.1], foreR: [-1.2, 0, 0] }, drop: .27 }; }, { time: 4 }],
    // right down behind cover, on the balls of his feet, his head under the top of a low wall
    duck: [p => { const b = S(p * TAU) * .005; return { j: { hips: [.25, 0, 0], spine: [.62 + b, 0, 0], head: [.05, 0, 0], legL: [-2.05, 0, .16], shinL: [2.45, 0, 0], footL: [-.17, 0, 0], legR: [-1.9, 0, -.14], shinR: [2.5, 0, 0], footR: [-.38, 0, 0], armL: [-.75, 0, .12], foreL: [-1.3, 0, 0], armR: [-.6, 0, -.1], foreR: [-1.4, 0, 0] }, drop: .311 }; }, { time: 3.5 }],
    // a round cracks past: he ducks his head into his shoulders, half down, and looks for where it came from
    flinch: [keys([
      [0, { ...STAND, drop: 0 }],
      [.22, { hips: [.12, 0, 0], spine: [.5, .15, 0], head: [.35, .2, 0], armL: [-1.1, 0, .35], foreL: [-2, 0, 0], armR: [-.9, 0, -.3], foreR: [-1.9, 0, 0], legL: [-.55, 0, .05], shinL: [1.1, 0, 0], footL: [-.59, 0, 0], legR: [-.4, 0, -.05], shinR: [1, 0, 0], footR: [-.71, 0, 0], drop: .075 }],
      [.6, { spine: [.45, .1, 0], head: [.2, -.35, 0], drop: .07 }],
      [1, { hips: [.03, 0, 0], spine: [.15, 0, 0], head: [0, 0, 0], armL: [-.2, 0, .1], foreL: [-.7, 0, 0], armR: [-.2, 0, -.1], foreR: [-.8, 0, 0], legL: [-.15, 0, 0], shinL: [.3, 0, 0], footL: [-.12, 0, 0], legR: [-.1, 0, 0], shinR: [.25, 0, 0], footR: [-.13, 0, 0], drop: .005 }],
    ]), { time: .6, once: true }],
    // The zip line. Under the bar with both hands on it: a look down the line, he sinks, then springs and his knees come up
    zipReady: [keys([
      [0, { hips: [0, 0, 0], spine: [-.04, 0, 0], head: [.02, 0, 0], legL: [-.06, .08, .03], shinL: [.12, 0, 0], footL: [0, 0, 0], legR: [.05, -.08, -.03], shinR: [.1, 0, 0], footR: [0, 0, 0], armL: [-2.9, 0, -.2], foreL: [-.2, 0, 0], handL: [0, 0, 0], armR: [-2.9, 0, .2], foreR: [-.2, 0, 0], handR: [0, 0, 0], drop: 0 }],
      [.4, { head: [.16, .12, 0], spine: [0, .05, 0] }],
      [.72, { hips: [.14, 0, 0], spine: [.12, 0, 0], head: [-.05, 0, 0], legL: [-.55, .06, .05], shinL: [1.05, 0, 0], footL: [-.62, 0, 0], legR: [-.45, -.06, -.05], shinR: [.95, 0, 0], footR: [-.62, 0, 0], drop: .07 }],
      [1, { hips: [-.12, 0, 0], spine: [.04, 0, 0], head: [-.2, 0, 0], legL: [-1.0, 0, .02], shinL: [1.6, 0, 0], footL: [.45, 0, 0], legR: [-.6, 0, -.02], shinR: [1.25, 0, 0], footR: [.45, 0, 0], drop: 0 }],
    ]), { time: 1, once: true }],
    // riding it: tucked up under the bar, the legs working a little against the swing
    zipRide: [p => { const s = S(p * TAU), c = S(p * TAU * 2 + .7); return { j: { hips: [-.16 + .03 * s, .05 * s, 0], spine: [.08, -.05 * s, 0], head: [-.22, .14 * s, 0], legL: [-1.05 + .07 * s, 0, .02], shinL: [1.62 + .08 * c, 0, 0], footL: [.45, 0, 0], legR: [-.8 - .07 * s, 0, -.02], shinR: [1.38 - .08 * c, 0, 0], footR: [.45, 0, 0], armL: [-3, 0, -.2], foreL: [-.12, 0, 0], handL: [0, 0, 0], armR: [-3, 0, .2], foreR: [-.12, 0, 0], handR: [0, 0, 0] }, drop: 0 }; }, { time: 2.6 }],
    // coming in: the feet out in front to take the roof
    zipBrace: [() => ({ j: { hips: [-.28, 0, 0], spine: [.14, 0, 0], head: [-.1, 0, 0], legL: [-1.25, 0, .03], shinL: [.4, 0, 0], footL: [-.25, 0, 0], legR: [-1.05, 0, -.03], shinR: [.55, 0, 0], footR: [-.2, 0, 0], armL: [-3, 0, -.2], foreL: [-.12, 0, 0], handL: [0, 0, 0], armR: [-3, 0, .2], foreR: [-.12, 0, 0], handR: [0, 0, 0] }, drop: 0 }), 0],
    // the feet strike, he folds right down over them, a hand out for balance, then up and a look across the valley
    zipLand: [keys([
      [0, { hips: [-.28, 0, 0], spine: [.14, 0, 0], head: [-.1, 0, 0], legL: [-1.25, 0, .03], shinL: [.4, 0, 0], footL: [-.25, 0, 0], legR: [-1.05, 0, -.03], shinR: [.55, 0, 0], footR: [-.2, 0, 0], armL: [-3, 0, -.2], foreL: [-.12, 0, 0], handL: [0, 0, 0], armR: [-3, 0, .2], foreR: [-.12, 0, 0], handR: [0, 0, 0], drop: 0 }],
      [.1, { hips: [0, 0, 0], spine: [.2, 0, 0], legL: [-.7, .06, .05], shinL: [.72, 0, 0], footL: [.26, 0, 0], legR: [-.5, -.06, -.05], shinR: [.7, 0, 0], footR: [-.2, 0, 0], armL: [-2.3, 0, .05], foreL: [-.5, 0, 0], armR: [-2.3, 0, -.05], foreR: [-.5, 0, 0], drop: .039 }],
      [.3, { hips: [.3, 0, 0], spine: [.6, 0, 0], head: [-.45, 0, 0], legL: [-2.13, .06, .16], shinL: [2.14, 0, 0], footL: [.07, 0, 0], legR: [-1.14, -.06, -.14], shinR: [2.3, 0, 0], footR: [.87, 0, 0], armL: [-.95, 0, .25], foreL: [-.5, 0, 0], armR: [-.5, 0, -.5], foreR: [-.9, 0, 0], drop: .288 }],
      [.52, { hips: [.26, 0, 0], spine: [.52, 0, 0], head: [-.4, .1, 0], drop: .288 }],
      [.82, { hips: [.06, 0, 0], spine: [.14, 0, 0], head: [-.05, .3, 0], legL: [-.16, .08, .04], shinL: [.3, 0, 0], footL: [-.19, 0, 0], legR: [.02, -.08, -.04], shinR: [.12, 0, 0], footR: [-.19, 0, 0], armL: [-.08, 0, .09], foreL: [-.35, -.2, 0], armR: [.05, 0, -.09], foreR: [-.3, .2, 0], drop: .01 }],
      [1, { hips: [.02, 0, 0], spine: [.05, .1, 0], head: [0, .42, 0], ...EASE, drop: 0 }],
    ]), { time: 1.35, once: true }],
    // his body on the ladder (the arms and legs are placed on the rungs): leaning in, looking up, the hips
    // swinging over the foot that pushes
    ladder: [p => { const s = S(p * TAU); return { j: { hips: [.06, .05 * s, .03 * s], spine: [.1, -.09 * s, .07 * s], head: [-.42, 0, -.03 * s], armL: [-2.3, 0, -.1], foreL: [-.5, 0, 0], handL: [0, 0, 0], armR: [-2.3, 0, .1], foreR: [-.5, 0, 0], handR: [0, 0, 0], legL: [-.2, 0, 0], shinL: [.35, 0, 0], footL: [.1, 0, 0], legR: [-.2, 0, 0], shinR: [.35, 0, 0], footR: [.1, 0, 0] }, drop: 0, shift: [.035 * s, 0, 0] }; }, 0],
    // riding out on a wagon's roof: low on his right knee, sitting back on his heel, his right hand down on the roof beside him
    // and his left arm across his knee, his head up to look along the train
    ride: [p => { const s = S(p * TAU) * .012; return { j: { hips: [.1, -.2, 0], spine: [.45 + s, .12, .41], head: [-.45, .1, -.2], legL: [-2.15, 0, .14], shinL: [2.37, 0, 0], footL: [-.32, 0, 0], legR: [-1.1, 0, -.08], shinR: [2.7, 0, 0], footR: [.6, 0, 0], armL: [-.95, 0, .1], foreL: [-.9, -.6, 0], handL: [0, 0, 0], armR: [-.38, 0, -.36], foreR: [-.06, 0, 0], handR: [-.9, 0, 0] }, drop: .369 }; }, { time: 2.2 }],
  };
  // (the same to his left: left and right swapped, turned the other way)
  const flip = f => p => { const s = f(p), j = {}; for (const k in s.j) { const a = s.j[k], c = k[k.length - 1]; j[c === 'L' ? k.slice(0, -1) + 'R' : c === 'R' ? k.slice(0, -1) + 'L' : k] = [a[0], -a[1], -a[2]]; } return { j, drop: s.drop, shift: s.shift && [-s.shift[0], s.shift[1], s.shift[2]] }; };
  poses.fallLeft = [flip(poses.fallRight[0]), poses.fallRight[1]];
  return { GAP, BACK, TOP, FLOOR, RAIL, Y_END, OVER, ladder, topOut, poses };
})();
// ---- end moves
const POOL = {};
// Hands: open and easy when they hold nothing, closed round what they do hold (0 flat .. 1 a fist; null as sculpted, round a
// rifle's stock). Fingers stay as they were last set, so this sets them only when they change.
const EASY = .3, HELD = .9;
function hands(m, L, R = L) { const u = m.userData; if (u.fL !== L || u.fR !== R) { u.fL = L; u.fR = R; m.fingers({ L, R }); } }
// Feet kept on the floor through a move that takes them off it (a fall, a landing; the key poses are fitted to the ground, the way
// between them is not). A foot the move would take under his floor is lifted onto it (lift: 0..1 how far), and while he is still on
// his feet each is held where `pins` has it, its sole flat (pin: 0..1). In his own space: his floor is `floor` under him. After rig.update().
const _fl = { footL: new Vector3(), footR: new Vector3() }, _fe = new Vector3(), _fh = { blend: { footL: 0, footR: 0 }, level: { L: 0, R: 0 } };
const BALL = [0, -.07, .1], HEEL = [0, -.07, -.05], TOES = [0, -.07, .19], SOLE = .009;   // (the ball, heel and toes of a foot in its bone, and how high the ball is when he stands)
function floorFeet(m, lift = 1, pins = null, pin = 0, floor = 0) {
  m.updateMatrixWorld(true); let any = false;
  for (const sd of ['L', 'R']) {
    const n = 'foot' + sd, at = m.bones[n].matrixWorld, p = m.worldToLocal(_fl[n].fromArray(BALL).applyMatrix4(at)), x = p.x, y = p.y, z = p.z;
    const ends = Math.min(m.worldToLocal(_fe.fromArray(HEEL).applyMatrix4(at)).y, m.worldToLocal(_fe.fromArray(TOES).applyMatrix4(at)).y), dug = lift > 0 && ends < floor - .012;   // (its heel or toes in the floor: laid flat)
    if (pins && pin > 0) p.lerp(pins[n], pin);
    if (p.y < floor + SOLE - .004 || dug) p.y += Math.max(0, floor + SOLE - p.y) * lift;
    const moved = dug || Math.abs(p.x - x) + Math.abs(p.y - y) + Math.abs(p.z - z) > .002;
    _fh.blend[n] = moved ? 1 : 0; _fh.level[sd] = moved ? Math.max(pin, dug ? lift : lift * .6) : 0; any ||= moved; m.localToWorld(p);
  }
  if (any) m.touch(_fl, _fh);
}
// where the balls of his feet are now, in his own space and on his floor (for floorFeet's pins)
function feetNow(m, to) {
  m.updateMatrixWorld(true);
  for (const n of ['footL', 'footR']) { m.worldToLocal((to[n] ||= new Vector3()).fromArray(BALL).applyMatrix4(m.bones[n].matrixWorld)); to[n].y = SOLE; }
  return to;
}
function man(look) {
  const list = POOL[look] ||= [];
  const free = list.find(f => !f.userData.used);
  if (free) { free.userData.used = true; free.visible = true; free.userData.k = 0; free.lod = 2; hands(free, EASY); return free; }
  const firsts = folk(look), root = list.length < firsts.length ? firsts[list.length] : firsts[list.length % firsts.length].twin();
  const none = { visible: true }, gun = look === 'officer' ? null : soldierRifle(look === 'rook' || look === 'wren');
  if (gun) { root.bones.spine.add(gun); gun.position.copy(HOLDS.slung.p); gun.quaternion.copy(HOLDS.slung.q); }
  root.rig.add('shoulder', SHOULDER).add('call', CALL); for (const k in MOVES.poses) root.rig.add(k, ...MOVES.poses[k]);
  // (slung, the rifle hangs from his shoulder: it bounces to his step and swings as he starts, stops and turns; carry() adds that)
  const sling = gun && look !== 'wren' ? root.rig.hang(gun, { pivot: SLING, apply: false, swing: .03, bounce: .002, most: .2, away: [0, 0, -1] }) : null;
  root.userData = { used: true, look, rifle: gun || none, gun, sling, pack: root.gear.pack || none, aerial: none, helmet: root.gear.hat || none, k: 0 };
  hands(root, EASY);
  root.lod = 2;   // far off until see() says otherwise (behind the field file nobody is looked at, and a squad at full detail is a lot to draw)
  list.push(root); WD.v.scene.add(root);
  return root;
}
// A rifle where it belongs for what its man is doing: slung behind the shoulder while he is calm, held low
// in both hands once he is alert, up in the shoulder to aim (h: 0 slung .. 1 in hands). Seen close, both
// arms are bent to bring the hands onto it. Call after rig.update().
// pitch: how far above (or below) him his target is, radians: the muzzle rises about the butt in his shoulder.
const _hp = new Vector3(), _hq = new THREE.Quaternion(), _hx = new Vector3(), _hb = new Vector3(), _hr = new THREE.Quaternion(), BUTT = [0, -.045, .36];
const SLING = [-.17, .4, -.08], _sv = new Vector3(...SLING), _sp = new Vector3(), _sq = new THREE.Quaternion(), _se = new THREE.Euler();   // where the sling lies over his shoulder, in his chest's space
function carry(m, h, dt, close, pitch = 0) {
  const u = m.userData, g = u.gun; if (!g || !g.visible) return;
  u.k += (h - u.k) * Math.min(1, dt * 6); u.pitch = (u.pitch || 0) + (pitch - (u.pitch || 0)) * Math.min(1, dt * 4);
  const a = m.rig.top === 'shoulder' ? m.rig.topW : 0, k = u.k < .02 ? 0 : u.k > .98 ? 1 : u.k;
  _hp.copy(HOLDS.ready.p).lerp(HOLDS.aim.p, a); _hq.copy(HOLDS.ready.q).slerp(HOLDS.aim.q, a);
  if (a > .01 && Math.abs(u.pitch) > .005) {
    _hb.fromArray(BUTT).applyQuaternion(_hq).add(_hp);   // the butt, where it sits now
    _hq.premultiply(_hr.setFromAxisAngle(_hx.set(1, 0, 0).applyQuaternion(_hq), u.pitch * a));
    _hp.fromArray(BUTT).applyQuaternion(_hq).negate().add(_hb);
  }
  const sl = u.sling;
  if (sl && k < 1 && (sl.x || sl.z || sl.y)) {   // swinging on its sling, about the shoulder
    _sq.setFromEuler(_se.set(sl.x, 0, sl.z)); _sp.copy(HOLDS.slung.p).sub(_sv).applyQuaternion(_sq).add(_sv); _sp.y += sl.y;
    g.position.copy(_sp).lerp(_hp, k); g.quaternion.copy(_sq.multiply(HOLDS.slung.q)).slerp(_hq, k);
  } else { g.position.copy(HOLDS.slung.p).lerp(_hp, k); g.quaternion.copy(HOLDS.slung.q).slerp(_hq, k); }
  hands(m, k > .5 ? null : EASY);   // closed round the stock once the rifle is in his hands
  if (k > .5 && close) m.hold(g, GRIP, FORE);
}
// Wren up close (the ladder, the zip line, the train): the same kind of person, in his knitted cap and
// scarf, the scoped rifle slung across his back (at dusk the lamps of a move light him: see STAGE)
function wrenFigure() {
  const w = man('wren'), g = w.userData.gun; POOL.wren.length = 0; g.position.copy(HOLDS.back.p); g.quaternion.copy(HOLDS.back.q); w.userData.gun = null;
  w.rig.hang(g, { pivot: [-.12, .42, -.14], swing: .006, bounce: .0012, most: .08, away: [0, 0, -1] });   // (held at shoulder and hip by its sling: it bounces to his stride more than it swings)
  return w;
}
function freeMen() { for (const k in POOL) for (const f of POOL[k]) { f.userData.used = false; f.visible = false; } }

// ------------------------------------------------------------------ campaign
const CHAPTERS = [{ id: 'ashvale', name: 'Ashvale', missions: [
  { id: 'm1', name: 'The Mill Radio', stars: ['Finish', 'Stop the call inside 30 s', 'Finish under 3:00'], collect: 3 },
  { id: 'm2', name: 'Bells at Dusk', stars: ['Finish', 'Every one of Hale\'s squad home', 'Marksman with your first shot'], collect: 3 },
] }];
const SEALED = [['3', 'The Dam'], ['4', 'Night Rail'], ['5', 'Long Shadow']];
const BRIEF = {
  m1: 'Dawn. A Grey Order radio post in the old mill. Stop the operator before he calls in their column, then get out on the supply train.',
  m2: 'Dusk and rain. Sergeant Hale\'s squad must cross the stone bridge into Larkford. Find their marksman, silence the gun nest, keep the squad alive.',
};
const OAKE = 'CAPT. OAKE', HALE = 'SGT. HALE';
// Each mission's light (gs.sky keyframes: hour -> colours; the sun's strength is x the light's own).
// Mission 1: a clear golden morning with mist lying in the valley. Mission 2: a storm rolling in at
// dusk, a band of low sun under the clouds, wet roads and lit windows.
const NIGHT = [[0, { top: '#06080f', horizon: '#161a28', sun: '#7088c0', sunI: .12, amb: .35 }], [5, { top: '#10162a', horizon: '#3a3a4a', sun: '#8090c0', sunI: .15, amb: .4 }]];
const DAY_CLEAR = [...NIGHT,
  [6.3, { top: '#50648c', horizon: '#d8b494', sun: '#ffaa66', sunI: .5, amb: .45 }],
  [7.6, { top: '#5f86c0', horizon: '#d6d6d0', sun: '#ffd8a4', sunI: 1.4, amb: .42 }],   // (a strong low sun over a dim sky: long shadows with some depth to them)
  [10, { top: '#6a90c4', horizon: '#d2dad6', sun: '#fff0d8', sunI: 1.45, amb: .48 }],
  [16, { top: '#6a90c4', horizon: '#d2dad6', sun: '#fff0d8', sunI: 1.45, amb: .48 }],
  [20, { top: '#121a30', horizon: '#3a3448', sun: '#8090c0', sunI: .15, amb: .4 }],
  [24, { top: '#06080f', horizon: '#161a28', sun: '#7088c0', sunI: .12, amb: .35 }],
];
const DAY_STORM = [...NIGHT,
  [8, { top: '#4a5260', horizon: '#8a8e90', sun: '#e8e0d0', sunI: .45, amb: .7 }],
  [16, { top: '#3e4654', horizon: '#80868a', sun: '#e0d4c0', sunI: .4, amb: .65 }],
  [17.75, { top: '#2a303c', horizon: '#9a7a62', sun: '#ff9a52', sunI: .6, amb: .62 }],
  [19, { top: '#141824', horizon: '#3e3236', sun: '#8a7080', sunI: .15, amb: .35 }],
  [24, { top: '#06080f', horizon: '#161a28', sun: '#7088c0', sunI: .12, amb: .35 }],
];
const MOODS = {
  m1: {   // 8:24: the sun sits just above the view when you face it from the water tower
    time: 8.4, tilt: -.3, day: DAY_CLEAR, physical: { haze: 2.2, bright: .52 }, clouds: .3, gap: .55, cloudLight: null, cloudDark: null,
    air: { haze: .00038, mist: .0016, mistFall: .24, mistY: -1.5, patchy: .9, cloudShade: .38, wind: [5, -1.5], wet: 0, colour: '#b9c3ca', sunColour: '#e9e0d2' },   // (clear air: the mist keeps to the river; pale toward the sun, so far ridges fade into the sky)
    grade: { saturation: 1.2, contrast: 1.28, shadows: '#dae2f4', highlights: '#fff0d6' }, glare: .6, shafts: .6, exposure: .98, bloom: .22, env: .6, windows: 0,
    // a colour slide of the period: warm, rich greens, blacks lifted a touch as on an old print
    lut: (r, g, b) => { const l = .3 * r + .59 * g + .11 * b, k = 1.06; return [r, g, b].map((x, i) => { const v = l + (x - l) * k; return .025 + .965 * clamp(v + [.012, .004, -.016][i] * (1 - l) + [.01, .003, -.012][i] * l, 0, 1); }); },
    lutAmount: .8, flare: { strength: .45, threshold: .5, dirt: .35, tint: [1, .9, .78] },
  },
  m2: {
    time: 17.75, tilt: .12, day: DAY_STORM, physical: false, clouds: .86, gap: .4, cloudLight: '#8c8a8a', cloudDark: '#2a2e36',
    air: { haze: .0014, mist: .005, mistFall: .1, mistY: -1, patchy: .7, cloudShade: .5, wind: [-8, 1], wet: .85, colour: '#5f646c', sunColour: '#a8785a' },
    grade: { saturation: .82, contrast: 1.1, shadows: '#d2dcee', highlights: '#ffeedc' }, glare: .4, shafts: .25, exposure: 1.02, bloom: .45, env: .65, windows: 1.8,
    // a storm on news film: colour bled out, deep blue-grey shadows, the lamplight still warm
    lut: (r, g, b) => { const l = .3 * r + .59 * g + .11 * b, w = clamp((l - .45) * 2 + .5, 0, 1); return [r, g, b].map((x, i) => clamp(l + (x - l) * .78 + [-.02, -.006, .026][i] * (1 - w) + [.02, .006, -.02][i] * w * w, 0, 1)); },
    lutAmount: .7, flare: { strength: .3, threshold: .35, dirt: .5, tint: [1, .85, .7] },
  },
};
// trees swap to fewer leaves past these distances (further when you look through the scope)
const TREE_LOD = [85, 240], FIR_LOD = [60, 130];   // (the firs are a wood seen from far off: many, and cards sooner)
// lit windows at dusk: the strength of the light each throws, and the height the village stands at (to find where you look)
const WIN_LIGHT = 6, VILLAGE_Y = 6, STAGE = [6, 1.3];

// ------------------------------------------------------------------ the game
function make(api) {
  const fx = new Juice();
  const camp = new Campaign(CHAPTERS).attach(api);
  const gun = new Gun({ damage: 100, rate: .95, mag: 5, reload: 2.6, spread: 0, bloom: 0, recoil: .03, sideways: .3, recover: 3, auto: false, range: 600, head: 2 });
  const me = new Health({ max: 100, regen: 14, delay: 4 });
  const bodies = new Bodies({ range: 22 });
  bodies.on('found', (b, g) => { g.sus = 1; heat = Math.min(1.2, heat + .12); });
  // The Grey Order's field commander: starts from simple rules (the teacher) and learns how you play
  const boss = new Brain(api, {
    name: 'grey-commander', inputs: 8, actions: ['hold', 'push', 'flank', 'mortar', 'watch'], hidden: [10],
    teacher: s => s[0] < .35 ? (s[1] > .45 ? 'watch' : 'hold') : s[0] < 1 ? 'push' : s[2] > .3 ? 'mortar' : s[3] > .5 ? 'flank' : 'push',
    limits: { react: .9, perSecond: 1 },
    rules: (s, a) => (a === 'mortar' && (s[0] < .9 || s[4] < .35 || s[7] < .15)) ? 'push' : ((a === 'push' || a === 'flank') && s[6] <= 0) ? 'hold' : a,
  });
  // Every rifleman also thinks for himself: a Tiny Brains mind (a slightly changed copy of the shared
  // 'grey-rifleman' brain) picks hold / peek / rush / flank / fall back about once a second. It starts
  // as the rules below (the teacher) and learns which choices made tense, fair fights; the guard rails
  // keep it human: slow to react, few changes of mind, some randomness, and the game's hard rules.
  // inputs: 0 how far (1 = rifle range, 300 m), 1 how sure they are where you are, 2 in cover (1) or
  // not (-1), 3 your scope is on him, 4 shaken (a near miss, a friend down), 5 the commander's push,
  // 6 friends left, 7 how long you've been quiet, 8 his nerve (each man's own, -1 careful .. 1 bold)
  const rifleman = new Brain(api, {
    name: 'grey-rifleman', inputs: 9, hidden: [10], actions: ['hold', 'peek', 'rush', 'flank', 'fallback'],
    teacher: s => s[0] > 1 ? 'rush' : s[3] > .5 && s[2] > 0 ? 'hold' : s[4] > .55 ? (s[2] > 0 ? 'hold' : 'rush') : s[6] < .3 ? 'fallback'
      : s[1] < .4 ? 'hold' : s[8] > .3 && (s[5] > .5 || s[7] > .6) ? (s[5] > .5 && s[5] < .7 && s[6] > .5 ? 'flank' : 'rush') : s[2] < 0 ? 'rush' : 'peek',
    limits: { react: .9, perSecond: .8, minNoise: .06 },
    // hard rules: no shooting blind, one flanker at a time (and not when few are left), no running off the map
    rules: (s, a) => a === 'peek' && s[1] < .3 ? 'hold' : a === 'flank' && (s[6] < .4 || squad.t - squad.lastFlank < 8) ? 'rush' : a === 'fallback' && s[0] > 1.3 ? 'hold' : a,
  });
  const riflemen = new Wave(rifleman);
  // Colonel Marr, who runs the Grey Order in the valley, remembers Wren between sessions (Tiny Brains'
  // Nemesis): how often they've met, who's ahead, and how Wren covers his shots. Once he's sure of a
  // habit (always the bell, always the train) his men sometimes listen for it, and he says so on the
  // radio first, so it's fair. He never does it while you're on a losing run, and his lines after a
  // loss are kind.
  const SHOT_KINDS = ['the train', 'the bell', 'the thunder', 'silence'];
  const marr = new Nemesis(api, { name: 'grey-colonel', moves: SHOT_KINDS, target: .62, lines: {
    first: ['A sniper in Ashvale? Then we hunt one.'], back: ['The sniper again. Eyes on the hills.', 'Same valley, same sniper. Stay low, men.'],
    long: ['{days} days quiet. I had hoped the sniper went home.'], habit: ['This one shoots in {move}. Listen for it.', 'Mark it: the sniper waits for {move}.'],
    won: ['Lucky. The valley is long.', 'Fall back and count heads.'], lost: ['Rest now, sniper. We will meet again.', 'Not today. Get some sleep, whoever you are.'],
    streak: ['{streak} in a row. Who IS this?'],
  } });
  const MARR = 'COL. MARR · GREY ORDER';
  let noises = new Noises(), guard = null, metMarr = false, marrSays = [], built = false, mistT = 0, mistK = 1, lensDrops = [], lensT = 0, lensAcc = 0, mirX = 0, mirT = 0;
  // The commander also thinks a few seconds ahead (Tiny Brains' Imagine) with a rough sketch of the
  // fight: [heat, your favourite nest, quiet, men left, your health, masked, alerted, time, how close
  // they are, mortar ready]. Pushing closes in but costs men while you're watching; flanking is slower
  // and safer; watching finds you; mortars hurt only once they know where you are. Each plan also
  // teaches the brain. On phones that can't spare the time it switches itself off (auto) and the
  // brain decides alone, as before.
  const BOSS_ACTS = ['hold', 'push', 'flank', 'mortar', 'watch'];
  const plan = new Imagine({
    actions: BOSS_ACTS, depth: 12, dt: .25, tries: 1, budget: .6, auto: true, brain: boss, see: q => q.slice(0, 8),
    fallback: () => boss.action,     // the brain already decided this second (below)
    step(q, a, dt) {
      const n = q.slice(), act = BOSS_ACTS[a], open = n[5] < 0, near = 1 - n[8];
      const lose = (open ? .02 : .006) * n[3] * (n[0] >= 1 ? 1.2 : .6);    // your shots thin them out
      if (act === 'push') { n[8] = Math.max(0, n[8] - .06 * dt * 4); n[3] = Math.max(0, n[3] - lose * 1.6); }
      else if (act === 'flank') { n[8] = Math.max(0, n[8] - .035 * dt * 4); n[3] = Math.max(0, n[3] - lose * .8); }
      else if (act === 'watch') { n[0] = Math.min(1.2, n[0] + .03 * dt * 4 * (1 + n[1])); n[3] = Math.max(0, n[3] - lose * .3); }
      else if (act === 'mortar') { if (n[0] >= 1 && n[9] > 0) { n[4] = Math.max(0, n[4] - .2); n[9] = 0; } n[3] = Math.max(0, n[3] - lose * .3); }
      else n[3] = Math.max(0, n[3] - lose * .4);
      if (n[6] > 0) n[4] = Math.max(0, n[4] - .012 * dt * 4 * near * near * n[3]);   // close in and they hit you
      n[2] = Math.min(1, n[2] + dt / 20); n[7] = Math.min(1, n[7] + dt / 120);
      return n;
    },
    score: q => (1 - q[4]) * 1.4 + q[3] * .9 + (1 - q[8]) * .25 + Math.min(1, q[0]) * .2,
  });
  const endMind = (s, feel = 0) => { if (!s.mind) return; if (feel) s.mind.feel(feel); s.mind.done(); s.mind = null; };
  // what they shout to each other (on the radio, with a crackle); never over your own side's orders
  const CALLS = {
    contact: ['Contact! Sniper!', 'Sniper! Get down!'], flanking: ['Going round the side!', 'Flanking. Keep him busy!', 'I\'ll get round behind him!'],
    'falling back': ['Fall back!', 'Back, back! Find cover!'], 'man down': ['Man down!', 'They got Brenner!', 'Vogt is hit!'], grenade: ['Grenade! Cover me!', 'Throwing!'],
    covering: ['Covering fire!', 'Keep his head down!'], moving: ['Move up! Go!', 'Moving!'], 'heads down': ['Stay low, he\'s watching!', 'Heads down!'],
  };
  let lastCall = -99;
  function callout(who, what) {
    const l = CALLS[what]; if (!l || t - lastCall < 3.2 || (lineFx && !lineFx.enemy)) return;
    lastCall = t; say(l[(Math.random() * l.length) | 0], 'GREY ORDER · RADIO', 1.6, true);
    noise(.12, { vol: .035, from: 3200, to: 1800 }); tone(1250, { len: .04, wave: 'square', vol: .012 });
  }
  let mission, mid, state, t, score, men, allies, nest, nestId, look, scoped, glass, zoom, breath, gasp, heat, located, alertedN, squad, shots, bulletCam, train, timers;
  let cut, qte, qteKind, zip, move, mortar, bell, storm, sky, rain, tower, drums, car, op, cs, mgNest, sel, favour, saveNest, tagT, hits, ptr, pinch, lastShotT, firstShotHit, opTime, coverMsg, lineFx, slowmo, keys, endT, outroDone, briefT, quietT, mortarCool;

  const tmpV = new Vector3(), tmpA = new Vector3(), tmpB = new Vector3();
  const HOLD = 1.25;   // seconds the camera holds on a hit
  const nestEye = n => { const y = WD.land.height(n.x, n.z) + n.up + .5; return { x: n.x + (n.ex || 0), y, z: n.z + (n.ez || 0) }; };
  const groundAt = (x, z) => (Math.abs(x - BRIDGE.x) < 3 && z > BRIDGE.z0 && z < BRIDGE.z1) ? WD.deckY(z) : WD.ground(x, z);
  const dirOf = (yaw, pitch, out = tmpV) => out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const fovNow = () => 62 / (scoped ? zoom : glass ? 3.2 : 1);

  // ---- soldiers
  function soldier(o) {
    const look_ = o.look || 'grey', m = man(look_);
    const s = { get down() { return this.ko; }, get alive() { return !this.ko; }, kind: 'rifle', x: 0, y: 0, yaw: 0, hp: 1, maxHp: 1, ko: false, alert: false, route: null, ri: 0, wt: 0, speed: 0, path: null, pathTo: null, fireT: rnd(1, 3), order: { do: 'hold' }, tagged: false, look: look_, sus: 0, crouch: false, aimAt: null, vx: 0, vy: 0, ...o, m };
    m.userData.pack.visible = s.kind === 'radio' || s.look === 'ally';
    m.userData.helmet.visible = true; m.userData.rifle.visible = s.kind !== 'officer'; if (m.userData.handset) m.userData.handset.visible = false;
    m.rig.play('idle', { fade: 0 }); m.rig.upper(null); m.rig.layers[m.rig.layers.length - 1].phase = Math.random(); m.rig.sw = null;   // (each breathes and shifts his weight in his own time)
    m.rig.steps = s.kind !== 'cargun'; m.rig.follow?.reset();   // (the car's gunner rides: his feet go with the car; and nothing swings on from the round before)
    s.gy = s.deck ?? groundAt(s.x, s.y) + (s.lift || 0); m.position.set(s.x, s.gy, s.y); m.rotation.set(0, s.yaw, 0);
    return s;
  }
  const alive = list => list.filter(s => !s.ko);
  const wakeUp = (s, why) => {
    if (s.ko || s.alert || s.fixed) return;
    s.alert = true; s.sus = 1; s.alertT = 0; s.shoutT = t; if (!squad.members.includes(s)) squad.members.push(s);
    if (!squad.alerted) { squad.alerted = true; squad.call(s, 'contact'); }
    s.order = { do: 'hold' }; s.plan = null; s.thinkT = rnd(.2, 1.4); s.thinkDt = 0;   // staggered, so they don't all decide at once
    if (!s.mind) s.mind = riflemen.mind();
    if (why === 'body') say('Man down! Sniper!', 'GREY ORDER', 1.6, true);
  };
  // He goes down the way the round throws him: onto his knees and face when it comes from behind, back off his
  // feet when it meets him, onto his side from the side; never into a wall, and he ends lying along the slope.
  const FALLS = { fallFront: [0, 1], fallBack: [0, -1], fallLeft: [1, 0], fallRight: [-1, 0] };
  function fall(s, from) {
    const m = s.m, rel = from ? angDiff(Math.atan2(s.x - from.x, s.y - from.z), s.yaw) : rnd(-Math.PI, Math.PI), sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);   // the way the round travels, against the way he faces
    const order = Math.abs(rel) < .8 ? ['fallFront', 'fallLeft', 'fallRight', 'fallBack'] : Math.abs(rel) > 2.3 ? ['fallBack', 'fallRight', 'fallLeft', 'fallFront'] : rel > 0 ? ['fallLeft', 'fallBack', 'fallFront', 'fallRight'] : ['fallRight', 'fallBack', 'fallFront', 'fallLeft'];
    const at = (lx, lz, r) => [s.x + (lx * cy + lz * sy) * r, s.y + (-lx * sy + lz * cy) * r];
    if (m.gear.pack && m.userData.pack.visible) order.push(...order.splice(order.indexOf('fallBack'), 1));   // (with a pack on his back he goes over on his side or his face rather than lie on it)
    const pick = order.find(n => { const [x, z] = at(...FALLS[n], 1.2); return !solidAt(x, z, WD.solids); }) || order[0];
    s.pins = s.crouch || s.low ? null : feetNow(m, m.userData.pins ||= {});   // where his feet stand: they stay there while his legs give
    // (a man on a knee or ducked is already half way down: his fall starts there, not from standing)
    m.rig.play(pick, { fade: s.crouch ? .16 : .1, again: true, from: s.low ? .36 : s.crouch ? .3 : 0 }); m.rig.upper(null);
    hands(m, EASY); if (m.userData.handset) m.userData.handset.visible = false;   // his hands go slack
    const g = (lx, lz) => { const [x, z] = at(lx, lz, .7); return groundAt(x, z); };
    s.tilt = s.deck == null ? [Math.atan2(g(0, -1) - g(0, 1), 1.4), Math.atan2(g(1, 0) - g(-1, 0), 1.4)] : null; s.fallT = 0; s.still = false; s.act = null; s.thud = false;
  }
  // a man who is down: his fall plays out, his body comes to lie along the ground, and then he is left be
  function lie(s, dt) {
    const m = s.m; if (s.still) return;
    m.rig.update(dt, { speed: 0 });
    { const ph = m.rig.phase; if (ph < .7 && m.lod < 2) floorFeet(m, 1 - sm(.6, .7, ph), s.pins, 1 - sm(.3, .5, ph)); }
    if (s.tilt) { const k = sm(.3, .72, m.rig.phase); m.rotation.order = 'YXZ'; m.rotation.x = s.tilt[0] * k; m.rotation.z = s.tilt[1] * k; }
    if (!s.thud && m.rig.phase > .6) {   // he meets the ground: dust (mud in the rain) from under him
      s.thud = true; const [fx_, fz_] = FALLS[m.rig.state] || [0, 0], sy = Math.sin(s.yaw), cy = Math.cos(s.yaw), x = s.x + (fx_ * cy + fz_ * sy) * .5, z = s.y + (-fx_ * sy + fz_ * cy) * .5;
      if (s.deck == null) for (let i = 0; i < 7; i++) WD.dust.emit({ x: x + rnd(-.4, .4), y: s.gy + .08, z: z + rnd(-.4, .4), vx: rnd(-.9, .9), vy: rnd(.2, .9), vz: rnd(-.9, .9), life: rnd(.8, 1.4), size: .28, grow: 2.2, col: rain.amount > .2 ? [.3, .27, .21] : [.56, .49, .37], a: .32, drag: 2.2, fadeIn: true });
    }
    if (m.rig.done && (s.fallT += dt) > .7) s.still = true;
  }
  // a round cracks past, or the man beside him drops: he ducks his head into his shoulders
  function flinch(s) { if (s.ko || s.act || s.fixed || s.kind !== 'rifle') return; s.act = 'flinch'; s.m.rig.play('flinch', { fade: .08, again: true }); }
  function knockOut(s, head, d, viaCam, from = null) {
    if (warming) return;
    if (s.ko) return;
    s.ko = true; fall(s, from); dropRifle(s);
    // a long duel was a good fight; dropping in the open in his first seconds was a dull one
    endMind(s, s.alert ? (s.alertT > 7 ? .5 : s.alertT < 2 && s.plan !== 'hold' ? -.2 : 0) : 0);
    for (const o of men) if (o !== s && !o.ko && Math.hypot(o.x - s.x, o.y - s.y) < 16) { o.shaken = Math.max(o.shaken || 0, .75); if (Math.hypot(o.x - s.x, o.y - s.y) < 7) flinch(o); }
    squad.hurt(s); squad.cover.free(s);
    bodies.add(s.x, s.y, s);
    let pts = 100; const tags = [];
    if (head) { pts += 100; tags.push('HEAD'); popHelmet(s); }
    if (d > 200) { pts += Math.round(d / 2); tags.push(Math.round(d) + ' M'); }
    if (masked()) { pts += 50; tags.push('COVERED'); }
    if (!s.alert) { pts += 50; tags.push('UNSEEN'); }
    if (viaCam) pts += 50;
    score += pts; api.score(score);
    s.koFx = { pts, tags, t: 0 };
    // no arcade chime: a soft tick to say he's down, then the fall (loud in the bullet cam)
    tone(head ? 1760 : 1320, { len: .07, wave: 'sine', vol: .022 }); haptic(head ? 'success' : 'medium');
    { const k = viaCam ? 1 : .35; soon(.45, () => noise(.22, { vol: .14 * k, from: 420, to: 70, out: aud?.sp?.in })); soon(.62, () => noise(.12, { vol: .07 * k, from: 900, to: 160 })); }
    // a gold burst you can see from the nest; seen up close in the bullet cam it's finer and spreads wider, or 14 of them read as one white blob
    { const k = viaCam ? 2.4 : 1; for (let i = 0; i < 14; i++) WD.sparks.emit({ x: s.x, y: s.gy + 1.6, z: s.y, vx: rnd(-1.5, 1.5) * k, vy: rnd(1, 3) * k, vz: rnd(-1.5, 1.5) * k, life: .9, size: viaCam ? .04 : .16, col: viaCam ? [2.2, 1.7, .5] : [3, 2.4, .6], drag: 2, grav: 2 }); }
    // anyone close and calm hears it and gets suspicious
    for (const o of men) if (!o.ko && !o.alert && Math.hypot(o.x - s.x, o.y - s.y) < 26) o.sus = Math.max(o.sus, .6);
    if (squad.alerted) boss.feel(.3);
  }
  // his rifle falls beside him
  function dropRifle(s) {
    const g = s.m.userData.gun; if (!g || !g.visible) return; g.visible = false;
    const d = WD.dropped[WD.dropN++ % WD.dropped.length], a = s.yaw + rnd(.8, 1.6);
    d.position.set(s.x + Math.sin(a) * .75, s.gy + .03, s.y + Math.cos(a) * .75); d.rotation.set(0, rnd(0, TAU), Math.PI / 2); d.visible = true;
  }
  function popHelmet(s) {
    const h = WD.helmets.find(q => q.life <= 0) || WD.helmets[0]; s.m.userData.helmet.visible = false;
    s.m.bones.head.localToWorld(tmpA.fromArray(h.m.userData.at));
    h.m.position.copy(tmpA); h.m.rotation.set(0, s.yaw, 0); h.m.visible = true; h.life = 4; h.vx = rnd(-1, 1); h.vy = 5; h.vz = rnd(-1, 1); h.spin = rnd(6, 12);
  }
  // (asked for every soldier near every bullet step: the three spheres are filled in place, not made anew)
  function hitSpheres(s, out) {
    const p = s.m.rig.parts;
    if (out.length !== 3) { out.length = 0; out.push([0, 0, 0, .17, true], [0, 0, 0, .27, false], [0, 0, 0, .24, false]); }
    putSphere(out[0], p.head, .165); putSphere(out[1], p.spine, .17); putSphere(out[2], p.hips, -.08);
    return out;
  }
  function putSphere(q, part, up) { part.getWorldPosition(tmpA); q[0] = tmpA.x; q[1] = tmpA.y + up; q[2] = tmpA.z; }
  const SPH = [];

  // ---- the player's shots
  function fire() {
    if (warming) return;
    if (state !== 'play' || move || bulletCam) return;
    const eye = WD.v.cam.position, [sy, sp] = sway();
    const d = dirOf(look.yaw + sy, look.pitch + sp + BORE, tmpB).clone();
    const s = gun.pull({ x: eye.x, y: eye.y, z: eye.z }, d, true); gun.pull(eye, d, false);
    if (!s.length) { if (gun.reloading) tone(220, { len: .05, wave: 'square', vol: .03 }); return; }
    lastShotT = t; if (cs && !cs.ko) gun.shotsAtCs++;
    const b = { x: eye.x, y: eye.y - .05, z: eye.z, x0: eye.x, y0: eye.y - .05, z0: eye.z, vx: d.x * V0, vy: d.y * V0, vz: d.z * V0, life: 2.2, dist: 0, masked: masked() };
    // a shot aimed square at the church bell is drowned by its own clang (and sets it ringing: impact)
    if (!b.masked && bellReady() && onBell(eye, d)) { b.masked = true; b.atBell = true; }
    shots.push(b);
    // loud unless something covers it; the colonel notes what covered it, and when his men are
    // listening for that (he said so on the radio) it covers it only half as well
    const how = train.on && Math.abs(train.x) < 190 ? 'the train' : bell.ring > 0 || b.atBell ? 'the bell' : storm > 0 ? 'the thunder' : 'silence';
    marr.see(how); const heard = b.masked && guard === how;
    heat = clamp(heat + (b.masked ? (heard ? .16 : .04) : .3), 0, 1.2);
    for (const f of WD.flocks) if (Math.hypot(f.x - eye.x, f.z - eye.z) < (b.masked ? 40 : 130)) flush(f, 'shot');
    // the crack carries a long way across the valley: whoever hears it turns towards the hills (gs.senses)
    noises.make(eye.x, eye.z, b.masked ? (heard ? 220 : 50) : 520);
    if (!b.masked && !bell.tip && !lineFx && bellReady()) { bell.tip = true; say('They heard that. Put a round in the church bell, its din will hide your shots.', OAKE, 3.2); }
    rifleReport();
    haptic('heavy'); fx.shake(scoped ? 2 : 5);
    if (!scoped && !glass) { WD.gun.updateWorldMatrix(true, false); const mz = WD.gun.localToWorld(tmpA.set(0, .03, -.74)); muzzle(mz.x, mz.y, mz.z, d.x, d.y, d.z, .3); }
    if (!scoped) for (let i = 0; i < 10; i++) WD.smoke.emit({ x: eye.x + d.x * 1.2, y: eye.y + d.y * 1.2 - .1, z: eye.z + d.z * 1.2, vx: rnd(-.4, .4) + d.x * 2, vy: rnd(0, .5), vz: rnd(-.4, .4) + d.z * 2, life: 1.4, size: .5, grow: 3, col: [.75, .72, .66], a: .35, drag: 2, fadeIn: true });
    // the blast lifts dust off the ground or sill in front of the barrel
    { const fy = nest ? nestEye(nest).y - .45 : eye.y - .5; for (let i = 0; i < 8; i++) WD.dust.emit({ x: eye.x + d.x * rnd(.9, 1.6) + rnd(-.3, .3), y: fy, z: eye.z + d.z * rnd(.9, 1.6) + rnd(-.3, .3), vx: d.x * rnd(1, 3) + rnd(-.6, .6), vy: rnd(.2, 1), vz: d.z * rnd(1, 3) + rnd(-.6, .6), life: rnd(1, 1.8), size: .3, grow: 3, col: rain.amount > .2 ? [.42, .4, .38] : [.62, .56, .46], a: .3, drag: 2, fadeIn: true }); }
    // bullet cam for good long shots (worked out ahead from where things are heading)
    if (!gs.prefs.reduceMotion) {
      const p = predict(b);
      if (p && (p.d > 150 || (p.head && p.d > 90))) { b.cam = p; WD.sparks.list = WD.sparks.list.filter(q => q.size < .5);   // a far muzzle flash is drawn big to show from the nest: up close in slow motion it would be a huge blob
        bulletCam = { b, t: 0, target: p.s, scale: clamp(p.time / 1.9, .02, .4), hold: 0, from: { x: eye.x, y: eye.y, z: eye.z } }; WD.bullet.visible = true;
        // where its camera will stand at the hit: the grass is planted there while the round flies
        bulletCam.pre = holdCam({ at: { x: p.s.x, y: p.s.gy + 1.15, z: p.s.y }, from: bulletCam.from }, p.s);
        tone(880, { len: .5, wave: 'sine', vol: .04, slide: -500 }); }
    }
    boltT = 1.1;
  }
  let boltT = 0, markAt = -1, markV = null;
  // the bolt throws the spent brass out to the right; it tinkles on the stone a moment later
  function ejectCase() {
    if (!scoped && !glass && WD.gun.visible) {
      const fy = nest ? nestEye(nest).y - .5 : WD.v.cam.position.y - 1;
      WD.bolt.updateWorldMatrix(true, false); const p = WD.bolt.localToWorld(tmpA.set(.03, .02, 0)), r = dirOf(look.yaw - Math.PI / 2, 0, tmpB);
      WD.sparks.emit({ x: p.x, y: p.y, z: p.z, vx: r.x * 2.2 + rnd(-.3, .3), vy: rnd(1.6, 2.2), vz: r.z * 2.2 + rnd(-.3, .3), life: .9, size: .035, col: [1.1, .8, .35], a: 1, grav: 9.8, floor: fy });
    }
    metal(.45, 3400, .012); metal(.62, 2900, .008);
  }
  // where a shot fired now would land, on screen: [x, y, range] (worked out every few frames)
  function impactMark() {
    if (markV && frame >= markAt && frame - markAt < 3) return markV;   // (frame starts again with every round: an answer from the round before is never this one's)
    markAt = frame; markV = null;
    // the same path as a real round (drop, wind, the sway now), stepped until it hits something
    const eye = WD.v.cam.position, [sy, sp] = sway();
    const d = dirOf(look.yaw + sy, look.pitch + sp + BORE, tmpB), b = { x: eye.x, y: eye.y - .05, z: eye.z, vx: d.x * V0, vy: d.y * V0, vz: d.z * V0, life: 9 }, dt = 1 / 120;
    for (let i = 0; i < 160; i += 2) {
      const x0 = b.x, y0 = b.y, z0 = b.z; stepBullet(b, dt); stepBullet(b, dt);
      const h = hitTest(x0, y0, z0, b.x, b.y, b.z, i * dt);
      if (!h) continue;
      const hx = x0 + (b.x - x0) * h.t, hy = y0 + (b.y - y0) * h.t, hz = z0 + (b.z - z0) * h.t, D = Math.hypot(hx - eye.x, hz - eye.z);
      if (D < 8) return null;
      const [x, y, z] = WD.v.toScreen(hx, hy, hz); if (z >= 1) return null;
      return markV = [x, y, D, !!h.s];
    }
    return null;
  }
  function sway() {
    if (!scoped) return [0, 0];
    const amp = .0032 * (breath.held && breath.v > 0 ? .1 : 1) * (gasp > 0 ? 2.6 : 1) * (1 + (1 - me.frac) * .8) * (8 / zoom) ** .3;
    return [(Math.sin(t * 1.1) * .6 + Math.sin(t * 2.3 + 1) * .4) * amp, (Math.sin(t * 1.7 + 2) * .6 + Math.sin(t * .7) * .4) * amp * .8];
  }
  function predict(b0) {
    // the same small steps as a real bullet, checked for hits two at a time (half the work, same path)
    const b = { ...b0 }, dt = 1 / 120;
    for (let i = 0; i < 160; i += 2) {
      const x0 = b.x, y0 = b.y, z0 = b.z;
      stepBullet(b, dt); stepBullet(b, dt);
      const h = hitTest(x0, y0, z0, b.x, b.y, b.z, i * dt);
      if (h) return h.s ? { s: h.s, head: h.head, d: h.d, time: (i + 2 * h.t) * dt } : null;
    }
    return null;
  }
  const windAt = {};

  function stepBullet(b, dt) {
    const w = AIR.at(b.x, b.z, windAt); b.vy -= GRAV * dt; b.vx += w.x * WIND_K * dt; b.vz += w.z * WIND_K * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
  }
  // what a bullet path from p0 to p1 hits first: { t, s?, head?, box?, ground?, d }
  function hitTest(x0, y0, z0, x1, y1, z1, ahead = 0) {
    if (warming) return;
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz) || 1e-6, eye = WD.v.cam.position;
    let best = null; const take = (tt, o) => { if (tt >= 0 && tt <= 1 && (!best || tt < best.t)) best = { t: tt, ...o }; };
    for (const s of men) {
      if (s.ko || s.inside) continue;
      const sx = s.x + s.vx * ahead, sz = s.y + s.vy * ahead;
      const k = clamp(((sx - x0) * dx + (s.gy + 1 - y0) * dy + (sz - z0) * dz) / (L * L), 0, 1);
      if (Math.hypot(x0 + dx * k - sx, y0 + dy * k - s.gy - 1, z0 + dz * k - sz) > 2.2) continue;
      for (const [cx, cy, cz, r, head] of hitSpheres(s, SPH)) {
        const ox = x0 - cx - s.vx * ahead, oy = y0 - cy, oz = z0 - cz - s.vy * ahead, bq = ox * dx + oy * dy + oz * dz, cq = ox * ox + oy * oy + oz * oz - r * r, a = L * L, disc = bq * bq - a * cq;
        if (disc >= 0) take((-bq - Math.sqrt(disc)) / a, { s, head });
      }
    }
    for (const b of drums || []) { if (b.gone) continue; const ox = x0 - b.x, oy = y0 - b.y - .5, oz = z0 - b.z, bq = ox * dx + oy * dy + oz * dz, cq = ox * ox + oy * oy + oz * oz - .5, disc = bq * bq - L * L * cq; if (disc >= 0) take((-bq - Math.sqrt(disc)) / (L * L), { drum: b }); }
    if (WD.bell) { const p = WD.bell.position, ox = x0 - p.x, oy = y0 - p.y, oz = z0 - p.z, bq = ox * dx + oy * dy + oz * dz, cq = ox * ox + oy * oy + oz * oz - .81, disc = bq * bq - L * L * cq; if (disc >= 0) take((-bq - Math.sqrt(disc)) / (L * L), { bell: true }); }
    for (const b of WD.solids) {
      // the box's three slabs in turn (no arrays made: this runs for every box on every bullet step)
      let t0 = 0, t1 = 1, ok = true;
      for (let ax = 0; ax < 3 && ok; ax++) {
        const p = ax === 0 ? x0 : ax === 1 ? y0 : z0, d = ax === 0 ? dx : ax === 1 ? dy : dz;
        const lo = ax === 0 ? b.x0 : ax === 1 ? b.y0 : b.z0, hi = ax === 0 ? b.x1 : ax === 1 ? b.y1 : b.z1;
        if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) ok = false; continue; }
        let a = (lo - p) / d, c = (hi - p) / d; if (a > c) { const sw = a; a = c; c = sw; } t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) ok = false;
      }
      if (ok) take(t0, { box: b });
    }
    for (let i = 1, n = Math.ceil(L / 1.5); i <= n; i++) { const k = i / n, x = x0 + dx * k, y = y0 + dy * k, z = z0 + dz * k; if (y < WD.land.height(x, z)) { take(k, { ground: true }); break; } }
    if (best) best.d = Math.hypot(x0 + dx * best.t - eye.x, y0 + dy * best.t - eye.y, z0 + dz * best.t - eye.z);
    return best;
  }
  function updateShots(dt) {
    for (const b of shots) {
      const steps = Math.max(1, Math.ceil(dt * V0 / 4));
      for (let i = 0; i < steps && !b.dead; i++) {
        const x0 = b.x, y0 = b.y, z0 = b.z; stepBullet(b, dt / steps);
        let h = hitTest(x0, y0, z0, b.x, b.y, b.z);
        // a shot shown in the bullet cam was worked out as a hit when it left the barrel: it stays one
        // even if he took a step since (no slow motion that ends in a miss)
        if (b.cam && !b.cam.s.ko) {
          const gone = Math.hypot(b.x - b.x0, b.y - b.y0, b.z - b.z0);
          if ((h && h.s !== b.cam.s) || gone >= b.cam.d - .3 || b.life <= 0) {
            const s = b.cam.s, k = b.cam.head ? 1.62 : 1.2; h = { t: 1, s, head: b.cam.head, d: b.cam.d };
            b.x = s.x; b.y = s.gy + k; b.z = s.y; b.dead = true; impact(b, h, b.x, b.y, b.z); break;
          }
        }
        if (h) { b.dead = true; const hx = x0 + (b.x - x0) * h.t, hy = y0 + (b.y - y0) * h.t, hz = z0 + (b.z - z0) * h.t; impact(b, h, hx, hy, hz); }
        else if (b.life <= 0) b.dead = true;
      }
      if (!b.dead && !(bulletCam && bulletCam.b === b) && Math.random() < .9) WD.trail.emit({ x: b.x, y: b.y, z: b.z, life: .5, size: .07, col: [.85, .85, .8], a: .5, grow: 2 });   // (not for the round its own camera rides just behind)
    }
    shots = shots.filter(s => !s.dead);
  }
  // nothing built between two points (the boxes that stop bullets)
  function clearTo(x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    for (const b of WD.solids) {
      let t0 = 0, t1 = 1;
      for (const [o, d, lo, hi] of [[x0, dx, b.x0, b.x1], [y0, dy, b.y0, b.y1], [z0, dz, b.z0, b.z1]]) {
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t0 = 2; break; } continue; }
        const a = (lo - o) / d, c = (hi - o) / d; t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c)); if (t0 > t1) break;
      }
      if (t0 <= t1) return false;
    }
    return true;
  }
  // where the camera stands for the hold on a hit: close and low, off to the side of the shot's line, wherever
  // the view of him is clear (nearer or further if a wall is in the way)
  function holdCam(bc, s) {
    const a = bc.at, f = bc.from, dx = a.x - f.x, dz = a.z - f.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
    const tx = s ? s.x : a.x, tz = s ? s.y : a.z, ty = s ? s.gy + 1.15 : a.y;
    let best = null;
    for (const [back, side] of [[2.3, 1.9], [2.3, -1.9], [3.2, .8], [3.2, -.8], [1.6, 1.2], [1.6, -1.2]]) {
      const x = tx - ux * back + uz * side, z = tz - uz * back - ux * side, y = Math.max(ty - .2, WD.land.height(x, z) + .6);
      best ||= { x, y, z }; if (clearTo(x, y, z, tx, ty, tz)) { best = { x, y, z }; break; }
    }
    return { ...best, tx, ty, tz };
  }
  // a place the camera is about to cut to: the meadow is planted round it ahead of the cut (see update), so the grass is there in its first frame
  const grassEye = { position: new Vector3() };
  function impact(b, h, x, y, z) {
    if (warming) return;
    const viaCam = bulletCam && bulletCam.b === b;
    impactSound(h, { x, y, z }, viaCam);
    if (viaCam) { bulletCam.hold = HOLD; bulletCam.at = { x, y, z }; bulletCam.cam = holdCam(bulletCam, h.s); }   // (its grass was planted during the flight; whatever is left fills in from the camera outwards)
    if (h.s) {
      { const sc = (h.d || 0) * (h.head ? 1.3 : 1) * (b.masked ? 1.1 : 1);   // the round's best shot, for the replay at the end
        if (!bestShot || sc > bestShot.sc) { const rel = Math.atan2(wind.z, wind.x) + Math.atan2(-(x - b.x0), -(z - b.z0)); bestShot = { sc, s: h.s, head: h.head, d: Math.round(h.d || 0), from: { x: b.x0, y: b.y0, z: b.z0 }, to: { x, y, z }, wind: Math.cos(rel) * Math.hypot(wind.x, wind.z), covered: b.masked }; } }
      knockOut(h.s, h.head, h.d, viaCam, { x: b.x0, z: b.z0 });
      if (firstShotHit == null) firstShotHit = true;
      if (h.s === cs && gun.shotsAtCs === 1) cs.oneShot = true;
    } else {
      if (firstShotHit == null) firstShotHit = false;
      if (h.bell) { ringBell(x, y, z); return; }
      const stoneHit = h.box && h.box.kind !== 'house';
      for (const f of WD.flocks) if (Math.hypot(f.x - x, f.z - z) < 35) flush(f, 'hit');
      // into the river or the reservoir: a spout of water where the round went in, and nothing of the bed below
      { const lvl = z < -206 && Math.abs(x - STREAMX) < 36 ? LAKE : -1.4;
        if (h.ground && y < lvl - .05) {
          const k = b.vy < -1 ? (y - lvl) / b.vy : 0, sx = x - b.vx * k, sz = z - b.vz * k;
          for (let i = 0; i < 16; i++) WD.dust.emit({ x: sx, y: lvl + .05, z: sz, vx: rnd(-1.1, 1.1), vy: rnd(3, 8), vz: rnd(-1.1, 1.1), life: 1.2, size: rnd(.05, .11), col: [.84, .88, .9], a: .9, grav: 12, floor: lvl });
          for (let i = 0; i < 7; i++) WD.dust.emit({ x: sx, y: lvl + .2, z: sz, vx: rnd(-.5, .5), vy: rnd(1.5, 4.5), vz: rnd(-.5, .5), life: rnd(.7, 1.2), size: .4, grow: 2.6, col: [.8, .85, .88], a: .45, drag: 2.2, grav: 5, fadeIn: true });
          for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; WD.dust.emit({ x: sx, y: lvl + .04, z: sz, vx: Math.cos(a) * 1.6, vy: .25, vz: Math.sin(a) * 1.6, life: .9, size: .16, grow: 1.5, col: [.78, .83, .86], a: .4, drag: 1.6 }); }
          noise(.22, { vol: .05 * (viaCam ? 1 : .45), from: 1600, to: 300, filter: 'bandpass', q: .8 });
          return;
        } }
      const wet = rain.amount > .2 && h.ground, col = stoneHit ? [.7, .68, .62] : h.box ? [.74, .66, .54] : wet ? [.32, .27, .2] : [.52, .44, .32];
      const bl = Math.hypot(b.vx, b.vy, b.vz) || 1, bx = -b.vx / bl, bz = -b.vz / bl;   // back towards the shooter, the way debris flies
      for (let i = 0; i < 12; i++) WD.dust.emit({ x, y: y + .1, z, vx: rnd(-1.5, 1.5) + bx * 1.5, vy: rnd(.5, 3.5), vz: rnd(-1.5, 1.5) + bz * 1.5, life: rnd(1, 1.6), size: .4, grow: 2.2, col, a: .8, drag: 2.5, grav: 3, fadeIn: true });
      for (let i = 0; i < 4; i++) WD.dust.emit({ x: x + rnd(-.4, .4), y: y + .4, z: z + rnd(-.4, .4), vx: 0, vy: rnd(.2, .5), vz: 0, life: rnd(2.5, 3.5), size: 1, grow: 2, col, a: .25, drag: .8, fadeIn: true, ease: 2 });
      for (let i = 0; i < 8; i++) WD.dust.emit({ x, y: y + .05, z, vx: rnd(-2.5, 2.5) + bx * 2, vy: rnd(2, 6), vz: rnd(-2.5, 2.5) + bz * 2, life: 1.2, size: .07, col: col.map(c => c * .55), a: 1, grav: 12, floor: h.ground ? WD.land.height(x, z) : y - 3 });
      soon(0, () => holeAt(h, x, y, z, stoneHit, wet));   // (the mark itself in the next frame, under the dust: this one has the burst, the sound and the men's start to do)
      if (stoneHit) for (let i = 0; i < 6; i++) WD.sparks.emit({ x, y, z, vx: rnd(-3, 3), vy: rnd(0, 3), vz: rnd(-3, 3), life: .25, size: .08, col: [4, 3, 1.4], drag: 1 });
      // a near miss makes them jumpy (and the smack of it is heard round about)
      noises.make(x, z, 28);
      if (cs && !cs.ko && !(cs.hideT > 0) && Math.hypot(cs.x - x, cs.y - z) < 6) rookHide(cs, .25);   // a near miss sends Rook behind the bell
      for (const s of men) if (!s.ko && Math.hypot(s.x - x, s.y - z) < 8) { s.sus = 1; s.shaken = 1; flinch(s); if (!b.masked || Math.hypot(s.x - x, s.y - z) < 3) wakeUp(s, 'miss'); }
    }
    if (h.drum) drumHit(h.drum);
  }

  // a bullet mark where a shot lands: a chipped hole in stone and plaster, a dark scuff in the dirt.
  // The decal is cut from a small card laid on the face that was hit (walls are boxes, the ground's
  // slope comes from its height), so it never has to clip the whole village or valley mesh.
  const card = new Mesh(new PlaneGeometry(2, 2)), N_ = new Vector3(), P_ = new Vector3();
  const paintHole = (c, s, k) => {
    const m = s / 2, g = c.createRadialGradient(m, m, 0, m, m, m);
    if (k === 'stone') { g.addColorStop(0, 'rgba(18,14,12,1)'); g.addColorStop(.16, 'rgba(30,26,22,.95)'); g.addColorStop(.3, 'rgba(250,244,232,.55)'); g.addColorStop(.6, 'rgba(120,110,96,.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
    else { g.addColorStop(0, 'rgba(26,18,10,.95)'); g.addColorStop(.35, 'rgba(48,34,20,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    if (k === 'stone') { c.strokeStyle = 'rgba(30,24,20,.6)'; c.lineWidth = s / 64; for (let i = 0; i < 5; i++) { const a = i * 1.3 + .4, r = m * (.35 + (i % 3) * .12); c.beginPath(); c.moveTo(m + Math.cos(a) * m * .14, m + Math.sin(a) * m * .14); c.lineTo(m + Math.cos(a + .2) * r, m + Math.sin(a + .2) * r); c.stroke(); } }
  };
  function holeAt(h, x, y, z, stone, wet) {
    if (warming) return;
    if (!h.box && !h.ground) return;
    if (h.box) {   // the face of the box nearest the hit
      const b = h.box, f = [[x - b.x0, -1, 0, 0], [b.x1 - x, 1, 0, 0], [y - b.y0, 0, -1, 0], [b.y1 - y, 0, 1, 0], [z - b.z0, 0, 0, -1], [b.z1 - z, 0, 0, 1]].sort((a, c) => a[0] - c[0])[0];
      N_.set(f[1], f[2], f[3]); P_.set(x, y, z);
    } else {
      const e = .6, L = WD.land; N_.set(L.height(x - e, z) - L.height(x + e, z), 2 * e, L.height(x, z - e) - L.height(x, z + e)).normalize(); P_.set(x, L.height(x, z), z);
    }
    card.position.copy(P_); card.lookAt(P_.x + N_.x, P_.y + N_.y, P_.z + N_.z);
    const k = stone || h.box ? 'stone' : 'dirt';
    WD.v.decal(card, P_, N_, { size: k === 'stone' ? .32 : wet ? .7 : .55, paint: (c, s) => paintHole(c, s, k), key: 'ls-hole-' + k, life: 60, max: 24, rough: k === 'stone' ? .8 : 1 });
  }

  // ---- enemies' shots at you (and at Hale's squad)
  // a muzzle flash: a hot core and a short cone along the barrel, then a puff of smoke that drifts
  // with the wind. Far off it keeps a few pixels, so you can see where a shot came from.
  const muzzle = (x, y, z, dx, dy, dz, k = 1) => {
    const e = WD.v.cam.position, far = Math.hypot(x - e.x, y - e.y, z - e.z), core = bulletCam ? .2 * k : Math.max(.2 * k, far * Math.tan(WD.v.cam.fov * Math.PI / 360) * .02);
    WD.sparks.emit({ x, y, z, life: .05, size: core, col: [5, 3.4, 1.5] });
    for (let i = 1; i <= 3; i++) { const o = core * i * .6; WD.sparks.emit({ x: x + dx * o, y: y + dy * o, z: z + dz * o, vx: dx * 5, vy: dy * 5, vz: dz * 5, life: .045, size: core * (1 - i * .25), col: [5, 2.8, 1] }); }
    for (let i = 0; i < 4; i++) WD.smoke.emit({ x: x + dx * .3, y, z: z + dz * .3, vx: dx * rnd(.6, 2) + rnd(-.2, .2), vy: rnd(.1, .5), vz: dz * rnd(.6, 2) + rnd(-.2, .2), life: rnd(1.2, 2), size: .22 * k, grow: 5, col: [.62, .61, .58], a: .2, drag: 1.4, fadeIn: true });
  };
  // a shot that misses you still lands close: dirt in front of you, or chips off the sill up a tower
  function nearMiss(from) {
    if (warming) return;
    const e = WD.v.cam.position, dx = from.x - e.x, dz = from.z - e.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, side = rnd(-1.6, 1.6);
    const gy = WD.land.height(e.x, e.z), high = e.y - gy > 4, k = high ? rnd(.7, 1.1) : rnd(1.8, 4.5);
    const x = e.x + ux * k - uz * side, z = e.z + uz * k + ux * side, y = high ? e.y - rnd(.5, .8) : WD.land.height(x, z);
    for (let i = 0; i < (high ? 5 : 3); i++) WD.sparks.emit({ x, y, z, vx: rnd(-2, 2) + ux * 2, vy: rnd(.5, 3), vz: rnd(-2, 2) + uz * 2, life: .2, size: .03, col: [3.5, 2.6, 1.2], drag: 1, grav: 6 });
    for (let i = 0; i < 9; i++) WD.dust.emit({ x, y: y + .05, z, vx: rnd(-.8, .8) + ux * 1.5, vy: rnd(1, 4.5), vz: rnd(-.8, .8) + uz * 1.5, life: rnd(.8, 1.4), size: rnd(.12, .25), grow: 2.5, col: high ? [.72, .7, .64] : rain.amount > .2 ? [.3, .26, .2] : [.5, .43, .32], a: .75, drag: 2, grav: 4, fadeIn: true });
    for (let i = 0; i < 5; i++) WD.dust.emit({ x, y: y + .05, z, vx: rnd(-3, 3), vy: rnd(3, 6), vz: rnd(-3, 3), life: 1.1, size: .045, col: high ? [.55, .52, .48] : [.24, .2, .15], a: 1, grav: 12, floor: y });
  }
  // ---- Sgt. Rook, the Grey Order's marksman in the church tower (mission 2)
  const ROOK = 'SGT. ROOK · GREY ORDER', ROOK_AIM = 1.1;
  const ROOK_LINES = { dodged: ['Quick. You will not be twice.', 'You felt that one coming.'], moved: ['Not there any more, sniper.', 'Look again.'], hit: ['Got you.'] };
  function rookSay(k) { if (lineFx && !lineFx.enemy) return; const l = ROOK_LINES[k]; say(l[Math.floor(Math.random() * l.length)], ROOK, 2.2, true); }
  function rookHide(s, delay = 0) { s.aimT = 0; s.hideAt = t + delay; soon(delay, () => { if (!s.ko && !(s.hideT > 0)) { s.hideT = rnd(4, 6.5); s.see = Math.min(s.see, .3); } }); }
  function rookAppear(s, eye) {
    // a different arch: left or right of the bell, on the side that faces Wren
    const c = WD.churchTop, dx = eye.x - c.x, dz = eye.z - c.z, l = Math.hypot(dx, dz) || 1, fx_ = dx / l, fz = dz / l;
    s.arch = s.arch === 1 ? -1 : s.arch === -1 ? (Math.random() < .5 ? 1 : 0) : (Math.random() < .5 ? -1 : 1);
    s.x = c.x + fx_ * 1.4 - fz * 1.3 * s.arch; s.y = c.z + fz * 1.4 + fx_ * 1.3 * s.arch;
    s.lift = c.y - groundAt(s.x, s.y) + .2; s.see = .15; s.fireT = 1.5;
    if (Math.random() < .5) rookSay('moved');
  }
  const enemyShot = (s, target, kind) => {
    if (kind === 'csDucked') {   // he dropped out of the scope in time: the round cracks over his head
      const from = { x: s.x, y: s.gy + 1.45, z: s.y }, eye = WD.v.cam.position, d = Math.hypot(from.x - eye.x, from.z - eye.z);
      { const L = Math.hypot(eye.x - from.x, eye.y - from.y, eye.z - from.z) || 1; muzzle(from.x, from.y, from.z, (eye.x - from.x) / L, (eye.y - from.y) / L, (eye.z - from.z) / L, 1.2); }
      tracer(from, { x: eye.x + rnd(-1, 1), y: eye.y + 1.6, z: eye.z + rnd(-1, 1) });
      setTimeout0(d / 600, () => { if (state === 'play' && !move) { snap(); nearMiss(from); haptic('medium'); } });
      farReport(from, d, 'cs'); return;
    }
    const from = { x: s.x, y: s.gy + 1.45, z: s.y }, eye = WD.v.cam.position, toMe = target === 'me';
    { // out along the aim to the muzzle, then the flash
      const to = toMe ? eye : { x: target.x, y: target.gy + 1, z: target.y }, L = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) || 1;
      const ux = (to.x - from.x) / L, uy = (to.y - from.y) / L, uz = (to.z - from.z) / L;
      from.x += ux * .75; from.y += uy * .75; from.z += uz * .75; muzzle(from.x, from.y, from.z, ux, uy, uz, kind === 'mg' ? .8 : kind === 'cs' ? 1.2 : 1);
    }
    const d = toMe ? Math.hypot(from.x - eye.x, from.z - eye.z) : Math.hypot(from.x - target.x, from.z - target.y);
    if (toMe) {
      const exposed = scoped || glass ? 1 : .55;
      const skill = .6 + boss.skill * .6;
      const chance = clamp((kind === 'cs' ? .9 : kind === 'mg' ? .3 : .42) - d / (kind === 'cs' ? 900 : 320), .04, .9) * exposed * skill;
      const hit = Math.random() < chance, duel = s.mind ? watched(s) : false;   // a duel: he fired while you had him in your sights
      tracer(from, { x: eye.x + rnd(-2, 2) * (hit ? .2 : 1), y: eye.y + rnd(-1, 1.4) * (hit ? .2 : 1), z: eye.z + rnd(-2, 2) * (hit ? .2 : 1) });
      setTimeout0(d / 600, () => {
        if (state !== 'play' || move) return;
        if (hit) { hurtMe(kind === 'cs' ? 42 : kind === 'mg' ? 9 : 15, from); haptic('error'); fx.shake(4); tone(140, { len: .15, wave: 'sawtooth', vol: .08, slide: -60 }); if (me.hp > 0) boss.feel(.6); if (me.hp < 25) boss.feel(-.5); s.mind?.feel(me.hp < 25 ? -.6 : .3); }
        else { snap(); boss.feel(.2); if (Math.random() < .7) nearMiss(from); s.mind?.feel(duel ? .7 : .4); }
      });
      farReport(from, d, kind);
    } else {
      { const e = WD.v.cam.position; farReport(from, Math.hypot(from.x - e.x, from.y - e.y, from.z - e.z), kind); }
      tracer(from, { x: target.x + rnd(-1, 1), y: target.gy + 1, z: target.y + rnd(-1, 1) });
      const chance = (kind === 'mg' ? .4 : .22) * (target.crouch ? .35 : 1);
      if (Math.random() < chance && !target.ko) { target.hp -= kind === 'mg' ? 12 : 18; if (target.hp <= 0) allyDown(target); }
    }
  };
  function tracer(a, b) {
    // stop short of your eye, so a round coming at you streaks past instead of filling the screen
    const e = WD.v.cam.position, eb = Math.hypot(b.x - e.x, b.y - e.y, b.z - e.z), ab = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1;
    if (eb < 7 && ab > 14) { const k = (7 - eb) / ab; b = { x: b.x + (a.x - b.x) * k, y: b.y + (a.y - b.y) * k, z: b.z + (a.z - b.z) * k }; }
    const m = WD.tracers.find(q => !q.visible) || WD.tracers[0];
    m.visible = true; m.userData = { a, b, t: 0, life: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 500 + .05 };
  }
  function updateTracers(dt) {
    for (const m of WD.tracers) {
      if (!m.visible) continue; const u = m.userData; u.t += dt; const k = u.t / u.life;
      if (k >= 1) { m.visible = false; continue; }
      const x = lerp(u.a.x, u.b.x, k), y = lerp(u.a.y, u.b.y, k), z = lerp(u.a.z, u.b.z, k);
      m.position.set(x, y, z); m.lookAt(u.b.x, u.b.y, u.b.z); m.scale.set(1, 1, 4);
    }
  }
  function hurtMe(n, from) {
    me.hurt(n); const e = WD.v.cam.position, rel = angDiff(Math.atan2(-(from.x - e.x), -(from.z - e.z)), look.yaw);
    hits.push({ angle: -rel, life: 1.2 });
  }
  // game-time delays (they pause with the game)
  function setTimeout0(sec, fn) { timers.push({ at: t + sec, fn }); }

  // ---- masking sounds: the train and the church bell
  // the church bell: shoot it and it rings for six seconds of cover (then it needs a while to settle)
  function bellReady() { return bell.ring <= 0 && t - bell.shotT > 30; }
  function onBell(o, d) { const p = WD.bell.position, ox = o.x - p.x, oy = o.y - p.y, oz = o.z - p.z, bq = ox * d.x + oy * d.y + oz * d.z, cq = ox * ox + oy * oy + oz * oz - 1.1, k = -bq; return bq * bq - cq >= 0 && k > 0 && k < 600; }
  function ringBell(x, y, z) {
    for (let i = 0; i < 10; i++) WD.sparks.emit({ x, y, z, vx: rnd(-3, 3), vy: rnd(0, 3), vz: rnd(-3, 3), life: .3, size: .08, col: [4, 3, 1.4], drag: 1 });
    tone(1180, { len: .4, wave: 'triangle', vol: .04, out: aud?.sp?.in });
    if (!bellReady()) { bell.ring = Math.max(bell.ring, 1.5); return; }
    bell.ring = 6; bell.shotT = t; bellToll(); for (const f of WD.flocks) if (Math.hypot(f.x - x, f.z - z) < 60) flush(f, 'shot');
    if (!bell.told) { bell.told = true; say('The bell! Six seconds of cover. Make them count.', OAKE, 2.4); }
  }
  function masked() { return (train.on && Math.abs(train.x) < 190) || (bell.ring > 0) || (storm > 0); }

  // ---- mortars (the commander's call)
  function callMortars() {
    if (mortar || mortarCool > 0 || !nest) return;
    mortar = { n: 3, next: 1.2, at: nestEye(nest) }; mortarCool = 16;
    say('Mortars! Move, Wren!', OAKE, 2);
  }
  function updateMortar(dt) {
    mortarCool -= dt;
    if (!mortar) return;
    mortar.next -= dt;
    if (mortar.next <= 0) {
      const i = 3 - mortar.n, off = [24, 12, 5][i] * rnd(.8, 1.2), a = rnd(0, TAU), x = mortar.at.x + Math.cos(a) * off, z = mortar.at.z + Math.sin(a) * off, y = WD.land.height(x, z);
      tone(1400, { len: 1, wave: 'sine', vol: .05, slide: -900 });
      setTimeout0(1, () => {
        for (let k = 0; k < 30; k++) WD.dust.emit({ x, y: y + .3, z, vx: rnd(-5, 5), vy: rnd(3, 11), vz: rnd(-5, 5), life: 2, size: 1.2, grow: 2.5, col: [.45, .38, .3], a: .9, drag: 1.5, grav: 6 });
        for (let k = 0; k < 10; k++) WD.sparks.emit({ x, y: y + .5, z, vx: rnd(-6, 6), vy: rnd(2, 9), vz: rnd(-6, 6), life: .4, size: .6, col: [5, 2.6, .8], drag: 2 });
        noise(.9, { vol: .45, from: 900, to: 50 }); haptic('heavy');
        if (nest && !move) {
          const e = nestEye(nest), dd = Math.hypot(e.x - x, e.z - z); fx.shake(clamp(30 / dd, 2, 12));
          if (dd < 8) { hurtMe(Math.round(34 * (1 - dd / 9)), { x, y, z }); boss.feel(me.hp > 0 ? 1 : .2); }
        }
      });
      mortar.next = 2.2; if (--mortar.n <= 0) mortar = null;
    }
  }

  // ---- moving between nests
  const RUN_V = 5.6, CLIMB_V = 1.05, GAITS = { walk: 1.5, jog: 3.2, run: 5.6 }, KNEES = { L: [.3, -.1, 1], R: [-.3, -.1, 1] }, ELBOWS = { L: [.3, -1, -.05], R: [-.3, -1, -.05] };
  function nextNest() { const list = mission.nests; const i = list.indexOf(nestId); return list[i + 1] || (mid === 'm2' ? list[0] : null); }
  // Moving shows Wren doing it, in third person: riding the zip line, running the last stretch and
  // climbing in (a ladder or a door), or climbing the belfry at the start. Tap to skip; the fight goes on.
  function startMove(to, kind = null) {
    if (move || !to) return;
    scoped = false; glass = false; breath.held = false;
    move = tripPlan(to, kind);
    if (move.kind === 'zip') { zip = zipLine(); say('Riding the line down. Keep your head low.', OAKE, 2.4); }
    haptic('medium');
  }
  const zipLine = () => new Zipline(WD.zipA, WD.zipB, { gravity: 170, drag: .14 });
  // the trip to a nest, laid out: down the zip line, or a run and then a door or the ladder
  function tripPlan(to, kind = null) {
    const dest = NESTS[to];
    if (!kind && nestId === 'ridge' && to === 'tower') return { to, kind: 'zip', t: 0, fade: 0, land: -1, sw: 0, swv: 0, lastV: 0, passed: false, hum: 0 };   // he takes the bar, springs, then rides (zip.ride at ZIP_GO)
    // the last 24 m of the run, from the side of the old nest, then in at the door or up the ladder
    const climb = to === 'chapel', foot = climb ? { x: WD.ladder.x, z: WD.ladder.z } : { x: dest.x, z: dest.z + 3.4 + 3.7 + 1.7 }, from = nest && kind !== 'climb' ? nest : { x: foot.x + 16, z: foot.z + 22 };
    // his way there goes round walls and houses (the same paths as the soldiers), and we see the end of it
    const pts = runRoute(from, foot, kind === 'climb' ? 14 : 26), len = pts.reduce((a, p, i) => i ? a + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0, 0);
    // flat out, slowing into the door or the foot of the ladder; then a walk in at the door, or onto the ladder,
    // the first stretch of the climb, (a cut) the last stretch and in over the sill
    const vEnd = climb ? .8 : 2.4, slow = Math.min(.7, len / RUN_V * .5), runT = Math.max(.6, (len - (RUN_V + vEnd) / 2 * slow) / RUN_V + slow);
    const m = { to, kind: kind || 'run', climb, t: 0, start: pts[0], foot, pts, len, runT, slow, vEnd, mountT: climb ? .6 : 0, climbA: climb ? 2.3 : 0, climbB: climb ? 2.5 : 0, inT: climb ? MOVES.OVER : 1.1, side: Math.random() < .5 ? -1 : 1, fade: 1, yaw: null };
    m.dur = runT + m.mountT + m.climbA + m.climbB + m.inT + (climb ? .05 : .25);
    return m;
  }
  // Wren as a trip has him this frame: where he is, his stride or his move, his hands and feet on what he holds
  function wrenShow(f, kind, dt) {
    const w = WD.wren; w.visible = true; w.position.set(f.x, f.y, f.z); w.rotation.order = 'YXZ'; w.rotation.y = f.yaw; w.rotation.x = f.sw || 0; w.rotation.z = f.roll || 0;
    if (f.sw) { const s_ = Math.sin(f.sw), c_ = Math.cos(f.sw); w.position.x -= HANG * s_ * Math.sin(f.yaw); w.position.y += HANG * (1 - c_); w.position.z -= HANG * s_ * Math.cos(f.yaw); }   // he swings from his hands, not his feet
    WD.trolley.visible = kind === 'zip'; if (kind === 'zip') { const h = zip.hands; WD.trolley.position.set(h.x, h.y + .05, h.z); WD.trolley.rotation.y = f.yaw; }
    if (f.pose) w.rig.play(f.pose, { fade: f.fade ?? .15, at: f.at }); else w.rig.blend(GAITS, f.speed);   // a named move, or his stride by how fast he goes
    w.rig.update(dt, { speed: f.speed, turn: f.turn || 0 }); w.see(WD.v.cam, 1000);
    // his hands close round the rung or the bar they hold, and open as they reach for the next
    if (f.touch) { w.touch(f.touch, f.how); const b = f.how.blend, o = f.open, shut = (hold = 1, open = 0) => EASY + (HELD - EASY) * clamp(hold * (1 - open), 0, 1); hands(w, shut(b.handL, o?.L), shut(b.handR, o?.R)); }
    else hands(w, EASY);
    if (f.floor != null) floorFeet(w, 1, null, 0, f.floor - w.position.y);   // (the roof or the ridge he stands on in this move)
    return w;
  }
  // the last `run` metres of a walkable way from a to b (round houses and walls), as points
  function runRoute(a, b, run) {
    const sa = openNear(a.x, a.z), sb = openNear(b.x, b.z), p = sa && sb ? WD.nav.path(sa.x - GX0, sa.z - GZ0, sb.x - GX0, sb.z - GZ0) : null;
    let pts = p ? p.map(q => ({ x: q.x + GX0, z: q.y + GZ0 })) : [{ x: a.x, z: a.z }];
    pts.push({ x: b.x, z: b.z });
    // keep only the end of it
    let left = run; const out = [pts[pts.length - 1]];
    for (let i = pts.length - 1; i > 0 && left > 0; i--) {
      const q = pts[i - 1], r = pts[i], d = Math.hypot(r.x - q.x, r.z - q.z);
      if (d >= left) { const k = left / d; out.unshift({ x: r.x + (q.x - r.x) * k, z: r.z + (q.z - r.z) * k }); left = 0; } else { out.unshift(q); left -= d; }
    }
    if (out.length < 2) out.unshift({ x: b.x + 6, z: b.z + 6 });
    return out;
  }
  // the point (and heading) d metres along a run of points
  function along(pts, d) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], l = Math.hypot(b.x - a.x, b.z - a.z);
      if (d <= l || i === pts.length - 1) { const k = clamp(d / (l || 1), 0, 1); return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw: Math.atan2(b.x - a.x, b.z - a.z) }; }
      d -= l;
    }
    return { x: pts[0].x, z: pts[0].z, yaw: 0 };
  }
  // where Wren is and how he moves at time t of the trip, and where the camera is (dt: this frame's step; 0 reads it again)
  function tripAt(m, dt = 0) {
    if (m.kind === 'zip') return zipAt(m);
    const t = m.t, f = m.foot, now = m.now ||= { fig: { x: 0, y: 0, z: 0, yaw: 0, speed: 0, turn: 0, pose: null, at: null, fade: .15, touch: null, how: null }, cam: { p: [0, 0, 0], l: [0, 0, 0], fov: 60 } }, fig = now.fig, cam = now.cam;
    fig.pose = null; fig.at = null; fig.touch = null; fig.turn = 0; fig.fade = .15; cam.fov = 58;
    if (t < m.runT) {
      const t1 = m.runT - m.slow, u = Math.max(0, t - t1), v = RUN_V + (m.vEnd - RUN_V) * u / m.slow, s0 = m.len - RUN_V * t1 - (RUN_V + m.vEnd) / 2 * m.slow;
      const s = clamp(s0 + RUN_V * Math.min(t, t1) + RUN_V * u + (m.vEnd - RUN_V) * u * u / (2 * m.slow), 0, m.len), k = t / m.runT;
      const { x, z, yaw } = along(m.pts, s), look = along(m.pts, Math.min(m.len, s + 4)), yawL = Math.atan2(look.x - x, look.z - z) || yaw;
      // he turns into a corner rather than snapping round it (and leans into it), and squares up to the ladder or the door
      const want = t > m.runT - .3 ? (m.climb ? -Math.PI / 2 : Math.PI) : yaw, was = m.yaw ?? want;
      if (dt > 0) { m.yaw = was + angDiff(want, was) * Math.min(1, dt * 10); m.turn = angDiff(m.yaw, was) / dt; } else m.yaw ??= want;
      fig.x = x; fig.z = z; fig.y = groundAt(x, z); fig.yaw = m.yaw; fig.speed = v; fig.turn = m.turn || 0;
      // the camera runs with him, low and a little behind on one side: not inside a wall, and nothing between us and him
      // (his side, then the other side, then straight behind); it glides to its place, so a wall taking its spot never jolts it
      const yawC = m.camYaw = m.camYaw == null ? yawL : m.camYaw + angDiff(yawL, m.camYaw) * Math.min(1, dt * 3);
      const sx = Math.cos(yawC) * m.side, sz = -Math.sin(yawC) * m.side, back = lerp(3, 2, k);
      // (and never down in the grass: on a bank beside him it keeps its own height over its own ground)
      const him = { x, y: fig.y + 1.2, z }, at = (sd, off) => { const qx = x + sx * sd * off - Math.sin(yawC) * back, qz = z + sz * sd * off - Math.cos(yawC) * back; return { x: qx, y: Math.max(fig.y + 1.35, groundAt(qx, qz) + 1.3), z: qz }; };
      let cp = null;
      for (const sd of [1, -1]) { for (let off = 3; off >= 1.2 && !cp; off -= .6) { const q = at(sd, off); if (q.y < fig.y + 2.4 && roomAt(q) && clearLine(q, him)) cp = q; } if (cp) break; }   // (not from up a steep bank either)
      if (!cp) { const bx = x - Math.sin(yawC) * 2.5, bz = z - Math.cos(yawC) * 2.5; cp = { x: bx, y: Math.max(fig.y + 2.1, groundAt(bx, bz) + 1.3), z: bz }; }
      const c0 = m.cp ||= { ...cp }, kc = Math.min(1, dt * 6); c0.x += (cp.x - c0.x) * kc; c0.y += (cp.y - c0.y) * kc; c0.z += (cp.z - c0.z) * kc;
      if (dt > 0 && (solidAt(c0.x, c0.z, WD.solids) || !clearLine(c0, him))) { c0.x = cp.x; c0.y = cp.y; c0.z = cp.z; }   // (round a corner the glide would take it through the wall: there it cuts to its new place)
      cam.p[0] = c0.x; cam.p[1] = c0.y + Math.sin(t * 10.3) * .012; cam.p[2] = c0.z;
      cam.l[0] = x + Math.sin(yawC) * 1.6; cam.l[1] = fig.y + 1.15 + Math.sin(t * 7.1) * .015; cam.l[2] = z + Math.cos(yawC) * 1.6; cam.fov = 60;
    } else if (!m.climb) {
      // down to a walk, up to the door and into the dark
      const k = clamp((t - m.runT) / m.inT, 0, 1), vIn = 1.3, x = f.x, z = f.z - (m.vEnd * k - (m.vEnd - vIn) * k * k / 2) * m.inT;
      fig.x = x; fig.z = z; fig.y = groundAt(x, z); fig.yaw = Math.PI; fig.speed = lerp(m.vEnd, vIn, k);
      cam.p[0] = x + 2.4 * m.side; cam.p[2] = f.z + 3.6 - k * .5; cam.p[1] = Math.max(fig.y + 1.45, groundAt(cam.p[0], cam.p[2]) + 1.3); cam.l[0] = x; cam.l[1] = fig.y + 1.2; cam.l[2] = z - 1.5; cam.fov = 56;
    } else {
      // the belfry ladder: hands and feet on the rungs, then the rails, then in over the sill
      const L = WD.ladder, tc = t - m.runT, a = tc - m.mountT, fy = L.r0 + MOVES.FLOOR, G = m.G ||= {};
      const T = m.T ||= { handL: new Vector3(), handR: new Vector3(), footL: new Vector3(), footR: new Vector3() };
      const how = m.how ||= { knees: KNEES, elbows: ELBOWS, palms: { L: [0, 0, 0], R: [0, 0, 0] }, level: { L: 0, R: 0 }, blend: { handL: 1, handR: 1, footL: 1, footR: 1 } }, b = how.blend;
      // (he faces the wall, -x: the ladder's own x, y, z are the world's z, y, x here; a palm faces the rung, or across to the other rail)
      const put = (g, y0) => { for (const k in T) T[k].set(L.lx + g[k].z, y0 + g[k].y, L.z + g[k].x); }, palm = (p, sd, r) => { p[0] = -(1 - .7 * r); p[1] = -.35 * (1 - r); p[2] = -sd * r; };
      fig.x = L.x; fig.z = L.z; fig.yaw = -Math.PI / 2; fig.speed = 0; fig.touch = T; fig.how = how;
      const open = fig.open ||= { L: 0, R: 0 }; open.L = open.R = 0;
      if (a < m.climbA + m.climbB) {
        const on = clamp(tc / m.mountT, 0, 1), y = a < m.climbA ? (L.y0 - L.r0) + Math.max(0, a) * CLIMB_V : MOVES.Y_END - (m.climbA + m.climbB - a) * CLIMB_V;
        MOVES.ladder(y, MOVES.TOP, MOVES.RAIL, G); put(G, L.r0);
        fig.y = L.r0 + y + G.rise * on; fig.pose = 'ladder'; fig.at = G.at; fig.fade = .3;
        palm(how.palms.L, 1, G.handL.rail); palm(how.palms.R, -1, G.handR.rail); open.L = Math.min(1, G.handL.lift * 2.5); open.R = Math.min(1, G.handR.lift * 2.5);
        how.level.L = .7 * (1 - G.footL.lift * .6); how.level.R = .7 * (1 - G.footR.lift * .6);
        b.handR = sm(0, .5, on); b.handL = sm(.15, .7, on); b.footL = sm(.3, .85, on); b.footR = sm(.55, 1, on);   // he takes hold, then steps on
        if (a < m.climbA) {
          // from the ground by the foot of the tower, looking up after him
          const q = climbCam(), k = clamp(tc / (m.mountT + m.climbA), 0, 1);
          cam.p[0] = lerp(q.x, L.x, k * .12); cam.p[1] = L.y0 + .35; cam.p[2] = lerp(q.z, L.z, k * .12);
          cam.l[0] = L.lx; cam.l[1] = fig.y + 1.25; cam.l[2] = L.z; cam.fov = 58;
        } else {
          // from above, by the belfry's corner: he comes up at us, the drop below him
          cam.p[0] = L.lx + 1.3; cam.p[1] = fy + 2.1; cam.p[2] = L.z - 1.6; cam.l[0] = L.x - .1; cam.l[1] = fig.y + 1.25; cam.l[2] = L.z; cam.fov = 66;
        }
      } else {
        const O = m.O ||= {}; MOVES.topOut(a - m.climbA - m.climbB, O); put(O, fy);
        fig.x = L.lx + O.root.z; fig.y = fy + O.root.y; fig.z = L.z + O.root.x; fig.pose = 'topout'; fig.at = O.at; fig.fade = .12;
        palm(how.palms.L, 1, 1); palm(how.palms.R, -1, 1); how.level.L = how.level.R = 1;
        b.handL = b.handR = O.grip; b.footL = b.footR = 1;
        // from inside the belfry: he comes in between the rails with the valley behind him
        cam.p[0] = L.cx - .9 + O.at * .25; cam.p[1] = fy + .95; cam.p[2] = L.z + 1.05; cam.l[0] = L.lx - .4; cam.l[1] = fy + 1; cam.l[2] = L.z; cam.fov = 56;
      }
    }
    return now;
  }
  // The zip line, in six shots: from down the slope as he takes the bar and springs; over his shoulder as
  // he gathers speed; alongside, the valley behind him; a camera on the line further down that he
  // whooshes past; behind him as the tower comes up; and from the tower top as he comes in feet first and
  // folds down onto the tank.
  const ZIP_PASS = .8, ZIP_OVER = .3, ZIP_GO = .9, HANG = 2.1;   // where on the line the fly-by camera waits; when he lifts his feet; his hands above his feet line
  function zipAt(m) {
    const t = m.t, h = zip.hands, d = zip.dir, yaw = Math.atan2(d.x, d.z), sx = Math.cos(yaw), sz = -Math.sin(yaw), A = WD.zipA, B = WD.zipB;
    const sp = clamp(zip.speed / 45, 0, 1), k = zip.t, fy = WD.land.height(NESTS.tower.x, NESTS.tower.z) + 13.02;
    const len = m.len ||= Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z), run = k * len, pass = ZIP_PASS * len;   // (metres down the line: the shots change by how far he is from each camera)
    const lit = m.lit ||= (() => { const sun = WD.v.sunDir(tmpA); return sun.x * sx + sun.z * sz > 0 ? 1 : -1; })();   // the sunny side of the line: a camera there has the sun behind it
    const now = m.now ||= { fig: { x: 0, y: 0, z: 0, yaw: 0, speed: 0, turn: 0, pose: null, at: null, fade: .15, sw: 0, roll: 0, touch: null, how: null }, cam: { p: [0, 0, 0], l: [0, 0, 0], fov: 60 } }, fig = now.fig, cam = now.cam;
    // his hands on the trolley's bar, palms forward
    const T = m.T ||= { handL: new Vector3(), handR: new Vector3() }, how = m.how ||= { palms: { L: [d.x, -.25, d.z], R: [d.x, -.25, d.z] }, elbows: { L: [.6, .2, .4], R: [-.6, .2, .4] }, blend: { handL: 1, handR: 1 } };
    T.handL.set(h.x + sx * .19, h.y - .15, h.z + sz * .19); T.handR.set(h.x - sx * .19, h.y - .15, h.z - sz * .19);
    fig.x = h.x; fig.z = h.z; fig.yaw = yaw; fig.speed = 0; fig.at = null; fig.sw = 0; fig.roll = 0; fig.touch = T; fig.how = how; fig.fade = .25; fig.floor = null; how.blend.handL = how.blend.handR = 1;
    const set = (px, py, pz, lx, ly, lz, fov) => { cam.p[0] = px; cam.p[1] = py; cam.p[2] = pz; cam.l[0] = lx; cam.l[1] = ly; cam.l[2] = lz; cam.fov = fov; };
    if (m.land >= 0) {
      // lets go over the tank: his feet take it, he folds down and comes up looking out over the valley
      const q = m.land, go = 1 - (1 - Math.min(1, q / .55)) ** 2, off = 1 - sm(.02, .16, q);
      fig.x = h.x + d.x * go * 1.1; fig.z = h.z + d.z * go * 1.1; fig.y = Math.max(fy, lerp(h.y - HANG, fy, sm(0, .14, q))); fig.pose = 'zipLand'; fig.at = Math.min(1, q / 1.35); fig.sw = m.sw * off; fig.floor = fy;
      how.blend.handL = how.blend.handR = off;
      set(B.x + d.x * 3.4 + sx * 2.5 * lit, fy + 1.15, B.z + d.z * 3.4 + sz * 2.5 * lit, fig.x, fy + .95 - sm(.1, .4, q) * .25 + sm(.7, 1.2, q) * .25, fig.z, 56);
    } else if (t < ZIP_GO) {
      // under the line on the ridge: both hands on the bar, a look down the line, he sinks and springs (seen from down the slope)
      const gy = WD.land.height(A.x, A.z);
      fig.y = lerp(gy + .02, h.y - HANG, sm(.7, ZIP_GO, t)); fig.pose = 'zipReady'; fig.at = t / (ZIP_GO + .1); fig.fade = 0; fig.floor = gy + .02;
      set(A.x + d.x * 3.3 - sx * 2.3, gy + 1.05, A.z + d.z * 3.3 - sz * 2.3, h.x, gy + 1.3, h.z, 50);
    } else {
      fig.y = h.y - HANG; fig.pose = k > .9 ? 'zipBrace' : t < ZIP_GO + .1 ? 'zipReady' : 'zipRide'; if (fig.pose === 'zipReady') fig.at = t / (ZIP_GO + .1);
      fig.sw = m.sw; fig.roll = Math.sin(t * 2.3) * .05 * sp; fig.yaw = yaw + Math.sin(t * 1.7) * .12 * sp;
      const j = sp * .025, jx = Math.sin(t * 23) * j, jy = Math.sin(t * 31 + 1) * j;
      if (k < .035) set(A.x + d.x * 3.3 - sx * 2.3, WD.land.height(A.x, A.z) + 1.05, A.z + d.z * 3.3 - sz * 2.3, h.x, h.y - 1, h.z, 50);   // (still the first shot as he swings off)
      else if (k < ZIP_OVER) {
        // over his shoulder, the line running away ahead: pulling back and widening as he picks up speed
        const back = 2.5 + sp * 1;
        set(h.x - d.x * back + sx * .95 + jx, h.y - d.y * back - .5 + jy, h.z - d.z * back + sz * .95, h.x + d.x * 12, h.y + d.y * 12 - 1.9, h.z + d.z * 12, 62 + sp * 14);
      } else if (run < pass - 18) {
        // alongside him, on the sunny side (into the sun he is a shadow in the glare): the camera starts ahead of him
        // and below, and he draws past it against the valley
        const u = (run - ZIP_OVER * len) / Math.max(1, pass - 18 - ZIP_OVER * len), fwd = lerp(4.2, -2.4, u), out = lerp(5.6, 4.3, u) * lit;
        set(h.x + sx * out + d.x * fwd + jx, h.y - lerp(2, .7, u) + jy, h.z + sz * out + d.z * fwd, h.x, h.y - .95, h.z, 46);
      } else if (run < pass + 24) {
        // waiting on the line: he comes at us and flashes past
        const P = { x: A.x + (B.x - A.x) * ZIP_PASS, y: A.y + (B.y - A.y) * ZIP_PASS, z: A.z + (B.z - A.z) * ZIP_PASS };
        set(P.x + sx * 3.6 * lit + d.x * 2, P.y - 2.7, P.z + sz * 3.6 * lit + d.z * 2, h.x, h.y - 1.1, h.z, 52);
      } else {
        // behind him for the run in (back up the line is into the sun and the haze): the tank on its tower comes up fast
        const u = sm(pass + 24, len - 4, run), back = lerp(6.5, 3.4, u);
        set(h.x - d.x * back + sx * 1.3 * lit + jx, h.y - d.y * back + .35 + jy, h.z - d.z * back + sz * 1.3 * lit, lerp(h.x, B.x, .5), lerp(h.y - 1.2, fy + .6, .5), lerp(h.z, B.z, .5), lerp(42, 58, u));
      }
    }
    return now;
  }
  // the ride itself: he swings back as he speeds up and forward as the line levels out; sparks off
  // the trolley, a hum that rises with speed, a whoosh past the camera, a thump on the tank
  function zipTick(m, dt) {
    if (m.t >= ZIP_GO && !zip.riding && !zip.done) { zip.ride(); noise(.2, { vol: .05, from: 2400, to: 900 }); metal(0, 1400, .04); haptic('light'); }
    if (m.land >= 0) {
      const was = m.land; m.land += dt;
      if (was < .14 && m.land >= .14) { const fy = WD.land.height(NESTS.tower.x, NESTS.tower.z) + 13.02, h = zip.hands; noise(.12, { vol: .07, from: 400, to: 90 }); haptic('medium'); fx.shake(4); for (let i = 0; i < 10; i++) WD.dust.emit({ x: h.x + rnd(-.6, .6), y: fy + .1, z: h.z + rnd(-.6, .6), vx: rnd(-1.5, 1.5), vy: rnd(.3, 1.2), vz: rnd(-1.5, 1.5), life: rnd(.6, 1.1), size: .3, grow: 2.5, col: [.6, .55, .46], a: .35, drag: 2.5 }); }
      if (m.land > 1.5) { m.fade = Math.min(1, m.fade + dt * 4); if (m.fade >= 1) endMove(); }
      return;
    }
    zip.update(dt);
    if (!zip.riding) { if (zip.done) { m.land = 0; noise(.08, { vol: .05, from: 1800, to: 600 }); } return; }
    const acc = (zip.speed - m.lastV) / Math.max(dt, 1e-3); m.lastV = zip.speed;
    m.swv += (clamp(acc * .035, -.5, .5) - m.sw) * 22 * dt - m.swv * 3.2 * dt; m.sw += m.swv * dt;
    const sp = clamp(zip.speed / 45, 0, 1), h = zip.hands;
    if ((m.hum -= dt) <= 0) { m.hum = .11; noise(.16, { vol: .012 + sp * .035, from: 900 + sp * 2600, to: 700 + sp * 2000, filter: 'bandpass', q: 4 }); }
    // the air going by: motes that whip past him and the camera
    // flecks in the air rushing past his shoulder (only in the shot that looks down the line: round another camera they would be a fog)
    if (sp > .25 && zip.t < ZIP_OVER - .05) { const dr = zip.dir, r = rnd(9, 24), a = rnd(0, TAU), o = rnd(1.2, 4.5); WD.dust.emit({ x: h.x + dr.x * r + Math.cos(a) * o, y: h.y - 1 + Math.sin(a) * o * .7, z: h.z + dr.z * r - Math.sin(a) * o * .3, life: .7, size: rnd(.03, .07), col: [.95, .93, .86], a: .5 }); }
    if (sp > .35 && frame % 2 === 0) WD.sparks.emit({ x: h.x, y: h.y + .02, z: h.z, vx: -zip.dir.x * 6 + rnd(-1, 1), vy: rnd(.5, 2), vz: -zip.dir.z * 6 + rnd(-1, 1), life: rnd(.12, .3), size: .08, col: [3, 2.2, 1.1] });
    if (!m.passed && zip.t > ZIP_PASS) { m.passed = true; noise(.45, { vol: .09, from: 600, to: 2600, filter: 'bandpass', q: 2 }); noise(.5, { vol: .06, from: 2600, to: 500, filter: 'bandpass', q: 2, at: .25 }); haptic('light'); }
  }
  // does a straight line from a to b miss every wall and building?
  function clearLine(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    for (const s of WD.solids) {
      let t0 = 0, t1 = 1, hit = true;
      for (const [p, d, lo, hi] of [[a.x, dx, s.x0, s.x1], [a.y, dy, s.y0, s.y1], [a.z, dz, s.z0, s.z1]]) {
        if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { hit = false; break; } continue; }
        let u = (lo - p) / d, w = (hi - p) / d; if (u > w) [u, w] = [w, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, w); if (t0 > t1) { hit = false; break; }
      }
      if (hit) return false;
    }
    return true;
  }
  // Could a shot from the eye e reach this man? (walls and buildings, then the ground, as the bullets see it.)
  // His whole head must show: the top of a helmet over a parapet is no target, so a man like that counts as
  // hidden, and comes out. (Kneeling his head is at 1.2 m, right down behind cover under 1 m.)
  function shootable(e, s) {
    const p = { x: s.x, y: s.gy + (s.low ? .65 : s.crouch ? .91 : 1.44), z: s.y };
    if (!clearLine(e, p)) return false;
    const L = Math.hypot(p.x - e.x, p.z - e.z), n = Math.ceil(L / 2);
    for (let i = 1; i < n; i++) { const k = i / n; if (e.y + (p.y - e.y) * k < WD.land.height(e.x + (p.x - e.x) * k, e.z + (p.z - e.z) * k)) return false; }
    return true;
  }
  // the nearest open ground, a few cells round him, that a shot from e reaches (standing), not right under the nest
  function seenSpot(s, e) {
    const c0 = Math.floor((s.x - GX0) / CELL), r0 = Math.floor((s.y - GZ0) / CELL), me = { gy: 0, crouch: false, x: 0, y: 0 }; let tries = 4;
    for (let rad = 1; rad <= 8; rad++) for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad || !WD.nav.open(c0 + dc, r0 + dr)) continue;
      me.x = GX0 + (c0 + dc + .5) * CELL; me.y = GZ0 + (r0 + dr + .5) * CELL; me.gy = groundAt(me.x, me.y);
      if (Math.hypot(me.x - e.x, me.y - e.z) > 30 && shootable(e, me)) {
        // and one he can walk to (a few tries: the other side of a river or a wall doesn't count)
        const a = openNear(s.x, s.y); if (!a || tries-- <= 0) return null;
        if (WD.nav.path(a.x - GX0, a.z - GZ0, me.x - GX0, me.y - GZ0)) return { x: me.x, y: me.y };
      }
    }
    return null;
  }
  // room round a camera spot: no wall within about a metre and a half, so a corner doesn't fill the shot
  function roomAt(q) { for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (solidAt(q.x + dx, q.z + dz, WD.solids)) return false; return true; }
  // where the camera watches him start up the belfry from: a spot on the ground near the foot of the ladder, clear of
  // walls, that sees him at the bottom and a few metres up
  function climbCam() {
    if (WD.climbCam) return WD.climbCam;
    const L = WD.ladder, lo = { x: L.x, y: L.y0 + 1, z: L.z }, hi = { x: L.x, y: L.y0 + 4, z: L.z };
    for (const r of [3.4, 4.2, 5.2]) for (const a of [-.75, -.4, -1.05, 0, .4, .75]) {
      const q = { x: L.x + Math.cos(a) * r, y: L.y0 + .35, z: L.z + Math.sin(a) * r };
      if (roomAt(q) && clearLine(q, lo) && clearLine(q, hi)) return WD.climbCam = q;
    }
    return WD.climbCam = { x: L.x + 2.6, z: L.z - 2.4 };
  }
  function endMove() { WD.wren.rotation.x = 0; WD.wren.rotation.z = 0; WD.wren.visible = false; WD.trolley.visible = false; arrive(move.to, move.kind === 'climb'); }
  function arrive(to, quiet = false) {
    const old = nestId; nestId = to; nest = NESTS[to]; move = null; zip = null;
    if (!quiet) {
      heat *= .25; located = false; mortar = null; squad.still = 0;
      // they keep hunting where you were
      squadTarget = { x: NESTS[old].x, y: NESTS[old].z };
    }
    const e = nestEye(nest); look.yaw = Math.atan2(-(nest.face.x - e.x), -(nest.face.z - e.z)); look.pitch = -.06;
    arrivedT = .5;
    if (!quiet) say('In position: ' + nest.name + '.', null, 1.6);
  }
  let arrivedT = 0;
  let squadTarget = null, foeAim = null;

  // ---- lines on the radio
  function say(text, who = null, time = 2.6, enemy = false) { lineFx = { text, who, life: time, t: 0, enemy }; }

  // ---- Hale's squad (mission 2)
  function allyDown(a) { if (a.ko) return; a.ko = true; fall(a, null); dropRifle(a); say(a.name + ' is down!', HALE, 2); haptic('warning'); }

  // ---- the watchtower and its fuel drums (mission 2)
  function buildTower() {
    const M = WD.M, g = new Group(), x = 86, z = -70, y = WD.land.height(x, z);
    for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) { const l = new Mesh(new BoxGeometry(.3, 7, .3), M.wood); l.position.set(dx, 3.5, dz); g.add(l); }
    const deck = new Mesh(new BoxGeometry(4.2, .3, 4.2), M.wood); deck.position.y = 7; g.add(deck);
    const hut = new Mesh(new BoxGeometry(3.6, 1.2, 3.6), M.wood); hut.position.y = 7.7; g.add(hut);
    const top = new Mesh(solid().spire(0, 0, 0, 3.2, 1.6, 4, new Color('#ffffff'), .38, Math.PI / 4).geo(), M.roofV); top.position.y = 8.8; g.add(top);
    g.position.set(x, y, z); g.traverse(m => { if (m.isMesh) m.castShadow = m.receiveShadow = true; }); WD.v.scene.add(g);
    return { g, x, z, y, pieces: [] };
  }
  function drumHit(b) { if (b.gone) return; boom.light(b, true); }
  const boom = new Explosives({ fuse: .2, radius: 7, damage: 100 });
  boom.on('boom', (e, b) => {
    const { x, y, z } = e.at;
    for (let k = 0; k < 40; k++) WD.dust.emit({ x, y: y + 1, z, vx: rnd(-6, 6), vy: rnd(2, 12), vz: rnd(-6, 6), life: 2.6, size: 1.6, grow: 2.5, col: [.2, .19, .18], a: .9, drag: 1.2, grav: 3 });
    for (let k = 0; k < 30; k++) WD.sparks.emit({ x, y: y + 1, z, vx: rnd(-8, 8), vy: rnd(3, 12), vz: rnd(-8, 8), life: .7, size: 1, col: [6, 2.8, .6], drag: 1.6, grav: 4 });
    noise(1.4, { vol: .5, from: 700, to: 40 }); haptic('heavy'); fx.shake(6);
    for (const s of men) if (!s.ko && Math.hypot(s.x - x, s.y - z) < e.radius) knockOut(s, false, 0, false);
    if (tower && !tower.down && Math.hypot(tower.x - x, tower.z - z) < 9) {
      tower.down = true; const pieces = [];
      for (const m of [...tower.g.children]) { m.updateMatrixWorld(true); const ps = shatter(m, { pieces: 5, at: { x, y: y + 2, z }, inside: WD.M.wood, seed: 3 }); pieces.push(...ps); }
      tower.g.removeFromParent();
      for (const p of pieces) { p.castShadow = true; const dx = p.position.x - x, dz = p.position.z - z, l = Math.hypot(dx, dz) || 1; p.userData.v = { x: dx / l * rnd(3, 8), y: rnd(3, 9), z: dz / l * rnd(3, 8), r: rnd(-4, 4) }; }
      tower.pieces = pieces;
    }
    if (b?.mesh) b.mesh.visible = false;
    if (car && car.on && Math.hypot(car.x - x, car.z - z) < 14) { car.stopped = true; car.smoke = true; if (car.gunner && !car.gunner.ko) knockOut(car.gunner, false, 0, false); }
    score += 150; api.score(score);
  });
  function buildCar() {
    const M = WD.M, g = new Group(), body = pbr('#4a4f48', { rough: .6, metal: .4 });
    const hull = new Mesh(rbox(2.4, 1.4, 5, .2), body); hull.position.y = 1.2; g.add(hull);
    const turret = new Mesh(rbox(1.5, .7, 1.6, .2), body); turret.position.set(0, 2.2, -.3); g.add(turret);
    const barrel = new Mesh(new CylinderGeometry(.08, .08, 1.6, 8), M.iron); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 2.2, -1.6); g.add(barrel);
    for (const [dx, dz] of [[-1.2, -1.6], [1.2, -1.6], [-1.2, 1.6], [1.2, 1.6]]) { const w = new Mesh(new CylinderGeometry(.55, .55, .4, 14), M.dark); w.rotation.z = Math.PI / 2; w.position.set(dx, .55, dz); g.add(w); }
    g.traverse(m => { if (m.isMesh) m.castShadow = true; }); g.visible = false; WD.v.scene.add(g);
    temps.push(g); return { g, x: 240, z: -78, stopped: false, on: false, fireT: 3 };
  }

  // ---- missions
  const missions = {
    m1: {
      nests: ['ridge', 'tower'], weather: 'clear',
      setup() {
        const dz = MILL.z + 4.78, door = WD.millDoor;
        op = soldier({ kind: 'radio', x: MILL.x - 2.6, y: dz, deck: WD.millDeck, yaw: Math.PI, fixed: true, route: [[MILL.x - 2.7, dz, 4], [MILL.x + 3, dz, 3], [door.x, dz, 0], [door.x, door.z - .9, 3.5], [door.x, dz, 0]] });
        op.send = 0; op.sending = false;
        men.push(op,
          soldier({ x: MILL.x + 9, y: MILL.z + 8, route: [[MILL.x + 9, MILL.z + 8, 3], [MILL.x - 9, MILL.z + 8, 2], [MILL.x - 9, MILL.z - 8, 3], [MILL.x + 9, MILL.z - 8, 2]] }),
          soldier({ x: MILL.x - 12, y: MILL.z - 2, yaw: Math.PI, route: [[MILL.x - 12, MILL.z - 2, 5], [MILL.x - 20, MILL.z - 18, 4]] }),
          soldier({ x: -10, y: -96, yaw: 2.2 }), soldier({ x: -18, y: -92, yaw: .4, route: [[-18, -92, 6], [-30, -70, 5]] }),
          soldier({ x: 10, y: -100, yaw: -1 }),
          soldier({ x: -60, y: RAILZ + 3, route: [[-60, RAILZ + 3, 2], [60, RAILZ + 3, 2]] }),
          soldier({ kind: 'officer', look: 'officer', x: -8, y: -104, yaw: Math.PI, spotter: true }),
        );
      },
      // the fly-in ends over the rocks in front of him (flying down into the nest went through the zip pole); play cuts to his eye
      intro: () => [
        { at: 0, cam: [{ x: -90, y: 46, z: -190 }, { x: 10, y: 28, z: -70 }, { x: 60, y: 30, z: 60 }, { x: NESTS.ridge.x - 2, y: nestEye(NESTS.ridge).y + 9, z: NESTS.ridge.z - 14 }], look: (tt) => tt < 4 ? { x: MILL.x, y: 6, z: MILL.z } : { x: 20, y: 6, z: -60 }, time: 7.2, ease: 'inOut' },
        { at: .3, say: 'Wren, Oake here. The Grey Order keeps a radio post in the old mill.', who: OAKE, time: 3.3 },
        { at: 3.7, say: 'If their operator calls in the column, our raid is finished. Stop him.', who: OAKE, time: 3.4 },
      ],
      *script(m) {
        yield m.until(() => state === 'play');
        m.objective('Drag to look round. Find the mill by the river', { at: { x: MILL.x, y: 6, z: MILL.z } });
        yield m.any(m.until(() => facing(MILL.x, MILL.z) < .2), m.wait(8));
        m.objective('Tap the glasses and hold them on the man with the aerial', { at: op });
        say('Field glasses first. Find the man with the aerial.', OAKE, 3);
        yield m.until(() => op.tagged || op.ko);
        if (!op.ko) { op.sending = true; say('He\'s calling it in. You have a minute!', OAKE, 3); }
        m.objective('Scope in, hold your breath and stop the operator', { at: op });
        coverMsg = 'Wait for the train: it covers the sound of your shot';
        yield m.until(() => op.ko);
        opTime = op.send;
        m.checkpoint('radio');
        say('Radio\'s dead. Their patrol is stirring. Thin them out.', OAKE, 3);
        truckIn();
        const o = m.objective('Knock out the patrol');
        yield m.until(() => { const n = alive(men).length; o.text = 'Knock out the patrol: ' + n + ' left'; return n <= 1; });
        m.checkpoint('patrol');
        if (nestId !== 'tower') { m.objective('The supply train is due. Tap MOVE and ride the line to the water tower'); say('Supply train\'s due. Ride the line down to the water tower!', OAKE, 3); yield m.until(() => nestId === 'tower'); }
        m.objective('Jump onto the train as it passes under you');
        train.final = true; train.on = true; train.x = -235; train.speed = 14;
        yield m.until(() => train.x > -150);
        qteKind = 'train'; qte.start([{ kind: 'tap', time: 1.6 }, { kind: 'swipe', dir: 'down', time: 1.4 }], { slow: .3 });
        yield m.until(() => !qte.active);
        outro([{ at: 0, cam: [{ x: train.x - 5, y: RAILH + 5.4, z: RAILZ + 10 }, { x: train.x + 26, y: RAILH + 9, z: RAILZ + 28 }], look: (tt) => ({ x: train.x + TRAIN.W1 + 2, y: RAILH + 3.5, z: RAILZ }), time: 4.5, ease: 'out' },
          { at: .2, say: 'Good work, Wren. The column never got the call.', who: OAKE, time: 3.6 }]);
        yield m.until(() => outroDone);
      },
      stars: () => [true, opTime != null && opTime < 30, mission.time < 180],
    },
    m2: {
      nests: ['chapel', 'mill2'], weather: 'rain',
      setup() {
        const cy = WD.churchTop;
        cs = soldier({ kind: 'cs', look: 'rook', x: CHURCH.x, y: CHURCH.tz + 1.6, lift: cy.y - groundAt(CHURCH.x, CHURCH.tz + 1.6) + .2, yaw: 0, fixed: true, crouch: true, see: 0 });
        mgNest = { x: BRIDGE.x - 2, z: -27 };
        const g1 = soldier({ kind: 'mg', x: mgNest.x, y: mgNest.z, yaw: 0, fixed: true, crouch: true }), g2 = soldier({ kind: 'mg2', x: mgNest.x + 2, y: mgNest.z - 1.5, yaw: 0, fixed: true, crouch: true });
        men.push(cs, g1, g2,
          soldier({ x: 22, y: -92, yaw: .3 }), soldier({ x: 56, y: -88, yaw: -.2 }), soldier({ x: -4, y: -70, yaw: 0, route: [[-4, -70, 4], [24, -56, 4]] }),
          soldier({ x: 30, y: -40, yaw: .1, route: [[30, -40, 3], [56, -42, 3]] }),
          soldier({ kind: 'officer', look: 'officer', x: -6, y: -98, yaw: 0, spotter: true }),
        );
        allies = ['Hale', 'Pike', 'Dunn'].map((name, i) => { const a = soldier({ look: 'ally', x: BRIDGE.x - 2 + i * 2, y: 44 + i * 3, yaw: Math.PI, fixed: true, ally: true, name }); a.hp = 100; a.leg = 0; return a; });
        // the sandbag nest by the bridge
        sandbags(mgNest.x + 1, mgNest.z + 2.2);
        tower = buildTower();
        drums = [0, 1, 2].map(i => {
          const b = boom.add({ x: tower.x - 1.2 + i * 1.1, y: tower.y, z: tower.z - 3.4, size: .5 });
          b.mesh = new Mesh(new CylinderGeometry(.4, .4, 1, 12), WD.M.drum); b.mesh.position.set(b.x, b.y + .5, b.z); b.mesh.castShadow = true; WD.v.scene.add(b.mesh); temps.push(b.mesh);
          return b;
        });
        car = buildCar();
        // the car's hatch gunner: knock him out and it stops too
        car.gunner = soldier({ kind: 'cargun', x: car.x, y: car.z, lift: 2.1, fixed: true });
        car.gunner.m.visible = false; men.push(car.gunner);
      },
      intro: () => [
        { at: 0, cam: [{ x: 120, y: 30, z: -120 }, { x: 70, y: 18, z: -20 }, { x: 46, y: 18, z: 64 }, { ...nestEye(NESTS.chapel), y: WD.land.height(NESTS.chapel.x, NESTS.chapel.z) + 2 }], look: { x: 40, y: 4, z: 0 }, time: 6.4, ease: 'inOut' },
        { at: .3, say: 'Hale\'s squad crosses the old bridge at dusk. Keep them alive, Wren.', who: OAKE, time: 3.2 },
        { at: 3.6, say: 'Get up that belfry. The bell will cover your shots.', who: OAKE, time: 2.8 },
      ],
      *script(m) {
        yield m.until(() => state === 'play');
        startMove('chapel', 'climb');
        yield m.until(() => !move);
        m.objective('A marksman watches from the church tower. Find his glint', { at: cs });
        say('Careful: Rook, their best marksman, is in the church tower. If his glint flares, get off the scope!', OAKE, 3.6);
        yield m.until(() => cs.ko);
        m.checkpoint('marksman');
        say('Moving onto the bridge. Cover us, Wren.', HALE, 2.6);
        m.objective('Cover Hale\'s squad as they cross the bridge', { at: { x: BRIDGE.x, y: 3, z: 10 } });
        allyGo = 1;
        yield m.until(() => allies.some(a => a.y < 14) || m.time > 999);
        const g = men.filter(s => s.kind === 'mg' || s.kind === 'mg2'); mgOn = true;
        say('Gun nest! We\'re pinned!', HALE, 2.2);
        m.objective('Silence the gun nest at the far end of the bridge', { at: { x: mgNest.x, y: 5, z: mgNest.z } });
        yield m.until(() => g.every(s => s.ko));
        allyGo = 2; mgOn = false;
        say('Gun\'s quiet. Pushing up!', HALE, 2.2);
        const rifles = men.filter(s => s.kind === 'rifle');
        for (const s of rifles) wakeUp(s);
        const o = m.objective('Clear the bridgehead');
        yield m.until(() => { const n = alive(rifles).length; o.text = 'Clear the bridgehead: ' + n + ' left'; return n === 0; });
        car.on = true; car.g.visible = true;
        say('Armour on the east road! Hit the fuel drums under the watchtower!', HALE, 3.2);
        m.objective('Shoot the red fuel drums as the armoured car passes', { at: { x: tower.x, y: tower.y + 1, z: tower.z + 3 } });
        yield m.until(() => car.stopped);
        allyGo = 3;
        say('That stopped it! Into the square, lads.', HALE, 2.6);
        m.objective('Cover the squad into the square');
        yield m.until(() => alive(allies).every(a => a.done));
        outro([{ at: 0, cam: [{ x: -5, y: 9, z: -70 }, { x: -25, y: 12, z: -78 }], look: { x: -12, y: 7, z: -96 }, time: 4.2, ease: 'out' },
          { at: .2, say: 'Larkford is ours. Fine shooting, Wren.', who: HALE, time: 3.6 }]);
        yield m.until(() => outroDone);
      },
      stars: () => [true, allies.every(a => !a.ko), !!cs.oneShot],
    },
  };
  let allyGo = 0, mgOn = false; const temps = [];
  function sandbags(x, z) {
    if (!WD.bags) { WD.bags = new InstancedMesh(rbox(1.1, .45, .6, .2), WD.M.sand, 24); WD.bags.castShadow = WD.bags.receiveShadow = true; WD.v.scene.add(WD.bags); }
    const o = new Object3D(); let i = 0; const y = groundAt(x, z);
    for (let row = 0; row < 2; row++) for (let k = 0; k < 7; k++) { const a = -1.3 + k * .43; o.position.set(x + Math.sin(a) * 2.4, y + .22 + row * .42, z - Math.cos(a) * -2.4 * -1); o.rotation.set(0, a, 0); o.updateMatrix(); WD.bags.setMatrixAt(i++, o.matrix); }
    WD.bags.count = i; WD.bags.instanceMatrix.needsUpdate = true; WD.bags.visible = true;
    WD.solids.push({ x0: x - 2.6, x1: x + 2.6, y0: y, y1: y + .85, z0: z - .5, z1: z + .6, kind: 'low', temp: true });
  }
  function truckIn() {
    // four more come down the east road
    for (let i = 0; i < 4; i++) { const s = soldier({ x: 150 + i * 3, y: -72 - i, yaw: -Math.PI / 2 }); s.route = [[60 - i * 6, -86 + i * 2, 2]]; s.late = true; s.sus = .7; men.push(s); }
  }
  function facing(x, z) { const e = WD.v.cam.position; return Math.abs(angDiff(look.yaw, Math.atan2(-(x - e.x), -(z - e.z)))); }
  // the mission's best shot, played back before the closing shot: the round from Wren's barrel to him,
  // with the camera running alongside, then a beat on him going down
  let bestShot = null;
  function replaySteps() {
    const r = bestShot; if (!r || r.s.ko === false) return [];
    const { from: A, to: B } = r, dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z, L = Math.hypot(dx, dy, dz) || 1, ux = dx / L, uy = dy / L, uz = dz / L, sx = -uz, sz = ux, T = clamp(L / 120, 1.8, 3.2);
    const at = u => ({ x: A.x + dx * u, y: A.y + dy * u, z: A.z + dz * u });
    // a beat on him going down, from the first of a ring of spots round him with a clear view (no wall, no hill)
    let hold = null; const gy = r.s.gy;
    for (let i = 0; i < 12 && !hold; i++) {
      const a = Math.atan2(-ux, -uz) + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * .5 + .9, q = { x: r.s.x + Math.sin(a) * 3.6, y: gy + 1.5, z: r.s.y + Math.cos(a) * 3.6 };
      if (q.y < WD.land.height(q.x, q.z) + .5) continue;
      const h = hitTest(q.x, q.y, q.z, r.s.x, gy + .6, r.s.y); if (!h || h.s || h.t > .92) hold = q;
    }
    hold ||= { x: B.x - ux * 4.5, y: B.y + .5, z: B.z - uz * 4.5 };
    const tag = [r.d + ' M', r.head ? 'HEAD' : null, Math.abs(r.wind) > .4 ? 'WIND ' + Math.abs(r.wind).toFixed(1) + (r.wind > 0 ? ' ▸' : ' ◂') : null, r.covered ? 'COVERED' : null].filter(Boolean).join(' · ');
    return [
      { at: 0, do: () => { const q = r.s; q.m.rig.play('idle', { fade: 0 }); q.m.rotation.set(0, q.yaw, 0); q.tilt = null; q.still = false; q.fallT = -9; WD.bullet.visible = true; } },
      // the camera rides the round's own path (it was clear: the round flew it), just above and to the side
      { at: 0, cam: [{ x: A.x - ux * 2 + sx * .3, y: A.y + .3, z: A.z - uz * 2 + sz * .3 }, { x: B.x - ux * 4.5 + sx * .3, y: B.y + .3, z: B.z - uz * 4.5 + sz * .3 }], time: T, ease: 'linear',
        look: tt => { const p = at(clamp(tt / T, 0, 1)); WD.bullet.position.set(p.x, p.y, p.z); WD.bullet.rotation.set(0, 0, 0); WD.bullet.lookAt(p.x + ux, p.y + uy, p.z + uz); WD.bullet.rotateX(Math.PI / 2); return { x: p.x + ux * 3, y: p.y + uy * 3, z: p.z + uz * 3 }; } },
      { at: .1, say: tag, who: 'BEST SHOT', time: T + 1.2 },
      { at: T, do: () => { WD.bullet.visible = false; fall(r.s, A); for (let i = 0; i < 14; i++) WD.sparks.emit({ x: B.x, y: B.y, z: B.z, vx: rnd(-2.4, 2.4), vy: rnd(1, 3), vz: rnd(-2.4, 2.4), life: .8, size: .035, col: [2.2, 1.7, .5], drag: 1.5, grav: 6 }); } },
      { at: T, cam: [{ ...hold, x: hold.x + (hold.x - r.s.x) * .15, z: hold.z + (hold.z - r.s.y) * .15 }, hold], look: { x: r.s.x, y: r.s.gy + .7, z: r.s.y }, time: 1.4, ease: 'out' },
    ];
  }
  function outro(steps) {
    const rp = replaySteps(), T = rp.length ? rp[rp.length - 1].at + rp[rp.length - 1].time : 0;
    steps = [...rp, ...steps.map(st => ({ ...st, at: st.at + T }))];
    cut = new Cutscene(steps, { bars: .14 }); cut.on('end', () => { outroDone = true; }); state = 'outro'; scoped = false; glass = false; }

  // ---- moving soldiers
  function walk(s, tx, tz, speed, dt) {
    if ((s.pathTo?.x !== tx || s.pathTo?.z !== tz) && pathBudget > 0) {
      pathBudget--; s.pathTo = { x: tx, z: tz };
      const a = openNear(s.x, s.y), b = openNear(tx, tz), p = a && b ? WD.nav.path(a.x - GX0, a.z - GZ0, b.x - GX0, b.z - GZ0) : null;
      if (p) { s.path = p.map(q => ({ x: q.x + GX0, z: q.y + GZ0 })); if ((b.x !== tx || b.z !== tz) && dryStep(b, tx, tz)) s.path.push({ x: tx, z: tz }); s.pi = s.path.length > 1 ? 1 : 0; }
      else s.path = null;   // no way there on foot: wait for a new order rather than wade across
    }
    if (!s.path || s.pathTo?.x !== tx || s.pathTo?.z !== tz) { s.vx = s.vy = 0; return s.pathTo?.x === tx && s.pathTo?.z === tz ? 'stuck' : false; }
    const q = s.path[Math.min(s.pi, s.path.length - 1)], dx = q.x - s.x, dz = q.z - s.y, d = Math.hypot(dx, dz);
    if (d < .4) { if (s.pi < s.path.length - 1) s.pi++; else { s.vx = s.vy = 0; return true; } }
    const k = Math.min(1, speed * dt / (d || 1)); s.vx = dx / (d || 1) * speed; s.vy = dz / (d || 1) * speed;
    s.x += dx * k; s.y += dz * k; s.yaw = turnTo(s.yaw, Math.atan2(dx, dz), dt * 6);
    return false;
  }
  // the last little step off the grid to the exact goal: only if it's short and on dry ground clear of walls
  function dryStep(b, tx, tz) {
    if (Math.hypot(tx - b.x, tz - b.z) > CELL * 1.2) return false;
    for (let k = .25; k <= 1; k += .25) { const x = b.x + (tx - b.x) * k, z = b.z + (tz - b.z) * k; if (WD.land.height(x, z) < -.9 || solidAt(x, z, WD.solids)) return false; }
    return true;
  }
  // the nearest walkable spot (a goal inside a wall or the river moves to the bank)
  function openNear(x, z) {
    const c0 = Math.floor((x - GX0) / CELL), r0 = Math.floor((z - GZ0) / CELL);
    if (WD.nav.open(c0, r0)) return { x, z };
    for (let rad = 1; rad <= 4; rad++) for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad || !WD.nav.open(c0 + dc, r0 + dr)) continue;
      return { x: GX0 + (c0 + dc + .5) * CELL, z: GZ0 + (r0 + dr + .5) * CELL };
    }
    return null;
  }
  const turnTo = (a, b, k) => a + clamp(angDiff(b, a), -k, k);
  // is your scope (or the glasses) on him? He can tell, and keeps his head down if he's in cover
  function watched(s) {
    if (!(scoped || glass) || !nest || move) return false;
    const e = WD.v.cam.position, d = dirOf(look.yaw, look.pitch, tmpB), dx = s.x - e.x, dy = s.gy + 1.2 - e.y, dz = s.y - e.z, l = Math.hypot(dx, dy, dz) || 1;
    return (d.x * dx + d.y * dy + d.z * dz) / l > Math.cos(fovNow() * Math.PI / 360 * .8);
  }
  // a rifleman's mind picks what to do next; the moves themselves come from the squad kit (cover, flanks)
  function think(s, tgt) {
    if (warming) return;
    const o = s.order || {}, d = Math.hypot(s.x - tgt.x, s.y - tgt.y), sp = o.spot, C = CELL;
    const inCover = sp && Math.hypot(s.x - sp.x, s.y - sp.y) < 1.5 ? 1 : -1;
    const see = [clamp(d / 300, 0, 2), clamp(heat, 0, 1.2), inCover, watched(s) ? 1 : 0, s.shaken || 0, squad.aggression, alive(men).length / Math.max(1, men.length), clamp(quietT / 15, 0, 1), s.nerve ?? (s.nerve = rnd(-1, 1))];
    s.mind.act(see, s.thinkDt); s.thinkDt = 0;
    const a = s.mind.action, moving = o.do === 'move' && !o.arrived, at = { x: tgt.x, y: tgt.y };
    if (a === 'hold' && quietT > 20) s.mind.feel(-.1);           // a dull lull: nobody shooting, him sat in cover
    // close to a nest you're staying in: a grenade (two a mission, not too often)
    if ((a === 'rush' || a === 'flank') && nest && !move && d < 40 && squad.grenades > 0 && squad.t - squad.lastGrenade > 9) {
      squad.grenades--; squad.lastGrenade = squad.t; s.order = { do: 'throw', at }; s.plan = 'grenade'; squad.call(s, 'grenade'); return;
    }
    if (a === s.plan && (moving || a !== 'rush')) return;          // carry on (a finished rush finds the next cover)
    s.plan = a;
    if (a === 'rush') {
      if (d < 30) { s.order = { do: 'shoot', at, spot: null, from: null }; return; }   // close enough: fight from here
      squad.order(s, 'advance', tgt, { band: [2 * C, Math.max(3 * C, d - 3 * C)], near: 14 * C });
      // no cover nearer: a dash part of the way, never right up to you
      if (!s.order.spot) { const k = clamp(Math.min(40, d - 24) / d, 0, 1); s.order.to = { x: s.x + (tgt.x - s.x) * k, y: s.y + (tgt.y - s.y) * k }; }
      squad.call(s, 'moving');
    } else if (a === 'flank') { squad.lastFlank = squad.t; squad.order(s, 'flank', tgt, { flank: 1.3, near: 16 * C, band: [3 * C, Math.max(4 * C, d)] }); squad.call(s, 'flanking'); }
    else if (a === 'fallback') { squad.order(s, 'retreat', tgt, { near: 12 * C, band: [d + 2 * C, d + 30 * C] }); squad.call(s, 'falling back'); }
    else if (a === 'peek') { s.order = { do: 'shoot', at: { x: tgt.x, y: tgt.y }, spot: inCover > 0 ? sp : null, from: inCover > 0 ? WD.cover.peek(sp, tgt) : null }; s.fireT = Math.max(s.fireT, rnd(.9, 1.6)); if (Math.random() < .3) squad.call(s, 'covering'); }
    else {
      const spot = inCover > 0 ? sp : WD.cover.find(s, tgt, { who: s, near: 6 * C, band: [3 * C, d + 8 * C], sees: squad.sees });
      if (spot && inCover < 0) { WD.cover.take(spot, s); s.order = { do: 'move', role: 'hold', to: { x: spot.x, y: spot.y }, spot, at: { x: tgt.x, y: tgt.y } }; }
      else s.order = { do: 'hold', spot };
      if (see[3] && inCover > 0) squad.call(s, 'heads down');
    }
  }
  // seconds in a row the current nest couldn't have shot him (checked twice a second; 0 while Wren is on the move)
  function hiddenFor(s, dt, stand) {
    if (!nest || move || state !== 'play') return s.hidT = 0;
    if ((s.chkT = (s.chkT ?? Math.random() * .5) - dt) <= 0) {
      s.chkT = .5; const c = s.crouch, l = s.low; if (stand) s.crouch = s.low = false;   // (stand: as he is when he rises to fire)
      const ok = shootable(nestEye(nest), s); s.crouch = c; s.low = l;
      s.hidT = ok ? 0 : (s.hidT || 0) + .5; s.inView = ok;
    }
    return s.hidT || 0;
  }
  const STRIDES = { idle: 0, walk: 1.3, jog: 3.3, run: 5.6 };
  function updateMen(dt) {
    const eye = WD.v.cam.position; pathBudget = 1; thinkBudget = 1; let plantN = 6;
    // what the camera can see: a cone round its view (a scope's is narrow), and anyone a few metres from it
    const cf = WD.v.cam.getWorldDirection(tmpV), cfx = cf.x, cfy = cf.y, cfz = cf.z, coneCos = Math.cos(Math.min(1.4, Math.atan(Math.tan(WD.v.cam.fov * Math.PI / 360) * Math.hypot(1, WD.v.cam.aspect)) + .14));
    // Wren as the soldiers' senses see him: at his nest, harder to make out at dusk, easier just after
    // a shot (the flash and the dust) and through his lenses (a glint)
    if (nest && !move && state === 'play') { const e = nestEye(nest); wrenT ||= {}; wrenT.x = e.x; wrenT.y = e.z; wrenT.hidden = false; } else wrenT = null;
    wrenLight = (mid === 'm2' ? .3 : .5) * (t - lastShotT < 2 ? 2.2 : 1) * (scoped || glass ? 1.3 : 1);
    for (const s of men) {
      const m = s.m; let speed = 0, stance = 'idle';
      if (s.ko) { lie(s, dt); if (s.koFx) s.koFx.t += dt; continue; }
      s.vx = s.vy = 0; s.low = false;
      if (s.kind === 'radio') {
        // paces the balcony; steps inside (behind the wall) now and then
        if (s.route) { const r = s.route[s.ri]; if (Math.hypot(r[0] - s.x, r[1] - s.y) > .2) { const d = Math.hypot(r[0] - s.x, r[1] - s.y), k = Math.min(1, 1.1 * dt / d); s.vx = (r[0] - s.x) / d * 1.1; s.vy = (r[1] - s.y) / d * 1.1; s.x += (r[0] - s.x) * k; s.y += (r[1] - s.y) * k; speed = 1.1; s.yaw = turnTo(s.yaw, Math.atan2(r[0] - s.x, r[1] - s.y), dt * 4); } else if ((s.wt += dt) > r[2]) { s.wt = 0; s.ri = (s.ri + 1) % s.route.length; } }
        if (s.sending) { s.send += dt; if (s.send > 60) mission.fail('The call went through. The column is coming.'); }
        m.rig.upper(s.sending ? 'call' : null);
        { const u = m.userData; if (s.sending && !u.handset) m.bones.handR.add(u.handset = handset()); if (u.handset) u.handset.visible = !!s.sending; }   // the handset is in his hand while he sends
      } else if (s.kind === 'cs') {
        // the marksman: scans, then settles on you when he sees you looking at him (scope glint both ways)
        // Sgt. Rook hunts you: he settles on your lens, his own glint flares as he takes aim (drop the
        // scope or glasses then and his shot goes over), and after each shot, or a near miss of yours,
        // he ducks behind the bell and comes up in another arch
        if (s.hideT > 0) {
          s.hideT -= dt;
          if (s.hideT <= 0) rookAppear(s, eye);
        } else {
          const lookAtMe = Math.atan2(eye.x - s.x, eye.z - s.y);
          s.yaw = turnTo(s.yaw, lookAtMe + Math.sin(t * .4) * .5 * (1 - s.see), dt * 1.5);
          const watching = Math.abs(angDiff(s.yaw, lookAtMe)) < .12;
          if (s.aimT > 0) {
            s.aimT -= dt;
            if (s.aimT <= 0) { const ducked = !scoped && !glass; enemyShot(s, 'me', ducked ? 'csDucked' : 'cs'); if (ducked) rookSay('dodged'); s.see = .35; rookHide(s, 1.2); }
          } else {
            s.see = clamp(s.see + (watching && (scoped || glass) ? dt * .45 : -dt * .2), 0, 1);
            if (s.see >= 1 && (s.fireT -= dt) <= 0) { s.aimT = ROOK_AIM; s.fireT = 3.4; tone(1500, { len: .08, wave: 'sine', vol: .03 }); haptic('warning'); }
          }
        }
        stance = 'kneel'; m.rig.upper('aim');
      } else if (s.kind === 'mg' || s.kind === 'mg2') {
        stance = 'kneel'; m.rig.upper(s.kind === 'mg' || men.find(o => o.kind === 'mg').ko ? 'aim' : null);
        const gunner = s.kind === 'mg' || men.find(o => o.kind === 'mg')?.ko;
        if (mgOn && gunner && (s.fireT -= dt) <= 0) {
          s.fireT = rnd(.12, .2); s.burst = (s.burst || 0) + 1; if (s.burst > 8) { s.burst = 0; s.fireT = 1.4; }
          const tgt = alive(allies)[Math.floor(Math.random() * alive(allies).length)];
          if (tgt) { s.yaw = turnTo(s.yaw, Math.atan2(tgt.x - s.x, tgt.y - s.y), dt * 3); enemyShot(s, tgt, 'mg'); }
          noise(.07, { vol: .08, from: 2000, to: 300 });
        }
        if (s.kind === 'mg2' && men.find(o => o.kind === 'mg').ko && !s.moved) { s.moved = true; s.x = mgNest.x; s.y = mgNest.z; }
      } else if (s.kind === 'cargun') {
        m.visible = !!car?.on; if (car) { s.x = car.x; s.y = car.z + .4; s.yaw = Math.PI / 2 + Math.PI; }
        m.rig.upper('aim');
      } else if (s.alert) {
        s.alertT += dt; s.thinkDt += dt; s.shaken = Math.max(0, (s.shaken || 0) - dt * .2);
        // nobody hides for good: a man the nest can't reach for a few seconds steps out to where it can, and shoots back from there
        const hid = hiddenFor(s, dt, s.order?.do === 'shoot');
        if (hid > 5 && !(s.showT > 0) && foeAim) {
          // the nearest spot in reach of the nest, or else head for the nest itself and stop as soon as it can see him
          const spot = seenSpot(s, nestEye(nest));
          WD.cover.free(s); s.plan = 'show'; s.showT = spot ? 9 : 20; s.hidT = 0; s.inView = false;
          s.order = { do: 'move', role: 'show', to: spot || { x: nest.x, y: nest.z }, spot: null, at: { x: foeAim.x, y: foeAim.y } };
        }
        if (s.showT > 0) {
          s.showT -= dt;
          if (s.order?.role === 'show' && (s.order.arrived || (s.inView && Math.hypot(s.x - nest.x, s.y - nest.z) > 30))) { s.order = { do: 'shoot', at: s.order.at, spot: null, from: null, shown: true }; s.hidT = 0; }
          else if (s.order?.shown && hid >= 1.5) { s.showT = 0; s.hidT = 6.5; }      // still out of reach where he stopped: look again
        }
        else if (s.mind && foeAim && (s.thinkT -= dt) <= 0 && thinkBudget-- > 0) { s.thinkT = rnd(.8, 1.3); think(s, foeAim); }
        const o = s.order || { do: 'hold' };
        if (o.do === 'move' && o.to) {
          if (!o.arrived && !walk(s, o.to.x, o.to.y, o.role === 'retreat' ? 3.6 : 3.3, dt)) { speed = 3.3; s.crouch = false; }
          else { o.arrived = true; s.crouch = !!o.spot; if (o.at) s.yaw = turnTo(s.yaw, Math.atan2(o.at.x - s.x, o.at.y - s.y), dt * 4); }
        } else if (o.do === 'shoot') {
          // pops up from cover to shoot, then ducks back down: watch the rhythm and take him as he rises
          const up = !o.spot || s.fireT < .9 || t - (s.shotAt ?? -9) < .6, p = (up ? o.from : o.spot) || { x: s.x, y: s.y };
          if (Math.hypot(p.x - s.x, p.y - s.y) > .4) { if (walk(s, p.x, p.y, 2.2, dt) === 'stuck') o.from = o.spot = null; else speed = 2.2; }
          s.crouch = !up; s.yaw = turnTo(s.yaw, Math.atan2(o.at.x - s.x, o.at.y - s.y), dt * 4);
          if ((s.fireT -= dt) <= 0 && !speed) { s.fireT = rnd(1.8, 3.2); s.shotAt = t; const ally = allies && nearestAlly(s); if (ally) enemyShot(s, ally, 'rifle'); else if (located && nest && !move) enemyShot(s, 'me', 'rifle'); }
        } else if (o.do === 'throw') {
          s.order = { do: 'hold' };
          if (nest && !move && Math.hypot(s.x - nest.x, s.y - nest.z) < 40) { const e = nestEye(nest); setTimeout0(2, () => { if (nestId && !move && nest && Math.hypot(e.x - nest.x, e.z - nest.z) < 1) { hurtMe(24, { x: s.x, y: s.gy, z: s.y }); fx.shake(8); noise(.8, { vol: .4, from: 800, to: 60 }); } }); say('Grenade!', null, 1.2); }
        } else { s.crouch = !!o.spot || s.shaken > .3; if (allies) { const ally = nearestAlly(s); if (ally && (s.fireT -= dt) <= 0) { s.fireT = rnd(2, 3.5); enemyShot(s, ally, 'rifle'); } } }
        // stopped: on a knee with his rifle up, or (between shots from cover) right down behind it
        s.low = s.crouch && o.do === 'shoot' && !speed; stance = s.low ? 'duck' : s.crouch ? 'kneel' : 'idle'; m.rig.upper(speed > 0 || s.low ? null : 'aim');
      } else {
        // calm: patrol or stand; suspicion grows when bullets land near or a friend drops
        // eyes and ears (gs.senses): he hears shots and near misses and turns to look; close enough,
        // with a clear line, he can make Wren out (sooner just after Wren fires, through the lens glint)
        const sn = s.senses ||= new Senses({ range: mid === 'm2' ? 95 : 135, fov: 110, near: 12, hearing: mid === 'm2' ? .75 : 1, spotTime: 2.4, memory: 5, searchTime: 7, calmDown: 5 });
        if (!s.fixed) {
          if ((s.seeT = (s.seeT ?? Math.random() * .4) - dt) <= 0 && wrenT && Math.hypot(s.x - wrenT.x, s.y - wrenT.y) < sn.range) { s.seeT = .4; s.clear = shootable(nestEye(nest), s); }
          const was = sn.mood;
          sn.update(dt, { x: s.x, y: s.y, facing: Math.PI / 2 - s.yaw }, wrenT, { sees: () => !!s.clear, noises, light: wrenLight });
          if (sn.mood !== was) s.moodT = 0; s.moodT = (s.moodT || 0) + dt;
          s.sus = Math.max(s.sus, sn.awareness * .98);
          if (sn.mood === 'alert' && sn.seen) { heat = Math.max(heat, 1); wakeUp(s, 'seen'); }
        }
        const wary = !s.fixed && (sn.mood === 'suspicious' || sn.mood === 'searching') && sn.lookAt;
        // a sentry standing where the nest can't reach him wanders out to where it can
        if (!s.route && !s.fixed && hiddenFor(s, dt, true) > 5) { const p = seenSpot(s, nestEye(nest)); s.hidT = 0; if (p) s.route = [[p.x, p.y, 1e9]], s.ri = 0, s.wt = 0; }
        if (wary) s.yaw = turnTo(s.yaw, Math.atan2(sn.lookAt.x - s.x, sn.lookAt.y - s.y), dt * 2.5);   // stops and stares where the sound came from
        else if (s.route) {
          const r = s.route[s.ri % s.route.length];
          if (Math.hypot(r[0] - s.x, r[1] - s.y) > .6) { if (walk(s, r[0], r[1], s.late ? 2.6 : 1.3, dt) === 'stuck') { s.ri++; if (s.route.length < 2) s.route = null; } else speed = s.late ? 2.6 : 1.3; }
          else if ((s.wt += dt) > r[2]) { s.wt = 0; s.ri++; if (s.late) { s.route = null; s.sus = .8; } }
        }
        if (s.sus > .5 && !wary) { s.yaw += Math.sin(t * 2 + s.x) * dt; }
        s.sus = Math.max(0, s.sus - dt * .05);
        m.rig.upper(wary && sn.mood === 'searching' ? 'aim' : null);   // searching: rifle up, scanning
        if (s.spotter && spotting) { s.yaw = turnTo(s.yaw, Math.atan2(eye.x - s.x, eye.z - s.y), dt * 2); m.rig.upper('aim'); }
      }
      // his body: a flinch plays right through; else his stride by how fast he goes (easing into it and out), or his stance once he stops
      s.av = (s.av || 0) + clamp(speed - (s.av || 0), -dt * 9, dt * 12);
      if (s.act && (m.rig.done || m.rig.state !== s.act)) s.act = null;
      if (!s.act) { if (s.av > .15) m.rig.blend(STRIDES, s.av); else m.rig.play(stance, { fade: .22 }); }
      s.gy = s.deck ?? groundAt(s.x, s.y) + (s.lift || 0);
      m.position.set(s.x, s.gy, s.y); m.rotation.y = s.yaw;
      // indoors (through the mill's balcony door): out of sight and out of reach
      s.inside = (s.kind === 'radio' && WD.millDoor && s.y < WD.millDoor.z - .05) || (s.kind === 'cs' && s.hideT > 0); m.visible = !s.inside;
      // far soldiers animate less often, and so do those the camera is not looking at (through the scope that is
      // nearly all of them: every pose every frame was most of a frame's work on a slower phone)
      const ex = s.x - eye.x, ey = s.gy + 1 - eye.y, ez = s.y - eye.z, ed = Math.hypot(ex, ey, ez);
      const far = (ed > 160 && !scoped) || (ed > 5 && ex * cfx + ey * cfy + ez * cfz < ed * coneCos);
      // a rifleman shoulders his rifle to aim (the gunners and the officer keep the plain pose: hands out to what they hold)
      const armed = IN_HANDS[s.kind] && m.userData.gun; if (armed && m.rig.topOn && m.rig.top === 'aim') m.rig.top = 'shoulder';
      // (a rifleman's hands are set as he carries his rifle; the others': closed on a gun's grips or the handset, else open)
      if (!armed) { const hold = m.rig.topOn && m.rig.top === 'aim' ? null : EASY; hands(m, hold, s.sending ? HELD : hold); }
      if (!far || (frame + (s.x | 0)) % 3 === 0) {
        const step = far ? dt * 3 : dt, turn = clamp(angDiff(s.yaw, s.yawWas ?? s.yaw) / step, -6, 6); s.yawWas = s.yaw;   // (he leans into his turns)
        m.rig.update(step, { speed: s.av, aim: s.alert ? -.05 : 0, turn });
        if (!s.inside) { m.see(WD.v.cam, 1000); if (armed) carry(m, s.kind === 'cs' || s.alert || m.rig.topOn || s.sus > .5 ? 1 : 0, far ? dt * 3 : dt, m.lod < 2, s.alert || s.kind === 'cs' ? clamp(Math.atan2(eye.y - s.gy - 1.45, Math.hypot(eye.x - s.x, eye.z - s.y)), -.35, .5) : 0); }
      }
      // through the scope his feet meet the slope he stands on (foot IK), for the few men in view
      if (scoped && !s.deck && plantN > 0 && watched(s)) { plantN--; m.rig.plant(WD.ground, m); }
    }
    bodies.update(dt, men.filter(s => !s.ko && !s.fixed));
    noises.update(dt);
  }
  let wrenT = null, wrenLight = .5;
  let frame = 0, spotting = false;
  function nearestAlly(s) { if (!allies) return null; let best = null, bd = 140; for (const a of allies) { if (a.ko || a.done) continue; const d = Math.hypot(a.x - s.x, a.y - s.y); if (d < bd) { bd = d; best = a; } } return best; }
  function updateAllies(dt) {
    if (!allies) return;
    const legs = [null, [[BRIDGE.x, 10], [BRIDGE.x - 1, -6]], [[BRIDGE.x - 3, -30], [28, -56]], [[10, -82]]];
    for (const [i, a] of allies.entries()) {
      let speed = 0;
      if (!a.ko && !a.done) {
        const pinned = mgOn && a.y < 16;
        const route = legs[Math.min(allyGo, 3)];
        if (pinned) { a.crouch = true; }
        else if (route) {
          a.crouch = false; const tgt = route[Math.min(a.leg, route.length - 1)], tx = tgt[0] + i * 2 - 2, tz = tgt[1] + i * 2;
          if (Math.hypot(tx - a.x, tz - a.y) > .6) { const sp = allyGo === 3 ? 4.6 : 3.2; if (walk(a, tx, tz, sp, dt) !== 'stuck') speed = sp; } else if (a.leg < route.length - 1) a.leg++; else { a.leg = 0; if (allyGo === 3) a.done = true; a.crouch = true; if (allyGo < 3) a.atLeg = allyGo; }
        }
        if (allyGo !== a.lastGo) { a.lastGo = allyGo; a.leg = 0; }
      }
      a.m.see(WD.v.cam, 1000);
      if (a.ko) { lie(a, dt); continue; }
      a.gy = groundAt(a.x, a.y); a.m.position.set(a.x, a.gy, a.y); a.m.rotation.y = a.yaw;
      a.av = (a.av || 0) + clamp(speed - (a.av || 0), -dt * 9, dt * 12);
      if (a.av > .15) a.m.rig.blend(STRIDES, a.av); else a.m.rig.play(a.crouch ? 'kneel' : 'idle', { fade: .22 });
      const turn = clamp(angDiff(a.yaw, a.yawWas ?? a.yaw) / Math.max(dt, 1e-3), -6, 6); a.yawWas = a.yaw;
      a.m.rig.update(dt, { speed: a.av, turn }); carry(a.m, 1, dt, a.m.lod < 2);
    }
    if (allies.filter(a => a.ko).length >= 2) mission.fail('Hale\'s squad was lost on the bridge.');
  }

  // ---- input
  const BTN = {};
  function layout() {
    const r = Math.min(34, W * .11);
    BTN.fire = { x: W - r - 16, y: H - r - 22, r };
    BTN.scope = { x: W - r * .75 - 16 - r * .25, y: H - r * 2 - 22 - r * .9, r: r * .72 };
    BTN.left = { x: r + 16, y: H - r - 22, r: r * .86 };
    BTN.move = { x: W / 2 - 58, y: H - 60, w: 116, h: 24 };   // bottom middle, by the thumbs and off the view
  }
  const inBtn = (b, x, y) => b && (b.w ? x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h : Math.hypot(x - b.x, y - b.y) <= b.r * 1.15);
  function toggleScope() {
    if (state !== 'play' || move) return;
    scoped = !scoped; glass = false; haptic('tick'); tone(scoped ? 520 : 380, { len: .05, wave: 'triangle', vol: .04 });
  }
  function toggleGlass() { if (state !== 'play' || move) return; glass = !glass; scoped = false; haptic('tick'); tone(660, { len: .04, wave: 'triangle', vol: .03 }); }

  // ---- the round
  // ---- sound: the valley's own echo, beds of wind, river and rain, and a rifle built in layers.
  // Everything loud goes through the valley space, so a shot cracks, booms and then rolls round the hills.
  // The echo's impulse (seconds of shaped noise) is costly to make, so each kind is made once, and on
  // the start of a mission rather than in the first frame of play (a hitch on slower phones).
  let aud = null; const earF = new Vector3(), spaces = {};
  const echoFor = wet => spaces[wet] ||= space({ seconds: wet ? 2.4 : 3.6, decay: wet ? 3.4 : 2.3, wet: wet ? .2 : .28, bright: wet ? 2000 : 3400, pre: .09 });
  function audioUp() {
    if (aud && aud.mid === mid) return; audioDown();
    const wet = missions[mid]?.weather === 'rain';
    const sp = echoFor(wet);
    aud = {
      mid, sp, ears: new Ears({ ref: 10, max: 500, rolloff: .5, hrtf: false, space: sp, send: .8 }),
      wind: bed({ vol: .01, from: 480, q: .5, gusts: .9 }),
      leaves: bed({ vol: wet ? 0 : .004, from: 5200, filter: 'highpass', q: .4, gusts: .7 }),
      river: bed({ vol: 0, from: 650, filter: 'bandpass', q: .5 }),
      rain: bed({ vol: 0, from: 3000, filter: 'highpass', q: .3, gusts: .25 }),
      birdT: 1.5, k: 0,
    };
  }
  function audioDown() { if (!aud) return; for (const b of ['wind', 'leaves', 'river', 'rain']) aud[b].stop(); aud = null; }
  function audioTick(dt) {
    if (warming) return;
    audioUp(); const e = WD.v.cam.position;
    aud.ears.place(e, dirOf(look.yaw, look.pitch, earF));
    // beds follow the world every few frames: the gusts you read off the flags, the river under you, the rain
    if ((aud.k += dt) > .25) {
      aud.k = 0;
      const w = clamp(Math.abs(wind.x) / 6, 0, 1.4), high = clamp((e.y - WD.land.height(e.x, e.z)) / 12, 0, 1), rv = clamp(1 - Math.abs(e.z - RIVER(e.x)) / 110, 0, 1);
      aud.wind.set({ vol: .006 + .012 * w + .006 * high + .01 * rain.amount, from: 380 + 240 * w + 200 * high }, .6);
      aud.river.set({ vol: .016 * rv * rv, from: 520 + 300 * rv }, .8);
      aud.rain.set({ vol: .024 * rain.amount, from: 2600 + 1200 * rain.amount }, 1);
      aud.leaves.set({ vol: (.003 + .004 * w) * (1 - rain.amount) }, .8);
    }
    // birdsong on a calm morning: it stops when the shooting starts and comes back slowly
    if (missions[mid]?.weather !== 'rain' && heat < .5 && !squad.alerted && t - lastShotT > 12 && (aud.birdT -= dt) <= 0) {
      aud.birdT = rnd(1.5, 4.5);
      const a = rnd(0, TAU), r = rnd(15, 60), p = { x: e.x + Math.cos(a) * r, y: e.y + rnd(-4, 6), z: e.z + Math.sin(a) * r }, f0 = rnd(2600, 4200), n = 2 + ((Math.random() * 4) | 0);
      for (let i = 0; i < n; i++) aud.ears.tone(f0 * rnd(.9, 1.15), p, { len: rnd(.04, .09), wave: 'sine', vol: .02, slide: rnd(-900, 900), at: i * rnd(.08, .14) });
    }
  }
  const metal = (at, f, v = .03) => { noise(.03, { vol: v, from: f * 2.2, to: f, filter: 'bandpass', q: 5, at }); tone(f * 1.7, { len: .025, wave: 'square', vol: v * .25, at }); };
  // your rifle: a sharp crack, the body of the blast, a thump you feel, the valley rolling it back, then the bolt
  function rifleReport() {
    if (warming) return;
    const out = aud?.sp?.in, wet = rain.amount > .2 ? .6 : 1;
    noise(.05, { vol: .4, from: 7000, to: 2400, filter: 'bandpass', q: .7, out });
    noise(.45, { vol: .34, from: 2400, to: 110, out });
    tone(58, { len: .32, wave: 'sine', vol: .3, slide: -26 }); tone(110, { len: .12, wave: 'triangle', vol: .08, slide: -60 });
    // slaps back off the hills: the ridge across the valley first, then the far end, duller in the rain
    soon(.32, () => noise(.7, { vol: .07 * wet, from: 1100 * wet, to: 80, attack: .02, out }));
    soon(.9, () => noise(1, { vol: .045 * wet, from: 700 * wet, to: 60, attack: .05, out }));
    soon(1.7, () => noise(1.4, { vol: .025 * wet, from: 420, to: 40, attack: .1 }));
    // the bolt: up and back (case out), forward and down (next round in)
    // (each click is made a moment before it sounds, not all of them in the frame of the shot)
    if (gun.ammo > 0) { soon(.17, () => metal(.03, 1300, .04)); soon(.26, () => { metal(.03, 900, .035); noise(.03, { vol: .02, from: 5000, to: 3000, at: .1, filter: 'highpass' }); }); soon(.79, () => metal(.03, 1500, .04)); soon(.87, () => metal(.03, 1050, .045)); }
  }
  // a round passing close: a hard supersonic snap and a tearing hiss, before you hear the shot
  function snap() {
    noise(.035, { vol: .22, from: 8000, to: 3500, filter: 'bandpass', q: 1.2 }); noise(.16, { vol: .05, from: 6000, to: 1400, filter: 'highpass', attack: .01 });
  }
  // a shot from across the valley: its report arrives at the speed of sound, after the round
  function farReport(from, d, kind) {
    const late = d / 343, mg = kind === 'mg';
    setTimeout0(late, () => { if (!aud) return; aud.ears.noise(mg ? .14 : .32, from, { vol: mg ? .35 : .55, from: mg ? 1600 : 2000, to: 120 }); aud.ears.tone(70, from, { len: .2, wave: 'sine', vol: .25, slide: -25 }); });
  }
  // what the round hits: a ping off stone, a knock in timber, a thud in earth
  function impactSound(h, p, close) {
    if (warming) return;
    if (h.s) return;
    const stone = h.box && h.box.kind !== 'house', wood = h.box && !stone, k = close ? 1 : .45;
    if (stone) { noise(.06, { vol: .12 * k, from: 4500, to: 1800, filter: 'bandpass', q: 2 }); if (Math.random() < .5) tone(rnd(2200, 3200), { len: .35, wave: 'sine', vol: .03 * k, slide: -rnd(900, 1600), at: .02 }); }
    else if (wood) noise(.09, { vol: .12 * k, from: 1200, to: 300, filter: 'bandpass', q: 1.5 });
    else noise(.14, { vol: .14 * k, from: 600, to: 90 });
  }
  function thunder(far) {
    const out = aud?.sp?.in;
    noise(.25, { vol: .25 * (1 - far), from: 2400, to: 400, at: far * 1.5, out });
    noise(2.6, { vol: .3 * (1 - far * .6), from: 300, to: 35, at: far * 1.5 + .1, attack: .25, out });
  }
  function bellToll() {
    const out = aud?.sp?.in;
    tone(392, { len: 1.6, wave: 'sine', vol: .05, out }); tone(470, { len: 1.1, wave: 'sine', vol: .018, out }); tone(784, { len: .9, wave: 'sine', vol: .015, out }); tone(196, { len: 2, wave: 'sine', vol: .03, out });
  }
  function begin(id) {
    mid = id; const def = missions[id];
    for (const s of men || []) endMind(s);
    freeMen(); men = []; allies = null; shots = []; timers = []; bestShot = null;
    // Wren himself, seen when he moves between nests
    WD.wren ||= wrenFigure(); WD.wren.visible = false; WD.wren.rig.follow?.reset();
    echoFor(missions[id]?.weather === 'rain');   // made here (silent) rather than in the first frame of play
    tower?.g.removeFromParent(); for (const p of tower?.pieces || []) { p.removeFromParent(); p.geometry?.dispose(); }
    tower = null; drums = null; car = null; op = null; cs = null; boom.list.length = 0; if (WD.bags) WD.bags.visible = false;
    WD.solids = WD.solids.filter(b => !b.temp);
    for (const h of WD.helmets) { h.life = 0; h.m.visible = false; }
    for (const d of WD.dropped) d.visible = false;
    bodies.list.length = 0; for (const m of temps) m.removeFromParent(); temps.length = 0;
    squad = new Squad([], { cover: WD.cover, sees: (a, b) => WD.nav.sees(a.x - GX0, a.y - GZ0, b.x - GX0, b.y - GZ0), range: 110, grenades: 2, camp: 10, aggression: .5 });
    squad.on('call', callout); lastCall = -99;
    squadTarget = null; foeAim = null; allyGo = 0; mgOn = false;
    mood(id); mistT = 0; mistK = 1; lensDrops = []; WD.v.clearDecals();
    rain.set(def.weather === 'rain' ? 'storm' : 'clear', def.weather === 'rain' ? .75 : 0);
    def.setup();
    for (const [i, l] of WD.letters.entries()) { const p = WD.letterSpots[id][i]; l.position.set(p.x, p.y, p.z); l.rotation.set(p.tilt, p.ry, 0); l.visible = !camp.picked(id, i); }
    letterT = [0, 0, 0]; found = null;
    for (const f of WD.flocks) { f.up = false; f.rest = 0; f.b.length = 0; } WD.birds.count = 0;
    nestId = def.nests[0]; nest = NESTS[nestId];
    const e = nestEye(nest); look = { yaw: Math.atan2(-(nest.face.x - e.x), -(nest.face.z - e.z)), pitch: -.06 };
    mission = new Mission(def.script.bind(def));
    mission.nests = def.nests;
    noises = new Noises(); guard = null; metMarr = false;
    cut = new Cutscene(def.intro(), { bars: .14 }); state = 'intro';
    for (const s of men) { s.m.updateMatrixWorld(true); s.m.rig.update(0, { speed: 0 }); }
    train = { on: id === 'm1', x: -420, speed: 30, next: 26, final: false };
    if (WD.train) WD.train.visible = false;
    bell = { ring: 0, next: id === 'm2' ? 14 : 1e9, shotT: -1e9, told: false, tip: false };
    wind = { x: id === 'm1' ? 2.5 : -4, z: 0, base: id === 'm1' ? 2.5 : -4 };
    built = true;
  }
  // the mission's light: time of day, clouds, air, grade (the sky's reflections are redone next frame)
  function mood(id) {
    const md = MOODS[id], v = WD.v;
    Object.assign(sky, { time: md.time, tilt: md.tilt, day: md.day, physical: md.physical, clouds: md.clouds, gap: md.gap, cloudLight: md.cloudLight ? new Color(md.cloudLight) : null, cloudDark: md.cloudDark ? new Color(md.cloudDark) : null });
    v.air(md.air); v.grade = md.grade; v.glare = md.glare; v.shafts = md.shafts; v.exposure = md.exposure; v.bloom = md.bloom; v.envI = md.env;
    v.lut = md.lut; v.lutAmount = md.lutAmount; v.flare = md.flare; v.eye = null;   // the mission's film stock, lens flare and dirt; the eye adapts afresh
    GU.uWet.value = md.air.wet; WD.wins.material.emissiveIntensity = md.windows;
    winLit = md.windows > 0; if (!winLit) for (const l of v.lamps) l.visible = false;   // (no lights at all by day: none to pay for)
    // the sky's reflections are redone once, just after the next frame is drawn (heavy GPU work, so it
    // stays out of update(); until then the last ones carry on)
    // (only when the light changed: playing the same mission again keeps them, no stall as the round starts)
    sky.apply(); const key = sky.envKey(); if (key !== envBaked) envDirty = true; sky.envAt = key; sky.envT = 3;
  }
  let wind = { x: 0, z: 0, base: 0 };

  // ---- lost letters: hold the glasses (or the scope) on one to note where it is
  let letterT = [0, 0, 0], found = null;
  function spotLetters(dt) {
    const e = WD.v.cam.position, d = dirOf(look.yaw, look.pitch, tmpB), cone = Math.cos(fovNow() * Math.PI / 360 * .3);
    for (const [i, l] of WD.letters.entries()) {
      if (!l.visible) continue;
      const dx = l.position.x - e.x, dy = l.position.y - e.y, dz = l.position.z - e.z, L = Math.hypot(dx, dy, dz);
      const on = (scoped || glass) && L < 460 && (d.x * dx + d.y * dy + d.z * dz) / L > cone && !hitTest(e.x, e.y, e.z, e.x + dx * .97, e.y + dy * .97, e.z + dz * .97);
      letterT[i] = on ? letterT[i] + dt : Math.max(0, letterT[i] - dt * 2);
      if (letterT[i] > .8) {
        l.visible = false; camp.collect(mid, i); score += 150; api.score(score);
        found = { n: camp.collected(mid), t: 0 }; haptic('success');
        tone(660, { len: .12, wave: 'triangle', vol: .05 }); tone(990, { len: .2, wave: 'triangle', vol: .05, at: .1 });
      }
    }
    if (found && (found.t += dt) > 2.4) found = null;
  }
  // ---- rooks: up they go at a shot near them, wheel round, and settle again
  function flush(f, why) {
    if (f.up || f.rest > 0) return;
    f.up = true; f.t = 0; f.b = Array.from({ length: f.n }, (_, i) => ({ a: rnd(0, TAU), r: rnd(6, 18), h: rnd(0, 4), sp: rnd(.5, .8) * (i % 2 ? 1 : -1), ph: rnd(0, TAU) }));
    const e = WD.v.cam.position, near = Math.hypot(f.x - e.x, f.z - e.z);
    const loud = clamp(120 / near, .2, 1);
    soon(.05, () => noise(.7, { vol: .06 * loud, from: 1500, to: 500, filter: 'bandpass', q: .7 }));
    for (let k = 0; k < 3; k++) soon(.2 + k * .32, () => tone(rnd(380, 520), { len: .14, wave: 'sawtooth', vol: .016 * loud, slide: -160 }));
    // birds bursting out of the trees over a quiet valley: they look your way if it's by you
    if (why === 'shot' && !masked()) { heat = clamp(heat + .1, 0, 1.2); for (const o of men) if (!o.ko && !o.alert && Math.hypot(o.x - f.x, o.y - f.z) < 90) o.sus = Math.max(o.sus, .5); }
  }
  const birdM = new THREE.Matrix4(), birdQ = new THREE.Quaternion(), birdE = new THREE.Euler(0, 0, 0, 'YXZ'), birdP = new Vector3(), birdS = new Vector3();
  function updateBirds(dt) {
    let n = 0; const B = WD.birds;
    for (const f of WD.flocks) {
      if (!f.up) { f.rest = Math.max(0, f.rest - dt); continue; }
      f.t += dt; const k = f.t, rise = Math.min(1, k / 3), home = Math.max(0, (k - 14) / 4);
      if (home >= 1) { f.up = false; f.rest = 25; continue; }
      for (const b of f.b) {
        if (n >= B.instanceMatrix.count) break;
        const a = b.a + k * b.sp, r = b.r * rise * (1 - home) + 1, y = f.y + (8 + b.h) * rise * (1 - home) + Math.sin(k * 1.3 + b.ph) * 1.2;
        birdP.set(f.x + Math.cos(a) * r, y, f.z + Math.sin(a) * r);
        birdE.set(Math.sin(k * 2 + b.ph) * .15, -a - (b.sp > 0 ? 0 : Math.PI), Math.sin(k * 3 + b.ph) * .3); birdQ.setFromEuler(birdE);
        birdS.set(1, Math.cos(k * 14 + b.ph * 3), 1);    // flapping: the wings swing up and down
        B.setMatrixAt(n++, birdM.compose(birdP, birdQ, birdS));
      }
    }
    B.count = n; if (n) B.instanceMatrix.needsUpdate = true;
  }
  // ---- chimney smoke leaning with the wind (read it like the flags)
  function chimneySmoke() {
    const C = WD.chims; if (!C.length || frame % 5) return;
    const p = C[(frame / 5 | 0) % Math.min(C.length, 9)];
    WD.smoke.emit({ x: p[0], y: p[1], z: p[2], vx: rnd(-.15, .15), vy: .9, vz: rnd(-.15, .15), life: 6, size: .7, grow: 4, col: mid === 'm2' ? [.5, .5, .52] : [.8, .8, .8], a: .22, drag: .15, fadeIn: true, ease: 1.5 });
  }
  // ---- optional tilt aim: turn the phone to fine-tune the aim while looking through the scope or glasses
  let tiltAim = false;
  gs.device.onMotion(m => {
    if (!tiltAim || !(scoped || glass) || state !== 'play' || move || bulletCam) return;
    const land = W > H * 1.15, yawR = land ? m.rb : m.rg, pitchR = land ? -m.rg : m.rb, dt = Math.min(.05, m.dt || .016), k = Math.PI / 180 * (scoped ? .6 : .85);
    if (Math.abs(yawR) > .7) look.yaw += yawR * dt * k;
    if (Math.abs(pitchR) > .7) look.pitch += pitchR * dt * k;
    clampLook();
  });
  let briefRows = [], briefGo = null, failMsg = '', pathBudget = 0, thinkBudget = 0, winLit = false;
  // true only inside reset(), while the functions of a shot and of the soldiers' minds are called once so the browser
  // compiles them during loading (each returns at once): otherwise that is paid in the frame of the first shot.
  // (What a quiet frame runs is rehearsed for real instead: see rehearse.)
  let warming = false;
  let theme = null;
  let beatT = 0, beat = 0, tiltBtn = null, ptrZoom = false, envDirty = false, envBaked = null;
  const later = [];
  function soon(sec, fn) { later.push({ in: sec, fn }); }
  function runLater(dt) { let ran = false; for (let i = 0; i < later.length; i++) { const j = later[i]; j.in -= dt; if (j.in <= 0 && !ran) { ran = true; later.splice(i--, 1); j.fn(); } } }
  // the valley's own tick: sky and weather, the meadow, the wheel and the sails, the wind in the flags
  function valley(dtReal, dt) {
    sky.update(dtReal); rain.update(dtReal); storm = Math.max(0, storm - dtReal);
    sky.flash = rain.flashLeft > .25 || (rain.flashLeft > .08 && rain.flashLeft < .16) ? rain.flashI : 0;
    // the meadow sways, and follows the camera wherever it comes down to the ground (planted a few tufts a
    // frame after a cut). While a round flies with its camera, it is planted ahead where that camera will stop
    { const q = bulletCam && !(bulletCam.hold > 0) && bulletCam.t > .2 && bulletCam.pre; if (q) grassEye.position.set(q.x, q.y, q.z); WD.land.update(dt, q ? grassEye : WD.v.cam); }
    WD.wheel.rotation.x += dt * .5; WD.sails.rotation.z += dt * .35;
    // wind gusts
    wind.x = wind.base + Math.sin(t * .23) * 1.2 + Math.sin(t * .71 + 2) * .5;
    AIR.x = wind.x; AIR.z = wind.z; AIR.update(dt, WD.v.cam.position);
    for (const f of [WD.flagA, WD.flagB]) {
      const fw = AIR.at(f.x, f.z ?? 0).x, p = f.cloth.geometry.attributes.position, b = f.base, s = Math.sign(fw) || 1, k = clamp(Math.abs(fw) / 6, .1, 1);
      f.cloth.position.x = f.x + s * 1; f.cloth.scale.x = s;
      for (let i = 0; i < p.count; i++) { const x = b[i * 3] + 1; p.setZ(i, Math.sin(x * 3 - t * 8 * k) * .14 * x * k); p.setY(i, b[i * 3 + 1] - (1 - k) * x * .35); }
      p.needsUpdate = true;
    }
  }
  // A dress rehearsal, while the game loads. Code is slow the first time it runs (the browser works each line out as
  // it first meets it), so the first frame of a mission used to take three to five usual frames. The valley's tick
  // and the soldiers' are run here for real with next to no time passing: nobody moves, nothing sounds.
  function rehearse() {
    const dt = 1e-4, e = nestEye(nest);
    valley(dt, dt); qte.update(dt);
    for (frame = 1; frame <= 3; frame++) { updateMen(dt); updateAllies(dt); trainUpdate(dt); }   // (three: a soldier far off is posed every third frame)
    // what a frame of play asks about them: who the nest can reach, a way round on foot, the commander's sums
    for (const s of men) shootable(e, s);
    { const s = men.find(s => s.route?.length > 1 && !s.fixed && s.kind !== 'radio'); if (s) { const r = s.route[1]; pathBudget = 1; walk(s, r[0], r[1], 1.3, dt); } }
    masked(); favourOf(nestId); rangeOf(); nextNest(); clampLook();
    // a round's flight from the nest worked out ahead (as the bullet camera asks at each shot), a man's feet set on his slope (as the scope asks)
    { const d = dirOf(look.yaw, look.pitch + BORE, tmpB); predict({ x: e.x, y: e.y - .05, z: e.z, vx: d.x * V0, vy: d.y * V0, vz: d.z * V0, life: 2.2, dist: 0 }); }
    { const s = men.find(s => !s.deck && !s.fixed); if (s) { s.m.rig.plant(WD.ground, s.m); floorFeet(s.m, 1, feetNow(s.m, s.m.userData.pins ||= {}), 1); } }   // (and kept on his floor, as a fall asks)
    // the first frame of the trip to the next nest (his way round the houses or down the line, his stride, his hands on the bar or a rung), Wren out of sight
    { const to = nextNest(); if (to) { const m = tripPlan(to); if (m.kind === 'zip') zip = zipLine(); wrenShow(tripAt(m, 0).fig, m.kind, dt).visible = false; WD.trolley.visible = false; zip = null; } }
    gun.update(dt); me.update(dt); updateMortar(dt); updateShots(dt); updateTracers(dt); spotLetters(dt); updateBirds(dt);
    WD.dust.update(dt); WD.sparks.update(dt); WD.smoke.update(dt); WD.trail.update(dt); WD.marks.update(dt); boom.update(dt);
    frame = 0;
  }
  const ZOOM_ARC = [-.62, .5];
  // A new camera (the next cutscene shot, the bullet cam, a run or the zip line starting or ending, a
  // nest) starts the picture's history again, so the upscaler, the edge smoothing and frame generation
  // don't smear the last view into it. On the move, in the bullet cam and in cutscenes the world blurs
  // with the camera (and on WebGPU, things with their own move); looking down the scope it stays crisp.
  const camWas = { key: '', step: null, p: new Vector3(), d: new Vector3() }, camD = new Vector3();
  function camCut(v) {
    const cam = v.cam, key = state === 'brief' ? 'b' : (state === 'intro' || state === 'outro') ? 'c' : move ? 'm' + move.kind : bulletCam ? (bulletCam.hold > 0 ? 'h' : 'k') : 'n' + nestId;
    cam.getWorldDirection(camD);
    const step = key === 'c' ? cut?.camStep : null, flying = key === 'k';
    const jump = !flying && (cam.position.distanceTo(camWas.p) > (key === 'c' || key[0] === 'm' ? 4 : 1.5) || camD.dot(camWas.d) < .9);
    if (key !== camWas.key || (step !== camWas.step && jump) || (key[0] === 'm' && jump)) v.cut();
    camWas.key = key; camWas.step = step; camWas.p.copy(cam.position); camWas.d.copy(camD);
    const blur = key === 'c' || key === 'k' || key[0] === 'm';
    v.motionBlur = blur && gs.prefs.motion > 0 ? (MBLUR.amount = .5 * gs.prefs.motion, MBLUR) : null;
    // the dusk storm is dark enough that faces vanish up close: cutscenes and the bullet cam open the
    // picture up a little, the way a film crew would light a night scene (eased, so it never pops)
    const md = MOODS[mid], lift = mid === 'm2' && (key === 'c' || key === 'h' || key === 'k' || key[0] === 'm') ? 1.4 : 1;
    if (md) { expLift += (lift - expLift) * .08; v.exposure = md.exposure * expLift; }
  }
  let expLift = 1;
  const MBLUR = { amount: .5, max: .035, sharp: 3 };
  const fmtT = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  return {
    reset() {
      audioDown(); theme?.stop();
      world(); layout();
      // (one sky and one weather for the world, which every card of this game shares: a second card used to add its own dome)
      if (!WD.sky) { WD.sky = new Sky(WD.v, { time: MOODS.m1.time, tilt: MOODS.m1.tilt, stars: 300, sun: WD.sl, day: DAY_CLEAR, clouds: MOODS.m1.clouds, gap: MOODS.m1.gap, env: true, fog: false }); WD.rain = new Weather(WD.v, { kind: 'clear', amount: 0, wind: AIR, area: 40 }); if (WD.rain.rainMesh) { WD.rain.rainMesh.material.opacity = .3; WD.rain.rainMesh.material.color.set('#8c9cb0'); } }
      sky = WD.sky; rain = WD.rain; rain.onFlash = far => { storm = 1.6; thunder(far); };
      fx.clear(); me.reset(); gun.ammo = gun.mag; gun.reloadLeft = 0; gun.reserve = Infinity; gun.shotsAtCs = 0;
      state = 'brief'; briefT = 0; t = 0; score = 0; heat = 0; located = false; alertedN = 0; frame = 0; markAt = -1; markV = null;
      scoped = false; glass = false; zoom = 7; breath = { v: 1, held: false }; gasp = 0; storm = 0;
      bulletCam = null; WD.bullet.visible = false; move = null; zip = null; mortar = null; mortarCool = 0; qte = new Prompts({ radius: 56, swipe: 40 }); qteKind = null;
      ptr = new Map(); pinch = null; lastShotT = -99; firstShotHit = null; opTime = null; coverMsg = null; lineFx = null; endT = 0; outroDone = false; quietT = 0;
      keys = {}; hits = []; tagT = 0; spotting = false;
      sel = (camp.next() || camp.missions[0]).id;
      favour = api.load({})?.nests || {}; tiltAim = !!api.load({})?.tilt;
      WD.regions.want(sel);   // (only the picked mission's own things: made now, under the loading screen)
      begin(sel);
      rehearse();
      state = 'brief';
      fx.clear();
      // what can't be rehearsed (it sounds, or it changes the mission) is at least compiled now, not in play (see
      // warming), and the two bullet hole pictures are painted now, not at the first shot
      warming = true; try { for (const f of [audioTick, think, fire, hitTest, impact, holeAt, impactSound, rifleReport, meetMarr, knockOut, nearMiss]) f(); } finally { warming = false; }
      for (const k of ['stone', 'dirt']) WD.v.decal(card, P_.set(0, 0, 0), N_.set(0, 0, 1), { size: .3, paint: (c, s) => paintHole(c, s, k), key: 'ls-hole-' + k })?.dispose();
    },
    resize(w, h) { W = w; H = h; layout(); },
    update(dtReal) {
      frame++;
      fx.update(dtReal); breathT(dtReal); runLater(dtReal);
      if (state === 'brief') {
        briefT += dtReal; sky.update(dtReal); rain.update(dtReal);
        // the field file has its own quiet tune (written by gs.sound.compose from the game's name); play is silent but for the valley
        theme ||= music({ ...compose({ mood: 'sad', seed: 'long-shadow' }), vol: .32 }); if (!theme.playing) theme.start();
        // the grass at the mission's first nest is planted while the file is read (a few tufts a frame), not when the camera cuts to it
        if (nest) { const e = nestEye(nest); grassEye.position.set(e.x, e.y, e.z); WD.land.update(dtReal, grassEye); }
        WD.regions.update(dtReal); if (!built && WD.regions.has(sel)) begin(sel);   // (another mission picked: its own things are made a little each frame)
        return;
      }
      theme?.stop();
      // slow motion: bullet cam, quick-time moments
      let ts = 1;
      if (bulletCam) ts = bulletCam.hold > 0 ? (bulletCam.hold > .85 ? .05 : .05 + (1 - bulletCam.hold / .85) * .95) : bulletCam.scale;   // (nearly stopped at the hit, then it runs on: he is seen to drop)
      qte.update(dtReal); if (qte.active) ts *= qte.timeScale;
      const dt = Math.min(dtReal, 1 / 20) * ts;
      t += dt;
      // timers
      for (const tm of timers) if (t >= tm.at && !tm.done) { tm.done = true; tm.fn(); }
      timers = timers.filter(tm => !tm.done);
      valley(dtReal, dt);
      if (state === 'intro' || state === 'outro') {
        cut.update(dt); audioTick(dt);
        if (state === 'intro' && cut.done) { state = 'play'; meetMarr(); marrOnAir(); const s = cut.shot; if (s?.look) { const dx = s.look.x - s.x, dy = s.look.y - s.y, dz = s.look.z - s.z; look.yaw = Math.atan2(-dx, -dz); look.pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -.5, .35); } }
        updateMen(dt); updateAllies(dt); WD.dust.update(dt); WD.sparks.update(dt); WD.smoke.update(dt); WD.trail.update(dt);
        if (state === 'outro') { mission.update(dt); trainUpdate(dt); if (mid === 'm1' && train.final) rideTrain(dt); }
        if (outroDone && state === 'outro') finish(true);
        return;
      }
      if (state === 'fail' || state === 'won') { endT -= dtReal; updateMen(dt); WD.dust.update(dt); WD.sparks.update(dt); WD.smoke.update(dt); if (endT <= 0 && state) { const s0 = state; state = 'done'; if (s0) api.over(); } return; }
      if (state !== 'play') return;

      // climbing the belfry (mission 2 start)
      if (qteKind === 'train' && !qte.active) { qteKind = null; }

      mission.update(dt);
      gun.update(dt); me.update(dt); for (const h of hits) h.life -= dtReal; hits = hits.filter(h => h.life > 0);
      { const was = boltT; boltT = Math.max(0, boltT - dt); if (was > .9 && boltT <= .9) ejectCase(); }
      if (gun.reloaded) { metal(.0, 1800, .03); metal(.12, 1100, .035); noise(.05, { vol: .03, from: 1500, to: 600, at: .2 }); }
      audioTick(dt);
      // keys
      const kx = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0), ky = (keys.ArrowUp || keys.w ? 1 : 0) - (keys.ArrowDown || keys.s ? 1 : 0);
      if (kx || ky) { const f = fovNow() / 62; look.yaw -= kx * dt * 1.2 * f; look.pitch += ky * dt * .8 * f; }
      clampLook();
      // masking
      trainUpdate(dt);
      bell.next -= dt; if (bell.next <= 0) { bell.next = 26; bell.ring = 6; } if (bell.ring > 0) { bell.ring -= dt; if (Math.floor(bell.ring * 1.2) !== Math.floor((bell.ring + dt) * 1.2)) bellToll(); WD.bell.rotation.z = Math.sin(t * 5) * .5 * Math.min(1, bell.ring); } else WD.bell.rotation.z *= .92;
      // the morning mist burns off as the sun climbs (mission 1)
      if (mid === 'm1') { mistT += dt; const k = 1 - .6 * clamp(mistT / 160, 0, 1); if (Math.abs(k - mistK) > .004) { mistK = k; WD.v.air({ mist: MOODS.m1.air.mist * k, patchy: MOODS.m1.air.patchy * (.6 + .4 * k) }); } }
      // heat: they work out where you are
      quietT = t - lastShotT;
      if (heat > 0 && !squad.alerted) heat = Math.max(0, heat - dt * .015);
      if (heat >= 1 && !located && nest) {
        located = true; squadTarget = { x: nest.x, y: nest.z };
        for (const s of men) if (!s.ko && !s.fixed && Math.hypot(s.x - nest.x, s.y - nest.z) < 330) wakeUp(s);
        say('They\'ve spotted your position!', OAKE, 2.4); haptic('warning');
      }
      // the commander decides about once a second: his brain on one frame, his look ahead a quarter of a second on
      // (the two in one frame made it the longest of a quiet minute)
      if (frame % 30 === 0) command(0); else if (frame % 30 === 15) command(1);
      if (spotting && nest && (scoped || glass) && !masked()) heat = Math.min(1.2, heat + dt * .03 * (1 + favourOf(nestId)));
      if (squad.alerted) {
        const tgt = squadTarget || (nest ? { x: nest.x + (1 - heat) * 40, y: nest.z + (1 - heat) * 30 } : { x: 0, y: 0 });
        squad.t += dt; foeAim = tgt;     // each rifleman's own mind picks his part (in updateMen)
      }
      // suspicious soldiers that are close to a found body or a near miss wake up
      for (const s of men) if (!s.ko && !s.alert && !s.fixed && s.sus >= 1) wakeUp(s);
      updateMortar(dt);
      updateMen(dt); updateAllies(dt); updateShots(dt); updateTracers(dt); spotLetters(dt); updateBirds(dt); chimneySmoke();
      if (car && car.on && !car.stopped) {
        car.x -= dt * 6; car.z = roadZ(car.x); if (car.x < 30) { car.stopped = true; mission.fail('The armoured car reached the bridge.'); }
        if (car.gunner?.ko) { car.stopped = true; car.smoke = true; }
        car.g.position.set(car.x, WD.land.height(car.x, car.z), car.z); car.g.rotation.y = Math.PI / 2;
        noise(.05, { vol: .015, from: 200, to: 120 });
        if ((car.fireT -= dt) <= 0) { car.fireT = 1.4; const a = alive(allies || [])[0]; if (a) enemyShot({ x: car.x, y: car.z, gy: WD.land.height(car.x, car.z) + 1 }, a, 'mg'); }
        for (const b of drums || []) if (!b.gone && Math.hypot(car.x - b.x, car.z - b.z) < 9) car.near = true;
      }
      if (car?.smoke) WD.smoke.emit({ x: car.x, y: WD.land.height(car.x, car.z) + 2.4, z: car.z, vx: rnd(-.3, .3), vy: 2, vz: rnd(-.3, .3), life: 3, size: 1.4, grow: 2, col: [.15, .14, .13], a: .7 });
      boom.update(dt);
      for (const p of tower?.pieces || []) { const u = p.userData.v; if (!u) continue; u.y -= 15 * dt; p.position.x += u.x * dt; p.position.y += u.y * dt; p.position.z += u.z * dt; p.rotation.x += u.r * dt; const g = WD.land.height(p.position.x, p.position.z); if (p.position.y < g) { p.position.y = g; u.x *= .5; u.z *= .5; u.y = Math.abs(u.y) * .2; u.r *= .5; if (Math.abs(u.y) < .5) p.userData.v = null; } }
      for (const h of WD.helmets) if (h.life > 0) { h.life -= dt; h.vy -= 12 * dt; h.m.position.x += h.vx * dt; h.m.position.y += h.vy * dt; h.m.position.z += h.vz * dt; h.m.rotation.x += h.spin * dt; const g = WD.land.height(h.m.position.x, h.m.position.z); if (h.m.position.y < g + .07) { h.m.position.y = g + .07; h.vy = Math.abs(h.vy) * .35; h.vx *= .5; h.vz *= .5; h.spin *= .5; } if (h.life <= 0) h.m.visible = false; }
      WD.dust.update(dt); WD.sparks.update(dt); WD.smoke.update(dt); WD.trail.update(dt);
      // tagging with the glasses
      if (glass) {
        const eye = WD.v.cam.position; let best = null, bd = .05;
        for (const s of men) { if (s.ko || s.tagged || s.inside) continue; const a = Math.abs(angDiff(look.yaw, Math.atan2(-(s.x - eye.x), -(s.y - eye.z)))), p = Math.abs(look.pitch - Math.atan2(s.gy + 1 - eye.y, Math.hypot(s.x - eye.x, s.y - eye.z))); const d = Math.hypot(a, p); if (d < bd) { bd = d; best = s; } }
        if (best && best === tagT?.s) { tagT.t += dt; if (tagT.t > .45) { best.tagged = true; tagT = null; haptic('light'); tone(1200, { len: .05, wave: 'sine', vol: .04 }); score += 10; api.score(score); } }
        else tagT = best ? { s: best, t: 0 } : null;
      } else tagT = null;
      // bullet cam
      if (bulletCam) {
        bulletCam.t += dtReal;
        if (bulletCam.hold > 0) { bulletCam.hold -= dtReal; if (bulletCam.hold <= 0) { bulletCam = null; WD.bullet.visible = false; } }
        else if (bulletCam.b.dead || bulletCam.t > 4) { bulletCam = null; WD.bullet.visible = false; }
      }
      // moving between nests (his shots keep the sun's veil down: a camera that turns towards the sun must still show him)
      { const md = MOODS[mid] || MOODS.m1, g = md.glare * (move ? .45 : 1); if (WD.v.glare !== g) { WD.v.glare = g; WD.v.shafts = md.shafts * (move ? .5 : 1); } }
      if (move) {
        move.t += dt;
        if (move.kind === 'zip') zipTick(move, dt);
        else if (move.t >= move.dur) endMove();
        if (move) {
          const f = tripAt(move, dt).fig, w = wrenShow(f, move.kind, dt);
          // footsteps on the run, rungs on the ladder
          if (f.pose === 'ladder') { const up = move.up ||= {}; for (const k in move.T) { const on = move.G[k].lift > 0; if (up[k] && !on) { if (k[0] === 'f') noise(.05, { vol: .03, from: 500, to: 160 }); tone(k[0] === 'f' ? 170 : 240, { len: .04, wave: 'triangle', vol: k[0] === 'f' ? .022 : .012 }); } up[k] = on; } }
          else if (!f.pose && f.speed > 0) {
            // (a step as a foot really lands; by his stride's own count where his feet aren't being placed) and what that foot kicks up
            const ft = w.rig.stride?.feet, i = ft ? ft[0].landed ? 0 : ft[1].landed ? 1 : -1 : -1, st = Math.floor((w.rig.blendPhase ?? 0) * 2), hit = i >= 0 || st !== move.step;
            move.step = st; move.stepT = (move.stepT || 0) - dt;
            if (hit && move.stepT <= 0) {
              move.stepT = .12; noise(.07, { vol: .012 + f.speed * .003, from: 700, to: 200 });
              if (i >= 0) w.bones[i ? 'footR' : 'footL'].getWorldPosition(tmpA); else tmpA.set(f.x, f.y, f.z);
              if (f.speed > 2.4) for (let n = 0; n < 3; n++) WD.dust.emit({ x: tmpA.x + rnd(-.12, .12), y: f.y + .06, z: tmpA.z + rnd(-.12, .12), vx: rnd(-.4, .4), vy: rnd(.25, .8), vz: rnd(-.4, .4), life: rnd(.5, .9), size: .15, grow: 2.4, col: rain.amount > .2 ? [.3, .27, .21] : [.56, .49, .37], a: .3, drag: 2, fadeIn: true });
            }
          }
        }
      }
      arrivedT = Math.max(0, arrivedT - dt);
      if (nest && !move) favour[nestId] = (favour[nestId] || 0) + dt;
      // losing
      if (me.dead || me.hp <= 0) mission.fail('Wren is down.');
      if (mission.failed && state === 'play') finish(false);
      WD.v.hurt = clamp(1 - me.frac, 0, 1) * .9;
      // the operator's and the marksman's scope glints, nest markers
      if (cs && !cs.ko && !bulletCam && frame % 2 === 0) {   // (not in the bullet cam: in slow motion a glint hangs there, a huge blob up close)
        const aiming = cs.aimT > 0, fl = aiming ? 1.6 + Math.sin(t * 40) * .6 : 0, g = .5 + cs.see * 2.5 + fl * 2;
        if (!(cs.hideT > 0)) { const e = WD.v.cam.position, dx = e.x - cs.x, dz = e.z - cs.y, l = Math.hypot(dx, dz) || 1; WD.sparks.emit({ x: cs.x + dx / l * .4, y: cs.gy + 1.15, z: cs.y + dz / l * .4, life: .1, size: .3 + cs.see * .6 + fl * .5, col: [g * 2, g * 2, g * 1.6] }); } }
      if (spotting) for (const s of men) if (s.spotter && !s.ko && frame % 3 === 0) WD.sparks.emit({ x: s.x, y: s.gy + 1.6, z: s.y + .3, life: .1, size: .25, col: [2, 2, 1.6] });
      if (!move && nextNest() && (located || mission.time > 20) && frame % 4 === 0) { const n = NESTS[nextNest()], e = nestEye(n); WD.marks.emit({ x: e.x, y: e.y + 2.5, z: e.z, life: .2, size: 1.6, col: [3, 2.6, 1.2] }); }
      WD.marks.update(dtReal);
      breathT(0);
    },
    draw(c) {
      const v = WD.v, cam = v.cam;
      // the camera: cutscene, zip line, bullet cam or you
      let gunVis = false;
      if (state === 'brief') {
        const a = briefT * .05; cam.position.set(Math.sin(a) * 160 + 20, 70, Math.cos(a) * 160 - 40); cam.lookAt(0, 6, -60);
      } else if ((state === 'intro' || state === 'outro') && cut?.shot) {
        const s = cut.shot; cam.position.set(s.x, s.y, s.z); if (s.look) cam.lookAt(s.look.x, s.look.y, s.look.z);
      } else if (move) {
        const c_ = (move.now || tripAt(move)).cam; cam.position.set(...c_.p); cam.lookAt(...c_.l);
      } else if (bulletCam && bulletCam.hold <= 0 && !bulletCam.b.dead) {
        const b = bulletCam.b, l = Math.hypot(b.vx, b.vy, b.vz), dx = b.vx / l, dy = b.vy / l, dz = b.vz / l;
        // just behind and above the round: it sits low in a tall screen, where it is headed above it
        cam.position.set(b.x - dx * .34 + dz * .04, b.y - dy * .34 + .2, b.z - dz * .34 - dx * .04); cam.lookAt(b.x + dx * .6, b.y + dy * .6, b.z + dz * .6);
        WD.bullet.position.set(b.x, b.y, b.z); WD.bullet.rotation.set(0, 0, 0); WD.bullet.lookAt(b.x + dx, b.y + dy, b.z + dz); WD.bullet.rotateX(Math.PI / 2); WD.bullet.rotateY(bulletCam.t * 9);
      } else if (bulletCam && bulletCam.hold > 0 && bulletCam.cam) {
        // the hold: beside him and low, drifting in, following him down as he drops
        const q = bulletCam.cam, k = 1 - bulletCam.hold / HOLD, near = 1 - .12 * k;
        cam.position.set(q.tx + (q.x - q.tx) * near, q.y, q.tz + (q.z - q.tz) * near); cam.lookAt(q.tx, q.ty - .7 * k * k, q.tz);
        WD.bullet.visible = false;
      } else if (nest) {
        const e = nestEye(nest);
        const y = e.y;
        const [sy, sp] = sway(), kick = boltT > .8 ? (boltT - .8) * .25 : 0;
        cam.position.set(e.x, y, e.z);
        const d = dirOf(look.yaw + sy, look.pitch + sp + kick, tmpV);
        cam.lookAt(e.x + d.x, y + d.y, e.z + d.z);
        gunVis = !scoped && !glass && state === 'play';
      }
      WD.gun.visible = gunVis; if (gunVis) { WD.gun.position.y = -.3 - (boltT > 0 ? Math.sin(boltT * 3) * .03 : 0); WD.bolt.position.z = .05 + (boltT > .2 && boltT < .9 ? .06 : 0); }
      const f = (state === 'play' && !move && !bulletCam) ? fovNow() : move ? (move.now || tripAt(move)).cam.fov ?? 62 : bulletCam && bulletCam.hold > 0 ? 46 : 62;
      if (Math.abs(cam.fov - f) > .01) { cam.fov = f; cam.updateProjectionMatrix(); }
      // trees keep their leaves further out through the scope
      const lk = clamp(62 / cam.fov, 1, 12);
      if (Math.abs(lk - WD.lodK) > .05) { WD.lodK = lk; for (const k of ['oak', 'poplar', 'fir']) { const m = WD.props.mesh(k), D = k === 'fir' ? FIR_LOD : TREE_LOD; m.updateLOD(1, D[0] * lk); m.updateLOD(2, D[1] * lk); m.updateShadowLOD(1, 70 * lk); } }
      // the sun's shadows cover what you can see (sharp round the target through the scope)
      WD.sl.fit(v, { far: scoped ? 700 : 320, near: scoped || glass ? 0 : 40, ground: WD.ground, around: scoped || glass ? 1.3 : 0, tall: 22 });
      // through the scope, what's in front of and behind the target goes soft (high and ultra)
      focusOn(1 / 60);
      // the game's own shaders: time for the leaves, the sun for light through them, ripples
      GU.uTime.value = v.t; v.sunDir(GU.uSun.value);
      for (const r of WD.ripples) r.offset.set(v.t * .011, v.t * .004);
      if (WD.train?.visible) { WD.train.position.set(train.x, RAILH, RAILZ); WD.rail.roll(train.x); }
      // lit windows shine on their walls, the wet road and whoever walks past: the engine's pool of real lights
      // (a few on WebGL, many on WebGPU) sits at the windows nearest the place the camera looks at
      if (winLit && move && WD.wren.visible) {
        // a move at dusk is lit as a film would light it: a warm lamp beside the camera and a cool one from his far
        // side, so he has shape against the dark stone (two of the pool's lights, for as long as the shot lasts)
        const w = WD.wren.position, S = WD.stage ||= [{ x: 0, y: 0, z: 0, col: '#ffc48a', i: STAGE[0] }, { x: 0, y: 0, z: 0, col: '#9db4dc', i: STAGE[1] }], L = WD.stageSpots ||= [...S, ...WD.winSpots];
        // (close to him and low in strength: a lamp's light falls off with the square of the distance, so a wall he
        // runs along stays dark stone instead of burning out; and each lamp takes the side of him that has room for it)
        tmpA.set(cam.position.x - w.x, 0, cam.position.z - w.z).normalize();
        const put = (q, f, sd, r, up) => { for (const k of [sd, -sd]) { q.x = w.x + (tmpA.x * f - tmpA.z * k) * r; q.z = w.z + (tmpA.z * f + tmpA.x * k) * r; if (roomAt(q)) break; } q.y = w.y + up; };
        put(S[0], .78, .62, 1.5, 1.7); put(S[1], -.3, -.95, 1.3, 1.6);
        v.placeLamps(L, w.x, w.y + 1.5, w.z);
      } else if (winLit && frame % 5 === 0) {
        cam.getWorldDirection(tmpA); const d = clamp(tmpA.y < -.01 ? (cam.position.y - VILLAGE_Y) / -tmpA.y : 160, 6, 420) - 5;   // (a little short of it: the walls facing you first)
        v.placeLamps(WD.winSpots, cam.position.x + tmpA.x * d, VILLAGE_Y + 2, cam.position.z + tmpA.z * d);
      }
      camCut(v);
      fx.begin(c); v.render(c, W, H); fx.end(c, W, H);
      if (envDirty && sky.makesEnv) { envDirty = false; try { sky.makeEnv(); envBaked = sky.envAt; } catch (e) { /* keeps the last reflections */ } }
      hud(c);
    },
    down(x, y, id) {
      if (state === 'brief') return briefTap(x, y);
      if (state === 'intro' && cut) { cut.skip(); return; }
      if (state !== 'play') return;
      if (move) { if (move.kind === 'zip') { zip.t = 1; zip.riding = false; zip.done = true; move.t = Math.max(move.t, 1); move.land = 1.5; } else move.t = Math.max(move.t, move.dur - .35); return; }
      if (qte.active) { qte.down(x, y); ptr.set(id, { x, y, sx: x, sy: y, role: 'qte' }); return; }
      if (bulletCam) { bulletCam = null; WD.bullet.visible = false; return; }
      if (inBtn(BTN.fire, x, y)) { fire(); ptr.set(id, { role: 'fire', x, y }); return; }
      if (inBtn(BTN.scope, x, y)) { toggleScope(); ptr.set(id, { role: 'btn', x, y }); return; }
      if (inBtn(BTN.left, x, y)) { if (scoped) { breath.held = true; ptr.set(id, { role: 'breath', x, y }); } else { toggleGlass(); ptr.set(id, { role: 'btn', x, y }); } return; }
      if (!move && nextNest() && inBtn(BTN.move, x, y)) { startMove(nextNest()); ptr.set(id, { role: 'btn', x, y }); return; }
      if (scoped && onZoomArc(x, y)) { ptrZoom = true; zoomFrom(x, y); ptr.set(id, { role: 'zoom', x, y }); return; }
      const aims = [...ptr.values()].filter(p => p.role === 'aim');
      if (aims.length === 1) { const a = aims[0]; a.role = 'pinch'; pinch = { d: Math.hypot(x - a.x, y - a.y), zoom, a, b: null }; const p = { x, y, sx: x, sy: y, role: 'pinch' }; pinch.b = p; ptr.set(id, p); return; }
      ptr.set(id, { x, y, sx: x, sy: y, role: 'aim', t: 0 });
    },
    move(x, y, pressed, id) {
      if (!pressed) return; const p = ptr.get(id); if (!p) return;
      if (p.role === 'qte') { qte.move(x, y); return; }
      if (p.role === 'zoom') { zoomFrom(x, y); p.x = x; p.y = y; return; }
      if (p.role === 'aim') {
        const dx = x - p.x, dy = y - p.y, fine = scoped || glass ? clamp(.4 + Math.hypot(dx, dy) / 10, .4, 1) : 1;
        const k = (fovNow() * Math.PI / 180) / H * 1.15 * fine;
        look.yaw -= dx * k; look.pitch -= dy * k; clampLook();   // drag right to look right, up to look up
      } else if (p.role === 'pinch' && pinch) {
        p.x = x; p.y = y; const d = Math.hypot(pinch.a.x - pinch.b.x, pinch.a.y - pinch.b.y);
        if (!scoped && d > pinch.d * 1.25 && state === 'play') { scoped = true; glass = false; pinch.d = d; pinch.zoom = zoom; }
        else if (scoped) zoom = clamp(pinch.zoom * d / pinch.d, 3, 12);
        return;
      }
      p.x = x; p.y = y;
    },
    up(x, y, id) {
      const p = ptr.get(id); ptr.delete(id);
      if (p?.role === 'qte') qte.up(x, y);
      if (p?.role === 'breath') breath.held = false;
      if (p?.role === 'zoom') ptrZoom = false;
      if (p?.role === 'pinch') { pinch = null; for (const q of ptr.values()) if (q.role === 'pinch') q.role = 'aim'; }
    },
    key(k, isDown) {
      keys[k] = isDown; if (!isDown) { if (k === 'Shift') breath.held = false; return; }
      if (state === 'brief' && (k === 'Enter' || k === ' ')) return go();
      if (state === 'intro' && cut) return cut.skip();
      if (qte.active) { if (k === ' ' || k === 'Enter') qte.down(); return; }
      if (k === ' ' || k === 'f') fire();
      if (k === 'z' || k === 'e') toggleScope();
      if (k === 'b' || k === 'q') toggleGlass();
      if (k === 'Shift') breath.held = true;
      if (k === 'm' && nextNest()) startMove(nextNest());
      if (k === '=' || k === '+') zoom = clamp(zoom + 1, 3, 12);
      if (k === '-') zoom = clamp(zoom - 1, 3, 12);
    },
    pause() { breath.held = false; ptr.clear(); ptrZoom = false; },
  };

  // ---------------------------------------------------------------- helpers in make's scope
  function clampLook() { look.pitch = clamp(look.pitch, -.55, .4); }
  function breathT(dt) {
    if (!breath) return;
    beat = Math.max(0, beat - dt * 4);
    if (scoped && ((breath.held && breath.v > 0) || gasp > 0) && state === 'play') {
      if ((beatT -= dt) <= 0) {
        beatT = gasp > 0 ? .42 : .95 - (1 - breath.v) * .4; beat = 1;
        tone(52, { len: .1, wave: 'sine', vol: .14 }); tone(46, { len: .12, wave: 'sine', vol: .1, at: .17 }); hapticPattern('heartbeat', { strength: gasp > 0 ? .8 : .45 });
      }
    } else beatT = .2;
    if (breath.held && scoped && breath.v > 0) { breath.v -= dt / 4.5; if (breath.v <= 0) { breath.v = 0; gasp = 2; tone(180, { len: .3, wave: 'triangle', vol: .04 }); } }
    else breath.v = Math.min(1, breath.v + dt * (gasp > 0 ? .1 : .35));
    gasp = Math.max(0, gasp - dt);
  }
  // depth of field through the scope: focused where the round would land, eased so it doesn't jump
  function focusOn(dt) {
    const v = WD.v;
    if (!scoped || state !== 'play' || move || bulletCam) { v.focus = null; focusOn.d = 0; return; }
    const mk = impactMark(), D = mk ? mk[2] : 450, f = focusOn.d = focusOn.d ? focusOn.d + (D - focusOn.d) * Math.min(1, dt * 5) : D;
    v.focus = { at: f, range: Math.max(3, f * .05), depth: .5, blur: 3 + zoom * .35 + gasp * 2 };
  }
  // how far off the squad is on average (only the men already looking for you)
  function rangeOf() {
    if (!nest) return 300; let sum = 0, k = 0;
    for (const s of men) if (!s.ko && s.alert && !s.fixed) { sum += Math.hypot(s.x - nest.x, s.y - nest.z); k++; }
    return k ? sum / k : 300;
  }
  function favourOf(id) { const list = mission?.nests || []; let all = 0; for (const n of list) all += favour[n] || 0; return all > 30 ? (favour[id] || 0) / all : 0; }
  // the end of mission 1: Wren made the jump, and rides out crouched on the first wagon's roof
  function rideTrain(dt) {
    const w = WD.wren; w.visible = true; w.rotation.order = 'YXZ'; w.rotation.x = 0; w.rotation.z = Math.sin(t * 7) * .02;
    w.position.set(train.x + TRAIN.W1 + 1.4, RAILH + TRAIN.ROOF, RAILZ + .25); w.rotation.y = Math.PI / 2;
    w.rig.play('ride', { fade: .2 }); w.rig.update(dt, { speed: 0 }); w.see(WD.v.cam, 1000); hands(w, EASY);
  }
  function trainUpdate(dt) {
    if (!train.on) { train.next -= dt; if (train.next <= 0 && mid === 'm1') { train.on = true; train.x = -420; train.speed = 30; tone(520, { len: .9, wave: 'triangle', vol: .05 }); tone(620, { len: .9, wave: 'triangle', vol: .04, at: .1 }); } WD.train.visible = false; return; }
    WD.train.visible = true;
    if (train.final && qteKind !== 'train' && train.x > -150) train.speed = Math.max(4, train.speed - dt * 2);
    train.x += train.speed * dt;
    // she chuffs: four beats of exhaust to each turn of the driving wheels (a steady plume at speed, single puffs at a crawl),
    // and at a crawl steam blows from the cylinder cocks down by the front wheels
    { const beat = Math.floor(train.x / (TAU * TRAIN.RD) * 4), slow = train.speed < 9;
      if (beat !== train.beat && (slow || frame % 2 === 0)) { train.beat = beat; const pts = WD.rail.cars[0].points; pts.smoke.getWorldPosition(tmpA);   // (the chimney's top)
        for (let i = 0; i < (slow ? 3 : 1); i++) WD.smoke.emit({ x: tmpA.x + rnd(-.1, .1), y: tmpA.y + .2, z: tmpA.z + rnd(-.1, .1), vx: -train.speed * .3 + rnd(-.3, .3), vy: slow ? rnd(4, 6) : 2.8, vz: rnd(-.3, .3), life: 3.5, size: slow ? 1 : 1.4, grow: 3, col: [.84, .82, .78], a: .55, drag: slow ? .9 : .4 });
        if (slow && beat % 2 === 0) { pts.steam.getWorldPosition(tmpB); for (const sd of [-1, 1]) WD.smoke.emit({ x: tmpB.x, y: tmpB.y - .3, z: RAILZ + sd * (Math.abs(tmpB.z - RAILZ) + .2), vx: rnd(.2, 1), vy: rnd(.1, .5), vz: sd * rnd(1.5, 3), life: 1.3, size: .5, grow: 2.6, col: [.95, .95, .95], a: .4, drag: 1.6, fadeIn: true }); } } }
    if (masked() && frame % 20 === 0) noise(.4, { vol: .05 * clamp(1 - Math.abs(train.x) / 220, .1, 1), from: 400, to: 200 });
    if (train.x > 420) { train.on = false; train.next = 34; }
  }
  function finish(won) {
    if (won) {
      const st = missions[mid].stars();
      camp.finish(mid, { stars: st });
      score += 500 + st.filter(Boolean).length * 250; api.score(score);
      const d = api.load({}) || {}; d.nests = favour; api.save(d);
      boss.result(true); rifleman.result(true); for (const s of men) endMind(s);
      { const l = marr.result(true); if (l) say(l, MARR, 2.4, true); }
      api.win(); state = 'won'; endT = 2.4; sounds.win(); haptic('success');
    } else {
      boss.result(false); rifleman.result(false); for (const s of men) endMind(s);
      { const l = marr.result(false); if (l) say(l, MARR, 2.2, true); }
      const d = api.load({}) || {}; d.nests = favour; api.save(d);
      state = 'fail'; endT = 2.2; sounds.lose(); haptic('error'); failMsg = mission.failed || 'Mission failed';
    }
  }
  // The Grey Order's commander: what his brain makes of the fight (part 0), then his look a few seconds ahead (part 1)
  function command(part) {
    const leftN = alive(men).length, fav = favourOf(nestId);
    const see = [heat, fav, clamp(quietT / 20, 0, 1), leftN / Math.max(1, men.length), me.frac, masked() ? 1 : -1, squad.alerted ? 1 : 0, clamp(mission.time / 120, 0, 1)];
    if (!part) { boss.act(see, .5); return; }             // the brain keeps its own reaction time and what it learns from how it went
    plan.pick(see.concat([clamp(rangeOf() / 300, 0, 1.5), mortarCool > 0 ? 0 : 1]));
    const what = plan.action;
    squad.aggression = what === 'push' ? .75 : what === 'flank' ? .6 : .3;
    if (what === 'flank') squad.lastFlank = -99;
    if (what === 'mortar' && located) callMortars();
    spotting = what === 'watch';
  }
  // the colonel on the radio as the mission starts (an intercept, red like the Grey Order's calls)
  // (in two parts: what he remembers of you is looked up and written down on the Begin tap, his lines are timed from the first frame of play)
  function meetMarr() {
    if (warming) return;
    if (metMarr) return; metMarr = true;
    const hello = marr.met(); guard = marr.counter(boss.skill);
    marrSays = [];
    if (hello) marrSays.push([3.2, hello]);
    // listening for your habit: always said out loud first, so you know to change it
    if (guard && !/listen|waits/i.test(hello || '')) { const l = marr.line('habit'); if (l) marrSays.push([7.5, l]); }
  }
  function marrOnAir() { for (const [at, l] of marrSays) soon(at, () => say(l, MARR, 3.2, true)); marrSays = []; }
  // The first of each kind of work is the slow one, so what can be is done here, on the tap, and not in a frame of the
  // mission: the valley's sound beds, the colonel's memory, the ears set in place, and the four wave shapes the sound
  // card works out the first time each is asked for (one note of each, too quiet to hear).
  function go() {
    if (!built) { if (!WD.regions.has(sel)) return; begin(sel); }   // (the mission stands ready behind the file: it was set up, and rehearsed, when the file was opened; one picked since is made while the file is read)
    built = false; state = 'intro'; audioUp(); haptic('medium'); sounds.click?.();
    meetMarr(); quietT = t - lastShotT; command(0); command(1); audioTick(1e-4);
    for (const wave of /** @type {OscillatorType[]} */ (['sine', 'triangle', 'square', 'sawtooth'])) tone(440, { len: .02, wave, vol: 0 });
  }
  function briefTap(x, y) {
    if (briefT < .3) return;
    for (const r of briefRows) if (y >= r.y && y <= r.y + r.h && x >= r.x && x <= r.x + r.w) { if (r.id && r.id !== sel && camp.open(r.id)) { sel = r.id; built = false; WD.regions.want(sel); if (WD.regions.has(sel)) begin(sel); state = 'brief'; haptic('tick'); } return; }
    if (tiltBtn && inBtn(tiltBtn, x, y)) { tiltAim = !tiltAim; const d = api.load({}) || {}; d.tilt = tiltAim; api.save(d); haptic('tick'); return; }
    if (inBtn(briefGo, x, y)) go();
  }

  // ---------------------------------------------------------------- the HUD (drawn for this game only)
  function hud(c) {
    const ink = '#2b2a26', paper = '#ece2c8', brass = '#c8a24a', red = '#b8412e';
    if (state === 'brief') return dossier(c, ink, paper, brass, red);
    if (cut && (state === 'intro' || state === 'outro')) { cut.drawBars(c, W, H, '#0b0b0a'); radioLine(c, cut.line, brass); if (state === 'intro') { c.fillStyle = '#ffffff88'; c.font = '600 10px Rubik, sans-serif'; c.textAlign = 'right'; c.fillText('TAP TO SKIP', W - 12, H - 10); } return; }
    if (move) {
      const bar = H * .07; c.fillStyle = '#0b0b0a'; c.fillRect(0, 0, W, bar); c.fillRect(0, H - bar, W, bar);
      c.fillStyle = brass; c.font = '700 9px "Courier New", monospace'; c.textAlign = 'left'; c.fillText((move.kind === 'zip' ? 'ON THE LINE ▸ ' : move.kind === 'climb' ? 'UP THE BELFRY ▸ ' : 'MOVING ▸ ') + NESTS[move.to].name.toUpperCase(), 12, H - bar / 2 + 3);
      c.fillStyle = '#ffffff88'; c.font = '600 10px Rubik, sans-serif'; c.textAlign = 'right'; c.fillText('TAP TO SKIP', W - 12, H - bar / 2 + 3);
      radioTop(c, lineFx, brass, bar + 6, false);
      const fd = move.kind === 'zip' ? move.fade : Math.max(clamp(1 - move.t / .3, 0, 1), clamp((move.t - move.dur + .35) / .35, 0, 1));
      if (fd > 0) { c.fillStyle = `rgba(11,11,10,${fd})`; c.fillRect(0, 0, W, H); }
      return;
    }
    if (arrivedT > 0) { c.save(); c.globalAlpha = arrivedT * 2; c.fillStyle = '#0b0b0a'; c.fillRect(0, 0, W, H); c.restore(); }
    if (bulletCam) { c.fillStyle = '#0006'; c.fillRect(0, 0, W, H * .06); c.fillRect(0, H * .94, W, H * .06); const b = bulletCam.b; const d = Math.hypot(b.x - bulletCam.from.x, b.z - bulletCam.from.z); c.font = '700 13px "Courier New", monospace'; c.fillStyle = brass; c.textAlign = 'center'; c.fillText(Math.round(d) + ' m', W / 2, H * .94 - 8); koPops(c); return; }
    const sc = scoped, gl = glass;
    // tags above soldiers, KO pops
    tags(c, brass, red);
    tells(c, brass, red);
    koPops(c);
    if (sc) scopeView(c, brass, red); else if (gl) glassView(c, brass);
    else crosshair(c);
    // Rook is about to fire: his glint flares; dropping the scope or glasses now makes him miss
    if (cs && !cs.ko && cs.aimT > 0) {
      const k = .6 + .4 * Math.sin(t * 30); c.save(); c.textAlign = 'center'; c.font = '800 13px Rubik, sans-serif';
      c.fillStyle = `rgba(184,65,46,${(sc || gl ? .9 : .5) * k})`; roundRect(c, W / 2 - 92, H * .3 - 15, 184, 24, 12); c.fill();
      c.fillStyle = '#fff'; c.fillText(sc || gl ? 'GLINT! DROP THE SCOPE' : 'KEEP YOUR HEAD DOWN', W / 2, H * .3 + 2); c.restore();
    }
    // hit direction arrows
    for (const h of hits) { const a = h.angle - Math.PI / 2; c.save(); c.translate(W / 2 + Math.cos(a) * 70, H / 2 + Math.sin(a) * 70); c.rotate(a + Math.PI / 2); c.globalAlpha = clamp(h.life, 0, 1); c.fillStyle = red; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 4); c.lineTo(-9, 4); c.fill(); c.restore(); }
    const slipB = objectiveSlip(c, ink, paper, red, sc || gl);
    windGauge(c, brass);
    heatBar(c, ink, paper, red);
    buttons(c, brass, red);
    // radio lines and hints sit at the top, under the orders, clear of the view and the scope
    radioTop(c, lineFx || (coverMsg && op && !op.ko && op.sending && !masked() && mid === 'm1' ? { text: coverMsg, hint: true } : null), brass, Math.max(slipB, 58) + 5, sc || gl);
    // a lost letter: the ring fills while you hold the view on it
    { const lt = Math.max(...letterT); if (lt > .05 && (sc || gl)) { c.strokeStyle = brass; c.lineWidth = 2; c.beginPath(); c.arc(W / 2, H / 2, 15, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(lt / .8, 0, 1)); c.stroke(); } }
    if (found) stamp(c, '✉ LETTER FOUND · ' + found.n + '/3', W / 2, Math.max(slipB, 58) + 52, brass);
    if (qte.active) qteDraw(c, brass);
    if (state === 'fail' || state === 'won') stamp(c, state === 'won' ? 'MISSION COMPLETE' : failMsg, W / 2, H * .45, state === 'won' ? brass : red, true);
  }
  function stamp(c, text, x, y, col, big) {
    c.save(); c.translate(x, y); c.rotate(-.06); c.font = `800 ${big ? 18 : 14}px Rubik, sans-serif`; c.textAlign = 'center'; const w = Math.min(W - 30, c.measureText(text).width + 24);
    c.fillStyle = '#0b0b0acc'; c.fillRect(-w / 2, -18, w, 30); c.strokeStyle = col; c.lineWidth = 2; c.strokeRect(-w / 2 + 3, -15, w - 6, 24); c.fillStyle = col; c.fillText(text, 0, 2, w - 14); c.restore();
  }
  // a radio line in play: one slim strip across the top, two lines at most (the speaker's name leads)
  function radioTop(c, l, brass, y, tight) {
    if (lineFx) { lineFx.life -= 1 / 60; if (lineFx.life <= 0) lineFx = null; }
    if (!l || !l.text) return;
    const w = Math.min(W - 20, 360), x = W / 2 - w / 2, accent = l.enemy ? '#d26450' : brass;
    c.save(); c.font = '500 11px Rubik, sans-serif';
    const who = l.who ? (l.who.split('·')[0].replace(/^CAPT\. |^SGT\. /, '').trim() + ': ') : '';
    c.font = '700 9px "Courier New", monospace'; const ww = who ? c.measureText(who).width + 4 : 0; c.font = '500 11px Rubik, sans-serif';
    let lines = wrap(c, l.text, w - 18 - ww);
    const most = tight ? 1 : 2;
    if (lines.length > most) { lines = lines.slice(0, most); let last = lines[most - 1]; while (last.length > 3 && c.measureText(last + '…').width > w - 18 - ww) last = last.slice(0, -1); lines[most - 1] = last + '…'; }
    const hh = 13 * lines.length + 7, fade = clamp(l.life ?? 1, 0, .3) / .3;
    c.globalAlpha = l.hint ? .85 : fade;
    c.fillStyle = l.hint ? '#12110e99' : '#12110ecc'; roundRect(c, x, y, w, hh, 5); c.fill();
    c.fillStyle = accent; c.fillRect(x, y, 3, hh);
    if (who) { c.font = '700 9px "Courier New", monospace'; c.fillStyle = accent; c.textAlign = 'left'; c.fillText(who, x + 9, y + 13); }
    c.font = l.hint ? 'italic 500 11px Rubik, sans-serif' : '500 11px Rubik, sans-serif'; c.fillStyle = '#f2ead6'; c.textAlign = 'left';
    lines.forEach((s_, i) => c.fillText(s_, x + 9 + ww, y + 13 + i * 13));
    c.restore();
  }
  function radioLine(c, l, brass) {
    if (lineFx) { lineFx.life -= 1 / 60; if (lineFx.life <= 0) lineFx = null; }
    if (!l || !l.text) return;
    const y = H - (cut?.playing ? H * .07 + 8 : 120), w = Math.min(W - 24, 340);
    c.save(); c.font = '500 12px Rubik, sans-serif';
    const lines = wrap(c, l.text, w - 22);
    const hh = 14 * lines.length + (l.who ? 16 : 8) + 6;
    c.fillStyle = '#12110ecc'; roundRect(c, W / 2 - w / 2, y - hh, w, hh, 6); c.fill();
    const accent = l.enemy ? '#d26450' : brass;
    c.fillStyle = accent; c.fillRect(W / 2 - w / 2, y - hh, 3, hh);
    let yy = y - hh + 14;
    if (l.who) { c.font = '700 9px "Courier New", monospace'; c.fillStyle = accent; c.textAlign = 'left'; c.fillText('◉ ' + l.who, W / 2 - w / 2 + 12, yy); yy += 14; c.font = '500 12px Rubik, sans-serif'; }
    c.fillStyle = '#f2ead6'; c.textAlign = 'left'; for (const s of lines) { c.fillText(s, W / 2 - w / 2 + 12, yy); yy += 14; }
    c.restore();
  }
  function wrap(c, text, w) { const out = []; let line = ''; for (const word of text.split(' ')) { const tryL = line ? line + ' ' + word : word; if (c.measureText(tryL).width > w && line) { out.push(line); line = word; } else line = tryL; } if (line) out.push(line); return out; }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function objectiveSlip(c, ink, paper, red, tight) {
    const o = mission.objectives.filter(q => !q.done).at(-1); if (!o) return 10;
    c.save(); c.textAlign = 'left'; c.font = '600 11px Rubik, sans-serif'; const w = Math.min(W * .58, 220);
    let lines = wrap(c, o.text, w - 18);
    if (tight && lines.length > 1) { let l0 = lines[0]; while (l0.length > 3 && c.measureText(l0 + '…').width > w - 18) l0 = l0.slice(0, -1); lines = [l0 + '…']; }
    const h = 18 + lines.length * 13, sa = api.scoreArea(), top = sa && 10 + w > sa.x - 4 ? Math.max(10, sa.bottom + 4) : 10;   // under the score badge when it would sit on it
    c.translate(10, top); c.rotate(-.015);
    c.fillStyle = paper; c.shadowColor = '#0006'; c.shadowBlur = 6; c.fillRect(0, 0, w, h); c.shadowBlur = 0;
    c.fillStyle = red; c.fillRect(0, 0, 3, h);
    c.fillStyle = '#8a7f66'; c.font = '700 8px "Courier New", monospace'; c.fillText('ORDERS · ' + fmtT(mission.time), 9, 11);
    c.fillStyle = ink; c.font = '600 11px Rubik, sans-serif'; lines.forEach((s, i) => c.fillText(s, 9, 24 + i * 13));
    if (op?.sending && !op.ko) { const k = clamp(op.send / 60, 0, 1); c.fillStyle = '#0002'; c.fillRect(9, h - 5, w - 18, 3); c.fillStyle = red; c.fillRect(9, h - 5, (w - 18) * k, 3); }
    c.restore();
    const bottom = top + h;
    // a marker towards the objective
    const at = o.at; if (!at || scoped) return bottom;
    const ax = at.m ? at.x : at.x, ay = at.m ? at.gy + 2.2 : at.y, az = at.m ? at.y : at.z;
    if (at.ko) return bottom;
    const [sx, sy, sz] = WD.v.toScreen(ax, ay, az);
    if (sz < 1 && sx > 0 && sx < W && sy > 0 && sy < H) { c.strokeStyle = red; c.lineWidth = 2; c.beginPath(); c.moveTo(sx, sy - 12); c.lineTo(sx + 6, sy - 4); c.lineTo(sx, sy + 4); c.lineTo(sx - 6, sy - 4); c.closePath(); c.stroke(); }
    else { const e = WD.v.cam.position, a = angDiff(Math.atan2(-(ax - e.x), -(az - e.z)), look.yaw), side = a > 0 ? -1 : 1; c.fillStyle = red; c.save(); c.translate(side > 0 ? W - 14 : 14, H * .42); c.scale(side, 1); c.beginPath(); c.moveTo(6, 0); c.lineTo(-4, -8); c.lineTo(-4, 8); c.fill(); c.restore(); }
    return bottom;
  }
  function windGauge(c, brass) {
    const x = W - 58, y = 12, w = 48, h = 46;
    c.save(); c.fillStyle = '#12110ebb'; roundRect(c, x, y, w, h, 6); c.fill();
    // wind relative to where you look: the arrow points the way the bullet will drift
    const rel = Math.atan2(wind.z, wind.x) + look.yaw, cross = Math.cos(rel) * Math.hypot(wind.x, wind.z);
    c.translate(x + w / 2, y + 18);
    const n = Math.min(3, Math.round(Math.abs(cross) / 1.5));
    c.fillStyle = brass; c.font = '700 8px "Courier New", monospace'; c.textAlign = 'center';
    for (let i = 0; i < 3; i++) { c.globalAlpha = i < n ? 1 : .2; const ox = (i - 1) * 9 * Math.sign(cross || 1); c.beginPath(); c.moveTo(ox + 4 * Math.sign(cross || 1), 0); c.lineTo(ox - 3 * Math.sign(cross || 1), -6); c.lineTo(ox - 3 * Math.sign(cross || 1), 6); c.closePath(); c.fill(); }
    c.globalAlpha = 1; c.fillText('WIND ' + Math.abs(cross).toFixed(1), 0, 20);
    c.restore();
  }
  function heatBar(c, ink, paper, red) {
    const w = Math.min(150, W - 4 * BTN.left.r - 50), x = W / 2 - w / 2, y = H - 24;
    c.save();
    c.fillStyle = '#12110eaa'; roundRect(c, x - 4, y - 3, w + 8, 16, 8); c.fill();
    const k = clamp(heat, 0, 1);
    const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#7c8a45'); g.addColorStop(.6, '#d0a040'); g.addColorStop(1, red);
    c.fillStyle = g; roundRect(c, x, y, Math.max(6, w * k), 10, 5); c.fill();
    c.fillStyle = '#f2ead6'; c.font = '700 8px "Courier New", monospace'; c.textAlign = 'center';
    c.fillText(located ? 'THEY KNOW WHERE YOU ARE' : masked() ? (train.on ? '♪ TRAIN COVERS SHOTS' : bell.ring > 0 ? '♪ BELL COVERS SHOTS' : '♪ THUNDER COVERS SHOTS') : heat > .5 ? 'THEY ARE LISTENING' : 'UNHEARD', W / 2, y + 8);
    if (masked()) { c.strokeStyle = '#9fd070'; c.lineWidth = 1.5; roundRect(c, x - 4, y - 3, w + 8, 16, 8); c.stroke(); }
    c.restore();
  }
  function crosshair(c) {
    c.strokeStyle = '#ffffffaa'; c.lineWidth = 1.5; c.beginPath(); c.arc(W / 2, H / 2, 3, 0, TAU); c.stroke();
  }
  // mirage: on a warm, dry morning the air over the fields shimmers in the scope, and the shimmer runs
  // the way the wind blows and as fast (the old way to read the wind at range: watch the boil)
  function mirage(c, cx, cy, R) {
    const dt = clamp(t - mirT, 0, .1); mirT = t;
    const dry = 1 - clamp((rain ? rain.amount : 0) * 4, 0, 1), sun = mid === 'm1' ? 1 : .25, a = .06 * dry * sun * clamp(zoom / 8, .4, 1.2);
    if (a < .01) return;
    const rel = Math.atan2(wind.z, wind.x) + look.yaw, cross = Math.cos(rel) * Math.hypot(wind.x, wind.z);
    mirX += cross * dt * 9;
    c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
    c.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) {
      const y0 = cy - R * .2 + i * R * .09, ph = i * 1.7;
      c.strokeStyle = `rgba(255,250,235,${a * (1 - Math.abs(i - 4) / 6)})`; c.beginPath();
      for (let x = -R; x <= R; x += 6) { const y = y0 + Math.sin((x - mirX) * .08 + ph + Math.sin(t * 1.3 + i) * .6) * 2.2; x === -R ? c.moveTo(cx + x, y) : c.lineTo(cx + x, y); }
      c.stroke();
    }
    c.restore();
  }
  // rain on the scope's front glass: beads land, swell, and the big ones run down and off
  function lens(c, cx, cy, R) {
    const wet = rain ? rain.amount : 0, dt = clamp(t - lensT, 0, .1); lensT = t;
    lensAcc += wet > .15 ? dt * wet * 8 : 0;
    for (; lensAcc >= 1; lensAcc--) if (lensDrops.length < 40) { const a = rnd(0, TAU), r = Math.sqrt(Math.random()) * R * .95; lensDrops.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, r: rnd(2, 5.5), life: rnd(4, 9), vy: 0 }); }
    if (!lensDrops.length) return;
    c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
    for (const d of lensDrops) {
      d.life -= dt; if (d.r > 4.6) { d.vy = Math.min(d.vy + dt * 30, 45); d.y += d.vy * dt; d.r -= dt * .4; }
      const x = cx + d.x, y = cy + d.y, a = clamp(d.life, 0, 1) * .8, g = c.createRadialGradient(x - d.r * .3, y - d.r * .35, d.r * .1, x, y, d.r);
      g.addColorStop(0, `rgba(255,255,250,${.85 * a})`); g.addColorStop(.25, `rgba(220,228,236,${.3 * a})`); g.addColorStop(.7, `rgba(120,130,140,${.15 * a})`); g.addColorStop(.88, `rgba(6,8,12,${.7 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, d.r, 0, TAU); c.fill();
      c.fillStyle = `rgba(230,236,240,${.35 * a})`; c.beginPath(); c.arc(x + d.r * .25, y + d.r * .45, d.r * .28, 0, TAU); c.fill();   // light gathered at the bottom, as through a lens
      if (d.vy > 4) { c.strokeStyle = `rgba(190,200,210,${.18 * a})`; c.lineWidth = d.r * .7; c.beginPath(); c.moveTo(x, y - d.r); c.lineTo(x, y - d.r - Math.min(30, d.vy * .8)); c.stroke(); }
    }
    c.restore();
    lensDrops = lensDrops.filter(d => d.life > 0 && d.y < R);
  }
  function scopeView(c, brass, red) {
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * .44, fovR = fovNow() * Math.PI / 180, px = H / fovR;   // units per radian
    c.save();
    c.fillStyle = '#050505'; c.beginPath(); c.rect(0, 0, W, H); c.arc(cx, cy, R, 0, TAU, true); c.fill('evenodd');
    const g = c.createRadialGradient(cx, cy, R * (.7 - beat * .08 * gs.prefs.motion), cx, cy, R); g.addColorStop(0, '#0000'); g.addColorStop(1, '#000d'); c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
    mirage(c, cx, cy, R);
    lens(c, cx, cy, R);
    c.strokeStyle = '#8a7a50'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
    // the Wren reticle: fine cross with an open centre, drop chevrons below, wind dots to the sides
    c.strokeStyle = '#0d0d0c'; c.fillStyle = '#0d0d0c'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx - 6, cy); c.moveTo(cx + 6, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy - 6); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx - R * .55, cy); c.moveTo(cx + R * .55, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy + R); c.lineTo(cx, cy + R * .62); c.stroke();
    c.lineWidth = 1.2; c.font = '700 8px "Courier New", monospace'; c.textAlign = 'left';
    for (const d of [200, 300, 400]) { const yy = cy + holdAt(d) * px; if (yy > cy + R * .6) break; c.beginPath(); c.moveTo(cx - 6, yy - 3); c.lineTo(cx, yy); c.lineTo(cx + 6, yy - 3); c.stroke(); c.fillText(String(d / 100), cx + 8, yy + 3); }
    c.beginPath(); c.moveTo(cx, cy + 6); c.lineTo(cx, cy + R * .62); c.stroke();
    for (let i = 1; i <= 4; i++) for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * i * .0015 * px, cy, 1.4, 0, TAU); c.fill(); }
    // where the round will land: a small red circle, always on while scoped (drop, wind and the sway
    // now, along the real path to whatever it hits first). Put it on him and squeeze. It fills in
    // when it's on a man.
    const mk = impactMark();
    if (mk) {
      c.strokeStyle = '#0d0d0c'; c.lineWidth = 3; c.beginPath(); c.arc(mk[0], mk[1], 4, 0, TAU); c.stroke();
      c.strokeStyle = '#ff3b22'; c.lineWidth = 1.6; c.beginPath(); c.arc(mk[0], mk[1], 4, 0, TAU); c.stroke();
      if (mk[3]) { c.fillStyle = '#ff3b22'; c.beginPath(); c.arc(mk[0], mk[1], 1.6, 0, TAU); c.fill(); }
      c.fillStyle = '#f2ead6'; c.textAlign = 'center'; c.font = '700 9px "Courier New", monospace'; c.fillText(Math.round(mk[2]) + ' m', cx, cy + R * .78);
    }
    // a tagged man in view: who he is (the range is under the reticle)
    const tg = nearTagged();
    if (tg && tg.s.kind !== 'rifle') {
      c.fillStyle = '#f2ead6'; c.textAlign = 'center'; c.font = '700 9px "Courier New", monospace';
      c.fillText({ radio: 'OPERATOR', officer: 'OFFICER', cs: 'MARKSMAN', mg: 'MACHINE GUN' }[tg.s.kind] || '', cx, cy - R * .8);
    }
    // zoom (a slider along the right of the ring) and breath on the ring
    c.fillStyle = brass; c.font = '700 10px "Courier New", monospace'; c.textAlign = 'center'; c.fillText(zoom.toFixed(0) + '×', cx, cy + R + 14 > H - 8 ? cy + R - 10 : cy + R + 14);
    { const zr = R - 9, [a0, a1] = ZOOM_ARC; c.strokeStyle = '#f2ead633'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.arc(cx, cy, zr, a0, a1); c.stroke();
      for (let z = 3; z <= 12; z += 3) { const a = zoomAngle(z); c.fillStyle = '#f2ead688'; c.beginPath(); c.arc(cx + Math.cos(a) * zr, cy + Math.sin(a) * zr, 1.6, 0, TAU); c.fill(); }
      const a = zoomAngle(zoom); c.fillStyle = brass; c.beginPath(); c.arc(cx + Math.cos(a) * zr, cy + Math.sin(a) * zr, ptrZoom ? 7 : 5, 0, TAU); c.fill(); c.lineCap = 'butt'; }
    c.strokeStyle = gasp > 0 ? red : '#bfe0ff'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R + 6, Math.PI * .75, Math.PI * .75 + Math.PI * .5 * breath.v); c.stroke();
    // rounds as brass cartridges along the lower ring
    for (let i = 0; i < gun.mag; i++) { const a = Math.PI * .35 - i * .09, x = cx + Math.cos(a) * (R - 14), y = cy + Math.sin(a) * (R - 14); c.fillStyle = i < gun.ammo ? brass : '#ffffff22'; c.beginPath(); c.ellipse(x, y, 2.4, 5, a, 0, TAU); c.fill(); }
    if (gun.reloading) { c.fillStyle = '#f2ead6'; c.font = '700 9px "Courier New", monospace'; c.fillText('RELOADING', cx, cy + R * .4); }
    else if (boltT > 0) { c.fillStyle = '#f2ead699'; c.font = '700 8px "Courier New", monospace'; c.fillText('BOLT', cx, cy + R * .4); }
    c.restore();
  }
  // the zoom slider's arc on the scope ring: 12x at the top end, 3x at the bottom
  function zoomAngle(z) { return ZOOM_ARC[1] - (z - 3) / 9 * (ZOOM_ARC[1] - ZOOM_ARC[0]); }
  function scopeRing() { return { cx: W / 2, cy: H / 2, R: Math.min(W, H) * .44 }; }
  function onZoomArc(x, y) { const { cx, cy, R } = scopeRing(), a = Math.atan2(y - cy, x - cx), r = Math.hypot(x - cx, y - cy); return r > R - 30 && r < R + 16 && a > ZOOM_ARC[0] - .12 && a < ZOOM_ARC[1] + .12; }
  function zoomFrom(x, y) { const { cx, cy } = scopeRing(), a = clamp(Math.atan2(y - cy, x - cx), ZOOM_ARC[0], ZOOM_ARC[1]); zoom = clamp(3 + (ZOOM_ARC[1] - a) / (ZOOM_ARC[1] - ZOOM_ARC[0]) * 9, 3, 12); }
  function nearTagged() {
    const e = WD.v.cam.position; let best = null, ba = .08;
    for (const s of men) { if (!s.tagged || s.ko) continue; const a = Math.abs(angDiff(look.yaw, Math.atan2(-(s.x - e.x), -(s.y - e.z)))); if (a < ba) { ba = a; best = { s, d: Math.hypot(s.x - e.x, s.y - e.z) }; } }
    return best;
  }
  function glassView(c, brass) {
    const r = Math.min(W * .3, H * .3), cy = H / 2, ox = r * .78;
    c.save(); c.fillStyle = '#060606';
    c.save(); c.beginPath(); c.rect(0, 0, W, H); c.arc(W / 2 + ox, cy, r, 0, TAU); c.clip('evenodd');
    c.beginPath(); c.rect(0, 0, W, H); c.arc(W / 2 - ox, cy, r, 0, TAU); c.fill('evenodd'); c.restore();
    c.strokeStyle = '#ffffff55'; c.lineWidth = 1; c.beginPath(); c.moveTo(W / 2 - r * 1.3, cy); c.lineTo(W / 2 + r * 1.3, cy); c.stroke();
    for (let i = -5; i <= 5; i++) { c.beginPath(); c.moveTo(W / 2 + i * r * .2, cy - (i % 5 ? 3 : 7)); c.lineTo(W / 2 + i * r * .2, cy); c.stroke(); }
    if (tagT) { c.strokeStyle = brass; c.lineWidth = 3; c.beginPath(); c.arc(W / 2, cy, 16, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(tagT.t / .45, 0, 1)); c.stroke(); }
    c.fillStyle = brass; c.font = '700 9px "Courier New", monospace'; c.textAlign = 'center'; c.fillText('HOLD ON A SOLDIER TO TAG', W / 2, cy + r + 16);
    c.restore();
  }
  function tags(c, brass, red) {
    // nearest first; men standing together share one label ("99m ×2") instead of printing over each other
    const cp = WD.v.cam.position, list = [];
    for (const s of men) {
      if (!s.tagged || s.ko) continue;
      const [x, y, z] = WD.v.toScreen(s.x, s.gy + 2.2, s.y); if (z > 1 || x < 0 || x > W || y < 0 || y > H) continue;
      list.push({ s, x, y, d: Math.hypot(s.x - cp.x, s.y - cp.z) });
    }
    list.sort((a, b) => a.d - b.d);
    const labels = [];
    for (const q of list) {
      c.fillStyle = q.s.alert ? red : brass; c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(q.x - 4, q.y - 6); c.lineTo(q.x + 4, q.y - 6); c.fill();
      const l = labels.find(l => Math.abs(l.x - q.x) < 24 && Math.abs(l.y - q.y) < 11);
      if (l) { l.n++; l.alert ||= q.s.alert; } else labels.push({ x: q.x, y: q.y, d: q.d, n: 1, alert: q.s.alert });
    }
    if (scoped) return;
    c.font = '700 7px "Courier New", monospace'; c.textAlign = 'center'; c.lineWidth = 2.5; c.strokeStyle = '#0b0b0a99'; c.lineJoin = 'round';
    for (const l of labels) { const txt = Math.round(l.d) + 'm' + (l.n > 1 ? ' ×' + l.n : ''); c.strokeText(txt, l.x, l.y - 9); c.fillStyle = l.alert ? red : brass; c.fillText(txt, l.x, l.y - 9); }
  }
  // what a soldier's senses are up to, over his head: a "?" that fills as he grows sure something's
  // there (he heard a shot, he's staring at the hills), a red "!" as he raises the alarm. Shown over
  // tagged men, and over anyone in the scope or glasses
  function tells(c, brass, red) {
    c.save(); c.textAlign = 'center'; c.font = '800 11px Rubik, sans-serif'; c.lineWidth = 2;
    for (const s of men) {
      if (s.ko || s.inside || !(s.tagged || scoped || glass)) continue;
      const sn = s.senses, shout = s.alert && t - (s.shoutT ?? -9) < 2, wary = !s.alert && sn && sn.mood !== 'calm';
      if (!shout && !wary) continue;
      const [x, y, z] = WD.v.toScreen(s.x, s.gy + 2.75, s.y); if (z > 1 || x < 8 || x > W - 8 || y < 8 || y > H - 8) continue;
      const pop = clamp(s.moodT * 6, 0, 1), r = 7 * (.6 + .4 * pop);
      c.fillStyle = '#0b0b0acc'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      if (wary) { c.strokeStyle = brass; c.beginPath(); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(sn.awareness, .08, 1)); c.stroke(); }
      c.fillStyle = shout ? red : brass; c.fillText(shout ? '!' : '?', x, y + 4);
    }
    c.restore();
  }
  function koPops(c) {
    for (const s of men) {
      const k = s.koFx; if (!k || k.t > 2.2) continue;
      const [x, y, z] = WD.v.toScreen(s.x, s.gy + 2, s.y); if (z > 1) continue;
      const a = clamp(2.2 - k.t, 0, 1), yy = y - 20 - k.t * 10;
      c.save(); c.globalAlpha = a; c.textAlign = 'center';
      c.font = '800 16px Rubik, sans-serif'; c.fillStyle = '#ffe9a8'; c.strokeStyle = '#000a'; c.lineWidth = 3; c.strokeText('KO +' + k.pts, x, yy); c.fillText('KO +' + k.pts, x, yy);
      c.font = '700 8px "Courier New", monospace'; c.fillStyle = '#f2ead6'; c.fillText(k.tags.join(' · '), x, yy + 12);
      c.restore();
    }
  }
  function buttons(c, brass, red) {
    const disc = (b, label, on, ring) => {
      c.save(); c.translate(b.x, b.y);
      const g = c.createRadialGradient(-b.r * .3, -b.r * .4, b.r * .1, 0, 0, b.r); g.addColorStop(0, on ? '#f0d488' : '#3b3830'); g.addColorStop(1, on ? '#8a6a28' : '#1a1916'); c.fillStyle = g;
      c.globalAlpha = .92; c.beginPath(); c.arc(0, 0, b.r, 0, TAU); c.fill(); c.globalAlpha = 1;
      c.strokeStyle = brass; c.lineWidth = 1.5; c.stroke();
      if (ring != null) { c.strokeStyle = '#f2ead6'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, b.r + 4, -Math.PI / 2, -Math.PI / 2 + TAU * ring); c.stroke(); }
      c.fillStyle = on ? '#2b2a26' : '#f2ead6'; c.font = `800 ${Math.round(b.r * .32)}px Rubik, sans-serif`; c.textAlign = 'center'; c.fillText(label, 0, b.r * .12);
      c.restore();
    };
    const ready = !gun.reloading && boltT <= 0 && gun.ammo > 0;
    disc(BTN.fire, 'FIRE', ready, gun.reloading ? gun.reloading : null);
    if (!scoped) { c.font = '700 8px "Courier New", monospace'; c.textAlign = 'center'; c.fillStyle = brass; c.fillText('●'.repeat(gun.ammo) + '○'.repeat(gun.mag - gun.ammo), BTN.fire.x, BTN.fire.y + BTN.fire.r + 12); }
    disc(BTN.scope, scoped ? 'BACK' : 'SCOPE', scoped);
    if (scoped) disc(BTN.left, 'BREATH', breath.held && breath.v > 0, breath.v);
    else disc(BTN.left, glass ? 'BACK' : 'GLASS', glass);
    const nn = nextNest();
    if (nn && !move) {
      const b = BTN.move, hot = located || mortar;
      c.save(); c.fillStyle = hot ? red : '#12110ecc'; roundRect(c, b.x, b.y, b.w, b.h, 6); c.fill();
      if (hot && Math.floor(t * 3) % 2) { c.strokeStyle = '#f2ead6'; c.lineWidth = 2; c.stroke(); }
      c.fillStyle = '#f2ead6'; c.font = '700 9px "Courier New", monospace'; c.textAlign = 'center'; c.fillText('MOVE ▸ ' + NESTS[nn].name.toUpperCase(), b.x + b.w / 2, b.y + 15, b.w - 8);
      c.restore();
    }
  }
  function qteDraw(c, brass) {
    const p = qte.now; if (!p) return;
    const k = clamp(p.t / p.time0, 0, 1), x = p.x ?? W / 2, y = p.y ?? H * .7;
    c.save(); c.strokeStyle = brass; c.lineWidth = 4; c.beginPath(); c.arc(x, y, 30 + 40 * k, 0, TAU); c.stroke();
    c.fillStyle = '#12110ecc'; c.beginPath(); c.arc(x, y, 28, 0, TAU); c.fill();
    c.fillStyle = '#f2ead6'; c.font = '800 12px Rubik, sans-serif'; c.textAlign = 'center';
    const label = p.kind === 'tap' ? 'TAP' : p.kind === 'hold' ? 'HOLD' : p.kind === 'mash' ? 'TAP!' : p.dir === 'up' ? '▲ SWIPE' : p.dir === 'down' ? '▼ SWIPE' : 'SWIPE';
    c.fillText(label, x, y + 4);
    if (p.kind === 'hold') { c.strokeStyle = '#9fd070'; c.lineWidth = 4; c.beginPath(); c.arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(p.held / p.hold, 0, 1)); c.stroke(); }
    c.font = '700 9px "Courier New", monospace'; c.fillStyle = brass; c.fillText('JUMP FOR THE TRAIN', x, y - 52 - 40 * k);
    c.restore();
  }
  function dossier(c, ink, paper, brass, red) {
    c.fillStyle = '#0b0b0a88'; c.fillRect(0, 0, W, H);
    const w = Math.min(W - 24, 360), x = W / 2 - w / 2, y = H < 380 ? 10 : Math.max(14, H * .06);
    c.save();
    const fh = H < 380 ? H - y - 12 : Math.min(H - y - 14, 380);
    c.fillStyle = '#5b4a30'; roundRect(c, x - 4, y - 4, w + 8, fh + 8, 8); c.fill();
    c.fillStyle = paper; roundRect(c, x, y, w, fh, 6); c.fill();
    c.fillStyle = red; c.font = '800 22px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText('LONG SHADOW', x + 14, y + 32);
    c.fillStyle = '#8a7f66'; c.font = '700 9px "Courier New", monospace'; c.fillText('FIELD FILE · CODENAME WREN · ASHVALE 1944', x + 14, y + 46, w - 28);
    let yy = y + 60; briefRows = [];
    for (const m of camp.missions) {
      const on = m.id === sel, open = camp.open(m.id), st = camp.starList(m.id);
      c.fillStyle = on ? '#d9cba6' : '#0000'; c.fillRect(x + 8, yy, w - 16, H < 380 ? 31 : 34);
      c.fillStyle = open ? ink : '#8a7f66'; c.font = '700 13px Rubik, sans-serif'; c.fillText((camp.missions.indexOf(m) + 1) + ' · ' + m.name, x + 16, yy + 15);
      c.font = '700 12px Rubik, sans-serif'; c.fillStyle = brass; c.textAlign = 'right'; c.fillText(st.map(s => s ? '★' : '☆').join(''), x + w - 16, yy + 15); c.textAlign = 'left';
      c.fillStyle = '#8a7f66'; c.font = '600 9px "Courier New", monospace'; c.fillText(open ? (camp.done(m.id) ? 'DONE' : 'READY') : 'LOCKED: FINISH THE ONE ABOVE', x + 16, yy + 28);
      if (open) { c.textAlign = 'right'; c.fillText('✉ ' + camp.collected(m.id) + '/3 LETTERS', x + w - 16, yy + 28); c.textAlign = 'left'; }
      briefRows.push({ x: x + 8, y: yy, w: w - 16, h: 34, id: m.id });
      yy += H < 380 ? 33 : 38;
    }
    const short = H < 380;
    if (short) { c.fillStyle = '#8a7f66'; c.font = '700 10px Rubik, sans-serif'; c.fillText(SEALED.map(([n, name]) => n + ' · ' + name).join('   '), x + 16, yy + 12, w - 32); c.fillStyle = red; c.font = '700 8px "Courier New", monospace'; c.fillText('SEALED · COMING SOON', x + 16, yy + 23); yy += 30; }
    else for (const [n, name] of SEALED) { c.fillStyle = '#8a7f66'; c.font = '700 12px Rubik, sans-serif'; c.fillText(n + ' · ' + name, x + 16, yy + 14); c.font = '700 8px "Courier New", monospace'; c.fillStyle = red; c.textAlign = 'right'; c.fillText('SEALED · COMING SOON', x + w - 16, yy + 14); c.textAlign = 'left'; yy += 22; }
    yy += 6;
    const textW = short ? w - 160 : w - 32;
    c.fillStyle = ink; c.font = '500 11px Rubik, sans-serif'; for (const s of wrap(c, BRIEF[sel], textW)) { c.fillText(s, x + 16, yy + 10); yy += 14; }
    const gx = short ? x + w - 76 : W / 2, gy = short ? Math.min(yy - 10, H - 40) : Math.min(H - 54, yy + 40); briefGo = { x: gx, y: gy, r: 28 };
    // tilt aim: off unless you want it (the phone's turn fine-tunes the aim through the glass)
    { const tx = x + 12, ty = y + fh - 28, tw = 116; tiltBtn = { x: tx, y: ty - 4, w: tw, h: 26 };
      c.fillStyle = tiltAim ? '#2f3a26' : '#d9cba6'; roundRect(c, tx, ty, tw, 18, 9); c.fill();
      c.fillStyle = tiltAim ? '#e8f0c8' : '#5b4a30'; c.font = '700 9px "Courier New", monospace'; c.textAlign = 'center'; c.fillText('TILT AIM · ' + (tiltAim ? 'ON' : 'OFF'), tx + tw / 2, ty + 12); c.textAlign = 'left'; }
    c.translate(gx, gy); c.rotate(-.08); c.strokeStyle = red; c.lineWidth = 3; c.strokeRect(-56, -18, 112, 36); c.fillStyle = red; c.font = '800 18px Rubik, sans-serif'; c.textAlign = 'center'; if (WD.regions.has(sel)) c.fillText('GO', 0, 7); else { c.font = '800 12px Rubik, sans-serif'; c.fillText('LOADING', 0, 0); c.fillRect(-40 + 64 * (briefT * .7 % 1), 7, 16, 3); }   // (the mission's own things, being made)
    c.restore();
    briefGo.r = 56;
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'long-shadow',
  title: 'Long Shadow',
  tag: 'Next Gen · Sniper',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,
  goal: 1500, reward: 30,
  hint: 'A sniper campaign in a 1944 valley. Drag to look, tap GLASS to tag soldiers, SCOPE in, hold BREATH and FIRE: aim above far targets and into the wind. Shoot while the train or bell is loud (or ring the bell yourself), and MOVE when they find you.',
  traits: ['theme:military', 'genre:shooter'],
  creator: 'Game Scroll',
  make,
};
