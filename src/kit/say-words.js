// Text as it is said, for the desktop app's built-in voice (talk-worker.js): Pocket TTS 7M reads letters, not
// numbers, so "£5.99" came out as "five point nine nine", "2,048" as "two thou forty-eight" and "07:45" as a mumble.
// spoken() writes numbers, money, times, dates, ordinals, units and a few signs out in words first, and lowers a shouted
// line ("GET OUT OF MY SWAMP" was read "may" for MY). Abbreviations are left alone: the model already spells them
// (TTS, NPC, FBI, GPS) and says the ones that are words (NASA, HUD). Kit use (and scripts/talk-test.mjs).
//   spoken(text, { lang })        lang 'en-US' reads 01/02 as January the second and leaves out "and" in 250
//   respell(text, { Zorblax: 'zor blacks' })   whole words swapped for how they are said (say()'s respell, every voice)

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const BIG = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH = new RegExp(`\\b(${MONTHS.join('|')}|${MONTHS.map(m => m.slice(0, 3)).join('|')}|Sept)\\b`);   // (with a capital: May is a word too)
const monthOf = s => MONTHS.findIndex(m => m.slice(0, 3).toLowerCase() === s.slice(0, 3).toLowerCase());

/** A whole number in words: 2048 -> "two thousand and forty-eight" (US: no "and"). */
export function words(n, us = false) {
  n = Math.floor(Math.abs(n));
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? (us ? ' ' : ' and ') + words(n % 100, us) : '');
  for (const [v, name] of BIG) if (n >= v) {
    const rest = n % v;
    return words(Math.floor(n / v), us) + ' ' + name + (rest ? (rest < 100 && !us ? ' and ' : rest < 100 ? ' ' : ', ') + words(rest, us) : '');
  }
  return String(n);
}
const IRREG = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
/** 14 -> "fourteenth". */
export function ordinal(n, us = false) {
  const w = words(n, us), m = /([a-z]+)$/.exec(w), last = m[1];
  const o = IRREG[last] || (last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th');
  return w.slice(0, -last.length) + o;
}
/** 1987 -> "nineteen eighty-seven", 2005 -> "two thousand and five", 2026 -> "twenty twenty-six". */
export function year(n, us = false) {
  if (n >= 2000 && n < 2010) return words(n, us);
  const hi = Math.floor(n / 100), lo = n % 100;
  if (n < 1000 || n >= 10000) return words(n, us);
  return words(hi, us) + ' ' + (lo === 0 ? 'hundred' : lo < 10 ? 'oh ' + ONES[lo] : words(lo, us));
}
const digits = s => [...s].map(d => d === '0' ? 'oh' : ONES[+d]).join(' ');
const num = (s, us) => {   // "2,048" "1.5" "007"
  const [whole, frac] = s.replace(/,/g, '').split('.');
  let w = whole.length > 1 && whole[0] === '0' ? digits(whole) : whole.length > 15 ? digits(whole) : words(+whole, us);
  if (frac != null && frac !== '') w += ' point ' + [...frac].map(d => ONES[+d]).join(' ');
  return w;
};

const MONEY = { '£': ['pound', 'pounds', 'penny', 'pence'], '$': ['dollar', 'dollars', 'cent', 'cents'], '€': ['euro', 'euros', 'cent', 'cents'], '¥': ['yen', 'yen', '', ''] };
const SCALE = { k: 'thousand', m: 'million', bn: 'billion', thousand: 'thousand', million: 'million', billion: 'billion' };
const UNITS = { km: 'kilometres', kg: 'kilograms', cm: 'centimetres', mm: 'millimetres', mph: 'miles an hour', 'km/h': 'kilometres an hour', kph: 'kilometres an hour', ml: 'millilitres', ms: 'milliseconds', fps: 'frames a second', hz: 'hertz', kb: 'kilobytes', mb: 'megabytes', gb: 'gigabytes', '°c': 'degrees Celsius', '°f': 'degrees Fahrenheit', '°': 'degrees' };
const UNIT1 = { kilometres: 'kilometre', kilograms: 'kilogram', centimetres: 'centimetre', millimetres: 'millimetre', millilitres: 'millilitre', milliseconds: 'millisecond', kilobytes: 'kilobyte', megabytes: 'megabyte', gigabytes: 'gigabyte', degrees: 'degree' };

/** The words to say for a line (see the top of this file). */
export function spoken(text, { lang = 'en-GB' } = {}) {
  const us = /^en-us/i.test(String(lang));
  let t = String(text);
  // a shouted line (two or more capital words together, one of them a word not an abbreviation): said, not spelled
  t = t.replace(/\b[A-Z][A-Z']+(?:[\s,!?.]+[A-Z][A-Z']*)+\b/g, run => {
    const ws = run.match(/[A-Z']+/g);
    return ws.length >= 2 && ws.some(w => w.length >= 4 && /[AEIOU]/.test(w) && /[AEIOU][^AEIOU']|[^AEIOU'][AEIOU]/.test(w) && !/^(NASA|NATO|ASAP|UNESCO|UNICEF)$/.test(w))
      ? run.toLowerCase().replace(/\bi\b/g, 'I') : run;
  });
  // titles that end in a full stop (it would end the sentence)
  t = t.replace(/\b(Mr|Mrs|Ms|Dr|Prof|vs|etc)\.(?=\s|$)/g, (m, w) => ({ Mr: 'Mister', Mrs: 'Missus', Ms: 'Miz', Dr: 'Doctor', Prof: 'Professor', vs: 'versus', etc: 'et cetera' })[w]).replace(/\bNo\.\s?(?=\d)/g, 'number ');
  t = t.replace(/\be\.g\./gi, 'for example').replace(/\bi\.e\./gi, 'that is').replace(/\bvs\b/g, 'versus');
  t = t.replace(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.(?=\s+\d)/g, '$1');
  // dates: 01/02/2026 and 2026-02-01
  const dayMonth = (d, m, y) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const yy = y == null ? '' : ', ' + year(y < 100 ? 2000 + y : y, us);
    return (us ? `${MONTHS[m - 1]} ${ordinal(d, us)}` : `the ${ordinal(d)} of ${MONTHS[m - 1]}`) + yy;
  };
  t = t.replace(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (m, y, mo, d) => dayMonth(+d, +mo, +y) ?? m);
  t = t.replace(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/g, (m, a, b, y) => {
    if (y == null && !(+a <= 31 && +b <= 12 && +b > 0)) return m;
    return (us ? dayMonth(+b, +a, y == null ? null : +y) : dayMonth(+a, +b, y == null ? null : +y)) ?? m;
  });
  // 14 March (2026), March 14(th)(, 2026)
  t = t.replace(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH.source}(?:,?\\s+(\\d{4}))?`, 'g'), (m, d, mo, y) => {
    const i = monthOf(mo); if (i < 0 || +d < 1 || +d > 31) return m;
    return (us ? `${MONTHS[i]} ${ordinal(+d, us)}` : `the ${ordinal(+d)} of ${MONTHS[i]}`) + (y ? ', ' + year(+y, us) : '');
  });
  t = t.replace(new RegExp(`${MONTH.source}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'g'), (m, mo, d, y) => {
    const i = monthOf(mo); if (i < 0 || +d < 1 || +d > 31) return m;
    return `${MONTHS[i]} ${us ? '' : 'the '}${ordinal(+d, us)}` + (y ? ', ' + year(+y, us) : '');
  });
  // a month and a year, and years after words that come before them (in 1987, since 2005, the 1980s)
  t = t.replace(new RegExp(`${MONTH.source}\\s+(\\d{4})\\b`, 'g'), (m, mo, y) => { const i = monthOf(mo); return i < 0 ? m : `${MONTHS[i]} ${year(+y, us)}`; });
  t = t.replace(/\b(in|since|by|from|until|till|before|after|year|of|around|circa|summer|winter|spring|autumn|fall)\s+(1[1-9]\d\d|20\d\d)\b(?![.,]\d)/gi, (m, w, y) => `${w} ${year(+y, us)}`);
  t = t.replace(/\b(1[1-9]|20)(\d)0s\b/g, (m, a, b) => year(+(a + b + '0'), us).replace(/y$/, 'ie') + 's');
  // times: 3:30 pm, 07:45, 7am
  // (a full stop in "p.m." that also ended the sentence is kept)
  const ampm = (s, rest = '') => s ? ' ' + s.toLowerCase().replace(/\./g, '').split('').join(' ') + (s.endsWith('.') && /^\s*($|[A-Z"'(])/.test(rest) ? '.' : '') : '';
  t = t.replace(/\b(\d{1,2}):(\d{2})(?:\s?([ap]\.?m\.?)(?![a-z]))?/gi, (m, h, mi, ap, at, all) => {
    h = +h; mi = +mi; if (h > 24 || mi > 59 || (ap && h > 12)) return m;
    if (!ap && h % 24 === 0 && mi === 0) return 'midnight';
    const hw = words(h % 24 === 0 ? 12 : h);
    return hw + (mi === 0 ? (ap ? '' : h <= 12 ? " o'clock" : ' hundred') : mi < 10 ? ' oh ' + ONES[mi] : ' ' + words(mi, us)) + ampm(ap, all.slice(at + m.length));
  });
  t = t.replace(/\b(\d{1,2})\s?([ap]\.?m\.?)(?![a-z])/gi, (m, h, ap, at, all) => +h > 12 ? m : words(+h, us) + ampm(ap, all.slice(at + m.length)));
  // money: £5.99, $12, €3.50, £1.5m, 50p
  t = t.replace(/(-)?([£$€¥])\s?(\d[\d,]*)(?:\.(\d{1,2}))?(?:\s?(k|m|bn|thousand|million|billion)\b)?/gi, (m, neg, c, whole, frac, sc) => {
    const [one, many, small1, small] = MONEY[c], w = +whole.replace(/,/g, '');
    let out;
    if (sc) out = num(whole + (frac ? '.' + frac : ''), us) + ' ' + SCALE[sc.toLowerCase()] + ' ' + many;
    else {
      out = (w === 0 && frac ? '' : words(w, us) + ' ' + (w === 1 ? one : many));
      if (frac && +frac.padEnd(2, '0')) {
        const f = +frac.padEnd(2, '0');
        out = out ? out + ' ' + words(f, us) : words(f, us) + ' ' + (f === 1 ? small1 : small);
      }
    }
    return (neg ? 'minus ' : '') + out.trim();
  });
  t = t.replace(/\b(call|dial|ring|phone)\s+(\d{3,})\b/gi, (m, w, n) => w + ' ' + digits(n).replace(/\boh\b/g, 'zero'));
  t = t.replace(/\b(\d+)p\b/g, (m, n) => words(+n, us) + ' p');
  // ordinals: 14th, 3rd, 21st
  t = t.replace(/\b(\d[\d,]*)(st|nd|rd|th)\b/gi, (m, n) => ordinal(+n.replace(/,/g, ''), us));
  // per cent, units, signs
  t = t.replace(/(\d[\d,.]*)\s?%/g, (m, n) => num(n, us) + (us ? ' percent' : ' per cent'));
  t = t.replace(/(-?\d[\d,]*(?:\.\d+)?)\s?(km\/h|°[cf]|°|km|kg|cm|mm|mph|kph|ml|ms|fps|hz|kb|mb|gb)\b/gi, (m, n, u) => {
    let name = UNITS[u.toLowerCase()];
    if (/^-?1$/.test(n) && UNIT1[name.split(' ')[0]]) name = name.replace(/^\w+/, w => UNIT1[w]);
    return n + ' ' + name;
  });
  t = t.replace(/#\s?(\d)/g, 'number $1').replace(/(\S)\s?&\s?(\S)/g, '$1 and $2').replace(/(\d)\s?\+\s?(\d)/g, '$1 plus $2').replace(/(\d)\s?=\s?(\d)/g, '$1 equals $2');
  t = t.replace(/\bx(\d+)\b/g, 'times $1').replace(/\b(\d+)x\b/g, '$1 times');
  // ranges, minus, and the numbers left
  t = t.replace(/\b(\d[\d,]*(?:\.\d+)?)\s?[-–]\s?(\d[\d,]*(?:\.\d+)?)\b(?!-)/g, (m, a, b) => `${num(a, us)} to ${num(b, us)}`);
  t = t.replace(/(^|[\s(])[-−](\d)/g, '$1minus $2');
  t = t.replace(/\d+(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g, n => num(n, us));
  return t;
}

/**
 * Whole words swapped for how they are said, in any case: respell('Zorblax waits.', { Zorblax: 'zor blacks' }).text is
 * 'zor blacks waits.'; at(i) turns a place in the new text back into one in the old (a voice's word marks).
 */
export function respell(text, list) {
  const t = String(text), keys = list && typeof list === 'object' ? Object.keys(list).filter(Boolean).sort((a, b) => b.length - a.length) : [];
  if (!keys.length) return { text: t, at: i => i };
  const low = new Map(keys.map(k => [k.toLowerCase(), String(list[k])]));
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  let out = '', last = 0;
  const marks = [];   // [where in the new text a swap starts, where it ends, where it was in the old, how far the old ran]
  for (const m of t.matchAll(re)) {
    out += t.slice(last, m.index);
    const to = low.get(m[0].toLowerCase()) ?? m[0];
    marks.push([out.length, out.length + to.length, m.index, m[0].length]);
    out += to; last = m.index + m[0].length;
  }
  out += t.slice(last);
  const at = i => {
    let shift = 0;
    for (const [s0, s1, o0, ol] of marks) { if (i < s0) break; if (i < s1) return o0; shift = o0 + ol - s1; }
    return i + shift;
  };
  return { text: out, at };
}

/**
 * A line said the way a person chats rather than reads (say() casual: 0..1): now and then a "well," or "oh," to start,
 * an "um," before a word that takes thought, or the first words said twice ("I - I think"). The same line and
 * amount always get the same ones (seed). Returns { text, at } as respell(): at(i) is where place i of the new text was
 * in the old (an added word maps to the word after it).
 */
export function casual(text, amount, seed = 1) {
  const t = String(text), a = Math.max(0, Math.min(1, +amount || 0));
  if (!a || !/\p{L}/u.test(t)) return { text: t, at: i => i };
  let s = (Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ 0x5bd1e995) >>> 0 || 1; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const adds = [];   // [place in the old text, words put before it]
  const SMALL = /^(the|a|an|to|of|for|my|your|his|her|their|our|this|that|some|in|on|at|with|about|is|was|be|I'?m?|it'?s?|we|you|they)$/i;
  // each sentence: [start, end) in t
  const re = /[^.!?…]+[.!?…]*["')\]]*\s*/g; let m;
  for (let n = 0; (m = re.exec(t)); n++) {
    const sent = m[0], at0 = m.index, words = [...sent.matchAll(/[\p{L}\p{N}'’]+/gu)];
    if (!words.length) continue;
    const ask = /\?/.test(sent), shout = /!/.test(sent), first = words[0];
    const opener = /^(well|so|oh|um|uh|right|okay|ok|yes|no|hey|look|listen)$/i.test(first[0]);
    let done = false;
    if (!opener && rnd() < a * (n ? .1 : .35)) {   // a word to start
      const pick = n ? ['So,', 'Well,'] : shout ? ['Oh,', 'Hey,', 'Oh,'] : ask ? ['So,', 'Um,', 'Well,'] : ['Well,', 'So,', 'Right,', 'Um,'];
      adds.push([at0 + first.index, pick[Math.floor(rnd() * pick.length)] + ' ']); done = true;
    }
    if (!done && words.length >= 4 && rnd() < a * .2) {   // the first word said twice
      const w = first[0]; adds.push([at0 + first.index, `${w} - ${/^I$/.test(w) ? w : w.toLowerCase()} `.replace(/ [^ ]+ $/, ' ')]);
      done = true;
    }
    if (words.length >= 6 && rnd() < a * .35) {   // a pause to think, after a small word, before the word that took thought
      const cands = [];
      for (let k = 1; k + 1 < words.length - 1; k++) if (SMALL.test(words[k][0]) && !SMALL.test(words[k + 1][0])) cands.push(k + 1);
      if (cands.length) { const k = cands[Math.floor(rnd() * cands.length)] - 1; adds.push([at0 + words[k].index + words[k][0].length, rnd() < .5 ? ', um,' : ', uh,']); }
    }
  }
  if (!adds.length) return { text: t, at: i => i };
  adds.sort((x, y) => x[0] - y[0]);
  let out = '', last = 0; const marks = [];   // [new start, new end, old place]
  for (const [o, w] of adds) {
    out += t.slice(last, o);
    // (a capital word after an added one keeps its capital only where it is a name or I)
    marks.push([out.length, out.length + w.length, o]); out += w; last = o;
  }
  out += t.slice(last);
  // "Well, The" -> "Well, the"
  out = out.replace(/\b(Well|So|Right|Um|Oh|Hey), ([A-Z])([a-z])/g, (q, a1, b, c) => `${a1}, ${b.toLowerCase()}${c}`);
  const at = i => { let shift = 0; for (const [s0, s1, o0] of marks) { if (i < s0) break; if (i < s1) return o0; shift = o0 - s1; } return i + shift; };
  return { text: out, at };
}
