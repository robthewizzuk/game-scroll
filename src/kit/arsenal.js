// A ready-made arsenal for gs.combat: the numbers of each weapon gs.models.weapon makes (how hard it hits, how fast it
// fires, how far it carries, what ammo it takes), a sound for each, a pouch of ammo shared by the guns that take it, the
// weapons someone carries (a loadout: pick up, switch, fire, reload) and pickups lying in the world. The kit does the
// sums and the sounds; the game draws the weapons (gs.models.weapon), the shots and the hits (gs.fx3d.Impacts), and
// says what a shot hit. Kit use: games reach these through gs.combat.
//
//   const { Loadout, Pouch, Pickups, ARSENAL } = gs.combat;
//   reset() {
//     arms = new Loadout({ pouch: new Pouch({ pistol: 36 }) }); arms.give('pistol');
//     drops = new Pickups(); drops.add({ x: 4, y: 0, z: -6, kind: 'shotgun' }); drops.add({ x: -3, y: 0, z: 2, kind: 'ammo', of: 'shells', amount: 12 });
//   }
//   update(dt) {
//     arms.update(dt);
//     for (const s of arms.fire(muzzle, aimDir, fireHeld, { at: muzzle })) { ...ray s.from along s.dir, s.damageAt(d, head) ... }
//     drops.collect(dt, me.position, arms);                               // walked over: a weapon, its ammo, or health
//   }
//   draw: arms.gun.ammo, arms.gun.spare, arms.kind, arms.gun.reloading
//
// Numbers are in metres and seconds (3D games); a 2D game scales range and speed to its own units.
import { Gun } from './combat.js';
import { noise, tone } from './sound.js';
import { linksFor } from './links.js';
import { Bow } from './bow.js';
import { ARMS, SHIELD } from './melee3d.js';

/**
 * Each weapon's numbers: gun (options for gs.combat.Gun: arm(kind) makes one), ammo (the kind of rounds it takes, a
 * Pouch's name for them), shell (the case it throws: 'small' | 'rifle' | 'shell' | null, for gs.fx3d.Impacts.shell),
 * slot (where a loadout keeps it: 'hand' pistols, 'long' guns, 'heavy', 'throw', 'melee'), throw (grenades: speed,
 * fuse, radius, damage for gs.combat.Explosives), blast (a launcher's rocket going off), melee (a gs.fight.Melee
 * weapon: { reach, damage, arc } over gs.fight.SWINGS), pickup (rounds that come with it when picked up).
 */
