// gs.dungeon.Dungeon: a dungeon map (gs.gen's dungeon(), cave() or maze(), or your own text) built in a Next Gen view,
// dressed and working: stone walls, a flagged floor and a vaulted dark over it, doors that swing, a locked door whose
// key lies in a chest, an iron gate that lifts when its levers are set right (a lamp on each lever and over the gate
// lights while that lever is right), pressure plates, spike traps that fire in the corridors, chests with lids, a
// secret wall that sinks away, torches that light the rooms through the view's lamp pool, pillars, and barrels and
// crates to push (onto a plate). Solid in the game's World3D (found by itself, links.js): a shut door is a wall, an
// open one isn't. The rules (what is open, found and taken, and what each thing does) are dungeon.js's; this builds
// the meshes and moves them to match.
//
//   reset() { d = new gs.dungeon.Dungeon(view, { map: gs.gen.dungeon(40, 30, { seed }), seed }); hero.at(d.start); }
//   update(dt) { d.update(dt, hero.position); }          // plates, traps, what the map has seen, doors moving
//   down() { const r = d.use(hero.position, { inventory }); if (r.why === 'locked') say('It needs a key'); }
//   d.on('trap', (t, who) => hurt(10)); d.on('loot', (t, loot) => ...); d.on('solved', gate => feel.win());
//
// Kit use only: games reach it as gs.dungeon.

import { Group, Mesh, ConeGeometry, CylinderGeometry, TorusGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { layout as readMap, DungeonRules, LEGEND } from './dungeon.js';
import { Build, boxUV } from './models/props.js';
import { prop } from './models/props.js';
import { material } from './models/materials.js';
import { wear } from './models/wear.js';
import { pbr } from './hd3d.js';
import { linksFor, linked } from './links.js';
import { slim } from './slim.js';

export { readMap as layout, DungeonRules, LEGEND };

const LOOK = {
  wall: ['stone', { colour: '#7d776c', dark: '#45413b' }],
  floor: ['cobbles', { colour: '#6c665c', dark: '#34312c' }],
  ceiling: ['stone', { colour: '#4e4a44', dark: '#26241f' }],
  trim: ['stone', { colour: '#8f887b', dark: '#5a554c' }],
  wood: ['planks', { colour: '#5e3e22', dark: '#2c1c0e' }],
  iron: ['metal', { colour: '#34322f' }],
};
const shared = new Map();
const matOf = (slot, own) => { if (own?.[slot]) return own[slot]; const [n, o] = LOOK[slot], k = n + JSON.stringify(o); if (!shared.has(k)) shared.set(k, material(n, o)); return shared.get(k); };
const merged = (b, slot) => { const geos = b.slots.get(slot); if (!geos) return null; const g = boxUV(mergeGeometries(geos, false), 1); for (const x of geos) x.dispose(); return g; };
const approach = (v, to, step) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));

/**
 * Builds a dungeon. map (a gs.gen dungeon() / cave() / maze() result, or text: LEGEND's letters), seed, size (metres a
 * cell, 3), height (metres to the ceiling, 3.6), dress (true: doors, the locked door and its key, the lever gate, traps,
 * chests, a secret wall, torches, pillars and clutter added to what the map has), ceiling (true; false for a camera
 * from above), at ({ x, y, z }: where its middle is, for a dungeon under a town or a gs.regions part), world (a
 * World3D: found by itself; false: not solid), lamps (true: the torches light it through the view's lamp pool), hints
 * (true: the lever lamps), loot ((chest) => [{ id, n }]: what a chest holds; else some gold), trapRearm (seconds, 3),
 * materials ({ wall, floor, ceiling, trim, wood, iron }: your own). Gives layout (dungeon.js's), rules (its
 * DungeonRules), things (the layout's, each with mesh), group, start / exit ({ x, y, z } in the world), solid (the body).
 */
