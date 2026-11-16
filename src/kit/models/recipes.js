// gs.models material recipes: each one says, at a point p of a tile P units across, what the surface
// is: col (colour, sRGB 0..1), rough, metal (0..1) and h (height, 0..1: raised parts high). They are
// written only with O (ops.js), so the same recipe paints the textures on the CPU and runs on the
// graphics chip. k holds the maker's options, colours already turned into O.rgb.
// Kit use only.

// defaults: P is the tile's size in noise units, look the colours a maker can change
// (metal: true on the recipes with any metal in them: the others get no metal picture, materials.js)
// The look's colours as the recipe reads them (O.rgb of each), and its plain numbers (a recipe's `nums`: wear...) as they are.
export function lookK(R, look, O) {
  const K = {}; for (const k in look) K[k] = R.nums && k in R.nums ? +look[k] : O.rgb(look[k]);
  return K;
}
// a whole-number period's min of four (seams and edges)
const min4 = (O, a, b, c, d) => O.min(O.min(a, b), O.min(c, d));

// Paint worn by use and weather, shared by the painted recipes (as a big game's painted metal is): flakes knocked off to what
// is under the paint (chip, 0 paint .. 1 bare), small and large, ragged at their edges and gathered in patches so most of a panel
// is clean; long scrapes; a thin brown halo round old damage (stain); and rust that has run down the surface below the damage
// (run: the recipe's y grows downwards). amt 0..1 is a plain number (how worn). p: a point of a tile 4 across.
function paintDmg(O, p, amt, s = 40) {
  const zone = O.smooth(.5, .8, O.fbm(p, 4, 3, s));
  const dn = O.mul(O.add(.03, O.mul(zone, .32)), .35 + amt);
  const edge = O.sub(O.fbm(O.scale(p, 16), 64, 2, s + 1), .5);
  const c1 = O.cells(O.scale(p, 3), 12, s + 2, .9), c2 = O.cells(O.scale(p, 9), 36, s + 3, .9);
  const f1 = O.mul(O.step(c1.id, dn), O.sub(1, O.smooth(.14, .32, O.add(c1.d, O.mul(edge, .35)))));
  const f2 = O.mul(O.step(c2.id, O.mul(dn, 1.4)), O.sub(1, O.smooth(.1, .26, O.add(c2.d, O.mul(edge, .3)))));
  const th = .86 - .1 * amt, worn = O.add(O.fbm(O.scale(p, 2), 8, 4, s + 4), O.mul(edge, .12)), patch = O.smooth(th, th + .03, worn);
  const scr = O.mul(O.sub(1, O.smooth(.004, .02, O.abs(O.sub(O.noise(O.scale(p, 1, 6), 4, s + 5), .5)))), O.smooth(.6, .7, O.fbm(O.scale(p, 2), 8, 2, s + 6)));
  const chip = O.clamp(O.max(O.max(f1, f2), O.max(patch, O.mul(scr, .35 + .5 * amt))));
  const halo = O.mul(O.step(c1.id, dn), O.sub(1, O.smooth(.3, .52, O.add(c1.d, O.mul(edge, .3)))));
  const stain = O.clamp(O.sub(O.max(halo, O.smooth(th - .05, th, worn)), chip));
  // the run: damage above this point (a few steps up, fainter the further), along streaks
  let run = O.num(0);
  for (let i = 1; i <= 4; i++) {
    const q = O.shift(p, 0, -.09 * i), up = O.smooth(th - .03, th + .02, O.fbm(O.scale(q, 2), 8, 4, s + 4));
    run = O.max(run, O.mul(up, 1 - i / 5.5));
  }
  run = O.mul(O.mul(run, O.smooth(.42, .68, O.fbm(O.scale(p, 16, 1), 4, 3, s + 7))), O.sub(1, chip));
  return { chip, stain, run: O.mul(run, .4 + .6 * amt) };
}

