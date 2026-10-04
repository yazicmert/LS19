// LS19 araç modellerini NASA 3D Resources'taki resmî Apollo modellerinden üretir (web/models/lander.glb, orb.glb, stage.glb).
//   lander.glb  İniş aracı         ← "Apollo Lunar Module" (LM)
//   orb.glb     Ay yörünge kademesi ← "Apollo Soyuz" içindeki Apollo komuta/hizmet modülünün hizmet modülü (SM: SPS motor çanı + RCS blokları); komuta modülü kesilip atılır
//   stage.glb   TLI kademesi        ← "Saturn V" içindeki S-IVB + araç aygıt birimi (IU); S-IVB motoru (J-2) modelde olmadığından aynı modelin F-1 çanı ölçeklenip konur
// Kullanım (boş bir klasörde):
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions draco3dgltf meshoptimizer sharp
//   NASA/NASA-3D-Resources deposundan ("3D Models/<ad>/<ad>.glb") raw_lm.glb, raw_apollosoyuz.glb, raw_saturnv.glb adlarıyla kopyalayın
//   node apollo_modelleri.mjs [lm|orb|stage …]   -> out/lander.glb, out/orb.glb, out/stage.glb
// Çıktılar METRE biriminde, glTF Y-yukarı (itki ekseni +Y, motor çanı −Y); başlangıç noktası araç çerçevesidir (iniş aracı: ayak tabanı y = −2,9 m).
// NASA 3D Resources içeriği telifsizdir (kamu malı); NASA logosu/amblemi kullanım kurallarına tabidir.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, weld, simplify, prune, textureCompress, quantize, flatten, join, getBounds, reorder } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.encoder': MeshoptEncoder });
fs.mkdirSync('out', { recursive: true });

const read = async (f) => {
  const doc = await io.read(f);
  doc.getRoot().listExtensionsUsed().filter((e) => e.extensionName === 'KHR_draco_mesh_compression').forEach((e) => e.dispose());
  return doc;
};
const triCount = (doc) => { let t = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const i = p.getIndices(); t += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; } return t; };
// düğüm dönüşümlerini köşelere işle ve malzeme başına tek ağda birleştir
const bake = (doc) => doc.transform(dedup(), flatten(), join(), weld());
// tüm köşelere afin dönüşüm (3x4 satır-ana: [m00 m01 m02 tx; …]); normaller dönüşümün doğrusal kısmıyla (düzgün ölçekte yalnız yön)
function applyMatrix(doc, M) {
  const A = M.slice(0, 3).map((r) => r.slice(0, 3)), det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  const sc = Math.cbrt(Math.abs(det));
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), nor = p.getAttribute('NORMAL'), v = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); pos.setElement(i, [0, 1, 2].map((r) => M[r][0] * v[0] + M[r][1] * v[1] + M[r][2] * v[2] + M[r][3])); }
    if (nor) for (let i = 0; i < nor.getCount(); i++) { nor.getElement(i, v); const n = [0, 1, 2].map((r) => (A[r][0] * v[0] + A[r][1] * v[1] + A[r][2] * v[2]) / sc), l = Math.hypot(...n) || 1; nor.setElement(i, n.map((x) => x / l)); }
    if (det < 0) { const idx = p.getIndices(); if (idx) for (let i = 0; i < idx.getCount(); i += 3) { const b = idx.getElement(i + 1), c = idx.getElement(i + 2); idx.setElement(i + 1, c); idx.setElement(i + 2, b); } }
  }
  // düğüm dönüşümleri birim kalmalı (bake sonrası)
  for (const n of doc.getRoot().listNodes()) { n.setTranslation([0, 0, 0]); n.setRotation([0, 0, 0, 1]); n.setScale([1, 1, 1]); }
}
const bounds = (doc) => getBounds(doc.getRoot().listScenes()[0]);

