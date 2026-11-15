// The app with a controller alone (a ROG Ally or Steam Deck in SteamOS's Game Mode, a pad on a TV or a phone): the
// menus, the feed's own buttons, and a pointer for games played by touch. src/kit/gamepad.js already turns a pad into
// keys for games that read keys (the d-pad and left stick are the arrows, A is Space...) and moves the feed (↑ ↓, A
// plays, Menu pauses); this is the rest. src/main.js calls begin() and then frame() every refresh, around pollPads.
//
//   In the feed        ↑ ↓ (d-pad or left stick) the previous or next game, A play, Y ♥, X how to play,
//                      LB / RB the previous or next feed, View the top bar and the card's buttons
//   In a menu          ↑ ↓ ← → move between its buttons, A press, B (or Menu) back, right stick scroll,
//                      ← → on a slider change it
//   Playing            Menu pause, and the game's own keys. A game played by touch (one with no key()) gets a
//                      pointer: the left stick or d-pad moves it and A is the finger; L3 or R3 turns it on or off in
//                      any game. Paused: ↑ ↓ leave for the previous or next game.
// Nothing here runs until a controller has been used (gamepad.js asks for pads only now and then before that).
import { pads } from './kit/gamepad.js';

const PAD_ID = 31337;   // the pointer's id for down(x, y, id) (a finger's are small numbers, the mouse's 1)
const FIRST = 380, AGAIN = 110;   // ms before a held direction repeats in a menu, and between repeats
const FOCUSABLE = 'button,a[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';

/**
 * The next element from `from` in direction dir ('up' | 'down' | 'left' | 'right') among rects (pure: tests):
 * the nearest whose middle is that way, the distance across counted 2.5 times (none across where they overlap).
 * from, rects: { x, y, w, h } (rects[i] for each candidate). Returns an index, or -1.
 */
