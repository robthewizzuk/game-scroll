// Rift Keeper: doorways to other worlds open round your real room, and you can see straight through
// them: a lava cave, a frozen valley, a mushroom meadow, a night of floating islands. Little lost
// critters tumble out of them and drift towards you. Tap one to catch it (you can hold three), then
// turn to the doorway of its world and tap it to throw the critter home. A critter that reaches
// you bumps you; three bumps and the round is over. Later on two worlds swap doorways, so peek
// through to see which is where. Now and then a gold doorway opens behind you: tap it (or walk
// through it) to dive into a bonus world full of stars.
//
// How the doorways work: each world is a box of scenery behind its doorway, wrapped in an invisible
// box that only writes depth (drawn first). From the room you see the camera picture everywhere
// except through the opening, where the depth test lets the world show. From inside a box (walking
// through, or the gold dive) its faces point away and are skipped, so the world is all round you.
import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic, want } = gs.device;
const { rnd } = gs.util;
const { Juice } = gs.juice;
const { Gestures } = gs.controls;
const { Particles, pbr, rbox, THREE } = gs.hd;
const { ARView, arNote, FLOOR } = gs.ar;
const { Group, Mesh, SphereGeometry, BoxGeometry, ConeGeometry, CylinderGeometry, TorusGeometry, DodecahedronGeometry, OctahedronGeometry,
  ShapeGeometry, ExtrudeGeometry, Shape, Path, MeshBasicMaterial, CanvasTexture, SRGBColorSpace, BackSide, DoubleSide, AdditiveBlending, Vector3, Color } = THREE;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

let W = 300, H = 460;
// doorway opening (m): width, height of the straight sides (a round arch sits on top)
const DW = 1, DR = 1.4;
// the box of world behind each doorway: width, height, depth
const BW = 3, BH = 3, BD = 3.4;
const R = 3.4;                              // doorways stand this far from where you start
const SLOTS = [.45, -.45, 1.75, -1.75];     // their angles (0 = straight ahead at the start, + = left)
const GOLD_A = Math.PI;                     // the gold doorway opens behind you
const GW = 5.4, GD = 5.2, GH = 3.4;         // the gold world is bigger: you go inside it
const HOLD = 3, LIVES = 3, BONUS = 9;
// the gold world is squashed shallower while it waits in the room (so it fits inside the virtual
// room when there's no camera), and stretches to full depth as you dive in
const SQ = .62;

const WORLDS = [
  { name: 'EMBER', col: '#ff7a2a', sky: ['#1c0306', '#8a1e10', '#ff9a3a'], hills: '#160304', ground: '#3a1810', mote: [3, 1.1, .3] },
  { name: 'FROST', col: '#3ab4ff', sky: ['#1e4c9a', '#78b8ec', '#d8eeff'], hills: '#a8c8e8', ground: '#cfe2f4', mote: [2, 2.2, 2.6] },
  { name: 'BLOOM', col: '#6ee04a', sky: ['#1f7a72', '#7ad6a0', '#fff1a0'], hills: '#2a6a36', ground: '#3d9446', mote: [1.6, 2.4, .6] },
  { name: 'DREAM', col: '#c27aff', sky: ['#070316', '#2a1460', '#8a3ab8'], hills: '#12082a', ground: '#2a1648', mote: [2, 1.1, 3] },
];
const GOLD = { name: 'GOLD', col: '#ffd24a', sky: ['#e8506a', '#ff9a5a', '#ffd890'], hills: '#ffc8a0', ground: '#e8b070', mote: [3, 2.4, .8] };

function arch(s) { const r = DW / 2; s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, DR); s.absarc(0, DR, r, 0, Math.PI, false); s.lineTo(-r, 0); return s; }
const inOpening = (x, y) => y > 0 && Math.abs(x) < DW / 2 && (y < DR || Math.hypot(x, y - DR) < DW / 2);
// a box with no face towards the doorway (+z): drawn with one material per face, minus that one
function openBox(w, h, d) { const g = new BoxGeometry(w, h, d); g.groups = g.groups.filter(gr => gr.materialIndex !== 4); return g; }
function wallWithDoor(w, h) { const s = new Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0); s.holes.push(arch(new Path())); return new ShapeGeometry(s, 20); }

