// A few words of X11, spoken straight down the X server's socket, for the desktop app on Linux under Steam's games mode
// (gamescope draws X11 windows: main.cjs starts Chromium on X11 there). Electron has no way to read or set a property
// on the screen's root window, or to ask the X server how big a window really is, and a native module would need
// building for every Electron; the requests needed are a handful of bytes each (the X11 protocol, chapters 8 and 9).
//
// What main.cjs uses it for:
//   - touch: gamescope turns every touch into a mouse click or a cursor move unless the screen's root window says
//     STEAM_TOUCH_CLICK_MODE = 4 ("passthrough": real touches). Steam writes it for each game from its controller
//     settings, and for a game that isn't one of Steam's own that is 1, a left click: a finger is a mouse there, and a
//     swipe drags the mouse instead of scrolling the feed. The app writes 4 while it has the screen. Gamescope runs an X
//     server for Steam (:0) and one for games (:1) and takes the newest write on either: Steam writes on its own, so
//     the app watches every one of them and writes again straight after Steam does (main.cjs).
//   - size: the window's real size and the screen's, to put the window right where Chromium's idea of its own size
//     and the X server's differ (the bottom of the app was drawn below the screen's edge).
// Nothing here is needed anywhere else; every call fails quietly (null) where there is no X server.
'use strict';
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const pad4 = n => (4 - (n % 4)) % 4;
const CARDINAL = 6;

/** The display's number and socket paths from DISPLAY (":1", ":1.0", "unix:1"): null for a remote one (pure). */
function displayOf(d = process.env.DISPLAY) {
  const m = /^(?:unix)?:(\d+)(?:\.\d+)?$/.exec(String(d || '').trim());
  if (!m) return null;
  return { n: m[1], paths: [`/tmp/.X11-unix/X${m[1]}`, `\0/tmp/.X11-unix/X${m[1]}`] };
}

/** The MIT-MAGIC-COOKIE-1 for display n in an Xauthority file's bytes (pure): Buffer or null. */
function cookieIn(buf, n, host = os.hostname()) {
  let o = 0;
  const str = () => { if (o + 2 > buf.length) throw new Error('short'); const l = buf.readUInt16BE(o); o += 2; const s = buf.subarray(o, o + l); o += l; return s; };
  try {
    while (o < buf.length) {
      const family = buf.readUInt16BE(o); o += 2;
      const addr = str().toString('latin1'), num = str().toString('latin1'), name = str().toString('latin1'), data = str();
      const here = family === 0xffff || family === 256 && (addr === host || addr === 'localhost');
      if (here && (num === '' || num === n) && name === 'MIT-MAGIC-COOKIE-1') return Buffer.from(data);
    }
  } catch (_) { /* a cut-short file */ }
  return null;
}
function cookie(n, env = process.env) {
  const file = env.XAUTHORITY || path.join(env.HOME || os.homedir(), '.Xauthority');
  try { return cookieIn(fs.readFileSync(file), n); } catch (_) { return null; }
}

