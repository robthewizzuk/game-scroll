// Works out a gs.models.human arm's angles for a pose or a gesture (human-idle.js GESTURES): where the elbow and the wrist should
// be and which way the palm should face, in the person's own frame (metres; facing +z, the left side +x, feet at 0), for the left
// arm; the right is the same mirrored (give R and the left side's numbers). It prints the angles to add to the pose:
// [armX, armY, armZ, foreX, foreY, handX, handZ] (o.armL = [armX, armY, armZ], o.foreL = [foreX, foreY, 0], o.handL = [handX, 0, handZ]).
//   node scripts/arm-solve.mjs L '{"elbow":[0.38,1.25,-0.06],"wrist":[0.21,1.04,0.02],"palm":[-1,0,0]}'
// Also "up" and "lo": the ways the upper arm and the forearm should point. A run prints where the shoulder, elbow and wrist are at rest.
const { skeleton } = await import('../src/kit/models/human.js'), T = await import('three');
const q = skeleton({ look: 'real', seed: 5 }), B = q.bones; let over = {};
q.rig.idle = { pose(dt, out) { for (const j in over) out[j] = over[j].slice(); } };
q.rig.play('idle', { fade: 0 }); for (let i = 0; i < 30; i++) q.rig.update(1 / 30); q.updateMatrixWorld(true);
const wp = b => b.getWorldPosition(new T.Vector3());
const sd = process.argv[2] || 'L';
// the palm's normal in the hand bone's own frame: at rest the left palm faces the thigh (-x), the right +x
over = {}; q.rig.update(1 / 60); q.updateMatrixWorld(true);
const hq = B['hand' + sd].getWorldQuaternion(new T.Quaternion()), palmLocal = new T.Vector3(sd === 'L' ? -1 : 1, 0, 0).applyQuaternion(hq.clone().invert());
console.log('rest: shoulder', wp(B['arm' + sd]).toArray().map(v => v.toFixed(2)), 'elbow', wp(B['fore' + sd]).toArray().map(v => v.toFixed(2)), 'wrist', wp(B['hand' + sd]).toArray().map(v => v.toFixed(2)));
function measure(p) {
  over = { ['arm' + sd]: [p[0], p[1], p[2]], ['fore' + sd]: [p[3], p[4], 0], ['hand' + sd]: [p[5] || 0, 0, p[6] || 0] };
  q.rig.update(1 / 60); q.updateMatrixWorld(true);
  const s = wp(B['arm' + sd]), e = wp(B['fore' + sd]), w = wp(B['hand' + sd]);
  const palm = palmLocal.clone().applyQuaternion(B['hand' + sd].getWorldQuaternion(new T.Quaternion()));
  return { s, e, w, up: e.clone().sub(s).normalize(), lo: w.clone().sub(e).normalize(), palm };
}
const ang = (a, b) => a.angleTo(new T.Vector3(...b).normalize());
function solve(want, start) {
  const f = p => { const m = measure(p); let c = 0; if (want.up) c += ang(m.up, want.up) ** 2; if (want.lo) c += ang(m.lo, want.lo) ** 2; if (want.palm) c += .5 * ang(m.palm, want.palm) ** 2; if (want.wrist) c += 30 * m.w.distanceTo(new T.Vector3(...want.wrist)) ** 2; if (want.elbow) c += 30 * m.e.distanceTo(new T.Vector3(...want.elbow)) ** 2; if (p[3] > 0) c += p[3] * p[3] * 10; c += .15 * ((p[5] || 0) ** 2 + (p[6] || 0) ** 2) + .03 * p[4] * p[4]; return c; };
  let best = start.slice(), bc = f(best);
  for (let r = 0; r < 40; r++) { const p = r ? best.map((v, i) => v + (Math.random() - .5) * (r < 20 ? .8 : .2)) : best.slice(); let c = f(p);
    for (let step = .2; step > .002; step *= .5) for (let it = 0; it < 6; it++) for (let i = 0; i < p.length; i++) for (const d of [step, -step]) { p[i] += d; const c2 = f(p); if (c2 < c) c = c2; else p[i] -= d; }
    if (c < bc) { bc = c; best = p.slice(); } }
  const m = measure(best);
  return { p: best.map(v => +v.toFixed(2)), cost: +bc.toFixed(4), up: want.up ? (ang(m.up, want.up) * 57.3).toFixed(0) : '-', lo: want.lo ? (ang(m.lo, want.lo) * 57.3).toFixed(0) : '-', palm: want.palm ? (ang(m.palm, want.palm) * 57.3).toFixed(0) : '-', elbow: m.e.toArray().map(v => v.toFixed(2)), wrist: m.w.toArray().map(v => v.toFixed(2)) };
}
const X = sd === 'L' ? 1 : -1, want = JSON.parse(process.argv[3]);
for (const k in want) if (Array.isArray(want[k])) want[k][0] *= X;
console.log(JSON.stringify(solve(want, JSON.parse(process.argv[4] || '[0,0,0,-0.5,0,0,0]'))));
