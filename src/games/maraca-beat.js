// Maraca Beat: the band plays and beads roll along the track toward your maracas. Shake the phone just as
// a bead reaches the line (or tap, if you'd rather not shake). Hits fill the party meter; misses drain
// it. The tune speeds up as the party gets going. Let the meter empty and the band packs up.
import gs from '../gamescroll.js';
const { Ready } = gs.rounds;
const { Feel } = gs.effects;
const { C16 } = gs.palettes;
const { text } = gs.pixel;
const { haptic, onShake } = gs.device;
const { sfx, noise } = gs.sound;

let W = 160, H = 176;
const K = C16;

function make(api) {
  const ready = new Ready();   // the first shake or tap starts the round and does nothing else
  const feel = new Feel({ pixel: true });
  let beads, songT, nextBeat, bpm, energy, score, combo, t, shakes, lastHit, judge, jl, beatN, sway;
  const LINE = () => 40, SPEED = 70;
  const unShake = onShake(() => hit('shake'));

  function hit(how) {
    if (ready.go()) return;
    // the nearest bead to the line
    let best = null, bd = 1e9;
    for (const b of beads) if (!b.done) { const d = Math.abs(b.at - songT); if (d < bd) { bd = d; best = b; } }
    noise(.06, { vol: .05, from: 6000, to: 3000 }); haptic('light'); sway = 1;
    if (best && bd < .2) {
      best.done = true; combo++; const good = bd < .08;
      score += good ? 2 : 1; api.score(score); energy = Math.min(100, energy + (good ? 6 : 3));
      judge = good ? 'PERFECT' : 'GOOD'; jl = .5; if (how === 'shake') shakes++;
      if (combo % 10 === 0) feel.juice.pop(W / 2, 70, `${combo} COMBO`, { color: K[4] });
    } else { energy -= 9; combo = 0; judge = 'EARLY'; jl = .4; }
  }

  return {
    reset() { beads = []; songT = 0; nextBeat = 2; bpm = 96; energy = 60; score = 0; combo = 0; t = 0; shakes = 0; lastHit = 0; judge = ''; jl = 0; ready.reset(); beatN = 0; sway = 0; feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; jl = Math.max(0, jl - dt); sway = Math.max(0, sway - dt * 5);
      if (!ready.playing) return;
      songT += dt;
      const beat = 60 / bpm;
      // write the chart a few seconds ahead: mostly on the beat, some off-beats, some rests
      while (nextBeat < songT + 4) {
        const bar = beatN % 8, r = Math.random();
        if (!(bar === 7 && r < .5)) beads.push({ at: nextBeat, done: false, missed: false });
        if (beatN > 8 && r < .2 + Math.min(.25, songT / 300)) beads.push({ at: nextBeat + beat / 2, done: false, missed: false });
        nextBeat += beat; beatN++;
        if (beatN % 16 === 0) bpm = Math.min(150, bpm + 4);
      }
      // the band: kick on every beat, a bass note on the one
      const b0 = Math.floor((songT - dt) / beat), b1 = Math.floor(songT / beat);
      if (b1 > b0) { sfx(60, .12, 'sine', .07, -30); if (b1 % 4 === 0) sfx([110, 131, 98, 147][Math.floor(b1 / 4) % 4], .3, 'triangle', .04); }
      for (const b of beads) if (!b.done && !b.missed && songT - b.at > .2) { b.missed = true; energy -= 12; combo = 0; judge = 'MISS'; jl = .4; haptic('warning'); }
      beads = beads.filter(b => b.at > songT - 1);
      if (energy <= 0) { energy = 0; feel.lose(); unShake?.(); api.over(); }
    },
    draw(c) {
      c.fillStyle = K[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = K[4]; for (let i = 0; i < 10; i++) c.fillRect((i * 37 + Math.floor(t * 20)) % W, 14 + (i * 23) % 30, 3, 3);
      // the track: beads roll up from the bottom toward the line near the top
      const tx = Math.round(W / 2) - 10;
      c.fillStyle = K[12]; c.fillRect(tx, 30, 20, H - 30);
      c.fillStyle = K[1]; c.fillRect(tx - 6, LINE() - 1, 32, 3);
      feel.begin(c);
      for (const b of beads) {
        if (b.done) continue;
        const y = Math.round(LINE() + (b.at - songT) * SPEED); if (y > H + 6 || y < 20) continue;
        c.fillStyle = b.missed ? K[13] : K[10]; c.fillRect(tx + 4, y - 5, 12, 10); c.fillStyle = K[1]; c.fillRect(tx + 6, y - 3, 3, 3);
      }
      // maracas either side of the line, shaking when you do
      const sw = Math.round(sway * 4);
      for (const s of [-1, 1]) { const x = Math.round(W / 2 + s * 40) + sw * s; c.fillStyle = K[11]; c.fillRect(x - 1, LINE() + 8, 3, 18); c.fillStyle = s < 0 ? K[2] : K[5]; c.fillRect(x - 7, LINE() - 6, 14, 14); c.fillStyle = K[1]; c.fillRect(x - 4, LINE() - 3, 3, 3); }
      feel.end(c, W, H);
      // party meter
      c.fillStyle = K[0]; c.fillRect(6, H - 12, W - 12, 6); c.fillStyle = energy < 25 ? K[2] : K[5]; c.fillRect(7, H - 11, Math.round((W - 14) * energy / 100), 4);
      text(c, `${score}`, 4, 3, { color: K[0] });
      if (combo > 2) text(c, `x${combo}`, W - 4, 3, { align: 'right', color: K[0] });
      if (jl > 0) text(c, judge, W / 2, LINE() + 30, { align: 'center', color: judge === 'MISS' || judge === 'EARLY' ? K[2] : K[0] });
      if (!ready.playing) { text(c, 'SHAKE OR TAP', W / 2, 90, { font: 'big', align: 'center', color: K[0] }); text(c, 'AS BEADS HIT THE LINE', W / 2, 106, { align: 'center', color: K[0] }); text(c, 'TAP TO START', W / 2, 124, { align: 'center', color: K[12] }); }
    },
    down() { hit('tap'); },
    key(k, d) { if (d && (k === ' ' || k === 'Enter')) hit('tap'); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'maraca-beat',
  title: 'Maraca Beat',
  tag: 'Color · Rhythm',
  retro: true, era: 'color', pal: 'lemon',
  w: 160, h: 176, maxW: 220, maxH: 240,
  goal: 90,
  hint: 'Shake the phone (or tap) just as each bead reaches the line. Hits fill the party meter, misses drain it.',
  make,
};
