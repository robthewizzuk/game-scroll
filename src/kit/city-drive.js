// gs.city's traffic leaving its lanes: lane changes, overtaking, swerving round things in the road, giving way to
// sirens, crashes that send a car sliding (a real Rapier body when the city is solid in a World3D), and chase driving.
//
// A car of the city is in one of these modes:
//   'lane'  keeps to the roads (city.js Traffic): it follows the car ahead, stops at red lights, and now also changes
//           lane to get past a slower car or into the lane for its turn, swerves round what is in the road (the game's
//           city.avoid(), a wreck, a sliding car, someone in the way) and pulls out past a car that has stopped for good
//           when the other side is clear, pulls over for a siren behind it, and swerves for something coming at it.
//           Where a car is across the road is `lat`, in lanes (0 the lane next to the middle; under 0 the other side's).
//   'chase' drives where the game or the police send it, off the lanes: along the roads (city.route) while what it is
//           after is far or out of sight, then straight at it ('pursue' stays behind, 'ram' drives into it), to a place
//           ('go'), away from it ('flee'), or parks across the road there ('block'). It steers round cars, slows for
//           its turns, reverses off a wall it is stuck against, and runs red lights. cars.chase(car, target, opts).
//   'loose' a crash: it slides and spins (a dynamic box in the World3D after city.solid(world), else a slide of its
//           own off the walls), and when it stops it goes back to its lane, or stays as a wreck. cars.crash(car, push).
//   'wreck' stopped for good where it ended up (the traffic goes round it), until it is far from the player.
//
// Everything here goes through the Traffic's lanePos / across / ends / back and city.route, so roads of any shape
// keep working. Kit use only: city.js's Traffic calls these.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const MIRROR = 1.125;   // a lane coordinate seen from the other side of the road: -k - 1.125 (lanes are offset .2 m from the middle)
const _q = { s: 0, k: 0, m: 0 }, _p = { x: 0, z: 0 }, _r = {};

/** How far across the road a car may go on its own side (in lanes): from the middle to the kerb side of its outer lane. */
export const sideLats = (T, e, c) => [Math.max(-.2, (c.wid / 2 + .25 - .2) / T.LANE - .5), e.lanes - 1 + Math.min(.35, Math.max(0, (e.width / 2 - .45 - c.wid / 2 - .2) / T.LANE - .5 - (e.lanes - 1)))];

const NONE = Object.freeze([]);   // (an edge with no cars on it, without a new empty list each time)
/** The cars of each edge that keep to their lanes (and aren't in a junction), for the moves below. */
export function byEdge(T) {
  const by = T._by ||= new Map(); for (const a of by.values()) a.length = 0;
  for (const c of T.list) if (c.mode === 'lane' && !c.turn) { let a = by.get(c.edge.id); if (!a) by.set(c.edge.id, a = []); a.push(c); }
  return by;
}
// is the stretch s0..s1 of an edge clear at lane coordinate k (cars of this edge, and those of the other side when k is under 0)?
function clear(T, by, c, e, k, s0, s1) {
  const half = c.wid / 2 / T.LANE;
  for (const o of by.get(e.id) || NONE) if (o !== c && Math.abs(o.lat - k) < half + o.wid / 2 / T.LANE + .1 && o.s + o.len / 2 > s0 && o.s - o.len / 2 < s1) return false;
  if (k < .3) { const b = T.back(e); if (b) for (const o of by.get(b.id) || NONE) { const os = e.len - o.s, ol = -o.lat - MIRROR; if (Math.abs(ol - k) < half + o.wid / 2 / T.LANE + .1 && os + o.len / 2 > s0 && os - o.len / 2 - o.v * 3.5 < s1) return false; } }
  return true;
}
const stuck = o => o.stuck > 2.5 && (o.why === 'stun' || o.why === 'hazard' || o.why === 'yield' || o.mode !== 'lane');

/**
 * One car keeping to the roads, for one frame: how fast it wants to go (the car ahead, the lights, the way out of
 * the junction, what is in the road, sirens) and where across the road it wants to be.
 */
