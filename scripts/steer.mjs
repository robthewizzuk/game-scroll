// Checks the phone and driver steering list (src/steer-list.js; how it works: src/steer.js) and says what each rule
// would match. The PR check runs it.
//   node scripts/steer.mjs                  check the list: fields, knobs, patterns, ranges, ids
//   node scripts/steer.mjs --try k=v ...    which rules a device with these facts gets, and the knobs they set
//                                           (platform, model, chip, adapter, os, engine, driver, app; e.g.
//                                           --try platform=android chip="Adreno (TM) 650" engine="Chrome 131")
//   node scripts/steer.mjs --file x.json    check another list (the catalogue's steer, a rule being drafted)
// Exit 1 on a rule the app would not understand: a misspelt field or knob does nothing on a phone, silently.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const fileAt = args.indexOf('--file');
// steer.js reaches the kits and the page (gpu.js, Capacitor); the matching itself is plain, so it is loaded with stubs
globalThis.document ??= { createElement: () => ({ getContext: () => null }) };
const { matches, steerWith, inRange, KNOBS, WHEN, PLATFORMS } = await import('../src/steer.js').catch(async e => {
  console.error('steer.js could not be loaded on its own: ' + e.message); process.exit(1);
});
const list = fileAt >= 0 ? JSON.parse(readFileSync(args[fileAt + 1], 'utf8')) : (await import('../src/steer-list.js')).default;

const bad = [], ids = new Set();
if (!Array.isArray(list)) bad.push('the list is not an array');
for (const [i, r] of (Array.isArray(list) ? list : []).entries()) {
  const at = `rule ${i + 1}${r?.id ? ` (${r.id})` : ''}`;
  if (!r || typeof r !== 'object') { bad.push(`${at}: not an object`); continue; }
  try { JSON.stringify(r); } catch (_) { bad.push(`${at}: not plain data`); }
  for (const k of Object.keys(r)) if (!['id', 'why', 'when', 'do'].includes(k)) bad.push(`${at}: unknown field '${k}'`);
  if (typeof r.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(r.id)) bad.push(`${at}: id must be lower-case words joined by dashes`);
  else if (ids.has(r.id)) bad.push(`${at}: the id is used twice`); else ids.add(r.id);
  if (typeof r.why !== 'string' || r.why.length < 12) bad.push(`${at}: say why (what the reports showed, and when)`);
  const w = r.when;
  if (!w || typeof w !== 'object' || !Object.keys(w).some(k => k !== 'game')) bad.push(`${at}: 'when' must say which devices (a rule with no when matches nothing)`);
  for (const [k, v] of Object.entries(w || {})) {
    if (!WHEN.includes(k)) { bad.push(`${at}: unknown when.${k} (known: ${WHEN.join(', ')})`); continue; }
    for (const x of Array.isArray(v) ? v : [v]) {
      if (typeof x !== 'string' || !x) { bad.push(`${at}: when.${k} must be text or a list of text`); continue; }
      if (k === 'platform' && !PLATFORMS.includes(x)) bad.push(`${at}: when.platform '${x}' (known: ${PLATFORMS.join(', ')})`);
      if (k === 'model' || k === 'chip') { try { new RegExp(x, 'i'); } catch (e) { bad.push(`${at}: when.${k} is not a pattern: ${e.message}`); } }
      if (['os', 'driver', 'app'].includes(k) && !rangeOk(x)) bad.push(`${at}: when.${k} '${x}' is not a version range ('<14', '>=13 <15', '17.2')`);
      if (k === 'engine') { const m = /^\s*(Chrome|Safari)\b\s*(.*)$/i.exec(x); if (!m || (m[2] && !rangeOk(m[2]))) bad.push(`${at}: when.engine '${x}' must be 'Chrome' or 'Safari' and a range ('Chrome <130')`); }
    }
  }
  const d = r.do;
  if (!d || typeof d !== 'object' || !Object.keys(d).length) bad.push(`${at}: 'do' must turn something off or down`);
  for (const [k, v] of Object.entries(d || {})) {
    const t = KNOBS[k];
    if (!t) { bad.push(`${at}: unknown knob do.${k} (known: ${Object.keys(KNOBS).join(', ')})`); continue; }
    if (t === 'bool' && !(v === false || (k === 'hide' && v === true))) bad.push(`${at}: do.${k} can only be ${k === 'hide' ? 'true' : 'false'} (the list only turns things off)`);
    if (t === 'num' && !(typeof v === 'number' && v >= 24)) bad.push(`${at}: do.${k} must be a number of 24 or more`);
    if (Array.isArray(t) && !t.includes(v)) bad.push(`${at}: do.${k} must be one of ${t.join(', ')}`);
    if (k === 'hide' && !w?.game) bad.push(`${at}: do.hide needs when.game (which games to hide)`);
  }
}
function rangeOk(r) { return String(r).trim().split(/\s+/).every(t => /^(<=|>=|<|>|=)?\d+(\.\d+)*$/.test(t)); }

