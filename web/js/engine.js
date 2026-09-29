// LS19 fizik motoru — rocsim_mission_engine.py'nin birebir JavaScript karşılığı
// Birimler: km, s, kg. Zaman: TDB saniye (JD0 = 2026-10-01 00:00 TDB'den). Çerçeve: ICRF.
// Kuvvetler: merkez cisim (Dünya/Ay, etki küresiyle geçiş) + Dünya J2 (presesyonlu kutup)
//            + Ay J2/C22 (PA çerçevesi) + Ay/Dünya/Güneş üçüncü cisim (DE440) + sonlu itki.
// Entegratör: Dormand–Prince 5(4), uyarlamalı adım.

export const MU_E = 398600.435507, MU_M = 4902.800118, MU_S = 132712440041.279;
export const R_E = 6378.1363, J2_E = 1.0826267e-3;
export const R_M_REF = 1738.0, R_M = 1737.4, J2_M = 2.03213e-4, C22_M = 2.2382e-5;
export const G0 = 9.80665e-3, SOI_M = 66100.0, TT_UTC = 69.184, DAY = 86400.0;
// görüntü/arayüz için 'Ay çevresi' yarıçapı (fizikteki merkez cisim geçişinden bağımsız): halo görevlerinde halo'yu kapsar
export let MOON_ZONE = SOI_M;
export function setMoonZone(r) { MOON_ZONE = r; }

// ------------------------------------------------------------------ küçük vektör/matris yardımcıları
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
export const unit = (a) => { const n = norm(a); return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : a.slice(); };
// 3x3 matris: satır dizisi [[..],[..],[..]]
export const mv = (M, v) => [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
                             M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
                             M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]];
export const mtv = (M, v) => [M[0][0] * v[0] + M[1][0] * v[1] + M[2][0] * v[2],     // Mᵀ·v
                              M[0][1] * v[0] + M[1][1] * v[1] + M[2][1] * v[2],
                              M[0][2] * v[0] + M[1][2] * v[1] + M[2][2] * v[2]];
export function mm(A, B) {
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  return C;
}
export const mT = (A) => [[A[0][0], A[1][0], A[2][0]], [A[0][1], A[1][1], A[2][1]], [A[0][2], A[1][2], A[2][2]]];
const R1 = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; };
const R2 = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, -s], [0, 1, 0], [s, 0, c]]; };
const R3 = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, s, 0], [-s, c, 0], [0, 0, 1]]; };

// ------------------------------------------------------------------ efemeris
let EPH = null;

function chebder(c) {             // numpy.polynomial.chebyshev.chebder karşılığı
  const n = c.length, d = new Array(n - 1).fill(0);
  const cc = c.slice();
  for (let j = n - 1; j > 2; j--) { d[j - 1] = 2 * j * cc[j]; cc[j - 2] += (j * cc[j]) / (j - 2); }
  if (n - 1 > 1) d[1] = 4 * cc[2];
  d[0] = cc[1];
  return d;
}

export function loadEphemeris(data) {
  const me = data.me_from_pa_arcsec_313.map((a) => (a / 3600) * Math.PI / 180);
  EPH = {
    JD0: data.JD0, ndays: data.ndays,
    moon: data.moon, sun: data.sun, pa: data.pa,
    moon_d: data.moon.map((seg) => seg.map(chebder)),
    ME: mm(mm(R1(me[2]), R2(me[1])), R3(me[0])),
  };
  PROV = tableProvider();
  return EPH;
}
export const ephemeris = () => EPH;

function cheb(tab, t, span) {
  const d = t / DAY;
  let s = Math.floor(d / span);
  s = Math.min(Math.max(s, 0), tab.length - 1);
  const x = (2.0 * (d - s * span)) / span - 1.0;
  const seg = tab[s], n = seg[0].length;
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {             // Clenshaw
    const c = seg[k]; let b1 = 0, b2 = 0;
    for (let j = n - 1; j >= 1; j--) { const b0 = 2 * x * b1 - b2 + c[j]; b2 = b1; b1 = b0; }
    out[k] = x * b1 - b2 + c[0];
  }
  return out;
}