export function nearestIn(dir, from, rects) {
  const fx = from.x + from.w / 2, fy = from.y + from.h / 2, horiz = dir === 'left' || dir === 'right', sign = dir === 'left' || dir === 'up' ? -1 : 1;
  let best = -1, bd = Infinity;
  rects.forEach((r, i) => {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, along = (horiz ? cx - fx : cy - fy) * sign;
    if (along <= 4) return;
    const overlap = horiz ? Math.min(r.y + r.h, from.y + from.h) - Math.max(r.y, from.y) : Math.min(r.x + r.w, from.x + from.w) - Math.max(r.x, from.x);
    const across = overlap > 0 ? 0 : Math.abs(horiz ? cy - fy : cx - fx);
    const d = along + across * 2.5;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

/** How fast a stick moves the pointer (pure: tests): a gentle start for aiming, full speed at the edge. v -1..1 -> -1..1. */
export const stickCurve = v => Math.sign(v) * Math.abs(v) ** 1.7;

const visible = e => !e.disabled && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden],[inert]');
const rectOf = e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

/**
 * app: { active() (the card on screen), toast(el, text), feedOpts() (the feed picker's options), feedMenu (its list),
 * bar (the top bar), input() (a controller moved the game: the feed's last-input time) }
 */
export function padNav(app) {
  let ctx = 'none', scope = null, ui = false, uiCard = null, last = 0;
  const rep = { dir: null, at: 0 };
  const cursor = { s: null, x: 0, y: 0, el: null, down: false, shown: false, on: new Map() };

  // where the buttons go this refresh: a menu ('menu'), the pointer in a round ('pointer'), the feed ('feed'), a paused
  // round ('paused'), a round played with keys ('keys'), or nothing ('none': no card)
  function context() {
    const dlg = [...document.querySelectorAll('dialog[open]')].pop();
    if (dlg) { scope = dlg; return 'menu'; }
    if (app.feedMenu && !app.feedMenu.hidden) { scope = app.feedMenu; return 'menu'; }
    const s = app.active();
    if (ui && s && s === uiCard && s.state !== 'playing') { scope = null; return 'ui'; }
    ui = false;
    if (!s) return 'none';
    if (s.state === 'playing') return s.paused ? 'paused' : pointerOn(s) ? 'pointer' : 'keys';
    return 'feed';
  }
  const pointerOn = s => { const v = cursor.on.get(s.def.id); return v != null ? v : !s.game?.key; };

  /** Before pollPads: what the buttons are for this refresh. */
  function begin() { ctx = context(); }
  /** pollPads asks: does the app use this button now (so it isn't also sent to the game as a key)? */
  function take(n) {
    if (ctx === 'menu' || ctx === 'ui') return true;
    if (ctx === 'pointer') return n === 'a' || n === 'up' || n === 'down' || n === 'left' || n === 'right';
    if (ctx === 'feed') return n === 'y' || n === 'x' || n === 'l' || n === 'r' || n === 'select';
    return false;
  }

  /** After pollPads: what the app does with the controller this refresh. */
  function frame(now) {
    const list = pads();
    if (!list.length) { hideCursor(); return; }
    const dt = Math.min(.05, Math.max(0, (now - (last || now)) / 1000)); last = now;
    const any = n => list.some(p => p.pressed(n)), held = n => list.some(p => p.held(n));
    let x = 0, y = 0, rx = 0, ry = 0;
    for (const p of list) { x += p.x; y += p.y; rx += p.rx; ry += p.ry; }
    x = Math.max(-1, Math.min(1, x)); y = Math.max(-1, Math.min(1, y));
    const used = list.some(p => p.x || p.y || p.rx || p.ry) || ['a', 'b', 'x', 'y', 'l', 'r', 'start', 'select', 'up', 'down', 'left', 'right', 'ls', 'rs'].some(any);
    if (used) padUsed();
    const s = app.active();
    // L3 / R3: the pointer on or off for this game (while it's played)
    if (s && s.state === 'playing' && !s.paused && ctx !== 'menu' && (any('ls') || any('rs'))) {
      const on = !pointerOn(s); cursor.on.set(s.def.id, on);
      app.toast(s.el, on ? 'Pointer on: move with the left stick, A taps' : 'Pointer off: the controller\'s buttons go to the game');
      if (!on) releaseCursor(); else placeCursor(s, true);
      ctx = context();
    }
    if (ctx === 'menu' || ctx === 'ui') { menu(now, list, any, held, ry, dt); hideCursor(); return; }
    if (ctx === 'pointer') { pointer(s, x, y, held, dt); return; }
    hideCursor();
    if (ctx === 'feed') feed(s, any);
  }

  /* ---------- menus, the top bar and the card's buttons ---------- */
  function candidates() {
    if (ctx === 'ui') {
      const s = app.active(), out = [];
      for (const root of [app.bar, s?.el]) if (root) for (const e of root.querySelectorAll(FOCUSABLE)) if (visible(e) && !e.closest('#feed-menu')) out.push(e);
      return out;
    }
    return scope ? [...scope.querySelectorAll(FOCUSABLE)].filter(visible) : [];
  }
  function inScope(e) { return !!e && (ctx === 'ui' ? candidates().includes(e) : !!scope && scope.contains(e) && e !== scope); }
  function focus(e) { if (!e) return; try { e.focus({ preventScroll: true }); } catch (_) { /* gone */ } e.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }
  function move(dir) {
    const cur = document.activeElement, all = candidates();
    if (!inScope(cur)) { focus(all[0]); return; }
    const others = all.filter(e => e !== cur), i = nearestIn(dir, rectOf(cur), others.map(rectOf));
    if (i >= 0) { focus(others[i]); return; }
    // nothing further that way: scroll what holds it, so the rest comes into view
    const box = scrollerOf(cur);
    if (box && (dir === 'up' || dir === 'down')) box.scrollBy({ top: (dir === 'up' ? -1 : 1) * box.clientHeight * .4 });
  }
  function scrollerOf(e) {
    for (let n = e; n && n !== document.body; n = n.parentElement) { const st = getComputedStyle(n); if (/(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 2) return n; }
    return scope && scope.scrollHeight > scope.clientHeight + 2 ? scope : null;
  }
  function slide(e, dir) {
    if (dir === 'left') e.stepDown(); else e.stepUp();
    e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function back() {
    if (ctx === 'ui') { ui = false; document.activeElement?.blur?.(); return; }
    if (scope === app.feedMenu) { (document.activeElement && scope.contains(document.activeElement) ? document.activeElement : scope).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return; }
    const x = [...scope.querySelectorAll('[aria-label="Close"],.qa-x,.info-x')].find(visible);
    if (x) x.click(); else scope.close?.();
  }
  function menu(now, list, any, held, ry, dt) {
    const cur = document.activeElement;
    if (!inScope(cur) && ctx === 'menu') { const first = candidates()[0]; if (first) focus(first); }
    let dir = null;
    for (const d of ['up', 'down', 'left', 'right']) if (held(d)) { dir = d; break; }
    if (dir && (dir !== rep.dir || now >= rep.at)) {
      const first = dir !== rep.dir; rep.dir = dir; rep.at = now + (first ? FIRST : AGAIN);
      const e = document.activeElement;
      if (inScope(e) && e.type === 'range' && (dir === 'left' || dir === 'right')) slide(e, dir); else move(dir);
    } else if (!dir) rep.dir = null;
    if (any('a')) {
      const e = document.activeElement;
      if (inScope(e)) { if (e.type === 'range') { /* ← → change it */ } else e.click(); }
      else focus(candidates()[0]);
    }
    if (any('b') || any('start') || ctx === 'ui' && any('select')) back();
    // the right stick scrolls
    if (Math.abs(ry) > .1) { const box = scrollerOf(document.activeElement && inScope(document.activeElement) ? document.activeElement : scope || document.body); box?.scrollBy({ top: stickCurve(Math.max(-1, Math.min(1, ry))) * 1100 * dt }); }
  }

  /* ---------- the feed ---------- */
  function feed(s, any) {
    if (any('y')) s.el.querySelector('.like')?.click();
    if (any('x')) s.el.querySelector('.caption')?.click();
    if (any('l') || any('r')) {
      const o = app.feedOpts(), i = o.findIndex(e => e.getAttribute('aria-selected') === 'true');
      if (o.length) { const n = o[(Math.max(0, i) + (any('r') ? 1 : o.length - 1)) % o.length]; n.click(); app.toast(app.active()?.el || s.el, n.querySelector('b')?.textContent || 'Feed'); }
    }
    if (any('select')) { ui = true; uiCard = s; ctx = 'ui'; focus(candidates()[0]); }
  }

  /* ---------- a pointer for games played by touch ---------- */
  function placeCursor(s, centre) {
    if (cursor.s !== s) { releaseCursor(); cursor.s = s; centre = true; }
    if (centre) { cursor.x = s.w / 2; cursor.y = s.h / 2; }
    if (!cursor.el || cursor.el.parentElement !== s.screen) { cursor.el?.remove(); cursor.el = document.createElement('div'); cursor.el.className = 'pad-cursor'; cursor.el.setAttribute('aria-hidden', 'true'); s.screen.appendChild(cursor.el); }
  }
  function drawCursor(s) {
    const c = s.canvas.getBoundingClientRect(), b = s.screen.getBoundingClientRect();
    const px = c.left - b.left + cursor.x / s.w * c.width, py = c.top - b.top + cursor.y / s.h * c.height;
    cursor.el.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px)`;
    cursor.el.classList.toggle('down', cursor.down);
    if (!cursor.shown) { cursor.el.hidden = false; cursor.shown = true; }
  }
  function hideCursor() { if (cursor.el && cursor.shown) { cursor.el.hidden = true; cursor.shown = false; } if (cursor.down) releaseCursor(); }
  const call = (s, fn) => { try { fn(); } catch (e) { console.error(s.def.id, e); } };
  function releaseCursor() {
    const s = cursor.s;
    if (cursor.down && s && s.state === 'playing' && s.game?.up) call(s, () => s.game.up(cursor.x, cursor.y, PAD_ID));
    cursor.down = false;
  }
  function pointer(s, x, y, held, dt) {
    if (cursor.s !== s || s.startPerf !== cursor.round) { placeCursor(s, true); cursor.round = s.startPerf; }   // (a new round: from the middle)
    placeCursor(s, false);
    let dx = stickCurve(x), dy = stickCurve(y);
    if (held('left')) dx = -.55; else if (held('right')) dx = .55;
    if (held('up')) dy = -.55; else if (held('down')) dy = .55;
    const moved = dx || dy;
    if (moved) {
      const sp = Math.max(s.w, s.h) * dt;   // (full tilt: the long side in a second)
      cursor.x = Math.max(0, Math.min(s.w, cursor.x + dx * sp)); cursor.y = Math.max(0, Math.min(s.h, cursor.y + dy * sp));
    }
    const a = held('a');
    if (a && !cursor.down) { cursor.down = true; app.input(); call(s, () => s.game.down?.(cursor.x, cursor.y, PAD_ID)); }
    else if (!a && cursor.down) { releaseCursor(); app.input(); }
    else if (moved && s.game.move) { if (cursor.down) app.input(); call(s, () => s.game.move(cursor.x, cursor.y, cursor.down, PAD_ID)); }
    if (s.state === 'playing') drawCursor(s); else hideCursor();
  }

  // The focus ring shows while the controller is what's being used; a touch, the mouse or a key hides it (and the pointer).
  function padUsed() { if (!document.documentElement.classList.contains('pad-ui')) document.documentElement.classList.add('pad-ui'); }
  const notPad = () => { document.documentElement.classList.remove('pad-ui'); hideCursor(); };
  addEventListener('pointerdown', e => { if (e.pointerId !== PAD_ID) notPad(); }, true);
  addEventListener('keydown', e => { if (e.isTrusted) document.documentElement.classList.remove('pad-ui'); }, true);
  addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) document.documentElement.classList.remove('pad-ui'); }, { capture: true, passive: true });

  return { begin, take, frame, get context() { return ctx; }, cursor };
}
