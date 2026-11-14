// Saptırma motoru doğrulaması: Apophis 2029 yakın geçişi (JPL CAD ile), doğrusal STM ile doğrusal olmayan saptırmanın uyumu, DART
import fs from 'fs';
import * as D from '../js/deflect.js';
import { unit } from '../js/vec3.js';
import assert from 'assert';
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const eng = new D.DeflectEngine(ab(new URL('../data/de440s.bsp', import.meta.url)));
const dir = process.argv[2] || new URL('./fixtures/', import.meta.url).pathname;
const load = (des) => {
  const j = JSON.parse(fs.readFileSync(dir + 'sbdb_' + des + '.json')), el = {};
  for (const x of j.orbit.elements) el[x.name] = +x.value;
  return { name: j.object.fullname, el: { a: el.a, e: el.e, i: el.i, om: el.om, w: el.w, ma: el.ma, epoch: +j.orbit.epoch }, ca: j.ca_data, ng: D.ngFromSbdb(j.orbit.model_pars) };
};
function start(o) {
  const et = D.etFromJd(o.el.epoch), [r, v] = D.keplerHelio(o.el, et), [ps, vs] = eng.sun(et);
  return { et, y: [r[0] + ps[0], r[1] + ps[1], r[2] + ps[2], v[0] + vs[0], v[1] + vs[1], v[2] + vs[2]] };
}
const A = load('99942'), s = start(A);
// Kütleçekimsel olmayan model: JPL çözümü 220'nin A1/A2'si (Yarkovsky), g(r) = 1/r²
assert(A.ng && Math.abs(A.ng.A2 + 2.9018e-14) < 1e-17 && A.ng.NM === 2 && A.ng.R0 === 1 && A.ng.NK === 0, 'model_pars okunmalı');
assert(Math.abs(D.ngG(A.ng, D.AU) - 1) < 1e-12 && Math.abs(D.ngG(A.ng, 2 * D.AU) - 0.25) < 1e-12, 'g(r) = 1/r²');
assert.strictEqual(D.ngFromSbdb([{ name: 'A1', value: '0' }]), null, 'model yoksa null');
// Dünya kutbu: J2000'de ICRF z ekseni, 2029'da ~0,16° presesyon
{ const p0 = D.earthPole(0), p1 = D.earthPole(D.etFromJd(2462240.5)), ang = Math.acos(p1[2]) * 180 / Math.PI;
  assert(Math.abs(p0[2] - 1) < 1e-15 && ang > 0.15 && ang < 0.17, 'kutup ' + ang); }
eng.ng = A.ng;
let T = performance.now();
const sc = eng.scan(s.et, s.y, D.etFromJd(2463000.5), { maxDist: 0.05 * D.AU });
console.log(A.name, 'tarama', ((performance.now() - T) / 1000).toFixed(2), 's, adım', sc.steps, 'fev', eng.nfev);
const cad = A.ca.find((c) => c.cd.startsWith('2029-Apr-13'));
for (const c of sc.list) {
  const jd = D.jdFromEt(c.et);
  console.log('  CA JD', jd.toFixed(6), 'mesafe', c.dist.toFixed(1), 'km  vrel', c.vrel.toFixed(3));
}
const ca = sc.list.reduce((a, b) => (a.dist < b.dist ? a : b));
const _dt = (D.jdFromEt(ca.et) - +(cad.jd || 0)) * 86400;
console.log('  JPL CAD', cad.cd, (+cad.dist * D.AU).toFixed(1), 'km; fark', (ca.dist - cad.dist * D.AU).toFixed(1), 'km');
assert(Math.abs(ca.dist - cad.dist * D.AU) < 1, 'Apophis 2029 JPL CAD ile 1 km içinde (Yarkovsky + Dünya J2 ile)');
// 2051 geçişi: 2029'daki 38.000 km'lik geçişten sonra (çekim saçılması yörüngeyi büyütür); Yarkovsky'siz model ~157.000 km ve ~4 saat sapar
{ const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const cdJd = (cd) => { const m = /^(\d+)-(\w+)-(\d+) (\d+):(\d+)/.exec(cd); return Date.UTC(+m[1], MON[m[2]], +m[3], +m[4], +m[5]) / 864e5 + 2440587.5 + 69.184 / 86400; };
  const c51 = A.ca.find((c) => c.cd.startsWith('2051-Apr-20')), j51 = cdJd(c51.cd);
  const s51 = eng.scan(ca.et, ca.y, D.etFromJd(j51 + 30), { maxDist: 0.05 * D.AU }).list.reduce((a, b) => (Math.abs(D.jdFromEt(a.et) - j51) < Math.abs(D.jdFromEt(b.et) - j51) ? a : b));
  const dd = s51.dist - c51.dist * D.AU, dt = (D.jdFromEt(s51.et) - j51) * 1440;
  console.log('  2051:', s51.dist.toFixed(0), 'km; JPL', (c51.dist * D.AU).toFixed(0), 'km; fark', dd.toFixed(0), 'km,', dt.toFixed(1), 'dk');
  assert(Math.abs(dd) < 0.001 * c51.dist * D.AU && Math.abs(dt) < 5, '2051 geçişi JPL ile %0,1 ve 5 dk içinde'); }
