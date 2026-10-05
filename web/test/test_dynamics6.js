// 6 serbestlik dereceli (6-DOF) yönelim dinamiği doğrulaması (Node 20+): cd web && node test/test_dynamics6.js
//  1) Kütle özellikleri: kaba kuvvet (hacim hücreleri) ile kütle merkezi ve eylemsizlik tensörü; paralel eksen; yakıt azaldıkça davranış
//  2) Rijit cisim integratörü: sabit tork (kesin), torksuz simetrik topaç (analitik), asimetrik gövdede açısal momentum ve enerji korunumu, RK4 yakınsama derecesi, kuaterniyon normu,
//     kuaterniyon kinematiği (q̇ = ½ q⊗ω)
//  3) Gravite gradyanı: çubuk gövdenin yörüngede salınım frekansı = n·√(3(It−Iz)/It) (bağımsız kuram)
//  4) Denetleyici ve aktüatörler (yalnız dönme; çıplak Dyn6): eksen kaydırma süresi ↔ zaman-eniyi alt sınır, hız ve tork sınırları, aşımsız oturma, RCS yakıtı ↔ darbe,
//     açısal momentum bilançosu (∫τ dt = ΔL), gimbal açı/hız sınırı, itki geometrisi (r×F), kırpma (kütle merkezi ofseti) = c/ℓ, RCS bitince serbest dönme
//  5) Propagator: yönelimsiz ile süzülmede birebir, itki gerçek eksen boyunca, denetim periyodu inceltilince sonuç tutarlılığı
//  6) Tam görev (Apollo, NRHO, L1; tek/iki kademe; ZEM, dengeli, serbest): yumuşak temas, ateşlemede itki vektörü hizası, hız/gimbal/tork sınırları, RCS bütçesi, q ↔ ω tutarlılığı, ayrılan kademelerin serbest dönmesi
//  7) Elle uçuş: itkisiz ters yöne dönüş (RCS), itkili dönüşte itki gerçek eksen boyunca
import fs from 'fs';
import * as E from '../js/engine.js';
import * as EO from '../js/earth.js';
import { qMul, qRot, qConj, qAngle, qAxisAngle, qNormalize, vAngle, Z_AXIS, D2R } from '../js/attitude.js';
import { massProps, stageSpec, rk4Rot, freeRot, ggTorque, angMomentum, rotEnergy, ROLES, Z_FEET, GAP } from '../js/rigidbody.js';
import { Dyn6, CTL } from '../js/attctl.js';
import { makeLive } from '../js/live.js';
import { Mission, twoStageDesign } from '../js/mission.js';
import { dvFromEvents } from '../js/dvbudget.js';
import { initConic } from '../js/conic.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const { sub, dot, norm, unit, cross, scale, add } = E;
const DEG = 180 / Math.PI, G0 = 9.80665;
const relErr = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

// ---------------------------------------------------------------- 1) kütle özellikleri
{
  // bağımsız kaba kuvvet: silindirleri (z ekseni, [z0, z0+L], yarıçap R) hücrelere böl; kütle merkezi ve tensör (tam 3×3) toplanır
  const cells = (m, R, L, z0, nz = 100, nr = 24, nt = 16) => {
    const out = []; let V = 0; const cs = [];
    for (let i = 0; i < nz; i++) for (let j = 0; j < nr; j++) {
      const z = z0 + (i + 0.5) * L / nz, r0 = j * R / nr, r1 = (j + 1) * R / nr, rm = Math.sqrt((r0 * r0 + r1 * r1) / 2), dv = Math.PI * (r1 * r1 - r0 * r0) * L / nz;   // dv: halka hacmi; rm: kare ortalama yarıçap (Σ m r² halka için kesin)
      for (let k = 0; k < nt; k++) { const th = (k + 0.5) * 2 * Math.PI / nt; cs.push([rm * Math.cos(th), rm * Math.sin(th), z, dv / nt]); V += dv / nt; }
    }
    for (const c of cs) out.push([c[0], c[1], c[2], (m * c[3]) / V]);
    return out;
  };
  const tensor = (pts) => {
    let M = 0, cz = 0; for (const p of pts) { M += p[3]; cz += p[3] * p[2]; } cz /= M;
    let Ix = 0, Iy = 0, Iz = 0, Ixy = 0, Ixz = 0, Iyz = 0;
    for (const [x, y, z0, m] of pts) { const z = z0 - cz; Ix += m * (y * y + z * z); Iy += m * (x * x + z * z); Iz += m * (x * x + y * y); Ixy -= m * x * y; Ixz -= m * x * z; Iyz -= m * y * z; }
    return { M, cz, I: [Ix, Iy, Iz], off: [Ixy, Ixz, Iyz] };
  };
  const stagesOf = (names) => names.map((n) => (n === 'tli' ? { name: 'TLI kademesi', dry: 2300, prop: 6200, T: 100, isp: 450 } : n === 'orb' ? { name: 'Ay yörünge kademesi', dry: 380, prop: 1500, T: 16, isp: 320 } : { name: 'İniş aracı', dry: 1300, prop: 2300, T: 16, isp: 320 }));
  const build = (names, k, propNow) => {                                                    // Vehicle gibi: prop0 başlangıç yakıtı, etkin kademede güncel yakıt
    const v = new E.Vehicle(stagesOf(names)); if (propNow != null) v.stages[k].prop = propNow; v.k = k; return v;
  };
  // yığının bileşen noktaları (massProps ile aynı geometri, bağımsız hücre toplamı)
  const pointsOf = (veh) => {
    const S = veh.stages, n = S.length; let za = Z_FEET; const pts = [];
    const lay = []; for (let j = n - 1; j >= veh.k; j--) { const sp = stageSpec(S[j]); if (j < n - 1) za = za - GAP - sp.len; lay[j] = za; }
    for (let j = veh.k; j < n; j++) {
      const sp = stageSpec(S[j]), st = S[j], z0 = lay[j];
      for (const c of cells(st.dry, sp.rad, sp.len, z0 + sp.cg - 0.5 * sp.len)) pts.push(c);          // kuru gövde: merkezi kuru kütle merkezinde (cg) olan düzgün silindir
      if (st.prop > 0) { const f = Math.min(1, st.prop / st.prop0), Lc = f * sp.tankLen; for (const c of cells(st.prop, sp.tankRad, Lc, z0 + sp.tankAft)) pts.push(c); }
    }
    return pts;
  };
  // (a) tek kademe, (b) iki kademe, (c) üç kademe; (d) yakıt yarı dolu
  for (const [label, names, k, pn] of [['iniş aracı (dolu)', ['lander'], 0, null], ['iniş aracı (yakıt %30)', ['lander'], 0, 690], ['TLI + iniş aracı', ['tli', 'lander'], 0, null], ['TLI + Ay yörünge + iniş', ['tli', 'orb', 'lander'], 0, null], ['Ay yörünge + iniş (yakıt %40)', ['tli', 'orb', 'lander'], 1, 600]]) {
    const veh = build(names, k, pn), mp = massProps(veh.stages, veh.k), ref = tensor(pointsOf(veh));
    const eI = [0, 1, 2].map((i) => relErr(mp.I[i], ref.I[i])), eM = relErr(mp.m, veh.mass()), eC = Math.abs(mp.zCg - ref.cz);
    check(`kütle özellikleri (${label}): kütle = Vehicle.mass(), kütle merkezi ve I kaba kuvvetle uyuşur`, eM < 1e-12 && eC < 2e-3 && Math.max(...eI) < 3e-3 && Math.max(...ref.off.map(Math.abs)) < 1e-6 * ref.I[0],
      `m ${mp.m.toFixed(1)} kg, zCg ${mp.zCg.toFixed(3)} m (fark ${(eC * 1000).toFixed(2)} mm), I ${mp.I.map((x) => x.toFixed(0)).join('/')} kg·m² (bağıl fark en çok ${Math.max(...eI).toExponential(1)})`);
  }
  // yakıt azalırken: kütle azalır, yakıt sütunu kısalır (kütle merkezi tankın kıçına doğru çökmüş sütunun merkezine göre değişir), I > 0 ve gimbal kolu pozitif
  { let prev = Infinity, ok = true; const veh = build(['lander'], 0); for (let f = 1; f >= 0.05; f -= 0.05) { veh.stages[0].prop = f * veh.stages[0].prop0; const mp = massProps(veh.stages, 0); if (!(mp.m < prev) || !(mp.I[0] > 0 && mp.I[2] > 0 && mp.ell > 0)) ok = false; prev = mp.m; }
    check('yakıt azalırken kütle tekdüze azalır, eylemsizlik pozitif, kütle merkezi gimbalin üstünde (ℓ > 0)', ok); }
}

