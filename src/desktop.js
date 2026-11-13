// The Mac and Windows app (desktop/, Electron) or null: in the phone apps and a browser.
//   desktop.os       'mac' | 'windows' ('linux' only in the tests)
//   desktop.version  the desktop app's version, e.g. '1.0.57'
//   desktop.onOpenUrl(fn)  gamescroll:// links the app is opened with (src/share.js)
// The engine reads it where a computer differs from a phone (src/kit/speed.js, src/kit/hd3d.js): no
// heat to keep down, screens of 144 Hz and more, and graphics chips named the way desktop browsers name them.
export const desktop = (typeof globalThis !== 'undefined' && globalThis.gsDesktop) || null;
