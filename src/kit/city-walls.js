// gs.city close up: what the walls of a made-up city wear at street level. Posters pasted between the ground floor's
// windows (made-up bands, fairs, markets and lost cats, some pasted over others, some torn), tags and painted pieces in
// made-up words (low on the walls, and big across the harbour's sheds), damp streaks under some sills, rust runs, and
// grime along the foot of the walls. One picture made in code (4 x 4 cells, the tags drawn white so each copy takes its
// own colour from the mesh), cut into flat quads a little off the walls, one mesh a chunk shown within the city's detail
// metres like the rest of the dressing. Only walls that face the street wear anything. From the city's seed, with random
// numbers of its own, so a city's layout is the same with it or without it (City option walls: false for none).
// Kit use only: city.js calls these.
import { BufferGeometry, Float32BufferAttribute, CanvasTexture, Color, MeshStandardMaterial, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { rng } from './math.js';
import { font } from './fontlib.js';
import { phoneClass } from './speed.js';
import { pause, built } from './slices.js';

const NORMAL = [[0, -1], [1, 0], [0, 1], [-1, 0]];
// the cells of the picture (x, y, w, h in cells of a 4 x 4 grid, y down the canvas)
const POSTER = [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1]].map(([x, y]) => ({ x, y, w: 1, h: 1 }));
const TAG = [[2, 1], [3, 1], [2, 2], [3, 2]].map(([x, y]) => ({ x, y: y + .14, w: 1, h: .72 }));   // (the middle of the cell: the letters)
const PIECE = [{ x: 0, y: 2.04, w: 2, h: .92 }];
const STREAK = [{ x: 0, y: 3, w: 1, h: 1 }, { x: 1, y: 3, w: 1, h: 1 }];
const GRIME = [{ x: 2, y: 3, w: 2, h: .5 }, { x: 2, y: 3.5, w: 2, h: .5 }];
// made-up words: band and fair names on the posters, the letters of the tags
const BILLS = [['VELMAR', 'live at the Kesto'], ['NIGHT MARKET', 'every Friday'], ['PAPER OWLS', 'new record out now'], ['BRASS MOTH', 'one night only'],
  ['CINDER CLUB', 'doors at nine'], ['LOW TIDE', 'harbour fair'], ['LOST CAT', 'answers to Pim'], ['ORRIN & THE GULLS', 'free entry'], ['SALT FAIR', 'all weekend'], ['LUMEN', 'films in the square']];
const SYL = ['ka', 'zo', 'rek', 'vy', 'mo', 'tez', 'lu', 'qi', 'dro', 'sk', 'ny', 'fa', 'jo', 'wix', 'pe', 'ru'];
const POSTER_COLOURS = [['#f2e6c8', '#c43a2a', '#1c1c1c'], ['#1d2b4a', '#f2c84a', '#f4f0e6'], ['#e7e3da', '#2a6a8a', '#1a1a1a'], ['#d8442e', '#fff3de', '#1a1410'],
  ['#f4d23a', '#1a1a1a', '#b8302a'], ['#2a4a32', '#e8d8a0', '#f2eee0']];

