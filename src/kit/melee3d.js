// Melee in 3D: punches, kicks, shoves and swings of a bat between people standing in a world, for street fights and
// brawls in 3D games. Each move is frames, as in gs.fight's Fighter (start-up, active, recovery; hit stun, block stun,
// cancels), but where a 2D move has boxes a 3D one has a reach, an arc in front and a height. Buttons chain into
// combos (jab, cross, hook, uppercut), a blow buffered a moment early still counts, the guard blocks what comes from in
// front, a dodge steps out of the way and can't be hit for a moment, and an attack turns and steps in onto the foe it
// locks on to. It says what landed, where and how hard, in the terms gs.characters.Reactions takes, so a person who is
// hit staggers, stumbles and falls for real. Your game moves the bodies, plays the poses and keeps the score.
//
//   const { Melee, Brawler } = gs.fight;
//   reset() {
//     me = new Melee(hero, { react: heroReact });                 // hero: an Object3D (position, rotation.y), or { x, y, z, yaw }
//     them = new Melee(thug, { react: thugReact });
//     ai = new Brawler({ skill: .5 });                             // a ready-made foe
//   }
//   update(dt) {
//     if (punchTapped) me.attack('light'); if (kickTapped) me.attack('heavy'); me.block(guardHeld); if (swiped) me.dodge(swipeDir);
//     const t = ai.think(dt, them, me); them.attack(t.attack); them.block(t.block); if (t.dodge) them.dodge(t.dodge);
//     for (const hit of [...me.update(dt, [them]), ...them.update(dt, [me])]) { hit.who.hp -= hit.damage; feel.hit(...) }
//     hero.position.x += (me.walk.x + stick.x * 3) * dt ...; hero.rotation.y = me.facing ?? hero.rotation.y;
//     heroRig.play(me.pose || 'idle', me.pose ? { at: me.at } : {});
//   }
//
// With react (a Reactions on that body) a hit is passed on to it (react.hit, trip, fall); without, read hit.push and hit.at
// and do it yourself. Positions are metres with y up; yaw 0 faces +z (as rotation.y and gs.poses figures).

const FRAME = 1 / 60;
const hyp = (x, z) => Math.sqrt(x * x + z * z);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const HEIGHT = { high: 1.55, mid: 1.15, low: .35 };

/**
 * Fists and feet. Each move: button ('light' | 'heavy' | your own), start, active, recover (frames), reach (metres from
 * the body's middle to the end of the blow), arc (radians in front it sweeps), height ('high' | 'mid' | 'low'), damage,
 * push (metres a second it shoves the one hit), stun (frames they can't act), lunge (metres it steps in while starting),
 * then ({ button: next move }: a combo), knock (the blow puts them down), trip (low: takes their feet), pose, armed (a
 * weapon swings it).
 */
