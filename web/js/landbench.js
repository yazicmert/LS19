// Ay'a iniş tasarım tezgâhı (saf hesap; tarayıcı, worker ve Node).
// Model: düzlemsel 3 serbestlik (konum 2B + kütle), küresel ve dönmeyen Ay (μ = 4902,8 km³/s², R = 1737,4 km), merkezi çekim, RK4 (0,1 s).
// Araç: kalkış kütlesi, yakıt, en büyük itki, özgül itki (Isp), en küçük kısma oranı; itki yönü anında değişir (yönelim dinamiği yok).
// Güdüm yasaları:
//   • zem  — ZEM/ZEV (sıfır-çaba-ıska / sıfır-çaba-hız, Ebrahimi vd. 2008; Apollo E-guidance ailesi): frenleme → yüksek kapı → yaklaşma → alçak kapı,
//            a = 6 ZEM / tgo² − 2 ZEV / tgo. Frenleme süresi, kısma sınırına sığan en az yakıtlı süre aranarak seçilir.
//   • opt  — yakıt-optimal (kayıpsız dışbükeyleştirme + SOCP, pdg.js; Açıkmeşe & Ploen 2007), alçak kapıya plan ve 10 s'de bir kapalı döngü yeniden çözüm.
//   • retro — hedefsiz frenleme: tam itki; dikey bileşen irtifayı tutar (g − v_y²/r), kalanı yatay hızı frenler; yatay hız bitince dikey iniş. İniş noktası serbest.
// Son iniş (her yasada alçak kapıdan sonra): dikey hız −max(1, min(1 + 0,03 h, √(1,2 a h))) m/s hedefli (a: kullanılabilir net yavaşlama), yatay hız sıfırlanır
// (hız denetimi, kazanç 0,8 1/s).
// Temas ölçütü (Apollo LM tasarımı): dikey ≤ 3,05 m/s (10 ft/s), yatay ≤ 1,22 m/s (4 ft/s). Ay'ın dönmesi (ekvatorda 4,6 m/s) ihmal edilir.
import { solvePDG, replanPDG, controlAt } from './pdg.js';
export const MOON = { MU: 4.9028e12, R: 1737.4e3 }, G0 = 9.80665;
export const TOUCH = { vz: 3.05, vh: 1.22 };
// hazır araçlar. Apollo 11 LM (Eagle): PDI kütlesi ~15.100 kg, iniş motoru (DPS) 45,04 kN, Isp 311 s, kısma %10–60 (+%100); PDI 15 km, 1.695 m/s, iniş yerine ~480 km
export const PRESETS = {
  apollo11: { ad: 'Apollo 11 LM (Eagle)', m0: 15100, prop: 8200, T: 45040, isp: 311, thrMin: 0.10, h0: 15000, vh0: 1695, vv0: 0, range: 480e3 },
  robotik: { ad: 'Küçük robotik iniş aracı (örnek)', m0: 1750, prop: 900, T: 3200, isp: 310, thrMin: 0.2, h0: 30000, vh0: 1680, vv0: 0, range: 750e3 },
  ozel: { ad: 'Özel tasarım', m0: 10000, prop: 5000, T: 30000, isp: 320, thrMin: 0.15, h0: 15000, vh0: 1690, vv0: 0, range: 400e3 },
};
const GATES = { hiH: 2300, hiUp: 7400, hiVh: 150, hiVz: -40, loH: 150, loUp: 0, loVh: 0, loVz: -5 };   // Apollo yüksek/alçak kapısına yakın (m, m/s)

