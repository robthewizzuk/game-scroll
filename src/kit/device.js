// Phone features for games: haptics, tilt, shake, compass, microphone and camera.
// (Location is api.location() in make(api): see src/geo.js.)
// Everything degrades gracefully: on web/desktop or when permission is refused, calls are no-ops
// or return null, so every game must also be playable by touch alone.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { PitchDetector } from 'pitchy';
import { store } from '../util.js';
import { register, onRelease } from './cleanup.js';

const native = Capacitor.isNativePlatform();

/* ---------- haptics ---------- */
// The player's haptics settings (the Sound & haptics sheet): on/off and strength 'light' | 'normal' |
// 'strong'. Games don't get this object; haptic(), buzz() and canBuzz() follow it.
const STRENGTHS = ['light', 'normal', 'strong'];
export const hapticSettings = {
  on: store.get('gs_haptics', true),
  strength: STRENGTHS.includes(store.get('gs_haptic_strength', 'normal')) ? store.get('gs_haptic_strength', 'normal') : 'normal',
};
/** Change and save haptics settings, e.g. setHaptics({ strength: 'strong' }). */
export function setHaptics(patch) {
  Object.assign(hapticSettings, patch);
  if (!hapticSettings.on) stopBuzz();
  if (!STRENGTHS.includes(hapticSettings.strength)) hapticSettings.strength = 'normal';
  store.set('gs_haptics', !!hapticSettings.on); store.set('gs_haptic_strength', hapticSettings.strength);
}
const VIBE = { tick: 8, light: 12, medium: 22, heavy: 40, success: [15, 60, 25], warning: [30, 50, 30], error: [60, 40, 90] };
// A computer with a controller (a ROG Ally, a Steam Deck) has no vibration of its own: the controller rumbles instead
// (src/kit/gamepad.js sets pad(strength 0..1, ms) once loaded; it shakes only while a controller is connected).
export const hapticHooks = { pad: null };
const PAD_FEEL = { tick: [.12, 14], light: [.25, 22], medium: [.45, 32], heavy: [.8, 48], success: [.4, 70], warning: [.55, 80], error: [.75, 120] };
const STEPS = ['tick', 'light', 'medium', 'heavy'];
const SCALE = { light: .5, normal: 1, strong: 1.7 };
/** The kind of tap to play once the strength setting is applied (one step softer or harder). */
function shifted(kind) {
  const st = hapticSettings.strength, i = STEPS.indexOf(kind);
  if (st === 'normal') return kind;
  if (i >= 0) return STEPS[Math.max(0, Math.min(3, i + (st === 'strong' ? 1 : -1)))];
  // success / warning / error: a soft single tap on light, the normal pattern on strong
  return st === 'light' ? 'light' : kind;
}
export function haptic(kind = 'light') {
  if (!hapticSettings.on) return;
  kind = shifted(kind);
  try {
    if (native) {
      if (kind === 'tick') return Haptics.selectionChanged();
      if (kind === 'success' || kind === 'warning' || kind === 'error') return Haptics.notification({ type: { success: NotificationType.Success, warning: NotificationType.Warning, error: NotificationType.Error }[kind] });
      return Haptics.impact({ style: { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy }[kind] || ImpactStyle.Light });
    }
    const v = VIBE[kind] ?? 15, k = SCALE[hapticSettings.strength];
    navigator.vibrate?.(Array.isArray(v) ? v.map((ms, j) => j % 2 ? ms : Math.round(ms * k)) : Math.round(v * k));
    if (hapticHooks.pad) { const [st, ms] = PAD_FEEL[kind] || PAD_FEEL.light; hapticHooks.pad(Math.min(1, st * k), ms); }
  } catch { /* no haptics here */ }
}

/** Play a pattern of short (0) and long (1) buzzes. Returns its length in ms. On iPhones a long buzz
 *  is a quick run of taps, since iOS ignores vibration lengths. */
