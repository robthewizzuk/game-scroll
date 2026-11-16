import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Ready } = gs.rounds;
const { HDView, Particles, pbr, rbox, surface, speckle, sun, THREE } = gs.hd;
const { approach } = gs.juice;
const {
  Group, Mesh, InstancedMesh, Object3D, SphereGeometry, CylinderGeometry, CapsuleGeometry, IcosahedronGeometry, PlaneGeometry, CircleGeometry,
  TorusGeometry, MeshBasicMaterial, PointLight, CanvasTexture, Color, DoubleSide, AdditiveBlending, SRGBColorSpace, Vector3,
} = THREE;

// Canopy Run (Next Gen): a forest ranger and a helper drone walk up through a jungle reserve to the
// rescue chopper. Logger bots have gone haywire and caged the parrots. Drag to walk; the zapper fires
// on its own at the nearest bot, or put a second thumb down and drag it to aim yourself (twin-stick).
// Walk into a cage to free its parrot. The drone has four tricks along the bottom, each with its own
// recharge: SHIELD (a dome that stays where you put it and stops bolts), DECOY (the drone flies ahead
// and the bots shoot at it), DASH (a short sprint no bolt can hit) and STRIKE (the drone zaps the
// nearest bot and singes the ones beside it).
// The game logic runs on a flat map in game units; the 3D world is 1 unit = 10 cm.
let W = 220, H = 300;
const K = .1, DOME = 30;
const TRICKS = [
  { k: 'SHIELD', col: '#58c8f8', cd: 10 }, { k: 'DECOY', col: '#f8d048', cd: 12 }, { k: 'DASH', col: '#8af078', cd: 5 }, { k: 'STRIKE', col: '#f87858', cd: 8 },
];

