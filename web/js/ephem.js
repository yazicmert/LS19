// Canlı efemeris: Güneş, gezegenler, Dünya ve Ay'ın kütle çekimiyle birlikte entegrasyonu + Ay dönüş dinamiği.
// Başlangıç durumu JPL DE440'tan (SPK + Ay PA PCK) alınır; sonrası tamamen bu kodun fiziğidir.
//  - Newton N-cisim (11 gövde, DE440 GM değerleri), Güneş'in Schwarzschild (1PN) düzeltmesi
//  - Dünya J2 (IAU 2006/2000A gerçek kutbu) <-> Ay noktasal kütle, karşılıklı (tepki kuvveti dahil)
//  - Ay J2/C22 (PA çerçevesi, entegre edilen yönelimle) <-> Dünya noktasal kütle, karşılıklı
//  - Ay dönüşü: Euler denklemleri I·ω̇ = N − ω×Iω; N: Dünya ve Güneş'in Ay'ın eylemsizlik tensörüne torku (MacCullagh)
// Dünya ile Ay, ortak kütle merkezleri etrafında bu kuvvetlerle döner; Dünya'nın barisentrik salınımı kendiliğinden çıkar.
import * as EO from './earth.js';

export const BODIES = [
  { id: 10, name: 'Güneş', gm: 132712440041.279419 }, { id: 1, name: 'Merkür', gm: 22031.868551 },
  { id: 2, name: 'Venüs', gm: 324858.592 }, { id: 399, name: 'Dünya', gm: 398600.435507 },
  { id: 301, name: 'Ay', gm: 4902.800118 }, { id: 4, name: 'Mars', gm: 42828.375816 },
  { id: 5, name: 'Jüpiter', gm: 126712764.1 }, { id: 6, name: 'Satürn', gm: 37940584.8418 },
  { id: 7, name: 'Uranüs', gm: 5794556.4 }, { id: 8, name: 'Neptün', gm: 6836527.10058 }, { id: 9, name: 'Plüton', gm: 975.5 }];
export const IS = 0, IE = 3, IM = 4;
const NB = BODIES.length, GM = BODIES.map((b) => b.gm), C2 = 299792.458 ** 2;
const R_E = 6378.1363, J2_E = 1.0826267e-3;
const R_MREF = 1738.0, J2_M = 2.03213e-4, C22_M = 2.2382e-5;
// Ay eylemsizlik momentleri (M R² birimi, R = 1738 km): C/MR² = 0.393112 (LLR/GRAIL); farklar J2, C22'den
export const MOON_I = (() => { const C = 0.393112, A = C - J2_M - 2 * C22_M, B = A + 4 * C22_M; return [A, B, C]; })();
const NY = NB * 6 + 7, OQ = NB * 6, OW = NB * 6 + 4;
export const J2000_JD = 2451545.0;

// ---------------------------------------------------------------- küçük yardımcılar
const qRot = (q, v) => {                       // gövde -> ICRF (q = [w,x,y,z])
  const [w, x, y, z] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
};
const qRotT = (q, v) => qRot([q[0], -q[1], -q[2], -q[3]], v);   // ICRF -> gövde
export function qToMat(q) {                   // gövde -> ICRF matrisi (satırlar)
  const [w, x, y, z] = q;
  return [[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
          [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
          [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]];
}
function matToQ(M) {                           // gövde -> ICRF matrisinden birim kuaterniyon
  const tr = M[0][0] + M[1][1] + M[2][2]; let w, x, y, z;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; x = (M[2][1] - M[1][2]) / s; y = (M[0][2] - M[2][0]) / s; z = (M[1][0] - M[0][1]) / s; }
  else if (M[0][0] > M[1][1] && M[0][0] > M[2][2]) { const s = Math.sqrt(1 + M[0][0] - M[1][1] - M[2][2]) * 2; w = (M[2][1] - M[1][2]) / s; x = s / 4; y = (M[0][1] + M[1][0]) / s; z = (M[0][2] + M[2][0]) / s; }
  else if (M[1][1] > M[2][2]) { const s = Math.sqrt(1 + M[1][1] - M[0][0] - M[2][2]) * 2; w = (M[0][2] - M[2][0]) / s; x = (M[0][1] + M[1][0]) / s; y = s / 4; z = (M[1][2] + M[2][1]) / s; }
  else { const s = Math.sqrt(1 + M[2][2] - M[0][0] - M[1][1]) * 2; w = (M[1][0] - M[0][1]) / s; x = (M[0][2] + M[2][0]) / s; y = (M[1][2] + M[2][1]) / s; z = s / 4; }
  return [w, x, y, z];
}
const R1 = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; };
const R3 = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, s, 0], [-s, c, 0], [0, 0, 1]]; };
const mm = (A, B) => A.map((r, i) => [0, 1, 2].map((j) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]));
const mT = (A) => [[A[0][0], A[1][0], A[2][0]], [A[0][1], A[1][1], A[2][1]], [A[0][2], A[1][2], A[2][2]]];

