// The Game Scroll MCP server: the engine's tools for AI coding tools (Claude Code, Cursor, Codex, Gemini CLI,
// Copilot...), so a tool asks the engine instead of guessing: a kit's guide, real games that use a part, a new game
// from a template, the checks with lines and fixes, the knobs, play-and-watch pictures with numbers before and after a
// change, the speed report, and advice from a phone's frame lab recording. Each tool runs the same script a person
// would (scripts/*.mjs, *.cjs), so what the tool sees is what `npm run ...` prints.
//
// Run by the AI tool, over stdio: `node scripts/mcp.mjs` (.mcp.json at the top of the repo sets it up for Claude Code;
// docs/ai-makers.md has the lines for the others). It speaks MCP's JSON-RPC, one message a line; no packages needed.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version || '0';
const ID = { type: 'string', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$', description: 'The game id: its file name in src/games without .js' };
const STYLES = ['phone', 'pocket', 'color', 'advance', 'console', 'nextgen', 'ar', 'board'];

function run(script, args, { input, timeout = 15 * 60 * 1000 } = {}) {
  return new Promise(done => {
    const p = spawn(process.execPath, [join('scripts', script), ...args], { cwd: ROOT, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
    let out = '', err = '';
    const t = setTimeout(() => p.kill('SIGKILL'), timeout);
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    if (input != null) { p.stdin.end(input); }
    p.on('close', code => { clearTimeout(t); done({ code, out: out.replace(/\x1b\[[0-9;]*m/g, ''), err: err.replace(/\x1b\[[0-9;]*m/g, '') }); });
  });
}
const text = t => ({ type: 'text', text: t });
const json = s => { try { return JSON.parse(s); } catch (_) { return null; } };
const said = r => (r.out + (r.err && r.code ? '\n' + r.err : '')).trim() || `(exit ${r.code}, no output)`;

const TOOLS = [
  {
    name: 'kit_guide',
    description: "A part of gs explained: what it is, what to know, its types (methods and options), the maker kit's examples and the shortest real games that use it. Read it before using a part. No name: the index of every part, one line each.",
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: "The part: 'physics', 'gs.hd', 'sound'... (empty for the index)" } } },
    run: async ({ name }) => {
      if (!name) return [text(readFileSync(join(ROOT, 'docs', 'kits', 'README.md'), 'utf8'))];
      const r = await run('kit-guides.mjs', [String(name)]);
      return [text(said(r))];
    },
  },
  {
    name: 'find_examples',
    description: "How real games use a part of gs (or any text in game code), shortest games first, with the lines, plus where src/gamescroll.d.ts declares it. Examples: 'Physics.rope', 'Feel.coin', 'gs.rounds', 'Ready'.",
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, top: { type: 'integer', minimum: 1, maximum: 30 }, style: { type: 'string', enum: STYLES } }, required: ['query'] },
    run: async ({ query, top, style }) => [text(said(await run('examples.mjs', [String(query), ...(top ? ['--top', String(top)] : []), ...(style ? ['--style', style] : [])])))],
  },
  {
    name: 'feel_words',
    description: 'Which knob or kit number a feel word moves (floaty, heavy, snappy, slippery, punchy, unfair, slow start...): how to turn a change asked for in words into numbers.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => [text(readFileSync(join(ROOT, 'docs', 'feel-words.md'), 'utf8'))],
  },
  {
    name: 'new_game',
    description: 'Starts a new game from the style\'s template: writes src/games/<id>.js, a small working game with a knobs block, to change into the new game. Read AGENTS.md\'s rules first (original, one file, only gs, touch first).',
    inputSchema: { type: 'object', properties: { id: ID, style: { type: 'string', enum: STYLES } }, required: ['id', 'style'] },
    run: async ({ id, style }) => [text(said(await run('new-game.mjs', [id, '--style', style])))],
  },
  {
    name: 'check_game',
    description: 'Every check a game needs, in one report: each problem with the line in the game file, the code on it and what to do (lint, types, unique, build, played with random taps, streamed, folded, 3D sweeps, a bot playtest, and the speed report). quick: only the code checks (2 s). Fix what fails and check again.',
    inputSchema: { type: 'object', properties: { id: ID, quick: { type: 'boolean' }, speed: { type: 'boolean', description: 'false leaves the speed report out' } }, required: ['id'] },
    run: async ({ id, quick, speed }) => {
      const r = await run('check.mjs', [id, '--json', ...(quick ? ['--quick'] : []), ...(speed === false ? ['--no-speed'] : [])]);
      const j = json(r.out);
      if (!j) return [text(said(r))];
      const lines = [`check ${id} (${j.style}): ${j.ok ? 'all passed' : 'FAILED: ' + j.failed.join(', ')}${j.warnings.length ? '; warnings: ' + j.warnings.join(', ') : ''}`];
      for (const s of j.steps) {
        lines.push(`${s.status.toUpperCase().padEnd(4)} ${s.name}${s.notes?.length ? '  ' + s.notes.join('; ') : ''}`);
        for (const p of s.problems) lines.push(`  ${p.line ? `${p.file}:${p.line} ` : ''}${p.message}${p.code ? `\n    > ${p.code}` : ''}\n    fix: ${p.fix}`);
      }
      if (j.knobs?.length) lines.push(`knobs: ${j.knobs.map(k => `${k.folder}.${k.key}=${k.value}`).join(', ')}`);
      for (const a of j.advice || []) lines.push(`advice :${a.line} ${a.advice}`);
      return [text(lines.join('\n'))];
    },
  },
  {
    name: 'knobs',
    description: "A game's knobs: the numbers that set how it feels, in its gs.tweak('Feel', {...}) block, with ranges and what each does. With set: changes them in the file, only those numbers ('speed=140', 'jump*1.2' scales within the range). To see a change before making it, use play_and_watch.",
    inputSchema: { type: 'object', properties: { id: ID, set: { type: 'array', items: { type: 'string' }, description: "Changes like 'Feel.speed=140' or 'gravity*0.8'" } }, required: ['id'] },
    run: async ({ id, set }) => [text(said(await run('knobs.mjs', [id, ...(set || [])])))],
  },
  {
    name: 'play_and_watch',
    description: 'Plays the game with taps for a few seconds and gives back a strip of frames across the play and numbers: score over time, rounds and how long each lasted, frame times, errors. With changes (knob changes, not written to the file) it plays twice from the same start and taps, before and after, so you can see whether a change does what was asked.',
    inputSchema: { type: 'object', properties: { id: ID, changes: { type: 'array', items: { type: 'string' }, description: "Knob changes to try: 'lives=1', 'speed*1.3'" }, seconds: { type: 'number', minimum: 2, maximum: 60 }, frames: { type: 'integer', minimum: 2, maximum: 12 }, taps: { type: 'number', minimum: 0, maximum: 6, description: 'Taps a second (0: none)' }, seed: { type: 'integer' } }, required: ['id'] },
    run: async ({ id, changes, seconds, frames, taps, seed }) => {
      const r = await run('watch.mjs', [id, ...(changes || []), '--json', ...(seconds ? ['--seconds', String(seconds)] : []), ...(frames ? ['--frames', String(frames)] : []), ...(taps != null ? ['--taps', String(taps)] : []), ...(seed != null ? ['--seed', String(seed)] : [])]);
      const j = json(r.out);
      if (!j) return [text(said(r))];
      const out = [];
      for (const run_ of j.runs) {
        const done = run_.rounds.filter(x => x.ended !== 'still playing');
        out.push(text(`${run_.name}${run_.name === 'after' ? ' (' + Object.entries(j.changes).map(([k, v]) => `${k}=${v}`).join(' ') + ')' : ''}: best score ${run_.best}; rounds ${run_.rounds.map(x => `${x.secs} s → ${x.score}${x.ended === 'over' ? '' : ' (' + x.ended + ')'}`).join(', ')}${done.length ? `; ${(done.reduce((s, x) => s + x.secs, 0) / done.length).toFixed(1)} s a finished round` : ''}; frame time ${run_.frameMs.p50} ms (95%: ${run_.frameMs.p95} ms)\nscore over time: ${run_.scores.map(([t, s]) => `${t}s ${s}`).join(', ')}`));
        out.push({ type: 'image', mimeType: 'image/png', data: readFileSync(run_.picture).toString('base64') });
      }
      if (j.errors.length) out.push(text('errors while playing:\n' + j.errors.join('\n')));
      return out;
    },
  },
  {
    name: 'speed_report',
    description: 'How the game runs on a phone-speed CPU: frame time left against the budget, the slowest lines in the game file, garbage made a second and where, memory growth, and for 3D games draw calls, triangles and shaders built mid-play against low, mid and top phones, each with what to do. Over budget fails.',
    inputSchema: { type: 'object', properties: { id: ID }, required: ['id'] },
    run: async ({ id }) => [text(said(await run('budget.cjs', [id])))],
  },
  {
    name: 'frame_lab_advice',
    description: "What to change in a game from a frame lab recording made on a phone (the Copy summary text, or the Report file's contents): game CPU against the beat, the graphics chip, draws and triangles, hitches by cause, heat, memory.",
    inputSchema: { type: 'object', properties: { report: { type: 'string', description: 'The pasted summary or report' } }, required: ['report'] },
    run: async ({ report }) => [text(said(await run('budget.cjs', ['--lab', '-'], { input: String(report) })))],
  },
];

