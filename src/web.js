// The web version: the app built for a plain browser (npm run build:web, published to GitHub Pages by
// .github/workflows/web-pages.yml at https://robthewizzuk.github.io/game-scroll/). It is for trying
// Game Scroll out, so the heavy parts stay in the apps:
//   - Next Gen and AR games are left out of the feed and never downloaded (appOnly); they stay in the
//     feed menu, marked as in the app, and picking one (or a link to one) says where to get the app;
//   - board games play on their table in 3D, without the AR chip (src/kit/tabletop.js reads WEB);
//   - Settings has no AR test.
// Everything else (Phone, Pocket, Color, Advance, Classic Console games) plays as it does in the apps.
// The phone apps, the Mac and Windows app, local dev and the test builds are not the web version.
export const WEB = import.meta.env?.VITE_WEB === '1';

/** True for a game (or a feed menu choice, { era }) the web version doesn't play: Next Gen and AR need the app. */
export const appOnly = d => WEB && !!d && (d.era === 'nextgen' || d.era === 'ar');

// Where the apps are (the same builds the README links to).
const REL = 'https://github.com/robthewizzuk/game-scroll/releases';
export const GET_APP = [
  { id: 'android', label: 'Android phone', url: `${REL}/tag/android-latest` },
  { id: 'iphone', label: 'iPhone', url: 'https://github.com/robthewizzuk/game-scroll/blob/main/docs/ios-sideload.md' },
  { id: 'mac', label: 'Mac (Apple silicon)', url: `${REL}/download/desktop-latest/Game-Scroll-mac-arm64.dmg` },
  { id: 'mac-intel', label: 'Mac (Intel)', url: `${REL}/download/desktop-latest/Game-Scroll-mac-x64.dmg` },
  { id: 'windows', label: 'Windows', url: `${REL}/download/desktop-latest/Game-Scroll-windows-x64.exe` },
];

/** The download that suits this device best, first: an Android phone gets the Android app, and so on. */
export function appLinks(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  const first = /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) ? 'iphone' : /mac os x|macintosh/i.test(ua) ? 'mac' : /windows/i.test(ua) ? 'windows' : '';
  return [...GET_APP].sort((a, b) => (b.id === first) - (a.id === first));
}

/** What the web version says when Next Gen or AR games (or one of them, by title) are picked: get the app, and where. */
export function getAppHTML(era, title = '') {
  const [best, ...rest] = appLinks();
  const what = era === 'ar' ? 'AR games' : 'Next Gen games', esc = t => String(t).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
  const why = era === 'ar' ? 'They put 3D games in your real room through the camera, so they need the Game Scroll app.' : 'Their big HD 3D worlds need the Game Scroll app.';
  const a = (l, cls) => `<a class="${cls}" href="${l.url}" target="_blank" rel="noopener noreferrer">${l.label}</a>`;
  return `<span class="tag">${era === 'ar' ? 'AR · 3D' : 'Next Gen · Console'}</span><h2>${title ? esc(title) : what + ' are in the app'}</h2>` +
    `<p>${title ? `${esc(title)} is one of the ${what}. ` : ''}${why} Install it to play them; everything else plays here in the browser.</p>` +
    `<div class="get-app">${a({ ...best, label: 'Get the app for ' + best.label }, 'play get-best')}<div class="get-more">${rest.map(l => a(l, 'get-other')).join('')}</div></div>`;
}

/** A board game's hint without "tap AR to play on your floor" (the web version has no AR); other hints as they are. */
export function webHint(d) {
  const h = String(d?.hint ?? '');
  if (!WEB || d?.era !== 'board') return h;
  return h.replace(/\s*Tap AR\b[^.]*\./g, '').replace(/(,\s*or|;)\s*tap AR\b[^.]*\./g, '.');
}