// ---------------------------------------------------------------- geometri: iniş yeri θ = 0, (x, y) Ay merkezli eylemsiz
const R = MOON.R;
const polar = (th, h) => [(R + h) * Math.sin(th), (R + h) * Math.cos(th)];            // θ: iniş yerinden açı (+ ileri), y ekseni iniş yerinin dikeyi
function local(p, v) {                                                                  // yükseklik, yüzey menzili, yatay/dikey hız, birim vektörler
  const r = Math.hypot(p[0], p[1]), up = [p[0] / r, p[1] / r], fw = [up[1], -up[0]];    // fw: θ'nın arttığı yön (iniş yerine doğru +)
  return { r, h: r - R, th: Math.atan2(p[0], p[1]), up, fw, vz: v[0] * up[0] + v[1] * up[1], vh: v[0] * fw[0] + v[1] * fw[1] };
}
const gAt = (p) => { const r = Math.hypot(p[0], p[1]), k = -MOON.MU / (r * r * r); return [p[0] * k, p[1] * k]; };
const gatePoint = (h, up, vh, vz) => { const th = -up / R, u = [Math.sin(th), Math.cos(th)], f = [u[1], -u[0]], p = polar(th, h); return { p, v: [f[0] * vh + u[0] * vz, f[1] * vh + u[1] * vz] }; };
const zemAcc = (p, v, g, pf, vf, tgo) => [0, 1].map((k) => 6 * (pf[k] - (p[k] + v[k] * tgo + 0.5 * g[k] * tgo * tgo)) / (tgo * tgo) - 2 * (vf[k] - (v[k] + g[k] * tgo)) / tgo);
function terminalAcc(p, v, aNet = 1) {
  const L = local(p, v), g = gAt(p), h = Math.max(0, L.h), vzD = -Math.max(1, Math.min(1 + 0.03 * h, Math.sqrt(1.2 * aNet * h)));
  const xErr = R * L.th, vhD = Math.max(-3, Math.min(3, -0.05 * xErr)), k = 0.8;
  const az = k * (vzD - L.vz), ah = k * (vhD - L.vh);
  return [ah * L.fw[0] + az * L.up[0] - g[0], ah * L.fw[1] + az * L.up[1] - g[1]];
}

