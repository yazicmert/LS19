// Motorlu iniş güdümü doğrulaması (Node 20+): cd web && node test/test_pdg.js
//  1) Konik çözücü (Clarabel WASM): küçük SOCP ve köşegen ikinci derece maliyet
//  2) Malyuta vd. (IEEE CSM 2022) Mars karşılaştırması: tf=75 s → 373,755 kg, tf=80 s → 378,633 kg, tf=70 s uygun değil (piramit süzülme; tez yeniden üretimi) ve
//     aynı formülasyonun koni süzülmeli biçimi CVXPY/Clarabel ile (373,8413 / 378,6623 kg)
//  3) Düz Ay (sabit çekim) örneği: bağımsız CVXPY/Clarabel çözümleriyle 1e-3 kg içinde
//  4) 1B dikey iniş: bağımsız yarı-analitik (ρ1 yayı + ρ2 yayı, vuruş) yakıt-optimal çözümle %0,1 içinde; yapı en küçük itki sonra en büyük itki
//  5) Ay yörüngesinden iniş (merkezi çekim, eylemsiz çerçeve): kayıpsızlık (‖u‖ = σ), itki sınırları, gerçek merkezi çekimle bağımsız RK4 tümlemesi planla uyuşur
//  6) Gevşek kısıtlar: sert halde bulunamayan durum çözülür ve aşım bildirilir; aşım yoksa sonuç değişmez
//  7) Kapalı döngü (sıcak başlangıçlı yeniden çözüm): hız bozulmasına rağmen kapıya ve yüzeye ulaşır
//  8) Tam görev (N-cisim motor): ZEM/ZEV ile iki optimal mod temasla biter; yakıt sıralaması serbest ≥ dengeli ≥ ZEM; iniş sırasında ve öncesinde rastgele hız bozulmalarına dayanıklı
//  9) Altı görev profilinin hepsi (Apollo, Apollo 11, NRHO, L2, L1, yörünge yükseltmeli) her optimal modla temasla biter; yakıt payı ZEM'den fazladır
import fs from 'fs';
import { initConic, Conic } from '../js/conic.js';
import { solveFixed, solvePDG, replanPDG, controlAt, expm } from '../js/pdg.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const norm = (a) => Math.hypot(...a);
await initConic();

// ---------------------------------------------------------------- 1) konik çözücü
{
  const C = new Conic(2); C.cost(0, 1); C.cost(1, 1);
  C.geq(-1, [[0, 1], [1, 1]]); C.geq(0, [[0, 1]]); C.geq(0, [[1, 1]]); C.soc([5, []], [[0, [[0, 1]]], [0, [[1, 1]]]]);
  const r = C.solve();
  check('konik: SOCP (min x0+x1, x0+x1 ≥ 1, ‖x‖ ≤ 5) → 1', r.ok && Math.abs(r.obj - 1) < 1e-6 && Math.abs(r.x[0] + r.x[1] - 1) < 1e-6, `${r.status}, f=${r.obj}`);
  const Q = new Conic(1); Q.quad(0, 1, 1); Q.geq(0.5, [[0, -1]]);                 // min ½(x−1)² koşul x ≤ 0.5
  const q = Q.solve({ tol: 1e-10 });
  check('konik: köşegen ikinci derece maliyet (min ½(x−1)², x ≤ 0,5) → x = 0,5', q.ok && Math.abs(q.x[0] - 0.5) < 1e-6, `x=${q.x && q.x[0]}`);
  const E = expm(Float64Array.from([0, 1, 0, 0]), 2);                              // exp([[0,1],[0,0]]) = [[1,1],[0,1]]
  check('matris üstel: nilpotent matris tam', Math.abs(E[0] - 1) < 1e-14 && Math.abs(E[1] - 1) < 1e-14 && Math.abs(E[2]) < 1e-14 && Math.abs(E[3] - 1) < 1e-14);
}

