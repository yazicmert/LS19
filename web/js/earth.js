// Dünya yönelimi: IAU 2006 presesyon (Fukushima–Williams) + IAU 2000A nütasyon (IAU 2006 uyarlamalı) + ERA/GAST.
// Zaman ölçekleri: TT (≈TDB), UT1 = TT − ΔT (tablo), UTC = TT − 32.184 − (TAI−UTC).
// Kutup hareketi ihmal (≤ 0.5″ ≈ 15 m).

const AS2R = Math.PI / 180 / 3600, TURNAS = 1296000, D2PI = 2 * Math.PI;
let D = null;

export function loadEarthOrientation(data) { D = data; }
export const earthOrientationLoaded = () => D !== null;

// ---------------------------------------------------------------- zaman ölçekleri
export function deltaT(jdTT) {                   // TT − UT1 (s)
  const x = (jdTT - D.dt_jd0) / D.dt_step, n = D.dt.length;
  const i = Math.max(0, Math.min(n - 2, Math.floor(x))), f = Math.max(0, Math.min(1, x - i));
  return D.dt[i] * (1 - f) + D.dt[i + 1] * f;
}
export function taiMinusUtc(jdUTC) {            // 1972 öncesi 10 s kabul
  let off = 10;
  for (let i = 0; i < D.leap_jd.length; i++) if (jdUTC >= D.leap_jd[i]) off = D.leap_off[i];
  return off;
}
export const ttMinusUtc = (jdTT) => 32.184 + taiMinusUtc(jdTT - 69 / 86400);

// ---------------------------------------------------------------- IAU 2000A nütasyon (radyan)
export function nutation2000A(jdTT) {
  const t = (jdTT - 2451545.0) / 36525.0;
  const a = D.fa.map((c) => {                    // Delaunay argümanları
    let v = (((c[4] * t + c[3]) * t + c[2]) * t + c[1]) * t + c[0];
    v = v % TURNAS; return v * AS2R;
  });
  let dpsi = 0, deps = 0;
  const N = D.nals, L = D.lon, O = D.obl;
  for (let i = 0; i < N.length; i++) {
    const n = N[i], arg = n[0] * a[0] + n[1] * a[1] + n[2] * a[2] + n[3] * a[3] + n[4] * a[4];
    const s = Math.sin(arg), c = Math.cos(arg);
    dpsi += s * (L[i][0] + L[i][1] * t) + c * L[i][2];
    deps += c * (O[i][0] + O[i][1] * t) + s * O[i][2];
  }
  const ap = D.anom_c.map((c0, k) => t * D.anom_k[k] + c0); ap[13] *= t;   // gezegen argümanları
  const P = D.napl, PL = D.plon, PO = D.pobl;
  for (let i = 0; i < P.length; i++) {
    const n = P[i]; let arg = 0;
    for (let k = 0; k < 14; k++) if (n[k]) arg += n[k] * ap[k];
    const s = Math.sin(arg), c = Math.cos(arg);
    dpsi += s * PL[i][0] + c * PL[i][1]; deps += s * PO[i][0] + c * PO[i][1];
  }
  const k = AS2R * 1e-7;
  return [dpsi * k, deps * k];
}

// ---------------------------------------------------------------- IAU 2006 presesyon + nütasyon matrisi (GCRS -> gerçek ekvator/ekinoks)
const Rx = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; };
const Rz = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, s, 0], [-s, c, 0], [0, 0, 1]]; };
function mm(A, B) {
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  return C;
}
export function fwAngles(jdTT) {
  const t = (jdTT - 2451545.0) / 36525.0;
  const gamb = (-0.052928 + (10.556378 + (0.4932044 + (-0.00031238 + (-0.000002788 + 0.0000000260 * t) * t) * t) * t) * t) * AS2R;
  const phib = (84381.412819 + (-46.811016 + (0.0511268 + (0.00053289 + (-0.000000440 - 0.0000000176 * t) * t) * t) * t) * t) * AS2R;
  const psib = (-0.041775 + (5038.481484 + (1.5584175 + (-0.00018522 + (-0.000026452 - 0.0000000148 * t) * t) * t) * t) * t) * AS2R;
  const epsa = (84381.406 + (-46.836769 + (-0.0001831 + (0.00200340 + (-0.000000576 - 0.0000000434 * t) * t) * t) * t) * t) * AS2R;
  return { t, gamb, phib, psib, epsa };
}
// önbellek: aynı zaman için tekrar hesaplama yok (nütasyon serisi ~1400 terim)
let cache = { jd: NaN, v: null };
export function npb(jdTT) {
  if (Math.abs(jdTT - cache.jd) < 1e-9) return cache.v;
  const f = fwAngles(jdTT);
  let [dp, de] = nutation2000A(jdTT);
  const fj2 = -2.7774e-6 * f.t;                 // IAU 2006 J2 değişimi uyarlaması (ERFA nut06a)
  dp += dp * (0.4697e-6 + fj2); de += de * fj2;
  const R = mm(mm(mm(Rx(-(f.epsa + de)), Rz(-(f.psib + dp))), Rx(f.phib)), Rz(f.gamb));
  cache = { jd: jdTT, v: { R, dpsi: dp, deps: de, epsa: f.epsa, om: omegaMoonNode(f.t) } };
  return cache.v;
}
function omegaMoonNode(t) { return ((450160.398036 - 6962890.5431 * t) % TURNAS) * AS2R; }