export function laneCar(T, c, dt, t, by) {
  const P = T.plan, city = T.city, e = c.edge, L = T.LANE, [, s1] = T.ends(e), half = c.wid / 2 / L, H = T.hazards;
  let target = c.stun > 0 ? 0 : c.vmax, why = c.stun > 0 ? 'stun' : null, blocked = false;
  const follow = (gap, w) => { const v = Math.max(0, (gap - 2) * 1.1); if (v < target) { target = v; why = w; } };
  c.think -= dt;
  // the car ahead in the lanes it covers; one that has stopped for good is something to get past instead
  let lead = null, gap = Infinity;
  for (const o of by.get(e.id) || NONE) {
    if (o === c || o.s <= c.s || Math.abs(o.lat - c.lat) > half + o.wid / 2 / L + .05) continue;
    const g = o.s - c.s - (o.len + c.len) / 2; if (g < gap) { gap = g; lead = o; }
  }
  const local = T._local ||= []; local.length = 0;
  if (lead && stuck(lead)) local.push(lead.hz ||= { x: 0, z: 0, r: 1, car: lead }), Object.assign(lead.hz, { x: lead.x, z: lead.z });
  else if (lead) follow(gap, lead.why === 'stuck' || stuck(lead) ? 'stuck' : 'queue');
  else if (c.ahead && (c.ahead.turn || c.ahead.edge !== e)) follow(Math.hypot(c.ahead.x - c.x, c.ahead.z - c.z) - (c.ahead.len + c.len) / 2 - 1, 'queue');
  // out past the middle: the cars coming the other way
  const back = T.back(e);
  if (c.lat < .35 && back) for (const o of by.get(back.id) || NONE) {
    const os = e.len - o.s, ol = -o.lat - MIRROR; if (os <= c.s || Math.abs(ol - c.lat) > half + o.wid / 2 / L) continue;
    follow(os - c.s - (o.len + c.len) / 2 - o.v * 1.2, 'oncoming');
    if (c.dodge && os - c.s < (o.v + c.v) * 2.2 + 8) { c.dodge = null; c.latTo = c.lane; }   // (a pass that won't make it in time: back in)
  }
  // the lights, and not driving into a junction whose way out is backed up
  const stop = s1 - 3.6 - c.len / 2, toStop = stop - c.s;
  if (toStop < (e.lanes > 1 ? 85 : 40)) {
    c.plan ||= T.choose(c);
    if (toStop < 40) {
      const st = city.signal(P.nodes[e.b], e.axis, t);
      if (st !== 'g' && toStop > -.5 && !(st === 'a' && toStop < c.v * c.v / 12 * .6)) follow(toStop + 2, 'light');
      const out = by.get(c.plan.e.id), [n0] = T.ends(c.plan.e);
      if (out && toStop > -.5) for (const o of out) if (Math.abs(o.lat - c.plan.k) < .6 && o.s < n0 + (o.len + c.len) / 2 + 2.5) { follow(toStop + 2, 'queue'); break; }
      // a siren near the junction: wait for it
      for (const s of T.sirens) if (s !== c && Math.abs(s.x - P.nodes[e.b].x) + Math.abs(s.z - P.nodes[e.b].z) < 34 && toStop > -.5) { follow(toStop + 2, 'yield'); break; }
    }
  }
  // what is in the road ahead: swerve round it if there is room (in this lane, the next, or past the middle when the
  // other side is clear), else stop for it; something coming fast at the car: out of its way to the kerb
  const [lo, hi] = sideLats(T, e, c), fx = e.dx, fz = e.dz, roadH = Math.atan2(fx, fz);
  let dodged = false;
  for (const list of [H, local]) for (const o of list) {
    if (o.car === c) continue;
    const rx = o.x - c.x, rz = o.z - c.z; if (rx * rx + rz * rz > 1600) continue;
    const along = rx * fx + rz * fz; if (along < -c.len || along > 34) continue;
    T.across(e, o.x, o.z, _q); if (_q.k > hi + 1.2 || _q.k < lo - 2.6) continue;   // (on the pavement, or well over the other side)
    let ea = o.r, ec = o.r;
    if (o.car) { const a = o.car.heading - roadH, ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a)); ea = ca * o.car.len / 2 + sa * o.car.wid / 2; ec = sa * o.car.len / 2 + ca * o.car.wid / 2; }
    const need = ec / L + half + .12, overlap = Math.abs(_q.k - c.lat) < need;
    const mine = c.dodge && Math.abs(c.dodge.x - o.x) + Math.abs(c.dodge.z - o.z) < 4;
    if (!overlap && !mine) continue;
    const g = along - c.len / 2 - ea, closing = -((o.vx || 0) * fx + (o.vz || 0) * fz);
    if (closing > 5 && g < (closing + c.v) * 1.7 && overlap) {   // coming at it: out of the way, hard
      c.latTo = hi + .3; c.hurry = 1; follow(0, 'hazard'); blocked = true; dodged = true; if (c.honked <= 0) { city.honk(c); c.honked = 3; }
      continue;
    }
    if (g > 28) continue;
    if (mine && !overlap) { c.dodge.x = o.x; c.dodge.z = o.z; c.dodge.t = .7; dodged = true; target = Math.min(target, Math.max(5, c.vmax * .7)); continue; }
    // room either side?
    let best = null;
    for (const k of [_q.k - need - .05, _q.k + need + .05]) {
      const wrong = k < lo, okLo = wrong ? k >= -hi - MIRROR - .1 : true;
      if (!okLo || k > hi + .05) continue;
      if (!clear(T, by, c, e, k, c.s - 6, c.s + along + ea + (wrong ? 18 + c.v * 1.5 : 8))) continue;
      if (wrong && toStop < along + ea + 12) continue;          // (no pulling out over the middle into a junction)
      if (!best || Math.abs(k - c.lat) + (wrong ? 1 : 0) < Math.abs(best - c.lat) + (best < lo ? 1 : 0)) best = k;
    }
    if (best != null && c.stun <= 0) {
      if (!c.dodge) { c.dodge = { x: o.x, z: o.z, t: .7 }; T.stat('swerves'); if (best < lo) T.stat('overtakes'); }
      c.dodge.x = o.x; c.dodge.z = o.z; c.dodge.t = .7; c.latTo = best; dodged = true;
      target = Math.min(target, o.car ? Math.max(5, c.vmax * .6) : Math.max(3, g * .45 + 2.5)); why ||= 'swerve';
    } else { follow(g, 'hazard'); blocked = true; }
  }
  if (c.dodge && !dodged && (c.dodge.t -= dt) <= 0) { c.dodge = null; c.latTo = c.lane; }
  // a siren coming up behind: over to the kerb and stop until it has gone by; one coming the other way: slow down
  if (c.yieldT > 0) c.yieldT -= dt;
  for (const s of T.sirens) {
    const rx = s.x - c.x, rz = s.z - c.z; if (rx * rx + rz * rz > 2500 || s === c) continue;
    const along = rx * Math.sin(c.heading) + rz * Math.cos(c.heading), same = Math.cos(s.heading - c.heading) > .5;
    // (coming the other way too: everyone pulls over, so it can come down the middle)
    if ((same && along < -2 && along > -48) || (!same && along > 0 && along < 45 && Math.cos(s.heading - c.heading) < -.5)) { if (c.yieldT <= 0) T.stat('yields'); c.yieldT = 1.4; }
  }
  if (c.yieldT > 0 && !c.dodge) { c.latTo = hi; follow(c.v * 1.1 + 2, 'yield'); target = Math.min(target, Math.abs(c.lat - hi) < .15 ? 0 : 3); why = 'yield'; }
  // lane changes: into the lane for the turn ahead, or past a slower car (two lanes or more this way)
  if (e.lanes > 1 && !c.dodge && c.yieldT <= 0 && Math.abs(c.lat - c.lane) < .05 && c.think <= 0) {
    c.think = .5 + T.R() * .4;
    const want = c.plan && toStop < 80 ? c.plan.k : null;
    let to = null;
    if (want != null && want !== c.lane) to = c.lane + Math.sign(want - c.lane);
    else if (lead && gap < 30 && lead.v < c.vmax * .78 && c.vmax - lead.v > 2 && toStop > 40 && (c.laneT -= .5) <= 0) {
      for (const k of [c.lane - 1, c.lane + 1]) if (k >= 0 && k < e.lanes) {
        let g2 = Infinity; for (const o of by.get(e.id) || NONE) if (o !== c && Math.abs(o.lat - k) < .6 && o.s > c.s) g2 = Math.min(g2, o.s - c.s);
        if (g2 > gap + 10) { to = k; break; }
      }
    }
    if (to != null && to >= 0 && to < e.lanes && clear(T, by, c, e, to, c.s - 7 - Math.max(0, c.v - 6) * .6, c.s + (want != null ? 6 : 12))) { c.lane = to; c.latTo = to; c.laneT = 4; T.stat('laneChanges'); }
  }
  c.blocked = blocked || why === 'stuck' ? c.blocked + dt : 0;
  c.why = why; c.stuck = c.v < .3 && why !== 'light' && why !== 'queue' && why !== 'oncoming' ? c.stuck + dt : 0;
  return target;
}

