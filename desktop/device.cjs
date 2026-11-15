// Which computer the desktop app runs on, where that changes how it plays: a games handheld (ROG Ally, Steam Deck,
// Legion Go...), and whether it is in a console's games mode (SteamOS's Game Mode, Steam Big Picture: gamescope).
// Read once at start by main.cjs, from the computer's own name for itself (Linux: /sys/class/dmi/id, the
// processor's name in /proc/cpuinfo) and the environment Steam starts it in. The page gets the answer as
// gsDesktop.device (preload.cjs, src/desktop.js). Pure where it can be: handheldOf() and the rest are checked by
// scripts/kit-test.mjs.
'use strict';
const fs = require('node:fs');

// Games handhelds, by the maker's name for the model (DMI product_name / board_name). klass: where the engine starts
// it (src/kit/speed.js), from its graphics chip:
//   top  Radeon 780M / 880M / 890M class (Z1 Extreme, Z2 Extreme, Ryzen 7 8840U): about a top phone's graphics, or more at 25 W
//   mid  Steam Deck class (Van Gogh, Z2 A, Z1): about half that
// (the processor's name decides where one model came with two: the first ROG Ally, Z1 or Z1 Extreme)
const HANDHELDS = [
  { id: 'rog-xbox-ally-x', name: 'ROG Xbox Ally X', match: /RC73XA/i, klass: 'top' },
  { id: 'rog-xbox-ally', name: 'ROG Xbox Ally', match: /RC73YA/i, klass: 'mid' },
  { id: 'rog-ally-x', name: 'ROG Ally X', match: /RC72L|ROG Ally X/i, klass: 'top' },
  { id: 'rog-ally', name: 'ROG Ally', match: /RC71L|ROG Ally/i, klass: cpu => /Z1 Extreme/i.test(cpu) || !/\bZ1\b/i.test(cpu) ? 'top' : 'mid' },
  { id: 'steam-deck-oled', name: 'Steam Deck OLED', match: /^Galileo$/i, vendor: /Valve/i, klass: 'mid' },
  { id: 'steam-deck', name: 'Steam Deck', match: /^Jupiter$/i, vendor: /Valve/i, klass: 'mid' },
  { id: 'legion-go-s', name: 'Legion Go S', match: /^83(L3|N6|Q2|Q3)$/i, vendor: /LENOVO/i, klass: cpu => /Z2 Go/i.test(cpu) ? 'mid' : 'top' },
  { id: 'legion-go-2', name: 'Legion Go 2', match: /^83(N0|N1)$/i, vendor: /LENOVO/i, klass: 'top' },
  { id: 'legion-go', name: 'Legion Go', match: /^83E1$/i, vendor: /LENOVO/i, klass: 'top' },
  { id: 'msi-claw', name: 'MSI Claw', match: /^Claw/i, vendor: /Micro-Star|MSI/i, klass: cpu => /Ultra \d 2\d\dV/i.test(cpu) ? 'top' : 'mid' },
];
// A handheld not in the list, by its processor alone (a handheld maker's own name for it: OneXPlayer, GPD, AYANEO):
// only chips that are made for handhelds, so a laptop is never taken for one
const HANDHELD_CPU = [[/Z2 Extreme|Z1 Extreme/i, 'top'], [/Z2 Go|\bZ2 A\b|\bZ1\b|Custom APU 0405|Custom APU 0932/i, 'mid']];

/** The handheld these facts name, or null (pure). facts: { vendor, product, board, cpu } as the computer gives them. */
function handheldOf(f = {}) {
  const name = `${f.product || ''} ${f.board || ''}`.trim(), cpu = f.cpu || '';
  for (const h of HANDHELDS) {
    const hit = [f.product, f.board].some(s => s && h.match.test(String(s).trim()));
    if (!hit || h.vendor && !h.vendor.test(f.vendor || '')) continue;
    return { id: h.id, name: h.name, klass: typeof h.klass === 'function' ? h.klass(cpu) : h.klass };
  }
  for (const [re, klass] of HANDHELD_CPU) if (re.test(cpu)) return { id: 'handheld', name: name || 'Games handheld', klass };
  return null;
}

/** Steam's games mode (gamescope: SteamOS's Game Mode, Big Picture on a Linux desktop), from the environment (pure). */
const gamescopeIn = env => env.XDG_CURRENT_DESKTOP === 'gamescope' || !!env.GAMESCOPE_WAYLAND_DISPLAY || env.SteamGamepadUI === '1';

/**
 * The controllers Steam stands in for (SDL_GAMECONTROLLER_IGNORE_DEVICES: "0x045e/0x028e,0x0b05/0x1abe"): Steam Input
 * reads the handheld's own buttons and hands games a controller of its own, and tells games built on SDL to leave the
 * real one alone. A browser reads every controller the system has, so the page leaves them out itself (src/kit/gamepad.js),
 * or each press would come twice. [{ vendor: '0b05', product: '1abe' }] (pure).
 */
function ignoredPads(v = '') {
  const out = [];
  for (const p of String(v).split(',')) { const m = /^\s*(?:0x)?([0-9a-f]{1,4})\/(?:0x)?([0-9a-f]{1,4})\s*$/i.exec(p); if (m) out.push({ vendor: m[1].toLowerCase().padStart(4, '0'), product: m[2].toLowerCase().padStart(4, '0') }); }
  return out;
}

/**
 * How much bigger the app is drawn in a console's games mode (pure): the screen's height over 640 (the Steam Deck's
 * 800 lines drawn 1.25 times, as Valve's own browser shortcut does; a 1080p handheld or TV 1.75 times), in quarter
 * steps, 1 to 3. The feed lays itself out to the window, so this is how big its text and buttons are to read from a
 * hand's length or a sofa.
 */
function zoomFor(height) {
  if (!(height > 0)) return 1;
  return Math.max(1, Math.min(3, Math.round(height / 640 * 4) / 4));
}

const read = p => { try { return fs.readFileSync(p, 'utf8').trim(); } catch (_) { return ''; } };
/** This computer (Linux: its DMI names, its processor, its system, Steam's environment). */
function thisDevice(env = process.env, platform = process.platform) {
  if (platform !== 'linux') return { handheld: null, gamescope: false, steamos: false, steam: !!env.SteamGameId, ignorePads: [] };
  const dmi = n => read(`/sys/class/dmi/id/${n}`);
  const facts = { vendor: dmi('sys_vendor'), product: dmi('product_name'), board: dmi('board_name'), cpu: (/^model name\s*:\s*(.+)$/m.exec(read('/proc/cpuinfo')) || [])[1] || '' };
  const osr = read('/etc/os-release'), steamos = /^ID=["']?steamos/m.test(osr) || /^ID_LIKE=.*steamos/m.test(osr);
  // (a test can stand in for a handheld: GS_HANDHELD=<product name>, only while working on the app)
  if (env.GS_HANDHELD) Object.assign(facts, { product: env.GS_HANDHELD, board: '', vendor: env.GS_HANDHELD_VENDOR || facts.vendor, cpu: env.GS_HANDHELD_CPU || facts.cpu });
  return { handheld: handheldOf(facts), gamescope: gamescopeIn(env), steamos, steam: !!(env.SteamGameId || env.SteamAppId), ignorePads: ignoredPads(env.SDL_GAMECONTROLLER_IGNORE_DEVICES) };
}

module.exports = { handheldOf, gamescopeIn, ignoredPads, zoomFor, thisDevice, HANDHELDS };
