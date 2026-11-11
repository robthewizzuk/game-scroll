// Fold & Punch: a square of paper, four cells by four. The card shows where the holes must end up on
// the open sheet. Fold it (up to twice) with the arrows round the edge, punch through every layer, then
// unfold and watch the holes fan out. Match the card exactly; three wrong sheets and the round is over.
import gs from '../gamescroll.js';
const { C16 } = gs.palettes, { Feel } = gs.effects, { Ready } = gs.rounds, { text } = gs.pixel;
const { sounds, sfx } = gs.sound, { haptic } = gs.device, { ease } = gs.juice;

const W = 160, H = 176, N = 4, CS = 20, SX = 40, SY = 62, FOLD_T = .32;
const FRONT = C16[4], BACK = C16[1], INK = C16[0], DESK = C16[6];
// the fold buttons: which half moves, where the button sits, the arrow's direction
const BTN = { L: [4, 92, 30, 20, '>'], R: [126, 92, 30, 20, '<'], T: [65, 42, 30, 16, 'v'], B: [65, 144, 30, 16, '^'] };

function newSheet() {
  const cells = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) cells.push({ ox: x, oy: y, x, y, z: 0, flip: false, hole: false });
  return { cells, r: { x: 0, y: 0, w: N, h: N } };
}
const copy = s => ({ cells: s.cells.map(c => ({ ...c })), r: { ...s.r } });
const canFold = (s, d) => (d === 'L' || d === 'R') ? s.r.w > 1 : s.r.h > 1;
// which cells move in a fold, and the fold line (in cells)
function moving(s, d, c) {
  const { x, y, w, h } = s.r;
  return d === 'L' ? c.x < x + w / 2 : d === 'R' ? c.x >= x + w / 2 : d === 'T' ? c.y < y + h / 2 : c.y >= y + h / 2;
}
function fold(s, d) {
  const { x, y, w, h } = s.r, top = Math.max(...s.cells.map(c => c.z));
  for (const c of s.cells) if (moving(s, d, c)) {
    if (d === 'L' || d === 'R') c.x = 2 * x + w - 1 - c.x; else c.y = 2 * y + h - 1 - c.y;
    c.flip = !c.flip; c.z = top + 1 + (top - c.z);   // the moving stack turns over onto the top
  }
  if (d === 'L') s.r = { x: x + w / 2, y, w: w / 2, h }; else if (d === 'R') s.r = { x, y, w: w / 2, h };
  else if (d === 'T') s.r = { x, y: y + h / 2, w, h: h / 2 }; else s.r = { x, y, w, h: h / 2 };
}
const punch = (s, px, py) => { for (const c of s.cells) if (c.x === px && c.y === py) c.hole = true; };
const pattern = s => { const out = new Array(N * N).fill(false); for (const c of s.cells) if (c.hole) out[c.oy * N + c.ox] = true; return out; };

