// Game Scroll for Mac and Windows: the same web app the phone apps run (dist/, from `npm run build`),
// in Electron. Electron carries its own Chromium, the engine Android's web view is built on, so WebGPU,
// the shaders and the engine's speed tuning behave the same on every computer. (A system web view, as
// Tauri uses, would be Safari's on a Mac: WebGPU only on the newest macOS, animation frames held to 60 a
// second on 120 Hz screens, and a different shader compiler from the one the engine is tuned on.)
//
// The app is served from https://localhost, the Android app's own address, read straight from the
// app's files: the games host, the API and the page's security policy already allow it, and saves stay
// where they are between versions (they belong to that address). Anything else goes to the network
// as usual. The page gets one small extra, window.gsDesktop (preload.cjs), and src/desktop.js reads it.
// Guide: docs/desktop.md.
'use strict';
const { app, BrowserWindow, Menu, ipcMain, net, powerMonitor, protocol, screen, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { thisDevice, zoomFor, linuxPower } = require('./device.cjs');

const HOST = 'localhost', ORIGIN = `https://${HOST}`, SCHEME = 'gamescroll';
const mac = process.platform === 'darwin', win32 = process.platform === 'win32';
// the built web app: inside the app (web/), or ../dist while working on it (GS_WEB: another build, for tests)
const WEB = path.resolve(!app.isPackaged && process.env.GS_WEB || (fs.existsSync(path.join(__dirname, 'web')) ? path.join(__dirname, 'web') : path.join(__dirname, '..', 'dist')));

// (the tests keep their saves and window apart from a real one: scripts/desktop-test.cjs)
if (!app.isPackaged && process.env.GS_USER_DATA) app.setPath('userData', process.env.GS_USER_DATA);

/* ---------- speed: before Chromium starts ---------- */
const sw = (k, v) => app.commandLine.appendSwitch(k, v);
sw('force_high_performance_gpu');          // a laptop with two graphics chips draws on the fast one
sw('ignore-gpu-blocklist');                // keep the graphics chip where Chromium would turn an older driver down to software
sw('enable-gpu-rasterization');            // 2D canvases and the feed drawn on the graphics chip
sw('enable-zero-copy');                    // and handed to the screen without a copy
sw('autoplay-policy', 'no-user-gesture-required');   // sound can start before the first click
// JavaScript's room for short-lived things: a 3D game makes several hundred KB of them a frame (Long Shadow about 700 KB,
// 40 MB a second at 60), and V8 sweeps them out each time its young space fills, a pause each time. Its own size suits a
// phone, and it only grows where things live on, which garbage doesn't: 700 KB a frame was swept 4.6 times a second. A
// computer has the memory to start it at 32 MB (up to 64): 0.7 times a second (scripts/desktop-test.cjs checks it).
sw('js-flags', '--min-semi-space-size=32 --max-semi-space-size=64');
// Chromium bounds-checks every shader's reads and writes (WebGPU's robustness), so one web page can't read what another
// left in the graphics chip's memory. The app runs only its own games, so on a computer the checks go, and the
// shaders run without them (heavy ones a few per cent quicker). WebGPU's checks of each call stay: the engine tries a new
// effect inside them and turns it off if the chip refuses it (src/kit/pipes.js, hd3d-gpu-trace.js). --gs-safe-gpu
// (a launch option) keeps the bounds checks, for a game whose shader reads past an array's end.
if (!process.argv.includes('--gs-safe-gpu')) sw('enable-dawn-features', 'disable_robustness');
// Windows guesses when a window is covered and stops drawing it; overlays and some screen setups fool it
// into freezing a window that is in plain view. (Minimised windows still stop.)
if (win32) sw('disable-features', 'CalculateNativeWinOcclusion');
// A graphics driver that resets, or Chromium's graphics process crashing, loses the page's WebGPU device; the engine
// makes a new one and carries on (src/kit/gpu.js). Chromium itself would block the app's own address from WebGL and
// WebGPU after a few of those, for good until the app restarted, leaving the 3D games blank.
app.disableDomainBlockingFor3DAPIs();
// Linux (SteamOS on a ROG Ally or Steam Deck, any Linux PC; and the tests): Chromium keeps WebGPU behind a switch there
// for most graphics chips, AMD's among them; it draws through Vulkan (Mesa's RADV on an AMD handheld).
// --gs-webgl (a Steam launch option) keeps every game on WebGL, for a driver whose WebGPU shows nothing.
const webgl = process.argv.includes('--gs-webgl');
if (process.platform === 'linux') {
  if (webgl) sw('disable-blink-features', 'WebGPU');
  else { sw('enable-unsafe-webgpu'); sw('enable-features', 'Vulkan'); }
}
// The computer it runs on (desktop/device.cjs): a games handheld, and Steam's games mode (gamescope: SteamOS's Game
// Mode, Big Picture). There the app is a console's: full screen from the start, drawn bigger to read at a hand's
// length or from a sofa, played with the controller. Gamescope shows X11 windows; Chromium would otherwise pick
// Wayland wherever it finds one, and gamescope's own Wayland is newer and less tried.
const DEVICE = thisDevice();
const CONSOLE = DEVICE.gamescope || !!DEVICE.handheld || process.argv.includes('--gs-console');
if (process.platform === 'linux' && DEVICE.gamescope) sw('ozone-platform', 'x11');

// One copy at a time: a second launch (a gamescroll:// link on Windows) hands its link to the first.
if (!app.requestSingleInstanceLock()) { app.quit(); return; }
app.setAppUserModelId('com.game_scroll.app');

/* ---------- gamescroll:// links (the "Open in Game Scroll" button on play.game-scroll.com) ---------- */
// Links wait here until the page takes them (preload.cjs asks when the app starts listening and whenever
// it is nudged), so one that comes while the window opens or the page loads isn't lost or opened twice.
const linkIn = argv => argv.find(a => typeof a === 'string' && a.startsWith(SCHEME + '://')) || null;
const links = [];
let main = null;
function openLink(url) {
  if (!url) return;
  links.push(url);
  if (main && !main.webContents.isLoading()) { main.webContents.send('gs:links'); show(); }
}
openLink(linkIn(process.argv));   // Windows: started by a link
app.on('open-url', (e, url) => { e.preventDefault(); openLink(url); });   // macOS (also before the window is up)
app.on('second-instance', (_e, argv) => { const url = linkIn(argv); if (url) openLink(url); else show(); });
if (app.isPackaged) app.setAsDefaultProtocolClient(SCHEME);   // (the installers register it too; not while working on it)

/* ---------- the app's files at https://localhost ---------- */
const TYPES = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json', webmanifest: 'application/manifest+json', wasm: 'application/wasm', svg: 'image/svg+xml', png: 'image/png',
  jpg: 'image/jpeg', ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', txt: 'text/plain; charset=utf-8',
};
const typeOf = f => TYPES[path.extname(f).slice(1).toLowerCase()] || 'application/octet-stream';
const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
// The app's files are read whole and kept (they don't change while it runs; the bundles carry their content's hash in
// their names, so the code cache can keep them; the page itself is read fresh). Streamed through net.fetch, each file
// went through this process's JavaScript a piece at a time: 5.8 ms a file against 2.8 for Chromium reading a local
// server, and every file the page and its games load at a start or a loading screen waited on it.
const KEEP_MB = 160, KEEP_ONE = 16 << 20;
const kept = new Map();
let keptBytes = 0;
async function fileOf(file) {
  const k = kept.get(file); if (k) return k;
  let st; try { st = await fs.promises.stat(file); } catch (_) { return null; }
  if (!st.isFile()) return null;
  const f = { body: await fs.promises.readFile(file), type: typeOf(file) };
  if (st.size <= KEEP_ONE && keptBytes + st.size <= KEEP_MB << 20) { kept.set(file, f); keptBytes += st.size; }
  return f;
}
async function serve(req) {
  const u = new URL(req.url);
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405 });
  let rel; try { rel = decodeURIComponent(u.pathname); } catch (_) { return notFound(); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(WEB, path.normalize(rel));
  if (!file.startsWith(WEB + path.sep)) return notFound();   // (nothing outside the app's own files)
  let f; try { f = await fileOf(file); } catch (_) { f = null; }
  if (!f) return notFound();
  return new Response(req.method === 'HEAD' ? null : f.body, {
    status: 200,
    headers: { 'Content-Type': f.type, 'Content-Length': String(f.body.length), 'Cache-Control': /\/assets\//.test(rel) ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff' },
  });
}

/* ---------- the window ---------- */
const STATE = () => path.join(app.getPath('userData'), 'window.json');
function readState() { try { return JSON.parse(fs.readFileSync(STATE(), 'utf8')); } catch (_) { return null; } }
let saveTimer = null;
function keepState(w) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (w.isDestroyed()) return;
    const o = { bounds: w.getNormalBounds(), maximized: w.isMaximized(), fullScreen: w.isFullScreen() };
    try { fs.writeFileSync(STATE(), JSON.stringify(o)); } catch (_) { /* best effort */ }
  }, 400);
}
// a remembered place that is still on one of the screens (a monitor unplugged since puts it back in the middle)
function onScreen(b) {
  return b && screen.getAllDisplays().some(d => { const a = d.workArea; return b.x < a.x + a.width - 80 && b.x + b.width > a.x + 80 && b.y >= a.y - 20 && b.y < a.y + a.height - 80; });
}
// A console's games mode draws the app bigger (desktop/device.cjs zoomFor): the screen's height in the app's own
// units. GS_ZOOM pins it (a Steam launch option: GS_ZOOM=1.5 %command%).
function consoleZoom(d = screen.getPrimaryDisplay()) {
  const pin = +process.env.GS_ZOOM;
  if (pin >= .5 && pin <= 4) return pin;
  return CONSOLE ? zoomFor(d.size.height) : 1;
}
function show() { if (!main) return; if (main.isMinimized()) main.restore(); main.show(); main.focus(); }

