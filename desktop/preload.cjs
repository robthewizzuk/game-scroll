// What the desktop app adds to the page: window.gsDesktop (read by src/desktop.js). Nothing else of
// Electron or Node reaches the page.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);
// the computer it runs on, from main.cjs (desktop/device.cjs): a games handheld, Steam's games mode
let device = null; try { device = JSON.parse(decodeURIComponent(arg('gs-device'))); } catch (_) { /* an older main */ }
const os = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : process.platform;

// gamescroll:// links: the main process keeps them until asked, and nudges when one comes
let take = null;
const pull = () => { if (take) ipcRenderer.invoke('gs:take-links').then(urls => { for (const u of urls) try { take(u); } catch (_) { /* the page's own */ } }, () => {}); };
ipcRenderer.on('gs:links', pull);

contextBridge.exposeInMainWorld('gsDesktop', Object.freeze({
  /** 'mac' | 'windows' | 'linux' */
  os,
  /**
   * Where it runs, where that changes how it plays: { handheld: { id, name, klass } | null (a ROG Ally, a Steam Deck...),
   * gamescope (Steam's games mode: SteamOS's Game Mode, Big Picture), steamos, steam (started by Steam), console (full
   * screen, drawn bigger, played with a controller), zoom (how much bigger), ignorePads (controllers Steam stands in
   * for: [{ vendor, product }]), webgl (--gs-webgl: no WebGPU) }, or null.
   */
  device: device ? Object.freeze(device) : null,
  arch: process.arch,
  /** the desktop app's version, e.g. '1.0.57' */
  version: arg('gs-version'),
  chrome: process.versions.chrome,
  electron: process.versions.electron,
  /** The graphics chip in use and its driver: a promise of { vendorId, deviceId, driverVendor, driverVersion, name } or null (src/steer.js). */
  gpuInfo: () => ipcRenderer.invoke('gs:gpu').catch(() => null),
  /** Heat and battery: a promise of { thermal: 'unknown' | 'nominal' | 'fair' | 'serious' | 'critical' (macOS), limit: the processor's speed limit in per cent after the system lowered it (macOS, Windows) or null, battery: on a laptop's or handheld's battery, headroom: Linux, the hottest chip's temperature on Android's headroom scale (0 cool, 1 where it slows itself) or null, temp: that chip's degrees C } or null (src/kit/power.js). */
  power: () => ipcRenderer.invoke('gs:power').catch(() => null),
  /** Closes the app (Settings › Quit, in a console's games mode). */
  quit: () => ipcRenderer.invoke('gs:quit').catch(() => {}),
  /** fn(url) for each gamescroll:// link the app is opened with, the one it started from included. */
  onOpenUrl(fn) { if (typeof fn === 'function') { take = fn; pull(); } },
}));
