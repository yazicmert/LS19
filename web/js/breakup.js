// NASA Standart Parçalanma Modeli (saf hesap; tarayıcı ve Node).
// Johnson, Krisko, Liou & Anz-Meador (2001) "NASA's new breakup model of EVOLVE 4.0", Advances in Space Research 28(9), 1377–1384.
// Parametreler ESA'nın doğrulanmış uygulamasıyla (esa/NASA-breakup-model-cpp, Schuhmacher vd. 2021) karşılaştırıldı.
//   • Çarpışma felaket sayılır: EMR = ½ m_p v² / m_t ≥ 40 J/g (m_p küçük, m_t büyük cisim).
//   • Parça sayısı (Lc'den büyük): N(Lc) = 0,1 M^0,75 Lc^−1,71; felaket ise M = m_t + m_p, değilse M = m_p v² (kg, km/s).
//   • Patlama: N(Lc) = 6 S Lc^−1,6.
//   • Alan/kütle: Lc > 11 cm iki doruklu karışım α N(μ1,σ1) + (1−α) N(μ2,σ2) (χ = log10 A/M), Lc < 8 cm tek normal, arası doğrusal köprü.
//   • Ortalama kesit alanı: A = 0,540424 Lc² (Lc < 1,67 mm), 0,556945 Lc^2,0047077; ayrılma hızı: log10 Δv ~ N(0,9 χ + 2,9; 0,4) (çarpışma),
//     N(0,2 χ + 1,85; 0,4) (patlama), yön eşyönlü. Uydunun karakteristik boyutu: Lc = (6 m / (92,937 π))^(1/2,26).
const MU = 398600.4418, RE = 6378.137;

export function charLengthFromMass(m) { return Math.pow(6 * m / (92.937 * Math.PI), 1 / 2.26); }
export function area(Lc) { return Lc < 0.00167 ? 0.540424 * Lc * Lc : 0.556945 * Math.pow(Lc, 2.0047077); }

// mT, mP: kütleler (kg; sıra önemsiz), vRel (km/s)
export function collision(mA, mB, vRel) {
  const mT = Math.max(mA, mB), mP = Math.min(mA, mB);
  const emr = 0.5 * mP * (vRel * 1000) ** 2 / mT / 1000;                                    // J/g
  const catastrophic = emr >= 40;
  const M = catastrophic ? mT + mP : mP * vRel * vRel;
  const N = (Lc) => 0.1 * Math.pow(M, 0.75) * Math.pow(Lc, -1.71);
  return { mT, mP, vRel, emr, catastrophic, M, N, N1cm: N(0.01), N10cm: N(0.1), N1m: N(1), Lmax: charLengthFromMass(mT) };
}
export function explosion(S = 1) { const N = (Lc) => 6 * S * Math.pow(Lc, -1.6); return { N, N1cm: N(0.01), N10cm: N(0.1), N1m: N(1) }; }

