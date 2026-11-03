// 3B uydu modeli kataloğu: eşleşmeler ve dosyalar
import { MODELS, modelFor, showDist, MOON_MODELS, SRC_TITLE, srcOf } from '../js/satcatalog.js';
import fs from 'fs';
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('HATA', m); } else console.log('tamam', m); };
for (const k of Object.keys(MODELS)) ok(fs.existsSync(new URL(`../models/sats/${k}.glb`, import.meta.url)), `dosya ${k}.glb`);
ok(modelFor(25544, 'ISS (ZARYA)').key === 'iss', 'ISS');
ok(modelFor(49260, 'LANDSAT 9').key === 'landsat9' && modelFor(39084, 'LANDSAT 8').key === 'landsat8', 'Landsat 9 kendi modeliyle (NASA Eyes), Landsat 8 kendi modeliyle');
// NASA Eyes on the Earth modelleri: aktif uydular kendi resmî modelleriyle
const EYES = { 54754: 'swot', 65053: 'nisar', 58928: 'pace', 40376: 'smap', 38358: 'nustar', 49954: 'ixpe', 63182: 'spherex', 57386: 'starling', 57389: 'starling',
  59881: 'prefire', 59965: 'prefire', 59588: 'acs3', 56174: 'tempo', 43013: 'noaa20', 54234: 'noaa21', 43476: 'gracefo', 43477: 'gracefo', 23802: 'polar', 26113: 'image' };
ok(Object.entries(EYES).every(([id, k]) => { const m = modelFor(+id, ''); return m && m.key === k && m.src === 'eyes'; }), `NASA Eyes modelleri NORAD numarasıyla eşleşir (${Object.keys(EYES).length} uydu)`);
ok(modelFor(99990, 'GRACE-FO 2').key === 'gracefo' && modelFor(43013).note == null && /TEMPO/.test(modelFor(56174).note), 'GRACE-FO ad kalıbı kendi modeline; NOAA-20 artık "aynı gövde" notu taşımaz; Intelsat 40e TEMPO notlu');
ok(Object.values(MODELS).every((m) => m.size > 0.1 && m.size < 600 && m.title && (!m.src || SRC_TITLE[m.src])) && srcOf(MODELS.iss) === 'NASA 3D Resources' && srcOf(MODELS.swot) === 'NASA Eyes on the Earth', 'her modelin boyutu, adı ve kaynağı var');
// yönelim: Eyes'ın 'align' tanımındaki Dünya ekseni rot ile sahnenin −Y'sine (başucunun tersi), uçuş ekseni +Z'ye döner
const rotV = (r, v) => { const [a, b, c] = r, R = (x, y, z) => [x, y, z];
  let [x, y, z] = v; [x, y, z] = R(x * Math.cos(c) - y * Math.sin(c), x * Math.sin(c) + y * Math.cos(c), z);           // Euler XYZ: v' = Rx·Ry·Rz·v
  [x, y, z] = R(x * Math.cos(b) + z * Math.sin(b), y, -x * Math.sin(b) + z * Math.cos(b)); [x, y, z] = R(x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)); return [x, y, z]; };
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1], n = (v) => v.map((q) => -q);
const ALIGN = { swot: [n(Y), n(Z)], nisar: [n(Y), Z], pace: [n(Y), n(X)], smap: [n(Y), X], starling: [n(Y), X], prefire: [n(Y), X], acs3: [n(Z), n(Y)], tempo: [Y, Z],
  landsat9: [Y, X], noaa20: [Y, n(Z)], noaa21: [Y, n(Z)], gracefo: [n(Y), Z], polar: [n(Y), Z], image: [Z, X] };
const near = (a, b) => a.every((q, i) => Math.abs(q - b[i]) < 1e-12);
ok(Object.entries(ALIGN).every(([k, [e, v]]) => near(rotV(MODELS[k].rot, e), [0, -1, 0]) && near(rotV(MODELS[k].rot, v), [0, 0, 1])), `Eyes yönelimleri: Dünya'ya bakan eksen başucunun tersine, uçuş ekseni hız yönüne (${Object.keys(ALIGN).length} model)`);
const big = Object.keys(MODELS).filter((k) => fs.statSync(new URL(`../models/sats/${k}.glb`, import.meta.url)).size > 2 * 1024 * 1024);
ok(big.length === 0, 'her model dosyası ≤ 2 MB (yalnız yaklaşınca indirilir)' + (big.length ? ': ' + big.join(',') : ''));
ok(modelFor(99999, 'GOES 19').key === 'goes', 'GOES ad kalıbı');
ok(modelFor(99998, 'TDRS 12').key === 'tdrs3' && modelFor(99997, 'TDRS 5').key === 'tdrs1', 'TDRS kuşakları');
ok(modelFor(12345, 'STARLINK-1007') === null, 'modelsiz uydu');
ok(Object.values(MOON_MODELS).every((k) => MODELS[k]), 'Ay uyduları');
ok(Math.abs(showDist('iss') - 16.35) < 0.01 && showDist('cygnss') === 1.5, 'görünme uzaklığı');
// TEME -> ICRF her yerde aynı (earth.temeToIcrf): model konumu, seçili uydu, kart, takip/kamera odağı ve uydu worker'ı. Eski NPBᵀ yaklaşımı (ekinoks denklemi yok)
// alçak yörüngede ~40 m fark yaratıyordu: yakından bakılan model (ör. SWOT, 37 m'den) kamera odağından kayıyordu
const src = (f) => fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
ok(['satlayer.js', 'tracker.js', 'sats.js'].every((f) => !/E\.precession\(/.test(src(f)) && /temeToIcrf/.test(src(f))), 'TEME -> ICRF: satlayer, tracker ve sats worker yalnız earth.temeToIcrf kullanır');
if (fail) process.exit(1);
