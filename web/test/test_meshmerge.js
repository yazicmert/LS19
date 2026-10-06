// Model ağlarının malzemeye göre birleştirilmesi (meshmerge.js) doğrulaması (Node 20+): cd web && node test/test_meshmerge.js
//  Birleştirme çizim çağrılarını azaltır ama görüntüyü DEĞİŞTİRMEMELİ. Önceki hata: glTF/meshopt nicelemesi (Int16/Int8 normalized, ara dizili) gerçek ölçeği düğüm matrisine yazar;
//  nicelemeli öznitelikte matris uygulamak değerleri [−1, 1]'e kırpıp modeli eziyordu. Bu test birleştirme öncesi/sonrası dünya uzayı büyüklüklerini karşılaştırır:
//  1) yapay sahne: nicelemeli ara dizili Int16 konum / Int8 normal, ölçekli+döndürülmüş+yansıtmalı (det < 0) düğümler
//  2) gerçek modeller (web/models/*.glb, GLTFLoader + meshopt): iniş aracı, TLI kademesi, hizmet modülü
//  büyüklükler (malzeme başına): üçgen sayısı, alan, işaretli hacim (sarım yönü!), ağırlık merkezi, ikinci moment, normal–yüz uyumu, sınır kutusu
import fs from 'fs';
import { register } from 'node:module';
register('./importmap_loader.mjs', import.meta.url);
const THREE = await import('three');
const { mergeByMaterial, floatGeometry } = await import('../js/meshmerge.js');

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };

// ---- ölçüm: kökten aşağıdaki tüm ağlar, dünya uzayında; yansıtmalı düğümde ekranda görünen sarım ters (three frontFaceCW) → etkin sarım için sıra çevrilir
function stats(root) {
  root.updateWorldMatrix(true, true);
  const out = new Map(), P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], N = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3(), an = new THREE.Vector3(), nm = new THREE.Matrix3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const key = o.material.name || o.material.uuid;
    const s = out.get(key) || { tri: 0, area: 0, vol: 0, cx: [0, 0, 0], m2: 0, aligned: 0, anti: 0, lo: [1e30, 1e30, 1e30], hi: [-1e30, -1e30, -1e30] }; out.set(key, s);
    const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, ix = g.index, M = o.matrixWorld, flip = M.determinant() < 0;
    nm.getNormalMatrix(M);
    const nt = (ix ? ix.count : pos.count) / 3;
    for (let t = 0; t < nt; t++) {
      for (let k = 0; k < 3; k++) {
        const v = ix ? ix.getX(t * 3 + k) : t * 3 + k;
        P[k].set(pos.getX(v), pos.getY(v), pos.getZ(v)).applyMatrix4(M);
        N[k].set(nor.getX(v), nor.getY(v), nor.getZ(v)).applyMatrix3(nm).normalize();
      }
      const [a, b, c] = flip ? [P[0], P[2], P[1]] : [P[0], P[1], P[2]];
      e1.subVectors(b, a); e2.subVectors(c, a); fn.crossVectors(e1, e2);
      const area = 0.5 * fn.length(); s.tri++; s.area += area;
      s.vol += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
      for (let k = 0; k < 3; k++) { for (let j = 0; j < 3; j++) { const x = P[k].getComponent(j); s.cx[j] += x * area / 3; s.m2 += x * x * area / 3; s.lo[j] = Math.min(s.lo[j], x); s.hi[j] = Math.max(s.hi[j], x); } }
      an.copy(N[0]).add(N[1]).add(N[2]);                                           // yüz normali (sarımdan) köşe normalleriyle aynı yönde mi? (sınırdaki üçgenler sayılmaz: kayan nokta kararsızlığı)
      const cs = fn.dot(an) / (fn.length() * an.length() + 1e-30), sliver = fn.length() < 1e-3 * e1.length() * e2.length();       // neredeyse doğrusal (dejenere) üçgenin yüz normali kararsız
      if (!sliver) { if (cs > 0.05) s.aligned++; else if (cs < -0.05) s.anti++; }
    }
  });
  return out;
}
const close = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
function compare(before, after, label) {
  const bad = [];
  if (before.size !== after.size) bad.push(`malzeme sayısı ${before.size} ≠ ${after.size}`);
  for (const [k, a] of before) {
    const b = after.get(k); if (!b) { bad.push(`${k}: yok`); continue; }
    if (a.tri !== b.tri) bad.push(`${k}: üçgen ${a.tri} ≠ ${b.tri}`);
    if (!close(a.area, b.area, 1e-5)) bad.push(`${k}: alan ${a.area} ≠ ${b.area}`);
    if (!close(a.vol, b.vol, 1e-4)) bad.push(`${k}: hacim ${a.vol} ≠ ${b.vol}`);
    if (!close(a.m2, b.m2, 1e-5)) bad.push(`${k}: ikinci moment ${a.m2} ≠ ${b.m2}`);
    if (a.aligned !== b.aligned || a.anti !== b.anti) bad.push(`${k}: normal–yüz uyumu ${a.aligned}/${a.anti} ≠ ${b.aligned}/${b.anti}`);
    for (let j = 0; j < 3; j++) {
      if (!close(a.cx[j], b.cx[j], 1e-5)) bad.push(`${k}: ağırlık merkezi[${j}] ${a.cx[j]} ≠ ${b.cx[j]}`);
      if (!close(a.lo[j], b.lo[j], 1e-5) || !close(a.hi[j], b.hi[j], 1e-5)) bad.push(`${k}: sınır[${j}] ${a.lo[j]}..${a.hi[j]} ≠ ${b.lo[j]}..${b.hi[j]}`);
    }
  }
  check(label, bad.length === 0, bad.slice(0, 3).join('; '));
}
const meshCount = (root) => { let n = 0; root.traverse((o) => { if (o.isMesh) n++; }); return n; };