// Pending taps of a buzz() pattern, so leaving the game, pausing or turning haptics off stops them.
const buzzing = new Set();
function stopBuzz() {
  for (const t of buzzing) clearTimeout(t);
  buzzing.clear();
  if (!native) try { navigator.vibrate?.(0); } catch { /* none */ }
  if (rich && richPlaying) { richPlaying = false; try { rich.stop(); } catch { /* none */ } }
}
export function buzz(pattern, short = 90, long = 380, gap = 220) {
  let at = 0;
  const style = { light: ImpactStyle.Medium, normal: ImpactStyle.Heavy, strong: ImpactStyle.Heavy }[hapticSettings.strength];
  for (const p of pattern) {
    const d = p ? long : short;
    if (native && hapticSettings.on) for (let k = 0; k < d; k += 45) {
      const t = setTimeout(() => { buzzing.delete(t); if (hapticSettings.on) try { Haptics.impact({ style }); } catch { /* none */ } }, at + k);
      buzzing.add(t);
    }
    at += d + gap;
  }
  if (!native && hapticSettings.on) { const seq = []; pattern.forEach((p, i) => { seq.push(p ? long : short); if (i < pattern.length - 1) seq.push(gap); }); try { navigator.vibrate?.(seq); } catch { /* none */ } }
  // (a controller: each buzz of the pattern as a rumble of its length)
  if (!native && hapticSettings.on && hapticHooks.pad) {
    let t = 0;
    for (const p of pattern) { const d = p ? long : short, at = t; const h = setTimeout(() => { buzzing.delete(h); if (hapticSettings.on) hapticHooks.pad?.(p ? .7 : .45, d); }, at); buzzing.add(h); t += d + gap; }
  }
  return at;
}
/** Can this device vibrate at all (and has the player left haptics on)? Games show a fallback if not. */
export function canBuzz() { return hapticSettings.on && (native || typeof navigator.vibrate === 'function'); }

/* ---------- rich haptics: patterns with strength and sharpness ---------- */
// Feel that changes over time, like a console controller's rumble but finer: a heartbeat, an engine
// that revs, a charge that builds, rain on a roof. Each event is a tap (no len) or a buzz (len in
// seconds), with strength and sharpness 0..1 (sharp = crisp click, soft = deep thud) and, for buzzes,
// `to`: the strength it fades or swells to by its end. at: seconds from now, so a pattern can be
// lined up with a sound started at the same moment.
//   hapticPattern([{ at: 0, strength: 1, sharpness: .9 }, { at: .12, len: .4, strength: .8, to: 0, sharpness: .2 }]);
//   hapticPattern('heartbeat');  hapticPattern('charge', { len: 1.5 });  hapticPattern('engine', { len: .6, strength: .5 });
// On iPhones this is Core Haptics, on Android the vibrator's amplitude control and haptic primitives
// (plugins/rich-haptics). Phones without them get the closest thing: quick taps, or plain buzzes.
// The player's haptics setting applies (off: nothing; light / strong: softer / harder).
const rich = native && Capacitor.isPluginAvailable('RichHaptics') ? registerPlugin('RichHaptics') : null;
let richPlaying = false;
const ok01 = v => Math.max(0, Math.min(1, +v || 0));
/** Ready-made patterns: hapticPattern(name, { len, strength }). */
export const HAPTICS = Object.freeze({
  tap: () => [{ at: 0, strength: .8, sharpness: .8 }],
  thud: () => [{ at: 0, strength: 1, sharpness: .1 }, { at: 0, len: .08, strength: .7, to: 0, sharpness: .1 }],
  heartbeat: () => [{ at: 0, strength: .9, sharpness: .2 }, { at: .16, strength: .6, sharpness: .2 }],
  explosion: (o) => [{ at: 0, strength: 1, sharpness: .7 }, { at: 0, len: o.len ?? .6, strength: 1, to: 0, sharpness: .15 }],
  charge: (o) => [{ at: 0, len: o.len ?? 1, strength: .1, to: 1, sharpness: .4 }, { at: o.len ?? 1, strength: 1, sharpness: 1 }],
  engine: (o) => { const n = Math.max(1, Math.round((o.len ?? .6) / .05)); return Array.from({ length: n }, (_, i) => ({ at: i * .05, strength: .5 + .5 * (i % 2), sharpness: .3 })); },
  rain: (o) => { const n = Math.max(1, Math.round((o.len ?? 1) * 14)); return Array.from({ length: n }, () => ({ at: Math.random() * (o.len ?? 1), strength: .2 + Math.random() * .4, sharpness: .9 })); },
  rumble: (o) => [{ at: 0, len: o.len ?? .5, strength: 1, sharpness: 0 }],
  success: () => [{ at: 0, strength: .6, sharpness: .8 }, { at: .1, strength: 1, sharpness: 1 }],
  fail: () => [{ at: 0, len: .25, strength: 1, to: .2, sharpness: .1 }],
});
/**
 * Plays a haptic pattern: a list of events or the name of a ready-made one in HAPTICS (with
 * options { len, strength }: strength scales the whole pattern). Up to 64 events within 10 seconds.
 * A new pattern replaces one still playing. Returns its length in seconds.
 */
