# NRL MSIS 2.1 (Emmert vd. 2021) ile küresel ortalama toplam kütle yoğunluğu tablosu: ln ρ(h, F10.7, Ap) -> msis_tablo.json
# web/js/msis_data.js bu çıktıdan üretilir (impact.js yeniden giriş modeli). Kullanım:
#   python3 -m venv /tmp/msis && /tmp/msis/bin/pip install pymsis && /tmp/msis/bin/python tools/msis_tablo.py
# ardından msis_tablo.json'daki lnrho dizileri, 3 ondalıkla web/js/msis_data.js'e yazılır (sıra: f107, ap, h).
import numpy as np, pymsis, json, sys
H = np.arange(60, 1001, 10.0)
F = np.array([60, 80, 100, 130, 160, 200, 250, 300.0])
AP = np.array([0, 4, 15, 50, 150.0])
lats = np.arange(-87.5, 90, 5.0); w = np.cos(np.radians(lats))           # alan ağırlığı
lons = np.arange(0, 360, 30.0)                                           # sabit UT'de boylam = yerel saat taraması
dates = np.array(['2001-03-20T12:00', '2001-06-21T12:00', '2001-09-22T12:00', '2001-12-21T12:00'], dtype='datetime64[m]')
if '--mevsim' not in sys.argv:
    out = np.zeros((len(F), len(AP), len(H)))
    for i, f in enumerate(F):
        for j, ap in enumerate(AP):
            acc = np.zeros(len(H))
            for d in dates:
                D, LO, LA, AL = np.meshgrid([d], lons, lats, H, indexing='ij')
                n = D.size
                r = pymsis.calculate(D.ravel(), LO.ravel(), LA.ravel(), AL.ravel(), f107s=np.full(n, f), f107as=np.full(n, f), aps=np.full((n, 7), ap), version=2.1)
                rho = r[:, pymsis.Variable.MASS_DENSITY].reshape(len(lons), len(lats), len(H))
                acc += np.tensordot(w, rho.mean(axis=0), axes=(0, 0)) / w.sum()
            out[i, j] = np.log(acc / len(dates))
        print('F', f, file=sys.stderr)
    json.dump({'kaynak': 'NRL MSIS 2.1 (Emmert vd. 2021, pymsis ' + pymsis.__version__ + '); enlem (alan ağırlıklı), yerel saat ve 4 mevsim üzerinden ortalama toplam kütle yoğunluğu, kg/m³; F10.7 = F10.7a (81 gün) ve tüm Ap girdileri eşit',
               'h': H.tolist(), 'f107': F.tolist(), 'ap': AP.tolist(), 'lnrho': np.round(out, 4).tolist()}, open('msis_tablo.json', 'w'))

# ---- Mevsim (yılın günü) düzeltmesi: web/js/msis_mevsim.js
# Yukarıdaki tablo dört mevsim tarihinin ortalamasıdır; termosferin yarı yıllık / yıllık değişimini (Nisan ve Ekim'de en çok, Temmuz'da en az; 400 km'de
# ±%20–30) siler. MSIS 2.1 bu değişimi kendisi içerir: ln ρ(yılın günü) − ln ρ(dört tarih ortalaması), aynı küresel ortalamayla, Ap = 15'te (Ap'ye bağlılığı
# ≤ 0,03), 8 F10.7 düzeyi × 24 yılın günü düğümü (yarım ay; düğüm ortaları) × 60…1000 km (20 km). Değerler ln biriminin binde biri (tamsayı).
# Kullanım: /tmp/msis/bin/python tools/msis_tablo.py --mevsim web/js/msis_mevsim.js
if '--mevsim' in sys.argv:
    OUTJS = sys.argv[sys.argv.index('--mevsim') + 1]
    HS = np.arange(60, 1001, 20.0); ND = 24
    ref = np.array(['2001-03-20T12:00', '2001-06-21T12:00', '2001-09-22T12:00', '2001-12-21T12:00'], dtype='datetime64[m]')
    doy = (np.arange(ND) + 0.5) * 365.0 / ND
    days = np.datetime64('2001-01-01T00:00') + (doy * 1440).astype('timedelta64[m]')
    def gm(d, f, ap=15.0):
        D, LO, LA, AL = np.meshgrid([d], lons, lats, HS, indexing='ij'); n = D.size
        r = pymsis.calculate(D.ravel(), LO.ravel(), LA.ravel(), AL.ravel(), f107s=np.full(n, f), f107as=np.full(n, f), aps=np.full((n, 7), ap), version=2.1)
        rho = r[:, pymsis.Variable.MASS_DENSITY].reshape(len(lons), len(lats), len(HS))
        return np.tensordot(w, rho.mean(axis=0), axes=(0, 0)) / w.sum()
    dl = np.zeros((len(F), ND, len(HS)))
    for i, f in enumerate(F):
        m4 = np.mean([gm(d, f) for d in ref], axis=0)
        for k, d in enumerate(days): dl[i, k] = np.log(gm(d, f) / m4)
    vals = np.round(dl * 1000).astype(int).ravel().tolist()
    with open(OUTJS, 'w') as fh:
        fh.write('// NRL MSIS 2.1 (Emmert vd. 2021) küresel ortalama yoğunluğun yılın gününe bağlı (yarı yıllık + yıllık) değişimi: ln ρ(gün) − ln ρ(dört mevsim tarihi\n')
        fh.write('// ortalaması), msis_data.js ile aynı küresel ortalama; Ap = 15. Üretici: tools/msis_tablo.py --mevsim (pymsis ' + pymsis.__version__ + ').\n')
        fh.write('// Izgara: f107 × gün düğümü (24; düğüm k\'nın ortası yılın (k + 0,5)/24\'ü) × h = 60…1000 km (20 km). d: ln biriminin binde biri (tamsayı), sıra f107, gün, h.\n')
        fh.write('export default {\n  h0: 60, dh: 20, nh: %d, nd: %d,\n  f107: %s,\n  d: [%s],\n};\n' % (len(HS), ND, json.dumps(F.tolist()), ','.join(str(v) for v in vals)))
    print('yazıldı', OUTJS, file=sys.stderr)
