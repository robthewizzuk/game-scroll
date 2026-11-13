// The memory guard (Rob's pick 1 of 2026-11-13): notice when the phone is running short of memory and
// let go of what can be made again, before the phone closes the app. A phone that kills the app is worse
// than any dropped frame, and nothing listened for it before.
//
// What it reads (asked every 5 s while the app is in front, and at once when the phone warns):
//   Android  the phone's free memory against the line where it starts closing apps (ActivityManager's
//            availMem and threshold), its own "low memory" flag, and its trim warnings (onTrimMemory)
//   iPhone   the memory warning (didReceiveMemoryWarning)
//   both     the page's JavaScript heap against its limit, where the browser says (Android's web view)
// (plugins/power-state: the same plugin that says how warm the phone is; none of it leaves the phone)
//
// memory.level: 0 fine, 1 tight, 2 low, 3 critical. It climbs at once and falls one step at a time, after
// 30 s of calmer readings. Whoever holds something that can be made again listens with onMemory(fn):
//   the feed     keeps fewer cards behind and ahead of the one on screen (src/main.js)
//   the 3D kit   draws at its first resolution step at once (critical: the second) and a tier lower from the
//                next round, as when the phone is hot
//   the bakes    lets go of the textures it read back from the phone's storage (read back once memory is fine)
//   crash reports  say "(memory was low)" for a close that came while it was (src/perf.js)
// The frame lab shows the level and the free memory, and its memory(level) acts as if memory were short.
// Engine only: games get nothing from here (they see a lighter picture, and that is all).
import { powerPlugin as plugin } from './power.js';

export const memory = {
  level: 0, why: '',
  known: false,          // something has been read from the phone (or the heap)
  total: null, avail: null, threshold: null, low: false,   // the phone's numbers in bytes (Android; iPhone: total)
  trim: 0, trimAt: 0,    // Android's last trim warning (5 moderate, 10 low, 15 critical while in front; 40+ in the background)
  warnAt: 0, warns: 0,   // iPhone's last memory warning (ms since 1970), and how many came close together
  heap: null, heapLimit: null,   // the page's JavaScript heap, where the browser says
  at: 0,                 // when it was last read (ms since 1970)
};
export const LEVELS = ['fine', 'tight', 'low', 'critical'];

const listeners = new Set();
/** fn(level, was) whenever memory.level changes. Returns a function that stops it. */
export function onMemory(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const EVERY = 5000, CALM = 30000;
let calmSince = 0, timer = null;

/**
 * The level these readings call for, and why, in words ({ level, why }). Pure (tests).
 * m: memory's fields; now: ms since 1970.
 */
export function judge(m, now) {
  let level = 0, why = '';
  const up = (l, w) => { if (l > level) { level = l; why = w; } };
  // Android: free memory against the line where it starts closing apps
  if (m.avail > 0 && m.threshold > 0) {
    const r = m.avail / m.threshold;
    if (m.low) up(3, 'the phone says memory is low');
    else if (r < 1.6) up(2, 'the phone is near the line where it closes apps');
    else if (r < 2.5) up(1, 'the phone has little memory free');
  }
  // Android's trim warnings while in front (5, 10, 15), for a while after each (20 and up are for an app
  // in the background, which lets go of its cards anyway)
  const ago = now - (m.trimAt || 0), t = m.trim < 20 ? m.trim : 0;
  if (t >= 15 && ago < 20000) up(3, 'the phone warned memory is critical');
  else if (t >= 10 && ago < 30000) up(2, 'the phone warned memory is low');
  else if (t >= 5 && ago < 60000) up(1, 'the phone warned memory is getting short');
  // iPhone's warning: low for a while after one, critical if a second came soon after the first
  const w = now - (m.warnAt || 0);
  if (w < 20000) up(m.warns >= 2 ? 3 : 2, m.warns >= 2 ? 'the phone warned twice that memory is low' : 'the phone warned memory is low');
  else if (w < 90000) up(1, 'the phone warned memory was low not long ago');
  // the page's own heap
  if (m.heap > 0 && m.heapLimit > 0) {
    const h = m.heap / m.heapLimit;
    if (h > .9) up(3, 'the page’s memory is nearly full');
    else if (h > .8) up(2, 'the page’s memory is getting full');
    else if (h > .7) up(1, 'the page is using a lot of memory');
  }
  return { level, why };
}

/** Takes in a reading (the plugin's get(), or a warning) and moves the level. Exported for tests (now). */
export function read(o, now = Date.now()) {
  const m = memory, x = o?.mem;
  if (x) {
    if (x.total > 0) m.total = x.total;
    if (x.avail >= 0) m.avail = x.avail; if (x.threshold >= 0) m.threshold = x.threshold;
    m.low = !!x.low;
    if (x.trimAt > m.trimAt) { m.trim = x.trim | 0; m.trimAt = x.trimAt; }
    if (x.warnAt > m.warnAt) { m.warns = now - m.warnAt < 60000 ? (m.warns || 1) + 1 : 1; m.warnAt = x.warnAt; }
    m.known = true;
  }
  const pm = typeof performance !== 'undefined' ? performance.memory : null;
  if (pm?.jsHeapSizeLimit) { m.heap = pm.usedJSHeapSize; m.heapLimit = pm.jsHeapSizeLimit; m.known = true; }
  m.at = now;
  const j = judge(m, now);
  // up at once; down one step after a calm spell
  let next = m.level;
  if (j.level > m.level) { next = j.level; calmSince = now; m.why = j.why; }
  else if (j.level < m.level) { if (!calmSince) calmSince = now; if (now - calmSince >= CALM) { next = m.level - 1; calmSince = now; if (j.level === next) m.why = j.why; } }
  else { calmSince = now; if (j.why) m.why = j.why; }
  if (next !== m.level) set(next);
  return m.level;
}

function set(level) {
  const was = memory.level; memory.level = level; if (!level) memory.why = '';
  if (level > was) console.info(`[memory] ${LEVELS[level]}: ${memory.why}`);
  for (const fn of [...listeners]) try { fn(level, was); } catch (e) { console.warn('[memory]', e); }
}

/** Tests and the frame lab: force a level (null: back to the readings). */
export function forceMemory(level) {
  if (level == null) { calmSince = 0; const j = judge(memory, Date.now()); set(j.level); return; }
  memory.why = 'set by hand'; set(Math.max(0, Math.min(3, level | 0)));
}

async function ask() {
  let o = null;
  try { if (plugin) o = await plugin.get(); } catch (_) { /* an app from before the memory guard: the heap is all */ }
  read(o);
}

function start() {
  if (timer || typeof document === 'undefined') return;
  ask(); timer = setInterval(() => { if (document.visibilityState === 'visible') ask(); }, EVERY);
  // the phone's warnings come at once (Android's trim callback, iPhone's memory warning)
  try { plugin?.addListener('memory', () => ask()); } catch (_) { /* older app */ }
}
start();
