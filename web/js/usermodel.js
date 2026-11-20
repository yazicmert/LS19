// Kendi uydum (usersat.js): modeli çözme (GLB/STL/OBJ), ölçekleme, boyama ve fragman sahnesindeki uydu. three.js'e bağlıdır; ayrı pencerede yalnız önizleme için yüklenir.
//   Sahnede: ayrılmadan önce aracın yanına bağlı; ayrılınca aracın yörünge çerçevesinde (LVLH) Clohessy–Wiltshire göreli hareketi (ortak bozucular birbirini götürür).
import * as THREE from 'three';
import { cw, lvlh, uydumKayit } from './usersat.js';

const KM = 0.001, MU_E = 398600.435507;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unt = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---------------------------------------------------------------- model çözme ve sahneye hazırlama
export async function modelCoz(buf, bicim) {
  if (bicim === 'glb') {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
    const L = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gl = await new Promise((res, rej) => L.parse(buf, '', res, rej));
    return gl.scene;
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: 0.2, roughness: 0.55, side: THREE.DoubleSide });   // çift yüz: CAD ağlarında yüz yönü tutarsız olabilir          // CAD çıktısı renksiz: mat boya gibi (ortam yansıması olmadan da Güneş'te okunur)
  if (bicim === 'stl') {
    const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
    const geo = new STLLoader().parse(buf); geo.computeVertexNormals();          // dosyadaki yüz normalleri çoğu CAD çıktısında sıfır ya da yanlış: geometriden
    if (geo.hasColors) { mat.vertexColors = true; mat.color.set(0xffffff); }
    const g = new THREE.Group(); g.add(new THREE.Mesh(geo, mat)); g.userData.boyanir = !geo.hasColors; return g;
  }
  if (bicim === 'obj') {
    const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
    const g = new OBJLoader().parse(new TextDecoder().decode(buf));
    g.traverse((o) => { if (o.isMesh) { if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals(); o.material = mat; } else if (o.isLine || o.isPoints) o.visible = false; });
    g.userData.boyanir = true; return g;
  }
  throw new Error('bicim');
}
export function ucgenSay(g) {
  let n = 0;
  g.traverse((o) => { if (!o.isMesh || !o.geometry) return; const G = o.geometry; n += (G.index ? G.index.count : (G.attributes.position ? G.attributes.position.count : 0)) / 3; });
  return Math.round(n);
}
export function modelBirak(g) {
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); const m = o.material; for (const x of Array.isArray(m) ? m : m ? [m] : []) { for (const v of Object.values(x)) if (v && v.isTexture) v.dispose(); x.dispose(); } });
}
// merkez sınır kutusunun ortasına, en uzun boyut = boy (m) olacak biçimde; birim: sahne (km) ya da metre (önizleme)
export function modelOlcekle(g, boy, birim = KM) {
  const kap = new THREE.Group(); kap.add(g);
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()), m = Math.max(s.x, s.y, s.z) || 1;
  g.position.sub(c); kap.scale.setScalar((boy * birim) / m);
  return kap;
}
export function modelBoya(g, renk) {
  if (!g.userData.boyanir) return;
  g.traverse((o) => { if (o.isMesh && o.material && o.material.color) o.material.color.set(renk); });
}

// ---------------------------------------------------------------- fragman sahnesindeki uydu (cinema.js kurar, scene.js her karede yerleştirir)
export const AYRILMA = { yan: 3.4, hiz: 0.00035, radyal: -0.00005 };          // bağlı uzaklık (m, + yarı boy), ayrılma hızı (km/s), radyal bileşen (km/s)
export class UydumSahne {
  constructor(scene, kayit, model) {
    this.scene = scene; this.boy = kayit.boy; this.ad = kayit.ad;
    modelBoya(model, kayit.renk);
    this.obj = modelOlcekle(model, kayit.boy); this.obj.name = 'uydum'; this.obj.visible = false;
    scene.add(this.obj); this.ayr = null; this.pos = null; this.cer = null;
  }
  // tD: ayrılma anı (s); tSon: bu andan sonra (Ay'a transfer yakışı) yok — yakıştan sonra göreli hareket geçersiz.
  // Konum o karenin araç durumundan hesaplanır (kamera da aynı kare için çağırır: bir kare gecikme olmaz) → { p (ICRF km), cer (LVLH), q } | null
  konum(x, info, attQ, tD, tSon) {
    const t = x.t; if (!(t < tSon) || !attQ) return null;
    const cer = lvlh(x.r, x.v), veh = info.vehPos;
    const yan = (AYRILMA.yan + this.boy / 2) * KM, gx = new THREE.Vector3(1, 0, 0).applyQuaternion(attQ), bagli = [veh[0] + gx.x * yan, veh[1] + gx.y * yan, veh[2] + gx.z * yan];
    if (this.ayr && t < this.ayr.t0 - 1) this.ayr = null;                        // geri sarıldı
    if (t < tD) return { p: bagli, cer, q: attQ };
    if (!this.ayr) {                                                              // ilk ayrılma karesi: bağlı konumdan, yana doğru hafif itişle
      const d = sub(bagli, veh), r0 = [dot(d, cer.R), dot(d, cer.S), dot(d, cer.W)], u = unt(r0);
      this.ayr = { t0: t, r0, v0: [u[0] * AYRILMA.hiz + AYRILMA.radyal, u[1] * AYRILMA.hiz, u[2] * AYRILMA.hiz], n: Math.sqrt(MU_E / Math.hypot(...x.r) ** 3), q: attQ.clone() };
    }
    const A = this.ayr, q = cw(A.n, t - A.t0, A.r0, A.v0);
    const p = [0, 1, 2].map((i) => veh[i] + q[0] * cer.R[i] + q[1] * cer.S[i] + q[2] * cer.W[i]);
    return { p, cer, q: A.q };                                                    // ayrıldıktan sonra yönelim sabit (tork yok)
  }
  yerlestir(x, info, rel, attQ, tD, tSon) {
    const k = this.konum(x, info, attQ, tD, tSon); this.pos = k ? k.p : null; this.cer = k ? k.cer : null;
    if (!k) { this.obj.visible = false; return; }
    rel(k.p, this.obj.position); this.obj.quaternion.copy(k.q); this.obj.visible = true;
  }
  kaldir() { this.scene.remove(this.obj); modelBirak(this.obj); this.obj = null; }
}
// kayıttan sahne nesnesi (fragman başlarken); model çözülemezse null
export async function uydumSahneKur(scene) {
  const r = await uydumKayit(); if (!r || !r.dosya) return null;
  try { const g = await modelCoz(await r.dosya.arrayBuffer(), r.bicim); return new UydumSahne(scene, r, g); } catch (e) { console.warn('uydum:', e); return null; }
}
