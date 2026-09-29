import fs from 'fs';
import * as E from '../js/engine.js';
E.loadEphemeris(JSON.parse(fs.readFileSync(new URL('../data/rocsim_eph_2026Q4.json', import.meta.url))));
const R = JSON.parse(fs.readFileSync(new URL('./ref_engine.json', import.meta.url)));
const md = (a, b) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));
const mmd = (A, B) => Math.max(...A.map((r, i) => md(r, B[i])));
R.ts.forEach((t, i) => {
  console.log(t, 'moon', md(E.moonPos(t), R.moon[i]).toExponential(2), 'moonv', md(E.moonVel(t), R.moonv[i]).toExponential(2),
    'sun', md(E.sunPos(t), R.sun[i]).toExponential(2), 'ME', mmd(E.moonIcrfToMe(t), R.me[i]).toExponential(2), 'ITRF', mmd(E.earthIcrfToItrf(t), R.itrf[i]).toExponential(2));
});
console.log('accE', md(E.accel(1200000.0, [7000, 1000, 500], 'E'), R.accE).toExponential(2), 'accM', md(E.accel(1434000.0, [1200, -900, 700], 'M'), R.accM).toExponential(2));
console.log('utc', E.utcString(1451718.0653762019), '|', R.utc);
const st = new E.State(1100000.0, [-20000.0, 150000.0, 80000.0], [-0.8, 0.6, 0.35], 'E');
const P = new E.Propagator(st, E.dummyVehicle(), 1800.0);
const t0 = performance.now();
P.runUntil(1100000.0 + 3 * 86400);
console.log('coast', (performance.now() - t0).toFixed(1), 'ms', P.s.central, R.coast.central, 'dr km', md(P.s.r, R.coast.r).toExponential(3), 'dv', md(P.s.v, R.coast.v).toExponential(3));
