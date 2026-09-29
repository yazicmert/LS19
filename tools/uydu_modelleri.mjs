// LS19 uydu modellerini NASA 3D Resources GLB'lerinden üretir (web/models/sats/*.glb).
// Kullanım (boş bir klasörde):
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions draco3dgltf meshoptimizer sharp
//   uydu_modelleri.txt'deki her satır için (anahtar|klasör/dosya):
//     curl -o raw_<anahtar>.glb "https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/<klasör/dosya (URL kodlu)>.glb"
//   node uydu_modelleri.mjs [anahtar …]   -> out/<anahtar>.glb
// Adımlar: Draco çöz, tekrarları birleştir, ≥80 bin üçgende sadeleştir, dokular en çok 1024 px WebP, meshopt sıkıştırma + nicemleme.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { dedup, weld, simplify, prune, resample, textureCompress, quantize, flatten, join, getBounds, reorder, instance } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.encoder': MeshoptEncoder });
// dış (eksik) doku adresleri -> 1x1 gri PNG
const PX = 'data:image/png;base64,' + (await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 170, g: 170, b: 170 } } }).png().toBuffer()).toString('base64');
function patchGlb(buf) {
  const jl = buf.readUInt32LE(12), json = JSON.parse(buf.slice(20, 20 + jl).toString());
  let ch = false; for (const im of json.images || []) if (im.uri && !im.uri.startsWith('data:')) { im.uri = PX; ch = true; }
  if (!ch) return buf;
  let s = Buffer.from(JSON.stringify(json)); const pad = (4 - s.length % 4) % 4; s = Buffer.concat([s, Buffer.alloc(pad, 0x20)]);
  const rest = buf.slice(20 + jl), out = Buffer.alloc(12 + 8 + s.length + rest.length);
  buf.copy(out, 0, 0, 12); out.writeUInt32LE(s.length, 12); out.writeUInt32LE(0x4E4F534A, 16); s.copy(out, 20); rest.copy(out, 20 + s.length); out.writeUInt32LE(out.length, 8);
  return out;
}
const MAXT = +(process.env.MAXT || 80000);
fs.mkdirSync('out', { recursive: true });
const only = process.argv.slice(2);
for (const f of fs.readdirSync('.').filter((f) => f.startsWith('raw_') && f.endsWith('.glb'))) {
  const key = f.slice(4, -4); if (only.length && !only.includes(key)) continue;
  const doc = await io.readBinary(patchGlb(fs.readFileSync(f)));
  if (key === 'iss') for (const n of doc.getRoot().listNodes()) if (/^(bendedtru|pCylinder)/.test(n.getName())) n.dispose();   // modelden kopuk, istasyonun 40 m üstünde duran parça yığını
  doc.getRoot().listExtensionsUsed().filter((e) => e.extensionName === 'KHR_draco_mesh_compression').forEach((e) => e.dispose());
  let tris = 0; const count = () => { tris = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const i = p.getIndices(); tris += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; } return tris; };
  const t0 = count();
  await doc.transform(dedup(), instance({ min: 3 }), flatten(), join(), weld());
  if (count() > MAXT) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: MAXT / tris, error: 0.02, lockBorder: false }));
  await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 80 }), reorder({ encoder: MeshoptEncoder }), quantize());
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const b = getBounds(doc.getRoot().listScenes()[0]);
  await io.write('out/' + key + '.glb', doc);
  console.log(key.padEnd(10), 'tris', Math.round(t0), '->', Math.round(count()), 'kB', Math.round(fs.statSync(f).size / 1024), '->', Math.round(fs.statSync('out/' + key + '.glb').size / 1024), 'bb', b.max.map((m, i) => +(m - b.min[i]).toFixed(2)).join('x'));
}
