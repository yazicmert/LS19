// Dairesel kısıtlı üç cisim problemi (Dünya–Ay CR3BP): halo yörünge aileleri.
// Birimler boyutsuz: uzunluk L (Dünya–Ay uzaklığı), zaman 1/n (Ay'ın ortalama açısal hızı), μ = M_Ay/(M_D+M_Ay).
// Dönen çerçeve: orijin kütle merkezi, x Dünya→Ay, z yörünge açısal momentumu.
//  - Richardson (1980) üçüncü derece yaklaşımı ile başlangıç
//  - y=0 düzlem geçişinde vx = vz = 0 simetri koşuluyla diferansiyel düzeltme (durum geçiş matrisiyle)
//  - aile boyunca süreklilik ve hedef üyeye (periyot ya da genlik) Newton ile oturtma
import * as E from './engine.js';

export const MU = E.MU_M / (E.MU_E + E.MU_M);
export const N_SID = 2 * Math.PI / (27.321661 * 86400);                     // Ay'ın yıldız ayı açısal hızı (rad/s)
export const L_CR = Math.cbrt((E.MU_E + E.MU_M) / (N_SID * N_SID));           // Kepler 3. yasası ile tutarlı uzunluk birimi (km)
export const T_CR = 1 / N_SID;                                                // zaman birimi (s)
export const SYNODIC_DAYS = 29.530589;

// ---------------------------------------------------------------- denklemler
function accel(s, mu) {
  const x = s[0], y = s[1], z = s[2], vx = s[3], vy = s[4];
  const dx1 = x + mu, dx2 = x - 1 + mu, yz = y * y + z * z;
  const r1 = Math.sqrt(dx1 * dx1 + yz), r2 = Math.sqrt(dx2 * dx2 + yz);
  const k1 = (1 - mu) / (r1 * r1 * r1), k2 = mu / (r2 * r2 * r2);
  return [2 * vy + x - k1 * dx1 - k2 * dx2, -2 * vx + y - k1 * y - k2 * y, -k1 * z - k2 * z];
}
// potansiyelin ikinci türevleri (simetrik 3x3)
function hessU(s, mu) {
  const x = s[0], y = s[1], z = s[2], dx1 = x + mu, dx2 = x - 1 + mu, yz = y * y + z * z;
  const r1s = dx1 * dx1 + yz, r2s = dx2 * dx2 + yz, r1 = Math.sqrt(r1s), r2 = Math.sqrt(r2s);
  const a = (1 - mu) / (r1s * r1), b = mu / (r2s * r2), a5 = 3 * (1 - mu) / (r1s * r1s * r1), b5 = 3 * mu / (r2s * r2s * r2);
  const Uxx = 1 - a - b + a5 * dx1 * dx1 + b5 * dx2 * dx2, Uyy = 1 - a - b + a5 * y * y + b5 * y * y, Uzz = -a - b + a5 * z * z + b5 * z * z;
  const Uxy = a5 * dx1 * y + b5 * dx2 * y, Uxz = a5 * dx1 * z + b5 * dx2 * z, Uyz = a5 * y * z + b5 * y * z;
  return [[Uxx, Uxy, Uxz], [Uxy, Uyy, Uyz], [Uxz, Uyz, Uzz]];
}
// durum (6) + isteğe bağlı STM (36, satır düzeninde) türevi
function deriv(t, Y, mu, stm) {
  const a = accel(Y, mu), d = new Float64Array(Y.length);
  d[0] = Y[3]; d[1] = Y[4]; d[2] = Y[5]; d[3] = a[0]; d[4] = a[1]; d[5] = a[2];
  if (stm) {
    const H = hessU(Y, mu);
    // A = [[0, I], [H, Ω]], Ω = [[0,2,0],[-2,0,0],[0,0,0]];  Φ' = A Φ
    for (let j = 0; j < 6; j++) {
      const p = (i) => Y[6 + i * 6 + j];
      d[6 + 0 * 6 + j] = p(3); d[6 + 1 * 6 + j] = p(4); d[6 + 2 * 6 + j] = p(5);
      for (let i = 0; i < 3; i++) d[6 + (3 + i) * 6 + j] = H[i][0] * p(0) + H[i][1] * p(1) + H[i][2] * p(2);
      d[6 + 3 * 6 + j] += 2 * p(4); d[6 + 4 * 6 + j] -= 2 * p(3);
    }
  }
  return d;
}

