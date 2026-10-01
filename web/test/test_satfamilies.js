// Uydu aileleri: ad/yörünge -> aile eşleşmeleri, model dosyaları (tek COLOR_0, makul boyut), gerçek model önceliği
import { FAMILIES, FAMILY_KEYS, familyOf } from '../js/satfamilies.js';
import { modelFor } from '../js/satcatalog.js';
import fs from 'fs';
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('HATA', m); } else console.log('tamam', m); };
const f = (name, mm = 15, ecc = 0.001) => familyOf({ OBJECT_NAME: name, MEAN_MOTION: mm, ECCENTRICITY: ecc });
for (const k of FAMILY_KEYS) {
  const p = new URL(`../models/fam/${k}.glb`, import.meta.url), b = fs.readFileSync(p), j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString());
  const at = j.meshes[0].primitives[0].attributes, acc = j.accessors[at.POSITION], ext = Math.max(...acc.max.map((m, i) => m - acc.min[i]));
  ok(j.meshes.length === 1 && at.COLOR_0 !== undefined && at.COLOR_1 === undefined, `${k}.glb: tek ağ, tek renk özniteliği`);
  ok(ext > 0.1 && ext < 40, `${k}.glb: boyut ${ext.toFixed(1)} m makul`);
}
ok(f('STARLINK-1008') === 'starlink_v1' && f('STARLINK-30107') === 'starlink_v2' && f('STARLINK-DTC 1') === 'starlink_v2', 'Starlink v1/v2');
ok(f('ONEWEB-0012') === 'oneweb' && f('KUIPER-00008') === 'kuiper' && f('QIANFAN-1') === 'flatsat' && f('GUOWANG 3') === 'flatsat', 'OneWeb, Kuiper, düz panelli');
ok(f('IRIDIUM 106') === 'iridium' && f('GLOBALSTAR M069') === 'globalstar', 'Iridium, Globalstar');
ok(f('NAVSTAR 43 (USA 132)', 2) === 'gnss' && f('BEIDOU-3 M1', 1.86) === 'gnss' && f('GSAT0201 (GALILEO 5)', 1.7) === 'gnss', 'seyrüsefer');
ok(f('FLOCK 4Q-16') === 'cubesat' && f('ICEYE-X5') === 'microsat', 'küçük uydular');
ok(f('SOMESAT-1', 1.0027, 0.0002) === 'geo' && f('YAOGAN-2') === 'bus', 'yörüngeden GEO, varsayılan gövde');
ok(FAMILY_KEYS.every((k) => FAMILIES[k].title && FAMILIES[k].note), 'aile başlık ve açıklamaları');
// gerçek (NASA) model önceliği: aile modeli yalnız gerçek modeli olmayanlara
ok(modelFor(26900, 'INTELSAT 902 (IS-902)').key === 'ssl1300' && /SSL-1300/.test(modelFor(26900, 'INTELSAT 902').note), 'ticari GEO -> SSL-1300 (açıklamalı)');
ok(modelFor(25560, 'SWAS').key === 'swas' && modelFor(27651, 'SORCE').key === 'sorce', 'SWAS, SORCE');
ok(modelFor(44714, 'STARLINK-1008') === null, 'Starlink gerçek modelsiz -> aile');
if (fail) process.exit(1);
