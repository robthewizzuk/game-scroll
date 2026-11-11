// The room maths behind AR phase 2 (ar3d.js): the phone's depth picture as a mesh that hides virtual
// things behind real ones, and the real room's light as a direction for the sun and a picture for
// the reflections. Plain maths, no drawing and no three.js, so it runs in Node too
// (scripts/kit-test.mjs builds rooms and lights and checks the answers).
//
// Everything here is in the AR session's own space (y up, metres, as ARCore and ARKit give it)
// unless it says otherwise. Matrices are 16 numbers, column-major.

/** The bytes of a base64 text (how the phone sends its pictures: far smaller than a list of numbers). */
export function bytes(b64) {
  const s = atob(b64), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** A depth picture's n distances in millimetres (16 bits each, low byte first) from its base64 text. */
export function depthOf(b64, n, out = new Uint16Array(n)) {
  const b = bytes(b64), m = Math.min(n, b.length >> 1);
  for (let i = 0; i < m; i++) out[i] = b[i * 2] | b[i * 2 + 1] << 8;
  out.fill(0, m, n);
  return out;
}

/**
 * A mapped flat surface for depthMesh, from its pose (the phone gives the surface's middle, with its y
 * axis standing out of it) and its size along its own x and z. With no size it has no edges (the floor).
 */
export function flatOf(pose, w = Infinity, d = Infinity, tol = 0) {
  return { nx: pose[4], ny: pose[5], nz: pose[6], cx: pose[12], cy: pose[13], cz: pose[14], ax: pose[0], ay: pose[1], az: pose[2], bx: pose[8], by: pose[9], bz: pose[10], hw: w / 2, hd: d / 2, tol };
}
/** The floor at height y as a flat surface (tol: how far off a spot may be and still count as floor; 0 for the usual). */
export const floorFlat = (y, tol = 0) => ({ nx: 0, ny: 1, nz: 0, cx: 0, cy: y, cz: 0, ax: 1, ay: 0, az: 0, bx: 0, by: 0, bz: 1, hw: Infinity, hd: Infinity, tol });

/**
 * The phone's depth picture as a mesh, so the graphics chip can hide what is behind the real room.
 *   d      w x h distances in millimetres from the camera's plane (0: not known), rows from the top of
 *          the view, left to right, the first and last of each on the view's edges
 *   pose   the camera when the picture was taken; proj its lens (the projection of the whole view)
 *   pos    Float32Array(w * h * 3) to fill with places; idx Uint16Array((w - 1) * (h - 1) * 6) with triangles
 *   flats  mapped flat surfaces (flatOf, floorFlat)
 * Gives how many entries of idx are in use.
 *
 * Depth from a phone is a few centimetres out, so the mesh would cut into things that stand on the
 * real floor or hang on a real wall, and into their shadows. Two things stop that: every spot is set
 * back a little (`push` metres and `lean` of its distance), and a spot on a mapped surface (within
 * 5 cm and 3% of its distance) goes 3 cm behind that surface. Spots the phone knows nothing about,
 * closer than `near` or beyond `far`, leave a hole: nothing is hidden there.
 */
export function depthMesh(d, w, h, pose, proj, pos, idx, { flats = [], near = .15, far = 8, push = .02, lean = .02 } = {}) {
  const p0 = proj[0], p5 = proj[5], p8 = proj[8], p9 = proj[9], ox = pose[12], oy = pose[13], oz = pose[14];
  // which side of each surface the camera is on, and how far from it
  const side = flats.map(f => (ox - f.cx) * f.nx + (oy - f.cy) * f.ny + (oz - f.cz) * f.nz);
  for (let j = 0, k = 0; j < h; j++) {
    const ny = 1 - 2 * j / (h - 1);
    for (let i = 0; i < w; i++, k++) {
      const z = d[k] / 1000, at = k * 3;
      if (!(z > near && z < far)) { pos[at] = NaN; continue; }
      const cx = (2 * i / (w - 1) - 1 + p8) * z / p0, cy = (ny + p9) * z / p5;
      // from the camera to the spot, in the room
      const rx = pose[0] * cx + pose[4] * cy - pose[8] * z, ry = pose[1] * cx + pose[5] * cy - pose[9] * z, rz = pose[2] * cx + pose[6] * cy - pose[10] * z;
      let t = 1 + lean + push / z, best = Infinity;
      for (let f = 0; f < flats.length; f++) {
        const F = flats[f], s = side[f], tol = F.tol || .05 + .03 * z, cam = Math.abs(s);
        if (cam < tol) continue;                                     // the camera is in the surface: it says nothing here
        const along = (rx * F.nx + ry * F.ny + rz * F.nz) * Math.sign(s), off = cam + along;   // the spot's distance in front of the surface
        if (Math.abs(off) >= tol || Math.abs(off) >= best || along > -1e-3) continue;
        if (F.hw !== Infinity) {
          const px = ox + rx - F.cx, py = oy + ry - F.cy, pz = oz + rz - F.cz;
          if (Math.abs(px * F.ax + py * F.ay + pz * F.az) > F.hw + .15 || Math.abs(px * F.bx + py * F.by + pz * F.bz) > F.hd + .15) continue;
        }
        best = Math.abs(off); t = Math.min(1.6, (cam + .03) / -along);
      }
      pos[at] = ox + rx * t; pos[at + 1] = oy + ry * t; pos[at + 2] = oz + rz * t;
    }
  }
  let n = 0;
  for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
    const a = j * w + i, b = a + 1, c = a + w, e = c + 1, A = pos[a * 3] === pos[a * 3], B = pos[b * 3] === pos[b * 3], C = pos[c * 3] === pos[c * 3], E = pos[e * 3] === pos[e * 3];
    if (A && B && C) { idx[n++] = a; idx[n++] = c; idx[n++] = b; }
    if (B && C && E) { idx[n++] = b; idx[n++] = c; idx[n++] = e; }
  }
  // (a spot with no place must still be a number for the graphics chip: no triangle uses it)
  for (let k = 0; k < w * h * 3; k += 3) if (pos[k] !== pos[k]) pos[k] = pos[k + 1] = pos[k + 2] = 0;
  return n;
}