// ------------------------------------------------------------------ efemeris sağlayıcısı
// 'table': Ekim–Aralık 2026 için önceden uydurulmuş DE440 tabloları (eski, doğrulama için)
// 'live' : canlı N-cisim efemerisi (ephem.js) + IAU 2006/2000A Dünya yönelimi (earth.js)
let PROV = null;
const ME_DEFAULT_ARCSEC = [67.8526, 78.6944, 0.2785];     // moon_de440_250416.tf: PA -> ME (3-2-1)
const meMatrix = (as) => { const me = as.map((a) => (a / 3600) * Math.PI / 180); return mm(mm(R1(me[2]), R2(me[1])), R3(me[0])); };
const tableProvider = () => ({
  kind: 'table',
  moonPos: (t) => cheb(EPH.moon, t, 1.0), moonVel: (t) => scale(cheb(EPH.moon_d, t, 1.0), 2.0 / DAY), sunPos: (t) => cheb(EPH.sun, t, 8.0),
  planets: () => [],
  moonIcrfToPa: (t) => { const [phi, theta, psi] = cheb(EPH.pa, t, 1.0); return mm(mm(R3(psi), R1(theta)), R3(phi)); },
  pole: (t) => precessionIAU76(t)[2], npb: (t) => precessionIAU76(t),
  earthIcrfToItrf: (t) => mm(R3(gmst82(t)), precessionIAU76(t)),
  ttMinusUtc: () => TT_UTC,
});
export function setProvider(p) { PROV = p; }
export const provider = () => PROV;

// canlı sağlayıcı: LiveEphemeris (SSB) + earth.js
export function liveProvider(L, EO, IDX) {
  const et = (t) => t + (JD0_ENGINE - 2451545.0) * DAY;
  let cT = NaN, cE = null, cM = null, cS = null;
  const upd = (t) => {
    if (t === cT) return;
    const e = et(t); cE = L.body(IDX.IE, e); cM = L.body(IDX.IM, e); cS = L.body(IDX.IS, e); cT = t;
  };
  const planetIdx = [1, 2, 5, 6, 7, 8, 9, 10].filter((i) => i !== IDX.IE && i !== IDX.IM && i !== IDX.IS);
  return {
    kind: 'live', L, EO,
    moonPos: (t) => { upd(t); return sub(cM[0], cE[0]); },
    moonVel: (t) => { upd(t); return sub(cM[1], cE[1]); },
    sunPos: (t) => { upd(t); return sub(cS[0], cE[0]); },
    earthSSB: (t) => { upd(t); return cE; },
    planets: (t) => { upd(t); const e = et(t); return planetIdx.map((i) => [IDX.GM[i], sub(L.body(i, e)[0], cE[0])]); },
    moonIcrfToPa: (t) => { const { q } = L.moonAttitude(et(t)); const [w, x, y, z] = q;
      return [[1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)], [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)], [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]]; },
    pole: (t) => EO.truePoleFast(jdTdb(t)), npb: (t) => EO.npbFast(jdTdb(t)).R,
    earthIcrfToItrf: (t) => EO.icrfToItrfFast(jdTdb(t)),
    ttMinusUtc: (jd) => EO.ttMinusUtc(jd),
  };
}

const JD0_ENGINE = 2461314.5;                  // motor zaman orijini: 2026-10-01 00:00 TDB (t = 0)
export const moonPos = (t) => PROV.moonPos(t);
export const moonVel = (t) => PROV.moonVel(t);
export const sunPos = (t) => PROV.sunPos(t);
export const moonIcrfToPa = (t) => PROV.moonIcrfToPa(t);
let ME = meMatrix(ME_DEFAULT_ARCSEC);
export const moonIcrfToMe = (t) => mm(ME, moonIcrfToPa(t));
export const jdTdb = (t) => JD0_ENGINE + t / DAY;
export const tFromJdTdb = (jd) => (jd - JD0_ENGINE) * DAY;
export const precession = (t) => PROV.npb(t);            // satır 2: tarihin (gerçek) kutbu
export const earthIcrfToItrf = (t) => PROV.earthIcrfToItrf(t);

function precessionIAU76(t) {
  const T = (jdTdb(t) - 2451545.0) / 36525.0, as2r = Math.PI / 180 / 3600;
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * as2r;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * as2r;
  const th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * as2r;
  return mm(mm(R3(-z), R2(th)), R3(-zeta));
}
function gmst82(t) {
  const jd = jdTdb(t) - TT_UTC / DAY, D = jd - 2451545.0, T = D / 36525.0;
  const g = 280.46061837 + 360.98564736629 * D + 0.000387933 * T * T - T ** 3 / 38710000.0;
  return (((g % 360) + 360) % 360) * Math.PI / 180;
}

