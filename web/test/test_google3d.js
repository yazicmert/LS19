// İsteğe bağlı Google 3B karolar (js/google3d.js) saf yardımcıları — Node 20+: cd web && node test/test_google3d.js
//  WGS-84 jeodezik → ECEF (bilinen noktalar), yerel doğu/kuzey/yukarı, ECEF → rampa çerçevesi matrisi (rampa başlangıçta, doğu +x, kuzey −z, yukarı +y,
//  yükseklik kayması), alt yüzdelik, gölgelendirici yaması (three r170'in MeshBasic ve MeshStandard gölgelendiricileri üzerinde), ayarlar, paketlenmiş kütüphane.
import fs from 'fs';
import * as G from '../js/google3d.js';
import { ShaderLib } from '../lib/three.module.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const near = (a, b, e) => Math.abs(a - b) <= e;
const apply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

// WGS-84: ekvator/başlangıç meridyeni = (a, 0, 0); kuzey kutbu = (0, 0, b); 45° K'de yarıçap a ile b arasında
const b = G.WGS84_A * (1 - G.WGS84_F), [x0, y0, z0] = G.geodeticToEcef(0, 0, 0), [, , zp] = G.geodeticToEcef(90, 0, 0);
check('WGS-84: ekvator ve kutup', near(x0, G.WGS84_A, 1e-6) && near(y0, 0, 1e-6) && near(z0, 0, 1e-6) && near(zp, b, 1e-6), `b = ${zp.toFixed(3)}`);
const p100 = G.geodeticToEcef(28.6, -80.6, 100), p0 = G.geodeticToEcef(28.6, -80.6, 0), { up, east, north } = G.enu(28.6, -80.6);
const dpu = [0, 1, 2].map((k) => (p100[k] - p0[k]) / 100);
check('100 m yükseklik jeodezik dikey boyunca', dpu.every((c, k) => near(c, up[k], 1e-9)));
const dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
check('doğu/kuzey/yukarı dik birim', [east, north, up].every((v) => near(dot(v, v), 1, 1e-12)) && near(dot(east, north), 0, 1e-12) && near(dot(east, up), 0, 1e-12) && near(dot(north, up), 0, 1e-12));

// ECEF → rampa çerçevesi: rampa başlangıçta, 1 km kuzey → z = −1000, 500 m doğu → x = 500, 100 m yukarı → y = 100
const LAT = 28.6272, LON = -80.6208, M = G.ecefToPadMatrix(LAT, LON, 0), pad = G.geodeticToEcef(LAT, LON, 0);
const at = (e, n, u) => apply(M, [0, 1, 2].map((k) => pad[k] + e * east28()[k] + n * north28()[k] + u * up28()[k]));
const E28 = G.enu(LAT, LON); function east28() { return E28.east; } function north28() { return E28.north; } function up28() { return E28.up; }
const o = apply(M, pad), q1 = at(0, 1000, 0), q2 = at(500, 0, 0), q3 = at(0, 0, 100);
check('rampa başlangıçta', o.every((c) => near(c, 0, 1e-6)), o.map((c) => c.toExponential(2)).join(','));
check('kuzey −z, doğu +x, yukarı +y', near(q1[2], -1000, 1e-6) && near(q1[0], 0, 1e-6) && near(q2[0], 500, 1e-6) && near(q3[1], 100, 1e-6), `${q1.map((c) => c.toFixed(3))} ${q2.map((c) => c.toFixed(3))}`);
const M7 = G.ecefToPadMatrix(LAT, LON, 7), z7 = apply(M7, G.geodeticToEcef(LAT, LON, 7));
check('yükseklik kayması: h0 = 7 m noktası başlangıca', z7.every((c) => near(c, 0, 1e-6)) && near(apply(M7, pad)[1], -7, 1e-6));
// 10 km uzakta küresel eğrilik: düz ENU'da y ≈ −d²/2R (≈ −7,8 m) — padground.js küresiyle aynı yönde
const far = G.geodeticToEcef(LAT + 10000 / 6.371e6 * 180 / Math.PI, LON, 0), yf = apply(M, far)[1];
check('10 km kuzeyde yüzey ufkun altında (eğrilik)', yf < -6 && yf > -10, yf.toFixed(2) + ' m');

