// LS19 saptırma fizik motoru: bir asteroidin yörüngesini Güneş sistemi modeli içinde tarihe taşır, Dünya yakın geçişlerini
// bulur ve bir itkinin (kinetik çarpıcı ya da sürekli kuvvet) yakın geçişteki kaçırma mesafesini ne kadar değiştirdiğini hesaplar.
//   Model: Güneş + 8 gezegen + Ay + Plüton noktasal kütleleri, konumlar doğrudan JPL DE440s çekirdeğinden;
//          Güneş'in genel görelilik (1PN, Schwarzschild) düzeltmesi; isteğe bağlı sürekli itki ivmesi.
//   Tümleyici: DOPRI5 (uyarlamalı adım), yakın geçiş anı ikiye bölmeyle kesinleştirilir.
//   Doğrusal duyarlılık: durum geçiş matrisi (STM, 6x6 varyasyon denklemleri) + B-düzlemi (Öpik/Valsecchi ξ–ζ) kısmi türevleri.
// Birimler: km, s, TDB saniye (J2000'den), ICRF (SSB). Asteroidin kendi kütlesi yörüngesini etkilemez (test parçacığı).
import { SPKKernel } from './jplkernel.js';

export const AU = 149597870.7, DAY = 86400, YEAR = 365.25 * 86400;
export const GM_SUN = 132712440041.279419, MU_E = 398600.435507, R_E = 6378.1363;
const PERT = [[10, GM_SUN], [1, 22031.868551], [2, 324858.592], [399, 398600.435507], [301, 4902.800118], [4, 42828.375816],
  [5, 126712764.1], [6, 37940584.8418], [7, 5794556.4], [8, 6836527.10058], [9, 975.5]];
const NP = PERT.length, C2 = 299792.458 ** 2;
const EPS = (84381.448 / 3600) * Math.PI / 180, CE = Math.cos(EPS), SE = Math.sin(EPS);   // J2000 ekliptik eğikliği (JPL)
const D2R = Math.PI / 180;
export const etFromJd = (jd) => (jd - 2451545.0) * DAY;
export const jdFromEt = (et) => et / DAY + 2451545.0;
export const ET_MIN = etFromJd(2396758.5 + 400), ET_MAX = etFromJd(2506331.5 - 400);    // DE440s kapsamı (1849–2150), kenar payıyla

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const n = norm(a); return [a[0] / n, a[1] / n, a[2] / n]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

