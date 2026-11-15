// A game's knobs: the numbers that set how it feels, kept in its gs.tweak('Feel', { ... }) block. List them,
// or change them in the file without touching anything else (for people and AI tools turning "slower fish"
// or "a floatier jump" into one number; docs/feel-words.md says which knob each feel word moves).
//
//   node scripts/knobs.mjs <id>                          lists the knobs: name, value, range, what it does
//   node scripts/knobs.mjs <id> Feel.speed=140 jump=60   writes those values into src/games/<id>.js
//   node scripts/knobs.mjs <id> speed*0.8                scales a number knob (kept inside its range)
//   --json                                               the list (or what changed) as JSON
//   npm run knobs <id> ...                               the same
// In npm run dev the slider panel's "Save to file" button does the same from the game on screen.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readKnobs, writeKnobs } from './lib/knobs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), JSONOUT = argv.includes('--json'), args = argv.filter(a => !a.startsWith('--'));
const id = args.shift()?.replace(/^.*[\\/]/, '').replace(/\.js$/, '');
if (!id) { console.log('Usage: node scripts/knobs.mjs <id> [Folder.knob=value | knob*factor ...] [--json]'); process.exit(1); }
const file = join(ROOT, 'src', 'games', id + '.js');
if (!existsSync(file)) { console.error(`src/games/${id}.js doesn't exist`); process.exit(1); }
const src = readFileSync(file, 'utf8'), knobs = readKnobs(src);

if (!args.length) {
  if (JSONOUT) { console.log(JSON.stringify(knobs.map(({ at, ...k }) => k), null, 2)); process.exit(0); }
  if (!knobs.length) {
    console.log(`${id} has no knobs yet. Put the numbers that set how it feels in one block in make():\n` +
      `  const K = gs.tweak('Feel', { speed: [110, 40, 240, 'how fast you slide'], spawn: [.9, .3, 2, 'seconds between drops'] });\n` +
      `and read K.speed where it's used. docs/feel-words.md lists the usual ones.`);
    process.exit(0);
  }
  console.log(`${id}: ${knobs.length} knob${knobs.length > 1 ? 's' : ''}`);
  for (const k of knobs) {
    const range = k.kind === 'number' ? `  (${k.min} to ${k.max}${k.step ? ', step ' + k.step : ''})` : k.kind === 'choice' ? `  (${k.choices.join(' | ')})` : '';
    console.log(`  ${(k.folder + '.' + k.key).padEnd(22)} ${String(k.value).padEnd(8)}${range}${k.says ? '  ' + k.says : ''}   :${k.line}`);
  }
  process.exit(0);
}

const changes = {}, bad = [];
for (const a of args) {
  const m = a.match(/^([\w$]+(?:\.[\w$]+)?)\s*([=*])\s*(.+)$/); if (!m) { bad.push(a); continue; }
  const [, name, op, raw] = m;
  if (op === '*') {
    const [f, k] = name.includes('.') ? name.split('.') : [null, name];
    const hit = knobs.find(x => x.key === k && (!f || x.folder === f) && x.kind === 'number');
    if (!hit || !Number.isFinite(+raw)) { bad.push(a); continue; }
    let v = hit.value * +raw; if (hit.min != null) v = Math.max(hit.min, Math.min(hit.max, v));
    changes[name] = +v.toFixed(4); continue;
  }
  changes[name] = raw === 'true' ? true : raw === 'false' ? false : Number.isFinite(+raw) && raw.trim() !== '' ? +raw : raw.replace(/^['"]|['"]$/g, '');
}
const r = writeKnobs(src, changes); r.missing.push(...bad);
if (r.changed.length) writeFileSync(file, r.src);
if (JSONOUT) console.log(JSON.stringify({ changed: r.changed, missing: r.missing }, null, 2));
else {
  for (const c of r.changed) console.log(`src/games/${id}.js:${c.line}  ${c.name}  ${c.from} -> ${c.to}`);
  for (const m of r.missing) console.log(`not changed: ${m} (no single knob by that name, or a value of the wrong kind; node scripts/knobs.mjs ${id} lists them)`);
  if (!r.changed.length && !r.missing.length) console.log('nothing to change: the values are already those');
}
process.exit(r.missing.length ? 1 : 0);