// ---------------------------------------------------------------- 2) rijit cisim integratörü
{
  // sabit tork, ana eksen: ω = τt/I, açı = ½τt²/I
  const I = [4000, 4000, 2500], tau = [0, 30, 0], T = 20; let s = { q: [0, 0, 0, 1], w: [0, 0, 0] };
  for (let i = 0; i < 400; i++) s = rk4Rot(s.q, s.w, I, tau, T / 400);
  const wE = (tau[1] * T) / I[1], aE = 0.5 * tau[1] * T * T / I[1], ang = qAngle([0, 0, 0, 1], s.q);
  check('sabit tork (ana eksen): ω = τt/I ve açı = ½τt²/I kesin', relErr(s.w[1], wE) < 1e-12 && relErr(ang, aE) < 1e-12 && Math.abs(s.w[0]) < 1e-14, `ω ${(s.w[1] * DEG).toFixed(4)}°/s, açı ${(ang * DEG).toFixed(3)}°`);
  // torksuz simetrik topaç (Ix = Iy = It, Iz): ω_z sabit, enine bileşen Ω = (Iz−It)/It·ω_z ile döner: bağımsız kapalı çözüm
  const It = 5000, Iz = 1800, w0 = [0.03, 0.01, 0.2], Om = ((Iz - It) / It) * w0[2];
  s = { q: [0, 0, 0, 1], w: w0.slice() }; const Tt = 300, N = 6000, h = Tt / N;
  for (let i = 0; i < N; i++) s = rk4Rot(s.q, s.w, [It, It, Iz], [0, 0, 0], h);
  const wxE = w0[0] * Math.cos(Om * Tt) - w0[1] * Math.sin(Om * Tt), wyE = w0[0] * Math.sin(Om * Tt) + w0[1] * Math.cos(Om * Tt);
  check('torksuz simetrik topaç: ω_z sabit, enine ω Ω = (Iz−It)ω_z/It ile döner (kapalı çözüm)', Math.abs(s.w[0] - wxE) < 1e-10 && Math.abs(s.w[1] - wyE) < 1e-10 && Math.abs(s.w[2] - w0[2]) < 1e-12,
    `Ω ${(Om * DEG).toFixed(3)}°/s, 300 s sonra Δω_x ${Math.abs(s.w[0] - wxE).toExponential(1)}, Δω_y ${Math.abs(s.w[1] - wyE).toExponential(1)} rad/s`);
  // asimetrik gövde (ara eksen çevresinde devrilme): açısal momentum vektörü (eylemsiz) ve enerji korunur
  const Ia = [3000, 5200, 7800]; let q = qNormalize([0.1, -0.2, 0.3, 0.9]), w = [0.05, 0.4, 0.03]; const L0 = angMomentum(q, w, Ia), E0 = rotEnergy(w, Ia);
  let maxL = 0, maxE = 0, maxQ = 0; for (let i = 0; i < 24000; i++) { const r = rk4Rot(q, w, Ia, [0, 0, 0], 0.025); q = r.q; w = r.w; if (i % 400 === 0) { const L = angMomentum(q, w, Ia); maxL = Math.max(maxL, norm(sub(L, L0)) / norm(L0)); maxE = Math.max(maxE, Math.abs(rotEnergy(w, Ia) / E0 - 1)); } maxQ = Math.max(maxQ, Math.abs(Math.hypot(...q) - 1)); }
  check('asimetrik gövde 600 s (ara eksen devrilmesi): eylemsiz açısal momentum ve enerji korunur, q birim', maxL < 1e-9 && maxE < 1e-9 && maxQ < 1e-13, `|ΔL|/|L| ${maxL.toExponential(1)}, ΔE/E ${maxE.toExponential(1)}, ||q|−1| ${maxQ.toExponential(1)}`);
  // RK4 yakınsama derecesi: aynı senaryo, adım yarılanınca hata ~16 kat azalır
  const run = (hh) => { let r = { q: qNormalize([0.1, -0.2, 0.3, 0.9]), w: [0.05, 0.4, 0.03] }; for (let i = 0; i < Math.round(60 / hh); i++) r = rk4Rot(r.q, r.w, Ia, [10, -5, 3], hh); return r; };
  const ref = run(0.0015625), e = [0.2, 0.1, 0.05].map((hh) => { const r = run(hh); return Math.hypot(...sub(r.w, ref.w)) + qAngle(r.q, ref.q); });
  const ord = [Math.log2(e[0] / e[1]), Math.log2(e[1] / e[2])];
  check('RK4 yakınsama derecesi: adım yarılanınca hata ~2⁴ kat azalır', ord[0] > 3.6 && ord[1] > 3.6 && ord[0] < 4.6 && ord[1] < 4.6, `h 0,2→0,1→0,05 s: hata ${e.map((x) => x.toExponential(1)).join(' → ')}, derece ${ord.map((x) => x.toFixed(2)).join(', ')}`);
  // kuaterniyon kinematiği: dq/dt = ½ q ⊗ [ω, 0] — q'dan sonlu farkla bulunan açısal hız, bildirilen ω ile aynı (gövde çerçevesi)
  let qq = qNormalize([0.3, 0.1, -0.5, 0.8]), ww = [0.03, -0.02, 0.05], worst = 0;
  for (let i = 0; i < 200; i++) { const r = rk4Rot(qq, ww, Ia, [2, 1, -1], 0.01), dq = qMul(qConj(qq), r.q), wf = [2 * dq[0] / 0.01, 2 * dq[1] / 0.01, 2 * dq[2] / 0.01], wm = [0, 1, 2].map((k) => 0.5 * (ww[k] + r.w[k])); worst = Math.max(worst, norm(sub(wf, wm)) / norm(wm)); qq = r.q; ww = r.w; }
  check('kuaterniyon kinematiği: q\'nun sonlu fark dönme hızı (gövde) = ω', worst < 2e-3, `en büyük bağıl fark ${worst.toExponential(1)}`);
  // serbest dönme (debris yardımcısı) = küçük adımlı RK4
  const wd = [0.005, 0.009, 0.003], a = freeRot(qNormalize([0.1, -0.2, 0.3, 0.9]), wd, Ia, 3600, 5), b = (() => { let r = { q: qNormalize([0.1, -0.2, 0.3, 0.9]), w: wd.slice() }; for (let i = 0; i < 36000; i++) r = rk4Rot(r.q, r.w, Ia, [0, 0, 0], 0.1); return r; })();
  check('freeRot (ayrılan kademe, ω ~ 0,5°/s): 1 saatlik süreyi 5 s RK4 adımlarına böler, 0,1 s adımlı referansla aynı', qAngle(a.q, b.q) < 1e-5 && norm(sub(a.w, b.w)) < 1e-8, `fark ${qAngle(a.q, b.q).toExponential(1)} rad, ω farkı ${norm(sub(a.w, b.w)).toExponential(1)} rad/s`);
}

