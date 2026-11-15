// Kit guides sized for AI tools: one short page per part of gs (docs/kits/<kit>.md) and an index, so a
// tool reads the index (in AGENTS.md and docs/kits/README.md) and then only the pages it needs, instead of
// the whole maker kit (300 KB) and the whole types file (385 KB).
//
// Each page has two halves. Above the line `<!-- made below -->` is written by hand: the title, a one-line
// summary (the index takes it from there) and what to know. Below it is remade by this script from what is
// already true: the part's types in src/gamescroll.d.ts, the paragraphs of docs/maker-kit.md that use it
// (with their examples) and the shortest real games that use it. So a new method shows up by itself.
//
//   node scripts/kit-guides.mjs              remake every page's lower half, docs/kits/README.md and AGENTS.md's index
//   node scripts/kit-guides.mjs physics      print one kit's page as it would be now (npm run kit physics)
//   node scripts/kit-guides.mjs --check      say which pages are out of date (exit 1), for the PR check
//   node scripts/kit-guides.mjs --new <kit>  start a page for a new part of gs
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { index as gameIndex } from './examples.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'), DIR = join(ROOT, 'docs', 'kits');
const MARK = '<!-- made below: node scripts/kit-guides.mjs remakes everything under this line from src/gamescroll.d.ts, docs/maker-kit.md and src/games; edit those, or the part above -->';
const IDX0 = '<!-- kit index: made by node scripts/kit-guides.mjs from the first line of each docs/kits page -->', IDX1 = '<!-- end of kit index -->';
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DTS = readFileSync(join(ROOT, 'src', 'gamescroll.d.ts'), 'utf8');
const MK = readFileSync(join(ROOT, 'docs', 'maker-kit.md'), 'utf8');