// Ay figür potansiyelinin (J2, C22) PA çerçevesinde yarattığı ivme (test parçacığı, μ = GM_Ay)
function moonFigureAcc(x, y, z) {
  const r2 = x * x + y * y + z * z, rn = Math.sqrt(r2), r5 = r2 * r2 * rn, r7 = r5 * r2, Rr = R_MREF * R_MREF, mu = GM[IM];
  const kJ = (-1.5 * J2_M * mu * Rr) / r5, q = (5 * z * z) / r2, kC = 3 * mu * Rr * C22_M, w = x * x - y * y;
  return [kJ * x * (1 - q) + kC * (2 * x / r5 - 5 * w * x / r7), kJ * y * (1 - q) + kC * (-2 * y / r5 - 5 * w * y / r7), kJ * z * (3 - q) + kC * (-5 * w * z / r7)];
}

export class LiveEphemeris {
  // spk, pck: jplkernel nesneleri; et0: başlangıç anı (TDB s, J2000'den)
  constructor(spk, pck, et0, opts = {}) {
    this.spk = spk; this.pck = pck; this.et0 = et0;
    this.rtol = opts.rtol ?? 1e-13;
    const y = new Float64Array(NY);
    BODIES.forEach((b, i) => { const [p, v] = spk.ssb(b.id, et0); for (let k = 0; k < 3; k++) { y[i * 3 + k] = p[k]; y[NB * 3 + i * 3 + k] = v[k]; } });
    const [[phi, th, psi], [dphi, dth, dpsi]] = pck.angles(et0);
    const Mip = mm(mm(R3(psi), R1(th)), R3(phi));                      // ICRF -> PA
    const q = matToQ(mT(Mip));
    const w = [dphi * Math.sin(th) * Math.sin(psi) + dth * Math.cos(psi), dphi * Math.sin(th) * Math.cos(psi) - dth * Math.sin(psi), dphi * Math.cos(th) + dpsi];
    y.set(q, OQ); y.set(w, OW);
    const f0 = this.deriv(et0, y);
    this.fwd = [{ t: et0, y, f: f0 }]; this.bwd = [{ t: et0, y, f: f0 }];
    this.h = { fwd: 3600, bwd: -3600 };
    this.last = { i: 0, list: this.fwd };
    this.steps = 0;
  }