export const FISTS = {
  jab: { button: 'light', start: 5, active: 3, recover: 9, reach: .95, arc: .7, height: 'high', damage: 5, push: .9, stun: 14, lunge: .25, then: { light: 'cross', heavy: 'knee' }, pose: 'jab' },
  cross: { button: 'light', start: 6, active: 3, recover: 11, reach: 1.0, arc: .7, height: 'high', damage: 7, push: 1.3, stun: 16, lunge: .3, then: { light: 'hook', heavy: 'kick' }, pose: 'cross' },
  hook: { button: 'light', start: 8, active: 4, recover: 14, reach: .9, arc: 1.4, height: 'high', damage: 9, push: 2.0, stun: 20, lunge: .2, then: { light: 'uppercut' }, pose: 'hook' },
  uppercut: { button: 'light', start: 10, active: 4, recover: 20, reach: .8, arc: .8, height: 'high', damage: 14, push: 3.2, up: 1.2, stun: 30, lunge: .25, knock: true, pose: 'uppercut' },
  kick: { button: 'heavy', start: 11, active: 4, recover: 18, reach: 1.3, arc: .8, height: 'mid', damage: 11, push: 2.6, stun: 24, lunge: .3, then: { light: 'jab' }, pose: 'kick' },
  knee: { button: 'heavy', start: 7, active: 3, recover: 14, reach: .75, arc: .8, height: 'mid', damage: 9, push: 1.6, stun: 22, lunge: .35, then: { light: 'hook' }, pose: 'knee' },
  sweep: { button: 'low', start: 9, active: 4, recover: 20, reach: 1.25, arc: 1.2, height: 'low', damage: 6, push: 1.2, stun: 30, trip: true, pose: 'sweep' },
  shove: { button: 'push', start: 6, active: 4, recover: 14, reach: .9, arc: 1.0, height: 'mid', damage: 2, push: 3.0, stun: 18, lunge: .3, unblockable: true, pose: 'shove' },
};
/** Swinging something held (a bat, a pipe, a stick): wider and longer, slower to start. */
export const SWINGS = {
  swing: { button: 'light', start: 12, active: 5, recover: 16, reach: 1.55, arc: 1.9, height: 'high', damage: 16, push: 2.6, stun: 24, lunge: .25, then: { light: 'backhand', heavy: 'overhead' }, pose: 'swing', armed: true },
  backhand: { button: 'light', start: 10, active: 5, recover: 18, reach: 1.5, arc: 1.9, height: 'high', damage: 16, push: 2.8, stun: 24, lunge: .2, then: { heavy: 'overhead' }, pose: 'backhand', armed: true },
  overhead: { button: 'heavy', start: 18, active: 4, recover: 24, reach: 1.45, arc: .7, height: 'high', damage: 28, push: 3.4, stun: 34, lunge: .35, knock: true, pose: 'overhead', armed: true },
  jabWith: { button: 'push', start: 6, active: 3, recover: 12, reach: 1.25, arc: .6, height: 'mid', damage: 7, push: 2.6, stun: 18, lunge: .3, unblockable: true, pose: 'shove', armed: true },
  sweep: FISTS.sweep,
};
// a shield's bash (with a shield, on 'push'): it knocks the guard aside and can't be blocked
const BASH = { button: 'push', start: 6, active: 4, recover: 14, reach: .95, arc: 1.3, height: 'mid', damage: 4, push: 3.4, stun: 30, lunge: .4, unblockable: true, guardBreak: true, pose: 'bash', shield: true, edge: 'blunt' };
const KICK = { ...FISTS.shove, pose: 'shove', armed: false };
/** A one-handed sword (a dagger with weapon.quick): a cut from the right, one back from the left, a chop down, a thrust, a cut at the legs; a shield's bash. */
export const BLADES = {
  slash: { button: 'light', start: 8, active: 4, recover: 12, reach: 1.3, arc: 1.6, height: 'high', damage: 14, push: 1.6, stun: 20, lunge: .3, then: { light: 'cutBack', heavy: 'thrust' }, pose: 'slash', armed: true },
  cutBack: { button: 'light', start: 7, active: 4, recover: 14, reach: 1.3, arc: 1.6, height: 'high', damage: 13, push: 1.6, stun: 20, lunge: .2, then: { light: 'chop', heavy: 'thrust' }, pose: 'cutBack', armed: true },
  chop: { button: 'light', start: 13, active: 4, recover: 20, reach: 1.25, arc: .6, height: 'high', damage: 22, push: 2.4, stun: 30, lunge: .3, pose: 'chop', armed: true },
  thrust: { button: 'heavy', start: 10, active: 3, recover: 16, reach: 1.6, arc: .35, height: 'mid', damage: 18, push: 1.4, stun: 22, lunge: .45, edge: 'point', then: { light: 'slash' }, pose: 'thrust', armed: true },
  lowCut: { button: 'low', start: 9, active: 4, recover: 16, reach: 1.2, arc: 1.4, height: 'low', damage: 10, push: .8, stun: 22, lunge: .2, pose: 'lowCut', armed: true },
  bash: BASH, shove: KICK,
};
/** An axe or a mace in one hand: wide hacks, a blow from overhead that puts them down, a hook that pulls the guard aside. */
export const AXES = {
  hack: { button: 'light', start: 11, active: 4, recover: 15, reach: 1.25, arc: 1.7, height: 'high', damage: 18, push: 2.2, stun: 24, lunge: .3, then: { light: 'hackBack', heavy: 'cleave' }, pose: 'slash', armed: true },
  hackBack: { button: 'light', start: 10, active: 4, recover: 17, reach: 1.25, arc: 1.7, height: 'high', damage: 17, push: 2.2, stun: 24, lunge: .2, then: { heavy: 'cleave' }, pose: 'cutBack', armed: true },
  cleave: { button: 'heavy', start: 17, active: 4, recover: 24, reach: 1.25, arc: .6, height: 'high', damage: 30, push: 3.2, stun: 34, lunge: .35, knock: true, pose: 'chop', armed: true },
  hook: { button: 'low', start: 9, active: 4, recover: 16, reach: 1.15, arc: 1.0, height: 'mid', damage: 6, push: -1.2, stun: 26, lunge: .2, guardBreak: true, pose: 'hook', armed: true },
  bash: BASH, shove: KICK,
};
/** A spear in both hands: quick thrusts that keep a foe out, a hard one high, a sweep of the legs, a shove with the shaft. */
export const SPEARS = {
  thrust: { button: 'light', start: 7, active: 3, recover: 12, reach: 2.1, arc: .3, height: 'mid', damage: 13, push: 1.8, stun: 18, lunge: .25, edge: 'point', then: { light: 'thrust2', heavy: 'lunge' }, pose: 'spearThrust', armed: true },
  thrust2: { button: 'light', start: 6, active: 3, recover: 14, reach: 2.1, arc: .3, height: 'mid', damage: 13, push: 1.8, stun: 18, lunge: .2, edge: 'point', then: { heavy: 'lunge' }, pose: 'spearThrust', armed: true },
  lunge: { button: 'heavy', start: 13, active: 4, recover: 20, reach: 2.4, arc: .3, height: 'high', damage: 22, push: 2.8, stun: 28, lunge: .7, edge: 'point', pose: 'spearLunge', armed: true },
  sweep: { button: 'low', start: 10, active: 4, recover: 20, reach: 1.9, arc: 1.4, height: 'low', damage: 7, push: 1.2, stun: 30, trip: true, pose: 'spearSweep', armed: true, edge: 'blunt' },
  shaft: { button: 'push', start: 6, active: 4, recover: 14, reach: 1.0, arc: 1.0, height: 'mid', damage: 3, push: 3.2, stun: 22, lunge: .3, unblockable: true, pose: 'shove', armed: true, edge: 'blunt' },
};
/** A staff in both hands: swings from either side, a jab with its end, a blow from overhead, a sweep. */
export const STAVES = {
  swing: { ...SWINGS.swing, damage: 13, reach: 1.6, then: { light: 'backhand', heavy: 'jab' }, edge: 'blunt' },
  backhand: { ...SWINGS.backhand, damage: 13, reach: 1.6, then: { light: 'overhead', heavy: 'jab' }, edge: 'blunt' },
  overhead: { ...SWINGS.overhead, damage: 22, reach: 1.55, edge: 'blunt' },
  jab: { button: 'heavy', start: 7, active: 3, recover: 13, reach: 1.7, arc: .4, height: 'mid', damage: 9, push: 2.6, stun: 20, lunge: .3, then: { light: 'swing' }, pose: 'spearThrust', armed: true, edge: 'blunt' },
  sweep: { button: 'low', start: 10, active: 4, recover: 18, reach: 1.7, arc: 1.6, height: 'low', damage: 6, push: 1.2, stun: 30, trip: true, pose: 'spearSweep', armed: true, edge: 'blunt' },
  shaft: SPEARS.shaft,
};
/**
 * Each weapon's numbers for Melee (gs.combat's ARSENAL[kind].melee is the same): reach, damage, arc over its move set's,
 * moves (the set's name), edge ('cut' | 'point' | 'blunt': how armour takes it), quick (a dagger: its moves start and end
 * sooner), hands. shield: how a shield guards (arc it covers, chip of a blow that gets through, parry frames).
 */
