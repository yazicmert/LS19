// Kalkış canlandırmasında gerçek hava: Open-Meteo'nun kalkış saatindeki alçak / orta / yüksek bulut örtüsü (%) ve görüş uzaklığı (weather.js).
// Üç bulut katmanı rampa çerçevesinde (padground.js ile aynı: metre; x doğu, y yukarı, z güney) yatay düzlemlerdir; gölgelendirici değer gürültüsünün
// fBm toplamını örtü oranıyla eşikler (örtü %0 → bulut yok, %100 → kapalı tavan), kenarda (R_EDGE) söner, Güneş yüksekliğine göre boyanır
// (gündüz beyaz, alçak Güneş'te turuncu, gece koyu; alt yüz gölgeli), rüzgârla kayar. Kamera katmanın içindeyken katman yoğun pusa döner.
// Yükseklikler WMO/ICAO cins sınıflarının tipik tabanlarıdır (v): alçak ~1,5 km (stratokümülüs/kümülüs), orta ~5 km (altokümülüs), yüksek ~10 km (sirrüs).
// Saf yardımcılar (cloudState, hazeLength, sunDim) Node'da sınanır: test/test_weather.js.

export const LAYERS = [
  { key: 'low', h: 1500, thick: 600, scale: 2200, aniso: 1.0, op: 0.95 },
  { key: 'mid', h: 5000, thick: 500, scale: 4000, aniso: 1.4, op: 0.85 },
  { key: 'high', h: 10000, thick: 300, scale: 9000, aniso: 4.0, op: 0.55 },
];
export const R_EDGE = 90000;                              // m: katmanların yarıçapı (ufka doğru söner)

// Open-Meteo saatlik değerleri → { low, mid, high (0..1), visKm, rain (bool), known (bool) }; eksik değerler açık hava sayılır
export function cloudState(h) {
  const f = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x / 100)) : null);
  if (!h) return { low: 0, mid: 0, high: 0, visKm: 40, rain: false, known: false };
  const low = f(h.cloud_cover_low), mid = f(h.cloud_cover_mid), high = f(h.cloud_cover_high), tot = f(h.cloud_cover);
  const any = low != null || mid != null || high != null;
  const vis = Number.isFinite(h.visibility) ? h.visibility / 1000 : null;
  return { low: any ? low ?? 0 : tot ?? 0, mid: mid ?? 0, high: high ?? 0, visKm: vis != null ? Math.max(0.2, Math.min(80, vis)) : 40,
    rain: Number.isFinite(h.precipitation) && h.precipitation >= 0.2, known: any || tot != null || vis != null };
}
// pus sönüm uzunluğu (km; padground.js hava perspektifi): meteorolojik görüş V ≈ 3,9 / σ (Koschmieder) → 1/σ = V / 3,9; 1,5–30 km
export const hazeLength = (visKm) => Math.max(1.5, Math.min(30, visKm / 3.9 * 1.5));
// alt yazı: "Hava · alçak bulut %40 · orta %10 · görüş 16 km" (örtüsü %5'ten az katmanlar yazılmaz; hiç bulut yoksa "açık")
export function wxSummary(c, en = false) {
  const p = (x) => (en ? `${Math.round(x * 100)}%` : `%${Math.round(x * 100)}`), parts = [];   // yüzde işareti dile göre (çeviri kalıbının dışında)
  if (c.low >= 0.05) parts.push(`alçak bulut ${p(c.low)}`);
  if (c.mid >= 0.05) parts.push(`orta bulut ${p(c.mid)}`);
  if (c.high >= 0.05) parts.push(`yüksek bulut ${p(c.high)}`);
  if (!parts.length) parts.push('açık');
  return `Hava · ${parts.join(' · ')} · görüş ${Math.round(c.visKm)} km${c.rain ? ' · yağış' : ''}`;
}
// bulut altındaki doğrudan Güneş ışığının kesri (yerde): her katman örtüsüyle karartır (alçak en çok)
export const sunDim = (c) => (1 - 0.7 * c.low) * (1 - 0.45 * c.mid) * (1 - 0.15 * c.high);

