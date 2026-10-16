// Uydu yeniden giriş deneyi (saf hesap; tarayıcı ve Node).
//   1) Yörünge bozunması: balistik katsayı BC = m/(Cd A) ile sürüklenme; yörünge ortalamalı Gauss denklemleri (dairesel: da/dt = −ρ √(μa)/BC),
//      perije 120 km'ye inince "yeniden giriş arayüzü". Atmosfer: Vallado (2013, Tablo 8-4) durağan üstel modeli ya da Güneş etkinliğine duyarlı
//      model: 180 km üstünde ρ = 6·10⁻¹⁰ exp(−(h−175)/Hs) kg/m³, Hs = T/μ (km), T = 900 + 2,5 (F10,7 − 70) + 1,5 Ap (K), μ = 27 − 0,012 (h − 200)
//      (Avustralya IPS uydu bozunması yöntemi; Jacchia 1970'e dayanır, 180–500 km için), 150 km altında Vallado, arası logaritmik geçiş.
//   2) Atmosfere giriş: 120 km'den küresel, dönmeyen Dünya'da düzlemsel balistik giriş (kaldırma yok):
//      dv/dt = −ρv²/(2BC) − g sinγ, dγ/dt = (v/r − g/v) cosγ, dh/dt = v sinγ; durma noktası ısı akısı Sutton–Graves (q = 1,7415·10⁻⁴ √(ρ/rn) v³).
//      Parçalanma için ESA/NASA uygulamasındaki geleneksel 78 km varsayımı raporlanır (gerçek parçalanma tasarıma bağlıdır).
// Sınırlar: Güneş etkinliği gelecekte bilinmez (ömür ±%20–50 ve daha fazla); dönmeyen atmosfer; tek parçalı küresel olmayan cisim (BC sabit).
import { atmosphereDensity } from './impact.js';
export const MU = 398600.4418, RE = 6378.137, G0 = 9.80665;
const DAY = 86400, REENTRY_KM = 120;

export function ipsDensity(h, F107 = 150, Ap = 15) {                                                // kg/m³, 180–500 km için
  const T = 900 + 2.5 * (F107 - 70) + 1.5 * Ap, mu = 27 - 0.012 * (h - 200), Hs = T / mu;
  return 6e-10 * Math.exp(-(h - 175) / Hs);
}
// model: 'vallado' | 'gunes'
export function density(h, model = 'vallado', F107 = 150, Ap = 15) {
  if (model !== 'gunes') return atmosphereDensity(h);
  if (h >= 180) return ipsDensity(h, F107, Ap);
  if (h <= 150) return atmosphereDensity(h);
  const w = (h - 150) / 30, a = Math.log(atmosphereDensity(h)), b = Math.log(ipsDensity(h, F107, Ap));
  return Math.exp(a + (b - a) * w);
}
// yörünge ortalamalı türevler: a (km), e; BC (kg/m²); dönüş da/dt (km/s), de/dt (1/s)
function derivs(a, e, BC, rhoAt) {
  const K = 1e3 / BC;                                                                                 // ρ [kg/m³]·K → 1/km (ρ/BC, km⁻¹)
  if (a * e < 4) { const v = Math.sqrt(MU / a), kr = rhoAt(a - RE) * K; return [-(a * a / MU) * kr * v ** 3, 0]; }
  const N = e < 0.02 ? 12 : 24; let sV3 = 0, sV = 0;
  for (let k = 0; k < N; k++) {
    const E = (2 * Math.PI * (k + 0.5)) / N, cE = Math.cos(E), r = a * (1 - e * cE), v = Math.sqrt(MU * (2 / r - 1 / a)), w = (1 - e * cE) / N, kr = rhoAt(r - RE) * K;
    sV3 += w * kr * v ** 3; sV += w * kr * v;
  }
  const dadt = -(a * a / MU) * sV3, dedt = e < 1e-5 ? 0 : ((1 - e * e) / e) * (0.5 * sV + 0.5 * dadt / a);
  return [dadt, dedt];
}
// a0 (km), e0, BC (kg/m²), atmosfer seçenekleri -> ömür ve yükseklik eğrisi [gün, perije, apoje]
export function decay({ a0, e0 = 0, BC, model = 'vallado', F107 = 150, Ap = 15, maxYears = 200, rhoFn = null }) {
  const rhoAt = rhoFn || ((h) => density(h, model, F107, Ap));                                   // rhoFn: sınama için özel atmosfer
  let a = a0, e = e0, t = 0, hp = a * (1 - e) - RE, steps = 0, nextRec = 0;
  const curve = [[0, hp, a * (1 + e) - RE]], maxT = maxYears * 365.25 * DAY;
  if (hp <= REENTRY_KM) return { lifeDays: 0, curve, a, e, entered: true };
  while (hp > REENTRY_KM && t < maxT && steps < 200000) {
    const [dadt, dedt] = derivs(a, e, BC, rhoAt), drp = dadt * (1 - e) - a * dedt;
    const H = Math.max(5, (hp < 180 ? 8 : 40)), dt = Math.min(30 * DAY, Math.max(20, 0.02 * H / Math.max(-drp, 1e-18)));
    a += dadt * dt; e = Math.max(0, e + dedt * dt); t += dt; steps++; hp = a * (1 - e) - RE;
    if (t >= nextRec) { curve.push([t / DAY, hp, a * (1 + e) - RE]); nextRec = t * 1.04 + 3600; }
  }
  const entered = hp <= REENTRY_KM;
  if (entered) curve.push([t / DAY, REENTRY_KM, Math.max(REENTRY_KM, a * (1 + e) - RE)]);
  const [dadt0] = derivs(a0, e0, BC, rhoAt);
  return { lifeDays: entered ? t / DAY : Infinity, curve, entered, decayNowKmDay: dadt0 * DAY, periodMin: 2 * Math.PI * Math.sqrt(a0 ** 3 / MU) / 60 };
}
// B* (1/Yarıçap) -> eşdeğer BC: B* = ρ0 Cd A /(2m), ρ0 = 0,1570 kg/m²/Rₑ (SGP4 tanımı)
export const bcFromBstar = (bstar) => (bstar > 0 ? 0.157 / (2 * bstar) : Infinity);

