// Dialogue for story and RPG games: branching conversations written in ink (inklestudios.com/ink,
// the free story language from the makers of 80 Days, MIT licence), and a typewriter that reveals
// text letter by letter. The kit runs the story; your game draws the box, the portraits and the
// choice buttons.
//
//   const { Story, Typewriter } = gs.story;
//   const TALK = `
//   VAR gate = false
//   Halt! Who goes there? #who:guard
//   * [A friend] -> friend
//   * [Nobody] Very funny. #who:guard #mood:cross
//     -> END
//   == friend ==
//   Then pass, friend.
//   ~ gate = true
//   -> END`;
//   reset() { talk = new Story(TALK); line = talk.next(); tw = new Typewriter(line.text, { speed: 40 }); }   // make it in make() or reset()
//   update(dt) { tw.update(dt); if (tw.ticked) sfx(900, .02); }
//   down(x, y) {
//     if (!tw.done) return tw.skip();                        // first tap shows the whole line
//     if (line.choices.length) talk.choose(pickedChoice(x, y)); // choices: [{ text, index }]
//     if (talk.ended) return close();
//     line = talk.next(); tw.show(line.text);
//   }
//   draw(c) { box(c); text(c, tw.shown, ...); if (tw.done) line.choices.forEach(drawButton); }
//   line.tags: { who: 'guard', mood: 'cross' } from '#who:guard #mood:cross';  talk.vars.gate: ink variables
//
// A conversation in 3D (Talk): the same ink, played by people. Each line's #who: speaks in its own voice
// with its face moving to the words, the faces look at each other, #mood: shows on the speaker's face,
// and the kit picks camera shots as a film does (over the listener's shoulder, a close-up, the two of
// them), keeping to one side of the line between them. The game's world comes in as ink variables and
// functions, and what the player chooses goes back out (deeds, items, XP, quest steps).
//
//   const { Story, Talk } = gs.story;
//   const TALK = `
//   EXTERNAL did(deed)
//   VAR town_rank = "neutral"
//   Back again, are you? #who:mara #mood:frown #shot:over
//   * {town_rank == "loved"} [Ask for the key] Anything for you. #who:mara #mood:smile #do:nod
//     ~ did("helped")
//   * [Leave] -> END`;
//   reset() {
//     talk = new Talk(new Story(TALK), { cast: { hero: { person: me }, mara: { person: mara, voice: 'woman', pitch: 1.1 } },
//       hero: 'hero', camera: view.camera, view });   // (the game's Reputation, Growth, Quests... found by themselves)
//     talk.on('do', (move, who) => cast[who].rig.play(move)).start();
//   }
//   update(dt) { talk.update(dt); }                      // types the line, speaks it, moves the faces and the camera
//   down(x, y) { if (talk.choices.length) talk.choose(pickedChoice(x, y)); else talk.tap(); }
//   draw(c) { box(c, talk.who, talk.shown); talk.choices.forEach(drawButton); }   // talk.who: the speaker's name
//
// Tags on a line: #who:id (the cast; none: a narrator), #mood:angry (or 'smile .5'; any face shape),
// #look:id (who the speaker looks at), #shot:over | close | two | wide | none (the camera), #do:nod (a 'do'
// event for your game: a gesture, a sound), #wait:1 (moves on by itself after the line and a second).
// The game's gs.rpg Reputation, Growth, Quests and Flags (found by themselves, or passed: rep, grow, quests, flags)
// and vars (() => ({ name: value })) set the ink's own VARs of those names before each line (town, town_rank, good,
// fame, level, quest_key, a flag's name); EXTERNAL did(deed), xp(n), quest(id, stage), count(what, n), flag(name),
// and has, give, take(item, n) (a gs.items Inventory) reach them; bind ({ name: fn }) answers any others.
//
// The ink compiler loads the first time a game uses Story (like physics). Ink basics: plain lines
// are said in order, '*' lines are choices, '== name ==' starts a section and '-> name' jumps to it,
// '~ x = 1' sets a variable, '{x: ...}' tests one. Full guide: github.com/inkle/ink.

