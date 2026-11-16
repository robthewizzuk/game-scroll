import gs from '../gamescroll.js';
const { sounds, notes } = gs.sound;
const { haptic } = gs.device;
const { Feel } = gs.effects;
const { clamp } = gs.util;
const { text, sprite, measure } = gs.pixel;
const { rng, makeNoise } = gs.math;
const { Camera2D } = gs.camera2d;
const { TileMap } = gs.tiles;
const { TopDown } = gs.movers;
const { Stick } = gs.controls;
const { NavGrid } = gs.ai;
const { Typewriter } = gs.story;
const { Fighter, Battle, Bag, Opponent, gainXp, xpFor, loot } = gs.battle;
const { Quests } = gs.rpg;

// Critter Quest: a little monster-keeping adventure on one big map. Pick a partner in Willow Village,
// walk north through Breezy Meadow, Mirror Lake and Cinder Ridge, battle and catch the critters that
// leap out of the tall grass, beat the three Keepers of the Wilds for their seals, and open the gate
// to Elder Grove, where the Grove Warden waits. Battles are gs.battle fights (types, statuses, buffs,
// berries) against gs.battle's ready-made Opponent, which plays turns ahead and learns how you fight.
// Quests are gs.rpg Quests. Everything is drawn in code.

let W = 192, H = 176;
const T = 16;

// ---------------------------------------------------------------- the world, north (top) to south
const MAP = [
  'PPPPPPPPPPPPPPPPPPPPPPPPPPPP',
  'PPdddd*****PPPPddddd****ddPP',
  'Pdd**m***ddddPPd*****m***ddP',
  'Pd***PPd**dd::dd**PPdd***mdP',
  'Pd*m*PPdd*d::::d***PPd**dddP',
  'Pdd***dddd::::::dd**dd*m**dP',
  'PPd**ddPd::::::::ddPdd***dPP',
  'Pdd*m*dPd::::::::d*Pd*m**dPP',
  'Pd***dddd*d:::::dd**dd**dddP',
  'Pdd**PPd**dd:::d*m**PPd***dP',
  'PPdd*PPdd***d::dd***PPdd*dPP',
  'PPPPPPPPPPPPPGGPPPPPPPPPPPPP',
  'rrraaa;;;aaaa::aaa;;;aaarrrr',
  'rra;;;;;aDaa::aaaa;;;;aaaarr',
  'ra;;LL;;aaaa::aaDa;;;;;aLLar',
  'ra;LLL;aaraa::aaaaa;rraaLLar',
  'raa;L;;aaaa:::aaa;;;;aaaaaar',
  'rDaa;;aarr::::aaaaLLL;;;aaDr',
  'raaaa;;;aa::aaa;;;LLL;;;aaar',
  'rra;;;aaaa::aaa;;;;L;;aaaarr',
  'raa;;;;Daa::araa;;;aaaraaaar',
  'raaaa;;aaaa::aaaaaaa;;;;aaar',
  'rrra;;aarr::::aaaaaa;;;aaarr',
  'rrrrraaaaaa::aaaarrrrrrrrrrr',
  'TTTssvvvsss::sssssvvvvssTTTT',
  'TTsvvvss~~~==~~~~ssvvvvsssTT',
  'Tssvvs~~~~~==~~~~~~ssvvsssTT',
  'Tsvvs~~~~~~==~~~~~~~~ssvvssT',
  'Tsvs~~~~~~~==~~~~~~~~~sssvsT',
  'Tss~~~~~~~~==~~~~~~~~~~ssssT',
  'Tsvs~~~~~~~==~~~~~~~~~sssvsT',
  'Tsvvs~~~~~~==~~~~~~~~ssvvvsT',
  'TTsvvs~~~~~==~~~~~~ssvvvvsTT',
  'TTssvvss~~~==~~~~sssvvvsssTT',
  'TTTssvvssss::ssssssvvsssTTTT',
  'TTTTsssssss::::ssssssssTTTTT',
  'TT....,,,,..::....,,,,,..oTT',
  'T..o.,,,,,,..::..,,,,,,,..oT',
  'T..,,,,,,,,T..::.,,,,,,,,.TT',
  'T.,,,,,,,,.....::..,,,,,...T',
  'T.,,,,,,,..f.f.::..,,,,,,..T',
  'T..,,,,...fffff::...,,,,,..T',
  'TT..........::::......,,,,.T',
  'T..,,,,....::.......,,,,,..T',
  'T.,,,,,,,..::..oo..,,,,,,,.T',
  'T.,,,,,,,..::..oo...,,,,,..T',
  'TT..,,,,..::::....T..,,,..TT',
  'TTT.......::....TTT......TTT',
  'TT.........::.........o...TT',
  'T..o.......::..............T',
  'T..........::..............T',
  'T..........::..............T',
  'T.::::::::::::::::::::::::.T',
  'T.:........::............:.T',
  'T.:..oo....::....oo......:.T',
  'T.:........::............:.T',
  'T.:........::............:.T',
  'T.::::::::::::::::::::::::.T',
  'T....o.....::.....o.....o..T',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
].map(r => (r + 'TTTTTTTTTTTTTTTTTTTTTTTTTTTT').slice(0, 28));
const COLS = 28, ROWS = MAP.length, WW = COLS * T, WH = ROWS * T;
const SOLID = { T: 1, P: 1, D: 1, r: 1, f: 1, '~': 1, L: 1, G: 1, h: 1, n: 1, W: 1, S: 1 };
const GRASS = { ',': 'meadow', v: 'lake', ';': 'ridge', '*': 'grove' };
const ZONES = [
  { id: 'grove', name: 'ELDER GROVE', from: 0, ground: 'd' },
  { id: 'ridge', name: 'CINDER RIDGE', from: 12, ground: 'a' },
  { id: 'lake', name: 'MIRROR LAKE', from: 24, ground: '.' },
  { id: 'meadow', name: 'BREEZY MEADOW', from: 36, ground: '.' },
  { id: 'village', name: 'WILLOW VILLAGE', from: 48, ground: '.' },
];
const zoneAt = ty => { let z = ZONES[0]; for (const q of ZONES) if (ty >= q.from) z = q; return z; };
const HOUSES = [
  { tx: 3, ty: 49, w: 5, roof: '#c84838', name: 'LODGE' },
  { tx: 16, ty: 49, w: 4, roof: '#3878c8' },
  { tx: 20, ty: 54, w: 4, roof: '#58a048' },
];
const WELL = { tx: 17, ty: 55 };

// ---------------------------------------------------------------- critters
const TYPES = {   // attacker -> defender multiplier (gs.battle types)
  EMBER: { SPROUT: 2, EMBER: .5, RIPPLE: .5, STONE: .5 },
  SPROUT: { RIPPLE: 2, STONE: 2, EMBER: .5, SPROUT: .5 },
  RIPPLE: { EMBER: 2, STONE: 2, SPROUT: .5, RIPPLE: .5 },
  STONE: { EMBER: 2, SPROUT: .5, STONE: .5 },
};
const TCOL = { EMBER: '#f06830', SPROUT: '#58c040', RIPPLE: '#3898f0', STONE: '#a88858', NORMAL: '#a8a0b8' };
const MV = {
  TACKLE: { name: 'TACKLE', power: 12, type: 'NORMAL', fx: 'bump' },
  JAB: { name: 'QUICK JAB', power: 9, type: 'NORMAL', crit: .3, fx: 'bump' },
  HOWL: { name: 'HOWL', power: 0, type: 'NORMAL', buff: ['atk', 1.5, 3], fx: 'up' },
  SCREECH: { name: 'SCREECH', power: 0, type: 'NORMAL', buff: ['def', .7, 3], fx: 'down' },
  SPARK: { name: 'SPARK', power: 15, type: 'EMBER', fx: 'fire' },
  FLAME: { name: 'FLAME BURST', power: 21, type: 'EMBER', miss: .1, status: ['burn', 3], chance: .3, fx: 'fire' },
  BLAZE: { name: 'BLAZE', power: 30, type: 'EMBER', miss: .2, fx: 'fire' },
  VINE: { name: 'VINE WHIP', power: 15, type: 'SPROUT', fx: 'leaf' },
  SPORE: { name: 'SLEEP SPORE', power: 0, type: 'SPROUT', status: ['sleep', 2], chance: .75, fx: 'spore' },
  STORM: { name: 'LEAF STORM', power: 8, hits: 3, type: 'SPROUT', miss: .1, fx: 'leaf' },
  ROOT: { name: 'DEEP ROOT', power: 0, type: 'SPROUT', heal: 18, fx: 'heal' },
  THORN: { name: 'THORN JAB', power: 12, type: 'SPROUT', status: ['poison', 4], chance: .5, fx: 'leaf' },
  SPLASH: { name: 'SPLASH', power: 15, type: 'RIPPLE', fx: 'water' },
  BUBBLE: { name: 'BUBBLE', power: 12, type: 'RIPPLE', buff: ['spd', .7, 3], fx: 'water' },
  MIST: { name: 'MIST VEIL', power: 0, type: 'RIPPLE', buff: ['def', 1.6, 3], fx: 'up' },
  TIDE: { name: 'TIDAL CRASH', power: 28, type: 'RIPPLE', miss: .2, fx: 'water' },
  PEBBLE: { name: 'PEBBLE TOSS', power: 15, type: 'STONE', fx: 'rock' },
  HARDEN: { name: 'HARDEN', power: 0, type: 'STONE', buff: ['def', 1.6, 3], fx: 'up' },
  ROCKFALL: { name: 'ROCKFALL', power: 24, type: 'STONE', miss: .15, status: ['stun', 1], chance: .25, fx: 'rock' },
  QUAKE: { name: 'GROVE QUAKE', power: 26, type: 'STONE', miss: .1, fx: 'rock' },
};

// Pixel art: one letter a pixel. k outline, a body (shaded by itself: lit on top, dark below), b belly,
// c the type's own colour (flame, leaf, water), w and e the eyes, p pink. A row of 8 is half a
// symmetric critter, mirrored.
const ART = {
  FLAREPUP: ['.k.........k....', 'kck.......kck...', 'kcak.....kack...', 'kaaakkkkkaaak...', 'kaaaaaaaaaaak.kk', 'kawekaaawekak.kc',
    'kaeekaaaeekak.kc', 'kbbbbbkbbbbbk.kc', '.kbbbbbbbbbk.kck', '..kaaaaaaak.kck.', '.kaaaaaaaaakcck.', '.kaabaaabaakck..',
    '.kaabaaabaak.k..', '.kak.kkk.kak....', '.kk.......kk....', '................'],
  BLAZEHOUND: ['c...c....c......', 'kck.kc..kck.....', 'kcakkck.kcak....', 'kaaaaaaakaaak..c', 'kaaaaaaaaaaaak.c', 'kawekaaaawekak.kc',
    'kaeekaaaaeekak.kc', 'kabbbbbkbbbbbakkc', '.kbbbpppbbbbkkcc.', '..kbbbbbbbbkkcc..', '.kaaaaaaaaaaakck.', 'kaaaaaaaaaaaaak..',
    'kaabaaaaaaabaak.', 'kaab.kaaak.baak.', 'kkkk..kkk..kkkk.', '................'],
  LEAFLET: ['.....kk.........', '....kcck.kkk....', '...kccck.kccck..', '...kcck..kccck..', '....kkkkkkcck...', '...kaaaaaakk....',
    '..kaaaaaaaaak...', '.kaaaaaaaaaaak..', '.kawekaaawekak..', '.kaeekaaaeekak..', '.kaaapakapaaak..', '.kbaaaaaaaaabk..',
    '..kbbbbbbbbbk...', '..kak.....kak...', '..kk.......kk...', '................'],
  THORNHORN: ['kc..........ck..', 'kck........kck..', '.kck.k..k.kck...', '..kckck.kckck...', '...kkaakkaakk...', '...kaaaaaaaak...',
    '..kawekaawekak..', '..kaeekaaeekak..', '..kaaapkkpaaak..', '...kbbbbbbbbk...', '..kaaaaaaaaaakk.', '.kaaacaaacaaaack',
    '.kaaaaaaaaaaaak.', '.kak.kak.kak.kak', '.kk..kk..kk..kk.', '................'],
  DRIZZLET: ['........', '.......k', '......kc', '.....kca', '....kaaa', '...kaaaa', '..kaaaaa', '..kaweka', '..kaeeka', '..kaaaaa',
    '..kaaapk', '..kabbbb', '...kbbbb', '....kkbb', '......kk', '........'],
  TORRENTOAD: ['...kk...', '..kcck..', '..kwek..', '..keek.k', '.kaaaakc', 'kaaaaaaa', 'kaaaaaaa', 'kakkkkkk', 'kabbbbbb', '.kbbbbbb',
    'kaakbbbb', 'kaaakaaa', 'kaaaakaa', 'kcckkk..', 'kkk.....', '........'],
  CINDERMOTH: ['k.......', 'kk......', 'kck....k', 'kcck..ka', 'kccak.ka', 'kcaaakwa', 'kcaaakea', '.kcaakaa', '..kaakab',
    '.kcaakab', 'kccak.kb', 'kcck..kk', 'kck.....', 'kk......', 'k.......', '........'],
  MOSSBACK: ['................', '................', '.......kkkkk....', '.....kkcccccck..', '....kcbcccbccck.', '...kccccbcccccck',
    '...kcbcccccbccck', '.kkkkkkkkkkkkkkk', 'kaawk.kaaaaaaaak', 'kaeeakaaaaaaaak.', 'kaaaaaaaaaaaaak.', '.kaaaakbbbbbbk..',
    '..kkkkaakkaak...', '......kak.kak...', '......kk..kk....', '................'],
  PUDDLEFIN: ['................', '..........kk....', '.........kcck...', '....kkkkkkcck...', '..kkaaaaaaakk...', '.kaaaaaaaaaaak.k',
    'kawekaaaaaaaakkc', 'kaeeaaaaaaaaakcc', 'kaaaaaaaaaaaaakc', 'kpaabbbbbbbaak.k', '.kabbbbbbbbbk...', '..kkbbbbbbkk....',
    '...kck..kck.....', '....k....k......', '................', '................'],
  PEBBLIT: ['........', '........', '....kkkk', '..kkaaaa', '.kaaaaaa', '.kaacaaa', 'kaaaaaaa', 'kawekaaa', 'kaeekaaa', 'kaaaaaak',
    'kaacaaaa', '.kaaaaaa', '..kkbaab', '...kbbkk', '...kk...', '........'],
  ZIPWING: ['........', '......kk', '.....kcc', '....kkck', '...kaaaa', '..kawkaa', '..kaekaa', 'kk.kaaak', 'kbkkaaac', 'kbbkaaac',
    '.kbbkaaa', '..kbkaaa', '...kkaab', '....kkab', '....kak.', '.....k..'],
  GLOWCAP: ['....kkkk', '..kkcccc', '.kccwccc', 'kccccccc', 'kcwccccw', 'kccccccc', '.kkkkkkk', '...kbbbb', '...kbweb', '...kbeeb',
    '...kbbbk', '...kbbbb', '....kbbb', '...kkbbb', '..kb.kkk', '..kk....'],
  CRAGCLAW: ['........', 'kk......', 'kck...kk', 'kcck.kwe', '.kck.kee', '..kck.kk', '..kkkkaa', '.kaaaaaa', 'kaacaaaa', 'kaaaacaa',
    'kaaaaaaa', '.kbbbbbb', '..kkbbbb', '.kak.kkk', '.kk..kak', '......kk'],
  ELDERBARK: ['.cc..cc.', 'cccccccc', 'ccbcccbc', 'cccccccc', '.ccccckk', '..kkkkaa', '..kaaaaa', '.kaweaaa', '.kaeeaaa', '.kaaaakk',
    'kaakaaap', 'kaaaakaa', 'kaaakkaa', 'kkakaaaa', '.kaakkaa', 'kkkk..kk'],
};
const SPECIES = {
  FLAREPUP: { type: 'EMBER', base: [18, 7, 5, 8], col: ['#f08838', '#f8e0a0', '#f8c030'], moves: [[1, 'TACKLE'], [1, 'SPARK'], [5, 'HOWL'], [8, 'FLAME'], [12, 'BLAZE']], evolve: [10, 'BLAZEHOUND'] },
  BLAZEHOUND: { type: 'EMBER', base: [26, 10, 7, 10], col: ['#d85028', '#f8d8a0', '#f8d040'], moves: [[1, 'TACKLE'], [1, 'SPARK'], [5, 'HOWL'], [8, 'FLAME'], [12, 'BLAZE']] },
  LEAFLET: { type: 'SPROUT', base: [20, 6, 6, 6], col: ['#78c850', '#e8f0b0', '#38a040'], moves: [[1, 'TACKLE'], [1, 'VINE'], [5, 'SPORE'], [8, 'STORM'], [12, 'ROOT']], evolve: [10, 'THORNHORN'] },
  THORNHORN: { type: 'SPROUT', base: [28, 9, 9, 7], col: ['#58a048', '#e0e8a8', '#a0e050'], moves: [[1, 'TACKLE'], [1, 'VINE'], [5, 'SPORE'], [8, 'STORM'], [12, 'ROOT']] },
  DRIZZLET: { type: 'RIPPLE', base: [19, 6, 6, 7], col: ['#58a8f0', '#d8f0ff', '#a8e0ff'], moves: [[1, 'TACKLE'], [1, 'SPLASH'], [5, 'BUBBLE'], [8, 'MIST'], [12, 'TIDE']], evolve: [10, 'TORRENTOAD'] },
  TORRENTOAD: { type: 'RIPPLE', base: [28, 9, 8, 8], col: ['#3878c8', '#c8e8f8', '#88d8f8'], moves: [[1, 'TACKLE'], [1, 'SPLASH'], [5, 'BUBBLE'], [8, 'MIST'], [12, 'TIDE']] },
  ZIPWING: { type: 'NORMAL', base: [15, 6, 4, 10], col: ['#c8b890', '#f8f0e0', '#f08840'], moves: [[1, 'TACKLE'], [1, 'JAB'], [6, 'SCREECH']] },
  MOSSBACK: { type: 'SPROUT', base: [22, 5, 8, 3], col: ['#b08858', '#e8d0a0', '#58a040'], moves: [[1, 'TACKLE'], [1, 'VINE'], [6, 'HARDEN'], [9, 'THORN']] },
  PUDDLEFIN: { type: 'RIPPLE', base: [18, 7, 5, 7], col: ['#4888d8', '#c8e8f8', '#78c8f8'], moves: [[1, 'TACKLE'], [1, 'SPLASH'], [6, 'BUBBLE'], [10, 'TIDE']] },
  CRAGCLAW: { type: 'STONE', base: [20, 7, 8, 4], col: ['#b87050', '#e8c8a8', '#e0a070'], moves: [[1, 'TACKLE'], [1, 'PEBBLE'], [6, 'HARDEN'], [9, 'ROCKFALL']] },
  CINDERMOTH: { type: 'EMBER', base: [16, 7, 4, 9], col: ['#a85840', '#f8d8a0', '#f8a030'], moves: [[1, 'SPARK'], [1, 'SCREECH'], [8, 'FLAME']] },
  PEBBLIT: { type: 'STONE', base: [21, 6, 9, 3], col: ['#9890a0', '#d0c8d0', '#706878'], moves: [[1, 'TACKLE'], [1, 'PEBBLE'], [6, 'HARDEN'], [9, 'ROCKFALL']] },
  GLOWCAP: { type: 'SPROUT', base: [18, 6, 6, 5], col: ['#f0e8d0', '#f8f0e0', '#b858d8'], moves: [[1, 'SPORE'], [1, 'VINE'], [8, 'THORN'], [10, 'ROOT']] },
  ELDERBARK: { type: 'SPROUT', base: [40, 9, 9, 6], col: ['#8a6040', '#c8a070', '#48a040'], moves: [[1, 'VINE'], [1, 'THORN'], [1, 'QUAKE'], [1, 'ROOT']], boss: true },
};
const WILD = {
  meadow: [{ id: 'ZIPWING', lv: [3, 5], w: 4 }, { id: 'MOSSBACK', lv: [4, 5], w: 3 }, { id: 'LEAFLET', lv: [4, 5], w: 1 }, { id: 'FLAREPUP', lv: [4, 5], w: 1 }],
  lake: [{ id: 'PUDDLEFIN', lv: [5, 7], w: 4 }, { id: 'CRAGCLAW', lv: [6, 7], w: 3 }, { id: 'DRIZZLET', lv: [5, 6], w: 1 }, { id: 'ZIPWING', lv: [5, 6], w: 1 }],
  ridge: [{ id: 'CINDERMOTH', lv: [7, 9], w: 4 }, { id: 'PEBBLIT', lv: [7, 9], w: 4 }, { id: 'FLAREPUP', lv: [7, 8], w: 1 }],
  grove: [{ id: 'GLOWCAP', lv: [9, 11], w: 4 }, { id: 'MOSSBACK', lv: [9, 11], w: 2 }, { id: 'LEAFLET', lv: [9, 10], w: 1 }, { id: 'ZIPWING', lv: [9, 10], w: 1 }],
};
const CURVE = { base: 5, power: 1.8 }, GROW = { hp: 3, atk: 1.3, def: 1.1, spd: .8 };

