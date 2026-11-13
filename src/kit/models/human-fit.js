// gs.models.human: a real face's shape fitted to a real head scan.
//
// The real look's head is sculpted in code (human-head.js head()); this is how far its skin is moved out (+) or in (-) to lie where a real
// head's does, a smooth correction over the whole head worked out by scripts/head-fit.mjs (solve=1) from a scan laid over our head. Only these
// numbers come from the scan: no scan file ships. The scan: "Lee Perry-Smith" head scan by Infinite Realities (Lee Perry-Smith),
// CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/), as in three.js's examples; credited in the app's Licences.
//
// The table: heights by direction from a point in the middle of the head (FIT_C, from the middle of the head HC: y and z), so a height moves
// the skin the same whichever way along that direction it is, and never changes from the skin inwards (as heights over the whole space did:
// where the move changed going inwards the head's measure flattened out, and the skin, unsure where to be, sank into the lip). Its
// columns: the direction's turn about the head from straight ahead (0) to straight back (180 degrees; the other side is the same), its rows
// its height from straight down (-90) to straight up (90), every STEP radians; each a signed byte of MAX / 127 metres, in base64, the
// turn fastest. Between points it is read smoothly (Catmull-Rom across 4 x 4), so its slope runs on without a crease from one to the next.
// It is not used round the eyes (the lids are shapes of their own, which would part from the skin), on the ears, down the neck where the
// head meets the body, or near the middle of the head.
import { ss } from './field.js';

