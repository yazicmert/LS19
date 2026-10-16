// Yakın geçiş (conjunction.js) ve NASA parçalanma modeli (breakup.js) doğrulaması:
//  • Foster çarpışma olasılığı: eşyönlü kovaryansta kapalı biçim (1 − e^{−R²/2σ²}) ve Rice dağılımı (kaçırmalı) ile; küçük R yaklaşımı; en kötü durum R²/(e d²)
//  • TCA bulucu: doğrusal harekette ve kesişen iki dairesel yörüngede analitik sonuçlarla; RTN bileşenleri
//  • Gerçek GP verisi (fixtures/gp_active.json) ile SGP4: tarama çalışır, sonuçlar fiziksel aralıkta
//  • Parçalanma: Johnson vd. 2001 formülleri, EMR eşiği, alan/kütle parametrelerinin sürekliliği, örneklenen dağılımların istatistiği,
//    Iridium 33 – Kosmos 2251 (2009) için modelin parça sayısı ve kataloglanan parçalarla karşılaştırma
import fs from 'fs';
import * as C from '../js/conjunction.js';
import * as B from '../js/breakup.js';
import * as S from '../lib/satellite.esm.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

console.log('çarpışma olasılığı');
{
  const s = 0.2, R = 0.05, C2 = [[s * s, 0], [0, s * s]];
  const exact = 1 - Math.exp(-R * R / (2 * s * s)), pc = C.pcFoster(0, C2, R);
  check(rel(pc, exact) < 2e-3, `kaçırma 0, σ = 200 m, R = 50 m: Foster ${pc.toExponential(4)} ↔ kapalı biçim ${exact.toExponential(4)}`);
  // Rice: Pc = ∫0^R (r/σ²) e^{−(r²+d²)/2σ²} I0(r d/σ²) dr
  const I0 = (x) => { let s0 = 1, t = 1; for (let k = 1; k < 200; k++) { t *= (x / (2 * k)) ** 2; s0 += t; if (t < 1e-17 * s0) break; } return s0; };
  for (const d of [0.1, 0.3, 0.6]) {
    let r0 = 0; const n = 20000; for (let i = 0; i < n; i++) { const r = (i + 0.5) * R / n; r0 += (r / (s * s)) * Math.exp(-(r * r + d * d) / (2 * s * s)) * I0(r * d / (s * s)) * R / n; }
    const pf = C.pcFoster(d, C2, R);
    check(rel(pf, r0) < 3e-3, `kaçırma ${d * 1000} m: Foster ${pf.toExponential(4)} ↔ Rice tümlevi ${r0.toExponential(4)}`);
  }
  const Ca = [[0.04, 0.012], [0.012, 0.25]], d = 0.4, Rs = 0.01, det = Ca[0][0] * Ca[1][1] - Ca[0][1] ** 2;
  const approx = Rs * Rs / (2 * Math.sqrt(det)) * Math.exp(-0.5 * d * d * Ca[1][1] / det), pa = C.pcFoster(d, Ca, Rs);
  check(rel(pa, approx) < 5e-3, `eğik kovaryans, küçük R: Foster ${pa.toExponential(3)} ↔ R²/(2√|C|)·e^(−½μᵀC⁻¹μ) ${approx.toExponential(3)}`);
  const mx = C.pcMax(1.0, [[1, 0], [0, 1]], 0.02), mxA = 0.02 ** 2 / (Math.E * 1.0 ** 2);
  check(rel(mx.pc, mxA) < 0.02 && rel(mx.scale, 1 / Math.SQRT2) < 0.02, `en kötü durum Pc ${mx.pc.toExponential(3)} ↔ R²/(e d²) ${mxA.toExponential(3)}, σ* = d/√2`);
  check(C.pcClass(2e-4) === 'kirmizi' && C.pcClass(3e-5) === 'sari' && C.pcClass(1e-7) === 'yesil', 'risk sınıfları: ≥ 1e-4 kırmızı, ≥ 1e-5 sarı');
}

