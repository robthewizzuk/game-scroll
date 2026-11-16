// Gunshots that are rendered, not synthesised live: each gun's report, its clicks and the tail a shot leaves in the
// place are worked out once into sound buffers (sound-render.js, in the kit's background workers where there are
// any), then played back: several takes of each in turn, so a burst never repeats the same shot; the tail chosen by
// where the listener stands (indoors: close reflections and flutter; outside: slaps off far walls and a long roll),
// heard through the game's gs.sound.Ears when it made one; and the rest of the mix (music, other sounds, voices)
// dipping under the player's own shots for a moment, as a film mix does.
//
// gs.combat's weaponSound() plays these by itself once they are ready (a gun given to a Loadout, or made with arm(),
// has its takes made at once), and the old live sound until then. Kit use only.
import { audio, sound } from '../sfx.js';
import { kitPlay, mixer } from './sound.js';
import { linksFor } from './links.js';
import { run, canRun } from './jobs.js';
import { renderSound, gunInfo, GUN_KINDS } from './sound-render.js';

const SR = 44100, TAIL_SR = 22050, TAIL_TAKES = 2;
// how loud a take plays next to the kit's other sounds (the renders come out near full scale)
export const GUNS = { rendered: true, level: .5, tail: .55, duck: { music: .45, sfx: .7, voice: .75, hold: .085, back: .22 }, near: 2.5 };
const PENDING = 1;
const have = new Map();   // key -> PENDING | { ch: [Float32Array], sr, ab }
const queue = [];
let busy = 0, seq = 0;
const stats = { made: 0, inWorker: 0, here: 0, ms: 0 };
const keyOf = o => o.what === 'gun' ? `gun:${o.kind}:${o.n}` : o.what === 'mech' ? `mech:${o.kind}:${o.pitch}:${o.n || 0}` : `tail:${o.place}:${o.size}:${o.n}`;

function want(o) {
  const k = keyOf(o); if (have.has(k)) return;
  have.set(k, PENDING); queue.push([k, { ...o, sr: o.what === 'tail' ? TAIL_SR : SR, seed: 9173 + (++seq) * 7919 }]); pump();
}
// one job at a time each way: in a worker if there is one, else here a sound at a time with the page given back between
function pump() {
  while (busy < 2 && queue.length) {
    const [k, o] = queue.shift(); busy++;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const done = ch => { busy--; if (ch) { have.set(k, { ch, sr: o.sr, ab: null }); stats.made++; stats.ms += (typeof performance !== 'undefined' ? performance.now() : 0) - t0; } else have.delete(k); pump(); };
    const here = () => setTimeout(() => { let ch = null; try { ch = renderSound(o); stats.here++; } catch (e) { console.warn('[gunshots]', e); } done(ch); }, 0);
    if (canRun()) run('sound', o).then(ch => { stats.inWorker++; done(ch); }, here); else here();
  }
}
/** Kit and tests: how many sounds are made, waiting, and where they were made. */
export const gunStats = () => ({ ...stats, waiting: queue.length + busy, kept: [...have.values()].filter(v => v !== PENDING).length });

// the action's sounds a gun of this kind makes (gs.combat weaponSound's 'empty', 'reload', 'pump', 'draw')
const MECH_OF = kind => kind === 'shotgun' ? ['empty', 'pumpBack', 'pumpFwd', 'shell', 'draw'] : kind === 'sniper' ? ['empty', 'pumpBack', 'pumpFwd', 'magout', 'magin', 'draw'] : kind === 'revolver' ? ['empty', 'shell', 'catch', 'draw'] : kind === 'launcher' ? ['magin', 'draw'] : ['empty', 'magout', 'magin', 'catch', 'draw'];
const MECH_PITCH = { pistol: 1.15, revolver: 1.05, smg: 1.08, shotgun: .9, rifle: 1, sniper: .95, launcher: .8 };