export const FIT_C = [-.02, 0], FIT_STEP = Math.PI / 45, FIT_N = [46, 46], FIT_MAX = .015;
export const FIT_DATA = 'DQ0NDQ0NDAwMDAwMDAwMCwsLCwsLCwoKCgoKCgoKCQkJCQkJCQkJCQkJCQkJCQ8PDw8PDg4ODg4ODQ0NDQwMDAwMCwsLCwoKCgoKCgkJCQkJCQkJCQkJCAgICAgVFBQUFBMTExISERAQDw8ODg0NDAwMCwsLCgoKCgoJCQkJCQkICAgICAgICAgIHR0dHBsaGRgXFhUTEhAPDg4NDQwMCwsLCgoKCgoJCQkJCAgICAgICAcHBwcHByopKScmJSQiIB0bGBUSEA4MCwoKCwsLCgoKCgoKCQkJCQgICAgHBwcHBwcGBgY/Pz8/Pjw6NzMvKiUgHBcUEA4MCwsLCwsLCwoKCgoJCQkICAgHBwcGBgYGBgYGUFBPT05KSEQ/OzUvKyYgGxYSDw0NDQwMDAwLCwsKCgkJCAgHBwcGBgYFBQUFBU5OTk5LRkNAPDo1LysmIR4bFxMQDg4ODQ0NDAwLCwoKCQkIBwcGBgUFBQQEBARCQkE+Ozc1MjAuKyckIR0aGBYUExEPDw4ODg4NDAwLCgoJCAcHBgUFBAQDAwMDLSwqJiQiIR8eHRsaGBYUExIRERISERAQEBAPDw4NDAsKCQgHBgYFBAMDAgICAh4cGhcVEQ8ODg8QERAPDg0MDQ0PERITExMSERAPDg0MCwoIBwYFBAMCAgEAAAAbGRYTDgoIBwkLDg4PDg4NDAwNDhATFRUWFRQSERAODQsKCQcGBQMCAQD///7+HBsYFBAMCwwOEBITExMSEhIQERESFBYXGBgWFRMREA4MCgkHBgQDAQD//v38/B0cGBUUFBYYGRobGhsaGBgYFhUVFRYYGhsbGhcVExEPDQsJBwUEAgD//fz7+vkXGBcWFxshJSUjIiAfHh0cGxsZGRgYGRscHRwaFxUSEA0LCQcFAwH//fv5+Pf2EBEH+wwfKSwqJyQhIB8hHx0dHBsaGhocHh8eHBkWExAOCwkHBQMB/vz59/Xz8gL79PgTJSorKSUkIiAfHyAfHh4dHR0eICEhIB4bGBQRDgsIBwUDAP369vPw7+4cHBsdIyYoJiIfHRwdHh0eHh4eHyApMyslIyIgHRkVEg8NCwkGAwD9+fTv6+jnJigkISQlJB8ZFRQUFhkbHB0eHyEmPD0wJiYkIiAcGBYTEg8OCwgEAPv28Onk5B8fICIjIx4XEAwLDA8UFxkbHR8iKDc3NC4rKCYkIB0bGRgWFRMPDAcD/vjx6+sZGhoeHx0XDgUAAAQJDhQXGRseIiYtMDAwMC4rKSUjISAfHxwbGBYSDgoFAf78FBMUFhUSDAT8+Pj8AwoPExYZGx8jKCwvMTMzMC0qKScnJSUkIyAeHBkWExAODA4NDAoGBAD58vDy+P8HDRETFRgcICQpLjI4PDQwLSwrKyoqKSgnJSQhHxwZFxYJCAT+9/Xw6ujq7vb+BQoNEBIUGBwhJy00PEI3MS4uLS4sLSwrKikoJiMhHh0cBgUA9uzn2s7Y5e73/gQICwwOEBMYHiQsNUFGNC8sLCwtLS0tLSwrKiglIyEfHwUEAfn49t+2ueXy+gAEBgcICQoNEhkiKjNAPi4qKissLi0vLi4tLCopJiQhIB8FBQQDCQj86+L0/P8BAgMDAwQEBgsTHikwOjAnJSYpKywtLi4uLSwpJyUiIB4eBgYICQkKBgH+AAD//wAA/////v8CChwsMjEkICEkJyosLS8uLi0rKSYjIR4dHAYGChASEAsE/vn4+vz8/Pz7+vr5+v4KHCAcGhwfIyYpLC0uLi4tKygmIyAeHBsFBQgNEA4JAvrz8fT3+fn5+Pj39ff6/wYNERYaHyMmKywuLy8vLiwpJiMgHhwbBgYJDRAPCwX99vP19/j4+fj39vf3+v4DCg8VGiAkJystLzAwMS8tKiglIh8eHAwNDxIVFREMBgD7+/v7+/v5+fn5+vwBBQwRFxwhJSgsLzAyMjMyLywpJiQhHx4TFBYYGhoYFA8JBQIB//7+/v3+/gADBwsQFBoeIicqLTAyNDU1NDEuKyglIyEhGRkbHB4eHRoVEAwJBgUEAwMDBAUGCQ0QFRkdIiUoLC4xMzQ1NjQxLSonJSMiIRscHR4eHh0bGBQQDgsKCQkJCgsNDxEUFhodICUnKi0vMTMzNDQyLywqJyUjIiAdHR0dHR0cGhgVExEQDw8QEBETFBYYGRwfIiQnKistMDEyMzMyMS4sKiglIyIhHR0eHR0cGxoZFxYVFRQVFhcYGRobHR4gIyUnKSwtLjAxMjIyMS8tLCooJiQkIxsbGxsbGhoaGRkYGBgZGRscHR4fHyEjIyUnKSosLi4uLzAwLy4tLCopKCclJSUYGBgYGBgYFxcXFxgZGRscHh8fISEhIyQlJigoKSorKysrKysrKikoJyYlJCMjFRUVFRUVFRUVFRYWFxgYGhsbHB4eHyAhIiMkJSUmJicnJiYmJSUkIyIhISAgIBEREhEREhISEhMTFBQVFhYXGBkaGxscHR4fICAgISEhISAgIB8fHh4dHR0cHBwODg8PDg8PDxAQERESEhMUFBUWFxcYGRkaGxsbGxsbGxsbGxoaGhoZGRgYGBgYDAwNDQ0NDQ4ODg8PEBARERISExQUFRUWFhYWFhcXFxcXFxYWFhYVFRUVFRUUFAwMDAwNDQ0NDQ4ODg4PDw8QEBARERESEhISExMTExMTExMTExMTEhISEhISEhIMDAwMDAwNDQ0NDQ0NDQ4ODg4ODw8PDw8PDxAQEBAQEBAQEBAQEBAQEBAQDw8PDAwMDAwMDAwNDQ0NDQ0NDQ0NDQ4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg==';

