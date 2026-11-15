// Reads and writes a game's knobs: the numbers in its gs.tweak('Feel', { ... }) blocks, straight from the
// source text (nothing is run). Used by scripts/knobs.mjs (the command line), scripts/check.mjs (the report
// lists them), the dev server's "Save to file" button on the slider panel (vite.config.js), and AI tools.
//
//   readKnobs(src)                      -> [{ folder, key, value, min, max, step, says, line, kind }]
//   writeKnobs(src, { 'Feel.speed': 140, 'Feel.jump': 60 })  -> { src, changed: [...], missing: [...] }
//
// A knob is an entry of the spec: speed: 3, grip: [.8, 0, 1, .01, 'how hard the tyres hold'], drift: true,
// paint: '#ff8800', mode: ['easy', 'easy', 'hard']. Only its value is rewritten; the range, the words and
// the comments after it stay as they were. Entries that aren't plain values (a function, W / 2) are skipped.

// Index of the bracket that closes the one at i (strings, template strings and comments skipped), or -1.
function closing(s, i) {
  const open = s[i], shut = { '{': '}', '[': ']', '(': ')' }[open]; let depth = 0;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (ch === '/' && s[j + 1] === '/') { j = s.indexOf('\n', j); if (j < 0) return -1; continue; }
    if (ch === '/' && s[j + 1] === '*') { j = s.indexOf('*/', j + 2); if (j < 0) return -1; j++; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { for (j++; j < s.length && s[j] !== ch; j++) if (s[j] === '\\') j++; continue; }
    if ('{[('.includes(ch)) depth++;
    else if ('}])'.includes(ch)) { depth--; if (depth === 0) return ch === shut ? j : -1; }
  }
  return -1;
}