export class Dungeon {
  constructor(view, { map, seed = 1, size = 3, height = 3.6, dress = true, ceiling = true, at = { x: 0, y: 0, z: 0 }, world, lamps = true, hints = true, loot = null, trapRearm = 3, materials = null, link } = {}) {
    if (!map) throw new Error('gs.dungeon.Dungeon: needs a map (gs.gen.dungeon(), cave(), maze() or text)');
    this.view = view; this.at = { x: at.x || 0, y: at.y || 0, z: at.z || 0 }; this.H = height; this.lampsOn = lamps; this.hints = hints; this.t = 0;
    this.links = linksFor(view, link); this.links?.join('dungeon', this); this.givenWorld = world;
    const L = this.layout = readMap(map, { size, seed, dress }), S = size, H = height, own = materials;
    this.rules = new DungeonRules(L, { loot, trapRearm }); this.things = L.things;
    const g = this.group = new Group(); g.name = 'gs-dungeon'; g.position.set(this.at.x, this.at.y, this.at.z); view.scene.add(g);
    const W = (p) => ({ x: p.x + this.at.x, y: this.at.y, z: p.z + this.at.z });
    this.start = L.start ? W(L.start) : W({ x: 0, z: 0 }); this.exit = L.exit ? W(L.exit) : null;
    const rock = (c, r) => { const k = L.grid[r]?.[c]; return k === undefined || k === '#' || k === ' '; };
    const floorAt = (c, r) => !rock(c, r);
    const b = new Build(), solid = [];
    const box = (slot, w, h, d, x, y, z, part, turn) => { b.box(slot, w, h, d, [x, y, z], turn ? [0, turn, 0] : 0); if (part !== false) solid.push({ box: [w, h, d], at: { x: x + this.at.x, y: y + this.at.y, z: z + this.at.z }, turn: turn || 0, part: part || 'wall' }); };
    // the floor and the dark over it: one slab each under and over the whole map
    const MW = L.cols * S, MD = L.rows * S;
    box('floor', MW, .4, MD, 0, -.2, 0, 'floor');
    if (ceiling) box('ceiling', MW, .5, MD, 0, H + .25, 0, 'ceiling');
    // the walls: rock cells next to floor, in runs along each row (a few long boxes, not one a cell)
    for (let r = 0; r < L.rows; r++) {
      let run = -1;
      for (let c = 0; c <= L.cols; c++) {
        const edge = c < L.cols && rock(c, r) && [[0, -1], [1, 0], [0, 1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]].some(([dx, dz]) => floorAt(c + dx, r + dz));
        if (edge && run < 0) run = c;
        if (!edge && run >= 0) { const n = c - run, x = L.x0 + (run + n / 2) * S, z = L.z0 + (r + .5) * S; box('wall', n * S, H, S, x, H / 2, z); run = -1; }
      }
    }
    // a skirting of dressed stone where wall meets floor, along each wall face
    for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
      if (!floorAt(c, r)) continue;
      const x = L.x0 + (c + .5) * S, z = L.z0 + (r + .5) * S;
      if (rock(c, r - 1)) b.box('trim', S, .22, .08, [x, .11, z - S / 2 + .04]);
      if (rock(c, r + 1)) b.box('trim', S, .22, .08, [x, .11, z + S / 2 - .04]);
      if (rock(c - 1, r)) b.box('trim', .08, .22, S, [x - S / 2 + .04, .11, z]);
      if (rock(c + 1, r)) b.box('trim', .08, .22, S, [x + S / 2 - .04, .11, z]);
    }
    // the moving things, each in its own group at its cell (doors and gates turned to their axis)
    const DW = Math.min(1.7, S * .56), DH = Math.min(2.5, H - .6);
    this.glows = [];
    const thingGroup = (t, turn = 0) => { const q = new Group(); q.name = 'dungeon:' + t.kind; q.position.set(t.x, 0, t.z); q.rotation.y = turn; g.add(q); t.mesh = q; return q; };
    const part = (q, slot, build) => { const m = new Mesh(merged(build, slot), matOf(slot, own)); m.castShadow = m.receiveShadow = true; m.name = slot; q.add(m); return m; };
    const lampMat = () => { const m = pbr('#3a2a1a', { rough: .4, glow: 0, glowCol: '#ffb040' }); m.emissive?.set('#ffa030'); m.emissiveIntensity = 0; this.glows.push(m); return m; };
    const faceTurn = f => Math.atan2(f[0], f[1]);
    const shapes = new Map();   // thing id -> the solid shape it is while shut
    for (const t of L.things) {
      const turn = t.axis === 'x' ? Math.PI / 2 : 0, c = Math.cos(turn), s = Math.sin(turn);
      const local = (lx, lz) => ({ x: t.x + lx * c + lz * s, z: t.z - lx * s + lz * c });
      if (t.kind === 'door' || t.kind === 'locked' || t.kind === 'gate') {
        // the frame: jambs and a lintel in the wall's own stone, always solid
        const jw = (S - DW) / 2;
        for (const k of [-1, 1]) { const p = local(k * (DW / 2 + jw / 2), 0); box('trim', jw, H, .6, p.x, H / 2, p.z, 'frame', turn); }
        { const p = local(0, 0); box('trim', DW, H - DH, .6, p.x, DH + (H - DH) / 2, p.z, 'frame', turn); }
        const q = thingGroup(t, turn);
        if (t.kind === 'gate') {
          const pb = new Build(), bars = Math.round(DW / .22);
          for (let i = 0; i <= bars; i++) { const x = -DW / 2 + .06 + i * (DW - .12) / bars; pb.box('iron', .06, DH, .06, [x, DH / 2, 0]); pb.add('iron', new ConeGeometry(.05, .18, 6), [x, -.06, 0], [Math.PI, 0, 0]); }
          for (let j = 1; j < 5; j++) pb.box('iron', DW - .04, .06, .07, [0, j * DH / 5, 0]);
          const bars3 = new Group(); bars3.name = 'bars'; q.add(bars3); part(bars3, 'iron', pb); t.lift = bars3;
          // the lamps over it: one for each lever that works it, lit while that lever is right
          const levers = L.things.filter(o => o.kind === 'lever' && o.group === t.group);
          t.lamps = levers.map((lv, i) => { const m = new Mesh(new CylinderGeometry(.07, .07, .05, 12), lampMat()); m.rotation.x = Math.PI / 2; m.position.set((i - (levers.length - 1) / 2) * .3, DH + .25, .31); q.add(m); return { lever: lv, mat: m.material }; });
        } else {
          // a door of planks on iron bands, hinged at one side (a locked one wears a lock plate)
          const db = new Build();
          db.box('wood', DW - .06, DH - .04, .09, [DW / 2, DH / 2, 0], 0, .01);
          for (const y of [.35, DH / 2, DH - .4]) db.box('iron', DW - .1, .07, .11, [DW / 2, y, 0]);
          db.ring('iron', .06, .012, [DW - .25, DH * .45, .07], [0, 0, 0]);
          if (t.kind === 'locked') { db.box('iron', .16, .24, .12, [DW - .25, DH * .45 + .2, 0], 0, .01); db.box('iron', .03, .07, .13, [DW - .25, DH * .45 + .17, 0]); }
          const hinge = new Group(); hinge.name = 'hinge'; hinge.position.set(-DW / 2, 0, 0); q.add(hinge);
          part(hinge, 'wood', db); part(hinge, 'iron', db); t.hinge = hinge;
        }
        const p = local(0, 0); shapes.set(t.id, { box: [DW, DH, .12], at: { x: p.x + this.at.x, y: DH / 2 + this.at.y, z: p.z + this.at.z }, turn, part: 'thing:' + t.id });
      } else if (t.kind === 'secret') {
        // a stretch of wall like the rest, one stone a shade off; it sinks into the floor when found
        const q = thingGroup(t), sb = new Build();
        sb.box('wall', S, H, S, [0, H / 2, 0]); sb.box('trim', .5, .32, .04, [S * .18, 1.35, S / 2 + .01]); sb.box('trim', .5, .32, .04, [-S * .18, 1.35, -S / 2 - .01]);
        part(q, 'wall', sb); part(q, 'trim', sb);
        shapes.set(t.id, { box: [S, H, S], at: { x: t.x + this.at.x, y: H / 2 + this.at.y, z: t.z + this.at.z }, part: 'thing:' + t.id });
      } else if (t.kind === 'lever') {
        // on the wall's face, its handle up (off) or down (on), a lamp on the plate lit while it is right
        const q = thingGroup(t, faceTurn(t.face)); q.position.set(t.x + t.face[0] * S / 2, 1.25, t.z + t.face[1] * S / 2); q.scale.setScalar(1.5);
        const lb = new Build(); lb.box('iron', .24, .4, .05, [0, 0, .025], 0, .01); part(q, 'iron', lb);
        const hb = new Build(); hb.add('iron', new CylinderGeometry(.022, .022, .4, 8), [0, .2, 0]); hb.ball('wood', .05, [0, .42, 0]);
        const handle = new Group(); handle.name = 'handle'; handle.position.set(0, 0, .06); q.add(handle); part(handle, 'iron', hb); part(handle, 'wood', hb); t.handle = handle;
        if (hints) { const m = new Mesh(new CylinderGeometry(.035, .035, .03, 10), lampMat()); m.rotation.x = Math.PI / 2; m.position.set(0, .14, .055); q.add(m); t.lamp = m.material; }
      } else if (t.kind === 'plate') {
        const q = thingGroup(t), pb = new Build(); pb.box('trim', S * .62, .1, S * .62, [0, .03, 0], 0, .02); part(q, 'trim', pb); t.slab = q.children[0];
      } else if (t.kind === 'trap') {
        // an iron grate let into the floor; the spikes under it come up through it when it fires
        const q = thingGroup(t), gb = new Build(), n = 4, w = S * .7;
        for (let i = 0; i <= n; i++) { gb.box('iron', w, .04, .05, [0, .015, -w / 2 + i * w / n]); gb.box('iron', .05, .04, w, [-w / 2 + i * w / n, .015, 0]); }
        part(q, 'iron', gb);
        const sp = new Build(); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) sp.add('iron', new ConeGeometry(.07, .7, 6), [-w / 2 + (i + .5) * w / n, .35, -w / 2 + (j + .5) * w / n]);
        const spikes = new Group(); spikes.name = 'spikes'; spikes.position.y = -.75; q.add(spikes); part(spikes, 'iron', sp); t.spikes = spikes;
      } else if (t.kind === 'chest') {
        // with its back to the wall, its front to the room; the lid hinged at the back
        const q = thingGroup(t, faceTurn(t.face || [0, 1])), cb = new Build(), lb = new Build();
        q.position.set(t.x - (t.face?.[0] || 0) * S * .25, 0, t.z - (t.face?.[1] || 1) * S * .25);
        cb.box('wood', .9, .5, .56, [0, .25, 0], 0, .015); for (const x of [-.34, .34]) cb.box('iron', .06, .52, .58, [x, .25, 0]);
        lb.add('wood', new CylinderGeometry(.28, .28, .9, 14, 1, false, 0, Math.PI), [0, 0, .28], [0, 0, Math.PI / 2]);
        for (const x of [-.34, .34]) lb.add('iron', new CylinderGeometry(.292, .292, .06, 14, 1, false, 0, Math.PI), [x, 0, .28], [0, 0, Math.PI / 2]);
        lb.box('iron', .12, .14, .04, [0, -.02, .57], 0, .006);
        part(q, 'wood', cb); part(q, 'iron', cb);
        const lid = new Group(); lid.name = 'lid'; lid.position.set(0, .5, -.28); q.add(lid); part(lid, 'wood', lb); part(lid, 'iron', lb); t.lid = lid;
        const p = q.position; solid.push({ box: [.9, .6, .56], at: { x: p.x + this.at.x, y: .3 + this.at.y, z: p.z + this.at.z }, turn: q.rotation.y, part: 'thing:' + t.id });
      } else if (t.kind === 'pillar') {
        const r = Math.min(.55, S * .17);
        b.add('wall', new CylinderGeometry(r, r * 1.05, H, 16, 1), [t.x, H / 2, t.z]);
        b.box('trim', r * 2.6, .3, r * 2.6, [t.x, .15, t.z]); b.box('trim', r * 2.6, .3, r * 2.6, [t.x, H - .15, t.z]);
        solid.push({ box: [r * 2.6, H, r * 2.6], at: { x: t.x + this.at.x, y: H / 2 + this.at.y, z: t.z + this.at.z }, part: 'pillar' });
      } else if (t.kind === 'torch') {
        const m = prop('torch', { lit: 3, size: 1.2 }); m.position.set(t.x + t.face[0] * S / 2, 1.9, t.z + t.face[1] * S / 2); m.rotation.y = faceTurn(t.face); g.add(m); t.mesh = m;
      } else if (t.kind === 'barrel' || t.kind === 'crate') {
        // (in the scene, not the group: the physics world moves them; held at their middle, as the body is)
        const hh = t.kind === 'crate' ? .4 : .5, m = new Group(), p = prop(t.kind, { seed: t.id % 4 }); p.position.y = -hh; m.add(p); m.name = 'dungeon:' + t.kind;
        m.position.set(t.x + this.at.x + (t.id % 3 - 1) * .3, this.at.y + hh, t.z + this.at.z + ((t.id >> 1) % 3 - 1) * .3); m.rotation.y = t.id * 1.3;
        view.scene.add(m); t.mesh = m; this.loose ||= []; this.loose.push(t);
      }
    }
    // the way in and the way out: a ring of dressed stone in the floor, the exit's lit
    for (const [p, lit] of [[L.start, false], [L.exit, true]]) {
      if (!p) continue;
      b.add('trim', new TorusGeometry(S * .3, .06, 6, 28), [p.x, .02, p.z], [Math.PI / 2, 0, 0]);
      if (lit) { const m = new Mesh(new CylinderGeometry(S * .26, S * .26, .02, 28), lampMat()); m.position.set(p.x, .015, p.z); g.add(m); this.exitGlow = m.material; }
    }
    // the still stone: one mesh a material, worn
    for (const slot of b.slots.keys()) {
      const m = new Mesh(merged(b, slot), matOf(slot, own)); m.receiveShadow = true; m.castShadow = slot !== 'floor'; m.name = slot;
      if (slot === 'wall' || slot === 'trim') wear(m, { seed, split: false, edges: .4, dirt: .7, ground: 1.2, moss: .1 });
      slim(m.geometry); g.add(m);
    }
    // torch light: a lamp spot at each flame
    this.lampSpots = L.things.filter(t => t.kind === 'torch').map(t => ({ x: t.x + t.face[0] * (S / 2 + .38) + this.at.x, y: 2.42 + this.at.y, z: t.z + t.face[1] * (S / 2 + .38) + this.at.z, col: '#ffa850', i: 9, flick: .4, reach: S * 3.6 }));
    this.solidList = solid; this.shut = shapes; this.solid = null; this.solidWorld = null; this.bodies = [];
    // what the rules say, the meshes follow (and the solid shapes come and go)
    this.rules.on('open', t => this.solidFor(t, false)).on('shut', t => this.solidFor(t, true)).on('secret', t => this.solidFor(t, false));
    this.makeSolid();
    this.settle(1e3);
  }
  get world() { return linked(this.givenWorld, this.links, 'world'); }
  /** Listen for what happens: 'open', 'shut', 'unlock', 'lever', 'solved' (a gate's puzzle), 'press', 'release', 'trap' (thing, who), 'loot' (thing, loot), 'secret'. */
  on(ev, fn) { this.rules.on(ev, fn); return this; }
  makeSolid() {
    const W = this.world; if (!W || W === this.solidWorld || !W.shapes) return;
    const list = this.solidList.slice();
    for (const t of this.things) { const sh = this.shut.get(t.id); if (sh && this.closed(t)) list.push(sh); }
    this.solid = W.shapes(list, { tag: 'dungeon', sound: 'stone' }); this.solidWorld = W;
    for (const t of this.loose || []) { const k = t.kind === 'crate'; this.bodies.push(W.box(t.mesh, k ? .8 : .7, k ? .8 : 1, k ? .8 : .7, { density: k ? .5 : .8, sound: 'wood', tag: t.kind })); }
  }
  closed(t) { return t.kind === 'secret' ? !t.found : !t.open; }
  solidFor(t, on) {
    const sh = this.shut.get(t.id); if (!sh || !this.solid) return;
    if (on) { this.solid.drop(sh.part); this.solid.add(sh); } else this.solid.drop(sh.part);
  }
  local(p) { const q = p?.position || p; return q ? { x: q.x - this.at.x, z: q.z - this.at.z } : null; }
  /**
   * Each frame: hero (a position, or a list of them: the hero, a companion, anything heavy) presses plates, fires traps
   * and fills in the map; the barrels and crates press plates too. Doors swing, gates lift, lids open as the rules say.
   */
  update(dt = 0, hero = null) {
    this.t += dt; this.makeSolid();
    const feet = (Array.isArray(hero) ? hero : hero ? [hero] : []).map(p => this.local(p)).filter(Boolean);
    for (const t of this.loose || []) feet.push(this.local(t.mesh));
    this.rules.step(dt, feet);
    this.settle(dt);
    const v = this.view;
    if (this.lampsOn && v.placeLamps && this.lampSpots.length) {
      if (!v.lamps?.length) v.lampLights(this.layout.size * 3.6);
      const c = v.cam.position, R = this.layout.size * 8;
      v.placeLamps(this.lampSpots.filter(s => Math.abs(s.x - c.x) < R && Math.abs(s.z - c.z) < R), c.x, c.y, c.z, this.t);
    }
    return this;
  }
  // the meshes follow the rules' state (dt: how far they get this frame; a big dt puts them there)
  settle(dt) {
    const H = this.H, step = rate => rate * dt;
    for (const t of this.things) {
      if (t.hinge) t.hinge.rotation.y = approach(t.hinge.rotation.y, t.open ? -1.75 : 0, step(2.6));
      else if (t.lift) t.lift.position.y = approach(t.lift.position.y, t.open ? Math.min(2.5, H - .6) - .25 : 0, step(t.open ? 1.1 : 3));
      else if (t.kind === 'secret' && t.mesh) t.mesh.position.y = approach(t.mesh.position.y, t.found ? -H - .05 : 0, step(1.2));
      else if (t.handle) t.handle.rotation.x = approach(t.handle.rotation.x, t.on ? 2.2 : .5, step(9));
      else if (t.lid) t.lid.rotation.x = approach(t.lid.rotation.x, t.open ? -1.9 : 0, step(3.5));
      else if (t.slab) t.slab.position.y = approach(t.slab.position.y, t.down ? -.06 : 0, step(.6));
      else if (t.spikes) { const up = t.fired != null && t.fired < .9; t.spikes.position.y = approach(t.spikes.position.y, up ? 0 : -.75, step(up ? 14 : 1.4)); }
      if (t.lamp) t.lamp.emissiveIntensity = t.on === t.want ? 3 : 0;
      if (t.lamps) for (const l of t.lamps) l.mat.emissiveIntensity = l.lever.on === l.lever.want ? 3 : 0;
    }
    if (this.exitGlow) this.exitGlow.emissiveIntensity = 1.5 + Math.sin(this.t * 2) * .5;
  }
  /** Uses a thing, or the nearest usable within reach of a position: rules.use (opens, unlocks with inventory's key, pulls, loots, finds). */
  use(what, o) { return this.rules.use(what && 'kind' in what ? what : this.local(what), o); }
  /** Things to use within r metres of a position, nearest first. */
  near(p, r) { const q = this.local(p); return this.rules.near(q.x, q.z, r); }
  /** The cell at a world position, { col, row, ch }, or null. */
  cellAt(p) { const q = this.local(p); return this.rules.cellAt(q.x, q.z); }
  /** Where a thing (or a cell) is in the world. */
  spot(t) { const L = this.layout, p = t.kind ? this.rules.spot(t) : { x: L.x0 + (t.col + .5) * L.size, z: L.z0 + (t.row + .5) * L.size }; return { x: p.x + this.at.x, y: this.at.y, z: p.z + this.at.z }; }
  find(mark) { return this.rules.find(mark).map(p => this.spot(p)); }
  /** A map of what has been seen (all: true for everything): rock, floor, doors, gate, chests, the exit, and an arrow at at (turned by turn). */
  drawMap(c, x, y, w, h, { at = null, turn = 0, all = false, colours = {} } = {}) {
    const L = this.layout, K = { bg: '#0d0c0b', floor: '#6a6256', wall: '#2c2925', door: '#b07a40', gate: '#9aa0a8', chest: '#e0b040', exit: '#ffcc60', me: '#ffffff', ...colours };
    const s = Math.min(w / L.cols, h / L.rows), ox = x + (w - L.cols * s) / 2, oy = y + (h - L.rows * s) / 2, seen = this.rules.seen;
    c.fillStyle = K.bg; c.fillRect(x, y, w, h);
    for (let r = 0; r < L.rows; r++) for (let q = 0; q < L.cols; q++) {
      if (!all && !seen[r * L.cols + q]) continue;
      const k = L.grid[r][q]; if (k === ' ') continue;
      c.fillStyle = k === '#' ? K.wall : K.floor; c.fillRect(ox + q * s, oy + r * s, s + .3, s + .3);
    }
    for (const t of this.things) {
      if (!all && !seen[t.row * L.cols + t.col]) continue;
      const col = t.kind === 'door' || t.kind === 'locked' ? K.door : t.kind === 'gate' ? K.gate : t.kind === 'chest' && !t.open ? K.chest : t.kind === 'secret' && t.found ? K.floor : null;
      if (col) { c.fillStyle = col; c.fillRect(ox + (t.col + .2) * s, oy + (t.row + .2) * s, s * .6, s * .6); }
    }
    if (L.exit && (all || seen[L.exit.row * L.cols + L.exit.col])) { c.fillStyle = K.exit; c.beginPath(); c.arc(ox + (L.exit.col + .5) * s, oy + (L.exit.row + .5) * s, s * .45, 0, Math.PI * 2); c.fill(); }
    const me = at && this.local(at);
    if (me) {
      const px = ox + (me.x - L.x0) / L.size * s, py = oy + (me.z - L.z0) / L.size * s;
      c.save(); c.translate(px, py); c.rotate(-turn); c.fillStyle = K.me; c.beginPath(); c.moveTo(0, -s * .8); c.lineTo(s * .5, s * .5); c.lineTo(-s * .5, s * .5); c.closePath(); c.fill(); c.restore();
    }
  }
  pack() { return this.rules.pack(); }
  /** Puts back a saved state (rules.pack()): doors, levers, chests, secrets and the map as they were. */
  unpack(d) {
    this.rules.unpack(d);
    if (this.solid) for (const t of this.things) { const sh = this.shut.get(t.id); if (sh) { this.solid.drop(sh.part); if (this.closed(t)) this.solid.add(sh); } }
    this.settle(1e3); return this;
  }
  remove() {
    this.group.removeFromParent();
    for (const t of this.loose || []) t.mesh.removeFromParent();
    if (this.solidWorld?.remove) { if (this.solid) this.solidWorld.remove(this.solid); for (const b of this.bodies) this.solidWorld.remove(b); }
    this.links?.leave(this);
  }
}
