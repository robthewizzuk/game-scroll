// Inventories and crafting: a grid of slots holding stacks (pick up, split, merge, swap, sort, equip
// slots that only take some things) and a recipe book (what can I make from what I carry, what's
// missing, make it now or over a few seconds at a station). Your game draws the slots and items.
//
//   const { Inventory, Recipes } = gs.items;
//   const ITEMS = { wood: { stack: 20 }, stone: { stack: 20 }, axe: { stack: 1, kind: 'tool' }, hat: { stack: 1, kind: 'head' } };
//   reset() {
//     inv = new Inventory(ITEMS, { slots: 12, extra: { hand: 'tool', head: 'head' } });   // 12 slots + 2 equip slots
//     inv.add('wood', 5);
//     book = new Recipes(ITEMS).add('axe', { wood: 3, stone: 2 }).add('plank', { wood: 1 }, { makes: 4 })
//       .add('lamp', { glass: 1, oil: 1 }, { at: 'bench', time: 3, keep: ['hammer'] });
//   }
//   craftButton(id) { if (book.make(id, inv)) feel.coin(...); else show(book.missing(id, inv)); }
//   draw(c) { inv.slots.forEach((s, i) => drawSlot(i, s)); /* s: { id, n } or null */ }
//
// Moving things by hand: inv.move(from, to, n) between slot numbers (equip slots by name: 'hand'),
// merging the same thing, swapping different things, and refusing what doesn't fit an equip slot.
// book.can(inv) lists what can be made now; book.timer (with time:) makes things over seconds.

import { linksFor } from './links.js';

