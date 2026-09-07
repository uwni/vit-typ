"""The treble clef of the tutorial's Fourier page, derived from a font glyph.

    python3 tools/clef.py > /tmp/clef.txt

What a Fourier series needs is *one* closed curve. The boundary of the filled
glyph is not one: it is the silhouette plus the three holes the stroke encloses
where it crosses itself. What is one curve is the outline of the **pen** — the
way a handwriting tutorial draws a letter — so that is what this builds:

  1. rasterise the glyph, even-odd, so the holes stay holes;
  2. skeletonise it and read the skeleton as a graph;
  3. walk the graph as an Eulerian trail, pairing the edges at each crossing by
     direction, because a pen goes straight through its own crossings — that
     walk is the path the pen took;
  4. straighten the centreline across the crossings: where two passes overlap
     the medial axis bends towards the merge and the distance transform bulges,
     so both the position and the width are wrong there;
  5. offset the centreline to both sides by the local ink half-width, cap the
     two ends, and close it.

Needs fonttools, numpy, scipy, scikit-image and matplotlib (for the plot).
"""
import argparse, json, sys
import numpy as np
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from matplotlib.path import Path as MPath
from scipy.ndimage import label, distance_transform_edt, minimum_filter1d, uniform_filter1d
from skimage.morphology import skeletonize

ap = argparse.ArgumentParser()
ap.add_argument('--font', default='/usr/share/fonts/truetype/freefont/FreeSerif.ttf')
ap.add_argument('--glyph', default='g_clef')
ap.add_argument('--n', type=int, default=128, help='samples round the finished curve')
ap.add_argument('--height', type=int, default=900, help='raster height in pixels')
ap.add_argument('--size', type=float, default=2.6, help='the curve is scaled to this many units tall')
ap.add_argument('--plot', default='', help='write a diagnostic picture here')
a = ap.parse_args()

# ── 1. the filled glyph, rasterised even-odd ────────────────────────────
recorder = RecordingPen()
TTFont(a.font).getGlyphSet()[a.glyph].draw(recorder)

def bez(pts, n):
    """de Casteljau for a quadratic or a cubic, without the first point"""
    out = []
    for t in np.linspace(0, 1, n + 1)[1:]:
        p = list(pts)
        while len(p) > 1:
            p = [(u[0] + t*(v[0]-u[0]), u[1] + t*(v[1]-u[1])) for u, v in zip(p, p[1:])]
        out.append(p[0])
    return out

contours, cur, pos = [], [], None
for op, args in recorder.value:
    if op == 'moveTo':
        if cur: contours.append(cur)
        pos = args[0]; cur = [pos]
    elif op == 'lineTo':
        pos = args[0]; cur.append(pos)
    elif op == 'qCurveTo':
        pts = list(args)
        if pts[-1] is None:                     # an all-off-curve TrueType contour
            pts = pts[:-1] + [((pts[0][0]+pts[-2][0])/2, (pts[0][1]+pts[-2][1])/2)]
        ctrl = pts[:-1]
        for i, c in enumerate(ctrl):            # on-curve points implied between controls
            nxt = pts[i+1] if i == len(ctrl)-1 else ((c[0]+ctrl[i+1][0])/2, (c[1]+ctrl[i+1][1])/2)
            cur += bez([pos, c, nxt], 8); pos = nxt
    elif op == 'curveTo':
        p = list(args); cur += bez([pos] + p, 10); pos = p[2]
    elif op == 'closePath':
        contours.append(cur); cur = []
if cur: contours.append(cur)

pts = np.array([q for c in contours for q in c])
PAD = 8
sc = (a.height - 2*PAD) / (pts[:, 1].max() - pts[:, 1].min())
W = int((pts[:, 0].max() - pts[:, 0].min()) * sc) + 2*PAD
gx, gy = np.meshgrid(np.arange(W) + .5, np.arange(a.height) + .5)
grid = np.column_stack([(pts[:, 0].min() + (gx - PAD)/sc).ravel(),
                        (pts[:, 1].min() + (gy - PAD)/sc).ravel()])
mask = np.zeros(a.height*W, bool)
for c in contours:                              # even-odd: the enclosed holes stay holes
    mask ^= MPath(np.array(c + [c[0]]),
                  [MPath.MOVETO] + [MPath.LINETO]*(len(c)-1) + [MPath.CLOSEPOLY]).contains_points(grid)
mask = mask.reshape(a.height, W)
edt = distance_transform_edt(mask)
print(f'raster {W}x{a.height}, {mask.sum()} ink px', file=sys.stderr)

# ── 2. the skeleton, as a graph ─────────────────────────────────────────
sk = skeletonize(mask)
pix = set(map(tuple, np.argwhere(sk)))
def nbrs(p):
    y, x = p
    return [(y+dy, x+dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1)
            if (dy or dx) and (y+dy, x+dx) in pix]
