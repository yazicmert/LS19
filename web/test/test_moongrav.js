// Ay çekim alanı (GRAIL GRGM1200A, js/moongrav.js) denetimi:
//   1) potansiyel, bağımsız normalleştirilmiş Legendre toplamıyla aynı
//   2) ivme, potansiyelin sayısal gradyanıyla aynı (100. derece, yüzeyde ve yörüngede)
//   3) 2. derece, motordaki kapalı biçimli J2/C22 terimiyle aynı (J2 = −√5·C̄20, C22 = √(5/12)·C̄22)
//   4) alçak irtifa ızgarası (≤ 30 km): aradeğerleme hatası ≤ 0,01 mm/s² (60. derecenin kesme hatası ~0,4 mm/s²)
//   5) motor: OPTS.moonGravDeg = 0 eski J2/C22'ye döner; uzakta (≥ 20 000 km) yüksek dereceler etkisiz
import { moonHarmonic, moonHarmonicPotential, moonGravity, degreeAt } from '../js/moongrav.js';
import { GRGM } from '../js/moongrav_data.js';
import fs from 'node:fs';
import * as E from '../js/engine.js';
E.loadEphemeris(JSON.parse(fs.readFileSync(new URL('../data/rocsim_eph_2026Q4.json', import.meta.url))));

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const mu = E.MU_M, nrm = (a) => Math.hypot(a[0], a[1], a[2]), dif = (a, b) => nrm([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
const idx = (n, m) => (n * (n + 1)) / 2 + m;

function legendreU(p, N) {                 // bağımsız: enlem/boylamla normalleştirilmiş Legendre (sütun özyinelemesi)
  const r = nrm(p), t = p[2] / r, u = Math.sqrt(1 - t * t), lam = Math.atan2(p[1], p[0]);
  const P = []; for (let n = 0; n <= N; n++) P.push(new Float64Array(n + 1));
  P[0][0] = 1; P[1][1] = Math.sqrt(3) * u;
  for (let m = 2; m <= N; m++) P[m][m] = u * Math.sqrt((2 * m + 1) / (2 * m)) * P[m - 1][m - 1];
  for (let m = 0; m <= N; m++) for (let n = m + 1; n <= N; n++) {
    const a = Math.sqrt(((2 * n - 1) * (2 * n + 1)) / ((n - m) * (n + m)));
    const b = n - m >= 2 ? Math.sqrt(((2 * n + 1) * (n + m - 1) * (n - m - 1)) / ((n - m) * (n + m) * (2 * n - 3))) : 0;
    P[n][m] = a * t * P[n - 1][m] - (n - m >= 2 ? b * P[n - 2][m] : 0);
  }
  let s = 0;
  for (let n = 2; n <= N; n++) {
    const f = (GRGM.R / r) ** n;
    for (let m = 0; m <= n; m++) s += f * P[n][m] * (GRGM.C[idx(n, m)] * Math.cos(m * lam) + GRGM.S[idx(n, m)] * Math.sin(m * lam));
  }
  return (mu / r) * s;
}

check('veri: GRGM1200A, R = 1738 km, 100. derece', GRGM.model === 'GRGM1200A' && GRGM.R === 1738 && GRGM.N === 100 && GRGM.C.length === idx(100, 100) + 1);
const J2 = -Math.sqrt(5) * GRGM.C[idx(2, 0)], C22 = Math.sqrt(5 / 12) * GRGM.C[idx(2, 2)];
check('2. derece motor sabitleriyle uyumlu', Math.abs(J2 / E.J2_M - 1) < 1e-4 && Math.abs(C22 / E.C22_M - 1) < 1e-3,
  `J2 ${J2.toExponential(5)} / ${E.J2_M}, C22 ${C22.toExponential(5)} / ${E.C22_M}`);

const pts = [[1800, 300, -200], [-900, 1200, 1100], [100, -50, 1845], [1740, 0, 5], [3000, -4000, 2000]];
let eU = 0, eG = 0;
for (const p of pts) {
  const U = moonHarmonicPotential(p, mu, 100);
  eU = Math.max(eU, Math.abs(U / legendreU(p, 100) - 1));
  const a = moonHarmonic(p, mu, 100), h = 1e-3, N = degreeAt(nrm(p), 100);           // uzakta derece kısalır: gradyan aynı dereceyle
  const g = [0, 1, 2].map((i) => { const pp = p.slice(), pm = p.slice(); pp[i] += h; pm[i] -= h; return (moonHarmonicPotential(pp, mu, N) - moonHarmonicPotential(pm, mu, N)) / (2 * h); });
  eG = Math.max(eG, dif(a, g) / nrm(a));
}
check('potansiyel = bağımsız Legendre toplamı (100. derece)', eU < 1e-12, `en büyük göreli fark ${eU.toExponential(1)}`);
check('ivme = potansiyelin gradyanı (100. derece)', eG < 1e-7, `en büyük göreli fark ${eG.toExponential(1)}`);

let e2 = 0;
for (const p of pts) {
  const [x, y, zz] = p, rn2 = x * x + y * y + zz * zz, rn = Math.sqrt(rn2), Rr = E.R_M_REF ** 2, r5 = rn2 * rn2 * rn, r7 = r5 * rn2;
  const kJ = (-1.5 * E.J2_M * mu * Rr) / r5, q = (5 * zz * zz) / rn2, kC = 3 * mu * Rr * E.C22_M, w = x * x - y * y;
  const old = [kJ * x * (1 - q) + kC * (2 * x / r5 - 5 * w * x / r7), kJ * y * (1 - q) + kC * (-2 * y / r5 - 5 * w * y / r7), kJ * zz * (3 - q) + kC * (-5 * w * zz / r7)];
  e2 = Math.max(e2, dif(moonHarmonic(p, mu, 2), old) / nrm(old));
}
check('2. derece = kapalı biçimli J2/C22 (C21, S21, S22 ≈ 0)', e2 < 1e-4, `en büyük göreli fark ${e2.toExponential(1)}`);

// 100 km'de yüksek derecelerin payı (maskonlar): J2/C22'den belirgin farklı olmalı
const pL = [1837.4, 0, 0];
const aFull = moonHarmonic(pL, mu, 60), a2 = moonHarmonic(pL, mu, 2);
check('100 km\'de 3–60. derece katkısı belirgin (≥ 0,05 mm/s²)', dif(aFull, a2) * 1e6 > 0.05, `${(dif(aFull, a2) * 1e6).toFixed(3)} mm/s²`);
check('derece uzaklıkla kısalır', degreeAt(1838, 60) === 60 && degreeAt(5000, 60) <= 12 && degreeAt(20000, 60) <= 7 && degreeAt(150000, 60) <= 6,
  `1838 km: ${degreeAt(1838, 60)}, 5000 km: ${degreeAt(5000, 60)}, 20 000 km: ${degreeAt(20000, 60)}, 150 000 km: ${degreeAt(150000, 60)}`);

{
  let mx = 0;
  for (let i = 0; i < 2000; i++) {
    const r = 1737.4 + 0.5 + 29 * ((i * 0.7548) % 1), z = 2 * ((i * 0.618034) % 1) - 1, l = i * 2.39996, c = Math.sqrt(1 - z * z);
    const p = [r * c * Math.cos(l), r * c * Math.sin(l), r * z];
    mx = Math.max(mx, dif(moonHarmonic(p, mu, 60), moonGravity(p, mu, 60)));
  }
  let mf = 0;                                                                     // kısa adım (fine): 30–200 km de ızgaradan
  for (let i = 0; i < 2000; i++) {
    const r = 1737.4 + 30 + 170 * ((i * 0.7548) % 1), z = 2 * ((i * 0.618034) % 1) - 1, l = i * 2.39996, c = Math.sqrt(1 - z * z);
    const p = [r * c * Math.cos(l), r * c * Math.sin(l), r * z];
    mf = Math.max(mf, dif(moonHarmonic(p, mu, 60), moonGravity(p, mu, 60, true)));
  }
  check('kısa adımda 30–200 km ızgarası: aradeğerleme hatası ≤ 0,01 mm/s²', mf * 1e6 < 0.01, `en büyük ${(mf * 1e6).toFixed(4)} mm/s²`);
  const far = [1900, 100, -50];
  check('alçak irtifa ızgarası: aradeğerleme hatası ≤ 0,01 mm/s²; 30 km üstünde doğrudan', mx * 1e6 < 0.01 && dif(moonGravity(far, mu, 60), moonHarmonic(far, mu, 60)) === 0,
    `en büyük ${(mx * 1e6).toFixed(4)} mm/s²`);
}

// motor: Ay merkezli çerçevede ivme farkı
const t = 3 * 86400, rLow = [1837.4, 0, 0], rFar = [25000, 3000, -2000], thr = null;
const run = (deg, r) => { const o = E.OPTS.moonGravDeg; E.OPTS.moonGravDeg = deg; const a = E.accel(t, r, 'M', thr); E.OPTS.moonGravDeg = o; return a; };
{
  const dLow = dif(run(60, rLow), run(0, rLow)) * 1e6, dFar = dif(run(60, rFar), run(0, rFar)) * 1e6;
  check('motor: 100 km\'de GRAIL ile J2/C22 farkı belirgin, 25 000 km\'de ihmal edilebilir', dLow > 0.05 && dFar < 1e-6,
    `${dLow.toFixed(3)} mm/s², ${dFar.toExponential(1)} mm/s²`);
}

console.log(fail ? `\n${fail} HATA` : '\nTüm Ay çekim alanı testleri geçti');
process.exit(fail ? 1 : 0);
