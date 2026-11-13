// Checks what the app itself does around a game (not what a game does): keeping the screen on during a
// round, finer touch, even pixels and the LCD look for pocket games, the one-line soundtrack, the bigger
// save that stays on the phone, the font library, the 2D looks (materials, slabs, water, stickers, sketch pen, ink, icons),
// the phone test tour (a bot that plays as a guest, the frame report, the plugin check, the engine test scenes), and loading a big
// 3D game a little each frame (each pass on a fresh copy of the game's file), getting a 3D round ready behind
// a loading screen after Play (its first frames and its first update, before the round starts), the fill-ins for
// old WebViews, and that a test build sends no play stats or crash reports.
// Usage: npm run build:bundled && node scripts/app-test.cjs [awake|touch|pixels|music|saves|fonts|looks|tour|loading|ready|oldweb|reports]   (SHOTS=<dir> saves a picture of every font and look)
const { chromium } = require('playwright');

let failed = 0;
const check = (ok, what, more = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !more ? '' : '\n     ' + more}`); };
const PIXEL = 'arrow-maze', CASUAL = 'stack';

async function open(b, { width = 390, height = 844, dpr = 3, before } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: dpr });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  if (before) await p.addInitScript(before);
  await p.goto('http://localhost:4184/'); await p.waitForFunction(() => window.__gs, null, { timeout: 60000 }); await p.waitForTimeout(300);
  p.game = async (id, change) => {
    if (change) await p.evaluate(([id, change]) => Object.assign(__gs.GAMES.find(g => g.id === id), change), [id, change]);
    await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(250);
    await p.waitForFunction(() => __gs.active && !__gs.active.loading, null, { timeout: 60000 });
  };
  p.done = async () => { check(!p.errs.length, 'no page errors', p.errs.join('\n     ')); await ctx.close(); };
  return p;
}

/* ---------- the screen stays on during a round, and only then ---------- */
async function awake(b) {
  console.log('\nKeep awake');
  // a stand-in for the browser's screen wake lock that counts what's asked of it
  const p = await open(b, { before: () => {
    window.__wl = { asked: 0, freed: 0 };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { __wl.asked++; return { release: async () => { __wl.freed++; }, addEventListener() {} }; } } });
  } });
  const wl = () => p.evaluate(() => ({ ...__wl, on: __gs.awake.on, can: __gs.awake.can }));
  await p.game(CASUAL); await p.waitForTimeout(300);
  let s = await wl(); check(s.asked === 0 && !s.on, 'a card waiting in the feed asks for nothing', JSON.stringify(s));
  await p.evaluate(() => __gs.start()); await p.waitForTimeout(400);
  s = await wl(); check(s.asked === 1 && s.freed === 0 && s.on && s.can === true, 'starting a round keeps the screen on (asked once)', JSON.stringify(s));
  await p.waitForTimeout(600);
  s = await wl(); check(s.asked === 1, 'and it is not asked again every frame', JSON.stringify(s));
  // the page goes to the background: the round pauses, the screen may sleep
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(400);
  s = await wl(); const paused = await p.evaluate(() => !!__gs.active.paused);
  check(paused && !s.on && s.freed >= 1, 'a paused round lets the screen sleep', JSON.stringify({ paused, ...s }));
  await p.evaluate(() => { delete document.hidden; });
  await p.done();

  const q = await open(b, { before: () => {
    window.__wl = { asked: 0, freed: 0 };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { __wl.asked++; return { release: async () => { __wl.freed++; }, addEventListener() {} }; } } });
  } });
  await q.game(CASUAL); await q.evaluate(() => __gs.start()); await q.waitForTimeout(400);
  await q.evaluate(() => __gs.api(__gs.active).over()); await q.waitForTimeout(400);
  s = await q.evaluate(() => ({ ...__wl, on: __gs.awake.on }));
  check(s.asked === 1 && s.freed === 1 && !s.on, 'game over lets the screen sleep again', JSON.stringify(s));
  await q.done();

  // a browser with no wake lock: asked once, then left alone (and the game still plays)
  const r = await open(b, { before: () => { try { delete Navigator.prototype.wakeLock; } catch (_) {} } });
  await r.game(CASUAL); await r.evaluate(() => __gs.start()); await r.waitForTimeout(500);
  s = await r.evaluate(() => ({ has: 'wakeLock' in navigator, on: __gs.awake.on, can: __gs.awake.can, state: __gs.active.state }));
  check(!s.has && !s.on && s.can === false && s.state === 'playing', 'a browser that cannot keep the screen on is asked once and the round plays on', JSON.stringify(s));
  await r.done();
}

/* ---------- finer touch ---------- */
async function touch(b) {
  console.log('\nFiner touch');
  const run = async fine => {
    const p = await open(b);
    await p.game(CASUAL, { touch: fine ? 'fine' : undefined });
    await p.evaluate(() => __gs.start()); await p.waitForTimeout(200);
    const out = await p.evaluate(async () => {
      const s = __gs.active, cv = s.canvas, r = cv.getBoundingClientRect(), got = [];
      s.game.down = () => {}; s.game.up = () => {}; s.game.move = (x, y, pressed, id) => got.push([Math.round(x), Math.round(y), pressed, id]);
      const ev = (type, x, y, more) => new PointerEvent(type, { pointerId: 7, bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, pointerType: 'touch', isPrimary: true, ...more });
      const k = r.width / s.w;                                    // page pixels per game unit
      cv.dispatchEvent(ev('pointerdown', 10 * k, 10 * k));
      const part = (x, y) => ev('pointermove', x * k, y * k);
      // one move from the browser with four readings inside it, and a guess at where the finger is going
      const guess = [part(60, 60), part(70, 70)]; for (const g of guess) Object.defineProperty(g, 'timeStamp', { value: performance.now() + 4 });
      cv.dispatchEvent(ev('pointermove', 50 * k, 50 * k, { coalescedEvents: [part(20, 20), part(30, 30), part(40, 40), part(50, 50)], predictedEvents: guess }));
      const four = got.splice(0), ahead = s.api.ahead(7), any = s.api.ahead();
      // twelve readings: only the newest eight are handed over
      cv.dispatchEvent(ev('pointermove', 132 * k, 132 * k, { coalescedEvents: Array.from({ length: 12 }, (_, i) => part(22 + i * 10, 22 + i * 10)) }));
      const twelve = got.splice(0);
      cv.dispatchEvent(ev('pointerup', 132 * k, 132 * k));
      const after = s.api.ahead(7);
      return { four, twelve, ahead, any, after };
    });
    await p.done();
    return out;
  };
  const f = await run(true), plain = await run(false);
  check(f.four.length === 4 && f.four.map(m => m[0]).join() === '20,30,40,50' && f.four.every(m => m[2] === true && m[3] === 7), "touch: 'fine' gets every reading, oldest first", JSON.stringify(f.four));
  check(f.twelve.length === 8 && f.twelve[0][0] === 62 && f.twelve[7][0] === 132, 'never more than the newest eight in one move', JSON.stringify(f.twelve));
  check(plain.four.length === 1 && plain.four[0][0] === 50 && plain.twelve.length === 1, 'a game that did not ask gets one move per refresh, as before', JSON.stringify(plain.four));
  check(Array.isArray(f.ahead) && Math.abs(f.ahead[0] - 70) < 1.5 && Array.isArray(plain.ahead) && Array.isArray(f.any), 'api.ahead() is where the finger is heading, in game units', JSON.stringify([f.ahead, plain.ahead, f.any]));
  check(f.after === null, 'and nothing once the finger is up', JSON.stringify(f.after));
}

/* ---------- even pixels and the LCD look ---------- */
async function pixels(b) {
  console.log('\nEven pixels');
  const look = p => p.evaluate(() => {
    const s = __gs.active, r = s.canvas.getBoundingClientRect(), n = s.n, o = s.canvas.getContext('2d'), g = s.ctx;
    // every game pixel must be one flat n x n block on the card's canvas, the colour the game drew
    let bad = 0, tried = 0;
    const big = o.getImageData(0, 0, s.canvas.width, s.canvas.height).data, small = g.getImageData(0, 0, s.w, s.h).data;
    const at = (x, y) => { const i = (y * s.canvas.width + x) * 4; return big[i] << 16 | big[i + 1] << 8 | big[i + 2]; };
    for (let y = 0; y < s.h; y += 3) for (let x = 0; x < s.w; x += 3) {
      const i = (y * s.w + x) * 4, want = small[i] << 16 | small[i + 1] << 8 | small[i + 2]; tried++;
      if (at(x * n, y * n) !== want || at(x * n + (n >> 1), y * n + (n >> 1)) !== want || (!s.lcd && at(x * n + n - 1, y * n + n - 1) !== want)) bad++;
    }
    // with the grid on, the last row and column of a block are tinted towards the grid colour
    let lines = 0; if (s.lcd) for (let y = 0; y < s.h; y += 3) for (let x = 0; x < s.w; x += 3) if (at(x * n + n - 1, y * n + 1) !== at(x * n + 1, y * n + 1)) lines++;
    return { w: s.w, h: s.h, n, cw: s.canvas.width, ch: s.canvas.height, cssW: r.width, cssH: r.height, dpr: devicePixelRatio, smooth: getComputedStyle(s.canvas).imageRendering, bad, tried, lines, lcd: s.lcd, ghost: !!s.gbuf };
  });
  for (const [width, height, dpr] of [[390, 844, 3], [412, 915, 2.625], [374, 591, 3], [549, 735, 3], [1280, 800, 1]]) {
    const p = await open(b, { width, height, dpr });
    await p.game(PIXEL); await p.evaluate(() => __gs.start()); await p.waitForTimeout(500);
    const v = await look(p), sx = v.cssW * v.dpr / v.w, sy = v.cssH * v.dpr / v.h, name = `${width}x${height} @${dpr}`;
    check(Number.isInteger(v.n) && v.cw === v.w * v.n && v.ch === v.h * v.n && v.bad === 0, `${name}: each game pixel is a whole ${v.n} x ${v.n} block`, JSON.stringify(v));
    check(Math.abs(sx - sy) < .02, `${name}: pixels are square on screen (${sx.toFixed(3)} by ${sy.toFixed(3)} screen pixels)`);
    check((v.n >= sx - .03 || v.w * v.h * (v.n + 1) ** 2 > 2.4e6) && v.n < sx + 1 && v.smooth === 'auto', `${name}: copied up to the next whole size (or the biggest allowed), then smoothed`, JSON.stringify(v));
    check(v.cw * v.ch <= 2.4e6, `${name}: the card's canvas stays under 2.4 million pixels`);
    await p.done();
  }
  console.log('\nLCD look');
  for (const [dpr, lcd] of [[3, true], [2.625, true], [3, { grid: 0, ghost: .5 }], [3, { ghost: false }]]) {
    const p = await open(b, { dpr });
    await p.game(PIXEL, { lcd }); await p.evaluate(() => __gs.start()); await p.waitForTimeout(500);
    const v = await look(p), sx = v.cssW * v.dpr / v.w, name = `@${dpr} lcd: ${JSON.stringify(lcd)}`;
    const grid = lcd === true || lcd.grid !== 0, ghost = lcd === true || lcd.ghost !== false;
    check(v.bad === 0 && (!grid || Math.abs(sx - Math.round(sx)) < .01 && v.n === Math.round(sx)), `${name}: ${grid ? 'a game pixel is a whole number of screen pixels (' + sx.toFixed(3) + ')' : 'pixels still whole blocks'}`, JSON.stringify(v));
    check(grid ? v.lines > v.tried * .2 : v.lines === 0, `${name}: ${grid ? 'grid lines are drawn between pixels' : 'no grid'}`, `${v.lines} of ${v.tried}`);
    check(v.ghost === ghost, `${name}: ${ghost ? 'ghosting is running' : 'no ghosting'}`);
    await p.done();
  }
  // a ghosting screen settles on exactly the game's picture once nothing moves (no marks left behind)
  const p = await open(b);
  await p.game(PIXEL, { lcd: { grid: 0, ghost: .8 } }); await p.evaluate(() => __gs.start()); await p.waitForTimeout(300);
  const settle = await p.evaluate(async () => {
    const s = __gs.active, g = s.ctx, o = s.canvas.getContext('2d'), n = s.n, real = s.game.draw; let col = '#000';
    s.game.update = () => {}; s.game.draw = c => { c.fillStyle = col; c.fillRect(0, 0, s.w, s.h); };
    const frames = k => new Promise(r => { const f = () => (k-- > 0 ? requestAnimationFrame(f) : r()); f(); });
    const mid = () => o.getImageData((s.w >> 1) * n + 1, (s.h >> 1) * n + 1, 1, 1).data[0];
    await frames(40); const black = mid(); col = '#fff'; await frames(2); const soon = mid(); await frames(90); const white = mid();
    s.game.draw = real; return { black, soon, white };
  });
  check(settle.black === 0 && settle.soon > 20 && settle.soon < 235 && settle.white === 255, 'ghosting fades in over a few frames and settles on the true colour', JSON.stringify(settle));
  await p.done();
}

/* ---------- a soundtrack in one line ---------- */
async function music(b) {
  console.log('\nOne-line soundtrack');
  const now = p => p.evaluate(() => __gs.soundtrack.now);
  let p = await open(b);
  await p.game(CASUAL); await p.evaluate(() => __gs.start()); await p.waitForTimeout(300);
  check(await now(p) === null, 'a game with no music in its definition gets none');
  await p.done();

  p = await open(b);
  await p.game(PIXEL, { music: 'puzzle' }); await p.waitForTimeout(200);
  check(await now(p) === null, 'nothing plays while the card waits in the feed');
  await p.evaluate(() => __gs.start()); await p.waitForTimeout(900);
  let a = await now(p);
  check(a && a.id === PIXEL && a.playing && a.mood === 'puzzle' && a.set === 'chip' && a.tuned && a.pos > 0, "music: 'puzzle' plays through the round; a pocket game gets the chip sound", JSON.stringify(a));
  await p.waitForTimeout(500); const b2 = await now(p);
  check(b2.pos > a.pos, 'and the tune moves on', `${a.pos} then ${b2.pos}`);
  // scoring lifts it; getting near the goal builds it
  const calm = b2.tension;
  await p.evaluate(() => { const s = __gs.active, api = __gs.api(s); api.score(Math.max(1, Math.round(s.def.goal * .6))); }); await p.waitForTimeout(700);
  const up = await now(p);
  check(up.tension > calm + .2 && up.level > b2.level, 'scoring towards the goal builds the music', `tension ${calm.toFixed(2)} then ${up.tension.toFixed(2)}, level ${b2.level.toFixed(2)} then ${up.level.toFixed(2)}`);
  // pause holds it, resume carries on
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }); await p.waitForTimeout(300);
  const held = await now(p);
  check(held && !held.playing, 'pause holds the music', JSON.stringify(held));
  await p.evaluate(() => { delete document.hidden; });
  await p.evaluate(() => __gs.api(__gs.active).over()); await p.waitForTimeout(300);
  check(await now(p) === null, 'and it stops at game over');
  await p.done();

  p = await open(b);
  await p.game(CASUAL, { music: { mood: 'heroic', vol: .6 } }); await p.waitForTimeout(300); await p.evaluate(() => __gs.start());
  await p.waitForFunction(() => __gs.soundtrack.now && __gs.soundtrack.now.tuned, null, { timeout: 30000 }).catch(() => {});
  a = await now(p);
  check(a && a.playing && a.set === 'orchestra' && a.tuned, 'a phone-style game with a heroic tune gets the orchestra, once its instruments are in', JSON.stringify(a));
  await p.game(PIXEL, {}); await p.waitForTimeout(400);
  check(await now(p) === null, 'leaving the game stops it');
  await p.done();

  p = await open(b);
  await p.game(CASUAL, { music: 'polka' }); await p.evaluate(() => __gs.start()); await p.waitForTimeout(300);
  check(await now(p) === null && await p.evaluate(() => __gs.active.state) === 'playing', 'a mood that does not exist plays nothing and breaks nothing');
  await p.done();
}

