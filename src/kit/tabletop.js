// Tabletop kit for Board games (era: 'board', docs/board-games.md): one game, played two ways.
//
//   3D: the board sits on a table in a room made in code, drawn with the Next Gen renderer. Drag to
//       walk the camera round the table, pinch to zoom, tap to play.
//   AR: tap the AR chip and the same board is set down in your real room through the camera (the AR
//       kit, ar3d.js): on the floor in front of you, or where you tap with native AR. Pinch to size it
//       from tabletop to giant, drag to turn it. The camera is only asked for when AR is tapped.
//
// The game builds its board and pieces once, in board units, inside table.board (the board's top is
// y = 0, the player sits at +z, x runs to their right) and never needs to know which way it's shown:
//
//   const { Table, slab, pawn, sounds } = gs.tabletop;
//   function setup() {
//     T = new Table(api, { span: 10, room: 'study' });            // span: how wide the playing area is, in board units
//     T.board.add(slab({ w: 9, d: 9, paint(g, S) { ... } }));     // a painted board with a wooden rim
//     pawnMesh = pawn('#d94a3a'); T.board.add(pawnMesh);
//   }
//   reset() { if (!T) setup(); T.reset(); ... }
//   update(dt) { if (!T.update(dt)) return; ... }                 // false while AR finds the floor
//   draw(c) { T.draw(c, W, H); /* your HUD */ T.hud(c, W, H); }
//   down(x, y, id) { T.down(x, y, id); }
//   move(x, y, pressed, id) { T.move(x, y, pressed, id); }
//   up(x, y, id) { const tap = T.up(x, y, id); if (tap) { const p = T.pick(tap.x, tap.y); ... } }
//
// Moves are promises on the table's own clock (they stop with the game and are dropped by reset()),
// so a turn reads top to bottom:  T.run(async () => { await T.hop(pawnMesh, { x: 2, z: 3 }); await T.wait(.3); ... })
//
// The kit gives the table, the camera, AR, picking, moves, dice, a few pieces and sounds. The rules,
// the board's look and the HUD are the game's.
import { CanvasTexture, CircleGeometry, Color, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, IcosahedronGeometry, LatheGeometry, Matrix4, Mesh, MeshBasicMaterial, Plane, PlaneGeometry, Quaternion, Ray, Raycaster, ShadowMaterial, Shape, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3, BackSide, BoxGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HDView, Particles, pbr, rbox, surface, speckle, spot } from './hd3d.js';
import { pause, built, later } from './slices.js';
import { ARView, arNote, FLOOR } from './ar3d.js';
import { material } from './models/materials.js';
import { World3D } from './physics3d.js';
import { faceUp, FACES } from './dice.js';
import { shatter } from './destruction.js';
import { haptic, want } from './device.js';
import { tone, noise } from './sound.js';
import { prefs } from './prefs.js';
export { Chess, loadChess } from './chess.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const EASE = {
  linear: k => k, in: k => k * k, out: k => 1 - (1 - k) * (1 - k), inOut: k => (k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2),
  back: k => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2, bounce: k => { const n = 7.5625, d = 2.75; return k < 1 / d ? n * k * k : k < 2 / d ? n * (k -= 1.5 / d) * k + .75 : k < 2.5 / d ? n * (k -= 2.25 / d) * k + .9375 : n * (k -= 2.625 / d) * k + .984375; },
};

/* ---------- sounds: wood, glass, dice ---------- */
/** Small table sounds, each with a volume 0..1: clack (a wooden piece set down), tick, clink (glass or stone), rattle (dice), slide, thud, flip (a card or tile), chime (good news), gong (big news). */
export const sounds = {
  clack(v = 1) { noise(.035, { vol: .09 * v, from: 2600, to: 900, q: 2 }); tone(190 + Math.random() * 30, { len: .05, wave: 'sine', vol: .06 * v, slide: -60 }); },
  tick(v = 1) { noise(.015, { vol: .05 * v, from: 4200, to: 2200 }); },
  clink(v = 1) { tone(2100 + Math.random() * 500, { len: .07, wave: 'sine', vol: .035 * v }); tone(3300 + Math.random() * 400, { len: .04, wave: 'sine', vol: .02 * v }); },
  rattle(v = 1) { for (let i = 0; i < 4; i++) noise(.02, { vol: .05 * v, from: 3200, to: 1400, at: i * .045 + Math.random() * .02 }); },
  slide(v = 1) { noise(.16, { vol: .03 * v, from: 900, to: 500, attack: .03 }); },
  thud(v = 1) { tone(90, { len: .14, wave: 'sine', vol: .12 * v, slide: -40 }); noise(.05, { vol: .06 * v, from: 700, to: 200 }); },
  flip(v = 1) { noise(.06, { vol: .05 * v, from: 1800, to: 3600, attack: .01 }); },
  chime(v = 1) { [660, 880, 1320].forEach((f, i) => tone(f, { len: .22, wave: 'sine', vol: .045 * v, at: i * .07 })); },
  gong(v = 1) { tone(110, { len: 1.1, wave: 'sine', vol: .09 * v }); tone(165, { len: .9, wave: 'triangle', vol: .04 * v }); tone(277, { len: .5, wave: 'sine', vol: .025 * v }); },
};

/* ---------- rooms ---------- */
// The room round the table in 3D: colours, the floor's recipe and how it's lit (grade's shadows and highlights are tints near white). A game can pass its own
// object (any of these fields) or a name with changes: room: { like: 'tavern', felt: '#5a2030' }.
export const ROOMS = {
  study: { bg: '#0c0f12', wall: '#5d7568', floor: ['planks', { colour: '#a8754a', dark: '#6b4526' }], rug: '#9c3f3c', wood: '#7a4e2c', felt: '#27704f', lamp: '#ffe2bc', power: 1, sky: '#c9d2e4', ground: '#5a4430', amb: .36, env: .5, grade: { saturation: 1.06, contrast: 1.04, shadows: '#e4ecf6', highlights: '#fff4e2' } },
  parlour: { bg: '#141216', wall: '#94707a', floor: ['planks', { colour: '#c09468', dark: '#7e5836' }], rug: '#3f6792', wood: '#9c6238', felt: '#a83c48', lamp: '#fff0d4', power: .95, sky: '#e0d8e8', ground: '#6a4c3c', amb: .4, env: .45, grade: { saturation: 1.08, contrast: 1.03, shadows: '#efe6f2', highlights: '#fff6ea' } },
  tavern: { bg: '#0b0806', wall: '#6a4e38', floor: ['cobbles', { colour: '#8e8272', dark: '#544c42' }], rug: null, wood: '#74482a', felt: null, lamp: '#ffc47c', power: 1, sky: '#c09a70', ground: '#4a3220', amb: .3, env: .4, grade: { saturation: 1.1, contrast: 1.06, shadows: '#f4e4d2', highlights: '#ffeccc' } },
  attic: { bg: '#07090f', wall: '#454c66', floor: ['planks', { colour: '#7c7684', dark: '#46424e' }], rug: null, wood: '#5e5852', felt: null, lamp: '#c6d2ff', power: .95, sky: '#8494c4', ground: '#2c2836', amb: .32, env: .35, grade: { saturation: .88, contrast: 1.08, shadows: '#dfe6ff', highlights: '#eef2ff' } },
  hall: { bg: '#0a0806', wall: '#6e5844', floor: ['stone', { colour: '#948a7c', dark: '#5c564c' }], rug: '#8a5a30', wood: '#6e4a2e', felt: null, lamp: '#ffcc8c', power: 1, sky: '#c0a488', ground: '#4a3420', amb: .32, env: .4, grade: { saturation: 1.05, contrast: 1.06, shadows: '#f0e6d8', highlights: '#ffeed0' } },
  sunroom: { bg: '#a8c4dc', wall: '#e4decd', floor: ['tiles', { colour: '#dcd5c6', grout: '#a39c8f' }], rug: '#5c9a72', wood: '#c09a68', felt: null, lamp: '#fff6e4', power: .62, sky: '#e6eefa', ground: '#a8987c', amb: .4, env: .42, grade: { saturation: 1.1, contrast: 1, shadows: '#e6eefa', highlights: '#fffaf0' } },
};
const roomLook = r => { const o = typeof r === 'string' ? { like: r } : r || {}; return { ...(ROOMS[o.like] || ROOMS.study), ...o }; };
// The room's floor, rug and felt keep their painted textures: no close-up shader (gs.models.material's
// closeUp, WebGPU). Close is judged by a mesh's bounding sphere, and the camera always sits inside the
// big floor's: the whole floor went over to the recipe worked out per pixel, which has no filtering, so
// far off every thin gap between the boards broke into dashes that crawled from frame to frame, and
// the floor vanished for a moment about a second into each game while the new shader was built. The
// camera stays most of a metre above the floor and rug; it comes within a hand of the felt's near
// edge only at the lowest, closest view, where the painted weave is drawn at about twice its size.
const BAKED = { closeUp: false };

