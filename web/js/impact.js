// Çarpma / yeniden giriş tahmini (saf hesap; tarayıcı ve Node).
//
// UYDULAR — yörünge bozunması (manevra yapılmazsa doğal yeniden giriş):
//   • Sürüklenme genliği CelesTrak GP kaydındaki B*'tan (SGP4'ün kendi yoğunluk modeliyle tutarlı: ρ ∝ ((q0−s)/(r−s))⁴) bulunur;
//     B* yoksa MEAN_MOTION_DOT'tan (gözlenen bozunma) alınır. İkisi de varsa tutarlılığı güven düzeyine yansır.
//   • Yükseklikle değişim Vallado'nun üstel atmosferinden alınır; Güneş aktivitesi yoğunluğu F10.7 ile ölçekler (aylık gözlenen + CelesTrak tahmini tablo,
//     web/data/f107.json; yoksa ortalama 11 yıllık çevrim); yeniden giriş 120 km perije.
//   • Dairesel yörünge: da/dt = −KρÖ √(μa). Eksantrik yörünge: a ve e için yörünge ortalamalı (Gauss) denklemler; toplama noktası sayısı perije
//     çevresindeki sürüklenme tepesinin genişliğine (√(H/ae)) göre seçilir.
//   • Periyodu ≥ 225 dk ve e > 0,1 olan yörüngelerde (GTO, Molniya, Cluster) perijeyi Ay–Güneş çekimi yönetir: yörünge ortalamalı Ay–Güneş + J2 denklemleri
//     sürüklenmeyle birlikte tümlenir (yörünge açıları varsa); yeniden giriş 60 km ortalama perijede sayılır. Bu cisimler `deep` ile işaretlenir, güvenleri düşüktür.
//   • Gerçek kayıtla karşılaştırma (test/test_impact.js; gerçek anlar GCAT): 758 cismin 1965–2016 yeniden girişlerinde 1,5–3 / 3–12 yıl kala medyan tahmin/gerçek
//     1,07 / 1,00, 2 kat içinde %84 / %72 (gözlenen F10.7 ile); 249 cismin 2025–26 yeniden girişlerinde %68'i 0,82–1,33 katı (o günkü tahminle);
//     464 GTO/HEO cismi (1975–2016) 0,7 yıldan uzun kala medyan 0,95, %86'sı 2 kat içinde; Cluster II (ESA) 60–397 gün kala 0,63–1,24 katı.
//   • Her tahmine gerçek kayıtla ayarlanmış %68 olası aralık eşlik eder (lifeRange); gelecek Güneş çevriminin belirsizliği bu aralığın içindedir.
//   • Sınırlar: gelecek çevrimlerin genliği bilinmez (gözlenen F10.7 yerine ortalama çevrimle 1,5–12 yıl kala hata ~1,7 kat büyür; olası aralık bunu içerir);
//     aylık Ap ortalama yoğunluğu 400 km'de medyan %2 düşük verir; küre biçimli Dünya;
//     aktif uydular yörüngelerini korur; çok eksantrik yörüngelerin son haftalarında ortalama elemanlar fiziksel perijeyi göstermez.
//   • Durum, güven, yöntem ve sınıf değerleri dilden bağımsız kodlardır (aşağıdaki sabitler); ekranda görünen Türkçe karşılıkları *_TR sözlüklerindedir.
//
// ASTEROİTLER — JPL Sentry (sanal çarpıcılar): olasılık ve olası yıllar. Bilinen kesin çarpma yoktur.
import { LOC, MONTHS_SHORT } from './i18n.js';
import { fmt } from './format.js';
const MU = 398600.4418, RE = 6378.135, DAY = 86400;
const REENTRY_KM = 120, MAX_DAYS = 300 * 365.25, YEAR = 365.25;
// Çok eksantrik (Ay–Güneş) yörüngede tek perije geçişi cismi yakalamaz: yeniden giriş daha alçak ortalama perijede sayılır. 464 gerçek GTO/HEO yeniden girişinin
// iki yarısında ayrı ayrı en iyi 50–60 km (2 aydan kısa kala 2 kat içinde: 80 km'de %53, 60 km'de %74); docs/fizik_denetimi.md §4.2e
const DEEP_REENTRY_KM = 60;
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

