// Set pieces and missions: write a mission as a script that waits for things to happen ("reach the
// gate", "kill the four guards", "survive 30 seconds") and makes things happen (spawn a wave, drop
// the bridge, open the door), with objectives to show, zones to enter and checkpoints to restart
// from. The script is a generator function, so it reads top to bottom like a story.
//
//   const { Mission, zone } = gs.missions;
//   reset() {
//     mission = new Mission(function* (m) {
//       m.objective('Reach the radio tower');
//       yield m.until(() => zone(tower, 6).has(player));             // wait for a condition
//       m.checkpoint('tower');                                       // you restart here after a loss
//       m.say('Hold them off until the chopper lands!');
//       spawnWave(1); yield m.wait(2); spawnWave(2);
//       yield m.all(m.wait(30), m.until(() => enemies.length === 0)); // both
//       m.objective('Get to the chopper', { at: heli });
//       yield m.until(() => zone(heli, 3).has(player));
//       m.complete();
//     }, { save: () => ({ hp: me.hp }), load: s => { me.hp = s.hp; } });
//   }
//   update(dt) { mission.update(dt); if (mission.failed) ...; }    // mission.fail('You were spotted')
//   draw: mission.objectives ([{ text, at, done }]), mission.lines (things said), mission.time
//
// On a loss call mission.restart(): it goes back to the last checkpoint by running the script from
// the start with every wait passing at once, then calls your load() with what save() gave there.
// Lines, objectives and events before the checkpoint are skipped; your own calls run again, so
// check mission.replaying before spawning things that belong to earlier parts.
//
// An open world (gs.city and the like) adds three things here:
//   Jobs: missions with a place to start them, a marker for each, unlocks and pay; retry from a checkpoint
//     mid-city puts the player back at mission.respawn. jobs.markers is every marker to draw.
//   Phone: a phone that rings with the next job (the caller speaks through gs.sound.say on a phone line),
//     and texts. Answering a call about a job pins it as the waypoint; the car radio waits while it rings.
//   WorldSave: the world's state (time, weather, money, your cars, jobs done, the radio's station) kept in
//     the 8 KB that api.save() follows the player with: compacted, measured, and saved when it changes.

/** A zone: circle (x, y, r) or box ({ x, y, w, h }); 3D: pass { x, z } points, they read x and z as x and y. */
import { say, sounds, stopTalking } from './sound.js';
// (device.js wants a page: the phone's buzz loads it when it first rings, so these kits also run in Node)
let device = null;
const buzzNow = () => { if (typeof window === 'undefined') return; (device ||= import('./device.js')).then(d => d.haptic('medium'), () => {}); };
import { linksFor } from './links.js';

export function zone(at, r = null) {
  const box = r == null && at.w != null;
  const P = p => ({ x: p.x, y: p.z ?? p.y });
  const c = P(at);
  return {
    has(p) { const q = P(p); return box ? q.x >= at.x && q.y >= (at.z ?? at.y) && q.x <= at.x + at.w && q.y <= (at.z ?? at.y) + at.h : Math.hypot(q.x - c.x, q.y - c.y) <= r; },
    any(list) { return list.some(p => this.has(p)); },
    count(list) { return list.filter(p => this.has(p)).length; },
  };
}

