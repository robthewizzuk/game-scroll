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
const { app, BrowserWindow, Menu, ipcMain, net, protocol, screen, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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
// Windows guesses when a window is covered and stops drawing it; overlays and some screen setups fool it
// into freezing a window that is in plain view. (Minimised windows still stop.)
if (win32) sw('disable-features', 'CalculateNativeWinOcclusion');
// Linux is only for the tests (scripts/desktop-test.cjs): WebGPU there is still behind a switch.
if (process.platform === 'linux') { sw('enable-unsafe-webgpu'); sw('enable-features', 'Vulkan'); }

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
async function serve(req) {
  const u = new URL(req.url);
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405 });
  let rel; try { rel = decodeURIComponent(u.pathname); } catch (_) { return notFound(); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(WEB, path.normalize(rel));
  if (!file.startsWith(WEB + path.sep)) return notFound();   // (nothing outside the app's own files)
  let st; try { st = await fs.promises.stat(file); } catch (_) { return notFound(); }
  if (!st.isFile()) return notFound();
  const r = await net.fetch(pathToFileURL(file).toString());   // (streamed from the app's archive)
  // the bundles carry their content's hash in their names, so the code cache can keep them; the page itself is read fresh
  return new Response(req.method === 'HEAD' ? null : r.body, {
    status: 200,
    headers: { 'Content-Type': typeOf(file), 'Content-Length': String(st.size), 'Cache-Control': /\/assets\//.test(rel) ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff' },
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
function show() { if (!main) return; if (main.isMinimized()) main.restore(); main.show(); main.focus(); }

function createWindow() {
  const st = readState(), area = screen.getPrimaryDisplay().workAreaSize;
  // first run: most of the screen (the feed lays itself out to any window; Next Gen games fill a wide one)
  const h = Math.round(Math.min(1000, area.height * .88)), w = Math.round(Math.min(area.width * .88, h * 1.45));
  const b = onScreen(st?.bounds) ? st.bounds : { width: w, height: h };
  main = new BrowserWindow({
    ...b, minWidth: 380, minHeight: 600, show: false, title: 'Game Scroll', backgroundColor: '#0c0e12',
    autoHideMenuBar: true, fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true,
      spellcheck: false, enableWebSQL: false, navigateOnDragDrop: false,
      backgroundThrottling: true,   // (a hidden window stops drawing: the app pauses its round then anyway)
      v8CacheOptions: 'bypassHeatCheck',   // keep compiled code for the app's scripts from the first run (faster starts)
      additionalArguments: [`--gs-version=${app.getVersion()}`],
    },
  });
  if (st?.maximized) main.maximize();
  if (st?.fullScreen) main.setFullScreen(true);
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

app.whenReady().then(() => {
  // https://localhost is the app's files; every other address goes out to the network untouched
  protocol.handle('https', req => (new URL(req.url).host === HOST ? serve(req) : net.fetch(req, { bypassCustomProtocolHandlers: true })));
  const s = session.defaultSession;
  s.setPermissionRequestHandler((_wc, perm, cb, d) => cb(ALLOWED.has(perm) && ours(d.requestingUrl)));
  s.setPermissionCheckHandler((_wc, perm, origin) => ALLOWED.has(perm) && ours(origin));
  menu();
  createWindow();
  app.on('activate', () => { if (!main) createWindow(); else show(); });   // macOS: the Dock icon
});
app.on('window-all-closed', () => { app.quit(); });
