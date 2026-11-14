// The phone and driver steering list: a phone, graphics chip, driver or browser that misbehaves with a part of the
// engine gets that part turned off on it, and nowhere else. Unity 6.6 calls this device filtering. The rules are
// drawn from the crash and stutter reports (docs/crash-reports.md, "Chips and phones to steer"), kept in the repo
// (src/steer-list.js), built into the app, and sent out in the catalogue too (scripts/build-games.mjs puts them in
// manifest.json, signed with it once the signing key is set: scripts/sign-catalogue.mjs), so a new rule reaches
// phones with the next catalogue instead of the next app. The catalogue's list replaces the built-in one, and takes
// effect the next time the app starts (what the device is made with is chosen at start).
//
// A rule: { id, why, when: {...}, do: {...} }. Every field of when that is given must match (a list: any of its
// items); a rule with no when matches nothing.
//   platform  'android' | 'ios' | 'mac' | 'windows' | 'linux' | 'web'
//   model     a pattern (a regular expression, case ignored) for the phone model as the phone names it ('^SM-F9\d\dB$',
//             '^iPhone1[45],'); on a computer, its graphics chip ('NVIDIA GeForce RTX 30')
//   chip      a pattern for the graphics chip as WebGL names it ('Adreno \(TM\) 6\d\d', 'Mali-G7[12]', 'Intel.*UHD'),
//             also tried on the WebGPU adapter's vendor and architecture ('qualcomm adreno-6xx', 'intel gen-12lp')
//   os        a version range for the system ('<14', '>=13 <15', '17.2' = 17.2 and its updates)
//   engine    the browser engine and a range ('Chrome <130', 'Safari 26'): Android's web view, the iPhone's, the
//             desktop app's Chrome, a browser's
//   driver    a version range for the graphics driver (Mac and PC, read by the desktop app: '<31.0.101.5186')
//   app       a range for the app's build number ('<420': builds before 1.0.420)
//   game      a game id or a list of them: the knobs hold for those games only (hide: those games are not shown)
// do: the knobs (src/kit/steering.js): { webgpu: false, hdr: false, klass: 'mid', tier: 1, fps: 60, frameGen: false,
//   traced: false, half: false, pack: false, hide: true }.
// node scripts/steer.mjs checks the list (the PR check runs it) and says what each rule would match.
import { STEER, resetSteer } from './kit/steering.js';
import { gpuName } from './kit/gpu.js';
import { desktop } from './desktop.js';
import BUILT_IN from './steer-list.js';

export const KNOBS = { webgpu: 'bool', hdr: 'bool', klass: ['mid', 'low'], tier: [0, 1, 2, 3], fps: 'num', frameGen: 'bool', traced: 'bool', half: 'bool', pack: 'bool', hide: 'bool' };
export const WHEN = ['platform', 'model', 'chip', 'os', 'engine', 'driver', 'app', 'game'];
export const PLATFORMS = ['android', 'ios', 'mac', 'windows', 'linux', 'web'];

// versions: '1.2.3' -> [1, 2, 3]
const parts = v => String(v ?? '').split(/[^\d]+/).filter(Boolean).map(Number);
function cmp(a, b) { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d < 0 ? -1 : 1; } return 0; }
/** Does version v fall in range r ('<14', '>=13 <15', '17.2': that version and its updates)? An unknown version matches no range. */
export function inRange(v, r) {
  const have = parts(v); if (!have.length) return false;
  for (const t of String(r).trim().split(/\s+/)) {
    const m = /^(<=|>=|<|>|=)?(.+)$/.exec(t); if (!m) return false;
    const want = parts(m[2]); if (!want.length) return false;
    const c = cmp(have, want), op = m[1] || '^';
    if (op === '^' ? cmp(have.slice(0, want.length), want) !== 0 : op === '<' ? c >= 0 : op === '<=' ? c > 0 : op === '>' ? c <= 0 : op === '>=' ? c < 0 : c !== 0) return false;
  }
  return true;
}
const list = v => Array.isArray(v) ? v : [v];
const pattern = p => { try { return new RegExp(p, 'i'); } catch (_) { return null; } };
/** Whether a rule's when matches this device (facts: { platform, model, chip, adapter, os, engine, driver, app }). Gives false for a rule with no when. */
export function matches(when, f) {
  if (!when || typeof when !== 'object' || !Object.keys(when).some(k => k !== 'game')) return false;
  for (const [k, w] of Object.entries(when)) {
    if (k === 'game') continue;
    const any = list(w).some(x => {
      if (k === 'platform') return f.platform === x;
      if (k === 'model') return !!f.model && !!pattern(x)?.test(f.model);
      if (k === 'chip') { const re = pattern(x); return !!re && (re.test(f.chip || '') && !!f.chip || re.test(f.adapter || '') && !!f.adapter); }
      if (k === 'engine') { const m = /^\s*(\w+)\s*(.*)$/.exec(String(x)), e = /^(\w+)\s+(\d+)/.exec(f.engine || ''); return !!m && !!e && e[1].toLowerCase() === m[1].toLowerCase() && (!m[2] || inRange(e[2], m[2])); }
      if (k === 'os' || k === 'driver' || k === 'app') return inRange(f[k], x);
      return false;   // (a field this app doesn't know: the rule is for a newer app)
    });
    if (!any) return false;
  }
  return true;
}
/** Puts what the rules that match say into knobs (STEER's shape); gives the ids that matched. */
export function steerWith(rules, f, into = STEER) {
  const ids = [];
  for (const r of Array.isArray(rules) ? rules : []) {
    if (!r || !r.do || typeof r.do !== 'object' || !matches(r.when, f)) continue;
    const games = r.when.game ? list(r.when.game).filter(g => typeof g === 'string') : null;
    for (const [k, v] of Object.entries(r.do)) {
      if (!ok(k, v) || (k === 'hide' && !games)) continue;
      for (const g of games || [null]) {
        const t = g ? (into.games.get(g) || (into.games.set(g, {}), into.games.get(g))) : into;
        t[k] = k === 'tier' || k === 'fps' ? Math.min(t[k] ?? v, v) : k === 'klass' ? (t[k] === 'low' || v === 'low' ? 'low' : v) : v;
      }
    }
    ids.push(String(r.id || '?'));
  }
  into.rules = ids;
  return ids;
}
// a knob and a value this app understands
function ok(k, v) {
  const t = KNOBS[k];
  if (!t) return false;
  if (t === 'bool') return v === false || (k === 'hide' && v === true);
  if (t === 'num') return typeof v === 'number' && v >= 24;
  return t.includes(v);
}

