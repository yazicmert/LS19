// Saptırma belirsizliği (uncert.js): kovaryans ayrıştırma, öğe dönüşümleri, B-düzlemine doğrusal taşıma ↔ örneklenmiş yörüngelerin tam tümlemesi,
// Monte Carlo olasılıkları ve kütle/β belirsizlik modeli.
import fs from 'fs';
import * as D from '../js/deflect.js';
import * as U from '../js/uncert.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const eng = new D.DeflectEngine(ab(new URL('../data/de440s.bsp', import.meta.url)));
const j = JSON.parse(fs.readFileSync(new URL('./fixtures/sbdb_99942.json', import.meta.url)));
eng.ng = D.ngFromSbdb(j.orbit.model_pars);

// ---------------------------------------------------------------- 1. tohumlu normal dağılım
{
  const R = U.rng(7); let s = 0, s2 = 0; const N = 20000;
  for (let k = 0; k < N; k++) { const x = R.normal(); s += x; s2 += x * x; }
  const R2 = U.rng(7);
  check(Math.abs(s / N) < 0.02 && Math.abs(s2 / N - 1) < 0.03 && R2.normal() === U.rng(7).normal(), 'rng: ortalama 0, varyans 1, aynı tohum aynı dizi');
}

// ---------------------------------------------------------------- 2. kütle ve β belirsizliği
check(Math.abs(U.massSigma({ GM: 2, GMsig: 0.2 }) - 0.1) < 1e-12, 'ölçülmüş GM: σ = GMσ/GM');
check(Math.abs(U.massSigma({ D: 0.34, Dsig: 0.04, Dmeasured: true }) - Math.hypot(3 * 0.04 / 0.34, 0.3)) < 1e-12, 'ölçülmüş çap (Apophis 0,34 ± 0,04 km) + tahmini yoğunluk');
check(Math.abs(U.massSigma({}) - Math.hypot(1.05, 0.3)) < 1e-12 && U.massSigma({ rhoMeasured: true, Dmeasured: true }) < U.massSigma({}), 'mutlak parlaklıktan çap: kütle belirsizliği en büyük');
check(Math.abs(U.dvSigma('kinetic', 0.3) - Math.hypot(0.3, 0.25)) < 1e-12 && U.dvSigma('thrust', 0.3) === 0.3, 'Δv belirsizliği: kinetikte β da katılır');
check(U.dvSigma('tractor', 1.1, 0.25, 0.35) === 0.7 && U.diamSigma({ Dmeasured: true, D: 0.34, Dsig: 0.04 }) === 0.04 / 0.34, 'çekim traktörü: Δv ∝ 1/R², kütleden bağımsız (σ = 2·σ_D)');

// ---------------------------------------------------------------- 3. Monte Carlo
{
  const base = { n0: [0, 0], shift: [10000, 0], bE: 10000, sDv: 0.3, SB: null, N: 20000, seed: 3 };
  const m = U.monteCarlo(base);
  check(m.pImpact0 === 1 && Math.abs(m.pImpact - 0.5) < 0.02, 'kayma = yakalama yarıçapı, Δv belirsiz → kurtulma olasılığı %50: ' + (1 - m.pImpact).toFixed(3));
  const need = U.dvForConfidence(1, 0.3, 1);                                  // 1σ: %84
  const m2 = U.monteCarlo({ ...base, shift: [10000 * need, 0] });
  check(Math.abs(1 - m2.pImpact - 0.8413) < 0.015, '%84 güven için gereken Δv çarpanı exp(σ): ' + (1 - m2.pImpact).toFixed(3));
  const m3 = U.monteCarlo({ ...base, sDv: 0, shift: [3000, 4000], n0: [20000, 0] });
  check(m3.pImpact0 === 0 && m3.pImpact === 0 && m3.kQ.every((k) => k === 1), 'belirsizlik yoksa sonuç deterministik');
  const m4 = U.monteCarlo({ n0: [0, 0], shift: [0, 0], bE: 1, sDv: 0, SB: [[1, 0], [0, 1]], N: 40000, seed: 5 });
  check(Math.abs(m4.pImpact0 - (1 - Math.exp(-0.5))) < 0.01, 'yörünge hatası: 2B normal, 1σ dairesinin içi %39,3: ' + m4.pImpact0.toFixed(3));
  const e = U.ellipse([[4, 0], [0, 1]]), e2 = U.ellipse([[2.5, 1.5], [1.5, 2.5]]);
  check(Math.abs(e.s1 - 2) < 1e-12 && Math.abs(e.s2 - 1) < 1e-12 && Math.abs(e.ang) < 1e-12 && Math.abs(e2.s1 - 2) < 1e-12 && Math.abs(e2.ang - Math.PI / 4) < 1e-12, 'kovaryans elipsi: yarı eksenler ve açı');
}

