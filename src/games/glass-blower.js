// Glass Blower: a glowing gather of molten glass turns on the blowpipe. A ghost outline shows the vase
// to make. Hold a finger at a height on the glass to puff that band (and its neighbours) outward. The
// glass cools from orange to grey and stops shaping; puff past the outline and it cracks. When it cools
// (or you tap DONE) the vase scores its match. A crack, or a vase under the rising pass mark, costs one of 3 lives.
import gs from '../gamescroll.js';
const { Feel } = gs.effects, { Ready } = gs.rounds;
const { sfx, sounds, notes, bed, noise } = gs.sound, { haptic } = gs.device, { clamp, rnd } = gs.util;

// Fluid height: the vase keeps its size (fair at every height) and slides down into the extra room; the bench and
// its HUD stay on the bottom edge.
const W = 360, N = 26, BH = 380 / N, CX = W / 2;
let H = 640, TOP = 150, BOT = 530;
const DONE = { x: 248, y: 574, w: 96, h: 52 };
function layout(h) { H = h; TOP = 150 + Math.round((h - 640) * .7); BOT = TOP + 380; DONE.y = h - 66; }
const HOT = [255, 196, 90], WARM = [236, 96, 36], COOL = [118, 136, 150];
const mixc = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const heatCol = h => h > .5 ? mixc(WARM, HOT, (h - .5) * 2) : mixc(COOL, WARM, h * 2);
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const by = i => TOP + (i + .5) * BH;

