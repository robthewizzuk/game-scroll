// Settings sheet, opened from the ⚙ button in the top bar.
// How many streamed games are saved on this device (with a button to clear them), the licence, and credits.
import { fmt } from './util.js';
import { playstats } from './playstats.js';
import { HEARTS_URL } from './hearts.js';
import { nativeARSupported } from './kit/native-ar.js';
import { fpsPick, setFpsPick, autoFps, phoneClass, screenHz } from './kit/speed.js';
import { geoSettings } from './geo.js';

const size = b => b < 1024 * 1024 ? `${Math.ceil(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

/** opts: { stream, cached(): {games, bytes, max}, clear(): Promise, arTest(): opens the AR test scene } */
export function openSettings({ stream, cached, clear, arTest }) {
  const el = document.createElement('dialog'); el.className = 'qa-panel settings';
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
        <p class="qa-help">Auto picks by phone: on this one ${Math.min(autoFps({ era: 'nextgen' }), screenHz())} fps for 3D games and ${Math.min(autoFps({}), screenHz())} fps for the rest (${{ top: 'a top-end', mid: 'a mid-range', low: 'an entry-level' }[phoneClass()]} phone with a ${screenHz()} Hz screen), and 3D games step down if the phone can't keep up. A lower rate saves battery and keeps the phone cooler.</p>
        <div class="qa-actions set-fps">${['auto', 120, 60, 30].map(v => `<button data-fps="${v}"${fpsPick() === v ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"'}${v !== 'auto' && v > screenHz() ? ' disabled' : ''}>${v === 'auto' ? 'Auto' : v === 30 ? '30 · battery saver' : v}</button>`).join('')}</div>
      </section>
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
      ${HEARTS_URL ? `<section class="set-row">
        <h3>Play stats and crash reports</h3>
        <p class="qa-help">Counts how often each game is played or skipped, and reports crashes, errors and stutters along with your phone model (like “SM-F966B”), added up across everyone. It helps pick which games to improve, fix and show more. Nothing identifies you.</p>
        <label class="set-toggle"><input type="checkbox" class="set-stats"${playstats.enabled ? ' checked' : ''}> Share anonymous play stats and crash reports</label>
      </section>` : ''}
      <section class="set-row">
        <h3>Licence</h3>
        <p class="qa-help">Copyright © 2026 Rob and Game Scroll contributors. The code is under the PolyForm Shield License 1.0.0: you can use, change and share it for anything except making a product that competes with Game Scroll.</p>
        <details class="set-lic"><summary>Open-source parts</summary>
          <dl>
            <dt>three.js</dt><dd>MIT</dd>
            <dt>Capacitor</dt><dd>MIT</dd>
            <dt>Press Start 2P font</dt><dd>SIL OFL 1.1</dd>
            <dt>Rubik font</dt><dd>SIL OFL 1.1</dd>
          </dl>
        </details>
        <p class="set-link"><a href="https://github.com/robthewizzuk/game-scroll/blob/main/LICENSE" target="_blank" rel="noopener">Read the full licence ↗</a></p>
      </section>
      <footer class="set-made">Made by <b>Rob</b></footer>`;
    el.querySelector('.qa-x').onclick = () => el.close();
    el.querySelector('.set-ar')?.addEventListener('click', () => { el.close(); arTest(); });
    el.querySelectorAll('.set-fps button').forEach(b => b.addEventListener('click', () => { setFpsPick(b.dataset.fps); render(); }));
    el.querySelector('.set-loc').addEventListener('change', e => { geoSettings.enabled = e.target.checked; });
    el.querySelector('.set-stats')?.addEventListener('change', e => { playstats.enabled = e.target.checked; });
    el.querySelector('.set-clear')?.addEventListener('click', async e => {
      e.target.disabled = true; await clear(); render('Cache cleared. Games will download again as you play them.');
    });
  };
  el.addEventListener('click', e => { if (e.target === el) el.close(); });
  el.addEventListener('close', () => el.remove());
  render(); el.showModal();
}
