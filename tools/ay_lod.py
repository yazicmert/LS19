#!/usr/bin/env python3
"""Ay küresinin kaba ağları (256×128, 64×32, 32×16) için yükseklik payı: bir kaba hücre (4×4, 16×16, 32×32 ince hücre) içindeki ince ağ köşelerinin (1024×512) en büyük yükseklik farkı (km).

Kaba ağın köşeleri ince ağınkilerin alt kümesidir (256 | 1024, 128 | 512, aynı uv ve aynı yer değiştirme), bu yüzden bir kaba üçgenle ince yüzey
arasındaki fark ≤ kiriş sapması + hücre içindeki en büyük yükseklik farkı. Yükseklik gölgelendiricideki gibi örneklenir (bodyshaders.js › hAt:
p = uv·boyut − 0,5, boylamda sarma, enlemde kenara kırpma, çift doğrusal; decH = (R·256 + G)/65535·21 − 10). Görüntünün 0. satırı kuzey,
three.js flipY ile yükler: doku satırı y = görüntü satırı (H − 1 − y). Tam (moon_height.png ve masaüstünün yüklediği moon_height.webp) ve düşük bellek (moon_height_lo.webp) haritaları.
Kullanım: python3 tools/ay_lod.py   (scene.js MOON_RELIEF'teki bir değer ölçülenden küçükse hata verir)
"""
import os, re, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web')
NLON, NLAT = 1024, 512
CELLS = (4, 16, 32)                                                      # MOON_RELIEF[1], [2], [3]


def load(name):
    a = np.asarray(Image.open(os.path.join(ROOT, 'textures', name)).convert('RGB')).astype(np.float64)
    h = (a[..., 0] * 256 + a[..., 1]) / 65535 * 21 - 10
    return h[::-1]                                                       # flipY: satır 0 = güney (uv.y = 0)


def vertex_heights(H):
    Hh, W = H.shape
    u = np.arange(NLON + 1) / NLON
    v = np.arange(NLAT + 1) / NLAT
    px = u * W - 0.5
    py = v * Hh - 0.5
    x0 = np.floor(px).astype(int); fx = px - x0
    y0 = np.floor(py).astype(int); fy = py - y0
    x0w = x0 % W; x1w = (x0 + 1) % W
    ya = np.clip(y0, 0, Hh - 1); yb = np.clip(y0 + 1, 0, Hh - 1)
    h00 = H[np.ix_(ya, x0w)]; h10 = H[np.ix_(ya, x1w)]; h01 = H[np.ix_(yb, x0w)]; h11 = H[np.ix_(yb, x1w)]
    FX = fx[None, :]; FY = fy[:, None]
    return (1 - FY) * ((1 - FX) * h00 + FX * h10) + FY * ((1 - FX) * h01 + FX * h11)          # (513, 1025)


worst = [0.0] * len(CELLS)
for name in ('moon_height.png', 'moon_height.webp', 'moon_height_lo.webp'):
    V = vertex_heights(load(name))
    for n, C in enumerate(CELLS):
        rng = np.zeros((NLAT // C, NLON // C))
        for j in range(NLAT // C):
            blk = V[j * C:j * C + C + 1]
            for i in range(NLON // C):
                c = blk[:, i * C:i * C + C + 1]
                rng[j, i] = c.max() - c.min()
        m = float(rng.max()); worst[n] = max(worst[n], m)
        print(f'{name}: {C}×{C} hücre içi yükseklik farkı en çok {m:.3f} km (medyan {np.median(rng):.3f}, %99 {np.percentile(rng, 99):.3f})')
src = open(os.path.join(ROOT, 'js', 'scene.js'), encoding='utf-8').read()
mm = re.search(r'MOON_RELIEF = \[([0-9., ]+)\]', src)
have = [float(x) for x in mm.group(1).split(',')][1:] if mm else []
print('en kötü: ' + ', '.join(f'{w:.3f}' for w in worst) + ' km' + (f'; scene.js MOON_RELIEF = {have}' if mm else ''))
if not mm or len(have) != len(CELLS) or any(h < w for h, w in zip(have, worst)):
    sys.exit('HATA: scene.js MOON_RELIEF ölçülen hücre içi yükseklik farkından küçük (ya da bulunamadı)')
