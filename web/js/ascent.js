// Kalkış canlandırması (Ay görevi): rampadan park yörüngesine giriş noktasına yol. Görev fiziği değişmez — fizik yörüngeye girişte başlar;
// bu modül yalnız t_launch → t_ins arasını çizmek için konum/hız/yönelim üretir (saf; Node'da sınanır: test/test_ascent.js).
// Roketin çıkış verisi (veh) verilirse yol FİZİKSELDİR (ascentsim.js: yerçekimi dönüşü, atmosfer, sürüklenme, kademeler, uç güdüm; gerçek zamanla
// benzetilir, canlandırma süresine ölçeklenir; yay açısı ve irtifa görevin giriş noktasına tam oturacak biçimde ölçeklenir). Yoksa aşağıdaki kinematik yol.
//
// Yol: kalkış anındaki rampa noktası p0 ile giriş noktası r1 (ICRF) arasındaki büyük çember düzleminde,
//   açı θ(τ) = θ1 · τⁿ  (n, varışta yatay hız giriş hızına eşit olacak biçimde: θ1·n/T · (R+h1) = |v1|; dikey yükselişle başlar),
//   irtifa h(τ) = h1 · (1 − (1 − τ^q)^p)  (p = 2,2: varışta dikey hız 0 — dairesel park yörüngesine yatay giriş; q = 1,3: yavaş başlangıç,
//   tipik çıkışlara yakın: birinci kademe ayrılmasında (τ ≈ 0,3) ~70 km),   τ = (t − t_launch) / T.
// Rampa WGS-84 elipsoidi üzerindeki gerçek noktadır (jeodezik enlem): telemetrinin irtifası rampada 0 çıkar.
// Gerçek bir çıkış güdümü (yerçekimi dönüşü, atmosfer, kademe itkileri) değildir; zaman çizelgesindeki kademe ayrılmaları roketin gerçek uçuş
// zamanlarından (rockets.js ascent) T'ye ölçeklenir.

import { solveAscent, sampleAt } from './ascentsim.js';
import { dot, sub, add, scale, norm, unit, cross, mtv } from './vec3.js';
const OMEGA = 7.2921159e-5;                                       // rad/s

export const P_ALT = 2.2, Q_ALT = 1.3;
const A_E = 6378.137, F_E = 1 / 298.257223563, E2 = F_E * (2 - F_E);