// ---------------------------------------------------------------- yörünge öğeleri -> durum
// el: { a (AU), e, i, om, w, ma (derece), epoch (JD TDB) } — JPL SBDB: Güneş merkezli, J2000 ekliptiği, oskülatör
export function eclToIcrf(v) { return [v[0], CE * v[1] - SE * v[2], SE * v[1] + CE * v[2]]; }
export function icrfToEcl(v) { return [v[0], CE * v[1] + SE * v[2], -SE * v[1] + CE * v[2]]; }
export function keplerHelio(el, et, mu = GM_SUN) {
  const a = el.a * AU, e = el.e, n = Math.sqrt(mu / Math.abs(a) ** 3);
  let M = el.ma * D2R + n * (et - etFromJd(el.epoch));
  M = ((M + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
  for (let k = 0; k < 50; k++) { const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-14) break; }
  const cE = Math.cos(E), sE = Math.sin(E), b = a * Math.sqrt(1 - e * e), r = a * (1 - e * cE);
  const xp = a * (cE - e), yp = b * sE, vxp = -a * n * sE * a / r, vyp = b * n * cE * a / r;
  const cO = Math.cos(el.om * D2R), sO = Math.sin(el.om * D2R), ci = Math.cos(el.i * D2R), si = Math.sin(el.i * D2R);
  const cw = Math.cos(el.w * D2R), sw = Math.sin(el.w * D2R);
  const P = [cO * cw - sO * sw * ci, sO * cw + cO * sw * ci, sw * si], Q = [-cO * sw - sO * cw * ci, -sO * sw + cO * cw * ci, cw * si];
  const r3 = [P[0] * xp + Q[0] * yp, P[1] * xp + Q[1] * yp, P[2] * xp + Q[2] * yp];
  const v3 = [P[0] * vxp + Q[0] * vyp, P[1] * vxp + Q[1] * vyp, P[2] * vxp + Q[2] * vyp];
  return [eclToIcrf(r3), eclToIcrf(v3)];
}
// Güneş merkezli oskülatör öğeler (ekliptik): a (km), e, i (derece), periyot (s)
export function helioElements(r, v, mu = GM_SUN) {
  const re = icrfToEcl(r), ve = icrfToEcl(v), rn = norm(re), v2 = dot(ve, ve), h = cross(re, ve);
  const a = 1 / (2 / rn - v2 / mu), ev = sub(scl(re, v2 / mu - 1 / rn), scl(ve, dot(re, ve) / mu)), e = norm(ev);
  return { a, e, i: Math.acos(h[2] / norm(h)) / D2R, q: a * (1 - e), Q: a * (1 + e), P: a > 0 ? 2 * Math.PI * Math.sqrt(a ** 3 / mu) : NaN };
}

// ---------------------------------------------------------------- B-düzlemi (Dünya merkezli hiperbol asimptotu)
// r, v: asteroidin Dünya'ya göre konum/hızı (yakın geçiş civarında), vE: Dünya'nın Güneş'e göre hızı (ζ ekseni yönü için)
export function bplane(r, v, vE) {
  const rn = norm(r), v2 = dot(v, v), vinf2 = v2 - 2 * MU_E / rn;
  if (!(vinf2 > 0)) return null;                                   // Dünya'ya bağlı (yakalanmış) yörünge
  const vinf = Math.sqrt(vinf2), h = cross(r, v), hn = norm(h), hh = scl(h, 1 / hn);
  const ev = scl(sub(scl(r, v2 - MU_E / rn), scl(v, dot(r, v))), 1 / MU_E), e = norm(ev), eh = scl(ev, 1 / e);
  const S = unit([eh[0] / e + Math.sqrt(e * e - 1) / e * (hh[1] * eh[2] - hh[2] * eh[1]),
    eh[1] / e + Math.sqrt(e * e - 1) / e * (hh[2] * eh[0] - hh[0] * eh[2]), eh[2] / e + Math.sqrt(e * e - 1) / e * (hh[0] * eh[1] - hh[1] * eh[0])]);
  const b = hn / vinf, B = scl(cross(S, hh), b);
  // ζ: Dünya'nın güneş merkezli hızının B-düzlemindeki izdüşümünün tersi (zamanlama ekseni), ξ = η × ζ (η = S)
  const vp = sub(vE, scl(S, dot(vE, S))), zh = scl(unit(vp), -1), xh = cross(S, zh);
  const bE = R_E * Math.sqrt(1 + 2 * MU_E / (R_E * vinf2));        // yerçekimi odaklamasıyla yakalama yarıçapı
  const rp = MU_E / vinf2 * (Math.sqrt(1 + (b * vinf2 / MU_E) ** 2) - 1);   // gerçek en yakın geçiş (Dünya merkezine)
  return { xi: dot(B, xh), zeta: dot(B, zh), b, bE, vinf, rp, S, xh, zh, impact: b < bE };
}

// ---------------------------------------------------------------- 6x6 matris yardımcıları
function matInv6(A) {
  const n = 6, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r) => r.slice(n));
}
const matMul6 = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, a, k) => s + a * B[k][j], 0)));
const phiOf = (y) => Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, j) => y[6 + i * 6 + j]));

// ---------------------------------------------------------------- motor
const A5 = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
const C5 = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const E5 = [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40];

