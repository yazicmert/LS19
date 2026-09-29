// Halo / NRHO yörüngelerinin gerçek efemeris modeline taşınması.
//  1) CR3BP ailesinden üye seçimi (cr3bp.js)
//  2) Dönen (anlık Dünya–Ay çizgisine bağlı, nabız atan) çerçeveden ICRF'ye dönüşüm
//  3) Dünya + Ay + Güneş (canlı efemeris) nokta kütle modelinde, sabit zamanlı çoklu atışla sürekli referans yörünge
// Birimler: km, s; durumlar Ay merkezli ICRF.
import * as E from './engine.js';
import * as C from './cr3bp.js';
const { add, sub, scale, dot, cross, norm, unit } = E;

// ---------------------------------------------------------------- aile üyeleri (önbellekli)
export const HALO_PRESETS = {
  NRHO92: { name: 'NRHO 9:2 (L2 güney, Gateway)', L: 2, south: true, by: 'period', value: C.SYNODIC_DAYS / 4.5 },
  L2S13: { name: 'L2 güney halo (Az ≈ 13.000 km)', L: 2, south: true, by: 'Az', value: 13000 },
  L1N10: { name: 'L1 kuzey halo (Az ≈ 10.000 km)', L: 1, south: false, by: 'Az', value: 10000 },
};
const cache = new Map();
const NRHO_GUESS = [1.0221, 0, -0.1821, 0, -0.1033, 0];              // L2 güney NRHO civarı (literatür)
export function haloMember(spec) {
  const key = JSON.stringify(spec);
  if (cache.has(key)) return cache.get(key);
  let orb = null;
  const mirror = (o) => ({ ...o, X0: [o.X0[0], 0, -o.X0[2], 0, o.X0[4], 0] });
  if (spec.by === 'period') {
    // NRHO bölgesi: literatür tahmininden, periyot kısıtıyla doğrudan Newton
    const halfT = spec.value * 86400 / C.T_CR / 2;
    const g = spec.L === 2 ? NRHO_GUESS : null;
    if (!g) throw new Error('Periyotla seçim şimdilik yalnız L2 NRHO için');
    orb = C.correct(g, { fix: 2, target: { kind: 'halfT', value: halfT } });
    if (orb && !spec.south) orb = mirror(orb);
  } else {
    // Az genliği: Richardson girişini secant ile ayarla (ölçülen en büyük |z| = hedef)
    let a = spec.value * 0.8, fa = null, b = spec.value, fb = null;
    const run = (Az) => { const R = C.richardson(spec.L, Az, spec.south), c = C.correct(R.X0, { fix: 2 }); return c ? { c, m: C.orbitStats(c).AzKm - spec.value } : null; };
    let ra = run(a), rb = run(b);
    for (let k = 0; ra && rb && k < 20; k++) {
      if (Math.abs(rb.m) < 1) break;
      const nx = b - rb.m * (b - a) / (rb.m - ra.m);
      a = b; ra = rb; b = nx; rb = run(b);
    }
    orb = rb && rb.c;
  }
  if (!orb) throw new Error('Halo yörüngesi bulunamadı');
  const st = C.orbitStats(orb);
  const res = { spec, X0: orb.X0, halfT: orb.halfT, T: 2 * orb.halfT, stats: st, stability: stabilityIndex(orb) };
  cache.set(key, res);
  return res;
}
// kararlılık indeksi: tek periyotluk monodromi matrisinin en büyük özdeğerinden ν = (|λ|+1/|λ|)/2
function stabilityIndex(orb) {
  const Y0 = new Float64Array(42); for (let i = 0; i < 6; i++) Y0[i] = orb.X0[i]; for (let i = 0; i < 6; i++) Y0[6 + i * 6 + i] = 1;
  const r = C.integrate(Y0, 0, 2 * orb.halfT, { stm: true });
  const M = []; for (let i = 0; i < 6; i++) M.push(Array.from(r.Y.slice(6 + i * 6, 12 + i * 6)));
  // kuvvet yöntemiyle baskın özdeğer
  let v = [1, 0.3, 0.2, 0.1, 0.05, 0.02], lam = 0;
  for (let k = 0; k < 200; k++) { const w = M.map((row) => row.reduce((s, x, j) => s + x * v[j], 0)); const n = Math.hypot(...w); lam = n; v = w.map((x) => x / n); }
  return 0.5 * (lam + 1 / lam);
}

