// Uydu aile modelleri (js/satinstancer.js) — Node 20+: cd web && node test/test_satinstancer.js
//  farGeometry: ailelerin uzak sürümü (üçgen azalır, boyut ve renk özniteliği korunur, kaburga panele renk olarak karışır, silindir kutuya iner),
//  seen: görüş alanı ve Dünya'nın örtmesi, update: model yalnız görünen uydulara, uzak uydu uzak sürümle, hideRadius görünenlere göre.
import fs from 'node:fs';
import { register } from 'node:module';
register('./importmap_loader.mjs', import.meta.url);
const THREE = await import('three'), { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { farGeometry, seen, SatInstancer } = await import('../js/satinstancer.js');
const { FAMILY_KEYS } = await import('../js/satfamilies.js');

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

// aile modelleri (satinstancer.loadAll ile aynı hazırlık)
const loader = new GLTFLoader(), fams = new Map();
for (const k of FAMILY_KEYS) {
  const b = fs.readFileSync(new URL(`../models/fam/${k}.glb`, import.meta.url));
  const g = await new Promise((res, rej) => loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), '', res, rej));
  let mesh = null; g.scene.updateMatrixWorld(true); g.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  const geo = mesh.geometry.clone(); geo.applyMatrix4(mesh.matrixWorld); geo.computeBoundingBox(); fams.set(k, geo);
}
let hi = 0, lo = 0;
for (const [k, geo] of fams) {
  const far = farGeometry(geo), a = geo.boundingBox, b = far.boundingBox, S = a.getSize(new THREE.Vector3()).length();
  hi += tris(geo); lo += tris(far);
  const inside = b.min.x >= a.min.x - 1e-6 && b.min.y >= a.min.y - 1e-6 && b.min.z >= a.min.z - 1e-6 && b.max.x <= a.max.x + 1e-6 && b.max.y <= a.max.y + 1e-6 && b.max.z <= a.max.z + 1e-6;
  const span = b.getSize(new THREE.Vector3()).length() / S;
  if (far === geo) { check(`${k}: kazanç az (${tris(geo)} üçgen) → asıl model kalır`, tris(geo) <= 96); continue; }
  check(`${k}: uzak sürüm ${tris(geo)} → ${tris(far)} üçgen, kaynağın kutusu içinde, boyu korunur`, tris(far) <= 96 && tris(far) <= 0.6 * tris(geo) && inside && span > 0.8, `boy oranı ${span.toFixed(2)}`);
  const ca = geo.attributes.color, cb = far.attributes.color;
  check(`${k}: öznitelikler aynı (renk öğe boyu ${ca.itemSize}: aynı gölgelendirici)`, cb && cb.itemSize === ca.itemSize && far.attributes.normal && Object.keys(far.attributes).length === Object.keys(geo.attributes).length);
}
check(`toplam üçgen en az 3 kat azalır (${hi} → ${lo})`, lo * 3 <= hi);

// yapay model: 1 m kutu (12) + üstüne oturan ince kaburga (12) + 12 dilimli silindir (48) + küçük kutu (12)
{
  const parts = [new THREE.BoxGeometry(1, 1, 1), new THREE.BoxGeometry(1, 0.01, 0.03).translate(0, 0.505, 0), new THREE.CylinderGeometry(0.2, 0.2, 0.5, 12).translate(1, 0, 0), new THREE.BoxGeometry(0.05, 0.05, 0.05).translate(0, -0.6, 0)];
  const pos = [], col = [], cols = [[0, 0.5, 1], [0.5, 0.5, 0.5], [1, 0.5, 0], [1, 1, 1]];
  for (const [j, p] of parts.entries()) { const q = p.toNonIndexed(), P = q.attributes.position; for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); col.push(...cols[j]); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  const far = farGeometry(g); far.computeBoundingBox();
  check('yapay model: kutu kalır, kaburga ve küçük kutu düşer, silindir 12 üçgenlik kutu olur', tris(far) === 24, `${tris(g)} → ${tris(far)}`);
  check('yapay model: silindirin kutusu silindirin sınırında', Math.abs(far.boundingBox.max.x - 1.2) < 1e-6 && Math.abs(far.boundingBox.min.x + 0.5) < 1e-6 && Math.abs(far.boundingBox.min.y + 0.5) < 1e-6);
  const C = far.attributes.color, P = far.attributes.position; let cyl = false, top = null, bot = null;
  for (let i = 0; i < C.count; i++) {
    if (Math.abs(C.getX(i) - 1) < 1e-6 && Math.abs(C.getZ(i)) < 1e-6) cyl = true;
    if (P.getX(i) < 0.6) { if (Math.abs(P.getY(i) - 0.5) < 1e-6 && Math.abs(P.getY(i - (i % 3)) - 0.5) < 1e-6 && Math.abs(P.getY(i - (i % 3) + 1) - 0.5) < 1e-6) top = C.getX(i); if (Math.abs(P.getY(i) + 0.5) < 1e-6 && Math.abs(P.getY(i - (i % 3)) + 0.5) < 1e-6 && Math.abs(P.getY(i - (i % 3) + 1) + 0.5) < 1e-6) bot = C.getX(i); }
  }
  check('yapay model: kutuya inen parça kendi rengini taşır', cyl);
  check('yapay model: kaburganın rengi oturduğu yüze alan oranında karışır, alt yüz değişmez', top !== null && Math.abs(top - 0.5 * 0.03) < 1e-4 && bot === 0, `üst ${top}, alt ${bot}`);
}

