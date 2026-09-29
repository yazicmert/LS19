// 3B uydu modeli kataloğu: eşleşmeler ve dosyalar
import { MODELS, modelFor, showDist, MOON_MODELS } from '../js/satcatalog.js';
import fs from 'fs';
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('HATA', m); } else console.log('tamam', m); };
for (const k of Object.keys(MODELS)) ok(fs.existsSync(new URL(`../models/sats/${k}.glb`, import.meta.url)), `dosya ${k}.glb`);
ok(modelFor(25544, 'ISS (ZARYA)').key === 'iss', 'ISS');
ok(modelFor(49260, 'LANDSAT 9').key === 'landsat8' && /Landsat 9/.test(modelFor(49260).note), 'Landsat 9 -> Landsat 8 modeli, açıklamalı');
ok(modelFor(99999, 'GOES 19').key === 'goes', 'GOES ad kalıbı');
ok(modelFor(99998, 'TDRS 12').key === 'tdrs3' && modelFor(99997, 'TDRS 5').key === 'tdrs1', 'TDRS kuşakları');
ok(modelFor(12345, 'STARLINK-1007') === null, 'modelsiz uydu');
ok(Object.values(MOON_MODELS).every((k) => MODELS[k]), 'Ay uyduları');
ok(Math.abs(showDist('iss') - 16.35) < 0.01 && showDist('cygnss') === 1.5, 'görünme uzaklığı');
if (fail) process.exit(1);