// ---------------------------------------------------------------- benzetim
// P: { m0, prop, T, isp, thrMin, h0, vh0, vv0, range }, law(t, p, v, m, st) -> ivme komutu [ax, ay] (m/s²); itki = m |a| kısma aralığına kırpılır
export function simulate(P, law, { dt = 0.1, tMax = 3000, rec = 1 } = {}) {
  const mDry = P.m0 - P.prop, mdotMax = P.T / (P.isp * G0);
  let p = polar(-P.range / R, P.h0), t = 0, m = P.m0;
  const L0 = local(p, [0, 0]); let v = [L0.fw[0] * P.vh0 + L0.up[0] * P.vv0, L0.fw[1] * P.vh0 + L0.up[1] * P.vv0];
  const st = { phase: 'frenleme' }, tr = [], phases = [];
  let thrMax = 0, thrMinUsed = 1, accMax = 0, out = false, lastPhase = '';
  const r0 = Math.hypot(...p), v0 = Math.hypot(...v);
  while (t < tMax) {
    const L = local(p, v);
    if (L.h <= 0) break;
    st.aNet = Math.max(0.05, P.T / m - MOON.MU / (L.r * L.r));
    let a = m > mDry + 1e-6 ? law(t, p, v, m, st) : [0, 0];
    let an = Math.hypot(a[0], a[1]), thr = 0, dir = an > 0 ? [a[0] / an, a[1] / an] : L.up;
    if (m > mDry + 1e-6) { thr = Math.max(P.thrMin, Math.min(1, m * an / P.T)); if (st.coast) thr = 0; } else out = true;
    if (st.phase !== lastPhase) { phases.push([st.phase, t]); lastPhase = st.phase; }
    const F = thr * P.T, mdot = thr * mdotMax;
    if (thr > 0) { thrMax = Math.max(thrMax, thr); thrMinUsed = Math.min(thrMinUsed, thr); accMax = Math.max(accMax, F / m); }
    if (tr.length === 0 || t - tr[tr.length - 1][0] >= rec - 1e-9) {
      const pitch = Math.atan2(dir[0] * L.fw[0] + dir[1] * L.fw[1], dir[0] * L.up[0] + dir[1] * L.up[1]) * 180 / Math.PI;
      tr.push([t, L.h, R * L.th, L.vh, L.vz, thr, m, pitch]);
    }
    const f = (pp, vv) => { const g = gAt(pp), k = F / m; return [vv, [g[0] + k * dir[0], g[1] + k * dir[1]]]; };
    const [k1p, k1v] = f(p, v), [k2p, k2v] = f([p[0] + dt / 2 * k1p[0], p[1] + dt / 2 * k1p[1]], [v[0] + dt / 2 * k1v[0], v[1] + dt / 2 * k1v[1]]);
    const [k3p, k3v] = f([p[0] + dt / 2 * k2p[0], p[1] + dt / 2 * k2p[1]], [v[0] + dt / 2 * k2v[0], v[1] + dt / 2 * k2v[1]]);
    const [k4p, k4v] = f([p[0] + dt * k3p[0], p[1] + dt * k3p[1]], [v[0] + dt * k3v[0], v[1] + dt * k3v[1]]);
    const pN = [p[0] + dt / 6 * (k1p[0] + 2 * k2p[0] + 2 * k3p[0] + k4p[0]), p[1] + dt / 6 * (k1p[1] + 2 * k2p[1] + 2 * k3p[1] + k4p[1])];
    const vN = [v[0] + dt / 6 * (k1v[0] + 2 * k2v[0] + 2 * k3v[0] + k4v[0]), v[1] + dt / 6 * (k1v[1] + 2 * k2v[1] + 2 * k3v[1] + k4v[1])];
    const hN = Math.hypot(...pN) - R;
    if (hN <= 0) {                                                                  // yüzey kesişimi: doğrusal ara değer
      const f0 = L.h / (L.h - hN); p = [p[0] + f0 * (pN[0] - p[0]), p[1] + f0 * (pN[1] - p[1])]; v = [v[0] + f0 * (vN[0] - v[0]), v[1] + f0 * (vN[1] - v[1])];
      m = Math.max(mDry, m - mdot * dt * f0); t += dt * f0; break;
    }
    p = pN; v = vN; m = Math.max(mDry, m - mdot * dt); t += dt;
  }
  const L = local(p, v), mf = m, dvUsed = P.isp * G0 * Math.log(P.m0 / mf);
  const vFree = Math.sqrt(v0 * v0 + 2 * MOON.MU * (1 / R - 1 / r0));               // enerji alt sınırı: serbest düşüşte yüzey hızı = anlık (ideal) frenleme Δv
  const gS = MOON.MU / (R * R), landed = L.h <= 1e-6;
  const ok = landed && Math.abs(L.vz) <= TOUCH.vz && Math.abs(L.vh) <= TOUCH.vh;
  tr.push([t, Math.max(0, L.h), R * L.th, L.vh, L.vz, 0, m, 0]);
  return {
    ok, landed, timeout: !landed, outOfFuel: out, t, vz: L.vz, vh: L.vh, missM: R * L.th, mf, propUsed: P.m0 - mf, propLeft: mf - (P.m0 - P.prop),
    dvUsed, dvIdeal: vFree, dvLoss: dvUsed - vFree, dvCap: P.isp * G0 * Math.log(P.m0 / (P.m0 - P.prop)), hoverS: P.isp * G0 / gS * Math.log(mf / (P.m0 - P.prop)),
    tw0: P.T / (P.m0 * MOON.MU / r0 ** 2), twMoonSurface: P.T / (P.m0 * gS), thrMax, thrMinUsed, accMaxG: accMax / G0, phases, track: tr,
  };
}