/** Makes a gun's takes, clicks and tails ahead (in the background), so its first shot already sounds as it should. */
export function prepareGun(kind) {
  const I = gunInfo(kind); if (!I) return false;
  for (let n = 0; n < I.takes; n++) want({ what: 'gun', kind, n });
  for (const place of ['out', 'in']) for (let n = 0; n < TAIL_TAKES; n++) want({ what: 'tail', place, size: I.tail, n });
  for (const m of MECH_OF(kind)) for (let n = 0; n < 2; n++) want({ what: 'mech', kind: m, pitch: MECH_PITCH[kind] || 1, n });
  return true;
}
/** Is a gun's sound ready to play (its takes and tails made)? */
export function gunReady(kind) {
  const I = gunInfo(kind); if (!I) return false;
  for (let n = 0; n < I.takes; n++) if (!ready(`gun:${kind}:${n}`)) return false;
  return ready(`tail:out:${I.tail}:0`) && ready(`tail:in:${I.tail}:0`);
}
const ready = k => { const v = have.get(k); return !!v && v !== PENDING; };
// the made sound as an AudioBuffer (made the first time it is played: the numbers alone need no page)
function bufferOf(k) {
  const v = have.get(k); if (!v || v === PENDING) return null;
  if (!v.ab) { const a = audio(); if (!a) return null; const ab = a.ctx.createBuffer(v.ch.length, v.ch[0].length, v.sr); v.ch.forEach((c, i) => ab.copyToChannel ? ab.copyToChannel(c, i) : ab.getChannelData(i).set(c)); v.ab = ab; }
  return v.ab;
}
const turn = new Map();   // kind -> the next take
let ears = null, earsAt = -1;
const findEars = () => { const now = Date.now(); if (now - earsAt > 500) { earsAt = now; ears = linksFor(null, true)?.one('ears') || null; } return ears; };

/**
 * A shot of a gun of this kind, rendered: false when its sound isn't made yet (the caller plays the live one; it is
 * being made now). at: where ({ x, y, z }; null: the player's own, in their hands). place: 'in' | 'out' (else from the
 * Ears' sense of the place: how closed in it is). vol: times its usual level.
 */
export function playGun(kind, at = null, { place = null, vol = 1 } = {}) {
  const I = gunInfo(kind); if (!I || !GUNS.rendered) return false;
  if (!gunReady(kind)) { prepareGun(kind); return false; }
  if (sound.muted || !sound.volume) return true;
  const n = (turn.get(kind) || 0) % I.takes; turn.set(kind, n + 1);
  const E = findEars(), heard = at && E ? Math.max(0, Math.min(1, E.heard(at))) : 1;
  const mine = !at || (E && Math.hypot(at.x - E.pos.x, (at.y ?? 0) - E.pos.y, (at.z ?? 0) - E.pos.z) < GUNS.near);
  kitPlay(bufferOf(`gun:${kind}:${n}`), { at: mine ? null : at, ears: E, vol: GUNS.level * I.gain * vol, rate: 1 + (Math.random() - .5) * .025, bus: 'guns', key: 'gun:' + kind });
  // the place answers: indoors and outside mixed by how closed in the listener is (the tail is all round, not at the gun);
  // a far shot's tail falls off slower than the shot itself, so far fire is mostly its echo
  const inK = place === 'in' ? 1 : place === 'out' ? 0 : Math.max(0, Math.min(1, ((E?.room?.enclosed ?? 0) - .35) / .4)), tn = Math.floor(Math.random() * TAIL_TAKES);
  const tv = GUNS.tail * I.gain * vol * (mine ? 1 : .25 + .75 * Math.sqrt(heard));
  if (inK < .98) kitPlay(bufferOf(`tail:out:${I.tail}:${tn}`), { vol: tv * (1 - inK), bus: 'guns', key: 'tail:out' });
  if (inK > .02) kitPlay(bufferOf(`tail:in:${I.tail}:${tn}`), { vol: tv * inK, bus: 'guns', key: 'tail:in' });
  // the rest of the mix dips under the player's own shot (the gun is on a channel of its own, so it stays)
  if (mine) { const D = GUNS.duck; mixer.duck('music', D.music, D.hold, D.back); mixer.duck('sfx', D.sfx, D.hold * .7, D.back * .6); mixer.duck('voice', D.voice, D.hold, D.back); }
  return true;
}
/** One of a gun's action sounds ('empty', 'magout', 'magin', 'catch', 'pumpBack', 'pumpFwd', 'shell', 'draw') `delay` seconds from now: false when not made yet. */
export function playMech(kind, what, at = null, { delay = 0, vol = 1 } = {}) {
  if (!GUNS.rendered) return false;
  const p = MECH_PITCH[kind] || 1, k = `mech:${what}:${p}:${Math.random() < .5 ? 0 : 1}`, ab = bufferOf(k) || bufferOf(`mech:${what}:${p}:0`);
  if (!ab) { if (gunInfo(kind)) prepareGun(kind); return false; }
  const a = audio(); if (!a) return true;
  const E = findEars(), mine = !at || (E && Math.hypot(at.x - E.pos.x, (at.y ?? 0) - E.pos.y, (at.z ?? 0) - E.pos.z) < GUNS.near);
  kitPlay(ab, { at: mine ? null : at, ears: E, vol: .16 * vol, rate: 1 + (Math.random() - .5) * .04, bus: 'guns', when: a.ctx.currentTime + Math.max(0, delay), key: 'mech:' + what });
  return true;
}
export { GUN_KINDS };
