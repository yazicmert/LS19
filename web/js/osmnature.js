// Kalkış canlandırmasında rampa çevresinin doğal unsurları — anahtarsız, açık veri: OpenStreetMap (ODbL), OpenFreeMap karolarının landcover ve water
// katmanları (osmbuildings.js aynı karoları indirir, bu modül paylaşır; ek istek yok).
//   · Ağaçlar: landcover wood (orman) içinde; çalılar: grass/scrub; sulak alan (wetland): seyrek alçak bitki. Yerleşim tohumlu (karoya bağlı) ve
//     belirlenimci; yoğunluk rampaya uzaklıkla azalır (yakında sık, TREE_R'de sıfır), toplam sınırlıdır. Renk uydu görüntüsünden (sample) ± ton farkı.
//     Biçimler: iğne yapraklı (koni) ve geniş yapraklı (yuvarlak taç) ağaç, çalı; boylar (v): orman 6–16 m, çalı 1–3 m, sulak alan 0,6–1,5 m.
//   · Su: water katmanı (göl, gölet, nehir, deniz): düz yüzey, gölgelendirici: Fresnel gökyüzü yansıması, Güneş parıltısı, rüzgârla kıpırdayan dalga.
//   · Yükseklik: zeminin kabartmasından (padground.js groundAt) + Dünya eğriliği. Google 3B karolar açıkken gizlenir (ağaçlar karolarda).
// Saf yardımcılar (naturePolygons, inPolygon, scatter, rng) Node'da sınanır: test/test_padground.js.
import { padXZ, ringArea } from './osmbuildings.js';

export const TREE_R = 4500, MAX_TREES = 24000, MAX_BUSHES = 14000;
const R_E = 6378137;
// tohumlu sözde rastgele (mulberry32)
export function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// MVT katmanı → çokgenler { kind: 'wood'|'scrub'|'wetland'|'water', outer, holes } (rampa çerçevesi, m: [doğu, güney])
export function naturePolygons(layers, tile, site) {
  const out = [], take = (layer, kindOf) => {
    if (!layer) return;
    for (const f of layer.features) {
      if (f.type !== 3) continue;
      const kind = kindOf(f.props); if (!kind) continue;
      let cur = null;
      for (const ring of f.rings) {
        if (ring.length < 3) continue;
        const pts = ring.map(([px, py]) => padXZ(tile, layer.extent, px, py, site));
        if (ringArea(ring) > 0) { cur = { kind, outer: pts, holes: [] }; out.push(cur); } else if (cur) cur.holes.push(pts);
      }
    }
  };
  take(layers.landcover, (p) => (p.class === 'wood' ? 'wood' : p.subclass === 'scrub' ? 'scrub' : p.class === 'wetland' ? 'wetland' : null));
  take(layers.water, () => 'water');
  return out;
}
// nokta çokgende mi (çift-tek kuralı; delikler dışarıda)
export function inRing(x, z, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; }
export const inPolygon = (x, z, p) => inRing(x, z, p.outer) && !p.holes.some((h) => inRing(x, z, h));
// bitki yerleşimi: her çokgende alanına ve rampaya uzaklığına göre nokta; { x, z, s (0..1 boy), v (ton), kind }
const SPACING = { wood: 7, scrub: 6, wetland: 22 };
export function scatter(polys, seed = 1, { radius = TREE_R } = {}) {
  const R = rng(seed), out = [];
  for (const p of polys) {
    const sp = SPACING[p.kind]; if (!sp) continue;
    const xs = p.outer.map((q) => q[0]), zs = p.outer.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    if (Math.max(Math.abs(x0), Math.abs(x1)) > radius * 1.5 && Math.max(Math.abs(z0), Math.abs(z1)) > radius * 1.5 && Math.min(Math.hypot(x0, z0), Math.hypot(x1, z1)) > radius) continue;
    const n = Math.min(4000, Math.round(((x1 - x0) * (z1 - z0)) / (sp * sp)));
    for (let i = 0; i < n; i++) {
      const x = x0 + (x1 - x0) * R(), z = z0 + (z1 - z0) * R(), d = Math.hypot(x, z), keep = Math.max(0, 1 - d / radius) ** 1.5;
      if (d < 120 || R() > keep || !inPolygon(x, z, p)) continue;                    // rampanın 120 m'si boş (beton, hendek)
      out.push({ x, z, s: R(), v: R(), kind: p.kind, cone: R() < 0.45 });
    }
  }
  return out;
}

