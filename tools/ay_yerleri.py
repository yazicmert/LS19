#!/usr/bin/env python3
"""Ay iniş yerleri için yerel yarıçap ve arazi yaması üretir: web/data/site_dems.json.

Kaynak: depodaki küresel LOLA yükseklik dokusu web/textures/moon_height.png (2880×1440, 0,125°/piksel = 8 ppd;
16 bit paketli: h = (R·256 + G)/65535·21 − 10 km, 1737,4 km'ye göre; Ay küresi bu dokuyla yer değiştirilerek çizilir: bodyshaders.js).
Eşleme: u = (boylam + 180)/360, 0. satır kuzey (gölgelendiriciyle aynı). Yarım piksel kaydırmalı çift doğrusal örnekleme.

Doğrulama (geçmezse araç hata verir, dosya yazılmaz): Apollo 11 çevresindeki ölçülmüş LOLA 16 ppd yamasıyla (web/data/site_dem.json)
  korelasyon ≥ 0,99, ortalama fark < 0,01 km, iniş noktasında |h_doku − (R_SITE − R_M)| < 0,15 km (bu son değer öteki yerlerin yarıçap hata payıdır).

Yama: dokunun kendi adımında (0,125°; daha ince örnekleme olmayan çözünürlük ima ederdi), enlemde ±3,5°, boylamda ±3,5°/cos(enlem) + 0,25°
(arazi yaması 60 km yarıçaplı karedir, köşeleri ~85 km = 2,8°; terraingen.js kenarı kırpar, kapsama yeterli olmalı).
Kullanım: python3 tools/ay_yerleri.py
"""
import json, math, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web')
R_M, R_SITE_A11 = 1737.4, 1735.47
# web/js/moonsite.js ile aynı koordinatlar (Wikipedia "Lunar lander › Landing site", LRO)
SITES = {
    'A12': (-3.01239, -23.42157), 'A14': (-3.64530, -17.47136), 'A15': (26.1322, 3.6339),
    'A16': (-8.97301, 15.50019), 'A17': (20.1908, 30.7717),
}
A11 = (0.67409, 23.47298)
STEP, HALF = 0.125, 3.5

a = np.asarray(Image.open(os.path.join(ROOT, 'textures', 'moon_height.png')).convert('RGB')).astype(np.int64)
H = (a[..., 0] * 256 + a[..., 1]) / 65535 * 21 - 10
Hh, W = H.shape
assert (W, Hh) == (2880, 1440), 'beklenen doku boyutu 2880×1440'


def samp(lat, lon):
    x = ((lon + 180) / 360 % 1) * W - 0.5
    y = (90 - lat) / 180 * Hh - 0.5
    x0, y0 = math.floor(x), math.floor(y)
    fx, fy = x - x0, y - y0
    g = lambda yy, xx: H[min(max(yy, 0), Hh - 1), xx % W]
    return (1 - fy) * ((1 - fx) * g(y0, x0) + fx * g(y0, x0 + 1)) + fy * ((1 - fx) * g(y0 + 1, x0) + fx * g(y0 + 1, x0 + 1))


# ---- doğrulama: Apollo 11 ölçülmüş yamasıyla
d = json.load(open(os.path.join(ROOT, 'data', 'site_dem.json')))
dem = np.array(d['h'], float).reshape(d['rows'], d['cols'])
lats = d['lat_top'] - np.arange(d['rows']) * d['step_deg']
lons = d['lon_left'] + np.arange(d['cols']) * d['step_deg']
G = np.array([[samp(la, lo) for lo in lons] for la in lats])
corr = float(np.corrcoef(G.ravel(), dem.ravel())[0, 1])
mdiff = float((G - dem).mean())
hA11 = samp(*A11)
siteErr = abs(hA11 - (R_SITE_A11 - R_M))
print(f'doğrulama (Apollo 11, LOLA 16 ppd yaması): korelasyon {corr:.4f}, ortalama fark {mdiff * 1000:.1f} m, '
      f'iniş noktası {hA11:.3f} km (ölçülmüş {R_SITE_A11 - R_M:.3f} km, fark {siteErr * 1000:.0f} m)')
if not (corr >= 0.99 and abs(mdiff) < 0.01 and siteErr < 0.15):
    sys.exit('HATA: doku eşlemesi Apollo 11 ölçümüyle uyuşmuyor; dosya yazılmadı')

out = {'note': 'LOLA küresel doku (web/textures/moon_height.png, 8 ppd), km, R_M=1737,4\'e göre; satır 0 = kuzey; tools/ay_yerleri.py',
       'validation': {'corr': round(corr, 4), 'mean_diff_m': round(mdiff * 1000, 1), 'a11_site_err_m': round(siteErr * 1000)},
       'sites': {}}
for sid, (lat, lon) in SITES.items():
    hl = HALF + 0.25
    wl = HALF / math.cos(math.radians(abs(lat))) + 0.25
    lat_top = math.ceil((lat + hl) / STEP) * STEP
    lon_left = math.floor((lon - wl) / STEP) * STEP
    rows = int(round((2 * hl) / STEP)) + 2
    cols = int(round((2 * wl) / STEP)) + 2
    h = [[round(samp(lat_top - r * STEP, lon_left + c * STEP), 3) for c in range(cols)] for r in range(rows)]
    hs = round(samp(lat, lon), 3)
    out['sites'][sid] = {'lat_top': lat_top, 'lon_left': lon_left, 'step_deg': STEP, 'rows': rows, 'cols': cols, 'h_site': hs, 'h': h}
    print(f'{sid}: enlem {lat:+.4f} boylam {lon:+.4f} → h {hs:+.3f} km (r = {R_M + hs:.3f} km), yama {rows}×{cols}')
p = os.path.join(ROOT, 'data', 'site_dems.json')
json.dump(out, open(p, 'w'), separators=(',', ':'))
print(f'{p}: {os.path.getsize(p) // 1024} KB')
