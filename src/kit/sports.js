// Team sports AI for football, hockey, basketball-style and made-up ball games seen from above: each
// player has a place in a formation that slides with the ball, one player goes for the ball, the rest
// find space or mark someone, and the one with the ball weighs up shooting, passing to the most open
// team-mate (a lane no opponent can cut out) or running on. The kit decides; your game moves the
// players, kicks the ball and keeps the rules (offside, fouls, the clock).
//
//   const { Team, Pitch } = gs.sports;
//   reset() {
//     pitch = new Pitch({ w: 340, h: 560 });                    // team 0 attacks up (towards y = 0)
//     home = new Team(pitch, 0, { formation: '2-2', skill: .7 }); away = new Team(pitch, 1, { formation: '2-2' });
//     home.players[0].human = true;                              // the player you control (skipped)
//   }
//   update(dt) {
//     const world = { ball, mates: home.players, foes: away.players };
//     for (const [p, act] of home.think(world, dt)) {           // act: { do, x, y, kick?: { x, y, power } }
//       steer(p, act.x, act.y); if (act.kick && p === ball.owner) kick(act.kick);
//     }
//   }
//
// Players are your own objects with x, y (and speed); ball: { x, y, vx, vy, owner } (owner: the player
// holding it, or null). Sizes are game units; the pitch is w x h with goals in the middle of each end.
//
// A team can be coached (Tiny Brains corrections): new Team(pitch, 1, { coach: true }), then
// team.coach.correct('pass') says "there, the one with the ball should have passed" and
// team.coach.avoid('shoot') "not a shot from there": a couple of times and it does so in spots like
// them (where on the pitch, how pressed, how open the shot and the pass were) and nowhere else.
// coach: new gs.brains.Coach(api, { name: 'away' }) keeps what it was taught on the phone.

import { Coach } from './brains.js';

export class Pitch {
  /** w, h: the pitch; goal: the goal mouth's width; x, y: its top left. Team 0 attacks the goal at the top. */
  constructor({ w = 340, h = 560, goal = 90, x = 0, y = 0 } = {}) { Object.assign(this, { w, h, goal, x, y }); }
  /** The goal a team attacks: its middle { x, y } and half its width. */
  goalFor(side) { return { x: this.x + this.w / 2, y: side === 0 ? this.y : this.y + this.h, half: this.goal / 2 }; }
  /** Turns a place in the team's own terms (0..1 across, 0 own goal .. 1 their goal) into the pitch. */
  toPitch(side, u, v) { return { x: this.x + (side === 0 ? u : 1 - u) * this.w, y: this.y + (side === 0 ? 1 - v : v) * this.h }; }
  /** How far up the pitch a point is for a team (0 own goal .. 1 their goal). */
  upfield(side, p) { const v = (p.y - this.y) / this.h; return side === 0 ? 1 - v : v; }
}

