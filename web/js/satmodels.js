// Gerçek 3B uydu modelleri (NASA 3D Resources, kamu malı — github.com/nasa/NASA-3D-Resources).
// Binlerce uydunun hepsi nokta olarak çizilir; model yalnız kamera o uyduya yaklaştığında (uydunun boyuna göre birkaç km)
// yüklenir ve çizilir, aynı anda en fazla MAX_ON tane. Dosyalar meshopt ile sıkıştırıldı (tools: gltf-transform), dokular WebP.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

import { MODELS, modelFor, showDist, MOON_MODELS } from './satcatalog.js';
export { MODELS, modelFor, showDist, MOON_MODELS };

const MAX_ON = 3, KEEP = 8;

export class SatModels {
  // posFn(entry, t) -> ICRF konum (km) · entries: [{ uid, key, name }] (model eşleşen uydular)
  constructor(scene) {
    this.scene = scene; this.entries = []; this.cache = new Map(); this.on = new Map(); this.lastScan = 0; this.onLoad = null; this.nearest = [];
    this.loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    // kamera yönünden yumuşak dolgu ışığı: Güneş'in görmediği yüzler (ve Dünya'nın gölgesindeki uydular) kapkara kalmasın.
    // Yalnız model çizilirken açık; gölgedeyken daha güçlü (kartta ve bildirimde "gölgede" yazar).
    this.fill = new THREE.DirectionalLight(0xbfd0ff, 0); scene.add(this.fill); scene.add(this.fill.target);
  }
  setEntries(list) { this.entries = list; }
  isReady(uid) { const o = this.on.get(uid); return !!(o && o.obj); }
  // model şablonu: bir kez indirilir, her uydu için kopyalanır; boyut gerçek ölçeğe (km) getirilir
  template(key) {
    let c = this.cache.get(key);
    if (c) { c.used = performance.now(); return c; }
    c = { used: performance.now(), obj: null, err: null };
    c.promise = this.loader.loadAsync(`models/sats/${key}.glb`).then((g) => {
      const root = g.scene, box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), cen = box.getCenter(new THREE.Vector3());
      const k = MODELS[key].size / 1000 / Math.max(size.x, size.y, size.z);
      root.traverse((o) => {
        if (!o.isMesh) return; o.frustumCulled = false;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m.metalness > 0.4) m.metalness = 0.4;                    // ortam haritası yok: tam metal yüzeyler kapkara görünmesin
          m.side = THREE.DoubleSide;
        }
      });
      const pivot = new THREE.Group(), inner = new THREE.Group(); root.position.copy(cen).multiplyScalar(-1); inner.add(root); pivot.add(inner); pivot.scale.setScalar(k);
      if (MODELS[key].rot) inner.rotation.set(...MODELS[key].rot);
      c.obj = pivot; return c;
    }).catch((e) => { c.err = e; });
    this.cache.set(key, c); this.trim(); return c;
  }
  trim() {                                                           // en eski kullanılan şablonları GPU'dan at
    if (this.cache.size <= KEEP) return;
    const act = new Set([...this.on.values()].map((o) => o.key));
    const old = [...this.cache.entries()].filter(([k, c]) => !act.has(k) && c.obj).sort((a, b) => a[1].used - b[1].used);
    while (this.cache.size > KEEP && old.length) {
      const [k, c] = old.shift(); this.cache.delete(k);
      c.obj.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); for (const m of [].concat(o.material)) { for (const v of Object.values(m)) if (v && v.isTexture) v.dispose(); m.dispose(); } } });
    }
  }
  // her kare: eye (ICRF, km), posFn(entry, t) konum; forced: kamera odağındaki uydu (her zaman aday)
  update(t, eye, posFn, sunDir, forced = null) {
    const now = performance.now();
    if (now - this.lastScan > 300) {                                  // en yakın modelli uyduları seç (tüm liste birkaç düzine)
      this.lastScan = now;
      const near = [];
      const cand = forced && !this.entries.some((e) => e.uid === forced.uid) ? [...this.entries, forced] : this.entries;
      for (const e of cand) {
        const p = posFn(e, t); if (!p) continue;
        const d = Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
        if (d < showDist(e.key)) near.push({ e, d });
      }
      near.sort((a, b) => a.d - b.d); this.nearest = near.slice(0, MAX_ON).map((x) => x.e);
      const want = new Set(this.nearest.map((e) => e.uid));
      for (const [uid, o] of this.on) if (!want.has(uid)) { if (o.obj) this.scene.remove(o.obj); this.on.delete(uid); }
      for (const e of this.nearest) if (!this.on.has(e.uid)) {
        const o = { key: e.key, obj: null, e }; this.on.set(e.uid, o);
        const c = this.template(e.key);
        if (!c.obj && !c.err && this.onLoad) this.onLoad(e, 'start');
        c.promise.then(() => {
          if (this.on.get(e.uid) !== o || !c.obj) { if (c.err && this.onLoad) this.onLoad(e, 'error'); return; }
          o.obj = c.obj.clone(); this.scene.add(o.obj); if (this.onLoad) this.onLoad(e, 'done');
        });
      }
    }
    let any = false, lead = null; this.hideRadius = 0;
    for (const o of this.on.values()) {
      if (!o.obj) continue;
      const p = posFn(o.e, t), p2 = posFn(o.e, t + 1); if (!p || !p2) { o.obj.visible = false; continue; }
      any = true; o.obj.visible = true;
      this.hideRadius = Math.max(this.hideRadius, Math.min(showDist(o.key), Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]) + MODELS[o.key].size / 1000 * 3));
      o.obj.position.set(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
      // yönelim (uçuş ekseni): Y = başucu (merkez cisimden dışa), Z = hız yönü, X = yörünge normali
      const c = o.e.center ? o.e.center(t) : [0, 0, 0];
      const up = new THREE.Vector3(p[0] - c[0], p[1] - c[1], p[2] - c[2]).normalize();
      const v = new THREE.Vector3(p2[0] - p[0], p2[1] - p[1], p2[2] - p[2]); v.addScaledVector(up, -v.dot(up)).normalize();
      const x = new THREE.Vector3().crossVectors(up, v);
      o.obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, v));
      if (!lead) lead = { p, o };
    }
    let fillI = 0;
    if (lead) {                                                       // en yakın model: ışık kameradan ona doğru
      const q = lead.o.obj.position; this.fill.position.set(0, 0, 0); this.fill.target.position.copy(q);
      let lit = true;
      if (!lead.o.e.m && sunDir) { const a = lead.p[0] * sunDir[0] + lead.p[1] * sunDir[1] + lead.p[2] * sunDir[2];
        lit = !(a < 0 && Math.hypot(lead.p[0] - a * sunDir[0], lead.p[1] - a * sunDir[1], lead.p[2] - a * sunDir[2]) < 6378); }
      fillI = lit ? 0.35 : 1.1; this.leadLit = lit;
    }
    this.fill.intensity = fillI;
    return any;
  }
  // dışarıdan: uid için model çizili mi
  active(uid) { const o = this.on.get(uid); return !!(o && o.obj && o.obj.visible); }
  hideAll() { this.hideRadius = 0; for (const o of this.on.values()) if (o.obj) this.scene.remove(o.obj); this.on.clear(); this.fill.intensity = 0; }
}
