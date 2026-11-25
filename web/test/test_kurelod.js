// Dünya, atmosfer ve Ay kürelerinin ayrıntı düzeyi (scene.js EARTH_SEG, scenegeom.js pickLod) — Node 20+: cd web && node test/test_kurelod.js
//  pickLod: eşiğin altındaki en kaba düzey, histerezis; kiriş hatası formülü gerçek ağda üst sınır (32×16 … 256×128); sahne sözleşmesi;
//  Ay kabartma payları (tools/ay_lod.py ölçümünün üstünde); örnek uzaklıklarda seçilen düzey.
import fs from 'fs';
import { register } from 'node:module';
register('./importmap_loader.mjs', import.meta.url);
const { pickLod, sphereGeometry } = await import('../js/scenegeom.js');

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const sag = (R, n) => R * (1 - Math.cos(Math.SQRT2 * Math.PI / n));

// 1) pickLod
{
  const errs = (a) => (k) => a[k];
  check('pickLod: eşiğin altındaki en kaba düzey', pickLod(0, 4, errs([0, 0.05, 0.15, 0.6]), 0.2, 0.3) === 2 && pickLod(0, 4, errs([0, 0.01, 0.05, 0.1]), 0.2, 0.3) === 3);
  check('pickLod: hiçbiri uymazsa (ya da hata sonsuz/NaN) ince ağ', pickLod(2, 4, errs([0, 0.5, 2, 8]), 0.2, 0.3) === 0 && pickLod(3, 4, () => Infinity, 0.2, 0.3) === 0 && pickLod(1, 4, () => NaN, 0.2, 0.3) === 0);
  check('pickLod: histerezis — kabaya geçmek için 0,2, kalmak için 0,3 yeter', pickLod(1, 4, errs([0, 0.1, 0.25, 1]), 0.2, 0.3) === 1 && pickLod(2, 4, errs([0, 0.1, 0.25, 1]), 0.2, 0.3) === 2 && pickLod(2, 4, errs([0, 0.1, 0.35, 1]), 0.2, 0.3) === 1);
}

// 2) kiriş hatası: ağın üçgenleri ile küre arasındaki en büyük uzaklık sag(R, n)'yi aşmaz (ve ona yakındır: sınır gevşek değil)
for (const [n, m] of [[32, 16], [64, 32], [256, 128]]) {
  const R = 6378.137, g = sphereGeometry(R, n, m), P = g.getAttribute('position').array, I = g.index.array;
  let worst = 0;
  const W = [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5], [0.25, 0.25, 0.5], [0.25, 0.5, 0.25], [0.5, 0.25, 0.25]];
  for (let t = 0; t < I.length; t += 3) for (const w of W) {
    let x = 0, y = 0, z = 0; for (let k = 0; k < 3; k++) { x += w[k] * P[3 * I[t + k]]; y += w[k] * P[3 * I[t + k] + 1]; z += w[k] * P[3 * I[t + k] + 2]; }
    worst = Math.max(worst, R - Math.hypot(x, y, z));
  }
  check(`${n}×${m}: ağ ile küre arası en büyük uzaklık ≤ sag (${worst.toFixed(4)} ≤ ${sag(R, n).toFixed(4)} km; konumlar Float32: ±0,005 km)`, worst <= sag(R, n) + 0.005 && worst >= 0.4 * sag(R, n));
}

// 2b) ufuk yamalı ince ağ: Ay, Dünya'nın yamalı dizinini ve yama tablosunu paylaşır; yamasız ağla paylaşılmaz (dizin sırası farklı)
{
  const e = sphereGeometry(6378.137, 64, 32, null, [8, 8]), m = sphereGeometry(1737.4, 64, 32, e, [8, 8]), plain = sphereGeometry(1737.4, 64, 32, e);
  check('yamalı ağ: Ay Dünya\'nın dizinini ve yama tablosunu paylaşır; yamasız ağ paylaşmaz', !!e.userData.patches && m.index === e.index && m.userData.patches === e.userData.patches && plain.index !== e.index && !plain.userData.patches
    && e.userData.patches.total === e.index.count);
}