special = np.zeros_like(sk)
for p in pix:
    if len(nbrs(p)) != 2: special[p] = True
lab, _ = label(special, structure=np.ones((3, 3)))
node_of = {p: int(lab[p]) for p in pix if special[p]}

edges, walked = [], set()
for p in list(node_of):
    for q in nbrs(p):
        if q in node_of and node_of[q] == node_of[p]: continue
        if (p, q) in walked: continue
        chain, prev, cur = [p, q], p, q
        while cur not in node_of:
            nxt = [r for r in nbrs(cur) if r != prev]
            if not nxt: break
            prev, cur = cur, nxt[0]; chain.append(cur)
        walked.add((p, q)); walked.add((chain[-1], chain[-2]))
        edges.append([node_of[p], node_of.get(cur, -len(edges)-1), chain])
seen, uniq = set(), []
for u, v, ch in edges:
    k = (min(ch[0], ch[-1]), max(ch[0], ch[-1]), len(ch))
    if k not in seen: seen.add(k); uniq.append([u, v, ch])
edges = uniq

def degree(n): return sum((e[0] == n) + (e[1] == n) for e in edges)

for _ in range(40):        # a crossing often skeletonises as two Y's and a stub
    for e in list(edges):
        u, v, ch = e
        if u != v and len(ch) <= 45 and degree(u) >= 3 and degree(v) >= 3:
            edges.remove(e)
            for f in edges:
                if f[0] == v: f[0] = u
                if f[1] == v: f[1] = u
            break
    else: break
for _ in range(40):        # spurs off a junction are raster noise, not strokes
    for e in list(edges):
        u, v, ch = e
        if (degree(u) == 1 and degree(v) >= 3 or degree(v) == 1 and degree(u) >= 3) and len(ch) < 60:
            edges.remove(e); break
    else: break
nodes = sorted({n for e in edges for n in e[:2]})
print(f'{len(edges)} edges, degrees {sorted(degree(n) for n in nodes)}', file=sys.stderr)
assert sum(degree(n) % 2 for n in nodes) == 2, 'a pen stroke has exactly two loose ends'

# ── 3. the Eulerian trail: straight through every crossing ──────────────
def outward(ei, end, k=14):
    ch = edges[ei][2]
    seq = ch[:k] if end == 0 else ch[-k:][::-1]
    d = np.array(seq[-1], float) - np.array(seq[0], float)
    return d / max(np.hypot(*d), 1e-9)

inc = {n: [] for n in nodes}
for i, (u, v, _) in enumerate(edges):
    inc[u].append((i, 0)); inc[v].append((i, 1))
partner = {}
for n, items in inc.items():
    free = list(items)
    while len(free) >= 2:                      # the straightest pair goes together
        best = min(((float(outward(*free[x]) @ outward(*free[y])), x, y)
                    for x in range(len(free)) for y in range(x+1, len(free))))
        _, x, y = best
        partner[free[x]] = free[y]; partner[free[y]] = free[x]
        for i in sorted((x, y), reverse=True): free.pop(i)
    if free: partner[free[0]] = None
loose = [k for k, v in partner.items() if v is None]

path, used, at = [], set(), loose[0]
while at is not None and at[0] not in used:
    ei, end = at
    seq = edges[ei][2] if end == 0 else edges[ei][2][::-1]
    path += seq if not path else seq[1:]
    used.add(ei)
    at = partner.get((ei, 1 - end))
assert len(used) == len(edges), f'the trail missed {len(edges)-len(used)} edges'
print(f'pen path {len(path)} px, all {len(edges)} edges', file=sys.stderr)

crossings = []
for n in nodes:
    if degree(n) >= 4:
        px = np.array([q for q, m in node_of.items() if m == n], float)
        crossings.append((px[:, 0].mean(), px[:, 1].mean()))

# ── 4. centreline and width, straightened across the crossings ──────────
def resample(arr, n):
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(arr, axis=0).T))]
    t = np.linspace(0, d[-1], n)
    return np.column_stack([np.interp(t, d, arr[:, 0]), np.interp(t, d, arr[:, 1])])

p = np.array(path, float)[:, ::-1]                       # (row, col) -> (x, y)
p = uniform_filter1d(resample(uniform_filter1d(p, 9, axis=0, mode='nearest'), 600),
                     7, axis=0, mode='nearest')
raw = uniform_filter1d(edt[np.clip(p[:, 1].astype(int), 0, edt.shape[0]-1),
                           np.clip(p[:, 0].astype(int), 0, edt.shape[1]-1)], 9, mode='nearest')

TIP = 55                                                 # the two ends are terminals, not crossings
merge = np.zeros(len(p), bool)
for cy, cx in crossings:
    merge |= np.hypot(p[:, 0] - cx, p[:, 1] - cy) < 2.1 * edt[int(round(cy)), int(round(cx))]