// ---------------------------------------------------------------- 2) Mars karşılaştırması (Malyuta vd. 2022; tez yeniden üretimi: tf=75 s → 373,75 kg)
{
  const g0 = 9.807, Isp = 225, phi = 27 * Math.PI / 180, alpha = 1 / (Isp * g0 * Math.cos(phi)), Tmax = 3.1e3, lat = 30 * Math.PI / 180, wm = 2 * Math.PI / (24.6229 * 3600);
  const P = (pyramid) => ({ r0: [2000, 0, 1500], v0: [80, 30, -75], m0: 1905, rf: [0, 0, 0], vf: [0, 0, 0], g: [0, 0, -3.7114], omega: [wm * Math.cos(lat), 0, wm * Math.sin(lat)],
    rho1: 6 * 0.3 * Tmax * Math.cos(phi), rho2: 6 * 0.8 * Tmax * Math.cos(phi), alpha, mDry: 1505, point: { n: [0, 0, 1], cosTheta: Math.cos(40 * Math.PI / 180) },
    glide: { n: [0, 0, 1], tanGamma: Math.tan(86 * Math.PI / 180), pyramid }, vmax: 500 / 3.6 });
  const f = (pyr, tf) => { const s = solveFixed(P(pyr), tf, tf); return s.ok ? s : null; };
  const a = f(true, 75), b = f(true, 80), c = f(true, 70), d = f(false, 75), e = f(false, 80);
  check('Mars (piramit süzülme) tf=75 s: yakıt 373,755 kg (yayımlanan yeniden üretim)', a && Math.abs(a.fuel - 373.755) < 0.01, a ? `${a.fuel.toFixed(4)} kg` : 'çözülemedi');
  check('Mars (piramit) tf=80 s: yakıt 378,633 kg', b && Math.abs(b.fuel - 378.633) < 0.01, b ? `${b.fuel.toFixed(4)} kg` : 'çözülemedi');
  check('Mars (piramit) tf=70 s: uygun değil (referansla aynı)', c === null);
  check('Mars (koni süzülme) tf=75/80 s: CVXPY/Clarabel ile aynı formülasyon 373,8413 / 378,6623 kg', d && e && Math.abs(d.fuel - 373.8413) < 0.005 && Math.abs(e.fuel - 378.6623) < 0.005, d && e ? `${d.fuel.toFixed(4)} / ${e.fuel.toFixed(4)}` : '');
  check('Mars: kayıpsızlık ‖u‖ = σ (tüm düğümlerde)', a && a.gap < 1e-6, a ? `en büyük bağıl fark ${a.gap.toExponential(1)}` : '');
  const pr = solvePDG(P(true), { Nfinal: 75 });
  check('Mars: tf araması en iyi son zamanı bulur (75,1 ± 0,5 s) ve yakıt ≤ tf=75 çözümü', pr.ok && Math.abs(pr.tf - 75.1) < 0.5 && pr.fuel <= a.fuel + 0.05, pr.ok ? `tf*=${pr.tf.toFixed(2)} s, ${pr.fuel.toFixed(3)} kg, ${pr.calls} çözüm, ${pr.ms} ms` : pr.why);
}

// ---------------------------------------------------------------- 3) düz Ay: bağımsız CVXPY/Clarabel (aynı problem: sabit g, dönme yok, ZOH tam, süzülme konisi 80°, işaretleme 40°, vmax 130)
{
  const g0 = 9.80665, Isp = 311, alpha = 1 / (Isp * g0);
  const P = { r0: [6000, 1500, 2500], v0: [-70, 15, -35], m0: 1800, mDry: 1200, rho1: 0.3 * 7000, rho2: 0.85 * 7000, alpha, rf: [0, 0, 0], vf: [0, 0, 0], g: [0, 0, -1.62], vmax: 130,
    point: { n: [0, 0, 1], cosTheta: Math.cos(40 * Math.PI / 180) }, glide: { n: [0, 0, 1], tanGamma: Math.tan(80 * Math.PI / 180) } };
  const REF = [[90, 90, 133.49846], [100, 100, 131.60692], [110, 110, 136.02380], [100, 50, 131.61450], [120, 60, 142.12245]];
  let worst = 0; for (const [tf, N, ref] of REF) { const s = solveFixed(P, tf, N); worst = Math.max(worst, s.ok ? Math.abs(s.fuel - ref) : 1e9); }
  check('düz Ay: 5 yapılandırmada bağımsız CVXPY/Clarabel yakıtıyla uyum', worst < 1e-3, `en büyük fark ${worst.toExponential(1)} kg`);
}