export class DeflectEngine {
  constructor(spk) {
    this.spk = spk instanceof SPKKernel ? spk : new SPKKernel(spk);
    this.bp = new Float64Array(NP * 3); this.bEt = NaN; this.nfev = 0;
    this.rtol = 1e-11; this.atolR = 1e-3; this.atolV = 1e-9;
  }
  bodies(et) {
    if (et === this.bEt) return this.bp;
    for (let j = 0; j < NP; j++) { const [p] = this.spk.ssb(PERT[j][0], et); this.bp[3 * j] = p[0]; this.bp[3 * j + 1] = p[1]; this.bp[3 * j + 2] = p[2]; }
    this.bEt = et; return this.bp;
  }
  earth(et) { return this.spk.ssb(399, et); }
  sun(et) { return this.spk.ssb(10, et); }
  // durum türevi: y = [r, v] (6) ya da [r, v, Φ] (42); thrust(et, y) -> ivme (km/s²) ya da null
  deriv(et, y, thrust) {
    this.nfev++;
    const bp = this.bodies(et), f = new Float64Array(y.length), stm = y.length > 6;
    const x = y[0], yy = y[1], z = y[2];
    let ax = 0, ay = 0, az = 0;
    const G = stm ? [0, 0, 0, 0, 0, 0] : null;                        // yerçekimi gradyanı (simetrik: xx xy xz yy yz zz)
    for (let j = 0; j < NP; j++) {
      const dx = x - bp[3 * j], dy = yy - bp[3 * j + 1], dz = z - bp[3 * j + 2], r2 = dx * dx + dy * dy + dz * dz, r = Math.sqrt(r2);
      const gm = PERT[j][1], k = gm / (r2 * r);
      ax -= k * dx; ay -= k * dy; az -= k * dz;
      if (G) { const k5 = 3 * k / r2; G[0] += k5 * dx * dx - k; G[1] += k5 * dx * dy; G[2] += k5 * dx * dz; G[3] += k5 * dy * dy - k; G[4] += k5 * dy * dz; G[5] += k5 * dz * dz - k; }
    }
    // Güneş 1PN düzeltmesi (Güneş merkezli göreli konum/hız; Güneş'in SSB hızı küçük, ihmal)
    {
      const rx = x - bp[0], ry = yy - bp[1], rz = z - bp[2], vx = y[3], vy = y[4], vz = y[5];
      const r = Math.hypot(rx, ry, rz), v2 = vx * vx + vy * vy + vz * vz, rv = rx * vx + ry * vy + rz * vz;
      const k = GM_SUN / (C2 * r * r * r), a = 4 * GM_SUN / r - v2;
      ax += k * (a * rx + 4 * rv * vx); ay += k * (a * ry + 4 * rv * vy); az += k * (a * rz + 4 * rv * vz);
    }
    if (thrust) { const a = thrust(et, y); if (a) { ax += a[0]; ay += a[1]; az += a[2]; } }
    f[0] = y[3]; f[1] = y[4]; f[2] = y[5]; f[3] = ax; f[4] = ay; f[5] = az;
    if (stm) {                                                            // Φ̇ = [[0, I], [G, 0]] Φ
      const g = [[G[0], G[1], G[2]], [G[1], G[3], G[4]], [G[2], G[4], G[5]]];
      for (let j = 0; j < 6; j++) {
        for (let i = 0; i < 3; i++) f[6 + i * 6 + j] = y[6 + (i + 3) * 6 + j];
        for (let i = 0; i < 3; i++) f[6 + (i + 3) * 6 + j] = g[i][0] * y[6 + j] + g[i][1] * y[6 + 6 + j] + g[i][2] * y[6 + 12 + j];
      }
    }
    return f;
  }
  // tek DOPRI5 adımı (hata denetimli olmayan sabit h için de kullanılır)
  rawStep(et, y, f0, h, thrust) {
    const n = y.length, k = [f0];
    let y5 = null;
    for (let s = 1; s < 7; s++) {
      const ys = new Float64Array(n);
      for (let i = 0; i < n; i++) { let acc = 0; for (let j = 0; j < s; j++) { const c = A5[s][j]; if (c) acc += c * k[j][i]; } ys[i] = y[i] + h * acc; }
      if (s === 6) y5 = ys;
      k.push(this.deriv(et + C5[s] * h, ys, thrust));
    }
    let err = 0;
    for (let i = 0; i < 6; i++) {                                         // hata yalnız fiziksel durum üzerinden (STM izler)
      let e = 0; for (let j = 0; j < 7; j++) if (E5[j]) e += E5[j] * k[j][i];
      e = Math.abs(h * e);
      const sc = (i < 3 ? this.atolR : this.atolV) + this.rtol * Math.max(Math.abs(y[i]), Math.abs(y5[i]));
      err = Math.max(err, e / sc);
    }
    return { y: y5, f: k[6], err };
  }
  // et0 -> et1 uyarlamalı tümleme. onStep(a, b) false dönerse durur; a/b: {et, y, f}
  integrate(et0, y0, et1, opt = {}) {
    const dir = Math.sign(et1 - et0) || 1, thrust = opt.thrust || null, hMax = opt.hMax || 20 * DAY;
    let cur = { et: et0, y: Float64Array.from(y0), f: this.deriv(et0, y0, thrust) };
    let h = dir * Math.min(opt.h0 || 3600, Math.abs(et1 - et0) || 1);
    let guard = 0;
    while (dir * (et1 - cur.et) > 1e-9) {
      if (++guard > 5e6) throw new Error('tümleme adım sınırı');
      if (dir * (cur.et + h - et1) > 0) h = et1 - cur.et;
      const s = this.rawStep(cur.et, cur.y, cur.f, h, thrust);
      const fac = Math.min(5, Math.max(0.2, 0.9 * Math.pow(Math.max(s.err, 1e-12), -0.2)));
      if (s.err <= 1) {
        const nxt = { et: cur.et + h, y: s.y, f: s.f };
        const go = opt.onStep ? opt.onStep(cur, nxt) : true;
        cur = nxt;
        if (go === false) break;
        h = dir * Math.min(Math.abs(h * fac), hMax);
      } else h *= fac;
    }
    return cur;
  }
  // parçalı tümleme: itki penceresinin kenarlarında dur (süreksizlik adım denetimini bozmasın)
  integrateSegments(et0, y0, et1, opt = {}) {
    const cuts = (opt.cuts || []).filter((c) => (c - et0) * (et1 - c) > 0).sort((a, b) => (et1 > et0 ? a - b : b - a));
    let et = et0, y = y0, last = null;
    for (const c of [...cuts, et1]) { last = this.integrate(et, y, c, opt); et = last.et; y = last.y; if (opt.stopped && opt.stopped()) break; }
    return last;
  }
  // Dünya'ya göre g = (r − rE)·(v − vE): işaret −'dan +'ya dönerse adım içinde yerel en yakın geçiş vardır
  gEarth(et, y) { const [pE, vE] = this.earth(et); return (y[0] - pE[0]) * (y[3] - vE[0]) + (y[1] - pE[1]) * (y[4] - vE[1]) + (y[2] - pE[2]) * (y[5] - vE[2]); }
  refineMin(a, thrust) {                                                 // a adımının başı; b sonu; ikiye bölme (tek adım yeniden atılır)
    let lo = 0, hi = null;
    return (b) => {
      hi = b.et - a.et;
      let st = null;
      for (let k = 0; k < 60 && Math.abs(hi - lo) > 1e-4; k++) {
        const mid = 0.5 * (lo + hi), s = this.rawStep(a.et, a.y, a.f, mid, thrust);
        if (this.gEarth(a.et + mid, s.y) < 0) lo = mid; else hi = mid;
        st = s;
      }
      const s = this.rawStep(a.et, a.y, a.f, 0.5 * (lo + hi), thrust);
      return { et: a.et + 0.5 * (lo + hi), y: s.y };
    };
  }
  // yakın geçiş taraması: et0'dan et1'e, Dünya'ya uzaklığı maxDist (km) altındaki tüm yerel en yakın noktalar
  scan(et0, y0, et1, opt = {}) {
    const maxDist = opt.maxDist ?? 0.05 * AU, out = [];
    let gA = this.gEarth(et0, y0), steps = 0;
    const end = this.integrateSegments(et0, y0, et1, { ...opt, onStep: (a, b) => {
      steps++;
      const gB = this.gEarth(b.et, b.y);
      if (gA < 0 && gB >= 0) {
        const [pE] = this.earth(b.et), dB = Math.hypot(b.y[0] - pE[0], b.y[1] - pE[1], b.y[2] - pE[2]);
        if (dB < maxDist * 1.5 + 5e5) {
          const m = this.refineMin(a, opt.thrust)(b);
          const [pm, vm] = this.earth(m.et), rr = [m.y[0] - pm[0], m.y[1] - pm[1], m.y[2] - pm[2]], vv = [m.y[3] - vm[0], m.y[4] - vm[1], m.y[5] - vm[2]];
          const d = norm(rr);
          if (d < maxDist) out.push({ et: m.et, dist: d, vrel: norm(vv), r: rr, v: vv, y: m.y });
        }
      }
      gA = gB;
      if (opt.onProgress && steps % 200 === 0) opt.onProgress((b.et - et0) / (et1 - et0));
      return opt.stopped ? !opt.stopped() : true;
    } });
    return { list: out, end, steps };
  }
  // bir yakın geçişin B-düzlemi (Dünya'nın o anki güneş merkezli hızıyla)
  bplaneAt(ca) {
    const [, vE] = this.earth(ca.et), [, vS] = this.sun(ca.et);
    return bplane(ca.r, ca.v, sub(vE, vS));
  }
  // B-düzlemi koordinatlarının (ξ, ζ) yakın geçişteki yer merkezli duruma göre kısmi türevleri (2x6), sayısal
  bplanePartials(ca) {
    const [, vE] = this.earth(ca.et), [, vS] = this.sun(ca.et), vh = sub(vE, vS), b0 = bplane(ca.r, ca.v, vh), J = [[], []];
    for (let k = 0; k < 6; k++) {
      const hk = k < 3 ? 1e-3 * Math.max(1, norm(ca.r)) * 1e-4 : 1e-7 * Math.max(1, norm(ca.v));
      const rp = ca.r.slice(), vp = ca.v.slice(), rm = ca.r.slice(), vm = ca.v.slice();
      if (k < 3) { rp[k] += hk; rm[k] -= hk; } else { vp[k - 3] += hk; vm[k - 3] -= hk; }
      const bp = bplane(rp, vp, vh), bm = bplane(rm, vm, vh);
      // ξ-ζ eksenleri sabit tutulur (b0 çerçevesinde izdüşüm)
      const Bp = [bp.xi * bp.xh[0] + bp.zeta * bp.zh[0], bp.xi * bp.xh[1] + bp.zeta * bp.zh[1], bp.xi * bp.xh[2] + bp.zeta * bp.zh[2]];
      const Bm = [bm.xi * bm.xh[0] + bm.zeta * bm.zh[0], bm.xi * bm.xh[1] + bm.zeta * bm.zh[1], bm.xi * bm.xh[2] + bm.zeta * bm.zh[2]];
      J[0][k] = (dot(Bp, b0.xh) - dot(Bm, b0.xh)) / (2 * hk); J[1][k] = (dot(Bp, b0.zh) - dot(Bm, b0.zh)) / (2 * hk);
    }
    return { b0, J };
  }
  // STM ile tümleme: Φ(et1, et0); stops: ara anlar -> Φ(stop, et0) kaydı
  stm(et0, y0, et1, stops = [], opt = {}) {
    const Y = new Float64Array(42); Y.set(y0.slice(0, 6)); for (let i = 0; i < 6; i++) Y[6 + i * 7] = 1;
    const out = [];
    let et = et0, y = Y;
    const cuts = stops.filter((s) => (s - et0) * (et1 - s) > 0).sort((a, b) => (et1 > et0 ? a - b : b - a));
    for (const c of [...cuts, et1]) {
      const r = this.integrate(et, y, c, opt); et = r.et; y = r.y;
      out.push({ et, Phi: phiOf(y), y: y.slice(0, 6) });
      if (opt.stopped && opt.stopped()) break;
    }
    return out;
  }
}

