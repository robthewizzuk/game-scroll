// Scrolls a long way down the feed and checks that old cards are dropped (the page keeps at most a
// handful behind you), that the card on screen never jumps when they are, that the feed keeps fewer
// cards while the phone is short of memory (the memory guard), and that swiping back still works. Usage: npm run build:bundled && node scripts/prune.cjs
const { chromium } = require('playwright');
(async () => {
  const server = await (await import('vite')).preview({ preview: { port: 4186 } });
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:4186/'); await p.waitForFunction(() => window.__gs, null, { timeout: 20000 }); await p.waitForTimeout(1500);   // the top bar settles as the fonts come in, and a refit holds card changes off for half a second
  const state = () => p.evaluate(() => {
    const f = document.getElementById('feed'), a = __gs.active.el, all = [...f.querySelectorAll('.slide')];
    return { cards: all.length, index: all.indexOf(a), id: __gs.active.def.id, offset: Math.round(a.getBoundingClientRect().top - f.getBoundingClientRect().top) };
  });
  let fails = 0, most = 0;
  const check = (ok, label) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', label); };
  for (let i = 0; i < 40; i++) {
    const before = await state();
    await p.evaluate(() => { const f = document.getElementById('feed'); f.scrollBy({ top: f.clientHeight, behavior: 'instant' }); });
    await p.waitForTimeout(150);
    const moved = await state();
    if (moved.id === before.id) { check(false, `swipe ${i} did not change game`); break; }
    await p.waitForTimeout(900);   // let a prune run
    const after = await state();
    most = Math.max(most, after.cards);
    if (after.id !== moved.id || Math.abs(after.offset) > 1) { check(false, `card on screen moved while pruning at swipe ${i} (${JSON.stringify([moved, after])})`); break; }
  }
  const end = await state();
  check(end.index <= 8 + 3, `cards behind the one on screen: ${end.index} (keeps 8, drops in fours)`);
  check(most <= 8 + 3 + 1 + 6, `most cards in the page at once: ${most}`);
  // short of memory (src/kit/memory.js): the feed keeps fewer cards ready below and behind, and builds back up once it's fine
  const ahead = st => st.cards - st.index - 1;
  await p.evaluate(() => __gs.memory(3)); await p.waitForTimeout(1500);
  const short = await state();
  check(ahead(short) <= 1 && short.index <= 1 && Math.abs(short.offset) <= 1 && short.id === end.id, `critically short of memory: ${ahead(short)} card below and ${short.index} behind, the card on screen kept where it was`);
  await p.evaluate(() => __gs.memory(null)); await p.waitForTimeout(5000);
  const fine = await state();
  check(ahead(fine) >= 3 && fine.id === end.id, `fine again: the feed builds back up (${ahead(fine)} below)`);
  const here = end.id;
  await p.evaluate(() => { const f = document.getElementById('feed'); f.scrollBy({ top: -f.clientHeight, behavior: 'instant' }); }); await p.waitForTimeout(400);
  const back = await state();
  check(back.id !== here && Math.abs(back.offset) <= 1, 'swiping back after a prune shows the previous card');
  check(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); server.httpServer.close(); process.exit(fails ? 1 : 0);
})();
