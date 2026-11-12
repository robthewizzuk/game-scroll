// The feed's top bar (logo + buttons) sits right at the top of the screen. The phone's status bar is
// hidden all the time in the apps (src/fullscreen.js), so the only thing left up there is the camera:
// a punch hole, a notch or the Dynamic Island. The safe-area inset reserves a whole strip the width
// of the screen for it, which left an empty band above the bar. Instead the bar goes up into that strip
// and only steps around the camera itself:
//   1. bar at the very top, if no button is under the camera
//   2. else the buttons slide left of the camera, or split so the camera sits between two groups
//   3. else the same again with the feed picker's name cut shorter ("Next Gen · Con…"), so picking a
//      feed with a long name doesn't make the bar jump down
//   4. else the bar just below the camera (not below the whole safe-area strip)
// The game card starts just under the bar (--bar-b), so the room saved goes to the game.
//
// Where the camera is: Android tells us exactly (MainActivity sends DisplayCutout's rectangles as
// window.__gsCutouts and a 'gs-cutouts' event). iPhones don't, so their notch / Dynamic Island is
// assumed centred, sized from the top inset. Anything else with a top inset: the whole strip.
import { Capacitor } from '@capacitor/core';

const TOP = 6;        // gap above the bar when nothing is in the way
const CLEAR = 6;      // space kept around the camera
const MINLABEL = 44;  // the feed picker's name is never cut shorter than this: the shortest name's width, so every name can end up the same size and the bar in the same place
const BELOW = 4;      // gap under the camera when the bar has to go below it

let changed = () => {};
export function onBarMove(fn) { changed = fn; }

function insetTop() {
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top,0px)';
  document.body.appendChild(p);
  const v = parseFloat(getComputedStyle(p).paddingTop) || 0;
  p.remove();
  // Capacitor's own copy of the inset (Android web views older than 140 report env() as 0)
  const cap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top')) || 0;
  return Math.max(v, cap);
}

// Camera rectangles in CSS pixels, relative to the page: [{ l, t, r, b }]
export function cutouts() {
  const W = innerWidth;
  if (Array.isArray(window.__gsCutouts)) return window.__gsCutouts.filter(c => c.b > 0 && c.r > c.l);
  const T = insetTop();
  if (T <= 0) return [];
  if (Capacitor.getPlatform() === 'ios' && innerHeight > W) {
    // Dynamic Island (inset 51+): about 126 x 37 points, 11 from the top. Notch (inset 44-50): up to
    // about 210 points wide, from the top edge. A little extra either way to be safe.
    return T >= 51 ? [{ l: W / 2 - 68, t: 9, r: W / 2 + 68, b: 50 }] : [{ l: W / 2 - 112, t: 0, r: W / 2 + 112, b: T - 8 }];
  }
  return [{ l: 0, t: 0, r: W, b: T }];
}

const hits = (a, c) => a.left < c.r + CLEAR && a.right > c.l - CLEAR && a.top < c.b + CLEAR && a.bottom > c.t - CLEAR;

// squeezed so far that the logo runs into the feed picker
const overlaps = items => items.some((e, i) => i && e.getBoundingClientRect().left < items[i - 1].getBoundingClientRect().right + 4);

let last = '';
export function placeBar() {
  const bar = document.querySelector('.top');
  if (!bar || document.body.classList.contains('fullscreen')) return;
  const root = document.documentElement.style;
  const items = [...bar.children].filter(e => e.offsetWidth > 0);
  // start from the plain layout: at the top, logo on the left, everything from the feed picker on the right
  root.setProperty('--bar-t', TOP + 'px');
  items.forEach(e => { e.style.marginLeft = ''; });
  bar.style.paddingRight = '';
  const label = document.getElementById('feed-label');
  if (label) label.style.maxWidth = '';
  const full = label ? label.getBoundingClientRect().width : 0;
  const cuts = cutouts();
  let top = TOP;
  const clashes = () => { const r = items.map(e => e.getBoundingClientRect()); return cuts.some(c => r.some(a => hits(a, c))); };
  if (cuts.length && items.length && clashes()) {
    let ok = false;
    const W = bar.getBoundingClientRect().right;
    const fits = () => !clashes() && items.every(e => e.getBoundingClientRect().left >= 0) && !overlaps(items);
    // the feed picker's name at full length first, then cut shorter and shorter
    const widths = [0, ...new Set([.8, .65, .5, .4, 0].map(f => Math.max(MINLABEL, Math.round(full * f))).filter(w => w < full))];
    for (const w of widths) {
      if (ok) break;
      if (label) label.style.maxWidth = w ? w + 'px' : '';
      // keep the buttons together and slide them left of a camera that's over them
      for (const c of [...cuts].sort((a, b) => b.l - a.l)) {
        if (ok || c.l <= 0) continue;
        bar.style.paddingRight = Math.ceil(W - c.l + CLEAR) + 'px';
        ok = fits();
        if (!ok) bar.style.paddingRight = '';
      }
      // or split them, so the camera sits in the gap between two groups
      for (let k = 1; k < items.length && !ok; k++) {
        items.forEach((e, i) => { e.style.marginLeft = i === k ? 'auto' : '0px'; });
        ok = fits();
      }
      if (!ok) items.forEach(e => { e.style.marginLeft = ''; });
    }
    if (!ok) {
      if (label) label.style.maxWidth = '';
      const h = Math.max(...items.map(e => e.getBoundingClientRect().bottom)) - bar.getBoundingClientRect().top - TOP;
      // only the camera shapes that reach down into the bar push it down
      top = Math.max(TOP, ...cuts.filter(c => c.t < TOP + h).map(c => Math.ceil(c.b) + BELOW));
      root.setProperty('--bar-t', top + 'px');
    }
  }
  const bottom = Math.ceil(Math.max(...items.map(e => e.getBoundingClientRect().bottom), top + 34));
  root.setProperty('--bar-b', bottom + 'px');
  const key = top + ',' + bottom + ',' + bar.style.paddingRight + ',' + (label ? label.style.maxWidth : '') + ',' + items.map(e => e.style.marginLeft).join();
  if (key !== last) { last = key; changed(); }
}

let t = 0;
const soon = () => { cancelAnimationFrame(t); t = requestAnimationFrame(placeBar); };
export function initBar() {
  document.documentElement.classList.add('bar-js');
  placeBar();
  addEventListener('resize', soon);
  addEventListener('gs-cutouts', soon);
  screen.orientation?.addEventListener?.('change', () => setTimeout(soon, 150));
  document.fonts?.ready?.then(soon);
  // the feed picker's label changes width ("For you" / "Next Gen · Console"); the logo hides on tiny screens
  const bar = document.querySelector('.top');
  if (bar && window.ResizeObserver) { const ro = new ResizeObserver(soon); [...bar.children].forEach(e => ro.observe(e)); }
}