export const ARMS = {
  bat: { reach: 0, damage: 1, arc: 0, edge: 'blunt' }, pipe: { reach: -.08, damage: 1.1, arc: -.1, edge: 'blunt' },
  wrench: { reach: -.45, damage: .9, arc: -.3, edge: 'blunt' }, baton: { reach: -.25, damage: .7, arc: 0, edge: 'blunt' },
  sword: { moves: 'BLADES', reach: 0, damage: 1, arc: 0, edge: 'cut', hands: 1 },
  longsword: { moves: 'BLADES', reach: .2, damage: 1.3, arc: 0, edge: 'cut', hands: 2 },
  dagger: { moves: 'BLADES', reach: -.45, damage: .6, arc: -.3, edge: 'point', quick: .7, hands: 1 },
  axe: { moves: 'AXES', reach: 0, damage: 1, arc: 0, edge: 'cut', hands: 1 },
  mace: { moves: 'AXES', reach: -.1, damage: 1, arc: 0, edge: 'blunt', hands: 1 },
  spear: { moves: 'SPEARS', reach: 0, damage: 1, arc: 0, edge: 'point', hands: 2 },
  staff: { moves: 'STAVES', reach: 0, damage: 1, arc: 0, edge: 'blunt', hands: 2 },
};
export const SHIELD = { arc: 2.6, chip: 0, parry: 10 };
/** The move sets by name (an ARMS entry's moves). */
export const MOVESETS = { FISTS, SWINGS, BLADES, AXES, SPEARS, STAVES };
// how much of a blow armour takes, by what it is (plate, brigandine, leather, a helm), by how the blow lands (its edge)
const PROTECT = { plate: .6, brigandine: .45, leather: .25, helmet: .5, nasal: .45, kettle: .5, sallet: .55, great: .6, circlet: 0 };
const EDGE = { cut: 1, point: .7, blunt: .45 };
const AT = { high: ['head', 'chest', 'shoulders'], mid: ['chest', 'arms', 'hands', 'thighs'], low: ['thighs', 'shins', 'feet'] };