function make(api) {
  const feel = new Feel({ pixel: true }), ready = new Ready({ eat: false, text: 'TAP AN ARROW TO FOLD' });
  let sheet, history, folds, punches, target, card, strikes, score, time, t, anim, result, msg;

  function newCard() {
    const nf = card < 1 ? 1 : 2, np = card < 4 ? 1 : 2;
    let s;
    do {
      s = newSheet();
      for (let i = 0; i < nf; i++) { const ok = 'LRTB'.split('').filter(d => canFold(s, d)); fold(s, ok[Math.random() * ok.length | 0]); }
      const spots = []; for (let y = 0; y < s.r.h; y++) for (let x = 0; x < s.r.w; x++) spots.push([s.r.x + x, s.r.y + y]);
      for (let i = 0; i < np; i++) { const [px, py] = spots.splice(Math.random() * spots.length | 0, 1)[0]; punch(s, px, py); }
    } while (target && pattern(s).join() === target.join());
    target = pattern(s);
    sheet = newSheet(); history = []; folds = 0; punches = []; anim = null; result = null;
  }
  // the top layer at each spot of the folded sheet
  function tops(s) {
    const m = new Map();
    for (const c of s.cells) { const k = c.y * N + c.x, o = m.get(k); if (!o || c.z > o.z) m.set(k, c); }
    return m;
  }
  function doFold(d) {
    if (anim || result || punches.length || folds >= 2 || !canFold(sheet, d)) { sfx(160, .08, 'square', .04); return; }
    history.push({ before: copy(sheet), d }); fold(sheet, d); folds++;
    anim = { kind: 'fold', k: 0, step: history.length - 1 };
    sounds.swoosh(1.1); haptic('light');
  }
  function unfold() {
    if (anim || result) return;
    if (!punches.length) { if (folds) { anim = { kind: 'flat', k: 0, step: history.length - 1 }; sounds.swoosh(.8); } return; }
    // holes go through to every layer; play the folds back in reverse
    if (!history.length) { judge(); return; }
    const holes = pattern(sheet);
    for (const h of history) for (const c of h.before.cells) c.hole = holes[c.oy * N + c.ox];
    anim = { kind: 'open', k: 0, step: history.length - 1 }; sounds.whoosh(1);
  }
  function judge() {
    const got = pattern(sheet), ok = got.every((v, i) => v === target[i]);
    result = { ok, got, k: 0 };
    if (ok) {
      const pts = 1 + (card >= 4 ? 1 : 0); score += pts; api.score(score); time += 8;
      feel.win(SX + 40, SY + 40); feel.score(SX + 40, SY + 30, pts, { color: FRONT }); haptic('success');
    } else { strikes++; feel.hurt(); sounds.buzzer(); if (strikes >= 3) { feel.lose(); result.end = true; } }
  }

  // draw one sheet state; a fold in motion shows its moving half turning about the fold line
  function drawSheet(c, s, f, p) {
    const top = tops(s), mv = f ? s.cells.filter(cl => moving(s, f.d, cl)) : [];
    const still = f ? tops({ cells: s.cells.filter(cl => !moving(s, f.d, cl)) }) : top;
    c.fillStyle = '#00000040'; c.fillRect(SX + s.r.x * CS + 2, SY + s.r.y * CS + 2, s.r.w * CS, s.r.h * CS);
    for (const cl of still.values()) cell(c, SX + cl.x * CS, SY + cl.y * CS, CS, CS, cl.flip, cl.hole);
    if (!f) return;
    const k = Math.cos(Math.PI * ease.inOutSine(p)), horiz = f.d === 'L' || f.d === 'R';
    const line = horiz ? s.r.x + s.r.w / 2 : s.r.y + s.r.h / 2;
    const mt = tops({ cells: mv });
    for (const cl of mt.values()) {
      const flip = k < 0 ? !cl.flip : cl.flip;
      if (horiz) {
        const a = line + (cl.x - line) * k, b = line + (cl.x + 1 - line) * k, x0 = Math.min(a, b), x1 = Math.max(a, b);
        cell(c, Math.round(SX + x0 * CS), SY + cl.y * CS, Math.max(1, Math.round((x1 - x0) * CS)), CS, flip, cl.hole);
      } else {
        const a = line + (cl.y - line) * k, b = line + (cl.y + 1 - line) * k, y0 = Math.min(a, b), y1 = Math.max(a, b);
        cell(c, SX + cl.x * CS, Math.round(SY + y0 * CS), CS, Math.max(1, Math.round((y1 - y0) * CS)), flip, cl.hole);
      }
    }
  }
  function cell(c, x, y, w, h, flip, hole) {
    c.fillStyle = flip ? BACK : FRONT; c.fillRect(x, y, w, h);
    c.fillStyle = flip ? C16[14] : C16[3]; c.fillRect(x, y + h - 1, w, 1); c.fillRect(x + w - 1, y, 1, h);
    if (hole && w > 8 && h > 8) { const cx = x + w / 2 | 0, cy = y + h / 2 | 0; c.fillStyle = DESK; c.fillRect(cx - 4, cy - 3, 8, 6); c.fillRect(cx - 3, cy - 4, 6, 8); }
  }

  return {
    reset() { strikes = 0; score = 0; time = 75; t = 0; card = 0; target = null; msg = 0; newCard(); feel.clear(); ready.reset(); },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      if (!ready.update(dt)) return;
      t += dt;
      if (anim) {
        anim.k += dt / FOLD_T;
        if (anim.k >= 1) {
          if (anim.kind === 'fold') anim = null;
          else if (anim.step > 0) { anim.step--; anim.k = 0; sfx(500 + anim.step * 120, .05, 'triangle', .04); }
          else { sheet = history.length ? history[0].before : sheet; history = []; folds = 0; const kind = anim.kind; anim = null; if (kind === 'open') judge(); }
        }
      }
      if (result) {
        result.k += dt;
        if (result.k > 1.3) { if (result.end) { api.over(); result = null; return; } if (result.ok) { card++; newCard(); } else { sheet = newSheet(); history = []; folds = 0; punches = []; result = null; } }
        return;
      }
      time -= dt;
      if (time <= 0) { time = 0; feel.lose(); api.over(); }
    },
    draw(c) {
      c.fillStyle = DESK; c.fillRect(0, 0, W, H);
      c.fillStyle = C16[15]; for (let y = 18; y < H; y += 8) c.fillRect(0, y, W, 1);
      // the target card
      c.fillStyle = C16[1]; c.fillRect(3, 14, 34, 40); c.fillStyle = INK; c.fillRect(3, 53, 34, 1);
      text(c, 'MAKE', 20, 16, { align: 'center', color: INK });
      for (let i = 0; i < N * N; i++) { const x = 6 + (i % N) * 7, y = 24 + (i / N | 0) * 7; c.fillStyle = target[i] ? INK : FRONT; c.fillRect(x, y, 6, 6); }
      feel.begin(c);
      if (anim && anim.kind !== 'fold') { const h = history[anim.step]; drawSheet(c, h.before, h, 1 - anim.k); }
      else if (anim) { const h = history[anim.step]; drawSheet(c, h.before, h, anim.k); }
      else drawSheet(c, sheet, null, 0);
      if (result) {
        for (let i = 0; i < N * N; i++) {
          if (result.got[i] === target[i]) continue;
          const x = SX + (i % N) * CS, y = SY + (i / N | 0) * CS;
          c.fillStyle = (result.k * 6 | 0) % 2 ? C16[2] : C16[1];
          if (target[i]) { c.fillRect(x + 4, y + 4, 12, 2); c.fillRect(x + 4, y + 14, 12, 2); c.fillRect(x + 4, y + 4, 2, 12); c.fillRect(x + 14, y + 4, 2, 12); }
          else { for (let j = 0; j < 10; j++) { c.fillRect(x + 5 + j, y + 5 + j, 2, 2); c.fillRect(x + 14 - j, y + 5 + j, 2, 2); } }
        }
      }
      feel.end(c, W, H);
      // the fold arrows, while folding is still allowed
      const live = !anim && !result && !punches.length && folds < 2;
      for (const [d, [x, y, w, h, a]] of Object.entries(BTN)) {
        const on = live && canFold(sheet, d);
        c.fillStyle = on ? C16[8] : C16[15]; c.fillRect(x, y, w, h);
        c.fillStyle = on ? C16[7] : C16[6]; c.fillRect(x, y, w, 2);
        text(c, a, x + w / 2, y + h / 2 - 4, { font: 'big', align: 'center', color: on ? C16[1] : C16[13] });
      }
      // the unfold button
      const can = !anim && !result && (punches.length || folds);
      c.fillStyle = can ? (punches.length ? C16[2] : C16[11]) : C16[15]; c.fillRect(100, 14, 57, 18);
      text(c, punches.length ? 'UNFOLD' : 'FLATTEN', 128, 20, { align: 'center', color: can ? C16[1] : C16[13] });
      text(c, `FOLDS ${2 - folds}  HOLES ${2 - punches.length}`, W / 2, 166, { align: 'center', color: C16[1] });
      text(c, 'X'.repeat(strikes) + '.'.repeat(3 - strikes), 3, 3, { color: C16[2] });
      text(c, `${Math.ceil(time)}S`, W - 3, 3, { align: 'right', color: time < 10 ? C16[2] : C16[4] });
      if (result) text(c, result.ok ? 'MATCH!' : 'NOPE', W / 2, 36, { font: 'big', align: 'center', color: result.ok ? C16[4] : C16[2], outline: INK });
      else if (card === 0 && !anim) text(c, folds ? 'TAP THE PAPER TO PUNCH' : 'FOLD WITH AN ARROW', 98, 37, { align: 'center', color: C16[1] });
      ready.draw(c, W, H, { pixel: true, color: C16[1], y: 160 });
    },
    down(x, y) {
      if (!sheet) return;
      ready.go();
      if (anim || result) return;
      for (const [d, [bx, by, w, h]] of Object.entries(BTN)) if (x >= bx - 2 && x < bx + w + 2 && y >= by - 2 && y < by + h + 2) { doFold(d); return; }
      if (x >= 98 && y >= 12 && y < 34) { unfold(); return; }
      const px = Math.floor((x - SX) / CS), py = Math.floor((y - SY) / CS), r = sheet.r;
      if (px < r.x || px >= r.x + r.w || py < r.y || py >= r.y + r.h) return;
      const i = punches.findIndex(([a, b]) => a === px && b === py);
      if (i >= 0) { punches.splice(i, 1); for (const cl of sheet.cells) if (cl.x === px && cl.y === py) cl.hole = false; sounds.pop(.8); return; }
      if (punches.length >= 2) { sfx(160, .08, 'square', .04); return; }
      punches.push([px, py]); punch(sheet, px, py);
      feel.hit(SX + px * CS + 10, SY + py * CS + 10, { color: FRONT, power: .3 }); sounds.punch(1.2);
    },
    key(k, d) {
      if (!d || !sheet) return; ready.go();
      const f = { ArrowRight: 'L', ArrowLeft: 'R', ArrowDown: 'T', ArrowUp: 'B' }[k];
      if (f) doFold(f); else if (k === ' ' || k === 'Enter') unfold();
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'fold-punch',
  title: 'Fold & Punch',
  tag: 'Color · Brain',
  retro: true, era: 'color', pal: 'lemon',
  w: W, h: H,
  tick: 60,
  music: 'puzzle',
  goal: 8,
  hint: 'Tap the arrows to fold the paper, tap it to punch through every layer, then UNFOLD to match the card. Three misses and it is over.',
  creator: 'Noctizzle',
  make,
};
