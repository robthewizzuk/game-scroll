// The desktop app on a games handheld or in Steam's games mode (src/desktop.js consoleMode: a ROG Ally, a Steam Deck).
//
// - Swipes that come as a mouse: Steam's games mode turns touches into mouse presses unless told otherwise (the app tells
//   it: desktop/main.cjs, desktop/x11.cjs). Where that didn't take, a press and drag on the feed scrolls it as a finger
//   would, to the next or previous game, and the click at the end of it doesn't start the game under it.
// - No pointer arrow under gamescope: the screen is played by touch and the controller.
// - Settings › Check this handheld (handheldCheck): what the computer, Chromium, gamescope and the engine say about touch,
//   the screen, the graphics and the frame rate, in plain lines to read on the handheld itself (Rob can't easily send
//   logs from it, 2026-11-17).
import { desktop, handheld, consoleMode } from './desktop.js';
import { speed, screenHz, computer, bigHandheld, autoFps, fpsPick, frameGenPick } from './kit/speed.js';
import { gpuFacts, hasWebGPU, gpuName } from './kit/gpu.js';
import { power } from './kit/power.js';
import { perf } from './perf.js';

const seen = { touch: 0, mouse: 0, pen: 0, at: 0, last: '' };
const played = new Map();   // game id -> its frame counts when first seen this run (perf.local), for this run's frame rate
let started = false;

/** From the app's start, on the desktop app in a console's games mode (src/main.js). */
export function startHandheld(feed) {
  if (started || !desktop) return;
  started = true;
  addEventListener('pointerdown', e => { seen[e.pointerType] = (seen[e.pointerType] || 0) + 1; seen.last = e.pointerType; seen.at = Date.now(); }, { capture: true, passive: true });
  if (!consoleMode) return;
  if (desktop.device?.gamescope) document.documentElement.classList.add('no-cursor');
  // this run's frame rate in each game played (perf counts every frame of a round, on this computer, for good)
  setInterval(() => { const id = speed.game?.id; if (id && !played.has(id)) { const l = perf.local(id); played.set(id, { f: l?.f || 0, ms: l?.ms || 0, sl: l?.sl || 0, title: speed.game.title || id, era: speed.game.era || '' }); } }, 1000);
  mouseSwipes(feed);
}