// site: { lat, lon } (°); ins: { t, r, v } (ICRF km, km/s); icrfToItrf(t) → 3×3 (engine.earthIcrfToItrf); rE: Dünya yarıçapı (km)
export function buildAscent({ site, tLaunch, ins, icrfToItrf, rE = 6378.137, veh = null, tInsReal = null, inc = 28.5 }) {
  const la = site.lat * Math.PI / 180, lo = site.lon * Math.PI / 180, N = A_E / Math.sqrt(1 - E2 * Math.sin(la) ** 2);
  const ecefKm = [N * Math.cos(la) * Math.cos(lo), N * Math.cos(la) * Math.sin(lo), N * (1 - E2) * Math.sin(la)], R0 = norm(ecefKm), ecef = unit(ecefKm);
  const padAt = (t) => mtv(icrfToItrf(t), ecef);                  // rampanın ICRF birim vektörü (Dünya ile döner)
  const T = ins.t - tLaunch, d0 = padAt(tLaunch), r1 = norm(ins.r), d1 = unit(ins.r), h1 = r1 - R0;
  const th1 = Math.acos(Math.max(-1, Math.min(1, dot(d0, d1))));
  const nrm = unit(cross(d0, d1)), e0 = d0, e1 = cross(nrm, d0);   // düzlem tabanı: e0 (rampa), e1 (uçuş yönü)
  const vt = norm(sub(ins.v, scale(d1, dot(ins.v, d1))));          // girişteki yatay hız
  const n = Math.max(1.2, (vt * T) / (r1 * th1));                  // varışta yatay hız = giriş hızı
  if (veh && tInsReal) {
    const S = solveAscent(veh, { r0: R0, r1, v1: norm(ins.v), inc, tEnd: tInsReal }), last = S.samples[S.samples.length - 1];
    const kTh = th1 / last.th, kH = (r1 - R0) / ((last.r - R0) || 1), v1d = unit(ins.v);
    const atP = (t) => {
      const tau = Math.max(0, Math.min(1, (t - tLaunch) / T));
      if (tau <= 0) { const d = padAt(t), r = scale(d, R0), v = cross([0, 0, OMEGA], r); return { r, v, vRel: [0, 0, 0], up: d, h: 0, tau: 0, dir: d, q: 0, tReal: (t - tLaunch) * tInsReal / T, stage: 0 }; }
      const tr = tau * tInsReal, s = sampleAt(S.samples, tr), th = s.th * kTh, R = R0 + (s.r - R0) * kH;
      const d = add(scale(e0, Math.cos(th)), scale(e1, Math.sin(th))), et = cross(nrm, d);
      let v = add(scale(d, s.vr), scale(et, s.vt));
      const w = tau < 0.92 ? 0 : ((tau - 0.92) / 0.08) ** 2 * (3 - 2 * (tau - 0.92) / 0.08);   // son %8'de görevin giriş hızına yumuşak birleşme
      v = add(scale(v, 1 - w), scale(ins.v, w));
      const r = scale(d, R), vRel = sub(v, cross([0, 0, OMEGA], r));
      const dir = s.stage >= 0 ? add(scale(d, Math.sin(s.psi)), scale(et, Math.cos(s.psi))) : unit(v);
      return { r, v, vRel, up: d, h: R - R0, tau, dir: unit(add(scale(dir, 1 - w), scale(v1d, w))), q: s.q, tReal: tr, stage: s.stage };
    };
    return { T, th1, h1, R0, at: atP, tLaunch, tIns: ins.t, sim: S, physical: true, padAt };
  }
  const geo = (tau) => {
    const th = th1 * Math.pow(tau, n), h = h1 * (1 - Math.pow(1 - Math.pow(tau, Q_ALT), P_ALT));
    return { d: add(scale(e0, Math.cos(th)), scale(e1, Math.sin(th))), R: R0 + h, th, h };
  };
  // t anındaki durum: { r, v, vRel (atmosfere göre), up, h, tau, q (gövde +z = itki yönü) }
  const at = (t) => {
    const tau = Math.max(0, Math.min(1, (t - tLaunch) / T));
    if (tau <= 0) {                                                // kalkıştan önce: rampada, Dünya ile dönen
      const d = padAt(t), r = scale(d, R0), v = cross([0, 0, OMEGA], r);
      return { r, v, vRel: [0, 0, 0], up: d, h: 0, tau: 0, dir: d };
    }
    const g = geo(tau), dt = Math.min(0.5, T * 1e-3), g2 = geo(Math.min(1, tau + dt / T)), g1 = geo(Math.max(0, tau - dt / T));
    const r = scale(g.d, g.R), r2 = scale(g2.d, g2.R), rr1 = scale(g1.d, g1.R);
    const span = (Math.min(1, tau + dt / T) - Math.max(0, tau - dt / T)) * T;
    let v = scale(sub(r2, rr1), 1 / span);
    // ilk anda rampanın dönüş hızı da var: yol rampadan başladığı için τ küçükken eklenir, varışta söner (giriş hızı korunur)
    const w = Math.pow(1 - tau, 3);
    v = add(v, scale(cross([0, 0, OMEGA], scale(d0, R0)), w));
    const vRel = sub(v, cross([0, 0, OMEGA], r));
    const sp = norm(vRel), dir = sp > 0.02 ? unit(vRel) : g.d;     // itki yönü: atmosfere göre hız (başta dikey)
    return { r, v, vRel, up: g.d, h: g.h, tau, dir };
  };
  return { T, th1, n, h1, R0, at, tLaunch, tIns: ins.t, padAt };
}
// gerçek uçuş zamanlarını (s) canlandırma süresine ölçekle: events [{ t, … }], tInsReal → T
export function scaleEvents(events, tInsReal, T) { return (events || []).map((e) => ({ ...e, tScaled: e.t * T / tInsReal })); }
export const fmtMet = (s) => { const k = Math.max(0, Math.round(s)); return `T+${Math.floor(k / 60)}:${String(k % 60).padStart(2, '0')}`; };