/**
 * One person's melee. body: an Object3D (position, rotation.y) or { x, y, z, yaw }. moves (FISTS); radius (.35) and
 * height (1.8) of the body to hit; lock: metres it looks for a foe to lock on to (3.5); turn: radians a second it turns
 * onto them while attacking (10); react: a gs.characters.Reactions on this body (hits on it are passed on); buffer:
 * seconds a press is kept (.25); weapon: { reach, damage, arc } added to the moves (a bat: reach .5, damage 1.6 times), or a
 * kind of ARMS ('sword', 'axe', 'spear'...): its numbers and its move set (BLADES, AXES, SPEARS, STAVES) when
 * moves isn't given. shield: true (or { arc, chip, parry }): the guard covers a wider arc and low blows, nothing gets through it,
 * the parry window is longer and 'push' bashes. parry: frames before a blow lands that a guard raised then parries it (6):
 * nothing gets through and the one who swung is left open. armour: 0..1 of a blow it takes, { high, mid, low }, or 'auto' (what
 * a gs.models.human body wears: plate takes more than leather, and a blunt blow gets through armour better than a cut).
 */
export class Melee {
  constructor(body, { moves = null, radius = .35, height = 1.8, lock = 3.5, turn = 10, react = null, buffer = .25, weapon = null, hp = 100, shield = null, parry = 6, armour = 0 } = {}) {
    if (typeof weapon === 'string') { const A = ARMS[weapon]; if (!A) throw new Error(`gs.fight.Melee: '${weapon}' is not a weapon to fight with (try ${Object.keys(ARMS).join(', ')})`); weapon = { kind: weapon, ...A }; }
    moves ||= MOVESETS[weapon?.moves] || (weapon ? SWINGS : FISTS);
    if (shield === true || typeof shield === 'string') shield = { ...SHIELD }; else if (shield) shield = { ...SHIELD, ...shield };
    Object.assign(this, { body, moves, radius, height, lockRange: lock, turnRate: turn, react, buffer, weapon, hp, maxHp: hp, shield, parryWindow: shield?.parry ?? parry, armour });
    // (the pose for the guard: fists up, a shield up, a blade or a spear held out)
    this.guardPose = shield ? 'shieldUp' : weapon?.moves === 'SPEARS' || weapon?.moves === 'STAVES' ? 'spearGuard' : weapon?.moves ? 'armed' : 'guard';
    this.handlers = {}; this.reset();
  }
  reset() {
    this.move = null; this.name = null; this.frame = 0; this.acc = 0; this.stun = 0; this.stop = 0; this.hitThis = new Set();
    this.guard = false; this.dodgeT = 0; this.dodgeDir = null; this.pressed = null; this.pressT = 0; this.target = null; this.hurtT = 0; this.combo = 0;
    this.walk = { x: 0, z: 0 }; this.facing = null; this.pose = null; this.at = 0; this.hits = []; this.down = false; this.guardT = 0; this.guardDown = 0; this.open = 0;
    return this;
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  // where it is and which way it faces
  get pos() { const b = this.body, p = b.position || b; return { x: p.x, y: p.y ?? 0, z: p.z }; }
  get yaw() { const b = this.body; return b.rotation ? b.rotation.y : b.yaw ?? 0; }
  /** 'start' | 'active' | 'recover' | 'stun' | 'dodge' | 'block' | 'idle' */
  get phase() {
    if (this.stun > 0) return 'stun'; if (this.dodgeT > 0) return 'dodge';
    const m = this.move; if (!m) return this.guard ? 'block' : 'idle';
    return this.frame < m.start ? 'start' : this.frame < m.start + m.active ? 'active' : 'recover';
  }
  /** Doing something it can't just stop (a move, stunned, dodging). */
  get busy() { return this.stun > 0 || this.dodgeT > 0 || !!this.move; }
  /** Can't be hit now (the middle of a dodge, or down). */
  get untouchable() { return this.dodgeT > .1 || this.react?.state === 'down' || this.react?.state === 'falling'; }
  /** Presses a button ('light', 'heavy', 'low', 'push' or your own); kept for `buffer` seconds, so a press a moment early in a combo counts. */
  attack(button) { if (button) { this.pressed = button; this.pressT = this.buffer; } return this; }
  /** Holds the guard up (or not): blocks what comes from in front, except unblockable moves. Raised just before a blow lands (parry frames), it parries it. */
  block(on = true) { on = !!on && this.guardDown <= 0; if (on && !this.guard) this.guardT = 0; this.guard = on; return this; }
  /** The guard was raised in time to parry what lands now. */
  get parrying() { return this.guard && this.guardT <= this.parryWindow / 60; }
  /** How much of a blow at a height ('high' | 'mid' | 'low') with an edge ('cut' | 'point' | 'blunt') the armour takes, 0..1. */
  protect(height = 'mid', edge = 'cut') {
    let a = this.armour; if (!a) return 0;
    if (a === 'auto') { const worn = this.body?.armour?.worn; if (!worn) return 0; const at = AT[height] || AT.mid; a = at.reduce((t, sl) => t + (PROTECT[worn[sl]] || 0), 0) / at.length; }
    else if (typeof a === 'object') a = a[height] ?? 0;
    return Math.max(0, Math.min(.9, a * (EDGE[edge] ?? 1)));
  }
  /** Steps quickly out of the way ({ x, z }: which way, in the world); for most of it nothing can hit it. */
  dodge(dir) {
    if (this.stun > 0 || this.dodgeT > 0 || (this.move && this.phase !== 'recover')) return false;
    const l = hyp(dir.x, dir.z) || 1; this.dodgeDir = { x: dir.x / l, z: dir.z / l }; this.dodgeT = .4; this.move = null; this.name = null; this.combo = 0; this.emit('dodge'); return true;
  }
  // a move's numbers with the weapon's added
  stats(m) {
    const w = m.armed !== false && this.weapon; if (!w) return m;
    const q = w.quick || 1, f = n => Math.max(1, Math.round(n * q));
    return { ...m, reach: m.reach + (w.reach || 0), damage: m.damage * (w.damage || 1), arc: m.arc + (w.arc || 0), edge: m.edge || w.edge || 'cut', ...(q !== 1 ? { start: f(m.start), recover: f(m.recover) } : {}) };
  }
  /** The nearest foe in front within reach to lock on to, of a list (each a Melee, or { x, z } / an Object3D). */
  pick(foes) {
    const p = this.pos, y = this.yaw; let best = null, bs = Infinity;
    for (const f of foes) {
      if (f === this || f.hp <= 0) continue; const q = f.pos || f.position || f, dx = q.x - p.x, dz = q.z - p.z, d = hyp(dx, dz); if (d > this.lockRange) continue;
      const off = Math.abs(wrap(Math.atan2(dx, dz) - y)), score = d + off * 1.2; if (off > 1.9) continue;
      if (score < bs) { bs = score; best = f; }
    }
    return best;
  }
  start(name) {
    const m = this.moves[name]; if (!m) return false;
    this.move = this.stats(m); this.name = name; this.frame = 0; this.acc = 0; this.lunged = 0; this.hitThis.clear(); this.combo = this.combo + 1;
    this.emit('start', name); return true;
  }
  /**
   * Each frame: steps the frames, takes a buffered press (a combo's next move, or a new one), turns and steps in onto the
   * foe locked on to, and tests the blow against foes (Melee, or bodies with position: anything with hp <= 0 is skipped).
   * Returns the hits it landed this frame: [{ who, move, name, blocked, parried, damage, soaked (what armour took), at, push,
   * knock, trip, shield (a shield took it), guardBroken }]; events 'hit' / 'blocked' / 'parried' on the one who struck, 'hurt' /
   * 'block' / 'parry' on the one struck. After: walk ({ x, z }
   * metres a second to move the body by), facing (yaw to turn to, or null), pose and at (the move's pose and how far
   * through it, 0..1), phase.
   */
  update(dt, foes = []) {
    this.hits = []; this.walk = { x: 0, z: 0 }; this.facing = null;
    if (this.guard) this.guardT += dt; if (this.guardDown > 0) { this.guardDown -= dt; this.guard = false; } if (this.open > 0) this.open -= dt;
    if (this.pressT > 0) { this.pressT -= dt; if (this.pressT <= 0) this.pressed = null; }
    if (this.react?.busy) { this.move = null; this.name = null; this.pose = null; this.combo = 0; return this.hits; }   // (off balance: the body is the Reactions' now)
    if (this.stop > 0) { this.stop -= dt; this.posed(); return this.hits; }
    if (this.dodgeT > 0) {
      this.dodgeT -= dt; const v = this.dodgeT > .12 ? 5.5 : 1.5; this.walk = { x: this.dodgeDir.x * v, z: this.dodgeDir.z * v };
      this.posed(); return this.hits;
    }
    // a press: a combo's next move once this one has come out, or a fresh move when free
    if (this.pressed && this.stun <= 0) {
      const m = this.move, next = m ? m.then?.[this.pressed] : null;
      const can = !m ? true : next && this.phase !== 'start' && (this.hitThis.size > 0 || this.phase === 'recover');
      const ok = k => this.moves[k].button === this.pressed && (this.weapon || !this.moves[k].armed) && (!this.moves[k].shield || this.shield);
      const name = m ? next : Object.keys(this.moves).find(ok);
      if (can && name && this.start(name)) { this.pressed = null; this.target = this.pick(foes); }
    }
    if (!this.move) this.combo = this.combo && this.stun <= 0 ? this.combo : 0;
    this.acc += dt;
    while (this.acc >= FRAME) {
      this.acc -= FRAME;
      if (this.stun > 0) { this.stun--; continue; }
      const m = this.move; if (!m) continue;
      const was = this.phase; this.frame++;
      if (was === 'start' && this.phase === 'active') this.emit('active', this.name, m);
      if (this.frame >= m.start + m.active + m.recover) { this.emit('end', this.name); this.move = null; this.name = null; this.combo = 0; }
    }
    const m = this.move;
    if (m) {
      // turn onto the foe locked on to, and step in during the start-up to bring the blow into reach
      const t = this.target, p = this.pos;
      if (t && (t.hp ?? 1) > 0) {
        const q = t.pos || t.position || t, dx = q.x - p.x, dz = q.z - p.z, d = hyp(dx, dz), want = Math.atan2(dx, dz), y = this.yaw;
        this.facing = y + Math.max(-this.turnRate * dt, Math.min(this.turnRate * dt, wrap(want - y)));
        const gap = d - ((t.radius ?? .35) + m.reach * .85);
        if (this.phase === 'start' && gap > 0 && m.lunge) {   // (up to twice its lunge, spread over the start-up frames left)
          const left = Math.max(FRAME, (m.start - this.frame) * FRAME - this.acc), go = Math.min(gap, m.lunge * 2 - (this.lunged || 0)), v = Math.max(0, go / left);
          this.walk = { x: dx / d * v, z: dz / d * v }; this.lunged = (this.lunged || 0) + v * dt;
        }
      } else if (this.phase === 'start' && m.lunge) { const y = this.yaw, v = m.lunge / (m.start * FRAME) * .6; this.walk = { x: Math.sin(y) * v, z: Math.cos(y) * v }; }
      if (this.phase === 'active') for (const f of foes) { if (f !== this) this.test(f, m); }
    }
    this.posed();
    return this.hits;
  }
  posed() {
    const m = this.move;
    if (this.stun > 0 && !m) { this.pose = this.down ? null : 'stagger'; this.at = 0; }
    else if (this.dodgeT > 0) { const y = this.yaw, side = this.dodgeDir.x * Math.cos(y) - this.dodgeDir.z * Math.sin(y), back = -(this.dodgeDir.x * Math.sin(y) + this.dodgeDir.z * Math.cos(y)); this.pose = back > .6 ? 'dodgeBack' : side > 0 ? 'dodgeL' : 'dodgeR'; this.at = 1 - this.dodgeT / .4; }
    else if (m) { this.pose = m.pose || this.name; this.at = Math.min(1, (this.frame + this.acc / FRAME) / (m.start + m.active + m.recover)); }
    else if (this.guard) { this.pose = this.guardPose; this.at = 0; }
    else { this.pose = null; this.at = 0; }
  }
  // does the blow land on f
  test(f, m) {
    if (this.hitThis.has(f) || (f.hp ?? 1) <= 0) return;
    const p = this.pos, q = f.pos || f.position || f, dx = q.x - p.x, dz = q.z - p.z, d = hyp(dx, dz), r = f.radius ?? .35;
    if (d > m.reach + r) return;
    const y = this.facing ?? this.yaw, off = Math.abs(wrap(Math.atan2(dx, dz) - y)); if (off > m.arc / 2 + Math.atan2(r, Math.max(d, .1))) return;
    if (f.untouchable && !(m.height === 'low' && f.react?.state === 'down')) return;
    this.hitThis.add(f);
    const fy = f.yaw ?? (f.rotation ? f.rotation.y : 0), sh = f.shield, side = Math.abs(wrap(Math.atan2(-dx, -dz) - fy)), facing = side < (sh ? sh.arc / 2 + .45 : 1.75);   // (is f facing the blow: a shield covers more)
    const guarded = !!f.guard && !f.busy && facing && (m.height !== 'low' || !!sh);
    const parried = guarded && !m.unblockable && !!f.parrying && !m.shield;
    const blocked = guarded && !m.unblockable;
    const k = d > 1e-3 ? 1 / d : 0, dir = { x: dx * k, z: dz * k };
    const at = { x: p.x + dir.x * Math.min(d, m.reach), y: (q.y ?? 0) + HEIGHT[m.height] * ((f.height ?? 1.8) / 1.8), z: p.z + dir.z * Math.min(d, m.reach) };
    const push = parried ? { x: 0, y: 0, z: 0 } : blocked ? { x: dir.x * m.push * .3, y: 0, z: dir.z * m.push * .3 } : { x: dir.x * m.push, y: m.up || 0, z: dir.z * m.push };
    const soak = blocked ? 0 : f.protect ? f.protect(m.height, m.edge || 'blunt') : 0;
    const damage = parried ? 0 : blocked ? Math.round(m.damage * (sh ? sh.chip ?? 0 : .15)) : Math.round(m.damage * (1 - soak));
    const hit = { who: f, by: this, move: m, name: this.name, blocked, parried, damage, soaked: Math.round(m.damage * soak), at, push, knock: !blocked && !!m.knock, trip: !blocked && !!m.trip, combo: this.combo, shield: blocked && !!sh, guardBroken: false };
    // its frames: hit stun or block stun, and hit stop for both
    if (f instanceof Melee) {
      if (parried) {   // (turned aside: the one who swung is thrown off and left open a moment)
        this.stun = (m.recover ?? 14) + 16; this.move = null; this.name = null; this.combo = 0; this.open = .5;
        f.stun = 0; f.stop = this.stop = 6 * FRAME;
      } else {
        f.stun = blocked ? Math.round((m.stun ?? 14) * (m.guardBreak ? .9 : sh ? .3 : .45)) : (m.stun ?? 14);
        if (guarded && m.guardBreak) { f.guardDown = .55; f.guard = false; hit.guardBroken = true; }   // (a hook or a bash: the guard knocked aside)
        if (!blocked) { f.move = null; f.name = null; f.combo = 0; f.hurtT = .4; }
        f.stop = this.stop = (blocked ? 3 : m.knock ? 8 : 5) * FRAME;
        if (!blocked && f.hp != null) { f.hp = Math.max(0, f.hp - damage); hit.left = f.hp; }
      }
    }
    // the body: a Reactions takes the blow for real
    const R = f.react;
    if (R && !blocked) {
      if (m.trip) R.trip?.(); else if (m.knock || (f.hp != null && f.hp <= 0)) R.fall?.([push.x * 1.2, push.y, push.z * 1.2]); else R.hit?.([push.x, push.y, push.z], at);
    } else if (R && blocked && !parried) R.brace?.(p, m.guardBreak ? 1 : .6);
    this.hits.push(hit);
    if (parried) { this.emit('parried', hit); f.emit?.('parry', hit); } else { this.emit(blocked ? 'blocked' : 'hit', hit); f.emit?.(blocked ? 'block' : 'hurt', hit); }
  }
}

/**
 * A ready-made foe for a 3D brawl: think(dt, me, foe) says what it wants to do this frame, for your game to do: walk
 * ({ x, z } metres a second), face (yaw), attack (a button or null), block (bool), dodge ({ x, z } or null). It closes to
 * striking range, circles while waiting, throws combos when the foe is open (more often after it was hit), blocks or
 * steps out of what it sees coming (no faster than a person reacts), and backs off when hurt. skill 0..1 (or a
 * gs.brains Dial); speed: walking (2.2 m/s); rng.
 */
export class Brawler {
  constructor({ skill = .5, speed = 2.2, rng = Math.random, mean = .5 } = {}) {
    Object.assign(this, { skill, speed, rng, mean }); this.t = 0; this.saw = -1; this.plan = null; this.circle = rng() < .5 ? -1 : 1; this.wait = 0; this.seen = null;
  }
  get level() { const s = +this.skill; return isFinite(s) ? Math.max(0, Math.min(1, s)) : .5; }
  think(dt, me, foe) {
    this.t += dt; const out = { walk: { x: 0, z: 0 }, face: null, attack: null, block: false, dodge: null };
    if (!me || !foe || (foe.hp ?? 1) <= 0 || me.busy && me.phase !== 'recover') return out;
    const p = me.pos, q = foe.pos, dx = q.x - p.x, dz = q.z - p.z, d = hyp(dx, dz) || 1, ux = dx / d, uz = dz / d, sk = this.level;
    out.face = Math.atan2(dx, dz);
    const reach = Math.max(...Object.values(me.moves).filter(m => !m.armed || me.weapon).map(m => me.stats(m).reach)) + (foe.radius ?? .35);
    // what it sees coming: a blow seen after a person's reaction time (quicker the more skilled)
    if (foe.move && foe.phase !== 'recover') {
      if (this.seen !== foe.name + foe.combo) {
        this.seen = foe.name + foe.combo; this.saw = this.t; this.answer = this.rng() < .25 + sk * .6 ? (this.rng() < .3 + sk * .3 ? 'dodge' : 'block') : null;
        // (a skilled one with a guard that can parry waits for the blow and meets it)
        if (this.answer === 'block' && me.parryWindow && this.rng() < (sk - .35) * 1.2) this.answer = 'parry';
      }
      const late = this.t - this.saw > .32 - sk * .18;
      if (late && this.answer && d < foe.stats(foe.move).reach + .8) {
        const low = foe.move.height === 'low' && !me.shield;
        if (this.answer === 'dodge' || foe.move.unblockable || low) out.dodge = { x: -ux * .3 + -uz * this.circle, z: -uz * .3 + ux * this.circle };
        else if (this.answer === 'parry') { const left = foe.phase === 'start' ? (foe.move.start - foe.frame) : 0; out.block = left <= Math.max(1, me.parryWindow - 2); }
        else out.block = true;
        return out;
      }
    } else this.seen = null;
    const hurt = me.hp != null && me.maxHp ? me.hp / me.maxHp : 1;
    if (hurt < .25 && d < reach + 1.5 && this.rng() < .5) { out.walk = { x: -ux * this.speed, z: -uz * this.speed }; out.block = true; return out; }
    if (d > reach * .9) { out.walk = { x: ux * this.speed, z: uz * this.speed }; return out; }
    // in range: wait a moment (circling, guard up), then go in with a combo; quicker against a foe who is open
    this.wait -= dt;
    const open = foe.phase === 'recover' || foe.phase === 'stun' || foe.open > 0 || (!foe.guard && this.rng() < .5);
    if (me.move && me.hitThis.size) { out.attack = this.rng() < .5 + sk * .4 ? 'light' : 'heavy'; return out; }   // (follow up what landed)
    if (this.wait <= 0 && (open || this.rng() < this.mean * dt * 6)) {
      this.wait = .5 + (1 - sk) * .8 + this.rng() * .6;
      const r = this.rng(); out.attack = r < .55 ? 'light' : r < .85 ? 'heavy' : foe.guard ? 'push' : 'low'; return out;
    }
    out.block = this.rng() < .3 + sk * .5; out.walk = { x: -uz * this.circle * this.speed * .45 + (d < reach * .6 ? -ux : 0), z: ux * this.circle * this.speed * .45 + (d < reach * .6 ? -uz : 0) };
    if (this.rng() < dt * .4) this.circle = -this.circle;
    return out;
  }
  /** At the end of a fight: did the player win (a Dial given as its skill follows it). */
  result(playerWon) { this.skill?.result?.(playerWon); return this; }
}
