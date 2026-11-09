// Yer ağı (gösterim katmanı; görev fiziğini değiştirmez): aracın hangi yer istasyonu ya da röle uydusuyla haberleşebildiği, etkin istasyon ve devirler,
// istasyondan tek yön / gidiş-dönüş ışık süresi, Ay'ın araç ile istasyon arasına girmesi (LOS/AOS) ve gölge giriş/çıkışları. Saf hesap (DOM yok): ana iş
// parçacığı (HUD, kontrol paneli, sahne) ve fizik worker'ı (olay taraması, öngörü) aynı kodu kullanır; test/test_groundnet.js sınar.
//
// Kaynaklar
//   DSN istasyonları: DSN 810-005, Modül 301 Rev. K "Coverage and Geometry" (JPL, 2016), Tablo 5: WGS-84 jeodezik koordinatlar (70 m antenler DSS 14, 43, 63;
//     kompleks bu antenin yerinde temsil edilir). Maskeler aynı belgeden: alma (downlink) için az-el kaidesinin mekanik yükseklik sınırı ≈ 6° (§2.2.2);
//     gönderme (uplink, gidiş-dönüş bağlantı) için 10,4° (DSS 14) ve 10,2° (DSS 43, DSS 63) (§2.2.3.2). Arazi maskesinin azimuta bağlı ayrıntısı
//     (ör. DSS 63'ün kuzeybatısında 20,2° gönderme sınırı) ve zenit "anahtar deliği" (> 89°) modellenmez.
//   Ağ devri: Artemis I, Dünya'dan ~22.000 mil (35.406 km) uzakta Yakın Uzay Ağı'ndan (NSN: TDRS röle uyduları + yakın Dünya yer istasyonları) Derin Uzay
//     Ağı'na (DSN) devredildi — NASA, "Artemis I: Demonstrating the Capabilities of NASA's United Networks"
//     (https://www.nasa.gov/missions/artemis/artemis-i-demonstrating-the-capabilities-of-nasas-united-networks).
//   TDRS: yer eşzamanlı röle uyduları. Doğu 41° B ve Batı 171° B ilk TDRSS düzeninin yerleri (NASA NTRS 19740002694); Z 85° D (= 275° B, Hint Okyanusu,
//     "dışlama bölgesi"ni kapatır; TDRS-7'nin yeri, ikincil kaynak) (v). Yer terminalleri: White Sands Kompleksi (32,50° K, 106,61° B) (v) ve Guam uzak yer
//     terminali (13,62° K, 144,86° D) (v). Röle hattının Dünya'yı sıyırma payı 100 km (atmosfer) (v). TDRS anten görüş alanı sınırı modellenmez (v).
//   Yakın Dünya ağının yer istasyonları (Wallops, White Sands, Svalbard…) ayrıca modellenmez: TDRS üçlüsü alçak yörüngeyi neredeyse kesintisiz kapatır.
//   DSN Now (https://eyes.jpl.nasa.gov/apps/dsn-now/) her kompleks için anteni, hedefi, menzili ve gidiş-dönüş ışık süresini gösterir; buradaki satırlar aynı büyüklüklerdir.
//
// Işık süresi: tek yön = menzil / c (TDRS'te araç → TDRS → yer terminali), gidiş-dönüş ≈ 2 × tek yön. İstasyonun ve aracın ışık yolculuğu sırasındaki hareketi
// ihmal edilir (Ay mesafesinde bağıl etki ~ v·τ/ρ ≈ 10⁻⁵ ≈ 30 µs).
import * as E from './engine.js';
import { ecfFromGeodetic, WGS84_A } from './geo.js';
import { sphereBlocksSegment, sunlightFraction } from './telemetry.js';

const { sub, dot, norm, mv, mtv } = E;
const D2R = Math.PI / 180;
export const C_KM_S = 299792.458;                       // ışık hızı, km/s
export const HANDOVER_KM = 22000 * 1.609344;            // NSN → DSN devri (Artemis I): 22.000 mil = 35.405,6 km
export const GEO_R = 42164.17;                          // yer eşzamanlı yörünge yarıçapı, km (μ/Ω² kökü)
export const ATM_KM = 100;                              // röle hattı için Dünya'yı sıyırma payı (v)
const dms = (d, m, s) => Math.sign(d || 1) * (Math.abs(d) + m / 60 + s / 3600);
const wrap180 = (x) => ((x + 540) % 360) - 180;

