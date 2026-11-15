// Live sliders for tuning a game while you play it. In `npm run dev` a small panel (lil-gui) shows the
// values of the game on screen; drag a slider and the game uses the new number on its next frame.
// "Copy values" puts them on the clipboard to paste back into the file. In the store apps and the
// test builds there is no panel: gs.tweak just hands back the starting values, so the call can stay.
//
//   const T = gs.tweak('Car', {
//     speed: 3,                    // a number: a slider from 0 to 3x it
//     grip: [.8, 0, 1, .01],       // [value, min, max, step]
//     lift: [2, 0, 5, 'how high it hops'],  // [value, min, max, step?, what it does]: the words show on the slider
//     drift: true,                 // a tick box
//     paint: '#ff8800',            // a colour
//     mode: ['easy', 'easy', 'hard'], // [value, ...choices] for a list (strings)
//   });
//   update(dt) { car.x += T.speed * dt; }   // read T.x where it's used, so a slider change shows at once
//
// Call it in make() (or reset()). Values you changed survive hot reload; change the number in the
// file and the file's number wins again.
//
// Knobs: a game keeps the numbers that set how it feels in one block, gs.tweak('Feel', { ... }), so a change
// asked for in words ("slower fish", "a floatier jump") is one number (docs/feel-words.md). The panel's
// "Save to file" writes the sliders' values back into the game's file (the dev server does it:
// vite.config.js, scripts/lib/knobs.mjs). Test builds can read and set knobs with knobs() and setKnobs()
// (__gs.knobs, __gs.setKnobs), so a test can play the same game with a knob changed; in the store apps
// nothing sets them and gs.tweak hands back the file's values, as before.

import { currentOwner, own } from './cleanup.js';

const DEV = !!(import.meta.env && import.meta.env.DEV);

const isRange = v => Array.isArray(v) && typeof v[0] === 'number';
const saysOf = v => (isRange(v) && typeof v[v.length - 1] === 'string' ? v[v.length - 1] : '');
const nums = v => v.filter(x => typeof x === 'number');   // [value, min, max, step?] without the words
const isList = v => Array.isArray(v) && typeof v[0] === 'string';
const startOf = v => (Array.isArray(v) ? v[0] : v);

// game id + folder -> { values, from: the file's starting values }: kept across hot reloads
const kept = new Map();
// card -> { gui, folders } and the card on screen
const panels = new Map();
let shown = null, lib = null;
// game id + folder -> { id, name, spec, values, all }: the values each game read last (every build), with every
// copy still in use (a card can be made more than once: the one in the feed, the one being played), and the
// values a test set (setKnobs), which the next gs.tweak call starts from
const live = new Map(), set = new Map();
const track = (key, entry) => {
  const old = live.get(key), all = (old?.all || []).filter(r => r.deref()).slice(-15);
  if (!all.some(r => r.deref() === entry.values)) all.push(new WeakRef(entry.values));
  live.set(key, { ...entry, all });
};

/** Starting values from spec; in dev builds also a panel of sliders for them. */
export function tweak(name, spec) {
  if (typeof name !== 'string') { spec = name; name = 'Tweaks'; }
  spec = spec || {};
  const from = {}; for (const [k, v] of Object.entries(spec)) from[k] = startOf(v);
  const card = currentOwner(), id = card?.def?.id || '?', key = id + '/' + name;
  if (!DEV) {
    const values = { ...from, ...set.get(key) };
    track(key, { id, name, spec, values });
    return values;
  }

  let k = kept.get(key);
  if (!k) kept.set(key, k = { values: { ...from }, from: { ...from } });
  for (const [f, v] of Object.entries(from)) {   // the file changed this one (or it's new): the file wins
    if (!(f in k.values) || k.from[f] !== v) k.values[f] = v;
  }
  for (const f of Object.keys(k.values)) if (!(f in from)) delete k.values[f];
  k.from = { ...from };
  Object.assign(k.values, set.get(key));
  track(key, { id, name, spec, values: k.values });
  if (card) addFolder(card, name, spec, k.values);
  return k.values;
}

function addFolder(card, name, spec, values) {
  let p = panels.get(card);
  if (!p) {
    panels.set(card, p = { folders: [], gui: null, free() { p.gui?.destroy(); p.gui = null; panels.delete(card); } });
    own(p);
  }
  const old = p.folders.findIndex(f => f.name === name);
  if (old >= 0) p.folders.splice(old, 1);
  p.folders.push({ name, spec, values });
  if (p.gui) build(card, p); else if (shown === card) show(card);
}

