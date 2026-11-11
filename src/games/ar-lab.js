import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic, want } = gs.device;
const { pbr, THREE } = gs.hd;
const { ARView, arNote, FLOOR, markerArt } = gs.ar;
const { Group, Mesh, BoxGeometry, PlaneGeometry, SphereGeometry, ConeGeometry, EdgesGeometry, LineSegments, LineBasicMaterial, MeshBasicMaterial, DoubleSide, Vector3 } = THREE;

// AR Lab: a test scene for native AR (not in the feed; open it from Settings > AR test).
// A 20 cm cube and a mirror ball sit on your floor 1.5 m ahead. Walk around them: with native AR they
// should stay put on the real floor and you should see their sides. Found surfaces show as outlines
// (teal: floors and tables, amber: walls), and tapping one drops a small cube where you tapped (flat
// against a wall). The panel shows what the AR system is doing, and what the floor height comes from
// (a mapped surface, a layer of feature points, or only an estimate). Tap the panel to fold it away.
//
// The chips along the bottom try AR phase 2, one part at a time:
//   Hide    real things hide the cube and the ball when they are in front (phones that measure depth)
//   Walls   walls are mapped too
//   Light   the shadows fall away from the room's real light, and the ball reflects the room
//   Mesh    draws what the phone makes of the room's depth as teal lines
//   Marker  shows a picture full screen; another phone running AR Lab stands a flag on it
// The cube is held by an anchor: the panel says whether the phone is holding it.
let W = 300, H = 460;
const COLS = ['#ff5a7a', '#ffc23a', '#5ad86a', '#4ab0ff', '#b06aff'];
// where the floor height comes from (v.floorSource), in words
const FLOOR_FROM = { plane: 'found: a mapped surface', points: 'found: a layer of points', hits: 'found: hit points', hand: 'set by hand', kept: 'kept from last round', rough: 'estimate: a few points', guess: 'estimate: usual phone height' };
const HIDING = { on: 'on: real things hide virtual ones', waiting: 'waiting for a depth picture', no: 'this phone can\'t measure depth', off: 'off' };
// which parts are on (kept while the app runs, so "play again" keeps them)
const opt = { hide: true, walls: true, light: true, mesh: false };
const CHIPS = [['hide', 'Hide'], ['walls', 'Walls'], ['light', 'Light'], ['mesh', 'Mesh'], ['marker', 'Marker']];