// yer noktası: ECF konum (km) ve yerel doğu/kuzey/yukarı (jeodezik normal)
function siteFrame(lat, lon, hKm) {
  const f = lat * D2R, l = lon * D2R, ecf = ecfFromGeodetic(lat, lon, hKm);
  return { ecf, up: [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)], east: [-Math.sin(l), Math.cos(l), 0], north: [-Math.sin(f) * Math.cos(l), -Math.sin(f) * Math.sin(l), Math.cos(f)] };
}
// DSN kompleksleri (810-005 301 Rev. K, Tablo 5; güney yarım kürede derece, dakika, saniye hepsi negatif)
export const DSN = [
  { id: 'DSS-14', name: 'Goldstone', ant: '70 m', lat: dms(35, 25, 33.24312), lon: wrap180(dms(243, 6, 37.66244)), h: 1.00139, rx: 6, tx: 10.4 },
  { id: 'DSS-43', name: 'Canberra', ant: '70 m', lat: -dms(35, 24, 8.72724), lon: dms(148, 58, 52.56231), h: 0.688867, rx: 6, tx: 10.2 },
  { id: 'DSS-63', name: 'Madrid', ant: '70 m', lat: dms(40, 25, 52.35510), lon: wrap180(dms(355, 45, 7.16924)), h: 0.864816, rx: 6, tx: 10.2 },
].map((s) => ({ ...s, net: 'DSN', ...siteFrame(s.lat, s.lon, s.h) }));
const WSC = siteFrame(32.50, -106.61, 1.2), GRGT = siteFrame(13.62, 144.86, 0.2);              // TDRS yer terminalleri (v)
export const TDRS = [
  { id: 'TDRS-E', name: 'TDRS Doğu', lon: -41, gt: WSC },
  { id: 'TDRS-W', name: 'TDRS Batı', lon: -171, gt: WSC },
  { id: 'TDRS-Z', name: 'TDRS Z', lon: 85, gt: GRGT },
].map((s) => ({ ...s, net: 'NSN', ecf: [GEO_R * Math.cos(s.lon * D2R), GEO_R * Math.sin(s.lon * D2R), 0] }));
export const NET_NAME = { NSN: 'Yakın Uzay Ağı (TDRS)', DSN: 'Derin Uzay Ağı (DSN)' };
export const stationById = (id) => DSN.find((s) => s.id === id) || TDRS.find((s) => s.id === id) || null;

// Ortam: ICRF → ITRF dönüşümü, Ay ve Güneş (geosentrik). Fizik motorundan (canlı efemeris); testte de aynı.
export const envAt = (t) => ({ M: E.earthIcrfToItrf(t), rm: E.moonPos(t), sun: E.sunPos(t) });