// ---------------------------------------------------------------- Güneş aktivitesi
// Termosfer yoğunluğu Güneş çevrimiyle değişir (400 km'de en az–en çok arası ~5×, 600 km'de ~15×). Vallado tablosu ortalama aktivite (F10.7 ≈ 140) içindir;
// aktiviteye bağlılık yaygın kullanılan yaklaşık bağıntıdan alınır (Avustralya Uzay Hava Servisi, "Satellite Orbital Decay Calculations"):
//   T = 900 + 2,5 (F10.7 − 70) + 1,5 Ap,  m = 27 − 0,012 (h − 200),  H = T/m,  ρ ∝ exp(−(h − 175)/H)      (180–500 km için verilmiş; burada 1000 km'ye dek uzatılır)
// Buradan yalnız oran kullanılır: ln ρ(h, F) = ln ρ_Vallado(h) − c(F)·(h − 175)·m(h),  c(F) = 1/T(F) − 1/T(140). F = 140'ta 400/600/800 km'de bağıntı Vallado'yla
// 3,7e-12 ↔ 3,7e-12, 1,05e-13 ↔ 1,45e-13, 7e-15 ↔ 1,2e-14 uyuşur.
// F10.7(t): öncelik aylık tablodadır (web/data/f107.json; tools/uzay_havasi.mjs CelesTrak SW-All.txt'ten üretir): 1957'den bugüne gözlenen aylık ortalama ve
// CelesTrak'ın ~16 yıllık aylık tahmini. Tablo yüklenmediyse ya da tarih tablonun dışındaysa 11 yıllık ortalama çevrim biçimi kullanılır: en az 70 sfu,
// en çok 185 sfu (son dört çevrimin en yüksek yıllık ortalamalarının ortalaması: 1989 213, 2001 184, 2014 146, 2024 191), 25. çevrim en azı Aralık 2019.
// Gelecek çevrimlerin gerçek genliği önceden bilinemez: uzun vadeli tahmin yine belirsizdir (güven kuralları).
const F_MIN = 70, F_MAX = 185, F_MEAN = 140, CYCLE_YR = 11, CYCLE_RISE_YR = 4.85, CYCLE_T0 = Date.UTC(2019, 11, 15), AP = 15;
export function solarCycleF107(ms) {
  const x = ((((ms - CYCLE_T0) / (YEAR * 864e5)) % CYCLE_YR) + CYCLE_YR) % CYCLE_YR;
  const s = x < CYCLE_RISE_YR ? 0.5 * (1 - Math.cos(Math.PI * x / CYCLE_RISE_YR)) : 0.5 * (1 + Math.cos(Math.PI * (x - CYCLE_RISE_YR) / (CYCLE_YR - CYCLE_RISE_YR)));
  return F_MIN + (F_MAX - F_MIN) * s;
}
// aylık tablo: { ilkAy: 'YYYY-AA', f: [sfu…] } (f107.json); null -> ortalama çevrim. Değerler ay ortasına yerleştirilip doğrusal aradeğerlenir.
let SOLAR = null;
export function setSolarTable(j) {
  if (!j || !Array.isArray(j.f) || !/^\d{4}-\d{2}$/.test(j.ilkAy || '')) { SOLAR = null; return false; }
  const [y, m] = j.ilkAy.split('-').map(Number), mid = (k) => Date.UTC(y, m - 1 + k, 15, 12);
  // Ap: gözlenen aylar; sonrası (tahmin) son 12 gözlenen ayın ortalaması
  const ap = Array.isArray(j.ap) ? j.ap.filter((x) => x != null && x >= 0) : [], apTail = ap.length ? ap.slice(-12).reduce((s, x) => s + x, 0) / Math.min(12, ap.length) : AP;
  SOLAR = { mid, n: j.f.length, f: j.f, ap: Array.isArray(j.ap) ? j.ap : [], apTail, t0: mid(0), t1: mid(j.f.length - 1), sonGozlem: j.sonGozlem || null, guncelleme: j.guncelleme || null };
  return true;
}
export const solarTableInfo = () => (SOLAR ? { from: SOLAR.t0, to: SOLAR.t1, sonGozlem: SOLAR.sonGozlem, guncelleme: SOLAR.guncelleme } : null);
// aylık ortalama Ap (gözlenen; tablo dışında ya da tahmin aylarında son 12 ayın ortalaması, tablo yoksa 15)
export function solarAp(ms) {
  if (!SOLAR || ms < SOLAR.t0 || ms > SOLAR.t1) return SOLAR ? SOLAR.apTail : AP;
  const d = new Date(ms), [y, m] = new Date(SOLAR.t0).toISOString().slice(0, 7).split('-').map(Number), k = (d.getUTCFullYear() - y) * 12 + d.getUTCMonth() - (m - 1), v = SOLAR.ap[k];
  return v != null && v >= 0 ? v : SOLAR.apTail;
}
export function solarF107(ms) {
  if (!SOLAR || ms < SOLAR.t0 || ms > SOLAR.t1) return solarCycleF107(ms);
  const [y, m] = new Date(SOLAR.t0).toISOString().slice(0, 7).split('-').map(Number), d = new Date(ms);
  let k = (d.getUTCFullYear() - y) * 12 + d.getUTCMonth() - (m - 1); if (ms < SOLAR.mid(k)) k--;
  k = Math.max(0, Math.min(SOLAR.n - 2, k));
  const a = SOLAR.mid(k), b = SOLAR.mid(k + 1), u = (ms - a) / (b - a);
  return SOLAR.f[k] + (SOLAR.f[k + 1] - SOLAR.f[k]) * u;
}
const tInf = (F, ap = AP) => 900 + 2.5 * (F - 70) + 1.5 * ap;
// Duyarlılık katsayısı: bağıntının F10.7 etkisi tek başına zayıf kalıyordu (400 km'de en az–en çok yoğunluk oranı ~4,8; ölçülmüş modellerde ~10).
// 757 cismin 1965–2016 arası gerçek yeniden girişiyle (GCAT tarihleri, tarihsel TLE'ler, gözlenen F10.7) ayarlandı: on yılların iki yarısında ayrı ayrı
// en iyi 1,4–1,5; 1,4 ile 1,5–3 yıl kala medyan |ln hata| 0,323 → 0,245, 3–10 yıl kala medyan tahmin/gerçek 1,14 → 0,98 (docs/fizik_denetimi.md §4.2d).
const SENS = 1.4;
const actC = (ms) => SENS * (1 / tInf(solarF107(ms), solarAp(ms)) - 1 / tInf(F_MEAN));
const xm = (h) => { const hc = h < 175 ? 175 : h > 1000 ? 1000 : h; return (hc - 175) * (27 - 0.012 * (hc - 200)); };
// ortalama aktiviteye göre yoğunluk çarpanı (sınama ve belge için)
export const solarDensityFactor = (hKm, f107) => Math.exp(-(1 / tInf(f107) - 1 / tInf(F_MEAN)) * xm(hKm));

