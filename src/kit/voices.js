// Casting: which of the phone's own voices plays a character (the `voice` of gs.sound.say).
// A phone only lists its voices by name, so this file knows the common ones: which are women's and
// which men's, which is a better recording of the same voice, and which are joke voices. A game asks
// for a kind of voice ('woman', 'man'), an accent and a take (the second such voice, for a cast of
// several), and gets the best match this phone has, or the phone's default voice with a small pitch
// nudge when it has nothing that fits. Kit use only (sound.js); plain data and maths, no audio.

const words = s => new Set(s.split(' '));
// iPhone, iPad and Mac voices, by first name
const APPLE_F = words('kate serena martha stephanie fiona moira tessa karen catherine matilda samantha allison ava susan zoe nicky joelle noelle veena isha sangeeta flo grandma sandy shelley kathy princess vicki victoria agnes');
const APPLE_M = words('daniel arthur oliver jamie malcolm gordon lee rishi alex tom evan nathan aaron fred ralph bruce junior albert eddy grandpa reed rocko');
// joke and old-computer voices: only when a game asks for one by name
const JOKE = words('albert bahh bells boing bubbles cellos jester organ superstar trinoids whisper wobble zarvox fred junior kathy ralph princess bruce agnes vicki victoria eddy flo grandma grandpa reed rocko sandy shelley');
// Android's Google voices: the three letters in names like en-gb-x-rjs-local
const GOOGLE_F = words('gba gbc gbg fis sfg iob iog tpc tpf aua auc ena enc ahp cxx tfn');
const GOOGLE_M = words('gbb gbd rjs iol iom tpd aub aud end ene');
// Windows and Edge voices, by first name
const MS_F = words('hazel susan sonia libby maisie zira aria jenny michelle ana natasha neerja emily leah heera catherine linda clara');
const MS_M = words('george ryan thomas david mark guy christopher eric roger steffan william prabhat connor luke ravi james sean richard liam');

const norm = l => String(l || '').replace(/_/g, '-').toLowerCase();

/**
 * What a listed voice is, as far as its name says: { sex: 'f' | 'm' | null, tier (3 best recording,
 * 2 better, 1 ordinary, 0 needs the network), joke, lang ('en-gb') }.
 */
