// Tüm uydular için 3B model: her uydu, ailesinin (satfamilies.js) modeliyle InstancedMesh olarak çizilir.
// Ekranda görünen (görüş alanında, Dünya'nın arkasında değil) ve kameraya en yakın MAX_INST uydu model olur; geri kalanlar nokta kalır
// (satlayer.js'teki nokta gölgelendiricisi nearHide uzaklığından yakın noktaları gizler; görünmeyenlerin noktası zaten ekranda değil).
// Modeller yakında gerçek ölçekte, uzaklaştıkça ekranda ~PX piksel kalacak kadar büyütülür (gerçek boyut 1 pikselin çok altında kalır).
// PX'e büyütülen (gerçek boyutu PX pikselden küçük) uydular ailenin uzak sürümüyle (farGeometry: aileye göre 2,5–6 kat az üçgen) çizilir:
// 13 piksellik bir uyduda kaburga şeritleri ve 12 dilimli silindirler seçilmez (kaburgalar piksel altında kalır, panele renk olarak karışır). Gerçek (NASA) modeli olan uydular yakınlaşınca SatModels'e bırakılır.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FAMILY_KEYS, FAMILY_DIR } from './satfamilies.js';

const MAX_INST = 1500;           // aynı anda en çok model
const MAX_DIST = 60000;          // km: bundan uzaktaki uydular yalnız nokta
const EXACT_DIST = 60, MAX_EXACT = 64;   // km / adet: bu kadar yakındaki uydular için kesin konum
const PX = 13;                   // ekranda en az görünür model boyu (piksel)
const LOD_Q = 1;                 // gerçek boyutu ekranda PX pikselden küçük kalan (PX'e büyütülen) uydu uzak sürümle çizilir
const R_OCC = 6340;              // km: Dünya'nın örttüğü küre (ekvator yarıçapından küçük: ufkun hemen ardındaki uydu yine model alır, zararsız)

