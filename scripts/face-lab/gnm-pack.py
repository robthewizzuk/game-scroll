#!/usr/bin/env python3
"""GNM faces: packs Google's GNM Head (Apache 2.0) into the numbers a real face is made from (human-gnm.js).

    python3 scripts/face-lab/gnm-pack.py [k=32] [draws=1000]

GNM Head (github.com/google/GNM; huggingface.co/google/gnm-v3, Apache 2.0, model and weights alike) is a statistical model of the human
head learned from a large set of 3D scans, with a small network that draws a head of a given sex and broad background. Fetch its two files
into scripts/face-lab/ref/gnm/ first (see gnm-heads.py; never committed). Needs numpy and h5py.

What it writes (both generated, never edited by hand):
  src/kit/models/human-gnm-data.js   the skin of the head (the outside, the nostrils, the eyes' sockets; not the mouth's inside, the
                                     teeth or the tongue, the lips closed where they meet; down to a little under where our neck takes over): its mean shape, its
                                     triangles, and the k ways heads differ most among the network's draws (a principal component
                                     analysis of thousands of them, so k = 32 keeps all but half a millimetre of a head's own shape).
                                     About 2.7 MB of text: loaded only when a GNM face is sculpted.
  src/kit/models/human-gnm-marks.js  what a face needs before it is sculpted: for each sex and background, where its heads lie among
                                     those k ways (a mean and a spread, so a seed draws a head of that sex and background), and the
                                     outlines the rest of a face is built along (each eye's opening, the eyeballs' middles, the line
                                     where the lips meet, their red edges, the wings of the nose) as the same mean and k ways.
"""
import base64, json, os, sys
from collections import defaultdict
import numpy as np
import h5py

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
REF = os.path.join(HERE, 'ref', 'gnm')
opt = dict(a.split('=', 1) for a in sys.argv[1:] if '=' in a)
K, DRAWS = int(opt.get('k', 32)), int(opt.get('draws', 1000))
SEXES, GROUPS = ['f', 'm'], ['middle-eastern', 'east-asian', 'european', 'african']   # (the sampler's own classes, in its order, in our words)

z = np.load(os.path.join(REF, 'gnm_head.npz'), allow_pickle=False)
T, B = z['template_vertex_positions'].astype(np.float64), z['vertex_identity_basis'].astype(np.float64)
JT, JB = z['template_joint_positions'].astype(np.float64), z['joint_identity_basis'].astype(np.float64)
G = dict(zip([str(n) for n in z['vertex_group_names']], z['vertex_groups'] > .5))
tris = z['triangles']
f = h5py.File(os.path.join(REF, 'identity_decoder_model.h5'), 'r')
W = [(f['model_weights'][n][n]['kernel:0'][()], f['model_weights'][n][n]['bias:0'][()]) for n in ['dense_4', 'dense_5', 'dense_6', 'dense_7', 'dense_8']]
def identity(D, s, g):
    n = len(D); x = np.concatenate([D, np.tile(np.eye(2)[s], (n, 1)), np.tile(np.eye(4)[g], (n, 1))], 1)
    for i, (k, b) in enumerate(W):
        x = x @ k + b
        if i < len(W) - 1: x = np.maximum(x, 0)
    return x

def loops(F):
    """The boundary loops of triangles F, each in order (the way the faces beside it run)."""
    E = defaultdict(int)
    for t in F:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])): E[(min(a, b), max(a, b))] += 1
    nxt = {}
    for t in F:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            if E[(min(a, b), max(a, b))] == 1: nxt[b] = a
    out, seen = [], set()
    for s in nxt:
        if s in seen: continue
        L, c = [s], nxt[s]; seen.add(s)
        while c != s: L.append(c); seen.add(c); c = nxt[c]
        out.append(L)
    return out

# ---- the skin we use: all of it but the mouth's inside, down to 4 cm under the neck's join (where human-gnm.js cuts it: from under the
# chin back to the nape, 13.5 cm under the eyes in front)
eyes0 = (JT[2] + JT[3]) / 2
R = T - eyes0
# (the lips: GNM's run on past where they meet, the upper a little through the lower, to an inner edge in the mouth. We stop them where they
# meet, the first ring of points out from that edge, and close the mouth by joining the upper lip's row of that ring to the lower's: the
# points of each pair are put at their middle, so the two lips meet in a crease, as closed lips do, with nothing thinner than a crease
# for a distance field to get wrong)
inner = [L for L in loops(tris[(G['skin'] & ~G['mouth_sock'])[tris].all(1)]) if len(L) < 100][0]
skin = G['skin'] & ~G['mouth_sock'] & (R[:, 1] > -.135 - .333 * R[:, 2] - .04)
skin[inner] = False
F = tris[skin[tris].all(1)]
used = np.unique(F); remap = -np.ones(len(T), np.int64); remap[used] = np.arange(len(used)); nv = len(used)
mouth = [L for L in loops(F) if len(L) < 100]; assert len(mouth) == 1 and len(mouth[0]) == len(inner); mouth = mouth[0]   # (where the lips meet)
cl, cr = int(np.argmin(T[mouth, 0])), int(np.argmax(T[mouth, 0]))
n2 = len(mouth); A = [mouth[(cl + k) % n2] for k in range((cr - cl) % n2 + 1)]; Bc = [mouth[(cl - k) % n2] for k in range((cl - cr) % n2 + 1)]
def across(v, other):   # (the nearest point to v of the other lip's row: two of its points and how far from the first to the second)
    best = None
    for a, b in zip(other, other[1:]):
        e = T[b] - T[a]; t = float(np.clip(np.dot(T[v] - T[a], e) / np.dot(e, e), 0, 1)); d = np.linalg.norm(T[a] + t * e - T[v])
        if best is None or d < best[0]: best = (d, a, b, t)
    return best