// ---------------------------------------------------------------- ağ kesme
// Tüm ağları eksen hizalı bir düzlemde keser (keep: 'lo' = ax koordinatı ≤ val olan taraf kalır, 'hi' = ≥ val), kesilen kenarlara uzun eksen çevresinde dairesel kapak koyar (capMat: kapak malzemesi).
// Köşe öznitelikleri (konum, normal, doku) kesişimde doğrusal ara değerlenir. Kapak: kesit noktaları eksen çevresinde 5°'lik dilimlere ayrılır, her dilimin en dış noktası alınıp eksenden üçgen yelpazesiyle doldurulur.
function sliceDoc(doc, ax, val, keep, capMat, center, meshNames = null) {
  const sg = keep === 'lo' ? -1 : 1, o = [0, 1, 2].filter((k) => k !== ax), cutPts = [];
  const ATTR = ['POSITION', 'NORMAL', 'TEXCOORD_0'];
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    if (meshNames && !meshNames.includes(mesh.getName())) continue;
    const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), n = idx ? idx.getCount() : pos.getCount();
    const have = ATTR.filter((a) => prim.getAttribute(a)), V = [];                         // V: { a: { POSITION: [...], … } }
    const vert = (i) => { const r = {}; for (const a of have) { const acc = prim.getAttribute(a), e = acc.getElement(i, []); r[a] = e; } return r; };
    const lerp = (A, B, t) => { const r = {}; for (const a of have) r[a] = A[a].map((x, k) => x + (B[a][k] - x) * t); if (r.NORMAL) { const l = Math.hypot(...r.NORMAL) || 1; r.NORMAL = r.NORMAL.map((x) => x / l); } return r; };
    const polys = [];
    for (let t = 0; t < n; t += 3) {
      const tri = [0, 1, 2].map((k) => vert(idx ? idx.getScalar(t + k) : t + k)), d = tri.map((v) => sg * (v.POSITION[ax] - val));
      if (d.every((x) => x >= 0)) { polys.push(tri); continue; }
      if (d.every((x) => x < 0)) continue;
      const out = [], cut = [];
      for (let k = 0; k < 3; k++) {
        const A = tri[k], B = tri[(k + 1) % 3], da = d[k], db = d[(k + 1) % 3];
        if (da >= 0) out.push(A);
        if ((da >= 0) !== (db >= 0)) { const P = lerp(A, B, da / (da - db)); P.POSITION[ax] = val; out.push(P); cut.push(P.POSITION); }
      }
      cutPts.push(...cut);
      for (let k = 1; k + 1 < out.length; k++) polys.push([out[0], out[k], out[k + 1]]);
    }
    // ağı yeniden kur (indekssiz)
    for (const a of have) { const acc = prim.getAttribute(a), arr = new (acc.getArray().constructor)(polys.length * 3 * acc.getElementSize()); let q = 0; for (const tri of polys) for (const v of tri) for (const x of v[a]) arr[q++] = x; acc.setArray(arr); }
    prim.setIndices(null);
  }
  // kapak
  if (capMat && cutPts.length) {
    const [cu, cw] = center, NB = 72, best = new Array(NB).fill(0), ang = (p) => { let a = Math.atan2(p[o[1]] - cw, p[o[0]] - cu); if (a < 0) a += 2 * Math.PI; return a; };
    for (const p of cutPts) { const b = Math.min(NB - 1, Math.floor(ang(p) / (2 * Math.PI) * NB)), r = Math.hypot(p[o[0]] - cu, p[o[1]] - cw); if (r > best[b]) best[b] = r; }
    // veri olmayan dilimlerin yarıçapı komşu dolu dilimlerden (dairesel) doğrusal ara değerlenir
    const filled = best.map((r, b) => { if (r > 0) return r; let l = 1, h = 1; while (best[(b - l + NB) % NB] === 0 && l < NB) l++; while (best[(b + h) % NB] === 0 && h < NB) h++; const r0 = best[(b - l + NB) % NB], r1 = best[(b + h) % NB]; return r0 + (r1 - r0) * l / (l + h); });
    const ring = filled.map((r, b) => { const a = (b + 0.5) / NB * 2 * Math.PI, q = [0, 0, 0]; q[ax] = val; q[o[0]] = cu + r * Math.cos(a); q[o[1]] = cw + r * Math.sin(a); return q; });
    const c0 = [0, 0, 0]; c0[ax] = val; c0[o[0]] = cu; c0[o[1]] = cw;
    const nrm = [0, 0, 0]; nrm[ax] = -sg;                                              // kapağın dışa bakan normali (kalan tarafın dışı)
    const P = [], N = [], T = [];
    for (let b = 0; b < NB; b++) { const A = ring[b], B = ring[(b + 1) % NB]; P.push(...c0, ...A, ...B); for (let k = 0; k < 3; k++) N.push(...nrm); T.push(0.5, 0.5, 0.5, 0.5, 0.5, 0.5); }
    addPrim(doc, P, N, T, capMat, sg, ax, o, meshNames && doc.getRoot().listMeshes().find((m) => meshNames.includes(m.getName())));
  }
}
// konum/normal/doku dizilerinden ilk ağa yeni ilkel ekle (üçgen yönü normale göre düzeltilir)
function addPrim(doc, P, N, T, material, sg, ax, o, meshArg = null) {
  const mesh = meshArg || doc.getRoot().listMeshes()[0], buf = doc.getRoot().listBuffers()[0] || doc.createBuffer();
  // üçgen sarımı: normal kesit dışına bakmalı; gerekirse yer değiştir
  for (let t = 0; t < P.length; t += 9) {
    const a = P.slice(t, t + 3), b = P.slice(t + 3, t + 6), c = P.slice(t + 6, t + 9), u = b.map((x, k) => x - a[k]), v = c.map((x, k) => x - a[k]);
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], dn = cr[0] * N[t] + cr[1] * N[t + 1] + cr[2] * N[t + 2];
    if (dn < 0) for (let k = 0; k < 3; k++) { const tmp = P[t + 3 + k]; P[t + 3 + k] = P[t + 6 + k]; P[t + 6 + k] = tmp; }
  }
  const prim = doc.createPrimitive().setMaterial(material)
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(N)).setBuffer(buf))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(T)).setBuffer(buf));
  mesh.addPrimitive(prim); return prim;
}
const mat = (doc, name, rgb, metal = 0, rough = 0.6) => doc.createMaterial(name).setBaseColorFactor([...rgb, 1]).setMetallicFactor(metal).setRoughnessFactor(rough).setDoubleSided(true);

