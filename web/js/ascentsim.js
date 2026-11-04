// Fiziksel çıkış benzetimi (kalkış canlandırması): düzlemde nokta kütle, ters kare çekim, U.S. Standard Atmosphere 1976, Dünya ile dönen hava,
// sürüklenme, kademeli itki (yanma süreleri, itki/ağırlık, kütle oranı; birinci kademede basınca göre itki), güdüm:
//   dikey yükseliş → eğilme (pitch-over, δ) → hücum açısı sıfır yerçekimi dönüşü (birinci kademe) → üst kademelerde kapalı döngü uç güdüm:
//   kalan süre τ ile istenen düşey ivme a_r = 6 (r1 − r − v_r τ)/τ² + 2 v_r/τ (girişte yarıçap r1, düşey hız 0; E-güdümü / PEG'in düşey kanalı),
//   sin ψ = (a_r + g − v_t²/r) / a_T  (ψ: itkinin yerel ufka göre açısı).
// İki bilinmeyen dönüşümlü çözülür: δ → birinci kademe ayrılma irtifası = roketin gerçek değeri (veh.hSep); itki ölçeği k → girişte eylemsiz hız = v1.
// Saf (DOM yok); test/test_ascent.js Apollo 11 değerleriyle (NASA SP-4029) karşılaştırır.
// Kaynaklar: Wikipedia "Gravity turn"; arXiv 2008.13239 (eğilme programı); NASA NTRS 20180002035 (SLS PEG / doğrusal teğet güdüm);
//            U.S. Standard Atmosphere 1976 (NASA TM-X-74335).

import { MU_E as MU, OMEGA_E as OMEGA } from './geo.js';
const G0 = 9.80665e-3;                                            // km/s²
// ---------------------------------------------------------------- U.S. Standard Atmosphere 1976 (0–86 km; üstü üstel)
const LAYERS = [[0, 288.15, -6.5, 101325], [11, 216.65, 0, 22632.06], [20, 216.65, 1.0, 5474.889], [32, 228.65, 2.8, 868.0187],
  [47, 270.65, 0, 110.9063], [51, 270.65, -2.8, 66.93887], [71, 214.65, -2.0, 3.956420]];
const R_AIR = 287.053, G_STD = 9.80665;
// h: geometrik irtifa (km) → { p (Pa), rho (kg/m³), T (K) }
export function atmosphere(h) {
  if (h < 0) h = 0;
  if (h > 86) { const p86 = 0.37338, rho86 = 6.958e-6, H = 6.5; return { p: p86 * Math.exp(-(h - 86) / H), rho: rho86 * Math.exp(-(h - 86) / H), T: 186.87 }; }
  const hg = 6356.766 * h / (6356.766 + h);                       // jeopotansiyel irtifa
  let L = LAYERS[0]; for (const l of LAYERS) if (hg >= l[0]) L = l;
  const [hb, Tb, lap, pb] = L, dh = hg - hb, T = Tb + lap * dh;
  const p = lap === 0 ? pb * Math.exp(-G_STD * dh * 1000 / (R_AIR * Tb)) : pb * Math.pow(Tb / T, G_STD / (R_AIR * lap / 1000));
  return { p, rho: p / (R_AIR * T), T };
}

