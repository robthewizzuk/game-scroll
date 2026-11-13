// Share a game with friends, and open a game someone shared.
//
// A shared link looks like https://play.game-scroll.com/<game id>. That page (served by the API
// Worker, workers/hearts/src/sharepage.js) has an "Open in Game Scroll" button that opens
// gamescroll://game/<id>, which the app catches here and jumps to that game (the phone apps, and the Mac
// and Windows app: src/desktop.js). ?g=<id> on the app's own address opens one too (the tests). What the feed then does is openShared in src/main.js (the shared
// game goes first; a game that has been taken down gets a note); scripts/share-link.mjs checks it.
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';
import { desktop } from './desktop.js';

export const SHARE_BASE = String(import.meta.env.VITE_SHARE_URL || 'https://play.game-scroll.com').replace(/\/+$/, '');
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const shareUrl = id => `${SHARE_BASE}/${encodeURIComponent(id)}`;

/** The game id in a link we understand, or null. */
export function linkedGame(url) {
  try {
    const u = new URL(url);
    let id = null;
    if (u.protocol === 'gamescroll:') id = (u.host === 'game' ? u.pathname : u.host + u.pathname).replace(/^\/+|\/+$/g, '');
    else if (SHARE_BASE && url.startsWith(SHARE_BASE + '/')) id = u.pathname.replace(/^\/+|\/+$/g, '');
    else id = u.searchParams.get('g');
    id = id && decodeURIComponent(id).toLowerCase();
    return id && ID_RE.test(id) ? id : null;
  } catch (_) { return null; }
}

/**
 * Open the share sheet for a game. Returns 'shared', 'copied' (no share sheet: link copied),
 * or 'cancelled'.
 */
export async function shareGame(def, best = 0) {
  const url = shareUrl(def.id);
  const text = best > 0 ? `I scored ${best} on ${def.title} in Game Scroll. Can you beat it?` : `Play ${def.title} on Game Scroll`;
  try {
    if (Capacitor.isNativePlatform()) { await Share.share({ title: def.title, text, url, dialogTitle: 'Share this game' }); return 'shared'; }
    if (navigator.share) { await navigator.share({ title: def.title, text, url }); return 'shared'; }
  } catch (e) {
    // The person closed the sheet: nothing to do.
    if (/cancel|abort/i.test(String(e && (e.name || e.message)))) return 'cancelled';
  }
  try { await navigator.clipboard.writeText(`${text} ${url}`); return 'copied'; } catch (_) { return 'cancelled'; }
}

/** Call open(id) for a shared game: at launch (link or ?g=) and whenever a link opens the app. */
export function onSharedGame(open) {
  const fromPage = linkedGame(location.href);
  if (fromPage) {
    open(fromPage);
    // Drop ?g= so a reload doesn't jump back to that game.
    const u = new URL(location.href); u.searchParams.delete('g'); history.replaceState(null, '', u.pathname + u.search + u.hash);
  }
  // the Mac and Windows app: the link it was opened with, and any that come while it runs
  if (desktop) desktop.onOpenUrl(url => { const id = linkedGame(url); if (id) open(id); });
  if (!Capacitor.isNativePlatform()) return;
  App.getLaunchUrl().then(r => { const id = r && r.url && linkedGame(r.url); if (id) open(id); }).catch(() => {});
  App.addListener('appUrlOpen', e => { const id = linkedGame(e.url); if (id) open(id); });
}