const WATER_VS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vW;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;
const WATER_FS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 upW, eW, sW, sunDir, skyCol, deepCol, padW; uniform float day, time, fade;
varying vec3 vW;
void main() {
  #include <logdepthbuf_fragment>
  // dalga: iki yönlü küçük sinüsler (eğim), rampa çerçevesinin yatay eksenlerinde (dünya birimi km → m)
  vec2 p = vec2(dot(vW, eW), dot(vW, sW)) * 1000.0;
  // uzakta dalga ve parıltı söner (metre ölçekli sinüsler piksel altına inince beyaz lekeler ve hareli desen üretir)
  float dist = length(cameraPosition - vW) * 1000.0, near = 1.0 / (1.0 + pow(dist / 500.0, 2.0));
  float a = sin(p.x * 0.21 + time * 1.3) + sin(p.y * 0.17 - time * 1.1) * 0.8 + sin((p.x + p.y) * 0.41 + time * 2.1) * 0.4;
  float b = cos(p.y * 0.23 + time * 1.2) + cos(p.x * 0.19 - time * 0.9) * 0.8 + cos((p.x - p.y) * 0.37 + time * 1.7) * 0.4;
  vec3 N = normalize(upW + (eW * a + sW * b) * 0.035 * near);
  vec3 V = normalize(cameraPosition - vW), L = normalize(sunDir);
  float fr = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);                // Schlick (su n ≈ 1,33)
  vec3 R = reflect(-V, N); float spec = pow(max(dot(R, L), 0.0), 220.0) * smoothstep(-0.05, 0.1, dot(upW, L)) * near;
  vec3 col = mix(deepCol * (0.25 + 0.75 * day), skyCol * (0.15 + 0.85 * day), fr) + vec3(1.0, 0.95, 0.85) * spec * 2.2 * day;
  // saydamlık: yakında su yüzeyi, uzakta ve yüksekten uydu görüntüsünün kendi denizi (karo sınırları ve düz renk görünmez);
  // rampadan uzaklaştıkça (yüklenen karoların kenarına doğru) ve kamera yükseldikçe (fade) söner
  vec2 q = vec2(dot(vW - padW, eW), dot(vW - padW, sW)) * 1000.0;
  float al = 0.9 * fade * (1.0 - smoothstep(2500.0, 6000.0, length(q))) * (1.0 - smoothstep(3000.0, 9000.0, dist));
  gl_FragColor = vec4(col, al);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ağaç geometrisi (birim boy; köşe rengi + yumuşak normal). conifer: gövde + üç kademeli koni; broadleaf: gövde + yumrulu taç; bush: basık yumrulu küme.