// ------------------------------------------------------------------ kuvvet modeli
export function accel(t, r, central, thr, pole, Mpa) {
  const rm = moonPos(t), rs = sunPos(t);
  const rn2 = dot(r, r), rn = Math.sqrt(rn2);
  let ax, ay, az;
  if (central === 'E') {
    const k0 = -MU_E / (rn2 * rn);
    ax = k0 * r[0]; ay = k0 * r[1]; az = k0 * r[2];
    const p = pole || PROV.pole(t);
    const z = dot(r, p), k = (1.5 * J2_E * MU_E * R_E * R_E) / (rn2 * rn2 * rn), f = 5 * z * z / rn2 - 1;
    ax += k * (f * r[0] - 2 * z * p[0]); ay += k * (f * r[1] - 2 * z * p[1]); az += k * (f * r[2] - 2 * z * p[2]);
    // Ay (3. cisim)
    let d = sub(rm, r), dn = norm(d), rmn = norm(rm), q1 = MU_M / (dn * dn * dn), q2 = MU_M / (rmn * rmn * rmn);
    ax += q1 * d[0] - q2 * rm[0]; ay += q1 * d[1] - q2 * rm[1]; az += q1 * d[2] - q2 * rm[2];
    d = sub(rs, r); dn = norm(d); const rsn = norm(rs); q1 = MU_S / (dn * dn * dn); q2 = MU_S / (rsn * rsn * rsn);
    ax += q1 * d[0] - q2 * rs[0]; ay += q1 * d[1] - q2 * rs[1]; az += q1 * d[2] - q2 * rs[2];
    for (const [gm, rp] of PROV.planets(t)) {               // gezegenler (canlı efemeriste)
      const dp = sub(rp, r), dpn = norm(dp), rpn = norm(rp), p1 = gm / (dpn * dpn * dpn), p2 = gm / (rpn * rpn * rpn);
      ax += p1 * dp[0] - p2 * rp[0]; ay += p1 * dp[1] - p2 * rp[1]; az += p1 * dp[2] - p2 * rp[2];
    }
  } else {
    const k0 = -MU_M / (rn2 * rn);
    ax = k0 * r[0]; ay = k0 * r[1]; az = k0 * r[2];
    const M = Mpa || moonIcrfToPa(t);
    const [x, y, zz] = mv(M, r);
    const Rr = R_M_REF * R_M_REF, r5 = rn2 * rn2 * rn, r7 = r5 * rn2;
    const kJ = (-1.5 * J2_M * MU_M * Rr) / r5, q = (5 * zz * zz) / rn2;
    const kC = 3 * MU_M * Rr * C22_M, w = x * x - y * y;
    const loc = [kJ * x * (1 - q) + kC * (2 * x / r5 - 5 * w * x / r7),
                 kJ * y * (1 - q) + kC * (-2 * y / r5 - 5 * w * y / r7),
                 kJ * zz * (3 - q) + kC * (-5 * w * zz / r7)];
    const g = mtv(M, loc);
    ax += g[0]; ay += g[1]; az += g[2];
    const re = [-rm[0], -rm[1], -rm[2]];
    let d = sub(re, r), dn = norm(d), ren = norm(re), q1 = MU_E / (dn * dn * dn), q2 = MU_E / (ren * ren * ren);
    ax += q1 * d[0] - q2 * re[0]; ay += q1 * d[1] - q2 * re[1]; az += q1 * d[2] - q2 * re[2];
    const rsm = sub(rs, rm);
    d = sub(rsm, r); dn = norm(d); const rsmn = norm(rsm); q1 = MU_S / (dn * dn * dn); q2 = MU_S / (rsmn * rsmn * rsmn);
    ax += q1 * d[0] - q2 * rsm[0]; ay += q1 * d[1] - q2 * rsm[1]; az += q1 * d[2] - q2 * rsm[2];
    for (const [gm, rp0] of PROV.planets(t)) {               // gezegenler, Ay'a göre
      const rp = sub(rp0, rm), dp = sub(rp, r), dpn = norm(dp), rpn = norm(rp), p1 = gm / (dpn * dpn * dpn), p2 = gm / (rpn * rpn * rpn);
      ax += p1 * dp[0] - p2 * rp[0]; ay += p1 * dp[1] - p2 * rp[1]; az += p1 * dp[2] - p2 * rp[2];
    }
  }
  if (thr) { ax += thr[0]; ay += thr[1]; az += thr[2]; }
  return [ax, ay, az];
}

// ------------------------------------------------------------------ araç
export class Vehicle {
  constructor(stages) { this.stages = stages.map((s) => ({ ...s })); this.k = 0; }
  get active() { return this.stages[this.k]; }
  mass() { let m = 0; for (let i = this.k; i < this.stages.length; i++) m += this.stages[i].dry + this.stages[i].prop; return m; }
  separate() { this.k += 1; }
  clone() { const v = new Vehicle(this.stages); v.k = this.k; return v; }
}
export const dummyVehicle = () => new Vehicle([{ name: 'x', dry: 1, prop: 0, T: 0, isp: 1 }]);

