// Updates from Google Play, on Android phones that got Game Scroll from Play (the internal testing
// track counts). Google's in-app updates, through plugins/play-update:
// - Usually Play asks once whether to get the new version and downloads it in the background while
//   the player carries on. Then a small card here offers to restart into it.
// - A version that can't wait gets Play's full-screen update straight away, with a card behind it that
//   stays until the app is updated. That is a release uploaded with priority 4 or 5
//   (scripts/play-upload.mjs), or this copy being older than the catalogue's minimum version
//   (store/app-update.json, published with the games).
// Prompts never cover a round being played: they wait for it to end. Play's own sheets open over the
// app, and the system bars hide again when it gets focus back (src/fullscreen.js).
// Nothing happens at all on the iPhone, the Mac and Windows app, the web, or an APK from anywhere but
// Play: Play can only update the copies it installed.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { store } from './util.js';

const URGENT = 4;                     // Play priority (0..5) from which an update can't wait
const ASK_AGAIN = 24 * 3600e3;        // after "No thanks" on Play's sheet, ask again a day later
const LATER = 30 * 60e3;              // after "Later" on the restart card, show it again half an hour on
const LOOK_EVERY = 2 * 60e3;          // coming back to the app looks again at most this often
const FIRST_LOOK = 4000;              // after start-up, so the first games load first
const NO = 'gs_update_no';            // when the player last said no to Play's sheet

// Tests drive a stand-in for the plugin (scripts/app-test.cjs); never the store apps.
const fake = (import.meta.env.MODE !== 'production' || navigator.webdriver) && globalThis.__gsPlayFake;
const plugin = fake || (Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('PlayUpdate') ? registerPlugin('PlayUpdate') : null);

let busy = () => false, min = () => 0;
let latest = null;        // Play's last answer (and this copy's version), for Settings
let looking = false, waiting = false, last = 0;
let dl = null;            // { bytes, total } while a background download runs
let ready = false, laterAt = -Infinity;
let card = null, wall = null, cardT = 0;
const watchers = new Set();
const tell = () => watchers.forEach(f => { try { f(); } catch (_) {} });

/** A plugin call that gives null rather than failing or hanging (ms 0: no time limit, Play's screens wait for the player). */
function ask(p, ms = 8000) {
  const answer = Promise.resolve(p).catch(() => null);
  return ms ? Promise.race([answer, new Promise(r => setTimeout(() => r(null), ms))]) : answer;
}

const urgent = r => r.immediate && (r.priority >= URGENT || (min() > 0 && r.versionCode < min()));

/** Look for an update once no round is being played, and offer it. force: ask even if the player said no today. */
function look(force = false) {
  if (!plugin || waiting) return;
  waiting = true;
  const go = () => {
    if (busy() || document.hidden) { setTimeout(go, 3000); return; }
    waiting = false; act(force);
  };
  go();
}

async function act(force) {
  if (looking) return;
  looking = true; last = Date.now(); tell();
  try {
    // A fresh answer every time: each answer from Play can start one update at most.
    const r = latest = await ask(plugin.check());
    if (!r || !r.play) return;
    if (r.status === 'downloaded') { downloaded(); return; }
    if (r.available === 'resume' || (r.available === 'yes' && urgent(r))) { await mustUpdate(); return; }
    if (r.available !== 'yes') { unwall(); return; }   // nothing (or nothing any more) to update to
    if (r.status === 'pending' || r.status === 'downloading') { dl = { bytes: r.bytes, total: r.total }; return; }
    if (!r.flexible || (!force && Date.now() - store.get(NO, 0) < ASK_AGAIN)) return;
    looking = false; tell();
    const s = await ask(plugin.start({ type: 'flexible' }), 0);   // Play's sheet: "Update available"
    if (s?.result === 'declined') store.set(NO, Date.now());
    if (s?.result === 'accepted') dl = { bytes: 0, total: 0 };      // downloading in the background now
  } finally { looking = false; tell(); }
}

// Play's full-screen update. When it's done the app restarts into the new version; coming back here
// means the player backed out of it (or it failed), so the card behind it stays up.
async function mustUpdate() {
  looking = false; tell();
  const s = await ask(plugin.start({ type: 'immediate' }), 0);
  if (s?.result !== 'accepted') showWall(s?.result === 'failed');
}

/** Ask Play where things stand without offering anything (Settings opening; coming back to the must-update card). */
async function quiet() {
  if (!plugin || looking) return latest;
  const r = await ask(plugin.check());
  if (r) {
    latest = r;
    if (r.status === 'downloaded') downloaded();
    else if (wall && r.play && r.available === 'none') unwall();
  }
  tell(); return r;
}