export const RECIPES = {
  wood: {
    P: 4, look: { colour: '#9a6b3f', dark: '#5e3b1e' },
    f(O, p, k) {
      // (every scaled noise keeps a period that divides the tile on both axes, so it still tiles)
      const warp = O.fbm(p, 4, 3, 1), rings = O.fract(O.add(O.mul(O.x(p), 2), O.mul(warp, 1.6)));
      const grain = O.smooth(.0, .5, O.abs(O.sub(rings, .5))), streak = O.fbm(O.scale(p, 8, 1), 4, 3, 2);
      const t = O.clamp(O.add(O.mul(grain, .65), O.mul(streak, .45)));
      return { col: O.mixc(k.dark, k.colour, t), rough: O.mix(.75, .55, t), metal: 0, h: O.mul(t, .4) };
    },
  },
  planks: {
    P: 4, look: { colour: '#a87a4c', dark: '#5a3a1f', gap: '#2a1a0e' },
    f(O, p, k) {
      const row = O.mod(O.floor(O.y(p)), 4), off = O.rand(row, 0, 3), u = O.add(O.x(p), O.mul(off, 4)), plank = O.mod(O.floor(O.div(u, 2)), 2);
      const tone = O.rand(plank, row, 5), w = O.fbm(O.scale(O.xy(u, O.y(p)), 2, 8), 8, 3, 1);
      const gy = O.fract(O.y(p)), gx = O.fract(O.div(u, 2)), edge = O.min(O.smooth(0, .05, gy), O.min(O.smooth(1, .95, gy), O.min(O.smooth(0, .02, gx), O.smooth(1, .98, gx))));
      const wood = O.mixc(k.dark, k.colour, O.clamp(O.add(O.mul(w, .8), O.mul(tone, .5))));
      return { col: O.mixc(k.gap, wood, edge), rough: O.mix(.9, O.mix(.7, .5, tone), edge), metal: 0, h: O.mul(edge, O.add(.7, O.mul(w, .3))) };
    },
  },
  bark: {
    P: 4, look: { colour: '#5b4630', dark: '#2b2016' },
    f(O, p, k) {
      const c = O.cells(O.scale(p, 2, 1), 4, 4, .8), n = O.fbm(O.scale(p, 4, 1), 4, 4, 2);
      const ridge = O.smooth(0, .25, c.e), t = O.clamp(O.add(O.mul(ridge, .7), O.mul(n, .5)));
      return { col: O.mixc(k.dark, k.colour, t), rough: .9, metal: 0, h: t };
    },
  },
  // a palm's trunk: rings where old leaves fell, a little wavy, fibres running up between them
  palm: {
    P: 4, look: { colour: '#8c7c64', dark: '#4e4234', scar: '#362c22' },
    f(O, p, k) {
      const w = O.fbm(O.scale(p, 2), 8, 3, 3), y = O.add(O.y(p), O.mul(O.sub(w, .5), .16)), g = O.fract(O.mul(y, 2));
      const ring = O.mul(O.smooth(0, .07, g), O.sub(1, O.smooth(.12, .32, g))), scar = O.sub(1, O.smooth(.01, .05, O.abs(O.sub(g, .04))));
      const fib = O.fbm(O.scale(p, 4, 1), 4, 3, 5), t = O.clamp(O.add(O.mul(fib, .65), O.mul(ring, .45)));
      return { col: O.mixc(O.mixc(k.dark, k.colour, t), k.scar, O.mul(scar, .65)), rough: .88, metal: 0, h: O.clamp(O.add(O.mul(ring, .6), O.mul(fib, .4))) };
    },
  },
  brick: {
    P: 4, look: { colour: '#9c4a32', dark: '#6e2e1e', mortar: '#b8b0a2' },
    f(O, p, k) {
      const row = O.mod(O.floor(O.mul(O.y(p), 2)), 8), u = O.add(O.x(p), O.mul(O.fract(O.mul(row, .5)), 1)), b = O.mod(O.floor(u), 4);
      const gx = O.fract(u), gy = O.fract(O.mul(O.y(p), 2)), m = O.min(O.min(O.smooth(0, .06, gx), O.smooth(1, .94, gx)), O.min(O.smooth(0, .1, gy), O.smooth(1, .9, gy)));
      const tone = O.rand(b, row, 9), n = O.fbm(O.scale(p, 8), 32, 3, 3);
      const brick = O.mixc(k.dark, k.colour, O.clamp(O.add(O.mul(tone, .6), O.mul(n, .6))));
      const mortar = O.mulc(k.mortar, O.add(.8, O.mul(n, .3)));
      return { col: O.mixc(mortar, brick, m), rough: O.mix(.95, .8, m), metal: 0, h: O.mul(m, O.add(.75, O.mul(n, .25))) };
    },
  },
  stone: {
    P: 4, look: { colour: '#8d8a82', dark: '#5d5a54' },
    f(O, p, k) {
      const n = O.fbm(p, 4, 5, 1), c = O.cells(O.scale(p, 1.5), 6, 2), crack = O.smooth(.0, .06, c.e);
      const t = O.clamp(O.add(O.mul(n, 1.1), O.mul(c.id, .2)));
      return { col: O.mulc(O.mixc(k.dark, k.colour, t), O.mix(.6, 1, crack)), rough: O.mix(.95, .8, n), metal: 0, h: O.mul(crack, O.add(.5, O.mul(n, .5))) };
    },
  },
  cobbles: {
    P: 4, look: { colour: '#8a8378', dark: '#4e4a44', gap: '#3a352e' },
    f(O, p, k) {
      const c = O.cells(O.scale(p, 1.5), 6, 6, .7), dome = O.smooth(.0, .22, c.e), n = O.fbm(O.scale(p, 6), 24, 3, 2);
      const stone = O.mixc(k.dark, k.colour, O.clamp(O.add(O.mul(c.id, .6), O.mul(n, .5))));
      return { col: O.mixc(k.gap, stone, dome), rough: O.mix(.95, .75, dome), metal: 0, h: O.mul(dome, O.sub(1, O.mul(c.d, .4))) };
    },
  },
  tiles: {
    P: 4, look: { colour: '#e8e2d6', grout: '#9a948a' },
    f(O, p, k) {
      const gx = O.fract(O.x(p)), gy = O.fract(O.y(p)), m = O.min(O.min(O.smooth(0, .04, gx), O.smooth(1, .96, gx)), O.min(O.smooth(0, .04, gy), O.smooth(1, .96, gy)));
      const tone = O.rand(O.mod(O.x(p), 4), O.mod(O.y(p), 4), 2), n = O.fbm(O.scale(p, 6), 24, 2, 1);
      return { col: O.mixc(k.grout, O.mulc(k.colour, O.add(.92, O.mul(tone, .08))), m), rough: O.mix(.9, O.add(.15, O.mul(n, .1)), m), metal: 0, h: O.mul(m, .8) };
    },
  },
  concrete: {
    P: 4, look: { colour: '#a3a19b' },
    f(O, p, k) {
      const n = O.fbm(O.scale(p, 2), 8, 5, 1), pits = O.smooth(.72, .8, O.noise(O.scale(p, 24), 96, 4));
      return { col: O.mulc(k.colour, O.sub(O.add(.82, O.mul(n, .3)), O.mul(pits, .25))), rough: O.add(.8, O.mul(n, .15)), metal: 0, h: O.sub(O.add(.5, O.mul(n, .2)), O.mul(pits, .4)) };
    },
  },
  metal: {
    metal: true, P: 4, look: { colour: '#b4b8bc' },
    f(O, p, k) {
      const streak = O.fbm(O.scale(p, 32, 1), 4, 3, 1), smudge = O.fbm(p, 4, 4, 2);
      return { col: O.mulc(k.colour, O.add(.88, O.mul(streak, .15))), rough: O.add(.25, O.add(O.mul(streak, .1), O.mul(smudge, .2))), metal: 1, h: O.mul(streak, .15) };
    },
  },
  rust: {
    metal: true, P: 4, look: { colour: '#7a6a5a', rust: '#7b3418', deep: '#3d1a0c' },
    f(O, p, k) {
      const n = O.fbm(O.scale(p, 1.5), 6, 5, 1), fine = O.fbm(O.scale(p, 12), 48, 3, 2), r = O.smooth(.42, .62, O.add(n, O.mul(fine, .15)));
      const rustCol = O.mixc(k.deep, k.rust, fine);
      return { col: O.mixc(k.colour, rustCol, r), rough: O.mix(.45, .95, r), metal: O.mix(.9, .1, r), h: O.add(O.mul(r, O.mul(fine, .6)), .2) };
    },
  },
  // painted steel: worn by use (wear 0 fresh .. 1 old), chipped through to what is under it, rust running down below the damage
  paint: {
    metal: true, P: 4, look: { colour: '#3b6ea5', under: '#8a8f94', rust: '#6b3216', wear: .35 }, nums: { wear: 1 },
    f(O, p, k) {
      const d = paintDmg(O, p, k.wear), fine = O.fbm(O.scale(p, 16), 64, 2, 4), tone = O.fbm(O.scale(p, 2), 8, 3, 3);
      let col = O.mulc(k.colour, O.add(.88, O.add(O.mul(fine, .1), O.mul(tone, .1))));
      col = O.mixc(O.mixc(col, O.mulc(k.rust, .9), O.mul(d.stain, .35)), k.rust, O.mul(d.run, .6));
      return { col: O.mixc(col, k.under, d.chip), rough: O.add(O.mix(.42, .5, d.chip), O.mul(d.run, .3)), metal: O.mul(d.chip, .85), h: O.sub(.7, O.mul(d.chip, .35)) };
    },
  },
  // a ship's hull or a tank's side: painted steel plates welded together, hard used: paint lost to the primer and the steel,
  // and rust running down from the damage and the weld seams
  hull: {
    metal: true, P: 4, look: { colour: '#2c3b48', under: '#6a4232', rust: '#62290f', wear: .75 }, nums: { wear: 1 },
    f(O, p, k) {
      const seamAt = q => { const gx = O.fract(O.div(O.x(q), 2)), gy = O.fract(O.y(q)); return O.sub(1, min4(O, O.smooth(0, .012, gx), O.smooth(1, .988, gx), O.smooth(0, .024, gy), O.smooth(1, .976, gy))); };
      const seam = seamAt(p), bead = O.mul(seam, O.add(.6, O.mul(O.abs(O.sin(O.mul(O.add(O.x(p), O.y(p)), 60 * Math.PI))), .4)));
      const d = paintDmg(O, p, k.wear, 50), tone = O.fbm(O.scale(p, 2), 8, 4, 9), fine = O.fbm(O.scale(p, 16), 64, 2, 8);
      let srun = O.num(0);
      for (let i = 1; i <= 3; i++) srun = O.max(srun, O.mul(seamAt(O.shift(p, 0, -.07 * i)), 1 - i / 4));
      const run = O.clamp(O.add(d.run, O.mul(O.mul(srun, O.smooth(.5, .72, O.fbm(O.scale(p, 16, 1), 4, 3, 11))), .6 * k.wear)));
      let col = O.mulc(k.colour, O.add(.8, O.add(O.mul(tone, .25), O.mul(fine, .08))));
      col = O.mixc(O.mixc(col, k.rust, O.mul(d.stain, .4)), k.rust, O.mul(run, .7));
      col = O.mixc(col, O.mixc(k.under, O.mulc(k.rust, 1.1), O.smooth(.4, .7, fine)), d.chip);
      return { col, rough: O.add(O.mix(.55, .75, d.chip), O.mul(run, .2)), metal: O.mul(d.chip, .5), h: O.clamp(O.add(O.sub(.6, O.mul(d.chip, .25)), O.mul(bead, .35))) };
    },
  },
  // corrugated sheet (a shed's wall and roof, a container's side): ribs across x, painted and worn, rust down the valleys
  corrugated: {
    metal: true, P: 4, look: { colour: '#7d8b8f', under: '#a2a7aa', rust: '#6b3216', wear: .45 }, nums: { wear: 1 },
    f(O, p, k) {
      const w = O.fract(O.mul(O.x(p), 2)), rib = O.smooth(.08, .3, O.sub(.5, O.abs(O.sub(w, .5))));   // flat crowns, sloped sides
      const d = paintDmg(O, p, k.wear, 60), streak = O.fbm(O.scale(p, 16, 1), 4, 3, 12);
      const valley = O.mul(O.sub(1, rib), O.smooth(.45, .75, streak)), grime = O.mul(valley, .5 + .5 * k.wear);
      let col = O.mulc(k.colour, O.add(O.mix(.62, .86, rib), O.mul(O.fbm(O.scale(p, 2), 8, 3, 13), .2)));   // the valleys in their own shade
      col = O.mixc(O.mixc(col, k.rust, O.max(O.mul(d.run, .6), O.mul(grime, .35))), k.under, d.chip);
      return { col, rough: O.add(O.mix(.48, .38, d.chip), O.mul(grime, .2)), metal: O.mul(d.chip, .9), h: O.add(O.mul(rib, .8), .1) };
    },
  },
  // road asphalt: dark binder with stones pressed into it (a few pale ones), worn smooth where wheels go
  asphalt: {
    P: 4, look: { colour: '#303032', stone: '#7e796f' },
    f(O, p, k) {
      const a = O.cells(O.scale(p, 24), 96, 1, .9), st = O.sub(1, O.smooth(.2, .36, a.d)), pale = O.mul(O.step(.84, a.id), st);
      const tone = O.fbm(O.scale(p, 2), 8, 4, 2), fine = O.noise(O.scale(p, 64), 256, 3);
      const base = O.mulc(k.colour, O.add(.75, O.add(O.mul(tone, .35), O.mul(fine, .25))));
      return { col: O.mixc(O.mixc(base, O.mulc(k.colour, 1.35), O.mul(st, .3)), k.stone, O.mul(pale, .8)), rough: O.add(O.sub(.86, O.mul(st, .12)), O.mul(fine, .08)), metal: 0, h: O.add(.25, O.add(O.mul(st, O.add(.35, O.mul(a.id, .2))), O.mul(fine, .15))) };
    },
  },
  // a painted floor (workshop, hangar, car park deck): a smooth coat with a faint orange peel, scuffs and tyre marks, worn to the concrete in patches
  epoxy: {
    P: 4, look: { colour: '#5f6d61', under: '#9a978f', scuff: '#24252a' },
    f(O, p, k) {
      const peel = O.noise(O.scale(p, 32), 128, 1), sc = O.max(O.smooth(.6, .82, O.fbm(O.scale(p, 6), 24, 4, 2)), O.mul(O.sub(1, O.smooth(.01, .035, O.abs(O.sub(O.noise(O.scale(p, 2), 8, 7), .5)))), O.smooth(.45, .65, O.fbm(O.scale(p, 2), 8, 2, 8)))), worn = O.smooth(.74, .8, O.fbm(O.scale(p, 2), 8, 5, 3));
      const col = O.mixc(O.mixc(O.mulc(k.colour, O.add(.92, O.mul(peel, .08))), k.scuff, O.mul(sc, .3)), O.mulc(k.under, O.add(.85, O.mul(peel, .2))), worn);
      return { col, rough: O.add(O.mix(.22, .8, worn), O.mul(sc, .2)), metal: 0, h: O.add(O.sub(.6, O.mul(worn, .2)), O.mul(peel, .06)) };
    },
  },
  // hot-dip galvanised steel (rails, posts, ducts, walkways): zinc crystals in patches, dulled with age, white rust here and there
  galvanised: {
    metal: true, P: 4, look: { colour: '#a8adb1', white: '#c9c8c0' },
    f(O, p, k) {
      const c = O.cells(O.scale(p, 4), 16, 1, .95), dull = O.fbm(O.scale(p, 2), 8, 4, 2), wr = O.smooth(.7, .82, O.add(dull, O.mul(O.fbm(O.scale(p, 16), 64, 2, 3), .2)));
      const col = O.mixc(O.mulc(k.colour, O.add(.82, O.add(O.mul(c.id, .18), O.mul(dull, .1)))), k.white, O.mul(wr, .8));
      return { col, rough: O.add(O.add(.3, O.mul(c.id, .22)), O.mul(wr, .4)), metal: O.sub(1, O.mul(wr, .9)), h: O.add(.5, O.mul(O.smooth(0, .05, c.e), .1)) };
    },
  },
  // steel tread plate: raised lugs in two directions, polished on top by boots, grime between
  diamond: {
    metal: true, P: 4, look: { colour: '#9da1a5', grime: '#3a3732' },
    f(O, p, k) {
      const q = O.scale(p, 3), fx = O.sub(O.fract(O.x(q)), .5), fy = O.sub(O.fract(O.y(q)), .5), par = O.mod(O.add(O.floor(O.x(q)), O.floor(O.y(q))), 2);
      const u = O.mul(O.add(fx, fy), .7071), v = O.mul(O.sub(fx, fy), .7071);
      const a = O.mix(u, v, par), b = O.mix(v, u, par), lug = O.sub(1, O.smooth(.7, 1, O.add(O.mul(O.mul(a, a), 70), O.mul(O.mul(b, b), 9))));
      const dirt = O.mul(O.sub(1, lug), O.smooth(.4, .7, O.fbm(O.scale(p, 4), 16, 3, 5)));
      return { col: O.mixc(O.mulc(k.colour, O.add(.72, O.mul(lug, .4))), k.grime, O.mul(dirt, .45)), rough: O.add(O.mix(.5, .28, lug), O.mul(dirt, .35)), metal: O.sub(1, O.mul(dirt, .7)), h: O.add(.3, O.mul(lug, .6)) };
    },
  },
  // brushed steel or aluminium: fine straight lines along x, a soft sheen across them
  brushed: {
    metal: true, P: 4, look: { colour: '#c3c7cb' },
    f(O, p, k) {
      const l = O.noise(O.scale(p, 1, 128), 4, 1), l2 = O.noise(O.scale(p, 2, 64), 8, 2), sm = O.fbm(p, 4, 3, 3);
      return { col: O.mulc(k.colour, O.add(.86, O.add(O.mul(l, .1), O.mul(sm, .06)))), rough: O.add(.22, O.add(O.mul(l2, .12), O.mul(sm, .1))), metal: 1, h: O.add(.5, O.mul(l, .08)) };
    },
  },
  // a gun's or a tool's dark finish (parkerised, anodised): a fine matte stipple, satin where hands rub it
  gunmetal: {
    metal: true, P: 4, look: { colour: '#2b2e33' },
    f(O, p, k) {
      const st = O.noise(O.scale(p, 64), 256, 1), rub = O.smooth(.55, .8, O.fbm(O.scale(p, 2), 8, 4, 2));
      return { col: O.mulc(k.colour, O.add(.9, O.add(O.mul(st, .12), O.mul(rub, .25)))), rough: O.sub(O.add(.55, O.mul(st, .1)), O.mul(rub, .25)), metal: O.add(.7, O.mul(rub, .25)), h: O.add(.5, O.mul(st, .1)) };
    },
  },
  // moulded plastic with a grained (stippled) finish: grips, cases, dashboards
  polymer: {
    P: 4, look: { colour: '#26272b' },
    f(O, p, k) {
      const c = O.cells(O.scale(p, 32), 128, 1, .9), pit = O.smooth(0, .3, c.d), rub = O.smooth(.6, .85, O.fbm(O.scale(p, 2), 8, 3, 2));
      return { col: O.mulc(k.colour, O.add(.92, O.add(O.mul(c.id, .08), O.mul(rub, .12)))), rough: O.sub(O.add(.62, O.mul(pit, .12)), O.mul(rub, .25)), metal: 0, h: O.add(.4, O.mul(pit, .3)) };
    },
  },
  // smooth moulded plastic (crates, barriers, bins, toys): faint flow lines, scuffs
  plastic: {
    P: 4, look: { colour: '#2f5f9a', scuff: '#d8d8d4' },
    f(O, p, k) {
      const flow = O.fbm(O.scale(p, 2, 8), 8, 3, 1), sc = O.mul(O.sub(1, O.smooth(.004, .02, O.abs(O.sub(O.noise(O.scale(p, 3), 12, 2), .5)))), O.smooth(.6, .7, O.fbm(O.scale(p, 2), 8, 2, 3)));
      return { col: O.mixc(O.mulc(k.colour, O.add(.93, O.mul(flow, .1))), k.scuff, O.mul(sc, .35)), rough: O.add(O.add(.3, O.mul(flow, .08)), O.mul(sc, .3)), metal: 0, h: O.sub(.6, O.mul(sc, .15)) };
    },
  },
  // a plastic tarpaulin: coarse woven strands under a coat, creased where it has been folded
  tarp: {
    P: 8, look: { colour: '#3b4c5e' },
    f(O, p, k) {
      const a = O.abs(O.sin(O.mul(O.x(p), 16 * Math.PI))), b = O.abs(O.sin(O.mul(O.y(p), 16 * Math.PI))), weave = O.mul(O.add(a, b), .5);
      const c = O.cells(O.scale(p, .5), 4, 3, .9), crease = O.sub(1, O.smooth(0, .06, c.e)), tone = O.fbm(p, 8, 3, 4);
      return { col: O.mulc(k.colour, O.add(.8, O.add(O.mul(tone, .2), O.sub(O.mul(weave, .06), O.mul(crease, .15))))), rough: O.add(.62, O.mul(crease, .1)), metal: 0, h: O.add(O.mul(weave, .25), O.add(.4, O.mul(crease, .3))) };
    },
  },
  // cardboard: brown fibres, the flutes inside showing as faint lines, softened and stained in places
  cardboard: {
    P: 4, look: { colour: '#aa8258' },
    f(O, p, k) {
      const fib = O.fbm(O.scale(p, 16, 4), 16, 3, 1), flute = O.mul(O.add(O.sin(O.mul(O.y(p), 24 * Math.PI)), 1), .5), stain = O.smooth(.65, .8, O.fbm(p, 4, 4, 2));
      return { col: O.mulc(k.colour, O.sub(O.add(.86, O.add(O.mul(fib, .14), O.mul(flute, .03))), O.mul(stain, .2))), rough: .92, metal: 0, h: O.add(.45, O.add(O.mul(flute, .12), O.mul(fib, .1))) };
    },
  },
  // rubber (tyres, mats, seals, hoses): near black, finely pitted, a little dusty
  rubber: {
    P: 4, look: { colour: '#1c1c1e', dust: '#6b665c' },
    f(O, p, k) {
      const pits = O.smooth(.7, .8, O.noise(O.scale(p, 48), 192, 1)), dust = O.smooth(.6, .85, O.fbm(O.scale(p, 2), 8, 4, 2));
      return { col: O.mixc(O.mulc(k.colour, O.sub(1, O.mul(pits, .3))), k.dust, O.mul(dust, .3)), rough: O.add(.82, O.mul(dust, .12)), metal: 0, h: O.sub(.6, O.mul(pits, .3)) };
    },
  },
  // carbon fibre: a two-by-two twill weave under a glossy resin
  carbon: {
    P: 4, look: { colour: '#26292d' },
    f(O, p, k) {
      const q = O.scale(p, 8), dir = O.step(.5, O.fract(O.mul(O.add(O.floor(O.x(q)), O.floor(O.mul(O.y(q), .5))), .5)));
      const t = O.abs(O.sin(O.mul(O.mix(O.fract(O.x(q)), O.fract(O.y(q)), dir), Math.PI))), tow = O.mix(O.abs(O.sin(O.mul(O.y(q), 8 * Math.PI))), O.abs(O.sin(O.mul(O.x(q), 8 * Math.PI))), dir);
      return { col: O.mulc(k.colour, O.add(.7, O.add(O.mul(t, .35), O.mul(tow, .08)))), rough: O.add(.16, O.mul(tow, .06)), metal: 0, h: O.add(.4, O.mul(t, .3)) };
    },
  },
  fabric: {
    P: 8, look: { colour: '#4a5f8a' },
    f(O, p, k) {
      const a = O.abs(O.sin(O.mul(O.x(p), 8 * Math.PI))), b = O.abs(O.sin(O.mul(O.y(p), 8 * Math.PI))), over = O.step(.5, O.fract(O.mul(O.add(O.floor(O.mul(O.x(p), 4)), O.floor(O.mul(O.y(p), 4))), .5)));
      const weave = O.mix(a, b, over), fuzz = O.fbm(O.scale(p, 4), 32, 3, 1);
      return { col: O.mulc(k.colour, O.add(.75, O.add(O.mul(weave, .2), O.mul(fuzz, .15)))), rough: .95, metal: 0, h: O.mul(weave, .8) };
    },
  },
  leather: {
    P: 4, look: { colour: '#6b3e22' },
    f(O, p, k) {
      const c = O.cells(O.scale(p, 6), 24, 3, .9), crease = O.smooth(0, .12, c.e), n = O.fbm(p, 4, 4, 2);
      return { col: O.mulc(k.colour, O.add(.7, O.add(O.mul(crease, .2), O.mul(n, .25)))), rough: O.mix(.75, .5, crease), metal: 0, h: O.mul(crease, .7) };
    },
  },
  marble: {
    P: 4, look: { colour: '#ece8e2', vein: '#6d6a66' },
    f(O, p, k) {
      const w = O.fbm(O.scale(p, 1.5), 6, 5, 1), v = O.abs(O.sin(O.mul(O.add(O.add(O.x(p), O.y(p)), O.mul(w, 4)), Math.PI))), vein = O.pow(O.sub(1, v), 8);
      return { col: O.mixc(k.colour, k.vein, O.mul(vein, .8)), rough: O.add(.08, O.mul(vein, .1)), metal: 0, h: .5 };
    },
  },
  dirt: {
    P: 4, look: { colour: '#6b5236', dark: '#3e2e1e' },
    f(O, p, k) {
      const n = O.fbm(O.scale(p, 2), 8, 5, 1), peb = O.cells(O.scale(p, 6), 24, 5, .9), stones = O.smooth(.32, .2, peb.d);
      return { col: O.mixc(O.mixc(k.dark, k.colour, n), O.mulc(k.colour, 1.35), O.mul(stones, O.step(.6, peb.id))), rough: .95, metal: 0, h: O.add(O.mul(n, .5), O.mul(stones, O.mul(O.step(.6, peb.id), .5))) };
    },
  },
  sand: {
    P: 4, look: { colour: '#d8c08c' },
    f(O, p, k) {
      const dune = O.sin(O.add(O.mul(O.y(p), 2 * Math.PI), O.mul(O.fbm(p, 4, 3, 1), 4))), grain = O.noise(O.scale(p, 48), 192, 2);
      return { col: O.mulc(k.colour, O.add(.88, O.add(O.mul(dune, .04), O.mul(grain, .12)))), rough: .9, metal: 0, h: O.add(O.mul(dune, .25), O.add(.5, O.mul(grain, .1))) };
    },
  },
  snow: {
    P: 4, look: { colour: '#f2f5f8' },
    f(O, p, k) {
      const n = O.fbm(O.scale(p, 2), 8, 4, 1), sparkle = O.smooth(.92, .97, O.noise(O.scale(p, 64), 256, 3));
      return { col: O.mulc(k.colour, O.add(.92, O.mul(n, .08))), rough: O.sub(.6, O.mul(sparkle, .5)), metal: 0, h: O.add(.4, O.mul(n, .3)) };
    },
  },
  // straw thatch: courses of bundles laid in rows, each row's straw ends showing at its lower edge, the stalks
  // running down the slope (along y), darker in the hollow under the course above
  thatch: {
    P: 4, look: { colour: '#b89a5c', dark: '#5e4a2a', old: '#7a7458' },
    f(O, p, k) {
      const row = O.mod(O.floor(O.mul(O.y(p), 2)), 8), v = O.fract(O.mul(O.y(p), 2)), u = O.add(O.x(p), O.mul(O.rand(row, 0, 7), 4));
      const bundle = O.rand(O.mod(O.floor(O.mul(u, 2)), 8), row, 3), stalk = O.fbm(O.xy(O.mul(u, 16), O.mul(O.y(p), 1)), 4, 3, 4);
      const fine = O.fbm(O.xy(O.mul(u, 32), O.mul(O.y(p), 2)), 8, 2, 6), age = O.fbm(O.scale(p, 1), 4, 3, 8);
      const lip = O.smooth(.55, 1, v), hollow = O.sub(1, O.mul(O.smooth(.0, .25, v), O.sub(1, O.mul(lip, .6))));
      const t = O.clamp(O.add(O.add(O.mul(stalk, .55), O.mul(fine, .35)), O.sub(O.mul(bundle, .3), O.mul(hollow, .45))));
      const straw = O.mixc(k.dark, k.colour, t), col = O.mixc(straw, k.old, O.mul(O.smooth(.45, .75, age), .55));
      return { col, rough: .97, metal: 0, h: O.clamp(O.add(O.mul(O.sub(1, hollow), .6), O.mul(stalk, .4))) };
    },
  },
  // skin seen close (a tile is 16 mm on a person): the net of fine furrows that cuts it into little plots half a millimetre
  // across, a wider net over that, pores in some of the plots, and a slow unevenness under it all
  skin: {
    P: 4, look: { colour: '#d9ab86' },
    f(O, p, k) {
      const c = O.cells(O.scale(p, 7), 28, 3, .95), line = O.sub(1, O.smooth(0, .12, c.e)), big = O.cells(O.scale(p, 2.5), 10, 5, .9), fold = O.sub(1, O.smooth(0, .07, big.e));
      const pore = O.mul(O.smooth(.26, .1, c.d), O.step(.66, c.id)), n = O.fbm(O.scale(p, 1), 4, 3, 1), dip = O.clamp(O.add(O.add(O.mul(line, .45), O.mul(fold, .35)), O.mul(pore, .6)));
      return { col: O.mulc(k.colour, O.sub(O.add(.97, O.mul(n, .04)), O.mul(dip, .07))), rough: O.add(.48, O.add(O.mul(dip, .16), O.mul(n, .06))), metal: 0, h: O.clamp(O.sub(O.add(.7, O.mul(n, .1)), O.mul(dip, .55))) };
    },
  },
};
export const NAMES = Object.keys(RECIPES);
