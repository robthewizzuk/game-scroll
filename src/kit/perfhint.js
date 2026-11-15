// Performance hint sessions on Android (ADPF, PerformanceHintManager; plugins/power-state): while a round is
// played the app tells the phone how long each frame should take (the game's frame budget) and how long its
// work really took, and the phone sets its CPU clocks to just what the frames need. Without them it guesses
// from how busy the cores look, and the guess runs hot: high clocks for work that would fit at lower ones,
// then slow ones when a burst comes. The same frames for less power, and fewer late ones.
//
// The session holds the WebView's GPU and compositor threads, the ones of this app's own process that put each
// frame on the screen (Android lets a session hold only those; the page's script runs in WebView's sandboxed
// renderer, another process). Each frame's work (src/perf.js: the game's update and draw; the chip's time where
// WebGPU times it, hd3d.js) is sent in small batches four times a second, not a call each frame. While the phone
// saves power (src/kit/power.js saving) the session asks for efficiency over speed (Android 15+). It closes two
// seconds after the last frame of play, and a new round opens a new one.
//
// Android 12 and later; elsewhere, and in an app from before the hints, nothing happens.
import { Capacitor } from '@capacitor/core';
import { power, powerPlugin } from './power.js';

const android = Capacitor.getPlatform() === 'android';
const BATCH_MS = 250, IDLE_MS = 2000, MAX = 120;
/** What the hints are doing, for the frame lab: on, the threads in the session, frames reported, why not. */
export const hint = { on: false, threads: [], sent: 0, why: '', efficient: false, target: 0 };
let cpu = [], gpu = [], last = -1e9, timer = 0, starting = false, off = !android || !powerPlugin;
if (off) hint.why = android ? 'no power plugin' : 'Android only';

/** Each frame of play (src/perf.js): its work in ms, the chip's ms (or null) and the frame's budget. */
export function hintFrame(work, gpuMs, budget) {
  if (off) return;
  last = performance.now();
  if (cpu.length < MAX) { cpu.push(+work.toFixed(3)); gpu.push(gpuMs > 0 ? +gpuMs.toFixed(3) : -1); }
  if (!hint.on && !starting) begin(budget);
  else if (hint.on && Math.abs(budget - hint.target) > .5) { hint.target = budget; powerPlugin.hintTarget({ ms: budget }).catch(() => {}); }
  if (!timer) timer = setInterval(flush, BATCH_MS);
}

function begin(budget) {
  starting = true;
  powerPlugin.hintStart({ ms: budget }).then(o => {
    if (o?.ok) { hint.on = true; hint.threads = o.threads || []; hint.target = budget; hint.why = ''; hint.efficient = false; }
    else { off = true; hint.why = o?.why || 'not offered'; }
  }, () => { off = true; hint.why = 'this app build has no hint sessions'; }).finally(() => { starting = false; });
}

function flush() {
  const now = performance.now();
  if (hint.on && cpu.length) { const c = cpu, g = gpu; cpu = []; gpu = []; hint.sent += c.length; powerPlugin.hintReport({ cpu: c, gpu: g }).catch(() => {}); }
  if (hint.on && power.saving !== hint.efficient) { hint.efficient = power.saving; powerPlugin.hintEfficient({ on: hint.efficient }).catch(() => {}); }
  if (now - last > IDLE_MS) {
    clearInterval(timer); timer = 0; cpu = []; gpu = [];
    if (hint.on) { hint.on = false; powerPlugin.hintStop().catch(() => {}); }
  }
}
