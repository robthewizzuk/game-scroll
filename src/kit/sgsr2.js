// Snapdragon Game Super Resolution 2 (SGSR 2), by Qualcomm: temporal upscaling. Each frame the camera
// is nudged by a fraction of a pixel (a Halton pattern), and the upscale pass blends the new small
// picture into the full-size picture of the frames before, moved to where things are now. Over a few
// frames that gives a sharper, steadier picture than one frame can (SGSR 1), with smoother edges.
// Used by Next Gen (hd3d.js) when the 3D is drawn below the screen's size; AR, screen-space
// reflections keep SGSR 1 or a plain stretch.
//
// Ported to WebGL 2 from sgsr/v2/include/glsl_2_pass_fs (sgsr2_convert.fs, sgsr2_upscale.fs) in
// github.com/SnapdragonStudios/snapdragon-gsr. Changes: textureGather (not in WebGL 2) is done with
// four texelFetch reads; there is no motion vector buffer, so every pixel's motion comes from its depth
// and the camera's move (the shader's own fallback); depth is WebGL's 0..1, turned into -1..1 for the
// reprojection; texelFetch reads are clamped to the picture; it reads three.js's vUv; the output's
// alpha is ours (below). (The WebGPU version is hd3d-gpu.js sgsr2Gpu, written in TSL from the same two
// passes, with per-pixel motion.)
//
// Two changes of ours to the upscale pass, the same as the WebGPU version's and each kept because it
// measured better (scripts/upscale-compare.cjs); S2_TUNED off is Qualcomm's shader as it was:
// - the history is read sharply (Catmull-Rom in 5 reads) where the shader read it bilinearly. It is read
//   again every frame the camera moves, and bilinear softens it a little each time
// - a pixel that stays put settles: how long it has been left alone is kept in the history's alpha and
//   makes the history count for more there, up to S2_HOLD times, so a still picture shimmers less on
//   thin things and edges. Anything that moves, or a cut, starts from the usual again
//
// ---------------------------------------------------------------------------------------------------
// Copyright (c) 2024, Qualcomm Innovation Center, Inc. All rights reserved.
//
// Redistribution and use in source and binary forms, with or without modification, are permitted
// provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this list of conditions
//    and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice, this list of
//    conditions and the following disclaimer in the documentation and/or other materials provided
//    with the distribution.
// 3. Neither the name of the copyright holder nor the names of its contributors may be used to
//    endorse or promote products derived from this software without specific prior written
//    permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
// IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
// FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
// CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
// DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
// IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
// OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
// SPDX-License-Identifier: BSD-3-Clause
// ---------------------------------------------------------------------------------------------------

import { ShaderMaterial, WebGLRenderTarget, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, Vector2, Matrix4, RedFormat, NearestFilter, Vector4 } from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { netText } from './gssr-net.js';

/** How many times more the history counts for in a pixel that has settled (both versions). */
export const S2_HOLD = 4;
// FSR 3.1's tricks as switches (HD.sgsrFsr, tests): [depth clip: 0 SGSR 2's, 1 the larger of it and disocclusion,
// 2 disocclusion alone; locks 0/1; disocclusion from each pixel's own depth 1 or the nearest round it 0; settling
// undone where uncovered 0/1; shading change: how strongly (0 off); flicker hold 0/1; the flicker hold only where
// the pixel has settled 0/1]
export const FSR_X = [0, 1, 0, 0, 0, 1, 1];

