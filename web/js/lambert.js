// İki cisimli Lambert problemi (evrensel değişken, Stumpff işlevleri, z'de ikiye bölme; tek tur): r1'den r2'ye tof sürede giden yörüngenin uç hızları.
// hRef: istenen yörünge açısal momentumunun yönü (ileri/geri dal seçimi). Bulunamazsa null. Kaynak: Curtis, "Orbital Mechanics for Engineering Students", §5.3.
// design.js (Ay'a varış) ve intercept.js (asteroit önleme görevi) kullanır.
import { dot, cross, norm, scale, sub } from './vec3.js';

function stumpC(z) { if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z; if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / (-z); return 0.5 - z / 24; }
function stumpS(z) { if (z > 1e-8) { const s = Math.sqrt(z); return (s - Math.sin(s)) / s ** 3; } if (z < -1e-8) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / s ** 3; } return 1 / 6 - z / 120; }
export function lambert(r1, r2, tof, mu, hRef) {
  const R1 = norm(r1), R2 = norm(r2);
  let dth = Math.acos(Math.max(-1, Math.min(1, dot(r1, r2) / (R1 * R2))));
  if (dot(cross(r1, r2), hRef) < 0) dth = 2 * Math.PI - dth;
  const A = Math.sin(dth) * Math.sqrt(R1 * R2 / (1 - Math.cos(dth)));
  if (Math.abs(A) < 1e-9) return null;
  const y = (z) => R1 + R2 + A * (z * stumpS(z) - 1) / Math.sqrt(stumpC(z));
  const F = (z) => { const yy = y(z); if (yy < 0) return -1e30; return (yy / stumpC(z)) ** 1.5 * stumpS(z) + A * Math.sqrt(yy) - Math.sqrt(mu) * tof; };
  let lo = -200, hi = 4 * Math.PI * Math.PI - 1e-6;
  if (F(lo) > 0 || F(hi) < 0) return null;
  for (let k = 0; k < 200; k++) { const m = 0.5 * (lo + hi); if (F(m) < 0) lo = m; else hi = m; }
  const z = 0.5 * (lo + hi), yy = y(z), f = 1 - yy / R1, g = A * Math.sqrt(yy / mu), gd = 1 - yy / R2;
  return { v1: scale(sub(r2, scale(r1, f)), 1 / g), v2: scale(sub(scale(r2, gd), r1), 1 / g) };
}