// --- shared looks (made once) -------------------------------------------------------------------
let LK = null;
function looks() {
  if (LK) return LK;
  const star = new Shape();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2, r = i % 2 ? .045 : .11; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const starG = new ExtrudeGeometry(star, { depth: .035, bevelEnabled: true, bevelThickness: .012, bevelSize: .01, bevelSegments: 1 }); starG.center();
  LK = {
    occ: new MeshBasicMaterial({ colorWrite: false }),     // writes depth only: hides the world except through the doorway
    stone: pbr('#6a6470', { rough: .8 }), goldStone: pbr('#d8a838', { rough: .3, metal: .8 }),
    eye: pbr('#ffffff', { rough: .2 }), pupil: pbr('#141018', { rough: .2 }),
    G: {
      ball: new SphereGeometry(1, 20, 14), cone: new ConeGeometry(1, 1, 10), cyl: new CylinderGeometry(1, 1, 1, 14), rock: new DodecahedronGeometry(1, 0),
      gem: new OctahedronGeometry(1, 0), cube: new BoxGeometry(1, 1, 1), cap: new SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      arch: new TorusGeometry(DW / 2 + .08, .08, 8, 24, Math.PI), rune: new TorusGeometry(DW / 2, .018, 6, 32, Math.PI),
      pillar: rbox(.16, DR + .05, .2), side: new BoxGeometry(.03, DR, .03), step: rbox(1.4, .05, .36),
      skin: new ShapeGeometry(arch(new Shape()), 20), front: wallWithDoor(BW, BH), gfront: wallWithDoor(GW, GH), star: starG,
    },
  };
  return LK;
}
// sky walls painted in code: a gradient with a skyline for each world
function skyTex(w, i) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, w.sky[0]); gr.addColorStop(.55, w.sky[1]); gr.addColorStop(.85, w.sky[2]); g.fillStyle = gr; g.fillRect(0, 0, S, S);
  let seed = i * 97 + 13; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  if (w.name === 'DREAM' || w.name === 'EMBER') for (let k = 0; k < 70; k++) { g.fillStyle = w.name === 'DREAM' ? `rgba(255,255,255,${.3 + r() * .7})` : `rgba(255,${120 + r() * 100 | 0},40,${.3 + r() * .5})`; g.fillRect(r() * S, r() * S * .7, 1.5, 1.5); }
  if (w.name === 'DREAM') { g.fillStyle = '#f4e8ff'; g.beginPath(); g.arc(S * .7, S * .25, 18, 0, 7); g.fill(); g.fillStyle = w.sky[0]; g.beginPath(); g.arc(S * .7 + 8, S * .25 - 5, 15, 0, 7); g.fill(); }
  if (w.name === 'GOLD') for (let k = 0; k < 7; k++) { g.fillStyle = '#ffffffcc'; const x = r() * S, y = S * (.2 + r() * .4); for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(x + j * 12, y + Math.sin(j) * 4, 10 + r() * 6, 0, 7); g.fill(); } }
  g.fillStyle = w.hills; g.beginPath(); g.moveTo(0, S);
  for (let x = 0; x <= S; x += 8) {
    const y = w.name === 'EMBER' ? S * .78 - Math.max(0, 50 - Math.abs(x - S * .45) * .7) - r() * 6
      : w.name === 'FROST' ? S * .8 - Math.abs(((x / 40) % 2) - 1) * 40 - r() * 4
        : w.name === 'BLOOM' ? S * .82 - Math.sin(x / 30) * 12 - 10
          : S * .86 - r() * 8;
    g.lineTo(x, y);
  }
  g.lineTo(S, S); g.fill();
  if (w.name === 'EMBER') { g.fillStyle = '#ffb040'; g.beginPath(); g.arc(S * .45, S * .78 - 50, 6, 0, 7); g.fill(); }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}
const P = (geo, mat, sx, sy, sz, x, y, z) => { const m = new Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); return m; };