// ------------------------------------------------------------------ durum
export class State {
  constructor(t, r, v, central = 'E') { this.t = t; this.r = r.slice(); this.v = v.slice(); this.central = central; }
  copy() { return new State(this.t, this.r, this.v, this.central); }
  geo() { return this.central === 'E' ? [this.r, this.v] : [add(this.r, moonPos(this.t)), add(this.v, moonVel(this.t))]; }
  seleno() { return this.central === 'M' ? [this.r, this.v] : [sub(this.r, moonPos(this.t)), sub(this.v, moonVel(this.t))]; }
  switchIfNeeded() {
    const [rs, vs] = this.seleno(), d = norm(rs);
    if (this.central === 'E' && d < SOI_M * 0.98) { this.r = rs; this.v = vs; this.central = 'M'; return true; }
    if (this.central === 'M' && d > SOI_M * 1.02) { const [g, gv] = this.geo(); this.r = g; this.v = gv; this.central = 'E'; return true; }
    return false;
  }
}

// ------------------------------------------------------------------ DOPRI5
const A = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
const Cc = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];
export const TOL = { ATOL_R: 1e-5, ATOL_V: 1e-8, RTOL: 1e-12 };

export function dopriStep(st, h, accThr) {
  const t = st.t, r = st.r, v = st.v, c = st.central;
  const pole = c === 'E' ? PROV.pole(t) : null;
  const Mpa = c === 'M' ? moonIcrfToPa(t + h / 2) : null;
  const kr = [], kv = [];
  for (let i = 0; i < 7; i++) {
    let ri = r, vi = v;
    const Ai = A[i];
    if (Ai.length) {
      ri = r.slice(); vi = v.slice();
      for (let j = 0; j < Ai.length; j++) {
        const a = Ai[j]; if (!a) continue;
        const ha = h * a, krj = kr[j], kvj = kv[j];
        ri[0] += ha * krj[0]; ri[1] += ha * krj[1]; ri[2] += ha * krj[2];
        vi[0] += ha * kvj[0]; vi[1] += ha * kvj[1]; vi[2] += ha * kvj[2];
      }
    }
    kr.push(vi);
    kv.push(accel(t + Cc[i] * h, ri, c, accThr, pole, Mpa));
  }
  const r5 = r.slice(), v5 = v.slice(), r4 = r.slice(), v4 = v.slice();
  for (let i = 0; i < 7; i++) {
    const b5 = h * B5[i], b4 = h * B4[i];
    for (let k = 0; k < 3; k++) { r5[k] += b5 * kr[i][k]; v5[k] += b5 * kv[i][k]; r4[k] += b4 * kr[i][k]; v4[k] += b4 * kv[i][k]; }
  }
  const mabs = (a) => Math.max(Math.abs(a[0]), Math.abs(a[1]), Math.abs(a[2]));
  const scR = TOL.ATOL_R + TOL.RTOL * Math.max(mabs(r), mabs(r5));
  const scV = TOL.ATOL_V + TOL.RTOL * Math.max(mabs(v), mabs(v5));
  const err = Math.max(mabs(sub(r5, r4)) / scR, mabs(sub(v5, v4)) / scV);
  return [r5, v5, err];
}

