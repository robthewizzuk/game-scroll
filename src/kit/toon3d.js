// Console 3D kit: real-time 3D, cel-shaded (toon ramp) with ink outlines, real toon shadows and a rim
// of light, for era:'console' games.
//
// One shared renderer draws every Console game: WebGPU where the device has it (gpu.js consoleGPU(),
// the passes in toon3d-gpu.js), else WebGL (phones only allow a handful of WebGL contexts, and the
// feed can hold many slides). Both draw the same picture: scripts/look-compare.cjs checks them against
// each other. Each game owns a View: a three.js scene + camera. In draw(c)
// a game calls v.frame(), places things with v.put(...) (an immediate-mode pool, so game logic can
// stay as plain arrays of objects), then v.render(c) renders the 3D frame into the slide's 2D
// canvas. HUD text and effects are then drawn on top with the normal 2D canvas calls.
//
// Cameras keep touch input simple, because game logic and input stay in the game's own 2D units:
//  - v.board(W, H): tilted top-down diorama view. Ground point (x, y) is drawn exactly at screen
//    (x, y), so taps still mean "this spot on the floor". Use v.at(x, y, height) for positions.
//  - v.side(W, H): side-on view. Point (x, y) on the z=0 plane maps exactly to screen (x, y).
//    Use v.sv(x, y, z) for positions; z < 0 is further away (background), z > 0 nearer.
//  - v.persp(fov): a free perspective camera (runners, racers) the game moves itself; use
//    v.toScreen(x, y, z) to place 2D HUD effects over 3D things.
import { timed } from './prof.js';
import {
  Scene, Color, Fog, OrthographicCamera, PerspectiveCamera, DirectionalLight, HemisphereLight,
  MeshToonMaterial, MeshBasicMaterial, ShaderMaterial, ShadowMaterial, Mesh, Group, DataTexture, NearestFilter, RGBAFormat,
  BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry, CapsuleGeometry, TorusGeometry, PlaneGeometry,
  CircleGeometry, RingGeometry, BufferGeometry, BufferAttribute, OctahedronGeometry, DodecahedronGeometry, IcosahedronGeometry, DoubleSide, Vector2, Vector3, Vector4, Matrix4, SRGBColorSpace,
  WebGLRenderTarget, DepthTexture, UnsignedIntType, MeshNormalMaterial, ShaderChunk, CustomBlending, SrcAlphaFactor, OneMinusSrcAlphaFactor, ZeroFactor, OneFactor,
} from 'three';

import { copyFrame, consoleGPU, consoleWait, prepareConsoleGPU, gpuMending } from './gpu.js';
import { makeRenderer } from './renderer.js';
import { lookPatch, looksOf } from './looks.js';
import { phoneClass } from './speed.js';
import { Rig } from './poses.js';
export * as THREE from 'three';

/* ---------- shared renderer ---------- */
let R = null, broken = false;
function renderer() {
  if (R || broken) return R;
  try {
    const cv = document.createElement('canvas');
    R = makeRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
    R.outputColorSpace = SRGBColorSpace; R.setPixelRatio(1); R.shadowMap.enabled = true;   // (a view without shadows has no light that casts them)
  } catch (e) { broken = true; R = null; }
  return R;
}
/** True if this device can draw the 3D Console games. */
export const has3D = () => !!(consoleGPU() || renderer());

// Max pixels rendered per frame; bigger canvases are rendered smaller and scaled up (keeps phones cool).
const MAX_PX = 1.1e6;
let quality = 1, avgGap = 16, tick = 0;

/* ---------- materials ---------- */
// Three-band toon ramp: shadow, mid, lit. three.js looks it up at dot(N, L) * .5 + .5, so with ten
// steps: facing away = shadow, side-on to the sun = mid, facing it = lit. Nearest filtering gives the
// hard cel-shading steps.
const RAMP = [100, 100, 100, 100, 100, 175, 175, 175, 255, 255];
const ramp = new DataTexture(new Uint8Array(RAMP.flatMap(v => [v, v, v, 255])), RAMP.length, 1, RGBAFormat);
ramp.minFilter = ramp.magFilter = NearestFilter; ramp.needsUpdate = true;

// The cel look ('cel'; its WebGPU twin is toon3d-gpu.js CelModel): a cast shadow is folded into the
// ramp, not multiplied on top of it. A pixel in shadow reads the ramp at its dark end, so a shadow on
// the ground is exactly as dark as the side of a thing that faces away from the sun, a shaded side isn't
// darkened twice, and the shadow's edge is one clean line (smoothed over a pixel).
// And the retro looks (View retro), on unlit materials too ('retro'): corners that snap to the pixel
// grid, and colours cut to a few shades with a dither pattern.
// Every number is in these shared holders, set by each view as it draws: materials are shared by all games.
const CEL = {
  gsRetro: { value: new Vector4(0, 0, 0, 0) },   // the grid corners snap to (x, y; 0 = off), shades in each colour channel less one (0 = all)
};
const swap = (src, a, b) => (src.includes(a) ? src.replace(a, b) : null);
const CEL_PARS = swap(ShaderChunk.lights_toon_pars_fragment, 'vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;',
  `float gsW = clamp( fwidth( gsShade ), 0.02, 0.5 );
	float gsBand = mix( texture2D( gradientMap, vec2( 0.0 ) ).r, texture2D( gradientMap, vec2( dot( geometryNormal, directLight.direction ) * 0.5 + 0.5, 0.0 ) ).r, smoothstep( 0.5 - gsW, 0.5 + gsW, gsShade ) );
	vec3 irradiance = vec3( gsBand ) * directLight.color;`);
