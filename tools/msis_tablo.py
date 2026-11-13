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
