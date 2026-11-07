#!/usr/bin/env python3
# Ana dokuların WebP sürümleri (web/textures/*.webp) ve düşük bellekli cihazlar için önceden küçültülmüş sürümleri (*_lo.webp).
#   python3 tools/doku_webp.py [süzgeç]   (Pillow ≥ 9, WebP desteğiyle; süzgeç verilirse yalnız adı onu içeren dosyalar, ör. earth_clouds)
# Kurallar (web/js/texplan.js ile aynı):
#   - veri haritaları (yükseklik, normal, özyansıma; PNG) KAYIPSIZ WebP: çözülen pikseller özgünle bayt bayt aynı (betik denetler)
#   - fotoğraf dokuları kalite 90 (yıldızlar dahil), Ay normal haritası 92; PSNR ≥ 40 dB olmalı (betik denetler)
#   - bulut haritası özgünde R = G = B: tek kanal (gri) kodlanır, gölgelendirici yalnız .r okur. Kalite 80 (eşik 36 dB): 90'da 42 dB ama
#     10,2 MB (tüm doku indirmesinin ~%40'ı); 80'de 6,8 MB, 37 dB. Bulut yarı saydam ve yumuşak: ekran görüntüsü karşılaştırmasında fark yok
#   - _lo: texplan.js'teki "lo" boyutuna Lanczos ile küçültülmüş, aynı kalite (eskiden telefon 8192'lik dosyayı indirip küçültüyordu).
#     Ay yükseklik haritası (16 bit, R yüksek / G düşük bayt) piksel olarak değil yükseklik olarak 2×2 ortalanır, yeniden paketlenir, kayıpsız.
#     _lo dosyaları her cihazda ilk iner; masaüstü tam çözünürlüğü sonra alır (scene.js: Dünya hemen, Ay yaklaşınca).
# Özgün JPG/PNG dosyaları silinmez: WebP çözemeyen tarayıcıda yedek olarak kullanılır (texload.js).
import io, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'textures')
# dosya, kip (rgb | gray | lossless), kalite, lo boyutu (texplan.js "lo")
PLAN = [
    ('earth_day.jpg', 'rgb', 90, (4096, 2048)),
    ('earth_night.jpg', 'rgb', 90, (4096, 2048)),
    ('earth_clouds.jpg', 'gray', 80, (4096, 2048)),
    ('earth_spec.png', 'lossless', 0, None),
    ('earth_normal.png', 'lossless', 0, None),
    ('moon_color.jpg', 'rgb', 90, (4096, 2048)),
    ('moon_normal.jpg', 'rgb', 92, (2880, 1440)),
    ('moon_height.png', 'lossless', 0, (1440, 720)),
    ('stars.jpg', 'rgb', 90, (4096, 2048)),
]

MIN_PSNR = {'earth_clouds.jpg': 36}          # öteki kayıplı dokular 40 dB
ONLY = sys.argv[1] if len(sys.argv) > 1 else ''


def psnr(a, b):
    m = np.mean((a.astype(np.float64) - b.astype(np.float64)) ** 2)
    return 99.0 if m == 0 else 10 * np.log10(255 ** 2 / m)

def encode(img, kind, q):
    b = io.BytesIO()
    if kind == 'lossless': img.save(b, 'WEBP', lossless=True, quality=100, method=6)
    else: img.save(b, 'WEBP', quality=q, method=6)
    return b.getvalue()

def decoded(data, gray):
    d = Image.open(io.BytesIO(data)); d.load(); a = np.asarray(d)
    return a[..., 0] if gray and a.ndim == 3 else a

ok = True
tot0 = tot1 = totlo = 0
for f, kind, q, lo in PLAN:
    if ONLY not in f:
        continue
    src = Image.open(os.path.join(ROOT, f)); src.load(); a = np.asarray(src.convert('RGB'))
    gray = kind == 'gray'
    if gray:
        if not ((a[..., 0] == a[..., 1]).all() and (a[..., 1] == a[..., 2]).all()): sys.exit(f'{f}: R=G=B değil, gri kodlanamaz')
        img, ref = Image.fromarray(a[..., 0]), a[..., 0]
    else:
        img, ref = src.convert('RGB'), a
    data = encode(img, kind, q)
    p = psnr(ref, decoded(data, gray)); exact = np.array_equal(ref, decoded(data, gray))
    if kind == 'lossless' and not exact: ok = False; print(f'HATA {f}: kayıpsız değil')
    if kind != 'lossless' and p < MIN_PSNR.get(f, 40): ok = False; print(f'HATA {f}: PSNR {p:.1f} < {MIN_PSNR.get(f, 40)}')
    base = f.rsplit('.', 1)[0]
    open(os.path.join(ROOT, base + '.webp'), 'wb').write(data)
    s0 = os.path.getsize(os.path.join(ROOT, f)); tot0 += s0; tot1 += len(data)
    line = f'{f}: {s0 // 1024} KB → {base}.webp {len(data) // 1024} KB ({"kayıpsız, eşit" if exact else f"PSNR {p:.1f} dB"})'
    if lo and f == 'moon_height.png':        # paketli 16 bit yükseklik: yükseklik alanında 2×2 ortalama (bayt ortalaması değeri bozar)
        h = a[..., 0].astype(np.int64) * 256 + a[..., 1]
        H, W = h.shape; assert (W // lo[0], H // lo[1]) == (2, 2), 'yükseklik haritası tam 2 kat küçültülür'
        m = (h.reshape(H // 2, 2, W // 2, 2).sum(axis=(1, 3)) + 2) // 4
        small = Image.fromarray(np.stack([m // 256, m % 256, np.zeros_like(m)], -1).astype(np.uint8), 'RGB')
    elif lo:
        small = img.resize(lo, Image.LANCZOS)
    if lo:
        dl = encode(small, kind, q); totlo += len(dl)
        open(os.path.join(ROOT, base + '_lo.webp'), 'wb').write(dl)
        line += f' · {base}_lo.webp {lo[0]}×{lo[1]} {len(dl) // 1024} KB'
    else:
        totlo += len(data)
    print(line, flush=True)
print(f'toplam: {tot0 / 1e6:.1f} MB → {tot1 / 1e6:.1f} MB (masaüstü), {totlo / 1e6:.1f} MB (düşük bellek)')
sys.exit(0 if ok else 1)