// 120 km'den balistik giriş: v0 (km/s), gamma0Deg (aşağı negatif), BC (kg/m²), rn burun yarıçapı (m)
export function entry({ v0 = 7.8, gamma0Deg = -0.1, BC = 100, rn = 1, h0 = 120, breakupKm = 78 }) {
  let v = v0 * 1000, g = gamma0Deg * Math.PI / 180, h = h0 * 1000, s = 0, t = 0, heat = 0;
  const R = RE * 1000, mu = MU * 1e9, rho = (hm) => atmosphereDensity(hm / 1000);
  const f = (vv, gg, hh) => {
    const r = R + hh, gr = mu / (r * r), q = rho(hh), D = q * vv * vv / (2 * BC);
    return { dv: -D - gr * Math.sin(gg), dg: (vv / r - gr / vv) * Math.cos(gg), dh: vv * Math.sin(gg), ds: (R / r) * vv * Math.cos(gg), acc: D, q: 1.7415e-4 * Math.sqrt(q / rn) * vv ** 3 };
  };
  let peakG = 0, peakGh = 0, peakQ = 0, peakQh = 0, tBreak = null, sBreak = null, vBreak = null;
  const tr = [];
  let dt = 0.5;
  while (h > 0 && v > 50 && t < 7200) {
    const k1 = f(v, g, h), k2 = f(v + dt / 2 * k1.dv, g + dt / 2 * k1.dg, h + dt / 2 * k1.dh), k3 = f(v + dt / 2 * k2.dv, g + dt / 2 * k2.dg, h + dt / 2 * k2.dh), k4 = f(v + dt * k3.dv, g + dt * k3.dg, h + dt * k3.dh);
    v += dt / 6 * (k1.dv + 2 * k2.dv + 2 * k3.dv + k4.dv); g += dt / 6 * (k1.dg + 2 * k2.dg + 2 * k3.dg + k4.dg);
    const hN = h + dt / 6 * (k1.dh + 2 * k2.dh + 2 * k3.dh + k4.dh); s += dt / 6 * (k1.ds + 2 * k2.ds + 2 * k3.ds + k4.ds); t += dt;
    heat += k1.q * dt;
    if (k1.acc / G0 > peakG) { peakG = k1.acc / G0; peakGh = h / 1000; }
    if (k1.q > peakQ) { peakQ = k1.q; peakQh = h / 1000; }
    if (tBreak == null && hN <= breakupKm * 1000) { tBreak = t; sBreak = s / 1000; vBreak = v / 1000; }
    h = hN;
    if (tr.length === 0 || t - tr[tr.length - 1][0] >= 5) tr.push([t, h / 1000, v / 1000, k1.acc / G0, k1.q / 1e4, s / 1000]);
    dt = h > 100e3 ? 2 : 0.25;
  }
  return { peakG, peakGh, peakQ, peakQh, heatLoad: heat, tBreak, sBreak, vBreak, tGround: t, sGround: s / 1000, vGround: v / 1000, track: tr };
}
// yörünge eğiminden yer izi enlem bandı ve yeniden girişin enlemlere düşme sıklığı (dairesel yörünge: p(φ) ∝ cosφ / √(sin²i − sin²φ))
export function latitudeBand(incDeg, bins = 18) {
  const i = Math.min(incDeg, 180 - incDeg) * Math.PI / 180, out = [];
  for (let b = 0; b < bins; b++) {
    const lo = -90 + b * 180 / bins, hi = lo + 180 / bins, f = (phi) => (Math.abs(phi) >= i ? Math.sign(phi) * 0.5 : Math.asin(Math.sin(phi) / Math.sin(i)) / Math.PI);
    out.push({ lo, hi, p: Math.max(0, f(hi * Math.PI / 180) - f(lo * Math.PI / 180)) });
  }
  return out;
}
