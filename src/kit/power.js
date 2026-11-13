// Battery and heat, for frame generation's power saving (src/kit/speed.js fgSaving): how warm the phone
// is (Android's thermal status and headroom, iPhone's thermal state: plugins/power-state), whether its
// own power saving mode is on, and the battery (Capacitor Device). Asked every 15 s while the app is in
// front; none of it leaves the phone. On the web only the battery is known, where the browser says.
//
//   power.saving   true while the phone is warm, in power saving, or under 20% and not charging
//   power.why      which, in words for Settings ('the phone is warm', 'battery saver is on', 'the battery is low')
//   power.heat     0 cool, 1 warm, 2 hot
//   power.thermal, power.headroom   the raw readings (null where unknown), for the frame lab
//   power.known    the battery has been read at least once (games see it through gs.real.battery())
import { Capacitor, registerPlugin } from '@capacitor/core';

export const power = { heat: 0, saver: false, level: 1, charging: true, known: false, saving: false, why: '', thermal: null, headroom: null };

const native = Capacitor.isNativePlatform();
const plugin = native && Capacitor.isPluginAvailable('PowerState') ? registerPlugin('PowerState') : null;
/** The PowerState plugin (null off the phone), shared with the memory guard (src/kit/memory.js): a plugin is registered once. */
export const powerPlugin = plugin;
// once saving, keep at it a minute after the last reason went, so it doesn't flip back and forth
const HOLD = 60000, EVERY = 15000;
let lastReason = 0, timer = null;

/** Android: thermal status 0 none .. 6 shutdown, headroom (1 = throttling soon) or -1; iPhone: thermal state 0 nominal .. 3 critical. */
export function heatOf(o) {
  if (!o) return 0;
  if (o.platform === 'ios') return o.thermal >= 2 ? 2 : o.thermal >= 1 ? 1 : 0;
  const h = o.headroom >= 0 ? o.headroom : 0;
  return o.thermal >= 3 || h >= 1 ? 2 : o.thermal >= 2 || h >= .85 ? 1 : 0;
}

/** Works out power.saving from what was read (exported for tests). */
export function judge(p, now) {
  const why = p.heat >= 1 ? 'the phone is warm' : p.saver ? 'battery saver is on' : p.level <= .2 && !p.charging ? 'the battery is low' : '';
  if (why) { lastReason = now; p.why = why; p.saving = true; }
  else if (p.saving && now - lastReason > HOLD) { p.saving = false; p.why = ''; }
  return p.saving;
}

async function ask() {
  try {
    if (plugin) { const o = await plugin.get(); power.heat = heatOf(o); power.saver = !!o.saver; power.thermal = o.thermal ?? null; power.headroom = o.headroom ?? null; }
  } catch (_) { /* an older app without the plugin: heat unknown */ }
  try {
    if (native) {
      const { Device } = await import('@capacitor/device'); const b = await Device.getBatteryInfo();
      if (typeof b.batteryLevel === 'number') { power.level = b.batteryLevel; power.known = true; } power.charging = b.isCharging !== false;
    } else if (typeof navigator !== 'undefined' && navigator.getBattery) {
      const b = await navigator.getBattery(); power.level = b.level; power.charging = b.charging; power.known = true;
    }
  } catch (_) { /* no battery reading here */ }
  judge(power, Date.now());
}

function start() {
  if (timer || typeof document === 'undefined') return;
  ask(); timer = setInterval(() => { if (document.visibilityState === 'visible') ask(); }, EVERY);
}
start();