// ---- the types: interfaces and classes with their members (a small reader, enough for this file's style)
function block(text, open) {   // from the index of a '{' to its match, skipping strings and comments
  let d = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i + 2) + 1; continue; }
    if (c === '/' && text[i + 1] === '/') { i = text.indexOf('\n', i); continue; }
    if (c === "'" || c === '"' || c === '`') { for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++; continue; }
    if (c === '{') d++; else if (c === '}' && --d === 0) return i;
  }
  return text.length;
}
const lineAt = i => DTS.slice(0, i).split('\n').length;
const firstSentence = s => { const m = s.match(/^(.{20,}?[.!?])(\s|$)/); const t = m ? m[1] : s; return t.length > 220 ? t.slice(0, 217).replace(/\s+\S*$/, '') + '…' : t; };
function members(body, base) {   // body without its braces; base = its offset in DTS
  const out = []; let d = 0, start = 0, doc = '';
  const push = end => {
    let t = body.slice(start, end), lead = t.length - t.trimStart().length;
    t = t.trim(); if (!t) return;
    const m = t.match(/^\/\*\*([\s\S]*?)\*\/\s*/); if (m) { doc = m[1].replace(/^\s*\*\s?/gm, '').replace(/\s+/g, ' ').trim(); lead += m[0].length; t = t.slice(m[0].length); }
    t = t.replace(/^(\/\/[^\n]*\n\s*)+/, '');
    const name = (t.match(/^(?:readonly\s+|static\s+|get\s+|set\s+)*(?:new\b|\[|['"]?([\w$]+)['"]?\??\s*[(:<])/) || [])[1] || (t.startsWith('new') ? 'new' : null);
    if (name && t) out.push({ name, sig: t.replace(/\s+/g, ' ').replace(/;$/, ''), doc, line: lineAt(base + start + lead) });
    doc = '';
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '/' && body[i + 1] === '*') { const e = body.indexOf('*/', i + 2); if (d === 0 && body[i + 2] === '*') { /* a doc comment belongs to the next member */ } i = e + 1; continue; }
    if (c === '/' && body[i + 1] === '/') { i = body.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === "'" || c === '"' || c === '`') { for (i++; i < body.length && body[i] !== c; i++) if (body[i] === '\\') i++; continue; }
    if ('{(['.includes(c)) d++; else if ('})]'.includes(c)) d--;
    else if (d === 0 && c === ';') { push(i); start = i + 1; }
    else if (d === 0 && c === '\n') {   // a member on its own line with no ';'
      const before = body.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim(), next = body.slice(i + 1).trimStart();
      if (before && !/[|&,:=(<>]$/.test(before) && !/^[|&=]/.test(next)) { push(i); start = i + 1; }
    }
  }
  push(body.length);
  return out;
}
const TYPES = new Map();   // name -> { kind, line, doc, members }
for (const m of DTS.matchAll(/(\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*)?^(?:export\s+)?(?:declare\s+)?(interface|class)\s+(\w+)[^{\n]*\{/gm)) {
  const open = m.index + m[0].length - 1, close = block(DTS, open);
  TYPES.set(m[4], { kind: m[3], line: lineAt(m.index + (m[1] || '').length), doc: (m[2] || '').replace(/^\s*\*\s?/gm, '').replace(/\s+/g, ' ').trim(), members: members(DTS.slice(open + 1, close), open + 1) });
}
const GS = TYPES.get('GS');
const KITS = GS.members.filter(m => m.name !== 'THREE').map(m => ({ kit: m.name, type: m.sig.replace(/^\w+\??:\s*/, ''), doc: m.doc }));
function made(sig) {   // the named types a member makes or is: new (...) => Foo, (...) => Foo, : Foo, typeof Foo
  const t = sig.replace(/^[\w$]+\??\s*:\s*/, '');
  const ret = t.match(/=>\s*([A-Z]\w+)\s*(?:&|$|;|\|)/) || t.match(/^typeof\s+([A-Z]\w+)$/) || t.match(/^([A-Z]\w+)$/);
  return ret && TYPES.has(ret[1]) ? ret[1] : null;
}

// ---- the guide: docs/maker-kit.md paragraphs that use the kit, with their code
function guideBits(kit) {
  const lines = MK.split('\n'), out = []; let section = '', anchor = '', i = 0, home = null, first = false;
  const re = new RegExp(`\\bgs\\.${esc(kit)}\\b`);
  const slug = h => h.toLowerCase().replace(/[`*_]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
  while (i < lines.length) {
    const l = lines[i];
    if (/^#{1,4}\s/.test(l)) { section = l.replace(/^#+\s*/, ''); anchor = slug(section); home = null; first = true; i++; continue; }
    if (!l.trim()) { i++; continue; }
    let j = i, fence = false; const para = [];   // a paragraph, or a list, or a code fence with what it explains
    while (j < lines.length && (fence || (lines[j].trim() && !/^#{1,4}\s/.test(lines[j])))) { if (/^```/.test(lines[j])) fence = !fence; para.push(lines[j]); j++; }
    let k = j; while (k < lines.length && !lines[k].trim()) k++;   // a code fence after a blank line goes with the paragraph
    if (!/^```/.test(para[0]) && /^```/.test(lines[k] || '')) { para.push(''); let e = k + 1; while (e < lines.length && !/^```/.test(lines[e])) e++; para.push(...lines.slice(k, e + 1)); j = e + 1; }
    let text = para.join('\n');
    if (/^\|/.test(para[0])) text = '';   // tables are overviews of many kits
    else if (/^\s*[-*] /.test(para[0])) {   // a list: only its items that use the kit
      const items = []; for (const l of para) { if (/^[-*] /.test(l) || !items.length) items.push([l]); else items[items.length - 1].push(l); }
      text = items.filter(it => re.test(it.join('\n'))).map(it => it.join('\n')).join('\n');
    }
    const kits = new Set((text.match(/\bgs\.(\w+)/g) || []));
    // the kit's own section (its first paragraph names the kit) is taken whole; elsewhere, what names it
    if (first) { home = re.test(para.join('\n').slice(0, 400)) && !/^\|/.test(para[0]); first = false; }
    if (home && !/^\|/.test(para[0])) out.push({ section, anchor, text: para.join('\n'), line: i + 1, home: true });
    else if (text && kits.size <= 5 && (re.test(text) || re.test(section))) out.push({ section, anchor, text, line: i + 1 });
    i = j;
  }
  return out;
}

// ---- the real games that use it, shortest first
let GAMES = null;
function inGames(kit) {
  GAMES ||= gameIndex();
  const pre = `gs.${kit}`, hits = GAMES.map(g => ({ g, at: g.uses.filter(u => u.part === pre || u.part.startsWith(pre + '.')) })).filter(h => h.at.length);
  hits.sort((a, b) => a.g.size - b.g.size);
  return { count: hits.length, show: hits.slice(0, 2) };
}

// ---- one page's lower half
function lower(kit) {
  const k = KITS.find(x => x.kit === kit), out = [MARK, ''];
  const T = TYPES.get(k.type);
  out.push(`## What's in it`, '', `From \`src/gamescroll.d.ts\`${T ? ` (\`${k.type}\`, line ${T.line})` : ''}, where every option and field is described.`, '');
  const list = T ? T.members : [{ name: kit, sig: `${kit}: ${k.type}`, doc: k.doc, line: GS.line }];
  let n = 0; const MAX = 90, seen = new Set();
  const say = (m, ind = '') => { n++; out.push(`${ind}- \`${m.sig.length > 170 ? m.sig.slice(0, 167) + '…' : m.sig}\`${m.doc ? ' ' + firstSentence(m.doc) : ''} (:${m.line})`); };
  for (const m of list) {
    if (n >= MAX) break;
    say(m);
    const sub = made(m.sig);
    if (sub && !seen.has(sub) && sub !== k.type) {
      seen.add(sub); const S = TYPES.get(sub);
      for (const s of S.members.slice(0, 45)) { if (n >= MAX) break; say(s, '  '); }
      if (S.members.length > 45) out.push(`  - …${S.members.length - 45} more in \`${sub}\` (:${S.line})`);
    }
  }
  if (n >= MAX) out.push(`- …more: \`${k.type}\` at src/gamescroll.d.ts:${T?.line}`);
  const bits = guideBits(kit);
  if (bits.length) {
    out.push('', '## From the maker kit', '');
    let size = 0, shown = '';
    for (const b of bits) {
      if (size > 7000) { out.push(`More in docs/maker-kit.md: ${[...new Set(bits.slice(bits.indexOf(b)).map(x => `"${x.section}"`))].join(', ')}.`); break; }
      if (b.section !== shown) { out.push(`From [${b.section}](../maker-kit.md#${b.anchor}):`, ''); shown = b.section; }
      out.push(b.text, ''); size += b.text.length;
    }
  }
  const g = inGames(kit);
  out.push('', `## In real games`, '');
  if (!g.count) out.push(`No game uses \`gs.${kit}\` yet: the examples above are what there is.`);
  else {
    out.push(`${g.count} game${g.count > 1 ? 's use' : ' uses'} it (\`node scripts/examples.mjs gs.${kit}\` lists them). The shortest:`, '');
    for (const { g: game, at } of g.show) {
      out.push(`\`src/games/${game.id}.js\` (${game.title || game.id}, ${game.tag || game.style}, ${game.size} lines):`, '', '```js');
      const want = [...new Set(at.map(u => u.line))].slice(0, 8); let last = -9;
      for (const ln of want) { if (ln > last + 1 && last > 0) out.push('// …'); for (let x = Math.max(ln - 1, last + 1); x <= ln; x++) out.push(game.src[x - 1].replace(/\s+$/, '').slice(0, 150)); last = ln; }
      out.push('```', '');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// ---- pages, the index
const pagePath = kit => join(DIR, kit + '.md');
function upper(kit) {
  const p = pagePath(kit); if (!existsSync(p)) return null;
  const t = readFileSync(p, 'utf8'), i = t.indexOf(MARK);
  return (i < 0 ? t : t.slice(0, i)).replace(/\n{3,}/g, '\n\n').trimEnd() + '\n\n';
}
const summary = up => (up.split('\n').find((l, i) => i > 0 && l.trim() && !l.startsWith('#')) || '').trim();
function indexLines() {
  const rows = [];
  for (const { kit } of KITS) {
    const up = upper(kit); if (!up) continue;
    rows.push(`- [\`gs.${kit}\`](docs/kits/${kit}.md): ${summary(up)}`);
  }
  return rows;
}

const argv = process.argv.slice(2), CHECK = argv.includes('--check'), NEW = argv.includes('--new');
const one = argv.find(a => !a.startsWith('--'));
if (NEW) {
  if (!one || !KITS.find(k => k.kit === one)) { console.error(`--new <kit>: the kit must be in src/gamescroll.d.ts's GS first (kits: ${KITS.map(k => k.kit).join(' ')})`); process.exit(1); }
  if (existsSync(pagePath(one))) { console.error(`docs/kits/${one}.md is already there`); process.exit(1); }
  writeFileSync(pagePath(one), `# gs.${one}\n\nOne line on what it is and when to use it (the index takes this line).\n\nWhat to know, and a short example.\n\n` + lower(one));
  console.log(`wrote docs/kits/${one}.md: write its top half, then node scripts/kit-guides.mjs`); process.exit(0);
}
if (one) {
  const kit = one.replace(/^gs\./, '').split('.')[0];
  if (!KITS.find(k => k.kit === kit)) { console.error(`no gs.${kit} (kits: ${KITS.map(k => k.kit).join(' ')})`); process.exit(1); }
  console.log((upper(kit) || `# gs.${kit}\n\n(no page yet: node scripts/kit-guides.mjs --new ${kit})\n\n`) + lower(kit));
  process.exit(0);
}
mkdirSync(DIR, { recursive: true });
const stale = [], missing = [];
for (const { kit } of KITS) {
  const up = upper(kit); if (!up) { missing.push(kit); continue; }
  const want = up + lower(kit), have = readFileSync(pagePath(kit), 'utf8');
  if (want !== have) { stale.push(kit); if (!CHECK) writeFileSync(pagePath(kit), want); }
}
const rows = indexLines();
const readme = `# Kit guides\n\nOne short page for each part of \`gs\`: what it is, what to know, its types, the maker kit's examples and the\nshortest real games that use it. Read the line here, then the page you need. \`npm run kit <name>\` prints a page as it\nis now; \`node scripts/examples.mjs <name>\` finds every game that uses a part. The long form is [the maker kit](../maker-kit.md).\n\n${rows.map(r => r.replace('](docs/kits/', '](')).join('\n')}\n`;
const rp = join(DIR, 'README.md');
if (!existsSync(rp) || readFileSync(rp, 'utf8') !== readme) { stale.push('README'); if (!CHECK) writeFileSync(rp, readme); }
const ap = join(ROOT, 'AGENTS.md'), agents = readFileSync(ap, 'utf8'), a0 = agents.indexOf(IDX0), a1 = agents.indexOf(IDX1);
if (a0 >= 0 && a1 > a0) {
  const next = agents.slice(0, a0 + IDX0.length) + '\n' + rows.join('\n') + '\n' + agents.slice(a1);
  if (next !== agents) { stale.push('AGENTS.md index'); if (!CHECK) writeFileSync(ap, next); }
}
if (CHECK) {
  // fails only for what a maker must do by hand: a part of gs with no page, an index out of step. Lower halves that
  // are behind (a new method, a new game using a kit) are a note: the next run of this script catches them up.
  const index = stale.filter(x => x === 'README' || x === 'AGENTS.md index'), pages = stale.filter(x => !index.includes(x));
  if (missing.length) console.log(`no page yet for: ${missing.map(k => 'gs.' + k).join(', ')}: node scripts/kit-guides.mjs --new <kit>, write its top half, then node scripts/kit-guides.mjs`);
  if (index.length) console.log(`the kit index is out of step (${index.join(', ')}): run node scripts/kit-guides.mjs and commit what it changes`);
  if (pages.length) console.log(`note: ${pages.length} page${pages.length > 1 ? 's are' : ' is'} behind the types, maker kit or games (${pages.slice(0, 8).join(', ')}${pages.length > 8 ? '...' : ''}); node scripts/kit-guides.mjs catches them up`);
  if (!missing.length && !index.length) console.log(`kit guides: ${KITS.length} pages, index up to date`);
  process.exit(missing.length || index.length ? 1 : 0);
}
console.log(`kit guides: ${stale.length ? 'remade ' + stale.join(', ') : 'nothing to change'}${missing.length ? `; no page yet for ${missing.join(', ')}` : ''}`);
