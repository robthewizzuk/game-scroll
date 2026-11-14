// Settings sheet, opened from the ⚙ button in the top bar.
// How many streamed games are saved on this device (with a button to clear them), the licence, and credits.
import { fmt } from './util.js';
import { playstats } from './playstats.js';
import { HEARTS_URL } from './hearts.js';
import { nativeARSupported } from './kit/native-ar.js';
import { fpsPick, setFpsPick, autoFps, phoneClass, screenHz, frameGenPick, setFrameGenPick, frameGenHow, setFrameGenHow, frameGenStatus, speed } from './kit/speed.js';
import { geoSettings } from './geo.js';
import { hasWebGPU } from './kit/gpu.js';
import { OPEN_SOURCE, OTHER_PARTS } from './licences.js';
import { feedBrain, resetRecommendations } from './feedsignals.js';
import { desktop } from './desktop.js';
import { update } from './update.js';
// (what Settings calls the thing the app runs on)
const dev = desktop ? 'computer' : 'phone';

const size = b => b < 1024 * 1024 ? `${Math.ceil(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

// Android: which version this is and, for a copy from Google Play, a button to look for a new one (src/update.js).
function bindUpdates(el) {
  el.querySelector('.set-upd')?.addEventListener('click', () => { update.status().state === 'ready' ? update.restart() : update.check(); });
}
function updatesRow() {
  const u = update.status();
  const say = {
    idle: 'Updates come from Google Play.',
    checking: 'Looking on Google Play…',
    none: 'This is the newest version.',
    available: 'A new version is on Google Play.',
    downloading: `Downloading the new version${u.pct ? ` (${u.pct}%)` : ''}. Carry on playing meanwhile.`,
    ready: 'The new version is downloaded. Restart to update.',
    error: 'Couldn’t reach Google Play just now.',
    away: 'This copy didn’t come from Google Play, so its updates come from wherever it did.',
  }[u.state];
  const btn = u.play === false ? '' : `<div class="qa-actions"><button class="set-upd"${u.state === 'checking' || u.state === 'downloading' ? ' disabled' : ''}>${u.state === 'ready' ? 'Restart to update' : u.state === 'available' ? 'Update' : 'Check for updates'}</button></div>`;
  return `<section class="set-row set-updates">
        <h3>Updates</h3>
        ${u.version ? `<div class="set-stat">Version <b>${u.version}</b></div>` : ''}
        <p class="qa-help">${say}</p>${btn}
      </section>`;
}

/** opts: { stream, cached(): {games, bytes, max}, clear(): Promise, arTest(): opens the AR test scene }
 *  Sound & haptics live in their own sheet (the 🔊 button, src/feel.js), not here. */
export function openSettings({ stream, cached, clear, arTest }) {
  const el = document.createElement('dialog'); el.className = 'qa-panel settings';
  // Frame generation shows on devices that have WebGPU (3D games always use it there; asked once, so it can appear a moment later)
  let webgpuHere = null;
  hasWebGPU().then(v => { webgpuHere = v; if (el.open) render(); });
  document.body.appendChild(el);
  const render = note => {
    const c = cached();
    el.innerHTML = `<div class="qa-head"><b>SETTINGS</b><span></span><button class="qa-x" aria-label="Close">✕</button></div>
      <section class="set-row">
        <h3>Game cache</h3>
        ${stream
          ? `<p class="qa-help">Games stream in as you scroll. The last ${c.max} you played are saved on this device so they open instantly and work offline.</p>
             <div class="set-stat"><b>${fmt(c.games)}</b> of ${c.max} games saved · ${size(c.bytes)}</div>
             <div class="qa-actions"><button class="set-clear"${c.games ? '' : ' disabled'}>Clear cache</button></div>`
          : `<p class="qa-help">This is a test build with every game built in, so there's nothing to cache.</p>`}
        ${note ? `<p class="set-note" role="status">${note}</p>` : ''}
      </section>
      <section class="set-row">
        <h3>Frame rate</h3>
        <p class="qa-help">Auto picks by ${dev}: on this one ${Math.round(Math.min(autoFps({ era: 'nextgen' }), screenHz()))} fps for 3D games and ${Math.round(Math.min(autoFps({}), screenHz()))} fps for the rest (${{ top: 'a top-end', mid: 'a mid-range', low: 'an entry-level' }[phoneClass()]} ${dev} with a ${screenHz()} Hz screen), and 3D games step down if the ${dev} can't keep up. A lower rate saves battery and keeps the ${dev} cooler.</p>
        <div class="qa-actions set-fps">${['auto', 120, 60, 30].map(v => `<button data-fps="${v}"${fpsPick() === v ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"'}${v !== 'auto' && v > screenHz() ? ' disabled' : ''}>${v === 'auto' ? 'Auto' : v === 30 ? '30 · battery saver' : v}</button>`).join('')}</div>
      </section>
      ${webgpuHere ? `<section class="set-row">
        <h3>GSFG frame generation</h3>
        <p class="qa-help">When a 3D game draws fewer frames than a fast screen shows (90, 120 or 144 Hz), make the ones in between so it moves at the screen's rate. Auto does it for games that can't reach the screen's rate, and for any 3D game while the phone is warm, in battery saver or low on battery, or through a busy moment that would stutter. Always draws half the frames (or fewer) of every 3D game and makes the rest (cooler, more detail). Needs Frame rate on Auto.</p>
        <div class="qa-actions set-fps set-fg" role="group" aria-label="GSFG frame generation">${[['auto', 'Auto'], ['always', 'Always'], ['off', 'Off']].map(([v, n]) => `<button data-fg="${v}"${frameGenPick() === v ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"'}>${n}</button>`).join('')}</div>
        <p class="qa-help">Blend makes the frames between the last two (the fewest flaws; each real frame shows a moment later). Ahead guesses past the newest (no delay; edges a little softer when things move fast). Game's choice is blend unless a game asks for ahead, or the phone can't keep up with blend in that game.</p>
        <div class="qa-actions set-fps set-fg-how" role="group" aria-label="How frames are made">${[['game', 'Game’s choice'], ['blend', 'Blend'], ['ahead', 'Ahead']].map(([v, n]) => `<button data-how="${v}"${frameGenHow() === v ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"'}>${n}</button>`).join('')}</div>
        <p class="qa-help set-fg-now"><b>Now:</b> ${frameGenStatus(speed.game)}</p>
      </section>` : ''}
      ${arTest ? `<section class="set-row">
        <h3>AR test</h3>
        <p class="qa-help">A cube on your floor for checking how well AR games track the room: walk around it and it should stay put.${nativeARSupported() === false ? ' This phone or version plays AR games in look-around mode.' : ''}</p>
        <div class="qa-actions"><button class="set-ar">Open AR test</button></div>
      </section>` : ''}
      <section class="set-row">
        <h3>Location</h3>
        <p class="qa-help">A few games build their level from your area, and ask the first time you play one. They only get a rounded position (about 1 km, or about 10 m for walk-around games), only while you play, and it never leaves your phone. Turn this off and they use a made-up spot instead.</p>
        <label class="set-toggle"><input type="checkbox" class="set-loc"${geoSettings.enabled ? ' checked' : ''}> Let games use my location</label>
      </section>
      <section class="set-row">
        <h3>For you</h3>
        <p class="qa-help">Your feed learns which games you enjoy from what you play and what you scroll past, on this phone only: nothing about it is sent anywhere. It can bring games forward or hold them back, but never hides one.</p>
        <div class="set-stat">${feedBrain.n ? `Learned from <b>${fmt(feedBrain.n)}</b> games you played or skipped` : 'Nothing learned yet'}</div>
        <div class="qa-actions"><button class="set-forget"${feedBrain.n ? '' : ' disabled'}>Reset recommendations</button></div>
      </section>
      ${HEARTS_URL ? `<section class="set-row">
        <h3>Play stats and crash reports</h3>
        <p class="qa-help">Counts how often each game is played or skipped, and reports crashes, errors and stutters along with your phone model (like “SM-F966B”), added up across everyone. It helps pick which games to improve, fix and show more. Nothing identifies you.</p>
        <label class="set-toggle"><input type="checkbox" class="set-stats"${playstats.enabled ? ' checked' : ''}> Share anonymous play stats and crash reports</label>
      </section>` : ''}
      ${update.here ? updatesRow() : ''}
      <section class="set-row">
        <h3>Licence</h3>
        <p class="qa-help">Copyright © 2026 Rob and Game Scroll contributors. The code is under the PolyForm Shield License 1.0.0: you can use, change and share it for anything except making a product that competes with Game Scroll.</p>
        <details class="set-lic"><summary>Open-source parts</summary>
          <dl>${OPEN_SOURCE.map(e => `<dt>${e.name}</dt><dd>${e.licence}${e.notice ? `<br><small>${e.notice}</small>` : ""}</dd>`).join('')}</dl>
        </details>
        <details class="set-lic"><summary>Other parts</summary>
          <dl>${OTHER_PARTS.map(e => `<dt>${e.name}</dt><dd>${e.for}. ${e.licence}${e.notice ? `<br><small>${e.notice}</small>` : ""}</dd>`).join('')}</dl>
        </details>
        <p class="set-link"><a href="https://github.com/robthewizzuk/game-scroll/blob/main/LICENSE" target="_blank" rel="noopener">Read the full licence ↗</a></p>
      </section>
      <footer class="set-made">Made by <b>Rob</b></footer>`;
    el.querySelector('.qa-x').onclick = () => el.close();
    el.querySelector('.set-ar')?.addEventListener('click', () => { el.close(); arTest(); });
    el.querySelectorAll('.set-fps button[data-fps]').forEach(b => b.addEventListener('click', () => { setFpsPick(b.dataset.fps); render(); }));   // (the frame generation rows share the look)
    el.querySelectorAll('.set-fg button').forEach(b => b.addEventListener('click', () => { setFrameGenPick(b.dataset.fg); render(); }));
    el.querySelectorAll('.set-fg-how button').forEach(b => b.addEventListener('click', () => { setFrameGenHow(b.dataset.how); render(); }));
    el.querySelector('.set-loc').addEventListener('change', e => { geoSettings.enabled = e.target.checked; });
    el.querySelector('.set-stats')?.addEventListener('change', e => { playstats.enabled = e.target.checked; });
    el.querySelector('.set-forget')?.addEventListener('click', () => { resetRecommendations(); render(); });
    bindUpdates(el);
    el.querySelector('.set-clear')?.addEventListener('click', async e => {
      e.target.disabled = true; await clear(); render('Cache cleared. Games will download again as you play them.');
    });
  };
  el.addEventListener('click', e => { if (e.target === el) el.close(); });
  // the Updates row follows Play's answers while the sheet is open (only that row is drawn again, so a
  // download's progress never disturbs a slider being dragged)
  let shown = '';
  const stop = update.here ? update.watch(() => {
    const k = JSON.stringify(update.status()), row = el.querySelector('.set-updates');
    if (!el.open || !row || k === shown) return;
    shown = k; row.outerHTML = updatesRow(); bindUpdates(el);
  }) : null;
  el.addEventListener('close', () => { stop?.(); el.remove(); });
  render(); el.showModal();
  if (update.here) update.refresh();
}