pairs, far, upA = [], 0, T[A, 1].mean() > T[Bc, 1].mean()
for row, other, up in ((A, Bc, upA), (Bc, A, not upA)):
    for v in row[1:-1]:
        d, a, b, t = across(v, other); far = max(far, d); pairs += [int(remap[v]), int(remap[a]), int(remap[b]), round(t, 3), 1 if up else -1]
print('mouth closed along', n2, 'points; the lips', round(far * 1000, 2), 'mm apart at most there')
# (and the hairline slit left between the two rows filled, a ladder of triangles across it from corner to corner, so the skin has no edge)
zip_ = []; k = m = 0
while k < len(A) - 1 or m < len(Bc) - 1:
    if m == len(Bc) - 1 or (k < len(A) - 1 and T[A[k + 1], 0] <= T[Bc[m + 1], 0]): t = (A[k], A[k + 1], Bc[m]); k += 1
    else: t = (A[k], Bc[m + 1], Bc[m]); m += 1
    if len(set(t)) == 3: zip_.append((t[0], t[2], t[1]))   # (wound as the skin round it is: facing out of the mouth)
F = np.concatenate([F, np.array(zip_, F.dtype)])
neck = [L for L in loops(F) if len(L) >= 100]; assert len(neck) == 1; neck = neck[0]   # (the skin's open end, under the neck: closed with a fan for the field)
eyeLoops = sorted([L for L in loops(tris[G['skin_exterior'][tris].all(1)]) if 30 < len(L) < 60 and abs(T[L, 1].mean() - eyes0[1]) < .02], key=lambda L: -T[L, 0].mean())
assert len(eyeLoops) == 2 and all(remap[L].min() >= 0 for L in eyeLoops)

# ---- the network's heads: thousands of each sex and background, and the ways they differ most (with the eyes' middles along)
rng = np.random.default_rng(7)
C = np.concatenate([identity(rng.normal(size=(DRAWS, 64)), s, g) for s in range(2) for g in range(4)])
# (worked out in the network's own 253 numbers: a head's points are those numbers times GNM's basis, so the analysis of the points is that of
# the numbers, turned through the basis; the points themselves, thousands of heads of 30,000 numbers each, would not fit in memory)
Bm = np.concatenate([B[:, used].reshape(253, -1), JB[:, 2:4].reshape(253, -1)], 1)
Q, Rq = np.linalg.qr(Bm.T)
cm = C.mean(0); mu = cm @ Bm
u, S, vt = np.linalg.svd((C - cm) @ Rq.T, full_matrices=False); Vt = vt[:K] @ Q.T
sd = S[:K] / np.sqrt(len(C)); Bk = Vt * sd[:, None]   # each way, as far as one spread of it moves each point
A = ((C - cm) @ Rq.T) @ vt[:K].T / sd                   # each head among them (spread 1 overall)
Dt = (C[::20] - cm) @ Bm; res = np.linalg.norm((Dt - A[::20] @ Bk).reshape(len(Dt), -1, 3)[:, :nv], axis=2) * 1000
print(f'{K} ways: {np.cumsum(S ** 2)[K - 1] / (S ** 2).sum() * 100:.1f}% of the difference; left out: {np.sqrt((res ** 2).mean()):.2f} mm rms, {np.percentile(res, 99):.2f} mm at most for 99%')
mean = np.concatenate([T[used].ravel(), JT[2:4].ravel()]) + mu   # the mean head (and its eyes' middles), GNM's own space
classes = {}
for s in range(2):
    for g in range(4):
        a = A[(s * 4 + g) * DRAWS:(s * 4 + g + 1) * DRAWS]; m = a.mean(0); L = np.linalg.cholesky(np.cov(a.T) + 1e-9 * np.eye(K))
        classes[SEXES[s] + ':' + GROUPS[g]] = [np.round(m, 3).tolist(), np.round(L[np.tril_indices(K)], 3).tolist()]

def b64(a): return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
def q16(a, step): q = np.round(np.asarray(a) / step); assert np.abs(q).max() < 32767, np.abs(q).max(); return q.astype('<i2')
# the ways, each to a step of its own (its largest move over 32000)
steps = np.abs(Bk).max(1) / 32000

