// Puzzle Detective: something went missing from the room. Tap the scene to find the clues the thief
// left (a thread from their hat, a lens from their glasses, a strand of hair, a muddy boot print),
// then tap the one suspect in the line-up who matches every clue. Quick, right answers score more.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { C16 } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle (a sort with a random compare favours some orders)

let W = 160, H = 192;
const HATS = [null, C16[2], C16[8], C16[5]], HAIR = [C16[0], C16[4], C16[11], C16[3]], BOOTS = [C16[12], C16[0], C16[9]];
const KINDS = ['hat', 'glasses', 'hair', 'boots'];

function make(api) {
  const feel = new Feel({ pixel: true });
  let sus, culprit, clues, clutter, found, score, strikes, cases, time, t, banner, wrong;
  const sceneH = () => Math.round(H * .56), lineY = () => sceneH() + 18;

  function newCase() {
    // four suspects; the culprit matches three clues that nobody else matches all of
    for (let tries = 0; tries < 200; tries++) {
      sus = Array.from({ length: 4 }, () => ({ hat: Math.random() * 4 | 0, glasses: Math.random() < .5, hair: Math.random() * 4 | 0, boots: Math.random() * 3 | 0, out: false, skin: [C16[14], '#e8b088', '#a86838', '#683820'][Math.random() * 4 | 0] }));
      culprit = Math.random() * 4 | 0; const cu = sus[culprit];
      const usable = KINDS.filter(k => (k !== 'hat' || cu.hat) && (k !== 'glasses' || cu.glasses));
      const pick = shuffle(usable).slice(0, Math.min(3, usable.length));
      const match = s => pick.every(k => s[k] === cu[k]);
      if (pick.length >= 2 && sus.filter(match).length === 1 && sus.filter(s => pick.slice(0, -1).every(k => s[k] === cu[k])).length > 1) {
        const sh = sceneH(); const spots = [];
        const free = (x, y) => spots.every(p => Math.abs(p.x - x) > 14 || Math.abs(p.y - y) > 12);
        const place = () => { let x, y; do { x = 12 + Math.random() * (W - 24) | 0; y = 34 + Math.random() * (sh - 46) | 0; } while (!free(x, y)); const p = { x, y }; spots.push(p); return p; };
        clues = pick.map(k => ({ k, v: cu[k], ...place(), got: false }));
        clutter = Array.from({ length: 9 + Math.min(6, cases) }, () => ({ ...place(), kind: Math.random() * 5 | 0, col: [C16[13], C16[8], C16[2], C16[4], C16[5]][Math.random() * 5 | 0] }));
        break;
      }
    }
    found = 0; time = Math.max(25, 50 - cases * 3); wrong = 0;
    banner = { txt: `CASE ${cases + 1}`, l: 1.4 };
  }
  const clueCol = c => c.k === 'hat' ? HATS[c.v] : c.k === 'hair' ? HAIR[c.v] : c.k === 'boots' ? BOOTS[c.v] : C16[7];

  function drawClue(c, k, v, x, y) {
    if (k === 'hat') { c.fillStyle = HATS[v]; c.fillRect(x - 3, y - 1, 3, 1); c.fillRect(x, y, 3, 1); c.fillRect(x + 2, y + 1, 2, 1); c.fillRect(x - 4, y - 2, 1, 1); }
    else if (k === 'glasses') { c.fillStyle = C16[0]; c.fillRect(x - 3, y - 3, 6, 6); c.fillStyle = C16[7]; c.fillRect(x - 2, y - 2, 4, 4); c.fillStyle = C16[1]; c.fillRect(x - 1, y - 1, 1, 1); }
    else if (k === 'hair') { c.fillStyle = HAIR[v]; for (let i = 0; i < 7; i++) c.fillRect(x - 3 + i, y + Math.round(Math.sin(i) * 1.5), 1, 1); }
    else { c.fillStyle = BOOTS[v]; c.fillRect(x - 2, y - 4, 4, 5); c.fillRect(x - 2, y + 2, 4, 2); c.fillStyle = '#00000040'; c.fillRect(x - 1, y - 3, 2, 1); }
  }
  function drawSuspect(c, s, x, y, k) {
    const dim = s.out;
    c.fillStyle = dim ? C16[13] : C16[8]; c.fillRect(x - 7, y + 14, 14, 16);            // coat
    c.fillStyle = dim ? C16[13] : BOOTS[s.boots]; c.fillRect(x - 6, y + 30, 5, 4); c.fillRect(x + 1, y + 30, 5, 4);
    c.fillStyle = dim ? C16[14] : s.skin; c.fillRect(x - 5, y + 2, 10, 11);           // head
    c.fillStyle = dim ? C16[13] : HAIR[s.hair]; c.fillRect(x - 6, y, 12, 4); c.fillRect(x - 6, y + 2, 2, 6); c.fillRect(x + 4, y + 2, 2, 6);
    if (s.hat) { c.fillStyle = dim ? C16[13] : HATS[s.hat]; c.fillRect(x - 5, y - 5, 10, 5); c.fillRect(x - 8, y - 1, 16, 2); }
    c.fillStyle = C16[0]; c.fillRect(x - 3, y + 6, 2, 2); c.fillRect(x + 1, y + 6, 2, 2); c.fillRect(x - 1, y + 10, 3, 1);
    if (s.glasses) { c.fillStyle = C16[0]; c.fillRect(x - 4, y + 5, 3, 4); c.fillRect(x + 1, y + 5, 3, 4); c.fillRect(x - 1, y + 6, 2, 1); c.fillStyle = dim ? C16[14] : C16[7]; c.fillRect(x - 3, y + 6, 1, 2); c.fillRect(x + 2, y + 6, 1, 2); }
    text(c, 'ABCD'[k], x, y + 36, { color: dim ? C16[13] : C16[1], align: 'center' });
  }

  return {
    reset() { score = 0; strikes = 0; cases = 0; t = 0; feel.clear(); newCase(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const n = banner.next; banner = null; if (n === 'over') return api.over(); if (n) newCase(); } return; }
      if (wrong > 0) wrong -= dt;
      time -= dt;
      if (time <= 5 && Math.floor(time + dt) !== Math.floor(time)) { sfx(880, .05, 'square', .03); haptic('tick'); }
      if (time <= 0) { strikes++; feel.lose(); banner = { txt: 'TIME UP', sub: `IT WAS ${'ABCD'[culprit]}`, l: 1.8, next: strikes >= 3 ? 'over' : 'case' }; cases++; }
    },
    draw(c) {
      const sh = sceneH(), ly = lineY();
      // the room
      c.fillStyle = '#e8d8b8'; c.fillRect(0, 0, W, sh);
      c.fillStyle = '#d8c098'; for (let x = 0; x < W; x += 12) c.fillRect(x, 0, 6, sh - 22);
      c.fillStyle = C16[11]; c.fillRect(0, sh - 22, W, 22); c.fillStyle = C16[12]; for (let x = 0; x < W; x += 16) c.fillRect(x, sh - 22, 1, 22);
      c.fillStyle = C16[12]; c.fillRect(10, 8, 30, 22); c.fillStyle = C16[7]; c.fillRect(12, 10, 26, 18); c.fillStyle = C16[1]; c.fillRect(24, 10, 2, 18);   // window
      c.fillStyle = C16[12]; c.fillRect(W - 40, 6, 26, 20); c.fillStyle = C16[4]; c.fillRect(W - 38, 8, 22, 16); c.fillStyle = C16[2]; c.fillRect(W - 30, 12, 6, 6);  // empty frame
      c.fillStyle = C16[0]; text(c, '?', W - 27, 13, { color: C16[0] });
      feel.begin(c);
      for (const k of clutter) {
        c.fillStyle = k.col;
        if (k.kind === 0) { c.fillRect(k.x - 3, k.y - 2, 6, 5); c.fillStyle = C16[1]; c.fillRect(k.x + 3, k.y - 1, 2, 2); }          // cup
        else if (k.kind === 1) { c.fillRect(k.x - 4, k.y - 2, 8, 4); c.fillStyle = C16[1]; c.fillRect(k.x - 3, k.y - 1, 6, 1); }    // book
        else if (k.kind === 2) { c.fillStyle = C16[1]; c.fillRect(k.x - 3, k.y - 3, 6, 6); c.fillStyle = C16[13]; c.fillRect(k.x - 2, k.y - 1, 4, 1); c.fillRect(k.x - 2, k.y + 1, 3, 1); }  // note
        else if (k.kind === 3) { c.fillRect(k.x - 1, k.y - 3, 3, 6); c.fillStyle = C16[6]; c.fillRect(k.x - 3, k.y - 4, 7, 2); }     // plant
        else { c.fillStyle = C16[13]; c.fillRect(k.x - 3, k.y, 7, 2); c.fillRect(k.x - 1, k.y - 3, 3, 3); }                            // key / spoon
      }
      for (const cl of clues) if (!cl.got) {
        drawClue(c, cl.k, cl.v, cl.x, cl.y);
        if (((t + cl.x * .1) % 4) < .15) { c.fillStyle = C16[1]; c.fillRect(cl.x + 3, cl.y - 5, 1, 3); c.fillRect(cl.x + 2, cl.y - 4, 3, 1); }
      }
      feel.end(c, W, H);
      // notebook strip
      c.fillStyle = C16[1]; c.fillRect(0, sh, W, 16); c.fillStyle = C16[13]; c.fillRect(0, sh + 15, W, 1);
      text(c, 'CLUES', 3, sh + 5, { color: C16[0] });
      clues.forEach((cl, i) => { const x = 40 + i * 20, y = sh + 8; c.fillStyle = C16[14]; c.fillRect(x - 6, y - 6, 13, 13); if (cl.got) drawClue(c, cl.k, cl.v, x, y); else text(c, '?', x - 1, y - 2, { color: C16[13] }); });
      const tx = W - 4; text(c, `${Math.max(0, Math.ceil(time))}S`, tx, sh + 5, { color: time < 6 ? C16[2] : C16[0], align: 'right' });
      // line-up
      c.fillStyle = C16[15]; c.fillRect(0, sh + 16, W, H - sh - 16);
      c.fillStyle = '#ffffff20'; for (let y = sh + 22; y < H; y += 8) c.fillRect(0, y, W, 1);
      for (let i = 0; i < 4; i++) drawSuspect(c, sus[i], Math.round(W / 8 + i * W / 4), ly + 6, i);
      for (let i = 0; i < strikes; i++) text(c, 'X', 4 + i * 7, H - 8, { color: C16[2] });
      if (banner) { c.fillStyle = '#000000a0'; c.fillRect(0, sh / 2 - 16, W, banner.sub ? 34 : 22); text(c, banner.txt, W / 2, sh / 2 - 10, { font: 'big', align: 'center', color: C16[4] }); if (banner.sub) text(c, banner.sub, W / 2, sh / 2 + 6, { align: 'center', color: C16[1] }); }
      else if (cases === 0 && t < 4) text(c, 'FIND CLUES, THEN PICK A SUSPECT', W / 2, sh - 9, { align: 'center', color: C16[1], outline: C16[0] });
    },
    down(x, y) {
      if (banner) return;
      const sh = sceneH();
      if (y < sh) {
        const cl = clues.find(cl => !cl.got && Math.abs(cl.x - x) < 9 && Math.abs(cl.y - y) < 9);
        if (cl) { cl.got = true; found++; feel.coin(cl.x, cl.y); feel.juice.pop(cl.x, cl.y - 8, cl.k.toUpperCase(), { color: C16[0] }); haptic('success'); }
        else { sfx(160, .05, 'square', .03); haptic('light'); time -= .5; }
        return;
      }
      if (y > sh + 16) {
        const i = Math.max(0, Math.min(3, Math.floor(x / (W / 4))));
        if (sus[i].out) return;
        if (found < 2) { feel.juice.pop(Math.round(W / 8 + i * W / 4), lineY() - 6, 'FIND 2 CLUES', { color: C16[4] }); haptic('warning'); return; }
        if (i === culprit) {
          const pts = 2 + (found < clues.length ? 1 : 0) + (time > 20 ? 1 : 0); score += pts; api.score(score); cases++;
          feel.win(Math.round(W / 8 + i * W / 4), lineY() + 10); notes('C5 E5 G5 C6', { len: .08 });
          banner = { txt: 'GOT THEM!', sub: `+${pts}${found < clues.length ? ' SHARP EYE' : ''}`, l: 1.5, next: 'case' };
        } else {
          sus[i].out = true; strikes++; feel.hurt(Math.round(W / 8 + i * W / 4), lineY() + 10); haptic('error');
          if (strikes >= 3) banner = { txt: 'CASE CLOSED', sub: `IT WAS ${'ABCD'[culprit]}`, l: 2, next: 'over' };
        }
      }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'puzzle-detective',
  title: 'Puzzle Detective',
  tag: 'Color · Mystery',
  retro: true, era: 'color', pal: 'lemon',
  w: 160, h: 192, maxW: 220, maxH: 240,
  goal: 12,
  hint: 'Tap the room to find the thief\'s clues, then tap the one suspect who matches them all. Three wrong calls and the case is closed.',
  make,
};