const VS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vP; varying vec3 vW;
void main() {
  vP = position.xz; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;
const FS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float cover, op, scale, aniso, edge, day, sunUp, inside, below;
uniform vec2 drift; uniform vec3 sunCol;
varying vec2 vP; varying vec3 vW;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { s += a * vn(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; } return s; }
void main() {
  #include <logdepthbuf_fragment>
  if (cover < 0.005) discard;
  vec2 q = (vP + drift) / scale; q.x /= aniso;
  float n = fbm(q), th = 1.0 - cover;                      // örtü: eşiğin üstü bulut (fBm ~0,2–0,8: %100'de her yer)
  float d = smoothstep(th * 0.82 + 0.06, th * 0.82 + 0.22, n);
  float r = length(vP), e = 1.0 - smoothstep(edge * 0.55, edge, r);
  float a = d * e * op;
  a = mix(a, max(a, 0.92), inside);                         // katmanın içinde: yoğun pus
  if (a < 0.01) discard;
  // boyama: üst yüz Güneş'le aydınlık, alt yüz (alttan bakış) gölgeli ve kalınlıkla koyulaşır; gece koyu mavi-gri
  float shade = mix(0.92, 0.55 + 0.25 * (1.0 - d), below);
  vec3 col = mix(vec3(0.05, 0.06, 0.08), sunCol * shade, day);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class CloudLayers {
  // THREE: three.js modülü · parent: rampa grubu (ölçek KM, birim m)
  constructor(THREE, parent) {
    this.T = THREE; this.state = cloudState(null); this.drift = 0;
    this.meshes = LAYERS.map((L) => {
      const g = new THREE.PlaneGeometry(2 * R_EDGE, 2 * R_EDGE, 1, 1); g.rotateX(-Math.PI / 2);
      const u = { cover: { value: 0 }, op: { value: L.op }, scale: { value: L.scale }, aniso: { value: L.aniso }, edge: { value: R_EDGE }, day: { value: 1 }, sunUp: { value: 1 },
        inside: { value: 0 }, below: { value: 1 }, drift: { value: new THREE.Vector2() }, sunCol: { value: new THREE.Color(1, 1, 1) } };
      const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.position.y = L.h; m.renderOrder = 2; m.frustumCulled = false; m.visible = false; parent.add(m);
      return { L, m, u };
    });
  }
  set(state) { this.state = state; for (const k of this.meshes) { const c = state[k.L.key] || 0; k.u.cover.value = c; k.m.visible = c > 0.005; } }
  // her kare: Güneş yüksekliği (sinüs), kamera rampa çerçevesinde (m), uçuş zamanı adımı (s; rüzgâr kayması ~8 m/s)
  frame({ sunUp = 1, cam = [0, 0, 0], dt = 0 } = {}) {
    this.drift += 8 * dt;
    const day = Math.max(0, Math.min(1, (sunUp + 0.1) / 0.35)), low = Math.max(0, Math.min(1, sunUp / 0.25));
    for (const k of this.meshes) {
      const u = k.u, dy = cam[1] - k.L.h;
      u.day.value = day; u.sunUp.value = sunUp; u.drift.value.set(this.drift, 0.35 * this.drift);
      u.sunCol.value.setRGB(1.0, 0.72 + 0.28 * low, 0.5 + 0.5 * low);                 // alçak Güneş: turuncu
      u.below.value = dy < 0 ? 1 : 0; u.inside.value = Math.abs(dy) < k.L.thick / 2 ? Math.min(1, 2 * u.cover.value) : 0;
    }
  }
  dispose() { for (const k of this.meshes) { k.m.parent && k.m.parent.remove(k.m); k.m.geometry.dispose(); k.m.material.dispose(); } }
}
