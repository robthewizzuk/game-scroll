// Streams every game in over the network, like a video feed loads the next clip.
//
// The app ships with no games inside. It reads a catalogue (manifest.json) from the game host
// (Cloudflare R2, VITE_GAMES_URL at build time) with each game's title, hint, era and so on, and
// downloads a game's code (one small file) just before it comes up in the feed. Downloaded games
// are kept in IndexedDB, up to CACHE_MAX of them (the least recently played are dropped first),
// so they open instantly and still play offline. scripts/build-games.mjs makes the files.
//
// Local dev and the test scripts build with VITE_GAMES_URL empty (vite --mode bundled): then the
// games in src/games/ are built in and this module stays out of the way.
//
// Signed catalogue: when the app has a public key (VITE_CATALOGUE_KEY), it reads catalogue.json
// instead, which holds manifest.json's exact text plus a signature made in CI with a key only GitHub
// has (scripts/sign-catalogue.mjs). It rejects a catalogue that isn't signed by that key or is older
// than the one it already has, and checks every game file's full SHA-256 against it. So someone who
// got write access to the games host still couldn't get their own code to run in the app.

import { API_FEATURES, LOCATION_LEVELS, hasAll } from './game-modules.js';
import gs, { loadParts, offers } from './gamescroll.js';

export const BASE = String(import.meta.env.VITE_GAMES_URL || '').replace(/\/+$/, '');
export const CACHE_MAX = 1000;
// Base64 SPKI public key for ECDSA P-256. Empty = the old unsigned manifest.json (before the key exists).
const PUBKEY = String(import.meta.env.VITE_CATALOGUE_KEY || '').trim();
export const SIGNED = !!PUBKEY;
// A signed build saves its verified catalogue under its own name, so an unsigned copy saved by an
// older build is never used.
const MANIFEST_KEY = SIGNED ? 'gs_catalogue' : 'gs_manifest', INDEX_KEY = 'gs_cache_index';

// The app's shared code, handed to downloaded games: only gs (src/gamescroll.js), which leaves out
// everything app-only (the wallet, saved progress, settings).
// It carries gs's parts at the top level as well as default, so it works however the bundler reads
// the default import (as module.default, or as the whole module).
// The parts that load later are copied as getters, so building this doesn't load them.
const KIT = { 'gamescroll.js': Object.freeze(Object.defineProperties({ __esModule: true, default: gs }, Object.getOwnPropertyDescriptors(gs))) };
// Not a module: the api features this app gives games in make(api) (see API_FEATURES).
KIT['@api'] = Object.fromEntries(API_FEATURES.map(k => [k, true]));

