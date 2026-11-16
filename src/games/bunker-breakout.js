import gs from '../gamescroll.js';
const { Timers } = gs.math;
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { HDView, Particles, pbr, rbox, surface, speckle, spot, THREE } = gs.hd;
const { approach } = gs.juice;
const { icon } = gs.icons;
const {
  Group, Mesh, InstancedMesh, BoxGeometry, SphereGeometry, CylinderGeometry, CapsuleGeometry, ConeGeometry, TorusGeometry,
  PlaneGeometry, OctahedronGeometry, BufferGeometry, BufferAttribute, MeshBasicMaterial, PointLight, Object3D, CanvasTexture,
  AdditiveBlending, DoubleSide, Color, SRGBColorSpace, Matrix4,
} = THREE;

// Bunker Breakout: a first-person corridor shooter, and the first Next Gen Console game.
// You are a captured agent breaking out of an underground fortress held by the Red Bear Guard,
// a made-up cartoon army in fur hats and greatcoats. Each floor is a fresh maze of concrete
// corridors and rooms. Knock out the guards, grab the plans, and ride the green lift down.
// One thumb: drag to walk (up / down) and turn (left / right). Your gun fires by itself when a
// guard is in your sights; tap to fire at anything else (red barrels explode).
// Knocked-out guards see stars and fall over. No blood.

let W = 300, H = 300;
const CS = 2, WH = 2.7, EYE = 1.45;     // cell size, wall height, eye height (metres)