// ---------------------------------------------------------------- 1) yapay sahne
{
  // nicelemeli ara dizili öznitelikler (glTF yükleyicisinin ürettiği biçim): Int16 normalized konum (3 bileşen + 1 dolgu), Int8 normalized normal
  const quantBox = (hx, hy, hz) => {
    // 8 köşe (kare prizma), her yüz için ayrı köşe yok: basit küp (24 köşe, 12 üçgen); konumlar [−1, 1] aralığında nicelenir, gerçek ölçek düğüm matrisinde
    const faces = [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]], P = [], Nn = [], I = [];
    for (const f of faces) {
      const u = f[0] ? [0, 1, 0] : [1, 0, 0], w = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]], base = P.length / 3;
      for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { for (let j = 0; j < 3; j++) P.push(f[j] + u[j] * s + w[j] * t); Nn.push(...f); }
      I.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const n = P.length / 3, pos = new Int16Array(n * 4), nor = new Int8Array(n * 4);
    for (let i = 0; i < n; i++) { for (let j = 0; j < 3; j++) { pos[i * 4 + j] = Math.round(Math.max(-1, Math.min(1, P[i * 3 + j] / 2)) * 32767); nor[i * 4 + j] = Math.round(Nn[i * 3 + j] * 127); } }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(pos, 4), 3, 0, true));
    g.setAttribute('normal', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(nor, 4), 3, 0, true));
    g.setIndex(I); return g;
  };
  const root = new THREE.Group(), inner = new THREE.Group(), scene3 = new THREE.Group();
  inner.rotation.x = Math.PI / 2; root.scale.setScalar(1e-3); root.add(inner); inner.add(scene3);               // prepModel ile aynı sarmalayıcılar
  const matA = new THREE.MeshStandardMaterial({ name: 'A' }), matB = new THREE.MeshStandardMaterial({ name: 'B' });
  const place = (mat, p, s, rot) => { const m = new THREE.Mesh(quantBox(), mat); m.position.set(...p); m.scale.set(...s); m.rotation.set(...rot); scene3.add(m); return m; };
  place(matA, [3, 0, 0], [2.5, 1.2, 0.7], [0, 0, 0]);                   // nicelemenin gerçek ölçeği düğüm matrisinde: büyük ölçek
  place(matA, [-4, 1, 2], [1, 3, 0.5], [0.3, 0.9, -0.4]);              // döndürülmüş
  place(matA, [0, -5, 1], [-1.5, 1, 2], [0, 0.2, 0]);                  // yansıtmalı (det < 0)
  place(matB, [1, 2, 3], [0.8, 0.8, 0.8], [0.1, 0.2, 0.3]);
  place(matB, [-2, -2, -2], [1, 1, -1], [0, 0, 0.7]);                  // yansıtmalı
  const holder = new THREE.Group(); holder.add(root); holder.rotation.y = 0.4; holder.updateMatrixWorld(true);
  const before = stats(root), n0 = meshCount(root);
  const info = mergeByMaterial(scene3), after = stats(root);
  check('yapay: ağ sayısı malzeme sayısına iner (5 → 2)', n0 === 5 && meshCount(root) === 2 && info.before === 5 && info.after === 2, `${n0} → ${meshCount(root)} (${info.before} → ${info.after})`);
  compare(before, after, 'yapay: nicelemeli + ölçekli + döndürülmüş + yansıtmalı düğümlerde dünya uzayı büyüklükleri (alan, hacim, sarım, normaller, sınır) değişmez');
  let allFloat = true; root.traverse((o) => { if (o.isMesh) for (const a of Object.values(o.geometry.attributes)) if (!(a.array instanceof Float32Array) || a.normalized || a.isInterleavedBufferAttribute) allFloat = false; });
  check('yapay: birleşik geometri öznitelikleri düz Float32 (nicelemesiz, ara dizisiz)', allFloat);
  // floatGeometry kaynağı değiştirmez ve nicelemeyi [−1, 1] olarak açar
  const src = quantBox(), fg = floatGeometry(src), ps = src.attributes.position;
  check('floatGeometry: kaynak Int16 kalır; kopya Float32 ve getX ile aynı değer', src.attributes.position.isInterleavedBufferAttribute && fg.attributes.position.array instanceof Float32Array && Math.abs(fg.attributes.position.getX(5) - ps.getX(5)) < 1e-7);
}

