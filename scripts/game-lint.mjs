// Flags game code that reaches outside its own game: the network, saved data, the phone's native
// features (Capacitor), other windows, or tricks that hide what code does. Games get everything they
// need from the shared kit (src/kit/*.js, src/sfx.js ...), which saves progress, plays sound and
// buzzes the phone for them, so a game file never needs any of this.
//
// Used by .github/workflows/game-pr-check.yml on every pull request. A flag doesn't mean the code is
// bad, but a maintainer must read that part before merging.
//
//   node scripts/game-lint.mjs                 checks every game in src/games/
//   node scripts/game-lint.mjs <id or file>... checks just those
//
// It also gives kit hints: places where a game does by hand what a kit already does (particles, screen
// shake, a thumbstick, waiting for the first tap, a fixed step, timers on the wall clock...). A hint is
// advice, never a failure: how a game looks and plays is the game's choice. Hints show for the games
// you name; a run over every game only counts them (--hints lists them all, --no-hints hides them).
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_MODULES } from '../src/game-modules.js';
import { GLYPHS } from '../src/kit/pixel-glyphs.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'), GAMES = join(ROOT, 'src', 'games');

const RULES = [
  // network
  [/\bfetch\s*\(/, 'network: fetch()'],
  [/\b(XMLHttpRequest|WebSocket|EventSource|WebTransport|RTCPeerConnection|RTCDataChannel)\b/, 'network: $1'],
  [/\bsendBeacon\b/, 'network: navigator.sendBeacon'],
  [/\b(import\s*\(|importScripts)/, 'loads code: dynamic import'],
  [/\b(Worker|SharedWorker)\s*\(|\bserviceWorker\b/, 'background worker'],
  [/\bcreateElement\s*\(\s*['"`](script|iframe|img|link|a|form|object|embed|video|audio|source)['"`]/i, 'creates a <$1> element (can load from the network)'],
  [/\bcreateElement\s*\(\s*(?!['"`](canvas|script|iframe|img|link|a|form|object|embed|video|audio|source)['"`])/i, 'creates an element other than a <canvas> (games draw on canvases only)'],
  [/\.\s*(src|href|srcset|action|srcObject)\s*=(?!=)|setAttribute\s*\(\s*['"`](src|href|srcset|action)/, 'sets a src/href (can load from the network)'],
  [/\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/, 'writes raw HTML ($1)'],
  [/\b((?:window|document)\s*\.\s*location|location\s*\.\s*(?:href|assign|replace|reload)|window\s*\.\s*open)\b/, 'navigation: $1'],
  // saved data and the native bridge
  [/\b(localStorage|sessionStorage|indexedDB|caches|cookieStore)\b/, 'storage: $1 (use the kit\'s progress/store helpers)'],
  [/\bdocument\.cookie\b/, 'storage: document.cookie'],
  [/\bCapacitor\b|@capacitor\//, 'native: Capacitor (use the kit: haptics, sensors, share...)'],
  [/\bnavigator\s*\.\s*geolocation\b|\bGeolocation\b/, 'location: reads it directly (use api.location(), which rounds it and asks at play time)'],
  [/\blocation\s*:\s*['"`]precise['"`]/, "location: 'precise' (about 10 m). Check the game really needs walk-around precision; 'coarse' is enough to seed a level"],
  [/\b(window\.(parent|top|opener)|postMessage|BroadcastChannel)\b/, 'talks to other windows ($1)'],
  // hiding what code does
  [/\beval\s*\(|\bFunction\s*\(|\bconstructor\s*\.\s*constructor\b|\[\s*['"`]constructor['"`]\s*\]/, 'runs code from a string'],
  [/\bsetTimeout\s*\(\s*['"`]|\bsetInterval\s*\(\s*['"`]/, 'runs code from a string (setTimeout/setInterval)'],
  [/\b(globalThis)\b|\b(?:window|self|document)\s*\[/, 'reaches global objects indirectly ($1)'],
  [/\b(atob|btoa|unescape|decodeURIComponent)\b/, 'decodes hidden strings ($1)'],
  [/\\x[0-9a-f]{2}|\\u\{?[0-9a-f]{4}/i, 'escaped characters in a string (often used to hide code)'],
  [/\b(Reflect|Proxy|__proto__|defineProperty|getOwnPropertyDescriptor)\b/, 'changes how objects work ($1)'],
  [/\bimport\b[^;]*?\bfrom\s*['"`](?!\.\.?\/)/, 'imports a package from outside the app (only ../gamescroll.js is allowed)'],
  [/\bimport\s*['"`](?!\.\.?\/)/, 'imports a package from outside the app'],
  [/\brequire\s*\(/, 'require() (use import from the kit)'],
  [/\b__(gs|hd)\b/, 'uses the app\'s test hooks (__$1)'],
  [/\bdocument\s*\.\s*(querySelector|querySelectorAll|getElementById|getElementsBy\w+|body|documentElement)\b/, 'reaches into the app\'s page (document.$1)'],
];
// Warnings: allowed, but worth a look. They don't fail the check.
const WARN_RULES = [
  // letters from numbers are normal in word and grid games, but the same call can spell out hidden code
  [/\b(fromCharCode|fromCodePoint)\b/, "builds text from character numbers ($1). Fine for letters (gs.util.letter(i) gives 'A' + i without it); a maintainer checks it doesn't spell out hidden code"],
  // the 3D is moving to WebGPU later (docs/webgpu-move.md); shaders written for WebGL won't move with it
  [/\b(ShaderMaterial|RawShaderMaterial|onBeforeCompile|ShaderChunk|ShaderLib)\b/, "writes its own WebGL shader ($1). It won't carry over to WebGPU: prefer the kit's materials (gs.hd.pbr, gs.toon, stock three.js materials) and its looks (v.air, v.grade, gs.outdoors)"],
];
// Checked with the text of strings blanked out too, so a hint that says "window" isn't flagged.
// Games never need any of these: gs and api cover it, and document only for createElement('canvas').
const CODE_RULES = [
  [/(?<![\w$.])(window|navigator)\b(?!\s*:)/, 'reaches the app\'s window ($1)'],
  [/(?<![\w$.])document\s*(?:\[|\.\s*(?!createElement\b)(\w+))/, 'reaches into the app\'s page (document.$1)'],
  [/\b(ownerDocument|defaultView|getRootNode|contentWindow|contentDocument)\b/, 'reaches the app\'s page or window ($1)'],
  [/\.\s*constructor\b/, 'reaches a constructor (a way to run code from a string)'],
  [/\.\s*prototype\b|\bsetPrototypeOf\b/, 'changes built-in objects (prototype), which every game and the app share'],
  [/\b(Object|Array|Math|JSON|Date|Promise|Number|String|console|performance)\s*\.\s*(\w+)\s*=(?!=)/, 'replaces a built-in ($1.$2), which every game and the app share'],
];

// Kit hints. at: the line the hint points to (the first match). unless: the game already uses the kit.
// only: styles it applies to. file: true says it's about the whole game (it points at the definition).
// text: true reads inside strings too (a font name is in one).
const pixelStyle = src => /\bretro\s*:\s*true\b/.test(src) && !/\bera\s*:\s*['"`](console|nextgen|ar|board)['"`]/.test(src);
const HINTS = [
  { at: /\b\w*(parts|particles|sparks|puffs|debris|confetti|dust|bits|chips|shards)\w*\s*\.push\s*\(\s*\{[^}]*\b(vx|vy|life)\b/i, unless: /\b(Feel|Juice)\b/,
    why: 'particles by hand. gs.effects.Feel does particles, shake, sound and a buzz in one call (feel.coin(x, y), feel.hit, feel.boom), and gs.juice.Juice is the particles alone; both follow the player\'s Reduce motion setting' },
  { at: /translate\s*\([^)]*\bshake/i, unless: /\b(Feel|Juice)\b/,
    why: 'screen shake by hand ignores the player\'s Reduce motion setting. feel.begin(c) ... feel.end(c, W, H) (gs.effects.Feel) or gs.juice.Juice shake for you and follow it' },
  { at: /\b(stick|joystick|joy)\s*=\s*\{/i, unless: /\b(Stick|twoThumb)\b/,
    why: 'a thumbstick by hand. gs.controls.Stick (floating, dead zone, one axis) and twoThumb(W, H) are ready, and arrow keys and controllers come with gs.controls.Keys' },
  { at: /\b(setTimeout|setInterval)\s*\(/,
    why: '$1 keeps running while the game is paused and behind the game-over screen. Count dt in update(), or use gs.math.Timers (they pause with the game)' },
  { at: /\bDate\s*\.\s*now\s*\(/,
    why: 'Date.now() keeps counting while the game is paused. Count dt in update() for game time (gs.math.daily() for a puzzle of the day)' },
  { at: /\bperformance\s*\.\s*now\s*\(/, unless: /\bflickTracker\b/,
    why: 'performance.now() keeps counting while the game is paused. Count dt in update() for game time; for how fast a finger flicked, gs.util.flickTracker measures it' },
  { at: /\b(started|begun)\s*=\s*false\b/, unless: /\bReady\b/,
    why: 'waiting for the first tap by hand. gs.rounds.Ready does it: if (!ready.update(dt)) return; in update(), if (ready.go()) return; in down(), and ready.draw(c, W, H) for the prompt' },
  { at: /\bwhile\s*\(\s*acc\w*\s*>=?/, unless: /\btick\s*:/,
    why: 'a fixed step by hand. tick: 60 in the definition calls update(1/60) a whole number of times a frame on every phone, and gs.tick.mix(before, now) draws between ticks' },
  { at: /\.\s*fillText\s*\(/, only: pixelStyle,
    why: 'fillText in a pixel style comes out smoothed (soft edges and in-between shades). gs.pixel.text(c, str, x, y, { color, align }) draws crisp pixel letters' },
  { text: true, at: /px\s+[^;]*?\b(Arial|Helvetica|Courier New|Courier|Impact|Georgia|Verdana|Tahoma|Trebuchet MS|Times New Roman|Times|Comic Sans MS|Lucida Console|Menlo|Monaco|Consolas|Segoe UI|Roboto|Futura|Palatino|Garamond|system-ui|ui-monospace|ui-rounded|ui-serif|cursive|fantasy)\b/,
    why: '$1 is one of the phone\'s own fonts: it looks different on each phone and some phones don\'t have it. gs.fonts has 13 that look the same everywhere, loaded on first use: c.font = gs.fonts.font(\'Courier Prime\', 14) for a typewriter, \'Bangers\', \'Orbitron\', \'Creepster\', \'Rye\'... (docs/maker-kit.md, Fonts)' },
  { text: true, at: /[\u{1F000}-\u{1FAFF}]/u, unless: /\bicons\b/,
    why: 'an emoji is a different picture on every phone, and some phones don\'t have the newer ones. gs.icons draws 528 icons that look the same everywhere, in any colour: icon(c, \'heart\', x, y, 24, { color: \'#ff5470\' }) (docs/maker-kit.md, Icons)' },
  { file: true, unless: /\b(haptic|hapticPattern|buzz|rumble|Feel)\b/,
    why: 'no haptics. A light buzz on a score and a stronger one on a hit make a phone game feel better: gs.device.haptic(\'light\'), or feel.coin / feel.hit (gs.effects.Feel), which buzz for you' },
  { file: true, unless: /\btweak\s*\(/,
    why: 'no knobs. Keep the numbers that set how it feels (speeds, gravity, gaps between spawns, lives) in one block, const K = gs.tweak(\'Feel\', { speed: [110, 40, 240, \'how fast you slide\'] }), and read K.speed where it is used: then "slower" or "floatier" is one number, sliders tune it in npm run dev and Save to file writes it back (docs/feel-words.md)' },
  { file: true, unless: /\bmusic\b|\bstartMic\b|\bgs\s*\.\s*(hear|rhythm)\b/,
    why: 'no music. music: \'chase\' in the definition (or happy, calm, tense, spooky, heroic, sad, silly, puzzle) gives the rounds an original tune that follows the action, in one line' },
];
/** Kit hints for one game: [{ line, why, code }]. Advice only. */
export function hints(file) {
  const src = stripComments(readFileSync(file, 'utf8')), code = stripStrings(src), lines = code.split('\n'), real = src.split('\n'), out = [];
  const defLine = Math.max(0, real.findIndex(l => /^\s*export\s+default\b/.test(l)));
  for (const h of HINTS) {
    if (h.only && !h.only(src)) continue;
    if (h.unless && h.unless.test(code)) continue;
    if (h.file) { out.push({ line: defLine + 1, why: h.why, code: real[defLine].trim().slice(0, 120) }); continue; }
    const from = h.text ? real : lines, i = from.findIndex(l => h.at.test(l)); if (i < 0) continue;
    const m = from[i].match(h.at);
    out.push({ line: i + 1, why: h.why.replace('$1', m[1] || m[0]), code: real[i].trim().slice(0, 120) });
  }
  out.push(...glyphHints(src, real));
  return out.sort((a, b) => a.line - b.line);
}

// Letters the built-in 3×5 pixel font hasn't got (gs.pixel.text without a font, Ready({ pixel: true })): they
// are drawn as '?'. Read from the game's strings when it uses that font; one hint a letter, at its first line.
const usesTinyFont = src => /\bgs\s*\.\s*pixel\b|\bpixel\s*:\s*true\b/.test(src);
const hasGlyph = ch => ch in GLYPHS || ch.toUpperCase() in GLYPHS || ch === '\n';
function glyphHints(src, real) {
  if (!usesTinyFont(src)) return [];
  const out = [], seen = new Set();
  real.forEach((line, i) => {
    for (const m of line.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
      const str = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, '');
      if (/\b(hint|title|tag|creator|id|description)\s*:\s*$/.test(line.slice(0, m.index))) continue;   // (the card's words: the app draws them)
      if (!/[a-z ]/i.test(str)) continue;   // (colours, sprite art, keys: not words)
      for (const ch of str) {
        if (hasGlyph(ch) || seen.has(ch) || ch.charCodeAt(0) < 32) continue;
        seen.add(ch);
        const u = 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
        out.push({ line: i + 1, code: line.trim().slice(0, 120),
          why: `'${ch}' (${u}) isn't in the built-in 3×5 pixel font, so gs.pixel.text and Ready({ pixel: true }) draw it as '?'. Use one it has (letters, digits, . , ! ? : ; - + = / ( ) ' " % * < > # _ [ ] ♥ ♪ × $ @ & · ° – … ← → ↑ ↓ | ^ ~ { }) or a font: { font: 'big' }` });
      }
    }
  });
  return out;
}

// Blank out comments but keep line numbers, so a comment like "// no fetch here" isn't flagged.
const stripComments = s => s
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:\\'"`])\/\/.*$/gm, (m, p) => p + ' '.repeat(m.length - p.length));

// Blank the text inside strings (keeping the quotes and line numbers). The code inside a template string's
// ${...} is kept, so it is still checked. (A scanner, not one regular expression: a template with ${...} in it
// once made the expression start at its closing quote and blank the code up to the next template string,
// which hid a gs.tweak() call and gave a "no knobs" hint to a game that had them.)
export function stripStrings(s) {
  const n = s.length, out = [], blank = c => (c === '\n' ? c : ' ');
  const holes = [];   // for each ${ open: the depth of { } inside it
  let i = 0, inTpl = false;
  const tpl = () => {   // inside a template's text, from after its opening quote or a }
    while (i < n) {
      const c = s[i];
      if (c === '\\') { out.push(' ', blank(s[i + 1] ?? '')); i += 2; continue; }
      if (c === '`') { out.push('`'); i++; inTpl = false; return; }
      if (c === '$' && s[i + 1] === '{') { out.push('${'); i += 2; holes.push(0); inTpl = false; return; }
      out.push(blank(c)); i++;
    }
  };
  while (i < n) {
    if (inTpl) { tpl(); continue; }
    const c = s[i];
    if (c === "'" || c === '"') {
      let j = i + 1; while (j < n && s[j] !== c && s[j] !== '\n') j += s[j] === '\\' ? 2 : 1;
      if (s[j] !== c) { out.push(c); i++; continue; }   // (not closed on its line: left as it is)
      out.push(c); for (let k = i + 1; k < j; k++) out.push(blank(s[k])); out.push(c); i = j + 1; continue;
    }
    if (c === '`') { out.push('`'); i++; inTpl = true; continue; }
    if (holes.length) {
      if (c === '{') holes[holes.length - 1]++;
      else if (c === '}') { if (holes[holes.length - 1] === 0) { holes.pop(); out.push('}'); i++; inTpl = true; continue; } holes[holes.length - 1]--; }
    }
    out.push(c); i++;
  }
  return out.join('');
}

export function lint(file) {
  const src = stripComments(readFileSync(file, 'utf8')), code = stripStrings(src).split('\n'), out = [];
  const lines = src.split('\n'), flag = (rules, text, i) => {
    for (const [re, why] of rules) {
      const m = text.match(re);
      if (m) out.push({ line: i + 1, why: why.replace('$1', m[1] || m[0]).replace('$2', m[2] || ''), code: lines[i].trim().slice(0, 120) });
    }
  };
  lines.forEach((line, i) => {
    flag(RULES, line, i); flag(CODE_RULES, code[i] ?? '', i);
    for (const [re, why] of WARN_RULES) { const m = (code[i] ?? '').match(re); if (m) out.push({ line: i + 1, warn: true, why: why.replace('$1', m[1] || m[0]), code: lines[i].trim().slice(0, 120) }); }
  });
  // Shared modules: only the ones games are given (src/game-modules.js), without their hidden exports.
  const SRC = join(ROOT, 'src');
  src.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/\bimport\s*(?:\{([^}]*)\}|\*\s*as\s+\w+|\w+)?\s*(?:from\s*)?['"`](\.\.?\/[^'"`]+)['"`]/g)) {
      const abs = resolve(dirname(file), m[2]);
      if (!abs.startsWith(SRC) || abs.startsWith(GAMES)) continue;
      const key = abs.slice(SRC.length + 1).split('\\').join('/');
      if (!GAME_MODULES.includes(key)) { out.push({ line: i + 1, why: `imports src/${key}, which is app-only (games may import: ${GAME_MODULES.join(', ')})`, code: line.trim().slice(0, 120) }); continue; }
      if (!/^\s*import\s+gs\s+from\b/.test(line)) out.push({ line: i + 1, why: `import gs from '../gamescroll.js' (games use everything through gs)`, code: line.trim().slice(0, 120) });
    }
  });
  return out;
}

const flags = process.argv.slice(2).filter(a => a.startsWith('--')), args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const files = args.length
  ? args.map(a => a.endsWith('.js') ? resolve(a) : join(GAMES, a + '.js'))
  : readdirSync(GAMES).filter(f => f.endsWith('.js')).sort().map(f => join(GAMES, f));
const showHints = !flags.includes('--no-hints') && (args.length > 0 || flags.includes('--hints'));

let flagged = 0, warned = 0, hinted = 0;
for (const f of files) {
  const hits = lint(f), rel = 'src/games/' + basename(f);
  if (!flags.includes('--no-hints')) for (const h of hints(f)) {
    hinted++; if (!showHints) continue;
    console.log(`${rel}:${h.line}  hint: ${h.why}\n    ${h.code}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::notice file=${rel},line=${h.line},title=Kit hint::${h.why}`);
  }
  for (const h of hits) {
    if (h.warn) { warned++; console.log(`${rel}:${h.line}  warning: ${h.why}\n    ${h.code}`); if (process.env.GITHUB_ACTIONS) console.log(`::warning file=${rel},line=${h.line}::${h.why}`); continue; }
    flagged++;
    console.log(`${rel}:${h.line}  ${h.why}\n    ${h.code}`);
    // GitHub shows these on the pull request's Files tab, next to the line.
    if (process.env.GITHUB_ACTIONS) console.log(`::error file=${rel},line=${h.line}::${h.why}. Games must not touch the network, storage or native features directly; a maintainer has to review this line.`);
  }
}
console.log(`${files.length} game file(s) checked, ${flagged} line(s) flagged${warned ? `, ${warned} warning(s)` : ''}${hinted ? `, ${hinted} kit hint(s)${showHints ? ' (advice: they never fail the check)' : ' (name a game or add --hints to see them)'}` : ''}`);
process.exit(flagged ? 1 : 0);