// ---------------------------------------------------------------- dönen çerçeve <-> ICRF (Ay merkezli)
export function frameAt(t) {
  const rm = E.moonPos(t), vm = E.moonVel(t), l = norm(rm), h = cross(rm, vm);
  const x = scale(rm, 1 / l), z = unit(h), y = cross(z, x);
  return { rm, vm, l, ldot: dot(rm, vm) / l, w: norm(h) / (l * l), x, y, z };
}
// boyutsuz CR3BP durumu (kütle merkezine göre) -> Ay merkezli ICRF
export function toInertial(s, t, F = frameAt(t)) {
  const mu = C.MU;
  const rel = [s[0] - (1 - mu), s[1], s[2]];                       // Ay'a göre (boyutsuz)
  const p = add(add(scale(F.x, rel[0] * F.l), scale(F.y, rel[1] * F.l)), scale(F.z, rel[2] * F.l));
  const vr = add(add(scale(F.x, s[3]), scale(F.y, s[4])), scale(F.z, s[5]));
  const v = add(add(scale(p, F.ldot / F.l), scale(vr, F.l * F.w)), cross(scale(F.z, F.w), p));
  return [p, v];
}
export function toRotating(r, v, t, F = frameAt(t)) {
  const mu = C.MU;
  const pr = [dot(r, F.x), dot(r, F.y), dot(r, F.z)].map((c) => c / F.l);
  const vin = sub(sub(v, scale(r, F.ldot / F.l)), cross(scale(F.z, F.w), r));
  const vr = [dot(vin, F.x), dot(vin, F.y), dot(vin, F.z)].map((c) => c / (F.l * F.w));
  return [pr[0] + 1 - mu, pr[1], pr[2], vr[0], vr[1], vr[2]];
}

