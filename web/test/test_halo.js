import fs from 'fs';
import * as E from '../js/engine.js';
import * as EO from '../js/earth.js';
import { makeLive } from '../js/live.js';
import * as H from '../js/halo.js';
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url)));
const def = JSON.parse(fs.readFileSync(new URL('../data/design_default.json', import.meta.url)));
makeLive(ab(new URL('../data/de440s.bsp', import.meta.url)), ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url)), eo, def.tStart);
for (const key of ['NRHO92', 'L2S13', 'L1N10']) {
  let t0 = performance.now();
  const orb = H.haloMember(H.HALO_PRESETS[key]);
  const s = orb.stats;
  console.log(key, `P ${s.periodDays.toFixed(3)} g, rp ${s.rpKm.toFixed(0)} km, ra ${s.raKm.toFixed(0)} km, Az ${s.AzKm.toFixed(0)} km, ν ${orb.stability.toFixed(2)}`, (performance.now() - t0).toFixed(0), 'ms');
  t0 = performance.now();
  const tDep = def.design.t_L - 86400;
  const ref = H.ephemerisHalo(orb, tDep, 2, { log: (m) => console.log('   ', m) });
  console.log('   efemeris referansı', (performance.now() - t0).toFixed(0), 'ms, yama', ref.patches.length);
  const p1 = ref.perilune(tDep - 0.3 * orb.T * 375000, tDep + 0.3 * orb.T * 375000);
  console.log('   kalkış perilünü', E.utcString(p1.t), 'r', p1.r.toFixed(0), 'km; hedef', E.utcString(tDep));
  // tam motor modelinde istasyon tutmasız yayılım: referanstan sapma
  const tN = ref.tNri, [r0, v0] = ref.state(tN);
  const P = new E.Propagator(new E.State(tN, r0, v0, 'M'), E.dummyVehicle(), 1800);
  for (const dd of [1, 3, 6, 10]) { const tt = tN + dd * 86400; if (tt > ref.t1) break; P.runUntil(tt); const [rs] = P.s.seleno(), [rr] = ref.state(tt); console.log(`   tam modelde ${dd} g sonra sapma ${norm3(rs, rr).toFixed(2)} km`); }
}
function norm3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
