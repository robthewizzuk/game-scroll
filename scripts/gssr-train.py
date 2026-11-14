"""Fits GSSR's learned blend (src/kit/gssr-net.js) to training frames from scripts/gssr-train.cjs.

Each sample is one pixel of one frame: the network's seventeen inputs, what the upscale pass had to blend (the
history, the history clamped to the colour box, the new frame's colour and the colour box's centre), the
hand-written weights, and the reference's colour (the same frame drawn at twice the size and scaled down). The
network's three outputs correct the hand-written new-frame weight, how much of a history outside the colour box
is kept, and the new frame's colour (towards the box's centre or away from it), and the loss is how far the blended pixel is from the reference (in 0..1 screen colour, as upscale-compare scores it),
weighted back by how often each pixel was sampled. The last layer starts at zero: the hand-written GSSR.

Rounds: the frames of round 0 are drawn by the hand-written GSSR; later rounds by the network of the round
before (--net in gssr-train.cjs), so it also learns from the history it makes itself. Train on all of them.

  python3 scripts/gssr-train.py dir [dir...] --out weights.json [--hidden 16,12] [--epochs 12] [--write]
  --write: also put the weights into src/kit/gssr-net.js (GSSR_NET)
Needs numpy only.
"""
import argparse, glob, json, os, re, sys
import numpy as np



def load(dirs):
    parts, seeds, nfs = [], [], set()
    for d in dirs:
        fm = os.path.join(d, 'format.json')
        F = json.load(open(fm)) if os.path.exists(fm) else {}
        NF = F.get('nf', 32)   # (frames from before the extra inputs: 32 floats a sample)
        global NIN
        NIN = F.get('nin', 16 if NF >= 40 else 12)
        nfs.add(NF)
        for f in sorted(glob.glob(os.path.join(d, 's*.f32'))):
            a = np.fromfile(f, dtype=np.float32)
            if a.size % NF:
                a = a[: a.size - a.size % NF]
            a = a.reshape(-1, NF)
            parts.append(a)
            seeds.append(np.full(len(a), int(re.findall(r's(\d+)', os.path.basename(f))[0]), np.int32))
    if not parts:
        sys.exit('no frames in ' + ' '.join(dirs))
    if len(nfs) > 1:
        sys.exit('frames of different kinds (floats a sample: %s): draw them again' % sorted(nfs))
    return np.concatenate(parts), np.concatenate(seeds)


NIN = 17


def unpack(d):
    S = dict(x=d[:, :12], hc=d[:, 12:15], lerp=d[:, 15], cl=d[:, 16:19], reset=d[:, 19], up=d[:, 20:23], own=d[:, 23],
             ref=d[:, 24:27], w=d[:, 27], drawn=d[:, 28:31])
    if d.shape[1] >= 40:
        S['x'] = np.concatenate([d[:, :12], d[:, 32:36], d[:, 39:40]], 1)[:, :NIN]
        S['cen'] = d[:, 36:39]
    return S


def sig(v):
    return 1 / (1 + np.exp(-v))


def logit(p):
    return np.log(p / (1 - p))


class Net:
    def __init__(self, sizes, rng):
        self.W, self.b = [], []
        for i, (a, b) in enumerate(zip(sizes[:-1], sizes[1:])):
            last = i == len(sizes) - 2
            self.W.append(np.zeros((b, a)) if last else rng.normal(0, np.sqrt(2 / a), (b, a)))
            self.b.append(np.zeros(b) if last else np.full(b, .01))
        self.m = [np.zeros_like(p) for p in self.params()]
        self.v = [np.zeros_like(p) for p in self.params()]
        self.t = 0

    def params(self):
        return [p for pair in zip(self.W, self.b) for p in pair]

    def forward(self, x):
        acts = [x]
        for i, (W, b) in enumerate(zip(self.W, self.b)):
            z = acts[-1] @ W.T + b
            if i < len(self.W) - 1:
                z = np.maximum(z, 0)
            acts.append(z)
        return acts

    def backward(self, acts, g):
        grads = []
        for i in reversed(range(len(self.W))):
            if i < len(self.W) - 1:
                g = g * (acts[i + 1] > 0)
            grads.append((g.T @ acts[i], g.sum(0)))
            g = g @ self.W[i]
        grads.reverse()
        return [p for pair in grads for p in pair]

    def step(self, grads, lr, wd=1e-5):
        self.t += 1
        for k, (p, g) in enumerate(zip(self.params(), grads)):
            g = g + wd * p
            self.m[k] = .9 * self.m[k] + .1 * g
            self.v[k] = .999 * self.v[k] + .001 * g * g
            mh, vh = self.m[k] / (1 - .9 ** self.t), self.v[k] / (1 - .999 ** self.t)
            p -= lr * mh / (np.sqrt(vh) + 1e-8)