if (bad.length) { console.log(bad.map(b => 'BAD  ' + b).join('\n')); console.log(`\n${bad.length} problem${bad.length === 1 ? '' : 's'} in the steering list`); process.exit(1); }
console.log(`ok   the steering list: ${list.length} rule${list.length === 1 ? '' : 's'}${list.length ? ': ' + list.map(r => r.id).join(', ') : ''}`);

// a few checks of the matching itself, so a change to steer.js that breaks it shows here
const sure = (ok, what) => { if (!ok) { console.log('BAD  matching: ' + what); process.exitCode = 1; } };
sure(inRange('13.4', '<14') && !inRange('14', '<14') && inRange('17.2.1', '17.2') && !inRange('17.3', '17.2') && inRange('13', '>=13 <15') && !inRange('', '<14'), 'version ranges');
const fold = { platform: 'android', model: 'SM-F971B', chip: 'ANGLE (Qualcomm, Adreno (TM) 830, OpenGL ES 3.2)', adapter: 'qualcomm adreno-8xx', os: '16', engine: 'Chrome 142', driver: '', app: '412' };
sure(matches({ platform: 'android', chip: 'Adreno \\(TM\\) 8\\d\\d', engine: 'Chrome <150' }, fold), 'a chip, platform and engine rule');
sure(!matches({ platform: 'ios', chip: 'Adreno' }, fold) && !matches({ engine: 'Safari' }, fold) && !matches({ game: 'x' }, fold) && !matches({}, fold), 'rules for other devices');
sure(matches({ chip: 'adreno-8xx' }, fold) && matches({ model: ['^SM-S9', '^SM-F9'] }, fold) && matches({ app: '<420' }, fold) && !matches({ driver: '<30' }, fold), 'adapter, lists, builds and a driver it does not know');
const into = { games: new Map(), rules: [] };
steerWith([{ id: 'a', when: { chip: 'Adreno' }, do: { webgpu: false, tier: 2 } }, { id: 'b', when: { chip: 'Adreno', game: 'long-shadow' }, do: { tier: 1, hide: true, fps: 30 } }, { id: 'c', when: { chip: 'Mali' }, do: { tier: 0 } }, { id: 'd', when: { chip: 'Adreno' }, do: { tier: 3, nosuch: false } }], fold, into);
sure(into.webgpu === false && into.tier === 2 && into.rules.join() === 'a,b,d' && into.games.get('long-shadow')?.tier === 1 && into.games.get('long-shadow')?.hide === true && into.fps === undefined, 'what the knobs end up as (the lowest tier wins, a game\'s own apart)');
// and as the kits read them (src/kit/steering.js): the device's knobs, with a game's own on top
const { STEER, steerFor, capKlass, resetSteer } = await import('../src/kit/steering.js');
steerWith([{ id: 'a', when: { chip: 'Adreno' }, do: { tier: 2, klass: 'mid', fps: 90 } }, { id: 'b', when: { chip: 'Adreno', game: 'long-shadow' }, do: { tier: 1, klass: 'low', frameGen: false } }], fold, STEER);
const ls = steerFor('long-shadow'), other = steerFor('mini-golf');
sure(ls.tier === 1 && ls.klass === 'low' && ls.fps === 90 && ls.frameGen === false && other.tier === 2 && other.frameGen === true && other.webgpu === true && capKlass('top') === 'mid' && capKlass('low') === 'low', 'what a kit reads for one game and for the others');
resetSteer();
sure(steerFor('long-shadow').tier === null && capKlass('top') === 'top' && STEER.rules.length === 0, 'no rules: every knob as the kits would choose');

const tryAt = args.indexOf('--try');
if (tryAt >= 0) {
  const f = {}; for (const a of args.slice(tryAt + 1)) { const m = /^(\w+)=(.*)$/.exec(a); if (m) f[m[1]] = m[2]; }
  const knobs = { games: new Map(), rules: [] };
  steerWith(list, f, knobs);
  const { games, rules, ...rest } = knobs;
  console.log(`\na device with ${JSON.stringify(f)}\n  rules: ${rules.join(', ') || 'none'}\n  knobs: ${JSON.stringify(rest)}${games.size ? `\n  games: ${JSON.stringify(Object.fromEntries(games))}` : ''}`);
}