/** The client's opening bytes (pure): little-endian, protocol 11.0, with a cookie or none. */
function setupRequest(ck) {
  const name = ck ? Buffer.from('MIT-MAGIC-COOKIE-1', 'latin1') : Buffer.alloc(0), data = ck || Buffer.alloc(0);
  const b = Buffer.alloc(12 + name.length + pad4(name.length) + data.length + pad4(data.length));
  b[0] = 0x6c; b.writeUInt16LE(11, 2); b.writeUInt16LE(0, 4); b.writeUInt16LE(name.length, 6); b.writeUInt16LE(data.length, 8);
  name.copy(b, 12); data.copy(b, 12 + name.length + pad4(name.length));
  return b;
}
/** The server's answer to it (pure): { root, width, height } of the first screen, or { error }. */
function parseSetup(b) {
  if (b[0] !== 1) return { error: b[0] === 0 ? b.subarray(8, 8 + b[1]).toString('latin1') || 'refused' : 'wants more authentication' };
  const vendorLen = b.readUInt16LE(24), nFormats = b[29], scr = 40 + vendorLen + pad4(vendorLen) + nFormats * 8;
  return { root: b.readUInt32LE(scr), width: b.readUInt16LE(scr + 20), height: b.readUInt16LE(scr + 22) };
}
const req = (op, data1, words) => { const b = Buffer.alloc(words * 4); b[0] = op; b[1] = data1; b.writeUInt16LE(words, 2); return b; };
function internAtom(name) {
  const s = Buffer.from(name, 'latin1'), b = req(16, 0, 2 + Math.ceil(s.length / 4));
  b.writeUInt16LE(s.length, 4); s.copy(b, 8); return b;
}
function changeProperty32(win, atom, type, values) {
  const b = req(18, 0, 6 + values.length);
  b.writeUInt32LE(win, 4); b.writeUInt32LE(atom, 8); b.writeUInt32LE(type, 12); b[16] = 32; b.writeUInt32LE(values.length, 20);
  values.forEach((v, i) => b.writeUInt32LE(v >>> 0, 24 + i * 4)); return b;
}
function changeProperty8(win, atom, type, bytes) {
  const b = req(18, 0, 6 + Math.ceil(bytes.length / 4));
  b.writeUInt32LE(win, 4); b.writeUInt32LE(atom, 8); b.writeUInt32LE(type, 12); b[16] = 8; b.writeUInt32LE(bytes.length, 20); bytes.copy(b, 24); return b;
}
function getProperty(win, atom, longs = 16) {   // (any type)
  const b = req(20, 0, 6); b.writeUInt32LE(win, 4); b.writeUInt32LE(atom, 8); b.writeUInt32LE(0, 12); b.writeUInt32LE(0, 16); b.writeUInt32LE(longs, 20); return b;
}
const PROPERTY_CHANGE = 0x400000, PROPERTY_NOTIFY = 28;
function changeEventMask(win, mask) { const b = req(2, 0, 4); b.writeUInt32LE(win, 4); b.writeUInt32LE(0x800, 8); b.writeUInt32LE(mask, 12); return b; }   // CWEventMask
function getGeometry(d) { const b = req(14, 0, 2); b.writeUInt32LE(d, 4); return b; }
function translate(src, dst) { const b = req(40, 0, 4); b.writeUInt32LE(src, 4); b.writeUInt32LE(dst, 8); return b; }
const sync = () => req(43, 0, 1);   // GetInputFocus: a reply that says every request before it was done

/**
 * A connection to the X server: { display, root, width, height, atom(name), set32(win, name, values), get32(win, name),
 * getText(win, name), setText(win, name, text), watch(win, f), geometry(win), close() }.
 * Requests go one at a time (each waits for its answer, or for the sync after it), which is all the app needs.
 */