// ---------------------------------------------------------------- nokta kütle modeli (Ay merkezli) + varyasyon denklemleri
// Ay J2 + C22 (motorla aynı model; NRHO perilününde ~4e-8 km/s², günde ~10 km etkiler)
function moonHarmonics(t, r) {
  const M = E.moonIcrfToPa(t), [x, y, zz] = E.mv(M, r), rn2 = dot(r, r), rn = Math.sqrt(rn2);
  const Rr = E.R_M_REF * E.R_M_REF, r5 = rn2 * rn2 * rn, r7 = r5 * rn2;
  const kJ = (-1.5 * E.J2_M * E.MU_M * Rr) / r5, q = (5 * zz * zz) / rn2;
  const kC = 3 * E.MU_M * Rr * E.C22_M, w = x * x - y * y;
  return E.mtv(M, [kJ * x * (1 - q) + kC * (2 * x / r5 - 5 * w * x / r7), kJ * y * (1 - q) + kC * (-2 * y / r5 - 5 * w * y / r7), kJ * zz * (3 - q) + kC * (-5 * w * zz / r7)]);
}
function pmAccel(t, r, grad) {
  const rm = E.moonPos(t), rE = scale(rm, -1), rS = sub(E.sunPos(t), rm);
  const rn = norm(r), k0 = -E.MU_M / rn ** 3;
  let a = add(scale(r, k0), moonHarmonics(t, r));
  const G = grad ? [[0, 0, 0], [0, 0, 0], [0, 0, 0]] : null;
  const addGrad = (mu, d) => {             // -mu (I/d³ - 3 d dᵀ/d⁵), d: cisimden araca değil araçtan cisme yönü farketmez (karesel)
    const dn = norm(d), d3 = dn ** 3, d5 = d3 * dn * dn;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) G[i][j] += -mu * ((i === j ? 1 / d3 : 0) - 3 * d[i] * d[j] / d5);
  };
  if (grad) addGrad(E.MU_M, r);
  for (const [mu, rb] of [[E.MU_E, rE], [E.MU_S, rS]]) {
    const d = sub(rb, r), dn = norm(d), rbn = norm(rb);
    a = add(a, sub(scale(d, mu / dn ** 3), scale(rb, mu / rbn ** 3)));
    if (grad) addGrad(mu, d);
  }
  return [a, G];
}
function pmDeriv(t, Y, stm) {
  const r = [Y[0], Y[1], Y[2]], [a, G] = pmAccel(t, r, stm), d = new Float64Array(Y.length);
  d[0] = Y[3]; d[1] = Y[4]; d[2] = Y[5]; d[3] = a[0]; d[4] = a[1]; d[5] = a[2];
  if (stm) for (let j = 0; j < 6; j++) {
    for (let i = 0; i < 3; i++) d[6 + i * 6 + j] = Y[6 + (i + 3) * 6 + j];
    for (let i = 0; i < 3; i++) d[6 + (i + 3) * 6 + j] = G[i][0] * Y[6 + j] + G[i][1] * Y[12 + j] + G[i][2] * Y[18 + j];
  }
  return d;
}
const A = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
const Cc = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];
// Y (6 ya da 42) t0 -> t1
export function pmPropagate(Y0, t0, t1, stm = false, onStep = null) {
  let Y = Float64Array.from(Y0), t = t0, h = Math.sign(t1 - t0) * 60;
  const n = Y.length, f = (tt, YY) => pmDeriv(tt, YY, stm);
  while ((t1 - t) * Math.sign(h) > 1e-9) {
    if (Math.abs(h) > Math.abs(t1 - t)) h = t1 - t;
    const K = [];
    for (let i = 0; i < 7; i++) {
      const Yi = new Float64Array(Y);
      for (let j = 0; j < i; j++) { const a = A[i][j]; if (a) for (let q = 0; q < n; q++) Yi[q] += h * a * K[j][q]; }
      K.push(f(t + Cc[i] * h, Yi));
    }
    const y5 = new Float64Array(Y); let err = 0;
    for (let q = 0; q < n; q++) {
      let s5 = 0, s4 = 0; for (let i = 0; i < 7; i++) { s5 += B5[i] * K[i][q]; s4 += B4[i] * K[i][q]; }
      y5[q] += h * s5;
      if (q < 6) { const sc = (q < 3 ? 1e-6 : 1e-10) + 1e-12 * Math.max(Math.abs(Y[q]), Math.abs(y5[q])); err = Math.max(err, Math.abs(h * (s5 - s4)) / sc); }
    }
    if (err > 1) { h *= Math.max(0.2, 0.9 * err ** -0.2); continue; }
    t += h; Y = y5; if (onStep) onStep(t, Y);
    h = Math.sign(h) * Math.min(Math.abs(h) * Math.min(5, 0.9 * Math.max(err, 1e-10) ** -0.2), 6 * 3600);
  }
  return Y;
}