let table = null, lx = NaN, ly = NaN, lz = NaN, lv = 0;
const decode = s => { const b = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'), t = new Float32Array(FIT_N[0] * FIT_N[1]); for (let i = 0; i < t.length && i < b.length; i++) { const c = b.charCodeAt(i); t[i] = (c > 127 ? c - 256 : c) / 127 * FIT_MAX; } return t; };
const cr = (t, w) => { const t2 = t * t, t3 = t2 * t; w[0] = -.5 * t3 + t2 - .5 * t; w[1] = 1.5 * t3 - 2.5 * t2 + 1; w[2] = -1.5 * t3 + 2 * t2 + .5 * t; w[3] = .5 * t3 - .5 * t2; };
const WA = [0, 0, 0, 0], WE = [0, 0, 0, 0];

/** A point's place in the table (x, hy, hz from the middle of the head): [column, row] (fractional), and how far it is from FIT_C. */
export function fitPlace(ax, hy, hz) {
  const y = hy - FIT_C[0], z = hz - FIT_C[1], h = Math.hypot(ax, z);
  return [Math.atan2(ax, z) / FIT_STEP, (Math.atan2(y, h) + Math.PI / 2) / FIT_STEP, Math.hypot(h, y)];
}
// the table's index for column i, row j (the turn mirrored at straight ahead and straight back; rows held at the top and the bottom)
export const fitCell = (i, j) => { const n = FIT_N[0] - 1; if (i < 0) i = -i; if (i > n) i = 2 * n - i; return Math.max(0, Math.min(FIT_N[1] - 1, j)) * FIT_N[0] + i; };

/** Where the fit is let move the skin, 0..1 (x, hy, hz from the middle of the head): not round the eyes, on the ears or down the neck. */
export function fitWeight(ax, hy, hz) {
  // (only down to the throat in front, and to under the ears behind: the neck below is the body's, where it must meet the trunk)
  if (hy <= -.16) return 0;
  const ex = ax - .0335, ey = hy * 1.2, ez = (hz - .071) * .8, eye = Math.sqrt(ex * ex + ey * ey + ez * ez); if (eye <= .006) return 0;
  const rx = ax - .07, ry = hy + .017, rz = hz + .004, ear = Math.sqrt(rx * rx + ry * ry + rz * rz); if (ear <= .016) return 0;
  // (nor on the nose and close round it: its own shapes are measured against the scan finer than the table can follow)
  const ny = hy > .004 ? hy - .004 : hy < -.036 ? -.036 - hy : 0, nose = Math.sqrt(ax * ax + ny * ny) + (hz < .075 ? .075 - hz : 0); if (nose <= .013) return 0;
  return ss(.006, .013, eye) * ss(.016, .032, ear) * ss(.013, .024, nose) * ss(-.16, -.105, hy) * (1 - (1 - ss(-.075, -.035, hy)) * ss(.01, -.04, hz));
}

/** The fit's height at a point (x, hy, hz from the middle of the head; metres), table: a Float32Array to read instead of the built-in one. */
export function fitAt(x, hy, hz, own = null) {
  const ax = x < 0 ? -x : x;
  if (!own && ax === lx && hy === ly && hz === lz) return lv;
  let v = 0;
  const y = hy - FIT_C[0], z = hz - FIT_C[1], h2 = ax * ax + z * z, r = Math.sqrt(h2 + y * y);
  if (r > .025) {
    const w = fitWeight(ax, hy, hz);
    if (w > 0) {
      const T = own || (table ||= decode(FIT_DATA)), ga = Math.atan2(ax, z) / FIT_STEP, ge = (Math.atan2(y, Math.sqrt(h2)) + Math.PI / 2) / FIT_STEP;
      const ia = Math.floor(ga), ie = Math.floor(ge); cr(ga - ia, WA); cr(ge - ie, WE);
      if (ia >= 1 && ia + 2 < FIT_N[0] && ie >= 1 && ie + 2 < FIT_N[1]) { for (let b = 0, at = (ie - 1) * FIT_N[0] + ia - 1; b < 4; b++, at += FIT_N[0]) v += WE[b] * (WA[0] * T[at] + WA[1] * T[at + 1] + WA[2] * T[at + 2] + WA[3] * T[at + 3]); }
      else for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) v += WA[a] * WE[b] * T[fitCell(ia - 1 + a, ie - 1 + b)];
      v *= w * (r < .05 ? ss(.025, .05, r) : 1);
    }
  }
  if (!own) { lx = ax; ly = hy; lz = hz; lv = v; }
  return v;
}
