// Asteroit şekil modelleri: katalog <-> dosyalar, birim yarıçap, gerçek boyutla uyum
import fs from 'fs';
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('HATA', m); } else console.log('tamam', m); };
const cat = JSON.parse(fs.readFileSync(new URL('../models/ast/katalog.json', import.meta.url)));
const des = Object.keys(cat);
ok(des.length >= 28, `${des.length} asteroit modeli`);
for (const [d, e] of Object.entries(cat)) {
  const p = new URL(`../models/ast/${e.key}.glb`, import.meta.url), b = fs.existsSync(p) ? fs.readFileSync(p) : null;
  const j = b && JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString()), acc = j && j.accessors[j.meshes[0].primitives[0].attributes.POSITION];
  const r = acc && Math.max(...acc.max.map(Math.abs));
  ok(b && j.meshes[0].primitives[0].attributes.NORMAL !== undefined && e.tris <= 8000 && e.tris > 100, `${d} ${e.key}.glb (${e.tris} üçgen)`);
  ok(r > 0.5 && r < 4, `${d}: birim yarıçap (en uzak köşe ${r && r.toFixed(2)})`);
}
// bilinen ortalama yarıçaplar (km, ±%10): şekil modelinin birimi doğru mu
const known = { '433': 8.42, '4': 262.7, '1': 469.7, '101955': 0.245, '25143': 0.165, '99942': 0.17, '216': 54, '21': 49 };
for (const [d, R] of Object.entries(known)) ok(Math.abs(cat[d].req_km / R - 1) < 0.1, `${d}: ${cat[d].req_km} km ~ ${R} km`);
if (fail) process.exit(1);
