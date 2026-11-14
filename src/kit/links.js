// What a game makes finds the rest of what it made. A kit that has something others can use (a wind, the weather,
// a physics world, the land, a sea, the ears) joins its game's set as it is made; a kit that could use one looks it
// up each frame when its own option was left out. So a game that makes a Wind, a Weather, a Cloth and a Sea gets a
// wind that slants the rain, flies the flags and raises the swell, with nothing to wire:
//
//   make() { wind = new Wind({ x: 6 }); world = new World3D(); weather = new Weather(view); cloth = new Cloth(view); }
//
// The rules, the same in every kit:
//   - what a game passes wins (wind: myWind), and `false` keeps a kit to itself (wind: false; link: false for all of it)
//   - a set belongs to one card (whatever its make() and reset() made), or to one view for things made outside a
//     card (a test, a lab page); things with neither find nothing, as before
//   - the newest of a kind is the one found; kinds there can be several of (water, smoke, liquid, buildings that
//     come apart, people who react) are all told
//   - a link is something the world does (wind on cloth, rain on water, a blast through smoke), never a rule of
//     the game (who is hurt, what scores): those stay the game's
// Not for games: they get this through the kits on gs.

import { currentOwner, onRelease, ownedBy } from './cleanup.js';

const sets = new WeakMap();   // a card, or a view made outside one -> its Links
const NONE = Object.freeze([]);
const MANY = new Set(['water', 'gas', 'fluid', 'structure', 'reactions', 'explosives']);   // kinds a game may have several of
const refOf = typeof WeakRef === 'function' ? x => new WeakRef(x) : x => ({ deref: () => x });

export class Links {
  constructor() { this.single = Object.create(null); this.many = Object.create(null); this.live = Object.create(null); this.told = false; }
  /** Adds a thing others can find: the newest of a kind is the one found (kinds in MANY keep them all, held weakly). */
  join(kind, thing) {
    if (!MANY.has(kind)) { this.single[kind] = thing; return this; }
    const l = this.many[kind] ||= [];
    if (!l.some(r => r.deref() === thing)) { l.push(refOf(thing)); this.live[kind] = null; }
    return this;
  }
  /** Takes a thing out again (its dispose()). */
  leave(thing) {
    for (const k in this.single) if (this.single[k] === thing) this.single[k] = null;
    for (const k in this.many) { const l = this.many[k], i = l.findIndex(r => r.deref() === thing); if (i >= 0) { l.splice(i, 1); this.live[k] = null; } }
    return this;
  }
  /** The newest of a kind, or null (of a kind there can be several of: the last one made that is still about). */
  one(kind) { if (!MANY.has(kind)) return this.single[kind] ?? null; const l = this.all(kind); return l.length ? l[l.length - 1] : null; }
  /** Every live thing of a kind there can be several of (a list to read, not to keep). */
  all(kind) {
    const l = this.many[kind]; if (!l) return NONE;
    let out = this.live[kind];
    if (out) { for (const r of l) if (!r.deref()) { out = null; break; } }
    if (!out) { out = []; for (let i = l.length - 1; i >= 0; i--) { const x = l[i].deref(); if (x) out.unshift(x); else l.splice(i, 1); } this.live[kind] = out; }
    return out;
  }
}

/**
 * The set for something being made now: the card's whose make() or reset() is running, else the view's it was
 * given, else null (`on` false: null, the kit keeps to itself). Kits keep it (`this.links`) and ask it as they run.
 */
export function linksFor(view = null, on = true) {
  if (on === false) return null;
  const owner = currentOwner();
  if (owner) {
    let s = sets.get(owner);
    if (!s) { sets.set(owner, s = new Links()); onRelease(() => sets.delete(owner)); }   // (a card's set goes with the card, and with a pass of making that was dropped)
    if (view && typeof view === 'object') sets.set(view, s);
    return s;
  }
  if (!view || typeof view !== 'object') return null;
  let s = sets.get(view); if (!s) sets.set(view, s = new Links());
  return s;
}

/** A kit's own option, or what the set has: given (anything but null or undefined) wins, false is "none". */
export const linked = (given, links, kind) => given === false ? null : given ?? links?.one(kind) ?? null;

/** The set for something that happens to a mesh during play (a thing shattered in update()): its scene's view's, which is its card's. */
export function linksOf(obj) { let top = obj; while (top?.parent) top = top.parent; return top?.gsView ? linksFor(top.gsView) : linksFor(null); }

/** Run fn with a set of its own (tests, lab pages): what it makes finds each other and nothing else. */
export const together = fn => ownedBy({}, fn);