console.log('en yakın yaklaşma (TCA)');
{
  const A = () => ({ r: [7000, 0, 0], v: [0, 7.5, 0] }), Bp = (t) => ({ r: [7000 + 0.8, -15 + 0.01 * (t - 3000), 2], v: [0, 7.5 + 0.01, 0] });
  // A sabit (göreli çerçevede), B y boyunca 10 m/s: TCA t = 4500 s, kaçırma √(0,8² + 2²) km
  const r = C.findTCAs(A, Bp, 0, 9000, 60);
  check(r.length === 1 && Math.abs(r[0].t - 4500) < 0.05 && rel(r[0].miss, Math.hypot(0.8, 2)) < 1e-6, `doğrusal hareket: TCA ${r[0] && r[0].t.toFixed(2)} s (4500), kaçırma ${r[0] && r[0].miss.toFixed(4)} km`);
  const e = C.encounter(A(), Bp(4500));
  check(rel(e.rtn[0], 0.8) < 1e-9 && Math.abs(e.rtn[1]) < 1e-9 && rel(e.rtn[2], 2) < 1e-9 && Math.abs(e.vRel - 0.01) < 1e-12, 'RTN bileşenleri: radyal 0,8, iz boyu 0, çapraz 2 km; göreli hız 10 m/s');
  // iki dairesel yörünge (aynı yarıçap, eğimler 0° ve 60°) düğümde t = 0'da kesişir; yarım periyotta karşı düğümde yine
  const mu = 398600.4418, a = 7000, n = Math.sqrt(mu / a ** 3), T = 2 * Math.PI / n;
  const orb = (inc) => (t) => { const u = n * t, ci = Math.cos(inc), si = Math.sin(inc); return { r: [a * Math.cos(u), a * Math.sin(u) * ci, a * Math.sin(u) * si], v: [-a * n * Math.sin(u), a * n * Math.cos(u) * ci, a * n * Math.cos(u) * si] }; };
  const r2 = C.findTCAs(orb(0), orb(Math.PI / 3), 0.37 * T, 1.37 * T, 20, 50);
  const tc = r2.map((x) => x.t / T);
  check(r2.length === 2 && r2.every((x) => x.miss < 1e-3) && Math.abs(tc[0] - 0.5) < 1e-6 && Math.abs(tc[1] - 1) < 1e-6, `kesişen dairesel yörüngeler: düğümlerde kaçırma ${r2.map((x) => (x.miss * 1e3).toFixed(2) + ' m').join(', ')} (T/2, T)`);
  const e2 = C.encounter(orb(0)(T / 2), orb(Math.PI / 3)(T / 2));
  check(Math.abs(e2.approachAngle - 60) < 1e-6 && rel(e2.vRel, 2 * a * n * Math.sin(Math.PI / 6)) < 1e-9, `karşılaşma açısı ${e2.approachAngle.toFixed(3)}°, göreli hız ${(e2.vRel).toFixed(3)} km/s = 2v sin(30°)`);
}