// one world's scenery in doorway space: the doorway at z = 0, the world behind it (z < 0)
function buildWorld(w, i, bw, bh, bd) {
  const L = looks(), G = L.G, g = new Group(), tex = skyTex(w, i);
  const wall = new MeshBasicMaterial({ map: tex, side: BackSide }), ceil = new MeshBasicMaterial({ color: w.sky[0], side: BackSide });
  const ground = pbr(w.ground, { rough: .9, glow: .35, side: BackSide });
  const sky = new Mesh(openBox(bw - .06, bh - .06, bd - .06), [wall, wall, ceil, ground, wall, wall]);
  sky.position.set(0, bh / 2, -bd / 2); g.add(sky);
  // the inside of the doorway wall, so from inside the world it has a wall round the opening
  const inner = new Mesh(bw === GW ? G.gfront : G.front, new MeshBasicMaterial({ color: w.hills, side: DoubleSide })); inner.position.z = -.04; g.add(inner);
  const n = w.name, bob = [];
  if (n === 'EMBER') {
    const rock = pbr('#2a1a18', { rough: .9 }), lava = pbr('#ff5a10', { glow: 1.1, rough: .4 }), crack = pbr('#ff7a1a', { glow: 1.4 });
    g.add(P(G.cyl, lava, .7, .02, .5, .7, .03, -2.2), P(G.cyl, lava, .4, .02, .3, -.9, .03, -1.5));
    for (const [x, z, s] of [[-1, -2.6, .45], [1.1, -1.2, .3], [-.3, -2.9, .35], [.4, -1.4, .16], [-1.1, -.8, .22]]) { const m = P(G.rock, rock, s, s * 1.3, s, x, s * .5, z); m.rotation.y = x * 3; g.add(m); }
    for (const [x, z] of [[-.4, -1.9], [.2, -2.6], [.9, -2.9]]) { const m = P(G.cube, crack, .04, .02, .7, x, .015, z); m.rotation.y = x * 2; g.add(m); }
    for (const [x, z] of [[1.15, -2.9], [-1.2, -2]]) { g.add(P(G.cone, rock, .28, 1.4, .28, x, .7, z)); g.add(P(G.ball, crack, .07, .07, .07, x, 1.42, z)); }
  } else if (n === 'FROST') {
    const ice = pbr('#a8dcff', { rough: .1, glow: .45, clear: 1 }), snow = pbr('#ffffff', { rough: .8, glow: .3 });
    for (const [x, z, h] of [[-1.1, -2.4, 1.3], [-.7, -2.9, .9], [1, -2.2, 1.6], [1.2, -1.2, .7], [.5, -3, 1.1], [-1.2, -1.2, .6]]) g.add(P(G.cone, ice, .16 + h * .08, h, .16 + h * .08, x, h / 2, z));
    for (const [x, z, s] of [[-.4, -2.3, .35], [.7, -1.7, .22], [-.9, -1.8, .25]]) g.add(P(G.ball, snow, s * 1.4, s * .6, s * 1.4, x, 0, z));
  } else if (n === 'BLOOM') {
    const stem = pbr('#f4ead2', { rough: .7, glow: .2 }), caps = [pbr('#ff5a8a', { rough: .5, glow: .35 }), pbr('#ffb03a', { rough: .5, glow: .35 })], dot = pbr('#ffffff', { glow: .4 }), grass = pbr('#4ec85a', { glow: .3 });
    for (const [x, z, h, k] of [[-1, -2.4, 1.5, 0], [1, -2, 1.1, 1], [.3, -3, 1.8, 0], [-1.1, -1.1, .6, 1]]) {
      g.add(P(G.cyl, stem, .07 + h * .03, h, .07 + h * .03, x, h / 2, z));
      const cap = P(G.cap, caps[k], .25 + h * .2, .15 + h * .1, .25 + h * .2, x, h, z); g.add(cap);
      for (let d = 0; d < 4; d++) { const a = d * 1.6 + x; g.add(P(G.ball, dot, .04, .02, .04, x + Math.cos(a) * (.15 + h * .1), h + .1 + h * .05, z + Math.sin(a) * (.15 + h * .1))); }
    }
    for (let k = 0; k < 14; k++) { const x = rnd(-1.35, 1.35), z = rnd(-3.1, -.6); if (Math.abs(x) < .5 && z > -1.6) continue; g.add(P(G.cone, grass, .05, .25, .05, x, .12, z)); }
  } else if (n === 'DREAM') {
    const land = pbr('#4a2a7a', { rough: .8, glow: .25 }), top = pbr('#7a5ab8', { rough: .7, glow: .4 }), gem = pbr('#ff6ae6', { glow: 2.2, rough: .2 });
    for (const [x, y, z, s] of [[-.9, 1.7, -2.6, .45], [1, 2.2, -2.2, .35], [.2, 1.3, -3, .3], [1.1, .9, -1.4, .22]]) {
      const isl = new Group(); isl.position.set(x, y, z);
      const under = P(G.cone, land, s, s * 1.4, s, 0, -s * .7, 0); under.rotation.x = Math.PI; isl.add(under, P(G.cyl, top, s, .06, s, 0, 0, 0), P(G.gem, gem, .07, .14, .07, s * .3, .15, 0));
      isl.userData.y0 = y; g.add(isl); bob.push(isl);
    }
    for (const [x, z, s] of [[-1.1, -1.3, .18], [.8, -2.8, .25], [-.4, -3, .16]]) g.add(P(G.gem, gem, s * .6, s * 1.4, s * .6, x, s * 1.3, z));
  } else {   // GOLD
    const cloud = pbr('#ffffff', { rough: .9, glow: .5 }), pil = pbr('#ffcf5a', { rough: .3, metal: .7, glow: .25 });
    for (const [x, z] of [[-2.2, -1.2], [2.2, -1.2], [-2.2, -4], [2.2, -4]]) { g.add(P(G.cyl, pil, .16, 2.4, .16, x, 1.2, z)); g.add(P(G.ball, pil, .22, .22, .22, x, 2.45, z)); }
    for (const [x, y, z] of [[-1.4, 2.6, -3.6], [1.2, 2.9, -2.6], [0, .3, -4.4], [-2, .4, -2.6], [1.9, .5, -3.8]]) for (let j = 0; j < 4; j++) g.add(P(G.ball, cloud, .3 - j * .03, .2, .3 - j * .03, x + j * .25 - .4, y + Math.sin(j * 2) * .06, z + (j % 2) * .1));
  }
  g.userData.bob = bob;
  return g;
}
// a doorway: depth-only box round the world, stone frame, glowing runes, a faint skin across it
function buildDoor(gold) {
  const L = looks(), G = L.G, bw = gold ? GW : BW, bh = gold ? GH : BH, bd = gold ? GD : BD;
  const g = new Group(), occ = [L.occ, L.occ, L.occ, L.occ, L.occ, L.occ];
  const box = new Mesh(openBox(bw, bh, bd), occ); box.position.set(0, bh / 2 - .02, -bd / 2); box.renderOrder = -10;
  const front = new Mesh(gold ? G.gfront : G.front, L.occ); front.renderOrder = -10;
  const stone = gold ? L.goldStone : L.stone, glow = pbr('#ffffff', { glow: 1.6 });
  const frame = new Group();
  for (const s of [-1, 1]) { const p = new Mesh(G.pillar, stone); p.position.set(s * (DW / 2 + .08), (DR + .05) / 2, .06); frame.add(p); const r = new Mesh(G.side, glow); r.position.set(s * DW / 2, DR / 2, .1); frame.add(r); }
  const a = new Mesh(G.arch, stone); a.position.set(0, DR, .06); const rn = new Mesh(G.rune, glow); rn.position.set(0, DR, .1);
  const step = new Mesh(G.step, stone); step.position.set(0, .025, .14);
  frame.add(a, rn, step); frame.traverse(o => { o.castShadow = true; });
  const skinM = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .12, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const skin = new Mesh(G.skin, skinM); skin.position.z = .02;
  const holder = new Group();
  g.add(box, front, holder, frame, skin);
  return { g, holder, glow, skinM, bw, bh, bd };
}
// a critter from world w: a fuzzy ball with big eyes and a little something on top
function buildCritter(w) {
  const L = looks(), G = L.G, g = new Group(), col = WORLDS[w].col;
  const body = P(G.ball, pbr(col, { rough: .5, glow: .3 }), .14, .13, .14, 0, 0, 0);
  g.add(body);
  for (const s of [-1, 1]) g.add(P(G.ball, L.eye, .045, .05, .03, s * .055, .03, .118), P(G.ball, L.pupil, .022, .026, .015, s * .055, .025, .145));
  const extra = pbr(col, { glow: 1.6 });
  if (w === 0) g.add(P(G.cone, pbr('#ffcf3a', { glow: 2.4 }), .05, .14, .05, 0, .17, 0), P(G.cone, extra, .035, .1, .035, .05, .15, 0));
  else if (w === 1) for (const s of [-1, 0, 1]) { const m = P(G.cone, pbr('#e8f8ff', { glow: .8, rough: .1 }), .025, .1, .025, s * .05, .15 - Math.abs(s) * .02, 0); m.rotation.z = -s * .4; g.add(m); }
  else if (w === 2) { g.add(P(G.cyl, pbr('#3a8a2a'), .01, .08, .01, 0, .16, 0)); const lf = P(G.ball, pbr('#8af05a', { glow: .5 }), .06, .015, .03, .04, .2, 0); lf.rotation.z = .4; g.add(lf); }
  else g.add(P(G.gem, pbr('#ffe0ff', { glow: 2.2 }), .035, .06, .035, 0, .18, 0));
  g.traverse(o => { o.castShadow = true; });
  g.userData.body = body;
  return g;
}

