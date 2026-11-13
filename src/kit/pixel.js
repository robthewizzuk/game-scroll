// Pixel art kit: crisp pixel text and sprites drawn from text, for Pocket, Color and Advance games
// (and pixel-style HUDs anywhere). Everything is cached, so drawing is just a drawImage.
//
//   const { text, sprite, anim } = gs.pixel;
//   text(c, 'SCORE 120', 4, 4, { color: '#fff', size: 2 });          // tiny built-in 3×5 font, scale 2
//   text(c, 'GAME OVER', W / 2, 80, { font: 'big', align: 'center', color: '#ff0', outline: '#000' });   // 8×8 font
//   text(c, 'Find the key', 4, 20, { font: 'tiny' });               // more pixel fonts: 'silkscreen', 'silkscreen bold', 'tiny', 'jersey', 'terminal'
//
//   const hero = sprite(`
//     ..kk..
//     .kyyk.
//     kyykyk
//     .kyyk.
//     ..kk..`, { k: '#000', y: '#fd0' });                        // one letter per pixel; '.' is clear
//   hero.draw(c, x, y, { scale: 3, flip: true, outline: '#fff' });  // x, y is the top-left; centre: true centres it
//   const red = hero.recolor({ y: '#f33' });                         // palette swap
//   const walk = anim([frameA, frameB], { k: '#000' }, 8);           // 8 frames per second
//   walk.draw(c, x, y, time, { scale: 3 });

import { pixelFont, want, ready, whenFontArrives } from './fontlib.js';

/* ---------- the tiny 3×5 font (always ready) ---------- */
const G = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110', 4: '101101111001001',
  5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
  ' ': '000000000000000', '.': '000000000000010', ',': '000000000010100', '!': '010010010000010', '?': '110001010000010',
  ':': '000010000010000', ';': '000010000010100', '-': '000000111000000', '+': '000010111010000', '=': '000111000111000',
  '/': '001001010100100', '\\': '100100010001001', '(': '010100100100010', ')': '010001001001010', "'": '010010000000000',
  '"': '101101000000000', '%': '101001010100101', '*': '000101010101000', '<': '001010100010001', '>': '100010001010100',
  '#': '101111101111101', '_': '000000000000111', '[': '110100100100110', ']': '011001001001011', '♥': '000101111111010',
  '♪': '011010010110110', '×': '000101010101000', '$': '011110010011110', '@': '010101111100011', '&': '010101010101011',
};

const cache = new Map();
function remember(key, make) {
  let v = cache.get(key);
  if (!v) { if (cache.size > 400) cache.delete(cache.keys().next().value); cache.set(key, v = make()); }
  return v;
}
function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c;
}
// Text in a font is snapped to hard pixels by reading its pixels back. On a canvas kept by the graphics chip that read
// waits for the chip (0.8 ms a new piece of text on the test machine, up to 13 ms), so it is drawn on one kept in memory
// (0.1 ms): a score or a timer in the 8×8 font changes every second or so.
const CPU = { willReadFrequently: true };
let probeG = null;
const probe = font => { probeG ||= canvas(1, 1).getContext('2d', CPU); probeG.font = font; return probeG; };
// Adds a 1-pixel outline round the solid pixels of a mask (an ImageData-sized alpha test).
function outlined(src, color) {
  const w = src.width + 2, h = src.height + 2, c = canvas(w, h), g = c.getContext('2d');
  g.drawImage(src, 1, 1); g.globalCompositeOperation = 'destination-over';
  const t = canvas(w, h), tg = t.getContext('2d');
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) tg.drawImage(src, dx, dy);
  tg.globalCompositeOperation = 'source-in'; tg.fillStyle = color; tg.fillRect(0, 0, w, h);
  g.drawImage(t, 0, 0);
  return c;
}

function smallText(str, color) {
  const lines = String(str).toUpperCase().split('\n'), w = Math.max(...lines.map(l => l.length)) * 4 - 1, h = lines.length * 6 - 1;
  const c = canvas(w, h), g = c.getContext('2d'); g.fillStyle = color;
  lines.forEach((l, row) => [...l].forEach((ch, i) => {
    const bits = G[ch] ?? G['?'];
    for (let k = 0; k < 15; k++) if (bits[k] === '1') g.fillRect(i * 4 + k % 3, row * 6 + Math.floor(k / 3), 1, 1);
  }));
  return c;
}

