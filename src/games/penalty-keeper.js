import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { Brain } = gs.brains;
const { sounds } = gs.sound;

// You're in goal. The striker runs in from one side and shoots across to the other. Tap where the
// ball is going: the keeper takes a moment to get there, so reading the run-up early is what saves it.
// Shots get faster, and later strikers sometimes fake their angle. Three goals against and you're out.
// The striker is a Tiny Brains rival with a memory: for each shot it picks low, high, wide, a near-post
// poke or (after five saves) a fake, from how you keep goal (how early you dive, high or low, how far
// out). It feels each shot: a fingertip save or a goal by a hair is the exciting one, a dive that was
// never close is dull. Its memory keeps which shot made a close call for this keeper, and the win-rate
// rail keeps it fair (a gold glint over the striker means it is using what it remembered).
const W = 360, H = 640, GX = 30, GY = 400, GW = 300, GH = 150, REACH = 46, KEEPER_SPEED = 480;
const SHOTS = ['low', 'high', 'wide', 'near', 'fake'];

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready();                              // the striker waits for the first tap
  let saves, conceded, shot, keeper, phase, wait, msg, t, striker, net, glint;
  // how this keeper plays, kept across rounds: how early they dive (-1 late .. 1 before the kick), how high
  // (-1 top .. 1 ground) and how far out (-1 middle .. 1 post), each smoothed over the last few shots
  const habit = { early: 0, low: 0, out: 0 };
  // see: 0..2 the habits above, 3 how far into the round (saves), 4 goals let in so far
  const see = () => [habit.early, habit.low, habit.out, clamp(saves / 10, 0, 1) * 2 - 1, conceded - 1];
  const kicker = new Brain(api, {
    name: 'penalty-keeper-striker', inputs: 5, actions: SHOTS, memory: true, target: .75,
    // the teacher: go where this keeper isn't (high over a low diver, low under a high one, the post
    // past one who stays central), and fake an early diver
    teacher: s => s[0] > .35 ? 'fake' : s[1] > .3 ? 'high' : s[1] < -.3 ? 'low' : s[2] < -.2 ? 'wide' : 'near',
    limits: { react: .1, perSecond: 10, minNoise: .08 },
    rules: (s, a) => a === 'fake' && saves < 5 ? 'wide' : a,   // no fakes until five saves, as the hint says
  });
  function nextShot() {
    kicker.act(see(), 1);
    const kind = kicker.action, side = Math.random() < .5 ? -1 : 1, fake = kind === 'fake';
    glint = kicker.remembered ? 1.6 : 0;
    const off = kind === 'wide' ? rnd(GW / 2 - 40, GW / 2 - 18) : kind === 'near' ? rnd(40, 70) : rnd(62, GW / 2 - 18);
    const ty = kind === 'low' ? rnd(GY + GH - 30, GY + GH - 18) : kind === 'high' ? rnd(GY + 18, GY + 34) : rnd(GY + 20, GY + GH - 20);
    const tx = W / 2 + side * off;
    // The striker approaches from the opposite side to where they'll shoot (unless it's a fake).
    striker = { x: W / 2 - side * (fake ? -1 : 1) * 110, y: 120, run: 0 }; striker.x0 = striker.x;
    shot = { tx, ty, k: 0, dur: Math.max(.5, 1 - saves * .03) * (1.12 - .14 * kicker.skill), curve: rnd(-20, 20) * side };
    keeper = { x: W / 2, y: GY + GH - 50, tx: W / 2, ty: GY + GH - 50, dive: 0, at: null };
    phase = 'runup'; wait = rnd(1.1, 1.5);
  }
  // when in the shot the keeper went: before the kick counts as early (1), at the very end as late (-1)
  function dived() { keeper.at = phase === 'runup' ? 1 : 1 - 2 * clamp(shot.k / .7, 0, 1); }
  // the shot is over: what the striker learns, and how this keeper plays
  function learn(saved, hands) {
    if (keeper.at == null) kicker.feel(-.4);                          // no dive at all: nothing to it
    else if (saved) kicker.feel(hands > REACH * .55 ? 1 : .15);       // fingertips is the thrill; a clean catch less so
    else kicker.feel(hands < REACH * 1.8 ? .7 : -.4);                  // just past the gloves, or never close
    kicker.result(saved);
    if (keeper.at != null) {
      habit.early += (keeper.at - habit.early) * .3;
      habit.low += (clamp((keeper.ty - (GY + GH / 2 + 20)) / (GH / 2), -1, 1) - habit.low) * .3;
      habit.out += (clamp((Math.abs(keeper.tx - W / 2) - 70) / 70, -1, 1) - habit.out) * .3;
    }
  }
  return {
    _st: () => ({ phase, k: shot.k, tx: shot.tx, ty: shot.ty, dived: keeper.dive, strikerStartX: striker.x0 }),
    reset() { saves = 0; conceded = 0; msg = null; t = 0; net = 0; glint = 0; feel.clear(); ready.reset(); nextShot(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; if (msg) msg.life -= dt; net = Math.max(0, net - dt * 2); glint = Math.max(0, glint - dt);
      const k = keeper; const dx = k.tx - k.x, dy = k.ty - k.y, d = Math.hypot(dx, dy), step = KEEPER_SPEED * dt;
      if (d > step) { k.x += dx / d * step; k.y += dy / d * step; } else { k.x = k.tx; k.y = k.ty; }
      if (phase === 'runup') {
        wait -= dt; striker.run += dt; striker.x += (W / 2 - striker.x) * dt * 1.15; striker.y += (205 - striker.y) * dt * 1.15;
        if (wait <= 0) { phase = 'shot'; sfx(90, .1, 'triangle', .07); haptic('light'); }
      } else if (phase === 'shot') {
        shot.k += dt / shot.dur;
        if (shot.k >= 1) {
          const hands = Math.hypot(k.x - shot.tx, (k.y - 20) - shot.ty), saved = hands < REACH || Math.hypot(k.x - shot.tx, k.y + 20 - shot.ty) < REACH - 10;
          learn(saved, hands);
          if (saved) {
            saves++; api.score(saves); msg = { txt: hands < 22 ? 'CAUGHT!' : 'SAVED', life: 1, good: true }; haptic('success'); sfx(500, .12, 'triangle', .06, 200);
            feel.juice.burst(shot.tx, shot.ty, { n: hands < 22 ? 22 : 12, speed: 200, life: .45, size: 4, color: ['#ffd34a', '#ffffff', '#4ad3ff'] });
          } else {
            conceded++; net = 1; msg = { txt: 'GOAL', life: 1, good: false }; haptic('error'); sfx(150, .4, 'sawtooth', .04, -40);
            feel.juice.shake(7).flash('#ff5050', .2);
          }
          phase = 'after'; wait = .9;
        }
      } else if (phase === 'after') { wait -= dt; if (wait <= 0) { if (conceded >= 3) return api.over(); nextShot(); } }
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1d5c34'); g.addColorStop(1, '#2f8a4c'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = '#ffffff12'; for (let i = 0; i < 8; i++) c.fillRect(0, i * 80, W, 40);
      c.strokeStyle = '#ffffffaa'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 230); c.lineTo(W, 230); c.stroke(); c.beginPath(); c.arc(W / 2, 215, 3, 0, 7); c.fillStyle = '#fff'; c.fill();
      // striker (small, far away)
      const s = striker, legs = Math.sin(s.run * 18) * 4;
      c.fillStyle = '#ff5050'; c.fillRect(s.x - 6, s.y - 26, 12, 16); c.fillStyle = '#f2c79a'; c.beginPath(); c.arc(s.x, s.y - 31, 5, 0, 7); c.fill();
      c.strokeStyle = '#202040'; c.lineWidth = 3; c.beginPath(); c.moveTo(s.x - 3, s.y - 10); c.lineTo(s.x - 3 + legs, s.y); c.moveTo(s.x + 3, s.y - 10); c.lineTo(s.x + 3 - legs, s.y); c.stroke();
      if (glint > 0) {   // the striker remembers a shot that worked on you
        const a = Math.min(1, glint * 2), r = 4 + Math.sin(t * 14) * 1.5;
        c.globalAlpha = a; c.fillStyle = '#ffd34a'; c.beginPath();
        for (let i = 0; i < 8; i++) { const ang = i * Math.PI / 4, rr = i % 2 ? r * .4 : r; c.lineTo(s.x + 9 + Math.cos(ang) * rr, s.y - 42 + Math.sin(ang) * rr); }
        c.fill(); c.globalAlpha = 1;
      }
      // goal: net behind
      c.strokeStyle = '#ffffff40'; c.lineWidth = 1; const sway = net * 6 * Math.sin(t * 25);
      for (let x = GX; x <= GX + GW; x += 15) { c.beginPath(); c.moveTo(x, GY); c.lineTo(x + sway, GY + GH); c.stroke(); }
      for (let y = GY; y <= GY + GH; y += 15) { c.beginPath(); c.moveTo(GX, y + sway); c.lineTo(GX + GW, y + sway); c.stroke(); }
      c.strokeStyle = '#ffffff'; c.lineWidth = 7; c.beginPath(); c.moveTo(GX, GY + GH + 10); c.lineTo(GX, GY); c.lineTo(GX + GW, GY); c.lineTo(GX + GW, GY + GH + 10); c.stroke();
      // ball
      let bx = W / 2, by = 215, br = 5;
      if (phase !== 'runup') { const k = Math.min(1, shot.k); bx = W / 2 + (shot.tx - W / 2) * k + Math.sin(k * Math.PI) * shot.curve; by = 215 + (shot.ty - 215) * k - Math.sin(k * Math.PI) * 50; br = 5 + k * 13; }
      const ballBehind = phase === 'after' && msg && !msg.good;
      const drawBall = () => { c.fillStyle = '#fff'; c.beginPath(); c.arc(bx, by, br, 0, 7); c.fill(); c.fillStyle = '#222'; c.beginPath(); c.arc(bx + br * .2, by - br * .1, br * .35, 0, 7); c.fill(); };
      if (ballBehind) drawBall();
      // keeper (from behind, big)
      const k = keeper, lean = clamp((k.x - W / 2) / 110, -1, 1);
      c.save(); c.translate(k.x, k.y); c.rotate(lean * 1.1);
      c.fillStyle = '#ffd34a'; c.fillRect(-18, -30, 36, 46); c.fillStyle = '#202040'; c.fillRect(-16, 16, 32, 18);
      c.fillStyle = '#5a3a22'; c.beginPath(); c.arc(0, -42, 13, 0, 7); c.fill();
      c.strokeStyle = '#ffd34a'; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(-16, -24); c.lineTo(-36, -52); c.moveTo(16, -24); c.lineTo(36, -52); c.stroke();
      c.fillStyle = '#4ad3ff'; c.beginPath(); c.arc(-38, -56, 9, 0, 7); c.arc(38, -56, 9, 0, 7); c.fill(); c.lineCap = 'butt';
      c.restore();
      if (!ballBehind) drawBall();
      feel.end(c, W, H);
      c.font = '400 10px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = '#ffffffcc'; c.fillText('LET IN', 12, 22);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < conceded ? '#ff5050' : '#ffffff40'; c.beginPath(); c.arc(20 + i * 18, 38, 6, 0, 7); c.fill(); }
      ready.draw(c, W, H, { y: 330 });
      if (t < 4 && saves === 0) { c.fillStyle = '#ffffffcc'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('striker runs in from one side, shoots to the other', W / 2, H - 40); }
      if (msg && msg.life > 0) { c.globalAlpha = clamp(msg.life * 2, 0, 1); c.fillStyle = msg.good ? '#ffd34a' : '#ff6060'; c.font = '400 22px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(msg.txt, W / 2, 330); c.globalAlpha = 1; }
    },
    down(x, y) {
      if (ready.go() || phase === 'after' || keeper.dive) return;
      keeper.dive = 1; keeper.tx = clamp(x, GX + 10, GX + GW - 10); keeper.ty = clamp(y + 40, GY + 50, GY + GH + 10); dived();
      haptic('medium'); sfx(200, .08, 'triangle', .05, -60);
    },
    key(k, d) { if (!d || ready.go() || keeper.dive) return; const dir = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0; if (k === 'ArrowLeft' || k === 'ArrowRight' || k === ' ') { keeper.dive = 1; keeper.tx = W / 2 + dir * 110; keeper.ty = GY + GH - 40; dived(); } },
  };
}

export default {
  id: 'penalty-keeper', title: 'Penalty Keeper', tag: 'Casual · Sports', retro: false, w: W, h: H, goal: 8,
  hint: 'You are the keeper. The striker runs in from one side and shoots to the other. Tap where the ball is going to dive. One dive per shot; three goals and you are out.',
  make,
};