export const ARSENAL = {
  pistol: { slot: 'hand', ammo: 'pistol', shell: 'small', pickup: 24, gun: { damage: 22, rate: 6, mag: 12, reload: 1.3, spread: .012, bloom: .012, maxSpread: .07, settle: .2, auto: false, recoil: .05, range: 60, falloff: [15, 45, .6], head: 2 } },
  revolver: { slot: 'hand', ammo: 'magnum', shell: null, pickup: 12, gun: { damage: 48, rate: 2.2, mag: 6, reload: 2.4, spread: .008, bloom: .03, maxSpread: .08, settle: .15, auto: false, recoil: .12, sideways: .3, range: 75, falloff: [20, 60, .6], head: 2 } },
  smg: { slot: 'long', ammo: 'pistol', shell: 'small', pickup: 60, gun: { damage: 14, rate: 13, mag: 30, reload: 1.7, spread: .026, bloom: .008, maxSpread: .1, settle: .3, auto: true, recoil: .022, sideways: .6, range: 45, falloff: [10, 35, .5], head: 1.8 } },
  shotgun: { slot: 'long', ammo: 'shells', shell: 'shell', pickup: 12, gun: { damage: 11, pellets: 9, rate: 1.3, mag: 6, reload: 2.6, spread: .085, bloom: 0, maxSpread: .085, auto: false, recoil: .15, sideways: .2, range: 32, falloff: [6, 24, .25], head: 1.4 } },
  rifle: { slot: 'long', ammo: 'rifle', shell: 'rifle', pickup: 60, gun: { damage: 26, rate: 9, mag: 30, reload: 1.9, spread: .01, bloom: .007, maxSpread: .07, settle: .25, auto: true, recoil: .034, sideways: .5, range: 160, falloff: [40, 120, .7], head: 2 } },
  sniper: { slot: 'long', ammo: 'rifle', shell: 'rifle', pickup: 10, gun: { damage: 95, rate: .9, mag: 5, reload: 2.8, spread: .0015, bloom: .04, maxSpread: .06, settle: .08, auto: false, recoil: .2, sideways: .15, range: 420, falloff: [150, 400, .8], head: 3 } },
  launcher: { slot: 'heavy', ammo: 'rockets', shell: null, pickup: 2, blast: { radius: 4.5, damage: 120 }, gun: { damage: 40, rate: .6, mag: 1, reload: 2.8, spread: .004, bloom: 0, auto: false, recoil: .18, range: 200, speed: 48, head: 1 } },
  grenade: { slot: 'throw', ammo: 'grenades', shell: null, pickup: 2, throw: { speed: 13, fuse: 2.6, radius: 5, damage: 100 } },
  bat: { slot: 'melee', melee: ARMS.bat }, pipe: { slot: 'melee', melee: ARMS.pipe }, wrench: { slot: 'melee', melee: ARMS.wrench }, baton: { slot: 'melee', melee: ARMS.baton },
  // the old world's: melee is gs.fight's ARMS[kind] (moves names its set: BLADES, AXES, SPEARS, STAVES; edge: 'cut' | 'blunt' |
  // 'point', how armour takes it); shield: how it guards (gs.fight.Melee's shield); bow: options for gs.combat.Bow
  sword: { slot: 'melee', melee: ARMS.sword }, longsword: { slot: 'melee', melee: ARMS.longsword }, dagger: { slot: 'melee', melee: ARMS.dagger },
  axe: { slot: 'melee', melee: ARMS.axe }, mace: { slot: 'melee', melee: ARMS.mace }, spear: { slot: 'melee', melee: ARMS.spear }, staff: { slot: 'melee', melee: ARMS.staff },
  shield: { slot: 'off', shield: SHIELD },
  bow: { slot: 'long', ammo: 'arrows', shell: null, pickup: 12, bow: { draw: .75, speed: 60, damage: 40 } },
};
const SLOTS = ['melee', 'hand', 'long', 'heavy', 'throw', 'off'];

/** A gs.combat.Gun with a weapon's numbers (ARSENAL[kind].gun), o over them (a pouch, rng, damage...). */
export function arm(kind, o = {}) {
  const A = ARSENAL[kind]; if (!A?.gun) throw new Error(`gs.combat.arm: '${kind}' is not a gun (try ${Object.keys(ARSENAL).filter(k => ARSENAL[k].gun).join(', ')})`);
  const g = new Gun({ ...A.gun, ammoType: A.ammo, ...o }); g.kind = kind; return g;
}

/**
 * Ammo carried, by its kind ('pistol', 'magnum', 'shells', 'rifle', 'rockets', 'grenades', or your own names): the
 * guns given it (arm(kind, { pouch }) or a Loadout's) reload out of it. max: the most of each kind carried.
 */
export class Pouch {
  constructor(start = {}, { max = { pistol: 180, magnum: 36, shells: 48, rifle: 240, rockets: 6, grenades: 5, arrows: 40 } } = {}) { this.n = {}; this.max = max; for (const k in start) this.add(k, start[k]); }
  count(kind) { return this.n[kind] || 0; }
  /** Puts some in (no more than max): how many went in. */
  add(kind, n) { const room = (this.max[kind] ?? Infinity) - this.count(kind), k = Math.max(0, Math.min(room, n | 0)); this.n[kind] = this.count(kind) + k; return k; }
  /** Takes some out: how many there were to take. */
  take(kind, n = 1) { const k = Math.min(this.count(kind), n); this.n[kind] = this.count(kind) - k; return k; }
  full(kind) { return this.count(kind) >= (this.max[kind] ?? Infinity); }
  save() { return { ...this.n }; }
  load(d) { if (d) this.n = { ...d }; return this; }
}

