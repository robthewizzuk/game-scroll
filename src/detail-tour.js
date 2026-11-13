// Engine test scenes, for the phone test tour (src/tour.js; QA panel › Phone test tour › Engine test
// scenes). The Next Gen engine's detail systems (cluster detail, detail for copies, real surface detail,
// hiding what is behind other things, shadows in tiles, crowds, ground that takes marks, smoke and fire that flow, land with cliffs and caves, ray traced reflections, smaller meshes, people that move) are checked on a build machine's software renderer, which can count triangles and compare pictures but
// says nothing about a phone's graphics chip. This flies through a heavy scene for each (src/detail-scenes.js)
// with the system off and then on, on the phone in your hand, and gives one report to copy.
//
// How a run is made comparable:
//  - The feed is emptied and the scenes draw on a canvas of their own over the app, with the 3D canvas
//    under it as on a game's card, so the picture takes the same road to the screen as a game's.
//  - Quality is pinned (the tier this class of phone starts on, full resolution), so neither run can
//    trade sharpness for speed. Frame generation is off: every frame timed is a real one.
//  - Before a run is timed, whatever the system has to build is waited for (and its time is told), and
//    the whole flight is flown once quickly so its shaders are built.
//  - Each run flies the same path by the clock, so a slow run and a fast one see the same things. Time
//    spent in another app is left out of the clock; a slow frame, however long, is a frame.
//
// Frame generation (runScenes({ framegen: true }); the tour's "Frame generation" choice) flies a few of the
// scenes with their system on, four ways: as many frames drawn as this class of phone draws a Next Gen game
// (every refresh on a top phone), half the screen's rate drawn and nothing made, and half drawn with the refreshes between made, blended and
// then ahead. Each is paced as the app paces a game (src/main.js frame(): a real frame on a steady beat, and
// on the refreshes between, what speed.between shows), the screen is asked for the rate a game drawn that way
// would get, and frame generation is forced on or off for the run whatever Settings say. The report counts
// the pictures that reached a refresh, how many of them were drawn, and the chip's time for each drawn frame
// with the frames made after it, so it says what a made frame costs and whether frame generation pays.
import gs, { loadParts } from './gamescroll.js';
import { ownedBy, release } from './kit/cleanup.js';
import { power } from './kit/power.js';
import { speed, fpsFor, screenHz, phoneClass } from './kit/speed.js';
import { screen as display } from './kit/screenrate.js';
import { webgpu } from './kit/gpu.js';
import { SCENES } from './detail-scenes.js';
import { summarise, phone, powerNow, head, guestApi } from './tour.js';

const frame = () => new Promise(r => requestAnimationFrame(r));
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const num = n => Math.round(n).toLocaleString('en-GB');
const secs = ms => ms < 950 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
const TIER = ['low', 'medium', 'high', 'ultra'], STOP = {};   // STOP: thrown out of a build's wait when Stop is pressed
// the scenes frame generation is flown through: houses and shadows, people walking, thin leaves, smoke and fire
const FG_SCENES = ['town', 'square', 'forest', 'yard'];
// frame generation's four runs, for a screen whose fastest rate is top (a stand-in game definition each: fps its beat)
function fgRuns(top) {
  const half = Math.round(top / 2), rest = top - half;
  return [
    { key: 'every', name: 'as many as it can', def: { frameGen: false } },   // (named by its beat once run: 120 drawn on a top phone's 120 Hz screen)
    { key: 'half', name: `${half} drawn, none made`, def: { fps: half, frameGen: false } },
    { key: 'blend', name: `${half} drawn, ${rest} blended`, def: { fps: half }, force: 'blend' },
    { key: 'ahead', name: `${half} drawn, ${rest} ahead`, def: { fps: half }, force: 'ahead' },
  ];
}