/* ---------- the bigger save that stays on the phone ---------- */
async function saves(b) {
  console.log('\nPhone-only save');
  // the game asks for its phone save in make(), as a real one would, and notes what it got
  const patch = () => p => p.evaluate(id => {
    const d = __gs.GAMES.find(g => g.id === id), make = d.make; window.__ll = { makes: 0, got: [], told: null };
    d.maxH = 900;   // a game that fills tall screens: it is told its size through resize(w, h)
    d.make = api => { __ll.makes++; __ll.got.push(api.loadLocal('nothing yet')); const g = make(api), rs = g.resize; g.resize = (w, h) => { g._told = [w, h]; rs && rs.call(g, w, h); }; return g; };
  }, CASUAL);
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const page = async () => {
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.goto('http://localhost:4184/'); await p.waitForFunction(() => window.__gs, null, { timeout: 60000 }); await p.waitForTimeout(300);
    await patch()(p);
    await p.evaluate(id => __gs.only(id), CASUAL);
    return p;
  };
  const settled = p => p.waitForFunction(() => __gs.active && !__gs.active.loading && __ll.got.length, null, { timeout: 30000 });
  let p = await page();
  const first = await p.evaluate(() => ({ loading: !!__gs.active.loading, makes: __ll.makes, got: __ll.got.length }));
  await settled(p);
  let s = await p.evaluate(() => ({ ...__ll, loading: !!__gs.active.loading }));
  // (the feed may hold more than one card of the game, so count makes per card: each is made, waits, and is made again)
  check(first.makes >= 1 && first.got === 0 && first.loading, 'the first loadLocal() in make() shows "Loading…" while the phone\'s save is read', JSON.stringify(first));
  // (a card made after the read finished doesn't wait, so makes is at most twice the answers given)
  check(s.makes >= first.makes * 2 && s.got.length >= first.makes && s.makes > s.got.length && s.got.every(g => g === 'nothing yet') && !s.loading, 'then the game is made again and gets its fallback (nothing saved yet)', JSON.stringify(s));
  const size = await p.evaluate(() => ({ card: [__gs.active.w, __gs.active.h], told: __gs.active.game._told, def: [__gs.active.def.w, __gs.active.def.h] }));
  check(size.card[1] > size.def[1] && size.told && size.told[0] === size.card[0] && size.told[1] === size.card[1], 'and the game made again is told the size its card has (a tall screen is filled)', JSON.stringify(size));
  // a big world: far over the cloud slot's 8 KB
  const big = await p.evaluate(() => {
    const api = __gs.api(__gs.active), world = { name: 'my island', tiles: Array.from({ length: 60000 }, (_, i) => (i * 7919) % 23) };
    const text = JSON.stringify(world);
    return { size: text.length, cloud: api.save(world), local: api.saveLocal(world), tooBig: api.saveLocal({ a: 'x'.repeat(600 * 1024) }), back: JSON.stringify(api.loadLocal(null)) === text };
  });
  check(big.size > 100000 && !big.cloud && big.local && !big.tooBig && big.back, `a ${Math.round(big.size / 1024)} KB world is too big for the cloud save, fits the phone save, and reads back at once (over 512 KB is turned away)`, JSON.stringify(big));
  await p.waitForTimeout(600);
  const disk = await p.evaluate(() => new Promise(res => { const rq = indexedDB.open('gs-local'); rq.onsuccess = () => { const g = rq.result.transaction('saves').objectStore('saves').get('stack'); g.onsuccess = () => res(g.result ? { z: g.result.z ? g.result.z.byteLength : 0, text: !!g.result.text } : null); }; }));
  check(disk && disk.z > 0 && disk.z < big.size / 2, `it is on the phone's database, packed (${disk && disk.z} bytes)`, JSON.stringify(disk));
  check(!p.errs.length, 'no page errors', p.errs.join('\n     ')); await p.close();

  // the app is opened again: the save is there, after the same short wait
  p = await page(); await settled(p);
  s = await p.evaluate(() => ({ makes: __ll.makes, n: __ll.got.length, all: __ll.got.every(g => g && g.name === 'my island' && g.tiles && g.tiles.length === 60000), t5: __ll.got[0] && __ll.got[0].tiles && __ll.got[0].tiles[5] }));
  check(s.n >= 1 && s.makes > s.n && s.all && s.t5 === (5 * 7919) % 23, 'after the app is opened again the game gets its world back', JSON.stringify(s));
  // Play again (reset) and a new round read it without waiting again
  await p.evaluate(() => __gs.start()); await p.waitForTimeout(200);
  s = await p.evaluate(() => ({ state: __gs.active.state, again: __gs.api(__gs.active).loadLocal(null).name }));
  check(s.state === 'playing' && s.again === 'my island', 'once read, loadLocal() answers straight away, mid-round too', JSON.stringify(s));
  await p.evaluate(() => __gs.api(__gs.active).clearLocal()); await p.waitForTimeout(500);
  check(!p.errs.length, 'no page errors', p.errs.join('\n     ')); await p.close();

  p = await page(); await settled(p);
  s = await p.evaluate(() => __ll.got[0]);
  check(s === 'nothing yet', 'clearLocal() removes it for good', JSON.stringify(s));
  check(!p.errs.length, 'no page errors', p.errs.join('\n     ')); await ctx.close();

  // a browser whose database can't be opened (private modes): the game still starts, with its fallback
  const q = await open(b, { before: () => { IDBFactory.prototype.open = function () { const rq = {}; setTimeout(() => rq.onerror && rq.onerror(), 20); return rq; }; } });
  await q.evaluate(id => { const d = __gs.GAMES.find(g => g.id === id), make = d.make; window.__ll = { got: [] }; d.make = api => { __ll.got.push(api.loadLocal('fallback')); return make(api); }; }, CASUAL);
  await q.evaluate(id => __gs.only(id), CASUAL);
  await q.waitForFunction(() => __gs.active && !__gs.active.loading && __ll.got.length, null, { timeout: 30000 });
  s = await q.evaluate(() => ({ got: __ll.got, ok: __gs.api(__gs.active).saveLocal({ a: 1 }), back: __gs.api(__gs.active).loadLocal(null) }));
  await q.evaluate(() => __gs.start()); await q.waitForTimeout(200);
  check(s.got[0] === 'fallback' && s.ok && s.back && s.back.a === 1 && await q.evaluate(() => __gs.active.state) === 'playing', 'with no database the game starts with its fallback and keeps the save for this session', JSON.stringify(s));
  q.errs = q.errs.filter(e => !/indexedDB|IDB/i.test(e)); await q.done();
}

/* ---------- the font library ---------- */
async function fonts(b) {
  console.log('\nFont library');
  const p = await open(b);
  const asked = []; p.on('request', r => { if (/\.woff2?(\?|$)/.test(r.url())) asked.push(r.url()); });
  await p.game(CASUAL);
  const list = await p.evaluate(() => __gs.kits.fonts.list.map(f => ({ ...f })));
  check(list.length === 19 && list.filter(f => f.pixel).length === 5 && list.every(f => f.name && f.look && f.weights.length), '19 fonts are listed: Rubik, 13 display fonts and 5 pixel fonts', list.map(f => f.name).join(', '));
  const library = () => asked.filter(u => !/rubik|press-start/.test(u));
  check(library().length === 0, 'none of the library is fetched until a game names a font', library().join(' '));
  // a font named in draw(): the string for c.font at once, the file on first use, the fallback until it is in
  let s = await p.evaluate(() => {
    const F = __gs.kits.fonts, g = document.createElement('canvas').getContext('2d'), css = F.font('Bangers', 30);
    g.font = css; return { css, ready: F.ready('Bangers'), w: g.measureText('KA-POW! 123').width };
  });
  check(s.css === '400 30px "Bangers", Rubik, sans-serif' && !s.ready, 'font(name, size) gives the string for c.font before the font is in', JSON.stringify(s));
  await p.waitForFunction(() => __gs.kits.fonts.ready('Bangers'), null, { timeout: 15000 });
  let t = await p.evaluate(() => { const g = document.createElement('canvas').getContext('2d'); g.font = __gs.kits.fonts.font('Bangers', 30); return { w: g.measureText('KA-POW! 123').width, ok: document.fonts.check('30px "Bangers"') }; });
  check(t.ok && Math.abs(t.w - s.w) > 4 && library().length === 1 && /bangers/.test(library()[0]), 'the font loads on first use (one file), and the text then draws in it', JSON.stringify({ before: s.w, after: t.w, files: library().length }));
  // names: any case; the nearest weight the font has; an unknown name is Rubik
  s = await p.evaluate(() => { const F = __gs.kits.fonts; let threw = ''; try { F.use('Nope'); } catch (e) { threw = e.message; } return { a: F.font('orbitron', 20, 900), b: F.font('Nope', 20), c: F.font('Courier Prime', 12, 700), d: F.font('silkscreen', 8), threw }; });
  check(s.a === '800 20px "Orbitron", Rubik, sans-serif' && s.b === '400 20px "Rubik", sans-serif' && s.c === '700 12px "Courier Prime", monospace' && s.d === '400 8px "Silkscreen", monospace', 'names in any case, the nearest weight a font has, and Rubik for a name it does not know', JSON.stringify(s));
  check(/no font called "Nope"/.test(s.threw) && /Bangers/.test(s.threw), 'use() with an unknown name says which fonts there are', s.threw);
  // every file: each weight of each font loads and draws
  const all = await p.evaluate(async () => {
    const F = __gs.kits.fonts, bad = [];
    for (const f of F.list) for (const w of f.weights) F.font(f.name, 20, w);
    const end = performance.now() + 20000;
    while (performance.now() < end && !F.list.every(f => f.weights.every(w => F.ready(f.name, w)))) await new Promise(r => setTimeout(r, 100));
    for (const f of F.list) for (const w of f.weights) if (!F.ready(f.name, w) || !document.fonts.check(`${w} 20px "${f.name}"`)) bad.push(f.name + ' ' + w);
    return bad;
  });
  check(!all.length && library().length === 22, 'every font and weight in the library loads (22 files)', JSON.stringify({ notLoaded: all, files: library().length }));
  check(library().every(u => u.startsWith('http://localhost:4184/')), 'and they come from inside the app, not the network');
  await p.done();

  // use() in make(): "Loading…" first, then the game is made again with the font in
  const q = await open(b);
  await q.evaluate(id => { const d = __gs.GAMES.find(g => g.id === id), make = d.make; window.__f = { makes: 0, ready: [], draws: 0, below: 0 }; d.make = api => { __f.makes++; __gs.kits.fonts.use('Orbitron', ['Fredoka', 700]); __f.ready.push(__gs.kits.fonts.ready('Orbitron') && __gs.kits.fonts.ready('Fredoka', 700)); const g = make(api), dr = g.draw; g.draw = (...a) => { if (__gs.active?.game === g) __f.draws++; else __f.below++; return dr.apply(g, a); }; return g; }; }, CASUAL);
  await q.evaluate(id => __gs.only(id), CASUAL);
  const first = await q.evaluate(() => ({ loading: !!__gs.active.loading, makes: __f.makes, ready: __f.ready.length }));
  await q.waitForFunction(() => __gs.active && !__gs.active.loading && __f.ready.length, null, { timeout: 30000 });
  s = await q.evaluate(() => ({ ...__f, loading: !!__gs.active.loading }));
  check(first.loading && first.ready === 0 && s.ready.every(Boolean) && s.makes > s.ready.length, 'use() in make() shows "Loading…" until the fonts are in, then the game is made with them', JSON.stringify({ first, then: s }));
  // a card waiting in the feed is drawn again when a font arrives later
  // (draws counts the card on screen. The feed goes on adding cards of the same game below it, one at a time when it is calm, and each
  // is drawn once as it arrives: on a slow machine that is not over by now, and one of those was counted as the waiting card drawn again)
  await q.waitForTimeout(700); const idle = await q.evaluate(() => __f.draws); await q.waitForTimeout(500);
  const still = await q.evaluate(() => { const n = __f.draws; __gs.kits.fonts.font('Rye', 20); return n; });
  await q.waitForFunction(() => __gs.kits.fonts.ready('Rye'), null, { timeout: 15000 }); await q.waitForTimeout(400);
  const after = await q.evaluate(() => __f.draws);
  check(still === idle && after > still, 'a waiting card is not redrawn every frame, but is drawn again when a font arrives', JSON.stringify({ idle, still, after, below: await q.evaluate(() => __f.below) }));
  await q.done();

  // pixel text in the pixel fonts: crisp (every pixel fully on or off), at the size where the font's pixels are the game's
  const r = await open(b);
  await r.game(PIXEL);
  const before = await r.evaluate(() => { const c = document.createElement('canvas'); c.width = 300; c.height = 40; return __gs.kits.pixel.text(c.getContext('2d'), 'Score 12', 0, 0, { font: 'tiny' }); });
  await r.waitForFunction(() => __gs.kits.fonts.ready('Tiny5'), null, { timeout: 15000 });
  const px = await r.evaluate(async () => {
    const F = __gs.kits.fonts, P = __gs.kits.pixel, out = {};
    for (const f of ['silkscreen', 'silkscreen bold', 'tiny', 'jersey', 'terminal']) P.text(document.createElement('canvas').getContext('2d'), 'x', 0, 0, { font: f });
    const end = performance.now() + 15000;
    while (performance.now() < end && !(F.ready('Silkscreen') && F.ready('Silkscreen', 700) && F.ready('Jersey 10') && F.ready('VT323'))) await new Promise(r => setTimeout(r, 100));
    for (const f of ['silkscreen', 'silkscreen bold', 'tiny', 'jersey', 'terminal', 'big']) {
      const c = document.createElement('canvas'); c.width = 400; c.height = 60; const g = c.getContext('2d', { willReadFrequently: true });
      const w = P.text(g, 'HIGH Score 120', 0, 0, { font: f, color: '#ffffff' }), a = g.getImageData(0, 0, 400, 60).data;
      let soft = 0, on = 0; for (let i = 3; i < a.length; i += 4) { if (a[i] > 0) on++; if (a[i] > 0 && a[i] < 255) soft++; }
      const capH = (() => { const t = document.createElement('canvas'); t.width = 40; t.height = 40; const k = t.getContext('2d', { willReadFrequently: true }); P.text(k, 'H', 0, 0, { font: f }); const d = k.getImageData(0, 0, 40, 40).data; let rows = 0; for (let y = 0; y < 40; y++) { let any = false; for (let x = 0; x < 40; x++) if (d[(y * 40 + x) * 4 + 3]) any = true; if (any) rows++; } return rows; })();
      out[f] = { w, soft, on, capH, m: P.measure('HIGH Score 120', f) };
    }
    return out;
  });
  check(before === 64, 'until a pixel font is in, its text draws in the 8 by 8 font', 'width ' + before);
  check(Object.values(px).every(v => v.soft === 0 && v.on > 50), 'every pixel font draws hard pixels (each fully on or off)', JSON.stringify(px));
  check(px.silkscreen.capH === 5 && px['silkscreen bold'].capH === 5 && px.tiny.capH === 5 && px.jersey.capH === 10 && px.terminal.capH === 14 && px.big.capH === 7, 'capitals are 5 (Silkscreen, Tiny5), 10 (Jersey 10), 14 (VT323) and 7 (the 8 by 8 font) pixels high', JSON.stringify(Object.fromEntries(Object.entries(px).map(([k, v]) => [k, v.capH]))));
  check(px.tiny.w < px.silkscreen.w && px.silkscreen.w < px.big.w && Object.entries(px).every(([f, v]) => v.m.w === v.w), 'Tiny5 fits the most on a line, and measure() agrees with what is drawn', JSON.stringify(Object.fromEntries(Object.entries(px).map(([k, v]) => [k, [v.w, v.m.w]]))));
  if (process.env.SHOTS) {
    await r.evaluate(async () => {
      const F = __gs.kits.fonts, P = __gs.kits.pixel; for (const f of F.list) for (const w of f.weights) F.font(f.name, 20, w);
      const end = performance.now() + 20000; while (performance.now() < end && !F.list.every(f => f.weights.every(w => F.ready(f.name, w)))) await new Promise(r => setTimeout(r, 100));
      document.body.innerHTML = '<canvas id="spec" width="390" height="844" style="position:fixed;inset:0;width:390px;height:844px;z-index:99999;image-rendering:pixelated"></canvas>';
      const c = document.getElementById('spec').getContext('2d'); c.fillStyle = '#141a2b'; c.fillRect(0, 0, 390, 844); let y = 30;
      for (const f of F.list.filter(f => !f.pixel)) { c.fillStyle = '#fff'; c.font = F.font(f.name, 24, f.weights.at(-1)); c.fillText('Level 7: ' + f.name, 12, y); c.fillStyle = '#8fa3c8'; c.font = F.font('Rubik', 10); c.fillText(f.look, 12, y + 13); y += 44; }
      c.imageSmoothingEnabled = false;
      for (const f of ['small', 'big', 'silkscreen', 'silkscreen bold', 'tiny', 'jersey', 'terminal']) { const h = P.measure('Ag', f).h * 2; P.text(c, f === 'small' ? 'SCORE 120 GAME OVER (SMALL)' : 'Score 120 Game Over (' + f + ')', 12, y, { font: f, size: 2, color: '#ffd23f' }); y += h + 8; }
    });
    await r.screenshot({ path: process.env.SHOTS + '/fonts.png' });
  }
  await r.done();
}