// ---------------------------------------------------------------- 4) 1B dikey iniş: yarı-analitik yakıt-optimal çözüm (Meditch yapısı: ρ1 sonra ρ2)
{
  const g0 = 9.80665, Isp = 320, alpha = 1 / (Isp * g0), gM = 1.62, rho1 = 1600, rho2 = 16000, m0 = 3000, mDry = 1300, h0 = 15000, v0 = -100;
  const arc = (s, T, dur, dt = 0.01) => {
    const n = Math.round(dur / dt), x = [s[0], s[1], s[2]], f = (q) => [q[1], -gM + T / q[2], -alpha * T];
    for (let i = 0; i < n; i++) {
      const k1 = f(x), k2 = f(x.map((v, j) => v + 0.5 * dt * k1[j])), k3 = f(x.map((v, j) => v + 0.5 * dt * k2[j])), k4 = f(x.map((v, j) => v + dt * k3[j]));
      for (let j = 0; j < 3; j++) x[j] += dt * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]) / 6;
    }
    return x;
  };
  const shoot = (ts) => {
    const s = arc([h0, v0, m0], rho1, ts); let lo = 0, hi = 1; while (arc(s, rho2, hi)[1] < 0 && hi < 600) hi *= 2;
    for (let i = 0; i < 40; i++) { const mid = 0.5 * (lo + hi); if (arc(s, rho2, mid)[1] < 0) lo = mid; else hi = mid; }
    const e = arc(s, rho2, 0.5 * (lo + hi)); return { h: e[0], m: e[2], tf: ts + 0.5 * (lo + hi) };
  };
  let a = 0, b = 400; const ha = shoot(a).h;
  for (let i = 0; i < 40; i++) { const mid = 0.5 * (a + b); if ((shoot(mid).h > 0) === (ha > 0)) a = mid; else b = mid; }
  const ref = shoot(0.5 * (a + b)), fuelRef = m0 - ref.m;
  const P = { r0: [0, 0, h0], v0: [0, 0, v0], m0, mDry, rho1, rho2, alpha, rf: [0, 0, 0], vf: [0, 0, 0], g: [0, 0, -gM] };
  const R = solvePDG(P, { Nfinal: 120 });
  check('1B iniş: yakıt, bağımsız yarı-analitik optimumun %0,1 içinde', R.ok && Math.abs(R.fuel - fuelRef) / fuelRef < 1e-3, R.ok ? `${R.fuel.toFixed(3)} kg, yarı-analitik ${fuelRef.toFixed(3)} kg (${((R.fuel - fuelRef) / fuelRef * 100).toFixed(3)} %)` : R.why);
  check('1B iniş: son zaman yarı-analitik optimuma yakın (±0,3 s)', R.ok && Math.abs(R.tf - ref.tf) < 0.3, R.ok ? `tf* ${R.tf.toFixed(2)} s, yarı-analitik ${ref.tf.toFixed(2)} s` : '');
  if (R.ok) {
    const T = R.sol.thrust, nMin = T.filter((x) => x < 1.05 * rho1).length, nMax = T.filter((x) => x > 0.95 * rho2).length, sw = T.findIndex((x) => x > 2 * rho1);
    check('1B iniş: itki yapısı en küçük (ρ1) sonra en büyük (ρ2), tek anahtarlama', nMin + nMax >= T.length - 6 && sw > 0 && T.slice(sw + 1).every((x) => x > 0.95 * rho2), `ρ1 yayı ${nMin} düğüm, ρ2 yayı ${nMax} düğüm, anahtarlama ${(sw * R.sol.dt).toFixed(1)} s (yarı-analitik ${(0.5 * (a + b)).toFixed(1)} s)`);
  }
}

// ---------------------------------------------------------------- 5) Ay yörüngesinden iniş (merkezi çekim, eylemsiz çerçeve)
const MU = 4.9028e12, Rsite = 1735.47e3, g0 = 9.80665, Isp = 320, alpha = 1 / (Isp * g0);
const rp = Rsite + 15e3, ra = 1737.4e3 + 110e3, aOrb = (rp + ra) / 2, vp = Math.sqrt(MU * (2 / rp - 1 / aOrb));
const ang = 9 * Math.PI / 180, site = [Rsite * Math.cos(ang), Rsite * Math.sin(ang), 0], up = [Math.cos(ang), Math.sin(ang), 0];
const gfun = (r) => { const n = Math.hypot(...r); return r.map((x) => -MU * x / n ** 3); };
const lunar = (ex = {}) => ({ r0: [rp, 0, 0], v0: [0, vp, 0], m0: 2400, mDry: 1300, rho1: 1600, rho2: 14400, alpha, rf: site.map((c, i) => c + 120 * up[i]), vf: up.map((c) => -9.4 * c),
  gfun, surfaceR: Rsite, floorMargin: 0, soft: 200, point: { n: up, cosTheta: Math.cos(45 * Math.PI / 180), tail: 100 }, funnel: { n: up, vd0: 9.4, kd: 0.06, vh0: 1, kh: 0.15, tail: 200, vsite: [0, 0, 0] }, ...ex });