// ---------------------------------------------------------------- 3) gravite gradyanı: çubuk gövdenin salınım frekansı
{
  // dairesel yörünge: r̂(t) = [cos nt, sin nt, 0]; yerel dikeyde (r̂) duran, simetri ekseni z olan çubuk gövde (Iz < It): yunuslama titreşimi (yörünge normali etrafında)
  // frekansı n√(3(It−Iz)/It). Gövde z ekseni r̂'ya hizalı başlar ve 2° saptırılır; yörünge çerçevesine göre hız sıfır.
  const mu = E.MU_E, a = 7000, n = Math.sqrt(mu / a ** 3), It = 5000, Iz = 1000, I = [It, It, Iz], dt = 0.5;
  const axisFrom = (zAxis, ref) => { const z = unit(zAxis), x = unit(sub(ref, scale(z, dot(ref, z)))), y = cross(z, x); const m = [x, y, z]; /* sütunlar */
    const m11 = x[0], m12 = y[0], m13 = z[0], m21 = x[1], m22 = y[1], m23 = z[1], m31 = x[2], m32 = y[2], m33 = z[2], tr = m11 + m22 + m33; const s = 0.5 / Math.sqrt(tr + 1); return [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s]; };
  const tilt = 2 * D2R; let q = axisFrom([Math.cos(tilt), Math.sin(tilt), 0], [0, 0, 1]);
  let w = qRot(qConj(q), [0, 0, n]);                                                         // yörünge çerçevesine göre durağan: gövde ω = Rᵀ·(n ẑ)
  const th = [], tt = []; let t = 0;
  for (let i = 0; i < Math.round(8 * 2 * Math.PI / n / dt); i++) {
    const rh = [Math.cos(n * t), Math.sin(n * t), 0], tau = ggTorque(qRot(qConj(q), rh), 3 * mu / a ** 3, I), r = rk4Rot(q, w, I, tau, dt); q = r.q; w = r.w; t += dt;
    const ax = qRot(q, Z_AXIS), rh2 = [Math.cos(n * t), Math.sin(n * t), 0], ph = [-Math.sin(n * t), Math.cos(n * t), 0];                 // çubuk ekseninin yerel dikeyden sapması (yörünge düzleminde)
    th.push(Math.atan2(dot(ax, ph), dot(ax, rh2))); tt.push(t);
  }
  const zc = []; for (let i = 1; i < th.length; i++) if (th[i - 1] < 0 && th[i] >= 0) zc.push(tt[i - 1] + (tt[i] - tt[i - 1]) * (-th[i - 1]) / (th[i] - th[i - 1]));      // yukarı sıfır geçişleri
  const per = (zc[zc.length - 1] - zc[0]) / (zc.length - 1), perE = 2 * Math.PI / (n * Math.sqrt(3 * (It - Iz) / It)), amp = Math.max(...th.map(Math.abs));
  check('gravite gradyanı: çubuk gövde yerel dikeyde titreşir, dönem = 2π/(n√(3(It−Iz)/It))', zc.length >= 5 && relErr(per, perE) < 5e-3 && amp < tilt * 1.05, `dönem ${per.toFixed(1)} s (kuram ${perE.toFixed(1)} s, fark %${(100 * relErr(per, perE)).toFixed(3)}), genlik ${(amp * DEG).toFixed(3)}°`);
}

