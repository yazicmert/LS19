// Parça akışının akıcılığı (tiles.js) ve uyarlanır çözünürlükle bağlantısı (Node 20+): cd web && node test/test_tiles.js
//  1) parentXf: çocuk parçanın uvT'si atanın uvT'sinde aynı boylam/enleme düşer (geçişte ata dokusu doğru yerden örneklenir), tüm şemalarda
//  2) promote: kare bütçesi korunur; aynı atanın kardeşleri birlikte açılır (yamalı görüntü yok), bütçe en çok 3 aşılır
//  3) perfgov: busy karelerde ölçüm yapılmaz (akış takılması çözünürlüğü düşürmez); floorRatio tabanı (2 → 1,5)
//  4) bağlantılar: gölgelendiriciler geçiş değişkenlerini bildirir, taban malzemeler varsayılanları taşır, kaplamalar overlay, app.js busy'yi iletir
import fs from 'fs';
import { register } from 'node:module';
register('./importmap_loader.mjs', import.meta.url);
const THREE = await import('three');
const { TileLayer, parentXf, FADE_MS } = await import('../js/tiles.js');
const { PixelGovernor, floorRatio } = await import('../js/perfgov.js');

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const mk = (scheme, tileSize, minZ) => new TileLayer({ parent: new THREE.Group(), R: 6378, scheme, tileSize, minZ, maxZ: 12, baseTexelKm: 5, url: () => '', material: () => new THREE.ShaderMaterial() });

// ---------------------------------------------------------------- 1) parentXf
for (const [scheme, ts, minZ] of [['gibs', 512, 3], ['eq', 256, 4]]) {
  const L = mk(scheme, ts, minZ); let worst = 0, n = 0, seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 400; k++) {
    const z = minZ + 1 + Math.floor(rnd() * 5), x = Math.floor(rnd() * L.S.cols(z)), y = Math.floor(rnd() * L.S.rows(z)), c = L.node(z, x, y);
    let p = L.up(c); for (let j = Math.floor(rnd() * 3); j > 0 && L.up(p); j--) p = L.up(p);
    const [su, sv, ou, ov] = parentXf(c, p);
    for (const [fu, fv] of [[0, 0], [1, 1], [0.3, 0.7]]) {
      const lon = c.lon0 + fu * (c.lon1 - c.lon0), lat = c.lat0 + fv * (c.lat1 - c.lat0);
      const u = (lon - c.lon0) / c.span, v = 1 - (c.lat1 - lat) / c.span;                                     // çocuk uvT (tileGeometry ile aynı tanım)
      const uP = (lon - p.lon0) / p.span, vP = 1 - (p.lat1 - lat) / p.span;                                   // atanın uvT'si
      worst = Math.max(worst, Math.abs(u * su + ou - uP), Math.abs(v * sv + ov - vP)); n++;
    }
  }
  check(`parentXf (${scheme}): çocuk uvT → ata uvT aynı noktaya düşer (${n} nokta)`, worst < 1e-9, `en büyük hata ${worst.toExponential(2)}`);
}

// ---------------------------------------------------------------- 2) promote
{
  const L = mk('gibs', 512, 3), tex = () => new THREE.Texture();
  const add = (z, x, y, prio) => { const n = L.node(z, x, y), e = { n, tex: null, ready: tex(), prio }; L.cache.set(n.key, e); L.nReady++; return e; };
  const sib = [[10, 6], [11, 6], [10, 7], [11, 7]].map(([x, y], i) => add(6, x, y, i === 0 ? 1 : 50 + i));   // dörtlü: biri en öncelikli, kardeşleri sonda
  const other = [1, 2, 3].map((k) => add(6, 30 + 2 * k, 2, 2 + k));                                          // başka atalar, orta öncelik
  const k1 = L.promote(2);
  check('promote: en öncelikli parça açılınca hazır kardeşleri de aynı karede açılır', sib.every((e) => e.tex) && k1 === 4 && other.every((e) => !e.tex), `açılan ${k1}`);
  check('promote: bütçe en çok 3 aşılır; nReady tutarlı', k1 <= 2 + 3 && L.nReady === 7 - k1);
  const k2 = L.promote(4);
  check('promote: kalanlar sonraki karede, öncelik sırasıyla', other.every((e) => e.tex) && k2 === 3 && L.nReady === 0);
  check('geçiş süresi makul (300–700 ms)', FADE_MS >= 300 && FADE_MS <= 700, `${FADE_MS} ms`);
}

// ---------------------------------------------------------------- 3) perfgov
{
  const g = new PixelGovernor({ max: 2, min: 1 }); let now = 0, ch = 0;
  for (let i = 0; i < 4000; i++) { now += 40; if (g.tick(40, now, true)) ch++; }
  check('perfgov: akış sürerken (busy) yavaş kareler oranı düşürmez', ch === 0 && g.r === 2);
  let r = null; for (let i = 0; i < 200 && !r; i++) { now += 40; r = g.tick(40, now, false); }
  check('perfgov: akış bitip sahne gerçekten yavaşsa yine düşer', r === 1.75, `oran ${r}`);
  check('floorRatio: 2 → 1,5 · 1,5 → 1,25 · 1,25 → 1 · 1 → 1 · 3 → 2,25', floorRatio(2) === 1.5 && floorRatio(1.5) === 1.25 && floorRatio(1.25) === 1 && floorRatio(1) === 1 && floorRatio(3) === 2.25);
}

// ---------------------------------------------------------------- 4) bağlantılar
{
  const sc = rd('../js/scene.js'), app = rd('../js/app.js');
  const decl = (sc.match(/uniform sampler2D parentMap; uniform vec4 pXf; uniform float pHas, tileFade;/g) || []).length;
  check('Dünya ve Ay gölgelendiricileri geçiş değişkenlerini bildirir', decl === 2);
  check('taban malzemeler (eu, mu) varsayılanları taşır (eksik uniform çizimi bozmasın)', (sc.match(/pHas: \{ value: 0 \}, tileFade: \{ value: 1 \}/g) || []).length === 2);
  check('kaplama katmanları (Landsat, HLS, Kaguya) overlay: atası yoksa saydamlıkla belirir', (sc.match(/overlay: true/g) || []).length === 3);
  check('app.js: taban floorRatio, busy bilgisi governor\'a gider', /min: floorRatio\(world\.prMax\)/.test(app) && /gov\.tick\(dtMs, now, !!world\.tilesBusy\)/.test(app) && /this\.tilesBusy = busy/.test(sc));
}

console.log(fail ? `\n${fail} denetim BAŞARISIZ` : '\nTüm denetimler geçti');
process.exit(fail ? 1 : 0);