const R5 = solvePDG(lunar(), { Nfinal: 60 });
{
  check('Ay iniş: plan bulunur (merkezi çekim, yüzey, işaretleme ve hız hunisi ile)', R5.ok, R5.ok ? `tf*=${R5.tf.toFixed(0)} s, yakıt ${R5.fuel.toFixed(1)} kg, ${R5.calls} çözüm, ${R5.ms} ms` : R5.why);
  const s = R5.sol, N = s.N;
  check('Ay iniş: kayıpsızlık ‖u‖ = σ (tüm düğümlerde)', s.gap < 1e-6, `en büyük bağıl fark ${s.gap.toExponential(1)}`);
  const Tn = s.thrust, lo = Math.min(...Tn), hi = Math.max(...Tn);
  check('Ay iniş: itki ρ1 ≤ m·σ ≤ ρ2 sınırlarında (1 N içinde)', lo > 1600 - 1 && hi < 14400 + 1, `${lo.toFixed(1)} … ${hi.toFixed(1)} N`);
  check('Ay iniş: kütle ≥ kuru kütle ve yakıt tahmini ~1,0–1,2 ton', s.m[N] > 1300 && s.fuel > 900 && s.fuel < 1250, `m_son ${s.m[N].toFixed(1)} kg`);
  check('Ay iniş: kısıt aşımı yok (huni, işaretleme)', s.violMax < 1e-2, `aşım ${JSON.stringify(Object.fromEntries(Object.entries(s.viol).map(([k, v]) => [k, +v.toFixed(3)])))}`);
  let minAlt = 1e9; for (let k = 0; k <= N; k++) minAlt = Math.min(minAlt, norm(s.r[k]) - Rsite);
  check('Ay iniş: yörünge yüzeyin altına inmez (kapıya dek en düşük düğüm ≥ 119,9 m)', minAlt > 119.9, `en düşük düğüm irtifası ${minAlt.toFixed(1)} m (kapı 120 m)`);
  // bağımsız RK4: planın kumandasını gerçek merkezi çekimle tümle
  const f = (x, u, sg) => { const n = Math.hypot(x[0], x[1], x[2]); return [x[3], x[4], x[5], -MU * x[0] / n ** 3 + u[0], -MU * x[1] / n ** 3 + u[1], -MU * x[2] / n ** 3 + u[2], -alpha * sg * x[6]]; };
  let x = [rp, 0, 0, 0, vp, 0, 2400];
  for (let k = 0; k < N; k++) {
    const steps = Math.round(s.dt / 0.02), h = s.dt / steps;
    for (let i = 0; i < steps; i++) {
      const k1 = f(x, s.u[k], s.sigma[k]), k2 = f(x.map((c, j) => c + 0.5 * h * k1[j]), s.u[k], s.sigma[k]), k3 = f(x.map((c, j) => c + 0.5 * h * k2[j]), s.u[k], s.sigma[k]), k4 = f(x.map((c, j) => c + h * k3[j]), s.u[k], s.sigma[k]);
      x = x.map((c, j) => c + h * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]) / 6);
    }
  }
  const dr = norm([0, 1, 2].map((i) => x[i] - s.r[N][i])), dv = norm([0, 1, 2].map((i) => x[3 + i] - s.v[N][i]));
  check('Ay iniş: kumandayı gerçek merkezi çekimle tümleyen bağımsız RK4, planın son durumuna ≤ 2 m / 0,02 m/s yaklaşır', dr < 2 && dv < 0.02 && Math.abs(x[6] - s.m[N]) < 0.1, `Δr ${dr.toFixed(2)} m, Δv ${dv.toFixed(4)} m/s, Δm ${(x[6] - s.m[N]).toFixed(3)} kg`);
  const dRf = norm(sub3(s.r[N], lunar().rf)), dVf = norm(sub3(s.v[N], lunar().vf));
  check('Ay iniş: son koşullar sağlanır (kapı konumu ve hızı)', dRf < 1e-3 && dVf < 1e-6, `konum ${dRf.toExponential(1)} m, hız ${dVf.toExponential(1)} m/s`);
}
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }

