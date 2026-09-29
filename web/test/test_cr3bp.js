import * as C from '../js/cr3bp.js';
const f = (a, n = 6) => a.map((v) => v.toFixed(n)).join(', ');
console.log('mu', C.MU, 'L', C.L_CR.toFixed(1), 'T*', (C.T_CR / 86400).toFixed(4), 'd', 'xL1', C.xL(1).toFixed(6), 'xL2', C.xL(2).toFixed(6));
let t0 = performance.now();
const nrho = C.correct([1.0221, 0, -0.1821, 0, -0.1033, 0], { fix: 2 });
console.log('NRHO guess corrected:', nrho && f(nrho.X0), 'T=', nrho && (2 * nrho.halfT).toFixed(5), 'it', nrho && nrho.iters, (performance.now() - t0).toFixed(0), 'ms');
if (nrho) console.log(C.orbitStats(nrho));
for (const [L, south, Az] of [[2, true, 8000], [2, true, 15000], [1, false, 8000], [1, true, 12000]]) {
  const R = C.richardson(L, Az, south);
  const c = C.correct(R.X0, { fix: 2 });
  console.log(`L${L} ${south ? 'S' : 'N'} Az=${Az}: guess ${f(R.X0, 5)} halfT ${R.halfT.toFixed(4)} -> ${c ? f(c.X0, 5) + ' T=' + (2 * c.halfT).toFixed(4) + ' it ' + c.iters : 'FAIL'}`);
  if (c) { const s = C.orbitStats(c); console.log('   ', JSON.stringify({ P: s.periodDays.toFixed(2), rp: s.rpKm.toFixed(0), ra: s.raKm.toFixed(0), Az: s.AzKm.toFixed(0) })); }
}
