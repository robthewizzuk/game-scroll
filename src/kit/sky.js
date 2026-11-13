// Sky and weather for 3D games (Console toon, Next Gen HD and AR): a time of day that moves the sun,
// colours the sky, light and fog and brings out stars at night; and rain, snow and storms with
// lightning. Pass the colours your game wants; the kit does the in-betweens and the particles.
//
//   const { Sky, Weather } = gs.sky;
//   reset() {
//     sky = new Sky(view, { time: 17, speed: .2 });          // 5 pm, an in-game hour every 5 seconds
//     rain = new Weather(view, { kind: 'rain', amount: .6 }); // 'rain' | 'snow' | 'storm' | 'clear'
//     rain.onFlash = far => noise(1.2, { vol: .2 * (1 - far), from: 300, to: 60, at: far * 2 });   // thunder
//   }
//   update(dt) { sky.update(dt); rain.update(dt); }
//   sky.time = 6; sky.night (0..1)  rain.set('snow', 1)
//
// Sky follows view.cam each frame (a big dome round it, drawn behind everything). In AR the camera
// feed is the sky, so leave Sky out and use Weather alone. Light: by default Sky drives view.sun and
// view.hemi when the view has them; pass { sun } for a light you made with gs.hd.sun().
//
// Clouds: { clouds: .5 } (cover 0..1; change sky.clouds any time after) draws drifting clouds lit by the sun, with cloudLight and
// cloudDark colours of your own if you like and gap (0..1) to keep the low sky round the sun clear.
// On a Next Gen view with v.air() on, the clouds' shadows drift over the ground below and the air takes
// its colours from the sky. { env: true } (Next Gen) makes reflections and sky light from this sky
// instead of the kit's soft studio, redone as the sky changes. sky.flash = 1 lights the clouds (lightning).
//
// Physical sky: { physical: true } (or { physical: { haze, blue, mie, glow, bright } }) works the sky's
// colours out from how sunlight scatters in air (the Preetham model, as in three.js's Sky): deep blue
// overhead, pale at the horizon, a white sun at noon going orange and red as it sets, with the glow
// round it. Clouds, reflections, the air's colours, fog and the sky light all follow it; the day keys
// then only set how strong the sun and fill lights are.

import { timed } from './prof.js';
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial, Points, PointsMaterial, Scene, ShaderMaterial, SphereGeometry, Vector3, Vector4 } from 'three';
import { prefs } from './prefs.js';
import { HD, noiseTex } from './hd3d.js';
import { Cover } from './cover.js';
import { Spray } from './water.js';
import { airOf, luts, skyLight, transmittance, RG, SKY_K } from './atmosphere.js';

const C = c => new Color(c);
// Preetham daylight (the same sums as three.js's Sky shader), worked out on the CPU for the colours the
// rest of the scene takes from the sky, and in the dome's shader for every pixel
const TOTAL_RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5], MIE_CONST = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const PHYS = { haze: 6, blue: 1.6, mie: .004, glow: .8, bright: .55 };
function physConsts(p, sun, out) {
  const zc = Math.max(-1, Math.min(1, sun.y));
  out.sunE = 1000 * Math.max(0, 1 - Math.exp(-((1.6110731556870734 - Math.acos(zc)) / 1.5)));
  const m = .434 * (.2 * p.haze * 1e-17) * p.mie;
  out.bR = TOTAL_RAYLEIGH.map(v => v * p.blue); out.bM = MIE_CONST.map(v => v * m); out.g = p.glow; out.k = p.bright;
  return out;
}
function physAt(q, d, sun, out) {   // the sky's colour looking along d (unit), into out (a Color)
  const zen = Math.acos(Math.max(0, d.y)), inv = 1 / (Math.cos(zen) + .15 * Math.pow(93.885 - zen * 180 / Math.PI, -1.253));
  const sR = 8400 * inv, sM = 1250 * inv, ct = d.x * sun.x + d.y * sun.y + d.z * sun.z;
  const rP = .05968310365946075 * (1 + (ct * .5 + .5) ** 2), g2 = q.g * q.g, mP = .07957747154594767 * (1 - g2) / Math.pow(1 - 2 * q.g * ct + g2, 1.5);
  const mixK = Math.max(0, Math.min(1, (1 - sun.y) ** 5)), c = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const fex = Math.exp(-(q.bR[i] * sR + q.bM[i] * sM)), r = (q.bR[i] * rP + q.bM[i] * mP) / (q.bR[i] + q.bM[i]);
    let lin = Math.pow(q.sunE * r * (1 - fex), 1.5); lin *= 1 + (Math.sqrt(q.sunE * r * fex) - 1) * mixK;
    c[i] = ((lin + .1 * fex) * .04 + [0, .0003, .00075][i]) * q.k;
  }
  return out.setRGB(c[0], c[1], c[2]);
}
// the colour sunlight has after its trip through the air (white overhead, orange low down), brightest channel 1
function physSun(q, sun, out) {
  const zen = Math.acos(Math.max(0, sun.y)), inv = 1 / (Math.cos(zen) + .15 * Math.pow(Math.max(1e-3, 93.885 - zen * 180 / Math.PI), -1.253));
  const f = [0, 1, 2].map(i => Math.exp(-(q.bR[i] * 8400 * inv + q.bM[i] * 1250 * inv))), m = Math.max(...f, 1e-6);
  return out.setRGB(f[0] / m, f[1] / m, f[2] / m);
}
/** The default day: hour -> sky top, horizon, sun colour, sun strength (x the light's own), fill strength. */
export const DAY = [
  [0, { top: '#05070f', horizon: '#141a30', sun: '#7088c0', sunI: .12, amb: .35 }],
  [5, { top: '#0c1430', horizon: '#3a3050', sun: '#8090c0', sunI: .15, amb: .4 }],
  [6.5, { top: '#3a5a9a', horizon: '#f0a070', sun: '#ffb070', sunI: .6, amb: .65 }],
  [9, { top: '#4a88d8', horizon: '#b8d8f0', sun: '#fff0d8', sunI: 1, amb: 1 }],
  [16, { top: '#4a88d8', horizon: '#c0dcf0', sun: '#fff0d8', sunI: 1, amb: 1 }],
  [18.5, { top: '#3a4a8a', horizon: '#f08a50', sun: '#ff9050', sunI: .55, amb: .6 }],
  [20, { top: '#101838', horizon: '#40305a', sun: '#8090c0', sunI: .15, amb: .4 }],
  [24, { top: '#05070f', horizon: '#141a30', sun: '#7088c0', sunI: .12, amb: .35 }],
];
const isToon = v => 'elev' in v && v.pools instanceof Map;   // toon views ink everything on layer 0
const radiusOf = cam => Math.max(10, (cam?.far ?? 100) * .9);