// extras: sahne düğümüne yazılan yerleşim sayıları (metre, araç çerçevesi, +y yukarı): exitZ/exitR motor çanı çıkışı, rcsZ/rcsR iticilerin halkası, len yığında bir sonraki kademenin üst yüzüne uzaklık
async function finish(doc, name, maxTris, extras = null) {
  const t0 = triCount(doc);
  if (extras) doc.getRoot().listScenes()[0].setExtras(extras);
  if (t0 > maxTris) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: maxTris / t0, error: 0.01, lockBorder: true }));
  await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }), reorder({ encoder: MeshoptEncoder }), quantize({ quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 14 }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await io.write(`out/${name}.glb`, doc);
  const b = bounds(doc);
  console.log(name.padEnd(8), 'üçgen', Math.round(t0), '->', Math.round(triCount(doc)), ' boyut', Math.round(fs.statSync(`out/${name}.glb`).size / 1024), 'kB  sınırlar y', b.min[1].toFixed(2), '..', b.max[1].toFixed(2), ' x', b.min[0].toFixed(2), '..', b.max[0].toFixed(2), ' z', b.min[2].toFixed(2), '..', b.max[2].toFixed(2));
}

const only = process.argv.slice(2), want = (k) => !only.length || only.includes(k);

// ---------------------------------------------------------------- iniş aracı: Apollo LM
if (want('lm')) {
  const doc = await read('raw_lm.glb'); await bake(doc);
  const b = bounds(doc), S = 0.8;                         // model birimi ≈ 1,4 m; 0,8 m/birim: ayaktan tepeye 4 m (fizik iniş aracı rolü: gövde uzunluğu 4 m)
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  applyMatrix(doc, [[S, 0, 0, -S * cx], [0, S, 0, -2.9 - S * b.min[1]], [0, 0, S, -S * cz]]);       // ayak tabanı y = −2,9 m, eksen merkezde
  await finish(doc, 'lander', 60000, { exitZ: -2.65, exitR: 0.40, rcsZ: -0.26, rcsR: 1.5 });         // DPS çanı: LM birimlerinde y = 0,41 (ayaktan 0,31 birim yukarı), yarıçap 0,5 birim
}

// ---------------------------------------------------------------- Ay yörünge kademesi: Apollo hizmet modülü (SM)
if (want('orb')) {
  const doc = await read('raw_apollosoyuz.glb'); await bake(doc);
  const CAP = mat(doc, 'SM_Kapak', [0.78, 0.78, 0.76], 0.0, 0.7);
  const X_TOP = -4.0, S = 0.75, cy = 0.255, cz = -0.07;           // SM üst yüzü model x = −4,0; eksen (y, z) = (0,255, −0,07); 0,75 m/birim: gövde ≈ 3,4 m
  sliceDoc(doc, 0, X_TOP, 'lo', CAP, [cy, cz]); await doc.transform(weld());
  // gövde çerçevesi: model +x (öne) → +Y, üst yüz y = 0, motor çanı aşağıda (−Y)
  applyMatrix(doc, [[0, -S, 0, S * cy], [S, 0, 0, -S * X_TOP], [0, 0, S, -S * cz]]);
  // Soyuz/yerleştirme modülü ağları bu bölgede kalmaz; kesilen komuta modülü zaten x > −4'te
  await finish(doc, 'orb', 30000, { exitZ: -6.19, exitR: 1.09, len: 4.55, rcsZ: -1.3, rcsR: 1.95 });   // SPS çanı üst yüzün 6,19 m altında; SM gövdesi 4,4 m (altındaki kademeye 0,15 m aralıkla oturur, çan onun içine girer)
}

