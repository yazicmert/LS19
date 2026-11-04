// Dünya şekli ve dönüşü: WGS-84 elipsoidi, yıldız dönme hızı, jeodezik ↔ Dünya'ya bağlı (ECF) dönüşümler.
// Tek kaynak: sabitler ascent, ascentplay, ascentsim, pads, passes, telemetry ve rockets'ta ayrı ayrı yazılıydı (iki farklı ω değeriyle);
// irtifa ui ve cinema'da kaba bir formülle (|r| − R(1 − f sin²φ), rampada ~12 m sapma) hesaplanıyordu.
import { dot, norm, sub, scale } from './vec3.js';

export const WGS84_A = 6378.137;                       // km, ekvator yarıçapı
export const WGS84_F = 1 / 298.257223563;              // basıklık
export const WGS84_E2 = WGS84_F * (2 - WGS84_F);       // birinci dışmerkezliğin karesi
export const OMEGA_E = 7.2921159e-5;                   // rad/s, Dünya'nın yıldız dönme hızı
export const MU_E = 398600.4418;                       // km³/s², Dünya'nın çekim parametresi
const D2R = Math.PI / 180;

// jeodezik (derece, derece, km) → ECF (km)
export function ecfFromGeodetic(lat, lon, h = 0) {
  const f = lat * D2R, l = lon * D2R, sf = Math.sin(f), N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sf * sf);
  return [(N + h) * Math.cos(f) * Math.cos(l), (N + h) * Math.cos(f) * Math.sin(l), (N * (1 - WGS84_E2) + h) * sf];
}
// ECF (km) → { lat, lon (derece), h (km) }
export function geodeticFromEcf(r) {
  const [x, y, z] = r, p = Math.hypot(x, y), lon = Math.atan2(y, x);
  let lat = Math.atan2(z, p * (1 - WGS84_E2)), h = 0;
  for (let k = 0; k < 6; k++) { const s = Math.sin(lat), N = WGS84_A / Math.sqrt(1 - WGS84_E2 * s * s); h = p / Math.cos(lat) - N; lat = Math.atan2(z, p * (1 - WGS84_E2 * N / (N + h))); }
  return { lat: lat / D2R, lon: lon / D2R, h };
}
// Merkez cisme göre konumdan jeodezik enlem (rad) ve elipsoid üstü yükseklik (km). pole: dönme ekseni (birim), a: ekvator yarıçapı, f: basıklık.
// Sabit nokta yinelemesi (Bowring); kutupta ve kutuptan uzakta (Ay mesafesi dahil) yakınsar.
export function geodetic(r, pole, a = WGS84_A, f = WGS84_F) {
  const z = dot(r, pole), p = norm(sub(r, scale(pole, z))), e2 = f * (2 - f);
  let lat = Math.atan2(z, p * (1 - e2)), h = 0;
  for (let i = 0; i < 16; i++) {
    const s = Math.sin(lat), c = Math.cos(lat), N = a / Math.sqrt(1 - e2 * s * s);
    h = Math.abs(c) > 0.7071 ? p / c - N : Math.abs(z) / Math.abs(s) - N * (1 - e2);
    const nl = Math.atan2(z, p * (1 - e2 * N / (N + h))), done = Math.abs(nl - lat) < 1e-15;
    lat = nl; if (done) break;
  }
  return { lat, h };
}
const Z = [0, 0, 1];
// gösterge irtifası: ICRF konumundan elipsoid üstü yükseklik (kutup ≈ ICRF z; presesyonun etkisi LEO'da metre altı)
export const ellipsoidAlt = (r) => geodetic(r, Z).h;