export function hapticPattern(events, o = {}) {
  if (typeof events === 'string') events = HAPTICS[events]?.(o) || [];
  if (!Array.isArray(events) || !hapticSettings.on) return 0;
  const k = { light: .55, normal: 1, strong: 1.4 }[hapticSettings.strength] * (o.strength ?? 1);
  const list = events.slice(0, 64).map(e => {
    const len = Math.max(0, Math.min(10, +e.len || 0)), ev = { at: Math.max(0, Math.min(10, +e.at || 0)), len, strength: ok01((e.strength ?? 1) * k), sharpness: ok01(e.sharpness ?? .5) };
    if (len && e.to != null) ev.to = ok01(e.to * k);
    return ev;
  });
  const end = list.reduce((m, e) => Math.max(m, e.at + e.len), 0);
  if (!list.length) return 0;
  stopBuzz();
  if (rich) {
    richPlaying = true;
    rich.play({ events: list }).then(r => { if (!r?.played && hapticSettings.on) fallbackPattern(list); }, () => fallbackPattern(list));
    const t = setTimeout(() => { buzzing.delete(t); richPlaying = false; }, end * 1000 + 50); buzzing.add(t);
    return end;
  }
  fallbackPattern(list);
  return end;
}
/** Stops a pattern (and any buzz()) still playing. */
export function stopHaptics() { stopBuzz(); }
function fallbackPattern(list) {
  if (native) {
    // quick taps: one for each tap event, a run of them through each buzz, harder for stronger
    const tapAt = (ms, s) => { if (s < .08) return; const t = setTimeout(() => { buzzing.delete(t); if (hapticSettings.on) try { Haptics.impact({ style: s > .7 ? ImpactStyle.Heavy : s > .35 ? ImpactStyle.Medium : ImpactStyle.Light }); } catch { /* none */ } }, ms); buzzing.add(t); };
    for (const e of list) {
      if (!e.len) { tapAt(e.at * 1000, e.strength); continue; }
      for (let q = 0; q < e.len; q += .045) tapAt((e.at + q) * 1000, e.strength + ((e.to ?? e.strength) - e.strength) * (q / e.len));
    }
    return;
  }
  if (typeof navigator.vibrate !== 'function') return;
  // web: on/off only, so strength becomes how much of each 20 ms slice is buzzing
  const end = list.reduce((m, e) => Math.max(m, e.at + Math.max(e.len, .03)), 0), n = Math.ceil(end / .02), amp = new Float32Array(n);
  for (const e of list) {
    const a = Math.floor(e.at / .02), b = Math.min(n, Math.ceil((e.at + Math.max(e.len, .03)) / .02));
    for (let i = a; i < b; i++) { const f = b - a > 1 ? (i - a) / (b - a - 1) : 0; amp[i] = Math.max(amp[i], e.len ? e.strength + ((e.to ?? e.strength) - e.strength) * f : e.strength); }
  }
  const seq = []; let wait = 0;
  for (let i = 0; i < n; i++) { const on = Math.round(amp[i] * 20); if (on < 3) { wait += 20; continue; } seq.push(wait, on); wait = 20 - on; }
  if (seq.length) try { navigator.vibrate(seq); } catch { /* none */ }
}

