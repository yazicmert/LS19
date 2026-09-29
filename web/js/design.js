// Görev tasarımı (her tarih ve her görev yapılandırması için, tarayıcıda).
// Modüler: Dünya park yörüngesi (irtifa, eğim, tur) + Ay bekleme yörüngesi (alçak dairesel LLO ya da halo/NRHO) + iniş.
//  Apollo profili (Ay bekleme = LLO):
//   1) Aydınlanma penceresi: Apollo 11 yerinde Güneş ~12° yükselirken iniş -> t_L
//   2) Varış: t_L'de iniş yerini içeren LLO düzleminde (β ile döndürülmüş, J2 düğüm kaymasıyla geri alınmış) periselen;
//      geriye yayınımla Dünya perijesine (h_park, i hedefi) Newton (uP, β)
//   3) TLI sonlu yakış: yakın alan eşlemesi + t_P−8 sa uzak alan konum hedeflemesi
//   4) KSC LC-39B fırlatma fazlaması -> t_P kaydırması
//  Halo profili (Ay bekleme = halo/NRHO, iniş LLO üzerinden):
//   1) t_L; LLO girişi t_P2 = t_L − 700 − (N+½)·P_LLO
//   2) CR3BP halo üyesi -> tarihli efemeris halo referansı (çoklu atış), kalkış perilünü ≈ t_P2 − transfer süresi
//   3) Halo -> LLO iki yakışlı transfer: kalkış anı, LLO varış noktası (uP) ve düzlem (β) Nelder–Mead ile en az Δv
//   4) Dünya -> halo: varış halo üzerinde, varış hız yönü (θ, φ) Newton ile perije/eğim kısıtlarına; NRI Δv = |v_halo − v_varış|
//   5) TLI ve fazlama (varış noktası halo boyunca kayar; halo ve iniş zamanlaması sabit kalır)
//  Araç boyutlandırma: Δv bütçesinden iniş aracı ve TLI kademesi yakıtı (varsayılandan küçük olmaz).
import * as E from './engine.js';
import { STAGES as BASE_STAGES, siteIcrf, R_SITE } from './mission.js';
import { HALO_PRESETS, haloMember, ephemerisHalo } from './halo.js';
import * as CR from './cr3bp.js';
const { add, sub, scale, dot, cross, norm, unit, mtv } = E;

const KSC_LAT = 28.5729 * Math.PI / 180, KSC_LON = -80.6490 * Math.PI / 180;
const ASCENT_T = 600.0, ASCENT_ARC = 16.0 * Math.PI / 180;
const SUN_EL_TARGET = 12.0;                      // derece (Apollo 11: 10.8°)
const dummy = () => E.dummyVehicle();
const D2R = Math.PI / 180;

// ---------------------------------------------------------------- yapılandırma
export const DEFAULT_CONFIG = {
  earth: { h: 185, inc: 28.6, revs: 1.5 },                    // Dünya park yörüngesi: irtifa (km), eğim (°), tur
  moon: { type: 'LLO', llo: { h: 110, revs: 2 }, halo: { preset: 'NRHO92', revs: 1 } },
};
export const PROFILES = {
  APOLLO: { name: 'Apollo, hızlı (LLO 110 km, 2 tur)', cfg: DEFAULT_CONFIG },
  APOLLO11: { name: 'Apollo 11 gibi (LLO 110 km, 13 tur)', cfg: { earth: { h: 185, inc: 32.5, revs: 1.5 }, moon: { type: 'LLO', llo: { h: 110, revs: 13 }, halo: DEFAULT_CONFIG.moon.halo } } },
  NRHO: { name: 'Artemis: NRHO 9:2 bekleme (1 tur) + LLO', cfg: { earth: DEFAULT_CONFIG.earth, moon: { type: 'HALO', llo: { h: 100, revs: 2 }, halo: { preset: 'NRHO92', revs: 1 } } } },
  L2: { name: 'L2 halo bekleme + LLO', cfg: { earth: DEFAULT_CONFIG.earth, moon: { type: 'HALO', llo: { h: 100, revs: 2 }, halo: { preset: 'L2S13', revs: 1 } } } },
  L1: { name: 'L1 halo bekleme + LLO', cfg: { earth: DEFAULT_CONFIG.earth, moon: { type: 'HALO', llo: { h: 100, revs: 2 }, halo: { preset: 'L1N10', revs: 1 } } } },
};
export const HALO_OPTIONS = Object.fromEntries(Object.entries(HALO_PRESETS).map(([k, v]) => [k, v.name]));
const clone = (o) => JSON.parse(JSON.stringify(o));
export function normalizeConfig(c) {
  const d = clone(DEFAULT_CONFIG), cfg = c ? clone(c) : {};
  const out = { earth: { ...d.earth, ...(cfg.earth || {}) }, moon: { ...d.moon, ...(cfg.moon || {}) } };
  out.moon.llo = { ...d.moon.llo, ...((cfg.moon || {}).llo || {}) };
  out.moon.halo = { ...d.moon.halo, ...((cfg.moon || {}).halo || {}) };
  out.earth.h = Math.min(1000, Math.max(160, +out.earth.h));
  out.earth.inc = Math.min(90, Math.max(28.6, +out.earth.inc));
  out.earth.revs = Math.min(15.5, Math.max(0.5, +out.earth.revs));
  out.moon.llo.h = Math.min(500, Math.max(30, +out.moon.llo.h));
  out.moon.llo.revs = Math.min(40, Math.max(1, Math.round(+out.moon.llo.revs)));
  out.moon.halo.revs = Math.min(6, Math.max(1, Math.round(+out.moon.halo.revs)));
  if (!HALO_PRESETS[out.moon.halo.preset]) out.moon.halo.preset = 'NRHO92';
  if (out.moon.type !== 'HALO') out.moon.type = 'LLO';
  return out;
}
export function configLabel(cfg) {
  const e = cfg.earth, m = cfg.moon;
  const park = `Dünya park ${e.h} km, i ${e.inc}°, ${e.revs} tur`;
  const moon = m.type === 'HALO' ? `${HALO_PRESETS[m.halo.preset].name}, ${m.halo.revs} tur + LLO ${m.llo.h} km, ${m.llo.revs} tur`
                                  : `LLO ${m.llo.h} km, ${m.llo.revs} tur`;
  return `${park} · ${moon}`;
}