// ---------------------------------------------------------------- DOPRI5 (genel boyut)
const A = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];
function rkStep(t, Y, h, f) {
  const n = Y.length, K = [];
  for (let i = 0; i < 7; i++) {
    const Yi = new Float64Array(Y);
    for (let j = 0; j < i; j++) { const a = A[i][j]; if (a) { const kj = K[j]; for (let q = 0; q < n; q++) Yi[q] += h * a * kj[q]; } }
    K.push(f(t + C[i] * h, Yi));
  }
  const y5 = new Float64Array(Y); let err = 0;
  for (let q = 0; q < n; q++) {
    let s5 = 0, s4 = 0;
    for (let i = 0; i < 7; i++) { s5 += B5[i] * K[i][q]; s4 += B4[i] * K[i][q]; }
    y5[q] += h * s5;
    if (q < 6) { const sc = 1e-13 + 1e-12 * Math.max(Math.abs(Y[q]), Math.abs(y5[q])); err = Math.max(err, Math.abs(h * (s5 - s4)) / sc); }
  }
  return [y5, err];
}
// t0'dan tEnd'e (işaretli) ya da stop(t, Y, Yprev) doğru olana kadar
export function integrate(Y0, t0, tEnd, { mu = MU, stm = false, stop = null, hmax = 0.05, onStep = null } = {}) {
  const f = (t, Y) => deriv(t, Y, mu, stm);
  let Y = Y0, t = t0, h = Math.sign(tEnd - t0) * 1e-3;
  while ((tEnd - t) * Math.sign(h) > 1e-14) {
    if (Math.abs(h) > Math.abs(tEnd - t)) h = tEnd - t;
    const [Yn, err] = rkStep(t, Y, h, f);
    if (err > 1) { h *= Math.max(0.2, 0.9 * err ** -0.2); continue; }
    const tn = t + h;
    if (stop && stop(tn, Yn, Y, t)) return { t, Y, tn, Yn, stopped: true, f };
    t = tn; Y = Yn; if (onStep) onStep(t, Y);
    h = Math.sign(h) * Math.min(Math.abs(h) * Math.min(5, 0.9 * Math.max(err, 1e-10) ** -0.2), hmax);
  }
  return { t, Y, stopped: false, f };
}
const withStm = (X) => { const Y = new Float64Array(42); for (let i = 0; i < 6; i++) Y[i] = X[i]; for (let i = 0; i < 6; i++) Y[6 + i * 6 + i] = 1; return Y; };

// y = 0 düzleminin (tMin sonrası) ilk geçişi; Newton ile tam geçiş anına oturtulur
export function crossY(X0, { mu = MU, stm = true, tMin = 0.2, tMax = 12 } = {}) {
  const Y0 = stm ? withStm(X0) : Float64Array.from(X0);
  const res = integrate(Y0, 0, tMax, { mu, stm, stop: (tn, Yn, Y) => tn > tMin && Yn[1] * Y[1] <= 0 && Y[1] !== 0 });
  if (!res.stopped) return null;
  let t = res.t, Y = res.Y;
  for (let it = 0; it < 12; it++) {                     // y(t) = 0: h = -y/vy
    const h = -Y[1] / Y[4]; if (Math.abs(h) < 1e-15) break;
    [Y] = rkStep(t, Y, h, res.f); t += h;
  }
  return { t, Y };
}