// seen: kamera orijinde, -Z'ye bakar; Dünya merkezi kameradan 20000 km uzakta (+X)
const cam = new THREE.PerspectiveCamera(50, 1.6, 1e-5, 1e11); cam.updateMatrixWorld(true);
const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)), pl = fr.planes;
const R2 = 6340 ** 2, E = [20000, 0, 0];
check('seen: önde, görüş alanında', seen(pl, 0, 0, -1000, 1, ...E, R2));
check('seen: kameranın arkasında değil', !seen(pl, 0, 0, 1000, 1, ...E, R2));
check('seen: görüş alanı kenarının hemen dışında pay kadar görünür', (() => { const x = 1000 * Math.tan(25 * Math.PI / 180) * 1.6; return !seen(pl, x + 20, 0, -1000, 1, ...E, R2) && seen(pl, x + 20, 0, -1000, 30, ...E, R2); })());
{
  const cam2 = new THREE.PerspectiveCamera(50, 1.6, 1e-5, 1e11); cam2.lookAt(1, 0, 0); cam2.updateMatrixWorld(true);
  const pl2 = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam2.projectionMatrix, cam2.matrixWorldInverse)).planes;
  check('seen: Dünya\'nın arkasında değil', !seen(pl2, 28000, 0, 0, 1, ...E, R2));
  check('seen: Dünya\'nın önünde görünür', seen(pl2, 12000, 100, 0, 1, ...E, R2));
  check('seen: ufkun üstünde görünür, hemen altında görünmez', seen(pl2, 28000, 12000, 0, 1, ...E, R2) && !seen(pl2, 28000, 7000, 0, 1, ...E, R2));
}

// update: iki aile, yapay uydular. Kamera Dünya merkezinden 36000 km (+Z), Dünya'ya bakar.
{
  const I = new SatInstancer(new THREE.Scene());
  await new Promise((r) => setTimeout(r, 50));                                              // loadAll (Node'da dosya alınamaz) bitsin
  for (const [k, geo] of fams) { const mk = (g) => { const im = new THREE.InstancedMesh(g, I.mat, 1500); im.count = 0; I.group.add(im); return im; }; I.fam.set(k, { im: mk(geo), lo: mk(farGeometry(geo)), sizeKm: geo.boundingBox.getSize(new THREE.Vector3()).length() / 1000 / 1.5, idx: [] }); }
  I.ready = true;
  const n = 2000, P = new Float32Array(3 * n), V = new Float32Array(3 * n), keys = [], groups = new Uint8Array(n);
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {                                                             // 550 km kabuğunda düzgün dağılım
    const z = 2 * rnd() - 1, ph = 2 * Math.PI * rnd(), r = 6928, q = Math.sqrt(1 - z * z);
    P.set([r * q * Math.cos(ph), r * q * Math.sin(ph), r * z], 3 * i); V.set([-7.6 * Math.sin(ph), 7.6 * Math.cos(ph), 0], 3 * i); keys.push(i % 2 ? 'starlink_v2' : 'oneweb');
  }
  I.setFamilies(keys);
  const eye = [0, 0, 36000], cm = new THREE.PerspectiveCamera(50, 1.6, 1e-5, 1e11); cm.lookAt(0, 0, -1); cm.updateMatrixWorld(true);
  I.update(P, V, 0, eye, cm, 800, [1], groups, 398600.4418, true, null, null, null);
  let total = 0, loN = 0, hiN = 0, bad = 0; const m = new THREE.Matrix4(), p = new THREE.Vector3();
  const pl3 = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cm.projectionMatrix, cm.matrixWorldInverse)).planes;
  for (const f of I.fam.values()) for (const im of [f.im, f.lo]) for (let j = 0; j < im.count; j++) { im.getMatrixAt(j, m); p.setFromMatrixPosition(m); total++; if (!seen(pl3, p.x, p.y, p.z, 1, 0, 0, -36000, 6340 ** 2)) bad++; if (im === f.lo) loN++; else hiN++; }
  const vis = [...Array(n).keys()].filter((i) => seen(pl3, P[3 * i] - eye[0], P[3 * i + 1] - eye[1], P[3 * i + 2] - eye[2], 1, 0, 0, -36000, 6340 ** 2)).length;
  check('update: yalnız görünen uydular model alır (arka yüzdekiler almaz)', bad === 0 && total > 0 && total === vis && vis < n * 0.75, `${total} model, ${vis} görünen / ${n}`);
  check('update: 30.000 km\'deki uydular uzak sürümle çizilir', loN === total && hiN === 0, `uzak ${loN}, asıl ${hiN}`);
  check('update: 1500 sınırı dolmadı → nokta gizleme MAX_DIST', I.hideRadius === 60000);
  // yakından: kamera bir uydunun 0,05 km yanında, ona bakar → o uydu asıl modelle
  const t = [P[0], P[1], P[2]], e2 = [t[0] * 1.0000072, t[1] * 1.0000072, t[2] * 1.0000072], c2 = new THREE.PerspectiveCamera(50, 1.6, 1e-5, 1e11);
  c2.lookAt(t[0] - e2[0], t[1] - e2[1], t[2] - e2[2]); c2.updateMatrixWorld(true);
  I.update(P, V, 0, e2, c2, 800, [1], groups, 398600.4418, true, null, null, null);
  const f0 = I.fam.get(keys[0]);
  check('update: yakındaki uydu asıl modelle çizilir', f0.im.count >= 1, `asıl ${f0.im.count}, uzak ${f0.lo.count}`);
  check('update: uzak sürümün programı asılla aynı (aynı malzeme)', f0.im.material === f0.lo.material);
}

if (fail) { console.log(`\n${fail} hata`); process.exit(1); }
console.log('\nTüm uydu modeli denetimleri geçti');
