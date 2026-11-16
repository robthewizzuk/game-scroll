// Battery and heat, for frame generation's power saving (src/kit/speed.js fgSaving), the heat model
// (src/kit/heat.js) and the frame lab: how warm the phone is (Android's thermal status and headroom, iPhone's
// thermal state: plugins/power-state), whether its own power saving mode is on, and the battery (Capacitor
// Device; on Android also the battery's current and voltage, so the power it draws). Asked every 15 s while the
// app is in front, every 3 s while a round is played (the heat model wants the headroom often: pace()), and every
// second while the frame lab is open; none of it leaves the phone. On the web only the battery is known, where
// the browser says.
// In the desktop app (src/desktop.js power()) the computer says too: macOS its thermal state (as an iPhone does), macOS
// and Windows how far they slowed the processor, Linux its chips' temperatures (as a headroom, so the heat plan fits it:
// SteamOS on a ROG Ally or a Steam Deck), and whether a laptop is on its battery. A computer has more room than a
// phone, but a fanless laptop (a MacBook Air) warms under minutes of 3D and then slows itself: warm, it takes the
// phone's hot steps (src/kit/hd3d.js hot()); on its battery it plays at most at the high tier and near 60 in Auto.
//
//   power.saving   true while the phone is warm or heating up, in power saving, or under 20% and not charging
//   power.why      which, in words for Settings ('the phone is warm', 'the phone is heating up', 'battery saver is on', 'the battery is low';
//                  'the computer ...' in the desktop app)
//   power.heat     0 cool, 1 warm, 2 hot
//   power.onBattery   the desktop app on a laptop running on its battery (false on a phone: it always is)
//   power.speedLimit  the desktop app: the processor's speed limit in per cent after the system lowered it, or null
//   power.thermal, power.headroom   the raw readings (null where unknown), for the frame lab
//   power.thresholds   Android 15+: the headroom at which each thermal status starts ({ 2: .9, ... }), or null
//   power.watts    what the whole phone draws from its battery now (screen and all), or null (charging, an iPhone, the web)
//   power.batteryTemp   the battery's temperature (degrees C), or null
//   power.known    the battery has been read at least once (games see it through gs.real.battery())
import { Capacitor, registerPlugin } from '@capacitor/core';
import { desktop } from '../desktop.js';

export const power = { heat: 0, saver: false, level: 1, charging: true, known: false, saving: false, why: '', thermal: null, headroom: null, thresholds: null, watts: null, batteryTemp: null, ahead: false, onBattery: false, speedLimit: null };

const native = Capacitor.isNativePlatform();
const plugin = native && Capacitor.isPluginAvailable('PowerState') ? registerPlugin('PowerState') : null;
/** The PowerState plugin (null off the phone), shared with the memory guard (src/kit/memory.js) and the hint sessions (src/kit/perfhint.js): a plugin is registered once. */
export const powerPlugin = plugin;
// once saving, keep at it a minute after the last reason went, so it doesn't flip back and forth
const HOLD = 60000, EVERY = 15000;
let lastReason = 0, timer = null, lastAsk = -1e9, asking = false;
const paces = new Map();   // who wants readings more often: name -> ms between readings
const heard = new Set();   // told after each reading (src/kit/heat.js)

/** Android: thermal status 0 none .. 6 shutdown, headroom (1 = throttling soon) or -1; iPhone: thermal state 0 nominal .. 3 critical. */
export function heatOf(o) {
  if (!o) return 0;
  if (o.platform === 'ios') return o.thermal >= 2 ? 2 : o.thermal >= 1 ? 1 : 0;
  const h = o.headroom >= 0 ? o.headroom : 0;
  return o.thermal >= 3 || h >= 1 ? 2 : o.thermal >= 2 || h >= .85 ? 1 : 0;
}

const THERMAL = { nominal: 0, fair: 1, serious: 2, critical: 3 };
/**
 * A computer's heat from the desktop app's reading (pure: tests): { thermal, limit, headroom } -> { heat, thermal, headroom }.
 * macOS's thermal state as an iPhone's (fair warm, serious and critical hot); a processor slowed below its full speed
 * warm, below three quarters of it hot (Windows says only this); Linux's chip temperatures as a headroom on Android's
 * scale (desktop/device.cjs: .85 warm, 1 hot), which the heat plan (src/kit/heat.js) fits as a phone's. The hottest wins.
 */