/* ---------- permissions that need a user gesture (iOS motion) ---------- */
// Games call want('motion') when created; the request fires on the player's next tap (the Play tap).
const wanted = new Set(); let motionAllowed = null;
export function want(feature) { wanted.add(feature); }
async function onGesture() {
  if (wanted.has('motion') && motionAllowed === null) {
    try {
      const req = window.DeviceMotionEvent?.requestPermission, req2 = window.DeviceOrientationEvent?.requestPermission;
      if (req) { const r = await req(); motionAllowed = r === 'granted'; if (req2) await req2(); } else motionAllowed = true;
    } catch { motionAllowed = false; }
    if (motionAllowed) startSensors();
  }
}
// Sensors run only while a game reads them: the first tilt() / onShake() / heading()... switches them
// on (that reading is still null, as before any sensor event), and they switch off when the app is
// hidden or the player leaves the game. Tap-only games never wake them.
let lastNeed = 0;
function need() { lastNeed = performance.now(); if (motionAllowed && !sensorsOn && !globalThis.document?.hidden) startSensors(); }
addEventListener('pointerup', onGesture, true);

/* ---------- motion sensors: tilt, shake, compass ---------- */
const tiltState = { x: 0, y: 0, ok: false, base: null }, raw = { alpha: null, beta: 0, gamma: 0, t: 0, absT: -1e9, abs: false };
let headingDeg = null, lastAcc = null; const shakeCbs = new Set(); let lastShake = 0, sensorsOn = false;
function startSensors() {
  if (sensorsOn) return; sensorsOn = true;
  addEventListener('deviceorientation', onOrient);
  addEventListener('deviceorientationabsolute', onOrientAbs);
  addEventListener('devicemotion', onDevMotion);
}
function stopSensors() {
  if (!sensorsOn) return; sensorsOn = false;
  removeEventListener('deviceorientation', onOrient);
  removeEventListener('deviceorientationabsolute', onOrientAbs);
  removeEventListener('devicemotion', onDevMotion);
  tiltState.ok = false; raw.alpha = null; raw.absT = -1e9; lastAcc = null; headingDeg = null;   // no stale readings when they come back
}
function onOrient(e) {
    if (e.beta == null) return;
    tiltState.beta = e.beta;
    // relative readings only when no compass-locked (absolute) ones are coming in: those don't drift
    if (e.alpha != null && performance.now() - raw.absT > 1000) { raw.alpha = e.alpha; raw.beta = e.beta; raw.gamma = e.gamma; raw.t = performance.now(); raw.abs = false; }
    // Use landscape-aware axes so tilt feels right when the phone or an unfolded foldable is sideways.
    const ang = (screen.orientation?.angle ?? window.orientation ?? 0) | 0;
    let x = e.gamma, y = e.beta;
    if (ang === 90) { x = e.beta; y = -e.gamma; } else if (ang === -90 || ang === 270) { x = -e.beta; y = e.gamma; }
    if (!tiltState.base) tiltState.base = { x, y };
    tiltState.x = Math.max(-1, Math.min(1, (x - tiltState.base.x) / 30));
    tiltState.y = Math.max(-1, Math.min(1, (y - tiltState.base.y) / 30));
    tiltState.ok = true;
    if (e.webkitCompassHeading != null) headingDeg = e.webkitCompassHeading;
    else if (e.absolute && e.alpha != null) headingDeg = (360 - e.alpha) % 360;
}
function onOrientAbs(e) {
    if (e.alpha == null) return;
    headingDeg = (360 - e.alpha) % 360;
    // Android: the same orientation but locked to the compass, so "straight ahead" can't slowly drift
    if (e.beta != null) { const now = performance.now(); raw.alpha = e.alpha; raw.beta = e.beta; raw.gamma = e.gamma; raw.t = raw.absT = now; raw.abs = true; }
}
function onDevMotion(e) {
    const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
    if (lastAcc) {
      const jerk = Math.abs(a.x - lastAcc.x) + Math.abs(a.y - lastAcc.y) + Math.abs(a.z - lastAcc.z);
      const now = performance.now();
      if (jerk > 28 && now - lastShake > 250) { lastShake = now; shakeCbs.forEach(cb => cb(jerk)); }
    }
    lastAcc = { x: a.x, y: a.y, z: a.z };
    if (motionCbs.size) {
      const l = e.acceleration, r = e.rotationRate || {};
      const m = { gx: a.x, gy: a.y, gz: a.z, ax: l?.x ?? null, ay: l?.y ?? null, az: l?.z ?? null, ra: r.alpha || 0, rb: r.beta || 0, rg: r.gamma || 0, dt: (e.interval || 16) > 1 ? (e.interval || 16) / 1000 : e.interval, t: performance.now() };
      motionCbs.forEach(cb => cb(m));
    }
}
if (!window.DeviceMotionEvent?.requestPermission) { /* Android/desktop: no prompt needed */ motionAllowed = true; }
globalThis.document?.addEventListener?.('visibilitychange', () => {
  if (document.hidden) stopSensors();
  else if (shakeCbs.size || motionCbs.size || performance.now() - lastNeed < 5000) need();
});