import { lazy } from './lazy.js';
import { say as sayOut } from './sound.js';
import { linksFor, linked } from './links.js';

const lib = lazy('The story engine', () => import('inkjs/full'));
export const loadStory = () => lib.load();

const parseTags = list => {
  const out = {};
  for (const t of list || []) { const m = String(t).match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/); if (m) out[m[1]] = m[2]; else out[String(t).trim()] = true; }
  return out;
};

export class Story {
  /** source: the ink script (a string in your game file). */
  constructor(source) {
    const ink = lib.get();
    const c = new ink.Compiler(String(source).replace(/^\n+/, ''));
    this.ink = c.Compile();
    if (!this.ink) throw new Error('Story: the ink script has errors: ' + (c.errors || []).join('; '));
    const v = this.ink.variablesState;
    // ink variables as plain properties: talk.vars.gold, talk.vars.gold = 10
    this.vars = new Proxy({}, { get: (_, k) => v.$(String(k)), set: (_, k, val) => { v.$(String(k), val); return true; } });
  }
  /** More to say (or choices to make)? */
  get ended() { return !this.ink.canContinue && !this.ink.currentChoices.length; }
  /** Choices open now: [{ text, index, tags }]. */
  get choices() { return this.ink.currentChoices.map(ch => ({ text: ch.text, index: ch.index, tags: parseTags(ch.tags) })); }
  /** The next line: { text, tags, choices }. choices is filled when the line is the last before a choice. */
  next() {
    if (!this.ink.canContinue) return { text: '', tags: {}, choices: this.choices };
    const text = this.ink.Continue().trim();
    return { text, tags: parseTags(this.ink.currentTags), choices: this.ink.canContinue ? [] : this.choices };
  }
  /** Picks choice i (its index), then next() carries on from there. */
  choose(i) { this.ink.ChooseChoiceIndex(i); return this; }
  /** Jumps to a section ('== shop =='): talk.go('shop'). */
  go(section) { this.ink.ChoosePathString(section); return this; }
  /** Calls fn when ink runs `~ name(args)` (declare it in the ink as `EXTERNAL name(a)`). */
  bind(name, fn) { this.ink.BindExternalFunction(name, fn); return this; }
  /** Where the story is, as a string (for api.save, if it fits). */
  save() { return this.ink.state.ToJson(); }
  load(json) { this.ink.state.LoadJson(json); return this; }
}

/**
 * Text revealed a letter at a time. speed: letters per second; pause: extra seconds at . ! ? and ,
 * Read shown (the text so far), done, and ticked (true on frames a letter appeared: a blip sound).
 */
export class Typewriter {
  constructor(text = '', { speed = 40, pause = .18 } = {}) { this.speed = speed; this.pause = pause; this.show(text); }
  show(text) { this.text = String(text ?? ''); this.n = 0; this.t = 0; this.wait = 0; this.ticked = false; return this; }
  get shown() { return this.text.slice(0, this.n); }
  get done() { return this.n >= this.text.length; }
  skip() { this.n = this.text.length; return this; }
  update(dt) {
    this.ticked = false;
    if (this.done) return this;
    if (this.wait > 0) { this.wait -= dt; return this; }
    this.t += dt * this.speed;
    while (this.t >= 1 && !this.done) {
      this.t -= 1; const ch = this.text[this.n++];
      if (ch !== ' ') this.ticked = true;
      if ('.!?'.includes(ch)) { this.wait = this.pause * 2; this.t = 0; break; }
      if (ch === ',') { this.wait = this.pause; this.t = 0; break; }
    }
    return this;
  }
}

/* ---------------------------------------------------------------- Talk: a conversation played by people */

// Where a thing is in the world, from its world matrix (no three.js here: this kit is for 2D games too).
const worldOf = o => { if (!o) return null; if (o.updateWorldMatrix) o.updateWorldMatrix(true, false); const e = o.matrixWorld?.elements; return e ? { x: e[12], y: e[13], z: e[14] } : { x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0 }; };
const headOf = m => m?.person?.bones?.head || m?.person?.rig?.parts?.head || m?.head || null;
const SHOTS = ['over', 'close', 'two', 'wide', 'none'];