const bp = eng.bplaneAt(ca);
console.log('  B-düzlemi b', bp.b.toFixed(0), 'ξ', bp.xi.toFixed(0), 'ζ', bp.zeta.toFixed(0), 'bE', bp.bE.toFixed(0), 'rp', bp.rp.toFixed(1), 'vinf', bp.vinf.toFixed(3));
// saptırma: 2027-01-01'de yörünge boyunca 1 cm/s
const etA = D.etFromJd(2461406.5), stA = eng.integrate(s.et, s.y, etA).y;
T = performance.now();
const tr = eng.stm(etA, stA, ca.et - 3 * 86400);                              // CA'dan 3 gün önceye kadar STM
const _nom = eng.integrate(ca.et - 3 * 86400, tr[0].y, ca.et);                   // (kontrol)
console.log('  STM', ((performance.now() - T) / 1000).toFixed(2), 's');
// STM'yi CA'ya uzat
const tr2 = eng.stm(etA, stA, ca.et);
const Phi = tr2[0].Phi, { J } = eng.bplanePartials(ca);
const vdir = unit(stA.slice(3, 6)), dvm = 0.01e-3;                          // 1 cm/s
const dx = Phi.map((row) => row[3] * vdir[0] + row[4] * vdir[1] + row[5] * vdir[2]);
const [_pE] = eng.earth(ca.et);
const dXi = J[0].reduce((s2, jk, k) => s2 + jk * dx[k], 0) * dvm, dZeta = J[1].reduce((s2, jk, k) => s2 + jk * dx[k], 0) * dvm;
// doğrusal olmayan
const y1 = stA.slice(); for (let k = 0; k < 3; k++) y1[3 + k] += vdir[k] * dvm;
const sc2 = eng.scan(etA, y1, ca.et + 5 * 86400, { maxDist: 0.01 * D.AU });
const ca2 = sc2.list.reduce((a, b) => (a.dist < b.dist ? a : b)), bp2 = eng.bplaneAt(ca2);
console.log('  1 cm/s along (2027-01): doğrusal Δξ', dXi.toFixed(1), 'Δζ', dZeta.toFixed(1), ' | doğrusal olmayan Δξ', (bp2.xi - bp.xi).toFixed(1), 'Δζ', (bp2.zeta - bp.zeta).toFixed(1), 'Δt', (ca2.et - ca.et).toFixed(1), 's');
assert(Math.abs(dZeta - (bp2.zeta - bp.zeta)) < 0.01 * Math.abs(dZeta) && Math.abs(dXi - (bp2.xi - bp.xi)) < 2, 'STM doğrusal tahmini doğrusal olmayan çözümle uyumlu');
// çekim traktörü (Lu ve Love 2005): 20 t, Apophis (R 170 m, M 4×10¹⁰ kg) merkezinden 340 m → F ≈ 0,46 N; ivme G·m/d² kütleden bağımsız
{ const F = D.tractorForce(4e10, 2e4, 340); assert(Math.abs(F - 0.4619) < 0.001 && Math.abs(F / 4e10 - D.tractorForce(1, 2e4, 340)) < 1e-20, 'çekim traktörü kuvveti ' + F);
  // parçalanma eşiği (Benz ve Asphaug 1999, bazalt): ~100 m'de en küçük (birkaç yüz J/kg), km boyunda çekim baskın, cm boyunda dayanım baskın
  const q = (R) => D.qStarD(R, 2700); assert(q(0.01) > 900 && q(100) < 1000 && q(100) > 100 && q(5000) > q(100) * 10, 'Q*_D eğrisi ' + [q(0.01), q(100), q(5000)].map((x) => x.toFixed(0))); }
// DART: Dimorphos
const M = 4.3e9, dvT = D.kineticDv(579.4, 6.1449, 3.61, M);
const a = 1.206e3, P = 11.921 * 3600, vo = 2 * Math.PI * a / P;
console.log('  DART Δv (başa baş)', (dvT * 1000).toFixed(2), 'mm/s; ölçülen Δv_T 2.70 mm/s -> ΔP', (3 * P * 2.70e-3 / vo / 60).toFixed(1), 'dk (gözlenen −33,0 ± 1,0 dk)');