const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Convert: per low-res pixel, the motion back to last frame (from depth and the camera's move) and how
// much the depth jumps around it (depth clip: history is less trusted at edges in depth).
const CONVERT = /* glsl */`
  precision highp float;
  precision highp int;
  uniform highp sampler2D InputDepth, PrevDepth;
  uniform mat4 clipToPrevClip;
  uniform vec2 renderSize, renderSizeRcp, cameraNF, jitterMove;
  uniform float cameraFovAngleHor, orthoCam;
  uniform vec4 fsrX;
  varying vec2 vUv;
  // a depth (0..1) as a distance from the camera
  float dist(float d) {
    float n = cameraNF.x, f = cameraNF.y;
    return orthoCam > 0.5 ? n + d * (f - n) : n * f / (f - d * (f - n));
  }

  // textureGather(InputDepth, coord, 0) with four texelFetch reads
  vec4 gatherD(vec2 coord) {
    ivec2 size = ivec2(renderSize), hi = size - 1;
    ivec2 p = ivec2(floor(coord * renderSize - 0.5));
    ivec2 p00 = clamp(p, ivec2(0), hi), p11 = clamp(p + 1, ivec2(0), hi);
    return vec4(texelFetch(InputDepth, ivec2(p00.x, p11.y), 0).r, texelFetch(InputDepth, p11, 0).r,
                texelFetch(InputDepth, ivec2(p11.x, p00.y), 0).r, texelFetch(InputDepth, p00, 0).r);
  }

  void main() {
    vec2 texCoord = vUv;
    vec2 gatherCoord = texCoord - vec2(0.5) * renderSizeRcp;
    vec4 btmLeft = gatherD(gatherCoord);
    vec4 btmRight = gatherD(gatherCoord + vec2(renderSizeRcp.x * 2.0, 0.0));
    vec4 topLeft = gatherD(gatherCoord + vec2(0.0, renderSizeRcp.y * 2.0));
    vec4 topRight = gatherD(gatherCoord + renderSizeRcp * 2.0);
    float maxC = min(min(min(btmLeft.z, btmRight.w), topLeft.y), topRight.x);
    float btmLeft4 = min(min(min(btmLeft.y, btmLeft.x), btmLeft.z), btmLeft.w);
    float btmLeftMax9 = min(topLeft.x, min(min(maxC, btmLeft4), btmRight.x));

    float depthclip = 0.0;
    if (maxC < 1.0 - 1.0e-05) {
      float btmRight4 = min(min(min(btmRight.y, btmRight.x), btmRight.z), btmRight.w);
      float topLeft4 = min(min(min(topLeft.y, topLeft.x), topLeft.z), topLeft.w);
      float topRight4 = min(min(min(topRight.y, topRight.x), topRight.z), topRight.w);
      float Wdepth = 0.0;
      float Ksep_Kfov_diagonal = 1.37e-05 * cameraFovAngleHor * length(renderSize);
      float Depthsep = Ksep_Kfov_diagonal * (1.0 - maxC);
      const float EPSILON = 1.19e-07;
      Wdepth += clamp(Depthsep / (abs(maxC - btmLeft4) + EPSILON), 0.0, 1.0);
      Wdepth += clamp(Depthsep / (abs(maxC - btmRight4) + EPSILON), 0.0, 1.0);
      Wdepth += clamp(Depthsep / (abs(maxC - topLeft4) + EPSILON), 0.0, 1.0);
      Wdepth += clamp(Depthsep / (abs(maxC - topRight4) + EPSILON), 0.0, 1.0);
      depthclip = clamp(1.0 - Wdepth * 0.25, 0.0, 1.0);
    }

    // no motion vectors: reproject the nearest depth with the camera's move
    vec2 ScreenPos = 2.0 * texCoord - 1.0;
    vec4 PreClip = clipToPrevClip * vec4(ScreenPos, btmLeftMax9 * 2.0 - 1.0, 1.0);
    vec2 motion = ScreenPos - PreClip.xy / PreClip.w;

    // disocclusion (FSR 3.1's, as hd3d-gpu.js sgsr2Gpu: from last frame's own depth): where last frame had
    // something nearer at the place this pixel came from, this surface was hidden behind it then
    // (this pixel's own depth, or the nearest in the 3 x 3 round it)
    ivec2 P0 = ivec2(gl_FragCoord.xy), hiP = ivec2(renderSize) - 1;
    float own = texelFetch(InputDepth, P0, 0).r, nz = own;
    for (int i = 0; i < 9; i++) nz = min(nz, texelFetch(InputDepth, clamp(P0 + ivec2(i - (i / 3) * 3 - 1, i / 3 - 1), ivec2(0), hiP), 0).r);
    vec4 PreOwn = clipToPrevClip * vec4(ScreenPos, (fsrX.z > 0.5 ? own : nz) * 2.0 - 1.0, 1.0);
    float want = dist(clamp(PreOwn.z / PreOwn.w * 0.5 + 0.5, 0.0, 1.0));
    // (last frame's pixels were drawn a jitter step apart from this frame's: read them where this one's point fell)
    vec2 pp = (texCoord - 0.5 * motion) * renderSize - 0.5 + jitterMove;
    ivec2 b0 = ivec2(floor(pp)); vec2 fr = pp - floor(pp);
    float K = 1.37e-05 * length(renderSize * 0.5);
    bool nearer = true; float acc = 0.0, ws = 0.0;
    for (int i = 0; i < 4; i++) {
      ivec2 o = ivec2(i - (i / 2) * 2, i / 2), q = b0 + o;
      float w = (o.x == 1 ? fr.x : 1.0 - fr.x) * (o.y == 1 ? fr.y : 1.0 - fr.y);
      if (w <= 1.0e-3 || any(lessThan(q, ivec2(0))) || any(greaterThanEqual(q, ivec2(renderSize)))) continue;
      float was = texelFetch(PrevDepth, q, 0).r, diff = want - was;
      if (diff <= 1.0e-6) nearer = false;
      acc += clamp(K * max(want, was) / max(diff, 1.0e-6), 0.0, 1.0) * w; ws += w;
    }
    float dis = (nearer && ws > 0.0) ? clamp(1.0 - acc / ws, 0.0, 1.0) : 0.0;
    float df = fsrX.x < 0.5 ? depthclip : fsrX.x < 1.5 ? max(depthclip, dis) : dis;
    gl_FragColor = vec4(motion, df, 0.0);
  }`;

// this frame's depth as distances, kept for the next frame's disocclusion
const DEPTHLIN = /* glsl */`
  precision highp float;
  uniform highp sampler2D InputDepth;
  uniform vec2 cameraNF;
  uniform float orthoCam;
  // a depth (0..1) as a distance from the camera
  float dist(float d) {
    float n = cameraNF.x, f = cameraNF.y;
    return orthoCam > 0.5 ? n + d * (f - n) : n * f / (f - d * (f - n));
  }
  void main() { gl_FragColor = vec4(dist(texelFetch(InputDepth, ivec2(gl_FragCoord.xy), 0).r), 0.0, 0.0, 1.0); }`;

// FSR 3.1's shading change and luma instability (ffx_fsr3upscaler_shading_change_pyramid.h,
// ffx_fsr3upscaler_luma_instability.h), as hd3d-gpu.js sgsr2Gpu, at the render size from the finished small
// picture. Where each small pixel came from last frame (its motion, and last frame's pixels a jitter step apart),
// whether it is on the picture, and how fast it moves (in pixels of a 4K screen)
const CAMEFROM = /* glsl */`
  precision highp float;
  precision highp int;
  uniform highp sampler2D InputColor, MotionDepthClipAlphaBuffer, LumHist;
  uniform vec2 renderSize, jitterMove;
  uniform float reset;
  float lumOf(vec3 c) { return max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1.0e-4); }
  vec4 cameFrom(ivec2 P, vec2 M) {
    vec2 pu = (vec2(P) + 0.5) / renderSize - 0.5 * M;
    bool on = all(greaterThanEqual(pu, vec2(0.0))) && all(lessThanEqual(pu, vec2(1.0))) && reset < 0.5;
    return vec4(pu * renderSize + jitterMove, on ? 1.0 : 0.0, length(M * 0.5 * vec2(3840.0, 2160.0)));
  }`;
// this frame's brightness, then last frame's three (read where this pixel came from)
const LUMHIST = CAMEFROM + /* glsl */`
  void main() {
    ivec2 P = ivec2(gl_FragCoord.xy);
    vec4 cf = cameFrom(P, texelFetch(MotionDepthClipAlphaBuffer, P, 0).xy);
    vec4 h = texture(LumHist, cf.xy / renderSize) * cf.z;
    gl_FragColor = vec4(lumOf(texelFetch(InputColor, P, 0).rgb), h.xyz);
  }`;
// the change in brightness (the smallest difference between this frame's five pixels round here and last frame's
// five round where it came from: a pixel stepping by a jitter step matches a neighbour, so no change) and its sign,
// read as a patch's average from the smaller copies; and whether it flickers (brighter, then darker, then brighter
// again: it matches one of the three frames before last better than last frame's, on the same side)
const CHANGES = CAMEFROM + /* glsl */`
  float rd(float a, float b) { return sign(a - b) * (1.0 - min(a, b) / max(a, b)); }
  float mdm(float a, float b) { return min(a, b) / max(max(a, b), 1.0e-6); }
  void main() {
    ivec2 P = ivec2(gl_FragCoord.xy), hi = ivec2(renderSize) - 1;
    vec4 m = texelFetch(MotionDepthClipAlphaBuffer, P, 0), cf = cameFrom(P, m.xy);
    ivec2 Q = ivec2(floor(cf.xy));
    ivec2 X[5] = ivec2[5](ivec2(0, 0), ivec2(-1, 0), ivec2(1, 0), ivec2(0, -1), ivec2(0, 1));
    float cur[5], was[5];
    for (int i = 0; i < 5; i++) {
      cur[i] = lumOf(texelFetch(InputColor, clamp(P + X[i], ivec2(0), hi), 0).rgb);
      was[i] = max(texelFetch(LumHist, clamp(Q + X[i], ivec2(0), hi), 0).x, 1.0e-4);
    }
    float best = rd(cur[0], was[0]);
    for (int i = 0; i < 5; i++) for (int j = 0; j < 5; j++) { float d = rd(cur[i], was[j]); if (abs(d) < abs(best)) best = d; }
    float diff = best * cf.z;
    // the flicker hold
    vec4 h = texture(LumHist, cf.xy / renderSize);
    float Lc = cur[0], s0 = mdm(Lc, h.x), d0 = Lc - h.x, ms = s0;
    if (sign(d0) == sign(Lc - h.y)) ms = max(ms, mdm(Lc, h.y));
    if (sign(d0) == sign(Lc - h.z)) ms = max(ms, mdm(Lc, h.z));
    if (sign(d0) == sign(Lc - h.w)) ms = max(ms, mdm(Lc, h.w));
    float inst = (ms > s0 && s0 < 1.0 && h.w > 0.0) ? 1.0 : 0.0;
    inst *= cf.z * (1.0 - clamp(cf.w / 20.0, 0.0, 1.0)) * (1.0 - m.z);
    gl_FragColor = vec4(diff, diff == 0.0 ? 0.0 : sign(diff), inst, 0.0);
  }`;

// Upscale: a Lanczos filter of the 5 nearest low-res pixels, a colour box from them, history clamped
// to that box, then blended.
const UPSCALE = /* glsl */`
  precision mediump float;
  precision highp int;
  uniform mediump sampler2D PrevOutput, MotionDepthClipAlphaBuffer, InputColor, LockHist;
  uniform highp sampler2D Changes;
  uniform highp vec2 renderSize, outputSize, renderSizeRcp, jitterOffset, scaleRatio;
  uniform highp float minLerpContribution, reset, lockDec;
  uniform highp vec4 fsrX, fsrY;
  varying highp vec2 vUv;
  // the second picture: each pixel's lock (FSR 3.1's: a thin thing found here stays held)
  layout(location = 1) out highp vec4 gsLock;
  float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

  float FastLanczos(float base) { float y = base - 1.0; float y2 = y * y; float y_temp = 0.75 * y + y2; return y_temp * y2; }
  #ifdef S2_TUNED
  // the history read sharply: Catmull-Rom in 5 reads (the middle 2 x 2 in one, and the four edges)
  vec4 sharpHistory(highp vec2 uv) {
    highp vec2 ts = outputSize, P = uv * ts, c = floor(P - 0.5) + 0.5, f = P - c, f2 = f * f, f3 = f2 * f;
    highp vec2 w0 = -0.5 * f3 + f2 - 0.5 * f, w1 = 1.5 * f3 - 2.5 * f2 + 1.0, w2 = -1.5 * f3 + 2.0 * f2 + 0.5 * f, w3 = 0.5 * f3 - 0.5 * f2;
    highp vec2 w12 = w1 + w2, t12 = (c + w2 / w12) / ts, t0 = (c - 1.0) / ts, t3 = (c + 2.0) / ts;
    highp float a = w12.x * w0.y, b = w0.x * w12.y, m = w12.x * w12.y, d = w3.x * w12.y, e = w12.x * w3.y;
    highp vec4 sum = textureLod(PrevOutput, vec2(t12.x, t0.y), 0.0) * a + textureLod(PrevOutput, vec2(t0.x, t12.y), 0.0) * b
      + textureLod(PrevOutput, t12, 0.0) * m + textureLod(PrevOutput, vec2(t3.x, t12.y), 0.0) * d + textureLod(PrevOutput, vec2(t12.x, t3.y), 0.0) * e;
    return max(sum / (a + b + m + d + e), vec4(0.0));
  }
  #endif
  vec3 fetch(ivec2 p) { return texelFetch(InputColor, clamp(p, ivec2(0), ivec2(renderSize) - 1), 0).xyz; }

  vec4 Upsampledcw; vec3 rectboxcenter, rectboxvar, rectboxmin, rectboxmax; float rectboxweight;
  void tap(vec3 samplecolor, vec2 baseoffset, float kernelbias2, float curvebias, bool first) {
    float baseoffset_dot = dot(baseoffset, baseoffset);
    float base = clamp(baseoffset_dot * kernelbias2, 0.0, 1.0);
    float weight = FastLanczos(base);
    Upsampledcw += vec4(samplecolor * weight, weight);
    float boxweight = exp(baseoffset_dot * curvebias);
    if (first) { rectboxmin = samplecolor; rectboxmax = samplecolor; }
    else { rectboxmin = min(rectboxmin, samplecolor); rectboxmax = max(rectboxmax, samplecolor); }
    vec3 wsample = samplecolor * boxweight;
    rectboxcenter += wsample;
    rectboxvar += samplecolor * wsample;
    rectboxweight += boxweight;
  }

  void main() {
    float Biasmax_viewportXScale = scaleRatio.x;
    float scalefactor = scaleRatio.y;
    highp vec2 Hruv = vUv;
    highp vec2 Jitteruv = clamp(Hruv + jitterOffset * renderSizeRcp, 0.0, 1.0);
    highp ivec2 InputPos = ivec2(Jitteruv * renderSize);

    highp vec3 mda = textureLod(MotionDepthClipAlphaBuffer, Jitteruv, 0.0).xyz;
    highp vec2 Motion = mda.xy;
    highp vec2 PrevUV = clamp(-0.5 * Motion + Hruv, 0.0, 1.0);
    // shading change (FSR 3.1's): where a patch of the picture as a whole grew brighter or darker since last frame
    // (a shadow or a light moving over it), the most of three patch sizes; counted as somewhere uncovered
    float shc = 0.0;
    for (int k = 1; k <= 3; k++) { vec2 v = textureLod(Changes, Jitteruv, float(k)).xy; shc = max(shc, abs(v.x * v.y)); }
    float depthfactor = max(mda.z, clamp(shc * fsrY.x, 0.0, 1.0));
    float inst = textureLod(Changes, Jitteruv, 0.0).z * fsrY.y * (1.0 - depthfactor);
    #ifdef S2_TUNED
    vec4 History = sharpHistory(PrevUV);
    #else
    vec4 History = textureLod(PrevOutput, PrevUV, 0.0);
    #endif
    vec3 HistoryColor = History.xyz, hc0 = History.xyz;
    // locks (FSR 3.1's, as hd3d-gpu.js sgsr2Gpu): last frame's, worn off where something uncovered the place
    float lockc = 0.0, lockOut = 0.0, lheld = 0.0;
    #ifdef S2_TUNED
    highp vec2 pu = -0.5 * Motion + Hruv;
    bool inside = all(greaterThanEqual(pu, vec2(0.0))) && all(lessThanEqual(pu, vec2(1.0)));
    float lwas = (inside && reset < 0.5) ? textureLod(LockHist, PrevUV, 0.0).r : 0.0;
    lheld = max(lwas - depthfactor * 2.0, 0.0);
    // (the flicker hold only where the pixel has settled, as FSR's only where it has gathered a few frames)
    lockc = max(clamp(lheld - 1.0, 0.0, 1.0) * fsrX.y, inst * (fsrY.z > 0.5 ? smoothstep(0.25, 0.5, History.w) : 1.0));
    #endif

    Upsampledcw = vec4(0.0);
    float biasmax = Biasmax_viewportXScale;
    float biasmin = max(1.0, 0.3 + 0.3 * biasmax);
    float biasfactor = 0.25 * depthfactor;
    float kernelbias = mix(biasmax, biasmin, biasfactor);
    float motion_viewport_len = length(Motion * outputSize);
    float curvebias = mix(-2.0, -3.0, clamp(motion_viewport_len * 0.02, 0.0, 1.0));

    rectboxcenter = vec3(0.0); rectboxvar = vec3(0.0); rectboxweight = 0.0;
    highp vec2 srcpos = vec2(InputPos) + vec2(0.5) - jitterOffset;
    kernelbias *= 0.5;
    float kernelbias2 = kernelbias * kernelbias;
    vec2 srcpos_srcOutputPos = srcpos - Hruv * renderSize;
    tap(fetch(InputPos + ivec2(0, 1)), srcpos_srcOutputPos + vec2(0.0, 1.0), kernelbias2, curvebias, true);
    tap(fetch(InputPos + ivec2(1, 0)), srcpos_srcOutputPos + vec2(1.0, 0.0), kernelbias2, curvebias, false);
    tap(fetch(InputPos + ivec2(-1, 0)), srcpos_srcOutputPos + vec2(-1.0, 0.0), kernelbias2, curvebias, false);
    tap(fetch(InputPos), srcpos_srcOutputPos, kernelbias2, curvebias, false);
    tap(fetch(InputPos + ivec2(0, -1)), srcpos_srcOutputPos + vec2(0.0, -1.0), kernelbias2, curvebias, false);

    #ifdef S2_TUNED
    {
      // a thin thing (a ridge in brightness one small pixel wide: FSR 3.1's ComputeThinFeatureConfidence) gains a
      // lock on the screen pixel this frame's small pixel landed in
      float Y[9];
      Y[0] = lum(fetch(InputPos)); Y[1] = lum(fetch(InputPos + ivec2(-1, -1))); Y[2] = lum(fetch(InputPos + ivec2(0, -1)));
      Y[3] = lum(fetch(InputPos + ivec2(1, -1))); Y[4] = lum(fetch(InputPos + ivec2(-1, 0))); Y[5] = lum(fetch(InputPos + ivec2(1, 0)));
      Y[6] = lum(fetch(InputPos + ivec2(-1, 1))); Y[7] = lum(fetch(InputPos + ivec2(0, 1))); Y[8] = lum(fetch(InputPos + ivec2(1, 1)));
      float lo = Y[0], hi = Y[0];
      for (int i = 1; i < 9; i++) { lo = min(lo, Y[i]); hi = max(hi, Y[i]); }
      float rng = max(hi - lo, 1.0e-6), dLo = 1.0e9, dHi = 0.0;
      bool sim[9]; sim[0] = true;
      for (int i = 1; i < 9; i++) { sim[i] = abs(Y[i] - Y[0]) / rng < 0.9; if (!sim[i]) { dLo = min(dLo, Y[i]); dHi = max(dHi, Y[i]); } }
      bool ridge = Y[0] > dHi || Y[0] < dLo;
      bool blob = (sim[1] && sim[2] && sim[4]) || (sim[2] && sim[3] && sim[5]) || (sim[4] && sim[6] && sim[7]) || (sim[5] && sim[7] && sim[8]);
      float thin = (ridge && !blob) ? 1.0 - lo / max(hi, 1.0e-6) : 0.0;
      bool here = all(lessThanEqual(abs(srcpos_srcOutputPos), 0.5 * renderSize / outputSize));
      lockOut = max(min(lheld + (here ? thin : 0.0), 2.0) - lockDec * (1.0 - depthfactor), 0.0) * fsrX.y;
    }
    #endif
    rectboxweight = 1.0 / rectboxweight;
    rectboxcenter *= rectboxweight;
    rectboxvar *= rectboxweight;
    rectboxvar = sqrt(abs(rectboxvar - rectboxcenter * rectboxcenter));

    Upsampledcw.xyz = clamp(Upsampledcw.xyz / Upsampledcw.w, rectboxmin - vec3(0.075), rectboxmax + vec3(0.075));
    Upsampledcw.w = Upsampledcw.w * (1.0 / 3.0);

    // how much more the history counts for where the pixel has settled (its alpha: 0 the usual .. 1 S2_HOLD
    // times); a pixel that moves (a tenth of a pixel is enough) is back to the usual
    #ifdef S2_TUNED
    float held = min(clamp(History.w, 0.0, 1.0) * (S2_HOLD - 1.0) + 1.0, mix(S2_HOLD, 1.0, clamp(motion_viewport_len * 10.0, 0.0, 1.0)));
    #else
    float held = 1.0;
    #endif
    float baseupdate = held * (1.0 - depthfactor);
    baseupdate = min(baseupdate, mix(baseupdate, Upsampledcw.w * 10.0, clamp(10.0 * motion_viewport_len, 0.0, 1.0)));
    baseupdate = min(baseupdate, mix(baseupdate, Upsampledcw.w, clamp(motion_viewport_len * 0.05, 0.0, 1.0)));
    float basealpha = baseupdate;

    const float EPSILON = 1.192e-07;
    float boxscale = max(depthfactor, clamp(motion_viewport_len * 0.05, 0.0, 1.0));
    float boxsize = mix(scalefactor, 1.0, boxscale);
    vec3 sboxvar = rectboxvar * boxsize;
    vec3 boxmin = rectboxcenter - sboxvar;
    vec3 boxmax = rectboxcenter + sboxvar;
    vec3 tapmin = rectboxmin, tapmax = rectboxmax;
    rectboxmax = min(rectboxmax, boxmax);
    rectboxmin = max(rectboxmin, boxmin);

    vec3 clampedcolor = clamp(HistoryColor, rectboxmin, rectboxmax);
    float startLerpValue = minLerpContribution;
    if ((abs(mda.x) + abs(mda.y)) > 0.000001) startLerpValue = 0.0;
    float lerpcontribution = (any(greaterThan(rectboxmin, HistoryColor)) || any(greaterThan(HistoryColor, rectboxmax))) ? max(startLerpValue, lockc) : 1.0;

    HistoryColor = mix(clampedcolor, HistoryColor, clamp(lerpcontribution, 0.0, 1.0));
    float basemin = min(basealpha, 0.1);
    basealpha = mix(basemin, basealpha, clamp(lerpcontribution, 0.0, 1.0));

    float alphasum = max(EPSILON, basealpha + Upsampledcw.w);
    float own = Upsampledcw.w / alphasum;
    float alpha = clamp(own + reset, 0.0, 1.0);
    // settles a little more each frame (by the new frame's weight, so only as fast as the picture gathers),
    // and starts again where the new frame was put in over the history (a cut)
    #ifdef S2_TUNED
    float settled = alpha > own + 1.0e-4 ? 0.0 : clamp((held + Upsampledcw.w - 1.0) / (S2_HOLD - 1.0), 0.0, 1.0);
    settled *= 1.0 - depthfactor * fsrX.w;
    #else
    float settled = 1.0;
    #endif
    #ifdef S2_NET
    // GSSR's learned blend (gssr-net.js): the network's seventeen inputs, the network, and its three corrections
    // (as hd3d-gpu.js s2Net; no see-through mask here)
    float spr = max(max(rectboxvar.x, rectboxvar.y), rectboxvar.z);
    vec3 gap = max(max(rectboxmin - hc0, hc0 - rectboxmax), vec3(0.0)); float outd = max(max(gap.x, gap.y), gap.z);
    vec3 dif = abs(hc0 - Upsampledcw.xyz); float difm = max(max(dif.x, dif.y), dif.z);
    float r6 = outd / (spr + 0.01), r7 = difm / (spr + 0.01);
    float x0 = log2(1.0 + min(motion_viewport_len, 1.0e4)) * 0.25, x1 = depthfactor, x2 = Upsampledcw.w, x3 = clamp(History.w, 0.0, 1.0), x4 = 0.0;
    float x5 = spr / (spr + 0.03), x6 = r6 / (1.0 + r6), x7 = r7 / (1.0 + r7), x8 = dot(Upsampledcw.xyz, vec3(0.2126, 0.7152, 0.0722));
    float x9 = scaleRatio.x - 1.0, x10 = clamp(own, 0.0, 1.0), x11 = startLerpValue;
    vec3 lk = vec3(0.2126, 0.7152, 0.0722); float cl = dot(rectboxcenter, lk);
    float r12 = (x8 - cl) / (spr + 0.01), r13 = (dot(hc0, lk) - cl) / (spr + 0.01), r15 = dot(tapmax - tapmin, lk) / (spr + 0.01);
    float x12 = r12 / (1.0 + abs(r12)), x13 = r13 / (1.0 + abs(r13)), x14 = dot(srcpos_srcOutputPos, srcpos_srcOutputPos), x15 = r15 / (1.0 + r15);
    float x16 = clamp(lockc, 0.0, 1.0);
S2_NET_BODY
    float kc = clamp(z2, -0.5, 1.0); vec3 cur = max(Upsampledcw.xyz + (rectboxcenter - Upsampledcw.xyz) * kc, vec3(0.0));
    float ownc = clamp(own, 0.001, 0.999), lc = clamp(lerpcontribution, 0.01, 0.99);
    float an = ownc / (ownc + (1.0 - ownc) * exp(-z0)), tn = lc / (lc + (1.0 - lc) * exp(-z1));
    float sv = clamp((held + Upsampledcw.w - 1.0) / (S2_HOLD - 1.0), 0.0, 1.0);
    settled = (alpha > own + 1.0e-4 || an > own + (1.0 - own) * 0.5 ? 0.0 : sv) * (1.0 - depthfactor * fsrX.w);
    gl_FragColor = vec4(mix(mix(clampedcolor, hc0, tn), cur, clamp(an + reset, 0.0, 1.0)), settled);
    #else
    gl_FragColor = vec4(mix(HistoryColor, Upsampledcw.xyz, alpha), settled);
    #endif
    gsLock = vec4(lockOut, 0.0, 0.0, 1.0);
  }`;

const COPY = /* glsl */`uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); }`;

const mat = (fragmentShader, uniforms, defines = {}) => new ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, defines, depthTest: false, depthWrite: false });
const rt = () => new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter });
// a history picture with a second one beside it, each pixel's lock
const histRT = () => { const t = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, count: 2 }); t.textures[1].format = RedFormat; return t; };
// last frame's depth, as distances
const depthRT = () => new WebGLRenderTarget(1, 1, { type: HalfFloatType, format: RedFormat, depthBuffer: false, minFilter: NearestFilter, magFilter: NearestFilter });
// how each small pixel changed since last frame, with smaller copies to read a patch's average
const changesRT = () => new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter });
const halton = (i, b) => { let f = 1, r = 0; for (; i > 0; i = Math.floor(i / b)) { f /= b; r += f * (i % b); } return r; };
const VP = new Matrix4(), INV = new Matrix4();

