// Ufuk yamaları (bodyband.js) sınaması: rastgele kamera konumlarında (kabartma kabuğunun içi dahil) kameradan görülebilen her yüzey noktası çizilen
// yamaların içinde mi? Görünürlük tutucu: noktaya giden doğru parçası rMin küresine girmiyorsa görünür sayılır. Satır düzeni sphereGeometry ile aynı.
import { patchIndex, patchTable, patchRanges } from '../js/bodyband.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const W = 1024, H = 512, TOT = 6 * W * (H - 1);
// Ufuk yamaları (patchIndex, patchTable, patchRanges): 32 satır × 32 sütun
{
  const PR = 32, PC = 32, T = patchTable(W, H, PR, PC), I = patchIndex(W, H, PR, PC);
  // dizin: satır sıralı ağın üçgenleriyle aynı küme (yalnız sırası farklı); tablo dizinle tutarlı (her yamanın üçgenleri kendi hücrelerinde)
  const key = (a, b, c) => a * 1e14 + b * 1e7 + c, set = new Set();
  for (let j = 0; j < H; j++) for (let k = 0; k < W; k++) { const a = j * (W + 1) + k, b = a + 1, c = a + W + 1, d = c + 1; if (j > 0) set.add(key(a, b, d)); if (j < H - 1) set.add(key(a, d, c)); }
  let same = I.length === TOT && T.total === TOT && set.size === TOT / 3, inPatch = true;
  for (let i = 0; i < T.start.length && same; i++) {
    const c = Math.floor(i / T.nS), s = i % T.nS;
    for (let t = T.start[i]; t < T.start[i] + T.count[i]; t += 3) {
      if (!set.has(key(I[t], I[t + 1], I[t + 2]))) { same = false; break; }
      const j = Math.floor(I[t] / (W + 1)), k = I[t] % (W + 1);
      if (Math.floor(j / PR) !== c || Math.floor(k / PC) !== s) inPatch = false;
    }
  }
  check(same && inPatch, `yama dizini: satır sıralı ağın ${TOT / 3} üçgeninin aynısı, her yamanın üçgenleri kendi hücrelerinde (${T.start.length} yama)`);
  for (const [name, rMin, rMax] of [['Dünya', 6378.137 - 0.07, 6378.137], ['Ay (LOLA −10…+11 km)', 1737.4 - 10.1, 1737.4 + 11.05]]) {
    let n = 0, bad = 0, minFrac = 1; const out = [];
    for (let it = 0; it < 1500; it++) {
      const alt = Math.exp(Math.log(0.02) + rnd() * Math.log(5e5)), u = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1], un = Math.hypot(...u);
      const d = it % 3 === 0 ? rMin + rnd() * (rMax - rMin) : rMax + alt, p = u.map((x) => x / un * d);
      patchRanges(p, rMin, rMax, T, out); let drawn = 0; for (let i = 1; i < out.length; i += 2) drawn += out[i]; minFrac = Math.min(minFrac, drawn / TOT);
      for (let k = 0; k < 150; k++) {
        const v = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1], vn = Math.hypot(...v), r = rMin + rnd() * (rMax - rMin), q = v.map((x) => x / vn * r);
        const dir = q.map((x, i) => x - p[i]), L = Math.hypot(...dir), du = dir.map((x) => x / L);
        const b = p.reduce((s, x, i) => s + x * du[i], 0), c = p.reduce((s, x) => s + x * x, 0) - rMin * rMin, disc = b * b - c, tHit = disc > 0 ? -b - Math.sqrt(disc) : Infinity;
        if (tHit > 0 && tHit < L - 1e-6) continue;
        n++;
        const j = Math.min(H - 1, Math.floor((Math.asin(q[2] / r) + Math.PI / 2) / Math.PI * H)), kk = Math.min(W - 1, Math.floor((Math.atan2(q[1], q[0]) + Math.PI) / (2 * Math.PI) * W));
        const pi = Math.floor(j / PR) * T.nS + Math.floor(kk / PC), ps = T.start[pi], pe = ps + T.count[pi];
        let inside = false; for (let i = 0; i < out.length; i += 2) if (ps >= out[i] && pe <= out[i] + out[i + 1]) { inside = true; break; }
        if (!inside) bad++;
      }
    }
    check(n > 3000 && bad === 0, `yamalar, ${name}: ${n} görülebilen yüzey noktasının hepsi çizilen yamalarda, dışında ${bad} (en az ağın %${(minFrac * 100).toFixed(1)}'i)`);
  }
  const frac = (p, rMin, rMax) => { const o = patchRanges(p, rMin, rMax, T); let s = 0; for (let i = 1; i < o.length; i += 2) s += o[i]; return [s / TOT, o.length / 2]; };
  const all = patchRanges([0, 0, 6000], 6378, 6378.1, T);
  check(all.length === 2 && all[0] === 0 && all[1] === TOT, 'yamalar: kamera yüzeyin altındaysa ağın tamamı');
  const [fm, cm] = frac([9000, 0, 0], 1737.4 - 10.1, 1737.4 + 11.05), [fp, cp] = frac([6563, 0, 0], 6378.137 - 0.07, 6378.137);
  check(fm < 0.62 && cm <= 32, `Ay'a ekvatordan 9.000 km: yamalar ağın %${(fm * 100).toFixed(0)}'i (${cm} çizim çağrısı; önceki enlem bandı %99)`);
  check(fp < 0.04 && cp <= 32, `185 km park yörüngesinde Dünya: yamalar ağın %${(fp * 100).toFixed(1)}'i (${cp} çizim çağrısı)`);
}
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
