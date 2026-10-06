// Uydu geçiş tahmini ve yer izi için saf hesaplar (tarayıcı ve Node'da çalışır; efemeris sağlayıcısından bağımsız).
//   Konum: SGP4 (satellite.js) -> TEME; yer dönüşü GMST ile (TEME ≈ gerçek ekvator, yaklaşık ECF: nütasyon/kutup hareketi ihmal, < ~50 m).
//   Güneş: düşük duyarlıklı analitik formül (Astronomical Almanac, ~0,01°) — gölge ve alacakaranlık için fazlasıyla yeterli.
//   Gözlemci: WGS-84 elipsoidi.
import * as S from '../lib/satellite.esm.js';

export const R_E = 6378.137, F_E = 1 / 298.257223563, AU = 149597870.7;
const D2R = Math.PI / 180, E2 = F_E * (2 - F_E);

export function gmst(ms) { return S.gstime(new Date(ms)); }
export function eciToEcf(p, g) { const c = Math.cos(g), s = Math.sin(g); return [c * p[0] + s * p[1], -s * p[0] + c * p[1], p[2]]; }
export function ecfToEci(p, g) { const c = Math.cos(g), s = Math.sin(g); return [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]]; }
export function ecfFromGeodetic(lat, lon, h) {           // derece, derece, km
  const f = lat * D2R, l = lon * D2R, sf = Math.sin(f), N = R_E / Math.sqrt(1 - E2 * sf * sf);
  return [(N + h) * Math.cos(f) * Math.cos(l), (N + h) * Math.cos(f) * Math.sin(l), (N * (1 - E2) + h) * sf];
}
export function geodeticFromEcf(r) {                        // -> { lat, lon (derece), h (km) }
  const [x, y, z] = r, p = Math.hypot(x, y), lon = Math.atan2(y, x);
  let lat = Math.atan2(z, p * (1 - E2)), h = 0;
  for (let k = 0; k < 6; k++) { const s = Math.sin(lat), N = R_E / Math.sqrt(1 - E2 * s * s); h = p / Math.cos(lat) - N; lat = Math.atan2(z, p * (1 - E2 * N / (N + h))); }
  return { lat: lat / D2R, lon: lon / D2R, h };
}
// gözlemciden bakış: azimut (kuzeyden saat yönü), yükseklik (derece), menzil (km)
export function lookAngles(obs, ecf) {
  const o = obs.ecf || ecfFromGeodetic(obs.lat, obs.lon, obs.h || 0), f = obs.lat * D2R, l = obs.lon * D2R;
  const d = [ecf[0] - o[0], ecf[1] - o[1], ecf[2] - o[2]];
  const sf = Math.sin(f), cf = Math.cos(f), sl = Math.sin(l), cl = Math.cos(l);
  const e = -sl * d[0] + cl * d[1], n = -sf * cl * d[0] - sf * sl * d[1] + cf * d[2], u = cf * cl * d[0] + cf * sl * d[1] + sf * d[2];
  const rng = Math.hypot(e, n, u);
  return { az: ((Math.atan2(e, n) / D2R) + 360) % 360, el: Math.asin(u / rng) / D2R, range: rng };
}
// Güneş (tarihin ekvator sistemi, km)
export function sunEci(ms) {
  const n = ms / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.460 + 0.9856474 * n) * D2R, g = (357.528 + 0.9856003 * n) * D2R;
  const lam = L + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R, eps = (23.439 - 4e-7 * n) * D2R;
  const R = (1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g)) * AU;
  return [R * Math.cos(lam), R * Math.cos(eps) * Math.sin(lam), R * Math.sin(eps) * Math.sin(lam)];
}
// uydu Güneş ışığında mı (Dünya'nın silindirik gölgesi)
export function sunlit(p, sun) {
  const sn = Math.hypot(...sun), s = [sun[0] / sn, sun[1] / sn, sun[2] / sn], a = p[0] * s[0] + p[1] * s[1] + p[2] * s[2];
  if (a > 0) return true;
  return Math.hypot(p[0] - a * s[0], p[1] - a * s[1], p[2] - a * s[2]) > R_E;
}
export function propagate(rec, ms) {
  let pv = null; try { pv = S.propagate(rec, new Date(ms)); } catch (e) { return null; }
  if (!pv || !pv.position || !Number.isFinite(pv.position.x)) return null;
  return { p: [pv.position.x, pv.position.y, pv.position.z], v: [pv.velocity.x, pv.velocity.y, pv.velocity.z] };
}
// anlık durum: yer izi noktası, irtifa, gözlemciden bakış, aydınlanma
export function stateAt(rec, ms, obs) {
  const pv = propagate(rec, ms); if (!pv) return null;
  const g = gmst(ms), ecf = eciToEcf(pv.p, g), gd = geodeticFromEcf(ecf), sun = sunEci(ms);
  const out = { ms, eci: pv.p, ecf, lat: gd.lat, lon: gd.lon, alt: gd.h, speed: Math.hypot(...pv.v), sunlit: sunlit(pv.p, sun) };
  if (obs) { const la = lookAngles(obs, ecf); out.az = la.az; out.el = la.el; out.range = la.range; out.obsSunEl = lookAngles(obs, eciToEcf(sun, g)).el; }
  return out;
}
// kapsama alanı: uydunun ufkunun (0°) ya da minEl yükseklik açısının yerde çizdiği daire için merkez açı (radyan)
export function footprintAngle(altKm, minElDeg = 0) {
  const e = minElDeg * D2R; return Math.acos(R_E * Math.cos(e) / (R_E + altKm)) - e;
}
export function compass(az) { return ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'][Math.round(az / 22.5) % 16]; }

// geçişler: [startMs, startMs + days) içinde yükseklik açısı 0°'yi aşan her geçiş (minMaxEl'den alçaklar atılır)
// Taramanın kendisi bir üreteçtir (findPassesIter): her SLICE adımda yield eder, çağıran isterse zaman dilimlerine bölerek çalıştırır
// (3 günlük tarama uydu başına ~90 ms; ana iş parçacığında uzun görev yapmasın). findPasses aynı sonucu tek seferde verir.
export const PASS_SLICE = 256;
export function findPasses(...args) {
  const it = findPassesIter(...args); let r;
  while (!(r = it.next()).done);
  return r.value;
}
export function* findPassesIter(rec, obs, startMs, days = 3, opt = {}) {
  const step = opt.stepMs || 30000, minMax = opt.minMaxEl ?? 10, end = startMs + days * 86400000, out = [];
  obs = { ...obs, ecf: ecfFromGeodetic(obs.lat, obs.lon, obs.h || 0) };
  const elAt = (ms) => { const pv = propagate(rec, ms); return pv ? lookAngles(obs, eciToEcf(pv.p, gmst(ms))).el : NaN; };
  const cross = (a, b, up) => { for (let k = 0; k < 40 && b - a > 500; k++) { const m = (a + b) / 2, e = elAt(m); if ((e > 0) === up) b = m; else a = m; } return (a + b) / 2; };
  // yer sabit / hep görünür uydular: geçiş kavramı yok
  const n = rec.no * 1440 / (2 * Math.PI);                                   // tur/gün
  if (n < 1.1) {
    const s = stateAt(rec, startMs, obs);
    return s ? [{ kind: 'sabit', always: s.el > 0, az: s.az, el: s.el }] : [];
  }
  let prev = elAt(startMs), tRise = prev > 0 ? startMs : null;
  for (let ms = startMs + step, k = 0; ms <= end; ms += step) {
    if (++k % PASS_SLICE === 0) yield k;
    const e = elAt(ms);
    if (!Number.isFinite(e)) { prev = e; continue; }
    if (prev <= 0 && e > 0) tRise = cross(ms - step, ms, true);
    else if (prev > 0 && e <= 0 && tRise != null) {
      const tSet = cross(ms - step, ms, false), p = passDetail(rec, obs, tRise, tSet);
      if (p.max.el >= minMax) out.push(p);
      tRise = null;
      if (opt.max && out.length >= opt.max) break;
    }
    prev = e;
  }
  return out;
}
// bir geçişin ayrıntısı: doğuş/en yüksek/batış, görünürlük, gökyüzü yolu (kutup çizimi için)
export function passDetail(rec, obs, tRise, tSet) {
  const N = Math.max(24, Math.min(180, Math.round((tSet - tRise) / 5000))), path = [];
  let max = null, visFrom = null, visTo = null;
  for (let k = 0; k <= N; k++) {
    const ms = tRise + (tSet - tRise) * k / N, s = stateAt(rec, ms, obs); if (!s) continue;
    const vis = s.sunlit && s.obsSunEl < -6 && s.el > 0;
    path.push({ ms, az: s.az, el: s.el, vis, sunlit: s.sunlit });
    if (!max || s.el > max.el) max = { ms, az: s.az, el: s.el, range: s.range, sunlit: s.sunlit, obsSunEl: s.obsSunEl };
    if (vis) { if (visFrom == null) visFrom = ms; visTo = ms; }
  }
  // en yüksek noktayı altın oranla incelt
  let a = Math.max(tRise, max.ms - (tSet - tRise) / N), b = Math.min(tSet, max.ms + (tSet - tRise) / N);
  const el = (ms) => { const s = stateAt(rec, ms, obs); return s ? s.el : -90; };
  for (let k = 0; k < 30; k++) { const m1 = b - (b - a) * 0.618, m2 = a + (b - a) * 0.618; if (el(m1) < el(m2)) a = m1; else b = m2; }
  const sm = stateAt(rec, (a + b) / 2, obs); if (sm) max = { ms: sm.ms, az: sm.az, el: sm.el, range: sm.range, sunlit: sm.sunlit, obsSunEl: sm.obsSunEl };
  const r = stateAt(rec, tRise, obs), st = stateAt(rec, tSet, obs);
  const dark = max.obsSunEl < -6;
  return { rise: { ms: tRise, az: r ? r.az : NaN }, max, set: { ms: tSet, az: st ? st.az : NaN }, duration: (tSet - tRise) / 1000,
    visible: visFrom != null, visFrom, visTo, dark, kind: visFrom != null ? 'görünür' : dark ? 'gölgede' : 'gündüz', path };
}
// yer izi (ECF, km): t0 çevresinde [-before, +after] turlar
export function groundTrack(rec, ms0, before = 0.5, after = 1.5, n = 300, liftKm = 12) {
  const P = 86400000 / (rec.no * 1440 / (2 * Math.PI)), out = [];
  for (let k = 0; k <= n; k++) {
    const ms = ms0 + (-before + (before + after) * k / n) * P, pv = propagate(rec, ms); if (!pv) continue;
    const ecf = eciToEcf(pv.p, gmst(ms)), gd = geodeticFromEcf(ecf), f = gd.lat * D2R, l = gd.lon * D2R, R = R_E + liftKm;
    out.push({ ms, past: ms < ms0, p: [R * Math.cos(f) * Math.cos(l), R * Math.cos(f) * Math.sin(l), R * Math.sin(f)] });
  }
  return { P, pts: out };
}
// kapsama dairesi (ECF, km)
export function footprint(ecfSub, altKm, minEl = 0, n = 128, liftKm = 10) {
  const lam = footprintAngle(altKm, minEl), R = R_E + liftKm, u = ecfSub.map((x) => x / Math.hypot(...ecfSub));
  const a = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e1 = norm3(cross3(a, u)), e2 = cross3(u, e1), out = [];
  for (let k = 0; k <= n; k++) {
    const th = 2 * Math.PI * k / n, c = Math.cos(lam), s = Math.sin(lam);
    out.push([0, 1, 2].map((i) => R * (c * u[i] + s * (Math.cos(th) * e1[i] + Math.sin(th) * e2[i]))));
  }
  return out;
}
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => { const n = Math.hypot(...a); return a.map((x) => x / n); };