const woods = new Map();
/**
 * Quiet polished wood with a straight grain, made in code (table tops, frames, boxes, trays):
 * colour, repeat ([u, v] across the mesh), clear (lacquer, 0..1).
 */
export function wood(colour = '#7a4c2a', { repeat = [1, 1], clear = .25 } = {}) {
  let set = woods.get(colour);
  if (!set) {
    pause('Textures');   // (while a card loads, a frame may go by before each new wood: slices.js)
    const tone = k => new Color(colour).multiplyScalar(k).getStyle();
    set = surface(512, ({ col, h, r, size: Z }) => {
      col.fillStyle = colour; col.fillRect(0, 0, Z, Z);
      for (let i = 0; i < 26; i++) { const y = Math.random() * Z, w = 6 + Math.random() * 30; col.fillStyle = tone(Math.random() < .5 ? .88 : 1.1); col.globalAlpha = .25; col.fillRect(0, y, Z, w); col.fillRect(0, y - Z, Z, w); }   // soft bands
      for (let i = 0; i < 260; i++) {   // fine grain that wanders a little (and meets itself at the edges)
        const y0 = Math.random() * Z; col.strokeStyle = tone(Math.random() < .7 ? .7 : 1.2); col.globalAlpha = .1 + Math.random() * .25; col.lineWidth = .6 + Math.random() * 1.4;
        col.beginPath(); for (let x = 0; x <= Z; x += Z / 8) { const y = y0 + Math.sin(x / Z * TAU + i) * 3; if (x) col.lineTo(x, y); else col.moveTo(x, y); } col.stroke();
      }
      col.globalAlpha = 1;
      for (let i = 0; i < 120; i++) { h.strokeStyle = Math.random() < .5 ? '#767676' : '#8a8a8a'; h.lineWidth = 1; const y = Math.random() * Z; h.beginPath(); h.moveTo(0, y); h.lineTo(Z, y); h.stroke(); }
      r.fillStyle = '#8c8c8c'; r.fillRect(0, 0, Z, Z);
    }, { strength: .8 });
    woods.set(colour, set); built();
  } else if (set.core.wait) later(set.core.wait);   // (still with a worker: this card waits for it too)
  return pbr('#ffffff', { tex: set.repeat(repeat[0], repeat[1]), rough: 1, clear });
}
// Lays a texture flat across a turned shape (a table top), so wood grain runs straight rather than out from the middle.
function flatUV(geo, size) {
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / size + .5, p.getZ(i) / size + .5 + p.getY(i) / size);
  uv.needsUpdate = true; return geo;
}
// The room's walls, seen from inside: a box with no bottom (and no top unless lid). A bottom face would lie in the floor's own
// plane, or a hair under it, and the two then take turns at the same pixels: stripes across the floor that flicker as the view moves.
function roomBox(w, h, d, lid) {
  const g = new BoxGeometry(w, h, d), ix = Array.from(g.index.array);   // faces in order: +x, -x, +y, -y, +z, -z, six indices each
  g.setIndex([...ix.slice(0, lid ? 18 : 12), ...ix.slice(24)]); g.clearGroups();
  return g;
}
// A turned shape from its outline, [radius, height] points. three.js turns an outline that runs from the bottom up with its faces
// outward; one written from the top down came out inside out (you saw the far inside wall through the near one), so it is turned round here.
function latheMesh(pts, mat, seg = 40) {
  if (pts[0][1] > pts[pts.length - 1][1]) pts = pts.slice().reverse();
  const m = new Mesh(new LatheGeometry(pts.map(p => new Vector2(p[0], p[1])), seg), mat); m.castShadow = m.receiveShadow = true; return m;
}

/* ---------- the table ---------- */
const _v = new Vector3(), _v2 = new Vector2(), _ray = new Raycaster(), _m = new Matrix4(), _q = new Quaternion(), _pl = new Plane(new Vector3(0, 1, 0), 0), _r = new Ray();

export class Table {
  /**
   * api: the game's api (for the score badge's place). Options:
   *   span: width of the playing area in board units (10); real: its real width in metres (.5) for AR and the room's proportions;
   *   room: 'study' | 'parlour' | 'tavern' | 'attic' | 'hall' | 'sunroom' or { like, ...changes }; table: 'round' | 'square' | false;
   *   pitch, yaw (degrees), zoom: the camera's home; look: [x, y, z] it aims at; minPitch, maxPitch;
   *   base: how far the board's underside is below y = 0 (.3); ar: false leaves the AR chip out; arSize: metres wide on the floor in AR (.9);
   *   frame: [w, d] the area the camera fits on screen, in board units, when it isn't span x span (a long board);
   *   blur: true for depth of field (a miniature look; best phones only).
   */
  constructor(api, o = {}) {
    this.api = api;
    this.span = o.span ?? 10; this.real = o.real ?? .5; this.base = o.base ?? .3;
    this.K = this.span / this.real;   // board units in a metre
    this.look = roomLook(o.room);
    this.home = { yaw: (o.yaw ?? 0) * DEG, pitch: (o.pitch ?? 56) * DEG, zoom: o.zoom ?? 1, at: new Vector3(...(o.look || [0, 0, 0])) };
    this.minPitch = (o.minPitch ?? 14) * DEG; this.maxPitch = (o.maxPitch ?? 88) * DEG;
    this.cam = { yaw: this.home.yaw, pitch: this.home.pitch, zoom: this.home.zoom, at: this.home.at.clone() };
    this.goal = { yaw: this.home.yaw, pitch: this.home.pitch, zoom: this.home.zoom, at: this.home.at.clone() };
    this.arOk = o.ar !== false; this.arSize = o.arSize ?? .9; this.blur = !!o.blur;
    this.mode = '3d'; this.t = 0; this.gen = 0; this.flows = 0; this.fault = null; this.tweens = []; this.ptrs = new Map(); this.claimed = new Set();
    this.msg = null; this.chips = []; this.shakeAmt = 0; this.rubble = []; this.W = 300; this.H = 460; this.userView = false; this.dice_ = [];
    this.fitW = o.frame?.[0] ?? this.span; this.fitD = o.frame?.[1] ?? this.span;
    this.board = new Group(); this.board.name = 'board';
    this.anchor = new Group(); this.anchor.add(this.board);
    // 3D: the room, the table and its lamp
    const L = this.look, v = this.v3 = new HDView({ bg: L.bg, env: L.env, amb: L.amb, sky: L.sky, ground: L.ground, fov: 46 });
    v.cam.near = this.span * .04; v.cam.far = this.span * 60; v.cam.updateProjectionMatrix();
    v.grade = L.grade || null; v.bloom = .5;
    this.room = this.buildRoom(o.table ?? 'round'); v.scene.add(this.room);
    const lamp = this.lamp = spot(L.lamp, 1, this.span * 9, .82);
    lamp.position.set(this.span * .5, this.span * 2.4, this.span * .55); lamp.target.position.set(0, 0, 0); lamp.decay = 1.2; lamp.penumbra = .85;
    lamp.intensity = .55 * L.power * (lamp.position.length() ** 1.2);   // the same light on the board whatever its size, low enough that a pale board keeps its colours and doesn't bloom
    lamp.shadow.camera.near = this.span * .5; lamp.shadow.camera.far = this.span * 6; lamp.shadow.radius = 4; lamp.shadow.normalBias = .03;
    v.scene.add(lamp, lamp.target); v.onTier(T => { lamp.setTier(T); this.gameTier?.(T); });
    v.scene.add(this.anchor); v.table = this;
    this.va = null;   // the AR view, made the first time AR is tapped
    this.ar = { placed: false, scale: this.arSize / this.span, yaw: 0, placing: false, pos: new Vector3(), table: false, sunKey: '' };
  }

  /** The view on screen now: a gs.hd HDView (3D) or a gs.ar ARView (AR). */
  get v() { return this.mode === 'ar' && this.va ? this.va : this.v3; }
  /** Let a game react to quality changes (shadows of its own lights...). */
  onTier(fn) { this.gameTier = fn; return this; }
  /** True while AR's own screens are up (finding the floor): the kit's strip and status hide themselves; hide your HUD too. */
  get hidden() { return this.mode === 'ar' && !!this.va?.calibrating; }
  /** True while a T.run() turn is still playing out: don't take input for a new move. */
  get busy() { return this.flows > 0; }