/**
 * Runs the scenes. driver: the feed (src/main.js). Options: seconds (of flight for each run, 20), size
 * (1: the full scenes; the app's own check runs small ones), only (scene keys), onStep({ i, n, game: { title }, what })
 * and onPlay({ played }) for a progress display, signal ({ stop: true } ends it). framegen: frame generation's
 * runs instead of each system off and on (FG_SCENES unless only says); alternate: in those, every other refresh
 * is one between real frames, whatever the clock says (a test browser, whose frames come too slowly for a beat).
 * Gives the result, with its report as .text.
 */
export async function runScenes(driver, { seconds = 20, size = 1, only = null, onStep = null, onPlay = null, signal = {}, framegen = false, alternate = false } = {}) {
  const t0 = Date.now(), list = SCENES.filter(s => only ? only.includes(s[0]) : !framegen || FG_SCENES.includes(s[0])), stopped = () => !!signal.stop;
  const out = { kind: 'scenes', framegen: !!framegen, at: new Date().toISOString(), seconds, size, asked: list.length, scenes: [], stopped: false };
  out.phone = await phone(); out.powerBefore = powerNow();
  await loadParts(['hd', 'props', 'models', 'poses', 'outdoors', 'sky', 'gas', 'THREE']);
  const { HD } = await import('./kit/hd3d.js');
  // the stage: a canvas over the whole app, as a card's is over its 3D picture
  const stage = document.createElement('div'); stage.className = 'tour-stage';
  const canvas = document.createElement('canvas'); stage.appendChild(canvas); document.body.appendChild(stage);
  const ctx = canvas.getContext('2d');
  let W = 1, H = 1, sized = false;
  const resized = () => { sized = false; };
  const fit = () => {
    const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight), k = Math.min(2.5, devicePixelRatio || 1), pw = Math.round(w * k), ph = Math.round(h * k);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    W = w; H = h; ctx.setTransform(k, 0, 0, k, 0, 0); sized = true;
  };
  const was = { force: HD.force, fg: speed.forceFrameGen };
  let S = null, hid = false;
  const hide = () => { if (document.visibilityState !== 'visible') hid = true; };   // the phone went to another app (see fly())
  const draw = () => { if (stopped()) throw STOP; if (!sized) fit(); S.v.render(ctx, W, H); return frame(); };
  // a refresh paced as the app paces a game (src/main.js frame()): a real frame when the game's beat is due, else
  // the moment frame generation has for it (speed.between: a made frame, the newest real one, or nothing new)
  const beat = async (pace, t) => {
    const now = await frame(); if (stopped()) throw STOP;
    const rf = 1000 / screenHz(), step = 1000 / fpsFor(pace.def);
    if (pace.alternate ? pace.n++ % 2 === 1 : pace.next && now < pace.next - .4 * rf) {
      const b = speed.between, k = b ? b(pace.alternate || now + 1.4 * rf >= pace.next, pace.alternate ? null : now) : false;
      return { now, real: false, pic: !!k };
    }
    pace.next = pace.next && now - pace.next <= step ? pace.next + step : now + step;
    speed.between = null;   // (the 3D kit sets it again while this frame draws)
    S.path(t, S.v.cam); if (!sized) fit(); S.v.render(ctx, W, H);
    return { now, real: true, pic: true };
  };
  // one timed run along the path (pace: frame generation's runs, see beat())
  const fly = async (pace = null) => {
    const dts = [], cpu = [], tris = [], calls = [], chip = [], by = {}, gaps = [], budget = 1000 / screenHz();
    let last = 0, seen = null, away = 0, lastPic = 0, drawn = 0;
    HD.info.gpuMs = null; hid = false;
    const start = performance.now();
    for (;;) {
      const t = (performance.now() - start - away) / 1000;
      if (t >= seconds || stopped()) break;
      let now, real = true, pic = true;
      if (pace) ({ now, real, pic } = await beat(pace, t));
      else { S.path(t, S.v.cam); now = await draw(); }
      const I = HD.info;
      if (last) {
        const dt = now - last;
        // The phone went to another app: that gap is nobody's frame. It is told by the page having been hidden,
        // not by how long the gap was: a frame that takes over half a second is a slow frame, and where every
        // frame did (a build machine drawing a big picture) the clock stood still and the run never ended.
        if (hid || document.visibilityState !== 'visible') { away += dt; lastPic = 0; }
        else {
          dts.push(dt);
          if (real) { drawn++; cpu.push(I.cpu); tris.push(I.tris); calls.push(I.calls); if (I.gpuMs != null && I.gpuMs !== seen && t > .5) { chip.push(seen = I.gpuMs); for (const k in I.gpuParts || {}) by[k] = (by[k] || 0) + I.gpuParts[k]; } }
          if (pic && lastPic) gaps.push(now - lastPic);
        }
      }
      if (pic) lastPic = now;
      hid = false; last = now; onPlay?.({ played: t });
    }
    const I = HD.info;
    for (const k in by) by[k] /= chip.length;
    const res = { ...summarise(dts, cpu, budget), chip: chip.length ? mean(chip) : null, chipBy: chip.length ? by : null, tris: mean(tris), calls: mean(calls), backend: I.backend, why: I.webgl || '', rw: I.rw, rh: I.rh, ow: I.ow, oh: I.oh, upscaled: I.upscaled, heat: power.heat };
    // frame generation's runs: the frame rate is of the pictures that reached a refresh (drawn or made), and how
    // many of them were drawn; the refreshes the page got a second (fewer than the screen's when the phone held
    // them back); the code's time is each drawn frame's
    if (pace) {
      const secs = dts.reduce((a, b) => a + b, 0) / 1000, p = summarise(gaps, [], budget);
      Object.assign(res, { fps: p.fps, low: p.low, worst: p.worst, slow: p.slow, freezes: p.freezes, pictures: gaps.length, drawn, drawnFps: secs > 0 ? drawn / secs : 0, refreshes: secs > 0 ? dts.length / secs : 0, work: mean(cpu), hz: screenHz(), how: HD.info.framegen || false });
    }
    return res;
  };
  try {
    HD.force = phoneClass() === 'low' ? 1 : 2; out.tier = HD.force;
    document.body.classList.add('touring'); addEventListener('resize', resized); document.addEventListener('visibilitychange', hide);
    driver.begin(guestApi); driver.clear();
    const gpu = !!webgpu(), top = phoneClass() === 'top';
    // frame generation: WebGPU only; its runs for the screen's fastest rate (what a game asks for while it makes frames)
    const fgTop = Math.max(display.top || 0, screenHz()), fg = framegen && gpu ? fgRuns(fgTop) : null;
    if (framegen) { out.fgTop = fgTop; if (!gpu) out.note = 'Frame generation needs WebGPU, and this phone draws the 3D with WebGL here, so there was nothing to time.'; }
    const runsOf = key => fg ? fg.length : key === 'forest' && gpu ? 4 : key === 'town' || ((key === 'yard' || key === 'hall') && gpu) ? 3 : 2, runs = framegen && !gpu ? 0 : list.reduce((n, s) => n + runsOf(s[0]), 0);
    let done = 0;
    for (const [key, name, what, make] of list) {
      if (stopped() || (framegen && !fg)) break;
      const res = { key, name, what, modes: [], error: '' }, token = {}, first = done;
      out.scenes.push(res);
      const say = (mode, doing) => onStep?.({ i: Math.min(done, runs - 1), n: runs, game: { title: mode ? `${name} · ${mode}` : name }, what: doing });
      try {
        say('', 'making the scene'); await frame(); await frame();   // (the bar says so before the long step)
        const tb = performance.now();
        S = ownedBy(token, () => make({ gs, HD, size, gpu, top }));
        res.made = performance.now() - tb; res.holds = S.holds; res.pairs = fg ? null : S.pairs || null;
        // frame generation's runs: the scene with its system on (its last mode), drawn as a game would be four ways
        let sys = null;
        const modes = fg ? fg.map(f => ({ key: f.key, name: f.name, enter: async d => {
          const e = sys ? {} : (sys = S.modes[S.modes.length - 1], await sys.enter(d) || {});
          // a game drawn this way: its beat, frame generation forced on or off, and the screen asked for its rate
          const def = { id: `engine-scene-${key}`, title: name, retro: true, era: 'nextgen', ...f.def };
          speed.game = speed.standIn = def; speed.forceFrameGen = f.force || null; speed.between = null;
          return { build: null, note: e.note, pace: { def, alternate: alternate && !!f.def.fps, n: 0, next: 0 }, name: () => f.key === 'every' ? `${Math.round(fpsFor(def))} drawn, none made` : f.name };
        } })) : S.modes;
        for (const m of modes) {
          if (stopped()) break;
          say(m.name, 'getting ready');
          const e = await m.enter(draw) || {};
          // the whole flight once, quickly, so every shader it needs is built before it is timed (with the
          // refreshes between real frames too, where frames are made, and then paced, while the screen changes rate)
          for (let i = 0; i < 45 && !stopped(); i++) { S.path(seconds * i / 45, S.v.cam); await draw(); if (e.pace) speed.between?.(true, null); }
          S.path(0, S.v.cam); for (let i = 0; i < 20 && !stopped(); i++) if (e.pace) await beat(e.pace, 0); else await draw();
          if (stopped()) break;
          say(m.name, '0 s');
          const run = await fly(e.pace);
          res.modes.push({ key: m.key, name: e.name?.() || m.name, build: e.build ?? null, note: e.note || '', tell: S.tell() || '', uncounted: !!S.uncounted?.(), ...run });
          done++;
        }
      } catch (e) { if (e !== STOP) { res.error = String(e?.stack || e?.message || e).split('\n').slice(0, 2).join(' '); console.error('engine test scene', key, e); } }
      finally { if (fg) { speed.game = speed.standIn = speed.between = null; speed.forceFrameGen = was.fg; } try { S?.dispose(); } catch (e) { console.warn('engine test scene', key, e); } release(token); S = null; done = first + runsOf(key); }
      await new Promise(r => setTimeout(r, 300));   // a breath between scenes: the last one's memory is let go
    }
  } finally {
    HD.force = was.force; if (framegen) { speed.game = speed.standIn = speed.between = null; speed.forceFrameGen = was.fg; } removeEventListener('resize', resized); document.removeEventListener('visibilitychange', hide); stage.remove(); document.body.classList.remove('touring'); driver.end();
    out.stopped = stopped(); out.took = Math.round((Date.now() - t0) / 1000); out.powerAfter = powerNow();
  }
  out.text = scenesText(out);
  return out;
}
/* ---------- the report ---------- */
// how two numbers stand to each other, in words: k times `up` when a is the bigger, `down` when b is, `same` within 5%
const times = (a, b, up, down, same) => { if (!(a > 0 && b > 0)) return ''; const k = a / b, n = v => v.toFixed(v < 10 ? 1 : 0); return Math.abs(k - 1) < .05 ? same : k > 1 ? `${n(k)} times ${up}` : `${n(1 / k)} times ${down}`; };
// the chip's time by pass, biggest first: " (scene 6.1, AO 2.3, upscale 1.6, bloom 1.4, shadows 1.2, rest 0.8)"
const PASS = { scene: 'scene', shadows: 'shadows', ao: 'AO', bloom: 'bloom', upscale: 'upscale', effects: 'effects', show: 'to screen', compute: 'compute' };
function chipBy(by) {
  if (!by) return '';
  const all = Object.entries(by).filter(([, v]) => v >= .05).sort((a, b) => b[1] - a[1]);
  return all.length ? ` (${all.map(([k, v]) => `${PASS[k] || k} ${v.toFixed(1)}`).join(', ')})` : '';
}
function modeLine(m) {
  const parts = [`${Math.round(m.fps)} fps`, `worst 1% ${Math.round(m.low)} fps`, `longest ${Math.round(m.worst)} ms`, m.chip != null ? `chip ${m.chip.toFixed(1)} ms${chipBy(m.chipBy)}` : 'chip time not told', `code ${m.work.toFixed(1)} ms`, m.uncounted ? `${num(m.calls)} draws (the chip picks the copies, so their triangles are not counted)` : `${num(m.tris)} triangles in ${num(m.calls)} draws`];
  if (m.build != null) parts.push(`ready in ${secs(m.build)}`);
  if (m.note) parts.push(m.note);
  if (m.tell) parts.push(m.tell);
  if (m.heat) parts.push(m.heat > 1 ? 'phone hot' : 'phone warm');
  return `  ${m.name.padEnd(26)} ${parts.join(' · ')}`;
}
// a frame generation run: the pictures that reached a refresh a second (and how many were drawn), the chip's time
// for each drawn frame with the frames made after it, the 3D's size and the screen's rate as the run ended
function fgLine(m) {
  const made = m.fps - m.drawnFps > .5;
  const parts = [`${Math.round(m.fps)} pictures a second${made ? ` (${Math.round(m.drawnFps)} drawn)` : ''}`, `worst 1% ${Math.round(m.low)}`, `longest ${Math.round(m.worst)} ms`,
    m.chip != null ? `chip ${m.chip.toFixed(1)} ms a drawn frame${chipBy(m.chipBy)}` : 'chip time not told', `code ${m.work.toFixed(1)} ms`, `3D at ${m.rw} x ${m.rh}`, `screen ${m.hz} Hz`];
  if (m.refreshes < m.hz * .9) parts.push(`the page got ${Math.round(m.refreshes)} refreshes a second`);
  if (m.heat) parts.push(m.heat > 1 ? 'phone hot' : 'phone warm');
  return `  ${m.name.padEnd(26)} ${parts.join(' · ')}`;
}
// what frame generation's runs say: what the made frames cost the chip, and whether they pay against drawing every frame
// (chip time a picture: a drawn frame's time, with the frames made after it, shared by the pictures it gave)
function fgSay(s) {
  const of = k => s.modes.find(m => m.key === k && m.frames), half = of('half'), every = of('every'), lines = [];
  const perPic = m => m.chip != null && m.pictures ? m.chip * m.drawnFps / m.fps : null;
  const costs = ['blend', 'ahead'].map(k => of(k)).filter(m => m && half?.chip != null && m.chip != null).map(m => `${(m.chip - half.chip).toFixed(1)} ms ${m.key === 'blend' ? 'blended' : 'ahead'}`);
  if (costs.length) lines.push(`  = the frames made: ${costs.join(', ')} of chip time for each drawn frame`);
  // against drawing every frame; on a phone whose Next Gen games are drawn at half the screen's rate anyway, against none made
  const base = every && half && every.drawnFps < half.drawnFps * 1.2 ? half : every || half;
  for (const m of ['blend', 'ahead'].map(of).filter(Boolean)) {
    if (!base) continue;
    const say = [`${Math.round(m.fps)} pictures a second against ${Math.round(base.fps)}`, `worst 1% ${Math.round(m.low)} against ${Math.round(base.low)}`], a = perPic(base), b = perPic(m);
    if (a != null && b != null) say.push(times(a, b, 'less chip time a picture', 'more chip time a picture', 'the same chip time a picture'));
    lines.push(`  = ${m.name} against ${base.name}: ${say.join(' · ')}`);
  }
  return lines;
}
function sceneLines(s, hz) {
  const lines = [`\n${s.name.toUpperCase()} · ${s.what}${s.holds ? ' · ' + s.holds : ''}${s.made != null ? ` · made in ${secs(s.made)}` : ''}`];
  if (s.error) lines.push(`  ERROR     ${s.error}`);
  if (s.modes.some(m => m.pictures != null)) {
    for (const m of s.modes) lines.push(m.frames ? fgLine(m) : `  ${m.name.padEnd(26)} no frames timed`);
    return lines.concat(fgSay(s));
  }
  for (const m of s.modes) lines.push(m.frames ? modeLine(m) : `  ${m.name.padEnd(26)} no frames timed`);
  const of = k => s.modes.find(m => m.key === k);
  for (const [ka, kb, words] of s.pairs || [[s.modes[0]?.key, s.modes[1]?.key]]) {
    const a = of(ka), b = of(kb);
    if (!(a?.frames && b?.frames)) continue;
    const capped = Math.min(a.fps, b.fps) > hz * .95;
    const say = [capped ? `both keep the screen's ${hz} Hz` : times(b.fps, a.fps, 'the frame rate', 'slower', 'the same frame rate')];
    if (a.chip != null && b.chip != null) say.push(times(a.chip, b.chip, 'less chip time', 'more chip time', 'the same chip time'));
    else if (capped) say.push('this phone does not tell the chip\'s time, so the triangles are what is left to go by');
    if (!a.uncounted && !b.uncounted) say.push(times(a.tris, b.tris, 'fewer triangles', 'more triangles', 'the same triangles'));
    lines.push(`  = ${words || `${b.name} against ${a.name}`}: ${say.filter(Boolean).join(' · ')}`);
  }
  return lines;
}
/** The scenes' result as the text to copy. */
export function scenesText(t) {
  const m0 = t.scenes.flatMap(s => s.modes).find(m => m.frames), hz = t.phone.hz;
  const lines = head(t, t.framegen ? 'engine test scenes, frame generation' : 'engine test scenes', t.stopped ? ` · STOPPED after ${t.scenes.length} of ${t.asked} scenes` : '');
  lines.push(m0 ? `PICTURE: ${m0.backend === 'webgpu' ? 'WebGPU' : 'WebGL' + (m0.why ? ` (${m0.why})` : '')} · quality ${TIER[t.tier] || t.tier}, pinned · 3D drawn at ${m0.rw} x ${m0.rh}, shown at ${m0.ow} x ${m0.oh}${m0.upscaled ? ` (${m0.upscaled === 'sgsr2' ? 'SGSR 2' : 'SGSR 1'})` : ''} · ${t.framegen ? `frame generation as each run says, for a ${t.fgTop} Hz screen` : 'frame generation off'} · ${t.seconds} s a run${t.size !== 1 ? ` · scenes at ${t.size} of full size` : ''}`
    : 'PICTURE: no frames were timed');
  if (t.note) lines.push(t.note);
  for (const s of t.scenes) lines.push(...sceneLines(s, hz));
  if (t.framegen) {
    lines.push('\nEach scene is flown through with its system on, at a pinned quality, four ways: as many frames drawn as this class of phone draws a Next Gen game (every refresh on a top phone); half the screen\'s rate drawn and nothing made; and half drawn with the refreshes between made, blended (between the last two drawn frames) and then ahead (guessed past the newest). Frame generation is forced on or off for each run whatever Settings say, and the screen is asked for the rate a game drawn that way would get. pictures a second: the drawn and made frames that reached a refresh (a refresh that showed the same picture again is not counted), with how many of them were drawn; worst 1% and longest are of the gaps between them. chip: the graphics chip\'s time for each drawn frame with the frames made after it, where the phone tells it, so set against "none made" it is what the made frames cost; chip time a picture shares it among the pictures it gave. "the page got": fewer refreshes than the screen\'s rate, where the phone held them back because the chip was behind.');
    return lines.join('\n');
  }
  lines.push('\nEach scene is flown through the same way with the system off, then on, at a pinned quality, so the runs can be compared. A frame rate cannot go above the screen\'s rate. chip: the graphics chip\'s time for a frame, where the phone tells it (WebGPU), and in brackets where it went: scene is the game\'s own things, shadows the shadow maps, AO the soft shading in corners, bloom the glow, upscale the pass that makes the full-size picture, effects the other passes, to screen the last one. code: the time the engine\'s own code took to draw a frame. ready in: how long the system took to build what it needs (kept on the phone afterwards, so a second tour has it at once).');
  return lines.join('\n');
}