// tasarım bağlamı: yapılandırmadan türetilen sabitler
function ctx(cfg, stages) {
  const H_PARK = cfg.earth.h, R_PARK = E.R_E + H_PARK;
  const H_LLO = cfg.moon.llo.h, R_LLO = E.R_M + H_LLO, N_LLOm = Math.sqrt(E.MU_M / R_LLO ** 3), P_LLO = 2 * Math.PI / N_LLOm;
  const N_REV = cfg.moon.llo.revs;
  const incList = Math.abs(cfg.earth.inc - 28.6) < 1e-9 ? [28.6, 30, 32.5, 35, 40] : [cfg.earth.inc, cfg.earth.inc + 2, cfg.earth.inc + 4, cfg.earth.inc + 7, cfg.earth.inc + 11].filter((x) => x <= 90);
  return { cfg, H_PARK, R_PARK, PARK_REVS: cfg.earth.revs, incList, H_LLO, R_LLO, N_LLOm, P_LLO, N_REV, VINF: 0.85,
    STAGES: stages || BASE_STAGES.map((s) => ({ ...s })),
    tLof: (tP) => tP + 700.0 + (N_REV + 0.5) * P_LLO, arrState: null };
}

// ---------------------------------------------------------------- küçük doğrusal cebir
function solve(A, b) {                           // Gauss, kısmi pivot
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}
const T = (A) => A[0].map((_, j) => A.map((r) => r[j]));
const matmul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, x, k) => s + x * B[k][j], 0)));
function lstsq(J, F) {                           // en küçük kareler; eksik belirli ise en küçük normlu çözüm
  const m = J.length, n = J[0].length;
  if (m >= n) { const Jt = T(J); return solve(matmul(Jt, J), Jt.map((r) => r.reduce((s, x, k) => s + x * F[k], 0))); }
  const y = solve(matmul(J, T(J)), F); return T(J).map((r) => r.reduce((s, x, k) => s + x * y[k], 0));
}
// Nelder–Mead (küçük boyut)
function nelderMead(f, x0, steps, { maxEval = 80, tol = 1e-3 } = {}) {
  const n = x0.length; let pts = [x0.slice()];
  for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += steps[i]; pts.push(p); }
  let vals = pts.map(f), ev = n + 1;
  while (ev < maxEval) {
    const idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]); pts = idx.map((i) => pts[i]); vals = idx.map((i) => vals[i]);
    if (Math.abs(vals[n] - vals[0]) < tol) break;
    const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;
    const at = (k) => c.map((cj, j) => cj + k * (pts[n][j] - cj));
    const xr = at(-1), fr = f(xr); ev++;
    if (fr < vals[0]) { const xe = at(-2), fe = f(xe); ev++; if (fe < fr) { pts[n] = xe; vals[n] = fe; } else { pts[n] = xr; vals[n] = fr; } }
    else if (fr < vals[n - 1]) { pts[n] = xr; vals[n] = fr; }
    else {
      const xc = fr < vals[n] ? at(-0.5) : at(0.5), fc = f(xc); ev++;
      if (fc < Math.min(fr, vals[n])) { pts[n] = xc; vals[n] = fc; }
      else { for (let i = 1; i <= n; i++) { pts[i] = pts[i].map((x, j) => pts[0][j] + 0.5 * (x - pts[0][j])); vals[i] = f(pts[i]); ev++; } }
    }
  }
  const i0 = vals.indexOf(Math.min(...vals));
  return { x: pts[i0], f: vals[i0], evals: ev };
}