EPS = .002   # (Charbonnier: L1 with a round bottom)


def blend(S, z):
    """The learned pass's blend, as in hd3d-gpu.js s2Net: returns the pixel and what the gradient needs."""
    z = np.clip(z, -10, 10)
    ownc, lc = np.clip(S['own'], .001, .999), np.clip(S['lerp'], .01, .99)
    an, tn = sig(logit(ownc) + z[:, 0]), sig(logit(lc) + z[:, 1])
    h = S['cl'] + tn[:, None] * (S['hc'] - S['cl'])
    see = S['x'][:, 4]
    a2 = np.maximum(np.clip(an + S['reset'], 0, 1), see)
    cur = S['up']
    if z.shape[1] > 2:   # the new frame's colour, towards the colour box's centre (or away)
        kc = np.clip(z[:, 2], -.5, 1)
        cur = np.maximum(S['up'] + kc[:, None] * (S['cen'] - S['up']), 0)
    out = h + a2[:, None] * (cur - h)
    return out, dict(an=an, tn=tn, h=h, a2=a2, see=see, cur=cur)


def hand(S):
    h = S['cl'] + S['lerp'][:, None] * (S['hc'] - S['cl'])
    a = np.maximum(np.clip(S['own'] + S['reset'], 0, 1), S['x'][:, 4])
    return h + a[:, None] * (S['up'] - h)


def err255(S, out):
    """Mean difference from the reference out of 255, weighted back to every pixel (as upscale-compare scores)."""
    e = np.abs(np.clip(out, 0, 1) - S['ref']).mean(1)
    return float((e * S['w']).sum() / S['w'].sum() * 255)


def change255(S, out):
    """How much the picture changes from its history where nothing moves, out of 255 (shimmer, as flicker scores it)."""
    m = S['x'][:, 0] < .05
    e = np.abs(np.clip(out, 0, 1) - np.clip(S['hc'], 0, 1)).mean(1)
    return float((e * S['w'] * m).sum() / max((S['w'] * m).sum(), 1e-9) * 255)