// ---------------------------------------------------------------- sounds

// each weapon's report, built from noise and tones: [crack (high), body (its boom), thump (Hz), length]
const REPORT = {
  pistol: [.7, .14, 150, .14], revolver: [.8, .2, 110, .22], smg: [.55, .1, 190, .08], shotgun: [.6, .22, 80, .3],
  rifle: [1, .16, 120, .17], sniper: [1, .22, 70, .45], launcher: [0, .15, 60, .6],
};
let ears = null, earsAt = -1;
const findEars = () => { const now = Date.now(); if (now - earsAt > 500) { earsAt = now; ears = linksFor(null, true)?.one('ears') || null; } return ears; };
// a noise or a tone, at a point through the game's gs.sound.Ears when it made one (heard from where it happened)
const N = (len, o, at) => { const E = at && findEars(); if (E) E.noise(len, at, o); else noise(len, o); };
const T = (f, o, at) => { const E = at && findEars(); if (E) E.tone(f, at, o); else tone(f, o); };

/**
 * A weapon's sound: what 'fire' (a shot), 'empty' (the click of nothing left), 'reload' (out with the old magazine, in
 * with the new over `time` seconds), 'pump' (a shotgun's, a bolt's), 'swing' (a thing swung, a grenade thrown), 'pin',
 * 'draw' (taken out); 'clang' (steel on steel, a blow blocked), 'parry', 'bash' (a shield into someone); a bow's 'nock', 'draw' (over time),
 * 'fire' (loosed), 'thunk' (into wood or earth), 'flesh'. at: where it happens ({ x, y, z }): through the game's gs.sound.Ears when there is one, so it
 * is heard from there, muffled behind walls and echoing in the place. Each shot sounds a little different.
 */
