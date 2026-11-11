// Pin Picker: a cutaway lock. Slide the pick under a pin and push up. Only one pin binds at a time (a hidden
// order): lift the binding pin to the shear line and it sets with a click; the others just spring back; lift the
// binding one past the line and it oversets, dropping every set pin. Set them all and the plug turns.
import gs from '../gamescroll.js';
const { PAL } = gs.palettes;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { text } = gs.pixel;
const { sounds } = gs.sound;
const { haptic } = gs.device;
const { clamp } = gs.util;

const R = PAL.moss;
const W = 160, H = 160;
const TOP = 22, SHEAR = 62, REST = 86, DRV = 14, L = 14, RR = 146;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });
  const ready = new Ready({ eat: false });
  let pins, order, k, tol, lockN, time, maxTime, phase, openT, pickX, lift, held, keyUp, keyX, lx, ly, dwell, capped, score, msg, ml, t;

  function newLock() {
    lockN++; phase = 'pick'; openT = 0; dwell = 0; lift = 0; k = 0; capped = false;
    const n = lockN < 3 ? 4 : 5;
    tol = Math.max(1.2, 3.2 - lockN * .3);
    maxTime = time = Math.max(16, 32 - lockN * 2);
    pins = []; for (let i = 0; i < n; i++) pins.push({ x: Math.round(80 + (i - (n - 1) / 2) * 22), gap: 5 + (Math.random() * 10 | 0), lift: 0, set: false });
    order = pins.map((_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [order[i], order[j]] = [order[j], order[i]]; }
  }
  const under = () => pins.findIndex(p => Math.abs(p.x - pickX) <= 4);
  const binding = () => order[k];
  const say = (m, s = 1) => { msg = m; ml = s; };

  function setPin(i) {
    const p = pins[i]; p.set = true; k++; dwell = 0;
    sounds.click(1.2); haptic('tick');
    feel.juice.burst(p.x, SHEAR, { n: 6, speed: 40, life: .3, size: 1, color: [R[0], R[3]] });
    if (k >= pins.length) {
      phase = 'open'; openT = 0; lift = 0; score++; api.score(score); say('OPEN!', 1.1);
      sounds.unlock(); haptic('success');
      feel.juice.burst(80, 79, { n: 24, speed: 90, life: .6, size: 2, color: [R[0], R[3]] }).shake(2);
    }
  }
  function overset(i) {
    for (const p of pins) p.set = false;
    k = 0; lift = 0; dwell = 0; say('OVERSET', 1);
    sounds.clang(.8); haptic('error');
    feel.juice.shake(4).burst(pins[i].x, SHEAR, { n: 10, speed: 70, life: .4, size: 2, color: [R[0], R[1]] });
  }

  return {
    reset() { lockN = 0; score = 0; t = 0; pickX = 24; held = false; keyUp = false; keyX = 0; lx = ly = 0; msg = ''; ml = 0; feel.clear(); ready.reset(); newLock(); },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      if (!ready.update(dt)) return;
      t += dt; if (ml > 0) ml -= dt;
      if (phase === 'open') { openT += dt; for (const p of pins) p.lift = Math.max(0, p.lift - 80 * dt); if (openT > 1.1) newLock(); return; }
      time -= dt;
      if (time <= 0) { time = 0; feel.juice.shake(5); sounds.buzzer(); haptic('error'); return api.over(); }
      pickX = clamp(pickX + keyX * 60 * dt, 20, RR - 6);
      if (keyUp) lift += 18 * dt;
      if (!held && !keyUp) lift = Math.max(0, lift - 140 * dt);
      const u = under(), b = binding();
      if (u < 0) { lift = Math.min(lift, 2); capped = false; }
      else {
        const p = pins[u];
        const cap = p.set ? p.gap : u === b ? p.gap + 14 : p.gap + 12;
        if (lift >= cap) { lift = cap; if (!capped && !p.set) { sounds.tock(); haptic('light'); } capped = true; } else capped = false;
        if (u === b && !p.set) {
          const inBand = Math.abs(lift - p.gap) <= tol;
          if (lift > p.gap + tol) overset(u);
          else if (inBand) { dwell += dt; if (dwell >= .14) setPin(u); }
          else dwell = 0;
        }
      }
      for (let i = 0; i < pins.length; i++) { const p = pins[i]; if (i === under() && lift > 0) p.lift = Math.min(lift, p.set ? p.gap : 99); else p.lift = Math.max(0, p.lift - 120 * dt); }
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      const open = phase === 'open', turn = open ? Math.min(1, openT / .5) : 0;
      // lock body, plug, keyway
      c.fillStyle = R[1]; c.fillRect(L, TOP - 4, RR - L, 104 - TOP);
      c.fillStyle = R[0]; c.fillRect(L, TOP - 4, RR - L, 1); c.fillRect(L, 99, RR - L, 1);
      const ph = Math.round((96 - SHEAR) * (1 - turn * .55)), py = SHEAR + Math.round((96 - SHEAR - ph) / 2);
      c.fillStyle = R[2]; c.fillRect(L + 4, py, RR - L - 8, ph);
      if (open) { c.fillStyle = R[1]; for (let x = L + 4 + Math.round(openT * 40) % 8; x < RR - 4; x += 8) c.fillRect(x, py, 2, ph); }
      else { c.fillStyle = R[3]; c.fillRect(L + 4, 84, RR - L - 8, 9); }
      // shear line
      c.fillStyle = R[0]; for (let x = L + 1; x < RR - 1; x += 2) c.fillRect(x, SHEAR - 1, 1, 1);
      // pins
      const b = binding();
      for (let i = 0; i < pins.length; i++) {
        const p = pins[i], lf = Math.round(p.lift), x = p.x;
        c.fillStyle = R[3]; c.fillRect(x - 3, TOP, 7, SHEAR - TOP); if (!open) c.fillRect(x - 3, SHEAR, 7, 84 - SHEAR);
        const keyTop = SHEAR + p.gap - lf;
        let wob = 0; if (i === b && !p.set && !open) { const touch = under() === i && lift > 0; if (Math.sin(t * (touch ? 31 : 13) + i * 2) > (touch ? .5 : .93)) wob = 1; }
        const dBot = p.set || open ? SHEAR : keyTop, dTop = dBot - DRV;
        // spring
        c.fillStyle = R[1]; const sp = dTop - TOP - 1;
        for (let s = 0; s < sp; s += 2) c.fillRect(x - 2 + ((s / 2) % 2 ? 2 : 0), TOP + 1 + s, 3, 1);
        // driver pin
        c.fillStyle = R[0]; c.fillRect(x - 2 + wob, dTop, 5, DRV); c.fillStyle = R[2]; c.fillRect(x - 1 + wob, dTop + 1, 1, DRV - 2);
        // key pin (rounded tip at the bottom)
        if (!open) { c.fillStyle = R[1]; c.fillRect(x - 2, keyTop + (p.set ? 0 : 1), 5, REST - lf - keyTop - (p.set ? 0 : 1)); c.fillStyle = R[0]; c.fillRect(x - 2, keyTop + (p.set ? 0 : 1), 5, 1); c.fillRect(x - 1, REST - lf - 1, 3, 1); }
        if (p.set) { c.fillStyle = R[0]; c.fillRect(x - 3, SHEAR + 1, 7, 1); }
        // pin status lamps
        c.fillStyle = p.set || open ? R[0] : R[2]; c.fillRect(x - 2, 108, 5, 5);
      }
      // tension wrench and pick
      c.fillStyle = R[0]; c.fillRect(4, 93, L + 6, 2); c.fillRect(4, 93, 2, 16);
      if (!open) {
        const px = Math.round(pickX), tipY = REST - Math.round(lift);
        c.fillStyle = R[0]; c.fillRect(0, 90, px - 1, 2); c.fillRect(px - 1, tipY, 3, 92 - tipY);
        c.fillStyle = R[1]; c.fillRect(0, 89, 10, 4);
      }
      feel.end(c, W, H);
      // HUD along the bottom, clear of the score badge
      text(c, `LOCK ${lockN}`, 4, 124, { color: R[0] });
      text(c, `${k}/${pins.length}`, W - 4, 124, { color: R[0], align: 'right' });
      const bw = Math.round((W - 8) * time / maxTime);
      c.fillStyle = R[2]; c.fillRect(4, 148, W - 8, 6); c.fillStyle = time < 5 && (t * 4 | 0) % 2 ? R[1] : R[0]; c.fillRect(4, 148, bw, 6);
      if (ml > 0) text(c, msg, W / 2, 132, { color: R[0], align: 'center' });
      ready.draw(c, W, H, { pixel: true, text: 'SLIDE, THEN PUSH UP', color: R[0], y: 136 });
    },
    down(x, y) { ready.go(); held = true; lx = x; ly = y; },
    move(x, y, p) {
      if (!p || !held || phase !== 'pick') { lx = x; ly = y; return; }
      const dx = x - lx, dy = y - ly; lx = x; ly = y;
      if (!(lift > 3 && under() >= 0)) pickX = clamp(pickX + dx, 20, RR - 6);   // the pick sticks while it lifts a pin
      lift = Math.max(0, lift - dy * .45);
    },
    up() {
      held = false;
      const u = under(), b = binding();
      if (phase === 'pick' && u >= 0 && u === b && !pins[u].set && Math.abs(lift - pins[u].gap) <= tol) setPin(u);
    },
    key(kk, d) {
      if (d) ready.go();
      if (kk === 'ArrowLeft') keyX = d ? -1 : keyX < 0 ? 0 : keyX;
      if (kk === 'ArrowRight') keyX = d ? 1 : keyX > 0 ? 0 : keyX;
      if (kk === 'ArrowUp' || kk === ' ') { keyUp = d; if (!d) this.up(); }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'pin-picker',
  title: 'Pin Picker',
  tag: 'Pocket · Lockpick',
  retro: true, pal: 'moss',
  w: W, h: H,
  tick: 60,
  music: 'tense',
  goal: 4,
  hint: 'Drag sideways to slide the pick, then drag up to push a pin. The wobbling pin sets at the dotted line; push it past and every pin drops.',
  creator: 'Noctizzle',
  make,
};
