// Shadow Turn: a little sculpture of cubes floats in front of a lamp and throws its shadow on the wall.
// A target silhouette glows on the wall. Drag to turn the sculpture (sideways spins it, up and down tips
// it); let go and it clicks to the nearest notch. When the live shadow fills the target it locks, scores
// and a new sculpture floats in. The clock runs down; every solve buys time. Early targets are quarter
// turns, later ones eighth turns.
import gs from '../gamescroll.js';
const { Feel } = gs.effects, { Ready } = gs.rounds;
const { sounds, notes, sfx } = gs.sound, { haptic } = gs.device, { clamp, rnd } = gs.util;

// Fluid height: the wall grows taller and the shadow scale with it, the lamp stays on the bottom edge. The match
// test runs in shadow units (mask()), so the scale is only for reading the shape.
const W = 360, CX = W / 2, WALL = { x: 20, y: 96, w: 320, h: 250 }, WC = { x: CX, y: 221 };
let H = 640, WS = 35;
const G = 28, CELL = 7 / G, NOTCH = Math.PI / 12, TH = .88;
const SC = { x: CX, y: 482 }, SS = 30, CAM = { yaw: -.42, pitch: .32 };
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const LIGHT = (() => { const l = [-.45, .65, .62], m = Math.hypot(...l); return l.map(v => v / m); })();

function rot([x, y, z], yaw, pitch) {                     // spin about the up axis, then tip about the side axis
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
  return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
}
function hull(pts) {                                      // convex hull of 2D points (monotone chain)
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const inside = (h, x, y) => { for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length]; if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false; } return true; };
function shadows(cubes, yaw, pitch) {                     // each cube's shadow: the hull of its 8 corners seen along the lamp axis
  return cubes.map(p => {
    const pts = []; for (let i = 0; i < 8; i++) { const q = rot([p[0] + (i & 1 ? .5 : -.5), p[1] + (i & 2 ? .5 : -.5), p[2] + (i & 4 ? .5 : -.5)], yaw, pitch); pts.push([q[0], q[1]]); }
    return hull(pts);
  });
}
function mask(hs) {
  const m = new Uint8Array(G * G);
  for (const h of hs) {
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9; for (const [x, y] of h) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let j = Math.max(0, Math.floor((y0 + 3.5) / CELL)); j <= Math.min(G - 1, Math.floor((y1 + 3.5) / CELL)); j++)
      for (let i = Math.max(0, Math.floor((x0 + 3.5) / CELL)); i <= Math.min(G - 1, Math.floor((x1 + 3.5) / CELL)); i++)
        if (!m[j * G + i] && inside(h, -3.5 + (i + .5) * CELL, -3.5 + (j + .5) * CELL)) m[j * G + i] = 1;
  }
  return m;
}
function layout(h) {
  const off = h - 640; H = h;
  WALL.h = 250 + Math.round(off * .5); WC.y = WALL.y + WALL.h / 2; WS = 35 + off * .05; SC.y = 482 + Math.round(off * .75);
}
const iou = (a, b) => { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { i += a[k] & b[k]; u += a[k] | b[k]; } return u ? i / u : 0; };
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

