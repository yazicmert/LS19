// Görev iptali: o anki durumdan (ya da sonraki bir andan) tek itkisel yakışla Dünya'ya dönüş için gereken en küçük Δv.
// Tam kuvvet modeli (engine.js Propagator, N-cisim: Dünya + J2, Ay çekim alanı, Güneş): Ay yakınında Dünya merkezli iki cisimli Lambert yanlış olur
// (Ay'ın çekimi baskın). Hedef: Ay'ın etki küresi dışında, Dünya'ya dönüşte boşluk perijesi R⊕ + hp (Apollo giriş koridoru için ~40 km boşluk perijesi).
//   g(Δv) = dönüşteki en küçük Dünya uzaklığı (Ay'ın etki küresi dışında; atmosfere giriş arayüzünde durur).
//   1) Başlangıç: birkaç aday yönde (Ay'a ve Dünya'ya göre ileri/geri) büyüklük taraması, g hedefin altına inen en küçük büyüklük (ikiye bölme).
//   2) En küçük normlu çözüm: g(Δv) = hedef kısıtı altında |Δv| en küçük; doğrusallaştırılmış kısıtla yinelenir: Δv ← Jᵀ·(hedef − g + J·Δv)/(J·Jᵀ).
// Saf hesap (DOM yok); çağıran canlı efemerisi kurar (makeLive). abortwork.js iş parçacığında koşar; Node'da sınanır (test/test_abort.js).
// Kapsam: tek itkisel yakış ve en çok 10 günlük doğrudan dönüş. Alçak Ay yörüngesi (LLO) ve çeviri yolculuğu için sınandı. Halo/NRHO'da en ucuz yol
// iki yakışlı (ayrılış + Ay yakın geçişinde güçlendirilmiş geçiş, Artemis) olabilir: bu arama onu kapsamaz; okuma yalnız tek yakışlık dönüşü verir.
import * as E from './engine.js';
import { add, sub, scale, dot, norm, unit } from './vec3.js';

export const ABORT = { HP: 40, ENTRY_H: 120, TMAX: 10 * 86400, DVMAX: 3.5, H: 1800 };

// t anındaki N çerçevesi durumundan itkisiz süzülme: Dünya'ya dönüşteki boşluk perijesi (km; atmosfer modellenmez, perijeye dek sürülür),
// atmosfere giriş arayüzünü (R⊕ + 120 km) geçtiği an tEI; dönmezse sonundaki uzaklık. Ay'a bağlı kalan durum (Ay'a göre özgül enerji < 0) tümlenmeden elenir.
export function returnPerigee(t, r, v, tMax = ABORT.TMAX) {
  const rs = sub(r, E.moonPos(t)), vs = sub(v, E.moonVel(t)), rsn = norm(rs);
  if (rsn < E.SOI_M && 0.5 * dot(vs, vs) - E.MU_M / rsn < 0) return { rp: norm(r), tp: null, tEI: null, hp: norm(r) - E.R_E, bound: true };
  const P = new E.Propagator(new E.State(t, r, v, 'N'), E.dummyVehicle(), ABORT.H, 1.0, { nbody: true });
  const rEntry = E.R_E + ABORT.ENTRY_H, soi = E.SOI_M;
  let best = Infinity, tBest = null, tEI = null, prevRv = null, out = false;
  const stop = (Q) => {
    const rr = Q.s.r, vv = Q.s.v, rn = norm(rr), rm = norm(sub(rr, E.moonPos(Q.s.t)));
    if (rm < E.R_M + 5) { best = Infinity; return true; }                      // Ay'a çarptı
    if (rm > soi) {
      out = true;
      if (rn < best) { best = rn; tBest = Q.s.t; }
      if (tEI == null && rn < rEntry) tEI = Q.s.t;
      if (rn < 2000) return true;                                               // Dünya'nın derinine iniyor: perije bundan da alçak
      const rv = dot(rr, vv); if (prevRv != null && prevRv < 0 && rv >= 0) return true;   // perije geçti
      prevRv = rv;
    } else prevRv = null;
    return false;
  };
  P.runUntil(t + tMax, null, stop);
  if (!out) best = norm(P.s.r);
  return { rp: best, tp: tBest, tEI, hp: best - E.R_E };
}
// t anında Δv (km/s) uygulanırsa dönüş perijesi (km)
const gOf = (t, r, v, dv, tMax) => returnPerigee(t, r, add(v, dv), tMax).rp;