// Ailenin uzak sürümü: model kutu (12 üçgen), silindir/çanak ve ince şeritlerden oluşur (tools/uydu_aileleri.py). Bağlı parçalar ayrılır:
// her boyutu modelin %4'ünden küçük parça (küçük kutu, kısa çubuk) atılır; ince uzun kutu (panel kaburgası) oturduğu panelin yüzüne
// renk olarak karışır; öteki ≤12 üçgenlik parça olduğu gibi kalır,
// daha çok üçgenli parça (silindir, çanak) kendi eksen hizalı kutusuyla (ortalama rengiyle) değişir. Çıktı indekssiz; öznitelikler kaynakla
// aynı (konum, normal, renk; renk öğe boyu korunur: iki sürüm aynı gölgelendirici programını paylaşır). Üçgenler %40'tan az azalacaksa kaynak döner.
export function farGeometry(geo) {
  const P = geo.attributes.position, C = geo.attributes.color, nv = P.count;
  const I = geo.index ? geo.index.array : Array.from({ length: nv }, (_, i) => i);
  const par = new Int32Array(nv).map((_, i) => i), find = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  const at = new Map();
  for (let i = 0; i < nv; i++) { const k = `${P.getX(i).toFixed(4)},${P.getY(i).toFixed(4)},${P.getZ(i).toFixed(4)}`; if (at.has(k)) uni(i, at.get(k)); else at.set(k, i); }
  for (let t = 0; t < I.length; t += 3) { uni(I[t], I[t + 1]); uni(I[t], I[t + 2]); }
  const comps = new Map(), mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < I.length; t += 3) {
    const r = find(I[t]); let c = comps.get(r);
    if (!c) comps.set(r, c = { tris: [], mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity], col: [0, 0, 0, 0], n: 0 });
    c.tris.push(t);
    for (let k = 0; k < 3; k++) {
      const v = I[t + k], p = [P.getX(v), P.getY(v), P.getZ(v)];
      for (let a = 0; a < 3; a++) { c.mn[a] = Math.min(c.mn[a], p[a]); c.mx[a] = Math.max(c.mx[a], p[a]); mn[a] = Math.min(mn[a], p[a]); mx[a] = Math.max(mx[a], p[a]); }
      if (C) { c.col[0] += C.getX(v); c.col[1] += C.getY(v); c.col[2] += C.getZ(v); c.col[3] += C.itemSize > 3 ? C.getW(v) : 1; }
      c.n++;
    }
  }
  const S = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]), cs = C ? C.itemSize : 0;
  const pos = [], nrm = [], col = [], N = geo.attributes.normal;
  const vert = (p, n, c) => { pos.push(p[0], p[1], p[2]); nrm.push(n[0], n[1], n[2]); if (cs) col.push(...c.slice(0, cs)); };
  const FACES = [[[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1], [-1, 0, 0]], [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0], [1, 0, 0]],
    [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0], [0, -1, 0]], [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1], [0, 1, 0]],
    [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, -1]], [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1], [0, 0, 1]]];
  const V3 = (v) => new THREE.Vector3().fromBufferAttribute(P, v);
  const tri = (t) => { const a = V3(I[t]), n = V3(I[t + 1]).sub(a).cross(V3(I[t + 2]).sub(a)), ar = n.length() / 2; return { a, n: n.normalize(), ar }; };
  const list = [...comps.values()];
  for (const c of list) {
    c.d = [0, 1, 2].map((a) => c.mx[a] - c.mn[a]).sort((x, y) => y - x);
    c.ctr = new THREE.Vector3((c.mn[0] + c.mx[0]) / 2, (c.mn[1] + c.mx[1]) / 2, (c.mn[2] + c.mx[2]) / 2);
    c.kind = c.d[0] < 0.04 * S ? 'small' : c.d[1] < 0.04 * S ? 'thin' : c.tris.length <= 12 ? 'box' : 'solid';
  }
  // ince uzun kutu (panel kaburgası): oturduğu kutunun (panelin) en yakın yüzüne rengi alan oranında karışır. Açık renkli kaburgalar
  // uzaktan panele çizgili, açık bir ton verir: atılsalar panel koyulaşır, ayrı çizilseler üçgen kazancı yarıya iner.
  const e = 0.02 * S, bake = new Map();                                                     // üçgen → { col: alan ağırlıklı renk toplamı, ar }
  for (const c of list) {
    if (c.kind !== 'thin') continue;
    let host = null;
    for (const h of list) {
      if (h.kind !== 'box' || [0, 1, 2].some((a) => c.ctr.getComponent(a) < h.mn[a] - e || c.ctr.getComponent(a) > h.mx[a] + e)) continue;
      if (!host || h.d[0] < host.d[0]) host = h;
    }
    if (!host) { if (c.tris.length === 12) { c.kind = 'box'; } continue; }                // dayanaksız ince kutu: olduğu gibi kalır
    const near = host.tris.map((t) => { const T = tri(t), dd = c.ctr.clone().sub(T.a).dot(T.n); return [dd < -e ? Infinity : Math.abs(dd), t]; }).sort((x, y) => x[0] - y[0]);
    const face = [near[0][1], near[1][1]], far = face.reduce((sum, t) => sum + tri(t).ar, 0), ar = c.d[0] * c.d[1];
    const avg = c.col.map((x) => x / c.n);
    for (const t of face) { const B = bake.get(t) || { col: [0, 0, 0, 0], ar: 0, face: far }; for (let k = 0; k < 4; k++) B.col[k] += avg[k] * ar; B.ar += ar; bake.set(t, B); }
  }
  for (const c of list) {
    if (c.kind === 'small' || c.kind === 'thin') continue;                                  // küçük parça uzaktan görünmez; kaburga panele karıştı
    if (c.kind === 'box') {                                                                // kutu: olduğu gibi (döndürülmüş paneller yönünü korur)
      for (const t of c.tris) {
        const B = bake.get(t), f = B ? Math.min(1, B.ar / B.face) : 0;
        for (let k = 0; k < 3; k++) {
          const v = I[t + k], own = C ? [C.getX(v), C.getY(v), C.getZ(v), cs > 3 ? C.getW(v) : 1] : null;
          vert([P.getX(v), P.getY(v), P.getZ(v)], N ? [N.getX(v), N.getY(v), N.getZ(v)] : [0, 1, 0], own && B ? own.map((x, j) => x * (1 - f) + B.col[j] / B.ar * f) : own);
        }
      }
      continue;
    }
    const avg = c.col.map((x) => x / c.n), q = (u) => [0, 1, 2].map((a) => (u[a] ? c.mx[a] : c.mn[a]));
    for (const [a, b, e2, f, n] of FACES) for (const u of [a, b, e2, a, e2, f]) vert(q(u), n, avg);   // silindir/çanak → kutu (dış yüzler)
  }
  if (!pos.length || pos.length / 9 > 0.6 * I.length / 3) return geo;                   // kazanç azsa (cubesat: 6 kutu) asıl model kalır
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  if (cs) g.setAttribute('color', new THREE.Float32BufferAttribute(col, cs));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