// ---------------------------------------------------------------- Lagrange noktaları
export function gammaL(L, mu = MU) {
  let g = Math.cbrt(mu / 3);
  for (let i = 0; i < 50; i++) {
    const f = L === 1 ? g ** 5 - (3 - mu) * g ** 4 + (3 - 2 * mu) * g ** 3 - mu * g * g + 2 * mu * g - mu
                      : g ** 5 + (3 - mu) * g ** 4 + (3 - 2 * mu) * g ** 3 - mu * g * g - 2 * mu * g - mu;
    const df = L === 1 ? 5 * g ** 4 - 4 * (3 - mu) * g ** 3 + 3 * (3 - 2 * mu) * g * g - 2 * mu * g + 2 * mu
                       : 5 * g ** 4 + 4 * (3 - mu) * g ** 3 + 3 * (3 - 2 * mu) * g * g - 2 * mu * g - 2 * mu;
    const d = f / df; g -= d; if (Math.abs(d) < 1e-16) break;
  }
  return g;
}
export const xL = (L, mu = MU) => (L === 1 ? 1 - mu - gammaL(1, mu) : 1 - mu + gammaL(2, mu));

// ---------------------------------------------------------------- Richardson üçüncü derece
// Az_km: z genliği; south: güney ailesi. Döner: X0 (y=0 geçişinde), yaklaşık yarım periyot
export function richardson(L, Az_km, south, mu = MU) {
  const g = gammaL(L, mu), Az = Az_km / L_CR / g;
  const cn = (n) => (L === 1 ? (mu + (-1) ** n * (1 - mu) * g ** (n + 1) / (1 - g) ** (n + 1)) / g ** 3
                             : ((-1) ** n * mu + (-1) ** n * (1 - mu) * g ** (n + 1) / (1 + g) ** (n + 1)) / g ** 3);
  const c2 = cn(2), c3 = cn(3), c4 = cn(4);
  const lam = Math.sqrt((2 - c2 + Math.sqrt((c2 - 2) ** 2 + 4 * (c2 - 1) * (1 + 2 * c2))) / 2);
  const k = (lam * lam + 1 + 2 * c2) / (2 * lam), Dl = lam * lam - c2;
  const d1 = (3 * lam * lam / k) * (k * (6 * lam * lam - 1) - 2 * lam), d2 = (8 * lam * lam / k) * (k * (11 * lam * lam - 1) - 2 * lam);
  const a21 = 3 * c3 * (k * k - 2) / (4 * (1 + 2 * c2)), a22 = 3 * c3 / (4 * (1 + 2 * c2));
  const a23 = -3 * c3 * lam / (4 * k * d1) * (3 * k ** 3 * lam - 6 * k * (k - lam) + 4), a24 = -3 * c3 * lam / (4 * k * d1) * (2 + 3 * k * lam);
  const b21 = -3 * c3 * lam / (2 * d1) * (3 * k * lam - 4), b22 = 3 * c3 * lam / d1, d21 = -c3 / (2 * lam * lam);
  const a31 = -9 * lam / (4 * d2) * (4 * c3 * (k * a23 - b21) + k * c4 * (4 + k * k)) + (9 * lam * lam + 1 - c2) / (2 * d2) * (3 * c3 * (2 * a21 - k * b21) + c4 * (2 + 3 * k * k));
  const a32 = -1 / d2 * (9 * lam / 4 * (4 * c3 * (k * a24 - b22) + k * c4) + 1.5 * (9 * lam * lam + 1 - c2) * (c3 * (k * b22 + d21 - 2 * a22) - c4));
  const b31 = 3 / (8 * d2) * (8 * lam * (3 * c3 * (k * b21 - 2 * a21) - c4 * (2 + 3 * k * k)) + (9 * lam * lam + 1 + 2 * c2) * (4 * c3 * (k * a23 - b21) + k * c4 * (4 + k * k)));
  const b32 = 1 / d2 * (9 * lam * (c3 * (k * b22 + d21 - 2 * a22) - c4) + 3 / 8 * (9 * lam * lam + 1 + 2 * c2) * (4 * c3 * (k * a24 - b22) + k * c4));
  const d31 = 3 / (64 * lam * lam) * (4 * c3 * a24 + c4), d32 = 3 / (64 * lam * lam) * (4 * c3 * (a23 - d21) + c4 * (4 + k * k));
  const den = 2 * lam * (lam * (1 + k * k) - 2 * k);
  const s1 = (1.5 * c3 * (2 * a21 * (k * k - 2) - a23 * (k * k + 2) - 2 * k * b21) - 3 / 8 * c4 * (3 * k ** 4 - 8 * k * k + 8)) / den;
  const s2 = (1.5 * c3 * (2 * a22 * (k * k - 2) + a24 * (k * k + 2) + 2 * k * b22 + 5 * d21) + 3 / 8 * c4 * (12 - k * k)) / den;
  const l1 = -1.5 * c3 * (2 * a21 + a23 + 5 * d21) - 3 / 8 * c4 * (12 - k * k) + 2 * lam * lam * s1;
  const l2 = 1.5 * c3 * (a24 - 2 * a22) + 9 / 8 * c4 + 2 * lam * lam * s2;
  const Ax = Math.sqrt(Math.max(0, -(Dl + l2 * Az * Az) / l1));
  const nu = 1 + s1 * Ax * Ax + s2 * Az * Az, w = lam * nu;
  const dn = south ? -1 : 1;
  // τ = 0 (x ekseninden geçiş)
  const x = a21 * Ax * Ax + a22 * Az * Az - Ax + (a23 * Ax * Ax - a24 * Az * Az) + (a31 * Ax ** 3 - a32 * Ax * Az * Az);
  const z = dn * Az + dn * d21 * Ax * Az * (1 - 3) + dn * (d32 * Az * Ax * Ax - d31 * Az ** 3);
  const vy = w * (k * Ax + 2 * (b21 * Ax * Ax - b22 * Az * Az) + 3 * (b31 * Ax ** 3 - b32 * Ax * Az * Az));
  // Richardson çerçevesi: L1'de x Ay'dan uzağa değil Ay'a doğru ters işaretli (Szebehely/Richardson kuralı)
  const sgn = L === 1 ? -1 : 1;
  return { X0: [xL(L, mu) + sgn * g * x, 0, g * z, 0, sgn * g * vy, 0], halfT: Math.PI / w, Ax: Ax * g * L_CR, Az: Az * g * L_CR };
}