/* ---------- the room's light ---------- */

/**
 * The picture of the room's light the phone sends, opened up: { size, max, px } (px: base64 of six
 * square faces, +x -x +y -y +z -z, three bytes a dot, each the square root of the colour's share of
 * max) to { size, rgb: Float32Array }. Faces are laid out the way graphics chips keep cube maps.
 */
export function envOf(e) {
  const b = bytes(e.px), size = e.size | 0, n = 6 * size * size * 3, rgb = new Float32Array(n), max = e.max > 0 ? e.max : 1;
  for (let i = 0; i < n && i < b.length; i++) { const v = b[i] / 255; rgb[i] = v * v * max; }
  return { size, rgb };
}
/** The other way, for tests and the pretend phone: { size, rgb } to what the phone would send. */
export function envPack(env) {
  let sum = 0, top = 0;
  for (let i = 0; i < env.rgb.length; i++) { sum += env.rgb[i]; if (env.rgb[i] > top) top = env.rgb[i]; }
  const max = Math.max(1e-6, Math.min(top, 32 * sum / env.rgb.length));
  let s = '';
  for (let i = 0; i < env.rgb.length; i++) s += String.fromCharCode(Math.round(255 * Math.sqrt(Math.min(1, env.rgb[i] / max))));
  return { size: env.size, max, px: btoa(s) };
}

// the middle of dot (col, row) of a face as a direction, into D
const D = [0, 0, 0];
function dotDir(face, a, b) {
  if (face === 0) { D[0] = 1; D[1] = -b; D[2] = -a; } else if (face === 1) { D[0] = -1; D[1] = -b; D[2] = a; }
  else if (face === 2) { D[0] = a; D[1] = 1; D[2] = b; } else if (face === 3) { D[0] = a; D[1] = -1; D[2] = -b; }
  else if (face === 4) { D[0] = a; D[1] = -b; D[2] = 1; } else { D[0] = -a; D[1] = -b; D[2] = -1; }
}

/** The colour the room shows in direction (x, y, z), into out[0..2]. */
export function envAt(env, x, y, z, out) {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z), S = env.size;
  let face, a, b, m;
  if (ax >= ay && ax >= az) { m = ax || 1; if (x >= 0) { face = 0; a = -z; b = -y; } else { face = 1; a = z; b = -y; } }
  else if (ay >= az) { m = ay; if (y >= 0) { face = 2; a = x; b = z; } else { face = 3; a = x; b = -z; } }
  else { m = az; if (z >= 0) { face = 4; a = x; b = -y; } else { face = 5; a = -x; b = -y; } }
  const col = Math.min(S - 1, Math.max(0, (a / m + 1) / 2 * S | 0)), row = Math.min(S - 1, Math.max(0, (b / m + 1) / 2 * S | 0)), at = ((face * S + row) * S + col) * 3;
  out[0] = env.rgb[at]; out[1] = env.rgb[at + 1]; out[2] = env.rgb[at + 2];
  return out;
}