export function weaponSound(kind, what = 'fire', at = null, { time = 1.5, vary = .08 } = {}) {
  const v = 1 + (Math.random() - .5) * 2 * vary, A = ARSENAL[kind] || {};
  if (kind === 'bow') {   // (a bow: the arrow onto the string, the creak of the draw, the string's slap, the arrow going in)
    if (what === 'nock') return N(.05, { vol: .03, from: 2500, to: 3500, filter: 'bandpass', q: 3 }, at);
    if (what === 'draw') { N(Math.max(.2, time * .9), { vol: .018, from: 300 * v, to: 520 * v, filter: 'bandpass', q: 6, attack: .1 }, at); return; }
    if (what === 'fire') { T(95 * v, { len: .12, wave: 'triangle', vol: .09, slide: -30 }, at); N(.05, { vol: .05, from: 1800, to: 600, filter: 'bandpass' }, at); N(.35, { vol: .02, from: 900, to: 2400, filter: 'bandpass', q: 2, at: .03 }, at); return; }
    if (what === 'thunk') { T(170 * v, { len: .06, wave: 'sine', vol: .08, slide: -60 }, at); return N(.04, { vol: .05, from: 2400, to: 700, filter: 'bandpass' }, at); }
    if (what === 'flesh') return T(120 * v, { len: .08, wave: 'sine', vol: .07, slide: -40 }, at);
  }
  if (what === 'clang') { T(1350 * v, { len: .5, wave: 'triangle', vol: .05, slide: -40 }, at); T(2210 * v, { len: .35, wave: 'sine', vol: .03 }, at); return N(.04, { vol: .08, from: 6000, to: 2500, filter: 'highpass' }, at); }   // (steel on steel)
  if (what === 'parry') { T(1900 * v, { len: .7, wave: 'triangle', vol: .06 }, at); T(2850 * v, { len: .5, wave: 'sine', vol: .035 }, at); return N(.03, { vol: .09, from: 8000, to: 3000, filter: 'highpass' }, at); }
  if (what === 'bash') { T(95 * v, { len: .12, wave: 'sine', vol: .1, slide: -30 }, at); return N(.08, { vol: .07, from: 1200, to: 300 }, at); }   // (wood and iron into someone)
  if (what === 'fire') {
    const R = REPORT[kind]; if (!R) return weaponSound(kind, 'swing', at);
    const [crack, body, thump, len] = R;
    if (crack) N(.035, { vol: .1 * crack, from: 9000 * v, to: 3000, filter: 'highpass' }, at);
    N(len, { vol: body, from: (kind === 'launcher' ? 1600 : 4200) * v, to: kind === 'launcher' ? 90 : 160, attack: kind === 'launcher' ? .03 : 0 }, at);
    T(thump * v, { len: len * .7, wave: 'sine', vol: body * .7, slide: -thump * .5 }, at);
    if (kind === 'shotgun') weaponSound(kind, 'pump', at, { time: .35 });
    if (kind === 'sniper') weaponSound(kind, 'pump', at, { time: .6 });
    if (kind === 'launcher') N(.9, { vol: .05, from: 500, to: 2500, filter: 'bandpass', at: .05 }, at);   // (the rocket going)
    return;
  }
  if (what === 'empty') return T(1900 * v, { len: .02, wave: 'square', vol: .03 }, at);
  if (what === 'pump') { N(.05, { vol: .06, from: 3000, to: 1200, filter: 'bandpass', at: time }, at); N(.04, { vol: .07, from: 4000, to: 1500, filter: 'bandpass', at: time + .16 }, at); return; }
  if (what === 'reload') {
    if (kind === 'revolver' || kind === 'shotgun') { for (let i = 0; i < 3; i++) T(2400 * v, { len: .015, wave: 'triangle', vol: .02, at: time * (.25 + i * .2) }, at); N(.04, { vol: .06, from: 3500, to: 1500, filter: 'bandpass', at: time * .9 }, at); return; }
    N(.05, { vol: .05, from: 2500, to: 900, filter: 'bandpass', at: time * .15 }, at);   // out
    N(.04, { vol: .08, from: 3500, to: 1300, filter: 'bandpass', at: time * .7 }, at);   // in
    T(1600, { len: .02, wave: 'square', vol: .02, at: time * .9 }, at);                  // the catch
    return;
  }
  if (what === 'swing') return N(.2, { vol: A.melee ? .06 * (A.melee.damage || 1) : .04, from: 600 * v, to: 2200 * v, filter: 'bandpass', q: 2 }, at);
  if (what === 'pin') return T(2600 * v, { len: .04, wave: 'triangle', vol: .03 }, at);
  if (what === 'draw') return N(.08, { vol: .04, from: 2000, to: 4000, filter: 'bandpass', q: 3 }, at);
}

// ---------------------------------------------------------------- what someone carries

/**
 * The weapons one person carries: one in each slot ('melee', 'hand', 'long', 'heavy', 'throw', and 'off': a shield, worn
 * beside the one out, as off), the one out (kind, gun: its gs.combat.Gun, null for melee and thrown; bow: its gs.combat.Bow),
 * and a pouch of ammo the guns and bows share. give(kind) picks one up
 * (a second of the same kind gives its rounds instead), take(pickup) whatever a Pickups handed over, use(kind),
 * next() / prev() switch, fire(from, dir, pressed, { at }) pulls the trigger with its sound, reload(). sounds: false
 * for none (the game plays its own).
 */
