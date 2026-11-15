// People in vehicles (vehicles.js gives every vehicle with seats these): getting in (walking to the door, opening it
// with a hand on its handle, stepping in and sitting down, pulling it shut), sitting at the wheel with both hands on it
// as it turns, getting out again, and being pulled out by someone else, who then gets in. A motorbike is got astride.
// A person in a vehicle, or on the way in or out, is the vehicle's to move: its update(dt) (move() calls it) runs their
// rig and puts their hands where they go, so the game leaves them alone while person.vehicle is set.
// Works with any character on a gs.poses rig (gs.models.human(), figure()); hands go on things only where it has touch().
// Kit use only.
import { Vector3, Object3D } from 'three';
import { linksFor } from '../links.js';

const { PI, abs, min, max, sin, cos, atan2, hypot, sqrt } = Math, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const turnTo = (a, b, t) => { let d = (b - a) % (2 * PI); if (d > PI) d -= 2 * PI; if (d < -PI) d += 2 * PI; return a + d * t; };
const V = new Vector3(), W = new Vector3(), H = new Vector3();

/** Gives a vehicle (root, with shell, seats and maybe doors) enter, exit, pull, putIn, takeOut and who (not sit: a plane's sit is how its nose stands). */
export function riders(root, plan) {
  const shell = root.shell, seats = root.seats, trips = [];
  const hw = (plan.size?.width || 1.8) / 2 - (plan.lean ? 0 : .08);
  // the hip's height over a cushion, and where a rider's hands go: on a car's wheel, at ten to two; on a bike's grips
  const wheel = root.parts.steering, grips = plan.lean ? [root.points.barL, root.points.barR] : null;
  const rim = [new Object3D(), new Object3D()];
  if (wheel) { rim[0].position.set(-.185 * cos(.5), .185 * sin(.5), .01); rim[1].position.set(.185 * cos(.5), .185 * sin(.5), .01); wheel.add(rim[0], rim[1]); }
  // handles to open a door by, on it (so they move as it swings): outside at its back edge, inside a little ahead of that
  for (const d of root.doors || []) {
    const out = new Object3D(), inn = new Object3D(), L = d.length, z = d.at.z + L * .82, y = d.at.y + .12;
    out.position.set(d.at.x + d.side * .05, y, z).sub(d.at); inn.position.set(d.at.x - d.side * .16, y - .05, z - .14).sub(d.at);
    d.part.add(out, inn); d.handle = out; d.inside = inn;
  }
  const wheelSeat = Object.values(seats).find(s => s.steer)?.name || Object.keys(seats)[0];   // (the one with the wheel, the bars or the stick: what null means)
  const seatOf = which => which == null ? seats[wheelSeat] : typeof which === 'string' ? seats[which] : Object.values(seats).find(s => s.who === which) || null;
  const doorOf = seat => seat.door ? root.door(seat.door) : null;
  // where someone stands to get in: outside the swing of the door, by its back edge (a bike's: beside it, on its left; a
  // bus's: at its door); where they step in from: by the seat, just outside the body
  const standAt = seat => {
    const d = doorOf(seat), s = seat.side, p = seat.point.position;
    if (seat.saddle) return new Vector3(-.75, 0, p.z + .1);
    if (d) return new Vector3(s * (hw + .52), 0, d.at.z + d.length * 1.02);
    if (root.points.door && seat.name !== 'pilot' && seat.name !== 'copilot') return root.points.door.position.clone().setY(0);
    return new Vector3(s * (hw + .5), 0, p.z + .2);
  };
  const stepAt = seat => { const p = seat.point.position; return seat.saddle ? new Vector3(-.45, 0, p.z) : new Vector3(seat.side * (hw + .12), 0, p.z + .05); };
  const faceIn = seat => seat.saddle ? PI : -seat.side * PI / 2;   // (towards the car's side: people face +z)
  const handTo = seat => seat.side > 0 ? 'handR' : 'handL';   // (the hand on the door's side: facing the car from outside it is the one nearer the handle, and sitting in it, the one nearer the door)

  // someone's own: their rig run each frame; hips set on the cushion; hands where they go
  const reactsOf = person => person.react || linksFor(null)?.all?.('reactions')?.find(r => r.body === person) || null;
  const pose = (person, name, fade = .3) => person.rig?.play(name, { fade });
  const seatSpot = (person, seat) => {   // the person's place in the shell for their hips to be on the cushion
    const hips = person.rig?.parts?.hips; if (!hips) return seat.point.position.clone();
    person.updateMatrixWorld(true); const h = shell.worldToLocal(hips.getWorldPosition(H));
    return V.copy(seat.point.position).add(W.set(0, seat.saddle ? .05 : .09, seat.saddle ? .02 : .06)).sub(h).add(person.position).clone();
  };
  const touch = (person, pts, o) => { if (person.touch && Object.keys(pts).length) person.touch(pts, o); };
  const at = o => o.getWorldPosition(new Vector3());
  const handsOn = (person, seat, k = 1) => {
    if (!seat.steer || k <= 0) return;
    if (wheel) touch(person, { handL: at(rim[0]), handR: at(rim[1]) }, { blend: k, palms: {} });
    else if (grips?.[0]) touch(person, { handL: at(grips[0]), handR: at(grips[1]) }, { blend: k });
    else if (seat.name === 'driver' && root.points.driver) { /* a wheel drawn into the body (a lorry's, a bus's): the pose's hands */ }
  };

  /** Who sits where: { driver: person | null, ... }. */
  root.who = which => which ? seats[which]?.who ?? null : Object.fromEntries(Object.entries(seats).map(([k, s]) => [k, s.who]));
  /** Puts a person in a seat at once (a car that arrives with its driver in it): no walk, no doors. */
  root.putIn = (person, which = null) => {
    which ??= wheelSeat; const seat = seats[which]; if (!seat) throw new Error(`gs.models.vehicle: no seat '${which}' (try ${Object.keys(seats).join(', ')})`);
    if (seat.who && seat.who !== person) root.takeOut(seat.who);
    end(person); shell.attach(person); person.rotation.set(0, PI, 0); person.vehicle = root; person.seat = seat.name; seat.who = person;
    pose(person, seat.saddle ? 'ride' : seat.steer ? 'drive' : 'sit', 0); person.rig?.update(0); person.position.copy(seatSpot(person, seat));
    return root;
  };
  /** Takes a person out of their seat at once and stands them beside it, theirs again (null if they were in none). */
  root.takeOut = person => {
    const seat = seatOf(person); if (!seat) return null; seat.who = null; end(person);
    person.position.copy(standAt(seat)); person.rotation.set(0, faceIn(seat) + PI, 0); free(person); pose(person, 'idle', 0);
    return person;
  };
  const free = person => {
    const home = root.parent;
    if (home) { home.attach(person); const f = W.set(0, 0, 1).applyQuaternion(person.quaternion); person.rotation.set(0, atan2(f.x, f.z), 0); person.updateMatrixWorld(true); } else shell.remove(person);
    person.vehicle = null; person.seat = null;
  };
  const end = person => { const i = trips.findIndex(t => t.person === person); if (i >= 0) trips.splice(i, 1); };

  // a trip: steps, each { name, time, run(t, dt) }; done once the last ends; then(fn) when it does
  const trip = (person, seat, kind, steps, extra = {}) => {
    end(person);
    const t = { person, seat: seat.name, kind, step: steps[0].name, t: 0, i: 0, steps, done: false, busy: true, ...extra,
      then(fn) { if (this.done) fn(this); else (this.after ||= []).push(fn); return this; } };
    if (!person.vehicle) { shell.attach(person); person.vehicle = root; }
    trips.push(t); return t;
  };
  // walking there along the ground (in the vehicle's own space), turning to go
  // (from the other side, round the nearer end of it: by its corners, a little clear of them)
  const half = (plan.size?.length || 4) / 2 + (plan.mid ? abs(plan.mid) : 0);
  const walkTo = (to, face, speed = 1.5) => ({ name: 'walk', time: null, run(T, dt) {
    const p = T.person;
    if (!T.way) {
      const s = p.position, edge = hw + .55, end = half + .6;
      T.way = [];
      if (Math.sign(s.x || 1) !== Math.sign(to.x || 1) && abs(s.z) < end && abs(to.x) > .3) { const z = Math.sign(s.z + to.z || 1) * end; T.way.push(new Vector3(Math.sign(s.x || 1) * max(edge, abs(s.x)), 0, z), new Vector3(Math.sign(to.x) * edge, 0, z)); }
      else if (abs(s.x) < edge && abs(s.z) < end) T.way.push(new Vector3(Math.sign(s.x || 1) * edge, 0, s.z));
      T.way.push(to);
    }
    const goal = T.way[0], d = W.copy(goal).sub(p.position).setY(0), far = d.length(); p.position.y = 0;
    if (far < .3 && T.way.length > 1) { T.way.shift(); return false; }
    if (far < .06) { p.rotation.y = turnTo(p.rotation.y, face, min(1, dt * 8)); pose(p, 'idle'); p.rig?.update(dt, { speed: 0 }); return abs(turnTo(p.rotation.y, face, 1) - p.rotation.y) < .05; }
    const go = min(far, speed * dt); p.position.addScaledVector(d.normalize(), go);
    p.rotation.y = turnTo(p.rotation.y, atan2(d.x, d.z), min(1, dt * 7)); pose(p, 'walk'); p.rig?.update(dt, { speed });
    return false;
  } });
  // a door opened from outside (or shut: to 0) with the hand on its handle, the hand going with it a little way
  const doorStep = (seat, to, { inside = false, time = .75, speed = 2.2, back = 0 } = {}) => ({ name: to ? 'open' : 'close', time, run(T, dt) {
    const p = T.person, d = doorOf(seat), u = T.t / time;
    if (seat.who === p) { p.rig?.update(dt); p.position.copy(seatSpot(p, seat)); } else { pose(p, 'idle'); p.rig?.update(dt, { speed: 0 }); }
    if (!d) return u >= 1;
    if (u > .3 && d.want !== to) root.open(d.name, to, { speed });
    if (back && u > .3) p.position.x += seat.side * back * dt / time;
    const reach = to ? ease(u / .3) * (1 - ease((d.open - .55) / .3)) : ease(u / .25) * (1 - ease((.35 - d.open) / .3) * (u > .5 ? 1 : 0));
    touch(p, { [handTo(seat)]: at(inside ? d.inside : d.handle) }, { blend: clamp(reach, 0, 1) });
    if (seat.who === p) handsOn(p, seat, 1 - reach);
    return u >= 1 && (to ? d.open >= to - .01 : d.open <= .01);
  } });
  // into the seat: from where they stand, a step to the sill, turning, then down onto the cushion as the legs come in
  const inStep = (seat, time = 1.15) => ({ name: 'in', time, run(T, dt) {
    const p = T.person, u = clamp(T.t / time, 0, 1);
    if (!T.from) { T.from = p.position.clone(); T.r0 = p.rotation.y; T.mid = stepAt(seat); pose(p, seat.saddle ? 'ride' : 'sit', time * .6); }
    p.rig?.update(dt);
    const spot = seatSpot(p, seat), a = ease(u / .45), b = ease((u - .35) / .65), up = seat.saddle ? ease((u - .2) / .4) : b;   // (astride: up first, then the leg over and across)
    p.position.set(lerp(lerp(T.from.x, T.mid.x, a), spot.x, seat.saddle ? ease((u - .45) / .55) : b), lerp(0, spot.y, up), lerp(lerp(T.from.z, T.mid.z, a), spot.z, b));
    p.rotation.y = turnTo(T.r0, PI, ease(u / .8));
    if (u >= 1) { seat.who = p; p.seat = seat.name; if (seat.steer || seat.saddle) pose(p, seat.saddle ? 'ride' : 'drive', .35); }
    return u >= 1;
  } });
  // out of it: the legs out, up off the cushion and a step out to stand clear, facing out
  const outStep = (seat, time = 1.05) => ({ name: 'out', time, run(T, dt) {
    const p = T.person, u = clamp(T.t / time, 0, 1);
    if (!T.from) { T.from = p.position.clone(); T.r0 = p.rotation.y; T.mid = stepAt(seat); T.to = standAt(seat); seat.who = null; pose(p, 'idle', time * .5); }
    p.rig?.update(dt);
    const a = ease(u / .6), b = ease((u - .45) / .55);
    p.position.set(lerp(lerp(T.from.x, T.mid.x, a), T.to.x, b), lerp(T.from.y, 0, ease(u / .5)), lerp(lerp(T.from.z, T.mid.z, a), T.to.z, b));
    p.rotation.y = turnTo(T.r0, faceIn(seat), ease((u - .2) / .8));
    return u >= 1;
  } });
  // seated: their pose, their hips on the cushion, their hands on the wheel as it turns
  const seated = (person, seat, dt) => { person.rig?.update(dt); person.position.copy(seatSpot(person, seat)); if (seat.hold) handsOn(person, seat, 1); };   // (seat.hold = false frees the hands: shooting out of the window)

  /**
   * Someone gets in: walks to the door (from wherever they are, at `walk` metres a second), opens it by its handle, steps
   * in and sits, and pulls it shut behind them (shut: false leaves it open). A motorbike is got astride from its left.
   * Returns the trip: { step, done, then(fn) }; person.vehicle is the vehicle from now on and person.seat the seat once in.
   */
  root.enter = (person, { seat: which = null, walk = 1.5, shut = true } = {}) => {
    which ??= wheelSeat; const seat = seats[which]; if (!seat) throw new Error(`gs.models.vehicle: no seat '${which}' (try ${Object.keys(seats).join(', ')})`);
    if (seat.who && seat.who !== person) return root.pull(which, person, { walk });
    const steps = [walkTo(standAt(seat), faceIn(seat), walk)];
    if (doorOf(seat)) steps.push(doorStep(seat, 1, { back: .12 }));
    steps.push(inStep(seat));
    if (doorOf(seat) && shut) steps.push(doorStep(seat, 0, { inside: true, time: .65, speed: 2.6 }));
    return trip(person, seat, 'enter', steps);
  };
  /** Someone gets out (a seat's name, or the person): opens the door from inside, steps out and stands, and shuts it (shut: false leaves it open). They are the game's again once it is done. */
  root.exit = (which = null, { shut = true } = {}) => {
    const seat = seatOf(which); if (!seat?.who) return null; const person = seat.who;
    const steps = [];
    if (doorOf(seat)) steps.push(doorStep(seat, 1, { inside: true, speed: 2 }));
    steps.push(outStep(seat));
    if (doorOf(seat) && shut) steps.push(doorStep(seat, 0, { speed: 2.4, time: .6 }));
    return trip(person, seat, 'exit', steps, { leaves: true });
  };
  /**
   * Someone (by) pulls whoever sits in a seat out and gets in in their place: they walk to the door, wrench it open,
   * take hold and throw them out onto the road, then get in and shut it. The one thrown out goes down by their
   * gs.characters.Reactions if they have one (made for them, or person.react), else they are stood beside it; trip.thrown
   * is who it was, the moment they leave the seat (theirs, the game's, again). With nobody in the seat it is enter().
   */
  root.pull = (which = null, by, { walk = 2.6, throw: hard = 3.2 } = {}) => {
    which ??= wheelSeat; const seat = seats[which]; if (!seat) throw new Error(`gs.models.vehicle: no seat '${which}'`);
    if (!seat.who) return root.enter(by, { seat: which, walk });
    const victim = seat.who;
    const steps = [walkTo(standAt(seat), faceIn(seat), walk)];
    if (doorOf(seat)) steps.push(doorStep(seat, 1, { speed: 4.5, time: .45, back: .1 }));
    steps.push({ name: 'grab', time: .55, run(T, dt) {   // both hands in to the one at the wheel, who turns and throws an arm up
      const p = T.person, u = T.t / .55; pose(p, 'takedown'); p.rig?.update(dt, { speed: 0 });
      const step = stepAt(seat); p.position.lerp(V.set(step.x + seat.side * .28, 0, step.z + .15), min(1, dt * 6));
      if (seat.who === victim) { victim.rig?.play('sit', { fade: .2 }); victim.rig?.update(dt); victim.position.copy(seatSpot(victim, seat)); const chest = (victim.rig?.parts?.spine || victim).getWorldPosition(new Vector3()); touch(p, { handL: chest, handR: chest.clone().add(W.set(0, -.12, 0)) }, { blend: ease(u * 1.6) }); }
      return u >= 1;
    } });
    steps.push({ name: 'throw', time: .32, run(T, dt) {   // out they come, thrown down on the road
      const p = T.person; pose(p, 'idle'); p.rig?.update(dt, { speed: 0 });
      if (seat.who === victim) {   // (stood just outside the door, facing in, and thrown back from it)
        seat.who = null; T.thrown = victim; shell.updateMatrixWorld(true);
        const react = reactsOf(victim), spot = shell.localToWorld(stepAt(seat).add(W.set(seat.side * (react ? .45 : 1.3), 0, .1))), out = shell.localToWorld(new Vector3(seat.side, 0, .25)).sub(shell.localToWorld(new Vector3())).setY(0).normalize();
        free(victim); if (victim.parent) victim.parent.worldToLocal(spot); victim.position.copy(spot);
        victim.rotation.set(0, atan2(-out.x, -out.z), 0); victim.rig?.play('idle', { fade: 0 }); victim.rig?.update(0);
        const push = out.multiplyScalar(hard); push.y = .6;
        if (react) react.fall(push); else victim.rig?.play('downed', { fade: .25 });
      }
      return T.t >= .32;
    } });
    steps.push(inStep(seat, .95));
    if (doorOf(seat)) steps.push(doorStep(seat, 0, { inside: true, time: .55, speed: 3.2 }));
    return trip(by, seat, 'pull', steps, { victim, thrown: null });
  };

  // each frame: the trips step on, and everyone sitting is posed and holds on
  const up = root.update;
  root.update = dt => {
    up?.(dt);
    for (const T of trips.slice()) {
      const s = T.steps[T.i]; T.t += dt; T.step = s.name;
      if (s.run(T, dt)) { T.i++; T.t = 0; T.from = null; if (T.i >= T.steps.length) { end(T.person); T.done = true; T.busy = false; T.step = 'done'; if (T.leaves) free(T.person); for (const fn of T.after || []) fn(T); } }
    }
    for (const seat of Object.values(seats)) { const p = seat.who; if (p && !trips.some(T => T.person === p)) seated(p, seat, dt); }
    return root;
  };
  Object.defineProperty(root, 'trips', { get: () => trips.slice(), configurable: true });
}