// ---------------------------------------------------------------- saptırma senaryosu
// Asteroid kütlesi: ölçülmüş GM > çap+yoğunluk > H+albedo
export function massOf(p) {
  if (p.GM > 0) return p.GM * 1e9 / 6.6743e-11;                          // km³/s² -> kg
  const D = p.D > 0 ? p.D : 1329 / Math.sqrt(p.albedo > 0 ? p.albedo : 0.14) * Math.pow(10, -p.H / 5);
  return (Math.PI / 6) * (D * 1000) ** 3 * (p.rho || 2000);
}
export function diameterOf(p) { return p.D > 0 ? p.D : 1329 / Math.sqrt(p.albedo > 0 ? p.albedo : 0.14) * Math.pow(10, -p.H / 5); }
// kinetik çarpıcı: Δv = β m U / (M + m)  (m/s); β: momentum artış çarpanı (DART: ≈3,6)
export const kineticDv = (m, U_kms, beta, M) => beta * m * U_kms * 1000 / (M + m);
// itki yönü (ICRF birim vektör) — y: güneş merkezli olmayan SSB durumu, sunY: Güneş durumu
export function dirVector(kind, r, v, custom) {
  const rh = unit(r), vh = unit(v), nh = unit(cross(r, v)), th = cross(nh, rh);
  if (kind === 'along') return vh;
  if (kind === 'anti') return scl(vh, -1);
  if (kind === 'radial') return rh;
  if (kind === 'normal') return nh;
  if (kind === 'trans') return th;
  if (kind === 'custom' && custom) return unit(custom);
  return vh;
}
// sonuç özeti için Δv'nin yörüngeye etkisi (anlık, Güneş iki cisim)
export function orbitChange(r, v, dv) {
  const e0 = helioElements(r, v), e1 = helioElements(r, [v[0] + dv[0], v[1] + dv[1], v[2] + dv[2]]);
  return { da: e1.a - e0.a, dP: e1.P - e0.P, de: e1.e - e0.e, di: e1.i - e0.i, before: e0, after: e1 };
}
export { matInv6, matMul6, phiOf, norm, sub, dot, cross, unit, scl };