// Köşe sayısı düşük tutulur (örnek başına ~35–90 üçgen): on binlerce örnek tek çizimde.
export function treeGeo(THREE, kind) {
  const pos = [], nor = [], col = [];
  const add = (g, shade) => {
    const n = g.index ? g.toNonIndexed() : g, P = n.attributes.position, N = n.attributes.normal;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); const c = shade(P.getX(i), P.getY(i), P.getZ(i)); col.push(c[0], c[1], c[2]); }
    g.dispose(); if (n !== g) n.dispose();
  };
  const trunk = (h, r) => { const g = new THREE.CylinderGeometry(r * 0.7, r, h, 5, 1, true); g.translate(0, h / 2, 0); add(g, () => [0.5, 0.36, 0.26]); };
  // yumru: bozulmuş ikosahedron (ayrıntı 1), normali merkezden dışa (yumuşak gölge); altı koyu, üstü açık
  const lump = (cx, cy, cz, rx, ry, seed, det = 1) => {
    const g = new THREE.IcosahedronGeometry(1, det), P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), k = 1 + 0.16 * Math.sin(x * 5.1 + seed) * Math.cos(z * 4.3 - seed) + 0.1 * Math.sin(y * 6.7 + seed * 2);
      N.setXYZ(i, x, y, z); P.setXYZ(i, cx + x * rx * k, cy + y * ry * k, cz + z * rx * k);
    }
    add(g, (x, y) => { const t = Math.min(1, Math.max(0, (y - (cy - ry)) / (2 * ry))), v = 0.55 + 0.6 * t; return [v, v, v * 0.95]; });
  };
  if (kind === 'conifer') {
    trunk(0.22, 0.045);
    for (const [y0, h, r] of [[0.14, 0.42, 0.42], [0.36, 0.36, 0.32], [0.58, 0.42, 0.21]]) {                 // üç kademe, alttan üste daralır
      const g = new THREE.ConeGeometry(r, h, 8, 1, true); g.translate(0, y0 + h / 2, 0);
      add(g, (x, y) => { const t = (y - y0) / h, v = 0.5 + 0.7 * t; return [v * 0.92, v, v * 0.9]; });
    }
  } else if (kind === 'broadleaf') {
    trunk(0.38, 0.05);
    lump(0, 0.66, 0, 0.42, 0.34, 1.3); lump(0.2, 0.5, 0.1, 0.26, 0.2, 4.1, 0); lump(-0.17, 0.54, -0.14, 0.27, 0.21, 7.7, 0);
  } else { lump(0, 0.4, 0, 0.62, 0.42, 2.2, 0); lump(0.36, 0.3, 0.2, 0.4, 0.3, 5.4, 0); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
// Uzak biçimler (ekranda FAR_PX pikselden kısa bitkiler): tam biçimin tacı yerine tek parça, yandan görünen alanı tam biçiminkine eşit (uzakta ağaç
// örtüsü seyrelmesin); köşe gölgesi tam biçimdeki gibi (altı koyu, üstü açık).
// İğne yapraklı: dört yüzlü piramit (4 üçgen; tam 34). Geniş yapraklı ve çalı: tek yirmiyüzlü yumru (20 üçgen; tam 130 ve 40). 8 pikselde gövde
// (≤ 0,4 piksel) ve yumruların ayrıntısı seçilmez.
export const FAR_PX = 8;
export function farTreeGeo(THREE, kind) {
  const pos = [], nor = [], col = [];
  const tri = (a, b, c, na, nb, nc, ca, cb, cc) => { pos.push(...a, ...b, ...c); nor.push(...na, ...nb, ...nc); col.push(...ca, ...cb, ...cc); };
  const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  if (kind === 'conifer') {
    const y0 = 0.14, top = [0, 1.0, 0], r = 0.5, base = [0, 1, 2, 3].map((i) => [r * Math.cos(i * Math.PI / 2 + Math.PI / 4), y0, r * Math.sin(i * Math.PI / 2 + Math.PI / 4)]);
    const cb = [0.46, 0.5, 0.45], ct = [1.1, 1.2, 1.08];
    const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]], cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    for (let i = 0; i < 4; i++) {
      let a = base[i], b = base[(i + 1) % 4], n = unit(cross(sub(top, a), sub(b, a)));
      if (n[0] * (a[0] + b[0]) + n[2] * (a[2] + b[2]) < 0) { [a, b] = [b, a]; n = n.map((x) => -x); }      // dışa bakan yüz (ön yüz sarımı)
      tri(a, top, b, n, n, n, cb, ct, cb);
    }
  } else {
    // tek yumru: yirmiyüzlü (tam biçimdeki yumruların gövdesi, ayrıntı 0); sekizyüzlü küçük boyda bile köşeli baklava gibi görünüyordu
    const [cx, cy, cz, rx, ry] = kind === 'bush' ? [0.12, 0.4, 0.07, 0.8, 0.46] : [0, 0.62, 0, 0.5, 0.41];      // yandan görünen alan yumruların toplamına yakın
    const ico = new THREE.IcosahedronGeometry(1, 0), P = ico.attributes.position;
    for (let i = 0; i < P.count; i += 3) {
      const v = [0, 1, 2].map((k) => [P.getX(i + k), P.getY(i + k), P.getZ(i + k)]), at = (u) => [cx + u[0] * rx, cy + u[1] * ry, cz + u[2] * rx];
      const C = (u) => { const t = (u[1] + 1) / 2, k = 0.55 + 0.6 * t; return [k, k, k * 0.95]; };
      tri(at(v[0]), at(v[1]), at(v[2]), v[0], v[1], v[2], C(v[0]), C(v[1]), C(v[2]));          // normal merkezden dışa (yumuşak, tam biçimdeki yumru gibi)
    }
    ico.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
// Bitkileri kümelere ayır: 0 yakın (tam biçim), 1 uzak (farTreeGeo, ekrandaki boyu farPx'ten kısa), 2 görüş alanı dışında (çizilmez). Örneklenmiş ağ
// örnek başına görüş alanı denetimi yapmaz: tele kamerada (geri sayım, 4,5°) bitkilerin çoğu kadraj dışındayken yine de işleniyordu.
// S: { n, pos (taç merkezi x,y,z ×n, m), h (boy, m), st (Uint8: şimdiki küme) }; c: kameranın bitki grubundaki konumu (m); K: piksel/radyan;
// planes: görüş alanı düzlemleri (bitki grubunun çerçevesinde, normalleri birim: { x, y, z, w }) ya da null; mv (m) ve ang (rad): bir sonraki yeniden
// dağıtıma dek kameranın yer değiştirmesi ve dönmesi için pay (kadraj kenarında bitki kaybolmasın). Dönüş: kümesi değişen bitki sayısı.
export function splitByPx(S, c, K, planes = null, mv = 0, ang = 0, farPx = FAR_PX) {
  let changed = 0;
  for (let i = 0; i < S.n; i++) {
    const x = S.pos[3 * i], y = S.pos[3 * i + 1], z = S.pos[3 * i + 2], dx = x - c[0], dy = y - c[1], dz = z - c[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    let f = S.h[i] * K < farPx * d ? 1 : 0;                                              // ekrandaki boy h·K/d < farPx
    if (planes) {
      const m = 0.8 * S.h[i] + mv + d * ang;                                             // taç yarıçapı (< 0,8 boy) + pay
      for (const P of planes) if (P.x * x + P.y * y + P.z * z + P.w < -m) { f = 2; break; }
    }
    if (f !== S.st[i]) { S.st[i] = f; changed++; }
  }
  return changed;
}
// bitkileri iş parçacığından aktarmak için paketle (Float32Array, bitki başına 6 sayı: x, z, s, v, tür, koni). build'in sınırları (MAX_TREES/MAX_BUSHES,
// sırayla) burada da uygulanır: build aynı bitkileri aynı sırayla görür, aktarılan dizi küçük kalır
const KINDS = ['wood', 'scrub', 'wetland'];
export function packPlants(plants) {
  const keep = []; let nT = 0, nB = 0;
  for (const q of plants) { if (q.kind === 'wood' ? nT++ >= MAX_TREES : nB++ >= MAX_BUSHES) continue; keep.push(q); }
  const a = new Float32Array(keep.length * 6);
  keep.forEach((q, i) => { a.set([q.x, q.z, q.s, q.v, KINDS.indexOf(q.kind), q.cone ? 1 : 0], i * 6); });
  return a;
}
export const unpackPlants = (a) => { const out = new Array(a.length / 6); for (let i = 0; i < out.length; i++) { const o = i * 6; out[i] = { x: a[o], z: a[o + 1], s: a[o + 2], v: a[o + 3], kind: KINDS[a[o + 4]], cone: a[o + 5] === 1 }; } return out; };
export class OsmNature {
  // THREE · parent: rampa grubu (ölçek KM, birim m) · site
  constructor(THREE, parent, site) { this.T = THREE; this.parent = parent; this.site = site; this.group = new THREE.Group(); parent.add(this.group); this.polys = []; this.plants = []; this.t = 0; }
  // karolar (osmbuildings.js'in indirdikleri): [{ t, layers }]
  addTiles(tiles) { for (const { t, layers } of tiles) this.polys.push(...naturePolygons(layers, t, this.site)); this.plants = scatter(this.polys, 7); }
  // iş parçacığında hazırlanmış veri (osmwork.js): { polys: su çokgenleri, plants: packPlants çıktısı }
  setData({ polys, plants }) { this.polys = polys; this.plants = unpackPlants(plants); }
  // ground: { groundAt(e, s), sample(lat, lon) } (padground.js; yoksa düz zemin, yeşil tonlar)
  build(ground = null) {
    const THREE = this.T; this.clear();
    const drop = (x, z) => -(x * x + z * z) / (2 * R_E), gy = (x, z) => (ground && ground.heightAt ? ground.groundAt(x, z) : 0.25) + drop(x, z);
    const D2R = Math.PI / 180, ll = (x, z) => [this.site.lat - z / R_E / D2R, this.site.lon + x / (R_E * Math.cos(this.site.lat * D2R)) / D2R];
    // bitkiler: üç örneklenmiş ağ (koni ağaç, yuvarlak ağaç, çalı); boy ve renk örnek başına
    // birim boyda (yükseklik 1, taban y = 0) ağaç biçimleri: gövde + taç; köşe rengi taç içi gölgeyi taşır (altı ve içi koyu, ucu açık), örnek rengiyle çarpılır
    const cone = treeGeo(THREE, 'conifer'), ball = treeGeo(THREE, 'broadleaf'), bush = treeGeo(THREE, 'bush');
    const mat = () => new THREE.MeshLambertMaterial({ emissive: 0x121a0c, vertexColors: true });
    const sets = { cone: [], ball: [], bush: [] };
    let nT = 0, nB = 0;
    for (const q of this.plants) {
      const tree = q.kind === 'wood';
      if (tree ? nT++ >= MAX_TREES : nB++ >= MAX_BUSHES) continue;
      const h = tree ? 6 + 10 * q.s : q.kind === 'scrub' ? 1 + 2 * q.s : 0.6 + 0.9 * q.s;
      sets[tree ? (q.cone ? 'cone' : 'ball') : 'bush'].push({ ...q, h, w: tree ? h * (q.cone ? 0.75 : 1.0) : h * 1.5 });
    }
    const m4 = new THREE.Matrix4(), c = new THREE.Color(), quat = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    // her tür iki örneklenmiş ağ: yakın (tam biçim) ve uzak (farTreeGeo); aynı malzeme (tek gölgelendirici programı). Bitkiler ekrandaki boyuna göre
    // ikisine dağıtılır (lod; kamera yer değiştirince). Örnek verisi (matris, renk, konum, boy) burada saklanır.
    this.sets = [];
    for (const [k, geo, far] of [['cone', cone, 'conifer'], ['ball', ball, 'broadleaf'], ['bush', bush, 'bush']]) {
      const L = sets[k]; if (!L.length) { geo.dispose(); continue; }
      const n = L.length, m = mat(), near = new THREE.InstancedMesh(geo, m, n), farM = new THREE.InstancedMesh(farTreeGeo(THREE, far), m, n);
      const S = { n, near, farM, mat: new Float32Array(16 * n), col: new Float32Array(3 * n), pos: new Float32Array(3 * n), h: new Float32Array(n), st: new Uint8Array(n) };
      L.forEach((q, i) => {
        quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), q.v * 6.283); sc.set(q.w, q.h, q.w); ps.set(q.x, gy(q.x, q.z), q.z);
        m4.compose(ps, quat, sc).toArray(S.mat, 16 * i); S.pos[3 * i] = ps.x; S.pos[3 * i + 1] = ps.y + 0.5 * q.h; S.pos[3 * i + 2] = ps.z; S.h[i] = q.h;
        const smp = ground && ground.sample ? ground.sample(...ll(q.x, q.z), 1) : null;           // uydu görüntüsünden yeşil (çok açıksa/griyse varsayılan)
        const ok = smp && smp[1] >= smp[0] * 0.92 && smp[1] >= smp[2] && smp[1] < 0.75;
        if (ok) c.setRGB(smp[0] * 0.9, smp[1] * 0.95, smp[2] * 0.85, THREE.SRGBColorSpace); else c.setRGB(0.16 + 0.08 * q.v, 0.27 + 0.1 * q.v, 0.12, THREE.SRGBColorSpace);
        c.multiplyScalar(0.85 + 0.3 * q.s); c.toArray(S.col, 3 * i);
      });
      for (const im of [near, farM]) { im.setColorAt(0, c); im.frustumCulled = false; this.group.add(im); }       // setColorAt: instanceColor özniteliği kurulur
      this.fill(S); this.sets.push(S);
    }
    this.lodKey = null;
    // su: her çokgen düz yüzey (çokgenin orta noktasındaki zemin yüksekliği + 0,15 m), tek birleştirilmiş geometri
    const pos = [];
    for (const p of this.polys) {
      if (p.kind !== 'water') continue;
      const c0 = p.outer.reduce((a, q) => [a[0] + q[0] / p.outer.length, a[1] + q[1] / p.outer.length], [0, 0]), y0 = (ground && ground.heightAt ? ground.groundAt(c0[0], c0[1]) : 0.25) + 0.15;
      const o2 = p.outer.map(([x, z]) => new THREE.Vector2(x, z)), h2 = p.holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z))), all = [...o2, ...h2.flat()];
      for (const tri of THREE.ShapeUtils.triangulateShape(o2, h2)) for (const i of tri) pos.push(all[i].x, y0 + drop(all[i].x, all[i].y), all[i].y);
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      this.water = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { upW: { value: new THREE.Vector3(0, 1, 0) }, eW: { value: new THREE.Vector3(1, 0, 0) }, sW: { value: new THREE.Vector3(0, 0, 1) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, padW: { value: new THREE.Vector3() }, fade: { value: 1 },
          skyCol: { value: new THREE.Color(0.55, 0.68, 0.84) }, deepCol: { value: new THREE.Color(0.04, 0.11, 0.13) }, day: { value: 1 }, time: { value: 0 } } }));
      this.water.renderOrder = 1; this.water.frustumCulled = false; this.group.add(this.water);
    }
  }
  // her kare: pad (rampa grubu; eksenler dünyada), Güneş yönü (dünya), gündüz oranı, gerçek zaman adımı (s), kamera irtifası (km)
  // camera, Hpx (çizim tamponu yüksekliği, piksel): ayrıntı düzeyi (lod) için; verilmezse bitkiler tam biçimde kalır
  frame({ pad, sunDir, day = 1, dt = 0, camH = 0, camera = null, Hpx = 0 }) {
    this.t += dt; this.group.visible = this.visible !== false;
    for (const ch of this.group.children) if (ch.isInstancedMesh) ch.visible = camH < 15;           // 15 km'den yukarıda ağaçlar piksel altı
    if (camera && Hpx && camH < 15 && this.group.visible) this.lod(camera, Hpx);
    if (!this.water || !pad) return;
    const U = this.water.material.uniforms, e = pad.matrixWorld.elements;
    U.eW.value.set(e[0], e[1], e[2]).normalize(); U.upW.value.set(e[4], e[5], e[6]).normalize(); U.sW.value.set(e[8], e[9], e[10]).normalize();
    U.padW.value.set(e[12], e[13], e[14]);
    if (sunDir) U.sunDir.value.set(sunDir[0], sunDir[1], sunDir[2]); U.day.value = day; U.time.value = this.t;
    U.fade.value = 1 - Math.min(1, Math.max(0, (camH - 1.2) / 3.8)); this.water.visible = U.fade.value > 0.01;   // 1,2 → 5 km arasında söner: yüksekten yalnız uydu görüntüsü
  }
  // kümeleri örneklenmiş ağlara yaz (S.st: 0 yakın, 1 uzak, 2 çizilmez)
  fill(S) {
    const A = [S.near, S.farM], cnt = [0, 0];
    for (let i = 0; i < S.n; i++) {
      const f = S.st[i]; if (f > 1) continue;
      const im = A[f], j = cnt[f]++;
      im.instanceMatrix.array.set(S.mat.subarray(16 * i, 16 * i + 16), 16 * j); im.instanceColor.array.set(S.col.subarray(3 * i, 3 * i + 3), 3 * j);
    }
    for (let f = 0; f < 2; f++) { const im = A[f]; im.count = cnt[f]; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
  }
  // ayrıntı düzeyi ve görüş alanı: kamera MOVE metreden çok yer değiştirdiyse, payın yarısından çok döndüyse ya da görüş açısı/çözünürlük %2'den çok
  // değiştiyse yeniden dağıt; küme değişmediyse ekran kartına yükleme yok. Pay: görüş açısının %10'u (en az 0,01 rad) dönme, MOVE metre yer değiştirme.
  lod(camera, Hpx) {
    const THREE = this.T, v = this._lv || (this._lv = new THREE.Vector3()), q = this._lq || (this._lq = new THREE.Quaternion());
    this.group.updateWorldMatrix(true, false); camera.updateMatrixWorld(); camera.getWorldPosition(v); camera.getWorldQuaternion(q); this.group.worldToLocal(v);
    const MOVE = 5, fovR = camera.fov * Math.PI / 180, ang = Math.max(0.01, 0.1 * fovR), K = Hpx / 2 / Math.tan(fovR / 2), k = this.lodKey;
    if (k && Math.hypot(v.x - k.x, v.y - k.y, v.z - k.z) < MOVE && Math.abs(K / k.K - 1) < 0.02 && q.angleTo(k.q) < ang / 2) return;
    this.lodKey = { x: v.x, y: v.y, z: v.z, K, q: q.clone() };
    const fr = this._fr || (this._fr = new THREE.Frustum()), M = this._fm || (this._fm = new THREE.Matrix4());
    fr.setFromProjectionMatrix(M.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(this.group.matrixWorld));
    const planes = fr.planes.map((P) => { const L = P.normal.length(); return { x: P.normal.x / L, y: P.normal.y / L, z: P.normal.z / L, w: P.constant / L }; });
    for (const S of this.sets || []) if (splitByPx(S, [v.x, v.y, v.z], K, planes, MOVE, ang)) this.fill(S);
  }
  clear() { const mats = new Set(); for (const ch of [...this.group.children]) { this.group.remove(ch); ch.geometry.dispose(); mats.add(ch.material); } for (const m of mats) m.dispose(); this.water = null; this.sets = []; }
  dispose() { this.clear(); if (this.group.parent) this.group.parent.remove(this.group); }
}