/** Current tilt as {x, y} in -1..1 relative to how the phone was held when play started, or null if no sensor. */
export function tilt() { need(); return tiltState.ok ? { x: tiltState.x, y: tiltState.y } : null; }
/** Make the current phone angle the new "flat". Call from a game's reset(). */
export function calibrateTilt() { tiltState.base = null; }
const motionCbs = new Set();
/**
 * Raw motion readings (kit use: gs.moves turns these into swings, punches and flips). cb gets
 * { gx, gy, gz (m/s² with gravity), ax, ay, az (without gravity, or null), ra, rb, rg (rotation,
 * degrees/s about the phone's z, x and y axes), dt, t }. Returns an unsubscribe function.
 */
export function onMotion(cb) { want('motion'); motionCbs.add(cb); need(); return untilLeft(() => motionCbs.delete(cb)); }
/** Subscribe to shakes; returns an unsubscribe function. */
export function onShake(cb) { shakeCbs.add(cb); need(); return untilLeft(() => shakeCbs.delete(cb)); }
// A subscription made in make() / reset() ends when its card leaves the feed, so a game that never
// unsubscribes doesn't keep the sensors on (and itself in memory) for the rest of the session.
function untilLeft(off) { onRelease(off); return off; }
/** Raw phone orientation for AR (src/kit/ar3d.js): { alpha, beta, gamma } in degrees plus the screen
 *  rotation, or null when there is no live gyro reading. abs: true when it's compass-locked (no drift). */
export function orientation() {
  need();
  if (raw.alpha == null || performance.now() - raw.t > 1500) return null;
  return { alpha: raw.alpha, beta: raw.beta, gamma: raw.gamma, abs: raw.abs, screen: (screen.orientation?.angle ?? window.orientation ?? 0) | 0 };
}
/** Compass heading in degrees (0 = north), or null. */
export function heading() { need(); return headingDeg; }
/** True when the phone is lying screen-down, false when not, null with no sensor. */
export function faceDown() { need(); return tiltState.ok ? Math.abs(tiltState.beta) > 120 : null; }

/* ---------- microphone ---------- */
// Asking for the mic or camera can take a while (the permission prompt). If the game stops it, or the
// player leaves, before the answer comes, the stream is closed as soon as it arrives instead of
// being left running. Both also stop by themselves when a round ends or the player leaves.
let mic = null, micAsk = null, micGen = 0;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/**
 * Start listening. Call from a tap. Resolves to the mic, or null if refused:
 *   level()     how loud, 0..1
 *   pitch()     { hz, note ('A4'), midi (69.2: fractional, for "how in tune"), clarity 0..1 } of a
 *               sung, hummed or whistled note, or null while nothing has a clear pitch
 *   blow()      0..1 how hard the player is blowing on the mic (windy noise, no pitch)
 *   clapped()   true once for each clap (or tap on the phone, or snap) since the last call
 *   whistle()   the pitch in Hz of a whistle (high and pure), or 0
 *   stop()
 * Read them every frame. Pitch uses pitchy (the McLeod pitch method). Always offer a touch way to play.
 */