// ---------------------------------------------------------------- 6) gevşek kısıtlar
{
  const slow = { funnel: { n: up, vd0: 9.4, kd: 0.03, vh0: 1, kh: 0.06, tail: 400, vsite: [0, 0, 0] } };            // çok yavaş iniş koridoru: sert halde uygun tf yok
  const h = solvePDG(lunar({ ...slow, soft: 0 }), { Nfinal: 40, scan: 20 }), s = solvePDG(lunar({ ...slow, soft: 200 }), { Nfinal: 40, scan: 20 });
  check('gevşek kısıt: dar hız koridorunda sert problem çözülemez, gevşek problem çözülür (aşımsız)', !h.ok && s.ok && s.sol.violMax < 1e-2, `sert ${h.ok ? 'çözüldü' : 'çözülemedi'}, gevşek ${s.ok ? `tf ${s.tf.toFixed(0)} s, aşım ${s.sol.violMax.toFixed(3)}` : s.why}`);
  const imp = solvePDG(lunar({ point: { n: up, cosTheta: Math.cos(10 * Math.PI / 180), tail: 400 }, soft: 200 }), { Nfinal: 40, scan: 20 });
  check('gevşek kısıt: karşılanamayan işaretleme sınırı (10°, son 400 s) aşım olarak bildirilir', imp.ok && imp.sol.viol.point > 0.05, imp.ok ? `işaretleme aşımı ${imp.sol.viol.point.toFixed(2)}` : imp.why);
  const a = solvePDG(lunar({ soft: 0 }), { Nfinal: 40 }), b = solvePDG(lunar({ soft: 200 }), { Nfinal: 40 });
  check('gevşek kısıt: aşım yokken sonuç değişmez (yakıt farkı ≤ 0,5 kg)', a.ok && b.ok && b.sol.violMax < 1e-2 && Math.abs(a.fuel - b.fuel) < 0.5, a.ok && b.ok ? `sert ${a.fuel.toFixed(2)} kg, gevşek ${b.fuel.toFixed(2)} kg` : '');
}

// ---------------------------------------------------------------- 7) kapalı döngü: sıcak başlangıçlı yeniden çözüm + bozulma (nokta kütle gerçeği)
{
  const P = (r0, v0, m0) => lunar({ r0, v0, m0 });
  const f = (x, u, sg, d) => { const n = Math.hypot(x[0], x[1], x[2]); return [x[3], x[4], x[5], -MU * x[0] / n ** 3 + u[0] + d[0], -MU * x[1] / n ** 3 + u[1] + d[1], -MU * x[2] / n ** 3 + u[2] + d[2], -alpha * sg * x[6]]; };
  let x = [rp, 0, 0, 0, vp, 0, 2400], t = 0, kicked = false, fails = 0, nre = 0;
  let plan = { t0: 0, sol: solvePDG(P(x.slice(0, 3), x.slice(3, 6), x[6]), { Nfinal: 60 }).sol }, tR = 10;
  const d = [3e-3, -2e-3, 1e-3];
  while (t < plan.t0 + plan.sol.tf - 1e-6) {
    const alt = Math.hypot(x[0], x[1], x[2]) - Rsite; if (alt < 125) break;
    const h = alt < 400 ? 0.05 : 0.25, c = controlAt(plan.sol, t - plan.t0), un = norm(c.u), T = Math.min(16000, Math.max(1600, x[6] * un)), u = c.u.map((v) => v / un * T / x[6]), sg = T / x[6];
    const k1 = f(x, u, sg, d), k2 = f(x.map((v, j) => v + 0.5 * h * k1[j]), u, sg, d), k3 = f(x.map((v, j) => v + 0.5 * h * k2[j]), u, sg, d), k4 = f(x.map((v, j) => v + h * k3[j]), u, sg, d);
    x = x.map((v, j) => v + h * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]) / 6); t += h;
    if (!kicked && t >= 60) { x[3] += 6; x[4] -= 4; x[5] += 5; kicked = true; }
    if (t >= tR && plan.t0 + plan.sol.tf - t > 8) {
      const q = replanPDG(P(x.slice(0, 3), x.slice(3, 6), x[6]), plan, t, { N: Math.max(10, Math.min(60, Math.round((plan.t0 + plan.sol.tf - t) / 0.6))), reg: 0.003 });
      if (q.ok) { plan = { t0: t, sol: q.sol }; nre++; } else fails++; tR = t + 10;
    }
  }
  const up_ = (r) => r.map((c) => c / norm(r)), n = up_(x.slice(0, 3)), v = x.slice(3, 6), vz = v[0] * n[0] + v[1] * n[1] + v[2] * n[2], vh = norm(v.map((c, i) => c - vz * n[i])), alt = norm(x.slice(0, 3)) - Rsite;
  const gate = lunar();
  check('kapalı döngü: 6 m/s hız bozulması + sürekli bozucu ivmeyle kapıya ulaşır (başarısız yeniden çözüm yok)', fails === 0 && nre > 20 && alt < 130 && Math.abs(vz + 9.4) < 1.5 && vh < 1.5 && norm(sub3(x.slice(0, 3), gate.rf)) < 25,
    `${nre} yeniden çözüm, ${fails} başarısız; kapıda irtifa ${alt.toFixed(1)} m, dikey ${vz.toFixed(2)} m/s, yatay ${vh.toFixed(2)} m/s, konum hatası ${norm(sub3(x.slice(0, 3), gate.rf)).toFixed(1)} m`);
}