/* ---------- the 8×8 font (Press Start 2P, OFL) ---------- */
// The app ships the font (src/main.js loads it); until it's ready the text uses a plain monospace.
const BIG = "'Press Start 2P'";
let bigFont = 'monospace', asked = false;
function loadBig() {
  if (bigFont !== 'monospace' || typeof document === 'undefined' || !document.fonts) return;
  if (document.fonts.check(`8px ${BIG}`)) { bigFont = BIG; return; }
  if (!asked) { asked = true; document.fonts.load(`8px ${BIG}`).then(() => { if (document.fonts.check(`8px ${BIG}`)) bigFont = BIG; }).catch(() => {}); }
}
function bigText(str, color) {
  loadBig();
  const lines = String(str).split('\n'), pr = probe(`8px ${bigFont}`);
  const w = Math.ceil(Math.max(...lines.map(l => pr.measureText(l).width))), h = lines.length * 10 - 2;
  const c = canvas(w, h), g = c.getContext('2d', CPU);
  g.font = `8px ${bigFont}`; g.textBaseline = 'top'; g.fillStyle = color;
  lines.forEach((l, i) => g.fillText(l, 0, i * 10));
  // snap to hard pixels: every pixel either fully on or off
  const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
  for (let i = 3; i < a.length; i += 4) a[i] = a[i] > 110 ? 255 : 0;
  g.putImageData(d, 0, 0);
  return c;
}

/* ---------- more pixel fonts from the font library (gs.fonts): Silkscreen, Tiny5, Jersey 10, VT323 ---------- */
// Each is drawn at the one size where a pixel of the font is a pixel of the game, then snapped to hard
// pixels. Its file loads the first time a game names it; until then the text uses the 8×8 font.
let arrived = 0;                       // goes up when a font finishes loading, so remembered text is drawn again
whenFontArrives(() => { arrived++; shapes.clear(); });
const shapes = new Map();              // 'name weight' -> { cap, desc, step }: whole pixels, measured once
function shapeOf(f, weight) {
  const key = f.name + ' ' + weight; let m = shapes.get(key);
  if (!m) {
    const g = probe(`${weight} ${f.pixel}px "${f.name}"`);
    const cap = Math.round(g.measureText('H').actualBoundingBoxAscent), desc = Math.max(1, Math.round(g.measureText('gjpqy,').actualBoundingBoxDescent));
    shapes.set(key, m = { cap, desc, step: cap + desc + Math.max(1, Math.round(cap / 5)) });
  }
  return m;
}
function libText(f, weight, str, color) {
  const lines = String(str).split('\n'), css = `${weight} ${f.pixel}px "${f.name}"`, m = shapeOf(f, weight), pr = probe(css);
  const w = Math.max(1, Math.ceil(Math.max(...lines.map(l => pr.measureText(l).width)))), h = (lines.length - 1) * m.step + m.cap + m.desc;
  const c = canvas(w, h), g = c.getContext('2d', CPU);
  g.font = css; g.textBaseline = 'alphabetic'; g.fillStyle = color;
  lines.forEach((l, i) => g.fillText(l, 0, i * m.step + m.cap));
  const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
  for (let i = 3; i < a.length; i += 4) a[i] = a[i] > 110 ? 255 : 0;
  g.putImageData(d, 0, 0);
  return c;
}
/** The library font for a font option, once it is in; null for 'small' and 'big' and while it loads. */
function libFont(font) {
  if (font === 'small' || font === 'big') return null;
  const p = pixelFont(font);
  if (!p) return null;
  want(p.font, p.weight);
  return ready(p.font.name, p.weight) ? p : null;
}

// the picture of a piece of text (remembered); its key is left in pictureKey (no array a call)
let pictureKey = '';
function picture(str, font, color, outline) {
  const lib = libFont(font), kind = lib ? font : font === 'small' ? 'small' : 'big';
  if (kind === 'big') loadBig();
  const key = pictureKey = kind + '|' + color + '|' + (outline || '') + '|' + (lib ? arrived : bigFont) + '|' + str;
  return remember(key, () => { const t = lib ? libText(lib.font, lib.weight, str, color) : kind === 'big' ? bigText(str, color) : smallText(str, color); return outline ? outlined(t, outline) : t; });
}

/**
 * Draws pixel text with its top-left at (x, y). Options: color, size (whole-number scale), font:
 * 'small' (3×5 capitals, default) | 'big' (8×8) | 'silkscreen' | 'silkscreen bold' | 'tiny' (5 high, with
 * small letters) | 'jersey' (10 high) | 'terminal' (14 high), align: 'left' | 'center' | 'right', outline
 * (a colour), shadow (a colour, drawn one pixel down-right). Returns the width drawn. '\n' starts a new line.
 */