const CEL_BEGIN = (() => {
  const a = swap(ShaderChunk.lights_fragment_begin, 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]', 'gsShade = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]');
  return a && swap(a, 'getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight );\n\t\tgsShade = 1.0;');
})();
/** False if three.js's toon shader has changed under the cel look (kit-test checks): shadows then darken the plain way. */
export const celReady = !!(CEL_PARS && CEL_BEGIN);
const AT = c => `#include <${c}>`;
const BAYER = 'float gsBayer(vec2 p) { ivec2 q = ivec2(p) & 3; const float M[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.); return (M[q.x + q.y * 4] + .5) / 16.; }\n';
const SNAP = [AT('project_vertex'), 'after', '\n  if (gsRetro.x > 0. && gl_Position.w > 0.) gl_Position.xy = floor(gl_Position.xy / gl_Position.w * gsRetro.xy + .5) / gsRetro.xy * gl_Position.w;'];
const SHADES = [AT('dithering_fragment'), 'after', '\n  if (gsRetro.z > 0.) gl_FragColor.rgb = floor(gl_FragColor.rgb * gsRetro.z + gsBayer(gl_FragCoord.xy)) / gsRetro.z;'];
const CEL_SPEC = {
  uniforms: CEL, vertexHead: 'uniform vec4 gsRetro;\n', fragmentHead: 'uniform vec4 gsRetro; float gsShade = 1.0;\n' + BAYER, vertex: [SNAP],
  fragment: [...(celReady ? [[AT('lights_toon_pars_fragment'), 'replace', CEL_PARS], [AT('lights_fragment_begin'), 'replace', CEL_BEGIN]] : []), SHADES],
};
const RETRO_SPEC = { uniforms: { gsRetro: CEL.gsRetro }, vertexHead: 'uniform vec4 gsRetro;\n', fragmentHead: 'uniform vec4 gsRetro;\n' + BAYER, vertex: [SNAP], fragment: [SHADES] };
const SNAP_SPEC = { uniforms: { gsRetro: CEL.gsRetro }, vertexHead: 'uniform vec4 gsRetro;\n', vertex: [SNAP] };   // (the outline's normals: corners only)
const cel = m => (lookPatch(m, 'cel', CEL_SPEC), m);
const retro = m => (lookPatch(m, 'retro', RETRO_SPEC), m);

const mats = new Map();
/** Cel-shaded material for a colour (cached). opts.glow makes it self-lit (lamps, gems, lasers). */
export function toon(col, { glow = 0, opacity = 1 } = {}) {
  const k = col + '|' + glow + '|' + opacity;
  let m = mats.get(k);
  if (!m) {
    m = cel(new MeshToonMaterial({ color: col, gradientMap: ramp, transparent: opacity < 1, opacity }));
    if (glow) { m.emissive = new Color(col); m.emissiveIntensity = glow; }
    mats.set(k, m);
  }
  return m;
}
/** Unlit flat colour (sky cards, light beams, view cones). */
export function flat(col, opacity = 1, { side = 0, depthWrite } = {}) {
  const k = 'f' + col + '|' + opacity + '|' + side;
  let m = mats.get(k);
  if (!m) { m = retro(new MeshBasicMaterial({ color: col, transparent: opacity < 1, opacity, side: side ? DoubleSide : 0, depthWrite: depthWrite ?? opacity >= 1 })); mats.set(k, m); }
  return m;
}

