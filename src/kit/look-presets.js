// v.look(name, o): a whole mood in one line (hd3d.js HDView.look). Each preset sets the view's sky colour, fill light,
// the sun's colour, strength and height, the air (haze, mist, clouds, how wet, the world's variation), the colour
// grade and a film look table, glare, sun shafts and light beams, bloom, exposure and the eye adapting, lens flare and
// dirt, and a film camera's finish; and a gs.sky.Weather already made for the view is set raining or dry to match.
// What makes a place look real is mostly this: one light, one mood, carried by everything at once.
// Kit use only: games call v.look().

const cl = x => Math.min(1, Math.max(0, x)), lum = (r, g, b) => .3 * r + .59 * g + .11 * b;
// a film look table from a few numbers: saturation, a tint into the shadows and one into the highlights, lifted blacks
const grade = (sat, sh, hi, lift = 0) => (r, g, b) => { const l = lum(r, g, b), w = cl((l - .4) * 2 + .5); return [r, g, b].map((x, i) => lift + (1 - lift) * cl(l + (x - l) * sat + sh[i] * (1 - w) + hi[i] * w * w)); };

export const LOOKS = {
  // a wet evening: low warm sun under a lid of cloud, cold blue shadows, everything soaked and shining
  'rainy dusk': {
    bg: '#3c4652', sky: '#64738a', ground: '#1e1d1c', amb: .55, sun: ['#ffae78', 1.4, [-.8, .17, .45]],
    air: { haze: .0032, colour: '#5a6470', sunColour: '#c98d68', mist: .004, mistFall: .14, patchy: .75, clouds: .8, cloudShade: .45, wet: .85, macro: .6 },
    grade: { saturation: .86, contrast: 1.16, shadows: '#c6d4f0', highlights: '#ffe2c6' }, glare: .5, shafts: .3, exposure: 1.06, bloom: .5, env: .75,
    lut: grade(.92, [-.02, -.004, .03], [.03, .01, -.02], .015), lutAmount: .65,
    flare: { strength: .35, threshold: .4, dirt: .5, tint: [1, .85, .7] }, film: { halation: .35, grain: 1.6, fringe: .02 },
    eye: { amount: .4, min: .8, max: 1.5, speed: .9 }, beams: { density: .03, strength: .7, glow: .6 },
    weather: { kind: 'rain', amount: .8, wet: 1, pools: .7 },
  },
  // the hour before sunset: long warm light, gold on everything that faces it, soft blue shade
  'golden hour': {
    bg: '#e3c39e', sky: '#9fb6d3', ground: '#4a3a2a', amb: .38, sun: ['#ffc48a', 3.2, [.72, .2, -.5]],
    air: { haze: .0012, colour: '#e2c4a2', sunColour: '#ffd09c', mist: .001, mistFall: .2, patchy: .6, clouds: .25, cloudShade: .3, wet: 0, macro: .5 },
    grade: { saturation: 1.14, contrast: 1.12, shadows: '#d4dcf4', highlights: '#fff0d2' }, glare: .7, shafts: .7, exposure: 1, bloom: .4, env: .6,
    lut: grade(1.06, [-.01, 0, .02], [.03, .012, -.025]), lutAmount: .6,
    flare: { strength: .5, threshold: .5, dirt: .3, tint: [1, .88, .7] }, film: { halation: .4, grain: 1.2, fringe: .015 },
    eye: { amount: .35, min: .8, max: 1.3, speed: .8 }, beams: { density: .02, strength: .8, glow: .65 },
    weather: { kind: 'rain', amount: 0, wet: 0, pools: 0 },
  },
  // a grey day: soft light from everywhere, no hard shadows, colours a little muted, damp
  overcast: {
    bg: '#9aa3ab', sky: '#c9d1d8', ground: '#3b3936', amb: .8, sun: ['#e6ebf0', .6, [-.2, 1, .3]],
    air: { haze: .002, colour: '#a2abb3', sunColour: '#c4cad0', mist: .002, mistFall: .12, patchy: .7, clouds: .95, cloudShade: .25, wet: .15, macro: .55 },
    grade: { saturation: .9, contrast: 1.06, shadows: '#dfe4ec', highlights: '#f6f4ee' }, glare: .1, shafts: 0, exposure: 1.05, bloom: .25, env: .7,
    lut: grade(.92, [0, .002, .01], [.01, .006, 0], .02), lutAmount: .45,
    flare: null, film: { halation: .15, grain: 1.2, fringe: .01 },
    eye: { amount: .3, min: .85, max: 1.3, speed: .8 }, beams: null,
    weather: { kind: 'rain', amount: 0, wet: .2, pools: 0 },
  },
  // rain at night: street light pools on black wet ground, a cold moon, haze glowing round the lamps
  'night rain': {
    bg: '#0b1018', sky: '#28344c', ground: '#0a0a0c', amb: .28, sun: ['#9db3d6', .35, [.3, .7, -.4]],
    air: { haze: .004, colour: '#1a2130', sunColour: '#33405a', mist: .006, mistFall: .12, patchy: .8, clouds: .6, cloudShade: .3, wet: 1, macro: .6 },
    grade: { saturation: .92, contrast: 1.2, shadows: '#bccfff', highlights: '#ffdcbc' }, glare: .6, shafts: 0, exposure: 1.15, bloom: .85, env: .8,
    lut: grade(.95, [-.03, -.005, .04], [.04, .015, -.02], .012), lutAmount: .6,
    flare: { strength: .55, threshold: .3, dirt: .6, tint: [1, .85, .7] }, film: { halation: .5, grain: 2, fringe: .025 },
    eye: { amount: .45, min: .9, max: 1.8, speed: .7 }, beams: null,
    weather: { kind: 'rain', amount: 1, wet: 1, pools: 1 },
  },
  // thick fog: the far world gone, the sun a pale disc, light beams through anything with gaps
  fog: {
    bg: '#b6bcc0', sky: '#cfd5d9', ground: '#55534f', amb: .65, sun: ['#f4eee2', .9, [-.3, .55, .4]],
    air: { haze: .012, colour: '#b6bcc0', sunColour: '#e6e1d6', mist: .02, mistFall: .1, patchy: .8, clouds: .6, cloudShade: .2, wet: .3, macro: .5 },
    grade: { saturation: .8, contrast: .96, shadows: '#e2e6ec', highlights: '#f8f4ec' }, glare: .3, shafts: .4, exposure: 1.02, bloom: .35, env: .6,
    lut: grade(.88, [0, .004, .012], [.012, .008, 0], .03), lutAmount: .45,
    flare: null, film: { halation: .2, grain: 1.2, fringe: .01 },
    eye: { amount: .3, min: .85, max: 1.25, speed: .8 }, beams: { density: .06, strength: .5, glow: .5 },
    weather: { kind: 'rain', amount: 0, wet: .3, pools: 0 },
  },
};