// SGP4'ün B*-yoğunluk modeli: perijedeki K·ρ (1/km) = 2 B* ((q0−s)/(r−s))⁴ / Rₑ
function kRhoFromBstar(bstar, hpKm) {
  const sAlt = hpKm >= 156 ? 78 : hpKm >= 98 ? hpKm - 78 : 20;
  const q0 = 1 + 120 / RE, s = 1 + sAlt / RE, r = (RE + hpKm) / RE;
  if (r - s <= 0 || q0 - s <= 0) return 0;
  return 2 * bstar * ((q0 - s) / (r - s)) ** 4 / RE;
}
// gözlenen da/dt'den (km/s, negatif = alçalıyor) perijedeki K·ρ (1/km): da/dt K·ρ ile doğrusal olduğundan modelin kendi yörünge ortalamasıyla
// ölçeklenir. Dairesel yörüngede −(da/dt)/√(μa)'ya iner; eksantrik yörüngede ortalama perije değerinden çok küçük olduğu için dairesel formül kullanılamaz.
// (a, e): gözlemin ait olduğu yörünge; lnr0: genliğin bağlandığı (hp0, çağ) yoğunluğu; c: gözlem anındaki aktivite katsayısı
function krFromDadt(obsKmS, a, e, lnr0, c) {
  const ref = 1e-11, [dadt] = derivs(a, e, ref, lnr0, c);
  return dadt < 0 && obsKmS < 0 ? ref * (obsKmS / dadt) : 0;
}
// MEAN_MOTION_DOT'tan (GP alanı ṅ/2'dir, tur/gün²)
function kRhoFromNdot(ndotRevDay2, a0, e0, lnr0, c0) {
  const n = Math.sqrt(MU / a0 ** 3), dn = 2 * ndotRevDay2 * 2 * Math.PI / DAY ** 2;         // rad/s, rad/s²
  return krFromDadt(-(2 * a0 / (3 * n)) * dn, a0, e0, lnr0, c0);
}
// Geçmiş a(t) eğiminden (km/gün). Theil–Sen eğimi dilimin ortasındaki bozunma hızıdır: o andaki (daha yüksek) yörüngeye ve o günün aktivitesine bağlanır.
// Eğimi bugünkü yörüngenin hızı saymak, bozunma hızlandığı için genliği küçültüyordu (gerçek yeniden girişlerde 60–120 gün kala ömür %40 uzun çıkıyordu).
function krFromSlope(hist, a0, e0, lnr0, epochMs, solar) {
  const half = hist.segDays / 2, endMs = hist.epochDay > 0 ? hist.epochDay * 864e5 : epochMs;
  const aRef = (hist.aLast > RE ? hist.aLast : a0) - hist.slopeKmDay * half, eRef = Math.min(0.99, a0 * e0 / aRef);
  return krFromDadt(hist.slopeKmDay / DAY, aRef, eRef, lnr0, solar ? actC(endMs - half * 864e5) : 0);
}

