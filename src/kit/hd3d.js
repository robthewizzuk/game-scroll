// Next Gen 3D kit: modern HD rendering for era:'nextgen' games (see docs/nextgen-3d.md).
//
// Where the Classic Console kit (toon3d.js) is flat cel shading with ink lines, this one is the
// current-generation look: physically based materials (roughness, metalness, normal maps),
// image-based reflections, real-time shadows, HDR lighting with bloom, ambient occlusion,
// MSAA, filmic tone mapping and a colour grade (vignette, grain, lens fringing), plus a GPU
// particle system for sparks, smoke and embers.
//
// One shared WebGL renderer and one post-processing chain draw every Next Gen game (phones only
// allow a few WebGL contexts). A game owns an HDView: a three.js scene + perspective camera. In
// draw(c) it moves things, then calls v.render(c, W, H), which renders the 3D frame into the
// slide's 2D canvas; the game then draws its 2D HUD on top.
//
// Performance: the kit watches frame times and adapts. It first lowers the render resolution
// (down to 55%), then drops a quality tier (ultra: full-size AO + MSAA + reflections -> high:
// half-size AO + MSAA -> medium -> low: no shadows, no AO). Tiers are listed in TIERS below. The starting tier and frame rate come
// from the phone's class (src/kit/speed.js: a top phone starts on ultra at 120 fps), and where a game
// settled is remembered for its next round.
//
// Speed tricks that keep the picture the same:
//  - the 3D canvas is shown directly on the playing card, under the card's 2D canvas (which keeps
//    the HUD), instead of being copied into it every frame. When the 3D canvas moves to another
//    card, the last frame is baked into the old card so it keeps its picture.
//  - bloom, tone mapping and the colour grade run as one final full-screen pass, and the bloom is a
//    small down/up-sampling chain at half resolution and below.
//  - shadow maps are only redrawn when something that casts a shadow (or a light) has moved.
import { timed, PROF, enter, leave, mark } from './prof.js';
import {
  Scene, Color, FogExp2, PerspectiveCamera, HemisphereLight, PointLight, SpotLight, DirectionalLight,
  MeshStandardMaterial, MeshPhysicalMaterial, ShaderMaterial, BufferGeometry, BufferAttribute, Points, AdditiveBlending, NormalBlending,
  CanvasTexture, RepeatWrapping, SRGBColorSpace, NoColorSpace, PCFShadowMap, ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, HalfFloatType,
  WebGLRenderTarget, Vector2, Vector3, PMREMGenerator, LinearMipmapLinearFilter, Mesh, BoxGeometry, LinearFilter, AdditiveBlending as ADD,
  OrthographicCamera, PlaneGeometry, MeshBasicMaterial, MeshDepthMaterial, Group, Vector4, DataTexture, RGBAFormat, ShaderChunk,
  LightProbe, CubeCamera, WebGLCubeRenderTarget, Euler, Matrix4, Quaternion, DepthTexture, WebGLCoordinateSystem, Box3, Sphere, UnsignedIntType,
  Data3DTexture, UnsignedByteType, RectAreaLight, DoubleSide, Raycaster, Object3D, Box2, CylinderGeometry, Frustum,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LUTCubeLoader } from 'three/examples/jsm/loaders/LUTCubeLoader.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { LightProbeGenerator } from 'three/examples/jsm/lights/LightProbeGenerator.js';
import { LightProbeGridWebGL } from 'three/examples/jsm/lighting/LightProbeGridWebGL.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SGSR } from './sgsr.js';
import { SGSR2, SgsrFrame } from './sgsr2.js';
import { netFor } from './gssr-net.js';
import { lookPatch, looksOf, lookSpec } from './looks.js';
import { loading, later, after, pause, built } from './slices.js';
import { surfaceMath, roughMipsMath } from './surface-math.js';
import { run as runJob, canRun as canRunJob } from './jobs.js';
import { copyFrame, webgpu, setGpuPick, prepareGPU, gpuMending, onGpuLoss, loseGPU, gpuLosses } from './gpu.js';
import { packing } from './pack.js';
import { steerFor } from './steering.js';
import { SLIM, isSlim, meshBytes, SKIN_POOLED } from './slim.js';
import { makeRenderer } from './renderer.js';
import { LensDrops, DROPS_HEAD, DROPS_GLSL, DROPS_N } from './lens-drops.js';
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';
import { Occlusion } from './occlusion.js';
import { ShadowTiles, TILES } from './shadow-tiles.js';
import { LampPool } from './lamps.js';
import { binCapsules } from './sunmask.js';
import { OCC_BIT, occludeFrame, hideNow, showAll, copiesHidden, occlusionNow, depthBack, occludeDrop, DepthMeter } from './occlude.js';
import { DetailMesh, DETAIL, clustersFor, clustersNow, canCluster, partsOf, cutTwin, cutUpdate, headsOf, drawnOf, levelsFor, levelGeometry, frame as detailFrame, tick as detailTick, stats as detailStats, drawnTris } from './detail.js';
import { own } from './cleanup.js';
import { reliefOf, reliefNews, noteHeight } from './relief.js';
import { eachThing, eachShown, thingsOf } from './scene-list.js';
import { stillFrame, stillOff, stillStats } from './still.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { power } from './power.js';
import { lensFrame, afTake, AF_LOG } from './lens.js';
import { FADE, FADING, fadeStep, fadeAheadList, glTwins, hookGL, twinList, fadingCount } from './lod-fade.js';
import { ORIGIN, ORIGIN_U, ORIGIN_SET, ORIGIN_GLSL, follow as originFollow } from './origin.js';
import { memory } from './memory.js';
import { getready, waitsOn } from './getready.js';
import { speed, phoneClass, fpsFor, stepDown, stepUp, settle, settledFor, frameGenFor, frameGenFailed, frameGenReady, frameGenPace, frameGenPaceOf, frameGenCould, frameGenSteps, screenHz, qualityVerdict, chipCost } from './speed.js';
import { desktop } from '../desktop.js';

export * as THREE from 'three';

const rbs = new Map();
/** A bevelled box w x h x d with corner radius r (cached): real highlights on every edge. */
export function rbox(w, h, d, r = Math.min(w, h, d) * .2) {
  const k = [w, h, d, r].join();
  // (a level's worth of new sizes adds up: while a card loads they are made a few a frame, slices.js)
  if (!rbs.has(k)) { pause('Models'); rbs.set(k, new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) * .999)); built(); }
  return rbs.get(k);
}

/* ---------- quality tiers ---------- */
// px: most pixels rendered per frame before scaling up; shadow: shadow map size (0 = off);
// lights: how many nearby lamps get a real light (the rest just glow); ssr: screen-space reflections on
// the surfaces a game marks with v.reflect(); contact: soft contact shadows size; ao: screen-space ambient
// occlusion, worked out at this fraction of the picture's size (0 = off; half size costs a quarter); msaa: multisample count (0 = a cheap edge smoothing in the final pass instead);
// bloom: bloom resolution scale. 2x MSAA (not 4x) costs phone GPUs far less memory traffic, and the
// time saved goes into more pixels.
export const TIERS = [
  { name: 'low', px: .5e6, shadow: 0, lights: 2, ao: 0, msaa: 0, bloom: .5, ssr: false, contact: 0, relief: 0 },
  { name: 'medium', px: .85e6, shadow: 512, lights: 3, ao: 0, msaa: 0, bloom: .5, ssr: false, contact: 128, relief: 60000 },
  { name: 'high', px: 1.3e6, shadow: 1024, lights: 4, ao: .5, msaa: 2, bloom: .5, ssr: false, contact: 256, relief: 150000 },
  { name: 'ultra', px: 2e6, shadow: 1024, lights: 4, ao: 1, msaa: 2, bloom: .5, ssr: true, contact: 256, relief: 300000 },
];
// (relief: the triangles real surface detail may draw a frame, 0 = its meshes draw flat: see HD.reliefPx)
// Where a phone starts: top phones (Fold 8, recent iPhone Pro) on high, others on high or medium.
// Play never climbs above high on a phone (Rob, 2026-11-10: the Fold got hot and throttled in every 3D game on
// ultra, and then stuttered). Ultra stays for HD.force (tests, screenshots, the frame lab's A/B).
// A computer (the Mac and Windows app, src/desktop.js) starts where a phone of its class does and draws a tier's
// pixels as a phone does; it doesn't heat up in a hand, so it may climb to ultra, but only when the chip's own
// times show room (mayClimb): on a 60 Hz screen frames that keep up say nothing about how much more the chip could
// take. A tier above the start saved by a game (settle) is only taken up again when it was climbed to that way
// (startTier). (It used to start a 'top' computer on ultra with half as many pixels again in each tier: Rob's
// MacBook Air M5, 2026-11-13, played Long Shadow at 47 fps with 537 stutters a minute where the Fold 8 keeps 60;
// with that fixed it still started on ultra, as the game had settled there the run before, 2026-11-14.)
const START = { top: 2, mid: 2, low: 1 };
const CAP = desktop ? 3 : 2;
/**
 * The tier a game starts on (pure: tests). saved: where it settled last time (speed.js settledFor), cls: the
 * phone's class, computer: the Mac and Windows app. A computer's saved tier above its class's start only counts
 * with room: true (climbed to while the chip's own times showed room); else it starts at the class's start.
 */
export function startTier(saved, cls, computer) {
  const start = START[cls] ?? 2, t = Math.min(computer ? 3 : 2, saved?.tier ?? start);
  return computer && t > start && !saved?.room ? start : t;
}
/** May a game climb from this tier (pure: tests)? A phone may (up to CAP); a computer above its class's start only with room (the chip's times say so). */
export const mayClimb = (tier, cls, computer, room) => !computer || tier < (START[cls] ?? 2) || !!room;
// While the phone is warm or hot (src/kit/power.js), and for a minute after it cools, games draw one tier
// lower (from the next round: a tier change rebuilds shaders) and at most the first resolution step (now).
// The same while the phone is short of memory (src/kit/memory.js: low or critical), as a lower tier and
// a smaller picture keep fewer and smaller render targets; critical also takes the second resolution step.
const HOT_HOLD = 60000;
let hotAt = -1e9;
function hot(now = performance.now()) { if (power.heat >= 1 || memory.level >= 2) hotAt = now; return now - hotAt < HOT_HOLD; }
// Resolution moves in a few fixed steps (each step reallocates the render targets, so it must be
// rare): drop a step after two slow windows of ~45 frames, climb back after ~6 s at full speed, and
// never climb back above a step that already proved too slow (for 30 s, longer each time a climb fails).
// A game starts at the tier and step it settled on last time. Tiers change the same way, but only
// between rounds (applyTier).
// The frame budget follows the game's frame rate (8.3 ms at 120 fps, 16.7 at 60, 33 at 30). At 120
// fps a struggling game first gives up a little resolution, then drops to 60 fps at full resolution
// (keeping the picture); at the lowest tier and resolution it can drop to 30.
const LEVELS = [1, .85, .7, .55];
// Most pixels in the final picture once a game has stepped down (about a phone screen's worth; see draw()). On a
// computer, from the first frame: a Retina window is three to six times a phone screen's pixels, and the effects
// after the upscaler (bloom, motion blur, the finish) cost by the final picture's size, whatever the 3D's own is.
const OUT_PX = 2.4e6;
// A climb that turns out too slow again soon after doubles how long the step it fell back to holds
// (30 s, 1, 2, 4 min), so a game that's on the edge doesn't keep stuttering every half a minute.
const HOLD = 30000, HOLD_MAX = 240000;
const Q = { gsum: 0, gcnt: 0, tier: 2, lvl: 0, sum: 0, cnt: 0, late: 0, slow: 0, fast: 0, lastT: 0, ceil: 0, ceilT: 0, tierCeil: 3, capNow: CAP, force: null, game: undefined, easy: 0, fpsT: 0, hold: HOLD, upT: -1e9, fpsHold: 60000, fpsUpT: -1e9, fx: {}, fxLast: [], room: false, wantRoom: false };
// Effects that step down by their own cost (Rob's pick 3 of 2026-11-13). Before a slow game gives up
// resolution, the effect that costs the chip most (by the GPU's own time for each pass, HD.info.gpuParts)
// is drawn smaller: each has sizes (FXS), and only the size of its pictures changes, so no shader is built
// again mid-round. One is stepped only while it takes a real share of the chip's frame (FX_SHARE, and at
// least FX_MS). Where the chip doesn't say (WebGL, phones without timestamps) each effect in use gives one
// step, in FX_ORDER, before the resolution does. Climbing back is the other way round: once the resolution
// is full again, the last effect stepped down comes back first. Where a game settles is kept with its tier
// and resolution.
const FXS = { ao: [1, .7, .5], bloom: [1, .7, .5], reflections: [1, .7, .5], 'volumetric light': [1, .7, .5], 'light shafts': [1, .7, .5], 'sun mask': [1, .7, .5] };
const FX_ORDER = ['light shafts', 'sun mask', 'volumetric light', 'bloom', 'reflections', 'ao'];   // (without the chip's times: what shows least first)
const FX_SHARE = .12, FX_MS = .5;
let fxOn = new Set();   // the effects the last frame drew (the frame sets it)
/** This effect's size now (1: as the tier has it). */
const fxK = name => Q.force != null && !Q.fxPin ? 1 : FXS[name][Q.fx[name] | 0] ?? 1;
/**
 * Which effect to draw smaller next, or null (pure: tests). on: the effects the last frame drew (a Set);
 * steps: { name: steps taken }; g: the chip's ms a frame (null where it doesn't say); parts: HD.info.gpuParts.
 */
export function pickEffect(on, steps, g, parts) {
  let best = null, most = 0;
  if (g != null && parts) {
    for (const k of on) { const ms = parts[k] || 0; if (FXS[k] && (steps[k] | 0) < FXS[k].length - 1 && ms >= Math.max(FX_MS, g * FX_SHARE) && ms > most) { best = k; most = ms; } }
  } else for (const k of FX_ORDER) if (on.has(k) && !(steps[k] > 0)) { best = k; break; }
  return best;
}
/** The slow verdict, GPU-bound: step down the effect that costs most (g: the chip's ms a frame, or null). False if none fits. */
function fxDown(g) {
  const best = pickEffect(fxOn, Q.fx, g, HD.info.gpuParts);
  if (!best) return false;
  Q.fx[best] = (Q.fx[best] | 0) + 1; Q.fxLast.push(best); return true;
}
function fxUp() { const k = Q.fxLast.pop(); if (!k) return false; Q.fx[k] = Math.max(0, (Q.fx[k] | 0) - 1); if (!Q.fx[k]) delete Q.fx[k]; return true; }
const fxSaved = () => Object.keys(Q.fx).length ? { ...Q.fx } : null;
// a new game is on screen: start from where it settled last time, or from the phone's class
// (and the resolution step it settled on, so a round doesn't start too sharp, stutter and step down again)
function startGame(def) {
  Q.game = def; let s = settledFor(def?.id);
  Q.tier = startTier(s, phoneClass(), desktop); Q.room = !!s?.room;
  if (s?.tier != null && Q.tier < Math.min(CAP, s.tier)) s = null;   // (a saved tier not taken up: its resolution and effects were for that tier)
  Q.lvl = Math.min(LEVELS.length - 1, s?.lvl ?? 0); Q.ceil = Q.lvl; Q.ceilT = performance.now(); Q.tierCeil = 3;
  Q.sum = Q.cnt = Q.late = Q.slow = Q.fast = Q.easy = Q.gsum = Q.gcnt = 0; Q.lastT = 0; Q.want = null; Q.hold = HOLD; Q.upT = -1e9; Q.fpsHold = 60000;
  Q.fx = {}; Q.fxLast = []; Q.fxPin = false;
  for (const k of FX_ORDER) { const n = Math.min(FXS[k].length - 1, s?.fx?.[k] | 0); if (n > 0) { Q.fx[k] = n; for (let i = 0; i < n; i++) Q.fxLast.push(k); } }
}
// WebGPU timestamps: three times every pass on the GPU, the picture's and the compute passes' (frame
// generation, GPU particles, culling), and a read brings back all of them since the last read. Its own
// answer is only the last refresh's draw passes (a refresh that showed a made frame has next to nothing
// in it, and with two or three frames between reads the rest were dropped), so the passes are added up
// here, both kinds, and divided by the frames drawn since: the GPU's time for a real frame and whatever
// was made after it. (One read at a time: the answer comes back a frame or two later.)
// HD.info.gpuParts says where that time went, by what each pass is for: { scene (the game's things), shadows (the
// shadow maps), ao, bloom, reflections, 'volumetric light', 'light shafts', 'sun mask' (finer sun shadows), 'bounce light', 'depth of field',
// 'motion blur', 'screen effects' (gs.fx3d's), finish (under an upscaler: the small picture finished, with the
// ambient occlusion and bloom laid on, graded and tone mapped), upscale (SGSR's own passes), effects (the other passes
// drawn into pictures of their own), show (the last pass, onto the screen), compute, fg (frame generation's, or with its parts on
// (HD.fgParts: the phone test tour) 'fg:moving', 'fg:motion', 'fg:picture', 'fg:holes', 'fg:keep') }, in
// milliseconds a frame. three tells its inspector as each pass begins (the name its time comes back under,
// what is drawn and into which picture, the compute list sent), and partOf() files it.
// Frame generation's share is split out: HD.info.gpuReal (a real frame's own), HD.info.fgGpu (the frames made
// after it) and HD.info.madeMs (each made frame's, the pair's own work shared among them). A real frame's time
// counts only from frames the chip was kept busy for (drawn every refresh, or with frames made between): a phone
// clocks its chip down at half rate (a real frame took 11.8 ms at 60 against 6.2 at 120 on the Fold, 2026-11-13),
// and frame generation's checks need the time it takes once it is busy again (speed.cost).
// The chip can't take longer over its frames than the frames take to come: a chip whose times say it does is
// timing something else. Apple's (the Mac app, Rob's MacBook Air M5, 2026-11-13) take each pass's start and end at
// stage boundaries, so a chain of passes overlap (the next one's vertices start while the last is still drawing)
// and added up they came to 225 ms a frame, bloom's chain of small passes 66 ms of it, while the frames came every
// 16.7 ms. Each read is checked against the time its frames took; after BAD of the last 10 reads don't fit, the
// chip's times are left alone for the rest of the session (HD.info.gpuOff: null, as on WebGL, and the quality
// steps, the effects' sizes and the gas go by frame times). Twice the frames' time (and 2 ms) is let by, and reads
// with made frames in them aren't judged: a software chip (the tests' SwiftShader) works on several threads, so
// its times run past its frames now and then (up to 3.7x, 2026-11-13) and well past them while it makes frames.
export const chipFits = (gpuMs, wallMs) => !(gpuMs > wallMs * 2 + 2);
const BAD = 6;
const GT = { n: 0, busy: false, full: true, at: 0, fits: [] }, PARTS = new Map();
function partOf(o, rt) {
  if (rt?.gsPart) return rt.gsPart;   // (a picture marked by who made it: the bloom's, the upscaler's)
  if (o?.isScene) return o.name.startsWith('Shadow Map') ? 'shadows' : 'scene';   // (three names the scene so while it draws a shadow map)
  const n = o?.material?.name || '';
  return n === 'GTAO' ? 'ao' : n === 'SGSR2 out' ? 'show' : n.startsWith('SGSR') ? 'upscale' : n === 'Shadow map copy' ? 'shadows' : n.startsWith('SSRNode') ? 'reflections' : n === 'SSGI' ? 'bounce light' : rt ? 'effects' : 'show';
}
function gpuParts(r) {
  const ins = r.inspector; if (!ins || ins.gsParts) return; ins.gsParts = true;
  const was = ins.beginRender, wasC = ins.beginCompute;
  ins.beginRender = function (uid, scene, camera, rt) { if (PARTS.size > 4096) PARTS.clear(); PARTS.set(uid, partOf(scene, rt)); return was?.call(this, uid, scene, camera, rt); };
  ins.beginCompute = function (uid, nodes) { if (PARTS.size > 4096) PARTS.clear(); PARTS.set(uid, nodes?.gsPart || 'compute'); return wasC?.call(this, uid, nodes); };
}
// The code's time in three's own renders, by part (prof.js, while the frame lab or the test scenes report is on): each
// render three starts is a span, the scene's, a shadow map's or a pass's, of its own time without the renders it starts
// (a scene's shadow maps are drawn from inside it), and so is each compute list sent. (Rob's Fold, 2026-11-13: the
// square's 300 people of a skeleton each took 26 ms of the engine's code a frame, and nothing said where.)
const CODE = { scene: '3D: scene pass', shadows: '3D: shadow maps' }, OPEN = [];
function codeParts(r) {
  const ins = r.inspector; if (!ins || ins.gsCode) return; ins.gsCode = true;
  const b = ins.beginRender, f = ins.finishRender, bc = ins.beginCompute, fc = ins.finishCompute;
  // (the depth to close back to is kept for each render, so PROF turned on or off half way through one closes nothing else)
  const open = name => { if (OPEN.length > 64) OPEN.length = 0; OPEN.push(PROF.on ? mark() : -1); if (PROF.on) enter(name); }, shut = () => { const m = OPEN.pop(); if (m >= 0) leave(m); };
  ins.beginRender = function (uid, scene, camera, rt) { open(CODE[partOf(scene, rt)] || '3D: passes'); return b.call(this, uid, scene, camera, rt); };
  ins.finishRender = function (uid) { try { return f.call(this, uid); } finally { shut(); } };
  ins.beginCompute = function (uid, nodes) { open('3D: compute'); return bc.call(this, uid, nodes); };
  ins.finishCompute = function (uid) { try { return fc.call(this, uid); } finally { shut(); } };
}
// full: this real frame kept the chip busy (drawn every refresh, or with frames made after it)
function gpuTime(r, full = true) {
  codeParts(r);
  GT.n++; GT.full &&= full;
  const be = r.backend;
  if (!be?.trackTimestamp || HD.info.gpuOff) return;
  gpuParts(r);
  if (GT.busy) return;
  const n = GT.n, made = r.gsMade || 0, kept = GT.full, by = {}, now = performance.now(), wall = GT.at ? (now - GT.at) / n : 0;
  GT.n = 0; r.gsMade = 0; GT.full = true; GT.busy = true; GT.at = now;
  // (a read that brought nothing new leaves three's list as it was: its frames list is a new one after each real read)
  const read = type => {
    const pool = be.timestampQueryPool?.[type], was = pool?.frames;
    if (!pool) return 0;
    return r.resolveTimestampsAsync(type).then(() => {
      let s = 0;
      if (pool.frames !== was) for (const [uid, ms] of pool.timestamps) {
        const part = PARTS.get(uid) || (type === 'compute' ? 'compute' : 'effects'); PARTS.delete(uid);
        if (ms > 0 && ms < 1000) { s += ms; by[part] = (by[part] || 0) + ms; }
      }
      return s;
    });
  };
  Promise.all([read('render'), read('compute')]).then(([draw, comp]) => {
    if (!(draw > 0)) { GT.n += n; r.gsMade = (r.gsMade || 0) + made; GT.full &&= kept; GT.at = now - wall * n; return; }   // nothing read: those frames count towards the next read
    const f = (draw + comp) / n;
    if (!made && wall > 0 && wall < 250) {
      GT.fits.push(chipFits(f, wall)); if (GT.fits.length > 10) GT.fits.shift();
      if (GT.fits.filter(x => !x).length >= BAD) { chipOff(); return; }
    }
    HD.info.gpuMs = f; HD.info.gpuCompute = comp / n;
    let fg = 0; for (const k in by) if (k === 'fg' || k.startsWith('fg:')) fg += by[k];
    for (const k in by) by[k] /= n; HD.info.gpuParts = by;
    const real = f - fg / n; HD.info.gpuReal = real; HD.info.fgGpu = fg / n; HD.info.madeMs = made && fg > 0 ? fg / made : null;
    if (f < 100) { Q.gsum += f; Q.gcnt++; }
    // what frame generation's checks go by (speed.js frameGenFits, GpuChain.late): eased, for the game being played
    if (real > 0 && real < 100) chipCost(speed.game?.id, kept ? real : null, made && fg > 0 ? fg / made : null);
  }, () => {}).finally(() => { GT.busy = false; });
}
function chipOff() {
  const I = HD.info; I.gpuOff = true; I.gpuMs = I.gpuParts = I.gpuReal = I.fgGpu = I.madeMs = null; I.gpuCompute = 0; Q.gsum = Q.gcnt = 0;
  console.warn('3D: the graphics chip\'s own times don\'t fit its frames here; the quality steps go by frame times');
}
// a game making frames between could draw every refresh instead: its real frames take under .8 of a refresh (unknown: try)
const roomUp = () => !frameGenFor(Q.game) || !(speed.cost.real > 0) || speed.cost.id !== Q.game?.id || speed.cost.real < 800 / screenHz();
// The quality steps' own record, for the frame lab's report (Rob's MacBook Air M5, 2026-11-14: Long Shadow stuttered
// for 26 s before anything was stepped down, and the report couldn't say why): each window of frames (performance.now(),
// its average gap in ms, frames a refresh or more late, the verdict, what was done about it), the last 400, and the
// frames not counted and why (pinned: HD.force; long: a gap of 100 ms or more; warming: drawn under the loading screen).
const STEPS = { log: [], off: { pinned: 0, long: 0, warming: 0 } };
function stepped(t, a, late, v, was) {
  let did = '';
  if (Q.lvl !== was.lvl) did = `resolution ${Math.round(LEVELS[was.lvl] * 100)}% to ${Math.round(LEVELS[Q.lvl] * 100)}%`;
  else if (Q.fxLast.length > was.fx) did = `${Q.fxLast[Q.fxLast.length - 1]} smaller`;
  else if (Q.fxLast.length < was.fx) did = 'an effect back';
  else if (Q.want != null && Q.want !== was.want) did = `${TIERS[Q.want].name} wanted (from the next round)`;
  else if (Q.game && fpsFor(Q.game) !== was.fps) did = `${Math.round(fpsFor(Q.game))} fps`;
  else if (v === 'slow') did = Q.slow ? 'waits for a second slow window' : Q.want != null ? `${TIERS[Q.want].name} waits for the next round` : 'nothing left to step down';
  else if (v === 'ok') did = 'holds';
  else if (v === 'fast') did = Q.fast ? `${Q.fast} fast in a row` : Q.lvl === 0 && !Q.fxLast.length && Q.tier < CAP && !mayClimb(Q.tier, phoneClass(), desktop, false) ? `stays on ${TIERS[Q.tier].name} (the chip's own times show no room)` : 'nothing to step up';
  STEPS.log.push({ t: Math.round(t), avg: +a.toFixed(1), late, v, did }); if (STEPS.log.length > 400) STEPS.log.shift();
}
function adapt(gap) {
  if (Q.force != null) { STEPS.off.pinned++; return; }
  if (!(gap > 0 && gap < 100)) { if (gap >= 100) STEPS.off.long++; return; }
  const fps = Q.game ? fpsFor(Q.game) : 60, budget = 1000 / fps;
  Q.sum += gap; if (gap > budget * 1.5) Q.late++;   // a frame a whole refresh (or more) late: a stutter you can see
  if (++Q.cnt < 45) return;
  const a = Q.sum / Q.cnt, now = performance.now(), v = qualityVerdict(a, Q.late, budget), late = Q.late; Q.sum = Q.cnt = Q.late = 0;
  const was = { lvl: Q.lvl, fx: Q.fxLast.length, want: Q.want, fps };
  decide(v, now, fps, budget);
  stepped(now, a, late, v, was);
}
function decide(v, now, fps, budget) {
  // the GPU's own time per frame (WebGPU timestamps, where the phone has them): how much of a slow frame
  // is the graphics chip's. A frame that's slow while the GPU has room is held up by the CPU, and fewer
  // pixels wouldn't help it; a GPU with plenty of room can take sharpness back sooner (Unreal and
  // Unity's dynamic resolution work from GPU time the same way)
  const g = Q.gcnt >= 5 ? Q.gsum / Q.gcnt : null; Q.gsum = Q.gcnt = 0;
  const cpuBound = g != null && g < budget * .75, gpuRoom = g != null && g < budget * .6;
  if (now - Q.ceilT > Q.hold) { Q.ceil = 0; Q.tierCeil = 3; }
  const tier0 = Q.tier, lvl0 = Q.lvl, fx0 = Q.fxLast.length;
  if (v === 'slow') {
    Q.fast = 0; Q.easy = 0; if (++Q.slow < 2) return; Q.slow = 0; Q.ceilT = now;
    if (now - Q.upT < 20000) Q.hold = Math.min(HOLD_MAX, Q.hold * 2);   // the last climb didn't hold
    // (held up by the CPU above 60: fewer pixels wouldn't help and a lower tier costs the picture, so it's the frame rate that gives first)
    // (and before the picture loses sharpness when frames made between would take over at 60 and fit: frameGenCould)
    if (fps > 60 && (Q.lvl >= 1 || cpuBound || frameGenCould(Q.game, 60)) && stepDown(Q.game)) { Q.lvl = 0; Q.ceil = 0; Q.fpsT = now; if (now - Q.fpsUpT < 20000) Q.fpsHold = Math.min(8 * 60000, Q.fpsHold * 2); }
    else if (!cpuBound && fxDown(g)) { /* an effect drawn smaller first */ }
    else if (Q.lvl < LEVELS.length - 1 && !cpuBound) { Q.lvl++; Q.ceil = Q.lvl; }
    else if (Q.tier > 0) { if (Q.want == null) { Q.tierCeil = Q.tier - 1; Q.want = Q.tier - 1; } }
    else if (stepDown(Q.game)) { Q.lvl = 1; Q.fpsT = now; }
  } else if (v === 'fast') {
    Q.slow = 0; if (++Q.fast < (gpuRoom && Q.lvl > Q.ceil ? 3 : 8)) return; Q.fast = 0;
    if (Q.lvl > Q.ceil) { if (!(hot(now) && Q.lvl <= 1)) { Q.lvl--; Q.upT = now; } }
    else if (Q.lvl === 0 && Q.fxLast.length && now - Q.ceilT > Q.hold && !hot(now)) { fxUp(); Q.upT = now; }
    else if (Q.lvl === 0 && Q.want == null && Q.tier < Math.min(Q.tierCeil, CAP) && mayClimb(Q.tier, phoneClass(), desktop, gpuRoom)) { Q.want = Q.tier + 1; Q.upT = now; Q.wantRoom = gpuRoom; }
    // a long spell of easy frames at the top tier, a while after stepping the frame rate down: try one notch up
    // (with frames made between, only when a real frame would have room in each refresh: the chip's time, speed.cost)
    else if (Q.lvl === 0 && Q.tier === CAP && ++Q.easy >= 3 && now - Q.fpsT > Q.fpsHold && roomUp() && stepUp(Q.game)) { Q.easy = 0; Q.fpsT = now; Q.fpsUpT = now; }
  } else { Q.slow = 0; Q.fast = 0; }
  if (Q.tier !== tier0 || Q.lvl !== lvl0 || Q.fxLast.length !== fx0) settle(Q.game?.id, { tier: Q.tier, lvl: Q.lvl, fx: fxSaved() });
}
// A new tier changes which shaders every material needs (shadows, lights, edge smoothing), so three.js
// rebuilds them all: a long stall. So a tier change waits until no round is being played (the
// game-over screen, the next card) and the round carries on at its lowest resolution until then.
function applyTier() {
  if (speed.playing()) {   // hot mid-round: the first resolution step (critically short of memory: the second)
    const l = memory.level >= 3 ? 2 : 1;
    if (Q.force == null && Q.lvl < l && hot()) { Q.lvl = l; Q.ceil = Math.max(Q.ceil, l); }
    return;
  }
  Q.capNow = hot() ? CAP - 1 : CAP;   // between rounds: one tier lower while hot
  if (Q.want == null) return;
  const down = Q.want < Q.tier; Q.tier = Q.want; Q.want = null; Q.lvl = 1; Q.ceil = down ? 1 : 0; Q.sum = Q.cnt = Q.late = Q.slow = Q.fast = 0;
  if (!down) Q.room = !!Q.wantRoom;   // (room: climbed while the chip's times showed it; kept on the way down, as that climb was)
  settle(Q.game?.id, { tier: Q.tier, lvl: Q.lvl, room: Q.room || undefined });
}
// what the phone and driver steering list says for this device and the game on screen (src/steer.js): a highest tier,
// no ray tracing, no half precision, a game kept on WebGL
const steered = () => steerFor(speed.game?.id);
/** Current quality: { tier, name, res }. Set HD.force = 0..3 to pin a tier (tests, screenshots). */
export const HD = {
  get tier() { return Q.force ?? Math.min(Q.tier, Q.capNow, steered().tier ?? 3); }, get name() { return TIERS[this.tier].name; }, get res() { return Q.force != null ? 1 : LEVELS[Q.lvl]; },
  set force(t) { Q.force = t; }, get force() { return Q.force; },
  /** The quality steps' record (the frame lab): { log: [{ t, avg, late, v, did }] each window of frames, off: frames not counted, by why }. */
  get steps() { return STEPS; },
  /** The effects drawn smaller by their cost now (FXS): { name: size, 1 = as the tier has it }; {} when none is. */
  get fx() { const o = {}; for (const k in Q.fx) o[k] = fxK(k); return o; },
  /** Tests and the frame lab: draw this effect smaller by n of its steps now (0: full size), also under HD.force; until the next game. */
  fxStep(name, n) { if (!FXS[name]) throw new Error(`HD.fxStep: no effect '${name}' (${Object.keys(FXS).join(', ')})`); const v = Math.max(0, Math.min(FXS[name].length - 1, n | 0)); Q.fxLast = Q.fxLast.filter(k => k !== name); if (v) { Q.fx[name] = v; for (let i = 0; i < v; i++) Q.fxLast.push(name); } else delete Q.fx[name]; Q.fxPin = true; },
  /** Last frame: draw calls, triangles, milliseconds spent in render() on the CPU, and whether the shadows were redrawn. */
  /** GPU culling of gs.props copies on WebGPU: 'auto' (sets of GPU_CULL_MIN copies or more), true (every set), false (CPU). Off while frame generation runs. */
  gpuCull: 'auto',
  /** WebGPU: false gives each full-size effect step (volumetric mix, depth of field, motion blur, the finish under SGSR 2) a picture of its own, to compare; by default a step draws into the picture of the step two back. info.shared: pictures saved so. */
  shareTargets: true,
  /** WebGPU: true keeps three's colour picture beside each shadow map's depth (16 MB a 2048 map, never read), for maps made from then on, to compare. */
  shadowColour: false,
  /** Still scenery drawn from render bundles on WebGPU (still.js): what keeps still is recorded by area once and replayed. false: every thing draws itself. info.bundled / info.bundles: things and areas in bundles last frame. */
  bundle: true,
  /** Detail levels fade into each other (lod-fade.js: people, animals, and gs.props copies on WebGPU) instead of popping; false: they switch at once. */
  get lodFade() { return FADE.on; }, set lodFade(on) { FADE.on = on !== false; },
  /** How long one fade takes (seconds). */
  get lodFadeTime() { return FADE.s; }, set lodFadeTime(s) { FADE.s = Math.max(.01, +s || .4); },
  /**
   * People on bones posed once a frame on the graphics chip (WebGPU, skin-gpu.js): one compute pass poses every point of
   * every mesh on bones in view, and the picture, the shadow maps and the motion picture all read it, instead of each
   * posing them again in its vertex shader. false: posed in each pass, as three does (tests, the engine test square).
   * info.skin: { meshes, posed, points, bones, kinds, poolMB } for the last frame (null when off or on WebGL).
   */
  gpuSkin: true,
  /**
   * The world's centre moved along with the camera (origin.js), so far-off places don't shake: how far in metres
   * the camera goes from it before it moves (0: never). originAt: { x, z } a centre given outright (tests, the frame lab).
   * info.origin: [x, z] where the last frame's centre was, or null at the world's own.
   */
  get origin() { return ORIGIN_SET.far; }, set origin(m) { ORIGIN_SET.far = Math.max(0, +m || 0); },
  get originAt() { return ORIGIN_SET.at; }, set originAt(p) { ORIGIN_SET.at = p || null; },
  info: { skin: null, subgroups: '', gpuMs: null, gpuOff: false, gpuCompute: 0, gpuParts: null, calls: 0, tris: 0, cpu: 0, shadows: false, upscaled: false, backend: 'webgl', webgl: '', framegen: false, fgMs: 0, fgSteps: 0, still: false, rw: 0, rh: 0, ow: 0, oh: 0, trace: null, refl: '', origin: null, half: 'full', spread: '', sky: '', gssrNet: '' },
  /** Things needing a shader not built yet wait (hidden) at most this long while it builds in the background (v.holdNew); hold = false: build it in the frame instead. */
  holdMs: 500, hold: true,
  /** WebGPU: the kit's code-made textures packed into the chip's compressed formats (spark.js); false: plain (tests). */
  get pack() { return packing.on; }, set pack(v) { packing.on = v !== false; }, get packed() { return { textures: packing.packed, savedMB: +(packing.saved / 1048576).toFixed(1), failed: packing.failed }; },
  /**
   * Smaller meshes (slim.js): the dense things the kit makes (people, creatures, vehicles, land, real surface detail)
   * keep their points in about half the bytes, in JavaScript and on the chip. false: plain floats for what is made
   * from then on (tests). slimmed: how many meshes are kept that way now, and their megabytes before and after.
   */
  get slim() { return SLIM.on; }, set slim(v) { SLIM.on = v !== false; }, get slimmed() { const S = SLIM.stats; return { meshes: S.meshes, wasMB: +(S.was / 1048576).toFixed(2), nowMB: +(S.now / 1048576).toFixed(2) }; },
  /** The bytes the geometries under a thing keep, each list once: { js, chip (worked out for the renderer in use), points } (tests, the engine test scenes). */
  meshBytes(root) { return meshBytes(root, this.info.backend === 'webgpu'); },
  /** Cluster detail for big meshes (autoDetail below): false draws every mesh whole. detailMin: triangles a mesh needs before it is tried (under DETAIL_SURE it stays only while it pays); detailPx: pixels its simpler parts may be out by. */
  detail: true, detailMin: 8000, get detailPx() { return DETAIL.px; }, set detailPx(v) { DETAIL.px = Math.max(.1, +v || 1); },
  /**
   * Real surface detail (gs.models.relief): false draws those meshes flat, as they were. reliefPx: pixels its
   * simpler parts may be out by (2.5: the bumps' light and shade still come from the material's own picture,
   * so the triangles only have to carry the depth at edges and glancing angles; at 1, as it was at first, a
   * Galaxy Z Fold 8 drew 327,000 triangles for a row of houses and ran 1.7 times slower than with flat walls).
   * reliefTris: the most triangles it may draw a frame (null: by quality, TIERS' relief; 0 on low, where its
   * meshes draw flat): over that, everything is drawn a little coarser until it fits.
   */
  relief: true, reliefPx: 2.5, reliefTris: null,
  /** Detail levels for copies (gs.props kinds and perCopy sets with none of their own; autoCopies below): false draws every copy whole. */
  copies: true,
  /**
   * Occlusion culling (occlude.js): what is fully hidden behind other things is not drawn. occlude: false draws it all.
   * occludeDepth: what hides things is found from the last frame's own depth, with nothing listed (false: only the boxes
   * a game lists with v.occluders). occludeSleep: a view where it saves less than finding it costs stops for a while (false: never,
   * and small views are tried too: tests). occludeTexels: the size of the depth picture it reads back, texels in all (more hides a
   * little more of what is small and far, for more work each frame: 6000 costs about twice as much). occludeShow:
   * tests, true works out what is hidden and draws it all the same (the picture to compare a frame with).
   */
  occlude: true, occludeDepth: true, occludeSleep: true, occludeTexels: 2400, occludeShow: false,
  /**
   * Shadows kept from frame to frame. shadowCache: false draws every shadow map whole whenever anything it sees changed.
   * shadowTiles: a sun's map is kept in tiles that slide with the camera, each drawn again only when what is in it changed
   * (shadow-tiles.js); false: the sun moves a shadow texel at a time, as it used to, and its map is drawn again whenever it does.
   * shadowCheck (tests): true makes a tiled map again from its kept copy and the moving things on frames with nothing to draw,
   * which is what it should hold already, so a kept copy that has gone wrong shows in the picture.
   */
  shadowCache: true, shadowTiles: true, shadowCheck: false,
  /**
   * Ray traced reflections (v.reflect() on WebGPU; hd3d-gpu-trace.js). traced: null traces on the best phones
   * (speed.js's 'top' class) on high and ultra, true wherever the chip can (tests), false never: screen-space
   * reflections then, as on every other phone. traceTris: triangles the traced copy of the level's still things
   * may hold (bigger meshes are simplified to fit). HD.info.trace says what it holds while it draws.
   * traceShow (tests): true draws the traced copy itself, lit as reflections light it, in place of the picture.
   */
  traced: null, traceTris: 3e5, traceShow: false,
  /** Upscale when the 3D is drawn below the screen's size (false: plain stretch). */
  upscale: true,
  /** Which upscaler: 'sgsr2' (Snapdragon GSR 2, temporal; Next Gen without reflections) or 'sgsr1' (one frame). AR and the rest use SGSR 1. */
  upscaler: 'sgsr2',
  /** Tests: film grain strength (null: the usual; 0: none, so two pictures can be compared pixel by pixel). */
  grain: null,
  /** Tests and the frame lab's A/B: false draws SGSR 2 as Qualcomm's shader has it, without our changes (hd3d-gpu.js sgsr2Gpu, sgsr2.js), and on WebGPU with the tier's MSAA under it. */
  sgsrTune: true,
  /** Tests: true has WebGPU's scene pass write each pixel's motion for SGSR 2 off the card too (screenshots, scripts/upscale-compare.cjs), as it does for the game on the card. */
  motion: false,
  /**
   * GSSR's learned blend (gssr-net.js): a small trained network weighs the history pixel by pixel. true (the usual):
   * on WebGPU, and the hand-written blend on WebGL (trained with each thing's own motion, which WebGL's GSSR hasn't:
   * there it left a moving box's trail 30% longer); false is the hand-written GSSR everywhere; an object is a
   * network of its own on both (scripts/gssr-train, upscale-compare --net). Not with sgsrTune false. HD.info.gssrNet
   * says which ran.
   */
  gssrNet: true,
  /** The frame lab's switch and tests: false draws the kit's own WebGPU passes in full precision where the chip could do them in half (half.js). HD.info.half says which it is. */
  half: true,
  /** The frame lab's switch and tests: false builds the kit's compute passes without WebGPU subgroups where the chip has them (subgroups.js: GPU culling's lists, frame generation's counts, the fluid's sums). HD.info.subgroups says which it is. */
  subgroups: true,
  /**
   * WebGPU: ambient occlusion, volumetric light and live bounce light take a part of their samples each frame, the
   * pattern turning from frame to frame, and the frames before fill in the rest (hd3d-gpu-spread.js). false: all of
   * them every frame, as before (the frame lab's A/B and spread check, tests); a list ('ao,vol,bounce') spreads only those.
   * HD.info.spread says which are spread.
   */
  spread: true,
  /**
   * WebGPU: ambient occlusion darkens the light that bounces (the sky's and the room's, and reflections by roughness), in each
   * thing's own shading, as Filament, Godot, Bevy and Unity do, not the whole lit picture (hd3d-gpu.js aoInShading).
   * false: the whole picture as before (the frame lab's A/B, tests). WebGL always lays it on the whole picture.
   */
  aoBack: true,
  /** With aoBack: the share of the occlusion still laid on the whole picture, direct light included (0..1; Unity's "direct lighting strength"). */
  aoDirect: .25,
  /**
   * WebGPU: v.decal() marks are boxes in the lamps' grid with their pictures in one atlas (decals-gpu.js): no mesh and no draw
   * each. false: a mesh cut from the surface for each, as on WebGL (the frame lab's A/B, tests); marks already made swap over.
   */
  gridDecals: true,
  /**
   * WebGPU: a gs.sky Sky's clouds marched through as real ones (high and ultra; hd3d-gpu-sky.js), shading the ground, the fog and
   * the light beams. false: the painted layer, as on WebGL. HD.info.sky says what the sky drew ('air', 'clouds', 'air + clouds').
   */
  clouds: true,
  /** WebGPU: a physical Sky's colours from Hillaire's air (atmosphere.js) in place of Preetham's sums, and the air's haze in the sky's colours. false: Preetham, as on WebGL. */
  atmosphere: true,
  /** Tests: act as if the graphics chip had half precision (the build machine's WebGPU has none), drawing the same passes in full, so the switch, the rebuild and the frame lab's check can be tried. */
  halfPretend: false,
  /** Tests and the frame lab's A/B: how textures are read under SGSR 2 on WebGPU. null: the usual, as the screen's size would read them (hd3d-gpu.js sharpMips); false: as drawn, the small picture's mip level; a number: that many mip levels on top of the usual (negative: sharper). */
  mipBias: null,
  /** Tests: draw the 3D at this fraction of the screen's size (null: the tier and frame rate decide). */
  scale: null,
  /** Tests: frame generation on ('blend' | 'ahead') whatever the screen and settings, or null (speed.js decides). Needs WebGPU and direct. */
  set frameGen(v) { speed.forceFrameGen = v || null; }, get frameGen() { return speed.forceFrameGen; },
  /** Tests and the frame lab (src/framelab.js): fgTap(kind, canvas, when) runs after each frame frame generation puts on the screen ('real' | 'made'; when: 'frame' | 'between'), while the canvas still holds it. */
  fgTap: null,
  /** A gap between real frames longer than this (ms) counts as a pause: frame generation starts afresh. Tests on slow software GPUs raise it. */
  fgGap: 250,
  /** Tests: run the refresh between now (where the test browser is too slow to have one), as the feed does on a refresh it skips. */
  between() { const b = speed.between; speed.between = null; b?.(); },
  /** Show the 3D canvas directly on the card (false: copy each frame into the card's canvas, as tests and screenshots need). */
  direct: typeof navigator === 'undefined' || !navigator.webdriver,
};
Object.defineProperty(HD, 'fxStep', { enumerable: false });   // (a test lever: left out of the read-only view games get)
const tier = () => TIERS[HD.tier];
// test hook: __hd.force = 3 pins ultra. Dev and test builds and test browsers only, not the store apps.
// (window.__hdView: the view drawn last, for the test scripts)
const TEST = typeof window !== 'undefined' && (import.meta.env?.MODE !== 'production' || navigator.webdriver);
if (TEST) { window.__hd = HD; window.__gpu = { pick: setGpuPick, ready: prepareGPU, lose: loseGPU, losses: gpuLosses, mending: () => !!gpuMending() }; }

/* ---------- shared renderer + post chain ---------- */
let R = null, broken = false, comp = null, P = {}, envTex = null, compKey = '', pmGen = null;
function renderer() {
  if (R || broken) return R;
  try {
    const cv = document.createElement('canvas');
    R = makeRenderer({ canvas: cv, alpha: true, antialias: false, preserveDrawingBuffer: false, stencil: false });
    R.setPixelRatio(1); R.outputColorSpace = SRGBColorSpace;
    R.toneMapping = ACESFilmicToneMapping; R.toneMappingExposure = 1;
    R.shadowMap.enabled = true; R.shadowMap.type = PCFShadowMap; R.shadowMap.autoUpdate = false;   // redrawn only when something moved
    splitShadowsGL(R);
    const pm = new PMREMGenerator(R); envTex = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
  } catch (e) { broken = true; R = null; }
  return R;
}
// The still/moving shadow split on WebGL (HDView.shadowLights): three draws the shadow maps inside
// render(), so its shadow drawing is wrapped. A light planned 'rebuild' has its still things drawn
// alone and copied aside; 'overlay' puts that copy back; then both draw just the moving things over it
// (the map is kept, not cleared: a map marked gsKeep skips three's clear). A sun planned 'tiles' does
// the same a part of its map at a time (shadowTiles below).
function splitShadowsGL(r) {
  const sm = r.shadowMap, draw = sm.render, clear = r.clear, box = new Box2(), at = new Vector2();
  let scene = null, camera = null, used = 0;
  r.clear = function (...a) { if (this.getRenderTarget()?.gsKeep) return; return clear.apply(this, a); };
  // (A part of the map is drawn through a camera of its own that looks at that part alone, and no camera
  // draws two parts in one frame. The light's own camera with its view narrowed would not do: three.js
  // sends a camera's projection to a shader only when the camera or the shader is another one than the
  // last thing drawn had, so a second part would be drawn through the first part's; and gs.props' sets
  // pick which of their copies to draw once a frame for each camera (@three.ez/instanced-mesh), so it
  // would draw the first part's copies.)
  const parts = [];
  const ops = {
    draw(l, mask, keep, q, px) {
      const sh = l.shadow, c0 = sh.camera, map = sh.map, N = map.width, vp = sh._viewports[0];
      let c = c0;
      if (q) {
        const x = q[0] * px, y = q[1] * px, w = q[2] * px, h = q[3] * px;
        c = parts[used++] ||= new OrthographicCamera(); c.left = c0.left; c.right = c0.right; c.top = c0.top; c.bottom = c0.bottom; c.near = c0.near; c.far = c0.far; c.up.copy(c0.up); c._reversedDepth = c0._reversedDepth; c.coordinateSystem = c0.coordinateSystem;
        c.setViewOffset(N, N, x, N - y - h, w, h); sh.camera = c;   // (only what is in the part is drawn, into that part of the map; three's clear, kept to it, empties it first)
        vp.set(x / N, y / N, w / N, h / N); map.scissor.set(x, y, w, h); map.scissorTest = true;
      }
      const m0 = c.layers.mask; c.layers.mask = mask; sh.needsUpdate = true; sm.needsUpdate = true; map.gsKeep = keep;
      try { draw.call(sm, [l], scene, camera); }
      finally { c.layers.mask = m0; map.gsKeep = false; if (q) { sh.camera = c0; vp.set(0, 0, 1, 1); map.scissor.set(0, 0, N, N); map.scissorTest = false; sh.updateMatrices(l); } }
    },
    copy(l, from, to, qs, px) {
      r.state.setScissorTest(false);
      if (!qs) { r.copyTextureToTexture(from.depthTexture, to.depthTexture); return; }
      for (const q of qs) { box.min.set(q[0] * px, q[1] * px); box.max.set((q[0] + q[2]) * px, (q[1] + q[3]) * px); r.copyTextureToTexture(from.depthTexture, to.depthTexture, box, at.copy(box.min)); }
    },
    // (sideways only: a blit can't make depths deeper, so shadowLights starts the tiles again when the light's depth moves)
    shift(l, from, to, dx, dy) {
      const N = to.width; box.min.set(Math.max(0, dx), Math.max(0, dy)); box.max.set(box.min.x + N - Math.abs(dx), box.min.y + N - Math.abs(dy));
      r.state.setScissorTest(false); r.copyTextureToTexture(from.depthTexture, to.depthTexture, box, at.set(Math.max(0, -dx), Math.max(0, -dy)));
    },
    make(l) { const t = new WebGLRenderTarget(sh0(l).x, sh0(l).y, { depthBuffer: true }); t.depthTexture = new DepthTexture(t.width, t.height, UnsignedIntType); r.initRenderTarget(t); return t; },
  };
  sm.render = function (lights, sc, cam) {
    if (sm.enabled === false || (!sm.autoUpdate && !sm.needsUpdate)) return;
    const t0 = r.info.render.triangles, c0 = r.info.render.calls; used = 0;
    let split = null;
    for (const l of lights) { const sh = l.shadow; if (sh.needsUpdate && sh.map && sh.gsPlan && sh.gsPlan.mode !== 'full') { (split ||= []).push(l); sh.needsUpdate = false; } }
    draw.call(sm, lights, sc, cam);
    if (split) {
      scene = sc; camera = cam;
      try { for (const l of split) shadowSplit(l, ops); }
      finally { scene = camera = null; r.setRenderTarget(r.getRenderTarget(), r.getActiveCubeFace(), r.getActiveMipmapLevel()); }   // (the copies leave no target bound)
    }
    sm.needsUpdate = false;
    HD.info.shTris = (HD.info.shTris || 0) + r.info.render.triangles - t0; HD.info.shCalls = (HD.info.shCalls || 0) + r.info.render.calls - c0;
  };
}
const sh0 = l => l.shadow.mapSize;
// One light's still/moving shadow drawing, the same on WebGL and WebGPU. ops (each backend's own):
// draw(l, layers, keep, part, px) draws the map from the things on those layers (keep: over what is
// there; part: only that rectangle of it, [x, y, w, h] in tiles of px texels, emptied first unless
// kept); copy(l, from, to, parts, px) copies a depth picture, or those parts of it; shift(l, from, to,
// dx, dy, dz) copies it moved by whole texels (and deeper by dz); make(l) makes the copy's target.
function shadowSplit(l, ops) {
  const sh = l.shadow, plan = sh.gsPlan;
  if (sh.gsCache && (sh.gsCache.width !== sh.mapSize.x || sh.gsCache.height !== sh.mapSize.y)) { sh.gsCache.dispose(); sh.gsCache = null; }
  if (plan.mode === 'tiles') { shadowTiles(l, ops); return; }
  if (plan.mode === 'rebuild' || !sh.gsCache) {
    ops.draw(l, SH_STILL_BIT, false);
    ops.copy(l, sh.map, sh.gsCache ||= ops.make(l));
  } else ops.copy(l, sh.gsCache, sh.map);
  ops.draw(l, SH_MOVE_BIT, true);
  HD.info.shSplit = (HD.info.shSplit || 0) + 1;
}
// A sun's map in tiles (shadow-tiles.js has the book-keeping and says why). The plan made in
// shadowLights is carried out here: the kept copy slides with the map when the sun has stepped a tile,
// the parts whose still things changed are drawn again and copied aside, the parts where only moving
// things changed get the kept copy back, and the moving things are drawn over what was put back.
function shadowTiles(l, ops) {
  const sh = l.shadow, st = sh.gsTiles, p = st.plan, px = sh.mapSize.x / st.T, I = HD.info;
  let cache = sh.gsCache;
  if (p.reset || !cache) {
    cache = sh.gsCache ||= ops.make(l);
    ops.draw(l, SH_STILL_BIT, false);
    ops.copy(l, sh.map, cache);
    ops.warm?.(l, sh.map, cache);
    ops.draw(l, SH_MOVE_BIT, true);
    I.shTiles = (I.shTiles || 0) + st.T * st.T; I.shWhole = (I.shWhole || 0) + 1;
  } else {
    if (p.shift) { ops.shift(l, cache, sh.map, p.shift[0], p.shift[1], p.shift[2]); ops.copy(l, sh.map, cache); I.shSlid = (I.shSlid || 0) + 1; }
    for (const q of p.redo) ops.draw(l, SH_STILL_BIT, false, q, px);
    if (p.redo.length) ops.copy(l, sh.map, cache, p.redo, px);
    if (p.back.length) ops.copy(l, cache, sh.map, p.back, px);
    if (p.movers) ops.draw(l, SH_MOVE_BIT, true, p.movers[2] === st.T && p.movers[3] === st.T ? null : p.movers, px);
    I.shTiles = (I.shTiles || 0) + p.tiles; I.shPut = (I.shPut || 0) + p.put;
  }
  st.commit();
  I.shSplit = (I.shSplit || 0) + 1;
}
/** True if this device can draw Next Gen games. */
export const hasHD = () => !!renderer();
/** The shared WebGL renderer, for kit bakes (outdoors impostor()); null without 3D. */
export const bakeRenderer = () => renderer();

// The final pass: bloom, tone mapping, sRGB and the colour grade in one full-screen pass (they used
// to be four: bloom blend, output, grade, plus bloom's own full-size copy). The grade is a vignette,
// fine film grain, a touch of lens fringing at the edges, and a hurt tint the game can pulse
// (v.hurt = 0..1). With no MSAA the same pass smooths jagged edges (a light FXAA).
//
// Bloom is a small chain: the bright parts are picked out into a half-size buffer, shrunk four more
// times, then grown back up, each step adding a softer copy. That's 9 tiny passes, where the old
// bloom took 13 bigger ones.
const QV = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const qmat = (fs, uniforms, o = {}) => new ShaderMaterial({ uniforms, vertexShader: QV, fragmentShader: fs, depthTest: false, depthWrite: false, ...o });
// bright parts only (anything brighter than the threshold keeps its full colour, fading in just under it), 4 taps
const BRIGHT = `uniform sampler2D tDiffuse; uniform vec2 px; uniform float thr; varying vec2 vUv;
  vec3 pick(vec2 o){ vec3 c = texture2D(tDiffuse, vUv + o * px).rgb; float l = dot(c, vec3(.2126, .7152, .0722));
    return c * smoothstep(thr - .05, thr + .05, l); }
  void main(){ vec3 c = pick(vec2(-1., -1.)) + pick(vec2(1., -1.)) + pick(vec2(-1., 1.)) + pick(vec2(1., 1.)); gl_FragColor = vec4(c * .25, 1.); }`;
const DOWN = `uniform sampler2D tDiffuse; uniform vec2 px; varying vec2 vUv;
  void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * 4.;
    c += texture2D(tDiffuse, vUv + vec2(-px.x, -px.y)).rgb + texture2D(tDiffuse, vUv + vec2(px.x, -px.y)).rgb + texture2D(tDiffuse, vUv + vec2(-px.x, px.y)).rgb + texture2D(tDiffuse, vUv + px).rgb;
    gl_FragColor = vec4(c / 8., 1.); }`;
const UP = `uniform sampler2D tDiffuse; uniform vec2 px; uniform float k; varying vec2 vUv;
  void main(){ vec3 c = texture2D(tDiffuse, vUv + vec2(-2. * px.x, 0.)).rgb + texture2D(tDiffuse, vUv + vec2(2. * px.x, 0.)).rgb + texture2D(tDiffuse, vUv + vec2(0., -2. * px.y)).rgb + texture2D(tDiffuse, vUv + vec2(0., 2. * px.y)).rgb;
    c += 2. * (texture2D(tDiffuse, vUv + vec2(-px.x, -px.y)).rgb + texture2D(tDiffuse, vUv + vec2(px.x, -px.y)).rgb + texture2D(tDiffuse, vUv + vec2(-px.x, px.y)).rgb + texture2D(tDiffuse, vUv + px).rgb);
    gl_FragColor = vec4(c / 12. * k, 1.); }`;
// The final pass's effects, each a named piece of the one shader (so the pass stays a single
// full-screen draw on phones, and each piece can be ported to a WebGPU node on its own). They run
// in this order; FINAL is them joined. Uniforms: the pass's own (FinalPass below).
export const FINAL_EFFECTS = [
  { name: 'head', what: 'uniforms, the tone mapping three leaves out under SGSR, helpers', glsl: `uniform sampler2D tDiffuse, tBloom; uniform float t, hurt, vig, bloom, grain; uniform vec2 px; varying vec2 vUv;
  uniform float gradeOn, sat, con, glare, aspect; uniform vec3 lo, hi, sunCol; uniform vec2 sunUV;
  #ifdef LUT
  uniform highp sampler3D tLut; uniform float lutS, lutO, lutK;
  #endif
  #ifdef FLARE
  uniform sampler2D tDirt; uniform float flareTh, flareSp, flareFade, flareK, dirtK; uniform vec3 flareTint;
  #endif
${DROPS_HEAD}  // (three.js adds its tone mapping and sRGB helpers to every ShaderMaterial drawn to the screen; when
  // SGSR upscales after this pass, it draws into a buffer and three leaves tone mapping out, so here it is)
  #ifndef TONE_MAPPING
${ShaderChunk.tonemapping_pars_fragment}
  #endif
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec3 tex(vec2 p){ return texture2D(tDiffuse, p).rgb; }
  float luma(vec3 c){ float l = dot(c, vec3(.299, .587, .114)); return l / (1. + l); }
` },
  { name: 'main', what: 'start', glsl: `  void main(){
    vec2 d = vUv - .5; float r2 = dot(d, d);
` },
  { name: 'smooth', what: 'edge smoothing (FXAA, no MSAA) or lens fringing', glsl: `  #ifdef FXAA
    // light edge smoothing: find the edge direction from the four diagonal neighbours, blur along it
    vec3 cM = tex(vUv); float lM = luma(cM), lNW = luma(tex(vUv + vec2(-1., -1.) * px)), lNE = luma(tex(vUv + vec2(1., -1.) * px)),
      lSW = luma(tex(vUv + vec2(-1., 1.) * px)), lSE = luma(tex(vUv + vec2(1., 1.) * px));
    // (lMin / lMax, not lo / hi: those names are the grade's tints below)
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    vec3 col = cM;
    if (lMax - lMin > max(.04, lMax * .125)) {
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
      float rcp = 1. / (min(abs(dir.x), abs(dir.y)) + max((lNW + lNE + lSW + lSE) * .03125, .0078125));
      dir = clamp(dir * rcp, -8., 8.) * px;
      vec3 a = .5 * (tex(vUv + dir * (1. / 3. - .5)) + tex(vUv + dir * (2. / 3. - .5)));
      vec3 b = a * .5 + .25 * (tex(vUv - dir * .5) + tex(vUv + dir * .5));
      float lb = luma(b); col = lb < lMin || lb > lMax ? a : b;
    }
  #else
    vec2 off = d * r2 * .012;
    vec3 col = vec3(tex(vUv + off).r, tex(vUv).g, tex(vUv - off).b);
  #endif
` },
  { name: 'bloom', what: 'bloom', glsl: `    col += texture2D(tBloom, vUv).rgb * bloom;
` },
  { name: 'flare', what: 'lens flare and dirt (v.flare: three\'s LensflareNode maths, ghosts of the bright parts mirrored through the middle)', glsl: `  #ifdef FLARE
    { vec2 fv = 1. - vUv, gv = (vec2(.5) - fv) * flareSp; vec3 fl = vec3(0.);
      for (int i = 0; i < 4; i++) { vec2 q = fract(fv + gv * float(i)); fl += max(texture2D(tBloom, q).rgb * bloom - flareTh, 0.) * flareTint * pow(1. - distance(q, vec2(.5)), flareFade); }
      vec2 du = (vUv - .5) * vec2(min(aspect, 1.), min(1. / aspect, 1.)) + .5;
      col += fl * flareK + texture2D(tDirt, du).rgb * (texture2D(tBloom, vUv).rgb * bloom + fl) * dirtK; }
  #endif
` },
  { name: 'drops', what: 'rain on the lens (v.drops: lens-drops.js; gs.sky.Weather lands them)', glsl: DROPS_GLSL },
  { name: 'grade', what: 'colour grade (v.grade)', glsl: `    // the game's colour grade (v.grade): saturation, contrast round mid grey, a tint for the shadows and one for the highlights
    if (gradeOn > .5) {
      float l = dot(col, vec3(.2126, .7152, .0722));
      col = max(mix(vec3(l), col, sat), 0.);
      col = pow(col / .18 + 1e-5, vec3(con)) * .18;
      col *= mix(lo, hi, smoothstep(.15, .85, clamp(log2(l / .18 + 1e-4) * .16 + .5, 0., 1.)));
    }
` },
  { name: 'glare', what: 'sun glare (v.glare)', glsl: `    // sun glare (v.glare): a soft bloom round the sun and two faint lens ghosts, only while the sun itself shows
    if (glare > 0.) {
      vec3 s0 = texture2D(tDiffuse, sunUV).rgb + texture2D(tDiffuse, sunUV + vec2(.006, 0.)).rgb + texture2D(tDiffuse, sunUV - vec2(.006, 0.)).rgb + texture2D(tDiffuse, sunUV + vec2(0., .008)).rgb + texture2D(tDiffuse, sunUV - vec2(0., .008)).rgb;
      float seen = smoothstep(1.5, 6., dot(s0, vec3(.2126, .7152, .0722)) * .2);
      vec2 q = (vUv - sunUV) * vec2(aspect, 1.), g1 = (vUv - (.5 - (sunUV - .5) * .55)) * vec2(aspect, 1.), g2 = (vUv - (.5 - (sunUV - .5) * 1.3)) * vec2(aspect, 1.);
      float gl = exp(-dot(q, q) * 14.) * .5 + exp(-length(q) * 6.) * .22 + smoothstep(.06, .045, length(g1)) * .05 + smoothstep(.1, .08, length(g2)) * .035;
      col += sunCol * gl * glare * seen;
    }
` },
  { name: 'tone', what: 'tone mapping (v.tone: ACES, Khronos Neutral or AgX; three.js\'s own) and sRGB', glsl: `    col = TONE_FN(col);
    col = sRGBTransferOETF(vec4(col, 1.)).rgb;
` },
  { name: 'lut', what: 'colour look (v.lut: a 3D lookup table, gs.hd.lut)', glsl: `  #ifdef LUT
    col = mix(col, texture(tLut, clamp(col, 0., 1.) * lutS + lutO).rgb, lutK);
  #endif
` },
  { name: 'vignette', what: 'vignette', glsl: `    col *= 1. - vig * smoothstep(.12, .62, r2 * 1.6);
` },
  { name: 'grain', what: 'film grain', glsl: `    col += (h(vUv / px + t) - .5) * grain;
` },
  { name: 'hurt', what: 'hurt tint (v.hurt)', glsl: `    col = mix(col, col * vec3(1.25, .45, .4) + vec3(.12, 0., 0.), hurt * smoothstep(.04, .4, r2));
` },
  { name: 'out', what: 'end', glsl: `    gl_FragColor = vec4(col, 1.);
  }` },
];
const FINAL = FINAL_EFFECTS.map(e => e.glsl).join('');
// v.tone: which of three.js's tone mappers turns the light into screen colours. ACES (the film look,
// the default) pushes very bright colours towards yellow and white; Neutral (Khronos PBR Neutral)
// keeps colours true to the material; AgX keeps hue in bright light and rolls off softly (Blender's).
const TONE_FN = { aces: 'ACESFilmicToneMapping', neutral: 'NeutralToneMapping', agx: 'AgXToneMapping' };
const TONES = { aces: ACESFilmicToneMapping, neutral: NeutralToneMapping, agx: AgXToneMapping };
const MIPS = 5;
class FinalPass extends Pass {
  constructor() {
    super(); this.needsSwap = false;
    this.bright = qmat(BRIGHT, { tDiffuse: { value: null }, px: { value: new Vector2() }, thr: { value: .82 } });
    this.down = qmat(DOWN, { tDiffuse: { value: null }, px: { value: new Vector2() } });
    this.up = qmat(UP, { tDiffuse: { value: null }, px: { value: new Vector2() }, k: { value: 1 } }, { blending: ADD });
    this.final = qmat(FINAL, { tDiffuse: { value: null }, tBloom: { value: null }, t: { value: 0 }, hurt: { value: 0 }, vig: { value: .32 }, grain: { value: .035 }, bloom: { value: .7 }, px: { value: new Vector2(1, 1) }, toneMappingExposure: { value: 1 },
      gradeOn: { value: 0 }, sat: { value: 1 }, con: { value: 1 }, lo: { value: new Vector3(1, 1, 1) }, hi: { value: new Vector3(1, 1, 1) }, glare: { value: 0 }, sunUV: { value: new Vector2() }, sunCol: { value: new Color() }, aspect: { value: 1 }, tLut: { value: null }, lutS: { value: 1 }, lutO: { value: 0 }, lutK: { value: 1 }, tDirt: { value: null }, flareTh: { value: .3 }, flareSp: { value: .25 }, flareFade: { value: 25 }, flareK: { value: 1 }, dirtK: { value: 0 }, flareTint: { value: new Vector3(1, 1, 1) },
      drops: { value: Array.from({ length: DROPS_N }, () => new Vector4()) }, dropN: { value: 0 } }, { defines: { SRGB_TRANSFER: '', TONE_FN: TONE_FN.aces } });
    this.quad = new FullScreenQuad(null); this.mips = []; this.scale = .5; this.w = 0; this.h = 0; this.fxaa = false; this.strength = .7;
  }
  setSize(w, h) {
    this.w = w; this.h = h;
    const bw = Math.max(1, Math.round(w * this.scale)), bh = Math.max(1, Math.round(h * this.scale));
    if (this.mips[0] && this.mips[0].width === bw && this.mips[0].height === bh) return;
    for (const m of this.mips) m.dispose(); this.mips = [];
    for (let i = 0, x = bw, y = bh; i < MIPS && x >= 2 && y >= 2; i++, x = Math.max(1, x >> 1), y = Math.max(1, y >> 1))
      this.mips.push(new WebGLRenderTarget(x, y, { type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter }));
  }
  setTone(t) { const f = TONE_FN[t] || TONE_FN.aces; if (this.final.defines.TONE_FN === f) return; this.final.defines.TONE_FN = f; this.final.needsUpdate = true; }
  // v.lut: the look's table (null: none) and how much of it (0..1)
  setLut(t, k = 1) {
    const u = this.final.uniforms, on = !!t && k > 0;
    if (on) { const n = t.image.width; u.tLut.value = t; u.lutS.value = (n - 1) / n; u.lutO.value = .5 / n; u.lutK.value = Math.min(1, k); }
    if (on === ('LUT' in this.final.defines)) return;
    if (on) this.final.defines.LUT = ''; else delete this.final.defines.LUT;
    this.final.needsUpdate = true;
  }
  // v.flare: lens flare ghosts and dirt (null: off; needs bloom)
  setFlare(f) {
    const u = this.final.uniforms, on = !!f;
    if (on) { u.flareTh.value = f.threshold; u.flareSp.value = f.spacing; u.flareFade.value = f.fade; u.flareK.value = f.strength; u.dirtK.value = f.dirt; u.flareTint.value.copy(f.tint); u.tDirt.value = f.dirtTex; }
    if (on === ('FLARE' in this.final.defines)) return;
    if (on) this.final.defines.FLARE = ''; else delete this.final.defines.FLARE;
    this.final.needsUpdate = true;
  }
  // v.drops: rain on the lens (null: none can land, and the loop is left out)
  setDrops(d) {
    const u = this.final.uniforms, on = !!d;
    if (on) { u.drops.value = d.vecs; u.dropN.value = d.count; }
    if (on === ('DROPS' in this.final.defines)) return;
    if (on) this.final.defines.DROPS = ''; else delete this.final.defines.DROPS;
    this.final.needsUpdate = true;
  }
  setFxaa(on) { if (this.fxaa === on) return; this.fxaa = on; if (on) this.final.defines.FXAA = ''; else delete this.final.defines.FXAA; this.final.needsUpdate = true; }
  pass(r, mat, target) { this.quad.material = mat; r.setRenderTarget(target); this.quad.render(r); }
  render(r, writeBuffer, readBuffer) {
    const M = this.mips, F = this.final.uniforms, auto = r.autoClear;
    const on = this.strength > 0 && M.length > 1;
    if (on) {
      const b = this.bright.uniforms; b.tDiffuse.value = readBuffer.texture; b.px.value.set(.5 / readBuffer.width, .5 / readBuffer.height);
      this.pass(r, this.bright, M[0]);
      for (let i = 1; i < M.length; i++) { const u = this.down.uniforms; u.tDiffuse.value = M[i - 1].texture; u.px.value.set(1 / M[i - 1].width, 1 / M[i - 1].height); this.pass(r, this.down, M[i]); }
      r.autoClear = false;   // grow back up, adding each softer level onto the sharper one
      for (let i = M.length - 1; i > 0; i--) { const u = this.up.uniforms; u.tDiffuse.value = M[i].texture; u.px.value.set(.5 / M[i].width, .5 / M[i].height); u.k.value = 1; this.pass(r, this.up, M[i - 1]); }
      r.autoClear = auto;
    }
    F.tDiffuse.value = readBuffer.texture; F.tBloom.value = M[0]?.texture ?? null; F.bloom.value = on ? this.strength * .8 : 0;
    F.toneMappingExposure.value = r.toneMappingExposure; F.px.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    if (this.eyeView?.eye) {   // auto exposure's light meter, from the scene before tone mapping
      const v = this.eyeView, src = readBuffer.texture;
      v.eyeRead(() => {
        const M = this.eyeM ||= { rt: new WebGLRenderTarget(16, 16, { depthBuffer: false }), mat: qmat(EYE_FS, { tDiffuse: { value: null } }), px: new Uint8Array(1024) };
        M.mat.uniforms.tDiffuse.value = src; this.pass(r, M.mat, M.rt);
        return r.readRenderTargetPixelsAsync(M.rt, 0, 0, 16, 16, M.px);
      });
    }
    this.pass(r, this.final, this.renderToScreen ? null : writeBuffer);
  }
  dispose() { this.eyeM?.rt.dispose(); this.eyeM?.mat.dispose(); for (const m of this.mips) m.dispose(); for (const m of [this.bright, this.down, this.up, this.final]) m.dispose(); this.quad.dispose(); }
}
// Sun shafts (v.shafts): light streaming past trees, through windows and round a hill top. A small
// pass of its own (so it can be swapped for a WebGPU node later without touching the final pass):
// the bright sky near the sun is picked out at quarter size, smeared towards the sun, and added
// back on top. Where something blocks the sky, the streak has a gap: that's the shaft.
// A sky that is light, not paint (Sky physical) is far brighter round the sun: it says how bright
// (v.shaftsAt), and the mask then only picks out the sky nearer the sun, capped and scaled back, so
// the shafts look the same as with a painted sky and never white out the screen.
const SHAFT_MASK = `uniform sampler2D tDiffuse; uniform vec2 sunUV; uniform float aspect, thr, hi, cap, gain; varying vec2 vUv;
  void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = dot(c, vec3(.2126, .7152, .0722)); if (l > cap) { c *= cap / l; l = cap; } c *= gain;
    vec2 q = (vUv - sunUV) * vec2(aspect, 1.); float near = exp(-dot(q, q) * 3.);
    gl_FragColor = vec4(c * smoothstep(thr, hi, l) * near, 1.); }`;
const SHAFT_BLUR = `uniform sampler2D tDiffuse; uniform vec2 sunUV; uniform float decay, density; varying vec2 vUv;
  #define N 24
  void main(){ vec2 d = (vUv - sunUV) * density / float(N); vec2 p = vUv; vec3 sum = vec3(0.); float w = 1.;
    for (int i = 0; i < N; i++) { p -= d; sum += texture2D(tDiffuse, p).rgb * w; w *= decay; }
    gl_FragColor = vec4(sum / float(N) * 2.2, 1.); }`;
const SHAFT_ADD = `uniform sampler2D tDiffuse, tShaft; uniform float strength; uniform vec3 tint; varying vec2 vUv;
  void main(){ gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb + texture2D(tShaft, vUv).rgb * tint * strength, 1.); }`;
class ShaftsPass extends Pass {
  constructor() {
    super(); this.needsSwap = true; this.strength = 0;
    this.mask = qmat(SHAFT_MASK, { tDiffuse: { value: null }, sunUV: { value: new Vector2(.5, .5) }, aspect: { value: 1 }, thr: { value: 1.1 }, hi: { value: 2.42 }, cap: { value: 1e9 }, gain: { value: 1 } });
    this.blur = qmat(SHAFT_BLUR, { tDiffuse: { value: null }, sunUV: { value: new Vector2(.5, .5) }, decay: { value: .955 }, density: { value: .9 } });
    this.add = qmat(SHAFT_ADD, { tDiffuse: { value: null }, tShaft: { value: null }, strength: { value: 0 }, tint: { value: new Color(1, .9, .75) } });
    this.quad = new FullScreenQuad(null); this.a = null; this.b = null;
  }
  setSize(w, h) {
    const bw = Math.max(8, Math.round(w / 4)), bh = Math.max(8, Math.round(h / 4));
    if (this.a?.width === bw && this.a?.height === bh) return;
    this.a?.dispose(); this.b?.dispose();
    const o = { type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter };
    this.a = new WebGLRenderTarget(bw, bh, o); this.b = new WebGLRenderTarget(bw, bh, o);
  }
  /** How bright the sky is that starts a shaft (1.1 for a painted sky; brighter skies pass more). */
  bright(at = 1.1) { const u = this.mask.uniforms, t = Math.max(1.1, at), lit = t > 1.1; u.thr.value = t; u.hi.value = lit ? t * 1.2 : t * 2.2; u.cap.value = lit ? t * 1.2 : 1e9; u.gain.value = 1.1 / t; }
  /** Where the sun is on screen (0..1) and how much it shows (0 hides the shafts). */
  aim(uv, aspect, amount, col) { this.mask.uniforms.sunUV.value.copy(uv); this.blur.uniforms.sunUV.value.copy(uv); this.mask.uniforms.aspect.value = aspect; this.amount = amount; if (col) this.add.uniforms.tint.value.copy(col); }
  pass(r, mat, target) { this.quad.material = mat; r.setRenderTarget(target); this.quad.render(r); }
  render(r, writeBuffer, readBuffer) {
    const on = this.strength * (this.amount || 0);
    if (on > 0 && this.a) {
      this.mask.uniforms.tDiffuse.value = readBuffer.texture; this.pass(r, this.mask, this.a);
      this.blur.uniforms.tDiffuse.value = this.a.texture; this.pass(r, this.blur, this.b);
    }
    const u = this.add.uniforms; u.tDiffuse.value = readBuffer.texture; u.tShaft.value = this.b?.texture ?? null; u.strength.value = on > 0 ? on : 0;
    this.pass(r, this.add, this.renderToScreen ? null : writeBuffer);
  }
  dispose() { this.a?.dispose(); this.b?.dispose(); for (const m of [this.mask, this.blur, this.add]) m.dispose(); this.quad.dispose(); }
}

// Depth of field (v.focus = { at, range, depth, blur }): what's `at` metres away (give or take
// `range`) stays sharp, the rest goes soft, fully so `depth` x `at` metres nearer or further on; blur
// is the widest blur in pixels. A pass of its own, reading the depth picture the ambient occlusion
// already draws (so high and ultra only, and no second scene draw). See-through things (leaf cards)
// aren't in that picture: they take the depth of what's behind them.
// With v.lens (lens.js) the blur is a real lens's instead (phys: pixels of blur per dioptre, the focus in dioptres, the
// widest blur, on), and the sky is as far as can be; WebGPU draws it with bokeh discs (hd3d-gpu-lens.js), this is the fallback.
// A lens's blur can be 40 pixels across on a phone, where 16 taps of the sharp picture leave a bright lamp as a ring of
// dots: so it reads a copy at half size whose smaller sizes (mipmaps) are made by the chip, each tap from the size
// whose texels are as wide as the gaps between taps. That copy holds only what is itself out of focus (colour times
// how soft it is, and how soft it is), so a sharp thing never bleeds into the blur round it.
const DOF_PRE = `uniform sampler2D tDiffuse, tDepth; uniform vec4 phys; uniform float cn, cf; varying vec2 vUv;
  void main(){ float d = texture2D(tDepth, vUv).x, z = d >= 1. ? 1e9 : cn * cf / (cf - d * (cf - cn));
    float r = min(abs(phys.x * (phys.y - 1. / z)), phys.z), w = smoothstep(.5, 2.5, r);
    gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb * w, w); }`;
const DOF = `uniform sampler2D tDiffuse, tDepth, tPre; uniform vec2 px; uniform vec4 lens, phys; uniform float cn, cf; varying vec2 vUv;
  float dist(vec2 uv){ float d = texture2D(tDepth, uv).x; return d >= 1. ? (phys.w > .5 ? 1e9 : 0.) : cn * cf / (cf - d * (cf - cn)); }
  float coc(float z){ if (phys.w > .5) return clamp(abs(phys.x * (phys.y - 1. / z)) / phys.z, 0., 1.);
    return z <= 0. ? 0. : clamp((abs(z - lens.x) - lens.y) / max(lens.x * lens.z, 1e-3), 0., 1.); }
  void main(){ vec3 base = texture2D(tDiffuse, vUv).rgb; float z = dist(vUv), c = coc(z);
    if (c * lens.w < .5) { gl_FragColor = vec4(base, 1.); return; }
    if (phys.w > .5) {   // a lens: 24 taps of the half-size copy, at the size that fills the gaps between them
      float R = c * lens.w, lod = max(0., log2(R * .36 * .5));
      vec3 sum = base; float wsum = 1.;
      for (int i = 1; i < 24; i++) { float r = sqrt(float(i) / 23.) * .82, a = float(i) * 2.39996;
        vec2 o = vec2(cos(a), sin(a)) * r * R * px; float zs = dist(vUv + o);
        float w = zs < z ? coc(zs) : 1.;   // a sharp thing in front doesn't smear over a soft background
        vec4 s = textureLod(tPre, vUv + o, lod); sum += s.rgb * w; wsum += s.a * w; }
      gl_FragColor = vec4(sum / wsum, 1.); return; }
    vec3 sum = base; float wsum = 1.;
    for (int i = 1; i < 16; i++) { float r = sqrt(float(i) / 15.), a = float(i) * 2.39996;
      vec2 o = vec2(cos(a), sin(a)) * r * c * lens.w * px; float zs = dist(vUv + o), cs = coc(zs);
      float w = zs > 0. && zs < z ? cs : 1.;   // a sharp thing in front doesn't smear over a soft background
      sum += texture2D(tDiffuse, vUv + o).rgb * w; wsum += w; }
    gl_FragColor = vec4(sum / wsum, 1.); }`;
// v.lens's autofocus: the distance at nine points round the spot, as log2(metres) in two bytes, and the sky (lens.js afTake)
const AF_FS = `uniform sampler2D tDepth; uniform float cn, cf; uniform vec4 af; varying vec2 vUv;
  void main(){ float d = texture2D(tDepth, af.xy + (vUv - .5) * 2. * af.zw).x, z = cn * cf / (cf - min(d, .999999) * (cf - cn));
    float n = clamp((log2(z) - (${AF_LOG[0]}.)) / ${AF_LOG[1]}., 0., 1.) * 65535., hi = floor(n / 256.);
    gl_FragColor = vec4(hi / 255., (n - hi * 256.) / 255., d >= 1. ? 1. : 0., 1.); }`;
class DofPass extends Pass {
  constructor() {
    super(); this.needsSwap = true;
    this.mat = qmat(DOF, { tDiffuse: { value: null }, tDepth: { value: null }, tPre: { value: null }, px: { value: new Vector2() }, lens: { value: new Vector4() }, phys: { value: new Vector4() }, cn: { value: .1 }, cf: { value: 1000 } });
    this.quad = new FullScreenQuad(this.mat); this.pre = null; this.preM = null;
    this.view = null; this.af = null;   // (v.lens with focus 'auto': the view, and its lens numbers)
  }
  render(r, writeBuffer, readBuffer) {
    const u = this.mat.uniforms; u.tDiffuse.value = readBuffer.texture; u.px.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    const L = this.af;
    if (L && this.view) this.view.lensRead(() => {
      const M = this.afM ||= { rt: new WebGLRenderTarget(3, 3, { depthBuffer: false }), mat: qmat(AF_FS, { tDepth: { value: null }, cn: { value: .1 }, cf: { value: 1000 }, af: { value: new Vector4() } }), px: new Uint8Array(36) };
      M.quad ||= new FullScreenQuad(M.mat);
      const a = M.mat.uniforms; a.tDepth.value = u.tDepth.value; a.cn.value = u.cn.value; a.cf.value = u.cf.value;
      a.af.value.set(L.spot[0], 1 - L.spot[1], .025 * readBuffer.height / Math.max(1, readBuffer.width), .025);
      r.setRenderTarget(M.rt); M.quad.render(r);
      return r.readRenderTargetPixelsAsync(M.rt, 0, 0, 3, 3, M.px);
    });
    if (u.phys.value.w > .5) {   // (a lens: the half-size copy of what is out of focus, its smaller sizes made as it is drawn)
      const w = Math.max(1, readBuffer.width >> 1), h = Math.max(1, readBuffer.height >> 1);
      if (this.pre?.width !== w || this.pre?.height !== h) { this.pre?.dispose(); this.pre = new WebGLRenderTarget(w, h, { type: HalfFloatType, depthBuffer: false, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter }); }
      const m = this.preM ||= qmat(DOF_PRE, { tDiffuse: { value: null }, tDepth: { value: null }, phys: { value: new Vector4() }, cn: { value: .1 }, cf: { value: 1000 } }), a = m.uniforms;
      a.tDiffuse.value = readBuffer.texture; a.tDepth.value = u.tDepth.value; a.phys.value.copy(u.phys.value); a.cn.value = u.cn.value; a.cf.value = u.cf.value;
      this.quad.material = m; r.setRenderTarget(this.pre); this.quad.render(r); this.quad.material = this.mat;
      u.tPre.value = this.pre.texture;
    } else u.tPre.value = null;
    r.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(r);
  }
  dispose() { this.mat.dispose(); this.quad.dispose(); this.pre?.dispose(); this.preM?.dispose(); if (this.afM) { this.afM.rt.dispose(); this.afM.mat.dispose(); this.afM.quad?.dispose(); } }
}

// Volumetric light (v.beams = { light, density, far, glow, strength }): light seen in the air, with the
// shadows cutting it into beams (sun through trees or a window, a lamp's cone in a dusty room). Each
// pixel steps along its view ray (`steps`, 24 by default, jittered, to the surface or `far` metres), asks the
// light's shadow map at each step whether the light reaches there, and adds up how much air is lit,
// weighted toward looking at the light (a Henyey-Greenstein phase, glow 0..0.9). Drawn at half size, then
// softened and added on top in the light's colour. The same steps as three.js's GodraysNode (from
// three-good-godrays), written out for both renderers so WebGL and WebGPU draw the same beams and
// keep working when the kit resizes a shadow map. Sun and spot lights; high and ultra (it reads the
// depth the ambient occlusion draws), and only where the light has shadows (no shadows: plain glowing air).
const VOL_MAX = 48;
const VOL = `uniform sampler2D tDepth; uniform highp sampler2DShadow tShadow; uniform mat4 shadowM, invProj, camWorld; uniform vec3 camPos, lDir, lPos;
  uniform vec4 lt; uniform float density, far, g, hasShadow, steps; varying vec2 vUv;
  // lt: kind (0 sun, 1 spot), the cone's edge and full cosines, the spot's reach
  float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
  void main(){
    float d = texture2D(tDepth, vUv).x;
    vec4 v = invProj * vec4(vUv * 2. - 1., d * 2. - 1., 1.); v /= v.w;
    vec3 rd = (camWorld * vec4(v.xyz, 1.)).xyz - camPos; float L = length(rd); rd /= max(L, 1e-4);
    L = d >= 1. ? far : min(L, far);
    float dt = L / steps, t = dt * ign(gl_FragCoord.xy), sum = 0.;
    for (int i = 0; i < ${VOL_MAX}; i++) { if (float(i) >= steps) break;
      vec3 p = camPos + rd * t; vec4 s = shadowM * vec4(p, 1.); s.xyz /= s.w;
      bool inside = s.w > 0. && all(greaterThanEqual(s.xyz, vec3(0.))) && all(lessThanEqual(s.xyz, vec3(1.)));
      float lit = inside && hasShadow > .5 ? texture(tShadow, s.xyz) : 1.;
      vec3 toL = -lDir;
      if (lt.x > .5) { vec3 q = p - lPos; float dl = length(q); q /= max(dl, 1e-4); toL = -q; lit *= smoothstep(lt.y, lt.z, dot(q, lDir)) / (1. + dl * dl / (lt.w * lt.w)); }
      float c = dot(rd, toL);
      sum += lit * (1. - g * g) / pow(1. + g * g - 2. * g * c, 1.5) * .25; t += dt;
    }
    gl_FragColor = vec4(1. - exp(-density * L * sum / steps), 0., 0., 1.); }`;
const VOL_ADD = `uniform sampler2D tDiffuse, tVol; uniform vec2 vpx; uniform vec3 tint; varying vec2 vUv;
  void main(){ float a = texture2D(tVol, vUv + vpx * vec2(-1, -1)).r + texture2D(tVol, vUv + vpx * vec2(1, -1)).r
    + texture2D(tVol, vUv + vpx * vec2(-1, 1)).r + texture2D(tVol, vUv + vpx * vec2(1, 1)).r;
    gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb + tint * a * .25, 1.); }`;
/** The numbers both renderers draw v.beams with this frame (into v._bm), or null when there's no light to use. */
function beamsFrame(v) {
  const b = v.beams, L = b?.light || v.sun; if (!b || !L || !(L.isDirectionalLight || L.isSpotLight)) return null;
  const m = v._bm ||= { lDir: new Vector3(), lPos: new Vector3(), lt: new Vector4(), tint: new Color(), shadowM: null, map: null, density: 0, far: 0, g: 0, steps: 24 };
  L.updateMatrixWorld(); L.target.updateMatrixWorld();
  L.getWorldPosition(m.lPos); L.target.getWorldPosition(m.lDir); m.lDir.sub(m.lPos).normalize();
  const spot = !!L.isSpotLight, a = spot ? L.angle : 0;
  m.lt.set(spot ? 1 : 0, Math.cos(a), Math.cos(a * (1 - (L.penumbra || 0)) * .999), spot ? L.distance || 20 : 1); m.light = L;
  m.map = L.castShadow && L.shadow?.map?.depthTexture || null; m.shadowM = L.shadow.matrix;   // (the light's own: the renderer updates it when it redraws the map this frame)
  m.tint.copy(L.color).multiplyScalar(Math.max(0, b.strength ?? 1));
  m.density = Math.max(0, b.density ?? .02); m.far = Math.max(1, b.far ?? 60); m.g = Math.min(.9, Math.max(0, b.glow ?? .5)); m.steps = Math.round(Math.min(VOL_MAX, Math.max(4, b.steps ?? 24)));
  return m;
}
// froxel fog (v.fog3d, WebGPU: hd3d-gpu.js froxels): this frame's numbers for it
const FOG_C = new Color(), FOG_L = [];
function fogFrame(v) {
  const f = v.fog3d, m = v._fz ||= { colour: new Color(), ambient: new Color(), sunDir: new Vector3(0, 1, 0), sunCol: new Color(), shadow: null, shadowM: null, lamps: [], wind: [1, .4], t: 0 };
  m.near = v.cam.near; m.far = Math.max(5, f.far ?? 60); m.density = Math.max(0, f.density ?? .03); m.height = f.height ?? 0; m.falloff = Math.max(0, f.falloff ?? .15);
  m.noise = Math.min(1, Math.max(0, f.noise ?? .5)); m.g = Math.min(.9, Math.max(-.5, f.glow ?? .4)); m.wind = f.wind || m.wind; m.t = v.t;
  m.colour.set(f.colour ?? '#c8d0d8'); m.ambient.setScalar(f.ambient ?? .35);
  const L = v.sun;
  if (L?.isDirectionalLight && L.visible) {
    L.updateMatrixWorld(); L.target.updateMatrixWorld(); L.getWorldPosition(m.sunDir); L.target.getWorldPosition(GV); m.sunDir.sub(GV).normalize();
    m.sunCol.copy(L.color).multiplyScalar(L.intensity * (f.strength ?? 1) * 4);
    m.shadow = L.castShadow && L.shadow?.map?.depthTexture || null; m.shadowM = L.shadow.matrix;
  } else { m.sunCol.setRGB(0, 0, 0); m.shadow = null; }
  // the nearest lit lamps (point and spot lights), up to 8
  FOG_L.length = 0; const cp = CW.setFromMatrixPosition(v.cam.matrixWorld);   // (where the frame's matrices put it, as the lamps are: origin.js)
  if (f.lamps !== false) eachShown(v.scene, o => { if ((o.isPointLight || o.isSpotLight) && o.intensity > 0) FOG_L.push(o); });
  if (FOG_L.length > 8) FOG_L.sort((a, b) => a.getWorldPosition(GV).distanceToSquared(cp) - b.getWorldPosition(GW).distanceToSquared(cp));
  const n = Math.min(8, FOG_L.length);
  while (m.lamps.length < n) m.lamps.push({ p: new Vector4(), c: new Vector4() });
  m.lamps.length = n;
  for (let i = 0; i < n; i++) { const o = FOG_L[i]; o.getWorldPosition(GV); m.lamps[i].p.set(GV.x, GV.y, GV.z, o.distance || 10); FOG_C.copy(o.color).multiplyScalar(o.intensity * (f.strength ?? 1)); m.lamps[i].c.set(FOG_C.r, FOG_C.g, FOG_C.b, 0); }
  return m;
}
// ray traced reflections (hd3d-gpu-trace.js): what lights a spot a ray hit that the camera can't see. The sun,
// the sky's light, the nearest lamps (point and spot lights, up to 8) and the scene's fog
const TR_L = [], seenIn = (o, scene) => { for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === scene) return true; } return false; };
function traceLights(v, list) {
  const m = v._trl ||= { far: 120, sunDir: new Vector3(0, 1, 0), sunCol: new Color(), sky: new Color(), ground: new Color(), envI: 1, fogCol: new Color(), fogK: 0, lamps: [] };
  m.far = Math.min(v.cam.far, 500); m.envI = v.scene.environmentIntensity ?? 1;
  let sun = v.sun?.isDirectionalLight && v.sun.visible && v.sun.intensity > 0 ? v.sun : null;
  m.sky.setRGB(0, 0, 0); m.ground.setRGB(0, 0, 0); TR_L.length = 0;
  for (const o of list) {
    if (!(o.intensity > 0) || !seenIn(o, v.scene)) continue;
    if (o.isPointLight || o.isSpotLight) TR_L.push(o);
    else if (o.isHemisphereLight) { m.sky.r += o.color.r * o.intensity; m.sky.g += o.color.g * o.intensity; m.sky.b += o.color.b * o.intensity; m.ground.r += o.groundColor.r * o.intensity; m.ground.g += o.groundColor.g * o.intensity; m.ground.b += o.groundColor.b * o.intensity; }
    else if (o.isAmbientLight) { FOG_C.copy(o.color).multiplyScalar(o.intensity); m.sky.add(FOG_C); m.ground.add(FOG_C); }
    else if (o.isDirectionalLight && !sun && o.name !== 'sun-near') sun = o;
  }
  if (sun) { sun.getWorldPosition(m.sunDir); sun.target.getWorldPosition(GV); m.sunDir.sub(GV).normalize(); m.sunCol.copy(sun.color).multiplyScalar(sun.intensity); } else m.sunCol.setRGB(0, 0, 0);
  const f = v.scene.fog; if (f?.isFogExp2) { m.fogCol.copy(f.color); m.fogK = f.density; } else m.fogK = 0;
  const cp = CW.setFromMatrixPosition(v.cam.matrixWorld);
  if (TR_L.length > 8) TR_L.sort((a, b) => a.getWorldPosition(GV).distanceToSquared(cp) - b.getWorldPosition(GW).distanceToSquared(cp));
  const n = Math.min(8, TR_L.length);
  while (m.lamps.length < n) m.lamps.push({ p: new Vector4(), c: new Vector4(), d: new Vector4(), k: new Vector4() });
  m.lamps.length = n;
  for (let i = 0; i < n; i++) {
    const o = TR_L[i], l = m.lamps[i]; o.getWorldPosition(GV); l.p.set(GV.x, GV.y, GV.z, o.distance || 0);
    l.c.set(o.color.r * o.intensity, o.color.g * o.intensity, o.color.b * o.intensity, o.decay ?? 2);
    if (o.isSpotLight) { o.target.getWorldPosition(GW).sub(GV).normalize(); l.d.set(GW.x, GW.y, GW.z, 0); l.k.set(Math.cos(o.angle), Math.cos(o.angle * (1 - (o.penumbra || 0))), 1, 0); }
    else { l.d.set(0, -1, 0, 0); l.k.set(-1, 1, 0, 0); }
  }
  return m;
}
class BeamsPass extends Pass {
  constructor() {
    super(); this.needsSwap = true; this.a = null;
    this.vol = qmat(VOL, { tDepth: { value: null }, tShadow: { value: null }, shadowM: { value: new Matrix4() }, invProj: { value: new Matrix4() }, camWorld: { value: new Matrix4() },
      camPos: { value: new Vector3() }, lDir: { value: new Vector3() }, lPos: { value: new Vector3() }, lt: { value: new Vector4() }, density: { value: 0 }, far: { value: 60 }, g: { value: .5 }, hasShadow: { value: 0 }, steps: { value: 24 } });
    this.add = qmat(VOL_ADD, { tDiffuse: { value: null }, tVol: { value: null }, vpx: { value: new Vector2() }, tint: { value: new Color() } });
    this.quad = new FullScreenQuad(null);
  }
  setSize(w, h) {
    const bw = Math.max(8, Math.round(w / 2)), bh = Math.max(8, Math.round(h / 2));
    if (this.a?.width === bw && this.a?.height === bh) return;
    this.a?.dispose(); this.a = new WebGLRenderTarget(bw, bh, { type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter });
  }
  /** m: beamsFrame(); depth: the camera's depth picture; cam: the camera. */
  aim(m, depth, cam) {
    const u = this.vol.uniforms;
    u.tDepth.value = depth; u.tShadow.value = m.map; u.hasShadow.value = m.map ? 1 : 0; u.shadowM.value = m.shadowM;
    u.invProj.value.copy(cam.projectionMatrixInverse); u.camWorld.value.copy(cam.matrixWorld); cam.getWorldPosition(u.camPos.value);
    u.lDir.value.copy(m.lDir); u.lPos.value.copy(m.lPos); u.lt.value.copy(m.lt); u.density.value = m.density; u.far.value = m.far; u.g.value = m.g; u.steps.value = m.steps;
    this.add.uniforms.tint.value.copy(m.tint);
  }
  render(r, writeBuffer, readBuffer) {
    this.quad.material = this.vol; r.setRenderTarget(this.a); this.quad.render(r);
    const u = this.add.uniforms; u.tDiffuse.value = readBuffer.texture; u.tVol.value = this.a.texture; u.vpx.value.set(1 / this.a.width, 1 / this.a.height);
    this.quad.material = this.add; r.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(r);
  }
  dispose() { this.a?.dispose(); this.vol.dispose(); this.add.dispose(); this.quad.dispose(); }
}

// Motion blur (v.motionBlur = { amount, max, sharp }): each pixel is smeared along how far it moved on
// screen since the last frame as the camera turned and moved, found from its depth and the camera's
// last frame (so the world blurs in a fast turn or at speed). amount: how much of that move (0.5 = a
// half-frame shutter); max: the longest smear, as a part of the screen's width; sharp: things nearer
// than this many metres stay sharp (the car or hands the camera carries move with it). Camera motion
// only, the same on WebGL and WebGPU (things moving by themselves don't blur: that needs each object's
// own motion, which WebGL doesn't draw). High and ultra (it reads the ambient occlusion's depth).
const MB_N = 8;
const MB = `uniform sampler2D tDiffuse, tDepth; uniform mat4 invProj, camWorld, prevVP; uniform vec4 mb; uniform vec2 px; varying vec2 vUv;
  // mb: amount, max (screen widths), sharp (metres), aspect
  void main(){ vec3 base = texture2D(tDiffuse, vUv).rgb; float d = texture2D(tDepth, vUv).x;
    vec4 v = invProj * vec4(vUv * 2. - 1., d * 2. - 1., 1.); v /= v.w;
    vec4 pc = prevVP * (camWorld * vec4(v.xyz, 1.)); vec2 pu = pc.xy / max(pc.w, 1e-4) * .5 + .5;
    vec2 vel = (vUv - pu) * mb.x; vec2 vs = vel * vec2(mb.w, 1.); float l = length(vs), mx = mb.y * mb.w;
    if (pc.w <= 0.) vel = vec2(0.); else if (l > mx) vel *= mx / l;
    vel *= d >= 1. ? 1. : smoothstep(mb.z, mb.z * 1.5 + .01, -v.z);
    if (length(vel / px) < .75) { gl_FragColor = vec4(base, 1.); return; }
    vec3 sum = vec3(0.);
    for (int i = 0; i < ${MB_N}; i++) sum += texture2D(tDiffuse, vUv + vel * (float(i) / ${MB_N - 1}. - .5)).rgb;
    gl_FragColor = vec4(sum / ${MB_N}., 1.); }`;
/** The numbers both renderers blur with this frame (into v._mbm): call once per frame before drawing. cut: the camera jumped. */
function blurFrame(v, cut) {
  const b = v.motionBlur, cam = v.cam, m = v._mbm ||= { prev: new Matrix4(), cur: new Matrix4(), prevVP: new Matrix4(), has: false, mb: new Vector4() };
  cam.updateMatrixWorld(); m.cur.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  m.prevVP.copy(m.has && !cut ? m.prev : m.cur); m.prev.copy(m.cur); m.has = true;
  if (!b) return null;
  m.mb.set(Math.max(0, v._ls?.mb ?? b.amount ?? .5), Math.max(0, b.max ?? .04), Math.max(0, b.sharp ?? 0), v.W / v.H);
  m.obj = b.objects !== false && !cut && m.had ? 1 : 0; m.had = true;   // (WebGPU: each thing's own move, not just the camera's)
  return m;
}
class BlurPass extends Pass {
  constructor() {
    super(); this.needsSwap = true;
    this.mat = qmat(MB, { tDiffuse: { value: null }, tDepth: { value: null }, invProj: { value: new Matrix4() }, camWorld: { value: new Matrix4() }, prevVP: { value: new Matrix4() }, mb: { value: new Vector4() }, px: { value: new Vector2() } });
    this.quad = new FullScreenQuad(this.mat);
  }
  aim(m, depth, cam) { const u = this.mat.uniforms; u.tDepth.value = depth; u.invProj.value.copy(cam.projectionMatrixInverse); u.camWorld.value.copy(cam.matrixWorld); u.prevVP.value.copy(m.prevVP); u.mb.value.copy(m.mb); }
  render(r, writeBuffer, readBuffer) {
    const u = this.mat.uniforms; u.tDiffuse.value = readBuffer.texture; u.px.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    r.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(r);
  }
  dispose() { this.mat.dispose(); this.quad.dispose(); }
}

// Ambient occlusion and reflections draw their own depth + normals picture of the scene with one
// plain material, so anything see-through came out as a solid wall: Suit Ops' light shafts (and any
// glow, blob shadow, rotor blur or contact-shadow plane) became dark bands fixed to the camera, and
// leaf and fern cards (alpha-cut) became dark squares. Only solid, opaque surfaces go into that
// picture now. A game can also keep a mesh out with mesh.userData.noAO = true.
function seeThrough3d(o) {
  if (o.isPoints || o.isLine || o.isLine2 || o.isSprite || o.userData.noAO) return true;
  if (!o.isMesh) return false;
  const ms = Array.isArray(o.material) ? o.material : [o.material];
  return ms.some(m => m && (m.transparent || !m.depthWrite || m.alphaTest > 0 || m.alphaMap || m.blending !== NormalBlending));
}
function hideSeeThrough(scene, cache) {
  eachShown(scene, o => { if (seeThrough3d(o)) cache.push(o); });
  for (const o of cache) o.visible = false;
}
function aoHide() { hideSeeThrough(this.scene, this._visibilityCache); }
// A crowd (gs.props.Crowd) is posed by a shader of its own, which such a one-material picture knows nothing of:
// it draws nothing with another's material, and draws itself into the picture afterwards. how: 'normal' | 'black'.
function drawPosed(scene, r, cam, rt, how) { const s = scene.userData.gsPosed; if (s) for (const c of s) c.drawPosed(r, cam, rt, how); }
function chain(r, w, h) {
  const T = tier();
  if (comp && compKey !== T.msaa) {   // MSAA on/off: re-create just the two buffers
    compKey = T.msaa;
    for (const rt of [comp.renderTarget1, comp.renderTarget2]) { rt.dispose(); rt.samples = T.msaa; }
  }
  if (!comp) {
    compKey = T.msaa;
    const rt = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: T.msaa, depthTexture: new DepthTexture(w, h) });   // depth: SGSR 2 reads it
    comp = new EffectComposer(r, rt);
    P.render = new RenderPass(new Scene(), new PerspectiveCamera());
    P.ao = new GTAOPass(new Scene(), new PerspectiveCamera(), w, h);
    P.ao.updateGtaoMaterial({ radius: .6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 }); P.ao.blendIntensity = .9;
    P.ao._overrideVisibility = aoHide;
    const aoOver = P.ao._renderOverride.bind(P.ao); P.ao._renderOverride = (r0, m, t, cc, ca) => { aoOver(r0, m, t, cc, ca); drawPosed(P.ao.scene, r0, P.ao.camera, t, 'normal'); };
    // the AO is worked out at the tier's fraction of the picture (half size on high) and blended back up
    const aoSize = P.ao.setSize.bind(P.ao); P.ao.scale = 1;
    P.ao.setSize = (w, h) => { P.ao.fw = w; P.ao.fh = h; aoSize(Math.max(1, Math.round(w * P.ao.scale)), Math.max(1, Math.round(h * P.ao.scale))); };
    P.final = new FinalPass();
    for (const p of [P.render, P.ao, P.final]) comp.addPass(p);
    comp.setSize(w, h); comp.cw = w; comp.ch = h;
  }
  return comp;
}

// See-through chain for AR games (src/kit/ar3d.js): the camera picture is drawn first, so the 3D
// frame keeps a transparent background. Just the scene (with MSAA) and tone mapping: bloom and the
// colour grade would also tint the real world behind it.
let arComp = null, arKey = '';
function seeThrough(r, w, h) {
  const T = tier();
  if (arComp && arKey !== T.msaa) { arKey = T.msaa; for (const rt of [arComp.renderTarget1, arComp.renderTarget2]) { rt.dispose(); rt.samples = T.msaa; } }
  if (!arComp) {
    arKey = T.msaa;
    arComp = new EffectComposer(r, new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: T.msaa }));
    P.arRender = new RenderPass(new Scene(), new PerspectiveCamera(), null, new Color(0), 0);
    P.arOut = new OutputPass();
    arComp.addPass(P.arRender); arComp.addPass(P.arOut);
    arComp.setSize(w, h); arComp.cw = w; arComp.ch = h;
  }
  return arComp;
}

/* ---------- materials and procedural textures ---------- */
/**
 * A PBR material. col: base colour; rough/metal 0..1; glow: emissive strength (values above 1
 * bloom); tex: a surface() set; rep: texture repeat [u, v]. Extra options pass to three.js.
 */
export function pbr(col = '#ffffff', { rough = .6, metal = 0, glow = 0, glowCol, tex, rep, clear = 0, sss, depth = 0, aniso = 0, anisoDir = 0, film = 0, glass, wet = 0, porosity, ...o } = {}) {
  const M = clear || o.sheen || sss || aniso || film || glass || wet ? MeshPhysicalMaterial : MeshStandardMaterial;
  const m = new M({ color: col, roughness: rough, metalness: metal, ...o });
  if (clear) { m.clearcoat = clear; m.clearcoatRoughness = .15; }
  // richer surfaces, all three.js's own physical material (both backends):
  // aniso: brushed metal, hair, satin, a CD's streaks (highlights stretched along anisoDir, radians)
  if (aniso) { m.anisotropy = aniso; m.anisotropyRotation = anisoDir; }
  // film: a thin rainbow film (soap bubbles, oil on water, beetle shells, tempered metal)
  if (film) { m.iridescence = film; m.iridescenceIOR = 1.3; m.iridescenceThicknessMinimum = 120; m.iridescenceThicknessMaximum = 480; }
  // glass: light through it, bent (true or { thickness, ior, tint }); costs a picture of what's behind
  if (glass) { const g = glass === true ? {} : glass; m.transmission = 1; m.thickness = g.thickness ?? .3; m.ior = g.ior ?? 1.5; m.attenuationColor = new Color(g.tint ?? '#ffffff'); m.attenuationDistance = g.distance ?? (g.tint ? .5 : Infinity); if (o.roughness === undefined && rough === .6) m.roughness = .05; }
  // wet (0..1): rain on a surface, as Lagarde's wet surfaces: darker where porous, smoother, and a water film on top
  if (wet) { const k = Math.min(1, wet), por = porosity ?? 1 - metal; m.color.multiplyScalar(1 - .45 * k * por); m.roughness = m.roughness * (1 - .7 * k); m.clearcoat = Math.max(m.clearcoat, k); m.clearcoatRoughness = .05; }
  // subsurface scattering (skin, wax, leaves, jade, ears against the light): light passing through and
  // glowing out the far side. WebGPU: three.js's MeshSSSNodeMaterial (fast translucency, Barré-Brisebois
  // and Bouchard, as in Frostbite); WebGL phones get a soft tinted rim (sheen) in its place.
  if (sss) {
    const S = m.userData.sss = { colour: new Color(sss.colour ?? sss.color ?? '#ff5a3c'), power: sss.power ?? 3, scale: sss.scale ?? 1, distortion: sss.distortion ?? .2, ambient: sss.ambient ?? .02, attenuation: sss.attenuation ?? .35, thin: !!sss.thin, back: sss.back ?? .8, skin: sss.skin || false };
    m.userData.gsGpu = 'sss'; if (!o.sheen) { m.sheen = .5; m.sheenColor = S.colour.clone(); m.sheenRoughness = .7; }
  }
  if (glow) { m.emissive = new Color(glowCol || col); m.emissiveIntensity = glow; }
  if (tex) {
    const t = rep ? tex.repeat(rep[0], rep[1]) : tex;
    m.map = t.map; m.normalMap = t.normal; m.roughnessMap = t.rough; if (t.metal) { m.metalnessMap = t.metal; }
    m.normalScale.set(t.ns ?? 1, t.ns ?? 1);
    // depth (in texture widths, e.g. .04): parallax occlusion mapping on WebGPU, the bumps' raised parts
    // standing up and hiding what's behind them as you look across the surface (bricks, cobbles, planks);
    // WebGL keeps the normal map's shading. Not with sss (one or the other).
    if (depth > 0 && t.height && !sss) { m.userData.pom = { height: t.height, depth }; m.userData.gsGpu = 'pom'; }
  }
  return m;
}
// Pictures the kit paints in code to put on things are painted in the phone's memory, not on the chip
// (willReadFrequently keeps a canvas there). Handing a canvas painted on the chip to WebGPU makes the
// main thread wait for the chip's process to finish its picture first, and that process is busy drawing
// frames: on the test machine each 128 x 128 surface uploaded in the middle of a Long Shadow round held
// the main thread for about a second (20 ms with nothing else drawing); from memory the same upload is a
// copy of its pixels, a fifth of a millisecond. (The painting itself costs about the same either way.)
const CPU = { willReadFrequently: true };
/**
 * Make a tiling surface texture set in code (no image files). paint(g) draws three layers on
 * size x size canvases: g.col (colour), g.h (height: white = raised), g.r (roughness: white =
 * rough). The kit turns the height layer into a normal map. Returns { map, normal, rough,
 * repeat(u, v) } where repeat() returns a copy with that tiling.
 */
export function surface(size, paint, { strength = 2.5, metal = false, worker = null } = {}) {
  // (worker, kit use: ['recipe', data], a job that paints the same layers as paint() off the main thread)
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const C = mk(), Hc = mk(), Rc = mk(), N = mk(), g = { col: C.getContext('2d', CPU), h: Hc.getContext('2d', CPU), r: Rc.getContext('2d', CPU), size };
  N.getContext('2d', CPU);
  g.h.fillStyle = '#808080'; g.h.fillRect(0, 0, size, size); g.r.fillStyle = '#999'; g.r.fillRect(0, 0, size, size);
  const Mc = metal ? mk() : null; if (Mc) { g.m = Mc.getContext('2d', CPU); g.m.fillStyle = '#000'; g.m.fillRect(0, 0, size, size); }   // (metal: white = metal; its blue is what three reads)
  const tx = (cv, srgb, pack = true) => { const t = new CanvasTexture(cv); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace; t.anisotropy = 4; t.minFilter = LinearMipmapLinearFilter; if (pack) t.userData.gsPack = srgb ? 'srgb' : 'linear'; return t; };
  // core: what every copy of this set shares. nf (the normals as numbers) and rd (the roughness pixels)
  // are there once the number work is done; until then `wait` is its promise and `open` every texture
  // made so far, to be marked changed when the pixels arrive.
  const core = { size, strength, nf: null, rd: null, wait: null, open: [], g, N };
  const base = { map: tx(C, true), normal: tx(N), rough: tx(Rc, false, false), height: tx(Hc), size, core, ...(Mc ? { metal: tx(Mc) } : {}), canvases: { col: C, h: Hc, r: Rc, ...(Mc ? { m: Mc } : {}) } };
  for (const k of TEX) if (base[k]) core.open.push([k, base[k]]);
  noteHeight(base.normal, base.height, core);   // (which height picture a material's bumps came from, and whether it is painted yet: real surface detail reads it, relief.js)
  // The number work (height -> normal map, rougher small copies of the roughness map) is four fifths of
  // a surface's cost. While a card loads it goes to a background worker and the card waits for it
  // (slices.js later()); anywhere else, or with no workers, it is done here and now.
  const off = loading() && canRunJob();
  if (off && worker) core.wait = runJob(worker[0], { ...worker[1], strength });   // (painted there too)
  else {
    paint(g);
    // (reading the two layers back is put off too, a few surfaces a frame: slices.js after())
    if (off) core.wait = after(() => { if (core.nf) return null; const hd = g.h.getImageData(0, 0, size, size).data, rd = g.r.getImageData(0, 0, size, size).data; return runJob('surface', { hd, rd, size, strength }, [hd.buffer, rd.buffer]); });
  }
  if (core.wait) {
    core.paint = worker ? paint : null;
    core.wait = core.wait.then(r => bakeDone(core, r), () => bakeDone(core, null));
    if (!later(core.wait)) bakeDone(core, null);
  } else bakeDone(core, surfaceMath(g.h.getImageData(0, 0, size, size).data, g.r.getImageData(0, 0, size, size).data, size, strength));
  const set = (u, v, b = base) => {
    if (u === 1 && v === 1) return { ...b, repeat: set };
    const cl = {}; for (const k of TEX) { if (!b[k]) continue; cl[k] = b[k].clone(); cl[k].repeat.set(u, v); cl[k].needsUpdate = true; if (core.open) core.open.push([k, cl[k]]); }
    noteHeight(cl.normal, cl.height, core);
    return { ...cl, core, repeat: set };
  };
  return { ...base, repeat: set };
}
const TEX = ['map', 'normal', 'rough', 'height', 'metal'];
// a surface's number work is in (r), or couldn't be done in a worker (null: done here from the canvases)
function bakeDone(core, r) {
  if (core.nf) return;
  const { size, g, N } = core, put = (ctx, d) => ctx.putImageData(new ImageData(d, size, size), 0, 0);
  if (!r) { if (core.paint) core.paint(g); r = surfaceMath(g.h.getImageData(0, 0, size, size).data, g.r.getImageData(0, 0, size, size).data, size, core.strength); }
  else if (r.layers) { put(g.col, r.layers.col); put(g.h, r.layers.h); put(g.r, r.layers.r); if (g.m) put(g.m, r.layers.m); }   // (painted in the worker)
  put(N.getContext('2d'), r.out);
  core.nf = r.nf; core.rd = r.rd;
  const mips = r.mips && mipCanvases(r.mips);
  for (const [k, t] of core.open) { if (k === 'rough' && mips) { t.mipmaps = [t.image, ...mips]; t.generateMipmaps = false; } t.needsUpdate = true; }
  core.open = core.wait = core.paint = null;
}
// the roughness map's smaller copies (surface-math.js) as canvases, the way three takes mipmaps
function mipCanvases(mips) {
  return mips.map(d => { const s = Math.sqrt(d.length / 4), cv = document.createElement('canvas'); cv.width = cv.height = s; cv.getContext('2d', CPU).putImageData(new ImageData(d, s, s), 0, 0); return cv; });
}
// a set whose number work is in (done here and now if a worker still has it: detail() needs the numbers)
function baked(set) { const core = set.core; if (core && !core.nf) bakeDone(core, null); return core; }
/**
 * Detail normals: a fine surface's bumps laid over a big one's, `times` repeats of the fine one across the
 * big one (pores on skin, weave on cloth, grain on wood, scratches on metal), so a surface stays detailed
 * close up without a bigger texture. The two normal maps are blended once, here, the way game engines
 * blend detail normals ("whiteout" blending), so it costs nothing per frame on either backend.
 * Returns a surface set like surface()'s.
 */
export function detail(big, fine, { times = 4, strength = .7 } = {}) {
  const bc = baked(big), fc = baked(fine);
  const n = big.size, A = bc.nf, B = fc.nf, m = fine.size, out = new Float32Array(n * n * 3);
  const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d', CPU), im = x.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let X = 0; X < n; X++) {
    const i = (y * n + X) * 3, fx = Math.floor(X * times * m / n) % m, fy = Math.floor(y * times * m / n) % m, j = (fy * m + fx) * 3;
    const bx = B[j] * strength, by = B[j + 1] * strength;
    let nx = A[i] + bx, ny = A[i + 1] + by, nz = A[i + 2] * (B[j + 2] * strength + 1 - strength); const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    out[i] = nx; out[i + 1] = ny; out[i + 2] = nz;
    const k = (y * n + X) * 4; im.data[k] = (nx * .5 + .5) * 255; im.data[k + 1] = (ny * .5 + .5) * 255; im.data[k + 2] = (nz * .5 + .5) * 255; im.data[k + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = NoColorSpace; t.anisotropy = 4; t.minFilter = LinearMipmapLinearFilter; t.userData.gsPack = 'linear';
  const rough = big.rough.clone(), mips = roughMipsMath(bc.rd, out, n);
  if (mips) { rough.mipmaps = [rough.image, ...mipCanvases(mips)]; rough.generateMipmaps = false; }
  const base = { ...big, normal: t, rough, core: { size: n, nf: out, rd: bc.rd, wait: null, open: null } };
  noteHeight(base.normal, base.height);
  const set = (u, v, b = base) => {
    if (u === 1 && v === 1) return { ...b, repeat: set };
    const cl = { ...b }; for (const k of ['map', 'normal', 'rough', 'height']) if (b[k]) { cl[k] = b[k].clone(); cl[k].repeat.set(u, v); cl[k].needsUpdate = true; }
    noteHeight(cl.normal, cl.height);
    return { ...cl, repeat: set };
  };
  return { ...base, repeat: set };
}
/** Speckle noise helper for surface painters: n dots of colour col, radius up to r. */
// The lens dirt for v.flare: smudges, specks and a few wipe marks, drawn once in code (no image file),
// seeded so every phone gets the same lens. Lit only where bright light falls on it.
let DIRT = null;
function lensDirt() {
  if (DIRT) return DIRT;
  const n = 512, c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d', CPU);
  let seed = 7; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.fillStyle = '#000'; x.fillRect(0, 0, n, n); x.globalCompositeOperation = 'lighter';
  const blob = (px, py, r, a, tint) => { const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(${tint},${a})`); g.addColorStop(1, `rgba(${tint},0)`); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); };
  for (let i = 0; i < 70; i++) blob(R() * n, R() * n, 12 + R() * 60, .05 + R() * .12, R() < .5 ? '255,236,210' : '210,230,255');   // smudges
  for (let i = 0; i < 260; i++) blob(R() * n, R() * n, 1 + R() * 4, .25 + R() * .5, '255,250,240');                                   // dust specks
  x.lineCap = 'round';
  for (let i = 0; i < 6; i++) { x.strokeStyle = `rgba(255,245,230,${.04 + R() * .05})`; x.lineWidth = 10 + R() * 26; x.beginPath(); const cx = R() * n, cy = R() * n, rr = 80 + R() * 200, a0 = R() * 6.28; x.arc(cx, cy, rr, a0, a0 + .6 + R()); x.stroke(); }   // wipe marks
  DIRT = new CanvasTexture(c); DIRT.colorSpace = NoColorSpace;
  return DIRT;
}
// Colour looks (v.lut): a 3D lookup table, the way films and big games grade their pictures. It
// changes the finished screen colours (after tone mapping), so any recipe of curves, tints and channel
// mixing costs one texture read. Made in code: a look's name, your own function, or the text of a
// .cube file pasted into the game (three.js's LUTCubeLoader reads it; the free looks online are .cube).
const L_LUM = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
const L_S = (x, k) => { const y = x - .5; return Math.min(1, Math.max(0, .5 + y * k / (1 + Math.abs(y) * (k - 1) * 2))); };   // S-curve round mid grey
const L_SAT = (c, l, k) => c.map(x => l + (x - l) * k);
const LOOKS = {
  film: (r, g, b) => { const l = L_LUM(r, g, b), w = L_S(l, 1.15), t = w * w * (3 - 2 * w); return L_SAT([r, g, b], l, 1.08).map((x, i) => L_S(x, 1.1) + [(t - .5) * .08, (t - .5) * .01, (.5 - t) * .09][i]); },   // teal shadows, warm highlights
  bleach: (r, g, b) => { const l = L_LUM(r, g, b); return L_SAT([r, g, b], l, .45).map(x => L_S(x * .5 + l * .5, 1.45)); },   // bleach bypass: hard, silvery, washed colour
  noir: (r, g, b) => { const l = L_S(L_LUM(r, g, b), 1.6); return [l, l, l * .97]; },
  sepia: (r, g, b) => { const l = L_S(L_LUM(r, g, b), 1.1); return [l * 1.07 + .03, l * .9 + .02, l * .7]; },
  warm: (r, g, b) => [r * 1.06 + .015, g * 1.01 + .005, b * .9],
  cold: (r, g, b) => [r * .9, g * .99 + .005, b * 1.07 + .02],
  faded: (r, g, b) => { const l = L_LUM(r, g, b); return L_SAT([r, g, b], l, .78).map(x => .07 + x * .86); },   // lifted blacks, softer colour
  vivid: (r, g, b) => { const l = L_LUM(r, g, b); return L_SAT([r, g, b], l, 1.3).map(x => L_S(x, 1.12)); },
  night: (r, g, b) => { const l = Math.pow(L_LUM(r, g, b), .7); return [l * .25, Math.min(1, l * 1.15 + .04), l * .3]; },   // night vision
};
const LUT_CACHE = new Map();
/** A colour look for v.lut: lut('film' | 'bleach' | 'noir' | 'sepia' | 'warm' | 'cold' | 'faded' | 'vivid' | 'night'),
 * lut((r, g, b) => [r, g, b]) with screen colours 0..1, or lut(cubeFileText). { size } (32) points per side. */
export function lut(look, { size = 32 } = {}) {
  if (look?.isData3DTexture) return look;
  const key = typeof look === 'string' ? look + '|' + size : null;
  if (key && LUT_CACHE.has(key)) return LUT_CACHE.get(key);
  let t;
  if (typeof look === 'string' && /LUT_3D_SIZE/.test(look)) t = new LUTCubeLoader().setType(UnsignedByteType).parse(look).texture3D;
  else {
    const f = typeof look === 'function' ? look : LOOKS[look];
    if (!f) throw new Error(`gs.hd.lut: no look called ${look} (${Object.keys(LOOKS).join(', ')})`);
    const n = size, d = new Uint8Array(n * n * n * 4);
    for (let b = 0, i = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++, i += 4) {
      const c = f(r / (n - 1), g / (n - 1), b / (n - 1));
      for (let k = 0; k < 3; k++) d[i + k] = Math.round(Math.min(1, Math.max(0, c[k])) * 255);
      d[i + 3] = 255;
    }
    t = new Data3DTexture(d, n, n, n); t.type = UnsignedByteType;
  }
  t.format = RGBAFormat; t.minFilter = t.magFilter = LinearFilter; t.generateMipmaps = false; t.unpackAlignment = 1; t.needsUpdate = true;
  if (key) LUT_CACHE.set(key, t);
  return t;
}
export function speckle(ctx, size, n, col, r = 1.5, a = .2) {
  ctx.save(); ctx.fillStyle = col;
  for (let i = 0; i < n; i++) { ctx.globalAlpha = Math.random() * a; ctx.beginPath(); ctx.arc(Math.random() * size, Math.random() * size, Math.random() * r + .3, 0, 7); ctx.fill(); }
  ctx.restore();
}

/* ---------- shared noise ---------- */
// A 256 x 256 picture of smooth noise that tiles, made once in code: r big soft shapes, g and b finer
// ones, a broad patches. Clouds, cloud shadows and patchy mist all read it.
let noiseT = null;
function tileNoise(size, base, oct, seed) {
  const out = new Float32Array(size * size); let amp = 1, st = seed * 7919 + 1;
  const R = () => { st = st + 0x6D2B79F5 | 0; let t = Math.imul(st ^ st >>> 15, 1 | st); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  for (let k = 0; k < oct; k++, amp *= .5) {
    const p = base << k, L = new Float32Array(p * p); for (let i = 0; i < L.length; i++) L[i] = R();
    for (let y = 0; y < size; y++) {
      const fy = y / size * p, yi = Math.floor(fy), ty = fy - yi, sy = ty * ty * (3 - 2 * ty), r0 = (yi % p) * p, r1 = ((yi + 1) % p) * p;
      for (let x = 0; x < size; x++) {
        const fx = x / size * p, xi = Math.floor(fx), tx = fx - xi, sx = tx * tx * (3 - 2 * tx), a = L[r0 + xi % p], b = L[r0 + (xi + 1) % p], c = L[r1 + xi % p], e = L[r1 + (xi + 1) % p];
        out[y * size + x] += (a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy) * amp;
      }
    }
  }
  let lo = Infinity, hi = -Infinity; for (const v of out) { if (v < lo) lo = v; if (v > hi) hi = v; }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo || 1);
  return out;
}
/** The kit's shared tiling noise texture (r, g, b, a: four kinds of smooth noise, 0..1). */
// v.room(): a direction from the probe, moved to where it meets the room's walls from this point (box-projected)
const ROOM_GLSL = ORIGIN_GLSL + `varying vec3 gsRW; uniform vec3 gsRoomAt, gsRoomSize;
vec3 gsBox(vec3 d) { vec3 n = normalize(d), pos = step(0., n), safe = mix(min(n, vec3(-1e-5)), max(n, vec3(1e-5)), pos), e = gsRoomSize * .5, at = gsRoomAt - gsOrigin;
  vec3 t = (mix(-e, e, pos) + at - gsRW) / safe; return gsRW + n * min(min(t.x, t.y), t.z) - at; }
`;
// a box from a Box3, { min, max } or an Object3D
function boxOf(b) {
  if (b?.isBox3) return b.clone();
  if (b?.isObject3D) { b.updateWorldMatrix(true, true); return new Box3().setFromObject(b); }
  return new Box3(new Vector3(...b.min), new Vector3(...b.max));
}
/**
 * A glowing ring that sweeps out from a point over a lit material: sonar, a shockwave, a scanner.
 * pulse(material, { at, radius, strength, color, width, fill }): at is a { value: Vector3 }, radius and
 * strength { value } objects the game changes each frame (strength 0 = off); color (linear [r, g, b] or
 * a Color), width (how thick the ring is, metres) and fill (a faint glow inside the ring) are fixed.
 * One per material; works on WebGL and WebGPU (hd3d-gpu.js gpuLooks.pulse). Returns the material.
 */
export function pulse(m, { at, radius, strength, color = [.15, .95, 1], width = 1.4, fill = .22 } = {}) {
  const col = Array.isArray(color) ? new Vector3(...color) : new Vector3(color.r, color.g, color.b);
  const spec = {
    uniforms: { gsPulseAt: at || { value: new Vector3() }, gsPulseR: radius || { value: 0 }, gsPulseA: strength || { value: 0 }, gsPulseCol: { value: col }, gsPulseW: { value: width }, gsPulseFill: { value: fill }, gsOrigin: ORIGIN_U },
    vertexHead: 'varying vec3 gsPW;\n',
    vertex: [['#include <project_vertex>', 'after', '\n  gsPW = (modelMatrix * vec4(transformed, 1.)).xyz;\n#ifdef USE_INSTANCING\n  gsPW = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).xyz;\n#endif\n']],
    fragmentHead: ORIGIN_GLSL + 'varying vec3 gsPW; uniform vec3 gsPulseAt, gsPulseCol; uniform float gsPulseR, gsPulseA, gsPulseW, gsPulseFill;\n',
    fragment: [['#include <emissivemap_fragment>', 'after', '\n  float gsPd = distance(gsPW, gsPulseAt - gsOrigin); float gsPb = exp(-pow((gsPd - gsPulseR) / gsPulseW, 2.)) + gsPulseFill * step(gsPd, gsPulseR) * (1. - gsPd / max(gsPulseR, .01));\n  totalEmissiveRadiance += gsPulseCol * gsPb * gsPulseA;\n']],
  };
  lookPatch(m, 'pulse', spec);
  return m;
}

export function noiseTex() {
  if (noiseT) return noiseT;
  pause('Textures');   // (while a card loads, a frame may go by first: slices.js)
  const S = 256, data = new Uint8Array(S * S * 4);
  [[4, 5, 1], [8, 4, 2], [16, 3, 3], [2, 5, 4]].forEach(([b, o, seed], ch) => { const f = tileNoise(S, b, o, seed); for (let i = 0; i < S * S; i++) data[i * 4 + ch] = Math.round(f[i] * 255); });
  noiseT = new DataTexture(data, S, S, RGBAFormat); noiseT.wrapS = noiseT.wrapT = RepeatWrapping;
  noiseT.magFilter = LinearFilter; noiseT.minFilter = LinearMipmapLinearFilter; noiseT.generateMipmaps = true; noiseT.needsUpdate = true;
  built();
  return noiseT;
}

/* ---------- outdoor air ---------- */
// v.air({...}) gives a view distance haze that warms towards the sun, mist lying low in the valleys,
// cloud shadows drifting over everything and wet, darker, shinier surfaces in the rain. The kit adds it
// to every lit material in the scene before it first draws (and to plain and point materials: haze
// only), so a game turns it on in one line. All patched materials read one set of values (AIR); the
// view being drawn writes its own in each frame.
const AIR = {
  gsAirOn: { value: 0 }, gsSun: { value: new Vector3(0, 1, 0) }, gsAirC: { value: new Color() }, gsAirSun: { value: new Color() },
  gsHaze: { value: 0 }, gsMist: { value: new Vector4() }, gsCloud: { value: new Vector4() }, gsDrift: { value: new Vector2() }, gsWet: { value: 0 }, gsNoise: { value: null },
  gsCasc: { value: new Vector4(-1, -1, .06, 0) },   // shadow cascades: near light's index, far light's index, edge fade
  // the weather's world (gs.sky.Weather with a level: air.world): how wet, how much snow, how much in puddles, and how far along a
  // surface's normal the cover is read; the cover picture (cover.js: the height of the highest thing over each spot) and where it lies
  // (its middle x, z, 1 / its width, how far from the middle it reaches: 0 with no cover)
  gsWx: { value: new Vector4() }, gsCover: { value: null }, gsCoverAt: { value: new Vector4() },
  // the rain as it falls (0..1) and the weather's own clock for running water, which runs while it rains and slows as it dries
  gsRain: { value: new Vector4() },
  gsOrigin: ORIGIN_U,   // where the drawing's centre is in the world (origin.js): the clouds, mist patches and wet ground are where they are in the world
};
const AIR_GLSL = ORIGIN_GLSL + `
uniform float gsAirOn, gsHaze, gsWet; uniform vec3 gsSun, gsAirC, gsAirSun; uniform vec4 gsMist, gsCloud, gsCasc, gsWx, gsCoverAt, gsRain; uniform vec2 gsDrift; uniform sampler2D gsNoise, gsCover; varying vec3 gsW;
float gsH12(vec2 p){ vec3 a = fract(p.xyx * .1031); a += dot(a, a.yzx + 33.33); return fract((a.x + a.y) * a.z); }
float gsInside(vec4 c){ vec3 p = c.xyz / c.w; vec2 e = min(p.xy, 1. - p.xy); return p.z > 0. && p.z < 1. ? smoothstep(0., gsCasc.z, min(e.x, e.y)) : 0.; }
float gsShadeAt(vec3 wp){
  vec2 c = wp.xz + gsOrigin.xz + gsSun.xz / max(gsSun.y, .15) * (gsCloud.z - wp.y);
  float n = texture2D(gsNoise, c / gsCloud.w + gsDrift).r;
  return 1. - gsCloud.y * smoothstep(1. - gsCloud.x, 1.12 - gsCloud.x * .6, n);
}
vec3 gsAir(vec3 col, vec3 wp){
  vec3 rd = wp - cameraPosition; float t = length(rd); rd /= max(t, 1e-3);
  float haze = 1. - exp(-t * gsHaze);
  float k = rd.y * gsMist.y, fy = gsMist.x * exp(-gsMist.y * (cameraPosition.y - gsMist.z)) * (abs(k) < 1e-4 ? t : (1. - exp(-t * k)) / k);
  float n = texture2D(gsNoise, (wp.xz + gsOrigin.xz) * .006 + gsDrift * 1.7).a;
  float mist = 1. - exp(-max(fy, 0.) * mix(1., .35 + n * 1.3, gsMist.w));
  float s = max(dot(rd, gsSun), 0.);
  return mix(col, mix(gsAirC, gsAirSun, pow(s, 6.) * .9), 1. - (1. - haze) * (1. - mist));
}
`;
// The air is one named look effect (src/kit/looks.js) so the WebGPU port can swap it for a node.
// (gsWet: the game's own, everywhere. gsWx: the weather's, only on what the sky can see: wet, then puddles on
// flat ground that spread as it goes on raining, then snow, on the flattest tops first and in patches, then on
// everything that is not too steep. Not on what is marked GS_NO_SETTLE: water, and things that move about.
// While it rains (gsRain) water runs: rivulets wander down walls and windows with drops sliding down them,
// beads stand on smooth things (glass, paint, polished stone; more the longer it rains) and rings spread on
// the puddles where drops land. All worked out where they are drawn, no pictures and no pass of their own.
// hd3d-gpu.js gpuWet is the same sums as nodes.)
const AIR_WET = `#ifdef USE_FOG
  if (gsAirOn > .5 && gsWet + gsWx.x + gsWx.y + gsWx.z + gsRain.x > 0.) {
    mat3 gsVi = transpose(mat3(viewMatrix)); vec3 gn = gsVi * normal, gg = gsVi * nonPerturbedNormal; float gsOpen = 1.;
    vec2 gsT = gsW.xz + gsOrigin.xz;
    if (gsCoverAt.w > 0.) { vec2 gp = gsT + gg.xz * gsWx.w, gd = abs(gp - gsCoverAt.xy);
      if (max(gd.x, gd.y) < gsCoverAt.w) gsOpen = smoothstep(-.7, -.25, gsW.y - texture2D(gsCover, gp * gsCoverAt.z).r); }
    float w = max(gsWet, gsWx.x * gsOpen) * (.3 + .7 * smoothstep(.15, .85, gn.y)), gsR0 = roughnessFactor;
    roughnessFactor = mix(roughnessFactor, .12, w * .8); diffuseColor.rgb *= 1. - w * .3;
    if (gsRain.x + gsWx.x > 0.) {
      // a frame along the surface: level across it (ga) and up it (gd), in metres
      vec3 gP = gsW + gsOrigin, ga = abs(gg.y) > .98 ? vec3(1., 0., 0.) : normalize(vec3(gg.z, 0., -gg.x)), gd = cross(gg, ga);
      vec2 gu = vec2(dot(gP, ga), dot(gP, gd)), tilt = vec2(0.);
      float steep = 1. - smoothstep(.45, .8, abs(gg.y)), slick = 1. - smoothstep(.12, .45, gsR0), now = max(gsRain.x, gsWx.x * .6) * gsOpen, run = 0., bead = 0.;
#ifdef USE_CLEARCOAT
      slick = max(slick, min(1., clearcoat * 2.) * (1. - smoothstep(.35, .7, clearcoatRoughness)));   // (paint under a clear coat: the coat is what the water stands on)
#endif
      if (steep * now > 0.) {   // rivulets down walls and windows (finer on glass; wide wet streaks on brick and stone), some running, drops sliding down them
        float q = gu.x * mix(9., 24., slick), h = gsH12(vec2(floor(q), 7.));
        float x = fract(q) - .5 + (h - .5) * .35 - (sin(gu.y * 4.1 + h * 31.) * .11 + sin(gu.y * 10.3 + h * 17.) * .05) * (1. + slick);
        float wd = (.07 + .06 * fract(h * 13.)) * (2.2 - 1.2 * slick), ln = smoothstep(wd, wd * .35, abs(x)) * step(h, .25 + .55 * gsWx.x + .2 * gsRain.x);
        float hd = fract(gu.y * (.5 + h * .6) + gsRain.y * (.3 + h * .45) + h * 9.), drip = smoothstep(0., .05, hd) * smoothstep(.3, .05, hd);
        run = ln * steep * now * (.5 + .5 * drip); tilt.x -= clamp(x / wd, -1., 1.) * run * .5;
      }
      if (slick * gsOpen > 0.) {   // beads on what is smooth, in two layers of cells: a dome each, mostly small, more as it goes on raining; far off, a fine sheen
        for (int k = 0; k < 2; k++) {
          vec2 b = k == 0 ? gu * 42. : (mat2(.8, .6, -.6, .8) * gu + 3.7) * 27., f = fract(b) - .5, c = floor(b) + float(k) * 41.3; float h = gsH12(c), h2 = gsH12(c + 17.31), r = .1 + .28 * pow(gsH12(c + 3.1), 3.);
          vec2 d = (f - (vec2(h, h2) - .5) * (1. - 2. * r) * .9) / r; float dd = dot(d, d), nr = 1. - smoothstep(.35, .9, length(fwidth(b)));
          float on = step(h2, .2 + .6 * gsWx.x) * (1. - smoothstep(.8, 1., dd)) * slick * gsOpen * step(1e-3, gsWx.x) * smoothstep(-.35, -.1, gg.y);   // (not under what faces down)
          tilt += d * on * nr * .9; bead = max(bead, on * mix(.35, 1., nr));
        }
      }
      normal = normalize(normal + mat3(viewMatrix) * (ga * tilt.x + gd * tilt.y));
      roughnessFactor = mix(roughnessFactor, .03, max(run, bead)); diffuseColor.rgb *= 1. - run * mix(.35, .15, slick);
    }
#ifndef GS_NO_SETTLE
    if (gsWx.y + gsWx.z > 0.) {
      vec4 gsN1 = texture2D(gsNoise, gsT * .05); float gsN2 = texture2D(gsNoise, gsT * .021).r * .4;
      float pl = mix(.86, .55, gsWx.z), p = step(1e-6, gsWx.z) * smoothstep(pl, pl + .035, gsN1.b * .6 + gsN2) * smoothstep(.97, .995, gg.y) * gsOpen;
      float sn = gsN1.g * .6 + gsN2, lim = mix(.97, .55, gsWx.y);
      float s = step(1e-6, gsWx.y) * smoothstep(lim, lim + .14, gg.y + (sn - .5) * .22) * smoothstep(0., .3, gsWx.y * 1.2 - sn * .6) * gsOpen;
      roughnessFactor = mix(mix(roughnessFactor, .03, p), .85, s); metalnessFactor *= 1. - s;
      diffuseColor.rgb = mix(diffuseColor.rgb * (1. - p * .3), vec3(.86, .9, .96), s); normal = normalize(mix(normal, nonPerturbedNormal, max(p * .92, s * .6)));
      if (gsRain.x * p > 0.) {   // rings spreading on the puddles where drops land: two layers of drops, one a cell, a new one each beat
        vec2 rr = vec2(0.);
        for (int k = 0; k < 2; k++) {
          vec2 q = gsT * 4.2 + float(k) * vec2(.37, .71), c = floor(q) + float(k) * 19.7, f = fract(q) - .5; float h = gsH12(c);
          float ph = fract(gsRain.y * (.9 + h * .5) + h * 13.); vec2 dv = f - (vec2(h, gsH12(c + 5.3)) - .5) * .4; float dl = length(dv) + 1e-4, xr = (dl - ph * .45) * 22.;
          rr += dv / dl * sin(xr * 3.14159) * (1. - smoothstep(0., 1.5, abs(xr))) * (1. - ph) * (1. - ph) * step(h, gsRain.x * .85 + .1);
        }
        normal = normalize(normal + mat3(viewMatrix) * vec3(rr.x, 0., rr.y) * .4 * p);
      }
    }
#endif
  }
#endif
`;
// Shadow cascades (sun().fit(view, { near })): a second sun light with a small sharp shadow close to
// the camera. Each spot takes its light from the near one inside its box (fading at the edges) and
// from the far one elsewhere, so the sun isn't counted twice. Three's own CSM swaps the shader chunks
// for every game; this rides on the air's light patch instead (WebGPU: CSMShadowNode).
const CASC_NEAR = `  float gsNearW = 0.;
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1
  #pragma unroll_loop_start
  for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
    if ( float( UNROLLED_LOOP_INDEX ) == gsCasc.x ) gsNearW = gsInside( vDirectionalShadowCoord[ i ] );
  }
  #pragma unroll_loop_end
#endif
`;
const CASC_W = `#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
    if ( float( UNROLLED_LOOP_INDEX ) == gsCasc.x ) directLight.color *= gsNearW; else if ( float( UNROLLED_LOOP_INDEX ) == gsCasc.y ) directLight.color *= 1. - gsNearW;
#endif
`;
function cascades(chunk) {
  const at = chunk.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )'), call = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  if (at < 0) return chunk;
  const i = chunk.indexOf(call, at); if (i < 0) return chunk;
  return chunk.slice(0, at) + CASC_NEAR + chunk.slice(at, i) + CASC_W + chunk.slice(i);
}
const airSpec = (lit, wets) => ({
  uniforms: AIR,
  check: sh => sh.fragmentShader.includes('#include <fog_fragment>') && sh.vertexShader.includes('#include <fog_vertex>'),
  vertexHead: 'varying vec3 gsW;\n',
  vertex: [['#include <fog_vertex>', 'after', '\n#ifdef USE_FOG\n  gsW = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);\n#endif']],
  fragment: [
    ['void main() {', 'before', AIR_GLSL],
    ['#include <fog_fragment>', 'replace', () => '#ifdef USE_FOG\n  if (gsAirOn > .5) gl_FragColor.rgb = gsAir(gl_FragColor.rgb, gsW); else {\n' + ShaderChunk.fog_fragment + '\n  }\n#endif'],
    ...(lit ? [['#include <lights_fragment_begin>', 'replace', () => '#ifdef USE_FOG\n  float gsShade = gsAirOn > .5 && gsCloud.y > 0. ? gsShadeAt(gsW) : 1.;\n#else\n  float gsShade = 1.;\n#endif\n'
      + cascades(ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight ); directLight.color *= gsShade;'))]] : []),
    ...(wets ? [['#include <emissivemap_fragment>', 'before', AIR_WET]] : []),
  ],
});
const airSpecs = [[false, false], [true, false], [true, true]].map(([l, w]) => airSpec(l, w));
const airDone = new WeakSet();
function airPatch(m, o) {
  if (!m || airDone.has(m)) return;
  airDone.add(m);
  if (m.isShaderMaterial || m.isRawShaderMaterial || m.fog === false || m.isMeshDepthMaterial || m.isMeshDistanceMaterial || m.isShadowMaterial) return;
  const lit = m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial, wets = m.isMeshStandardMaterial;
  if (wets && noSettle(m, o)) (m.defines ||= {}).GS_NO_SETTLE = '';
  lookPatch(m, 'air', airSpecs[wets ? 2 : lit ? 1 : 0]);
}
// what puddles and snow do not form on: water, and people and animals (userData.noSettle on a mesh or a material says so for anything else)
const noSettle = (m, o) => !!(o?.isSkinnedMesh || o?.userData?.noSettle || m?.userData?.noSettle);
const airOf = o => { if (o.material) { if (Array.isArray(o.material)) for (const m of o.material) airPatch(m, o); else airPatch(o.material, o); } };

/* ---------- particles ---------- */
const PV = `attribute float size; attribute vec4 tint; varying vec4 vT; uniform float scale;
  void main(){ vT = tint; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = size * scale / max(.05, -mv.z); gl_Position = projectionMatrix * mv; }`;
const PF = `varying vec4 vT; uniform float soft; void main(){ vec2 d = gl_PointCoord - .5; float r = dot(d, d) * 4.; if (r > 1.) discard;
  float a = soft > .5 ? (1. - r) * (1. - r) : smoothstep(1., .3, r); gl_FragColor = vec4(vT.rgb, vT.a * a); }`;
/**
 * A pool of camera-facing soft particles, drawn in view v (new Particles(v, ...)). additive: true for sparks / fire / glints (colours
 * above 1 bloom), false for smoke and dust. p.emit({ x, y, z, vx, vy, vz, life, size, grow,
 * col: [r, g, b], a, drag, grav, blow }) then p.update(dt) once per frame. With { wind } (a gs.outdoors
 * Wind) they drift with it: blow is how much (1 = with the air, 0 = not at all; default the pool's blow).
 * reactive: true for faint puffs that move fast across the picture (a train's steam): the upscaler takes them from the
 * new frame instead of blending them into the frames before, where they fade to nothing (WebGPU).
 */
const PART_ATTRS = [['position', 3], ['size', 1], ['tint', 4]];   // (made once, not every frame)
export class Particles {
  constructor(view, { max = 300, additive = true, wind = null, blow = 1, reactive = false } = {}) {
    this.max = max; this.list = []; this.wind = wind; this.blow = blow; this.wAt = {}; this.reactive = reactive;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(max * 3), 3));
    g.setAttribute('size', new BufferAttribute(new Float32Array(max), 1));
    g.setAttribute('tint', new BufferAttribute(new Float32Array(max * 4), 4));
    this.mat = new ShaderMaterial({ vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending, uniforms: { scale: { value: 300 }, soft: { value: additive ? 0 : 1 } } });
    this.pts = new Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 5; view.scene.add(this.pts); view.parts.push(this);
    this.pts.userData.gsTwin = true;   // on WebGPU, hd3d-gpu.js draws them instead (gpuParticles)
    this.view = view;
  }
  emit(o) { if (this.list.length >= this.max) this.list.shift(); this.list.push({ vx: 0, vy: 0, vz: 0, life: 1, size: .1, grow: 0, col: [1, 1, 1], a: 1, drag: 0, grav: 0, ...o, t: 0 }); }
  clear() { this.list.length = 0; }
  update(dt) {
    this.tick = (this.tick || 0) + 1;
    const L = this.list, g = this.pts.geometry, P = g.attributes.position.array, S = g.attributes.size.array, T = g.attributes.tint.array;
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i]; p.t += dt; if (p.t >= p.life) continue;
      const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy = p.vy * k - p.grav * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const bl = p.blow ?? this.blow; if (this.wind && bl) { if (p.wx === undefined || ((i + this.tick) & 7) === 0) { const w = this.wind.at(p.x, p.z, this.wAt); p.wx = w.x; p.wz = w.z; } p.x += p.wx * bl * dt; p.z += p.wz * bl * dt; }   // the wind where it is, looked up every 8th frame
      if (p.floor != null && p.y < p.floor) { p.y = p.floor; p.vy *= -.35; p.vx *= .6; p.vz *= .6; }
      const f = p.t / p.life;
      P[n * 3] = p.x; P[n * 3 + 1] = p.y; P[n * 3 + 2] = p.z; S[n] = p.size * (1 + p.grow * f);
      T[n * 4] = p.col[0]; T[n * 4 + 1] = p.col[1]; T[n * 4 + 2] = p.col[2]; T[n * 4 + 3] = p.a * (p.fadeIn ? Math.min(1, f * 6) : 1) * (1 - f) ** (p.ease ?? 1);
      L[n++] = p;
    }
    L.length = n; g.setDrawRange(0, n); this.n = n;
    for (const [a, k] of PART_ATTRS) { const at = g.attributes[a]; at.clearUpdateRanges(); at.addUpdateRange(0, Math.max(1, n * k)); at.needsUpdate = true; }
  }
  /** Takes them out of the view for good. */
  dispose() {
    this.pts.removeFromParent(); this.pts.geometry.dispose(); this.mat.dispose();
    const tw = this.gpuTwin; if (tw) { tw.sprite.removeFromParent(); tw.sprite.geometry?.dispose(); this.gpuTwin = null; }
    const i = this.view.parts.indexOf(this); if (i >= 0) this.view.parts.splice(i, 1);
  }
}

/**
 * Lots of particles: sparks, embers, smoke, rain splashes, magic, confetti, fireworks. new GPUParticles(v, { max })
 * then p.emit(count, { at, radius, vel, spread, life, size, color, to, alpha, fadeIn, ease }) for a burst and
 * p.update(dt) once a frame. With the view on WebGPU they move on the graphics chip (tens of thousands are
 * cheap); on WebGL they move here on the CPU, capped to what the phone can afford (p.max says how many).
 * Options: max (20000), additive (true: glows; false: smoke and dust), gravity (m/s² down, 0), drag (0),
 * bounce (.35, off the floor), floor (a height they bounce on, or null), turbulence ({ strength, scale, speed }:
 * a swirl), wind (a gs.outdoors Wind: they drift with the air where they are). Burst fields: at [x, y, z] (or a
 * Vector3), radius (start anywhere in a ball this big, 0), vel [x, y, z] (0), spread (plus a random speed in any
 * direction up to this, 1), life (seconds, or [min, max]; 1), size (metres, or [start, end]; .1), color (colour or
 * [r, g, b], above 1 glows; white), to (colour at the end; color), alpha (1), fadeIn (false), ease (fade curve, 1).
 * Up to 16 bursts a frame. Switching between WebGL and WebGPU starts them afresh (they are only for looks: the
 * game can't read where they are; use Particles for the few that must).
 * p.pull(at, { strength, radius, swirl, axis, take }) draws them to a point (a portal, a magnet, a drain), pushes
 * them away (strength below 0: a blast's wake, a fan) or turns them round it (swirl: a whirlwind), and takes those
 * that come within take; it gives back the pull, whose fields can change each frame (pull.at, pull.strength...), and
 * pull.remove(). Up to 8. strength and swirl are m/s² at 1 m (steady closer in, falling as 1/d² beyond, and to nothing at
 * radius, if given); a swirl spins them up, so give the particles drag for them to spiral in rather than fly off. p.flow(fn, { box, strength }) moves them with a flow: fn(x, y, z) gives the air's or the
 * water's velocity there ([x, y, z] or { x, y, z }), sampled into 16 x 16 x 16 cells over box ({ min, max }, or a
 * THREE.Box3), which particles inside take up at strength a second; flow.update() samples it again, flow.remove().
 * One flow at a time. (Babylon.js 9's attractors and flow maps, the engines review's option 11.)
 */
const SPARK_CPU = { top: 12000, high: 6000, mid: 3000, low: 1500 };
const GPC = new Color();
export class GPUParticles {
  constructor(view, { max = 20000, additive = true, gravity = 0, drag = 0, bounce = .35, floor = null, turbulence = null, wind = null } = {}) {
    this.maxGpu = Math.max(16, Math.min(262144, max | 0));
    this.max = this.maxGpu;
    Object.assign(this, { additive, gravity, drag, bounce, floor, turbulence, wind, view });
    this.bursts = []; this.head = 0; this.time = 0; this.pendingDt = 0; this.seed = 1; this.n = 0; this.wAt = {}; this.pulls = []; this.flowOn = null;
    this.cpuMax = Math.min(this.maxGpu, SPARK_CPU[phoneClass()] ?? 3000);
    const n = this.cpuMax, g = new BufferGeometry();
    this.P = new Float32Array(n * 4); this.V = new Float32Array(n * 4); this.C = new Float32Array(n * 4); this.E = new Float32Array(n * 4); this.S = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { this.P[i * 4 + 3] = 1; this.V[i * 4 + 3] = 0; }   // all dead
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('size', new BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('tint', new BufferAttribute(new Float32Array(n * 4), 4));
    this.mat = new ShaderMaterial({ vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending, uniforms: { scale: { value: 300 }, soft: { value: additive ? 0 : 1 } } });
    this.pts = new Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 5; view.scene.add(this.pts); view.parts.push(this);
    this.pts.userData.gsTwin = true;
    this.onGpu = null;   // (not known until the view first draws)
  }
  /** A burst of count particles (see the class notes for the fields). */
  emit(count, o = {}) {
    if (this.bursts.length >= 16 || !(count > 0)) return this;
    const cap = this.onGpu ? this.maxGpu : this.cpuMax; count = Math.min(count | 0, cap);
    const at = o.at || [0, 0, 0], vel = o.vel || [0, 0, 0], V3 = a => a.isVector3 ? [a.x, a.y, a.z] : a;
    const life = Array.isArray(o.life) ? o.life : [o.life ?? 1, o.life ?? 1], size = Array.isArray(o.size) ? o.size : [o.size ?? .1, o.size ?? .1];
    const col = rgbOf(o.color ?? [1, 1, 1]), to = o.to != null ? rgbOf(o.to) : col;
    this.bursts.push({ start: this.head, n: count, seed: (this.seed = (this.seed * 1103515245 + 12345) % 2147483648) / 2147483648 * 1000,
      at: V3(at), radius: o.radius ?? 0, vel: V3(vel), spread: o.spread ?? 1, life, size, col, a: o.alpha ?? 1, to, ease: o.ease ?? 1, fadeIn: o.fadeIn ? 1 : 0 });
    this.head = (this.head + count) % cap;
    return this;
  }
  clear() { this.bursts.length = 0; for (let i = 0; i < this.cpuMax; i++) { this.P[i * 4 + 3] = 1; this.V[i * 4 + 3] = 0; } this.twin?.reset(); this.head = 0; }
  /** Draws particles to a point, pushes them away (strength < 0) or swirls them round it; see the class notes. Null past 8. */
  pull(at, { strength = 5, radius = 0, swirl = 0, axis = [0, 1, 0], take = 0 } = {}) {
    if (this.pulls.length >= PULL_MAX) return null;
    const list = this.pulls, h = { at, strength, radius, swirl, axis, take, remove() { const i = list.indexOf(h); if (i >= 0) list.splice(i, 1); } };
    list.push(h); return h;
  }
  /** Moves particles with a flow field over a box; see the class notes. A new one replaces the last. */
  flow(fn, { box, strength = 2 } = {}) {
    const lo = v3(box?.min ?? [-5, -5, -5]), hi = v3(box?.max ?? [5, 5, 5]), N = FLOW_N;
    const size = [Math.max(1e-3, hi[0] - lo[0]), Math.max(1e-3, hi[1] - lo[1]), Math.max(1e-3, hi[2] - lo[2])];
    const f = { fn, min: lo, size, strength, cells: new Float32Array(N * N * N * 4), fresh: true,
      update: () => {
        for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const v = fn(lo[0] + size[0] * x / (N - 1), lo[1] + size[1] * y / (N - 1), lo[2] + size[2] * z / (N - 1)), j = (x + y * N + z * N * N) * 4;
          f.cells[j] = v?.x ?? v?.[0] ?? 0; f.cells[j + 1] = v?.y ?? v?.[1] ?? 0; f.cells[j + 2] = v?.z ?? v?.[2] ?? 0;
        }
        f.fresh = true; return f;
      },
      remove: () => { if (this.flowOn === f) this.flowOn = null; } };
    this.flowOn = f.update(); return f;
  }
  update(dt) {
    dt = Math.min(dt, .1); this.time += dt;
    // (the view hasn't drawn yet, so it isn't known where they move: what was asked for waits for its first frame. Taken on
    // the CPU here, the bursts of a system made before the view's first frame were lost on WebGPU, and the chip's copy was
    // then started afresh as if moved from WebGL)
    if (this.view._onGpu === undefined) { this.pendingDt += dt; return; }
    const gpu = !!this.view._onGpu, was = this.onGpu;
    if (gpu !== was) {   // moved between WebGL and WebGPU: what was flying is dropped, bursts already asked for still start
      this.onGpu = gpu; this.max = gpu ? this.maxGpu : this.cpuMax;
      if (was === null) { /* the first frame said where */ } else if (gpu) this.twin?.reset(); else { for (let i = 0; i < this.cpuMax; i++) { this.P[i * 4 + 3] = 1; this.V[i * 4 + 3] = 0; } this.head %= this.cpuMax; for (const b of this.bursts) { b.n = Math.min(b.n, this.cpuMax); b.start %= this.cpuMax; } }
    }
    if (gpu) { this.pendingDt += dt; return; }   // the WebGPU step runs at draw time (stepGpu)
    this.spawnCpu(); this.stepCpu(dt);
  }
  windNow() { if (!this.wind) return [0, 0, 0]; const b = this.lastAt || [0, 0, 0], w = this.wind.at(b[0], b[2], this.wAt); return [w.x, 0, w.z]; }
  spawnCpu() {
    const N = this.cpuMax, { P, V, C, E, S } = this;
    for (const b of this.bursts) {
      this.lastAt = b.at;
      for (let k = 0; k < b.n; k++) {
        const i = (b.start + k) % N, j = i * 4, h = c => hashF(i, b.seed, c);
        const u = h(1) * 2 - 1, a = h(2) * 6.2831853, q = Math.sqrt(Math.max(0, 1 - u * u)), rr = Math.cbrt(h(3)) * b.radius;
        const u2 = h(4) * 2 - 1, a2 = h(5) * 6.2831853, q2 = Math.sqrt(Math.max(0, 1 - u2 * u2)), rv = Math.cbrt(h(6)) * b.spread;
        P[j] = b.at[0] + q * Math.cos(a) * rr; P[j + 1] = b.at[1] + u * rr; P[j + 2] = b.at[2] + q * Math.sin(a) * rr; P[j + 3] = 0;
        V[j] = b.vel[0] + q2 * Math.cos(a2) * rv; V[j + 1] = b.vel[1] + u2 * rv; V[j + 2] = b.vel[2] + q2 * Math.sin(a2) * rv; V[j + 3] = b.life[0] + (b.life[1] - b.life[0]) * h(7);
        C[j] = b.col[0]; C[j + 1] = b.col[1]; C[j + 2] = b.col[2]; C[j + 3] = b.a;
        E[j] = b.to[0]; E[j + 1] = b.to[1]; E[j + 2] = b.to[2]; E[j + 3] = b.ease;
        S[j] = b.size[0]; S[j + 1] = b.size[1]; S[j + 2] = b.fadeIn;
      }
    }
    this.bursts.length = 0;
  }
  stepCpu(dt) {
    const N = this.cpuMax, { P, V, C, E, S } = this, g = this.pts.geometry, PP = g.attributes.position.array, SS = g.attributes.size.array, TT = g.attributes.tint.array;
    const k = Math.max(0, 1 - this.drag * dt), gr = this.gravity, T = this.turbulence, ts = T?.strength ?? 0, tsc = T?.scale ?? 1, tt = this.time * (T?.speed ?? 1), w = this.windNow(), fl = this.floor;
    const pulls = this.pulls.map(pl => ({ p: v3(pl.at), strength: +pl.strength || 0, radius: +pl.radius || 0, swirl: +pl.swirl || 0, ax: unit(v3(pl.axis ?? [0, 1, 0])), take: +pl.take || 0 })), fo = this.flowOn;
    let n = 0;
    for (let i = 0; i < N; i++) {
      const j = i * 4; if (!(P[j + 3] < V[j + 3])) continue;
      let vx = V[j] * k, vy = V[j + 1] * k - gr * dt, vz = V[j + 2] * k;
      if (ts) { const x = P[j] * tsc, y = P[j + 1] * tsc, z = P[j + 2] * tsc;
        vx += (Math.sin(y + tt) + Math.sin(z * 1.7 - tt)) * .5 * ts * dt; vy += (Math.sin(z + tt * 1.3) + Math.sin(x * 1.3 + tt)) * .5 * ts * dt; vz += (Math.sin(x + tt * .7) + Math.sin(y * 1.9 - tt)) * .5 * ts * dt; }
      let took = false;
      for (const pl of pulls) {   // (as the chip's step: particles-gpu.js)
        const a = pl.p, dx = a[0] - P[j], dy = a[1] - P[j + 1], dz = a[2] - P[j + 2], dl = Math.max(1e-4, Math.hypot(dx, dy, dz)), nx = dx / dl, ny = dy / dl, nz = dz / dl;
        const fall = (pl.radius > 0 ? 1 - smooth(pl.radius * .67, pl.radius, dl) : 1) / Math.max(dl * dl, 1), s = pl.strength * fall * dt, sw = pl.swirl * fall * dt, ax = pl.ax;
        vx += nx * s + (ax[1] * nz - ax[2] * ny) * sw; vy += ny * s + (ax[2] * nx - ax[0] * nz) * sw; vz += nz * s + (ax[0] * ny - ax[1] * nx) * sw;
        if (dl < pl.take) took = true;
      }
      if (fo) {
        const qx = (P[j] - fo.min[0]) / fo.size[0], qy = (P[j + 1] - fo.min[1]) / fo.size[1], qz = (P[j + 2] - fo.min[2]) / fo.size[2];
        const ew = smooth(0, .1, qx) * (1 - smooth(.9, 1, qx)) * smooth(0, .1, qy) * (1 - smooth(.9, 1, qy)) * smooth(0, .1, qz) * (1 - smooth(.9, 1, qz));
        if (ew > 0) { const fv = flowAt(fo, qx, qy, qz), t = Math.min(fo.strength * dt, 1) * ew; vx += (fv[0] - vx) * t; vy += (fv[1] - vy) * t; vz += (fv[2] - vz) * t; }
      }
      if (took) P[j + 3] = V[j + 3];
      let x = P[j] + (vx + w[0]) * dt, y = P[j + 1] + vy * dt, z = P[j + 2] + (vz + w[2]) * dt;
      if (fl != null && y < fl) { y = fl; vy *= -this.bounce; vx *= .6; vz *= .6; }
      P[j] = x; P[j + 1] = y; P[j + 2] = z; P[j + 3] += dt; V[j] = vx; V[j + 1] = vy; V[j + 2] = vz;
      const f = Math.min(1, P[j + 3] / Math.max(1e-4, V[j + 3])); if (f >= 1) continue;
      PP[n * 3] = x; PP[n * 3 + 1] = y; PP[n * 3 + 2] = z; SS[n] = S[j] + (S[j + 1] - S[j]) * f;
      TT[n * 4] = C[j] + (E[j] - C[j]) * f; TT[n * 4 + 1] = C[j + 1] + (E[j + 1] - C[j + 1]) * f; TT[n * 4 + 2] = C[j + 2] + (E[j + 2] - C[j + 2]) * f;
      TT[n * 4 + 3] = C[j + 3] * (1 - f) ** E[j + 3] * (S[j + 2] ? Math.min(1, f * 6) : 1);
      n++;
    }
    g.setDrawRange(0, n); this.n = n;
    for (const [a, kk] of [['position', 3], ['size', 1], ['tint', 4]]) { const at = g.attributes[a]; at.clearUpdateRanges(); at.addUpdateRange(0, Math.max(1, n * kk)); at.needsUpdate = true; }
  }
  /* WebGPU (hd3d.js swapTwins): the compute twin and its step for this frame */
  makeTwin(G) { const t = G.fx.gpuSparks(this); this.twin = t; return t; }
  stepGpu(G) {
    const t = this.twin; if (!t) return;
    const rows = this._rows ||= Array.from({ length: 16 * 7 }, () => new Vector4());
    const B = this.bursts; for (let b = 0; b < B.length; b++) { const o = B[b], r = b * 7; this.lastAt = o.at;
      rows[r].set(o.start, o.n, 0, o.seed); rows[r + 1].set(o.at[0], o.at[1], o.at[2], o.radius); rows[r + 2].set(o.vel[0], o.vel[1], o.vel[2], o.spread);
      rows[r + 3].set(o.life[0], o.life[1], o.size[0], o.size[1]); rows[r + 4].set(o.col[0], o.col[1], o.col[2], o.a); rows[r + 5].set(o.to[0], o.to[1], o.to[2], o.ease); rows[r + 6].set(o.fadeIn, 0, 0, 0); }
    const T = this.turbulence, w = this.windNow();
    this._turb ||= new Vector4(); this._turb.set(T?.strength ?? 0, T?.scale ?? 1, T?.speed ?? 1, 0); this._wind ||= new Vector3(); this._wind.set(w[0], 0, w[2]);
    const pr = this._pullRows ||= Array.from({ length: PULL_MAX * 3 }, () => new Vector4()), pk = this._pk ||= { rows: pr, count: 0 };
    pk.count = this.pulls.length;
    this.pulls.forEach((pl, i) => { const a = v3(pl.at), ax = unit(v3(pl.axis ?? [0, 1, 0])); pr[i * 3].set(a[0], a[1], a[2], +pl.strength || 0); pr[i * 3 + 1].set(ax[0], ax[1], ax[2], +pl.swirl || 0); pr[i * 3 + 2].set(+pl.radius || 0, +pl.take || 0, 0, 0); });
    const fo = this.flowOn, fl = fo ? (this._fl ||= { min: new Vector3(), size: new Vector3() }) : null;
    if (fo) { fl.min.fromArray(fo.min); fl.size.fromArray(fo.size); fl.strength = fo.strength; fl.cells = fo.cells; fl.fresh = fo.fresh; fo.fresh = false; }
    t.step(G.r, { rows, count: B.length, dt: this.pendingDt, time: this.time, gravity: this.gravity, drag: this.drag, bounce: this.bounce, floor: this.floor, turb: this._turb, wind: this._wind, pulls: pk, flow: fl });
    B.length = 0; this.pendingDt = 0;
  }
  dispose() { this.pts.removeFromParent(); this.pts.geometry.dispose(); this.mat.dispose(); this.twin?.dispose(); this.twin?.sprite.removeFromParent(); const i = this.view.parts.indexOf(this); if (i >= 0) this.view.parts.splice(i, 1); }
}
const rgbOf = c => { if (Array.isArray(c)) return [c[0], c[1], c[2]]; const k = c.isColor ? c : GPC.set(c); return [k.r, k.g, k.b]; };
// (pulls and flow fields: as many as particles-gpu.js's PULLS, its FLOW_N cells a side)
const PULL_MAX = 8, FLOW_N = 16;
const v3 = a => a?.isVector3 ? [a.x, a.y, a.z] : [+a?.[0] || 0, +a?.[1] || 0, +a?.[2] || 0];
const unit = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
// the flow's velocity at a place in its box (0..1 a side), between its cells' as the chip reads it
function flowAt(fo, qx, qy, qz) {
  const N = FLOW_N, g = [qx, qy, qz].map(q => Math.min(1, Math.max(0, q)) * (N - 1)), b = g.map(v => Math.min(N - 2, Math.max(0, Math.floor(v)))), f = g.map((v, i) => v - b[i]), out = [0, 0, 0];
  for (let c = 0; c < 8; c++) {
    const o = [c & 1, (c >> 1) & 1, (c >> 2) & 1], j = ((b[0] + o[0]) + (b[1] + o[1]) * N + (b[2] + o[2]) * N * N) * 4;
    const w = (o[0] ? f[0] : 1 - f[0]) * (o[1] ? f[1] : 1 - f[1]) * (o[2] ? f[2] : 1 - f[2]);
    out[0] += fo.cells[j] * w; out[1] += fo.cells[j + 1] * w; out[2] += fo.cells[j + 2] * w;
  }
  return out;
}
function hashF(i, s, c) { const x = Math.sin(i * 12.9898 + s * 78.233 + c * 37.719) * 43758.5453; return x - Math.floor(x); }

/* ---------- view ---------- */
const C_WARM = new Color('#ffe2b8'), GV = new Vector3(), GP = new Vector3(), GW = new Vector3(), GQ = new Vector2(), GL = new Vector3(), GH = new Vector3();
// frame generation: the camera jumped (a teleport, a switch of camera, a snap turn, a scope's zoom)
// if since the last real frame it moved 8 m, turned more than 20 degrees or zoomed by a quarter. The
// frames either side don't belong together then, so none is made between them.
const FG_P = new Vector3(), FG_D = new Vector3(), COS20 = Math.cos(20 * Math.PI / 180);
// fresh aim (HDView.aimPose): the camera as it was, and its pose now
const NO_JIT = [0, 0], AIM = { pos: new Vector3(), q0: new Quaternion(), fov: 50, zoom: 1, proj: new Matrix4(), pose: { q: new Quaternion(), fx: 1, fy: 1, cx: 0, cy: 0, persp: true } };
function cameraMove(cam, last) {
  cam.getWorldPosition(FG_P); cam.getWorldDirection(FG_D);
  const zoom = cam.projectionMatrix.elements[5];
  const jumped = !!last && (FG_P.distanceTo(last.pos) > 8 || FG_D.dot(last.dir) < COS20 || Math.abs(zoom / last.zoom - 1) > .25);
  last ||= { pos: new Vector3(), dir: new Vector3(), zoom: 1 };
  last.pos.copy(FG_P); last.dir.copy(FG_D); last.zoom = zoom || 1;
  return { jumped, last };
}
// a grade tint: '#rrggbb', a Color or [r, g, b] (1 = no change)
const toRGB = (c, out) => { if (c == null) out.set(1, 1, 1); else if (Array.isArray(c)) out.set(c[0], c[1], c[2]); else { const k = c.isColor ? c : new Color(c); out.set(k.r, k.g, k.b); } return out; };
// decal pictures: drawn once per key and kept (a soft round mark by default)
const decalTexs = new Map();
const DEFAULT_DECAL = (c, s) => { const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, '#fff'); g.addColorStop(.55, '#ddd'); g.addColorStop(1, '#000'); c.fillStyle = g; c.fillRect(0, 0, s, s); };
// (the grid's soft mark: white, its shape in the alpha, tinted by the decal's colour)
const SOFT_MARK = (c, s) => { const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.55, 'rgba(255,255,255,.87)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, s, s); };
function decalTex(paint, key) {
  if (!paint) return null;
  const k = key || paint; let t = decalTexs.get(k); if (t) return t;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d', CPU); paint(c, 128);
  t = new CanvasTexture(cv); t.colorSpace = key === '_soft' ? NoColorSpace : SRGBColorSpace; t.anisotropy = 4;
  if (decalTexs.size > 32) { const [k0, t0] = decalTexs.entries().next().value; t0.dispose(); decalTexs.delete(k0); }
  decalTexs.set(k, t); return t;
}

export class HDView {
  /**
   * bg: background colour; fog: density of exponential fog (0 = none); env: strength of the
   * image-based reflections; sky/ground/amb: hemisphere fill light.
   */
  constructor({ bg = '#0a0c10', fog = 0, env = .35, sky = '#9ab0d0', ground = '#2a2420', amb = .25, fov = 70 } = {}) {
    this.scene = new Scene(); this.scene.background = new Color(bg); Object.defineProperty(this.scene, 'gsView', { value: this });   // (kit parts that animate on the view's own clock, v.t; not in userData, which copies go through JSON)
    if (fog) this.scene.fog = new FogExp2(bg, fog);
    this.envI = env; this.hemi = new HemisphereLight(sky, ground, amb); this.scene.add(this.hemi);
    this.cam = new PerspectiveCamera(fov, 1, .05, 120); this.scene.add(this.cam);
    this.hurt = 0; this.t = 0; this.W = 240; this.H = 320; this.exposure = 1; this.bloom = .7; this.tone = 'aces'; this.autoExposure = false; this.eye = null; this.lut = null; this.lutAmount = 1; this.oit = false; this.flare = null; this.fog3d = null; this.liveBounce = null;
    this.drops = new LensDrops();   // rain on the lens (lens-drops.js): gs.sky.Weather lands drops while it rains; add() for a splash of your own
    this.lamps = []; this.tierSeen = -1; this.parts = []; this.reflectors = []; this.contacts = [];
    this.env = null; this.envMaker = null; this.grade = null; this.glare = 0; this._air = null;
    this.shafts = 0; this.shaftsAt = null; this.decals = []; this.probes = []; this.probe = null; this.rooms = []; this.gi = null; this.focus = null; this.lens = null; this.cascade = null; this.beams = null; this.motionBlur = null;
    this.upscaler = undefined;   // 'sgsr1' keeps this view on Snapdragon GSR 1 (lots of fast movers: SGSR 2 can leave a short soft trail)
    this.details = null; own(this);   // (cluster detail's twins hold index lists on the graphics chip: free() lets them go when the card leaves the feed)
  }
  /** Called when the card leaves the feed (cleanup.js): lets go of what this view holds on the graphics chip for cluster detail. */
  free() { detailDropAll(this); this._tracer?.dispose(); this._tracer = null; }
  /**
   * Outdoor air for every lit material in the scene: haze (how thick the air is: .001 is about 1 km of
   * view), colour (far away fades to it) and sunColour (towards the sun), mist (thickness at mistY,
   * thinning by mistFall a metre upwards; patchy 0..1), clouds (cover 0..1) with cloudShade (how
   * dark their shadows are), cloudHeight, cloudSize (metres), wind ([x, z] m/s they drift, or a gs.outdoors Wind), and wet
   * (0..1: rain darkens things and makes up-facing surfaces shiny, everywhere; a gs.sky.Weather that is
   * given the level does it only where the sky can see, with puddles and snow: it sets `world` here itself).
   * sun: direction towards the sun (default: v.sun, the light from sun()). Returns the settings, which you
   * can change any time; v.air(false) turns it off.
   */
  air(o = {}) {
    if (o === false) { this._air = null; return null; }
    if (!this._air) {
      const fc = this.scene.fog?.color || this.scene.background || new Color('#c8d0d8');
      this._air = { haze: .0008, colour: new Color(fc.isColor ? fc : '#c8d0d8'), sunColour: null, mist: 0, mistFall: .08, mistY: 0, patchy: .7, clouds: 0, cloudShade: .45, cloudHeight: 400, cloudSize: 620, wind: [6, 2.5], wet: 0, sun: null, world: null };
      if (!this.scene.fog) this.scene.fog = new FogExp2(this._air.colour, 0);
    }
    const a = this._air;
    for (const [k, v] of Object.entries(o)) {
      if (k === 'colour' || k === 'sunColour') { if (v == null) a[k] = null; else (a[k] ||= new Color()).set(v); }
      else if (k === 'sun') a.sun = v ? (v.isVector3 ? v.clone().normalize() : new Vector3(...v).normalize()) : null;
      else a[k] = v;
    }
    return a;
  }
  /** The direction towards the sun this view uses for air, glare and cloud shadows. */
  /**
   * A mark on a surface: a scorch, a bullet mark, a footprint, paint, a splat. mesh: what was hit; point and normal:
   * where and which way it faces (from a ray hit: hit.point, hit.normal). Options: size (metres, or [w, h, depth]),
   * angle (turn round the normal; default random), colour, paint (c, s) => {} to draw your own mark on an s x s canvas
   * (cached by key), rough, glow, life (seconds; 0 = stays), max (oldest go first; default 40). Returns the decal
   * (dispose() removes it early).
   * On WebGPU it is no mesh and no draw: a box listed in the lamps' grid, whose picture every lit surface inside it
   * takes on (facing the same way: decals-gpu.js), so hundreds cost a little per pixel where they lie. Things that move
   * through it take it on too while inside, except people (bodies that bend), see-through things and a material
   * given material.decals = false. On WebGL, and past the 16 pictures the grid holds at once, it wraps over the mesh's
   * shape (three's DecalGeometry), one draw each.
   */
  decal(mesh, point, normal, { size = .3, angle = Math.random() * Math.PI * 2, colour = '#1a1410', paint = null, key = null, rough = .9, glow = 0, life = 0, max = 40, opacity = 1 } = {}) {
    if (!mesh?.isMesh) return null;
    const P0 = point.isVector3 ? point.clone() : new Vector3(...point), N0 = (normal?.isVector3 ? normal.clone() : new Vector3(...(normal || [0, 1, 0]))).normalize();
    const look = new Matrix4().lookAt(P0.clone().add(N0), P0, Math.abs(N0.y) > .99 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0));
    const q = new Quaternion().setFromRotationMatrix(look).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), angle));
    const sz = Array.isArray(size) ? new Vector3(size[0], size[1], size[2] ?? Math.max(size[0], size[1])) : new Vector3(size, size, size);
    // the picture, painted now (not at the first frame it shows): the game's, or a soft round mark in its colour
    const pic = paint ? decalTex(paint, key) : decalTex(SOFT_MARK, '_softA');
    const c = new Color(colour);
    const d = { target: mesh, at: P0, q, size: sz, paint: !!paint, key: key || paint || '_softA', pic, colour: c, rough, glow, life, left: life, opacity, alpha: opacity,
      m: null, cell: -1, kind: '', inv: null, r: .5 * sz.length(), tint: paint ? [1, 1, 1] : [c.r, c.g, c.b], glowC: [c.r * glow, c.g * glow, c.b * glow] };
    d.dispose = () => this.dropDecal(d);
    // where the view draws is known (it has drawn): made for it now; before its first frame, as a mesh (as on WebGL),
    // swapped for the grid at that frame if it draws on WebGPU (syncDecals)
    if (!(this._onGpu === true && this.gridDecal(d)) && !this.meshDecal(d)) return null;
    this.decals.push(d); this._decalsDirty = true;
    while (this.decals.length > max) this.dropDecal(this.decals[0]);
    return d;
  }
  /** (decal) In the lamps' grid on WebGPU: false when it can't be (WebGL, no grid, every picture square in use). */
  gridDecal(d) {
    const G = webgpu(); if (!G?.r.gsClustered || HD.gridDecals === false) return false;
    const cell = G.fx.decalCell(G.r, d.key, d.pic); if (cell < 0) return false;
    d.cell = cell; d.kind = 'grid'; d.fx = G.fx;
    d.inv ||= new Matrix4().compose(d.at, d.q, d.size).invert();
    return true;
  }
  /** (decal) A mesh wrapped over what it hit (three's DecalGeometry), one draw: false when nothing of it lies in the box. */
  meshDecal(d) {
    const mesh = d.target; mesh.updateMatrixWorld();
    let geo; try { geo = new DecalGeometry(mesh, d.at, new Euler().setFromQuaternion(d.q), d.size); } catch { return false; }
    if (!geo.attributes.position?.count) { geo.dispose(); return false; }
    const map = d.paint ? d.pic : null;
    const mat = new MeshStandardMaterial({ color: map ? '#ffffff' : d.colour, map, roughness: d.rough, metalness: 0, transparent: true, opacity: d.alpha, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, emissive: d.glow ? d.colour.clone() : new Color(0), emissiveIntensity: d.glow });
    if (!map) mat.alphaMap = decalTex(DEFAULT_DECAL, '_soft');
    const m = new Mesh(geo, mat); m.userData.noAO = true; m.receiveShadow = true; m.renderOrder = 2; m.userData.decal = d;
    this.scene.add(m); d.m = m; d.kind = 'mesh';
    return true;
  }
  /** Each frame, for where the view draws now: decals made for the other way made again for this one. */
  syncDecals(G) {
    const grid = !!G?.r.gsClustered && HD.gridDecals !== false;
    if (!this._decalsDirty && this._decalGrid === grid) return;
    this._decalGrid = grid; this._decalsDirty = false;
    for (const d of [...this.decals]) {
      if (grid ? d.kind === 'grid' : d.kind === 'mesh') continue;
      if (grid && this.gridDecal(d)) { this.unmesh(d); continue; }
      this.ungrid(d);
      if (!d.m && !this.meshDecal(d)) this.dropDecal(d);   // (made again where its mesh is now)
    }
    this.gsGrid = this.decals.filter(d => d.kind === 'grid');
  }
  unmesh(d) { const m = d.m; if (!m) return; d.m = null; m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
  ungrid(d) { if (d.cell >= 0) d.fx?.decalFree(d.cell); d.cell = -1; if (d.kind === 'grid') d.kind = ''; }
  dropDecal(d) {
    const i = this.decals.indexOf(d); if (i < 0) return;
    this.decals.splice(i, 1); this.unmesh(d); this.ungrid(d); d.kind = ''; this._decalsDirty = true;
  }
  /** Removes every decal. */
  clearDecals() { for (const d of [...this.decals]) this.dropDecal(d); }
  tickDecals(dt) {
    for (const d of [...this.decals]) {
      if (!d.life) continue;
      d.left -= dt; if (d.left <= 0) { this.dropDecal(d); continue; }
      d.alpha = d.opacity * Math.min(1, d.left / Math.min(1, d.life * .3));
      if (d.m) d.m.material.opacity = d.alpha;
    }
  }
  /**
   * Bakes the light at a point into a light probe: how bright and what colour the surroundings are
   * from every direction (a sunny window, a red neon sign, green grass bouncing light up). Lit
   * materials nearby then pick up that colour, which makes rooms and caves look lit from inside
   * instead of flat. Bake once the level is built (in reset(), or after a big change), not every
   * frame. Several probes blend by where the camera is (or v.probeAt, e.g. the player): give each a
   * radius. strength scales them; lower the view's amb (hemisphere light) when using probes.
   * Returns a promise of the probe ({ at, radius, sh }) once its light is read back (a frame or two);
   * v.clearProbes() removes them all.
   */
  bakeLight(at, { radius = 10, strength = 1, size = 32 } = {}) {
    // on the renderer the view draws with: baking on WebGL built every WebGL shader for a view that never uses them
    const G = gpuFor(this), r = G ? G.r : renderer(); if (!r) return Promise.resolve(null);
    gpuSwap(this, G);
    const pos = at.isVector3 ? at.clone() : new Vector3(...at);
    const was = this.probe?.intensity ?? 0; if (this.probe) this.probe.intensity = 0;   // don't bake the probe into itself
    const env = this.scene.environment; let rt = null;
    try {
      this.scene.updateMatrixWorld(); this.scene.environment = this.envFor(G);
      if (G) rt = G.fx.bakeProbe(r, this.scene, pos, size);
      else {
        rt = new WebGLCubeRenderTarget(size, { type: HalfFloatType });
        const cc = new CubeCamera(.05, 400, rt); cc.position.copy(pos); this.scene.add(cc);
        try { cc.update(r, this.scene); } finally { cc.removeFromParent(); r.setRenderTarget(null); }
      }
    } catch { rt?.dispose(); return Promise.resolve(null); }
    finally { this.scene.environment = env; if (this.probe) this.probe.intensity = was; }
    // the read back is async (it has to be on WebGPU): the probe joins once its numbers are in
    const gen = this.probeGen ||= 1;
    return LightProbeGenerator.fromCubeRenderTarget(r, rt).then(probe => {
      rt.dispose();
      if (!probe?.sh || gen !== this.probeGen) return null;
      const p = { at: pos, radius, strength, sh: probe.sh };
      this.probes.push(p);
      if (!this.probe) { this.probe = new LightProbe(); this.scene.add(this.probe); }
      this.blendProbes();
      return p;
    }, () => { rt.dispose(); return null; });
  }
  /**
   * Bounce light (baked global illumination): light that has hit the floor, the walls and the props
   * and lights everything else, from a 3D grid of probes over box (a Box3, { min: [x, y, z], max }, or
   * an Object3D to cover). A red wall tints the floor beside it, a sunlit patch lifts a dark room, a
   * cave is lit from its mouth. spacing: metres between probes (more probes for a bigger box are capped,
   * so they spread out); bounces: extra passes of light bounced around (0 = only once); size: each
   * probe's picture. Baked by whichever renderer draws the view, the first frame after this (and after
   * a move between WebGL and WebGPU); v.bounce(...).bake() again after the level changes. Lower the
   * view's amb when using it. Works on WebGL and WebGPU (three.js LightProbeGrid).
   */
  bounce(box, { spacing = 1.5, bounces = 1, size = 8, far } = {}) {
    this.clearBounce();
    const b = boxOf(box), dims = b.getSize(new Vector3()), centre = b.getCenter(new Vector3());
    let sp = Math.max(.25, spacing); const count = d => Math.max(1, Math.round(d / sp));
    while (count(dims.x) * count(dims.y) * count(dims.z) > 512) sp *= 1.15;
    const gi = this.gi = { centre, dims, res: [count(dims.x), count(dims.y), count(dims.z)], bounces, size: Math.max(4, Math.round(size / 4) * 4), far: far ?? Math.max(20, dims.length() * 2), grids: {}, dirty: { gl: true, gpu: true } };
    gi.bake = () => { gi.dirty.gl = gi.dirty.gpu = true; return gi; };
    gi.remove = () => this.clearBounce();
    return gi;
  }
  /** Removes the bounce light. */
  clearBounce() { const gi = this.gi; if (!gi) return; for (const g of Object.values(gi.grids)) { g.removeFromParent(); g.dispose(); } this.gi = null; }
  /**
   * Reflections that fit a room: shiny things inside box (a Box3, { min, max } or an Object3D) reflect
   * the room itself from its middle, moved to where each reflection meets the walls (box-projected), so
   * a polished floor shows the walls and windows in the right places instead of a far-off sky. Every lit
   * standard material on a mesh inside the box gets it (or only meshes: [...]); a material shared with
   * things outside gets it too. size: the picture's size; strength: how strong. Baked the first frame
   * after this; room.bake() again after the room changes. Works on WebGL and WebGPU.
   */
  room(box, { size = 128, strength = 1, meshes = null, far } = {}) {
    const b = boxOf(box), dims = b.getSize(new Vector3()), centre = b.getCenter(new Vector3());
    const spec = {
      size, far: far ?? Math.max(10, dims.length() * 2),
      uniforms: { gsRoomAt: { value: centre }, gsRoomSize: { value: dims }, gsOrigin: ORIGIN_U },   // (gsRW is where the drawing is, near its centre: origin.js)
      vertexHead: 'varying vec3 gsRW;\n',
      vertex: [['#include <project_vertex>', 'after', '\n  gsRW = (modelMatrix * vec4(transformed, 1.)).xyz;\n#ifdef USE_INSTANCING\n  gsRW = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).xyz;\n#endif\n']],
      fragmentHead: ROOM_GLSL,
      fragment: [['#include <envmap_physical_pars_fragment>', 'replace', () => ShaderChunk.envmap_physical_pars_fragment
        .replace('reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );', 'reflectVec = gsBox( transformDirectionByInverseViewMatrix( reflectVec, viewMatrix ) );')
        .replace('vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );', 'vec3 worldNormal = gsBox( transformNormalByInverseViewMatrix( normal, viewMatrix ) );')]],
    };
    const rt = new WebGLCubeRenderTarget(size, { type: HalfFloatType });
    const room = { spec, rt, box: b, mats: new Set(), dirty: { gl: true, gpu: true } };
    const list = meshes || []; if (!meshes) this.scene.traverse(o => { if (o.isMesh && o.geometry) { o.geometry.boundingBox || o.geometry.computeBoundingBox(); o.updateWorldMatrix(true, false); if (b.containsPoint(o.geometry.boundingBox.getCenter(GV).applyMatrix4(o.matrixWorld))) list.push(o); } });
    for (const o of list) for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m?.isMeshStandardMaterial || room.mats.has(m)) continue;
      room.mats.add(m); m.envMap = rt.texture; m.envMapIntensity = strength; lookPatch(m, 'room', spec); m.needsUpdate = true;
    }
    room.bake = () => { room.dirty.gl = room.dirty.gpu = true; return room; };
    room.remove = () => { const i = this.rooms.indexOf(room); if (i >= 0) this.rooms.splice(i, 1); for (const m of room.mats) if (m.envMap === rt.texture) { m.envMap = null; m.needsUpdate = true; } rt.dispose(); };
    (this.rooms ||= []).push(room);
    return room;
  }
  /**
   * Cluster detail (a Nanite-style level of detail; see autoDetail below) happens by itself for big still
   * meshes. This asks for it on smaller ones too, or changes how fine it is: meshes (or groups) and
   * { px } pixels their simpler parts may be out by (default HD.detailPx, 1; lower is finer and costs
   * more). v.detail(meshes, false) keeps them out and draws them whole. v.details.map.size: how many
   * meshes are in; HD.info.detail: what the last frame drew through it.
   */
  detail(meshes, o = {}) {
    const set = o === false ? false : typeof o.px === 'number' ? o.px : true;
    for (const m of [meshes].flat(Infinity)) m?.traverse?.(x => { if (x.isMesh && !x.isDetailMesh && !x.isCutMesh) x.userData.detail = set; });
    return this;
  }
  /** Is cluster detail still getting ready: a big mesh not looked at yet or waiting for its clusters, or a twin waiting for its shader? (tests, the engine test scenes) */
  detailPending() {
    if (HD.detail === false) return false;
    const D = this.details;
    if (D) for (const e of D.map.values()) if (!e.twin || e.parts.some(p => p.twin.layers.mask & HOLD_BIT)) return true;
    let more = false;
    eachShown(this.scene, o => { if (!more && !D?.map.has(o) && o.isMesh && (detailable(o) || (reliefBudget() > 0 && detailFits(o) && reliefReady(o, reliefOf(o))))) more = true; });
    return more;
  }
  /**
   * Occlusion culling: what is fully hidden behind other things is skipped before the frame is drawn (city
   * blocks behind a row of buildings, rooms behind walls, a village behind a hill). It is automatic: a view
   * with enough in it to be worth it finds what hides things from the last frame's own depth, so nothing
   * has to be listed and anything solid counts (v.autoOcclude = false, or HD.occludeDepth = false, to stop
   * that). A view where it saves next to nothing stops by itself and looks again later.
   * occluders(list) also gives it boxes that hide things, for where there is no depth to go by (AR, the
   * first frames): boxes { x0, x1, y0, y1, z0, z1 } in world metres (city.occluders() gives them), Box3s, or
   * solid box-like meshes; null takes them away. List only big, solid, still things (not glass, not fences).
   * Every mesh (by its bounding box), each part of a cluster detail mesh and each copy of gs.props is
   * tested; mark a mesh userData.noOcclude to always draw it. Hidden things still cast their shadows, are
   * still hit by raycasts and still show in reflections. Same on WebGL and WebGPU (it runs on the CPU, see
   * occlusion.js). o: { max: boxes drawn per frame (nearest first, 300), w: the boxes' picture width (128) }.
   * v.occlusion.stats: { boxes, tested, hidden, ms, depth } for the last frame; HD.info.occluded: meshes hidden.
   */
  occluders(list, o = {}) {
    if (!list) { showAll(this); this.occlusion?.set([]); return this; }
    (this.occlusion ||= new Occlusion(o)).set(list); Object.assign(this.occlusion, o);
    return this;
  }
  /**
   * Shaders built in the background (WebGL and WebGPU): something that needs a shader the view hasn't
   * built yet (a new kind of thing appearing mid-round, a material swapped in) waits, hidden, for a
   * frame or two while three builds it on the driver's own threads (compileAsync: WebGPU's
   * createRenderPipelineAsync, WebGL's KHR_parallel_shader_compile), instead of the whole frame stopping
   * while it builds. What's there on the view's first frame, or when precompile() finishes, never
   * waits. It waits at most HD.holdMs (500 ms), then draws anyway (a cluster twin waits for its shader
   * however long it takes: its mesh draws meanwhile). userData.noHold draws a mesh at
   * once; HD.hold = false turns it all off.
   */
  holdNew(r, skip, now, rt = null, mrt = null) {   // rt, mrt: the picture the scene is drawn into (shaders are built for it)
    const held = this.held ||= new Map(), seen = this.shSeen ||= new Set(), jobs = this.shJobs ||= new Map();
    this._holdRT = rt;   // (and the fades' twins, on WebGL: fadeReady)
    // the ones whose shaders are ready (or waited long enough) come back. A thing something else draws in the
    // place of (a cluster twin: its mesh, detailShow) waits for its build however long that takes (j.keep): on
    // WebGPU three leaves a thing out of the frame while its pipeline is being made, so a twin let go early drew
    // nothing, and its mesh was hidden for it by then
    const late = j => !j.keep && now - j.t0 > HD.holdMs;
    for (const [o, j] of held) if (j.done || late(j) || skip || HD.hold === false) { o.layers.mask = (o.layers.mask | 1) & ~(1 << HOLD_LAYER); held.delete(o); }
    for (const [k, j] of jobs) if (j.done || late(j)) { seen.add(k); jobs.delete(k); }
    if (skip || HD.hold === false) return;
    // the first frame, and after warm() or precompile() (which built the hidden things' shaders too), are where
    // the waiting starts from: what's there now draws at once
    if (this.holdBase !== true) {
      const all = this.holdBase === 'all'; this.holdBase = true;
      // (not a set of copies with none in it: the frame draws it not at all, so nothing of its was built, and later, with
      // copies in it, it waits for its shader as a new thing does: Long Shadow's birds, 68 ms at the first shot)
      (all ? eachThing : eachShown)(this.scene, o => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.material && (all || !o.isInstancedMesh || o.count > 0 || !o.instanceMatrix?.count)) seen.add(shaderKey(o)); });
      return;
    }
    eachShown(this.scene, o => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.material || !(o.layers.mask & 1)) return;
      const k = shaderKey(o);
      if (seen.has(k)) return;
      if (o.userData.noHold) return;
      let j = jobs.get(k);
      if (!j) {
        jobs.set(k, j = { t0: now, done: false });
        const fin = () => { j.done = true; };
        // built for the picture the scene is drawn into, with the thing on the camera's layer when its
        // build starts (on WebGPU it waits its turn, compileGPU, and by then the thing is held back)
        const forPicture = go => {
          const rt0 = r.getRenderTarget(), m0 = r.getMRT?.(), lm = o.layers.mask;
          try { o.layers.mask = lm | 1; r.setRenderTarget(rt); r.setMRT?.(mrt); return go(); } finally { o.layers.mask = lm; r.setRenderTarget(rt0); r.setMRT?.(m0 ?? null); }
        };
        // (WebGPU: the picture is the scene pass's own layout, set when the build's turn comes: compileGPU)
        const onLayer = go => inReach(o, go);
        try { (r.isWebGPURenderer ? compileGPU(r, o, this.cam, this.scene, onLayer, this) : Promise.resolve(forPicture(() => r.compileAsync(o, this.cam, this.scene)))).then(fin, fin); } catch (_) { fin(); }
      }
      if (!j.done) { if (o.isDetailMesh || o.isCutMesh) j.keep = true; held.set(o, j); o.layers.mask = (o.layers.mask & ~1) | (1 << HOLD_LAYER); }
    });
    HD.info.held = held.size;
  }
  /**
   * The rest of the scene's shaders, built in the background (WebGPU): everything in the scene the frames so
   * far have not drawn (hidden things, what is behind the camera) is built for the picture the scene is drawn
   * into, one kind of thing at a time, a few milliseconds a frame, so that turning round, or a thing switched
   * on mid-round, does not stop a frame while its shader builds. Listed on the view's first frame, after
   * warm() or precompile(), and when the picture's layout changes (another quality tier, the upscaler coming
   * on: three keeps shaders by it). all: the whole list now, however long it takes (precompile); gives a
   * promise then. v.shadersLeft: how many things are still to look at.
   */
  buildAhead(r, ch, all = false) {
    const A = this.shAhead ||= { key: null, r: null, list: [], done: new Set(), busy: false, spent: 0, all: null, n: 0 };
    A.spent = 0;
    if (A.key !== ch.key || A.r !== r || this.aheadAgain) {
      A.key = ch.key; A.r = r; this.aheadAgain = false; A.done.clear(); A.list.length = 0;
      // the nearest first, and before all what the camera carries (a first-person rifle shown once play starts): the
      // list can take a minute to get through on a slow phone, well past the loading screen (Long Shadow's mission 2 on
      // the build machine, 2026-11-13), and in the scene's order its rifle came up in play before its turn and made
      // its shaders in that frame, 124 ms. (By where each was last drawn: worked out again, a deep scene's matrices
      // took longer than the list.)
      const cm = this.cam.matrixWorld.elements, cx = cm[12], cy = cm[13], cz = cm[14], far = new Map();
      this.scene.traverse(o => {
        if (!aheadFits(o)) return;
        let d = -1; for (let p = o.parent; p; p = p.parent) if (p === this.cam) { d = -2; break; }
        if (d === -1) { const e = o.matrixWorld.elements, x = e[12] - cx, y = e[13] - cy, z = e[14] - cz; d = x * x + y * y + z * z; }
        far.set(o, d); A.list.push(o);
      });
      A.list.reverse(); A.list.sort((a, b) => far.get(b) - far.get(a));   // (taken from the end: the nearest first, and a tie in the scene's order)
    }
    if (all && !A.all) { let ok; A.all = new Promise(res => { ok = res; }); A.all.ok = ok; }
    const fin = () => { A.busy = false; if (!A.list.length && A.all) { const p = A.all; A.all = null; p.ok(); } };
    const seen = this.shSeen ||= new Set(), key = A.key;
    const step = () => {
      for (;;) {
        if (A.key !== key || A.r !== r || !A.list.length || (!A.all && A.spent > AHEAD_MS)) return fin();   // (the rest next frame)
        const o = A.list.pop();
        if (!aheadFits(o) || !inScene(o, this.scene)) continue;
        const k = shaderKey(o);
        if (A.done.has(k)) continue;
        A.done.add(k); A.n++;
        const timed = go => { const t = performance.now(); try { return inReach(o, go); } finally { A.spent += performance.now() - t; } };
        const next = () => { seen.add(shaderKey(o)); step(); };
        compileGPU(r, o, this.cam, this.scene, timed, this).then(next, step);
        return;
      }
    };
    if (!A.busy) { A.busy = true; step(); }
    return A.all || Promise.resolve();
  }
  /**
   * The view now draws with another renderer than last frame: WebGL after WebGPU or back, or a new WebGPU device made
   * after the last one was lost (gpu.js lostGPU). What it noted about built shaders was about the old one: the things
   * held back for theirs are let go, and the scene is looked at afresh, as on a view's first frame.
   */
  newRenderer() {
    if (this.held) { for (const o of this.held.keys()) o.layers.mask = (o.layers.mask | 1) & ~(1 << HOLD_LAYER); this.held.clear(); }
    this.shJobs?.clear(); this._fadeFrames = 0; this.shSeen?.clear(); this.shAhead = null; this.shPre = null; this.envKeys = null;
    this.holdBase = false; this.warmed = false; this.aheadAgain = true;
  }
  /**
   * The shadow maps' shaders, ahead (WebGPU). A thing's shadow is drawn with a shader of its own (three's shadow
   * material with the thing's skinning, bones, position and cut-out nodes), made in the frame the thing is first drawn
   * into a map, and buildAhead builds the scene pass's alone. So a man's nearer level of detail, a thing switched
   * on, or a kind of thing first coming into the sun's view made its shadow shader in the middle of play: 2 to 24 ms
   * each on the build machine, 107 ms for the frame Long Shadow's bullet camera first came up close to the men
   * (2026-11-13). Here each thing that casts a shadow, of a kind not drawn this way yet, is drawn once through each
   * shadow light's own node into a 4 x 4 stand-in of its map (hd3d-gpu.js shadowOps pre), on a layer of its own and
   * with it and its parents shown for the draw, which makes its shader and pipeline as the real draw will want them.
   * all: everything waiting at once (the view's first frame, and a round getting ready under the loading screen);
   * else a few kinds a frame, of what came into the scene since (taken from the scene's list each time it changes).
   */
  shadowAhead(r, G, all) {
    const S = this.shPre ||= { seen: new Set(), looked: new WeakSet(), list: null, todo: [], sig: '' }, ops = G.shOps ||= G.fx.shadowOps(r);
    const lights = [];
    for (const l of this.shL) { const sh = l.shadow, node = sh.shadowNode; if (!l.isPointLight && sh.map && node?.gsSplit && node.shadowMap === sh.map) lights.push(l); }
    if (!lights.length) return;
    const sig = lights.map(l => l.id).join(','); if (sig !== S.sig) { S.sig = sig; S.seen.clear(); S.looked = new WeakSet(); S.list = null; }   // (another light: everything again)
    // (what has been looked at is not listed again when the scene changes: a scene that changes every frame would otherwise only ever get to its first few hundred things)
    const T = thingsOf(this.scene);
    if (T !== S.list) { S.list = T; S.todo.length = 0; for (let i = T.length - 1; i >= 0; i--) { const o = T[i]; if (o.castShadow && !S.looked.has(o) && aheadFits(o)) S.todo.push(o); } }
    const pick = [];
    for (let looked = 0; S.todo.length && (all || (looked < PRE_LOOK && pick.length < PRE_N)); looked++) {
      const o = S.todo.pop();
      if (!o.castShadow || !aheadFits(o) || !inScene(o, this.scene)) continue;
      S.looked.add(o);
      const k = shaderKey(o) + '|' + (o.skeleton ? o.skeleton.bones.length : '');   // (three keys a skinned thing's shaders by its bones too)
      if (S.seen.has(k)) continue;
      S.seen.add(k); pick.push(o);
    }
    if (!pick.length) return;
    const was = [], shown = [];
    for (const o of pick) {
      was.push(o.layers.mask, o.visible, o.frustumCulled);
      o.layers.mask |= PRE_BIT; o.visible = true; o.frustumCulled = false;
      for (let p = o.parent; p && p !== this.scene; p = p.parent) if (!p.visible) { p.visible = true; shown.push(p); }
    }
    ops.scene = this.scene; ops.camera = this.cam;
    try { for (const l of lights) ops.pre(l, PRE_BIT); }
    finally {
      for (let i = 0; i < pick.length; i++) { const o = pick[i]; o.layers.mask = was[i * 3]; o.visible = was[i * 3 + 1]; o.frustumCulled = was[i * 3 + 2]; }
      for (const p of shown) p.visible = false;
      HD.info.shAhead = (HD.info.shAhead || 0) + pick.length;
    }
  }
  /**
   * three keys every lit shader by the scene's lights (how many of each kind, which cast shadows), its sky light and its
   * fog as well as by the thing, and the kit's own key for a shader (shaderKey) has none of that. So when a game sets up
   * other lights or another sky (Long Shadow's next mission, under the loading screen), what was built ahead for the
   * hidden things before was taken as built, and each was made again in the frame it first showed: the rifle in your
   * hands, built while the card sat in the feed, 124 ms in the first frame of mission 2's play. A setting of those not
   * met before has them built again: buildAhead lists the scene again, and a thing hidden or out of view (whose kind
   * nothing in view shares: what is in view was drawn, and so made, for them in this frame) is no longer taken as built,
   * so if it shows before its turn it waits for its shader as a new thing does (holdNew). (Back to a setting met before: its shaders
   * are still kept.)
   */
  envCheck(r) {
    let k; try { k = r._nodes.getCacheKey(this.scene, r.lighting.getNode(this.scene)); } catch (e) { return; }
    const E = this.envKeys ||= new Set();
    if (E.has(k)) return;
    E.add(k);
    if (E.size < 2) return;
    this.aheadAgain = true;
    const seen = this.shSeen; if (!seen?.size) return;
    // (shown and in the camera's view: a thing shown but out of view was not drawn, so not made for the new setting either)
    const draws = o => (o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.material, shown = new Set(), keys = new Set(), cam = this.cam;
    VIEW_FR.setFromProjectionMatrix(VIEW_M.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse), cam.coordinateSystem, cam.reversedDepth);
    const inView = o => { try { return !o.frustumCulled || VIEW_FR.intersectsObject(o); } catch (_) { return true; } };
    eachShown(this.scene, o => { if (draws(o) && (o.layers.mask & 1) && inView(o)) { shown.add(o); keys.add(shaderKey(o)); } });
    eachThing(this.scene, o => { if (draws(o) && !shown.has(o)) { const sk = shaderKey(o); if (!keys.has(sk)) seen.delete(sk); } });
  }
  /** Things whose shaders are still being built or still to look at (held back, close-up, and the rest of the scene). */
  get shadersLeft() { return (this.held?.size || 0) + (this.shJobs?.size || 0) + (this.shAhead ? this.shAhead.list.length + (this.shAhead.busy ? 1 : 0) : 0); }
  // Occlusion culling for this frame (occlude.js): works out what is hidden behind other things, from the last
  // frame's own depth (depth: this frame may use it) or the boxes the game listed. Nothing is hidden yet:
  // hideNow() does that round the main draw alone, so that everything else that looks at the scene (shadows,
  // raycasts, bakes, contact shadows) finds it whole. Gives the job for this frame's depth picture, or null.
  occludeStep(depth, pw, ph) {
    const I = HD.info, cam = this.cam;
    const job = occludeFrame(this, cam, { world: false, on: HD.occlude !== false, depth: depth && HD.occludeDepth !== false && this.autoOcclude !== false && !!cam.isPerspectiveCamera, other: lastView !== this, W: pw, H: ph, tris: this.drew?.[0] || 0, calls: this.drew?.[1] || 0, sleep: HD.occludeSleep, texels: HD.occludeTexels });
    const A = this.occAuto; I.occluded = A.hidden; I.occTris = A.tris; I.occAwake = A.awake; I.occMs = A.ms; I.occPays = A.pays;
    return job;
  }
  showHidden() { showAll(this); }
  /**
   * Gives back everything this view keeps off the camera's layer: pieces merged by static batching, ones
   * waiting for their shaders, and ones hidden behind occluders. For kit code that moves objects into
   * another view's scene (a board game's table going from its 3D room into AR): this view stops
   * drawing, so it would never put them back itself and they would stay unseen in the other view.
   */
  release() {
    if (this.batches?.list.length) unbatchAll(this);
    stillOff(this.scene);
    detailDropAll(this);
    if (this.held?.size) { for (const o of this.held.keys()) o.layers.mask = (o.layers.mask | 1) & ~(1 << HOLD_LAYER); this.held.clear(); }
    occludeDrop(this);
    return this;
  }
  // bounce light and room reflections, baked by the renderer drawing this frame (G: WebGPU) when they need it
  bakeExtras(G, r) {
    const k = G ? 'gpu' : 'gl', gi = this.gi;
    if (!(gi && (gi.dirty[k] || !gi.grids[k]?.parent)) && !this.rooms?.some(rm => rm.dirty[k])) return;   // nothing to bake this frame
    this.showHidden();   // (the bakes look from elsewhere, so everything is drawn)
    // (three's bakes put their cameras where the probes and rooms are in the world's own numbers: drawn with the scene in those too)
    const near = ORIGIN.x || ORIGIN.z; if (near) originOff(this);
    try { this.bakeExtras1(G, r); } finally { if (near) originOn(this); }
  }
  bakeExtras1(G, r) {
    // light, not a picture (no tone mapping), with the sun's shadows in it as the frame will have them
    const tm = r.toneMapping, sh = r.shadowMap.enabled; r.toneMapping = 0; r.shadowMap.enabled = tier().shadow > 0;
    this.scene.updateMatrixWorld();
    this.shadowLights(true, !!G); if (!G) r.shadowMap.needsUpdate = true;
    try { this.bakeExtras2(G, r); } finally { r.toneMapping = tm; r.shadowMap.enabled = sh; if (!G) { this.shadowsDirty(); r.shadowMap.needsUpdate = true; } }
  }
  bakeExtras2(G, r) {
    const gi = this.gi, k = G ? 'gpu' : 'gl';
    if (gi) {
      gi.grids[G ? 'gl' : 'gpu']?.removeFromParent();
      let g = gi.grids[k];
      if (!g) { g = gi.grids[k] = G ? new G.fx.LightProbeGrid(gi.dims.x, gi.dims.y, gi.dims.z, ...gi.res) : new LightProbeGridWebGL(gi.dims.x, gi.dims.y, gi.dims.z, ...gi.res); g.position.copy(gi.centre); }
      if (!g.parent) this.scene.add(g);
      if (gi.dirty[k]) {
        gi.dirty[k] = false; g.updateMatrixWorld(true);
        try { g.bake(r, this.scene, { cubemapSize: gi.size, near: .05, far: gi.far, bounces: gi.bounces }); } catch (e) { console.warn('bounce light did not bake', e); }
      }
    }
    for (const rm of this.rooms || []) {
      if (!rm.dirty[k]) continue;
      rm.dirty[k] = false;
      try {
        if (G) G.fx.bakeRoom(r, this.scene, rm.spec);
        else {
          const cc = rm.cam ||= new CubeCamera(.05, rm.spec.far, rm.rt); cc.position.copy(rm.spec.uniforms.gsRoomAt.value); this.scene.add(cc); cc.updateMatrixWorld(true);
          try { cc.update(r, this.scene); } finally { cc.removeFromParent(); r.setRenderTarget(null); }
          rm.rt.texture.needsPMREMUpdate = true;
        }
      } catch (e) { console.warn('room reflections did not bake', e); }
    }
  }
  clearProbes() { this.probeGen = (this.probeGen || 1) + 1; this.probes = []; if (this.probe) { this.probe.removeFromParent(); this.probe = null; } }
  blendProbes() {
    const L = this.probe; if (!L || !this.probes.length) return;
    const at = this.probeAt?.isVector3 ? this.probeAt : this.probeAt ? GV.set(this.probeAt.x || 0, this.probeAt.y || 0, this.probeAt.z || 0) : this.cam.position;
    const c = L.sh.coefficients; for (const v of c) v.set(0, 0, 0);
    let sum = 0, strength = 0;
    for (const p of this.probes) {
      const d = p.at.distanceTo(at), w = Math.max(0, 1 - d / p.radius) ** 2 + 1e-4 / (1 + d * d);
      sum += w; strength += p.strength * w;
      for (let i = 0; i < 9; i++) c[i].addScaledVector(p.sh.coefficients[i], w);
    }
    if (sum > 0) { for (const v of c) v.multiplyScalar(1 / sum); L.intensity = strength / sum; }
  }
  sunDir(out = new Vector3()) { const a = this._air; return a?.sun ? out.copy(a.sun) : this.sun?.dir ? out.copy(this.sun.dir) : this.sun?.isLight ? out.copy(this.sun.position).sub(this.sun.target.position).normalize() : out.set(.4, .8, .3).normalize(); }
  /**
   * Reflections and sky light from a scene of your own (a sky dome, a painted room): it's rendered
   * once into the view's environment, used instead of the kit's soft studio. gs.sky's Sky does this
   * for you with { env: true }. Set v.env = null to go back to the studio. The view keeps the scene
   * and makes them again if it moves between WebGL and WebGPU; o.wrap(bake) runs round each bake
   * (to change the scene just for its reflections).
   */
  envFrom(scene, o = {}) {
    // kept, so the view can make them again on the other renderer (WebGL / WebGPU) when it moves
    this.envSrc = { scene, o, n: (this.envSrc?.n || 0) + 1, tex: null };
    const G = this._onGpu && webgpu();
    return G ? this.gpuEnvBake(G) : this.glEnvBake();
  }
  glEnvBake() {
    const r = renderer(), S = this.envSrc; if (!r) return null;
    const { size = 256, blur = .03, far = 5000 } = S.o;
    swapTwins(S.scene, null);
    // one generator kept for the app (making one compiles its shaders), and the same size as the
    // studio's, so swapping between them doesn't rebuild every material's shader
    const bake = () => (pmGen ||= new PMREMGenerator(r)).fromScene(S.scene, blur, .1, far, { size }), rt = S.o.wrap ? S.o.wrap(bake) : bake();
    if (this.envRT && this.envRT !== rt) this.envRT.dispose();
    this.envRT = rt; this.env = S.tex = rt.texture; this._glEnvN = S.n; return rt.texture;
  }
  gpuEnvBake(G) {
    const S = this.envSrc;
    swapTwins(S.scene, G, null, null, this._air);
    const bake = () => G.fx.envFrom(G.r, S.scene, S.o), rt = S.o.wrap ? S.o.wrap(bake) : bake();
    if (this._gpuEnvRT && this._gpuEnvRT !== rt) this._gpuEnvRT.dispose();
    this._gpuEnvRT = rt; this.env = S.tex = rt.texture; this._gpuEnvN = S.n; this._gpuEnvR = G.r; return rt.texture;
  }
  // the reflections for the renderer drawing this frame: the studio, or the view's own (envFrom),
  // made again for this renderer if they were last made on the other one
  envFor(G) {
    const S = this.envSrc;
    if (S && this.env !== S.tex) this.envSrc = null;   // the game set v.env itself (or back to null)
    if (this.envSrc) {
      if (G) { if (this._gpuEnvN !== S.n || this._gpuEnvR !== G.r) this.gpuEnvBake(G); else this.env = S.tex = this._gpuEnvRT.texture; }   // (made again on a new renderer: a lost device's pictures are gone)
      else if (this._glEnvN !== S.n) this.glEnvBake(); else this.env = S.tex = this.envRT.texture;
    }
    return G ? (this.envSrc ? this.env : gpuEnv(G)) : this.env || envTex;
  }
  // the kit's air goes into every material before it first draws
  patchAir(all = false) { if (!this._air) return; if (all) this.scene.traverse(airOf); else this.scene.traverseVisible(airOf); }
  airUniforms() {
    const a = this._air; AIR.gsAirOn.value = a ? 1 : 0; if (!a) return;
    const U = AIR; this.sunDir(U.gsSun.value);
    U.gsAirC.value.copy(a.colour);
    if (a.sunColour) U.gsAirSun.value.copy(a.sunColour); else U.gsAirSun.value.copy(a.colour).lerp(this.sun?.color || C_WARM, .35).multiplyScalar(1.15);
    U.gsHaze.value = a.haze; U.gsMist.value.set(a.mist, a.mistFall, a.mistY, a.patchy);
    U.gsCloud.value.set(a.clouds, a.clouds > 0 ? a.cloudShade : 0, a.cloudHeight, a.cloudSize);
    const w = a.wind; U.gsDrift.value.set((w.x ?? w[0]) * this.t / a.cloudSize, (w.z ?? w[1]) * this.t / a.cloudSize);
    U.gsWet.value = a.wet; U.gsNoise.value = noiseTex();
    const wx = a.world, cv = wx?.cover?.ready !== undefined && wx.cover.ix === wx.cover.ix ? wx.cover : null;   // (a cover that has been placed)
    U.gsWx.value.set(wx ? wx.wet : 0, wx ? wx.snow : 0, wx ? wx.pools : 0, cv ? cv.cell * 1.3 : 0); U.gsRain.value.set(wx?.rain ?? 0, wx?.runT ?? 0, 0, 0);
    if (cv) { U.gsCover.value = cv.texture; U.gsCoverAt.value.set(cv.cx, cv.cz, 1 / cv.span, cv.reach); } else U.gsCoverAt.value.w = 0;
    U.gsCasc.value.x = U.gsCasc.value.y = -1;
    const cs = this.cascade;
    if (cs?.near.visible && cs.near.castShadow && cs.near.parent) {
      // three numbers the sun lights in the order it meets them in the scene, shadow casters first
      const dirs = []; eachShown(this.scene, o => { if (o.isDirectionalLight && o.layers.test(this.cam.layers)) dirs.push(o); });
      const key = l => (l.castShadow ? 2 : 0) + (l.map ? 1 : 0);
      dirs.sort((p, q) => key(q) - key(p));
      U.gsCasc.value.x = dirs.indexOf(cs.near); U.gsCasc.value.y = dirs.indexOf(cs.far); U.gsCasc.value.z = cs.fade;
    }
  }
  /**
   * Marks shiny surfaces (a wet floor, a polished wall, a car) for reflections of what is around them.
   * On WebGPU on the best phones they are ray traced (high and ultra): the surface shows what is behind
   * the camera, off the screen's edge and hidden behind other things too. Other phones on WebGPU (high
   * and ultra) and WebGL (ultra) reflect what is on screen; elsewhere the surfaces keep their usual look.
   * Give a thing `userData.moves = true` if it moves from the start (it is then never taken for part of
   * the still level), `userData.noTrace = true` to keep it out of traced reflections.
   */
  reflect(...meshes) {
    for (const m of meshes.flat()) if (m && !this.reflectors.includes(m)) { this.reflectors.push(m); m.userData.gsReflect = true; }
    if (this.reflectors.length && HD.traced !== false && steered().traced !== false && (HD.traced === true || phoneClass() === 'top')) webgpu()?.fx?.traceKit?.();   // (the ray tracing part, on its way before the first frame)
    return this;
  }
  /**
   * Soft contact shadows on a floor: the dark, blurry patch right under things that makes them sit
   * on the ground. y: the floor height; size: metres across; follow it with cs.at(x, z). Medium tier
   * and up.
   */
  contact(o = {}) { const cs = new ContactShadows(o); this.scene.add(cs.group); this.contacts.push(cs); return cs; }
  /**
   * A pool of real lights placed each frame at the nearest of many lamp spots (the far ones only glow). Call
   * v.lampLights(maxDistance) once, then v.placeLamps(spots, x, y, z) per frame with spots = [{ x, y, z, col, i,
   * flick }] and, for any of them: reach (metres it lights, else maxDistance), dir ([x, y, z]: a spot light shining
   * that way), angle (its half width, radians), soft (0..1, its edge), shadow (true: it casts shadows, the nearest by
   * quality), shape (a light shape it shines through: 'headlamp', 'window', 'blinds', 'cage', 'leaves', 'grille',
   * 'stained', 'bars'), near (metres from the lamp its shadow starts: past a car's own nose for its headlights; .1),
   * tube ([x, y, z]: a neon tube from x, y, z to there) or rect ({ w, h, normal }: a glowing sign). lamps.js says how;
   * neon() and sign() make tubes and signs with their spots.
   */
  lampLights(dist = 7) {
    this.lampDist = dist;
    const P = this.lampPool ||= new LampPool(this, dist); P.dist = dist;
    for (let i = 0; i < 4; i++) { const l = new PointLight('#ffd8a0', 0, dist, 1.6); this.scene.add(l); this.lamps.push(l); P.adopt(l); }
    return this;
  }
  placeLamps(spots, x, y, z, t = 0) {
    // on WebGPU, clustered lighting (hd3d-gpu.js manyLights) lights 8 times as many of the nearest lamps
    // for about the same cost; the pool grows as needed (WebGL keeps its few, and a few spot lights with shadows)
    const G = gpuFor(this), many = HD.manyLights !== false && !!G?.r.gsClustered;
    const P = this.lampPool ||= new LampPool(this, this.lampDist ?? 7);
    // A light switching on or off changes how many lights every material is built for on WebGL, so three.js
    // rebuilds all their shaders: a stutter each time a lamp came into or left range. So there the pooled
    // lights stay switched on (the tier sets how many) and a spare one just goes dark.
    P.place(spots, x, y, z, t, tier(), HD.tier, many, !!G);
  }
  /** What the lamps' shadows did last frame (WebGPU): slots with a lamp, slots drawn, slots waiting their turn. */
  get lampShadows() { return this.lampPool?.stats || null; }
  /**
   * A soft light on a person's face from beside the camera, as a film crew's fill or eye light, for close-ups and cutscenes: it lifts the
   * shadow side of the face, puts a small bright point in each eye and falls off within a couple of steps, so it hardly touches anything
   * else (one spot light, no shadow, aimed at the face every frame wherever the camera and the person go). On WebGPU it lights skin as a
   * big soft source does, with no shine of its own on it. person: a gs.models.human (it
   * finds the 'head' bone; anything else: its middle), null to let it go dark. o: { strength (.5: about half a sunny sky's fill), colour,
   * side (where beside the camera, -1 left .. 1 right: .4), up (.3) }. Call it once in make(): the light is made then and stays (a light
   * coming or going rebuilds every material's shader); null only dims it. Returns the light.
   */
  faceLight(person, o = {}) {
    let F = this.faceLit;
    if (!F) {
      const L = new SpotLight(o.colour ?? '#fff3e6', 0, 3, .3, 1, 2); L.castShadow = false; L.name = 'face light'; L.userData.noTrace = true; L.userData.gsFill = true;
      this.scene.add(L, L.target); F = this.faceLit = { light: L, person: null, head: null, strength: .5, side: .4, up: .3 };
    }
    if (o.colour) F.light.color.set(o.colour);
    Object.assign(F, { person: person || null, head: person?.getObjectByName?.('head')?.isBone ? person.getObjectByName('head') : null, strength: o.strength ?? F.strength, side: o.side ?? F.side, up: o.up ?? F.up });
    if (!person) F.light.intensity = 0;
    return F.light;
  }
  /** The auto exposure multiplier for this frame (1 without v.autoExposure; card pictures keep the settled one). */
  eyeAt(still) {
    let o = this._ls?.ae || this.autoExposure; if (!o) { this.eye = null; return 1; }   // (v.lens with iso 'auto': the camera's own meter)
    const eye = this.eye ||= new Eye(); if (o === true) o = this.autoExposure = {};
    const now = performance.now(), dt = Math.min(.1, (now - (eye.t || now)) / 1000); eye.t = now;   // real time: the same speed at any frame rate
    return still ? 2 ** eye.e : eye.step(dt, o);
  }
  // v.lens this frame (lens.js): the focus eased on, the exposure it adds; still: a card's picture (nothing moves on)
  lensStep(still) {
    const now = performance.now(), dt = still ? 0 : Math.min(.1, (now - (this._lensT || now)) / 1000);
    if (!still) this._lensT = now;
    return lensFrame(this, dt, !still && (lastView !== this || this._cut));
  }
  // the autofocus picture back now and then (read(): starts the reading; one at a time, every other frame)
  lensRead(read) {
    const S = this._ls; if (!S?.afWant || S.busy || ++S.n % 2) return;
    S.busy = true;
    let p; try { p = read(); } catch (e) { p = null; }
    Promise.resolve(p).then(px => { if (px && this._ls === S) afTake(S, px); }, () => {}).finally(() => { S.busy = false; });
  }
  // after a frame: a new light meter reading now and then (r: the renderer, read(): starts the reading)
  eyeRead(read) {
    const eye = this.eye; if (!eye || !eye.want()) return;
    eye.busy = true;
    let p; try { p = read(); } catch (e) { p = null; }
    Promise.resolve(p).then(px => { if (px) eye.take(px, this._ls?.ae || this.autoExposure || {}); }, () => {}).finally(() => { eye.busy = false; });
  }
  // v.flare as numbers: true or { strength, ghosts' threshold, spacing, fade, tint, dirt }
  flareSet() {
    const f = this.flare; if (!f) return null;
    const o = f === true ? {} : f, F = this._flareO ||= { tint: new Vector3() };
    F.strength = o.strength ?? 1; F.threshold = o.threshold ?? .15; F.spacing = o.spacing ?? .3; F.fade = o.fade ?? 20; F.dirt = o.dirt ?? .5;
    toRGB(o.tint ?? [1, .92, .85], F.tint); F.dirtTex = lensDirt();
    return F;
  }
  // v.lut as a texture: a look's name, a function, a .cube text or a table from gs.hd.lut (made once)
  lutTex() {
    const l = this.lut; if (!l) return null;
    if (this._lutOf !== l) { this._lutOf = l; try { this._lutT = lut(l); } catch (e) { console.warn(e.message); this._lutT = null; } }
    return this._lutT;
  }
  /** Size the camera to the game's W x H (call from draw before render). */
  fit(W, H) { if (W !== this.W || H !== this.H || this.cam.aspect !== W / H) { this.W = W; this.H = H; this.cam.aspect = W / H; this.cam.updateProjectionMatrix(); } return this; }
  /** Logical screen position of a world point: [x, y, depth] (depth > 1 = behind the camera). */
  toScreen(x, y, z) { const p = new Vector3(x, y, z).project(this.cam); return [(p.x + 1) / 2 * this.W, (1 - p.y) / 2 * this.H, p.z]; }
  /**
   * Compile every shader the scene can need now (hidden things too: muzzle flashes, explosions,
   * swapped materials), so nothing compiles mid-game and stutters. Call after building a level;
   * extra materials that get swapped in later can be passed in.
   */
  warm(...extra) { return this.warmOn(gpuFor(this), extra); }
  // (a frame already being drawn warms for its own renderer: asked again in the middle of a WebGL frame, a
  // view that had just come to fit WebGPU swapped its WebGPU materials in, and WebGL then drew them)
  warmOn(G, extra = []) {
    this.holdBase = 'all';   // (what it builds never waits: holdNew)
    if (G) { gpuSwap(this, G); this.warmed = true; try { this.envMaker?.(); } catch (e) { /* the studio reflections stay */ } this.scene.environment = this.envFor(G); this.aheadAgain = true; compileGPU(G.r, this.scene, this.cam, null, null, this).catch(buildFailed); return; }   // (hidden things: buildAhead, from the next frame)
    const r = renderer(); if (!r) return; this.warmed = true; gpuSwap(this, null);
    const hidden = [], tmp = [];
    this.scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    for (const m of extra) { const ms = new Mesh(new BoxGeometry(.01, .01, .01), m); this.scene.add(ms); tmp.push(ms); }
    this.patchAir(true); this.airUniforms();
    try { this.envMaker?.(); } catch (e) { /* the studio reflections stay */ }
    this.scene.environment = this.envFor(null);
    const was = r.shadowMap.enabled;
    try { for (const sh of [true, false]) { r.shadowMap.enabled = sh; r.compile(this.scene, this.cam); } } catch (e) { /* compile is only a warm-up */ }
    r.shadowMap.enabled = was;
    for (const o of hidden) o.visible = false; for (const ms of tmp) { this.scene.remove(ms); ms.geometry.dispose(); }
  }
  /**
   * Get ready to draw without a stall, in the background: the shaders compile on the GPU driver's own
   * threads (KHR_parallel_shader_compile, through three's compileAsync) and the textures upload a few
   * at a time, while the card waits below the one being played. Returns a promise; v.ready is true
   * once it's done. The kit calls this itself the first time a card is drawn off screen.
   */
  prepare() {
    if (this.preparing) return this.preparing;
    return this.preparing = this.precompile();
  }
  /**
   * Compile every shader the scene can need now and upload its textures, in the background (no
   * stall), like prepare() but every time it's called: after building a new level, call it while the
   * screen is faded out and fade back in when it resolves, instead of v.warmed = false (which compiles
   * everything on the next frame, all at once).
   */
  precompile() {
    const G = gpuFor(this);
    if (G) {
      gpuSwap(this, G); this.scene.environment = this.envFor(G); this.warmed = true;
      // (the hidden things too, before it says it is ready, once the view has drawn a frame of the game: before that the
      // picture its shaders are for is not known, and they are built over the first frames instead, buildAhead)
      const ch = this._gpuChain?.r === G.r && this._gpuChain.sp ? this._gpuChain : null;
      this.aheadAgain = true;
      return compileGPU(G.r, this.scene, this.cam, null, null, this).catch(buildFailed).then(() => ch && this._gpuChain === ch ? this.buildAhead(G.r, ch, true) : null).catch(() => {}).then(() => { this.ready = true; this.holdBase = 'all'; });
    }
    const r = renderer(); if (!r) return Promise.resolve();
    gpuSwap(this, null);
    const hidden = [], jobs = [], was = r.shadowMap.enabled, sh = tier().shadow > 0;
    this.scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    this.patchAir(true); this.airUniforms();
    this.scene.environment = this.envFor(null);
    try { for (const on of [sh, !sh]) { r.shadowMap.enabled = on; jobs.push(r.compileAsync(this.scene, this.cam)); } } catch (e) { /* only a warm-up */ }
    r.shadowMap.enabled = was;
    for (const o of hidden) o.visible = false;
    this.warmed = true;
    const texs = new Set();
    this.scene.traverse(o => { for (const m of [o.material].flat()) if (m) for (const k in m) if (m[k]?.isTexture) texs.add(m[k]); });
    return Promise.all(jobs).catch(() => {}).then(async () => {
      for (const t of texs) { try { r.initTexture(t); } catch (_) { /* uploads on first use instead */ } await idle(); }
      this.ready = true; this.holdBase = 'all';
    });
  }
  /** Called when the quality tier changes: let the game switch shadows on lights it owns. */
  onTier(fn) { this.tierFn = fn; return this; }
  /**
   * Which shadow maps need drawing this frame, and how. Each shadow light keeps its own map and a
   * number made from the light (where it is, where it points, its shadow camera) and from the shadow
   * casters its shadow camera can see. Only a light whose number changed is drawn again, so a car
   * moving at one end of the level redraws the lamp over it, not every lamp (what Unity and Unreal
   * call cached shadow maps, updated on demand).
   *
   * A light that stays put over a level that mostly doesn't move also keeps a copy of the map with only
   * the still things in it (things that haven't moved for SH_STILL frames). When only moving things
   * changed, that copy is put back and just the moving things are drawn over it: a few draws instead
   * of the whole level (Unity's mixed cached shadows, Unreal's static/dynamic shadow split). Both
   * steps use three.js's own shadow drawing, so the shadows look exactly the same.
   * Returns true if any light needs its map drawn.
   */
  shadowLights(force, gpu = false) {
    if (this.shAll) { force = true; this.shAll = false; }   // (shadowsDirty(): the kept copies of still things too)
    const L = this.shL ||= [], keys = this.shK ||= new Map(), TL = this.shT ||= []; L.length = 0;
    eachShown(this.scene, o => { if (o.isLight && o.castShadow && o.shadow) L.push(o); });
    // (WebGPU: the lamps' shadow slots, each a spot light outside the scene that stands in for its lamp: lamps.js)
    if (gpu && this.lampPool) for (const p of this.lampPool.proxies()) L.push(p);
    const n = L.length; if (!n) return false;
    if (SH_H.length < n * 5) SH_H = new Float64Array(n * 10);
    const H = SH_H; H.fill(0, 0, n * 5);   // per light: [own, still sum, moving sum, still triangles, moving triangles]
    TL.length = n;
    for (let i = 0; i < n; i++) {
      const l = L[i], sh = l.shadow, c = sh.camera, e = l.matrixWorld.elements, t = l.target?.matrixWorld.elements;
      if (!l.isPointLight) sh.updateMatrices(l);   // (three does the same as it draws; here it also gives the frustum)
      H[i * 5] = sh.mapSize.x + e[12] * 3.1 + e[13] * 3.7 + e[14] * 4.3 + (t ? t[12] * 5.3 + t[13] * 5.9 + t[14] * 6.1 : 0) + (l.angle || 0) * 11 + (l.distance || 0) * 13
        + (c.left ?? 0) * 17 + (c.right ?? 0) * 19 + (c.top ?? 0) * 23 + (c.bottom ?? 0) * 29 + c.near * 31 + c.far * 37 + (c.fov ?? 0) * 41 + sh.bias * 43 + (sh.map ? 0 : Math.random());
      // a sun's map in tiles (shadow-tiles.js): where its tiles are this frame
      const N = sh.mapSize.x, tiled = HD.shadowTiles !== false && HD.shadowCache !== false && l.isDirectionalLight && c.isOrthographicCamera && c.zoom === 1 && !c.view?.enabled
        && N === sh.mapSize.y && N % TILES === 0 && N >= TILES * 16 && sh.getViewportCount() === 1 && (!gpu || sh.shadowNode?.gsSplit);
      let st = null;
      if (tiled) { st = sh.gsTiles ||= new ShadowTiles(); st.begin(c.matrixWorld.elements, c.left, c.right, c.bottom, c.top, c.near, c.far, N, gpu); } else sh.gsTiles?.drop();
      TL[i] = st;
    }
    eachShown(this.scene, o => {
      if (o.isLight || o.layers.mask === BATCH_BIT) return;   // (a merged piece: its group's mesh casts for it)
      if (!o.castShadow) { if (o.layers.mask & SH_BITS) o.layers.mask &= ~SH_BITS; return; }
      const e = o.matrixWorld.elements, w = (o.id % 89) + 1, held = (o.layers.mask & HOLD_BIT) !== 0;
      let h = ((o.geometry?.id ?? 0) % 97 * .37 + e[0] * 1.3 + e[1] * 1.7 + e[2] * 2.3 + e[4] * 2.9 + e[5] * 3.1 + e[6] * 3.7 + e[8] * 4.1 + e[9] * 4.3 + e[10] * 4.7 + e[12] * 5.3 + e[13] * 5.9 + e[14] * 6.1 + (held ? .5 : 0)) * w;
      let wide = false, copies = 1, ball = false;   // instanced things and things placed on the chip: counted for every light (their bounds move without the object)
      const tw = o.userData.gsTwin, g = o.geometry;
      // (a set of copies counts up when one of them is moved, hidden or shown: props.js watched(); nothing else about it changes)
      if (o.isInstancedMesh2) h += ((o._parentLOD || o).userData.gsChanged || 0) * 13 * w;
      if (tw?.matrixWorld) { h += ((tw.instanceCount ?? 0) * 7 + (tw.matricesTexture?.version ?? 0) + (tw.userData.gsChanged || 0) * 13 + tw.matrixWorld.elements[12] * 3 + tw.matrixWorld.elements[14] * 5) * w; wide = true; copies = o.count; }
      else if (o.userData.gsMoved !== undefined) { h += (o.userData.gsMoved + 1) * 7 * w; wide = !o.userData.gsBall; copies = g?.isInstancedBufferGeometry ? g.instanceCount : o.count ?? 1; }   // (moved on the graphics chip: a count that goes up when it does, gs.fluid's drops; gsBall: its shape's ball is kept round where it is drawn, gs.props.Crowd)
      // (a gs.props set by how many copies it has, not by how many of them the last camera to draw it could see: that changes as the camera turns, and nothing about the shadows does)
      else if (o.isInstancedMesh2) { h += (((o._parentLOD || o).instancesCount ?? 0) * 7 + (o.matricesTexture?.version ?? 0)) * w; wide = true; copies = (o._parentLOD || o).instancesCount ?? 1; }
      else if (o.isInstancedMesh) { h += (o.instanceMatrix.version + o.count * 7) * w; wide = true; copies = o.count; }
      else if (o.isDetailMesh && o.copySrc) { h += o.copyStamp * 7 * w; wide = true; copies = o._n; }   // (copies drawn in clusters: a count that goes up when one moves, or the set does)
      else if (o.isBatchedMesh && !o.isDetailMesh) { h += ((o.instanceCount ?? o.count ?? 0) * 7 + (o.matricesTexture?.version ?? 0)) * w; wide = true; copies = o.instanceCount ?? 1; }
      if (o.isSkinnedMesh && o.skeleton) {
        // a posed body: where its bones are says where it is (a ball round them, and as much again as a third of the body's own size for the flesh on them)
        const b = o.skeleton.bones; let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        for (let j = 0; j < b.length; j++) {
          const m = b[j].matrixWorld.elements, x = m[12], y = m[13], z = m[14];
          if (j % 3 === 0) h += (x * 1.1 + y * 1.9 + z * 2.7 + m[0] + m[5] * 1.3) * (j + 1);
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
        }
        if (!wide && b.length && g) {
          const gs = g.boundingSphere || (g.computeBoundingSphere(), g.boundingSphere), sc = Math.sqrt(Math.max(e[0] * e[0] + e[1] * e[1] + e[2] * e[2], e[4] * e[4] + e[5] * e[5] + e[6] * e[6], e[8] * e[8] + e[9] * e[9] + e[10] * e[10]));
          SH_S.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); SH_S.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + .1 + .3 * (gs?.radius || 1) * sc; ball = true;
        } else wide = true;
      }
      // still or moving: frames since it last changed
      let rec = SH_LAST.get(o); if (!rec) SH_LAST.set(o, rec = { h, still: 0 }); else if (rec.h !== h) { rec.h = h; rec.still = 0; } else if (rec.still < 1e4) rec.still++;
      const still = rec.still >= (HD.shadowStill ?? SH_STILL) && !held, bit = held ? 0 : still ? SH_STILL_BIT : SH_MOVE_BIT;
      if ((o.layers.mask & SH_BITS) !== bit) o.layers.mask = (o.layers.mask & ~SH_BITS) | bit;
      const bs = !wide && !ball && g && (g.boundingSphere || (g.computeBoundingSphere(), g.boundingSphere));
      const tris = o.isDetailMesh ? o.fullTris * (o.copySrc ? o._n : 1) : g ? ((g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3) * copies : 0;
      if (bs) { SH_S.copy(bs).applyMatrix4(o.matrixWorld); ball = true; }
      for (let i = 0; i < n; i++) {
        const l = L[i];
        if (ball) {
          if (l.gsProxy && l.gsAt.distanceToSquared(SH_S.center) > (l.distance + SH_S.radius) ** 2) continue;   // (a lamp's slot: out of its reach, a quick no)
          const sees = l.isPointLight ? SH_P.setFromMatrixPosition(l.matrixWorld).distanceTo(SH_S.center) < SH_S.radius + (l.distance || l.shadow.camera.far) : l.shadow._frustum.intersectsSphere(SH_S);
          if (!sees) continue;
        }
        const b = i * 5; if (still) { H[b + 1] += h; H[b + 3] += tris; } else { H[b + 2] += h; H[b + 4] += tris; }
        const st = TL[i]; if (st) { if (ball) st.add(still, h, SH_S.center.x, SH_S.center.y, SH_S.center.z, SH_S.radius); else st.addAll(still, h); }
      }
    });
    let any = false;
    for (let i = 0; i < n; i++) {
      const l = L[i], sh = l.shadow, b = i * 5, all = H[b] + H[b + 1] + H[b + 2], st = TL[i];
      sh.autoUpdate = false;
      const changed = force || !sh.map || keys.get(l) !== all; keys.set(l, all);
      // the still/moving split: a light that isn't a point light, one map, still things well outweighing moving ones
      const plan = sh.gsPlan ||= { mode: 'full', key: 0 }, sKey = H[b] + H[b + 1];
      // (in tiles the moving things cost what they cover, not a copy of the whole map: the still things need only be enough to be worth keeping)
      const fits = HD.shadowCache !== false && !l.isPointLight && sh.getViewportCount() === 1 && H[b + 3] >= SH_MIN_TRIS && (st || H[b + 3] >= 2 * H[b + 4]) && (!gpu || sh.shadowNode?.gsSplit);
      const kept = !!sh.gsCache && sh.gsCache.width === sh.mapSize.x && sh.gsCache.height === sh.mapSize.y;
      if (st && fits && sh.map) {
        // a sun in tiles: the tiles say what there is to draw (until they have been drawn once, the map as a whole does)
        if (!st.valid && !changed) continue;
        if (!st.finish(force || !kept).any && !(HD.shadowCheck && st.valid && st.putBack())) continue;   // (shadowCheck, for tests: with nothing to draw, the map is made again from its kept copy, so a kept copy that has gone wrong shows)
        plan.mode = 'tiles'; plan.key = NaN;
      } else {
        st?.drop();
        if (!changed) continue;
        plan.mode = !fits ? 'full' : force || !kept || plan.key !== sKey ? 'rebuild' : 'overlay';
        plan.key = fits ? sKey : 0;
      }
      sh.needsUpdate = true; any = true;
    }
    return any;
  }
  /** Redraw the shadow maps next frame even if nothing seems to have moved (e.g. after changing a geometry in place). */
  /** The level's big still pieces changed: voxel bounce light (v.liveBounce = 'voxel') builds its picture of them again. */
  levelChanged() { this._giRebuild = true; return this; }
  shadowsDirty() { this.shK?.clear(); this.shAll = true; return this; }
  // The WebGPU frame (render() decided this view fits): the same numbers as the WebGL chain, drawn by hd3d-gpu.js.
  // up: { pw, fw, fh, s1 } when the scene is drawn pw wide and upscaled to the canvas (fw x fh) by SGSR 2, or SGSR 1 if s1
  // Finer sun shadows (WebGPU, sunmask-gpu.js): what this frame's sun mask holds, and whether materials read the last
  // one. contact: v.contactShadows (by itself at ultra); far: v.farShadows (a map of heights round the camera,
  // for shadows past the sun's own box); capsules: crowds' far members (gs.props.Crowd), whose shadows then leave the
  // sun's map. Null when there is nothing to put in it.
  sunMaskFrame(G, r, T, still, cut) {
    const cs = this.cascade, sun = cs?.far?.parent ? cs.far : this.suns.find(l => l.visible && l.castShadow && l.parent);
    const ok = !still && !this.clearBg && T.shadow > 0 && !!sun && HD.sunMask !== false;
    const cw = this.contactShadows, contact = ok && (cw ?? HD.tier >= 3) ? { length: .3, thickness: .25, out: 40, ...(typeof cw === 'object' ? cw : {}) } : null;
    const far = ok && !!this.farShadows;
    this.gsCapsules = ok && HD.capsules !== false;
    const list = this._capList ||= []; list.length = 0;
    if (this.gsCapsules) for (const c of this.scene.userData.gsPosed || []) c.capsules?.(list, this.cam);
    if (far) { const p = this.cam.getWorldPosition(SM_P); G.fx.farTiles(r, this.scene, p.x, p.y, p.z, this.cam.layers.mask, typeof this.farShadows === 'object' ? this.farShadows : {}); this._farOn = true; }
    else if (this._farOn) { G.fx.farTilesOff(); this._farOn = false; }
    if (!contact && !far && !list.length) { G.fx.sunMaskOn(false); HD.info.sunMask = null; return null; }
    sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
    const L = (this._sunL ||= new Vector3()).setFromMatrixPosition(sun.matrixWorld).sub(SM_P.setFromMatrixPosition(sun.target.matrixWorld)).normalize();
    let caps = null;
    if (list.length) { list.sort((a, b) => a[7] - b[7]); const { caps: cA, grid } = G.fx.sunCaps(); caps = binCapsules(list, [L.x, L.y, L.z], cA, grid, 40, ORIGIN); }
    G.fx.sunMaskOn(!cut && G.fx.sunMaskOwner() === this);
    HD.info.sunMask = { contact: !!contact, far, caps: caps?.n || 0, full: caps?.full || 0 };
    const reach = typeof this.farShadows === 'object' && this.farShadows.reach;
    return { owner: this, L, contact, far, farReach: reach || 0, box: sun.castShadow && sun.shadow.map ? sun.shadow.matrix : null, caps, k: fxK('sun mask') };
  }
  drawGPU(G, r, T, baking, off, now, up, direct) {
    const s2 = up && !up.s1 ? up : null;
    // card pictures (bakes) draw with no upscaler and no frame generation, which the chain is built for: one
    // shared chain flipped between the two and rebuilt all its passes twice whenever the game's card was baked
    const ck = baking ? '_gpuBakeChain' : '_gpuChain';
    const ch = this[ck]?.r === r ? this[ck] : (this[ck] = new G.fx.GpuChain(r, this.scene, this.cam, !!this.clearBg));
    // the game on screen: drawn into a picture and shown (see GpuChain.realFrame). Nothing on screen has
    // changed for a while (the picture check and the camera agree, and no finger moved): show the last
    // frame again instead of drawing it, and draw for real every few refreshes to look again
    const live = direct && !baking && !off;
    if (live && this.stillSkip(ch, now)) { speed.between = null; HD.info.still = true; HD.info.cpu = performance.now() - now; return; }
    if (!baking && !off) HD.info.still = false;
    // people on bones posed once a frame on the chip (skin-gpu.js): this frame's meshes are taken into the pool now, before
    // anything below draws or builds a shader for them; they are posed once the world's matrices are this frame's (below)
    G.fx.SUB.on = HD.subgroups !== false; HD.info.subgroups = G.fx.subgroupsInfo(r);   // (subgroups.js: passes built from now on use them or not)
    const SK = G.fx.skinPool(r);
    if (SK) { SK.set(HD.gpuSkin !== false); SK.list(this.scene, eachShown); }
    try { this.envMaker?.(); } catch (e) { /* the studio reflections stay */ }
    this.scene.environment = this.envFor(G); this.scene.environmentIntensity = this.envI;
    let fogN = null;
    if (this._air) { this.airUniforms(); const a = gpuAir(G); a.sync(); fogN = a.node(); } else AIR.gsAirOn.value = 0;
    // froxel fog (v.fog3d): lit by the sun and lamps, over the air's haze when both are on (high and ultra)
    if (this.fog3d && T.ao > 0) { const fz = this._froxels?.r === r ? this._froxels : (this._froxels = { r, ...G.fx.froxels() }); fz.update(r, this.cam, fogFrame(this)); fogN = fz.node(fogN); }
    this.scene.fogNode = fogN;
    // the sun lights: cloud shadows and the near shadow cascade's share (hd3d-gpu.js gpuSunLight)
    const cs = this.cascade, casc = !!(cs?.near.visible && cs.near.castShadow && cs.near.parent);
    G.fx.setCascade(casc ? cs.near : null, cs?.fade ?? .06);
    const ls = this.lensStep(baking || off);   // (v.lens: a real lens's focus and exposure, lens.js)
    r.toneMapping = TONES[this.tone] ?? ACESFilmicToneMapping; r.toneMappingExposure = this.exposure * this.eyeAt(baking || off) * (ls ? ls.exp : 1);
    this.syncDecals(G);
    if (this.decals.length && !baking && !off) this.tickDecals(Math.min(.1, (now - (this.decalT || now)) / 1000)); this.decalT = now;
    if (!baking && !off) this.t += 1 / 60;
    gpuSwap(this, G);
    for (const l of this.suns) sunRoles.get(l).value = casc ? (l === cs.near ? 1 : l === cs.far ? 2 : 0) : 0;   // (the suns gpuSwap's walk found)
    if (this.gi || this.rooms?.length) this.bakeExtras(G, r);
    if (this.probes.length > 1) this.blendProbes();
    // (built for the screen, not the chain's own picture: a pipeline built for that picture also bound it to read, which WebGPU refuses)
    this.holdNew(r, baking || off, now);
    // (the frame lab's CPU by part, prof.js: each piece of the frame on its own while the lab is open)
    const pm = PROF.on ? mark() : -1;
    if (pm >= 0) enter('3D: detail'); detailShow(this); if (pm >= 0) leave(pm);
    // SGSR 2: the scene at pw x ph (ph the passes' own rounding of the canvas height), upscaled to the canvas
    const pw = up ? up.pw : r.domElement.width, ph = up ? Math.max(1, Math.floor(up.fh * (pw + .5) / up.fw)) : r.domElement.height;
    // what is hidden behind other things this frame (a card's picture is drawn whole)
    // World matrices once, for all that follows: what is hidden, the shadow maps, the picture. three works every
    // one of them out again for each thing it draws the scene into (every shadow map, every part of a map drawn
    // in tiles, the contact shadows, the picture) unless told the scene's are up to date, which they are from
    // here to the end of the frame: nothing below moves anything (the lights' shadow cameras see to themselves).
    this.scene.updateMatrixWorld();
    const worldAuto = this.scene.matrixWorldAutoUpdate; this.scene.matrixWorldAutoUpdate = false;
    try {
    if (pm >= 0) enter('3D: occlusion');
    const occJob = baking || off ? (DETAIL.occ = null) : this.occludeStep(!this.clearBg && !r.reversedDepthBuffer, pw, ph);
    if (HD.occludeShow) DETAIL.occ = null;
    if (pm >= 0) { leave(pm); enter('3D: copies'); }
    const shc = this.shadowCams ||= []; shc.length = 0;
    if (tier().shadow > 0) eachShown(this.scene, o => { if (o.isLight && o.castShadow && o.shadow?.camera) { shc.push(o.shadow.camera); if (o.isPointLight) o.shadow.camera.gsPoint = true; } });
    // the lamps' shadow slots (lamps.js): handed out now the lamps' matrices are this frame's, and their atlas made
    const LP = this.lampPool;
    if (LP?.gpu) {
      LP.prepare(T, HD.tier); LP.pictures(G.fx, r);   // (signs lit with their own picture: their squares of the decals' atlas)
      const at = G.fx.lampAtlas(r, LP.cols, LP.rows, LP.slotPx, LP); LP.atlasGen = G.fx.lampAtlasInfo().gen;
      for (const p of LP.proxies()) { p.shadow.map = at; shc.push(p.shadow.camera); }
    }
    // GPU culling (HD.gpuCull): big sets of copies are picked on the chip, except while frame generation runs (it
    // needs each copy to keep its place in the list from frame to frame: hd3d-gpu.js gpuProps)
    const gc = HD.gpuCull, gcOk = gc !== false && !(live && frameGenFor(speed.game)), occ = !baking && !off && HD.occlude !== false && !HD.occludeShow;
    const ocNow = occ ? occlusionNow(this) : null;   // (GPU culling asks the same depth pyramid on the chip: props-gpu.js)
    const fr = baking || off ? null : fadeReady(this, G, r, 'copy');   // (copies changing level fade: lod-fade.js)
    for (const o of this.sets) if (o.userData.gpuHid) o.userData.gpuTwin.sync(this.cam, occ ? copiesHidden(this, o) : null, shc, gcOk && (gc === true || (o._instancesArrayCount || 0) >= GPU_CULL_MIN) ? r : null, fr, ocNow);   // (the sets gpuSwap's walk found)
    if (pm >= 0) { leave(pm); enter('3D: skinning'); }
    HD.info.skin = SK?.on ? (SK.run(this.cam, shc), SK.info) : null;
    if (pm >= 0) { leave(pm); enter('3D: contact shadows'); }
    for (const cs of this.contacts) { const tw = cs.gpuTwin?.r === r ? cs.gpuTwin : (cs.gpuTwin = { r, ...G.fx.gpuContact(cs) }); tw.update(r, this.scene, T.contact); }
    if (pm >= 0) leave(pm);
    // (WebGPU multisamples 4 times a pixel or not at all: three draws a tier's 2 as 1. So there 2 is none, and the finishing pass's own edge
    // smoothing (FXAA) does the work, as on the tiers without MSAA; it had been left off as if MSAA were on, and its place taken by the lens
    // fringing, which turns a dark hair or a lash over skin or sky magenta and green, a pixel to each side)
    const ms = T.msaa >= 4 ? 4 : 0;
    const o = { tone: this.tone, w: pw, h: ph, fw: r.domElement.width, fh: r.domElement.height, s2: null, s1: !!up?.s1, ao: T.ao * fxK('ao'), msaa: ms, bloomScale: T.bloom * fxK('bloom'), smooth: !ms, bloom: this.bloom, t: this.t % 10, hurt: this.hurt, grade: null, glare: 0, lut: this.lutAmount > 0 ? this.lutTex() : null, lutK: this.lutAmount, oit: !!this.oit, drops: this.drops.on ? this.drops : null, flare: this.bloom > 0 ? this.flareSet() : null, sunUV: GQ.set(.5, .5), sunCol: C_WARM, aspect: this.W / this.H,
      dofOn: false, lens: null, near: this.cam.near, far: this.cam.far, shaftsOn: false, shaft: 0, shaftCol: null, grain: HD.grain };
    // gs.fx3d's screen effects, and reflections where the game marked shiny things: high and
    // ultra here (WebGL: ultra only), traced at half size on high
    o.fx = this.extras?.length ? this.extras : null;
    // (ray traced where the phone and the chip can, at half size: hd3d-gpu-trace.js; a tracer that has stopped leaves the screen-space ones)
    const wantRefl = this.reflectors.length && T.ao > 0 && !this.clearBg;
    let tr = null;
    // (the tracing part loads the first time it is wanted: until it is in, and on a chip that can't, reflections come from the screen)
    const TK = wantRefl && HD.traced !== false && steered().traced !== false && (HD.traced === true || phoneClass() === 'top') && this.scene.environment && G.fx.traceFits(r) ? G.fx.traceKit() : null;
    if (TK) {
      if (this._tracer?.r !== r) { this._tracer?.dispose(); this._tracer = new TK.Tracer(r, this.scene, { bits: 1 | BATCH_BIT | HOLD_BIT | OCC_BIT, budget: HD.traceTris, twins: fn => { const D = this.details; if (D) for (const e of D.map.values()) for (const p of e.parts) fn(e.o, p.twin); } }); }
      this._tracer.show = !!HD.traceShow;
      if (pm >= 0) enter('3D: traced reflections');
      if (this._tracer.frame(now, this._trLights ||= list => traceLights(this, list))) tr = this._tracer;
      if (pm >= 0) leave(pm);
    } else if (this._tracer) { this._tracer.dispose(); this._tracer = null; }
    if (tr) (this._traceRefl ||= { scale: .5, traced: null }).traced = tr;
    o.refl = wantRefl ? (tr ? this._traceRefl : T.ssr ? REFL_FULL : REFL_HALF) : null;
    HD.info.trace = tr ? tr.info : null; HD.info.refl = o.refl ? (tr ? 'traced' : 'screen') : '';
    // SGSR 2 smooths every edge from its history (also at full size, where it is the anti-aliasing), and the
    // picture measured the same with MSAA under it as without: so the scene is drawn without, which saves the
    // multisampled colour, depth and motion pictures and their resolves
    if (s2 && HD.sgsrTune !== false) o.msaa = 0;
    o.s2Plain = HD.sgsrTune === false;
    o.s2Net = s2 && !o.s2Plain ? netFor(HD.gssrNet) : null; HD.info.gssrNet = o.s2Net ? o.s2Net.id : '';
    G.fx.HALF.on = HD.half !== false && steered().half !== false; G.fx.HALF.pretend = !!HD.halfPretend; HD.info.half = G.fx.halfInfo();   // (the chain is built again when this changes: hd3d-gpu.js halfKey)
    if (G.fx.SHADOW_DEPTH) G.fx.SHADOW_DEPTH.on = HD.shadowColour !== true;   // (shadow maps of depth alone, hd3d-gpu.js: for a light's map made from now on)
    if (G.fx.SHARE) G.fx.SHARE.on = HD.shareTargets !== false;   // (the effect steps' pictures shared two apart, hd3d-gpu.js sharePictures: the chain is built again when it changes)
    const g = this.grade;
    if (g) o.grade = { sat: g.saturation ?? 1, con: g.contrast ?? 1, lo: toRGB(g.shadows, GL), hi: toRGB(g.highlights, GH) };
    // depth of field and sun shafts: in the chain from the first time the view uses them (high and ultra
    // for focus, as on WebGL; not on the lowest tier for shafts), so turning them on and off doesn't rebuild it
    this._dofUsed ||= !!this.focus; this._shaftsUsed ||= this.shafts > 0;
    o.dofOn = this._dofUsed && T.ao > 0; o.shaftsOn = this._shaftsUsed && T.shadow > 0;
    if (o.dofOn && this.focus) { const f = this.focus; o.lens = [f.at ?? 50, f.range ?? 2, f.depth ?? .5, (f.blur ?? 6) * ph / 640]; }
    // a camera like a real lens (v.lens; bokeh, focus pulls): in the chain from the first time the view uses it, high and ultra
    this._lensUsed ||= !!this.lens; o.lensOn = this._lensUsed && T.ao > 0; o.lensL = o.lensOn ? ls : null;
    // live bounce light (v.liveBounce, WebGPU, high and ultra): 'screen' (three's SSGI) or 'voxel' (three's VXGI)
    const lb = this.liveBounce;
    if (lb && T.ao > 0) {
      const spec = typeof lb === 'string' ? { kind: lb } : lb, gi = this._gi ||= { kind: 'screen', strength: 1, res: 64, box: null, rebuild: false };
      gi.kind = spec.kind === 'voxel' ? 'voxel' : 'screen'; gi.strength = spec.strength ?? 1; gi.res = Math.min(128, Math.max(16, spec.res ?? 64)); gi.box = spec.box || null;
      gi.rebuild = !!this._giRebuild; this._giRebuild = false; o.gi = gi;
    }
    // volumetric light and motion blur: the same tiers as WebGL (high and ultra, and shadows for the light)
    this._volUsed ||= !!this.beams; this._mbUsed ||= !!this.motionBlur;
    o.volOn = this._volUsed && T.ao > 0 && T.shadow > 0; o.vol = o.volOn && this.beams ? beamsFrame(this) : null;
    const mbm = blurFrame(this, lastView !== this || this._cut); o.mbOn = this._mbUsed && T.ao > 0; o.mb = o.mbOn ? mbm : null;
    // frame generation (speed.js says when, framegen.js makes the frames, hd3d-gpu.js shows them): for the game being played
    const how = live ? frameGenFor(speed.game) : false, steps = how ? frameGenSteps(speed.game) : 1;
    // with frames made in between, each one shown is a fraction of a real frame's move apart: blur that much
    if (mbm && how) mbm.mb.x /= steps;
    if (this.glare > 0 || (o.shaftsOn && this.shafts > 0)) {
      const sd = this.sunDir(GV), cam = this.cam; GP.setFromMatrixPosition(cam.matrixWorld).addScaledVector(sd, 1000).project(cam);
      cam.getWorldDirection(GW);
      if (GW.dot(sd) > 0 && Math.abs(GP.x) < 1.6 && Math.abs(GP.y) < 1.6) {
        const seen = Math.min(1, (1.6 - Math.max(Math.abs(GP.x), Math.abs(GP.y))) * 2);
        o.glare = this.glare * seen;
        o.sunUV.set(GP.x * .5 + .5, GP.y * .5 + .5); o.sunCol = this.sun?.color || C_WARM;
        if (o.shaftsOn) { o.shaft = Math.min(2, this.shafts) * seen; o.shaftCol = this.sun?.color || C_WARM; o.shaftAt = this.shaftsAt; }
      }
    }
    if (!baking && !off) { autoLod(this, r.domElement.height); if (this.batches?.list.length) unbatchAll(this); }   // (static batching: WebGL only, see autoBatch)
    // still scenery drawn from render bundles (HD.bundle, on by default; still.js): what has kept still for a second is
    // recorded by area once and replayed, and what changed this frame goes back to drawing itself before anything is drawn
    if (HD.bundle === false || !r.backend?.beginBundle) { stillOff(this.scene); HD.info.bundled = HD.info.bundles = 0; }
    else if (!baking && !off) {
      if (pm >= 0) enter('3D: still');
      stillFrame(this.scene, thingsOf(this.scene), now, SH_BITS); HD.info.bundled = stillStats.things; HD.info.bundles = stillStats.cells;
      if (pm >= 0) leave(pm);
    }
    r.info.autoReset = false; r.info.reset();   // (HD.info counts the frame from here: the shadow maps drawn below as well, as on WebGL)
    // shadows: each light's map is drawn again only when it or a caster it sees moved (shadowLights)
    r.shadowMap.enabled = T.shadow > 0; r.shadowMap.type = PCFShadowMap;
    let shAhead = null;
    if (T.shadow > 0) {
      if (pm >= 0) enter('3D: shadows');
      if ((o.shDrawn = !!this.shadowLights(lastView !== this || baking || off, true)) && !baking && !off) HD.info.shDraws = (HD.info.shDraws || 0) + 1;
      for (const l of this.shL) {
        const sh = l.shadow;
        // (a sun that could go into tiles: the shaders its tiles' copies need are made now, not in the frame it goes in: hd3d-gpu.js shadowOps ahead)
        if (sh.gsTiles && sh.map && sh.shadowNode?.gsSplit && sh.shadowNode.shadowMap === sh.map && !baking && !off) (G.shOps ||= G.fx.shadowOps(r)).ahead(l);
        if (!sh.needsUpdate || !sh.map || sh.gsPlan?.mode === 'full' || !sh.gsPlan || !sh.shadowNode?.gsSplit || sh.shadowNode.shadowMap !== sh.map) continue;
        const ops = G.shOps ||= G.fx.shadowOps(r); ops.scene = this.scene; ops.camera = this.cam;
        shadowSplit(l, ops);
        sh.needsUpdate = false;
      }
      if (pm >= 0) leave(pm);
      // (the shadow shaders of what these maps have not drawn yet: shadowAhead, after the scene pass below, once this frame's uniforms are set)
      if (!baking && !off && HD.hold !== false) shAhead = getready.warming || !this.warmed;
    }
    // the lamps' slots that are due, a few a frame (lamps.js finish), and each lamp's numbers for the lights node
    if (LP?.gpu) {
      if (pm >= 0) enter('3D: lamp shadows');
      const mask = this.cam.layers.mask;
      LP.finish(T.shadow > 0 ? HD.tier : 0, s => G.fx.drawSlot(r, this.scene, s, mask));
      if (pm >= 0) leave(pm);
    }
    if (!this.warmed && !off) { this.warmed = true; this.aheadAgain = true; }   // (what this frame does not draw is built over the next ones: buildAhead)
    // an instanced mesh made with room for none (an empty list in a game) has a zero-size buffer that WebGPU
    // won't bind; it draws nothing anyway, so it sits this frame out
    const empty = []; eachShown(this.scene, o => { if (o.isInstancedMesh && (!o.count || !o.instanceMatrix.count)) empty.push(o); });
    for (const e of empty) e.visible = false;
    const cut = lastView !== this || this._cut; lastView = this; this._cut = false; if (TEST) window.__hdView = this;
    // Frame generation starts again after a cut (another view drew, v.cut(), a pause, the camera
    // jumping): the frames either side of one don't belong together.
    let fg = null;
    if (how) {
      this.cam.updateMatrixWorld();
      const m = cameraMove(this.cam, this._fgCam); this._fgCam = m.last;
      // pace: blend's, by the chip's times (speed.js frameGenPaceOf; HD.fgPace for tests); quick: the quick way for easy
      // tiles (HD.fgQuick false: off, for the tour's run as before); parts: frame generation's chip time by step (the tour)
      speed.outMpx = o.fw * o.fh / 1e6;
      fg = { mode: how, pace: HD.fgPace || frameGenPaceOf(speed.game, steps), quick: HD.fgQuick !== false, parts: !!HD.fgParts, drop: HD.fgDrop !== false, cost: speed.cost,
        reset: cut || m.jumped || now - (this._fgT || 0) > HD.fgGap, jd: [0, 0], jit: [0, 0], steps, hz: screenHz() }; this._fgT = now;
    } else this._fgCam = null;
    if (s2) { o.s2 = GS2 ||= new SgsrFrame(); o.s2.begin(this.cam, pw, ph, o.fw, o.fh, this, now, cut, true); o.s2.fsr = HD.sgsrFsr || null; }   // WebGPU pictures count rows from the top
    // SGSR 2 moves the camera by a fraction of a pixel each frame (its jitter) and three's motion picture
    // includes the change: SGSR 2 and frame generation take it back out (in NDC: x right, y up, so rows down are minus)
    if (s2) {
      const j = o.s2.jitter, x = 2 * j.x / pw, y = -2 * j.y / ph, p = !cut && this._fgJ || [x, y], jd = [x - p[0], y - p[1]]; this._fgJ = [x, y];
      o.s2.jd = jd; if (fg) { fg.jd = jd; fg.jit = [x, y]; }
    } else this._fgJ = null;
    // the scene's pass writes each pixel's motion and the see-through mask while frame generation could
    // come on for this game (so it can start without rebuilding the chain) or SGSR 2 can use them
    o.live = live; o.mrt = (live || HD.motion === true) && (!!s2 || frameGenReady(speed.game)); o.still = live && HD.still !== false; o.fg = fg; o.now = now;
    // finer sun shadows: what goes into this frame's sun mask (drawn after the scene), and whether this frame reads the last one
    if (pm >= 0) enter('3D: sun mask'); o.sunMask = this.sunMaskFrame(G, r, T, baking || off, cut); if (pm >= 0) leave(pm);
    // (effects spread over frames: a cut starts them from this frame alone)
    // (a card's picture is a frame of its own: it keeps nothing from the last one baked)
    o.spread = HD.spread === false ? false : typeof HD.spread === 'string' ? HD.spread : true; o.cut = cut || !!baking;
    o.aoBack = HD.aoBack !== false; o.aoDirect = HD.aoDirect;   // (ambient occlusion on bounce light only, and the share still on the whole picture: hd3d-gpu.js aoInShading)
    // the effects drawn smaller by their cost (FXS), and which this frame draws (for the next step down)
    o.fxK = { reflections: fxK('reflections'), vol: fxK('volumetric light'), shafts: fxK('light shafts') };
    if (!baking && !off) { fxOn = new Set(); if (o.ao > 0) fxOn.add('ao'); if (o.bloom > 0) fxOn.add('bloom'); if (o.refl) fxOn.add('reflections'); if (o.vol) fxOn.add('volumetric light'); if (o.shaft > 0) fxOn.add('light shafts'); if (o.sunMask) fxOn.add('sun mask'); }
    // fresh aim: made frames turned to where the camera points at the moment they're shown (v.aimNow, AR's own)
    ch.aim = live && fg && HD.aim !== false && (this.aimFn || this.freshAim) ? () => this.aimPose() : null;
    this._aimJit = s2 && fg ? fg.jit : null;   // the real frame is shown while SGSR 2's jitter is still on the camera
    let shown = false;
    // sharper textures while SGSR 2 upscales (hd3d-gpu.js sharpMips): read as the screen's size would read them
    G.fx.mipScale(s2 && HD.mipBias !== false ? Math.min(1, pw / o.fw * 2 ** (HD.mipBias ?? 0)) : 1);
    if (!baking && !off && !HD.occludeShow) hideNow(this);
    // the sky's own pictures (a gs.sky Sky on WebGPU: its air, its clouds and their shadow, hd3d-gpu-sky.js), before the scene that shows them
    const sky = this._sky?.dome.parent ? this._sky.gpu : null;
    if (sky) { if (pm >= 0) enter('3D: sky'); sky.frame(r, this.cam, { w: pw, h: ph, cut: o.cut, bake: baking || off, tier: T, t: this.t, flags: HD }); if (pm >= 0) leave(pm); }
    else { G.fx.SKY.on.value = 0; G.fx.SKY.shadeOn.value = 0; }
    HD.info.sky = sky ? sky.info : '';
    if (pm >= 0) enter('3D: drawing');
    const drawAt = performance.now();
    fadeOn(this, G, r, !!s2, baking || off);   // (things changing detail level: drawn dithered, lod-fade.js)
    try { shown = ch.render(o) || false; HD.info.spread = ch.spread ? ch.spread.trim() : ''; HD.info.shared = ch.shared || 0; } finally { showAll(this); lodBack(this); fadeBack(this); G.fx.mipScale(1); for (const e of empty) e.visible = true; if (s2) o.s2.end(this.cam); this._aimJit = null; if (pm >= 0) leave(pm); }
    if (pm >= 0) enter('3D: shaders ahead');
    if (!baking && !off && HD.hold !== false) { this.envCheck(r); this.buildAhead(r, ch); }
    if (pm >= 0) leave(pm);
    // (drawn after the scene pass: a look's per-frame colours (live uniforms) have no value until the pass has run once, and three reads them as it draws a shadow)
    if (shAhead !== null) { if (pm >= 0) enter('3D: shadows ahead'); this.shadowAhead(r, G, shAhead); if (pm >= 0) leave(pm); }
    // this frame's depth, boiled down and read back for the frames to come (occlude.js; pad: the picture is drawn a fraction of a pixel off, or with several samples a pixel)
    // (three draws a scene's pass once a screen refresh: a view drawn again within one has the first draw's depth, not this camera's)
    const drawn = ch.occAt !== r.info.frame; ch.occAt = r.info.frame;
    // (the meter's shader is made the first frame the chain has its depth picture, whether or not occlusion is awake yet: hd3d-gpu.js depthMeter)
    if (ch.sp && !baking && !off && HD.occlude !== false && HD.occludeDepth !== false && this.autoOcclude !== false && ch.occWarm !== ch.sp) { ch.occWarm = ch.sp; (ch.occM ||= G.fx.depthMeter(r)).warm(ch.sp.getTexture('depth')); }
    if (occJob && ch.sp && drawn) { occJob.pad = s2 || o.msaa ? 1 : 0; (ch.occM ||= G.fx.depthMeter(r)).read(ch.sp.getTexture('depth'), occJob, occBack); }
    if (this.eye && !baking && !off && ch.sp) this.eyeRead(() => (ch.eyeM ||= G.fx.eyeMeter(r)).read(ch.sp.getTexture('output')));
    if (ls?.afWant && !baking && !off && ch.lensN?.on) this.lensRead(() => ch.lensN.readAF(r));   // (v.lens autofocus: the distance under the spot)
    const made = !!fg && !!shown;
    if (made) HD.fgTap?.(shown, r.domElement, 'frame');
    // the refreshes after this one that the feed skips show the moments due then (last: the next draws a real frame)
    speed.between = made ? (last = true, now = null) => { const k = ch.between(last, now); if (k) HD.fgTap?.(k, r.domElement, 'between'); return k; } : null;
    // the refreshes between kept not coming, or their frames were dropped as late (the phone is too busy to make
    // them in time): blend's 'after' pace puts a made frame on the real frame's refresh, so first try 'first' (each
    // refresh one frame's work); then stop for this game. (Not while it is forced on: a test, or the engine test
    // scenes' frame generation runs, which time it as it is.)
    if (made && ch.fgWin.real >= 90 && !speed.forceFrameGen) {
      const { miss, dropped } = ch.missRate(), id = speed.game?.id, after = how === 'blend' && fg.pace === 'after';
      if (miss > .3 || dropped > .5 || (miss > .08 && !(after && frameGenPace(id)))) { if (!speed.shield) { frameGenFailed(id); console.info('Frame generation off for this game: the phone is too busy for the frames between'); } }
      else if (miss > .08) console.info('Frame generation: each made frame on a refresh of its own for this game, its refreshes were too full');
    }
    if (made) ch.sent(drawAt, 1000 / screenHz());
    if (!baking && !off) {
      gpuTime(r, !!how || fpsFor(speed.game) >= screenHz() * .9);
      { const C = G.fx.SHADOW_COST; HD.info.shTris = (HD.info.shTris || 0) + C[0]; HD.info.shCalls = (HD.info.shCalls || 0) + C[1]; C[0] = C[1] = 0; }
      HD.info.calls = r.info.render.drawCalls; HD.info.tris = r.info.render.triangles; (this.drew ||= [0, 0])[0] = HD.info.tris; this.drew[1] = HD.info.calls; HD.info.cpu = performance.now() - now; HD.info.shadows = T.shadow > 0; HD.info.upscaled = s2 ? 'sgsr2' : up ? 'sgsr1' : false; HD.info.backend = 'webgpu'; HD.info.hdr = !!r.gsHdr; HD.info.detail = detailStats;
      HD.info.framegen = made ? how : false; HD.info.fgMs = made ? ch.fg.stats.ms : 0; HD.info.fgSteps = made ? steps : 0; HD.info.fgPace = made && how === 'blend' ? fg.pace : null; HD.info.fgDrops = ch.drops || 0;
      // (the phone test tour: the share of tiles that took the quick way, read back now and then)
      if (made && HD.fgParts && (this._fgEasyN = (this._fgEasyN || 0) + 1) % 30 === 0) ch.fg.easyShare().then(v => { if (v != null) HD.info.fgEasy = v; }, () => {});
    }
    } finally { this.scene.matrixWorldAutoUpdate = worldAuto; }
  }
  // Still frames: true when this refresh can show the last frame again instead of drawing (see drawGPU).
  stillSkip(ch, now) {
    const st = ch.still, S = this._still ||= { cam: new Float64Array(32), run: 0, seen: -1, skip: 0, hurt: 0 };
    if (!st || HD.still === false || getready.warming || lastView !== this || this._cut || !ch.lastColor || FADING.size) { S.run = 0; return false; }   // (a round getting ready: every frame is drawn, that is what they are for; nor while a detail level fades)
    const cam = this.cam; cam.updateMatrixWorld();
    const e = cam.matrixWorld.elements, p = cam.projectionMatrix.elements, k = S.cam; let same = true;
    for (let i = 0; i < 16; i++) { if (k[i] !== e[i]) { same = false; k[i] = e[i]; } if (k[16 + i] !== p[i]) { same = false; k[16 + i] = p[i]; } }
    // a change it can't see in the picture yet: the camera, the hurt flash, a finger or key in the last moment
    if (!same || this.hurt !== S.hurt || now - (speed.inputAt || 0) < 300 || this._ls?.moving) { S.run = 0; S.hurt = this.hurt; return false; }
    // a new answer from the picture check (a frame or two late): how many checks in a row saw nothing change
    if (st.seen !== S.seen) { S.seen = st.seen; S.run = st.changed() === 0 ? S.run + 1 : 0; }
    if (S.run < 3) return false;
    if (++S.skip >= 6) { S.skip = 0; return false; }   // draw one in six to look again
    return ch.showLast();
  }
  /**
   * Fresh aim (frame generation): fn(cam) points the camera where the newest input says, right now,
   * without moving the game on (as your update() would from it: a look angle a finger already changed).
   * Each made frame is then turned to that, so aiming and steering answer at the screen's rate, not the
   * game's. Kit camera rigs (gs.camera) and AR views do it themselves. Returns the view.
   */
  aimNow(fn) { this.aimFn = fn; return this; }
  // the camera's pose now (framegen.js's pose: facing and projection): fn(cam) runs on the game's camera,
  // which is put back as it was straight after
  aimPose() {
    const cam = this.cam, A = AIM, P = cam.projectionMatrix.elements;
    A.pos.copy(cam.position); A.q0.copy(cam.quaternion); A.fov = cam.fov; A.zoom = cam.zoom; A.proj.copy(cam.projectionMatrix);
    let ok = true;
    try {
      if (this.aimFn) this.aimFn(cam); else this.freshAim(cam);
      if (cam.fov !== A.fov || cam.zoom !== A.zoom) cam.updateProjectionMatrix();
      cam.updateMatrixWorld(); cam.getWorldQuaternion(A.pose.q);
      const j = this._aimJit || NO_JIT;
      A.pose.persp = !!cam.isPerspectiveCamera && P[15] === 0; A.pose.fx = P[0]; A.pose.fy = P[5]; A.pose.cx = P[8] + j[0]; A.pose.cy = P[9] + j[1];
    } catch (_) { ok = false; }
    finally {
      cam.position.copy(A.pos); cam.quaternion.copy(A.q0); cam.fov = A.fov; cam.zoom = A.zoom;
      cam.projectionMatrix.copy(A.proj); cam.projectionMatrixInverse.copy(A.proj).invert(); cam.updateMatrixWorld();
    }
    return ok ? A.pose : null;
  }
  /**
   * The camera cut to somewhere new (a teleport, another camera, a replay): the next frame starts
   * fresh instead of building on the last (SGSR 2's history, frame generation). Big jumps are found by
   * themselves; call this for the rest. Returns the view.
   */
  cut() { this._cut = true; return this; }
  /**
   * The 3D canvas belongs to another card now: draw this view's last frame under the HUD already on
   * its canvas (and the camera picture under that, for AR), so the card keeps its picture.
   */
  bake(c, small = false) {
    const r = renderer(); if (!r) return;
    this.render(c, this.W, this.H, small ? 'small' : true);
    const u = this.under;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-over';
    const W = c.canvas.width, H = c.canvas.height;
    if (u?.videoWidth) { const s = Math.max(W / u.videoWidth, H / u.videoHeight); c.drawImage(u, (W - u.videoWidth * s) / 2, (H - u.videoHeight * s) / 2, u.videoWidth * s, u.videoHeight * s); }
    else if (this.clearBg) { c.fillStyle = '#151a22'; c.fillRect(0, 0, W, H); }
    c.restore();
  }

  /**
   * Render the frame for 2D canvas c (logical units w x h), with post-processing. Normally the 3D
   * canvas is shown on the card right under c, and c is cleared so the game draws its HUD on top.
   * For a game in the AR kit, v.under (an element, the camera video) is shown under the 3D canvas and
   * v.underCss is a CSS background for it. With HD.direct off (tests), the frame is copied into c.
   */
  render(c, w = this.W, h = this.H, baking = false) {
    // (far from the world's centre: drawn with every place worked out from near the camera, origin.js)
    const t0 = performance.now(), near = !baking && speed.offscreen ? false : originOn(this), t1 = performance.now();
    try { this.draw3d(c, w, h, baking); } finally { const t2 = performance.now(); if (near) originOff(this); if (!baking) HD.info.originMs = t1 - t0 + performance.now() - t2; }
  }
  /** render()'s own work. */
  draw3d(c, w, h, baking) {
    this.fit(w, h);
    if (this.faceLit?.person) aimFaceLight(this);
    const G = gpuFor(this);
    // the graphics chip was lost and a new one is on its way (gpu.js lostGPU): nothing is drawn meanwhile (on WebGL
    // every shader of the scene would be built for one frame, and then built again on the new chip). The app has
    // paused a round being played and covers it while the new chip catches up (src/main.js)
    if (!G && gpuMending()) { if (!baking && !HD.direct) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, c.canvas.width, c.canvas.height); c.restore(); } return; }
    const r = G ? G.r : renderer();
    if (r && this._drawR !== r) { if (this._drawR) this.newRenderer(); this._drawR = r; }
    // WebGPU's depth runs 0..1 and WebGL's -1..1, so the camera's projection differs. three switches it
    // only when the camera's own setting disagrees, and the SGSR 2 jitter puts back the matrix it saved
    // before, so a switch made inside the frame was undone (on WebGPU the near clip sat at twice its
    // distance: Long Shadow's rifle was cut away). Switch it here, before anything saves it.
    const cs = G ? G.r.coordinateSystem : WebGLCoordinateSystem;
    if (this.cam.coordinateSystem !== cs) { this.cam.coordinateSystem = cs; this.cam.updateProjectionMatrix(); }
    if (!r) { c.fillStyle = this.scene.background ? '#' + this.scene.background.getHexString() : '#0b0f14'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = '600 12px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('This device cannot show 3D', w / 2, h / 2); return; }
    const now = performance.now();
    // where the frame goes: straight onto the card (moving the 3D canvas here first, which bakes the
    // last frame into the card it leaves), or copied into c
    // A card being added below the one on screen (speed.offscreen) gets a copied frame: it mustn't take
    // the 3D canvas, the quality tuning or a shader warm-up away from the game being played.
    const off = !baking && speed.offscreen;
    // A card being added below the one on screen: draw no 3D now, paint its picture in later, once its
    // shaders and textures are ready (drawing would stall the feed while they compile) and the feed is
    // still (a whole frame plus its copy, and the playing card's frame drawn again, landed mid-swipe)
    if (off) {
      if (!waiting.has(c)) { waiting.add(c); (this.ready ? Promise.resolve() : this.prepare()).then(() => { waiting.delete(c); if (c.canvas.isConnected && host?.canvas !== c.canvas) bakeLater(this, c); }); }
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, c.canvas.width, c.canvas.height); c.restore();
      return;
    }
    // (crowds keep their members' numbers as the last frame drew them, for frame generation: gs.props.Crowd)
    { const posed = this.scene.userData.gsPosed; if (posed) for (const p of posed) p.frame(); }
    // (each is a whole frame of another card plus a copy: never while a round is played or the feed moves)
    if (!baking && !off) { this.drawnAt = now; liveView(this, now); if (bakes.length && !speed.playing() && !getready.warming && !speed.busy()) { const [v, bc] = bakes.shift(); if (bc.canvas.isConnected && host?.canvas !== bc.canvas) try { v.bake(bc, true); } catch (_) { /* best effort */ } } }   // (one a frame: several at once were one long stall)
    const direct = HD.direct && !baking && !off && !!c.canvas.parentNode && mount(r.domElement, c, this);
    if (!baking && !off) {
      if (Q.game !== speed.game) startGame(speed.game);
      // adaptive quality: first resolution, then tier (and frame rate)
      // (a round getting ready behind the loading screen, getready.js: its frames build what the round needs and say
      // nothing about how fast the phone draws, so none of them count; the measuring starts with the round)
      const gap = now - (Q.lastT || now); Q.lastT = now; if (getready.warming) { Q.sum = Q.cnt = Q.late = Q.gsum = Q.gcnt = 0; STEPS.off.warming++; } else adapt(gap); applyTier();
    }
    const T = tier();
    if (this.tierSeen !== HD.tier) { this.tierSeen = HD.tier; this.tierFn?.(T); }
    // The final picture (upscaler, last effects, the copy onto the card) is the screen's own size. On a big
    // screen (a foldable opened up) that's twice a phone's pixels and the resolution steps can't lighten it,
    // so once the game has had to step down (Q.lvl >= 1), it's also drawn at no more than OUT_PX and the
    // screen stretches it. A game keeping up is never touched on a phone; on a computer it always is.
    let fw = c.canvas.width, fh = c.canvas.height;
    if (!baking && !off && HD.scale == null && Q.force == null && (Q.lvl >= 1 || desktop) && fw * fh > OUT_PX) { const k = Math.sqrt(OUT_PX / (fw * fh)); fw = Math.round(fw * k); fh = Math.round(fh * k); }
    // (Frame generation leaves the 3D's size as it is. It used to give each real frame 1.6 times the pixels, as its
    // two refreshes' time, but the made frames take some of that time, and the Fold is held back by its pixels:
    // the real frame got slower, which is the opposite of what frame generation is for.)
    let pw = fw, ph = fh; const px = baking === 'small' ? Math.min(T.px, PIC_PX) : T.px, q = HD.scale ?? Math.min(1, Math.sqrt(px / (pw * ph))) * HD.res;
    pw = Math.max(16, Math.round(pw * q)); ph = Math.max(16, Math.round(ph * q));
    if (!baking && !off) { HD.info.rw = pw; HD.info.rh = ph; HD.info.ow = fw; HD.info.oh = fh; }   // the 3D's own size and the final picture's (the frame lab's resolution counter)
    // The 3D is drawn at pw x ph (fewer pixels on big screens and when the phone struggles). Below the
    // screen's size, Snapdragon GSR 2 (sgsr2.js, temporal: jitters the camera and builds on the frames
    // before) or GSR 1 (sgsr.js, AR and SSR) upscales it to the full screen as the last pass (on WebGPU,
    // hd3d-gpu.js's TSL versions of both); HD.upscale = false shows the plain stretched picture instead (tests, comparisons).
    const up = HD.upscale && !baking && pw < fw * .95;
    // SGSR 2 also runs at full size, as anti-aliasing (grass and leaves stop shimmering); not for AR,
    // SSR (it draws the scene itself) or card pictures. On WebGPU it's hd3d-gpu.js's TSL version.
    const ssr = !G && !this.clearBg && T.ssr && this.reflectors.length > 0;
    const s2on = HD.upscale && !baking && !this.clearBg && !ssr && (this.upscaler ?? HD.upscaler) === 'sgsr2';
    const s2 = s2on && !G ? (P.sgsr2 ||= new SGSR2()) : null;
    const ow = up || s2on ? fw : pw, oh = up || s2on ? fh : ph;
    const cv = r.domElement; if (cv.width !== ow || cv.height !== oh) r.setSize(ow, oh, false);
    gridRoom(r, this);   // (before this view's first picture of any size: a small one for its card would set the lights' room)
    if (!baking && !off) speed.gpu = !!G;   // (frame generation needs the game on screen drawn with WebGPU)
    autoDetail(this, now, !!(baking || off), ph);
    autoCopies(this, ph, now, !!(baking || off));
    if (this.occHid?.size) showAll(this);   // (nothing stays hidden between frames: see occludeStep)
    if (G) this.drawGPU(G, r, T, baking, off, now, (s2on || up) && { pw, fw, fh, s1: !s2on }, direct);
    else {
    if (!baking && !off) { speed.between = null; HD.info.framegen = false; }   // (frame generation is WebGPU only)
    gpuSwap(this, null);
    const cp = this.clearBg ? seeThrough(r, pw, ph) : chain(r, pw, ph); if (cp.cw !== pw || cp.ch !== ph) { cp.setSize(pw, ph); cp.cw = pw; cp.ch = ph; }
    if (up) { P.sgsr ||= new ShaderPass(SGSR); P.sgsr.uniforms.ViewportInfo.value = (P.sgsrV ||= new Vector4()).set(1 / pw, 1 / ph, pw, ph); }
    if (this.clearBg) cp.passes = up ? [P.arRender, P.arOut, P.sgsr] : [P.arRender, P.arOut];
    this.scene.environment = this.envFor(null); this.scene.environmentIntensity = this.envI;
    this.patchAir(); this.airUniforms();
    if (this.gi || this.rooms?.length) this.bakeExtras(null, r);
    this.holdNew(r, baking || off, now, this.clearBg ? null : cp.readBuffer);
    const pm = PROF.on ? mark() : -1;   // (the frame lab's CPU by part, prof.js)
    if (pm >= 0) enter('3D: detail'); detailShow(this); if (pm >= 0) leave(pm);
    const ls = this.lensStep(baking || off);   // (v.lens, lens.js)
    r.toneMappingExposure = this.exposure * this.eyeAt(baking || off) * (ls ? ls.exp : 1);
    if (this.clearBg) { P.arRender.scene = this.scene; P.arRender.camera = this.cam; } else { P.render.scene = P.ao.scene = this.scene; P.render.camera = P.ao.camera = this.cam; }
    // reflections (ultra, and only if the game marked shiny surfaces): SSR draws the scene itself
    if (ssr) {
      if (!P.ssr) {
        P.ssr = new SSRPass({ renderer: r, scene: this.scene, camera: this.cam, width: pw, height: ph, selects: [], groundReflector: null });
        const ro = P.ssr._renderOverride.bind(P.ssr);   // its normals picture: solid surfaces only (see seeThrough3d)
        P.ssr._renderOverride = (...a) => { const hid = []; hideSeeThrough(P.ssr.scene, hid); try { ro(...a); } finally { for (const o of hid) o.visible = true; } drawPosed(P.ssr.scene, a[0], P.ssr.camera, a[2], 'normal'); };
        const rm = P.ssr._renderMetalness.bind(P.ssr); P.ssr._renderMetalness = (...a) => { rm(...a); drawPosed(P.ssr.scene, a[0], P.ssr.camera, a[2], 'black'); };
        Object.assign(P.ssr, { thickness: .02, maxDistance: 8, opacity: .55, blur: true, fresnel: true, distanceAttenuation: true, bouncing: false, infiniteThick: false }); P.ssr.cw = pw; P.ssr.ch = ph;
      }
      P.ssr.scene = this.scene; P.ssr.camera = this.cam; P.ssr.selects = this.reflectors;
      if (P.ssr.cw !== pw || P.ssr.ch !== ph) { P.ssr.setSize(pw, ph); P.ssr.cw = pw; P.ssr.ch = ph; }
    }
    for (const cs of this.contacts) cs.update(r, this.scene, T.contact);
    this.syncDecals(null);
    if (this.decals.length && !baking && !off) this.tickDecals(Math.min(.1, (now - (this.decalT || now)) / 1000)); this.decalT = now;
    if (this.probes.length > 1) this.blendProbes();
    for (const p of this.parts) p.mat.uniforms.scale.value = ph / (2 * Math.tan(this.cam.fov * Math.PI / 360));
    if (!baking && !off) this.t += 1 / 60;
    if (!this.clearBg) {
      const F = P.final, aoK = T.ao * fxK('ao'), blK = T.bloom * fxK('bloom'); P.ao.enabled = T.ao > 0; if (T.ao > 0 && P.ao.scale !== aoK) { P.ao.scale = aoK; P.ao.setSize(P.ao.fw || pw, P.ao.fh || ph); }
      if (F.scale !== blK) { F.scale = blK; if (F.w) F.setSize(F.w, F.h); }   // (the effects ladder, FXS: the bloom's pictures smaller)
      if (!baking && !off) { fxOn = new Set(); if (T.ao > 0) fxOn.add('ao'); if (this.bloom > 0 && T.bloom) fxOn.add('bloom'); }
      F.strength = this.bloom; F.setTone(this.tone); F.setLut(this.lutTex(), this.lutAmount); F.setFlare(this.bloom > 0 && T.bloom ? this.flareSet() : null); F.setDrops(this.drops.on ? this.drops : null); F.eyeView = baking || off ? null : this; F.setFxaa(!s2 && (!T.msaa || ssr));   // SGSR 2 smooths edges itself
      const u = F.final.uniforms; u.t.value = this.t % 10; u.hurt.value = this.hurt; u.grain.value = HD.grain ?? .035;
      const g = this.grade; u.gradeOn.value = g ? 1 : 0;
      if (g) { u.sat.value = g.saturation ?? 1; u.con.value = g.contrast ?? 1; toRGB(g.shadows, u.lo.value); toRGB(g.highlights, u.hi.value); }
      u.glare.value = 0;
      const shafts = this.shafts > 0 && T.shadow > 0;   // not on the lowest tier
      if (shafts) P.shafts ||= new ShaftsPass();
      if (P.shafts) P.shafts.amount = 0;
      if (this.glare > 0 || shafts) {
        const sd = this.sunDir(GV), cam = this.cam; GP.setFromMatrixPosition(cam.matrixWorld).addScaledVector(sd, 1000).project(cam);
        cam.getWorldDirection(GW);
        if (GW.dot(sd) > 0 && Math.abs(GP.x) < 1.6 && Math.abs(GP.y) < 1.6) {
          const seen = Math.min(1, (1.6 - Math.max(Math.abs(GP.x), Math.abs(GP.y))) * 2);
          u.sunUV.value.set(GP.x * .5 + .5, GP.y * .5 + .5); u.aspect.value = this.W / this.H; u.sunCol.value.copy(this.sun?.color || C_WARM);
          if (this.glare > 0) u.glare.value = this.glare * seen;
          if (shafts) { P.shafts.strength = Math.min(2, this.shafts); P.shafts.bright(this.shaftsAt ?? 1.1); P.shafts.aim(u.sunUV.value, this.W / this.H, seen, this.sun?.color || C_WARM); }
        }
      }
    }
    // extra effects a game added (gs.fx3d: outline, glitch, trails, depth of field, pixelate) go between the scene and the final pass
    if (!this.clearBg) {
      const dof = (this.focus || ls) && T.ao > 0 && P.ao.depthTexture ? (P.dof ||= new DofPass()) : null;
      if (dof) {
        const u = dof.mat.uniforms; u.tDepth.value = P.ao.depthTexture; u.cn.value = this.cam.near; u.cf.value = this.cam.far;
        // (v.lens: a real lens's blur, without WebGPU's bokeh discs; the autofocus read back as there)
        if (ls) { const mx = Math.max(.5, ls.max * ph); u.lens.value.set(0, 0, 0, mx); u.phys.value.set(ls.K * ph, ls.D, mx, 1); dof.view = this; dof.af = ls.afWant && !baking && !off ? ls : null; }
        else { const f = this.focus; u.lens.value.set(f.at ?? 50, f.range ?? 2, f.depth ?? .5, (f.blur ?? 6) * ph / 640); u.phys.value.w = 0; dof.af = null; }
      }
      // volumetric light (v.beams) and motion blur (v.motionBlur): before and after the depth of field
      const bm = this.beams && T.ao > 0 && T.shadow > 0 && P.ao.depthTexture ? beamsFrame(this) : null;
      const beams = bm ? (P.beams ||= new BeamsPass()) : null; if (beams) beams.aim(bm, P.ao.depthTexture, this.cam);
      const mbm = blurFrame(this, lastView !== this || this._cut);
      const mb = mbm && T.ao > 0 && P.ao.depthTexture ? (P.mb ||= new BlurPass()) : null; if (mb) mb.aim(mbm, P.ao.depthTexture, this.cam);
      const ex = [beams, dof, mb, ...(this.extras || [])].filter(Boolean);
      const first = ssr ? P.ssr : P.render;
      const sh = P.shafts && P.shafts.amount > 0 ? [P.shafts] : [];
      if (sh.length && (P.shafts.cw !== pw || P.shafts.ch !== ph)) { P.shafts.setSize(pw, ph); P.shafts.cw = pw; P.shafts.ch = ph; }
      // SGSR 2 reads the scene's depth straight after it's drawn
      cp.passes = s2 ? [first, s2.convertPass, P.ao, ...ex, ...sh, P.final, s2.upscalePass] : up ? [first, P.ao, ...ex, ...sh, P.final, P.sgsr] : [first, P.ao, ...ex, ...sh, P.final];
      P.final.needsSwap = up || !!s2;   // the final pass writes into the next buffer only when SGSR reads it
      for (const p of ex) if (p.cw !== pw || p.ch !== ph) { p.setSize(pw, ph); p.cw = pw; p.ch = ph; }
    }
    if (!this.warmed && !off) this.warmOn(null);
    // shadows: redraw the maps only when a shadow caster or a shadow light moved (or the tier, view or map changed)
    this.scene.updateMatrixWorld();
    if (!baking && !off) { autoLod(this, r.domElement.height); autoBatch(this, now); }
    // what is hidden behind other things this frame (a card's picture is drawn whole), and this frame's depth read back for the frames to come
    if (pm >= 0) enter('3D: occlusion');
    P.occ?.poll();
    const occJob = baking || off ? (DETAIL.occ = null) : this.occludeStep(!this.clearBg && !ssr, pw, ph);
    if (pm >= 0) leave(pm);
    if (HD.occludeShow) DETAIL.occ = null;
    if (occJob) { occJob.pad = s2 || T.msaa ? 1 : 0; (P.occ ||= new DepthMeter()).job = occJob; cp.passes.splice(1, 0, P.occ); }
    r.shadowMap.enabled = T.shadow > 0;
    let shadows = false; const cut = lastView !== this || this._cut; this._cut = false;
    if (T.shadow > 0 && this.shadowLights(lastView !== this)) r.shadowMap.needsUpdate = shadows = true;
    if (shadows && !baking && !off) HD.info.shDraws = (HD.info.shDraws || 0) + 1;
    lastView = this; if (TEST) window.__hdView = this;
    r.info.autoReset = false; r.info.reset();
    const mwa = this.scene.matrixWorldAutoUpdate; this.scene.matrixWorldAutoUpdate = false;   // already updated above
    if (s2) { s2.tuned = HD.sgsrTune !== false; s2.fsr = HD.sgsrFsr || null; s2.net = HD.gssrNet === true ? null : netFor(HD.gssrNet); HD.info.gssrNet = s2.net ? s2.net.id : ''; s2.begin(this.cam, pw, ph, fw, fh, this, now, cut); }   // the camera's move and this frame's jitter
    if (!baking && !off && !HD.occludeShow) hideNow(this);
    if (pm >= 0) enter('3D: drawing');   // (on WebGL the shadow maps are drawn in here too)
    fadeOn(this, null, r, !!s2, baking || off);   // (things changing detail level: drawn dithered, lod-fade.js)
    try { cp.render(); } finally { showAll(this); lodBack(this); fadeBack(this); this.scene.matrixWorldAutoUpdate = mwa; s2?.end(this.cam); if (pm >= 0) leave(pm); }
    if (!baking && !off) { HD.info.calls = r.info.render.calls; HD.info.tris = r.info.render.triangles; (this.drew ||= [0, 0])[0] = HD.info.tris; this.drew[1] = HD.info.calls; HD.info.cpu = performance.now() - now; HD.info.shadows = shadows; HD.info.upscaled = s2 ? 'sgsr2' : up && 'sgsr1'; HD.info.backend = 'webgl'; HD.info.webgl = this._gpuWhy || ''; HD.info.detail = detailStats; HD.info.trace = null; HD.info.half = ''; HD.info.refl = ssr ? 'screen' : ''; }
    }
    if (direct) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, c.canvas.width, c.canvas.height); c.restore(); return; }
    c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    if (baking) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-over'; copyFrame(r, c, 0, 0, ow, oh, 0, 0, c.canvas.width, c.canvas.height); }
    else copyFrame(r, c, 0, 0, ow, oh, 0, 0, w, h);
    c.restore();
  }
}

/* ---------- WebGPU (gpu.js, hd3d-gpu.js) ---------- */
const REFL_FULL = { scale: 1 }, REFL_HALF = { scale: .5 };
// A view draws on WebGPU when the player switched it on, it's ready, and everything in the view has a
// WebGPU version so far. Anything else keeps the view on WebGL: game effects (gs.fx3d), GPU particles,
// contact shadows, reflections, sun shafts, light probes, a sky's own reflections, cloud shadows and
// rain on the air, and any material with its own shader (ShaderMaterial or a shader patch that isn't
// one of the kit's ported look effects). docs/webgpu-move.md lists what's left to port.
const PORTED_LOOKS = new Set(['air', 'pulse', 'ground', 'hills', 'rock', 'leaves', 'fronds', 'meadow', 'room', 'flow', 'lava', 'sea']);
PORTED_LOOKS.add('sdf');   // gs.fx3d's 3D text (text3d.js)
PORTED_LOOKS.add('crowd');   // gs.props.Crowd (crowd.js, crowd-gpu.js)
PORTED_LOOKS.add('rooms');   // gs.city's rooms behind the windows (city-rooms.js, city-gpu.js)
PORTED_LOOKS.add('carpaint').add('carglass');   // gs.models.vehicle's paint and glass (models/vehicle-looks.js, models/vehicle-gpu.js)
PORTED_LOOKS.add('groundpaint');   // gs.city's ground paint (ground-paint.js, ground-paint-gpu.js)
// kit ShaderMaterials with a node material twin (hd3d-gpu.js gpuMaterials; material.userData.gsGpu)
const GPU_TWINS = new Set(['skyDome']);
// (gs.props' InstancedMesh2 puts a material's own onBeforeCompile back as an own property after each draw: not a shader of its own)
const BASE_OBC = Object.getPrototypeOf(MeshBasicMaterial.prototype).onBeforeCompile;
function materialFits(m) {
  if (!m) return true;
  if (m.isShaderMaterial || m.isRawShaderMaterial) return GPU_TWINS.has(m.userData.gsGpu);
  if (Object.hasOwn(m, 'onBeforeCompile') && m.onBeforeCompile !== BASE_OBC) { const l = looksOf(m); return l.length > 0 && l.every(n => PORTED_LOOKS.has(n)); }
  return true;
}
/** '' if every part of this view has a WebGPU version, else what keeps it on WebGL (HD.info.webgl). */
export function gpuFits(v) {
  if (steered().webgpu === false) return 'the steering list (' + (steered().rules.join(', ') || 'this game') + ')';
  const T = tier();
  // (gs.fx3d's own effects have WebGPU versions, hd3d-gpu-fx.js; a pass a game made itself hasn't)
  if (v.extras?.some(p => !p.gsFx)) return 'a screen effect of the game\'s own';
  if (v.env && !v.envSrc) return 'sky reflections (a texture of its own)';
  let why = '';
  // (every frame: no array is made per thing, so the walk leaves no garbage behind)
  const no = (o, m) => { why = `a material with its own shader (${m.type}${o.name ? ' on ' + o.name : ''})`; };
  eachThing(v.scene, o => {
    const ms = o.material; if (why || !ms || o.userData.gsTwin) return;
    if (!Array.isArray(ms)) { if (!materialFits(ms)) no(o, ms); return; }
    for (let i = 0; i < ms.length; i++) if (!materialFits(ms[i])) { no(o, ms[i]); break; }
  });
  return why;
}
// asked every frame (a quick walk over the scene), so a game that adds an effect mid-round moves back to WebGL before it draws
function gpuFor(v) {
  const G = webgpu(); if (!G) { v._onGpu = false; return null; }
  v._gpuWhy = gpuFits(v);
  // a material the air hasn't been laid on yet (instanced grass, with its library's own hook) reads as a
  // shader of its own: lay the air on first and ask again, or the view's first frame went to WebGL (every
  // WebGL shader built for one frame) before it moved to WebGPU
  if (v._gpuWhy && v._air && v._gpuWhy.startsWith('a material')) { v.patchAir(true); v._gpuWhy = gpuFits(v); }
  v._onGpu = !v._gpuWhy;
  return v._gpuWhy ? null : G;
}
// swap each view's parts between their WebGL and WebGPU versions (particles: points or sprites)
const gpuLooked = new WeakSet(), gpuTwins = new WeakMap(), gpuLists = new WeakMap(), sunRoles = new WeakMap();
const SM_P = new Vector3();   // (sunMaskFrame)
// kit ShaderMaterials (GPU_TWINS) swapped for their node material twin on WebGPU, and back
// A twin can have a close-up version (gs.models materials: the recipe worked out per pixel, fading to the
// baked look pixel by pixel as the textures get fine enough): drawn while the thing is within its distance
// of the camera, once its shader for that kind of mesh has built in the background. Until then the far
// look goes on being drawn, and the close-up one is marked as built for the view when it comes in (seen:
// the view's holdNew set), so walking up to a wall, or standing on a floor, never hides it while a shader
// builds. (holdNew took the swap for a new thing appearing and hid it for a few frames; the upscaler then
// took half a second to bring it back.)
const GPU_CULL_MIN = 2000;   // copies in one gs.props set before the chip picks them (HD.gpuCull 'auto'): below it the CPU's list is quick
// Shaders built ahead on WebGPU, one build at a time for each renderer. three.js keeps its place in a
// build in one field of the renderer, so two builds running at once trip over each other: one of them
// throws, the renderer's count of nested renders is left one too high, every render after that starts on
// a fresh set of render states, and builds still waiting make pipelines for a depth picture that has
// gone ("Async render pipeline creation failed"). A build waits its turn, so `around` (optional) sets
// up what it needs when it starts (which picture, which material) and puts it back: around(go) => go().
// A build of one thing's shaders takes the thing as three would draw it when the build's turn comes: one that
// is hidden, off the camera's layer or out of its view by then is left out, the build ends at once with
// nothing made, and the thing was marked as built: its shader was then made in the frame it first drew
// (a wall behind the player is as near as one in front, so this was the usual case for close-up shaders).
// So while three takes it (the part of the build inside the call) the thing is shown, on the camera's layer
// and not left out for being out of view.
function inReach(o, go) {
  const lm = o.layers.mask, vis = o.visible, cull = o.frustumCulled;
  try { o.layers.mask = lm | 1; o.visible = true; o.frustumCulled = false; return go(); } finally { o.layers.mask = lm; o.visible = vis; o.frustumCulled = cull; }
}
// view: the view the build is for. Its shaders are built for the picture its scene is drawn into (GpuChain.buildFor),
// as that stands when the build's turn comes.
// r.gsBuilding: builds waiting their turn or running on this renderer (a loading screen waits for none).
// (said, not swallowed: a build that fails leaves its shaders to be made in the frames, which looks like nothing but a stutter)
const buildFailed = e => { console.warn('3D: a background shader build failed', e); };
function compileGPU(r, o, cam, scene, around = null, view = null) {
  // (a build that waited its turn on a renderer whose graphics chip has since been lost, gpu.js: nothing to build it on)
  const go = () => { if (r._isDeviceLost) return; hideSets(o); return forPass(r, view, () => r.compileAsync(o, cam, scene)); }, p = (r.gsCompiling || Promise.resolve()).then(() => around ? around(go) : go());
  const done = () => { r.gsBuilding--; };
  r.gsBuilding = (r.gsBuilding || 0) + 1; p.then(done, done);
  r.gsCompiling = p.catch(() => {});
  return p;
}
// The rest of a scene's shaders (v.buildAhead): what a frame has not drawn yet. A thing three would not build
// as the scene stands is one that is hidden (a muzzle flash, the next room), behind the camera or out of its
// view, and each of those used to build its shader in the frame it first showed. AHEAD_MS: the time a frame
// gives to starting such builds (making a shader's text is work on the main thread; the pipeline is the driver's).
const AHEAD_MS = 3;
function aheadFits(o) {
  if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.material || !o.geometry) return false;
  if (o.isInstancedMesh2 || o._parentLOD || o.userData.gsTwin?.isInstancedMesh2) return false;   // (sets of copies are their library's to draw: gpuSwap, hideSets)
  // (room for none: a buffer of no size, which WebGPU won't bind. One with room but none shown yet, a flock that only
  // takes off at the first shot, is built: three builds its shader and pipeline whatever its count, and draws nothing)
  if (o.isInstancedMesh && !o.instanceMatrix?.count) return false;
  const lm = o.layers.mask & ~(SH_BITS | HOLD_BIT | OCC_BIT);
  return lm === 1 || lm === 0;   // (0: held back or hidden for this frame alone; the batch layer and a game's own layers are never drawn by the view's camera as they are)
}
// Runs a build (go: r.compileAsync) with the renderer set to the view's scene pass's layout, and sets it back.
// three's build goes on after its call returns, a thing at a time. For each thing it sets the renderer to
// the picture and outputs (MRT) the build began with, and afterwards "back" to those same two, taking it
// that its caller keeps them set until the whole build is done. Ours can't: frames are drawn meanwhile.
// Left so, the next frame drew the screen's picture into the stand-in with the pass's outputs (and with the
// pass's own picture in the stand-in's place, into the picture it was reading, which WebGPU refuses: why
// builds used to be made for the screen). So each thing's note of what to go back to is set here, as three
// writes it, to what the renderer had before the build.
function forPass(r, view, go) {
  const make = r._createObjectPipeline, pic = view?._gpuChain?.r === r && typeof make === 'function' && '_compilationPromises' in r ? view._gpuChain.buildFor() : null;
  gridRoom(r, view);
  if (!pic) return go();
  const rt0 = r.getRenderTarget(), m0 = r.getMRT();
  r._createObjectPipeline = function (...a) {
    const list = this._compilationPromises, n = list ? list.length : 0;
    make.apply(this, a);
    if (list) for (let i = n; i < list.length; i++) { const st = list[i].precompilationState; if (st) { st.outputRenderTarget = rt0; st.outputMRT = m0; } }
  };
  try { r.setRenderTarget(pic.rt); r.setMRT(pic.mrt); return go(); }
  finally { delete r._createObjectPipeline; r.setRenderTarget(rt0); r.setMRT(m0); }
}
// three's clustered lights (hd3d-gpu.js manyLights) keep, for each cell of a grid laid over the picture, a list
// of the lamps that reach it, and the room for those lists is made for the first picture the grid meets, with
// half as much again to spare. A picture that needs more makes the lists anew, which gives the scene's lights
// a new key: every lit shader's text written until then is thrown away and written again in the frames (10 to
// 28 ms each on the build machine, for a village of houses). The first picture is often a small one: a build's
// 4 x 4 stand-in, a canvas nothing has sized yet, a card's small picture. So before a view's first build or frame the grid is given
// room for the most pixels a frame of this tier can have. (The kit's shadow maps keep away from it: KitLighting.)
const gridAsked = new WeakMap();
// The world's centre moved along with the camera (origin.js). While a view draws, the scene's matrixWorld is a
// step back by the view's centre, so every world matrix on the chip is worked out from near the camera (in
// JavaScript's 64-bit numbers, before it goes to the chip as 32-bit ones), and put back afterwards: nothing in the
// game or the kits sees anything but the world's own numbers. Things whose world matrix nothing works out
// (matrixWorldAutoUpdate off), and a light's target that isn't in the scene (three only reads its matrix, which
// is whatever the last updateMatrixWorld() made it), are stepped back and forward by hand; such a target is held
// under the scene for the frame, so anything that works its matrix out again then puts it near the centre too.
const OP = new Vector3();
function originOn(v) {
  const at = v.origin ||= new Vector3(), cam = v.cam;
  const p = !cam.parent || cam.parent === v.scene ? cam.position : cam.getWorldPosition(OP);
  if (originFollow(at, p, ORIGIN_SET)) {
    // a frame drawn about a new centre: the pictures kept from before (the upscaler's, motion blur's) were drawn about the
    // old one, so they start again; shadow maps are worked out again by themselves (their lights' places changed)
    v._cut = true; v.originMoves = (v.originMoves || 0) + 1;
  }
  ORIGIN.copy(at); HD.info.origin = at.x || at.z ? [at.x, at.z] : null;
  if (!at.x && !at.z) return false;
  const S = v.scene, orph = v._orphans ||= [], sky = v._skyLights ||= [], grids = v._grids ||= [];
  orph.length = sky.length = grids.length = 0;
  if (!cam.parent) { S.add(cam); v._camIn = true; }   // (a camera taken out of the scene, by scene.clear(): drawn about the same centre as the rest)
  S.traverse(o => {
    if (o === S) return;
    if (o.isHemisphereLight) { sky.push(o); if (o.matrixWorldAutoUpdate) skyShift(o, at.x, at.z); return; }
    // bounce light (v.bounce: three's LightProbeGrid): its box is kept from where it is, not from its matrices
    if (o.isLightProbeGrid && o.boundingBox) { grids.push(o); const b = o.boundingBox; b.min.x -= at.x; b.max.x -= at.x; b.min.z -= at.z; b.max.z -= at.z; }
    if (!o.matrixWorldAutoUpdate) { const m = o.matrixWorld.elements; m[12] -= at.x; m[14] -= at.z; }
    const t = o.target; if (t?.isObject3D && !t.parent && o.isLight) orph.push(t);
  });
  v._worldAutoWas = S.matrixWorldAutoUpdate;
  S.updateMatrix(); S.matrixWorld.makeTranslation(-at.x, 0, -at.z).multiply(S.matrix);
  S.matrixWorldAutoUpdate = false; S.updateMatrixWorld(true);
  for (const t of orph) { t.parent = S; const m = t.matrixWorld.elements; m[12] -= at.x; m[14] -= at.z; }
  return true;
}
// A sky light (HemisphereLight) is a direction, not a place: three takes which way is up for it from where it is, as seen
// from the centre, so it is drawn where it is in the world's own numbers (moved with the rest, a sky light 1 m up would be
// 768 m off to one side and nearly level, and the ground under it went dark). It is moved the other way by as much while
// the view draws (its parents are taken to be neither turned nor scaled: a sky light is the scene's own, or in a group)
function skyShift(o, x, z) {
  if (o.matrixAutoUpdate) { o.position.x += x; o.position.z += z; o.updateMatrix(); } else { const e = o.matrix.elements; e[12] += x; e[14] += z; }
}
function originOff(v) {
  const at = v.origin, S = v.scene, x = at.x, z = at.z;
  S.matrixWorldAutoUpdate = v._worldAutoWas; S.matrixWorld.copy(S.matrix);
  S.traverse(o => {
    if (o === S) return;
    const m = o.matrixWorld.elements; m[12] += x; m[14] += z;
    if (o.isCamera) o.matrixWorldInverse.copy(o.matrixWorld).invert();
    else if (o.isSkinnedMesh && o.bindMode === 'attached') o.bindMatrixInverse.copy(o.matrixWorld).invert();
  });
  for (const t of v._orphans) { if (t.parent === S) { t.parent = null; const m = t.matrixWorld.elements; m[12] += x; m[14] += z; } }
  for (const o of v._skyLights) { const m = o.matrixWorld.elements; m[12] -= x; m[14] -= z; if (o.matrixWorldAutoUpdate) skyShift(o, -x, -z); }   // (it was where it is all along)
  for (const o of v._grids) { const b = o.boundingBox; b.min.x += x; b.max.x += x; b.min.z += z; b.max.z += z; }
  if (v._camIn) { v._camIn = false; if (v.cam.parent === S) S.remove(v.cam); }
  v._orphans.length = v._skyLights.length = v._grids.length = 0; ORIGIN.set(0, 0, 0);
}

function gridRoom(r, view) {
  const n = r.gsClustered && view?.scene?.isScene ? r.lighting.getNode(view.scene) : null;
  if (!n?.isClusteredLightsNode) return;
  const cv = r.domElement, px = HD.scale != null ? Math.max(cv.width * cv.height, 16384) : tier().px;
  if ((gridAsked.get(n) || 0) >= px) return;
  gridAsked.set(n, px);
  const side = Math.ceil(Math.sqrt(px)); n.setSize(side, side);
}
// A set of copies (gs.props) is WebGL's to draw, through its library's own hooks: on WebGPU its plain twins
// draw (gpuSwap). One made since the view's last frame (a game building its level between two frames, a card
// still loading) is still showing when a build that waited its turn starts. three then ran the library's
// hook on it, which threw with the set's material left patched: the view took that for a shader of the
// game's own and went back to WebGL, where the patched material called itself until the stack ran out. So a
// build hides them first, as the next frame's gpuSwap() would (it makes their twins, or shows them again on WebGL).
function hideSets(root) {
  root.traverseVisible(o => {
    if (!o.isInstancedMesh2 || o._parentLOD) return;
    const ud = o.userData; if (!ud.gpuHid) { ud.gpuHid = true; ud.gpuWasVisible = true; }
    o.visible = false;
  });
}
const NEAR_S = new Sphere(), NEAR_B = new Box3(), nearBusy = new WeakSet(), CW = new Vector3();   // (CW: the camera where the frame's matrices put it)
// within d of the camera: the mesh's sphere first (cheap), then its box (a wide floor's sphere reaches far above it)
function closeTo(o, at, d) {
  const g = o.geometry;
  if (!g.boundingSphere) g.computeBoundingSphere();
  if (NEAR_S.copy(g.boundingSphere).applyMatrix4(o.matrixWorld).distanceToPoint(at) >= d) return false;
  if (!g.boundingBox) g.computeBoundingBox();
  return NEAR_B.copy(g.boundingBox).applyMatrix4(o.matrixWorld).distanceToPoint(at) < d;
}
// a material's WebGPU twin, made once for a renderer
function twinOf(gl, G, o, air) {
  let tw = gpuTwins.get(gl);
  if (tw?.r !== G.r) {
    gpuTwins.set(gl, tw = { r: G.r, m: G.fx.gpuMaterials[gl.userData.gsGpu](gl), built: new Set(), building: new Set() });
    // (with the air on they get wet in the rain as plain materials do: AIR_WET, before their shaders are built)
    // (a person's skin and clothes: wet, muddy, dusty and snowy by person.grime as well as the weather, hd3d-gpu.js grime)
    if (gl.userData.grime && tw.m.isMeshStandardNodeMaterial) G.fx.grime(tw.m, gl.userData.grime, o, AIR, gl.fog !== false ? air : null);
    else if (air && gl.isMeshStandardMaterial && gl.fog !== false) for (const t of [tw.m, tw.m.userData.gsNear]) if (t?.isMeshStandardNodeMaterial) G.fx.gpuWet(t, o, AIR, noSettle(gl, o), noiseTex(), !!air.world);
  }
  return tw;
}
function swapTwins(scene, G, cam = null, seen = null, air = null, view = null) {   // (air: the view's air settings, if it has the air on; view: whose pass close-up shaders are built for)
  scene.traverse(o => { if (o.isMesh) swapOne(o, scene, G, cam, seen, air, view); });
}
function swapOne(o, scene, G, cam, seen, air, view) {
  {
    const gl = o.userData.gsGlMat || o.material;
    if (Array.isArray(gl)) {
      // a mesh in several materials (a sculpted person: skin, eyes, cloth, leather...): each drawn as its own twin where it has one
      // (skin that light soaks through, a recipe's own textures). No close-up versions here: those are built for one material a mesh.
      if (!gl.some(m => m?.userData?.gsGpu)) return;
      if (G) {
        let list = gpuLists.get(gl);
        if (list?.r !== G.r) gpuLists.set(gl, list = { r: G.r, m: gl.map(m => m?.userData?.gsGpu ? twinOf(m, G, o, air).m : m) });
        o.userData.gsGlMat = gl; o.material = list.m;
      } else if (o.userData.gsGlMat) { o.material = gl; delete o.userData.gsGlMat; }
      return;
    }
    if (!gl?.userData?.gsGpu) return;
    if (G) {
      const tw = twinOf(gl, G, o, air);
      o.userData.gsGlMat = gl;
      const near = tw.m.userData.gsNear;
      let use = tw.m;
      if (near && cam && !o.isInstancedMesh && HD.closeUp !== false && closeTo(o, CW.setFromMatrixPosition(cam.matrixWorld), tw.m.userData.gsNearDist)) {
        const k = shaderKeyAs(o, near);   // (a shader for each kind of mesh the material is on)
        if (tw.built.has(k)) { use = near; seen?.add(k); }
        else if (!tw.building.has(k) && !nearBusy.has(G.r)) {
          // one close-up build at a time per renderer: many at once can stall the graphics chip (and a
          // phone's frame) while they all compile; a build that never settles frees the queue after 4 s
          tw.building.add(k); nearBusy.add(G.r);
          const done = () => { nearBusy.delete(G.r); clearTimeout(cap); }, cap = setTimeout(done, 4000);
          const withNear = go => { const keep = o.material; o.material = near; try { return inReach(o, go); } finally { o.material = keep; } };
          compileGPU(G.r, o, cam, scene, withNear, view).then(() => { tw.built.add(k); done(); }, done);   // (a build that fails: it stays far)
        }
      }
      o.material = use;
    } else if (o.userData.gsGlMat) { o.material = gl; delete o.userData.gsGlMat; }
  }
}
// One walk over everything in the scene, hidden things too, does all of this for each thing (each used to be a
// walk of its own, six a frame on WebGPU with the two in drawGPU that now read v.suns and v.sets: a scene
// that keeps thousands of things switched off, a pool, the other half of a level, paid for them all six times).
function gpuSwap(v, G) {
  const seen = G ? v.shSeen ||= new Set() : null, props = v.sets ||= [], suns = v.suns ||= []; props.length = suns.length = 0;
  if (AREA_LTC && G && !AREA_GPU) { G.fx.areaLTC(AREA_LTC); AREA_GPU = true; }   // area lights' tables for WebGPU (panel)
  // shadow maps: each renderer keeps its own. WebGL drew into WebGPU's map when it found one on the light
  // (and the other way round), which made WebGPU remake it in the middle of a frame that still used it:
  // that frame was lost, and every frame after it while the old one stayed bound
  // skeletons: WebGL pads a skeleton's bone matrices out to a square texture (15 bones: 16 matrices),
  // which overflows the bone buffer WebGPU made for the real count. Back on WebGPU they're cut back to
  // the bones (WebGL pads them again when it next needs its texture)
  const lightOrBones = o => {
    const sk = G && o.isSkinnedMesh && o.skeleton;
    if (sk?.boneTexture) { const n = sk.bones.length * 16; sk.boneTexture.dispose(); sk.boneTexture = null; if (sk.boneMatrices.length !== n) sk.boneMatrices = sk.boneMatrices.slice(0, n); }
    // the sun lights' part in cloud shadows and the near shadow cascade (hd3d-gpu.js gpuSunLight; drawGPU sets which part each frame), there before their shaders are built
    if (o.isDirectionalLight) { suns.push(o); if (G && !sunRoles.has(o)) sunRoles.set(o, G.fx.gpuSunLight(o, AIR, noiseTex())); }
    const sh = o.isLight && o.shadow;
    // (each spot and sun light gets a shadow node the still/moving split can drive, before its shaders are built)
    if (G && sh && o.gsSoft && o.isDirectionalLight && !sh.filterNode) sh.filterNode = G.fx.pcss(o);   // (sun().softShadows)
    if (G && sh && !o.isPointLight && sh.shadowNode === undefined) sh.shadowNode = G.fx.splitShadowNode(o);
    if (!sh?.map) return;
    if (sh.gsCache && !!G !== !sh.gsCache.isWebGLRenderTarget) { sh.gsCache.dispose(); sh.gsCache = null; }   // (a copy belongs to the renderer that made it)
    if (G) { if (sh.map.isWebGLRenderTarget) { sh.map.dispose(); sh.map = sh.gpuMap || null; sh.needsUpdate = true; } }
    else if (!sh.map.isWebGLRenderTarget) { sh.gpuMap = sh.map; sh.map = null; sh.needsUpdate = true; }
  };
  // materials with a named look that has a WebGPU version (PORTED_LOOKS): set its nodes before
  // three first turns the material into a node material (it copies them over); with the air on, lit
  // standard materials also get wet in the rain (AIR_WET)
  const look = (o, m) => {
    if (!m || gpuLooked.has(m) || m.isNodeMaterial) return;
    gpuLooked.add(m);
    for (const n of looksOf(m)) G.fx.gpuLooks[n]?.(m, lookSpec(m, n), o, tier());
    if (seeThrough3d(o)) G.fx.noAO(m);
    if (v._air && m.isMeshStandardMaterial && m.fog !== false) G.fx.gpuWet(m, o, AIR, noSettle(m, o), noiseTex(), !!v._air.world);
  };
  // (the air is laid on every material here, as WebGL's frame does. A material made since the last frame got
  // it whenever something next asked for all of them (a city building a block in its first update()), which
  // marks it changed: three then built it again and it was hidden meanwhile, the van a round starts in)
  eachThing(v.scene, o => {   // (every frame: no array is made per thing)
    if (G && v._air && o.material) airOf(o);
    if (o.isMesh) {
      swapOne(o, v.scene, G, v.cam, seen, v._air, v);
      if (G) { const ms = o.material; if (Array.isArray(ms)) { for (let i = 0; i < ms.length; i++) look(o, ms[i]); } else look(o, ms); }
    }
    if (o.isLight || o.isSkinnedMesh) lightOrBones(o);
    if (o.isInstancedMesh2 && !o._parentLOD) props.push(o);
  });
  // gs.props (InstancedMesh2): plain instanced twins on WebGPU (hd3d-gpu.js gpuProps)
  // (listed first: adding and removing the twins while walking the scene skipped things and threw)
  for (const o of props) {
    const ud = o.userData;
    if (G) {
      if (ud.gpuTwin?.r !== G.r) { ud.gpuTwin?.group.removeFromParent(); ud.gpuTwin = { r: G.r, ...G.fx.gpuProps(o) }; }
      if (o.parent && ud.gpuTwin.group.parent !== o.parent) o.parent.add(ud.gpuTwin.group);
      if (!ud.gpuHid) { ud.gpuHid = true; ud.gpuWasVisible = o.visible; }
      o.visible = false; ud.gpuTwin.group.visible = ud.gpuWasVisible;
    } else if (ud.gpuHid) { o.visible = ud.gpuWasVisible; ud.gpuHid = false; ud.gpuTwin?.group.removeFromParent(); }
  }
  // simulations with a compute twin (gs.outdoors FloodWater, gs.gas): with the chip's time and the game's frame, so they can do less while the chip is behind
  const chipMs = HD.info.gpuMs, frameMs = 1000 / (Q.game ? fpsFor(Q.game) : 60);
  for (const s of v.sims || []) s.gpuStep(G, chipMs, frameMs);
  for (const p of v.parts) {
    if (G) {
      let tw = p.gpuTwin;
      if (tw?.r !== G.r) {
        // (a twin made for another renderer, a lost graphics chip's: the new one takes its place in the scene, or the old
        // one's sprite stayed there, never swapped back for the points on WebGL, which can't draw it)
        const old = tw; tw = p.gpuTwin = { r: G.r, ...(p.makeTwin ? p.makeTwin(G) : G.fx.gpuParticles(p)) };
        if (old?.sprite.parent) { old.sprite.parent.add(tw.sprite); old.sprite.removeFromParent(); }
      }
      if (p.pts.parent) { p.pts.parent.add(tw.sprite); p.pts.removeFromParent(); }
      if (p.stepGpu) p.stepGpu(G); else tw.sync(p.n || 0);
    } else if (p.gpuTwin?.sprite.parent) { p.gpuTwin.sprite.parent.add(p.pts); p.gpuTwin.sprite.removeFromParent(); }
  }
}
const gpuEnvs = new WeakMap();
const gpuEnv = G => { let e = gpuEnvs.get(G); if (!e) { e = G.fx.studioEnv(G.r); gpuEnvs.set(G, e); } return e; };
const gpuAirs = new WeakMap();
const gpuAir = G => { let a = gpuAirs.get(G); if (!a) { a = G.fx.airNodes(AIR); gpuAirs.set(G, a); } return a; };

/* ---------- showing the 3D canvas on the card ---------- */
// The 3D canvas (and, for AR, the camera video under it) sits inside the card's screen, right before
// the card's own canvas, filling the same box (CSS .hd-layer). The card's canvas stays on top for the
// HUD and takes all the touches.
let host = null, lastView = null, GS2 = null;   // GS2: SGSR 2's frame numbers on WebGPU
// Pictures of cards that finished getting ready (prepare) wait here and are drawn into their cards
// just before the playing card's next frame, which then redraws the shared 3D canvas.
const bakes = [], waiting = new WeakSet();   // waiting: card canvases whose picture is already on its way
// A card's picture before it's played is drawn with fewer pixels (it's copied off the graphics chip,
// which costs in proportion): its first live frame, once it's on screen and still, is full quality.
const PIC_PX = .6e6;
const idle = () => new Promise(res => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => res(), { timeout: 200 }) : setTimeout(res, 16)));
// A card's shaders finish compiling whenever they do, often while the next swipe is under way or a
// round has started: its picture waits until the feed is still and no round is being played.
function bakeLater(view, c) {
  if (speed.busy() || speed.playing()) { if (waiting.has(c)) return; waiting.add(c); setTimeout(() => { waiting.delete(c); if (c.canvas.isConnected && host?.canvas !== c.canvas) bakeLater(view, c); }, 250); return; }
  if (host && host.canvas.isConnected && performance.now() - (host.view.drawnAt || 0) < 300) { if (!bakes.some(b => b[1] === c)) bakes.push([view, c]); return; }
  // no 3D game is being played: give the card that holds the 3D canvas its own last picture, take the
  // canvas off it, and draw this card's picture
  const r = renderer(); if (!r) return;
  if (host) { const old = host; host = null; if (old.canvas.isConnected) try { old.view.bake(old.ctx); } catch (_) { /* best effort */ } old.canvas.classList.remove('hd-host'); old.under?.remove(); }
  r.domElement.remove(); webgpu()?.r.domElement.remove();
  try { view.bake(c, true); } catch (_) { /* best effort */ }
}
// Getting a round ready (getready.js; the app draws the round's first frames under its loading screen): what
// the views on the 3D canvas still have on their way. Hard: shaders being built in the background and the
// things hidden until theirs are (holdNew), and on WebGPU every build still waiting its turn. Soft: cluster
// detail not in yet (it only makes frames quicker, and comes in unseen), shaders a view is building ahead
// for things it has not shown yet (view.shadersLeft, where a view has it, counts those too), and on WebGPU
// textures still being packed into the chip's own formats (r.gsPacking: each upload can hold up a frame).
const LIVE = new Set();   // the views drawn on the 3D canvas lately (a game can draw more than one)
function liveView(v, now) { LIVE.add(v); if (LIVE.size > 1) for (const o of LIVE) if (now - o.drawnAt > 2000) LIVE.delete(o); }
function stillComing() {
  if (gpuMending()) return { hard: 1, soft: 0, what: 'Graphics' };   // (a lost graphics chip being made again: gpu.js)
  const now = performance.now(); let hard = 0, soft = 0, ahead = 0;
  for (const v of LIVE) {
    if (now - v.drawnAt > 1000) continue;
    const here = (v.held?.size || 0) + (v.shJobs?.size || 0);
    hard += here; if (v.shadersLeft > here) ahead++;
    if (HD.detail !== false && v.detailPending()) soft++;
  }
  const G = webgpu(), packs = G?.r.gsPacking || 0;   // (textures still to pack: pack.js)
  hard += G?.r.gsBuilding || 0;
  return hard || soft || ahead || packs ? { hard, soft: soft + ahead + packs, what: hard || ahead ? 'Shaders' : soft ? 'Detail' : 'Textures' } : null;
}
waitsOn(stillComing);
// the canvases of renderers whose graphics chip was lost (gpu.js): taken off the card the next time a view mounts its own
const LOST_CANVAS = new WeakSet();
onGpuLoss(e => { if (e.kind === 'lost') for (const cv of e.canvases || []) LOST_CANVAS.add(cv); });
function mount(cv, c, view) {
  const hc = c.canvas, par = hc.parentNode, prevUnder = host?.under;
  if (host && host.canvas !== hc) {
    const old = host; host = null;
    // (the card it leaves has just gone off screen: a lighter picture, until it's played again, made once
    // the feed is still: drawn here, a whole frame of it plus its copy landed in the middle of the swipe)
    if (old.canvas.isConnected && !bakes.some(b => b[1] === old.ctx)) bakes.push([old.view, old.ctx]);
    old.canvas.classList.remove('hd-host');
  }
  // a view that moved between WebGL and WebGPU: take the other renderer's canvas off this card
  const prev = hc.previousSibling; if (prev && prev !== cv && (prev === R?.domElement || prev === webgpu()?.r.domElement || LOST_CANVAS.has(prev))) prev.remove();
  if (hc.previousSibling !== cv) par.insertBefore(cv, hc);
  cv.classList.add('hd-layer'); hc.classList.add('hd-host');
  const u = view.under || null;
  if (prevUnder && prevUnder !== u) prevUnder.remove();
  if (u) { u.classList.add('hd-layer'); if (cv.previousSibling !== u) par.insertBefore(u, cv); }
  const bg = view.underCss || ''; if (cv._bg !== bg) { cv._bg = bg; cv.style.background = bg; }
  host = { canvas: hc, ctx: c, view, under: u };
  return true;
}

/**
 * Sunlight: a shadow-casting directional light covering a size x size metre box that follows the
 * action (s.follow(x, y, z) each frame; it moves a tile of its shadow map at a time, so edges don't shimmer and
 * most of the map is kept from frame to frame: shadow-tiles.js). For big
 * outdoor levels use s.fit(view, { far, ground }) each frame instead: the shadow then covers just what
 * the camera can see, out to `far` metres, and gets sharper the narrower the view (a zoomed scope gets
 * crisp shadows where it looks). s.aim(x, y, z) points it (the direction towards the sun).
 * Cascades: s.fit(view, { far: 300, near: 40 }) adds a second, much sharper shadow over the first 40 m
 * (high and ultra tiers, with v.air() on), so the grass at your feet and the far hills both get theirs.
 */
// A new shadow map size, set between frames. WebGL makes a new map when the old one is gone. On WebGPU three's
// shadow node keeps its map and resizes it itself, but in the middle of drawing the frame, which throws away
// a texture that frame has already used ("Destroyed texture used in a submit", the frame is lost). So the
// map is resized here, before the frame, and three then finds it the right size.
function shadowSize(sh, n) {
  sh.mapSize.set(n, n); sh.needsUpdate = true;
  if (sh.map?.isWebGLRenderTarget) { sh.map.dispose(); sh.map = null; } else sh.map?.setSize(n, n, sh.map.depth);
}
// Automatic level of detail for the game's own meshes (Unreal and Unity make these on import; here they're
// made in the background as a game plays). A detailed mesh (LOD_MIN_TRIS or more) gets simpler copies
// from meshoptimizer, each with the most it may move a point (its error, in metres at the mesh's size).
// Each frame the simplest copy whose error would show as less than LOD_PX pixels on screen is drawn, so
// nobody can see the swap: far away a mesh needs a fraction of its triangles. The copies share the
// original's points (only the triangle list changes), so normals, colours and UVs stay exact.
// Skinned and morphing meshes too (their bone weights and shapes are shared points). Off for instanced and
// multi-material meshes, see-through ones and userData.noLod. (Sets of copies, gs.props, get levels of
// their own: autoCopies below.)
// The swap is for the frame's drawing only: lodBack() puts each mesh's own geometry back once the frame is
// drawn, so the game never meets a copy. (It once did: Frost Line reshapes its slope's pieces as it goes and
// calls mesh.geometry.computeVertexNormals(); run on a far copy's few triangles, that zeroed nine normals in
// ten of the shared list, and the slope drew black once the rider got near.) A copy is made for the points
// and triangles as they were then, so a mesh whose points or triangles change is drawn whole, and its
// copies are made again once it has kept still for LOD_STILL ms (one that changes every frame is drawn whole).
const LOD_MIN_TRIS = 3000, LOD_PX = .6, LOD_KEEP = [.5, .25, .1], LOD_STILL = 1000;
const LODS = new WeakMap();   // geometry -> { lv: its levels (null: none yet, or not worth it), pos, ver, idx, iv: what they were made from, due, at }
let lodReady = false; MeshoptSimplifier.ready.then(() => { lodReady = true; }, () => {});
function lodLevels(g) {
  const idx = g.index, pos = g.attributes.position;
  if (!lodReady || !idx || !pos || pos.itemSize !== 3 || pos.isInterleavedBufferAttribute) return null;
  const P = pos.array instanceof Float32Array && pos.array.length === pos.count * 3 ? pos.array : Float32Array.from({ length: pos.count * 3 }, (_, i) => pos.getComponent(i / 3 | 0, i % 3));
  const I = idx.array instanceof Uint32Array ? idx.array : new Uint32Array(idx.array), scale = MeshoptSimplifier.getScale(P, 3);
  const out = [{ g, err: 0, tris: I.length / 3 }];
  for (const k of LOD_KEEP) {
    const [ix, err] = MeshoptSimplifier.simplify(I, P, 3, Math.max(3, Math.floor(I.length * k / 3) * 3), .05, ['LockBorder']);
    if (ix.length >= out.at(-1).tris * 3 * .85 || !ix.length) break;   // (not much simpler: stop)
    const lg = new BufferGeometry();
    for (const n in g.attributes) lg.setAttribute(n, g.attributes[n]);
    lg.morphAttributes = g.morphAttributes; lg.morphTargetsRelative = g.morphTargetsRelative;
    lg.setIndex(new BufferAttribute(pos.count > 65535 ? ix : Uint16Array.from(ix), 1));
    lg.boundingSphere = g.boundingSphere; lg.boundingBox = g.boundingBox; lg.name = g.name + ':lod'; lg.userData.gsLodOf = g;
    out.push({ g: lg, err: err * scale, tris: ix.length / 3 });
  }
  return out.length > 1 ? out : null;
}
// a geometry's entry in LODS, brought up to date: levels made for points or triangles that have changed since are let go
function lodEntry(g, now) {
  let e = LODS.get(g); const p = g.attributes.position, ix = g.index;
  if (!e) LODS.set(g, e = { lv: null, due: true, at: -Infinity });   // (new: made as soon as there's a frame for it)
  else if (e.pos === p && e.ver === p.version && e.idx === ix && e.iv === ix?.version && lodLists(g, e.lv)) return e;
  else { e.lv = null; e.due = true; e.at = now; }   // changed: drawn whole until it keeps still
  e.pos = p; e.ver = p?.version; e.idx = ix; e.iv = ix?.version;
  return e;
}
// the copies still share the geometry's lists (the game may have added, swapped or taken one away)
function lodLists(g, lv) {
  if (!lv) return true;
  const lg = lv[1].g;
  for (const n in g.attributes) if (lg.attributes[n] !== g.attributes[n]) return false;
  for (const n in lg.attributes) if (!(n in g.attributes)) return false;
  return true;
}
function autoLod(v, ph) {
  if (v.lodOn?.length) lodBack(v);   // (each mesh starts the frame as itself)
  if (HD.autoLod === false) return;
  const cam = v.cam, k = ph / (2 * Math.tan(cam.fov * Math.PI / 360)), now = performance.now();   // k: pixels per metre at 1 m
  let built = 0;
  eachShown(v.scene, o => {
    if (!o.isMesh || o.isInstancedMesh || o.isInstancedMesh2 || o.isBatchedMesh || o.userData.noLod) return;
    let L = o.userData.gsLod;
    if (L === undefined) {
      if (v.details?.map.has(o)) return;   // (cluster detail has it, or its clusters are on their way)
      const g = o.geometry;
      if (!g?.index || g.groups.length > 1 || Array.isArray(o.material) || o.material.transparent || g.index.count < LOD_MIN_TRIS * 3) { o.userData.gsLod = null; return; }
      if (!g.boundingSphere) g.computeBoundingSphere();
      o.userData.gsLod = L = { base: g };
    }
    if (!L) return;
    const g = L.base;
    if (o.geometry !== g) { o.userData.gsLod = undefined; return; }   // the game swapped the geometry itself
    const E = lodEntry(g, now);
    if (E.due && lodReady && now - E.at >= LOD_STILL && built++ === 0) { E.due = false; try { E.lv = lodLevels(g); } catch (err) { E.lv = null; } }   // one a frame
    const lv = E.lv; if (!lv || !g.boundingSphere) return;
    const bs = g.boundingSphere, e = o.matrixWorld.elements, sc = Math.sqrt(Math.max(e[0] * e[0] + e[1] * e[1] + e[2] * e[2], e[4] * e[4] + e[5] * e[5] + e[6] * e[6], e[8] * e[8] + e[9] * e[9] + e[10] * e[10]));
    LOD_V.copy(bs.center).applyMatrix4(o.matrixWorld);
    const d = Math.max(.01, LOD_V.distanceTo(CW.setFromMatrixPosition(cam.matrixWorld)) - bs.radius * sc), px = k * sc / d;
    let pick = null;
    for (let i = lv.length - 1; i > 0; i--) if (lv[i].err * px < LOD_PX) { pick = lv[i].g; break; }
    if (!pick) return;
    pick.boundingSphere = g.boundingSphere; pick.boundingBox = g.boundingBox;   // (the game may have made new ones)
    o.geometry = pick; (v.lodOn ||= []).push(o);
  });
}
// after the frame: every mesh drawn by a simpler copy gets its own geometry back
function lodBack(v) {
  const list = v.lodOn; if (!list) return;
  for (const o of list) { const g = o.geometry?.userData.gsLodOf; if (g) o.geometry = g; }
  list.length = 0;
}
const LOD_V = new Vector3();
// Detail levels that fade into each other (lod-fade.js). Each frame, just before the scene is drawn: the people
// and animals changing level are moved along their fades, and every mesh drawn dithered this frame (theirs, and
// the lists of gs.props copies changing level) has its material(s) swapped for the dithered twins, put back as
// soon as the frame is drawn (fadeBack), so nothing else (the walks over the scene, holdNew, the games) ever sees
// a twin. A twin's shader is built in the background the first time it is wanted (fadeReady), one build at a
// time for each renderer, and marked built for the view as holdNew's are; until then a change waits a moment
// (lod-fade.js FADE.wait), then pops.
const FADE_LIST = [], FADE_GPU = { object: new WeakMap(), copy: new WeakMap() }, fadeBusy = new WeakSet();
function fadeTwinsOf(o, G, per) {
  if (!G) return per === 'object' ? glTwins(o) : null;
  return twinList(o, FADE_GPU[per], m => G.fx.fadeTwin(m, per, G.r));
}
function fadeReady(v, G, r, per) {
  const seen = v.shSeen ||= new Set(), jobs = v.fadeJobs ||= new Set();
  // one build at a time for each renderer, in the background: o as it will be drawn (with mats, its twins, if given;
  // shown, on the camera's layer, and an empty list of copies given one), into the picture the scene is drawn into
  const build = (o, k, mats) => {
    if (jobs.has(k) || fadeBusy.has(r) || v.shJobs?.has(k)) return;   // (v.shJobs: holdNew is building it)
    // (the view's own shaders first: builds wait their turn on a renderer, and things new on screen are held back until
    // theirs are built, so a twin built in a view's first frames, or while the view builds, kept the whole view's copies
    // from showing for that long)
    if ((v._fadeFrames || 0) < FADE_SETTLE || v.shadersLeft > 0) return;
    jobs.add(k); fadeBusy.add(r);
    let fin = false;
    const done = ok => { if (fin) return; fin = true; if (ok) seen.add(k); jobs.delete(k); fadeBusy.delete(r); clearTimeout(cap); }, cap = setTimeout(() => done(false), 4000);
    const swap = go => { const keep = o.material, n = o.count; if (mats) o.material = mats; if (o.isInstancedMesh && !o.count) o.count = 1; try { return inReach(o, go); } finally { o.material = keep; if (o.isInstancedMesh) o.count = n; } };
    const forPic = go => { const rt0 = r.getRenderTarget(); try { r.setRenderTarget(v._holdRT ?? null); return go(); } finally { r.setRenderTarget(rt0); } };
    try {
      const p = G ? compileGPU(r, o, v.cam, v.scene, swap, v) : Promise.resolve(swap(() => forPic(() => r.compileAsync(o, v.cam, v.scene))));
      p.then(() => done(true), () => done(false));
    } catch (e) { done(false); }
  };
  const SK = G?.fx.skinPool(r);
  return o => {
    if (HD.hold === false) return true;   // (holding off: built in the frame, as holdNew's are)
    // a level on bones not shown yet is taken into the chip's pool now (skin-gpu.js), so its shaders are built as
    // they will be drawn: posed from the pool, not in their own vertex stage
    if (o.isSkinnedMesh) SK?.take(o);
    // a level cluster detail draws through cut twins (detail.js cutTwin): the twins are what is drawn, theirs the shaders
    // to build (their own ones are holdNew's), each with its part of the dithered twins
    const e = o.userData.gsDetailed ? v.details?.map.get(o) : null;
    if (e && per === 'object') {
      const tw = fadeTwinsOf(o, G, per);
      if (!tw || (Array.isArray(tw) && tw.some(t => !t))) return false;
      for (const p of e.parts) {
        const t = p.twin; if (!t?.isCutMesh) continue;
        if (!(t.layers.mask & 1) && !o.userData.noHold) return false;   // (its own shader still building)
        const m = partMaterial(tw, p); if (!m) continue;
        const k = shaderKeyAs(t, m); if (!seen.has(k)) { build(t, k, m); return false; }
      }
      return true;
    }
    // a person's level coming in is drawn with its own shader once the fade ends: built too (on WebGL nothing else
    // builds a hidden thing's ahead), and while holdNew has it back for that build, it waits
    if (per === 'object' && !o.userData.noHold) {
      if (!(o.layers.mask & 1)) return false;
      const kb = shaderKey(o);
      if (!seen.has(kb)) { build(o, kb, null); return false; }
    }
    const tw = fadeTwinsOf(o, G, per);
    if (!tw || (Array.isArray(tw) && tw.some(t => !t))) return false;
    const k = shaderKeyAs(o, tw);
    if (seen.has(k)) return true;
    build(o, k, tw);
    return false;
  };
}
const NOT_NOW = () => false;
const FADE_SETTLE = 20;   // frames a view draws before twins are built (fadeReady)
function fadeOn(v, G, r, smooth, still) {
  v._fadeFrames = (v._fadeFrames || 0) + 1;
  const keep = v._fadeKeep ||= []; keep.length = 0;
  const ready = still ? NOT_NOW : fadeReady(v, G, r, 'object');
  fadeStep(v.scene, ready, smooth, FADE_LIST);
  if (!still && !fadeBusy.has(r) && !getready.warming) fadeAhead(v, r, ready);   // (not under a loading screen: it waits for no more than it did)
  for (let i = 0; i < FADE_LIST.length; i += 3) {
    const o = FADE_LIST[i], val = FADE_LIST[i + 1], casts = FADE_LIST[i + 2];
    keep.push(o, o.material, o.visible, o.castShadow, o.onBeforeRender);
    // (a level cluster detail draws through cut twins, detail.js cutTwin: the twins fade in its place, with its share)
    const e = o.userData.gsDetailed ? v.details?.map.get(o) : null;
    if (e) for (const p of e.parts) { const t = p.twin; if (t) keep.push(t, t.material, t.visible, t.castShadow, t.onBeforeRender); }
    if (!val) { o.visible = false; if (e) for (const p of e.parts) if (p.twin) p.twin.visible = false; continue; }   // (a level waiting for its twins' shaders: not shown yet)
    o.material = fadeTwinsOf(o, G, 'object');
    if (!G) { hookGL(o); if (!casts) o.castShadow = false; }   // (WebGL: the value goes in before each draw; the shadow from one level at a time)
    if (e) for (const p of e.parts) {
      const t = p.twin; if (!t?.isCutMesh) continue;   // (a still mesh's clusters, DetailMesh: drawn as they are)
      const m = partMaterial(o.material, p); if (!m) continue;
      t.material = m; t.userData.gsFadeV = o.userData.gsFadeV;
      if (!G) { hookGL(t); if (!casts) t.castShadow = false; }
    }
  }
  if (G) for (const s of v.sets || []) {
    const f = s.userData.gpuTwin?.fades?.(); if (!f) continue;
    for (const m of f) if (m.visible) { const tw = fadeTwinsOf(m, G, 'copy'); keep.push(m, m.material, m.visible, m.castShadow, m.onBeforeRender); if (tw && !(Array.isArray(tw) && tw.some(t => !t))) m.material = tw; else m.visible = false; }
  }
  HD.info.fading = fadingCount();
}
// The twins of the people and animals on screen, built ahead in the background (one at a time, as the frames go),
// so that their first change of level fades too rather than waiting for its shaders and popping
function fadeAhead(v, r, ready) {
  const ok = v._fadeOk ||= new WeakMap(), n = FADE.n;
  fadeAheadList((root, parts) => {
    if (ok.get(root) > n - 120) return true;   // (all built: looked at again now and then)
    let all = true;
    for (const p of parts) p?.traverse(m => { if (all !== null && m.isMesh && m.material && !ready(m)) all = fadeBusy.has(r) ? null : false; });
    if (all) ok.set(root, n);
    return all !== null;   // (a build started: the rest when it is done)
  });
}
function fadeBack(v) {
  const keep = v._fadeKeep; if (!keep?.length) return;
  for (let i = keep.length - 5; i >= 0; i -= 5) {
    const o = keep[i]; o.material = keep[i + 1]; o.visible = keep[i + 2]; o.castShadow = keep[i + 3];
    if (o.onBeforeRender !== keep[i + 4]) { if (Object.hasOwn(o, 'onBeforeRender') && keep[i + 4] === Object.getPrototypeOf(o).onBeforeRender) delete o.onBeforeRender; else o.onBeforeRender = keep[i + 4]; }
  }
  keep.length = 0;
}
// Auto exposure (v.autoExposure): the eye adapting, as every big engine does. A light meter reads the
// scene's brightness every few frames (a 16 x 16 grid of log brightness, read back without waiting:
// readRenderTargetPixelsAsync), and the exposure drifts towards the one that puts the average at
// mid grey: stepping out of a dark bunker into sunlight dazzles for a moment, then settles. Faster
// to darken than to brighten, like eyes.
const EYE_FS = `uniform sampler2D tDiffuse; varying vec2 vUv;
  void main(){ float s = 0.;
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) { vec3 c = texture2D(tDiffuse, vUv + (vec2(float(x), float(y)) - 1.5) / 64.).rgb; s += log2(max(dot(c, vec3(.2126, .7152, .0722)), 1e-4)); }
    float n = clamp((s / 16. + 14.) / 20., 0., 1.) * 255.; gl_FragColor = vec4(floor(n) / 255., fract(n), 0., 1.); }`;
class Eye {
  constructor() { this.e = 0; this.goal = 0; this.busy = false; this.n = 0; this.key = null; }   // log2 of the exposure
  // the 16 x 16 bytes back: mean log brightness (the middle of the screen counts twice)
  take(px, o) {
    let s = 0, w = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const i = (y * 16 + x) * 4, l = (px[i] + px[i + 1] / 255) / 255 * 20 - 14, k = x >= 4 && x < 12 && y >= 4 && y < 12 ? 2 : 1; s += l * k; w += k; }
    const avg = this.avg = s / w, key = o.key ? Math.log2(o.key) : (this.key ??= avg), d = key - avg;   // no key: the game's look as it starts is the target
    // eyes don't fully make up the difference (amount); a camera's meter (v.lens) does, but only part of it when it's dark (night: night stays night)
    this.goal = Math.min(Math.log2(o.max ?? 2.5), Math.max(Math.log2(o.min ?? .4), (d > 0 ? d * (o.night ?? 1) : d) * (o.amount ?? .7)));
  }
  step(dt, o) { const up = this.goal > this.e, k = 1 - Math.exp(-dt * (up ? o.speed ?? 1.2 : o.darken ?? 3)); this.e += (this.goal - this.e) * k; return 2 ** this.e; }
  // read now and then (one read at a time)
  want() { return !this.busy && ++this.n % 6 === 0; }
}
const occBack = (job, px) => depthBack(job, px, false);   // (a depth picture back from the WebGPU meter: its rows run from the top)
// Automatic static batching (HD.batch, on by default): the many small still things of a level (crates,
// posts, rocks, walls, lamps) that share a material are merged into one mesh per material and area, one
// draw call (and one shadow draw) where there were dozens: Unity's static batching, done by itself.
// Merged meshes use the same shaders as the pieces (nothing new to build, so no stutter) and no work
// per frame. WebGL only: there each draw call costs the phone's driver real time, while on WebGPU draws are
// cheap and merging measured slower (bigger meshes fall in more of the lamps' shadow views). A mesh joins once it has kept still for about 1.5 s; the moment one moves, hides, changes
// material or geometry, or leaves the scene, its group goes back to drawing piece by piece (and the
// others merge again later without it), so a game never has to know. Not merged: skinned, morphing,
// instanced, see-through, multi-material and big meshes (those get automatic LOD instead), kit twins,
// and mesh.userData.noBatch. The pieces stay in the scene for the game, and for raycasts (three's
// Raycaster also sees the batch layer they move to), just off the camera's layer.
const BATCH_LAYER = 26, BATCH_BIT = 1 << BATCH_LAYER, BATCH_SCAN = 500, BATCH_STILL = 3, BATCH_MIN = 4, BATCH_MAX_TRIS = LOD_MIN_TRIS, BATCH_CELL = 24, BATCH_WORK = 12000;
for (const k of ['intersectObject', 'intersectObjects']) {   // (a batched mesh is still hit by raycasts that look at the default layer)
  const f = Raycaster.prototype[k];
  Raycaster.prototype[k] = function (...a) { const m = this.layers.mask; if (m & 1) this.layers.mask = m | BATCH_BIT; try { return f.apply(this, a); } finally { this.layers.mask = m; } };
}
const BATCH_SNAP = new WeakMap(), NO_RAY = () => {};
function batchable(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isInstancedMesh2 || o.isBatchedMesh || o.isSkinnedMesh || o.morphTargetInfluences || o.userData.noBatch || o.userData.gsTwin || o.userData.gsLod) return false;
  const m = o.material, g = o.geometry;
  if (!m || Array.isArray(m) || m.transparent || m.userData?.gsGpu || !g || g.morphAttributes?.position || g.attributes.position?.isInterleavedBufferAttribute || isSlim(g)) return false;   // (groups are ignored with one material; lists kept in fewer bytes, slim.js, don't merge with plain ones)
  if ((o.layers.mask & ~SH_BITS) !== 1 || !o.frustumCulled || o.onBeforeRender !== Object3D.prototype.onBeforeRender) return false;
  return (g.index ? g.index.count : g.attributes.position.count) / 3 < BATCH_MAX_TRIS;
}
function batchKey(o) {
  const g = o.geometry, e = o.matrixWorld.elements, cell = Math.floor(e[12] / BATCH_CELL) + ',' + Math.floor(e[14] / BATCH_CELL);   // (by area too, so off-screen groups are still skipped whole)
  return o.material.id + '|' + Object.keys(g.attributes).sort().map(k => k + g.attributes[k].itemSize).join(',') + (g.index ? '+i' : '') + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + cell;
}
// (kept in the scene's own numbers, so the drawing's centre moving along, origin.js, is not a piece moving: se is the scene's world matrix now)
function sameMatrix(a, b, se) { for (let i = 0; i < 16; i++) { const t = i === 12 ? se[12] : i === 13 ? se[13] : i === 14 ? se[14] : 0; if (Math.abs(a[i] - t - b[i]) > 1e-7) return false; } return true; }
function ownMatrix(out, el, se) { out.set(el); out[12] -= se[12]; out[13] -= se[13]; out[14] -= se[14]; return out; }
function shownInScene(o, scene) { for (let x = o; x; x = x.parent) { if (x === scene) return true; if (!x.visible) return false; } return false; }
function autoBatch(v, now) {
  const B = v.batches ||= { list: [] }, se = v.scene.matrixWorld.elements;
  if (HD.batch === false) { if (B.list.length) unbatchAll(v); return; }
  // every frame: a group with a piece the game changed goes back to drawing piece by piece
  for (let i = B.list.length - 1; i >= 0; i--) {
    const b = B.list[i];
    for (const [o, e] of b.items) {
      o.updateWorldMatrix(true, false);   // (moved in this frame's update: split before the frame is drawn)
      if (o.material === b.mesh.material && o.geometry === e.g && sameMatrix(o.matrixWorld.elements, e.m, se) && shownInScene(o, v.scene)) continue;
      const sn = BATCH_SNAP.get(o); if (sn) { sn.left = (sn.left || 0) + 1; sn.n = sn.left > 1 ? -1e9 : -20; }   // (moves now and then: ~10 s before it tries again; twice: a mover, left be)
      unbatch(B, b, se); break;
    }
  }
  // now and then: what has kept still for a while is merged (one group a time, to spread the work)
  if (now - (B.t || 0) < BATCH_SCAN) return; B.t = now;
  const groups = new Map();
  v.scene.traverseVisible(o => {
    if (!batchable(o)) return;
    const el = o.matrixWorld.elements; let s = BATCH_SNAP.get(o);
    if (!s) { BATCH_SNAP.set(o, { m: ownMatrix(new Float64Array(16), el, se), n: 0 }); return; }
    if (!sameMatrix(el, s.m, se)) { ownMatrix(s.m, el, se); s.n = Math.min(s.n, 0); return; }
    if (++s.n < BATCH_STILL) return;
    const k = batchKey(o); let a = groups.get(k); if (!a) groups.set(k, a = []); a.push(o);
  });
  for (const a of groups.values()) if (a.length >= BATCH_MIN) { makeBatch(v, B, a); return; }
}
function makeBatch(v, B, list) {
  const parts = []; let verts = 0;
  for (const o of list) { const n = o.geometry.attributes.position.count; if (verts + n > BATCH_WORK) break; verts += n; parts.push(o); }   // (a little at a time: no hitch while it merges)
  if (parts.length < BATCH_MIN) return;
  // (merged about the first piece, in the scene's own numbers: the frame's world matrices are a step back by the drawing's centre, origin.js)
  const se = v.scene.matrixWorld.elements, e0 = parts[0].matrixWorld.elements, cx = e0[12] - se[12], cy = e0[13] - se[13], cz = e0[14] - se[14];
  const geos = parts.map(o => { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); g.translate(-e0[12], -e0[13], -e0[14]); g.clearGroups(); g.morphAttributes = {}; return g; });
  let g; try { g = mergeGeometries(geos, false); } catch (e) { g = null; } for (const x of geos) x.dispose();
  if (!g) { for (const o of parts) BATCH_SNAP.get(o).n = -1e9; return; }   // (pieces that won't merge: left be)
  g.computeBoundingSphere(); g.computeBoundingBox();
  const o0 = parts[0], mesh = new Mesh(g, o0.material);
  mesh.castShadow = o0.castShadow; mesh.receiveShadow = o0.receiveShadow; mesh.position.set(cx, cy, cz); mesh.updateMatrix(); mesh.matrixAutoUpdate = false; mesh.raycast = NO_RAY;
  mesh.name = 'gs-batch'; mesh.userData.noBatch = mesh.userData.noLod = mesh.userData.noHold = true;
  const b = { mesh, items: new Map() };
  for (const o of parts) { b.items.set(o, { g: o.geometry, m: ownMatrix(new Float64Array(16), o.matrixWorld.elements, se), mask: o.layers.mask }); o.layers.mask = BATCH_BIT; }   // off the camera's (and the shadow passes') layers, still in the scene
  v.scene.add(mesh); mesh.updateMatrixWorld(true); B.list.push(b);   // (made after this frame's matrices were worked out: without its own, it drew its pieces about the world's centre for a frame)
  HD.info.batched = (HD.info.batched || 0) + parts.length; HD.info.batches = (HD.info.batches || 0) + 1;
}
function unbatch(B, b, se) {
  for (const [o, e] of b.items) { o.layers.mask = (o.layers.mask & ~BATCH_BIT) | e.mask; const sn = BATCH_SNAP.get(o); if (sn) { ownMatrix(sn.m, o.matrixWorld.elements, se); sn.n = Math.min(sn.n, 0); } }
  HD.info.batched = Math.max(0, (HD.info.batched || 0) - b.items.size);
  b.mesh.removeFromParent(); b.mesh.geometry.dispose(); B.list.splice(B.list.indexOf(b), 1);
}
function unbatchAll(v) { const B = v.batches; while (B.list.length) unbatch(B, B.list[0], v.scene.matrixWorld.elements); }
// Cluster detail (HD.detail, on by default; detail.js): a Nanite-style level of detail for the game's big
// meshes (HD.detailMin triangles or more: a hillside, a cliff, a cathedral made in code, a person close up). Where
// automatic LOD above swaps a whole mesh for a simpler copy, here the mesh is cut into clusters of a few
// hundred triangles with coarser and coarser versions of each neighbourhood, and every frame each part of
// it is drawn only as finely as shows in the picture (within HD.detailPx pixels) and not at all where it
// is out of view: the near end of a long wall at full detail, the far end at a fraction, with no cracks
// between them. Shadow maps pick for themselves the same way. So a model can carry far more triangles
// close up without costing more far away.
// As Unreal's Nanite now does, it takes nearly everything solid: still or moving (a twin follows its mesh's
// place every frame and is picked from where the camera is in the mesh's own space, so a mesh that is carried
// about, spun or thrown is picked just as a still one), copies (a three InstancedMesh: each copy picked on
// its own, a near copy fine and a far one from a few clusters), meshes in several materials (each material's
// part built and drawn by a twin of its own, the seams between them kept still at every level so they never
// crack), cut-out leaves and fences (alpha-tested: built without the rough merge that would melt their cards
// together), and meshes on bones or with blend shapes (people, animals: one cut a frame from where the camera
// is in the mesh's space at rest through the bone that carries most of it, written into an index list of the
// twin's own; the twin is skinned as the mesh was, on WebGPU by the chip's skinning pool from the mesh's own
// posed points; detail.js cutTwin).
// The clusters take a second or so for each quarter of a million triangles, in a worker; the mesh draws
// whole until they arrive (and until the cluster shader has built, in the background), and they are kept
// by the mesh's content (memory, then IndexedDB), so the next round and the next visit have them at once.
// The game's mesh stays in the scene, untouched, for the game and for raycasts, on the batch layer no
// camera draws; twins are drawn in its place and follow its place, materials, shadows and visibility. The
// moment the mesh's geometry or material stops fitting, or it leaves the scene, the twins go and the mesh
// draws as itself again. Not for: see-through materials (drawn back to front), materials that move points
// in the shader (water, wind in leaves: positionNode, displacement maps), meshes whose points the game
// rewrites (their clusters would be of the old shape), copies on bones, gs.props sets (they have levels of
// their own: autoCopies below), marked reflectors, and mesh.userData.detail = false. userData.detail = true takes a smaller mesh too (from DETAIL_OWN_TRIS).
// A set of copies is taken from DETAIL_COPY_TRIS triangles a copy and HD.detailMin in all, up to
// DETAIL_COPIES copies: each copy is a few draws of its own, so thousands of small ones are better whole.
const DETAIL_OWN_TRIS = 2000, DETAIL_SCAN = 400, DETAIL_ASK = 2, DETAIL_WORTH = .6, DETAIL_COPY_TRIS = 2000, DETAIL_COPIES = 256;
// Does a mesh pay? Triangles left out against the draws added. A mesh drawn whole is one draw; in clusters it is a
// draw for each run of them, and its twins are looked after every frame. The rates are the Galaxy Z Fold 8's (2026-11-12
// engine test scenes: 740,000 fewer triangles saved 6.9 ms of the chip; a run inside a mesh's own draws, the same shader and
// lists, is far cheaper than a draw of a thing of its own, taken as a sixth of one). A mesh of DETAIL_SURE triangles or more
// stays in (a big one saves plenty once it is a few metres off); a smaller one (HD.detailMin up to that) is tried, and one that
// over DETAIL_TRY frames saves less than it costs goes back to drawing whole until DETAIL_AGAIN ms later.
const DETAIL_SURE = 20000, TRI_MS = 9.3e-6, RUN_MS = .002, MESH_MS = .01, DETAIL_TRY = 90, DETAIL_AGAIN = 12000;
const DETAIL_RESTS = new WeakMap();   // mesh -> when it may be tried again
const DRAWN = [0, 0];
const DETAIL_LOOKS = new Set(['air', 'pulse', 'room', 'ground', 'hills', 'rock', 'rooms']);   // kit looks that leave the points where they are
const NO_DETAIL = new WeakSet();   // geometries that can't be clustered, aren't worth it, or keep changing
let detailAsking = 0;
const OBR = Object3D.prototype.onBeforeRender, OAR = Object3D.prototype.onAfterRender;
function detailMaterial(m) {
  if (!m || Array.isArray(m) || m.transparent || m.wireframe || m.displacementMap || m.positionNode || m.isShaderMaterial || m.isRawShaderMaterial) return false;
  if (Object.hasOwn(m, 'onBeforeCompile') && m.onBeforeCompile !== BASE_OBC) { const l = looksOf(m); if (!l.length || !l.every(n => DETAIL_LOOKS.has(n))) return false; }
  return true;
}
// (a list of materials: every one of them, each drawn by a part of its own)
const detailMaterials = m => (Array.isArray(m) ? m.length > 0 && m.every(detailMaterial) : detailMaterial(m));
const cutOut = m => (Array.isArray(m) ? m.some(cutOut) : m.alphaTest > 0 || !!m.alphaHash);
const detailVersion = g => g.attributes.position.version + (g.index ? g.index.version * 65537 : 0);
// what kind of twin a mesh gets: 'cut' (on bones, or with blend shapes), 'copies' (an InstancedMesh) or 'mesh'
const detailKind = o => (o.isSkinnedMesh || o.morphTargetInfluences?.length ? 'cut' : o.isInstancedMesh ? 'copies' : 'mesh');
// a mesh twins can stand in for: drawn the ordinary way, on the ordinary layer
function detailFits(o) {
  if (!o.isMesh || o.isInstancedMesh2 || o.isBatchedMesh || o.isDetailMesh || o.isCutMesh) return false;
  const ud = o.userData; if (ud.detail === false || ud.gsTwin || ud.gsReflect || ud.decal) return false;
  if (o.isInstancedMesh && (o.isSkinnedMesh || o.morphTargetInfluences || o.count > DETAIL_COPIES || o.count < 1)) return false;
  if (o.isSkinnedMesh && !o.skeleton) return false;
  if (!detailMaterials(ud.gsGlMat || o.material) || o.customDepthMaterial || o.customDistanceMaterial) return false;
  return (o.layers.mask & ~SH_BITS) === 1 && o.onBeforeRender === OBR && o.onAfterRender === OAR;
}
function detailable(o) {
  if (!detailFits(o)) return false;
  const ud = o.userData, g = ud.gsLod?.base || o.geometry;
  if (!g || NO_DETAIL.has(g)) return false;
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
  const m = ud.gsGlMat || o.material;
  if (Array.isArray(m) && (g.groups.length < 2 || g.groups.some(gr => !m[gr.materialIndex ?? 0]))) return false;   // (a list of materials draws by its groups: every group needs one)
  const tris = (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3, n = o.isInstancedMesh ? o.count : 1;
  const enough = ud.detail ? tris >= DETAIL_OWN_TRIS : n > 1 ? tris >= DETAIL_COPY_TRIS && tris * n >= HD.detailMin : tris >= HD.detailMin;
  return enough && canCluster(g, detailKind(o) === 'cut');
}
// Real surface detail (gs.models.relief, relief.js): a mesh whose relief has arrived is drawn by a twin
// made from the relief's geometry, however few triangles the mesh itself has. The mesh keeps its own
// simple geometry for the game. The twin's material is the mesh's own without its parallax (the depth
// is real now), a copy kept for each material.
const RELIEF_MATS = new WeakMap();
function reliefMaterial(m) {
  if (!m.userData?.pom) return m;
  let f = RELIEF_MATS.get(m);
  if (!f) {
    const ud = m.userData; m.userData = {};   // (three copies userData through JSON, which would write the height picture out as text)
    try { f = m.clone(); } finally { m.userData = ud; }
    f.userData = { ...ud }; delete f.userData.pom; delete f.userData.gsLooks; if (f.userData.gsGpu === 'pom') delete f.userData.gsGpu;
    for (const n of looksOf(m)) lookPatch(f, n, lookSpec(m, n));
    RELIEF_MATS.set(m, f);
  }
  return f;
}
// A twin whose places are on a grid is drawn through a matrix that scales them back, and three.js's WebGL shaders move a
// shadow lookup along a normal that such a scale shortens or lengthens. Its normal matrix is given without the grid's
// scale, so the twin is lit and shadowed exactly as its mesh would be.
function gridNormals(t, scale) { const nm = t.normalMatrix, get = nm.getNormalMatrix; nm.getNormalMatrix = function (m) { get.call(this, m); return this.multiplyScalar(scale); }; }
const reliefReady = (o, R) => R?.state === 'ready' && (o.userData.gsLod?.base || o.geometry) === R.base && R.base.attributes.position.version === R.ver;
// the triangles real surface detail may draw a frame (0: its meshes draw flat)
const reliefBudget = () => (HD.relief === false ? 0 : Math.max(0, HD.reliefTris ?? tier().relief ?? 150000));
function inScene(o, scene) { for (let x = o; x; x = x.parent) if (x === scene) return true; return false; }
function detailDrop(v, e, never = false) {
  const o = e.o, D = v.details;
  D.map.delete(o); e.gone = true; if (e.kind === 'cut' && e.shown) v._shAgain = 3;
  if (never && !e.relief) NO_DETAIL.add(e.g);
  for (const p of e.parts) if (p.twin) { p.twin.removeFromParent(); if (p.twin.isDetailMesh) p.twin.dispose(); else p.twin.geometry.dispose(); p.twin = null; }
  e.twin = null;
  if (o.layers.mask === BATCH_BIT) o.layers.mask = 1;
  if (o.userData.gsLod === null) o.userData.gsLod = undefined;   // (automatic LOD may have it again)
  delete o.userData.gsDetailed;
}
function detailDropAll(v) { const D = v.details; if (D) for (const e of [...D.map.values()]) detailDrop(v, e); }
// the parts of a mesh: one for each material of a list (detail.js partsOf), or the whole of it
function detailParts(o, g) {
  const m = o.userData.gsGlMat || o.material;
  if (!Array.isArray(m)) return [{ g, material: -1, cl: null, twin: null }];
  const ps = partsOf(g); return ps ? ps.map(p => ({ g: p.g, material: p.material, cl: null, twin: null })) : null;
}
// a part's material, as the mesh has it now
const partMaterial = (m, p) => (p.material < 0 ? m : Array.isArray(m) ? m[p.material] : null);
function detailEntry(o, g, R) {
  if (R) return { o, g: R.geometry, base: R.base, ver: detailVersion(R.base), kind: 'mesh', parts: [{ g: R.geometry, material: -1, cl: R.clusters, twin: null }], twin: null, failed: false, gone: false, relief: R, shown: false, mats: Array.isArray(o.material) };
  const parts = detailParts(o, g); if (!parts) return null;
  const tris = (g.index ? g.index.count : g.attributes.position.count) / 3, full = tris * (o.isInstancedMesh ? o.count : 1);
  return { o, g, base: g, ver: detailVersion(g), kind: detailKind(o), parts, twin: null, failed: false, gone: false, relief: null, shown: false, mats: Array.isArray(o.userData.gsGlMat || o.material), cut: cutOut(o.userData.gsGlMat || o.material),
    full, trial: full < DETAIL_SURE && o.userData.detail == null, wf: 0, gain: 0 };
}
// before the frame's other housekeeping: new big meshes are found and asked for, twins are made and follow their meshes
function autoDetail(v, now, quiet, ph = 1080) {
  const D = v.details ||= { map: new Map(), t: 0, rk: 1 };
  // a body on bones (cut twins) shown in clusters or whole again: its shadow is drawn again over the next frames, until
  // it is posed for every pass on the chip (skin-gpu.js), where a body that keeps still would otherwise keep a shadow
  // drawn before then (the shadow cache sees nothing move)
  if (v._shAgain > 0) { v._shAgain--; v.shadowsDirty(); }
  // Real surface detail keeps to its triangles a frame (reliefBudget): what its twins drew last frame says how
  // much coarser than HD.reliefPx they must all be drawn (rk), eased back as the camera moves off. A step finer
  // that went over is not tried again (D.bad: the scale that went over) until the view is a quarter lighter or
  // the budget changes: a few surfaces seen whole jump between two levels, one over the budget and one well
  // under, and the scale swung between them every frame, the surfaces changing with it.
  const budget = reliefBudget(), reliefOn = budget > 0;
  if (!quiet) {
    let drew = 0; for (const e of D.map.values()) if (e.relief && e.twin) drew += drawnTris(e.twin);
    if (D.badB !== budget) { D.bad = 0; D.badB = budget; }
    if (reliefOn && drew > budget * 1.1) { D.bad = D.rk; D.badDrew = -1; D.rk = Math.min(8, D.rk * Math.min(2, drew / budget)); }
    else if (D.rk > 1 && drew < budget * .7) {
      if (D.bad) { if (D.badDrew < 0) D.badDrew = drew; else if (!drew || drew < D.badDrew * .75) D.bad = 0; }
      const next = Math.max(1, D.rk / 1.1);
      if (next > D.bad) D.rk = next;
    }
    HD.info.reliefTris = drew; HD.info.reliefPx = HD.reliefPx * D.rk;
    detailTick(); detailFrame(v.cam);
  }
  const rpx = HD.reliefPx * D.rk;
  if (HD.detail === false) { if (D.map.size) detailDropAll(v); return; }
  for (const e of D.map.values()) {
    const o = e.o, base = e.base, m0 = o.userData.gsGlMat || o.material;
    // the game changed it: back to drawing as itself (a geometry whose points changed under us is left alone from then on)
    const changed = detailVersion(base) !== e.ver, R = reliefOf(o);
    const ud0 = o.userData, lm = o.layers.mask & ~(SH_BITS | HOLD_BIT | OCC_BIT);   // (1: drawing as itself; BATCH_BIT: its twin is; anything else: the game moved it to a layer of its own)
    if (changed || e.failed || (o.geometry !== base && ud0.gsLod?.base !== base) || ud0.detail === false || ud0.gsReflect || !detailMaterials(m0) || Array.isArray(m0) !== e.mats || (lm !== 1 && lm !== BATCH_BIT && lm !== 0) || o.onBeforeRender !== OBR || !inScene(o, v.scene) ||
      (e.kind === 'copies' && (o.count > DETAIL_COPIES || o.count < 1 || (e.twin && !!o.instanceColor !== !!e.twin._colorsTexture) || o.instanceMatrix.count > (e.twin?.copyMax ?? Infinity))) ||
      (e.kind === 'cut' && o.isSkinnedMesh && !o.skeleton) || (!e.relief && cutOut(m0) !== e.cut)) { detailDrop(v, e, changed || e.failed); continue; }
    if (e.relief ? R !== e.relief || !reliefOn : R?.state === 'ready' && reliefOn) { detailDrop(v, e); D.t = 0; continue; }   // (its relief was taken off or turned off, or has just arrived: looked at again below)
    if (!e.twin) {
      if (e.parts.some(p => !p.cl)) continue;   // still being built
      let coarse = 0, full = 0; for (const p of e.parts) { coarse += p.cl.coarseTris; full += p.cl.fullTris; }
      if (!e.relief && coarse > full * DETAIL_WORTH) { detailDrop(v, e, true); continue; }   // (a mesh that won't simplify, all hard edges: nothing to gain)
      if (o.geometry !== base) o.geometry = base;
      o.userData.gsLod = null;
      const px = typeof o.userData.detail === 'number' ? o.userData.detail : e.relief ? rpx : null;
      for (const p of e.parts) {
        const mt = partMaterial(e.relief && m0 ? reliefMaterial(m0) : m0, p);
        const t = p.twin = e.kind === 'cut' ? cutTwin(o, p.g, mt, p.cl, { px }) : new DetailMesh(p.g, mt, p.cl, { px, copies: e.kind === 'copies' ? o : null });
        t.name = 'gs-detail'; t.matrixAutoUpdate = false; t.raycast = NO_RAY; t.userData.noBatch = t.userData.noLod = true; t.visible = false;
        if (p.g.userData.gsGrid) gridNormals(t, p.g.userData.gsGrid.scale);
        // (first in the scene, so a close-up shader for its material is built for the twin, which draws, before the mesh, which doesn't: swapTwins builds for the first it meets)
        v.scene.add(t); const ch = v.scene.children; ch.unshift(ch.pop());
      }
      e.twin = e.parts[0].twin;
    }
    const ud = o.userData;
    o.updateWorldMatrix(true, false);
    const se = v.scene.matrixWorld.elements, px = typeof ud.detail === 'number' ? ud.detail : e.relief ? rpx : null, shown = shownInScene(o, v.scene);
    for (const p of e.parts) {
      const t = p.twin, td = t.userData, m = partMaterial(e.relief && m0 ? reliefMaterial(m0) : m0, p);
      const grid = p.g.userData.gsGrid;   // (a relief's places are on a 16-bit grid of its own, slim.js: the twin's matrix puts them back where the mesh is)
      if (grid) t.matrix.multiplyMatrices(o.matrixWorld, grid.matrix); else t.matrix.copy(o.matrixWorld);
      // (the twin sits right under the scene: its own matrix is where the mesh is in the world's numbers, and its world matrix the
      // scene's times that, which while a view draws is a step back by the drawing's centre: origin.js)
      { const te = t.matrix.elements; te[12] -= se[12]; te[13] -= se[13]; te[14] -= se[14]; }
      t.matrixWorld.multiplyMatrices(v.scene.matrixWorld, t.matrix);
      t.visible = shown;
      if ((td.gsGlMat || t.material) !== m) { t.material = m; delete td.gsGlMat; }
      t.castShadow = o.castShadow; t.receiveShadow = o.receiveShadow; t.renderOrder = o.renderOrder;
      if (t.isDetailMesh) t.px = px; else t.cut.px = px;
      // (once it has drawn it is never hidden for a shader again: its mesh would have to stand in with a shader of its own to build, and for a moment neither drew)
      td.noAO = ud.noAO; td.noOcclude = ud.noOcclude; td.noContact = ud.noContact; td.noHold = ud.noHold || e.shown;
      if (e.kind === 'copies') t.syncCopies();
      else if (e.kind === 'cut' && shown && !quiet) cutUpdate(t, v.cam, ph);
    }
    // a smaller mesh on trial: what the last frame saved against what it cost (counted only while it was drawn)
    if (e.trial && e.shown && !quiet && shown) {
      let tris = 0, runs = 0; for (const p of e.parts) { drawnOf(p.twin, DRAWN); tris += DRAWN[0]; runs += DRAWN[1]; }
      if (runs) { e.wf++; e.gain += (e.full - tris) * TRI_MS - Math.max(0, runs - 1) * RUN_MS - MESH_MS * e.parts.length; }
      if (e.wf >= DETAIL_TRY) {
        if (e.gain <= 0) { DETAIL_RESTS.set(o, now + DETAIL_AGAIN); detailDrop(v, e); HD.info.detailRested = (HD.info.detailRested || 0) + 1; continue; }
        e.wf = 0; e.gain = 0;
      }
    }
  }
  // now and then: the scene's big meshes that aren't in yet (their clusters come from memory at once, or are asked for, a couple at a time)
  if (quiet || (now - D.t < DETAIL_SCAN && D.news === reliefNews.n)) return; D.t = now; D.news = reliefNews.n;
  eachShown(v.scene, o => {
    if (D.map.has(o)) return;
    const R = o.isMesh ? reliefOf(o) : undefined;
    if (R && reliefOn && reliefReady(o, R)) { if (detailFits(o) && !Array.isArray(o.material) && detailKind(o) === 'mesh') D.map.set(o, detailEntry(o, null, R)); return; }
    if (!detailable(o)) return;
    const rest = DETAIL_RESTS.get(o); if (rest && now < rest) return;   // (tried a moment ago, and it did not pay)
    const g = o.userData.gsLod?.base || o.geometry, e = detailEntry(o, g, null);
    if (!e) { NO_DETAIL.add(g); return; }
    // (cut-out leaves: never the rough merge; on bones or with blend shapes: measured in test poses too, detail.js moved)
    const opts = { sloppy: !e.cut, heads: o.isSkinnedMesh ? headsOf(o) : null, morphs: !!o.morphTargetInfluences?.length };
    let missing = 0;
    for (const p of e.parts) { try { p.cl = clustersNow(p.g, opts); } catch (err) { NO_DETAIL.add(g); return; } if (!p.cl) missing++; }
    if (missing && detailAsking >= DETAIL_ASK) return;
    D.map.set(o, e);
    if (!missing) return;
    detailAsking++;
    Promise.all(e.parts.map(p => p.cl || clustersFor(p.g, opts).then(c => { p.cl = c; }))).catch(() => { e.failed = true; }).finally(() => { detailAsking--; });
  });
}
// Detail for copies (HD.copies, on by default): the same idea for things placed many times. A set of copies
// (a gs.props kind, a perCopy() set: the copies library's InstancedMesh2) with no detail levels of its own
// gets them by itself: the mesh simplified a few times over in the detail worker (detail-build.js
// buildLevels: about a half, a fifth, a fifteenth... of its triangles, each with its measured error), kept
// by the mesh's content like clusters. Each copy is then drawn at the simplest level whose error is under
// LOD_PX pixels where it stands, so the swap can't be seen: the copies library picks a level by a copy's
// distance, and the distances are worked out here from the errors, the size the 3D is drawn at and the
// camera's field of view, and follow them (a scope's zoom, another graphics tier). Shadows come from the
// level drawn. A copy is near or far as a whole, so it gets a whole level, not a cut through clusters: a
// thing that is near and far at once (a cliff, a town wall) is better as a mesh of its own, which cluster
// detail then takes.
// Taken: sets of COPY_MIN_TRIS triangles a copy and COPY_MIN_ALL in all (userData.detail = true, which
// props.kind(..., { lod: 'auto' }) sets: from COPY_OWN_TRIS, however few copies). Every level in use is a
// draw of its own in the picture and in each shadow map, so a small set loses more in draws than it saves
// in triangles (two dozen rings of 768 triangles: 70 more draws on WebGL for 2% fewer triangles). Not for: sets with levels
// of their own, see-through, alpha-tested (leaves, grass), multi-material, skinned and morphing ones, and
// userData.detail = false or userData.noLod.
const COPY_MIN_TRIS = 200, COPY_MIN_ALL = 60000, COPY_OWN_TRIS = 60, COPY_ASK = 2;
const NO_LEVELS = new WeakSet();   // geometries that won't simplify, or can't be read
let copiesAsking = 0;
const copyMaterial = m => !!m && !Array.isArray(m) && !m.transparent && !(m.alphaTest > 0) && !m.alphaHash && !m.wireframe && !m.displacementMap && !m.positionNode;
function copyable(o) {
  if (!o.isInstancedMesh2 || o._parentLOD) return false;
  const ud = o.userData; if (ud.detail === false || ud.noLod || ud.gsLevels) return false;
  if (o.LODinfo?.render || o.LODinfo?.shadowRender || o.boneTexture || o.morphTexture || o.skeleton) return false;
  const g = o.geometry; if (!g || NO_LEVELS.has(g) || !copyMaterial(ud.gsGlMat || o.material)) return false;
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;   // (a geometry's groups only matter with a list of materials, turned away above)
  const tris = (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3, n = o._instancesArrayCount || 0;
  return (ud.detail === true ? tris >= COPY_OWN_TRIS : tris >= COPY_MIN_TRIS && tris * n >= COPY_MIN_ALL) && canCluster(g);
}
// the biggest any copy is scaled (with the set's own scale), and how far a copy reaches from its own middle
function copyReach(o, e) {
  const n = o._instancesArrayCount || 0, D = o.matricesTexture?._data; let s2 = 0;
  if (D) for (let i = 0; i < n; i++) { const m = i * 16; s2 = Math.max(s2, D[m] * D[m] + D[m + 1] * D[m + 1] + D[m + 2] * D[m + 2], D[m + 4] * D[m + 4] + D[m + 5] * D[m + 5] + D[m + 6] * D[m + 6], D[m + 8] * D[m + 8] + D[m + 9] * D[m + 9] + D[m + 10] * D[m + 10]); }
  const w = o.matrixWorld.elements, ws = Math.sqrt(Math.max(w[0] * w[0] + w[1] * w[1] + w[2] * w[2], w[4] * w[4] + w[5] * w[5] + w[6] * w[6], w[8] * w[8] + w[9] * w[9] + w[10] * w[10]));
  const g = e.g; if (!g.boundingSphere) g.computeBoundingSphere();
  e.scale = (Math.sqrt(s2) || 1) * (ws || 1); e.reach = (g.boundingSphere.center.length() + g.boundingSphere.radius) * e.scale; e.count = n;
}
function copiesDrop(v, e) {
  const o = e.o, info = o.LODinfo; v.copies.map.delete(o);
  if (e.objs.length && info?.render) {
    for (const obj of e.objs) {
      const i = info.render.levels.findIndex(l => l.object === obj); if (i > 0) { info.render.levels.splice(i, 1); info.render.count.splice(i, 1); }
      const j = info.objects.indexOf(obj); if (j >= 0) info.objects.splice(j, 1);
      o.remove(obj);
      for (const k of Object.keys(obj.geometry.attributes)) obj.geometry.deleteAttribute(k);   // (the points are the set's own: only the level's triangle list goes)
      obj.geometry.dispose();
    }
    if (info.render.levels.length <= 1) info.render = null;
    copiesNewTwin(o);
  }
  delete o.userData.gsLevels;
}
// (WebGPU draws a set through twins of its levels, hd3d-gpu.js gpuProps: made again for a new list of levels)
function copiesNewTwin(o) { const ud = o.userData; if (ud.gpuTwin) { ud.gpuTwin.dispose?.(); ud.gpuTwin.group.removeFromParent(); ud.gpuTwin = null; } }
function autoCopies(v, ph, now, quiet) {
  const C = v.copies ||= { map: new Map(), t: 0 };
  if (HD.copies === false) { for (const e of [...C.map.values()]) copiesDrop(v, e); return; }
  const scan = !quiet && now - C.t >= DETAIL_SCAN;
  const pe = v.cam.projectionMatrix.elements, K = pe[15] === 0 ? ph * Math.abs(pe[5]) * .5 : 0;   // pixels a metre covers at 1 m (0: a camera with no distance in it draws every copy whole)
  const far = (e, i) => K ? e.reach + e.lv.error[i] * e.scale * K / LOD_PX : 1e9;
  for (const e of C.map.values()) {
    const o = e.o, ud = o.userData, m = ud.gsGlMat || o.material;
    if (e.failed || o.geometry !== e.g || ud.detail === false || ud.noLod || !copyMaterial(m) || !inScene(o, v.scene) || (e.objs.length && o.LODinfo?.render?.levels.length !== e.objs.length + 1)) { copiesDrop(v, e); continue; }
    if (!e.lv) continue;   // still being built
    if (!e.objs.length) {
      if (!e.lv.levels) { NO_LEVELS.add(e.g); copiesDrop(v, e); continue; }
      copyReach(o, e);
      for (let i = 0; i < e.lv.levels; i++) { o.addLOD(levelGeometry(e.g, e.lv, i), m, far(e, i)); e.objs.push(o.LODinfo.objects.at(-1)); }
      e.k = K; ud.gsLevels = { levels: e.lv.levels, tris: Array.from(e.lv.count, c => c / 3), error: Array.from(e.lv.error) };
      copiesNewTwin(o);
    }
    // copies added or scaled since (looked at with the scan below); another zoom, field of view or picture size: the distances again
    if ((o._instancesArrayCount || 0) !== e.count || scan) { const s = e.scale, r = e.reach; copyReach(o, e); if (e.scale !== s || e.reach !== r) e.k = 0; }
    if (!(Math.abs(K - e.k) <= e.k * .03)) { e.k = K; for (let i = 0; i < e.objs.length; i++) o.updateLOD(i + 1, far(e, i)); }
    for (const obj of e.objs) { obj.castShadow = o.castShadow; obj.receiveShadow = o.receiveShadow; if ((obj.userData.gsGlMat || obj.material) !== m) { obj.material = m; delete obj.userData.gsGlMat; } }
  }
  if (!scan) return; C.t = now;
  eachShown(v.scene, o => {
    const set = o.isInstancedMesh2 ? o : o.userData.gsTwin;   // (on WebGPU a set is itself hidden and its twins draw)
    if (set?.isInstancedMesh2 && !C.map.has(set) && copyable(set)) copiesAsk(C, set);
  });
}
function copiesAsk(C, o) {
  if (copiesAsking >= COPY_ASK) return;
  const e = { o, g: o.geometry, lv: null, objs: [], failed: false, k: 0, scale: 1, reach: 0, count: 0 };
  C.map.set(o, e); copiesAsking++;
  let p; try { p = levelsFor(e.g); } catch (err) { p = Promise.reject(err); }
  p.then(lv => { e.lv = lv; }, () => { e.failed = true; NO_LEVELS.add(e.g); }).finally(() => { copiesAsking--; });
}
// after the shader hold: a mesh hides once its twins are drawing (a twin whose shader is still building waits, and the mesh draws on)
function detailShow(v) {
  const D = v.details; if (!D?.map.size) return;
  for (const e of D.map.values()) {
    const o = e.o; if (!e.twin) continue;
    let held = false; for (const p of e.parts) if (p.twin.layers.mask & HOLD_BIT) held = true;
    if (held) {
      // (every part waits for the slowest: a person with their clothes drawn and their face not yet would be half there)
      for (const p of e.parts) if (!(p.twin.layers.mask & HOLD_BIT) && (p.twin.layers.mask & 1)) p.twin.layers.mask &= ~1;
      if (o.layers.mask === BATCH_BIT) o.layers.mask = 1;
      else if (o.layers.mask & HOLD_BIT) { o.layers.mask = (o.layers.mask | 1) & ~HOLD_BIT; v.held?.delete(o); }   // (the mesh stands in for its twins: it never waits as well)
    } else {
      for (const p of e.parts) if (!(p.twin.layers.mask & 1)) p.twin.layers.mask |= 1;
      e.shown = true; o.userData.gsDetailed = true; if (e.kind === 'cut') { v._shAgain = 3; v._fadeOk = null; } if (o.layers.mask !== BATCH_BIT) { o.layers.mask = BATCH_BIT; v.occHid?.delete(o); v.held?.delete(o); }
    }
  }
}
// shadowLights(): scratch (no garbage per frame)
let SH_H = new Float64Array(40); const SH_S = new Sphere(), SH_P = new Vector3(), SH_LAST = new WeakMap();
// the still/moving shadow split: frames before a thing counts as still, the layers that pick still or
// moving things for a shadow drawing (no camera of the game's draws them), and how many still triangles
// a light needs before keeping a copy pays for itself (the copy is one full-map depth copy per redraw)
const SH_STILL = 45, SH_STILL_BIT = 1 << 27, SH_MOVE_BIT = 1 << 28, SH_BITS = SH_STILL_BIT | SH_MOVE_BIT, SH_MIN_TRIS = 20000;
// the layer things wait on while their shaders build (holdNew): nothing draws it
const HOLD_LAYER = 29, HOLD_BIT = 1 << HOLD_LAYER;
// envCheck: the camera's view (scratch)
const VIEW_FR = new Frustum(), VIEW_M = new Matrix4();
// shadowAhead: the layer things are drawn on for their shadow shaders (alone), and how many kinds a frame once the round is under way, among how many things looked at
const PRE_BIT = 1 << 25, PRE_N = 6, PRE_LOOK = 400;
// what makes a thing need its own shader: its materials (and their versions), its kind and its geometry's layout
// (asked for every visible thing every frame: when nothing changed, the answer comes back without
// building any strings, so it leaves no garbage)
const KEYS = new WeakMap();
function sameMats(c, mat, g) {
  if (c.g !== (g?.id ?? '')) return false;
  if (!Array.isArray(mat)) return c.n === -1 && c.m === mat && c.v === mat.version;
  if (c.n !== mat.length) return false;
  for (let i = 0; i < mat.length; i++) if (c.ids[i] !== mat[i].id || c.vs[i] !== mat[i].version) return false;
  return true;
}
// (a list kept in fewer bytes, slim.js, is another layout to WebGPU, which builds a pipeline for each: so it is part of the key.
// A plain list of whole numbers, a skinned mesh's bones, is all one kind: three.js widens it to 32 bits in place the first time it
// is sent on WebGPU, and a key that changed then would have the mesh held for its shader a second time)
const listKind = a => {
  const A = a.array, x = a.isInterleavedBufferAttribute === true; if (!A || (!x && A instanceof Float32Array)) return '';
  const name = A.constructor.name;
  if (!x && !a.normalized && name[0] !== 'F') return name[0] === 'U' ? ':u' : ':i';
  return ':' + name[0] + A.BYTES_PER_ELEMENT + (a.normalized ? 'n' : '') + (x ? 'x' : '');
};
function shaderKey(o) {
  const mat = o.material, g = o.geometry, c = KEYS.get(o), pk = SKIN_POOLED.has(o.userData.gsPoseOf || o);   // (pk: posed once a frame on the chip, skin-gpu.js: other shaders)
  if (c && c.rs === o.receiveShadow && c.pk === pk && sameMats(c, mat, g)) return c.key;
  const ms = Array.isArray(mat) ? mat : [mat];
  // (three draws a two-sided see-through material as back faces then front faces, marking it changed for each,
  // so its version climbs every frame: its shaders are the same, so the version is left out, or holdNew
  // took it for a new shader every frame and kept it hidden for good)
  const sig = ms.map(m => m.id + '.' + (m.transparent && m.side === DoubleSide && !m.forceSinglePass ? 'd' : m.version)).join(',') + '|' + (g?.id ?? '');
  if (c?.sig === sig && c.pk === pk) { remember(o, c.sig, c.key, mat, g); return c.key; }
  const key = sig.replace(/\|.*$/, '') + '|' + (o.isSkinnedMesh ? 's' : '') + (o.isInstancedMesh ? 'i' : '') + (o.isBatchedMesh ? 'b' : '') + (o.isPoints ? 'p' : o.isLine ? 'l' : o.isSprite ? 'S' : '') +
    (o.morphTargetInfluences ? 'm' : '') + (g ? '|' + Object.keys(g.attributes).sort().map(k => k + listKind(g.attributes[k])).join(',') + (g.index ? '+i' : '') + '|' + Object.keys(g.morphAttributes || {}).join(',') : '') +
    // (three keys a shader by whether the thing takes shadows too: two things of one material and layout, one taking shadows,
    // were one to the kit, so the second, built for neither, drew its shader in the frame it first showed: Long Shadow's
    // mission 2 intro, two in its first frame, 126 and 69 ms on the build machine)
    (o.receiveShadow ? '+r' : '') + (pk ? '+k' : '');
  remember(o, sig, key, mat, g);
  return key;
}
// the key a thing would have with material m on it (its close-up twin, before that is swapped in), kept for each thing
const KEYS_AS = new WeakMap();
function shaderKeyAs(o, m) {
  const c = KEYS_AS.get(o), g = o.geometry?.id ?? '', pk = SKIN_POOLED.has(o.userData.gsPoseOf || o);
  if (c && c.m === m && c.v === m.version && c.g === g && c.rs === o.receiveShadow && c.pk === pk) return c.key;
  const keep = o.material, was = KEYS.get(o);
  o.material = m; KEYS.delete(o);
  const key = shaderKey(o);
  o.material = keep; if (was) KEYS.set(o, was); else KEYS.delete(o);
  KEYS_AS.set(o, { m, v: m.version, g, rs: o.receiveShadow, pk, key });
  return key;
}
function remember(o, sig, key, mat, g) {
  const arr = Array.isArray(mat);
  KEYS.set(o, { sig, key, rs: o.receiveShadow, pk: SKIN_POOLED.has(o.userData.gsPoseOf || o), g: g?.id ?? '', n: arr ? mat.length : -1, m: arr ? null : mat, v: arr ? 0 : mat.version,
    ids: arr ? mat.map(m => m.id) : null, vs: arr ? mat.map(m => m.version) : null });
}
export function sun(col = '#fff2d8', i = 3, size = 18, dir = [-.45, 1, .35]) {
  const s = new DirectionalLight(col, i), c = s.shadow.camera, d = new Vector3(...dir).normalize();
  s.castShadow = true; c.left = c.bottom = -size; c.right = c.top = size; c.near = 1; c.far = 120;
  s.shadow.bias = -.0004; s.shadow.normalBias = .04; s.shadow.radius = 2;
  s.setTier = T => { s.tierShadow = T.shadow; s.castShadow = T.shadow > 0; if (T.shadow && s.shadow.mapSize.x !== T.shadow * 2) shadowSize(s.shadow, T.shadow * 2); };
  s.dir = d;
  // soft shadows that stay sharp where things touch and spread with height (PCSS on WebGPU, hd3d-gpu.js
  // pcss); deg is the sun's width in the sky (the real sun is .5; 2 reads as a soft summer day). WebGL
  // phones get an evenly softer edge. Call it when making the sun, before the first frame.
  s.softShadows = (deg = 2) => { s.gsSoft = deg; s.shadow.radius = 2 + Math.min(3, deg * .75); if (s.nearLight) { s.nearLight.gsSoft = deg; s.nearLight.shadow.radius = s.shadow.radius; } return s; };
  s.aim = (x, y, z) => { if (x?.isVector3) d.copy(x); else d.set(x, y, z); d.normalize(); return s; };
  s.follow = (x, y, z) => {
    if (s.fitted) { s.fitted = false; c.left = c.bottom = -size; c.right = c.top = size; c.near = 1; c.far = 120; c.updateProjectionMatrix(); s.shadow.bias = -.0004; s.shadow.normalBias = .04; }
    if (HD.shadowTiles === false) {
      const tx = 2 * size / s.shadow.mapSize.x; x = Math.round(x / tx) * tx; z = Math.round(z / tx) * tx;
      s.target.position.set(x, y, z); s.position.set(x + d.x * 50, y + d.y * 50, z + d.z * 50); s.target.updateMatrixWorld();
      return;
    }
    // The middle of the shadow moves a tile of its map at a time (a sixteenth of its width), along the
    // light's own sideways directions, and in depth only once it is well out: between steps the light
    // stays where it is, so nothing is drawn again for it, and at a step the map slides by a whole tile
    // and only the tiles that come in are drawn (shadow-tiles.js). A tile is a whole number of texels,
    // so shadow edges don't crawl. (A step is taken a little late, so standing on a tile's edge doesn't
    // step back and forth.)
    FZ.copy(d); FX.crossVectors(UPV, FZ); if (FX.lengthSq() < 1e-8) FX.set(1, 0, 0); FX.normalize(); FY.crossVectors(FZ, FX);
    const tw = 2 * size / TILES, a = x * FX.x + y * FX.y + z * FX.z, b = x * FY.x + y * FY.y + z * FY.z, e = x * FZ.x + y * FZ.y + z * FZ.z, at = s.gsAt ||= [NaN, NaN, NaN];
    if (!(Math.abs(a - at[0]) <= .6 * tw)) at[0] = Math.round(a / tw) * tw;
    if (!(Math.abs(b - at[1]) <= .6 * tw)) at[1] = Math.round(b / tw) * tw;
    if (!(Math.abs(e - at[2]) <= 10)) at[2] = Math.round(e / 2) * 2;
    s.target.position.copy(FX).multiplyScalar(at[0]).addScaledVector(FY, at[1]).addScaledVector(FZ, at[2]);
    s.position.copy(s.target.position).addScaledVector(FZ, 50); s.target.updateMatrixWorld();
  };
  s.fit = (view, o = {}) => {
    const r = fitShadow(s, view, o), nf = o.near || 0;
    // a near cascade (high and ultra, with v.air on): a second, sharp shadow over the first `near` metres
    if (nf > 0 && s.castShadow && (s.tierShadow ?? 1024) >= 1024 && s.parent && view._air) {
      let n = s.nearLight;
      if (!n) { n = s.nearLight = new DirectionalLight(); n.name = 'sun-near'; n.dir = d; n.shadow.radius = s.shadow.radius; n.gsSoft = s.gsSoft; }
      if (n.parent !== s.parent) s.parent.add(n, n.target);
      n.visible = true; n.castShadow = true; n.color.copy(s.color); n.intensity = s.intensity;
      const ms = s.shadow.mapSize.x; if (n.shadow.mapSize.x !== ms) shadowSize(n.shadow, ms);
      fitShadow(n, view, { ...o, far: nf, around: 0, max: nf * 2 });
      view.cascade = { near: n, far: s, fade: o.fade ?? .06 };
    } else if (s.nearLight?.visible) { s.nearLight.visible = false; view.cascade = null; }
    return r;
  };
  return s;
}
// Fitting the sun's shadow to the view. Rays across the screen find what can be seen: where they meet
// the ground (o.ground(x, z) gives its height) or, without a ground function, the part of each ray
// between the heights o.low and o.high. Those points, and points o.tall metres above them (houses,
// trees, people), are boxed in the light's own frame. The box grows and shrinks in steps and its
// centre snaps to whole tiles of the shadow map (whole texels with HD.shadowTiles off), so turning the
// camera doesn't make shadow edges crawl and the map's tiles can be kept (shadow-tiles.js).
// around: k keeps the box to k times the distance to what's in the middle of the view (a scope looking
// across a valley: sharp shadows round the target instead of thin ones over the hills behind it).
// A box that changes size (or a light that moves up or down, or a depth range that changes) means the
// whole map is drawn again, so in tiles the box grows at once but shrinks only once it has been too big
// for SHRINK_HOLD fits in a row (frames: a second and a half at 60 fps), and the light's height and depth
// grow with ROOM metres to spare: looking round from one place (what's in view nearer, then further, then
// nearer again) keeps the box it has instead of drawing every shadow again every other frame. A camera that
// zooms (its fov or zoom changes, or around is turned on or off: a scope going up) is fitted at once.
const SHRINK_HOLD = 90, ROOM = 40;
const FX = new Vector3(), FY = new Vector3(), FZ = new Vector3(), FP = new Vector3(), FR = new Vector3(), UPV = new Vector3(0, 1, 0);
const step4 = h => 2 ** (Math.ceil(Math.log2(Math.max(h, 1)) * 4) / 4);
// v.faceLight(): the spot placed beside the camera and aimed at the face (the head bone's point between the eyes, 16.5 cm up from where the
// head turns and 9 cm forward), its cone a little wider than a head where it lands and its reach a little past it; brightness by distance,
// so the face gets the same light near or far
const _fa = new Vector3(), _fc = new Vector3(), _fr = new Vector3(), _fu = new Vector3();
function aimFaceLight(v) {
  const F = v.faceLit, L = F.light, cam = v.cam, p = F.person;
  if (F.head) { F.head.updateWorldMatrix(true, false); F.head.localToWorld(_fa.set(0, .165, .09)); } else if (p.isObject3D) { p.updateWorldMatrix(true, false); _fa.setFromMatrixPosition(p.matrixWorld); } else return;
  cam.getWorldPosition(_fc); const d = Math.max(.3, _fc.distanceTo(_fa));
  _fr.setFromMatrixColumn(cam.matrixWorld, 0); _fu.setFromMatrixColumn(cam.matrixWorld, 1);
  L.position.copy(_fc).addScaledVector(_fr, F.side * .45 * d).addScaledVector(_fu, F.up * .45 * d);
  const dl = L.position.distanceTo(_fa); L.target.position.copy(_fa); L.target.updateMatrixWorld();
  L.distance = dl * 1.8; L.angle = Math.min(1, Math.atan(.3 / dl)); L.intensity = F.strength * dl * dl;
}
function fitShadow(s, view, { far = 250, ground = null, low = -5, high = 30, tall = 20, margin = 3, rays = 5, max = 500, soft = 1, around = 0 } = {}) {
  const cam = view.cam, c = s.shadow.camera, d = s.dir, o = cam.position;
  cam.updateMatrixWorld();
  const reach = (dx, dy, dz, lim) => {   // how far a ray goes before it meets the ground (lim if it doesn't)
    let t = cam.near, prev = t;
    while (t < lim) { const g = ground(o.x + dx * t, o.z + dz * t); if (g != null && o.y + dy * t <= g) break; prev = t; t += .5 + t * .04; }
    if (t >= lim) return lim;
    let a = prev, b = t; for (let k = 0; k < 5; k++) { const m = (a + b) / 2, g = ground(o.x + dx * m, o.z + dz * m); if (g != null && o.y + dy * m <= g) b = m; else a = m; }
    return b;
  };
  if (around > 0 && ground) { FR.set(0, 0, .5).unproject(cam).sub(o).normalize(); const tc = reach(FR.x, FR.y, FR.z, far); if (tc < far) far = Math.min(far, tc * around + margin); }
  FZ.copy(d); FX.crossVectors(UPV, FZ); if (FX.lengthSq() < 1e-8) FX.set(1, 0, 0); FX.normalize(); FY.crossVectors(FZ, FX);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity, n = 0;
  const add = p => { const a = p.dot(FX), b = p.dot(FY), e = p.dot(FZ); if (a < x0) x0 = a; if (a > x1) x1 = a; if (b < y0) y0 = b; if (b > y1) y1 = b; if (e < z0) z0 = e; if (e > z1) z1 = e; n++; };
  const both = p => { add(p); p.y += tall; add(p); };
  for (let i = 0; i < rays; i++) for (let j = 0; j < rays; j++) {
    FR.set(i / (rays - 1) * 2 - 1, j / (rays - 1) * 2 - 1, .5).unproject(cam).sub(o).normalize();
    if (ground) {
      // out along the ray until it meets the ground (bigger steps further away), then home in
      const t = reach(FR.x, FR.y, FR.z, far);
      if (t >= far && o.y + FR.y * t > high + tall) continue;   // only sky that way
      both(FP.copy(o).addScaledVector(FR, t));
    } else {
      let ta = cam.near, tb = far;
      if (Math.abs(FR.y) > 1e-6) { const t1 = (low - o.y) / FR.y, t2 = (high - o.y) / FR.y; ta = Math.max(ta, Math.min(t1, t2)); tb = Math.min(tb, Math.max(t1, t2)); }
      else if (o.y < low || o.y > high) continue;
      if (ta > tb) continue;
      add(FP.copy(o).addScaledVector(FR, ta)); add(FP.copy(o).addScaledVector(FR, tb));
    }
  }
  if (!n) { const g = ground ? ground(o.x, o.z) ?? o.y : o.y; both(FP.set(o.x, g, o.z)); }
  const msz = s.shadow.mapSize.x || 1024, tiles = HD.shadowTiles !== false, was = tiles ? s.gsFit ||= { hx: 0, hy: 0, cx: NaN, cy: NaN, top: NaN, depth: NaN, big: 0, lens: NaN, around: 0 } : null;
  // (in tiles, shadow-tiles.js: the box is a little bigger, so that its middle can go a tile at a time and
  // still cover what is seen, and it is kept while it is no more than a step too big, so a camera on
  // the edge of a step doesn't have every shadow drawn again each frame)
  const grow = tiles ? TILES / (TILES - 1.2) : 1;
  let hx = Math.min(max, step4(((x1 - x0) / 2 + margin) * grow)), hy = Math.min(max, step4(((y1 - y0) / 2 + margin) * grow));
  // the light sits above the tallest thing that could shade what's seen, low suns further off; the depth reaches below the lowest
  let top = Math.ceil((z1 + tall / Math.max(d.y, .05) + 10) / 10) * 10;
  const deep = t => Math.ceil((t - z0 + 20) / 10) * 10;
  let depth = deep(top);
  if (tiles) {
    // the box it has, while it still covers what is seen: kept while snug (no more than a step too big, and the light no more than
    // ROOM * 2 too high or deep), and for SHRINK_HOLD fits when too big (what's in view may be further off again in a moment)
    const fits = was.hx >= hx && was.hy >= hy && was.top >= top && was.depth >= deep(was.top);
    const snug = fits && was.hx <= hx * 1.2 && was.hy <= hy * 1.2 && was.top <= top + ROOM * 2 && was.depth <= deep(was.top) + ROOM * 2;
    const lens = cam.fov / (cam.zoom || 1), zoomed = Math.abs(lens - was.lens) > was.lens * .01 || around !== was.around;
    was.lens = lens; was.around = around;
    if (fits && !zoomed && (snug || ++was.big < SHRINK_HOLD)) { hx = was.hx; hy = was.hy; top = was.top; depth = was.depth; if (snug) was.big = 0; }
    else { top += ROOM; depth = deep(top) + ROOM; was.big = 0; }   // (grown, or shrunk at last: the box as needed, the light with room)
  }
  // too big to cover it all: keep the camera's end of it
  let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; const ox = o.dot(FX), oy = o.dot(FY);
  if ((x1 - x0) / 2 + margin > hx) cx = Math.min(Math.max(cx, ox - hx + margin), ox + hx - margin);
  if ((y1 - y0) / 2 + margin > hy) cy = Math.min(Math.max(cy, oy - hy + margin), oy + hy - margin);
  const tx = 2 * hx / (tiles ? TILES : msz), ty = 2 * hy / (tiles ? TILES : msz);
  if (tiles) {
    if (was.hx === hx && Math.abs(cx - was.cx) <= .6 * tx) cx = was.cx; else cx = Math.round(cx / tx) * tx;
    if (was.hy === hy && Math.abs(cy - was.cy) <= .6 * ty) cy = was.cy; else cy = Math.round(cy / ty) * ty;
  } else { cx = Math.round(cx / tx) * tx; cy = Math.round(cy / ty) * ty; }
  if (tiles) { was.hx = hx; was.hy = hy; was.cx = cx; was.cy = cy; was.top = top; was.depth = depth; }
  FP.copy(FX).multiplyScalar(cx).addScaledVector(FY, cy).addScaledVector(FZ, top);
  s.position.copy(FP); s.target.position.copy(FP).sub(FZ); s.target.updateMatrixWorld();
  if (c.right !== hx || c.top !== hy || c.far !== depth || !s.fitted) { c.left = -hx; c.right = hx; c.bottom = -hy; c.top = hy; c.near = .5; c.far = depth; c.updateProjectionMatrix(); view.shadowsDirty?.(); }
  s.fitted = true;
  const tex = Math.max(2 * hx / msz, 2 * hy / msz); s.shadow.normalBias = tex * 1.2 * soft; s.shadow.bias = -(.03 + tex * .2) / depth;
  return { width: hx * 2, height: hy * 2, texel: tex };
}
/** A shadow-casting spotlight (torch, searchlight) whose shadow follows the quality tier. */
// Area lights (gs.hd.panel): light from a glowing rectangle (a window, a TV, a striplight, a softbox),
// with the soft, stretched highlights a point light can't make. three.js's RectAreaLight, lit by
// the LTC method (Heitz et al.) on both backends; its 300 KB of tables load the first time a game
// makes one (the light stays dark until then, a moment). No shadows: pair with a spot for those.
let AREA = null, AREA_LTC = null, AREA_GPU = false; const AREA_WAIT = [];
function areaTables() {
  return AREA ||= Promise.all([import('three/examples/jsm/lights/RectAreaLightUniformsLib.js'), import('three/examples/jsm/lights/RectAreaLightTexturesLib.js')])
    .then(([u, t]) => { u.RectAreaLightUniformsLib.init(); AREA_LTC = t.RectAreaLightTexturesLib; for (const l of AREA_WAIT) l.visible = true; AREA_WAIT.length = 0; }, () => { AREA = null; });
}
/** A glowing rectangle of light, w x h metres, shining out of its front (-z; aim it with lookAt).
 * { glow: true } also shows the rectangle itself, in the light's colour. */
export function panel(col = '#fff4e6', i = 8, w = 1, h = 1, { glow = false } = {}) {
  const l = new RectAreaLight(col, i, w, h);
  if (!AREA_LTC) { l.visible = false; AREA_WAIT.push(l); areaTables(); }
  if (glow) { const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: col, side: 2 })); m.material.color.multiplyScalar(Math.min(4, i / 4)); m.userData.noLod = true; l.add(m); }
  return l;
}
export function spot(col = '#fff2e0', i = 30, dist = 16, angle = .5) {
  const s = new SpotLight(col, i, dist, angle, .55, 1.6);
  s.castShadow = true; s.shadow.bias = -.0004; s.shadow.normalBias = .02; s.shadow.camera.near = .2; s.shadow.radius = 3;
  s.setTier = T => { s.castShadow = T.shadow > 0; if (T.shadow && s.shadow.mapSize.x !== T.shadow) shadowSize(s.shadow, T.shadow); };
  return s;
}

/**
 * A neon tube along points ([[x, y, z], ...] or Vector3s, a straight run between each): a glowing tube (it blooms) and
 * the lamp spots that light the world from it (tube lights: on WebGPU a wet road under it shows a long streak of its
 * colour). colour, thick (tube radius, m), glow (how bright the tube itself looks), i (light strength), reach (metres
 * it lights), lights (how many tube lights stand for it: its longest runs). Add the group to the scene; pass
 * n.spots() to v.placeLamps each frame (they follow the group wherever it is moved).
 */
export function neon(points, { colour = '#ff3d8b', thick = .025, glow = 5, i = 3, reach = 6, lights = 3 } = {}) {
  const P = points.map(p => p.isVector3 ? p.clone() : new Vector3(p[0], p[1], p[2]));
  const g = new Group(), m = new MeshStandardMaterial({ color: '#000', emissive: new Color(colour), emissiveIntensity: glow, roughness: .3 }); g.name = 'neon';
  for (let k = 1; k < P.length; k++) {
    const a = P[k - 1], b = P[k], len = a.distanceTo(b); if (len < 1e-4) continue;
    const t = new Mesh(new CylinderGeometry(thick, thick, len + thick, 8, 1), m); t.position.copy(a).add(b).multiplyScalar(.5);
    t.quaternion.setFromUnitVectors(UPV, FR.subVectors(b, a).normalize()); t.castShadow = false; t.userData.noContact = true; t.userData.noLod = true; g.add(t);
  }
  // the lights: the longest runs, each its own tube
  const runs = []; for (let k = 1; k < P.length; k++) runs.push([k, P[k - 1].distanceTo(P[k])]);
  runs.sort((a, b) => b[1] - a[1]); runs.length = Math.min(runs.length, Math.max(1, lights));
  const out = runs.map(([k]) => ({ a: P[k - 1], b: P[k], s: { x: 0, y: 0, z: 0, tube: [0, 0, 0], col: colour, i, reach } }));
  const A = new Vector3(), B = new Vector3();
  g.spots = (list = []) => { g.updateWorldMatrix(true, false); for (const o of out) { A.copy(o.a).applyMatrix4(g.matrixWorld); B.copy(o.b).applyMatrix4(g.matrixWorld); o.s.x = A.x; o.s.y = A.y; o.s.z = A.z; o.s.tube[0] = B.x; o.s.tube[1] = B.y; o.s.tube[2] = B.z; list.push(o.s); } return list; };
  g.material = m;
  return g;
}
/**
 * A glowing sign, w x h metres, facing +z (turn the group to aim it): paint(ctx, pw, ph) draws its face in a canvas
 * (text, a shape; what is bright glows), and it lights what is in front of it as a sign does (a rect light on WebGPU,
 * a lamp at its middle on WebGL). colour: its light's colour (the face's own colours glow as they are); glow, i,
 * reach, px (the canvas's pixels a metre). picture: true lights with its own picture instead (a TV, a video wall, a
 * stained window): each part of its light takes the colour of the part of the face it comes from (WebGPU; on WebGL
 * the face's average colour), and colour, white by default, tints it. g.paint(fn) paints the face again (each frame
 * for a screen that plays; the light follows). Pass s.spots() to v.placeLamps each frame.
 */
export function sign(w, h, paint, { picture = false, colour = picture ? '#ffffff' : '#ffd9a0', glow = 3, i = 4, reach = 7, px = 128 } = {}) {
  const cv = document.createElement('canvas'); cv.width = Math.max(8, Math.round(w * px)); cv.height = Math.max(8, Math.round(h * px));
  const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height); paint?.(c, cv.width, cv.height);
  const tex = new CanvasTexture(cv); tex.colorSpace = SRGBColorSpace;
  const m = new MeshStandardMaterial({ color: '#111', emissive: '#fff', emissiveMap: tex, emissiveIntensity: glow, roughness: .4 });
  const g = new Group(), face = new Mesh(new PlaneGeometry(w, h), m); face.userData.noContact = true; face.userData.noLod = true; g.add(face); g.name = 'sign';
  const s = { x: 0, y: 0, z: 0, col: colour, i, reach, rect: { w, h, normal: [0, 0, 1] }, picture: picture ? tex : undefined }, A = new Vector3(), N = new Vector3();
  g.spots = (list = []) => {
    g.updateWorldMatrix(true, false); A.setFromMatrixPosition(g.matrixWorld); N.set(0, 0, 1).transformDirection(g.matrixWorld);
    // (WebGL lights a sign from a lamp at its middle: a little in front, so the wall it hangs on is lit too)
    s.x = A.x + N.x * .05; s.y = A.y + N.y * .05; s.z = A.z + N.z * .05; s.rect.normal[0] = N.x; s.rect.normal[1] = N.y; s.rect.normal[2] = N.z; list.push(s); return list;
  };
  g.paint = fn => { c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height); fn?.(c, cv.width, cv.height); tex.needsUpdate = true; return g; };
  g.material = m; g.texture = tex;
  return g;
}

/* ---------- contact shadows ---------- */
// The soft shadow right under things, made the usual way: render what's above the floor from below
// as darkness by height into a small texture, blur it, and lay it on the floor. Cheap and looks
// right for AR (things sit on your real floor) and for Next Gen on phones without real shadows.
export class ContactShadows {
  constructor({ y = 0, size = 8, blur = 2.5, darkness = 1.2, opacity = .55, height = 1.2 } = {}) {
    Object.assign(this, { size, blurAmount: blur, height });
    this.group = new Group(); this.group.position.y = y + .003; this.res = 0;
    this.mat = new MeshBasicMaterial({ transparent: true, opacity, depthWrite: false, toneMapped: false });
    this.plane = new Mesh(new PlaneGeometry(size, size).rotateX(Math.PI / 2), this.mat);
    this.plane.renderOrder = 1; this.plane.scale.y = -1; this.plane.userData.noContact = true; this.group.add(this.plane);
    this.cam = new OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, height); this.cam.rotation.x = Math.PI / 2; this.group.add(this.cam);
    this.depth = new MeshDepthMaterial(); this.depth.depthTest = this.depth.depthWrite = false;
    this.depth.userData.dark = { value: darkness };
    this.depth.onBeforeCompile = sh => {
      sh.uniforms.darkness = this.depth.userData.dark;
      sh.fragmentShader = 'uniform float darkness;\n' + sh.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );');
    };
    this.hBlur = new ShaderMaterial(HorizontalBlurShader); this.hBlur.depthTest = false;
    this.vBlur = new ShaderMaterial(VerticalBlurShader); this.vBlur.depthTest = false;
    this.quad = new FullScreenQuad(null);
  }
  /** Moves the shadow area to centre on x, z (follow the action in a big level). */
  at(x, z) { this.group.position.x = x; this.group.position.z = z; return this; }
  set(res) {
    if (res === this.res) return;
    this.rt?.dispose(); this.rt2?.dispose(); this.res = res;
    if (!res) { this.rt = this.rt2 = null; this.mat.map = null; return; }
    this.rt = new WebGLRenderTarget(res, res); this.rt.texture.generateMipmaps = false;
    this.rt2 = new WebGLRenderTarget(res, res); this.rt2.texture.generateMipmaps = false;
    this.mat.map = this.rt.texture; this.mat.needsUpdate = true;
  }
  blur(r, amount) {
    this.hBlur.uniforms.tDiffuse.value = this.rt.texture; this.hBlur.uniforms.h.value = amount / 256;
    this.quad.material = this.hBlur; r.setRenderTarget(this.rt2); this.quad.render(r);
    this.vBlur.uniforms.tDiffuse.value = this.rt2.texture; this.vBlur.uniforms.v.value = amount / 256;
    this.quad.material = this.vBlur; r.setRenderTarget(this.rt); this.quad.render(r);
  }
  update(r, scene, res) {
    if (this.enabled === false) res = 0;
    this.set(res); this.plane.visible = !!res; if (!res) return;
    if (this.mat.map !== this.rt.texture) { this.mat.map = this.rt.texture; this.mat.needsUpdate = true; }   // back from WebGPU (hd3d-gpu.js gpuContact)
    // only things that cast shadows go in (not floors, shadow catchers or effects)
    const hidden = [];
    eachShown(scene, o => { if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && (!o.castShadow || o.userData.noContact)) hidden.push(o); });
    for (const o of hidden) o.visible = false;
    const bg = scene.background, fog = scene.fog, prevT = r.getRenderTarget(), clr = r.getClearAlpha(), auto = r.autoClear;
    scene.background = null; scene.fog = null; scene.overrideMaterial = this.depth;
    r.setClearAlpha(0); r.autoClear = true; r.setRenderTarget(this.rt); r.clear(); r.render(scene, this.cam);
    scene.overrideMaterial = null; scene.background = bg; scene.fog = fog;
    for (const o of hidden) o.visible = true;
    this.blur(r, this.blurAmount); this.blur(r, this.blurAmount * .4);
    r.setRenderTarget(prevT); r.setClearAlpha(clr); r.autoClear = auto;
  }
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(HDView.prototype, 'render', '3D render');
