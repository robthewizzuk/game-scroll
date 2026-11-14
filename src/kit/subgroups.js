// Subgroups (WGSL 'subgroups', Chrome and Android from version 144; not Safari or Firefox yet) in the kit's own
// compute passes. The chip runs a compute pass in groups of 4 to 128 threads at once (a subgroup); with
// subgroups they can add up and count among themselves, so a pass where many threads add to one counter
// (a list being packed, a total, a count) does one add on that counter per subgroup instead of one per
// thread, and the adds no longer queue for it.
//
// claim() packs a list: each thread that wants a place in it gets one, in one add per subgroup. addUp()
// adds a number to a counter, in one add per subgroup. Both give the same answers as the plain atomics
// they replace: a count is the same whole number; a packed list holds the same things (in another order,
// which no packed list here depends on); a sum of whole numbers (the fluid's fixed point) is the same to
// the last bit, in whatever order it is added.
//
// They must be called where every thread of the pass gets to (not inside an If that depends on the
// thread): the chip has a subgroup's threads take every step together, and WGSL refuses a subgroup step
// that some of them would skip. So a pass that uses them is made whole(): three otherwise sends the threads
// past the pass's count home first, and the ones left would not be the whole subgroup.
//
// HD.subgroups = false (the frame lab's Subgroups check) builds the plain way, to compare; HD.info.subgroups
// says which it is. A chip without them always builds the plain way.
// Kit use only.
import { Node } from 'three/webgpu';
import { If, int, uint, atomicAdd, nodeObject, subgroupAdd, subgroupExclusiveAdd, subgroupElect, subgroupBroadcastFirst, select } from 'three/tsl';

/** on: HD.subgroups (hd3d.js sets it each frame); chip: this renderer's chip has them (null: not asked yet); min, max: its subgroup sizes. */
export const SUB = { on: true, chip: null, min: 0, max: 0 };

/** Does the chip of renderer r have subgroups? (asked once a renderer) */
export function subgroupsChip(r) {
  const d = r?.backend?.device; if (!d) return false;
  if (SUB.dev !== d) {
    SUB.dev = d; SUB.chip = !!d.features?.has('subgroups');
    const a = r.backend.adapter?.info || d.adapterInfo || null;
    SUB.min = a?.subgroupMinSize || 0; SUB.max = a?.subgroupMaxSize || 0;
  }
  return SUB.chip;
}

/** Whether passes built now for renderer r should use subgroups: the chip has them and HD.subgroups isn't false. */
export const subgroupsWanted = r => SUB.on && subgroupsChip(r);

/** What HD.info.subgroups says. */
export function subgroupsInfo(r) {
  if (!subgroupsChip(r)) return SUB.chip === false ? 'off (none on this chip)' : 'off';
  const size = SUB.min && SUB.max ? (SUB.min === SUB.max ? ` of ${SUB.min}` : ` of ${SUB.min} to ${SUB.max}`) : '';
  return SUB.on ? `on (subgroups${size})` : `off (switched off; the chip has subgroups${size})`;
}

// three ends a compute pass early for the threads past its count (ComputeNode); a pass with subgroup steps
// in it must keep them all (see the top). A barrier does the same for its own reasons.
class Whole extends Node {
  static get type() { return 'SubgroupWhole'; }
  constructor() { super('void'); }
  isCacheable() { return false; }
  setup(b) { b.allowEarlyReturns = false; return null; }
  generate() { return ''; }
}
/** Call first thing in a pass's Fn when it uses claim() or addUp() with subgroups (harmless without). */
export function whole(sg) { if (sg) nodeObject(new Whole()).toStack(); }

/**
 * A place in a packed list for each thread where `want` (a bool node) holds: counter is the list's atomic
 * count (a storage element made .toAtomic()). Returns the place (a uint node; meaningless where !want).
 * sg: built with subgroups (subgroupsWanted()); then every thread of the pass must get here.
 */
export function claim(counter, want, sg) {
  const slot = uint(0).toVar();
  if (!sg) { If(want, () => { slot.assign(atomicAdd(counter, uint(1))); }); return slot; }
  const w = select(want, uint(1), uint(0)), before = subgroupExclusiveAdd(w).toVar(), n = subgroupAdd(w).toVar();
  const base = uint(0).toVar();
  If(subgroupElect().and(n.greaterThan(uint(0))), () => { base.assign(atomicAdd(counter, n)); });
  slot.assign(subgroupBroadcastFirst(base).add(before));
  return slot;
}

/**
 * Adds n (a uint node, or an int node with type 'int') to an atomic counter of that type. sg: with subgroups
 * (every thread of the pass must get here, with 0 where it adds nothing); without, only threads with n != 0 add.
 */
export function addUp(counter, n, sg, type = 'uint') {
  const zero = type === 'int' ? int(0) : uint(0);
  if (!sg) { If(n.notEqual(zero), () => { atomicAdd(counter, n); }); return; }
  const all = subgroupAdd(n).toVar();
  If(subgroupElect().and(all.notEqual(zero)), () => { atomicAdd(counter, all); });
}