// en küçük dönüş Δv'si: { dv (km/s vektör), dvMag (m/s), hp (km), tEntry, ok } ya da { ok: false }
// fast: kaba büyüklük, en küçük norm inceltmesi yok; Ay'a bağlıysa yalnız Ay'a göre ileri yön (yakış anı taraması için)
export function solveReturn(t, r, v, { hp = ABORT.HP, tMax = ABORT.TMAX, dvMax = ABORT.DVMAX, fast = false } = {}) {
  const target = E.R_E + hp, g0 = gOf(t, r, v, [0, 0, 0], tMax);
  if (g0 <= target) { const p = returnPerigee(t, r, v, tMax); return { ok: true, dv: [0, 0, 0], dvMag: 0, hp: p.hp, tEntry: p.tEI ?? p.tp, free: true }; }
  // 1) aday yönler ve büyüklük taraması
  const vs = sub(v, E.moonVel(t));
  const dirs = [unit(vs), scale(unit(vs), -1), unit(v), scale(unit(v), -1)];
  let start = null;
  const rs = sub(r, E.moonPos(t)), rsn = norm(rs), inside = rsn < E.SOI_M;
  const bound = inside && 0.5 * dot(vs, vs) - E.MU_M / rsn < 0;
  for (const d of (fast && bound ? dirs.slice(0, 1) : dirs)) {                // Ay'a bağlıyken kaçış Ay'a göre ileri yönde en ucuzdur
    // Ay'a bağlıysa tarama kaçış eşiğinden başlar: |vs + m·d|² = 2μ/r çözümü (daha küçük Δv Ay'dan çıkamaz)
    let m0 = 0.05;
    if (inside) { const b = dot(vs, d), c = dot(vs, vs) - 2 * E.MU_M / rsn, disc = b * b - c; if (c < 0) { if (!(disc >= 0)) continue; m0 = Math.max(m0, -b + Math.sqrt(disc)); } }
    let lo = Math.max(0, m0 - 0.05), hi = null;
    for (let m = m0; m <= dvMax + 1e-9; m += 0.05) { if (gOf(t, r, v, scale(d, m), tMax) <= target) { hi = m; break; } lo = m; }
    if (hi == null) continue;
    for (let k = 0; k < (fast ? 10 : 20); k++) { const mid = 0.5 * (lo + hi); if (gOf(t, r, v, scale(d, mid), tMax) <= target) hi = mid; else lo = mid; }
    if (!start || hi < norm(start)) start = scale(d, hi);
  }
  if (!start) return { ok: false };
  if (fast) return { ok: true, dv: start, dvMag: norm(start) * 1000, fast: true };
  // 2) en küçük normlu çözüme yinele (sayısal Jacobian)
  let dv = start;
  for (let it = 0; it < 12; it++) {
    const g = gOf(t, r, v, dv, tMax), h = 2e-4, J = [0, 1, 2].map((k) => { const e = dv.slice(); e[k] += h; return (gOf(t, r, v, e, tMax) - g) / h; });
    const jj = dot(J, J); if (!(jj > 0) || !Number.isFinite(g)) break;
    const lam = (target - g + dot(J, dv)) / jj, nxt = scale(J, lam);
    // adım sınırı: doğrusallık bozulmasın
    let step = sub(nxt, dv); const sn = norm(step); if (sn > 0.2) step = scale(step, 0.2 / sn);
    const cand = add(dv, step), gc = gOf(t, r, v, cand, tMax);
    if (!Number.isFinite(gc) || gc > target + 2000) break;
    dv = cand;
    if (norm(step) < 1e-4 && Math.abs(gc - target) < 5) break;
  }
  // kısıtı tam karşıla: yön sabit, büyüklükte ikiye bölme
  const u = unit(dv); let lo = 0, hi = norm(dv) * 1.2;
  if (gOf(t, r, v, scale(u, hi), tMax) > target) hi = norm(start) / dot(unit(start), u) > 0 ? norm(start) * 1.5 : hi;
  for (let k = 0; k < 24; k++) { const mid = 0.5 * (lo + hi); if (gOf(t, r, v, scale(u, mid), tMax) <= target) hi = mid; else lo = mid; }
  dv = scale(u, hi);
  const p = returnPerigee(t, r, add(v, dv), tMax);
  return { ok: Math.abs(p.rp - target) < 50, dv, dvMag: hi * 1000, hp: p.hp, tEntry: p.tEI ?? p.tp, free: false };
}