// colour helpers for the shading
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const p = hex(a), q = hex(b); return toHex(p.map((v, i) => v + (q[i] - v) * t)); };
function shaded(rows) {   // full rows (mirrors halves), then lights the top edge of the body and darkens its bottom
  const full = rows.map(r => r.length === 8 ? r + [...r].reverse().join('') : (r + '................').slice(0, 16));
  return full.map((r, y) => [...r].map((ch, x) => {
    if (ch !== 'a' && ch !== 'b' && ch !== 'c') return ch;
    const up = y ? full[y - 1][x] : '.', dn = y < full.length - 1 ? full[y + 1][x] : '.', lf = x ? full[y][x - 1] : '.';
    if ((up === 'k' || up === '.') && (lf === 'k' || lf === '.' || ch !== 'a')) return ch.toUpperCase();
    if (up === 'k' || up === '.') return ch.toUpperCase();
    if (dn === 'k' || dn === '.') return { a: 'd', b: 'f', c: 'g' }[ch];
    return ch;
  }).join(''));
}
const SPR = {}, SIL = {}, FOLKSPR = {}, SCEN = {};
function buildSprites() {   // in make(): the file is also read where there is no canvas
  if (SPR.FLAREPUP) return;
  for (const [id, sp] of Object.entries(SPECIES)) {
  const [a, b, c] = sp.col, art = shaded(ART[id]);
  const pal = { k: mix(a, '#100818', .72), a, A: mix(a, '#ffffff', .35), d: mix(a, '#200830', .3), b, B: mix(b, '#ffffff', .4), f: mix(b, '#401830', .22),
    c, C: mix(c, '#ffffff', .4), g: mix(c, '#401020', .25), w: '#ffffff', e: '#181020', p: '#f088a8' };
  SPR[id] = sprite(art.join('\n'), pal);
  SIL[id] = sprite(art.join('\n'), Object.fromEntries(Object.keys(pal).map(k => [k, '#f8f8ff'])));
  }
  for (const [id, f] of Object.entries(FOLK)) {
    const pal = { k: '#201828', s: '#f8c8a0', e: '#201828', f: '#402820', ...f };
    FOLKSPR[id] = {};
    for (const [dir, frames] of Object.entries(PERSON)) FOLKSPR[id][dir] = frames.map(fr => sprite(fr.join('\n'), pal));
  }
  for (const [id, [art, pal]] of Object.entries(SCEN_ART)) SCEN[id] = sprite(art.join('\n'), pal);
}

// people: one sprite set, recoloured
const PERSON = {
  down: [['...kkkkkk...', '..kcccccck..', '.kcccccccck.', '.kkkkkkkkkk.', '.khsssssshk.', '.ksessssesk.', '..kssssssk..', '..kttttttk..',
    '.kttttttttk.', 'ksttttttttsk', 'ksttttttttsk', '.kkppppppkk.', '..kppppppk..', '..kppkkppk..', '..kffk.kffk.', '..kkk..kkk..'],
  ['...kkkkkk...', '..kcccccck..', '.kcccccccck.', '.kkkkkkkkkk.', '.khsssssshk.', '.ksessssesk.', '..kssssssk..', '..kttttttk..',
    '.kttttttttk.', 'ksttttttttsk', 'ksttttttttsk', '.kkppppppkk.', '..kppppppk..', '..kppkkppk..', '...kfk.kffk.', '...kk...kk..']],
  up: [['...kkkkkk...', '..kcccccck..', '.kcccccccck.', '.kkkkkkkkkk.', '.khhhhhhhhk.', '.khhhhhhhhk.', '..khhhhhhk..', '..kttttttk..',
    '.kttttttttk.', 'ksttttttttsk', 'ksttttttttsk', '.kkppppppkk.', '..kppppppk..', '..kppkkppk..', '..kffk.kffk.', '..kkk..kkk..'],
  ['...kkkkkk...', '..kcccccck..', '.kcccccccck.', '.kkkkkkkkkk.', '.khhhhhhhhk.', '.khhhhhhhhk.', '..khhhhhhk..', '..kttttttk..',
    '.kttttttttk.', 'ksttttttttsk', 'ksttttttttsk', '.kkppppppkk.', '..kppppppk..', '..kppkkppk..', '..kffk.kfk..', '..kk....kk..']],
  side: [['...kkkkk....', '..kccccck...', '.kccccccck..', '.kkkkkkkkkkk', '.khhsssssk..', '.khssssesk..', '..ksssssk...', '..ktttttk...',
    '..kttttttk..', '..ktttstk...', '..ktttttsk..', '..kpppppk...', '..kpppppk...', '..kppkppk...', '..kffkffk...', '..kkkkkkk...'],
  ['...kkkkk....', '..kccccck...', '.kccccccck..', '.kkkkkkkkkkk', '.khhsssssk..', '.khssssesk..', '..ksssssk...', '..ktttttk...',
    '..kttttttk..', '..ktttstk...', '..ktttttsk..', '..kpppppk...', '.kppkkppk...', '.kppk.kppk..', '.kffk.kffk..', '.kkk...kkk..']],
};
const FOLK = {
  hero: { c: '#e04040', h: '#583020', t: '#3868d8', p: '#383848' },
  bram: { c: '#a0a0a8', h: '#d0d0d8', t: '#887050', p: '#584838' },
  mira: { c: '#f070a8', h: '#f070a8', t: '#f8d050', p: '#5878c8' },
  kid: { c: '#f0a030', h: '#402818', t: '#e05050', p: '#405880' },
  tess: { c: '#3c9040', h: '#c86830', t: '#68a848', p: '#685038' },
  gil: { c: '#f0d040', h: '#806040', t: '#4888b8', p: '#384858' },
  rook: { c: '#906038', h: '#302018', t: '#c86040', p: '#504040' },
};

// scenery sprites
const SCEN_ART = {
  tree: [['....kkkkkk......', '..kkGGGgGGkk....', '.kGGGGGGGgGGk...', 'kGGLGGGGGGgGGk..', 'kGLLGGGGGGGgGk..', 'kGGGGGGGgGGGGGk.',
    'kgGGGGGGGGGGGgk.', 'kGGGgGGGGGgGGGk.', '.kgGGGGGGGGGGgk.', '.kggGGgGGGGggk..', '..kkgggggggkk...', '....kkTTkkk.....', '.....kTTk.......',
    '.....kTTk.......', '....kTTTTk......', '...kkkkkkkk.....'].map(r => r.slice(0, 15) + '.'),
    { k: '#18402a', G: '#48a048', g: '#2c7a3c', L: '#90d860', T: '#7a5030' }],
  pine: [['.......kk.......', '......kGGk......', '.....kGGgGk.....', '....kGLGGgGk....', '.....kGGgGk.....', '...kGGLGGGgGk...', '..kGGGGGGGGgGk..',
    '....kGGGGgGk....', '..kGLGGGGGGgGk..', '.kGGGGGGGGGGgGk.', 'kggGGGGGGGGGggGk', '.kkggggggggggkk.', '......kTTk......', '......kTTk......',
    '.....kTTTTk.....', '....kkkkkkkk....'], { k: '#0c2820', G: '#2c7058', g: '#1c5040', L: '#58a080', T: '#5a3a28' }],
  dead: [['................', '..k.......k.....', '.kTk..k..kTk....', '..kTk.kk.kTk....', '...kTkTk.Tk.....', '....kTTTTk......', '.....kTTk.......',
    '.....kTTk..k....', '.....kTTkkTk....', '.....kTTTTk.....', '.....kTTk.......', '.....kTTk.......', '.....kTTk.......', '....kTTTTk......',
    '...kTTkkTTk.....', '..kkkk..kkkk....'], { k: '#201010', T: '#584040' }],
  rock: [['................', '................', '....kkkkkk......', '..kkRRRRrRkk....', '.kRLLRRRRRrRk...', '.kRLRRRRRRRrk...', 'kRRRRRRRRrRRrk..',
    'kRRRRRRRRRRrrk..', 'krRRRRRRRRrrrk..', 'krrRRRRRRrrrk...', '.kkrrrrrrrkk....', '...kkkkkkk......', '................', '................',
    '................', '................'], { k: '#302830', R: '#9890a0', r: '#686070', L: '#d0c8d8' }],
  sign: [['................', '..kkkkkkkkkkkk..', '.kWWWWWWWWWWWWk.', '.kWkkWkkkWkkWWk.', '.kWWWWWWWWWWWWk.', '.kWkkkWkkWkkkWk.',
    '.kWWWWWWWWWWWWk.', '..kkkkkkkkkkkk..', '.......kk.......', '.......kk.......', '.......kk.......', '......kkkk......', '................',
    '................', '................', '................'], { k: '#3a2418', W: '#c89858' }],
  berry: [['......kk........', '.....kgk........', '...kkkgkkk......', '..kRRkkRRk......', '..kRLRkRLRk.....', '..kRRRkRRRk.....',
    '...kkkkkkk......'], { k: '#401820', R: '#e03040', L: '#f8a0a8', g: '#48a040' }],
  jar: [['....kkkk....', '...kWWWWk...', '...kkkkkk...', '..kGLGGGGk..', '..kGLGGGGk..', '..kGGGGGGk..', '..kGGGGGGk..',
    '...kkkkkk...'], { k: '#203040', W: '#a06838', G: '#a8d8f0', L: '#ffffff' }],
  gold: [['....kkkk....', '...kWWWWk...', '...kkkkkk...', '..kGLGGGGk..', '..kGLGGGGk..', '..kGGGGGGk..', '..kGGGGGGk..',
    '...kkkkkk...'], { k: '#403010', W: '#a06838', G: '#f8d040', L: '#ffffff' }],
};

const ITEMS = [   // things on the ground
  { tx: 13, ty: 39, kind: 'berry' }, { tx: 22, ty: 42, kind: 'jar' }, { tx: 3, ty: 44, kind: 'berry' }, { tx: 25, ty: 32, kind: 'jar' },
  { tx: 2, ty: 26, kind: 'berry' }, { tx: 24, ty: 21, kind: 'berry' }, { tx: 3, ty: 13, kind: 'jar' }, { tx: 21, ty: 16, kind: 'berry' },
  { tx: 4, ty: 8, kind: 'berry' }, { tx: 24, ty: 3, kind: 'jar' },
];
const PUP = { tx: 3, ty: 29 };   // where Biscuit hides, in the lake's west reeds

