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
  ok(b && j.meshes[0].primitives[0].attributes.NORMAL !== undefined && e.tris <= (e.tex ? 20000 : 8000) && e.tris > 100, `${d} ${e.key}.glb (${e.tris} üçgen)`);
  if (e.tex) {                                                              // dokulu (NASA Eyes) modeller: UV, renk dokusu WebP, boyut sınırı, dönme ekseni +Y
    const prims = j.meshes.flatMap((m) => m.primitives), mats = prims.map((q) => j.materials[q.material]);
    ok(prims.every((q) => q.attributes.TEXCOORD_0 !== undefined) && mats.every((m) => m.pbrMetallicRoughness.baseColorTexture) && j.images.every((im) => im.mimeType === 'image/webp'), `${d}: UV + WebP renk dokusu (${j.images.length} doku)`);
    ok(b.length < 800e3 && /^NASA Eyes · /.test(e.kaynak) && e.yontem, `${d}: ${(b.length / 1024).toFixed(0)} kB < 800 kB, kaynak "${e.kaynak}"`);
    ok(j.nodes.every((n) => !n.matrix && !n.rotation && !n.scale && !n.translation), `${d}: düğüm dönüşümü yok (köşeler gövde çerçevesinde)`);
    // katalog boyutları (x, y, z=dönme ekseni; Blender düzeni) = glTF sınır kutusu (x, z, y): dönme ekseni glTF +Y
    const lo = [0, 1, 2].map((k) => Math.min(...prims.map((q) => j.accessors[q.attributes.POSITION].min[k]))), hi = [0, 1, 2].map((k) => Math.max(...prims.map((q) => j.accessors[q.attributes.POSITION].max[k])));
    const g = hi.map((h, k) => h - lo[k]);
    ok(Math.abs(g[0] - e.dims[0]) < 0.01 && Math.abs(g[2] - e.dims[1]) < 0.01 && Math.abs(g[1] - e.dims[2]) < 0.01, `${d}: sınır kutusu ${g.map((x) => x.toFixed(2)).join(' × ')} katalogla aynı (glTF y = dönme ekseni ${e.dims[2]})`);
  }
  ok(r > 0.5 && r < 4, `${d}: birim yarıçap (en uzak köşe ${r && r.toFixed(2)})`);
}
// bilinen ortalama yarıçaplar (km, ±%10): şekil modelinin birimi doğru mu
const known = { '162173': 0.448, '65803': 0.3805, '16': 111, '951': 6.1, '433': 8.42, '4': 262.7, '1': 469.7, '101955': 0.245, '25143': 0.165, '99942': 0.17, '216': 54, '21': 49 };
for (const [d, R] of Object.entries(known)) ok(Math.abs(cat[d].req_km / R - 1) < 0.1, `${d}: ${cat[d].req_km} km ~ ${R} km`);
// NASA Eyes modellerinin dönme ekseni: aynı cismin PDS (Gaskell) modelindeki boyutlarla karşılaştırma (tools/asteroit_eyes.mjs çıktısı, Blender düzeni x, y, z=dönme)
//   PDS: Eros 3,876 × 2,002 × 1,419 · Itokawa 3,469 × 1,883 × 1,503 · Vesta 2,154 × 2,175 × 1,784 (Eyes Eros'u kutup +Z'de verir: araç ROT ile çevirir)
const pds = { '433': [3.876, 2.002, 1.419], '25143': [3.469, 1.883, 1.503], '4': [2.154, 2.175, 1.784] };
for (const [d, P] of Object.entries(pds)) ok(Math.abs(cat[d].dims[2] - P[2]) < 0.03 && Math.abs(cat[d].dims[0] - P[0]) < 0.05, `${d}: Eyes modelinin dönme ekseni boyu ${cat[d].dims[2]} ~ PDS ${P[2]} (en kısa eksen, ekvator boyu ${cat[d].dims[0]} ~ ${P[0]})`);
// asteroids.js dokulu gölgelendirici: türev teğet çerçevesi, glTF normal haritası y çevrimi, ton eşleme + renk uzayı
const src = fs.readFileSync(new URL('../js/asteroids.js', import.meta.url), 'utf8');
ok(/sh\.tex/.test(src) && /m\.y = -m\.y/.test(src) && /FS_TROCK[\s\S]*colorspace_fragment/.test(src) && /setMeshoptDecoder/.test(src), 'asteroids.js: dokulu modeller (meshopt, normal haritası, renk uzayı)');
if (fail) process.exit(1);