async function build(card, p) {
  lib ||= import('lil-gui').then(m => m.default || m.GUI);
  const GUI = await lib;
  if (!panels.has(card)) return;
  p.gui?.destroy();
  const gui = p.gui = new GUI({ title: '🎚 ' + (card.def?.title || 'Tweaks'), width: 240 });
  gui.domElement.style.cssText += ';position:fixed;top:8px;right:8px;z-index:9999;max-height:80vh;overflow:auto';
  for (const { name, spec, values } of p.folders) {
    const f = p.folders.length > 1 ? gui.addFolder(name) : gui;
    for (const [k, v] of Object.entries(spec)) {
      if (typeof v === 'function') { f.add({ [k]: v }, k); continue; }
      if (isRange(v)) { const [, lo, hi, step] = nums(v), c = f.add(values, k, lo, hi, step); if (saysOf(v)) c.domElement.title = saysOf(v); continue; }
      if (isList(v)) { f.add(values, k, v.slice(1)); continue; }
      if (typeof v === 'number') {
        const lo = v < 0 ? v * 3 : 0, hi = v > 0 ? v * 3 : v < 0 ? 0 : 1;
        f.add(values, k, lo, hi, Math.abs(hi - lo) / 300 || .01); continue;
      }
      if (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v)) { f.addColor(values, k); continue; }
      f.add(values, k);
    }
  }
  gui.add({ 'Copy values': () => copy(p) }, 'Copy values');
  gui.add({ 'Save to file': () => save(card, p, gui) }, 'Save to file');
  gui.domElement.style.display = shown === card ? '' : 'none';
}

function copy(p) {
  const text = p.folders.map(({ name, spec, values }) => `gs.tweak('${name}', {\n` + Object.entries(spec).map(([k, v]) => {
    const x = values[k];
    const val = isRange(v) ? `[${[+x.toFixed(4), ...v.slice(1)].map(e => typeof e === 'string' ? `'${e.replace(/'/g, "\\'")}'` : e).join(', ')}]` : isList(v) ? JSON.stringify([x, ...v.slice(1)]) : typeof v === 'function' ? null : JSON.stringify(typeof x === 'number' ? +x.toFixed(4) : x);
    return val == null ? null : `  ${/^[a-z_$][\w$]*$/i.test(k) ? k : JSON.stringify(k)}: ${val},`;
  }).filter(Boolean).join('\n') + '\n});').join('\n');
  console.info(text);
  navigator.clipboard?.writeText(text).catch(() => {});
}

// Writes the panel's values into src/games/<id>.js through the dev server (the game then hot reloads with the
// file's numbers, which are now the sliders'). Works from a phone on the dev server too.
async function save(card, p, gui) {
  const id = card.def?.id, changes = {};
  for (const { name, spec, values } of p.folders) for (const k of Object.keys(spec)) if (typeof spec[k] !== 'function') changes[name + '.' + k] = values[k];
  const btn = gui.controllers.find(c => c.property === 'Save to file');
  try {
    const r = await fetch('/__gs/knobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, changes }) });
    const out = await r.json(); if (!r.ok) throw new Error(out.error || r.status);
    btn?.name(out.changed.length ? `Saved ${out.changed.length} to file` : 'Nothing changed'); console.info('knobs saved', out);
  } catch (e) { btn?.name('Save failed'); console.warn('knobs: could not save to the file', e); }
  setTimeout(() => btn?.name('Save to file'), 2500);
}

/** Every game's knobs as it read them last: [{ game, folder, key, value, from, min, max, step, says, choices }] (id: one game). */
export function knobs(id) {
  const out = [];
  for (const { id: game, name, spec, values } of live.values()) {
    if (id && game !== id) continue;
    for (const [k, v] of Object.entries(spec)) {
      if (typeof v === 'function') continue;
      const r = isRange(v) ? nums(v) : null;
      out.push({ game, folder: name, key: k, value: values[k], from: startOf(v), says: saysOf(v) || undefined,
        ...(r ? { min: r[1], max: r[2], step: r[3] } : typeof v === 'number' ? { min: v < 0 ? v * 3 : 0, max: v > 0 ? v * 3 : 1 } : {}),
        ...(isList(v) ? { choices: v.slice(1) } : {}) });
    }
  }
  return out;
}

/** Sets knobs for a game: { 'Feel.speed': 2 } (or { speed: 2 } for its only block). The values it reads now change at
 *  once and its next gs.tweak call (a new round's reset(), a remade game) starts from them. null clears what was set. */
export function setKnobs(id, values) {
  if (values == null) { for (const k of [...set.keys()]) if (k.startsWith(id + '/')) set.delete(k); return knobs(id); }
  for (const [name, v] of Object.entries(values)) {
    let [folder, k] = name.includes('.') ? name.split('.') : [null, name];
    if (!folder) folder = [...live.values()].find(e => e.id === id && k in e.spec)?.name || 'Feel';
    const key = id + '/' + folder;
    set.set(key, { ...set.get(key), [k]: v });
    const l = live.get(key);
    if (l && k in l.values) for (const r of l.all) { const o = r.deref(); if (o) o[k] = v; }
  }
  return knobs(id);
}

/** The app calls this when a card comes on screen: only its panel shows. */
export function show(card) {
  if (!DEV) return;
  shown = card;
  for (const [c, p] of panels) {
    if (c === card && !p.gui) build(c, p);
    if (p.gui) p.gui.domElement.style.display = c === card ? '' : 'none';
  }
}