// ---------------------------------------------------------------- Ay tarafı
export function sunElevationAtSite(t) {
  const s = siteIcrf(t), up = unit(s), sun = sub(E.sunPos(t), add(E.moonPos(t), s));
  return Math.asin(dot(up, unit(sun))) * 180 / Math.PI;
}
export function findLandingWindow(tFrom) {       // Güneş SUN_EL_TARGET'ı yükselerek geçtiği ilk an
  let t = tFrom, prev = sunElevationAtSite(t);
  for (let i = 0; i < 24 * 40; i++) {
    const t2 = t + 3600, e2 = sunElevationAtSite(t2);
    if (prev < SUN_EL_TARGET && e2 >= SUN_EL_TARGET) {
      let a = t, b = t2;
      for (let k = 0; k < 40; k++) { const m = 0.5 * (a + b); if (sunElevationAtSite(m) < SUN_EL_TARGET) a = m; else b = m; }
      return 0.5 * (a + b);
    }
    t = t2; prev = e2;
  }
  throw new Error('Aydınlanma penceresi bulunamadı');
}
// Ay kutbu etrafında dönüş (Rodrigues)
function rotAbout(v, k, a) { const c = Math.cos(a), s = Math.sin(a); return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c))); }
// t_L'de iniş yerini içeren LLO düzlemi; tP'deki düzlem J2 düğüm kaymasıyla geriye alınır (uzun LLO kalışında iniş yeri düzlemde kalsın)
function planeBasis(K, tL, beta, tP = tL) {
  const s = unit(siteIcrf(tL)), zp = mtv(E.moonIcrfToMe(tL), [0, 0, 1]);
  const n0 = unit(sub(zp, scale(s, dot(zp, s))));
  const n = add(scale(n0, Math.cos(beta)), scale(cross(s, n0), Math.sin(beta)));
  let h = scale(n, -1), e1 = s;
  if (tP !== tL) {
    const ci = dot(h, zp), dOm = -1.5 * K.N_LLOm * E.J2_M * (E.R_M_REF / K.R_LLO) ** 2 * ci;     // rad/s
    const a = -dOm * (tL - tP);
    h = rotAbout(h, zp, a); e1 = rotAbout(e1, zp, a);
  }
  return [e1, cross(h, e1), h];
}
// Apollo varışı: LLO periselen durumu (hiperbolik, VINF)
function stPof(K, tP, uPd, betaD) {
  const [e1, e2] = planeBasis(K, K.tLof(tP), betaD * D2R, tP), u = uPd * D2R, vp = Math.sqrt(K.VINF ** 2 + 2 * E.MU_M / K.R_LLO);
  return new E.State(tP, add(scale(e1, K.R_LLO * Math.cos(u)), scale(e2, K.R_LLO * Math.sin(u))), add(scale(e1, -vp * Math.sin(u)), scale(e2, vp * Math.cos(u))), 'M');
}
// LLO üzerinde dairesel durum (halo profili, varış noktası)
function lloState(K, tP, tL, uPd, betaD) {
  const [e1, e2, h] = planeBasis(K, tL, betaD * D2R, tP), u = uPd * D2R, vc = Math.sqrt(E.MU_M / K.R_LLO);
  return { r: add(scale(e1, K.R_LLO * Math.cos(u)), scale(e2, K.R_LLO * Math.sin(u))), v: add(scale(e1, -vc * Math.sin(u)), scale(e2, vc * Math.cos(u))), h };
}
function refinePerigee(s0) {
  const Q = new E.Propagator(s0.copy(), dummy(), 5.0);
  for (let i = 0; i < 60; i++) {
    const rv = dot(Q.s.r, Q.s.v), a = E.accel(Q.s.t, Q.s.r, 'E');
    let dt = -rv / (dot(Q.s.v, Q.s.v) + dot(Q.s.r, a)); dt = Math.max(-600, Math.min(600, dt));
    if (Math.abs(dt) < 1e-6) break;
    Q.runUntil(Q.s.t + dt);
  }
  return Q.s.copy();
}
let FAST_ABORT = false, STRICT_PERIGEE = false;                         // halo varış taramasında: Dünya'dan uzaklaşan geri yörüngeleri erken bırak
function backToPerigee(st, tMax = 6 * 86400) {
  const P = new E.Propagator(st.copy(), dummy(), 1800.0);
  let best = null; const tEnd = st.t - tMax;
  while (P.s.t > tEnd) {
    P.step(-1e9);
    const g = norm(P.s.geo()[0]);
    if (g < 3000) { best = [g, P.s.copy()]; break; }
    if (!best || g < best[0]) best = [g, P.s.copy()];
    else if (P.s.central === 'E' && g > best[0] * 1.5 && best[0] < 60000) break;
    if (FAST_ABORT && (g > 700000 || (st.t - P.s.t > 1.5 * 86400 && g > best[0] + 50000))) return null;
  }
  if (!best || best[1].central !== 'E') return null;
  if (best[0] > 20000) return null;                                // gerçekten Dünya'ya inmeyen geri yörünge geçersiz
  return refinePerigee(best[1]);
}
function earthTargets(pst) {
  // perije irtifası: oskülatör konikten (tam perijede |r| ile aynı; perije bulunamazsa — Dünya'yı delip geçen yörünge — da anlamlı)
  const h = cross(pst.r, pst.v), pole = E.precession(pst.t)[2], rn = norm(pst.r);
  const sinG = Math.abs(dot(pst.r, pst.v)) / (rn * norm(pst.v));
  const hp = sinG < 1e-3 ? rn - E.R_E : E.elements(pst.r, pst.v, E.MU_E).rp - E.R_E;
  return [hp, Math.acos(dot(h, pole) / norm(h)) * 180 / Math.PI];
}
function back(K, tP, x) {
  const pst = backToPerigee(K.arrState(tP, x));
  if (!pst) return null;
  const [hp, inc] = earthTargets(pst);
  return { hp, inc, pst };
}
function solveBack(K, tP, x0, incT) {
  let x = x0.slice();
  for (let it = 0; it < 40; it++) {
    const a = back(K, tP, x); if (!a) return null;
    const F = [a.hp - K.H_PARK, a.inc - incT];
    if (Math.abs(F[0]) < 0.01 && Math.abs(F[1]) < 1e-4) {
      const sinG = Math.abs(dot(a.pst.r, a.pst.v)) / (norm(a.pst.r) * norm(a.pst.v));
      return sinG < 1e-3 ? { x, a } : null;                          // gerçek perije olmalı
    }
    const J = [[0, 0], [0, 0]];
    for (const [k, dx] of [[0, 0.005], [1, 0.01]]) {
      const xx = x.slice(); xx[k] += dx; const b = back(K, tP, xx); if (!b) return null;
      J[0][k] = (b.hp - K.H_PARK - F[0]) / dx; J[1][k] = (b.inc - incT - F[1]) / dx;
    }
    const d = solve(J, F).map((v) => -v);
    const s = Math.min(1.0, 2.0 / Math.max(Math.abs(d[0]), 1e-9), 3.0 / Math.max(Math.abs(d[1]), 1e-9));
    x = [x[0] + s * d[0], x[1] + s * d[1]];
  }
  return null;
}
// başlangıç tahmini taraması (Apollo: (uP, β); halo: varış hız yönü (θ, φ))
function scanBack(K, tP, incT, grid) {
  const cands = [];
  for (const [a, b] of grid) {
    const r = back(K, tP, [a, b]);
    if (r && r.hp > -3000 && r.hp < 60000) cands.push({ x: [a, b], cost: Math.abs(r.hp - K.H_PARK) / 2000 + Math.abs(r.inc - incT) / 8 });
  }
  return cands.sort((p, q) => p.cost - q.cost);
}
const APOLLO_GRID = [];
for (const b of [-25, -10, 0, 10, 25]) for (let u = 0; u < 360; u += 15) APOLLO_GRID.push([u, b]);