// t anında araç (rv: geosentrik ICRF, km) için tüm istasyonların durumu ve etkin bağlantı.
//   stations[i]: { id, name, net, el, az (rad; TDRS'te null), range (km), moon (Ay engelliyor), earth (Dünya engelliyor), ok (alma: maske üstü ve engelsiz),
//                  up (gönderme: gidiş-dönüş bağlantı mümkün), oneWay (s) }
//   net: aracın uzaklığına göre görevli ağ (NSN < 35.406 km ≤ DSN); active: o ağda bağlantısı olan istasyonlardan DSN'de en yüksekteki, NSN'de en yakın röle.
//   cause (bağlantı yoksa): 'moon' (ağın ufkun üstündeki istasyonlarını Ay engelliyor) | 'horizon' (hiçbiri maske üstünde değil).
export function linkState(t, rv, env = envAt(t)) {
  const M = env.M, rm = env.rm, ve = mv(M, rv), dE = norm(rv), net = dE < HANDOVER_KM ? 'NSN' : 'DSN', stations = [];
  for (const s of DSN) {
    const d = sub(ve, s.ecf), range = norm(d), el = Math.asin(Math.max(-1, Math.min(1, dot(d, s.up) / range))), az = (Math.atan2(dot(d, s.east), dot(d, s.north)) + 2 * Math.PI) % (2 * Math.PI);
    const moon = sphereBlocksSegment(mtv(M, s.ecf), rv, rm, E.R_M), above = el >= s.rx * D2R;
    stations.push({ id: s.id, name: s.name, net: 'DSN', el, az, range, moon, earth: !above, above, ok: above && !moon, up: el >= s.tx * D2R && !moon, oneWay: range / C_KM_S });
  }
  for (const s of TDRS) {
    const p = mtv(M, s.ecf), range = norm(sub(rv, p)), earth = sphereBlocksSegment(p, rv, [0, 0, 0], WGS84_A + ATM_KM), moon = sphereBlocksSegment(p, rv, rm, E.R_M);
    const relay = norm(sub(s.gt.ecf, s.ecf));
    stations.push({ id: s.id, name: s.name, net: 'NSN', el: null, az: null, range, moon, earth, above: !earth, ok: !earth && !moon, up: !earth && !moon, oneWay: (range + relay) / C_KM_S });
  }
  let active = null;
  for (const q of stations) if (q.net === net && q.ok && (!active || (net === 'DSN' ? q.el > active.el : q.range < active.range))) active = q;
  const cause = active ? null : stations.some((q) => q.net === net && q.above && q.moon) ? 'moon' : 'horizon';
  return { t, net, dEarth: dE, stations, active, cause, oneWay: active ? active.oneWay : null, rtlt: active ? 2 * active.oneWay : null };
}

// Gölge: Güneş diskinin açık kalan oranı < 0,5 ise gölgede (yarı gölgenin ortası; telemetry.sunlightFraction iki disk kesişimiyle). by: örten cisim.
export function shadowAt(rv, env) {
  const frac = sunlightFraction(rv, env.sun, [[[0, 0, 0], E.R_E], [env.rm, E.R_M]]);
  if (frac >= 0.5) return { frac, by: null };
  const fE = 1 - sunlightFraction(rv, env.sun, [[[0, 0, 0], E.R_E]]), fM = 1 - sunlightFraction(rv, env.sun, [[env.rm, E.R_M]]);
  return { frac, by: fE >= fM ? 'Dünya' : 'Ay' };
}

// Tarama adımı (s): cisme yakın (alçak yörünge, Ay yörüngesi) 10 s, uzakta en çok 300 s; geçişler sonra 0,5 s'ye dek ikiye bölünür.
export function scanStep(rv, rm) {
  const h = Math.min(norm(rv) - E.R_E, norm(sub(rv, rm)) - E.R_M);
  return Math.max(10, Math.min(300, h / 40));
}