export function text(c, str, x, y, { color = '#ffffff', size = 1, font = 'small', align = 'left', outline = null, shadow = null } = {}) {
  const img = picture(str, font, color, outline), key = pictureKey;
  const s = Math.max(1, Math.round(size)), w = img.width * s, h = img.height * s;
  const px = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x) - (outline ? s : 0), py = Math.round(y) - (outline ? s : 0);
  const smooth = c.imageSmoothingEnabled; c.imageSmoothingEnabled = false;
  if (shadow) c.drawImage(remember('sh|' + key + shadow, () => { const t = canvas(img.width, img.height), g = t.getContext('2d'); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = shadow; g.fillRect(0, 0, t.width, t.height); return t; }), px + s, py + s, w, h);
  c.drawImage(img, px, py, w, h);
  c.imageSmoothingEnabled = smooth;
  return w;
}
/** Width and height (in pixels at size 1) of a piece of pixel text. */
export function measure(str, font = 'small') {
  if (font === 'small') { const lines = String(str).split('\n'); return { w: Math.max(...lines.map(l => l.length)) * 4 - 1, h: lines.length * 6 - 1 }; }
  const t = picture(str, font, '#ffffff', null); return { w: t.width, h: t.height };   // (the same picture text() draws in white)
}

/* ---------- sprites from text ---------- */
class Sprite {
  constructor(rows, palette) {
    this.rows = rows; this.palette = palette;
    this.w = Math.max(0, ...rows.map(r => r.length)); this.h = rows.length;
    this.img = canvas(this.w, this.h);
    const g = this.img.getContext('2d');
    rows.forEach((r, y) => [...r].forEach((ch, x) => { const col = palette[ch]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }));
    this.outlines = new Map();
  }
  /** Draws it at (x, y), its top-left (centre: true for its middle). scale, flip (mirror left-right), flipY, alpha, outline (a colour). */
  draw(c, x, y, { scale = 1, flip = false, flipY = false, centre = false, center = centre, alpha = 1, outline = null } = {}) {
    const img = outline ? (this.outlines.get(outline) || (this.outlines.set(outline, outlined(this.img, outline)), this.outlines.get(outline))) : this.img;
    const s = scale, w = img.width * s, h = img.height * s, o = outline ? s : 0;
    let px = center ? x - this.w * s / 2 : x, py = center ? y - this.h * s / 2 : y;
    px = Math.round(px) - o; py = Math.round(py) - o;
    const smooth = c.imageSmoothingEnabled, a = c.globalAlpha;
    c.imageSmoothingEnabled = false; c.globalAlpha = a * alpha;
    if (flip || flipY) { c.save(); c.translate(px + (flip ? w : 0), py + (flipY ? h : 0)); c.scale(flip ? -1 : 1, flipY ? -1 : 1); c.drawImage(img, 0, 0, w, h); c.restore(); }
    else c.drawImage(img, px, py, w, h);
    c.imageSmoothingEnabled = smooth; c.globalAlpha = a;
    return this;
  }
  /** A copy with some colours changed: recolor({ y: '#f33' }). */
  recolor(changes) { return new Sprite(this.rows, { ...this.palette, ...changes }); }
  /** Is the pixel at (px, py) (sprite pixels, from its top-left) solid? For pixel-perfect hits. */
  solid(px, py) { const r = this.rows[Math.floor(py)]; return !!(r && this.palette[r[Math.floor(px)]]); }
}
const parse = art => String(art).replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
/** A sprite from rows of letters (one per pixel; any letter not in the palette, like '.', is clear). */
export function sprite(art, palette) { return new Sprite(parse(art), palette); }
/**
 * An animation from several pieces of sprite art. fps: frames per second. draw(c, x, y, time, opts)
 * picks the frame from the time (seconds); frame(i) gets one.
 */
export function anim(frames, palette, fps = 8) {
  const list = frames.map(f => f instanceof Sprite ? f : sprite(f, palette));
  return {
    frames: list, fps, w: list[0]?.w || 0, h: list[0]?.h || 0,
    frame(i) { return list[((Math.floor(i) % list.length) + list.length) % list.length]; },
    at(time) { return this.frame(time * this.fps); },
    draw(c, x, y, time, opts) { this.at(time).draw(c, x, y, opts); return this; },
    recolor(changes) { return anim(list.map(s => s.recolor(changes)), palette, fps); },
  };
}
/** A grid of sprites from one art block: tiles(art, palette, 8, 8) gives [[tile, tile...], ...] for tile maps. */
export function tiles(art, palette, tw, th) {
  const rows = parse(art), out = [];
  for (let ty = 0; ty * th < rows.length; ty++) {
    const line = [];
    for (let tx = 0; tx * tw < Math.max(...rows.map(r => r.length)); tx++) line.push(new Sprite(rows.slice(ty * th, ty * th + th).map(r => r.slice(tx * tw, tx * tw + tw)), palette));
    out.push(line);
  }
  return out;
}
