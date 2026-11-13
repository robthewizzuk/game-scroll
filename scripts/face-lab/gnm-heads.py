#!/usr/bin/env python3
"""GNM heads: real head shapes of men and women of four broad backgrounds, from Google's GNM Head (Apache 2.0), for scripts/head-fit.mjs.

    python3 scripts/face-lab/gnm-heads.py [samples=3] [seed=1]

GNM Head is a statistical model of the human head learned from a large set of 3D scans (github.com/google/GNM, Apache 2.0, model and
weights alike). It gives shape only, no skin colour. Like the head scan, nothing of it ships: head-fit.mjs measures our heads against
these and only the measures go in the code.

Fetch first, into scripts/face-lab/ref/gnm/ (never committed, like the scan):
    https://huggingface.co/google/gnm-v3/resolve/main/v3_0/gnm_head.npz          (53 MB, no sign-in)
    https://raw.githubusercontent.com/google/GNM/main/gnm/shape/data/semantic_sampler/identity_decoder_model.h5
Needs numpy and h5py (pip install numpy h5py); not TensorFlow: the sampler (a small network from a class and a random draw to a
head's 253 numbers) is worked out here by hand from its weights.

Writes scripts/face-lab/ref/gnm/<sex>-<group>-<k>.glb: k 0 is the middle of that class (the draw all zeros), 1.. are draws from it.
Each holds the outside of the skin and the fronts of the eyes, in metres, the face along +z, each point's part (_PART: skin, lips, the
white of the eye, iris, pupil; for the face lab's &gnm), and in its extras where its eyes' fronts are (so head-fit.mjs needs no window
to find them) and its units.
"""
import json, os, struct, sys
import numpy as np
import h5py

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, 'ref', 'gnm')
opt = dict(a.split('=', 1) for a in sys.argv[1:] if '=' in a)
SAMPLES, SEED = int(opt.get('samples', 3)), int(opt.get('seed', 1))
SEXES, GROUPS = ['f', 'm'], ['middle-eastern', 'asian', 'white', 'black']   # (the sampler's own classes, in its order)

z = np.load(os.path.join(REF, 'gnm_head.npz'), allow_pickle=False)
T, B = z['template_vertex_positions'].astype(np.float64), z['vertex_identity_basis'].astype(np.float64)
groups = dict(zip([str(n) for n in z['vertex_group_names']], z['vertex_groups']))
tris = z['triangles']

# the sampler: [draw (64), sex one-hot (2), class one-hot (4)] -> four layers with relu -> the 253 identity numbers
f = h5py.File(os.path.join(REF, 'identity_decoder_model.h5'), 'r')
W = [(f['model_weights'][n][n]['kernel:0'][()], f['model_weights'][n][n]['bias:0'][()]) for n in ['dense_4', 'dense_5', 'dense_6', 'dense_7', 'dense_8']]
def identity(draw, sex, group):
    x = np.concatenate([draw, np.eye(2)[sex], np.eye(4)[group]])
    for i, (k, b) in enumerate(W):
        x = x @ k + b
        if i < len(W) - 1: x = np.maximum(x, 0)
    return x

# what is written: the outside of the skin and the eyes' fronts (not the mouth's inside, the teeth or the tongue)
keep = (groups['skin_exterior'] > .5) | (groups['eye_exteriors'] > .5)
faces = tris[keep[tris].all(axis=1)]
used = np.unique(faces); remap = -np.ones(len(T), np.int64); remap[used] = np.arange(len(used))
I = remap[faces].astype(np.uint32).ravel()
# each kept point's part, for the face lab's colouring (&gnm): 0 skin, 1 lips, 2 the white of the eye, 3 the iris, 4 the pupil
part = np.zeros(len(T), np.uint8)
for k, n in (('upper_lip', 1), ('lower_lip', 1), ('scleras', 2), ('irises', 3), ('pupils', 4)): part[groups[k] > .5] = n
part[(groups['eye_exteriors'] > .5) & (part < 2)] = 2
PART = part[used].astype(np.float32).tobytes()
eyesOf = lambda P: [P[(groups[k] > .5)][np.argmax(P[(groups[k] > .5), 2])].tolist() for k in ('left_eye', 'right_eye')]   # (+x first, as head-fit's are)

def glb(path, P, extras):
    pos = P[used].astype(np.float32)
    bp, bi = pos.tobytes(), I.tobytes()
    J = {'asset': {'version': '2.0', 'generator': 'gnm-heads.py'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
         'meshes': [{'primitives': [{'attributes': {'POSITION': 0, '_PART': 2}, 'indices': 1}]}],
         'buffers': [{'byteLength': len(bp) + len(bi) + len(PART)}],
         'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(bp)}, {'buffer': 0, 'byteOffset': len(bp), 'byteLength': len(bi)},
                         {'buffer': 0, 'byteOffset': len(bp) + len(bi), 'byteLength': len(PART)}],
         'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': len(pos), 'type': 'VEC3', 'min': pos.min(0).tolist(), 'max': pos.max(0).tolist()},
                       {'bufferView': 1, 'componentType': 5125, 'count': len(I), 'type': 'SCALAR'},
                       {'bufferView': 2, 'componentType': 5126, 'count': len(pos), 'type': 'SCALAR'}],
         'extras': extras}
    js = json.dumps(J).encode(); js += b' ' * (-len(js) % 4)
    bin_ = bp + bi + PART; bin_ += b'\0' * (-len(bin_) % 4)
    with open(path, 'wb') as o:
        o.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
        o.write(struct.pack('<II', len(js), 0x4E4F534A)); o.write(js)
        o.write(struct.pack('<II', len(bin_), 0x004E4942)); o.write(bin_)

rng = np.random.default_rng(SEED)
for s, sex in enumerate(SEXES):
    for g, group in enumerate(GROUPS):
        for k in range(SAMPLES + 1):
            draw = np.zeros(64) if k == 0 else rng.normal(size=64)
            P = T + np.tensordot(identity(draw, s, g), B, axes=1)
            name = f'{sex}-{group}-{k}'
            glb(os.path.join(REF, name + '.glb'), P, {'eyes': eyesOf(P), 'unit': 1, 'source': 'GNM Head v3 (Google, Apache 2.0)', 'sex': sex, 'group': group, 'draw': k})
            print(name, 'eyes', [[round(t, 4) for t in e] for e in eyesOf(P)], 'width', round(float(P[used, 0].max() - P[used, 0].min()), 4))
