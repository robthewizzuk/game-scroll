// Pup School: every walk is a new pup, and all it knows is "chase it!". Its thought bubble shows what it means to do
// about the next thing on the path. Tap the trick it should do instead and it does that, and remembers: a
// gs.brains.Coach keeps each tap as an example, and things like it get the same trick from then on (a gold bubble
// with a "!" is the pup remembering). What it bumps into, it learns not to do again by itself.
import gs from '../gamescroll.js';
const { Feel } = gs.effects, { Ready } = gs.rounds, { Coach } = gs.brains, { icon } = gs.icons, { font, use } = gs.fonts;
const { sounds, sfx } = gs.sound, { clamp, rnd } = gs.util, { ease } = gs.juice, { rng } = gs.math, { mix } = gs.tick;

const W = 360, H = 640;
const GROUND = 392, PUP = 92, UNIT = 62;       // the path's line, where the pup runs, and how many game units "1" of height is
const THINK = 243, ACT = 38, SC = 1.3, WALK = 44, GOAL = 50, HEARTS = 5;
const TRICKS = ['grab', 'jump', 'duck', 'sit', 'bark'];   // (in the order a pup would try them by itself: chase it first)
const SHOWN = ['jump', 'duck', 'sit', 'grab', 'bark'];    // the buttons, left to right
const INK = { jump: '#3aa8f0', duck: '#9a78f0', sit: '#f0a030', grab: '#f0608c', bark: '#3cb878' };
const NAMES = ['Biscuit', 'Mango', 'Pickle', 'Waffle', 'Noodle', 'Pepper', 'Bean', 'Tofu', 'Olive', 'Sprout', 'Fig', 'Dumpling', 'Mochi', 'Peanut'];
const COATS = [['#d9a066', '#f3d9b0', '#8a5a2b'], ['#8d6748', '#d8b998', '#4a3423'], ['#f1ece2', '#ffffff', '#b98a5a'], ['#9aa3ad', '#dfe5ea', '#59616b'], ['#3d3a3a', '#e8e2d6', '#1d1b1b'], ['#e6b84a', '#fbe7a8', '#a8741c']];

// What is on the path. see: what the pup takes in of a thing, as numbers: how high off the ground its underside is,
// how tall it stands, how fast it moves, how good it smells, and feathers. The player sees the same things drawn.
const FAM = {
  treat: { right: 'grab', looks: 3, see: (r, k) => [.22 + r() * .16, .5 + r() * .14, 0, .8 + r() * .2, 0] },
  low: { right: 'jump', looks: 3, see: (r, k) => [0, [.08, .2, .3][k] + r() * .07, 0, r() * .2, 0] },
  high: { right: 'duck', looks: 3, see: (r, k) => [.52 + r() * .16, 1, 0, r() * .2, 0] },
  mover: { right: 'sit', looks: 3, see: (r, k) => [0, [.46, .3, .36][k] + r() * .1, .6 + r() * .4, r() * .3, 0] },
  flock: { right: 'bark', looks: 3, see: (r, k) => [0, .1 + r() * .1, r() * .2, r() * .2, 1] },
  ball: { right: 'grab', looks: 3, see: (r, k) => [0, .22 + r() * .08, .6 + r() * .4, .7 + r() * .3, 0] },
  goose: { right: 'sit', looks: 2, see: (r, k) => [0, .5 + r() * .15, .1 + r() * .2, r() * .2, 1] },
};
// The walk: what can turn up, stage by stage (a new kind of thing opens each stage).
const STAGES = [['treat'], ['low', 'low', 'treat'], ['high', 'high', 'low', 'treat'], ['mover', 'mover', 'low', 'high', 'treat'], ['flock', 'flock', 'low', 'high', 'mover', 'treat'], ['ball', 'ball', 'low', 'high', 'mover', 'flock', 'treat'], ['goose', 'goose', 'low', 'high', 'mover', 'flock', 'ball', 'treat'], ['low', 'high', 'mover', 'flock', 'ball', 'goose', 'treat']];
const OPENS = [0, 1, 6, 11, 16, 22, 28, 35];
const AREAS = [['#9fd8ff', '#e8f6ff', '#c9c4bc', '#8fa3b5'], ['#8fd0f5', '#e4f7e6', '#bfe3a0', '#6fae6a'], ['#9adbe8', '#e9f7f2', '#cfe6b8', '#5f9e8e'], ['#ffc48a', '#ffe9c9', '#e6cfa0', '#b58a6a']];   // sky top, sky low, path, far shapes

const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
const blob = (c, x, y, rx, ry, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill(); };
const mixCol = (a, b, t) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