export function desktopHeat(d) {
  const t = THERMAL[d?.thermal] ?? null, lim = typeof d?.limit === 'number' && d.limit > 0 ? d.limit : 100;
  const h = typeof d?.headroom === 'number' && d.headroom >= 0 ? d.headroom : null;
  const byT = t >= 2 || lim < 75 ? 2 : t >= 1 || lim < 100 ? 1 : 0, byH = h == null ? 0 : h >= 1 ? 2 : h >= .85 ? 1 : 0;
  return { heat: Math.max(byT, byH), thermal: t, headroom: h };
}
const nounOf = () => (desktop ? 'the computer' : 'the phone');

/**
 * What the phone draws from its battery in watts, from the plugin's battery() (pure: tests), or null. Phones give
 * the current in microamps, some (older Samsungs) in milliamps, and with either sign while draining: a phone draws
 * between about 100 mA and 6 A, so a reading under 20000 is taken as milliamps. Null while charging (the current
 * then goes in, and says nothing about what the game costs).
 */
export function wattsOf(b) {
  if (!b || b.charging || typeof b.current !== 'number' || !b.current || !(b.voltage > 0)) return null;
  let ua = Math.abs(b.current); if (ua < 20000) ua *= 1000;
  let mv = b.voltage; if (mv < 100) mv *= 1000;   // (a phone that says volts)
  const w = ua * 1e-6 * mv * 1e-3;
  return w > 0 && w < 40 ? w : null;
}

/** Works out power.saving from what was read (exported for tests). */
export function judge(p, now) {
  const why = p.heat >= 1 ? `${nounOf()} is warm` : p.ahead ? `${nounOf()} is heating up` : p.saver ? 'battery saver is on' : p.level <= .2 && !p.charging ? 'the battery is low' : '';
  if (why) { lastReason = now; p.why = why; p.saving = true; }
  else if (p.saving && now - lastReason > HOLD) { p.saving = false; p.why = ''; }
  return p.saving;
}

function took(b) {
  if (!b) return;
  power.watts = wattsOf(b); power.batteryTemp = typeof b.temp === 'number' ? b.temp : null; power.battery = b;
}

async function ask() {
  if (asking) return; asking = true; lastAsk = Date.now();
  try {
    if (plugin) {
      const o = await plugin.get(); power.heat = heatOf(o); power.saver = !!o.saver; power.thermal = o.thermal ?? null; power.headroom = o.headroom ?? null;
      power.thresholds = o.thresholds || null; took(o.battery);
    }
    else if (desktop?.power) {
      const d = await desktop.power();
      if (d) { const h = desktopHeat(d); power.heat = h.heat; power.thermal = h.thermal; power.headroom = h.headroom; power.speedLimit = typeof d.limit === 'number' ? d.limit : null; power.onBattery = !!d.battery; }
    }
  } catch (_) { /* an older app without the plugin: heat unknown */ }
  try {
    if (native) {
      const { Device } = await import('@capacitor/device'); const b = await Device.getBatteryInfo();
      if (typeof b.batteryLevel === 'number') { power.level = b.batteryLevel; power.known = true; } power.charging = b.isCharging !== false;
    } else if (typeof navigator !== 'undefined' && navigator.getBattery) {
      const b = await navigator.getBattery(); power.level = b.level; power.charging = b.charging; power.known = true;
    }
  } catch (_) { /* no battery reading here */ }
  asking = false;
  for (const f of heard) try { f(power); } catch (_) { /* the listener's own trouble */ }
  judge(power, Date.now());
}

/** Read more often while `name` wants it (ms between readings; 0 or null: back to the usual 15 s). */
export function pace(name, ms) { if (ms > 0) paces.set(name, ms); else paces.delete(name); }
/** Told after every reading (the heat model). Returns a function that stops it. */
export function onRead(fn) { heard.add(fn); return () => heard.delete(fn); }
/** The phone's word on whether the game is about to make it warm (src/kit/heat.js): one of power.saving's reasons. */
export function heatingUp(on) { if (power.ahead === !!on) return; power.ahead = !!on; judge(power, Date.now()); }

function start() {
  if (timer || typeof document === 'undefined') return;
  ask();
  // (a one-second beat that reads when the quickest wish is due: the plugin keeps its own state, so a reading is cheap)
  timer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    let every = EVERY; for (const ms of paces.values()) every = Math.min(every, ms);
    if (Date.now() - lastAsk >= every - 50) ask();
  }, 1000);
}
start();