/** Moves a car in a lane: its speed towards target, across the road towards latTo, along it, and its heading. */
export function laneMove(T, c, target, dt) {
  const dv = target - c.v; c.braking = dv < -.5 || (c.v < .3 && target < .3);
  c.v = Math.max(0, c.v + Math.max(-(c.hurry ? 12 : 10) * dt, Math.min(3.6 * dt, dv)));
  const rate = Math.min(1.1, (.55 + .1 * c.v) / T.LANE) * (c.hurry ? 2.2 : 1), dl = clamp(c.latTo - c.lat, -rate * dt, rate * dt);
  c.lat += dl; if (Math.abs(c.latTo - c.lat) < .02) c.hurry = 0;
  c.s += c.v * dt;
  const e = c.edge, lv = dt > 0 ? dl / dt * T.LANE : 0, k = T.sideK;
  // its nose along its lane, turned towards where it is moving across the road, but no more than its speed allows: a car
  // that has stopped while it is still slid across (back into its lane after a knock) faces along the lane. (It once
  // faced straight across the road when stopped, and turned round end to end each time the slide changed way: a car
  // stood beside Parcel Dash's van flipped to and fro, its headlights with it.)
  const side = clamp(lv * k, -c.v * .4, c.v * .4), vf = Math.max(c.v, .05);
  c.heading = Math.atan2(e.dx * vf - e.dz * side, e.dz * vf + e.dx * side);
}