function make(api) {
  buildSprites();
  const feel = new Feel({ pixel: true });
  const K = gs.tweak('Feel', {
    walk: [62, 30, 110, 'how fast the keeper walks (pixels a second)'],
    encounter: [.11, 0, .4, 'chance a critter leaps out each tile walked in tall grass'],
    textSpeed: [70, 20, 200, 'letters a second in the text box'],
    wildSkill: [.3, 0, 1, 'how well wild critters choose their moves'],
    keeperSkill: [.65, 0, 1, 'how well the three Keepers fight'],
    wardenSkill: [.9, 0, 1, 'how well the Grove Warden fights'],
    xp: [1, .3, 3, 'how much XP a win gives'],
  });
  const opp = new Opponent(api, { skill: .5 });    // Tiny Brains: plays turns ahead and learns how this player fights
  const map = TileMap.fromText(MAP.map(r => r.replace(/[^#]/g, '.')), { size: T });
  const noise = makeNoise('critter-quest');
  const base = buildGround();

  let mode, score, t, party, bag, cam, hero, nav, npcs, items, gateOpen, follower, trail, stick, press, path, bump, zone, banner;
  let talkQ, tw, talkThen, quests, fight, foes, foeKind, foeWho, menu, queue, cur, vis, shownHp, proj, wipe, evo, endT, gdist, grace, motes, pickI, trackI;

  // ---------------------------------------------------------- the ground, drawn once
  function buildGround() {
    const cv = document.createElement('canvas'); cv.width = WW; cv.height = WH; const c = cv.getContext('2d'), R = rng(7);
    const groundOf = (ch, ty) => SOLID[ch] || GRASS[ch] || ch === 'm' ? zoneAt(ty).ground : ch === 'o' ? '.' : ch;
    const COL = { '.': ['#78c858', '#68b850', '#88d060', '#5aa848'], s: ['#e8d8a0', '#d8c890', '#f0e0b0', '#c8b880'], a: ['#7a6a68', '#6a5c5a', '#887874', '#5a4c4c'],
      d: ['#3a6a44', '#30603c', '#447450', '#284c34'], ':': ['#d8b878', '#c8a868', '#e4c890', '#b08850'] };
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      const ch = MAP[ty][tx], g = groundOf(ch, ty), X = tx * T, Y = ty * T;
      if (ch === '~' || ch === 'L' || ch === '=') continue;
      const p = COL[g] || COL['.'];
      for (let y = 0; y < T; y += 2) for (let x = 0; x < T; x += 2) {
        const n = noise((X + x) / 40, (Y + y) / 40) + R() * .5;
        c.fillStyle = n > .7 ? p[2] : n < -.5 ? p[1] : p[0]; c.fillRect(X + x, Y + y, 2, 2);
      }
      for (let i = 0; i < 5; i++) { c.fillStyle = R() < .5 ? p[3] : p[2]; c.fillRect(X + (R() * 15 | 0), Y + (R() * 15 | 0), 1, R() < .5 ? 2 : 1); }
      if (g === ':') {   // soft path edges
        const e = (dx, dy) => { const q = MAP[ty + dy]?.[tx + dx]; return q != null && q !== ':' && q !== '='; };
        c.fillStyle = '#a88850'; if (e(0, -1)) c.fillRect(X, Y, T, 1); if (e(0, 1)) c.fillRect(X, Y + 15, T, 1); if (e(-1, 0)) c.fillRect(X, Y, 1, T); if (e(1, 0)) c.fillRect(X + 15, Y, 1, T);
        for (let i = 0; i < 3; i++) { c.fillStyle = '#b89860'; c.fillRect(X + 2 + (R() * 11 | 0), Y + 2 + (R() * 11 | 0), 2, 1); }
      }
      if (ch === 'o') for (let i = 0; i < 3; i++) {
        const fx = X + 2 + (R() * 11 | 0), fy = Y + 2 + (R() * 11 | 0), fc = ['#f05050', '#f8e040', '#ffffff', '#f088c8', '#88a8f8'][R() * 5 | 0];
        c.fillStyle = fc; c.fillRect(fx - 1, fy, 3, 1); c.fillRect(fx, fy - 1, 1, 3); c.fillStyle = '#f8f0a0'; c.fillRect(fx, fy, 1, 1);
      }
      if (ch === 'm') { c.fillStyle = '#e8e0d0'; c.fillRect(X + 7, Y + 9, 2, 3); c.fillStyle = '#c868e8'; c.fillRect(X + 5, Y + 7, 6, 2); c.fillRect(X + 6, Y + 6, 4, 1); }
    }
    // water, lava and the bridge under their moving top
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      const ch = MAP[ty][tx], X = tx * T, Y = ty * T;
      if (ch === '~' || ch === '=') {
        const land = (dx, dy) => { const q = MAP[ty + dy]?.[tx + dx]; return q != null && q !== '~' && q !== '='; };
        let d = 0; for (let r = 1; r <= 3; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (land(dx, dy)) d = Math.max(d, 4 - r);
        c.fillStyle = ['#2858b0', '#3068c0', '#3c80d0', '#5098e0'][d]; c.fillRect(X, Y, T, T);
        if (land(0, -1)) { c.fillStyle = '#c8b070'; c.fillRect(X, Y, T, 2); c.fillStyle = '#88b8e8'; c.fillRect(X, Y + 2, T, 1); }
        if (land(-1, 0)) { c.fillStyle = '#c8b070'; c.fillRect(X, Y, 2, T); }
        if (land(1, 0)) { c.fillStyle = '#c8b070'; c.fillRect(X + 14, Y, 2, T); }
        if (land(0, 1)) { c.fillStyle = '#c8b070'; c.fillRect(X, Y + 14, T, 2); }
      }
      if (ch === '=') {
        c.fillStyle = '#9a6838'; c.fillRect(X, Y, T, T);
        c.fillStyle = '#6a4020'; for (let y = 0; y < T; y += 4) c.fillRect(X, Y + y, T, 1);
        c.fillStyle = '#b88050'; for (let y = 1; y < T; y += 4) c.fillRect(X + 1, Y + y, T - 2, 1);
        const rail = MAP[ty][tx - 1] === '~' ? X : MAP[ty][tx + 1] === '~' ? X + 14 : -1;
        if (rail >= 0) { c.fillStyle = '#4a2c14'; c.fillRect(rail, Y, 2, T); }
      }
      if (ch === 'L') { c.fillStyle = '#5a3028'; c.fillRect(X, Y, T, T); }
    }
    return cv;
  }
  // a house, drawn once
  function buildHouse(h) {
    const w = h.w * T, ht = 3 * T + 10, cv = document.createElement('canvas'); cv.width = w; cv.height = ht; const c = cv.getContext('2d');
    const wallY = 22; c.fillStyle = '#201828'; c.fillRect(0, wallY, w, ht - wallY);
    c.fillStyle = '#f0e0c0'; c.fillRect(1, wallY, w - 2, ht - wallY - 1); c.fillStyle = '#d8c8a0'; c.fillRect(1, ht - 6, w - 2, 5);
    for (let x = 6; x < w - 6; x += 9) { c.fillStyle = '#d8c8a0'; c.fillRect(x, wallY + 2, 1, ht - wallY - 8); }
    c.fillStyle = '#201828'; c.fillRect(0, 0, w, wallY + 2);
    for (let y = 1; y < wallY + 1; y++) { c.fillStyle = y % 4 === 0 ? mix(h.roof, '#200818', .35) : y < 6 ? mix(h.roof, '#ffffff', .25) : h.roof; c.fillRect(1 + (y < 4 ? 4 - y : 0), y, w - 2 - 2 * (y < 4 ? 4 - y : 0), 1); }
    for (let x = 3; x < w - 3; x += 6) { c.fillStyle = mix(h.roof, '#200818', .2); c.fillRect(x, 6, 1, wallY - 6); }
    const dx = (w >> 1) - 6; c.fillStyle = '#201828'; c.fillRect(dx, ht - 20, 12, 20); c.fillStyle = '#8a5030'; c.fillRect(dx + 1, ht - 19, 10, 19); c.fillStyle = '#f8d040'; c.fillRect(dx + 8, ht - 10, 2, 2);
    for (const wx of [6, w - 18]) { c.fillStyle = '#201828'; c.fillRect(wx, wallY + 8, 12, 10); c.fillStyle = '#88c8f0'; c.fillRect(wx + 1, wallY + 9, 10, 8); c.fillStyle = '#ffffff'; c.fillRect(wx + 2, wallY + 10, 3, 2); c.fillStyle = '#201828'; c.fillRect(wx + 6, wallY + 9, 1, 8); }
    if (h.name) { c.fillStyle = '#201828'; c.fillRect((w >> 1) - 14, wallY - 2, 28, 9); c.fillStyle = '#f8e8b0'; c.fillRect((w >> 1) - 13, wallY - 1, 26, 7); text(c, h.name, w >> 1, wallY, { color: '#583018', align: 'center' }); }
    return cv;
  }
  const houseArt = HOUSES.map(buildHouse);

  // ---------------------------------------------------------- critters
  function critter(id, lvl) {
    const sp = SPECIES[id], [hp, atk, def, spd] = sp.base;
    const f = new Fighter({ name: id, hp: hp + Math.round(lvl * 3.2), atk: atk + lvl * 1.3, def: def + lvl * 1.1, spd: spd + lvl * .8, level: lvl, type: sp.type, luck: .06 });
    f.sp = id; f.xp = xpFor(lvl, CURVE); f.learn = sp.moves.filter(m => m[0] <= lvl).map(m => MV[m[1]]).slice(-4);
    return f;
  }
  const lead = () => party.find(f => f.alive);
  const pickWild = z => { const e = /** @type {{ id: string, lv: number[], w: number }} */ (loot(WILD[z])); return critter(e.id, e.lv[0] + (Math.random() * (e.lv[1] - e.lv[0] + 1) | 0)); };

  // ---------------------------------------------------------- people and the world's things
  function setupWorld() {
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) map.set(tx, ty, SOLID[MAP[ty][tx]] ? '#' : '.');
    for (const h of HOUSES) for (let y = 0; y < 3; y++) for (let x = 0; x < h.w; x++) map.set(h.tx + x, h.ty + y, '#');
    map.set(WELL.tx, WELL.ty, '#');
    npcs = [
      { id: 'bram', tx: 5, ty: 52, dir: 'down', name: 'KEEPER BRAM' },
      { id: 'mira', tx: 18, ty: 52, dir: 'down', name: 'MIRA' },
      { id: 'kid', tx: 8, ty: 57, dir: 'right', name: 'PIP' },
      { id: 'tess', tx: 21, ty: 40, dir: 'left', name: 'RANGER TESS', team: [['ZIPWING', 5], ['MOSSBACK', 6]], seal: 'MEADOW SEAL' },
      { id: 'gil', tx: 24, ty: 29, dir: 'left', name: 'FISHER GIL', team: [['PUDDLEFIN', 7], ['CRAGCLAW', 8]], seal: 'LAKE SEAL' },
      { id: 'rook', tx: 18, ty: 15, dir: 'down', name: 'HIKER ROOK', team: [['PEBBLIT', 8], ['CINDERMOTH', 9], ['PEBBLIT', 9]], seal: 'RIDGE SEAL' },
      { id: 'sign1', tx: 6, ty: 42, sign: ['BREEZY MEADOW', 'TALL GRASS HIDES CRITTERS. WATCH YOUR STEP!'] },
      { id: 'sign2', tx: 10, ty: 35, sign: ['MIRROR LAKE', 'REEDS BY THE WATER HIDE RIPPLE CRITTERS.'] },
      { id: 'sign3', tx: 10, ty: 23, sign: ['CINDER RIDGE', 'HOT ROCKS. EMBER AND STONE CRITTERS LIVE IN THE ASH GRASS.'] },
      { id: 'sign4', tx: 12, ty: 12, sign: ['THE GROVE GATE', 'THREE SEALS OF THE KEEPERS OPEN THE WAY.'] },
      { id: 'warden', tx: 13, ty: 5, name: 'GROVE WARDEN', boss: true },
    ];
    for (const n of npcs) { n.x = n.tx * T + 8; n.y = n.ty * T + 8; n.beaten = false; n.walk = 0; map.set(n.tx, n.ty, '#'); }
    items = ITEMS.map(i => ({ ...i, got: false }));
    gateOpen = false;
    for (let x = 13; x <= 14; x++) map.set(x, 11, '#');
    nav = new NavGrid(COLS, ROWS, T, (cx, cy) => map.solid(cx, cy));
  }
  const npc = id => npcs.find(n => n.id === id);
  const at = n => ({ x: n.tx * T + 8, y: n.ty * T + 8 });

  function makeQuests() {
    quests = new Quests({
      log: { name: 'FILL THE LOGBOOK', stages: {
        catch: { text: 'CATCH 3 CRITTERS', count: 3, of: 'catch', next: 'back' },
        back: { text: 'SHOW KEEPER BRAM', at: at(npc('bram')), next: 'done' },
        done: { end: 'done', text: 'BRAM STAMPED YOUR LOGBOOK' } },
        rewards: { done: { jars: 3, berries: 2 } } },
      pup: { name: "MIRA'S LOST PUP", stages: {
        find: { text: 'FIND BISCUIT BY MIRROR LAKE', at: { x: PUP.tx * T + 8, y: PUP.ty * T + 8 }, next: 'home' },
        home: { text: 'TAKE BISCUIT HOME TO MIRA', at: at(npc('mira')), next: 'done' },
        done: { end: 'done', text: 'BISCUIT IS HOME' } },
        rewards: { done: { berries: 3, gold: 1 } } },
      seals: { name: 'THE THREE SEALS', stages: {
        win: { text: 'WIN THE 3 KEEPER SEALS', count: 3, of: 'seal', next: 'gate' },
        gate: { text: 'OPEN THE GROVE GATE', at: { x: 14 * T, y: 12 * T }, next: 'warden' },
        warden: { text: 'FACE THE GROVE WARDEN', at: at(npc('warden')), next: 'done' },
        done: { end: 'done', text: 'THE GROVE IS AT PEACE' } } },
    }, { link: false });
    quests.on('stage', (id, stage) => { const st = quests.table[id].stages[stage]; if (st && !st.end) { trackI = id; banner = { txt: 'QUEST: ' + st.text, l: 2.4, quest: true }; sounds.select(); } });
    quests.on('end', id => { addScore(4); banner = { txt: 'QUEST DONE: ' + quests.table[id].name, l: 2.6, quest: true }; sounds.fanfare(); haptic('success'); feel.powerup(hero.x, hero.y - 12, { color: '#f8d040' }); });
    quests.on('reward', (id, r) => { if (r.jars) bag.add('jar', r.jars); if (r.berries) bag.add('berry', r.berries); if (r.gold) bag.add('gold', r.gold); });
  }
  const addScore = n => { score += n; api.score(score); };

  // ---------------------------------------------------------- talking
  function say(lines, then = null, who = null) {
    talkQ = lines.map(l => typeof l === 'string' ? { who, txt: l } : l); talkThen = then; mode = 'talk';
    tw = new Typewriter(talkQ[0].txt, { speed: K.textSpeed }); stick.release(); press = null; path = null;
  }
  function talkTap() {
    if (!tw.done) { tw.skip(); return; }
    talkQ.shift(); sounds.blip();
    if (talkQ.length) { tw = new Typewriter(talkQ[0].txt, { speed: K.textSpeed }); return; }
    mode = 'walk'; const f = talkThen; talkThen = null; if (f) f();
  }

  function interact(n) {
    path = null; face(n);
    if (n.sign) return say(n.sign.slice(1), null, n.sign[0]);
    if (n.id === 'well') { for (const f of party) f.hp = f.maxHp, f.statuses.clear(), f.buffs = []; sounds.heal(); haptic('success'); return say(['THE WELL\'S COOL WATER RESTORES YOUR WHOLE TEAM!'], null, 'WELL'); }
    if (n.id === 'gate') {
      if (quests.is('seals', 'gate') || gateOpen) { openGate(); return; }
      return say([`THE GATE IS SEALED. SEALS: ${quests.progress('seals').n || 0} OF 3.`, 'BEAT THE KEEPERS OF THE WILDS: TESS, GIL AND ROOK.'], null, 'GATE');
    }
    if (n.id === 'bram') {
      for (const f of party) f.hp = f.maxHp, f.statuses.clear();
      if (quests.is('log', 'back')) return say(['A FULL LOGBOOK! WONDERFUL WORK.', 'HERE: 3 JARS AND 2 BERRIES. NOW, ON TO THE SEALS!'], () => quests.to('log', 'done'), n.name);
      return say(['REST A MOMENT... YOUR TEAM IS FULLY HEALED!', quests.active('seals') ? 'THE GROVE WARDEN WAITS PAST THE GATE. WIN THE SEALS FIRST.' : 'THE GROVE IS CALM AGAIN, THANKS TO YOU.'], null, n.name);
    }
    if (n.id === 'mira') {
      if (quests.is('pup', 'home')) return say(['BISCUIT! YOU FOUND HIM!', 'TAKE THESE BERRIES, AND MY GOLD JAR. IT NEVER MISSES!'], () => { follower = null; quests.to('pup', 'done'); }, n.name);
      if (!quests.stage('pup') && !quests.ended('pup')) return say(['MY PUP BISCUIT CHASED A BUTTERFLY TO MIRROR LAKE...', 'HE\'S HIDING IN THE REEDS ON THE WEST SHORE. PLEASE BRING HIM HOME!'], () => quests.start('pup'), n.name);
      return say([quests.ended('pup') ? 'BISCUIT WON\'T STOP WAGGING. THANK YOU!' : 'THE WEST SHORE OF THE LAKE, PAST THE MEADOW!'], null, n.name);
    }
    if (n.id === 'kid') return say(['TIP! WEAKEN A CRITTER BEFORE YOU THROW A JAR.', 'SLEEPY ONES ARE EASIEST. EMBER BEATS SPROUT, SPROUT BEATS RIPPLE, RIPPLE BEATS EMBER, AND STONE HATES WATER AND LEAVES!'], null, n.name);
    if (n.team) {
      if (n.beaten) return say([`YOU EARNED THAT ${n.seal}. GOOD LUCK IN THE GROVE!`], null, n.name);
      return say([`${n.name.split(' ')[1]} HERE! KEEPER OF THE ${n.seal.split(' ')[0]}.`, 'SHOW ME WHAT YOUR TEAM CAN DO!'], () => startBattle(n.team.map(([id, l]) => critter(id, l)), 'keeper', n), n.name);
    }
    if (n.boss) {
      if (!quests.is('seals', 'warden')) return;
      return say(['...WHO WAKES THE GROVE?', 'PROVE YOUR BOND WITH YOUR CRITTERS, LITTLE KEEPER!'], () => startBattle([critter('ELDERBARK', 12)], 'boss', n), 'GROVE WARDEN');
    }
  }
  function face(n) { const dx = n.x - hero.x, dy = n.y - hero.y; hero.dir = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) }; if (n.dir && !n.boss) n.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'left' : 'right') : (dy > 0 ? 'up' : 'down'); }
  function openGate() {
    if (gateOpen) return;
    gateOpen = true; for (let x = 13; x <= 14; x++) { map.set(x, 11, '.'); nav.set(x, 11, false); }
    sounds.unlock(); feel.boom(14 * T, 11 * T + 8, { color: '#f8e070' }); haptic('heavy');
    if (quests.is('seals', 'gate')) quests.to('seals', 'warden');
    say(['THE THREE SEALS GLOW... THE GROVE GATE SWINGS OPEN!'], null, 'GATE');
  }

  // ---------------------------------------------------------- battles
  function startBattle(team, kind, who = null) {
    foes = team; foeKind = kind; foeWho = who; mode = 'battle'; menu = 'intro'; queue = []; cur = null; proj = [];
    vis = new Map(); shownHp = new Map(); press = null; path = null; stick.release();
    fight = new Battle([[lead()], [foes[0]]], { types: TYPES });
    fight.on('*', e => events.push(e));
    opp.skill = kind === 'wild' ? K.wildSkill : kind === 'boss' ? K.wardenSkill : K.keeperSkill;
    opp.join(fight);
    for (const f of [...party, ...foes]) { vis.set(f, { dx: 0, dy: 0, flash: 0, shake: 0, alpha: 1, scale: 1, sink: 0 }); shownHp.set(f, f.hp); }
    wipe = 1; haptic('heavy'); sounds.charge(); notes(kind === 'wild' ? 'E5 G5 B5 E6' : 'C5 E5 G5 C6 - G5 C6', { len: .07 });
    const f = foes[0], intro = kind === 'wild' ? `A WILD ${f.name} LEAPS OUT!` : kind === 'boss' ? 'THE GROVE WARDEN ELDERBARK RISES!' : `${who.name} SENDS OUT ${f.name}!`;
    vis.get(f).dx = 90; vis.get(lead()).dx = -90;
    queue.push({ d: .7, slide: true }, { txt: intro, d: 1.1 }, { txt: `GO, ${lead().name}!`, d: .8 });
  }
  const events = [];
  const side = f => fight.sideOf(f);
  const me = () => fight.sides[0][0], them = () => fight.sides[1][0];

  // turn the battle's events into a show: words, lunges, shots, flashes, health draining
  function show(evs) {
    const hp = new Map([...shownHp]);
    for (const e of evs) {
      if (e.type === 'hit') {
        const was = hp.get(e.target) ?? e.target.hp, to = Math.max(0, was - e.amount); hp.set(e.target, to);
        if (e.item) { queue.push({ txt: `${e.item.name} HITS!`, d: .6 }); continue; }
        if (!queue.used?.has(e.move)) queue.push({ txt: `${e.who.name} USED ${e.move.name}!`, d: .55 });
        (queue.used ||= new Set()).add(e.move);
        queue.push({ atk: e.who, target: e.target, move: e.move, d: .45 }, { impact: e, to, d: .35 });
        if (e.effect > 1) queue.push({ txt: 'IT\'S SUPER EFFECTIVE!', d: .7, big: true });
        else if (e.effect < 1) queue.push({ txt: 'IT\'S NOT VERY EFFECTIVE...', d: .6 });
        if (e.crit) queue.push({ txt: 'A CRITICAL HIT!', d: .6, big: true });
      } else if (e.type === 'miss') queue.push({ txt: `${e.who.name} USED ${e.move.name}!`, d: .5 }, { atk: e.who, target: e.target, move: e.move, d: .4, miss: true }, { txt: 'BUT IT MISSED!', d: .6 });
      else if (e.type === 'faint') queue.push({ faint: e.target, d: .6 }, { txt: `${e.target.name} FAINTED!`, d: .8 });
      else if (e.type === 'status') queue.push({ fx: e.target, kind: e.status, d: .4 }, { txt: `${e.target.name} ${{ burn: 'IS BURNED!', poison: 'IS POISONED!', sleep: 'FELL ASLEEP!', stun: 'IS STUNNED!' }[e.status] || 'IS ' + e.status.toUpperCase()}`, d: .7 });
      else if (e.type === 'hurt') { const was = hp.get(e.target) ?? e.target.hp, to = Math.max(0, was - e.amount); hp.set(e.target, to); queue.push({ impact: { target: e.target, amount: e.amount, status: true }, to, d: .35 }, { txt: `${e.target.name} IS HURT BY ${e.status === 'burn' ? 'ITS BURN' : 'POISON'}!`, d: .6 }); }
      else if (e.type === 'heal' && e.amount > 0) { const was = hp.get(e.target) ?? e.target.hp, to = Math.min(e.target.maxHp, was + e.amount); hp.set(e.target, to); queue.push(e.item ? { txt: `${e.who.name} ATE A BERRY!`, d: .5 } : e.status ? { txt: '', d: 0 } : { txt: `${e.who.name} USED ${MV.ROOT.name}!`, d: .5 }, { heal: e.target, to, d: .5 }, { txt: `${e.target.name} RECOVERED ${e.amount} HP!`, d: .6 }); }
      else if (e.type === 'buff') { const up = e.by >= 1; queue.push({ txt: `${e.who === e.target ? '' : ''}${e.who.name}'S ${{ atk: 'ATTACK', def: 'DEFENCE', spd: 'SPEED' }[e.stat]} ${up ? 'ROSE!' : 'FELL!'}`, d: .65, fxOn: e.who, kind: up ? 'up' : 'down' }); }
      else if (e.type === 'skip') queue.push({ txt: `${e.who.name} ${e.status === 'sleep' ? 'IS FAST ASLEEP...' : 'CAN\'T MOVE!'}`, d: .7 });
      else if (e.type === 'cured' && (e.status === 'sleep' || e.status === 'stun')) queue.push({ txt: `${e.target.name} ${e.status === 'sleep' ? 'WOKE UP!' : 'CAN MOVE AGAIN!'}`, d: .5 });
      else if (e.type === 'wait' && e.swap) queue.push({ txt: e.swap, d: .7 });
    }
    queue.used = null;
  }
  function act(choice) {
    events.length = 0;
    const who = fight.turn; if (!who) return;
    if (choice.move && !choice.move.power && choice.move.heal) choice.target = who;
    fight.act(who, choice);
    show(events);
    queue.push({ then: true, d: 0 });
  }
  // the next thing the fight needs: a fainted critter replaced, the end, the foe's turn, or the menu
  function nextTurn() {
    const mine = me(), foe = them();
    if (!foe.alive) {
      const xp = Math.round((6 + foe.level * 5) * (foeKind === 'wild' ? 1 : 1.5) * K.xp);
      giveXp(xp);
      const nextFoe = foes.find(f => f.alive);
      if (nextFoe) {
        fight.sides[1][0] = nextFoe; fight.queue = []; fight.next(); vis.get(nextFoe).dx = 90;
        queue.push({ txt: `${foeWho.name} SENDS OUT ${nextFoe.name}!`, d: .9, slideIn: nextFoe });
        queue.push({ then: true, d: 0 }); return;
      }
      return winBattle();
    }
    if (!mine.alive) {
      if (!lead()) return loseBattle();
      menu = 'team'; return;
    }
    if (fight.turn && side(fight.turn) === 1) {
      const c = opp.pick(fight.turn, fight.turn.learn);
      act(c.move || c.item ? c : { move: fight.turn.learn[0], target: mine }); return;
    }
    if (!fight.turn) { fight.queue = []; fight.next(); }
    menu = 'main';
  }
  function giveXp(xp) {
    const m = me(), up = gainXp(m, xp, { growth: GROW, curve: CURVE });
    queue.push({ txt: `${m.name} GAINED ${xp} XP!`, d: .7, xpBar: m });
    for (const f of party) if (f !== m && f.alive) gainXpQuiet(f, xp >> 1);
    if (up) levelUp(m, up);
  }
  function gainXpQuiet(f, xp) { const up = gainXp(f, xp, { growth: GROW, curve: CURVE }); if (up) levelUp(f, up); }
  function levelUp(f, up) {
    queue.push({ txt: `${f.name} GREW TO LEVEL ${f.level}!`, d: .9, levelUp: f });
    for (const [lv, id] of SPECIES[f.sp].moves) if (lv > f.level - up && lv <= f.level && !f.learn.includes(MV[id])) {
      f.learn.push(MV[id]); if (f.learn.length > 4) f.learn.shift();
      queue.push({ txt: `${f.name} LEARNED ${MV[id].name}!`, d: .9 });
    }
  }
  function winBattle() {
    const kind = foeKind, who = foeWho;
    opp.result(true);
    if (kind === 'wild') { addScore(1); queue.push({ txt: '', d: .2, done: true, after: who === 'pup' && quests.is('pup', 'find') ? rescuePup : null }); }
    else if (kind === 'keeper') {
      addScore(3); who.beaten = true; bag.add('berry', 1);
      queue.push({ txt: `YOU BEAT ${who.name}!`, d: 1, big: true }, { txt: `YOU EARNED THE ${who.seal}! AND A BERRY.`, d: 1.1, seal: true }, { done: true, d: 0, after: () => quests.count('seal') });
    } else if (kind === 'boss') {
      addScore(10);
      queue.push({ txt: 'ELDERBARK IS CALM AGAIN...', d: 1.2 }, { txt: 'THE GROVE BLOOMS. YOU ARE A TRUE KEEPER!', d: 1.6, big: true }, { done: true, d: 0, after: () => { quests.to('seals', 'done'); endT = 2.5; mode = 'won'; } });
    }
  }
  function loseBattle() {
    opp.result(false);
    queue.push({ txt: 'YOUR WHOLE TEAM IS WORN OUT...', d: 1.4 }, { done: true, d: 0, after: () => { mode = 'end'; endT = 1; feel.lose(); } });
  }
  function endBattle() {
    fight = null; foes = null; mode = mode === 'battle' ? 'walk' : mode; wipe = 0; grace = 3;
    for (const f of party) { f.buffs = []; f.statuses.delete('stun'); f.statuses.delete('sleep'); }
    const e = party.find(f => SPECIES[f.sp].evolve && f.level >= SPECIES[f.sp].evolve[0]);
    if (e && mode === 'walk') { evo = { f: e, from: e.sp, to: SPECIES[e.sp].evolve[1], t: 0 }; mode = 'evolve'; sounds.charge(); }
  }
  function rescuePup() {
    follower = { x: hero.x, y: hero.y }; trail = [];
    say(['BISCUIT PEEKS OUT OF THE REEDS AND WAGS HIS FLAMING TAIL!', 'HE\'LL FOLLOW YOU HOME.'], () => quests.to('pup', 'home'), 'BISCUIT');
  }
  function throwJar(kind) {
    const foe = them();
    if (foeKind !== 'wild') { queue.push({ txt: 'YOU CAN\'T CATCH A KEEPER\'S CRITTER!', d: .9 }, { then: true, d: 0 }); menu = 'wait'; return; }
    bag.take(kind);
    const sleepy = foe.has('sleep') || foe.has('stun') ? 1.6 : 1, chance = kind === 'gold' ? 1 : clamp((1 - .78 * foe.hp / foe.maxHp) * sleepy, .08, .95), caught = Math.random() < chance;
    const shakes = caught ? 3 : Math.min(2, Math.floor(chance * 3.2));
    queue.push({ txt: 'YOU THREW A JAR!', d: .4 }, { jar: kind, d: .55 }, { jarIn: true, d: .4 });
    for (let i = 0; i < shakes; i++) queue.push({ wobble: i, d: .55 });
    if (caught) queue.push({ caught: true, d: .9 }, { txt: `GOTCHA! ${foe.name} WAS CAUGHT!`, d: 1.1, big: true }, { done: true, d: 0, after: () => catchIt(foe) });
    else { queue.push({ breakFree: true, d: .4 }, { txt: ['OH NO! IT BROKE FREE!', 'ARGH! ALMOST HAD IT!', 'SO CLOSE!'][shakes], d: .8 }); queue.push({ skipTurn: true, d: 0 }, { then: true, d: 0 }); }
    menu = 'wait';
  }
  function catchIt(foe) {
    addScore(2); quests.count('catch');
    foe.statuses.clear(); foe.buffs = []; foe.hp = Math.max(foe.hp, foe.maxHp >> 1);
    if (party.length < 4) party.push(foe); else { banner = { txt: `${foe.name} WENT TO THE LODGE`, l: 2 }; }
  }
  function choose(i) {
    const m = me();
    if (menu === 'main') {
      sounds.select();
      if (i === 0) menu = 'fight';
      else if (i === 1) menu = 'bag';
      else if (i === 2) menu = 'team';
      else if (foeKind !== 'wild') { queue.push({ txt: 'NO RUNNING FROM THIS FIGHT!', d: .8 }, { then: true, d: 0 }); menu = 'wait'; }
      else if (Math.random() < (m.stat('spd') >= them().stat('spd') ? 1 : .7)) { queue.push({ txt: 'GOT AWAY SAFELY!', d: .8 }, { done: true, d: 0 }); menu = 'wait'; sounds.whoosh(); }
      else { queue.push({ txt: 'COULDN\'T GET AWAY!', d: .8 }, { skipTurn: true, d: 0 }, { then: true, d: 0 }); menu = 'wait'; }
    } else if (menu === 'fight') {
      if (i === 4) { menu = 'main'; sounds.back(); return; }
      const mv = m.learn[i]; if (!mv) return;
      menu = 'wait'; act({ move: mv, target: them() });
    } else if (menu === 'bag') {
      if (i === 4) { menu = 'main'; sounds.back(); return; }
      const id = ['jar', 'gold', 'berry'][i]; if (!id || !bag.has(id)) { sounds.deny(); return; }
      if (id === 'berry') { if (m.hp >= m.maxHp) { sounds.deny(); return; } menu = 'wait'; act({ item: bag.list.find(x => x.id === 'berry'), target: m }); return; }
      throwJar(id);
    } else if (menu === 'team') {
      const f = party[i];
      if (i === 4) { if (!m.alive) return; menu = 'main'; sounds.back(); return; }
      if (!f || !f.alive || f === m) { sounds.deny(); return; }
      const forced = !m.alive;
      fight.sides[0][0] = f; vis.get(f).dx = -90;
      if (forced) { fight.queue = []; fight.next(); queue.push({ txt: `GO, ${f.name}!`, d: .7, slideIn: f }, { then: true, d: 0 }); }
      else { fight.queue = fight.queue.map(x => x === m ? f : x); events.length = 0; fight.act(f, { wait: true }); queue.push({ txt: `COME BACK, ${m.name}! GO, ${f.name}!`, d: .9, slideIn: f }); show(events.filter(e => e.type !== 'wait')); queue.push({ then: true, d: 0 }); }
      menu = 'wait';
    }
  }
  function runQueue(dt) {
    if (!queue.length && !cur) return;
    if (!cur) { cur = queue.shift(); cur.t = 0; startStep(cur); }
    cur.t += dt;
    stepFx(cur, dt);
    if (cur.t >= cur.d) { endStep(cur); cur = null; }
  }
  function startStep(s) {
    if (s.atk) { const v = vis.get(s.atk); v.lunge = side(s.atk) === 0 ? 1 : -1; if (s.move.fx !== 'up' && s.move.fx !== 'heal') proj.push({ fx: s.move.fx, from: s.atk, to: s.target, t: 0, d: s.d * .8, miss: s.miss }); playMoveSound(s.move); }
    if (s.impact) {
      const e = s.impact, v = vis.get(e.target); v.flash = .35; v.shake = .3;
      const p = spot(e.target); feel.hit(p.x, p.y, { color: TCOL[e.move?.type] || '#ffffff', power: e.effect > 1 ? .8 : .45 });
      feel.juice.pop(p.x + 6, p.y - 18, `-${e.amount}`, { color: e.effect > 1 ? '#f8d040' : '#ffffff', font: '"Press Start 2P", monospace', size: 6, life: .8, rise: 14 });
      if (e.effect > 1 || e.crit) { feel.juice.shake(4); haptic('heavy'); } else haptic('medium');
      sounds[e.effect > 1 ? 'blast' : e.status ? 'thud' : 'hit']();
      s.from = shownHp.get(e.target);
    }
    if (s.heal) { s.from = shownHp.get(s.heal); sounds.heal(); const p = spot(s.heal); feel.powerup(p.x, p.y, { color: '#78f088' }); }
    if (s.faint) { sounds.lose(); haptic('error'); }
    if (s.fx || s.fxOn) { const f = s.fx || s.fxOn, p = spot(f); feel.juice.burst(p.x, p.y, { color: { burn: '#f86020', poison: '#b048d8', sleep: '#c8c8f8', stun: '#f8e040', up: '#f8d040', down: '#7890f8' }[s.kind] || '#ffffff', n: 14 }); sounds[s.kind === 'down' ? 'wobble' : s.kind === 'up' ? 'powerup' : 'zap'](); }
    if (s.big) { haptic('success'); }
    if (s.levelUp) { sounds.levelup(); const p = spot(s.levelUp); feel.powerup(p.x, p.y, { color: '#f8d040', text: 'LV UP' }); }
    if (s.seal) sounds.fanfare();
    if (s.jar) { proj.push({ fx: 'jar', kind: s.jar, from: me(), to: them(), t: 0, d: s.d }); sounds.swoosh(); }
    if (s.jarIn) { vis.get(them()).scale = 1; sounds.warp(); }
    if (s.wobble != null) { sounds.tick(); haptic('light'); }
    if (s.caught) { sounds.tada(); haptic('success'); const p = spot(them()); feel.coin(p.x, p.y + 10, { color: '#f8d040' }); }
    if (s.breakFree) { sounds.pop(); vis.get(them()).scale = 1; feel.hit(spot(them()).x, spot(them()).y, { color: '#a8d8f0' }); }
    if (s.slideIn) sounds.swoosh();
    if (s.txt) lastTxt = s;
  }
  function stepFx(s, dt) {
    if (s.impact) shownHp.set(s.impact.target, s.from + (s.to - s.from) * Math.min(1, s.t / s.d));
    if (s.heal) shownHp.set(s.heal, s.from + (s.to - s.from) * Math.min(1, s.t / s.d));
    if (s.faint) vis.get(s.faint).sink = Math.min(1, s.t / s.d);
    if (s.slide) for (const f of [me(), them()]) { const v = vis.get(f); v.dx = Math.round(v.dx * Math.max(0, 1 - dt * 9)); }
    if (s.slideIn) { const v = vis.get(s.slideIn); v.dx = Math.round(v.dx * Math.max(0, 1 - dt * 10)); v.sink = 0; }
    if (s.jarIn) vis.get(them()).scale = Math.max(0, 1 - s.t / s.d);
    if (s.breakFree) vis.get(them()).scale = Math.min(1, s.t / s.d);
  }
  function endStep(s) {
    if (s.impact) shownHp.set(s.impact.target, s.to);
    if (s.heal) shownHp.set(s.heal, s.to);
    if (s.slide || s.slideIn) for (const f of [me(), them()]) vis.get(f).dx = 0;
    if (s.jarIn) vis.get(them()).scale = 0;
    if (s.skipTurn) { const m = me(); fight.endTurn(m); fight.next(); }
    if (s.then) { for (const f of fight.fighters) shownHp.set(f, f.hp); nextTurn(); }
    if (s.done) { const f = s.after; queue.length = 0; cur = null; endBattle(); if (f) f(); }
    if (menu === 'intro' && !queue.length && s.txt && s.txt.startsWith('GO,')) nextTurn();
  }
  function playMoveSound(m) { ({ fire: sounds.crackle, leaf: sounds.slash, water: sounds.splash, rock: sounds.crumble, spore: sounds.buzz, down: sounds.squeak, bump: sounds.punch }[m.fx] || sounds.whoosh)(); }

  // ---------------------------------------------------------- layout
  const MENU_H = 48;
  function layout() {
    const menuY = H - MENU_H, sa = api.scoreArea(), sk = H > 210 ? 4 : 3, S = 16 * sk;
    const foeX = W - S - 10, foeY = Math.max(sa.bottom + 4, Math.min(28, menuY - 2 * S - 22)), meX = 12, meY = menuY - S - 6;
    return { menuY, sk, S, foeX, foeY, meX, meY, plate1: { x: 4, y: Math.max(4, sa.x < 92 ? sa.bottom + 2 : 4), w: 92 }, plate2: { x: W - 98, y: menuY - 36, w: 94 } };
  }
  function spot(f) {   // a fighter's middle on screen
    const L = layout(), mine = side(f) === 0, S = L.S;
    return mine ? { x: L.meX + S / 2, y: L.meY + S / 2 } : { x: L.foeX + L.S / 2, y: L.foeY + S / 2 };
  }
  function btnRect(i, n = 4) {
    const L = layout(), cols = 2, bw = (W - 12) / cols | 0, bh = 18;
    if (i === 4) return { x: W - 34, y: L.menuY + 4, w: 30, h: 12 };
    return { x: 4 + (i % cols) * (bw + 4), y: L.menuY + 6 + (i >> 1) * (bh + 3) + (n === 4 ? 0 : 0), w: bw, h: bh };
  }
  const inR = (r, x, y) => x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 2;

  // ---------------------------------------------------------- walking
  function tryWalkInto(dt) {
    if (!hero.dir || (hero.vx * hero.vx + hero.vy * hero.vy) > 4) { bump = 0; return; }
    const tx = Math.floor((hero.x + hero.dir.x * 10) / T), ty = Math.floor((hero.y + hero.dir.y * 10) / T), n = thingAt(tx, ty);
    if (n && (stick.mag > .3 || keysHeld())) { bump += dt; if (bump > .25) { bump = 0; stick.release(); interact(n); } } else bump = 0;
  }
  let held = {};
  const keysHeld = () => held.ArrowLeft || held.ArrowRight || held.ArrowUp || held.ArrowDown;
  function thingAt(tx, ty) {
    const n = npcs.find(q => q.tx === tx && q.ty === ty && !(q.boss && !quests.is('seals', 'warden')));
    if (n) return n;
    if (tx === WELL.tx && ty === WELL.ty) return { id: 'well', x: tx * T + 8, y: ty * T + 8, tx, ty };
    if (!gateOpen && ty === 11 && (tx === 13 || tx === 14)) return { id: 'gate', x: tx * T + 8, y: ty * T + 8, tx, ty };
    return null;
  }
  function walkTo(wx, wy, then = null) {
    const p = nav.path(hero.x, hero.y, wx, wy);
    if (!p) { sounds.deny(); return false; }
    path = { pts: p.slice(1), then, stuck: 0, lx: hero.x, ly: hero.y }; return true;
  }
  function tapWorld(sx, sy) {
    const w = cam.toWorld(sx, sy), tx = Math.floor(w.x / T), ty = Math.floor(w.y / T), n = thingAt(tx, ty);
    if (n) {
      if (Math.hypot(n.x - hero.x, n.y - hero.y) < 26) { interact(n); return; }
      const spots = [[0, 1], [0, -1], [-1, 0], [1, 0]].map(([dx, dy]) => ({ x: (tx + dx) * T + 8, y: (ty + dy) * T + 8 })).filter(p => !nav.blocked(p.x, p.y))
        .sort((a, b) => Math.hypot(a.x - hero.x, a.y - hero.y) - Math.hypot(b.x - hero.x, b.y - hero.y));
      for (const s of spots) if (walkTo(s.x, s.y, () => interact(n))) return;
      return;
    }
    if (!nav.blocked(w.x, w.y)) { walkTo(w.x, w.y); feel.click(); marker = { x: tx * T + 8, y: ty * T + 8, l: .6 }; }
  }
  let marker = null;
  function walkInput() {
    if (stick.active && stick.mag > .15) { path = null; return { x: stick.x, y: stick.y }; }
    const k = { x: (held.ArrowRight ? 1 : 0) - (held.ArrowLeft ? 1 : 0), y: (held.ArrowDown ? 1 : 0) - (held.ArrowUp ? 1 : 0) };
    if (k.x || k.y) { path = null; return k; }
    if (path) {
      const p = path.pts[0]; if (!p) { const f = path.then; path = null; if (f) f(); return { x: 0, y: 0 }; }
      const dx = p.x - hero.x, dy = p.y - hero.y, d = Math.hypot(dx, dy);
      if (d < 2) { path.pts.shift(); return { x: 0, y: 0 }; }
      return { x: dx / d * Math.min(1, d / 6), y: dy / d * Math.min(1, d / 6) };
    }
    return { x: 0, y: 0 };
  }
  function trainerSight() {
    for (const n of npcs) {
      if (!n.team || n.beaten || n.walk) continue;
      const htx = Math.floor(hero.x / T), hty = Math.floor(hero.y / T), d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[n.dir];
      for (let i = 1; i <= 4; i++) {
        const tx = n.tx + d[0] * i, ty = n.ty + d[1] * i;
        if (map.solid(tx, ty)) break;
        if (tx === htx && ty === hty) {
          n.walk = { t: 0, steps: i - 1, d }; mode = 'spotted'; spotted = n; path = null; stick.release();
          sounds.alarm(); haptic('heavy'); hero.vx = hero.vy = 0; return;
        }
      }
    }
  }
  let spotted = null, lastTxt = null, jarKind = 'jar';
  function updateSpotted(dt) {
    const n = spotted, w = n.walk; w.t += dt;
    if (w.t < .7) return;
    const want = (w.t - .7) * K.walk, dist = w.steps * T;
    map.set(n.tx, n.ty, '.');
    const k = Math.min(want, dist); n.x = n.tx * T + 8 + w.d[0] * k; n.y = n.ty * T + 8 + w.d[1] * k;
    if (want >= dist) {
      n.tx += w.d[0] * w.steps; n.ty += w.d[1] * w.steps; n.x = n.tx * T + 8; n.y = n.ty * T + 8; map.set(n.tx, n.ty, '#'); nav.set(n.tx, n.ty, true);
      for (let i = 0; i < w.steps; i++) nav.set(n.tx - w.d[0] * (i + 1), n.ty - w.d[1] * (i + 1), false);
      n.walk = null; spotted = null; mode = 'walk'; face(n); interact(n);
    }
  }

  // ---------------------------------------------------------- the round
  const self = {
    reset() {
      mode = 'pick'; score = 0; t = 0; party = []; feel.clear(); events.length = 0;
      bag = new Bag({ jar: { name: 'JAR' }, gold: { name: 'GOLD JAR' }, berry: { name: 'BERRY', heal: 20 } }); bag.add('jar', 2); bag.add('berry', 2);
      setupWorld(); makeQuests();
      hero = new TopDown({ x: 12 * T + 8, y: 53 * T + 8, w: 9, h: 7, speed: K.walk, accel: 900, stop: 1400 }); hero.dir = { x: 0, y: -1 };
      cam = new Camera2D(W, H, { pixel: true, bounds: [0, 0, WW, WH], lag: .12, deadzone: [10, 8] }); cam.snap(hero.x, hero.y);
      stick = new Stick({ floating: true, zone: [0, 0, W, H], r: 26, color: '#ffffff' });
      follower = null; trail = []; press = null; path = null; bump = 0; zone = null; banner = null; talkQ = []; tw = null; talkThen = null;
      fight = null; foes = null; menu = null; queue = []; cur = null; proj = []; wipe = 0; evo = null; endT = 0; gdist = 0; grace = 4; pickI = -1; trackI = 'seals';
      spotted = null; marker = null; held = {};
      motes = Array.from({ length: 26 }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random(), i }));
    },
    resize(w, h) { W = w; H = h; if (cam) { const x = cam.x, y = cam.y; cam = new Camera2D(W, H, { pixel: true, bounds: [0, 0, WW, WH], lag: .12, deadzone: [10, 8] }); cam.snap(x, y); } if (stick) stick.place(0, 0, [0, 0, W, H]); },
    update(dt) {
      t += dt; feel.update(dt); if (feel.frozen) return;
      if (banner) { banner.l -= dt; if (banner.l <= 0) banner = null; }
      if (marker) { marker.l -= dt; if (marker.l <= 0) marker = null; }
      if (mode === 'end' || mode === 'won') { endT -= dt; if (endT <= 0) { if (mode === 'won') { feel.win(); api.win(); } else api.over(); mode = 'gone'; } return; }
      if (mode === 'talk') { tw.update(dt); if (!tw.done && tw.ticked && (t * 30 | 0) % 2) sounds.blip(1.6); return; }
      if (mode === 'evolve') {
        evo.t += dt;
        if (evo.t > 3.2 && !evo.done) { evo.done = true; const f = evo.f; f.sp = evo.to; f.name = evo.to; f.maxHp += 8; f.hp = f.maxHp; f.atk += 3; f.def += 2; f.spd += 2; sounds.fanfare(); haptic('success'); feel.boom(W / 2, H / 2 - 10, { color: '#f8f0a0' }); addScore(2); }
        if (evo.t > 5) say([`WHAT? ${evo.from} EVOLVED INTO ${evo.to}!`], () => { evo = null; const e = party.find(q => SPECIES[q.sp].evolve && q.level >= SPECIES[q.sp].evolve[0]); if (e) { evo = { f: e, from: e.sp, to: SPECIES[e.sp].evolve[1], t: 0 }; mode = 'evolve'; } });
        return;
      }
      if (mode === 'battle') {
        if (wipe > 0 && menu === 'intro') wipe = Math.max(0, wipe - dt * 1.6);
        for (const v of vis.values()) { v.flash = Math.max(0, v.flash - dt); v.shake = Math.max(0, v.shake - dt); if (v.lunge) { v.lt = (v.lt || 0) + dt; v.dx = Math.round(Math.sin(Math.min(1, v.lt / .3) * Math.PI) * 10 * v.lunge); if (v.lt > .3) { v.lunge = 0; v.lt = 0; v.dx = 0; } } }
        for (const p of proj) p.t += dt; for (let i = proj.length - 1; i >= 0; i--) if (proj[i].t > proj[i].d) proj.splice(i, 1);
        runQueue(dt);
        return;
      }
      if (mode === 'spotted') { updateSpotted(dt); return; }
      if (mode !== 'walk') return;
      // walking
      const was = { x: hero.x, y: hero.y };
      hero.speed = K.walk;
      hero.update(dt, map, walkInput());
      const moved = Math.hypot(hero.x - was.x, hero.y - was.y);
      if (path && moved < .05 && path.pts.length) { path.stuck += dt; if (path.stuck > .4) path = null; } else if (path) path.stuck = 0;
      tryWalkInto(dt);
      cam.update(dt, hero);
      if (follower) { trail.push({ x: hero.x, y: hero.y }); if (trail.length > 14) { const p = trail.shift(); follower.x = p.x; follower.y = p.y; } }
      const tx = Math.floor(hero.x / T), ty = Math.floor(hero.y / T), z = zoneAt(ty);
      if (z !== zone) { if (zone) { banner = { txt: z.name, l: 2, zone: true }; sounds.chirp(); } zone = z; }
      for (const it of items) if (!it.got && it.tx === tx && it.ty === ty) {
        it.got = true; bag.add(it.kind); feel.coin(hero.x, hero.y - 10, { color: it.kind === 'jar' ? '#a8d8f0' : '#f05060', text: it.kind === 'jar' ? '+JAR' : '+BERRY' }); haptic('light');
      }
      quests.update(dt, hero);
      if (quests.is('pup', 'find') && Math.hypot(hero.x - (PUP.tx * T + 8), hero.y - (PUP.ty * T + 8)) < 20) {
        say(['SOMETHING GROWLS IN THE REEDS... A WILD PUDDLEFIN IS GUARDING BISCUIT!'], () => { const f = critter('PUDDLEFIN', 6); startBattle([f], 'wild'); foeWho = 'pup'; }, 'BISCUIT');
        return;
      }
      if (quests.is('seals', 'gate') && Math.hypot(hero.x - 14 * T, hero.y - 12 * T) < 28 && !gateOpen) { openGate(); return; }
      if (GRASS[MAP[ty][tx]] && moved > 0) {
        gdist += moved; if (grace > 0) grace -= moved / T;
        if (gdist >= T) { gdist -= T; if (grace <= 0 && Math.random() < K.encounter) { startBattle([pickWild(GRASS[MAP[ty][tx]])], 'wild'); return; } }
      }
      trainerSight();
    },
    draw(c) {
      if (mode === 'pick') return drawPick(c);
      if (mode === 'battle' || ((mode === 'end' || mode === 'won' || mode === 'gone') && fight)) return drawBattle(c);
      if (evo) { drawEvolve(c); if (mode === 'talk') drawTalk(c); return; }
      drawWorld(c);
      if (mode === 'talk') drawTalk(c);
    },
    down(x, y, id) {
      if (mode === 'pick') { pickTap(x, y); return; }
      if (mode === 'talk') { talkTap(); return; }
      if (mode === 'battle') { battleTap(x, y); return; }
      if (mode !== 'walk') return;
      if (y > H - 14 && x < W * .7) { cycleQuest(); return; }
      press = { x, y, t: 0, id, at: t }; stick.down(x, y, id);
    },
    move(x, y, p, id) { if (mode === 'walk') stick.move(x, y, p, id); },
    up(x, y, id) {
      if (mode !== 'walk') { stick.release(); press = null; return; }
      const wasStick = stick.active && Math.hypot(x - press?.x, y - press?.y) > 6;
      stick.up(x, y, id);
      if (press && !wasStick && t - press.at < .35) tapWorld(x, y);
      press = null;
    },
    key(k, d) {
      held[k] = d; if (!d) return;
      if (mode === 'pick') { const n = '123'.indexOf(k); if (n >= 0) choosePartner(n); return; }
      if (mode === 'talk') { if (k === ' ' || k === 'Enter') talkTap(); return; }
      if (mode === 'battle') {
        if (cur || queue.length) { if (k === ' ' || k === 'Enter') skipText(); return; }
        const n = '12345'.indexOf(k); if (n >= 0) choose(n); if (k === 'Escape' || k === 'Backspace') choose(4); return;
      }
      if (mode === 'walk' && (k === ' ' || k === 'Enter')) { const n = thingAt(Math.floor((hero.x + hero.dir.x * 12) / T), Math.floor((hero.y + hero.dir.y * 12) / T)); if (n) interact(n); }
    },
  };
  function cycleQuest() {
    const act = ['seals', 'log', 'pup'].filter(id => quests.active(id)); if (!act.length) return;
    trackI = act[(act.indexOf(trackI) + 1) % act.length]; sounds.tick();
  }
  function skipText() { if (cur && cur.txt && cur.t > .2) cur.t = cur.d; }
  function battleTap(x, y) {
    if (cur || queue.length) { skipText(); return; }
    if (menu === 'main' || menu === 'fight' || menu === 'bag' || menu === 'team') {
      for (let i = 0; i < 5; i++) if (inR(btnRect(i), x, y)) { haptic('tick'); choose(i); return; }
    }
  }

  // ---------------------------------------------------------- choosing a partner
  const STARTERS = ['FLAREPUP', 'LEAFLET', 'DRIZZLET'];
  function pickRect(i) { const s = W >= 200 ? 3 : 2, w = 16 * s; return { x: Math.round((W - 3 * w - 24) / 2 + i * (w + 12)), y: Math.round(H / 2 - w / 2 + 4), w, s }; }
  function pickTap(x, y) {
    for (let i = 0; i < 3; i++) { const r = pickRect(i); if (x >= r.x - 6 && x <= r.x + r.w + 6 && y >= r.y - 10 && y <= r.y + r.w + 18) { choosePartner(i); return; } }
  }
  function choosePartner(i) {
    const f = critter(STARTERS[i], 5); party = [f]; mode = 'walk'; haptic('success'); sounds.confirm();
    say([`${f.name} IS YOUR PARTNER! TAKE GOOD CARE OF IT.`, 'THE GROVE WARDEN HAS SEALED ELDER GROVE, FAR TO THE NORTH.', 'WIN THE SEALS OF THE THREE KEEPERS OF THE WILDS TO OPEN ITS GATE.',
      'AND FILL YOUR LOGBOOK: CATCH 3 CRITTERS AND SHOW ME. HERE ARE 3 JARS!'], () => { bag.add('jar', 3); quests.start('seals'); quests.start('log'); trackI = 'log'; }, 'KEEPER BRAM');
  }
  function drawPick(c) {
    c.fillStyle = '#5a3a28'; c.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 8) { c.fillStyle = (y >> 3) % 2 ? '#6a4630' : '#644028'; c.fillRect(0, y, W, 7); }
    c.fillStyle = '#3a2418'; for (let x = (W % 24) / 2; x < W; x += 24) c.fillRect(x, 0, 1, H);
    c.fillStyle = '#88583a'; c.fillRect(0, H - 30, W, 30); c.fillStyle = '#a06840'; c.fillRect(0, H - 30, W, 2);
    text(c, 'KEEPER BRAM\'S LODGE', W / 2, Math.max(14, api.scoreArea().bottom + 4), { color: '#f8e0a0', align: 'center', font: 'big', outline: '#2a1810' });
    text(c, 'CHOOSE YOUR PARTNER', W / 2, H / 2 - 40, { color: '#ffffff', align: 'center', outline: '#2a1810' });
    STARTERS.forEach((id, i) => {
      const r = pickRect(i), bob = Math.round(Math.sin(t * 4 + i * 2) * 1.5), tc = TCOL[SPECIES[id].type];
      c.fillStyle = '#00000040'; c.beginPath(); c.ellipse(r.x + r.w / 2, r.y + r.w + 2, r.w * .45, 4, 0, 0, 7); c.fill();
      c.fillStyle = mix(tc, '#000000', .3); c.fillRect(r.x - 4, r.y + r.w - 2, r.w + 8, 6); c.fillStyle = tc; c.fillRect(r.x - 4, r.y + r.w - 2, r.w + 8, 2);
      SPR[id].draw(c, r.x, r.y + bob - 4, { scale: r.s });
      text(c, id, r.x + r.w / 2, r.y + r.w + 8, { color: '#ffffff', align: 'center', outline: '#2a1810' });
      text(c, SPECIES[id].type, r.x + r.w / 2, r.y + r.w + 16, { color: tc, align: 'center', outline: '#2a1810' });
    });
    if ((t * 2 | 0) % 2) text(c, 'TAP ONE', W / 2, H - 12, { color: '#f8e0a0', align: 'center' });
  }

  // ---------------------------------------------------------- drawing the world
  function drawWorld(c) {
    const v = cam.view;
    c.fillStyle = '#183018'; c.fillRect(0, 0, W, H);
    cam.begin(c); feel.begin(c);
    c.drawImage(base, 0, 0);
    const x0 = Math.max(0, Math.floor(v.x / T) - 1), x1 = Math.min(COLS - 1, Math.ceil((v.x + v.w) / T) + 1), y0 = Math.max(0, Math.floor(v.y / T) - 1), y1 = Math.min(ROWS - 1, Math.ceil((v.y + v.h) / T) + 2);
    // moving tiles
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const ch = MAP[ty][tx], X = tx * T, Y = ty * T;
      if (ch === '~') { const s = ((t * 6 + tx * 3 + ty * 5) | 0) % 16; c.fillStyle = '#a8d8f8'; if ((tx + ty) % 3 === 0) c.fillRect(X + s % 12, Y + 5 + (s >> 3) * 5, 4, 1); if ((tx * 7 + ty) % 5 === 0) c.fillRect(X + (15 - s) % 12, Y + 11, 3, 1); }
      if (ch === 'L') { const L = (dx, dy) => MAP[ty + dy]?.[tx + dx] === 'L', g = (Math.sin(t * 3 + tx + ty * 2) + 1) / 2; c.fillStyle = '#f07828'; c.fillRect(X + (L(-1, 0) ? 0 : 2), Y + (L(0, -1) ? 0 : 2), T - (L(-1, 0) ? 0 : 2) - (L(1, 0) ? 0 : 2), T - (L(0, -1) ? 0 : 2) - (L(0, 1) ? 0 : 2)); c.fillStyle = '#f8a838'; c.fillRect(X + ((t * 3 + tx * 5) % 12 | 0), Y + 4 + (ty * 3 % 7), 4, 1); c.fillRect(X + ((t * 2 + ty * 7) % 12 | 0), Y + 10, 3, 1); if (g > .75) { c.fillStyle = '#f8e070'; c.fillRect(X + 4 + (tx * 3 % 7), Y + 5 + (ty * 5 % 6), 2, 2); } }
      if (GRASS[ch]) drawGrass(c, ch, X, Y, tx, ty, false);
    }
    if (marker) { c.strokeStyle = '#ffffff'; c.globalAlpha = marker.l / .6; c.strokeRect(marker.x - 5, marker.y - 3, 10, 6); c.globalAlpha = 1; }
    // things that stand up, back to front
    const list = [];
    for (let ty = y0; ty <= y1 + 1 && ty < ROWS; ty++) for (let tx = x0; tx <= x1; tx++) {
      const ch = MAP[ty][tx];
      if (ch === 'T' || ch === 'P' || ch === 'D' || ch === 'r' || ch === 'f') list.push({ y: ty * T + 15, ch, tx, ty });
    }
    for (const [i, h] of HOUSES.entries()) list.push({ y: (h.ty + 3) * T, house: i });
    list.push({ y: WELL.ty * T + 15, well: true });
    for (const n of npcs) if (!(n.boss && quests.ended('seals'))) list.push({ y: n.y + 7, npc: n });
    for (const it of items) if (!it.got) list.push({ y: it.ty * T + 8, item: it });
    if (!gateOpen) list.push({ y: 11 * T + 15, gate: true });
    if (quests.is('pup', 'find')) list.push({ y: PUP.ty * T + 8, pupHide: true });
    if (follower) list.push({ y: follower.y + 3, follow: true });
    list.push({ y: hero.y + 4, hero: true });
    list.sort((a, b) => a.y - b.y);
    for (const o of list) {
      if (o.ch) drawScenery(c, o);
      else if (o.house != null) { const h = HOUSES[o.house]; c.drawImage(houseArt[o.house], h.tx * T, h.ty * T - 10); }
      else if (o.well) drawWell(c, WELL.tx * T, WELL.ty * T);
      else if (o.npc) drawNpc(c, o.npc);
      else if (o.item) { const s = o.item.kind === 'berry' ? SCEN.berry : SCEN.jar, bob = Math.round(Math.sin(t * 3 + o.item.tx) * 1); s.draw(c, o.item.tx * T + (o.item.kind === 'berry' ? 3 : 2), o.item.ty * T + 6 + bob); if ((t * 2 + o.item.tx | 0) % 3 === 0) { c.fillStyle = '#ffffff'; c.fillRect(o.item.tx * T + 12, o.item.ty * T + 4, 1, 1); } }
      else if (o.gate) drawGate(c);
      else if (o.pupHide) { if ((t * 1.5 | 0) % 3 === 0) { c.fillStyle = '#f8c030'; c.fillRect(PUP.tx * T + 6, PUP.ty * T + 2 + ((t * 8 | 0) % 2), 3, 3); c.fillStyle = '#f06830'; c.fillRect(PUP.tx * T + 7, PUP.ty * T, 1, 2); } }
      else if (o.follow) SPR.FLAREPUP.draw(c, Math.round(follower.x - 8), Math.round(follower.y - 13), { flip: hero.x < follower.x });
      else if (o.hero) drawHero(c);
    }
    // grass in front of feet
    const htx = Math.floor(hero.x / T), hty = Math.floor(hero.y / T);
    if (GRASS[MAP[hty][htx]]) drawGrass(c, MAP[hty][htx], htx * T, hty * T, htx, hty, true);
    drawAmbient(c, v);
    feel.end(c, W, H); cam.end(c);
    if (zone?.id === 'grove') drawDark(c);
    drawHud(c);
  }
  const TUFTS = [[1, 1], [9, 0], [5, 6], [0, 9], [10, 9]];
  function drawGrass(c, ch, X, Y, tx, ty, front) {
    const sway = Math.round(Math.sin(t * 2.4 + tx * .7 + ty * .3) * .8), near = Math.abs(hero.x - (X + 8)) < 10 && Math.abs(hero.y - (Y + 8)) < 10 && hero.state === 'walk';
    const pal = { ',': ['#2c8a30', '#58b840', '#9ce070', '#1c6824'], v: ['#4a8a40', '#78b050', '#b0d878', '#36602c'], ';': ['#6a4040', '#9a5a48', '#f09050', '#4a2c2c'], '*': ['#246a40', '#3c9058', '#7cc888', '#164a2c'] }[ch];
    for (let i = 0; i < TUFTS.length; i++) {
      const [ox, oy] = TUFTS[(i + tx + ty * 2) % TUFTS.length], gy = Y + oy + 4;
      if (front ? gy < Y + 8 : gy >= Y + 12) continue;
      const gx = X + ox, jig = near ? ((t * 20 + i | 0) % 2) : 0, sw = sway + jig;
      c.fillStyle = pal[3]; c.fillRect(gx, gy + 2, 6, 2);
      c.fillStyle = pal[0]; c.fillRect(gx, gy, 1, 3); c.fillRect(gx + 1, gy - 1, 1, 4); c.fillRect(gx + 2 + sw, gy - 3, 1, 5); c.fillRect(gx + 3 + sw, gy - 2, 1, 4); c.fillRect(gx + 4, gy - 1, 1, 3); c.fillRect(gx + 5, gy, 1, 2);
      c.fillStyle = pal[1]; c.fillRect(gx + 1, gy - 1, 1, 2); c.fillRect(gx + 3 + sw, gy - 2, 1, 2); c.fillRect(gx + 5, gy, 1, 1);
      c.fillStyle = pal[2]; c.fillRect(gx + 2 + sw, gy - 3, 1, 1);
      if (ch === 'v' && i % 2 === 0) { c.fillStyle = '#6a5030'; c.fillRect(gx + 2 + sw, gy - 6, 1, 3); c.fillStyle = '#8a4a20'; c.fillRect(gx + 2 + sw, gy - 8, 2, 3); }
      if (ch === '*' && i % 3 === 0) { c.fillStyle = '#c8e8a0'; c.fillRect(gx + 5, gy - 2, 1, 1); }
    }
  }
  function drawScenery(c, o) {
    const X = o.tx * T, Y = o.ty * T;
    if (o.ch === 'T') SCEN.tree.draw(c, X, Y - 4);
    else if (o.ch === 'P') SCEN.pine.draw(c, X, Y - 3);
    else if (o.ch === 'D') SCEN.dead.draw(c, X, Y - 2);
    else if (o.ch === 'r') SCEN.rock.draw(c, X, Y + 2);
    else if (o.ch === 'f') {
      c.fillStyle = '#5a3818'; c.fillRect(X + 1, Y + 4, 3, 11); c.fillRect(X + 12, Y + 4, 3, 11);
      c.fillStyle = '#c89050'; c.fillRect(X + 2, Y + 4, 1, 10); c.fillRect(X + 13, Y + 4, 1, 10);
      const l = MAP[o.ty][o.tx - 1] === 'f', r = MAP[o.ty][o.tx + 1] === 'f';
      c.fillStyle = '#a87038'; c.fillRect(l ? X : X + 2, Y + 6, (r ? T : 13) - (l ? 0 : 2), 2); c.fillRect(l ? X : X + 2, Y + 11, (r ? T : 13) - (l ? 0 : 2), 2);
    }
  }
  function drawWell(c, X, Y) {
    c.fillStyle = '#383040'; c.fillRect(X + 1, Y + 4, 14, 12); c.fillStyle = '#9890a0'; c.fillRect(X + 2, Y + 5, 12, 10); c.fillStyle = '#686070'; for (let i = 0; i < 3; i++) c.fillRect(X + 2, Y + 7 + i * 3, 12, 1);
    c.fillStyle = '#3070c0'; c.fillRect(X + 4, Y + 5, 8, 3); c.fillStyle = '#88c8f8'; c.fillRect(X + 5 + ((t * 2 | 0) % 4), Y + 6, 2, 1);
    c.fillStyle = '#5a3818'; c.fillRect(X + 1, Y - 6, 2, 11); c.fillRect(X + 13, Y - 6, 2, 11); c.fillStyle = '#c84838'; c.fillRect(X - 1, Y - 9, 18, 4); c.fillStyle = '#e86858'; c.fillRect(X, Y - 9, 16, 1);
  }
  function drawGate(c) {
    const X = 13 * T, Y = 11 * T, seals = quests.progress('seals').n || 0, ready = quests.stage('seals') !== 'win';
    for (const px of [X - 4, X + 2 * T - 4]) { c.fillStyle = '#383040'; c.fillRect(px, Y - 10, 8, 26); c.fillStyle = '#8880a0'; c.fillRect(px + 1, Y - 9, 6, 24); c.fillStyle = '#a8a0c0'; c.fillRect(px + 1, Y - 9, 6, 2); }
    c.fillStyle = '#4a3020'; c.fillRect(X + 4, Y, 2 * T - 8, 14); c.fillStyle = '#7a5030'; for (let x = X + 5; x < X + 2 * T - 5; x += 4) c.fillRect(x, Y + 1, 3, 12);
    for (let i = 0; i < 3; i++) { const on = i < seals || ready; c.fillStyle = '#201828'; c.fillRect(X + 9 + i * 6, Y + 4, 4, 4); c.fillStyle = on ? ['#58c040', '#3898f0', '#f06830'][i] : '#504858'; c.fillRect(X + 10 + i * 6, Y + 5, 2, 2); }
    if (ready && (t * 3 | 0) % 2) { c.fillStyle = '#f8e070'; c.fillRect(X + 4, Y - 1, 2 * T - 8, 1); }
  }
  function drawNpc(c, n) {
    if (n.boss) {
      const s = 2, bob = Math.round(Math.sin(t * 1.5) * 1);
      c.fillStyle = '#00000050'; c.beginPath(); c.ellipse(n.x, n.y + 6, 14, 4, 0, 0, 7); c.fill();
      SPR.ELDERBARK.draw(c, n.x - 16, n.y - 26 + bob, { scale: s });
      if (quests.is('seals', 'warden') && (t * 2 | 0) % 2) text(c, '!', n.x, n.y - 36, { color: '#f8e070', align: 'center', font: 'big', outline: '#201828' });
      return;
    }
    if (n.sign) { SCEN.sign.draw(c, n.tx * T, n.ty * T + 2); return; }
    const dir = n.dir === 'left' || n.dir === 'right' ? 'side' : n.dir, moving = n.walk && n.walk.t > .7, fr = moving ? (t * 8 | 0) % 2 : 0;
    c.fillStyle = '#00000038'; c.fillRect(Math.round(n.x) - 5, Math.round(n.y) + 5, 10, 3);
    FOLKSPR[n.id][dir][fr].draw(c, Math.round(n.x) - 6, Math.round(n.y) - 10, { flip: n.dir === 'left' });
    if (n.walk && n.walk.t < .7) { text(c, '!', Math.round(n.x), Math.round(n.y) - 22 - (n.walk.t < .15 ? 3 : 0), { color: '#f04040', align: 'center', font: 'big', outline: '#ffffff' }); }
    else if (n.team && !n.beaten) { c.fillStyle = '#f04040'; c.fillRect(Math.round(n.x) - 1, Math.round(n.y) - 15, 2, 2); }
    else if ((n.id === 'mira' && (quests.is('pup', 'home') || (!quests.stage('pup') && !quests.ended('pup')))) || (n.id === 'bram' && quests.is('log', 'back'))) {
      const b = Math.round(Math.sin(t * 5) * 1); c.fillStyle = '#201828'; c.fillRect(Math.round(n.x) - 3, Math.round(n.y) - 21 + b, 7, 8); c.fillStyle = '#f8e070'; c.fillRect(Math.round(n.x) - 2, Math.round(n.y) - 20 + b, 5, 6);
      c.fillStyle = '#201828'; c.fillRect(Math.round(n.x), Math.round(n.y) - 19 + b, 1, 3); c.fillRect(Math.round(n.x), Math.round(n.y) - 15 + b, 1, 1);
    }
  }
  function drawHero(c) {
    const d = hero.dir, dir = Math.abs(d.x) > Math.abs(d.y) ? 'side' : d.y < 0 ? 'up' : 'down', fr = hero.state === 'walk' ? (t * 7 | 0) % 2 : 0;
    c.fillStyle = '#00000040'; c.fillRect(Math.round(hero.x) - 5, Math.round(hero.y) + 2, 10, 3);
    FOLKSPR.hero[dir][fr].draw(c, Math.round(hero.x) - 6, Math.round(hero.y) - 12 - (fr && dir !== 'side' ? 1 : 0), { flip: dir === 'side' && d.x < 0 });
  }
  function drawAmbient(c, v) {
    const z = zone?.id;
    for (const m of motes) {
      const px = v.x + ((m.x + t * (z === 'ridge' ? 8 : 4) * (m.s + .3)) % W + W) % W, py = v.y + ((m.y + (z === 'ridge' ? -t * 10 : z === 'meadow' ? t * 6 : 0) * (m.s + .4)) % H + H) % H;
      if (z === 'grove') { const on = Math.sin(t * 2 + m.i) > .2; if (on) { c.fillStyle = '#e8f870'; c.fillRect(Math.round(px), Math.round(py + Math.sin(t + m.i) * 4), 1, 1); } }
      else if (z === 'ridge') { c.fillStyle = m.i % 3 ? '#a09090' : '#f88838'; c.fillRect(Math.round(px), Math.round(py), 1, 1); }
      else if (z === 'meadow' && m.i < 8) { const fl = (t * 6 + m.i | 0) % 2; c.fillStyle = ['#f8f8f8', '#f8e040', '#f8a0c8'][m.i % 3]; c.fillRect(Math.round(px), Math.round(py + Math.sin(t * 2 + m.i) * 6), fl ? 3 : 1, 2); }
      else if (z === 'lake' && m.i < 10) { const tx = Math.floor(px / T), ty = Math.floor(py / T); if (MAP[ty]?.[tx] === '~' && Math.sin(t * 4 + m.i * 3) > .85) { c.fillStyle = '#ffffff'; c.fillRect(Math.round(px), Math.round(py), 2, 1); } }
      else if (z === 'village' && m.i < 4) { c.fillStyle = '#ffffff'; const fl = (t * 6 + m.i | 0) % 2; c.fillRect(Math.round(px), Math.round(py + Math.sin(t * 2 + m.i) * 5), fl ? 3 : 1, 2); }
    }
  }
  function drawDark(c) {
    const s = cam.toScreen(hero.x, hero.y), g = c.createRadialGradient(s.x, s.y, 20, s.x, s.y, Math.max(W, H) * .75);
    g.addColorStop(0, 'rgba(10,20,40,0)'); g.addColorStop(1, 'rgba(10,20,40,0.55)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  function drawHud(c) {
    const sa = api.scoreArea();
    // the team, top left
    party.forEach((f, i) => {
      const x = 3 + i * 18, y = 3, fr = f.hp / f.maxHp;
      c.fillStyle = '#201828'; c.fillRect(x, y, 16, 7); c.fillStyle = f.alive ? TCOL[f.sp && SPECIES[f.sp].type] : '#504858'; c.fillRect(x + 1, y + 1, 14, 2);
      c.fillStyle = '#504858'; c.fillRect(x + 1, y + 4, 14, 2); c.fillStyle = fr > .5 ? '#58d048' : fr > .2 ? '#f0c030' : '#e04040'; c.fillRect(x + 1, y + 4, Math.round(14 * fr), 2);
    });
    // bag, top right
    let x = W - 3;
    for (const [id, col] of [['berry', '#f05060'], ['jar', '#a8d8f0'], ['gold', '#f8d040']]) {
      const n = bag.count(id); if (id === 'gold' && !n) continue;
      const w = text(c, String(n), x, 3, { color: '#ffffff', align: 'right', outline: '#201828' }); x -= w + 2;
      c.fillStyle = '#201828'; c.fillRect(x - 6, 2, 7, 7); c.fillStyle = col; c.fillRect(x - 5, 3, 5, 5); c.fillStyle = '#ffffff'; c.fillRect(x - 4, 4, 1, 1); x -= 10;
    }
    // the quest being followed, bottom, and an arrow to it
    const id = quests.active(trackI) ? trackI : ['seals', 'log', 'pup'].find(q => quests.active(q));
    if (id) {
      const st = quests.table[id].stages[quests.stage(id)], pr = quests.progress(id), txt = st.text + (st.count ? ` ${pr.n}/${pr.of}` : '');
      c.fillStyle = '#201828d0'; c.fillRect(0, H - 12, W, 12); c.fillStyle = '#f8d040'; c.fillRect(2, H - 9, 5, 5); c.fillStyle = '#201828'; c.fillRect(4, H - 8, 1, 3);
      text(c, txt, 10, H - 9, { color: '#ffffff' });
      const m = quests.markers.find(q => q.quest === id);
      if (m) {
        const s = cam.toScreen(m.at.x, m.at.y), dx = s.x - W / 2, dy = s.y - H / 2, inside = s.x > 8 && s.x < W - 8 && s.y > 14 && s.y < H - 18;
        if (inside) { const b = Math.round(Math.sin(t * 6) * 2); c.fillStyle = '#f8d040'; c.fillRect(Math.round(s.x) - 2, Math.round(s.y) - 24 + b, 5, 3); c.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 21 + b, 3, 2); c.fillRect(Math.round(s.x), Math.round(s.y) - 19 + b, 1, 1); }
        else {
          const a = Math.atan2(dy, dx), r = Math.min((W / 2 - 10) / Math.abs(Math.cos(a) || 1e-3), (H / 2 - 22) / Math.abs(Math.sin(a) || 1e-3)), ax = Math.round(W / 2 + Math.cos(a) * r), ay = Math.round(H / 2 + Math.sin(a) * r);
          c.save(); c.translate(ax, ay); c.rotate(a); c.fillStyle = '#201828'; c.beginPath(); c.moveTo(6, 0); c.lineTo(-4, -5); c.lineTo(-4, 5); c.fill(); c.fillStyle = '#f8d040'; c.beginPath(); c.moveTo(4, 0); c.lineTo(-3, -3); c.lineTo(-3, 3); c.fill(); c.restore();
        }
      }
    }
    if (banner) {
      const y = banner.zone ? Math.max(sa.bottom + 4, 14) : H / 2 - 30, a = Math.min(1, banner.l * 3);
      c.globalAlpha = a; c.fillStyle = '#201828e0'; c.fillRect(0, y - 3, W, 12); c.fillStyle = banner.quest ? '#f8d040' : '#ffffff'; c.fillRect(0, y - 3, W, 1); c.fillRect(0, y + 8, W, 1);
      text(c, banner.txt, W / 2, y, { color: banner.quest ? '#f8d040' : '#ffffff', align: 'center' }); c.globalAlpha = 1;
    }
    if (party.length === 1 && t < 40 && !path && hero.state === 'idle' && mode === 'walk' && quests.active('log') && (quests.progress('log').n || 0) === 0) text(c, 'DRAG TO WALK, TAP TO GO OR TALK', W / 2, H - 22, { color: '#ffffff', align: 'center', outline: '#201828' });
    if (stick.active && stick.mag > .15) stick.draw(c, { pixel: true });
  }
  function drawTalk(c) {
    const h = 40, y = H - h - 2, q = talkQ[0];
    c.fillStyle = '#201828'; c.fillRect(2, y, W - 4, h); c.fillStyle = '#f8f4e8'; c.fillRect(3, y + 1, W - 6, h - 2); c.fillStyle = '#d8d0c0'; c.fillRect(3, y + h - 3, W - 6, 2);
    if (q?.who) { const w = measure(q.who).w + 8; c.fillStyle = '#201828'; c.fillRect(6, y - 9, w, 10); c.fillStyle = '#3868d8'; c.fillRect(7, y - 8, w - 2, 8); text(c, q.who, 10, y - 7, { color: '#ffffff' }); }
    wrap(c, tw.shown, 8, y + 6, W - 16, '#201828');
    if (tw.done && (t * 3 | 0) % 2) { c.fillStyle = '#e04040'; c.fillRect(W - 12, y + h - 9, 5, 2); c.fillRect(W - 11, y + h - 7, 3, 1); c.fillRect(W - 10, y + h - 6, 1, 1); }
  }
  function wrap(c, s, x, y, w, color, lh = 8) {
    const max = Math.floor(w / 4); let line = '', ly = y;
    for (const word of s.split(' ')) { if ((line + word).length > max) { text(c, line.trim(), x, ly, { color }); line = ''; ly += lh; } line += word + ' '; }
    text(c, line.trim(), x, ly, { color });
  }

  // ---------------------------------------------------------- drawing a battle
  function drawBack(c, L) {
    const z = foeKind === 'boss' ? 'grove' : zone?.id || 'meadow', gy = L.menuY;
    const sky = { meadow: ['#78c0f8', '#a8e0f8'], village: ['#78c0f8', '#a8e0f8'], lake: ['#88c8f8', '#c8e8f8'], ridge: ['#a85848', '#f0a060'], grove: ['#183848', '#2c5848'] }[z];
    for (let y = 0; y < gy; y += 2) { c.fillStyle = y < gy * .45 ? (y % 6 < 2 && y > gy * .3 ? sky[1] : sky[0]) : sky[1]; c.fillRect(0, y, W, 2); }
    const hz = Math.round(gy * .5);
    if (z === 'meadow' || z === 'village') {
      c.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) { const cx = ((i * 80 + t * 4) % (W + 40)) - 20; c.fillRect(cx, 12 + i * 9, 22, 4); c.fillRect(cx + 4, 9 + i * 9, 12, 3); }
      c.fillStyle = '#58a858'; for (let x = 0; x < W; x += 2) c.fillRect(x, hz - Math.round(Math.sin(x * .04) * 6 + 6), 2, 20);
      c.fillStyle = '#78c058'; c.fillRect(0, hz + 8, W, gy - hz - 8);
    } else if (z === 'lake') {
      c.fillStyle = '#5a9858'; for (let x = 0; x < W; x += 2) c.fillRect(x, hz - Math.round(Math.abs(Math.sin(x * .07)) * 8), 2, 12);
      c.fillStyle = '#4890d8'; c.fillRect(0, hz + 4, W, gy - hz - 4); c.fillStyle = '#a8d8f8'; for (let i = 0; i < 8; i++) c.fillRect(((i * 37 + t * 10) % W) | 0, hz + 8 + (i * 13) % (gy - hz - 14), 6, 1);
    } else if (z === 'ridge') {
      c.fillStyle = '#5a3838'; for (let x = 0; x < W; x += 2) c.fillRect(x, hz - Math.round(Math.abs(Math.sin(x * .05)) * 18 + Math.sin(x * .13) * 3), 2, 30);
      c.fillStyle = '#f87828'; c.fillRect(W * .2 | 0, hz - 18, 3, 6); c.fillStyle = '#7a6a68'; c.fillRect(0, hz + 6, W, gy - hz - 6);
      c.fillStyle = '#f8a038'; for (let i = 0; i < 10; i++) { const px = (i * 41 + t * 6) % W, py = (hz + 30 - ((t * 14 + i * 23) % 60)); c.fillRect(px | 0, py | 0, 1, 1); }
    } else {
      c.fillStyle = '#0c2820'; for (let x = 0; x < W; x += 8) { const hgt = 24 + ((x * 7) % 13); c.fillRect(x, hz - hgt, 8, hgt + 10); c.fillRect(x + 3, hz - hgt - 6, 2, 6); }
      c.fillStyle = '#2f5a38'; c.fillRect(0, hz + 6, W, gy - hz - 6);
      c.fillStyle = '#e8f870'; for (let i = 0; i < 12; i++) if (Math.sin(t * 2 + i) > 0) c.fillRect((i * 29) % W, hz - 20 + (i * 17) % 50, 1, 1);
      c.globalAlpha = .12; c.fillStyle = '#f8f8c0'; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(30 + i * 60, 0); c.lineTo(50 + i * 60, 0); c.lineTo(80 + i * 60, gy); c.lineTo(50 + i * 60, gy); c.fill(); } c.globalAlpha = 1;
    }
    const pad = { meadow: '#a0d878', village: '#a0d878', lake: '#d8c890', ridge: '#988884', grove: '#4a7a50' }[z];
    c.fillStyle = mix(pad, '#000000', .25); c.beginPath(); c.ellipse(L.foeX + L.S / 2, L.foeY + L.S - 2, L.S * .7, 7, 0, 0, 7); c.fill(); c.fillStyle = pad; c.beginPath(); c.ellipse(L.foeX + L.S / 2, L.foeY + L.S - 3, L.S * .66, 5, 0, 0, 7); c.fill();
    c.fillStyle = mix(pad, '#000000', .25); c.beginPath(); c.ellipse(L.meX + L.S / 2, L.meY + L.S, L.S * .8, 8, 0, 0, 7); c.fill(); c.fillStyle = pad; c.beginPath(); c.ellipse(L.meX + L.S / 2, L.meY + L.S - 1, L.S * .76, 6, 0, 0, 7); c.fill();
  }
  function drawFighter(c, f, L) {
    const v = vis.get(f), mine = side(f) === 0, boss = f.sp === 'ELDERBARK', sk = L.sk, S = 16 * sk;
    if (v.scale <= 0 || v.sink >= 1) return;
    const sx = v.shake > 0 ? Math.round(Math.sin(t * 90) * 2) : 0, bob = f.alive && !f.has('sleep') ? Math.round(Math.sin(t * 3 + (mine ? 0 : 1.5)) * 1) : 0;
    const x = (mine ? L.meX : L.foeX) + v.dx + sx, y = (mine ? L.meY : L.foeY) + bob + Math.round(v.sink * S);
    if (boss && f.alive) { const p = (Math.sin(t * 3) + 1) / 2; c.globalAlpha = .25 + p * .2; c.fillStyle = '#a8f070'; c.beginPath(); c.ellipse(x + S / 2, y + S / 2, S * .62 + p * 3, S * .56 + p * 3, 0, 0, 7); c.fill(); c.globalAlpha = 1; }
    c.save();
    if (v.sink > 0) { c.beginPath(); c.rect(x - 4, 0, S + 8, (mine ? L.meY : L.foeY) + L.S); c.clip(); c.globalAlpha = 1 - v.sink; }
    if (v.scale < 1) { const s = v.scale; c.translate(x + S / 2, y + S / 2); c.scale(s, s); c.translate(-(x + S / 2), -(y + S / 2)); c.globalAlpha = .4 + s * .6; }
    const flash = v.flash > 0 && ((v.flash * 20) | 0) % 2;
    (flash ? SIL : SPR)[f.sp].draw(c, x, y, { scale: sk, flip: mine });
    c.restore();
    if (f.has('sleep') && (t * 2 | 0) % 2) text(c, 'Z', x + S - 4, y - 2, { color: '#ffffff', outline: '#201828' });
  }
  function drawPlate(c, f, r, nums) {
    const h = nums ? 26 : 20, hp = shownHp.get(f) ?? f.hp, fr = clamp(hp / f.maxHp, 0, 1);
    c.fillStyle = '#201828'; c.fillRect(r.x, r.y, r.w, h); c.fillStyle = '#f8f4e8'; c.fillRect(r.x + 1, r.y + 1, r.w - 2, h - 2); c.fillStyle = TCOL[SPECIES[f.sp].type]; c.fillRect(r.x + 1, r.y + 1, 2, h - 2);
    text(c, f.name, r.x + 5, r.y + 3, { color: '#201828' }); text(c, `L${f.level}`, r.x + r.w - 3, r.y + 3, { color: '#201828', align: 'right' });
    let sx = r.x + 5; for (const [k, lab, col] of [['burn', 'BRN', '#f06020'], ['poison', 'PSN', '#a048c8'], ['sleep', 'SLP', '#8888c8'], ['stun', 'STN', '#c8a020']]) if (f.has(k)) { c.fillStyle = col; c.fillRect(sx, r.y + 9, 13, 6); text(c, lab, sx + 1, r.y + 10, { color: '#ffffff' }); sx += 15; }
    const bx = sx === r.x + 5 ? r.x + 5 : sx, bw = r.x + r.w - 4 - bx;
    c.fillStyle = '#201828'; c.fillRect(bx, r.y + 10, bw, 5); c.fillStyle = '#585868'; c.fillRect(bx + 1, r.y + 11, bw - 2, 3);
    c.fillStyle = fr > .5 ? '#48c840' : fr > .2 ? '#f0c030' : '#e04040'; c.fillRect(bx + 1, r.y + 11, Math.round((bw - 2) * fr), 3);
    if (nums) {
      text(c, `${Math.round(hp)}/${f.maxHp}`, r.x + r.w - 3, r.y + 17, { color: '#201828', align: 'right' });
      const a = xpFor(f.level, CURVE), b = xpFor(f.level + 1, CURVE), xf = clamp((f.xp - a) / (b - a), 0, 1);
      c.fillStyle = '#c8c0d0'; c.fillRect(r.x + 5, r.y + 22, r.w - 40, 2); c.fillStyle = '#3898f0'; c.fillRect(r.x + 5, r.y + 22, Math.round((r.w - 40) * xf), 2);
    }
  }
  function drawProj(c, p) {
    const a = spot(p.from), b = spot(p.to), k = Math.min(1, p.t / p.d), e = k * k * (3 - 2 * k), x = a.x + (b.x - a.x) * e + (p.miss ? 20 * k : 0), y = a.y + (b.y - a.y) * e - Math.sin(k * Math.PI) * (p.fx === 'rock' || p.fx === 'jar' ? 26 : 8);
    const X = Math.round(x), Y = Math.round(y);
    if (p.fx === 'fire') { for (let i = 5; i >= 0; i--) { const q = Math.max(0, k - i * .05), qx = a.x + (b.x - a.x) * q, qy = a.y + (b.y - a.y) * q - Math.sin(q * Math.PI) * 10, r = 6 - i, fl = (t * 30 + i | 0) % 2; c.fillStyle = ['#fff8c0', '#f8e060', '#f8c030', '#f89028', '#e05820', '#a03018'][i]; c.fillRect(Math.round(qx) - r, Math.round(qy) - r - fl, r * 2, r * 2); } }
    else if (p.fx === 'leaf') { for (let i = 0; i < 4; i++) { const q = Math.max(0, k - i * .07), lx = Math.round(a.x + (b.x - a.x) * q + Math.sin(t * 18 + i * 2) * 5), ly = Math.round(a.y + (b.y - a.y) * q - 6 + i * 4); c.fillStyle = '#185820'; c.fillRect(lx - 4, ly - 2, 8, 4); c.fillStyle = i % 2 ? '#98e868' : '#48b040'; c.fillRect(lx - 3, ly - 1, 6, 2); c.fillRect(lx - 1, ly - 3, 3, 6); c.fillStyle = '#d8f8a0'; c.fillRect(lx - 2, ly - 1, 2, 1); } }
    else if (p.fx === 'water') { for (let i = 0; i < 7; i++) { const q = Math.max(0, k - i * .045), qx = a.x + (b.x - a.x) * q, qy = a.y + (b.y - a.y) * q + Math.sin(i + t * 30) * 2, r = Math.max(1, 4 - (i >> 1)); c.fillStyle = '#2858a8'; c.fillRect(Math.round(qx) - r - 1, Math.round(qy) - r - 1, r * 2 + 2, r * 2 + 2); c.fillStyle = i ? '#78c8f8' : '#ffffff'; c.fillRect(Math.round(qx) - r, Math.round(qy) - r, r * 2, r * 2); c.fillStyle = '#ffffff'; c.fillRect(Math.round(qx) - r + 1, Math.round(qy) - r + 1, 1, 1); } }
    else if (p.fx === 'rock') { c.fillStyle = '#403830'; c.fillRect(X - 7, Y - 6, 14, 12); c.fillRect(X - 6, Y - 7, 12, 14); c.fillStyle = '#a89888'; c.fillRect(X - 6, Y - 5, 12, 10); c.fillRect(X - 5, Y - 6, 10, 12); c.fillStyle = '#d0c8b8'; c.fillRect(X - 5, Y - 5, 5, 3); c.fillStyle = '#786858'; c.fillRect(X + 1, Y + 2, 4, 2); }
    else if (p.fx === 'spore') { for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#f0e8a0' : '#c8b8f0'; c.fillRect(X + Math.round(Math.sin(t * 9 + i) * 6), Y + Math.round(Math.cos(t * 7 + i * 2) * 5), 2, 2); } }
    else if (p.fx === 'jar') { jarKind = p.kind; (p.kind === 'gold' ? SCEN.gold : SCEN.jar).draw(c, X - 12, Y - 8, { scale: 2 }); }
    else if (p.fx === 'down') { c.strokeStyle = '#ffffff'; c.globalAlpha = 1 - k; for (let r = 4; r < 20; r += 6) { c.beginPath(); c.arc(a.x + 10, a.y - 4, r * k + 2, -.6, .6); c.stroke(); } c.globalAlpha = 1; }
  }
  function drawJar(c, L) {
    const s = cur, f = them(), p = spot(f);
    if (!fight || !(s && (s.jarIn || s.wobble != null || s.caught || s.breakFree)) && !(vis.get(f).scale === 0)) return;
    const w = s?.wobble != null ? Math.round(Math.sin(s.t * 18) * 3 * (1 - s.t / s.d)) : 0;
    c.save(); c.translate(Math.round(p.x), Math.round(L.foeY + L.S - 8)); c.rotate(w * .12);
    (jarKind === 'gold' ? SCEN.gold : SCEN.jar).draw(c, -12, -16, { scale: 2 });
    c.restore();
    if (s?.caught) { for (let i = 0; i < 3; i++) { c.fillStyle = '#f8e070'; c.fillRect(Math.round(p.x - 12 + i * 12), Math.round(L.foeY + L.S - 22 - (s.t * 20 % 8)), 2, 2); } }
  }
  function drawBattle(c) {
    const L = layout();
    drawBack(c, L);
    feel.begin(c);
    const mine = me(), foe = them();
    drawFighter(c, foe, L); drawFighter(c, mine, L);
    drawJar(c, L);
    for (const p of proj) drawProj(c, p);
    feel.end(c, W, H);
    drawPlate(c, foe, L.plate1, false); drawPlate(c, mine, L.plate2, true);
    if (foeKind !== 'wild') { const n = foes.length; for (let i = 0; i < n; i++) { c.fillStyle = '#201828'; c.fillRect(L.plate1.x + 4 + i * 7, L.plate1.y + 21, 6, 6); c.fillStyle = foes[i].alive ? '#f04040' : '#706878'; c.fillRect(L.plate1.x + 5 + i * 7, L.plate1.y + 22, 4, 4); } }
    // the box at the bottom
    c.fillStyle = '#201828'; c.fillRect(0, L.menuY, W, MENU_H); c.fillStyle = '#f8f4e8'; c.fillRect(2, L.menuY + 2, W - 4, MENU_H - 4);
    const s = cur && cur.txt ? cur : cur || queue.length ? lastTxt : null;
    if (s) {
      const shown = s === cur ? s.txt.slice(0, Math.ceil(s.t * K.textSpeed * 1.4)) : s.txt;
      wrap(c, shown, 8, L.menuY + 8, W - 16, s.big ? '#c83020' : '#201828', 9);
      if (s === cur && s.t > .25 && (t * 3 | 0) % 2) { c.fillStyle = '#e04040'; c.fillRect(W - 12, H - 9, 5, 2); c.fillRect(W - 11, H - 7, 3, 1); }
    } else if (!queue.length && !cur) drawMenu(c, L, mine);
    if (wipe > 0) {   // the swirl into battle
      const n = 8, k = wipe;
      c.fillStyle = '#201828'; for (let i = 0; i < n; i++) { const h = Math.ceil(H / n), w = Math.round(W * k * (1 + (i % 2) * .3)); c.fillRect(i % 2 ? W - w : 0, i * h, w, h); }
      if (k > .8) { c.fillStyle = '#ffffff'; c.globalAlpha = (k - .8) * 5; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
    }
    if (mode === 'end' || mode === 'gone') { c.fillStyle = '#201828'; c.globalAlpha = clamp(1 - endT, 0, .8); c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
  }
  function drawMenu(c, L, m) {
    const btn = (i, label, col, sub, off) => {
      const r = btnRect(i); c.fillStyle = '#201828'; c.fillRect(r.x, r.y, r.w, r.h); c.fillStyle = off ? '#686070' : col; c.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      c.fillStyle = '#ffffff40'; c.fillRect(r.x + 1, r.y + 1, r.w - 2, 1); c.fillStyle = '#00000030'; c.fillRect(r.x + 1, r.y + r.h - 2, r.w - 2, 1);
      text(c, label, r.x + 5, r.y + (sub ? 3 : 6), { color: '#ffffff' }); if (sub) text(c, sub, r.x + 5, r.y + 10, { color: '#ffffffc0' });
    };
    const back = () => { const r = btnRect(4); c.fillStyle = '#201828'; c.fillRect(r.x, r.y - 14, r.w, r.h); c.fillStyle = '#9890a0'; c.fillRect(r.x + 1, r.y - 13, r.w - 2, r.h - 2); text(c, 'BACK', r.x + r.w / 2, r.y - 10, { color: '#ffffff', align: 'center' }); };
    if (menu === 'main') {
      btn(0, 'FIGHT', '#d84838'); btn(1, 'BAG', '#d8a030', `${bag.count('jar')} JARS ${bag.count('berry')} BERRIES`); btn(2, 'TEAM', '#48a848', `${party.filter(f => f.alive).length} READY`); btn(3, 'RUN', '#4878c8', null, foeKind !== 'wild');
      text(c, `WHAT WILL ${m.name} DO?`, 6, L.menuY - 8, { color: '#ffffff', outline: '#201828' });
    } else if (menu === 'fight') {
      for (let i = 0; i < 4; i++) { const mv = m.learn[i]; if (!mv) continue; const eff = mv.power ? (TYPES[mv.type]?.[them().type] ?? 1) : 1; btn(i, mv.name, TCOL[mv.type], mv.power ? `${mv.type === 'NORMAL' ? 'NORMAL' : mv.type} ${eff > 1 ? '+GOOD' : eff < 1 ? '-WEAK' : ''}` : 'SPECIAL'); }
      back();
    } else if (menu === 'bag') {
      btn(0, 'JAR', '#4888b8', `x${bag.count('jar')}  CATCH`, !bag.has('jar') || foeKind !== 'wild'); btn(1, 'GOLD JAR', '#c8a020', `x${bag.count('gold')}  NEVER MISSES`, !bag.has('gold') || foeKind !== 'wild'); btn(2, 'BERRY', '#d84858', `x${bag.count('berry')}  HEAL 20`, !bag.has('berry'));
      back();
    } else if (menu === 'team') {
      for (let i = 0; i < 4; i++) { const f = party[i]; if (!f) continue; btn(i, f.name, f === m ? '#9890a0' : TCOL[SPECIES[f.sp].type], `L${f.level} ${f.hp}/${f.maxHp}${f === m ? ' OUT' : ''}`, !f.alive); }
      if (m.alive) back(); else text(c, 'WHO WILL YOU SEND OUT?', 6, L.menuY - 8, { color: '#ffffff', outline: '#201828' });
    }
  }
  function drawEvolve(c) {
    const e = evo, k = e.t;
    c.fillStyle = '#201828'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28 + t, r = 30 + ((t * 40 + i * 9) % 60); c.fillStyle = i % 2 ? '#f8e070' : '#ffffff'; c.fillRect(Math.round(W / 2 + Math.cos(a) * r), Math.round(H / 2 - 10 + Math.sin(a) * r * .7), 2, 2); }
    const sk = 4, S = 64, x = Math.round(W / 2 - S / 2), y = Math.round(H / 2 - S / 2 - 16);
    if (e.done) { c.fillStyle = '#ffffff'; c.globalAlpha = Math.max(0, 1 - (k - 3.2) * 1.5); c.fillRect(0, 0, W, H); c.globalAlpha = 1; SPR[e.to].draw(c, x, y, { scale: sk }); }
    else { const rate = 2 + k * k * 1.6, which = Math.sin(t * rate * 3) > 0; (k < .8 ? SPR : SIL)[which || k < .8 ? e.from : e.to].draw(c, x, y, { scale: sk }); }
    text(c, e.done ? `${e.to}!` : `${e.from} IS EVOLVING...`, W / 2, H - 26, { color: '#ffffff', align: 'center' });
  }
  return self;
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'critter-quest', title: 'Critter Quest', tag: 'Advance · RPG', retro: true, era: 'advance', pal: 'grape',
  w: 192, h: 176, maxW: 240, maxH: 300,
  music: 'heroic',
  goal: 15,
  hint: 'Pick a partner and explore: drag to walk, tap to go or talk. Battle and catch the critters in the tall grass, beat the three Keepers for their seals, and face the Grove Warden. Ember beats Sprout, Sprout beats Ripple and Stone, Ripple beats Ember and Stone, Stone beats Ember.',
  make,
};
