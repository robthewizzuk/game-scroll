// Why the app last closed, on Android. The page itself can only tell that it was not closed tidily
// (the "open" marker in perf.js), which can't tell a crash from the app being swiped away at the
// wrong moment. Android keeps its own record (plugins/app-health): whether the app crashed, ran out
// of memory, stopped responding or was closed by the player, and when. The same plugin says whether
// a test robot is driving the phone (Google Play tries every build on phones of its own).
import { Capacitor, registerPlugin } from '@capacitor/core';

const plugin = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('AppHealth') ? registerPlugin('AppHealth') : null;

/**
 * Asks the phone: { robot, known, exits: [{ at, reason, status, importance, what }], web } (see
 * AppHealthPlugin.java), or null where there is nothing to ask (iPhone, the web, an older app).
 * since: only what ended after this time (milliseconds since 1970).
 */
export async function appHealth(since = 0) {
  if (!plugin) return null;
  try { return await Promise.race([plugin.get({ since }), new Promise(r => setTimeout(() => r(null), 4000))]); } catch (_) { return null; }
}

// Android's exit reasons that can be a fault, in words. The others are not faults: 1 the app exited
// by itself, 8 a permission changed, 10 the player closed it (swiped it away, or Force stop),
// 11 that user was signed out, 14 frozen, 15 and 16 the app was changed or updated.
const WHY = {
  2: 'killed by the system',
  3: 'the phone ran out of memory',
  4: 'the app crashed',
  5: 'native code crashed',
  6: 'the app stopped responding',
  7: 'the app failed to start',
  9: 'the system said it used too much',
  12: 'something it depends on stopped',
  13: 'closed by the system',
};
const ALWAYS = new Set([4, 5, 6, 7]);   // faults wherever the app was; the rest only count on screen
const ON_SCREEN = 200;                  // ActivityManager's importance: 100 in front, 200 visible, 400 kept in the background

/**
 * Is one of the phone's exit records worth a crash report, and how is it worded?
 * x: the record; was: the open marker of that session ({ game, ver, playing, at }) or null when the
 * app had gone to the background; web: the web view's own note ({ at, crashed }) or null.
 * Gives null (closed on purpose, or let go of quietly in the background), or
 * { game, ver, msg, place, at } with at in seconds since 1970: when it really happened.
 */
export function judgeExit(x, was, web) {
  const why = x && WHY[x.reason];
  if (!why || !(x.at > 0)) return null;
  // The marker is that session's if nothing has replaced it since: the app ended after it was written.
  const mine = !!was && x.at >= was.at - 2000;
  const front = mine || (x.importance > 0 && x.importance <= ON_SCREEN);
  if (!front && !ALWAYS.has(x.reason)) return null;
  // The games are drawn by the web view, in a process of its own. When that goes the app is closed
  // too, and Android's reason for the app is only "killed" or "native crash": the note says which.
  const view = web && Math.abs(web.at - x.at) < 10000;
  const reason = view ? (web.crashed ? 'the web view crashed' : 'the web view was killed, usually for memory')
    : x.reason === 2 && x.status ? `${why} (signal ${Math.floor(x.status)})` : why;
  // The system's own short note, without the numbers that differ every time.
  const note = String(x.what || '').replace(/[^\x20-\x7e]/g, '').split(/[:;({]/)[0].replace(/\d+/g, '#').trim().slice(0, 40);
  return {
    game: mine ? was.game || '' : '', ver: mine ? was.ver || '' : '',
    msg: `App closed ${!front ? 'in the background' : mine && was.playing ? 'while playing' : 'while open'}: ${reason}`,
    place: note ? 'android: ' + note : '', at: Math.floor(x.at / 1000),
  };
}