// veh: { stages: [{ t0, t1, twr, mr, alt? }], beta (kg/m², kalkışta m/(Cd A)), tVert, tPitch }   (zamanlar gerçek s)
// tgt: { r0 (km, rampa yarıçapı), r1 (km), v1 (km/s, eylemsiz), inc (°), tEnd (s) }
function fly(veh, tgt, [delta, k, c], { record = false, dt = 0.5 } = {}) {
  const wE = OMEGA * Math.cos(tgt.inc * Math.PI / 180);          // Dünya dönüşünün yörünge düzlemindeki bileşeni
  let r = tgt.r0, th = 0, vr = 0, vt = wE * tgt.r0, t = 0, psi0 = null;
  const out = record ? [] : null, S = veh.stages, beta0 = veh.beta;
  const m0of = []; let mm = 1;                                    // kademe başında kalkış kütlesine oran (yalnız sürüklenme için)
  for (let i = 0; i < S.length; i++) { m0of.push(mm); mm = mm / S[i].mr * (S[i].drop ?? 0.85); }
  let maxQ = { q: 0, t: 0, h: 0 };
  while (t < tgt.tEnd - 1e-9) {
    const h = r - tgt.r0, atm = atmosphere(h);
    const vrel = [vr, vt - wE * r], sp = Math.hypot(vrel[0], vrel[1]);
    const q = 0.5 * atm.rho * (sp * 1000) ** 2; if (q > maxQ.q) maxQ = { q, t, h };
    let si = -1; for (let i = 0; i < S.length; i++) if (t >= S[i].t0 && t < S[i].t1) si = i;
    let a = 0, psi = Math.PI / 2;
    if (si >= 0) {
      const s = S[si], frac = (t - s.t0) / (s.t1 - s.t0), mrel = 1 - (1 - 1 / s.mr) * frac;
      const pf = si === 0 && s.alt ? 1 + s.alt * (1 - atm.p / 101325) : 1;
      a = k * s.twr * G0 * pf / mrel;
      if (si === 0) {
        if (t < veh.tVert) psi = Math.PI / 2;
        else if (t < veh.tVert + veh.tPitch) psi = Math.PI / 2 - delta * (t - veh.tVert) / veh.tPitch;
        else psi = Math.atan2(vrel[0], vrel[1]);                  // yerçekimi dönüşü: itki atmosfere göre hız boyunca
      } else {
        const tau = Math.max(2, tgt.tEnd - t), g = MU / (r * r);
        const ar = 6 * (tgt.r1 - r - vr * tau) / (tau * tau) + 2 * vr / tau;   // girişte r = r1, v_r = 0
        psi = Math.asin(Math.max(-0.9, Math.min(0.9, (ar + g - vt * vt / r) / a)));
      }
    }
    if (record && (out.length === 0 || t - out[out.length - 1].t >= 1 - 1e-9)) out.push({ t, r, th, vr, vt, h, q, psi, stage: si, vrel: sp });
    // yarı örtük Euler yerine RK2 (orta nokta) — 0,5 s adımda yeterli
    const acc = (r_, vr_, vt_, mfrac) => {
      const atm_ = atmosphere(r_ - tgt.r0), vre = [vr_, vt_ - wE * r_], s_ = Math.hypot(vre[0], vre[1]);
      const bet = beta0 * (si >= 0 ? m0of[si] * (1 - (1 - 1 / S[si].mr) * mfrac) : 0.05);
      const D = s_ > 0 ? 0.5 * atm_.rho * (s_ * 1000) ** 2 / bet / 1000 : 0;     // km/s²
      const g = MU / (r_ * r_);
      return [vr_, vt_ / r_, vt_ * vt_ / r_ - g + a * Math.sin(psi) - D * vre[0] / (s_ || 1), -vr_ * vt_ / r_ + a * Math.cos(psi) - D * vre[1] / (s_ || 1)];
    };
    const h_ = Math.min(dt, tgt.tEnd - t), mf = si >= 0 ? (t - S[si].t0) / (S[si].t1 - S[si].t0) : 0;
    const k1 = acc(r, vr, vt, mf), k2 = acc(r + 0.5 * h_ * k1[0], vr + 0.5 * h_ * k1[2], vt + 0.5 * h_ * k1[3], mf);
    r += h_ * k2[0]; th += h_ * k2[1]; vr += h_ * k2[2]; vt += h_ * k2[3]; t += h_;
    if (r < tgt.r0 - 0.01) { r = tgt.r0; vr = Math.max(0, vr); }
  }
  if (record) out.push({ t, r, th, vr, vt, h: r - tgt.r0, q: 0, psi: 0, stage: -1, vrel: Math.hypot(vr, vt - wE * r) });
  return { r, th, vr, vt, out, maxQ };
}
// hedefe uyan güdümü çöz; dönüş: { x: [δ, k], res, samples, maxQ, ok, h1 }
export function solveAscent(veh, tgt) {
  const t1 = veh.stages[0].t1, hSep = veh.hSep;
  const hAt1 = (d, k) => { const e = fly(veh, { ...tgt, tEnd: t1 }, [d, k, 0]); return e.r - tgt.r0; };
  const vEnd = (d, k) => { const e = fly(veh, tgt, [d, k, 0]); return Math.hypot(e.vr, e.vt); };
  // 1) k = 1 iken δ: ayrılma irtifası (δ büyüdükçe azalır) — ikiye bölme
  let lo = 0.001, hi = 0.8;
  for (let j = 0; j < 30; j++) { const m = Math.sqrt(lo * hi); if (hAt1(m, 1) > hSep) lo = m; else hi = m; }
  let d = Math.sqrt(lo * hi), k = 1;
  // 2) (ln δ, k) birlikte: [h1 − hSep, v − v1] = 0 — sönümlü Newton (Saturn V gibi düşük itki/ağırlıkta tek tek çözmek kararsız)
  const G = (ld, kk) => { const dd = Math.exp(ld); return [(hAt1(dd, kk) - hSep) / 10, (vEnd(dd, kk) - tgt.v1) * 10]; };
  let ld = Math.log(d), g = G(ld, k), n0 = Math.hypot(...g);
  for (let it = 0; it < 30 && n0 > 1e-4; it++) {
    const ga = G(ld + 1e-3, k), gb = G(ld, k + 1e-4);
    const J = [[(ga[0] - g[0]) / 1e-3, (gb[0] - g[0]) / 1e-4], [(ga[1] - g[1]) / 1e-3, (gb[1] - g[1]) / 1e-4]], det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (!Number.isFinite(det) || Math.abs(det) < 1e-14) break;
    let dl = (-g[0] * J[1][1] + g[1] * J[0][1]) / det, dk = (-g[1] * J[0][0] + g[0] * J[1][0]) / det;
    dl = Math.max(-0.5, Math.min(0.5, dl)); dk = Math.max(-0.05, Math.min(0.05, dk));
    let st = 1, ok = false;
    for (let ls = 0; ls < 10; ls++) { const gn = G(ld + st * dl, k + st * dk), nn = Math.hypot(...gn); if (nn < n0) { ld += st * dl; k += st * dk; g = gn; n0 = nn; ok = true; break; } st /= 2; }
    if (!ok) break;
  }
  d = Math.exp(ld);
  const e = fly(veh, tgt, [d, k, 0], { record: true });
  const res = Math.hypot((e.r - tgt.r1) / 10, e.vr * 10, (Math.hypot(e.vr, e.vt) - tgt.v1) * 10);
  const ok = Math.abs(e.r - tgt.r1) < 1 && Math.abs(e.vr) < 0.08 && Math.abs(Math.hypot(e.vr, e.vt) - tgt.v1) < 0.01;   // 1 km, 80 m/s düşey, 10 m/s hız (kalan fark canlandırmada yumuşakça birleşir)
  return { x: [d, k], res, samples: e.out, maxQ: e.maxQ, ok, thEnd: e.th, h1: hAt1(d, k) };
}
function solve3(A, b) {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null; [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j < 4; j++) M[r][j] -= f * M[c][j]; }
  }
  return [0, 1, 2].map((i) => M[i][3] / M[i][i]);
}
// örneklerden t (gerçek s) anı: doğrusal ara değer
export function sampleAt(samples, t) {
  if (t <= samples[0].t) return samples[0];
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m].t <= t) lo = m; else hi = m; }
  const a = samples[lo], b = samples[hi], u = Math.min(1, Math.max(0, (t - a.t) / ((b.t - a.t) || 1)));
  const o = {}; for (const k of Object.keys(a)) o[k] = typeof a[k] === 'number' ? a[k] + (b[k] - a[k]) * u : a[k];
  o.stage = u < 0.5 ? a.stage : b.stage; return o;
}