export function startMic() {
  if (mic) return Promise.resolve(mic);
  if (micAsk) return micAsk;
  const gen = micGen;
  return micAsk = (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (gen !== micGen) { stream.getTracks().forEach(t => t.stop()); return null; }   // stopped while asking
      const ctx = new (window.AudioContext || window.webkitAudioContext)(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
      an.fftSize = 2048; an.smoothingTimeConstant = 0; src.connect(an);
      const wave = new Float32Array(an.fftSize), spec = new Uint8Array(an.frequencyBinCount), detector = PitchDetector.forFloat32Array(an.fftSize);
      detector.minVolumeDecibels = -45;
      const binHz = ctx.sampleRate / an.fftSize;
      let live = true, readAt = -1, avg = .02, lastClap = 0, claps = 0;
      const now = { level: 0, hz: 0, clarity: 0, blow: 0, whistle: 0 };
      // one look at the sound per frame, however many of the readings the game asks for
      function hear() {
        const t = performance.now(); if (!live || t - readAt < 8) return now; readAt = t;
        an.getFloatTimeDomainData(wave); an.getByteFrequencyData(spec);
        let s = 0, peak = 0; for (const v of wave) { s += v * v; peak = Math.max(peak, Math.abs(v)); }
        const rms = Math.sqrt(s / wave.length); now.level = Math.min(1, rms * 4);
        const [hz, clarity] = detector.findPitch(wave, ctx.sampleRate);
        now.hz = clarity > .85 && hz > 60 && hz < 4200 ? hz : 0; now.clarity = now.hz ? clarity : 0;
        // energy below 500 Hz against the rest: blowing is a loud low rumble with no clear pitch
        let lo = 0, all = 0; for (let i = 1; i < spec.length; i++) { all += spec[i]; if (i * binHz < 500) lo += spec[i]; }
        const lowShare = all ? lo / all : 0;
        now.blow = !now.hz && rms > .04 ? Math.min(1, (rms - .04) * 6 * Math.min(1, lowShare * 3)) : now.blow * .7;
        now.whistle = now.hz > 500 && clarity > .9 ? now.hz : 0;
        // a clap: a sudden sharp peak well over the room's usual level, at most about 6 a second
        if (peak > .25 && peak > avg * 6 && t - lastClap > 160 && !now.hz) { claps++; lastClap = t; }
        avg += (Math.min(peak, .5) - avg) * .05;
        return now;
      }
      const m = {
        level() { return live ? hear().level : 0; },
        pitch() {
          const h = live ? hear() : null; if (!h?.hz) return null;
          const midi = 69 + 12 * Math.log2(h.hz / 440), n = Math.round(midi);
          return { hz: h.hz, midi, note: NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1), clarity: h.clarity };
        },
        blow() { return live ? hear().blow : 0; },
        whistle() { return live ? hear().whistle : 0; },
        clapped() { if (!live) return false; hear(); if (!claps) return false; claps--; return true; },
        stop() { if (!live) return; live = false; stream.getTracks().forEach(t => t.stop()); ctx.close(); if (mic === m) mic = null; },
      };
      return mic = m;
    } catch { return null; } finally { micAsk = null; }
  })();
}
export function stopMic() { micGen++; mic?.stop(); }

/* ---------- camera ---------- */
let cam = null, camAsk = null, camGen = 0;
/** Start the back camera. Resolves to { video, stop() } (video is a playing <video>) or null if refused. */
export function startCamera() {
  if (cam) return Promise.resolve(cam);
  if (camAsk) return camAsk;
  const gen = camGen;
  return camAsk = (async () => {
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      const video = document.createElement('video'); video.playsInline = true; video.muted = true; video.srcObject = stream; await video.play();
      if (gen !== camGen) { stream.getTracks().forEach(t => t.stop()); return null; }   // stopped while asking
      let live = true;
      const c = { video, stop() { if (!live) return; live = false; stream.getTracks().forEach(t => t.stop()); if (cam === c) cam = null; } };
      return cam = c;
    } catch { stream?.getTracks().forEach(t => t.stop()); return null; } finally { camAsk = null; }
  })();
}
export function stopCamera() { camGen++; cam?.stop(); }

// Round over or the player left: stop the mic, camera, pending buzzes and (unless a game is still
// subscribed to shakes or moves) the motion sensors. Pausing stops the buzzes.
register('device', {
  stop() { stopMic(); stopCamera(); stopBuzz(); if (!shakeCbs.size && !motionCbs.size) stopSensors(); },
  pause() { stopBuzz(); },
});
