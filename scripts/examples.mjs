// Finds real games that use a part of gs, so you (or an AI tool) can copy a pattern that is known to work
// instead of guessing from the docs. It reads every game in src/games/, follows what each takes from gs
// (const { Physics } = gs.physics; const phys = new Physics(...); phys.rope(...)) and lists the lines
// where the part you asked about is used, shortest games first (they are the easiest to read).
//
//   node scripts/examples.mjs rope                 any kit method or part called rope: Physics.rope(...)
//   node scripts/examples.mjs Physics.rope         that class's method only
//   node scripts/examples.mjs gs.physics           the games that use a kit, and what they use from it
//   node scripts/examples.mjs Ready --top 3        the 3 shortest games (default 6)
//   node scripts/examples.mjs "tick: 60"           anything else: a plain text search of the game code
//   node scripts/examples.mjs --kits               how many games use each kit, most used first
//   --json                                          the same as JSON (for tools)
//   --style nextgen                                 only games of one style (phone, pocket, color, advance, console, nextgen, ar, board)
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'), GAMES = join(ROOT, 'src', 'games');

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');   // text from the command line, matched as itself

// Blank comments and string contents (keeping line numbers) so a word in a hint or a comment is no hit.
const blank = s => s
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, m => m[0] + ' '.repeat(m.length - 2) + m[0])
  .replace(/(^|[^:\\])\/\/.*$/gm, (m, p) => p + ' '.repeat(m.length - p.length));