  buildRoom(shape) {
    const L = this.look, K = this.K, S = this.span, g = new Group(), base = this.base;
    const tt = .045 * K, R = S * .98, topY = -base, floorY = topY - .74 * K;
    this.floorY = floorY;
    const wd = wood(L.wood, { repeat: [3, 3] });
    if (shape) {
      let top;
      if (shape === 'square') { top = new Mesh(rbox(R * 2.1, tt, R * 2.1, tt * .3), wd); top.position.y = topY - tt / 2; }
      else { top = latheMesh([[0, topY], [R - tt * .3, topY], [R, topY - tt * .3], [R, topY - tt * .7], [R - tt * .3, topY - tt], [0, topY - tt]], wd, 72); flatUV(top.geometry, R * 2); }
      top.castShadow = false; top.receiveShadow = true; g.add(top);
      if (L.felt) {
        const felt = new Mesh(shape === 'square' ? new PlaneGeometry(R * 1.9, R * 1.9).rotateX(-Math.PI / 2) : new CircleGeometry(R * .9, 72).rotateX(-Math.PI / 2), material('fabric', { colour: L.felt, repeat: [22, 22], rough: .95, ...BAKED }));
        felt.position.y = topY + S * .002; felt.receiveShadow = true; g.add(felt);
      }
      const leg = latheMesh([[0, topY - tt], [R * .16, topY - tt], [R * .1, topY - tt - K * .08], [R * .075, floorY + K * .2], [R * .2, floorY + K * .06], [R * .46, floorY + K * .02], [R * .46, floorY], [0, floorY]], wd, 24);
      leg.castShadow = false; g.add(leg);
    }
    const [recipe, look] = L.floor;
    const fl = new Mesh(new PlaneGeometry(K * 9, K * 9).rotateX(-Math.PI / 2), material(recipe, { ...look, repeat: recipe === 'planks' ? [9, 18] : [9, 9], ...BAKED })); fl.position.y = floorY; fl.receiveShadow = true; g.add(fl);
    if (L.rug) {
      const rug = new Mesh(new CircleGeometry(R * 1.9, 64).rotateX(-Math.PI / 2), material('fabric', { colour: L.rug, repeat: [30, 30], rough: 1, ...BAKED })); rug.position.y = floorY + S * .004; rug.receiveShadow = true; g.add(rug);
      const trim = new Mesh(new TorusGeometry(R * 1.82, S * .012, 6, 64).rotateX(Math.PI / 2), pbr(new Color(L.rug).multiplyScalar(1.7).getStyle(), { rough: 1 })); trim.position.y = floorY + S * .006; g.add(trim);
    }
    const wallTex = surface(128, ({ col, size: Z }) => { col.fillStyle = '#fff'; col.fillRect(0, 0, Z, Z); speckle(col, Z, 500, '#000', 1.4, .08); });
    const walls = new Mesh(roomBox(K * 6.5, K * 3.2, K * 6.5, true), pbr(L.wall, { tex: wallTex.repeat(5, 3), rough: .95, side: BackSide, glow: .22, glowCol: L.wall })); walls.position.y = floorY + K * 1.595; walls.receiveShadow = true; g.add(walls);   // (a little of the lamp's light off the walls, so the room isn't a void)
    const skirt = new Mesh(roomBox(K * 6.46, K * .12, K * 6.46), pbr(new Color(L.wall).multiplyScalar(.45).getStyle(), { rough: .7, side: BackSide })); skirt.position.y = floorY + K * .06; g.add(skirt);
    return g;
  }

  /* ----- rounds ----- */
  /** Call from the game's reset(): drops moves still playing, puts the camera home, and (AR) takes "ahead" again. */
  reset() {
    this.gen++; this.flows = 0; this.fault = null; this.tweens.length = 0; this.ptrs.clear(); this.claimed.clear(); this.msg = null; this.shakeAmt = 0; this.thinking = null;
    Object.assign(this.goal, { yaw: this.home.yaw, pitch: this.home.pitch, zoom: this.home.zoom }); this.goal.at.copy(this.home.at); this.userView = false;
    if (this.va) { this.va.off(); this.va.recenter(); this.ar.placed = false; this.ar.placing = false; }
    for (const d of this.dice_) d.rest();
    for (const f of this.rubble) { f.removeFromParent(); f.geometry.dispose(); } this.rubble.length = 0; this.dust?.clear(); this.glints?.clear();
    return this;
  }
  /** Stop the camera (call before api.over() when in AR; reset() does it too). */
  stop() { this.va?.off(); return this; }