// İletişim ve gölge olay tarayıcısı: art arda çağrılan scan(tb, posAt) [önceki t, tb] aralığını tarar, bayrak değişimlerini ikiye bölerek bulur ve olay üretir:
//   LOS { from, cause } · AOS { to, dur (LOS süresi) } · HANDOVER { from, to } (aynı ağda istasyon değişimi) · NET { from, to, net } (NSN → DSN devri) ·
//   ECL_IN { by } · ECL_OUT { by, dur (gölge süresi) }. posAt(t): aracın geosentrik ICRF konumu (ara değer).
// Durum (açık LOS/gölge başlangıcı) korunur: worker'da fizik adımlarıyla, öngörüde öngörü yolu boyunca çalışır. Aynı tarama aralığında iki kez değişen bayrak (çok kısa olay) kaçırılabilir.
export class EventScanner {
  constructor(env = envAt) { this.env = env; this.reset(); }
  reset() { this.t = null; this.f = null; this.losT = null; this.shT = null; }
  flags(t, r) { const en = this.env(t), L = linkState(t, r, en), sh = shadowAt(r, en); return { link: L.active ? L.active.id : null, net: L.net, cause: L.cause, sh: sh.by }; }
  // ilk durum (olay üretmez): tarama buradan başlar
  start(t, r, open = {}) { this.t = t; this.f = this.flags(t, r); this.losT = open.losT ?? null; this.shT = open.shT ?? null; }
  scan(tb, posAt, dtMax = null) {
    const out = [];
    if (this.t == null) { this.start(tb, posAt(tb)); return out; }
    if (!(tb > this.t)) return out;
    const t0 = this.t, dt = dtMax || scanStep(posAt(tb), this.env(tb).rm), n = Math.max(1, Math.ceil((tb - t0) / dt));
    let ta = t0, fa = this.f;
    const bisect = (lo, hi, fLo, fHi, same) => { while (hi - lo > 0.5) { const m = 0.5 * (lo + hi), fm = this.flags(m, posAt(m)); if (same(fm, fLo)) lo = m; else { hi = m; fHi = fm; } } return [hi, fHi]; };
    for (let k = 1; k <= n; k++) {
      const tk = k === n ? tb : t0 + ((tb - t0) * k) / n, fk = this.flags(tk, posAt(tk)), evs = [];
      // bir alt aralıkta birden çok geçiş olabilir (ör. Canberra batar, Madrid doğar: LOS sonra AOS): her geçiş sırayla ikiye bölünür
      const walk = (same, emit) => {
        let lo = ta, fLo = fa;
        for (let it = 0; it < 8 && !same(fLo, fk); it++) { const [te, fe] = bisect(lo, tk, fLo, fk, same); emit(fLo, fe, te); lo = te; fLo = fe; }
      };
      walk((x, y) => x.link === y.link && x.net === y.net, (a, b, te) => evs.push(this.linkEvent(a, b, te)));
      walk((x, y) => x.sh === y.sh, (a, b, te) => evs.push(...this.shadowEvents(a, b, te)));
      evs.sort((a, b) => a.t - b.t); out.push(...evs);
      ta = tk; fa = fk;
    }
    this.t = tb; this.f = fa;
    return out;
  }
  linkEvent(a, b, t) {
    if (a.link && !b.link) { this.losT = t; return { t, key: 'LOS', from: a.link, cause: b.cause, net: b.net }; }
    if (!a.link && b.link) { const dur = this.losT != null ? t - this.losT : null; this.losT = null; return { t, key: 'AOS', to: b.link, net: b.net, dur }; }
    return a.net !== b.net ? { t, key: 'NET', from: a.link, to: b.link, net: b.net } : { t, key: 'HANDOVER', from: a.link, to: b.link, net: b.net };
  }
  shadowEvents(a, b, t) {
    const out = [];
    if (a.sh) { out.push({ t, key: 'ECL_OUT', by: a.sh, dur: this.shT != null ? t - this.shT : null }); this.shT = null; }
    if (b.sh) { out.push({ t, key: 'ECL_IN', by: b.sh }); this.shT = t; }
    return out;
  }
}

// Hermite ara değeri (konum): a, b = { t, r, v } → posAt(t). Fizik geçmişi (worker) ve öngörü yolu için.
export function hermitePos(a, b) {
  const h = b.t - a.t;
  return (t) => {
    if (!(h > 0)) return b.r;
    const s = Math.max(0, Math.min(1, (t - a.t) / h)), h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
    return [0, 1, 2].map((k) => h00 * a.r[k] + h10 * h * a.v[k] + h01 * b.r[k] + h11 * h * b.v[k]);
  };
}
// Örnek dizisi (t artan; { t, r, v }) üstünde tarama: öngörü yolundan beklenen olaylar. open: tarama başında açık LOS/gölge başlangıçları (süreler için)
export function scanPath(pts, open = {}, env = envAt) {
  if (!pts || pts.length < 2) return [];
  const S = new EventScanner(env); S.start(pts[0].t, pts[0].r, open);
  const out = [];
  for (let i = 1; i < pts.length; i++) out.push(...S.scan(pts[i].t, hermitePos(pts[i - 1], pts[i])));
  return out;
}

// İstasyonun Dünya üstündeki kapsama dairesinin merkez açısı (rad): araç altKm irtifasındayken istasyonun onu minEl üstünde gördüğü alt nokta bölgesi
// (küresel Dünya; passes.js footprint ile aynı geometri). Yer izi ve istasyon daireleri için.
export function coverageAngle(altKm, minElDeg) { const e = minElDeg * D2R; return Math.acos(Math.min(1, (WGS84_A * Math.cos(e)) / (WGS84_A + Math.max(0, altKm)))) - e; }
