// Kalkış sahnesindeki Kennedy Uzay Merkezi yapılarını (web/models/ksc/<anahtar>.glb) resmî NASA 3D Resources modellerinden üretir:
//   vab     ← "3D Models/Vehicle Assembly Building (VAB)/Vehicle Assembly Building (VAB).glb"
//             yalnız yüksek bölme (high bay) gövdesi alınır; modeldeki temsili Fırlatma Kontrol Merkezi, tanklar ve su kulesi atılır
//             (gerçek yerleri OSM binalarından gelir). Ölçü: OSM'deki VAB yüksek bölme çokgeni 157 m × 137 m, yükseklik 160 m.
//             Kaynak model biçimlendirilmiş (yüksek bölme ≈ 13,5 × 9,2 × 13,7 birim): boy ve uzun kenar aynı ölçekle (×11,7) gerçeğe oturur,
//             kısa kenar ×14,9 ile 137 m'ye genişletilir (tek eksende %27 esneme; kapı/bayrak dokuları o eksende biraz geniş görünür).
//             Çıktı ekseni: +z uzun kenar (157 m; bayrak/NASA logosu cepheleri ±x'e bakar), ±z cepheleri yüksek bölme kapıları; taban y = 0, gövde ortası x = z = 0.
//   crawler ← "3D Models/Crawler/Crawler.glb" (paletli taşıyıcı; gerçek boyu 40 m × 34,7 m, 6–8 m): ×4,56, yürüyüş yönü +x; taban y = 0, ortası x = z = 0.
// Kullanım (boş klasörde, roket_modelleri.mjs ile aynı paketler): raw_vab.glb, raw_crawler.glb koyun; node ksc_modelleri.mjs [anahtar …] → out/ksc/<anahtar>.glb
// NASA 3D Resources içeriği telifsizdir (kamu malı); NASA logosu/amblemi kullanım kurallarına tabidir.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, weld, simplify, prune, textureCompress, flatten, join, palette, reorder, getBounds, quantize, transformMesh, compactPrimitive } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.encoder': MeshoptEncoder });
// keep: kaynak (dünya) koordinatında tutulacak kutu; size: çıktı boyutları (m) [x, y, z] — kutu bu boyuta ölçeklenir
const SPEC = {
  vab: { keep: { min: [-4.62, -2.94, -6.80], max: [4.62, 10.8, 6.73] }, size: [137, 160, 157], maxT: 6000, err: 0.002 },
  crawler: { keep: null, size: [40, null, null], maxT: 40000, err: 0.03, sloppy: true },   // çok sayıda küçük parça (korkuluk, palet): topoloji koruyan sadeleştirme yetmez
};
const only = process.argv.slice(2), out = {};
fs.mkdirSync('out/ksc', { recursive: true });
const tris = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((s, p) => s + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0);
const mul = (a, b) => { const r = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return r; };   // sütun-ana 4×4
for (const [key, sp] of Object.entries(SPEC)) {
  if (only.length && !only.includes(key)) continue;
  if (!fs.existsSync(`raw_${key}.glb`)) { console.log(key, 'raw yok'); continue; }
  const doc = await io.read(`raw_${key}.glb`), root = doc.getRoot();
  root.listExtensionsUsed().filter((e) => e.extensionName === 'KHR_draco_mesh_compression').forEach((e) => e.dispose());
  await doc.transform(dedup(), palette({ min: 2 }), dedup(), flatten());
  // düğüm dönüşümlerini köşelere işle (dünya koordinatı)
  for (const n of root.listNodes()) if (n.getMesh()) { transformMesh(n.getMesh(), n.getWorldMatrix()); n.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  for (const n of root.listNodes()) if (!n.getMesh()) n.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  // kutu dışında köşesi olan üçgenleri at
  if (sp.keep) for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), idx = p.getIndices(), v = [], keep = [];
    const inside = (i) => { pos.getElement(i, v); return v.every((x, k) => x >= sp.keep.min[k] && x <= sp.keep.max[k]); };
    const n = idx ? idx.getCount() : pos.getCount(), get = (t) => (idx ? idx.getScalar(t) : t);
    for (let t = 0; t < n; t += 3) { const a = get(t), b = get(t + 1), c = get(t + 2); if (inside(a) && inside(b) && inside(c)) keep.push(a, b, c); }
    if (!keep.length) { p.dispose(); continue; }
    const acc = doc.createAccessor().setType('SCALAR').setArray(pos.getCount() > 65535 ? new Uint32Array(keep) : new Uint16Array(keep));
    p.setIndices(acc); compactPrimitive(p);
  }
  for (const m of root.listMeshes()) if (!m.listPrimitives().length) m.dispose();
  await doc.transform(prune(), join({ keepNamed: false }), weld());
  // ölçek: kutu → hedef boyut (boş eksenler ilk verilen eksenin ölçeğiyle); taban y = 0, orta x = z = 0
  const b = getBounds(root.listScenes()[0]), ext = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
  const k0 = sp.size.map((s, k) => (s ? s / ext[k] : null)), first = k0.find((x) => x), k = k0.map((x) => x || first);
  const S = [k[0], 0, 0, 0, 0, k[1], 0, 0, 0, 0, k[2], 0, 0, 0, 0, 1];
  const T = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -(b.max[0] + b.min[0]) / 2, -b.min[1], -(b.max[2] + b.min[2]) / 2, 1];
  for (const m of root.listMeshes()) transformMesh(m, mul(S, T));
  for (const m of root.listMaterials()) m.setMetallicFactor(0).setRoughnessFactor(0.85);                       // kaynakta metalik = 1 (çevre haritası olmayan sahnede kara görünür): boyalı beton/çelik
  const t0 = tris(doc);
  if (t0 > sp.maxT && !sp.sloppy) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: sp.maxT / t0, error: sp.err, lockBorder: false }));
  if (t0 > sp.maxT && sp.sloppy) for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {          // kaba sadeleştirme (simplifySloppy): parçaları da birleştirir
    const pos = p.getAttribute('POSITION'), idx = p.getIndices(), n = idx.getCount();
    const [ix] = MeshoptSimplifier.simplifySloppy(Uint32Array.from(idx.getArray()), pos.getArray() instanceof Float32Array ? pos.getArray() : Float32Array.from(pos.getArray()), 3, null, Math.max(3, Math.floor(n * sp.maxT / t0 / 3) * 3), sp.err);
    p.setIndices(doc.createAccessor().setType('SCALAR').setArray(pos.getCount() > 65535 ? ix : Uint16Array.from(ix))); compactPrimitive(p);
  }
  await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }), reorder({ encoder: MeshoptEncoder }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await io.write(`out/ksc/${key}.glb`, doc);
  const b2 = getBounds(root.listScenes()[0]);
  out[key] = { tris: Math.round(tris(doc)), size: [0, 1, 2].map((i) => +(b2.max[i] - b2.min[i]).toFixed(1)), kB: Math.round(fs.statSync(`out/ksc/${key}.glb`).size / 1024), mats: root.listMaterials().length };
  console.log(key, Math.round(t0), '->', out[key]);
}
fs.writeFileSync('out/ozet_ksc.json', JSON.stringify(out, null, 1));
