// gs.models.prop's yard, dock and building-site things (props.js takes them in): a shipping container with its
// corrugated walls, corner castings and locking bars; a gantry crane; concrete and water-filled barriers; a
// chain-link fence; oil drums, stacked pallets, a cable reel and a loose cable; a mooring bollard and a skip. Each
// is built from bevelled parts in the material recipes, painted parts chipped down to what is under the paint, with
// hazard stripes and plates as parts of their own, and aged by wear() as every prop is.
// Kit use only: games reach these as gs.models.prop('container') and the rest.
import { DataTexture, RepeatWrapping, SRGBColorSpace, LinearMipmapLinearFilter, LinearFilter, DoubleSide } from 'three';
import { pbr } from '../hd3d.js';

// the colours shipping lines paint their boxes (made-up lines: faded, as they are at sea a few years)
const BOX_COLOURS = ['#8a3a2a', '#2f5d86', '#3f6b4a', '#b8612a', '#7d8489', '#b89a2a', '#5a3f6a', '#a8a49a', '#6a2a2a', '#2a4a5a'];
const DRUM_COLOURS = ['#2d5a8a', '#8a2a24', '#2f6a3a', '#c8a22a', '#3a3a3c', '#d8d4cc'];
const SKIP_COLOURS = ['#c8a22a', '#2f6a3a', '#2f5d86', '#b8612a', '#8a2a24'];
const BARRIER_COLOURS = ['#c4302a', '#e8e4dc', '#d8661e'];

// chain-link: a woven diamond mesh of galvanised wire, as a picture with holes (alpha hashed, so far off it dithers into a
// veil and never shimmers), laid on by the box projection in metres: one picture a metre, 20 diamonds of 5 cm across, the wire about as thin as it is
function chainlink() {
  const S = 512, D = S / 20, px = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const a = ((x + y) % D + D) % D, b = ((x - y) % D + D) % D, wa = Math.min(a, D - a), wb = Math.min(b, D - b), w = Math.min(wa, wb);
    const on = w < .8 ? 1 : w < 1.4 ? (1.4 - w) / .6 : 0, sh = .7 + .3 * Math.min(1, wa < wb ? wa / .8 : wb / .8), i = (y * S + x) * 4;
    px[i] = 170 * sh; px[i + 1] = 176 * sh; px[i + 2] = 178 * sh; px[i + 3] = on * 255;
  }
  const t = new DataTexture(px, S, S); t.colorSpace = SRGBColorSpace; t.wrapS = t.wrapT = RepeatWrapping; t.generateMipmaps = true; t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter; t.anisotropy = 4; t.needsUpdate = true;
  const m = pbr('#ffffff', { rough: .45, metal: .7, map: t, alphaHash: true, side: DoubleSide });
  m.name = 'models:chainlink'; m.userData.noSettle = true;
  return m;
}

