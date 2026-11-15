import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { faceDown, want, haptic } = gs.device;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;
const { text } = gs.pixel;

// Raid the cookie jar while the cook isn't looking. Keep the phone face up to grab cookies. When you
// hear and feel the cook turning round, lay the phone face DOWN to hide. A double buzz means the coast
// is clear. Without motion sensors: hold to grab, let go to hide.
const P = PAL.amber, W = 160, H = 160;

function make(api) {
  want('motion');
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  let state, timer, score, t, grab, holding, caught, warned, jar, crumbs;
  const flipMode = () => faceDown() !== null;
  const grabbing = () => flipMode() ? !faceDown() : holding;
  function next() {
    if (state === 'away') { state = 'turning'; timer = Math.max(.45, .9 - score * .015); haptic('warning'); sfx(300, .25, 'square', .05, -150); }
    else if (state === 'turning') { state = 'looking'; timer = 0.8 + Math.random() * 2.4; }
    else { state = 'away'; timer = 1.2 + Math.random() * 3; haptic('success'); sfx(700, .06, 'square', .04); sfx(900, .06, 'square', .04); }
  }
  return {
    reset() { state = 'away'; timer = 2; score = 0; t = 0; grab = 0; holding = false; caught = 0; warned = false; jar = 30; crumbs = []; feel.clear(); },
    update(dt) {
      feel.update(dt); t += dt; timer -= dt; for (const c of crumbs) { c.l -= dt; c.y += dt * 30; } crumbs = crumbs.filter(c => c.l > 0);
      if (caught) { caught += dt; return; }
      if (timer <= 0) next();
      if (grabbing()) {
        if (state === 'looking') { caught = .001; haptic('error'); sfx(110, .5, 'square', .06, -30); feel.juice.shake(6); return api.over(); }
        grab += dt;
        if (grab >= .45) { grab = 0; score++; jar--; api.score(score); haptic('tick'); sfx(500 + (score % 5) * 60, .04, 'square', .03); crumbs.push({ x: 70 + Math.random() * 20, y: 110, l: .6 }); if (jar <= 0) { jar = 30; } }
      } else grab = 0;
    },
    fx(dt) { caught += dt; feel.update(dt); },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = P[2]; c.fillRect(0, 118, W, 42); c.fillStyle = P[1]; c.fillRect(0, 118, W, 2);
      // cook at the stove (top right)
      const look = state === 'looking' || caught, turn = state === 'turning';
      c.fillStyle = P[1]; c.fillRect(100, 70, 50, 48);
      c.fillStyle = P[0]; c.fillRect(116, 36, 18, 34); c.fillStyle = P[3]; c.fillRect(114, 22, 22, 10); c.fillRect(118, 16, 14, 8);
      c.fillStyle = P[2]; c.fillRect(118, 32, 14, 12);
      if (look) { c.fillStyle = P[0]; c.fillRect(120, 36, 3, 3); c.fillRect(127, 36, 3, 3); c.fillRect(121, 41, 8, 1); }
      else if (turn) { c.fillStyle = P[0]; c.fillRect(129, 36, 3, 3); }
      else { c.fillStyle = P[1]; c.fillRect(118, 32, 14, 12); }
      if (look) { c.fillStyle = P[0]; c.font = '8px "Press Start 2P", monospace'; text(c, '!', 138, 22, { color: P[0], font: 'big' }); }
      // jar + hand
      c.fillStyle = P[1]; c.fillRect(58, 84, 40, 34); c.fillStyle = P[3]; c.fillRect(60, 90, 36, 26); c.fillStyle = P[1]; c.fillRect(56, 80, 44, 6);
      c.fillStyle = P[0]; for (let i = 0; i < Math.min(12, Math.ceil(jar / 2.5)); i++) c.fillRect(63 + (i % 4) * 8, 110 - (i / 4 | 0) * 7, 6, 5);
      if (grabbing() && !caught) { c.fillStyle = P[2]; c.fillRect(70, 56 + Math.sin(t * 20) * 2, 12, 30); c.fillStyle = P[1]; c.fillRect(68, 54, 16, 6); }
      for (const cr of crumbs) { c.fillStyle = P[0]; c.fillRect(cr.x, cr.y, 2, 2); }
      feel.end(c, W, H);
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = P[0];
      c.fillText(flipMode() ? 'UP:GRAB DOWN:HIDE' : 'HOLD:GRAB', 4, 10);
      if (state === 'turning') { c.fillText('HIDE!', 4, 148); }
      if (caught) { c.textAlign = 'center'; c.fillText('CAUGHT!', 80, 140); }
    },
    down() { holding = true; },
    up() { holding = false; },
    key(k, d) { if (k === ' ') holding = d; },
  };
}

export default {
  id: 'hide-peek', title: 'Cookie Thief', tag: 'Pocket · Motion', retro: true, w: W, h: H, pal: 'amber', goal: 30,
  hint: 'Keep the phone face up to grab cookies. When the cook turns (you will hear and feel it), lay the phone face down. A double buzz means it is safe. No motion sensor? Hold to grab.',
  make,
};