// A press and drag with the mouse on the feed (not while a round is played: the feed is locked then, and drags are the game's)
function mouseSwipes(feed) {
  let d = null, eat = false;
  const skip = t => t.closest('button,a,input,select,textarea,label,dialog,summary,[role=button],[role=menu],.top');
  feed.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || feed.classList.contains('locked') || skip(e.target)) return;
    d = { id: e.pointerId, y: e.clientY, top: feed.scrollTop, t: performance.now(), moved: false, vy: 0, ly: e.clientY, lt: performance.now() };
  }, { passive: true });
  addEventListener('pointermove', e => {
    if (!d || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y, now = performance.now();
    if (!d.moved && Math.abs(dy) < 10) return;
    if (!d.moved) { d.moved = true; feed.style.scrollSnapType = 'none'; }
    d.vy = (e.clientY - d.ly) / Math.max(1, now - d.lt); d.ly = e.clientY; d.lt = now;
    feed.scrollTop = d.top - dy;
  }, { passive: true });
  const end = e => {
    if (!d || e.pointerId !== d.id) return;
    const g = d; d = null;
    if (!g.moved) return;
    eat = true; setTimeout(() => { eat = false; }, 60);
    const dy = e.clientY - g.y, h = feed.clientHeight || 1;
    const cards = [...feed.querySelectorAll('.slide')];
    if (!cards.length) { feed.style.scrollSnapType = ''; return; }
    const from = cards.reduce((b, c, i) => Math.abs(c.offsetTop - g.top) < Math.abs(cards[b].offsetTop - g.top) ? i : b, 0);
    // a fifth of the screen, or a quick flick, moves one game (as a finger's swipe does)
    const step = e.type === 'pointercancel' ? 0 : dy < -h * .2 || g.vy < -.5 ? 1 : dy > h * .2 || g.vy > .5 ? -1 : 0;
    const to = cards[Math.max(0, Math.min(cards.length - 1, from + step))];
    feed.scrollTo({ top: to.offsetTop, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setTimeout(() => { feed.style.scrollSnapType = ''; }, 450);
  };
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
  // (the click a drag ends with isn't a tap on the card)
  addEventListener('click', e => { if (eat) { eat = false; e.preventDefault(); e.stopPropagation(); } }, true);
}

/* ---------- Settings › Check this handheld ---------- */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ok = (good, text, help = '') => ({ mark: good === true ? '✓' : good === false ? '✗' : '•', text, help });
const TOUCH_MODES = ['hover (a finger moves the pointer)', 'left click (a finger is a mouse)', 'right click', 'middle click', 'passthrough (real touches)', 'off', 'trackpad'];
// the screen's rate as the page's frames come now, over half a second
// (at most a second: a game drawing slowly gives fewer frames)
const measureHz = () => new Promise(res => {
  const t = [], t0 = performance.now();
  const done = () => { if (t.length < 3) return res(0); const g = t.slice(1).map((v, i) => v - t[i]).sort((a, b) => a - b); res(1000 / g[g.length >> 1]); };
  const f = n => { t.push(n); if (t.length < 32 && performance.now() - t0 < 1000) requestAnimationFrame(f); else done(); };
  requestAnimationFrame(f);
});

/** The lines (pure but for what it reads): c is desktop.check()'s answer. */
export async function checkLines(c) {
  const L = [], gsc = c?.gamescope || null;
  // touch
  const mode = gsc?.touch?.mode, steam = gsc?.touch?.steam;
  if (seen.touch) L.push(ok(true, `Touch: real touches reach the app (${seen.touch} so far)`));
  else if (seen.mouse && desktop?.device?.gamescope) L.push(ok(false, 'Touch: touches reach the app as a mouse', 'The app asks Steam for real touches; if this stays, in Steam open this game\'s controller layout › Action Sets › the gear by the set › Add Always-On command › System › Touchscreen Native Support. Swipes on the feed still change game meanwhile.'));
  else L.push(ok(null, 'Touch: not tried yet', 'Touch the screen, then open this again.'));
  if (gsc) L.push(ok(mode === 4 ? true : mode == null ? null : false, `Steam's touch mode: ${mode == null ? 'not known' : TOUCH_MODES[mode] || mode}${steam != null && steam !== 4 ? ` (Steam had ${TOUCH_MODES[steam] || steam})` : ''}${gsc.touch.on ? '' : ' (left as Steam set it: --gs-touch-mouse)'}${gsc.touch.error ? ` (${gsc.touch.error})` : ''}`));
  // the screen
  if (c) {
    const r = gsc?.root, w = gsc?.window, ch = gsc?.chromium, d = c.display;
    const fits = r && w && ch ? Math.abs(w.width - r.width) <= 2 && Math.abs(w.height - r.height) <= 2 && Math.abs(ch.height - r.height) <= 2 && Math.abs(w.y) <= 2 : null;
    L.push(ok(fits, `Screen: ${r ? `${r.width}×${r.height}` : `${d.width}×${d.height}`}${w ? `, window ${w.width}×${w.height} at ${w.x},${w.y}` : ''}${ch ? `, drawn ${ch.width}×${ch.height}` : ''}`,
      fits === false ? 'The window and the screen differ: the app has tried to put it right' + (gsc.fixes ? ` ${gsc.fixes} time${gsc.fixes > 1 ? 's' : ''}` : '') + '. In Steam\'s game settings, Scaling "Auto" or "Fit" shows all of it.' : ''));
    L.push(ok(null, `Page: ${innerWidth}×${innerHeight} at ${(+c.zoom || 1).toFixed(2)}× (GS_ZOOM=1.5 %command% as a Steam launch option changes it), full screen ${c.fullScreen ? 'yes' : 'no'}`));
  }
  // graphics
  const f = gpuFacts(), webgpu = await hasWebGPU(), st = c?.gpu || {};
  if (desktop?.device?.webgl) L.push(ok(null, 'Graphics: WebGL only (the --gs-webgl launch option is on)'));
  else L.push(ok(webgpu, `Graphics: ${webgpu ? 'WebGPU' : 'no WebGPU, games draw with WebGL'}${f ? ` on ${f.vendor} ${f.arch}`.trimEnd() : ''}${c?.chip?.name ? ` (${c.chip.name}${c.chip.driver ? `, ${c.chip.driver}` : ''})` : ` (${gpuName()})`}`));
  if (st.webgpu || st.vulkan) L.push(ok(/enabled|accelerated/.test(st.webgpu || '') && !/software|readback/.test(st.webgpu || ''), `Chromium says: WebGPU ${st.webgpu || '?'}, Vulkan ${st.vulkan || '?'}${st.webgpu_on_vk_via_gl_interop ? `, Vulkan picture sharing ${st.webgpu_on_vk_via_gl_interop}` : ''}`,
    /readback|software/.test(st.webgpu || '') || /off|unavailable/.test(st.webgpu_on_vk_via_gl_interop || '') ? 'Each WebGPU picture is copied the slow way: frame rates stay low however idle the chip looks.' : ''));
  // speed
  const hz = await measureHz(), want = autoFps({ era: 'nextgen' });
  L.push(ok(bigHandheld() || computer() ? true : null, `Played as: ${bigHandheld() ? `a computer, 3D games at ${Math.round(want)} with nothing made between, up to ultra` : computer() ? 'a computer' : 'a phone: 3D at 60, 30 + GSFG where it can\'t hold 60, up to high'}${handheld ? ` (${handheld.name}, ${handheld.klass} class)` : ''}`));
  if (hz < 5) L.push(ok(null, `Screen rate: not measured now (the engine counts ${Math.round(screenHz())})`));
  else L.push(ok(hz > 55, `Screen rate: ${Math.round(hz)} frames a second reach the page (the engine counts ${Math.round(screenHz())})`, hz <= 55 ? 'Under 60: Steam\'s Performance menu (the … button) may have a frame rate limit or a 40 Hz refresh set.' : ''));
  if (gsc) {
    const lim = gsc.fpsLimit;
    L.push(ok(lim == null ? null : !lim || lim >= 60, `Steam's frame rate limit: ${lim == null ? 'not known' : lim ? `${lim}` : 'off'}${gsc.refresh ? `, screen at ${gsc.refresh} Hz` : ''}`, lim && lim < 60 ? 'Turn it off in Steam\'s Performance menu (the … button) for 60.' : ''));
  }
  if (fpsPick() !== 'auto' || frameGenPick() !== 'auto') L.push(ok(null, `Settings: frame rate ${fpsPick()}, frame generation ${frameGenPick()} (Auto for both plays as above)`));
  // what was played
  let HD = null; try { HD = (await import('./kit/hd3d.js')).HD; } catch (_) { /* no 3D yet */ }
  for (const [id, b] of played) {
    const l = perf.local(id); if (!l) continue;
    const fr = l.f - b.f, ms = l.ms - b.ms; if (fr < 60) continue;
    const fps = fr / ms * 1000, slow = (l.sl - b.sl) / fr, three = ['nextgen', 'ar', 'board'].includes(b.era);
    const now = three && speed.game?.id === id && HD ? `, ${HD.info.backend === 'webgpu' ? 'WebGPU' : 'WebGL'} ${HD.name}, ${HD.info.ow}×${HD.info.oh} shown` : '';
    L.push(ok(fps >= (three ? want : 60) * .9, `${b.title}: ${Math.round(fps)} frames a second this run, ${Math.round(slow * 100)}% slow${now}`));
  }
  // heat and battery
  if (power.headroom != null || power.onBattery) L.push(ok(power.heat < 2, `Heat: ${power.heat === 0 ? 'cool' : power.heat === 1 ? 'warm' : 'hot (games draw a tier lower)'}${power.headroom != null ? `, ${Math.round(power.headroom * 100)}% of the way to where the chip slows itself` : ''}${power.onBattery ? ', on battery' : ''}`, power.onBattery ? 'On battery the Ally may be held to a low wattage in Steam\'s Performance menu: 25 W or more lets the graphics run fast.' : ''));
  return L;
}

/** Settings › Check this handheld: a dialog of plain lines, ✓ good, ✗ to look at, • for reading. */
export async function handheldCheck() {
  const dlg = document.createElement('dialog'); dlg.className = 'info hh-check';
  dlg.innerHTML = `<div class="info-card"><button class="info-x" aria-label="Close">✕</button><span class="tag">${esc(handheld?.name || 'This computer')}</span><h2>Check</h2><p class="hh-wait">Looking…</p></div>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  dlg.querySelector('.info-x').onclick = () => dlg.close();
  dlg.showModal();
  const c = await desktop?.check?.().catch(() => null) ?? null;
  const lines = await checkLines(c).catch(e => [ok(false, `The check failed: ${e?.message || e}`)]);
  const card = dlg.querySelector('.info-card');
  card.querySelector('.hh-wait').remove();
  card.insertAdjacentHTML('beforeend', `<ul class="hh-lines">${lines.map(l => `<li><b class="hh-${l.mark === '✓' ? 'ok' : l.mark === '✗' ? 'bad' : 'note'}">${l.mark}</b><span>${esc(l.text)}${l.help ? `<small>${esc(l.help)}</small>` : ''}</span></li>`).join('')}</ul>
    <p class="hh-foot">Play a game for a minute first for its frame rate. Steam + R1 takes a screenshot of this to send.${desktop?.version ? ` Version ${esc(desktop.version)}.` : ''}</p>`);
}