// a (km), e, K·ρ0 (1/km, perije yüksekliği hp0'daki değer), lnr0 (K·ρ0'ın bağlandığı ln ρ), c (aktivite katsayısı; 0 = ortalama) -> yörünge ortalamalı türevler
function derivs(a, e, kr0, lnr0, c = 0) {
  if (a * e < 4) {                                                                           // dairesel: e ≈ 0 kalır, yükseklik = a − Rₑ
    const v = Math.sqrt(MU / a), h = a - RE, kr = kr0 * Math.exp(lnrho(h) - c * xm(h) - lnr0);
    return [-(a * a / MU) * kr * v ** 3, 0];
  }
  // sürüklenme perije çevresinde E'de ~√(H/ae) genişliğinde bir tepedir; orta nokta toplaması tepeyi σ/1,5 aralıkla örnekler
  const N = Math.min(4096, Math.max(12, 2 * Math.ceil(1.5 * Math.PI * Math.sqrt(a * e / scaleH(a * (1 - e) - RE)))));
  let sV3 = 0, sV = 0;
  for (let k = 0; k < N; k++) {
    const E = (2 * Math.PI * (k + 0.5)) / N, cE = Math.cos(E), r = a * (1 - e * cE), v = Math.sqrt(MU * (2 / r - 1 / a));
    const w = (1 - e * cE) / N, h = r - RE, kr = kr0 * Math.exp(lnrho(h) - c * xm(h) - lnr0);
    sV3 += w * kr * v ** 3; sV += w * kr * v;
  }
  const dadt = -(a * a / MU) * sV3;                                                          // km/s
  const dedt = e < 1e-5 ? 0 : ((1 - e * e) / e) * (0.5 * sV + 0.5 * dadt / a);               // 1/s
  return [dadt, dedt];
}

