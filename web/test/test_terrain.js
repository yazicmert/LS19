// İniş arazisi üretimi (terraingen.js · terrainwork.js · terrain.js) doğrulaması (Node 20+): cd web && node test/test_terrain.js
//  Üretim ana iş parçacığından Web Worker'a taşındı (~0,9 sn açılış donması): çıktı eski uygulamayla (test/fixtures/terrain_ref.js: özgün kod) BİT DÜZEYİNDE aynı olmalı.
//  1) konum, uv, uv1, renk, dizin, köşe normalleri (computeVertexNormals ile aynı işlem sırası) ve sınır küresi birebir
//  2) ayrıntı normal haritası: eski tuval verisiyle aynı (satırlar GL sırasında)
//  3) iniş yeri tabanı (yukarı/doğu/kuzey) ve nokta konumu; worker mesajı (aktarılabilir tamponlar)
//  4) sahne bağlantısı: yer tutucu ağ + gerçek ağın yerine geçmesi, delik yalnız hazırken açılır
import fs from 'fs';
import { register } from 'node:module';
register('./importmap_loader.mjs', import.meta.url);
const THREE = await import('three');
const Ref = await import('./fixtures/terrain_ref.js');
const G = await import('../js/terraingen.js');
const MI = await import('../js/mission.js');
const E = await import('../js/engine.js');

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
const dem = JSON.parse(fs.readFileSync(new URL('../data/site_dem.json', import.meta.url), 'utf8'));
const lat = MI.SITE_LAT * 180 / Math.PI, lon = MI.SITE_LON * 180 / Math.PI, hSite = MI.R_SITE - E.R_M;

// ---------------------------------------------------------------- 1) birebir eşdeğerlik (tam çözünürlük N = 513)
{
  const t0 = performance.now(), a = G.terrainArrays(dem, lat, lon, E.R_M, hSite), t1 = performance.now();
  const r = Ref.buildTerrain(dem, lat, lon, E.R_M, hSite), t2 = performance.now();
  const A = r.geometry.attributes;
  check('konum dizisi eski uygulamayla bit düzeyinde aynı (263169 köşe)', same(a.pos, A.position.array) && a.pos.length === 263169 * 3);
  check('uv, uv1 (ayrıntı dokusu) ve köşe rengi aynı', same(a.uv, A.uv.array) && same(a.uv1, A.uv1.array) && same(a.col, A.color.array));
  check('dizin dizisi aynı (524288 üçgen, Uint32)', same(a.idx, r.geometry.index.array) && a.idx instanceof Uint32Array && r.geometry.index.array instanceof Uint32Array);
  check('köşe normalleri computeVertexNormals ile bit düzeyinde aynı', same(a.nor, A.normal.array));
  const g = (await import('../js/terrain.js')).terrainGeometry(a);
  check('terrainGeometry: sınır küresi eskisiyle aynı; öznitelik kümesi position/normal/uv/uv1/color + dizin', g.boundingSphere.radius === r.geometry.boundingSphere.radius && g.boundingSphere.center.equals(r.geometry.boundingSphere.center)
    && Object.keys(g.attributes).sort().join() === 'color,normal,position,uv,uv1' && g.index.count === r.geometry.index.count, `yarıçap ${g.boundingSphere.radius.toFixed(3)} km`);
  check('iniş noktası ve taban vektörleri aynı', JSON.stringify(a.sitePos) === JSON.stringify(r.sitePosMe) && JSON.stringify([a.up, a.east, a.north]) === JSON.stringify([r.up, r.east, r.north]));
  console.log(`      süre: yeni ${(t1 - t0).toFixed(0)} ms, eski (THREE dahil) ${(t2 - t1).toFixed(0)} ms`);
}
{
  const a = G.terrainArrays(dem, lat, lon, E.R_M, hSite, 65), r = Ref.buildTerrain(dem, lat, lon, E.R_M, hSite, 65), A = r.geometry.attributes;
  check('küçük ızgara (N = 65): konum, normal, dizin aynı (Uint16 sınırının altı değil: yine Uint32)', same(a.pos, A.position.array) && same(a.nor, A.normal.array) && same(a.idx, new Uint32Array(r.geometry.index.array)));
  const b = G.terrainArrays(dem, lat, lon, E.R_M, hSite, 65);
  check('üretim belirleyici (iki çalıştırma aynı)', same(a.pos, b.pos) && same(a.col, b.col));
}