// Reads the depth of the composer's buffer straight after the scene is drawn (before any pass clears it).
class ConvertPass extends Pass {
  constructor(s) { super(); this.s = s; this.needsSwap = false; }
  render(r, writeBuffer, readBuffer) {
    const s = this.s; s.cu.InputDepth.value = readBuffer.depthTexture; s.cu.PrevDepth.value = s.pd[1 - s.pc].texture;
    s.quad.material = s.convert; r.setRenderTarget(s.mdc); s.quad.render(r);
    if (s.cu.fsrX.value.x > .5) { s.quad.material = s.depthLin; r.setRenderTarget(s.pd[s.pc]); s.quad.render(r); s.pc = 1 - s.pc; }   // (kept for the next frame's disocclusion, when it is on)
  }
}
// Upscales the finished small picture into the history, then shows it.
class UpscalePass extends Pass {
  constructor(s) { super(); this.s = s; this.needsSwap = false; }
  render(r, writeBuffer, readBuffer) {
    const s = this.s, u = s.uu, out = s.hist[s.cur];
    s.lu.InputColor.value = readBuffer.texture; s.lu.LumHist.value = s.lh[1 - s.lc].texture;
    s.quad.material = s.changes; r.setRenderTarget(s.sd); s.quad.render(r);
    s.quad.material = s.lumHist; r.setRenderTarget(s.lh[s.lc]); s.quad.render(r); s.lc = 1 - s.lc;
    u.Changes.value = s.sd.texture;
    u.InputColor.value = readBuffer.texture; u.PrevOutput.value = s.hist[1 - s.cur].texture; u.LockHist.value = s.hist[1 - s.cur].textures[1]; u.MotionDepthClipAlphaBuffer.value = s.mdc.texture;
    s.quad.material = s.upscale; r.setRenderTarget(out); s.quad.render(r);
    s.copy.uniforms.tDiffuse.value = out.texture; s.quad.material = s.copy; r.setRenderTarget(null); s.quad.render(r);
    s.cur = 1 - s.cur;
  }
}