export function era(jdUT1) {
  const d = jdUT1 - 2451545.0, f = (jdUT1 % 1.0);
  let th = D2PI * (f + 0.7790572732640 + 0.00273781191135448 * d);
  th %= D2PI; if (th < 0) th += D2PI; return th;
}
// Greenwich görünür yıldız zamanı (IAU 2006/2000A, ekinoks tabanlı)
export function gast(jdUT1, jdTT) {
  const t = (jdTT - 2451545.0) / 36525.0, n = npb(jdTT);
  const gmst = era(jdUT1) + (0.014506 + (4612.156534 + (1.3915817 + (-0.00000044 + (-0.000029956 - 0.0000000368 * t) * t) * t) * t) * t) * AS2R;
  const ee = n.dpsi * Math.cos(n.epsa) + (0.00264096 * Math.sin(n.om) + 0.00006352 * Math.sin(2 * n.om)) * AS2R;
  let g = (gmst + ee) % D2PI; if (g < 0) g += D2PI; return g;
}
// GCRS(≈ICRF) -> ITRS (kutup hareketi yok) ; jdTT
export function icrfToItrf(jdTT) {
  const jdUT1 = jdTT - deltaT(jdTT) / 86400;
  return mm(Rz(gast(jdUT1, jdTT)), npb(jdTT).R);
}
export const truePole = (jdTT) => npb(jdTT).R[2];     // tarihin gerçek kutbu (ICRF'de)

// ---------------------------------------------------------------- hızlı sürüm: 1/8 gün düğümlerinde hesaplanıp doğrusal ara değer
// (en kısa nütasyon terimleri ~5 gün, genlik < 0.1 mas: ara değer hatası µas düzeyinde)
const GRID = 0.125, nodes = new Map();
function node(k) {
  let v = nodes.get(k);
  if (!v) { const n = npb(k * GRID); v = { R: n.R.map((r) => r.slice()), dpsi: n.dpsi, epsa: n.epsa, om: n.om }; nodes.set(k, v); if (nodes.size > 4000) nodes.clear(); }
  return v;
}
export function npbFast(jdTT) {
  const x = jdTT / GRID, k = Math.floor(x), f = x - k, a = node(k), b = node(k + 1);
  const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i][j] = a.R[i][j] + (b.R[i][j] - a.R[i][j]) * f;
  return { R, dpsi: a.dpsi + (b.dpsi - a.dpsi) * f, epsa: a.epsa + (b.epsa - a.epsa) * f, om: a.om + (b.om - a.om) * f };
}
export function icrfToItrfFast(jdTT) {
  const jdUT1 = jdTT - deltaT(jdTT) / 86400, n = npbFast(jdTT), t = (jdTT - 2451545.0) / 36525.0;
  const gmst = era(jdUT1) + (0.014506 + (4612.156534 + (1.3915817 + (-0.00000044 + (-0.000029956 - 0.0000000368 * t) * t) * t) * t) * t) * AS2R;
  const g = gmst + n.dpsi * Math.cos(n.epsa) + (0.00264096 * Math.sin(n.om) + 0.00006352 * Math.sin(2 * n.om)) * AS2R;
  return mm(Rz(g), n.R);
}
export const truePoleFast = (jdTT) => npbFast(jdTT).R[2];
