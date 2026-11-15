// Starts a new game from a working template, so makers begin with something that already plays.
//
//   npm run new my-game                       Phone (Casual) game
//   npm run new my-game --style pocket        or: phone, pocket, color, advance, console, nextgen, ar, board
//   npm run new my-game --style ar --title "Balloon Pop" --creator "Sam"
//
// It writes src/games/my-game.js (the file name is the game's id) and prints what to do next. Every
// template uses the maker kits (juice, sound, controls, physics, save slots) so you can see them in action.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STYLES = {
  phone: 'Phone (Casual): full screen, smooth, any colours',
  pocket: 'Dot matrix (Pocket): four shades, chunky pixels',
  color: 'Color (Pocket): bright 16-colour pixels',
  advance: 'Advance (Pocket): rich pixel colours, wider screen',
  console: 'Classic · Console: cel-shaded 3D',
  nextgen: 'Next Gen · Console: modern HD 3D',
  ar: 'AR · 3D: 3D in the player\'s real room',
  board: 'Board game: on a table in 3D, or in the player\'s room with AR',
};

// npm swallows --flags given to `npm run new` and passes them as npm_config_* instead; read both.
const args = process.argv.slice(2), opt = {}, pos = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); opt[k] = v ?? args[++i]; } else pos.push(a);
}
// Some npm versions take `--style pocket` as a switch (npm_config_style=true) and pass "pocket" on as a word.
const env = k => { const v = process.env['npm_config_' + k]; return v === 'true' && pos.length > 1 ? pos.splice(1, 1)[0] : v === 'true' ? undefined : v; };
const style = String(opt.style || env('style') || 'phone').toLowerCase().replace(/[^a-z]/g, '');
let id = pos[0];

if (!id || opt.help || !STYLES[style]) {
  if (!STYLES[style]) console.error(`Unknown style "${style}".\n`);
  console.log('Usage: npm run new <game-id> [--style <style>] [--title "Title"] [--creator "Your name"]\n\nStyles:');
  for (const [k, v] of Object.entries(STYLES)) console.log(`  ${k.padEnd(8)} ${v}`);
  process.exit(id && STYLES[style] ? 0 : 1);
}
id = id.toLowerCase();
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) { console.error(`"${id}" isn't a valid id: use lowercase letters, numbers and dashes, like my-game.`); process.exit(1); }
const file = join(ROOT, 'src', 'games', id + '.js');
if (existsSync(file)) { console.error(`src/games/${id}.js already exists. Pick another id.`); process.exit(1); }

const title = String(opt.title || env('title') || id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')).replace(/'/g, '’').slice(0, 30);
let creator = opt.creator || env('creator');
if (!creator) { try { creator = execSync('git config user.name', { encoding: 'utf8' }).trim(); } catch { /* no git name */ } }
creator = String(creator || 'Your Name').replace(/'/g, '’').slice(0, 40);

const code = readFileSync(join(ROOT, 'scripts', 'templates', style + '.js'), 'utf8')
  .replaceAll('__ID__', id).replaceAll('__TITLE__', title).replaceAll('__CREATOR__', creator);
writeFileSync(file, code);

console.log(`Made src/games/${id}.js: "${title}" (${STYLES[style].split(":")[0]}).`+`

Next:
  npm run dev                      then in the browser console: __gs.only('${id}')
  press \` (backquote) in the game   debug overlay: frame rate, slow motion, hitboxes
  node scripts/smoke.cjs ${id}      after npm run build:bundled, before you open a PR

It already plays. Now make it yours: change the mechanic, the look, the title, tag and hint.
The kits are explained in docs/maker-kit.md.`);
