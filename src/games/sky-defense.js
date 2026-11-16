// Sky Defense: storm imps ride rain clouds over a little village and drop sparks on the roofs. Drag to
// slide your water cannon along the wall; it fires on its own. A cloud you pop bursts into a shower
// straight down, which puts out any fire below it, so pop clouds over burning roofs. Sparks hurt you
// too (shoot them or dodge). A roof left burning burns down; lose three houses, or your three hearts,
// and it's over. Every fifth wave a thunderhead rolls in.
import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { clamp, rnd, pix } = gs.util;
const { PAL } = gs.palettes;
const { haptic } = gs.device;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { text } = gs.pixel;

const R = PAL.amber, W = 160, H = 160, PY = 122, ROOF = 134;   // R[0] darkest ... R[3] lightest
const IMP = [['.0..0.', '011110', '010010', '.0110.'], ['0....0', '011110', '010010', '.0110.']];
const CANNON = ['..00..', '..00..', '.0110.', '011110', '0.00.0'];
const HOUSES = [14, 46, 80, 114, 146];

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready({ eat: false, text: 'DRAG TO MOVE' });       // no clouds until the first touch
  const K = gs.tweak('Feel', {
    fire: [.34, .15, .8, 'seconds between shots'],
    slide: [16, 4, 30, 'how quickly the cannon follows your finger'],
    burn: [7, 3, 14, 'seconds a roof burns before the house is lost'],
    drop: [2.4, .8, 5, 'seconds between sparks from one cloud at the start'],
    spark: [42, 20, 90, 'how fast sparks fall'],
    hearts: [3, 1, 6, 1, 'hearts'],
    lost: [3, 1, 5, 1, 'houses lost before it is over'],
  });
  let cool, px, tx, clouds, shots, sparks, rain, houses, wave, toSpawn, spawnT, score, hearts, t, dead, hurtT;

  function startWave() {
    wave++; toSpawn = wave % 5 === 0 ? 0 : 3 + Math.min(6, wave); spawnT = .4;
    if (wave % 5 === 0) clouds.push({ x: -40, y: 20, w: 40, hp: 6 + wave, max: 6 + wave, vx: 9, drop: 1.5, big: true });
    feel.juice.pop(W / 2, 64, wave % 5 === 0 ? 'THUNDERHEAD' : `WAVE ${wave}`, { color: R[0], size: 8 });
  }
  function addCloud() {
    const dir = Math.random() < .5 ? 1 : -1, w = Math.random() < .3 ? 22 : 14;
    clouds.push({ x: dir > 0 ? -w : W + w, y: 16 + (Math.random() * 5 | 0) * 12, w, hp: w > 20 ? 2 : 1, max: w > 20 ? 2 : 1, vx: dir * rnd(14, 22 + wave * 2), drop: rnd(.6, K.drop) });
  }
  function shower(x, w, all) {
    rain.push({ x, w, t: 1.1 });
    for (const h of houses) if (h.burn > 0 && (all || Math.abs(h.x - x) < w / 2 + 8)) {
      h.burn = 0; score += 15; api.score(score); haptic('success'); sfx(500, .18, 'triangle', .04, 300);
      feel.juice.pop(h.x, ROOF - 10, '+15', { color: R[0], size: 6 });
    }
  }
  function hurt() {
    hearts--; hurtT = 1; haptic('error'); sfx(110, .4, 'sawtooth', .06, -50); feel.juice.shake(5).burst(px, PY, { n: 12, speed: 60, life: .5, size: 2, color: [R[0], R[1]] });
    if (hearts <= 0) api.over();
  }

  return {
    reset() {
      px = tx = W / 2; clouds = []; shots = []; sparks = []; rain = []; houses = HOUSES.map(x => ({ x, burn: 0, lost: false }));
      wave = 0; toSpawn = 0; spawnT = 0; score = 0; hearts = K.hearts; t = 0; dead = 0; hurtT = 0; cool = .2; feel.clear(); ready.reset(); startWave();
    },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; hurtT = Math.max(0, hurtT - dt);
      px += (tx - px) * Math.min(1, dt * K.slide); px = clamp(px, 6, W - 6);
      cool -= dt; if (cool <= 0) { cool = K.fire; shots.push({ x: px, y: PY - 4 }); sfx(1100, .03, 'square', .012, -500); }
      spawnT -= dt; if (toSpawn > 0 && spawnT <= 0) { addCloud(); toSpawn--; spawnT = rnd(.7, 1.5); }
      for (const cl of clouds) {
        cl.x += cl.vx * dt; if (cl.big && (cl.x > W - 30 || cl.x < 30)) cl.vx = -cl.vx;
        if (!cl.big && (cl.x < -30 || cl.x > W + 30)) cl.vx = -cl.vx, cl.y = Math.min(76, cl.y + 6);   // drifts back, a little lower
        cl.drop -= dt;
        if (cl.drop <= 0 && cl.x > 4 && cl.x < W - 4) {
          cl.drop = cl.big ? 1.2 : rnd(K.drop * .6, K.drop * 1.3) * Math.max(.5, 1 - wave * .04);
          for (const off of cl.big ? [-14, 0, 14] : [0]) sparks.push({ x: cl.x + off, y: cl.y + 6, vx: off * .4, v: K.spark + wave * 2 });
          sfx(300, .05, 'square', .015, 200);
        }
      }
      for (const s of shots) s.y -= 170 * dt;
      for (const s of sparks) { s.y += s.v * dt; s.x += s.vx * dt; }
      for (const r of rain) r.t -= dt;
      // shots hit clouds and sparks
      for (const s of shots) {
        for (const cl of clouds) if (!s.hit && cl.hp > 0 && Math.abs(s.x - cl.x) < cl.w / 2 + 1 && s.y > cl.y - 5 && s.y < cl.y + 5) {
          s.hit = true; cl.hp--; sfx(400, .04, 'square', .02);
          if (cl.hp <= 0) {
            const pts = cl.big ? 100 : cl.w > 20 ? 20 : 10; score += pts; api.score(score); haptic(cl.big ? 'heavy' : 'medium'); sfx(220, .15, 'sawtooth', .04, -80);
            feel.juice.burst(cl.x, cl.y, { n: cl.big ? 24 : 10, speed: 50, life: .5, size: 2, color: [R[1], R[2]] });
            shower(cl.x, cl.w + 6, cl.big);
          }
        }
        for (const sp of sparks) if (!s.hit && !sp.gone && Math.abs(s.x - sp.x) < 3 && Math.abs(s.y - sp.y) < 4) { s.hit = sp.gone = true; score += 2; api.score(score); sfx(900, .03, 'square', .015); }
      }
      // sparks hit the cannon or the roofs
      for (const sp of sparks) {
        if (sp.gone) continue;
        if (Math.abs(sp.x - px) < 5 && sp.y > PY - 3 && sp.y < PY + 4) { sp.gone = true; if (!hurtT) hurt(); if (hearts <= 0) return; continue; }
        if (sp.y > ROOF) {
          sp.gone = true; const h = houses.find(q => !q.lost && Math.abs(q.x - sp.x) < 12);
          if (h && !h.burn) { h.burn = .001; haptic('warning'); sfx(180, .2, 'sawtooth', .03, 60); }
          else feel.juice.burst(sp.x, ROOF + 4, { n: 4, speed: 30, life: .3, size: 1, color: [R[1]] });
        }
      }
      // fires: put out by rain, else the house is lost
      for (const h of houses) if (h.burn > 0 && !h.lost) {
        h.burn += dt; if (rain.some(r => Math.abs(r.x - h.x) < r.w / 2 + 8)) { h.burn = 0; continue; }
        if (h.burn > K.burn) { h.lost = true; h.burn = 0; haptic('error'); sfx(90, .6, 'sawtooth', .06, -30); feel.juice.shake(4).burst(h.x, ROOF, { n: 16, speed: 40, life: .7, size: 2, color: [R[0], R[1]] }); }
      }
      if (houses.filter(h => h.lost).length >= K.lost) return api.over();
      shots = shots.filter(s => !s.hit && s.y > -4); sparks = sparks.filter(s => !s.gone && s.y < H); rain = rain.filter(r => r.t > 0); clouds = clouds.filter(cl => cl.hp > 0);
      if (!toSpawn && !clouds.length) { score += 25; api.score(score); haptic('success'); sfx(700, .25, 'square', .04, 500); startWave(); }
    },
    fx(dt) { dead += dt; feel.update(dt); },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      // rain showers
      c.fillStyle = R[1]; for (const r of rain) for (let i = 0; i < r.w; i += 3) { const yy = (t * 140 + i * 17) % (ROOF - 20); c.fillRect(Math.round(r.x - r.w / 2 + i), Math.round(20 + yy), 1, 3); }
      // clouds with their imps
      for (const cl of clouds) {
        const x = Math.round(cl.x), y = Math.round(cl.y), hw = cl.w / 2 | 0;
        const puff = (col, o) => { c.fillStyle = col; c.fillRect(x - hw - o, y - 2 - o, cl.w + o * 2, 6 + o * 2); c.fillRect(x - hw + 2 - o, y - 5 - o, (cl.w >> 1) - 2 + o * 2, 3 + o); c.fillRect(x + 1 - o, y - 6 - o, (cl.w >> 1) - 4 + o * 2, 4 + o); c.fillRect(x - hw + 2 - o, y + 4, cl.w - 4 + o * 2, 2 + o); };
        puff(R[1], 1); puff(R[2], 0); c.fillStyle = R[3]; c.fillRect(x - hw + 3, y - 4, 3, 1); c.fillRect(x + 2, y - 5, 3, 1);
        if (cl.max > 1) { c.fillStyle = R[1]; c.fillRect(x - hw + 2, y + 1, Math.max(1, (cl.w - 4) * cl.hp / cl.max | 0), 1); }
        pix(c, IMP[(t * 4 | 0) % 2], x - 3, y - 11, { 0: R[0], 1: R[1] });
        if (cl.big) { c.fillStyle = R[1]; c.fillRect(x - hw, y - 2, cl.w, 2); if ((t * 6 | 0) % 5 === 0) { c.fillStyle = R[0]; c.fillRect(x - 6, y + 6, 1, 5); c.fillRect(x - 5, y + 10, 2, 1); } }
      }
      // sparks, shots
      c.fillStyle = R[0]; for (const s of sparks) { const x = Math.round(s.x), y = Math.round(s.y); c.fillRect(x, y, 2, 2); c.fillRect(x + ((y >> 1) % 2 ? -1 : 2), y - 2, 1, 2); }
      c.fillStyle = R[1]; for (const s of shots) c.fillRect(Math.round(s.x), Math.round(s.y), 1, 3);
      // the wall the cannon runs on, and the cannon
      c.fillStyle = R[1]; c.fillRect(0, PY + 5, W, 2);
      if ((!hurtT || (hurtT * 12 | 0) % 2) && (!dead || (dead * 10 | 0) % 2)) pix(c, CANNON, Math.round(px) - 3, PY - 1, { 0: R[0], 1: R[1] });
      // houses: roof, walls, a window; burning ones flicker, lost ones are rubble
      for (const h of houses) {
        const x = h.x - 9;
        if (h.lost) { c.fillStyle = R[1]; c.fillRect(x + 2, 150, 15, 6); c.fillRect(x + 5, 147, 6, 3); continue; }
        c.fillStyle = R[0]; c.fillRect(x, ROOF + 2, 18, 4); c.fillRect(x + 2, ROOF, 14, 2); c.fillRect(x + 5, ROOF - 2, 8, 2);
        c.fillStyle = R[2]; c.fillRect(x + 1, ROOF + 6, 16, 14); c.fillStyle = R[0]; c.fillRect(x + 7, ROOF + 12, 4, 8); c.fillRect(x + 3, ROOF + 9, 2, 2); c.fillRect(x + 13, ROOF + 9, 2, 2);
        if (h.burn > 0) {
          const f = (t * 10 | 0) % 2, hgt = 3 + Math.min(6, h.burn * 1.2 | 0);
          c.fillStyle = R[1]; c.fillRect(x + 3, ROOF - hgt, 3, hgt); c.fillRect(x + 8, ROOF - hgt - 2 + f, 3, hgt + 2 - f); c.fillRect(x + 13, ROOF - hgt + f, 3, hgt - f);
          c.fillStyle = R[0]; c.fillRect(x + 9, ROOF - hgt, 1, 2);
          c.fillStyle = R[0]; c.fillRect(x, ROOF + 21, Math.round(18 * (1 - h.burn / K.burn)), 1);   // how long until it's lost
        }
      }
      c.fillStyle = R[1]; c.fillRect(0, 155, W, 5);
      feel.end(c, W, H);
      for (let i = 0; i < K.hearts; i++) { c.fillStyle = i < hearts ? R[0] : R[2]; c.fillRect(3 + i * 7, 4, 5, 5); }
      text(c, `W${wave}`, W - 3, 3, { color: R[1], align: 'right' });
      ready.draw(c, W, H, { pixel: true, color: R[0], y: 92 });
    },
    down(x) { ready.go(); tx = x; }, move(x, y, p) { if (p) tx = x; },
    key(k, d) { if (!d) return; ready.go(); if (k === 'ArrowLeft') tx = px - 20; if (k === 'ArrowRight') tx = px + 20; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'sky-defense', title: 'Sky Defense', tag: 'Pocket · Shooter', retro: true, w: W, h: H, pal: 'amber', tick: 60,
  music: 'heroic',
  hint: 'Drag to slide your water cannon; it fires on its own. Storm imps drop sparks that set roofs alight: pop a cloud over a burning roof and its rain puts the fire out. Lose three houses or three hearts and it is over.',
  goal: 300,
  make,
};