  // ---------------------------------------------------------------- hareket denklemleri
  deriv(et, y) {
    const f = new Float64Array(NY);
    const P = (i, k) => y[i * 3 + k], V = (i, k) => y[NB * 3 + i * 3 + k];
    const acc = new Float64Array(NB * 3);
    for (let i = 0; i < NB; i++) for (let j = i + 1; j < NB; j++) {
      const dx = P(j, 0) - P(i, 0), dy = P(j, 1) - P(i, 1), dz = P(j, 2) - P(i, 2);
      const r2 = dx * dx + dy * dy + dz * dz, ir3 = 1 / (r2 * Math.sqrt(r2));
      acc[i * 3] += GM[j] * dx * ir3; acc[i * 3 + 1] += GM[j] * dy * ir3; acc[i * 3 + 2] += GM[j] * dz * ir3;
      acc[j * 3] -= GM[i] * dx * ir3; acc[j * 3 + 1] -= GM[i] * dy * ir3; acc[j * 3 + 2] -= GM[i] * dz * ir3;
    }
    // Güneş'in 1PN (Schwarzschild) düzeltmesi
    for (let i = 1; i < NB; i++) {
      const rx = P(i, 0) - P(IS, 0), ry = P(i, 1) - P(IS, 1), rz = P(i, 2) - P(IS, 2), vx = V(i, 0) - V(IS, 0), vy = V(i, 1) - V(IS, 1), vz = V(i, 2) - V(IS, 2);
      const r = Math.hypot(rx, ry, rz), v2 = vx * vx + vy * vy + vz * vz, rv = rx * vx + ry * vy + rz * vz, k = GM[IS] / (C2 * r * r * r), a = 4 * GM[IS] / r - v2;
      acc[i * 3] += k * (a * rx + 4 * rv * vx); acc[i * 3 + 1] += k * (a * ry + 4 * rv * vy); acc[i * 3 + 2] += k * (a * rz + 4 * rv * vz);
    }
    // Dünya J2 <-> Ay
    const jdTT = J2000_JD + et / 86400;
    const pole = EO.earthOrientationLoaded() ? EO.truePoleFast(jdTT) : [0, 0, 1];
    {
      const rx = P(IM, 0) - P(IE, 0), ry = P(IM, 1) - P(IE, 1), rz = P(IM, 2) - P(IE, 2), r2 = rx * rx + ry * ry + rz * rz, rn = Math.sqrt(r2);
      const z = rx * pole[0] + ry * pole[1] + rz * pole[2], k = (1.5 * J2_E * GM[IE] * R_E * R_E) / (r2 * r2 * rn), g = 5 * z * z / r2 - 1;
      const ax = k * (g * rx - 2 * z * pole[0]), ay = k * (g * ry - 2 * z * pole[1]), az = k * (g * rz - 2 * z * pole[2]), s = GM[IM] / GM[IE];
      acc[IM * 3] += ax; acc[IM * 3 + 1] += ay; acc[IM * 3 + 2] += az;
      acc[IE * 3] -= s * ax; acc[IE * 3 + 1] -= s * ay; acc[IE * 3 + 2] -= s * az;
    }
    // Ay J2/C22 <-> Dünya, ve Ay'a tork (Dünya + Güneş)
    const q = [y[OQ], y[OQ + 1], y[OQ + 2], y[OQ + 3]], w = [y[OW], y[OW + 1], y[OW + 2]], I = MOON_I;
    const N = [0, 0, 0];
    for (const j of [IE, IS]) {
      const s = qRotT(q, [P(j, 0) - P(IM, 0), P(j, 1) - P(IM, 1), P(j, 2) - P(IM, 2)]);   // PA çerçevesinde
      const r2 = s[0] * s[0] + s[1] * s[1] + s[2] * s[2], k = 3 * GM[j] / (r2 * r2 * Math.sqrt(r2));
      const Is = [I[0] * s[0], I[1] * s[1], I[2] * s[2]];
      N[0] += k * (s[1] * Is[2] - s[2] * Is[1]); N[1] += k * (s[2] * Is[0] - s[0] * Is[2]); N[2] += k * (s[0] * Is[1] - s[1] * Is[0]);
      if (j === IE) {
        const ab = moonFigureAcc(s[0], s[1], s[2]), a = qRot(q, ab), m = GM[IE] / GM[IM];
        acc[IE * 3] += a[0]; acc[IE * 3 + 1] += a[1]; acc[IE * 3 + 2] += a[2];
        acc[IM * 3] -= m * a[0]; acc[IM * 3 + 1] -= m * a[1]; acc[IM * 3 + 2] -= m * a[2];
      }
    }
    const Iw = [I[0] * w[0], I[1] * w[1], I[2] * w[2]];
    const wxIw = [w[1] * Iw[2] - w[2] * Iw[1], w[2] * Iw[0] - w[0] * Iw[2], w[0] * Iw[1] - w[1] * Iw[0]];
    for (let k = 0; k < 3; k++) f[OW + k] = (N[k] - wxIw[k]) / I[k];
    // q̇ = ½ q ⊗ (0, ω)
    f[OQ] = -0.5 * (q[1] * w[0] + q[2] * w[1] + q[3] * w[2]);
    f[OQ + 1] = 0.5 * (q[0] * w[0] + q[2] * w[2] - q[3] * w[1]);
    f[OQ + 2] = 0.5 * (q[0] * w[1] + q[3] * w[0] - q[1] * w[2]);
    f[OQ + 3] = 0.5 * (q[0] * w[2] + q[1] * w[1] - q[2] * w[0]);
    for (let i = 0; i < NB * 3; i++) { f[i] = y[NB * 3 + i]; f[NB * 3 + i] = acc[i]; }
    return f;
  }

