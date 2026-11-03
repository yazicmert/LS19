// Roket bilgi kartlarındaki tam fırlatma aracı modellerini (web/models/rockets/<anahtar>.glb) resmî NASA 3D Resources modellerinden üretir:
//   saturnv ← "3D Models/Saturn V/Saturn V.glb"
//   (SLS Block 1: NASA 3D Resources'taki "Block 1 (GNC markings).blend" denendi; çekirdek kademe ve SRB'lerin ana kabukları dosyada yok —
//    yalnız besleme boruları, bağlantılar, motorlar ve üst kısım var. SLS bu yüzden ölçüden çizilir: rocketmodels.js makeLaunchVehicle('sls').)
// Çıktı: glTF Y-yukarı, roket ekseni +Y, taban y = 0, gerçek boy METRE (Saturn V 110,6 m); malzeme paletiyle birleştirilmiş,
// ≤ MAXT üçgen, dokular WebP ≤ 1024 px, meshopt.
// Kullanım (boş klasörde, uydu_modelleri.mjs ile aynı paketler): raw_<anahtar>.glb koyun; node roket_modelleri.mjs [anahtar …]
// NASA 3D Resources içeriği telifsizdir (kamu malı); NASA logosu/amblemi kullanım kurallarına tabidir.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, weld, simplify, prune, textureCompress, flatten, join, palette, reorder, getBounds, quantize } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.encoder': MeshoptEncoder });
const SPEC = { saturnv: { height: 110.6, maxT: 60000, err: 0.01 } };
const only = process.argv.slice(2), out = {};
fs.mkdirSync('out', { recursive: true });
const tris = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((s, p) => s + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0);
for (const [key, sp] of Object.entries(SPEC)) {
  if (only.length && !only.includes(key)) continue;
  if (!fs.existsSync(`raw_${key}.glb`)) { console.log(key, 'raw yok'); continue; }
  const doc = await io.read(`raw_${key}.glb`);
  await doc.transform(dedup(), palette({ min: 2 }), dedup(), flatten(), join({ keepNamed: false }), weld());
  // ölçek ve konum: taban y = 0, eksen x = z = 0, boy = gerçek boy (m)
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0], b = getBounds(scene), h = b.max[1] - b.min[1], k = sp.height / h;
  const cx = (b.max[0] + b.min[0]) / 2, cz = (b.max[2] + b.min[2]) / 2;
  for (const node of doc.getRoot().listNodes()) {
    if (node.getParentNode()) continue;
    const t = node.getTranslation(), s = node.getScale();
    node.setScale([s[0] * k, s[1] * k, s[2] * k]).setTranslation([(t[0] - cx) * k, (t[1] - b.min[1]) * k, (t[2] - cz) * k]);
  }
  const t0 = tris(doc);
  if (t0 > sp.maxT) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: sp.maxT / t0, error: sp.err, lockBorder: false }));
  await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }), reorder({ encoder: MeshoptEncoder }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await io.write(`out/${key}.glb`, doc);
  const b2 = getBounds(doc.getRoot().listScenes()[0]);
  out[key] = { tris: Math.round(tris(doc)), height: +(b2.max[1] - b2.min[1]).toFixed(2), width: +(b2.max[0] - b2.min[0]).toFixed(2), kB: Math.round(fs.statSync(`out/${key}.glb`).size / 1024), mats: doc.getRoot().listMaterials().length };
  console.log(key, Math.round(t0), '->', out[key]);
}
fs.writeFileSync('out/ozet_roket.json', JSON.stringify(out, null, 1));
