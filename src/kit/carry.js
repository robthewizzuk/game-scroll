// Things carried on the body and drawn to the hand: a sword at the hip, a greatsword or a bow across the back, a shield
// slung behind, a quiver, a dagger at the belt (or a torch, a lantern, a tool). Each sits at a spot on a bone of the
// person, and draw() sends the hand to it, takes it at the grip and brings it round into the hand; sheathe() puts it
// back. On a gs.models.human the hand reaches with person.touch() (its fingers close round the grip); on a gs.poses
// person or figure the arm reaches by two-bone IK. The game's own pose (a guard, a walk) goes on underneath: carry.update()
// after rig.update() each frame lays the reach over it.
// A thing's own frame: its grip at `grip` (default its origin), its length along `along` (default +y: from the grip to the
// tip of a blade, or up a bow), its flat face along `face` (default +z: the flat of a blade, the front of a shield).
import { Vector3, Quaternion, Matrix4, Mesh, MeshStandardMaterial, CylinderGeometry, Box3 } from 'three';
import { reach } from './characters.js';

/**
 * Where things are carried, on which bone, in the person's own space as they stand (1.8 m, facing +z, the left side at +x):
 * at (where the grip sits), dir (which way its length points from there), face (which way its flat faces), hand (the hand that
 * draws from it). Add your own: new Carry(person, { spots: { name: { bone, at, dir, face, hand } } }).
 */
export const SPOTS = {
  // a sword in its scabbard at the left hip, the hilt forward and up, drawn across the body by the right hand
  hipL: { bone: 'hips', at: [.17, .99, .12], dir: [0, -.5, -.866], face: [1, 0, 0], hand: 'R' },
  hipR: { bone: 'hips', at: [-.17, .99, .12], dir: [0, -.5, -.866], face: [-1, 0, 0], hand: 'L' },
  // across the back, the hilt over the right shoulder (a greatsword, an axe, a staff), drawn by the right hand
  back: { bone: 'spine', at: [-.14, 1.56, -.16], dir: [.42, -.9, -.05], face: [0, 0, -1], hand: 'R' },
  backL: { bone: 'spine', at: [.14, 1.56, -.16], dir: [-.42, -.9, -.05], face: [0, 0, -1], hand: 'L' },
  // a shield slung flat on the back, its face out, taken by the left hand
  shield: { bone: 'spine', at: [0, 1.3, -.17], dir: [0, 1, 0], face: [0, 0, -1], hand: 'L' },
  // a quiver on the back, its mouth over the right shoulder; a bow across the back, string out
  quiver: { bone: 'spine', at: [-.09, 1.36, -.16], dir: [-.28, .96, -.02], face: [0, 0, -1], hand: 'R' },
  bow: { bone: 'spine', at: [.02, 1.3, -.2], dir: [-.55, .83, 0], face: [0, 0, -1], hand: 'L' },
  // a dagger or a tool at the right of the belt, point down
  belt: { bone: 'hips', at: [-.14, 1.0, .1], dir: [.05, -.98, .18], face: [-1, 0, 0], hand: 'R' },
};
// how a human's hand holds a grip: in the fist, the length out of the thumb's side (forward as the arm hangs), the flat across
// (in the hand bone's own space: hanging down, the palm turned in)
const HELD = { R: { at: [.03, -.104, .012], dir: [0, 0, 1], face: [1, 0, 0] }, L: { at: [-.03, -.104, .012], dir: [0, 0, 1], face: [-1, 0, 0] } };
const v3 = a => new Vector3(...a);
// the turn that takes a thing's own (along, face) onto (dir, face)
function turnOnto(along, face, dir, fdir, out = new Quaternion()) {
  const basis = (a, f) => { const x = v3(a).normalize(), y = v3(f).addScaledVector(x, -v3(f).dot(x)).normalize(), z = new Vector3().crossVectors(x, y); return new Matrix4().makeBasis(x, y, z); };
  const m = basis(dir, fdir).multiply(basis(along, face).transpose()); return out.setFromRotationMatrix(m);
}
// a bone's place as the person stands (positions only: a rig's bones are placed without turns as they stand)
function restOf(bone, root) { const p = new Vector3(); for (let b = bone; b && b !== root; b = b.parent) p.add(b.position); return p; }
const ease = t => t * t * (3 - 2 * t);