console.log('gerçek GP verisi (SGP4)');
{
  const gp = JSON.parse(fs.readFileSync(new URL('./fixtures/gp_active.json', import.meta.url)));
  const iss = gp.find((o) => /ISS \(ZARYA\)/.test(o.OBJECT_NAME)) || gp[0];
  const prop = (o) => { const sr = S.json2satrec(o); return (t) => { const pv = S.propagate(sr, new Date(Date.parse(iss.EPOCH + 'Z') + t * 1000)); return pv && pv.position ? { r: [pv.position.x, pv.position.y, pv.position.z], v: [pv.velocity.x, pv.velocity.y, pv.velocity.z] } : null; }; };
  const pA = C.perApo(iss), cands = gp.filter((o) => o !== iss).map((o) => ({ o, q: C.perApo(o) })).filter(({ q }) => q.hp < pA.ha + 50 && q.ha > pA.hp - 50);
  const T0 = Date.now(), sc = C.screen(prop(iss), cands.map(({ o }) => ({ name: o.OBJECT_NAME, prop: prop(o) })), 0, 86400, { dt: 30, gate: 200 });
  const ev = sc.events.map((x) => ({ ...x, name: x.cand.name }));
  check(sc.coorbital.length > 0 && sc.coorbital.every((c) => /^ISS \(|POISK|NAUKA|PRICHAL|RASSVET/.test(c.name)), `kenetli cisimler ayıklandı: ${sc.coorbital.map((c) => c.name).join(', ')}`);
  check(pA.hp > 350 && pA.ha < 450 && Math.abs(pA.inc - 51.6) < 0.2, `ISS yükseklik aralığı ${pA.hp.toFixed(0)}–${pA.ha.toFixed(0)} km, eğim ${pA.inc.toFixed(2)}°`);
  check(cands.length > 0 && ev.every((x) => x.miss >= 0 && x.miss < 200), `apoje/perije süzgeci: ${cands.length}/${gp.length - 1} aday; 24 saatte 200 km içinde ${ev.length} yaklaşma (en yakın ${ev[0] ? ev[0].miss.toFixed(1) + ' km, ' + ev[0].name : '—'}) · ${Date.now() - T0} ms`);
  if (ev[0]) {
    const a = prop(iss)(ev[0].t), oB = gp.find((o) => o.OBJECT_NAME === ev[0].name), b = prop(oB)(ev[0].t), e = C.encounter(a, b);
    check(rel(e.miss, ev[0].miss) < 1e-6 && e.vRel > 0 && e.vRel < 16, `TCA'da kaçırma ${e.miss.toFixed(2)} km, göreli hız ${e.vRel.toFixed(2)} km/s (LEO'da ≤ ~15,5)`);
  }
}

console.log('NASA parçalanma modeli');
{
  const ic = B.collision(560, 900, 11.7);
  check(ic.catastrophic && rel(ic.emr, 0.5 * 560 * 11700 ** 2 / 900 / 1000) < 1e-12, `Iridium 33 – Kosmos 2251: EMR ${ic.emr.toFixed(0)} J/g ≥ 40 → felaket`);
  const n10 = 0.1 * 1460 ** 0.75 * 0.1 ** -1.71;
  check(rel(ic.N10cm, n10) < 1e-12 && ic.N10cm > 1100 && ic.N10cm < 1400, `model ≥ 10 cm parça: ${ic.N10cm.toFixed(0)} (kataloglanan ~2.300: model büyük çarpışmalarda ~2 kat düşük kalır; bilinen sınır)`);
  check(rel(ic.N1cm / ic.N10cm, 10 ** 1.71) < 1e-12 && rel(ic.N10cm / ic.N1m, 10 ** 1.71) < 1e-12, 'boyut dağılımı N(Lc) ∝ Lc^−1,71');
  const nc = B.collision(420000, 1, 10);
  check(!nc.catastrophic && rel(nc.M, 100) < 1e-12 && nc.emr < 40, `1 kg parça → 420 t istasyon, 10 km/s: EMR ${nc.emr.toFixed(3)} J/g < 40, felaket değil, M = m_p v² = 100`);
  check(rel(B.explosion(1).N10cm, 6 * 0.1 ** -1.6) < 1e-12, 'patlama N = 6 S Lc^−1,6');
  check(rel(B.area(0.00167 - 1e-12), B.area(0.00167 + 1e-12)) < 2e-3, 'kesit alanı bağıntısı 1,67 mm\'de sürekli');
  let cont = true;
  for (const ty of ['uydu', 'roket']) for (const k of ['alpha', 'mu1', 's1', 'mu2', 's2', 'muS', 'sS']) for (let l = -4; l <= 1; l += 0.001) {
    const a = B.amParams(l, ty)[k], b = B.amParams(l + 0.001, ty)[k]; if (Math.abs(a - b) > 0.01) cont = false;
  }
  check(cont, 'alan/kütle parametreleri λ boyunca sürekli (uydu ve roket gövdesi, 7 parametre)');
  const fr = B.sampleFragments({ n: 40000, LcMin: 0.1, LcMax: 1, seed: 3 });
  const fBig = fr.filter((f) => f.Lc > 0.2).length / fr.length, eBig = (0.2 ** -1.71 - 1) / (0.1 ** -1.71 - 1);
  check(Math.abs(fBig - eBig) < 0.01, `örneklenen Lc güç yasası: Lc > 20 cm oranı ${fBig.toFixed(4)} ↔ ${eBig.toFixed(4)}`);
  let sx = 0, sxx = 0; for (const f of fr) { const r = Math.log10(f.dv) - (0.9 * Math.log10(f.am) + 2.9); sx += r; sxx += r * r; }
  const mean = sx / fr.length, sd = Math.sqrt(sxx / fr.length - mean * mean);
  check(Math.abs(mean) < 0.01 && Math.abs(sd - 0.4) < 0.01, `ayrılma hızı: log10 Δv − (0,9χ + 2,9) ortalaması ${mean.toFixed(4)}, sapması ${sd.toFixed(3)} (0,4)`);
  const g = B.gabbard([{ dv: 0, dir: [1, 0, 0] }], [7000, 0, 0], [0, 7.5, 0])[0], mu = 398600.4418, a = 1 / (2 / 7000 - 7.5 ** 2 / mu);
  check(rel(g.a, a) < 1e-12 && rel(g.P, 2 * Math.PI * Math.sqrt(a ** 3 / mu) / 60) < 1e-12, 'Gabbard: Δv = 0 parça ana yörüngeyi verir');
  check(B.charLengthFromMass(900) > 1 && B.charLengthFromMass(900) < 5, `900 kg uydunun karakteristik boyu ${B.charLengthFromMass(900).toFixed(2)} m`);
}
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