/* ---------- shared look: textures, materials, shapes (built once, on first draw) ---------- */
let M = null;
function looks() {
  if (M) return M;
  const wallA = surface(512, g => {           // concrete panels, painted lower half, chipped
    const { col, h, r, size: S } = g, split = S * .5;
    col.fillStyle = '#62615c'; col.fillRect(0, 0, S, S); speckle(col, S, 2600, '#3a3a38', 2, .35); speckle(col, S, 900, '#c8c6c0', 1.5, .3);
    r.fillStyle = '#e0e0e0'; r.fillRect(0, 0, S, S);
    col.fillStyle = '#2c4a41'; col.fillRect(0, split, S, S - split); r.fillStyle = '#6a6a6a'; r.fillRect(0, split, S, S - split);
    h.fillStyle = '#909090'; h.fillRect(0, split, S, S - split);
    for (let i = 0; i < 26; i++) {     // chips in the paint, mostly near the bottom and the seams
      const x = Math.random() < .4 ? S / 2 + rnd(-14, 14) : Math.random() * S, y = split + (S - split) * (1 - Math.random() ** 2), rr = rnd(1.5, 5);
      for (const [c, v] of [[col, '#77756e'], [h, '#7a7a7a'], [r, '#d8d8d8']]) { c.fillStyle = v; c.beginPath(); c.ellipse(x, y, rr * 1.6, rr, Math.random() * 3, 0, 7); c.fill(); }
    }
    col.fillStyle = '#7a1e18'; col.fillRect(0, split - 14, S, 10); h.fillStyle = '#9a9a9a'; h.fillRect(0, split - 14, S, 10); r.fillStyle = '#707070'; r.fillRect(0, split - 14, S, 10);
    for (const [c, v] of [[col, '#2a2a28'], [h, '#303030']]) { c.fillStyle = v; c.fillRect(0, 0, S, 5); c.fillRect(S / 2 - 3, 0, 6, split - 14); c.fillRect(0, 0, 5, S); c.fillRect(0, S * .25, S, 4); }
    for (const [x, y] of [[20, 20], [S / 2 - 18, 20], [S / 2 + 18, 20], [S - 20, 20], [20, S * .25 + 18], [S - 20, S * .25 + 18]]) {
      col.fillStyle = '#5a5954'; col.beginPath(); col.arc(x, y, 6, 0, 7); col.fill();
      h.fillStyle = '#e8e8e8'; h.beginPath(); h.arc(x, y, 6, 0, 7); h.fill(); r.fillStyle = '#505050'; r.beginPath(); r.arc(x, y, 6, 0, 7); r.fill();
    }
    const gr = col.createLinearGradient(0, S * .82, 0, S); gr.addColorStop(0, '#0000'); gr.addColorStop(1, '#000a'); col.fillStyle = gr; col.fillRect(0, S * .82, S, S * .18);
    for (let i = 0; i < 22; i++) { const x = Math.random() * S, gg = col.createLinearGradient(0, 0, 0, S * rnd(.2, .5)); gg.addColorStop(0, '#2a241c55'); gg.addColorStop(1, '#0000'); col.fillStyle = gg; col.fillRect(x, 0, rnd(2, 8), S * .5); }
  });
  const wallB = surface(512, g => {           // dark red brick with a wooden skirting
    const { col, h, r, size: S } = g, bh = 30, bw = 64;
    col.fillStyle = '#3a2a24'; col.fillRect(0, 0, S, S); h.fillStyle = '#404040'; h.fillRect(0, 0, S, S); r.fillStyle = '#f0f0f0'; r.fillRect(0, 0, S, S);
    for (let y = 0, row = 0; y < S - 60; y += bh, row++) for (let x = -(row % 2) * bw / 2; x < S; x += bw) {
      const l = rnd(-.1, .06), c = new Color('#5e2a22').offsetHSL(rnd(-.015, .015), 0, l);
      col.fillStyle = '#' + c.getHexString(); col.fillRect(x + 3, y + 3, bw - 6, bh - 6);
      h.fillStyle = `rgb(${200 + rnd(-30, 30)},${200},${200})`; h.fillRect(x + 4, y + 4, bw - 8, bh - 8);
      r.fillStyle = '#c8c8c8'; r.fillRect(x + 3, y + 3, bw - 6, bh - 6);
    }
    speckle(col, S, 1800, '#1a0e0a', 2, .4);
    col.fillStyle = '#4a2e1a'; col.fillRect(0, S - 60, S, 60); h.fillStyle = '#d0d0d0'; h.fillRect(0, S - 60, S, 60); r.fillStyle = '#707070'; r.fillRect(0, S - 60, S, 60);
    col.fillStyle = '#6a4426'; col.fillRect(0, S - 60, S, 8); h.fillStyle = '#ffffff'; h.fillRect(0, S - 60, S, 8);
    for (let i = 0; i < 60; i++) { col.fillStyle = '#2e1a0e44'; col.fillRect(0, S - 52 + Math.random() * 50, S, 1); }
  });
  const floor = surface(256, g => {            // slate tiles, some wet patches (glossy)
    const { col, h, r, size: S } = g, T = S / 2;
    col.fillStyle = '#121416'; col.fillRect(0, 0, S, S); h.fillStyle = '#303030'; h.fillRect(0, 0, S, S); r.fillStyle = '#ffffff'; r.fillRect(0, 0, S, S);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      col.fillStyle = (i + j) % 2 ? '#3a3d42' : '#2d3034'; col.fillRect(i * T + 3, j * T + 3, T - 6, T - 6);
      h.fillStyle = '#a0a0a0'; h.fillRect(i * T + 4, j * T + 4, T - 8, T - 8);
      r.fillStyle = '#8a8a8a'; r.fillRect(i * T + 3, j * T + 3, T - 6, T - 6);
    }
    speckle(col, S, 900, '#000', 1.5, .3); speckle(col, S, 300, '#777', 1, .2);
    for (let i = 0; i < 4; i++) { const x = Math.random() * S, y = Math.random() * S, gr = r.createRadialGradient(x, y, 0, x, y, rnd(20, 50)); gr.addColorStop(0, '#202020'); gr.addColorStop(1, '#20202000'); r.fillStyle = gr; r.fillRect(0, 0, S, S); }
    r.strokeStyle = '#ffffff55'; for (let i = 0; i < 14; i++) { r.beginPath(); const x = Math.random() * S, y = Math.random() * S; r.moveTo(x, y); r.lineTo(x + rnd(-30, 30), y + rnd(-30, 30)); r.stroke(); }
  }, { strength: 3 });
  const ceil = surface(256, g => {
    const { col, h, r, size: S } = g;
    col.fillStyle = '#26282c'; col.fillRect(0, 0, S, S); r.fillStyle = '#a0a0a0'; r.fillRect(0, 0, S, S);
    for (const [c, v] of [[col, '#111214'], [h, '#202020']]) { c.fillStyle = v; c.fillRect(0, 0, S, 4); c.fillRect(0, 0, 4, S); c.fillRect(S / 2 - 2, 0, 4, S); }
    for (let k = 0; k < 6; k++) { col.fillStyle = '#0b0c0e'; col.fillRect(30, 40 + k * 14, 70, 6); h.fillStyle = '#404040'; h.fillRect(30, 40 + k * 14, 70, 6); }
    speckle(col, S, 600, '#000', 1.5, .3);
  });
  const door = surface(256, g => {             // steel door: ribs, hazard band, red star
    const { col, h, r, size: S } = g;
    col.fillStyle = '#5c6468'; col.fillRect(0, 0, S, S); r.fillStyle = '#5a5a5a'; r.fillRect(0, 0, S, S);
    for (let x = 16; x < S; x += 32) { col.fillStyle = '#6c7478'; col.fillRect(x, 10, 10, S - 60); h.fillStyle = '#e0e0e0'; h.fillRect(x, 10, 10, S - 60); }
    for (let x = -S; x < S; x += 28) { col.fillStyle = '#d8b020'; col.beginPath(); col.moveTo(x, S); col.lineTo(x + 14, S); col.lineTo(x + 14 + 40, S - 40); col.lineTo(x + 40, S - 40); col.fill(); }
    col.fillStyle = '#141414'; col.fillRect(0, S - 44, S, 4); r.fillStyle = '#b0b0b0'; r.fillRect(0, S - 40, S, 40);
    star(col, S / 2, S * .38, 44, '#9c1a14'); star(r, S / 2, S * .38, 44, '#a0a0a0');
    speckle(col, S, 900, '#2a2a2a', 1.5, .35); speckle(col, S, 300, '#8a5a3a', 2, .3);
  });
  const crate = surface(256, g => {
    const { col, h, r, size: S } = g;
    col.fillStyle = '#7e5a32'; col.fillRect(0, 0, S, S); r.fillStyle = '#c8c8c8'; r.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 42) { col.fillStyle = '#5a3c1e'; col.fillRect(0, y, S, 3); h.fillStyle = '#505050'; h.fillRect(0, y, S, 3); }
    for (let i = 0; i < 120; i++) { col.fillStyle = Math.random() < .5 ? '#6a4826' : '#94703e'; col.fillRect(0, Math.random() * S, S, 1); }
    for (const [c, v] of [[col, '#5e4022'], [h, '#d8d8d8']]) { c.fillStyle = v; c.fillRect(0, 0, S, 22); c.fillRect(0, S - 22, S, 22); c.fillRect(0, 0, 22, S); c.fillRect(S - 22, 0, 22, S); c.save(); c.translate(S / 2, S / 2); c.rotate(Math.PI / 4); c.fillRect(-S * .7, -11, S * 1.4, 22); c.restore(); }
    col.fillStyle = '#1a120a'; col.font = 'bold 34px sans-serif'; col.textAlign = 'center'; col.fillText('Ж-17', S / 2, S * .3);
  });
  const cloth = surface(256, g => {           // red banner with a gold star
    const { col, h, r, size: S } = g;
    col.fillStyle = '#9a1414'; col.fillRect(0, 0, S, S); r.fillStyle = '#e8e8e8'; r.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x++) { const v = 128 + Math.sin(x / S * Math.PI * 6) * 60; h.fillStyle = `rgb(${v},${v},${v})`; h.fillRect(x, 0, 1, S); }
    col.fillStyle = '#d8a830'; col.fillRect(0, 10, S, 8); col.fillRect(0, S - 18, S, 8);
    star(col, S / 2, S * .48, 62, '#e8b838'); star(r, S / 2, S * .48, 62, '#606060');
    speckle(col, S, 700, '#3a0606', 1.2, .3);
  }, { strength: 1.5 });

  const m = {
    wallA: pbr('#ffffff', { tex: wallA, rough: 1 }), wallB: pbr('#ffffff', { tex: wallB, rough: 1 }),
    floor: pbr('#ffffff', { tex: floor, rough: 1, metal: .05 }), ceil: pbr('#ffffff', { tex: ceil, rough: 1, metal: .35 }),
    door: pbr('#ffffff', { tex: door, rough: 1, metal: .75 }), frame: pbr('#2a2c30', { rough: .4, metal: .85 }),
    crate: pbr('#ffffff', { tex: crate, rough: 1 }), banner: pbr('#ffffff', { tex: cloth, rough: 1, side: DoubleSide }),
    shade: pbr('#3a3e44', { rough: .35, metal: .9 }), bulb: pbr('#fff0c8', { glow: 9, rough: .2 }),
    barrel: pbr('#b21e16', { rough: .32, metal: .55, clear: .6 }), barrelBand: pbr('#202224', { rough: .3, metal: .9 }), hazard: pbr('#e8c020', { rough: .5 }),
    pipe: pbr('#4a3a2c', { rough: .55, metal: .7 }),
    green: pbr('#30ff7a', { glow: 3 }), greenDim: pbr('#1c3a28', { rough: .3, metal: .7 }),
    med: pbr('#f4f4f0', { rough: .3, clear: .5 }), red: pbr('#e01a1a', { rough: .4, glow: .6 }), ammo: pbr('#4a5a32', { rough: .6 }), brass: pbr('#e0b040', { rough: .25, metal: 1 }),
    gold: pbr('#ffcf4a', { rough: .2, metal: 1, glow: .35, glowCol: '#ffb020' }),
    // characters
    coat: pbr('#5c5a3a', { rough: .85 }), coatO: pbr('#4a5662', { rough: .7 }), coatH: pbr('#3e4c3a', { rough: .8 }),
    skin: pbr('#f2c4a0', { rough: .5, clear: .15 }), nose: pbr('#ee9a88', { rough: .45, clear: .2 }), hair: pbr('#3a2618', { rough: .9 }),
    fur: pbr('#8a8074', { rough: 1, clear: 0, sheen: 1, sheenColor: new Color('#e8e0d0'), sheenRoughness: .5 }),
    star: pbr('#ff2a1e', { glow: 2.2, rough: .3, metal: .5 }), boot: pbr('#121212', { rough: .25, clear: .8 }),
    belt: pbr('#2a1c12', { rough: .45 }), buckle: pbr('#d8b04a', { rough: .3, metal: 1 }), wood: pbr('#7a4a28', { rough: .55 }),
    gunmetal: pbr('#2a2d31', { rough: .32, metal: .9, clear: .4 }), eye: pbr('#ffffff', { rough: .15 }), pupil: pbr('#111111', { rough: .1 }),
    cap: pbr('#3c5838', { rough: .7 }), band: pbr('#b0201a', { rough: .6 }), visor: pbr('#0c0c0c', { rough: .1, clear: 1 }), helmet: pbr('#4b5a3e', { rough: .45, metal: .25, clear: .3 }),
    glove: pbr('#2a2420', { rough: .55, clear: .2 }), sleeve: pbr('#2e3a4a', { rough: .9 }), polymer: pbr('#1c1e21', { rough: .6 }),
    ko: pbr('#ffd640', { glow: 4 }),
  };
  // fake light shafts under lamps: additive cone, bright at the top, fading out
  const gc = document.createElement('canvas'); gc.width = 4; gc.height = 64; const gx = gc.getContext('2d'), gr = gx.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, '#000'); gr.addColorStop(.25, '#444'); gr.addColorStop(1, '#fff'); gx.fillStyle = gr; gx.fillRect(0, 0, 4, 64);
  m.shaft = new MeshBasicMaterial({ color: new Color('#ffc880').multiplyScalar(.045), alphaMap: new CanvasTexture(gc), transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
  m.beam = new MeshBasicMaterial({ color: new Color('#30ff7a').multiplyScalar(.045), alphaMap: m.shaft.alphaMap, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
  // muzzle flash star and bullet holes
  const fc = document.createElement('canvas'); fc.width = fc.height = 64; const fx = fc.getContext('2d');
  const fg = fx.createRadialGradient(32, 32, 0, 32, 32, 32); fg.addColorStop(0, '#fff'); fg.addColorStop(.25, '#ffd080'); fg.addColorStop(1, '#0000'); fx.fillStyle = fg;
  fx.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = i % 2 ? 9 : 32; fx.lineTo(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr); } fx.fill();
  m.flash = new MeshBasicMaterial({ map: new CanvasTexture(fc), color: new Color(4, 3, 2), transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
  m.flash.map.colorSpace = SRGBColorSpace;
  const hc = document.createElement('canvas'); hc.width = hc.height = 32; const hx = hc.getContext('2d'), hg = hx.createRadialGradient(16, 16, 0, 16, 16, 16);
  hg.addColorStop(0, '#000f'); hg.addColorStop(.3, '#000e'); hg.addColorStop(.5, '#1a1a1a88'); hg.addColorStop(1, '#0000'); hx.fillStyle = hg; hx.fillRect(0, 0, 32, 32);
  m.hole = new MeshBasicMaterial({ map: new CanvasTexture(hc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  m.scorch = new MeshBasicMaterial({ map: m.hole.map, transparent: true, opacity: .8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  // exit sign
  const sc = document.createElement('canvas'); sc.width = 256; sc.height = 96; const sx = sc.getContext('2d');
  sx.fillStyle = '#04140a'; sx.fillRect(0, 0, 256, 96); sx.fillStyle = '#5aff9a'; sx.font = 'bold 50px sans-serif'; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillText('ВЫХОД', 128, 40); sx.font = 'bold 22px sans-serif'; sx.fillText('▼ LIFT ▼', 128, 78);
  const st = new CanvasTexture(sc); st.colorSpace = SRGBColorSpace;
  m.sign = pbr('#ffffff', { rough: .3, map: st }); m.sign.emissive = new Color('#ffffff'); m.sign.emissiveMap = st; m.sign.emissiveIntensity = 2.5;

  M = {
    m, G: {
      box: new BoxGeometry(1, 1, 1), ball: new SphereGeometry(1, 24, 16), cyl: new CylinderGeometry(1, 1, 1, 20), pill: new CapsuleGeometry(1, 1, 6, 16),
      cone: new ConeGeometry(1, 1, 24, 1, true), torus: new TorusGeometry(1, .08, 10, 40), plane: new PlaneGeometry(1, 1), gem: new OctahedronGeometry(1),
      shade: new CylinderGeometry(.12, .32, .2, 20, 1, true), barrel: new CylinderGeometry(.34, .34, 1, 24),
    },
  };
  return M;
}
function star(c, x, y, R, col) {
  c.fillStyle = col; c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * .42 : R; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.fill();
}
/** A bevelled box part: w x h x d metres, corner radius r. */
function B(w, h, d, mat, o = {}) { return P(rbox(w, h, d, o.r ?? Math.min(w, h, d) * .22), mat, o); }
/** A mesh from shared shape geo with material mat; o: s/sx/sy/sz, x/y/z, rx/ry/rz, shadow. */
function P(geo, mat, o = {}) {
  const m = new Mesh(geo, mat), s = o.s ?? 1;
  m.scale.set(o.sx ?? s, o.sy ?? s, o.sz ?? s); m.position.set(o.x || 0, o.y || 0, o.z || 0); m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  m.castShadow = o.cast !== false; m.receiveShadow = true; return m;
}

/* ---------- the Red Bear Guard (cartoon soldiers built from shapes) ---------- */
const TYPES = {
  guard: { hp: 100, speed: 1.7, rate: 1.5, dmg: 7, score: 100, scale: 1 },
  officer: { hp: 70, speed: 2.4, rate: 1, dmg: 7, score: 150, scale: .95 },
  heavy: { hp: 240, speed: 1.2, rate: .55, dmg: 5, score: 250, scale: 1.18 },
};
function makeGuard(kind) {
  const { m, G } = looks(), g = new Group(), coat = (kind === 'officer' ? m.coatO : kind === 'heavy' ? m.coatH : m.coat).clone();
  const wide = kind === 'heavy' ? 1.3 : 1;
  const hips = new Group(); hips.position.y = .78; g.add(hips);
  const legs = [-1, 1].map(sx => { const L = new Group(); L.position.set(sx * .13, .78, 0); L.add(P(G.pill, coat, { sx: .11, sy: .26, sz: .11, y: -.3 }), B(.16, .14, .27, m.boot, { y: -.72, z: .04, r: .05 })); g.add(L); return L; });
  const torso = new Group(); hips.add(torso);
  torso.add(P(G.pill, coat, { sx: .3 * wide, sy: .3, sz: .24 * wide, y: .3 }));                 // greatcoat
  torso.add(P(G.cyl, coat, { sx: .34 * wide, sy: .3, sz: .27 * wide, y: .02 }));                 // coat skirt
  torso.add(P(G.cyl, m.belt, { sx: .31 * wide, sy: .06, sz: .25 * wide, y: .2 }), P(G.box, m.buckle, { sx: .08, sy: .06, sz: .04, y: .2, z: .25 * wide }));
  for (const y of [.36, .5]) for (const sx of [-1, 1]) torso.add(P(G.ball, m.buckle, { s: .025, x: sx * .07, y, z: .23 * wide, cast: false }));
  const head = new Group(); head.position.y = .82; torso.add(head);
  head.add(P(G.ball, m.skin, { sx: .25, sy: .24, sz: .24 }));
  head.add(P(G.ball, m.nose, { s: .075, y: -.02, z: .24 }));
  head.add(P(G.pill, m.hair, { sx: .045, sy: .11, sz: .045, y: -.09, z: .21, rz: Math.PI / 2 }));               // moustache
  for (const sx of [-1, 1]) {
    head.add(P(G.ball, m.eye, { sx: .055, sy: .06, sz: .03, x: sx * .085, y: .06, z: .215, cast: false }), P(G.ball, m.pupil, { s: .026, x: sx * .085, y: .055, z: .24, cast: false }));
    head.add(P(G.box, m.hair, { sx: .09, sy: .025, sz: .03, x: sx * .09, y: .13, z: .22, rz: sx * .35, cast: false }));    // angry brows
  }
  const hat = new Group(); hat.position.y = .15; head.add(hat);
  if (kind === 'officer') {
    hat.add(P(G.cyl, m.cap, { sx: .29, sy: .1, sz: .29, y: .06 }), P(G.cyl, m.band, { sx: .255, sy: .06, sz: .255, y: -.01 }), P(G.cyl, m.visor, { sx: .16, sy: .02, sz: .12, y: -.04, z: .18 }));
    hat.add(P(G.gem, m.star, { sx: .04, sy: .04, sz: .01, y: -.01, z: .26, cast: false }));
  } else if (kind === 'heavy') {
    hat.add(P(G.ball, m.helmet, { sx: .29, sy: .2, sz: .3, y: .0 }), P(G.cyl, m.helmet, { sx: .32, sy: .02, sz: .33, y: -.04 }));
    hat.add(P(G.gem, m.star, { sx: .05, sy: .05, sz: .012, y: .06, z: .27, cast: false }));
  } else {   // ushanka: fur hat with ear flaps
    hat.add(P(G.cyl, m.fur, { sx: .27, sy: .17, sz: .27, y: .04 }), P(G.cyl, m.fur, { sx: .29, sy: .07, sz: .29, y: -.02 }));
    for (const sx of [-1, 1]) hat.add(B(.08, .22, .2, m.fur, { x: sx * .25, y: -.12, r: .035 }));
    hat.add(P(G.gem, m.star, { sx: .045, sy: .045, sz: .012, y: .05, z: .28, cast: false }));
  }
  // arms + gun (right arm holds the rifle across the body)
  const arms = new Group(); arms.position.y = .55; torso.add(arms);
  for (const sx of [-1, 1]) arms.add(P(G.pill, coat, { sx: .085, sy: .2, sz: .085, x: sx * .3 * wide, y: -.12, z: .12, rx: -1.1 }), P(G.ball, m.glove, { s: .07, x: sx * .18, y: -.12, z: .34 }));
  const gun = new Group(); gun.position.set(.08, -.1, .3); arms.add(gun);
  if (kind === 'heavy') {
    gun.add(P(G.box, m.gunmetal, { sx: .12, sy: .14, sz: .5 }), P(G.cyl, m.gunmetal, { sx: .14, sy: .1, sz: .14, y: -.12, rz: Math.PI / 2 }), P(G.cyl, m.gunmetal, { sx: .03, sy: .4, sz: .03, z: .42, rx: Math.PI / 2 }));
  } else {
    gun.add(P(G.box, m.wood, { sx: .07, sy: .09, sz: .55, z: -.05 }), P(G.cyl, m.gunmetal, { sx: .022, sy: .55, sz: .022, y: .03, z: .38, rx: Math.PI / 2 }), P(G.box, m.gunmetal, { sx: .05, sy: .1, sz: .05, y: -.08, z: .1 }));
  }
  const glint = new Mesh(M.G.plane, m.flash); glint.position.set(0, .03, kind === 'heavy' ? .65 : .68); glint.visible = false; glint.scale.setScalar(.35); gun.add(glint);
  const stars = new Group(); stars.position.y = .45; head.add(stars); stars.visible = false;
  for (let i = 0; i < 3; i++) { const s = P(G.gem, m.ko, { sx: .07, sy: .07, sz: .025, cast: false }); const a = i / 3 * Math.PI * 2; s.position.set(Math.cos(a) * .3, 0, Math.sin(a) * .3); stars.add(s); }
  const sh = new Mesh(M.G.plane, M.m.scorch); sh.rotation.x = -Math.PI / 2; sh.position.y = .02; sh.scale.setScalar(.9); sh.material = M.m.scorch; g.add(sh);
  g.scale.setScalar(TYPES[kind].scale);
  g.rotation.order = 'YXZ';
  return { g, legs, torso, head, hat, arms, gun, glint, stars, coat };
}

/* ---------- first-person guns ---------- */
function makeViewGun(kind) {
  const { m, G } = looks(), g = new Group(), o = { cast: false };
  const sleeve = P(G.cyl, m.sleeve, { sx: .05, sy: .26, sz: .05, ...o });
  if (kind === 'pistol') {
    g.add(B(.03, .032, .19, m.gunmetal, { r: .005, ...o }));                                   // slide
    for (let i = 0; i < 5; i++) g.add(B(.031, .02, .003, m.frame, { y: .002, z: .06 + i * .007, r: .001, ...o }));   // grip serrations
    g.add(B(.006, .012, .03, m.frame, { x: .016, y: .006, z: -.01, r: .002, ...o }));           // ejection port
    g.add(B(.027, .024, .17, m.polymer, { y: -.026, z: .008, r: .005, ...o }));                // frame
    g.add(P(G.cyl, m.gunmetal, { sx: .007, sy: .02, sz: .007, z: -.1, rx: Math.PI / 2, ...o }));
    g.add(B(.006, .008, .008, m.gunmetal, { y: .02, z: -.088, r: .002, ...o }), B(.022, .008, .008, m.gunmetal, { y: .02, z: .086, r: .002, ...o }));   // sights
    g.add(B(.028, .1, .044, m.polymer, { y: -.08, z: .06, rx: .24, r: .009, ...o }));          // grip
    g.add(P(G.torus, m.polymer, { sx: .02, sy: .02, sz: .06, y: -.044, z: .004, ry: Math.PI / 2, ...o }));   // trigger guard
    const hand = new Group(); hand.position.set(0, -.085, .065); hand.rotation.x = .24; g.add(hand);
    hand.add(B(.05, .075, .065, m.glove, { r: .018, ...o }));
    for (let i = 0; i < 3; i++) hand.add(P(G.pill, m.glove, { sx: .011, sy: .016, sz: .011, x: -.024, y: .02 - i * .022, z: -.03, rz: Math.PI / 2, ...o }));
    hand.add(P(G.pill, m.glove, { sx: .011, sy: .03, sz: .011, x: .026, y: .03, z: -.03, rx: -1.3, ...o }));   // thumb
    sleeve.position.set(.0, -.14, .2); sleeve.rotation.x = 1.15; g.add(sleeve);
    g.muzzle = -.115;
  } else {
    g.add(B(.05, .062, .26, m.gunmetal, { r: .008, ...o }));                                   // receiver
    g.add(B(.016, .012, .2, m.frame, { y: .036, r: .003, ...o }));                              // top rail
    for (let i = 0; i < 8; i++) g.add(B(.018, .006, .01, m.gunmetal, { y: .045, z: -.08 + i * .022, r: .002, ...o }));
    g.add(P(G.cyl, m.frame, { sx: .024, sy: .17, sz: .024, z: -.2, rx: Math.PI / 2, ...o }));   // barrel shroud
    for (let i = 0; i < 4; i++) g.add(P(G.torus, m.gunmetal, { s: .026, sz: .03, z: -.14 - i * .035, ...o }));
    g.add(P(G.cyl, m.gunmetal, { sx: .011, sy: .05, sz: .011, z: -.3, rx: Math.PI / 2, ...o }));
    g.add(B(.03, .14, .046, m.gunmetal, { y: -.1, z: -.045, rx: -.18, r: .006, ...o }));         // magazine
    g.add(B(.034, .085, .046, m.wood, { y: -.07, z: .07, rx: .3, r: .01, ...o }));             // grip
    g.add(B(.04, .055, .17, m.wood, { y: -.01, z: .21, r: .012, ...o }));                       // stock
    g.add(B(.02, .03, .02, m.gunmetal, { y: .05, z: .1, r: .004, ...o }));                     // rear sight
    const hand = new Group(); hand.position.set(0, -.09, .085); hand.rotation.x = .3; g.add(hand);
    hand.add(B(.054, .075, .068, m.glove, { r: .02, ...o }));
    hand.add(P(G.pill, m.glove, { sx: .012, sy: .03, sz: .012, x: .028, y: .035, z: -.03, rx: -1.3, ...o }));
    const sup = B(.06, .045, .07, m.glove, { x: -.01, y: -.03, z: -.2, r: .018, ...o }); g.add(sup);
    sleeve.position.set(.0, -.15, .24); sleeve.rotation.x = 1.15; g.add(sleeve);
    const sl2 = P(G.cyl, m.sleeve, { sx: .045, sy: .3, sz: .045, x: -.12, y: -.12, z: -.08, rx: 1.0, rz: -.9, ...o }); g.add(sl2);
    g.muzzle = -.33;
  }
  const fl = new Mesh(G.plane, m.flash); fl.position.z = g.muzzle; fl.visible = false; g.add(fl); g.flash = fl;
  return g;
}

/* ---------- level generation ---------- */
// Grid cells: 0 floor, 1 wall, 2 door, 3 crate, 4 barrel. Rooms are boxes joined by corridors,
// with doors where a corridor meets a room. The lift is in the room furthest from the start.
function genLevel(floorN) {
  for (;;) { const L = tryLevel(floorN); if (L.rooms.length >= 3) return L; }
}
function tryLevel(floorN) {
  const S = 15 + 2 * Math.min(4, floorN), g = new Uint8Array(S * S).fill(1), room = new Int16Array(S * S).fill(-1), rooms = [];
  const I = (x, y) => y * S + x;
  for (let tries = 0; tries < 200 && rooms.length < 5 + Math.min(4, floorN); tries++) {
    const w = 2 + 2 * (Math.random() * 2 | 0) + 1, h = 2 + 2 * (Math.random() * 2 | 0) + 1;
    const x = 1 + 2 * (Math.random() * ((S - w - 1) / 2) | 0), y = 1 + 2 * (Math.random() * ((S - h - 1) / 2) | 0);
    if (rooms.some(r => x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y)) continue;
    const r = { x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1), style: Math.random() < .4 ? 1 : 0, id: rooms.length };
    rooms.push(r);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { g[I(i, j)] = 0; room[I(i, j)] = r.id; }
  }
  const carve = (a, b) => {
    let x = a.cx, y = a.cy; const hFirst = Math.random() < .5;
    const step = (tx, ty) => { while (x !== tx || y !== ty) { if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y); if (g[I(x, y)] === 1) g[I(x, y)] = 5; } };
    if (hFirst) { step(b.cx, y); step(b.cx, b.cy); } else { step(x, b.cy); step(b.cx, b.cy); }
  };
  for (let i = 1; i < rooms.length; i++) {
    let best = 0, bd = 1e9; for (let j = 0; j < i; j++) { const d = Math.abs(rooms[i].cx - rooms[j].cx) + Math.abs(rooms[i].cy - rooms[j].cy); if (d < bd) { bd = d; best = j; } }
    carve(rooms[i], rooms[best]);
  }
  for (let k = 0; k < 1 + (floorN > 1); k++) { const a = rooms[Math.random() * rooms.length | 0], b = rooms[Math.random() * rooms.length | 0]; if (a !== b) carve(a, b); }
  // doors: a corridor cell next to a room, walls on both sides of the passage
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    if (g[I(x, y)] !== 5) continue;
    g[I(x, y)] = 0;
    const wl = g[I(x - 1, y)] === 1, wr = g[I(x + 1, y)] === 1, wu = g[I(x, y - 1)] === 1, wd = g[I(x, y + 1)] === 1;
    const rx = room[I(x - 1, y)] >= 0 || room[I(x + 1, y)] >= 0, ry = room[I(x, y - 1)] >= 0 || room[I(x, y + 1)] >= 0;
    const near = [I(x - 1, y), I(x + 1, y), I(x, y - 1), I(x, y + 1)].some(k => g[k] === 2);
    if (!near && ((wl && wr && ry && !wu && !wd) || (wu && wd && rx && !wl && !wr)) && Math.random() < .85) g[I(x, y)] = 2;
  }
  // distances from the start room (BFS) to pick the lift room
  const start = rooms[0], dist = bfs(g, S, start.cx, start.cy);
  let exitR = rooms[1] || rooms[0]; for (const r of rooms) if (dist[I(r.cx, r.cy)] > dist[I(exitR.cx, exitR.cy)]) exitR = r;
  // props along room walls (never blocking a doorway or the room centre)
  const lamps = [], props = [], banners = [];
  for (const r of rooms) {
    lamps.push({ x: (r.cx + .5) * CS, y: WH - .25, z: (r.cy + .5) * CS, flick: Math.random() < .15, col: r.style ? '#ff9a5a' : '#ffc890', i: 9 });
    if (r.w * r.h >= 15) lamps.push({ x: (r.x + .5) * CS, y: WH - .25, z: (r.y + .5) * CS, flick: false, col: '#ffc890', i: 7 });
    if (r === start) continue;
    for (let k = 0; k < 3; k++) {
      const edge = Math.random() * 4 | 0, i = edge < 2 ? r.x + (Math.random() * r.w | 0) : edge === 2 ? r.x : r.x + r.w - 1, j = edge >= 2 ? r.y + (Math.random() * r.h | 0) : edge === 0 ? r.y : r.y + r.h - 1;
      if ((i === r.cx && j === r.cy) || g[I(i, j)] !== 0 || r === exitR && Math.abs(i - r.cx) + Math.abs(j - r.cy) < 2) continue;
      const nb = [I(i - 1, j), I(i + 1, j), I(i, j - 1), I(i, j + 1)];
      if (nb.some(n => g[n] === 2 || (g[n] === 0 && room[n] < 0))) continue;
      g[I(i, j)] = Math.random() < .35 ? 4 : 3;
      if (bfs(g, S, start.cx, start.cy)[I(exitR.cx, exitR.cy)] < 0 || rooms.some(q => bfs(g, S, start.cx, start.cy)[I(q.cx, q.cy)] < 0)) g[I(i, j)] = 0;
      else props.push({ i, j, k: g[I(i, j)] });
    }
    // a banner on one wall of bigger rooms
    if (r.w >= 3 && g[I(r.cx, r.y - 1)] === 1) banners.push({ x: (r.cx + .5) * CS, z: r.y * CS + .03, ry: 0 });
  }
  // corridor lamps every few cells
  let n = 0; for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) if (g[I(x, y)] === 0 && room[I(x, y)] < 0 && (++n % 4 === 0)) lamps.push({ x: (x + .5) * CS, y: WH - .25, z: (y + .5) * CS, flick: Math.random() < .2, col: '#b8d0ff', i: 6 });
  return { S, g, room, rooms, start, exitR, lamps, props, banners };
}
function bfs(g, S, sx, sy) {
  const d = new Int16Array(S * S).fill(-1), q = [sy * S + sx]; d[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const k = q[h], x = k % S, y = k / S | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, nk = ny * S + nx; if (nx < 0 || ny < 0 || nx >= S || ny >= S || d[nk] >= 0) continue; const c = g[nk]; if (c === 1 || c === 3 || c === 4) continue; d[nk] = d[k] + 1; q.push(nk); }
  }
  return d;
}

/* ---------- the game ---------- */
function make(api) {
  const timers = new Timers(), later = (fn, ms) => timers.after(ms / 1000, fn);   // game-time delays: they pause with the game
  let v, L, lvl, world, spt, flashL, exitL, add, smoke, dust, gunG, guns = {}, holes, holeN, casings, scorchN;
  let pl, foes, pickups, barrels, doors, score, floorN, t, msg, feed, stick, look, keys, fireCD, auto, kick, shake, hurtDir, hurtT, hitT, fade, state, stT, pathT, weapon, ammo;

  function setup() {
    if (v) return;
    const { m, G } = looks();
    v = new HDView({ bg: '#06080c', fog: .075, env: .14, sky: '#7890b8', ground: '#2a2018', amb: .14, fov: 75 }).lampLights(9);
    v.exposure = 1.05; v.bloom = .8;
    // a hand-held camera in the dark: grain, halation round the lamps and muzzle flashes, lens dirt, the eye opening up in the dark
    v.film = { halation: .4, grain: 2, fringe: .02 }; v.flare = { strength: .35, threshold: .4, dirt: .55 }; v.autoExposure = { amount: .35, min: .9, max: 1.5, speed: .9 };
    // frame generation's fresh aim: made frames turn to where the finger has already turned the look
    v.aimNow(cam => { if (pl) cam.rotation.y = pl.a; });
    spt = spot('#fff1dc', 11, 16, .5); v.scene.add(spt, spt.target);
    v.onTier(T => spt.setTier(T));
    flashL = new PointLight('#ffc070', 0, 7, 1.6); v.scene.add(flashL);
    exitL = new PointLight('#30ff7a', 0, 7, 1.5); v.scene.add(exitL);
    add = new Particles(v, { max: 420, additive: true }); smoke = new Particles(v, { max: 160, additive: false }); dust = new Particles(v, { max: 90, additive: true });
    guns.pistol = makeViewGun('pistol'); guns.smg = makeViewGun('smg');
    gunG = new Group(); gunG.add(guns.pistol, guns.smg); v.cam.add(gunG);
    holes = new InstancedMesh(G.plane, m.hole, 60); holes.count = 0; holes.frustumCulled = false; v.scene.add(holes); holeN = 0; scorchN = 0;
    casings = Array.from({ length: 14 }, () => { const c = P(G.cyl, m.brass, { sx: .012, sy: .035, sz: .012, cast: false }); c.visible = false; v.scene.add(c); return { m: c, t: 9 }; });
  }
  function disposeLevel() {
    if (!world) return;
    world.traverse(o => { if (o.isMesh && o.userData.own) { o.geometry.dispose(); if (o.material.aoMap) o.material.aoMap.dispose(); } });
    v.scene.remove(world); world = null;
  }
  function buildFloor() {
    setup(); disposeLevel();
    const { m, G } = looks();
    L = genLevel(floorN); const { S, g } = L;
    world = new Group(); v.scene.add(world);
    // walls: one merged mesh per wall style, faces only where a wall meets open space
    const bufs = [{ p: [], n: [], u: [], idx: [] }, { p: [], n: [], u: [], idx: [] }];
    const open = (x, y) => x >= 0 && y >= 0 && x < S && y < S && g[y * S + x] !== 1;
    const quad = (b, a0, a1, nrm) => {
      const k = b.p.length / 3, [x0, z0] = a0, [x1, z1] = a1;
      b.p.push(x0, 0, z0, x1, 0, z1, x1, WH, z1, x0, WH, z0); for (let i = 0; i < 4; i++) b.n.push(...nrm);
      b.u.push(0, 0, 1, 0, 1, 1, 0, 1); b.idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (g[y * S + x] !== 1) continue;
      const X = x * CS, Z = y * CS;
      const st = (nx, ny) => { const r = L.room[ny * S + nx]; return r >= 0 ? L.rooms[r].style : 0; };
      if (open(x, y - 1)) quad(bufs[st(x, y - 1)], [X + CS, Z], [X, Z], [0, 0, -1]);
      if (open(x, y + 1)) quad(bufs[st(x, y + 1)], [X, Z + CS], [X + CS, Z + CS], [0, 0, 1]);
      if (open(x - 1, y)) quad(bufs[st(x - 1, y)], [X, Z], [X, Z + CS], [-1, 0, 0]);
      if (open(x + 1, y)) quad(bufs[st(x + 1, y)], [X + CS, Z + CS], [X + CS, Z], [1, 0, 0]);
    }
    bufs.forEach((b, i) => {
      if (!b.idx.length) return;
      const geo = new BufferGeometry(); geo.setAttribute('position', new BufferAttribute(new Float32Array(b.p), 3)); geo.setAttribute('normal', new BufferAttribute(new Float32Array(b.n), 3));
      geo.setAttribute('uv', new BufferAttribute(new Float32Array(b.u), 2)); geo.setIndex(b.idx);
      const w = new Mesh(geo, i ? m.wallB : m.wallA); w.castShadow = w.receiveShadow = true; w.userData.own = true; world.add(w);
    });
    // floor + ceiling with baked ambient occlusion (darker where floor meets wall)
    const ao = bakeAO(L), fm = m.floor.clone(), cm = m.ceil.clone();
    fm.map = m.floor.map.clone(); fm.map.repeat.set(S, S); fm.normalMap = m.floor.normalMap.clone(); fm.normalMap.repeat.set(S, S); fm.roughnessMap = m.floor.roughnessMap.clone(); fm.roughnessMap.repeat.set(S, S);
    cm.map = m.ceil.map.clone(); cm.map.repeat.set(S, S); cm.normalMap = m.ceil.normalMap.clone(); cm.normalMap.repeat.set(S, S);
    for (const t of [fm.map, fm.normalMap, fm.roughnessMap, cm.map, cm.normalMap]) t.needsUpdate = true;
    fm.aoMap = ao; fm.aoMapIntensity = 1; cm.aoMap = ao; cm.aoMapIntensity = .9;
    const plane = (y, up, mat) => {
      const D = S * CS, geo = new BufferGeometry(), p = up ? [0, y, 0, 0, y, D, D, y, D, D, y, 0] : [0, y, 0, D, y, 0, D, y, D, 0, y, D];
      const uv = up ? [0, 1, 0, 0, 1, 0, 1, 1] : [0, 1, 1, 1, 1, 0, 0, 0];
      geo.setAttribute('position', new BufferAttribute(new Float32Array(p), 3)); geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2)); geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
      const ms = new Mesh(geo, mat); ms.receiveShadow = true; ms.userData.own = true; world.add(ms); return ms;
    };
    plane(0, true, fm); plane(WH, false, cm);
    // doors (slide sideways into the wall) with frames
    doors = [];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (g[y * S + x] !== 2) continue;
      const alongX = g[y * S + x - 1] === 1, d = { x, y, alongX, open: 0, cx: (x + .5) * CS, cz: (y + .5) * CS, sound: 0 };
      const slab = P(G.box, m.door, alongX ? { sx: CS, sy: WH - .3, sz: .14 } : { sx: .14, sy: WH - .3, sz: CS }); slab.position.set(d.cx, (WH - .3) / 2, d.cz);
      const top = P(G.box, m.frame, alongX ? { sx: CS, sy: .3, sz: .5 } : { sx: .5, sy: .3, sz: CS }); top.position.set(d.cx, WH - .15, d.cz);
      const lamp = P(G.box, m.red, { sx: .3, sy: .06, sz: .06, cast: false }); lamp.position.set(d.cx, WH - .34, d.cz); if (!alongX) lamp.rotation.y = Math.PI / 2;
      for (const s of [-1, 1]) { const post = P(G.box, m.frame, alongX ? { sx: .12, sy: WH, sz: .4 } : { sx: .4, sy: WH, sz: .12 }); post.position.set(d.cx + (alongX ? s * (CS / 2 - .06) : 0), WH / 2, d.cz + (alongX ? 0 : s * (CS / 2 - .06))); world.add(post); }
      world.add(slab, top, lamp); d.slab = slab; d.lamp = lamp; doors.push(d);
    }
    L.doorIx = new Map(doors.map(d => [d.y * S + d.x, d]));
    // lamps: instanced fittings + light shafts
    const N = L.lamps.length, shades = new InstancedMesh(G.shade, m.shade, N), bulbs = new InstancedMesh(G.ball, m.bulb, N), shafts = new InstancedMesh(G.cone, m.shaft, N), mx = new Object3D();
    L.lamps.forEach((l, i) => {
      mx.position.set(l.x, WH - .1, l.z); mx.scale.set(1, 1, 1); mx.rotation.set(0, 0, 0); mx.updateMatrix(); shades.setMatrixAt(i, mx.matrix);
      mx.position.y = WH - .2; mx.scale.setScalar(.08); mx.updateMatrix(); bulbs.setMatrixAt(i, mx.matrix);
      mx.position.y = (WH - .2) / 2 + .1; mx.scale.set(1.15, WH - .25, 1.15); mx.updateMatrix(); shafts.setMatrixAt(i, mx.matrix);
    });
    shades.castShadow = false; shafts.renderOrder = 4; world.add(shades, bulbs, shafts); L.bulbs = bulbs;
    // pipes along some corridor ceilings, for depth
    for (let k = 0; k < 6; k++) { const r = L.rooms[k % L.rooms.length]; const pp = P(G.cyl, m.pipe, { sx: .07, sy: r.w * CS, sz: .07, rz: Math.PI / 2, cast: false }); pp.position.set((r.x + r.w / 2) * CS, WH - .12, r.y * CS + .2 + (k % 2) * .2); world.add(pp); }
    // props
    barrels = [];
    const crates = L.props.filter(p => p.k === 3), cr = new InstancedMesh(rbox(1, 1, 1, .035), m.crate, Math.max(1, crates.length * 2)); cr.count = 0; cr.castShadow = cr.receiveShadow = true;
    for (const p of crates) {
      const s = rnd(1.1, 1.4); mx.position.set((p.i + .5) * CS, s / 2, (p.j + .5) * CS); mx.rotation.set(0, rnd(-.3, .3), 0); mx.scale.setScalar(s); mx.updateMatrix(); cr.setMatrixAt(cr.count++, mx.matrix);
      if (Math.random() < .5) { const s2 = s * .6; mx.position.y = s + s2 / 2; mx.rotation.y += rnd(-.5, .5); mx.scale.setScalar(s2); mx.updateMatrix(); cr.setMatrixAt(cr.count++, mx.matrix); }
    }
    world.add(cr);
    for (const p of L.props.filter(q => q.k === 4)) {
      const b = new Group(); b.position.set((p.i + .5) * CS + rnd(-.3, .3), 0, (p.j + .5) * CS + rnd(-.3, .3));
      b.add(P(G.barrel, m.barrel, { sy: .95, y: .48 }), P(G.cyl, m.barrelBand, { sx: .35, sy: .04, sz: .35, y: .2 }), P(G.cyl, m.barrelBand, { sx: .35, sy: .04, sz: .35, y: .76 }), P(G.box, m.hazard, { sx: .2, sy: .2, sz: .02, y: .5, z: .34, cast: false }));
      world.add(b); barrels.push({ ...p, m: b, x: b.position.x, z: b.position.z, alive: true });
    }
    for (const bn of L.banners) { const b = P(G.plane, m.banner, { sx: 1.1, sy: 1.6, cast: false }); b.position.set(bn.x, WH * .58, bn.z); world.add(b); }
    // the lift: glowing ring, light beam, sign
    const ex = { x: (L.exitR.cx + .5) * CS, z: (L.exitR.cy + .5) * CS }; L.exit = ex;
    const ring = P(G.torus, m.green, { s: .75, rx: Math.PI / 2, y: .05, cast: false }), pad = P(G.cyl, m.greenDim, { sx: .8, sy: .04, sz: .8, y: .02, cast: false });
    const beam = new Mesh(G.cone, m.beam); beam.scale.set(.8, WH, .8); beam.position.y = WH / 2; beam.rotation.x = Math.PI; beam.renderOrder = 4;
    const sign = P(G.plane, m.sign, { sx: 1, sy: .38, y: 2.1, cast: false }); sign.material.side = DoubleSide;
    const lift = new Group(); lift.position.set(ex.x, 0, ex.z); lift.add(ring, pad, beam, sign); world.add(lift); L.lift = lift; L.sign = sign; L.ring = ring;
    exitL.position.set(ex.x, 1.2, ex.z); exitL.intensity = 3;
    // guards and pickups
    foes = [];
    const cells = []; for (const r of L.rooms) if (r !== L.start) for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) if (g[j * S + i] === 0) cells.push([i, j, r]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (g[y * S + x] === 0 && L.room[y * S + x] < 0 && Math.hypot(x - L.start.cx, y - L.start.cy) > 5 && Math.random() < .08) cells.push([x, y, null]);
    shuffle(cells);
    const nFoes = Math.min(14, 4 + floorN * 2);
    for (let k = 0; k < nFoes && cells.length; k++) {
      const [i, j] = cells.pop(), kind = floorN >= 2 && Math.random() < .2 ? 'heavy' : floorN >= 1 && Math.random() < .3 ? 'officer' : 'guard', T = TYPES[kind];
      const f = { kind, T, x: (i + .5) * CS + rnd(-.4, .4), z: (j + .5) * CS + rnd(-.4, .4), yaw: rnd(0, 6.28), hp: T.hp * (1 + floorN * .08), state: 'idle', cd: rnd(.5, 1.5), seen: 0, walk: 0, flash: 0, ko: 0, path: null, lastX: 0, lastZ: 0, think: Math.random() * .3, aim: 0, hatV: null };
      f.r = makeGuard(kind); f.r.g.position.set(f.x, 0, f.z); world.add(f.r.g); foes.push(f);
    }
    pickups = [];
    const kinds = ['plans', 'plans', 'plans', 'med', 'ammo', 'ammo'];
    if (floorN === 0 || Math.random() < .35) kinds.push('smg');
    if (floorN > 0) kinds.push('med');
    for (const k of kinds) { if (!cells.length) break; const [i, j] = cells.pop(); const p = { k, x: (i + .5) * CS, z: (j + .5) * CS, m: pickupMesh(k) }; p.m.position.set(p.x, .5, p.z); world.add(p.m); pickups.push(p); }
    // player
    pl = { x: (L.start.cx + .5) * CS, z: (L.start.cy + .5) * CS, a: 0, hp: pl ? pl.hp : 100, bob: 0, sp: 0, roll: 0, dead: 0 };
    // face the most open direction
    let bestA = 0, bestD = 0; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, d = ray(pl.x, pl.z, -Math.sin(a), -Math.cos(a), 30).d; if (d > bestD) { bestD = d; bestA = a; } } pl.a = bestA;
    holes.count = 0; holeN = 0; add.clear(); smoke.clear();
    // the new floor's shaders compile in the background while the screen is black; it fades in when they're ready
    // (the first floor: the view warms itself before its first frame, as the round starts)
    if (floorN > 0) { shadersReady = false; v.precompile().then(() => { shadersReady = true; }); }
    msg = { txt: `FLOOR ${floorN + 1}`, sub: floorN ? 'Find the green lift' : 'Find the green lift · knock out the guards', l: 2.6 };
  }
  function pickupMesh(k) {
    const { m, G } = looks(), g = new Group();
    if (k === 'med') g.add(B(.4, .26, .28, m.med, { r: .04 }), P(G.box, m.red, { sx: .08, sy: .2, sz: .29, cast: false }), P(G.box, m.red, { sx: .24, sy: .08, sz: .29, cast: false }));
    else if (k === 'ammo') g.add(B(.45, .22, .26, m.ammo, { r: .03 }), P(G.box, m.hazard, { sx: .46, sy: .05, sz: .27, cast: false }), ...[-.1, 0, .1].map(x => P(G.cyl, m.brass, { sx: .025, sy: .12, sz: .025, x, y: .16 })));
    else if (k === 'plans') g.add(B(.36, .04, .28, m.gold, { r: .01 }), P(G.box, m.star, { sx: .1, sy: .045, sz: .1, cast: false }));
    else { const gun = makeViewGun('smg'); gun.scale.setScalar(2.2); gun.rotation.y = Math.PI / 2; g.add(gun); gun.flash.visible = false; }
    const halo = new Mesh(G.ball, new MeshBasicMaterial({ color: k === 'plans' ? new Color(1.2, .8, .2) : k === 'med' ? new Color(1.2, .3, .3) : new Color(.4, 1.2, .5), transparent: true, opacity: .08, depthWrite: false, blending: AdditiveBlending }));
    halo.scale.setScalar(.55); halo.userData.own = true; g.add(halo);
    return g;
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function bakeAO(L) {
    const { S, g } = L, R = 8, N = S * R, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const c = cv.getContext('2d'), img = c.createImageData(N, N), v0 = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const k = g[(y / R | 0) * S + (x / R | 0)]; v0[y * N + x] = k === 1 ? 0 : k === 3 ? .35 : 1; }
    let a = v0, b = new Float32Array(N * N);
    for (let pass = 0; pass < 3; pass++) for (const horiz of [1, 0]) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let s = 0, n = 0; for (let d = -4; d <= 4; d++) { const xx = horiz ? x + d : x, yy = horiz ? y : y + d; if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue; s += a[yy * N + xx]; n++; } b[y * N + x] = s / n; }
      [a, b] = [b, a];
    }
    for (let i = 0; i < N * N; i++) { const val = Math.round((.25 + .75 * Math.min(1, a[i] * 1.25)) * 255); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = val; img.data[i * 4 + 3] = 255; }
    c.putImageData(img, 0, 0); const t = new CanvasTexture(cv); return t;
  }

  /* ---------- grid queries ---------- */
  const cellAt = (x, z) => { const i = Math.floor(x / CS), j = Math.floor(z / CS); return i < 0 || j < 0 || i >= L.S || j >= L.S ? 1 : L.g[j * L.S + i]; };
  const doorAt = (x, z) => L.doorIx.get(Math.floor(z / CS) * L.S + Math.floor(x / CS));
  function solid(x, z) { const c = cellAt(x, z); if (c === 1 || c === 3 || c === 4) return true; if (c === 2) return doorAt(x, z).open < .85; return false; }
  function sightBlock(x, z) { const c = cellAt(x, z); if (c === 1) return true; if (c === 2) return doorAt(x, z).open < .6; return false; }
  function ray(x, z, dx, dz, max) {   // grid walk (DDA) to the first wall / closed door: { d, x, z, nx, nz }
    let i = Math.floor(x / CS), j = Math.floor(z / CS), d = 0, nx = 0, nz = 0;
    const si = dx > 0 ? 1 : -1, sj = dz > 0 ? 1 : -1, ddx = dx ? Math.abs(CS / dx) : 1e9, ddz = dz ? Math.abs(CS / dz) : 1e9;
    let tx = dx ? ((dx > 0 ? (i + 1) * CS : i * CS) - x) / dx : 1e9, tz = dz ? ((dz > 0 ? (j + 1) * CS : j * CS) - z) / dz : 1e9;
    for (let n = 0; n < 64; n++) {
      if (tx < tz) { d = tx; tx += ddx; i += si; nx = -si; nz = 0; } else { d = tz; tz += ddz; j += sj; nz = -sj; nx = 0; }
      if (d >= max) break;
      if (i < 0 || j < 0 || i >= L.S || j >= L.S) break;
      const c = L.g[j * L.S + i];
      if (c === 1 || (c === 2 && L.doorIx.get(j * L.S + i).open < .6)) return { d, x: x + dx * d, z: z + dz * d, nx, nz };
    }
    return { d: max, x: x + dx * max, z: z + dz * max, nx: 0, nz: 0 };
  }
  function los(ax, az, bx, bz) { const d = Math.hypot(bx - ax, bz - az); if (d < .01) return true; return ray(ax, az, (bx - ax) / d, (bz - az) / d, d).d >= d - .05; }
  function moveBody(o, dx, dz, r) {
    if (!solid(o.x + dx + Math.sign(dx) * r, o.z + r * .7) && !solid(o.x + dx + Math.sign(dx) * r, o.z - r * .7)) o.x += dx;
    if (!solid(o.x + r * .7, o.z + dz + Math.sign(dz) * r) && !solid(o.x - r * .7, o.z + dz + Math.sign(dz) * r)) o.z += dz;
  }
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  /* ---------- shooting ---------- */
  function target(cone) {   // the guard (or barrel) closest to the crosshair
    let best = null, bd = 1e9;
    const fx = -Math.sin(pl.a), fz = -Math.cos(pl.a);
    for (const f of [...foes, ...barrels]) {
      if (f.ko || f.alive === false) continue;
      const dx = f.x - pl.x, dz = f.z - pl.z, d = Math.hypot(dx, dz); if (d > 24 || d < .2) continue;
      if (dx * fx + dz * fz <= 0) continue;
      const diff = Math.abs(wrap(Math.atan2(-dx, -dz) - pl.a)), lim = Math.atan((f.kind ? .42 : .3) / d) + cone;
      if (diff > lim || !los(pl.x, pl.z, f.x, f.z)) continue;
      const sc = diff / lim + d * .01; if (sc < bd) { bd = sc; best = f; }
    }
    return best;
  }
  function fire(manual) {
    const G = weapon === 'smg';
    fireCD = G ? .1 : .3; kick = 1;
    if (G) { ammo--; if (ammo <= 0) { weapon = 'pistol'; feedMsg('OUT OF AMMO · PISTOL'); } }
    sfx(G ? 170 : 130, .09, 'sawtooth', .07, -100); sfx(1400, .03, 'square', .025, -1100); haptic('light');
    const fx = -Math.sin(pl.a), fz = -Math.cos(pl.a), gun = guns[weapon];
    gun.flash.visible = true; gun.flash.rotation.z = Math.random() * 3; gun.flash.scale.setScalar(G ? .16 : .13); flashL.intensity = 9;
    const mw = gun.flash.getWorldPosition(new THREE.Vector3()); flashL.position.copy(mw);
    for (let i = 0; i < 5; i++) add.emit({ x: mw.x + fx * .05, y: mw.y, z: mw.z + fz * .05, vx: fx * rnd(3, 7) + rnd(-1, 1), vy: rnd(-.5, 1), vz: fz * rnd(3, 7) + rnd(-1, 1), life: rnd(.06, .14), size: .006, col: [5, 3, 1.2], drag: 3 });
    smoke.emit({ x: mw.x + fx * .1, y: mw.y, z: mw.z + fz * .1, vx: fx * .6, vy: .3, vz: fz * .6, life: .7, size: .05, grow: 4, col: [.6, .6, .62], a: .18, drag: 2 });
    const cs = casings.find(c => c.t > 2.5) || casings[0]; cs.t = 0; cs.m.visible = true; cs.m.position.copy(mw).add(new THREE.Vector3(-fz * .1, .02, fx * .1)); cs.v = [-fz * 1.6 + rnd(-.3, .3), rnd(1.6, 2.4), fx * 1.6 + rnd(-.3, .3)]; cs.spin = rnd(10, 20);
    alertNear(pl.x, pl.z, 12);
    const f = target(manual ? .09 : .05);
    if (f) {
      if (!f.kind) { boom(f); return; }
      const dmg = (G ? 22 : 36) * rnd(.85, 1.15);
      f.hp -= dmg; f.flash = 1; f.state = 'alert'; f.seen = 3; hitT = .18;
      const hx = f.x - fx * .35, hz = f.z - fz * .35, hy = rnd(1, 1.6) * f.T.scale;
      for (let i = 0; i < 8; i++) add.emit({ x: hx, y: hy, z: hz, vx: rnd(-2, 2) - fx * 2, vy: rnd(0, 2.5), vz: rnd(-2, 2) - fz * 2, life: rnd(.2, .4), size: .025, col: [4, 2.4, .8], grav: 9, drag: 1 });
      smoke.emit({ x: hx, y: hy, z: hz, vx: 0, vy: .3, vz: 0, life: .5, size: .2, grow: 2, col: [.9, .88, .8], a: .35 });
      sfx(330, .05, 'square', .03, -150);
      if (f.hp <= 0) knockOut(f);
    } else {
      const h = ray(pl.x, pl.z, fx + rnd(-.015, .015), fz + rnd(-.015, .015), 30), y = EYE + rnd(-.25, .1) + (h.d > 1 ? rnd(-.15, .15) : 0);
      if (h.d < 30) {
        const nx = h.nx || 0, nz = h.nz || 0;
        for (let i = 0; i < 10; i++) add.emit({ x: h.x, y, z: h.z, vx: nx * rnd(1, 4) + rnd(-1.5, 1.5), vy: rnd(-.5, 3), vz: nz * rnd(1, 4) + rnd(-1.5, 1.5), life: rnd(.25, .55), size: .02, col: [5, 3, 1], grav: 9.8, drag: .5, floor: .02 });
        smoke.emit({ x: h.x + nx * .05, y, z: h.z + nz * .05, vx: nx * .4, vy: .2, vz: nz * .4, life: .9, size: .15, grow: 3, col: [.55, .55, .55], a: .4, drag: 1.5 });
        const mx = new Object3D(); mx.position.set(h.x + nx * .01, y, h.z + nz * .01); mx.lookAt(h.x + nx, y, h.z + nz); mx.scale.setScalar(rnd(.06, .09)); mx.updateMatrix();
        holes.setMatrixAt(holeN % 60, mx.matrix); holeN++; holes.count = Math.min(60, holeN); holes.instanceMatrix.needsUpdate = true;
        sfx(rnd(600, 900), .03, 'triangle', .02, -300);
      }
    }
  }
  function boom(b) {
    b.alive = false; world.remove(b.m); L.g[b.j * L.S + b.i] = 0;
    haptic('heavy'); sfx(60, .5, 'sawtooth', .09, -30); sfx(120, .35, 'square', .05, -80); shake = 1;
    flashL.position.set(b.x, 1, b.z); flashL.intensity = 60;
    for (let i = 0; i < 70; i++) { const a = Math.random() * 6.28, s = rnd(1, 7), u = rnd(-.2, 1); add.emit({ x: b.x, y: .6, z: b.z, vx: Math.cos(a) * s, vy: u * 6, vz: Math.sin(a) * s, life: rnd(.3, .9), size: rnd(.06, .25), grow: 1, col: [6, rnd(2, 3.4), .6], drag: 2.5, grav: 2 }); }
    for (let i = 0; i < 26; i++) smoke.emit({ x: b.x + rnd(-.4, .4), y: rnd(.3, 1.5), z: b.z + rnd(-.4, .4), vx: rnd(-1, 1), vy: rnd(.4, 1.6), vz: rnd(-1, 1), life: rnd(1.4, 2.6), size: rnd(.4, .8), grow: 2.4, col: [.18, .17, .16], a: .55, drag: 1, fadeIn: 1 });
    const mx = new Object3D(); mx.position.set(b.x, .015, b.z); mx.rotation.x = -Math.PI / 2; mx.scale.setScalar(2.6); mx.updateMatrix(); holes.setMatrixAt(holeN % 60, mx.matrix); holeN++; holes.count = Math.min(60, holeN); holes.instanceMatrix.needsUpdate = true;
    for (const f of foes) { if (f.ko) continue; const d = Math.hypot(f.x - b.x, f.z - b.z); if (d < 3.4) { f.hp -= 260 * (1 - d / 3.4) + 60; f.flash = 1; if (f.hp <= 0) knockOut(f, true); } }
    const dp = Math.hypot(pl.x - b.x, pl.z - b.z); if (dp < 3.4) hurt(42 * (1 - dp / 3.4) + 6, b.x, b.z);
    for (const o of barrels) if (o.alive && Math.hypot(o.x - b.x, o.z - b.z) < 2.6) later(() => o.alive && state === 'play' && boom(o), 180);
    alertNear(b.x, b.z, 16);
  }
  function knockOut(f, blast) {
    f.ko = .001; f.state = 'ko'; f.r.glint.visible = false;
    const pts = Math.round(f.T.score * (1 + floorN * .25)); score += pts; api.score(score);
    feedMsg(`${f.kind === 'officer' ? 'OFFICER' : f.kind === 'heavy' ? 'HEAVY' : 'GUARD'} KNOCKED OUT +${pts}`);
    f.hatV = { x: rnd(-1, 1) + (blast ? rnd(-2, 2) : 0), y: rnd(3, 4.5), z: rnd(-1, 1), rx: rnd(-8, 8) };
    f.fallDir = Math.sign(wrap(Math.atan2(pl.x - f.x, pl.z - f.z) - f.yaw)) || 1;
    sfx(520, .08, 'square', .04, 300); later(() => sfx(780, .1, 'triangle', .04, 200), 90); haptic('medium');
    for (let i = 0; i < 12; i++) add.emit({ x: f.x, y: 1.6 * f.T.scale, z: f.z, vx: rnd(-1.5, 1.5), vy: rnd(1, 3), vz: rnd(-1.5, 1.5), life: rnd(.4, .8), size: .05, col: [5, 4.2, 1], grav: 5 });
  }
  function hurt(n, fromX, fromZ) {
    if (pl.dead) return;
    pl.hp = Math.max(0, pl.hp - n); hurtT = 1; shake = Math.max(shake, .5);
    hurtDir = wrap(Math.atan2(-(fromX - pl.x), -(fromZ - pl.z)) - pl.a);
    haptic('heavy'); sfx(90, .16, 'sawtooth', .06, -40);
    if (pl.hp <= 0) { pl.dead = .001; haptic('error'); msg = { txt: 'CAPTURED', sub: `Floor ${floorN + 1}`, l: 9 }; }
  }
  function alertNear(x, z, r) { for (const f of foes) if (!f.ko && Math.hypot(f.x - x, f.z - z) < r && (f.state === 'idle') && (los(f.x, f.z, x, z) || Math.hypot(f.x - x, f.z - z) < r * .5)) { f.state = 'alert'; f.cd = Math.max(f.cd, rnd(.5, .9)); f.lastX = pl.x; f.lastZ = pl.z; } }
  function feedMsg(txt) { feed.unshift({ txt, l: 2.4 }); feed.length = Math.min(feed.length, 3); }

  /* ---------- guards' brains ---------- */
  function think(f, dt) {
    const dx = pl.x - f.x, dz = pl.z - f.z, d = Math.hypot(dx, dz);
    f.think -= dt;
    if (f.think <= 0) {
      f.think = .2; f.canSee = !pl.dead && d < 18 && los(f.x, f.z, pl.x, pl.z);
      if (f.state === 'idle' && f.canSee && (Math.abs(wrap(Math.atan2(dx, dz) - f.yaw)) < 1.2 || d < 3)) { f.state = 'alert'; f.cd = rnd(.6, 1.1) / (1 + floorN * .1); sfx(260, .12, 'square', .03, 120); }
      if (f.canSee) { f.lastX = pl.x; f.lastZ = pl.z; f.seen = 3; }
    }
    if (f.state === 'idle') { f.yaw += Math.sin(t * .5 + f.x) * dt * .4; return 0; }
    f.seen -= dt;
    const want = Math.atan2((f.canSee ? pl.x : f.lastX) - f.x, (f.canSee ? pl.z : f.lastZ) - f.z);
    f.yaw += clamp(wrap(want - f.yaw), -6 * dt, 6 * dt);
    let moving = 0;
    if (f.canSee && d < 9) {
      // in sight: hold position and shoot, with a visible glint as warning
      f.cd -= dt;
      if (f.cd < .35) f.aim = 1;
      if (f.cd <= 0) {
        f.cd = rnd(.8, 1.3) / f.T.rate / (1 + floorN * .06); f.aim = 0;
        const n = f.kind === 'heavy' ? 4 : 1;
        for (let k = 0; k < n; k++) later(() => enemyShot(f), k * 90);
      }
      if (d < 2.2) { moving = -1; }   // back off a little when you get close
    } else {
      f.aim = 0;
      // chase: follow a path toward where you were last seen
      f.pathT = (f.pathT || 0) - dt;
      if (f.pathT <= 0 || !f.path) { f.pathT = .6; f.path = pathTo(f, f.lastX, f.lastZ); }
      if (f.path) moving = 1;
      if (f.seen < -6) { f.state = 'idle'; }
    }
    if (moving) {
      let tx, tz;
      if (moving > 0 && f.path) { [tx, tz] = f.path; } else { tx = f.x - dx; tz = f.z - dz; }
      const ddx = tx - f.x, ddz = tz - f.z, dd = Math.hypot(ddx, ddz);
      if (dd > .05) { const s = f.T.speed * dt; moveBody(f, ddx / dd * Math.min(s, dd), ddz / dd * Math.min(s, dd), .3); if (moving > 0 && !f.canSee) f.yaw += clamp(wrap(Math.atan2(ddx, ddz) - f.yaw), -8 * dt, 8 * dt); }
      if (moving > 0 && dd < .2) f.path = null;
      return f.T.speed;
    }
    return 0;
  }
  function pathTo(f, x, z) {   // next cell centre on the way (BFS over the grid)
    const S = L.S, si = Math.floor(f.x / CS), sj = Math.floor(f.z / CS), ti = Math.floor(x / CS), tj = Math.floor(z / CS);
    if (si === ti && sj === tj) return [x, z];
    const d = bfs(L.g, S, ti, tj); let best = null, bv = d[sj * S + si];
    if (bv < 0) return null;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v2 = d[(sj + b) * S + si + a]; if (v2 >= 0 && v2 < bv) { bv = v2; best = [si + a, sj + b]; } }
    return best ? [(best[0] + .5) * CS, (best[1] + .5) * CS] : null;
  }
  function enemyShot(f) {
    if (f.ko || pl.dead || state !== 'play') return;
    const d = Math.hypot(pl.x - f.x, pl.z - f.z), mv = Math.min(1, pl.sp / 3);
    const p = clamp(.82 - d * .05 - mv * .22 + floorN * .03, .12, .85);
    const mw = f.r.glint.getWorldPosition(new THREE.Vector3());
    flashL.position.copy(mw); flashL.intensity = Math.max(flashL.intensity, 5);
    sfx(f.kind === 'heavy' ? 200 : 150, .08, 'sawtooth', .04, -80);
    const hit = Math.random() < p, tx = pl.x + (hit ? 0 : rnd(-1, 1)), tz = pl.z + (hit ? 0 : rnd(-1, 1));
    for (let i = 0; i < 6; i++) { const k = i / 6 + Math.random() * .1; add.emit({ x: mw.x + (tx - mw.x) * k, y: mw.y + (EYE - .2 - mw.y) * k, z: mw.z + (tz - mw.z) * k, life: .06 + k * .05, size: .03, col: [4, 3, 1.5] }); }
    for (let i = 0; i < 3; i++) add.emit({ x: mw.x, y: mw.y, z: mw.z, vx: rnd(-1, 1), vy: rnd(0, 1), vz: rnd(-1, 1), life: .1, size: .05, col: [5, 3, 1] });
    if (hit) hurt(f.T.dmg * (1 + floorN * .1) * rnd(.8, 1.2), f.x, f.z);
  }

  /* ---------- per-frame ---------- */
  function step(dt) {
    t += dt;
    if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
    for (const m of feed) m.l -= dt; feed = feed.filter(m => m.l > 0);
    hurtT = Math.max(0, hurtT - dt * 1.4); hitT = Math.max(0, hitT - dt); shake = Math.max(0, shake - dt * 2.5); kick = Math.max(0, kick - dt * 9);
    if (state === 'clear') { stT += dt; fade = Math.min(1, stT / .6); if (stT > .8) { floorN++; buildFloor(); state = 'in'; stT = 0; waitT = 0; } return; }
    if (state === 'in' && waiting()) { waitT += dt; return; }   // still black: the new floor's shaders aren't ready yet
    if (state === 'in') { stT += dt; fade = Math.max(0, 1 - stT / .5); if (stT > .5) state = 'play'; }
    if (pl.dead) { pl.dead += dt; fade = Math.min(.85, pl.dead / 1.6); if (pl.dead > 1.8) { state = 'over'; api.over(); } return; }
    // input: drag stick (tank controls) + keys
    let fwd = 0, turn = 0, strafe = 0;
    if (stick) {
      const R = Math.min(W, H) * .14, sx = clamp((stick.x - stick.ax) / R, -1, 1), sy = clamp((stick.y - stick.ay) / R, -1, 1);
      const dz2 = v => Math.abs(v) < .18 ? 0 : (v - Math.sign(v) * .18) / .82;
      fwd = -dz2(sy);
      if (look) strafe = dz2(sx); else { turn = dz2(sx); turn = Math.sign(turn) * Math.abs(turn) ** 1.4; }
    }
    if (look) look.hold = performance.now() - look.t0 > 250 && look.moved < 10;
    if (keys.has('ArrowUp') || keys.has('w')) fwd = 1; if (keys.has('ArrowDown') || keys.has('s')) fwd = -1;
    if (keys.has('ArrowLeft') || keys.has('a')) turn = -1; if (keys.has('ArrowRight') || keys.has('d')) turn = 1;
    if (keys.has('q')) strafe = -1; if (keys.has('e')) strafe = 1;
    pl.a -= turn * 2.5 * dt;
    pl.roll = approach(pl.roll, -turn * .03, 6, dt);
    const sp = 3.6 * (fwd < 0 ? .7 : 1), fx = -Math.sin(pl.a), fz = -Math.cos(pl.a);
    const vx = (fx * fwd + -fz * strafe) * sp, vz = (fz * fwd + fx * strafe) * sp;
    const ox = pl.x, oz = pl.z; moveBody(pl, vx * dt, vz * dt, .32);
    pl.sp = Math.hypot(pl.x - ox, pl.z - oz) / Math.max(dt, 1e-4); pl.bob += pl.sp * dt * 2.6;
    if (pl.sp > .5 && Math.floor(pl.bob / Math.PI) !== Math.floor((pl.bob - pl.sp * dt * 2.6) / Math.PI)) sfx(70, .04, 'triangle', .025);
    // doors open for anyone nearby
    for (const d of doors) {
      const near = Math.hypot(pl.x - d.cx, pl.z - d.cz) < 2.4 || foes.some(f => !f.ko && f.state !== 'idle' && Math.hypot(f.x - d.cx, f.z - d.cz) < 2);
      const was = d.open; d.open = clamp(d.open + (near ? 2.2 : -1.2) * dt, 0, 1);
      if (near && was === 0) sfx(110, .3, 'sawtooth', .025, 60);
      if (!near && d.open < .85 && Math.hypot(pl.x - d.cx, pl.z - d.cz) < .9) d.open = .86;   // never close on you
    }
    // firing: automatic when a guard is lined up, plus taps / space
    fireCD -= dt;
    auto = target(.03);
    if (fireCD <= 0 && ((auto && auto.kind) || keys.has(' ') || (look && look.hold))) fire(false);
    // pickups
    for (const p of pickups) {
      if (p.got || Math.hypot(p.x - pl.x, p.z - pl.z) > .8) continue;
      if (p.k === 'med' && pl.hp >= 100) continue;
      p.got = true; world.remove(p.m); haptic('success'); sfx(880, .08, 'triangle', .05, 400);
      if (p.k === 'med') { pl.hp = Math.min(100, pl.hp + 35); feedMsg('MEDKIT +35'); }
      else if (p.k === 'ammo') { ammo += 30; if (weapon === 'pistol' && hasSMG) weapon = 'smg'; feedMsg(hasSMG ? 'AMMO +30' : 'AMMO +30 (for the SMG)'); }
      else if (p.k === 'plans') { score += 50; api.score(score); feedMsg('SECRET PLANS +50'); }
      else { hasSMG = true; weapon = 'smg'; ammo += 60; feedMsg('SMG · HOLD TO SPRAY'); }
    }
    // the lift
    if (Math.hypot(pl.x - L.exit.x, pl.z - L.exit.z) < .8) {
      const left = foes.filter(f => !f.ko).length, bonus = 300 + floorN * 150 + (left ? 0 : 250);
      score += bonus; api.score(score); haptic('success'); sfx(520, .15, 'triangle', .05, 520); later(() => sfx(780, .2, 'triangle', .05, 520), 140);
      msg = { txt: 'FLOOR CLEAR', sub: `+${bonus}${left ? '' : ' · every guard out cold'}`, l: 2 }; state = 'clear'; stT = 0; pl.hp = Math.min(100, pl.hp + 20); return;
    }
    // guards
    for (const f of foes) {
      f.flash = Math.max(0, f.flash - dt * 6);
      if (f.ko) {
        f.ko += dt;
        if (f.hatV) { const h = f.r.hat; h.position.x += f.hatV.x * dt * .5; h.position.y += f.hatV.y * dt * .5; h.position.z += f.hatV.z * dt * .5; f.hatV.y -= 9 * dt; h.rotation.x += f.hatV.rx * dt; if (f.ko > .6) f.hatV = null; }
        continue;
      }
      const s = think(f, dt); f.walk += s * dt * 4.5; f.moving = s;
    }
    // casings, particles, dust in the air
    for (const c of casings) {
      if (c.t > 2.5) { c.m.visible = false; continue; }
      c.t += dt; c.v[1] -= 9.8 * dt; c.m.position.x += c.v[0] * dt; c.m.position.y += c.v[1] * dt; c.m.position.z += c.v[2] * dt; c.m.rotation.x += c.spin * dt; c.m.rotation.z += c.spin * .6 * dt;
      if (c.m.position.y < .01) { c.m.position.y = .01; c.v[1] *= -.4; c.v[0] *= .5; c.v[2] *= .5; c.spin *= .5; if (Math.abs(c.v[1]) > .3) sfx(rnd(2400, 3200), .02, 'triangle', .01); }
    }
    if (Math.random() < dt * 30) dust.emit({ x: pl.x + rnd(-5, 5), y: rnd(.3, WH - .2), z: pl.z + rnd(-5, 5), vx: rnd(-.05, .05), vy: rnd(-.03, .05), vz: rnd(-.05, .05), life: rnd(3, 6), size: .012, col: [1.1, .95, .7], a: .5, fadeIn: 1 });
    if (Math.random() < dt * 4) { const e = L.exit; add.emit({ x: e.x + rnd(-.6, .6), y: .1, z: e.z + rnd(-.6, .6), vy: rnd(.4, 1), life: rnd(1, 2), size: .03, col: [.6, 3, 1.2], fadeIn: 1 }); }
  }
  function fxTick(dt) { add.update(dt); smoke.update(dt); dust.update(dt); flashL.intensity *= Math.pow(.0005, dt); }

  /* ---------- drawing ---------- */
  function scene3d() {
    const cam = v.cam, bob = Math.sin(pl.bob) * .045 * Math.min(1, pl.sp / 3), sh = shake * .06;
    const deadK = pl.dead ? Math.min(1, pl.dead / .9) : 0;
    cam.position.set(pl.x + rnd(-sh, sh), EYE + bob - deadK * 1.1 + rnd(-sh, sh), pl.z + rnd(-sh, sh));
    cam.rotation.set(-deadK * .3 + kick * .015, pl.a, pl.roll + deadK * .6, 'YXZ');
    // vertical FOV that keeps about 76 degrees across, whatever the shape of the screen
    const asp = W / H, vf = clamp(2 * Math.atan(Math.tan(38 * Math.PI / 180) / asp) * 180 / Math.PI, 52, 88);
    if (Math.abs(cam.fov - vf) > .01) { cam.fov = vf; cam.updateProjectionMatrix(); }
    // torch: a shadow-casting spotlight just above the gun
    const fx = -Math.sin(pl.a), fz = -Math.cos(pl.a);
    spt.position.set(pl.x - fz * .25 + fx * -.1, EYE + .25, pl.z + fx * .25 + fz * -.1); spt.target.position.set(pl.x + fx * 6, EYE - .6, pl.z + fz * 6); spt.target.updateMatrixWorld();
    v.placeLamps(L.lamps, pl.x, EYE, pl.z, t);
    // view gun: sway, bob, recoil
    for (const k in guns) guns[k].visible = k === weapon;
    const gn = guns[weapon]; gn.flash.visible = kick > .7;
    gunG.position.set(.13 + Math.cos(pl.bob * .5) * .012 * Math.min(1, pl.sp / 3), -.15 + Math.abs(Math.sin(pl.bob * .5)) * .012 - deadK * .3, -.32 + kick * .05);
    gunG.rotation.set(kick * .14, .04 + pl.roll * 2, 0);
    // doors slide into the wall
    for (const d of doors) { const o = d.open * (CS - .2); d.slab.position.set(d.cx + (d.alongX ? o : 0), (WH - .3) / 2, d.cz + (d.alongX ? 0 : o)); d.lamp.material = d.open > .5 ? looks().m.green : looks().m.red; }
    // guards
    for (const f of foes) {
      const r = f.r, g = r.g, far = Math.hypot(f.x - pl.x, f.z - pl.z) > 22;
      g.visible = !far; if (far) continue;
      g.position.set(f.x, 0, f.z);
      if (f.ko) {
        const k = Math.min(1, f.ko / .55), e = 1 - (1 - k) ** 3;
        g.rotation.set(-e * Math.PI / 2 * .96, f.yaw, 0, 'YXZ'); g.position.y = e * .22;
        r.legs.forEach(L2 => L2.rotation.x = 0); r.arms.rotation.x = -e * .8;
        r.stars.visible = f.ko < 6; r.stars.rotation.y = t * 5; r.stars.position.y = .45;
        if (f.ko > 8) { g.position.y = .22 - Math.min(.6, (f.ko - 8) * .2); if (f.ko > 11) g.visible = false; }
      } else {
        const sw = Math.sin(f.walk) * .6 * Math.min(1, f.moving);
        r.legs[0].rotation.x = sw; r.legs[1].rotation.x = -sw;
        g.rotation.set(0, f.yaw, 0); g.position.y = Math.abs(Math.cos(f.walk)) * .04 * Math.min(1, f.moving);
        r.torso.rotation.z = f.flash * .25; r.torso.rotation.x = -f.flash * .2;
        r.arms.rotation.x = f.state !== 'idle' ? -.25 : .25; r.glint.visible = f.aim > 0 && (t * 20 | 0) % 2 === 0; r.glint.lookAt(v.cam.position);
        r.stars.visible = false;
      }
      r.coat.emissive.setRGB(f.flash * 2, f.flash * 2, f.flash * 2);
    }
    for (const p of pickups) if (!p.got) { p.m.rotation.y = t * 1.6; p.m.position.y = .45 + Math.sin(t * 2.4 + p.x) * .06; }
    L.ring.rotation.z = t; L.ring.scale.setScalar(.75 + Math.sin(t * 4) * .04); L.sign.lookAt(v.cam.position.x, 2.1, v.cam.position.z);
    v.hurt = Math.max(hurtT * .9, pl.hp < 30 && !pl.dead ? .35 + Math.sin(t * 5) * .15 : 0, deadK * .8);
  }
  function hud(c) {
    const u = Math.min(W, H) / 300;   // HUD scale
    c.save(); c.textBaseline = 'middle';
    // crosshair
    const cx = W / 2, cy = H / 2, on = auto && auto.kind, gap = (5 + kick * 4) * u;
    c.strokeStyle = on ? '#ff5a4a' : '#ffffffd8'; c.lineWidth = 1.6 * u; c.shadowColor = '#000a'; c.shadowBlur = 3;
    c.beginPath(); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.moveTo(cx + a * gap, cy + b * gap); c.lineTo(cx + a * (gap + 6 * u), cy + b * (gap + 6 * u)); } c.stroke();
    if (hitT > 0) { c.strokeStyle = '#fff'; c.lineWidth = 2 * u; c.beginPath(); for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { c.moveTo(cx + a * 6 * u, cy + b * 6 * u); c.lineTo(cx + a * 11 * u, cy + b * 11 * u); } c.stroke(); }
    c.shadowBlur = 0;
    // damage direction
    if (hurtT > 0 && hurtDir != null) {
      c.save(); c.translate(cx, cy); c.rotate(-hurtDir); c.strokeStyle = `rgba(255,60,40,${hurtT * .9})`; c.lineWidth = 6 * u;
      c.beginPath(); c.arc(0, 0, Math.min(W, H) * .32, -Math.PI / 2 - .4, -Math.PI / 2 + .4); c.stroke(); c.restore();
    }
    // health (bottom left)
    const by = H - 18 * u, glass = (x, y, w, h) => { c.fillStyle = '#05070cb0'; rr(c, x, y, w, h, h / 2); c.fill(); c.strokeStyle = '#ffffff22'; c.lineWidth = 1; c.stroke(); };
    glass(10 * u, by - 11 * u, 108 * u, 22 * u);
    c.fillStyle = pl.hp < 30 ? '#ff4a3a' : '#f2f5fb'; c.font = `800 ${13 * u}px Rubik, sans-serif`; c.textAlign = 'left'; icon(c, 'heart-plus', 23 * u, by - 4 * u, 12 * u, { color: c.fillStyle });
    c.fillText(Math.ceil(pl.hp), 32 * u, by + .5);
    const hw = 52 * u, hg = c.createLinearGradient(58 * u, 0, 58 * u + hw, 0); hg.addColorStop(0, pl.hp < 30 ? '#ff3a2a' : '#2a8cff'); hg.addColorStop(1, pl.hp < 30 ? '#ff8a4a' : '#7cc4ff');
    c.fillStyle = '#ffffff1a'; rr(c, 58 * u, by - 3 * u, hw, 6 * u, 3 * u); c.fill(); c.fillStyle = hg; rr(c, 58 * u, by - 3 * u, hw * pl.hp / 100, 6 * u, 3 * u); c.fill();
    // weapon + ammo (bottom right)
    glass(W - 118 * u, by - 11 * u, 108 * u, 22 * u);
    c.textAlign = 'right'; c.fillStyle = '#f2f5fb'; c.font = `800 ${13 * u}px Rubik, sans-serif`; c.fillText(weapon === 'smg' ? ammo : '∞', W - 18 * u, by + .5);
    c.font = `600 ${8 * u}px Rubik, sans-serif`; c.fillStyle = '#7cc4ff'; c.fillText(weapon === 'smg' ? 'SMG' : 'PISTOL', W - 50 * u, by + .5);
    // top: floor + guards left, radar
    const left = foes.filter(f => !f.ko).length;
    c.textAlign = 'left'; c.font = `800 ${9 * u}px Rubik, sans-serif`; c.fillStyle = '#f2f5fbcc'; c.fillText(`FLOOR ${floorN + 1}`, 12 * u, 16 * u);
    c.font = `600 ${8 * u}px Rubik, sans-serif`; c.fillStyle = '#ff8a7a'; c.fillText(`GUARDS ${left}`, 12 * u, 28 * u);
    radar(c, W - 36 * u, 38 * u, 26 * u);
    // kill feed
    c.textAlign = 'center';
    feed.forEach((m, i) => { c.globalAlpha = Math.min(1, m.l * 2); c.font = `700 ${8.5 * u}px Rubik, sans-serif`; c.fillStyle = '#f2f5fb'; c.shadowColor = '#000'; c.shadowBlur = 4; c.fillText(m.txt, cx, H * .66 + i * 13 * u); });
    c.globalAlpha = 1; c.shadowBlur = 0;
    // banner message
    if (msg) {
      const a = Math.min(1, msg.l * 2, (msg.T ?? 3) - msg.l + .5);
      c.globalAlpha = clamp(a, 0, 1); c.fillStyle = '#05070c99'; c.fillRect(0, H * .3 - 22 * u, W, 44 * u);
      c.fillStyle = '#ffffff'; c.font = `800 ${20 * u}px Rubik, sans-serif`; c.fillText(msg.txt, cx, H * .3 - 4 * u);
      c.fillStyle = '#7cc4ff'; c.font = `600 ${8.5 * u}px Rubik, sans-serif`; c.fillText(msg.sub || '', cx, H * .3 + 13 * u); c.globalAlpha = 1;
    }
    // thumb stick
    if (look) { c.strokeStyle = look.hold ? '#ff6a5a90' : '#ffffff40'; c.lineWidth = 2 * u; c.beginPath(); c.arc(look.x, look.y, 16 * u, 0, 7); c.stroke(); }
    if (stick) {
      const R = Math.min(W, H) * .14; c.strokeStyle = '#ffffff40'; c.lineWidth = 2 * u; c.beginPath(); c.arc(stick.ax, stick.ay, R, 0, 7); c.stroke();
      const kx = stick.ax + clamp(stick.x - stick.ax, -R, R), ky = stick.ay + clamp(stick.y - stick.ay, -R, R);
      c.fillStyle = '#ffffff30'; c.beginPath(); c.arc(kx, ky, R * .42, 0, 7); c.fill(); c.strokeStyle = '#ffffff70'; c.stroke();
    } else if (t < 6 && state === 'play') {
      c.globalAlpha = .7 * Math.min(1, 6 - t); c.fillStyle = '#f2f5fb'; c.font = `600 ${8 * u}px Rubik, sans-serif`;
      c.fillText('Drag to walk and turn · tap to shoot · or use two thumbs', cx, H - 42 * u); c.globalAlpha = 1;
    }
    if (fade > 0) { c.fillStyle = pl.dead ? `rgba(40,0,0,${fade})` : `rgba(0,0,0,${fade})`; c.fillRect(0, 0, W, H); }
    c.restore();
  }
  function radar(c, x, y, R) {
    c.save(); c.beginPath(); c.arc(x, y, R, 0, 7); c.fillStyle = '#05070cb8'; c.fill(); c.strokeStyle = '#2a8cff88'; c.lineWidth = 1.2; c.stroke(); c.clip();
    const k = R / 9, S = L.S;
    c.translate(x, y); c.rotate(pl.a);
    c.fillStyle = '#7cc4ff30';
    const pi = pl.x / CS, pj = pl.z / CS;
    for (let j = Math.floor(pj - 6); j <= pj + 6; j++) for (let i = Math.floor(pi - 6); i <= pi + 6; i++) {
      if (i < 0 || j < 0 || i >= S || j >= S) continue; const cl = L.g[j * S + i];
      if (cl === 1) c.fillRect((i - pi) * CS * k, (j - pj) * CS * k, CS * k + .5, CS * k + .5);
    }
    const dot = (wx, wz, col, r) => { c.fillStyle = col; c.beginPath(); c.arc((wx - pl.x) * k, (wz - pl.z) * k, r, 0, 7); c.fill(); };
    for (const f of foes) if (!f.ko && f.state !== 'idle') dot(f.x, f.z, '#ff4a3a', 1.8);
    const ex = L.exit, ed = Math.hypot(ex.x - pl.x, ex.z - pl.z);
    if (ed * k < R - 3) dot(ex.x, ex.z, '#30ff7a', 2.4);
    else { const a = Math.atan2(ex.z - pl.z, ex.x - pl.x); c.fillStyle = '#30ff7a'; c.beginPath(); c.arc(Math.cos(a) * (R - 3), Math.sin(a) * (R - 3), 2, 0, 7); c.fill(); }
    c.restore();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(x, y - 3.5); c.lineTo(x + 2.5, y + 2.5); c.lineTo(x - 2.5, y + 2.5); c.fill();
  }
  function rr(c, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  let hasSMG, shadersReady = true, waitT = 0;
  const waiting = () => !shadersReady && waitT < 1.5;   // (never more than a second and a half)
  return {
    reset() { timers.clear();
      score = 0; floorN = 0; t = 0; feed = []; stick = null; look = null; keys = new Set(); fireCD = 0; auto = null; kick = 0; shake = 0; hurtT = 0; hurtDir = null; hitT = 0; fade = 0;
      state = 'play'; stT = 0; weapon = 'pistol'; ammo = 0; hasSMG = false; pl = null;
      buildFloor(); pl.hp = 100;
    },
    resize(w, h) { W = w; H = h; },
    update(dt) { timers.update(dt); step(dt); fxTick(dt); },
    fx(dt) { t += dt; fxTick(dt); },
    draw(c) {
      // between floors, while the new one's shaders compile: a black screen (drawing would compile them all at once)
      if (state === 'in' && waiting()) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); return; }
      scene3d();
      v.render(c, W, H);
      hud(c);
    },
    // Touch: the first finger is a stick (up/down walks, left/right turns), so it plays with one
    // thumb. With two thumbs, the finger on the left half moves (left/right strafes) and the finger on
    // the right half turns by dragging; tap it to shoot, hold it still to keep shooting.
    down(x, y, id = 0) {
      const f = { id, ax: x, ay: y, x, y, lx: x, t0: performance.now(), moved: 0, hold: false };
      if (!stick || (x < W / 2 && stick.ax >= W / 2 && !look)) { if (stick && !look) look = stick; stick = f; }
      else if (!look) look = f;
    },
    move(x, y, p, id = 0) {
      if (!p) return;
      const f = stick && stick.id === id ? stick : look && look.id === id ? look : null; if (!f) return;
      f.moved = Math.max(f.moved, Math.hypot(x - f.ax, y - f.ay)); f.x = x; f.y = y;
      if (f === look) { pl.a -= (x - f.lx) * Math.PI / W * 1.2; f.lx = x; }
    },
    up(x, y, id = 0) {
      const f = stick && stick.id === id ? stick : look && look.id === id ? look : null; if (!f) return;
      const quick = performance.now() - f.t0 < 260 && f.moved < 8;
      if (f === stick) stick = null; else look = null;
      if (quick && state === 'play' && !pl.dead && fireCD <= .15) fire(true);
    },
    get dbg() { return { pl, foes, L, barrels, pickups }; },   // for test scripts
    key(k, d) { const kk = k.length === 1 ? k.toLowerCase() : k; if (d) keys.add(kk); else keys.delete(kk); },
  };
}

export default {
  id: 'bunker-breakout',
  title: 'Bunker Breakout',
  tag: 'Next Gen · Shooter',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,
  goal: 1500, reward: 25,
  hint: 'Break out of the Red Bear fortress. Drag to walk and turn; your gun fires when a guard is in your sights, tap to shoot anything else. Two thumbs: left moves, right turns, tap or hold it to shoot. Red barrels explode. Find the green lift.',
  traits: ['theme:military', 'genre:fps'],
  make,
};