// ---------------------------------------------------------------- Ay–Güneş çekimi ve J2 (derin uzay yörüngeleri)
// Periyodu ≥ 225 dk olan alçak perijeli yörüngelerde (GTO, Molniya) perijeyi sürüklenmeden çok Ay ve Güneş'in çekimi değiştirir. Dış merkezlik vektörü
// E = e·ê ve J = √(1−e²)·ĥ (Milankovitch öğeleri) için dörtkutup yaklaşımında yörünge ortalamalı denklemler (Tremaine, Touma & Namouni 2009):
//   dJ/dt = −(1/√(μa)) (J × ∇_J U + E × ∇_E U),   dE/dt = −(1/√(μa)) (J × ∇_E U + E × ∇_J U)
//   Güneş (uydu yörüngesi üzerinden tek ortalama; Güneş anlık yönünde r̂, uzaklık d):  U = (μ☉ a²/4d³) [−1 + 6e² − 15 (E·r̂)² + 3 (J·r̂)²]
//   Ay (ayrıca Ay'ın yörüngesi üzerinden ortalama; yörünge normali n̂):               U = (μ☾ a²/8a☾³(1−e☾²)^1.5) [1 − 6e² − 3 (J·n̂)² + 15 (E·n̂)²]
// Güneş için yarı yıllık terimler (2λ☉) büyük olduğundan tek ortalama; Ay için aylık terimler küçük ve kısa periyotlu olduğundan çift ortalama kullanılır.
// J2 düğümü ve perijeyi döndürür (Ω̇ = −1,5 n J2 (R/p)² cos i, ω̇ = 0,75 n J2 (R/p)² (5cos² i − 1)); ω'nın dönmesi Ay–Güneş etkisinin işaretini belirler.
// Çerçeve: tarihin ekvatoru (TEME ≈ gerçek ekvator; fark burada önemsiz). Güneş: düşük duyarlıklı formül (Astronomical Almanac, ~0,01°).
// Ay yörünge düzlemi: ekliptiğe 5,145° eğik, düğümü 18,6 yılda geri döner.
const MU_SUN = 1.32712440018e11, AU_KM = 149597870.7, MU_MOON = 4902.800, A_MOON = 384400, E_MOON = 0.0549, J2 = 1.08262668e-3, OBLIQ = 23.439 * Math.PI / 180, RAD = Math.PI / 180;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// Güneş'in yönü (birim) ve uzaklığı (km), ekvator çerçevesi
export function sunDir(ms) {
  const d = (ms - J2000_MS) / 864e5, g = (357.528 + 0.9856003 * d) * RAD, L = (280.460 + 0.9856474 * d + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  return { u: [Math.cos(L), Math.cos(OBLIQ) * Math.sin(L), Math.sin(OBLIQ) * Math.sin(L)], d: (1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g)) * AU_KM };
}
// Ay yörüngesinin normali (birim), ekvator çerçevesi
export function moonNormal(ms) {
  const d = (ms - J2000_MS) / 864e5, O = (125.04452 - 0.0529538083 * d) * RAD, i = 5.145 * RAD, x = Math.sin(i) * Math.sin(O), y = -Math.sin(i) * Math.cos(O), z = Math.cos(i);
  return [x, Math.cos(OBLIQ) * y - Math.sin(OBLIQ) * z, Math.sin(OBLIQ) * y + Math.cos(OBLIQ) * z];
}
// (E, J, a, zaman) -> [dE/dt, dJ/dt] (1/s): Güneş + Ay + J2
function secularRates(E, J, a, ms) {
  const n = Math.sqrt(MU / a ** 3), e2 = dot(E, E), jj = Math.sqrt(Math.max(1e-12, 1 - e2)), JxE = cross(J, E);
  const dE = [0, 0, 0], dJ = [0, 0, 0], add = (v, k, w) => { v[0] += k * w[0]; v[1] += k * w[1]; v[2] += k * w[2]; };
  const S = sunDir(ms), r = S.u, A1 = MU_SUN / S.d ** 3 / (4 * n), Er = dot(E, r), Jr = dot(J, r), Jxr = cross(J, r), Exr = cross(E, r);
  add(dJ, -6 * A1 * Jr, Jxr); add(dJ, 30 * A1 * Er, Exr);
  add(dE, -12 * A1, JxE); add(dE, 30 * A1 * Er, Jxr); add(dE, -6 * A1 * Jr, Exr);
  const m = moonNormal(ms), A2 = MU_MOON / (A_MOON ** 3 * (1 - E_MOON ** 2) ** 1.5) / (8 * n), Em = dot(E, m), Jm = dot(J, m), Jxm = cross(J, m), Exm = cross(E, m);
  add(dJ, 6 * A2 * Jm, Jxm); add(dJ, -30 * A2 * Em, Exm);
  add(dE, 12 * A2, JxE); add(dE, -30 * A2 * Em, Jxm); add(dE, 6 * A2 * Jm, Exm);
  const p = a * (1 - e2), k = n * J2 * (RE / p) ** 2, ci = J[2] / jj, dO = -1.5 * k * ci, dw = 0.75 * k * (5 * ci * ci - 1), z = [0, 0, 1];
  add(dE, dO, cross(z, E)); add(dE, dw / jj, JxE); add(dJ, dO, cross(z, J));
  return [dE, dJ];
}
// bir adım (orta nokta): sürüklenmenin belirlediği e büyüklüğünden başlar; dönen: yeni e ve birim vektörler
function secularStep(eh, hh, e, a, ms, dt) {
  const jj = Math.sqrt(1 - e * e), E0 = eh.map((x) => x * e), J0 = hh.map((x) => x * jj);
  const [k1E, k1J] = secularRates(E0, J0, a, ms), Em = E0.map((x, i) => x + k1E[i] * dt / 2), Jm = J0.map((x, i) => x + k1J[i] * dt / 2);
  const [k2E, k2J] = secularRates(Em, Jm, a, ms + dt * 500), E1 = E0.map((x, i) => x + k2E[i] * dt), J1 = J0.map((x, i) => x + k2J[i] * dt);
  const e1 = Math.min(0.999999, Math.hypot(...E1)), jn = Math.hypot(...J1), h1 = J1.map((x) => x / jn), q = dot(E1, h1), ep = E1.map((x, i) => x - q * h1[i]), en = Math.hypot(...ep) || 1;
  return [e1, ep.map((x) => x / en), h1];
}