// a trick's sign: the same one on its button and in the pup's thought bubble
function glyph(c, trick, x, y, s, col) {
  c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = s * .13; c.lineCap = 'round'; c.lineJoin = 'round';
  if (trick === 'jump') {
    c.beginPath(); c.arc(0, s * .22, s * .36, Math.PI, Math.PI * 1.92); c.stroke();
    c.beginPath(); c.moveTo(s * .46, s * .2); c.lineTo(s * .14, s * .12); c.lineTo(s * .44, -s * .14); c.closePath(); c.fill();
    c.fillRect(-s * .46, s * .34, s * .92, s * .08);
  } else if (trick === 'duck') {
    c.fillRect(-s * .46, -s * .4, s * .92, s * .12);
    c.beginPath(); c.arc(0, -s * .2, s * .36, Math.PI * .08, Math.PI); c.stroke();
    c.beginPath(); c.moveTo(s * .46, -s * .2); c.lineTo(s * .14, -s * .1); c.lineTo(s * .44, s * .14); c.closePath(); c.fill();
  } else if (trick === 'sit') icon(c, 'sitting-dog', 0, 0, s, { color: col });
  else if (trick === 'grab') {
    c.rotate(-.5); c.fillRect(-s * .28, -s * .08, s * .56, s * .16);
    for (const [bx, by] of [[-.3, -.1], [-.3, .1], [.3, -.1], [.3, .1]]) { c.beginPath(); c.arc(bx * s, by * s, s * .12, 0, 7); c.fill(); }
  } else {
    c.beginPath(); c.moveTo(-s * .42, -s * .12); c.lineTo(-s * .2, -s * .12); c.lineTo(0, -s * .3); c.lineTo(0, s * .3); c.lineTo(-s * .2, s * .12); c.lineTo(-s * .42, s * .12); c.closePath(); c.fill();
    for (const r of [.2, .36]) { c.beginPath(); c.arc(s * .04, 0, s * r, -.9, .9); c.stroke(); }
  }
  c.restore();
}

// the pup, feet at (x, y): how it stands depends on what it is doing (mode) and how far through it is (u: 0..1)
function drawPup(c, x, y, coat, mode, u, t, wag) {
  const [fur, belly, patch] = coat.cols; let lift = 0, sx = 1, sy = 1, tilt = 0, head = 0, nod = 0, open = 0, run = Math.sin(t * 16);
  if (mode === 'jump') { lift = Math.sin(u * Math.PI) * 62; tilt = (u - .5) * .7; run = 1; }
  else if (mode === 'duck') { const k = Math.sin(Math.min(1, u * 1.6) * Math.PI * .5) * (u > .8 ? (1 - u) * 5 : 1); sy = 1 - .48 * k; sx = 1 + .18 * k; nod = .5 * k; }
  else if (mode === 'sit') { const k = ease.outBack(Math.min(1, u * 4)) * (u > .88 ? (1 - u) * 8.3 : 1); tilt = -.5 * k; run = 0; }
  else if (mode === 'grab') { const k = Math.sin(u * Math.PI); head = 9 * k; open = k; }
  else if (mode === 'bark') { const k = Math.abs(Math.sin(u * Math.PI * 3)); nod = -.35 * k; open = k; run = 0; }
  else if (mode === 'oops') { tilt = Math.sin(u * Math.PI) * -1.5; lift = Math.sin(u * Math.PI) * 16; run = 0; }
  else if (mode === 'happy') { lift = Math.abs(Math.sin(u * Math.PI * 3)) * 12; run = 0; }
  c.save(); c.translate(x, y); c.scale(SC, SC); c.translate(0, -lift);
  if (lift > 2) { c.save(); c.translate(0, lift); blob(c, 0, 2, 24 - lift * .12, 4, '#00000022'); c.restore(); } else blob(c, 0, 2, 24, 4, '#00000022');
  c.translate(-16, 0); c.rotate(tilt); c.translate(16, 0); c.scale(sx, sy);
  // tail
  c.strokeStyle = fur; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(-20, -30); c.quadraticCurveTo(-30, -40, -27 + Math.sin(t * 14) * 5 * wag, -50); c.stroke();
  // legs
  c.strokeStyle = patch; c.lineWidth = 5.5;
  for (const [lx, ph] of [[-13, 0], [-7, 1], [9, 1], [15, 0]]) { const sw = run * (ph ? -1 : 1) * (mode === 'jump' ? 9 : 6), up = mode === 'jump' ? 6 : 0; c.beginPath(); c.moveTo(lx, -16); c.lineTo(lx + sw, -2 - up); c.stroke(); }
  // body
  blob(c, 0, -26, 23, 13, fur); blob(c, 2, -21, 15, 7, belly);
  if (coat.spot) blob(c, -8, -31, 8, 6, patch);
  // head
  c.translate(21 + head, -42); c.rotate(nod);
  blob(c, 0, 0, 13, 12, fur);
  blob(c, 11, 3, 8, 6 - open * 1.5, belly);
  if (open > .15) { c.fillStyle = '#7a2b3a'; c.beginPath(); c.moveTo(6, 6); c.lineTo(19, 5 + open * 6); c.lineTo(8, 9 + open * 5); c.closePath(); c.fill(); }
  blob(c, 18, 1, 2.6, 2.2, '#2a2020');
  if (coat.eye) blob(c, 3, -3, 6, 6, patch);
  if (mode === 'oops') { c.strokeStyle = '#2a2020'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(1, -5); c.lineTo(6, -1); c.moveTo(6, -5); c.lineTo(1, -1); c.stroke(); }
  else { blob(c, 4, -3, 2.3, mode === 'happy' ? 1 : 2.6, '#2a2020'); blob(c, 4.8, -4, .8, .8, '#ffffff'); }
  c.fillStyle = patch; c.beginPath();
  if (coat.ears) { c.moveTo(-9, -6); c.lineTo(-6, -22); c.lineTo(2, -9); } else c.ellipse(-8, 2, 5, 11, .35 + Math.sin(t * 16) * .08 * (run ? 1 : 0), 0, 7);
  c.fill();
  c.restore();
  c.save(); c.translate(x, y); c.scale(SC, SC);
  if (mode === 'bark') { c.strokeStyle = '#ffffff'; c.lineWidth = 2.5; for (const r of [14, 22, 30]) { c.globalAlpha = clamp(1.4 - u * 1.4 - r / 60, 0, 1); c.beginPath(); c.arc(40, -44, r * (.6 + u), -.7, .7); c.stroke(); } }
  if (mode === 'oops') for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; icon(c, 'flat-star', 18 + Math.cos(a) * 16, -62 + Math.sin(a) * 5, 9, { color: '#ffd23f' }); }
  c.restore();
}