/**
 * What SGSR 2 needs from the frame, the same on WebGL and WebGPU (hd3d-gpu.js): sizes, the camera's
 * move since last frame (without the jitter), whether to start over, and this frame's jitter, which
 * begin() puts on the camera and end() takes off. yDown: the renderer's pictures count rows from the
 * top (WebGPU), so the jitter's y is turned round to stay in picture pixels.
 */
export class SgsrFrame {
  /** A pause this long (ms) between frames starts the history again. (Training and test pages that read the GPU between frames set it longer.) */
  static pause = 1000;
  constructor() {
    this.renderSize = new Vector2(); this.outputSize = new Vector2(); this.jitter = new Vector2(); this.scaleRatio = new Vector2();
    this.jitterMove = new Vector2();   // last frame's jitter less this one's (picture pixels): where last frame's pixels sampled, from this one's
    this.clipToPrevClip = new Matrix4(); this.fovH = 1; this.minLerp = 0; this.reset = 1;
    this.prevVP = new Matrix4(); this.saved = new Matrix4(); this.savedInv = new Matrix4();
    this.frame = 0; this.still = 0; this.view = null; this.lastT = 0; this.key = '';
    this.jitters = 8; this.near = .1; this.far = 1000; this.ortho = false;
  }
  begin(cam, pw, ph, ow, oh, view, now, cut = false, yDown = false) {
    const key = `${pw}x${ph}>${ow}x${oh}`, resized = key !== this.key; this.key = key;
    const reset = cut || resized || this.view !== view || now - this.lastT > SgsrFrame.pause;   // a cut: another view drew in between, or a long pause
    this.view = view; this.lastT = now;
    this.renderSize.set(pw, ph); this.outputSize.set(ow, oh);
    const k = ow / pw;
    this.scaleRatio.set(k, Math.min(20, Math.pow((ow * oh) / (pw * ph), 3)));
    this.fovH = cam.isPerspectiveCamera ? Math.tan(cam.fov * Math.PI / 360) * pw / ph : 1;
    // the camera's move: this frame's clip space to last frame's (without the jitter)
    cam.updateMatrixWorld();
    VP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    let d = 0; for (let i = 0; i < 16; i++) d += Math.abs(VP.elements[i] - this.prevVP.elements[i]);
    this.still = !reset && d < 1e-5 ? this.still + 1 : 0;
    this.clipToPrevClip.multiplyMatrices(reset ? VP : this.prevVP, INV.copy(VP).invert());
    this.prevVP.copy(VP);
    this.minLerp = this.still ? .3 : 0;
    this.reset = reset ? 1 : 0;
    // jitter: a Halton (2, 3) point inside the pixel, more of them the bigger the upscale
    const n = Math.min(32, Math.max(8, Math.ceil(8 * k * k)));
    this.frame = (this.frame % n) + 1; this.jitters = n;
    this.near = cam.near; this.far = cam.far; this.ortho = !cam.isPerspectiveCamera;
    const jx = halton(this.frame, 2) - .5, jy = halton(this.frame, 3) - .5;
    this.jitterMove.set(reset ? 0 : this.jitter.x - jx, reset ? 0 : this.jitter.y - jy);
    this.jitter.set(jx, jy);
    // move the picture by (jx, jy) picture pixels: clip x += 2 jx / pw * w (works for both camera kinds)
    this.saved.copy(cam.projectionMatrix); this.savedInv.copy(cam.projectionMatrixInverse);
    const e = cam.projectionMatrix.elements, tx = 2 * jx / pw, ty = (yDown ? -2 : 2) * jy / ph;
    for (let c = 0; c < 4; c++) { e[c * 4] += tx * e[c * 4 + 3]; e[c * 4 + 1] += ty * e[c * 4 + 3]; }
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }
  /** After drawing: the camera without jitter again. */
  end(cam) { cam.projectionMatrix.copy(this.saved); cam.projectionMatrixInverse.copy(this.savedInv); }
}