export class Sky {
  /**
   * time: hour 0..24. speed: in-game hours per second (0 = still). day: keyframes like DAY to recolour
   * the day. stars: count (0 for none). physical: true (or { haze, blue, mie, glow, bright }) works the
   * colours out from light scattering in air (Next Gen looks; see the top of this file).
   * fog: recolour the scene's fog to the horizon (default true). light: false leaves your lights alone.
   */
  constructor(view, { time = 12, speed = 0, day = DAY, stars = 400, physical = false, fog = true, light = true, sun = view.sun, hemi = view.hemi, tilt = .35,
    clouds = null, cloudLight = null, cloudDark = null, gap = 0, env = false, sunSize = 1 } = {}) {
    this.pq = {};
    Object.assign(this, { view, time, speed, day, fog, light, sunLight: sun || null, hemi: hemi || null, tilt, physical, clouds: clouds ?? 0, gap, env, flash: 0 });
    this.base = { sun: sun?.intensity ?? 1, amb: hemi?.intensity ?? 1 };
    this.sunDir = new Vector3(); this.top = C('#000'); this.horizon = C('#000'); this.sunCol = C('#fff'); this.night = 0;
    this.cloudLight = cloudLight ? C(cloudLight) : null; this.cloudDark = cloudDark ? C(cloudDark) : null;
    this.cLit = C('#fff'); this.cDark = C('#888'); this.envAt = null; this.envT = 0; this.t = 0;
    const R = radiusOf(view.cam);
    {
      // a gradient from the horizon up, a glow round the sun, the sun itself (on Next Gen bright enough
      // to bloom) and, when asked for, drifting clouds lit from the sun's side
      const hd = !!view.envFrom;
      this.dome = new Mesh(new SphereGeometry(1, 32, 16), new ShaderMaterial({
        side: BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: this.top }, horizon: { value: this.horizon }, sunCol: { value: this.sunCol }, sunDir: { value: this.sunDir }, size: { value: 1 - .0006 * sunSize * sunSize },
          disc: { value: hd ? 24 : 1.5 }, cloud: { value: new Vector4() }, cloudLit: { value: this.cLit }, cloudDark: { value: this.cDark }, noise: { value: clouds != null ? noiseTex() : null },
          pBR: { value: new Vector3() }, pBM: { value: new Vector3() }, pSun: { value: new Vector4() } },
        defines: clouds != null ? { CLOUDS: '' } : {},
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
        fragmentShader: `varying vec3 vDir; uniform vec3 top, horizon, sunCol, sunDir, cloudLit, cloudDark, pBR, pBM; uniform float size, disc; uniform vec4 cloud, pSun; uniform sampler2D noise;
          void main(){ vec3 d = normalize(vDir), sd = normalize(sunDir); float h = clamp(d.y, -1., 1.), s = max(dot(d, sd), 0.);
            vec3 c;
            if (pSun.z > 0.) {
            // light scattered by the air towards the eye (Preetham; pSun: sun strength, glow, brightness, how low the sun is)
            float zen = acos(max(d.y, 0.)), inv = 1. / (cos(zen) + .15 * pow(93.885 - zen * 57.29578, -1.253));
            vec3 fex = exp(-(pBR * 8400. * inv + pBM * 1250. * inv));
            float ct = dot(d, sd), g2 = pSun.y * pSun.y;
            vec3 r = (pBR * (.0596831 * (1. + pow(ct * .5 + .5, 2.))) + pBM * (.0795775 * (1. - g2) / pow(1. - 2. * pSun.y * ct + g2, 1.5))) / (pBR + pBM);
            vec3 lin = pow(pSun.x * r * (1. - fex), vec3(1.5)); lin *= mix(vec3(1.), sqrt(pSun.x * r * fex), pSun.w);
            c = ((lin + .1 * fex) * .04 + vec3(0., .0003, .00075)) * pSun.z; c = mix(c, c * .55, clamp(-h * 3., 0., 1.));
            float l = max(c.r, max(c.g, c.b)); if (l > 1.) c *= (1. + (l - 1.) / (1. + (l - 1.) / 1.5)) / l;   // soft knee: the glow round a low sun is bright, but no brighter than a painted sky's (2.5 at most)
            } else {
            c = mix(horizon, top, pow(max(h, 0.), .55)); c = mix(c, horizon * .55, clamp(-h * 3., 0., 1.));
            c += sunCol * (pow(s, 24.) * .35 + pow(s, 90.) * .4);
            }
            float sun = smoothstep(size, size + .0004, s);
          #ifdef CLOUDS
            if (h > -.03) {
              vec2 uv = d.xz / (h + .16) * .2 + cloud.z * vec2(1., .4);
              float n = texture2D(noise, uv).r * .62 + texture2D(noise, uv * 3.1 + .37).g * .38;
              float cv = cloud.x * (1. - cloud.y * pow(max(dot(normalize(d.xz + 1e-4), normalize(sd.xz + 1e-4)), 0.), 3.) * (1. - smoothstep(.02, .22, h)));
              float cov = smoothstep(1. - cv, 1.1 - cv * .62, n), dens = smoothstep(1. - cv, 1.32 - cv * .5, n);
              vec3 cc = mix(cloudLit, cloudDark, dens * .9) + sunCol * cov * (1. - dens) * (pow(s, 5.) * 2.2 + .18);
              float a = cov * smoothstep(-.03, .1, h);
              c = mix(c, cc + cloud.w * vec3(.75, .8, 1.), a * .97); sun *= 1. - a;
            }
          #endif
            c += sunCol * sun * disc + cloud.w * vec3(.25, .27, .32) * (.4 + .6 * max(h, 0.));
            gl_FragColor = vec4(c, 1.); }`,
      }));
      // (the kit swaps in its WebGPU version, hd3d-gpu.js gpuMaterials.skyDome, while the view draws on WebGPU: keep using this.mat)
      this.mat = this.dome.material; this.mat.userData.gsGpu = 'skyDome'; this.mat.userData.gsSky = this;
      this.dome.scale.setScalar(R);
    }
    this.dome.frustumCulled = false; this.dome.renderOrder = -10; this.dome.name = 'sky';
    if (isToon(view)) this.dome.layers.set(1);
    view.scene.add(this.dome); view._sky = this;   // (the view runs its GPU half before each WebGPU frame: hd3d-gpu-sky.js)
    // the view makes the sky's reflections the first time it compiles its shaders (v.warm()), so the
    // first frame is already lit by this sky
    if (this.makesEnv) view.envMaker = this.envMaker = () => { if (this.envAt == null) this.makeEnv(); };
    if (stars) {
      const p = new Float32Array(stars * 3);
      for (let i = 0; i < stars; i++) { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u); p.set([Math.cos(a) * r, Math.abs(u), Math.sin(a) * r], i * 3); }
      const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(p, 3));
      this.stars = new Points(g, new PointsMaterial({ color: '#ffffff', size: R * .004, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      this.stars.scale.setScalar(R * .95); this.stars.frustumCulled = false; this.stars.renderOrder = -9;
      if (isToon(view)) this.stars.layers.set(1);
      view.scene.add(this.stars);
    }
    this.apply();
  }
  /** true (or { haze, blue, mie, glow, bright }) for colours from light scattering; false for the day keys' colours. Change any time. */
  set physical(v) { this.phys = v ? { ...PHYS, ...(v === true ? {} : v) } : null; }
  get physical() { return !!this.phys; }
  /** 0..1 through the day (0 midnight, .5 noon). */
  get dayPart() { return this.time / 24; }
  update(dt) {
    if (this.speed) this.time = ((this.time + this.speed * dt) % 24 + 24) % 24;
    this.t += dt;
    const cam = this.view.cam;
    if (cam) { this.dome.position.copy(cam.position); this.stars?.position.copy(cam.position); }
    this.apply();
    // sky light and reflections from this sky, made again when it has changed (at most every 3 s)
    if (this.makesEnv) { this.envT -= dt; if (this.envT <= 0 && this.envKey() !== this.envAt) this.makeEnv(); }
    return this;
  }
  get makesEnv() { return this.env && !!this.view.envFrom; }
  envKey() { return this.time.toFixed(2) + '|' + this.clouds.toFixed(2) + '|' + this.horizon.getHexString() + this.top.getHexString(); }
  makeEnv() {
    if (!this.envScene) { this.envScene = new Scene(); this.envDome = new Mesh(this.dome.geometry, this.mat); this.envDome.scale.setScalar(1000); this.envScene.add(this.envDome); }
    // a softer sun in reflections (wrap: also when the view makes them again on the other renderer)
    // (and the painted clouds in place of the real ones on WebGPU: those are marched for the view's own camera)
    const u = this.mat.uniforms, wrap = f => { const d = u.disc.value, g = this.gpu, v = g?.volOn.value; u.disc.value = Math.min(d, 6); if (g) g.volOn.value = 0; try { return f(); } finally { u.disc.value = d; if (g) g.volOn.value = v; } };
    this.view.envFrom(this.envScene, { wrap });
    this.envAt = this.envKey(); this.envT = 3;
    return this;
  }
  /** Works out the colours and sun for the current time (update() calls it). */
  apply() {
    const t = ((this.time % 24) + 24) % 24, D = this.day;
    let i = 0; while (i < D.length - 2 && D[i + 1][0] <= t) i++;
    const [t0, a] = D[i], [t1, b] = D[i + 1], k = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    this.top.set(a.top).lerp(C(b.top), k); this.horizon.set(a.horizon).lerp(C(b.horizon), k); this.sunCol.set(a.sun).lerp(C(b.sun), k);
    const sunI = a.sunI + (b.sunI - a.sunI) * k, amb = a.amb + (b.amb - a.amb) * k;
    // the sun rises in the east (+x) at 6, is highest at 12, sets at 18; the moon takes over at night
    const ang = (t - 6) / 12 * Math.PI, up = Math.sin(ang);
    this.sunDir.set(Math.cos(ang), up, this.tilt).normalize();
    this.night = Math.min(1, Math.max(0, (-up + .1) * 3));
    const lightDir = this.lightDir = this.night > .5 ? this.sunDir.clone().negate() : this.sunDir;   // moonlight from the other side
    this.sunI = sunI;
    if (this.phys) {
      // the colours come from the scattering sums: overhead, round the horizon, and the sunlight itself
      const q = physConsts(this.phys, this.sunDir, this.pq), u = this.mat.uniforms, d = new Vector3(), tmp = C('#000');
      u.pBR.value.fromArray(q.bR); u.pBM.value.fromArray(q.bM); u.pSun.value.set(q.sunE, q.g, q.k, Math.max(0, Math.min(1, (1 - this.sunDir.y) ** 5)));
      physAt(q, d.set(0, 1, 0), this.sunDir, this.top);
      this.horizon.setRGB(0, 0, 0);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; this.horizon.add(physAt(q, d.set(Math.cos(a), .06, Math.sin(a)).normalize(), this.sunDir, tmp)); }
      this.horizon.multiplyScalar(1 / 8);
      // the sky's colours are light, not paint: keep them in the range the rest of the kit expects
      const m = Math.max(this.horizon.r, this.horizon.g, this.horizon.b, this.top.r, this.top.g, this.top.b); if (m > 1) { this.horizon.multiplyScalar(1 / m); this.top.multiplyScalar(1 / m); }
      if (this.night > 0) { this.top.lerp(C(a.top).lerp(C(b.top), k), this.night); this.horizon.lerp(C(a.horizon).lerp(C(b.horizon), k), this.night); }
      physSun(q, this.sunDir, this.sunCol); if (this.night > .5) this.sunCol.set(a.sun).lerp(C(b.sun), k);
      // how bright the sky is 4 degrees from the sun (about the size of a painted sky's bright sun): sun shafts start from sky brighter than this
      const sd = this.sunDir, side = d.set(-sd.z, 0, sd.x); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
      const o = physAt(q, side.multiplyScalar(.0698).addScaledVector(sd, .9976).normalize(), sd, tmp);
      const ol = Math.max(o.r, o.g, o.b), kn = ol > 1 ? (1 + (ol - 1) / (1 + (ol - 1) / 1.5)) / ol : 1;   // the dome's soft knee
      this.view.shaftsAt = this.night > .5 ? null : (.2126 * o.r + .7152 * o.g + .0722 * o.b) * kn;
      // drawn on WebGPU: the air as the dome draws it there (Hillaire's sums) in place of these
      if (this.view._onGpu && HD.atmosphere !== false) this.hillaire(a, b, k);
    } else if (this.mat.uniforms?.pSun) { this.mat.uniforms.pSun.value.z = 0; this.view.shaftsAt = null; }
    if (this.stars) this.stars.material.opacity = this.night * .9;
    if (this.light && this.sunLight) {
      this.sunLight.color.copy(this.sunCol); this.sunLight.intensity = this.base.sun * sunI;
      this.sunLight.aim?.(lightDir);   // a gs.hd sun() keeps the direction for follow() and fit()
      const tgt = this.sunLight.target?.position ?? new Vector3(), d = this.sunLight.position.distanceTo(tgt) || 10;
      this.sunLight.position.copy(tgt).addScaledVector(lightDir, d);
    }
    // clouds: lit by the sun's colour on top, the sky's own darker colour underneath
    if (this.cloudLight) this.cLit.copy(this.cloudLight); else this.cLit.copy(this.sunCol).lerp(C('#ffffff'), .55).multiplyScalar(.95 - this.night * .8);
    if (this.cloudDark) this.cDark.copy(this.cloudDark); else this.cDark.copy(this.horizon).lerp(this.top, .35).multiplyScalar(.62);
    const cu = this.mat.uniforms?.cloud;
    if (cu) cu.value.set(this.clouds, this.gap, (this.view.t ?? this.t) * 6 / 620 * .2, this.flash);
    const air = this.view._air;
    if (air) {
      air.sun = (air.sun || new Vector3()).copy(lightDir);
      air.clouds = this.clouds;
      if (this.fog) { air.colour.copy(this.horizon).lerp(this.top, .12); (air.sunColour ||= C('#fff')).copy(this.horizon).lerp(this.sunCol, .45).multiplyScalar(1.1); }
    }
    if (this.light && this.hemi) { this.hemi.intensity = this.base.amb * amb; this.hemi.color.copy(this.top).lerp(C('#ffffff'), .5); }
    const s = this.view.scene;
    if (this.fog && s.fog) s.fog.color.copy(this.horizon);
    if (s.background?.isColor) s.background.copy(this.horizon);
    return this;
  }
  // the colours from the air as WebGPU draws it (Hillaire's sums, atmosphere.js; the dome reads the same air's picture):
  // overhead, round the horizon, the sun's own colour and how bright the sky is next to the sun
  hillaire(a, b, k) {
    const L = luts(airOf(this.phys)), s = this.sunDir, K = SKY_K * (this.phys.bright ?? .55), h = Math.max(.0005, (this.view.cam?.position.y ?? 0) / 1000), o = [0, 0, 0], d = new Vector3();
    // (worked out again only when the sun, the camera's height or the air has changed: kept, they are copied back each time)
    const key = L.A.key + K + '|' + s.x.toFixed(4) + s.y.toFixed(4) + s.z.toFixed(4) + '|' + h.toFixed(3) + '|' + this.night.toFixed(3), H = this._hl ||= { key: '', top: C('#000'), horizon: C('#000'), sunCol: C('#fff'), shafts: null };
    if (H.key === key) { this.top.copy(H.top); this.horizon.copy(H.horizon); this.sunCol.copy(H.sunCol); this.view.shaftsAt = H.shafts; return; }
    const put = (c, v) => c.setRGB(v[0] * K, v[1] * K, v[2] * K);
    put(this.top, skyLight(L, d.set(0, 1, 0), s, h, o));
    this.horizon.setRGB(0, 0, 0); const tmp = C('#000');
    for (let i = 0; i < 8; i++) { const an = i / 8 * Math.PI * 2; this.horizon.add(put(tmp, skyLight(L, d.set(Math.cos(an), .06, Math.sin(an)).normalize(), s, h, o))); }
    this.horizon.multiplyScalar(1 / 8);
    const m = Math.max(this.horizon.r, this.horizon.g, this.horizon.b, this.top.r, this.top.g, this.top.b); if (m > 1) { this.horizon.multiplyScalar(1 / m); this.top.multiplyScalar(1 / m); }
    if (this.night > 0) { this.top.lerp(C(a.top).lerp(C(b.top), k), this.night); this.horizon.lerp(C(a.horizon).lerp(C(b.horizon), k), this.night); }
    const t = transmittance(L, RG + h, Math.max(-1, Math.min(1, s.y)), o), tm = Math.max(t[0], t[1], t[2], 1e-6);
    this.sunCol.setRGB(t[0] / tm, t[1] / tm, t[2] / tm); if (this.night > .5) this.sunCol.set(a.sun).lerp(C(b.sun), k);
    const side = d.set(-s.z, 0, s.x); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
    const n = skyLight(L, side.multiplyScalar(.0698).addScaledVector(s, .9976).normalize(), s, h, o), ol = Math.max(n[0], n[1], n[2]) * K, kn = ol > 1 ? (1 + (ol - 1) / (1 + (ol - 1) / 1.5)) / ol : 1;
    this.view.shaftsAt = this.night > .5 ? null : (.2126 * n[0] + .7152 * n[1] + .0722 * n[2]) * K * kn;
    H.key = key; H.top.copy(this.top); H.horizon.copy(this.horizon); H.sunCol.copy(this.sunCol); H.shafts = this.view.shaftsAt;
  }
  dispose() { if (this.view._sky === this) this.view._sky = null; this.gpu?.dispose(); if (this.phys) this.view.shaftsAt = null; if (this.envMaker && this.view.envMaker === this.envMaker) this.view.envMaker = null; this.dome.removeFromParent(); this.dome.geometry?.dispose(); this.mat.dispose(); this.stars?.removeFromParent(); this.stars?.geometry.dispose(); }
}

