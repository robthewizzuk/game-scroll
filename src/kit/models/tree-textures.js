// EZ-Tree's leaf and bark pictures, drawn in code instead of its image files (vite.config.js swaps
// this in for its textures.js). Leaves are drawn pale with darker veins, so the material's colour
// tints them; bark comes from gs.models' 'bark' recipe instead (gs.models.tree turns EZ-Tree's own off).
// Kit use only.
import { CanvasTexture, SRGBColorSpace, LinearMipmapLinearFilter } from 'three';

const S = 128, made = {};
const leafShape = {
  // one lobed leaf on a stalk
  oak(x) {
    x.beginPath();
    for (let i = 0; i < 5; i++) { const y = 96 - i * 17, r = 15 + Math.sin(i / 4 * Math.PI) * 9 - i * 1.5; x.moveTo(64 + r * 1.25, y); x.ellipse(64 - r * .4, y, r * .95, 11, 0, 0, Math.PI * 2); x.moveTo(64 + r * 1.4, y); x.ellipse(64 + r * .4, y, r * .95, 11, 0, 0, Math.PI * 2); }
    x.ellipse(64, 18, 11, 12, 0, 0, Math.PI * 2); x.fill();
    return [[64, 124, 64, 12]];
  },
  // a stalk of narrow leaflets in pairs, one at the tip
  ash(x) {
    const veins = [[64, 126, 64, 10]];
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const y = 100 - i * 30, a = s * -.6; x.save(); x.translate(64 + s * 22, y - 8); x.rotate(a); x.beginPath(); x.ellipse(0, 0, 9, 21, 0, 0, Math.PI * 2); x.fill(); x.restore(); veins.push([64, y, 64 + s * 30, y - 18]); }
    x.beginPath(); x.ellipse(64, 20, 9, 18, 0, 0, Math.PI * 2); x.fill();
    return veins;
  },
  // a round leaf with a point
  aspen(x) {
    x.beginPath(); x.moveTo(64, 10); x.bezierCurveTo(118, 34, 112, 108, 64, 108); x.bezierCurveTo(16, 108, 10, 34, 64, 10); x.fill();
    return [[64, 126, 64, 16], [64, 70, 92, 46], [64, 70, 36, 46], [64, 92, 88, 76], [64, 92, 40, 76]];
  },
  // a bundle of needles fanning out from the stalk
  pine(x) {
    x.lineCap = 'round';
    for (let i = 0; i < 26; i++) { const a = -Math.PI / 2 + (i / 25 - .5) * 2.2, l = 70 + (i * 37 % 23); x.lineWidth = 3; x.beginPath(); x.moveTo(64, 116); x.lineTo(64 + Math.cos(a) * l, 116 + Math.sin(a) * l); x.stroke(); }
    return [];
  },
};

/** A leaf picture (pale, alpha cut-out) for EZ-Tree's leaf type. */
export function getLeafTexture(type) {
  const k = leafShape[type] ? type : 'oak';
  if (made[k]) return made[k];
  const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d', { willReadFrequently: true });   // (painted in memory: hd3d.js surface())
  x.fillStyle = x.strokeStyle = '#e8f0e0';
  const veins = leafShape[k](x);
  // shading: lighter towards the edge, veins darker (drawn only where the leaf is)
  x.globalCompositeOperation = 'source-atop';
  const g = x.createRadialGradient(64, 64, 10, 64, 64, 70); g.addColorStop(0, 'rgba(120,140,100,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(90,110,70,.7)'; x.lineWidth = 2;
  for (const [a, b, cc, d] of veins) { x.beginPath(); x.moveTo(a, b); x.lineTo(cc, d); x.stroke(); }
  x.globalCompositeOperation = 'source-over';
  // the stalk
  x.strokeStyle = '#8a8a60'; x.lineWidth = 3; if (k !== 'pine') { x.beginPath(); x.moveTo(64, 127); x.lineTo(64, 106); x.stroke(); }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.minFilter = LinearMipmapLinearFilter; t.anisotropy = 4;
  return (made[k] = t);
}
/** Bark comes from the 'bark' recipe (gs.models.tree turns EZ-Tree's own bark pictures off). */
export function getBarkTexture() { return null; }