export class SGSR2 {
  constructor() {
    this.cu = { InputDepth: { value: null }, PrevDepth: { value: null }, clipToPrevClip: { value: new Matrix4() }, renderSize: { value: new Vector2() }, renderSizeRcp: { value: new Vector2() }, cameraFovAngleHor: { value: 1 },
      cameraNF: { value: new Vector2(.1, 1000) }, jitterMove: { value: new Vector2() }, orthoCam: { value: 0 }, fsrX: { value: new Vector4(FSR_X[0], FSR_X[1], FSR_X[2], FSR_X[3]) } };
    this.uu = { PrevOutput: { value: null }, MotionDepthClipAlphaBuffer: { value: null }, InputColor: { value: null }, renderSize: this.cu.renderSize, renderSizeRcp: this.cu.renderSizeRcp,
      outputSize: { value: new Vector2() }, jitterOffset: { value: new Vector2() }, scaleRatio: { value: new Vector2() }, minLerpContribution: { value: 0 }, reset: { value: 1 },
      LockHist: { value: null }, lockDec: { value: .005 }, fsrX: this.cu.fsrX, Changes: { value: null }, fsrY: { value: new Vector4(FSR_X[4], FSR_X[5], FSR_X[6], 0) } };
    this.lu = { InputColor: { value: null }, MotionDepthClipAlphaBuffer: { value: null }, LumHist: { value: null }, renderSize: this.cu.renderSize, jitterMove: this.cu.jitterMove, reset: this.uu.reset };
    this.convert = mat(CONVERT, this.cu); this.upscale = mat(UPSCALE.replace('S2_NET_BODY', ''), this.uu, { S2_TUNED: 1, S2_HOLD: S2_HOLD.toFixed(1) }); this._net = null; this.copy = mat(COPY, { tDiffuse: { value: null } });
    this.depthLin = mat(DEPTHLIN, { InputDepth: this.cu.InputDepth, cameraNF: this.cu.cameraNF, orthoCam: this.cu.orthoCam });
    this.changes = mat(CHANGES, this.lu); this.lumHist = mat(LUMHIST, this.lu);
    this.quad = new FullScreenQuad(null);
    this.mdc = rt(); this.hist = [histRT(), histRT()]; this.cur = 0; this.pd = [depthRT(), depthRT()]; this.pc = 0; this.fsr = null;
    this.sd = changesRT(); this.lh = [rt(), rt()]; this.lc = 0; this.lu.MotionDepthClipAlphaBuffer.value = this.mdc.texture;
    this.convertPass = new ConvertPass(this); this.upscalePass = new UpscalePass(this);
    this.f = new SgsrFrame();
  }
  /** Our two changes to the upscale pass on (the usual) or off: Qualcomm's shader as it was. A change builds the shader again and starts the history again. */
  get tuned() { return 'S2_TUNED' in this.upscale.defines; }
  set tuned(on) {
    if (!!on === this.tuned) return;
    if (on) this.upscale.defines.S2_TUNED = 1; else delete this.upscale.defines.S2_TUNED;
    this.upscale.needsUpdate = true; this.f.key = '';
  }
  /** GSSR's learned blend (gssr-net.js netFor) or null: the hand-written one. Needs tuned. A change builds the shader again and starts the history again. */
  get net() { return this._net; }
  set net(n) {
    n = this.tuned ? n || null : null;
    if ((n?.id || null) === (this._net?.id || null)) return;
    this._net = n;
    const d = this.upscale.defines; if (n) d.S2_NET = 1; else delete d.S2_NET;
    this.upscale.fragmentShader = UPSCALE.replace('S2_NET_BODY', n ? netText(n, 'glsl') : '');
    this.upscale.needsUpdate = true; this.f.key = '';
  }
  /** Before drawing: sizes, the camera's move since last frame, and this frame's jitter on cam. */
  begin(cam, pw, ph, ow, oh, view, now, cut = false) {
    const cu = this.cu, uu = this.uu, f = this.f;
    if (this.mdc.width !== pw || this.mdc.height !== ph || this.hist[0].width !== ow || this.hist[0].height !== oh) { this.mdc.setSize(pw, ph); for (const d of [...this.pd, this.sd, ...this.lh]) d.setSize(pw, ph); for (const h of this.hist) h.setSize(ow, oh); }
    f.begin(cam, pw, ph, ow, oh, view, now, cut);
    cu.renderSize.value.copy(f.renderSize); cu.renderSizeRcp.value.set(1 / pw, 1 / ph); uu.outputSize.value.copy(f.outputSize);
    uu.scaleRatio.value.copy(f.scaleRatio); cu.cameraFovAngleHor.value = f.fovH; cu.clipToPrevClip.value.copy(f.clipToPrevClip);
    uu.minLerpContribution.value = f.minLerp; uu.reset.value = f.reset; uu.jitterOffset.value.copy(f.jitter);
    cu.cameraNF.value.set(f.near, f.far); cu.jitterMove.value.copy(f.jitterMove); cu.orthoCam.value = f.ortho ? 1 : 0; uu.lockDec.value = .1 / f.jitters;
    const x = this.tuned ? this.fsr || FSR_X : [0, 0, 0, 0, 0, 0, 0]; cu.fsrX.value.set(x[0], x[1], x[2] || 0, x[3] || 0); uu.fsrY.value.set(x[4] || 0, x[5] || 0, x[6] || 0, 0);
  }
  /** After drawing: the camera without jitter again. */
  end(cam) { this.f.end(cam); }
  dispose() { for (const t of [this.mdc, ...this.hist, ...this.pd, this.sd, ...this.lh]) t.dispose(); for (const m of [this.convert, this.upscale, this.copy, this.depthLin, this.changes, this.lumHist]) m.dispose(); this.quad.dispose(); }
}