async function open({ display = process.env.DISPLAY, env = process.env, timeout = 1500 } = {}) {
  const d = displayOf(display);
  if (!d) return null;
  const ck = cookie(d.n, env);
  for (const p of d.paths) for (const c of ck ? [ck, null] : [null]) {
    const x = await tryOpen(p, c, timeout).catch(() => null);
    if (x) { x.display = ':' + d.n; return x; }
  }
  return null;
}
function tryOpen(socketPath, ck, timeout) {
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ path: socketPath });
    let buf = Buffer.alloc(0), seq = 0, info = null, waiting = [], dead = null;
    const heard = new Set();   // (property changes on windows it watches)
    const fail = e => { dead = e; s.destroy(); for (const w of waiting.splice(0)) w.reject(e); if (!info) reject(e); };
    const timer = setTimeout(() => fail(new Error('X server did not answer')), timeout);
    s.on('error', fail);
    s.on('close', () => fail(dead || new Error('closed')));
    s.on('connect', () => s.write(setupRequest(ck)));
    s.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (!info) {
        if (buf.length < 8) return;
        const need = 8 + buf.readUInt16LE(6) * 4; if (buf.length < need) return;
        const r = parseSetup(buf.subarray(0, need)); buf = buf.subarray(need); clearTimeout(timer);
        if (r.error) return fail(new Error(r.error));
        info = r; return resolve(api());
      }
      for (;;) {
        if (buf.length < 32) return;
        const kind = buf[0], len = kind === 1 ? 32 + buf.readUInt32LE(4) * 4 : 32;
        if (buf.length < len) return;
        const pkt = buf.subarray(0, len); buf = buf.subarray(len);
        if (kind > 1) {   // an event: only property changes are asked for
          if ((kind & 0x7f) === PROPERTY_NOTIFY) for (const f of heard) { try { f({ window: pkt.readUInt32LE(4), atom: pkt.readUInt32LE(8), deleted: pkt[16] === 1 }); } catch (_) { /* the listener's */ } }
          continue;
        }
        const sq = pkt.readUInt16LE(2), w = waiting[0];
        if (!w || sq !== (w.seq & 0xffff)) { if (w && kind === 0 && w.sync && sq < (w.seq & 0xffff)) { waiting.shift(); w.reject(new Error(`X error ${pkt[1]}`)); } continue; }
        waiting.shift();
        if (kind === 0) w.reject(new Error(`X error ${pkt[1]}`)); else w.resolve(pkt);
      }
    });
    const ask = (bytes, withSync = false) => {
      if (dead) return Promise.reject(dead);
      s.write(bytes); seq++;
      if (withSync) { s.write(sync()); seq++; }
      const p = new Promise((res, rej) => waiting.push({ seq, sync: withSync, resolve: res, reject: rej }));
      return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('X server did not answer')), timeout))]);
    };
    const atoms = new Map();
    function api() {
      const atom = async name => {
        if (atoms.has(name)) return atoms.get(name);
        const r = await ask(internAtom(name)); const a = r.readUInt32LE(8); atoms.set(name, a); return a;
      };
      return {
        root: info.root, width: info.width, height: info.height, atom,
        async set32(win, name, values, type = CARDINAL) { await ask(changeProperty32(win, await atom(name), type, values), true); },
        async get32(win, name) {
          const r = await ask(getProperty(win, await atom(name)));
          if (r[1] !== 32) return null;
          const n = r.readUInt32LE(16), out = [];
          for (let i = 0; i < n; i++) out.push(r.readUInt32LE(32 + i * 4));
          return out;
        },
        /** A property of 8-bit values as text (gamescope's GAMESCOPE_FOCUS_DISPLAY, ":1"), or null. */
        async getText(win, name) {
          const r = await ask(getProperty(win, await atom(name)));
          if (r[1] !== 8) return null;
          return r.subarray(32, 32 + r.readUInt32LE(16)).toString('latin1').replace(/\0+$/, '');
        },
        async setText(win, name, text, type = CARDINAL) { await ask(changeProperty8(win, await atom(name), type, Buffer.from(text + '\0', 'latin1')), true); },
        /** Hear a window's property changes: f({ window, atom, deleted }) for each, from now on. */
        async watch(win, f) { heard.add(f); await ask(changeEventMask(win, PROPERTY_CHANGE), true); },
        /** A window's size and its place on the screen: { x, y, width, height } (x and y from the root's corner). */
        async geometry(win) {
          const g = await ask(getGeometry(win)), t = await ask(translate(win, info.root));
          return { x: t.readInt16LE(12), y: t.readInt16LE(14), width: g.readUInt16LE(16), height: g.readUInt16LE(18) };
        },
        close() { dead = new Error('closed'); s.end(); },
      };
    }
  });
}

/** The X servers on this computer, as DISPLAY names (":0", ":1"): gamescope runs one for Steam and one for games. */
function displaysHere(dir = '/tmp/.X11-unix') {
  try { return fs.readdirSync(dir).map(f => /^X(\d+)$/.exec(f)).filter(Boolean).map(m => ':' + m[1]).sort((a, b) => a.slice(1) - b.slice(1)); } catch (_) { return []; }
}

/** The X window id in Electron's native handle (a Buffer holding an unsigned long on Linux). */
const xidOf = handle => (Buffer.isBuffer(handle) && handle.length >= 4 ? handle.readUInt32LE(0) : 0);

module.exports = { open, xidOf, displaysHere, displayOf, cookieIn, setupRequest, parseSetup };