// ---------------------------------------------------------------- küçük doğrusal cebir
function solveN(A_, b) {
  const n = b.length, M = A_.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}

// ---------------------------------------------------------------- diferansiyel düzeltme
// Serbest değişkenler: x0, z0, vy0 (indeks 0, 2, 4). Kısıtlar: geçişte vx = vz = 0 (+ isteğe bağlı ek kısıt).
// extra: { fn(X0, cr) -> değer, grad(X0, cr, Phi, dYf) -> [d/dx0, d/dz0, d/dvy0] } ya da sabit tutulacak indeks (fix)
const FREE = [0, 2, 4];
function crossingPartials(cr, mu) {
  const Y = cr.Y, a = accel(Y, mu), P = (i, j) => Y[6 + i * 6 + j];
  // geçiş zamanı değişimini hesaba kat: d(·)_f = Φ δX − (ẏ-bileşeni) ...
  const rows = {};
  for (const i of [3, 5, 1]) rows[i] = FREE.map((j) => P(i, j));
  const dvx = FREE.map((j, c) => rows[3][c] - (a[0] / Y[4]) * rows[1][c]);
  const dvz = FREE.map((j, c) => rows[5][c] - (a[2] / Y[4]) * rows[1][c]);
  const dT = FREE.map((j, c) => -rows[1][c] / Y[4]);   // yarım periyodun değişimi
  return { dvx, dvz, dT };
}
export function correct(X0in, { mu = MU, fix = 2, target = null, tMin = 0.2, iters = 30, tol = 1e-11 } = {}) {
  let X0 = X0in.slice();
  for (let it = 0; it < iters; it++) {
    const cr = crossY(X0, { mu, tMin }); if (!cr) return null;
    const F = [cr.Y[3], cr.Y[5]], Pp = crossingPartials(cr, mu);
    const rows = [Pp.dvx, Pp.dvz];
    let third = null;
    if (target && target.kind === 'halfT') { F.push(cr.t - target.value); third = Pp.dT; }
    else { F.push(X0[fix] - (target && target.kind === 'fix' ? target.value : X0in[fix])); third = FREE.map((j) => (j === fix ? 1 : 0)); }
    rows.push(third);
    const err = Math.max(Math.abs(F[0]), Math.abs(F[1]), Math.abs(F[2]));
    if (err < tol) return { X0, halfT: cr.t, cross: Array.from(cr.Y.slice(0, 6)), iters: it };
    const d = solveN(rows, F.map((v) => -v));
    const sn = Math.hypot(...d), lim = 0.02; const s = sn > lim ? lim / sn : 1;
    FREE.forEach((j, c) => (X0[j] += s * d[c]));
  }
  return null;
}