// 3) sahne sözleşmesi
const sc = fs.readFileSync(new URL('../js/scene.js', import.meta.url), 'utf8');
check('scene.js: dört düzey (1024×512, 256×128, 64×32, 32×16); Dünya, Ay ve atmosfer pickLod ile', /const EARTH_SEG = \[\[1024, 512\], \[256, 128\], \[64, 32\], \[32, 16\]\];/.test(sc)
  && /pickLod\(this\.earthLod, EARTH_SEG\.length/.test(sc) && /pickLod\(this\.moonLod, EARTH_SEG\.length/.test(sc) && /pickLod\(this\.atmLod, EARTH_SEG\.length/.test(sc));
check('scene.js: ince ağ ufuk yamalı; Dünya ve Ay tek elemanlı malzeme dizisiyle (gruplar), kaba ağlar tek grup', /i === 0 \? BODY_PATCH : null/.test(sc) && /this\.earth = new THREE\.Mesh\(this\.earthGeo\[0\], \[new THREE\.ShaderMaterial/.test(sc)
  && /this\.moon = new THREE\.Mesh\(this\.moonGeo\[0\], \[new THREE\.ShaderMaterial/.test(sc) && /const fullGroup = \(g\) => \{ g\.addGroup\(0, Infinity, 0\)/.test(sc) && /patchRanges\(\[v\.x, v\.y, v\.z\], rMin, rMax, T, r\)/.test(sc));
check('scene.js: atmosfer en ince 256×128 (içeriden ve yakından), kaba düzeyleri Dünya ızgarasını paylaşır', /Math\.max\(1, pickLod\(this\.atmLod/.test(sc) && /sphereGeometry\(ATM_R, a, b, this\.earthGeo\[i\]\)/.test(sc) && /this\.atmGeo\[0\] = this\.atmGeo\[1\]/.test(sc));
const rel = sc.match(/const MOON_RELIEF = \[([0-9., ]+)\]/), R = rel ? rel[1].split(',').map(Number) : [];
check('Ay kabartma payı düzey başına, tools/ay_lod.py ölçümünün (8,93 / 12,39 / 14,20 km) üstünde', R.length === 4 && R[1] >= 8.93 && R[2] >= 12.39 && R[3] >= 14.21, JSON.stringify(R));

// 4) örnek: 1280×800, fov 50°: hangi uzaklıkta hangi düzey (scene.js lodErr ile aynı ölçek)
{
  const t2 = Math.tan(25 * Math.PI / 180) ** 2, asp = 1.6, kPx = 800 / 2 / Math.sqrt(t2) * (1 + t2 * (1 + asp * asp));
  const lodAt = (d, Rb, rel4) => pickLod(0, 4, (k) => { const h = d - Rb - (rel4 ? 11.05 : 0); return h > 0 ? (sag(Rb, [1024, 256, 64, 32][k]) + (rel4 ? rel4[k] : 0)) * kPx / h : Infinity; }, 0.2, 0.3);
  const e = [400, 3e4, 2e5, 1.3e6].map((d) => lodAt(6378 + d, 6378.137)), m = [3e3, 1e5, 3.8e5, 1.3e6].map((d) => lodAt(1737 + d, 1737.4, R));
  check('Dünya: alçak yörüngede ince, uzaklaştıkça kabalaşır (400 km, 30.000 km, 200.000 km, 1,3 milyon km)', e[0] === 0 && e[1] >= 1 && e[2] >= 2 && e[3] === 3, JSON.stringify(e));
  check('Ay: yakında ince, Dünya–Ay uzaklığında ve ötesinde kaba', m[0] === 0 && m[2] >= 2 && m[3] === 3, JSON.stringify(m));
}

if (fail) { console.log(`\n${fail} hata`); process.exit(1); }
console.log('\nTüm küre ayrıntı düzeyi denetimleri geçti');