/* ---------- shared look (built once) ---------- */
let M = null;
function looks() {
  if (M) return M;
  const ground = surface(512, g => {          // jungle floor: dark soil, leaf litter, moss
    const { col, h, r, size: S } = g;
    col.fillStyle = '#2e2818'; col.fillRect(0, 0, S, S); h.fillStyle = '#707070'; h.fillRect(0, 0, S, S); r.fillStyle = '#e8e8e8'; r.fillRect(0, 0, S, S);
    speckle(col, S, 3000, '#22200f', 3, .5); speckle(col, S, 1500, '#5a5030', 2.5, .4);
    for (let i = 0; i < 26; i++) { const x = Math.random() * S, y = Math.random() * S, R = rnd(40, 110); for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { const gr = col.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, R); gr.addColorStop(0, '#3e5a22aa'); gr.addColorStop(1, '#3e5a2200'); col.fillStyle = gr; col.fillRect(x + ox - R, y + oy - R, R * 2, R * 2); } }
    for (let i = 0; i < 700; i++) {     // fallen leaves
      const x = Math.random() * S, y = Math.random() * S, a = Math.random() * 6.28, l = rnd(4, 9), c2 = ['#3e3a1e', '#4a3418', '#34401a', '#4e4424'][i % 4];
      for (const [c, v] of [[col, c2], [h, '#c8c8c8'], [r, '#a0a0a0']]) { c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = v; c.beginPath(); c.ellipse(0, 0, l, l * .4, 0, 0, 7); c.fill(); c.restore(); }
    }
    for (let i = 0; i < 40; i++) { const x = Math.random() * S, y = Math.random() * S; h.fillStyle = '#e0e0e0'; h.beginPath(); h.arc(x, y, rnd(3, 8), 0, 7); h.fill(); col.fillStyle = '#4a4840'; col.beginPath(); col.arc(x, y, rnd(3, 7), 0, 7); col.fill(); }   // pebbles
  }, { strength: 2 });
  const bark = surface(256, g => {
    const { col, h, r, size: S } = g;
    col.fillStyle = '#4a3a28'; col.fillRect(0, 0, S, S); r.fillStyle = '#f0f0f0'; r.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 2) { const v = 90 + Math.random() * 120 | 0; h.fillStyle = `rgb(${v},${v},${v})`; h.fillRect(x, 0, 2 + Math.random() * 3, S); col.fillStyle = Math.random() < .5 ? '#3a2c1c' : '#5a4834'; col.globalAlpha = .5; col.fillRect(x, 0, 2, S); col.globalAlpha = 1; }
    speckle(col, S, 400, '#5a7a30', 4, .4);
  }, { strength: 3 });
  const leaf = surface(256, g => {            // canopy: layered leaf shapes
    const { col, h, r, size: S } = g;
    col.fillStyle = '#1e4a18'; col.fillRect(0, 0, S, S); h.fillStyle = '#404040'; h.fillRect(0, 0, S, S); r.fillStyle = '#b0b0b0'; r.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * S, y = Math.random() * S, a = Math.random() * 6.28, l = rnd(10, 22), c2 = ['#2e6a22', '#3c7e2a', '#24561c', '#4a8a30'][i % 4];
      for (const [c, v] of [[col, c2], [h, `rgb(${150 + i % 100},${150 + i % 100},${150 + i % 100})`], [r, '#909090']]) { c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = v; c.beginPath(); c.ellipse(0, 0, l, l * .45, 0, 0, 7); c.fill(); c.restore(); }
    }
  }, { strength: 2.5 });
  // fern frond card with alpha
  const fc = document.createElement('canvas'); fc.width = 128; fc.height = 256; const fx = fc.getContext('2d');
  fx.strokeStyle = '#2a4a18'; fx.lineWidth = 3; fx.beginPath(); fx.moveTo(64, 256); fx.quadraticCurveTo(70, 120, 60, 6); fx.stroke();
  for (let y = 20; y < 246; y += 9) { const w = 50 * Math.sin((y / 256) * Math.PI) + 6, c = y % 18 ? '#3e7a2a' : '#4a8a32'; fx.fillStyle = c; for (const sd of [-1, 1]) { fx.beginPath(); fx.moveTo(64, y); fx.quadraticCurveTo(64 + sd * w * .6, y - 10, 64 + sd * w, y - 2); fx.quadraticCurveTo(64 + sd * w * .5, y + 4, 64, y + 6); fx.fill(); } }
  const fern = new CanvasTexture(fc); fern.colorSpace = SRGBColorSpace;
  const lc = document.createElement('canvas'); lc.width = lc.height = 64; const lx = lc.getContext('2d'), lg = lx.createLinearGradient(0, 0, 0, 64);
  lg.addColorStop(0, '#fff'); lg.addColorStop(1, '#000'); lx.fillStyle = lg; lx.fillRect(0, 0, 64, 64);
  const hx = lx.createLinearGradient(0, 0, 64, 0); hx.addColorStop(0, '#000'); hx.addColorStop(.5, '#0000'); hx.addColorStop(1, '#000'); lx.globalCompositeOperation = 'multiply'; lx.fillStyle = '#fff'; lx.fillRect(0, 0, 64, 64); lx.globalCompositeOperation = 'source-over'; lx.fillStyle = hx; lx.fillRect(0, 0, 64, 64);
  const lit = (r, g, b) => new MeshBasicMaterial({ color: new Color(r, g, b) });
  const m = {
    ground: pbr('#ffffff', { tex: ground.repeat(10, 10), rough: 1 }),
    bark: pbr('#ffffff', { tex: bark.repeat(1, 3), rough: 1 }), leaf: pbr('#ffffff', { tex: leaf.repeat(2, 2), rough: 1, sheen: .6, sheenColor: new Color('#a8e070') }),
    fern: pbr('#ffffff', { map: fern, alphaTest: .5, side: DoubleSide, rough: .7 }),
    rock: pbr('#4a5044', { rough: .8 }),
    shaft: new MeshBasicMaterial({ color: new Color('#fff0c0').multiplyScalar(.06), alphaMap: new CanvasTexture(lc), transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false }),
    // the ranger
    shirt: pbr('#c8b078', { rough: .85 }), trousers: pbr('#5a6a3a', { rough: .9 }), boot: pbr('#4a3020', { rough: .5, clear: .3 }),
    skin: pbr('#c88a5a', { rough: .55 }), hat: pbr('#8a6a3a', { rough: .8 }), band: pbr('#d84a2a', { rough: .6 }), pack: pbr('#3a6a8a', { rough: .7 }),
    zap: pbr('#f0c020', { rough: .35, metal: .3, clear: .6 }), dark: pbr('#1e2226', { rough: .4, metal: .7 }), tip: pbr('#70f0ff', { glow: 5 }),
    // the drone
    shell: pbr('#b8c0c4', { rough: .5, clear: .3 }), eye: pbr('#70f0ff', { glow: 5 }), eyeD: pbr('#ffd040', { glow: 6 }),
    // logger bots
    botA: pbr('#e8862a', { rough: .45, metal: .3, clear: .5 }), botB: pbr('#d8c020', { rough: .45, metal: .3, clear: .5 }), steel: pbr('#70787e', { rough: .35, metal: .9 }),
    botEye: pbr('#ff3828', { glow: 6 }), off: pbr('#30201c', { rough: .6 }),
    // cages and parrots
    cage: pbr('#8a8e90', { rough: .4, metal: .9 }), crate: pbr('#7a5a34', { rough: .9 }),
    parrot: pbr('#e83a2a', { rough: .6 }), wing: pbr('#2a78e0', { rough: .6 }), beak: pbr('#f8d040', { rough: .5 }),
    // chopper + pad
    pad: pbr('#5a5e58', { rough: .7 }), paint: pbr('#f0f0e8', { rough: .5 }), heli: pbr('#e8762a', { rough: .35, metal: .3, clear: .7 }), heliW: pbr('#f0f0ea', { rough: .35, clear: .7 }),
    glass: pbr('#90c8e8', { rough: .05, metal: .9, clear: 1, glow: .15 }), red: pbr('#ff3020', { glow: 5 }), greenL: pbr('#30ff60', { glow: 5 }),
    blur: new MeshBasicMaterial({ color: '#202020', transparent: true, opacity: .25, depthWrite: false, side: DoubleSide }),
    tracer: lit(1.6, 5, 6), bolt: lit(6, 2.4, .6), beam: lit(6, 5, 2.4), ring: lit(.6, 1.6, 2), ringD: lit(2, 1.5, .4),
    dome: new MeshBasicMaterial({ color: new Color('#58c8f8').multiplyScalar(.4), transparent: true, opacity: .16, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false }),
  };
  // organic canopy blobs: icospheres pushed in and out
  const blobs = [0, 1, 2].map(k => { const g = new IcosahedronGeometry(1, 2), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const v = new Vector3().fromBufferAttribute(p, i), n = 1 + .18 * Math.sin(v.x * 5 + k) * Math.cos(v.y * 4 - k) + .08 * Math.sin(v.z * 9); p.setXYZ(i, v.x * n, v.y * n * .8, v.z * n); } g.computeVertexNormals(); return g; });
  M = { m, blobs, G: { ball: new SphereGeometry(1, 20, 14), half: new SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), cyl: new CylinderGeometry(1, 1, 1, 16), trunk: new CylinderGeometry(.7, 1, 1, 12, 4), pill: new CapsuleGeometry(1, 1, 5, 12), plane: new PlaneGeometry(1, 1), disc: new CircleGeometry(1, 32), torus: new TorusGeometry(1, .05, 8, 32), ring: new TorusGeometry(1, .012, 6, 48), rock: new IcosahedronGeometry(1, 1) } };
  return M;
}
function P(geo, mat, o = {}) {
  const m = new Mesh(geo, mat), s = o.s ?? 1;
  m.scale.set(o.sx ?? s, o.sy ?? s, o.sz ?? s); m.position.set(o.x || 0, o.y || 0, o.z || 0); m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  m.castShadow = o.cast !== false; m.receiveShadow = true; return m;
}
const B = (w, h, d, mat, o = {}) => P(rbox(w, h, d, o.r ?? Math.min(w, h, d) * .25), mat, o);
function shadow(g, s) { const sh = new Mesh(looks().G.disc, new MeshBasicMaterial({ color: '#000', transparent: true, opacity: .35, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = .02; sh.scale.setScalar(s); g.add(sh); }

// The ranger: khaki shirt, wide hat with a red band, a blue pack and a yellow zapper.
function makeRanger() {
  const { m, G } = looks(), g = new Group(), body = new Group(); g.add(body); body.position.y = .86;
  const legs = [-1, 1].map(k => { const l = new Group(); l.position.set(k * .11, .86, 0); l.add(P(G.pill, m.trousers, { sx: .085, sy: .28, sz: .095, y: -.36 }), B(.13, .11, .25, m.boot, { y: -.8, z: .04 })); g.add(l); return l; });
  body.add(P(G.pill, m.shirt, { sx: .19, sy: .2, sz: .14, y: .3 }), B(.36, .06, .27, m.boot, { y: .03, r: .02 }), B(.28, .36, .15, m.pack, { y: .34, z: -.2, r: .05 }));
  body.add(P(G.ball, m.skin, { s: .125, y: .72 }), P(G.cyl, m.hat, { sx: .27, sy: .025, sz: .27, y: .82 }), P(G.cyl, m.hat, { sx: .14, sy: .13, sz: .14, y: .88 }), P(G.cyl, m.band, { sx: .145, sy: .035, sz: .145, y: .845, cast: false }));
  const arms = new Group(); body.add(arms);
  for (const k of [-1, 1]) arms.add(P(G.pill, m.shirt, { sx: .06, sy: .15, sz: .06, x: k * .2, y: .38, z: .15, rx: -1.2 }), P(G.ball, m.skin, { s: .05, x: k * .13, y: .3, z: .36 }));
  const zap = new Group(); zap.position.set(0, .3, .36); arms.add(zap);
  zap.add(B(.09, .1, .34, m.zap, { z: .06 }), B(.05, .05, .2, m.dark, { z: .3 }), B(.05, .12, .05, m.dark, { y: -.1 }), P(G.torus, m.dark, { s: .05, z: .28 }), P(G.torus, m.dark, { s: .05, z: .34 }), P(G.ball, m.tip, { s: .035, z: .42, cast: false }));
  shadow(g, .42);
  return { g, body, legs, arms };
}
// The helper drone: a white quad with a glowing eye.
function makeDrone() {
  const { m, G } = looks(), g = new Group();
  g.add(B(.26, .1, .26, m.shell, { r: .04 }), P(G.ball, m.dark, { sx: .09, sy: .07, sz: .09, y: -.06 }));
  const eye = P(G.ball, m.eye, { s: .04, y: -.01, z: .135, cast: false }); g.add(eye);
  for (const [kx, kz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(B(.22, .025, .04, m.dark, { x: kx * .16, z: kz * .16, ry: kx * kz > 0 ? -Math.PI / 4 : Math.PI / 4 }));
    const r = new Mesh(G.disc, m.blur); r.rotation.x = -Math.PI / 2; r.position.set(kx * .25, .04, kz * .25); r.scale.setScalar(.13); g.add(r);
  }
  return { g, eye };
}
// Logger bots: 'scout' walks on two legs, 'hauler' is bigger and carries a saw, 'turret' sits on a tripod.
function makeBot(kind) {
  const { m, G } = looks(), g = new Group(), s = kind === 'hauler' ? 1.3 : 1;
  if (kind === 'turret') {
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + .5; g.add(P(G.cyl, m.steel, { sx: .035, sy: .95, sz: .035, x: Math.cos(a) * .3, y: .42, z: Math.sin(a) * .3, rz: Math.cos(a) * .6, rx: -Math.sin(a) * .6 })); }
    g.add(P(G.cyl, m.dark, { sx: .11, sy: .12, sz: .11, y: .82 }));
    const head = new Group(); head.position.y = .98; g.add(head);
    head.add(B(.36, .24, .42, m.botB, { r: .06 }), B(.37, .05, .43, m.dark, { y: -.07, r: .01, cast: false }));
    for (const k of [-1, 1]) head.add(P(G.cyl, m.steel, { sx: .04, sy: .46, sz: .04, x: k * .09, z: .4, rx: Math.PI / 2 }));
    const eye = P(G.ball, m.botEye, { s: .05, y: .07, z: .215, cast: false }); head.add(eye);
    shadow(g, .5); g.userData = { aim: head, eye }; return g;
  }
  const legs = [-1, 1].map(k => { const l = new Group(); l.position.set(k * .15 * s, .6 * s, 0); l.add(B(.08 * s, .46 * s, .1 * s, m.steel, { y: -.25 * s }), B(.15 * s, .09 * s, .28 * s, m.dark, { y: -.55 * s, z: .04 })); g.add(l); return l; });
  const body = new Group(); body.position.y = .6 * s; g.add(body);
  body.add(B(.48 * s, .42 * s, .36 * s, kind === 'hauler' ? m.botB : m.botA, { y: .27 * s, r: .08 }), B(.49 * s, .05 * s, .37 * s, m.dark, { y: .12 * s, r: .01, cast: false }));
  body.add(B(.3 * s, .16 * s, .26 * s, m.steel, { y: .58 * s, r: .04 }), P(G.cyl, m.steel, { sx: .012, sy: .22 * s, sz: .012, x: .1 * s, y: .76 * s }));
  const eye = B(.2 * s, .05 * s, .02, m.botEye, { y: .59 * s, z: .135 * s, r: .008, cast: false }); body.add(eye);
  const gun = new Group(); gun.position.set(.31 * s, .3 * s, .1 * s); body.add(gun);
  gun.add(B(.09, .09, .5, m.dark, { z: .12 }), P(G.cyl, m.steel, { sx: .05, sy: .1, sz: .05, z: .4, rx: Math.PI / 2 }));
  let saw = null;
  if (kind === 'hauler') { body.add(B(.1, .1, .4, m.dark, { x: -.36 * s, y: .3 * s, z: .12 })); saw = P(G.cyl, m.steel, { sx: .24, sy: .03, sz: .24, x: -.36 * s, y: .3 * s, z: .46, rz: Math.PI / 2 }); body.add(saw); }
  shadow(g, .42 * s);
  g.userData = { legs, body, aim: gun, eye, saw }; g.rotation.order = 'YXZ';
  return g;
}
function makeCage() {
  const { m, G } = looks(), g = new Group(), bars = new Group(); g.add(bars);
  g.add(B(.92, .1, .92, m.crate, { y: .05, r: .02 }));
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; bars.add(P(G.cyl, m.cage, { sx: .018, sy: .9, sz: .018, x: Math.cos(a) * .38, y: .55, z: Math.sin(a) * .38 })); }
  bars.add(P(G.cyl, m.cage, { sx: .42, sy: .05, sz: .42, y: 1.02 }), P(G.torus, m.cage, { s: .38, rx: Math.PI / 2, y: .55 }));
  const parrot = new Group(); parrot.position.y = .12; g.add(parrot);
  parrot.add(P(G.pill, m.parrot, { sx: .085, sy: .075, sz: .085, y: .2, rx: .25 }), P(G.ball, m.parrot, { s: .07, y: .38, z: .03 }), P(G.ball, m.beak, { sx: .025, sy: .03, sz: .04, y: .365, z: .1 }), B(.06, .02, .22, m.wing, { y: .09, z: -.14, rx: -.5 }));
  const wings = [-1, 1].map(k => { const w = new Group(); w.position.set(k * .07, .27, 0); w.add(B(.2, .02, .13, m.wing, { x: k * .1 })); w.rotation.z = -k * 1.35; parrot.add(w); return w; });
  g.userData = { bars, parrot, wings }; return g;
}
function makeChopper() {
  const { m, G } = looks(), g = new Group();
  g.add(P(G.cyl, m.pad, { sx: 5, sy: .25, sz: 5, y: .12 }), P(G.torus, m.paint, { s: 4, rx: Math.PI / 2, y: .26, cast: false }));
  for (const [x, z, w, d] of [[-1, 0, .35, 2.4], [1, 0, .35, 2.4], [0, 0, 2, .35]]) g.add(P(G.plane, m.paint, { sx: w, sy: d, x, y: .26, z, rx: -Math.PI / 2, cast: false }));
  const lights = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, l = P(G.ball, m.greenL, { s: .1, x: Math.cos(a) * 4.6, y: .3, z: Math.sin(a) * 4.6, cast: false }); g.add(l); lights.push(l); }
  const h = new Group(); h.position.set(0, .25, -.5); g.add(h);
  h.add(P(G.pill, m.heli, { sx: 1.3, sy: 1.6, sz: 1.3, y: 1.4, rx: Math.PI / 2 }), P(G.ball, m.glass, { sx: 1.05, sy: .9, sz: 1, y: 1.55, z: 1.3 }), B(2.64, .3, 1.2, m.heliW, { y: 1.4, z: -.4, r: .1 }));
  h.add(P(G.cyl, m.heli, { sx: .3, sy: 4.5, sz: .25, y: 1.7, z: -3.6, rx: Math.PI / 2 - .08 }), B(.1, 1.2, .8, m.heliW, { y: 2.3, z: -5.7 }));
  for (const k of [-1, 1]) h.add(P(G.cyl, m.dark, { sx: .06, sy: 3.2, sz: .06, x: k * .9, y: .15, rx: Math.PI / 2 }), P(G.cyl, m.dark, { sx: .04, sy: .6, sz: .04, x: k * .8, y: .45, z: .6, rz: k * .3 }), P(G.cyl, m.dark, { sx: .04, sy: .6, sz: .04, x: k * .8, y: .45, z: -.7, rz: k * .3 }));
  const beacon = P(G.ball, m.red, { s: .12, y: 2.85, cast: false }); h.add(beacon);
  const rotor = new Group(); rotor.position.y = 2.75; h.add(rotor);
  rotor.add(P(G.cyl, m.dark, { sx: .12, sy: .3, sz: .12 }), B(7.5, .05, .3, m.dark, { cast: false }), B(.3, .05, 7.5, m.dark, { cast: false }));
  const disc = new Mesh(G.disc, m.blur); disc.scale.setScalar(3.8); disc.rotation.x = -Math.PI / 2; disc.position.y = 2.8; h.add(disc);
  g.userData = { rotor, lights, beacon }; return g;
}

function make(api) {
  const ready = new Ready({ eat: false });
  let p, trees, foes, downs, shots, bolts, cages, pops, cam, L, stage, score, t, msg, stick, aimF, dead, cleared, fireT, hurtT, flashT;
  let cd, dome, decoy, dash, beam, dr;
  let v, sunL, add, dust, smoke, ranger, drone, world, chopper, foeMeshes, trIM, boIM, muzzle, domeM, ringM, ringD, beamM, built;
  const barH = 34, UP = new Vector3(0, 1, 0), dir = new Vector3();
  function setup() {
    if (v) return;
    const { m, G } = looks();
    v = new HDView({ bg: '#33503e', fog: .022, env: .25, sky: '#b8d8f0', ground: '#2a3418', amb: .35, fov: 46 });
    v.exposure = .95; v.bloom = .6;
    // sun through the canopy: light beams in the humid air between the trunks (high and ultra), and a film finish
    v.beams = { density: .03, strength: .8, glow: .6 }; v.film = { halation: .3, grain: 1.3, fringe: .015 };
    sunL = sun('#ffe4b0', 4.6, 14, [-.55, 1, .5]); v.scene.add(sunL, sunL.target); v.onTier(T => sunL.setTier(T));
    const gr = P(G.plane, m.ground, { sx: 200, sy: 200, rx: -Math.PI / 2, cast: false }); v.scene.add(gr); v.ground = gr;
    add = new Particles(v, { max: 360, additive: true }); smoke = new Particles(v, { max: 140, additive: false }); dust = new Particles(v, { max: 120, additive: true });
    ranger = makeRanger(); drone = makeDrone(); v.scene.add(ranger.g, drone.g);
    muzzle = new PointLight('#a0f0ff', 0, 6, 1.6); v.scene.add(muzzle);
    trIM = new InstancedMesh(G.pill, m.tracer, 40); boIM = new InstancedMesh(G.pill, m.bolt, 60); trIM.frustumCulled = boIM.frustumCulled = false; v.scene.add(trIM, boIM);
    domeM = new Mesh(G.half, m.dome); domeM.scale.setScalar(DOME * K); ringM = P(G.ring, m.ring, { s: DOME * K, rx: Math.PI / 2, y: .05, cast: false }); ringD = P(G.ring, m.ringD, { s: 1, rx: Math.PI / 2, y: .05, cast: false });
    beamM = new Mesh(G.cyl, m.beam); domeM.visible = ringM.visible = ringD.visible = beamM.visible = false; v.scene.add(domeM, ringM, ringD, beamM);
    // sun shafts slanting through the canopy, near the camera
    v.shafts = []; for (let i = 0; i < 6; i++) { const s = new Mesh(G.plane, m.shaft); s.scale.set(rnd(1.5, 3), 22, 1); s.rotation.set(0, rnd(-.5, .5), .45); v.scene.add(s); v.shafts.push({ m: s, ox: rnd(-12, 12), oz: rnd(-14, 4) }); }
  }
  function build() {
    setup();
    L = 1300 + stage * 260; trees = []; foes = []; downs = []; shots = []; bolts = []; cages = []; pops = [];
    for (let i = 0; i < L / 22; i++) { const r = rnd(9, 16), tr = { x: rnd(r + 14, W - r - 14), y: rnd(80, L - 60), r }; if (Math.abs(tr.x - W / 2) < 30 && tr.y > L - 140) continue; if (trees.some(o => Math.hypot(o.x - tr.x, o.y - tr.y) < o.r + r + 15)) continue; trees.push(tr); }
    const nc = 2 + Math.min(2, stage);
    for (let i = 0; i < nc; i++) { const cg = { x: rnd(26, W - 26), y: 110 + (L - 330) * (i + .2 + Math.random() * .6) / nc, open: false, t: 0 }; cages.push(cg); trees = trees.filter(tr => Math.hypot(tr.x - cg.x, tr.y - cg.y) > tr.r + 22); }
    const n = 6 + stage * 3;
    for (let i = 0; i < n; i++) {
      const y = 80 + (L - 260) * (i + Math.random() * .6) / n, kind = stage > 0 && Math.random() < .2 + stage * .04 ? 'hauler' : Math.random() < .2 ? 'turret' : 'scout', hp = kind === 'hauler' ? 9 : kind === 'turret' ? 6 : 3;
      foes.push({ x: rnd(20, W - 20), y, kind, hp, max: hp, alert: 0, cd: rnd(.5, 1.5), dir: Math.random() < .5 ? 1 : -1, flash: 0, walk: 0, aim: 0 });
    }
    p = { x: W / 2, y: L - 50, hp: 100, face: -Math.PI / 2, walk: 0 }; cam = p.y; cleared = 0; fireT = 0; hurtT = 9; flashT = 0;
    cd = [0, 0, 0, 0]; dome = decoy = dash = beam = null; dr = { x: p.x + 10, y: p.y + 3, h: 1.9 };
    msg = { txt: `ZONE ${stage + 1}`, sub: 'Reach the chopper', l: 2.2 };
    buildWorld(); v.cut();
  }
  function buildWorld() {
    const { m, G, blobs } = looks(), mx = new Object3D();
    if (world) { v.scene.remove(world); world.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); }
    world = new Group(); v.scene.add(world);
    // trees in the play area + a dense wall of jungle beyond both edges
    // (where you play the trees are palms: a fan of fronds you can see through, so nothing hides the bots)
    const all = trees.map(tr => ({ x: tr.x, y: tr.y, s: tr.r / 12 }));
    for (let y = -80; y < L + 120; y += 22) for (const side of [-1, 1]) all.push({ x: side < 0 ? rnd(-40, -14) : W + rnd(14, 40), y: y + rnd(-8, 8), s: rnd(1.3, 1.9), wall: true });
    for (let x = -40; x < W + 40; x += 24) all.push({ x: x + rnd(-6, 6), y: rnd(-50, -10), s: rnd(1.3, 1.8), wall: true });
    const ferns = [];
    const fernN = Math.min(1600, (L / 6 | 0) * 3);
    for (let i = 0; i < fernN; i++) ferns.push({ x: Math.random() < .7 ? rnd(-10, W + 10) : rnd(-40, W + 40), y: rnd(-40, L + 40), s: rnd(.6, 1.4), a: Math.random() * 3 });
    // Instanced in 25 m strips along the map, so strips off screen are skipped (frustum culling)
    const fernGeo = new PlaneGeometry(1, 1); fernGeo.translate(0, .5, 0); const FR = 5, TOP = 7;   // a fern = 5 fronds fanned out, a palm top = 7 big ones
    const CH = 250;
    for (let y0 = -100; y0 < L + 150; y0 += CH) {
      const tr = all.filter(o => o.y >= y0 && o.y < y0 + CH), fe = ferns.filter(o => o.y >= y0 && o.y < y0 + CH);
      if (tr.length) {
        const trunks = new InstancedMesh(G.trunk, m.bark, tr.length), wall = tr.filter(o => o.wall), palms = tr.filter(o => !o.wall);
        tr.forEach((o, i) => {
          const s = o.s; o.h = 2.2 + s * 1.3;
          mx.position.set(o.x * K, o.h / 2, o.y * K); mx.rotation.set(rnd(-.05, .05), Math.random() * 6, rnd(-.05, .05)); mx.scale.set((o.wall ? .26 : .2) * s, o.h, (o.wall ? .26 : .2) * s); mx.updateMatrix(); trunks.setMatrixAt(i, mx.matrix);
        });
        trunks.castShadow = trunks.receiveShadow = true; trunks.computeBoundingSphere(); world.add(trunks);
        if (wall.length) {
          const crowns = blobs.map(b => new InstancedMesh(b, m.leaf, wall.length));
          wall.forEach((o, i) => crowns.forEach((cm, k) => { const s = o.s, a = k * 2.1 + i, d = k ? 1.1 * s : 0; mx.position.set(o.x * K + Math.cos(a) * d, o.h + (k ? -.4 : .4) * s, o.y * K + Math.sin(a) * d); mx.rotation.set(0, a, 0); mx.scale.setScalar((k ? 1.05 : 1.4) * s); mx.updateMatrix(); cm.setMatrixAt(i, mx.matrix); }));
          for (const cm of crowns) { cm.castShadow = cm.receiveShadow = true; cm.computeBoundingSphere(); world.add(cm); }
        }
        if (palms.length) {
          const tops = new InstancedMesh(fernGeo, m.fern, palms.length * TOP); tops.castShadow = tops.receiveShadow = true;
          palms.forEach((o, i) => { const a0 = Math.random() * 6; for (let k = 0; k < TOP; k++) { mx.position.set(o.x * K, o.h - .12, o.y * K); mx.rotation.set(0, a0 + k * Math.PI * 2 / TOP + rnd(-.15, .15), 0); mx.rotateX(rnd(.95, 1.4)); mx.scale.set(o.s * .8, o.s * rnd(1.3, 1.7), 1); mx.updateMatrix(); tops.setMatrixAt(i * TOP + k, mx.matrix); } });
          tops.computeBoundingSphere(); world.add(tops);
        }
      }
      if (fe.length) {
        const fi = new InstancedMesh(fernGeo, m.fern, fe.length * FR); fi.receiveShadow = true;
        fe.forEach((o, i) => { for (let k = 0; k < FR; k++) { mx.position.set(o.x * K, .02, o.y * K); mx.rotation.set(0, o.a + k * Math.PI * 2 / FR + rnd(-.2, .2), 0); mx.rotateX(rnd(.7, 1.15)); mx.scale.set(o.s * .45, o.s * rnd(.8, 1.1), 1); mx.updateMatrix(); fi.setMatrixAt(i * FR + k, mx.matrix); } });
        fi.computeBoundingSphere(); world.add(fi);
      }
    }
    // mossy rocks
    const rocks = new InstancedMesh(G.rock, m.rock, 60); rocks.castShadow = rocks.receiveShadow = true;
    for (let i = 0; i < 60; i++) { mx.position.set(rnd(0, W) * K, 0, rnd(0, L) * K); mx.rotation.set(rnd(0, 3), rnd(0, 3), 0); mx.scale.set(rnd(.3, .7), rnd(.2, .45), rnd(.3, .7)); mx.updateMatrix(); rocks.setMatrixAt(i, mx.matrix); }
    world.add(rocks);
    v.ground.position.set(W * K / 2, 0, L * K / 2); v.ground.scale.set(W * K + 160, L * K + 160, 1);
    for (const tx of [m.ground.map, m.ground.normalMap, m.ground.roughnessMap]) tx.repeat.set((W * K + 160) / 5, (L * K + 160) / 5);   // ~5 m per tile
    chopper = makeChopper(); chopper.position.set(W / 2 * K, 0, 26 * K); world.add(chopper);
    foeMeshes = new Map(); for (const f of foes) { const g = makeBot(f.kind); g.position.set(f.x * K, 0, f.y * K); world.add(g); foeMeshes.set(f, g); }
    for (const cg of cages) { cg.m = makeCage(); cg.m.position.set(cg.x * K, 0, cg.y * K); cg.m.rotation.y = rnd(-.6, .6); world.add(cg.m); }
    built = true; v.warmed = false;
  }
  function blocked(x, y, r) { for (const tr of trees) if (Math.hypot(x - tr.x, y - tr.y) < tr.r + r) return tr; return null; }
  function push(o, r) { for (const tr of trees) { const dx = o.x - tr.x, dy = o.y - tr.y, d = Math.hypot(dx, dy), m = tr.r + r; if (d < m && d > 0) { o.x = tr.x + dx / d * m; o.y = tr.y + dy / d * m; } } o.x = clamp(o.x, r, W - r); }
  function burst(x, y, h, n, col, sp = 3) { for (let i = 0; i < n; i++) add.emit({ x: x * K, y: h, z: y * K, vx: rnd(-sp, sp), vy: rnd(0, sp * 1.2), vz: rnd(-sp, sp), life: rnd(.2, .45), size: .035, col, grav: 9, floor: .02 }); }
  function pop(x, y, txt, col = '#ffe9a8') { pops.push({ x, y, txt, col, l: 1.1 }); }
  function hurt(dmg) {
    hurtT = 0; p.hp -= dmg; haptic('heavy'); sfx(120, .12, 'sawtooth', .05, -40);
    if (p.hp <= 0) { p.hp = 0; dead = .01; stick = aimF = null; haptic('error'); msg = { txt: 'RANGER DOWN', l: 9 }; sfx(90, .6, 'sawtooth', .05, -50); }
  }
  function hitBot(f, dmg, vx, vy) {
    if (f.hp <= 0) return;
    f.hp -= dmg; f.flash = .1; f.alert = 3;
    if (f.hp > 0) return;
    const pts = f.kind === 'hauler' ? 30 : f.kind === 'turret' ? 20 : 10; score += pts; api.score(score); pop(f.x, f.y, '+' + pts);
    sfx(200, .1, 'square', .05, -100); haptic('light');
    const g = foeMeshes.get(f); g.userData.eye.material = looks().m.off; downs.push({ m: g, t: 0, f, dir: Math.atan2(vx, vy) });
    burst(f.x, f.y, 1, 14, [2, 5, 6], 4);
    for (let i = 0; i < 12; i++) smoke.emit({ x: f.x * K, y: .5, z: f.y * K, vx: rnd(-1, 1), vy: rnd(.3, 1), vz: rnd(-1, 1), life: 1.2, size: .3, grow: 2, col: [.5, .48, .4], a: .3 });
  }
  function shoot(a) {
    shots.push({ x: p.x, y: p.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, l: .6 });
    fireT = .22; sfx(1100, .03, 'triangle', .03, -500); flashT = .05; p.face = a;
    const mxp = (p.x + Math.cos(a) * 9) * K, mzp = (p.y + Math.sin(a) * 9) * K;
    muzzle.position.set(mxp, 1.2, mzp); muzzle.intensity = 5;
    for (let i = 0; i < 4; i++) add.emit({ x: mxp, y: 1.2, z: mzp, vx: Math.cos(a) * rnd(2, 5) + rnd(-1, 1), vy: rnd(-.3, .8), vz: Math.sin(a) * rnd(2, 5) + rnd(-1, 1), life: rnd(.05, .12), size: .02, col: [1.5, 5, 6] });
  }
  // The drone's four tricks. Each has its own recharge; a trick that isn't ready just beeps.
  function trick(i) {
    if (dead || cleared) return;
    if (cd[i] > 0) { sfx(150, .05, 'square', .03); return; }
    const way = stick && stick.m > .1 ? stick.a : p.face, col = new Color(TRICKS[i].col);
    if (i === 0) dome = { x: p.x, y: p.y, l: 4 };
    else if (i === 1) decoy = { x: clamp(p.x + Math.cos(way) * 50, 14, W - 14), y: clamp(p.y + Math.sin(way) * 50, 30, L - 14), l: 5 };
    else if (i === 2) dash = { a: way, l: .5 };
    else {
      let best = null, bd = 170; for (const f of foes) { const d = Math.hypot(f.x - p.x, f.y - p.y); if (f.hp > 0 && d < bd) { best = f; bd = d; } }
      if (!best) { sfx(150, .05, 'square', .03); pop(p.x, p.y, 'NO BOT NEAR', '#ffb0a0'); return; }
      beam = { x: best.x, y: best.y, l: .16 };
      for (const f of foes) if (f !== best && Math.hypot(f.x - best.x, f.y - best.y) < 36) hitBot(f, 3, f.x - best.x, f.y - best.y);
      hitBot(best, 6, best.x - p.x, best.y - p.y); foes = foes.filter(f => f.hp > 0);
      burst(best.x, best.y, 1.2, 26, [6, 5, 2], 5); sfx(1600, .18, 'sawtooth', .05, -1200);
    }
    cd[i] = TRICKS[i].cd; haptic('medium'); sfx(300 + i * 150, .08, 'triangle', .04, 300);
    for (let k = 0; k < 18; k++) add.emit({ x: p.x * K + rnd(-.3, .3), y: rnd(.2, 1.8), z: p.y * K + rnd(-.3, .3), vy: rnd(.3, 1.2), life: rnd(.4, .8), size: .03, col: [col.r * 4, col.g * 4, col.b * 4] });
  }
  const self = {
    reset() { stage = 0; score = 0; t = 0; dead = 0; stick = null; aimF = null; ready.reset(); build(); },
    resize(w, h) { if (w === W && h === H) return; W = w; H = h; if (p) build(); },
    update(dt) {
      t += dt; flashT = Math.max(0, flashT - dt); muzzle.intensity *= Math.pow(.001, dt);
      add.update(dt); smoke.update(dt); dust.update(dt);
      for (const d of downs) d.t += dt; downs = downs.filter(d => { if (d.t > 4) { world.remove(d.m); return false; } return true; });
      for (const cg of cages) if (cg.open) cg.t += dt;
      for (const o of pops) o.l -= dt; pops = pops.filter(o => o.l > 0);
      if (!ready.update(dt)) return;
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 2) api.over(); return; }
      if (cleared) { cleared += dt; p.y -= 40 * dt; p.walk += 40 * dt * .12; dr.x = approach(dr.x, p.x + 10, 5, dt); dr.y = approach(dr.y, p.y + 3, 5, dt); if (cleared > 2) { stage++; build(); } return; }
      hurtT += dt; for (let i = 0; i < 4; i++) cd[i] = Math.max(0, cd[i] - dt);
      if (dome && (dome.l -= dt) <= 0) dome = null;
      if (decoy && (decoy.l -= dt) <= 0) decoy = null;
      if (beam && (beam.l -= dt) <= 0) beam = null;
      if (dash) {
        p.x += Math.cos(dash.a) * 230 * dt; p.y += Math.sin(dash.a) * 230 * dt; p.walk += 230 * dt * .12; if (!aimF) p.face = dash.a;
        if (Math.random() < dt * 40) dust.emit({ x: p.x * K, y: .1, z: p.y * K, vy: .5, vx: rnd(-.5, .5), vz: rnd(-.5, .5), life: .5, size: .05, col: [1.6, 3, 1] });
        if ((dash.l -= dt) <= 0) dash = null;
      } else if (stick && stick.m > .05) { const sp = 66 * stick.m; p.x += Math.cos(stick.a) * sp * dt; p.y += Math.sin(stick.a) * sp * dt; p.walk += sp * dt * .12; if (!aimF) p.face = stick.a; }
      push(p, 6); p.y = clamp(p.y, 20, L - 10);
      cam = approach(cam, p.y, 5, dt);
      // the drone: beside the ranger, over the dome it is holding up, or out ahead as the decoy
      const rest = decoy || dome || { x: p.x - Math.cos(p.face) * 3 - Math.sin(p.face) * 10, y: p.y - Math.sin(p.face) * 3 + Math.cos(p.face) * 10 }, kd = Math.min(1, dt * (decoy ? 9 : 5));
      dr.x += (rest.x - dr.x) * kd; dr.y += (rest.y - dr.y) * kd; dr.h += ((decoy ? 1.5 : dome ? 3.4 : 1.9) - dr.h) * kd;
      for (const cg of cages) if (!cg.open && Math.hypot(cg.x - p.x, cg.y - p.y) < 14) {
        cg.open = true; cg.t = 0; score += 25; api.score(score); pop(cg.x, cg.y, 'FREED +25', '#a8f0ff'); haptic('success'); sfx(880, .1, 'triangle', .05, 500); sfx(1320, .22, 'triangle', .04, 400);
        burst(cg.x, cg.y, 1, 18, [5, 1.2, .8], 3);
      }
      if (p.y < 44) { cleared = .01; stick = aimF = null; const bonus = Math.round(p.hp) + 50; score += bonus; api.score(score); haptic('success'); sfx(660, .5, 'square', .05, 400); msg = { txt: `LIFT OFF +${bonus}`, sub: 'Next zone', l: 2 }; return; }
      fireT -= dt;
      if (fireT <= 0) {
        if (aimF && aimF.m > .25) shoot(aimF.a);   // twin-stick: fire where the second thumb points
        else if (!aimF) { let best = null, bd = 125; for (const f of foes) { const d = Math.hypot(f.x - p.x, f.y - p.y); if (d < bd) { best = f; bd = d; } } if (best) shoot(Math.atan2(best.y - p.y, best.x - p.x)); }
      }
      for (const s of shots) {
        s.l -= dt; s.x += s.vx * dt; s.y += s.vy * dt;
        if (blocked(s.x, s.y, 0)) { s.l = 0; burst(s.x, s.y, 1.2, 6, [1, 3, 3.5]); }
        for (const f of foes) if (f.hp > 0 && Math.hypot(f.x - s.x, f.y - s.y) < 8) { s.l = 0; burst(s.x, s.y, 1.2, 8, [2, 5, 6]); hitBot(f, 1, s.vx, s.vy); break; }
      }
      shots = shots.filter(s => s.l > 0); foes = foes.filter(f => f.hp > 0);
      for (const f of foes) {
        // a bot goes for the decoy while it is in reach
        const dd = decoy ? Math.hypot(decoy.x - f.x, decoy.y - f.y) : 1e9, lure = dd < 160, tg = lure ? decoy : p, d = lure ? dd : Math.hypot(p.x - f.x, p.y - f.y);
        f.flash = Math.max(0, f.flash - dt); f.aim = Math.atan2(tg.x - f.x, tg.y - f.y);
        if (d < 135) f.alert = 3; else f.alert = Math.max(0, f.alert - dt);
        let mv = 0;
        if (f.kind !== 'turret') {
          if (f.alert > 0) { const a = Math.atan2(tg.y - f.y, tg.x - f.x), want = d > 80 ? 1 : d < 50 ? -1 : 0, sp = f.kind === 'hauler' ? 18 : 30; f.x += Math.cos(a) * sp * want * dt; f.y += Math.sin(a) * sp * want * dt; mv = Math.abs(want) * sp; }
          else { f.x += f.dir * 16 * dt; mv = 16; if (f.x < 16 || f.x > W - 16 || blocked(f.x + f.dir * 6, f.y, 5)) f.dir *= -1; }
          push(f, 6);
        }
        f.walk += mv * dt * .15;
        if (f.alert > 0 && d < 150) {
          f.cd -= dt;
          if (f.cd <= 0) {
            const a = Math.atan2(tg.y - f.y, tg.x - f.x), n = f.kind === 'turret' ? 3 : 1, inside = !!dome && Math.hypot(f.x - dome.x, f.y - dome.y) < DOME;
            for (let i = 0; i < n; i++) { const aa = a + (i - (n - 1) / 2) * .22; bolts.push({ x: f.x, y: f.y, vx: Math.cos(aa) * 110, vy: Math.sin(aa) * 110, l: 2.2, dmg: f.kind === 'hauler' ? 14 + stage * 2 : 7 + stage, inside }); }
            f.cd = (f.kind === 'turret' ? 1.5 : f.kind === 'hauler' ? 1.4 : 1.1) * Math.max(.65, 1 - stage * .06); sfx(400, .03, 'square', .02, -200);
            add.emit({ x: (f.x + Math.cos(a) * 7) * K, y: 1.1, z: (f.y + Math.sin(a) * 7) * K, life: .08, size: .12, col: [6, 2.4, .6] });
          }
        }
      }
      for (const b of bolts) {
        b.l -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
        if (blocked(b.x, b.y, 0)) { b.l = 0; burst(b.x, b.y, 1.1, 4, [5, 2, .6]); }
        else if (dome && !b.inside && Math.hypot(b.x - dome.x, b.y - dome.y) < DOME) { b.l = 0; burst(b.x, b.y, 1.1, 6, [1.4, 4, 6], 2); sfx(900, .03, 'sine', .03, 300); }
        else if (!dash && Math.hypot(b.x - p.x, b.y - p.y) < 6) { b.l = 0; hurt(b.dmg); if (dead) return; }
      }
      bolts = bolts.filter(b => b.l > 0);
      if (Math.random() < dt * 14) dust.emit({ x: p.x * K + rnd(-8, 8), y: rnd(.3, 3), z: cam * K + rnd(-10, 4), vx: rnd(-.1, .1), vy: rnd(-.05, .1), vz: rnd(-.1, .1), life: rnd(2, 4), size: .02, col: [2, 2.4, 1], a: .6, fadeIn: 1 });
    },
    fx(dt) { add.update(dt); smoke.update(dt); dust.update(dt); },
    draw(c) {
      if (!built) build();
      const { m } = looks(), cx = clamp(p.x, W * .3, W * .7) * K, cz = cam * K;
      v.cam.position.set(cx, 9.5, cz + 7.5); v.cam.lookAt(cx, 0, cz - 2);
      sunL.follow(p.x * K, 0, cz - 4);
      for (const s of v.shafts) s.m.position.set(cx + s.ox, 6, cz + s.oz);
      // the ranger
      const sg = ranger.g; sg.position.set(p.x * K, 0, p.y * K); sg.rotation.y = Math.PI / 2 - p.face;
      const moving = !!dash || !!cleared || (stick && stick.m > .1), sw = moving ? Math.sin(p.walk * 4) * .6 : 0;
      ranger.legs[0].rotation.x = sw; ranger.legs[1].rotation.x = -sw; ranger.body.position.y = .86 + (moving ? Math.abs(Math.cos(p.walk * 4)) * .04 : Math.sin(t * 2) * .01);
      ranger.body.rotation.x = dash ? .45 : 0; ranger.arms.rotation.x = flashT > 0 ? -.08 : 0;
      sg.visible = !(hurtT < .3 && (t * 20 | 0) % 2);
      // the drone and what it is doing
      const dg = drone.g; dg.position.set(dr.x * K, dr.h + Math.sin(t * 5) * .05, dr.y * K); dg.rotation.set(Math.sin(t * 3.1) * .06, Math.PI / 2 - p.face, Math.sin(t * 2.3) * .06);
      drone.eye.material = decoy ? m.eyeD : m.eye;
      domeM.visible = ringM.visible = !!dome;
      if (dome) { domeM.position.set(dome.x * K, 0, dome.y * K); ringM.position.set(dome.x * K, .05, dome.y * K); m.dome.opacity = .16 * clamp(dome.l * 2, 0, 1) * (.85 + Math.sin(t * 9) * .15); }
      ringD.visible = !!decoy;
      if (decoy) { ringD.position.set(decoy.x * K, .05, decoy.y * K); ringD.scale.setScalar(.7 + (t * 1.5 % 1) * .7); }
      beamM.visible = !!beam;
      if (beam) { dir.set((beam.x - dr.x) * K, 1 - dr.h, (beam.y - dr.y) * K); const len = dir.length(); beamM.position.set((beam.x + dr.x) / 2 * K, (1 + dr.h) / 2, (beam.y + dr.y) / 2 * K); beamM.quaternion.setFromUnitVectors(UP, dir.normalize()); beamM.scale.set(.04, len, .04); }
      // bots
      for (const f of foes) {
        const g = foeMeshes.get(f), ud = g.userData; g.position.set(f.x * K, 0, f.y * K); g.visible = Math.abs(f.y - cam) < 220;
        if (f.kind === 'turret') { ud.aim.rotation.y = f.alert > 0 ? f.aim : Math.sin(t * .8 + f.y) * 1.2; continue; }
        g.rotation.set(0, f.alert > 0 ? f.aim : (f.dir > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
        const s2 = Math.sin(f.walk * 4) * .5; ud.legs[0].rotation.x = s2; ud.legs[1].rotation.x = -s2;
        ud.body.rotation.x = f.flash > 0 ? -.25 : 0; if (ud.saw) ud.saw.rotation.x = t * 14;
      }
      for (const d of downs) {
        const g = d.m, k = Math.min(1, d.t / .5), e = 1 - (1 - k) ** 3;
        if (d.f.kind === 'turret') { g.position.y = -e * .3 - Math.max(0, d.t - 2.5) * .4; g.userData.aim.rotation.x = e * .6; continue; }
        g.rotation.set(-e * Math.PI / 2 * .95, d.dir + Math.PI, 0, 'YXZ'); g.position.y = e * .18 - Math.max(0, d.t - 2.5) * .4;
      }
      // cages: the bars drop away and the parrot flies up and off through the canopy
      cages.forEach((cg, i) => {
        const ud = cg.m.userData; cg.m.visible = Math.abs(cg.y - cam) < 240;
        if (!cg.open) { ud.parrot.rotation.y = Math.sin(t * 1.5 + i * 2) * .7; ud.parrot.position.y = .12 + Math.abs(Math.sin(t * 3 + i)) * .03; return; }
        const ft = cg.t; ud.bars.position.y = -Math.min(1, ft * 3) * 1.15; ud.bars.visible = ft < .4;
        ud.parrot.visible = ft < 4; ud.parrot.position.set(Math.sin(ft * 2.5) * .9 * Math.min(1, ft), .12 + ft * 1.5, -ft * ft * .5); ud.parrot.rotation.y = Math.PI + Math.sin(ft * 2.5) * .6;
        ud.wings.forEach((w, k) => { w.rotation.z = (k ? 1 : -1) * Math.sin(ft * 30) * .9; });
      });
      // zapper darts and bot bolts (instanced): streaks along their velocity
      const mx = new Object3D(); let nt = 0, nb = 0;
      for (const s of shots) { if (nt >= 40) break; mx.position.set(s.x * K, 1.2, s.y * K); mx.rotation.set(0, Math.atan2(s.vx, s.vy), 0); mx.rotateX(Math.PI / 2); mx.scale.set(.03, .5, .03); mx.updateMatrix(); trIM.setMatrixAt(nt++, mx.matrix); }
      for (const b of bolts) { if (nb >= 60) break; mx.position.set(b.x * K, 1.1, b.y * K); mx.rotation.set(0, Math.atan2(b.vx, b.vy), 0); mx.rotateX(Math.PI / 2); mx.scale.set(.035, .35, .035); mx.updateMatrix(); boIM.setMatrixAt(nb++, mx.matrix); }
      trIM.count = nt; boIM.count = nb; trIM.instanceMatrix.needsUpdate = boIM.instanceMatrix.needsUpdate = true;
      // chopper
      const ud = chopper.userData; ud.rotor.rotation.y = t * 22; ud.beacon.visible = (t * 2 | 0) % 2 === 0;
      ud.lights.forEach((l, i) => l.visible = ((t * 6 | 0) % 8) === i || ((t * 6 | 0) % 8) === (i + 4) % 8);
      v.hurt = Math.max(hurtT < .4 ? (.4 - hurtT) * 2 : 0, p.hp < 40 && !dead ? .25 + Math.sin(t * 6) * .1 : 0);
      v.render(c, W, H);
      hud(c);
    },
    // touch: the first finger walks (stick). A second finger, anywhere above the trick bar, aims and
    // fires (drag in the direction to shoot). The trick bar takes taps from any finger.
    down(x, y, id = 0) {
      if (dead || cleared) return;
      ready.go();
      if (y > H - barH) { trick(clamp(Math.floor(x / (W / 4)), 0, 3)); return; }
      const f = { id, x, y, a: 0, m: 0 };
      if (!stick) stick = f; else if (!aimF) aimF = f;
    },
    move(x, y, pr, id = 0) {
      if (!pr) return; const f = stick && stick.id === id ? stick : aimF && aimF.id === id ? aimF : null; if (!f) return;
      const dx = x - f.x, dy = y - f.y, d = Math.hypot(dx, dy); f.a = Math.atan2(dy, dx); f.m = clamp(d / 22, 0, 1); if (d > 30) { f.x = x - dx / d * 30; f.y = y - dy / d * 30; }
    },
    up(x, y, id = 0) { if (stick && stick.id === id) stick = null; else if (aimF && aimF.id === id) aimF = null; },
    key(k, d) {
      const dirs = { ArrowUp: -Math.PI / 2, ArrowDown: Math.PI / 2, ArrowLeft: Math.PI, ArrowRight: 0 };
      if (k in dirs) { if (dead || cleared) return; if (d) ready.go(); stick = d ? { id: 'k', x: W / 2, y: H / 2, a: dirs[k], m: 1 } : null; }
      else if (d && '1234'.includes(k)) self.down((+k - .5) * W / 4, H - 5, 'kb');
    },
  };
  function hud(c) {
    const u = Math.min(W, H) / 220, sa = api.scoreArea();
    c.save(); c.textBaseline = 'middle'; c.textAlign = 'center';
    // markers over the bots that have spotted something, and over the cages still shut
    for (const f of foes) {
      if (Math.abs(f.y - cam) > 200) continue; const [fx, fy, fz] = v.toScreen(f.x * K, 2.3, f.y * K); if (fz > 1) continue;
      if (f.alert > 0) { c.fillStyle = '#ff5a4a'; c.font = `800 ${10 * u}px Rubik, sans-serif`; c.fillText('!', fx, fy - 6 * u); }
      if (f.hp < f.max) { c.fillStyle = '#0008'; c.fillRect(fx - 9 * u, fy, 18 * u, 2.5 * u); c.fillStyle = '#ff5a4a'; c.fillRect(fx - 9 * u, fy, 18 * u * f.hp / f.max, 2.5 * u); }
    }
    for (const cg of cages) {
      if (cg.open || Math.abs(cg.y - cam) > 200) continue; const [fx, fy, fz] = v.toScreen(cg.x * K, 1.7 + Math.sin(t * 4) * .1, cg.y * K); if (fz > 1) continue;
      c.fillStyle = '#a8f0ff'; c.beginPath(); c.moveTo(fx - 4 * u, fy - 6 * u); c.lineTo(fx + 4 * u, fy - 6 * u); c.lineTo(fx, fy); c.fill();
    }
    for (const o of pops) {
      const [fx, fy, fz] = v.toScreen(o.x * K, 2.2 + (1.1 - o.l) * 1.2, o.y * K); if (fz > 1) continue;
      c.globalAlpha = clamp(o.l * 2, 0, 1); c.font = `800 ${8 * u}px Rubik, sans-serif`; c.fillStyle = '#05070cb0'; c.fillText(o.txt, fx + 1, fy + 1); c.fillStyle = o.col; c.fillText(o.txt, fx, fy); c.globalAlpha = 1;
    }
    for (const s of [stick, aimF]) if (s && s.id !== 'k') { c.strokeStyle = s === aimF ? '#ff8a6a80' : '#ffffff50'; c.lineWidth = 1.5 * u; c.beginPath(); c.arc(s.x, s.y, 22, 0, 7); c.stroke(); c.fillStyle = s === aimF ? '#ff8a6a60' : '#ffffff50'; c.beginPath(); c.arc(s.x + Math.cos(s.a) * s.m * 22, s.y + Math.sin(s.a) * s.m * 22, 7, 0, 7); c.fill(); }
    // health and parrots (top left, clear of the score badge), zone (top right)
    const pw = Math.max(54 * u, Math.min(76 * u, sa.x - 10 * u)), bw0 = pw - 30 * u;
    c.fillStyle = '#05070cb0'; c.beginPath(); c.roundRect(6 * u, 6 * u, pw, 26 * u, 13 * u); c.fill(); c.strokeStyle = '#ffffff22'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#f2f5fbcc'; c.font = `700 ${6.5 * u}px Rubik, sans-serif`; c.textAlign = 'left'; c.fillText('HP', 12 * u, 14 * u);
    c.fillStyle = '#ffffff1a'; c.fillRect(27 * u, 12 * u, bw0, 4 * u); c.fillStyle = p.hp < 40 ? '#ff5a4a' : '#5ae07a'; c.fillRect(27 * u, 12 * u, bw0 * clamp(p.hp, 0, 100) / 100, 4 * u);
    c.fillStyle = '#a8f0ff'; c.fillText(`FREED ${cages.filter(cg => cg.open).length}/${cages.length}`, 12 * u, 24 * u);
    c.textAlign = 'right'; c.font = `800 ${8 * u}px Rubik, sans-serif`; c.fillStyle = '#f2f5fbcc'; c.fillText(`ZONE ${stage + 1}`, W - 8 * u, 13 * u);
    // the trick bar: each button fills up as its trick recharges and lights when it is ready
    const bw = W / 4, by = H - barH;
    c.fillStyle = '#05070cc8'; c.fillRect(0, by, W, barH);
    TRICKS.forEach((tr, i) => {
      const x = i * bw + 3, w = bw - 6, k = 1 - cd[i] / tr.cd, on = cd[i] <= 0;
      c.fillStyle = '#ffffff12'; c.beginPath(); c.roundRect(x, by + 5, w, barH - 10, 8); c.fill();
      c.save(); c.clip(); c.globalAlpha = on ? 1 : .35; c.fillStyle = tr.col; c.fillRect(x, by + 5, w * k, barH - 10); c.restore();
      if (on) { c.strokeStyle = '#ffffffb0'; c.lineWidth = 1; c.beginPath(); c.roundRect(x + .5, by + 5.5, w - 1, barH - 11, 8); c.stroke(); }
      c.fillStyle = on ? '#05070c' : '#f2f5fbcc'; c.textAlign = 'center'; c.font = `800 ${Math.min(7.5 * u, w / 4.6)}px Rubik, sans-serif`; c.fillText(tr.k, x + w / 2, by + barH / 2 + .5);
    });
    if (msg) {
      c.globalAlpha = clamp(msg.l * 2, 0, 1); c.fillStyle = '#05070c99'; c.fillRect(0, H * .34 - 18 * u, W, 36 * u);
      c.fillStyle = dead ? '#ff6a5a' : '#fff'; c.font = `800 ${17 * u}px Rubik, sans-serif`; c.textAlign = 'center'; c.fillText(msg.txt, W / 2, H * .34 - 3 * u);
      if (msg.sub) { c.fillStyle = '#a8f0ff'; c.font = `600 ${7.5 * u}px Rubik, sans-serif`; c.fillText(msg.sub, W / 2, H * .34 + 10 * u); } c.globalAlpha = 1;
    }
    ready.draw(c, W, H, { text: 'DRAG TO WALK', y: H * .6, size: 11 * u });
    if (ready.playing && ready.since < 6 && stage === 0) { c.globalAlpha = clamp(6 - ready.since, 0, 1); c.textAlign = 'center'; c.fillStyle = '#f2f5fbcc'; c.font = `600 ${7 * u}px Rubik, sans-serif`; c.fillText('The zapper fires itself · a 2nd thumb aims', W / 2, by - 20 * u); c.fillText('Walk into a cage to free it · tap a drone trick', W / 2, by - 9 * u); c.globalAlpha = 1; }
    c.restore();
  }
  return self;
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'canopy-run', title: 'Canopy Run', tag: 'Next Gen · Action', retro: true, era: 'nextgen', pal: 'moss', w: 220, h: 300, maxW: 580, maxH: 440, goal: 300, reward: 20, music: 'tense',
  hint: 'Drag to walk up through the jungle to the rescue chopper; your zapper fires at the rogue logger bots on its own, or drag a second thumb to aim. Walk into a cage to free its parrot, and tap a drone trick below (SHIELD, DECOY, DASH or STRIKE). Each trick recharges on its own.',
  traits: ['theme:jungle'],
  make,
};