// ---------------------------------------------------------------- olası aralık (%68)
// Gerçek / tahmin oranının gerçek yeniden girişlerdeki dağılımından (%16 ve %84 dilimleri), gerçek kalan süre dilimlerine göre:
//   LEO: 1965–2016 arası 758 cisim (GCAT + McDowell arşivi), Güneş aktivitesi bilinmiyormuş gibi (ortalama çevrim) hesaplanmış tahminlerle — gelecek
//        Güneş çevriminin belirsizliği aralığın içindedir; GTO/HEO (Ay–Güneş): 464 cisim (1975–2016). Uygulamada dilim, tahmin edilen süreye göre seçilir.
//   Kapsama (test/test_impact.js): LEO cisimlerin iki yarısında çapraz %69; 2025–26 gerçek yeniden girişlerinde %86 (aralık temkinli); HEO %65–70.
//   12 yıldan uzun süreler için son dilim kullanılır (sınanmadı).
export const BAND = { days: [0, 30, 120, 365, 730, 1825, 4400], leo: [[0.71, 1.2], [0.58, 1.32], [0.55, 1.32], [0.53, 1.3], [0.51, 1.46], [0.35, 1.94]],
  heo: [[0.26, 1.36], [0.84, 1.83], [1, 1.8], [1, 1.51], [0.99, 1.33], [0.96, 1.29]] };
export function lifeRange(days, deep = false) {
  if (!(days > 0) || !Number.isFinite(days)) return null;
  const D = BAND.days; let k = 0; while (k < D.length - 2 && days >= D[k + 1]) k++;
  const q = (deep ? BAND.heo : BAND.leo)[k];
  return { lo: days * q[0], hi: days * q[1], extrap: days >= D[D.length - 1] };
}