// ---------------------------------------------------------------- 8) tam görev: ZEM/ZEV ile optimal modlar (N-cisim motor, J2/C22, Ay dönmesi)
{
  const E = await import('../js/engine.js'), { makeLive } = await import('../js/live.js'), { Mission } = await import('../js/mission.js');
  const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  const eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url)));
  makeLive(ab(new URL('../data/de440s.bsp', import.meta.url)), ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url)), eo, 1083171.0725 - 86400);
  const fly = (landing, kick = null) => {
    const M = new Mission({ landing }); let tK = null; M.P.tLimit = Infinity;
    if (kick) { M.P.tLimit = kick.t; for (let g = 0; g < 1e7; g++) { const r = M.gen.next(); if (r.done || r.value === 0) break; } M.P.s.v = M.P.s.v.map((v, k) => v + kick.d[k] * kick.mag / 1000); M.P.tLimit = Infinity; tK = kick.t; }
    for (;;) { if (M.gen.next().done) break; }
    return M;
  };
  const T0 = performance.now(), res = {};
  for (const mode of ['zem', 'opt', 'free']) res[mode] = fly(mode);
  const ok = (M) => M.result && M.result.ok, vz = (M) => Math.abs(M.result.v_mps[2]), vh = (M) => Math.hypot(M.result.v_mps[0], M.result.v_mps[1]), er = (M) => Math.hypot(...M.result.posErr_m);
  for (const mode of ['zem', 'opt', 'free']) {
    const M = res[mode];
    const vhLim = mode === 'free' ? 0.5 : 0.2;        // serbest mod kapıya agresif varır; yönelim artık hız sınırlı bir fizik durumu olduğundan son yatay hız biraz daha büyük kalır
    check(`tam görev, iniş güdümü ${mode}: temasla biter (|dikey| < 1,2 m/s, yatay < ${vhLim} m/s, konum hatası < 5 m)`, ok(M) && vz(M) < 1.2 && vh(M) < vhLim && er(M) < 5,
      `dikey ${M.result.v_mps[2].toFixed(2)} m/s, yatay ${vh(M).toFixed(2)} m/s, hata ${er(M).toFixed(1)} m, kalan yakıt ${M.result.prop.toFixed(0)} kg${M.descentInfo ? `, ${M.descentInfo.replans} yeniden çözüm (${M.descentInfo.fails} başarısız)` : ''}`);
  }
  check('tam görev: yakıt sıralaması serbest ≥ dengeli ≥ ZEM/ZEV (kalan yakıt)', res.free.result.prop >= res.opt.result.prop && res.opt.result.prop >= res.zem.result.prop + 5,
    `kalan yakıt: serbest ${res.free.result.prop.toFixed(0)}, dengeli ${res.opt.result.prop.toFixed(0)}, ZEM/ZEV ${res.zem.result.prop.toFixed(0)} kg`);
  check('tam görev: optimal iniş planı ve yeniden çözümler hızlı (ilk plan < 3 s, yeniden çözüm ortalama < 250 ms)', res.opt.descentInfo.planMs < 3000 && res.opt.descentInfo.replanMs / res.opt.descentInfo.replans < 250,
    `ilk plan ${res.opt.descentInfo.planMs} ms, ortalama yeniden çözüm ${(res.opt.descentInfo.replanMs / res.opt.descentInfo.replans).toFixed(0)} ms`);
  // rastgele hız bozulmaları: iniş sırasında (10 m/s) ve PDI'dan önce (10 m/s; inişe 5–15 dk kala: daha erken verilen kuvvetli bozulma inişe geçiş yörüngesini yüzeye indirir, bu ZEM'de de kurtarılamaz)
  const tPdi = res.opt.events.find((e) => e.key === 'PDI').t, tTd = res.opt.result.t;
  let seed = 4242; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (const where of ['iniş sırasında', "PDI'dan önce"]) {
    let okN = 0, worstV = 0, worstE = 0, fails = 0; const NT = 5;
    for (let i = 0; i < NT; i++) {
      const u = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], un = norm(u), t = where === 'iniş sırasında' ? tPdi + 20 + rnd() * (tTd - tPdi - 60) : tPdi - 300 - rnd() * 600;
      const M = fly('opt', { t, d: u.map((c) => c / un), mag: 10 });
      if (ok(M) && vz(M) < 1.5 && vh(M) < 0.5 && er(M) < 5) okN++;
      worstV = Math.max(worstV, vz(M)); worstE = Math.max(worstE, er(M)); fails += M.descentInfo ? M.descentInfo.fails : 0;
    }
    check(`tam görev, optimal iniş: ${NT} rastgele 10 m/s bozulma ${where}: hepsi yumuşak temas`, okN === NT && fails === 0, `${okN}/${NT}, en büyük |dikey| ${worstV.toFixed(2)} m/s, hata ${worstE.toFixed(1)} m, başarısız yeniden çözüm ${fails}`);
  }
  check('tam görev testi süresi makul (< 120 s)', (performance.now() - T0) / 1000 < 120, `${((performance.now() - T0) / 1000).toFixed(1)} s`);
}