export class Propagator {
  constructor(state, vehicle, hMaxCoast = 900.0, hMaxBurn = 1.0) {
    this.s = state; this.veh = vehicle; this.h = 10.0;
    this.hMaxCoast = hMaxCoast; this.hMaxBurn = hMaxBurn;
    this.phase = ''; this.dvUsed = 0.0;
    this.tLimit = Infinity;          // canlı modda ekran saatinin ötesine geçme
    this.lastThr = 0; this.lastU = [0, 0, 0];
    this.onStep = null;              // (P, h, thr, u) geri çağrısı (kayıt için)
  }
  // control(P) -> [throttle, u] ya da null
  step(hReq, control = null) {
    let thr = 0, u = [0, 0, 0];
    if (control) { const c = control(this); if (c) { thr = c[0]; u = c[1]; } }
    const st = this.veh.active;
    const T = thr > 0 && st.prop > 0 ? thr * st.T : 0.0;
    const m = this.veh.mass();
    const acc = T > 0 ? scale(u, T / m) : null;
    const hmax = T > 0 ? this.hMaxBurn : this.hMaxCoast;
    let h = Math.sign(hReq) * Math.min(Math.abs(hReq), hmax, Math.abs(this.h));
    let r5, v5, err;
    for (;;) {
      [r5, v5, err] = dopriStep(this.s, h, acc);
      if (err <= 1.0) break;
      h *= Math.max(0.2, 0.9 * err ** -0.2);
    }
    this.s.r = r5; this.s.v = v5; this.s.t += h;
    if (T > 0) {
      const dm = Math.min((T / (st.isp * G0)) * Math.abs(h), st.prop);
      this.dvUsed += st.isp * G0 * Math.log(m / (m - dm));
      st.prop -= dm;
    }
    const fac = err < 1e-10 ? 5.0 : Math.min(5.0, 0.9 * err ** -0.2);
    this.h = Math.min(Math.abs(h) * fac, this.hMaxCoast);
    this.lastThr = T > 0 ? thr : 0; this.lastU = u;
    this.s.switchIfNeeded();
    if (this.onStep) this.onStep(this, h, this.lastThr, u);
    return h;
  }
  runUntil(tEnd, control = null, stop = null) {          // canlı olmayan (hesap) kullanım
    const sign = tEnd >= this.s.t ? 1 : -1;
    while (sign * (tEnd - this.s.t) > 1e-9) {
      if (stop && stop(this)) return true;
      this.step(sign * Math.min(Math.abs(tEnd - this.s.t), 1e9), control);
    }
    return false;
  }
}

// ------------------------------------------------------------------ yardımcılar
export function elements(r, v, mu) {
  const rn = norm(r), vn = norm(v), h = cross(r, v), hn = norm(h);
  const En = 0.5 * vn * vn - mu / rn;
  const a = Math.abs(En) > 1e-14 ? -mu / (2 * En) : Infinity;
  const rv = dot(r, v);
  const ev = scale(sub(scale(r, vn * vn - mu / rn), scale(v, rv)), 1 / mu);
  const e = norm(ev), p = (hn * hn) / mu;
  return { a, e, h, evec: ev, p, rp: p / (1 + e), ra: e < 1 ? p / (1 - e) : Infinity, energy: En,
           inc: Math.acos(Math.max(-1, Math.min(1, h[2] / hn))) };
}

export function utcParts(t) {
  const jdT = jdTdb(t), jd = jdT - PROV.ttMinusUtc(jdT) / DAY + 0.5;
  const Z = Math.floor(jd), F = jd - Z;
  const alpha = Math.floor((Z - 1867216.25) / 36524.25), A_ = Z + 1 + alpha - Math.floor(alpha / 4);
  const B = A_ + 1524, C_ = Math.floor((B - 122.1) / 365.25), D_ = Math.floor(365.25 * C_), E_ = Math.floor((B - D_) / 30.6001);
  const day = B - D_ - Math.floor(30.6001 * E_) + F;
  const month = E_ < 14 ? E_ - 1 : E_ - 13, year = month > 2 ? C_ - 4716 : C_ - 4715;
  const d = Math.floor(day); const s = (day - d) * 86400.0;
  return { year, month, day: d, hh: Math.floor(s / 3600), mm: Math.floor((s % 3600) / 60), ss: s % 60 };
}
// UTC (Date ya da ms) -> motor zamanı t (TDB s)
export function tFromUtcMs(ms) {
  const jdU = ms / 86400000 + 2440587.5;
  let jdT = jdU + PROV.ttMinusUtc(jdU + 69 / DAY) / DAY;
  return (jdT - JD0_ENGINE) * DAY;
}
export function utcMsFromT(t) { const jdT = jdTdb(t), jdU = jdT - PROV.ttMinusUtc(jdT) / DAY; return (jdU - 2440587.5) * 86400000; }
export function utcString(t) {
  const p = utcParts(t), z = (x, n = 2) => String(x).padStart(n, '0');
  return `${z(p.year, 4)}-${z(p.month)}-${z(p.day)} ${z(p.hh)}:${z(p.mm)}:${p.ss.toFixed(1).padStart(4, '0')} UTC`;
}

// Ay'ın ICRF açısal hız vektörü (sayısal türev)
export function omegaMoon(t) {
  const M0 = moonIcrfToMe(t - 5), M1 = moonIcrfToMe(t + 5), M = moonIcrfToMe(t);
  const dM = M0.map((row, i) => row.map((x, j) => (M1[i][j] - x) / 10.0));
  const W = mm(mT(M), dM);
  const Wa = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) Wa[i][j] = 0.5 * (W[i][j] - W[j][i]);
  return [-Wa[2][1], -Wa[0][2], -Wa[1][0]];
}
