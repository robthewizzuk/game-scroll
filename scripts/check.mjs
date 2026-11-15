// Every check a game needs, in one command, with one short report: what failed, the line in YOUR file it
// failed on (a crash while playing is traced back from the built app to your source line), and what to do
// about it. Written for people and for AI tools (Claude Code, Codex, Gemini CLI, Cursor...), which read the
// report and fix the game in one go instead of running seven commands and reading seven kinds of output.
//
//   node scripts/check.mjs <id>            the checks AGENTS.md lists, about 30 to 60 s (3D games longer)
//   node scripts/check.mjs <id> --quick    only the checks that read the code: lint, types, unique (about 2 s)
//   node scripts/check.mjs <id> --full     also the speed budget on a slowed CPU (budget.cjs)
//   node scripts/check.mjs <id> --json     the report as JSON (for tools; the exit code is the same)
//   npm run check <id>                      the same (npm passes --quick/--full/--json through after --)
//
// What runs (each is its own script too, see docs/testing.md):
//   lint      game-lint.mjs     forbidden code (network, storage, eval...); its kit hints come out as advice
//   types     game-types.mjs    gs used as src/gamescroll.d.ts describes (no kit, method or option that isn't there)
//   unique    unique.mjs        its three nearest games: a near-copy fails, a near-twin is a warning
//   build     build-games.mjs   the game builds as a streamed file (bad imports, a missing gs part)
//   smoke     smoke.cjs         played with random input in a phone-sized browser; fails on any error
//   stream    stream-smoke.mjs  played streamed, the way the store apps run it
//   fold      fold.cjs          survives folding and unfolding the screen
//   sweep     sweep.cjs         odd screen sizes and long play (Console, Next Gen, AR and Board games only)
//   playtest  playtest.cjs      a bot tries to reach the goal (a warning, never a failure)
//   budget    budget.cjs        (--full) frame time and memory on a slowed CPU
// The browser checks play the app built with source maps (vite build --mode bundled --sourcemap hidden),
// so they test the code as it is now, and run side by side (each has its own port).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { SourceMap } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), flag = f => argv.includes('--' + f) || process.env['npm_config_' + f] === 'true';
const QUICK = flag('quick'), FULL = flag('full'), JSONOUT = flag('json');
let id = argv.find(a => !a.startsWith('--'));
if (id?.endsWith('.js')) id = id.replace(/^.*[\\/]/, '').slice(0, -3);
if (!id) { console.log('Usage: node scripts/check.mjs <game-id> [--quick] [--full] [--json]'); process.exit(1); }
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) { console.error(`"${id}" isn't a game id (lowercase letters, numbers and dashes, like my-game)`); process.exit(1); }
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ID = esc(id);   // ids are checked above; escaped all the same
const REL = `src/games/${id}.js`, FILE = join(ROOT, REL);
if (!existsSync(FILE)) { console.error(`${REL} doesn't exist. Start one with: npm run new ${id} --style phone`); process.exit(1); }
const SRC = readFileSync(FILE, 'utf8').split('\n');
const ERA = (SRC.join('\n').match(/\bera\s*:\s*['"`](\w+)['"`]/) || [])[1] || (/\bretro\s*:\s*true\b/.test(SRC.join('\n')) ? 'pocket' : 'phone');
const THREE_D = ['console', 'nextgen', 'ar', 'board'].includes(ERA);

const run = (cmd, args, env = {}) => new Promise(done => {
  const t0 = Date.now(), p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...env } });
  let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  p.on('close', code => done({ code, out: out.replace(/\x1b\[[0-9;]*m/g, ''), ms: Date.now() - t0 }));
});
const node = (script, ...args) => run(process.execPath, [join('scripts', script), ...args]);
const lineText = n => (SRC[n - 1] ?? '').trim().slice(0, 140);
const problem = (line, message, fix, extra = {}) => ({ file: REL, line, code: line ? lineText(line) : undefined, message, fix, ...extra });

// What to do about each kind of lint flag: the gs way to get the same thing.
const LINT_FIX = [
  [/^network/, 'Games never reach the network. Everything a game needs is in gs; to keep data use api.save(data) / api.load(fallback).'],
  [/^storage/, 'Use api.save(data) / api.load(fallback) (8 KB, follows the player) or api.saveLocal / api.loadLocal (512 KB, this phone).'],
  [/^native/, 'Use the kit: gs.device.haptic(), gs.device.tilt(), gs.device.startMic()... (it asks for permission and has fallbacks).'],
  [/^location/, "Add location: 'coarse' to the definition and call api.location() / api.watchLocation(cb)."],
  [/loads code|require\(|imports/, "The one import is: import gs from '../gamescroll.js'. Everything else is on gs (lazy kits load themselves)."],
  [/creates an element|creates a </, "Draw on the canvas you're given. For an off-screen picture document.createElement('canvas') is allowed."],
  [/runs code from a string/, 'Call functions directly; build behaviour from data, not code in strings.'],
  [/window|page|document/, "The game only gets its canvas and api. Sizes come from w/h (and resize(w, h) for fluid games), input from down/move/up/key."],
  [/test hooks/, '__gs and __hd are for test scripts only: remove them from the game.'],
  [/built-in|prototype|constructor/, "Don't change shared built-ins: write a helper function in the game instead."],
];
// What to do about a crash, by the error's own words. Advice, worded as a first thing to look at.
const CRASH_FIX = [
  [/Cannot (read|set) properties of (undefined|null)/, 'Something on this line is undefined. Usual causes: round state not set in reset(), a list index past its end, an object removed earlier this frame, or a lazy kit used before make()/reset() made it.'],
  [/is not a function/, 'Calling something that is not a function: a misspelt method (node scripts/game-types.mjs names it), or a kit part read from the wrong gs.<kit>. Look it up: node scripts/examples.mjs <name>.'],
  [/is not defined/, 'A name used before it is declared or outside its scope (round state belongs in make(), set in reset()).'],
  [/Maximum call stack/, 'Endless recursion: a function that calls itself (or two that call each other) with no way out.'],
  [/not a constructor/, 'new on something that is not a class. Check the kit: node scripts/examples.mjs <name>.'],
  [/Assignment to constant/, 'Reassigning a const: use let for values that change.'],
];

// Turn stack frames of the built app back into source lines with its source maps (vite build --sourcemap hidden).
const maps = new Map();
function original(url, line, col) {
  const m = url.match(/\/assets\/([^/?#]+\.js)/); if (!m) return null;
  const f = join(ROOT, 'dist', 'assets', m[1] + '.map');
  if (!maps.has(f)) { try { maps.set(f, new SourceMap(JSON.parse(readFileSync(f, 'utf8')))); } catch { maps.set(f, null); } }
  const sm = maps.get(f); if (!sm) return null;
  const e = sm.findEntry(line - 1, col - 1); if (!e?.originalSource) return null;
  const src = e.originalSource.replace(/\\/g, '/').replace(/^.*?\/?(src\/)/, '$1');
  return { src, line: e.originalLine + 1, col: e.originalColumn + 1, name: e.name };
}
// Errors printed by smoke/fold/sweep: a message line, then "    at fn (url:line:col)" lines.
function crashes(text, check) {
  const out = [], seen = new Set();
  const blocks = text.replace(/\r/g, '').split('\n').reduce((a, l) => {
    if (/^\s+at\s/.test(l) && a.length) a[a.length - 1].push(l.trim()); else if (l.trim()) a.push([l.trim()]);
    return a;
  }, []);
  for (const [head, ...frames] of blocks) {
    if (/^(PASS|FAIL|WARN|NOTE|note:|WebGPU|\d+ failed|playtest |\(node|Replace `|\(Use `|\d+\/\d+ games|\d+ games,)/.test(head) || !/(Error|error|threw|undefined|not a function|not defined|failed|stalled|off screen|blank)/.test(head)) continue;
    const msg = head.replace(new RegExp(`^(FAIL\\s+)?${ID}\\s+`), '').replace(/\s+\|\s+/g, ' / ');
    let at = null, inKit = null, fn = null;
    for (const fr of frames) {
      const m = fr.match(/^at (?:(?:async )?([\w$.<>[\] ]+?) \()?(.+?):(\d+):(\d+)\)?$/); if (!m) continue;
      const o = original(m[2], +m[3], +m[4]); if (!o) continue;
      if (o.src === REL) { at = o; fn = (m[1] || '').replace(/^Object\./, '') || null; break; }
      if (!inKit && o.src.startsWith('src/')) inKit = o;
    }
    const key = msg + (at ? at.line : ''); if (seen.has(key)) continue; seen.add(key);
    const fix = (CRASH_FIX.find(([re]) => re.test(msg)) || [, 'Read the line, then play it yourself: npm run dev, __gs.only(\'' + id + '\') in the browser console, ` for the debug overlay.'])[1];
    out.push(problem(at?.line, msg, fix, {
      check, col: at?.col, in: fn ? fn + '()' : undefined,
      kit: inKit && (!at || inKit !== at) ? `${inKit.src}:${inKit.line}` : undefined,
    }));
  }
  if (!out.length && /FAIL/.test(text)) out.push(problem(undefined, text.split('\n').filter(l => /FAIL/.test(l)).join(' / ').trim(), 'See the full output: node scripts/' + check + ' ' + id, { check }));
  return out;
}

const steps = [];
const step = (name, status, ms, problems = [], notes = []) => steps.push({ name, status, ms, problems, notes });

// ---- the checks that read the code
const [lint, types, uniq, build] = await Promise.all([
  node('game-lint.mjs', id),
  node('game-types.mjs', id),
  node('unique.mjs', id, '--json'),
  QUICK ? null : node('build-games.mjs', join('node_modules', '.cache', 'gs-check-games')),
]);
{
  const probs = [], warns = [], hints = [];
  for (const m of lint.out.matchAll(/^src\/games\/[\w-]+\.js:(\d+)\s+(hint: |warning: )?(.+)$/gm)) {
    const [, line, kind, why] = m;
    if (kind === 'hint: ') hints.push({ line: +line, code: lineText(+line), advice: why });
    else if (kind === 'warning: ') warns.push(problem(+line, why, 'Allowed, but a maintainer will read this line.'));
    else probs.push(problem(+line, why, (LINT_FIX.find(([re]) => re.test(why)) || [, 'Games get everything through gs: see AGENTS.md, "Only gs".'])[1]));
  }
  step('lint', probs.length ? 'fail' : warns.length ? 'warn' : 'pass', lint.ms, [...probs, ...warns], hints);
}
{
  const probs = [];
  for (const m of types.out.matchAll(/^src\/games\/[\w-]+\.js:(\d+):(\d+)\s+(.+)$/gm)) {
    const name = (m[3].match(/Did you mean '(\w+)'/) || m[3].match(/'(\w+)'/) || [])[1];
    probs.push(problem(+m[1], m[3], `Check the name, arguments and options in src/gamescroll.d.ts${name ? `, or see how games use it: node scripts/examples.mjs ${name}` : ''}. A line that is right but can't be typed: // @ts-ignore above it.`, { col: +m[2] }));
  }
  if (types.code && !probs.length) probs.push(problem(undefined, types.out.trim().split('\n').slice(-3).join(' '), 'Run node scripts/game-types.mjs ' + id + ' for the full output.'));
  step('types', probs.length ? 'fail' : 'pass', types.ms, probs);
}
{
  const src = readFileSync(join(ROOT, 'scripts', 'unique.mjs'), 'utf8');
  const COPY = +(src.match(/COPY\s*=\s*([\d.]+)/) || [, .6])[1], TWIN = +(src.match(/TWIN\s*=\s*([\d.]+)/) || [, .42])[1];
  let near = []; try { near = JSON.parse(uniq.out.slice(uniq.out.indexOf('['), uniq.out.lastIndexOf(']') + 1))[0]?.near || []; } catch { /* printed no JSON */ }
  const probs = [];
  for (const n of near) {
    const why = [...(n.why?.play || []), ...(n.why?.told || [])].slice(0, 6).join(', ');
    if (n.shape >= COPY) probs.push(problem(undefined, `near-copy of ${n.b}: ${Math.round(n.shape * 100)}% the same code shape`, `Change the mechanic, not the names: compare with src/games/${n.b}.js.`, { severity: 'fail', near: n.b }));
    else if (n.twin >= TWIN) probs.push(problem(undefined, `near-twin of ${n.b} (${Math.round(n.twin * 100)}%; shares ${why})`, `Make it play differently from src/games/${n.b}.js, or say in the PR what does.`, { severity: 'warn', near: n.b }));
  }
  const notes = near.map(n => `${n.b} ${Math.round(n.twin * 100)}%`);
  step('unique', probs.some(p => p.severity === 'fail') ? 'fail' : probs.length ? 'warn' : uniq.code ? 'fail' : 'pass', uniq.ms, probs, notes.length ? ['nearest: ' + notes.join(', ')] : []);
}
if (build) {
  const bad = build.code ? build.out.split('\n').filter(l => /error|Error|cannot|Could not|missing/i.test(l) && !/Deprecation|THREE_CJS/.test(l)).slice(0, 6) : [];
  // the streamed build builds every game: an error in another game's file isn't this one's
  const other = bad.map(l => (l.match(/src\/games\/([\w-]+)\.js/) || [])[1]).find(g => g && g !== id);
  const mine = bad.filter(l => !other || l.includes(REL) || !/src\/games\//.test(l));
  if (build.code && other && !bad.some(l => l.includes(REL))) step('build', 'warn', build.ms, [problem(undefined, `another game doesn't build: ${bad.find(l => l.includes(other)).trim()}`, `Not this game's problem, but the build stops there: fix or move src/games/${other}.js.`)]);
  else step('build', build.code ? 'fail' : 'pass', build.ms, mine.map(l => problem(undefined, l.replace(/^\s*\w*Error:\s*/, '').trim(), /doesn't|add |declare/.test(l) ? 'Do what the message says.' : "Imports: only import gs from '../gamescroll.js'; every part comes from gs.")));
}

// ---- the checks that play it
if (!QUICK) {
  const vb = await run(process.execPath, [join('node_modules', 'vite', 'bin', 'vite.js'), 'build', '--mode', 'bundled', '--sourcemap', 'hidden', '--logLevel', 'error']);
  if (vb.code) step('app build', 'fail', vb.ms, [problem(undefined, vb.out.trim().split('\n').slice(0, 6).join(' / '), 'The app did not build with this game in it: fix the error above first.')]);
  else {
    const plays = [
      ['smoke', node('smoke.cjs', id, '--jobs', '1')],
      ['stream', node('stream-smoke.mjs', id, '--jobs', '1')],
      ['fold', node('fold.cjs', id, '--jobs', '1')],
      THREE_D && ['sweep', node('sweep.cjs', id, '--jobs', '1')],
      ['playtest', node('playtest.cjs', id, '--jobs', '1')],
      FULL && ['budget', node('budget.cjs', id)],
    ].filter(Boolean);
    for (const [name, p] of plays) {
      const r = await p, script = { smoke: 'smoke.cjs', stream: 'stream-smoke.mjs', fold: 'fold.cjs', sweep: 'sweep.cjs', playtest: 'playtest.cjs', budget: 'budget.cjs' }[name];
      if (name === 'playtest') {
        const line = r.out.split('\n').find(l => new RegExp(`^(PASS|WARN|FAIL|NOTE)\\s+${ID}\\b`).test(l)) || '';
        const status = r.code ? 'fail' : /^WARN/.test(line) ? 'warn' : 'pass';
        const why = line.replace(new RegExp(`^\\w+\\s+${ID}\\s+`), '').trim();
        const fix = /goal-not-reached/.test(why) ? 'A bot found no way to the goal. If a person could, this is fine (note it in the PR); else lower goal or make early points easier to get. Behind a Ready gate the bot only starts if a tap scores within about 1.6 s.'
          : /idle|nothing/i.test(why) ? 'The goal was reached without playing: score only from what the player does, and wait for the first tap with gs.rounds.Ready.' : 'See: node scripts/playtest.cjs ' + id;
        const bare = m => m.replace(/^\w*Error:\s*/, '');
        const seen = new Set(steps.flatMap(s => s.problems.map(p => bare(p.message))));
        const crash = crashes(r.out, script).filter(p => !seen.has(bare(p.message)));
        const probs = status === 'pass' ? [] : /ERRORS/.test(why) && !crash.length
          ? [problem(undefined, why, 'The bot hit the crash reported above: fix that first, then this check means something.')]
          : [...crash, problem(undefined, why || r.out.trim().split('\n').pop(), fix)].slice(0, 4);
        step(name, status, r.ms, probs, status === 'pass' ? [why] : []);
        continue;
      }
      if (name === 'budget') {
        const probs = r.code ? r.out.split('\n').filter(l => /over budget|memory grew|too few/.test(l)).map(l => problem(undefined, l.trim(), 'The lines after "over budget" in node scripts/budget.cjs ' + id + ' name the slowest functions with file and line.')) : [];
        step(name, r.code ? 'fail' : 'pass', r.ms, probs);
        continue;
      }
      step(name, r.code ? 'fail' : 'pass', r.ms, r.code ? crashes(r.out, script) : []);
    }
  }
}

// ---- the knobs (the numbers that set how it feels), so a change asked for in words has somewhere to go
const { readKnobs } = await import('./lib/knobs.mjs');
const knobs = readKnobs(SRC.join('\n')).map(({ at, ...k }) => k);

// ---- the report
const fails = steps.filter(s => s.status === 'fail'), warns = steps.filter(s => s.status === 'warn');
const report = { id, style: ERA, ok: !fails.length, failed: fails.map(s => s.name), warnings: warns.map(s => s.name), steps, knobs,
  advice: steps.find(s => s.name === 'lint')?.notes || [] };
if (JSONOUT) { console.log(JSON.stringify(report, null, 2)); process.exit(fails.length ? 1 : 0); }

const secs = s => (s.ms / 1000).toFixed(s.ms < 10000 ? 1 : 0) + ' s';
console.log(`check ${id} (${ERA}): ${fails.length ? fails.length + ' failed' : 'all passed'}${warns.length ? `, ${warns.length} warning${warns.length > 1 ? 's' : ''}` : ''}\n`);
for (const s of steps) {
  const head = `${s.status === 'pass' ? 'pass' : s.status.toUpperCase()}  ${s.name.padEnd(9)}`;
  if (s.status === 'pass') { console.log(`${head} ${secs(s)}${s.name !== 'lint' && s.notes.length ? '  ' + s.notes.join('; ') : ''}`); continue; }
  console.log(`${head} ${secs(s)}`);
  for (const p of s.problems) {
    console.log(`      ${p.line ? `${p.file}:${p.line}${p.col ? ':' + p.col : ''}  ` : ''}${p.message}${p.in ? `  (in ${p.in})` : ''}`);
    if (p.code) console.log(`        > ${p.code}`);
    if (p.kit) console.log(`        inside the kit at ${p.kit}`);
    console.log(`        fix: ${p.fix}`);
  }
  if (s.notes.length && s.name === 'unique') console.log('      ' + s.notes.join('; '));
}
console.log(knobs.length ? `\nknobs (node scripts/knobs.mjs ${id} changes them; docs/feel-words.md says which to move): ${knobs.map(k => `${k.folder}.${k.key}=${k.value}`).join(', ')}`
  : `\nknobs: none yet (docs/feel-words.md: keep the numbers that set how it feels in one gs.tweak('Feel', {...}) block)`);
if (report.advice.length) {
  console.log('\nadvice (kit hints, never failures):');
  for (const h of report.advice) console.log(`  ${REL}:${h.line}  ${h.advice}`);
}
if (QUICK) console.log('\n(--quick: the play checks did not run)');
process.exit(fails.length ? 1 : 0);