function downloaded() {
  dl = null; ready = true; tell();
  if (Date.now() - laterAt > LATER) showCard();
}

function onState(s) {
  if (!s) return;
  if (s.status === 'downloaded') downloaded();
  else if (s.status === 'pending' || s.status === 'downloading') dl = { bytes: s.bytes || 0, total: s.total || 0 };
  else dl = null;   // installed, failed or cancelled
  tell();
}

async function restart() {
  if (card) card.querySelector('.upd-go').disabled = true;
  // Play shows its install screen for a moment and opens the app again in the new version.
  const ok = await ask(plugin.complete(), 0);
  if (ok === null && card) card.querySelector('.upd-go').disabled = false;
}

/* ---------- the restart card: bottom of the screen, never over a round ---------- */
const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function showCard() {
  if (!card) {
    card = document.createElement('div');
    card.className = 'upd'; card.setAttribute('role', 'status');
    card.innerHTML = `<span class="upd-i">${ARROW}</span><div class="upd-t"><b>New version ready</b><span>Restart Game Scroll to update.</span></div>
      <button type="button" class="upd-later">Later</button><button type="button" class="upd-go">Restart</button>`;
    card.addEventListener('pointerdown', e => e.stopPropagation());
    card.querySelector('.upd-later').onclick = e => { e.stopPropagation(); laterAt = Date.now(); hideCard(); };
    card.querySelector('.upd-go').onclick = e => { e.stopPropagation(); restart(); };
    document.body.appendChild(card);
  }
  // out of the way while a round is played, back when it ends
  const place = () => card && card.classList.toggle('on', !busy());
  clearInterval(cardT); cardT = setInterval(place, 1000);
  requestAnimationFrame(place);
}
function hideCard() {
  clearInterval(cardT);
  if (!card) return;
  const c = card; card = null;
  c.classList.remove('on'); setTimeout(() => c.remove(), 300);
}

/* ---------- the must-update card behind Play's full-screen update ---------- */
function showWall(failed) {
  if (!wall) {
    wall = document.createElement('dialog');
    wall.className = 'info upd-wall';
    wall.addEventListener('cancel', e => e.preventDefault());   // no way past it but updating
    document.body.appendChild(wall);
  }
  wall.innerHTML = `<div class="info-card"><span class="tag">Update</span><h2>Time to update</h2>
    <p>${failed ? 'The update didn’t finish. Check your connection, then try again.' : 'This version of Game Scroll is too old to carry on. The new one is waiting on Google Play, and it only takes a moment.'}</p>
    <button type="button" class="play info-play">${failed ? 'Try again' : 'Update'}</button></div>`;
  wall.querySelector('.info-play').onclick = () => act(true);
  if (!wall.open) wall.showModal();
}
function unwall() {
  if (!wall) return;
  const w = wall; wall = null; w.close(); w.remove();
}

export const update = {
  /** On Android, where the plugin is: Settings shows the version and, for Play copies, the check button. */
  get here() { return !!plugin; },

  /** busy(): a round is being played (prompts wait). min(): the catalogue's minimum Android version code. */
  init(o = {}) {
    if (!plugin) return;
    if (o.busy) busy = o.busy;
    if (o.min) min = o.min;
    try { plugin.addListener('state', onState); } catch (_) {}
    setTimeout(() => look(), FIRST_LOOK);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      // Back from Play's own screens, or from anywhere else. With the must-update card up, only look
      // quietly whether it's still needed: opening Play's screen again on every return would trap the player.
      if (wall) { if (Date.now() - last > 5000) quiet(); return; }
      if (Date.now() - last > LOOK_EVERY) look();
    });
  },

  /** Look now and offer what's there, once no round is being played (Settings' button; tests).
   *  force (default): ask even if the player said no to Play's sheet today. */
  check(force = true) { look(force); },
  /** Look now, offering nothing (Settings opening). */
  refresh: quiet,
  restart,

  /** For Settings: { play (null until asked), version, state: 'idle'|'checking'|'none'|'available'|'downloading'|'ready'|'error'|'away', pct } */
  status() {
    const r = latest, version = r?.versionName || '';
    if (!r) return { play: null, version, state: looking ? 'checking' : 'idle', pct: 0 };
    if (!r.play) return { play: false, version, state: 'away', pct: 0 };
    const state = looking ? 'checking' : ready ? 'ready' : dl ? 'downloading'
      : r.error ? 'error' : r.available === 'none' ? 'none' : 'available';
    return { play: true, version, state, pct: dl && dl.total ? Math.round(100 * dl.bytes / dl.total) : 0 };
  },
  /** Call f whenever the status changes; returns a function that stops it. */
  watch(f) { watchers.add(f); return () => watchers.delete(f); },
};
