// Çarpma / yeniden giriş tahmini (saf hesap; tarayıcı ve Node).
//
// UYDULAR — yörünge bozunması (manevra yapılmazsa doğal yeniden giriş):
//   • Sürüklenme genliği CelesTrak GP kaydındaki B*'tan (SGP4'ün kendi yoğunluk modeliyle tutarlı: ρ ∝ ((q0−s)/(r−s))⁴) bulunur;
//     B* yoksa MEAN_MOTION_DOT'tan (gözlenen bozunma) alınır. İkisi de varsa tutarlılığı güven düzeyine yansır.
//   • Yükseklikle değişim Vallado'nun üstel atmosferinden (ortalama Güneş aktivitesi) alınır; yeniden giriş 120 km perije.
//   • Dairesel yörünge: da/dt = −KρÖ √(μa). Eksantrik yörünge: a ve e için yörünge ortalamalı (Gauss) denklemler, 12–24 noktalı toplama.
//   • Sınırlar: Güneş aktivitesi gelecekte değişir (yüzyıllık tahminler ±2–5×); küre biçimli Dünya; Starlink gibi aktif uydular yörüngelerini korur.
//
// ASTEROİTLER — JPL Sentry (sanal çarpıcılar): olasılık ve olası yıllar. Bilinen kesin çarpma yoktur.
const MU = 398600.4418, RE = 6378.135, DAY = 86400;
const REENTRY_KM = 120, MAX_DAYS = 300 * 365.25;

// Vallado (Fundamentals of Astrodynamics, Tablo 8-4): taban yükseklik km, ρ0 kg/m³, ölçek yüksekliği km (ortalama Güneş aktivitesi)
const ATM = [[0, 1.225, 7.249], [25, 3.899e-2, 6.349], [30, 1.774e-2, 6.682], [40, 3.972e-3, 7.554], [50, 1.057e-3, 8.382], [60, 3.206e-4, 7.714], [70, 8.770e-5, 6.549],
  [80, 1.905e-5, 5.799], [90, 3.396e-6, 5.382], [100, 5.297e-7, 5.877], [110, 9.661e-8, 7.263], [120, 2.438e-8, 9.473], [130, 8.484e-9, 12.636], [140, 3.845e-9, 16.149],
  [150, 2.070e-9, 22.523], [180, 5.464e-10, 29.740], [200, 2.789e-10, 37.105], [250, 7.248e-11, 45.546], [300, 2.418e-11, 53.628], [350, 9.158e-12, 53.298],
  [400, 3.725e-12, 58.515], [450, 1.585e-12, 60.828], [500, 6.967e-13, 63.822], [600, 1.454e-13, 71.835], [700, 3.614e-14, 88.667], [800, 1.170e-14, 124.64],
  [900, 5.245e-15, 181.05], [1000, 3.019e-15, 268.0]];
const GRID_N = 1800, LNRHO = new Float64Array(GRID_N + 1), SCALEH = new Float64Array(GRID_N + 1);
(() => {
  for (let h = 0; h <= GRID_N; h++) {
    let k = 0; while (k + 1 < ATM.length && ATM[k + 1][0] <= h) k++;
    const [h0, r0, H] = ATM[k]; LNRHO[h] = Math.log(r0) - (h - h0) / H; SCALEH[h] = H;
  }
})();
const lnrho = (h) => (h <= 0 ? LNRHO[0] : h >= GRID_N ? LNRHO[GRID_N] - (h - GRID_N) / 268 : LNRHO[h | 0] + (LNRHO[Math.min(GRID_N, (h | 0) + 1)] - LNRHO[h | 0]) * (h - (h | 0)));
const scaleH = (h) => SCALEH[Math.max(0, Math.min(GRID_N, h | 0))];
export const atmosphereDensity = (hKm) => Math.exp(lnrho(hKm));       // kg/m³