function createWindow() {
  const st = readState(), area = screen.getPrimaryDisplay().workAreaSize;
  // first run: most of the screen (the feed lays itself out to any window; Next Gen games fill a wide one)
  const h = Math.round(Math.min(1000, area.height * .88)), w = Math.round(Math.min(area.width * .88, h * 1.45));
  const b = onScreen(st?.bounds) ? st.bounds : { width: w, height: h };
  const zoom = consoleZoom();
  main = new BrowserWindow({
    ...b, minWidth: 380, minHeight: 600, show: false, title: 'Game Scroll', backgroundColor: '#0c0e12',
    autoHideMenuBar: true, fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true,
      spellcheck: false, enableWebSQL: false, navigateOnDragDrop: false,
      backgroundThrottling: true,   // (a hidden window stops drawing: the app pauses its round then anyway)
      v8CacheOptions: 'bypassHeatCheck',   // keep compiled code for the app's scripts from the first run (faster starts)
      zoomFactor: zoom,
      additionalArguments: [`--gs-version=${app.getVersion()}`, `--gs-device=${encodeURIComponent(JSON.stringify({ ...DEVICE, console: CONSOLE, zoom, webgl }))}`],
    },
  });
  if (st?.maximized) main.maximize();
  if (st?.fullScreen || CONSOLE) main.setFullScreen(true);
  for (const e of ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) main.on(e, () => keepState(main));
  main.once('ready-to-show', show);
  main.on('closed', () => { main = null; });

  const wc = main.webContents;
  wc.setVisualZoomLevelLimits(1, 1);   // no pinch zoom: the feed lays itself out to the window
  // links out of the app open in the browser; the window itself never leaves the app
  const outside = url => { if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); };
  wc.setWindowOpenHandler(({ url }) => { outside(url); return { action: 'deny' }; });
  wc.on('will-navigate', e => { if (!e.url.startsWith(ORIGIN + '/')) { e.preventDefault(); outside(e.url); } });
  // Ctrl/Cmd + and - would zoom the whole app; the feed sizes itself to the window instead
  wc.on('before-input-event', (e, i) => { if ((i.control || i.meta) && ['+', '=', '-', '0'].includes(i.key) && i.type === 'keyDown') e.preventDefault(); });
  // a crashed or frozen page (a graphics driver reset) comes back by itself
  wc.on('render-process-gone', (_e, d) => { if (d.reason !== 'clean-exit') setTimeout(() => main && !main.isDestroyed() && main.loadURL(ORIGIN + '/'), 500); });
  wc.on('did-finish-load', () => { if (links.length) wc.send('gs:links'); });
  main.loadURL(ORIGIN + '/');
}