// ---------------------------------------------------------------- 4. JPL kovaryansı → B-düzlemi
// Depodaki JPL yanıtı kovaryans içermez (cov=mat sonradan eklendi); biçim JPL SBDB API belgesine göre kurulur (labels, data, epoch):
// kovaryans yörüngeyle aynı devirde, öğeler yörüngeden. Varyanslar çözüm 220'nin ölçeğinde seçildi (B-düzleminde birkaç km).
const sig = [3e-9, 1e-9, 2e-6, 3e-7, 4e-7, 2e-7], labels = ['e', 'q', 'tp', 'node', 'peri', 'i', 'A1', 'A2'];
const rho01 = 0.6;                                                            // e–q ilişkisi (gerçek çözümlerde güçlüdür)
const data = labels.map((_, r) => labels.map((__, c) => (r < 6 && c < 6 ? (r === c ? sig[r] ** 2 : (r + c === 1 ? rho01 * sig[0] * sig[1] : 0)) : r === c ? 1e-30 : 0)));
const cov = U.covFromSbdb({ ...j.orbit, covariance: { epoch: j.orbit.epoch, labels, data } });
check(cov && cov.C.length === 6 && Math.abs(cov.C[0][1] - rho01 * sig[0] * sig[1]) < 1e-30 && cov.epoch === +j.orbit.epoch, 'kovaryans ayrıştırma: 6×6 blok (A1, A2 atılır), öğeler yörüngeden');
const lower = data.map((row, r) => row.slice(0, r + 1));
const covL = U.covFromSbdb({ ...j.orbit, covariance: { epoch: j.orbit.epoch, labels, data: lower } });
check(covL && covL.C.every((row, a) => row.every((x, b) => x === cov.C[a][b])), 'alt üçgen biçimi de okunur');
check(U.covFromSbdb({ ...j.orbit, covariance: { epoch: 2459215.5, labels, data } }) === null && U.covFromSbdb(j.orbit) === null, 'farklı devirde öğesiz kovaryans ya da kovaryanssız yanıt: null');

const el0 = {}; for (const x of j.orbit.elements) el0[x.name] = +x.value;
const kep = U.cometaryToKepler(cov.el, cov.epoch);
check(Math.abs(kep.a - el0.a) < 1e-12 && Math.abs(((kep.ma - el0.ma + 540) % 360) - 180) < 1e-7, 'kuyrukluyıldız öğeleri (q, tp) → a, ortalama anomali: SBDB ile aynı');

const et0 = D.etFromJd(cov.epoch), helio = (e) => D.keplerHelio(U.cometaryToKepler(e, cov.epoch), et0);
const ssb = (e) => { const [r, v] = helio(e), [ps, vs] = eng.sun(et0); return [r[0] + ps[0], r[1] + ps[1], r[2] + ps[2], v[0] + vs[0], v[1] + vs[1], v[2] + vs[2]]; };
const y0 = ssb(cov.el), etEnd = D.etFromJd(2462250.5);
const ca = eng.scan(et0, y0, etEnd, { maxDist: 0.01 * D.AU }).list[0];
const { b0, J } = eng.bplanePartials(ca), Phi = eng.stm(et0, y0, ca.et)[0].Phi;
const SB = U.bplaneCov(J, Phi, U.stateJacobian(cov.el, helio), cov.C), E = U.ellipse(SB);
console.log(`  doğrusal: σ1 ${E.s1.toFixed(2)} km, σ2 ${E.s2.toFixed(2)} km, açı ${(E.ang * 180 / Math.PI).toFixed(1)}°`);
// örneklenmiş öğeler (Cholesky) → tam tümleme → B-düzlemi
const L = (() => { const n = 6, A = cov.C, M = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let k = 0; k <= i; k++) { let s = A[i][k]; for (let p = 0; p < k; p++) s -= M[i][p] * M[k][p]; M[i][k] = i === k ? Math.sqrt(s) : s / M[k][k]; } return M; })();
const R = U.rng(11), keys = ['e', 'q', 'tp', 'om', 'w', 'i'], pts = [];
for (let k = 0; k < 150; k++) {
  const z = keys.map(() => R.normal()), el = { ...cov.el };
  keys.forEach((kk, i) => { let d = 0; for (let p = 0; p <= i; p++) d += L[i][p] * z[p]; el[kk] += d; });
  const c2 = eng.scan(ca.et - 20 * 86400, eng.integrate(et0, ssb(el), ca.et - 20 * 86400).y, ca.et + 5 * 86400, { maxDist: 0.01 * D.AU }).list[0];
  const b = eng.bplaneAt(c2), B = [b.xi * b.xh[0] + b.zeta * b.zh[0], b.xi * b.xh[1] + b.zeta * b.zh[1], b.xi * b.xh[2] + b.zeta * b.zh[2]];
  pts.push([B[0] * b0.xh[0] + B[1] * b0.xh[1] + B[2] * b0.xh[2] - b0.xi, B[0] * b0.zh[0] + B[1] * b0.zh[1] + B[2] * b0.zh[2] - b0.zeta]);
}
const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, mz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
const Sx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0) / (pts.length - 1), Sz = pts.reduce((s, p) => s + (p[1] - mz) ** 2, 0) / (pts.length - 1);
const Sxz = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - mz), 0) / (pts.length - 1), EN = U.ellipse([[Sx, Sxz], [Sxz, Sz]]);
console.log(`  örneklem (150 tam tümleme): σ1 ${EN.s1.toFixed(2)} km, σ2 ${EN.s2.toFixed(2)} km, açı ${(EN.ang * 180 / Math.PI).toFixed(1)}°`);
const dAng = Math.abs(((E.ang - EN.ang) * 180 / Math.PI + 270) % 180 - 90);
check(Math.abs(EN.s1 / E.s1 - 1) < 0.15 && dAng < 5 && Math.hypot(mx, mz) < 0.3 * E.s1, 'doğrusal taşıma (J·Φ·Jx) örneklenmiş yörüngelerin tam tümlemesiyle uyumlu (büyük eksen %15, açı 5° içinde)');
check(E.s1 > 0.1 && E.s1 < 1000, 'Apophis 2029 B-düzlemi belirsizliği km düzeyinde: ' + E.s1.toFixed(2) + ' km');

console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
