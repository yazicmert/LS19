// Önleme görevi (saf; DOM yok, Node'da sınanır: test/test_intercept.js): Dünya'dan asteroide giden kinetik çarpıcının fırlatma penceresi (porkchop).
//   Her (fırlatma günü, uçuş süresi) için Güneş merkezli iki cisimli Lambert yörüngesi: Dünya'nın o günkü konumundan asteroidin varış günündeki konumuna.
//   Kalkış: v∞ = v₁ − v⊕, C3 = |v∞|² (roketin bu enerjide taşıyabileceği yük: rockets.js › c3Capacity). Varış: çarpıcının asteroide göre hızı U = v₂ − v_ast.
//   Momentum aktarımı (başa baş çarpma, yüzey normali U boyunca kabulü): Δv = β·m·U / (M + m) — yönü çarpma hızının yönüdür, asteroidin yörünge yönü değil.
//   Etki: yakın geçişte B-düzlemindeki kayma = |S(t_varış)·Δv|, S = J·Φ(CA, t)[:, 3:6] (deflectwork.js, durum geçiş matrisi).
// Sınırlar (belgede): Dünya'nın çekim kuyusundan çıkış ve fırlatma yerinin enlemine göre kalkış asimptotu sapması (DLA) modellenmez; tek tur; ara manevra yok.
import { lambert } from './lambert.js';
import { cross, norm, sub, scale } from './vec3.js';

export const GM_SUN = 132712440041.279419;

// o: { L: kalkış anları (s), K: varış örgüsü (s, artan), kOf(i, j) → varış örgüsü indisi, nT,
//      earth(i) → [r, v] (Güneş merkezli, km, km/s), ast(k) → [r, v], S(k) → 2×3 (km kayma / (km/s)) ya da null,
//      cap(C3) → kg ya da null, beta, M (kg), c3Max }
// Dönüş: { nL, nT, C3, U, m, shift (Float64Array nL·nT; NaN: çözüm yok), best }
export function porkchop(o) {
  const nL = o.L.length, nT = o.nT, N = nL * nT;
  const C3 = new Float64Array(N).fill(NaN), U = new Float64Array(N).fill(NaN), m = new Float64Array(N).fill(NaN), shift = new Float64Array(N).fill(NaN);
  let best = null;
  for (let i = 0; i < nL; i++) {
    const [rE, vE] = o.earth(i), h = cross(rE, vE);
    for (let j = 0; j < nT; j++) {
      const k = o.kOf(i, j); if (k == null || k < 0 || k >= o.K.length) continue;
      const tof = o.K[k] - o.L[i]; if (!(tof > 0)) continue;
      const [rA, vA] = o.ast(k), sol = lambert(rE, rA, tof, GM_SUN, h); if (!sol) continue;
      const vinf = sub(sol.v1, vE), c3 = vinf[0] ** 2 + vinf[1] ** 2 + vinf[2] ** 2;
      if (!(c3 <= (o.c3Max ?? 200))) continue;
      const u = sub(sol.v2, vA), un = norm(u), mass = o.cap ? o.cap(c3) : o.m0;
      const n = i * nT + j; C3[n] = c3; U[n] = un;
      if (!(mass > 0)) continue;
      m[n] = mass;
      const dv = o.beta * mass * un / (o.M + mass), uh = scale(u, 1 / un), Sk = o.S ? o.S(k) : null;
      if (Sk) {
        const sx = Sk[0][0] * uh[0] + Sk[0][1] * uh[1] + Sk[0][2] * uh[2], sz = Sk[1][0] * uh[0] + Sk[1][1] * uh[1] + Sk[1][2] * uh[2];
        shift[n] = Math.hypot(sx, sz) * dv;
        if (!best || shift[n] > best.shift) best = { i, j, k, n, etL: o.L[i], etA: o.K[k], tofDays: tof / 86400, C3: c3, vinf: Math.sqrt(c3), U: un, uDir: uh, m: mass, dvMps: dv * 1000, shift: shift[n] };
      }
    }
  }
  return { nL, nT, C3, U, m, shift, best };
}
// tek bir aktarım (doğrulama ve ayrıntı için): kalkış ve varış durumlarından C3, U
export function transfer(rE, vE, rA, vA, tof) {
  const sol = lambert(rE, rA, tof, GM_SUN, cross(rE, vE)); if (!sol) return null;
  const vinf = sub(sol.v1, vE), u = sub(sol.v2, vA);
  return { C3: vinf[0] ** 2 + vinf[1] ** 2 + vinf[2] ** 2, vinf, U: norm(u), u, v1: sol.v1, v2: sol.v2 };
}