// ---------------------------------------------------------------- TLI
function parkState(K, t, phat, hhat, phi, psi) {
  const h = unit(add(scale(hhat, Math.cos(psi)), scale(cross(phat, hhat), Math.sin(psi))));
  const p = unit(sub(phat, scale(h, dot(phat, h)))), q = cross(h, p), vc = Math.sqrt(E.MU_E / K.R_PARK);
  return new E.State(t, add(scale(p, K.R_PARK * Math.cos(phi)), scale(q, K.R_PARK * Math.sin(phi))), add(scale(p, -vc * Math.sin(phi)), scale(q, vc * Math.cos(phi))), 'E');
}
function flyTli(K, x, ref, tStop) {
  const [phi, dur, pitch, psi] = x;
  const P = new E.Propagator(parkState(K, ref.t_ign, ref.phat, ref.hhat, phi, psi), new E.Vehicle(K.STAGES), 1800.0, 1.0);
  const c = (Pp) => { const r = Pp.s.r, v = Pp.s.v, vh = unit(v), nh = unit(cross(r, v)), rh = cross(nh, vh); return [1.0, add(scale(vh, Math.cos(pitch)), scale(rh, Math.sin(pitch)))]; };
  P.runUntil(ref.t_ign + dur, c); P.runUntil(tStop);
  return P;
}
function designAt(K, tP, x0, incT, log) {
  const sb = solveBack(K, tP, x0, incT);
  if (!sb) return null;
  const pg = sb.a.pst, phat = unit(pg.r), hhat = unit(cross(pg.r, pg.v));
  const vc = Math.sqrt(E.MU_E / K.R_PARK), dvImp = norm(pg.v) - vc;
  sizeTli(K, dvImp);
  const st = K.STAGES[0], m0 = K.STAGES.reduce((s, q) => s + q.dry + q.prop, 0);
  const mdot = st.T / (st.isp * E.G0), tb = (m0 * (1 - Math.exp(-dvImp / (st.isp * E.G0)))) / mdot;
  const ref = { t_ign: pg.t - tb / 2, phat, hhat };
  const tc = pg.t + tb / 2 + 600.0;
  const Q = new E.Propagator(pg.copy(), dummy(), 60.0); Q.runUntil(tc);
  const [rc, vcv] = Q.s.geo();
  let x = [(-vc / K.R_PARK) * tb / 2, tb, 0.0, 0.0];
  const resNear = (xx) => { const [r, v] = flyTli(K, xx, ref, tc).s.geo(); return [...sub(r, rc), ...scale(sub(v, vcv), 1000)]; };
  for (let it = 0; it < 12; it++) {
    const F = resNear(x), steps = [1e-6, 1e-2, 1e-6, 1e-7];
    const J = F.map(() => [0, 0, 0, 0]);
    steps.forEach((h, k) => { const xx = x.slice(); xx[k] += h; const Fk = resNear(xx); Fk.forEach((v, i) => (J[i][k] = (v - F[i]) / h)); });
    const d = lstsq(J, F).map((v) => -v), lim = [0.02, 10.0, 0.05, 0.01];
    const s = Math.min(1, ...d.map((v, i) => lim[i] / (Math.abs(v) + 1e-15)));
    x = x.map((v, i) => v + s * d[i]);
    if (Math.hypot(...d.map((v, i) => v / [1e-5, 1e-2, 1e-5, 1e-6][i])) < 1) break;
  }
  const stP = K.arrState(tP, sb.x), tTgt = tP - 8 * 3600;
  const R = new E.Propagator(stP.copy(), dummy(), 1800.0); R.runUntil(tTgt);
  const rRef = R.s.geo()[0];
  let F = null;
  for (let it = 0; it < 15; it++) {
    F = sub(flyTli(K, x, ref, tTgt).s.geo()[0], rRef);
    if (norm(F) < 0.2) break;
    const steps = [2e-6, 2e-4, 2e-6, 2e-7], Sd = [1e-3, 1, 1e-3, 1e-3];
    const J = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    steps.forEach((h, k) => { const xx = x.slice(); xx[k] += h; const Fk = sub(flyTli(K, xx, ref, tTgt).s.geo()[0], rRef); for (let i = 0; i < 3; i++) J[i][k] = ((Fk[i] - F[i]) / h) * Sd[k]; });
    const d = lstsq(J, F).map((v, i) => -v * Sd[i]), lim = [0.01, 5, 0.01, 0.002];
    const s = Math.min(1, ...d.map((v, i) => lim[i] / (Math.abs(v) + 1e-15)));
    x = x.map((v, i) => v + s * d[i]);
  }
  log && log(`  TLI: ateşleme ${E.utcString(ref.t_ign)}, süre ${x[1].toFixed(1)} s, uzak alan hatası ${norm(F).toFixed(3)} km`);
  if (!(norm(F) < 50)) return null;                                // TLI hedeflemesi yakınsamadı
  return { t_P: tP, xArr: sb.x, rP: stP.r, vP: stP.v, t_ign: ref.t_ign, phat, hhat, x, inc: incT, farErr: norm(F), dvTli: dvImp };
}