// ---------------------------------------------------------------- 2) gerçek modeller
{
  // GLTFLoader gömülü WebP dokuları için <img> ister (DOM yok): çözmeden hemen yüklendi sayan yapay bir <img>; geometri sınaması dokudan bağımsız
  globalThis.self = globalThis;                                                                                       // GLTFLoader self.URL kullanır
  globalThis.Image = class { constructor() { this.height = 1; } set src(v) { queueMicrotask(() => this.onload && this.onload()); } };           // WebP destek sınaması
  globalThis.document = { createElementNS: () => { const l = {}, im = { width: 1, height: 1, naturalWidth: 1, naturalHeight: 1, addEventListener(t, f) { l[t] = f; }, removeEventListener() {}, set src(v) { queueMicrotask(() => l.load && l.load.call(im, {})); } }; return im; } };
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
  const load = (name) => new Promise((res, rej) => {
    const b = fs.readFileSync(new URL(`../models/${name}.glb`, import.meta.url)), gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
    gl.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', (g) => res(g.scene), rej);
  });
  for (const [name, minDrop] of [['lander', 100], ['stage', 2], ['orb', 0]]) {
    let scene3 = null, err = '';
    try { scene3 = await load(name); } catch (e) { err = String(e && e.message || e); }
    if (!scene3) { check(`${name}.glb Node'da çözülebilir`, false, err); continue; }
    // sahne, prepModel'deki gibi sarılır (ölçek 1e-3, X ekseninde 90°)
    const g = new THREE.Group(), inner = new THREE.Group(); inner.rotation.x = Math.PI / 2; inner.add(scene3); g.add(inner); g.scale.setScalar(1e-3); g.updateMatrixWorld(true);
    let quant = 0; scene3.traverse((o) => { if (o.isMesh && o.geometry.attributes.position.normalized) quant++; });
    const before = stats(g), n0 = meshCount(scene3), info = mergeByMaterial(scene3), after = stats(g), n1 = meshCount(scene3);
    check(`${name}: ${quant}/${n0} ağın konumu nicelemeli; birleştirme ${n0} → ${n1} ağ (≥ ${minDrop} azalma)`, info.before === n0 && info.after === n1 && n0 - n1 >= minDrop, `${info.before} → ${info.after}`);
    compare(before, after, `${name}: birleştirme sonrası dünya uzayı büyüklükleri (alan, hacim, sarım, normaller, sınır kutusu) birebir`);
  }
}

console.log(fail ? `\n${fail} HATA` : '\nTüm denetimler geçti');
process.exit(fail ? 1 : 0);