/**
 * Rain, snow and storms round the camera. kind: 'rain' | 'snow' | 'storm' | 'clear'; amount 0..1.
 * area: the box of weather round the camera (default fits the view's units). wind: [x, z] push, or a
 * gs.outdoors Wind (followed as it changes).
 * Storms flash lightning every few seconds: set onFlash(far) (far 0..1) for thunder. Reduce motion
 * turns flashes down.
 *
 * Weather that changes the world: give it the level and it works out what the sky can see (weather.cover).
 * level: a gs.physics3d World3D, a City, Voxels, a function, meshes, or a list of those (as for
 * gs.sound.Ears); ground: (x, z) => the land's height (land.height); level: true says all of it lies under
 * the open sky. Then rain and snow stop at roofs, what is open to the sky gets wet as it rains (soak:
 * seconds of full rain to wet it through, 20) and dries after (dry: seconds, 90), puddles gather on flat
 * ground and dry last, and snow settles (settle: seconds of full snow to cover the ground, 40) and melts
 * (melt: 150; rain melts it faster). The floor of a house stays dry and bare. weather.wet, .pools and
 * .snow (0..1) are yours to read, or to set for a level that starts wet or white; wetAt(p) and snowAt(p)
 * answer for one spot. water: a gs.outdoors.Water (or a list) the rain should fall on too. In a Next Gen
 * view the look is part of its air (view.air()), so make the weather with the level, before the first frame.
 */