export const YARD_PROPS = {
  // a shipping container (size: its length, 6.06 a twenty-foot box, 12.19 a forty), doors at +z: corrugated walls and roof,
  // its frame and corner castings, four locking bars on the doors with their handles and hinges, a plate with its number
  container: { slots: { walls: ['paint', { colour: '#8a3a2a', under: 'shade', wear: .3 }], frame: ['paint', { colour: '#3e3632', under: 'shade' }], castings: ['rust', { colour: '#3a3532' }], bars: ['metal', { colour: '#8a8e90' }], plate: ['paint', { colour: '#d8d4c8', under: 'shade' }] },
    colour: r => BOX_COLOURS[Math.floor(r() * BOX_COLOURS.length)],
    make(b, r, k) {
      const L = k.size ?? 6.06, W = 2.44, H = 2.59, c = .16, hz = L / 2;
      // the frame: corner posts, rails top and bottom along both sides, headers and sills at the ends
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box('frame', c, H - .3, c, [x * (W / 2 - c / 2), H / 2, z * (hz - c / 2)], 0, .012);
      for (const x of [-1, 1]) { b.box('frame', .12, .16, L - .2, [x * (W / 2 - .06), H - .08, 0], 0, .01); b.box('frame', .14, .16, L - .2, [x * (W / 2 - .07), .08, 0], 0, .01); }
      for (const z of [-1, 1]) { b.box('frame', W - .2, .2, .12, [0, H - .1, z * (hz - .06)], 0, .01); b.box('frame', W - .2, .18, .14, [0, .09, z * (hz - .07)], 0, .01); }
      // the corner castings, with their holes as darker recesses
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (const y of [.09, H - .09]) b.box('castings', .18, .14, .18, [x * (W / 2 - .09), y, z * (hz - .09)], 0, .008);
      // the side walls: a sheet and its trapezoid ribs; the far end the same; the roof's shallow ribs across
      const ribs = Math.round((L - .4) / .28);
      for (const x of [-1, 1]) {
        b.box('walls', .02, H - .32, L - .3, [x * (W / 2 - .045), H / 2, 0]);
        for (let i = 0; i < ribs; i++) b.box('walls', .045, H - .34, .13, [x * (W / 2 - .03), H / 2, -hz + .2 + (i + .5) * (L - .4) / ribs], 0, .006);
      }
      for (let i = 0; i < 8; i++) b.box('walls', (W - .4) / 8 * .5, H - .34, .045, [-W / 2 + .2 + (i + .5) * (W - .4) / 8, H / 2, -hz + .03], 0, .006);
      b.box('walls', W - .3, .02, .02, [0, H / 2, -hz + .045]).box('walls', W - .3, H - .32, .02, [0, H / 2, -hz + .05]);
      b.box('walls', W - .26, .03, L - .26, [0, H - .03, 0]);
      for (let i = 0; i < Math.round(L / .5); i++) b.box('walls', W - .3, .025, .2, [0, H - .01, -hz + .25 + i * .5 + (r() - .5) * .02], [0, 0, (r() - .5) * .01], .005);
      // the doors: two leaves, each with two locking bars, their cams, handles and hinges
      for (const s of [-1, 1]) {
        b.box('walls', W / 2 - .14, H - .34, .04, [s * (W / 4 - .02), H / 2, hz - .05], 0, .006);
        for (const y of [.55, 1.3, 2.05]) b.box('walls', W / 2 - .2, .1, .03, [s * (W / 4 - .02), y, hz - .02], 0, .006);   // (its pressed ribs)
        for (const bx of [.18, .9]) {
          const x = s * (W / 2 - .12 - bx * (W / 2 - .3));
          b.cyl('bars', .022, .022, H - .2, [x, H / 2, hz + .02], 0, 8);
          for (const y of [.22, H - .22]) b.box('bars', .07, .1, .05, [x, y, hz + .02], 0, .008);   // the cams
          b.box('bars', .03, .32, .03, [x + s * .06, 1.12, hz + .05], 0, .006).box('bars', .09, .05, .05, [x, 1.25, hz + .04], 0, .006);   // the handle and its keeper
        }
        for (const y of [.35, .95, 1.6, 2.25]) b.cyl('bars', .03, .03, .1, [s * (W / 2 - .03), y, hz - .01], 0, 8);   // hinges
      }
      b.box('plate', .42, .16, .01, [W / 4, 2.2, hz - .02], 0, .004).box('plate', .3, .12, .01, [-W / 4 - .1, 2.22, hz - .02], 0, .004);
    } },
  // a rubber-tyred gantry crane over a stack of containers (size: its height, 18): four legs on their wheels, two girders across with a
  // trolley, its cab and the ropes down to the spreader; hazard stripes round the legs' feet
  crane: { slots: { frame: ['paint', { colour: '#d8a21e', under: 'shade' }], cab: ['paint', { colour: '#e2ddd2', under: 'shade' }], stripes: ['paint', { colour: '#1c1c1c', under: 'shade' }], steel: ['metal', { colour: '#5a5e62' }], tyres: ['rubber'], glass: ['metal', { colour: '#2a343a' }] },
    make(b, r, k) {
      const H = k.size ?? 18, span = H * 1.15, depth = H * .38, leg = H * .05;
      for (const x of [-1, 1]) {
        for (const z of [-1, 1]) {
          b.box('frame', leg, H - 1.2, leg * 1.2, [x * span / 2, (H - 1.2) / 2 + 1.1, z * depth / 2], [0, 0, x * .03], .04);
          b.stripes('frame', 'stripes', leg * 1.25, 1.6, leg * 1.25 + .02, .35, [x * span / 2, 1.9, z * depth / 2], [0, 0, 0]);
          b.box('frame', leg * 1.4, .7, leg * 2.6, [x * span / 2, .9, z * depth / 2], 0, .04);   // the bogie
          for (const dz of [-.45, .45]) b.cyl('tyres', .55, .55, .42, [x * span / 2, .55, z * depth / 2 + dz * leg * 2], [0, 0, Math.PI / 2], 18);
        }
        b.box('frame', leg * .9, leg * .9, depth, [x * span / 2, H * .45, 0], 0, .03);   // the ties between each side's legs
        b.box('frame', leg * 1.2, leg * 2.2, depth + leg * 1.2, [x * span / 2, H - .3, 0], 0, .04);   // the sill beam on top
      }
      for (const z of [-1, 1]) b.box('frame', span + leg * 1.6, leg * 2.4, leg * 1.1, [0, H - .6, z * depth * .32], 0, .04);   // the two girders across
      const tx = (r() - .5) * span * .5;   // the trolley, somewhere along the girders
      b.box('frame', leg * 3.2, leg * 1.6, depth * .8, [tx, H + .4, 0], 0, .04);
      b.box('cab', 2.1, 2.2, 2, [tx + leg * 2.4, H - 2.3, depth * .3], 0, .08).box('glass', 1.95, 1.1, 2.04, [tx + leg * 2.4, H - 2.1, depth * .3], 0, .04);
      for (const [dx, dz] of [[-.4, -.5], [.4, -.5], [-.4, .5], [.4, .5]]) b.cyl('steel', .025, .025, H * .5, [tx + dx, H - H * .25, dz], 0, 6);   // the ropes
      b.box('frame', 2.4, .3, 6.1, [tx, H * .5 - .2, 0], 0, .03);   // the spreader
    } },
  // a concrete safety barrier (size: its length, 2): the stepped profile, its lifting slots, wear at its feet
  barrier: { slots: { concrete: ['concrete', { colour: '#b1aea5' }], slots: ['concrete', { colour: '#4a4842' }] },
    make(b, r, k) {
      const L = k.size ?? 2;
      b.extrude('concrete', [[-.3, 0], [.3, 0], [.3, .08], [.13, .33], [.1, .81], [-.1, .81], [-.13, .33], [-.3, .08]], L, [0, 0, 0], [0, 0, 0], .015);
      for (const z of [-1, 1]) b.box('slots', .62, .09, .22, [0, .045, z * L * .28]);   // (the slots a forklift lifts it by)
    } },
  // a water-filled plastic barrier (size: its length, 1.5), red or white by its seed: the moulded shape, its filler cap, the lugs that join them
  waterbarrier: { slots: { shell: ['plastic', { colour: '#c4302a' }], cap: ['plastic', { colour: '#e8e4dc' }] },
    colour: r => BARRIER_COLOURS[Math.floor(r() * BARRIER_COLOURS.length)],
    colour: r => (r() < .5 ? '#c4302a' : '#e4e0d8'),
    make(b, r, k) {
      const L = k.size ?? 1.5;
      b.extrude('shell', [[-.24, 0], [.24, 0], [.24, .12], [.12, .3], [.11, .78], [-.11, .78], [-.12, .3], [-.24, .12]], L - .1, [0, 0, 0], [0, 0, 0], .05);
      b.cyl('cap', .06, .06, .04, [0, .79, -L * .25], 0, 12);
      for (const z of [-1, 1]) for (const y of [.15, .6]) b.box('shell', .1, .1, .12, [0, y, z * (L / 2 - .02)], 0, .03);
    } },
  // a chain-link fence panel (size: its length, 2.5): galvanised posts, a top rail, the woven mesh, three strands of barbed wire on arms (barbed: false: none)
  mesh: { slots: { posts: ['galvanised'], wire: chainlink },
    make(b, r, k) {
      const L = k.size ?? 2.5, H = 2;
      for (const x of [-1, 1]) { b.cyl('posts', .03, .03, H + .1, [x * L / 2, (H + .1) / 2, 0], 0, 10); b.cyl('posts', .033, .033, .04, [x * L / 2, H + .12, 0], 0, 10); }
      b.cyl('posts', .02, .02, L, [0, H - .05, 0], [0, 0, Math.PI / 2], 8);
      b.box('wire', L - .06, H - .12, .004, [0, (H - .12) / 2 + .04, 0]);
      if (k.barbed !== false) {
        for (const x of [-1, 1]) b.cyl('posts', .012, .012, .45, [x * L / 2, H + .2, .15], [Math.PI / 4.5, 0, 0], 6);
        for (let i = 0; i < 3; i++) b.cyl('posts', .003, .003, L, [0, H + .06 + i * .12, .05 + i * .1], [0, 0, Math.PI / 2], 4);
      }
    } },
  // a steel oil drum (size: its height, .88): chimes at both ends, two rolling hoops, the lid's two bungs, a little dented by its seed
  oildrum: { slots: { body: ['paint', { colour: '#2d5a8a', under: 'shade' }], bungs: ['metal', { colour: '#7a7e80' }] },
    colour: r => DRUM_COLOURS[Math.floor(r() * DRUM_COLOURS.length)],
    colour: r => ['#2d5a8a', '#8a2a24', '#3f6a3a', '#c8a22a', '#3a3a3a', '#a8a8a0'][Math.floor(r() * 6)],
    make(b, r, k) {
      const h = k.size ?? .88, R = h * .325, lean = (r() - .5) * .02;
      b.cyl('body', R, R, h - .02, [0, h / 2, 0], [lean, 0, lean], 28);
      for (const y of [.012, h - .012]) b.ring('body', R, .012, [0, y, 0]);   // the chimes
      for (const t of [.34, .66]) b.ring('body', R + .006, .01, [0, t * h, 0]);   // the rolling hoops
      b.cyl('body', R - .015, R - .015, .01, [0, h - .02, 0], 0, 28);   // the lid, a little sunk
      b.cyl('bungs', .03, .03, .015, [R * .55, h - .01, 0], 0, 10).cyl('bungs', .018, .018, .015, [-R * .55, h - .01, 0], 0, 10);
    } },
  // pallets stacked (size: how many, 4), each a little off the one under it
  pallets: { slots: { wood: ['wood', { colour: '#b08858' }] },
    make(b, r, k) {
      const n = Math.max(1, Math.round(k.size ?? 4));
      for (let p = 0; p < n; p++) {
        const y = p * .144, ox = (r() - .5) * .06, oz = (r() - .5) * .06, a = (r() - .5) * .05, at = (x, yy, z) => [x * Math.cos(a) + z * Math.sin(a) + ox, y + yy, -x * Math.sin(a) + z * Math.cos(a) + oz];
        for (let i = 0; i < 7; i++) b.box('wood', .14, .02, 1.2, at(-.48 + i * .16, .134, 0), [0, a + (r() - .5) * .02, 0], .004);
        for (const x of [-.48, 0, .48]) for (const z of [-.5, 0, .5]) b.box('wood', .12, .088, .14, at(x, .066, z), [0, a, 0], .006);
        for (const z of [-.5, 0, .5]) b.box('wood', 1.1, .022, .14, at(0, .011, z), [0, a, 0], .004);
      }
    } },
  // a cable reel standing on its flanges (size: across, 1.2): two plank flanges, the cable wound on it, its end trailing
  reel: { slots: { wood: ['planks', { colour: '#9a7a50' }], cable: ['rubber'], bolts: ['metal', { colour: '#6a6e70' }] },
    make(b, r, k) {
      const D = k.size ?? 1.2, R = D / 2, w = D * .62;
      for (const s of [-1, 1]) b.cyl('wood', R, R, .05, [s * (w / 2 + .025), R, 0], [0, 0, Math.PI / 2], 24);
      b.cyl('cable', R * .78, R * .78, w, [0, R, 0], [0, 0, Math.PI / 2], 24);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; for (const s of [-1, 1]) b.cyl('bolts', .02, .02, .02, [s * (w / 2 + .055), R + Math.cos(a) * R * .4, Math.sin(a) * R * .4], [0, 0, Math.PI / 2], 6); }
      const a0 = -.3 - r() * .4, pts = [[w * .3, R + Math.sin(a0) * R * .78, Math.cos(a0) * R * .78]];
      for (let i = 1; i < 6; i++) pts.push([w * .3 + (r() - .5) * .4, Math.max(.03, R * .6 - i * R * .3), R * .8 + i * .35 + (r() - .5) * .1]);
      b.tube('cable', pts, .025);
    } },
  // a heavy cable lying loose on the ground (size: its length, 6), wandering this way and that
  cable: { slots: { cable: ['rubber'] },
    make(b, r, k) {
      const L = k.size ?? 6, n = Math.max(4, Math.round(L / .6)), pts = []; let x = -L / 2, z = 0, a = (r() - .5) * .6;
      for (let i = 0; i <= n; i++) { pts.push([x, .03, z]); a += (r() - .5) * .9; a = Math.max(-1.2, Math.min(1.2, a)); x += Math.cos(a) * L / n; z += Math.sin(a) * L / n; }
      b.tube('cable', pts, .028, [0, 0, 0], 8);
    } },
  // a cast iron mooring bollard (size: its height, .7): the mushroom head, a lip, its bolts
  bollard: { slots: { iron: ['paint', { colour: '#2a2a2a', under: '#5a3e30' }] },
    make(b, r, k) {
      const h = k.size ?? .7, s = h / .7;
      b.lathe('iron', [[0, 0], [.32 * s, 0], [.32 * s, .05 * s], [.18 * s, .08 * s], [.15 * s, .45 * s], [.19 * s, .55 * s], [.3 * s, .6 * s], [.3 * s, .66 * s], [.2 * s, .7 * s], [0, .7 * s]], [0, 0, 0], 24);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.cyl('iron', .025 * s, .025 * s, .03 * s, [Math.cos(a) * .26 * s, .065 * s, Math.sin(a) * .26 * s], 0, 6); }
    } },
  // a builder's skip (size: its length, 3.6): the sloped steel box, its rims and the lugs the lorry lifts it by, its stripes
  skip: { slots: { steel: ['paint', { colour: '#c8a22a', under: 'shade' }], stripes: ['paint', { colour: '#1e1e1e', under: 'shade' }], inside: ['rust', { colour: '#4a3e34' }] },
    colour: r => SKIP_COLOURS[Math.floor(r() * SKIP_COLOURS.length)],
    colour: r => ['#c8a22a', '#2f5d86', '#3f6b4a', '#b8612a'][Math.floor(r() * 4)],
    make(b, r, k) {
      const L = k.size ?? 3.6, W = 1.75, H = 1.2, top = L, base = L * .62;
      const side = [[-base / 2, 0], [base / 2, 0], [top / 2, H], [-top / 2, H]];
      for (const z of [-1, 1]) b.extrude('steel', side, .05, [0, 0, z * (W / 2 - .025)], [0, 0, 0], .01);
      const tilt = Math.atan2((top - base) / 2, H), hs = H / Math.cos(tilt);
      for (const x of [-1, 1]) b.box('steel', .05, hs, W - .06, [x * (base + top) / 4, H / 2, 0], [0, 0, -x * tilt], .01);   // the ends, leaning out
      b.box('inside', base - .1, .05, W - .1, [0, .03, 0]);
      for (const z of [-1, 1]) b.box('steel', top + .05, .08, .1, [0, H - .04, z * W / 2], 0, .02);   // the rims
      for (const z of [-1, 1]) for (const x of [-1, 1]) b.cyl('steel', .06, .06, .12, [x * top * .35, H * .62, z * (W / 2 + .06)], [Math.PI / 2, 0, 0], 10);   // lifting lugs
      for (const z of [-1, 1]) for (const x of [-1, 1]) b.stripes('steel', 'stripes', .7, .24, .06, .12, [x * (top / 2 - .5), H - .26, z * (W / 2 - .005)], [0, 0, 0]);   // stripes at the ends of the sides
    } },
};