// o: CelesTrak GP (OMM) kaydı -> yeniden giriş tahmini
// solar: false -> sabit (ortalama aktivite) atmosfer; varsayılan Güneş çevrimi modeli. lunisolar: false -> derin uzay yörüngesinde de yalnız sürüklenme.
// curveStepDays: eğri eşit aralıklı örneklenir (varsayılan: seyrekleşen örnekleme)
export function assessSat(o, nowMs = Date.now(), withCurve = true, hist = null, { solar = true, lunisolar = true, curveStepDays = 0, deepReentryKm = DEEP_REENTRY_KM } = {}) {
  const n = +o.MEAN_MOTION, e0 = +o.ECCENTRICITY;
  if (!(n > 0) || !(e0 >= 0) || e0 >= 1) return { durum: 'nodata' };
  const a0 = Math.cbrt(MU / (n * 2 * Math.PI / DAY) ** 2), hp0 = a0 * (1 - e0) - RE, ha0 = a0 * (1 + e0) - RE;
  const ep = parseEpoch(o.EPOCH), epochMs = Number.isFinite(ep) ? ep : nowMs;
  const deep = 1440 / n >= DEEP_PERIOD_MIN;                                                              // perijeyi Ay–Güneş çekimi yönetir
  const inc = +o.INCLINATION * RAD, raan = +o.RA_OF_ASC_NODE * RAD, argp = +o.ARG_OF_PERICENTER * RAD;
  // Ay–Güneş hesabı: derin uzay, belirgin eksantrik (e > 0,1: GTO, Molniya, Cluster türü; GEO/MEO'da perije atmosfere inemez) ve açılar varsa
  const ls = deep && lunisolar && e0 > 0.1 && [o.INCLINATION, o.RA_OF_ASC_NODE, o.ARG_OF_PERICENTER].every((x) => x != null && x !== '' && Number.isFinite(+x));
  const base = { perigeeKm: hp0, apogeeKm: ha0, ecc: e0, epochMs, age: ageYears(o, nowMs), deep, lunisolar: ls }, reK = ls ? deepReentryKm : REENTRY_KM;
  if (hp0 < reK) return { ...base, durum: 'reentry', lifeDays: 0, reentryMs: epochMs, conf: 'high', curve: [[0, hp0, ha0]] };
  // sürüklenme ihmal edilebilir (yüzyıllar); Ay–Güneş çekimi perijeyi yine de indirebilir (ör. Cluster II: 2026'da perije 1 yılda 4.600 km'den yeniden girişe)
  if (hp0 > 1400 && !ls) return { ...base, durum: 'high', lifeDays: Infinity, conf: 'mid' };
  const bstar = +o.BSTAR, ndot = +o.MEAN_MOTION_DOT;
  // genlik çağdaki yoğunluğa (hp0, çağın aktivitesi) bağlanır: B* ve gözlenen bozunma o günkü gerçek atmosferi yansıtır
  const c0 = solar ? actC(epochMs) : 0, lnr0 = lnrho(hp0) - c0 * xm(hp0);
  const krB = bstar > 1e-7 ? kRhoFromBstar(bstar, hp0) : 0, krN = ndot > 0 && !deep ? kRhoFromNdot(ndot, a0, e0, lnr0, c0) : 0;   // derin uzay TLE'sinde (SDP4) ṅ Ay–Güneş etkisini taşır, sürüklenmeyi değil
  // geçmiş yörünge eğimi (yarı büyük eksen a(t), manevrasız dilim) varsa sürüklenme genliği oradan kalibre edilir: gözlenen gerçek bozunma, tek anlık B*'tan daha sağlam
  let krH = 0;
  // geçmiş özeti GP kaydıyla aynı döneme aitse kullanılır (haftalık yenilenir; 45 günden eski ya da ileri bir özet başka bir yörünge durumunu anlatır)
  const histFresh = hist && !(hist.epochDay > 0 && Math.abs(hist.epochDay * 864e5 - epochMs) > 45 * 864e5);
  if (histFresh && hist.slopeKmDay < -1e-4 && hist.segDays >= 45) krH = krFromSlope(hist, a0, e0, lnr0, epochMs, solar);
  // Geçmiş eğimi (aylar boyu ortalama) ile B* (son günler) farklı hataları taşır; ikisi de varsa geometrik ortalamaları kullanılır. Gerçek yeniden girişlerde
  // (docs/fizik_denetimi.md §4.2b) bu, yalnız eğimden ya da yalnız B*'tan daha iyi sonuç verdi (60–480 gün kala medyan |ln hata| 0,12–0,27).
  // B* ile gözlenen bozunma (ṅ) 3 kattan çok uyuşmuyorsa gözlenen bozunma kullanılır: tarihsel TLE'lerde B* çoğu kez anlamsız küçüktü (yalnız B* ile
  // bu tahminler gerçeğin ~130 katı uzun çıkıyordu); geçmiş eğimi varsa o öncelikli
  const mis = krB > 0 && krN > 0 && (krB / krN < 1 / 3 || krB / krN > 3);
  const kr0 = krH > 0 && krB > 0 ? Math.sqrt(krH * krB) : krH > 0 ? krH : mis ? krN : krB > 0 ? krB : krN;
  if (!(kr0 > 0) && !ls) return { ...base, durum: 'nodrag', lifeDays: Infinity, conf: 'low' };          // Ay–Güneş yörüngesinde sürüklenmesiz de tümlenir
  const ratio = krH > 0 && krB > 0 ? krH / krB : krB > 0 && krN > 0 ? krB / krN : null, method = krH > 0 ? 'hist' : mis || !(krB > 0) ? 'ndot' : 'bstar';
  let a = a0, e = e0, t = 0, hp = hp0, nextRec = curveStepDays > 0 ? curveStepDays * DAY : 0.5 * DAY, steps = 0;
  let hh = null, eh = null;
  if (ls) { hh = [Math.sin(inc) * Math.sin(raan), -Math.sin(inc) * Math.cos(raan), Math.cos(inc)]; const nd = [Math.cos(raan), Math.sin(raan), 0], q = cross(hh, nd); eh = nd.map((x, i) => x * Math.cos(argp) + q[i] * Math.sin(argp)); }
  const maxS = (ls ? 100 * YEAR : MAX_DAYS) * DAY, maxDt = ls ? 4 * DAY : 60 * DAY;                     // Ay–Güneş terimleri (2λ☉, 2ω) 4 günlük adımla çözülür
  const curve = withCurve ? [[0, hp0, ha0]] : null;
  while (hp > reK && t < maxS && steps < 60000) {
    const [dadt, dedt] = kr0 > 0 && hp < 1500 ? derivs(a, e, kr0, lnr0, solar ? actC(epochMs + t * 1000) : 0) : [0, 0], drp = dadt * (1 - e) - a * dedt;
    // adım: perije ölçek yüksekliğinin %3'ünden, a da (apoje − perije)/2 + H'nin %2'sinden çok değişmesin (eksantrik yörüngede perije neredeyse sabitken apoje hızla düşer)
    const H = scaleH(hp), dt = Math.min(maxDt, Math.max(30, Math.min(0.03 * H / Math.max(-drp, 1e-18), 0.02 * (a * e + H) / Math.max(-dadt, 1e-18))));
    // durum (a, perije) olarak ilerletilir: (a, e) ile ilerletmek perijeye adım başına −Δa·Δe ikinci derece hatası ekler; GTO'da bu, gerçek perije
    // alçalmasından (Δa'nın ~2·10⁻⁴'ü) kat kat büyüktür ve ömrü ~3× kısaltıyordu
    a += dadt * dt; hp = Math.min(hp + drp * dt, a - RE); e = Math.max(0, 1 - (hp + RE) / a);
    if (ls && e > 1e-6) { [e, eh, hh] = secularStep(eh, hh, e, a, epochMs + t * 1000, dt); hp = a * (1 - e) - RE; }
    t += dt; steps++;
    if (withCurve && t >= nextRec) { curve.push([t / DAY, hp, a * (1 + e) - RE]); if (curveStepDays > 0) nextRec += curveStepDays * DAY; else nextRec *= 1.15; }
  }
  const capped = hp > reK;
  const lifeDays = capped ? Infinity : t / DAY;
  if (withCurve && !capped) curve.push([lifeDays, reK, Math.max(reK, a * (1 + e) - RE)]);
  const rg = capped ? null : lifeRange(lifeDays, ls);
  return { ...base, durum: capped ? 'long' : 'decaying', lifeDays, range: rg && { loMs: epochMs + rg.lo * DAY * 1000, hiMs: epochMs + rg.hi * DAY * 1000, extrap: rg.extrap }, reentryMs: capped ? Infinity : epochMs + lifeDays * DAY * 1000,
    conf: deep ? 'low' : confidence({ ratio, lifeDays }), horizonYears: ls ? 100 : 300, method, ratio, kr0, curve, capped };
}
// Güven. Gerçek yeniden girişlerle karşılaştırma (GCAT tarihleri; docs/fizik_denetimi.md §4.2d): "yüksek" verilen tahminlerin %98'i gerçeğin 2 katı içinde
// (1965–2016: 318 tahmin; 2025–26: 192 tahmin); tüm tahminlerde 2 kat içinde kalma 1,5 yıla kadar %86–94, 1,5–3 yılda %84, 3–12 yılda %72.
// Gelecek Güneş çevrimlerinin genliği bilinmediğinden süre uzadıkça güven düşer:
//   yüksek: iki kaynak uyumlu (oran 1/3–3) ve süre < 60 gün
//   orta:   iki kaynak uyumlu ve süre < 25 yıl; ya da tek kaynak ve süre < 30 gün
//   düşük:  kaynaklar uyumsuz, tek kaynak, süre ≥ 25 yıl
export function confidence({ ratio, lifeDays }) {
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
// derin uzay yörüngesi notu: Ay–Güneş çekimi hesaba katıldıysa (yörünge açıları varsa) ortalama model, yoksa yalnız sürüklenme
const deepNote = (r) => (r.lunisolar ? 'Ay–Güneş çekimi dahil (ortalama model; düşük güven)' : 'Ay–Güneş çekimi modelde yok');
// olası aralık metni: kısa sürelerde gün/ay, uzunlarda yıl ("Ara 2026 – Nis 2027", "2029–2034"); geçmişte kalan alt sınır "şimdi" olur
export function fmtRange(rg, nowMs = Date.now()) {
  if (!rg) return '';
  const lo = Math.max(rg.loMs, nowMs), span = (rg.hiMs - nowMs) / 864e5, y = (ms) => new Date(ms).getUTCFullYear();
  const md = (ms) => { const d = new Date(ms); return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const a = rg.loMs <= nowMs ? 'şimdi' : span < 120 ? fmtDate(lo) : span < 730 ? md(lo) : String(y(lo)), b = span < 120 ? fmtDate(rg.hiMs) : span < 730 ? md(rg.hiMs) : String(y(rg.hiMs));
  return a === b ? a : span >= 730 && rg.loMs > nowMs ? `${a}–${b}` : `${a} – ${b}`;
}
export function fmtReentry(r, nowMs = Date.now()) {
  if (!r || r.durum === 'nodata') return 'hesaplanamadı';
  if (r.durum === 'high') return 'çok yüksek yörünge: sürüklenme ihmal edilebilir (yüzyıllar)';
  if (r.durum === 'nodrag') return 'belirsiz: sürüklenme verisi yok (B* ≤ 0)';
  if (r.durum === 'reentry') return 'yeniden giriş aşamasında (perije < 120 km)';
  if (r.capped) return r.deep ? (r.lunisolar ? `> 100 yıl · ${deepNote(r)}` : `yalnız sürüklenmeyle > 300 yıl; ${deepNote(r)}, gerçek süre çok farklı olabilir`) : '> 300 yıl (çok yavaş bozunma)';
  const rem = (r.reentryMs - nowMs) / 864e5;
  if (rem <= 0) return `elemanlara göre yeniden girmiş olmalı (${fmtDate(r.reentryMs)}); veri eski olabilir`;
  return `~${rem < 730 ? fmtDate(r.reentryMs) : new Date(r.reentryMs).getUTCFullYear()} (${fmtSpan(rem)} sonra${r.range ? `; olası aralık ${fmtRange(r.range, nowMs)}${r.range.extrap ? ', sınanmamış' : ''}` : ''}) · güven: ${CONF_TR[r.conf] || CONF_TR.low}${r.deep ? ` · ${deepNote(r)}` : ''}`;
}
