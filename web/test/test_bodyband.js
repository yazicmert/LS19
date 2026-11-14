// Ufuk bandı (bodyband.js) sınaması: rastgele kamera konumlarında (kabartma kabuğunun içi dahil) kameradan görülebilen her yüzey noktası çizilen
// satır aralığının içinde mi? Görünürlük tutucu: noktaya giden doğru parçası rMin küresine girmiyorsa görünür sayılır. Satır düzeni sphereGeometry ile aynı.
import { bandRange } from '../js/bodyband.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const W = 1024, H = 512, TOT = 6 * W * (H - 1);
for (const [name, rMin, rMax] of [['Dünya', 6378.137 - 0.07, 6378.137], ['Ay (LOLA −10…+11 km)', 1737.4 - 10.1, 1737.4 + 11.05]]) {
  let n = 0, bad = 0, minFrac = 1;
  for (let it = 0; it < 1500; it++) {
    const alt = Math.exp(Math.log(0.02) + rnd() * Math.log(5e5)), u = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1], un = Math.hypot(...u);
    const d = it % 3 === 0 ? rMin + rnd() * (rMax - rMin) : rMax + alt, p = u.map((x) => x / un * d);
    const [st, cnt] = bandRange(p, rMin, rMax, W, H); minFrac = Math.min(minFrac, cnt / TOT);
    for (let k = 0; k < 150; k++) {
      const v = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1], vn = Math.hypot(...v), r = rMin + rnd() * (rMax - rMin), q = v.map((x) => x / vn * r);
      const dir = q.map((x, i) => x - p[i]), L = Math.hypot(...dir), du = dir.map((x) => x / L);
      const b = p.reduce((s, x, i) => s + x * du[i], 0), c = p.reduce((s, x) => s + x * x, 0) - rMin * rMin, disc = b * b - c, tHit = disc > 0 ? -b - Math.sqrt(disc) : Infinity;
      if (tHit > 0 && tHit < L - 1e-6) continue;
      n++;
      const j = Math.min(H - 1, Math.floor((Math.asin(q[2] / r) + Math.PI / 2) / Math.PI * H));
      const rs = j <= 0 ? 0 : 3 * W + (j - 1) * 6 * W, re = j >= H - 1 ? TOT : 3 * W + j * 6 * W;
      if (rs < st || re > st + cnt) bad++;
    }
  }
  check(n > 3000 && bad === 0, `${name}: ${n} görülebilen yüzey noktasının hepsi bandın içinde, dışında ${bad} (en dar bant ağın %${(minFrac * 100).toFixed(1)}'i)`);
}
const full = bandRange([0, 0, 6000], 6378, 6378.1, W, H);
check(full[0] === 0 && full[1] === TOT, 'kamera yüzeyin altındaysa ağın tamamı');
const park = bandRange([6563, 0, 0], 6378.137 - 0.07, 6378.137, W, H);
check(park[1] / TOT < 0.2, `185 km park yörüngesinde Dünya ağının yalnız %${(park[1] / TOT * 100).toFixed(1)}'i çizilir`);
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