// ---------------------------------------------------------------- çoklu atış
function solveN(M_, b) {
  const n = b.length, M = M_.map((r, i) => { const a = new Float64Array(n + 1); a.set(r); a[n] = b[i]; return a; });
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    const tmp = M[c]; M[c] = M[p]; M[p] = tmp;
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}
// patches: [{t, X:[6]}]; döner: düzeltilmiş patches + en büyük süreksizlik
export function multipleShoot(patches, { iters = 25, tolPos = 1e-3, tolVel = 1e-8, log = null } = {}) {
  const K = patches.length - 1;
  let P = patches.map((p) => ({ t: p.t, X: p.X.slice() }));
  // ölçekleme: konum 1 km ~ hız 1 km / (ortalama yama aralığı); en küçük normlu düzeltme birimlerden bağımsız olsun
  const dtp = (P[K].t - P[0].t) / K, D = [1, 1, 1, 1 / dtp, 1 / dtp, 1 / dtp];
  const evalDefects = (P, withStm) => {
    const F = new Float64Array(6 * K), Phis = [];
    let dP = 0, dV = 0, sc = 0;
    for (let k = 0; k < K; k++) {
      const Y0 = new Float64Array(withStm ? 42 : 6); for (let i = 0; i < 6; i++) Y0[i] = P[k].X[i];
      if (withStm) for (let i = 0; i < 6; i++) Y0[6 + i * 6 + i] = 1;
      const Y = pmPropagate(Y0, P[k].t, P[k + 1].t, withStm);
      if (withStm) { const Phi = []; for (let i = 0; i < 6; i++) Phi.push(Array.from(Y.slice(6 + i * 6, 12 + i * 6), (x, j) => x * D[j] / D[i])); Phis.push(Phi); }   // D⁻¹ Φ D
      for (let i = 0; i < 6; i++) F[6 * k + i] = Y[i] - P[k + 1].X[i];
      dP = Math.max(dP, Math.hypot(F[6 * k], F[6 * k + 1], F[6 * k + 2])); dV = Math.max(dV, Math.hypot(F[6 * k + 3], F[6 * k + 4], F[6 * k + 5]));
      for (let i = 0; i < 6; i++) { F[6 * k + i] /= D[i]; sc += F[6 * k + i] ** 2; }
    }
    return { F, Phis, dP, dV, sc: Math.sqrt(sc) };
  };
  let cur = evalDefects(P, true);
  for (let it = 0; it < iters; it++) {
    if (log) log(`çoklu atış ${it}: konum süreksizliği ${cur.dP.toExponential(2)} km, hız ${(cur.dV * 1e3).toExponential(2)} m/s`);
    if (cur.dP < tolPos && cur.dV < tolVel) break;
    const { F, Phis } = cur;
    // J = blok çift köşegen [Φ_k (sütun k), -I (sütun k+1)]; en küçük normlu düzeltme δ = -Jᵀ (J Jᵀ)⁻¹ F
    const n = 6 * K, JJ = Array.from({ length: n }, () => new Float64Array(n));
    for (let k = 0; k < K; k++) {
      const Pk = Phis[k];
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
        let s = 0; for (let q = 0; q < 6; q++) s += Pk[i][q] * Pk[j][q];
        JJ[6 * k + i][6 * k + j] = s + (i === j ? 1 : 0);
      }
      if (k + 1 < K) {
        const Pn = Phis[k + 1];
        for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { JJ[6 * k + i][6 * (k + 1) + j] = -Pn[j][i]; JJ[6 * (k + 1) + j][6 * k + i] = -Pn[j][i]; }
      }
    }
    const y = solveN(JJ, F), dX = [];
    for (let k = 0; k <= K; k++) {
      const d = [0, 0, 0, 0, 0, 0];
      if (k < K) for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) d[j] += Phis[k][i][j] * y[6 * k + i];
      if (k > 0) for (let j = 0; j < 6; j++) d[j] -= y[6 * (k - 1) + j];
      dX.push(d.map((x, j) => x * D[j]));
    }
    // geri izleme: süreksizlik normu azalmıyorsa adımı küçült
    let lam = 1, next = null, Pn = null;
    for (let tries = 0; tries < 8; tries++) {
      Pn = P.map((p, k) => ({ t: p.t, X: p.X.map((x, j) => x - lam * dX[k][j]) }));
      next = evalDefects(Pn, false);
      if (next.sc < cur.sc || lam < 0.02) break;
      lam /= 2;
    }
    P = Pn; cur = evalDefects(P, true);
  }
  return { patches: P, maxDef: cur.dP, maxDefV: cur.dV };
}