export class SatInstancer {
  constructor(scene) {
    this.scene = scene; this.fam = new Map(); this.ready = false; this.count = 0; this.hideRadius = 0; this.realNear = [];
    this.famOf = null; this.sizeKm = null;
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.55, side: THREE.DoubleSide });
    // gölgede (Dünya'nın gölgesinde) de seçilebilsin: köşe renginin %30'u öz ışıma
    this.mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = diffuseColor.rgb * 0.30;'); };
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.frustum = new THREE.Frustum(); this.tmpV = new THREE.Matrix4();
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
        const mk = (g) => { const im = new THREE.InstancedMesh(g, this.mat, MAX_INST); im.frustumCulled = false; im.count = 0; im.renderOrder = 5; this.group.add(im); return im; };
        this.fam.set(key, { im: mk(geo), lo: mk(farGeometry(geo)), sizeKm: Math.max(size.x, size.y, size.z) / 1000, idx: [] });
      } catch (e) { /* aile modeli yüklenemezse o aile nokta kalır */ }
    }));
    this.ready = this.fam.size > 0; this.bindFamilies();
    if (this.ready && this.onReady) this.onReady();                                  // app.js: programlar ilk çizimden önce derlensin (World.warm)
  }
  // famKeys: uydu indeksi -> aile anahtarı dizisi
  setFamilies(famKeys) { this.famKeys = famKeys; this.bindFamilies(); }
  bindFamilies() {
    if (!this.famKeys || !this.ready) return;
    const n = this.famKeys.length, f = new Int8Array(n);
    for (let i = 0; i < n; i++) { const k = this.famKeys[i]; f[i] = this.fam.has(k) ? FAMILY_KEYS.indexOf(k) : -1; }
    this.famOf = f; this.dist = new Float32Array(n); this.order = new Uint32Array(n);
    this.sizeKmOf = new Float64Array(FAMILY_KEYS.length); for (const [k, fm] of this.fam) this.sizeKmOf[FAMILY_KEYS.indexOf(k)] = fm.sizeKm;
  }
  sizeOf(key) { const f = this.fam.get(key); return f ? f.sizeKm * 1000 : 0; }

  // P, V: ağ iş parçacığından gelen ICRF konum/hız (km, km/s), dt: onlardan bu yana süre (s) · mask/groups: grup görünürlüğü
  // exact(i): ana iş parçacığı SGP4 konumu (yakın uydular için: ağ iş parçacığının dönüşümüyle ~250 m fark vardır) · realIdx: Map(uydu indeksi -> { uid, key }) gerçek modeli olanlar · active(uid): gerçek model şu an çiziliyor mu
  update(P, V, dt, eye, camera, canvasH, mask, groups, mu, enabled, realIdx, active, exact) {
    this.realNear = [];
    if (!enabled || !this.ready || !this.famOf || !P || P.length / 3 !== this.famOf.length) { this.group.visible = false; this.count = 0; this.hideRadius = 0; return; }
    const n = this.famOf.length, D = this.dist, f = this.famOf, half = 0.5 * dt * dt;
    const theta = PX * 2 * Math.tan(camera.fov * Math.PI / 360) / canvasH;   // PX pikselin açısı (rad)
    // görüş alanı (sahne kameraya göre çizilir: kamera orijinde, konumlar eye'a göre) ve Dünya'nın örtmesi: görünmeyen uyduya model verilmez
    const pl = this.frustum.setFromProjectionMatrix(this.tmpV.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)).planes;
    const ex = -eye[0], ey = -eye[1], ez = -eye[2], R2 = R_OCC * R_OCC;
    let m = 0;
    for (let i = 0; i < n; i++) {
      D[i] = Infinity;
      if (f[i] < 0 || !mask[groups[i]]) continue;
      const x0 = P[3 * i], y0 = P[3 * i + 1], z0 = P[3 * i + 2]; if (x0 !== x0) continue;
      const r = Math.hypot(x0, y0, z0), k = -mu / (r * r * r) * half;
      const dx = x0 + V[3 * i] * dt + x0 * k - eye[0], dy = y0 + V[3 * i + 1] * dt + y0 * k - eye[1], dz = z0 + V[3 * i + 2] * dt + z0 * k - eye[2];
      const d = Math.hypot(dx, dy, dz); if (d > MAX_DIST) continue;
      if (!seen(pl, dx, dy, dz, d * theta + 2 * this.sizeKmOf[f[i]], ex, ey, ez, R2)) {      // pay: ekrandaki model boyu (büyütülmüş ya da gerçek)
        const re = realIdx && realIdx.get(i); if (re && d < re.show * 1.3) this.realNear.push(re.entry);   // gerçek model ekran dışında da önceden yüklensin
        continue;
      }
      D[i] = d; this.order[m++] = i;
    }
    // en yakın MAX_INST: fazlaysa uzaklığa göre sırala
    let ord = this.order.subarray(0, m);
    if (m > MAX_INST) {                                                     // anahtar = uzaklık(m) · 131072 + indeks -> karşılaştırıcısız yerel sıralama
      const keys = this.keys && this.keys.length >= m ? this.keys.subarray(0, m) : (this.keys = new Float64Array(this.order.length)).subarray(0, m);
      for (let j = 0; j < m; j++) keys[j] = Math.floor(D[ord[j]] * 1000) * 131072 + ord[j];
      keys.sort(); ord = new Uint32Array(MAX_INST); for (let j = 0; j < MAX_INST; j++) ord[j] = keys[j] % 131072;
    }
    for (const f2 of this.fam.values()) f2.n = f2.nLo = 0;
    let far = 0, total = 0, nExact = 0;
    for (const i of ord) {
      const key = FAMILY_KEYS[f[i]], fam = this.fam.get(key), re = realIdx && realIdx.get(i); let d = D[i];
      if (re) {                                                             // gerçek modeli olan: yakında SatModels çizer
        if (d < re.show * 1.3) this.realNear.push(re.entry);
        if (active && active(re.entry.uid)) continue;
      }
      if (fam.n + fam.nLo >= MAX_INST) continue;
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
      const qs = d * theta / fam.sizeKm, s = Math.max(1, qs);                   // gerçek ölçek x büyütme (m -> km: 0,001)
      this.tmpS.setScalar(0.001 * s); this.tmpP.set(px - eye[0], py - eye[1], pz - eye[2]);
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      if (qs > LOD_Q) fam.lo.setMatrixAt(fam.nLo++, this.tmpM); else fam.im.setMatrixAt(fam.n++, this.tmpM);
      total++; far = Math.max(far, d);
    }
    for (const f2 of this.fam.values()) for (const [im, c] of [[f2.im, f2.n], [f2.lo, f2.nLo]]) { im.count = c; im.visible = c > 0; if (c) im.instanceMatrix.needsUpdate = true; }
    this.count = total; this.group.visible = total > 0;
    // MAX_INST dolduysa en uzak modelin ötesi nokta kalır; dolmadıysa MAX_DIST'e kadar her şey model
    this.hideRadius = ord.length >= MAX_INST ? far : MAX_DIST;
  }
}

// Uydu ekranda görünebilir mi: (x, y, z) kameraya göre konum (km), rad: model yarıçapı payı (km), pl: görüş alanı düzlemleri,
// (ex, ey, ez): Dünya merkezinin kameraya göre konumu, R2: örten kürenin yarıçapının karesi. Göz → uydu doğru parçası küreyi keserse uydu Dünya'nın arkasında.
export function seen(pl, x, y, z, rad, ex, ey, ez, R2) {
  for (let j = 0; j < 6; j++) { const p = pl[j], nn = p.normal; if (nn.x * x + nn.y * y + nn.z * z + p.constant < -rad) return false; }
  const qq = x * x + y * y + z * z, tc = (ex * x + ey * y + ez * z) / qq;
  if (tc > 0 && tc < 1) { const cx = ex - tc * x, cy = ey - tc * y, cz = ez - tc * z; if (cx * cx + cy * cy + cz * cz < R2) return false; }
  return true;
}