// The top-level entries of an object literal's text between its braces: [{ key, start, end }] (start/end of the value).
function entries(s, from, to) {
  const out = []; let i = from;
  while (i < to) {
    while (i < to && /[\s,]/.test(s[i])) i++;
    if (s.startsWith('//', i)) { i = s.indexOf('\n', i); if (i < 0 || i > to) break; continue; }
    if (s.startsWith('/*', i)) { i = s.indexOf('*/', i) + 2; continue; }
    const m = s.slice(i, to).match(/^(?:(['"])((?:(?!\1).)+)\1|([A-Za-z_$][\w$]*))\s*:\s*/);
    if (!m) { // something else (a spread, a method): skip to the next comma at this level
      let j = i; while (j < to && s[j] !== ',') { if ('{[('.includes(s[j])) { j = closing(s, j); if (j < 0) return out; } j++; } i = j + 1; continue;
    }
    const key = m[2] || m[3], start = i + m[0].length;
    let j = start;
    while (j < to && s[j] !== ',' && s[j] !== '\n' && !s.startsWith('//', j)) {
      if ('{[('.includes(s[j])) { j = closing(s, j); if (j < 0) return out; }
      else if ("'\"`".includes(s[j])) { const q = s[j]; for (j++; j < to && s[j] !== q; j++) if (s[j] === '\\') j++; }
      j++;
    }
    let end = j; while (end > start && /\s/.test(s[end - 1])) end--;
    out.push({ key, start, end });
    i = j;
  }
  return out;
}

// A plain value's text as data, or undefined: numbers (.5, -2, 1e3), strings, booleans, arrays of those.
function value(text) {
  const t = text.trim();
  if (/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(t)) return +t;
  if (t === 'true' || t === 'false') return t === 'true';
  if (/^(['"])(?:(?!\1)[^\\]|\\.)*\1$/.test(t)) return t.slice(1, -1).replace(/\\(.)/g, '$1');
  if (t[0] === '[' && t.endsWith(']')) {
    const parts = [], body = t.slice(1, -1); let cur = '', q = null;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (q) { cur += ch; if (ch === '\\') cur += body[++i]; else if (ch === q) q = null; continue; }
      if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
      if (ch === ',') { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) parts.push(cur);
    const vals = parts.map(value);
    return vals.every(v => v !== undefined && !Array.isArray(v)) ? vals : undefined;
  }
  return undefined;
}

// What a spec value means: { value, min, max, step, says, kind }.
export function knob(v) {
  if (typeof v === 'number') return { value: v, kind: 'number', min: v < 0 ? v * 3 : 0, max: v > 0 ? v * 3 : v < 0 ? 0 : 1 };
  if (typeof v === 'boolean') return { value: v, kind: 'switch' };
  if (typeof v === 'string') return { value: v, kind: /^#[0-9a-f]{3,8}$/i.test(v) ? 'colour' : 'text' };
  if (Array.isArray(v) && typeof v[0] === 'number') {
    const says = typeof v[v.length - 1] === 'string' ? v[v.length - 1] : undefined;
    return { value: v[0], kind: 'number', min: v[1], max: v[2], step: typeof v[3] === 'number' ? v[3] : undefined, says };
  }
  if (Array.isArray(v) && typeof v[0] === 'string') return { value: v[0], kind: 'choice', choices: v.slice(1) };
  return null;
}

/** Every gs.tweak block in a game's source. */
export function readKnobs(src) {
  const out = [], lineAt = i => src.slice(0, i).split('\n').length;
  for (const m of src.matchAll(/\b(?:gs\s*\.\s*)?tweak\s*\(\s*(?:(['"`])([^'"`]+)\1\s*,\s*)?\{/g)) {
    const open = m.index + m[0].length - 1, shut = closing(src, open); if (shut < 0) continue;
    const folder = m[2] || 'Tweaks';
    for (const e of entries(src, open + 1, shut)) {
      const k = knob(value(src.slice(e.start, e.end))); if (!k) continue;
      // the comment after the entry on the same line, for knobs whose words are there instead
      const rest = src.slice(e.end, src.indexOf('\n', e.end) < 0 ? undefined : src.indexOf('\n', e.end)), note = (rest.match(/\/\/\s*(.+)$/) || [])[1];
      out.push({ folder, key: e.key, ...k, says: k.says || note?.trim(), line: lineAt(e.start), at: [e.start, e.end] });
    }
  }
  return out;
}

const literal = v => typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : typeof v === 'number' ? String(+v.toFixed(4)).replace(/^0\./, '.').replace(/^-0\./, '-.') : String(v);

/** Rewrites knob values: changes { 'Feel.speed': 140 } (or 'speed' when there is one block). */
export function writeKnobs(src, changes) {
  const all = readKnobs(src), changed = [], missing = [], edits = [];
  for (const [name, v] of Object.entries(changes)) {
    const [f, k] = name.includes('.') ? name.split('.') : [null, name];
    const hit = all.filter(x => x.key === k && (!f || x.folder === f));
    if (hit.length !== 1) { missing.push(name); continue; }
    const h = hit[0];
    if (h.kind === 'number' && !(typeof v === 'number' && Number.isFinite(v))) { missing.push(name); continue; }
    if (h.kind === 'switch' && typeof v !== 'boolean') { missing.push(name); continue; }
    if (h.kind === 'colour' && !(typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v))) { missing.push(name); continue; }
    if (h.kind === 'choice' && !h.choices.includes(v)) { missing.push(name); continue; }
    if (h.kind === 'text' && typeof v !== 'string') { missing.push(name); continue; }
    if (h.value === v) continue;
    const text = src.slice(h.at[0], h.at[1]);
    // only the value itself: the first element of a [value, min, max...] array, or the whole plain value
    const next = text.trim()[0] === '[' ? text.replace(/^(\s*\[\s*)([^,\]]+)/, (m0, a) => a + literal(v)) : literal(v);
    edits.push([h.at[0], h.at[1], next]); changed.push({ name: `${h.folder}.${h.key}`, from: h.value, to: v, line: h.line });
  }
  for (const [a, b, t] of edits.sort((x, y) => y[0] - x[0])) src = src.slice(0, a) + t + src.slice(b);
  return { src, changed, missing };
}

/** Changes asked for as text: 'Folder.knob=value' or 'knob*factor' (a number knob scaled, kept in its range).
 *  Returns { changes: { name: value }, bad: [text it couldn't read] }. */
export function parseChanges(knobs, args) {
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
  return { changes, bad };
}
