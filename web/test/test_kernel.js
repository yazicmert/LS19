import fs from 'fs';
import { SPKKernel, PCKKernel } from '../js/jplkernel.js';
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const spk = new SPKKernel(ab(new URL('../data/de440s.bsp', import.meta.url))), pck = new PCKKernel(ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url)));
const R = JSON.parse(fs.readFileSync(new URL('./ref_kernel.json', import.meta.url)));
const md = (a, b) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));
for (const r of R) {
  const [m, mv] = spk.rel(3, 301, r.et), [e] = spk.rel(3, 399, r.et), [s] = spk.rel(0, 10, r.et), [j] = spk.rel(0, 5, r.et);
  const [a, ar] = pck.angles(r.et);
  console.log(r.et, 'ay', md(m, r.moon).toExponential(1), 'ayv', md(mv, r.moonv).toExponential(1), 'dünya', md(e, r.earth).toExponential(1), 'güneş', md(s, r.sun).toExponential(1), 'jüpiter', md(j, r.jup).toExponential(1),
    'açı', md(a, r.ang).toExponential(1), 'hız', md(ar, r.rate.map((x) => x / 86400)).toExponential(1), md(ar, r.rate).toExponential(1));
}
