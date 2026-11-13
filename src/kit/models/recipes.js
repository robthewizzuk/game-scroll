// gs.models material recipes: each one says, at a point p of a tile P units across, what the surface
// is: col (colour, sRGB 0..1), rough, metal (0..1) and h (height, 0..1: raised parts high). They are
// written only with O (ops.js), so the same recipe paints the textures on the CPU and runs on the
// graphics chip. k holds the maker's options, colours already turned into O.rgb.
// Kit use only.

// defaults: P is the tile's size in noise units, look the colours a maker can change
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
    P: 4, look: { colour: '#b4b8bc' },
    f(O, p, k) {
      const streak = O.fbm(O.scale(p, 32, 1), 4, 3, 1), smudge = O.fbm(p, 4, 4, 2);
      return { col: O.mulc(k.colour, O.add(.88, O.mul(streak, .15))), rough: O.add(.25, O.add(O.mul(streak, .1), O.mul(smudge, .2))), metal: 1, h: O.mul(streak, .15) };
    },
  },
  rust: {
    P: 4, look: { colour: '#7a6a5a', rust: '#7b3418', deep: '#3d1a0c' },
    f(O, p, k) {
      const n = O.fbm(O.scale(p, 1.5), 6, 5, 1), fine = O.fbm(O.scale(p, 12), 48, 3, 2), r = O.smooth(.42, .62, O.add(n, O.mul(fine, .15)));
      const rustCol = O.mixc(k.deep, k.rust, fine);
      return { col: O.mixc(k.colour, rustCol, r), rough: O.mix(.45, .95, r), metal: O.mix(.9, .1, r), h: O.add(O.mul(r, O.mul(fine, .6)), .2) };
    },
  },
  paint: {
    P: 4, look: { colour: '#3b6ea5', under: '#8a8f94' },
    f(O, p, k) {
      const n = O.fbm(O.scale(p, 2), 8, 5, 3), chip = O.smooth(.6, .63, n), fine = O.fbm(O.scale(p, 16), 64, 2, 4);
      return { col: O.mixc(O.mulc(k.colour, O.add(.92, O.mul(fine, .12))), k.under, chip), rough: O.mix(.45, .4, chip), metal: O.mul(chip, .9), h: O.sub(.7, O.mul(chip, .4)) };
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