/* ---------- tiny IndexedDB store: file path -> code ---------- */
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((ok, no) => {
    if (!globalThis.indexedDB) return no(new Error('no indexedDB'));
    const r = indexedDB.open('gs_games', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
  return dbp;
}
async function idb(mode, fn) {
  const d = await db();
  return new Promise((ok, no) => { const t = d.transaction('files', mode), q = fn(t.objectStore('files')); t.oncomplete = () => ok(q && q.result); t.onerror = () => no(t.error); });
}

/* ---------- cache index: file -> [last used, bytes], kept in localStorage so it's readable at once ---------- */
let index = {};
try { index = JSON.parse(localStorage.getItem(INDEX_KEY) || '{}') || {}; } catch (_) {}
const saveIndex = () => { try { localStorage.setItem(INDEX_KEY, JSON.stringify(index)); } catch (_) {} };

const cacheGet = f => idb('readonly', s => s.get(f)).catch(() => undefined);
async function cacheDrop(files) {
  if (!files.length) return;
  for (const f of files) delete index[f];
  saveIndex();
  try { await idb('readwrite', s => files.forEach(f => s.delete(f))); } catch (_) {}
}
async function cachePut(f, code) {
  index[f] = [Date.now(), code.length]; saveIndex();
  try { await idb('readwrite', s => s.put(code, f)); } catch (_) { delete index[f]; saveIndex(); return; }
  const files = Object.keys(index);
  if (files.length > CACHE_MAX)   // over the limit: drop the games played longest ago
    await cacheDrop(files.sort((a, b) => index[a][0] - index[b][0]).slice(0, files.length - CACHE_MAX));
}

/* ---------- state ---------- */
const entries = new Map();   // id -> manifest entry
const loaded = new Map();    // id -> { hash, def }
const inflight = new Map();  // id -> Promise
const failed = new Map();    // id -> time of the last failed download (skipped for a while, e.g. offline)
let addGame = null, onChange = null;
let appInfo = null;   // the catalogue's word on the app itself: { android: { min } } (store/app-update.json)
const known = new Map();   // id -> the app's entry for it (metadata, likes)

// Can this app run the game? It must only use shared exports this build actually has.
function compatible(g) {
  for (const [mod, names] of Object.entries(g.needs || {})) { const m = KIT[mod]; if (!m || !(mod === 'gamescroll.js' ? offers(names) : hasAll(m, names))) return false; }
  // A location level this app doesn't know (a future one) would get no location at all: skip the game.
  if (g.meta && g.meta.location !== undefined && !LOCATION_LEVELS.includes(g.meta.location)) return false;
  return true;
}

// Metadata of a game the app already lists can change too (a new category, title, hint...).
// Update the app's entry in place so the feed filters and captions use the new values at once.
function refreshMeta(e, meta) {
  let diff = false;
  for (const k of Object.keys(e)) if (k !== 'likes' && !(k in meta)) { delete e[k]; diff = true; }
  for (const [k, v] of Object.entries(meta)) if (JSON.stringify(e[k]) !== JSON.stringify(v)) { e[k] = v; diff = true; }
  return diff;
}

// the phone and driver steering list the catalogue carries (src/steer.js): the saved catalogue's is used from the start of
// the app (null: none yet, so the one built into the app), a fresh one's from the next start
let steerList = null, steerAtStart = null;
function apply(m) {
  const added = [], changed = [];
  if (!m || m.v !== 1 || !Array.isArray(m.games)) return { added, changed };
  if (Array.isArray(m.steer)) steerList = m.steer;
  appInfo = m.app && typeof m.app === 'object' ? m.app : null;
  for (const g of m.games) {
    if (!g || !g.id || !g.file || !g.hash || !g.meta || g.meta.id !== g.id || !compatible(g)) continue;
    entries.set(g.id, g);
    const e = known.get(g.id);
    if (!e) { const n = addGame({ ...g.meta }); known.set(g.id, n); added.push(n); }
    else if (refreshMeta(e, g.meta)) changed.push(e);
  }
  return { added, changed };
}

async function sha256(code) {
  if (!globalThis.crypto || !crypto.subtle) return null;
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/* ---------- signed catalogue ---------- */
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
let pubkey = null;
/** The manifest text inside a signed catalogue.json, or null if the signature doesn't check out. */
async function openCatalogue(env) {
  if (!env || env.v !== 2 || typeof env.data !== 'string' || typeof env.sig !== 'string') return null;
  if (!globalThis.crypto || !crypto.subtle) return null;   // can't check it, so don't trust it
  try {
    pubkey ??= await crypto.subtle.importKey('spki', unb64(PUBKEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubkey, unb64(env.sig), new TextEncoder().encode(env.data));
    return ok ? env.data : null;
  } catch (_) { return null; }
}
let savedBuilt = 0;   // build time of the catalogue in use; an older one (a replayed old catalogue) is refused

// Names a game file never needs (games get all of this through gs and api, and scripts/game-lint.mjs
// flags them in review). The game's code runs with each of these set to undefined, so a plain
// reference to one does nothing. It's one more layer, not a sandbox: games share the app's page,
// and what keeps them out of the rest is review, the lint, the signed catalogue and the CSP.
export const SHADOWED = ['window', 'self', 'globalThis', 'top', 'parent', 'frames', 'opener', 'open', 'location', 'navigator',
  'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'cookieStore', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'WebTransport', 'RTCPeerConnection', 'Worker', 'SharedWorker', 'importScripts', 'postMessage', 'BroadcastChannel', 'Capacitor',
  'Function', '__gs', '__hd'];

// Returns { def, again }: again() runs the file once more and gives a fresh copy of the game, with
// its own top-level memory (the app loads a big 3D game on fresh copies: main.js bootGame).
function evaluate(id, code) {
  const require = spec => { const m = spec.startsWith('gs:') && spec[3] !== '@' && KIT[spec.slice(3)]; if (!m) throw new Error('missing shared module ' + spec); return m; };
  // The game is the inner function, so its own top-level names (a `let top`) never clash with the
  // shadowed ones. Strict, as the module it was written as (and so `this` is never the window).
  // sourceURL names the file in error reports (src/perf.js) instead of an anonymous function.
  const wrap = new Function(...SHADOWED, 'return function (require, module, exports) { \'use strict\';\n' + code + '\n}\n//# sourceURL=games/' + String(id).replace(/[^a-z0-9-]/g, '') + '.js');
  const again = () => {
    const module = { exports: {} };
    wrap()(require, module, module.exports);
    const def = module.exports.default;
    if (!def || def.id !== id || typeof def.make !== 'function') throw new Error('bad game file for ' + id);
    return def;
  };
  return { def: again(), again };
}

async function fetchCode(g) {
  let code = await cacheGet(g.file);
  // A copy saved by an older, unsigned build was only checked with the short hash: check it again.
  if (SIGNED && typeof code === 'string' && await sha256(code) !== g.sha256) { cacheDrop([g.file]); code = undefined; }
  if (typeof code === 'string') { if (index[g.file]) { index[g.file][0] = Date.now(); saveIndex(); } return code; }
  const r = await fetch(`${BASE}/${g.file}`);
  if (!r.ok) throw new Error(`${r.status} for ${g.file}`);
  code = await r.text();
  const h = await sha256(code);
  // Signed: the full hash must match, and a phone that can't hash can't play streamed games.
  if (SIGNED ? h !== g.sha256 : h && h.slice(0, 12) !== g.hash) throw new Error('hash mismatch for ' + g.file);
  cachePut(g.file, code);
  return code;
}

export const remote = {
  enabled: !!BASE,
  /** The catalogue's phone and driver steering list, as it was when the app started (null: none saved). */
  steer: () => steerAtStart,

  /** add(meta): put a game into the app's list and return it.
   *  changed(added, updated): the fresh catalogue brought new games, or new metadata for listed ones. */
  init(add, changed) {
    addGame = add; onChange = changed;
    // The saved copy was checked when it was saved (for a signed catalogue, the verified text).
    try { const m = JSON.parse(localStorage.getItem(MANIFEST_KEY) || 'null'); savedBuilt = +m?.built || 0; apply(m); } catch (_) {}
    steerAtStart = steerList;
  },

  /** Fetch the latest catalogue. Resolves true if it got one. Runs at start-up and on return to the app. */
  async refresh() {
    failed.clear();   // give games that failed to download (e.g. while offline) another go
    try {
      const r = await fetch(`${BASE}/${SIGNED ? 'catalogue.json' : 'manifest.json'}`, { cache: 'no-cache' });
      if (!r.ok) return false;
      let text = await r.text();
      if (SIGNED && !(text = await openCatalogue(JSON.parse(text)))) { console.warn('[games] catalogue signature check failed'); return false; }
      const m = JSON.parse(text);
      if (m.v !== 1 || !Array.isArray(m.games)) return false;
      if (SIGNED && !(+m.built >= savedBuilt)) { console.warn('[games] catalogue is older than the saved one'); return false; }
      savedBuilt = +m.built || 0;
      try { localStorage.setItem(MANIFEST_KEY, text); } catch (_) {}
      for (const id of [...entries.keys()]) if (!m.games.some(g => g.id === id)) entries.delete(id);   // taken down
      const { added, changed } = apply(m), live = new Set(m.games.map(g => g.file));
      cacheDrop(Object.keys(index).filter(f => !live.has(f)));   // old versions of updated games
      if ((added.length || changed.length) && onChange) onChange(added, changed);
      return true;
    } catch (_) { return false; }   // offline: keep using the saved catalogue
  },

  /** The playable definition of a feed entry, or null while it downloads (the download starts). */
  def(d) {
    const g = entries.get(d.id), l = loaded.get(d.id);
    if (!g) return null;
    if (l && l.hash === g.hash) return l.def;
    this.load(d.id); return null;
  },

  /** A fresh copy of a loaded game (its file run again, so nothing it kept at the top level carries over), or null. */
  fresh(id) { const g = entries.get(id), l = loaded.get(id); return g && l && l.hash === g.hash ? l.again() : null; },

  /** Can this game be shown soon? (In the catalogue and not just failed to download.) */
  has(id) { const t = failed.get(id); return entries.has(id) && !(t && Date.now() - t < 20000); },

  /** Download (or read from the cache) one game. Resolves to its definition, or null. */
  load(id) {
    const g = entries.get(id);
    if (!g) return Promise.resolve(null);
    const l = loaded.get(id);
    if (l && l.hash === g.hash) return Promise.resolve(l.def);
    if (inflight.has(id)) return inflight.get(id);
    const need = g.needs?.['gamescroll.js'] || [];
    const p = Promise.all([fetchCode(g), loadParts(need)]).then(([code]) => {
      // the parts that just loaded are checked in full now (an older app may lack something newer)
      if (!hasAll(gs, need)) throw new Error('needs a newer app');
      const file = evaluate(id, code), def = { ...known.get(id), ...file.def };
      loaded.set(id, { hash: g.hash, def, again: file.again }); failed.delete(id); return def;
    }).catch(e => { console.warn('[games]', id, e.message); failed.set(id, Date.now()); return null; })
      .finally(() => inflight.delete(id));
    inflight.set(id, p); return p;
  },

  /** Get the next few games in the feed ready so they open instantly. */
  prefetch(list) { for (const d of list) if (this.has(d.id)) this.load(d.id); },

  /** The version of the game's file that is loaded and running (its short hash), or '' if it isn't. */
  version(id) { return loaded.get(id)?.hash || ''; },

  /** Mark a game as just played, so the cache keeps it. */
  touch(id) { const g = entries.get(id); if (g && index[g.file]) { index[g.file][0] = Date.now(); saveIndex(); } },

  /** For the settings screen. */
  cacheInfo() { const v = Object.values(index); return { games: v.length, bytes: v.reduce((a, x) => a + x[1], 0), max: CACHE_MAX }; },
  async clearCache() {
    index = {}; saveIndex();
    try { await idb('readwrite', s => s.clear()); } catch (_) {}
  },

  /** What the catalogue says about the app itself, e.g. { android: { min: 412 } }: the oldest Android
   *  version code that may carry on (src/update.js gets older copies updated from Google Play). */
  app() { return appInfo; },

  status() { return { host: BASE || null, signed: SIGNED, games: entries.size, loaded: [...loaded.keys()], cache: this.cacheInfo() }; },
};