// Ink lines: after the colour pass, the scene is drawn again with view-space normals + depth
// (small offscreen target), and a full-screen pass inks every pixel where the depth jumps
// (silhouettes) or the surface turns sharply (creases, box edges). That is the classic cel-shaded
// "drawn" look, it is the same width on every shape, and costs one extra cheap pass.
// The same pass lays the rim of light: a band just inside the ink on the side of each thing that faces
// the sun (found the way the ink is: the depth jumps a little further out, towards the sun on screen),
// so it is as wide on a small character as on a big one.
// Things on layer 1 (unlit flat materials, parts made with line:false) get no ink and no rim.
let normRT = null, normMat = null, inkQuad = null, inkCam = null;
const inkU = {
  tN: { value: null }, tD: { value: null }, px: { value: new Vector2() }, persp: { value: 0 }, near: { value: 1 }, far: { value: 100 },
  dTol: { value: 1 }, fade: { value: new Vector2(1e9, 1e9) }, ink: { value: new Color('#14101c') },
  rim: { value: new Vector3(-.7, .7, 0) }, rimCol: { value: new Color('#fff6e8') },   // the way to the sun on screen (x, y) and the rim's strength; its colour (as the screen shows it)
};
function inkSetup() {
  if (inkQuad) return;
  normMat = new MeshNormalMaterial(); lookPatch(normMat, 'snap', SNAP_SPEC);   // (corners snap in the outline's pass as they do in the picture)
  inkCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  inkQuad = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
    uniforms: inkU, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform sampler2D tN, tD; uniform vec2 px; uniform float persp, near, far, dTol; uniform vec2 fade; uniform vec3 ink, rim, rimCol;
      float lin(vec2 uv){ float d = texture2D(tD, uv).x; if (persp > .5) { float z = d * 2. - 1.; return 2. * near * far / (far + near - z * (far - near)); } return near + d * (far - near); }
      vec3 nrm(vec2 uv){ return texture2D(tN, uv).xyz * 2. - 1.; }
      void main(){
        float dc = lin(vUv); vec3 nc = nrm(vUv); float e = 0.;
        vec2 o[4]; o[0] = vec2(px.x, 0.); o[1] = vec2(-px.x, 0.); o[2] = vec2(0., px.y); o[3] = vec2(0., -px.y);
        for (int i = 0; i < 4; i++) {
          float d = lin(vUv + o[i]); vec3 n = nrm(vUv + o[i]);
          float tol = dTol * (persp > .5 ? min(d, dc) * .06 + .02 : 1.);
          // only the nearer side of a depth jump gets the line, so lines hug the object in front
          if (d - dc > tol) e = 1.;
          if (dot(n, nc) < .55 && texture2D(tD, vUv + o[i]).x < 1.) e = max(e, .85);
        }
        // the rim: nothing but far things a little way off towards the sun
        float r = 0.;
        if (rim.z > 0.) for (int i = 0; i < 2; i++) {
          float m = i == 0 ? 1.7 : 2.7, d = lin(vUv + rim.xy * px * m);
          if (d - dc > dTol * m * (persp > .5 ? dc * .06 + .02 : 1.)) r = rim.z;
        }
        float seen = texture2D(tD, vUv).x >= 1. ? 0. : 1. - smoothstep(fade.x, fade.y, dc);
        e *= seen; r *= seen;
        if (e >= .01) gl_FragColor = vec4(ink, e); else if (r > 0.) gl_FragColor = vec4(rimCol, r); else discard;
      }`,
  }));
}

/* ---------- shapes (unit sized; scale them) ---------- */
export const G = {
  box: new BoxGeometry(1, 1, 1),
  ball: new SphereGeometry(1, 18, 12),
  cyl: new CylinderGeometry(1, 1, 1, 16),
  cone: new ConeGeometry(1, 1, 16),
  pill: new CapsuleGeometry(.5, 1, 4, 10),
  ring: new TorusGeometry(1, .25, 8, 20),
  gem: new OctahedronGeometry(1),
  rock: new DodecahedronGeometry(1),
  blob: new IcosahedronGeometry(1, 1),
  plane: new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  disc: new CircleGeometry(1, 20).rotateX(-Math.PI / 2),
  prism: new CylinderGeometry(.5, .5, 1, 3).rotateX(-Math.PI / 2), // roof: ridge along z, apex up
  hoop: new RingGeometry(.86, 1, 32).rotateX(-Math.PI / 2),
};

/**
 * A cel-shaded mesh with an ink outline. geo is a geometry (G.box etc.), col a hex colour or a
 * material. Options: s (uniform scale) or sx/sy/sz, x/y/z offset, rx/ry/rz rotation, line (false
 * for no outline). Returns the mesh; add more parts to it with mesh.add(part(...)).
 */
export function part(geo, col, o = {}) {
  const m = new Mesh(geo, typeof col === 'string' ? toon(col, o) : col);
  if (o.line === false || (typeof col !== 'string' && col.isMeshBasicMaterial)) m.layers.set(1);
  const s = o.s ?? 1; m.scale.set(o.sx ?? s, o.sy ?? s, o.sz ?? s);
  m.position.set(o.x || 0, o.y || 0, o.z || 0); m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  return m;
}
/** Group several parts into one object: grp(part(...), part(...)). */
export function grp(...kids) { const g = new Group(); for (const k of kids) g.add(k); return g; }

// Unlit and see-through meshes (beams, cones, shadows, glows) never get ink lines.
function noInk(o) { o.traverse(m => { if (m.isMesh && (m.material.isMeshBasicMaterial || m.material.transparent)) m.layers.set(1); }); }

/* ---------- real shadows ---------- */
// The sun casts real shadows: every lit, solid mesh casts one and every lit mesh takes them (cel()
// above folds them into the ramp). The shadow's camera is fitted to what the view shows, looking along
// the sun's direction; the game's sun stays wherever the game put it. Off on low-end phones and with
// new View({ shadows: false }): blob() discs show then, as they always did.
/** Test switches (window.__toon under automation; not on gs): shadows true / false in place of the phone's class. Tests draw with shadows on, whatever they run on. */
export const TOON = { shadows: typeof navigator !== 'undefined' && navigator.webdriver ? true : null, backend: '', why: '', ready: prepareConsoleGPU };   // (backend, why: what the last view drew on, and why on WebGL if it could have been WebGPU)
if (TOON.shadows && typeof window !== 'undefined') window.__toon = TOON;
const lit = m => !!(m && (m.isMeshToonMaterial || m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial));
const thin = g => { const b = g.boundingBox || (g.computeBoundingBox(), g.boundingBox); return !b || b.max.x - b.min.x < 1e-6 || b.max.y - b.min.y < 1e-6 || b.max.z - b.min.z < 1e-6; };
// a mesh that casts a shadow: lit, solid, and not a flat sheet (floors, puddles, rings on the ground)
const casts = m => m.isMesh && !m.userData.gsBlob && !m.userData.gsNoShadow && !Array.isArray(m.material) && lit(m.material) && !m.material.transparent && !thin(m.geometry);
const dressed = new WeakSet(), onGpu = new WeakSet();   // meshes whose shadow flags are set; materials that have their WebGPU side
function shadowFlags(m) {   // once for each mesh, the first frame it is in a view
  dressed.add(m);
  if (m.userData.gsBlob) return;
  const ms = Array.isArray(m.material) ? m.material : [m.material];
  if (casts(m)) m.castShadow = true;
  if (ms.some(lit)) m.receiveShadow = true;
}
// what a thing given to a view holds: does it cast a shadow, and its blob() discs
function shadowParts(root) {
  let c = false; const blobs = [];
  root.traverse(m => { if (m.userData.gsBlob) blobs.push(m); else if (casts(m)) c = true; });
  return { casts: c, blobs };
}
function shadowSetup(v, s = v.sun.shadow) {
  const base = s.updateMatrices, fit = v.fit ||= { c: new Vector3(), r: 100, texel: 1, snap: false, size: phoneClass() === 'top' ? 2048 : 1024 };
  const at = new Matrix4(), to = new Matrix4(), fake = { matrixWorld: at, target: { matrixWorld: to } }, d = new Vector3(), p = new Vector3(), rt = new Vector3(), up = new Vector3();
  s.mapSize.set(fit.size, fit.size);
  s.updateMatrices = function (light) {
    d.setFromMatrixPosition(light.matrixWorld).sub(p.setFromMatrixPosition(light.target.matrixWorld)).normalize();
    p.copy(fit.c);
    // a view that moves (persp) steps its shadow a whole texel at a time, so its edges don't shimmer
    if (fit.snap && rt.set(0, 1, 0).cross(d).lengthSq() > 1e-6) {
      rt.normalize(); up.crossVectors(d, rt);
      const x = p.dot(rt), y = p.dot(up), t = fit.texel;
      p.addScaledVector(rt, Math.round(x / t) * t - x).addScaledVector(up, Math.round(y / t) * t - y);
    }
    to.setPosition(p); at.setPosition(p.addScaledVector(d, fit.r * 3));
    base.call(this, fake);
  };
}
const _fwd = new Vector3(), QBG = new Color();
function fitSun(v) {
  const f = v.fit, cam = v.cam, s = v.sun.shadow, sc = s.camera;
  if (v.mode === 'board') { f.c.set(0, 0, 0); f.r = Math.hypot(v.W, v.H / (v.sin || 1)) / 2 * 1.2; f.snap = false; }
  else if (v.mode === 'side') { f.r = Math.hypot(v.W, v.H) / 2 * 1.3; f.c.set(0, 0, -f.r * .3); f.snap = false; }
  else {   // persp: the ground in front of the camera, as far as the fog (or v.shadowReach)
    const fog = v.scene.fog, reach = v.shadowReach || (fog ? fog.far : Math.min(cam.far * .25, 60));
    f.r = reach * .55; cam.getWorldDirection(_fwd); f.c.copy(cam.position).addScaledVector(_fwd, f.r * .85); f.snap = true;
  }
  f.texel = 2 * f.r / f.size;
  if (sc.right !== f.r) { sc.left = sc.bottom = -f.r; sc.right = sc.top = f.r; sc.near = f.r; sc.far = f.r * 5; sc.updateProjectionMatrix(); }
  s.normalBias = f.texel * 1.5; s.bias = -f.texel * .5 / (f.r * 4);
}
const lum = c => .2126 * c.r + .7152 * c.g + .0722 * c.b;
// How see-through the background's shadow is: as dark as a shadow on a flat toon floor (the ramp's dark
// end against the band a floor facing up gets), worked out in the screen's colours, where it is blended.
function floorShade(v) {
  const sun = v.sun, s = lum(sun.color) * sun.intensity, a = lum(v.hemi.color) * v.hemi.intensity;
  _fwd.copy(sun.position).sub(sun.target.position).normalize();
  const band = RAMP[Math.min(RAMP.length - 1, Math.floor((_fwd.y * .5 + .5) * RAMP.length))] / 255, bright = s * band + a;
  return bright > 0 ? 1 - Math.pow((s * RAMP[0] / 255 + a) / bright, 1 / 2.2) : 0;
}

/* ---------- retro looks ---------- */
// new View({ retro }): the picture drawn small and scaled up, the way early 3D consoles looked.
//   'chunky'  240 lines with hard pixels, corners that snap to the pixel grid (the wobble) and 15-bit colour with a dither pattern
//   'soft'    240 lines scaled up smoothly: the soft, blurred look
//   'tube'    240 soft lines with scanlines, like an old TV
// or your own mix: { lines, smooth, snap, bits (shades in each colour: 2^bits), scan (0..1, how dark the lines between rows) }.
const RETRO = {
  chunky: { lines: 240, smooth: false, snap: true, bits: 5, scan: 0 },
  soft: { lines: 240, smooth: true, snap: false, bits: 0, scan: 0 },
  tube: { lines: 240, smooth: true, snap: false, bits: 0, scan: .28 },
};
const retroOf = r => (!r ? null : typeof r === 'string' ? RETRO[r] || null : { lines: 240, smooth: false, snap: false, bits: 0, scan: 0, ...r });
function scanlines(c, w, h, lines, a) {
  const row = h / lines; c.save(); c.fillStyle = `rgba(0,0,0,${a})`; c.beginPath();
  for (let i = 0; i < lines; i++) c.rect(0, (i + .62) * row, w, row * .38);
  c.fill(); c.restore();
}

/* ---------- view ---------- */
export class View {
  /**
   * bg, fog [colour, near, far], sun [x, y, z] + sunI, sky / ground / amb (the light from all round).
   * shadows: false for blob() discs and no real shadows. rim: 0..1, how bright the rim of light on the sunny side of things is (0 = none).
   * floor: false if the bare background of a board view isn't ground (a drop, the sky): no shadows land on it.
   * retro: 'chunky' | 'soft' | 'tube' or { lines, smooth, snap, bits, scan }.
   */
  constructor({ bg = '#88c8f0', fog = null, sun = [-.5, 1, .6], sunI = 2.2, sky = '#ffffff', ground = '#808080', amb = 1.1, shadows = true, rim = .35, floor = true, retro: look = null } = {}) {
    // (the app gets the Console WebGPU renderer ready before a Console game runs: gamescroll.js loadParts. If it
    // isn't there yet, it is started here for the next view, and this one draws on WebGL: games make their
    // view in draw(), where nothing can wait)
    consoleWait();
    this.scene = new Scene(); this.scene.background = new Color(bg);
    if (fog) this.scene.fog = new Fog(fog[0], fog[1], fog[2]);
    this.sun = new DirectionalLight('#fff6e8', sunI); this.sun.position.set(...sun); this.scene.add(this.sun, this.sun.target);
    this.hemi = new HemisphereLight(sky, ground, amb); this.scene.add(this.hemi);
    this.pools = new Map(); this.kinds = new Map(); this.W = 160; this.H = 160; this.mode = 'board';
    this.cam = new OrthographicCamera(-80, 80, 80, -80, -2000, 4000); this.elev = .9;
    this.shadows = shadows; this.rim = rim; this.floor = floor; this.retro = retroOf(look);
    this.blobs = []; this.added = [];   // blob() discs that a real shadow stands in for (in pooled things, in added ones)
    shadowSetup(this); this.shades = { gl: null, gpu: null };   // (each renderer gets a shadow of its own: render)
    // a board view's bare background is its floor: it takes shadows too. Drawn before everything else and
    // with no depth, so whatever the game draws there (a floor of its own) covers it.
    const cm = new ShadowMaterial({ color: 0x000000, opacity: .2, depthTest: false, depthWrite: false });
    cm.transparent = false; cm.blending = CustomBlending; cm.blendSrc = SrcAlphaFactor; cm.blendDst = OneMinusSrcAlphaFactor; cm.blendSrcAlpha = ZeroFactor; cm.blendDstAlpha = OneFactor;   // (the canvas stays solid under the shadow)
    const ct = this.catcher = new Mesh(G.plane, cm); ct.layers.set(1); ct.renderOrder = -1e9; ct.receiveShadow = true; ct.frustumCulled = false; ct.visible = false; dressed.add(ct);
    this.scene.add(ct);
  }
  /**
   * Tilted top-down view of a W x H floor. elev = camera angle above the horizon (radians).
   * Default is orthographic: floor point (x, y) is drawn exactly at screen (x, y), so input needs no
   * change. With fov (degrees) it is a real perspective view (far side smaller, the strongest 3D
   * look); then turn screen taps into floor points with v.pick(x, y), and place 2D labels with
   * v.toScreen(...v.at(x, y, h)). zoom > 1 crops in closer.
   */
  board(W, H, elev = this.elev, fov = 0, zoom = 1) {
    this.mode = 'board'; this.elev = elev;
    if (!fov) {
      this.W = W; this.H = H; this.persp3 = false;
      if (!this.cam.isOrthographicCamera) this.cam = new OrthographicCamera(-80, 80, 80, -80, -2000, 4000);
      const c = this.cam; c.left = -W / 2; c.right = W / 2; c.top = H / 2; c.bottom = -H / 2; c.updateProjectionMatrix();
      c.position.set(0, Math.sin(elev) * 1000, Math.cos(elev) * 1000); c.lookAt(0, 0, 0);
      this.sin = Math.sin(elev); this.cos = Math.cos(elev); return this;
    }
    const key = [W, H, elev, fov, zoom].join();
    if (this.fitKey === key) return this;
    this.W = W; this.H = H; this.persp3 = true; this.sin = 1; this.cos = Math.cos(elev); this.fitKey = key;
    if (!this.cam.isPerspectiveCamera) this.cam = new PerspectiveCamera(fov, W / H, 1, 6000);
    const c = this.cam; c.clearViewOffset(); c.fov = fov; c.aspect = W / H; c.near = 1; c.far = 6000; c.updateProjectionMatrix();
    // fit: move the camera back/forward and slide its aim until the floor just fills the screen
    let D = Math.max(W, H) * 1.2, tz = 0; const v = new Vector3();
    for (let i = 0; i < 30; i++) {
      c.position.set(0, Math.sin(elev) * D, tz + Math.cos(elev) * D); c.lookAt(0, 0, tz); c.updateMatrixWorld();
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      for (const [x, z] of [[-W / 2, -H / 2], [W / 2, -H / 2], [-W / 2, H / 2], [W / 2, H / 2]]) { v.set(x, 0, z).project(c); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      const span = Math.max((x1 - x0) / 2, (y1 - y0) / 2) * zoom; D *= .5 + .5 * span; tz -= (y0 + y1) / 2 * H * .25;
    }
    return this;
  }
  /** Floor point (x, y) under screen point (sx, sy) of a perspective board view (identity otherwise). */
  pick(sx, sy) {
    if (!this.persp3) return [sx, sy];
    const c = this.cam; c.updateMatrixWorld();
    const a = new Vector3(sx / this.W * 2 - 1, 1 - sy / this.H * 2, -1).unproject(c), b = new Vector3(sx / this.W * 2 - 1, 1 - sy / this.H * 2, 1).unproject(c);
    const k = a.y / (a.y - b.y); return [a.x + (b.x - a.x) * k + this.W / 2, a.z + (b.z - a.z) * k + this.H / 2];
  }
  /** Position for floor point (x, y) of a board view, h units above the floor. */
  at(x, y, h = 0) { return [x - this.W / 2, h, (y - this.H / 2) / this.sin]; }
  /** Screen point of floor point (x, y) at height h (for 2D labels over 3D things). */
  over(x, y, h = 0) { return this.persp3 ? this.toScreen(...this.at(x, y, h)) : [x, y - h * this.cos]; }
  /**
   * Side-on view; fov in degrees (small = flatter). ex/ey move the eye left/right and up/down (game
   * units, ey > 0 = above centre) with a shifted lens, so you look down on (or along) the scene while
   * the z=0 plane still lines up exactly with the screen.
   */
  side(W, H, fov = 32, ex = 0, ey = 0) {
    this.mode = 'side'; this.W = W; this.H = H;
    if (!this.cam.isPerspectiveCamera) this.cam = new PerspectiveCamera(fov, W / H, 1, 6000);
    const c = this.cam, D = H / 2 / Math.tan(fov * Math.PI / 360);
    c.fov = 2 * Math.atan(1.5 * H / D) * 180 / Math.PI; c.aspect = W / H; c.near = 2; c.far = 6000;
    c.position.set(ex, ey, D); c.lookAt(ex, ey, 0); this.dist = D;
    c.setViewOffset(3 * W, 3 * H, W - ex, H + ey, W, H); c.updateProjectionMatrix(); return this;
  }
  /** Position for screen point (x, y) of a side view at depth z (negative = behind). */
  sv(x, y, z = 0) { return [x - this.W / 2, this.H / 2 - y, z]; }
  /** Free perspective camera. Move v.cam yourself. */
  persp(W, H, fov = 60, near = .1, far = 400) {
    this.mode = 'persp'; this.W = W; this.H = H;
    if (!this.cam.isPerspectiveCamera) this.cam = new PerspectiveCamera(fov, W / H, near, far);
    const c = this.cam; c.clearViewOffset(); c.fov = fov; c.aspect = W / H; c.near = near; c.far = far; c.updateProjectionMatrix(); return this;
  }
  /** Logical screen position of a world point (for 2D effects over 3D things). */
  toScreen(x, y, z) { const p = new Vector3(x, y, z).project(this.cam); return [(p.x + 1) / 2 * this.W, (1 - p.y) / 2 * this.H, p.z]; }

  /** Register a prefab: make() returns an Object3D. Then v.put(kind, ...) draws copies of it. */
  def(kind, make) { this.kinds.set(kind, make); return this; }
  /** Start a frame: every pooled object is hidden until put() again. */
  frame() { for (const p of this.pools.values()) p.n = 0; return this; }
  /**
   * Place one copy of a prefab this frame at world position p ([x,y,z], e.g. from v.at or v.sv).
   * o: ry/rx/rz rotation, s or sx/sy/sz scale. Returns the object to tweak (it keeps its children).
   */
  put(kind, p, o) {
    let pool = this.pools.get(kind); if (!pool) { pool = { list: [], n: 0 }; this.pools.set(kind, pool); }
    let ob = pool.list[pool.n];
    if (!ob) {
      const mk = this.kinds.get(kind); ob = mk ? mk(kind) : part(G.box, '#ff00ff'); noInk(ob);
      // a bare mesh keeps its own size/offset; put() moves and scales a wrapper around it
      if (!ob.isGroup) { const g = new Group(); g.add(ob); g.userData = ob.userData; ob = g; }
      // its blob() disc: the thing's own shadow takes its place; a disc put on its own (a marker under
      // something in the air) stays until something stands on it (render)
      const sp = shadowParts(ob); pool.casts = sp.casts;
      if (sp.casts) this.blobs.push(...sp.blobs); else if (sp.blobs.length) { pool.blob = sp.blobs[0]; }
      pool.list.push(ob); this.scene.add(ob);
    }
    pool.n++; ob.visible = true; ob.position.set(p[0], p[1], p[2]);
    if (o) { ob.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0); const s = o.s ?? 1; ob.scale.set(o.sx ?? s, o.sy ?? s, o.sz ?? s); }
    else { ob.rotation.set(0, 0, 0); ob.scale.set(1, 1, 1); }
    return ob;
  }
  /**
   * A flat see-through polygon lying on the floor of a board view (torch cones, zones, ripples).
   * pts = [[x, y], ...] in game units, filled as a fan from pts[0]. Up to 64 points.
   */
  fan(pts, col, a = .4, h = .3) {
    if (!this.kinds.has('__fan')) this.def('__fan', () => {
      const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(64 * 9), 3));
      const m = new Mesh(g, retro(new MeshBasicMaterial({ transparent: true, depthWrite: false, side: DoubleSide }))); m.frustumCulled = false; m.renderOrder = 1; m.layers.set(1); return m;
    });
    const m = this.put('__fan', [0, 0, 0]).children[0], arr = m.geometry.attributes.position.array, n = Math.min(pts.length, 64);
    const P = i => this.at(pts[i][0], pts[i][1], h);
    let k = 0; const o = P(0);
    for (let i = 1; i < n - 1; i++) { const b = P(i), c = P(i + 1); arr.set(o, k); arr.set(b, k + 3); arr.set(c, k + 6); k += 9; }
    m.geometry.setDrawRange(0, k / 3); m.geometry.attributes.position.needsUpdate = true;
    m.material.color.set(col); m.material.opacity = a; return m;
  }
  /** Add a permanent object (floors, walls, scenery). */
  add(...obs) { for (const o of obs) { noInk(o); const sp = shadowParts(o); if (sp.casts) this.added.push(...sp.blobs); this.scene.add(o); } return obs[0]; }
  /** Remove everything added with add() (for a level rebuild), keeping pools and lights. */
  clear() {
    const keep = new Set([this.sun, this.sun.target, this.hemi, this.catcher]); for (const p of this.pools.values()) for (const o of p.list) keep.add(o);
    for (const o of [...this.scene.children]) if (!keep.has(o)) this.scene.remove(o);
    this.added.length = 0;
  }
  // Before each frame is drawn: who casts and takes shadows, blob discs out of the way of real shadows.
  // Returns '' if everything in the view can draw on WebGPU.
  prep(fx) {   // fx: toon3d-gpu.js when the frame could be drawn on WebGPU
    const on = this.shadowsOn = this.shadows !== false && (TOON.shadows ?? phoneClass() !== 'low');
    let why = '';
    // a material's WebGPU side (the cel lighting, corners that snap) is put on the first time it is seen, before that renderer first draws it
    const fit = m => { if (!gpuFits(m)) why ||= `a material with its own shader (${m.type})`; else if (!onGpu.has(m)) { onGpu.add(m); fx.dress?.(m); } };
    this.scene.traverse(o => {
      if (o.userData.gsNoInk) o.layers.set(1);   // (gs.fx3d's text and particles are added straight to the scene: no ink lines round letters and sparks)
      const m = o.material; if (!m) return;
      if (o.isMesh && !dressed.has(o)) shadowFlags(o);
      if (fx) { if (Array.isArray(m)) m.forEach(fit); else fit(m); }
    });
    this.sun.castShadow = on;
    for (const b of this.blobs) b.visible = !on;
    for (const b of this.added) b.visible = !on;
    this.catcher.visible = on && this.mode === 'board' && this.floor !== false;
    // a blob disc put on its own shows where something in the air is over; with a thing standing on it, that thing's own shadow is enough
    if (on) for (const p of this.pools.values()) if (p.blob) for (let i = 0; i < p.n; i++) if (this.stoodOn(p.list[i], p.list[i].scale.x * p.blob.scale.x)) p.list[i].visible = false;
    return why;
  }
  stoodOn(b, r) {
    const bx = b.position.x, by = b.position.y, bz = b.position.z, rr = r * r * .64;
    for (const p of this.pools.values()) {
      if (!p.casts) continue;
      for (let i = 0; i < p.n; i++) {
        const o = p.list[i].position, dx = o.x - bx, dz = o.z - bz, dy = o.y - by;
        if (dx * dx + dz * dz < rr && dy > -r * .6 && dy < r * .6) return true;
      }
    }
    return false;
  }
  /** Render this frame into the 2D canvas context c (which uses the game's logical units). */
  render(c, w = this.W, h = this.H) {
    for (const p of this.pools.values()) for (let i = p.n; i < p.list.length; i++) p.list[i].visible = false;
    // WebGPU where the device has it and everything in the view has a WebGPU version (a view with something
    // that has none stays on WebGL from then on)
    let G = this.noGpu ? null : consoleGPU();
    // (the graphics chip was lost and a new one is on its way, gpu.js: a view that drew on it waits for it, under the app's cover)
    if (!G && this.onGpu && gpuMending()) return;
    const why = this.prep(G?.fx);
    if (G && why) { G = null; this.noGpu = true; this.gpuWhy = why; }
    this.onGpu = !!G; TOON.backend = G ? 'webgpu' : 'webgl'; TOON.why = G ? '' : this.gpuWhy || '';
    // each renderer has a shadow of its own (a shadow's map belongs to the renderer that made it), fitted to this frame
    const on = G ? 'gpu' : 'gl', sun = this.sun;
    let sh = this.shades[on];
    if (!sh) { const first = !this.shades.gl && !this.shades.gpu; sh = this.shades[on] = first ? sun.shadow : sun.shadow.clone(); if (!first) shadowSetup(this, sh); }
    if (sun.shadow !== sh) sun.shadow = sh;
    if (this.shadowsOn) {
      fitSun(this);
      const ct = this.catcher; if (ct.visible) { ct.scale.set(this.fit.r * 6, 1, this.fit.r * 6); ct.material.opacity = floorShade(this); }
    }
    const r = G ? G.r : renderer();
    if (!r) { c.fillStyle = '#' + this.scene.background.getHexString(); c.fillRect(0, 0, w, h); return; }
    // adaptive resolution: if frames come slower than ~45 fps, render fewer pixels (down to half size)
    const now = performance.now(), gap = now - (this.lastT || now); this.lastT = now;
    if (gap > 0 && gap < 200) { avgGap = avgGap * .95 + gap * .05; if (++tick % 30 === 0) quality = Math.max(.5, Math.min(1, quality * (avgGap > 22 ? .88 : avgGap < 18 ? 1.05 : 1))); }
    let pw = c.canvas.width, ph = c.canvas.height; const look = this.retro;
    // (a retro look sets its own small size: so many lines up the picture)
    const q = look && look.lines < ph ? look.lines / ph : Math.min(1, Math.sqrt(MAX_PX / (pw * ph))) * quality; pw = Math.max(1, Math.round(pw * q)); ph = Math.max(1, Math.round(ph * q));
    CEL.gsRetro.value.set(look?.snap ? pw / 2 : 0, look?.snap ? ph / 2 : 0, look?.bits ? (1 << look.bits) - 1 : 0, 0);
    const cam = this.cam; cam.layers.enableAll();
    const fog = this.scene.fog, k = Math.max(1, Math.round(.75 * ph / h));
    inkU.px.value.set(k / pw, k / ph);
    inkU.persp.value = cam.isPerspectiveCamera ? 1 : 0; inkU.near.value = cam.near; inkU.far.value = cam.far;
    // ortho: depth tolerance in world units ~ a few pixels' worth; persp: relative
    inkU.dTol.value = cam.isPerspectiveCamera ? 1 : Math.max(1.5, 6 * (cam.top - cam.bottom) / ph * k);
    if (fog) inkU.fade.value.set(fog.near, fog.far); else inkU.fade.value.set(1e9, 2e9);
    // the rim: on the side that faces the sun, as the screen sees it
    _fwd.copy(this.sun.position).sub(this.sun.target.position).transformDirection(cam.matrixWorldInverse);
    const sl = Math.hypot(_fwd.x, _fwd.y); if (sl > .05) inkU.rim.value.set(_fwd.x / sl, _fwd.y / sl, 0); else inkU.rim.value.set(-.7, .7, 0);
    inkU.rim.value.z = Math.max(0, Math.min(1, +this.rim || 0)); inkU.rimCol.value.copy(this.sun.color).convertLinearToSRGB();
    // (a retro look's few shades: the background's colour is one of them too)
    const bg0 = this.scene.background, cut = !!(look?.bits && bg0?.isColor);
    if (cut) { const n = (1 << look.bits) - 1; QBG.copy(bg0).convertLinearToSRGB(); this.scene.background = QBG.setRGB(Math.round(QBG.r * n) / n, Math.round(QBG.g * n) / n, Math.round(QBG.b * n) / n, SRGBColorSpace); }
    if (G) {
      G.fx.draw(G.r, this, pw, ph, { ink: inkU, cel: CEL });
    } else {
      const cv = r.domElement; if (cv.width !== pw || cv.height !== ph) r.setSize(pw, ph, false);
      r.setRenderTarget(null); r.render(this.scene, cam);
      if (this.ink !== false) {
        // normals + depth pass at the same size, then the ink pass on top
        inkSetup();
        if (!normRT || normRT.width !== pw || normRT.height !== ph) {
          normRT?.dispose(); normRT = new WebGLRenderTarget(pw, ph, { depthTexture: new DepthTexture(pw, ph) });
          normRT.depthTexture.type = UnsignedIntType;
        }
        const bg = this.scene.background; this.scene.background = null; this.scene.fog = null; this.scene.overrideMaterial = normMat;
        r.shadowMap.autoUpdate = false;   // (the shadow map is this frame's already)
        cam.layers.set(0); r.setRenderTarget(normRT); r.setClearColor(0x8080ff, 1); r.clear(); r.render(this.scene, cam);
        r.shadowMap.autoUpdate = true;
        this.scene.background = bg; this.scene.fog = fog; this.scene.overrideMaterial = null; cam.layers.enableAll(); r.setRenderTarget(null);
        inkU.tN.value = normRT.texture; inkU.tD.value = normRT.depthTexture;
        r.autoClear = false; r.render(inkQuad, inkCam); r.autoClear = true;
      }
    }
    if (cut) this.scene.background = bg0;
    c.save(); c.imageSmoothingEnabled = !look || look.smooth; copyFrame(r, c, 0, 0, pw, ph, 0, 0, w, h); c.restore();
    if (look?.scan) scanlines(c, w, h, ph, look.scan);
  }
}

// Which materials have a WebGPU version: three's own, and the kit's looks that toon3d-gpu.js has twins for.
const PORTED = new Set(['cel', 'retro']);
function gpuFits(m) {
  if (m.isNodeMaterial) return true;
  if (m.isShaderMaterial || m.isRawShaderMaterial) return false;
  if (Object.hasOwn(m, 'onBeforeCompile')) { const l = looksOf(m); return l.length > 0 && l.every(n => PORTED.has(n)); }
  return true;
}

/* ---------- common prefabs ---------- */
/** Soft round contact shadow lying on the floor (put it at the object's feet). */
export function blob(r = 1, a = .32) { const m = new Mesh(G.disc, flat('#000000', a)); m.userData.gsBlob = true; m.layers.set(1); m.scale.set(r, 1, r); m.position.y = .25; m.renderOrder = -1; return grp(m); }
/** A simple cel-shaded character: body pill, head ball, eyes. Returns a group with .body/.head. */
export function dude({ body = '#3060c0', skin = '#f8c890', hat = null, h = 10, eyes = '#14101c' } = {}) {
  const g = new Group(), b = part(G.pill, body, { sx: h * .55, sy: h * .45, sz: h * .45, y: h * .4 });
  const hd = part(G.ball, skin, { s: h * .26, y: h * .92 });
  for (const sx of [-1, 1]) hd.add(part(G.ball, eyes, { s: .2, x: sx * .38, y: .1, z: .88, line: false }));
  if (hat) hd.add(part(G.ball, hat, { sx: 1.08, sy: .55, sz: 1.08, y: .45 }));
  g.add(b, hd); g.body = b; g.head = hd; return g;
}
// capsules for the figure's limbs, one of each size for every figure
const caps = new Map(), cap = (r, l) => { const k = r + '|' + l; let g = caps.get(k); if (!g) caps.set(k, g = new CapsuleGeometry(r, l, 4, 10)); return g; };
/**
 * A jointed cel-shaded person with the gs.poses joints: h units tall, feet at y = 0, facing +z, built
 * chunky (a big head, thick limbs, fists) so the ink lines leave its colours showing. Best 24 units tall
 * or more. Returns a group with .rig (gs.poses Rig): rig.play('walk'), rig.upper('wave'),
 * rig.update(dt, { speed, aim }) each frame. Colours: body, skin, legs, shoes, hair (null for none),
 * eyes (null for none). Each copy a view draws has a rig of its own: v.put('hero', p).rig.
 */
export function figure({ h = 30, body = '#3a6ea5', skin = '#f1c27d', legs = '#2b2b38', shoes = '#1a1a1a', hair = '#3b2a1a', eyes = '#14101c' } = {}) {
  const joint = (x, y, z, ...kids) => { const g = new Group(); g.position.set(x, y, z); for (const k of kids) g.add(k); return g; };
  const limb = (r, l, col, y) => part(cap(r, l), col, { y });
  const shin = () => joint(0, -.42, 0, limb(.085, .2, legs, -.19), part(G.box, shoes, { sx: .17, sy: .1, sz: .3, y: -.44, z: .06 }));
  const leg = side => { const s = shin(), g = joint(side * .11, 0, 0, limb(.095, .2, legs, -.2), s); g.userData.shin = s; return g; };
  const fore = () => joint(0, -.3, 0, limb(.07, .14, skin, -.13), part(G.ball, skin, { s: .095, y: -.3 }));
  const arm = side => { const f = fore(), g = joint(side * .29, .32, 0, limb(.075, .16, body, -.15), f); g.userData.fore = f; return g; };
  const head = joint(0, .42, 0, part(G.ball, skin, { s: .2, y: .2 }));
  if (hair) head.add(part(G.ball, hair, { sx: .212, sy: .14, sz: .212, y: .29, z: -.015 }));
  if (eyes) for (const sx of [-1, 1]) head.add(part(G.ball, eyes, { s: .032, x: sx * .078, y: .215, z: .182, line: false }));
  const armL = arm(1), armR = arm(-1), legL = leg(1), legR = leg(-1);
  const spine = joint(0, .05, 0, part(G.box, body, { sx: .44, sy: .46, sz: .26, y: .24 }), head, armL, armR);
  const hips = joint(0, .91, 0, part(G.box, legs, { sx: .34, sy: .2, sz: .24, y: -.02 }), spine, legL, legR);
  // (put() sets the size of the thing it places, so the figure's own size sits one group down)
  const f = new Group(); f.add(hips); f.scale.setScalar(h / 1.8);
  const g = new Group(); g.add(f);
  g.rig = new Rig({ hips, spine, head, armL, foreL: armL.userData.fore, armR, foreR: armR.userData.fore, legL, shinL: legL.userData.shin, legR, shinR: legR.userData.shin }, { height: 1.8 });
  return g;
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(View.prototype, 'render', '3D render');
