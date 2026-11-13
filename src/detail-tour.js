// Engine test scenes, for the phone test tour (src/tour.js; QA panel › Phone test tour › Engine test
// scenes). The Next Gen engine's detail systems (cluster detail, detail for copies, real surface detail,
// hiding what is behind other things, shadows in tiles, crowds, ground that takes marks) are checked on a build machine's software renderer, which can count triangles and compare pictures but
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
//  - Each run flies the same path by the clock, so a slow run and a fast one see the same things.
import gs, { loadParts } from './gamescroll.js';
import { ownedBy, release } from './kit/cleanup.js';
import { power } from './kit/power.js';
import { screenHz, phoneClass } from './kit/speed.js';
import { webgpu } from './kit/gpu.js';
import { SCENES } from './detail-scenes.js';
import { summarise, phone, powerNow, head, guestApi } from './tour.js';

const frame = () => new Promise(r => requestAnimationFrame(r));
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const num = n => Math.round(n).toLocaleString('en-GB');
const secs = ms => ms < 950 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
const TIER = ['low', 'medium', 'high', 'ultra'], STOP = {};   // STOP: thrown out of a build's wait when Stop is pressed

/**
 * Runs the scenes. driver: the feed (src/main.js). Options: seconds (of flight for each run, 20), size
 * (1: the full scenes; the app's own check runs small ones), only (scene keys), onStep({ i, n, game: { title }, what })
 * and onPlay({ played }) for a progress display, signal ({ stop: true } ends it). Gives the result, with
 * its report as .text.
 */