/**
 * Off the lanes, for one frame: o = car.chase = { target ({ x, z } or a car or the player: what it is after; with v
 * and heading or vx and vz it leads it), how ('pursue' | 'ram' | 'go' | 'flee' | 'block' | 'join'), top (m/s), keep
 * (metres to stay behind when pursuing), face (heading to park at, for 'block') }.
 */
export function chaseCar(T, c, dt) {
  const C = c.chase, city = T.city, g = C.target || C, gx = g.x, gz = g.z ?? g.y;
  C.t = (C.t || 0) + dt;
  const dx = gx - c.x, dz = gz - c.z, d = Math.hypot(dx, dz);
  // can it see what it is after (a building in between)? checked a few times a second
  if ((C.seeT = (C.seeT || 0) - dt) <= 0) { C.seeT = .25 + T.R() * .1; C.sees = d < 55 && !city.ray({ x: c.x, y: 1.1, z: c.z }, { x: dx, y: 0, z: dz }, d); }
  const tvx = g.vx ?? (g.v != null && g.heading != null ? Math.sin(g.heading) * g.v : 0), tvz = g.vz ?? (g.v != null && g.heading != null ? Math.cos(g.heading) * g.v : 0), tv = Math.hypot(tvx, tvz);
  let ax, az, want = C.top ?? 24;
  C.onRoute = false;
  const direct = (C.how === 'pursue' || C.how === 'ram' || C.how === 'join' || C.how === 'block' || C.how === 'go') && (C.sees || d < 14) && d < 60;
  if (C.how === 'block' && d < 3.5) {   // parked across the road
    C.parked = true; want = 0; ax = c.x + Math.sin(C.face ?? c.heading) * 10; az = c.z + Math.cos(C.face ?? c.heading) * 10;
  } else if (direct || (C.how === 'flee' && d > 70)) {
    const lead = C.how === 'ram' ? .3 : clamp(d / Math.max(6, c.v), 0, 1.2);
    ax = gx + tvx * lead; az = gz + tvz * lead;
    if (C.how === 'pursue') want = Math.min(want, Math.max(0, tv + (d - (C.keep ?? 7)) * 1.2));
    else if (C.how === 'go' || C.how === 'join' || C.how === 'block') want = Math.min(want, Math.max(2.5, d * .9));
    if (C.how === 'flee') { ax = c.x + Math.sin(c.heading) * 20; az = c.z + Math.cos(c.heading) * 20; want *= .7; }
  } else {
    // along the roads: a route to it, looked along a little ahead of the car
    let goal = g;
    if (C.how === 'flee') {   // away: the far side of the city from what it flees
      if (!C.away || Math.hypot(C.away.x - c.x, C.away.z - c.z) < 30) { const B = T.plan.bounds, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, ox = c.x - gx, oz = c.z - gz, l = Math.hypot(ox, oz) || 1; C.away = city.road(clamp(c.x + ox / l * 200, B.x0, B.x1), clamp(c.z + oz / l * 200, B.z0, B.z1)) || { x: cx, z: cz }; }
      goal = C.away;
    }
    const gz2 = goal.z ?? goal.y;
    if (!C.route || (C.rt = (C.rt || 0) - dt) <= 0 || Math.hypot(C.routeTo.x - goal.x, C.routeTo.z - gz2) > 25) {
      C.route = city.route(c, goal); C.routeTo = { x: goal.x, z: gz2 }; C.rt = 1.6 + T.R() * .4;
    }
    const path = C.route.path, n = path.nearest(c.x, 0, c.z), look = 5 + Math.abs(c.v) * .32, p = path.at(n.d + look, _p);
    ax = p.x; az = p.z;
    // the next corner along the route: no faster than it can slow down for it by then
    const h0 = path.at(n.d + 1, _r).angle3 = Math.atan2(_r.dx, _r.dz);
    for (let k = 4; k <= 44; k += 4) {
      const r = path.at(n.d + k, _r), turn = Math.abs(wrap(Math.atan2(r.dx, r.dz) - h0));
      if (turn > .5) { const vc = Math.max(7, 22 - turn * 9); want = Math.min(want, Math.sqrt(vc * vc + 2 * 9 * Math.max(0, k - 4))); break; }
    }
    if (n.d > path.length - 3 && C.how !== 'flee') { ax = gx; az = gz; }
    C.onRoute = true;
  }
  // cars in the way: the clearest of straight on, a little left or right (not round what it is after when ramming),
  // and no faster than it can stop in what is clear
  const al = Math.hypot(ax - c.x, az - c.z) || 1, fx = (ax - c.x) / al, fz = (az - c.z) / al, reach = 10 + Math.abs(c.v) * 1.1;   // (along where it is heading for: round a corner too)
  const free = off => {
    let best = reach;
    for (const o of T.list) {
      if (o === c || o === g || o === C.target) continue;
      const rx = o.x - c.x, rz = o.z - c.z, along = rx * fx + rz * fz; if (along < 0 || along > best + 3) continue;
      const lat = rx * fz - rz * fx; if (Math.abs(lat - off) > 1.15 + o.wid / 2 + Math.abs(off) * .15) continue;
      const ov = Math.sin(o.heading) * o.v * fx + Math.cos(o.heading) * o.v * fz, room = along - (o.len + c.len) / 2 + Math.max(0, ov) * 1.2;
      if (room < best) best = room;
    }
    return best;
  };
  const ahead = free(0);
  if (ahead < reach) {
    let off = 0, clearAt = ahead;
    for (const o of [-1.7, 1.7, -3.3, 3.3]) { const r = free(o); if (r > clearAt + 2) { clearAt = r; off = o; } }
    if (off) { ax += fz * off; az -= fx * off; }
    want = Math.min(want, Math.sqrt(Math.max(0, 2 * 8.5 * (clearAt - 2.5))) + 1);
  }
  // steer: a turn as tight as its speed allows, slower the more it has to turn
  const h = Math.atan2(ax - c.x, az - c.z), dh = wrap(h - c.heading), yaw = Math.min(2.4, (Math.abs(c.v) + 2.5) / 4.2);
  if (Math.abs(dh) > .3) want = Math.min(want, Math.max(C.onRoute ? 7 : 4, 26 - Math.abs(dh) * (C.onRoute ? 9 : 15)));
  // stuck against something (facing a wall, wedged): back off and turn
  if (C.rev > 0) { C.rev -= dt; c.v = Math.max(-4.5, c.v - 9 * dt); c.heading = wrap(c.heading - Math.sign(dh || 1) * yaw * .8 * dt); }
  else {
    if (want > 3 && c.v < .8) { if ((C.stuckT = (C.stuckT || 0) + dt) > .9) { C.rev = 1.1; C.stuckT = 0; } } else C.stuckT = 0;
    const dv = want - c.v; c.braking = dv < -1; c.v += clamp(dv, -11 * dt, (c.v < 0 ? 12 : 6.5) * dt);
    if (Math.abs(c.v) > .3) c.heading = wrap(c.heading + clamp(dh, -yaw * dt, yaw * dt));
  }
  const ox = c.x, oz = c.z, p = _p; p.x = c.x + Math.sin(c.heading) * c.v * dt; p.z = c.z + Math.cos(c.heading) * c.v * dt;
  if (city.collide(p, c.wid * .55 + .15)) { const push = Math.hypot(p.x - ox - Math.sin(c.heading) * c.v * dt, p.z - oz - Math.cos(c.heading) * c.v * dt); if (push > .02 && Math.abs(c.v) > 4) { c.v *= .75; c.scrape = .3; } }
  c.x = p.x; c.z = p.z; c.vx = (c.x - ox) / Math.max(dt, 1e-4); c.vz = (c.z - oz) / Math.max(dt, 1e-4);
  if (c.scrape > 0) c.scrape -= dt;
  // joining a lane: once it is in it, pointing its way, it keeps to the roads again
  if (C.how === 'join' && C.lane) {
    const L = C.lane; T.across(L.e, c.x, c.z, _q);
    if (Math.abs(_q.k - L.k) < .55 && Math.abs(wrap(c.heading - Math.atan2(L.e.dx, L.e.dz))) < .4 && _q.s > T.ends(L.e)[0] - 2) T.toLane(c, L.e, L.k, _q.s, _q.k);
    else if (C.t > 9) T.toLane(c, L.e, L.k, Math.max(T.ends(L.e)[0], Math.min(_q.s, T.ends(L.e)[1] - 1)), L.k);   // (it never made it: put it there)
  }
}

