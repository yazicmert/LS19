// Bağımsız N-cisim referansı (yalnız doğrulama için): motorun merkez cisim + üçüncü cisim formülünden bağımsız yazılmıştır.
// Aracı Dünya'ya göre ofset y = x − E(t) olarak entegre eder; hareket denklemi barisentrik N-cisim denkleminden türetilir:
//   ÿ = Σᵢ GMᵢ (Rᵢ − y)/|Rᵢ − y|³ (tüm cisimler, Dünya dahil, nokta kütle) + Dünya J2 (gerçek kutup) + Ay J2/C22 + Güneş 1PN − Ë(t)
// Ë(t): efemerisin kendi Dünya ivmesi (DE440 başlangıçlı N-cisim entegrasyonunun hızından sayısal türev); böylece dolaylı terimler
// motorun analitik formülüne bağlı kalmaz, efemerisle tutarlıdır (Dünya'nın J2/figür tepkisi ve 1PN dahil).
import * as E from '../js/engine.js';
import * as EO from '../js/earth.js';
import { BODIES, qToMat } from '../js/ephem.js';

const GM = BODIES.map((b) => b.gm), IS = 0, IE = 3, IM = 4, C2 = 299792.458 ** 2;
const R_E = 6378.1363, J2_E = 1.0826267e-3, R_MREF = 1738.0, J2_M = 2.03213e-4, C22_M = 2.2382e-5;
const { add, sub, scale, dot, norm, mv, mtv } = E;

// L: LiveEphemeris. Döner { acc(t, y, vy), etOf(t) }
export function makeRef(L, { pn = true } = {}) {
  const et0 = (E.jdTdb(0) - 2451545.0) * 86400, etOf = (t) => t + et0;
  const earthAcc = (et) => { const d = 30; return scale(sub(L.body(IE, et + d)[1], L.body(IE, et - d)[1]), 1 / (2 * d)); };
  function acc(t, y, vy) {
    const et = etOf(t), [pE, vE] = L.body(IE, et);
    let a = scale(y, -GM[IE] / norm(y) ** 3), Rm = [0, 0, 0];
    for (let i = 0; i < BODIES.length; i++) {
      if (i === IE) continue;
      const Ri = sub(L.body(i, et)[0], pE), d = sub(Ri, y), dn = norm(d);
      a = add(a, scale(d, GM[i] / (dn * dn * dn)));
      if (i === IM) Rm = Ri;
    }
    const pole = EO.truePoleFast(E.jdTdb(t)), rn = norm(y), z = dot(y, pole), k = (1.5 * J2_E * GM[IE] * R_E * R_E) / rn ** 5, f = 5 * z * z / (rn * rn) - 1;
    a = add(a, [k * (f * y[0] - 2 * z * pole[0]), k * (f * y[1] - 2 * z * pole[1]), k * (f * y[2] - 2 * z * pole[2])]);
    const s = sub(y, Rm), sn = norm(s);
    if (sn < 200000) {                                                    // Ay J2/C22 (PA çerçevesi, entegre edilen yönelim)
      const Mb = qToMat(L.moonAttitude(et).q), [x, yy, zz] = mtv(Mb, s), r2 = sn * sn, r5 = r2 * r2 * sn, r7 = r5 * r2, Rr = R_MREF * R_MREF, mu = GM[IM];
      const kJ = (-1.5 * J2_M * mu * Rr) / r5, qq = (5 * zz * zz) / r2, kC = 3 * mu * Rr * C22_M, w = x * x - yy * yy;
      a = add(a, mv(Mb, [kJ * x * (1 - qq) + kC * (2 * x / r5 - 5 * w * x / r7), kJ * yy * (1 - qq) + kC * (-2 * yy / r5 - 5 * w * yy / r7), kJ * zz * (3 - qq) + kC * (-5 * w * zz / r7)]));
    }
    if (pn) {                                                             // Güneş 1PN (Schwarzschild), efemeristeki gibi
      const [pS, vS] = L.body(IS, et), rr = sub(add(pE, y), pS), vv = sub(add(vE, vy), vS), r = norm(rr), v2 = dot(vv, vv), rv = dot(rr, vv);
      a = add(a, scale(add(scale(rr, 4 * GM[IS] / r - v2), scale(vv, 4 * rv)), GM[IS] / (C2 * r ** 3)));
    }
    return sub(a, earthAcc(et));
  }
  return { acc, etOf };
}

// DOPRI5 (motordan bağımsız kod); durum: Dünya'ya göre ofset y ve hız v. thr(t): isteğe bağlı ek ivme (km/s²)
const A = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
const Cc = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1], B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0], B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];
export function integrate(ref, t0, y0, v0, t1, { atol = 1e-9, rtol = 1e-13, hmax = 600 } = {}) {
  let t = t0, y = y0.slice(), v = v0.slice(), h = 10, steps = 0;
  while (t < t1 - 1e-9) {
    h = Math.min(h, t1 - t, hmax);
    const kr = [], kv = [];
    for (let i = 0; i < 7; i++) {
      let yi = y, vi = v;
      if (A[i].length) { yi = y.slice(); vi = v.slice(); for (let j = 0; j < A[i].length; j++) { const a = A[i][j]; if (!a) continue; for (let k = 0; k < 3; k++) { yi[k] += h * a * kr[j][k]; vi[k] += h * a * kv[j][k]; } } }
      kr.push(vi.slice()); kv.push(ref.acc(t + Cc[i] * h, yi, vi));
    }
    const y5 = y.slice(), v5 = v.slice(); let err = 0;
    for (let k = 0; k < 3; k++) {
      let ey = 0, ev = 0;
      for (let i = 0; i < 7; i++) { y5[k] += h * B5[i] * kr[i][k]; v5[k] += h * B5[i] * kv[i][k]; ey += h * (B5[i] - B4[i]) * kr[i][k]; ev += h * (B5[i] - B4[i]) * kv[i][k]; }
      err = Math.max(err, Math.abs(ey) / (atol + rtol * Math.abs(y5[k])), Math.abs(ev) / (atol * 1e-3 + rtol * Math.abs(v5[k])));
    }
    if (err <= 1) { t += h; y = y5; v = v5; steps++; h *= err < 1e-10 ? 5 : Math.min(5, 0.9 * err ** -0.2); }
    else h *= Math.max(0.2, 0.9 * err ** -0.2);
  }
  return { y, v, steps };
}