/* ---------- menus (the keys people expect; Windows keeps the bar hidden, Alt shows it) ---------- */
function menu() {
  const view = [
    { role: 'togglefullscreen', accelerator: mac ? 'Ctrl+Cmd+F' : 'F11' },
    { type: 'separator' },
    { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => main?.reload() },
    { label: 'Developer Tools', accelerator: mac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I', click: () => main?.webContents.toggleDevTools() },
    // (F3 opens it too, but a Mac's F3 is Mission Control unless fn is held)
    { label: 'Frame Lab', accelerator: 'CmdOrCtrl+Shift+L', click: () => main?.webContents.executeJavaScript("dispatchEvent(new Event('gs-framelab'))").catch(() => {}) },
  ];
  const tmpl = [
    ...(mac ? [{ role: 'appMenu' }] : [{ label: 'File', submenu: [{ role: 'quit' }] }]),
    { role: 'editMenu' },
    { label: 'View', submenu: view },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tmpl));
}

/* ---------- start ---------- */
// What the page may ask for: camera, microphone and motion sensors (games with a touch way round them), where you are (games
// that say so), full screen, holding the pointer, keeping the screen on, copying a share link.
const ALLOWED = new Set(['media', 'geolocation', 'geolocation-approximate', 'sensors', 'fullscreen', 'automatic-fullscreen', 'pointerLock', 'keyboardLock', 'screen-wake-lock', 'clipboard-sanitized-write', 'speaker-selection']);
const ours = url => { try { return new URL(url).origin === ORIGIN; } catch (_) { return false; } };