// ---------------------------------------------------------------- TLI kademesi: Saturn V S-IVB + araç aygıt birimi (IU)
if (want('stage')) {
  const doc = await read('raw_saturnv.glb'); await doc.transform(flatten());
  const sc = doc.getRoot().listScenes()[0], keep = ['pCylinder1', 'polySurfa1'];
  for (const n of doc.getRoot().listNodes()) { if (keep.includes(n.getName())) sc.addChild(n); else n.dispose(); }
  await doc.transform(prune());
  const CAP = mat(doc, 'SIVB_Kapak', [0.30, 0.30, 0.32], 0.2, 0.6);
  const Y_BOT = +(process.env.Y0 || 8.7), Y_TOP = +(process.env.Y1 || 10.2), CX = -0.01, CZ = 0.74, SB = +(process.env.SB || 5.0);      // S-IVB: model y 8,4 … 10,2 (IU dâhil), eksen (x, z) = (−0,01, 0,74); 5,0 m/birim: çap ≈ 4,2 m, boy ≈ 9 m
  sliceDoc(doc, 1, Y_BOT, 'hi', CAP, [CX, CZ], ['pCylinder1']);
  sliceDoc(doc, 1, Y_TOP, 'lo', CAP, [CX, CZ], ['pCylinder1']);
  await doc.transform(weld());
  // dönüşüm: gövde ağı (üst yüz y = 0) ve F-1 çanı (J-2 yerine, kademenin kıç ucuna, ölçeklenmiş)
  const L = (Y_TOP - Y_BOT) * SB, SF = 4.0;                                 // F-1: 4,0 m/birim → çan ≈ 1,8 m çap, 2,3 m yükseklik (J-2: 2,0 m)
  const f1 = doc.getRoot().listMeshes().find((m) => m.getName() === 'polySurfa1'), body = doc.getRoot().listMeshes().find((m) => m.getName() === 'pCylinder1');
  const only = (mesh) => { const d = { getRoot: () => ({ listMeshes: () => [mesh], listNodes: () => [] }) }; return d; };
  const bb = (mesh) => { const b = { min: [9e9, 9e9, 9e9], max: [-9e9, -9e9, -9e9] }, v = [0, 0, 0]; for (const p of mesh.listPrimitives()) { const pos = p.getAttribute('POSITION'); for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); for (let k = 0; k < 3; k++) { b.min[k] = Math.min(b.min[k], v[k]); b.max[k] = Math.max(b.max[k], v[k]); } } } return b; };
  const fb = bb(f1), fcx = (fb.min[0] + fb.max[0]) / 2, fcz = (fb.min[2] + fb.max[2]) / 2, fTopY = -L + 0.85;     // çanın sivri enjektör külahı kademenin içinde (kapak onu gizler), nervürlü çan kıç yüzün altında görünür
  const DARK = mat(doc, 'Motor_Cani', [0.34, 0.35, 0.38], 0.85, 0.42); for (const p of f1.listPrimitives()) p.setMaterial(DARK);          // çan koyu metal (J-2 çanı gibi)
  const mapMesh = (mesh, M) => { const d = { getRoot: () => ({ listMeshes: () => [mesh], listNodes: () => [] }) }; applyMatrix(d, M); };
  mapMesh(body, [[SB, 0, 0, -SB * CX], [0, SB, 0, -SB * Y_TOP], [0, 0, SB, -SB * CZ]]);
  mapMesh(f1, [[SF, 0, 0, -SF * fcx], [0, SF, 0, fTopY - SF * fb.max[1]], [0, 0, SF, -SF * fcz]]);
  for (const n of doc.getRoot().listNodes()) { n.setTranslation([0, 0, 0]); n.setRotation([0, 0, 0, 1]); n.setScale([1, 1, 1]); }
  await finish(doc, 'stage', 30000, { exitZ: -L - 1.46, exitR: 0.92, rcsZ: -L + 0.5, rcsR: 2.15 });
}