function make(api) {
  want('motion');                     // iPhones ask for motion access on the Play tap
  const juice = new Juice();
  let v, fx, worlds, gw, doors, gold, pool;
  let critters, held, sel, score, lives, t, spawnT, combo, comboT, swapT, swapping, goldT, bonus, stars, note, hurt, firstThrow;
  const g = new Gestures({ tap: (x, y) => tapAt(x, y), drag: (x, y, dx, dy) => v?.drag(-dx, -dy) });
  const tmp = new Vector3(), tmp2 = new Vector3(), tmp3 = new Vector3();

  function setup() {
    v = new ARView();
    fx = new Particles(v, { max: 600, additive: true });
    // no camera: the kit's virtual room is drawn before the doorways' depth-only boxes, so the boxes
    // don't punch holes in its walls (with the camera the room is hidden and the boxes show the picture)
    v.room?.traverse(o => { o.renderOrder = -20; });
    worlds = WORLDS.map((w, i) => buildWorld(w, i, BW, BH, BD));
    gw = buildWorld(GOLD, 9, GW, GH, GD);
    doors = SLOTS.map(a => { const d = buildDoor(false); d.a = a; d.home = new Vector3(-Math.sin(a) * R, FLOOR, -Math.cos(a) * R); d.g.rotation.y = a; v.scene.add(d.g); return d; });
    gold = buildDoor(true); gold.a = GOLD_A; gold.home = new Vector3(-Math.sin(GOLD_A) * R, FLOOR, -Math.cos(GOLD_A) * R); gold.g.rotation.y = GOLD_A; gold.holder.add(gw); v.scene.add(gold.g);
    gold.glow.color.set('#ffd24a'); gold.glow.emissive.set('#ffd24a');
    pool = WORLDS.map(() => []);
  }
  const say = (text, col = '#fff') => { note = { text, col, t: 1.6 }; };
  const eye = () => v.eyePos;
  const opened = d => d.open > .95 && d.g.visible;
  // where a doorway's world is: d.world is an index into WORLDS
  function setWorld(d, w) { d.world = w; d.holder.clear(); d.holder.add(worlds[w]); d.glow.color.set(WORLDS[w].col); d.glow.emissive.set(WORLDS[w].col); d.skinM.color.set(WORLDS[w].col); }
  function openDoor(d) { d.g.visible = true; d.opening = true; }
  function local(d, p, out) { d.g.updateMatrixWorld(); return d.g.worldToLocal(out.copy(p)); }
  function doorCentre(d, out) { return d.g.localToWorld(out.set(0, 1, .05)); }
  // where the tap's line of sight meets a doorway's opening (null if it misses)
  function tapRay(x, y) {
    const o = eye().clone(), dir = new Vector3(x / W * 2 - 1, -(y / H * 2 - 1), .5).unproject(v.cam).sub(o).normalize();
    return { o, dir };
  }
  function rayDoor(d, ray) {
    d.g.updateMatrixWorld();
    const o = d.g.worldToLocal(tmp.copy(ray.o)), e = d.g.worldToLocal(tmp2.copy(ray.o).add(ray.dir));
    const dz = e.z - o.z; if (o.z <= 0 || dz >= 0) return false;
    const k = -o.z / dz, lx = o.x + (e.x - o.x) * k, ly = (o.y + (e.y - o.y) * k) / d.g.scale.y;
    return k < 20 && Math.abs(lx) < DW / 2 + .15 && ly > -.1 && ly < DR + DW / 2 + .15;   // a little help round the edge
  }

  function critterMesh(w) { const free = pool[w].find(m => !m.parent); if (free) return free; const m = buildCritter(w); pool[w].push(m); return m; }
  function spawn() {
    const list = doors.filter(opened); if (!list.length) return;
    // prefer a doorway you're not looking at, so you have to turn, but not every time
    list.sort((a, b) => v.offAim(doorCentre(b, tmp3)) - v.offAim(doorCentre(a, tmp3)) + rnd(-.8, .8));
    const d = list[0], m = critterMesh(d.world);
    const p = d.g.localToWorld(new Vector3(rnd(-.2, .2), 1, -1.3));
    m.position.copy(p); m.visible = true; m.scale.setScalar(1); v.scene.add(m);
    const out = new Vector3(Math.sin(d.a), 0, Math.cos(d.a));
    critters.push({ w: d.world, m, p, vel: out.multiplyScalar(.9), st: 'out', t: 0, ph: rnd(0, 6), sp: Math.min(.75, .3 + t * .0035) * rnd(.85, 1.15), door: null });
  }
  function drop(c) { v.scene.remove(c.m); critters.splice(critters.indexOf(c), 1); }
  function burst(p, col, n = 30, sp = 1.6) { for (let i = 0; i < n; i++) fx.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-sp, sp), vy: rnd(-sp * .6, sp * 1.2), vz: rnd(-sp, sp), life: rnd(.4, .8), size: rnd(.025, .05), col, drag: 2, grav: 1.5 }); }
  const rgb = hex => { const c = new Color(hex); return [c.r * 2.5, c.g * 2.5, c.b * 2.5]; };

  // --- taps ---
  function reach(p) { const d = tmp.copy(p).sub(eye()).length(); return .18 / Math.max(.3, d) * (H / 2) / Math.tan(v.cam.fov * Math.PI / 360) + 20; }
  function tapAt(x, y) {
    if (!v || v.calibrating || !critters) return;
    // the jar: tap a held critter to pick which one you throw next
    if (held.length && y > H - 64) { const i = Math.round((x - (W / 2 - (held.length - 1) * 22)) / 44); if (i >= 0 && i < held.length && Math.abs(x - (W / 2 - (held.length - 1) * 22 + i * 44)) < 22) { sel = i; sfx(700, .05, 'triangle', .03); haptic('tick'); return; } }
    if (bonus) {   // inside the gold world: tap stars
      let best = null, bd = 1e9;
      for (const s of stars) { if (s.got) continue; const p = s.m.getWorldPosition(tmp3), [sx, sy, z] = v.toScreen(p.x, p.y, p.z), d = Math.hypot(sx - x, sy - y); if (z < 1 && d < reach(p) + 6 && d < bd) { bd = d; best = s; } }
      if (best) {
        best.got = true; best.m.visible = false; score++; api.score(score); burst(best.m.getWorldPosition(tmp3), [3, 2.4, .6], 24);
        bonus.n++; sfx(880 + bonus.n * 70, .09, 'triangle', .05, 300); haptic('light'); juice.pop(x, y - 18, '+1', { size: 18, color: '#ffd24a' });
      }
      return;
    }
    // catch the nearest critter under the tap
    let best = null, bd = 1e9;
    for (const c of critters) {
      if (c.st !== 'free' && c.st !== 'out') continue;
      const [sx, sy, z] = v.toScreen(c.p.x, c.p.y, c.p.z), d = Math.hypot(sx - x, sy - y);
      if (z < 1 && d < reach(c.p) && d < bd) { bd = d; best = c; }
    }
    const ray = tapRay(x, y);
    if (best) {
      if (held.length >= HOLD) { say('HANDS FULL! SEND ONE HOME', '#ffb0b0'); haptic('warning'); sfx(160, .12, 'square', .03); return; }
      best.st = 'catch'; best.t = 0; sfx(620, .08, 'triangle', .05, 400); haptic('light');
      juice.pop(x, y - 20, 'GOT IT', { size: 14, color: WORLDS[best.w].col });
      return;
    }
    // the gold doorway: dive in
    if (gold.g.visible && gold.state === 'open' && rayDoor(gold, ray)) return dive();
    // throw the chosen critter where you tapped
    if (held.length) {
      const w = held.splice(sel, 1)[0]; sel = Math.min(sel, Math.max(0, held.length - 1));
      const m = critterMesh(w), p = ray.o.clone().addScaledVector(ray.dir, .3); p.y -= .1;
      m.position.copy(p); m.visible = true; m.scale.setScalar(1); v.scene.add(m);
      critters.push({ w, m, p, vel: ray.dir.clone().multiplyScalar(7).add(tmp.set(0, .55, 0)), st: 'fly', t: 0, ph: 0, sp: .4, door: null, prev: p.clone() });
      sfx(300, .14, 'sine', .05, 500); haptic('tick'); firstThrow = false;
      return;
    }
    haptic('tick');
  }

  // --- gold doorway and the bonus world ---
  function dive(walked) {
    gold.state = 'dive'; gold.t = 0; gold.from = gold.g.position.clone();
    // slide the doorway over you so you end up 1.3 m inside, looking in
    const z = new Vector3(Math.sin(gold.a), 0, Math.cos(gold.a));
    gold.to = walked ? gold.from.clone() : new Vector3(eye().x, FLOOR, eye().z).addScaledVector(z, 1.3);
    for (const d of doors) d.g.visible = false;
    for (const c of critters) c.m.visible = false;
    sfx(140, .8, 'sine', .07, 900); haptic('heavy');
    stars = [];
    for (let i = 0; i < 12; i++) {
      const m = new Mesh(looks().G.star, pbr('#ffc21a', { glow: .7, glowCol: '#ffae00', metal: .5, rough: .25 }));
      // in the box, ahead and to the sides of where you'll be (door space, then placed in the world when in)
      let lx, lz; do { lx = rnd(-GW / 2 + .5, GW / 2 - .5); lz = rnd(-GD + .5, -1.6); } while (Math.abs(lx) < .4 && lz > -2.2);
      m.userData.l = new Vector3(lx, rnd(.7, 2.4), lz); m.visible = false; gold.g.add(m); m.position.copy(m.userData.l);
      stars.push({ m, got: false, spin: rnd(1, 3) });
    }
  }
  function goldUpdate(dt) {
    const G = gold;
    if (!G.g.visible) {
      goldT -= dt;
      if (goldT <= 0 && doors.filter(opened).length >= 2) { G.g.position.copy(G.home); G.g.scale.z = SQ; G.g.visible = true; G.open = 0; G.state = 'open'; G.life = 11; say('A GOLD DOOR OPENED BEHIND YOU', '#ffd24a'); sfx(523, .12, 'triangle', .05); sfx(784, .2, 'triangle', .05, 0); haptic('success'); }
      return;
    }
    if (G.state === 'open') {
      G.open = Math.min(1, G.open + dt * 1.5); G.life -= dt;
      // walking through it in world mode counts too
      const l = local(G, eye(), tmp);
      if (l.z < -.1 && l.z > -1.5 && Math.abs(l.x) < DW / 2 && G.open > .9) { dive(true); return; }
      if (G.life < 0) G.state = 'close';
    } else if (G.state === 'dive') {
      G.t += dt; const k = Math.min(1, G.t / .7), e = k * k * (3 - 2 * k);
      G.g.position.lerpVectors(G.from, G.to, e); G.g.scale.z = SQ + (1 - SQ) * e;
      if (k >= 1) { G.state = 'in'; bonus = { t: BONUS, n: 0 }; for (const s of stars) s.m.visible = true; say('GRAB THE STARS!', '#ffd24a'); }
    } else if (G.state === 'in') {
      bonus.t -= dt;
      for (const s of stars) { s.m.rotation.y += s.spin * dt; s.m.position.y = s.m.userData.l.y + Math.sin(t * 2 + s.spin * 3) * .08; }
      if (bonus.t <= 0 || stars.every(s => s.got)) {
        if (stars.every(s => s.got)) { score += 5; api.score(score); say('ALL STARS! +5', '#ffd24a'); haptic('success'); } else say(`+${bonus.n} STARS`, '#ffd24a');
        bonus = null; G.state = 'out'; G.t = 0; G.back = G.g.position.clone();
        // step back out: slide the doorway so you stand 1.2 m in front of it again
        G.out = new Vector3(eye().x, FLOOR, eye().z).addScaledVector(tmp.set(Math.sin(G.a), 0, Math.cos(G.a)), -1.2);
        sfx(900, .6, 'sine', .05, -700);
      }
    } else if (G.state === 'out') {
      G.t += dt; const k = Math.min(1, G.t / .6), e = k * k * (3 - 2 * k);
      G.g.position.lerpVectors(G.back, G.out, e); G.g.scale.z = 1 - (1 - SQ) * e;
      if (k >= 1) { G.state = 'close'; for (const s of stars) gold.g.remove(s.m); stars = []; for (const d of doors) d.g.visible = d.open > 0; for (const c of critters) c.m.visible = true; }
    } else if (G.state === 'close') {
      G.open -= dt * 2;
      if (G.open <= 0) { G.g.visible = false; G.state = null; goldT = rnd(28, 36); for (const s of stars || []) gold.g.remove(s.m); stars = []; for (const d of doors) d.g.visible = d.open > 0; for (const c of critters) c.m.visible = true; }
    }
    G.g.scale.y = Math.max(.01, G.open);
  }

  return {
    reset() {
      if (!v) setup();
      v.off(); v.recenter();
      for (const c of critters || []) v.scene.remove(c.m);
      for (const s of stars || []) gold.g.remove(s.m);
      fx.clear(); juice.clear(); g.release();
      critters = []; held = []; sel = 0; score = 0; lives = LIVES; t = 0; spawnT = 1.2; combo = 0; comboT = 0;
      swapT = 26; swapping = null; goldT = 30; bonus = null; stars = []; note = null; hurt = 0; firstThrow = true;
      // shuffle which world is behind which doorway
      const order = shuffle([0, 1, 2, 3]);
      doors.forEach((d, i) => { setWorld(d, order[i]); d.open = 0; d.opening = false; d.g.visible = false; d.g.position.copy(d.home); d.g.scale.y = .01; });
      openDoor(doors[0]); openDoor(doors[1]);
      gold.g.visible = false; gold.state = null; gold.open = 0; gold.g.position.copy(gold.home);
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      v.live(); if (v.calibrating) return;      // floor calibration open: pause
      juice.update(dt); fx.update(dt);
      t += dt; comboT -= dt; hurt = Math.max(0, hurt - dt * 1.5); if (note) { note.t -= dt; if (note.t <= 0) note = null; }
      for (const w of [...worlds, gw]) for (const b of w.userData.bob) b.position.y = b.userData.y0 + Math.sin(t * 1.2 + b.position.x * 3) * .08;
      goldUpdate(dt);
      if (bonus || gold.state === 'dive' || gold.state === 'out') return;   // the room waits while you're in the gold world
      // doorways open (grow up from the floor), more of them as you score
      if (score >= 5 && !doors[2].opening) { openDoor(doors[2]); say('A NEW DOOR OPENED', WORLDS[doors[2].world].col); sfx(392, .3, 'triangle', .05, 200); }
      if (score >= 13 && !doors[3].opening) { openDoor(doors[3]); say('ANOTHER DOOR OPENED', WORLDS[doors[3].world].col); sfx(392, .3, 'triangle', .05, 200); }
      for (const d of doors) {
        if (d.opening && d.open < 1) { d.open = Math.min(1, d.open + dt * .9); d.g.scale.y = Math.max(.01, d.open * d.open * (3 - 2 * d.open)); }
        d.skinM.opacity = .1 + Math.sin(t * 3 + d.a * 4) * .04 + (swapping && swapping.ds.includes(d) ? (Math.sin(t * 30) > 0 ? .35 : 0) : 0);
        // a few motes drifting in each world (they only show through the doorway)
        if (opened(d) && Math.random() < dt * 8) {
          const w = WORLDS[d.world], p = d.g.localToWorld(tmp.set(rnd(-1.3, 1.3), rnd(.2, 2.4), rnd(-3, -.6)));
          fx.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-.1, .1), vy: w.name === 'FROST' ? -.35 : rnd(.05, .3), vz: rnd(-.1, .1), life: rnd(1.2, 2.2), size: rnd(.02, .04), col: w.mote });
        }
      }
      // worlds swap doorways once three are open: the doorways flicker first
      const open = doors.filter(opened);
      if (open.length >= 3) {
        if (!swapping) { swapT -= dt; if (swapT <= 0) { const s = shuffle(open).slice(0, 2); swapping = { ds: s, t: 1.6 }; sfx(200, .4, 'sawtooth', .03, 300); haptic('warning'); } }
        else if ((swapping.t -= dt) <= 0) {
          const [a, b] = swapping.ds, wa = a.world; setWorld(a, b.world); setWorld(b, wa); swapping = null; swapT = rnd(16, 22);
          say('TWO WORLDS SWAPPED DOORS!', '#ffffff'); sfx(330, .2, 'triangle', .05, -150); haptic('medium');
          for (const d of [a, b]) burst(doorCentre(d, tmp3), rgb(WORLDS[d.world].col), 26, 1.2);
        }
      }
      // new critters
      spawnT -= dt;
      const free = critters.filter(c => c.st === 'free' || c.st === 'out').length;
      if (spawnT <= 0 && free < Math.min(7, 2 + Math.floor(score / 4))) { spawn(); spawnT = Math.max(1.4, 4 - t * .022) * rnd(.8, 1.2); }
      const E = eye();
      for (const c of [...critters]) {
        c.t += dt; c.ph += dt;
        if (c.st === 'out') {          // tumbling out of the doorway
          c.p.addScaledVector(c.vel, dt);
          if (c.t > 1.7) c.st = 'free';
        } else if (c.st === 'free') {   // drift towards you, bobbing and weaving
          const to = tmp.set(E.x - c.p.x, E.y - .3 + Math.sin(c.ph * 2) * .15 - c.p.y, E.z - c.p.z), d = to.length();
          to.normalize();
          c.p.x += (to.x * c.sp + Math.cos(c.ph * 1.3) * .25 * -to.z) * dt; c.p.z += (to.z * c.sp + Math.cos(c.ph * 1.3) * .25 * to.x) * dt; c.p.y += to.y * Math.max(c.sp, .5) * dt;
          if (d < .55) {               // bump!
            lives--; hurt = 1; combo = 0; haptic('error'); sfx(90, .35, 'sawtooth', .07, -40);
            burst(c.p, rgb(WORLDS[c.w].col), 24); drop(c); say(lives > 1 ? 'BUMP!' : lives === 1 ? 'LAST CHANCE!' : 'OUCH!', '#ff8a9a');
            if (lives <= 0) { v.off(); return api.over(); }
            continue;
          }
        } else if (c.st === 'catch') {  // whoosh into your hands
          c.p.lerp(tmp.copy(E).add(tmp2.set(0, -.25, 0)), Math.min(1, dt * 12));
          c.m.scale.setScalar(Math.max(.2, 1 - c.t * 3));
          if (c.t > .25) { held.push(c.w); sel = held.length - 1; c.m.scale.setScalar(1); drop(c); continue; }
        } else if (c.st === 'fly') {    // thrown: an arc, maybe through a doorway
          c.prev.copy(c.p); c.vel.y -= 2.2 * dt; c.p.addScaledVector(c.vel, dt); c.m.rotation.x += dt * 9;
          let done = false;
          for (const d of doors) {
            if (!opened(d)) continue;
            const a = local(d, c.prev, tmp), b = local(d, c.p, tmp2);
            if (a.z > 0 && b.z <= 0 && c.door !== d) {     // crossing the doorway's plane
              const k = a.z / (a.z - b.z), x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k;
              if (inOpening(x, y)) {
                if (d.world === c.w) {           // home!
                  c.door = d; c.st = 'home'; c.t = 0;
                  combo = comboT > 0 ? Math.min(4, combo + 1) : 1; comboT = 4.5;
                  score += combo; api.score(score);
                  const [sx, sy] = v.toScreen(c.p.x, c.p.y, c.p.z);
                  juice.pop(sx, sy - 24, combo > 1 ? `+${combo} x${combo}` : '+1', { size: 20, color: WORLDS[c.w].col });
                  sfx(523, .1, 'triangle', .05); sfx(784 + combo * 60, .18, 'triangle', .05, 200); haptic('success');
                } else {                           // wrong world: it bounces back out
                  c.vel.multiplyScalar(-.25); c.vel.y = 1.2; c.st = 'free'; c.t = 0; combo = 0; c.p.copy(c.prev);
                  say(`WRONG WORLD! IT'S FROM ${WORLDS[c.w].name}`, WORLDS[c.w].col); sfx(200, .2, 'square', .04, -120); haptic('warning');
                  burst(c.p, [2.5, 2.5, 2.5], 14, 1);
                }
                done = true; break;
              }
            }
            // flying into a world's box anywhere but its doorway: it bounces off the rift
            if (c.door !== d && b.z < 0 && b.z > -d.bd && Math.abs(b.x) < d.bw / 2 && b.y < d.bh) {
              c.st = 'free'; c.t = 0; c.p.copy(c.prev); burst(c.p, [2, 2, 2.6], 12, .8); say('MISSED', '#ffffff'); combo = 0; done = true; break;
            }
          }
          if (!done && (c.p.y < FLOOR + .12 || c.t > 2.4)) {
            c.st = 'free'; c.t = 0; c.p.y = Math.max(c.p.y, FLOOR + .3); say('MISSED', '#ffffff'); combo = 0; sfx(150, .12, 'sine', .04, -60);
          }
        } else if (c.st === 'home') {   // flying on into its world, then a happy sparkle
          c.p.addScaledVector(c.vel, dt * .5); c.vel.y = Math.max(c.vel.y, .4);
          if (c.t > .35) { burst(c.p, rgb(WORLDS[c.w].col), 30, 1.4); drop(c); continue; }
        }
        c.m.position.copy(c.p);
        if (c.st === 'free' || c.st === 'out') { c.m.lookAt(E); const sq = 1 + Math.sin(c.ph * 7) * .08; c.m.userData.body.scale.set(.14 / sq ** .5, .13 * sq, .14 / sq ** .5); }
      }
    },
    fx(dt) { if (v) { fx.update(dt); juice.update(dt); } },
    draw(c) {
      v.look();
      v.draw(c, W, H);
      // arrows to critters off screen, to the doorway for the critter you're holding, and to the gold doorway
      const items = bonus ? [] : critters.filter(k => k.st === 'free' || k.st === 'out').map(k => ({ p: k.p, col: WORLDS[k.w].col }));
      const aim = held.length ? held[sel] : -1;
      if (!bonus) for (const d of doors) if (opened(d) && d.world === aim) {
        const p = doorCentre(d, new Vector3()); items.push({ p, col: '#ffffff' });
        // a ring round its doorway when it's on screen
        const [sx, sy, z] = v.toScreen(p.x, p.y, p.z);
        if (z < 1) { const r = 34 + Math.sin(t * 6) * 4; c.save(); c.strokeStyle = WORLDS[aim].col; c.lineWidth = 3; c.setLineDash([8, 6]); c.lineDashOffset = -t * 30; c.beginPath(); c.arc(sx, sy, r, 0, 7); c.stroke(); c.restore(); }
      }
      if (gold.g.visible && gold.state === 'open') items.push({ p: doorCentre(gold, new Vector3()), col: '#ffd24a' });
      if (bonus) for (const s of stars) if (!s.got) items.push({ p: s.m.getWorldPosition(new Vector3()), col: '#ffd24a' });
      v.pointers(c, W, H, items);
      juice.begin(c); juice.end(c, W, H);
      // lives
      c.save(); c.font = '700 12px Rubik, sans-serif'; c.textAlign = 'left';
      for (let i = 0; i < LIVES; i++) { c.fillStyle = i < lives ? '#ff5a7a' : '#ffffff30'; const x = 22 + i * 22, y = 24; c.beginPath(); c.moveTo(x, y + 6); c.bezierCurveTo(x - 10, y - 2, x - 6, y - 10, x, y - 4); c.bezierCurveTo(x + 6, y - 10, x + 10, y - 2, x, y + 6); c.fill(); }
      if (combo > 1 && comboT > 0) { c.textAlign = 'right'; c.font = '800 18px Rubik, sans-serif'; c.fillStyle = '#ffd24a'; c.fillText('x' + combo, W - 14, 74); }
      // the jar: critters you're holding (tap one to pick it)
      if (held.length) {
        const y = H - 34;
        held.forEach((w, i) => {
          const x = W / 2 - (held.length - 1) * 22 + i * 44, r = i === sel ? 16 : 12;
          c.fillStyle = '#000a'; c.beginPath(); c.arc(x, y, r + 4, 0, 7); c.fill();
          c.fillStyle = WORLDS[w].col; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
          c.fillStyle = '#fff'; for (const s of [-1, 1]) { c.beginPath(); c.arc(x + s * r * .35, y - r * .1, r * .28, 0, 7); c.fill(); }
          c.fillStyle = '#111'; for (const s of [-1, 1]) { c.beginPath(); c.arc(x + s * r * .35, y - r * .05, r * .14, 0, 7); c.fill(); }
          if (i === sel) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r + 4, 0, 7); c.stroke(); }
        });
        if (firstThrow && !bonus) { c.textAlign = 'center'; c.font = '700 13px Rubik, sans-serif'; c.lineWidth = 4; c.strokeStyle = '#000a'; const s = `Tap the ${WORLDS[held[sel]].name} door to send it home`; c.strokeText(s, W / 2, H - 64); c.fillStyle = '#fff'; c.fillText(s, W / 2, H - 64); }
      }
      if (bonus) {   // time left in the gold world
        c.fillStyle = '#000a'; c.beginPath(); c.roundRect(W / 2 - 70, 44, 140, 10, 5); c.fill();
        c.fillStyle = '#ffd24a'; c.beginPath(); c.roundRect(W / 2 - 70, 44, 140 * Math.max(0, bonus.t / BONUS), 10, 5); c.fill();
      }
      if (note) { c.textAlign = 'center'; c.font = '800 17px Rubik, sans-serif'; c.globalAlpha = Math.min(1, note.t * 2); c.lineWidth = 4; c.strokeStyle = '#000b'; c.strokeText(note.text, W / 2, H * .28, W - 20); c.fillStyle = note.col; c.fillText(note.text, W / 2, H * .28, W - 20); c.globalAlpha = 1; }
      c.restore();
      if (hurt > 0) { const gr = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .7); gr.addColorStop(0, '#ff000000'); gr.addColorStop(1, `rgba(255,30,60,${hurt * .55})`); c.fillStyle = gr; c.fillRect(0, 0, W, H); }
      arNote(c, v, W, H);
    },
    down(x, y, id) { if (v?.input?.('down', x, y, id)) return; g.down(x, y, id); },
    move(x, y, p, id) { if (v?.input?.('move', x, y, id, p)) return; g.move(x, y, p, id); },
    up(x, y, id) { if (v?.input?.('up', x, y, id)) return; g.up(x, y, id); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'rift-keeper',
  title: 'Rift Keeper',
  tag: 'AR · Arcade',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 25,
  hint: 'Doorways to other worlds open round your room and lost critters tumble out. Tap a critter to catch it, then tap the doorway of its world to throw it home before it bumps into you. Peek through: the worlds swap doors! Gold door? Dive in for stars. No camera? Drag to look around.',
  creator: 'Claude',
  traits: ['theme:fantasy'],
  make,
};