export class Loadout {
  constructor({ pouch = new Pouch(), sounds = true, health = null } = {}) { this.pouch = pouch; this.sounds = sounds; this.health = health; this.carried = {}; this.kind = null; this.off = null; this.switching = 0; }
  get gun() { return this.carried[this.kind]?.gun || null; }
  get bow() { return this.carried[this.kind]?.bow || null; }
  get info() { return ARSENAL[this.kind] || null; }
  has(kind) { return !!this.carried[kind]; }
  /** The kinds carried, in slot order. */
  get list() { return Object.keys(this.carried).sort((a, b) => SLOTS.indexOf(ARSENAL[a]?.slot) - SLOTS.indexOf(ARSENAL[b]?.slot)); }
  /** Picks up a weapon (and the rounds that come with it, or `rounds`): it drops what was in its slot (returned), and is out if nothing was. */
  give(kind, { rounds = ARSENAL[kind]?.pickup || 0, use = !this.kind } = {}) {
    const A = ARSENAL[kind]; if (!A) throw new Error(`gs.combat.Loadout: no weapon '${kind}'`);
    if (A.ammo && rounds) this.pouch.add(A.ammo, rounds);
    if (this.carried[kind]) return null;
    const dropped = Object.keys(this.carried).find(k => ARSENAL[k].slot === A.slot && A.slot !== 'throw') || null;
    if (dropped) { delete this.carried[dropped]; if (this.kind === dropped) this.kind = null; if (this.off === dropped) this.off = null; }
    this.carried[kind] = { gun: A.gun ? arm(kind, { pouch: this.pouch }) : null, bow: A.bow ? new Bow({ ...A.bow, pouch: this.pouch, ammo: A.ammo, sounds: this.sounds }) : null };
    if (A.slot === 'off') { this.off = kind; return dropped; }   // (a shield: worn as well as what is out)
    if (A.gun) { const g = this.carried[kind].gun, n = Math.min(g.mag, this.pouch.count(A.ammo)); g.ammo = n; this.pouch.take(A.ammo, n); }
    if (use || !this.kind) this.use(kind);
    return dropped;
  }
  /** What a Pickups handed over: a weapon, ammo ({ of, amount }) or health ({ amount }: into `health`, a gs.combat.Health). How much it took (0: none, leave it lying). */
  take(p) {
    if (p.kind === 'ammo') return this.pouch.add(p.of, p.amount ?? 10);
    if (p.kind === 'health') { const H = this.health; if (!H || H.hp >= H.max) return 0; const k = Math.min(H.max - H.hp, p.amount ?? 25); H.hp += k; return k; }
    if (this.has(p.kind) && (!ARSENAL[p.kind].ammo || this.pouch.full(ARSENAL[p.kind].ammo))) return 0;
    this.give(p.kind, { rounds: p.amount ?? ARSENAL[p.kind].pickup, use: false });
    return 1;
  }
  /** Takes out a weapon carried (it takes a moment: switching counts down from .4 s, no firing meanwhile). */
  use(kind) { if (!this.carried[kind] || kind === this.kind || ARSENAL[kind].slot === 'off') return this; this.kind = kind; this.switching = .4; if (this.gun) this.gun.reloadLeft = 0; if (this.sounds) weaponSound(kind, 'draw'); return this; }
  next(step = 1) { const L = this.list.filter(k => ARSENAL[k].slot !== 'off'); if (L.length) this.use(L[(L.indexOf(this.kind) + step + L.length) % L.length]); return this; }
  prev() { return this.next(-1); }
  update(dt) { this.switching = Math.max(0, this.switching - dt); for (const k in this.carried) this.carried[k].gun?.update(dt); return this; }   // (a bow is updated by the game: arms.bow.update(dt, { pull, from, dir, targets }))
  /** Fire (or hold the trigger): the shots this frame, as Gun.pull, with the weapon's sound at `at`; nothing while switching. */
  fire(from, dir, pressed = true, { at = from } = {}) {
    const g = this.gun; if (!g || this.switching > 0) return [];
    const was = g.reloadLeft > 0, shots = g.pull(from, dir, pressed);
    if (this.sounds) { if (shots.length) weaponSound(this.kind, 'fire', at); else if (g.empty) weaponSound(this.kind, 'empty', at); if (!was && g.reloadLeft > 0) weaponSound(this.kind, 'reload', at, { time: g.reload }); }
    return shots;
  }
  reload({ at = null } = {}) { const g = this.gun; if (g?.startReload() && this.sounds) weaponSound(this.kind, 'reload', at, { time: g.reload }); return this; }
  save() { return { k: this.kind, c: Object.fromEntries(Object.entries(this.carried).map(([k, v]) => [k, v.gun ? v.gun.ammo : 0])), p: this.pouch.save() }; }
  load(d) {
    if (!d) return this;
    this.carried = {}; this.pouch.load(d.p);
    for (const [k, a] of Object.entries(d.c || {})) {
      const A = ARSENAL[k]; if (!A) continue;
      this.carried[k] = { gun: A.gun ? arm(k, { pouch: this.pouch }) : null, bow: A.bow ? new Bow({ ...A.bow, pouch: this.pouch, ammo: A.ammo, sounds: this.sounds }) : null }; if (this.carried[k].gun) this.carried[k].gun.ammo = a;
      if (A.slot === 'off') this.off = k;
    }
    this.kind = this.carried[d.k] && ARSENAL[d.k].slot !== 'off' ? d.k : this.list.find(k => ARSENAL[k].slot !== 'off') || null; return this;
  }
}

