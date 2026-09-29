import fs from 'fs';
import { SPKKernel, PCKKernel } from '../js/jplkernel.js';
import * as EO from '../js/earth.js';
import { LiveEphemeris, IS, IE, IM, qToMat, paEuler } from '../js/ephem.js';
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
EO.loadEarthOrientation(JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url))));
const spk = new SPKKernel(ab(new URL('../data/de440s.bsp', import.meta.url))), pck = new PCKKernel(ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url)));
const et0 = (2461314.5 - 2451545.0) * 86400 + 12 * 86400;   // 2026-10-13
const T0 = performance.now();
const L = new LiveEphemeris(spk, pck, et0);
const sub = (a, b) => a.map((x, i) => x - b[i]), norm = (a) => Math.hypot(...a);
const r2as = 180 / Math.PI * 3600;
for (const dd of [0.25, 1, 2, 4, 6, 10, 20, 35, -2, -10]) {
  const et = et0 + dd * 86400;
  const mE = sub(L.body(IM, et)[0], L.body(IE, et)[0]), mE_ref = sub(spk.ssb(301, et)[0], spk.ssb(399, et)[0]);
  const vE = sub(L.body(IM, et)[1], L.body(IE, et)[1]), vE_ref = sub(spk.ssb(301, et)[1], spk.ssb(399, et)[1]);
  const sE = sub(L.body(IS, et)[0], L.body(IE, et)[0]), sE_ref = sub(spk.ssb(10, et)[0], spk.ssb(399, et)[0]);
  const e = L.body(IE, et)[0], e_ref = spk.ssb(399, et)[0];
  const { q } = L.moonAttitude(et); const M = qToMat(q), Mip = M[0].map((_, j) => [M[0][j], M[1][j], M[2][j]]);
  const ang = paEuler(Mip), [angRef] = pck.angles(et);
  const dAng = ang.map((x, i) => { let d = x - angRef[i]; d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return d * r2as; });
  console.log(`${String(dd).padStart(5)} g: Ay(yer merkezli) ${(norm(sub(mE, mE_ref)) * 1000).toFixed(1)} m, hız ${(norm(sub(vE, vE_ref)) * 1e6).toFixed(3)} mm/s | Güneş ${(norm(sub(sE, sE_ref))).toFixed(3)} km | Dünya SSB ${(norm(sub(e, e_ref))).toFixed(3)} km | Ay PA açıları (″) ${dAng.map((x) => x.toFixed(2)).join(' ')}`);
}
console.log('adım sayısı', L.steps, 'süre', (performance.now() - T0).toFixed(0), 'ms');