const styleOf = src => {
  const era = (src.match(/\bera\s*:\s*['"`](\w+)['"`]/) || [])[1];
  if (era) return era === 'color' || era === 'advance' ? era : era;
  return /\bretro\s*:\s*true\b/.test(src) ? 'pocket' : 'phone';
};

/** One game's uses of gs: [{ part: 'gs.physics.Physics.rope', line }], plus what it is. */
export function uses(id, text) {
  const code = blank(text), lines = code.split('\n'), named = new Map(), out = [];
  // what each name stands for: const { A, B: C } = gs.kit  /  const k = gs.kit
  for (const m of code.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*(gs(?:\.\w+)+)/g))
    for (const part of m[1].split(',')) {
      const [from, to] = part.split(':').map(s => s.trim().replace(/\s*=.*$/, ''));
      if (/^\w+$/.test(from)) named.set(to && /^\w+$/.test(to) ? to : from, `${m[2]}.${from}`);
    }
  for (const m of code.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(gs(?:\.\w+)+)\s*[;,\n]/g)) named.set(m[1], m[2]);
  // things made from those: x = new Physics(...), x = await Physics.make(...), x = human(...)
  const made = new Map();
  for (const m of code.matchAll(/(?:(?:const|let|var)\s+|[,(]\s*|^\s*)(\w+)\s*=\s*(?:await\s+)?(new\s+)?((?:gs\.)?[\w.]+?)\s*\(/gm)) {
    const head = m[3].split('.')[0], full = m[3].startsWith('gs.') ? m[3] : named.has(head) ? named.get(head) + m[3].slice(head.length) : null;
    if (full) made.set(m[1], full + (m[2] ? '' : '()'));
  }
  lines.forEach((l, i) => {
    const seen = new Set(), add = part => { if (!seen.has(part)) { seen.add(part); out.push({ part, line: i + 1 }); } };
    for (const m of l.matchAll(/\b(gs(?:\.\w+)+)/g)) add(m[1]);
    for (const m of l.matchAll(/(?<![.\w$])(\w+)\s*\.\s*(\w+)\s*\(/g)) {
      if (made.has(m[1])) add(`${made.get(m[1])}.${m[2]}`);
      else if (named.has(m[1])) add(`${named.get(m[1])}.${m[2]}`);
    }
    for (const m of l.matchAll(/(?<![.\w$])(?:new\s+)?(\w+)\s*\(/g)) if (named.has(m[1])) add(named.get(m[1]));
  });
  return out;
}

function index() {
  return readdirSync(GAMES).filter(f => f.endsWith('.js')).sort().map(f => {
    const id = f.slice(0, -3), text = readFileSync(join(GAMES, f), 'utf8'), src = text.split('\n');
    const pick = re => (text.match(re) || [])[1];
    return { id, text, src, size: src.length, style: styleOf(text), tag: pick(/\btag\s*:\s*['"`]([^'"`]+)/), title: pick(/\btitle\s*:\s*['"`]([^'"`]+)/), uses: uses(id, text) };
  });
}

/** Where src/gamescroll.d.ts declares a name: [{ in: 'Physics', line, decl, doc }]. Class.method narrows it. */
export function declared(query) {
  const d = readFileSync(join(ROOT, 'src', 'gamescroll.d.ts'), 'utf8').split('\n');
  const segs = query.replace(/^gs\./, '').split('.'), name = segs.pop(), owner = segs.pop();
  if (!/^\w+$/.test(name || '')) return [];
  const re = new RegExp(`^\\s*(?:export\\s+)?(?:declare\\s+)?(?:static\\s+|readonly\\s+)*(?:(?:class|interface|type|namespace|function|const|let)\\s+)?${esc(name)}\\??\\s*[(:<={]`);
  const out = [];
  d.forEach((l, i) => {
    if (!re.test(l)) return;
    const ind = l.match(/^\s*/)[0].length; let box = null;
    for (let j = i - 1; j >= 0 && ind > 0; j--) {
      const m = d[j].match(/^(\s*)(?:export\s+)?(?:declare\s+)?(?:class|interface|namespace|type|const)\s+(\w+)/);
      if (m && m[1].length < ind) { box = m[2]; break; }
    }
    if (owner && box && box.toLowerCase() !== owner.toLowerCase()) return;
    let doc = []; for (let j = i - 1; j >= 0 && /^\s*(\/\*\*|\*|\/\/)/.test(d[j]); j--) doc.unshift(d[j].trim().replace(/^\/\*\*\s?|^\*\/?\s?|^\/\/\s?|\*\/$/g, '').trim());
    out.push({ in: box, line: i + 1, decl: l.trim().slice(0, 240), doc: doc.filter(Boolean).join(' ').slice(0, 300) });
  });
  return out.slice(0, 6);
}

/** Where docs/maker-kit.md shows a name in use: [{ line, section, text }]. Class.method looks for both. */
export function documented(query) {
  const d = readFileSync(join(ROOT, 'docs', 'maker-kit.md'), 'utf8').split('\n');
  const segs = query.replace(/^gs\./, '').split('.'), name = segs.pop(), owner = segs.pop();
  if (!/^\w+$/.test(name || '')) return [];
  const call = new RegExp(`[.\\s\`(]${esc(name)}\\s*\\(|\`${esc(name)}\``), out = [];
  let section = '', inOwner = !owner;
  d.forEach((l, i) => {
    if (/^#{1,4}\s/.test(l)) { section = l.replace(/^#+\s*/, ''); inOwner = !owner || new RegExp(`\\b${esc(owner)}\\b`, 'i').test(section); }
    if (call.test(l) && (inOwner || (owner && new RegExp(`\\b${esc(owner)}\\b`).test(l)))) out.push({ line: i + 1, section, text: l.trim().slice(0, 240) });
  });
  return out.slice(0, 4);
}

const argv = process.argv.slice(2), JSONOUT = argv.includes('--json');
const opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
const TOP = +(opt('top') || 6), STYLE = opt('style');
const query = argv.filter((a, i) => !a.startsWith('--') && !['--top', '--style'].includes(argv[i - 1])).join(' ').trim();
const kitOf = part => part.split('.').slice(0, 2).join('.');

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('examples.mjs')) {
  let games = index(); if (STYLE) games = games.filter(g => g.style === STYLE);
  if (argv.includes('--kits') || !query) {
    const count = new Map();
    for (const g of games) for (const k of new Set(g.uses.map(u => kitOf(u.part)))) count.set(k, (count.get(k) || 0) + 1);
    const rows = [...count].sort((a, b) => b[1] - a[1]);
    if (JSONOUT) console.log(JSON.stringify(Object.fromEntries(rows), null, 2));
    else {
      if (!query && !argv.includes('--kits')) console.log('Usage: node scripts/examples.mjs <rope | Physics.rope | gs.physics | any text> [--top n] [--style s] [--json]\n');
      console.log(`${games.length} games. Kits by how many games use them:`);
      for (const [k, n] of rows) console.log(`  ${String(n).padStart(4)}  ${k}`);
    }
    process.exit(0);
  }
  const q = query.replace(/\(\)$/, ''), ql = q.toLowerCase();
  const match = part => {
    const p = part.toLowerCase().replace(/\(\)/g, '');
    if (ql.startsWith('gs.')) return p === ql || p.startsWith(ql + '.');
    return p === ql || p.endsWith('.' + ql) || p.includes('.' + ql + '.');
  };
  let hits = games.map(g => ({ g, at: g.uses.filter(u => match(u.part)) })).filter(h => h.at.length);
  let kind = 'kit';
  if (!hits.length) {   // plain text in the code (comments and strings left out, unless the query is about a definition field)
    kind = 'text';
    const re = new RegExp(esc(q).replace(/\s+/g, '\\s*'), 'i');
    hits = games.map(g => { const code = /:/.test(q) ? g.src : blank(g.text).split('\n'); return { g, at: code.map((l, i) => re.test(l) ? { part: q, line: i + 1 } : null).filter(Boolean) }; }).filter(h => h.at.length);
  }
  hits.sort((a, b) => a.g.size - b.g.size);
  const parts = new Map(); for (const h of hits) for (const u of h.at) parts.set(u.part, (parts.get(u.part) || 0) + 1);
  const show = hits.slice(0, TOP).map(({ g, at }) => ({
    id: g.id, title: g.title, tag: g.tag, style: g.style, lines: g.size, file: `src/games/${g.id}.js`,
    at: at.slice(0, 3).map(u => ({ line: u.line, part: u.part, code: g.src.slice(Math.max(0, u.line - 2), u.line + 1).map(s => s.replace(/\s+$/, '')) })),
    alsoUses: [...new Set(g.uses.map(u => kitOf(u.part)))].filter(k => k !== 'gs.util').slice(0, 10),
  }));
  const types = declared(q), docs = hits.length && kind === 'kit' ? [] : documented(q);
  if (JSONOUT) { console.log(JSON.stringify({ query, kind, games: hits.length, parts: Object.fromEntries(parts), types, docs, examples: show }, null, 2)); process.exit(hits.length || types.length || docs.length ? 0 : 1); }
  if (docs.length) {
    console.log(`In docs/maker-kit.md:`);
    for (const t of docs) console.log(`  :${t.line}  (${t.section})\n          ${t.text}`);
    console.log();
  }
  if (types.length) {
    console.log(`In src/gamescroll.d.ts:`);
    for (const t of types) console.log(`  :${t.line}  ${t.in ? t.in + ' › ' : ''}${t.decl}${t.doc ? `\n          ${t.doc}` : ''}`);
    console.log();
  }
  if (!hits.length) { console.log(`No game uses "${query}"${types.length || docs.length ? ' yet: the types and docs above are what there is' : '. Try a shorter name, or look in src/gamescroll.d.ts and docs/maker-kit.md'}.`); process.exit(types.length || docs.length ? 0 : 1); }
  if (kind === 'text') console.log(`No game uses a gs part called "${query}", so these are plain text matches in game code.\n`);
  console.log(`"${query}": ${hits.length} game${hits.length > 1 ? 's' : ''}${kind === 'text' ? ' (text search)' : ''}${parts.size > 1 && parts.size < 12 ? ` (${[...parts].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join(', ')})` : ''}. Shortest first:\n`);
  for (const e of show) {
    console.log(`${e.file}  ${e.title || e.id}  (${e.tag || e.style}, ${e.lines} lines)`);
    for (const a of e.at) {
      console.log(`  :${a.line}  ${kind === 'kit' ? a.part : ''}`);
      for (const [k, s] of a.code.entries()) console.log(`  ${k === Math.min(1, a.line - 1) ? '>' : ' '} ${s.trim().slice(0, 130)}`);
    }
    console.log();
  }
  if (hits.length > TOP) console.log(`...and ${hits.length - TOP} more (--top ${hits.length} lists them all).`);
}