const lum = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
/**
 * What the room's picture says about its light: { mean (average brightness), x, y, z (towards the
 * brightest part: a lamp, a window), sharp (how much of the light comes from there, 0 to 1) }.
 * A room lit evenly gives a low `sharp`: then the direction means little.
 */
export function envLight(env) {
  const S = env.size; let sum = 0, area = 0;
  for (let f = 0, at = 0; f < 6; f++) for (let r = 0; r < S; r++) for (let c = 0; c < S; c++, at += 3) {
    const a = (c + .5) / S * 2 - 1, b = (r + .5) / S * 2 - 1, w = 1 / Math.pow(1 + a * a + b * b, 1.5);   // dots near a face's corners cover less of the sky
    sum += lum(env.rgb[at], env.rgb[at + 1], env.rgb[at + 2]) * w; area += w;
  }
  const mean = sum / area;
  let x = 0, y = 0, z = 0, over = 0;
  for (let f = 0, at = 0; f < 6; f++) for (let r = 0; r < S; r++) for (let c = 0; c < S; c++, at += 3) {
    const a = (c + .5) / S * 2 - 1, b = (r + .5) / S * 2 - 1, l2 = 1 + a * a + b * b, w = 1 / Math.pow(l2, 1.5);
    const e = (lum(env.rgb[at], env.rgb[at + 1], env.rgb[at + 2]) - 2 * mean) * w;   // only what stands well out of the rest
    if (e <= 0) continue;
    dotDir(f, a, b); const l = Math.sqrt(l2);
    x += D[0] / l * e; y += D[1] / l * e; z += D[2] / l * e; over += e;
  }
  const len = Math.hypot(x, y, z);
  if (!(len > 0)) return { mean, x: 0, y: 1, z: 0, sharp: 0 };
  // (len / over: 1 when the bright dots are all in one place, low when they are scattered round the room)
  return { mean, x: x / len, y: y / len, z: z / len, sharp: Math.min(1, over / (sum || 1)) * (len / over) };
}

/**
 * How much the room's light has changed between two of the phone's pictures of it, 0 (the same) to
 * about 2, with each picture's own brightness taken out: a room that only got dimmer hasn't changed
 * where its light is.
 */
export function envChange(a, meanA, b, meanB) {
  if (a.size !== b.size) return 2;
  const ka = 1 / Math.max(1e-6, meanA), kb = 1 / Math.max(1e-6, meanB); let d = 0, sum = 0;
  for (let i = 0; i < a.rgb.length; i++) { const x = Math.min(24, a.rgb[i] * ka), y = Math.min(24, b.rgb[i] * kb); d += Math.abs(x - y); sum += x + y; }
  return sum > 0 ? 2 * d / sum : 0;
}

/** A direction turned about the upright by `a` radians (three's makeRotationY): [x, z] into out. */
export function turnY(x, z, a, out = [0, 0]) { const c = Math.cos(a), s = Math.sin(a); out[0] = c * x + s * z; out[1] = c * z - s * x; return out; }

const C3 = [0, 0, 0], T2 = [0, 0];
/**
 * Paint the room's picture onto a ball of directions: dirs (x, y, z each, in game space) get colours
 * in out. yaw turns game directions into the AR session's (the game's "straight ahead" is wherever the
 * phone pointed first). Colours are scaled so the average brightness is `level` (how bright the room
 * is comes from the phone's own reading, not from here), and nothing is more than `cap` times that:
 * one glaring dot would otherwise sparkle in every shiny thing.
 */
export function envPaint(env, dirs, yaw, out, { level = 1, cap = 24, mean = envLight(env).mean } = {}) {
  const k = level / Math.max(1e-6, mean), top = cap * level;
  for (let i = 0; i < dirs.length; i += 3) {
    turnY(dirs[i], dirs[i + 2], yaw, T2);
    envAt(env, T2[0], dirs[i + 1], T2[1], C3);
    out[i] = Math.min(top, C3[0] * k); out[i + 1] = Math.min(top, C3[1] * k); out[i + 2] = Math.min(top, C3[2] * k);
  }
  return out;
}

/**
 * Where to put the sun for a real light in direction (x, y, z) (towards the light): the same way
 * round the room, but never lower than `up` (the sine of its height: .42 is 25 degrees), so shadows
 * don't stretch right across the floor when the light is a window or a lamp at eye height.
 */
export function sunDir(x, y, z, out = [0, 0, 0], up = .42) {
  const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
  if (y < up) {
    const flat = Math.hypot(x, z), k = flat > 1e-4 ? Math.sqrt(1 - up * up) / flat : 0;
    x *= k; z *= k; y = flat > 1e-4 ? up : 1;
  }
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}