  // ---------------------------------------------------------------- DOPRI5 adımı (FSAL)
  step(node, h) {
    const A = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
      [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
    const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
    const E = [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40];   // B5 - B4
    for (;;) {
      const k = [node.f], y = node.y;
      let y5 = null;
      for (let s = 1; s < 7; s++) {
        const ys = new Float64Array(NY);
        for (let i = 0; i < NY; i++) { let acc = 0; for (let j = 0; j < s; j++) if (A[s][j]) acc += A[s][j] * k[j][i]; ys[i] = y[i] + h * acc; }
        if (s === 6) y5 = ys;
        k.push(this.deriv(node.t + C[s] * h, ys));
      }
      let err = 0;
      for (let i = 0; i < NY; i++) {
        let e = 0; for (let j = 0; j < 7; j++) if (E[j]) e += E[j] * k[j][i];
        e = Math.abs(h * e);
        const sc = i < NB * 6 ? (i < NB * 3 ? 1e-6 : 1e-12) : (i < OW ? 1e-15 : 1e-19);
        err = Math.max(err, e / (sc + this.rtol * Math.max(Math.abs(y[i]), Math.abs(y5[i]))));
      }
      const fac = Math.min(4, Math.max(0.2, 0.9 * err ** -0.2));
      if (err <= 1) {
        const qn = Math.hypot(y5[OQ], y5[OQ + 1], y5[OQ + 2], y5[OQ + 3]); for (let i = 0; i < 4; i++) y5[OQ + i] /= qn;
        this.steps++;
        return { node: { t: node.t + h, y: y5, f: k[6] }, hNext: Math.sign(h) * Math.min(Math.abs(h * fac), 86400) };
      }
      h *= fac;
    }
  }

  ensure(et) {
    if (et >= this.et0) {
      const L = this.fwd; while (L[L.length - 1].t < et) { const r = this.step(L[L.length - 1], this.h.fwd); L.push(r.node); this.h.fwd = r.hNext; }
    } else {
      const L = this.bwd; while (L[L.length - 1].t > et) { const r = this.step(L[L.length - 1], this.h.bwd); L.push(r.node); this.h.bwd = r.hNext; }
    }
  }

  // ---------------------------------------------------------------- yoğun çıktı (beşinci derece Hermite)
  interval(et) {
    this.ensure(et);
    const L = et >= this.et0 ? this.fwd : this.bwd, dir = et >= this.et0 ? 1 : -1;
    let i = this.last.list === L ? this.last.i : 0;
    const within = (k) => (dir > 0 ? L[k].t <= et && et <= L[k + 1].t : L[k].t >= et && et >= L[k + 1].t);
    if (i >= L.length - 1 || !within(i)) {
      let lo = 0, hi = L.length - 2;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (dir > 0 ? L[mid + 1].t < et : L[mid + 1].t > et) lo = mid + 1; else hi = mid; }
      i = lo;
    }
    this.last = { i, list: L };
    return [L[i], L[Math.min(i + 1, L.length - 1)]];
  }

