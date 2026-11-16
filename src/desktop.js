// The Mac, Windows and Linux app (desktop/, Electron) or null: in the phone apps and a browser.
//   desktop.os       'mac' | 'windows' | 'linux'
//   desktop.version  the desktop app's version, e.g. '1.0.57'
//   desktop.onOpenUrl(fn)  gamescroll:// links the app is opened with (src/share.js)
//   desktop.gpuInfo()  a promise of the graphics chip in use and its driver ({ vendorId, deviceId, driverVendor,
//                    driverVersion, name }, or null): the steering list's driver ranges (src/steer.js)
//   desktop.device   where it runs (desktop/device.cjs): { handheld, gamescope, steamos, steam, console, zoom, ignorePads, webgl } or null
//   desktop.quit()   closes the app (Settings, in a console's games mode)
// The engine reads it where a computer differs from a phone (src/kit/speed.js, src/kit/hd3d.js): no
// heat to keep down, screens of 144 Hz and more, and graphics chips named the way desktop browsers name them.
export const desktop = (typeof globalThis !== 'undefined' && globalThis.gsDesktop) || null;
/**
 * A games handheld (a ROG Ally, a Steam Deck, a Legion Go...): { id, name, klass } or null. It runs on a battery and
 * warms in the hands, so the engine plays 3D games on it as it does on a phone (src/kit/speed.js, src/kit/hd3d.js):
 * 60 frames a second with nothing made between, 30 with GSFG making the other 30 where it can't hold 60, never
 * above the high tier; its class comes from the model (an AMD handheld's chip says only "AMD Radeon Graphics").
 */
export const handheld = desktop?.device?.handheld || null;
/** A console's games mode (SteamOS's Game Mode, Steam Big Picture, a handheld): full screen, played with a controller. */
export const consoleMode = !!desktop?.device?.console;
