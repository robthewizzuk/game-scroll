// Echo Loop: every attempt at a room lasts one short loop. When it runs out, time rewinds and your
// last run plays again beside you as a ghostly echo. Echoes stand on pressure plates and hold doors
// open, so up to three past selves work together to get you to the exit.
import gs from '../gamescroll.js';
const { Feel } = gs.effects, { Ready } = gs.rounds, { text, sprite } = gs.pixel, { sounds, sfx } = gs.sound;
const { haptic } = gs.device, { TileMap } = gs.tiles, { Ghost } = gs.replay, { clamp } = gs.util, { mix } = gs.tick;

const W = 176, H = 176, TS = 16, OY = 16, COLS = 11, ROWS = 9, LOOP = 8, MAXE = 3, SPEED = 52;
// '#' wall, P start, E exit, a/b/c plates, A/B/C doors (a door opens while EVERY plate of its letter is held)
const ROOMS = [
  ['###########', '#.........#', '#.P.....a.#', '#.........#', '#####A#####', '#.........#', '#....E....#', '#.........#', '###########'],
  ['###########', '#a.......a#', '#.........#', '#....P....#', '#.........#', '####AAA####', '#.........#', '#....E....#', '###########'],
  ['###########', '#P...#...b#', '#....#....#', '#....A....#', '#a...#....#', '######B####', '#.........#', '#........E#', '###########'],
  ['###########', '#b..#P..#c#', '#...A...B.#', '#...#..a#.#', '##C########', '#.........#', '#.#######.#', '#.......#E#', '###########'],
  ['###########', '#a...#....#', '#....#..c.#', '#.P..A....#', '#....#....#', '#c...#....#', '#######C###', '#E........#', '###########'],
  ['###########', '#P..a#...b#', '#....A....#', '#....#....#', '###B#######', '#c....#...#', '#.....C..E#', '#.....#...#', '###########'],
  ['###########', '#P.#a..A..#', '#..#...#..#', '#..B...#.c#', '#b.#...#..#', '####...####', '#..C...####', '#E.#...####', '###########'],
  ['###########', '#a#.....#a#', '#.B.....B.#', '#.#..P..#.#', '#.#.....#.#', '####.b.####', '#####A#####', '#....E....#', '###########'],
];
const TIPS = [['WALK ONTO THE GOLD PLATE', 'YOUR ECHO HOLDS IT. GO!'], ['TWO PLATES: TWO ECHOES', 'REWIND ENDS A LOOP EARLY']];
const DOORC = { A: '#f85878', B: '#58c8f8', C: '#78e858' };
const ART = [`..oooo..
  .ohhhho.
  ohhhhhho
  ohffffho
  ohfkfkfo
  .offffo.
  .obbbbo.
  obbbbbbo
  .obbbbo.
  .oo..oo.`, `..oooo..
  .ohhhho.
  ohhhhhho
  ohffffho
  ohfkfkfo
  .offffo.
  .obbbbo.
  obbbbbbo
  .obbbbo.
  ..oooo..`];
const HERO = { o: '#201838', h: '#f8a838', f: '#f8d8b0', k: '#201838', b: '#3878f8' };
const ECHO = { o: '#58389880', h: '#c890f8a0', f: '#e8d0f8a0', k: '#58389880', b: '#9858e8a0' };

