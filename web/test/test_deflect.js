// Saptırma motoru doğrulaması: Apophis 2029 yakın geçişi (JPL CAD ile), doğrusal STM ile doğrusal olmayan saptırmanın uyumu, DART
import fs from 'fs';
import * as D from '../js/deflect.js';
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const eng = new D.DeflectEngine(ab(new URL('../data/de440s.bsp', import.meta.url)));
const dir = process.argv[2] || new URL('./fixtures/', import.meta.url).pathname;
const load = (des) => {
  const j = JSON.parse(fs.readFileSync(dir + 'sbdb_' + des + '.json')), el = {};
  for (const x of j.orbit.elements) el[x.name] = +x.value;
  return { name: j.object.fullname, el: { a: el.a, e: el.e, i: el.i, om: el.om, w: el.w, ma: el.ma, epoch: +j.orbit.epoch }, ca: j.ca_data };
};
function start(o) {
  const et = D.etFromJd(o.el.epoch), [r, v] = D.keplerHelio(o.el, et), [ps, vs] = eng.sun(et);
  return { et, y: [r[0] + ps[0], r[1] + ps[1], r[2] + ps[2], v[0] + vs[0], v[1] + vs[1], v[2] + vs[2]] };
}
const A = load('99942'), s = start(A);
let T = performance.now();
const sc = eng.scan(s.et, s.y, D.etFromJd(2463000.5), { maxDist: 0.05 * D.AU });
console.log(A.name, 'tarama', ((performance.now() - T) / 1000).toFixed(2), 's, adım', sc.steps, 'fev', eng.nfev);
const cad = A.ca.find((c) => c.cd.startsWith('2029-Apr-13'));
for (const c of sc.list) {
  const jd = D.jdFromEt(c.et);
  console.log('  CA JD', jd.toFixed(6), 'mesafe', c.dist.toFixed(1), 'km  vrel', c.vrel.toFixed(3));
}
const ca = sc.list.reduce((a, b) => (a.dist < b.dist ? a : b));
const dt = (D.jdFromEt(ca.et) - +(cad.jd || 0)) * 86400;
console.log('  JPL CAD', cad.cd, (+cad.dist * D.AU).toFixed(1), 'km; fark', (ca.dist - cad.dist * D.AU).toFixed(1), 'km');
const bp = eng.bplaneAt(ca);
console.log('  B-düzlemi b', bp.b.toFixed(0), 'ξ', bp.xi.toFixed(0), 'ζ', bp.zeta.toFixed(0), 'bE', bp.bE.toFixed(0), 'rp', bp.rp.toFixed(1), 'vinf', bp.vinf.toFixed(3));
// saptırma: 2027-01-01'de yörünge boyunca 1 cm/s
const etA = D.etFromJd(2461406.5), stA = eng.integrate(s.et, s.y, etA).y;
T = performance.now();
const tr = eng.stm(etA, stA, ca.et - 3 * 86400);                              // CA'dan 3 gün önceye kadar STM
const nom = eng.integrate(ca.et - 3 * 86400, tr[0].y, ca.et);                   // (kontrol)
console.log('  STM', ((performance.now() - T) / 1000).toFixed(2), 's');
// STM'yi CA'ya uzat
const tr2 = eng.stm(etA, stA, ca.et);
const Phi = tr2[0].Phi, { J } = eng.bplanePartials(ca);
const vdir = D.unit(stA.slice(3, 6)), dvm = 0.01e-3;                          // 1 cm/s
const dx = Phi.map((row) => row[3] * vdir[0] + row[4] * vdir[1] + row[5] * vdir[2]);
const [pE] = eng.earth(ca.et);
const dXi = J[0].reduce((s2, jk, k) => s2 + jk * dx[k], 0) * dvm, dZeta = J[1].reduce((s2, jk, k) => s2 + jk * dx[k], 0) * dvm;
// doğrusal olmayan
const y1 = stA.slice(); for (let k = 0; k < 3; k++) y1[3 + k] += vdir[k] * dvm;
const sc2 = eng.scan(etA, y1, ca.et + 5 * 86400, { maxDist: 0.01 * D.AU });
const ca2 = sc2.list.reduce((a, b) => (a.dist < b.dist ? a : b)), bp2 = eng.bplaneAt(ca2);
console.log('  1 cm/s along (2027-01): doğrusal Δξ', dXi.toFixed(1), 'Δζ', dZeta.toFixed(1), ' | doğrusal olmayan Δξ', (bp2.xi - bp.xi).toFixed(1), 'Δζ', (bp2.zeta - bp.zeta).toFixed(1), 'Δt', (ca2.et - ca.et).toFixed(1), 's');
// DART: Dimorphos
const M = 4.3e9, dvT = D.kineticDv(579.4, 6.1449, 3.61, M);
const a = 1.206e3, P = 11.921 * 3600, vo = 2 * Math.PI * a / P;
console.log('  DART Δv (başa baş)', (dvT * 1000).toFixed(2), 'mm/s; ölçülen Δv_T 2.70 mm/s -> ΔP', (3 * P * 2.70e-3 / vo / 60).toFixed(1), 'dk (gözlenen −33,0 ± 1,0 dk)');
