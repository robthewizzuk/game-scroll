// gs.models.sculpt(shapes, options): soft, blended shapes the way sculptors block things out (balls,
// rounded boxes, capsules, rings... melted together or carved away), turned into a mesh in code with
// surface nets (the isosurface library). For creatures, rocks, snowmen, blobby props, characters'
// rough forms: anything that would otherwise need a modelling program.
// The number work is sculpt-arrays.js; while a card loads it runs in a background worker (jobs.js),
// so sculpting doesn't hold the feed still.
// Kit use only: games reach it as gs.models.sculpt.
import { BufferGeometry, BufferAttribute } from 'three';
import { sculptArrays } from './sculpt-arrays.js';
import { pause, built, need, loading } from '../slices.js';
import { run, canRun } from '../jobs.js';

function geometry({ P, N, U, C, I }) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(P, 3)); g.setAttribute('normal', new BufferAttribute(N, 3)); g.setAttribute('uv', new BufferAttribute(U, 2));
  if (C) g.setAttribute('color', new BufferAttribute(C, 3));
  g.setIndex(new BufferAttribute(I, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/**
 * A mesh (BufferGeometry: position, normal, uv in metres, and colour when a shape has one) from shapes
 * melted together: each { ball: r } | { box: [w, h, d], round } | { cylinder: [r, h], round } |
 * { torus: [R, r] } | { cone: [r, h] } | { capsule: [[x, y, z], [x, y, z]], r }, with at [x, y, z], rot
 * [x, y, z] (radians), scale (number or [x, y, z]), blend (how softly it melts in, metres), cut (true:
 * carved away) and colour. Or a function (x, y, z) => distance with options.bounds [[min], [max]].
 * Options: blend (.08), res (cells along the longest side, 48; up to 128), colour (for shapes with none).
 * Make sculpts while loading (make() or reset()): about 0.1 s each on a phone. The same shapes again give
 * back the same geometry, shared (clone it before changing it).
 */
const made = new Map();   // the same shapes asked for again: the same geometry (shared, so don't change it)
const keep = (key, g) => { if (made.size >= 48 && !loading()) made.delete(made.keys().next().value); made.set(key, g); return g; };   // (a loading card keeps all it has made: it is asked for them again next pass)
export function sculpt(shapes, o = {}) {
  if (typeof shapes === 'function') return geometry(sculptArrays(shapes, o));   // (a function can't be sent to a worker)
  const key = JSON.stringify([shapes, o]);
  // while a card loads: sculpted in a background worker, the card waiting for it (slices.js need)
  const w = need('Models', 'sculpt|' + key, () => !made.has(key) && canRun() && run('sculpt', { shapes, o }).then(a => made.get(key) || keep(key, geometry(a))));
  if (w) return w;
  const g = made.get(key); if (g) return g;
  pause('Models');
  const geo = keep(key, geometry(sculptArrays(shapes, o))); built();
  return geo;
}
