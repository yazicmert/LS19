import fs from 'fs';
import * as EO from '../js/earth.js';
EO.loadEarthOrientation(JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url))));
const R = JSON.parse(fs.readFileSync(new URL('./ref_earth.json', import.meta.url)));
const mmax = (A, B) => Math.max(...A.flatMap((r, i) => r.map((x, j) => Math.abs(x - B[i][j]))));
const r2as = 180 / Math.PI * 3600;
for (const r of R) {
  const [dp, de] = EO.nutation2000A(r.jd_tt);
  const n = EO.npb(r.jd_tt);
  const c2t = EO.icrfToItrf(r.jd_tt);
  const jdut1 = r.jd_tt - EO.deltaT(r.jd_tt) / 86400;
  console.log(r.jd_tt, 'ΔT', EO.deltaT(r.jd_tt).toFixed(3), r.dt.toFixed(3), 'nüt(µas)', ((dp - r.dpsi) * r2as * 1e6).toFixed(2), ((de - r.deps) * r2as * 1e6).toFixed(2),
    'NPB(mas)', (mmax(n.R, r.rnpb) * r2as * 1e3).toFixed(3), 'GAST(mas)', ((EO.gast(jdut1, r.jd_tt) - r.gst) * r2as * 1e3).toFixed(3), 'C2T(mas)', (mmax(c2t, r.rc2t) * r2as * 1e3).toFixed(3));
}
let t0 = performance.now(); for (let i = 0; i < 1000; i++) EO.npb(2461327.3 + i * 1e-3); console.log('npb süresi', ((performance.now() - t0) / 1000).toFixed(3), 'ms/çağrı');
let worst = 0;
for (let i = 0; i < 400; i++) { const jd = 2461320 + i * 0.0137; const A = EO.icrfToItrf(jd), B = EO.icrfToItrfFast(jd); worst = Math.max(worst, mmax(A, B)); }
console.log('hızlı sürüm en büyük fark (µas):', (worst * r2as * 1e6).toFixed(3));
t0 = performance.now(); for (let i = 0; i < 100000; i++) EO.icrfToItrfFast(2461327.3 + i * 1e-5); console.log('hızlı süre', ((performance.now() - t0) / 100000 * 1000).toFixed(2), 'µs/çağrı');