// ---------------------------------------------------------------- tarihli halo referansı
// orb: haloMember; tDep: kalkış perilünü zamanı (ICRF, motor saniyesi); revsBefore: NRI perilününden kalkışa tur sayısı
export function ephemerisHalo(orb, tDep, revsBefore, { perRev = 12, before = 0.5, after = 0.35, log = null } = {}) {
  const Tnd = orb.T, tp = orb.stats.tPeri, Ts = Tnd * C.T_CR, mu = C.MU;
  const tauDep = tp + revsBefore * Tnd;                            // kalkış perilününün CR3BP zamanı (X0'dan)
  const tau0 = tp - before * Tnd, tau1 = tauDep + after * Tnd;
  // yama noktaları: Ay'a yakınken sık (Sundman benzeri: ds = dτ / d), NRHO perilününün duyarlılığı için
  const fine = []; C.integrate(Float64Array.from(orb.X0), 0, Tnd, { hmax: Tnd / 3000, onStep: (t, Y) => fine.push([t, Math.hypot(Y[0] - 1 + mu, Y[1], Y[2])]) });
  fine.unshift([0, Math.hypot(orb.X0[0] - 1 + mu, orb.X0[1], orb.X0[2])]);
  const S = [0]; for (let i = 1; i < fine.length; i++) S.push(S[i - 1] + (fine[i][0] - fine[i - 1][0]) * 2 / (fine[i][1] + fine[i - 1][1]));
  const ST = S[S.length - 1];
  const sOf = (tau) => { const k = Math.floor(tau / Tnd), r = tau - k * Tnd; let i = 1; while (i < fine.length - 1 && fine[i][0] < r) i++;
    const f = (r - fine[i - 1][0]) / (fine[i][0] - fine[i - 1][0] || 1); return k * ST + S[i - 1] + f * (S[i] - S[i - 1]); };
  const tauOf = (s) => { const k = Math.floor(s / ST), r = s - k * ST; let i = 1; while (i < S.length - 1 && S[i] < r) i++;
    const f = (r - S[i - 1]) / (S[i] - S[i - 1] || 1); return k * Tnd + fine[i - 1][0] + f * (fine[i][0] - fine[i - 1][0]); };
  const s0 = sOf(tau0), s1 = sOf(tau1), n = Math.ceil((s1 - s0) / ST * perRev);
  const taus = []; for (let k = 0; k <= n; k++) taus.push(tauOf(s0 + (s1 - s0) * k / n));
  const sAt = (tau) => { const tt = ((tau % Tnd) + Tnd) % Tnd; const r = C.integrate(Float64Array.from(orb.X0), 0, tt, {}); return Array.from(r.Y.slice(0, 6)); };
  const patches = taus.map((tau) => { const t = tDep + (tau - tauDep) * C.T_CR, [r, v] = toInertial(sAt(tau), t); return { t, X: [...r, ...v] }; });
  const ms = multipleShoot(patches, { log });
  const ref = new HaloRef(orb, ms.patches, tDep, tDep - revsBefore * Ts);
  ref.maxDef = ms.maxDef; ref.maxDefV = ms.maxDefV;
  return ref;
}

export class HaloRef {
  constructor(orb, patches, tDep, tNri) { this.orb = orb; this.patches = patches; this.tDep = tDep; this.tNri = tNri; this.cacheK = -1; }
  get t0() { return this.patches[0].t; }
  get t1() { return this.patches[this.patches.length - 1].t; }
  // referans durum (Ay merkezli ICRF): en yakın önceki yama noktasından nokta kütle modeliyle
  state(t) {
    const P = this.patches; let k = 0;
    while (k < P.length - 2 && P[k + 1].t <= t) k++;
    const Y = pmPropagate(P[k].X, P[k].t, t);
    return [[Y[0], Y[1], Y[2]], [Y[3], Y[4], Y[5]]];
  }
  // yoğun örnekleme (çizim ve arama için)
  sample(dt = 1800) {
    const out = [], P = this.patches;
    for (let k = 0; k < P.length - 1; k++) {
      out.push({ t: P[k].t, r: P[k].X.slice(0, 3), v: P[k].X.slice(3) });
      pmPropagate(P[k].X, P[k].t, P[k + 1].t, false, (t, Y) => { if (t - out[out.length - 1].t >= dt && P[k + 1].t - t > 1) out.push({ t, r: [Y[0], Y[1], Y[2]], v: [Y[3], Y[4], Y[5]] }); });
    }
    const L = P[P.length - 1]; out.push({ t: L.t, r: L.X.slice(0, 3), v: L.X.slice(3) });
    return out;
  }
  // [ta, tb] aralığında Ay'a en yakın an (perilün)
  perilune(ta, tb) {
    let best = null;
    for (let t = ta; t <= tb; t += 600) { const [r] = this.state(t), d = norm(r); if (!best || d < best.d) best = { t, d }; }
    let a = best.t - 600, b = best.t + 600;
    for (let k = 0; k < 40; k++) { const m1 = a + (b - a) * 0.382, m2 = a + (b - a) * 0.618; if (norm(this.state(m1)[0]) < norm(this.state(m2)[0])) b = m2; else a = m1; }
    const t = 0.5 * (a + b); return { t, r: norm(this.state(t)[0]) };
  }
}
