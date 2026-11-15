import gs from '../gamescroll.js';
const { Ready } = gs.rounds;
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { rnd } = gs.util;
const { Feel } = gs.effects;
const shuffle = gs.math.rng().shuffle;   // a fair shuffle

// Drag the dots around until no two lines cross. Every untangled web adds time and a dot.
const W = 360, H = 640, PAD = 40, TOP = 120, BOT = 600;

function make(api) {
  const ready = new Ready({ eat: false });   // the round starts on the first touch
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let pts, edges, drag, time, score, t, solvedT, n, dead;
  const cross = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
  const crossings = () => { let k = 0; for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) { const [a, b] = edges[i], [c, d] = edges[j]; if (a === c || a === d || b === c || b === d) continue; if (cross(pts[a], pts[b], pts[c], pts[d])) k++; } return k; };
  const bad = () => { const s = new Set(); for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) { const [a, b] = edges[i], [c, d] = edges[j]; if (a === c || a === d || b === c || b === d) continue; if (cross(pts[a], pts[b], pts[c], pts[d])) { s.add(i); s.add(j); } } return s; };
  function build() {
    const sol = Array.from({ length: n }, () => ({ x: rnd(PAD, W - PAD), y: rnd(TOP, BOT) }));
    edges = []; const cand = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) cand.push([i, j, Math.hypot(sol[i].x - sol[j].x, sol[i].y - sol[j].y)]);
    cand.sort((a, b) => a[2] - b[2]);
    for (const [i, j] of cand) { if (edges.length >= n * 1.6) break; if (edges.some(([a, b]) => a !== i && a !== j && b !== i && b !== j && cross(sol[a], sol[b], sol[i], sol[j]))) continue; edges.push([i, j]); }
    do { pts = Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2 + rnd(-.2, .2); return { x: W / 2 + Math.cos(a) * 130, y: (TOP + BOT) / 2 + Math.sin(a) * 200 }; }); pts = shuffle(pts); } while (crossings() < 2);
    solvedT = 0;
  }
  return {
    reset() { n = 6; time = 60; score = 0; t = 0; dead = 0; drag = null; ready.reset(); feel.clear(); build(); },
    update(dt) {
      feel.update(dt); t += dt; if (ready.playing) time -= dt;   // the clock waits for the first drag
      if (time <= 0) { haptic('warning'); feel.juice.shake(5); return api.over(); }
      if (solvedT) { solvedT += dt; if (solvedT > .7) { score++; api.score(score); time += 20; feel.juice.pop(W / 2, 130, '+20s', { color: '#3ddc97', size: 18 }); n = Math.min(14, n + 1); build(); } }
    },
    fx(dt) { dead += dt; feel.update(dt); },
    draw(c) {
      c.fillStyle = '#10161f'; c.fillRect(0, 0, W, H);
      feel.begin(c);
      const b = bad(); c.lineWidth = 3;
      edges.forEach(([i, j], k) => { c.strokeStyle = solvedT ? '#3ddc97' : b.has(k) ? '#ff5d73' : '#7fb2ff'; c.beginPath(); c.moveTo(pts[i].x, pts[i].y); c.lineTo(pts[j].x, pts[j].y); c.stroke(); });
      for (const [k, p] of pts.entries()) { c.fillStyle = drag === k ? '#ffd34a' : '#f2f5fa'; c.beginPath(); c.arc(p.x, p.y, drag === k ? 15 : 12, 0, 7); c.fill(); c.fillStyle = '#10161f'; c.beginPath(); c.arc(p.x, p.y, 4, 0, 7); c.fill(); }
      feel.end(c, W, H);
      c.fillStyle = time < 8 ? '#ff6b6b' : '#ffffffcc'; c.font = '400 14px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(`${Math.ceil(time)}s`, W / 2, 96);
      c.font = '500 12px Rubik, sans-serif'; c.fillStyle = '#ffffff88'; c.fillText(solvedT ? 'Untangled!' : `${crossings()} crossings left`, W / 2, H - 16);
    },
    down(x, y) { if (solvedT) return; let best = -1, bd = 34; pts.forEach((p, k) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = k; } }); if (best >= 0) { drag = best; ready.go(); haptic('tick'); } },
    move(x, y) { if (drag === null || drag < 0) return; pts[drag].x = Math.max(14, Math.min(W - 14, x)); pts[drag].y = Math.max(TOP - 20, Math.min(H - 40, y)); },
    up() { if (drag === null) return; drag = null; sfx(400, .03, 'triangle', .02); if (!crossings()) { solvedT = .001; haptic('success'); sfx(880, .3, 'triangle', .06, 400); for (const p of pts) feel.juice.burst(p.x, p.y, { n: 6, speed: 110, life: .4, size: 3, color: ['#3ddc97', '#ffffff'] }); } },
  };
}

export default {
  id: 'untangle', title: 'Untangle', tag: 'Casual · Puzzle', retro: false, w: W, h: H, goal: 2,
  hint: 'Drag the dots so no two lines cross. Red lines are the ones still crossing.',
  make,
};