// ---------------------------------------------------------------- KSC fırlatma fazlaması
function kscIcrf(t) { const x = [Math.cos(KSC_LAT) * Math.cos(KSC_LON), Math.cos(KSC_LAT) * Math.sin(KSC_LON), Math.sin(KSC_LAT)]; return mtv(E.earthIcrfToItrf(t), x); }
const rotz = (a, v) => [Math.cos(a) * v[0] - Math.sin(a) * v[1], Math.sin(a) * v[0] + Math.cos(a) * v[1], v[2]];
function phasingShift(K, sol) {
  const st = parkState(K, sol.t_ign, sol.phat, sol.hhat, sol.x[0], sol.x[3]);
  const h0 = unit(cross(st.r, st.v)), n = Math.sqrt(E.MU_E / K.R_PARK ** 3), Tp = 2 * Math.PI / n;
  const inc = Math.acos(dot(h0, E.precession(sol.t_ign)[2]));
  const dOm = -1.5 * n * E.J2_E * (E.R_E / K.R_PARK) ** 2 * Math.cos(inc);
  const hz = (t) => rotz(dOm * (t - sol.t_ign), h0);
  const f = (t) => dot(kscIcrf(t), hz(t));
  const cands = [];
  const span = (K.PARK_REVS + 1) * Tp + 30 * 3600;
  let t0 = sol.t_ign - span, f0 = f(t0);
  for (let t = t0 + 30; t < sol.t_ign + 30 * 3600; t += 30) {
    const f1 = f(t);
    if (f0 * f1 < 0) { let a = t - 30, b = t; for (let k = 0; k < 40; k++) { const m = 0.5 * (a + b); if (f(a) * f(m) <= 0) b = m; else a = m; } cands.push(0.5 * (a + b)); }
    f0 = f1;
  }
  const tliDir = unit(st.r);
  return cands.map((tc) => {
    const tIns = tc + ASCENT_T, h = hz(tIns), k = kscIcrf(tc), kp = unit(sub(k, scale(h, dot(k, h))));
    const ins = add(scale(kp, Math.cos(ASCENT_ARC)), scale(cross(h, kp), Math.sin(ASCENT_ARC)));
    const tp = unit(sub(tliDir, scale(h, dot(tliDir, h))));
    let ang = Math.atan2(dot(cross(ins, tp), h), dot(ins, tp)); ang = ((ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    let coast = ang / n; while (coast < (K.PARK_REVS - 0.5) * Tp) coast += Tp;
    const east = unit(cross([0, 0, 1], k)), north = cross(k, east), d = cross(h, k);
    return { t_launch: tc, t_ins: tIns, coast, delta: tIns + coast - sol.t_ign, az: Math.atan2(dot(d, east), dot(d, north)) * 180 / Math.PI };
  });
}

// ---------------------------------------------------------------- araç boyutlandırma
const PDI_DV = 1.915, MCC_RES = 0.020, MARGIN = 1.03;
function doiDv(K) {                              // LLO -> 15 km perilünlü elips (Hohmann yarısı)
  const r1 = K.R_LLO, r2 = R_SITE + 15, a = (r1 + r2) / 2;
  return Math.sqrt(E.MU_M / r1) - Math.sqrt(E.MU_M * (2 / r1 - 1 / a));
}
function sizeLander(K, lunarDv) {
  const st = K.STAGES[1], c = st.isp * E.G0, dv = (MCC_RES + lunarDv + doiDv(K) + PDI_DV) * MARGIN;
  st.prop = Math.max(BASE_STAGES[1].prop, Math.ceil(st.dry * (Math.exp(dv / c) - 1) / 10) * 10);
  return dv;
}
function sizeTli(K, dvTli) {
  const st = K.STAGES[0], c = st.isp * E.G0, pay = K.STAGES[1].dry + K.STAGES[1].prop;
  // sonlu yakış yerçekimi kaybı payı: yakış süresinin karesiyle büyür (varsayılan araçta ~20 m/s)
  let prop = (pay + st.dry) * (Math.exp((dvTli + 0.02) / c) - 1);
  const tb = prop / (st.T / c), margin = 0.004 + 0.016 * (tb / 274) ** 2 + 0.008 * Math.max(0, tb / 274 - 1);
  prop = (pay + st.dry) * (Math.exp((dvTli + margin) / c) - 1);
  st.prop = Math.max(BASE_STAGES[0].prop, Math.ceil(prop / 10) * 10);
}

// ---------------------------------------------------------------- ana giriş
// tFrom: en erken fırlatma (motor zamanı); progress(msg, frac); cfg: görev yapılandırması
// Üreteç: her ilerleme adımında durur (yield). designMission eşzamanlı koşar (Node testleri, worker),
// designMissionAsync adımlar arasında tarayıcıya nefes aldırır (ana iş parçacığında çizim/ilerleme çubuğu donmaz).
export function designMission(tFrom, progress = () => {}, cfg = DEFAULT_CONFIG) {
  const g = designSteps(tFrom, progress, cfg);
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}
const macrotask = () => new Promise((res) => { const ch = new MessageChannel(); ch.port1.onmessage = () => res(); ch.port2.postMessage(0); });
export async function designMissionAsync(tFrom, progress = () => {}, cancelled = () => false, cfg = DEFAULT_CONFIG) {
  const g = designSteps(tFrom, progress, cfg);
  for (;;) {
    const r = g.next(); if (r.done) return r.value;
    await macrotask();
    if (cancelled()) return null;
  }
}
function* designSteps(tFrom, progress, cfg0) {
  const cfg = normalizeConfig(cfg0), K = ctx(cfg);
  const log = (m, f) => progress(m, f);
  log('Yapılandırma: ' + configLabel(cfg), 0.01);
  const D = cfg.moon.type === 'HALO' ? yield* designHalo(K, tFrom, log) : yield* designApollo(K, tFrom, log);
  D.cfg = cfg; D.STAGES = K.STAGES.map((s) => ({ ...s }));
  D.EARTH = { h: K.H_PARK, revs: K.PARK_REVS }; D.LLO = { ...(D.LLO || {}), h: K.H_LLO, revs: K.N_REV, P: K.P_LLO };
  D.sunElAtLanding = sunElevationAtSite(D.t_L - 1620);
  const m0 = D.STAGES.reduce((s, q) => s + q.dry + q.prop, 0);
  log(`Araç: toplam ${m0.toFixed(0)} kg (TLI kademesi yakıtı ${D.STAGES[0].prop} kg, iniş aracı yakıtı ${D.STAGES[1].prop} kg)`, 0.99);
  log(`Tasarım tamam: fırlatma ${E.utcString(D.LAUNCH.t_launch)}, iniş ~${E.utcString(D.t_L - 1620)}, Güneş ${D.sunElAtLanding.toFixed(1)}°`, 1);
  return D;
}

// ---------------------------------------------------------------- Apollo profili (LLO)
function* designApollo(K, tFrom, log) {
  K.arrState = (tP, x) => stPof(K, tP, x[0], x[1]);
  const vp = Math.sqrt(K.VINF ** 2 + 2 * E.MU_M / K.R_LLO), loiDv = vp - Math.sqrt(E.MU_M / K.R_LLO);
  sizeLander(K, loiDv);
  const LAND_AFTER = 4.35 * 86400 + (K.N_REV - 2) * K.P_LLO;
  const tL0 = findLandingWindow(tFrom + LAND_AFTER);
  log(`Aydınlanma penceresi: iniş ~${E.utcString(tL0)} (Güneş ${SUN_EL_TARGET}° yükseklikte)`, 0.05); yield;
  let tP = tL0 - 700 - (K.N_REV + 0.5) * K.P_LLO;
  let incT = K.incList[0], x0 = null;
  for (const inc of K.incList) {
    const cands = scanBack(K, tP, inc, APOLLO_GRID); yield;
    for (const c of cands.slice(0, 5)) { const sb = solveBack(K, tP, c.x, inc); yield; if (sb) { x0 = sb.x; incT = inc; break; } }
    if (x0) break;
    log(`  i=${inc}° ile çözüm yok, eğim artırılıyor`, 0.1);
  }
  if (!x0) throw new Error('Varış geometrisi çözülemedi');
  log(`Geri çözüm: uP=${x0[0].toFixed(2)}°, β=${x0[1].toFixed(2)}°, eğim ${incT}°`, 0.15); yield;
  let sol = null, opt = null;
  for (let it = 0; it < 10; it++) {
    sol = designAt(K, tP, x0, incT, (m) => log(m, 0.2 + it * 0.07));
    if (!sol) throw new Error('TLI tasarımı yakınsamadı');
    yield;
    x0 = sol.xArr;
    const opts = phasingShift(K, sol).filter((o) => o.delta > -3 * 3600).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
    if (!opts.length) throw new Error('KSC fırlatma fırsatı bulunamadı');
    opt = opts[0];
    log(`Fazlama ${it + 1}: fırlatma ${E.utcString(opt.t_launch)}, azimut ${opt.az.toFixed(1)}°, kaydırma ${(opt.delta / 60).toFixed(2)} dk`, 0.25 + it * 0.07); yield;
    if (Math.abs(opt.delta) < 1.0) break;
    tP += opt.delta;
  }
  return {
    profile: 'APOLLO',
    TLI: { x: sol.x, t_ign: sol.t_ign, phat: sol.phat, hhat: sol.hhat },
    ARRIVAL: { t_P: sol.t_P, rP: sol.rP, vP: sol.vP, uP: sol.xArr[0], beta: sol.xArr[1], vp, kind: 'peri' },
    LAUNCH: { t_launch: opt.t_launch, t_ins: opt.t_ins, az: opt.az, coast: opt.coast, site: 'Kennedy Uzay Merkezi LC-39B (28.5729°K, 80.6490°B)' },
    t_L: K.tLof(sol.t_P), inc: incT, label: E.utcString(opt.t_launch),
    DV: { TLI: sol.dvTli * 1000, LOI: loiDv * 1000, DOI: doiDv(K) * 1000, PDI: PDI_DV * 1000 },
  };
}

// ---------------------------------------------------------------- iki cisimli Lambert (evrensel değişken, bisection)
function stumpC(z) { if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z; if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / (-z); return 0.5 - z / 24; }
function stumpS(z) { if (z > 1e-8) { const s = Math.sqrt(z); return (s - Math.sin(s)) / s ** 3; } if (z < -1e-8) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / s ** 3; } return 1 / 6 - z / 120; }
export function lambert(r1, r2, tof, mu, hRef) {
  const R1 = norm(r1), R2 = norm(r2);
  let dth = Math.acos(Math.max(-1, Math.min(1, dot(r1, r2) / (R1 * R2))));
  if (dot(cross(r1, r2), hRef) < 0) dth = 2 * Math.PI - dth;
  const A = Math.sin(dth) * Math.sqrt(R1 * R2 / (1 - Math.cos(dth)));
  if (Math.abs(A) < 1e-9) return null;
  const y = (z) => R1 + R2 + A * (z * stumpS(z) - 1) / Math.sqrt(stumpC(z));
  const F = (z) => { const yy = y(z); if (yy < 0) return -1e30; return (yy / stumpC(z)) ** 1.5 * stumpS(z) + A * Math.sqrt(yy) - Math.sqrt(mu) * tof; };
  let lo = -200, hi = 4 * Math.PI * Math.PI - 1e-6;
  if (F(lo) > 0 || F(hi) < 0) return null;
  for (let k = 0; k < 200; k++) { const m = 0.5 * (lo + hi); if (F(m) < 0) lo = m; else hi = m; }
  const z = 0.5 * (lo + hi), yy = y(z), f = 1 - yy / R1, g = A * Math.sqrt(yy / mu), gd = 1 - yy / R2;
  return { v1: scale(sub(r2, scale(r1, f)), 1 / g), v2: scale(sub(scale(r2, gd), r1), 1 / g) };
}
// tam modelde itkisel atış: (t0, r0) -> t1'de rTgt; v tahmininden Newton. Döner {v0, v1 (varış hızı), err}
function shootImpulse(t0, r0, vGuess, t1, rTgt, { tol = 0.05, iters = 25 } = {}) {
  const fly = (v) => { const P = new E.Propagator(new E.State(t0, r0, v, 'M'), dummy(), 1800.0); P.runUntil(t1); return P.s.seleno(); };
  let v = vGuess.slice(), [rf, vf] = fly(v), F = sub(rf, rTgt);
  for (let it = 0; it < iters && norm(F) > tol; it++) {
    const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], h = 1e-6;
    for (let k = 0; k < 3; k++) { const vv = v.slice(); vv[k] += h; const Fk = sub(fly(vv)[0], rTgt); for (let i = 0; i < 3; i++) J[i][k] = (Fk[i] - F[i]) / h; }
    let d = solve(J, F).map((x) => -x); const dn = norm(d); if (dn > 0.1) d = scale(d, 0.1 / dn);
    let lam = 1, vN, FN, rv;
    for (let bt = 0; bt < 6; bt++) { vN = add(v, scale(d, lam)); rv = fly(vN); FN = sub(rv[0], rTgt); if (norm(FN) < norm(F)) break; lam /= 2; }
    v = vN; F = FN; [rf, vf] = rv;
    if (!Number.isFinite(norm(F))) return null;
  }
  return norm(F) <= tol * 20 ? { v0: v, v1: vf, err: norm(F) } : null;
}