// ---------------------------------------------------------------- 4) denetleyici ve aktüatörler (çıplak Dyn6: yalnız dönme, yerçekimi yok)
const mkStages = (kind) => (kind === 'tli' ? [{ name: 'TLI kademesi', dry: 2300, prop: 6200, T: 100, isp: 450, thr_min: 1 }, { name: 'İniş aracı', dry: 1300, prop: 2300, T: 16, isp: 320, thr_min: 0.1 }] : [{ name: 'İniş aracı', dry: 1300, prop: 2300, T: 16, isp: 320, thr_min: 0.1 }]);
function slew(kind, angDeg, thrFrac = 0, tEnd = 150, o = {}) {
  const veh = new E.Vehicle(mkStages(kind)), st = veh.active; if (o.mutate) o.mutate(veh);
  const D = new Dyn6([1, 0, 0], [0, 0, 1]), a = angDeg * D2R, cmd = [Math.cos(a), 0, Math.sin(a)], h = o.h || veh.active && stageSpec(st).ctl.dt;
  const mp0 = massProps(veh.stages, 0), sp = mp0.sp, T = thrFrac * st.T, rec = { maxW: 0, maxTau: [0, 0, 0], tSet: null, maxErrAfter: 0, jt: [0, 0, 0], dm0: st.dry, maxG: 0, maxGrate: 0, impulse: [0, 0, 0], L0: null, t: 0 };
  let t = 0, g0 = [0, 0], sumDm = 0, inBand = false; const Lbody0 = angMomentum(D.q, D.w, mp0.I);
  for (let i = 0; i < Math.round(tEnd / h); i++) {
    const mp = massProps(veh.stages, 0), P = D.plan({ cmd, t, T, mp, rcsLeft: Math.max(0, sp.rcs.prop - (st.rcsUsed || 0)), fast: !!o.fast });
    if (P.hold) { D.holdCommit(P, cmd, h, t + h); } else {
      const R = D.integrate(P, h, o.gg ? { gg: o.gg } : {}); rec.impulse = [0, 1, 2].map((k) => rec.impulse[k] + R.tau[k] * h);
      sumDm += R.dm; const g1 = R.g1; rec.maxGrate = Math.max(rec.maxGrate, Math.hypot(g1[0] - D.g[0], g1[1] - D.g[1]) / h);
      D.commit(R, P, st, h, t); rec.maxTau = [0, 1, 2].map((k) => Math.max(rec.maxTau[k], Math.abs(R.tauRcs[k])));
    }
    t += h; rec.maxW = Math.max(rec.maxW, norm(D.w)); rec.maxG = Math.max(rec.maxG, Math.hypot(...D.g));
    const err = D.err; if (rec.tSet === null && err < 0.5 * D2R) { rec.tSet = t; inBand = true; } if (inBand) rec.maxErrAfter = Math.max(rec.maxErrAfter, err);
  }
  return { D, st, veh, rec, sumDm, mp0, sp, t, finErr: D.err, Lbody0 };
}
{
  // (a) zaman-eniyi alt sınır: yetki α = τ_maks/I (başlangıç), hız sınırı ω_s: t_min = θ/ω_s + ω_s/α (θ büyükse) ya da 2√(θ/α)
  for (const [kind, name, angs] of [['lander', 'iniş aracı (RCS)', [20, 90, 180]], ['tli', 'TLI yığını (RCS)', [20, 90]]]) {
    const rows = []; let ok = true, okLim = true;
    for (const ang of angs) {
      const r = slew(kind, ang, 0, 400), sp = r.sp, mp = r.mp0, alpha = (2 * sp.rcs.n[1] * sp.rcs.F * 1000 * sp.rcs.arm[1]) / mp.I[1], ws = Math.min(sp.ctl.wMax, sp.ctl.wCruise) * D2R, th = ang * D2R;
      const tMin = th > ws * ws / alpha ? th / ws + ws / alpha : 2 * Math.sqrt(th / alpha), ratio = r.rec.tSet / tMin;
      if (!(r.rec.tSet != null && ratio >= 0.999 && ratio < 1.9)) ok = false;
      if (!(r.rec.maxW <= ws * 1.05 && r.rec.maxErrAfter < 1.0 * D2R && r.finErr < 0.5 * D2R && r.rec.maxTau.every((x, k) => x <= 2 * sp.rcs.n[k] * sp.rcs.F * 1000 * sp.rcs.arm[k] * (1 + 1e-9)))) okLim = false;
      rows.push(`${ang}°: ${r.rec.tSet && r.rec.tSet.toFixed(1)} s (alt sınır ${tMin.toFixed(1)}, oran ${ratio.toFixed(2)}), azami ω ${(r.rec.maxW * DEG).toFixed(2)}°/s`);
    }
    check(`${name}: eksen kaydırma süresi zaman-eniyi alt sınırın 1–1,9 katı (fizikten hızlı olamaz, verimsiz değil)`, ok, rows.join(' | '));
    check(`${name}: dönme hızı sınırı (seyir), RCS tork yetkisi aşılmaz, 0,5° bandına girdikten sonra 1°'yi aşmaz (aşım yok), son hata < 0,5°`, okLim);
  }
  // (b) RCS yakıtı: tüketim = Σ|τ|·h/(kol·Isp·g₀) (darbe bilançosu) ve kütle kuru kütleden düşer
  { const r = slew('lander', 90, 0, 120), sp = r.sp, cEx = sp.rcs.isp * G0;
    const used = r.st.rcsUsed, dryDrop = 1300 - r.st.dry;
    // en küçük kol/yetkiyle sınır: ideal çift (kol 1,5 m) için angular impulse = I·Δω; yarı yarıya hızlanma + yavaşlama: m ≈ I·ω/(kol·c)·2
    const mpr = r.mp0, ideal = (2 * mpr.I[1] * Math.min(sp.ctl.wMax, sp.ctl.wCruise) * D2R) / (sp.rcs.arm[1] * cEx);
    check('RCS yakıtı: kuru kütleden düşer (Δm = tüketim), 90° dönmede ideal (hızlan + yavaşla) tüketimin 1–2,5 katı', Math.abs(used - r.sumDm) < 1e-9 && Math.abs(dryDrop - used) < 1e-9 && used > 0.95 * ideal && used < 2.5 * ideal, `tüketim ${used.toFixed(3)} kg, ideal ${ideal.toFixed(3)} kg, kuru kütle −${dryDrop.toFixed(3)} kg`); }
  // (c) açısal momentum bilançosu: ∫R(q)·τ dt = ΔL (eylemsiz). Yerçekimi/gg yok. Hızlanırken (L büyük) ve durduktan sonra (L ≈ 0) karşılaştırılır
  { const veh = new E.Vehicle(mkStages('lander')), st = veh.active, D = new Dyn6([1, 0, 0], [0, 0, 1]), cmd = [0, 0.3, 0.9539392014169457], h = 0.05, mp = massProps(veh.stages, 0);
    let t = 0, Lacc = [0, 0, 0], Lpeak = 0; const L0 = angMomentum(D.q, D.w, mp.I), rows = []; let okAll = true, nDyn = 0;
    for (let i = 1; i <= 600; i++) {
      const P = D.plan({ cmd, t, T: 0, mp, rcsLeft: 99, fast: true });
      if (P.hold) D.holdCommit(P, cmd, h, t + h);
      else { const R = D.integrate(P, h, {}), qm = rk4Rot(D.q, D.w, mp.I, R.tau, h / 2).q; Lacc = add(Lacc, scale(qRot(qm, R.tau), h)); D.commit(R, P, st, h, t); nDyn++; }   // torku adım ortası yönelimiyle eylemsize al (orta nokta kuralı)
      t += h; Lpeak = Math.max(Lpeak, norm(angMomentum(D.q, D.w, mp.I)));
      if (i === 100 || i === 160 || i === 600) {                                                   // 5 s (hızlanma bitti, seyir), 8 s (yavaşlama), 30 s (durmuş)
        const dL = sub(angMomentum(D.q, D.w, mp.I), L0), err = norm(sub(dL, Lacc)) / Math.max(Lpeak, 1), holdBound = (mp.I[1] * CTL.HOLD_W) / Math.max(Lpeak, 1);     // tutma kipine girişte ≤ HOLD_W kalan hız yok sayılır
        rows.push(`${(i * h).toFixed(0)} s (${D.mode}): |ΔL| ${norm(dL).toFixed(0)}, |∫τ| ${norm(Lacc).toFixed(0)}, fark ${err.toExponential(1)}`);
        if (!(err < (D.mode === 'hold' ? holdBound : 2e-3))) okAll = false; if (i === 100 && !(norm(dL) > 500)) okAll = false;
      }
    }
    check('açısal momentum bilançosu: ∫R(q)·τ dt = ΔL (eylemsiz); hızlanırken 2e-3\'ten iyi, tutma kipine geçişte yok sayılan ≤ 0,3°/s kalan hız kadar fark', okAll && Lpeak > 800 && nDyn > 100 && D.err < 0.5 * D2R, rows.join(' | ') + `, en büyük |L| ${Lpeak.toFixed(0)} N·m·s`); }
  // (d) gimbal: açı ve hız sınırı, birinci derece gecikme; itki geometrisi r×F; kırpma = c/ℓ − sapma
  { const veh = new E.Vehicle(mkStages('lander')), st = veh.active, mp = massProps(veh.stages, 0), sp = mp.sp, D = new Dyn6([0, 0, 1], [1, 0, 0]);
    // gimbal basamak komutu (+8°): hız ve açı sınırı; sonra geometriyi bağımsız hesapla
    D.gi = [0.2, -0.2]; const P0 = D.plan({ cmd: [0, 0, 1], t: 0, T: 8, mp, rcsLeft: 30 }); P0.gcmd = [Math.tan(8 * D2R), 0]; P0.tauRcs = [0, 0, 0];
    let g = D.g.slice(), maxRate = 0, maxG = 0, t = 0;
    for (let i = 0; i < 100; i++) { const R = D.integrate(P0, 0.05, {}); maxRate = Math.max(maxRate, Math.hypot(R.g1[0] - g[0], R.g1[1] - g[1]) / 0.05); maxG = Math.max(maxG, Math.hypot(...R.g1)); D.g = R.g1.slice(); g = R.g1; t += 0.05; }
    check('gimbal: açı sınırı (±5°) ve hız sınırı aşılmaz, +8° komutla sınıra oturur', maxG <= Math.tan(sp.tvc.max * D2R) * (1 + 1e-12) && maxRate <= sp.tvc.rate * D2R * (1 + 1e-9) && maxG > Math.tan(sp.tvc.max * D2R) * 0.999,
      `azami açı ${(Math.atan(maxG) * DEG).toFixed(3)}°, azami hız ${(maxRate * DEG).toFixed(1)}°/s (sınır ${sp.tvc.rate}°/s)`);
    // itki geometrisi: q = birim, gimbal (gx, gy), sapma ve kütle merkezi ofseti → u = R·d, τ = r × F
    const D2 = new Dyn6([0, 0, 1], [1, 0, 0]); D2.g = [0.03, -0.02]; const P1 = D2.plan({ cmd: [0, 0, 1], t: 0, T: 10, mp, rcsLeft: 30 }); P1.gcmd = D2.g.slice(); P1.tauRcs = [0, 0, 0];
    const R1 = D2.integrate(P1, 0.01, {}), tx = D2.g[0] + sp.align[0], ty = D2.g[1] + sp.align[1], dn = Math.sqrt(1 + tx * tx + ty * ty), d = [tx / dn, ty / dn, 1 / dn];
    const F = scale(d, 10000), tauE = cross([-sp.cgOff[0], -sp.cgOff[1], -mp.ell], F), uE = qRot(D2.q, d);
    check('itki geometrisi: gimbal + sapma → kuvvet yönü, τ = r×F (kütle merkezi ofsetli), kuvvet yönü ≈ q·d (adım ortası)', norm(sub(R1.tauTvc, tauE)) < 1e-9 * norm(tauE) && vAngle(R1.u, uE) < 2e-4, `τ ${R1.tauTvc.map((x) => x.toFixed(1)).join(', ')} N·m, yön farkı ${(vAngle(R1.u, uE) * DEG).toExponential(1)}°`);
    // kırpma: sabit yönde, itki açıkken gimbal c/ℓ − sapma'ya yakınsar (torku sıfırlayan itki çizgisi kütle merkezinden geçer)
    const r = slew('lander', 0.0001, 1.0, 40); const mp1 = massProps(r.veh.stages, 0), sp1 = mp1.sp, gE = [sp1.cgOff[0] / mp1.ell - sp1.align[0], sp1.cgOff[1] / mp1.ell - sp1.align[1]], gM = r.D.gi;
    check('kırpma (trim): kararlı durumda gimbal = c/ℓ − sapma (itki çizgisi kütle merkezinden geçer), tork ≈ 0', Math.hypot(gM[0] - gE[0], gM[1] - gE[1]) < 0.05 * Math.hypot(...gE) + 1e-4 && norm(r.D.tq) < 5, `ölçülen (${gM.map((x) => (x * DEG).toFixed(3)).join(', ')})°, kuram (${gE.map((x) => (x * DEG).toFixed(3)).join(', ')})°, kalan tork ${norm(r.D.tq).toFixed(2)} N·m`); }
  // (e) RCS biterse denetim yok: serbest (torksuz) dönme, açısal momentum korunur, adım büyüktür (takılma yok)
  { const veh = new E.Vehicle(mkStages('lander')), st = veh.active, D = new Dyn6([1, 0, 0], [0, 0, 1]); D.w = [0.01, 0.02, -0.005]; st.rcsUsed = 36; st.dry -= 36;
    const mp = massProps(veh.stages, 0), cmd = [0, 1, 0], L0 = angMomentum(D.q, D.w, mp.I); let t = 0, n = 0;
    while (t < 3600 && n < 5000) { const P = D.plan({ cmd, t, T: 0, mp, rcsLeft: 0, fast: false }); if (!P.free) break; const h = 10, R = D.integrate(P, h, {}); D.commit(R, P, st, h, t); t += h; n++; }
    const L1 = angMomentum(D.q, D.w, mp.I);
    check('RCS yakıtı bitince (gimbal yok): denetim yok, torksuz serbest dönme, açısal momentum korunur', n === 360 && D.mode === 'free' && norm(sub(L1, L0)) / norm(L0) < 1e-7 && norm(D.tq) === 0, `${n} adım, mod ${D.mode}, |ΔL|/|L| ${(norm(sub(L1, L0)) / norm(L0)).toExponential(1)}`); }
  // (f) eylemsizlik/ağırlık: aynı komut TLI yığınında (büyük I) daha yavaş, RCS yakıtı ∝ I·ω
  { const a = slew('lander', 90, 0, 400), b = slew('tli', 90, 0, 400);
    check('büyük yığın (TLI + iniş aracı) aynı dönmeyi daha yavaş yapar (I büyük, hız sınırı küçük)', b.rec.tSet > 2 * a.rec.tSet && b.mp0.I[1] > 20 * a.mp0.I[1], `${a.rec.tSet.toFixed(1)} s (I ${a.mp0.I[1].toFixed(0)}) ↔ ${b.rec.tSet.toFixed(1)} s (I ${b.mp0.I[1].toFixed(0)})`); }
  // (g) çevik/seyir: seyirde (fast=false) hız sınırı wCruise, iniş/elle (fast=true) wMax
  { const a = slew('lander', 180, 0, 80, { fast: true }), b = slew('lander', 180, 0, 80, { fast: false });
    check('seyir dönmesi yavaş (wCruise), çevik dönme hızlı (wMax): RCS yakıtı ve süre buna göre', a.rec.maxW > 1.5 * b.rec.maxW && a.rec.tSet < b.rec.tSet && a.st.rcsUsed > b.st.rcsUsed, `çevik ${(a.rec.maxW * DEG).toFixed(1)}°/s ${a.rec.tSet.toFixed(1)} s ${a.st.rcsUsed.toFixed(2)} kg ↔ seyir ${(b.rec.maxW * DEG).toFixed(1)}°/s ${b.rec.tSet.toFixed(1)} s ${b.st.rcsUsed.toFixed(2)} kg`); }
}

