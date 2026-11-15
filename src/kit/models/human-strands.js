// A real face's head of hair as strands, the way films and the newest games draw it (a groom): thousands of single strands, each a
// thin ribbon that always turns to face the camera (hd3d-gpu.js gpuMaterials.strands, WebGPU), grown in clumps along the ways the hair
// is combed (human-hair.js hairGuides) and standing off the sculpted hair under them, which stays as the dense middle of the hair.
// What makes hair read as hair and not as a helmet is all here: the outline breaks up into strands, the hair has depth (the strands
// deep in it are in the shade of those over them, worked out from how many lie between each point and the open air), locks gather
// toward their tips, a few strays stand out of the line, and every strand is its own length and a little its own colour (grey hair is
// white strands among dark ones, as real grey hair is, not one grey). How a hair curls is its own: straight, wavy, curly or coily
// (tight coils standing off the scalp, as Afro-textured hair grows). Worked out with the head in the sculpting job (human-shapes.js:
// off the main thread, saved with it), in plain numbers; human.js colours it (strandsOn) and puts it on the head's bones.
// Kit use only.
import { HC, AFRO } from './human-head.js';
import { ss } from './field.js';
import { hairGuides } from './human-hair.js';

const abs = Math.abs, mn = Math.min, mx = Math.max, PI = Math.PI, hyp = Math.hypot, f0 = r => mn(1, r / .05);
/** How a hair curls: 0 straight .. 1 coily. The names a game can give (human({ hairTexture })). */
export const CURLS = { straight: 0, wavy: .35, curly: .7, coily: 1 };

/**
 * A head of hair's strands (or null: too little hair). head: the head's piece; style: 'short' (a woman's: a bob), 'long', 'bun', 'curly' or
 * 'afro'; fem; curl: 0 (straight) .. 1 (coily); budget: about how many points (two corners each) all the strands have between them.
 * Returns { P (each point's place on the strand's middle line, twice: the two corners of the ribbon), N (16 bits: the way the hair there faces,
 * square to the strand), T (the way along the strand, and how far out the corner stands from the middle line: + or -), U (u: the strand's own number for dropping it further off,
 * v: 0 at the root .. 1 at the tip), at (the head's point whose colour and bones it takes), dim (8 bits, 200 = as that colour: shade, the
 * hair's own shade inside it and at the roots), pig (8 bits: each strand's own number, which human.js turns to a white strand of a grey head
 * or not), I (triangles), strands (how many) }.
 */
