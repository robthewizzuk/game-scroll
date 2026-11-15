// Mud Pie Duel: you and Bramble the raccoon on opposite banks of a muddy stream, throwing mud pies.
// Bramble is a Tiny Brains rival with a memory (memory: true). For every throw it picks one of six: at
// you, where you're heading, just to your left or right, a high lob, or a fake. When the pie lands it
// feels how close a call that was for you: a near miss is the exciting one, a mile-wide miss is dull,
// and a splat counts for nothing. From that moment its memory knows which throw made a close call from
// which spot, for this player, and uses it next time (its eyes glint gold when it does). The win-rate
// rail keeps the duel fair: while you lose too much it looks for the calmest fair throw instead.
import gs from '../gamescroll.js';
const { Feel } = gs.effects, { Ready } = gs.rounds, { Brain } = gs.brains, { icon } = gs.icons, { font, use } = gs.fonts;
const { sounds } = gs.sound, { clamp, rnd } = gs.util, { mix } = gs.tick;

const W = 360, H = 640;
const RY = 190, PY = 566, LINE = 398;      // Bramble's feet, yours, and your bank's edge: tap above it to throw, drag below it to run
const X0 = 36, X1 = 324, RX0 = 52, RX1 = 308;
const BODY = 28, RBODY = 27;               // a pie landing nearer than this splats you (or Bramble)
const STOCK = 3, REFILL = .8, MINE_T = .6, WIND = .4, FAKE = .5, RECOVER = .34, LIVES = 3, RUN = 300;
const THROWS = ['at', 'lead', 'left', 'right', 'lob', 'fake'];
const sc = y => .86 + .14 * (y - RY) / (PY - RY);          // further up the field looks smaller
const ell = (c, x, y, rx, ry, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill(); };

function pie(c, x, y, r) {
  ell(c, x, y, r, r * .78, '#5a361c');
  ell(c, x, y - r * .12, r * .86, r * .62, '#87552d');
  ell(c, x - r * .3, y - r * .3, r * .28, r * .16, '#a8754a');
}