export class Mission {
  /** script: function* (mission) { ... }. save() / load(data): your own state at checkpoints. */
  constructor(script, { save = null, load = null, ctx = null } = {}) {
    this.script = script; this.saveFn = save; this.loadFn = load; this.handlers = {}; this.ctx = ctx;
    this.mark = null; this.marks = {}; this.spots = {}; this.respawn = null; this.restart(true);
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  restart(fresh = false) {
    this.objectives = []; this.lines = []; this.time = 0; this.done = false; this.failed = null; this.waiting = null; this.flags = {};
    this.clock = null; this.leashed = null; this.away = null; this.quit = false;
    this.it = this.script(this, this.ctx); this.skipping = !fresh && this.mark != null;
    if (fresh) { this.mark = null; this.marks = {}; this.spots = {}; this.respawn = null; } else this.respawn = this.mark != null ? this.spots[this.mark] ?? null : null;
    if (!fresh) this.emit('restart', this.mark);
    this.step();
    return this;
  }
  step(value) {
    // runs the script until it yields something not yet true; while skipping to a checkpoint, waits pass at once
    for (let guard = 0; guard < 10000; guard++) {
      const r = this.it.next(value); value = undefined;
      if (r.done) { this.waiting = null; if (!this.done && !this.failed) this.complete(); return; }
      const w = r.value;
      if (!w) continue;
      if (this.skipping) continue;
      if (w.ready(0)) continue;
      this.waiting = w; return;
    }
  }
  update(dt) {
    if (this.done || this.failed) return this;
    this.time += dt;
    if (this.clock) { this.clock.left = Math.max(0, this.clock.left - dt); if (this.clock.left <= 0) { this.fail(this.clock.reason); return this; } }
    if (this.leashed) {
      const L = this.leashed;
      if (L.test()) this.away = null; else { this.away = (this.away ?? L.time) - dt; if (this.away <= 0) { this.fail(L.reason); return this; } }
    }
    for (const l of this.lines) l.life -= dt; this.lines = this.lines.filter(l => l.life > 0);
    if (this.waiting && this.waiting.ready(dt)) { this.waiting = null; this.step(); }
    return this;
  }
  // ---- things a script yields
  /** Waits this many seconds (game time). */
  wait(seconds) { let t = 0; return { kind: 'wait', ready: dt => (t += dt) >= seconds }; }
  /** Waits until test() is true. */
  until(test) { return { kind: 'until', ready: () => !!test() }; }
  /** Waits until all of these are done. */
  all(...ws) { const done = ws.map(() => false); return { kind: 'all', ready: dt => { ws.forEach((w, i) => { if (!done[i] && w.ready(dt)) done[i] = true; }); return done.every(Boolean); } }; }
  /** Waits until any one is done (the index is in mission.which). */
  any(...ws) { return { kind: 'any', ready: dt => { const i = ws.findIndex(w => w.ready(dt)); if (i >= 0) { this.which = i; return true; } return false; } }; }
  // ---- things a script does
  /**
   * Shows a new objective (the last one is ticked off). at: where its marker goes: a point, a thing that moves
   * (read each frame: a car to chase) or a function that gives one. kind ('goal' by default: 'pickup', 'drop',
   * 'enemy', 'escort'...) and icon (a gs.icons name) are for your map and markers.
   */
  objective(text, { at = null, keep = false, kind = 'goal', icon = null } = {}) { if (!keep) for (const o of this.objectives) o.done = true; const o = { text, at, done: false, kind, icon }; this.objectives.push(o); if (!this.skipping) this.emit('objective', o); return o; }
  /**
   * The markers to show for the objectives still to do that have a place: [{ at: { x, y, z }, kind, text, icon }].
   * The same shape as gs.missions Jobs' markers, for your map, GPS and the arrows in the world.
   */
  get markers() {
    const out = [];
    for (const o of this.objectives) { if (o.done || o.at == null) continue; const p = typeof o.at === 'function' ? o.at() : o.at; if (p) out.push({ at: { x: p.x, y: p.y ?? 0, z: p.z ?? p.y ?? 0 }, kind: o.kind || 'goal', text: o.text, icon: o.icon || null }); }
    return out;
  }
  /** A countdown: the mission fails with `reason` when it runs out (mission.clock.left is what to show). timer(null) stops it. */
  timer(seconds, reason = 'Out of time') { this.clock = seconds == null ? null : { left: Math.max(0, seconds), total: Math.max(0, seconds), reason }; return this; }
  /**
   * Keeps the player near: while test() is false (out of the area, out of the van) a countdown of `time` seconds
   * runs (mission.away, to show a warning), and the mission fails with `reason` at 0. leash(null) lets go.
   */
  leash(test, time = 10, reason = 'You left the area') { this.leashed = typeof test === 'function' ? { test, time, reason } : null; this.away = null; return this; }
  /** True while restart() is racing through the script to the checkpoint. */
  get replaying() { return this.skipping; }
  get current() { return [...this.objectives].reverse().find(o => !o.done) || null; }
  /** A line of dialogue or radio chatter (who is optional), shown for `time` seconds. */
  say(text, { who = null, time = Math.max(2, text.length * .06) } = {}) { if (this.skipping) return; const l = { text, who, life: time }; this.lines.push(l); this.emit('say', l); }
  /**
   * Saves a checkpoint here (restart() comes back to it). at: where the player starts again from it in an open
   * world (a point, or a thing whose place is taken now): after restart(), mission.respawn is that point.
   */
  checkpoint(name = 'cp' + Object.keys(this.marks).length, { at = null } = {}) {
    if (this.skipping && name === this.mark) { this.skipping = false; this.respawn = this.spots[name] ?? null; if (this.loadFn) this.loadFn(this.marks[name]); this.emit('checkpoint', name, true); return; }
    if (this.skipping) return;
    const p = typeof at === 'function' ? at() : at;
    this.mark = name; this.marks[name] = this.saveFn ? this.saveFn() : null; this.spots[name] = p ? { x: p.x, y: p.y ?? 0, z: p.z ?? 0 } : null; this.respawn = this.spots[name];
    this.emit('checkpoint', name, false);
  }
  /** Sets and reads flags your script and game share (choices, things found). */
  flag(name, v = true) { this.flags[name] = v; return this; }
  complete() { if (this.done) return; this.done = true; for (const o of this.objectives) o.done = true; this.emit('complete', this.time); }
  fail(reason = 'Mission failed') { if (this.failed || this.done) return; this.failed = reason; this.emit('fail', reason); }
  /** The player gave up: it stops as failed, with mission.quit true (no retry offered). */
  abandon() { if (this.done) return this; this.quit = true; this.fail('Abandoned'); this.emit('abandon'); return this; }
  /** For api.save between sessions: the last checkpoint, its data and where to start from. */
  save() { const s = { m: this.mark, d: this.mark ? this.marks[this.mark] : null }; if (this.mark && this.spots[this.mark]) s.p = this.spots[this.mark]; return s; }
  load(s) { if (s?.m) { this.mark = s.m; this.marks[s.m] = s.d; this.spots[s.m] = s.p ?? null; this.restart(); } return this; }
}

// ---------------------------------------------------------------------------------------------
// Jobs: missions in an open world
const P3 = p => p ? { x: +p.x || 0, y: +(p.y ?? 0) || 0, z: +(p.z ?? p.y ?? 0) || 0 } : null;
const flat = (a, b) => Math.hypot(a.x - b.x, (a.z ?? a.y) - (b.z ?? b.y));

/**
 * The jobs in an open world, each a Mission with a place to start it.
 *
 *   jobs = new Jobs([
 *     { id: 'pies', name: 'Hot Pies', at: { x: 40, z: -12 }, from: 'Nonna Ruth', pay: 150, icon: 'pizza',
 *       call: { from: 'Nonna Ruth', say: ['It is Nonna. The pies are getting cold!', 'Come to the shop.'] },
 *       script: function* (m, job) { m.objective('Take the pies to the docks', { at: docks }); yield m.until(() => zone(docks, 6).has(me)); } },
 *     { id: 'race', needs: ['pies'], at: ..., script: ... },
 *   ], { radius: 4 });
 *   update(dt) { jobs.update(dt, me); }        // me: { x, z } (or x, y in 2D)
 *   jobs.offer: the job whose marker the player is standing on: show "Start" and call jobs.start(jobs.offer.id)
 *   jobs.mission: the Mission running now (its objectives, lines, clock...), or null when roaming
 *   jobs.failed: the reason, after a fail: jobs.retry() (back to the last checkpoint: move the player to
 *     jobs.mission.respawn) or jobs.quit()
 *   jobs.markers: [{ at: { x, y, z }, kind: 'job' | 'goal' | ..., text, icon, pinned, job }] to draw
 *   on('start' | 'done' | 'fail' | 'retry' | 'quit' | 'offer' | 'open', fn)
 *
 * A job: id, name, at (where it starts: a point, a thing, or a function), script (function* (mission, job)),
 * from (who gives it), pay (added to jobs.money when it's done), needs (job ids to finish first, or a
 * function), repeat (it can be played again), icon, call ({ from, say, voice }: a Phone made in the same
 * game rings with it once it opens), save / load (your state at the mission's checkpoints).
 * With start: 'enter', walking onto a marker starts the job without a tap.
 */
export class Jobs {
  constructor(list = [], { radius = 4, start = 'tap', phone = null, calls = 6, link = true } = {}) {
    this.list = list.map(j => ({ pay: 0, repeat: false, needs: null, name: j.id, ...j }));
    this.byId = new Map(this.list.map(j => [j.id, j]));
    this.radius = radius; this.startOn = start; this.handlers = {};
    this.done = new Set(); this.counts = {}; this.money = 0; this.rung = new Set();
    this.active = null; this.mission = null; this.failed = null; this.offer = null; this.pinned = null; this.lastOpen = new Set();
    this.links = linksFor(null, link); this.links?.join('jobs', this); this.given = phone; this.calls = calls; this.quietFor = calls; this.player = null;
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  get phone() { return this.given === false ? null : this.given || this.links?.one('phone') || null; }
  /** Can this job be started now? */
  isOpen(j) {
    j = typeof j === 'string' ? this.byId.get(j) : j;
    if (!j || (this.done.has(j.id) && !j.repeat) || this.active === j) return false;
    if (typeof j.needs === 'function') return !!j.needs(this);
    return !j.needs || [].concat(j.needs).every(id => this.done.has(id));
  }
  get open() { return this.list.filter(j => this.isOpen(j)); }
  /** Where a job starts, now (it may follow something that moves). */
  where(j) { const p = typeof j.at === 'function' ? j.at() : j.at; return P3(p); }
  /** The first open job nobody has called about yet (for a phone call of your own). */
  next() { return this.open.find(j => !this.rung.has(j.id)) || null; }
  /** Marks a job as the waypoint (what a GPS routes to). pin(null) clears it. */
  pin(id) { this.pinned = id && this.byId.has(id) ? id : null; return this; }
  get markers() {
    const out = [];
    if (this.mission && !this.failed) this.mission.markers.forEach((m, i) => out.push({ ...m, pinned: i === 0, job: this.active.id }));   // (the first is where the GPS goes)
    else for (const j of this.open) { const at = this.where(j); if (at) out.push({ at, kind: 'job', text: j.name, icon: j.icon || null, pinned: this.pinned === j.id, job: j.id }); }
    return out;
  }
  /** Starts a job (from its marker, a phone call, a menu): returns its Mission, or null if it can't start now. */
  start(id) {
    const j = this.byId.get(id);
    if (!j || this.mission || !this.isOpen(j)) return null;
    this.active = j; this.failed = null; this.offer = null; if (this.pinned === id) this.pinned = null;
    this.mission = new Mission(j.script, { save: j.save || null, load: j.load || null, ctx: j });
    this.emit('start', j, this.mission);
    return this.mission;
  }
  /** After a fail: back to the last checkpoint (put the player at jobs.mission.respawn when it has one). */
  retry() { if (!this.mission || !this.failed || this.mission.quit) return null; this.failed = null; this.mission.restart(); this.emit('retry', this.active, this.mission.respawn); return this.mission; }
  /** Gives up the job running or failed: it can be started again later from its marker. */
  quit() { if (!this.mission) return this; const j = this.active; this.mission = null; this.active = null; this.failed = null; this.quietFor = this.calls; this.emit('quit', j); return this; }
  update(dt, player = null) {
    if (player) this.player = player;
    const m = this.mission;
    if (m) {
      if (!this.failed) m.update(dt);
      if (m.done) {
        const j = this.active; this.done.add(j.id); this.counts[j.id] = (this.counts[j.id] || 0) + 1; this.money += +j.pay || 0;
        this.mission = null; this.active = null; this.quietFor = this.calls;
        this.emit('done', j, j.pay || 0);
      } else if (m.failed && !this.failed) {
        this.failed = m.failed; this.emit('fail', this.active, m.failed);
        if (m.quit) this.quit();
      }
      this.offer = null;
    } else {
      // roaming: the marker the player is on
      const me = this.player; let best = null, bd = Infinity;
      if (me) for (const j of this.open) { const at = this.where(j); if (!at) continue; const d = flat(at, me); if (d <= (j.radius ?? this.radius) && d < bd) { best = j; bd = d; } }
      if (best !== this.offer) { this.offer = best; if (best) this.emit('offer', best); }
      if (best && this.startOn === 'enter') this.start(best.id);
    }
    // newly opened jobs, and the phone ringing about them when nothing else is on
    const open = this.open, now = new Set(open.map(j => j.id));
    for (const j of open) if (!this.lastOpen.has(j.id)) this.emit('open', j);
    this.lastOpen = now;
    this.quietFor -= dt;
    const ph = this.phone;
    if (ph && !this.mission && this.quietFor <= 0 && ph.state === 'idle') {
      const j = open.find(x => x.call && !this.rung.has(x.id));
      if (j) { this.rung.add(j.id); ph.ring({ ...j.call, from: j.call.from || j.from || 'Unknown', job: j.id }); this.quietFor = this.calls; }
    }
    return this;
  }
  /** For a save (WorldSave keeps it by itself): the jobs done, how often, the money, the pin and a running job's checkpoint. */
  pack() {
    const d = { d: [...this.done], $: this.money };
    const c = Object.entries(this.counts).filter(([, n]) => n > 1); if (c.length) d.c = Object.fromEntries(c);
    if (this.rung.size) d.r = [...this.rung].filter(id => !this.done.has(id));
    if (this.pinned) d.p = this.pinned;
    if (this.mission && this.mission.mark) d.a = { id: this.active.id, ...this.mission.save() };
    return d;
  }
  unpack(d) {
    if (!d || typeof d !== 'object') return this;
    this.done = new Set((d.d || []).filter(id => this.byId.has(id))); this.money = +d.$ || 0;
    this.counts = {}; for (const id of this.done) this.counts[id] = (d.c && d.c[id]) || 1;
    this.rung = new Set([...(d.r || []), ...this.done]); this.pinned = d.p && this.byId.has(d.p) ? d.p : null;
    this.lastOpen = new Set(this.open.map(j => j.id));
    this.mission = null; this.active = null; this.failed = null;
    if (d.a && this.byId.has(d.a.id) && this.start(d.a.id)) this.mission.load(d.a);   // back at its checkpoint: the player goes to mission.respawn
    return this;
  }
}

// ---------------------------------------------------------------------------------------------
// Phone: calls and texts
/**
 * The player's phone. It rings, you answer, the caller talks (spoken on a phone line with gs.sound.say, and
 * shown as text), then hangs up; or it rings out and goes in phone.missed. Texts arrive in phone.inbox.
 *
 *   phone = new Phone();
 *   phone.ring({ from: 'Nonna Ruth', say: ['The pies are ready!', 'Come to the shop.'], voice: { voice: 'woman', pitch: .9 } });
 *   update(dt) { phone.update(dt); }
 *   draw: phone.state ('idle' | 'ringing' | 'call'), phone.call ({ from, line: what is being said now })
 *   tap: phone.answer(), phone.decline(), phone.skip() (the next line)    phone.text('Nonna Ruth', 'Thank you, dear!')
 *   on('ring' | 'answer' | 'line' | 'end' | 'missed' | 'text', fn)
 *
 * A call with a job: (a gs.missions Jobs id) pins that job as the waypoint when it's answered; Jobs made in
 * the same game ring with each job's `call` by themselves. While it rings and while you talk, the car radio
 * (gs.sound Radio) waits. buzz: the phone vibrates with each ring (in the player's haptics setting).
 */
export class Phone {
  constructor({ rings = 6, every = 2.2, buzz = true, link = true, jobs = null, radio = null } = {}) {
    this.rings = rings; this.every = every; this.buzz = buzz; this.handlers = {};
    this.state = 'idle'; this.call = null; this.queue = []; this.inbox = []; this.missed = []; this.t = 0;
    this.links = linksFor(null, link); this.links?.join('phone', this); this.given = { jobs, radio };
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  get jobs() { const g = this.given.jobs; return g === false ? null : g || this.links?.one('jobs') || null; }
  get radio() { const g = this.given.radio; return g === false ? null : g || this.links?.one('radio') || null; }
  /** Rings with a call ({ from, say: [lines], voice: say() options, job }); after: seconds from now. A call while busy waits its turn. */
  ring(call, { after = 0 } = {}) {
    const c = { from: 'Unknown', say: [], ...call, wait: Math.max(0, after) }; c.say = [].concat(c.say).filter(Boolean).map(String);
    this.queue.push(c); return c;
  }
  /** A text message, straight to the inbox. */
  text(from, text) { const m = { from, text: String(text), read: false }; this.inbox.push(m); if (this.inbox.length > 30) this.inbox.shift(); this.emit('text', m); if (this.state === 'idle') sounds.blip?.(1.3); return m; }
  get unread() { return this.inbox.filter(m => !m.read).length; }
  answer() {
    if (this.state !== 'ringing') return this;
    this.state = 'call'; this.t = 0; this.call.at = -1; this.call.line = null;
    const j = this.jobs; if (this.call.job && j?.pin) j.pin(this.call.job);
    this.emit('answer', this.call); this.say();
    return this;
  }
  /** Turns a ringing call away (it goes in missed), or hangs up on one being talked. */
  decline() {
    if (this.state === 'ringing') { this.missed.push(this.call); this.emit('missed', this.call); this.end(); }
    else if (this.state === 'call') { if (this.speaking) stopTalking(); this.end(); }
    return this;
  }
  /** On to the caller's next line. */
  skip() { if (this.state === 'call') { if (this.speaking) stopTalking(); this.speaking = 0; this.readUntil = 0; } return this; }
  say() {
    const c = this.call; c.at++;
    if (c.at >= c.say.length) { this.end(); return; }
    c.line = c.say[c.at]; this.emit('line', c.line, c);
    const read = this.t + .8 + c.line.length * .06, gen = this.speaking = (this.gen = (this.gen || 0) + 1);
    this.readUntil = read; this.sayEnd = this.t + 3 + c.line.length * .12;
    let p; try { p = say(c.line, { ...(c.voice || {}), fx: 'phone' }); } catch { p = false; }
    Promise.resolve(p).then(ok => { if (this.speaking !== gen) return; this.speaking = 0; if (ok) this.readUntil = Math.min(this.readUntil, this.t + .35); }, () => { if (this.speaking === gen) this.speaking = 0; });
  }
  end() {
    const c = this.call; this.state = 'idle'; this.call = null; this.speaking = 0; this.t = 0;
    this.radio?.hold?.(false);
    if (c) this.emit('end', c);
  }
  update(dt) {
    this.t += dt;
    if (this.state === 'idle') {
      for (const c of this.queue) c.wait -= dt;
      const i = this.queue.findIndex(c => c.wait <= 0);
      if (i >= 0) {
        this.call = this.queue.splice(i, 1)[0]; this.state = 'ringing'; this.t = 0; this.rung = 0;
        this.radio?.hold?.(true); this.emit('ring', this.call);
      }
      return this;
    }
    if (this.state === 'ringing') {
      if (this.t >= this.rung * this.every) {
        if (this.rung >= this.rings) { this.missed.push(this.call); this.emit('missed', this.call); this.end(); return this; }
        this.rung++; sounds.ring?.(); if (this.buzz) buzzNow();
      }
      return this;
    }
    // on a call: the next line once this one is said (or, with no speech, once it could be read)
    if (this.speaking && this.t > this.sayEnd) { this.speaking = 0; stopTalking(); }
    if (!this.speaking && this.t >= this.readUntil) this.say();
    return this;
  }
  /** For a save (WorldSave keeps it by itself): the last few texts. */
  pack() { return this.inbox.length ? { i: this.inbox.slice(-8).map(m => [m.from, m.text, m.read ? 1 : 0]) } : {}; }
  unpack(d) { if (Array.isArray(d?.i)) this.inbox = d.i.map(([from, text, read]) => ({ from, text, read: !!read })); return this; }
}

// ---------------------------------------------------------------------------------------------
// WorldSave: the world's state in the 8 KB that follows the player
const LIMIT = 8192;
/** Rounds every number to `places` (the bulk of a world's save is coordinates and timers). */
export function compact(v, places = 2) {
  const k = 10 ** places;
  return JSON.parse(JSON.stringify(v ?? null, (_, x) => typeof x === 'number' ? (Number.isFinite(x) ? Math.round(x * k) / k : 0) : x));
}
/** A list of records as columns: rows(cars, ['style', 'colour', 'x', 'z']) -> [['jeep', '#c33', 10.5, 3], ...]; the names aren't repeated. */
export function rows(list, keys) { return (list || []).map(o => keys.map(k => o[k] ?? null)); }
/** And back: unrows(data, keys) -> [{ style, colour, x, z }, ...]. */
export function unrows(data, keys) { return Array.isArray(data) ? data.map(r => Object.fromEntries(keys.map((k, i) => [k, Array.isArray(r) ? r[i] ?? null : null]))) : []; }

/**
 * Keeps an open world's state in api.save() (8 KB of JSON that follows the player to a new phone).
 *
 *   save = new WorldSave(api);
 *   save.keep('world', () => ({ hour: sky.time, rain: weather.kind, cash }), d => { sky.time = d.hour; ... });
 *   save.keep('cars', () => rows(garage, ['style', 'colour', 'x', 'z']), d => garage = unrows(d, [...]), { optional: true });
 *   save.load();            // in make(), once everything is made: puts each part back
 *   update(dt) { save.update(dt); }   // saves when something changed, at most every `every` seconds
 *   save.now()              // straight away (after a job, on the pause menu)
 *
 * A gs.missions Jobs and Phone and a gs.sound Radio made in the same game are kept by themselves (jobs done,
 * money, a running job's checkpoint; texts; the station), unless you keep() them yourself or pass link: false.
 * Numbers are rounded to `places`; if it all comes to more than 8 KB, the optional parts are left out, last
 * kept first (save.dropped names them, and the console says so). save.size: bytes used; save.room: left.
 */
export class WorldSave {
  constructor(api, { every = 8, places = 2, limit = LIMIT, link = true } = {}) {
    this.api = api; this.every = every; this.places = places; this.limit = Math.min(LIMIT, limit);
    this.parts = []; this.t = 0; this.last = null; this.size = 0; this.dropped = []; this.loaded = false;
    this.links = linksFor(null, link);
  }
  /** A part of the save: give() returns its data, take(data) puts it back. optional: may be left out when full. */
  keep(name, give, take = null, { optional = false } = {}) {
    if (give && typeof give === 'object' && typeof give.pack === 'function') { const o = give; give = () => o.pack(); take = d => o.unpack(d); }
    this.parts = this.parts.filter(p => p.name !== name); this.parts.push({ name, give, take, optional }); return this;
  }
  // what the game made that keeps itself: jobs, the phone, the radio
  get all() {
    const out = [...this.parts], L = this.links;
    if (L) for (const [kind, key] of [['jobs', 'J'], ['phone', 'P'], ['radio', 'R']]) {
      const o = L.one(kind); if (!o?.pack || out.some(p => p.name === key || p.obj === o)) continue;
      out.unshift({ name: key, obj: o, give: () => o.pack(), take: d => o.unpack(d), optional: kind !== 'jobs' });
    }
    return out;
  }
  /** The save as it would be written now: { text, size, dropped }. */
  pack() {
    const parts = this.all, data = {};
    for (const p of parts) { try { const d = p.give(); if (d !== undefined && !(p.obj && d && typeof d === 'object' && !Object.keys(d).length)) data[p.name] = compact(d, this.places); } catch (e) { console.warn(`[save] ${p.name}:`, e); } }
    let text = JSON.stringify(data); const dropped = [];
    for (let i = parts.length - 1; text.length > this.limit && i >= 0; i--) if (parts[i].optional && parts[i].name in data) { delete data[parts[i].name]; dropped.push(parts[i].name); text = JSON.stringify(data); }
    return { text, data, size: text.length, dropped, fits: text.length <= this.limit };
  }
  get room() { return this.limit - this.size; }
  /** Puts each part back from the save (call once everything is made). Returns true if there was a save. */
  load() {
    let d = null; try { d = this.api?.load?.(null); } catch { d = null; }
    this.loaded = true;
    if (!d || typeof d !== 'object') { this.last = this.pack().text; return false; }
    for (const p of this.all) if (p.name in d && p.take) try { p.take(d[p.name]); } catch (e) { console.warn(`[save] ${p.name}:`, e); }
    this.last = JSON.stringify(d); this.size = this.last.length;
    return true;
  }
  /** Saves now if anything changed (force: even if not). Returns false when it didn't fit. */
  now(force = false) {
    const p = this.pack(); this.size = p.size; this.t = 0;
    if (p.dropped.join() !== this.dropped.join() && p.dropped.length) console.warn(`[save] over ${this.limit} bytes: left out ${p.dropped.join(', ')}`);
    this.dropped = p.dropped;
    if (!p.fits) { console.warn(`[save] ${p.size} bytes, the limit is ${this.limit}: not saved (mark big parts optional, or keep them with api.saveLocal)`); return false; }
    if (!force && p.text === this.last) return true;
    this.last = p.text;
    try { return this.api?.save?.(p.data) !== false; } catch { return false; }
  }
  update(dt) { this.t += dt; if (this.t >= this.every) this.now(); return this; }
}