def loss_grad(S, z, steady=0.):
    """Charbonnier distance from the reference, plus (steady) any change from the history beyond the hand-written
    blend's where the pixel stays put: a change the hand-written pass wouldn't make there is shimmer next frame."""
    out, k = blend(S, z)
    oc = np.clip(out, 0, 1)
    d = oc - S['ref']
    w = S['w'] / S['w'].mean()
    L = (w[:, None] * np.sqrt(d * d + EPS * EPS)).sum() / len(d)
    gd = w[:, None] * d / np.sqrt(d * d + EPS * EPS)
    if steady:
        still = (S['x'][:, 0] < .05) * w * steady
        dc = oc - np.clip(S['hc'], 0, 1)
        over = np.abs(dc) - np.abs(np.clip(S['hand'], 0, 1) - np.clip(S['hc'], 0, 1))
        L += (still[:, None] * np.maximum(over, 0)).sum() / len(d)
        gd = gd + still[:, None] * np.sign(dc) * (over > 0)
    gout = gd * ((out > 0) & (out < 1)) / len(d)
    ga2 = (gout * (k['cur'] - k['h'])).sum(1)
    gan = ga2 * (k['an'] > k['see']) * (k['an'] + S['reset'] < 1)
    gtn = (gout * (1 - k['a2'])[:, None] * (S['hc'] - S['cl'])).sum(1)
    g = [gan * k['an'] * (1 - k['an']), gtn * k['tn'] * (1 - k['tn'])]
    if z.shape[1] > 2:
        z2 = z[:, 2]
        g.append((gout * k['a2'][:, None] * (S['cen'] - S['up']) * (k['cur'] > 0)).sum(1) * (z2 >= -.5) * (z2 < 1))
    gz = np.stack(g, 1) * (np.abs(z) < 10)
    return L, gz


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dirs', nargs='+')
    ap.add_argument('--out', required=True)
    ap.add_argument('--hidden', default='16,12')
    ap.add_argument('--epochs', type=int, default=12)
    ap.add_argument('--batch', type=int, default=8192)
    ap.add_argument('--lr', type=float, default=3e-3)
    ap.add_argument('--val', type=int, default=4, help='seeds kept out of training to check on')
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--no-colour', action='store_true', help="two outputs: leave the new frame's colour as it is")
    ap.add_argument('--steady', type=float, default=1., help='how much a change beyond the hand-written blend where nothing moves counts')
    a = ap.parse_args()
    d, seeds = load(a.dirs)
    ok = np.isfinite(d).all(1)
    d, seeds = d[ok], seeds[ok]
    us = np.unique(seeds)
    rng = np.random.default_rng(a.seed)
    val_seeds = set(rng.choice(us, size=min(a.val, len(us) - 1), replace=False).tolist()) if len(us) > 1 else set()
    vm = np.isin(seeds, list(val_seeds))
    T, V = unpack(d[~vm]), unpack(d[vm])
    for X in (T, V):
        X['hand'] = hand(X)
    print(f'{len(d)} samples from {len(us)} seeds; checking on seeds {sorted(val_seeds)} ({vm.sum()} samples)')
    # inputs scaled to mean 0, spread 1 for training; folded back into the first layer for the shader
    w = T['w'] / T['w'].sum()
    mu = (T['x'] * w[:, None]).sum(0)
    sd = np.sqrt(((T['x'] - mu) ** 2 * w[:, None]).sum(0)) + 1e-3
    norm = lambda x: (x - mu) / sd
    nin, nout = T['x'].shape[1], 3 if 'cen' in T and not a.no_colour else 2
    sizes = [nin] + [int(h) for h in a.hidden.split(',') if h] + [nout]
    net = Net(sizes, rng)
    n = len(T['x'])
    base_t, base_v = err255(T, hand(T)), (err255(V, hand(V)) if len(V['x']) else 0)
    base_c = change255(V, V['hand']) if len(V['x']) else 0
    print(f'hand-written GSSR: train {base_t:.3f}/255, check {base_v:.3f}/255')
    xt = norm(T['x'])
    for ep in range(a.epochs):
        lr = a.lr * (.5 * (1 + np.cos(np.pi * ep / a.epochs)))
        order = rng.permutation(n)
        tot = 0
        for i in range(0, n, a.batch):
            idx = order[i:i + a.batch]
            S = {k: v[idx] for k, v in T.items()}
            acts = net.forward(xt[idx])
            L, gz = loss_grad(S, acts[-1], a.steady)
            net.step(net.backward(acts, gz * len(idx)), lr)
            tot += L * len(idx)
        zt = net.forward(xt)[-1]
        et = err255(T, blend(T, zt)[0])
        ov = blend(V, net.forward(norm(V['x']))[-1])[0] if len(V['x']) else None
        ev, cv = (err255(V, ov), change255(V, ov)) if ov is not None else (0, 0)
        print(f'epoch {ep + 1}: loss {tot / n:.5f}, train {et:.3f}/255 ({(et / base_t - 1) * 100:+.1f}%), check {ev:.3f}/255 ({(ev / max(base_v, 1e-9) - 1) * 100:+.1f}%), '
              f'change where still {cv:.3f}/255 (hand-written {base_c:.3f})')
    # fold the scaling into the first layer
    W0 = net.W[0] / sd[None, :]
    b0 = net.b[0] - W0 @ mu
    layers = [dict(w=W0, b=b0)] + [dict(w=W, b=b) for W, b in zip(net.W[1:], net.b[1:])]
    r6 = lambda v: 0. if abs(v) < 1e-7 else float(f'{v:.6g}')   # (nothing too small for the shader's numbers)
    out = dict(layers=[dict(w=[[r6(v) for v in row] for row in L['w']], b=[r6(v) for v in L['b']]) for L in layers],
               trained=dict(samples=int(len(d)), seeds=int(len(us)), hidden=sizes[1:-1], hand=round(base_v, 3), net=round(ev, 3)))
    # the folded network gives the same answers
    x2k = unpack(d[:2000])['x']
    zf = np.asarray(x2k, np.float64)
    for i, L in enumerate(out['layers']):
        zf = zf @ np.array(L['w']).T + np.array(L['b'])
        if i < len(out['layers']) - 1:
            zf = np.maximum(zf, 0)
    zr = net.forward(norm(x2k))[-1]
    assert np.abs(np.clip(zf, -10, 10) - np.clip(zr, -10, 10)).max() < 1e-2, 'folding the scaling changed the answers'
    with open(a.out, 'w') as f:
        json.dump(out, f)
    print('weights in', a.out)
    if a.write:
        p = os.path.join(os.path.dirname(__file__), '..', 'src', 'kit', 'gssr-net.js')
        s = open(p).read()
        js = json.dumps(out, separators=(',', ':'))
        s2 = re.sub(r'export const GSSR_NET = .*?;\n', lambda m: f'export const GSSR_NET = {js};\n', s, count=1, flags=re.S)
        open(p, 'w').write(s2)
        print('written into', os.path.normpath(p))


if __name__ == '__main__':
    main()