// alan/kütle dağılımı parametreleri (λ = log10 Lc); type: 'uydu' | 'roket'
const clamp = (x, lo, hi, yLo, yHi, f) => (x <= lo ? yLo : x >= hi ? yHi : f(x));
export function amParams(lambda, type = 'uydu') {
  const rb = type === 'roket';
  return {
    alpha: rb ? clamp(lambda, -1.4, 0, 1, 0.5, (l) => 1 - 0.3571 * (l + 1.4)) : clamp(lambda, -1.95, 0.55, 0, 1, (l) => 0.3 + 0.4 * (l + 1.2)),
    mu1: rb ? clamp(lambda, -0.5, 0, -0.45, -0.9, (l) => -0.45 - 0.9 * (l + 0.5)) : clamp(lambda, -1.1, 0, -0.6, -0.95, (l) => -0.6 - 0.318 * (l + 1.1)),
    s1: rb ? 0.55 : clamp(lambda, -1.3, -0.3, 0.1, 0.3, (l) => 0.1 + 0.2 * (l + 1.3)),
    mu2: rb ? -0.9 : clamp(lambda, -0.7, -0.1, -1.2, -2.0, (l) => -1.2 - 1.333 * (l + 0.7)),
    s2: rb ? clamp(lambda, -1, 0.1, 0.28, 0.1, (l) => 0.28 - 0.1636 * (l + 1)) : clamp(lambda, -0.5, -0.3, 0.5, 0.3, (l) => 0.5 - (l + 0.5)),
    muS: clamp(lambda, -1.75, -1.25, -0.3, -1.0, (l) => -0.3 - 1.4 * (l + 1.75)),
    sS: lambda <= -3.5 ? 0.2 : 0.2 + 0.1333 * (lambda + 3.5),
  };
}
// tekrarlanabilir rastgele sayı (mulberry32) ve normal dağılım (Box–Muller)
export function rng(seed = 1) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const n = () => { let x = 0; while (x === 0) x = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u()); };
  return { u, n };
}
export function sampleChi(Lc, type, R) {
  const p = amParams(Math.log10(Lc), type);
  const big = () => (R.u() < p.alpha ? p.mu1 + p.s1 * R.n() : p.mu2 + p.s2 * R.n());
  const small = () => p.muS + p.sS * R.n();
  if (Lc > 0.11) return big();
  if (Lc < 0.08) return small();
  const y1 = 10 ** big(), y0 = 10 ** small();                                                       // 8–11 cm doğrusal köprü (A/M uzayında)
  return Math.log10(y0 + (Lc - 0.08) * (y1 - y0) / 0.03);
}
// parça örnekle: Lc güç yasası (N ∝ Lc^−1,71 ⇒ yoğunluk ∝ Lc^−2,71), A/M, kütle, Δv (m/s) ve eşyönlü yön
export function sampleFragments({ n, LcMin = 0.1, LcMax = 1, type = 'uydu', kind = 'carpisma', seed = 7 }) {
  const R = rng(seed), out = [], e = -1.71;
  for (let i = 0; i < n; i++) {
    const y = R.u(), Lc = Math.pow((Math.pow(LcMax, e) - Math.pow(LcMin, e)) * y + Math.pow(LcMin, e), 1 / e);
    const chi = sampleChi(Lc, type, R), am = 10 ** chi, A = area(Lc), m = A / am;
    const nu = (kind === 'carpisma' ? 0.9 * chi + 2.9 : 0.2 * chi + 1.85) + 0.4 * R.n(), dv = 10 ** nu;
    const z = 2 * R.u() - 1, ph = 2 * Math.PI * R.u(), s = Math.sqrt(1 - z * z);
    out.push({ Lc, am, A, m, dv, dir: [s * Math.cos(ph), s * Math.sin(ph), z] });
  }
  return out;
}
// Gabbard çizelgesi: parçaların yörünge periyodu, yer yüksekliği (apoje/perije) — r (km), v (km/s) çarpışma anı durumu
export function gabbard(frags, r, v) {
  const out = [];
  for (const f of frags) {
    const vv = [v[0] + f.dv * f.dir[0] / 1000, v[1] + f.dv * f.dir[1] / 1000, v[2] + f.dv * f.dir[2] / 1000];
    const R = Math.hypot(...r), V2 = vv[0] ** 2 + vv[1] ** 2 + vv[2] ** 2, en = V2 / 2 - MU / R;
    if (en >= 0) { out.push({ escape: true }); continue; }
    const a = -MU / (2 * en), h = [r[1] * vv[2] - r[2] * vv[1], r[2] * vv[0] - r[0] * vv[2], r[0] * vv[1] - r[1] * vv[0]];
    const e = Math.sqrt(Math.max(0, 1 - (h[0] ** 2 + h[1] ** 2 + h[2] ** 2) / (MU * a)));
    out.push({ a, e, P: 2 * Math.PI * Math.sqrt(a ** 3 / MU) / 60, hp: a * (1 - e) - RE, ha: a * (1 + e) - RE, am: f.am, Lc: f.Lc });
  }
  return out;
}