// ---------------------------------------------------------------- 9) altı görev profili
{
  const E = await import('../js/engine.js'), EO = await import('../js/earth.js'), { makeLive } = await import('../js/live.js'), { Mission } = await import('../js/mission.js');
  const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  const SPK = ab(new URL('../data/de440s.bsp', import.meta.url)), PCK = ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url));
  const eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url))); EO.loadEarthOrientation(eo);
  const ALL = JSON.parse(fs.readFileSync(new URL('../data/designs_default.json', import.meta.url)));
  for (const [name, entry] of Object.entries(ALL.profiles)) {
    const out = {};
    for (const mode of ['zem', 'opt', 'free']) {
      const D = entry.design; E.setMoonZone(D.profile === 'HALO' ? 1.25 * D.HALO.stats.raKm : E.SOI_M); makeLive(SPK, PCK, eo, ALL.tStart);
      const M = new Mission({ design: D, landing: mode }); M.P.tLimit = Infinity; for (;;) { if (M.gen.next().done) break; }
      out[mode] = M;
    }
    const okAll = Object.values(out).every((M) => M.result && M.result.ok && Math.abs(M.result.v_mps[2]) < 1.2 && Math.hypot(...M.result.posErr_m) < 5);
    const f = (m) => out[m].result.prop, fails = out.opt.descentInfo.fails + out.free.descentInfo.fails;
    check(`profil ${name}: üç iniş güdümüyle de yumuşak temas; kalan yakıt serbest ≥ dengeli > ZEM/ZEV; başarısız yeniden çözüm yok`, okAll && f('free') >= f('opt') && f('opt') > f('zem') && fails === 0,
      `kalan yakıt ZEM ${f('zem').toFixed(0)} · dengeli ${f('opt').toFixed(0)} · serbest ${f('free').toFixed(0)} kg (plan süresi dengeli ${out.opt.descentInfo.tf.toFixed(0)} s, serbest ${out.free.descentInfo.tf.toFixed(0)} s)`);
  }
}
console.log(fail ? `\n${fail} HATA` : '\nTAMAM'); process.exit(fail ? 1 : 0);
