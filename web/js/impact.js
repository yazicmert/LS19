// Çarpma / yeniden giriş tahmini (saf hesap; tarayıcı ve Node).
//
// UYDULAR — yörünge bozunması (manevra yapılmazsa doğal yeniden giriş):
//   • Sürüklenme genliği CelesTrak GP kaydındaki B*'tan (SGP4'ün kendi yoğunluk modeliyle tutarlı: ρ ∝ ((q0−s)/(r−s))⁴) bulunur;
//     B* yoksa MEAN_MOTION_DOT'tan (gözlenen bozunma) alınır. İkisi de varsa tutarlılığı güven düzeyine yansır.
//   • Yükseklikle değişim Vallado'nun üstel atmosferinden (ortalama Güneş aktivitesi) alınır; yeniden giriş 120 km perije.
//   • Dairesel yörünge: da/dt = −KρÖ √(μa). Eksantrik yörünge: a ve e için yörünge ortalamalı (Gauss) denklemler; toplama noktası sayısı perije
//     çevresindeki sürüklenme tepesinin genişliğine (√(H/ae)) göre seçilir (GTO'da ~200–400 nokta; sabit 24 nokta tepeyi kaçırıp sürüklenmeyi 5–7× küçültüyordu).
//   • Sınırlar: Güneş aktivitesi gelecekte değişir (yüzyıllık tahminler ±2–5×); küre biçimli Dünya; Starlink gibi aktif uydular yörüngelerini korur.
//     Periyodu ≥ 225 dk olan (SGP4'ün derin uzay sınırı: GTO, Molniya) alçak perijeli yörüngelerde perijeyi Ay–Güneş çekimi yönetir; model bunu içermez,
//     bu cisimler `deep` ile işaretlenir ve güvenleri düşüktür.
//   • Durum, güven, yöntem ve sınıf değerleri dilden bağımsız kodlardır (aşağıdaki sabitler); ekranda görünen Türkçe karşılıkları *_TR sözlüklerindedir.
//
// ASTEROİTLER — JPL Sentry (sanal çarpıcılar): olasılık ve olası yıllar. Bilinen kesin çarpma yoktur.
import { LOC, MONTHS_SHORT } from './i18n.js';
import { fmt } from './format.js';
const MU = 398600.4418, RE = 6378.135, DAY = 86400;
const REENTRY_KM = 120, MAX_DAYS = 300 * 365.25, YEAR = 365.25;
export const DEEP_PERIOD_MIN = 225;                                     // SGP4 derin uzay sınırı: bundan uzun periyotta Ay–Güneş çekimi perijeyi değiştirir
// assessSat().durum: nodata (kayıt geçersiz) · reentry (perije < 120 km) · high (perije > 1400 km) · nodrag (sürüklenme verisi yok) · decaying · long (> 300 yıl)
// güven kodları ve ekrandaki adları
export const CONF_TR = { high: 'yüksek', mid: 'orta', low: 'düşük' };
// geçmişe göre kontrol sınıfı (controlFromHistory().klass) ve ekrandaki adları
export const KLASS_TR = { kept: 'korunuyor', free: 'serbest', unknown: 'belirsiz' };
// GP çağı: CelesTrak saat dilimi yazmaz (UTC); 'Z' ya da ±ss:dd taşıyan değer olduğu gibi okunur. Okunamazsa NaN.
export const parseEpoch = (s) => { const x = String(s || '').trim(); return x ? Date.parse(/(Z|[+-]\d\d:?\d\d)$/i.test(x) ? x : x + 'Z') : NaN; };