// SGP4'ün B*-yoğunluk modeli: perijedeki K·ρ (1/km) = 2 B* ((q0−s)/(r−s))⁴ / Rₑ
function kRhoFromBstar(bstar, hpKm) {
  const sAlt = hpKm >= 156 ? 78 : hpKm >= 98 ? hpKm - 78 : 20;
  const q0 = 1 + 120 / RE, s = 1 + sAlt / RE, r = (RE + hpKm) / RE;
  if (r - s <= 0 || q0 - s <= 0) return 0;
  return 2 * bstar * ((q0 - s) / (r - s)) ** 4 / RE;
}
// gözlenen bozunmadan (MEAN_MOTION_DOT, tur/gün²) K·ρ (1/km): dairesel yaklaşım
function kRhoFromNdot(ndotRevDay2, a) {
  const n = Math.sqrt(MU / a ** 3), dn = 2 * ndotRevDay2 * 2 * Math.PI / DAY ** 2;          // rad/s, rad/s²
  const dadt = -(2 * a / (3 * n)) * dn;                                                      // km/s (negatif = alçalıyor)
  return -dadt / Math.sqrt(MU * a);
}

// a (km), e, K·ρ0 (1/km, perije yüksekliği hp0'daki değer) -> yörünge ortalamalı türevler
function derivs(a, e, kr0, lnr0) {
  if (a * e < 4) {                                                                           // dairesel: e ≈ 0 kalır, yükseklik = a − Rₑ
    const v = Math.sqrt(MU / a), kr = kr0 * Math.exp(lnrho(a - RE) - lnr0);
    return [-(a * a / MU) * kr * v ** 3, 0];
  }
  const N = e < 0.02 ? 12 : 24;
  let sV3 = 0, sV = 0;
  for (let k = 0; k < N; k++) {
    const E = (2 * Math.PI * (k + 0.5)) / N, cE = Math.cos(E), r = a * (1 - e * cE), v = Math.sqrt(MU * (2 / r - 1 / a));
    const w = (1 - e * cE) / N, kr = kr0 * Math.exp(lnrho(r - RE) - lnr0);
    sV3 += w * kr * v ** 3; sV += w * kr * v;
  }
  const dadt = -(a * a / MU) * sV3;                                                          // km/s
  const dedt = e < 1e-5 ? 0 : ((1 - e * e) / e) * (0.5 * sV + 0.5 * dadt / a);               // 1/s
  return [dadt, dedt];
}

// o: CelesTrak GP (OMM) kaydı -> yeniden giriş tahmini
export function assessSat(o, nowMs = Date.now(), withCurve = true) {
  const n = +o.MEAN_MOTION, e0 = +o.ECCENTRICITY;
  if (!(n > 0) || !(e0 >= 0) || e0 >= 1) return { durum: 'veri yok' };
  const a0 = Math.cbrt(MU / (n * 2 * Math.PI / DAY) ** 2), hp0 = a0 * (1 - e0) - RE, ha0 = a0 * (1 + e0) - RE;
  const epochMs = Date.parse((o.EPOCH || '') + 'Z') || nowMs;
  const base = { perigeeKm: hp0, apogeeKm: ha0, ecc: e0, epochMs };
  if (hp0 < REENTRY_KM) return { ...base, durum: 'girdi', lifeDays: 0, reentryMs: epochMs, conf: 'yüksek', curve: [[0, hp0, ha0]] };
  const bstar = +o.BSTAR, ndot = +o.MEAN_MOTION_DOT;
  const krB = bstar > 1e-7 ? kRhoFromBstar(bstar, hp0) : 0, krN = ndot > 0 ? kRhoFromNdot(ndot, a0) : 0;
  const kr0 = krB > 0 ? krB : krN;
  if (hp0 > 1400) return { ...base, durum: 'yüksek', lifeDays: Infinity, conf: 'orta' };                  // sürüklenme ihmal edilebilir (yüzyıllar)
  if (!(kr0 > 0)) return { ...base, durum: 'sürüklenme yok', lifeDays: Infinity, conf: 'düşük' };
  const ratio = krB > 0 && krN > 0 ? krB / krN : null, method = krB > 0 ? 'B*' : 'ndot';
  const lnr0 = lnrho(hp0);
  let a = a0, e = e0, t = 0, hp = hp0, nextRec = 0.5 * DAY, steps = 0;
  const curve = withCurve ? [[0, hp0, ha0]] : null;
  while (hp > REENTRY_KM && t < MAX_DAYS * DAY && steps < 40000) {
    const [dadt, dedt] = derivs(a, e, kr0, lnr0), drp = dadt * (1 - e) - a * dedt;
    const dt = Math.min(90 * DAY, Math.max(30, 0.03 * scaleH(hp) / Math.max(-drp, 1e-18)));
    a += dadt * dt; e = Math.max(0, e + dedt * dt); t += dt; steps++; hp = a * (1 - e) - RE;
    if (withCurve && t >= nextRec) { curve.push([t / DAY, hp, a * (1 + e) - RE]); nextRec *= 1.15; }
  }
  const capped = hp > REENTRY_KM;
  const lifeDays = capped ? Infinity : t / DAY;
  if (withCurve && !capped) curve.push([lifeDays, REENTRY_KM, Math.max(REENTRY_KM, a * (1 + e) - RE)]);
  // güven: B* ve gözlenen bozunma uyumlu ve süre kısa -> yüksek; uyumlu -> orta; tek kaynak ya da uyumsuz ya da çok uzun -> düşük
  let conf = 'düşük';
  if (ratio != null && ratio > 0.33 && ratio < 3) conf = lifeDays < 60 ? 'yüksek' : lifeDays < 40 * 365 ? 'orta' : 'düşük';
  else if (ratio == null && lifeDays < 30) conf = 'orta';
  return { ...base, durum: capped ? 'uzun' : 'bozunuyor', lifeDays, reentryMs: capped ? Infinity : epochMs + lifeDays * DAY * 1000, conf, method, ratio, kr0, curve, capped };
}