// ---------------------------------------------------------------- halo profili
function* designHalo(K, tFrom, log) {
  STRICT_PERIGEE = true;
  try { return yield* designHaloInner(K, tFrom, log); } finally { STRICT_PERIGEE = false; }
}
function* designHaloInner(K, tFrom, log) {
  const hc = K.cfg.moon.halo, preset = HALO_PRESETS[hc.preset];
  log(`Halo ailesi: ${preset.name} hesaplanıyor (CR3BP)`, 0.03); yield;
  const orb = haloMember(preset), Ts = orb.T * CR.T_CR, st = orb.stats;
  log(`  periyot ${st.periodDays.toFixed(2)} g, perilün ${st.rpKm.toFixed(0)} km, apolün ${st.raKm.toFixed(0)} km, kararlılık ν=${orb.stability.toFixed(2)}`, 0.05); yield;
  const hoh = (r) => Math.PI * Math.sqrt(((r + K.R_LLO) / 2) ** 3 / E.MU_M);        // halo noktasından LLO'ya Hohmann süresi
  const LAND_AFTER = 4.0 * 86400 + (hc.revs + 1.0) * Ts + hoh(st.raKm) + 700 + (K.N_REV + 0.5) * K.P_LLO;
  const tL = findLandingWindow(tFrom + LAND_AFTER);
  const tP2 = tL - 700 - (K.N_REV + 0.5) * K.P_LLO;
  log(`Aydınlanma penceresi: iniş ~${E.utcString(tL)}; LLO girişi ~${E.utcString(tP2)}`, 0.07); yield;
  // iki ayrılış seçeneği: (a) perilün civarından kısa transfer, (b) apolünden (düzlem değişimi ucuz) uzun transfer
  const s = unit(siteIcrf(tL)), zp = mtv(E.moonIcrfToMe(tL), [0, 0, 1]), n0 = unit(sub(zp, scale(s, dot(zp, s)))), m0 = cross(s, n0);
  const hOf = (b) => scale(add(scale(n0, Math.cos(b)), scale(m0, Math.sin(b))), -1);
  let dep = null, ref = null, nEval = 0;
  for (const opt of [{ key: 'peri', tof: hoh(st.rpKm), anchorOff: 0, name: 'perilünden' }, { key: 'apo', tof: hoh(st.raKm), anchorOff: 0.5 * Ts, name: 'apolünden' }]) {
    const tD0 = tP2 - opt.tof, anchor = tD0 + opt.anchorOff;
    const R = ephemerisHalo(orb, anchor, hc.revs, { before: 1.0 });
    yield;
    const [rD0, vD0] = R.state(tD0), hHalo = cross(rD0, vD0);
    let beta0 = Math.atan2(-dot(n0, rD0), dot(m0, rD0));          // düzlem rD'yi içersin
    if (dot(hOf(beta0), hHalo) < 0) beta0 += Math.PI;
    const [e1, e2] = planeBasis(K, tL, beta0, tP2), rq = scale(unit(rD0), -1);
    const u0 = Math.atan2(dot(rq, e2), dot(rq, e1)) / D2R - 12;
    let best = null;
    const cost = ([dtH, uP, bD]) => {
      nEval++;
      const tD = tD0 + dtH * 3600, [rD, vD] = R.state(tD), tgt = lloState(K, tP2, tL, uP, bD);
      const lam = lambert(rD, tgt.r, tP2 - tD, E.MU_M, tgt.h);
      if (!lam) return 1e3;
      const sh = shootImpulse(tD, rD, lam.v1, tP2, tgt.r);
      if (!sh) return 1e3;
      const dv1 = norm(sub(sh.v0, vD)), dv2 = norm(sub(tgt.v, sh.v1)), tot = dv1 + dv2;
      if (!best || tot < best.tot) best = { tot, dv1, dv2, tD, rD, vD, v0: sh.v0, vArr: sh.v1, tgt, uP, beta: bD, opt: opt.key, name: opt.name };
      return tot;
    };
    const nm = nelderMeadGen(cost, [0, u0, beta0 / D2R], [opt.key === 'apo' ? 3 : 0.5, 15, 8], { maxEval: 60, tol: 1e-4 });
    for (let r = nm.next(); !r.done; r = nm.next()) yield;
    if (best) log(`  ${opt.name} ayrılış: Δv ${(best.dv1 * 1000).toFixed(0)} + LLO girişi ${(best.dv2 * 1000).toFixed(0)} m/s`, opt.key === 'peri' ? 0.2 : 0.3);
    if (best && (!dep || best.tot < dep.tot)) { dep = best; ref = R; }
  }
  if (!dep || dep.tot > 5) throw new Error('Halo→LLO transferi bulunamadı');
  log(`Halo→LLO: ${dep.name} ayrılış ${E.utcString(dep.tD)}, toplam ${(dep.tot * 1000).toFixed(0)} m/s (${nEval} deneme)`, 0.35); yield;
  // Dünya -> halo varışı: varış noktası halo boyunca (faz) ve varış hız yönü (θ, φ) aranır
  K.arrState = (tA, [th, ph]) => {
    const [rA, vH] = ref.state(tA), ev = unit(vH), ru = unit(rA), er = unit(sub(ru, scale(ev, dot(ru, ev)))), en = cross(ev, er);
    const d = add(add(scale(ev, Math.cos(ph * D2R) * Math.cos(th * D2R)), scale(er, Math.cos(ph * D2R) * Math.sin(th * D2R))), scale(en, Math.sin(ph * D2R)));
    const vp = Math.sqrt(K.VINF ** 2 + 2 * E.MU_M / norm(rA));
    return new E.State(tA, rA, scale(d, vp), 'M');
  };
  const nriDv = (tA, x) => { const s0 = K.arrState(tA, x); return norm(sub(ref.state(tA)[1], s0.v)); };
  const GRID = []; for (let ph = -75; ph <= 75; ph += 25) for (let th = -180; th < 180; th += 30) GRID.push([th, ph]);
  const prov = E.provider(), planets = prov.planets;
  const solveAt = function* (tA, inc) {                         // tA'da en ucuz varış çözümü
    FAST_ABORT = true; prov.planets = () => [];
    let cands = [];
    try {
      const coarse = scanBack(K, tA, inc, GRID); yield;
      // ince tarama: en iyi kaba adayların çevresinde 7.5° adımlı yerel ızgara
      const seen = new Set();
      for (const c of coarse.slice(0, 4)) {
        const loc = [];
        for (let dp = -15; dp <= 15; dp += 7.5) for (let dt = -15; dt <= 15; dt += 7.5) {
          const th = c.x[0] + dt, ph = Math.max(-89, Math.min(89, c.x[1] + dp)), k = th.toFixed(1) + ',' + ph.toFixed(1);
          if (!seen.has(k)) { seen.add(k); loc.push([th, ph]); }
        }
        cands.push(...scanBack(K, tA, inc, loc)); yield;
      }
      cands.sort((p, q) => p.cost - q.cost);
    } finally { FAST_ABORT = false; prov.planets = planets; }
    const sols = [];
    for (const c of cands.slice(0, 6)) {
      if (sols.some((s0) => Math.hypot(s0.x0[0] - c.x[0], s0.x0[1] - c.x[1]) < 5)) continue;
      const sb = solveBack(K, tA, c.x, inc); yield; if (sb) sols.push({ x: sb.x, x0: c.x, dv: nriDv(tA, sb.x) });
      if (sols.length >= 3) break;
    }
    sols.sort((a, b) => a.dv - b.dv);
    return sols[0] || null;
  };
  const tNriP = ref.tNri;                                         // referansın NRI perilünü
  // halo'da en az 'revs' tur kalınsın: varış, ayrılıştan en az revs·T önce
  const fMax = (dep.tD - hc.revs * Ts - tNriP) / Ts;
  let incT = null, arr = null, fLim = fMax;
  // önce istenen kalışla; doğrudan varış geometrisi yoksa varış yarım tur geç (kalış kısalır)
  for (const fTop of [fMax, fMax + 0.5]) {
    for (const inc of K.incList.slice(0, fTop === fMax ? 2 : K.incList.length)) {
      const tries = [];
      for (const f of [fTop, fTop - 0.125, fTop - 0.25, fTop - 0.5]) {
        const tA = tNriP + f * Ts; if (tA < ref.t0 + 3600 || tA > dep.tD - 0.2 * Ts) continue;
        const r = yield* solveAt(tA, inc);
        if (r) tries.push({ ...r, tA, f });
        log(`  varış fazı ${f.toFixed(2)} (i=${inc}°): ${r ? 'NRI ' + (r.dv * 1000).toFixed(0) + ' m/s' : 'çözüm yok'}`, 0.4);
      }
      if (tries.length) { tries.sort((a, b) => a.dv - b.dv); arr = tries[0]; incT = inc; fLim = fTop; break; }
    }
    if (arr) break;
    log(`  istenen kalışla doğrudan varış bulunamadı; varış yarım tur geciktiriliyor`, 0.42);
  }
  if (!arr) throw new Error('Dünya→halo varış geometrisi çözülemedi');
  // fazı yerel olarak inceltelim (±1/16 tur, sıcak başlangıçla)
  for (const df of [-1 / 16, 1 / 16]) {
    const tA = arr.tA + df * Ts; if (tA < ref.t0 + 3600 || tA > tNriP + (fLim + 0.02) * Ts) continue;
    const sb = solveBack(K, tA, arr.x, incT); yield;
    if (sb) { const dv = nriDv(tA, sb.x); if (dv < arr.dv) arr = { x: sb.x, dv, tA, f: arr.f + df }; }
  }
  let tA = arr.tA, x0 = arr.x;
  log(`Halo varışı: ${E.utcString(tA)} (faz ${arr.f.toFixed(3)}), NRI ~${(arr.dv * 1000).toFixed(0)} m/s, eğim ${incT}°, halo'da ~${((dep.tD - tA) / Ts).toFixed(2)} tur`, 0.5); yield;
  // iniş aracı boyutlandırma
  const skRes = (preset.by === 'period' ? 0.002 : 0.010) * (hc.revs + 1);
  sizeLander(K, arr.dv + skRes + dep.dv1 + dep.dv2);
  let sol = null, opt = null;
  for (let it = 0; it < 10; it++) {
    sol = designAt(K, tA, x0, incT, (m) => log(m, 0.55 + it * 0.04));
    if (!sol) throw new Error('TLI tasarımı yakınsamadı');
    yield;
    x0 = sol.xArr;
    // varış halo boyunca kayabilir: halo ve iniş zamanlaması sabit kalır
    const lo = ref.t0 + 3600 - tA, hi = Math.min(tNriP + (fLim + 0.05) * Ts, dep.tD - 0.15 * Ts) - tA;
    const all = phasingShift(K, sol), opts = all.filter((o) => o.delta > lo && o.delta < hi).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
    if (!opts.length) throw new Error('KSC fırlatma fırsatı bulunamadı');
    opt = opts[0];
    log(`Fazlama ${it + 1}: fırlatma ${E.utcString(opt.t_launch)}, azimut ${opt.az.toFixed(1)}°, varış kaydırma ${(opt.delta / 60).toFixed(2)} dk`, 0.58 + it * 0.04); yield;
    if (Math.abs(opt.delta) < 1.0) break;
    tA += opt.delta;
  }
  const nri = nriDv(sol.t_P, sol.xArr);
  const [, vH] = ref.state(sol.t_P);
  return {
    profile: 'HALO',
    TLI: { x: sol.x, t_ign: sol.t_ign, phat: sol.phat, hhat: sol.hhat },
    ARRIVAL: { t_P: sol.t_P, rP: sol.rP, vP: sol.vP, th: sol.xArr[0], ph: sol.xArr[1], kind: 'halo', vHalo: vH },
    LAUNCH: { t_launch: opt.t_launch, t_ins: opt.t_ins, az: opt.az, coast: opt.coast, site: 'Kennedy Uzay Merkezi LC-39B (28.5729°K, 80.6490°B)' },
    HALO: { preset: hc.preset, name: preset.name, revs: hc.revs, T: Ts, stats: st, stability: orb.stability,
      patches: ref.patches, tNri: sol.t_P, tDep: dep.tD, depFrom: dep.opt },
    DEP: { t: dep.tD, dv: sub(dep.v0, dep.vD), tP2, rP2: dep.tgt.r, vP2: dep.tgt.v, h: dep.tgt.h, uP: dep.uP, beta: dep.beta, from: dep.opt },
    LLO: { tP: tP2, n: dep.tgt.h },
    t_L: tL, inc: incT, label: E.utcString(opt.t_launch),
    DV: { TLI: sol.dvTli * 1000, NRI: nri * 1000, SK: skRes * 1000, DEP: dep.dv1 * 1000, LLOI: dep.dv2 * 1000, DOI: doiDv(K) * 1000, PDI: PDI_DV * 1000 },
  };
}
// Nelder–Mead'in üreteç sürümü (her değerlendirmede yield)
function* nelderMeadGen(f, x0, steps, { maxEval = 80, tol = 1e-3 } = {}) {
  const n = x0.length; let pts = [x0.slice()];
  for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += steps[i]; pts.push(p); }
  let vals = []; for (const p of pts) { vals.push(f(p)); yield; }
  let ev = n + 1;
  const F = (x) => { ev++; return f(x); };
  while (ev < maxEval) {
    const idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]); pts = idx.map((i) => pts[i]); vals = idx.map((i) => vals[i]);
    if (Math.abs(vals[n] - vals[0]) < tol) break;
    const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;
    const at = (k) => c.map((cj, j) => cj + k * (pts[n][j] - cj));
    const xr = at(-1), fr = F(xr); yield;
    if (fr < vals[0]) { const xe = at(-2), fe = F(xe); yield; if (fe < fr) { pts[n] = xe; vals[n] = fe; } else { pts[n] = xr; vals[n] = fr; } }
    else if (fr < vals[n - 1]) { pts[n] = xr; vals[n] = fr; }
    else {
      const xc = fr < vals[n] ? at(-0.5) : at(0.5), fc = F(xc); yield;
      if (fc < Math.min(fr, vals[n])) { pts[n] = xc; vals[n] = fc; }
      else { for (let i = 1; i <= n; i++) { pts[i] = pts[i].map((x, j) => pts[0][j] + 0.5 * (x - pts[0][j])); vals[i] = F(pts[i]); yield; } }
    }
  }
  const i0 = vals.indexOf(Math.min(...vals));
  return { x: pts[i0], f: vals[i0], evals: ev };
}
export { nelderMead };
// test/deneme için iç işlevler
export const __internals = { ctx, scanBack, solveBack, back, lambert, shootImpulse, planeBasis, lloState, designAt, parkState, flyTli };