/* ---------- 2D looks: materials, slabs, water, stickers, the sketch pen, ink, icons ---------- */
async function looks(b) {
  console.log('\n2D looks');
  const p = await open(b);
  await p.game(CASUAL);
  await p.evaluate(async () => {
    const m = await __gs.gs(); await m.loadParts(['sketch', 'icons']); window.gs = m.default;
    // a canvas like a game's: `scale` screen pixels to a game unit; px(x, y) reads the pixel at a game position
    window.board = (w = 200, h = 120, scale = 2) => {
      const cv = document.createElement('canvas'); cv.width = w * scale; cv.height = h * scale; const c = cv.getContext('2d', { willReadFrequently: true }); c.scale(scale, scale);
      c.px = (x, y) => [...c.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data];
      c.box = (x, y, bw, bh) => c.getImageData(Math.round(x * scale), Math.round(y * scale), Math.round(bw * scale), Math.round(bh * scale)).data;
      return c;
    };
    window.same = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 2);
    window.spread = d => { let lo = 255, hi = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 255) continue; const l = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; lo = Math.min(lo, l); hi = Math.max(hi, l); } return hi - lo; };
  });

  // materials
  let s = await p.evaluate(() => {
    const { material } = gs.gfx, wood = material('wood'), a = board(), b2 = board();
    a.fillStyle = wood.at(10, 10); a.fillRect(10, 10, 60, 40); b2.fillStyle = wood.at(90, 50); b2.fillRect(90, 50, 60, 40);
    const d = a.box(10, 10, 60, 40); let r = 0, g = 0, bl = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; } const n = d.length / 4;
    const t = performance.now(); for (let i = 0; i < 1000; i++) material('wood'); const again = performance.now() - t;
    return { same: material('wood') === wood, other: material('wood', { seed: 2 }) !== wood, by: material(wood) === wood, mean: [r / n | 0, g / n | 0, bl / n | 0], spread: spread(d), moved: same(d, b2.box(90, 50, 60, 40)),
      empty: a.px(5, 5)[3], span: wood.span, big: material('wood', { scale: 2 }).span, again, tile: wood.tile.width };
  });
  check(s.same && s.other && s.by && s.again < 30, 'a material is made once: the same options give the same one back (1000 asks in ' + s.again.toFixed(1) + ' ms)', JSON.stringify(s));
  check(s.spread > 25 && Math.abs(s.mean[0] - 169) < 30 && Math.abs(s.mean[1] - 112) < 30 && Math.abs(s.mean[2] - 63) < 30 && s.empty === 0, 'it fills a shape with texture in its own colour', JSON.stringify(s));
  check(s.moved, 'at(x, y) fixes the texture to the thing: moved, it looks the same');
  check(s.span === 128 && s.big === 256 && s.tile === 256, 'one tile covers 128 game units (scale: 2 doubles it), drawn from a 256 pixel picture', JSON.stringify(s));
  s = await p.evaluate(() => { const out = {}; for (const n of Object.keys(gs.gfx.MATERIALS)) { const c = board(); c.fillStyle = gs.gfx.material(n).pattern; c.fillRect(0, 0, 200, 120); out[n] = Math.round(spread(c.box(0, 0, 200, 120))); } let threw = ''; try { gs.gfx.material('lava'); } catch (e) { threw = e.message; } return { out, threw }; });
  check(Object.keys(s.out).length === 6 && Object.values(s.out).every(v => v > 12), 'paper, wood, stone, metal, cloth and water all draw', JSON.stringify(s.out));
  check(/no material called "lava"/.test(s.threw), 'an unknown material says which there are', s.threw);

  // slabs
  s = await p.evaluate(() => {
    const { slab } = gs.gfx, c = board(), strip = (q, y) => { const d = q.box(60, y, 80, 1.5); let l = 0; for (let i = 0; i < d.length; i += 4) l += d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; return l / (d.length / 4); };
    slab(c, 40, 20, 120, 60, 'stone', { r: 12 });
    const flat = board(); slab(flat, 40, 20, 120, 60, 'stone', { r: 12, shadow: false, bevel: 0 });
    const tint = board(); slab(tint, 40, 20, 120, 60, 'stone', { tint: '#ff0000a0', shadow: false });
    const a1 = board(), a2 = board(); slab(a1, 10, 10, 50, 30, 'wood', { shadow: false, bevel: 0, r: 0 }); slab(a2, 80, 60, 50, 30, 'wood', { shadow: false, bevel: 0, r: 0 });
    const s1 = board(), s2 = board(); slab(s1, 10, 10, 50, 30, 'wood', { shadow: false, bevel: 0, r: 0, anchor: [0, 0] }); slab(s2, 80, 60, 50, 30, 'wood', { shadow: false, bevel: 0, r: 0, anchor: [0, 0] });
    return { corner: c.px(41, 21)[3], middle: c.px(100, 50)[3], under: c.px(100, 84), underFlat: flat.px(100, 84)[3], top: strip(c, 20.5), bottom: strip(c, 78), topFlat: strip(flat, 20.5), bottomFlat: strip(flat, 78),
      red: tint.px(100, 50), carried: same(a1.box(10, 10, 50, 30), a2.box(80, 60, 50, 30)), sheet: same(s1.box(10, 10, 50, 30), s2.box(80, 60, 50, 30)), none: (() => { const e = board(); slab(e, 0, 0, 0, 20); slab(e, 0, 0, 20, -5); return e.px(5, 5)[3]; })() };
  });
  check(s.middle === 255 && s.corner < 60, 'a slab has rounded corners', JSON.stringify(s));
  check(s.under[3] > 20 && s.under[0] < 30 && s.underFlat === 0, 'a soft shadow under it (shadow: false leaves it out)', JSON.stringify({ under: s.under, flat: s.underFlat }));
  check((s.top - s.bottom) - (s.topFlat - s.bottomFlat) > 35, 'lit from the top left: a bright top edge and a dark bottom edge (bevel: 0 is flat)', JSON.stringify({ top: s.top | 0, bottom: s.bottom | 0, flatTop: s.topFlat | 0, flatBottom: s.bottomFlat | 0 }));
  check(s.red[0] > s.red[1] + 40 && s.red[0] > s.red[2] + 40, 'tint washes a colour over it', String(s.red));
  check(s.carried && !s.sheet && s.none === 0, 'a slab carries its texture with it; anchor: [0, 0] cuts every slab from one sheet; no size draws nothing', JSON.stringify(s));

  // water
  s = await p.evaluate(() => {
    const { water } = gs.gfx, a = board(), b2 = board(), c2 = board(), still = board(), tint = board(), lum = d => { let m = 0; for (let i = 0; i < d.length; i += 4) m = Math.max(m, d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11); return m; };
    water(a, 0, 0, 200, 120, 1.5); water(b2, 0, 0, 200, 120, 1.5); water(c2, 0, 0, 200, 120, 1.6); water(still, 0, 0, 200, 120, 1.5, { strength: 0 }); water(tint, 0, 0, 200, 120, 1.5, { color: '#104060', light: '#ff4040', strength: 1 });
    const A = a.box(0, 0, 200, 120), C = c2.box(0, 0, 200, 120); let diff = 0; for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - C[i]) > 6) diff++;
    const T = tint.box(0, 0, 200, 120); let red = 0; for (let i = 0; i < T.length; i += 4) if (T[i] > T[i + 2] + 30) red++;
    const part = board(); water(part, 50, 30, 60, 40, 1); 
    return { again: same(A, b2.box(0, 0, 200, 120)), moved: diff / (A.length / 4), bright: lum(A), flat: lum(still.box(0, 0, 200, 120)), red: red / (T.length / 4), outside: part.px(40, 20)[3] + part.px(115, 75)[3], inside: part.px(80, 50)[3] };
  });
  check(s.again && s.moved > .05, 'water: the same time draws the same picture, a tenth of a second later the light has moved', JSON.stringify(s));
  check(s.bright > s.flat + 25 && s.red > .03 && s.outside === 0 && s.inside === 255, 'the net of light is brighter than the water, takes the light colour, and stays inside its rectangle', JSON.stringify(s));

  // stickers
  s = await p.evaluate(() => {
    const { sticker } = gs.gfx; let made = 0;
    const art = g => { made++; g.fillStyle = '#ffd23f'; g.fillRect(10, 10, 20, 20); };
    const plain = sticker(40, 40, art), c = board(200, 120, 2); for (let i = 0; i < 50; i++) plain.draw(c, 30 + i, 60);
    const once = made; const c3 = board(200, 120, 3); plain.draw(c3, 100, 60); const again = made; plain.redraw().draw(c3, 100, 60); const asked = made;
    const o = board(); sticker(40, 40, art, { outline: '#0000ff', width: 3 }).draw(o, 100, 60);
    const g = board(); sticker(40, 40, art, { glow: '#00ff00', glowSize: 10 }).draw(g, 100, 60);
    const sh = board(); sticker(40, 40, art, { shadow: true, shadowY: 6 }).draw(sh, 100, 60);
    const p0 = board(); sticker(40, 40, art).draw(p0, 100, 60);
    const turned = board(); sticker(40, 40, art).draw(turned, 100, 60, { angle: Math.PI / 4, scale: 2 });
    const corner = board(); sticker(40, 40, art).draw(corner, 100, 60, { anchor: [0, 0] });
    const faint = board(); sticker(40, 40, art).draw(faint, 100, 60, { alpha: .5 });
    return { once, again, asked, centre: p0.px(100, 60), outside: p0.px(100, 60 - 14)[3], ring: o.px(100, 60 - 12), ringFar: o.px(100, 60 - 16)[3], glow: g.px(100, 60 - 15), glowFar: g.px(100, 60 - 38)[3], shadow: sh.px(100, 60 + 14), shadowUp: sh.px(100, 60 - 14)[3],
      turnedTip: turned.px(100, 60 - 25)[3], turnedCorner: turned.px(100 + 17, 60 - 17)[3], cornerAt: corner.px(120, 80)[3], cornerNot: corner.px(92, 52)[3], faint: faint.px(100, 60)[3], sharp: c3.px(100 - 10 + .2, 60)[3] };
  });
  check(s.once === 1 && s.again === 2 && s.asked === 3, 'a sticker is drawn once however often it is shown, again for a sharper screen, and again when asked (redraw)', JSON.stringify({ once: s.once, sharper: s.again, asked: s.asked }));
  check(s.centre[0] === 255 && s.centre[3] === 255 && s.outside === 0, 'it shows the drawing, centred', JSON.stringify(s.centre));
  check(s.ring[2] > 200 && s.ring[0] < 60 && s.ring[3] > 200 && s.ringFar === 0, 'outline: a band of the outline colour all round, as wide as asked', JSON.stringify({ ring: s.ring, far: s.ringFar }));
  check(s.glow[3] > 20 && s.glow[1] > s.glow[0] && s.glowFar === 0, 'glow: a soft light round it that fades out', JSON.stringify({ glow: s.glow, far: s.glowFar }));
  check(s.shadow[3] > 30 && s.shadow[0] < 40 && s.shadowUp === 0, 'shadow: soft and dark, below it', JSON.stringify({ shadow: s.shadow, up: s.shadowUp }));
  check(s.turnedTip === 255 && s.turnedCorner === 0 && s.cornerAt === 255 && s.cornerNot === 0 && Math.abs(s.faint - 128) < 6, 'scale, angle, anchor and alpha place it', JSON.stringify(s));

  // the sketch pen and ink
  s = await p.evaluate(() => {
    const { Sketch, Ink, ink } = gs.sketch, pen = new Sketch({ stroke: '#ff0000', strokeWidth: 2 }), a = board(), b2 = board();
    pen.rect(a, 20, 20, 80, 50); pen.rect(b2, 90, 60, 80, 50);
    const near = (c, x, y, r) => { const d = c.box(x - r, y - r, r * 2, r * 2); let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 100 && d[i] > 150 && d[i + 1] < 90) n++; return n; };
    const f = board(); pen.rect(f, 20, 20, 80, 50, { fill: '#0000ff', fillStyle: 'solid', stroke: 'none' });
    const h = board(); pen.circle(h, 100, 60, 40, { fill: '#00aa00' }); const hd = h.box(70, 30, 60, 60); let green = 0; for (let i = 0; i < hd.length; i += 4) if (hd[i + 1] > 120 && hd[i] < 80 && hd[i + 3] > 100) green++;
    const line = new Ink({ size: 10, color: '#00ffff' }), k = board(); for (let i = 0; i <= 20; i++) line.add(20 + i * 8, 60 + Math.sin(i / 3) * 10); line.end().draw(k);
    const k2 = board(); ink(k2, [[20, 60], [100, 40], [180, 60]], { size: 8, color: '#ff00ff', spacing: 4 });
    const k3 = board(); ink(k3, [[20, 60], [100, 40], [180, 60]], { size: 8, color: '#ff00ff' });
    return { edges: [near(a, 60, 20, 4), near(a, 60, 70, 4), near(a, 20, 45, 4), near(a, 100, 45, 4)], inside: near(a, 60, 45, 10), moved: same(a.box(10, 10, 100, 70), b2.box(80, 50, 100, 70)), remembered: pen.remembered,
      fill: f.px(60, 45), hatch: green / (hd.length / 4), ink: k.px(100, 60 + Math.sin(10 / 3) * 10), inkOff: k.px(100, 20)[3], ink2: k2.px(100, 42), ink3: k3.px(100, 42)[3] };
  });
  check(s.edges.every(n => n > 6) && s.inside === 0, 'the sketch pen draws a wobbly outline where the shape is, and nothing inside without a fill', JSON.stringify(s.edges));
  check(s.moved && s.remembered >= 1, 'a sketched shape looks the same wherever it is drawn (its wobble does not crawl)');
  check(s.fill[2] > 200 && s.fill[3] === 255 && s.hatch > .08 && s.hatch < .8, 'solid fills fill, hatching draws lines with gaps between', JSON.stringify({ fill: s.fill, hatch: +s.hatch.toFixed(2) }));
  check(s.ink[1] > 200 && s.ink[3] === 255 && s.inkOff === 0, 'an ink stroke fills along the line the finger drew', JSON.stringify({ ink: s.ink, off: s.inkOff }));
  check(s.ink2[0] > 200 && s.ink2[3] > 200 && s.ink3 === 0, 'ink() in one call: a line through a few far-apart points cuts its corners, and spacing makes it follow them', JSON.stringify({ spaced: s.ink2, sparse: s.ink3 }));

  // icons
  s = await p.evaluate(() => {
    const { icon, names, remembered, path } = gs.icons, a = board();
    const drew = icon(a, 'plain-square', 100, 60, 40, { color: '#ff8800' }), miss = icon(a, 'no-such-icon', 100, 60, 40);
    const o = board(); icon(o, 'plain-circle', 100, 60, 40, { color: '#ffffff', outline: '#0000ff', width: 4 });
    const before = remembered(); for (let i = 0; i < 100; i++) icon(a, 'sword', 20 + i, 20, 24); const one = remembered() - before;
    for (let i = 0; i < 60; i++) icon(a, 'heart', 150, 90, 24 + Math.sin(i / 5) * 3); const pulse = remembered() - before - one;
    for (const n of names.slice(0, 400)) icon(a, n, 100, 60, 32);
    const px = board(64, 32, 1); px.imageSmoothingEnabled = false; icon(px, 'key', 16, 16, 16, { pixel: true, color: '#9bbc0f', outline: '#0f380f' }); icon(px, 'skull', 48, 16, 16, { pixel: true, color: '#9bbc0f' });
    const d = px.box(0, 0, 64, 32), cols = new Set(); let soft = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] !== 0 && d[i + 3] !== 255) soft++; if (d[i + 3]) cols.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); }
    const t = board(); icon(t, 'plain-arrow', 100, 60, 40, { color: '#fff' }); const t2 = board(); icon(t2, 'plain-arrow', 100, 60, 40, { color: '#fff', angle: Math.PI }); 
    const sharp = board(200, 120, 3); icon(sharp, 'plain-square', 100, 60, 40, { color: '#ff8800' });
    return { drew, miss, centre: a.px(100, 60).slice(0, 3), edgeIn: 0, ring: o.px(100, 60 - 20 - 2), ringOut: o.px(100, 60 - 20 - 7)[3], mid: o.px(100, 60), one, pulse, kept: remembered(), soft, cols: [...cols],
      turned: !same(t.box(80, 40, 40, 40), t2.box(80, 40, 40, 40)), path: path('sword') instanceof Path2D, names: names.length, sharp: sharp.px(100, 60) };
  });
  check(s.drew === true && s.miss === false && s.names === 528, 'an icon draws by name; a name it does not have draws nothing and says so');
  check(s.mid[0] === 255 && s.ring[2] > 180 && s.ring[0] < 80 && s.ringOut === 0, 'colour and outline: the icon in its colour, a band of the outline colour round it', JSON.stringify({ mid: s.mid, ring: s.ring, out: s.ringOut }));
  check(s.one === 1 && s.pulse <= 2 && s.kept <= 160, 'an icon is drawn once and remembered (100 draws: 1 picture; a pulsing one: ' + s.pulse + '; never more than 160 kept)', JSON.stringify({ one: s.one, pulse: s.pulse, kept: s.kept }));
  check(s.soft === 0 && s.cols.length === 2, 'pixel: true gives hard pixels in exactly the colours asked for', JSON.stringify({ soft: s.soft, colours: s.cols }));
  check(s.turned && s.path, 'angle turns it; path(name) gives the shape itself');

  if (process.env.SHOTS) {
    await p.evaluate(() => {
      const { material, slab, water, sticker } = gs.gfx, { Sketch, Ink, ink } = gs.sketch, { icon, names } = gs.icons, W = 390, H = 844, D = 3;
      document.body.innerHTML = `<canvas id="spec" width="${W * D}" height="${H * D}" style="position:fixed;inset:0;width:${W}px;height:${H}px;z-index:99999"></canvas>`;
      const c = document.getElementById('spec').getContext('2d'); c.scale(D, D); c.fillStyle = '#20242e'; c.fillRect(0, 0, W, H);
      const label = (t, x, y) => { c.fillStyle = '#cfd6e6'; c.font = '500 10px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText(t, x, y); };
      [['paper', {}], ['wood', {}], ['wood', { planks: 4 }], ['stone', {}], ['stone', { blocks: 4 }], ['metal', {}], ['cloth', {}], ['cloth', { color: '#b5443f', threads: 20 }], ['water', {}]].forEach(([n, o], i) => {
        const x = 10 + (i % 3) * 126, y = 22 + Math.floor(i / 3) * 96; slab(c, x, y, 118, 74, material(n, o), { r: 8 }); label(n + (Object.keys(o).length ? ' ' + JSON.stringify({ ...o, color: undefined }).replace(/"/g, '') : ''), x, y - 5); });
      let y = 318; label('water(c, x, y, w, h, t), and clipped to a pond', 10, y - 5); water(c, 10, y, 230, 60, 1.3); c.save(); c.beginPath(); c.ellipse(315, y + 30, 64, 30, 0, 0, 7); c.clip(); water(c, 250, y, 130, 60, 2, { color: '#1fb7a6', light: '#fff7c0', strength: .8, scale: .7 }); c.restore();
      y = 404; label('sticker(): plain, outline, glow, shadow, all three, scaled and turned', 10, y - 5);
      const art = g => { g.fillStyle = '#ffd23f'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 8 : 18; g.lineTo(20 + Math.cos(a) * r, 20 + Math.sin(a) * r); } g.closePath(); g.fill(); };
      [{}, { outline: '#3a2500' }, { glow: '#ffe98a', glowSize: 9 }, { shadow: true }, { outline: '#3a2500', width: 3, glow: '#7df', shadow: true }].forEach((o, i) => sticker(40, 40, art, o).draw(c, 34 + i * 56, y + 30));
      sticker(40, 40, art, { outline: '#fff', shadow: true }).draw(c, 340, y + 30, { scale: 1.5, angle: .4 });
      y = 484; label('gs.sketch: the Sketch pen and Ink, on paper', 10, y - 5); c.fillStyle = material('paper').at(10, y); c.fillRect(10, y, 370, 150);
      const pen = new Sketch({ stroke: '#2b2b2b', strokeWidth: 2, roughness: 1.2 });
      pen.rect(c, 22, y + 12, 86, 50, { fill: '#ffd23f' }); pen.circle(c, 150, y + 37, 25, { fill: '#4fc3ff', fillStyle: 'solid' }); pen.ellipse(c, 222, y + 37, 32, 22, { fill: '#ff6b81', fillStyle: 'cross-hatch' });
      pen.poly(c, [[270, y + 62], [305, y + 10], [340, y + 62]], { fill: '#7bd88f', fillStyle: 'zigzag' }); pen.line(c, 22, y + 76, 368, y + 79);
      pen.curve(c, [[24, y + 120], [60, y + 95], [96, y + 125], [132, y + 98], [168, y + 122]], { stroke: '#b03a2e' }); pen.lines(c, [[24, y + 138], [60, y + 130], [96, y + 140], [132, y + 131], [168, y + 139]], { dash: [6, 5] });
      ink(c, Array.from({ length: 34 }, (_, i) => ({ x: 190 + i * 5.4, y: y + 100 + Math.sin(i * .45) * 14 * (1 - i / 50) })), { size: 11, color: '#1b1b3a' });
      const line = new Ink({ size: 8, color: '#b03a2e', taper: 26 }); for (let i = 0; i < 40; i++) line.add(190 + i * 4.5, y + 132 + Math.cos(i * .3) * 8); line.end().draw(c);
      y = 656; label('gs.icons: ' + names.length + ' icons; colour, outline, pixel', 10, y - 5);
      ['sword', 'shield', 'heart', 'coin', 'gem', 'key', 'chest', 'skull', 'bomb', 'potion', 'star', 'trophy', 'crown', 'fire', 'water', 'bolt', 'tree', 'fish', 'cat', 'dragon', 'rocket', 'castle', 'dice', 'play', 'pause', 'settings', 'map', 'bell', 'flag', 'gift', 'robot', 'ghost', 'moon']
        .forEach((n, i) => icon(c, n, 28 + (i % 11) * 33.5, y + 20 + Math.floor(i / 11) * 36, 28, { color: ['#fff', '#ffd23f', '#ff6b81', '#4fc3ff', '#7bd88f'][i % 5], outline: i % 2 ? '#000' : null }));
      ['sword', 'heart', 'key', 'skull', 'star', 'bomb', 'crown', 'fish'].forEach((n, i) => { c.save(); c.translate(14 + i * 46, y + 124); c.scale(2.5, 2.5); icon(c, n, 8, 8, 16, { pixel: true, color: '#9bbc0f', outline: i % 2 ? '#0f380f' : null }); c.restore(); });
    });
    await p.screenshot({ path: process.env.SHOTS + '/looks.png' });
  }
  await p.done();
}

/* ---------- the phone test tour: a bot plays as a guest, every frame is timed, one report ---------- */
async function tour(b) {
  console.log('\nPhone test tour');
  const p = await open(b);
  // the parts on their own
  const k = await p.evaluate(async () => {
    const k = await __gs.tourKit(), out = {};
    out.sum = k.summarise([10, 10, 10, 100], [1, 1, 1, 5], 16.7); out.none = k.summarise([]);
    const base = { loaded: true, errors: [], frames: 600, fps: 60, target: 60, freezes: 0, early: 0, slow: 0 };
    out.verdicts = [k.verdict(base), k.verdict({ ...base, fps: 50 }), k.verdict({ ...base, freezes: 5, early: 1 }), k.verdict({ ...base, freezes: 5, early: 4 }), k.verdict({ ...base, slow: .06 }),
      k.verdict({ ...base, errors: ['x'] }), k.verdict({ ...base, loaded: false }), k.verdict({ ...base, frames: 0, fps: 0 })];
    out.long = [k.howLong(46, 20), k.howLong(244, 20), k.howLong(1, 10)];
    out.sets = k.sets(__gs.GAMES).map(([key, name, list]) => [key, list.length]);
    out.threeD = __gs.GAMES.filter(g => ['console', 'nextgen', 'ar', 'board'].includes(g.era)).length;
    // a guest's saves and brains go nowhere, and read the player's own until the bot saves
    const loud = what => () => { throw new Error(what + ' reached the real one'); };
    const g = k.guestApi({ load: () => 'real', loadLocal: () => 'big', save: loud('save'), saveLocal: loud('saveLocal'), clearSave: loud('clearSave'), clearLocal: loud('clearLocal'),
      brains: { load: () => 'brain', save: loud('brain'), share: loud('share'), onFun: loud('fun'), shared: () => 'avg', player: { read: () => ({ a: 1 }), write: loud('profile'), clear: loud('profile') } } });
    const first = [g.load('x'), g.loadLocal('x'), g.brains.load('q')];
    const saved = [g.save({ n: 1 }), g.saveLocal({ m: 2 }), g.brains.save('q', 'mine')]; const got = g.load(); got.n = 9;
    out.guest = { first, saved, after: [g.load(), g.loadLocal(), g.brains.load('q')], cleared: (g.clearSave(), g.clearLocal(), [g.load('none'), g.loadLocal('none')]),
      quiet: (g.brains.share('q', '2x2', 'w', 1), g.brains.onFun('q', () => {})(), g.brains.player.write('aim', 1, 1)), profile: g.brains.player.read(), shared: g.brains.shared() };
    // the bot: two thumbs, the same touches for the same seed, always on the screen
    const play = seed => { const ev = []; const bot = new k.Bot((type, x, y, id) => ev.push([type, Math.round(x * 10) / 10, Math.round(y * 10) / 10, id]), () => [360, 640], seed);
      for (let i = 0; i < 60 * 60; i++) bot.step(i / 60); bot.release(60); return { ev, count: bot.count }; };
    const a = play(7), a2 = play(7), c = play(8);
    const down = new Set(); let off = 0, lone = 0, bad = 0;
    for (const [type, x, y, id] of a.ev) {
      if (x < 0 || y < 0 || x > 360 || y > 640) off++;
      if (type === 'pointerdown') { if (down.has(id)) bad++; if (id !== 7001 && !down.has(7001)) lone++; down.add(id); }
      else if (!down.has(id)) bad++; else if (type === 'pointerup') down.delete(id);
    }
    out.bot = { same: JSON.stringify(a.ev) === JSON.stringify(a2.ev), other: JSON.stringify(a.ev) !== JSON.stringify(c.ev), n: a.ev.length, off, lone, bad, left: down.size, count: a.count };
    // the native plugins: a stand-in app where one answers, one never does, one throws and the rest aren't there
    const cap = { isNativePlatform: () => true, isPluginAvailable: n => ['PowerState', 'ScreenRate', 'NPU', 'Motion'].includes(n),
      Plugins: { PowerState: { get: async () => ({ thermal: 0, saver: false }) }, ScreenRate: { get: () => new Promise(() => {}) }, NPU: { available: async () => { throw new Error('boom'); } } } };
    out.plugins = await k.checkPlugins(cap, 150); out.web = await k.checkPlugins();
    // a plugin only one kind of phone has: asked there, and not listed as missing on the other
    const health = { ...cap, isPluginAvailable: n => n === 'AppHealth', Plugins: { AppHealth: { get: async () => ({ robot: '', known: true, exits: [{ at: 1, reason: 10 }] }) } } };
    out.android = (await k.checkPlugins({ ...health, getPlatform: () => 'android' }, 150)).find(x => x.name === 'AppHealth.get');
    out.ios = (await k.checkPlugins({ ...health, getPlatform: () => 'ios' }, 150)).some(x => x.name === 'AppHealth.get');
    return out;
  });
  check(k.sum.frames === 4 && k.sum.worst === 100 && k.sum.freezes === 1 && Math.abs(k.sum.fps - 4000 / 130) < .01 && Math.abs(k.sum.low - 10) < .01 && k.sum.slow === .25 && k.sum.work === 2 && k.none.frames === 0,
    'frames are summed up right (rate, the worst 1%, the longest, slow ones, freezes, the game\'s own time)', JSON.stringify(k.sum));
  check(k.verdicts.join() === 'ok,SLOW,STUTTER,ok,STUTTER,ERROR,NO LOAD,NO FRAMES', 'a game is ok, SLOW, STUTTER, ERROR, NO LOAD or NO FRAMES (freezes as a round starts are let off)', k.verdicts.join());
  check(k.long.join('|') === 'about 20 min|about 1 h 46 min|about 1 min', 'the time a tour will take is told beforehand', k.long.join('|'));
  check(k.sets[0][0] === '3d' && k.sets[0][1] === k.threeD && k.threeD > 20 && k.sets[2][1] > k.threeD, 'the tour offers the 3D games, Next Gen and AR, or every game', JSON.stringify(k.sets));
  const gu = k.guest;
  check(gu.first.join() === 'real,big,brain' && gu.saved.every(v => v === true) && JSON.stringify(gu.after) === '[{"n":1},{"m":2},"mine"]' && gu.cleared.join() === 'none,none' && gu.quiet === true && gu.profile.a === 1 && gu.shared === 'avg',
    'a guest reads the player\'s saves and brains, and its own writes go nowhere', JSON.stringify(gu));
  const bo = k.bot;
  check(bo.same && bo.other && bo.n > 200 && !bo.off && !bo.bad && !bo.left, 'the bot\'s touches repeat for a seed, stay on the screen, and every finger that goes down comes up', JSON.stringify(bo));
  check(!bo.lone && Object.values(bo.count).every(n => n > 2), 'it taps, holds, swipes, drags and works a thumb-stick, the second thumb only joining while the first holds a stick', JSON.stringify(bo));
  const by = Object.fromEntries(k.plugins.map(x => [x.name, x]));
  check(by['PowerState.get'].state === 'ok' && /thermal/.test(by['PowerState.get'].note) && by['ScreenRate.get'].state === 'FAIL' && /no answer/.test(by['ScreenRate.get'].note) && by['NPU.available'].state === 'FAIL' && /boom/.test(by['NPU.available'].note)
    && by['Motion'].state === 'ok' && by['RichHaptics.supported'].state === 'MISSING' && k.plugins.length >= 18,
    'each native plugin is asked once: an answer, no answer in time, an error and "not in this build" are told apart', JSON.stringify(k.plugins.filter(x => /Power|Screen|NPU|Motion|Rich/.test(x.name))));
  check(k.web === null, 'the web version has no plugins to ask');
  check(k.android?.state === 'ok' && /"exits":1/.test(k.android.note) && k.ios === false, 'a plugin only Android has is asked there and left out on an iPhone', JSON.stringify({ android: k.android, ios: k.ios }));

  // a tour of two games, one of them changed to do everything a guest must not leave behind
  await p.game(CASUAL);
  const r = await p.evaluate(async id => {
    const kit = await __gs.tourKit(), g = __gs.GAMES.find(x => x.id === id), make = g.make, seen = { down: 0, off: 0, wrote: 0 };
    __gs.api(__gs.active).save({ mine: 1 });
    const label = () => document.getElementById('feed-label').textContent, stats = () => { try { const c = JSON.parse(localStorage.gs_stats_pending || '{}')[id] || {}; return (c.p || 0) + ' plays, ' + (c.s || 0) + ' s'; } catch (_) { return 'unreadable'; } };
    const before = { credits: __gs.progress.credits, best: __gs.progress.best(id), qa: localStorage.gs_qa || '', stats: stats(), label: label(), boards: localStorage.gs_boards_pending || '' };
    g.make = api => {
      const game = make(api), { reset, update, down } = game; let t = 0;
      game.reset = () => { t = 0; return reset.call(game); };
      game.update = dt => { t += dt; update.call(game, dt); if (t > .4 && t < .5) { seen.wrote++; api.save({ bot: 1 }); api.saveLocal({ bot: 1 }); api.brains.save('probe', 'bot'); api.score(99999); } if (t > 1.2) api.over(); };
      game.down = (x, y, f) => { seen.down++; if (x < 0 || y < 0 || x > 360 || y > 640) seen.off++; return down && down.call(game, x, y, f); };
      return game;
    };
    const res = await __gs.tour({ ids: [id, 'arrow-maze'], seconds: 3 });
    g.make = make;
    const text = kit.reportText(res);
    __gs.only(id); await new Promise(r => setTimeout(r, 300));
    const api = __gs.api(__gs.active);
    const after = { credits: __gs.progress.credits, best: __gs.progress.best(id), qa: localStorage.gs_qa || '', stats: stats(), boards: localStorage.gs_boards_pending || '', save: api.load(null), brain: api.brains.load('probe'), away: api.away() };
    // and a round played for real now counts again
    __gs.start(); api.score(g.goal); api.over(); const real = { goal: g.goal, best: __gs.progress.best(id), credits: __gs.progress.credits, plays: JSON.parse(localStorage.gs_qa || '{}')[id]?.plays || 0 };
    __gs.only(id);
    return { res, text, seen, before, after, real, label: label() };
  }, CASUAL);
  const g0 = r.res.games[0], g1 = r.res.games[1];
  check(r.res.games.length === 2 && g0.id === CASUAL && g0.loaded && g0.frames > 20 && g0.fps > 5 && g0.rounds >= 2 && g0.score === 99999 && g0.played >= 2.9 && g1.loaded && g1.frames > 20 && r.res.took >= 6,
    'the tour plays each game for its seconds through the real feed, round after round, and times the frames', JSON.stringify(r.res.games.map(g => ({ id: g.id, loaded: g.loaded, frames: g.frames, fps: g.fps && Math.round(g.fps), rounds: g.rounds, score: g.score, played: g.played, verdict: g.verdict, errors: g.errors }))));
  check(r.seen.down > 3 && !r.seen.off && r.seen.wrote >= 2, 'the bot\'s touches reach the game as touches, inside its screen', JSON.stringify(r.seen));
  check(r.after.credits === r.before.credits && r.after.best === r.before.best && r.after.qa === r.before.qa && r.after.stats === r.before.stats && r.after.boards === r.before.boards,
    'a guest\'s win pays no credits, sets no best, and adds no plays, play stats or leaderboard score', JSON.stringify({ before: r.before, after: r.after }));
  check(JSON.stringify(r.after.save) === '{"mine":1}' && r.after.brain === null && r.after.away === 0, 'the player\'s save, brains and time-away clock are as they were', JSON.stringify(r.after));
  check(r.real.best === r.real.goal && r.real.credits > r.before.credits && r.real.plays === 1 && r.label === r.before.label, 'afterwards the feed is back as it was, and a real round counts again (best, credits, plays)', JSON.stringify(r.real));
  check(/^Game Scroll phone test tour · \d{4}-\d\d-\d\d \d\d:\d\d UTC · build /.test(r.text) && /\nPHONE: .* Hz · /.test(r.text) && /\nPOWER: /.test(r.text) && /\nSETTINGS: frame rate /.test(r.text)
    && /\nPLUGINS: this is the web version/.test(r.text) && /\nGAMES \(2 played for 3 s each\): /.test(r.text) && r.text.includes(CASUAL + ' (') && /loaded in [\d.]+ s · \d+ of \d+ fps · worst 1% \d+ fps · longest \d+ ms · slow [\d.]+% · freezes \d+/.test(r.text),
    'the report names the phone, the plugins and every game with its numbers', r.text);
  if (process.env.SHOTS) require('fs').writeFileSync(process.env.SHOTS + '/tour-report.txt', r.text);

  // stopping part way: what was played is still reported, and the feed comes back
  const st = await p.evaluate(async () => {
    const kit = await __gs.tourKit(), signal = {}; setTimeout(() => { signal.stop = true; }, 1200);
    const res = await __gs.tour({ ids: ['stack', 'arrow-maze', 'bricks'], seconds: 5, signal });
    return { stopped: res.stopped, n: res.games.length, asked: res.asked, text: kit.reportText(res), active: !!__gs.active };
  });
  check(st.stopped && st.n === 1 && st.asked === 3 && /STOPPED after 1 of 3 games/.test(st.text) && st.active, 'Stop ends the tour at once and still gives a report', JSON.stringify({ ...st, text: st.text.slice(0, 160) }));

  // a Next Gen game is played in full screen (each round goes in again), unless told not to, and the feed is itself after
  const fu = await p.evaluate(async () => {
    const kit = await __gs.tourKit(); let seen = false, seenOff = false;
    const res = await __gs.tour({ ids: ['bunker-breakout'], seconds: 2, onPlay() { seen = seen || document.body.classList.contains('fullscreen'); } });
    const after = document.body.classList.contains('fullscreen');
    const off = await __gs.tour({ ids: ['bunker-breakout'], seconds: 1, full: false, onPlay() { seenOff = seenOff || document.body.classList.contains('fullscreen'); } });
    return { loaded: res.games[0].loaded, full: res.games[0].full, seen, after, off: !!off.games[0].full, seenOff, line: kit.reportText(res).split('\n').find(l => l.includes('bunker-breakout')), errors: res.games[0].errors };
  });
  check(fu.loaded && fu.full === true && fu.seen && !fu.after && !fu.off && !fu.seenOff && /, full screen · /.test(fu.line) && !fu.errors.length, 'a Next Gen game is played in full screen and says so, unless the box is unticked', JSON.stringify(fu));

  // the sheet in the QA panel: choose, start, watch the bar, stop, read the report
  await p.click('.logo'); await p.click('.qa-tour'); await p.waitForSelector('dialog.tour[open]');
  const sheet = await p.evaluate(() => ({ opts: [...document.querySelectorAll('.tour-set option')].map(o => o.textContent), est: document.querySelector('.tour-est').textContent, qa: !!document.querySelector('dialog.qa-panel:not(.tour)'), full: document.querySelector('.tour-full').checked, loud: document.querySelector('.tour-loud').checked }));
  check(sheet.opts.length === 6 && sheet.opts[3] === 'Engine test scenes (14)' && sheet.opts[4] === 'Ray tracing only (1)' && sheet.opts[5] === 'Frame generation (4)' && sheet.full && !sheet.loud && /^3D games \(\d+\)$/.test(sheet.opts[0]) && /games, about \d+ min/.test(sheet.est) && !sheet.qa, 'the QA panel\'s Phone test tour button opens the sheet, with what it will play and how long it takes', JSON.stringify(sheet));
  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/tour-sheet.png' });
  await p.selectOption('.tour-set', 'all'); await p.selectOption('.tour-secs', '10');
  const est = await p.evaluate(() => document.querySelector('.tour-est').textContent);
  check(/about \d+ (min|h)/.test(est) && est !== sheet.est, 'the time changes with the choice', est);
  await p.click('.tour-go'); await p.waitForSelector('.tour-bar'); await p.waitForFunction(() => /^1 of \d+ · .+ · \d+ s$/.test(document.querySelector('.tour-now')?.textContent || ''), null, { timeout: 30000 });
  const bar = await p.evaluate(() => ({ now: document.querySelector('.tour-now').textContent, playing: __gs.active?.state, sheet: !!document.querySelector('dialog.tour[open]') }));
  check(/^1 of \d+ · /.test(bar.now) && bar.playing === 'playing' && !bar.sheet, 'while it runs a small bar says which game is on and for how long', JSON.stringify(bar));
  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/tour-bar.png' });
  await p.click('.tour-bar button'); await p.waitForSelector('dialog.tour[open] .tour-text', { timeout: 30000 });
  const rep = await p.evaluate(() => ({ text: document.querySelector('.tour-text').value, bar: !!document.querySelector('.tour-bar'), last: (JSON.parse(localStorage.gs_tour_last || '""') || '').length }));
  check(/STOPPED after 1 of \d+ games/.test(rep.text) && !rep.bar && rep.last === rep.text.length, 'Stop on the bar shows the report, which is kept for "Last report"', rep.text.slice(0, 200));
  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/tour-report.png' });
  await p.click('dialog.tour[open] .qa-x');
  // the sheet also offers the engine test scenes, with their own time and without the boxes that are for games
  await p.click('.logo'); await p.click('.qa-tour'); await p.waitForSelector('dialog.tour[open]'); await p.selectOption('.tour-set', 'scenes');
  const sheet2 = await p.evaluate(() => ({ est: document.querySelector('.tour-est').textContent, ticks: [...document.querySelectorAll('.tour-tick')].map(t => getComputedStyle(t).display) }));
  check(/^Fourteen scenes, each flown through for \d+ seconds .* about \d+ min/.test(sheet2.est) && sheet2.ticks.every(d => d === 'none'), 'choosing the engine test scenes says what they are and hides the boxes that are for games', JSON.stringify(sheet2));
  // and the ray tracing scene alone (the hall), started from the sheet: the bar names the hall, and Stop gives its report
  await p.selectOption('.tour-set', 'traced');
  const sheet4 = await p.evaluate(() => ({ est: document.querySelector('.tour-est').textContent, ticks: [...document.querySelectorAll('.tour-tick')].map(t => getComputedStyle(t).display) }));
  check(/^The ray tracing scene alone: a polished hall, flown through for \d+ seconds three ways, with no reflections, with reflections worked out from the screen and ray traced .*: about [1-3] min/.test(sheet4.est) && sheet4.ticks.every(d => d === 'none'),
    'the sheet also offers ray tracing alone: the hall, three ways, in a few minutes', JSON.stringify(sheet4));
  await p.click('.tour-go'); await p.waitForFunction(() => /^1 of [23] · Hall/.test(document.querySelector('.tour-now')?.textContent || ''), null, { timeout: 60000 });
  await p.click('.tour-bar button'); await p.waitForSelector('dialog.tour[open] .tour-text', { timeout: 60000 });
  const rtRep = await p.evaluate(() => document.querySelector('.tour-text').value);
  check(/^Game Scroll engine test scenes, ray tracing · .* · STOPPED after 1 of 1 scenes\n/.test(rtRep) && /\nHALL · ray traced reflections · /.test(rtRep) && !/\n(VALLEY|FOREST|TOWN) · /.test(rtRep),
    'started from the sheet, ray tracing alone flies only the hall, and its report says so', rtRep.slice(0, 400));
  await p.click('dialog.tour[open] .qa-x');
  await p.click('.logo'); await p.click('.qa-tour'); await p.waitForSelector('dialog.tour[open]');
  await p.selectOption('.tour-set', 'framegen');
  const sheet3 = await p.evaluate(() => ({ est: document.querySelector('.tour-est').textContent, ticks: [...document.querySelectorAll('.tour-tick')].map(t => getComputedStyle(t).display), name: document.querySelector('.tour-set option[value="framegen"]')?.textContent }));
  check(sheet3.name === 'Frame generation (4)' && /^Four of the engine test scenes, each flown through for \d+ seconds five ways: .* blended as before, blended as now and then ahead: about \d+ min/.test(sheet3.est) && sheet3.ticks.every(d => d === 'none'),
    'the sheet also offers frame generation, timed in four of the engine test scenes', JSON.stringify(sheet3));
  await p.click('dialog.tour[open] .qa-x');
  await p.done();

  // the engine test scenes (src/detail-tour.js): each detail system off and on, on a stage over the app.
  // Small scenes on a small screen here: the software renderer draws the full ones at seconds a frame.
  const q = await open(b, { width: 240, height: 320, dpr: 1, before: () => {
    window.__wl = { asked: 0, freed: 0 };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { __wl.asked++; return { release: async () => { __wl.freed++; }, addEventListener() {} }; } } });
  } });
  await q.game('bunker-breakout');
  const sc = await q.evaluate(async () => {
    const kit = await __gs.tourKit(), steps = [], seen = { stage: false, cards: -1, awake: false, force: null };
    __hd.direct = true;   // (as on a phone: the 3D canvas itself is shown under the stage's canvas; test browsers get a copy otherwise)
    const res = await __gs.tour({ scenes: true, seconds: 1.5, size: .1, onStep(s) { steps.push(`${s.i + 1}/${s.n} ${s.game.title}: ${s.what}`); },
      onPlay() { seen.stage = seen.stage || !!document.querySelector('.tour-stage canvas.hd-host'); seen.cards = document.querySelectorAll('.slide').length; seen.awake = seen.awake || __gs.awake.on; seen.force = window.__hd.force; } });
    __hd.direct = false; await new Promise(r => setTimeout(r, 400));
    return { text: kit.reportText(res), scenes: res.scenes.map(s => ({ key: s.key, error: s.error, holds: s.holds, modes: s.modes.map(m => ({ key: m.key, frames: m.frames, fps: Math.round(m.fps), tris: Math.round(m.tris), calls: Math.round(m.calls), build: m.build == null ? null : Math.round(m.build), note: m.note, tell: m.tell, backend: m.backend, work: m.work, codeBy: m.codeBy })) })),
      took: res.took, stopped: res.stopped, steps, seen,
      after: { stage: !!document.querySelector('.tour-stage'), touring: document.body.classList.contains('touring'), force: window.__hd.force, active: __gs.active?.def.id, loading: !!__gs.active?.loading, awake: __gs.awake.on, msg: !!document.querySelector('.feed-msg') } };
  });
  const sby = Object.fromEntries(sc.scenes.map(s => [s.key, s])), M = (k, m) => sby[k]?.modes.find(x => x.key === m) || {};
  check(sc.scenes.length === 14 && sc.scenes.every(s => !s.error && s.modes.length >= 2 && s.modes.every(m => m.frames > 3 && m.tris > 0)) && !sc.stopped,
    'the engine test scenes fly through a valley, a forest, a village, a town, a square, a field, a yard, along a cliff, a hall, a parade, a line-up, faces close up, a street and a street at night, each with its system off and then on', JSON.stringify(sc.scenes));
  // the hall: walked with no reflections and with the ones the picture has (ray traced too where it is drawn with WebGPU; WebGL at this quality has none, and says so)
  check(M('hall', 'none').frames > 3 && (M('hall', 'traced').frames ? /^traced copy [\d,]+ triangles \([\d,]+ before simplifying\) of \d+ things, 3 of them moving, /.test(M('hall', 'traced').tell) : M('hall', 'screen').backend === 'webgl' && M('hall', 'screen').tell === 'this quality draws no reflections here')
    && /\nHALL · ray traced reflections · a polished hall of 6 pillars and figures, [\d,]+ triangles, with 3 things moving · made in /.test(sc.text) && /\n  = (from the screen against no reflections|reflections from the screen against none): /.test(sc.text),
    'the hall is walked without reflections and then with them', JSON.stringify(sby.hall));
  check(M('valley', 'on').tris < M('valley', 'off').tris * .8 && /^\d+ mesh(es)? drawn in clusters$/.test(M('valley', 'on').note) && +M('valley', 'on').note.split(' ')[0] >= 1 && /tables [\d.]+ MB/.test(M('valley', 'on').tell),
    'the valley draws fewer triangles through cluster detail, once its clusters are built', JSON.stringify(sby.valley));
  check(M('forest', 'on').tris < M('forest', 'off').tris * .8 && /simpler levels of a fir/.test(M('forest', 'on').note), 'the forest draws fewer triangles with detail levels for its copies', JSON.stringify(sby.forest));
  const left = /^(\d+) things of ([\d,]+) triangles left out a frame, found in [\d.]+ ms/.exec(M('town', 'on').tell);
  check(left && +left[1] >= 3 && M('town', 'on').tris < M('town', 'off').tris * .97 && /^shadow maps /.test(M('town', 'off').tell), 'the town draws fewer triangles with what is behind its houses left out', JSON.stringify(sby.town));
  // its third run: the same walk with the sun's shadow map drawn whole, as it used to be, against kept in tiles (the second run)
  const shOf = m => { const x = /shadow maps ([\d,]+) triangles in ([\d,]+) draws a frame$/.exec(M('town', m).tell || ''); return x ? [+x[1].replace(/,/g, ''), +x[2].replace(/,/g, '')] : [NaN, NaN]; };
  check(M('town', 'whole').frames > 3 && shOf('on')[0] < shOf('whole')[0] * .5 && shOf('on')[1] < shOf('whole')[1] && /\n  = shadows in tiles against shadows drawn whole: /.test(sc.text),
    'the town\'s shadow maps take a fraction of the triangles kept in tiles that they take drawn whole', JSON.stringify({ tiles: shOf('on'), whole: shOf('whole'), town: sby.town }));
  // the square: thirty people and dogs, each with a skeleton of its own and then as one crowd
  const sent = /^posed in [\d.]+ ms a frame · (\d+) of 30 sent to be drawn a frame, in (\d+) draws$/.exec(M('square', 'on').tell || '');
  check(sent && +sent[1] >= 3 && +sent[2] >= 1 && M('square', 'on').calls < M('square', 'off').calls * .75 && M('square', 'on').tris < M('square', 'off').tris * .7 && M('square', 'off').build > 0 && M('square', 'on').build == null && /^posed in [\d.]+ ms a frame$/.test(M('square', 'off').tell) && /\nSQUARE · crowds · 30 people and dogs walking, running and standing in a square · made in /.test(sc.text) && /\n  = one crowd against a skeleton each: /.test(sc.text),
    'the square\'s people take fewer draws and triangles as one crowd than with a skeleton each', JSON.stringify(sby.square));
  // where the engine's code went for the people with a skeleton each, by part (prof.js): three's own work on the scene and the shadow maps
  // on WebGPU (the renders three starts, told by its inspector), the 3D kit's steps; the parts add up to about the code's time
  const cb = M('square', 'off').codeBy || {}, cbSum = Object.entries(cb).reduce((a, [k, v]) => a + (k.startsWith('3D') ? v : 0), 0), gpuSq = M('square', 'off').backend === 'webgpu';
  check(cb['3D render'] >= 0 && (gpuSq ? cb['3D: scene pass'] > 0 && cb['3D: shadow maps'] >= 0 && cb['3D: passes'] > 0 : cb['3D: drawing'] > 0) && cbSum > M('square', 'off').work * .6 && cbSum < M('square', 'off').work * 1.6 + 1
    && new RegExp(`\\n  a skeleton each +.* · code [\\d.]+ ms \\([^)]*${gpuSq ? 'scene pass' : 'drawing'} [\\d.]+`).test(sc.text),
    'the report says where the engine\'s code went for the square\'s people, by part', JSON.stringify({ codeBy: cb, work: M('square', 'off').work, backend: M('square', 'off').backend }));
  // the field: people, a dog and a jeep on snow, once leaving no trace and once with their prints and tracks on sheets of their own
  const kept = /^(\d+) marks kept, (\d+) tiles of them drawn, made in [\d.]+ ms a frame$/.exec(M('field', 'on').tell || '');
  check(kept && +kept[1] >= 6 && +kept[2] >= 2 && M('field', 'on').calls > M('field', 'off').calls && !M('field', 'off').tell && /\nFIELD · ground that takes marks · 2 people, a dog and a jeep going round a field of sand, grass and bare earth, in snow, then on wet earth, then dry · made in /.test(sc.text) && /\n  = prints, tracks, parted grass against ground that takes no marks: /.test(sc.text),
    'the field\'s people, dog and jeep leave prints and tracks, drawn on sheets of their own', JSON.stringify(sby.field));
  // the yard: a camp fire, a chimney and a burning drum, once with no gas and once with the smaller version of it (and, on WebGPU, as the gas on the graphics chip)
  const gasOf = /^([\d,]+) cells of (\d+) cm in JavaScript, ([\d,]+) puffs drawn, [\d.]+ ms of the kit's code a frame$/.exec(M('yard', 'puffs').tell || '');
  check(gasOf && +gasOf[1].replace(/,/g, '') >= 1000 && +gasOf[3].replace(/,/g, '') >= 10 && M('yard', 'puffs').calls > M('yard', 'none').calls && !M('yard', 'none').tell && /\nYARD · smoke and fire that flow · a camp fire under a beam, /.test(sc.text) && /\n  = the smaller version \(soft puffs\) against no smoke or fire: /.test(sc.text),
    'the yard\'s fires and chimney make flames and smoke, drawn as soft puffs that ride the flow', JSON.stringify(sby.yard));
  // the cliff: the same walk on the height map alone, then with rock on it (cliffs with ledges, a cave through the spur, an arch)
  const rock = /^rock of ([\d,]+) triangles in (\d+) pieces, its numbers worked out in [\d,]+ ms$/.exec(M('cliff', 'on').tell || '');
  check(rock && +rock[1].replace(/,/g, '') > 3000 && +rock[2] >= 4 && M('cliff', 'on').tris > M('cliff', 'off').tris && M('cliff', 'on').calls > M('cliff', 'off').calls && !M('cliff', 'off').tell && /^rock of [\d,]+ triangles made/.test(M('cliff', 'on').note) && M('cliff', 'on').build > 0 && /\nCLIFF · land with cliffs, caves and overhangs · a walk along the foot of a cliff, through a cave under a spur and under an arch, four people standing about · made in /.test(sc.text) && /\n  = cliffs, a cave, an arch against the height map alone: /.test(sc.text),
    'the cliff\'s rock is made and drawn: cliffs, a cave and an arch on the land', JSON.stringify(sby.cliff));
  // the parade: two people, a dog, a horse and a goods train, their points as plain floats and then kept small (src/kit/slim.js)
  const mbOf = m => { const x = /^([\d,]+) points: ([\d.]+) MB in memory, ([\d.]+) MB on the graphics chip$/.exec(M('parade', m).tell || ''); return x ? [+x[1].replace(/,/g, ''), +x[2], +x[3]] : [NaN, NaN, NaN]; };
  check(mbOf('on')[0] === mbOf('off')[0] && mbOf('on')[1] < mbOf('off')[1] * .75 && mbOf('on')[2] < mbOf('off')[2] * .75 && Math.abs(M('parade', 'on').tris - M('parade', 'off').tris) < M('parade', 'off').tris * .02 && M('parade', 'off').build > 0 && /\n  = kept small against plain floats: /.test(sc.text),
    'the parade\'s people, animals and train are the same triangles in under three quarters of the bytes kept small', JSON.stringify({ off: mbOf('off'), on: mbOf('on'), parade: sby.parade }));
  // the line-up: people posed as drawn and then with steps, weight, a live face and hands; the second run takes steps of its own
  const posedOf = m => { const x = /^posed in ([\d.]+) ms a frame(?: · ([\d,]+) steps taken)?$/.exec(M('lineup', m).tell || ''); return x ? [+x[1], x[2] ? +x[2].replace(/,/g, '') : null] : [NaN, null]; };
  check(posedOf('off')[0] >= 0 && posedOf('off')[1] === null && posedOf('on')[0] >= 0 && posedOf('on')[1] > 0 && M('lineup', 'off').build > 0 && /\n  = steps, weight, a live face and hands against posed as drawn: /.test(sc.text),
    'the line-up\'s people are posed as drawn and then take steps of their own', JSON.stringify(sby.lineup));
  // the faces: people close up, each look sculpted the first time it is met, the real one set against the clean one
  check(M('faces', 'clean').build > 0 && M('faces', 'real').build > 0 && /^posed in [\d.]+ ms a frame$/.test(M('faces', 'real').tell || '') && /\n  = the real look against the clean look: /.test(sc.text),
    'the faces are drawn close up in the clean look and then the real one', JSON.stringify(sby.faces));
  // the street: the city as it was (windows painted on, boxes for cars and people), then with rooms behind its windows, real cars and sculpted people
  const strt = /^the city's code [\d.]+ ms a frame · (\d+) cars drawn whole · ([\d,]+) parked · ([\d,]+) people drawn in (\d+) draws$/.exec(M('street', 'new').tell || '');
  check(strt && +strt[2].replace(/,/g, '') >= 1 && +strt[3].replace(/,/g, '') >= 1 && +strt[4] >= 1 && M('street', 'new').calls > M('street', 'old').calls && /^the city's code [\d.]+ ms a frame$/.test(M('street', 'old').tell || '')
    && /^\d+ buildings, \d+ cars, \d+ parked, \d+ people$/.test(M('street', 'new').note || '') && /\n  = rooms behind the windows, real and parked cars, sculpted people, the street dressed against windows painted on, boxes for cars and people: /.test(sc.text),
    'the street is walked as the city was and then with rooms behind its windows, real and parked cars, sculpted people and the street dressed', JSON.stringify(sby.street));
  // the night: a wet street with every lamp a plain round light, then with the nearest lamps' shadows (from the atlas on WebGPU, where
  // slots are drawn again only when something they see moved: cars and people do here), shaped headlights and neon
  const litOf = m => { const x = /^([\d.]+) lights lit(?: · ([\d.]+) with a shadow, ([\d.]+) shadow slots drawn a frame)?$/.exec(M('night', m).tell || ''); return x ? [+x[1], x[2] == null ? null : +x[2], x[3] == null ? null : +x[3]] : [NaN, null, null]; };
  const nightOn = litOf('on'), nightGpu = M('night', 'on').backend === 'webgpu';
  const nightLit = nightGpu ? 4 : 2;   // (WebGL: as many round lights as the quality allows, two at the least)
  check(litOf('off')[0] >= nightLit && litOf('off')[1] === null && nightOn[0] >= nightLit && (nightGpu ? nightOn[1] >= 1 && nightOn[2] > 0 : nightOn[1] === null) && /\n  = lamps with shadows, shaped headlights, neon against plain round lamps: /.test(sc.text),
    'the night street is lit by plain round lamps and then by lamps with shadows, shaped headlights and neon', JSON.stringify(sby.night));
  const made = /^(\d+) surfaces made of ([\d,]+) triangles$/.exec(M('village', 'on').note);
  check(made && +made[1] >= 3 && +made[2].replace(/,/g, '') > 100000 && M('village', 'on').build > 0, 'the village\'s walls and roofs are made into real triangles before its second run', JSON.stringify(sby.village));
  check(sc.seen.stage && sc.seen.cards === 0 && sc.seen.awake && sc.seen.force === (/ low class/.test(sc.text) ? 1 : 2) && sc.steps.some(t => /Valley: making the scene$/.test(t)) && sc.steps.some(t => /Forest · detail levels: getting ready$/.test(t)),
    'while they run the feed is empty, the scenes draw on a stage of their own with the 3D canvas under it, quality is pinned and the screen is kept on', JSON.stringify({ seen: sc.seen, steps: sc.steps }));
  check(!sc.after.stage && !sc.after.touring && sc.after.force == null && sc.after.active === 'bunker-breakout' && !sc.after.awake && !sc.after.msg,
    'afterwards the stage is gone, quality is the phone\'s own again and the feed is back on the game it was on', JSON.stringify(sc.after));
  check(/^Game Scroll engine test scenes · \d{4}-\d\d-\d\d \d\d:\d\d UTC · build /.test(sc.text) && /\nPHONE: .* Hz · /.test(sc.text) && /\nPICTURE: WebG(L|PU).* · quality (medium|high), pinned · 3D drawn at \d+ x \d+, shown at \d+ x \d+.* · frame generation off · 1\.5 s a run · scenes at 0\.1 of full size/.test(sc.text)
    && /\nVALLEY · cluster detail · [\d,]+ triangles in 55 meshes · made in /.test(sc.text) && /\n  every triangle +\d+ fps · worst 1% \d+ fps · longest \d+ ms · chip .* · code [\d.]+ ms \([a-z ]+ [\d.]+(, [a-z ]+ [\d.]+)*\) · [\d,]+ triangles in [\d,]+ draws/.test(sc.text)
    && /\n  cluster detail +\d+ fps .* · ready in [\d.]+ (ms|s) · \d+ mesh(es)? drawn in clusters · /.test(sc.text) && /\n  = cluster detail against every triangle: .*[\d.]+ times fewer triangles/.test(sc.text) && /\nFOREST · detail for copies · /.test(sc.text) && /\nVILLAGE · real surface detail · /.test(sc.text),
    'the report names the phone, the picture and every run with its numbers', sc.text);
  // two runs at the chip's own times by pass (Rob's Fold, the village, 2026-11-13): the chip took 1.8 times as long in the second,
  // and so did the passes that do the same work in both, so the report says the work is the same and that the chip slowed down
  const work = await q.evaluate(async () => {
    const { sceneLines } = await (await __gs.tourKit()).scenesKit();
    const run = (key, name, fps, chip, by) => ({ key, name, frames: 600, fps, low: 40, worst: 30, work: 3, tris: 1000, calls: 50, chip, chipBy: by });
    const one = { key: 'village', name: 'Village', what: 'real surface detail', modes: [run('off', 'flat', 85, 10.3, { upscale: 4.1, scene: 1.9, ao: 1.7, bloom: 1.5, compute: .6, show: .4 }), run('on', 'real', 50, 18.1, { upscale: 6.9, scene: 4.3, ao: 2.9, bloom: 2.6, compute: .8, show: .6 })] };
    return sceneLines(one, 120).join('\n');
  });
  check(/\n  = real against flat: 1\.7 times slower · 1\.8 times more chip time · the same chip work \(the chip ran 1\.7 times slower in this run: go by the work\) · the same triangles/.test(work),
    'set against the passes that do the same work in both runs, a run in which the chip slowed down costs the same work', work);
  // one scene alone, on a bigger screen: in a picture that small a brick's depth is under a pixel, and a surface is then drawn as flat as before.
  // Each of its timed frames is held up for over half a second, which is what a slow build machine's are at this size. They are frames
  // all the same: they used to be taken for the phone having gone to another app, the run's clock stood still, and this step ran for
  // nine minutes or for ever. (A timed run that has not ended in a minute is stopped here, and fails the checks below.)
  // And once, in the first run, the phone does go to another app for a second and a half while a frame is waited for.
  await q.setViewportSize({ width: 720, height: 960 }); await q.waitForTimeout(400);
  const one = await q.evaluate(async () => {
    const signal = {}, plays = []; let guard = 0;
    const hold = ms => { const end = performance.now() + ms; while (performance.now() < end); };
    const away = () => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); hold(1500); delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); };
    const res = await __gs.tour({ scenes: true, seconds: 4, size: .1, only: ['village'], signal,
      onStep(s) { clearTimeout(guard); if (s.what === '0 s') { plays.push(0); guard = setTimeout(() => { signal.stop = true; }, 60000); } },
      onPlay() { hold(520); if (++plays[plays.length - 1] === 1 && plays.length === 1) setTimeout(away); } });
    clearTimeout(guard); await new Promise(r => setTimeout(r, 400));
    return { n: res.scenes.length, stopped: res.stopped, error: res.scenes[0].error, plays, modes: res.scenes[0].modes.map(m => ({ key: m.key, tris: Math.round(m.tris), build: m.build == null ? null : Math.round(m.build), shown: m.ow + ' x ' + m.oh, frames: m.frames, longest: Math.round(m.worst) })), active: __gs.active?.def.id };
  });
  check(one.n === 1 && !one.error && one.modes[1]?.tris > one.modes[0]?.tris * 1.5 && one.modes[1].build < 8000 && one.active === 'bunker-breakout',
    'one scene can be run alone; close to, the village draws more triangles for its surfaces, which were kept from the first run', JSON.stringify(one));
  check(!one.stopped && one.modes.length === 2 && one.modes.every(m => m.frames >= 1 && m.longest > 500),
    'a frame that takes over half a second is timed as a frame, and the run still ends by the clock', JSON.stringify(one));
  // (a run times every frame after its first: one fewer where the phone was away)
  check(one.modes[0]?.frames === one.plays[0] - 2 && one.modes[1]?.frames === one.plays[1] - 1,
    'time spent in another app in the middle of a run is nobody\'s frame', JSON.stringify(one));
  if (process.env.SHOTS) require('fs').writeFileSync(process.env.SHOTS + '/scenes-report.txt', sc.text);
  // ray tracing alone: only the hall, flown as in the engine test scenes; drawn with WebGL it has no ray traced run, and the report says so
  // (back on the small screen: at 720 x 960 the software renderer draws a frame in a quarter of a second)
  await q.setViewportSize({ width: 240, height: 320 }); await q.waitForTimeout(400);
  const rt = await q.evaluate(async () => { const r = await __gs.tour({ scenes: true, traced: true, seconds: 1.5, size: .1 }); return { keys: r.scenes.map(s => s.key), modes: r.scenes[0]?.modes.map(m => m.key + ':' + m.frames + ':' + m.backend), error: r.scenes[0]?.error, note: r.note || '', text: r.text, active: __gs.active?.def.id }; });
  const rtGpu = /\nPICTURE: WebGPU/.test(rt.text);
  check(rt.keys.join() === 'hall' && !rt.error && (rtGpu ? rt.modes.length === 3 && !rt.note : rt.modes.length === 2 && /^Ray tracing needs WebGPU/.test(rt.note) && rt.text.includes(rt.note)) && rt.modes.every(m => +m.split(':')[1] > 3)
    && /^Game Scroll engine test scenes, ray tracing · /.test(rt.text) && /\nHALL · ray traced reflections · a polished hall of 6 pillars and figures, /.test(rt.text) && /\n  = (from the screen against no reflections|reflections from the screen against none): /.test(rt.text) && rt.active === 'bunker-breakout',
    'ray tracing alone flies only the hall, with the engine test scenes\' report', JSON.stringify(rt));
  // frame generation's runs need WebGPU: drawn with WebGL, the report says so and nothing is flown
  const noFg = await q.evaluate(async () => { const r = await __gs.tour({ scenes: true, framegen: true, seconds: 1, size: .1 }); return { n: r.scenes.length, note: r.note || '', text: r.text, active: __gs.active?.def.id }; });
  check(noFg.n === 0 && /^Frame generation needs WebGPU/.test(noFg.note) && /^Game Scroll engine test scenes, frame generation · /.test(noFg.text) && noFg.text.includes(noFg.note) && noFg.active === 'bunker-breakout',
    'frame generation\'s runs, where the 3D is drawn with WebGL, say there was nothing to time', JSON.stringify(noFg));
  await q.done();
  await framegenScenes();
}