// a thing on the path, its foot at (x, GROUND). o: what it is; t: the clock
function drawThing(c, o, t, x) {
  const g = GROUND, k = o.look, tall = o.see[1] * UNIT, under = o.see[0] * UNIT;
  c.save(); c.translate(x, g); c.scale(SC, SC); c.translate(-x, -g);
  if (o.fam === 'low') {
    if (k === 0) { blob(c, x, g + 3, 30, 6, '#5fb4e8'); blob(c, x - 6, g + 2, 12, 2.2, '#bfe6ff'); }
    else if (k === 1) { c.fillStyle = '#8a5a34'; rr(c, x - 26, g - tall, 52, tall, 8); c.fill(); blob(c, x + 22, g - tall / 2, 5, tall / 2, '#c99866'); c.strokeStyle = '#6b4424'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - 18, g - tall * .6); c.lineTo(x + 8, g - tall * .6); c.stroke(); }
    else { for (let i = -2; i <= 2; i++) blob(c, x + i * 9, g - tall * .55, 9, tall * .55, i % 2 ? '#4f9a4a' : '#63b25c'); for (const [fx, fy] of [[-12, .8], [6, .95], [15, .6]]) blob(c, x + fx, g - tall * fy, 2.4, 2.4, '#ff8fb0'); }
  } else if (o.fam === 'high') {
    const y = g - under;
    if (k === 0) { c.fillStyle = '#7a5232'; c.fillRect(x + 30, g - 150, 13, 150); rr(c, x - 44, y - 9, 80, 9, 4); c.fill(); for (const [lx, ly, r] of [[-40, -12, 13], [-22, -16, 12], [-4, -13, 12], [12, -17, 11]]) blob(c, x + lx, y + ly, r, r * .8, lx % 3 ? '#5aa653' : '#6fbd66'); }
    else if (k === 1) { const ly = y - 34; c.fillStyle = '#b7b0a6'; c.fillRect(x - 50, ly - 6, 5, g - ly + 6); c.fillRect(x + 46, ly - 6, 5, g - ly + 6); c.strokeStyle = '#8a8378'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 48, ly); c.quadraticCurveTo(x, ly + 5, x + 48, ly); c.stroke(); ['#ff8f6b', '#6bb8ff', '#ffd76b', '#b78bff'].forEach((col, i) => { c.fillStyle = col; rr(c, x - 38 + i * 21, ly + 2, 15, y - ly - 2, 3); c.fill(); }); }
    else { c.fillStyle = '#8a8378'; c.fillRect(x + 34, g - 96, 8, 96); for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#e8504a'; c.fillRect(x - 50 + i * 14, y - 10, 14, 10); } }
  } else if (o.fam === 'mover') {
    const bob = Math.abs(Math.sin(t * 12)) * 2;
    if (k === 0) {   // a cat
      const col = '#f0963c'; c.strokeStyle = col; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + 15, g - 16); c.quadraticCurveTo(x + 26, g - 22, x + 22, g - tall); c.stroke();
      for (const lx of [-9, -3, 7, 12]) { c.beginPath(); c.moveTo(x + lx, g - 10); c.lineTo(x + lx + Math.sin(t * 14 + lx) * 3, g - 1); c.stroke(); }
      blob(c, x + 2, g - 15 - bob, 15, 8, col); blob(c, x - 14, g - 22 - bob, 8, 7, col);
      c.fillStyle = col; c.beginPath(); c.moveTo(x - 20, g - 26 - bob); c.lineTo(x - 19, g - 35 - bob); c.lineTo(x - 13, g - 28 - bob); c.moveTo(x - 12, g - 28 - bob); c.lineTo(x - 9, g - 35 - bob); c.lineTo(x - 7, g - 26 - bob); c.fill();
      blob(c, x - 17, g - 23 - bob, 1.4, 1.8, '#2a2020');
    } else if (k === 1) {   // a runaway skateboard
      c.fillStyle = '#e8504a'; rr(c, x - 22, g - 11, 44, 5, 3); c.fill(); for (const wx of [-13, 13]) { blob(c, x + wx, g - 4, 4, 4, '#3a3a40'); blob(c, x + wx, g - 4, 1.5, 1.5, '#d0d0d8'); }
      c.strokeStyle = '#ffffff90'; c.lineWidth = 2; for (const ly of [-8, -14]) { c.beginPath(); c.moveTo(x + 28, g + ly); c.lineTo(x + 40, g + ly); c.stroke(); }
    } else {   // a toy car
      c.fillStyle = '#4f8ff0'; rr(c, x - 20, g - 16, 40, 11, 4); c.fill(); c.fillStyle = '#9cc4ff'; rr(c, x - 10, g - 23, 20, 9, 3); c.fill(); for (const wx of [-12, 12]) blob(c, x + wx, g - 4, 4.5, 4.5, '#2f2f36');
      c.strokeStyle = '#8a8378'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x + 14, g - 16); c.lineTo(x + 20, g - 30); c.stroke();
    }
  } else if (o.fam === 'flock') {
    const col = ['#8f98a8', '#a6784e', '#3a3a44'][k];
    for (let i = 0; i < 5; i++) {
      const bx = x - 26 + i * 13 + (o.fly ? -o.fly * (40 + i * 30) : 0), by = g - 5 - (o.fly ? o.fly * (120 + i * 26) : Math.max(0, Math.sin(t * 7 + i * 1.7)) * 3);
      blob(c, bx, by, 6, 4.5, col); blob(c, bx - 5, by - 4, 3.2, 3, col); c.fillStyle = '#f0a030'; c.fillRect(bx - 10, by - 4, 3, 1.6);
      if (o.fly) { c.strokeStyle = col; c.lineWidth = 2.5; c.beginPath(); c.moveTo(bx - 7, by - 4 - Math.sin(t * 30 + i) * 5); c.lineTo(bx, by - 2); c.lineTo(bx + 7, by - 4 - Math.sin(t * 30 + i) * 5); c.stroke(); }
    }
  } else if (o.fam === 'ball') {
    if (o.gone) { c.restore(); return; }
    const r = tall / 2, by = g - r - Math.abs(Math.sin(t * 7 + o.n)) * 16, col = ['#cfe84a', '#f0504a', '#ffffff'][k];
    blob(c, x, g + 2, r, 3, '#00000022'); blob(c, x, by, r, r, col);
    c.strokeStyle = k === 0 ? '#ffffff' : k === 1 ? '#ffb0a8' : '#4f8ff0'; c.lineWidth = 1.6; c.beginPath(); c.arc(x - r * .9, by, r, -.8, .8); c.stroke();
  } else if (o.fam === 'goose') {
    const col = k ? '#b9b2a6' : '#ffffff', wob = Math.sin(t * 9) * 2, flap = o.leaving ? Math.sin(t * 30) * 7 : 0;
    c.strokeStyle = '#f0a030'; c.lineWidth = 3; for (const lx of [-3, 5]) { c.beginPath(); c.moveTo(x + lx, g - 12); c.lineTo(x + lx - 2, g - 1); c.stroke(); }
    blob(c, x + 3, g - 18, 15, 10, col); blob(c, x + 8, g - 20 - flap, 9, 5, k ? '#9a9388' : '#e6e6ea');
    c.strokeStyle = col; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - 8, g - 22); c.quadraticCurveTo(x - 14, g - tall * .7, x - 12 + wob, g - tall + 4); c.stroke();
    blob(c, x - 13 + wob, g - tall + 3, 5, 4.5, col); c.fillStyle = '#f0a030'; c.beginPath(); c.moveTo(x - 17 + wob, g - tall + 1); c.lineTo(x - 25 + wob, g - tall + 4); c.lineTo(x - 17 + wob, g - tall + 6); c.fill();
    blob(c, x - 14 + wob, g - tall + 2, 1.1, 1.1, '#2a2020');
  } else {   // a treat on a balloon's string
    const ty = g - (under + tall) / 2 - (o.gone ? o.gone * 160 : Math.sin(t * 3 + o.n) * 3), col = ['#ff6b8a', '#6bc4ff', '#ffd23f'][k];
    c.strokeStyle = '#8a8378'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, ty - 6); c.lineTo(x + 2, ty - 34); c.stroke();
    blob(c, x + 2, ty - 48, 12, 15, col); blob(c, x - 2, ty - 53, 3, 5, '#ffffff80');
    if (!o.gone) {
      if (k === 0) glyph(c, 'grab', x, ty + 2, 26, '#fff6e0');
      else if (k === 1) { blob(c, x, ty + 2, 9, 9, '#d9a066'); for (const [dx, dy] of [[-3, -2], [3, 1], [-1, 4]]) blob(c, x + dx, ty + 2 + dy, 1.4, 1.4, '#6b4424'); }
      else { c.strokeStyle = '#c8553a'; c.lineWidth = 8; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - 7, ty + 4); c.lineTo(x + 7, ty); c.stroke(); }
      c.strokeStyle = '#ffffffb0'; c.lineWidth = 1.4; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x + s * 13, ty - 4); c.quadraticCurveTo(x + s * 17, ty - 9 + Math.sin(t * 5) * 2, x + s * 14, ty - 14); c.stroke(); }
    }
  }
  c.restore();
}