export function hairStrands(head, { style = 'short', fem = false, curl = 0, budget = style === 'afro' ? 150000 : 90000, seed: s0 = 11 } = {}) {
  const afro = style === 'afro', curly = style === 'curly', long = style === 'long', coils = curl > .8;
  const g = hairGuides(head, { style: afro || curly ? 'short' : style, fem, space: long ? .0062 : .0058, edgeSpace: coils ? .0045 : .0032, seed: s0 });
  if (!g) return null;
  const { cards, rnd } = g;
  // each guide's middle line, measured: its points, the ways they face and lie, and how far along each is
  const lines = cards.map(c => {
    const sp = c.spine, L = sp.length, p = [], n = [], cum = [0];
    for (let k = 0; k < L; k++) { p.push(sp[k].p); n.push(sp[k].n); if (k) cum.push(cum[k - 1] + hyp(sp[k].p[0] - sp[k - 1].p[0], sp[k].p[1] - sp[k - 1].p[1], sp[k].p[2] - sp[k - 1].p[2])); }
    return { c, p, n, cum, len: cum[L - 1], at: sp.map(q => q.at), skin: sp.map(q => !!q.skin), wave: rnd() * PI * 2, lean: rnd() - .5 };
  });
  // a point d along a line (on past its end the way it was going): its place, the way the hair faces, along and across
  const Q = { p: [0, 0, 0], n: [0, 0, 0], t: [0, 0, 0], s: [0, 0, 0], at: 0, skin: false };
  const along = (l, d) => {
    const { p, n, cum } = l, L = p.length; let k = 0; while (k < L - 2 && cum[k + 1] < d) k++;
    const span = (cum[k + 1] - cum[k]) || 1e-6, f = (d - cum[k]) / span, a = p[k], b = p[k + 1], na = n[k], nb = n[k + 1];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = hyp(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    for (let q = 0; q < 3; q++) { Q.p[q] = a[q] + (b[q] - a[q]) * f; Q.n[q] = na[q] + (nb[q] - na[q]) * mn(1, mx(0, f)); }
    let nx = Q.n[0], ny = Q.n[1], nz = Q.n[2]; const dn = nx * tx + ny * ty + nz * tz; nx -= dn * tx; ny -= dn * ty; nz -= dn * tz; const nl = hyp(nx, ny, nz) || 1;
    Q.n[0] = nx / nl; Q.n[1] = ny / nl; Q.n[2] = nz / nl; Q.t[0] = tx; Q.t[1] = ty; Q.t[2] = tz;
    Q.s[0] = ty * Q.n[2] - tz * Q.n[1]; Q.s[1] = tz * Q.n[0] - tx * Q.n[2]; Q.s[2] = tx * Q.n[1] - ty * Q.n[0];
    Q.at = l.at[f < .5 ? k : k + 1]; Q.skin = l.skin[f < .5 ? k : k + 1]; return Q;
  };

  // ---- how the hair is: how far it stands off the sculpted hair, how its locks gather, how it curls and waves
  const volume = afro ? .004 : curly ? .007 : long ? .0055 : fem ? .0045 : .0035;   // (how far the outermost strands stand off it, metres)
  const clump = .55 + .25 * (1 - curl), CR = .0004 + .0016 * curl * curl, CP = .022 - .017 * curl;   // (curl: a coil's radius and its length a turn)
  const waveA = curl > .2 && curl < .8 ? .0035 * ss(.2, .45, curl) : 0, waveL = .045;
  const SEG = curl > .55 ? mn(.0045, CP / 5) : .0065;   // (a point every few millimetres, more round a coil)
  const total = lines.reduce((a, l) => a + (l.c.edge ? 0 : l.len), 0) || 1, per = mx(5, mn(64, Math.round(budget * (afro ? .15 : .85) * SEG / (total * (coils ? .5 : 1)))));
  const strands = [];
  for (const l of lines) {
    const c = l.c, edge = !!c.edge, K = edge ? (coils ? 2 : 3) : per;
    for (let j = 0; j < K; j++) {
      const a = (rnd() * 2 - 1), u = edge ? .2 * rnd() : rnd() ** .8, stray = !edge && rnd() < .035, ph = rnd() * PI * 2, cr = CR * (.6 + .8 * rnd()), cp = CP * (.75 + .5 * rnd());
      // (each strand its own length: a lock's strands end at different places, so its end is a soft brush, not a cut)
      const L = mx(.004, (edge ? l.len * (.5 + .5 * rnd()) : l.len * (.72 + .36 * rnd())) * (stray ? 1.25 : 1) * (coils ? .55 + .45 * rnd() : 1));
      const n = mx(3, mn(28, Math.ceil(L / SEG) + 1)), W = c.wide * (edge ? .6 : .75), pts = [];
      let fx = 0, fy = 0, fz = 0;   // (the wander of a frizzy or stray strand, built up along it)
      for (let k = 0; k < n; k++) {
        const d = L * k / (n - 1), f = d / L, q = along(l, d), root = ss(0, edge ? .003 : .009, d);
        const across = a * W * (1 - clump * f ** 1.4) + waveA * Math.sin(d / waveL * PI * 2 + l.wave) * root;
        // (deep in the hair or near its top; a root sinks into the sculpted hair, so where a strand starts never shows. Coily hair stands up off it)
        let lift = edge ? (q.skin ? .00015 : .0004 + .0012 * u) : -.0012 + (.0012 + volume * u) * root;
        if (coils && !edge) lift += volume * .6 * root * (1 - f * .3);
        const cu = cr * root, ca = ph + d / cp * PI * 2;
        if (stray) { lift += .006 * f * f; fx += (rnd() - .5) * .0016 * f; fy += (rnd() - .5) * .0016 * f; fz += (rnd() - .5) * .0016 * f; }
        else if (curl > .3) { const z = .0005 * curl * f; fx += (rnd() - .5) * z; fy += (rnd() - .5) * z; fz += (rnd() - .5) * z; }
        const x = q.p[0] + q.n[0] * lift + q.s[0] * across + (q.s[0] * Math.cos(ca) + q.n[0] * Math.sin(ca)) * cu + fx;
        const y = q.p[1] + q.n[1] * lift + q.s[1] * across + (q.s[1] * Math.cos(ca) + q.n[1] * Math.sin(ca)) * cu + fy;
        const z = q.p[2] + q.n[2] * lift + q.s[2] * across + (q.s[2] * Math.cos(ca) + q.n[2] * Math.sin(ca)) * cu + fz;
        pts.push([x, y, z, q.n[0], q.n[1], q.n[2], q.at, f]);
      }
      strands.push({ pts, u, edge, r: (edge ? .000035 : .00006) * (.8 + .4 * rnd()), shade: .9 + .2 * rnd(), pig: Math.floor(rnd() * 256) });
    }
  }
  // coily or curly hair: short coils standing out all over the top of the hair, as such hair looks from outside (the combed strands under them
  // are its body). From points along the guides, out from the hair and leaning the way it is combed, each a tight coil
  if (curl > .55 && !long && !afro) {
    const nc = Math.round(budget * .45 / mx(3, (.006 + .006 * curl) / (SEG * .8)));
    for (let i = 0; i < nc; i++) {
      const l = lines[Math.floor(rnd() * lines.length)]; if (l.c.edge) continue;
      const q = along(l, rnd() * l.len), base = [q.p[0], q.p[1], q.p[2]], N0 = q.n.slice(), T0 = q.t.slice(), S0 = q.s.slice(), at = q.at;
      const L = (afro ? .012 : curly ? .01 : .0055) * (.6 + .8 * rnd()), cr = CR * (.7 + .6 * rnd()) * 1.15, cp = CP * (.7 + .5 * rnd()), ph = rnd() * PI * 2, out = .35 + .5 * rnd(), side = rnd() - .5;
      const lift0 = (afro || curly ? volume * (.55 + .45 * rnd()) : volume * .8 * rnd()) - .0008;
      const n = mx(4, mn(24, Math.ceil(L / (SEG * .8)) + 1)), pts = [];
      let dx = N0[0] * out + T0[0] * (1 - out) + S0[0] * side, dy = N0[1] * out + T0[1] * (1 - out) + S0[1] * side, dz = N0[2] * out + T0[2] * (1 - out) + S0[2] * side; const dl = hyp(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      // (across the coil: two ways square to the way it goes)
      let ax = dy * N0[2] - dz * N0[1], ay = dz * N0[0] - dx * N0[2], az = dx * N0[1] - dy * N0[0]; const al = hyp(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
      const bx = dy * az - dz * ay, by = dz * ax - dx * az, bz = dx * ay - dy * ax;
      for (let k = 0; k < n; k++) {
        const d = L * k / (n - 1), f = d / L, ca = ph + d / cp * PI * 2, cu = cr * ss(0, .002, d);
        pts.push([base[0] + N0[0] * lift0 + dx * d + (ax * Math.cos(ca) + bx * Math.sin(ca)) * cu, base[1] + N0[1] * lift0 + dy * d + (ay * Math.cos(ca) + by * Math.sin(ca)) * cu,
          base[2] + N0[2] * lift0 + dz * d + (az * Math.cos(ca) + bz * Math.sin(ca)) * cu, N0[0], N0[1], N0[2], at, f]);
      }
      strands.push({ pts, u: .6 + .4 * rnd(), edge: false, r: .00007 * (.8 + .4 * rnd()), shade: .9 + .2 * rnd(), pig: Math.floor(rnd() * 256) });
    }
  }
  // an Afro: hair that stands out from the whole head, every coil out toward a round outline a few centimetres off it, as Afro-textured hair
  // grows when it is left to (the sculpted hair under them is its dark middle). Each strand a tight coil round the way out, a little frizzed
  const ax3 = [0, 0, 0], bx3 = [0, 0, 0];
  const basis = (dx, dy, dz) => { const rx = abs(dy) < .9 ? 0 : 1, ry = abs(dy) < .9 ? 1 : 0; let a0 = dy * 0 - dz * ry, a1 = dz * rx - dx * 0, a2 = dx * ry - dy * rx; const al = hyp(a0, a1, a2) || 1; ax3[0] = a0 / al; ax3[1] = a1 / al; ax3[2] = a2 / al;
    bx3[0] = dy * ax3[2] - dz * ax3[1]; bx3[1] = dz * ax3[0] - dx * ax3[2]; bx3[2] = dx * ax3[1] - dy * ax3[0]; };
  if (afro) {
    const C = AFRO.c, R = AFRO.r, body = lines.filter(l => !l.c.edge && l.len > 0); let made = 0;
    for (let i = 0; made < budget * 1.1 && i < 20000 && body.length; i++) {
      const l = body[Math.floor(rnd() * body.length)], q = along(l, rnd() * l.len), p = q.p.slice(), at = q.at;
      let rx = p[0] - C[0], ry = p[1] - C[1], rz = p[2] - C[2]; const rl = hyp(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
      let dx = rx * .72 + q.n[0] * .28, dy = ry * .72 + q.n[1] * .28, dz = rz * .72 + q.n[2] * .28; const dl = hyp(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      // (how far out the outline is that way: where the line from the root leaves the round)
      const px = (p[0] - C[0]) / R[0], py = (p[1] - C[1]) / R[1], pz = (p[2] - C[2]) / R[2], ex = dx / R[0], ey = dy / R[1], ez = dz / R[2];
      const qa = ex * ex + ey * ey + ez * ez, qb = 2 * (px * ex + py * ey + pz * ez), qc = px * px + py * py + pz * pz - 1, disc = qb * qb - 4 * qa * qc;
      const reach = qc >= 0 || disc < 0 ? .004 : (-qb + Math.sqrt(disc)) / (2 * qa), L = mx(.004, reach * (.78 + .26 * rnd()));
      basis(dx, dy, dz);
      const cr = .0014 + .0012 * rnd(), cp = .005 + .003 * rnd(), ph = rnd() * PI * 2, n = mx(6, mn(36, Math.ceil(L / (cp / 4)) + 1)), pts = [];
      let fx = 0, fy = 0, fz = 0;
      for (let k = 0; k < n; k++) {
        const d = L * k / (n - 1) - .0012, f = k / (n - 1), ca = ph + d / cp * PI * 2, cu = cr * ss(0, .003, d + .0012);
        fx += (rnd() - .5) * .0007 * f; fy += (rnd() - .5) * .0007 * f; fz += (rnd() - .5) * .0007 * f;
        pts.push([p[0] + dx * d + (ax3[0] * Math.cos(ca) + bx3[0] * Math.sin(ca)) * cu + fx, p[1] + dy * d + (ax3[1] * Math.cos(ca) + bx3[1] * Math.sin(ca)) * cu + fy,
          p[2] + dz * d + (ax3[2] * Math.cos(ca) + bx3[2] * Math.sin(ca)) * cu + fz, rx, ry, rz, at, f]);
      }
      // (each a lock of coils, not one hair: a millimetre across, as Afro-textured hair gathers; single hairs this far out would be too few to read)
      made += n; strands.push({ pts, u: .3 + .7 * f0(reach), edge: false, r: .00042 * (.7 + .6 * rnd()), shade: .9 + .2 * rnd(), pig: Math.floor(rnd() * 256) });
    }
  }
  // hair tied in a bun: strands wound round it, each part of a circle round its middle a different way (the sculpted ball under them)
  if (style === 'bun') {
    const B = [HC[0], HC[1] + .034, HC[2] - .108], rb = .034; let at = -1, bd = 1e9;
    for (const l of lines) for (let k = 0; k < l.p.length; k++) { const d = hyp(l.p[k][0] - B[0], l.p[k][1] - B[1], l.p[k][2] - B[2]); if (d < bd && !l.skin[k]) { bd = d; at = l.at[k]; } }
    const nb = at < 0 ? 0 : Math.round(budget * .2 / 24);
    for (let i = 0; i < nb; i++) {
      let ux = rnd() - .5, uy = rnd() - .5, uz = rnd() - .5; const ul = hyp(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul; basis(ux, uy, uz);
      const a0 = rnd() * PI * 2, span = (.7 + 1.1 * rnd()) * PI, rad = rb * (1 + .07 * rnd()) - .0008, n = 24, pts = [];
      for (let k = 0; k < n; k++) { const a = a0 + span * k / (n - 1), cx = ax3[0] * Math.cos(a) + bx3[0] * Math.sin(a), cy = ax3[1] * Math.cos(a) + bx3[1] * Math.sin(a), cz = ax3[2] * Math.cos(a) + bx3[2] * Math.sin(a);
        pts.push([B[0] + cx * rad, B[1] + cy * rad, B[2] + cz * rad, cx, cy, cz, at, k / (n - 1)]); }
      strands.push({ pts, u: .5 + .5 * rnd(), edge: false, r: .00006 * (.8 + .4 * rnd()), shade: .9 + .2 * rnd(), pig: Math.floor(rnd() * 256) });
    }
  }
  if (!strands.length) return null;

  // ---- the shade inside the hair: how many strands' points lie between each point and the open air (counted in cubes of 3 mm, out from the
  // middle of the head), as a film's hair is shaded by the hair over it (deep opacity maps; here once, from all round, not from each light)
  const D = .003, cnt = new Map(), key = (i, j, k) => ((i + 128) * 256 + j + 128) * 256 + k + 128, O = [HC[0], HC[1] - .02, HC[2] - .01];
  for (const s of strands) for (const p of s.pts) { const kk = key(Math.floor((p[0] - O[0]) / D), Math.floor((p[1] - O[1]) / D), Math.floor((p[2] - O[2]) / D)); cnt.set(kk, (cnt.get(kk) || 0) + 1); }
  const shadeAt = p => {
    let ox = p[0] - O[0], oy = p[1] - O[1], oz = p[2] - O[2]; const ol = hyp(ox, oy, oz) || 1; ox /= ol; oy /= ol; oz /= ol;
    // (out from the middle, and a little toward the way the hair faces there: the open air is that way)
    ox = ox * .5 + p[3] * .5; oy = oy * .5 + p[4] * .5; oz = oz * .5 + p[5] * .5; const l2 = hyp(ox, oy, oz) || 1; ox /= l2; oy /= l2; oz /= l2;
    let sum = 0; for (let k = 1; k <= 6; k++) sum += cnt.get(key(Math.floor((p[0] + ox * D * k - O[0]) / D), Math.floor((p[1] + oy * D * k - O[1]) / D), Math.floor((p[2] + oz * D * k - O[2]) / D))) || 0;
    return sum;
  };
  // (how dense the hair is, so the shade is the same for a thin head of hair as a thick: the median of the cubes' counts)
  const counts = [...cnt.values()].sort((a, b) => a - b), med = counts[Math.floor(counts.length * .6)] || 1;
  // drawn from the innermost out, the hairline's fine hairs first: each strand is laid over what is under it, see-through as far as it is thinner
  // than a pixel. Each has a number of its own, 0..1 (U's u): further off only those under a share are drawn, each as much thicker, so the hair
  // stays as full (Indiana Jones and the Great Circle drops strands so; there the list is shuffled, here the number does it, and the order stays)
  strands.sort((a, b) => (a.edge ? -1 : 0) - (b.edge ? -1 : 0) || a.u - b.u);
  for (const st of strands) st.lod = st.edge ? 0 : rnd();

  // ---- the ribbons: two corners at each point
  const m = strands.reduce((a, s) => a + s.pts.length * 2, 0), tris = strands.reduce((a, s) => a + (s.pts.length - 1) * 2, 0);
  const P = new Float32Array(m * 3), N = new Int16Array(m * 3), T = new Float32Array(m * 4), U = new Float32Array(m * 2), At = new Uint32Array(m), Dm = new Uint8Array(m), Pg = new Uint8Array(m);
  const I = m > 65535 ? new Uint32Array(tris * 3) : new Uint16Array(tris * 3);
  let v = 0, t = 0;
  for (const s of strands) {
    const L = s.pts.length;
    for (let k = 0; k < L; k++) {
      const p = s.pts[k], a = s.pts[mx(0, k - 1)], b = s.pts[mn(L - 1, k + 1)], f = p[7];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = hyp(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let nx = p[3], ny = p[4], nz = p[5]; const dn = nx * tx + ny * ty + nz * tz; nx -= dn * tx; ny -= dn * ty; nz -= dn * tz; const nl = hyp(nx, ny, nz) || 1;
      const deep = Math.exp(-1.1 * shadeAt(p) / med), sh = s.shade * (.3 + .7 * deep) * (.78 + .22 * ss(0, .5, f)), r = s.r * (1 - .7 * f * f);
      for (let e = 0; e < 2; e++) {
        const j = v + e;
        P[j * 3] = p[0]; P[j * 3 + 1] = p[1]; P[j * 3 + 2] = p[2];
        N[j * 3] = Math.round(nx / nl * 32767); N[j * 3 + 1] = Math.round(ny / nl * 32767); N[j * 3 + 2] = Math.round(nz / nl * 32767);
        T[j * 4] = tx; T[j * 4 + 1] = ty; T[j * 4 + 2] = tz; T[j * 4 + 3] = e ? r : -r;
        U[j * 2] = s.lod; U[j * 2 + 1] = f; At[j] = p[6]; Dm[j] = Math.round(mn(255, 200 * sh)); Pg[j] = s.pig;
      }
      if (k < L - 1) { I[t++] = v; I[t++] = v + 1; I[t++] = v + 2; I[t++] = v + 1; I[t++] = v + 3; I[t++] = v + 2; }
      v += 2;
    }
  }
  return { P, N, T, U, at: At, dim: Dm, pig: Pg, I, strands: strands.length };
}

/**
 * The strands' (hairStrands) colours and bones for one person: off, where the head's points start in the person's lists; C, SI, SW, the
 * person's colours and bones (each strand's point takes the bones of the head's point it grew from); hair (linear [r, g, b]: the hair's colour); grey (0..1: how many of
 * the strands are white) and white (linear [r, g, b]: a white strand's colour) and dark (the colour of the rest, or null: the head's own).
 * Returns { C, SI, SW }.
 */
export function strandsOn(st, { off, C, SI, SW, hair, grey = 0, white = [.78, .76, .72], dark = null }) {
  const m = st.at.length, Cp = new Float32Array(m * 3), Jp = new Uint16Array(m * 4), Wp = new Float32Array(m * 4), cut = grey * 255, base = dark || hair;
  for (let j = 0; j < m; j++) {
    // (a strand is the hair's colour, a little lighter or darker strand by strand: not the head's point it grows from, which at the hairline is skin)
    const a = off + st.at[j], pg = st.pig[j], w = pg < cut, d = st.dim[j] / 200 * (w ? 1 : .86 + .28 * ((pg * 37) % 256) / 255);
    for (let q = 0; q < 3; q++) Cp[j * 3 + q] = (w ? white[q] : base ? base[q] : C[a * 3 + q]) * d;
    for (let q = 0; q < 4; q++) { Jp[j * 4 + q] = SI[a * 4 + q]; Wp[j * 4 + q] = SW[a * 4 + q]; }
  }
  return { C: Cp, SI: Jp, SW: Wp };
}
