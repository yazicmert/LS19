// Statik model ağlarını malzemeye göre birleştirir: Maya'dan gelen NASA modellerinde yüzlerce küçük ağ vardır (iniş aracı: 158 ağ, 13 malzeme);
// her ağ ayrı çizim çağrısıdır (üstelik gölge geçişinde ikinci kez). Aynı malzemeli ağlar tek geometride birleşince çizim çağrısı malzeme sayısına iner,
// görüntü değişmez (dönüşümler köşelere işlenir). Gövde/kaplama/hareketli parça içermeyen statik modeller içindir.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Köşe öznitelikleri Float32'ye açılır (kaynağa dokunmadan yeni geometri). glTF/meshopt nicelemesi (Int16/Int8 normalized, ara dizili) gerçek ölçeği
// düğüm matrisine yazar; nicelemeli öznitelikte matris uygulamak değerleri [−1, 1]'e kırpıp modeli ezer. getX… normalized değeri zaten [−1, 1]'e açar.
export function floatGeometry(src) {
  const g = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const a = src.attributes[name], n = a.count, s = a.itemSize, f = new Float32Array(n * s), get = [a.getX, a.getY, a.getZ, a.getW];
    for (let i = 0; i < n; i++) for (let j = 0; j < s; j++) f[i * s + j] = get[j].call(a, i);
    g.setAttribute(name, new THREE.BufferAttribute(f, s));
  }
  if (src.index) g.setIndex(new THREE.BufferAttribute(src.index.array.slice(), 1));
  return g;
}

// root: THREE.Object3D; döner: { before, after } ağ sayıları. Birleştirilemeyen grup (öznitelik uyumsuzluğu) olduğu gibi bırakılır.
export function mergeByMaterial(root) {
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), groups = new Map(); let before = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    before++; const g = groups.get(o.material); if (g) g.push(o); else groups.set(o.material, [o]);
  });
  let after = before;
  for (const [mat, meshes] of groups) {
    if (meshes.length < 2) continue;
    // her ağın kök-göreli dönüşümü köşelere işlenir; yansıtmalı (det < 0) dönüşümde üçgen sırası çevrilir (yoksa yüzler içe bakar)
    let ok = true;
    const parts = meshes.map((m) => {
      const g = floatGeometry(m.geometry), M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld); g.applyMatrix4(M);
      if (M.determinant() < 0) {
        if (!g.index) { ok = false; return g; }
        const ix = g.index.array; for (let i = 0; i + 2 < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
      }
      return g;
    });
    let merged = null; if (ok) { try { merged = mergeGeometries(parts, false); } catch (e) { merged = null; } }
    for (const g of parts) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat); mesh.name = 'birlesik'; mesh.castShadow = meshes[0].castShadow; mesh.receiveShadow = meshes[0].receiveShadow;
    for (const m of meshes) { m.parent.remove(m); m.geometry.dispose(); }
    root.add(mesh); after -= meshes.length - 1;
  }
  return { before, after };
}