merge[:TIP] = merge[-TIP:] = False
idx, good = np.arange(len(p)), ~merge
for col in (0, 1):
    p[merge, col] = np.interp(idx[merge], idx[good], p[good, col])
w = uniform_filter1d(minimum_filter1d(raw, 15, mode='nearest'), 15, mode='nearest')
w[merge] = np.interp(idx[merge], idx[good], w[good])
w = uniform_filter1d(w, 13, mode='nearest')
p = uniform_filter1d(p, 7, axis=0, mode='nearest')
ramp = np.linspace(1, 0, TIP)
w[:TIP] = raw[:TIP]*ramp + w[:TIP]*(1-ramp)
w[-TIP:] = raw[-TIP:]*ramp[::-1] + w[-TIP:]*(1-ramp[::-1])

d1 = np.gradient(p, axis=0); d2 = np.gradient(d1, axis=0)
kappa = uniform_filter1d(np.abs(d1[:, 0]*d2[:, 1] - d1[:, 1]*d2[:, 0])
                         / np.maximum(np.hypot(*d1.T)**3, 1e-9), 21, mode='nearest')
w = uniform_filter1d(np.minimum(w, 0.85/np.maximum(kappa, 1e-6)), 9, mode='nearest')
print(f'{merge.sum()} of {len(p)} samples inside a crossing; '
      f'half-width {w.min():.1f}…{w.max():.1f} px', file=sys.stderr)

# ── 5. the outline: one side out, round the end, the other side back ────
t = d1 / np.hypot(*d1.T)[:, None]
n = np.column_stack([-t[:, 1], t[:, 0]])

def cap(centre, normal, through, radius, k=16):
    """the half circle from +normal to -normal that goes the way of `through`"""
    a0 = np.arctan2(normal[1], normal[0])
    sweep = max((np.pi, -np.pi), key=lambda s:
                float(np.array([np.cos(a0+s/2), np.sin(a0+s/2)]) @ through))
    ang = a0 + np.linspace(0, sweep, k)
    return centre + radius*np.column_stack([np.cos(ang), np.sin(ang)])

outline = np.vstack([p + n*w[:, None],
                     cap(p[-1], n[-1], t[-1], w[-1])[1:-1],
                     (p - n*w[:, None])[::-1],
                     cap(p[0], -n[0], -t[0], w[0])[1:-1]])

o = resample(np.vstack([outline, outline[0]]), a.n + 1)[:a.n]
cx, cy = (o[:, 0].min()+o[:, 0].max())/2, (o[:, 1].min()+o[:, 1].max())/2
s = a.size / max(np.ptp(o[:, 0]), np.ptp(o[:, 1]))
o = (o - [cx, cy]) * s
print(f'{a.n} points, {np.ptp(o[:,0]):.2f} x {np.ptp(o[:,1]):.2f} units', file=sys.stderr)

print('  let clef = (')
for i in range(0, a.n, 4):
    print('    ' + ' '.join(f'({x:g}, {y:g}),' for x, y in np.round(o[i:i+4], 4)))
print('  )')

if a.plot:
    import matplotlib; matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 3, figsize=(11, 9), facecolor='#111318')
    ax[0].imshow(mask, origin='lower', cmap='bone', alpha=.35)
    ax[0].scatter(p[:, 0], p[:, 1], c=np.arange(len(p)), cmap='plasma', s=1.6)
    ax[0].scatter([c[1] for c in crossings], [c[0] for c in crossings], c='#66d9e8', s=30)
    ax[0].set_title('pen path and its crossings', color='w')
    ax[1].imshow(mask, origin='lower', cmap='bone', alpha=.25)
    ax[1].plot(outline[:, 0], outline[:, 1], color='#7aa2ff', lw=1.2)
    ax[1].set_title('offset outline', color='w')
    z = o[:, 0] + 1j*o[:, 1]
    c = np.fft.fft(z)/a.n; f = np.fft.fftfreq(a.n, 1/a.n).astype(int)
    keep = np.argsort(-np.abs(c))[:75]
    tt = np.linspace(0, 2*np.pi, 3000)
    rec = sum(c[k]*np.exp(1j*f[k]*tt) for k in keep)
    ax[2].plot(z.real, z.imag, color='#8992a5', lw=.7)
    ax[2].plot(rec.real, rec.imag, color='#7aa2ff', lw=1.4)
    ax[2].set_title(f'75 harmonics (freq ±{abs(f[keep]).max()})', color='w')
    ax[2].set_aspect('equal')
    for x in ax: x.axis('off')
    plt.tight_layout(); plt.savefig(a.plot, dpi=85, facecolor='#111318')
    print(f'wrote {a.plot}', file=sys.stderr)