// ---------------------------------------------------------------- lying in the world

/**
 * Things to pick up lying in the world: weapons (kind: 'rifle'...), ammo (kind: 'ammo', of: 'shells', amount) and
 * health (kind: 'health', amount). add({ x, y, z, kind, of, amount, respawn }) (respawn: seconds until it is back once
 * taken; 0 never). update(dt, who) gives the ones `who` (a point, or a list of them) came within reach of this frame:
 * pass each to a Loadout's take(), and call taken(p) if it was (a Loadout's take() said more than 0); the rest stay.
 * Each has spin and bob (radians, metres) to draw it turning and floating, and here (false while it is gone).
 */
export class Pickups {
  constructor({ reach = 1.1, bob = .08 } = {}) { this.list = []; this.reach = reach; this.bobBy = bob; this.t = 0; this.offered = []; }
  add(o) { const p = { x: 0, y: 0, z: 0, amount: null, respawn: 0, ...o, here: true, wait: 0, spin: Math.random() * 6.28, bob: 0 }; this.list.push(p); return p; }
  remove(p) { this.list = this.list.filter(q => q !== p); return this; }
  /** It was taken: gone, until it respawns. */
  taken(p) { p.here = false; p.wait = p.respawn; if (!p.respawn) this.remove(p); return this; }
  update(dt, who = null) {
    this.t += dt; const out = this.offered; out.length = 0;
    const W = !who ? [] : Array.isArray(who) ? who : [who];
    for (const p of this.list) {
      if (!p.here) { if ((p.wait -= dt) <= 0) p.here = true; continue; }
      p.spin += dt * 1.6; p.bob = Math.sin(this.t * 2.4 + p.spin * .3) * this.bobBy;
      for (const w of W) { const wz = w.z ?? w.y, pz = p.z ?? p.y; if (Math.hypot(w.x - p.x, wz - pz) < this.reach && (w.z == null || Math.abs((w.y ?? 0) - p.y) < 2)) { out.push(p); break; } }
    }
    return out;
  }
  /** Picked up through a Loadout: offers each in reach to it, and those it took are taken. What was taken. */
  collect(dt, who, loadout) { const got = []; for (const p of [...this.update(dt, who)]) if (loadout.take(p) > 0) { this.taken(p); got.push(p); } return got; }
  clear() { this.list = []; return this; }
}