// t'den sonraki 'span' saniye içinde yakış anı taraması: her an için süzülüp hızlı çözüm, en iyi anın çevresi inceltilir, orada tam çözüm.
// Ay yörüngesinde (LLO) dönüş yakışı yörüngenin belli bir noktasında yapılmalıdır (Apollo TEI); şimdi yakmak çoğu zaman olanaksızdır.
export function solveReturnWindow(t, r, v, { span = null, n = 16, onProgress = null, ...o } = {}) {
  const rs = sub(r, E.moonPos(t)), vs = sub(v, E.moonVel(t)), rsn = norm(rs), en = 0.5 * dot(vs, vs) - E.MU_M / rsn;
  // Ay'a bağlıysa (Ay'a göre özgül enerji < 0; NRHO'nun apolünü etki küresinin dışında kalabilir, bu yüzden uzaklık sınırı 1,5 × etki küresi)
  // bir oskülatör yörünge periyodu (en çok 8 gün), değilse 6 saat
  const bound = en < 0 && rsn < 1.5 * E.SOI_M, per = bound ? Math.min(8 * 86400, 2 * Math.PI * Math.sqrt((-E.MU_M / (2 * en)) ** 3 / E.MU_M)) : 6 * 3600;
  const T = span || per, P = new E.Propagator(new E.State(t, r, v, 'N'), E.dummyVehicle(), 60, 1.0, { nbody: true });
  const pts = [];
  for (let k = 0; k < n; k++) {
    const tb = t + T * k / n; P.runUntil(tb);
    const st = { t: tb, r: P.s.r.slice(), v: P.s.v.slice() }, f = solveReturn(st.t, st.r, st.v, { ...o, fast: true });
    pts.push({ ...st, dvMag: f.ok ? f.dvMag : Infinity });
    if (onProgress) onProgress((k + 1) / (n + 4));
  }
  let bi = pts.reduce((b, p, k) => (p.dvMag < pts[b].dvMag ? k : b), 0);
  if (!Number.isFinite(pts[bi].dvMag)) return { ok: false, period: per };
  // incelt: komşu iki aralığın ortaları
  const Q = new E.Propagator(new E.State(pts[bi].t, pts[bi].r, pts[bi].v, 'N'), E.dummyVehicle(), 60, 1.0, { nbody: true });
  for (const fr of [0.25, 0.5]) {
    Q.runUntil(pts[bi].t + fr * T / n);
    const f = solveReturn(Q.s.t, Q.s.r, Q.s.v, { ...o, fast: true });
    if (f.ok && f.dvMag < pts[bi].dvMag) pts.push({ t: Q.s.t, r: Q.s.r.slice(), v: Q.s.v.slice(), dvMag: f.dvMag });
  }
  bi = pts.reduce((b, p, k) => (p.dvMag < pts[b].dvMag ? k : b), 0);
  const b = pts[bi], full = solveReturn(b.t, b.r, b.v, o);
  if (onProgress) onProgress(1);
  return { ...full, tBurn: b.t, period: per, samples: pts.map((p) => ({ t: p.t, dvMag: p.dvMag })) };
}