/* ---------- this device ---------- */
const FACTS = { platform: '', model: '', chip: '', adapter: '', os: '', engine: '', driver: '', app: '' };
// the app's build number from its label ('1.0.412 abc1234' -> '412')
const buildNo = b => (/^\d+\.\d+\.(\d+)/.exec(String(b || '')) || [])[1] || '';
/** What the rules are matched against on this device (read at start; tests). */
export const steerFacts = () => ({ ...FACTS });
// the facts a rule can ask about; whatever takes too long is left out (no rule that needs it matches)
async function facts(build, engine) {
  let platform = 'web';
  try { const { Capacitor } = await import('@capacitor/core'); platform = Capacitor.getPlatform(); } catch (_) { /* a browser */ }
  if (desktop) platform = desktop.os;
  Object.assign(FACTS, { platform, chip: gpuName(), engine, app: buildNo(build) });
  const late = (p, ms) => Promise.race([p, new Promise(ok => setTimeout(ok, ms))]);
  await Promise.all([
    late((async () => { const { Device } = await import('@capacitor/device'); const d = await Device.getInfo(); FACTS.model = String(d.model || ''); FACTS.os = String(d.osVersion || ''); })().catch(() => {}), 800),
    late((async () => { const a = await navigator.gpu?.requestAdapter?.(); const i = a?.info; if (i) FACTS.adapter = [i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(' '); })().catch(() => {}), 800),
    late((async () => { const g = await desktop?.gpuInfo?.(); if (g) { FACTS.driver = String(g.driverVersion || ''); if (!FACTS.model) FACTS.model = String(g.name || ''); } })().catch(() => {}), 800),
  ]);
  if (desktop && FACTS.chip) FACTS.model = FACTS.model || FACTS.chip;
}

let lastList = null;
/**
 * The app, at start: match the list (the saved catalogue's, else the one built in) to this device and set the
 * kits' knobs. Gives a promise the 3D kit waits for before it makes its device (at most about a second).
 * list: the catalogue's rules (null: none saved yet). build: the app's build label; engine: perf.js engine().
 */
export function startSteer(list, build, engine) {
  lastList = Array.isArray(list) ? list : BUILT_IN;
  return STEER.ready = facts(build, engine).catch(() => {}).then(() => {
    resetSteer(); const ready = STEER.ready;
    steerWith(lastList, FACTS);
    STEER.ready = ready;
    if (STEER.rules.length) console.info('[steer] rules for this device: ' + STEER.rules.join(', '));
    return STEER;
  });
}
/** What the list did on this device: the rules that matched, the knobs, the facts (tests, the QA panel). */
export function steerState() {
  const knobs = {}; for (const k of Object.keys(KNOBS)) if (k !== 'hide' && STEER[k] !== (k === 'klass' || k === 'tier' || k === 'fps' ? null : true)) knobs[k] = STEER[k];
  return { rules: [...STEER.rules], knobs, games: Object.fromEntries(STEER.games), facts: steerFacts(), from: lastList === BUILT_IN ? 'app' : 'catalogue' };
}