// ---------------------------------------------------------------- güdüm yasaları
function zemLaw(tBrake, tApp = 90) {
  const hi = gatePoint(GATES.hiH, GATES.hiUp, GATES.hiVh, GATES.hiVz), lo = gatePoint(GATES.loH, GATES.loUp, GATES.loVh, GATES.loVz);
  return (t, p, v, m, st) => {
    if (st.phase === 'frenleme') { const tgo = tBrake - t; if (tgo > 2) return zemAcc(p, v, gAt(p), hi.p, hi.v, tgo); st.phase = 'yaklaşma'; st.t1 = t; }
    if (st.phase === 'yaklaşma') { const tgo = st.t1 + tApp - t; if (tgo > 2 && local(p, v).h > GATES.loH) return zemAcc(p, v, gAt(p), lo.p, lo.v, tgo); st.phase = 'son iniş'; }
    return terminalAcc(p, v, st.aNet);
  };
}
// frenleme süresi araması: kısmaya sığan (komut ≤ %100) ve başarılı inen en az yakıtlı süre
export function runZem(P, opts = {}) {
  let best = null; const tries = [];
  const tryTb = (tb) => { const r = simulate(P, zemLaw(tb), { rec: 5 }); tries.push([tb, r.ok ? r.propUsed : null]); if (r.ok && (!best || r.propUsed < best.res.propUsed)) best = { tb, res: r }; };
  for (let tb = 200; tb <= 2000; tb += 50) tryTb(tb);                                 // kaba tarama, sonra en iyinin çevresinde 10 s adım
  if (best) { const c = best.tb; for (let tb = c - 40; tb <= c + 40; tb += 10) if (tb !== c && tb > 100) tryTb(tb); }
  tries.sort((a, b) => a[0] - b[0]);
  if (!best) { const r = simulate(P, zemLaw(600), opts); return { ...r, law: 'zem', tBrake: 600, search: tries }; }
  const r = simulate(P, zemLaw(best.tb), opts);
  return { ...r, law: 'zem', tBrake: best.tb, search: tries };
}
export function runRetro(P, opts = {}) {
  const law = (t, p, v, m, st) => {
    const L = local(p, v);
    if (st.phase === 'frenleme') {
      if (L.vh > 5 && L.h > 30) {
        const A = P.T / m, az = Math.min(A, Math.max(0, MOON.MU / (L.r * L.r) - L.vh * L.vh / L.r - 0.2 * L.vz)), ah = -Math.sqrt(Math.max(0, A * A - az * az));
        return [ah * L.fw[0] + az * L.up[0], ah * L.fw[1] + az * L.up[1]];             // itki ivmesi: dikey çekimi dengeler, kalanı yatay frenler
      }
      st.phase = 'son iniş';
    }
    return terminalAcc(p, v, st.aNet);
  };
  return { ...simulate(P, law, opts), law: 'retro' };
}
// yakıt-optimal: alçak kapıya SOCP planı (pdg.js, 3B problem düzlemde z = 0), 10 s'de bir yeniden çözüm, kapıdan sonra son iniş yasası
export function runOptimal(P, opts = {}) {
  const mDry = P.m0 - P.prop, lo = gatePoint(GATES.loH, GATES.loUp, GATES.loVh, GATES.loVz);
  const gfun = (r) => { const n = Math.hypot(r[0], r[1], r[2]), k = -MOON.MU / (n * n * n); return [r[0] * k, r[1] * k, r[2] * k]; };
  const mk = (p, v, m) => ({ r0: [p[0], p[1], 0], v0: [v[0], v[1], 0], m0: m, mDry: mDry + 0.01 * P.prop, rho1: P.thrMin * P.T, rho2: 0.95 * P.T, alpha: 1 / (P.isp * G0),
    gfun, surfaceR: R, floorMargin: 0, rf: [lo.p[0], lo.p[1], 0], vf: [lo.v[0], lo.v[1], 0] });
  const p0 = polar(-P.range / R, P.h0), L0 = local(p0, [0, 0]), v0 = [L0.fw[0] * P.vh0 + L0.up[0] * P.vv0, L0.fw[1] * P.vh0 + L0.up[1] * P.vv0];
  const t0 = Date.now(), first = solvePDG(mk(p0, v0, P.m0), { Nfinal: 50 });
  if (!first.ok) return { ...runZem(P, opts), law: 'opt', fallback: 'Yakıt-optimal plan bulunamadı (' + first.why + '): ZEM/ZEV' };
  let plan = { t0: 0, sol: first.sol }, replans = 0, fails = 0, ms = first.ms;
  const law = (t, p, v, m, st) => {
    if (st.phase === 'frenleme') {
      const left = plan.sol.tf - (t - plan.t0);
      if (left <= 0.5 || local(p, v).h <= GATES.loH) st.phase = 'son iniş';
      else {
        if (left > 15 && t - (st.lastPlan ?? 0) >= 10) {
          st.lastPlan = t;
          const q = replanPDG(mk(p, v, m), plan, t, { N: Math.max(10, Math.min(50, Math.round(left / 2))) });
          if (q.ok) { plan = { t0: t, sol: q.sol }; replans++; ms += q.ms; } else fails++;
        }
        const c = controlAt(plan.sol, t - plan.t0); return [c.u[0], c.u[1]];
      }
    }
    return terminalAcc(p, v, st.aNet);
  };
  const r = simulate(P, law, opts);
  return { ...r, law: 'opt', plan: { tf: first.tf, fuel: first.fuel, replans, fails, ms, wallMs: Date.now() - t0 } };
}
export function runBench(P, law, opts) { return law === 'opt' ? runOptimal(P, opts) : law === 'retro' ? runRetro(P, opts) : runZem(P, opts); }