const FORMATIONS = {   // [across, up] in the team's own terms, keeper first when there is one
  '1-1': [[.5, .25], [.5, .6]], '2-1': [[.3, .25], [.7, .25], [.5, .6]], '2-2': [[.3, .25], [.7, .25], [.3, .6], [.7, .6]],
  '1-2-1': [[.5, .2], [.25, .45], [.75, .45], [.5, .7]], 'k-2-2': [[.5, .04], [.3, .28], [.7, .28], [.3, .62], [.7, .62]],
  'k-3-2': [[.5, .04], [.2, .3], [.5, .26], [.8, .3], [.35, .62], [.65, .62]],
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const WITH_BALL = ['shoot', 'pass', 'dribble'];   // what a coach can say to the one with the ball
/** How close the nearest of `foes` gets to the straight line a -> b (how open a pass or shot is). */
function laneGap(a, b, foes) {
  let best = Infinity; const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
  for (const f of foes) { const t = Math.max(0, Math.min(1, ((f.x - a.x) * dx + (f.y - a.y) * dy) / L2)); best = Math.min(best, Math.hypot(a.x + dx * t - f.x, a.y + dy * t - f.y)); }
  return best;
}

export class Team {
  /** side: 0 attacks the top, 1 the bottom; formation: a name ('1-1', '2-1', '2-2', '1-2-1', 'k-2-2', 'k-3-2': k is a keeper) or [[across, up]...]; skill: 0..1 (how well it reads the game: a number, or a gs.brains.Dial that follows the player); shootRange: in game units; coach: true, or a gs.brains.Coach (then team.coach takes corrections about the one with the ball). */
  constructor(pitch, side, { formation = '2-2', skill = .7, shootRange = null, keeper = null, players = null, rnd = Math.random, coach = null } = {}) {
    this.pitch = pitch; this.side = side; this.skill = skill; this.rnd = rnd;   // rnd: a seeded gs.math.rng for replays
    this.coach = coach === true ? new Coach({ name: 'team', save: false }) : coach || null;
    if (this.coach) this.coach.shape(7, WITH_BALL);
    this.spots = typeof formation === 'string' ? FORMATIONS[formation] || FORMATIONS['2-2'] : formation;
    this.keeper = keeper ?? (typeof formation === 'string' && formation.startsWith('k'));
    this.shootRange = shootRange ?? pitch.h * .3;
    this.players = players || this.spots.map((s, i) => ({ ...pitch.toPitch(side, s[0], s[1]), number: i + 1, team: side }));
    this.players.forEach((p, i) => { p.slot = i; p.team = side; });
    this.chaser = null; this.thinkT = 0; this.plan = new Map();
  }
  /** Where a player's home spot is now: its formation place, slid towards the ball and up or back with play. */
  home(p, ball) {
    const s = this.spots[p.slot % this.spots.length], P = this.pitch, isKeeper = this.keeper && p.slot === 0;
    const bu = (ball.x - P.x) / P.w, bv = P.upfield(this.side, ball), across = this.side === 0 ? bu : 1 - bu;
    if (isKeeper) { const g = P.goalFor(1 - this.side); return { x: Math.max(g.x - g.half, Math.min(g.x + g.half, ball.x)), y: P.toPitch(this.side, 0, .04).y }; }
    const u = s[0] + (across - .5) * .35, v = s[1] + (bv - .5) * .45;
    return P.toPitch(this.side, Math.max(.06, Math.min(.94, u)), Math.max(.06, Math.min(.94, v)));
  }
  /**
   * What each player (not marked human) should do now: Map(player -> { do, x, y, kick }). do: 'chase' |
   * 'shoot' | 'pass' | 'dribble' | 'support' | 'mark' | 'keep'. world: { ball, mates (this team), foes }.
   * Rethinks a few times a second (dt), less often for a lower skill.
   */
  think(world, dt = 1 / 60) {
    this.thinkT -= dt; if (this.thinkT > 0 && this.plan.size) return this.followBall(world);
    this.thinkT = .12 + (1 - this.skill) * .25;
    const { ball, foes = [] } = world, mates = this.players, P = this.pitch, goal = P.goalFor(this.side), plan = new Map();
    const haveBall = ball.owner && ball.owner.team === this.side;
    // who goes for the ball: the nearest (keepers only near their goal)
    const free = mates.filter(p => !(this.keeper && p.slot === 0) || P.upfield(this.side, ball) < .2);
    this.chaser = haveBall ? ball.owner : free.reduce((a, b) => (dist(a, ball) <= dist(b, ball) ? a : b), free[0]);
    const marked = new Set();
    for (const p of mates) {
      if (p.human) continue;
      let act;
      if (p === ball.owner) act = this.withBall(p, world, goal);
      else if (this.keeper && p.slot === 0) act = { do: 'keep', ...this.home(p, ball) };
      else if (p === this.chaser) act = { do: 'chase', x: ball.x + (ball.vx || 0) * .25, y: ball.y + (ball.vy || 0) * .25 };
      else if (haveBall) {   // find space: home spot nudged away from the nearest foe and into a passing lane
        const h = this.home(p, ball), nf = foes.reduce((a, f) => (!a || dist(f, h) < dist(a, h) ? f : a), null);
        let x = h.x, y = h.y; if (nf && dist(nf, h) < 60) { const d = dist(nf, h) || 1; x += (h.x - nf.x) / d * 30; y += (h.y - nf.y) / d * 30; }
        act = { do: 'support', x, y };
      } else {               // defend: mark the nearest unmarked attacker near home, goal side of them
        const h = this.home(p, ball), own = P.goalFor(1 - this.side);
        const f = foes.filter(f => !marked.has(f) && f !== ball.owner).sort((a, b) => dist(a, h) - dist(b, h))[0];
        if (f && dist(f, h) < P.w * .4) { marked.add(f); const d = dist(f, own) || 1; act = { do: 'mark', x: f.x + (own.x - f.x) / d * 18, y: f.y + (own.y - f.y) / d * 18 }; }
        else act = { do: 'support', ...h };
      }
      plan.set(p, act);
    }
    this.plan = plan;
    return plan;
  }
  // between rethinks: the chaser keeps after the ball, the one with it keeps going
  followBall({ ball }) {
    for (const [p, a] of this.plan) if (a.do === 'chase') { a.x = ball.x + (ball.vx || 0) * .25; a.y = ball.y + (ball.vy || 0) * .25; }
    return this.plan;
  }
  /** The choice for the player with the ball: shoot, pass or run on. */
  withBall(p, { foes = [] }, goal) {
    const P = this.pitch, C = this.coach, mates = this.players.filter(m => m !== p), pressure = Math.min(...foes.map(f => dist(f, p)), Infinity), dg = dist(p, goal);
    // shoot: in range, at the corner of the goal the keeper covers least (a coached team may be told to from a little further)
    let shot = null, shoots = false;
    if (dg < this.shootRange * (C ? 1.5 : 1)) {
      const aims = [goal.x - goal.half * .7, goal.x + goal.half * .7, goal.x].map(x => ({ x, y: goal.y }));
      shot = aims.map(a => [a, laneGap(p, a, foes)]).sort((a, b) => b[1] - a[1])[0];
      shoots = dg < this.shootRange && (shot[1] > 10 + (1 - this.skill) * 10 || pressure < 25);
    }
    // pass: the team-mate further up with the clearest lane, when pressed or someone is clearly better placed
    let pick = null, score = -Infinity, passes = false;
    if (!shoots || C) {
      for (const m of mates) {
        const gap = laneGap(p, m, foes), up = P.upfield(this.side, m) - P.upfield(this.side, p), d = dist(p, m);
        if (gap < 14 || d < 30) continue;
        const s = gap * .04 + up * 3 - d / P.h + (Math.min(...foes.map(f => dist(f, m))) / 60);
        if (s > score) { score = s; pick = m; }
      }
      passes = !!pick && (pressure < 35 || score > 1.6 - this.skill * .4);
    }
    let act = shoots ? 'shoot' : passes ? 'pass' : 'dribble';
    if (C) {
      // what a coach's examples are about: where he is, how pressed, how open the shot and the best pass are
      const see = this.see || (this.see = new Float32Array(7)), u = P.upfield(this.side, p);
      see[0] = u; see[1] = Math.abs((p.x - P.x) / P.w - .5) * 2; see[2] = Math.min(2, dg / this.shootRange);
      see[3] = shot ? Math.min(1, shot[1] / 40) : 0; see[4] = Math.min(1, pressure / 80);
      see[5] = pick ? Math.max(-1, Math.min(1, score / 3)) : -1; see[6] = pick ? P.upfield(this.side, pick) - u : 0;
      const can = [act]; for (const a of WITH_BALL) if (a !== act && (a === 'shoot' ? shot : a === 'pass' ? pick : true)) can.push(a);
      act = C.pick(see, can);
    }
    if (act === 'shoot') return { do: 'shoot', x: shot[0].x, y: shot[0].y, kick: this.kick(p, shot[0], 1) };
    if (act === 'pass') return { do: 'pass', x: pick.x, y: pick.y, to: pick, kick: this.kick(p, pick, Math.min(1, dist(p, pick) / (P.h * .5))) };
    // run on: towards goal, bending away from the nearest foe
    const nf = foes.reduce((a, f) => (!a || dist(f, p) < dist(a, p) ? f : a), null);
    let x = goal.x, y = goal.y; if (nf && dist(nf, p) < 50) { x += (p.x - nf.x) * 1.5; }
    return { do: 'dribble', x, y };
  }
  /** A kick from p at a target: a unit direction and power 0..1 (less accurate for a lower skill). */
  kick(p, at, power) {
    const a = Math.atan2(at.y - p.y, at.x - p.x) + (this.rnd() - .5) * (1 - this.skill) * .25;
    return { x: Math.cos(a), y: Math.sin(a), power };
  }
}