function make(api) {
  const feel = new Feel(), ready = new Ready();
  let cubes, yaw, pitch, tYaw, tPitch, tHull, tMask, live, liveHull, match, hold, solved, time, phase, lockT, drag, snap, t, pop, dirty;

  function sculpt(n) {                                    // grow a polycube from one cube, then centre it
    for (;;) {
      const s = [[0, 0, 0]], key = p => p.join();
      while (s.length < n) {
        const b = s[Math.random() * s.length | 0], d = DIRS[Math.random() * 6 | 0], p = [b[0] + d[0], b[1] + d[1], b[2] + d[2]];
        if (!s.some(q => key(q) === key(p))) s.push(p);
      }
      const spread = [0, 1, 2].filter(k => new Set(s.map(p => p[k])).size > 1).length;
      if (spread < 2) continue;                          // a straight bar is no puzzle
      const c = [0, 1, 2].map(k => s.reduce((a, p) => a + p[k], 0) / n);
      return s.map(p => p.map((v, k) => v - c[k]));
    }
  }
  function next() {
    const n = Math.min(7, 4 + (solved >> 1)), fine = solved >= 3, step = fine ? Math.PI / 4 : Math.PI / 2;
    for (let tries = 0; tries < 40; tries++) {
      cubes = sculpt(n);
      tYaw = (Math.random() * 8 | 0) * step; tPitch = (Math.random() * 8 | 0) * step;
      tHull = shadows(cubes, tYaw, tPitch); tMask = mask(tHull);
      yaw = Math.round(rnd(0, 6.28) / NOTCH) * NOTCH; pitch = Math.round(rnd(-1.4, 1.4) / NOTCH) * NOTCH;
      if (tMask.reduce((a, v) => a + v, 0) > 40 && iou(mask(shadows(cubes, yaw, pitch)), tMask) < .55) break;
    }
    phase = 'turn'; hold = 0; snap = null; dirty = true; pop = 0;
  }
  function refresh() { liveHull = shadows(cubes, yaw, pitch); live = mask(liveHull); match = iou(live, tMask); dirty = false; }

  return {
    resize(w, h) { layout(h); },
    reset() { solved = 0; time = 30; t = 0; drag = null; next(); refresh(); feel.clear(); ready.reset(); },
    update(dt) {
      feel.update(dt); t += dt; pop = Math.min(1, pop + dt * 3);
      if (feel.frozen || !ready.update(dt)) return;
      if (phase === 'lock') { lockT -= dt; if (lockT <= 0) { next(); refresh(); sounds.whoosh(); } return; }
      time -= dt;
      if (time <= 0) { time = 0; phase = 'end'; feel.lose(); return api.over(); }
      if (snap && !drag) {                                 // ease into the nearest notch
        const dy = wrapA(snap.yaw - yaw), dp = snap.pitch - pitch, k = Math.min(1, dt * 14);
        yaw += dy * k; pitch += dp * k; dirty = true;
        if (Math.abs(dy) + Math.abs(dp) < .002) { yaw = snap.yaw; pitch = snap.pitch; snap = null; }
      }
      if (dirty) refresh();
      if (match >= TH) {
        hold += dt;
        if (hold > .3) {
          solved++; api.score(solved); phase = 'lock'; lockT = .9; drag = null; snap = null;
          const add = Math.max(2, 9 - solved * .45); time = Math.min(30, time + add);
          feel.coin(WC.x, WC.y, { color: '#ffd76a', text: `+${Math.round(add)}s` }); notes('E5 G5 C6', { len: .08 }); haptic('success');
          feel.juice.burst(WC.x, WC.y, { n: 26, speed: 180, life: .6, size: 3, color: ['#ffd76a', '#fff3c4'] });
        }
      } else hold = 0;
      if (time < 5 && (t * 2 | 0) !== ((t - dt) * 2 | 0)) sounds.tick();
    },
    fx(dt) { feel.update(dt); t += dt; },
    draw(c) {
      c.fillStyle = '#1b1a26'; c.fillRect(0, 0, W, H);
      const fl = c.createLinearGradient(0, WALL.y + WALL.h, 0, H); fl.addColorStop(0, '#2e2a3a'); fl.addColorStop(1, '#14131c');
      c.fillStyle = fl; c.fillRect(0, WALL.y + WALL.h, W, H);
      // the wall, lit by the lamp
      const lit = c.createRadialGradient(WC.x, WC.y, 20, WC.x, WC.y, 220); lit.addColorStop(0, '#f6ead2'); lit.addColorStop(1, '#a89a86');
      c.fillStyle = lit; c.beginPath(); c.roundRect(WALL.x, WALL.y, WALL.w, WALL.h, 10); c.fill();
      feel.begin(c);
      const path = hs => { c.beginPath(); for (const h of hs) h.forEach(([x, y], i) => (i ? c.lineTo : c.moveTo).call(c, WC.x + x * WS, WC.y - y * WS)); };
      const locked = phase === 'lock';
      // target: a glowing rim (stroke every cube shadow, then fill the union back with wall colour)
      c.lineJoin = 'round'; c.strokeStyle = locked ? '#ffd76a' : `rgba(255,120,80,${.75 + Math.sin(t * 4) * .2})`; c.lineWidth = 7;
      for (const h of tHull) { path([h]); c.closePath(); c.stroke(); }
      path(tHull); c.fillStyle = '#efe0c4'; c.fill('nonzero');
      // the live shadow
      if (!locked || (t * 10 | 0) % 2) { path(liveHull); c.fillStyle = locked ? 'rgba(120,80,20,.85)' : 'rgba(30,26,40,.78)'; c.fill('nonzero'); }
      // the lamp and its cone
      const ly = H - 36, cone = c.createRadialGradient(CX, ly + 8, 4, CX, ly + 8, 160); cone.addColorStop(0, 'rgba(255,230,160,.5)'); cone.addColorStop(1, 'rgba(255,230,160,0)');
      c.fillStyle = cone; c.beginPath(); c.moveTo(CX - 14, ly + 2); c.lineTo(CX - 150, WALL.y + WALL.h + 10); c.lineTo(CX + 150, WALL.y + WALL.h + 10); c.lineTo(CX + 14, ly + 2); c.fill();
      c.fillStyle = '#3a3448'; c.beginPath(); c.roundRect(CX - 26, ly, 52, 20, 6); c.fill();
      c.fillStyle = '#fff2c0'; c.beginPath(); c.arc(CX, ly, 11, Math.PI, 0); c.fill();
      // the sculpture: visible cube faces, back to front, shaded by the light
      const sc = (locked ? 1 - (1 - lockT / .9) * .5 : 1) * (.6 + .4 * Math.min(1, pop)) * SS, faces = [];
      const has = new Set(cubes.map(p => p.map(v => Math.round(v * 1000)).join()));
      const view = v => rot(rot(v, yaw, pitch), CAM.yaw, CAM.pitch);   // the camera sits a little up and to the side of the lamp
      for (const p of cubes) for (const d of DIRS) {
        if (has.has(p.map((v, k) => Math.round((v + d[k]) * 1000)).join())) continue;
        const n = view(d); if (n[2] <= .01) continue;
        const ax = d.map(Math.abs), u = ax[0] ? [0, 1, 0] : [1, 0, 0], w = ax[2] ? [0, 1, 0] : ax[1] ? [0, 0, 1] : [0, 0, 1];
        const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => view([0, 1, 2].map(k => p[k] + d[k] * .5 + (u[k] * a + w[k] * b) * .5)));
        const br = .42 + .58 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
        faces.push({ cs, z: cs.reduce((a, q) => a + q[2], 0) / 4, br });
      }
      faces.sort((a, b) => a.z - b.z);
      const bob = Math.sin(t * 1.6) * 4;
      for (const f of faces) {
        c.beginPath(); f.cs.forEach(([x, y], i) => (i ? c.lineTo : c.moveTo).call(c, SC.x + x * sc, SC.y + bob - y * sc)); c.closePath();
        const k = f.br, base = locked ? [250, 200, 90] : [222, 150, 98];
        c.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`; c.fill();
        c.strokeStyle = 'rgba(40,20,10,.55)'; c.lineWidth = 1.5; c.stroke();
      }
      feel.end(c, W, H);
      // HUD: time bar on the floor line, match ring under it
      const sa = api.scoreArea(), ty = Math.max(70, sa.bottom + 12), k = clamp(time / 30, 0, 1);
      c.fillStyle = '#ffffff22'; c.beginPath(); c.roundRect(24, ty, W - 48, 10, 5); c.fill();
      c.fillStyle = time < 5 && (t * 6 | 0) % 2 ? '#ff6a5a' : k < .3 ? '#ffb05a' : '#7fe0c0'; c.beginPath(); c.roundRect(24, ty, (W - 48) * k, 10, 5); c.fill();
      c.textAlign = 'center'; c.font = '700 15px Rubik, sans-serif'; c.fillStyle = match >= TH ? '#ffd76a' : '#e8e2f4';
      c.fillText(locked ? 'LOCKED!' : `shadow match ${Math.round(match * 100)}%`, CX, WALL.y + WALL.h + 26);
      ready.draw(c, W, H, { text: 'Drag to turn the cubes', y: H - 80, color: '#fff2c0' });
    },
    down(x, y) { if (ready.go()) return; if (phase === 'turn') { drag = { x, y }; snap = null; sounds.click(); } },
    move(x, y, pr) {
      if (!pr || !drag || phase !== 'turn') return;
      const dx = x - drag.x, dy = y - drag.y; yaw += dx * .012; pitch += dy * .012; drag = { x, y }; dirty = true;
      if (Math.abs(dx) + Math.abs(dy) > 2 && Math.random() < .15) sfx(220 + match * 400, .03, 'triangle', .02);
    },
    up() {
      if (!drag) return; drag = null;
      snap = { yaw: Math.round(yaw / NOTCH) * NOTCH, pitch: Math.round(pitch / NOTCH) * NOTCH }; haptic('light');
    },
    key(k, d) {
      if (!d) return; if (ready.go() || phase !== 'turn') return;
      const base = snap || { yaw, pitch };
      if (k === 'ArrowLeft') snap = { yaw: base.yaw - NOTCH * 3, pitch: base.pitch }; if (k === 'ArrowRight') snap = { yaw: base.yaw + NOTCH * 3, pitch: base.pitch };
      if (k === 'ArrowUp') snap = { yaw: base.yaw, pitch: base.pitch - NOTCH * 3 }; if (k === 'ArrowDown') snap = { yaw: base.yaw, pitch: base.pitch + NOTCH * 3 };
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'shadow-turn', title: 'Shadow Turn', tag: 'Casual · Spatial', retro: false, w: W, h: 640, maxH: 800, tick: 60, music: 'puzzle',
  goal: 8,
  hint: 'Drag to turn the cubes until their shadow fills the glowing shape on the wall. Each match adds time; run out and it is over.',
  creator: 'Noctizzle',
  make,
};