// Frame generation's runs in the engine test scenes (src/detail-tour.js), on a browser with WebGPU on its
// software renderer: the square with its people as one crowd, five ways. Its frames come far too slowly for a
// beat, so every other refresh is one between real frames (alternate), whatever the clock says.
async function framegenScenes() {
  const path = require('path'), icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const g = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan', '--autoplay-policy=no-user-gesture-required'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
  const q = await open(g, { width: 240, height: 320, dpr: 1 });
  await q.game('bunker-breakout');
  const fg = await q.evaluate(async () => {
    __hd.direct = true; const steps = [];
    const res = await __gs.tour({ scenes: true, framegen: true, alternate: true, seconds: 2, size: .1, only: ['square'], onStep(s) { steps.push(`${s.i + 1}/${s.n} ${s.game.title}: ${s.what}`); } });
    __hd.direct = false; await new Promise(r => setTimeout(r, 400));
    const s = res.scenes[0];
    return { text: res.text, steps, error: s?.error, modes: (s?.modes || []).map(m => ({ key: m.key, name: m.name, frames: m.frames, pictures: m.pictures, drawn: m.drawn, how: m.how, backend: m.backend, pace: m.pace, madeMs: m.madeMs, dropped: m.dropped, easy: m.easy })), active: __gs.active?.def.id, stage: !!document.querySelector('.tour-stage') };
  });
  const M = k => fg.modes.find(m => m.key === k) || {};
  check(!fg.error && fg.modes.map(m => m.key).join() === 'every,half,before,blend,ahead' && fg.modes.every(m => m.frames > 3 && m.pictures >= 3 && m.backend === 'webgpu'),
    'frame generation is timed in the square five ways: as many drawn as the phone draws, half of them, and half with the rest blended as before, blended as now, then made ahead', JSON.stringify(fg.modes));
  check(M('half').pictures === M('half').drawn && !M('half').how && M('before').how === 'blend' && M('blend').how === 'blend' && M('ahead').how === 'ahead' && ['before', 'blend', 'ahead'].every(k => M(k).pictures > M(k).drawn * 1.5),
    'with none made only the drawn frames are new pictures; blended and ahead, the refreshes between show made frames', JSON.stringify(fg.modes));
  check(M('before').pace === 'after' && ['first', 'after'].includes(M('blend').pace) && (M('blend').madeMs == null) === (M('before').madeMs == null),
    'blended before puts the made frame on the real one\'s refresh; as now, it is paced by the chip\'s times', JSON.stringify(fg.modes));
  const told = !/chip time not told/.test(fg.text);
  check(/^Game Scroll engine test scenes, frame generation · /.test(fg.text) && /\nPICTURE: WebGPU · .* · frame generation as each run says, for a \d+ Hz screen · /.test(fg.text)
    && /\n  \d+ drawn, \d+ blended +\d+ pictures a second \(\d+ drawn\) · worst 1% \d+ · longest \d+ ms · .*(each frame on a refresh of its own|the made frame on the real one's refresh) · .*code [\d.]+ ms · 3D at \d+ x \d+ · screen \d+ Hz/.test(fg.text)
    && /\n  \d+ \+ \d+ blended before +\d+ pictures a second \(\d+ drawn\) · .*the made frame on the real one's refresh · /.test(fg.text)
    && (!told || (/\n  \d+ drawn, \d+ blended +.*chip [\d.]+ ms a drawn frame \(.*made frames [\d.]+.*\) · a made frame [\d.]+ ms \(.*picture [\d.]+.*\)/.test(fg.text)
      && /\n  = a made frame: [\d.]+ ms blended before, [\d.]+ ms blended, [\d.]+ ms ahead of chip time/.test(fg.text)))
    && /\n  = \d+ drawn, \d+ blended against \d+ \+ \d+ blended before: \d+ pictures a second against \d+ · worst 1% \d+ against \d+/.test(fg.text)
    && /\n  = \d+ drawn, \d+ ahead against \d+ drawn, none made: \d+ pictures a second against \d+ · /.test(fg.text),
    'the report says what a made frame costs the chip and where, sets blend as now against blend before, and both against drawing frames alone', fg.text);
  check(fg.active === 'bunker-breakout' && !fg.stage && fg.steps.some(t => /^4\/5 Square · \d+ drawn, \d+ blended: getting ready$/.test(t)), 'afterwards the feed is back on the game it was on', JSON.stringify({ active: fg.active, stage: fg.stage, steps: fg.steps }));
  if (process.env.SHOTS) require('fs').writeFileSync(process.env.SHOTS + '/framegen-report.txt', fg.text);
  await q.done(); await g.close();
}

/* ---------- a big 3D game is made a little each frame, each pass on a fresh copy of its file ---------- */
async function loading(b) {
  console.log('\nLoading');
  const p = await open(b);
  // A made-up Next Gen game that keeps its world at the top of its file, as the starter templates do
  // (`if (!world) setup()`). The kit stops a pass partway through setup(); if the next pass shared
  // that world it would find it half built. file() stands for the game's file: each call is a copy
  // with its own top-level memory.
  const play = (id, how) => p.evaluate(async ([id, how]) => {
    const gs = (await __gs.gs()).default;
    const file = () => {
      let world = null;
      const setup = () => {
        world = { things: [] };
        world.things.push(gs.models.sculpt([{ ball: .4 }, { box: [.5, .3, .4], at: [.2, .1, 0], round: .05 }], { res: 26 }));
        for (let i = 0; i < 6; i++) world.things.push(gs.models.prop(['crate', 'barrel', 'chair', 'table', 'bench', 'bucket'][i], { seed: 9100 + i + id.length }));
        world.done = true;
      };
      return { id, likes: 1, title: 'Loading test', tag: 'Next Gen · Test', retro: true, era: 'nextgen', pal: 'grape', w: 300, h: 300, goal: 1, hint: 'A test.', creator: 'Test',
        make: () => ({ reset() { if (!world) setup(); if (!world.done) throw new Error('the world was left half built'); }, update() {}, draw(c) { c.fillStyle = '#123'; c.fillRect(0, 0, 300, 300); } }) };
    };
    const def = file(); __gs.GAMES.push(def);
    let copies = 0; if (how === 'fresh') __gs.fresh[id] = () => { copies++; return Promise.resolve(file()); };
    __gs.only(id, true);
    await new Promise(res => { const t = setInterval(() => { if (__gs.active && __gs.active.def.id === id && (!__gs.active.loading || __gs.active.failed)) { clearInterval(t); res(); } }, 50); });
    await new Promise(res => setTimeout(res, 400));
    return { passes: __gs.passes.filter(x => x.id === id).map(x => ({ built: x.built, made: x.made, whole: x.whole })), copies, failed: __gs.active.failed || null };
  }, [id, how]);
  let r = await play('zz-loading-a', 'fresh');
  check(!r.failed && r.passes.length > 1 && r.passes.at(-1).made, 'a game that keeps its world at the top of its file loads in several passes, never half built', JSON.stringify(r));
  check(r.copies === r.passes.length && r.passes.every(x => !x.whole), 'each pass ran on a fresh copy of the file', JSON.stringify(r));
  check(r.passes.some(x => !x.made && x.built > 0), 'and a pass that had built something was stopped to let a frame go by', JSON.stringify(r.passes));
  // no way to get a fresh copy: the game is made in one go, on the copy the app has
  r = await play('zz-loading-bb', 'none');
  check(!r.failed && r.passes.length === 1 && r.passes[0].whole && r.passes[0].made, 'a game with no fresh copy to be had is made in one go', JSON.stringify(r));
  await p.done();
  // a real board game: its textures' number work goes to the workers, and nothing is left unmade
  const q = await open(b);
  const before = await q.evaluate(() => ({ ...__gs.jobs }));
  await q.evaluate(() => __gs.only('tavern-dice', true));
  await q.waitForFunction(() => __gs.active && __gs.active.def.id === 'tavern-dice' && !__gs.active.loading, null, { timeout: 120000 });
  const jobs = await q.evaluate(() => ({ ...__gs.jobs }));
  check(jobs.done - before.done >= 4 && jobs.failed === before.failed && jobs.started === jobs.done, 'a board game\'s textures are finished by the background workers before its card shows', JSON.stringify({ before, jobs }));
  await q.evaluate(() => __gs.start()); await q.waitForTimeout(1500);
  check(await q.evaluate(() => __gs.active.state === 'playing' && !__gs.active.failed), 'and it plays');
  await q.done();
}

/* ---------- Play on a 3D game: a loading screen, the round's first frames and first step under it, then the round ---------- */
async function ready(b) {
  console.log('\nGetting a round ready');
  const p = await open(b);
  // A made-up Next Gen game that counts what the app asks of it. Its reset() makes a thing the card has never
  // drawn, and its first update() another (as plenty of real games do): both must be on the graphics chip
  // before the round starts. how: 'score' scores in its first update, 'over' ends its round there.
  const add = (id, how = '') => p.evaluate(async ([id, how]) => {
    const gs = (await __gs.gs()).default, { HDView, pbr, sun, THREE } = gs.hd;
    const N = window.__n = { resets: 0, updates: 0, draws: 0, log: [], dts: [] };
    let v, light, made = [];
    const def = { id, likes: 1, title: 'Ready test', tag: 'Next Gen · Test', retro: true, era: 'nextgen', pal: 'grape', w: 300, h: 300, goal: 50, hint: 'A test.', creator: 'Test', music: 'chase',
      make: api => ({
        reset() {
          if (!v) { v = new HDView({ bg: '#101820' }); light = sun('#ffffff', 3, 10); v.scene.add(light, light.target); v.cam.position.set(0, 4, 7); v.cam.lookAt(0, 0, 0);
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), pbr('#405060', { rough: .6 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; v.scene.add(floor); }
          for (const m of made) v.scene.remove(m); made = []; N.resets++; N.first = true;
          const m = new THREE.Mesh(new THREE.TorusKnotGeometry(.5, .18, 64, 12), pbr('#e06030', { rough: .3, metal: .6, clear: 1 })); m.position.set(-1.5, 1, 0); m.castShadow = true; v.scene.add(m); made.push(m);
        },
        update(dt) {
          N.updates++; N.dts.push(dt); N.log.push('u:' + __gs.active?.state);
          if (N.first) { N.first = false;
            const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.6, 2), pbr('#30c0e0', { glow: 2, rough: .2 })); m.position.set(1.5, 1, 0); m.castShadow = true; v.scene.add(m); made.push(m);
            if (how === 'score') api.score(7); if (how === 'over') api.over(); }
        },
        draw(c) { N.draws++; N.log.push('d:' + __gs.active?.state); v.render(c, 300, 300); },   // (the card's first picture is drawn before it is the one on screen)
      }) };
    __gs.GAMES.push(def); __gs.only(id, true);
    await new Promise(res => { const t = setInterval(() => { if (__gs.active && __gs.active.def.id === id && (!__gs.active.loading || __gs.active.failed)) { clearInterval(t); res(); } }, 50); });
    await new Promise(res => setTimeout(res, 600));
    if (__gs.active.failed) throw new Error('the test game did not load: ' + __gs.active.failed);
  }, [id, how]);
  const cover = () => p.evaluate(() => { const el = document.querySelector('#feed .slide .load-ov'); return !!el && !el.hidden && !el.classList.contains('gone'); });
  // what the game was asked between Play and the round: watched every frame
  const watch = how => p.evaluate(how => new Promise(res => {
    const N = __n, s = __gs.active, at = { n0: { ...N }, t0: performance.now(), covered: 0, seen: [], began: 0 };
    N.log = []; N.dts = [];
    if (how === 'tap') document.querySelector('#feed .slide .overlay button.play').click(); else __gs[how]();
    at.atOnce = { state: s.state, starting: !!s.starting, cover: !!document.querySelector('#feed .slide .load-ov:not([hidden])') };
    const f = () => {
      const el = document.querySelector('#feed .slide .load-ov'), up = !!el && !el.hidden && !el.classList.contains('gone');
      if (s.starting) { if (up) at.covered++; at.seen.push(s.starting.phase); }
      if (s.state !== 'ready' && !s.starting || performance.now() - at.t0 > 40000) {
        res({ ...at, ms: Math.round(performance.now() - at.t0), state: s.state, readyMs: s.readyMs | 0, waits: __gs.waits(), score: s.score, badge: s.scoreEl.textContent, tune: __gs.soundtrack.now, ahead: __gs.soundtrack.ahead,
          resets: N.resets - at.n0.resets, updates: N.updates, draws: N.draws - at.n0.draws, log: N.log.join(' '), dts: N.dts.slice(0, 3), n0: undefined, seen: [...new Set(at.seen)].join(' ') });
        return;
      }
      requestAnimationFrame(f);
    }; requestAnimationFrame(f);
  }), how);
  await add('zz-ready-a');
  const u0 = await p.evaluate(() => __n.updates);
  let r = await watch('tap');
  check(u0 === 0 && r.atOnce.starting && r.atOnce.cover && r.atOnce.state === 'ready', 'Play on a Next Gen card puts its loading screen up at once, and the round has not started', JSON.stringify(r.atOnce));
  const beforeRound = r.log.split(' ').filter(x => !x.endsWith(':playing'));
  check(r.state === 'playing' && r.resets === 1 && r.seen.startsWith('load warm') && r.covered > 3 && r.readyMs > 0, 'the game is reset once, its frames are drawn under the loading screen, and then the round starts', JSON.stringify(r));
  check(beforeRound.filter(x => x[0] === 'u').length === 1 && beforeRound.filter(x => x[0] === 'd').length >= 6 && beforeRound.findIndex(x => x[0] === 'u') >= 3 && beforeRound.at(-1)[0] === 'd',
    'under it: frames with no update, then the round\'s first update once, then frames again', beforeRound.join(' '));
  check(r.dts[0] > .005 && r.dts[0] < .04, 'that first update is one frame of the game\'s time', JSON.stringify(r.dts));
  check(r.waits.hard === 0 && await p.evaluate(() => !(window.__hdView?.held?.size)), 'when the round starts nothing is still being built or hidden', JSON.stringify(r.waits));
  check(r.tune && r.tune.id === 'zz-ready-a' && r.tune.playing && r.ahead === null, 'its soundtrack, made behind the loading screen, starts with the round', JSON.stringify([r.tune, r.ahead]));
  await p.waitForTimeout(700);
  check(!(await cover()) && await p.evaluate(() => __gs.active.state === 'playing' && __n.updates > 3), 'the loading screen is gone and the round runs');
  // again: the card has been through it once
  await p.evaluate(() => __gs.api(__gs.active).over()); await p.waitForTimeout(700);
  const first = r; r = await watch('play');
  check(r.state === 'playing' && r.resets === 1 && r.draws < first.draws && r.ms < first.ms + 400, 'Play again gets ready in fewer frames', JSON.stringify({ first: [first.draws, first.ms], again: [r.draws, r.ms] }));
  // tests start a round this instant, as they always have
  await p.evaluate(() => __gs.api(__gs.active).over()); await p.waitForTimeout(700);
  r = await p.evaluate(() => { __gs.start(); return { state: __gs.active.state, starting: !!__gs.active.starting }; });
  check(r.state === 'playing' && !r.starting, '__gs.start() still starts the round at once');
  // what a round's first update asks for under the loading screen holds when the round is on
  await add('zz-ready-score', 'score'); r = await watch('play');
  check(r.state === 'playing' && r.score === 7 && r.badge === '7', 'a score from the round\'s first update is the round\'s score', JSON.stringify([r.state, r.score, r.badge]));
  await add('zz-ready-over', 'over'); r = await watch('play'); await p.waitForTimeout(300);
  check(await p.evaluate(() => __gs.active.state === 'over') && !(await cover()), 'and a round that ends in its first update is over as soon as it is on');
  // leaving while it gets ready gives the start up; the game is put back to the start of a round
  await add('zz-ready-left');
  r = await p.evaluate(() => new Promise(res => {
    const s = __gs.active; __gs.play();
    const f = () => { if (s.starting && s.starting.stepped || !s.starting) { const stepped = !!s.starting, tune = __gs.soundtrack.ahead; __gs.left(s); res({ stepped, tune, starting: !!s.starting, state: s.state, resets: __n.resets, cover: !!s.el.querySelector('.load-ov:not([hidden])'), ov: !s.overlay.hidden, ahead: __gs.soundtrack.ahead, now: __gs.soundtrack.now }); } else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }));
  await p.waitForTimeout(1200);
  const after = await p.evaluate(() => ({ resets: __n.resets, state: __gs.active.state, updates: __n.updates }));
  check(r.stepped && !r.starting && r.state === 'ready' && !r.cover && r.ov && after.resets === r.resets + 1 && after.state === 'ready' && after.updates === 1,
    'a start given up after the round\'s first step: no round, the card as it was, and the game reset once the feed is still', JSON.stringify({ r, after }));
  check(r.tune === 'zz-ready-left' && r.ahead === null && r.now === null, 'and the tune made for that round is let go', JSON.stringify([r.tune, r.ahead, r.now]));
  // reset() for the next round asks for something still loading (the next mission's people, not sculpted on this phone
  // yet: Play again after a mission): the loading screen waits for it, reset() runs again and the round starts
  await add('zz-ready-late');
  r = await p.evaluate(() => new Promise(res => {
    const s = __gs.active, g = s.game, reset = g.reset.bind(g); let calls = 0, ok = 0, waited = false;
    g.reset = () => { if (!calls++) { const e = new Error('gs.models.human is still loading'); e.name = 'StillLoading'; e.what = 'gs.models.human'; e.kitLoading = new Promise(r => setTimeout(r, 700)); throw e; } ok++; return reset(); };
    __gs.play();
    const t0 = performance.now(), f = () => {
      if (s.loading && !s.failed) waited = true;
      if (s.state === 'playing' || s.failed || performance.now() - t0 > 30000) return res({ state: s.state, failed: s.failed, waited, calls, ok, same: s.game === g, ms: Math.round(performance.now() - t0) });
      requestAnimationFrame(f);
    }; requestAnimationFrame(f);
  }));
  check(r.state === 'playing' && !r.failed && r.waited && r.calls === 2 && r.ok === 1 && r.same && r.ms >= 700,
    'a reset() that asks for something still loading waits under the loading screen, then reset() once more and the same game starts its round (not "hit a problem")', JSON.stringify(r));
  await p.done();

  // a 2D game starts the instant Play is pressed, with no loading screen
  const q = await open(b);
  await q.game(CASUAL);
  r = await q.evaluate(() => { document.querySelector('#feed .slide .overlay button.play').click(); return { state: __gs.active.state, starting: !!__gs.active.starting, cover: !!document.querySelector('.load-ov') }; });
  check(r.state === 'playing' && !r.starting && !r.cover, 'a 2D game starts the instant Play is pressed', JSON.stringify(r));
  // Play pressed while a 3D game is still being made: it starts by itself once it is made
  r = await q.evaluate(async () => {
    __gs.only('tavern-dice', true); await new Promise(res => setTimeout(res, 60));
    const s = __gs.active, early = s.loading; __gs.play();
    const at = { early, starting: !!s.starting, cover: !!s.el.querySelector('.load-ov:not([hidden])'), state: s.state };
    await new Promise(res => { const t0 = performance.now(), t = setInterval(() => { if (s.state === 'playing' || performance.now() - t0 > 120000) { clearInterval(t); res(); } }, 50); });
    return { ...at, end: s.state, id: s.def.id, loading: s.loading, held: window.__hdView?.held?.size | 0, waits: __gs.waits() };
  });
  check(r.early && r.starting && r.cover && r.state === 'ready', 'Play on a Board game that is still loading puts the loading screen up', JSON.stringify(r));
  check(r.end === 'playing' && !r.loading && !r.held && !r.waits.hard, 'and the round starts by itself once the game is made and ready', JSON.stringify(r));
  // an AR game goes the same way
  await q.game('bin-flick');
  r = await q.evaluate(async () => {
    const s = __gs.active; document.querySelector('#feed .slide .overlay button.play').click();
    const at = { starting: !!s.starting, state: s.state };
    await new Promise(res => { const t0 = performance.now(), t = setInterval(() => { if (s.state === 'playing' || performance.now() - t0 > 60000) { clearInterval(t); res(); } }, 50); });
    return { ...at, end: s.state, readyMs: s.readyMs | 0 };
  });
  check(r.starting && r.state === 'ready' && r.end === 'playing' && r.readyMs > 0, 'an AR game gets ready behind its loading screen too', JSON.stringify(r));
  await q.done();
}

/* ---------- old WebViews: the fill-ins for roundRect, Object.hasOwn and structuredClone ---------- */
async function oldweb(b) {
  console.log('\nOld WebViews');
  const SHAPES = [[20, 20, 120, 70, 14], [20, 20, 120, 70, [30, 4]], [20, 20, 120, 70, [8, 20, 40]], [20, 20, 120, 70, [0, 12, 24, 36]], [20, 20, 120, 70, [{ x: 40, y: 10 }, 6]],
    [20, 20, 120, 70, 500], [150, 100, -120, -70, [30, 4, 12, 0]], [150, 20, -120, 70, [30, 4, 12, 0]], [20, 20, 120, 70]];
  // each box drawn with whichever roundRect the page has: how solid every pixel came out
  const draw = shapes => shapes.map(s => { const c = document.createElement('canvas'); c.width = 170; c.height = 120; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.beginPath(); x.roundRect(...s); x.fill(); return [...x.getImageData(0, 0, 170, 120).data].filter((_, i) => i % 4 === 3); });
  const now = await open(b), want = await now.evaluate(draw, SHAPES); await now.done();
  // a browser from before these existed
  const p = await open(b, { before: () => {
    for (const k of ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'Path2D']) if (self[k]) delete self[k].prototype.roundRect;
    delete Object.hasOwn; delete window.structuredClone; window.__gone = typeof Object.hasOwn + ' ' + typeof window.structuredClone + ' ' + typeof CanvasRenderingContext2D.prototype.roundRect;
  } });
  const r = await p.evaluate(() => {
    const cyc = { list: [1, { deep: true }], when: new Date(5), map: new Map([['k', { v: 1 }]]), set: new Set([1, 2]), nums: new Float32Array([1.5, 2.5]) }; cyc.me = cyc;
    const c = structuredClone(cyc); let threw = '';
    try { structuredClone({ f() {} }); } catch (e) { threw = e.name; }
    try { Object.hasOwn(null, 'a'); threw += ' none'; } catch (e) { threw += ' ' + e.name; }
    return { gone: __gone, native: /native code/.test(String(CanvasRenderingContext2D.prototype.roundRect)), path: typeof Path2D.prototype.roundRect, off: !self.OffscreenCanvasRenderingContext2D || typeof OffscreenCanvasRenderingContext2D.prototype.roundRect,
      own: Object.hasOwn({ a: 1 }, 'a') && !Object.hasOwn({}, 'toString') && Object.hasOwn([5], 0), threw,
      clone: c !== cyc && c.me === c && c.list !== cyc.list && c.list[1].deep && c.list[1] !== cyc.list[1] && c.when.getTime() === 5 && c.map.get('k').v === 1 && c.map.get('k') !== cyc.map.get('k') && c.set.has(2) && c.nums[1] === 2.5 && c.nums !== cyc.nums };
  });
  check(r.gone === 'undefined undefined undefined' && !r.native, 'the test browser has no roundRect, Object.hasOwn or structuredClone of its own', JSON.stringify(r));
  check(r.path === 'function' && (r.off === true || r.off === 'function'), 'the app adds roundRect to canvases and paths', JSON.stringify(r));
  check(r.own && r.threw === 'DataCloneError TypeError', 'Object.hasOwn answers as the real one does', JSON.stringify(r));
  check(r.clone, 'structuredClone copies nested data, a Map, a Set, a date, numbers and a loop');
  const got = await p.evaluate(draw, SHAPES);
  const off = got.map((g, i) => g.reduce((n, a, j) => n + (Math.abs(a - want[i][j]) > 40 ? 1 : 0), 0)), solid = want.map(w => w.reduce((n, a) => n + (a > 128 ? 1 : 0), 0));
  check(off.every(n => n <= 6) && solid.every(n => n > 2000), 'rounded boxes come out as the browser\'s own do (one radius, several, ovals, too big, drawn backwards)', JSON.stringify({ off, solid }));
  // a game that draws rounded boxes, and one whose hex library asks Object.hasOwn, both play
  for (const id of ['liquid-mixer', 'hex-merge']) {
    await p.game(id); await p.evaluate(() => __gs.start()); await p.waitForTimeout(1200);
    check(await p.evaluate(() => !__gs.active.failed && __gs.active.state !== 'ready'), `${id} plays a round there`, await p.evaluate(() => __gs.active.state + ' ' + !!__gs.active.failed));
  }
  await p.done();
}