function make(api) {
  const feel = new Feel({ pixel: true }), ready = new Ready({ eat: false, text: 'TAP TO WALK' });
  const hero = ART.map(a => sprite(a, HERO)), ghost = ART.map(a => sprite(a, ECHO));
  let map, room, start, exit, plates, doors, p, goal, rec, echoes, loopT, time, score, solved, rewind, t, roomN, pressed, flash;

  function load(n) {
    roomN = n; const idx = n < ROOMS.length ? n : 2 + (n - ROOMS.length) % (ROOMS.length - 2);
    room = idx;
    map = TileMap.fromText(ROOMS[idx], { size: TS, legend: { D: { solid: true }, O: {} } });
    start = map.find('P')[0]; exit = map.find('E')[0];
    plates = map.marks.filter(m => /[a-c]/.test(m.ch)).map(m => ({ ...m, on: false }));
    doors = map.marks.filter(m => /[A-C]/.test(m.ch)).map(m => ({ ...m, open: false, k: 0 }));
    for (const m of map.marks) map.set(m.tx, m.ty, '.');
    for (const d of doors) map.set(d.tx, d.ty, 'D');
    echoes = []; solved = 0; restartLoop();
  }
  function restartLoop() {
    p = { x: start.x, y: start.y, w: 10, h: 10, was: [start.x, start.y], face: 1, step: 0, safe: [start.x, start.y] };
    goal = null; rec = new Ghost({ every: 1 / 30 }); loopT = 0; pressed = '';
  }
  function endLoop() {
    rec.record(0, p.x, p.y);
    echoes.push(rec); if (echoes.length > MAXE) echoes.shift();
    restartLoop(); rewind = .4; flash = 1;
    sfx(900, .35, 'sawtooth', .05, -700); haptic('medium');
  }
  const tileOf = (x, y) => [Math.floor(x / TS), Math.floor(y / TS)];
  const bodies = () => { const out = [[p.x, p.y]]; for (const e of echoes) { const s = e.at(loopT); if (s) out.push([s.x, s.y]); } return out; };

  // the next spot to head for: breadth-first over open tiles, to the goal tile or the open tile nearest it
  function waypoint() {
    const [sx, sy] = tileOf(p.x, p.y), [gx, gy] = tileOf(goal.x, goal.y);
    if (sx === gx && sy === gy) return [goal.x, goal.y];
    const prev = new Map([[sy * COLS + sx, -1]]), q = [sy * COLS + sx];
    let best = q[0], bd = Math.abs(sx - gx) + Math.abs(sy - gy);
    for (let i = 0; i < q.length; i++) {
      const cx = q[i] % COLS, cy = q[i] / COLS | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, k = ny * COLS + nx;
        if (!map.inside(nx, ny) || map.solid(nx, ny) || prev.has(k)) continue;
        prev.set(k, q[i]); q.push(k);
        const d = Math.abs(nx - gx) + Math.abs(ny - gy); if (d < bd) { bd = d; best = k; }
      }
    }
    if (best === q[0]) return [(sx + .5) * TS, (sy + .5) * TS];
    let k = best; while (prev.get(k) !== q[0]) k = prev.get(k);
    return [(k % COLS + .5) * TS, ((k / COLS | 0) + .5) * TS];
  }

  return {
    reset() { score = 0; time = 70; t = 0; rewind = 0; flash = 0; load(0); feel.clear(); ready.reset(); },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      p.was = [p.x, p.y]; flash = Math.max(0, flash - dt * 3);
      if (!ready.update(dt)) return;
      t += dt;
      if (rewind > 0) { rewind -= dt; return; }
      if (solved) { solved -= dt; if (solved <= 0) { load(roomN + 1); feel.powerup(W / 2, H / 2, { color: '#f8d838', text: `ROOM ${roomN + 1}` }); } return; }
      time -= dt;
      if (time <= 0) { time = 0; feel.lose(); api.over(); return; }
      loopT += dt;
      // walk
      if (goal) {
        const [wx, wy] = waypoint(), dx = wx - p.x, dy = wy - p.y, d = Math.hypot(dx, dy);
        if (d > .6) {
          const m = Math.min(d, SPEED * dt);
          p.onGround = false; map.move(p, dx / d * m, dy / d * m, { stepUp: 0, stepDown: 0 });
          if (Math.abs(dx) > .5) p.face = Math.sign(dx);
          p.step += dt; if (p.step > .26) { p.step = 0; sounds.step(1.3); }
        } else if (wx === goal.x && wy === goal.y && !goal.held) goal = null;
      }
      rec.record(dt, p.x, p.y);
      // plates and doors
      const bs = bodies();
      let now = '';
      for (const pl of plates) { pl.on = bs.some(([x, y]) => Math.floor(x / TS) === pl.tx && Math.floor(y / TS) === pl.ty); if (pl.on) now += pl.tx + ',' + pl.ty + ';'; }
      if (now.length > pressed.length) sfx(240, .05, 'square', .04, 120);
      pressed = now;
      for (const d of doors) {
        const open = plates.filter(pl => pl.ch === d.ch.toLowerCase()).every(pl => pl.on);
        if (open !== d.open) {
          d.open = open; map.set(d.tx, d.ty, open ? 'O' : 'D'); sounds.door(open ? 1.2 : .8);
          if (!open && Math.abs(p.x - (d.tx + .5) * TS) < 13 && Math.abs(p.y - (d.ty + .5) * TS) < 13) {
            [p.x, p.y] = p.safe; feel.hit(p.x, p.y + OY, { color: DOORC[d.ch] });   // the door shoves you back out
          }
        }
        d.k = clamp(d.k + (d.open ? dt : -dt) * 6, 0, 1);
      }
      const [ptx, pty] = tileOf(p.x, p.y);
      if (!doors.some(d => d.tx === ptx && d.ty === pty)) p.safe = [(ptx + .5) * TS, (pty + .5) * TS];
      // the exit
      if (ptx === exit.tx && pty === exit.ty) {
        const pts = 10 + 5 * (MAXE - echoes.length);
        score += pts; api.score(score); time += 20; solved = 1.1; goal = null;
        feel.win(p.x, p.y + OY); feel.score(p.x, p.y + OY - 10, pts, { color: '#f8d838' }); haptic('success');
        return;
      }
      if (loopT >= LOOP) endLoop();
    },
    draw(c) {
      c.fillStyle = '#181028'; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.save(); c.translate(0, OY);
      // floor and walls
      for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
        const x = tx * TS, y = ty * TS, ch = map.get(tx, ty);
        if (ch === '#') {
          c.fillStyle = '#4a3878'; c.fillRect(x, y, TS, TS);
          if (map.get(tx, ty + 1) !== '#') { c.fillStyle = '#2c2050'; c.fillRect(x, y + 10, TS, 6); c.fillStyle = '#6a58a8'; c.fillRect(x, y, TS, 2); }
          else { c.fillStyle = '#3c2c68'; c.fillRect(x + ((tx + ty) % 2) * 8, y + 4, 8, 3); }
        } else { c.fillStyle = (tx + ty) % 2 ? '#2a2448' : '#30284e'; c.fillRect(x, y, TS, TS); c.fillStyle = '#3a3260'; c.fillRect(x, y, TS, 1); }
      }
      // exit portal
      { const x = exit.tx * TS, y = exit.ty * TS, k = (t * 6 | 0) % 3;
        c.fillStyle = '#f8d838'; c.fillRect(x + 2, y + 2, 12, 12); c.fillStyle = '#181028'; c.fillRect(x + 4, y + 4, 8, 8);
        c.fillStyle = ['#78e858', '#58c8f8', '#f8f8f8'][k]; c.fillRect(x + 6, y + 6, 4, 4); }
      for (const pl of plates) {
        const x = pl.tx * TS, y = pl.ty * TS;
        c.fillStyle = '#100818'; c.fillRect(x + 2, y + 3, 12, 11);
        c.fillStyle = pl.on ? '#b88818' : '#f8d838'; c.fillRect(x + 3, y + (pl.on ? 5 : 3), 10, pl.on ? 8 : 9);
        c.fillStyle = DOORC[pl.ch.toUpperCase()]; c.fillRect(x + 6, y + (pl.on ? 7 : 6), 4, 3);
      }
      for (const d of doors) {
        const x = d.tx * TS, y = d.ty * TS, gap = Math.round(d.k * 7);
        c.fillStyle = DOORC[d.ch];
        c.fillRect(x, y, 8 - gap, TS); c.fillRect(x + 8 + gap, y, 8 - gap, TS);
        if (gap < 7) { c.fillStyle = '#ffffff60'; c.fillRect(x + 1, y + 2, 1, 12); c.fillRect(x + 14, y + 2, 1, 12); c.fillStyle = '#20183880'; c.fillRect(x + 7 - gap, y, 1, TS); c.fillRect(x + 8 + gap, y, 1, TS); }
      }
      // echoes, then you
      echoes.forEach((e, i) => {
        const s = e.at(loopT); if (!s) return;
        ghost[s.done ? 0 : (t * 8 | 0) % 2].draw(c, Math.round(s.x - 4), Math.round(s.y - 7));
        text(c, String(i + 1), Math.round(s.x), Math.round(s.y - 13), { font: 'tiny', align: 'center', color: '#c890f8' });
      });
      if (goal && goal.show) { c.fillStyle = '#f8f8f8'; const gx = Math.round(goal.x), gy = Math.round(goal.y); c.fillRect(gx - 2, gy, 5, 1); c.fillRect(gx, gy - 2, 1, 5); }
      const hx = Math.round(mix(p.was[0], p.x)), hy = Math.round(mix(p.was[1], p.y));
      hero[goal ? (t * 8 | 0) % 2 : 0].draw(c, hx - 4, hy - 7, { flip: p.face < 0 });
      if (room < 2 && roomN < 2 && !solved) { const tip = TIPS[room][echoes.length ? 1 : 0]; text(c, tip, W / 2, room === 0 ? 4 * TS + 20 : 6 * TS + 4, { align: 'center', color: '#f8f8f8', outline: '#181028' }); }
      c.restore();
      if (rewind > 0 || flash > 0) { c.fillStyle = `rgba(200,144,248,${Math.max(flash * .5, rewind > 0 ? .25 : 0)})`; c.fillRect(0, OY, W, ROWS * TS); for (let y = OY; y < OY + ROWS * TS; y += 4) { c.fillStyle = '#ffffff22'; c.fillRect(0, y + ((t * 40 | 0) % 4), W, 1); } }
      feel.end(c, W, H);
      // HUD: room and clock up top (the app's score sits in the middle), loop bar and buttons below
      text(c, `ROOM ${roomN + 1}`, 3, 5, { color: '#c8b8f8' });
      text(c, `${Math.ceil(time)}S`, W - 3, 5, { align: 'right', color: time < 10 && (t * 4 | 0) % 2 ? '#f85878' : '#f8d838' });
      const by = OY + ROWS * TS;
      c.fillStyle = '#100818'; c.fillRect(0, by, W, H - by);
      c.fillStyle = '#5a3888'; c.fillRect(2, by + 1, 40, 14); c.fillRect(134, by + 1, 40, 14);
      text(c, 'RESET', 22, by + 5, { align: 'center', color: '#f8f8f8' });
      text(c, 'REWIND', 154, by + 5, { align: 'center', color: '#f8f8f8' });
      const k = solved ? 1 : clamp(loopT / LOOP, 0, 1);
      c.fillStyle = '#2a2448'; c.fillRect(48, by + 9, 80, 4); c.fillStyle = k > .8 ? '#f85878' : '#c890f8'; c.fillRect(48, by + 9, Math.round(80 * (1 - k)), 4);
      for (let i = 0; i < MAXE; i++) { c.fillStyle = i < echoes.length ? '#c890f8' : '#3a3260'; c.fillRect(74 + i * 10, by + 2, 7, 5); }
      ready.draw(c, W, H, { pixel: true, color: '#f8f8f8', y: OY + 3 * TS + 8 });
    },
    down(x, y) {
      if (!map) return;
      ready.go();
      if (solved || rewind > 0) return;
      if (y >= OY + ROWS * TS) {
        if (x < 46) { if (echoes.length || loopT > .3) { echoes = []; restartLoop(); rewind = .3; flash = 1; sounds.back(); haptic('light'); } }
        else if (x > 130) { if (loopT > .3) endLoop(); }
        return;
      }
      goal = { x: clamp(x, 0, W - 1), y: clamp(y - OY, 0, ROWS * TS - 1), held: true, show: true };
    },
    move(x, y, pressed) { if (pressed && goal && goal.held && y < OY + ROWS * TS) { goal.x = clamp(x, 0, W - 1); goal.y = clamp(y - OY, 0, ROWS * TS - 1); } },
    up() { if (goal) goal.held = false; },
    key(k, d) {
      if (!d || !map) return; ready.go();
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (dir && !solved) { const [tx, ty] = tileOf(p.x, p.y); goal = { x: (tx + dir[0] + .5) * TS, y: (ty + dir[1] + .5) * TS, held: false, show: false }; }
      if (k === ' ' && loopT > .3 && !solved && rewind <= 0) endLoop();
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'echo-loop',
  title: 'Echo Loop',
  tag: 'Advance · Time loop',
  retro: true, era: 'advance', pal: 'grape',
  w: W, h: H,
  tick: 60,
  music: 'puzzle',
  goal: 60,
  hint: 'Hold and drag (or tap) to walk. Each loop rewinds and your last run replays as an echo that holds plates down, so doors open for you.',
  creator: 'Noctizzle',
  make,
};
