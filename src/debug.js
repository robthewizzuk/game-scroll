// Debug overlay for game makers. Only in dev and test builds (`npm run dev`, --mode bundled); the
// store apps never turn it on.
//
//   `  (backquote) or F2   overlay on / off   (or __gs.debug() in the console, or ?debug in the URL)
//   [  ]                   slower / faster: 0.1x, 0.25x, 0.5x, 1x, 2x
//   P                      pause the game
//   .                      while paused: step one frame (1/60 s)
//   H                      hitboxes on / off (draws your game's debug(c) hook)
//   B                      Tiny Brains: copy each brain's and shadow's starting brain (pack()) to the
//                          clipboard and the console, for new Brain(api, { start }) ("teach by playing")
//
// Tiny Brains in this game show in the panel too (a Dial or an Examples learner as one line): skill, the player's win rate against its target,
// trust (how often it decides instead of its teacher), the fun lean, how torn it is, and any tell.
// The panel shows frames per second, how long update() and draw() take, the game's size, score and
// state. Hitboxes: give your game object a debug(c) method that outlines whatever you like, in game
// units (physics2d's world.debugDraw(c) outlines every body); it's drawn on top while H is on.
import { liveBrains } from './kit/brains.js';
const SPEEDS = [.1, .25, .5, 1, 2];
const pct = v => (v * 100).toFixed(0).padStart(3) + '%';
function brainLines(s) {
  return liveBrains(s).slice(0, 6).map(b => {
    if (b.examples) return `${b.name}  examples ${b.count()} of ${b.names.length} name${b.names.length === 1 ? '' : 's'}`;
    if (b.coach) return `${b.name}  coach ${b.corrections.length} correction${b.corrections.length === 1 ? '' : 's'}  heed ${b.heed}`;
    if (b.dial) return `${b.name}  dial ${pct(b.skill)}  win ${pct(b.winRate)}/${pct(b.target)}  rounds ${b.rounds}`;
    if (b.habits) return `${b.name}  met ${b.record.met}  you ${b.record.wins}-${b.record.losses}  habit ${b.habit ? b.habit.move : '-'}`;
    if (!b.target) return `${b.name}  copies you ${pct(b.like)}  seen ${b.seen}${b.ready ? '  ready' : ''}`;
    const t = b.telling;
    return `${b.name}${b.style ? ' (' + b.style + ')' : ''}  skill ${pct(b.skill)}  win ${pct(b.winRate)}/${pct(b.target)}\n` +
      `  trust ${pct(b.trust)}  lean ${b.lean >= 0 ? '+' : ''}${b.lean.toFixed(2)}  torn ${pct(b.unsure)}${t ? '  tell ' + t.action : ''}${b.fix && b.fix.count ? `  corrections ${b.fix.count} (heeds ${b.heed})` : ''}`;
  });
}
function copyBrains(s) {
  const packs = liveBrains(s).filter(b => b.pack || (b.coach && b.fix && b.fix.count)).map(b => (b.pack ? `${b.name}: '${b.pack()}'` : '') + (b.fix && b.fix.count ? `${b.pack ? '\n' : ''}${b.name} corrections: ${JSON.stringify(b.corrections)}` : ''));
  if (!packs.length) { console.info('[debug] this game has no Tiny Brains'); return; }
  const text = packs.join('\n');
  console.info('[debug] starting brains (use as new Brain(api, { start: ... }); corrections as { corrections: [...] }):\n' + text);
  try { navigator.clipboard?.writeText(text); } catch (_) {}
}

export function makeDebug() {
  const D = { on: false, boxes: true, speed: 3, paused: false, steps: 0, el: null, fps: 60, upd: 0, drw: 0, lastPaint: 0 };
  const panel = () => {
    if (D.el) return D.el;
    const el = document.createElement('div');
    el.className = 'gs-debug';
    el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;font:12px/1.35 ui-monospace,Menlo,monospace;color:#d8ffe0;background:#000c;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre;min-width:180px';
    document.body.appendChild(el);
    return D.el = el;
  };
  D.toggle = (v = !D.on) => { D.on = v; panel().style.display = v ? '' : 'none'; if (!v) { D.paused = false; D.speed = 3; } return v; };
  addEventListener('keydown', e => {
    if (e.key === '`' || e.key === 'F2') { D.toggle(); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (!D.on) return;
    const k = e.key.toLowerCase(); let used = true;
    if (k === '[') D.speed = Math.max(0, D.speed - 1);
    else if (k === ']') D.speed = Math.min(SPEEDS.length - 1, D.speed + 1);
    else if (k === 'p') D.paused = !D.paused;
    else if (k === '.') { D.paused = true; D.steps++; }
    else if (k === 'h') D.boxes = !D.boxes;
    else if (k === 'b') { if (D.s) copyBrains(D.s); }
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  /** The game's dt this frame, and whether update() should run at all. */
  D.time = dt => {
    if (!D.on) return { dt, run: true };
    if (D.paused) { if (D.steps > 0) { D.steps--; return { dt: 1 / 60, run: true }; } return { dt: 0, run: false }; }
    return { dt: dt * SPEEDS[D.speed], run: true };
  };
  /** After the frame is painted: hitboxes and the stats panel. */
  D.after = (s, upd, drw, now) => {
    if (!D.on) return;
    D.s = s;
    if (D.lastPaint) D.fps = D.fps * .92 + (1000 / Math.max(1, now - D.lastPaint)) * .08;
    D.lastPaint = now; D.upd = D.upd * .9 + upd * .1; D.drw = D.drw * .9 + drw * .1;
    if (D.boxes && s.game.debug) { const c = s.ctx; c.save(); try { s.game.debug(c); } catch (e) { console.warn('[debug]', e); } c.restore(); }
    panel().textContent =
      `${s.def.id}  ${s.state}${D.paused ? '  PAUSED' : ''}\n` +
      `fps ${D.fps.toFixed(0).padStart(3)}   speed ${SPEEDS[D.speed]}x\n` +
      `update ${D.upd.toFixed(2)} ms  draw ${D.drw.toFixed(2)} ms\n` +
      `size ${s.w}x${s.h}  score ${s.score}${s.def.goal ? '/' + s.def.goal : ''}\n` +
      `hitboxes ${s.game.debug ? (D.boxes ? 'on' : 'off') : '(add debug(c))'}\n` +
      brainLines(s).map(l => l + '\n').join('') +
      '[ ] speed  P pause  . step  H boxes  B brains';
  };
  if (/[?&]debug\b/.test(location.search)) D.toggle(true);
  return D;
}