/* ---------- a test build counts rounds and frames for itself, and sends no play stats or crash reports ---------- */
async function reports(b) {
  console.log('\nReports');
  const p = await open(b), sent = [];
  await p.route(u => /\/(perf|stats)$/.test(u.pathname), (route, req) => { if (req.method() !== 'POST') return route.fallback(); sent.push(req.url()); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  await p.game(CASUAL); await p.evaluate(() => __gs.start()); await p.waitForTimeout(1500);
  await p.evaluate(() => { __gs.perf.error(new Error('a test error')); __gs.api(__gs.active).over(); }); await p.waitForTimeout(300);
  const r = await p.evaluate(async id => {
    await __gs.perf.flush(); await __gs.playstats.flush();
    // the app going to the background sends what is waiting, too
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); await new Promise(r => setTimeout(r, 300));
    delete document.visibilityState;
    return { on: __gs.playstats.enabled, frames: __gs.perf.local(id)?.f || 0, plays: JSON.parse(localStorage.gs_stats_pending || '{}')[id]?.p || 0 };
  }, CASUAL);
  check(r.on && r.frames > 30 && r.plays >= 1, 'a test build still counts its own rounds and frames', JSON.stringify(r));
  check(sent.length === 0, 'and sends no play stats or crash reports', sent.join(' '));
  await p.done();

  // what a real build would send, caught in a list in place of the network
  const q = await open(b); await q.game(CASUAL);
  const o = await q.evaluate(async id => {
    const P = __gs.perf, nap = ms => new Promise(r => setTimeout(r, ms)); P.outbox = []; P.versionOf = () => 'abc123def456';
    Object.assign(P.power, { thermal: 3, heat: 2 }); __gs.start(); await nap(1200);
    Object.assign(P.power, { thermal: 2, heat: 1 }); await nap(700);
    P.error(new Error('a test error')); __gs.api(__gs.active).over(); await nap(200);
    await P.flush();
    // how a session ended, as the phone tells it: [what it left, what the phone says] -> what is reported
    const app = P.info().app, tell = [];
    let t = Date.now();
    const was = (playing = true) => ({ game: id, ver: 'v1', playing, app, at: (t += 100000) }), end = x => ({ at: t + 5000, importance: 100, what: '', ...x });
    const tries = [
      [was(), { known: true, exits: [end({ reason: 10, importance: 400, what: 'remove task' })] }],                  // swiped away at the wrong moment
      [was(), { known: true, exits: [end({ reason: 3, what: 'lmk: 1234 kB free' })] }],                              // out of memory, on screen
      [was(false), { known: true, exits: [end({ reason: 2, status: 9 })], web: { at: t + 4700, crashed: false } }],  // the web view's process was killed
      [was(), { known: true, exits: [end({ reason: 5 })], web: { at: t + 4900, crashed: true } }],                   // ...or crashed
      [null, { known: true, exits: [{ at: (t += 100000), reason: 2, status: 9, importance: 400, what: '' }] }],      // let go of in the background
      [null, { known: true, exits: [{ at: (t += 100000), reason: 4, importance: 400, what: 'crash' }] }],            // a crash in the background
      [was(), null],                                                                                                // a phone that keeps no record
      [was(), { known: true, exits: [] }],                                                                          // a record, but not of that session
      [{ ...was(), mem: 2 }, null],                                                                                 // the memory guard had seen memory low
      [{ ...was(), mem: 3 }, { known: true, exits: [end({ reason: 2, status: 9 })], web: { at: t + 4800, crashed: false } }],   // ...and the web view was killed
    ];
    for (const [w, h] of tries) { P.waiting.errors.length = 0; await P.lastTime(w, h); tell.push(P.waiting.errors.map(e => [e.game, e.msg, e.place, e.v || '', e.at ? 'timed' : 'now'].join(' | ')).join(' + ')); }
    // told once: the same records again say nothing new
    P.waiting.errors.length = 0; await P.lastTime(null, tries[5][1]); const again = P.waiting.errors.length;
    // a test robot says so in every batch from then on
    await P.lastTime(null, { robot: 'test lab', known: false }); P.error(new Error('robot error')); await P.flush();
    return { first: P.outbox[0], robot: P.outbox[1]?.info, tell, again };
  }, CASUAL);
  const g = o.first?.games?.[CASUAL] || {}, e = o.first?.errors?.[0] || {};
  check(o.first && g.v === 'abc123def456' && e.v === 'abc123def456' && /a test error/.test(e.msg) && !o.first.info.robot, 'a batch says which version of the game\'s file it is about', JSON.stringify(o.first));
  check(g.hk > 1500 && g.hk <= g.ms + 1 && g.hh > 800 && g.hw > 300 && g.hh + g.hw <= g.hk + 1, 'and how much of the play was with the phone warm or hot', JSON.stringify(g));
  check(o.tell.join('\n') === [
    '',
    `${CASUAL} | App closed while playing: the phone ran out of memory | android: lmk | v1 | timed`,
    `${CASUAL} | App closed while open: the web view was killed, usually for memory |  | v1 | timed`,
    `${CASUAL} | App closed while playing: the web view crashed |  | v1 | timed`,
    '',
    ' | App closed in the background: the app crashed | android: crash |  | timed',
    `${CASUAL} | App closed while playing |  | v1 | now`,
    `${CASUAL} | App closed while playing |  | v1 | now`,
    `${CASUAL} | App closed while playing (memory was low) |  | v1 | now`,
    `${CASUAL} | App closed while playing: the web view was killed, usually for memory (memory was critical) |  | v1 | timed`,
  ].join('\n'), 'the phone\'s own record says why the app closed, and being swiped away is no crash', '\n     ' + o.tell.join('\n     '));
  check(o.again === 0 && o.robot?.robot === true, 'each ending is told once, and a test robot is marked as one', JSON.stringify({ again: o.again, robot: o.robot }));
  await q.done();
}

(async () => {
  const server = await (await import('vite')).preview({ preview: { port: 4184 } });
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }), only = process.argv.slice(2);
  const parts = { awake, touch, pixels, music, saves, fonts, looks, tour, loading, ready, oldweb, reports };
  for (const [name, fn] of Object.entries(parts)) if (!only.length || only.includes(name)) await fn(b);
  await b.close(); server.httpServer.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nall app checks passed'); process.exit(failed ? 1 : 0);
})();