function make(api) {
  const feel = new Feel(), ready = new Ready();
  let r, r0, tgt, heat, coolT, vase, lives, score, phase, showT, hold, spin, crackAt, last, hiss, t, curY;

  function profile() {                                   // a vase: a few control radii eased together
    const k = 4 + (Math.random() * 3 | 0), pts = [rnd(16, 30)];
    for (let i = 1; i < k; i++) pts.push(i === k - 1 ? rnd(28, 60) : rnd(34, 118));
    return Array.from({ length: N }, (_, i) => {
      const f = (i + .5) / N * (k - 1), a = Math.min(k - 2, f | 0), u = f - a, e = (1 - Math.cos(u * Math.PI)) / 2;
      return pts[a] + (pts[a + 1] - pts[a]) * e;
    });
  }
  function newVase() {
    vase++; phase = 'shape'; heat = 1; crackAt = -1; last = null;
    coolT = Math.max(2.6, 8 - vase * .5);
    r0 = Array.from({ length: N }, (_, i) => 10 + 16 * Math.sin(Math.PI * (i + .5) / N) ** .7);
    r = r0.slice(); tgt = profile().map((v, i) => Math.max(v, r0[i] + 12));
  }
  const pass = () => Math.min(80, 36 + vase * 4);
  const matchOf = () => {
    let err = 0, span = 0; for (let i = 0; i < N; i++) { err += Math.abs(r[i] - tgt[i]); span += tgt[i] - r0[i]; }
    return clamp(1 - err / Math.max(1, span), 0, 1);
  };
  function finish() {
    if (phase !== 'shape') return;
    phase = 'show'; showT = 1.7; hold = null;
    const pts = crackAt >= 0 ? 0 : Math.round(matchOf() * 100); last = pts;
    if (crackAt < 0 && pts >= pass()) {
      score += pts; api.score(score);
      feel.coin(CX, TOP + 60, { color: '#ffd27a', text: pts + '%', pitch: .8 + pts / 200 });
      notes(pts >= 85 ? 'C5 E5 G5 C6' : pts >= 65 ? 'C5 E5 G5' : 'C5 E5', { len: .07 });
      haptic(pts >= 85 ? 'success' : 'medium');
      if (pts >= 85) feel.juice.burst(CX, (TOP + BOT) / 2, { n: 30, speed: 220, life: .7, size: 3, color: ['#ffffff', '#ffe08a', '#9fd8ff'] });
      return;
    }
    lives--; feel.hurt(CX, (TOP + BOT) / 2);
    if (crackAt < 0) { sounds.sad(); feel.juice.pop(CX, TOP + 60, `UNDER ${pass()}%`, { color: '#ff9a7a', size: 22 }); }
    if (lives <= 0) { feel.lose(); phase = 'end'; api.over(); }
  }
  function crack(i) {
    crackAt = i; sounds.shatter(); haptic('error'); feel.juice.shake(8);
    feel.juice.burst(CX, by(i), { n: 40, speed: 260, life: .8, size: 3, color: ['#e8f4ff', '#9fc4d8', rgb(heatCol(heat))] });
    feel.juice.pop(CX, by(i) - 30, 'CRACK!', { color: '#ff6b5a', size: 28 });
    finish();
  }
  function outline(c, rad, k = 1) {                       // the mirrored profile as one smooth path
    const L = rad.map((v, i) => [CX - v * k, by(i)]), R = rad.map((v, i) => [CX + v * k, by(i)]).reverse();
    c.beginPath(); c.moveTo(CX - rad[0] * k * .8, TOP - 4);
    for (let i = 0; i < N - 1; i++) c.quadraticCurveTo(L[i][0], L[i][1], (L[i][0] + L[i + 1][0]) / 2, (L[i][1] + L[i + 1][1]) / 2);
    const b = rad[N - 1] * k;
    c.lineTo(L[N - 1][0], L[N - 1][1]); c.bezierCurveTo(CX - b, BOT + b * .35, CX + b, BOT + b * .35, R[0][0], R[0][1]);
    for (let i = 0; i < N - 1; i++) c.quadraticCurveTo(R[i][0], R[i][1], (R[i][0] + R[i + 1][0]) / 2, (R[i][1] + R[i + 1][1]) / 2);
    c.lineTo(CX + rad[0] * k * .8, TOP - 4); c.closePath();
  }

  return {
    resize(w, h) {
      const top0 = TOP; layout(h); const d = TOP - top0;
      if (curY != null) curY += d; if (hold) hold.y += d;
    },
    reset() { hiss?.stop(); hiss = null; vase = 0; lives = 3; score = 0; hold = null; spin = 0; t = 0; curY = (TOP + BOT) / 2; newVase(); feel.clear(); ready.reset(); },
    update(dt) {
      feel.update(dt); t += dt; spin += dt * (2 + heat * 4);
      if (!hiss) hiss = bed({ vol: 0, from: 2600, filter: 'highpass' });
      const puffing = phase === 'shape' && hold && heat > 0 && ready.playing;
      hiss.set({ vol: puffing ? .02 + heat * .04 : 0, from: 1800 + heat * 1600 }, .08);
      if (feel.frozen || !ready.update(dt)) return;
      if (phase === 'show') { showT -= dt; if (showT <= 0) newVase(); return; }
      if (phase !== 'shape') return;
      heat = Math.max(0, heat - dt / coolT);
      if (puffing) {
        const b = (hold.y - TOP) / BH - .5, rate = 78 * Math.sqrt(heat);
        for (let j = 0; j < N; j++) {
          const w = Math.exp(-((j - b) ** 2) / 5.2); r[j] += rate * w * dt;
          if (r[j] > tgt[j] + 5) { crack(j); return; }
        }
        if (Math.random() < dt * 10) haptic('tick');
        if (Math.random() < dt * 3) noise(.12, { vol: .025, from: 400, filter: 'lowpass' });
      }
      if (heat <= 0) { sfx(180, .2, 'sine', .04, -60); finish(); }
    },
    fx(dt) { feel.update(dt); spin += dt * 2; hiss?.set({ vol: 0 }, .1); },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1c100c'); g.addColorStop(1, '#2e1610'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      const hc = heatCol(heat), mid = (TOP + BOT) / 2;
      const glow = c.createRadialGradient(CX, mid, 20, CX, mid, 260); glow.addColorStop(0, rgb(hc, .25 * heat + .04)); glow.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = glow; c.fillRect(0, 0, W, H);
      c.fillStyle = '#3a2219'; c.fillRect(0, H - 92, W, 92);              // the bench
      feel.begin(c);
      const pg = c.createLinearGradient(CX - 6, 0, CX + 6, 0); pg.addColorStop(0, '#4a5560'); pg.addColorStop(.5, '#c9d2da'); pg.addColorStop(1, '#4a5560');
      c.fillStyle = pg; c.fillRect(CX - 5, 0, 10, TOP + 6);                 // the blowpipe
      for (let i = 0; i < 4; i++) { const yy = ((i * 34 + spin * 30) % 136); c.fillStyle = '#2a3036'; c.fillRect(CX - 5, yy, 10, 2); }
      c.save(); c.setLineDash([6, 6]); c.lineWidth = 2; c.strokeStyle = 'rgba(200,235,255,.55)'; outline(c, tgt); c.stroke(); c.restore();
      if (crackAt < 0 || phase !== 'show' || (t * 8 | 0) % 2) {
        c.save(); c.shadowColor = rgb(hc, .9); c.shadowBlur = 40 * heat;
        const bg = c.createLinearGradient(CX - 120, 0, CX + 120, 0);
        bg.addColorStop(0, rgb(mixc(hc, [40, 20, 10], .45))); bg.addColorStop(.5, rgb(mixc(hc, [255, 250, 220], .3 * heat))); bg.addColorStop(1, rgb(mixc(hc, [40, 20, 10], .45)));
        c.fillStyle = bg; outline(c, r); c.fill(); c.restore();
        c.save(); outline(c, r); c.clip();                                  // spinning highlights, front bright, back faint
        for (const off of [0, Math.PI]) {
          const s = Math.sin(spin + off), front = Math.cos(spin + off) > 0;
          c.strokeStyle = `rgba(255,255,240,${(front ? .45 : .12) * (.4 + heat * .6)})`; c.lineWidth = front ? 7 : 4; c.lineCap = 'round';
          c.beginPath(); for (let i = 0; i < N; i++) c.lineTo(CX + r[i] * s * .78, by(i)); c.stroke();
        }
        const core = c.createRadialGradient(CX, mid, 4, CX, mid, 90); core.addColorStop(0, `rgba(255,255,220,${.35 * heat})`); core.addColorStop(1, 'rgba(255,255,220,0)');
        c.fillStyle = core; c.fillRect(0, TOP, W, BOT - TOP + 40); c.restore();
        if (crackAt >= 0) { c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); let x = CX - r[crackAt] * .6, y = by(crackAt); c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += 14; y += (k % 2 ? -1 : 1) * 12; c.lineTo(x, y); } c.stroke(); }
      }
      if (hold && phase === 'shape' && ready.playing) {                     // the puff marker
        const b = clamp(Math.round((hold.y - TOP) / BH - .5), 0, N - 1), rr = r[b];
        c.strokeStyle = `rgba(255,240,200,${.5 + Math.sin(t * 20) * .2})`; c.lineWidth = 3;
        for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(CX + sd * (rr + 10), by(b)); c.lineTo(CX + sd * (rr + 26), by(b)); c.stroke(); }
      }
      feel.end(c, W, H);
      // HUD: live match under the app's score badge; heat, lives and DONE on the bench
      const sa = api.scoreArea(), m = phase === 'shape' ? Math.round(matchOf() * 100) : last;
      const hy = Math.max(36, sa.bottom + 24);
      c.fillStyle = 'rgba(20,10,7,.82)'; c.beginPath(); c.roundRect(CX - 92, hy - 21, 184, 47, 14); c.fill();   // backing pill over the blowpipe
      c.textAlign = 'center'; c.fillStyle = '#ffe9c9'; c.font = '700 18px Rubik, sans-serif';
      c.fillText(phase === 'show' ? (crackAt >= 0 ? 'CRACKED' : `${m}% MATCH`) : `match ${m}%`, CX, hy);
      c.font = '500 13px Rubik, sans-serif'; c.fillStyle = '#c9a58f'; c.fillText(`vase ${vase} · pass ${pass()}%`, CX, hy + 18);
      c.textAlign = 'left'; c.fillStyle = '#c9a58f'; c.font = '700 12px Rubik, sans-serif'; c.fillText('HEAT', 18, H - 52);
      c.fillStyle = '#1a0d09'; c.fillRect(56, H - 62, 176, 12); c.fillStyle = rgb(hc); c.fillRect(57, H - 61, 174 * heat, 10);
      for (let i = 0; i < 3; i++) {
        const x = 30 + i * 34, y = H - 26; c.fillStyle = i < lives ? '#ffb15a' : '#4a2c22';
        c.beginPath(); c.moveTo(x - 5, y - 12); c.lineTo(x + 5, y - 12); c.quadraticCurveTo(x + 14, y + 4, x + 6, y + 10); c.lineTo(x - 6, y + 10); c.quadraticCurveTo(x - 14, y + 4, x - 5, y - 12); c.fill();
      }
      const on = phase === 'shape';
      c.fillStyle = on ? '#ffb15a' : '#5a3a2c'; c.beginPath(); c.roundRect(DONE.x, DONE.y, DONE.w, DONE.h, 14); c.fill();
      c.fillStyle = '#2b140c'; c.font = '800 18px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('DONE', DONE.x + DONE.w / 2, DONE.y + 33);
      ready.draw(c, W, H, { text: 'Hold on the glass to blow', y: H * .5, color: '#fff3df' });
    },
    down(x, y) {
      if (ready.go()) return;
      if (x >= DONE.x && x <= DONE.x + DONE.w && y >= DONE.y - 6 && y <= DONE.y + DONE.h + 6) { sounds.click(); return finish(); }
      if (y > TOP - 30 && y < BOT + 30) hold = { y };
    },
    move(x, y, pr) { if (pr && hold) hold.y = clamp(y, TOP, BOT); },
    up() { hold = null; },
    key(k, d) {
      if (k === ' ') { if (d) { if (ready.go()) return; hold = { y: curY }; } else hold = null; }
      if (d && (k === 'ArrowUp' || k === 'ArrowDown')) { curY = clamp(curY + (k === 'ArrowUp' ? -BH : BH), TOP, BOT); if (hold) hold.y = curY; }
      if (d && k === 'Enter') finish();
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'glass-blower', title: 'Glass Blower', tag: 'Casual · Craft', retro: false, w: W, h: 640, maxH: 800, tick: 60, music: 'calm',
  goal: 300,
  hint: 'Hold a finger at a height on the glowing glass to puff it out to the dotted vase before it cools. Past the line it cracks; under the pass mark it slumps.',
  creator: 'Noctizzle',
  make,
};
