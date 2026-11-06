// İsteğe bağlı Google Photorealistic 3D Tiles katmanının (web/js/google3d.js) kütüphanelerini web/lib/ altına üretir:
//  · 3d-tiles-renderer (NASA-AMMOS, Apache-2.0): yalnız kullanılan sınıflar tek dosyalık ESM'e paketlenir; 'three' ve 'three/addons/…' dışarıda kalır
//    (index.html'deki importmap çözer). Çıktı: web/lib/3d-tiles-renderer.esm.js + 3d-tiles-renderer.LICENSE.md
//  · three r170'in DRACOLoader'ı ve Draco çözücüsü (Google karoları Draco sıkıştırmalı glTF): web/lib/addons/loaders/DRACOLoader.js,
//    web/lib/addons/libs/draco/gltf/ (glTF'e özel küçük çözücü: draco_wasm_wrapper.js, draco_decoder.wasm; Apache-2.0, Google) — three'deki dosyalar olduğu gibi
//    (asm.js yedeği ve kodlayıcı alınmaz: WebAssembly olmayan tarayıcıda 3B karolar açılmaz, zemin Esri ile kalır).
// Site bu dosyaları yalnız kullanıcı Google 3B karolarını açınca indirir (dinamik import).
// Kullanım:  node tools/tiles3d_paketle.mjs        (npm kayıt defterine erişim gerekir)
// Güncelleme: aşağıdaki sürümleri değiştirip betiği yeniden çalıştır; three sürümü web/lib/three.module.js ile aynı kalmalı (r170).
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { gzipSync } from 'zlib';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), LIB = path.join(ROOT, 'web', 'lib');
const VERSIONS = { '3d-tiles-renderer': '0.5.4', three: '0.170.0', esbuild: '0.28.2' };
// web/js/google3d.js'in kullandıkları (yenisi gerekirse buraya ekle)
const ENTRY = `export { TilesRenderer, WGS84_ELLIPSOID } from '3d-tiles-renderer/three';
export { GoogleCloudAuthPlugin } from '3d-tiles-renderer/core/plugins';
export { GLTFExtensionsPlugin, LoadRegionPlugin, SphereRegion, UnloadTilesPlugin } from '3d-tiles-renderer/three/plugins';`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ls19-tiles3d-'));
try {
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"private":true,"type":"module"}');
  execFileSync('npm', ['i', '--save-exact', '--no-audit', '--no-fund', ...Object.entries(VERSIONS).map(([k, v]) => `${k}@${v}`)], { cwd: tmp, stdio: 'inherit' });
  const { build } = createRequire(path.join(tmp, 'package.json'))('esbuild');
  const name = '3d-tiles-renderer', v = VERSIONS[name];
  const banner = `/*! ${name} ${v} (Apache-2.0) — https://github.com/NASA-AMMOS/3DTilesRendererJS — LS19: tools/tiles3d_paketle.mjs ile paketlendi, lisans: ${name}.LICENSE.md */`;
  const r = await build({ stdin: { contents: ENTRY, resolveDir: tmp, loader: 'js' }, bundle: true, format: 'esm', minify: true, target: 'es2020', legalComments: 'none',
    external: ['three', 'three/addons/*'], banner: { js: banner }, write: false, logLevel: 'error' });
  const code = r.outputFiles[0].contents;
  fs.writeFileSync(path.join(LIB, `${name}.esm.js`), code);
  fs.writeFileSync(path.join(LIB, `${name}.LICENSE.md`), `# ${name} ${v}\n\nNASA-AMMOS/3DTilesRendererJS — https://github.com/NASA-AMMOS/3DTilesRendererJS\n\n${fs.readFileSync(path.join(tmp, 'node_modules', name, 'LICENSE'), 'utf8').trim()}\n`);
  console.log(`${name}.esm.js ${(code.length / 1024).toFixed(1)} KB (gzip ${(gzipSync(code).length / 1024).toFixed(1)} KB)`);
  // three r170: DRACOLoader + Draco çözücü (kodlayıcı alınmaz)
  const J = path.join(tmp, 'node_modules', 'three', 'examples', 'jsm');
  const DD = path.join(LIB, 'addons', 'libs', 'draco');
  fs.rmSync(DD, { recursive: true, force: true }); fs.mkdirSync(path.join(DD, 'gltf'), { recursive: true });
  fs.copyFileSync(path.join(J, 'loaders', 'DRACOLoader.js'), path.join(LIB, 'addons', 'loaders', 'DRACOLoader.js'));
  fs.copyFileSync(path.join(J, 'libs', 'draco', 'README.md'), path.join(DD, 'README.md'));
  for (const f of ['draco_wasm_wrapper.js', 'draco_decoder.wasm']) fs.copyFileSync(path.join(J, 'libs', 'draco', 'gltf', f), path.join(DD, 'gltf', f));
  console.log('DRACOLoader.js + libs/draco (three ' + VERSIONS.three + ')');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