/**
 * new Carry(person, { spots, time }): person is a gs.models.human, or a gs.poses person or figure (anything with a rig).
 * add(name, thing, spot, { grip, along, face, hand, held, sheath, both, fore }) puts a thing at a spot (one of SPOTS, or { bone, at, dir, face, hand });
 * a gs.models.weapon brings its own grip, hand and hold (a shield and a bow go to the left hand), and one made for two hands
 * (a spear, a staff, a longsword) has the other hand on it (at fore) once drawn: both: false for one hand;
 * held: { at, dir, face } in the hand's own space, if the default grip doesn't suit it; sheath: true or { length, radius, colour }
 * hangs a scabbard there that stays when the thing is drawn.
 * draw(name, { time }) and sheathe(name): the hand goes to it, takes it and brings it round (time: seconds, .55); events
 * 'grab' (the hand has it: the moment for a draw sound), 'drawn', 'stowed'. update(dt) after rig.update() each frame.
 * held(hand) is the name of what is in a hand ('R' | 'L'), or null; busy while a hand is on its way.
 */
export class Carry {
  constructor(person, { spots = {}, time = .55 } = {}) {
    this.person = person; this.spots = { ...SPOTS, ...spots }; this.time = time; this.things = {}; this.moves = []; this.ons = {};
    this.parts = person.bones || person.rig?.parts || {};
    this.human = typeof person.touch === 'function';
  }
  bone(name) { const b = this.parts[name] || (name === 'hips' ? this.person.rig?.parts?.hips : null); if (!b) throw new Error(`gs.characters.Carry: no bone '${name}' to carry on`); return b; }
  on(ev, fn) { (this.ons[ev] ||= []).push(fn); return this; }
  emit(ev, e) { for (const f of this.ons[ev] || []) f(e); }
  add(name, thing, spot, o = {}) {
    const S = typeof spot === 'string' ? this.spots[spot] : spot; if (!S) throw new Error(`gs.characters.Carry: no spot '${spot}' (${Object.keys(this.spots).join(', ')})`);
    // (a gs.models.weapon knows its own grip, which way it runs, which hand holds it and how, and where a second hand goes)
    const W = thing.userData?.weapon, P = thing.points || {};
    const bone = this.bone(S.bone), rest = restOf(bone, this.person), hand = o.hand || (W?.side === 'L' ? 'L' : W ? 'R' : null) || S.hand || 'R';
    const grip = o.grip || (P.grip ? P.grip.position.toArray() : [0, 0, 0]), along = o.along || (W && !W.upright ? [0, 0, -1] : [0, 1, 0]);
    const both = o.both ?? (W?.hands === 2 && !!P.fore), fore = o.fore || (P.fore ? P.fore.position.toArray() : null);
    const t = { name, thing, spot: S, bone, hand, grip: v3(grip), along, face: o.face || (W && !W.upright ? [0, 1, 0] : [0, 0, 1]), held: o.held || W?.held?.[hand] || null, where: 'spot', sheath: null, both: both && !!fore, fore: fore && v3(fore) };
    // where it rests on its bone: the grip at the spot, its length along the spot's
    t.restQ = turnOnto(t.along, t.face, S.dir, S.face); t.restP = v3(S.at).sub(rest).sub(t.grip.clone().applyQuaternion(t.restQ));
    if (o.sheath) t.sheath = this.sheathOf(t, o.sheath === true ? {} : o.sheath, rest);
    this.things[name] = t; this.place(t);
    return t;
  }
  // a plain scabbard: a tapered tube from the grip along the length, on the same bone
  sheathOf(t, { length, radius, colour = '#3b2618' } = {}, rest) {
    // (sized to the thing when not given: as long as it reaches from its grip along its length, a little wider than it)
    if (length == null || radius == null) {
      t.thing.updateMatrixWorld(true); const box = new Box3().setFromObject(t.thing, true), inv = t.thing.matrixWorld.clone().invert(), a = v3(t.along).normalize(), f = v3(t.face).normalize(), c = new Vector3().crossVectors(a, f);
      let far = 0, wide = 0; const p = new Vector3();
      for (let i = 0; i < 8; i++) { p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(inv).sub(t.grip); far = Math.max(far, p.dot(a)); wide = Math.max(wide, Math.abs(p.dot(c))); }
      length ??= Math.max(.1, far * .86); radius ??= Math.min(.06, Math.max(.016, wide * .2 + .012));
    }
    const g = new CylinderGeometry(radius, radius * .7, length, 10, 1); g.translate(0, -length / 2 - .02, 0);
    const m = new Mesh(g, new MeshStandardMaterial({ color: colour, roughness: .75 })); m.castShadow = true; m.name = 'sheath';
    m.quaternion.copy(turnOnto([0, -1, 0], [0, 0, 1], t.spot.dir, t.spot.face)); m.position.copy(v3(t.spot.at).sub(rest));
    t.bone.add(m); return m;
  }
  place(t) {
    const { thing } = t;
    if (t.where === 'spot') { t.bone.add(thing); thing.position.copy(t.restP); thing.quaternion.copy(t.restQ); }
    else { const h = this.handBone(t.hand); h.add(thing); const H = this.heldOf(t); thing.quaternion.copy(H.q); thing.position.copy(H.p); }
  }
  handBone(sd) { return this.parts['hand' + sd] || this.parts['fore' + sd]; }
  heldOf(t) {
    const H = t.held || HELD[t.hand], q = turnOnto(t.along, t.face, H.dir, H.face), at = this.parts['hand' + t.hand] ? H.at : [t.hand === 'R' ? 0 : 0, -.26, .02];
    return { q, p: v3(at).sub(t.grip.clone().applyQuaternion(q)) };
  }
  held(hand = 'R') { for (const k in this.things) { const t = this.things[k]; if (t.where === 'hand' && t.hand === hand) return k; } return null; }
  get busy() { return this.moves.length > 0; }
  draw(name, { time = this.time } = {}) { return this.go(name, 'hand', time); }
  sheathe(name, { time = this.time } = {}) { return this.go(name, 'spot', time); }
  /** Puts a thing straight in the hand or at its spot, with no reach (a round's start). */
  set(name, where) { const t = this.things[name]; if (!t) return false; this.moves = this.moves.filter(m => m.t !== t); t.where = where === 'hand' ? 'hand' : 'spot'; this.place(t); return true; }
  go(name, to, time) {
    const t = this.things[name]; if (!t || t.where === to || this.moves.some(m => m.t === t || m.t.hand === t.hand)) return false;
    this.moves.push({ t, to, time: Math.max(.1, time), at: 0, grabbed: false, from: null }); return true;
  }
  update(dt) {
    this.second();
    if (!this.moves.length) return;
    const P = this.person; P.updateMatrixWorld(true);
    for (const m of this.moves.slice()) {
      const { t } = m; m.at += dt; const u = Math.min(1, m.at / m.time), mid = .45;
      // the hand reaches out to the spot, then back to where its pose has it, the thing now in it (or left behind)
      const w = u < mid ? ease(u / mid) : 1 - ease((u - mid) / (1 - mid));
      // where the hand goes: the grip as it sits at the spot (first, so a thing taken this frame is taken from where the hand now is)
      const g = new Vector3().copy(t.grip).applyQuaternion(t.restQ).add(t.restP); t.bone.localToWorld(g);
      this.reachTo(t.hand, g, w); P.updateMatrixWorld(true);
      if (!m.grabbed && u >= mid) {
        m.grabbed = true;
        const wq = new Quaternion(), wp = new Vector3(); t.thing.getWorldQuaternion(wq); t.thing.getWorldPosition(wp);
        t.where = m.to; this.place(t);
        // (from where it was, eased into its place: no jump as it changes hands)
        const par = t.thing.parent; par.updateMatrixWorld(true); const pq = par.getWorldQuaternion(new Quaternion()).invert();
        m.from = { q: pq.clone().multiply(wq), p: par.worldToLocal(wp.clone()), q1: t.thing.quaternion.clone(), p1: t.thing.position.clone() };
        this.emit('grab', { name: t.name, to: m.to });
      }
      if (m.from) { const k = ease(Math.min(1, (u - mid) / (1 - mid) * 1.6)); t.thing.quaternion.slerpQuaternions(m.from.q, m.from.q1, k); t.thing.position.lerpVectors(m.from.p, m.from.p1, k); }
      if (u >= 1) { this.moves.splice(this.moves.indexOf(m), 1); if (m.from) { t.thing.quaternion.copy(m.from.q1); t.thing.position.copy(m.from.p1); } this.emit(m.to === 'hand' ? 'drawn' : 'stowed', { name: t.name }); }
    }
  }
  // a thing held in both hands (a spear, a staff, a longsword): the other hand onto it, each frame
  second() {
    let any = null; for (const k in this.things) { const t = this.things[k]; if (t.both && t.where === 'hand' && !this.moves.some(m => m.t === t)) { any = t; break; } }
    if (!any) return;
    this.person.updateMatrixWorld(true);
    const p = any.fore.clone(); any.thing.localToWorld(p);
    this.reachTo(any.hand === 'R' ? 'L' : 'R', p, 1, true);
  }
  reachTo(sd, point, w, keep = false) {
    if (!keep) this.aim = point.clone();
    if (w <= 0) return;
    const P = this.person;
    if (this.human) { P.touch({ ['hand' + sd]: point }, { blend: w }); return; }
    const up = this.parts['arm' + sd], low = this.parts['fore' + sd]; if (!up || !low) return;
    const end = new Vector3(0, -.26, 0); low.localToWorld(end);
    reach(up, low, end.lerp(point, w));
  }
  /** Takes everything off the person (the scabbards too). */
  clear() { for (const k in this.things) { const t = this.things[k]; t.thing.removeFromParent(); t.sheath?.removeFromParent(); } this.things = {}; this.moves = []; }
}