function make(api) {
  want('motion');
  let v, cube, ball, flag, drops, planeG, planes, placed, tap, note, noteT, anc, ancFrom, mk, open = true, showArt = false, chips = [], panelH = 0;
  const mats = COLS.map(c => pbr(c, { rough: .35 }));
  const box = new BoxGeometry(1, 1, 1), flat = new PlaneGeometry(1, 1);
  const fill = new MeshBasicMaterial({ color: '#19e3b1', transparent: true, opacity: .12, depthWrite: false, side: DoubleSide, toneMapped: false });
  const wallFill = new MeshBasicMaterial({ color: '#ffc14a', transparent: true, opacity: .1, depthWrite: false, side: DoubleSide, toneMapped: false });
  const edge = new LineBasicMaterial({ color: '#19e3b1', transparent: true, opacity: .8, toneMapped: false });
  const wallEdge = new LineBasicMaterial({ color: '#ffc14a', transparent: true, opacity: .8, toneMapped: false });
  const edges = new EdgesGeometry(flat);
  const art = markerArt ? markerArt(7, 512) : null, home = new Vector3(0, FLOOR + .1, -1.5);
  function setup() {
    v = new ARView({ occlude: opt.hide, walls: opt.walls, light: opt.light ? 'real' : null });
    v.showDepth = opt.mesh;
    cube = new Mesh(box, pbr('#f2f5fb', { rough: .3, metal: .1 })); cube.scale.setScalar(.2); cube.castShadow = cube.receiveShadow = true;
    // coloured faces would need a texture; a stripe on top shows which way it faces
    const stripe = new Mesh(box, mats[0]); stripe.scale.set(1.02, .2, .3); stripe.position.set(0, .41, -.36); cube.add(stripe);
    // a mirror ball: with Light on it shows the room round it
    ball = new Mesh(new SphereGeometry(.07, 32, 20), pbr('#ffffff', { rough: .06, metal: 1 })); ball.castShadow = true;
    // a flag that stands on the marker picture when another screen shows it
    flag = new Group(); const pole = new Mesh(box, mats[3]); pole.scale.set(.006, .12, .006); pole.position.y = .06;
    const tip = new Mesh(new ConeGeometry(.02, .05, 12), mats[1]); tip.position.y = .14; flag.add(pole, tip); flag.visible = false; flag.traverse(o => { o.castShadow = true; });
    v.scene.add(cube, ball, flag);
    drops = new Group(); v.scene.add(drops);
    planeG = new Group(); v.scene.add(planeG); planes = new Map();
    mk = art && v.marker ? v.marker(art, { name: 'ar-lab' }).attach(flag) : null;
  }
  function say(s) { note = s; noteT = 1.6; }
  function showPlanes() {
    const seen = new Set();
    for (const s of v.surfaces?.() || []) {
      seen.add(s.id);
      let g = planes.get(s.id);
      if (!g) {
        g = new Group(); const f = new Mesh(flat, s.wall ? wallFill : fill), e = new LineSegments(edges, s.wall ? wallEdge : edge);
        f.rotation.x = e.rotation.x = -Math.PI / 2; g.add(f, e); planeG.add(g); planes.set(s.id, g);
      }
      g.position.copy(s.p); g.quaternion.copy(s.q); g.scale.set(s.w, 1, s.d);
      if (!s.wall) g.children[0].material.opacity = s.floor ? .18 : .1;
    }
    for (const [id, g] of planes) if (!seen.has(id)) { planeG.remove(g); planes.delete(id); }
  }
  // the cube's anchor: made once the floor is in, and made again when the floor's height changes
  function hold() {
    const from = v.mode === 'world' ? v.floorSource : 'look';
    if (!v.anchor || (anc && ancFrom === from)) return;
    anc?.remove(); cube.position.copy(home); cube.quaternion.identity();
    anc = v.anchor(cube.position, cube.quaternion).attach(cube); ancFrom = from;
  }
  // where the kit's sun is, in words ("from the left, 50° up")
  function sunWords(d) {
    const a = Math.atan2(d[0], -d[2]) * 180 / Math.PI, side = Math.abs(a) < 45 ? 'ahead' : Math.abs(a) > 135 ? 'behind' : a > 0 ? 'the right' : 'the left';
    return `from ${side}, ${Math.round(Math.asin(Math.max(-1, Math.min(1, d[1]))) * 180 / Math.PI)}° up`;
  }
  // flip one of the chips; the first three change what the phone is asked for, so the view is made again
  function flip(k) {
    haptic('light');
    if (k === 'marker') { showArt = !showArt; return; }
    opt[k] = !opt[k];
    if (k === 'mesh') { if (v) v.showDepth = opt.mesh; return; }
    v.off(); v = null; anc = null; mk = null;   // draw() makes a new view with what is asked for now
  }
  return {
    reset() {
      v?.off(); v?.recenter();
      placed = 0; tap = null; note = null; noteT = 0; anc = null; ancFrom = null; showArt = false;
      if (v) { drops.clear(); cube.position.copy(home); cube.rotation.set(0, 0, 0); ball.position.set(.3, FLOOR + .07, -1.5); flag.visible = false; }
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      if (!v) return; v.live(); noteT -= dt;
      if (v.calibrating) return;
      hold();
      if (mk) flag.visible = mk.found;
    },
    draw(c) {
      if (!v) { setup(); this.reset(); }
      v.look(1 / 60); showPlanes();
      v.draw(c, W, H);
      v.pointers(c, W, H, [{ p: cube.position, col: '#f2f5fb' }]);
      if (showArt && art) {
        // the marker picture, as big as fits, for another phone to find
        const s = Math.min(W, H) - 24;
        c.fillStyle = '#f6f3ea'; c.fillRect(0, 0, W, H); c.drawImage(art, (W - s) / 2, (H - s) / 2, s, s);
        c.fillStyle = '#10151c'; c.font = '600 11px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('Point another phone running AR Lab at this · tap to close', W / 2, H - 8);
        return;
      }
      // status panel
      // (st: what the AR system is doing; an older app's kit has no status(), so read what it has)
      const st = v.status?.() || { tracking: v.sensor ? 'gyro' : 'none', why: 'NONE', surfaces: 0, points: 0, floor: null, layer: 0 }, world = v.mode === 'world', cp = v.eyePos, rows = [
        ['Mode', world ? 'World (native AR)' : `Look-around (${v.camState})`],
        ['Tracking', st.why !== 'NONE' ? `${st.tracking} · ${st.why.toLowerCase().replace(/_/g, ' ')}` : st.tracking],
        ['Floor', world ? FLOOR_FROM[st.floor] || 'searching' : 'lined up by hand'],
        ['Surfaces', world ? `${st.surfaces} mapped${opt.walls && st.walls != null ? ` · ${st.walls} of them walls` : ''}` : '-'],
        ['Points', world ? `${st.points} in view · layer of ${st.layer}` : '-'],
        ['Phone', `${cp.x.toFixed(2)}, ${(cp.y - FLOOR).toFixed(2)} up, ${cp.z.toFixed(2)}`],
        ['Cube', `${cube.position.distanceTo(cp).toFixed(2)} m away · ${anc?.held ? 'held by the phone' : 'kept by the kit'}`],
        ['Hiding', world && st.depth ? HIDING[st.depth] : opt.hide ? 'needs native AR' : 'off'],
        ['Light', !opt.light ? 'off' : world && st.light === 'real' ? `real: ${sunWords(st.sun)}` : world ? 'this phone gives brightness only' : 'needs native AR'],
        ['Marker', !mk ? '-' : mk.ok === false ? 'this phone can\'t look for it' : mk.tracked ? `in sight · ${mk.p.distanceTo(cp).toFixed(2)} m away · ${(mk.w * 100).toFixed(0)} cm wide` : mk.found ? 'seen, now out of sight' : world ? 'not seen yet (tap Marker on another screen)' : 'needs native AR'],
      ];
      const shown = open ? rows : rows.slice(0, 1);
      panelH = 14 + shown.length * 14;
      c.save(); c.fillStyle = '#04110ed0'; c.beginPath(); c.roundRect(10, 44, W - 20, panelH, 10); c.fill();
      c.font = '600 10px Rubik, sans-serif';
      shown.forEach(([k, t], i) => { c.fillStyle = '#8affdc'; c.textAlign = 'left'; c.fillText(k, 20, 59 + i * 14); c.fillStyle = '#fff'; c.fillText(t, 74, 59 + i * 14, W - 94); });
      // the chips: AR phase 2, one part at a time
      const cw = Math.min(64, (W - 20 - 4 * 4) / 5), x0 = (W - (cw * 5 + 16)) / 2, cy = H - 100;
      chips = CHIPS.map(([k, t], i) => ({ k, x: x0 + i * (cw + 4), y: cy, w: cw, h: 24 }));
      c.textAlign = 'center'; c.font = '700 10px Rubik, sans-serif';
      CHIPS.forEach(([k, t], i) => {
        const b = chips[i], on = k === 'marker' ? showArt : opt[k];
        c.fillStyle = on ? '#19e3b1' : '#04110ed9'; c.strokeStyle = '#19e3b188'; c.lineWidth = 1; c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 12); c.fill(); c.stroke();
        c.fillStyle = on ? '#04110e' : '#8affdc'; c.fillText(t, b.x + b.w / 2, b.y + 16);
      });
      c.font = '600 12px Rubik, sans-serif'; c.fillStyle = '#ffffffd0';
      c.fillText(v.mode === 'world' ? 'Walk round the cube · tap a surface to drop one' : 'Tap the floor to drop a cube', W / 2, H - 52);
      if (noteT > 0 && note) { c.font = '800 18px Rubik, sans-serif'; c.lineWidth = 4; c.strokeStyle = '#000a'; c.strokeText(note, W / 2, H * .45); c.fillStyle = '#fff'; c.fillText(note, W / 2, H * .45); }
      c.restore();
      arNote(c, v, W, H);
    },
    down(x, y, id) { if (showArt || v?.input?.('down', x, y, id)) return; tap = { x, y, id }; },
    move(x, y, pressed, id) { if (!showArt) v?.input?.('move', x, y, id, pressed); },
    up(x, y, id) {
      if (showArt) { showArt = false; return; }
      if (!v || v.input?.('up', x, y, id)) return;
      if (!tap || tap.id !== id || Math.hypot(x - tap.x, y - tap.y) > 14) { tap = null; return; }
      tap = null;
      const chip = chips.find(b => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h);
      if (chip) return flip(chip.k);
      if (x > 10 && x < W - 10 && y > 44 && y < 44 + panelH) { open = !open; return; }
      const view = v, ask = v.hit ? v.hit(x, y) : Promise.resolve(null);
      ask.then(h => {
        if (view !== v) return;   // a chip made a new view meanwhile
        if (!h) { say('No surface there'); haptic('warning'); return; }
        const m = new Mesh(box, mats[placed % COLS.length]); m.scale.setScalar(.08); m.castShadow = true;
        m.position.copy(h.p); if (h.n) m.position.addScaledVector(h.n, .04); else m.position.y += .04;   // (an older app's kit gives no n)
        if (h.q) m.quaternion.copy(h.q);
        drops.add(m);
        if (drops.children.length > 30) drops.remove(drops.children[0]);
        placed++; api.score(placed); say(h.wall ? 'On a wall' : h.kind === 'plane' ? 'On a surface' : h.kind === 'point' ? 'On a rough spot' : 'On the floor');
        haptic('light'); sfx(700, .08, 'triangle', .04, 200);
      });
    },
  };
}

export default {
  id: 'ar-lab',
  title: 'AR Lab',
  tag: 'AR · Test',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 5, reward: 0,
  hint: 'A test scene for AR: a cube sits on your floor. Walk around it to check it stays put, and tap surfaces to drop small cubes. Not a real game.',
  traits: ['theme:lab'],
  make,
};