// Vallado (Fundamentals of Astrodynamics, Tablo 8-4): taban yükseklik km, ρ0 kg/m³, ölçek yüksekliği km (ortalama Güneş aktivitesi)
const ATM = [[0, 1.225, 7.249], [25, 3.899e-2, 6.349], [30, 1.774e-2, 6.682], [40, 3.972e-3, 7.554], [50, 1.057e-3, 8.382], [60, 3.206e-4, 7.714], [70, 8.770e-5, 6.549],
  [80, 1.905e-5, 5.799], [90, 3.396e-6, 5.382], [100, 5.297e-7, 5.877], [110, 9.661e-8, 7.263], [120, 2.438e-8, 9.473], [130, 8.484e-9, 12.636], [140, 3.845e-9, 16.149],
  [150, 2.070e-9, 22.523], [180, 5.464e-10, 29.740], [200, 2.789e-10, 37.105], [250, 7.248e-11, 45.546], [300, 2.418e-11, 53.628], [350, 9.518e-12, 53.298],
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
// gözlenen da/dt'den (km/s, negatif = alçalıyor) perijedeki K·ρ (1/km): da/dt K·ρ ile doğrusal olduğundan modelin kendi yörünge ortalamasıyla
// ölçeklenir. Dairesel yörüngede −(da/dt)/√(μa)'ya iner; eksantrik yörüngede ortalama perije değerinden çok küçük olduğu için dairesel formül kullanılamaz.
function krFromDadt(obsKmS, a0, e0, hp0) {
  const ref = 1e-11, [dadt] = derivs(a0, e0, ref, lnrho(hp0));
  return dadt < 0 && obsKmS < 0 ? ref * (obsKmS / dadt) : 0;
}
// geçmiş a(t) eğiminden (km/gün)
const krFromSlope = (slopeKmDay, a0, e0, hp0) => krFromDadt(slopeKmDay / DAY, a0, e0, hp0);
// MEAN_MOTION_DOT'tan (GP alanı ṅ/2'dir, tur/gün²)
function kRhoFromNdot(ndotRevDay2, a0, e0, hp0) {
  const n = Math.sqrt(MU / a0 ** 3), dn = 2 * ndotRevDay2 * 2 * Math.PI / DAY ** 2;         // rad/s, rad/s²
  return krFromDadt(-(2 * a0 / (3 * n)) * dn, a0, e0, hp0);
}

// a (km), e, K·ρ0 (1/km, perije yüksekliği hp0'daki değer) -> yörünge ortalamalı türevler
function derivs(a, e, kr0, lnr0) {
  if (a * e < 4) {                                                                           // dairesel: e ≈ 0 kalır, yükseklik = a − Rₑ
    const v = Math.sqrt(MU / a), kr = kr0 * Math.exp(lnrho(a - RE) - lnr0);
    return [-(a * a / MU) * kr * v ** 3, 0];
  }
  // sürüklenme perije çevresinde E'de ~√(H/ae) genişliğinde bir tepedir; orta nokta toplaması tepeyi σ/1,5 aralıkla örnekler
  const N = Math.min(4096, Math.max(12, 2 * Math.ceil(1.5 * Math.PI * Math.sqrt(a * e / scaleH(a * (1 - e) - RE)))));
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
export function assessSat(o, nowMs = Date.now(), withCurve = true, hist = null) {
  const n = +o.MEAN_MOTION, e0 = +o.ECCENTRICITY;
  if (!(n > 0) || !(e0 >= 0) || e0 >= 1) return { durum: 'nodata' };
  const a0 = Math.cbrt(MU / (n * 2 * Math.PI / DAY) ** 2), hp0 = a0 * (1 - e0) - RE, ha0 = a0 * (1 + e0) - RE;
  const ep = parseEpoch(o.EPOCH), epochMs = Number.isFinite(ep) ? ep : nowMs;
  const deep = 1440 / n >= DEEP_PERIOD_MIN;                                                              // Ay–Güneş çekimi modelde yok
  const base = { perigeeKm: hp0, apogeeKm: ha0, ecc: e0, epochMs, age: ageYears(o, nowMs), deep };
  if (hp0 < REENTRY_KM) return { ...base, durum: 'reentry', lifeDays: 0, reentryMs: epochMs, conf: 'high', curve: [[0, hp0, ha0]] };
  if (hp0 > 1400) return { ...base, durum: 'high', lifeDays: Infinity, conf: 'mid' };                    // sürüklenme ihmal edilebilir (yüzyıllar)
  const bstar = +o.BSTAR, ndot = +o.MEAN_MOTION_DOT;
  const krB = bstar > 1e-7 ? kRhoFromBstar(bstar, hp0) : 0, krN = ndot > 0 ? kRhoFromNdot(ndot, a0, e0, hp0) : 0;
  // geçmiş yörünge eğimi (yarı büyük eksen a(t), manevrasız dilim) varsa sürüklenme genliği oradan kalibre edilir: gözlenen gerçek bozunma, tek anlık B*'tan daha sağlam
  let krH = 0;
  if (hist && hist.slopeKmDay < -1e-4 && hist.segDays >= 45) krH = krFromSlope(hist.slopeKmDay, a0, e0, hp0);
  const kr0 = krH > 0 ? krH : krB > 0 ? krB : krN;
  if (!(kr0 > 0)) return { ...base, durum: 'nodrag', lifeDays: Infinity, conf: 'low' };
  const ratio = krH > 0 && krB > 0 ? krH / krB : krB > 0 && krN > 0 ? krB / krN : null, method = krH > 0 ? 'hist' : krB > 0 ? 'bstar' : 'ndot';
  const lnr0 = lnrho(hp0);
  let a = a0, e = e0, t = 0, hp = hp0, nextRec = 0.5 * DAY, steps = 0;
  const curve = withCurve ? [[0, hp0, ha0]] : null;
  while (hp > REENTRY_KM && t < MAX_DAYS * DAY && steps < 40000) {
    const [dadt, dedt] = derivs(a, e, kr0, lnr0), drp = dadt * (1 - e) - a * dedt;
    // adım: perije ölçek yüksekliğinin %3'ünden, a da (apoje − perije)/2 + H'nin %2'sinden çok değişmesin (eksantrik yörüngede perije neredeyse sabitken apoje hızla düşer)
    const H = scaleH(hp), dt = Math.min(90 * DAY, Math.max(30, Math.min(0.03 * H / Math.max(-drp, 1e-18), 0.02 * (a * e + H) / Math.max(-dadt, 1e-18))));
    // durum (a, perije) olarak ilerletilir: (a, e) ile ilerletmek perijeye adım başına −Δa·Δe ikinci derece hatası ekler; GTO'da bu, gerçek perije
    // alçalmasından (Δa'nın ~2·10⁻⁴'ü) kat kat büyüktür ve ömrü ~3× kısaltıyordu
    a += dadt * dt; hp = Math.min(hp + drp * dt, a - RE); e = Math.max(0, 1 - (hp + RE) / a); t += dt; steps++;
    if (withCurve && t >= nextRec) { curve.push([t / DAY, hp, a * (1 + e) - RE]); nextRec *= 1.15; }
  }
  const capped = hp > REENTRY_KM;
  const lifeDays = capped ? Infinity : t / DAY;
  if (withCurve && !capped) curve.push([lifeDays, REENTRY_KM, Math.max(REENTRY_KM, a * (1 + e) - RE)]);
  return { ...base, durum: capped ? 'long' : 'decaying', lifeDays, reentryMs: capped ? Infinity : epochMs + lifeDays * DAY * 1000,
    conf: confidence({ ratio, lifeDays, deep, histOk: krH > 0 && hist.spanDays >= 180 }), method, ratio, kr0, curve, capped };
}
// Güven. Atmosfer sabit (ortalama Güneş aktivitesi) ve genlik bugünkü aktiviteye bağlı olduğundan süre uzadıkça güven düşer (uzun vadede ±2–5×):
//   yüksek: iki kaynak uyumlu (oran 1/3–3) ve süre < 60 gün; ya da ≥ 6 aylık geçmiş eğimi B*'la 0,5–2 arasında uyumlu ve süre < 1 yıl
//   orta:   iki kaynak uyumlu ve süre < 25 yıl; ya da tek kaynak ve süre < 30 gün
//   düşük:  kaynaklar uyumsuz, tek kaynak, süre ≥ 25 yıl ya da derin uzay yörüngesi (Ay–Güneş çekimi modelde yok)
// Not: geçmiş eğimi yalnız B*'la 0,6–5 arasında uyuşan ("serbest") cisimlerde kullanılır; bu yüzden uyum tek başına uzun süreli tahmini doğrulamaz.
export function confidence({ ratio, lifeDays, deep, histOk }) {
  if (deep) return 'low';
  if (histOk && ratio != null && ratio > 0.5 && ratio < 2 && lifeDays < YEAR) return 'high';
  if (ratio != null && ratio > 0.33 && ratio < 3) return lifeDays < 60 ? 'high' : lifeDays < 25 * YEAR ? 'mid' : 'low';
  return ratio == null && lifeDays < 30 ? 'mid' : 'low';
}

// ---------------------------------------------------------------- geçmiş yörünge analizi
// S: [{t (ms), a (km)}] zaman sıralı yarı büyük eksen serisi -> manevra (yükseltme) sıçramaları ve bozunma eğimi (Theil–Sen, son manevradan beri)
export function analyzeHistory(S, { boostKm = 0.35 } = {}) {
  const n = S.length;
  if (n < 3) return { durum: 'short', n };
  const boosts = [];
  for (let i = 1; i < n; i++) { const da = S[i].a - S[i - 1].a; if (da > boostKm) boosts.push({ i, t: S[i].t, da }); }
  const last = boosts.length ? boosts[boosts.length - 1] : null, from = last ? last.i : 0, seg = S.slice(from);
  const day = (x) => x / 864e5, segDays = seg.length > 1 ? day(seg[seg.length - 1].t - seg[0].t) : 0;
  let slope = 0, rms = 0;
  if (seg.length >= 3 && segDays >= 7) {
    const sl = []; for (let i = 0; i < seg.length; i++) for (let j = i + 1; j < seg.length; j++) { const dt = day(seg[j].t - seg[i].t); if (dt >= 1) sl.push((seg[j].a - seg[i].a) / dt); }
    sl.sort((x, y) => x - y); slope = sl.length ? sl[sl.length >> 1] : 0;
    const med = [...seg.map((p) => p.a - slope * day(p.t - seg[0].t))].sort((x, y) => x - y)[seg.length >> 1];
    rms = Math.sqrt(seg.reduce((s, p) => s + (p.a - slope * day(p.t - seg[0].t) - med) ** 2, 0) / seg.length);
  }
  return { durum: 'ok', n, spanDays: day(S[n - 1].t - S[0].t), boostCount: boosts.length, lastBoostMs: last ? last.t : 0, boosts, slopeKmDay: slope, slopeRms: rms, segDays, segN: seg.length };
}

// B*'tan beklenen serbest bozunma hızı (km/gün, pozitif = alçalma); B* ≤ 0 ise 0
export function expectedDecayKmDay(a, e, bstar) {
  const hp = a * (1 - e) - RE; if (!(bstar > 1e-7) || hp < REENTRY_KM) return 0;
  const kr = kRhoFromBstar(bstar, hp), [dadt] = derivs(a, e, kr, lnrho(hp));
  return dadt < 0 ? -dadt * DAY : 0;
}
// geçmiş özeti (manevra sayısı, son manevra, gözlenen eğim, beklenen bozunma) -> klass: 'kept' (korunuyor) | 'free' (serbest) | 'unknown' (belirsiz)
//   korunuyor: son 120 günde yükseltme sıçraması ya da gözlenen bozunma beklenenin %40'ından az (sürekli itki, ör. Starlink)
//   serbest:   uzun geçmiş (≥ 120 gün), a(t) düzenli (rms ≤ 3 km), gözlenen bozunma B*'tan beklenenin 0,6–5 katı ve yakın zamanda manevra yok
//   belirsiz:  geçmiş kısa, a(t) düzensiz (aşağı manevra / yörünge değişimi), gözlenen ile beklenen bozunma uyuşmuyor
export function controlFromHistory(h, nowMs = Date.now()) {
  if (!h || !(h.spanDays >= 120)) return { klass: 'unknown', ratio: null, neden: 'geçmiş verisi kısa' };
  const obs = -h.slopeKmDay, ratio = h.expKmDay > 0 ? obs / h.expKmDay : null, recent = h.lastBoostMs && nowMs - h.lastBoostMs < 120 * 864e5;
  if (recent) return { klass: 'kept', ratio, neden: 'son 120 günde yörünge yükseltme' };
  if (ratio != null && ratio < 0.4) return { klass: 'kept', ratio, neden: 'gözlenen bozunma beklenenin çok altında (sürekli itki)' };
  if (h.rms != null && h.rms > 3) return { klass: 'unknown', ratio, neden: 'yarı büyük eksen düzensiz değişiyor (aşağı manevra ya da yörünge değişimi)' };
  if (ratio != null && ratio > 5) return { klass: 'unknown', ratio, neden: 'gözlenen bozunma beklenenden çok hızlı (itkiyle alçalıyor olabilir)' };
  if ((ratio != null && ratio >= 0.6) || (ratio == null && obs > 0.002 && h.boostCount === 0)) return { klass: 'free', ratio, neden: h.boostCount ? `son manevra ${Math.round((nowMs - h.lastBoostMs) / 864e5)} gün önce` : 'geçmişte hiç yükseltme yok' };
  return { klass: 'unknown', ratio, neden: 'gözlenen ve beklenen bozunma uyuşmuyor' };
}

// gecmis.json satırı (tools/gecmis_derle.mjs `alanlar`) -> geçmiş özeti + sınıf
export function histRow(r, nowMs = Date.now()) {
  const h = { n: r[0], spanDays: r[1], boostCount: r[2], lastBoostMs: r[3] * 864e5, slopeKmDay: r[4], rms: r[5], aLast: r[6], epochDay: r[7], expKmDay: r[8], segDays: r[9] };
  h.ctl = controlFromHistory(h, nowMs); return h;
}
// sürüklenme kalibrasyonunda kullanılacak geçmiş: yalnız serbest bozunanlar (aksi halde eğim manevra izidir)
export const calibHist = (h) => (h && h.ctl && h.ctl.klass === 'free' ? h : null);

// ---------------------------------------------------------------- liste süzgeci (saf; arayüz: impactui.js)
// res: [{ o, id, h, r }] · ctl: 'hist' | en az yaş (yıl; 0 = tümü) · group: 'all' | grup no · groupOf: id -> grup no (0 = istasyonlar)
export function selectSats(res, { now = Date.now(), ctl = 0, group = 'all', horizonDays = Infinity, q = '', groupOf = () => undefined } = {}) {
  const byHist = ctl === 'hist', minAge = byHist ? 0 : +ctl || 0, Q = String(q).trim().toUpperCase();
  const days = (x) => (x.r.reentryMs - now) / 864e5;
  const all = res.filter((x) => x.r.durum === 'decaying' || x.r.durum === 'reentry');
  const alive = all.filter((x) => x.r.durum === 'reentry' || days(x) > 0);
  const ageOf = (x) => ageYears(x.o, now), old = (x) => groupOf(x.id) !== 0 && ageOf(x) != null && ageOf(x) >= minAge;
  const kept = (x) => !!x.h && x.h.ctl.klass === 'kept', free = (x) => !!x.h && x.h.ctl.klass === 'free';
  const live = byHist ? alive.filter(free) : minAge > 0 ? alive.filter((x) => old(x) && !kept(x)) : alive;
  const sel = live.filter((x) => (group === 'all' || groupOf(x.id) === +group) && days(x) <= horizonDays && (!Q || String(x.o.OBJECT_NAME || '').toUpperCase().includes(Q) || String(x.id) === Q));
  sel.sort((a, b) => a.r.reentryMs - b.r.reentryMs);
  return { sel, live, alive, byHist, minAge, stale: all.length - alive.length, nKept: minAge > 0 ? alive.filter((x) => old(x) && kept(x)).length : 0,
    n1: live.filter((x) => days(x) <= YEAR).length, n5: live.filter((x) => days(x) <= 5 * YEAR).length, nHigh: res.filter((x) => x.r.durum === 'high').length };
}

// ---------------------------------------------------------------- kontrol durumu (yakıt/manevra bilinmediği için)
// Yakıtı bilmediğimizden, bir uydunun yeniden girişi ancak görev süreci bittikten sonra anlamlıdır; FCC'nin 5 yıl kuralı (görev sonu + 5 yıl) uyarınca
// görev sonu fırlatmadan sonraki tipik ömürle (~5 yıl) yaklaştırılır: yaş ≥ MISSION_PLUS + 5 -> kontrolsüz aday. Kesin görev sonu tarihi geçmiş yörünge verisiyle bulunabilir.
const MISSION_PLUS = 5;
export function launchYear(o) {
  const id = String(o.OBJECT_ID || ''), y = +id.slice(0, 4);
  if (/^1998-067/.test(id) && !/^1998-067A$/.test(id.trim())) return null;                  // ISS'ten sonradan bırakılan nesneler ISS'in uluslararası tanımını (1998-067) taşır: gerçek fırlatma yılı bilinmiyor
  return y >= 1957 && y < 2100 ? y : null;
}
export function ageYears(o, nowMs = Date.now()) { const y = launchYear(o); return y == null ? null : Math.max(0, (nowMs - Date.UTC(y, 6, 1)) / (365.25 * 864e5)); }
export function controlNote(age, isStation = false) {
  if (isStation) return 'kontrollü (istasyon): yörünge düzenli yükseltilir';
  if (age == null) return 'bilinmiyor (fırlatma yılı yok)';
  const a = Math.round(age);
  if (age < 5) return `genç (${a} yıl): büyük olasılıkla görevde ve manevra yapar; tahmin yalnız "manevra yapılmazsa" senaryosudur`;
  if (age < 2 * MISSION_PLUS) return `orta yaşlı (${a} yıl): görev ömrü dolmuş olabilir, durum belirsiz`;
  return `yaşlı (${a} yıl): görev süreci + ${MISSION_PLUS} yıl dolmuş olabilir; kontrolsüz yeniden giriş adayı`;
}

// ---------------------------------------------------------------- JPL Sentry
// map: des -> { ip, ps, ts, range:'2064-2064', n, D, vinf } -> satırlar (yıl bilgisiyle). ts null: Torino ölçeği uygulanmaz (JPL yalnız 100 yıl içindeki olasılıklar için verir)
export function sentryRows(map, nowYear = new Date().getUTCFullYear()) {
  const out = [];
  for (const [des, s] of map) {
    const m = /(\d{4})\D+(\d{4})/.exec(s.range || ''), y0 = m ? +m[1] : null, y1 = m ? +m[2] : y0;
    out.push({ des, ip: +s.ip, ps: +s.ps, ts: s.ts == null ? null : String(s.ts), y0, y1, n: s.n, D: s.D, vinf: s.vinf, last_obs: s.last_obs, inYears: y0 == null ? null : Math.max(0, y0 - nowYear), odds: s.ip > 0 ? Math.round(1 / s.ip) : null });
  }
  return out;
}
export const fmtOdds = (ip) => (ip > 0 ? '1 / ' + Math.round(1 / ip).toLocaleString(LOC) : '—');

// ---------------------------------------------------------------- biçimlendirme
const AY = MONTHS_SHORT;
export function fmtSpan(days) {
  if (!(days >= 0)) return '—';
  if (days < 2) return `${Math.max(1, Math.round(days * 24))} saat`;
  if (days < 90) return `${Math.round(days)} gün`;
  if (days < 730) return `${fmt(days / 30.44, 1)} ay`;
  return `${fmt(days / YEAR, days / YEAR < 20 ? 1 : 0)} yıl`;
}
export function fmtDate(ms) {
  const d = new Date(ms), y = d.getUTCFullYear();
  return `${d.getUTCDate()} ${AY[d.getUTCMonth()]} ${y}`;
}
// bilgi kartı / liste için tek satır
const DEEP_NOTE = 'Ay–Güneş çekimi modelde yok';
export function fmtReentry(r, nowMs = Date.now()) {
  if (!r || r.durum === 'nodata') return 'hesaplanamadı';
  if (r.durum === 'high') return 'çok yüksek yörünge: sürüklenme ihmal edilebilir (yüzyıllar)';
  if (r.durum === 'nodrag') return 'belirsiz: sürüklenme verisi yok (B* ≤ 0)';
  if (r.durum === 'reentry') return 'yeniden giriş aşamasında (perije < 120 km)';
  if (r.capped) return r.deep ? `yalnız sürüklenmeyle > 300 yıl; ${DEEP_NOTE}, gerçek süre çok farklı olabilir` : '> 300 yıl (çok yavaş bozunma)';
  const rem = (r.reentryMs - nowMs) / 864e5;
  if (rem <= 0) return `elemanlara göre yeniden girmiş olmalı (${fmtDate(r.reentryMs)}); veri eski olabilir`;
  return `~${rem < 730 ? fmtDate(r.reentryMs) : new Date(r.reentryMs).getUTCFullYear()} (${fmtSpan(rem)} sonra) · güven: ${CONF_TR[r.conf] || CONF_TR.low}${r.deep ? ` · ${DEEP_NOTE}` : ''}`;
}