// ---------------------------------------------------------------- 5) Propagator
await initConic();
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const SPK = ab(new URL('../data/de440s.bsp', import.meta.url)), PCK = ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url));
const eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url))); EO.loadEarthOrientation(eo);
const ALL = JSON.parse(fs.readFileSync(new URL('../data/designs_default.json', import.meta.url)));
{
  makeLive(SPK, PCK, eo, ALL.tStart);
  const t0 = 1083171.07, rp = E.R_E + 400, vc = Math.sqrt(E.MU_E / rp);
  const veh = () => new E.Vehicle([{ name: 'İniş aracı', dry: 1300, prop: 2300, T: 16, isp: 320, thr_min: 0.1 }]);
  const mk = (att) => { const P = new E.Propagator(new E.State(t0, [rp, 0, 0], [0, vc, 0], 'N'), veh(), 60, 0.5, { nbody: true }); if (att) { P.att = att; P.attCmd = () => [0, 1, 0]; } return P; };
  // (a) süzülme: yarı-durağan tutma yönelimsiz ile aynı yörüngeyi verir
  const A = mk(null), B = mk(new Dyn6([0, 1, 0], [1, 0, 0]));
  A.runUntil(t0 + 3 * 3600); B.runUntil(t0 + 3 * 3600);
  check('3 sa süzülme: 6-DOF (tutma kipi) yönelimsiz ile aynı yörüngeyi verir (itki yok)', norm(sub(A.s.r, B.s.r)) < 1e-9 && norm(sub(A.s.v, B.s.v)) < 1e-12 && B.att.mode === 'hold', `Δr ${norm(sub(A.s.r, B.s.r)).toExponential(1)} km, kip ${B.att.mode}`);
  // (b) hizalı yakış: itki gerçek eksen boyunca (gimbal sapması, kırpma yakınsarken), Δv büyüklüğü roket denklemine uyar
  const C = mk(new Dyn6([0, 1, 0], [1, 0, 0])), N = mk(null); const dir = [0, 1, 0], burn = () => [1.0, dir];
  C.runUntil(t0 + 60, burn); N.runUntil(t0 + 60, burn);
  const dvC = sub(C.s.v, A.s.v), dvN = sub(N.s.v, A.s.v), mdv = (P) => 0;
  const veh0 = veh(), st0 = veh0.active, c = st0.isp * E.G0, m0 = veh0.mass(), dvIdeal = c * Math.log(m0 / (m0 - st0.T / c * 60)) ;
  check('60 s yakış: 6-DOF itkisi roket denklemi Δv\'sine uyar (sayaç) ve yönü komuttan < 1,5° (gimbal kırpması)', Math.abs(C.dvUsed - dvIdeal) / dvIdeal < 1e-3 && vAngle(dvC, dvN) < 1.5 * D2R && relErr(norm(dvC), norm(dvN)) < 0.01,
    `Δv ${(C.dvUsed * 1000).toFixed(3)} m/s (roket ${(dvIdeal * 1000).toFixed(3)}), yön farkı ${(vAngle(dvC, dvN) * DEG).toFixed(3)}°`);
  // (c) denetim periyodunun inceltilmesi: örneklemeli denetimin (ZOH) etkisi ~dt/2 gecikmedir; ayrık kararlar (RCS darbeleri) sonucu pürüzlü kılar,
  //     bu yüzden kesin bir yakınsama derecesi değil, en ince adıma (dt = 6,25 ms) göre hatanın dt ile azalan, sınırlı kalması aranır
  const mk2 = (dt) => { const v = new E.Vehicle([{ name: 'İniş aracı', dry: 1300, prop: 2300, T: 16, isp: 320, thr_min: 0.1, dyn: { ctl: { ...ROLES.lander.ctl, dt } } }]); const P = new E.Propagator(new E.State(t0, [rp, 0, 0], [0, vc, 0], 'N'), v, 60, 0.5, { nbody: true });
    P.att = new Dyn6([0, 1, 0], [1, 0, 0]); P.attCmd = () => (P.s.t < t0 + 5 ? [0, 1, 0] : [0, 0.8, 0.6]); P.runUntil(t0 + 30, () => [1.0, P.attCmd()]); return P; };
  const dts = [0.2, 0.1, 0.05, 0.025, 0.0125, 0.00625], R = dts.map(mk2), ref = R[R.length - 1];
  const eR = R.slice(0, -1).map((P) => norm(sub(P.s.r, ref.s.r)) * 1000), eV = R.slice(0, -1).map((P) => norm(sub(P.s.v, ref.s.v)) * 1000), eA = R.slice(0, -1).map((P) => qAngle(P.att.q, ref.att.q) * DEG);
  check('denetim periyodu inceltilince (30 s tam itkili manevra, 37° dönme): konum hatası dt ile azalır, dt = 0,05 s için yönelim < 0,25°, konum < 3 m, hız < 0,2 m/s',
    eR[0] > eR[2] && eR[2] > eR[4] && eR[2] < 3 && eV[2] < 0.2 && Math.max(...eA) < 0.25 && R.every((P) => P.att.mode === 'dyn'),
    `dt ${dts.slice(0, -1).join('/')}: konum ${eR.map((x) => x.toFixed(1)).join('/')} m, hız ${eV.map((x) => x.toFixed(2)).join('/')} m/s, yönelim ${eA.map((x) => x.toFixed(2)).join('/')}°`);
}