let PICTURE = null, MAT = null;
/** The walls' picture: made once (on a slow phone at half the size). */
export function wallPicture() {
  if (PICTURE) return PICTURE;
  pause('Textures');
  const S = phoneClass() === 'low' ? 512 : 1024, c = S / 4, k = S / 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), R = rng(1871);
  g.clearRect(0, 0, S, S); g.lineCap = g.lineJoin = 'round';
  const rect = q => [q.x * c, q.y * c, q.w * c, q.h * c];
  // posters: paper in three colours, a headline, a shape, lines of small print; worn edges and a torn corner
  POSTER.forEach((q, i) => {
    const [x0, y0, w0, h0] = rect(q), [bg, fg, ink] = POSTER_COLOURS[i % POSTER_COLOURS.length], [head, sub] = BILLS[i % BILLS.length];
    const w = w0 * .72, h = h0 * .96, x = x0 + (w0 - w) / 2, y = y0 + (h0 - h) / 2;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    g.fillStyle = fg;
    if (i % 3 === 0) { g.beginPath(); g.arc(x + w / 2, y + h * .58, w * .3, 0, 7); g.fill(); }
    else if (i % 3 === 1) { g.fillRect(x, y + h * .44, w, h * .3); }
    else { g.beginPath(); for (let a = 0; a < 10; a++) { const r = a % 2 ? w * .14 : w * .32, t = a / 10 * Math.PI * 2 - Math.PI / 2; g.lineTo(x + w / 2 + Math.cos(t) * r, y + h * .58 + Math.sin(t) * r); } g.fill(); }
    let size = 40 * k; g.font = font('Rubik', size, 800); const m = g.measureText(head).width; if (m > w * .88) size *= w * .88 / m;
    g.font = font('Rubik', size, 800); g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = ink; g.fillText(head, x + w / 2, y + h * .07);
    g.font = font('Rubik', 15 * k, 500); g.fillText(sub, x + w / 2, y + h * .07 + size * 1.1, w * .9);
    g.globalAlpha = .7; for (let l = 0; l < 3; l++) g.fillRect(x + w * .15, y + h * (.84 + l * .045), w * (.5 + R() * .2), 3 * k);
    g.globalAlpha = 1;
    // weather: a paler, blotchy skin, and a crease
    for (let n = 0; n < 70; n++) { g.fillStyle = `rgba(255,250,235,${.015 + R() * .035})`; g.beginPath(); g.arc(x + R() * w, y + R() * h, (4 + R() * 16) * k, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1.2 * k; g.beginPath(); g.moveTo(x, y + h * (.3 + R() * .4)); g.lineTo(x + w, y + h * (.3 + R() * .4)); g.stroke();
    g.restore();
    // a torn corner, and ragged edges
    g.save(); g.globalCompositeOperation = 'destination-out';
    const cx = R() < .5 ? x : x + w, cy = y + h, t = (18 + R() * 30) * k; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (cx === x ? t : -t), cy); for (let s = 0; s < 6; s++) g.lineTo(cx + (cx === x ? 1 : -1) * t * (1 - s / 6) * (.5 + R() * .6), cy - t * s / 6 * (.6 + R() * .5)); g.lineTo(cx, cy - t); g.fill();
    for (let n = 0; n < 30; n++) { const side = n % 4, s = R(); g.beginPath(); g.arc(side === 0 ? x + s * w : side === 1 ? x + w : side === 2 ? x + s * w : x, side === 0 ? y : side === 1 ? y + s * h : side === 2 ? y + h : y + s * h, (1 + R() * 2.5) * k, 0, 7); g.fill(); }
    g.restore();
  });
  // a made-up word for a tag or a piece
  const word = (n, Rw) => { let s = ''; while (s.length < n) s += SYL[Math.floor(Rw() * SYL.length)]; return s.slice(0, n).toUpperCase(); };
  // letters drawn one by one, each tilted, in white with a dark edge (the mesh gives each copy its colour), with drips
  const letters = (text, x, y, w, h, { size, outline, tilt, drips, Rw }) => {
    g.font = font('Rubik', size, 800); g.textBaseline = 'middle'; g.textAlign = 'center';
    const widths = [...text].map(ch => g.measureText(ch).width * .86), total = widths.reduce((a, b) => a + b, 0), sc = Math.min(1, w * .92 / total);
    let px = x + (w - total * sc) / 2; const at = [];
    for (let i = 0; i < text.length; i++) { at.push([px + widths[i] * sc / 2, y + h / 2 + (Rw() - .5) * h * .12, (Rw() - .5) * tilt]); px += widths[i] * sc; }
    for (const pass of ['edge', 'fill']) at.forEach(([lx, ly, a], i) => {
      g.save(); g.translate(lx, ly); g.rotate(a); g.transform(1, 0, -.18, 1, 0, 0); g.scale(sc, sc * 1.1);
      if (pass === 'edge') { g.strokeStyle = '#141414'; g.lineWidth = outline; g.strokeText(text[i], 0, 0); g.fillStyle = '#141414'; g.fillText(text[i], outline * .35, outline * .35); }
      else { g.fillStyle = '#ffffff'; g.fillText(text[i], 0, 0); }
      g.restore();
    });
    g.strokeStyle = '#ffffff'; g.lineWidth = 2.2 * k;
    for (let d = 0; d < drips; d++) { const dx = x + w * (.1 + Rw() * .8), dy = y + h * (.62 + Rw() * .1), len = h * (.08 + Rw() * .25); g.beginPath(); g.moveTo(dx, dy); g.lineTo(dx, dy + len); g.stroke(); g.beginPath(); g.arc(dx, dy + len, 2 * k, 0, 7); g.fillStyle = '#ffffff'; g.fill(); }
  };
  TAG.forEach((q, i) => {
    const [x, y, w, h] = rect(q), Rw = rng(300 + i * 17);
    if (i % 2) {   // a quick tag: thin and fast, with an underline
      g.save(); g.strokeStyle = '#ffffff'; g.lineWidth = 6 * k;
      g.font = font('Rubik', 70 * k, 500); g.textAlign = 'center'; g.textBaseline = 'middle'; g.translate(x + w / 2, y + h / 2); g.rotate(-.12); g.transform(1, 0, -.3, 1, 0, 0);
      g.fillStyle = '#ffffff'; g.fillText(word(3 + i % 2, Rw), 0, 0, w * .85);
      g.beginPath(); g.moveTo(-w * .38, h * .2); g.quadraticCurveTo(0, h * .3, w * .4, h * .12); g.stroke();
      g.restore();
    } else letters(word(4, Rw), x, y + h * .15, w, h * .7, { size: 82 * k, outline: 11 * k, tilt: .35, drips: 4, Rw });
  });
  PIECE.forEach((q, i) => {
    const [x, y, w, h] = rect(q), Rw = rng(900 + i);
    // a soft cloud behind it, then the letters, big
    g.save(); g.globalAlpha = .55; g.fillStyle = '#ffffff';
    for (let n = 0; n < 14; n++) { g.beginPath(); g.arc(x + w * (.08 + Rw() * .84), y + h * (.3 + Rw() * .4), h * (.12 + Rw() * .16), 0, 7); g.fill(); }
    g.restore();
    letters(word(5, Rw), x, y + h * .08, w, h * .84, { size: 150 * k, outline: 16 * k, tilt: .25, drips: 7, Rw });
  });
  // damp streaks: thin runs from the top, darker where they start
  STREAK.forEach((q, i) => {
    const [x, y, w, h] = rect(q), Rs = rng(40 + i), rust = i === 1;
    for (let n = 0; n < 34; n++) {
      const sx = x + w * (.08 + Rs() * .84), len = h * (.3 + Rs() * .68), sw = (1.5 + Rs() * 8) * k, a = .15 + Rs() * .4, y0 = y + Rs() * h * .1, gr = g.createLinearGradient(0, y0, 0, y0 + len);
      gr.addColorStop(0, rust ? `rgba(120,58,22,${a + .1})` : `rgba(40,36,30,${a})`); gr.addColorStop(.3 + Rs() * .4, rust ? `rgba(110,60,30,${a * .6})` : `rgba(40,36,30,${a * .5})`); gr.addColorStop(1, 'rgba(40,36,30,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(sx, y0); g.lineTo(sx + sw, y0); g.lineTo(sx + sw * (.4 + Rs() * .4), y0 + len); g.lineTo(sx + sw * .3, y0 + len); g.fill();
    }
  });
  // grime along the foot of a wall: darkest at the ground, splashes above
  GRIME.forEach((q, i) => {
    const [x, y, w, h] = rect(q), Rs = rng(70 + i), gr = g.createLinearGradient(0, y + h, 0, y);
    gr.addColorStop(0, 'rgba(34,30,24,.62)'); gr.addColorStop(.45, 'rgba(34,30,24,.25)'); gr.addColorStop(1, 'rgba(34,30,24,0)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    for (let n = 0; n < 160; n++) { g.fillStyle = `rgba(30,26,20,${.05 + Rs() * .15})`; g.beginPath(); g.arc(x + Rs() * w, y + h * (1 - Rs() * Rs()), (1 + Rs() * 5) * k, 0, 7); g.fill(); }
  });
  const t = new CanvasTexture(cv); t.colorSpace = SRGBColorSpace; t.anisotropy = 8; t.minFilter = LinearMipmapLinearFilter; t.name = 'city walls';
  PICTURE = t; built();
  return t;
}
/** The one material every wall's marks are drawn with. */
export function wallMat() {
  return MAT ||= new MeshStandardMaterial({ map: wallPicture(), vertexColors: true, transparent: true, depthWrite: false, roughness: .88, alphaTest: .02,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, name: 'city walls' });
}

const uvOf = q => [q.x / 4, 1 - (q.y + q.h) / 4, (q.x + q.w) / 4, 1 - q.y / 4];
/**
 * What one building's street walls wear (into out: a list of quads). b: the building; F: its facade; win: where a window is in
 * a cell of it (x0, y0, x1, y1, 0..1); base: the foot of its first storey of windows (above the shops, if it has them);
 * open(x, z): true where the street is; busy: how much (by the style), 0..1.
 */
export function wallMarks(b, F, win, base, kerb, seed, open, busy, out) {
  const R = rng(seed * 53 + b.id * 7919 + 11), p = b.parts[0];
  const sides = [[p.x0, p.z0, p.x1, p.z0], [p.x1, p.z0, p.x1, p.z1], [p.x0, p.z1, p.x1, p.z1], [p.x0, p.z0, p.x0, p.z1]];
  sides.forEach(([ax, az, bx, bz], s) => {
    const [nx, nz] = NORMAL[s], L = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (L < 3 || !open(mx + nx * 1.5, mz + nz * 1.5)) return;   // (a wall against the next building wears nothing)
    const along = t => [ax + (bx - ax) * t / L, az + (bz - az) * t / L];
    const clear = t => { const [x, z] = along(t); return open(x + nx * .6, z + nz * .6); };   // (part of a wall may stand against the next building)
    const put = (t, y0, w, h, q, col, flip = false) => { if (clear(t) && clear(t - w / 2 + .05) && clear(t + w / 2 - .05)) out.push({ x: along(t)[0] + nx * .03, z: along(t)[1] + nz * .03, nx, nz, y0, w, h, q, col, flip }); };
    const punched = F.kind === 'punched' || F.kind === 'house', n = Math.max(1, Math.round(L / F.win)), cw = L / n, floor = F.floor;
    // grime along the foot of every street wall (not across a shop's glass)
    if (!b.shops) for (let t = 0; t < L - .3; t += 2.2) { const w = Math.min(2.6, L - t); put(t + w / 2, kerb - .02, w + .2, .35 + R() * .45, R.pick(GRIME), grey(.75 + R() * .3), R() < .5); }
    if (!b.shops && punched) {
      // posters between the ground floor's windows, a few pasted over each other
      const gap = (1 - (win[2] - win[0])) * cw;
      for (let i = 1; i < n; i++) if (R() < .35 * busy && gap > .55) {
        const k = 1 + (R() < .3 ? 1 : 0) + (R() < .1 ? 1 : 0);
        for (let j = 0; j < k; j++) { const w = Math.min(.8, gap - .15) * (.85 + R() * .15) / .72; put(i * cw + (R() - .5) * .1 * j, base + .9 + (R() - .5) * .1, w, w, R.pick(POSTER), grey(.82 + R() * .18)); }   // (the paper is .72 of its cell across)
      }
      // tags low on the wall, under the windows' sills
      const sill = base + win[1] * floor;
      const tags = Math.floor(R() * 2.4 * busy), used = new Set();   // (a few a wall, each a different hand)
      for (let j = 0; j < tags && used.size < TAG.length; j++) {
        let q = R.pick(TAG); while (used.has(q)) q = R.pick(TAG); used.add(q);
        const h = Math.min(sill - kerb - .08, .6 + R() * .35), w = h / .72; if (h > .35) put(w / 2 + R() * (L - w), kerb + .06 + R() * .06, w, h, q, paint(R));
      }
      // damp under some sills of the floors above, and a rust run here and there
      for (let f = 1; f < Math.min(5, b.floors || 1); f++) for (let i = 0; i < n; i++) if (R() < .1) {
        const w = (win[2] - win[0]) * cw * (.6 + R() * .4), h = 1 + R() * 1.6; put((i + .5) * cw, base + f * floor + win[1] * floor - h, w, h, STREAK[R() < .2 ? 1 : 0], grey(.8 + R() * .3), R() < .5);
      }
    } else if (b.shops) {   // above the shops: damp under the first floor's sills
      for (let i = 0; i < n; i++) if (R() < .12) { const w = (win[2] - win[0]) * cw * .8, h = .8 + R() * 1.2; put((i + .5) * cw, base + win[1] * floor - h, w, h, STREAK[0], grey(.85), R() < .5); }
    }
    if (F.kind === 'shed' && R() < .7 * busy + .2) {   // the harbour's sheds: a big painted piece across the blank wall
      const h = Math.min(win[1] * floor - .5, 2.4), w = Math.min(L - 1, h * 2 / .92);
      if (h > 1 && w > 2) put(L / 2 + (R() - .5) * (L - w) * .8, kerb + .3, w, h, PIECE[0], paint(R));
    }
  });
  return out;
}
const grey = v => [v, v, v];
const PAINTS = ['#e0402e', '#2f8fd8', '#f2c230', '#46b26a', '#e86ab8', '#f2f2f2', '#9a62e0', '#f08a2a'].map(h => new Color(h));
const paint = R => { const c = PAINTS[Math.floor(R() * PAINTS.length)]; return [c.r, c.g, c.b]; };

/** The marks as one geometry (positions, normals, picture and colour). */
export function wallGeometry(list) {
  const P = [], N = [], U = [], Cl = [], I = [];
  for (const m of list) {
    const rx = m.nz, rz = -m.nx, [u0, v0, u1, v1] = uvOf(m.q), a = m.flip ? u1 : u0, b = m.flip ? u0 : u1, hw = m.w / 2, i = P.length / 3;
    for (const [s, y, u, v] of [[-1, m.y0, a, v0], [1, m.y0, b, v0], [1, m.y0 + m.h, b, v1], [-1, m.y0 + m.h, a, v1]]) {
      P.push(m.x + rx * hw * s, y, m.z + rz * hw * s); N.push(m.nx, 0, m.nz); U.push(u, v); Cl.push(...m.col);
    }
    I.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(P, 3)); g.setAttribute('normal', new Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new Float32BufferAttribute(U, 2)); g.setAttribute('color', new Float32BufferAttribute(Cl, 3)); g.setIndex(I);
  return g;
}