check('alt yüzdelik (kule yükseklik vermesin)', G.lowPercentile([0.1, 0.2, 0.15, 95, 0.3, 0.12, 80, 0.18], 0.25) === 0.15 && G.lowPercentile([]) === null);

// gölgelendirici yaması: three r170'in gerçek MeshBasic/MeshStandard gölgelendiricileri
for (const k of ['basic', 'standard']) {
  const sh = { vertexShader: ShaderLib[k].vertexShader, fragmentShader: ShaderLib[k].fragmentShader };
  const ok = G.patchShader(sh);
  check(`gölgelendirici yaması: ${k}`, ok && /varying vec3 vG3;/.test(sh.vertexShader) && /vG3 = \(modelMatrix \* vec4\(transformed/.test(sh.vertexShader)
    && /discard;/.test(sh.fragmentShader) && /outgoingLight = mix\(lit/.test(sh.fragmentShader) && sh.fragmentShader.indexOf('outgoingLight = mix(lit') < sh.fragmentShader.indexOf('#include <opaque_fragment>')
    && G.G3D_UNIFORMS.every((u) => sh.fragmentShader.includes(u)));
}
check('beklenmeyen gölgelendiricide yama yapılmaz', G.patchShader({ vertexShader: 'void main(){}', fragmentShader: 'void main(){}' }) === false);

// ayarlar (Node'da bellekte)
let s = G.saveG3dSettings({ key: '  AIzaTEST  ', on: true });
check('özellik bayrağı pasif: kayıtlı anahtar olsa da katman başlamaz', G.G3D_ENABLED === false && !G.g3dUsable(s) && !G.g3dUsable({ on: true, key: 'x', url: '' }));
check('ayar: anahtar kırpılır, açık (bayrak açıkken kullanılır)', s.key === 'AIzaTEST' && s.on && G.g3dUsable(s, true));
s = G.saveG3dSettings({ key: '', on: false });
check('ayar: anahtar silinir, kapalı', s.key === '' && !s.on && !G.g3dUsable(s, true));
check('ayar: anahtarsız açık kullanılamaz, url (deneme kümesi) yeter', !G.g3dUsable({ on: true, key: '', url: '' }, true) && G.g3dUsable({ on: true, key: '', url: 'x/tileset.json' }, true));

// paketlenmiş kütüphane ve Draco çözücü (tools/tiles3d_paketle.mjs)
const lib = fs.readFileSync(new URL('../lib/3d-tiles-renderer.esm.js', import.meta.url), 'utf8');
const names = ['TilesRenderer', 'GoogleCloudAuthPlugin', 'GLTFExtensionsPlugin', 'LoadRegionPlugin', 'SphereRegion', 'UnloadTilesPlugin'];
const exp = (lib.match(/export\{([^}]*)\}/) || [, ''])[1];
check('3d-tiles-renderer paketi: gereken sınıflar dışa aktarılıyor, three dışarıda', names.every((n) => new RegExp(`as ${n}\\b|\\b${n}\\b`).test(exp)) && /from"three"/.test(lib) && !/REVISION\s*=/.test(lib), exp.slice(0, 120));
check('lisans ve Draco çözücü yerinde', fs.existsSync(new URL('../lib/3d-tiles-renderer.LICENSE.md', import.meta.url)) && fs.existsSync(new URL('../lib/addons/loaders/DRACOLoader.js', import.meta.url))
  && fs.existsSync(new URL('../lib/addons/libs/draco/gltf/draco_decoder.wasm', import.meta.url)) && fs.existsSync(new URL('../lib/addons/libs/draco/gltf/draco_wasm_wrapper.js', import.meta.url)));
const src = fs.readFileSync(new URL('../js/google3d.js', import.meta.url), 'utf8');
check('kütüphaneler yalnız açılınca iner (dinamik import)', /await Promise\.all\(\[import\('\.\.\/lib\/3d-tiles-renderer\.esm\.js'\)/.test(src) && !/^import .*3d-tiles-renderer/m.test(src));

console.log(fail ? `\n${fail} HATA` : '\nTüm denetimler geçti');
process.exit(fail ? 1 : 0);