/** A stack in a slot: { id, n }. */
export class Inventory {
  /** defs: { id: { stack, kind, weight } }; slots: how many; extra: { name: kind } equip slots taking only that kind; stack: default most per slot; weight: most total weight (Infinity). */
  constructor(defs = {}, { slots = 20, extra = {}, stack = 99, weight = Infinity, link = true } = {}) {
    linksFor(null, link)?.join('inventory', this);   // (a gs.rpg Growth, Quests or Talk made in the same game finds it)
    this.defs = defs; this.stack = stack; this.maxWeight = weight;
    this.slots = Array(slots).fill(null); this.extra = extra; this.equip = Object.fromEntries(Object.keys(extra).map(k => [k, null]));
    this.handlers = {};
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  def(id) { return this.defs[id] || {}; }
  most(id) { return this.def(id).stack ?? this.stack; }
  /** How many of id there are (equip slots too). */
  count(id) { let n = 0; for (const s of this.all()) if (s.id === id) n += s.n; return n; }
  has(id, n = 1) { return this.count(id) >= n; }
  /** Every stack: [{ id, n }] (slots then equip slots). */
  all() { return [...this.slots, ...Object.values(this.equip)].filter(Boolean); }
  get weight() { return this.all().reduce((w, s) => w + (this.def(s.id).weight || 0) * s.n, 0); }
  get free() { return this.slots.filter(s => !s).length; }
  /** Adds n of id (topping up stacks first, then empty slots). Returns how many didn't fit. */
  add(id, n = 1) {
    const want = n, most = this.most(id), w = this.def(id).weight || 0;
    if (w > 0) n = Math.min(n, Math.floor((this.maxWeight - this.weight) / w + 1e-9));
    let left = n;
    for (const s of this.slots) if (left > 0 && s?.id === id && s.n < most) { const put = Math.min(left, most - s.n); s.n += put; left -= put; }
    for (let i = 0; i < this.slots.length && left > 0; i++) if (!this.slots[i]) { const put = Math.min(left, most); this.slots[i] = { id, n: put }; left -= put; }
    const added = n - left, over = want - added;
    if (added > 0) this.emit('add', id, added);
    if (over > 0) this.emit('full', id, over);
    return over;
  }
  /** Takes n of id (from the last stacks first). False (and takes nothing) when there aren't enough. */
  take(id, n = 1) {
    if (!this.has(id, n)) return false;
    let left = n;
    const fromList = (get, set, keys) => { for (const k of keys) { const s = get(k); if (left > 0 && s?.id === id) { const t = Math.min(left, s.n); s.n -= t; left -= t; if (!s.n) set(k, null); } } };
    fromList(i => this.slots[i], (i, v) => { this.slots[i] = v; }, [...this.slots.keys()].reverse());
    fromList(k => this.equip[k], (k, v) => { this.equip[k] = v; }, Object.keys(this.equip));
    this.emit('take', id, n);
    return true;
  }
  /** The stack at a slot number or equip slot name. */
  at(where) { return typeof where === 'number' ? this.slots[where] : this.equip[where] ?? null; }
  put(where, s) { if (typeof where === 'number') this.slots[where] = s; else this.equip[where] = s; }
  /** Whether a stack may go into a place (equip slots take only their kind, one at a time). */
  fits(s, where) { if (!s) return true; if (typeof where === 'number') return where >= 0 && where < this.slots.length; return where in this.extra && this.def(s.id).kind === this.extra[where]; }
  /** Moves n (all) from one place to another: merges the same thing, swaps different things. Returns whether it moved. */
  move(from, to, n = Infinity) {
    const a = this.at(from), b = this.at(to); if (!a || from === to) return false;
    const most = typeof to === 'number' ? this.most(a.id) : 1;
    if (b && b.id === a.id) {   // merge
      const put = Math.min(n, a.n, most - b.n); if (put <= 0) return false;
      b.n += put; a.n -= put; if (!a.n) this.put(from, null);
    } else if (b) {             // swap (only whole stacks, and both must fit)
      if (n < a.n || !this.fits(a, to) || !this.fits(b, from) || a.n > most) return false;
      this.put(from, b); this.put(to, a);
    } else {                    // into an empty place
      const put = Math.min(n, a.n, most); if (!this.fits(a, to) || put <= 0) return false;
      this.put(to, { id: a.id, n: put }); a.n -= put; if (!a.n) this.put(from, null);
    }
    this.emit('move', from, to);
    return true;
  }
  /** Splits half a stack (rounded down) into the first empty slot. Returns the new slot number or -1. */
  split(from) { const s = this.at(from), i = this.slots.indexOf(null); if (!s || s.n < 2 || i < 0) return -1; const h = Math.floor(s.n / 2); s.n -= h; this.slots[i] = { id: s.id, n: h }; this.emit('move', from, i); return i; }
  /** Merges stacks of the same thing and sorts the slots (by: (a, b) => number; default by kind, then id). */
  sort(by = null) {
    const totals = new Map(); for (const s of this.slots) if (s) totals.set(s.id, (totals.get(s.id) || 0) + s.n);
    const ids = [...totals.keys()].sort(by || ((a, b) => String(this.def(a).kind || '').localeCompare(String(this.def(b).kind || '')) || a.localeCompare(b)));
    this.slots.fill(null); let i = 0;
    for (const id of ids) for (let left = totals.get(id); left > 0 && i < this.slots.length; i++) { const put = Math.min(left, this.most(id)); this.slots[i] = { id, n: put }; left -= put; }
    this.emit('sort');
    return this;
  }
  /** Plain data for api.save, and back. */
  save() { return { s: this.slots.map(s => s && [s.id, s.n]), e: Object.fromEntries(Object.entries(this.equip).map(([k, s]) => [k, s && [s.id, s.n]])) }; }
  load(d) {
    if (!d) return this;
    this.slots = this.slots.map((_, i) => d.s?.[i] ? { id: d.s[i][0], n: d.s[i][1] } : null);
    for (const k of Object.keys(this.equip)) this.equip[k] = d.e?.[k] ? { id: d.e[k][0], n: d.e[k][1] } : null;
    return this;
  }
}

/** Anything with count(id) / take(id, n) / add(id, n): an Inventory, or gs.battle's Bag. */
const countIn = (inv, id) => inv.count(id);

export class Recipes {
  constructor(defs = {}) { this.defs = defs; this.list = []; this.byId = new Map(); this.timer = new Timer(this); }
  /** A recipe: id made from needs { id: n }. o: { makes: how many (1), keep: [tools needed but not used up], at: a station name, time: seconds (0: at once), name }. */
  add(id, needs, { makes = 1, keep = [], at = null, time = 0, name = id } = {}) {
    const r = { id, needs, makes, keep, at, time, name };
    this.list.push(r); (this.byId.get(id) || this.byId.set(id, []).get(id)).push(r);
    return this;
  }
  /** The first recipe for id that can be made (or the first one at all). */
  recipe(id, inv = null, at = null) { const rs = this.byId.get(id) || []; return (inv && rs.find(r => this.ok(r, inv, at))) || rs[0] || null; }
  ok(r, inv, at = null) {
    if (r.at && r.at !== at) return false;
    for (const t of r.keep) if (countIn(inv, t) < 1) return false;
    for (const [k, n] of Object.entries(r.needs)) if (countIn(inv, k) < n) return false;
    return true;
  }
  /** What's missing to make id: { id: n short } (empty when it can be made). at: the station the player is at. */
  missing(id, inv, at = null) {
    const r = this.recipe(id, inv, at); if (!r) return null;
    const out = {};
    for (const t of r.keep) if (countIn(inv, t) < 1) out[t] = 1;
    for (const [k, n] of Object.entries(r.needs)) { const have = countIn(inv, k); if (have < n) out[k] = n - have; }
    if (r.at && r.at !== at) out['@' + r.at] = 1;
    return out;
  }
  /** Every recipe that can be made now from inv (at a station). */
  can(inv, at = null) { return this.list.filter(r => this.ok(r, inv, at)); }
  /** How many times id could be made in a row from inv. */
  times(id, inv, at = null) { const r = this.recipe(id, inv, at); if (!r || !this.ok(r, inv, at)) return 0; let n = Infinity; for (const [k, need] of Object.entries(r.needs)) n = Math.min(n, Math.floor(countIn(inv, k) / need)); return n === Infinity ? 99 : n; }
  /** Recipes that use an item (what is this for?). */
  uses(item) { return this.list.filter(r => item in r.needs || r.keep.includes(item)); }
  /** Makes id now: takes what it needs, adds what it makes. Returns the recipe, or null (and takes nothing). A recipe with time goes to book.timer instead. */
  make(id, inv, at = null) {
    const r = this.recipe(id, inv, at); if (!r || !this.ok(r, inv, at)) return null;
    for (const [k, n] of Object.entries(r.needs)) inv.take(k, n);
    if (r.time > 0) { this.timer.start(r, inv); return r; }
    inv.add(r.id, r.makes);
    return r;
  }
}

/** Things being made over time (recipes with time:): book.timer.update(dt) each frame; jobs: [{ recipe, left, inv }]. */
class Timer {
  constructor(book) { this.book = book; this.jobs = []; this.handlers = {}; this.max = Infinity; }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  start(recipe, inv) { this.jobs.push({ recipe, left: recipe.time, inv }); }
  /** 0..1 for each job, for drawing a bar. */
  progress(job) { return 1 - job.left / job.recipe.time; }
  update(dt) {
    for (const j of this.jobs.slice()) {
      j.left -= dt; if (j.left > 0) continue;
      this.jobs.splice(this.jobs.indexOf(j), 1);
      const over = j.inv.add(j.recipe.id, j.recipe.makes);
      for (const f of this.handlers.done || []) f(j.recipe, over);
    }
  }
  /** Stops every job (what they took is lost unless you give it back). */
  clear() { this.jobs.length = 0; }
}