// ---------------------------------------------------------------- 6) tam görev
{
  const prof = (name) => ALL.profiles[name].design;
  const cases = [['APOLLO', 'one', 'zem'], ['APOLLO', 'one', 'opt'], ['APOLLO', 'one', 'free'], ['APOLLO', 'two', 'opt'], ['NRHO', 'two', 'zem'], ['NRHO', 'one', 'opt'], ['L1', 'two', 'free'], ['L1', 'two', 'opt']];
  for (const [name, veh, mode] of cases) {
    const D = veh === 'two' ? twoStageDesign(prof(name)) : prof(name); E.setMoonZone(D.profile === 'HALO' ? 1.25 * D.HALO.stats.raKm : E.SOI_M); makeLive(SPK, PCK, eo, ALL.tStart);
    const M = new Mission({ design: D, landing: mode }); M.P.tLimit = Infinity;
    const rec = { n: 0, maxW: 0, maxG: 0, ign: [], badIgn: [], tauOver: 0, qBad: 0, wMismatch: 0, wCount: 0, down: 0, freeSteps: 0, tLlo: null, lloN: 0, lloMax: -1, lloW: 0, prevCmd: null, cmdMax: 0, n2: 0, w2: 0, errMax: 0 }; let lastThr = 0, prevQ = null, prevW = null, prevT = 0, prevDyn = false;
    M.P.onStep = (P, h, thr) => {
      const a = P.att; rec.n++; const st = M.veh.active, sp = stageSpec(st);
      rec.maxW = Math.max(rec.maxW, norm(a.w) / (sp.ctl.wMax * D2R)); rec.maxG = Math.max(rec.maxG, Math.hypot(...a.g) / Math.tan(sp.tvc.max * D2R)); rec.qBad = Math.max(rec.qBad, Math.abs(Math.hypot(...a.q) - 1));
      if (a.mode === 'free') rec.freeSteps++;
      const auth = [0, 1, 2].map((i) => 2 * sp.rcs.n[i] * sp.rcs.F * 1000 * sp.rcs.arm[i]); if (a.tqRcs.some((x, i) => Math.abs(x) > auth[i] * (1 + 1e-9))) rec.tauOver++;
      if (thr > 0 && lastThr === 0) { const e = P.lastTheta * DEG; rec.ign.push([P.phase, e]); if (e > 1.5 && !/PDI/.test(P.phase)) rec.badIgn.push(P.phase + ' ' + e.toFixed(2)); if (/PDI/.test(P.phase) && e > 12) rec.badIgn.push('PDI ' + e.toFixed(2)); }
      lastThr = thr;
      // q ↔ ω: ardışık iki dinamik adımda q'nun gerçek dönme hızı, bildirilen ω'nın adım ortalaması (tork adım boyunca sabit → ω doğrusal) ile uyuşur
      const dyn = a.mode === 'dyn'; if (dyn && prevDyn && prevQ && h > 1e-6 && Math.abs(P.s.t - prevT - h) < 1e-6) { const dq = qMul(qConj(prevQ), a.q), wf = norm([2 * dq[0] / h, 2 * dq[1] / h, 2 * dq[2] / h]), wm = norm([0, 1, 2].map((k) => 0.5 * (prevW[k] + a.w[k]))); if (wm > 0.02) { rec.wCount++; if (Math.abs(wf - wm) / wm > 0.05) rec.wMismatch++; } }
      prevQ = a.q.slice(); prevW = a.w.slice(); prevT = P.s.t; prevDyn = dyn;
      // Ay yörüngesi süzülmesi (LOI sonrası, DOI öncesi): araç ters yönde kalır; 180° "takla" yok (LOI sonrası ileri dönüp DOI öncesi yine ters dönmek gerekmez)
      if (P.phase === 'AY_YORUNGESI' && thr === 0) { if (rec.tLlo === null) rec.tLlo = P.s.t; if (P.s.t - rec.tLlo > 900) { rec.lloN++; rec.lloMax = Math.max(rec.lloMax, dot(a.axis(), M.prograde(P))); rec.lloW = Math.max(rec.lloW, norm(a.w)); } }
      // iniş: itki komutunun yönü bir denetim adımından ötekine sıçramaz; yaklaşma ve son inişte yönelim sakin
      if (/PDI|YAKLASMA|SON_INIS/.test(P.phase) && P.lastCmd && thr > 0) {
        const c = unit(P.lastCmd); if (rec.prevCmd) rec.cmdMax = Math.max(rec.cmdMax, vAngle(rec.prevCmd, c)); rec.prevCmd = c;
        if (/YAKLASMA|SON_INIS/.test(P.phase)) { rec.n2++; rec.w2 += norm(a.w) ** 2; rec.errMax = Math.max(rec.errMax, P.lastTheta); }
      } else rec.prevCmd = null;
      if (/SON_INIS|YAKLASMA|PDI/.test(P.phase) && P.lastU && thr > 0) { const up = unit(E.sub(P.s.seleno()[0], [0, 0, 0])); if (dot(P.lastU, up) < 0 && P.s.seleno()[0] && E.norm(P.s.seleno()[0]) - 1735.47 < 2) rec.down++; }
    };
    for (;;) { if (M.gen.next().done) break; }
    const R = M.result, used = M.veh.stages.map((s, j) => (s.rcsUsed || 0) / stageSpec(s).rcs.prop), worstUse = Math.max(...used);
    check(`${name} ${veh === 'two' ? 'iki' : 'tek'} kademe ${mode}: yumuşak temas (|dikey| < 1,2, yatay < 1,0 m/s), ateşlemede itki vektörü hizalı (≤ 1,5°; PDI ≤ 12°)`, R.ok && Math.abs(R.v_mps[2]) < 1.2 && Math.hypot(R.v_mps[0], R.v_mps[1]) < 1.0 && rec.badIgn.length === 0,
      `dikey ${R.v_mps[2].toFixed(2)}, yatay ${Math.hypot(R.v_mps[0], R.v_mps[1]).toFixed(2)} m/s, ${rec.ign.length} yakış, en kötü ${Math.max(...rec.ign.map((x) => x[1])).toFixed(2)}° ${rec.badIgn.join(',')}`);
    check(`${name} ${veh === 'two' ? 'iki' : 'tek'} kademe ${mode}: ω ≤ sınır, gimbal ≤ sınır, RCS torku ≤ yetki, q birim, RCS yakıtı ≤ %70 bütçe, denetimsiz adım yok, itki yönelim hatasında aşağı değil`,
      rec.maxW < 1.06 && rec.maxG <= 1 + 1e-9 && rec.tauOver === 0 && rec.qBad < 1e-12 && worstUse < 0.7 && rec.freeSteps === 0 && rec.down === 0,
      `ω/sınır ${rec.maxW.toFixed(3)}, gimbal/sınır ${rec.maxG.toFixed(3)}, RCS bütçe payı ${used.map((x) => (100 * x).toFixed(0) + '%').join('/')}, ${rec.n} adım`);
    check(`${name} ${veh === 'two' ? 'iki' : 'tek'} kademe ${mode}: bildirilen ω (adım ortalaması) = q'nun gerçek dönme hızı (ardışık dinamik adımlarda, ${rec.wCount} örnek, ≤ %5 sapma, aykırı ≤ %0,5)`, rec.wCount > 100 && rec.wMismatch <= 0.005 * rec.wCount, `uyumsuz ${rec.wMismatch}`);
    if (name === 'APOLLO') check(`${name} ${veh === 'two' ? 'iki' : 'tek'} kademe ${mode}: Ay yörüngesi süzülmesinde araç LOI'dan DOI'ya ters yönde kalır (itki ekseni · ileri yön < −0,99: takla yok), dönme hızı ≤ 2°/s (ateşleme öncesi itki vektörü hizalaması ~1°/s'yi aşmaz)`,
      rec.lloN > 100 && rec.lloMax < -0.99 && rec.lloW < 2 * D2R, `${rec.lloN} adım, en büyük itki ekseni · ileri yön ${rec.lloMax.toFixed(4)}, azami dönme hızı ${(rec.lloW * DEG).toFixed(3)}°/s`);
    if (mode === 'opt') check(`${name} ${veh === 'two' ? 'iki' : 'tek'} kademe dengeli güdüm: itki komutunun yönü sürekli (denetim adımı başına ≤ 3°; yeniden çözümler ve son iniş yasasına geçiş dahil), yaklaşma + son inişte rms |ω| ≤ 2,5°/s ve itki ekseni hatası ≤ 12°`,
      rec.n2 > 500 && rec.cmdMax < 3 * D2R && Math.sqrt(rec.w2 / rec.n2) < 2.5 * D2R && rec.errMax < 12 * D2R, `en büyük komut adımı ${(rec.cmdMax * DEG).toFixed(2)}°, rms |ω| ${(Math.sqrt(rec.w2 / rec.n2) * DEG).toFixed(2)}°/s, en büyük eksen hatası ${(rec.errMax * DEG).toFixed(1)}° (${rec.n2} adım)`);
    if (veh === 'two' || name === 'APOLLO') {
      // ayrılan kademeler: kendi eylemsizlikleriyle torksuz serbest dönme, açısal momentum korunumu, ayrılma devrilmesi 0,5°/s mertebesinde
      let ok = M.debris.length >= (veh === 'two' ? 2 : 1), msg = [];
      for (const d of M.debris) { const r = d.rot; if (!r) { ok = false; continue; } const L0 = angMomentum(r.q, r.w, r.I), E0 = rotEnergy(r.w, r.I), w0 = norm(r.w); M.debrisQ(d, r.t + 36 * 3600); const L1 = angMomentum(r.q, r.w, r.I);
        if (!(norm(sub(L1, L0)) / norm(L0) < 1e-8 && Math.abs(rotEnergy(r.w, r.I) / E0 - 1) < 1e-8 && w0 > 0.001 && w0 < 0.05)) ok = false; msg.push(`${d.kind} ω ${(w0 * DEG).toFixed(2)}°/s`); }
      check(`${name} ${veh === 'two' ? 'iki' : 'tek'} kademe ${mode}: ayrılan kademeler tip-off ile devrilir, 36 sa sonra açısal momentum ve enerji korunur`, ok, msg.join(', '));
    }
  }
}