// ---------------------------------------------------------------- aile boyunca süreklilik
// Başlangıç: düzeltilmiş üye; adım: sabit tutulan parametre (x0 ya da z0) boyunca, önceki iki üyeden doğrusal tahmin.
// hedef(m) işaret değiştirince (periyot, genlik vb.) secant ile tam üyeye oturtulur.
export function continueTo(start, { mu = MU, param = 2, dp = -0.002, metric, targetValue, maxSteps = 400, tMin = 0.2 } = {}) {
  let prev = null, cur = start, mCur = metric(cur);
  for (let step = 0; step < maxSteps; step++) {
    const guess = cur.X0.slice();
    if (prev) for (const j of FREE) guess[j] += (cur.X0[j] - prev.X0[j]) * (dp / (cur.X0[param] - prev.X0[param] || dp));
    guess[param] = cur.X0[param] + dp;
    let nxt = correct(guess, { mu, fix: param, target: { kind: 'fix', value: guess[param] }, tMin });
    if (!nxt) { dp /= 2; if (Math.abs(dp) < 1e-6) return null; continue; }
    const mN = metric(nxt);
    if ((mCur - targetValue) * (mN - targetValue) <= 0) {
      // secant: parametreyi hedef metriğe göre ara değerle, sonra yeniden düzelt
      let pa = cur.X0[param], ma = mCur, pb = nxt.X0[param], mb = mN, best = nxt;
      for (let k = 0; k < 30; k++) {
        const p = pb + (targetValue - mb) * (pb - pa) / (mb - ma || 1e-30);
        const g2 = best.X0.slice(); g2[param] = p;
        const sol = correct(g2, { mu, fix: param, target: { kind: 'fix', value: p }, tMin }); if (!sol) break;
        const m = metric(sol); best = sol;
        if (Math.abs(m - targetValue) < 1e-9 * Math.max(1, Math.abs(targetValue))) break;
        pa = pb; ma = mb; pb = p; mb = m;
      }
      return best;
    }
    prev = cur; cur = nxt; mCur = mN;
  }
  return null;
}

// ---------------------------------------------------------------- yörünge örnekleme ve özellikler
export function sampleOrbit(orb, n = 400, mu = MU) {
  const T = 2 * orb.halfT, pts = [];
  let last = -1;
  integrate(Float64Array.from(orb.X0), 0, T, { mu, hmax: T / n, onStep: (t, Y) => { if (t - last >= T / n * 0.999 || t >= T - 1e-12) { pts.push({ t, s: Array.from(Y.slice(0, 6)) }); last = t; } } });
  pts.unshift({ t: 0, s: orb.X0.slice() });
  return pts;
}
export function orbitStats(orb, mu = MU) {
  const pts = sampleOrbit(orb, 800, mu);
  let rp = Infinity, ra = 0, zmax = 0, tp = 0, ta = 0;
  for (const p of pts) {
    const d = Math.hypot(p.s[0] - 1 + mu, p.s[1], p.s[2]);
    if (d < rp) { rp = d; tp = p.t; } if (d > ra) { ra = d; ta = p.t; }
    zmax = Math.max(zmax, Math.abs(p.s[2]));
  }
  const Tdays = 2 * orb.halfT * T_CR / 86400;
  return { periodDays: Tdays, rpKm: rp * L_CR, raKm: ra * L_CR, AzKm: zmax * L_CR, tPeri: tp, tApo: ta, stability: null };
}
// Jacobi sabiti
export function jacobi(s, mu = MU) {
  const [x, y, z, vx, vy, vz] = s, r1 = Math.hypot(x + mu, y, z), r2 = Math.hypot(x - 1 + mu, y, z);
  return x * x + y * y + 2 * (1 - mu) / r1 + 2 * mu / r2 - (vx * vx + vy * vy + vz * vz);
}