/** A car that has crashed, sliding: its pose from its body in the World3D, or its own slide off the walls. */
export function looseCar(T, c, dt) {
  const city = T.city; c.looseT += dt;
  if (c.body && !c.body.dead) {
    const p = c.body.pos, r = c.body.body.rotation(), v = c.body.vel, s = c.body.spin;
    c.x = p.x; c.y = Math.max(0, p.y - .72); c.z = p.z; (c.q ||= { x: 0, y: 0, z: 0, w: 1 }); c.q.x = r.x; c.q.y = r.y; c.q.z = r.z; c.q.w = r.w;
    const fx = 2 * (r.x * r.z + r.w * r.y), fz = 1 - 2 * (r.x * r.x + r.y * r.y); c.heading = Math.atan2(fx, fz);   // (its nose: +z turned by its rotation)
    c.vx = v.x; c.vz = v.z; c.v = Math.hypot(v.x, v.z); c.spin = s.y; c.up = 1 - 2 * (r.x * r.x + r.z * r.z);
  } else {
    const sp = Math.hypot(c.vx, c.vz), dec = 7.5 * dt, k = sp > dec ? (sp - dec) / sp : 0;
    c.vx *= k; c.vz *= k; c.spin *= Math.exp(-2.4 * dt); c.heading = wrap(c.heading + c.spin * dt);
    // as it slows the tyres bite again: its slide turns towards the way it points
    if (sp > .1 && sp < 9) { const f = Math.min(1, dt * 1.5), hx = Math.sin(c.heading), hz = Math.cos(c.heading), al = c.vx * hx + c.vz * hz; c.vx += (hx * al - c.vx) * f; c.vz += (hz * al - c.vz) * f; }
    const p = _p; p.x = c.x + c.vx * dt; p.z = c.z + c.vz * dt;
    if (city.collide(p, Math.max(c.wid / 2 + .15, c.len * .36))) {
      const nx = p.x - (c.x + c.vx * dt), nz = p.z - (c.z + c.vz * dt), nl = Math.hypot(nx, nz);
      if (nl > 1e-4) { const ux = nx / nl, uz = nz / nl, vn = c.vx * ux + c.vz * uz; if (vn < 0) { c.vx -= 1.35 * vn * ux; c.vz -= 1.35 * vn * uz; c.spin += vn * .25 * (T.R() < .5 ? 1 : -1); c.damage += -vn / 30; if (-vn > 3) city.event({ kind: 'crash', at: { x: c.x, z: c.z }, car: c, power: -vn, by: c.by }); } }
    }
    c.x = p.x; c.z = p.z; c.v = Math.hypot(c.vx, c.vz); c.up = 1;
  }
  if (c.v < .6 && Math.abs(c.spin) < .45) c.still += dt; else c.still = 0;
  if (c.still > .7 || c.looseT > 8) settle(T, c);
}
// it has stopped: back to its lane, or a wreck (too battered, on its side or roof, or ended up off the road)
function settle(T, c) {
  const r = T.city.road(c.x, c.z), off = r ? r.d : 99;
  if (c.damage > .55 || (c.up ?? 1) < .6 || off > 3.4) {
    c.mode = 'wreck'; c.v = 0; c.vx = c.vz = 0; c.spin = 0; T.stat('wrecks');
    T.city.event({ kind: 'wreck', at: { x: c.x, z: c.z }, car: c, by: c.by });
    return;
  }
  if (c.body) { c.body.remove(); c.body = null; T.loose--; }
  c.y = 0; c.q = null; c.v = 0;
  T.join(c);
}