  /**
   * Call first in update(dt). Advances moves, the camera and dice. Returns false while the game
   * should wait (AR is finding or lining up the floor): skip the rest of your update then.
   */
  update(dt) {
    if (this.fault) { const e = this.fault; this.fault = null; throw e; }   // a turn's own error, raised where the app can catch it
    this.t += dt;
    if (this.mode === 'ar') {
      const a = this.va; a.live();
      if (a.camState === 'denied') { this.setMode('3d'); this.say('No camera here, so the board stays in 3D'); }
      else if (a.calibrating) return false;
      else if (!this.ar.placed && (a.seeing || a.sensor)) this.placeAhead();
    }
    const g = this.goal, c = this.cam, k = 1 - Math.exp(-dt * 7);
    c.yaw += (g.yaw - c.yaw) * k; c.pitch += (g.pitch - c.pitch) * k; c.zoom += (g.zoom - c.zoom) * k; c.at.lerp(g.at, k);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 3);
    if (this.msg && (this.msg.t -= dt) <= 0) this.msg = null;
    for (const d of this.dice_) d.step(dt);
    this.dust?.update(dt); this.glints?.update(dt);
    for (let i = this.rubble.length - 1; i >= 0; i--) {
      const f = this.rubble[i], u = f.userData; u.age += dt; u.vy -= 16 * dt;
      f.position.x += u.vx * dt; f.position.y += u.vy * dt; f.position.z += u.vz * dt;
      if (f.position.y < u.r && u.vy < 0) { f.position.y = u.r; u.vy *= -.3; u.vx *= .55; u.vz *= .55; u.spin *= .5; }
      f.rotateOnAxis(u.axis, u.spin * dt);
      const k = u.age < u.life ? 1 : 1 - (u.age - u.life) / .35;
      if (k <= 0) { f.removeFromParent(); f.geometry.dispose(); this.rubble.splice(i, 1); } else f.scale.setScalar(u.s0 * k);
    }
    if (this.thinking) { const th = this.thinking; if (th.job.step(th.slice) && this.t >= th.until) { this.thinking = null; th.res(th.job.move); } }
    // moves: each runs on the table's clock, so pausing the game pauses them
    const list = this.tweens;
    for (let i = 0; i < list.length; i++) {
      const w = list[i]; w.t += dt; if (w.t < 0) continue;
      const k2 = w.dur <= 0 ? 1 : Math.min(1, w.t / w.dur);
      if (w.fn) w.fn(w.ease(k2), k2);
      if (k2 >= 1) { list.splice(i--, 1); w.res(); }
    }
    return true;
  }

  /* ----- moves (promises on the table's clock) ----- */
  /** Runs fn(k) with k easing 0..1 over dur seconds; resolves when done. ease: 'linear' | 'in' | 'out' | 'inOut' | 'back' | 'bounce' or a function. */
  tween(dur, fn, { ease = 'inOut', delay = 0 } = {}) {
    return new Promise(res => this.tweens.push({ t: -delay, dur, fn, ease: typeof ease === 'function' ? ease : EASE[ease] || EASE.inOut, res }));
  }
  /** Resolves after s seconds of game time. */
  wait(s) { return this.tween(s, null); }
  /** A promise from elsewhere (an opponent thinking in a worker), dropped if the round is reset meanwhile. */
  until(p) { const g = this.gen; return new Promise((res, rej) => Promise.resolve(p).then(x => { if (g === this.gen) res(x); }, e => { if (g === this.gen) rej(e); })); }
  /**
   * Plays a turn written as an async function. While it runs, T.busy is true. reset() drops it where it
   * stands; an error inside it is raised from the next T.update(), so the app handles it as usual.
   */
  run(fn) {
    const g = this.gen; this.flows++;
    Promise.resolve().then(fn).then(() => { if (g === this.gen) this.flows = Math.max(0, this.flows - 1); }, e => { if (g === this.gen) { this.flows = Math.max(0, this.flows - 1); this.fault = e; } });
  }
  /**
   * A computer player's move without missed frames: resolves the move gs.solve.Search picks for
   * `state`, thinking a few milliseconds each frame. o: Search.think's options (time, depth, skill,
   * mode) plus wait (seconds it takes at least, so a reply doesn't land the instant you let go; .5).
   */
  think(search, state, o = {}) {
    return new Promise(res => { this.thinking = { job: search.think(state, o), until: this.t + (o.wait ?? .5), slice: o.slice ?? 4, res }; });
  }
  /** Hops obj (a piece) to `to` ({ x, z, y }) in an arc. h: height of the arc; time; sound: false for silence; spin: turns on the way. */
  hop(obj, to, { h = .7, time = .28, sound = true, spin = 0, ease = 'inOut' } = {}) {
    const a = obj.position.clone(), b = new Vector3(to.x ?? a.x, to.y ?? a.y, to.z ?? a.z), r0 = obj.rotation.y;
    return this.tween(time, k => { obj.position.lerpVectors(a, b, k); obj.position.y += Math.sin(k * Math.PI) * h; if (spin) obj.rotation.y = r0 + k * spin * TAU; }, { ease })
      .then(() => { obj.position.copy(b); if (sound) { sounds.clack(.8); haptic('light'); } });
  }
  /** Slides obj along the board to `to`. */
  slide(obj, to, { time = .3, ease = 'inOut', sound = true } = {}) {
    const a = obj.position.clone(), b = new Vector3(to.x ?? a.x, to.y ?? a.y, to.z ?? a.z);
    if (sound) sounds.slide();
    return this.tween(time, k => obj.position.lerpVectors(a, b, k), { ease }).then(() => { obj.position.copy(b); });
  }
  /** Drops obj onto where it stands from `from` units above, with a small bounce. */
  drop(obj, { from = 4, time = .45, sound = true } = {}) {
    const y = obj.position.y; obj.visible = true;
    return this.tween(time, k => { obj.position.y = y + (1 - k) * from; }, { ease: 'bounce' }).then(() => { obj.position.y = y; if (sound) { sounds.clack(); haptic('light'); } });
  }
  /** Pops obj's size up and back (a piece chosen, a square scored). */
  pop(obj, { by = .25, time = .22 } = {}) {
    const s = obj.scale.clone();
    return this.tween(time, k => obj.scale.copy(s).multiplyScalar(1 + Math.sin(k * Math.PI) * by), { ease: 'linear' }).then(() => { obj.scale.copy(s); });
  }
  /** Shakes the camera (3D only; follows Reduce motion). */
  shake(amount = .5) { this.shakeAmt = Math.max(this.shakeAmt, amount * prefs.motion); return this; }

  /**
   * Breaks a piece on the board into rubble (gs.destruction: real pieces of its own shape) that tumbles,
   * settles and fades. The mesh is taken off the board. pieces: how many; push: how hard they fly;
   * from: { x, z } the board point the blow came from (pieces fly away from it); life: seconds they lie there.
   */
  crumble(mesh, { pieces = 9, push = 3, from = null, life = 1 } = {}) {
    this.board.updateWorldMatrix(true, true);
    const at = mesh.position.clone(), h = mesh.userData.h || .6; let frags = null;
    try { frags = shatter(mesh, { pieces }); } catch { frags = null; }
    if (!frags || frags.length < 2) {   // a shape that won't break cleanly: plain chunks of the same stuff
      for (const f of frags || []) f.removeFromParent();
      mesh.removeFromParent(); frags = [];
      for (let i = 0; i < pieces; i++) { const f = new Mesh(new IcosahedronGeometry(h * (.1 + Math.random() * .1), 0), mesh.material); f.position.set(at.x + (Math.random() - .5) * h * .4, Math.random() * h, at.z + (Math.random() - .5) * h * .4); f.castShadow = true; this.board.add(f); frags.push(f); }
    } else for (const f of frags) {   // turn each piece about its own middle, and keep it on the board (so it follows into AR)
      f.geometry.computeBoundingBox(); const c = f.geometry.boundingBox.getCenter(new Vector3()); f.geometry.translate(-c.x, -c.y, -c.z); f.position.add(c.applyQuaternion(f.quaternion));
      this.board.attach(f);
    }
    const dir = from ? new Vector3(at.x - from.x, 0, at.z - from.z).normalize() : new Vector3();
    for (const f of frags) {
      f.geometry.computeBoundingSphere(); const out = new Vector3(f.position.x - at.x, 0, f.position.z - at.z); if (out.lengthSq() < 1e-4) out.set(Math.random() - .5, 0, Math.random() - .5); out.normalize();
      const sp = push * (.45 + Math.random() * .7);
      Object.assign(f.userData, { age: 0, life: life + Math.random() * .3, r: Math.max(.03, (f.geometry.boundingSphere?.radius || .1) * f.scale.x * .6), s0: f.scale.x, vx: out.x * sp * .6 + dir.x * sp, vy: 2 + Math.random() * push, vz: out.z * sp * .6 + dir.z * sp, spin: (Math.random() - .5) * 14, axis: new Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize() });
      this.rubble.push(f);
    }
    return this.wait(.35);
  }
  /**
   * A burst of dust (or, with glow, sparks) at a board point: { x, y, z }. o: col, n (how many), speed,
   * size, life, up (how much it rises), grav, glow (true: bright sparks that bloom).
   */
  puff(p, { col = '#d8d0c0', n = 10, speed = 1.6, size = .32, life = .7, up = .8, grav = 0, glow = false } = {}) {
    const set = glow ? (this.glints ||= this.particles({ max: 260, additive: true })) : (this.dust ||= this.particles({ max: 220, additive: false }));
    const c = new Color(col), k = glow ? 2.2 : 1, rgb = [c.r * k, c.g * k, c.b * k];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = speed * (.35 + Math.random() * .65);
      set.emit({ x: p.x ?? 0, y: p.y ?? .1, z: p.z ?? 0, vx: Math.cos(a) * sp, vy: up * (.4 + Math.random()), vz: Math.sin(a) * sp, life: life * (.6 + Math.random() * .6), size: size * (.6 + Math.random() * .8), grow: glow ? -.6 : 1.4, col: rgb, a: glow ? 1 : .55, drag: glow ? 1 : 2.4, grav });
    }
    return this;
  }

  /* ----- camera (3D) ----- */
  /** Eases the camera to look at a board point, closer (zoom below 1) or further; yaw / pitch in degrees to swing round. Stays until lookHome(). */
  lookAt(p, { zoom = null, yaw = null, pitch = null } = {}) {
    this.goal.at.set(p.x ?? 0, p.y ?? 0, p.z ?? 0); if (zoom != null) this.goal.zoom = zoom; if (yaw != null) this.goal.yaw = yaw * DEG; if (pitch != null) this.goal.pitch = clamp(pitch * DEG, this.minPitch, this.maxPitch);
    return this;
  }
  /** Back to the home view (or a new home: { yaw, pitch, zoom, look }). */
  lookHome(h = null) {
    if (h) { if (h.yaw != null) this.home.yaw = h.yaw * DEG; if (h.pitch != null) this.home.pitch = h.pitch * DEG; if (h.zoom != null) this.home.zoom = h.zoom; if (h.look) this.home.at.set(...h.look); }
    // the short way round
    let y = this.home.yaw; while (y - this.cam.yaw > Math.PI) y -= TAU; while (y - this.cam.yaw < -Math.PI) y += TAU;
    Object.assign(this.goal, { yaw: y, pitch: this.home.pitch, zoom: this.home.zoom }); this.goal.at.copy(this.home.at); this.userView = false;
    return this;
  }
  /** The area the camera keeps on screen, in board units: w across, d deep (a long board turned to suit a tall or a wide screen). */
  frame(w, d) { this.fitW = w; this.fitD = d; return this; }
  /** True on a tall screen (a phone held upright), false on a wide one (an unfolded phone): lay a long board out to suit. */
  get tall() { return this.W / this.H < .8; }
  placeCamera() {
    const v = this.v3, cam = v.cam, c = this.cam, wide = this.W / this.H > .85, fov = wide ? 38 : 46;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // Far enough back that the framed area (span x span, or what frame() set) fits across the screen and
    // between the HUD at the top and the chips at the bottom, whichever way the camera has been turned.
    const vf = fov * DEG / 2, hf = Math.atan(Math.tan(vf) * this.W / this.H), cp = Math.cos(c.pitch), sp = Math.max(.25, Math.sin(c.pitch)), sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
    const top = (this.api?.scoreArea?.().bottom ?? 40) + 62, bot = 44, th = Math.tan(hf) * .95, tv = Math.tan(vf) * Math.max(.4, 1 - (top + bot) / this.H);
    let d = 0;
    for (const px of [-this.fitW / 2, this.fitW / 2]) for (const pz of [-this.fitD / 2, this.fitD / 2]) {
      const x = px * cy - pz * sy, g = px * sy + pz * cy;        // across the screen, and towards the camera along the table
      d = Math.max(d, Math.abs(x) / th + cp * g, sp * Math.abs(g) / tv + cp * g);
    }
    d *= c.zoom;
    const lift = (top - bot) / 2 * (2 * d * Math.tan(vf) / this.H) / sp, ax = c.at.x - sy * lift, az = c.at.z - cy * lift;   // aim a little beyond the middle, so the board sits below the HUD
    cam.position.set(ax + d * cp * sy, c.at.y + d * Math.sin(c.pitch), az + d * cp * cy);
    if (this.shakeAmt > 0) { const k = this.shakeAmt * this.span * .012; cam.position.x += (Math.random() - .5) * k; cam.position.y += (Math.random() - .5) * k; }
    cam.lookAt(ax, c.at.y, az);
    if (this.blur) v.focus = { at: d, range: this.span * (.55 + .5 * cp), depth: this.span * 1.6, blur: 3.5 };
  }

  /* ----- AR ----- */
  /** '3d' or 'ar'. AR starts the camera (asking the first time); with no camera it falls back to 3D. */
  setMode(mode) {
    if (mode === this.mode || (mode === 'ar' && !this.arOk)) return this;
    this.ptrs.clear(); this.claimed.clear();
    this.v.release();   // (pieces the view merged or held back: it stops drawing now, so it would never return them)
    if (mode === 'ar') {
      if (!this.va) {
        const a = this.va = new ARView(); a.table = this;
        a.onTier(T => this.gameTier?.(T));
        a.sunL.shadow.radius = 3; a.exposure = .32;   // AR's lights suit bold toys; a pale board under them would burn out
        this.catcher = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new ShadowMaterial({ color: 0x000000, opacity: .4 })); this.catcher.receiveShadow = true; this.catcher.visible = false; a.scene.add(this.catcher);
      }
      this.mode = 'ar'; this.va.scene.add(this.anchor); this.va.recenter(); this.ar.placed = false; this.anchor.visible = false;
    } else {
      this.va.off(); this.mode = '3d'; this.v3.scene.add(this.anchor);
      this.anchor.position.set(0, 0, 0); this.anchor.rotation.set(0, 0, 0); this.anchor.scale.setScalar(1); this.anchor.visible = true;
    }
    for (const fn of this.modeFns || []) fn(this.mode);
    return this;
  }
  /** fn(mode) runs when the player switches between '3d' and 'ar' (particles made with T.particles() move by themselves). */
  onMode(fn) { (this.modeFns ||= []).push(fn); return this; }
  // The board goes on the floor a step in front of where the phone points.
  placeAhead() {
    const a = this.va, A = this.ar, yaw = a.heading(), e = a.eyePos, w = this.span * A.scale;
    // far enough that the whole board fits across the picture from where the phone is held
    const vf = a.cam.fov * DEG / 2, hf = Math.atan(Math.tan(vf) * this.W / this.H), eyeH = Math.max(.3, e.y - FLOOR);
    const sight = w * .62 / Math.tan(Math.min(vf, hf)), d = clamp(Math.sqrt(Math.max(0, sight * sight - eyeH * eyeH)), w * .5 + .35, 3);
    A.pos.set(e.x - Math.sin(yaw) * d, FLOOR, e.z - Math.cos(yaw) * d); A.yaw = yaw; A.table = false; A.placed = true;
    if (!a.sensor) a.pitch = -Math.atan2(eyeH, d);   // no gyro: start looking down at it
    this.settle(); haptic('medium'); sounds.thud(.6);
  }
  // Puts the anchor where AR says, and fits the sun's shadow and the contact shadow to the board's size.
  settle() {
    const a = this.va, A = this.ar, s = A.scale, w = this.span * s;
    this.anchor.visible = true; this.anchor.scale.setScalar(s); this.anchor.rotation.set(0, A.yaw, 0);
    this.anchor.position.set(A.pos.x, A.pos.y + this.base * s, A.pos.z);
    const key = [A.pos.x, A.pos.y, A.pos.z, s].map(n => n.toFixed(3)).join();
    if (key === A.sunKey) return; A.sunKey = key;
    const L = a.sunL, c = L.shadow.camera, R = w * .95;
    c.left = c.bottom = -R; c.right = c.top = R; c.near = 50 - w * 2.5; c.far = 50 + w * 2.5; c.updateProjectionMatrix();
    L.shadow.normalBias = clamp(.012 * w, .002, .04); L.shadow.bias = -.0002;
    L.target.position.copy(A.pos); L.position.copy(A.pos).addScaledVector(L.dir, 50); L.target.updateMatrixWorld();
    const cs = a.contactShadows; cs.at(A.pos.x, A.pos.z); cs.group.position.y = A.pos.y + .003; cs.group.scale.setScalar(Math.max(.25, Math.min(1, w * 2.2 / cs.size)));
    this.catcher.visible = A.pos.y > FLOOR + .05; this.catcher.position.set(A.pos.x, A.pos.y + .002, A.pos.z); this.catcher.scale.setScalar(w * 3);
    a.shadowsDirty();
  }
  async placeAt(x, y) {
    const a = this.va, A = this.ar, g = this.gen, h = await a.hit?.(x, y);
    if (!h || g !== this.gen || this.mode !== 'ar') { this.say('Point at the floor or a table and tap again'); return; }
    const e = a.eyePos; A.pos.copy(h.p); A.yaw = Math.atan2(e.x - h.p.x, e.z - h.p.z); A.table = h.p.y > FLOOR + .25; A.placing = false; A.placed = true;
    if (A.table) A.scale = Math.min(A.scale, this.real * 1.2 / this.span);   // on a table: tabletop size
    this.settle(); haptic('medium'); sounds.thud(.6);
  }

  /* ----- drawing ----- */
  /** Draws the frame: the room and table (3D) or the camera picture with the board in it (AR). HUD goes after. */
  draw(c, W, H) {
    this.W = W; this.H = H;
    if (this.mode === 'ar') { const a = this.va; a.look(1 / 60); if (this.ar.placed) this.settle(); a.draw(c, W, H); return; }
    this.placeCamera(); this.v3.render(c, W, H);
  }
  /**
   * The kit's own HUD, last in draw(): the AR / 3D chip, View (back to the home view), Move (AR:
   * tap a new place), AR's floor notes, and say() messages. extra: your own chips, [{ id, label, on }]
   * (T.up() returns { chip: id } when one is tapped).
   */
  hud(c, W, H, extra = []) {
    const chips = [];
    if (this.arOk) chips.push({ id: '_mode', label: this.mode === 'ar' ? '3D' : 'AR', on: this.mode === 'ar' });
    if (this.mode === 'ar' && this.ar.placed) chips.push({ id: '_move', label: 'Move', on: this.ar.placing });
    if (this.mode === '3d' && this.userView) chips.push({ id: '_view', label: 'View' });
    chips.push(...extra);
    c.save(); c.font = '700 11px Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    let x = W - 8; this.chips = [];
    for (const k of chips) {
      const w = Math.max(40, c.measureText(k.label).width + 20), b = { id: k.id, x: x - w, y: H - 36, w, h: 26 }; x -= w + 6; this.chips.push(b);
      c.fillStyle = k.on ? '#f2f5fbee' : '#0a0e14cc'; c.strokeStyle = k.on ? '#ffffff' : '#ffffff55'; c.lineWidth = 1;
      c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 13); c.fill(); c.stroke();
      c.fillStyle = k.on ? '#0a0e14' : '#f2f5fb'; c.fillText(k.label, b.x + w / 2, b.y + 13.5);
    }
    const m = this.msg || (this.mode === 'ar' && this.ar.placing ? { text: 'Tap where the board should go', t: 1 } : this.mode === 'ar' && !this.ar.placed && !this.va.calibrating ? { text: 'Starting the camera…', t: 1 } : null);
    if (m) {
      c.font = '600 12px Rubik, sans-serif'; const w = Math.min(W - 24, c.measureText(m.text).width + 24);
      c.globalAlpha = Math.min(1, m.t * 3); c.fillStyle = '#0a0e14dd'; c.beginPath(); c.roundRect(W / 2 - w / 2, H - 74, w, 26, 13); c.fill();
      c.fillStyle = '#fff'; c.fillText(m.text, W / 2, H - 60.5, W - 40); c.globalAlpha = 1;
    }
    c.restore();
    if (this.mode === 'ar') arNote(c, this.va, W, H);
  }
  /** A short message at the bottom of the screen for a few seconds. */
  say(text, secs = 2.6) { this.msg = { text, t: secs }; return this; }
  /**
   * The players along the top, under the score badge: list = [{ name, col, score, note }], turn = index
   * of whose go it is. Optional: games can draw their own. Returns the y just below it.
   */
  strip(c, W, list, turn = -1, { y = null } = {}) {
    const top = y ?? (this.api?.scoreArea?.().bottom ?? 40) + 5; if (this.hidden) return top + 28;
    const n = list.length, gap = 5, w = Math.min(92, (W - 16 - gap * (n - 1)) / n), x0 = W / 2 - (n * w + (n - 1) * gap) / 2;
    c.save(); c.textBaseline = 'middle';
    list.forEach((p, i) => {
      const x = x0 + i * (w + gap), on = i === turn, pulse = on ? .5 + .5 * Math.sin(this.t * 5) : 0;
      c.fillStyle = on ? '#f2f5fbf0' : '#0a0e14b8'; c.beginPath(); c.roundRect(x, top, w, 24, 12); c.fill();
      if (on) { c.strokeStyle = p.col || '#fff'; c.globalAlpha = .5 + pulse * .5; c.lineWidth = 2; c.stroke(); c.globalAlpha = 1; }
      c.fillStyle = p.col || '#fff'; c.beginPath(); c.arc(x + 12, top + 12, 6, 0, TAU); c.fill(); c.strokeStyle = on ? '#0a0e14' : '#ffffff88'; c.lineWidth = 1; c.stroke();
      c.fillStyle = on ? '#0a0e14' : '#f2f5fb'; c.font = '700 10px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText(p.name, x + 22, top + 12.5, w - (p.score != null ? 48 : 28));
      if (p.score != null) { c.textAlign = 'right'; c.font = '800 11px Rubik, sans-serif'; c.fillText(String(p.score), x + w - 8, top + 12.5); }
    });
    c.restore();
    return top + 28;
  }
  /** One line of status text ("Your move", "Mira is thinking…") centred at y. */
  status(c, W, y, text, col = '#fff') {
    if (this.hidden || !text) return y + 26;
    c.save(); c.font = '700 12px Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText(text).width + 22; c.fillStyle = '#0a0e14b8'; c.beginPath(); c.roundRect(W / 2 - w / 2, y, w, 22, 11); c.fill();
    c.fillStyle = col; c.fillText(text, W / 2, y + 11.5); c.restore();
    return y + 26;
  }

  /* ----- input ----- */
  /** Pass the game's down / move / up through these. down returns true when the kit used the touch (a chip, AR's floor screens). */
  down(x, y, id = 0) {
    if (this.mode === 'ar' && this.va.input('down', x, y, id)) return true;
    const chip = this.chips.find(b => x > b.x - 3 && x < b.x + b.w + 3 && y > b.y - 5 && y < b.y + b.h + 5);
    if (chip?.id === '_mode' && this.mode === '3d') want('motion');   // iPhones ask for motion access on this tap's release
    this.ptrs.set(id, { x, y, x0: x, y0: y, moved: 0, chip: chip?.id || null, t: this.t, multi: this.ptrs.size > 0 });
    if (this.ptrs.size === 2) { const [a, b] = [...this.ptrs.values()]; a.multi = b.multi = true; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: this.goal.zoom, scale: this.ar.scale }; }
    return !!chip;
  }
  /** The game is dragging something itself with this touch (a piece, a flick): the kit won't turn the view with it. */
  claim(id = 0) { this.claimed.add(id); return this; }
  /** Returns true when the kit used the movement (turning the view, pinching): the game should ignore it. */
  move(x, y, pressed = true, id = 0) {
    if (this.mode === 'ar' && this.va.input('move', x, y, id, pressed)) return true;
    const p = this.ptrs.get(id); if (!p || !pressed) return false;
    const dx = x - p.x, dy = y - p.y; p.x = x; p.y = y; p.moved = Math.max(p.moved, Math.hypot(x - p.x0, y - p.y0));
    if (p.chip) return true;
    if (this.claimed.has(id)) return false;
    if (this.ptrs.size >= 2 && this.pinch) {
      const [a, b] = [...this.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, k = d / this.pinch.d;
      if (this.mode === 'ar') { this.ar.scale = clamp(this.pinch.scale * k, .25 / this.span, 4 / this.span); if (this.ar.placed) this.settle(); }
      else { this.goal.zoom = clamp(this.pinch.zoom / k, .45, 1.6); this.userView = true; }
      return true;
    }
    if (p.moved < 9) return false;
    if (this.mode === 'ar') { if (this.va.sensor) { this.ar.yaw += dx * .012; if (this.ar.placed) this.settle(); } else this.va.drag(-dx, -dy); }
    else { this.goal.yaw -= dx * .009; this.goal.pitch = clamp(this.goal.pitch + dy * .007, this.minPitch, this.maxPitch); this.userView = true; }
    return true;
  }
  /**
   * Returns a tap ({ x, y }) when the touch was a tap on the board's part of the screen, the same with
   * chip: id for a tap on one of your own chips, else null (a drag, a pinch, one of the kit's chips).
   */
  up(x, y, id = 0) {
    if (this.mode === 'ar' && this.va.input('up', x, y, id)) { this.ptrs.delete(id); return null; }
    const p = this.ptrs.get(id); this.ptrs.delete(id); const mine = this.claimed.delete(id);
    if (this.ptrs.size < 2) this.pinch = null;
    if (!p || p.multi) return null;
    if (p.chip) {
      const b = this.chips.find(k => k.id === p.chip);
      if (!b || !(x > b.x - 8 && x < b.x + b.w + 8 && y > b.y - 10 && y < b.y + b.h + 10)) return null;
      haptic('light'); sounds.tick();
      if (p.chip === '_mode') { this.setMode(this.mode === 'ar' ? '3d' : 'ar'); return null; }
      if (p.chip === '_view') { this.lookHome(); return null; }
      if (p.chip === '_move') { this.ar.placing = !this.ar.placing; return null; }
      return { chip: p.chip, x, y };
    }
    if (mine || p.moved >= 9) return null;
    if (this.mode === 'ar' && this.ar.placing) { this.placeAt(x, y); return null; }
    return { x, y };
  }

  /* ----- picking ----- */
  ray(x, y) { const v = this.v; v.cam.updateMatrixWorld(); _ray.setFromCamera(_v2.set(x / this.W * 2 - 1, 1 - y / this.H * 2), v.cam); return _ray.ray; }
  /** Where screen point (x, y) meets the board's plane, in board units (a Vector3; y = h), or null. */
  pick(x, y, h = 0) {
    this.board.updateWorldMatrix(true, false);
    _r.copy(this.ray(x, y)).applyMatrix4(_m.copy(this.board.matrixWorld).invert());
    _pl.constant = -h; const p = _r.intersectPlane(_pl, new Vector3());
    return p;
  }
  /** The one of `objects` (each with whatever is inside it) under screen point (x, y), nearest first; null if none. */
  over(x, y, objects) {
    this.ray(x, y); this.board.updateWorldMatrix(true, true);
    const hit = _ray.intersectObjects(objects, true)[0]; if (!hit) return null;
    let o = hit.object; while (o && !objects.includes(o)) o = o.parent;
    return o || null;
  }
  /** Screen position [x, y, z] of a board point (z under 1 is in front of the camera): for labels and tap tests. */
  toScreen(p) { this.board.updateWorldMatrix(true, false); _v.set(p.x ?? 0, p.y ?? 0, p.z ?? 0).applyMatrix4(this.board.matrixWorld); return this.v.toScreen(_v.x, _v.y, _v.z); }
  /** Index of the board point nearest to screen point (x, y) within maxPx (points: [{ x, y, z }]), or -1. A thumb-sized way to pick pieces, pits and seats. */
  nearest(x, y, points, maxPx = 34) {
    let best = -1, bd = maxPx;
    points.forEach((p, i) => { if (!p) return; const [sx, sy, z] = this.toScreen(p); if (z >= 1) return; const d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  /* ----- particles and dice ----- */
  /**
   * Particles that follow the board into AR and back: emit({ x, y, z, vx, vy, vz, life, size, col, grav... })
   * in board units, update(dt), clear() (gs.hd Particles underneath).
   */
  particles(o = {}) {
    const self = this, sets = new Map(), p0 = new Vector3();
    const cur = () => { const v = self.v; if (!sets.has(v)) sets.set(v, new Particles(v, o)); return sets.get(v); };
    return {
      emit(e) {
        self.board.updateWorldMatrix(true, false); const s = self.mode === 'ar' ? self.ar.scale : 1;
        p0.set(e.x ?? 0, e.y ?? 0, e.z ?? 0).applyMatrix4(self.board.matrixWorld);
        const vel = new Vector3(e.vx ?? 0, e.vy ?? 0, e.vz ?? 0).applyQuaternion(self.anchor.getWorldQuaternion(_q)).multiplyScalar(s);
        cur().emit({ ...e, x: p0.x, y: p0.y, z: p0.z, vx: vel.x, vy: vel.y, vz: vel.z, size: (e.size ?? .1) * s, grav: (e.grav ?? 0) * s, floor: e.floor != null ? p0.y + (e.floor - (e.y ?? 0)) * s : undefined });
      },
      update(dt) { for (const [v, p] of sets) { if (v === self.v || p.list.length) p.update(dt); } },
      clear() { for (const p of sets.values()) p.clear(); },
    };
  }
  /**
   * Real dice thrown on the board: n rounded dice with pips, tumbling in gs.physics3d inside an unseen
   * tray. Make them in setup (the physics engine loads first). o: size (.7), body, pips (colours),
   * tray: { x, z, w, d } where they may roll in board units (the whole span by default).
   *   dice.roll({ keep: [i...] })  -> a promise of the values, e.g. [3, 5]; kept dice stay where they are
   *   dice.values, dice.meshes, dice.rolling, dice.park(i, { x, z }) (stand a die somewhere, face kept), dice.show(false)
   */
  dice(n = 2, o = {}) { const d = new DiceSet(this, n, o); this.dice_.push(d); return d; }
}

/* ---------- dice ---------- */
const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
const dieGeo = new Map();
/** A die: a rounded cube with pips set into its faces (two draws), sides laid out as gs.dice FACES expects. */
export function die(size = .7, { body = '#e6dfcd', pips = '#20242c', rough = .35 } = {}) {
  const key = size.toFixed(3);
  if (!dieGeo.has(key)) {
    const parts = [], r = size * .085, off = size * .27, h = size / 2 + size * .004;
    for (const [nStr, dir] of Object.entries(FACES)) {
      const nrm = new Vector3(dir.x, dir.y, dir.z), u = new Vector3(dir.y || dir.z ? 1 : 0, dir.x ? 1 : 0, 0), w = new Vector3().crossVectors(nrm, u);
      for (const [a, b] of PIPS[nStr]) {
        const gq = new CircleGeometry(r, 14); gq.lookAt(nrm); gq.translate(nrm.x * h + u.x * a * off + w.x * b * off, nrm.y * h + u.y * a * off + w.y * b * off, nrm.z * h + u.z * a * off + w.z * b * off);
        parts.push(gq);
      }
    }
    dieGeo.set(key, mergeGeometries(parts));
  }
  const g = new Group(), cube = new Mesh(rbox(size, size, size, size * .16), pbr(body, { rough, clear: .6 })); cube.castShadow = true; cube.receiveShadow = true;
  const dots = new Mesh(dieGeo.get(key), pbr(pips, { rough: .5 })); g.add(cube, dots); g.userData.size = size;
  return g;
}
// The rotation that puts face n of a die on top (for dice parked by hand).
const faceQuat = n => new Quaternion().setFromUnitVectors(new Vector3(FACES[n].x, FACES[n].y, FACES[n].z), new Vector3(0, 1, 0));

class DiceSet {
  constructor(table, n, { size = .7, body, pips, tray = null, gravity = -70, bounce = .32 } = {}) {
    this.T = table; this.size = size; this.n = n; this.rolling = false; this.res = null; this.still = 0; this.age = 0; this.kept = new Set();
    const S = table.span, t = this.tray = tray || { x: 0, z: 0, w: S * .9, d: S * .9 };
    const W = this.world = new World3D({ gravity });
    W.floor(0, { friction: .7, bounce: .25 });
    const wall = (x, z, w, d) => W.box(null, w, S * 3, d, { fixed: true, at: { x, y: S * 1.5, z }, bounce: .4, friction: .2 });
    wall(t.x - t.w / 2 - .5, t.z, 1, t.d + 2); wall(t.x + t.w / 2 + .5, t.z, 1, t.d + 2); wall(t.x, t.z - t.d / 2 - .5, t.w + 2, 1); wall(t.x, t.z + t.d / 2 + .5, t.w + 2, 1);
    this.meshes = []; this.bodies = [];
    for (let i = 0; i < n; i++) {
      const m = die(size, { body, pips }); m.position.set(t.x + (i - (n - 1) / 2) * size * 1.6, size / 2, t.z); table.board.add(m); this.meshes.push(m);
      this.bodies.push(W.box(m, size, size, size, { bounce, friction: .55, density: 2, spinDrag: .35, drag: .05 }));
    }
    let last = 0;
    W.onHit((a, b, speed) => { if (!this.rolling || speed < 1.2 || table.t - last < .05) return; last = table.t; sounds.tick(Math.min(1.4, speed / 8)); if (speed > 4) haptic('tick'); });
  }
  /** The numbers showing now. */
  get values() { return this.bodies.map(b => faceUp(b.body.rotation())); }
  show(on = true) { for (const m of this.meshes) m.visible = on; return this; }
  /**
   * Throws the dice (all but `keep`'s indexes) from the player's side; resolves the values once they
   * settle. from / push: where from and how hard, in board units ({ x, y, z }).
   */
  roll({ keep = [], from = null, push = null } = {}) {
    const t = this.tray, s = this.size, T = this.T;
    this.kept = new Set(keep); this.show(true);
    const at = from || { x: t.x + (Math.random() - .5) * t.w * .3, y: s * 3.2, z: t.z + t.d * .32 }, v = push || { x: (Math.random() - .5) * t.w * .5, y: 1, z: -t.d * 1.5 };
    let k = 0; const live = this.bodies.filter((b, i) => !this.kept.has(i)).length;
    this.bodies.forEach((b, i) => {
      if (this.kept.has(i)) return;
      const a = Math.random() * TAU, ax = Math.random() - .5, ay = Math.random() - .5, az = Math.random() - .5, l = Math.hypot(ax, ay, az) || 1, sn = Math.sin(a / 2);
      b.place({ x: clamp(at.x + (k - (live - 1) / 2) * s * 1.5, t.x - t.w / 2 + s, t.x + t.w / 2 - s), y: at.y + (k % 2) * s * 1.2, z: at.z + (Math.random() - .5) * s }, { x: ax / l * sn, y: ay / l * sn, z: az / l * sn, w: Math.cos(a / 2) });
      b.setVel(v.x + (Math.random() - .5) * 2, v.y, v.z + (Math.random() - .5) * 2).setSpin((Math.random() - .5) * 24, (Math.random() - .5) * 24, (Math.random() - .5) * 24);
      k++;
    });
    this.rolling = true; this.still = 0; this.age = 0; sounds.rattle(); haptic('medium');
    return T.until(new Promise(res => { this.res = res; }));
  }
  /** Stands die i at a board point with its number kept (dice set aside). */
  park(i, { x, z }) {
    const b = this.bodies[i], q = faceQuat(faceUp(b.body.rotation())); b.setVel(0, 0, 0).setSpin(0, 0, 0); b.place({ x, y: this.size / 2, z }, { x: q.x, y: q.y, z: q.z, w: q.w }); b.sync?.(); return this;
  }
  rest() { this.rolling = false; this.res = null; for (const b of this.bodies) b.setVel(0, 0, 0).setSpin(0, 0, 0); }
  step(dt) {
    if (!this.rolling) return;
    this.world.step(Math.min(dt, 1 / 30)); this.age += dt;
    const live = this.bodies.filter((b, i) => !this.kept.has(i));
    const moving = live.some(b => b.speed > .08 || Math.hypot(b.spin.x, b.spin.y, b.spin.z) > .15);
    this.still = moving ? 0 : this.still + dt;
    // a die leaning on another (or a wall) never reads cleanly: nudge it, and after 5 s take what's showing
    if (this.still > .2 && this.age < 5) for (const b of live) {
      const q = b.body.rotation();
      if (rotY(FACES[faceUp(q)], q) < .96) { b.setVel((Math.random() - .5) * 3, 4, (Math.random() - .5) * 3).setSpin((Math.random() - .5) * 10, 0, (Math.random() - .5) * 10); this.still = 0; }
    }
    if (this.still > .25 || this.age > 5) { this.rolling = false; const r = this.res; this.res = null; sounds.clack(.5); r?.(this.values); }
  }
}
// how far a die's local direction points up once turned by q
const rotY = (v, q) => {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y, iy = q.w * v.y + q.z * v.x - q.x * v.z, iz = q.w * v.z + q.x * v.y - q.y * v.x, iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
};

/* ---------- boards and pieces ---------- */
/**
 * A board: a slab with a top painted in code and a wooden rim, its top at y = 0. w, d: the painted
 * area in board units; paint(g, S): draw the top on a square canvas of S pixels (g.col colour, g.h
 * height for grooves, g.r roughness: the same as gs.hd.surface); thick: how deep the slab is (.3, the
 * Table's `base`); rim: the frame's width (.35; 0 for none); wood: its colour; px: canvas size (1024).
 */
export function slab({ w = 8, d = 8, thick = .3, rim = .35, wood: colour = '#7a4c2a', px = 1024, paint = null, rough = .6, strength = 1.6 } = {}) {
  const g = new Group();
  const set = surface(px, G => { G.col.fillStyle = '#d8c8a8'; G.col.fillRect(0, 0, px, px); paint?.(G, px); }, { strength });
  const top = new Mesh(new PlaneGeometry(w, d).rotateX(-Math.PI / 2), pbr('#ffffff', { tex: set, rough })); top.receiveShadow = true; top.position.y = 0; g.add(top);
  const frame = wood(colour, { repeat: [2, 2], clear: .35 });
  const body = new Mesh(rbox(w + rim * 2, thick, d + rim * 2, Math.min(thick * .3, .08)), frame); body.position.y = -thick / 2 - .004; body.castShadow = body.receiveShadow = true; g.add(body);
  if (rim > 0) for (const [x, z, bw, bd] of [[0, -(d + rim) / 2, w + rim * 2, rim], [0, (d + rim) / 2, w + rim * 2, rim], [-(w + rim) / 2, 0, rim, d], [(w + rim) / 2, 0, rim, d]]) {
    const b = new Mesh(rbox(bw, .1, bd, .03), frame); b.position.set(x, .012, z); b.castShadow = b.receiveShadow = true; g.add(b);
  }
  g.userData.top = top; g.userData.thick = thick;
  return g;
}
/** A flat picture lying on the board (labels, cards, tiles' faces): draw(ctx, px) paints a square canvas. Returns a Mesh w x d at y = lift. */
export function decal(w, d, draw, { px = 256, lift = .012, rough = .7, glow = 0 } = {}) {
  const cv = Object.assign(document.createElement('canvas'), { width: px, height: Math.max(8, Math.round(px * d / w)) }), ctx = cv.getContext('2d');
  draw(ctx, cv.width, cv.height);
  const tex = new CanvasTexture(cv); tex.colorSpace = SRGBColorSpace; tex.anisotropy = 4;
  const m = pbr('#ffffff', { rough, transparent: true, alphaTest: .02 }); m.map = tex; if (glow) { m.emissive = new Color('#ffffff'); m.emissiveMap = tex; m.emissiveIntensity = glow; }
  const mesh = new Mesh(new PlaneGeometry(w, d).rotateX(-Math.PI / 2), m); mesh.position.y = lift; mesh.receiveShadow = true; mesh.userData.redraw = fn => { ctx.clearRect(0, 0, cv.width, cv.height); fn(ctx, cv.width, cv.height); tex.needsUpdate = true; };
  return mesh;
}
const shade = (col, k) => new Color(col).multiplyScalar(k).getStyle();
const mat = (col, o = {}) => (col && col.isMaterial ? col : pbr(col, { rough: .35, clear: .5, ...o }));
/** A turned pawn (the classic playing piece): col a colour or a material; r its base radius, h its height. */
export function pawn(col = '#d94a3a', { r = .3, h = .9, ...o } = {}) {
  const m = latheMesh([[0, 0], [r, 0], [r, h * .07], [r * .82, h * .12], [r * .42, h * .5], [r * .52, h * .56], [r * .3, h * .62], [r * .5, h * .74], [r * .55, h * .84], [r * .42, h * .95], [r * .2, h], [0, h]], mat(col, o), 28);
  m.userData.h = h; return m;
}
/** A flat round playing piece (draughts, carrom, counters) with a turned ring on top. */
export function disc(col = '#e8dcc0', { r = .4, h = .16, ...o } = {}) {
  const m = latheMesh([[0, 0], [r * .96, 0], [r, h * .2], [r, h * .8], [r * .94, h], [r * .8, h], [r * .74, h * .82], [r * .5, h * .82], [r * .44, h], [0, h]], mat(col, { rough: .3, ...o }), 36);
  m.userData.h = h; return m;
}
/** A glass pebble (mancala stones, Go stones, gems). */
export function stone(col = '#4ab0e8', { r = .2, ...o } = {}) {
  const m = new Mesh(new SphereGeometry(r, 18, 12), mat(col, { rough: .08, clear: 1, ...o })); m.scale.y = .62; m.castShadow = true; m.userData.h = r * 1.24; return m;
}
/** A ring lying on the board to mark a square or a piece (glows a little): r its radius. */
export function ring(col = '#ffe08a', { r = .45, w = .05, glow = 1.6 } = {}) {
  const m = new Mesh(new TorusGeometry(r, w, 8, 40).rotateX(Math.PI / 2), pbr(col, { glow, rough: .4 })); m.position.y = .03; return m;
}
/** A soft dot on the board (where a piece can go). */
export function dot(col = '#ffe08a', { r = .16, glow = 1.4 } = {}) {
  const m = new Mesh(new CylinderGeometry(r, r, .03, 20), pbr(col, { glow, rough: .4, transparent: true, opacity: .85 })); m.position.y = .02; return m;
}

const eyeGeo = new Map();
/**
 * A pair of glowing eyes to add to a piece that's alive: piece.add(eyes('#ffd27a', { y: .7, z: .15 })).
 * y: how high, z: how far forward (+z is the piece's front), gap: how far apart, r: their size. One mesh;
 * share the material between pieces (pass one made with gs.hd.pbr(col, { glow })) to pulse them all at once.
 */
export function eyes(col = '#ffd27a', { y = .7, z = .15, gap = .07, r = .036, glow = 2 } = {}) {
  const key = [y, z, gap, r].join();
  if (!eyeGeo.has(key)) eyeGeo.set(key, mergeGeometries([new SphereGeometry(r, 8, 6).translate(-gap, y, z), new SphereGeometry(r, 8, 6).translate(gap, y, z)]));
  return new Mesh(eyeGeo.get(key), col && col.isMaterial ? col : pbr(col, { glow, rough: .4 }));
}

// Chess pieces turned on a lathe (the knight's head is cut from a plate), in squares: a king is 1.5 tall.
const CHESS = {
  p: { h: .82, body: [[0, 0], [.3, 0], [.3, .06], [.25, .1], [.24, .16], [.12, .4], [.19, .46], [.19, .5], [.1, .54], [.17, .62], [.19, .7], [.16, .78], [.08, .82], [0, .82]] },
  r: { h: .92, body: [[0, 0], [.33, 0], [.33, .07], [.27, .12], [.26, .2], [.2, .3], [.2, .62], [.27, .68], [.27, .92], [.2, .92], [.2, .82], [0, .82]] },
  n: { h: 1.02, body: [[0, 0], [.33, 0], [.33, .07], [.27, .12], [.26, .2], [.2, .3], [.24, .36], [.2, .4], [0, .4]] },
  b: { h: 1.2, body: [[0, 0], [.33, 0], [.33, .07], [.27, .12], [.26, .2], [.13, .5], [.2, .58], [.2, .62], [.12, .66], [.2, .82], [.2, .92], [.12, 1.06], [.05, 1.1], [.09, 1.15], [.05, 1.2], [0, 1.2]] },
  q: { h: 1.36, body: [[0, 0], [.35, 0], [.35, .07], [.29, .12], [.28, .2], [.14, .62], [.22, .7], [.22, .74], [.13, .78], [.17, 1.0], [.25, 1.16], [.19, 1.18], [.12, 1.14], [.1, 1.22], [.14, 1.28], [.08, 1.36], [0, 1.36]] },
  k: { h: 1.5, body: [[0, 0], [.36, 0], [.36, .07], [.3, .12], [.29, .2], [.15, .66], [.23, .74], [.23, .78], [.14, .82], [.18, 1.06], [.25, 1.2], [.2, 1.24], [0, 1.24]] },
};
const chessGeo = new Map();
function chessGeometry(kind) {
  if (chessGeo.has(kind)) return chessGeo.get(kind);
  const C = CHESS[kind], parts = [new LatheGeometry(C.body.map(p => new Vector2(p[0], p[1])), 28).toNonIndexed()];
  const add = (geo, x, y, z) => { geo.translate(x, y, z); parts.push(geo.index ? geo.toNonIndexed() : geo); };
  if (kind === 'n') {
    const s = new Shape(); const P = [[-.2, .36], [.2, .36], [.21, .52], [.15, .66], [.24, .74], [.31, .86], [.3, .93], [.2, .96], [.08, .9], [.03, .98], [-.06, 1.06], [-.12, 1.02], [-.15, .92], [-.24, .76], [-.27, .56]];
    s.moveTo(P[0][0], P[0][1]); for (const p of P.slice(1)) s.lineTo(p[0], p[1]);
    const head = new ExtrudeGeometry(s, { depth: .2, bevelEnabled: true, bevelThickness: .035, bevelSize: .035, bevelSegments: 2, curveSegments: 4 });
    head.translate(0, 0, -.1); head.rotateY(-Math.PI / 2); parts.push(head.toNonIndexed());   // nose towards +z (forwards)
  }
  if (kind === 'k') { add(new BoxGeometry(.07, .3, .07), 0, 1.36, 0); add(new BoxGeometry(.22, .07, .07), 0, 1.4, 0); }
  if (kind === 'q') for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; add(new SphereGeometry(.045, 8, 6), Math.cos(a) * .23, 1.19, Math.sin(a) * .23); }
  if (kind === 'r') for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4, g = new BoxGeometry(.16, .12, .1); g.rotateY(-a); add(g, Math.cos(a) * .235, .98, Math.sin(a) * .235); }
  for (const p of parts) { for (const k of Object.keys(p.attributes)) if (!['position', 'normal', 'uv'].includes(k)) p.deleteAttribute(k); }
  const geo = mergeGeometries(parts); geo.computeVertexNormals();
  chessGeo.set(kind, geo); return geo;
}
/** A chess piece: kind 'p' | 'r' | 'n' | 'b' | 'q' | 'k', col a colour or material. One mesh, its base at y = 0, a knight's nose towards +z. */
export function chessman(kind, col = '#e8e0d0', o = {}) {
  const m = new Mesh(chessGeometry(kind), mat(col, o)); m.castShadow = m.receiveShadow = true; m.userData.h = CHESS[kind].h; m.userData.kind = kind; return m;
}
/**
 * Joins the meshes inside a group that share a material into one mesh each, so a ladder's rungs or a
 * fence's posts are one draw, not twenty. Returns a new Group in the same place; build first, fuse last.
 */
export function fuse(group) {
  group.updateMatrixWorld(true);
  const inv = new Matrix4().copy(group.matrixWorld).invert(), by = new Map();
  group.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(new Matrix4().multiplyMatrices(inv, o.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!by.has(o.material)) by.set(o.material, []); by.get(o.material).push(g);
  });
  const out = new Group(); out.position.copy(group.position); out.quaternion.copy(group.quaternion); out.scale.copy(group.scale); out.userData = { ...group.userData };
  for (const [m, list] of by) { const mesh = new Mesh(mergeGeometries(list), m); mesh.castShadow = mesh.receiveShadow = true; out.add(mesh); }
  return out;
}
/** Board-game colours that sit well together: four player colours and two "sides". */
export const COLOURS = Object.freeze({ players: Object.freeze(['#e0483a', '#3a8fe0', '#f0b429', '#3fb56b', '#a05ad6', '#e87a2a']), light: '#efe6d2', dark: '#2a2d36' });
export { shade, EASE };
