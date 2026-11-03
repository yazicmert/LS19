// NASA Eyes on the Earth / Eyes on Asteroids dokulu asteroit modellerini LS19 şekil sözleşmesine çevirir (web/models/ast/<anahtar>.glb):
//   hacim merkezi orijinde, birim hacim-eşdeğeri yarıçap (çalışma anında req_km ile çarpılır), dönme ekseni glTF +Y (asteroit_modelleri.py ile aynı).
// Renk (albedo) ve normal dokuları WebP (≤ 1024 px) olarak korunur; ağ ≤ 20 bin üçgen; meshopt.
// Kullanım (boş bir klasörde, uydu_modelleri.mjs ile aynı paketler):
//   raw_<anahtar>/ klasörüne https://eyes.nasa.gov/assets/static/models/<yol> (.gltf + buffers/images) indirilir (liste: asteroit_eyes.txt)
//   node asteroit_eyes.mjs [anahtar …]   -> out/<anahtar>.glb ve out/ozet.json (hacim, boyut oranları, üçgen)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, weld, simplify, prune, textureCompress, flatten, join, reorder } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.encoder': MeshoptEncoder });
// Eyes modelinin dönme ekseni +Y değilse eksen düzeltmesi (yeni = M · eski). Eros'un Eyes modelinde kutup +Z'de: PDS (Gaskell) modeliyle
// 24 eksen dönüşü arasında en yakın eşleşme (ortalama en yakın nokta uzaklığı 0,027 req) x' = x, y' = z, z' = −y.
const ROT = { eros: [[1, 0, 0], [0, 0, 1], [0, -1, 0]] };
const MAXT = 20000, only = process.argv.slice(2), summary = {};
fs.mkdirSync('out', { recursive: true });
function jacobi(S) {
  const a = S.map((r) => r.slice()), v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 50; it++) for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
    if (Math.abs(a[p][q]) < 1e-15) continue;
    const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.hypot(th, 1)), c = 1 / Math.hypot(t, 1), s = t * c;
    for (let k = 0; k < 3; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
    for (let k = 0; k < 3; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
    for (let k = 0; k < 3; k++) { const x = v[k][p], y = v[k][q]; v[k][p] = c * x - s * y; v[k][q] = s * x + c * y; }
  }
  return { vals: [a[0][0], a[1][1], a[2][2]], vecs: [0, 1, 2].map((j) => [v[0][j], v[1][j], v[2][j]]) };
}
const mul = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const mul3 = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
for (const dir of fs.readdirSync('.').filter((f) => f.startsWith('raw_') && fs.statSync(f).isDirectory())) {
  const key = dir.slice(4); if (only.length && !only.includes(key)) continue;
  const doc = await io.read(`${dir}/${fs.readdirSync(dir).find((x) => x.endsWith('.gltf'))}`);
  await doc.transform(dedup(), flatten(), join(), weld());
  // 1) dünya dönüşümünü köşelere işle (düğümler birim dönüşüme)
  const prims = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const W = node.getWorldMatrix(), F = ROT[key];
    // M = F · W (F yoksa W)
    const M = F ? W.map((w, i) => { const c = (i / 4) | 0, r = i % 4; return r === 3 ? w : F[r][0] * W[c * 4] + F[r][1] * W[c * 4 + 1] + F[r][2] * W[c * 4 + 2]; }) : W;
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION'), nor = p.getAttribute('NORMAL'), a = pos.getArray().slice(), b = nor ? nor.getArray().slice() : null;
      for (let i = 0; i < a.length; i += 3) { const q = mul(M, [a[i], a[i + 1], a[i + 2]]); a[i] = q[0]; a[i + 1] = q[1]; a[i + 2] = q[2]; }
      if (b) for (let i = 0; i < b.length; i += 3) { const q = mul3(M, [b[i], b[i + 1], b[i + 2]]), n = Math.hypot(...q) || 1; b[i] = q[0] / n; b[i + 1] = q[1] / n; b[i + 2] = q[2] / n; }
      pos.setArray(a); if (b) nor.setArray(b); prims.push(p);
    }
    node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  // 2) kapalı yüzeyin hacmi ve hacim merkezi (imzalı dörtyüzlüler)
  let V = 0, cx = 0, cy = 0, cz = 0;
  for (const p of prims) {
    const a = p.getAttribute('POSITION').getArray(), idx = p.getIndices() ? p.getIndices().getArray() : null, n = idx ? idx.length : a.length / 3;
    for (let k = 0; k < n; k += 3) {
      const i = idx ? idx[k] * 3 : k * 3, j = idx ? idx[k + 1] * 3 : (k + 1) * 3, l = idx ? idx[k + 2] * 3 : (k + 2) * 3;
      const v = (a[i] * (a[j + 1] * a[l + 2] - a[j + 2] * a[l + 1]) - a[i + 1] * (a[j] * a[l + 2] - a[j + 2] * a[l]) + a[i + 2] * (a[j] * a[l + 1] - a[j + 1] * a[l])) / 6;
      V += v; cx += v * (a[i] + a[j] + a[l]) / 4; cy += v * (a[i + 1] + a[j + 1] + a[l + 1]) / 4; cz += v * (a[i + 2] + a[j + 2] + a[l + 2]) / 4;
    }
  }
  const sgn = Math.sign(V); V = Math.abs(V); cx = cx * sgn / V; cy = cy * sgn / V; cz = cz * sgn / V;
  const req = Math.cbrt(3 * V / (4 * Math.PI));
  // ikinci moment (merkeze göre) ∫xxᵀdV = Σ V_t/20 (Σ v vᵀ + s sᵀ) — en büyük eylemsizlik ekseni (asal eksende dönen cisimde dönme ekseni) +Y'ye yakın olmalı
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of prims) {
    const a = p.getAttribute('POSITION').getArray(), idx = p.getIndices() ? p.getIndices().getArray() : null, n = idx ? idx.length : a.length / 3;
    for (let k = 0; k < n; k += 3) {
      const vs = [0, 1, 2].map((o) => { const i = (idx ? idx[k + o] : k + o) * 3; return [a[i] - cx, a[i + 1] - cy, a[i + 2] - cz]; });
      const [A, B, D] = vs, v = sgn * (A[0] * (B[1] * D[2] - B[2] * D[1]) - A[1] * (B[0] * D[2] - B[2] * D[0]) + A[2] * (B[0] * D[1] - B[1] * D[0])) / 6;
      const sm = [0, 1, 2].map((q) => A[q] + B[q] + D[q]);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r][c] += v / 20 * (A[r] * A[c] + B[r] * B[c] + D[r] * D[c] + sm[r] * sm[c]);
    }
  }
  // en küçük ikinci momentli değil, en büyük eylemsizlikli eksen = C'nin en küçük özdeğerinin özvektörü (ters üs yinelemesi yerine Jacobi)
  const ev = jacobi(C), pole = ev.vecs[ev.vals.indexOf(Math.min(...ev.vals))], tilt = Math.acos(Math.min(1, Math.abs(pole[1]))) * 180 / Math.PI;
  // 3) merkeze al, birim hacim-eşdeğeri yarıçapa ölçekle; boyut oranları (x, y=dönme ekseni, z)
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) {
    const a = p.getAttribute('POSITION').getArray().slice();
    for (let i = 0; i < a.length; i += 3) { a[i] = (a[i] - cx) / req; a[i + 1] = (a[i + 1] - cy) / req; a[i + 2] = (a[i + 2] - cz) / req; for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a[i + k]); hi[k] = Math.max(hi[k], a[i + k]); } }
    p.getAttribute('POSITION').setArray(a);
  }
  let tris = 0; const count = () => { tris = 0; for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; return tris; };
  const t0 = count();
  if (t0 > MAXT) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: MAXT / t0, error: 0.005, lockBorder: true }));
  await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }), reorder({ encoder: MeshoptEncoder }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await io.write(`out/${key}.glb`, doc);
  const dims = hi.map((h, k) => +(h - lo[k]).toFixed(3));
  summary[key] = { reqModel: +req.toFixed(5), poleTilt: +tilt.toFixed(1), tris: Math.round(count()), dims, kB: Math.round(fs.statSync(`out/${key}.glb`).size / 1024) };
  console.log(key.padEnd(10), 'üçgen', Math.round(t0), '->', summary[key].tris, '· boyut (x, y=dönme ekseni, z)', dims.join(' × '), '·', summary[key].kB, 'kB · en büyük eylemsizlik ekseni ile +Y arası', tilt.toFixed(1) + '°');
}
fs.writeFileSync('out/ozet.json', JSON.stringify(summary, null, 1));
