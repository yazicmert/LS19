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
uniform vec3 upW, eW, sW, sunDir, skyCol, deepCol; uniform float day, time;
varying vec3 vW;
void main() {
  #include <logdepthbuf_fragment>
  // dalga: iki yönlü küçük sinüsler (eğim), rampa çerçevesinin yatay eksenlerinde (dünya birimi km → m)
  vec2 p = vec2(dot(vW, eW), dot(vW, sW)) * 1000.0;
  float a = sin(p.x * 0.21 + time * 1.3) + sin(p.y * 0.17 - time * 1.1) * 0.8 + sin((p.x + p.y) * 0.41 + time * 2.1) * 0.4;
  float b = cos(p.y * 0.23 + time * 1.2) + cos(p.x * 0.19 - time * 0.9) * 0.8 + cos((p.x - p.y) * 0.37 + time * 1.7) * 0.4;
  vec3 N = normalize(upW + (eW * a + sW * b) * 0.035);
  vec3 V = normalize(cameraPosition - vW), L = normalize(sunDir);
  float fr = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);                // Schlick (su n ≈ 1,33)
  vec3 R = reflect(-V, N); float spec = pow(max(dot(R, L), 0.0), 220.0) * smoothstep(-0.05, 0.1, dot(upW, L));
  vec3 col = mix(deepCol * (0.25 + 0.75 * day), skyCol * (0.15 + 0.85 * day), fr) + vec3(1.0, 0.95, 0.85) * spec * 2.2 * day;
  gl_FragColor = vec4(col, 0.94);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class OsmNature {
  // THREE · parent: rampa grubu (ölçek KM, birim m) · site
  constructor(THREE, parent, site) { this.T = THREE; this.parent = parent; this.site = site; this.group = new THREE.Group(); parent.add(this.group); this.polys = []; this.plants = []; this.t = 0; }
  // karolar (osmbuildings.js'in indirdikleri): [{ t, layers }]
  addTiles(tiles) { for (const { t, layers } of tiles) this.polys.push(...naturePolygons(layers, t, this.site)); this.plants = scatter(this.polys, 7); }
  // ground: { groundAt(e, s), sample(lat, lon) } (padground.js; yoksa düz zemin, yeşil tonlar)
  build(ground = null) {
    const THREE = this.T; this.clear();
    const drop = (x, z) => -(x * x + z * z) / (2 * R_E), gy = (x, z) => (ground && ground.heightAt ? ground.groundAt(x, z) : 0.25) + drop(x, z);
    const D2R = Math.PI / 180, ll = (x, z) => [this.site.lat - z / R_E / D2R, this.site.lon + x / (R_E * Math.cos(this.site.lat * D2R)) / D2R];
    // bitkiler: üç örneklenmiş ağ (koni ağaç, yuvarlak ağaç, çalı); boy ve renk örnek başına
    const cone = new THREE.ConeGeometry(0.42, 1, 6, 1); cone.translate(0, 0.5, 0);
    const ball = new THREE.IcosahedronGeometry(0.5, 0); ball.scale(1, 0.85, 1); ball.translate(0, 0.62, 0);
    const bush = new THREE.IcosahedronGeometry(0.5, 0); bush.scale(1.3, 0.75, 1.3); bush.translate(0, 0.35, 0);
    const mat = () => new THREE.MeshLambertMaterial({ emissive: 0x16200f });
    const sets = { cone: [], ball: [], bush: [] };
    let nT = 0, nB = 0;
    for (const q of this.plants) {
      const tree = q.kind === 'wood';
      if (tree ? nT++ >= MAX_TREES : nB++ >= MAX_BUSHES) continue;
      const h = tree ? 6 + 10 * q.s : q.kind === 'scrub' ? 1 + 2 * q.s : 0.6 + 0.9 * q.s;
      sets[tree ? (q.cone ? 'cone' : 'ball') : 'bush'].push({ ...q, h, w: tree ? h * (q.cone ? 0.42 : 0.6) : h * 1.4 });
    }
    const m4 = new THREE.Matrix4(), c = new THREE.Color(), quat = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    for (const [k, geo] of [['cone', cone], ['ball', ball], ['bush', bush]]) {
      const L = sets[k]; if (!L.length) { geo.dispose(); continue; }
      const im = new THREE.InstancedMesh(geo, mat(), L.length);
      L.forEach((q, i) => {
        quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), q.v * 6.283); sc.set(q.w, q.h, q.w); ps.set(q.x, gy(q.x, q.z), q.z);
        im.setMatrixAt(i, m4.compose(ps, quat, sc));
        const smp = ground && ground.sample ? ground.sample(...ll(q.x, q.z), 1) : null;           // uydu görüntüsünden yeşil (çok açıksa/griyse varsayılan)
        const ok = smp && smp[1] >= smp[0] * 0.92 && smp[1] >= smp[2] && smp[1] < 0.75;
        if (ok) c.setRGB(smp[0] * 0.9, smp[1] * 0.95, smp[2] * 0.85, THREE.SRGBColorSpace); else c.setRGB(0.16 + 0.08 * q.v, 0.27 + 0.1 * q.v, 0.12, THREE.SRGBColorSpace);
        c.multiplyScalar(0.85 + 0.3 * q.s); im.setColorAt(i, c);
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false; this.group.add(im);
    }
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
        uniforms: { upW: { value: new THREE.Vector3(0, 1, 0) }, eW: { value: new THREE.Vector3(1, 0, 0) }, sW: { value: new THREE.Vector3(0, 0, 1) }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
          skyCol: { value: new THREE.Color(0.55, 0.68, 0.84) }, deepCol: { value: new THREE.Color(0.04, 0.11, 0.13) }, day: { value: 1 }, time: { value: 0 } } }));
      this.water.renderOrder = 1; this.water.frustumCulled = false; this.group.add(this.water);
    }
  }
  // her kare: pad (rampa grubu; eksenler dünyada), Güneş yönü (dünya), gündüz oranı, gerçek zaman adımı (s), kamera irtifası (km)
  frame({ pad, sunDir, day = 1, dt = 0, camH = 0 }) {
    this.t += dt; this.group.visible = this.visible !== false;
    for (const ch of this.group.children) if (ch.isInstancedMesh) ch.visible = camH < 15;           // 15 km'den yukarıda ağaçlar piksel altı
    if (!this.water || !pad) return;
    const U = this.water.material.uniforms, e = pad.matrixWorld.elements;
    U.eW.value.set(e[0], e[1], e[2]).normalize(); U.upW.value.set(e[4], e[5], e[6]).normalize(); U.sW.value.set(e[8], e[9], e[10]).normalize();
    if (sunDir) U.sunDir.value.set(sunDir[0], sunDir[1], sunDir[2]); U.day.value = day; U.time.value = this.t;
  }
  clear() { for (const ch of [...this.group.children]) { this.group.remove(ch); ch.geometry.dispose(); ch.material.dispose(); } this.water = null; }
  dispose() { this.clear(); if (this.group.parent) this.group.parent.remove(this.group); }
}
