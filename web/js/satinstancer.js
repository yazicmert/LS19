// Tüm uydular için 3B model: her uydu, ailesinin (satfamilies.js) modeliyle InstancedMesh olarak çizilir.
// Kameraya en yakın MAX_INST uydu model olur; geri kalanlar nokta kalır (satlayer.js'teki nokta gölgelendiricisi
// nearHide uzaklığından yakın noktaları gizler). Modeller yakında gerçek ölçekte, uzaklaştıkça ekranda ~PX piksel kalacak
// kadar büyütülür (gerçek boyut 1 pikselin çok altında kalır). Gerçek (NASA) modeli olan uydular yakınlaşınca SatModels'e bırakılır.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FAMILY_KEYS, FAMILY_DIR } from './satfamilies.js';

const MAX_INST = 1500;           // aynı anda en çok model
const MAX_DIST = 60000;          // km: bundan uzaktaki uydular yalnız nokta
const EXACT_DIST = 60, MAX_EXACT = 64;   // km / adet: bu kadar yakındaki uydular için kesin konum
const PX = 13;                   // ekranda en az görünür model boyu (piksel)

export class SatInstancer {
  constructor(scene) {
    this.scene = scene; this.fam = new Map(); this.ready = false; this.count = 0; this.hideRadius = 0; this.realNear = [];
    this.famOf = null; this.sizeKm = null;
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.55, side: THREE.DoubleSide });
    // gölgede (Dünya'nın gölgesinde) de seçilebilsin: köşe renginin %30'u öz ışıma
    this.mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = diffuseColor.rgb * 0.30;'); };
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.tmpM = new THREE.Matrix4(); this.tmpQ = new THREE.Quaternion(); this.tmpS = new THREE.Vector3(); this.tmpP = new THREE.Vector3();
    this.vx = new THREE.Vector3(); this.vy = new THREE.Vector3(); this.vz = new THREE.Vector3(); this.tmpB = new THREE.Matrix4();
    this.loadAll();
  }
  async loadAll() {
    const loader = new GLTFLoader();
    await Promise.all(FAMILY_KEYS.map(async (key) => {
      try {
        const g = await loader.loadAsync(FAMILY_DIR + key + '.glb');
        let mesh = null; g.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
        if (!mesh) return;
        const geo = mesh.geometry.clone(); geo.applyMatrix4(mesh.matrixWorld); geo.computeBoundingBox();
        const size = geo.boundingBox.getSize(new THREE.Vector3());
        const im = new THREE.InstancedMesh(geo, this.mat, MAX_INST); im.frustumCulled = false; im.count = 0; im.renderOrder = 5;
        this.group.add(im); this.fam.set(key, { im, sizeKm: Math.max(size.x, size.y, size.z) / 1000, idx: [] });
      } catch (e) { /* aile modeli yüklenemezse o aile nokta kalır */ }
    }));
    this.ready = this.fam.size > 0; this.bindFamilies();
  }
  // famKeys: uydu indeksi -> aile anahtarı dizisi
  setFamilies(famKeys) { this.famKeys = famKeys; this.bindFamilies(); }
  bindFamilies() {
    if (!this.famKeys || !this.ready) return;
    const n = this.famKeys.length, f = new Int8Array(n);
    for (let i = 0; i < n; i++) { const k = this.famKeys[i]; f[i] = this.fam.has(k) ? FAMILY_KEYS.indexOf(k) : -1; }
    this.famOf = f; this.dist = new Float32Array(n); this.order = new Uint32Array(n);
  }
  sizeOf(key) { const f = this.fam.get(key); return f ? f.sizeKm * 1000 : 0; }

  // P, V: ağ iş parçacığından gelen ICRF konum/hız (km, km/s), dt: onlardan bu yana süre (s) · mask/groups: grup görünürlüğü
  // exact(i): ana iş parçacığı SGP4 konumu (yakın uydular için: ağ iş parçacığının dönüşümüyle ~250 m fark vardır) · realIdx: Map(uydu indeksi -> { uid, key }) gerçek modeli olanlar · active(uid): gerçek model şu an çiziliyor mu
  update(P, V, dt, eye, camera, canvasH, mask, groups, mu, enabled, realIdx, active, exact) {
    this.realNear = [];
    if (!enabled || !this.ready || !this.famOf || !P || P.length / 3 !== this.famOf.length) { this.group.visible = false; this.count = 0; this.hideRadius = 0; return; }
    const n = this.famOf.length, D = this.dist, f = this.famOf, half = 0.5 * dt * dt;
    let m = 0;
    for (let i = 0; i < n; i++) {
      D[i] = Infinity;
      if (f[i] < 0 || !mask[groups[i]]) continue;
      const x0 = P[3 * i], y0 = P[3 * i + 1], z0 = P[3 * i + 2]; if (x0 !== x0) continue;
      const r = Math.hypot(x0, y0, z0), k = -mu / (r * r * r) * half;
      const dx = x0 + V[3 * i] * dt + x0 * k - eye[0], dy = y0 + V[3 * i + 1] * dt + y0 * k - eye[1], dz = z0 + V[3 * i + 2] * dt + z0 * k - eye[2];
      const d = Math.hypot(dx, dy, dz); if (d > MAX_DIST) continue;
      D[i] = d; this.order[m++] = i;
    }
    // en yakın MAX_INST: fazlaysa uzaklığa göre sırala
    let ord = this.order.subarray(0, m);
    if (m > MAX_INST) {                                                     // anahtar = uzaklık(m) · 131072 + indeks -> karşılaştırıcısız yerel sıralama
      const keys = this.keys && this.keys.length >= m ? this.keys.subarray(0, m) : (this.keys = new Float64Array(this.order.length)).subarray(0, m);
      for (let j = 0; j < m; j++) keys[j] = Math.floor(D[ord[j]] * 1000) * 131072 + ord[j];
      keys.sort(); ord = new Uint32Array(MAX_INST); for (let j = 0; j < MAX_INST; j++) ord[j] = keys[j] % 131072;
    }
    const theta = PX * 2 * Math.tan(camera.fov * Math.PI / 360) / canvasH;
    for (const f2 of this.fam.values()) f2.n = 0;
    let far = 0, total = 0, nExact = 0;
    for (const i of ord) {
      const key = FAMILY_KEYS[f[i]], fam = this.fam.get(key), re = realIdx && realIdx.get(i); let d = D[i];
      if (re) {                                                             // gerçek modeli olan: yakında SatModels çizer
        if (d < re.show * 1.3) this.realNear.push(re.entry);
        if (active && active(re.entry.uid)) continue;
      }
      if (fam.n >= MAX_INST) continue;
      const x0 = P[3 * i], y0 = P[3 * i + 1], z0 = P[3 * i + 2], r = Math.hypot(x0, y0, z0), k = -mu / (r * r * r) * half;
      let px = x0 + V[3 * i] * dt + x0 * k, py = y0 + V[3 * i + 1] * dt + y0 * k, pz = z0 + V[3 * i + 2] * dt + z0 * k;
      if (exact && d < EXACT_DIST && nExact < MAX_EXACT) {
        const q = exact(i); if (q) { px = q[0]; py = q[1]; pz = q[2]; d = Math.hypot(px - eye[0], py - eye[1], pz - eye[2]); nExact++; }
      }
      const vx = V[3 * i] + (-mu / (r * r * r)) * x0 * dt, vy = V[3 * i + 1] + (-mu / (r * r * r)) * y0 * dt, vz = V[3 * i + 2] + (-mu / (r * r * r)) * z0 * dt;
      // yönelim: Y = başucu, Z = hız yönü, X = yörünge normali (satmodels.js ile aynı)
      const up = this.vy.set(px, py, pz).normalize();
      const vel = this.vz.set(vx, vy, vz); vel.addScaledVector(up, -vel.dot(up)).normalize();
      const xa = this.vx.crossVectors(up, vel);
      this.tmpB.makeBasis(xa, up, vel); this.tmpQ.setFromRotationMatrix(this.tmpB);
      const s = Math.max(1, d * theta / fam.sizeKm);                          // gerçek ölçek x büyütme (m -> km: 0,001)
      this.tmpS.setScalar(0.001 * s); this.tmpP.set(px - eye[0], py - eye[1], pz - eye[2]);
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      fam.im.setMatrixAt(fam.n++, this.tmpM); total++; far = Math.max(far, d);
    }
    for (const f2 of this.fam.values()) { f2.im.count = f2.n; f2.im.instanceMatrix.needsUpdate = true; f2.im.visible = f2.n > 0; }
    this.count = total; this.group.visible = total > 0;
    // MAX_INST dolduysa en uzak modelin ötesi nokta kalır; dolmadıysa MAX_DIST'e kadar her şey model
    this.hideRadius = ord.length >= MAX_INST ? far : MAX_DIST;
  }
}
