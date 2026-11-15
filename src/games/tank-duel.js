import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;

// Turn-based artillery on a hill. Drag back from your tank to aim and set power, then let go.
// Mind the wind. Each enemy tank you hit brings a sharper one. Get hit once and it's over.
// A shell hits a tank it touches on the way (swept against the tank's body each step), not only where it lands.
const P = PAL.moss, W = 160, H = 160, G = 90, MAXP = 120;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  let ground, me, foe, shell, turn, wind, score, aim, boom, wait, foeErr, t;
  function terrain() {
    ground = new Float32Array(W); const a = rnd(0, 6), b = rnd(0, 6), hill = rnd(20, 50);
    for (let x = 0; x < W; x++) ground[x] = 128 - Math.sin(x / W * Math.PI) * hill - Math.sin(x / 13 + a) * 4 - Math.sin(x / 29 + b) * 7;
  }
  function newRound() {
    terrain(); me = { x: Math.round(rnd(12, 30)) }; foe = { x: Math.round(rnd(130, 148)) };
    wind = Math.round(rnd(-20, 20)); turn = 'me'; shell = null; boom = null; wait = 0; foeErr = Math.max(.04, .3 - score * .05);
  }
  const gy = x => ground[clamp(Math.round(x), 0, W - 1)];
  // A tank's body as the shell sees it: [left, top, right, bottom], a pixel round what's drawn (hull, turret).
  const box = tk => { const y = gy(tk.x); return [tk.x - 6, y - 9, tk.x + 6, y + 1]; };
  // Where the step from (x0, y0) to (x1, y1) first enters box b (0..1 along it), or -1: a shell can't skip through a tank in one step.
  function enters(x0, y0, x1, y1, b) {
    let t0 = 0, t1 = 1; const d = [x1 - x0, y1 - y0], p = [x0, y0];
    for (let k = 0; k < 2; k++) {
      const lo = b[k] - p[k], hi = b[k + 2] - p[k];
      if (Math.abs(d[k]) < 1e-9) { if (lo > 0 || hi < 0) return -1; continue; }
      let a = lo / d[k], z = hi / d[k]; if (a > z) [a, z] = [z, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, z); if (t0 > t1) return -1;
    }
    return t0;
  }
  const inside = (x, y, b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
  function fire(from, ang, pow, who) { shell = { x: from.x, y: gy(from.x) - 6, vx: Math.cos(ang) * pow, vy: -Math.sin(ang) * pow, who, trail: [], out: false }; sfx(200, .12, 'square', .05, -80); haptic('medium'); }
  // Fly a test shot and return where it lands, used by the enemy to aim.
  function landX(from, ang, pow) {
    let x = from.x, y = gy(from.x) - 6, vx = Math.cos(ang) * pow, vy = -Math.sin(ang) * pow;
    for (let i = 0; i < 600; i++) { vx += wind * .02; vy += G * .02; x += vx * .02; y += vy * .02; if (x < 0 || x >= W) return x; if (y >= gy(x)) return x; }
    return x;
  }
  // direct: the tank the shell struck ('me' or 'foe'), else it landed on the ground.
  function explode(x, y, direct) {
    boom = { x, y, l: .5 }; sfx(80, .4, 'square', .06, -30); haptic('heavy');
    feel.juice.shake(3).burst(x, y, { n: 10, speed: 60, arc: Math.PI, angle: -Math.PI / 2, life: .5, size: 2, gravity: 160, color: [P[1], P[0]] });
    // who's hit is decided before the crater lowers the ground under the tanks
    const near = tk => { const b = box(tk), dx = Math.max(b[0] - x, 0, x - b[2]), dy = Math.max(b[1] - y, 0, y - b[3]); return Math.hypot(dx, dy) < 4; };
    const hitFoe = direct === 'foe' || near(foe), hitMe = direct === 'me' || (!hitFoe && near(me));
    for (let i = -7; i <= 7; i++) { const xx = Math.round(x) + i; if (xx < 0 || xx >= W) continue; const d = Math.sqrt(49 - i * i); if (ground[xx] < y + d) ground[xx] = Math.min(150, Math.max(ground[xx], y + d)); }
    if (hitFoe) { score++; api.score(score); haptic('success'); wait = 1.2; turn = 'next'; feel.juice.burst(foe.x, y - 3, { n: 14, speed: 70, life: .6, size: 2, gravity: 120, color: [P[0], P[1]] }).pop(foe.x - 10, y - 16, 'HIT', { color: P[0], size: 8 }); return; }
    if (hitMe) { haptic('error'); turn = 'dead'; wait = .6; feel.juice.shake(5).burst(me.x, y - 3, { n: 14, speed: 70, life: .6, size: 2, gravity: 120, color: [P[0], P[1]] }); return; }
    turn = shell.who === 'me' ? 'foe' : 'me'; wait = turn === 'foe' ? .9 : 0;
  }
  return {
    reset() { score = 0; t = 0; aim = null; feel.clear(); newRound(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); t += dt; if (boom) { boom.l -= dt; if (boom.l <= 0) boom = null; }
      if (shell) {
        for (let s = 0; s < 3; s++) {
          const h = dt / 3, x0 = shell.x, y0 = shell.y; shell.vx += wind * h; shell.vy += G * h; shell.x += shell.vx * h; shell.y += shell.vy * h;
          // the tanks first (swept, so a fast shell can't pass through one); the shooter's own only once the shell has left it
          const own = shell.who === 'me' ? me : foe, other = own === me ? foe : me;
          let hit = null, ht = 2;
          for (const tk of shell.out ? [other, own] : [other]) { const k = enters(x0, y0, shell.x, shell.y, box(tk)); if (k >= 0 && k < ht) { ht = k; hit = tk; } }
          if (!shell.out && !inside(shell.x, shell.y, box(own))) shell.out = true;
          if (hit) { explode(x0 + (shell.x - x0) * ht, y0 + (shell.y - y0) * ht, hit === me ? 'me' : 'foe'); shell = null; return; }
          if (shell.x < -10 || shell.x > W + 10 || shell.y > H) { const who = shell.who; shell = null; turn = who === 'me' ? 'foe' : 'me'; wait = .9; return; }
          if (shell.x >= 0 && shell.x < W && shell.y >= gy(shell.x)) { const s2 = shell; explode(s2.x, s2.y); shell = null; return; }
        }
        if ((t * 30 | 0) % 2) shell.trail.push([shell.x, shell.y]);
        return;
      }
      if (wait > 0) { wait -= dt; if (wait > 0) return; }
      if (turn === 'dead') return api.over();
      if (turn === 'next') return newRound();
      if (turn === 'foe') {
        // Search for the power that lands on the player, then add a shrinking error.
        const ang = Math.PI - rnd(.6, 1.1); let best = 60, bd = 1e9;
        for (let p = 30; p <= MAXP; p += 2) { const d = Math.abs(landX(foe, ang, p) - me.x); if (d < bd) { bd = d; best = p; } }
        fire(foe, ang, best * (1 + rnd(-foeErr, foeErr)), 'foe'); turn = 'flying';
      }
    },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = P[2]; for (let x = 0; x < W; x++) c.fillRect(x, Math.round(ground[x]), 1, H - Math.round(ground[x]));
      c.fillStyle = P[1]; for (let x = 0; x < W; x++) c.fillRect(x, Math.round(ground[x]), 1, 2);
      const tank = (x, col, dir, ang) => {
        const y = Math.round(gy(x)); c.fillStyle = col; c.fillRect(x - 5, y - 4, 11, 4); c.fillRect(x - 3, y - 7, 7, 3);
        c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + Math.cos(ang) * 7, y - 6 - Math.sin(ang) * 7); c.stroke();
      };
      const myAng = aim ? Math.atan2(aim.dy, -aim.dx) : Math.PI / 4;
      tank(me.x, P[0], 1, myAng); tank(foe.x, P[1], -1, Math.PI * .75);
      if (aim && turn === 'me') {
        const pow = clamp(Math.hypot(aim.dx, aim.dy) * 1.6, 20, MAXP);
        let x = me.x, y = gy(me.x) - 6, vx = Math.cos(myAng) * pow, vy = -Math.sin(myAng) * pow;
        c.fillStyle = P[0]; for (let i = 0; i < 14; i++) { for (let k = 0; k < 4; k++) { vy += G * .015; x += vx * .015; y += vy * .015; } c.fillRect(Math.round(x), Math.round(y), 1, 1); }
        c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`PWR ${Math.round(pow / MAXP * 100)}`, 4, 20);
      }
      if (shell) { c.fillStyle = P[0]; for (const [x, y] of shell.trail.slice(-12)) c.fillRect(Math.round(x), Math.round(y), 1, 1); c.fillRect(Math.round(shell.x) - 1, Math.round(shell.y) - 1, 3, 3); }
      if (boom) { c.fillStyle = P[0]; c.globalAlpha = boom.l * 2; c.beginPath(); c.arc(boom.x, boom.y, 9 * (1 - boom.l), 0, 7); c.fill(); c.globalAlpha = 1; }
      feel.end(c, W, H);
      // wind gauge top-left, turn top-right
      c.fillStyle = P[0]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText('WIND', 4, 10);
      c.fillRect(32, 6, 1, 5); c.fillRect(32, 8, Math.round(wind / 2), 1); if (wind) c.fillRect(32 + Math.round(wind / 2) - (wind > 0 ? 1 : 0), 7, 1, 3);
      c.textAlign = 'right'; c.fillText(turn === 'me' ? 'YOUR SHOT' : turn === 'foe' || turn === 'flying' && shell?.who === 'foe' ? 'INCOMING' : '', W - 4, 10);
    },
    down(x, y) { if (turn !== 'me' || shell || wait > 0) return; aim = { x, y, dx: 0, dy: 0 }; },
    move(x, y) { if (aim) { const ox = aim.dx; aim.dx = x - aim.x; aim.dy = y - aim.y; if (Math.round(ox / 8) !== Math.round(aim.dx / 8)) haptic('tick'); } },
    up() {
      if (!aim) return; const a = aim; aim = null;
      if (Math.hypot(a.dx, a.dy) < 6 || turn !== 'me') return;
      // Slingshot: pull back and down-left to fire up-right.
      const ang = Math.atan2(a.dy, -a.dx), pow = clamp(Math.hypot(a.dx, a.dy) * 1.6, 20, MAXP);
      fire(me, ang, pow, 'me'); turn = 'flying';
    },
    key(k, d) { if (d && k === ' ' && turn === 'me' && !shell) { fire(me, Math.PI / 4, rnd(70, 100), 'me'); turn = 'flying'; } },
  };
}

export default {
  id: 'tank-duel', title: 'Tank Duel', tag: 'Pocket · Strategy', retro: true, w: W, h: H, pal: 'moss', goal: 3,
  hint: 'Drag back from your tank like a slingshot to aim, then let go to fire. Watch the wind. One hit on you ends the duel.',
  make,
};