// ---------------------------------------------------------------- 6b) gönderilen nominal Δv verisi güncel mi: data/designs_default.json (6 profil), varsayılan görev koduyla uçulan bozulmasız görevle aynı olmalı
{
  const worst = []; let allOk = true;
  for (const [name, entry] of Object.entries(ALL.profiles)) {
    const D = entry.design; E.setMoonZone(D.profile === 'HALO' ? 1.25 * D.HALO.stats.raKm : E.SOI_M); makeLive(SPK, PCK, eo, ALL.tStart);
    const M = new Mission({ design: D }); M.P.tLimit = Infinity; for (;;) { if (M.gen.next().done) break; }
    const now = dvFromEvents(M.events); let w = 0;
    for (const [k, v] of Object.entries(entry.nominal)) { if (v == null) { if (now[k] != null) allOk = false; } else w = Math.max(w, Math.abs((now[k] ?? NaN) - v)); }
    if (!(w < 0.01)) allOk = false; worst.push(`${name} ${w.toExponential(0)}`);
  }
  check('nominal Δv verisi (6 profil, data/designs_default.json) güncel kodla uçulan bozulmasız görevle aynı (< 0,01 m/s); kod değişince node test/make_designs.js ile yenilenir', allOk, worst.join(', '));
}

// ---------------------------------------------------------------- 7) elle uçuş: seçili yön moduna (ters yön) itkisiz de dönülür; itkili dönüşte itki gerçek eksen boyunca, gecikmeli
{
  const D = ALL.profiles.APOLLO.design; E.setMoonZone(E.SOI_M); makeLive(SPK, PCK, eo, ALL.tStart);
  const M = new Mission({ design: D, landing: 'zem' }); M.attachHistory(); M.P.tLimit = Infinity;
  const tStart = D.TLI.t_ign + D.TLI.x[1] + 2400, now = () => 0;                      // TLI kademesi ayrıldıktan sonra (iniş aracı sınıfı)
  M.advance(tStart, 1e9, null, now); M.setAuto(false, M.P.s.t);
  const P = M.P, pro = () => M.manualDir('PRO'), retro = () => M.manualDir('RETRO');
  const rec = []; const push0 = P.onStep; P.onStep = (...a) => { push0(...a); rec.push({ t: P.s.t, q: P.att.q.slice() }); };
  const axisErr = (c) => vAngle(qRot(P.att.q, Z_AXIS), c), a0 = axisErr(pro()), w0 = stageSpec(M.veh.active).ctl.wMax * D2R, rcs0 = M.veh.active.rcsUsed || 0;
  const t0 = P.s.t; M.advance(t0 + 40, 1e9, () => [0, retro()], now);
  const rate = rec.reduce((m, r, i) => (i && r.t - rec[i - 1].t > 0.05 ? Math.max(m, qAngle(rec[i - 1].q, r.q) / (r.t - rec[i - 1].t)) : m), 0), a1 = axisErr(retro());
  const tAl = (rec.find((r) => vAngle(qRot(r.q, Z_AXIS), retro()) < 0.5 * D2R) || { t: NaN }).t - t0, rcs1 = M.veh.active.rcsUsed - rcs0;
  check('elle uçuş, itkisiz: ters yön komutuna RCS ile dönülür (≤ wMax = 15°/s, ~13 s), 40 s sonra hizalı; başlangıçta ileri yönelimliydi, RCS yakıtı harcandı',
    a0 < 1 * D2R && rate <= w0 * 1.05 && rate > 5 * D2R && a1 < 0.5 * D2R && tAl > 12 && tAl < 20 && rcs1 > 0.2 && rcs1 < 3, `başlangıç hatası ${(a0 * DEG).toFixed(3)}°, azami hız ${(rate * DEG).toFixed(2)}°/s, hizalanma ${tAl.toFixed(1)} s, 40 s sonra ${(a1 * DEG).toFixed(3)}°, RCS ${rcs1.toFixed(2)} kg`);
  rec.length = 0; const t1 = P.s.t, vA = P.s.v.slice(), ctrl = () => [1.0, pro()], prog = [], hook = P.onStep; P.onStep = (...a) => { hook(...a); prog.push({ t: P.s.t - t1, v: P.s.v.slice() }); };
  M.advance(t1 + 40, 1e9, ctrl, now);
  const along = (v) => dot(sub(v, vA), unit(vA)), dvEarly = along(prog.find((r) => r.t >= 5).v), dvLate = along(P.s.v), a2 = axisErr(pro());
  check('elle uçuş, itkili: ters yönelimden ileri komuta dönerken itki gerçek eksen boyunca (ilk 5 s\'de ters yönde Δv, sonra ileri); gimbal ≤ sınır, 40 s sonra hata < 1,5°',
    dvEarly < -0.002 && dvLate > 0.02 && a2 < 1.5 * D2R && Math.hypot(...P.att.g) <= Math.tan(stageSpec(M.veh.active).tvc.max * D2R) * (1 + 1e-9),
    `5 s'de hız yönünde Δv ${(dvEarly * 1000).toFixed(1)} m/s, 40 s'de ${(dvLate * 1000).toFixed(1)} m/s, son hata ${(a2 * DEG).toFixed(3)}°, gimbal ${(Math.atan(Math.hypot(...P.att.g)) * DEG).toFixed(2)}°`);
}

console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