// ---------------------------------------------------------------- 2) ayrıntı normal haritası
{
  // eski kod: tuval + ImageData; Node'da yapay tuval veriyi yakalar
  let cap = null;
  globalThis.document = { createElement: () => ({ getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: (img) => { cap = img; } }) }) };
  Ref.detailNormalTexture(512);
  const old = cap.data, now = G.detailNormalData(512), size = 512;
  let bad = 0; for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) for (let c = 0; c < 4; c++) if (old[(y * size + x) * 4 + c] !== now[((size - 1 - y) * size + x) * 4 + c]) bad++;
  check('ayrıntı normal haritası: eski tuval verisiyle her bayt aynı (satırlar GL sırasında: ilk satır en alt)', bad === 0 && now.length === size * size * 4 && now instanceof Uint8Array, `${bad} fark`);
  let nz = 0, unit = true; for (let i = 0; i < now.length; i += 4) { const x = now[i] / 255 * 2 - 1, y = now[i + 1] / 255 * 2 - 1, z = now[i + 2] / 255 * 2 - 1; if (z > 0) nz++; if (Math.abs(Math.hypot(x, y, z) - 1) > 0.02) unit = false; }
  check('ayrıntı normal haritası: normaller yukarı bakar ve birim uzunlukta', nz === size * size && unit && now[3] === 255);
  const { detailNormalTexture } = await import('../js/terrain.js'), t = detailNormalTexture(64);
  check('detailNormalTexture: DataTexture, tekrarlı, mip, uv1 kanalı, doğrusal (renk uzayı yok)', t.isDataTexture && t.wrapS === THREE.RepeatWrapping && t.generateMipmaps && t.minFilter === THREE.LinearMipmapLinearFilter && t.channel === 1 && t.colorSpace === THREE.NoColorSpace && t.flipY === false);
}

// ---------------------------------------------------------------- 3) taban ve worker mesajı
{
  const B = G.terrainBasis(lat, lon, E.R_M, hSite), d = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], n = (u) => Math.hypot(...u);
  check('taban: yukarı/doğu/kuzey birim ve dik; iniş noktası = yukarı × R_SITE', Math.abs(n(B.up) - 1) < 1e-12 && Math.abs(n(B.east) - 1) < 1e-12 && Math.abs(n(B.north) - 1) < 1e-12
    && Math.abs(d(B.up, B.east)) < 1e-12 && Math.abs(d(B.up, B.north)) < 1e-12 && Math.abs(d(B.east, B.north)) < 1e-12 && Math.abs(n(B.sitePos) - MI.R_SITE) < 1e-9, `|site| = ${n(B.sitePos).toFixed(3)} km`);
  // worker modülü: self.onmessage'i kurar; yanıt aktarılabilir tamponlarla gelir (kopyasız)
  const posted = []; globalThis.self = { postMessage: (m, tr) => posted.push([m, tr]) };
  await import('../js/terrainwork.js');
  check('terrainwork: self.onmessage kurulur', typeof globalThis.self.onmessage === 'function');
  globalThis.self.onmessage({ data: { dem, siteLatDeg: lat, siteLonDeg: lon, R_M: E.R_M, hSite, N: 33 } });
  const [m, tr] = posted[0] || [];
  const bufs = m ? ['pos', 'uv', 'uv1', 'col', 'idx', 'nor', 'detail'].map((k) => m[k].buffer) : [];
  check('terrainwork: yanıt tüm büyük dizileri aktarım listesinde taşır (pos, uv, uv1, col, idx, nor, detail)', !!m && tr.length === 7 && bufs.every((b) => tr.includes(b)) && m.detailSize === 512 && m.pos.length === 33 * 33 * 3, m ? `${tr.length} tampon` : 'mesaj yok');
  const ref = G.terrainArrays(dem, lat, lon, E.R_M, hSite, 33);
  check('terrainwork: yanıt doğrudan terrainArrays çıktısıdır', !!m && same(m.pos, ref.pos) && same(m.nor, ref.nor) && same(m.idx, ref.idx));
}

// ---------------------------------------------------------------- 4) sahne bağlantısı (kaynak denetimi)
{
  const sc = rd('../js/scene.js'), tr = rd('../js/terrain.js'), tw = rd('../js/terrainwork.js');
  check('scene: arazi worker\'da üretilir (loadTerrain), ana iş parçacığında buildTerrain çağrılmaz', /loadTerrain\(A\.dem/.test(sc) && !/buildTerrain\(/.test(sc) && !/detailNormalTexture\(\)/.test(sc));
  check('scene: yer tutucu ağ aynı öznitelik kümesiyle (position, normal, uv, uv1, color) ve aynı uv kanalındaki yer tutucu normal haritasıyla kurulur (program önceden derlenir)', /\['position', 3\], \['normal', 3\], \['uv', 2\], \['uv1', 2\], \['color', 3\]/.test(sc) && /ph\.channel = 1/.test(sc));
  check('scene: delik (holeCos) başlangıçta kapalı (2.0), arazi hazır olunca cos(HOLE_R / R_M)', /holeCos: \{ value: 2\.0 \}/.test(sc) && /this\.holeCos0 = Math\.cos\(HOLE_R \/ E\.R_M\); this\.terrainReady = true/.test(sc));
  check('scene: placeTerrain yalnız terrainReady iken (yer tutucu görünmez)', (sc.match(/if \(this\.terrainReady\) this\.placeTerrain/g) || []).length === 2 && !/if \(this\.terrain\) this\.placeTerrain/.test(sc));
  check('terrain: worker açılamaz/çökerse ana iş parçacığında üretir (yedek)', /w\.onerror = fallback/.test(tr) && /catch \(e\) \{ fallback\(\); \}/.test(tr) && /new Worker\(new URL\('\.\/terrainwork\.js'/.test(tr));
  check('terrainwork: THREE içe aktarmaz (worker\'da import map yok)', !/from 'three'/.test(tw) && !/from 'three'/.test(rd('../js/terraingen.js')));
}

console.log(fail ? `\n${fail} HATA` : '\nTüm denetimler geçti');
process.exit(fail ? 1 : 0);
