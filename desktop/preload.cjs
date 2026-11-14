// What the desktop app adds to the page: window.gsDesktop (read by src/desktop.js). Nothing else of
// Electron or Node reaches the page.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);
const os = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : process.platform;

// gamescroll:// links: the main process keeps them until asked, and nudges when one comes
let take = null;
const pull = () => { if (take) ipcRenderer.invoke('gs:take-links').then(urls => { for (const u of urls) try { take(u); } catch (_) { /* the page's own */ } }, () => {}); };
ipcRenderer.on('gs:links', pull);

contextBridge.exposeInMainWorld('gsDesktop', Object.freeze({
  /** 'mac' | 'windows' (| 'linux' in the tests) */
  os,
  arch: process.arch,
  /** the desktop app's version, e.g. '1.0.57' */
  version: arg('gs-version'),
  chrome: process.versions.chrome,
  electron: process.versions.electron,
  /** The graphics chip in use and its driver: a promise of { vendorId, deviceId, driverVendor, driverVersion, name } or null (src/steer.js). */
  gpuInfo: () => ipcRenderer.invoke('gs:gpu').catch(() => null),
  /** fn(url) for each gamescroll:// link the app is opened with, the one it started from included. */
  onOpenUrl(fn) { if (typeof fn === 'function') { take = fn; pull(); } },
}));