ipcMain.handle('gs:take-links', e => (e.sender === main?.webContents ? links.splice(0) : []));
// Heat and battery (src/kit/power.js asks every few seconds while a round is played): how warm macOS says the computer
// is (Linux: below), how far Windows or macOS has slowed the processor (the share of its full speed, after a change), and whether a
// laptop is on its battery. A fanless laptop (a MacBook Air) slows itself after some minutes of 3D; the engine steps
// down a little before, as it does on a phone.
let speedLimit = null;
// Linux says neither: there the chips' own temperatures are read (desktop/device.cjs linuxPower), as a headroom.
ipcMain.handle('gs:power', async e => {
  if (e.sender !== main?.webContents) return null;
  let thermal = 'unknown'; try { if (mac) thermal = powerMonitor.getCurrentThermalState(); } catch (_) { /* an older macOS */ }
  let battery = false; try { battery = powerMonitor.isOnBatteryPower(); } catch (_) { /* no battery here */ }
  if (process.platform !== 'linux') return { thermal, limit: speedLimit, battery, headroom: null, temp: null };
  try { const l = await linuxPower(); return { thermal, limit: null, battery: battery || l.battery, headroom: l.headroom, temp: l.temp, chip: l.chip }; } catch (_) { return { thermal, limit: null, battery, headroom: null, temp: null }; }
});
// Settings › Quit (a console's games mode is full screen with no window to close; the Steam menu's Exit Game works too)
ipcMain.handle('gs:quit', e => { if (e.sender === main?.webContents) app.quit(); });
// the graphics chip in use and its driver, for the phone and driver steering list (src/steer.js): a rule can name a
// driver version that misbehaves. Chromium's own basic list (quick: it doesn't start the full GPU survey)
ipcMain.handle('gs:gpu', async e => {
  if (e.sender !== main?.webContents) return null;
  try {
    const info = await app.getGPUInfo('basic'), list = info?.gpuDevice || [], d = list.find(x => x.active) || list[0];
    return d ? { vendorId: d.vendorId, deviceId: d.deviceId, driverVendor: String(d.driverVendor || ''), driverVersion: String(d.driverVersion || ''), name: String(d.deviceString || '') } : null;
  } catch (_) { return null; }
});

app.whenReady().then(() => {
  // https://localhost is the app's files; every other address goes out to the network untouched
  protocol.handle('https', req => (new URL(req.url).host === HOST ? serve(req) : net.fetch(req, { bypassCustomProtocolHandlers: true })));
  const s = session.defaultSession;
  s.setPermissionRequestHandler((_wc, perm, cb, d) => cb(ALLOWED.has(perm) && ours(d.requestingUrl)));
  s.setPermissionCheckHandler((_wc, perm, origin) => ALLOWED.has(perm) && ours(origin));
  powerMonitor.on('speed-limit-change', e => { speedLimit = e?.limit >= 0 && e.limit <= 100 ? e.limit : null; });
  menu();
  createWindow();
  // docked to a TV, or the games mode's resolution changed: draw to the new screen's size
  if (CONSOLE) screen.on('display-metrics-changed', () => { if (main && !main.isDestroyed()) main.webContents.setZoomFactor(consoleZoom()); });
  app.on('activate', () => { if (!main) createWindow(); else show(); });   // macOS: the Dock icon
});
app.on('window-all-closed', () => { app.quit(); });
