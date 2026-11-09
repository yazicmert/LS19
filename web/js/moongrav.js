// Ay'ın yüksek dereceli çekim alanı (GRAIL GRGM1200A, moongrav_data.js): küresel harmonik ivme, Ay PA çerçevesinde.
// Yöntem: Cunningham V/W özyinelemesi (Montenbruck & Gill, "Satellite Orbits", §3.2.4), tam normalleştirilmiş biçimde
//   (V̄nm = Nnm·Vnm, Nnm = √((2−δm0)(2n+1)(n−m)!/(n+m)!)); normalleştirme ~100. derecede faktöriyel taşmasını önler.
// Merkez terim (μ/r²) DAHİL DEĞİL: yalnız n ≥ 2 terimleri (J2, C22 ve üstü) döner — engine.js merkez çekimi ayrıca ekler.
// Derece uzaklıkla kısalır: (R/r)^n · 3,6e-4/n² (Kaula kuralı) ≤ TOL·(R/r)² olunca bırakılır; böylece Ay'dan uzakta (ör. 10 000 km)
// birkaç derece hesaplanır, alçak yörüngede (≤ 100 km) tam derece. Bırakılan terimin ivmesi ≤ ~1e-15 km/s² (sınır sıçraması önemsiz).
import { GRGM } from './moongrav_data.js';

const NMAX = GRGM.N, R = GRGM.R;

const TOL = 1e-12;
const idx = (n, m) => (n * (n + 1)) / 2 + m;
// özyineleme katsayıları (n ≤ NMAX + 1)
const L = NMAX + 2, A = new Float64Array(idx(L, L) + 1), B = new Float64Array(idx(L, L) + 1), D = new Float64Array(L + 1);
for (let n = 1; n <= L; n++) {
  D[n] = n === 1 ? Math.sqrt(3) : Math.sqrt((2 * n + 1) / (2 * n));
  for (let m = 0; m < n; m++) {
    const k = idx(n, m);
    A[k] = Math.sqrt(((2 * n + 1) * (2 * n - 1)) / ((n - m) * (n + m)));
    B[k] = n - m >= 2 ? Math.sqrt(((2 * n + 1) * (n + m - 1) * (n - m - 1)) / ((2 * n - 3) * (n + m) * (n - m))) : 0;
  }
}
// ivme çarpanları (normalleştirilmiş C̄nm·V̄n+1,* → bkz. başlık): F1 m+1, F2 m−1, F3 aynı m
const F1 = new Float64Array(idx(NMAX, NMAX) + 1), F2 = new Float64Array(idx(NMAX, NMAX) + 1), F3 = new Float64Array(idx(NMAX, NMAX) + 1);
for (let n = 0; n <= NMAX; n++) {
  const q = (2 * n + 1) / (2 * n + 3);
  for (let m = 0; m <= n; m++) {
    const k = idx(n, m);
    F1[k] = Math.sqrt(((m === 0 ? 1 : 2) / 2) * q * (n + m + 1) * (n + m + 2));
    F2[k] = m === 0 ? 0 : Math.sqrt((m === 1 ? 2 : 1) * q * (n - m + 1) * (n - m + 2));
    F3[k] = Math.sqrt(q * (n + m + 1) * (n - m + 1));
  }
}
const V = new Float64Array(idx(L, L) + 1), W = new Float64Array(idx(L, L) + 1);
// katsayılar çarpanlarla önceden birleştirilir (m > 0 için ½ dahil): döngü dallanmasız
const K = idx(NMAX, NMAX) + 1;
const A1 = new Float64Array(K), B1 = new Float64Array(K), A2 = new Float64Array(K), B2 = new Float64Array(K), A3 = new Float64Array(K), B3 = new Float64Array(K);
for (let n = 2; n <= NMAX; n++) {
  for (let m = 0; m <= n; m++) {
    const k = idx(n, m), c = GRGM.C[k], s = GRGM.S[k], h = m === 0 ? 1 : 0.5;
    A1[k] = h * F1[k] * c; B1[k] = h * F1[k] * s; A2[k] = h * F2[k] * c; B2[k] = h * F2[k] * s; A3[k] = F3[k] * c; B3[k] = F3[k] * s;
  }
}
// derece seçimi için log(3,6e-4/n²) − log(TOL)
const LK = new Float64Array(NMAX + 1);
for (let n = 1; n <= NMAX; n++) LK[n] = Math.log(3.6e-4 / (n * n)) - Math.log(TOL);