export async function runScenes(driver, { seconds = 20, size = 1, only = null, onStep = null, onPlay = null, signal = {} } = {}) {
  const t0 = Date.now(), list = SCENES.filter(s => !only || only.includes(s[0])), stopped = () => !!signal.stop;
  const out = { kind: 'scenes', at: new Date().toISOString(), seconds, size, asked: list.length, scenes: [], stopped: false };
  out.phone = await phone(); out.powerBefore = powerNow();
  await loadParts(['hd', 'props', 'models', 'poses', 'outdoors', 'sky', 'THREE']);
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
  const was = { force: HD.force };
  let S = null;
  const draw = () => { if (stopped()) throw STOP; if (!sized) fit(); S.v.render(ctx, W, H); return frame(); };
  // one timed run along the path
  const fly = async () => {
    const dts = [], cpu = [], tris = [], calls = [], chip = [], by = {}, budget = 1000 / screenHz();
    let last = 0, seen = null, away = 0;
    HD.info.gpuMs = null;
    const start = performance.now();
    for (;;) {
      const t = (performance.now() - start - away) / 1000;
      if (t >= seconds || stopped()) break;
      S.path(t, S.v.cam);
      const now = await draw(), I = HD.info;
      if (last) {
        const dt = now - last;
        if (dt > 500 || document.visibilityState !== 'visible') away += dt;   // the phone went to another app: that gap is nobody's frame
        else { dts.push(dt); cpu.push(I.cpu); tris.push(I.tris); calls.push(I.calls); if (I.gpuMs != null && I.gpuMs !== seen && t > .5) { chip.push(seen = I.gpuMs); for (const k in I.gpuParts || {}) by[k] = (by[k] || 0) + I.gpuParts[k]; } }
      }
      last = now; onPlay?.({ played: t });
    }
    const I = HD.info;
    for (const k in by) by[k] /= chip.length;
    return { ...summarise(dts, cpu, budget), chip: chip.length ? mean(chip) : null, chipBy: chip.length ? by : null, tris: mean(tris), calls: mean(calls), backend: I.backend, why: I.webgl || '', rw: I.rw, rh: I.rh, ow: I.ow, oh: I.oh, upscaled: I.upscaled, heat: power.heat };
  };
  try {
    HD.force = phoneClass() === 'low' ? 1 : 2; out.tier = HD.force;
    document.body.classList.add('touring'); addEventListener('resize', resized);
    driver.begin(guestApi); driver.clear();
    const gpu = !!webgpu(), runsOf = key => key === 'forest' && gpu ? 4 : key === 'town' ? 3 : 2, runs = list.reduce((n, s) => n + runsOf(s[0]), 0);
    let done = 0;
    for (const [key, name, what, make] of list) {
      if (stopped()) break;
      const res = { key, name, what, modes: [], error: '' }, token = {}, first = done;
      out.scenes.push(res);
      const say = (mode, doing) => onStep?.({ i: Math.min(done, runs - 1), n: runs, game: { title: mode ? `${name} · ${mode}` : name }, what: doing });
      try {
        say('', 'making the scene'); await frame(); await frame();   // (the bar says so before the long step)
        const tb = performance.now();
        S = ownedBy(token, () => make({ gs, HD, size, gpu }));
        res.made = performance.now() - tb; res.holds = S.holds; res.pairs = S.pairs || null;
        for (const m of S.modes) {
          if (stopped()) break;
          say(m.name, 'getting ready');
          const e = await m.enter(draw) || {};
          // the whole flight once, quickly, so every shader it needs is built before it is timed
          for (let i = 0; i < 45 && !stopped(); i++) { S.path(seconds * i / 45, S.v.cam); await draw(); }
          S.path(0, S.v.cam); for (let i = 0; i < 20 && !stopped(); i++) await draw();
          if (stopped()) break;
          say(m.name, '0 s');
          const run = await fly();
          res.modes.push({ key: m.key, name: m.name, build: e.build ?? null, note: e.note || '', tell: S.tell() || '', uncounted: !!S.uncounted?.(), ...run });
          done++;
        }
      } catch (e) { if (e !== STOP) { res.error = String(e?.stack || e?.message || e).split('\n').slice(0, 2).join(' '); console.error('engine test scene', key, e); } }
      finally { try { S?.dispose(); } catch (e) { console.warn('engine test scene', key, e); } release(token); S = null; done = first + runsOf(key); }
      await new Promise(r => setTimeout(r, 300));   // a breath between scenes: the last one's memory is let go
    }
  } finally {
    HD.force = was.force; removeEventListener('resize', resized); stage.remove(); document.body.classList.remove('touring'); driver.end();
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
function sceneLines(s, hz) {
  const lines = [`\n${s.name.toUpperCase()} · ${s.what}${s.holds ? ' · ' + s.holds : ''}${s.made != null ? ` · made in ${secs(s.made)}` : ''}`];
  if (s.error) lines.push(`  ERROR     ${s.error}`);
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
  const lines = head(t, 'engine test scenes', t.stopped ? ` · STOPPED after ${t.scenes.length} of ${t.asked} scenes` : '');
  lines.push(m0 ? `PICTURE: ${m0.backend === 'webgpu' ? 'WebGPU' : 'WebGL' + (m0.why ? ` (${m0.why})` : '')} · quality ${TIER[t.tier] || t.tier}, pinned · 3D drawn at ${m0.rw} x ${m0.rh}, shown at ${m0.ow} x ${m0.oh}${m0.upscaled ? ` (${m0.upscaled === 'sgsr2' ? 'SGSR 2' : 'SGSR 1'})` : ''} · frame generation off · ${t.seconds} s a run${t.size !== 1 ? ` · scenes at ${t.size} of full size` : ''}`
    : 'PICTURE: no frames were timed');
  for (const s of t.scenes) lines.push(...sceneLines(s, hz));
  lines.push('\nEach scene is flown through the same way with the system off, then on, at a pinned quality, so the runs can be compared. A frame rate cannot go above the screen\'s rate. chip: the graphics chip\'s time for a frame, where the phone tells it (WebGPU), and in brackets where it went: scene is the game\'s own things, shadows the shadow maps, AO the soft shading in corners, bloom the glow, upscale the pass that makes the full-size picture, effects the other passes, to screen the last one. code: the time the engine\'s own code took to draw a frame. ready in: how long the system took to build what it needs (kept on the phone afterwards, so a second tour has it at once).');
  return lines.join('\n');
}