// ---------------------------------------------------------------- JPL Sentry
export const TORINO_TR = { 0: '0 (önemsiz)', 1: '1 (normal izleme)', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10' };
// map: des -> { ip, ps, ts, range:'2064-2064', n, D, vinf } -> satırlar (yıl bilgisiyle)
export function sentryRows(map, nowYear = new Date().getUTCFullYear()) {
  const out = [];
  for (const [des, s] of map) {
    const m = /(\d{4})\D+(\d{4})/.exec(s.range || ''), y0 = m ? +m[1] : null, y1 = m ? +m[2] : y0;
    out.push({ des, ip: +s.ip, ps: +s.ps, ts: s.ts == null ? '0' : String(s.ts), y0, y1, n: s.n, D: s.D, vinf: s.vinf, last_obs: s.last_obs, inYears: y0 == null ? null : Math.max(0, y0 - nowYear), odds: s.ip > 0 ? Math.round(1 / s.ip) : null });
  }
  return out;
}
export const fmtOdds = (ip) => (ip > 0 ? '1 / ' + Math.round(1 / ip).toLocaleString('tr-TR') : '—');

// ---------------------------------------------------------------- biçimlendirme
const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export function fmtSpan(days) {
  if (!(days >= 0)) return '—';
  if (days < 2) return `${Math.max(1, Math.round(days * 24))} saat`;
  if (days < 90) return `${Math.round(days)} gün`;
  if (days < 730) return `${(days / 30.44).toFixed(1).replace('.', ',')} ay`;
  return `${(days / 365.25).toFixed(days / 365.25 < 20 ? 1 : 0).replace('.', ',')} yıl`;
}
export function fmtDate(ms) {
  const d = new Date(ms), y = d.getUTCFullYear();
  return `${d.getUTCDate()} ${AY[d.getUTCMonth()]} ${y}`;
}
// bilgi kartı / liste için tek satır
export function fmtReentry(r, nowMs = Date.now()) {
  if (!r || r.durum === 'veri yok') return 'hesaplanamadı';
  if (r.durum === 'yüksek') return 'çok yüksek yörünge: sürüklenme ihmal edilebilir (yüzyıllar)';
  if (r.durum === 'sürüklenme yok') return 'belirsiz: sürüklenme verisi yok (B* ≤ 0)';
  if (r.durum === 'girdi') return 'yeniden giriş aşamasında (perije < 120 km)';
  if (r.capped) return '> 300 yıl (çok yavaş bozunma)';
  const rem = (r.reentryMs - nowMs) / 864e5;
  if (rem <= 0) return `elemanlara göre yeniden girmiş olmalı (${fmtDate(r.reentryMs)}); veri eski olabilir`;
  return `~${rem < 730 ? fmtDate(r.reentryMs) : new Date(r.reentryMs).getUTCFullYear()} (${fmtSpan(rem)} sonra) · güven: ${r.conf}`;
}