// bu uzaklıkta anlamlı derece (≥ 2)
export function degreeAt(r, nmax = NMAX) {
  const lq = Math.log(R / r);
  if (lq >= 0) return nmax;
  let n = 2;
  while (n < nmax && (n - 2) * lq + LK[n] > 0) n++;
  return n;
}

// p: Ay merkezli konum, PA çerçevesinde (km). mu: Ay GM (km³/s²). Sonuç PA çerçevesinde (km/s²), n ≥ 2 terimleri.
export function moonHarmonic(p, mu, nmax = NMAX) {
  const x = p[0], y = p[1], z = p[2], r2 = x * x + y * y + z * z, r = Math.sqrt(r2);
  const N = degreeAt(r, Math.min(nmax, NMAX)), M1 = N + 1;
  const x0 = (R * x) / r2, y0 = (R * y) / r2, z0 = (R * z) / r2, rho = (R * R) / r2;
  V[0] = R / r; W[0] = 0;
  for (let m = 0; m <= M1; m++) {                       // sütun m: köşegen, sonra n = m+1..N+1
    let k = idx(m, m);
    if (m > 0) {
      const kp = k - m - 1;                               // idx(m−1, m−1) = idx(m, m) − m − 1
      V[k] = D[m] * (x0 * V[kp] - y0 * W[kp]);
      W[k] = D[m] * (x0 * W[kp] + y0 * V[kp]);
    }
    let k1 = k, k2 = -1;
    for (let n = m + 1; n <= M1; n++) {
      k += n;                                             // idx(n, m) = idx(n−1, m) + n
      let v = A[k] * z0 * V[k1], w = A[k] * z0 * W[k1];
      if (k2 >= 0) { const br = B[k] * rho; v -= br * V[k2]; w -= br * W[k2]; }
      V[k] = v; W[k] = w; k2 = k1; k1 = k;
    }
  }
  let ax = 0, ay = 0, az = 0;
  for (let n = 2; n <= N; n++) {
    const kn = idx(n, 0), kn1 = kn + n + 1;              // idx(n, 0), idx(n+1, 0)
    for (let m = 0; m <= n; m++) {
      const k = kn + m, k0 = kn1 + m, kp = k0 + 1, km = m > 0 ? k0 - 1 : 0;
      const vp = V[kp], wp = W[kp], vm = V[km], wm = W[km], a1 = A1[k], b1 = B1[k], a2 = A2[k], b2 = B2[k];
      ax += -a1 * vp - b1 * wp + a2 * vm + b2 * wm;
      ay += -a1 * wp + b1 * vp - a2 * wm + b2 * vm;
      az -= A3[k] * V[k0] + B3[k] * W[k0];
    }
  }
  const g = mu / (R * R);
  return [g * ax, g * ay, g * az];
}

// Bağımsız denetim için potansiyel (n ≥ 2), aynı V̄/W̄ özyinelemesiyle: U = μ/R Σ C̄V̄ + S̄W̄
export function moonHarmonicPotential(p, mu, N = NMAX) {
  const [x, y, z] = p, r2 = x * x + y * y + z * z, r = Math.sqrt(r2);
  N = Math.min(N, NMAX);
  const x0 = (R * x) / r2, y0 = (R * y) / r2, z0 = (R * z) / r2, rho = (R * R) / r2;
  const v = new Float64Array(idx(N, N) + 1), w = new Float64Array(idx(N, N) + 1);
  v[0] = R / r;
  for (let m = 0; m <= N; m++) {
    const km = idx(m, m);
    if (m > 0) { const kp = idx(m - 1, m - 1); v[km] = D[m] * (x0 * v[kp] - y0 * w[kp]); w[km] = D[m] * (x0 * w[kp] + y0 * v[kp]); }
    for (let n = m + 1; n <= N; n++) {
      const k = idx(n, m), k1 = idx(n - 1, m);
      v[k] = A[k] * z0 * v[k1]; w[k] = A[k] * z0 * w[k1];
      if (n - m >= 2) { const k2 = idx(n - 2, m); v[k] -= B[k] * rho * v[k2]; w[k] -= B[k] * rho * w[k2]; }
    }
  }
  let u = 0;
  for (let n = 2; n <= N; n++) for (let m = 0; m <= n; m++) { const k = idx(n, m); u += GRGM.C[k] * v[k] + GRGM.S[k] * w[k]; }
  return (mu / R) * u;
}