// ---- MCP over stdio: JSON-RPC 2.0, one message a line
const send = m => process.stdout.write(JSON.stringify(m) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
async function handle(m) {
  const { id, method, params = {} } = m;
  if (method === 'initialize') return reply(id, { protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'game-scroll', version: VERSION },
    instructions: 'Game Scroll: each game is one file in src/games using only gs. Read AGENTS.md for the rules. Before using a part of gs, kit_guide it; find_examples shows real use. Make a game with new_game, check it with check_game until it passes, tune it with knobs, and look with play_and_watch before and after a change.' });
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
  if (method === 'tools/call') {
    const t = TOOLS.find(x => x.name === params.name);
    if (!t) return fail(id, -32602, `no tool ${params.name}`);
    const a = params.arguments || {};
    const missing = (t.inputSchema.required || []).filter(k => a[k] == null || a[k] === '');
    if (missing.length) return reply(id, { content: [text(`${t.name} needs ${missing.join(', ')}`)], isError: true });
    if (a.id != null && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.id)) return reply(id, { content: [text(`"${a.id}" isn't a game id (lowercase letters, numbers and dashes)`)], isError: true });
    try { return reply(id, { content: await t.run(a) }); } catch (e) { return reply(id, { content: [text(String(e?.stack || e))], isError: true }); }
  }
  if (id != null) fail(id, -32601, `no method ${method}`);   // (notifications get no answer)
}
let buf = '';
const pending = new Set();   // calls still being answered
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    const m = json(line);
    if (!m) { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); continue; }
    const job = handle(m).catch(() => {}).finally(() => pending.delete(job)); pending.add(job);
  }
});
process.stdin.on('end', async () => { while (pending.size) await Promise.allSettled([...pending]); process.exit(0); });   // answer what was asked before going