function make(api) {
  const feel = new Feel(), ready = new Ready({ text: '' });
  let coach, coat, pupName, walk, things, idx, gap, passed, score, hearts, t, scroll, hold, mode, modeT, modeLen, cur, late, lessons, bubble, press, tutor, home, rand, pats;
  use('Fredoka');
  let walked = api.load({ home: 0 }).home | 0;   // pups walked all the way home, ever (this game's own save)

  const speed = () => 116 + 92 * clamp(passed / WALK, 0, 1);
  const does = (m, len) => { mode = m; modeT = 0; modeLen = len; };
  const say = (text, color = '#ffffff') => feel.juice.pop(PUP + 40, GROUND - 190, text, { color, size: 1.1 });

  function spawn() {
    const fam = walk[idx], f = FAM[fam], look = Math.floor(rand() * f.looks);
    things.push({ fam, look, see: f.see(rand, look), x: W + 60, n: idx, plan: null, own: null, helped: false, done: false, fly: 0, gone: 0, leaving: false, was: W + 60 });
    idx++; gap = 244 + rand() * 52;
  }
  function think(o) {
    o.plan = o.own = coach.pick(o.see, TRICKS);
    const rc = coach.recalled, knows = rc && rc.like > .35 && (rc.not || rc.action === o.plan) && o.plan !== (rc.not ? rc.action : null);
    bubble = { o, pop: 0, gold: !!knows, not: knows && rc.not ? rc.action : null };
    if (knows) { sounds.twinkle(); feel.juice.burst(PUP + 58, GROUND - 142, { n: 8, speed: 70, life: .4, size: 2.5, color: ['#ffd23f', '#ffffff'] }); }
    else sounds.blip();
  }
  function act(o) {
    o.done = true; passed++; cur = null;
    const f = FAM[o.fam];
    if (o.plan === f.right) {
      const pts = o.helped ? 1 : 2; score += pts; api.score(score);
      feel.coin(PUP + 10, GROUND - 84, { text: '+' + pts, color: o.helped ? '#ffffff' : '#ffd23f' });
      if (!o.helped && bubble && bubble.gold) say(pupName + ' remembered!', '#ffd23f');
      if (o.plan === 'jump') { does('jump', .62); sounds.jump(); }
      else if (o.plan === 'duck') { does('duck', .62); sounds.swoosh(); }
      else if (o.plan === 'sit') { does('sit', .95); hold = .8; o.leaving = true; sounds.pop(); }
      else if (o.plan === 'grab') { does('grab', .4); o.gone = .001; sounds.munch(); }
      else { does('bark', .5); o.fly = .001; sfx(420, .07, 'square', .06, -160); sfx(360, .09, 'square', .06, -140); sounds.flap(); }
    } else {
      hearts--; does('oops', .8); feel.hurt(PUP + 16, GROUND - 30);
      coach.avoid(o.see, o.plan);                      // it learns from its own bumps too: "not that, here"
      late = { o, t: .85 }; hold = .85;                // it stops, dizzy: the moment to tap what it should have done
      say('Oops!', '#ff8f8f');
      if (hearts <= 0) { feel.lose(); api.over(); }
    }
    if (passed >= WALK && hearts > 0) home = .001;
  }
  function teach(trick) {
    press = { trick, t: .18 };
    if (late) {                                        // just after a bump: what it should have done there
      coach.correct(late.o.see, trick); lessons[trick]++; late = null; hold = Math.min(hold, .25); tutor = Math.max(0, tutor - 1);
      feel.click(); say('Next time!', INK[trick]);
    } else if (cur && cur.plan) {
      if (trick === cur.plan) { coach.correct(cur.see, trick); pats++; feel.juice.pop(PUP + 6, GROUND - 100, '♥', { color: '#ff7aa8' }); sounds.pop(); return; }   // "yes, that": praise is an example too
      cur.plan = trick; cur.helped = trick !== cur.own; coach.correct(cur.see, trick);
      lessons[trick]++; bubble.pop = 0; bubble.gold = false; bubble.not = null; tutor = Math.max(0, tutor - 1);
      feel.click(); say('Got it!', INK[trick]);
    }
  }
  const button = i => ({ x: 5 + i * 70, y: 492, w: 68, h: 128 });

  return {
    reset() {
      // a new pup: its looks, its name and a walk of its own; it has been taught nothing
      rand = rng(rnd(0, 1e9) | 0);
      coach = new Coach({ name: 'pup', inputs: 5, actions: TRICKS, save: false });
      coat = { cols: COATS[Math.floor(rand() * COATS.length)], ears: rand() < .4, spot: rand() < .5, eye: rand() < .4 };
      pupName = NAMES[Math.floor(rand() * NAMES.length)];
      walk = [];
      for (let i = 0, st = 0; i < WALK; i++) {
        while (st + 1 < OPENS.length && i >= OPENS[st + 1]) st++;
        const pool = STAGES[st]; let f = i === OPENS[st] ? pool[0] : pool[Math.floor(rand() * pool.length)];
        if (i > 1 && walk[i - 1] === f && walk[i - 2] === f) f = pool[(pool.indexOf(f) + 1 + Math.floor(rand() * (pool.length - 1))) % pool.length];
        walk.push(f);
      }
      things = []; idx = 0; gap = 150; passed = 0; score = 0; hearts = HEARTS; t = 0; scroll = 0; hold = 0; mode = 'run'; modeT = 0; modeLen = 0;
      cur = null; late = null; bubble = null; press = null; tutor = 2; home = 0; pats = 0;
      lessons = { jump: 0, duck: 0, sit: 0, grab: 0, bark: 0 };
      feel.clear(); ready.reset();
      },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (press && (press.t -= dt) <= 0) press = null;
      if (!ready.update(dt)) return;
      if (mode !== 'run' && (modeT += dt) >= modeLen) mode = 'run';
      if (late && (late.t -= dt) <= 0) late = null;
      if (bubble) bubble.pop = Math.min(1, bubble.pop + dt * 6);
      if (home) {                                      // the kennel at the end of the walk
        if (home < 0) return;
        home += dt; if (mode === 'run' && home > .9) does('happy', 1.2);
        if (home > 2) { home = -1; walked++; api.save({ home: walked }); feel.win(PUP + 30, GROUND - 60); score >= GOAL ? api.win() : api.over(); }
        if (home > 0 && home < .9) { scroll += speed() * dt; for (const o of things) { o.was = o.x; o.x -= speed() * dt; } }
        return;
      }
      if (hearts <= 0) return;
      const v = hold > 0 ? 0 : speed(); hold = Math.max(0, hold - dt); scroll += v * dt;
      gap -= v * dt; if (gap <= 0 && idx < WALK) spawn();
      for (const o of things) {
        o.was = o.x;
        o.x -= (v + (o.done ? 0 : o.see[2] * 60) + (o.leaving ? 300 : 0)) * dt;
        if (o.fly) o.fly = Math.min(1.5, o.fly + dt * 1.6);
        if (o.gone) o.gone = Math.min(1.5, o.gone + dt * 1.4);
      }
      things = things.filter(o => o.x > -90);
      // the next thing ahead: thought about when it comes near, met when it arrives
      if (!cur && !late) { cur = things.find(o => !o.done && o.x - PUP < THINK) || null; if (cur) think(cur); }
      if (cur && cur.x - PUP <= ACT) act(cur);
    },
    draw(c) {
      const area = clamp(passed / WALK * 3.4, 0, 3), a0 = Math.floor(area), a1 = Math.min(3, a0 + 1), at = area - a0, col = i => mixCol(AREAS[a0][i], AREAS[a1][i], at);
      const sky = c.createLinearGradient(0, 0, 0, GROUND); sky.addColorStop(0, col(0)); sky.addColorStop(1, col(1));
      c.fillStyle = sky; c.fillRect(0, 0, W, GROUND);
      feel.begin(c);
      // far hills and things along the way, slower the further off
      for (let i = 0; i < 4; i++) { const hx = ((i * 190 - scroll * .15) % 760 + 760) % 760 - 200; blob(c, hx, GROUND + 6, 150, 70 + (i % 2) * 34, col(3) + '70'); }
      for (let i = 0; i < 5; i++) {
        const bx = ((i * 150 - scroll * .45) % 750 + 750) % 750 - 150, kind = (i + a0) % 3;
        if (kind === 0) { c.fillStyle = '#7a5232'; c.fillRect(bx + 28, GROUND - 60, 8, 60); blob(c, bx + 32, GROUND - 78, 30, 28, '#5aa65390'); blob(c, bx + 18, GROUND - 62, 18, 16, '#6fbd6690'); }
        else if (kind === 1) { c.fillStyle = col(3); c.fillRect(bx, GROUND - 74, 64, 74); c.fillStyle = '#ffffff50'; for (const [wx, wy] of [[10, 14], [38, 14], [10, 42]]) c.fillRect(bx + wx, GROUND - 74 + wy, 15, 15); c.fillStyle = '#b5584a'; c.beginPath(); c.moveTo(bx - 6, GROUND - 74); c.lineTo(bx + 32, GROUND - 100); c.lineTo(bx + 70, GROUND - 74); c.fill(); }
        else { c.fillStyle = '#8a8378'; c.fillRect(bx + 30, GROUND - 92, 4, 92); blob(c, bx + 32, GROUND - 94, 7, 7, '#fff3c0'); }
      }
      c.fillStyle = col(2); c.fillRect(0, GROUND - 4, W, H - GROUND + 4);
      c.fillStyle = '#00000012'; for (let i = 0; i < 9; i++) { const gx = ((i * 52 - scroll) % 468 + 468) % 468 - 40; c.fillRect(gx, GROUND + 14 + (i % 3) * 13, 22, 3); }
      // the kennel at the end
      if (home) { const hx = PUP + 124 + Math.max(0, .9 - Math.abs(home)) * 300; c.save(); c.translate(hx, GROUND); c.scale(SC, SC); c.translate(-hx, -GROUND); c.fillStyle = '#c8553a'; c.beginPath(); c.moveTo(hx - 44, GROUND - 52); c.lineTo(hx, GROUND - 92); c.lineTo(hx + 44, GROUND - 52); c.fill(); c.fillStyle = '#e8c9a0'; c.fillRect(hx - 36, GROUND - 52, 72, 52); c.fillStyle = '#4a3423'; rr(c, hx - 14, GROUND - 36, 28, 36, [14, 14, 0, 0]); c.fill(); c.restore(); }
      for (const o of things) drawThing(c, o, t, mix(o.was, o.x));
      drawPup(c, PUP, GROUND, coat, ready.waiting ? 'sit' : mode, ready.waiting ? .5 : modeLen ? modeT / modeLen : 0, t, mode === 'oops' ? 0 : 1);
      // what it means to do: its thought bubble (gold with a "!": it remembered a lesson)
      if (bubble && cur === bubble.o && !home) {
        const s = ease.outBack(bubble.pop), bx = PUP + 58, by = GROUND - 142;
        c.save(); c.translate(bx, by); blob(c, -18, 30, 3, 3, '#ffffff'); blob(c, -12, 22, 5, 5, '#ffffff'); c.scale(s, s);
        c.fillStyle = '#ffffff'; rr(c, -27, -27, 54, 50, 20); c.fill();
        if (bubble.gold) { c.strokeStyle = '#ffc21f'; c.lineWidth = 3.5; c.stroke(); }
        glyph(c, bubble.o.plan, 0, -2, 34, INK[bubble.o.plan]);
        if (bubble.gold) { blob(c, 25, -25, 10, 10, '#ffc21f'); c.fillStyle = '#5a3c00'; c.font = font('Fredoka', 15); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', 25, -24); }
        if (bubble.not) { blob(c, -27, -25, 10, 10, '#ffffff'); glyph(c, bubble.not, -27, -25, 13, '#b0a8a0'); c.strokeStyle = '#e8504a'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(-33, -19); c.lineTo(-21, -31); c.stroke(); }
        c.restore();
      }
      if (late && hearts > 0) {                        // after a bump: "what should I have done?"
        c.save(); c.translate(PUP + 58, GROUND - 142); const s = 1 + Math.sin(t * 10) * .06; blob(c, -18, 30, 3, 3, '#ffffff'); blob(c, -12, 22, 5, 5, '#ffffff'); c.scale(s, s);
        c.fillStyle = '#ffffff'; rr(c, -27, -27, 54, 50, 20); c.fill(); c.fillStyle = '#e8504a'; c.font = font('Fredoka', 34); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 0, 0);
        c.restore();
      }
      feel.end(c, W, H);
      // the tricks
      c.fillStyle = '#2b2f45'; rr(c, 0, 478, W, H - 478 + 20, 18); c.fill();
      c.textAlign = 'center'; c.textBaseline = 'middle';
      SHOWN.forEach((trick, i) => {
        const b = button(i), down = press && press.trick === trick ? 3 : 0;
        c.fillStyle = '#1d2033'; rr(c, b.x, b.y + 4, b.w, b.h, 15); c.fill();
        c.fillStyle = INK[trick]; rr(c, b.x, b.y + down, b.w, b.h, 15); c.fill();
        c.fillStyle = '#ffffff30'; rr(c, b.x + 4, b.y + down + 4, b.w - 8, 40, 11); c.fill();
        glyph(c, trick, b.x + b.w / 2, b.y + down + 46, 42, '#ffffff');
        c.fillStyle = '#ffffff'; c.font = font('Fredoka', 15); c.fillText(trick.toUpperCase(), b.x + b.w / 2, b.y + down + 88);
        for (let k = 0; k < 3; k++) blob(c, b.x + b.w / 2 - 12 + k * 12, b.y + down + 110, 3.5, 3.5, lessons[trick] > k ? '#ffffff' : '#00000030');   // lessons given
      });
      // the first couple of times it has the wrong idea, the right button shows itself
      const stuck = late ? late.o : cur && cur.plan && cur.plan !== FAM[cur.fam].right ? cur : null;
      if (tutor > 0 && stuck && !home && hearts > 0) { const b = button(SHOWN.indexOf(FAM[stuck.fam].right)); c.strokeStyle = '#ffffff'; c.lineWidth = 3.5 + Math.sin(t * 9) * 1.5; rr(c, b.x, b.y, b.w, b.h, 15); c.stroke(); }
      // paws left, and how far home
      const sa = api.scoreArea ? api.scoreArea() : null, hy = sa ? Math.max(24, sa.y + sa.h + 16) : 60;
      for (let i = 0; i < HEARTS; i++) icon(c, 'paw-print', 20 + i * 22, hy, 17, { color: i < hearts ? '#ffffff' : '#00000030' });
      c.fillStyle = '#00000030'; rr(c, W - 150, hy - 3, 116, 6, 3); c.fill();
      c.fillStyle = '#ffffff'; rr(c, W - 150, hy - 3, 116 * clamp(passed / WALK, 0, 1), 6, 3); c.fill();
      icon(c, 'house', W - 20, hy, 18, { color: '#ffffff' });
      if (ready.waiting) {
        c.fillStyle = '#00000050'; rr(c, 30, 150, W - 60, walked ? 142 : 120, 18); c.fill();
        c.fillStyle = '#ffffff'; c.font = font('Fredoka', 24); c.fillText(`Walk ${pupName} home`, W / 2, 182);
        c.font = font('Fredoka', 15); c.fillText('Its bubble shows what it means to do.', W / 2, 214); c.fillText('Tap the right trick and it remembers.', W / 2, 234);
        c.globalAlpha = .65 + .35 * Math.sin(t * 4); c.fillText('Tap to start', W / 2, 256); c.globalAlpha = 1;
        if (walked) { c.fillStyle = '#ffffffb0'; c.font = font('Fredoka', 13); c.fillText(`${walked} ${walked === 1 ? 'pup' : 'pups'} walked home so far`, W / 2, 278); }
      }
    },
    down(x, y) {
      if (ready.go()) return;
      if (home || hearts <= 0) return;
      const i = SHOWN.findIndex((_, k) => { const b = button(k); return x >= b.x - 1 && x <= b.x + b.w + 1 && y >= b.y - 10 && y <= b.y + b.h + 16; });
      if (i >= 0) teach(SHOWN[i]);
    },
    key(k, isDown) {
      if (!isDown || ready.go() || home || hearts <= 0) return;
      const trick = { ArrowUp: 'jump', ArrowDown: 'duck', ArrowLeft: 'sit', ArrowRight: 'grab', ' ': 'bark', 1: 'jump', 2: 'duck', 3: 'sit', 4: 'grab', 5: 'bark' }[k];
      if (trick) teach(trick);
    },
    debug(c) { c.strokeStyle = '#0f8'; c.strokeRect(PUP + ACT, GROUND - 80, THINK - ACT, 80); c.fillStyle = '#0f8'; c.font = '10px monospace'; c.textAlign = 'left'; c.fillText(`lessons ${coach.corrections.length} heed ${coach.heed.toFixed(2)} pats ${pats}`, 8, GROUND + 60); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'pup-school',
  title: 'Pup School',
  tag: 'Casual · Pet',
  retro: false,
  w: W, h: H,
  tick: 60,
  music: 'happy',
  goal: GOAL,
  hint: 'Your pup shows what it means to do in its thought bubble. Tap the trick it should do instead and it remembers: jump low things, duck high ones, sit for movers and geese, grab treats and balls, bark at flocks. Five bumps and the walk is over.',
  creator: 'Claude',
  make,
};