  // gövde i'nin SSB konumu/hızı
  body(i, et) {
    const [a, b] = this.interval(et);
    const h = b.t - a.t;
    if (h === 0) return [[a.y[i * 3], a.y[i * 3 + 1], a.y[i * 3 + 2]], [a.y[NB * 3 + i * 3], a.y[NB * 3 + i * 3 + 1], a.y[NB * 3 + i * 3 + 2]]];
    const s = (et - a.t) / h, s2 = s * s, s3 = s2 * s, s4 = s3 * s, s5 = s4 * s;
    const H0 = 1 - 10 * s3 + 15 * s4 - 6 * s5, H1 = s - 6 * s3 + 8 * s4 - 3 * s5, H2 = 0.5 * s2 - 1.5 * s3 + 1.5 * s4 - 0.5 * s5;
    const H3 = 10 * s3 - 15 * s4 + 6 * s5, H4 = -4 * s3 + 7 * s4 - 3 * s5, H5 = 0.5 * s3 - s4 + 0.5 * s5;
    const d0 = (-30 * s2 + 60 * s3 - 30 * s4) / h, d1 = 1 - 18 * s2 + 32 * s3 - 15 * s4, d2 = (s - 4.5 * s2 + 6 * s3 - 2.5 * s4) * h;
    const d3 = (30 * s2 - 60 * s3 + 30 * s4) / h, d4 = -12 * s2 + 28 * s3 - 15 * s4, d5 = (1.5 * s2 - 4 * s3 + 2.5 * s4) * h;
    const p = [0, 0, 0], v = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const ip = i * 3 + k, iv = NB * 3 + i * 3 + k;
      const p0 = a.y[ip], v0 = a.y[iv], a0 = a.f[iv], p1 = b.y[ip], v1 = b.y[iv], a1 = b.f[iv];
      p[k] = H0 * p0 + H1 * h * v0 + H2 * h * h * a0 + H3 * p1 + H4 * h * v1 + H5 * h * h * a1;
      v[k] = d0 * p0 + d1 * v0 + d2 * a0 + d3 * p1 + d4 * v1 + d5 * a1;
    }
    return [p, v];
  }
  // Ay yönelimi: PA -> ICRF kuaterniyonu ve gövde açısal hızı
  moonAttitude(et) {
    const [a, b] = this.interval(et), h = b.t - a.t, s = h === 0 ? 0 : (et - a.t) / h;
    const h00 = 2 * s ** 3 - 3 * s * s + 1, h10 = s ** 3 - 2 * s * s + s, h01 = -2 * s ** 3 + 3 * s * s, h11 = s ** 3 - s * s;
    const q = [0, 1, 2, 3].map((k) => h00 * a.y[OQ + k] + h10 * h * a.f[OQ + k] + h01 * b.y[OQ + k] + h11 * h * b.f[OQ + k]);
    const n = Math.hypot(...q); for (let k = 0; k < 4; k++) q[k] /= n;
    const w = [0, 1, 2].map((k) => h00 * a.y[OW + k] + h10 * h * a.f[OW + k] + h01 * b.y[OW + k] + h11 * h * b.f[OW + k]);
    return { q, w };
  }
}

// PA dönüş matrisini 3-1-3 Euler açılarına çevir (DE440 ile karşılaştırma için)
export function paEuler(Mip) {                 // Mip: ICRF -> PA
  const th = Math.acos(Math.max(-1, Math.min(1, Mip[2][2])));
  const phi = Math.atan2(Mip[2][0], -Mip[2][1]), psi = Math.atan2(Mip[0][2], Mip[1][2]);
  return [phi, th, psi];
}