/**
 * Cars off the lanes against the others (no World3D needed): a chasing or sliding car that drives into one hard
 * sets it sliding too, a softer knock stops it a moment; the one that hit loses speed. Returns how many met.
 */
export function meet(T, dt) {
  let n = 0;
  for (const a of T.list) {
    if ((a.mode !== 'chase' && a.mode !== 'loose') || (a.body && !a.body.dead) || Math.abs(a.v) < 2) continue;
    const ax = a.vx ?? Math.sin(a.heading) * a.v, az = a.vz ?? Math.cos(a.heading) * a.v, nx = a.x + Math.sin(a.heading) * a.len * .4, nz = a.z + Math.cos(a.heading) * a.len * .4;
    for (const b of T.near({ x: nx, z: nz }, 5)) {
      if (b === a || b.metT > 0 || !T.overlaps(b, nx, nz, a.wid / 2)) continue;
      const bvx = Math.sin(b.heading) * b.v, bvz = Math.cos(b.heading) * b.v, rv = Math.hypot(ax - bvx, az - bvz); b.metT = .5; n++;
      // two police cars closing on the same player nudge and slow; they don't wreck each other
      if (a.police && b.police && a.mode === 'chase') { a.v *= .5; if (b.mode === 'chase') b.v *= .7; continue; }
      T.city.event({ kind: 'crash', at: { x: nx, z: nz }, car: b, by: a.by ?? a, power: rv });
      if (rv > 6 && b.mode !== 'wreck') T.crash(b, { x: (ax - bvx) * .45, z: (az - bvz) * .45 }, { at: { x: nx, z: nz }, by: a.by ?? a });
      else if (b.mode === 'lane') T.bump(b, 1.2);
      if (a.mode === 'chase') { a.v *= rv > 10 ? .35 : .6; if (rv > 16 && !a.police) T.crash(a, { x: -ax * .2, z: -az * .2 }, { by: a.by }); }
      else { a.vx *= .5; a.vz *= .5; a.spin += (T.R() - .5) * 2; }
    }
  }
  for (const c of T.list) if (c.metT > 0) c.metT -= dt;
  return n;
}