# ---- the outlines, as points of the head: each eye's opening (in order round it), the line the lips meet along (the crease they close in),
# the lips' red (the points of each lip next to the skin round it), the wings of the nose (the outermost of the nose's points, low down)
adj = defaultdict(set)
for t in tris:
    for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])): adj[a].add(b); adj[b].add(a)
lip = G['upper_lip'] | G['lower_lip']
def border(group):
    return [v for v in np.where(group & skin)[0] if any(skin[u] and not lip[u] and G['skin_exterior'][u] for u in adj[v])]
upper, lower = border(G['upper_lip']), border(G['lower_lip'])
nose = [v for v in np.where(G['nose_region'] & skin)[0] if -.052 < R[v, 1] < -.03 and abs(R[v, 0]) > .0155]
marks = {'eyeL': remap[eyeLoops[0]].tolist(), 'eyeR': remap[eyeLoops[1]].tolist(), 'mouth': remap[mouth].tolist(), 'upper': remap[upper].tolist(), 'lower': remap[lower].tolist(), 'nose': remap[nose].tolist(), 'eyes': [nv, nv + 1]}
mi = sorted(set(sum(marks.values(), [])))   # the points the outlines use, and where each is in that list
at = {v: i for i, v in enumerate(mi)}
marks = {k: [at[v] for v in L] for k, L in marks.items()}
cols = np.array([[3 * v, 3 * v + 1, 3 * v + 2] for v in mi]).ravel()

HEAD = '''// Generated by scripts/face-lab/gnm-pack.py from GNM Head (Google, Apache 2.0: github.com/google/GNM). Do not edit by hand.
'''
with open(os.path.join(ROOT, 'src/kit/models/human-gnm-data.js'), 'w') as o:
    o.write(HEAD + '// The skin of a head (GNM\'s, as human-gnm.js uses it): its mean shape (metres, GNM\'s own space, the face along +z, less MID, the\n// middle of the mean head\'s eyes; in steps of 10 microns), its triangles, and\n')
    o.write(f'// the {K} ways heads differ most, each as signed 16-bit steps of its own size (STEPS), little-endian, in base64.\n')
    o.write(f'export const N = {nv}, K = {K};\n')
    o.write(f'export const MEAN = \'{b64(q16(mean[:nv * 3] - np.tile(eyes0, nv), 1e-5))}\', MID = {json.dumps(np.round(eyes0, 6).tolist())};\n')
    o.write(f'export const TRIS = \'{b64(remap[F].astype("<u2"))}\';\n')
    o.write(f'export const STEPS = {json.dumps([float(f"{s:.4g}") for s in steps])};\n')
    o.write(f'export const WAYS = \'{b64(np.concatenate([q16(Bk[k, :nv * 3], steps[k]) for k in range(K)]))}\';\n')
    o.write('// the mouth closed: in fives (a point of one lip\'s row where they meet; two points of the other\'s and how far along from the first to\n// the second the point across from it is; 1 the upper lip, -1 the lower), each point put halfway to the point across from it, so the lips meet\n// in a crease (the hairline slit between the rows is filled: TRIS ends with a ladder of triangles across it)\n')
    o.write(f'export const MOUTH = {json.dumps(pairs)};\n')
    o.write('// the open end of the skin, under the neck (where the field closes it, well below where it is cut off): its points in order round it\n')
    o.write(f'export const NECK = {json.dumps(remap[neck].tolist())};\n')
import hashlib
DATA_HASH = hashlib.sha1(open(os.path.join(ROOT, 'src/kit/models/human-gnm-data.js'), 'rb').read()).hexdigest()[:12]
with open(os.path.join(ROOT, 'src/kit/models/human-gnm-marks.js'), 'w') as o:
    o.write(HEAD + '// For each sex and background (f: or m:, then GNM\'s own four classes in our words): where its heads lie among the ways heads differ\n')
    o.write('// (the mean, and the spread as a lower triangle by rows); then the outlines a face is built along (MARKS: lists of points of P), with\n')
    o.write('// those points\' mean (P0, metres, GNM\'s own space) and how each of the ways moves them (PW: as WAYS in human-gnm-data.js, way by way,\n// in its steps, STEPS).\n')
    o.write(f'export const HASH = \'{DATA_HASH}\';   // (the whole skin\'s numbers, for the sculpting\'s version stamp)\n')
    o.write(f'export const K = {K}, STEPS = {json.dumps([float(f"{s:.4g}") for s in steps])};\n')
    o.write(f'export const CLASSES = {json.dumps(classes)};\n')
    o.write(f'export const MARKS = {json.dumps(marks)};\n')
    o.write(f'export const P0 = {json.dumps(np.round(mean[cols], 6).tolist())};\n')
    o.write(f'export const PW = \'{b64(np.concatenate([q16(Bk[k, cols], steps[k]) for k in range(K)]))}\';\n')
print('data', os.path.getsize(os.path.join(ROOT, 'src/kit/models/human-gnm-data.js')), 'bytes; marks', os.path.getsize(os.path.join(ROOT, 'src/kit/models/human-gnm-marks.js')), 'bytes;', nv, 'points,', len(F), 'triangles,', len(mi), 'outline points')