export class Weather {
  constructor(view, { kind = 'rain', amount = 1, area, wind = [0, 0], max = 900, color, flake, level = null, ground = null, cover = null, water = null, soak = 20, dry = 90, settle = 40, melt = 150, deep = .25, hops = 96 } = {}) {
    this.view = view; this.wind = wind; this.max = max; this.area = area ?? Math.min(radiusOf(view.cam) * .35, (view.cam?.far ?? 100) > 1000 ? 400 : 30);
    this.flashLeft = 0; this.nextFlash = 3 + Math.random() * 5; this.flashI = 0; this.onFlash = null; this.t = 0;
    this.off = new Float32Array(max * 3); for (let i = 0; i < this.off.length; i++) this.off[i] = Math.random();
    // rain: a thin streak for each drop, turned to face the camera and kept about two of the 3D's pixels wide however far off it
    // falls (a line is one pixel on any screen: on a phone's sharp screen, drawn smaller and built up over frames by the upscaler,
    // a storm of them all but vanished)
    const g = new BufferGeometry(), I = max * 4 > 65535 ? new Uint32Array(max * 6) : new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) I.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
    g.setAttribute('position', new BufferAttribute(new Float32Array(max * 12), 3)); g.setIndex(new BufferAttribute(I, 1));
    this.rainMesh = new Mesh(g, new MeshBasicMaterial({ color: color ?? '#a8c0e0', transparent: true, opacity: .55, depthWrite: false, side: DoubleSide }));
    const pg = new BufferGeometry(); pg.setAttribute('position', new BufferAttribute(new Float32Array(max * 3), 3));
    this.snowMesh = new Points(pg, new PointsMaterial({ color: color ?? '#ffffff', size: flake ?? (level || ground || cover ? Math.min(.07, this.area * .012) : this.area * .012), transparent: true, opacity: .9, depthWrite: false }));
    for (const m of [this.rainMesh, this.snowMesh]) { m.frustumCulled = false; m.renderOrder = 5; if (isToon(view)) m.layers.set(1); view.scene.add(m); }
    this.hemiBase = view.hemi?.intensity ?? 1;
    // the world it changes: what the sky can see, and how wet and how white that is
    this.world = !!(level || ground || cover);
    this.ownCover = !cover?.at; this.cover = cover?.at ? cover : (level && level !== true) || ground || cover ? new Cover({ level, ground, ...(cover || {}) }) : null;   // (cover: one of your own to share, or its settings)
    Object.assign(this, { soak, dry, settle, melt, deep }); this.wet = 0; this.pools = 0; this.snow = 0; this.rain = 0; this.snowing = 0;
    this.waters = water ? [].concat(water) : [];
    this.air = this.world && typeof view.air === 'function' && !isToon(view) ? view.air() : null;
    this.shown = { wet: 0, snow: 0, pools: 0, cover: this.cover };   // (what the view's air draws: hd3d.js airUniforms)
    if (this.air) this.air.world = this.shown;
    this.hops = this.air && hops > 0 ? new Spray(hops, color ?? '#dfe9f2') : null; this.seed = 9151;
    if (this.hops) { view.scene.add(this.hops.mesh); this.floor = (x, z) => this.landAt(x, z); }
    this.set(kind, amount);
  }
  set(kind, amount = this.amount ?? 1) {
    this.kind = kind; this.amount = Math.max(0, Math.min(1, amount));
    this.rainMesh.visible = kind === 'rain' || kind === 'storm'; this.snowMesh.visible = kind === 'snow';
    return this;
  }
  /** Lightning now. */
  flash() {
    const far = Math.random(); this.flashLeft = .35; this.flashI = (1 - far * .6) * prefs.motion;
    this.onFlash?.(far); return this;
  }
  update(dt) {
    this.t += dt; const cam = this.view.cam, A = this.area, n = Math.floor(this.max * this.amount);
    const cx = cam?.position.x ?? 0, cy = cam?.position.y ?? 0, cz = cam?.position.z ?? 0, W = this.wind, wx = W.x ?? W[0] ?? 0, wz = W.z ?? W[1] ?? 0, o = this.off;
    this.rain = this.rainMesh.visible ? this.amount : 0; this.snowing = this.snowMesh.visible ? this.amount : 0;
    if (this.world) this.soakIn(dt, cx, cy, cz);
    const cv = this.cover;
    if (this.rainMesh.visible) {
      const p = this.rainMesh.geometry.attributes.position, a = p.array, fall = A * 1.6, len = A * .03;
      // (how wide a pixel of the 3D is a metre off, so each streak can be about two of them wide where it is)
      const px = 2 * Math.tan(((cam?.fov ?? 60) * Math.PI / 180) / 2) / Math.max(1, HD.info.rh || this.view.renderer?.domElement?.height || 720) / ((cam?.zoom) || 1);
      const ft = this.t * fall / A, fx = wx * this.t / A, fz = wz * this.t / A, fr = v => v - Math.floor(v);   // (fr: the part after the point, also below 0)
      for (let i = 0; i < n; i++) {
        const k = i * 3, y = fr(o[k + 1] - ft * (.8 + o[k] * .4)), j = i * 12;
        const x = cx + (fr(o[k] + fx) - .5) * A, z = cz + (fr(o[k + 2] + fz) - .5) * A, yy = cy + (y - .5) * A;
        if (cv && yy < cv.at(x, z)) { for (let q = 0; q < 12; q += 3) { a[j + q] = x; a[j + q + 1] = yy; a[j + q + 2] = z; } continue; }   // (under a roof: no drop)
        // across it, square to the way the camera sees it: half its width either side (by how far it passes from the camera, not
        // how far its end is: a streak that falls past the eye stays two pixels wide where it is nearest, and thinner further up and down)
        const dx = x - cx, dz = z - cz, hh = dx * dx + dz * dz, h = Math.sqrt(hh) || 1, w = Math.max(1e-5, Math.sqrt(hh) * px), sx = dz / h * w, sz = -dx / h * w, tx = x - wx * .02, tz = z - wz * .02;
        a[j] = x - sx; a[j + 1] = yy; a[j + 2] = z - sz; a[j + 3] = x + sx; a[j + 4] = yy; a[j + 5] = z + sz;
        a[j + 6] = tx - sx; a[j + 7] = yy + len; a[j + 8] = tz - sz; a[j + 9] = tx + sx; a[j + 10] = yy + len; a[j + 11] = tz + sz;
      }
      p.needsUpdate = true; this.rainMesh.geometry.setDrawRange(0, n * 6);
    }
    if (this.snowMesh.visible) {
      const p = this.snowMesh.geometry.attributes.position, a = p.array, fall = A * .12;
      for (let i = 0; i < n; i++) {
        const k = i * 3, y = (((o[k + 1] - this.t * fall / A * (.7 + o[k] * .6)) % 1) + 1) % 1, sway = Math.sin(this.t * 1.3 + i) * .02;
        a[k] = cx + (((o[k] + sway + wx * this.t / A) % 1 + 1) % 1 - .5) * A; a[k + 1] = cy + (y - .5) * A; a[k + 2] = cz + (((o[k + 2] + wz * this.t / A) % 1 + 1) % 1 - .5) * A;
        if (cv && a[k + 1] < cv.at(a[k], a[k + 2])) a[k + 1] = cy - A * 4;   // (under a roof: no flake; out of sight below)
      }
      p.needsUpdate = true; this.snowMesh.geometry.setDrawRange(0, n);
    }
    if (this.kind === 'storm') { this.nextFlash -= dt; if (this.nextFlash <= 0) { this.flash(); this.nextFlash = 4 + Math.random() * 7 / Math.max(.3, this.amount); } }
    const h = this.view.hemi;
    if (this.flashLeft > 0) {
      this.flashLeft -= dt; const on = this.flashLeft > .25 || (this.flashLeft > .08 && this.flashLeft < .16);
      if (h) { if (!this.lit) this.hemiBase = h.intensity; h.intensity = this.hemiBase * (on ? 1 + 4 * this.flashI : 1); this.lit = true; }
    } else if (this.lit && h) { h.intensity = this.hemiBase; this.lit = false; }
    return this;
  }
  // The world under the weather: how wet it is, how much lies in puddles, how much snow has settled; the map of
  // what the sky can see follows the camera; rain hops off the ground near it.
  soakIn(dt, cx, cy, cz) {
    const rain = this.rain, snowing = this.snowing, up = (v, by) => Math.min(1, v + by), down = (v, by) => Math.max(0, v - by);
    if (snowing > 0) this.snow = up(this.snow, dt / this.settle * snowing);
    else if (this.snow > 0) { const by = dt / this.melt * (1 + rain * 5); this.snow = down(this.snow, by); this.wet = up(this.wet, by * 6); }   // (melting snow is wet ground)
    if (rain > 0) { this.wet = up(this.wet, dt / this.soak * rain); if (this.wet > .5) this.pools = up(this.pools, dt / (this.soak * 2) * rain); }
    else { if (!(this.snow > 0)) this.wet = down(this.wet, dt / this.dry); this.pools = down(this.pools, dt / (this.dry * 1.6)); }
    const cv = this.cover; if (cv) cv.place(cx, cy, cz).update();
    const S = this.shown; S.wet = this.wet; S.snow = this.snow; S.pools = this.pools; S.cover = cv;
    for (const w of this.waters) w.rain = rain;
    const h = this.hops;
    if (h) {
      if (rain > 0 && dt > 0) {
        const R = () => (this.seed = (this.seed * 16807) % 2147483647) / 2147483647, q = rain * dt * 150, k = Math.floor(q) + (R() < q % 1 ? 1 : 0);
        for (let i = 0; i < k; i++) {
          const a = R() * 6.2832, d = Math.pow(R(), .7) * 9, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = this.landAt(x, z);
          if (y > -Infinity) h.add(x, y + .01, z, (R() - .5) * .5, .8 + R() * 1.1, (R() - .5) * .5, .012 + R() * .012);
        }
      }
      h.update(dt, this.floor);
    }
  }
  // where a drop lands at x, z: the highest thing there, or the water over it (-Infinity: not known)
  landAt(x, z) { let y = this.cover ? this.cover.at(x, z) : -Infinity; for (const w of this.waters) { const wy = w.height(x, z); if (wy > y) y = wy; } return y; }
  /** Can the sky see this point (is nothing over it)? Always true with no level. */
  open(p) { return this.cover ? this.cover.open(p.x, p.y, p.z) : true; }
  /** How wet a spot is now, 0..1: nothing under a roof. */
  wetAt(p) { return this.open(p) ? this.wet : 0; }
  /** How deep the snow lies at a spot, in metres (`deep`, .25, when it has all settled): nothing under a roof. */
  snowAt(p) { return this.open(p) ? this.snow * this.deep : 0; }
  /** True for a moment during a lightning flash (to brighten your own sky or flash the screen). */
  get flashing() { return this.flashLeft > 0; }
  dispose() {
    for (const m of [this.rainMesh, this.snowMesh]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
    if (this.hops) { this.hops.mesh.removeFromParent(); this.hops.mesh.geometry.dispose(); this.hops.mesh.material.dispose(); }
    if (this.air?.world === this.shown) this.air.world = null;
    if (this.cover && this.ownCover) this.cover.dispose();
    for (const w of this.waters) w.rain = 0;
  }
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(Sky.prototype, 'update', 'sky and weather');
timed(Weather.prototype, 'update', 'sky and weather');
