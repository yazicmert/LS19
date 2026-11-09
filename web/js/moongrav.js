// Ay'ın yüksek dereceli çekim alanı (GRAIL GRGM1200A, moongrav_data.js): küresel harmonik ivme, Ay PA çerçevesinde.
// Yöntem: Cunningham V/W özyinelemesi (Montenbruck & Gill, "Satellite Orbits", §3.2.4), tam normalleştirilmiş biçimde
//   (V̄nm = Nnm·Vnm, Nnm = √((2−δm0)(2n+1)(n−m)!/(n+m)!)); normalleştirme ~100. derecede faktöriyel taşmasını önler.
// Merkez terim (μ/r²) DAHİL DEĞİL: yalnız n ≥ 2 terimleri (J2, C22 ve üstü) döner — engine.js merkez çekimi ayrıca ekler.
// Derece uzaklıkla kısalır: n. derecenin merkez çekime göre payı ~(R/r)^(n−2) · 3,6e-4/n² (Kaula kuralı) 1e-9'un altına inince bırakılır;
// böylece Ay'dan uzakta (ör. 5000 km'de 10, 20 000 km'de ~5 derece) birkaç derece hesaplanır, alçak yörüngede (100 km) tam derece.
// Bırakılan terimin ivmesi merkez çekimin ~1e-9'u (LLO'da ~1e-9 m/s²; sınır sıçraması önemsiz).
import { GRGM } from './moongrav_data.js';

const NMAX = GRGM.N, R = GRGM.R;

const TOL = 1e-9;
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

// ------------------------------------------------------------------ alçak irtifa: ızgaradan aradeğerleme
// İnişte ve yakışlarda adımlar 0,05–0,1 s ve her adımda tam derece pahalıdır. r < R_GRID içinde (fine: kısa adımda r < R_FINE) ivme (r, enlem, boylam) ızgarasının düğümlerinden
// üç doğrusal aradeğerlenir; düğümler gerektikçe hesaplanır ve saklanır (değerleri çağrı sırasından bağımsız: sonuç belirlenimci).
// Aralık 1 km ve 0,1° (~3 km): 60. derecede en kısa dalga boyu ~180 km, aradeğerleme hatası alanın ~%0,1'i (yüzeyde ≤ ~0,003 mm/s²),
// 60. derecenin kendi kesme hatasının (~0,4 mm/s², bkz. engine.js OPTS) çok altında.
const R_LO = 1700.0, R_GRID = 1737.4 + 30.0, R_FINE = 1737.4 + 200.0, H_R = 1.0, H_A = 0.1, NLAT = 1800, NLON = 3600, D2R = Math.PI / 180;
const NODES = new Map(), NODE_MAX = 400000;
let nodeDeg = -1;
function node(ir, ila, ilo, nmax) {
  const key = (ir * (NLAT + 1) + ila) * NLON + ilo;
  let a = NODES.get(key);
  if (a) return a;
  if (NODES.size >= NODE_MAX) NODES.clear();
  const r = R_LO + ir * H_R, la = (ila * H_A - 90) * D2R, lo = ilo * H_A * D2R, c = Math.cos(la);
  a = moonHarmonic([r * c * Math.cos(lo), r * c * Math.sin(lo), r * Math.sin(la)], 1.0, nmax);
  NODES.set(key, a);
  return a;
}
// moonHarmonic ile aynı arayüz; r < R_GRID ise ızgaradan. Dış seri Ay'ın içinde (r < R) ıraksar: R_LO'nun (Ay'ın en alçak noktasından ~29 km
// aşağısı) altında yalnız 2. derece, R_LO küresine izdüşürülmüş noktada (sınırlı ve ucuz; buraya yalnız Ay'ın içinden geçen deneme
// yörüngeleri — ör. tasarım aramaları — düşer, gerçek uçuş daha önce yüzeye değer).
// fine: çağıran kısa adımla ilerliyor (yakış): 200 km'ye dek ızgara. Büyük adımlı süzülmede her çağrı yeni düğümler isteyeceğinden doğrudan toplam daha ucuzdur.
export function moonGravity(p, mu, nmax = NMAX, fine = false) {
  const x = p[0], y = p[1], z = p[2], rxy = Math.hypot(x, y), r = Math.hypot(rxy, z);
  if (r >= (fine ? R_FINE : R_GRID)) return moonHarmonic(p, mu, nmax);
  if (r <= R_LO) { if (r === 0) return [0, 0, 0]; const k = R_LO / r; return moonHarmonic([k * x, k * y, k * z], mu, 2); }
  if (nmax !== nodeDeg) { NODES.clear(); nodeDeg = nmax; }
  const fr = (r - R_LO) / H_R, fa = (Math.atan2(z, rxy) / D2R + 90) / H_A;
  let fo = Math.atan2(y, x) / D2R / H_A; if (fo < 0) fo += NLON;
  const ir = Math.floor(fr), ia = Math.min(Math.floor(fa), NLAT - 1), io = Math.floor(fo) % NLON, io1 = (io + 1) % NLON;
  const wr = fr - ir, wa = fa - ia, wo = fo - Math.floor(fo);
  const out = [0, 0, 0];
  for (let dr = 0; dr < 2; dr++) for (let da = 0; da < 2; da++) for (let dl = 0; dl < 2; dl++) {
    const w = (dr ? wr : 1 - wr) * (da ? wa : 1 - wa) * (dl ? wo : 1 - wo);
    if (w === 0) continue;
    const a = node(ir + dr, ia + da, dl ? io1 : io, nmax);
    out[0] += w * a[0]; out[1] += w * a[1]; out[2] += w * a[2];
  }
  return [mu * out[0], mu * out[1], mu * out[2]];
}