export function describe(v) {
  const name = String(v?.name || ''), uri = String(v?.voiceURI || ''), both = (name + ' ' + uri).toLowerCase();
  const first = name.toLowerCase().replace(/^microsoft\s+/, '').split(/[\s(,-]+/)[0];
  let sex = null, tier = 1, joke = false;
  const g = /-x-([a-z]{3})(?:#(female|male)_\d+)?-(local|network)\b/.exec(uri.toLowerCase());
  // Linux (speech-dispatcher): espeak-ng lists every language with each of its ~100 variants ("English (America)+Max
  // espeak-ng"), most of them novelty voices. Only the plain voice (a man's) and its numbered male and female ones cast.
  const es = /^(.*?)(?:\+([\w-]+))?\s+espeak(?:-ng)?$/i.exec(name);
  if (es) {
    const k = String(es[2] || '').toLowerCase(), m = /^(female|male)\d*$/.exec(k);
    return { sex: !k ? 'm' : m ? m[1][0] : null, tier: 1, joke: !!k && !m, lang: norm(v?.lang) };
  }
  if (g) {
    sex = g[2] ? g[2][0] : GOOGLE_F.has(g[1]) ? 'f' : GOOGLE_M.has(g[1]) ? 'm' : null;
    if (g[3] === 'network') tier = 0;
  } else if (/smt[a-z]?f\d|\bfemale\b|\bwoman\b/.test(both)) sex = 'f';
  else if (/smt[a-z]?m\d|\bmale\b|\bman\b/.test(both)) sex = 'm';
  else if (/^microsoft /i.test(name)) sex = MS_F.has(first) ? 'f' : MS_M.has(first) ? 'm' : null;
  else if (APPLE_F.has(first)) sex = 'f';
  else if (APPLE_M.has(first)) sex = 'm';
  else if (/^google .*english$/i.test(name)) sex = 'f';   // Chrome's "Google US English" is a woman's voice
  if (/\.premium\.|\(premium\)|\bnatural\b/.test(both)) tier = 3;
  else if (/\.enhanced\.|\(enhanced\)/.test(both)) tier = 2;
  if (/com\.apple\.(eloquence|speech\.synthesis)/.test(both) || (JOKE.has(first) && tier < 2 && !g && !/^microsoft /i.test(name))) joke = true;
  if (v?.localService === false && tier < 2 && !g) tier = 0;
  return { sex, tier, joke, lang: norm(v?.lang) };
}

/** The `voice` a game gave say(), tidied: { kind: 'woman' | 'man' | 'any', langs: ['en-gb'...], take, like: [...] }. */
export function wantOf(voice, lang = 'en-GB') {
  const o = typeof voice === 'string' ? { kind: voice } : voice && typeof voice === 'object' ? voice : {};
  const kind = /^(woman|female|f)$/i.test(o.kind) ? 'woman' : /^(man|male|m)$/i.test(o.kind) ? 'man' : 'any';
  const langs = [].concat(o.lang ?? lang ?? 'en-GB').map(norm).filter(l => /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(l));
  return { kind, langs: langs.length ? langs : ['en-gb'], take: Math.max(0, Math.floor(+o.take || 0)), like: [].concat(o.like ?? []).map(s => String(s).toLowerCase()).filter(Boolean) };
}

const NUDGE = [1, .9, 1.1, .84];   // a cast bigger than the phone's voices: the same voice, a little lower or higher
/**
 * Picks a voice from the phone's list for what a game asked for. Returns { at, pitch, known }:
 * at is the place in the list (-1: use the phone's default voice for the language), pitch a number to
 * multiply the line's pitch by (1 when a real voice of that kind was found), known whether the kind matched.
 * native: the list is a phone's (voices that need the network come last). bad: voiceURIs that failed before.
 */
export function cast(list, want, { native = false, bad = null } = {}) {
  const w = want && want.langs ? want : wantOf(want);
  const all = (list || []).map((v, at) => ({ at, v, ...describe(v) })).filter(c => !(bad && bad.has(c.v.voiceURI)));
  // asked for by name: the first fragment that names a voice wins, whatever its accent
  for (const frag of w.like) {
    const hit = all.filter(c => (c.v.name + ' ' + c.v.voiceURI).toLowerCase().includes(frag)).sort((a, b) => b.tier - a.tier)[0];
    if (hit) return { at: hit.at, pitch: 1, known: true };
  }
  const sex = w.kind === 'woman' ? 'f' : w.kind === 'man' ? 'm' : null;
  const rank = (a, b) => (b.tier - a.tier) || (a.at - b.at);
  const usable = all.filter(c => !c.joke && (!native || c.tier > 0));
  const spare = all.filter(c => !c.joke && native && c.tier === 0);
  const inLang = (pool, l) => pool.filter(c => c.lang === l || (!l.includes('-') && c.lang.split('-')[0] === l));
  // one of each voice: a phone can list the same voice twice (a better recording, or one that needs the network)
  const unique = pool => { const seen = new Set(), out = []; for (const c of pool.sort(rank)) { const k = (c.v.name + '|' + c.v.voiceURI).toLowerCase().replace(/-(local|network)$|\((premium|enhanced)\)|\.(premium|enhanced|compact)\.|\s+/g, ''); if (!seen.has(k)) { seen.add(k); out.push(c); } } return out; };
  const give = (pool, known) => {
    const u = unique(pool), i = w.take % u.length, wraps = Math.floor(w.take / u.length);
    const lean = known || sex !== 'm' ? 1 : .86;   // nobody knows this voice's kind: most phones' own voice is a woman's, so only a man leans lower
    return { at: u[i].at, pitch: lean * NUDGE[Math.min(wraps, NUDGE.length - 1)], known };
  };
  const langs = [...w.langs, ...w.langs.map(l => l.split('-')[0]).filter((l, i, a) => a.indexOf(l) === i)];
  if (sex) {
    for (const pool of [usable, spare]) for (const l of langs) { const p = inLang(pool, l).filter(c => c.sex === sex); if (p.length) return give(p, true); }
    // no voice known to be that kind: one nobody knows the kind of, then any voice at all, leaning the pitch
    for (const l of langs) { const p = inLang(usable, l).filter(c => !c.sex); if (p.length) return give(p, false); }
  } else for (const pool of [usable, spare]) for (const l of langs) { const p = inLang(pool, l); if (p.length) return give(p, true); }
  return { at: -1, pitch: (sex === 'm' ? .86 : 1) * NUDGE[Math.min(w.take, NUDGE.length - 1)], known: false };
}
