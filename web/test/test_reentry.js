// Yeniden giriş modeli (reentry.js) doğrulaması:
//  • bozunma: üstel atmosferde dairesel yörünge ömrü analitik tümlevle; eksantrik yörüngede dairesellenme; Güneş etkinliği yönü; ISS bozunma hızı aralığı
//  • atmosfere giriş: dik girişte Allen–Eggers en büyük yavaşlaması (v² |sinγ| / 2eH), sığ balistik girişte ~8–9 g (Vostok türü), enerji tutarlılığı
//  • enlem bandı olasılıkları, B* ↔ balistik katsayı
import * as Q from '../js/reentry.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const MU = Q.MU, RE = Q.RE;

console.log('yörünge bozunması');
{
  const H = 50, rho0 = 3e-12, h0 = 400, BC = 100, rhoFn = (h) => rho0 * Math.exp(-(h - h0) / H);
  const a0 = RE + 400, a1 = RE + 120;
  // t = ∫ BC / (ρ √(μa)) da  (a km, ρ kg/m³ → ρ/BC 1/m = 1e3 1/km)
  let tA = 0; const n = 200000; for (let i = 0; i < n; i++) { const a = a1 + (i + 0.5) * (a0 - a1) / n; tA += (a0 - a1) / n / (rhoFn(a - RE) * 1e3 / BC * Math.sqrt(MU * a)); }
  const r = Q.decay({ a0, BC, rhoFn, maxYears: 1e4 });
  check(rel(r.lifeDays * 86400, tA) < 0.01, `dairesel yörünge, üstel atmosfer: ömür ${(r.lifeDays / 365.25).toFixed(3)} yıl ↔ analitik ${(tA / 86400 / 365.25).toFixed(3)} yıl`);
  const e = Q.decay({ a0: RE + 800, e0: 0.03, BC: 50, model: 'vallado', maxYears: 400 });
  let circ = true; for (let i = 1; i < e.curve.length; i++) if (e.curve[i][2] - e.curve[i][1] > e.curve[i - 1][2] - e.curve[i - 1][1] + 1e-6) circ = false;
  check(circ && e.curve[e.curve.length - 1][2] - e.curve[e.curve.length - 1][1] < e.curve[0][2] - e.curve[0][1], `eksantrik yörünge (e = 0,03): apoje perijeye iner (dairesellenme), ömür ${(e.lifeDays / 365.25).toFixed(1)} yıl`);
  const lo = Q.decay({ a0: RE + 450, BC: 100, model: 'gunes', F107: 70, Ap: 4 }), hi = Q.decay({ a0: RE + 450, BC: 100, model: 'gunes', F107: 250, Ap: 30 });
  check(lo.lifeDays > 2 * hi.lifeDays, `Güneş etkinliği: 450 km, BC 100 — F10,7 = 70'te ${(lo.lifeDays / 365.25).toFixed(1)} yıl, 250'de ${(hi.lifeDays / 365.25).toFixed(1)} yıl`);
  check(rel(Q.density(400), 3.725e-12) < 1e-9 && Q.density(400, 'gunes', 70, 0) < Q.density(400, 'gunes', 250, 30), `yoğunluk: Vallado 400 km ${Q.density(400).toExponential(3)} kg/m³; F10,7 ile artar (${Q.density(400, 'gunes', 70, 0).toExponential(2)} → ${Q.density(400, 'gunes', 250, 30).toExponential(2)})`);
  let cont = true; for (let h = 140; h <= 200; h += 0.5) if (Math.abs(Math.log(Q.density(h + 0.5, 'gunes', 150, 15) / Q.density(h, 'gunes', 150, 15))) > 0.2) cont = false;
  check(cont, 'Güneşe duyarlı model 150–180 km geçişinde sürekli');
  const iss = Q.decay({ a0: RE + 415, BC: 140, model: 'gunes', F107: 150, Ap: 15 });
  const kmMonth = -iss.decayNowKmDay * 30;
  check(kmMonth > 1 && kmMonth < 5, `ISS benzeri (415 km, BC ≈ 140 kg/m², F10,7 = 150): ${kmMonth.toFixed(2)} km/ay alçalma (tipik 1–5 km/ay, Güneş etkinliğine bağlı)`);
  check(rel(Q.bcFromBstar(0.157 / (2 * 120)), 120) < 1e-12, 'B* = ρ0 / (2 BC) ↔ BC dönüşümü');
}

console.log('atmosfere giriş');
{
  const v0 = 7.5, g0 = -30, r = Q.entry({ v0, gamma0Deg: g0, BC: 300 });
  const Hloc = (h) => { const d = 0.5; return d / Math.log(Q.density(h) / Q.density(h + d)); };
  const ae = (v0 * 1000) ** 2 * Math.abs(Math.sin(g0 * Math.PI / 180)) / (2 * Math.E * Hloc(r.peakGh) * 1000) / 9.80665;
  check(rel(r.peakG, ae) < 0.1, `dik giriş (−30°): en büyük yavaşlama ${r.peakG.toFixed(1)} g ↔ Allen–Eggers ${ae.toFixed(1)} g (H = ${Hloc(r.peakGh).toFixed(2)} km, ${r.peakGh.toFixed(0)} km'de)`);
  const r2 = Q.entry({ v0, gamma0Deg: -30, BC: 3000 }), ae2 = (v0 * 1000) ** 2 * 0.5 / (2 * Math.E * Hloc(r2.peakGh) * 1000) / 9.80665;
  check(rel(r2.peakG, ae2) < 0.1 && r2.peakGh < r.peakGh, `Allen–Eggers: yavaşlama BC'den bağımsız, yalnız yerel ölçek yüksekliğine bağlı (BC 3000: ${r2.peakG.toFixed(1)} g ↔ ${ae2.toFixed(1)} g), tepe daha alçakta (${r2.peakGh.toFixed(0)} km)`);
  const s = Q.entry({ v0: 7.8, gamma0Deg: -0.1, BC: 100, rn: 1 });
  check(s.peakG > 6 && s.peakG < 12 && s.tBreak > 0 && s.peakQ > 1e5, `sığ balistik giriş (−0,1°, BC 100): ${s.peakG.toFixed(1)} g (${s.peakGh.toFixed(0)} km), ısı akısı ${(s.peakQ / 1e4).toFixed(0)} W/cm², 78 km'ye ${s.tBreak.toFixed(0)} s / ${s.sBreak.toFixed(0)} km`);
  check(s.vGround < 0.4 && s.sGround > s.sBreak, `yere varış: ${(s.vGround * 1000).toFixed(0)} m/s (uç hız), toplam yer menzili ${s.sGround.toFixed(0)} km`);
}

console.log('enlem bandı');
{
  const b = Q.latitudeBand(51.6), sum = b.reduce((x, y) => x + y.p, 0);
  check(Math.abs(sum - 1) < 1e-9 && b.filter((x) => x.lo >= 51.6 || x.hi <= -51.6).every((x) => x.p === 0), `ISS eğimi (51,6°): olasılıklar toplamı 1, ±51,6° dışında 0`);
  const top = b.reduce((m, x) => (x.p > m.p ? x : m));
  check(Math.abs(Math.abs(top.lo + 5) - 45) <= 5, `en sık enlem bandı eğime yakın (${top.lo}°…${top.hi}°)`);
  const p = Q.latitudeBand(97.6), s2 = p.reduce((x, y) => x + y.p, 0);
  check(Math.abs(s2 - 1) < 1e-9, 'güneş eşzamanlı (97,6°): retrograd eğim 82,4° gibi davranır');
}
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