export class Talk {
  /**
   * story: a Story. cast: { id: { person (a gs.models.human or gs.poses person: its face speaks and looks), name,
   * voice, pitch, rate, fx, size (gs.sound.say's), head (an Object3D or () => { x, y, z }: where its head is, for
   * a figure with no bones) } }. hero: the cast id of the player (the listener when nobody is named). camera +
   * view: a camera the kit puts on each shot (view.cut() at each cut); without one read talk.shot. speed:
   * letters a second. voices: false keeps it silent (text only). shots: false leaves the camera alone.
   * rep / grow / vars / bind: the game's world as ink VARs and EXTERNAL functions (see the top of this file).
   */
  constructor(story, { cast = {}, hero = null, camera = null, view = null, speed = 40, voices = true, shots = true, rep, grow, quests, flags, inv, vars = null, bind = {}, link = true } = {}) {
    // (a gs.rpg Reputation, Growth, Quests, Flags and a gs.items Inventory the game made are found by themselves; false: none)
    const L = linksFor(null, link);
    rep = linked(rep, L, 'reputation'); grow = linked(grow, L, 'growth'); quests = linked(quests, L, 'quests'); flags = linked(flags, L, 'flags'); inv = linked(inv, L, 'inventory');
    Object.assign(this, { story, cast, hero, camera, view, voices, shots, rep, grow, quests, flags, varsFn: vars, inv });
    this.tw = new Typewriter('', { speed }); this.handlers = {}; this.line = null; this.mood = {}; this.ended = false; this.started = false;
    this.shot = null; this.shotKind = null; this.side = 0; this.waitT = null; this.said = null;
    const fns = { ...bind };
    if (rep) fns.did ||= deed => { rep.did(String(deed)); return true; };
    if (grow) fns.xp ||= n => grow.gain(+n || 0, 'talk');
    if (quests) { fns.quest ||= (id, stage) => { id = String(id); if (stage) quests.active(id) ? quests.to(id, String(stage)) : quests.start(id, String(stage)); else quests.start(id); return quests.stage(id); }; fns.count ||= (what, n = 1) => quests.count(String(what), +n || 1); }
    if (flags) fns.flag ||= (name, v = true) => { flags.set(String(name), v); return true; };
    if (inv) { fns.has ||= (id, n = 1) => inv.has(String(id), +n || 1); fns.give ||= (id, n = 1) => inv.add(String(id), +n || 1) === 0; fns.take ||= (id, n = 1) => inv.take(String(id), +n || 1); }
    // (ink only lets a function be bound once, and only those it declares; others are the game's own business)
    for (const [k, f] of Object.entries(fns)) { try { story.bind(k, (...a) => { const r = f(...a); return r === undefined ? null : r; }); } catch { /* not declared in this story */ } }
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  // the game's numbers into the ink's own variables of those names
  push() {
    const vs = this.story.ink.variablesState, all = { ...(this.flags ? this.flags.all : {}), ...(this.rep ? this.rep.vars() : {}), ...(this.grow ? { level: this.grow.level, ...this.grow.attrs } : {}), ...(this.quests ? this.quests.vars() : {}), ...(this.varsFn ? this.varsFn() : {}) };
    for (const [k, v] of Object.entries(all)) if (vs.GlobalVariableExistsWithName?.(k)) { try { vs.$(k, v); } catch { /* a type ink won't take */ } }
  }
  /** Starts (at a section of the story, or where it is). */
  start(section = null) { if (section) this.story.go(section); this.started = true; this.ended = false; this.advance(); return this; }
  /** The line's speaker: the cast id, or null for a narrator. */
  get speaker() { return this.line?.who ?? null; }
  /** The speaker's name to draw (cast name, or the id). */
  get who() { const id = this.speaker; return id == null ? '' : this.cast[id]?.name ?? id; }
  /** The line so far (typed out). */
  get shown() { return this.tw.shown; }
  /** The whole line. */
  get text() { return this.line?.text ?? ''; }
  /** Choices open now (once the line is typed out): [{ text, index, tags }]. */
  get choices() { return this.tw.done && this.line ? this.line.choices : []; }
  /** A tap: shows the whole line, or goes on to the next (not while there are choices). */
  tap() {
    if (this.ended || !this.line) return this;
    if (!this.tw.done) { this.tw.skip(); return this; }
    if (this.line.choices.length) return this;
    this.advance(); return this;
  }
  /** Picks a choice (its index from choices), and goes on. */
  choose(i) {
    const c = this.line?.choices.find(x => x.index === i) ?? this.line?.choices[i]; if (!c) return this;
    this.emit('choose', c); this.story.choose(c.index); this.advance(); return this;
  }
  /** Ends it now (faces back to themselves, the voice stopped). */
  stop() { this.finish(); return this; }
  finish() {
    if (this.ended) return; this.ended = true; this.line = null;
    for (const [id, m] of Object.entries(this.mood)) { const f = this.faceOf(id); if (f) f.set(m, 0); }
    this.mood = {}; for (const id of Object.keys(this.cast)) this.faceOf(id)?.look?.(null);
    this.hush(); this.emit('end');
  }
  faceOf(id) { const p = this.cast[id]?.person; return p?.face || null; }
  hush() { for (const id of Object.keys(this.cast)) this.faceOf(id)?.hush?.(); }
  // the next line with words (lines of tags only set the scene), then everything it says to do
  advance() {
    if (this.ended) return;
    this.hush(); this.waitT = null;
    let ln = null, tags = {};
    for (let guard = 0; guard < 200; guard++) {
      this.push();
      if (this.story.ended) break;
      const n = this.story.next(); tags = { ...tags, ...n.tags };
      if (n.text || n.choices.length) { ln = { ...n, tags }; break; }
    }
    if (!ln) { this.finish(); return; }
    const who = ln.tags.who && ln.tags.who !== true ? ln.tags.who : null;
    this.line = { text: ln.text, tags: ln.tags, choices: ln.choices, who };
    this.tw.show(ln.text);
    this.stage(who, ln.tags);
    this.emit('line', this.line);
  }
  // faces, voice and camera for a line
  stage(who, tags) {
    const other = this.listenerOf(who, tags);
    // moods: a new one on the speaker replaces their last
    if (tags.mood && who != null) {
      const [name, amt] = String(tags.mood).split(/\s+/), f = this.faceOf(who);
      if (f) { if (this.mood[who] && this.mood[who] !== name) f.set(this.mood[who], 0); f.set(name, amt != null ? +amt : 1); this.mood[who] = name; }
    }
    // eyes: the speaker on the one spoken to, everyone else on the speaker
    if (who != null) for (const id of Object.keys(this.cast)) {
      const f = this.faceOf(id); if (!f?.look) continue;
      const at = id === who ? (other != null ? headOf(this.cast[other]) || this.cast[other].person : null) : headOf(this.cast[who]) || this.cast[who].person;
      if (at) f.look(at);
    }
    if (tags.do) this.emit('do', String(tags.do), who);
    if (tags.wait != null) this.waitT = tags.wait === true ? 1 : +tags.wait || 0;
    if (this.voices && this.line.text) this.speak(who, this.line.text);
    if (this.shots && who != null) this.frame(tags.shot && tags.shot !== true ? String(tags.shot) : null, who, other);
  }
  listenerOf(who, tags) {
    if (tags.look && tags.look !== true && this.cast[tags.look]) return tags.look;
    if (who !== this.hero && this.hero != null && this.cast[this.hero]) return this.hero;
    return Object.keys(this.cast).find(id => id !== who) ?? null;
  }
  speak(who, text) {
    const c = who != null ? this.cast[who] : null, o = c ? { voice: c.voice ?? null, pitch: c.pitch ?? 1, rate: c.rate ?? 1, fx: c.fx ?? null, size: c.size ?? null } : {};
    const f = this.faceOf(who);
    const p = f?.say ? f.say(text, o) : sayOut(text, o);
    this.said = p && p.then ? p : null;
  }
  // where a cast member's head is (bones, a head of your own, or a little over where it stands)
  headAt(id) {
    const c = this.cast[id]; if (!c) return null;
    if (typeof c.head === 'function') return c.head();
    const h = headOf(c); if (h) return worldOf(h);
    const p = worldOf(c.person); return p ? { x: p.x, y: p.y + 1.62, z: p.z } : null;
  }
  /**
   * The camera for a line, as a film crew would: 'over' the listener's shoulder onto the speaker (the default),
   * 'close' on the speaker, 'two' (both from the side), 'wide', 'none' (the last shot stays). It keeps to one
   * side of the line between the two (the 180 degree rule), so cutting back and forth never flips them over.
   */
  frame(kind, who, other) {
    kind = kind || 'over'; if (!SHOTS.includes(kind)) throw new Error(`Talk: #shot:${kind}: try ${SHOTS.join(', ')}`);
    if (kind === 'none') return;
    const S = this.headAt(who), L = other != null ? this.headAt(other) : null; if (!S) return;
    const base = L || { x: S.x, y: S.y, z: S.z + 2 };
    // the line runs from the hero (or the first of the pair) to the other; its side is picked once
    const a = who === this.hero ? S : base, b = who === this.hero ? base : S;
    let dx = b.x - a.x, dz = b.z - a.z; const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    if (!this.side) this.side = 1;
    const sx = -dz * this.side, sz = dx * this.side, mid = { x: (S.x + base.x) / 2, y: (S.y + base.y) / 2, z: (S.z + base.z) / 2 };
    const toS = { x: (S.x - base.x) / len, z: (S.z - base.z) / len };   // from the listener towards the speaker
    let at, look;
    if (kind === 'over') { at = { x: base.x - toS.x * .7 + sx * .38, y: base.y + .08, z: base.z - toS.z * .7 + sz * .38 }; look = { x: S.x, y: S.y - .04, z: S.z }; }
    else if (kind === 'close') { at = { x: S.x - toS.x * .95 + sx * .22, y: S.y + .02, z: S.z - toS.z * .95 + sz * .22 }; look = { x: S.x, y: S.y - .03, z: S.z }; }
    else if (kind === 'two') { const d = Math.max(1.6, len * 1.35); at = { x: mid.x + sx * d, y: mid.y + .05, z: mid.z + sz * d }; look = { x: mid.x, y: mid.y - .15, z: mid.z }; }
    else { const d = Math.max(3.5, len * 2.6); at = { x: mid.x + sx * d - toS.x * 1.2, y: mid.y + 1.1, z: mid.z + sz * d - toS.z * 1.2 }; look = { x: mid.x, y: mid.y - .5, z: mid.z }; }
    const cut = this.shotKind !== kind || this.lastWho !== who;
    this.shot = { ...at, look, kind, cut }; this.shotKind = kind; this.lastWho = who;
    this.place(cut);
  }
  place(cut) {
    const s = this.shot, cam = this.camera; if (!s || !cam) return;
    cam.position.set(s.x, s.y, s.z); cam.lookAt(s.look.x, s.look.y, s.look.z);
    if (cut) this.view?.cut?.();
  }
  /** Each frame: types the line, and moves on by itself after a #wait line. */
  update(dt) {
    if (this.ended || !this.line) return this;
    this.tw.update(dt);
    if (this.shot) { this.shot.cut = false; if (this.camera && this.shots) { const s = this.shot; this.camera.position.set(s.x, s.y, s.z); this.camera.lookAt(s.look.x, s.look.y, s.look.z); } }
    if (this.tw.done && this.waitT != null && !this.line.choices.length) {
      const talking = this.faceOf(this.speaker)?.talking;
      if (!talking && (this.waitT -= dt) <= 0) this.advance();
    }
    return this;
  }
  /** Where the story is, for a save (ink's own JSON, with the moods on faces). */
  save() { return this.story.save(); }
  load(json) { this.story.load(json); return this; }
}