function make(api) {
  const feel = new Feel(), ready = new Ready({ text: '' });
  use('Bangers');
  let lastThrow = '';
  // Bramble: starts as the teacher (lead a runner, lob at someone standing still, trap someone at a wall)
  // and learns which throws give this player close calls where. see: 0 where you are across your bank,
  // 1 how fast you're running, 2 which way you usually dodge, 3 where Bramble is from you, 4 how long you've stood still
  const bramble = new Brain(api, {
    name: 'mud-pie-bramble', inputs: 5, actions: THROWS, memory: true,
    teacher: s => Math.abs(s[1]) > .45 ? 'lead' : s[4] > .3 ? 'lob' : s[0] > .72 ? 'left' : s[0] < -.72 ? 'right' : 'at',
    limits: { react: .1, perSecond: 10, minNoise: .06 },
    rules: (s, a) => a === 'fake' && lastThrow === 'fake' ? 'at' : a,   // never two fakes running
  });
  let px, ppx, tx, vx, still, habit, rx, prx, rtx, rstate, rt, rlen, throwIn, sinceAct, pies, splats, stock, refill;
  let score, lives, safe, t, glint, drip, hold, pending, wander, arm, keys, faceMud;

  const see = () => [clamp((px - W / 2) / 150, -1, 1), clamp(vx / 280, -1, 1), habit, clamp((rx - px) / 180, -1, 1), clamp(still / 1.5, 0, 1) * 2 - 1];
  const speedK = () => (1.12 - .2 * bramble.skill) * Math.max(.6, 1 - .022 * score);   // quicker as the duel goes on

  function decide() {
    bramble.act(see(), sinceAct); sinceAct = 0;
    pending = bramble.action; lastThrow = pending;
    glint = bramble.remembered ? 1 : 0;
    rstate = 'wind'; rt = rlen = WIND + (pending === 'fake' ? FAKE : 0);
    if (glint) sounds.twinkle();
  }
  function launch(kind) {
    const k = speedK(), lob = kind === 'lob';
    const T = (lob ? 1.3 : kind === 'fake' ? .72 : .86) * k;
    let to = px;
    if (kind === 'lead') to = px + vx * T * .9;
    else if (kind === 'left') to = px - 62;
    else if (kind === 'right') to = px + 62;
    else if (lob) to = px + vx * T * .45;
    pies.push({ mine: false, x0: rx + 14 * sc(RY), y0: RY, x1: clamp(to, X0 - 12, X1 + 12), y1: PY, hand: 74 * sc(RY), T, t: 0, pt: 0, h: lob ? 260 : 80, from: px });
    sounds.whoosh();
  }
  function throwAt(x) {
    if (stock <= 0) { sounds.deny(); return; }
    stock--; arm = .3;
    pies.push({ mine: true, x0: px + 22, y0: PY, x1: clamp(x, RX0 - 24, RX1 + 24), y1: RY, hand: 80, T: MINE_T, t: 0, pt: 0, h: 90 });
    sounds.swoosh();
  }
  function dodge(dt) {
    const react = .2 + (1 - bramble.skill) * .3, spd = 150 + 70 * bramble.skill;
    wander -= dt;
    if (wander <= 0) { wander = rnd(.8, 1.6); rtx = clamp(rx + rnd(-90, 90), RX0, RX1); }
    for (const p of pies) {
      if (!p.mine || p.t < react || Math.abs(p.x1 - rx) > RBODY + 18) continue;
      let to = p.x1 + (p.x1 > rx ? -80 : 80);
      if (to < RX0 || to > RX1) to = p.x1 + (p.x1 > rx ? 80 : -80);   // a wall in the way: the other side
      rtx = clamp(to, RX0, RX1);
    }
    rx += clamp(rtx - rx, -spd * dt, spd * dt);
  }
  function land(p) {
    if (p.mine) {
      if (Math.abs(p.x1 - rx) < RBODY && rstate !== 'splat') {
        score++; api.score(score);
        if (rstate === 'wind') feel.juice.pop(rx, RY - 112 * sc(RY), 'Caught it winding up!', { color: '#ffe36a' });
        rstate = 'splat'; rt = .75; pending = null; glint = 0; faceMud = 1;
        bramble.result(true);
        feel.hit(rx, RY - 55 * sc(RY), { color: '#87552d', power: .8 });
        feel.coin(rx, RY - 90 * sc(RY), { color: '#ffd23f', text: '+1' });
        sounds.squish();
      } else { splats.push({ x: p.x1, y: RY + 4, life: 3 }); sounds.plop(); }
      return;
    }
    const m = Math.abs(p.x1 - px) - BODY;
    habit += (Math.sign(px - p.from) - habit) * .3;
    splats.push({ x: p.x1, y: PY + 8, life: 3 });
    if (m < 0 && safe <= 0) {
      lives--; safe = 1; drip = 1.6;
      bramble.feel(-.1); bramble.result(false);    // a splat isn't what it's after: the close call is
      feel.hurt(px, PY - 40); sounds.squish();
      if (lives <= 0) { feel.lose(); api.over(); }
      return;
    }
    bramble.feel(m < 0 ? 0 : m < 20 ? 1 : m < 55 ? .35 : -.4);
    if (m >= 0 && m < 20) { feel.juice.pop(px, PY - 96, 'Close!', { color: '#ffffff' }); feel.juice.shake(2); }
    sounds.plop();
  }

  function drawBramble(c, x, y) {
    const s = sc(y), u = rstate === 'wind' ? 1 - rt / rlen : 0, fakeUp = pending === 'fake' && rlen - rt > WIND && rlen - rt < WIND + .14;
    c.save(); c.translate(x, y); c.scale(s, s);
    ell(c, 0, 2, 30, 8, '#00000030');
    // tail: grey and black rings, wagging
    c.save(); c.translate(-18, -18); c.rotate(-.9 + Math.sin(t * 5) * .2);
    for (let i = 0; i < 5; i++) ell(c, 0, -i * 9, 9 - i * .6, 6, i % 2 ? '#2e2a2a' : '#8d8f94');
    c.restore();
    ell(c, -9, -4, 8, 6, '#3a3636'); ell(c, 9, -4, 8, 6, '#3a3636');            // feet
    ell(c, 0, -30, 22, 26, '#8d8f94'); ell(c, 0, -26, 13, 17, '#c9cbd0');          // body, belly
    // throwing arm: back behind the head in the wind-up, forward after a throw, a little twitch on a fake
    const back = rstate === 'wind' && !fakeUp ? Math.min(1, u * 2.5) : 0, fwd = rstate === 'recover' || fakeUp ? 1 : 0;
    const ax = 20 - back * 6 + fwd * 4, ay = -40 - back * 34 + fwd * 14;
    c.strokeStyle = '#6f7176'; c.lineWidth = 8; c.lineCap = 'round';
    c.beginPath(); c.moveTo(14, -40); c.lineTo(ax, ay); c.stroke();
    if (rstate !== 'recover' && rstate !== 'splat') pie(c, ax + 2, ay - 6, 10);
    c.beginPath(); c.moveTo(-14, -40); c.lineTo(-22, -26); c.stroke();
    // head
    c.fillStyle = '#8d8f94';
    for (const e of [-1, 1]) { c.beginPath(); c.moveTo(e * 8, -80); c.lineTo(e * 17, -95); c.lineTo(e * 19, -74); c.fill(); }
    ell(c, 0, -68, 19, 16, '#8d8f94'); ell(c, 0, -62, 10, 7, '#e8e9ec');
    c.fillStyle = '#2e2a2a'; c.beginPath(); c.ellipse(0, -71, 18, 6, 0, 0, 7); c.fill();       // the mask
    const gold = glint > 0 && rstate === 'wind';
    for (const e of [-1, 1]) {
      ell(c, e * 7, -71, 4, 4, gold ? '#ffd23f' : '#ffffff');
      ell(c, e * 7 + (px - x) / 120, -71, 1.8, 1.8, '#1a1616');
    }
    ell(c, 0, -63, 3, 2.2, '#1a1616');
    if (faceMud > 0) { c.globalAlpha = Math.min(1, faceMud * 2); ell(c, 2, -68, 15, 11, '#6b4022'); ell(c, -8, -58, 5, 7, '#6b4022'); c.globalAlpha = 1; }
    if (rstate === 'splat') for (let i = 0; i < 3; i++) { const a = t * 7 + i * 2.1; icon(c, 'flat-star', Math.cos(a) * 20, -98 + Math.sin(a) * 5, 9, { color: '#ffd23f' }); }
    if (gold) {
      icon(c, 'sparkles', 24, -92, 14, { color: '#ffd23f' });
      c.fillStyle = '#ffd23f'; c.font = font('Bangers', 26); c.textAlign = 'center'; c.fillText('!', -24, -86);
    }
    c.restore();
  }
  function drawKid(c, x, y) {
    if (safe > 0 && (safe * 12 | 0) % 2) return;
    c.save(); c.translate(x, y);
    ell(c, 0, 3, 26, 8, '#00000033');
    c.fillStyle = '#2f6b3a'; c.beginPath(); c.roundRect(-15, -14, 12, 16, 4); c.roundRect(3, -14, 12, 16, 4); c.fill();   // boots
    c.fillStyle = '#f2c230'; c.beginPath(); c.roundRect(-20, -54, 40, 44, 14); c.fill();                                // raincoat
    c.fillStyle = '#d9a91c'; c.fillRect(-1, -52, 2, 40);
    // the throwing arm: up with a pie while there's one ready, flung forward just after a throw
    c.strokeStyle = '#f2c230'; c.lineWidth = 9; c.lineCap = 'round';
    const up = arm > 0 ? 1 - arm / .3 : 0, hx = 22 + up * 2, hy = arm > 0 ? -70 - up * 14 : -44;
    c.beginPath(); c.moveTo(16, -46); c.lineTo(hx, hy); c.stroke();
    if (arm <= 0 && stock > 0) pie(c, hx + 2, hy - 2, 9);
    c.beginPath(); c.moveTo(-16, -46); c.lineTo(-22, -30); c.stroke();
    ell(c, 0, -66, 17, 16, '#f2c230'); ell(c, 0, -64, 12, 11, '#d9a91c');   // the hood from behind
    if (drip > 0) { c.globalAlpha = Math.min(1, drip); ell(c, -3, -70, 13, 9, '#6b4022'); ell(c, 7, -54, 4, 9, '#6b4022'); ell(c, -10, -48, 3, 7, '#6b4022'); c.globalAlpha = 1; }
    c.restore();
  }

  return {
    reset() {
      px = ppx = tx = W / 2; vx = 0; still = 0; habit = 0;
      rx = prx = rtx = W / 2; rstate = 'idle'; rt = 0; rlen = 1; throwIn = 1.5; sinceAct = 1;
      pies = []; splats = []; stock = STOCK; refill = 0; score = 0; lives = LIVES; safe = 0; t = 0;
      lastThrow = ''; glint = 0; drip = 0; hold = null; pending = null; wander = 0; arm = 0; keys = { l: false, r: false }; faceMud = 0;
      feel.clear(); ready.reset();
    },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      ppx = px; prx = rx; for (const p of pies) p.pt = p.t;
      if (!ready.update(dt)) return;
      t += dt; sinceAct += dt; safe -= dt; arm -= dt;
      drip = Math.max(0, drip - dt * .7); faceMud = Math.max(0, faceMud - dt * .6);
      // you
      if (keys.l !== keys.r) tx = keys.l ? X0 : X1;
      const nx = px + clamp(tx - px, -RUN * dt, RUN * dt); vx = (nx - px) / dt; px = nx;
      still = Math.abs(vx) < 20 ? still + dt : 0;
      if (stock < STOCK) { refill += dt; if (refill >= REFILL) { stock++; refill = 0; } } else refill = 0;
      // Bramble
      rt -= dt;
      if (rstate === 'idle') { throwIn -= dt; dodge(dt); if (throwIn <= 0) decide(); }
      else if (rstate === 'wind') { if (rt <= 0) { launch(pending); rstate = 'recover'; rt = RECOVER; } }
      else if (rt <= 0) { rstate = 'idle'; throwIn = rnd(.9, 1.6) * speedK(); glint = 0; }
      // pies in the air, and the mud they leave
      for (const p of pies) { p.t += dt; if (p.t >= p.T) land(p); }
      pies = pies.filter(p => p.t < p.T);
      for (const m of splats) m.life -= dt;
      splats = splats.filter(m => m.life > 0);
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, 132); g.addColorStop(0, '#8fd0f5'); g.addColorStop(1, '#dff3ff');
      c.fillStyle = g; c.fillRect(0, 0, W, 132);
      feel.begin(c);
      c.fillStyle = '#3f8a3a'; c.fillRect(0, 118, W, 40);
      for (let i = 0; i < 10; i++) ell(c, i * 40 + 10, 122, 26, 18, i % 2 ? '#3f8a3a' : '#4a9a42');   // the hedge
      c.fillStyle = '#7cc35a'; c.fillRect(0, 150, W, 140);                                               // Bramble's bank
      c.fillStyle = '#7a4f2c'; c.fillRect(0, 290, W, LINE - 290);                                       // the stream of mud
      c.strokeStyle = '#94643a'; c.lineWidth = 3;
      for (let r = 0; r < 4; r++) { c.beginPath(); for (let x = 0; x <= W; x += 12) c.lineTo(x, 306 + r * 24 + Math.sin(x / 30 + t * 2 + r) * 3); c.stroke(); }
      c.fillStyle = '#8fd16a'; c.fillRect(0, LINE, W, H - LINE);                                       // your bank, mown in stripes
      c.fillStyle = '#86c962'; for (let i = 0; i < 6; i++) c.fillRect(i * 60, LINE, 30, H - LINE);
      c.fillStyle = '#5f9e46'; c.fillRect(0, LINE - 4, W, 8); c.fillRect(0, 286, W, 6);
      for (const m of splats) { const s = sc(m.y); c.globalAlpha = Math.min(1, m.life); ell(c, m.x, m.y, 18 * s, 6 * s, '#5a361c'); ell(c, m.x + 12 * s, m.y + 3 * s, 4 * s, 2 * s, '#5a361c'); }
      c.globalAlpha = 1;
      // each pie: where it is over the ground (its shadow) and how high above it
      const at = p => { const u = Math.min(1, mix(p.pt, p.t) / p.T); return [p.x0 + (p.x1 - p.x0) * u, p.y0 + (p.y1 - p.y0) * u, p.hand * (1 - u) + p.h * 4 * u * (1 - u), u]; };
      for (const p of pies) { const [x, y, , u] = at(p), s = sc(y); c.globalAlpha = p.mine ? .22 : .12 + .3 * u; ell(c, x, y, 13 * s, 5 * s, '#000000'); }
      c.globalAlpha = 1;
      drawBramble(c, mix(prx, rx), RY);
      for (const p of pies) { const [x, y, lift] = at(p); pie(c, x, y - lift * sc(y), 11 * sc(y) * (1 + lift / 600)); }
      drawKid(c, mix(ppx, px), PY);
      feel.end(c, W, H);
      // HUD at the bottom (the app's score badge is top centre): pies ready, splats left
      for (let i = 0; i < STOCK; i++) { c.globalAlpha = i < stock ? 1 : .25; pie(c, 24 + i * 26, H - 22, 9); }
      c.globalAlpha = 1;
      for (let i = 0; i < LIVES; i++) icon(c, 'hearts', W - 22 - i * 26, H - 22, 18, { color: i < lives ? '#ff5a6e' : '#00000030' });
      if (!ready.playing || ready.since < 1.5) {
        c.globalAlpha = ready.playing ? 1 - ready.since / 1.5 : 1;
        c.fillStyle = '#ffffff'; c.font = font('Bangers', 24); c.textAlign = 'center';
        c.fillText('TAP UP HERE TO THROW', W / 2, 352);
        c.fillText('DRAG DOWN HERE TO DODGE', W / 2, 470);
        c.globalAlpha = 1;
      }
    },
    down(x, y, id) {
      if (ready.go()) return;
      if (y < LINE) throwAt(x); else { hold = id; tx = clamp(x, X0, X1); }
    },
    move(x, y, pressed, id) { if (pressed && id === hold) tx = clamp(x, X0, X1); },
    up(x, y, id) { if (id === hold) hold = null; },
    key(k, isDown) {
      if (isDown && ready.go()) return;
      if (k === 'ArrowLeft' || k === 'a') { keys.l = isDown; if (!isDown) tx = px; }
      else if (k === 'ArrowRight' || k === 'd') { keys.r = isDown; if (!isDown) tx = px; }
      else if (isDown && (k === ' ' || k === 'ArrowUp' || k === 'w')) throwAt(rx);
    },
    debug(c) {
      c.strokeStyle = '#0f8'; c.strokeRect(px - BODY, PY - 10, BODY * 2, 20); c.strokeRect(rx - RBODY, RY - 10, RBODY * 2, 20);
      c.beginPath(); c.moveTo(0, LINE); c.lineTo(W, LINE); c.stroke();
      c.fillStyle = '#0f8'; c.font = '12px monospace'; c.textAlign = 'left';
      c.fillText(`skill ${bramble.skill.toFixed(2)} last ${lastThrow}${bramble.remembered ? ' (remembered)' : ''}`, 8, 300);
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'mud-pie-duel',
  title: 'Mud Pie Duel',
  tag: 'Casual · Duel',
  retro: false,
  w: W, h: H,
  tick: 60,
  music: 'silly',
  goal: 10,
  hint: 'Drag along your bank to dodge Bramble\'s mud pies and tap its side of the stream to throw yours, best while it winds up. Gold eyes mean it remembers a throw that nearly got you. Three splats and you are out.',
  creator: 'Claude',
  make,
};
